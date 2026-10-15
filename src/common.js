'use strict';
const { db, getSetting } = require('./db');
const { gt, gd, gh } = require('./queries');
const { ASSET_VERSION } = require('./assets');

const OK_CODES = ['saved', 'created', 'updated', 'deleted', 'password', 'comment', 'login', 'registered'];
const ERR_CODES = ['commentEmpty', 'commentLong', 'wrongPassword', 'slugTaken', 'fileType', 'fileTooBig', 'badRequest', 'notFound', 'forbidden', 'registrationClosed', 'importFailed'];

function common(req, res, next) {
  const lang = req.lang;
  res.locals.path = req.path;
  res.locals.assetV = ASSET_VERSION;
  res.locals.year = new Date().getFullYear();
  res.locals.siteUrl = String(process.env.SITE_URL || (req.protocol + '://' + (req.get('host') || 'localhost'))).replace(/\/+$/, '');
  res.locals.site = {
    name: getSetting('site_name', 'PixelPlay'),
    tagline: lang === 'zh' ? getSetting('tagline_zh', '') : getSetting('tagline_en', ''),
    footerText: lang === 'zh' ? getSetting('footer_text_zh', '') : getSetting('footer_text_en', '')
  };
  const cats = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM games g WHERE g.category=c.slug AND g.published=1) AS n FROM categories c ORDER BY c.sort, c.slug').all();
  res.locals.categories = cats;
  res.locals.navCategories = cats.filter((c) => c.n > 0);
  res.locals.adsEnabled = getSetting('ads_enabled', '1') === '1';
  res.locals.adFor = (slot) => (res.locals.adsEnabled ? db.prepare('SELECT * FROM ads WHERE slot=? AND enabled=1 ORDER BY sort, id LIMIT 1').get(slot) : null);
  res.locals.gt = (g) => gt(g, lang);
  res.locals.gd = (g) => gd(g, lang);
  res.locals.gh = (g) => gh(g, lang);
  res.locals.catName = (c) => (!c ? '' : (lang === 'zh' ? c.name_zh : c.name_en));
  // icon sprite id for a category (falls back to the generic gamepad for new/unknown slugs)
  const CAT_ICONS = ['puzzle', 'arcade', 'action', 'casual', 'skill', 'board', 'racing', 'shooting',
    'sports', 'platform', 'adventure', 'simulation', 'clicker', 'girls'];
  res.locals.catIcon = (c) => {
    const slug = typeof c === 'string' ? c : (c && c.slug) || '';
    return '/img/icons.svg#i-cat-' + (CAT_ICONS.indexOf(slug) >= 0 ? slug : 'arcade');
  };
  res.locals.fmt = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  };
  res.locals.fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const ok = req.query.ok;
  res.locals.okMsg = ok && OK_CODES.includes(ok) ? res.locals.t('ok.' + ok) : null;
  const err = req.query.err;
  res.locals.errMsg = err && ERR_CODES.includes(err) ? res.locals.t('err.' + err) : null;
  next();
}

module.exports = common;
