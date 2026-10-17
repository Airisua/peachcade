'use strict';
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { listGames } = require('../queries');
const { requireLogin } = require('../auth');

const CPALEAD_POSTBACK_PASSWORD = process.env.CPALEAD_PASSWORD || 'peachcade123';

router.get('/postback/cpalead', (req, res) => {
  const pwd = String(req.query.password || '').trim();
  if (CPALEAD_POSTBACK_PASSWORD && pwd && pwd !== CPALEAD_POSTBACK_PASSWORD) {
    return res.status(403).send('Forbidden: invalid password');
  }
  const leadId = String(req.query.lead_id || '').trim();
  if (!leadId) {
    return res.status(400).send('Missing lead_id');
  }
  const subid = String(req.query.subid || '').slice(0, 100);
  const campaignId = String(req.query.campaign_id || '').slice(0, 100);
  const campaignName = String(req.query.campaign_name || '').slice(0, 255);
  const payout = parseFloat(req.query.payout) || 0;
  const country = String(req.query.country_iso || req.query.country_code || '').slice(0, 10);

  try {
    db.prepare('INSERT OR IGNORE INTO cpa_leads(lead_id, subid, campaign_id, campaign_name, payout, country_iso) VALUES(?,?,?,?,?,?)')
      .run(leadId, subid, campaignId, campaignName, payout, country);
  } catch (e) {
    // duplicate lead or db busy; return 200 so CPAlead knows callback was delivered
  }
  res.status(200).send('OK');
});

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
