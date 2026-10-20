'use strict';
// Host canonicalisation. The catalog must live on exactly one hostname: when
// both apex and www answer 200 with a self-canonical, Google splits the 38k
// pages between two origins.
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/;

// Returns the host to 301 to, or '' when the request should be served as-is.
function redirectTarget(rawHost, canonicalHost) {
  const host = String(rawHost || '').toLowerCase().split(':')[0].trim();
  if (!host) return '';
  if (LOCAL_HOSTS.test(host)) return '';
  if (host.endsWith('.internal') || host.endsWith('.local')) return '';
  const canonical = String(canonicalHost || '').toLowerCase().split(':')[0].trim();
  if (canonical) {
    if (host === canonical) return '';
    // only fold the www alias, never an unrelated hostname that happens to
    // point here (previews, health probes, reverse proxies)
    if (host === 'www.' + canonical) return canonical;
    const bareCanonical = canonical.replace(/^www\./, '');
    if (bareCanonical !== canonical && host === bareCanonical) return canonical;
    return '';
  }
  return host.startsWith('www.') ? host.slice(4) : '';
}

// Paths that must be served verbatim: uploaded files, the admin panel and the
// static asset roots are either case-sensitive on disk or intentionally odd.
const RAW_PREFIXES = ['/api/', '/thumb/', '/img/', '/css/', '/js/', '/uploads/'];

// Returns the canonical path (with query) to 301 to, or '' when the requested
// URL is already canonical. Express matches routes case-insensitively, so
// /GAMES, /games/ and /tag/Car all answered 200 with a self-canonical URL and
// competed with their lowercase twins.
function pathTarget(originalUrl, adminBase) {
  const raw = String(originalUrl || '/');
  const qIndex = raw.indexOf('?');
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex) : '';
  if (!path.startsWith('/')) return '';
  const admin = String(adminBase || '/wyj');
  for (const prefix of RAW_PREFIXES.concat([admin])) {
    if (path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) return '';
  }
  const segments = path.split('/');
  const last = segments[segments.length - 1] || '';
  if (last.indexOf('.') >= 0) return ''; // files keep their exact name
  let next = path.toLowerCase();
  if (next.length > 1) next = next.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (next === path) return '';
  return next + query;
}

module.exports = { redirectTarget, pathTarget };
