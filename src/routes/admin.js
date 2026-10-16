'use strict';
const ADMIN_BASE = process.env.ADMIN_BASE || '/wyj';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { db, getSetting, setSetting, DATA_DIR } = require('../db');
const { requireAdmin } = require('../auth');
const { listGames } = require('../queries');
const { isValid } = require('../csrf');
const upload = require('../upload');
const providers = require('../providers');

// server-side bulk import (scripts/import-all.js) writes a cursor + log next to the database;
// the admin import page surfaces it so a long run is visible without opening a shell
const BULK_STATE_FILE = path.join(DATA_DIR, 'import-all.state.json');
const BULK_LOG_FILE = path.join(DATA_DIR, 'import-all.log');

function bulkImportStatus() {
  try {
    const state = JSON.parse(fs.readFileSync(BULK_STATE_FILE, 'utf8'));
    const updated = state.updatedAt ? Date.parse(state.updatedAt) : NaN;
    const ageMs = Number.isFinite(updated) ? Date.now() - updated : null;
    let logTail = [];
    try {
      logTail = fs.readFileSync(BULK_LOG_FILE, 'utf8').trim().split('\n').slice(-3);
    } catch (e) { /* no log yet */ }
    return {
      nextPage: state.nextPage || null,
      imported: state.imported || 0,
      scanned: state.scanned || 0,
      lastTitle: state.lastNewTitle || '',
      updatedAt: state.updatedAt || '',
      ageMinutes: ageMs === null ? null : Math.round(ageMs / 60000),
      running: ageMs !== null && ageMs < 3 * 60 * 1000,
      logTail: logTail
    };
  } catch (e) {
    return null;
  }
}

router.use(requireAdmin);

function csrfFail(req, res) {
  if (isValid(req)) return false;
  res.status(403).render('error', { status: 403, message: res.locals.t('err.forbidden') });
  return true;
}

router.get('/', (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
    games: db.prepare('SELECT COUNT(*) n FROM games').get().n,
    plays: db.prepare('SELECT COALESCE(SUM(plays),0) n FROM games').get().n,
    comments: db.prepare('SELECT COUNT(*) n FROM comments').get().n
  };
  const latestUsers = db.prepare('SELECT id,username,email,role,created_at FROM users ORDER BY id DESC LIMIT 6').all();
  const topGames = db.prepare('SELECT id,slug,title_en,plays,likes FROM games ORDER BY plays DESC LIMIT 6').all();
  const latestComments = db.prepare('SELECT cm.id, cm.content, cm.created_at, u.username, g.slug AS game_slug, g.title_en AS game_title_en FROM comments cm JOIN users u ON u.id=cm.user_id JOIN games g ON g.id=cm.game_id ORDER BY cm.id DESC LIMIT 6').all();
  res.render('admin/dashboard', { pageTitle: res.locals.t('admin.dashboard'), stats, latestUsers, topGames, latestComments });
});

router.get('/games', (req, res) => {
  const q = String(req.query.q || '').slice(0, 64);
  const category = String(req.query.category || '').slice(0, 32);
  const status = ['all', 'published', 'unpublished', 'featured'].includes(req.query.status) ? req.query.status : 'all';
  // "how hot is this game" views: most/least played, most liked, most favorited, most commented
  const ADMIN_SORTS = ['new', 'oldest', 'heat', 'least', 'likes', 'favorites', 'comments', 'name'];
  const sort = ADMIN_SORTS.indexOf(String(req.query.sort || '')) >= 0 ? String(req.query.sort) : 'new';
  const data = listGames({
    q,
    category: category || undefined,
    status: status !== 'all' ? status : undefined,
    sort,
    page: parseInt(req.query.page, 10) || 1,
    per: 24,
    includeUnpublished: true,
    withStats: true
  });
  let note = '';
  if (req.query.n) note = res.locals.t('admin.bulkCount', { n: parseInt(req.query.n, 10) || 0 });
  const filterParams = (category ? '&category=' + encodeURIComponent(category) : '') + (status !== 'all' ? '&status=' + status : '');
  res.render('admin/games', {
    pageTitle: res.locals.t('admin.games'),
    games: data.games, page: data.page, pages: data.pages, q, note, sort, category, status,
    base: ADMIN_BASE + '/games?q=' + encodeURIComponent(q) + '&sort=' + sort + filterParams + '&'
  });
});

