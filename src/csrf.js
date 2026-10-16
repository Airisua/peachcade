'use strict';
const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  if (req.path.endsWith('.xml') || req.path.endsWith('.txt')) return next();
  if (!req.cookies.csrf) {
    const t = crypto.randomBytes(16).toString('hex');
    res.cookie('csrf', t, { sameSite: 'lax', httpOnly: false });
    req.cookies.csrf = t;
  }
  res.locals.csrf = req.cookies.csrf;
  next();
}

function isValid(req) {
  const t = (req.body && req.body._csrf) || req.get('x-csrf-token');
  return !!(t && req.cookies.csrf && t === req.cookies.csrf);
}

function csrfGuard(req, res, next) {
  if (req.method !== 'POST') return next();
  if (req.is('multipart/form-data')) return next();
  if (isValid(req)) return next();
  if ((req.originalUrl || '').startsWith('/api')) return res.status(403).json({ error: 'csrf' });
  res.status(403).render('error', { status: 403, message: res.locals.t('err.forbidden') });
}

module.exports = { csrfMiddleware, csrfGuard, isValid };
