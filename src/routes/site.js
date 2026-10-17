'use strict';
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { listGames, featuredRotation, getPopularTags } = require('../queries');
const { requireLogin } = require('../auth');
const { rateLimit } = require('../ratelimit');
const schemaLd = require('../schema');
const thumbs = require('../thumbs');

const GAMES_PER_PAGE = 48;

const commentLimiter = rateLimit({ windowMs: 60000, max: 10, scope: 'comment' });

function page(n) { const v = parseInt(n, 10); return !v || v < 1 ? 1 : v; }
function safeSort(s) { return ['popular', 'new', 'likes', 'name'].includes(s) ? s : 'popular'; }

router.get('/', (req, res) => {
  const popular = listGames({ sort: 'popular', per: 8 }).games;
  const newest = listGames({ sort: 'new', per: 8 }).games;
  const topRated = listGames({ sort: 'likes', per: 8 }).games;
  // random rotation: admin-picked featured games when any are published, otherwise a
  // random mix of the most popular / best rated games
  const featured = featuredRotation(8);
  const hero = featured[0] || popular[0] || null;
  let continueList = [];
  if (req.user) {
    continueList = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja, MAX(p.created_at) AS last_play FROM plays_log p JOIN games g ON g.id=p.game_id LEFT JOIN categories c ON c.slug=g.category WHERE p.user_id=? GROUP BY g.id ORDER BY last_play DESC LIMIT 4').all(req.user.id);
  }
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE published=1').get().n;
  res.render('index', {
    pageTitle: null, hero, featured, popular, newest, topRated, continueList, total,
    schema: [schemaLd.website(res.locals.site, res.locals.siteUrl)]
  });
});

router.get('/games', (req, res) => {
  const sort = safeSort(req.query.sort);
  const data = listGames({ sort, page: page(req.query.page), per: GAMES_PER_PAGE });
  const heading = res.locals.t('common.allGames');
  res.render('list', {
    pageTitle: heading,
    heading,
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/games?', sort, totalGames: data.total,
    metaDesc: res.locals.t('seo.allGames', { site: res.locals.site.name }),
    schema: [
      schemaLd.collectionPage({
        name: heading, siteName: res.locals.site.name, siteUrl: res.locals.siteUrl, path: '/games',
        description: res.locals.t('seo.allGames', { site: res.locals.site.name }),
        games: data.games, total: data.total, titleFor: res.locals.gt
      }),
      schemaLd.breadcrumbs([{ name: res.locals.t('nav.home'), url: '/' }, { name: heading, url: '/games' }], res.locals.siteUrl)
    ]
  });
});

router.get('/category/:slug', (req, res, next) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
  if (!cat) return next();
  const sort = safeSort(req.query.sort);
  const data = listGames({ sort, category: cat.slug, page: page(req.query.page), per: GAMES_PER_PAGE });
  const catLabel = res.locals.catName(cat);
  const catDesc = res.locals.t('seo.category', { name: catLabel });
  res.render('list', {
    pageTitle: catLabel,
    heading: catLabel,
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/category/' + cat.slug + '?', sort, totalGames: data.total,
    metaDesc: catDesc,
    schema: [
      schemaLd.collectionPage({
        name: catLabel, siteName: res.locals.site.name, siteUrl: res.locals.siteUrl,
        path: '/category/' + cat.slug, description: catDesc,
        games: data.games, total: data.total, titleFor: res.locals.gt
      }),
      schemaLd.breadcrumbs([{ name: res.locals.t('nav.home'), url: '/' }, { name: catLabel, url: '/category/' + cat.slug }], res.locals.siteUrl)
    ]
  });
});


