'use strict';

// Game feed importers. The importer runs server-side inside the admin panel
// and only fetches URLs typed by an administrator (trusted input), so there is
// no SSRF surface for regular visitors.

const FETCH_TIMEOUT_MS = 20000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'PixelPlay-GameImporter/1.0 (+self-hosted portal)', accept: '*/*' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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

function mapCategory(raw, cats) {
  const c = String(raw || '').toLowerCase().trim();
  if (!c) return 'casual';
  for (const row of cats || []) {
    if (c === String(row.name_en || '').toLowerCase() || c === String(row.slug || '')) return row.slug;
  }
  if (/(shoot|action|fight|battle|war|adventure|zombie|survival)/.test(c)) return 'action';
  if (/(puzzle|logic|brain|match|number|word|quiz|escape|hidden)/.test(c)) return 'puzzle';
  if (/(arcade|retro|classic|platform|runner|clicker|idle)/.test(c)) return 'arcade';
  if (/(skill|agility|reflex|sport|racing|drift|run|jump|bike|car)/.test(c)) return 'skill';
  if (/(board|card|chess|tile|mahjong|solitaire|match-3|bubble)/.test(c)) return 'board';
  return 'casual';
}

module.exports = { list, fetchGames, slugFor, slugify, tagsFor, mapCategory, __test: { parseRssItems, parseJsonItems } };
