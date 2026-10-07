'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db, getSetting } = require('../db');
const { setAuth, clearAuth, requireLogin } = require('../auth');
const { rateLimit } = require('../ratelimit');

const limiter = rateLimit({ windowMs: 15 * 60000, max: 20, scope: 'auth' });

function safeNext(raw) {
  const s = String(raw || '');
  return s.startsWith('/') && !s.startsWith('//') ? s : null;
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { pageTitle: res.locals.t('auth.loginTitle'), error: null, username: '', next: safeNext(req.query.next) });
});

router.post('/login', limiter, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).render('login', { pageTitle: res.locals.t('auth.loginTitle'), error: res.locals.t('err.invalidCredentials'), username, next });
  }
  if (user.banned) {
    return res.status(403).render('login', { pageTitle: res.locals.t('auth.loginTitle'), error: res.locals.t('err.banned'), username, next });
  }
  setAuth(res, user);
  res.redirect(next || '/');
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  if (getSetting('registration_open', '1') !== '1') {
    return res.status(403).render('error', { status: 403, message: res.locals.t('err.registrationClosed') });
  }
  res.render('register', { pageTitle: res.locals.t('auth.registerTitle'), error: null, username: '', email: '' });
});

router.post('/register', limiter, (req, res) => {
  if (getSetting('registration_open', '1') !== '1') {
    return res.status(403).render('error', { status: 403, message: res.locals.t('err.registrationClosed') });
  }
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fail = (msg) => res.status(400).render('register', { pageTitle: res.locals.t('auth.registerTitle'), error: msg, username, email });
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail(res.locals.t('err.invalidUsername'));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res.locals.t('err.invalidEmail'));
  if (password.length < 6 || password.length > 72) return fail(res.locals.t('err.shortPassword'));
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return fail(res.locals.t('err.usernameTaken'));
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res.locals.t('err.emailTaken'));
  const info = db.prepare('INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,?)').run(username, email, bcrypt.hashSync(password, 10), 'user');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  setAuth(res, user);
  res.redirect('/?ok=registered');
});

router.post('/logout', (req, res) => {
  clearAuth(res);
  res.redirect('/');
});

router.get('/profile', requireLogin, (req, res) => {
  const favorites = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh FROM favorites f JOIN games g ON g.id=f.game_id LEFT JOIN categories c ON c.slug=g.category WHERE f.user_id=? ORDER BY f.created_at DESC').all(req.user.id);
  const history = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, MAX(p.created_at) AS last_play FROM plays_log p JOIN games g ON g.id=p.game_id LEFT JOIN categories c ON c.slug=g.category WHERE p.user_id=? GROUP BY g.id ORDER BY last_play DESC LIMIT 12').all(req.user.id);
  const comments = db.prepare('SELECT cm.*, g.slug AS game_slug, g.title_en AS game_title_en, g.title_zh AS game_title_zh FROM comments cm JOIN games g ON g.id=cm.game_id WHERE cm.user_id=? ORDER BY cm.created_at DESC LIMIT 50').all(req.user.id);
  res.render('profile', { pageTitle: res.locals.t('profile.title'), favorites, history, comments });
});

router.post('/profile/password', requireLogin, (req, res) => {
  const oldP = String(req.body.old_password || '');
  const newP = String(req.body.new_password || '');
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(oldP, row.password_hash)) return res.redirect('/profile?err=wrongPassword');
  if (newP.length < 6) return res.redirect('/profile?err=shortPassword');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newP, 10), req.user.id);
  res.redirect('/profile?ok=password');
});

module.exports = router;
