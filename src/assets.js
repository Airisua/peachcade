'use strict';
// Static assets are cached by browsers and by the CDN in front of the site (Cloudflare caches
// .js / .css by file extension), so after a release visitors would keep running the previous
// build for up to an hour. Every asset URL therefore carries ?v=<hash>, which only changes
// when the asset files themselves change - a new release immediately gets fresh URLs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSET_FILES = [
  'public/css/style.css',
  'public/css/admin.css',
  'public/js/main.js',
  'public/img/icons.svg'
];

function computeVersion() {
  if (process.env.ASSET_VERSION) return String(process.env.ASSET_VERSION);
  const hash = crypto.createHash('sha1');
  for (const rel of ASSET_FILES) {
    try {
      hash.update(rel).update(fs.readFileSync(path.join(__dirname, '..', rel)));
    } catch (e) {
      hash.update(rel + ':missing');
    }
  }
  return hash.digest('hex').slice(0, 8);
}

const ASSET_VERSION = computeVersion();

module.exports = { ASSET_VERSION, ASSET_FILES };
