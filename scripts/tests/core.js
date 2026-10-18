'use strict';
const { ctx, ldBlocks, featuredSlugs } = require('./context');

module.exports = {
  title: 'SEO, structured data, pager, sitemaps, featured',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    const db = ctx.db;
    // required inside run(): the runner may have swapped DATA_DIR for --fresh
    const { featuredRotation } = require('../../src/queries');
    let r;
    await user.get('/lang/en?next=/');
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
    let rMain = await user.get('/sitemap-main.xml');
    ok(rMain.status === 200 && rMain.text.includes('<urlset') && rMain.text.includes('/category/puzzle'), 'sitemap-main.xml lists main pages and categories');
    let rTags = await user.get('/sitemap-tags.xml');
    ok(rTags.status === 200 && rTags.text.includes('<urlset') && rTags.text.includes('/tag/'), 'sitemap-tags.xml lists popular tag URLs');
    let rGames1 = await user.get('/sitemap-games-1.xml');
    ok(rGames1.status === 200 && rGames1.text.includes('<urlset') && rGames1.text.includes('/game/2048'), 'sitemap-games-1.xml lists game URLs');
    let rTagPage = await user.get('/tag/puzzle');
    ok(rTagPage.status === 200 && rTagPage.text.includes('/game/2048') && !rTagPage.text.includes('noindex'), 'tag landing page /tag/puzzle is indexable and lists games');
    ok(rTagPage.text.includes('BreadcrumbList') && rTagPage.text.includes('CollectionPage'), 'tag landing page has collection and breadcrumbs schema');
    r = await user.get('/');
    ok(r.text.includes('cat-card'), 'home shows category strip');
    ok(r.text.includes('name="881a8f0468df8b90a945c1d8ffff883b0dd31fc6"'), 'home includes HilltopAds verification meta tag');
    ok(r.text.includes('name="referrer" content="no-referrer-when-downgrade"'), 'head includes referrer-policy meta tag');
    ok(/\/css\/style\.css\?v=[0-9a-f]{6,}/.test(r.text), 'stylesheet url is versioned');
    ok(/\/js\/main\.js\?v=[0-9a-f]{6,}/.test(r.text), 'script url is versioned');
    ok(/\/img\/icons\.svg\?v=[0-9a-f]{6,}#i-/.test(r.text), 'icon sprite url is versioned');
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
}
};
