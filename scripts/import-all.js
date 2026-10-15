'use strict';
// Bulk import straight from a game feed into the database.
//
// The admin preview is limited to a few pages per click and the provider rate-limits
// bursts, which is why importing a large catalogue through the UI is painful. This
// script walks the feed politely instead: a delay between pages, exponential backoff on
// HTTP 429, dedupe against what is already stored, and a resumable cursor so a long run
// can survive a restart.
//
//   node scripts/import-all.js --pages 20 --publish
//   node scripts/import-all.js --start 21 --delay 6000 --pages 100
//   node scripts/import-all.js --drafts --max-empty 3
//
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next && next.indexOf('--') !== 0 ? next : true;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOG_FILE = String(arg('log', path.join(DATA_DIR, 'import-all.log')));
const STATE_FILE = String(arg('state', path.join(DATA_DIR, 'import-all.state.json')));

const START = Math.max(1, parseInt(arg('start', 1), 10) || 1);
const PAGES = Math.max(0, parseInt(arg('pages', 0), 10) || 0);
const DELAY = Math.max(0, parseInt(arg('delay', 5000), 10));
const NUM = Math.min(48, Math.max(1, parseInt(arg('num', 48), 10) || 48));
const MAX_EMPTY = Math.max(1, parseInt(arg('max-empty', 4), 10) || 4);
const EMPTY_RETRIES = Math.max(1, parseInt(arg('empty-retries', 4), 10) || 4);
const PUBLISH = !arg('drafts', false);
const MAX_ATTEMPTS = 6;

const { db } = require('../src/db');
const providers = require('../src/providers');
db.pragma('busy_timeout = 10000');

function log(line) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const out = '[' + stamp + '] ' + line;
  console.log(out);
  try { fs.appendFileSync(LOG_FILE, out + '\n'); } catch (e) { /* logging must never break the import */ }
}

function saveState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  } catch (e) { /* ignore */ }
}

async function loadPage(page) {
  let wait = 30000;
  let empties = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await providers.fetchGames({ provider: 'gamemonetize', num: NUM, page: page });
      const items = res.items || [];
      if (items.length) return items;
      // the feed answers with an empty body every now and then (throttling); the first few
      // empty answers must not be mistaken for the end of the catalogue
      empties++;
      if (empties >= EMPTY_RETRIES) return items;
      log('page ' + page + ': empty answer ' + empties + '/' + EMPTY_RETRIES + ' - retrying in 20s');
      await sleep(20000);
    } catch (e) {
      const status = (e && e.status) || 0;
      log('page ' + page + ' attempt ' + attempt + '/' + MAX_ATTEMPTS + ' failed: ' + e.message + ' - waiting ' + Math.round(wait / 1000) + 's');
      if (attempt === MAX_ATTEMPTS) throw e;
      await sleep(status === 429 ? wait : Math.min(wait, 15000));
      wait = Math.min(wait * 2, 8 * 60 * 1000);
    }
  }
  return [];
}

async function main() {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort').all();
  const check = db.prepare('SELECT 1 FROM games WHERE slug=? OR embed_url=?');
  const ins = db.prepare('INSERT INTO games(slug,title_en,title_zh,desc_en,desc_zh,howto_en,howto_zh,category,tags,thumb,embed_url,source,featured,published) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)');
  const totalRow = db.prepare('SELECT COUNT(*) n FROM games').get();

  log('bulk import start: page ' + START + (PAGES ? ' for ' + PAGES + ' page(s)' : ' until the feed runs dry') +
    ' | delay ' + DELAY + 'ms | ' + (PUBLISH ? 'published' : 'as drafts') + ' | db has ' + totalRow.n + ' games');

  let page = START;
  let imported = 0;
  let scanned = 0;
  let emptyStreak = 0;
  let lastNewTitle = '';

  for (;;) {
    if (PAGES && page >= START + PAGES) break;
    let items;
    try {
      items = await loadPage(page);
    } catch (e) {
      log('page ' + page + ' skipped after repeated failures: ' + e.message);
      saveState({ nextPage: page, imported, scanned, stoppedAt: page, reason: 'feed error', updatedAt: new Date().toISOString() });
      break;
    }
    scanned++;
    let added = 0;
    const tx = db.transaction(() => {
      for (const it of items) {
        const slug = providers.slugFor('gamemonetize', it);
        if (check.get(slug, it.url)) continue;
        ins.run(
          slug,
          it.title,
          '',
          String(it.description || '').slice(0, 500),
          '',
          String(it.instructions || '').slice(0, 2000),
          '',
          providers.mapCategory(it.category, cats, it.tags),
          providers.tagsFor('gamemonetize', it.tags),
          it.thumb || '/img/games/default.svg',
          it.url,
          'gamemonetize',
          PUBLISH ? 1 : 0
        );
        added++;
        lastNewTitle = it.title || '';
      }
    });
    tx();
    imported += added;
    log('page ' + page + ': ' + items.length + ' item(s), ' + added + ' new (total new ' + imported + ')');
    saveState({ nextPage: page + 1, imported, scanned, lastNewTitle, updatedAt: new Date().toISOString() });
    page++;
    // Only stop when the feed itself stops answering: pages that merely contain nothing new
    // are normal while walking a catalogue that is already partly imported.
    if (items.length > 0) emptyStreak = 0; else emptyStreak++;
    if (emptyStreak >= MAX_EMPTY) {
      log('stopping: ' + emptyStreak + ' page(s) in a row returned nothing at all');
      break;
    }
    if (DELAY) await sleep(DELAY);
  }

  const after = db.prepare('SELECT COUNT(*) n FROM games').get();
  log('bulk import done: pages scanned ' + scanned + ', new games ' + imported + ', db now ' + after.n + ' games' + (lastNewTitle ? ' | last new: ' + lastNewTitle : ''));
}

main().catch((e) => {
  log('bulk import crashed: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 2;
});
