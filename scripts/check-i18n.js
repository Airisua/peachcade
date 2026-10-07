'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh.json'), 'utf8'));
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (f.endsWith('.ejs') || f.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(path.join(root, 'views'), []).concat(walk(path.join(root, 'src'), []));
const re = /(^|[^A-Za-z0-9_])t\(\s*'([A-Za-z0-9_.]+)'/g;
const used = new Set();
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(txt))) {
    const k = m[2];
    if (!k.endsWith('.') && !k.endsWith('_')) used.add(k);
  }
}
let problems = 0;
for (const k of used) {
  if (!(k in en)) { console.log('MISSING en key: ' + k); problems++; }
  if (!(k in zh)) { console.log('MISSING zh key: ' + k); problems++; }
}
for (const k of Object.keys(en)) if (!(k in zh)) { console.log('zh dict missing: ' + k); problems++; }
for (const k of Object.keys(zh)) if (!(k in en)) { console.log('en dict missing: ' + k); problems++; }
console.log('checked ' + files.length + ' files, ' + used.size + ' used keys, ' + Object.keys(en).length + ' dict keys');
if (problems) { console.log('PROBLEMS: ' + problems); process.exitCode = 1; } else { console.log('i18n OK'); }
