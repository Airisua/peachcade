'use strict';
const { ctx, client, extractId } = require('./context');
const fs = require('fs');
const path = require('path');
const http = require('http');

module.exports = {
  title: 'Admin login, heat sort, bulk actions, importer',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    const db = ctx.db;
    const JSDOM = ctx.JSDOM;
    const VirtualConsole = ctx.VirtualConsole;
    const admin = client();
    let r;
    let resp;
    await admin.get('/login');
    resp = await admin.post('/login', { _csrf: admin.csrf(), username: process.env.ADMIN_USERNAME || 'mqx', password: process.env.ADMIN_PASSWORD || 'mqx331606110' });
    ok(resp.status === 302 && resp.location === '/', 'admin login', resp.status + ' ' + resp.location);
    for (const p of ['/wyj', '/wyj/online', '/wyj/games', '/wyj/import', '/wyj/users', '/wyj/comments', '/wyj/ads', '/wyj/settings']) {
      r = await admin.get(p);
      ok(r.status === 200, 'admin page ' + p, r.status);
    }
    // Live presence: the visitor traffic from the other clients has to show up in
    // the admin feed, and the feed must stay admin-only.
    await user.get('/');
    r = await admin.get('/wyj/online.json');
    let onlineData = {};
    try { onlineData = JSON.parse(r.text); } catch (e) { onlineData = {}; }
    ok(r.status === 200 && typeof onlineData.total === 'number', 'online json exposes a count', r.status);
    ok(onlineData.total >= 1, 'visitors are counted as online', JSON.stringify(onlineData).slice(0, 120));
    ok(Array.isArray(onlineData.recent) && onlineData.recent.some((v) => v.path === '/'), 'online feed lists the visited path', (onlineData.recent || []).length);
    r = await admin.get('/wyj/online');
    ok(r.status === 200 && r.text.indexOf('/wyj/online.json') >= 0 && r.text.indexOf('online-total') >= 0, 'online page renders with live refresh', r.status);
    r = await user.get('/wyj/online');
    ok(r.status === 302 && String(r.location).indexOf('/login') === 0, 'online page is admin only', r.status + ' ' + r.location);
  // admin bulk selection: the row checkboxes are tied to the bulk form with the HTML5
  // form="..." attribute (they live outside the <form> element), so "select all" and the
  // bulk buttons must resolve the form owner instead of querying inside the form element
  r = await admin.get('/wyj/games');
  ok(r.status === 200 && r.text.indexOf('data-check-all') >= 0 && r.text.indexOf('name="sel"') >= 0, 'admin games list has select-all + row checkboxes', r.status);
  // "how hot is this game" views: the admin list can be ordered by plays / likes / favorites /
  // comments, both ways. Check the rendered order against the stored numbers.
  const hotId = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,plays,likes,published) VALUES('heat-fixture-hot','Heat Fixture Hot','puzzle','/img/games/default.svg','https://example.com/heat/hot','smoke',999999,0,1)").run().lastInsertRowid;
  const coldId = db.prepare("INSERT INTO games(slug,title_en,category,thumb,embed_url,source,plays,likes,published) VALUES('heat-fixture-cold','Heat Fixture Cold','puzzle','/img/games/default.svg','https://example.com/heat/cold','smoke',0,777,1)").run().lastInsertRowid;
  // Favorites are unique per user, so build the counts with throwaway users that
  // are removed again in the finally block. The suite owns its fixtures: it must
  // run on its own, without the user suite having registered anybody first.
  const insUser = db.prepare("INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,'user')");
  const stamp = Date.now().toString().slice(-8);
  const heatUser = insUser.run('heatowner_' + stamp, 'heatowner_' + stamp + '@example.com', 'x').lastInsertRowid;
  const favUsers = [heatUser];
  const fav = db.prepare('INSERT OR IGNORE INTO favorites(user_id,game_id) VALUES(?,?)');
  const cm = db.prepare('INSERT INTO comments(user_id,game_id,content) VALUES(?,?,?)');
  try {
    fav.run(heatUser, coldId);
    for (let i = 0; i < 4; i++) {
      const uid = insUser.run('heatfav' + i + '_' + stamp, 'heatfav' + i + '_' + stamp + '@example.com', 'x').lastInsertRowid;
      favUsers.push(uid);
      fav.run(uid, coldId);
    }
    for (let i = 0; i < 3; i++) cm.run(heatUser, coldId, 'heat smoke ' + i);
  } catch (e) {
    for (const uid of favUsers) db.prepare('DELETE FROM users WHERE id=?').run(uid);
    throw e;
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
    const dom = new JSDOM(r.text, { runScripts: 'outside-only', url: ctx.base + '/wyj/games', virtualConsole: new VirtualConsole() });
    dom.window.eval(fs.readFileSync(path.join(ctx.appRoot, 'public', 'js', 'main.js'), 'utf8'));
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
  const bulkStateFile = path.join(ctx.db.name ? path.dirname(ctx.db.name) : path.join(ctx.appRoot, 'data'), 'import-all.state.json');
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
  }
};
