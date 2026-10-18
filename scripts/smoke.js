'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
let JSDOM = null, VirtualConsole = null;
try { const jd = require('jsdom'); JSDOM = jd.JSDOM; VirtualConsole = jd.VirtualConsole; } catch (e) { JSDOM = null; }
const { db } = require('../src/db');
const { featuredRotation, gt } = require('../src/queries');
const BASE = process.env.SMOKE_BASE || ('http://localhost:' + (process.env.PORT || 3000));
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 220) : '')); }
}
function extractId(text, prefix) {
  let idx = 0;
  while (true) {
    const i = text.indexOf(prefix, idx);
    if (i < 0) return null;
    let j = i + prefix.length, d = '';
    while (j < text.length && text[j] >= '0' && text[j] <= '9') { d += text[j]; j++; }
    if (d) return d;
    idx = i + 1;
  }
}
function client() {
  const jar = new Map();
  async function req(method, path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    let body;
    if (opts.form) {
      const usp = new URLSearchParams();
      for (const k of Object.keys(opts.form)) {
        const v = opts.form[k];
        if (Array.isArray(v)) v.forEach(function (x) { usp.append(k, x); });
        else usp.set(k, v);
      }
      body = usp.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    if (jar.size) headers.cookie = Array.from(jar.entries()).map(function (e) { return e[0] + '=' + e[1]; }).join('; ');
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const setc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of setc) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await r.text();
    return { status: r.status, text, location: r.headers.get('location') || '' };
  }
  return {
    req, jar,
    get: (p) => req('GET', p),
    post: (p, form, opts) => req('POST', p, Object.assign({ form }, opts)),
    csrf: () => jar.get('csrf') || ''
  };
}
(async function () {
  db.prepare("UPDATE games SET published=1 WHERE slug IN ('2048', 'snake', 'memory-match', 'tic-tac-toe', 'minesweeper')").run();
  db.prepare("UPDATE settings SET value='1' WHERE key='ezoic_enabled'").run();
  db.prepare("DELETE FROM ads WHERE title='Smoke Ad'").run();
  const user = client();
  ok(gt({ title_en: 'CatchFish &mdash; Fishing Master' }) === 'CatchFish — Fishing Master', 'entity decoding decodes named mdash entity');
  ok(gt({ title_en: 'Double &amp;mdash; test &#8212;' }) === 'Double — test —', 'entity decoding decodes double-encoded and numeric entities');
  let r = await user.get('/');
  ok(r.status === 200 && r.text.includes('/game/2048') && !r.text.includes('热门游戏'), 'home renders EN with games', r.status);
  ok(r.text.includes('Peachcade'), 'home renders new brand name Peachcade');
  ok(r.text.includes('cmp.gatekeeperconsent.com') && r.text.includes('ezstandalone'), 'home includes Ezoic privacy & header scripts');
  r = await user.get('/lang/zh?next=/');
  ok(r.status === 302, 'lang switch to zh', r.status);
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('热门游戏'), 'home renders ZH', r.status);
  r = await user.get('/lang/ja?next=/');
  ok(r.status === 302, 'lang switch to ja', r.status);
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('いま人気のゲーム') && r.text.includes('lang="ja"'), 'home renders JA with localized headings', r.status);
  r = await user.get('/game/snake');
  ok(r.status === 200 && r.text.includes('スネーク クラシック'), 'game detail renders Japanese title in JA mode');
  r = await user.get('/about');
  ok(r.status === 200 && r.text.includes('Peachcadeについて'), 'about page renders Japanese in JA mode');
  r = await user.get('/rewards');
  ok(r.status === 200 && r.text.includes('cdnnd.com/wall/KDhq') && r.text.includes('iframe'), 'rewards page embeds CPAlead offerwall', r.status);
  // CPAlead Postback test
  r = await user.get('/api/postback/cpalead?lead_id=smoke-lead-123&subid=testuser&payout=1.25&campaign_id=999&campaign_name=SmokeOffer&password=peachcade123');
  ok(r.status === 200 && r.text === 'OK', 'cpalead postback accepts valid lead', r.status);
  r = await user.get('/api/postback/cpalead?lead_id=smoke-lead-123&subid=testuser&payout=1.25&campaign_id=999&campaign_name=SmokeOffer&password=peachcade123');
  ok(r.status === 200 && r.text === 'OK', 'cpalead postback handles duplicate lead_id idempotently', r.status);
  const leadRow = db.prepare('SELECT * FROM cpa_leads WHERE lead_id=?').get('smoke-lead-123');
  ok(leadRow && leadRow.payout === 1.25 && leadRow.subid === 'testuser', 'lead recorded in database');
  db.prepare('DELETE FROM cpa_leads WHERE lead_id=?').run('smoke-lead-123');
  r = await user.get('/lang/en?next=/');
  ok(r.status === 302, 'lang switch back to en', r.status);
  r = await user.get('/games');
  ok(r.status === 200 && r.text.includes('/game/snake'), 'games listing page', r.status);
  // pager: sliding window of page numbers plus first/last shortcuts (one partial shared by
  // the all-games and category listings). Needs more than one page of games, so a few
  // temporary published fixtures are added for the check and removed afterwards.
  const pagerIds = [];
  const pagerIns = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,published) VALUES(?,?,?,?,?,?,1)");
  for (let i = 1; i <= 52; i++) {
    pagerIds.push(pagerIns.run('pager-fixture-' + i, 'Pager Fixture ' + i, 'puzzle', '/img/games/default.svg', 'https://example.com/pager/' + i, 'smoke').lastInsertRowid);
  }
  try {
    r = await user.get('/games');
    ok(r.text.includes('class="pagination"') && r.text.includes('class="pg pg-on" aria-current="page"'), 'pager renders a numbered window', r.status);
    ok(/href="\/games\?[^"]*page=2"/.test(r.text), 'pager links to the next page');
    ok(/class="pg pg-edge"/.test(r.text), 'pager has first/last shortcuts');
    r = await user.get('/games?page=2');
    ok(r.status === 200 && r.text.includes('aria-current="page">2<'), 'pager marks the current page', r.status);
    ok(/href="\/games\?[^"]*page=1"/.test(r.text), 'pager links back to page one');
    r = await user.get('/category/puzzle');
    ok(r.text.includes('class="pagination"'), 'category listing uses the same pager', r.status);
    r = await user.get('/lang/zh?next=/games');
    r = await user.get('/games');
    ok(/首页/.test(r.text) && /末页/.test(r.text), 'pager shows localised first/last labels');
    r = await user.get('/lang/ja?next=/games');
    r = await user.get('/games');
    ok(/先頭/.test(r.text) && /末尾/.test(r.text), 'pager shows Japanese first/last labels');
    r = await user.get('/lang/en?next=/games');
  } finally {
    for (const id of pagerIds) db.prepare('DELETE FROM games WHERE id=?').run(id);
  }
  r = await user.get('/search?q=snake');
  ok(r.status === 200 && r.text.includes('Snake Classic'), 'search page', r.status);
  r = await user.get('/category/puzzle');
  ok(r.status === 200 && r.text.includes('Minesweeper'), 'category page', r.status);
  for (const slug of ['racing', 'shooting', 'sports', 'platform', 'adventure', 'simulation', 'clicker', 'girls']) {
    r = await user.get('/category/' + slug);
    ok(r.status === 200, 'category page ' + slug, r.status);
  }
  // structured data (JSON-LD) - search engines only accept valid JSON, so parse it here
  function ldBlocks(html) {
    return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
      try { return JSON.parse(m[1]); } catch (e) { return null; }
    });
  }
  r = await user.get('/');
  const homeLd = ldBlocks(r.text);
  ok(homeLd.length > 0 && homeLd.every(Boolean) && homeLd.some((b) => b['@type'] === 'WebSite' && b.potentialAction && b.alternateName && b.alternateName.includes('PeachCat Games')), 'home has WebSite + SearchAction + alternateName JSON-LD', JSON.stringify(homeLd.map((b) => b && b['@type'])));
  r = await user.get('/game/2048');
  const gameLd = ldBlocks(r.text);
  ok(gameLd.length > 0 && gameLd.every(Boolean) && gameLd.some((b) => b['@type'] === 'VideoGame' && b.name === '2048' && b.offers), 'game page has valid VideoGame JSON-LD');
  ok(gameLd.some((b) => b['@type'] === 'BreadcrumbList' && b.itemListElement.length >= 2), 'game page has a BreadcrumbList');
  r = await user.get('/category/puzzle');
  const catLd = ldBlocks(r.text);
  ok(catLd.every(Boolean) && catLd.some((b) => b['@type'] === 'CollectionPage' && b.mainEntity && b.mainEntity.numberOfItems >= 1), 'category page has a CollectionPage ItemList');
  ok(/<meta name="description" content="Free Puzzle games/.test(r.text), 'category page has its own meta description', (r.text.match(/<meta name="description" content="([^"]*)"/) || [])[1]);
  r = await user.get('/search?q=snake');
  ok(/<meta name="robots" content="noindex">/.test(r.text), 'search results are noindex');
  // Sitemap Index & sub-sitemaps
  r = await user.get('/sitemap.xml');
  ok(r.status === 200 && r.text.includes('<sitemapindex') && r.text.includes('/sitemap-main.xml') && r.text.includes('/sitemap-games-1.xml'), 'sitemap.xml serves sitemapindex', r.status);
  let rMain = await user.get('/sitemap-main.xml');
  ok(rMain.status === 200 && rMain.text.includes('<urlset') && rMain.text.includes('/category/puzzle'), 'sitemap-main.xml lists main pages and categories');
  let rTags = await user.get('/sitemap-tags.xml');
  ok(rTags.status === 200 && rTags.text.includes('<urlset') && rTags.text.includes('/tag/'), 'sitemap-tags.xml lists popular tag URLs');
  let rGames1 = await user.get('/sitemap-games-1.xml');
  ok(rGames1.status === 200 && rGames1.text.includes('<urlset') && rGames1.text.includes('/game/2048'), 'sitemap-games-1.xml lists game URLs');
  // Tag landing page
  let rTagPage = await user.get('/tag/puzzle');
  ok(rTagPage.status === 200 && rTagPage.text.includes('/game/2048') && !rTagPage.text.includes('noindex'), 'tag landing page /tag/puzzle is indexable and lists games');
  ok(rTagPage.text.includes('BreadcrumbList') && rTagPage.text.includes('CollectionPage'), 'tag landing page has collection and breadcrumbs schema');
  // Query-param language switching without cookie
  let rLangQuery = await client().get('/?lang=zh');
  ok(rLangQuery.status === 200 && rLangQuery.text.includes('热门游戏'), 'query param ?lang=zh overrides language for crawlers');
  let rLangJa = await client().get('/?lang=ja');
  ok(rLangJa.status === 200 && rLangJa.text.includes('いま人気のゲーム'), 'query param ?lang=ja overrides language for crawlers');
  // IndexNow verification key endpoint
  let rIndexNow = await user.get('/2771545fc9c14828b056ff3f18e9f50e.txt');
  ok(rIndexNow.status === 200 && rIndexNow.text.includes('2771545fc9c14828b056ff3f18e9f50e'), 'IndexNow key file is served');
  // HilltopAds verification key endpoint
  let rHilltop = await user.get('/881a8f0468df8b90a945.txt');
  ok(rHilltop.status === 200 && rHilltop.text.includes('c1d8ffff883b0dd31fc6'), 'HilltopAds key file is served');
  r = await user.get('/robots.txt');
  ok(r.status === 200 && r.text.includes('Sitemap:') && r.text.includes('Disallow: /wyj/'), 'robots.txt guards admin and references sitemap', r.status);
  r = await user.get('/manifest.webmanifest');
  ok(r.status === 200 && r.text.includes('Peachcade'), 'manifest.webmanifest served as PWA app config', r.status);
  r = await user.get('/');
  ok(r.text.includes('cat-card'), 'home shows category strip');
  ok(r.text.includes('hreflang="en"') && r.text.includes('hreflang="zh"') && r.text.includes('hreflang="ja"'), 'head includes hreflang alternates');
  ok(r.text.includes('name="881a8f0468df8b90a945c1d8ffff883b0dd31fc6"'), 'home includes HilltopAds verification meta tag');
  // every static asset URL carries ?v=<hash> so a CDN / browser cache can never serve the
  // previous build after a release
  ok(/\/css\/style\.css\?v=[0-9a-f]{6,}/.test(r.text), 'stylesheet url is versioned');
  ok(/\/js\/main\.js\?v=[0-9a-f]{6,}/.test(r.text), 'script url is versioned');
  ok(/\/img\/icons\.svg\?v=[0-9a-f]{6,}#i-/.test(r.text), 'icon sprite url is versioned');
  // regression guard: a helper that builds the sprite url itself must version it too,
  // otherwise a CDN-cached previous sprite silently renders empty icons
  const spriteRefs = [...r.text.matchAll(/\/img\/icons\.svg[^"'#)\s]*/g)].map((m) => m[0]);
  const unversioned = spriteRefs.filter((u) => !/\?v=[0-9a-f]{6,}$/.test(u));
  ok(spriteRefs.length > 0 && unversioned.length === 0, 'every icon sprite reference is versioned', unversioned.slice(0, 3).join(' '));
  ok(r.text.includes('cat-thumb') && r.text.includes('cat-glyph'), 'category cards show a game cover + category glyph');
  // homepage featured section: admin picks rotate randomly, and without any admin pick the
  // section falls back to a random mix of the most popular / best rated games
  function featuredSlugs(html) {
    const start = html.indexOf('<h2>Featured</h2>');
    if (start < 0) return [];
    const end = html.indexOf('</section>', start);
    return [...html.slice(start, end === -1 ? html.length : end).matchAll(/\/game\/([a-z0-9-]+)"/g)].map((m) => m[1]);
  }
  const originalFeatured = db.prepare('SELECT id FROM games WHERE featured=1').all().map((x) => x.id);
  const extraFeatured = db.prepare('SELECT id FROM games WHERE published=1 AND featured=0 ORDER BY id LIMIT 3').all().map((x) => x.id);
  for (const id of extraFeatured) db.prepare('UPDATE games SET featured=1 WHERE id=?').run(id);
  const featuredSet = db.prepare('SELECT slug FROM games WHERE published=1 AND featured=1').all().map((x) => x.slug);
  let featuredOnly = true;
  const featuredOrders = new Set();
  for (let i = 0; i < 5; i++) {
    r = await user.get('/');
    const slugs = featuredSlugs(r.text);
    if (!slugs.length || slugs.some((s) => featuredSet.indexOf(s) < 0)) featuredOnly = false;
    featuredOrders.add(slugs.join(','));
  }
  ok(featuredOnly, 'featured row only lists published featured games', [...featuredOrders].join(' | '));
  ok(featuredSet.length < 4 || featuredOrders.size >= 2, 'admin featured picks rotate between visits', [...featuredOrders].join(' | '));
  db.prepare('UPDATE games SET featured=0').run();
  try {
    const pool = db.prepare('SELECT id FROM games WHERE published=1 ORDER BY plays DESC, id ASC LIMIT 24').all()
      .concat(db.prepare('SELECT id FROM games WHERE published=1 ORDER BY likes DESC, id ASC LIMIT 24').all())
      .map((x) => x.id);
    const poolIds = new Set(pool);
    const picks = featuredRotation(8);
    ok(picks.length > 0 && picks.every((g) => poolIds.has(g.id)), 'fallback featured picks come from popular + top rated', JSON.stringify(picks.map((g) => g.id)));
    ok(new Set(picks.map((g) => g.id)).size === picks.length, 'fallback featured picks are unique');
    const fallbackOrders = new Set();
    for (let i = 0; i < 4; i++) fallbackOrders.add(featuredRotation(8).map((g) => g.id).join(','));
    ok(picks.length < 3 || fallbackOrders.size >= 2, 'fallback featured rotation is randomized', [...fallbackOrders].join(' | '));
    r = await user.get('/');
    ok(featuredSlugs(r.text).length > 0, 'homepage keeps a featured row when nothing is featured', r.status);
  } finally {
    for (const id of originalFeatured) db.prepare('UPDATE games SET featured=1 WHERE id=?').run(id);
  }
  r = await user.get('/game/2048');
  ok(r.text.includes('og:title') && r.text.includes('rel="canonical"'), 'game page has OG tags + canonical');
  r = await user.get('/game/2048');
  ok(r.status === 200 && r.text.includes('/games/2048/'), 'game page embeds iframe', r.status);
  ok(r.text.includes('rating-pill') && r.text.includes('ic-gold'), 'game page has visual rating badge');
  ok(r.text.includes('data-theater') && r.text.includes('i-theater'), 'game page has theater mode button');
  ok(r.text.includes('FAQPage'), 'game page includes FAQPage rich schema');
  ok(r.text.includes('AggregateRating'), 'game page includes aggregateRating schema for Google stars');
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
  r = await user.get('/thumb/does-not-exist.card.jpg');
  ok(r.status === 404, 'unknown thumbnail slug is a 404', r.status);
  r = await user.get('/thumb/2048.bogus.jpg');
  ok(r.status === 404, 'unknown thumbnail size is a 404', r.status);
  r = await user.req('HEAD', '/thumb/grave-blast-gm-87711.card.jpg');
  ok(r.status === 200 || r.status === 302, 'provider thumbnail is resized (200) or falls back (302)', r.status);
  // the derivative cache must stay bounded and remember recent failures
  const thumbCache = require('../src/thumbs');
  ok(typeof thumbCache.pruneCache === 'function' && typeof thumbCache.cacheStats === 'function', 'thumbnail cache exposes stats + prune');
  const cacheInfo = thumbCache.cacheStats();
  ok(cacheInfo.files >= 0 && Number.isFinite(cacheInfo.bytes), 'thumbnail cache stats are usable', JSON.stringify(cacheInfo));
  const pruned = thumbCache.pruneCache();
  ok(pruned && typeof pruned.removed === 'number' && pruned.files <= Math.max(thumbCache.MAX_CACHE_FILES, cacheInfo.files), 'thumbnail cache prune keeps the cache bounded', JSON.stringify(pruned));
  r = await user.get('/');
  ok(/src="\/thumb\/[a-z0-9-]+\.card\.jpg"/.test(r.text), 'cards use the resize proxy');
  ok(/src="\/thumb\/[a-z0-9-]+\.hero\.jpg"/.test(r.text) || /src="\/img\/games\/[a-z0-9-]+\.svg"/.test(r.text), 'hero image is served locally (proxy or built-in asset)');
  ok(/src="\/thumb\/[a-z0-9-]+\.cat\.jpg"/.test(r.text), 'category chips use the resize proxy');
  r = await user.get('/api/games?q=snake');
  let j = null;
  try { j = JSON.parse(r.text); } catch (e) {}
  ok(r.status === 200 && j && j.games.length >= 1, 'api games search', r.status);
  await user.get('/register');
  const uname = 'smoke_' + Date.now().toString().slice(-8);
  let resp = await user.post('/register', { _csrf: user.csrf(), username: uname, email: uname + '@example.com', password: 'smoke123' });
  ok(resp.status === 302 && resp.location.indexOf('ok=registered') >= 0, 'register works', resp.status + ' ' + resp.location);
  r = await user.get('/profile');
  ok(r.status === 200 && r.text.includes(uname), 'profile shows username', r.status);
  ok(r.text.includes('profile-contact'), 'profile renders contact email row');
  const newEmail = 'updated_' + uname + '@example.com';
  resp = await user.post('/profile/email', { _csrf: user.csrf(), email: newEmail });
  ok(resp.status === 302, 'profile email update post works', resp.status);
  r = await user.get('/profile');
  ok(r.status === 200 && r.text.includes(newEmail), 'profile displays updated email');
  r = await user.get('/about');
  ok(r.status === 200 && r.text.includes('wyjv58787@gmail.com'), 'about page displays official contact email');
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('wyjv58787@gmail.com'), 'footer displays contact email');
  r = await user.post('/api/like/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.liked === true && typeof j.likes === 'number', 'like on', r.status + ' ' + r.text.slice(0, 80));
  r = await user.post('/api/like/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.liked === false, 'like off', r.status);
  r = await user.post('/api/favorite/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.favorited === true, 'favorite on', r.status);
  r = await user.get('/profile');
  ok(r.text.includes('2048'), 'favorite listed in profile', r.status);
  const ctext = 'Smoke comment ' + Date.now();
  r = await user.post('/game/1/comment', { content: 'missing csrf' });
  ok(r.status === 403, 'missing CSRF token rejected (403)', r.status);
  resp = await user.post('/game/1/comment', { _csrf: user.csrf(), content: ctext });
  ok(resp.status === 302, 'comment posted', resp.status);
  r = await user.get('/game/2048');
  ok(r.text.includes(ctext), 'comment visible on page', r.status);
  r = await user.get('/wyj');
  ok(r.status === 302 && r.location.indexOf('/login') >= 0, 'admin guarded for normal user', r.status + ' ' + r.location);
  const admin = client();
  await admin.get('/login');
  resp = await admin.post('/login', { _csrf: admin.csrf(), username: process.env.ADMIN_USERNAME || 'mqx', password: process.env.ADMIN_PASSWORD || 'mqx331606110' });
  ok(resp.status === 302 && resp.location === '/', 'admin login', resp.status + ' ' + resp.location);
  for (const p of ['/wyj', '/wyj/games', '/wyj/import', '/wyj/users', '/wyj/comments', '/wyj/ads', '/wyj/settings']) {
    r = await admin.get(p);
    ok(r.status === 200, 'admin page ' + p, r.status);
  }
  // admin bulk selection: the row checkboxes are tied to the bulk form with the HTML5
  // form="..." attribute (they live outside the <form> element), so "select all" and the
  // bulk buttons must resolve the form owner instead of querying inside the form element
  r = await admin.get('/wyj/games');
  ok(r.status === 200 && r.text.indexOf('data-check-all') >= 0 && r.text.indexOf('name="sel"') >= 0, 'admin games list has select-all + row checkboxes', r.status);
  // "how hot is this game" views: the admin list can be ordered by plays / likes / favorites /
  // comments, both ways. Check the rendered order against the stored numbers.
  const hotId = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,plays,likes,published) VALUES('heat-fixture-hot','Heat Fixture Hot','puzzle','/img/games/default.svg','https://example.com/heat/hot','smoke',999999,0,1)").run().lastInsertRowid;
  const coldId = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,plays,likes,published) VALUES('heat-fixture-cold','Heat Fixture Cold','puzzle','/img/games/default.svg','https://example.com/heat/cold','smoke',0,777,1)").run().lastInsertRowid;
  // favorites are unique per user, so build the count with throwaway users (cascaded away below)
  const smokeUser = db.prepare('SELECT id FROM users WHERE username=?').get(uname);
  const favUsers = [];
  if (smokeUser) {
    const insUser = db.prepare("INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,'user')");
    const fav = db.prepare('INSERT OR IGNORE INTO favorites(user_id,game_id) VALUES(?,?)');
    fav.run(smokeUser.id, coldId);
    for (let i = 0; i < 4; i++) {
      const uid = insUser.run('heatfav' + i + '_' + Date.now().toString().slice(-6), 'heatfav' + i + '_' + Date.now() + '@example.com', 'x').lastInsertRowid;
      favUsers.push(uid);
      fav.run(uid, coldId);
    }
    const cm = db.prepare('INSERT INTO comments(user_id,game_id,content) VALUES(?,?,?)');
    for (let i = 0; i < 3; i++) cm.run(smokeUser.id, coldId, 'heat smoke ' + i);
  }
  const rowIds = (html) => [...html.matchAll(/name="sel" value="(\d+)"/g)].map((m) => Number(m[1]));
  const statsOf = (id) => db.prepare('SELECT g.plays, g.likes, (SELECT COUNT(*) FROM favorites f WHERE f.game_id=g.id) favs, (SELECT COUNT(*) FROM comments c WHERE c.game_id=g.id AND c.hidden=0) cmts FROM games g WHERE g.id=?').get(id);
  try {
    r = await admin.get('/wyj/games?sort=heat');
    let ids = rowIds(r.text).map(statsOf);
    ok(ids.length > 1 && ids.every((s, i) => i === 0 || ids[i - 1].plays >= s.plays), 'admin sort by most played', JSON.stringify(ids.slice(0, 3).map((s) => s.plays)));
    ok(/value="heat" selected/.test(r.text), 'admin sort control reflects the active sort');
    r = await admin.get('/wyj/games?sort=least');
    ids = rowIds(r.text).map(statsOf);
    ok(ids.length > 1 && ids.every((s, i) => i === 0 || ids[i - 1].plays <= s.plays), 'admin sort by least played', JSON.stringify(ids.slice(0, 3).map((s) => s.plays)));
    r = await admin.get('/wyj/games?sort=likes');
    ids = rowIds(r.text).map(statsOf);
    ok(ids.length > 1 && ids.every((s, i) => i === 0 || ids[i - 1].likes >= s.likes), 'admin sort by most liked', JSON.stringify(ids.slice(0, 3).map((s) => s.likes)));
    r = await admin.get('/wyj/games?sort=favorites');
    ids = rowIds(r.text).map(statsOf);
    ok(ids.length > 1 && ids.every((s, i) => i === 0 || ids[i - 1].favs >= s.favs), 'admin sort by most favorited', JSON.stringify(ids.slice(0, 3).map((s) => s.favs)));
    r = await admin.get('/wyj/games?sort=comments');
    ids = rowIds(r.text).map(statsOf);
    ok(ids.length > 1 && ids.every((s, i) => i === 0 || ids[i - 1].cmts >= s.cmts), 'admin sort by most commented', JSON.stringify(ids.slice(0, 3).map((s) => s.cmts)));
    r = await admin.get('/wyj/games?sort=favorites&q=heat-fixture');
    ok(r.text.indexOf('>5<') >= 0 && r.text.indexOf('>3<') >= 0, 'admin list shows favorites + comments counts', r.status);
    r = await admin.get('/wyj/games?sort=new');
    ok(rowIds(r.text)[0] === coldId || rowIds(r.text).indexOf(coldId) >= 0, 'admin list still sorts by newest', r.status);
  } finally {
    for (const uid of favUsers) db.prepare('DELETE FROM users WHERE id=?').run(uid);
    for (const id of [hotId, coldId]) {
      db.prepare('DELETE FROM favorites WHERE game_id=?').run(id);
      db.prepare('DELETE FROM comments WHERE game_id=?').run(id);
      db.prepare('DELETE FROM games WHERE id=?').run(id);
    }
  }
  if (JSDOM) {
    const dom = new JSDOM(r.text, { runScripts: 'outside-only', url: BASE + '/wyj/games', virtualConsole: new VirtualConsole() });
    dom.window.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8'));
    const doc = dom.window.document;
    const rows = Array.prototype.slice.call(doc.querySelectorAll('input[name="sel"]'));
    const master = doc.querySelector('[data-check-all]');
    const bulkBtn = doc.querySelector('.bulk-actions button[value="publish"]');
    const bump = () => new dom.window.Event('change', { bubbles: true });
    const click = () => new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    master.checked = true;
    master.dispatchEvent(bump());
    ok(rows.length > 0 && rows.every((cb) => cb.checked), 'admin select-all ticks every row checkbox', rows.filter((cb) => cb.checked).length + '/' + rows.length);
    ok(doc.querySelector('#bulk-count').textContent === String(rows.length), 'bulk counter follows select-all', doc.querySelector('#bulk-count').textContent);
    rows[0].checked = false;
    rows[0].dispatchEvent(bump());
    ok(master.checked === false && master.indeterminate === true, 'master shows a partial selection after one row is cleared');
    master.checked = false;
    master.dispatchEvent(bump());
    ok(rows.every((cb) => !cb.checked) && doc.querySelector('#bulk-count').textContent === '0', 'select-all can clear the selection', doc.querySelector('#bulk-count').textContent);
    ok(!bulkBtn.dispatchEvent(click()), 'bulk action is blocked while nothing is selected');
    master.checked = true;
    master.dispatchEvent(bump());
    ok(bulkBtn.dispatchEvent(click()), 'bulk action submits once rows are selected');
    dom.window.close();
  } else {
    ok(true, 'admin select-all DOM check skipped (jsdom not installed)');
  }
  resp = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: 'http://127.0.0.1:9/nope', num: 5, page: 1 });
  ok(resp.status === 302 && resp.location.indexOf('/wyj/import') === 0, 'import preview handles unreachable feed', resp.status + ' ' + resp.location);
  // the import page surfaces the server-side bulk import cursor so a long run is visible
  const bulkStateFile = path.join(__dirname, '..', 'data', 'import-all.state.json');
  const previousBulkState = fs.existsSync(bulkStateFile) ? fs.readFileSync(bulkStateFile, 'utf8') : null;
  try {
    fs.mkdirSync(path.dirname(bulkStateFile), { recursive: true });
    fs.writeFileSync(bulkStateFile, JSON.stringify({ nextPage: 4242, imported: 777, scanned: 9, lastNewTitle: 'Smoke Bulk Title', updatedAt: new Date().toISOString() }));
    r = await admin.get('/wyj/import');
    ok(r.status === 200 && r.text.includes('4242') && r.text.includes('777') && r.text.includes('Smoke Bulk Title'), 'admin import page shows the bulk import status', r.status);
    ok(r.text.includes('--start 4242'), 'admin import page shows the resume command');
  } finally {
    if (previousBulkState !== null) fs.writeFileSync(bulkStateFile, previousBulkState);
    else { try { fs.unlinkSync(bulkStateFile); } catch (e) {} }
  }

  // import preview: auto-scan + auto-dedupe (only not-yet-imported games are shown)
  // housekeeping: drop fixtures left behind by an earlier (interrupted) run so their ids are free again
  db.prepare("DELETE FROM games WHERE slug LIKE 'fixture-game-%'").run();
  const fixture = http.createServer((fq, fres) => {
    const u = new URL(fq.url, 'http://127.0.0.1');
    const n = Math.min(48, parseInt(u.searchParams.get('num'), 10) || 24);
    const pg = Math.max(1, parseInt(u.searchParams.get('page'), 10) || 1);
    const games = [];
    for (let i = 1; i <= n; i++) {
      const id = (pg - 1) * n + i;
      games.push({ id, title: 'Fixture Game ' + id, embed_url: 'https://example.com/game/' + id, thumbnail: 'https://example.com/t/' + id + '.png', category: 'puzzle', tags: 'fixture' });
    }
    fres.setHeader('content-type', 'application/json');
    fres.end(JSON.stringify({ games }));
  });
  await new Promise((res2) => fixture.listen(0, '127.0.0.1', res2));
  const fixturePort = fixture.address().port;
  const pagedFeed = 'http://127.0.0.1:' + fixturePort + '/feed?num={num}&page={page}';
  // first pass: scan pages 1-3 (6 per page) to gather 12 new games
  r = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: pagedFeed, num: 12, page: 1 });
  const firstPass = [...r.text.matchAll(/Fixture Game (\d+)</g)].map((m) => Number(m[1]));
  ok(r.status === 200 && firstPass.indexOf(1) >= 0 && firstPass.indexOf(12) >= 0, 'preview lists the first new games', JSON.stringify(firstPass));
  ok(/已扫描|Scanned/.test(r.text) && /继续扫描|Scan for more/.test(r.text), 'preview reports scan progress with a continue button');
  const scanInfo = (r.text.match(/已扫描\s*\d+\s*页|Scanned \d+ feed/) || [''])[0];
  ok(/\d/.test(scanInfo), 'scan info includes a page count', scanInfo);
  // import two games (fixture 1 and 2) so the next preview must skip them
  const bulkSel = [];
  const token = (r.text.match(/name="token" value="([^"]+)"/) || [])[1] || '';
  ok(!!token, 'preview provides an import token');
  const itemIds = [...r.text.matchAll(/name="sel" value="(\d+)"/g)].map((m) => m[1]);
  resp = await admin.post('/wyj/import/confirm', { _csrf: admin.csrf(), token: token, publish: 'on', sel: itemIds.slice(0, 2) });
  ok(resp.status === 302, 'import confirm accepts the scanned batch', resp.status);
  ok((await user.get('/game/fixture-game-1-ext-1')).status === 200, 'imported fixture game is live', '');
  // second pass: the imported games must be filtered out automatically
  r = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: pagedFeed, num: 12, page: 1 });
  const shownGames = [...r.text.matchAll(/Fixture Game (\d+)</g)].map((m) => Number(m[1]));
  ok(r.status === 200 && shownGames.length > 0, 'preview still lists fresh games after an import', r.status);
  ok(shownGames.indexOf(1) === -1 && shownGames.indexOf(2) === -1, 'preview auto-skips already imported games', JSON.stringify(shownGames));
  ok(shownGames.indexOf(3) >= 0, 'fresh games remain visible', JSON.stringify(shownGames));
  const importedAgain = shownGames.indexOf(1) >= 0 || shownGames.indexOf(2) >= 0;
  ok(!importedAgain, 'imported games no longer appear in the preview');
  // cleanup imported fixtures
  db.prepare("DELETE FROM games WHERE slug LIKE 'fixture-game-%'").run();
  fixture.close();

  // rate-limited feed (HTTP 429) shows a friendly notice with retry instead of a bare redirect.
  // A distinct port per request keeps the local host cooldown from masking the second run.
  async function startLimiter() {
    const s = http.createServer((fq, fres) => {
      fres.statusCode = 429;
      fres.setHeader('content-type', 'text/plain');
      fres.end('slow down');
    });
    await new Promise((res2) => s.listen(0, '127.0.0.1', res2));
    return { server: s, url: 'http://127.0.0.1:' + s.address().port + '/feed?num={num}&page={page}' };
  }
  const limiterA = await startLimiter();
  r = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: limiterA.url, num: 6, page: 4 });
  ok(r.status === 200 && (r.text.indexOf('Retry') >= 0 || r.text.indexOf('重试') >= 0) && r.text.indexOf('429') >= 0, 'rate-limited feed shows retry notice', r.status);
  limiterA.server.close();
  const limiterB = await startLimiter();
  r = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: limiterB.url, num: 6, page: 4 });
  ok(r.status === 200 && (r.text.indexOf('Retry') >= 0 || r.text.indexOf('重试') >= 0), 'retry path renders notice again', r.status);
  limiterB.server.close();
  const slug = 'smoke-game-' + Date.now().toString().slice(-6);
  resp = await admin.post('/wyj/games', { _csrf: admin.csrf(), title_en: 'Smoke Game', slug: slug, category: 'puzzle', embed_url: '/games/2048/', published: 'on' });
  ok(resp.status === 302, 'admin creates game', resp.status);
  r = await admin.get('/wyj/games?q=' + slug);
  const newId = extractId(r.text, '/wyj/games/');
  ok(!!newId, 'created game appears in admin list');
  if (newId) {
    r = await user.get('/game/' + slug);
    ok(r.status === 200, 'new game public page', r.status);
    resp = await admin.post('/wyj/games/' + newId + '/delete', { _csrf: admin.csrf() });
    ok(resp.status === 302, 'admin deletes game', resp.status);
    r = await user.get('/game/' + slug);
    ok(r.status === 404, 'deleted game is 404', r.status);
  }

  // bulk operations (multi-select publish / hide / delete)
  const slugA = 'smoke-a-' + Date.now().toString(36);
  const slugB = 'smoke-b-' + Date.now().toString(36);
  await admin.post('/wyj/games', { _csrf: admin.csrf(), title_en: 'Smoke Bulk A', slug: slugA, category: 'puzzle', embed_url: '/games/2048/', published: 'on' });
  await admin.post('/wyj/games', { _csrf: admin.csrf(), title_en: 'Smoke Bulk B', slug: slugB, category: 'puzzle', embed_url: '/games/2048/', published: 'on' });
  r = await admin.get('/wyj/games?q=smoke-');
  const tagRe = /<\/?form[^>]*>/g;
  let depth = 0; let nested = false; let tm;
  while ((tm = tagRe.exec(r.text))) { if (tm[0].startsWith('</')) depth--; else { depth++; if (depth > 1) nested = true; } }
  ok(!nested, 'games page has no nested <form> tags');
  const bulkIds = [];
  const idBySlug = new Map();
  for (const m of r.text.matchAll(/name="sel" value="(\d+)"[^>]*>\s*<\/td>[\s\S]{0,900}?<code>([^<]+)<\/code>/g)) {
    bulkIds.push(m[1]);
    idBySlug.set(m[2], m[1]);
  }
  ok(bulkIds.length >= 2 && r.text.includes('data-check-all') && idBySlug.has(slugA) && idBySlug.has(slugB), 'games list exposes multi-select checkboxes', JSON.stringify(bulkIds));
  const pair = [idBySlug.get(slugA), idBySlug.get(slugB)];
  const bulkForm = (r.text.match(/<form[^>]*id="bulk-form"[\s\S]*?<\/form>/) || [''])[0];
  const bulkToken = (bulkForm.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
  ok(!!bulkToken && bulkForm.indexOf('name="sel"') === -1, 'bulk form carries csrf only (checkboxes reference it)');
  if (pair[0] && pair[1]) {
    resp = await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'unpublish', sel: pair });
    ok(resp.status === 302 && resp.location.indexOf('n=2') >= 0, 'bulk hide updates 2 games', resp.status + ' ' + resp.location);
    r = await user.get('/game/' + slugA);
    ok(r.status === 404, 'bulk hidden game not public', r.status);
    resp = await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'publish', sel: pair });
    ok(resp.status === 302 && resp.location.indexOf('n=2') >= 0, 'bulk publish updates 2 games', resp.status + ' ' + resp.location);
    r = await user.get('/game/' + slugA);
    ok(r.status === 200, 'bulk published game is public again', r.status);
    resp = await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'delete', sel: pair });
    ok(resp.status === 302 && resp.location.indexOf('n=2') >= 0, 'bulk delete removes 2 games', resp.status + ' ' + resp.location);
    r = await user.get('/game/' + slugA);
    ok(r.status === 404, 'bulk deleted game is 404', r.status);
  }
  await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'delete', sel: bulkIds });
  resp = await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'publish', sel: [] });
  ok(resp.status === 302 && resp.location.indexOf('err=badRequest') >= 0, 'bulk with empty selection rejected', resp.status + ' ' + resp.location);
  resp = await admin.post('/wyj/games/bulk', { _csrf: admin.csrf(), action: 'bogus', sel: ['1'] });
  ok(resp.status === 302 && resp.location.indexOf('err=badRequest') >= 0, 'bulk with unknown action rejected', resp.status + ' ' + resp.location);

  resp = await admin.post('/wyj/ads', { _csrf: admin.csrf(), slot: 'header', type: 'html', title: 'Smoke Ad', html: '<div id="smoke-ad-marker">SMOKE-AD-123</div>', enabled: 'on', sort: '0' });
  ok(resp.status === 302, 'ad created', resp.status);
  r = await user.get('/');
  ok(r.text.includes('SMOKE-AD-123'), 'ad renders on homepage', r.status);
  r = await admin.get('/wyj/ads');
  const smokeAdRow = db.prepare("SELECT id FROM ads WHERE title='Smoke Ad'").get();
  const adId = smokeAdRow ? String(smokeAdRow.id) : extractId(r.text, '/wyj/ads/');
  if (adId) {
    resp = await admin.post('/wyj/ads/' + adId + '/delete', { _csrf: admin.csrf() });
    ok(resp.status === 302, 'ad deleted', resp.status);
  } else ok(false, 'ad id found');
  r = await user.get('/');
  ok(!r.text.includes('SMOKE-AD-123'), 'ad removed from homepage', r.status);
  const baseSettings = { _csrf: admin.csrf(), site_name: 'Peachcade', tagline_en: 'Free Online Browser Games — Play Instantly', tagline_zh: '免费免下载在线小游戏 · 即点即玩', footer_text_en: '', footer_text_zh: '', registration_open: 'on', ezoic_enabled: 'on' };
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on' }));
  ok(resp.status === 302, 'settings save (ads on)', resp.status);
  resp = await admin.post('/wyj/settings', baseSettings);
  r = await user.get('/');
  ok(!r.text.includes('ad-slot-header') && !r.text.includes('ad-slot-home-mid'), 'ads can be disabled', r.status);
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on' }));
  r = await user.get('/');
  ok(r.text.includes('ad-slot-header'), 'ads re-enabled with placeholders', r.status);
  r = await user.get('/ads.txt');
  ok(r.status === 200 && r.text.includes('pub-2264028095354486'), 'ads.txt served with google adsense snippet', r.status);
  const smokeAdsTxt = 'google.com, pub-2264028095354486, DIRECT, f08c47fec0942fa0\n\n#GameMonetize.com\ngoogle.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0\ngoogle.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0';
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on', ads_txt: smokeAdsTxt }));
  ok(resp.status === 302, 'ads.txt saved via settings', resp.status);
  r = await user.get('/ads.txt');
  ok(r.status === 200 && r.text.includes('pub-2264028095354486') && r.text.includes('pub-5519830896693885'), 'ads.txt reflects admin content', JSON.stringify(r.text.slice(0, 60)));
  // Ezoic ads.txt 301 redirect test
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on', ads_txt: smokeAdsTxt, ezoic_adstxt_redirect: 'on' }));
  ok(resp.status === 302, 'enable ezoic ads.txt redirect', resp.status);
  r = await user.get('/ads.txt');
  ok(r.status === 301 && r.location.includes('srv.adstxtmanager.com/19390/'), 'ads.txt 301 redirects to Ezoic AdstxtManager', r.status + ' ' + r.location);
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on', ads_txt: smokeAdsTxt }));
  r = await user.get('/ads.txt');
  ok(r.status === 200 && r.text.includes('pub-2264028095354486'), 'ads.txt returns to standard content when redirect disabled', r.status);
  r = await user.get('/healthz');
  ok(r.status === 200 && r.text.indexOf('"ok":true') >= 0, 'healthz endpoint', r.status);
  r = await user.get('/nope-nope');
  ok(r.status === 404, '404 page', r.status);
  resp = await user.post('/logout', { _csrf: user.csrf() });
  r = await user.get('/profile');
  ok(r.status === 302 && r.location.indexOf('/login') >= 0, 'logout works', r.status + ' ' + r.location);
  db.prepare("UPDATE games SET published=1 WHERE slug IN ('2048', 'snake', 'memory-match', 'tic-tac-toe', 'minesweeper')").run();
  db.prepare("UPDATE settings SET value='1' WHERE key='ezoic_enabled'").run();
  console.log('');
  console.log('RESULT: pass=' + pass + ' fail=' + fail);
  if (fail) { console.log('FAILURES: ' + failures.join(' | ')); process.exitCode = 1; }
})().catch(function (e) { console.error('SMOKE CRASH', e); process.exitCode = 2; });

