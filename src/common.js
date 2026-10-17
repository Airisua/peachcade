
function ratingFor(game) {
  const likes = Number((game && game.likes) || 0);
  const plays = Number((game && game.plays) || 0);
  const base = 4.3;
  const ratio = plays > 0 ? (likes / plays) : 0.08;
  const scoreNum = Math.min(4.9, Math.max(4.2, base + Math.min(0.6, ratio * 4) + (likes > 50 ? 0.1 : 0)));
  const percent = Math.round((scoreNum / 5.0) * 100);
  const votes = Math.max(likes, 1);
  return {
    score: scoreNum.toFixed(1),
    percent,
    votes
  };
}

'use strict';
const { db, getSetting } = require('./db');
const { gt, gd, gh, getPopularTags } = require('./queries');
const { ASSET_VERSION } = require('./assets');

const OK_CODES = ['saved', 'created', 'updated', 'deleted', 'password', 'comment', 'login', 'registered'];
const ERR_CODES = ['commentEmpty', 'commentLong', 'wrongPassword', 'slugTaken', 'fileType', 'fileTooBig', 'badRequest', 'notFound', 'forbidden', 'registrationClosed', 'importFailed'];

// One game cover per category for the "browse by category" cards. The picks are refreshed
// every 10 minutes: the homepage keeps rotating through covers without re-rolling on every
// request (which would defeat image caching).
const CATEGORY_SAMPLE_TTL_MS = 10 * 60 * 1000;
let categorySampleCache = { at: 0, map: {} };
function categorySamples() {
  if (Date.now() - categorySampleCache.at < CATEGORY_SAMPLE_TTL_MS) return categorySampleCache.map;
  const map = {};
  try {
    // one random published game per category (joined, so slug and thumb always belong together)
    const rows = db.prepare('SELECT c.slug AS category, g.slug AS slug, g.thumb AS thumb FROM categories c LEFT JOIN games g ON g.id = (SELECT x.id FROM games x WHERE x.category=c.slug AND x.published=1 ORDER BY RANDOM() LIMIT 1)').all();
    for (const r of rows) if (r.thumb && r.slug) map[r.category] = { slug: r.slug, thumb: r.thumb };
  } catch (e) {
    return categorySampleCache.map;
  }
  categorySampleCache = { at: Date.now(), map };
  return map;
}

const CATEGORY_CACHE_TTL_MS = 30 * 1000;
let categoryCache = { at: 0, rows: [] };
function getCategoriesWithCount() {
  if (Date.now() - categoryCache.at < CATEGORY_CACHE_TTL_MS && categoryCache.rows.length) {
    return categoryCache.rows;
  }
  const rows = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM games g WHERE g.category=c.slug AND g.published=1) AS n FROM categories c ORDER BY c.sort, c.slug').all();
  categoryCache = { at: Date.now(), rows };
  return rows;
}
function invalidateCategoryCache() {
  categoryCache = { at: 0, rows: [] };
  categorySampleCache = { at: 0, map: {} };
}

function common(req, res, next) {
  const lang = req.lang;
  res.locals.path = req.path;
  res.locals.assetV = ASSET_VERSION;
  res.locals.year = new Date().getFullYear();
  res.locals.siteUrl = String(process.env.SITE_URL || (req.protocol + '://' + (req.get('host') || 'localhost'))).replace(/\/+$/, '');
  const taglines = {
    zh: getSetting('tagline_zh', '免费免下载在线小游戏 · 即点即玩'),
    ja: getSetting('tagline_ja', '無料・ダウンロード不要のオンラインブラウザゲーム · 今すぐ遊べる'),
    en: getSetting('tagline_en', 'Free Online Browser Games — Play Instantly')
  };
  const footerTexts = {
    zh: getSetting('footer_text_zh', ''),
    ja: getSetting('footer_text_ja', ''),
    en: getSetting('footer_text_en', '')
  };
  res.locals.site = {
    name: getSetting('site_name', 'Peachcade'),
    tagline: taglines[lang] || taglines.en,
    footerText: footerTexts[lang] || footerTexts.en
  };
  const cats = getCategoriesWithCount().map((c) => ({ ...c }));
  const samples = categorySamples();
  for (const c of cats) c.sample_thumb = (c.n > 0 && samples[c.slug]) ? samples[c.slug] : null;
  res.locals.categories = cats;
  res.locals.navCategories = cats.filter((c) => c.n > 0);
  res.locals.popularTags = getPopularTags(18);
  res.locals.ratingFor = ratingFor;
  res.locals.adsEnabled = getSetting('ads_enabled', '1') === '1';
  res.locals.adFor = (slot) => (res.locals.adsEnabled ? db.prepare('SELECT * FROM ads WHERE slot=? AND enabled=1 ORDER BY sort, id LIMIT 1').get(slot) : null);
  res.locals.gt = (g) => gt(g, lang);
  res.locals.gd = (g) => gd(g, lang);
  res.locals.gh = (g) => gh(g, lang);
  res.locals.catName = (c) => (!c ? '' : (lang === 'zh' ? (c.name_zh || c.name_en) : (lang === 'ja' ? (c.name_ja || c.name_en) : c.name_en)));
  // thumbnails: provider images are proxied and resized by /thumb/<slug>.<size>.jpg
  // (see src/thumbs.js); local assets (built-in games, uploads) are served as-is
  res.locals.thumb = (g, size) => {
    if (!g) return '';
    const url = typeof g === 'string' ? String(g) : String(g.thumb || '');
    const slug = typeof g === 'string' ? '' : g.slug;
    if (slug && /^https?:\/\//i.test(url)) return '/thumb/' + slug + '.' + (size || 'card') + '.jpg';
    return url || '/img/games/default.svg';
  };
  // icon sprite id for a category (falls back to the generic gamepad for new/unknown slugs)
  const CAT_ICONS = ['puzzle', 'arcade', 'action', 'casual', 'skill', 'board', 'racing', 'shooting',
    'sports', 'platform', 'adventure', 'simulation', 'clicker', 'girls'];
  res.locals.catIcon = (c) => {
    const slug = typeof c === 'string' ? c : (c && c.slug) || '';
    return '/img/icons.svg?v=' + ASSET_VERSION + '#i-cat-' + (CAT_ICONS.indexOf(slug) >= 0 ? slug : 'arcade');
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
    const localeMap = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' };
    return d.toLocaleDateString(localeMap[lang] || 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const ok = req.query.ok;
  res.locals.okMsg = ok && OK_CODES.includes(ok) ? res.locals.t('ok.' + ok) : null;
  const err = req.query.err;
  res.locals.errMsg = err && ERR_CODES.includes(err) ? res.locals.t('err.' + err) : null;
  next();
}

common.invalidateCategoryCache = invalidateCategoryCache;
module.exports = common;
