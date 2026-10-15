'use strict';
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
    if (opts.form) { body = new URLSearchParams(opts.form).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
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
  const user = client();
  let r = await user.get('/');
  ok(r.status === 200 && r.text.includes('/game/2048') && !r.text.includes('热门游戏'), 'home renders EN with games', r.status);
  r = await user.get('/lang/zh?next=/');
  ok(r.status === 302, 'lang switch to zh', r.status);
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('热门游戏'), 'home renders ZH', r.status);
  r = await user.get('/lang/en?next=/');
  ok(r.status === 302, 'lang switch back to en', r.status);
  r = await user.get('/games');
  ok(r.status === 200 && r.text.includes('/game/snake'), 'games listing page', r.status);
  r = await user.get('/search?q=snake');
  ok(r.status === 200 && r.text.includes('Snake Classic'), 'search page', r.status);
  r = await user.get('/category/puzzle');
  ok(r.status === 200 && r.text.includes('Minesweeper'), 'category page', r.status);
  r = await user.get('/sitemap.xml');
  ok(r.status === 200 && r.text.includes('<urlset') && r.text.includes('/game/2048'), 'sitemap.xml', r.status);
  r = await user.get('/robots.txt');
  ok(r.status === 200 && r.text.includes('Sitemap:'), 'robots.txt', r.status);
  r = await user.get('/');
  ok(r.text.includes('cat-card'), 'home shows category strip');
  r = await user.get('/game/2048');
  ok(r.text.includes('og:title') && r.text.includes('rel="canonical"'), 'game page has OG tags + canonical');
  r = await user.get('/game/2048');
  ok(r.status === 200 && r.text.includes('/games/2048/'), 'game page embeds iframe', r.status);
  for (const slug of ['2048', 'snake', 'memory-match', 'tic-tac-toe', 'minesweeper']) {
    r = await user.get('/games/' + slug + '/index.html');
    ok(r.status === 200 && r.text.includes('game-root'), 'game file ' + slug, r.status);
    r = await user.get('/img/games/' + slug + '.svg');
    ok(r.status === 200 && r.text.includes('<svg'), 'thumb ' + slug, r.status);
  }
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
  resp = await admin.post('/wyj/import/preview', { _csrf: admin.csrf(), provider: 'json', url: 'http://127.0.0.1:9/nope', num: 5, page: 1 });
  ok(resp.status === 302 && resp.location.indexOf('/wyj/import') === 0, 'import preview handles unreachable feed', resp.status + ' ' + resp.location);
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
  resp = await admin.post('/wyj/ads', { _csrf: admin.csrf(), slot: 'header', type: 'html', title: 'Smoke Ad', html: '<div id="smoke-ad-marker">SMOKE-AD-123</div>', enabled: 'on', sort: '0' });
  ok(resp.status === 302, 'ad created', resp.status);
  r = await user.get('/');
  ok(r.text.includes('SMOKE-AD-123'), 'ad renders on homepage', r.status);
  r = await admin.get('/wyj/ads');
  const adId = extractId(r.text, '/wyj/ads/');
  if (adId) {
    resp = await admin.post('/wyj/ads/' + adId + '/delete', { _csrf: admin.csrf() });
    ok(resp.status === 302, 'ad deleted', resp.status);
  } else ok(false, 'ad id found');
  r = await user.get('/');
  ok(!r.text.includes('SMOKE-AD-123'), 'ad removed from homepage', r.status);
  const baseSettings = { _csrf: admin.csrf(), site_name: 'PixelPlay', tagline_en: 'Instant HTML5 games - play free in your browser', tagline_zh: '即点即玩 · 免费在线小游戏', footer_text_en: '', footer_text_zh: '', registration_open: 'on' };
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on' }));
  ok(resp.status === 302, 'settings save (ads on)', resp.status);
  resp = await admin.post('/wyj/settings', baseSettings);
  r = await user.get('/');
  ok(!r.text.includes('ad-slot-header') && !r.text.includes('ad-slot-home-mid'), 'ads can be disabled', r.status);
  resp = await admin.post('/wyj/settings', Object.assign({}, baseSettings, { ads_enabled: 'on' }));
  r = await user.get('/');
  ok(r.text.includes('ad-slot-header'), 'ads re-enabled with placeholders', r.status);
  r = await user.get('/healthz');
  ok(r.status === 200 && r.text.indexOf('"ok":true') >= 0, 'healthz endpoint', r.status);
  r = await user.get('/nope-nope');
  ok(r.status === 404, '404 page', r.status);
  resp = await user.post('/logout', { _csrf: user.csrf() });
  r = await user.get('/profile');
  ok(r.status === 302 && r.location.indexOf('/login') >= 0, 'logout works', r.status + ' ' + r.location);
  console.log('');
  console.log('RESULT: pass=' + pass + ' fail=' + fail);
  if (fail) { console.log('FAILURES: ' + failures.join(' | ')); process.exitCode = 1; }
})().catch(function (e) { console.error('SMOKE CRASH', e); process.exitCode = 2; });

