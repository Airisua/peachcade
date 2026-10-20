'use strict';
// Tag hubs are the long tail of the catalog: 500+ provider tags, many of them
// near-duplicates of each other ("car" / "cars", "3d" / "3d-games") or too broad
// to describe anything ("game", "fun", "html5"). This module centralises three
// decisions so the routes and views cannot drift apart:
//   1. which tag spelling is canonical (the rest 301 to it),
//   2. which tags are too generic to index at all,
//   3. what the related-tag / per-category tag links look like.
const { db } = require('./db');

// Tags that describe the whole catalog rather than a slice of it. They stay
// usable as filters but are never indexed and never appear in tag directories.
const BLOCKED = new Set([
  'game', 'games', 'fun', 'best', 'new', 'html5', 'android', 'mobile',
  'online', 'webgl', 'browser', 'free', 'play', 'games-for-kids',
  '1-player', 'single-player'
]);

// Provider spelling variants. The key 301s to the canonical value so two URLs
// never compete for the same query, and the sitemap only lists one of them.
const ALIASES = {
  cars: 'car',
  boy: 'boys',
  girl: 'girls',
  '3d-games': '3d',
  '2d-games': '2d',
  'io-games': 'io',
  '2-player-games': '2-player',
  '2player': '2-player',
  'multiplayer-games': 'multiplayer',
  dressup: 'dress-up',
  'dress-up-games': 'dress-up',
  pointandclick: 'point-and-click',
  'point-and-click-games': 'point-and-click',
  'clicker-games': 'clicker',
  'clicking-games': 'clicker',
  'match3': 'match-3',
  'match3-games': 'match-3',
  'match-3-games': 'match-3',
  'tower-defense-games': 'tower-defense',
  'towerdefense': 'tower-defense',
  'endless-runner': 'endless-running',
  'runner-games': 'endless-running',
  'idle-games': 'idle',
  'simulation-games': 'simulation',
  'management-games': 'management',
  'escape-games': 'escape',
  'merge-games': 'merge',
  'brain-games': 'brain',
  'puzzle-games': 'puzzle',
  'racing-games': 'racing',
  'shooting-games': 'shooting',
  'sports-games': 'sports',
  'horror-games': 'horror',
  'zombie-games': 'zombie',
  'football-games': 'football',
  'soccer-games': 'soccer',
  'basketball-games': 'basketball',
  'bike-games': 'bike',
  'motorbike-games': 'motorbike',
  'truck-games': 'truck',
  'parking-games': 'parking',
  'fishing-games': 'fishing',
  'cooking-games': 'cooking',
  'makeup-games': 'makeup',
  'make-up': 'makeup',
  'animal-games': 'animal',
  'cat-games': 'cat',
  'dog-games': 'dog',
  'horse-games': 'horse',
  'farm-games': 'farm',
  'war-games': 'war',
  'army-games': 'army',
  'battle-games': 'battle',
  'fighting-games': 'fighting',
  'platformer-games': 'platformer',
  'adventure-games': 'adventure',
  'action-games': 'action',
  'arcade-games': 'arcade',
  'casual-games': 'casual',
  'hyper-casual': 'hypercasual',
  'hypercasual-games': 'hypercasual',
  'one-button': '1-button',
  'onebutton': '1-button'
};

// Display casing for tags that are meaningless when title-cased naively.
const DISPLAY = {
  io: 'IO',
  '3d': '3D',
  '2d': '2D',
  'html5': 'HTML5',
  'pvp': 'PvP',
  'pve': 'PvE',
  'fps': 'FPS',
  'rpg': 'RPG',
  'mmo': 'MMO',
  'rts': 'RTS',
  'tps': 'TPS',
  'vr': 'VR',
  'ai': 'AI',
  '2-player': '2 Player',
  '1-button': '1 Button',
  '1-player': '1 Player',
  '4x4': '4x4',
  '2048': '2048'
};

function normalize(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

// Resolve a URL slug to the canonical tag hub. `redirect` is true when the
// requested spelling is an alias and the caller should issue a 301.
function resolve(raw) {
  const slug = normalize(raw);
  const canonicalSlug = ALIASES[slug] || slug;
  return {
    slug: canonicalSlug,
    tag: canonicalSlug.replace(/-/g, ' '),
    display: DISPLAY[canonicalSlug] || canonicalSlug
      .split('-')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' '),
    blocked: BLOCKED.has(canonicalSlug),
    redirect: canonicalSlug !== slug ? canonicalSlug : '',
    valid: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonicalSlug) && canonicalSlug.length <= 40
  };
}

// Titles are shown in the intro copy, so keep them short and strip newlines.
function cleanTitle(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 70);
}

