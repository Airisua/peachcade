'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  desc_zh TEXT NOT NULL DEFAULT '',
  howto_en TEXT NOT NULL DEFAULT '',
  howto_zh TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'casual',
  tags TEXT NOT NULL DEFAULT '',
  thumb TEXT NOT NULL DEFAULT '/img/games/default.svg',
  embed_url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  plays INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, game_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, game_id)
);
CREATE TABLE IF NOT EXISTS plays_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'html',
  html TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_games_category ON games(category);
CREATE INDEX IF NOT EXISTS idx_games_plays ON games(plays);
CREATE INDEX IF NOT EXISTS idx_plays_log_user ON plays_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_game ON comments(game_id, created_at);
`;
db.exec(SCHEMA);

// lightweight migrations for databases created by earlier versions
const gameCols = db.pragma('table_info(games)');
if (!gameCols.some((c) => c.name === 'source')) {
  db.exec('ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT ""');
}

function getSetting(key, def = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : def;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value == null ? '' : value));
}

const CATEGORIES = [
  ['puzzle', 'Puzzle', '益智', 1],
  ['arcade', 'Arcade', '街机', 2],
  ['action', 'Action', '动作', 3],
  ['casual', 'Casual', '休闲', 4],
  ['skill', 'Skill', '技巧', 5],
  ['board', 'Board', '棋牌', 6]
];

const SEED_GAMES = [
  {
    slug: '2048', title_en: '2048', title_zh: '2048',
    desc_en: 'Swipe and merge matching tiles to reach the 2048 tile — and beyond.',
    desc_zh: '滑动合并相同数字，向 2048 及更高目标发起挑战。',
    howto_en: 'Use arrow keys / WASD or swipe to move tiles. Equal tiles merge into one.',
    howto_zh: '使用方向键 / WASD 或滑动屏幕移动方块，相同数字会合并。',
    category: 'puzzle', tags: 'number,puzzle,merge', plays: 48210, likes: 3421, featured: 1, daysAgo: 30
  },
  {
    slug: 'snake', title_en: 'Snake Classic', title_zh: '贪吃蛇经典',
    desc_en: 'Eat, grow and survive — the retro classic snake game with a modern twist.',
    desc_zh: '经典贪吃蛇：不断吃下食物变长，别撞墙，也别咬到自己。',
    howto_en: 'Arrow keys or WASD to turn; swipe on touch screens. Eat apples to grow and speed up.',
    howto_zh: '方向键或 WASD 控制方向，手机可滑动操作；吃到食物会变长并加速。',
    category: 'arcade', tags: 'classic,retro,skill', plays: 35120, likes: 2890, featured: 1, daysAgo: 24
  },
  {
    slug: 'memory-match', title_en: 'Memory Match', title_zh: '记忆翻牌',
    desc_en: 'Flip cards and match all pairs with the fewest moves possible.',
    desc_zh: '翻牌配对，用最少的步数找出全部相同图案。',
    howto_en: 'Click or tap a card to flip it, then flip another to find its pair.',
    howto_zh: '点击或轻触卡牌翻开，两张相同即可配对消除。',
    category: 'casual', tags: 'cards,brain,casual', plays: 12890, likes: 1290, featured: 0, daysAgo: 18
  },
  {
    slug: 'tic-tac-toe', title_en: 'Tic-Tac-Toe', title_zh: '井字棋',
    desc_en: 'The timeless 3x3 strategy game against a clever — but beatable — AI.',
    desc_zh: '经典井字棋：对阵聪明但可以战胜的 AI。',
    howto_en: 'Click a square to place your X. Beat the AI to win the round.',
    howto_zh: '点击格子落下你的 X，比 AI 先连成三子即获胜。',
    category: 'board', tags: 'strategy,classic,board', plays: 20110, likes: 2210, featured: 0, daysAgo: 3
  },
  {
    slug: 'minesweeper', title_en: 'Minesweeper', title_zh: '扫雷',
    desc_en: 'Clear the field without detonating any hidden mines.',
    desc_zh: '经典扫雷：标记地雷，翻开所有安全格子。',
    howto_en: 'Left click to reveal, right click to flag a mine. Numbers show nearby mines.',
    howto_zh: '左键翻开格子，右键标记地雷；数字表示周围地雷数量。',
    category: 'puzzle', tags: 'logic,classic,brain', plays: 24680, likes: 2650, featured: 0, daysAgo: 1
  }
];

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

function seed() {
  const bcrypt = require('bcryptjs');
  const upsertCat = db.prepare('INSERT INTO categories(slug,name_en,name_zh,sort) VALUES(?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name_en=excluded.name_en, name_zh=excluded.name_zh, sort=excluded.sort');
  for (const [slug, en, zh, sort] of CATEGORIES) upsertCat.run(slug, en, zh, sort);

  const defaults = {
    site_name: 'PixelPlay',
    tagline_en: 'Instant HTML5 games — play free in your browser',
    tagline_zh: '即点即玩 · 免费在线小游戏',
    footer_text_en: '',
    footer_text_zh: '',
    ads_txt: '# GameMonetize publisher ads.txt - replace with the snippet from your publisher dashboard',
    ads_enabled: '1',
    registration_open: '1'
  };
  const insSet = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(defaults)) insSet.run(k, v);

  if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) {
    const adminUser = process.env.ADMIN_USERNAME || 'mqx';
    const adminEmail = process.env.ADMIN_EMAIL || 'mqx@peachcat.fun';
    const adminPass = process.env.ADMIN_PASSWORD || 'mqx331606110';
    db.prepare('INSERT INTO users(username,email,password_hash,role) VALUES(?,?,?,?)').run(adminUser, adminEmail, bcrypt.hashSync(adminPass, 10), 'admin');
  }

  if (!db.prepare('SELECT COUNT(*) n FROM games').get().n) {
    const ins = db.prepare('INSERT INTO games(slug,title_en,title_zh,desc_en,desc_zh,howto_en,howto_zh,category,tags,thumb,embed_url,plays,likes,featured,published,created_at) VALUES(@slug,@title_en,@title_zh,@desc_en,@desc_zh,@howto_en,@howto_zh,@category,@tags,@thumb,@embed_url,@plays,@likes,@featured,1,@created_at)');
    const tx = db.transaction((rows) => { for (const r of rows) ins.run(r); });
    tx(SEED_GAMES.map((g) => ({
      ...g,
      thumb: '/img/games/' + g.slug + '.svg',
      embed_url: '/games/' + g.slug + '/',
      created_at: isoDaysAgo(g.daysAgo)
    })));
  }

  if (!db.prepare('SELECT COUNT(*) n FROM comments').get().n) {
    const admin = db.prepare('SELECT id FROM users WHERE role=? LIMIT 1').get('admin');
    const g2048 = db.prepare('SELECT id FROM games WHERE slug=?').get('2048');
    const gSnake = db.prepare('SELECT id FROM games WHERE slug=?').get('snake');
    const gMine = db.prepare('SELECT id FROM games WHERE slug=?').get('minesweeper');
    if (admin && g2048 && gSnake && gMine) {
      const ins = db.prepare('INSERT INTO comments(game_id,user_id,content,created_at) VALUES(?,?,?,?)');
      ins.run(g2048.id, admin.id, 'Classic and addictive. What is your best score?', isoDaysAgo(5));
      ins.run(gSnake.id, admin.id, 'So simple, so hard to stop playing!', isoDaysAgo(3));
      ins.run(gMine.id, admin.id, 'Careful, the last row is a trap.', isoDaysAgo(1));
    }
  }
}

seed();

module.exports = { db, getSetting, setSetting };
