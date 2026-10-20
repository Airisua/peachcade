'use strict';
const { ctx } = require('./context');

module.exports = {
  title: 'Game player, built-in assets, thumbnails, API',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    let r;
    let j = null;
  r = await user.get('/game/2048');
  ok(r.text.includes('og:title') && r.text.includes('rel="canonical"'), 'game page has OG tags + canonical');
  const canon = (r.text.match(/rel="canonical" href="([^"]*)"/) || [])[1] || '';
  ok(/\/game\/2048$/.test(canon), 'english canonical stays clean', canon);
  const jaClient = ctx.client();
  const rJaCanon = await jaClient.get('/game/2048?lang=ja');
  const jaCanon = (rJaCanon.text.match(/rel="canonical" href="([^"]*)"/) || [])[1] || '';
  ok(/\/game\/2048\?lang=ja$/.test(jaCanon), 'japanese canonical self-references the ja URL', jaCanon);
  ok(/hreflang="ja" href="[^"]*\?lang=ja"/.test(rJaCanon.text) && !/hreflang="zh"/.test(rJaCanon.text), 'hreflang advertises en + ja only');
  r = await user.get('/game/2048');
  ok(r.status === 200 && r.text.includes('/games/2048/'), 'game page embeds iframe', r.status);
  ok(r.text.includes('rating-pill') && r.text.includes('ic-gold'), 'game page has visual rating badge');
  ok(r.text.includes('data-theater') && r.text.includes('i-theater'), 'game page has theater mode button');
  ok(r.text.includes('FAQPage'), 'game page includes FAQPage rich schema');
  ok(r.text.includes('AggregateRating'), 'game page includes aggregateRating schema for Google stars');
  ok(r.text.includes('game-specs') && r.text.includes('Game Specifications'), 'game page shows visible game specifications', r.status);
  ok(r.text.includes('Times played') && /<span class="specs-val">[^<]*plays/.test(r.text), 'specs carry real play and release facts');
  ok(!/<p>—<\/p>/.test(r.text), 'no placeholder dash where provider copy is missing');
  ok(r.text.includes('game-faq') && r.text.includes('Can I play 2048 on mobile and tablet?'), 'game page renders the game FAQ visibly', r.status);
  // cross-category rails need a game outside the category that shares a tag
  const { db } = require('../../src/db');
  const simIds = [];
  const insSim = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,tags,published,updated_at) VALUES(?,?,?,?,?,?,?,1,datetime('now'))");
  for (let i = 1; i <= 3; i++) {
    simIds.push(insSim.run('sim-fixture-' + i, 'Similar Fixture ' + i, 'arcade', '/img/games/default.svg', '/games/snake/', 'smoke', 'number,merge').lastInsertRowid);
  }
  try {
    const rSim = await user.get('/game/2048');
    ok(rSim.text.includes('You may also like') && /href="\/game\/sim-fixture-/.test(rSim.text), 'game page links cross-category similar games');
  } finally {
    for (const id of simIds) db.prepare('DELETE FROM games WHERE id=?').run(id);
  }
  ok(r.text.includes('back-to-top'), 'page includes back-to-top button');
  ok(r.text.includes('mobile-bottom-nav') && r.text.includes('mobile-nav-item'), 'page includes mobile bottom navigation bar');
  for (const slug of ['2048', 'snake', 'memory-match', 'tic-tac-toe', 'minesweeper']) {
    r = await user.get('/games/' + slug + '/index.html');
    ok(r.status === 200 && r.text.includes('game-root'), 'game file ' + slug, r.status);
    r = await user.get('/img/games/' + slug + '.svg');
    ok(r.status === 200 && r.text.includes('<svg'), 'thumb ' + slug, r.status);
  }
  // thumbnails: built-in games keep their local asset, provider images go through the
  // resize proxy (or fall back to the original url when the provider is unreachable)
  r = await user.get('/thumb/2048.card.jpg');
  ok(r.status === 302 && r.location.indexOf('/img/games/2048.svg') >= 0, 'local thumbnail redirects to the asset', r.status + ' ' + r.location);
  ok((r.headers.get('cache-control') || '').includes('immutable'), 'local thumbnail redirect is immutable-cacheable', r.headers.get('cache-control'));
  r = await user.get('/thumb/does-not-exist.card.jpg');
  ok(r.status === 404, 'unknown thumbnail slug is a 404', r.status);
  r = await user.get('/thumb/2048.bogus.jpg');
  ok(r.status === 404, 'unknown thumbnail size is a 404', r.status);
  // pick a provider-backed game that actually exists in this catalogue (a fresh
  // install has no imported games, so the old hard-coded slug 404s there)
  const providerGame = ctx.db.prepare("SELECT slug FROM games WHERE thumb NOT LIKE '/img/%' AND thumb LIKE 'http%' ORDER BY id LIMIT 1").get();
  if (providerGame) {
    r = await user.req('HEAD', '/thumb/' + providerGame.slug + '.card.jpg');
    ok(r.status === 200 || r.status === 302, 'provider thumbnail is resized (200) or falls back (302)', r.status);
  } else {
    ok(true, 'provider thumbnail check skipped (no imported games)');
  }
  // the derivative cache must stay bounded and remember recent failures
  const thumbCache = require('../../src/thumbs');
  ok(typeof thumbCache.pruneCache === 'function' && typeof thumbCache.cacheStats === 'function', 'thumbnail cache exposes stats + prune');
  const cacheInfo = thumbCache.cacheStats();
  ok(cacheInfo.files >= 0 && Number.isFinite(cacheInfo.bytes), 'thumbnail cache stats are usable', JSON.stringify(cacheInfo));
  const pruned = thumbCache.pruneCache();
  ok(pruned && typeof pruned.removed === 'number' && pruned.files <= Math.max(thumbCache.MAX_CACHE_FILES, cacheInfo.files), 'thumbnail cache prune keeps the cache bounded', JSON.stringify(pruned));
  r = await user.get('/');
  // A seeded install only has local svg thumbnails, so the resize proxy markup is
  // only meaningful once provider games are imported - check it when they exist.
  const hasRemoteThumbs = !!ctx.db.prepare("SELECT 1 FROM games WHERE thumb LIKE 'http%' LIMIT 1").get();
  if (hasRemoteThumbs) {
    ok(/src="\/thumb\/[a-z0-9-]+\.card\.jpg"/.test(r.text), 'cards use the resize proxy');
    ok(/src="\/thumb\/[a-z0-9-]+\.hero\.jpg"/.test(r.text) || /src="\/img\/games\/[a-z0-9-]+\.svg"/.test(r.text), 'hero image is served locally (proxy or built-in asset)');
    ok(/src="\/thumb\/[a-z0-9-]+\.cat\.jpg"/.test(r.text), 'category chips use the resize proxy');
  } else {
    ok(true, 'thumbnail resize markup check skipped (no imported games)');
  }
  r = await user.get('/api/games?q=snake');
  try { j = JSON.parse(r.text); } catch (e) {}
  ok(r.status === 200 && j && j.games.length >= 1, 'api games search', r.status);
  }
};