function gameForm(res, game) {
  res.render('admin/game_form', {
    pageTitle: game ? res.locals.t('admin.edit') + ': ' + game.title_en : res.locals.t('admin.newGame'),
    game: game || null
  });
}

router.get('/games/new', (req, res) => gameForm(res, null));

router.get('/games/:id/edit', (req, res, next) => {
  const g = db.prepare('SELECT * FROM games WHERE id=?').get(parseInt(req.params.id, 10) || 0);
  if (!g) return next();
  gameForm(res, g);
});

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function saveGame(req, res, id) {
  const b = req.body;
  const title_en = String(b.title_en || '').trim().slice(0, 120);
  const title_zh = String(b.title_zh || '').trim().slice(0, 120);
  const title_ja = String(b.title_ja || '').trim().slice(0, 120);
  if (!title_en) return res.redirect(ADMIN_BASE + '/games?err=badRequest');
  const slug = slugify(b.slug || title_en) || 'game-' + Date.now();
  const thumb = req.file ? ('/uploads/' + req.file.filename) : (String(b.thumb || '').trim() || '/img/games/default.svg');
  const embed_url = String(b.embed_url || '').trim() || ('/games/' + slug + '/');
  const data = {
    slug, title_en, title_zh, title_ja,
    desc_en: String(b.desc_en || '').slice(0, 500),
    desc_zh: String(b.desc_zh || '').slice(0, 500),
    desc_ja: String(b.desc_ja || '').slice(0, 500),
    howto_en: String(b.howto_en || '').slice(0, 2000),
    howto_zh: String(b.howto_zh || '').slice(0, 2000),
    howto_ja: String(b.howto_ja || '').slice(0, 2000),
    category: String(b.category || 'casual').slice(0, 32),
    tags: String(b.tags || '').slice(0, 200),
    thumb, embed_url,
    featured: b.featured ? 1 : 0,
    published: b.published ? 1 : 0
  };
  try {
    if (id) {
      db.prepare('UPDATE games SET slug=@slug,title_en=@title_en,title_zh=@title_zh,title_ja=@title_ja,desc_en=@desc_en,desc_zh=@desc_zh,desc_ja=@desc_ja,howto_en=@howto_en,howto_zh=@howto_zh,howto_ja=@howto_ja,category=@category,tags=@tags,thumb=@thumb,embed_url=@embed_url,featured=@featured,published=@published WHERE id=@id').run(Object.assign({}, data, { id }));
      res.redirect(ADMIN_BASE + '/games/' + id + '/edit?ok=updated');
    } else {
      const info = db.prepare('INSERT INTO games(slug,title_en,title_zh,title_ja,desc_en,desc_zh,desc_ja,howto_en,howto_zh,howto_ja,category,tags,thumb,embed_url,featured,published) VALUES(@slug,@title_en,@title_zh,@title_ja,@desc_en,@desc_zh,@desc_ja,@howto_en,@howto_zh,@howto_ja,@category,@tags,@thumb,@embed_url,@featured,@published)').run(data);
      res.redirect(ADMIN_BASE + '/games/' + info.lastInsertRowid + '/edit?ok=created');
    }
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.redirect(ADMIN_BASE + '/games?err=slugTaken');
    throw e;
  }
}

router.post('/games', upload.single('thumb_file'), (req, res) => {
  if (csrfFail(req, res)) return;
  saveGame(req, res, null);
});

