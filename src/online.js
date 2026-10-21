'use strict';
const crypto = require('crypto');

/**
 * "Who is on the site right now" tracker.
 *
 * The site runs as a single Node process, so a Map is the whole story: every
 * page request refreshes that visitor's lastSeen, and anything older than
 * WINDOW_MS drops out. A restart resets the counter — which is the honest
 * behaviour for a live number, no history is implied.
 *
 * Deliberately NOT tracked: static assets, the admin panel itself (the person
 * watching the counter should not be counted), API calls and crawler plumbing.
 */

const ADMIN_BASE = process.env.ADMIN_BASE || '/wyj';
const WINDOW_MS = 5 * 60 * 1000;      // idle for 5 minutes = offline
const SWEEP_INTERVAL_MS = 60 * 1000;  // housekeeping cadence
const MAX_VISITORS = 20000;           // hard cap so a bot flood cannot grow forever
const RECENT_LIMIT = 40;
const TOP_LIMIT = 8;

const SKIP_PREFIXES = [
  '/css/', '/js/', '/img/', '/thumb/', '/uploads/',
  '/api/', '/favicon', '/robots.txt', '/sitemap', '/feed.xml',
  '/manifest', '/healthz', '/cdn-cgi/'
];

const visitors = new Map();
let lastSweep = 0;

function isTrackable(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const p = req.path || '/';
  if (p === ADMIN_BASE || p.indexOf(ADMIN_BASE + '/') === 0) return false;
  for (const prefix of SKIP_PREFIXES) {
    if (p.indexOf(prefix) === 0) return false;
  }
  return true;
}

function maskIp(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (!s) return '';
  if (s.indexOf(':') >= 0) return s.split(':').slice(0, 2).join(':') + '::';
  const parts = s.split('.');
  return parts.length === 4 ? parts[0] + '.' + parts[1] + '.x.x' : 'x.x.x.x';
}

// A compact "Chrome · Windows" label; the full UA is noise in an admin table.
function deviceLabel(ua) {
  const s = String(ua || '');
  let browser = 'Other';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Chrome\//i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s)) browser = 'Safari';
  else if (/bot|crawler|spider/i.test(s)) browser = 'Bot';
  let os = '';
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';
  return os ? browser + ' · ' + os : browser;
}

function keyFor(req) {
  if (req.user && req.user.id) return 'u:' + req.user.id;
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  return 'g:' + crypto.createHash('sha1').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const cutoff = now - WINDOW_MS;
  for (const [key, v] of visitors) {
    if (v.last < cutoff) visitors.delete(key);
  }
}

function evictIfNeeded() {
  if (visitors.size <= MAX_VISITORS) return;
  const entries = [...visitors.entries()].sort((a, b) => a[1].last - b[1].last);
  const drop = Math.ceil(entries.length * 0.1);
  for (let i = 0; i < drop; i++) visitors.delete(entries[i][0]);
}

function track(req) {
  if (!isTrackable(req)) return;
  const now = Date.now();
  sweep(now);
  const key = keyFor(req);
  const prev = visitors.get(key);
  const entry = prev || { key, first: now, hits: 0 };
  entry.last = now;
  entry.hits += 1;
  entry.path = req.path || '/';
  entry.userId = (req.user && req.user.id) || null;
  entry.username = (req.user && req.user.username) || '';
  entry.ip = maskIp(req.ip || (req.socket && req.socket.remoteAddress) || '');
  entry.device = deviceLabel(req.headers['user-agent']);
  visitors.set(key, entry);
  evictIfNeeded();
}

/**
 * Refresh an existing visitor without touching their page path.
 *
 * Used by the game-page heartbeat: someone who has been playing for 20 minutes
 * without navigating is still on the site, but a plain request counter would
 * have dropped them after 5. A heartbeat never rewrites `path` (otherwise every
 * long session would show up as "/api/ping" in the admin table), and a brand new
 * visitor gets the page they claim to be on, sanitised.
 */
function touch(req, fallbackPath) {
  const now = Date.now();
  sweep(now);
  const key = keyFor(req);
  const prev = visitors.get(key);
  if (prev) {
    prev.last = now;
    prev.hits += 1;
    return;
  }
  const claimed = typeof fallbackPath === 'string' ? fallbackPath.slice(0, 120) : '';
  visitors.set(key, {
    key,
    first: now,
    last: now,
    hits: 1,
    path: claimed.charAt(0) === '/' ? claimed : '/',
    userId: (req.user && req.user.id) || null,
    username: (req.user && req.user.username) || '',
    ip: maskIp(req.ip || (req.socket && req.socket.remoteAddress) || ''),
    device: deviceLabel(req.headers['user-agent'])
  });
  evictIfNeeded();
}

function middleware(req, res, next) {
  try {
    track(req);
  } catch (e) {
    // Never let a counter break a page render.
  }
  next();
}

function snapshot(now) {
  const at = now || Date.now();
  sweep(at);
  const cutoff = at - WINDOW_MS;
  let total = 0;
  let loggedIn = 0;
  const pages = new Map();
  const recent = [];
  for (const v of visitors.values()) {
    if (v.last < cutoff) continue;
    total++;
    if (v.userId) loggedIn++;
    pages.set(v.path, (pages.get(v.path) || 0) + 1);
    recent.push(v);
  }
  recent.sort((a, b) => b.last - a.last);
  const topPages = [...pages.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LIMIT)
    .map(([path, count]) => ({ path, count }));
  return {
    total,
    loggedIn,
    guests: total - loggedIn,
    windowMinutes: Math.round(WINDOW_MS / 60000),
    generatedAt: new Date(at).toISOString(),
    topPages,
    recent: recent.slice(0, RECENT_LIMIT).map((v) => ({
      username: v.username || '',
      loggedIn: !!v.userId,
      path: v.path,
      ip: v.ip,
      device: v.device,
      secondsAgo: Math.max(0, Math.round((at - v.last) / 1000)),
      hits: v.hits
    }))
  };
}

function reset() {
  visitors.clear();
  lastSweep = 0;
}

module.exports = { middleware, touch, snapshot, reset, WINDOW_MS };