router.get('/tag/:tag', (req, res, next) => {
  const rawTag = String(req.params.tag || '').trim().slice(0, 40);
  if (!rawTag) return next();
  const cleanTag = rawTag.toLowerCase().replace(/[-_]+/g, ' ').trim();
  const sort = safeSort(req.query.sort);
  let data = listGames({ tag: cleanTag, sort, page: page(req.query.page), per: GAMES_PER_PAGE });
  if (!data.total && cleanTag !== rawTag.toLowerCase()) {
    data = listGames({ tag: rawTag.toLowerCase(), sort, page: page(req.query.page), per: GAMES_PER_PAGE });
  }
  const tagDisplay = cleanTag.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const heading = res.locals.t('seo.tagHeading', { tag: tagDisplay });
  const metaDesc = res.locals.t('seo.tagDesc', { tag: tagDisplay, site: res.locals.site.name });
  const canonPath = '/tag/' + encodeURIComponent(rawTag);
  res.render('list', {
    pageTitle: heading,
    heading,
    games: data.games, page: data.page, pages: data.pages,
    basePath: canonPath + '?', sort, totalGames: data.total,
    metaDesc,
    schema: [
      schemaLd.collectionPage({
        name: heading, siteName: res.locals.site.name, siteUrl: res.locals.siteUrl, path: canonPath,
        description: metaDesc,
        games: data.games, total: data.total, titleFor: res.locals.gt
      }),
      schemaLd.breadcrumbs([
        { name: res.locals.t('nav.home'), url: '/' },
        { name: res.locals.t('nav.games'), url: '/games' },
        { name: tagDisplay, url: canonPath }
      ], res.locals.siteUrl)
    ]
  });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 64);
  const sort = safeSort(req.query.sort);
  const data = q ? listGames({ q, sort, page: page(req.query.page), per: GAMES_PER_PAGE }) : { games: [], page: 1, pages: 1, total: 0 };
  res.render('list', {
    pageTitle: res.locals.t('list.searchResults', { q }),
    heading: res.locals.t('list.searchResults', { q }),
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/search?q=' + encodeURIComponent(q) + '&', sort, totalGames: data.total, q,
    noindex: true
  });
});

router.get('/random', (req, res) => {
  const g = db.prepare('SELECT slug FROM games WHERE published=1 ORDER BY RANDOM() LIMIT 1').get();
  res.redirect(g ? '/game/' + g.slug : '/games');
});