// bulk operations on the games list (multi-select: publish / hide / feature / delete)
router.post('/games/bulk', (req, res) => {
  if (csrfFail(req, res)) return;
  const action = String(req.body.action || '');
  const raw = req.body.sel;
  const parts = Array.isArray(raw) ? raw : [raw];
  const ids = parts
    .reduce((acc, v) => acc.concat(String(v || '').split(',')), [])
    .map((v) => parseInt(v, 10) || 0)
    .filter((v) => v > 0);
  if (!ids.length) return res.redirect(ADMIN_BASE + '/games?err=badRequest');
  const uniq = Array.from(new Set(ids));
  const marks = uniq.map(() => '?').join(',');
  const tx = db.transaction(() => {
    if (action === 'publish') return db.prepare('UPDATE games SET published=1 WHERE id IN (' + marks + ')').run(uniq).changes;
    if (action === 'unpublish') return db.prepare('UPDATE games SET published=0 WHERE id IN (' + marks + ')').run(uniq).changes;
    if (action === 'feature') return db.prepare('UPDATE games SET featured=1 WHERE id IN (' + marks + ')').run(uniq).changes;
    if (action === 'unfeature') return db.prepare('UPDATE games SET featured=0 WHERE id IN (' + marks + ')').run(uniq).changes;
    if (action === 'delete') return db.prepare('DELETE FROM games WHERE id IN (' + marks + ')').run(uniq).changes;
    return null;
  });
  const n = tx();
  if (n === null) return res.redirect(ADMIN_BASE + '/games?err=badRequest');
  res.redirect(ADMIN_BASE + '/games?ok=updated&n=' + n);
});

router.post('/games/:id', upload.single('thumb_file'), (req, res) => {
  if (csrfFail(req, res)) return;
  saveGame(req, res, parseInt(req.params.id, 10) || 0);
});

router.post('/games/:id/delete', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('DELETE FROM games WHERE id=?').run(parseInt(req.params.id, 10) || 0);
  res.redirect(ADMIN_BASE + '/games?ok=deleted');
});

router.post('/games/:id/toggle', (req, res) => {
  if (csrfFail(req, res)) return;
  const id = parseInt(req.params.id, 10) || 0;
  db.prepare('UPDATE games SET published=1-published WHERE id=?').run(id);
  res.redirect(ADMIN_BASE + '/games?ok=updated');
});

router.post('/games/:id/feature', (req, res) => {
  if (csrfFail(req, res)) return;
  const id = parseInt(req.params.id, 10) || 0;
  db.prepare('UPDATE games SET featured=1-featured WHERE id=?').run(id);
  res.redirect(ADMIN_BASE + '/games?ok=updated');
});

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id,username,email,role,banned,created_at,(SELECT COUNT(*) FROM comments cm WHERE cm.user_id=users.id) AS comments FROM users ORDER BY id ASC').all();
  res.render('admin/users', { pageTitle: res.locals.t('admin.users'), users });
});

router.post('/users/:id/role', (req, res) => {
  if (csrfFail(req, res)) return;
  const id = parseInt(req.params.id, 10) || 0;
  if (id === req.user.id) return res.redirect(ADMIN_BASE + '/users?err=badRequest');
  const u = db.prepare('SELECT role FROM users WHERE id=?').get(id);
  if (u) db.prepare('UPDATE users SET role=? WHERE id=?').run(u.role === 'admin' ? 'user' : 'admin', id);
  res.redirect(ADMIN_BASE + '/users?ok=updated');
});

router.post('/users/:id/ban', (req, res) => {
  if (csrfFail(req, res)) return;
  const id = parseInt(req.params.id, 10) || 0;
  if (id === req.user.id) return res.redirect(ADMIN_BASE + '/users?err=badRequest');
  db.prepare('UPDATE users SET banned=1-banned WHERE id=?').run(id);
  res.redirect(ADMIN_BASE + '/users?ok=updated');
});

