'use strict';
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { listGames } = require('../queries');
const { requireLogin } = require('../auth');

router.get('/games', (req, res) => {
  const data = listGames({
    q: String(req.query.q || '').slice(0, 64),
    category: String(req.query.category || '').slice(0, 32),
    sort: String(req.query.sort || 'popular'),
    per: Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12))
  });
  res.json({
    games: data.games.map((g) => ({
      id: g.id, slug: g.slug, title: res.locals.gt(g), thumb: res.locals.thumb(g, 'thumb'),
      plays: g.plays, likes: g.likes, category: g.category,
      cat: res.locals.catName({ name_en: g.cat_en, name_zh: g.cat_zh, name_ja: g.cat_ja })
    }))
  });
});

function toggle(req, res, table) {
  const id = parseInt(req.params.id, 10) || 0;
  const game = db.prepare('SELECT id FROM games WHERE id=?').get(id);
  if (!game) return res.status(404).json({ error: 'not_found' });
  const has = db.prepare('SELECT 1 FROM ' + table + ' WHERE user_id=? AND game_id=?').get(req.user.id, id);
  if (has) {
    db.prepare('DELETE FROM ' + table + ' WHERE user_id=? AND game_id=?').run(req.user.id, id);
    if (table === 'likes') db.prepare('UPDATE games SET likes=MAX(likes-1,0) WHERE id=?').run(id);
  } else {
    db.prepare('INSERT INTO ' + table + '(user_id,game_id) VALUES(?,?)').run(req.user.id, id);
    if (table === 'likes') db.prepare('UPDATE games SET likes=likes+1 WHERE id=?').run(id);
  }
  const out = { id };
  if (table === 'likes') { out.liked = !has; out.likes = db.prepare('SELECT likes FROM games WHERE id=?').get(id).likes; }
  else { out.favorited = !has; }
  res.json(out);
}

router.post('/like/:id', requireLogin, (req, res) => toggle(req, res, 'likes'));
router.post('/favorite/:id', requireLogin, (req, res) => toggle(req, res, 'favorites'));

module.exports = router;
