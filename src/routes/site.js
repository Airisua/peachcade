'use strict';
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { listGames } = require('../queries');
const { requireLogin } = require('../auth');
const { rateLimit } = require('../ratelimit');

const commentLimiter = rateLimit({ windowMs: 60000, max: 10, scope: 'comment' });

function page(n) { const v = parseInt(n, 10); return !v || v < 1 ? 1 : v; }
function safeSort(s) { return ['popular', 'new', 'likes', 'name'].includes(s) ? s : 'popular'; }

router.get('/', (req, res) => {
  const popular = listGames({ sort: 'popular', per: 8 }).games;
  const newest = listGames({ sort: 'new', per: 8 }).games;
  const topRated = listGames({ sort: 'likes', per: 8 }).games;
  const featured = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.published=1 AND g.featured=1 ORDER BY g.plays DESC LIMIT 4').all();
  const hero = featured[0] || popular[0] || null;
  let continueList = [];
  if (req.user) {
    continueList = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, MAX(p.created_at) AS last_play FROM plays_log p JOIN games g ON g.id=p.game_id LEFT JOIN categories c ON c.slug=g.category WHERE p.user_id=? GROUP BY g.id ORDER BY last_play DESC LIMIT 4').all(req.user.id);
  }
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE published=1').get().n;
  res.render('index', { pageTitle: null, hero, featured, popular, newest, topRated, continueList, total });
});

router.get('/games', (req, res) => {
  const sort = safeSort(req.query.sort);
  const data = listGames({ sort, page: page(req.query.page), per: 24 });
  res.render('list', {
    pageTitle: res.locals.t('common.allGames'),
    heading: res.locals.t('common.allGames'),
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/games?', sort, totalGames: data.total
  });
});

router.get('/category/:slug', (req, res, next) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
  if (!cat) return next();
  const sort = safeSort(req.query.sort);
  const data = listGames({ sort, category: cat.slug, page: page(req.query.page), per: 24 });
  res.render('list', {
    pageTitle: res.locals.catName(cat),
    heading: res.locals.catName(cat),
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/category/' + cat.slug + '?', sort, totalGames: data.total
  });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 64);
  const sort = safeSort(req.query.sort);
  const data = q ? listGames({ q, sort, page: page(req.query.page), per: 24 }) : { games: [], page: 1, pages: 1, total: 0 };
  res.render('list', {
    pageTitle: res.locals.t('list.searchResults', { q }),
    heading: res.locals.t('list.searchResults', { q }),
    games: data.games, page: data.page, pages: data.pages,
    basePath: '/search?q=' + encodeURIComponent(q) + '&', sort, totalGames: data.total, q
  });
});

router.get('/random', (req, res) => {
  const g = db.prepare('SELECT slug FROM games WHERE published=1 ORDER BY RANDOM() LIMIT 1').get();
  res.redirect(g ? '/game/' + g.slug : '/games');
});

router.get('/game/:slug', (req, res, next) => {
  const game = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.slug=?').get(req.params.slug);
  if (!game) return next();
  const isAdmin = req.user && req.user.role === 'admin';
  if (!game.published && !isAdmin) return next();
  db.prepare('UPDATE games SET plays=plays+1 WHERE id=?').run(game.id);
  if (req.user) db.prepare('INSERT INTO plays_log(user_id,game_id) VALUES(?,?)').run(req.user.id, game.id);
  const related = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.published=1 AND g.category=? AND g.id!=? ORDER BY g.plays DESC LIMIT 8').all(game.category, game.id);
  const comments = db.prepare('SELECT cm.*, u.username, u.role FROM comments cm JOIN users u ON u.id=cm.user_id WHERE cm.game_id=? AND cm.hidden=0 ORDER BY cm.created_at DESC LIMIT 50').all(game.id);
  const liked = req.user ? !!db.prepare('SELECT 1 FROM likes WHERE user_id=? AND game_id=?').get(req.user.id, game.id) : false;
  const favorited = req.user ? !!db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND game_id=?').get(req.user.id, game.id) : false;
  res.render('game', { pageTitle: res.locals.gt(game), game, related, comments, liked, favorited });
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
  const code = req.params.code === 'zh' ? 'zh' : 'en';
  res.cookie('lang', code, { sameSite: 'lax', maxAge: 365 * 864e5 });
  let next = String(req.query.next || '/');
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';
  res.redirect(next);
});

router.get('/about', (req, res) => {
  res.render('about', { pageTitle: res.locals.t('about.title') });
});

router.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: ' + res.locals.siteUrl + '/sitemap.xml\n');
});

router.get('/sitemap.xml', (req, res) => {
  const games = db.prepare('SELECT slug, created_at FROM games WHERE published=1 ORDER BY id DESC LIMIT 2000').all();
  const cats = db.prepare('SELECT slug FROM categories ORDER BY sort').all();
  const urls = [
    { loc: '/', pri: '1.0' },
    { loc: '/games', pri: '0.9' },
    { loc: '/about', pri: '0.3' }
  ].concat(cats.map((c) => ({ loc: '/category/' + c.slug, pri: '0.6' })))
    .concat(games.map((g) => ({ loc: '/game/' + g.slug, pri: '0.8', last: String(g.created_at || '').slice(0, 10) })));
  const body = urls.map((u) => '  <url><loc>' + res.locals.siteUrl + u.loc + '</loc>' + (u.last ? '<lastmod>' + u.last + '</lastmod>' : '') + '<priority>' + u.pri + '</priority></url>').join('\n');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n');
});

module.exports = router;