router.post('/users/:id/delete', (req, res) => {
  if (csrfFail(req, res)) return;
  const id = parseInt(req.params.id, 10) || 0;
  if (id === req.user.id) return res.redirect(ADMIN_BASE + '/users?err=badRequest');
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.redirect(ADMIN_BASE + '/users?ok=deleted');
});

router.get('/comments', (req, res) => {
  const comments = db.prepare('SELECT cm.*, u.username, g.slug AS game_slug, g.title_en AS game_title_en, g.title_zh AS game_title_zh FROM comments cm JOIN users u ON u.id=cm.user_id JOIN games g ON g.id=cm.game_id ORDER BY cm.id DESC LIMIT 200').all();
  res.render('admin/comments', { pageTitle: res.locals.t('admin.comments'), comments });
});

router.post('/comments/:id/toggle', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('UPDATE comments SET hidden=1-hidden WHERE id=?').run(parseInt(req.params.id, 10) || 0);
  res.redirect(ADMIN_BASE + '/comments?ok=updated');
});

router.post('/comments/:id/delete', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('DELETE FROM comments WHERE id=?').run(parseInt(req.params.id, 10) || 0);
  res.redirect(ADMIN_BASE + '/comments?ok=deleted');
});

const AD_SLOTS = ['header', 'home-mid', 'list-top', 'game-under', 'sidebar', 'footer'];

router.get('/ads', (req, res) => {
  const ads = db.prepare('SELECT * FROM ads ORDER BY slot, sort, id').all();
  res.render('admin/ads', { pageTitle: res.locals.t('admin.ads'), ads, slots: AD_SLOTS });
});

function adData(b) {
  return {
    slot: AD_SLOTS.includes(b.slot) ? b.slot : 'header',
    title: String(b.title || '').slice(0, 100),
    type: b.type === 'image' ? 'image' : 'html',
    html: String(b.html || '').slice(0, 5000),
    image_url: String(b.image_url || '').slice(0, 500),
    link_url: String(b.link_url || '').slice(0, 500),
    enabled: b.enabled ? 1 : 0,
    sort: parseInt(b.sort, 10) || 0
  };
}

router.post('/ads', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('INSERT INTO ads(slot,title,type,html,image_url,link_url,enabled,sort) VALUES(@slot,@title,@type,@html,@image_url,@link_url,@enabled,@sort)').run(adData(req.body));
  res.redirect(ADMIN_BASE + '/ads?ok=created');
});

router.post('/ads/:id', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('UPDATE ads SET slot=@slot,title=@title,type=@type,html=@html,image_url=@image_url,link_url=@link_url,enabled=@enabled,sort=@sort WHERE id=@id').run(Object.assign(adData(req.body), { id: parseInt(req.params.id, 10) || 0 }));
  res.redirect(ADMIN_BASE + '/ads?ok=updated');
});

router.post('/ads/:id/delete', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('DELETE FROM ads WHERE id=?').run(parseInt(req.params.id, 10) || 0);
  res.redirect(ADMIN_BASE + '/ads?ok=deleted');
});

router.post('/ads/:id/toggle', (req, res) => {
  if (csrfFail(req, res)) return;
  db.prepare('UPDATE ads SET enabled=1-enabled WHERE id=?').run(parseInt(req.params.id, 10) || 0);
  res.redirect(ADMIN_BASE + '/ads?ok=updated');
});

const SETTING_KEYS = ['site_name', 'tagline_en', 'tagline_zh', 'tagline_ja', 'footer_text_en', 'footer_text_zh', 'footer_text_ja', 'ads_enabled', 'registration_open', 'ads_txt'];

router.get('/settings', (req, res) => {
  const values = {};
  for (const k of SETTING_KEYS) values[k] = getSetting(k, '');
  res.render('admin/settings', { pageTitle: res.locals.t('admin.settings'), values });
});