// Data-driven intro paragraph: real counts and real top games instead of spun
// text, which is also what keeps 500 tag pages from looking like duplicates.
function intro(lang, opt) {
  const o = opt || {};
  const tag = o.display || '';
  const count = Number(o.count) || 0;
  const tops = (o.tops || []).map(cleanTitle).filter(Boolean).slice(0, 3);
  const list1 = tops[0] || '';
  const list2 = tops[1] || '';
  const list3 = tops[2] || '';
  const numbered = Number(count).toLocaleString('en-US');

  if (lang === 'zh') {
    const s = 'Peachcade 目前收录了 ' + numbered + ' 款免费 ' + tag + ' 游戏，全部可直接在浏览器中打开游玩，无需下载、无需安装、无需注册。';
    const tail = tops.length >= 3
      ? '其中人气最高的是《' + list1 + '》，紧随其后的是《' + list2 + '》与《' + list3 + '》。'
      : (tops.length === 1 ? '目前人气最高的是《' + list1 + '》。' : '');
    return s + tail + '你可以使用上方的排序按钮，按最新上线、最多点赞或名称顺序浏览。';
  }
  if (lang === 'ja') {
    const s = 'Peachcade には無料で遊べる' + tag + 'ゲームが' + numbered + '本収録されています。すべてブラウザで直接プレイでき、ダウンロードもインストールも登録も不要です。';
    const tail = tops.length >= 3
      ? '現在もっとも人気なのは『' + list1 + '』、続いて『' + list2 + '』『' + list3 + '』です。'
      : (tops.length === 1 ? '現在もっとも人気なのは『' + list1 + '』です。' : '');
    return s + tail + '上の並び替えボタンから、新着順・いいね順・名前順で探せます。';
  }
  const noun = count === 1 ? ' game' : ' games';
  const s = 'Peachcade currently has ' + numbered + ' free ' + tag + noun + ', ' + (count === 1 ? 'playable' : 'all playable') + ' instantly in your browser with no downloads, installs, or sign-up.';
  const tail = tops.length >= 3
    ? ' The most played right now is ' + list1 + ', followed by ' + list2 + ' and ' + list3 + '.'
    : (tops.length === 1 ? ' The most played right now is ' + list1 + '.' : '');
  return s + tail + ' Use the sort tabs above to browse by newest, most liked, or A–Z.';
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = { related: new Map(), category: new Map(), all: { at: 0, list: [] } };

function invalidate() {
  cache.related.clear();
  cache.category.clear();
  cache.all = { at: 0, list: [] };
}

const IGNORE_TOKENS = new Set(['gamemonetize', 'ext', 'rss', 'json', 'mapi-games']);

function countTokens(rows, bump) {
  const counts = new Map();
  for (const r of rows) {
    const raw = r && r.tags;
    if (!raw) continue;
    for (let t of String(raw).split(',')) {
      t = normalize(t);
      if (!t || t.length < 2 || t.length > 30 || IGNORE_TOKENS.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const out = [];
  for (const [tag, count] of counts) {
    if (bump) bump(tag, count);
    out.push({ tag, count });
  }
  return out;
}

// Tags that keep showing up next to `slug`: a tag graph built from the catalog
// itself, so every hub links to genuinely related hubs.
function related(slug, limit) {
  const want = Math.min(30, Math.max(1, parseInt(limit, 10) || 12));
  const key = slug + ':' + want;
  const hit = cache.related.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list;
  try {
    const rows = db.prepare('SELECT tags FROM games WHERE published=1 AND (tags LIKE ? OR instr(lower(tags), ?) > 0) ORDER BY plays DESC LIMIT 600').all('%' + slug + '%', slug.replace(/-/g, ' '));
    const counts = new Map();
    for (const r of rows) {
      if (!r.tags) continue;
      for (let t of String(r.tags).split(',')) {
        t = normalize(t);
        if (!t || t === slug || t.length < 2 || t.length > 30 || IGNORE_TOKENS.has(t) || BLOCKED.has(t)) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const list = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, want)
      .map(([tag, count]) => {
        const r = resolve(tag);
        return { slug: r.slug, display: r.display, count };
      })
      .filter((t) => !t.slug.startsWith(slug + '-games'));
    if (list.length) cache.related.set(key, { at: Date.now(), list });
    return list;
  } catch (e) {
    return [];
  }
}

// Tag strip for a category landing page: the strongest slices inside that
// category, not the global popularity list.
function forCategory(category, limit) {
  const want = Math.min(24, Math.max(1, parseInt(limit, 10) || 10));
  const key = category + ':' + want;
  const hit = cache.category.get(category);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list.slice(0, want);
  try {
    const rows = db.prepare('SELECT tags FROM games WHERE published=1 AND category=? ORDER BY plays DESC LIMIT 1200').all(category);
    const counts = new Map();
    for (const r of rows) {
      if (!r.tags) continue;
      for (let t of String(r.tags).split(',')) {
        t = normalize(t);
        if (!t || t === category || t.length < 2 || t.length > 30 || IGNORE_TOKENS.has(t) || BLOCKED.has(t)) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const list = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([tag, count]) => {
        const r = resolve(tag);
        return { slug: r.slug, display: r.display, count };
      });
    if (list.length) cache.category.set(category, { at: Date.now(), list });
    return list.slice(0, want);
  } catch (e) {
    return [];
  }
}

// Full indexable directory for /tags and sitemap-tags.xml.
function all() {
  if (cache.all.list.length && Date.now() - cache.all.at < CACHE_TTL_MS) return cache.all.list;
  try {
    const rows = db.prepare('SELECT tags FROM games WHERE published=1 AND length(tags) > 0 ORDER BY plays DESC LIMIT 12000').all();
    const counts = new Map();
    for (const item of countTokens(rows)) counts.set(item.tag, item.count);
    // fold aliases into their canonical tag so counts are not split in two
    const merged = new Map();
    for (const [tag, count] of counts) {
      if (BLOCKED.has(tag)) continue;
      const canonical = ALIASES[tag] || tag;
      if (BLOCKED.has(canonical)) continue;
      merged.set(canonical, (merged.get(canonical) || 0) + count);
    }
    const list = [...merged.entries()]
      .filter(([, c]) => c >= 5)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => {
        const r = resolve(tag);
        return { slug: r.slug, display: r.display, tag: r.tag, count };
      });
    if (list.length) cache.all = { at: Date.now(), list };
    return list;
  } catch (e) {
    return [];
  }
}

module.exports = { resolve, normalize, intro, related, forCategory, all, invalidate, BLOCKED, ALIASES };
