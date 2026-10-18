'use strict';
// Peachcade smoke tests, split into independent suites so a CSS tweak does not
// need the whole run. Examples:
//   npm run smoke                 # every suite
//   npm run smoke:quick           # health + read-only sanity, ~1s
//   node scripts/smoke.js i18n    # only that suite
//   node scripts/smoke.js core --timing
//   node scripts/smoke.js --list
//   node scripts/smoke.js --fresh # throwaway DB + server, production untouched
//   node scripts/smoke.js quick --base https://peachcat.fun
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ctx, client } = require('./tests/context');

const SUITES = ['quick', 'i18n', 'core', 'games', 'user', 'ads', 'admin'];
const MODULES = {
  quick: require('./tests/quick'),
  i18n: require('./tests/i18n'),
  core: require('./tests/core'),
  games: require('./tests/games'),
  user: require('./tests/user'),
  ads: require('./tests/ads'),
  admin: require('./tests/admin')
};

function parseArgs(argv) {
  const opts = { suites: [], list: false, fresh: false, timing: false, help: false, grep: '', maxFail: 0, base: process.env.SMOKE_BASE || '' };
  const take = (i) => (i + 1 < argv.length ? argv[i + 1] : '');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list' || a === '-l') opts.list = true;
    else if (a === '--fresh') opts.fresh = true;
    else if (a === '--timing') opts.timing = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--grep' || a === '-g') { opts.grep = take(i); i++; }
    else if (a.startsWith('--grep=')) opts.grep = a.slice(7);
    else if (a === '--max-fail') { opts.maxFail = parseInt(take(i), 10) || 0; i++; }
    else if (a.startsWith('--max-fail=')) opts.maxFail = parseInt(a.slice(11), 10) || 0;
    else if (a === '--base') { opts.base = take(i); i++; }
    else if (a.startsWith('--base=')) opts.base = a.slice(7);
    else if (!a.startsWith('-')) opts.suites.push(a);
  }
  const unknown = opts.suites.filter((s) => SUITES.indexOf(s) < 0);
  if (unknown.length) {
    console.error('Unknown suite: ' + unknown.join(', '));
    console.error('Available: ' + SUITES.join(', '));
    process.exit(2);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const grepRe = opts.grep ? new RegExp(opts.grep, 'i') : null;
const failureLimit = opts.maxFail > 0 ? opts.maxFail : 0;
let pass = 0, fail = 0, skipped = 0;
const failures = [];

function ok(cond, name, extra) {
  if (grepRe && !grepRe.test(name)) { skipped++; return; }
  if (cond) { pass++; console.log('PASS ' + name); }
  else {
    fail++;
    failures.push(name);
    console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 220) : ''));
    if (failureLimit && fail >= failureLimit) throw new Error('failure limit reached');
  }
}

let JSDOM = null, VirtualConsole = null;
try {
  const jd = require('jsdom');
  JSDOM = jd.JSDOM;
  VirtualConsole = jd.VirtualConsole;
} catch (e) { /* DOM assertions are skipped without jsdom */ }

function initContext() {
  ctx.base = opts.base || ('http://localhost:' + (process.env.PORT || 3000));
  // Re-read the db module so --fresh talks to the throwaway sqlite file too.
  // Better-sqlite3 caches the file per module instance, not per DATA_DIR, so a
  // plain require() would keep the parent on the real ./data/app.db.
  const dbPath = require.resolve('../src/db');
  delete require.cache[dbPath];
  ctx.db = require('../src/db').db;
  ctx.ok = ok;
  ctx.client = client;
  ctx.user = client();
  ctx.JSDOM = JSDOM;
  ctx.VirtualConsole = VirtualConsole;
  ctx.appRoot = path.join(__dirname, '..');
}

async function runSuite(name) {
  const mod = MODULES[name];
  const started = Date.now();
  console.log('');
  console.log('=== ' + name + ' :: ' + mod.title + ' ===');
  try {
    await mod.run();
  } finally {
    if (opts.timing) console.log('    (' + name + ' took ' + (Date.now() - started) + 'ms)');
  }
}