router.post('/settings', (req, res) => {
  if (csrfFail(req, res)) return;
  const b = req.body;
  for (const k of SETTING_KEYS) {
    if (k === 'ads_txt' && !('ads_txt' in b)) continue; // dedicated form on the same page
    if (k === 'ads_enabled' || k === 'registration_open') setSetting(k, b[k] ? '1' : '0');
    else setSetting(k, String(b[k] || '').slice(0, k === 'ads_txt' ? 20000 : 500));
  }
  res.redirect(ADMIN_BASE + '/settings?ok=saved');
});

// ---- game feed importer (GameMonetize / custom RSS / custom JSON) ----

const importCache = new Map();
const feedPageCache = new Map();

function pruneImportCache() {
  const now = Date.now();
  for (const [k, v] of importCache) {
    if (now - v.ts > 15 * 60 * 1000) importCache.delete(k);
  }
  for (const [k, v] of feedPageCache) {
    if (now - v.ts > 10 * 60 * 1000) feedPageCache.delete(k);
  }
}

router.get('/import', (req, res) => {
  res.render('admin/import', {
    pageTitle: res.locals.t('admin.import'),
    providerList: providers.list(),
    done: req.query.done != null ? parseInt(req.query.done, 10) || 0 : null,
    skipped: parseInt(req.query.skip, 10) || 0,
    bulk: bulkImportStatus()
  });
});

// The provider throttles bursts (Cloudflare 1015): keep interactive scans short and slow
// down between pages, otherwise the admin keeps hitting the rate limit. Bulk imports use
// scripts/import-all.js instead.
const IMPORT_SCAN_LIMIT = 4;
const FEED_PAGE_DELAY_MS = 2000;

function gameTitleFor(res, it) {
  try { return res.locals.gt(it); } catch (e) { return it.title_en || ''; }
}

async function fetchFreshGames(res, o) {
  const seen = new Set();
  const fresh = [];
  let scanned = 0;
  let lastName = '';
  let lastSlug = '';
  let lastUrl = '';
  try {
    for (let i = 0; i < IMPORT_SCAN_LIMIT && fresh.length < o.num; i++) {
      const page = o.startPage + i;
      if (i > 0) await new Promise((r) => setTimeout(r, FEED_PAGE_DELAY_MS));
      const result = await providers.fetchGames({ provider: o.provider, url: o.url, num: o.num, page: page });
      scanned++;
      lastUrl = result.url;
      for (const it of result.items || []) {
        const slug = providers.slugFor(o.provider, it);
        if (seen.has(slug)) continue;
        seen.add(slug);
        if (db.prepare('SELECT 1 FROM games WHERE slug=? OR embed_url=?').get(slug, it.url)) continue;
        fresh.push({
          sourceId: it.sourceId,
          title: it.title,
          titleZh: gameTitleFor(res, { title_en: it.title }),
          desc: (it.description || '').slice(0, 500),
          howto: (it.instructions || '').slice(0, 2000),
          category: providers.mapCategory(it.category, o.cats),
          catLabel: it.category || '',
          size: it.width && it.height ? it.width + 'x' + it.height : '',
          slug: slug,
          thumb: it.thumb || '/img/games/default.svg',
          url: it.url,
          tags: providers.tagsFor(o.provider, it.tags)
        });
        lastName = it.title;
        lastSlug = slug;
        if (fresh.length >= o.num) break;
      }
      if (!(result.items || []).length) break;
    }
    return { fresh, scanned, lastName: lastName || lastSlug, lastUrl };
  } catch (e) {
    if (scanned > 0) return { fresh, scanned, lastName: lastName || lastSlug, lastUrl, partial: true };
    throw e;
  }
}

