'use strict';

// Game feed importers. The importer runs server-side inside the admin panel
// and only fetches URLs typed by an administrator (trusted input), so there is
// no SSRF surface for regular visitors.

const FETCH_TIMEOUT_MS = 20000;

// hosts that recently answered 429 are throttled locally so the admin UI
// fails fast with a clear notice instead of hammering the provider
const hostCooldown = new Map();
const COOLDOWN_MS = 90 * 1000;

async function fetchText(url) {
  let host = '';
  try { host = new URL(url).host; } catch (e) { host = ''; }
  const until = host ? hostCooldown.get(host) : 0;
  if (until && Date.now() < until) {
    const err = new Error('HTTP 429 (cooldown)');
    err.status = 429;
    throw err;
  }

  async function once() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'Peachcade-GameImporter/1.0 (+https://peachcat.fun)', accept: '*/*' }
      });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        if (res.status === 429 && host) hostCooldown.set(host, Date.now() + COOLDOWN_MS);
        throw err;
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    return await once();
  } catch (e) {
    // one delayed retry smooths over short hiccups (not sustained 429 throttles)
    if (e && (e.status === 408 || (e.status >= 500 && e.status <= 599))) {
      await new Promise((r) => setTimeout(r, 2500));
      return await once();
    }
    throw e;
  }
}

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

function stripTags(s) {
  return decodeEntities(String(s == null ? '' : s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function rssTag(block, name) {
  const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1] : '';
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const enclosure = b.match(/<enclosure[^>]*url="([^"]+)"/i);
    const media = b.match(/<media:(?:thumbnail|content)[^>]*url="([^"]+)"/i);
    const desc = stripTags(rssTag(b, 'description'));
    const imgInDesc = desc.match(/https?:\/\/[^\s"']+\.(?:png|jpe?g|webp|gif)/i);
    items.push({
      sourceId: stripTags(rssTag(b, 'id')) || stripTags(rssTag(b, 'guid')) || stripTags(rssTag(b, 'link')),
      title: stripTags(rssTag(b, 'title')),
      description: desc,
      instructions: stripTags(rssTag(b, 'instructions')),
      category: stripTags(rssTag(b, 'category')),
      tags: stripTags(rssTag(b, 'tags')),
      url: stripTags(rssTag(b, 'url')) || stripTags(rssTag(b, 'link')),
      thumb: stripTags(rssTag(b, 'thumb')) || stripTags(rssTag(b, 'thumbnail')) ||
        (enclosure ? enclosure[1] : '') || (media ? media[1] : '') || (imgInDesc ? imgInDesc[0] : ''),
      width: stripTags(rssTag(b, 'width')),
      height: stripTags(rssTag(b, 'height'))
    });
  }
  return items;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return '';
}

function normalizeJsonItem(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    sourceId: String(pick(o, ['id', 'game_id', 'gameId', 'slug']) || ''),
    title: String(pick(o, ['title', 'name', 'game_name', 'gameName']) || ''),
    description: stripTags(pick(o, ['description', 'desc', 'game_description'])),
    instructions: String(pick(o, ['instructions', 'howto', 'how_to_play', 'controls']) || ''),
    category: String(pick(o, ['category', 'genre', 'cat']) || ''),
    tags: Array.isArray(o.tags) ? o.tags.join(', ') : String(pick(o, ['tags']) || ''),
    url: String(pick(o, ['url', 'link', 'embed_url', 'embedUrl', 'game_url', 'gameUrl', 'file', 'iframe']) || ''),
    thumb: String(pick(o, ['thumb', 'thumbnail', 'thumbnail_url', 'image', 'image_url', 'imageUrl', 'banner', 'cover', 'icon']) || ''),
    width: String(pick(o, ['width']) || ''),
    height: String(pick(o, ['height']) || '')
  };
}

function parseJsonItems(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Feed is not valid JSON'); }
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.games) ? data.games
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : null;
  if (!arr) throw new Error('JSON feed must be an array of games (or {games:[...]})');
  return arr.map(normalizeJsonItem);
}

const PROVIDERS = {
  gamemonetize: {
    id: 'gamemonetize',
    label: 'GameMonetize (public feed)',
    defaultUrl: 'https://gamemonetize.com/feed.php?format=json&num={num}&page={page}',
    parse: parseRssItems
  },
  rss: {
    id: 'rss',
    label: 'Custom RSS feed',
    defaultUrl: '',
    parse: parseRssItems
  },
  json: {
    id: 'json',
    label: 'Custom JSON feed (GameDistribution / GamePix / other)',
    defaultUrl: '',
    parse: parseJsonItems
  }
};

function list() {
  return Object.keys(PROVIDERS).map((k) => ({ id: PROVIDERS[k].id, label: PROVIDERS[k].label, defaultUrl: PROVIDERS[k].defaultUrl }));
}

