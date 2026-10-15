'use strict';
// Thumbnail cache / resizer.
//
// Provider thumbnails are 512x384 JPEGs (~70 KB) while the site shows them at ~384x216
// (cards), ~640x360 (hero) and 108x84 (category chips); pulling the full size for every
// tile makes the homepage download several MB from a third party we do not control.
// /thumb/<slug>.<size>.jpg fetches the original once, resizes it, caches the result on
// disk (inside DATA_DIR, so it survives container restarts) and serves it from our own
// domain with immutable caching. Anything unexpected falls back to the original URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(DATA_DIR, 'thumbs');

const SIZES = {
  card: [384, 216],
  hero: [640, 360],
  cat: [108, 84]
};

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const JPEG_QUALITY = 78;
// a source that failed is not retried for a while (a dead provider image must not turn every
// page view into a fresh 12 s fetch attempt)
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
// keep the on-disk derivative cache bounded; the oldest entries go first
const MAX_CACHE_FILES = 8000;
const PRUNE_EVERY = 100;

const inflight = new Map();
const failures = new Map();
let buildsSincePrune = 0;

function sizeFor(name) {
  return SIZES[String(name || '').toLowerCase()] || null;
}

function cacheFile(sourceUrl, size) {
  const hash = crypto.createHash('sha1').update(sourceUrl + '|' + size.join('x')).digest('hex').slice(0, 24);
  return path.join(CACHE_DIR, hash + '-' + size[0] + 'x' + size[1] + '.jpg');
}

async function fetchSource(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'PixelPlay-ThumbCache/1.0 (+self-hosted portal)', accept: 'image/*' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const type = String(res.headers.get('content-type') || '');
    if (type.indexOf('image/') !== 0) throw new Error('unexpected content-type: ' + type);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('source too large: ' + declared);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) throw new Error('source too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// Builds (or reuses) the derivative. Throws when it cannot be produced - callers fall back.
async function build(sourceUrl, size) {
  const file = cacheFile(sourceUrl, size);
  if (fs.existsSync(file)) return { file, created: false };
  const failedAt = failures.get(file);
  if (failedAt && Date.now() - failedAt < NEGATIVE_TTL_MS) throw new Error('source failed recently');
  const running = inflight.get(file);
  if (running) return running;
  const job = (async () => {
    try {
      const sharp = require('sharp');
      const input = await fetchSource(sourceUrl);
      const out = await sharp(input)
        .resize(size[0], size[1], { fit: 'cover', position: 'centre', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, progressive: true })
        .toBuffer();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const tmp = file + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, file);
      failures.delete(file);
      if (++buildsSincePrune >= PRUNE_EVERY) { buildsSincePrune = 0; pruneCache(MAX_CACHE_FILES); }
      return { file, created: true };
    } catch (e) {
      failures.set(file, Date.now());
      throw e;
    }
  })();
  inflight.set(file, job);
  try {
    return await job;
  } finally {
    inflight.delete(file);
  }
}

function cacheStats() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    let bytes = 0;
    for (const f of files) {
      try { bytes += fs.statSync(path.join(CACHE_DIR, f)).size; } catch (e) { /* ignore */ }
    }
    return { files: files.length, bytes };
  } catch (e) {
    return { files: 0, bytes: 0 };
  }
}

// Removes the least recently used derivatives until the cache holds at most max files.
function pruneCache(max) {
  const limit = Number(max) > 0 ? Number(max) : MAX_CACHE_FILES;
  let names;
  try {
    names = fs.readdirSync(CACHE_DIR);
  } catch (e) {
    return { removed: 0, files: 0 };
  }
  if (names.length <= limit) return { removed: 0, files: names.length };
  const entries = [];
  for (const name of names) {
    try {
      const st = fs.statSync(path.join(CACHE_DIR, name));
      entries.push({ name, used: Math.max(st.atimeMs || 0, st.mtimeMs || 0) });
    } catch (e) { /* ignore */ }
  }
  entries.sort((a, b) => a.used - b.used);
  let removed = 0;
  for (const e of entries) {
    if (names.length - removed <= limit) break;
    try { fs.unlinkSync(path.join(CACHE_DIR, e.name)); removed++; } catch (err) { /* ignore */ }
  }
  return { removed, files: names.length - removed };
}

module.exports = { build, sizeFor, cacheFile, cacheStats, pruneCache, SIZES, CACHE_DIR, MAX_CACHE_FILES };
