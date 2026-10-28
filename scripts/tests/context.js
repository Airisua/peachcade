'use strict';
// Shared context for the smoke suites. The runner fills everything in, the
// suites only read it, so the same modules can target localhost, production or
// a throwaway server with a temporary database.
const ctx = {
  base: '',
  db: null,
  ok: null,
  client: null,
  user: null,
  JSDOM: null,
  VirtualConsole: null,
  appRoot: '',
  lang: 'en',
  setLang(v) { this.lang = v; }
};

function client() {
  const jar = new Map();
  async function req(method, p, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    let body;
    if (opts.form) {
      const usp = new URLSearchParams();
      for (const k of Object.keys(opts.form)) {
        const v = opts.form[k];
        if (Array.isArray(v)) v.forEach(function (x) { usp.append(k, x); });
        else usp.set(k, v);
      }
      body = usp.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }
    if (jar.size) headers.cookie = Array.from(jar.entries()).map(function (e) { return e[0] + '=' + e[1]; }).join('; ');
    const r = await fetch(ctx.base + p, { method, headers, body, redirect: 'manual' });
    const setc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of setc) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await r.text();
    return { status: r.status, text, location: r.headers.get('location') || '', headers: r.headers };
  }
  return {
    req, jar,
    get: (p) => req('GET', p),
    post: (p, form, o) => req('POST', p, Object.assign({ form }, o)),
    csrf: () => jar.get('csrf') || ''
  };
}

function extractId(text, prefix) {
  let idx = 0;
  while (true) {
    const i = text.indexOf(prefix, idx);
    if (i < 0) return null;
    let j = i + prefix.length, d = '';
    while (j < text.length && text[j] >= '0' && text[j] <= '9') { d += text[j]; j++; }
    if (d) return d;
    idx = i + 1;
  }
}

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  });
}

function featuredSlugs(html) {
  const start = html.indexOf('<h2>Featured</h2>');
  if (start < 0) return [];
  const end = html.indexOf('</section>', start);
  return [...html.slice(start, end === -1 ? html.length : end).matchAll(/\/game\/([a-z0-9-]+)"/g)].map((m) => m[1]);
}

// src/queries.js opens the database at require time, so unloading only src/db
// would leave the suites bound to the previous file. The runner calls this
// after it changes DATA_DIR for --fresh.
function reloadModules() {
  for (const rel of ['../../src/db', '../../src/queries', '../../src/thumbs']) {
    try { delete require.cache[require.resolve(rel)]; } catch (e) { /* not loaded */ }
  }
}

const SETTING_KEYS = ['ads_enabled', 'ads_txt', 'ezoic_enabled', 'ezoic_adstxt_redirect'];
function snapshotSettings() {
  const rows = ctx.db.prepare("SELECT key, value FROM settings WHERE key IN ('ads_enabled','ads_txt','ezoic_enabled','ezoic_adstxt_redirect')").all();
  return new Map(rows.map((r) => [r.key, r.value]));
}
function restoreSettings(snapshot) {
  const tx = ctx.db.transaction((snap) => {
    for (const k of SETTING_KEYS) {
      if (snap.has(k)) ctx.db.prepare('UPDATE settings SET value=? WHERE key=?').run(snap.get(k), k);
      else ctx.db.prepare('DELETE FROM settings WHERE key=?').run(k);
    }
  });
  tx(snapshot);
}

module.exports = { ctx, client, extractId, ldBlocks, featuredSlugs, snapshotSettings, restoreSettings, reloadModules, SETTING_KEYS };
