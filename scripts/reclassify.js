'use strict';
// Re-sorts already imported games into the (expanded) category set.
//
// The provider's own category is the most reliable signal, but the importer only stored the
// mapped category. This tool therefore re-reads the provider feed (or a saved feed dump) to
// recover the original category for every game that still appears in it, and falls back to
// the genre keywords in the game title / tags for everything else.
//
//   node scripts/reclassify.js                      # dry run: show the planned changes
//   node scripts/reclassify.js --apply              # write the changes
//   node scripts/reclassify.js --feed-file <path>   # use a saved feed dump instead of fetching
//   node scripts/reclassify.js --pages 4 --delay 8000
//
const fs = require('fs');
const { db } = require('../src/db');
const providers = require('../src/providers');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next && next.indexOf('--') !== 0 ? next : true;
}

function feedCategoryMap(text, map) {
  for (const block of String(text).split(/<item>/).slice(1)) {
    const id = (block.match(/<id>([\s\S]*?)<\/id>/i) || [, ''])[1].trim();
    const cat = (block.match(/<category>([\s\S]*?)<\/category>/i) || [, ''])[1].trim();
    if (id) map[id] = cat;
  }
  return map;
}

async function loadFeed(map, pages, delay) {
  for (let page = 1; page <= pages; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await providers.fetchGames({ provider: 'gamemonetize', page, num: 48 });
      const before = Object.keys(map).length;
      for (const it of res.items || []) if (it.sourceId) map[String(it.sourceId)] = it.category || '';
      console.log('  page ' + page + ': +' + (Object.keys(map).length - before) + ' feed categories');
    } catch (e) {
      console.log('  page ' + page + ' failed: ' + e.message);
    }
  }
  return map;
}

async function main() {
  const apply = !!arg('apply', false);
  const feedFile = arg('feed-file', '');
  const pages = Math.max(0, parseInt(arg('pages', 4), 10) || 0);
  const delay = Math.max(0, parseInt(arg('delay', 8000), 10) || 0);
  const quiet = !!arg('quiet', false);

  const categories = db.prepare('SELECT slug, name_en FROM categories ORDER BY sort').all();
  const known = categories.map((c) => c.slug);
  const feedCats = {};
  if (feedFile && feedFile !== true) {
    if (!fs.existsSync(feedFile)) {
      console.error('feed file not found: ' + feedFile);
      process.exitCode = 2;
      return;
    }
    feedCategoryMap(fs.readFileSync(feedFile, 'utf8'), feedCats);
    console.log('feed dump: ' + Object.keys(feedCats).length + ' games');
  } else if (pages) {
    console.log('fetching ' + pages + ' feed page(s)...');
    await loadFeed(feedCats, pages, delay);
  }

  const games = db.prepare('SELECT id, slug, title_en, category, tags, featured FROM games ORDER BY id').all();
  const before = {};
  const after = {};
  const changes = [];
  for (const g of games) {
    before[g.category] = (before[g.category] || 0) + 1;
    const m = g.slug.match(/-gm-(\d+)$/);
    const raw = m && feedCats[m[1]] ? feedCats[m[1]] : '';
    let target = providers.mapCategory(raw, categories, g.title_en + ' ' + g.tags);
    if (known.indexOf(target) < 0) target = 'casual';
    after[target] = (after[target] || 0) + 1;
    if (target !== g.category) changes.push({ id: g.id, title: g.title_en, from: g.category, to: target, raw: raw || '-' });
  }

  if (!quiet) {
    for (const c of known) {
      const rows = changes.filter((x) => x.to === c);
      if (!rows.length) continue;
      console.log('');
      console.log('-> ' + c + ' (' + rows.length + ')');
      for (const r of rows) console.log('   #' + r.id + ' ' + r.from + ' -> ' + c + ' [' + r.raw + '] ' + r.title);
    }
  }
  console.log('');
  console.log('before: ' + JSON.stringify(before));
  console.log('after : ' + JSON.stringify(after));
  console.log((apply ? 'applying ' : 'planned ') + changes.length + ' category change(s)');

  if (!apply) {
    console.log('dry run only - re-run with --apply to write the changes');
    return;
  }
  const upd = db.prepare('UPDATE games SET category=? WHERE id=?');
  const tx = db.transaction((rows) => { for (const r of rows) upd.run(r.to, r.id); });
  tx(changes);
  console.log('done: ' + changes.length + ' game(s) reclassified');
}

main().catch((e) => {
  console.error('reclassify failed: ' + e.message);
  process.exitCode = 2;
});
