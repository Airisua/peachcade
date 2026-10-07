'use strict';
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user) { return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' }); }
function setAuth(res, user) { res.cookie('token', sign(user), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 }); }
function clearAuth(res) { res.clearCookie('token'); }

function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies && req.cookies.token;
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      const u = db.prepare('SELECT id,username,email,role,banned,created_at FROM users WHERE id=?').get(payload.uid);
      if (u && !u.banned) req.user = u;
    } catch (e) { /* invalid token */ }
  }
  res.locals.user = req.user;
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if ((req.originalUrl || '').startsWith('/api')) return res.status(401).json({ error: 'auth' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl || '/'));
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if ((req.originalUrl || '').startsWith('/api')) return res.status(403).json({ error: 'forbidden' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl || '/'));
}

module.exports = { sign, setAuth, clearAuth, loadUser, requireLogin, requireAdmin, SECRET };