// resized, self-hosted thumbnail (see src/thumbs.js) - falls back to the original image
router.get('/thumb/:key', async (req, res) => {
  const m = String(req.params.key || '').match(/^([a-z0-9-]{1,80})\.([a-z]+)\.jpg$/i);
  const size = m ? thumbs.sizeFor(m[2]) : null;
  if (!m || !size) return res.status(404).end();
  const game = db.prepare('SELECT slug, thumb FROM games WHERE slug=?').get(m[1]);
  if (!game) return res.status(404).end();
  const source = String(game.thumb || '');
  if (!/^https?:\/\//i.test(source)) return res.redirect(302, source || '/img/games/default.svg');
  try {
    const out = await thumbs.build(source, size);
    res.set('cache-control', 'public, max-age=31536000, immutable');
    res.type('image/jpeg');
    return res.sendFile(out.file);
  } catch (e) {
    return res.redirect(302, source);
  }
});

router.get('/game/:slug', (req, res, next) => {
  const game = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.slug=?').get(req.params.slug);
  if (!game) return next();
  const isAdmin = req.user && req.user.role === 'admin';
  if (!game.published && !isAdmin) return next();
  db.prepare('UPDATE games SET plays=plays+1 WHERE id=?').run(game.id);
  if (req.user) db.prepare('INSERT INTO plays_log(user_id,game_id) VALUES(?,?)').run(req.user.id, game.id);
  const related = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.published=1 AND g.category=? AND g.id!=? ORDER BY g.plays DESC LIMIT 8').all(game.category, game.id);
  const comments = db.prepare('SELECT cm.*, u.username, u.role FROM comments cm JOIN users u ON u.id=cm.user_id WHERE cm.game_id=? AND cm.hidden=0 ORDER BY cm.created_at DESC LIMIT 50').all(game.id);
  const liked = req.user ? !!db.prepare('SELECT 1 FROM likes WHERE user_id=? AND game_id=?').get(req.user.id, game.id) : false;
  const favorited = req.user ? !!db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND game_id=?').get(req.user.id, game.id) : false;
  const title = res.locals.gt(game);
  const catLabel = res.locals.catName({ name_en: game.cat_en, name_zh: game.cat_zh, name_ja: game.cat_ja });
  const crumbs = [{ name: res.locals.t('nav.home'), url: '/' }];
  if (game.cat_en) crumbs.push({ name: catLabel, url: '/category/' + game.category });
  crumbs.push({ name: title, url: '/game/' + game.slug });
  const seoTitle = res.locals.t('seo.gameTitle', { title });
  const descBase = res.locals.gd(game);
  const cta = res.locals.t('seo.gameCta', { title, site: res.locals.site.name });
  const metaDesc = descBase ? (descBase.slice(0, 180) + ' — ' + cta) : cta;
  const rating = res.locals.ratingFor(game);
  const schemas = [
    schemaLd.videoGame(game, {
      siteUrl: res.locals.siteUrl, title, description: descBase.slice(0, 500) || cta,
      genre: catLabel, lang: res.locals.lang, rating
    }),
    schemaLd.breadcrumbs(crumbs, res.locals.siteUrl),
    schemaLd.faqPage(game, {
      title, howto: res.locals.gh(game), lang: res.locals.lang
    })
  ];
  res.render('game', {
    pageTitle: seoTitle, game, related, comments, liked, favorited, rating,
    metaDesc: metaDesc.slice(0, 300),
    schema: schemas
  });
});

router.post('/game/:id/comment', requireLogin, commentLimiter, (req, res) => {
  const game = db.prepare('SELECT id, slug FROM games WHERE id=?').get(parseInt(req.params.id, 10) || 0);
  if (!game) return res.redirect('/games');
  const content = String(req.body.content || '').trim();
  if (!content) return res.redirect('/game/' + game.slug + '?err=commentEmpty');
  if (content.length > 1000) return res.redirect('/game/' + game.slug + '?err=commentLong');
  db.prepare('INSERT INTO comments(game_id,user_id,content) VALUES(?,?,?)').run(game.id, req.user.id, content);
  res.redirect('/game/' + game.slug + '?ok=comment');
});

router.post('/comment/:id/delete', requireLogin, (req, res) => {
  const c = db.prepare('SELECT cm.*, g.slug FROM comments cm JOIN games g ON g.id=cm.game_id WHERE cm.id=?').get(parseInt(req.params.id, 10) || 0);
  if (!c) return res.redirect('/games');
  if (c.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).render('error', { status: 403, message: res.locals.t('err.forbidden') });
  }
  db.prepare('DELETE FROM comments WHERE id=?').run(c.id);
  res.redirect('/game/' + c.slug + '?ok=deleted');
});

router.get('/lang/:code', (req, res) => {
  const code = ['zh', 'ja', 'en'].includes(req.params.code) ? req.params.code : 'en';
  res.cookie('lang', code, { sameSite: 'lax', maxAge: 365 * 864e5 });
  let next = String(req.query.next || '/');
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';
  res.redirect(next);
});

router.get('/about', (req, res) => {
  res.render('about', { pageTitle: res.locals.t('about.title') });
});

router.get('/rewards', (req, res) => {
  res.render('rewards', { 
    pageTitle: res.locals.t('rewards.title'),
    metaDesc: res.locals.t('rewards.desc')
  });
});

router.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// publisher ads.txt (ad-network authorized sellers) - editable from admin settings
router.get('/ads.txt', (req, res) => {
  const { getSetting } = require('../db');
  const body = String(getSetting('ads_txt', '') || '').trim();
  res.type('text/plain');
  if (!body) return res.send('# no ads.txt configured\n');
  res.send(body + '\n');
});

router.get('/robots.txt', (req, res) => {
  const adminBase = process.env.ADMIN_BASE || '/wyj';
  res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: ' + adminBase + '/\nDisallow: /api/\nSitemap: ' + res.locals.siteUrl + '/sitemap.xml\n');
});

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '2771545fc9c14828b056ff3f18e9f50e';
router.get('/:key.txt', (req, res, next) => {
  if (req.params.key === INDEXNOW_KEY) {
    res.type('text/plain');
    return res.send(INDEXNOW_KEY + '\n');
  }
  next();
});

