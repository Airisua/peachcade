'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const SLUGS = ['2048', 'snake', 'memory-match', 'tic-tac-toe', 'minesweeper'];
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }
function ghost() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get: (t, p) => { if (p === Symbol.toPrimitive || p === 'valueOf') return () => 0; return proxy; },
    apply: () => proxy,
    set: () => true
  });
  return proxy;
}
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
async function main() {
  let fail = 0;
  for (const slug of SLUGS) {
    const file = path.join(root, 'public', 'games', slug, 'index.html');
    const exists = fs.existsSync(file);
    const size = exists ? fs.statSync(file).size : 0;
    if (!exists || size < 2000) { console.log('FAIL ' + slug + ' | file missing or < 2KB'); fail++; continue; }
    const html = fs.readFileSync(file, 'utf8');
    let syntaxOk = true;
    const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((m) => m[1]);
    if (!scripts.length) { syntaxOk = false; console.log('  no inline scripts in ' + slug); }
    for (const s of scripts) {
      try { new Function(s); } catch (e) { syntaxOk = false; console.log('  syntax error in ' + slug + ': ' + e.message); }
    }
    let boot = 'skipped (no jsdom)';
    if (JSDOM) {
      boot = 'ok';
      const errors = [];
      try {
        const dom = new JSDOM(html, {
          runScripts: 'dangerously',
          pretendToBeVisual: true,
          url: 'http://localhost/',
          beforeParse(window) {
            window.HTMLCanvasElement.prototype.getContext = () => ghost();
            window.addEventListener('error', (e) => errors.push(String((e && e.message) || e)));
          }
        });
        await sleep(320);
        const rootEl = dom.window.document.getElementById('game-root');
        if (errors.length) boot = 'errors: ' + errors.slice(0, 2).join('; ');
        else if (!rootEl) boot = 'missing #game-root';
        dom.window.close();
      } catch (e) {
        boot = 'crash: ' + e.message;
      }
    }
    const okFlag = syntaxOk && (boot === 'ok' || boot.indexOf('skipped') === 0);
    if (!okFlag) fail++;
    console.log((okFlag ? 'PASS ' : 'FAIL ') + slug + ' | ' + Math.round(size / 1024) + 'KB | syntax:' + (syntaxOk ? 'ok' : 'FAIL') + ' | jsdom-boot:' + boot);
  }
  console.log(fail ? 'GAMES CHECK FAILURES: ' + fail : 'GAMES CHECK OK (5/5)');
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error('CHECK CRASH', e); process.exitCode = 2; });

