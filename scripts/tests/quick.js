'use strict';
// Fast, read-only safety net: run this after a CSS/copy tweak. It never writes
// to the database, so it is safe against production.
const { ctx } = require('./context');

module.exports = {
  title: 'Health & read-only sanity',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    let r;
    r = await user.get('/healthz');
    ok(r.status === 200 && r.text.indexOf('"ok":true') >= 0, 'healthz endpoint', r.status);
    r = await user.get('/');
    ok(r.status === 200, 'homepage responds', r.status);
    ok((r.headers.get('cache-control') || '').includes('private'), 'HTML stays out of shared caches', r.headers.get('cache-control'));
    ok(r.text.includes('Peachcade'), 'home renders new brand name Peachcade');
    const slugMatch = r.text.match(/href="\/game\/([a-z0-9-]+)"/);
    const slug = slugMatch ? slugMatch[1] : '';
    ok(!!slug, 'home renders at least one game', slug);
    r = await user.get('/game/' + slug);
    ok(r.status === 200, 'game detail responds', r.status);
    r = await user.get('/games');
    ok(r.status === 200, 'games listing responds', r.status);
    r = await user.get('/category/puzzle');
    ok(r.status === 200, 'category page responds', r.status);
    r = await user.get('/search?q=snake');
    ok(r.status === 200, 'search responds', r.status);
    r = await user.get('/about');
    ok(r.status === 200, 'about page responds', r.status);
    r = await user.get('/privacy');
    ok(r.status === 200 && r.text.includes('Privacy Policy'), 'privacy page responds', r.status);
    r = await user.get('/terms');
    ok(r.status === 200 && r.text.includes('Terms of Use'), 'terms page responds', r.status);
    r = await user.get('/robots.txt');
    ok(r.status === 200 && r.text.includes('Sitemap:'), 'robots.txt served', r.status);
    // host canonicalisation: the catalog must answer on one hostname only
    const host = require('../../src/host');
    ok(host.redirectTarget('www.peachcat.fun', 'peachcat.fun') === 'peachcat.fun', 'www folds onto the apex host');
    ok(host.redirectTarget('peachcat.fun', 'peachcat.fun') === '', 'apex host is served directly');
    ok(host.redirectTarget('127.0.0.1:3000', 'peachcat.fun') === '', 'local probes are never redirected');
    ok(host.redirectTarget('preview.example.com', 'peachcat.fun') === '', 'unrelated hosts are left alone');
    ok(host.redirectTarget('www.peachcat.fun', '') === 'peachcat.fun', 'www folds even without CANONICAL_HOST');
    ok(host.redirectTarget('peachcat.fun', '') === '', 'apex is untouched without CANONICAL_HOST');
    ok(host.pathTarget('/GAMES', '/wyj') === '/games', 'uppercase paths fold to lowercase');
    ok(host.pathTarget('/games/', '/wyj') === '/games', 'trailing slashes are dropped');
    ok(host.pathTarget('/Tag/Car?sort=new', '/wyj') === '/tag/car?sort=new', 'query strings survive path folding');
    ok(host.pathTarget('/games', '/wyj') === '', 'canonical paths are left alone');
    ok(host.pathTarget('/index.html', '/wyj') === '', 'file-looking paths keep their case');
    ok(host.pathTarget('/wyj/Games', '/wyj') === '', 'the admin prefix is exempt');
    ok(host.pathTarget('/uploads/AbC.png', '/wyj') === '', 'uploads keep their exact name');
    r = await user.get('/feed.xml');
    ok(r.status === 200 && r.text.includes('<rss') && r.text.includes('<item>'), 'rss feed served', r.status);
    r = await user.get('/manifest.webmanifest');
    ok(r.status === 200 && r.text.includes('Peachcade'), 'manifest.webmanifest served as PWA app config', r.status);
    r = await user.get('/css/style.css?v=smoke');
    ok(r.status === 200, 'stylesheet served', r.status);
    r = await user.get('/js/main.js?v=smoke');
    ok(r.status === 200, 'app script served', r.status);
    r = await user.get('/img/icons.svg?v=smoke');
    ok(r.status === 200 && r.text.includes('<svg'), 'icon sprite served', r.status);
    r = await user.get('/2771545fc9c14828b056ff3f18e9f50e.txt');
    ok(r.status === 200 && r.text.includes('2771545fc9c14828b056ff3f18e9f50e'), 'IndexNow key file is served');
    r = await user.get('/881a8f0468df8b90a945.txt');
    ok(r.status === 200 && r.text.includes('c1d8ffff883b0dd31fc6'), 'HilltopAds key file is served');
    r = await user.get('/verify.peachcat.fun.txt');
    ok(r.status === 200 && r.text.includes('069a4a36deaf4fa3a8f84e5eb3801e9b'), 'Ning media verification file is served');
    r = await user.get('/');
    ok(r.headers.get('referrer-policy') === 'no-referrer-when-downgrade', 'response header referrer-policy is no-referrer-when-downgrade');
    r = await user.get('/nope-nope');
    ok(r.status === 404, '404 page', r.status);
  }
};
