'use strict';
const buckets = new Map();

function rateLimit(opts) {
  const windowMs = (opts && opts.windowMs) || 15 * 60000;
  const max = (opts && opts.max) || 20;
  const scope = (opts && opts.scope) || 'default';
  return function (req, res, next) {
    const key = scope + '|' + (req.ip || 'x');
    const now = Date.now();
    const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      if ((req.originalUrl || '').startsWith('/api')) return res.status(429).json({ error: 'rate' });
      return res.status(429).render('error', { status: 429, message: res.locals.t('err.rateLimited') });
    }
    list.push(now);
    buckets.set(key, list);
    next();
  };
}

module.exports = { rateLimit };
