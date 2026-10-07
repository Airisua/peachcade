'use strict';
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '..', 'data');
for (const f of ['app.db', 'app.db-wal', 'app.db-shm']) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('removed ' + p); }
}
console.log('Database reset. It will be re-created and seeded on next server start.');