function listSuites() {
  console.log('Smoke suites:');
  for (const s of SUITES) console.log('  ' + s.padEnd(7) + ' ' + MODULES[s].title);
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/smoke.js quick');
  console.log('  node scripts/smoke.js i18n core --timing');
  console.log('  node scripts/smoke.js --fresh');
  console.log('  node scripts/smoke.js --base https://peachcat.fun quick');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

// A throwaway server with its own sqlite file: the suites still create fixtures,
// disable ads and rewrite settings, but none of that reaches a real install.
async function withFreshServer(fn) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peachcade-smoke-'));
  opts.base = 'http://127.0.0.1:' + port;
  process.env.DATA_DIR = dir;
  console.log('Starting a throwaway server on ' + opts.base + ' (data: ' + dir + ')');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { DATA_DIR: dir, PORT: String(port), NODE_ENV: 'test', SMOKE_SEED_GAMES: '60' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const stop = () => { try { child.kill(); } catch (e) { /* already gone */ } };
  process.once('SIGINT', () => { stop(); process.exit(130); });
  try {
    let up = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(opts.base + '/healthz');
        if (r.status === 200) { up = true; break; }
      } catch (e) { /* still booting */ }
      await new Promise((res) => setTimeout(res, 200));
    }
    if (!up) throw new Error('server did not become healthy in time\n' + bootLog.slice(-2000));
    await fn();
  } finally {
    stop();
    await new Promise((res) => setTimeout(res, 300));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* Windows may still hold the sqlite file */ }
  }
}

(async function main() {
  if (opts.help || opts.list) { listSuites(); return; }
  const selected = opts.suites.length ? Array.from(new Set(opts.suites)) : SUITES.slice();
  // ads/admin write fixtures straight into the database file the runner opened.
  // With --base pointing somewhere else that file is not the one the site uses,
  // so the fixtures could never be cleaned up - refuse instead of trying.
  if (!opts.fresh && opts.base) {
    let localHost = false;
    try {
      const h = new URL(opts.base).hostname;
      localHost = h === 'localhost' || h === '127.0.0.1' || h === '::1';
    } catch (e) { localHost = false; }
    // Only these two are safe over the network: they never need to clean up a
    // fixture through the local sqlite file. Everything else creates rows.
    const READ_ONLY = ['quick', 'i18n'];
    if (!localHost) {
      const blocked = selected.filter((s) => READ_ONLY.indexOf(s) < 0);
      if (blocked.length) {
        console.error('Refusing to run ' + blocked.join(' + ') + ' against ' + opts.base + ':');
        console.error('those suites create fixtures and delete them through the local sqlite');
        console.error('file, which is a different database for a remote host, so rows would leak.');
        console.error('Remote hosts allow: ' + READ_ONLY.join(', ') + '. Use --fresh for the rest.');
        process.exit(2);
      }
    }
  }
  const started = Date.now();
  if (opts.fresh) {
    await withFreshServer(async () => {
      initContext();
      for (const s of selected) await runSuite(s);
    });
  } else {
    initContext();
    for (const s of selected) await runSuite(s);
  }
  const ms = Date.now() - started;
  console.log('');
  console.log('RESULT: pass=' + pass + ' fail=' + fail + (skipped ? ' skipped=' + skipped : '') + ' (' + ms + 'ms)');
  if (fail) {
    console.log('FAILURES: ' + failures.join(' | '));
    process.exitCode = 1;
  } else if (selected.length === 1 && selected[0] === 'quick') {
    console.log('Quick check only. Run the suite you touched, or npm run smoke before a release.');
  }
})().catch(function (e) {
  if (e && e.message === 'failure limit reached') { process.exitCode = 1; return; }
  console.error('SMOKE CRASH', e);
  process.exitCode = 2;
});
