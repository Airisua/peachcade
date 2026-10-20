'use strict';
// Submit URLs to IndexNow (Bing, Yandex, Seznam, etc.) for instant crawling.
// Usage:
//   node scripts/indexnow.js
//   node scripts/indexnow.js --limit 100
//
const { db } = require('../src/db');

const HOST = process.env.INDEXNOW_HOST || 'peachcat.fun';
const BASE_URL = 'https://' + HOST;
const KEY = process.env.INDEXNOW_KEY || '2771545fc9c14828b056ff3f18e9f50e';
const KEY_LOCATION = BASE_URL + '/' + KEY + '.txt';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next && next.indexOf('--') !== 0 ? next : true;
}

const LIMIT = Math.min(10000, Math.max(1, parseInt(arg('limit', 200), 10) || 200));

async function main() {
  const cats = db.prepare('SELECT slug FROM categories ORDER BY sort').all();
  const games = db.prepare('SELECT slug FROM games WHERE published=1 ORDER BY plays DESC, id DESC LIMIT ?').all(LIMIT);

  const tagHubs = require('../src/tags');
  const urlList = [
    BASE_URL + '/',
    BASE_URL + '/games',
    BASE_URL + '/tags',
    BASE_URL + '/about',
    BASE_URL + '/privacy',
    BASE_URL + '/terms'
  ].concat(cats.map((c) => BASE_URL + '/category/' + c.slug))
   .concat(tagHubs.all().map((t) => BASE_URL + '/tag/' + encodeURIComponent(t.slug)))
   .concat(games.map((g) => BASE_URL + '/game/' + g.slug));

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList
  };

  console.log(`Submitting ${urlList.length} URLs to IndexNow for host: ${HOST}...`);
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log(`IndexNow response status: ${res.status} ${res.statusText}`);
    if (res.status === 200 || res.status === 202) {
      console.log('SUCCESS: URLs submitted to IndexNow successfully!');
    } else {
      const text = await res.text();
      console.log('IndexNow returned:', text);
    }
  } catch (err) {
    console.error('IndexNow submission failed:', err.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, KEY };