async function fetchGames(opts) {
  const o = opts || {};
  const provider = PROVIDERS[o.provider] || PROVIDERS.gamemonetize;
  const num = Math.max(1, Math.min(48, parseInt(o.num, 10) || 24));
  const page = Math.max(1, parseInt(o.page, 10) || 1);
  let url = String(o.url || '').trim() || provider.defaultUrl;
  url = url.replace('{num}', String(num)).replace('{page}', String(page));
  if (!url) throw new Error('Feed URL is required');
  if (!/^https?:\/\//i.test(url)) throw new Error('Feed URL must start with http:// or https://');
  const text = await fetchText(url);
  const parsed = provider.parse(text) || [];
  const items = parsed.filter((it) => it.title && it.url).slice(0, num);
  return { provider: provider.id, url, items };
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function slugFor(providerName, item) {
  const idPart = String(item.sourceId || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14);
  const prefix = providerName === 'gamemonetize' ? 'gm' : providerName === 'json' ? 'ext' : 'rss';
  const base = slugify(item.title) || 'game';
  const suffix = idPart || Math.random().toString(36).slice(2, 8);
  return (base + '-' + prefix + '-' + suffix).slice(0, 80);
}

function tagsFor(providerName, rawTags) {
  const out = [];
  if (providerName === 'gamemonetize') out.push('gamemonetize');
  for (const part of String(rawTags || '').split(',')) {
    const t = part.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
    if (t && out.indexOf(t) === -1 && out.length < 6) out.push(t);
  }
  return out.join(',');
}

// Genre keywords, most specific first. Used for both the provider category string and
// (as a weaker signal) the provider tag list, so new categories keep filling up on import.
const CATEGORY_RULES = [
  ['board', /(\bboard\b|\bcards?\b|chess|checkers|mahjong|solitaire|poker|domino|bingo)/],
  ['puzzle', /(puzzle|logic|\bbrain\b|bubble|matching|match.?3|\bmatch\b|\bsort|\bmerge|number|\bword\b|quiz|jigsaw|hidden|sudoku)/],
  ['racing', /(racing|drift|kart|\bmoto|motorbike|monstertruck|\btruck|traffic|parking|\bdriving|driver|taxi|supercar|\brally|offroad|car.?tuning|\bcars?\b)/],
  ['sports', /(sport|soccer|football|basketball|billiard|snooker|\bpool\b|golf|tennis|baseball|boxing|hockey|skate|bowling|rugby|cricket)/],
  ['platform', /(obby|platform|parkour|obstacle|\bjump|\brunning|\brunner|climb)/],
  ['shooting', /(sniper|first.?person.?shooter|\bfps\b|\bgun\b|weapon|military|\barmy\b|\bwar\b|combat|\bbattle|csgo|shoot.?em.?up|\bshoot)/],
  ['clicker', /(clicker|\bidle\b|incremental|tycoon)/],
  ['simulation', /(simulat|\bsim\b|management|\bbuild|craft|sandbox|minecraft|\bfarm|cooking|\bcook\b|hospital|doctor|dentist|cleaning|\bhouse\b|\bcity\b)/],
  ['girls', /(\bgirls?\b|dress.?up|fashion|beauty|makeover|coloring|colouring)/],
  ['action', /(action|fight|brawl|\bbeat\b|zombie|superhero|impostor|attack)/],
  ['adventure', /(adventure|quest|explor|dungeon|survival|horror|maze|escape)/],
  ['arcade', /(arcade|retro|classic|highscore|endless)/],
  ['skill', /(skill|agility|reflex|precision|\baim\b)/]
];

// Categories a stronger tag signal is allowed to override (broad / catch-all buckets only).
const REFINABLE = ['arcade', 'casual', 'skill', 'action', 'adventure', 'puzzle'];

function ruleFor(text) {
  for (const [slug, re] of CATEGORY_RULES) {
    if (re.test(text)) return slug;
  }
  return '';
}

function mapCategory(raw, cats, tags) {
  const rawCat = String(raw || '').toLowerCase().trim();
  const rawTags = String(tags || '').toLowerCase().trim();
  const ctx = rawCat + ' ' + rawTags;
  // "Bubble Shooter" / fishing games are puzzles & casual games, not shooters
  const cleanup = (s) => {
    let t = s.replace(/bubble[\s-]*shoot\w*/g, ' ');
    if (/bubble|\bfish/.test(ctx)) t = t.replace(/\bshoot\w*|\bsniper\b|\bfps\b|\bgun\b|\bweapons?\b/g, ' ');
    return t.replace(/[\s_-]+/g, ' ').trim();
  };
  const c = cleanup(rawCat);
  const t = cleanup(rawTags);
  if (!c && !t) return 'casual';
  // provider category already matches one of our categories
  for (const row of cats || []) {
    const known = c === String(row.slug || '') || c === String(row.name_en || '').toLowerCase();
    if (!known) continue;
    if (REFINABLE.indexOf(row.slug) >= 0 && t) {
      const refined = ruleFor(t);
      if (refined && refined !== row.slug) return refined;
    }
    return row.slug;
  }
  const byCategory = ruleFor(c);
  if (byCategory) return byCategory;
  const byTags = ruleFor(t);
  if (byTags) return byTags;
  // provider "hypercasual" / "boys" / "kids" style buckets without a genre keyword
  if (/(casual|hypercasual|boys|kids|family|funny|one.?touch|multiplayer|io)/.test(c + ' ' + t)) return 'casual';
  return 'casual';
}

module.exports = { list, fetchGames, slugFor, slugify, tagsFor, mapCategory, __test: { parseRssItems, parseJsonItems } };