router.post('/import/preview', async (req, res) => {
  if (csrfFail(req, res)) return;
  const provider = String(req.body.provider || 'gamemonetize');
  const page = Math.max(1, parseInt(req.body.page, 10) || 1);
  const num = Math.min(48, Math.max(1, parseInt(req.body.num, 10) || 24));
  const rawUrl = String(req.body.url || '').trim();
  let feedBusy = '';
  try {
    pruneImportCache();
    const cacheKey = [provider, rawUrl, num, page].join('|');
    let cached = feedPageCache.get(cacheKey);
    if (!cached) {
      const cats = db.prepare('SELECT * FROM categories ORDER BY sort').all();
      const out = await fetchFreshGames(res, { provider: provider, url: rawUrl, num: num, startPage: page, cats: cats });
      cached = {
        url: out.lastUrl,
        items: out.fresh,
        scanned: out.scanned,
        nextPage: page + Math.max(1, out.scanned),
        last: out.lastName || '',
        ts: Date.now()
      };
      feedPageCache.set(cacheKey, cached);
    }
    // re-filter on every render: games imported after this page was fetched must disappear too
    const items = (cached.items || []).filter((it) => !db.prepare('SELECT 1 FROM games WHERE slug=? OR embed_url=?').get(it.slug, it.url));
    const nextPage = (cached.nextPage && cached.nextPage > page) ? cached.nextPage : page + Math.max(1, cached.scanned || 1);
    const token = crypto.randomBytes(12).toString('hex');
    importCache.set(token, { items: items, ts: Date.now(), provider: provider, publish: !!req.body.publish });
    res.render('admin/import_preview', {
      pageTitle: res.locals.t('admin.importPreviewTitle'),
      token: token,
      items: items,
      provider: provider,
      publish: !!req.body.publish,
      feedUrl: cached.url || rawUrl,
      rawUrl: rawUrl,
      page: page,
      num: num,
      feedBusy: feedBusy,
      scanned: cached.scanned,
      nextPage: nextPage,
      lastTitle: cached.last
    });
  } catch (e) {
    if (e && e.status === 429) {
      feedBusy = res.locals.t('admin.importRateLimited');
      res.render('admin/import_preview', {
        pageTitle: res.locals.t('admin.importPreviewTitle'),
        token: '',
        items: [],
        provider: provider,
        publish: !!req.body.publish,
        feedUrl: rawUrl,
        rawUrl: rawUrl,
        page: page,
        num: num,
        feedBusy: feedBusy,
        scanned: 0,
        nextPage: page,
        lastTitle: ''
      });
      return;
    }
    res.redirect(ADMIN_BASE + '/import?err=importFailed');
  }
});

router.post('/import/confirm', (req, res) => {
  if (csrfFail(req, res)) return;
  const token = String(req.body.token || '');
  const entry = importCache.get(token);
  pruneImportCache();
  if (!entry) return res.redirect(ADMIN_BASE + '/import?err=importFailed');
  let sel = req.body.sel || [];
  if (!Array.isArray(sel)) sel = [sel];
  sel = sel.map((v) => String(v)).join(',').split(',');
  const idxs = new Set(sel.map((v) => parseInt(v, 10)));
  const publish = entry.publish || !!req.body.publish;
  let done = 0;
  let skipped = 0;
  const ins = db.prepare('INSERT INTO games(slug,title_en,title_zh,desc_en,desc_zh,howto_en,howto_zh,category,tags,thumb,embed_url,source,featured,published) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)');
  const check = db.prepare('SELECT 1 FROM games WHERE slug=? OR embed_url=?');
  const tx = db.transaction(() => {
    entry.items.forEach((it, i) => {
      if (!idxs.has(i)) return;
      if (check.get(it.slug, it.url)) { skipped++; return; }
      ins.run(it.slug, it.title, '', it.desc, '', it.howto, '', it.category, it.tags, it.thumb, it.url, entry.provider, publish ? 1 : 0);
      done++;
    });
  });
  tx();
  importCache.delete(token);
  res.redirect(ADMIN_BASE + '/import?done=' + done + '&skip=' + skipped);
});

module.exports = router;
