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

module.exports = { redirectTarget };