const SITEMAP_CHUNK_SIZE = 5000;
let sitemapIndexCache = { body: '', at: 0 };
let sitemapMainCache = { body: '', at: 0 };
let sitemapTagsCache = { body: '', at: 0 };
const sitemapGamesCache = new Map();

router.get('/sitemap.xml', (req, res) => {
  const now = Date.now();
  if (sitemapIndexCache.body && (now - sitemapIndexCache.at < 3600000)) {
    res.type('application/xml');
    return res.send(sitemapIndexCache.body);
  }
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE published=1').get().n;
  const chunks = Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE));
  const today = new Date().toISOString().slice(0, 10);
  let sitemaps = [
    '  <sitemap><loc>' + res.locals.siteUrl + '/sitemap-main.xml</loc><lastmod>' + today + '</lastmod></sitemap>',
    '  <sitemap><loc>' + res.locals.siteUrl + '/sitemap-tags.xml</loc><lastmod>' + today + '</lastmod></sitemap>'
  ];
  for (let i = 1; i <= chunks; i++) {
    sitemaps.push('  <sitemap><loc>' + res.locals.siteUrl + '/sitemap-games-' + i + '.xml</loc><lastmod>' + today + '</lastmod></sitemap>');
  }
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps.join('\n') + '\n</sitemapindex>\n';
  sitemapIndexCache = { body, at: now };
  res.type('application/xml').send(body);
});

router.get('/sitemap-main.xml', (req, res) => {
  const now = Date.now();
  if (sitemapMainCache.body && (now - sitemapMainCache.at < 3600000)) {
    res.type('application/xml');
    return res.send(sitemapMainCache.body);
  }
  const cats = db.prepare('SELECT slug FROM categories ORDER BY sort').all();
  const urls = [
    { loc: '/', pri: '1.0', cf: 'daily' },
    { loc: '/games', pri: '0.9', cf: 'daily' },
    { loc: '/about', pri: '0.3', cf: 'monthly' }
  ].concat(cats.map((c) => ({ loc: '/category/' + c.slug, pri: '0.7', cf: 'daily' })));
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + res.locals.siteUrl + u.loc + '</loc><changefreq>' + u.cf + '</changefreq><priority>' + u.pri + '</priority></url>').join('\n') +
    '\n</urlset>\n';
  sitemapMainCache = { body, at: now };
  res.type('application/xml').send(body);
});

router.get('/sitemap-tags.xml', (req, res) => {
  const now = Date.now();
  if (sitemapTagsCache.body && (now - sitemapTagsCache.at < 3600000)) {
    res.type('application/xml');
    return res.send(sitemapTagsCache.body);
  }
  const tags = getPopularTags(250);
  const today = new Date().toISOString().slice(0, 10);
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    tags.map((t) => '  <url><loc>' + res.locals.siteUrl + '/tag/' + encodeURIComponent(t.slug) + '</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>').join('\n') +
    '\n</urlset>\n';
  sitemapTagsCache = { body, at: now };
  res.type('application/xml').send(body);
});

router.get('/sitemap-games-:chunk.xml', (req, res, next) => {
  const chunk = parseInt(req.params.chunk, 10) || 0;
  if (chunk < 1) return next();
  const now = Date.now();
  const cached = sitemapGamesCache.get(chunk);
  if (cached && (now - cached.at < 3600000)) {
    res.type('application/xml');
    return res.send(cached.body);
  }
  const offset = (chunk - 1) * SITEMAP_CHUNK_SIZE;
  const games = db.prepare('SELECT slug, created_at FROM games WHERE published=1 ORDER BY id ASC LIMIT ? OFFSET ?').all(SITEMAP_CHUNK_SIZE, offset);
  if (!games.length && chunk > 1) return next();
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    games.map((g) => {
      const last = String(g.created_at || '').slice(0, 10);
      return '  <url><loc>' + res.locals.siteUrl + '/game/' + g.slug + '</loc>' + (last ? '<lastmod>' + last + '</lastmod>' : '') + '<changefreq>weekly</changefreq><priority>0.8</priority></url>';
    }).join('\n') + '\n</urlset>\n';
  sitemapGamesCache.set(chunk, { body, at: now });
  res.type('application/xml').send(body);
});

module.exports = router;
