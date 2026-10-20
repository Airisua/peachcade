'use strict';
const { db } = require('./db');
const tagHubs = require('./tags');

function decodeEntities(s) {
  if (s == null) return '';
  let str = String(s);
  if (str.indexOf('&') === -1) return str;
  const named = {
    '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#039;': "'",
    '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&bull;': '•', '&times;': '×',
    '&hellip;': '…', '&trade;': '™', '&copy;': '©', '&reg;': '®',
    '&rsquo;': "'", '&lsquo;': "'", '&rdquo;': '"', '&ldquo;': '"',
    '&middot;': '·', '&amp;': '&'
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const [k, v] of Object.entries(named)) {
      if (str.indexOf(k) >= 0) str = str.split(k).join(v);
    }
    str = str.replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return _; }
    });
    str = str.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return _; }
    });
  }
  return str;
}

function gt(game, lang) { if (!game) return ''; if (lang === 'zh' && game.title_zh) return decodeEntities(game.title_zh); if (lang === 'ja' && game.title_ja) return decodeEntities(game.title_ja); return decodeEntities(game.title_en); }
function gd(game, lang) { if (!game) return ''; if (lang === 'zh' && game.desc_zh) return decodeEntities(game.desc_zh); if (lang === 'ja' && game.desc_ja) return decodeEntities(game.desc_ja); return decodeEntities(game.desc_en); }
function gh(game, lang) { if (!game) return ''; if (lang === 'zh' && game.howto_zh) return decodeEntities(game.howto_zh); if (lang === 'ja' && game.howto_ja) return decodeEntities(game.howto_ja); return decodeEntities(game.howto_en); }

const SORTS = {
  popular: 'g.plays DESC, g.created_at DESC, g.id DESC',
  new: 'g.created_at DESC, g.id DESC',
  likes: 'g.likes DESC, g.created_at DESC, g.id DESC',
  name: 'g.title_en COLLATE NOCASE ASC',
  // admin "how hot is this game" views
  heat: 'g.plays DESC, g.likes DESC, g.id ASC',
  least: 'g.plays ASC, g.likes ASC, g.id ASC',
  favorites: 'favs DESC, g.plays DESC, g.id ASC',
  comments: 'cmts DESC, g.plays DESC, g.id ASC',
  oldest: 'g.created_at ASC, g.id ASC'
};

// extra counters, only selected when a caller asks for them (admin listings)
const STAT_COLUMNS = ', (SELECT COUNT(*) FROM favorites f WHERE f.game_id=g.id) AS favs, (SELECT COUNT(*) FROM comments cm WHERE cm.game_id=g.id AND cm.hidden=0) AS cmts';

const GAME_SELECT = 'SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja FROM games g LEFT JOIN categories c ON c.slug=g.category ';

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Homepage "featured" rotation.
// - admin picked featured games (published only) are shown in a random order, so the
//   homepage changes on every visit without any admin action;
// - when nothing is featured yet, fall back to a random mix of the most popular and
//   best rated published games.
function featuredRotation(limit) {
  const want = Math.min(24, Math.max(1, parseInt(limit, 10) || 8));
  const picked = db.prepare(GAME_SELECT + 'WHERE g.published=1 AND g.featured=1 ORDER BY g.plays DESC, g.id ASC LIMIT 40').all();
  if (picked.length) return shuffle(picked).slice(0, want);
  const pool = db.prepare(GAME_SELECT + 'WHERE g.published=1 ORDER BY g.plays DESC, g.id ASC LIMIT 24').all()
    .concat(db.prepare(GAME_SELECT + 'WHERE g.published=1 ORDER BY g.likes DESC, g.id ASC LIMIT 24').all());
  const seen = new Set();
  const uniq = [];
  for (const g of pool) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    uniq.push(g);
  }
  return shuffle(uniq).slice(0, want);
}

function listGames(opt) {
  const o = opt || {};
  const per = Math.min(60, Math.max(1, parseInt(o.per, 10) || 24));
  const where = [];
  const args = [];
  if (o.status === "unpublished") where.push("g.published=0");
  else if (o.status === "published") where.push("g.published=1");
  else if (o.status === "featured") where.push("g.featured=1");
  else if (!o.includeUnpublished) where.push("g.published=1");
  if (o.category) { where.push('g.category=?'); args.push(o.category); }
  if (o.tag) {
    where.push('(g.tags LIKE ? OR instr(lower(g.tags), ?) > 0)');
    args.push('%' + o.tag + '%', o.tag.toLowerCase());
  }
  if (o.q) {
    where.push('(g.title_en LIKE ? OR g.title_zh LIKE ? OR g.title_ja LIKE ? OR g.tags LIKE ? OR g.slug LIKE ?)');
    const like = '%' + o.q + '%';
    args.push(like, like, like, like, like);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = SORTS[o.sort] || SORTS.popular;
  const total = db.prepare('SELECT COUNT(*) n FROM games g ' + w).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, parseInt(o.page, 10) || 1), pages);
  const rows = db.prepare(GAME_SELECT.replace(' FROM games g', (o.withStats ? STAT_COLUMNS : '') + ' FROM games g') + w + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?').all(...args, per, (page - 1) * per);
  return { games: rows, total, page, pages };
}


let popularTagsCache = { at: 0, tags: [] };
function getPopularTags(limit = 40) {
  const want = Math.min(200, Math.max(1, parseInt(limit, 10) || 40));
  if (Date.now() - popularTagsCache.at < 3600000 && popularTagsCache.tags.length) {
    return popularTagsCache.tags.slice(0, want);
  }
  try {
    const rows = db.prepare('SELECT tags FROM games WHERE published=1 AND length(tags) > 0 ORDER BY plays DESC LIMIT 2500').all();
    const counts = {};
    const ignore = new Set(['gamemonetize', 'ext', 'rss', 'json', 'mapi-games']);
    for (const r of rows) {
      if (!r.tags) continue;
      const parts = r.tags.split(',');
      for (let t of parts) {
        t = t.trim().toLowerCase();
        if (t && t.length >= 2 && t.length <= 30 && !ignore.has(t)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    const list = Object.entries(counts)
      .filter(([tag, c]) => c >= 1 && !tagHubs.BLOCKED.has(tag))
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => {
        const hub = tagHubs.resolve(tag);
        return { tag, count, slug: hub.slug, display: hub.display };
      });
    popularTagsCache = { at: Date.now(), tags: list };
    return list.slice(0, want);
  } catch (e) {
    return [];
  }
}

module.exports = { gt, gd, gh, listGames, featuredRotation, shuffle, SORTS, getPopularTags };
