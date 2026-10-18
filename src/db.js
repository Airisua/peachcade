'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -64000');
db.pragma('mmap_size = 268435456');

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
  name_ja TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL DEFAULT '',
  title_ja TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  desc_zh TEXT NOT NULL DEFAULT '',
  desc_ja TEXT NOT NULL DEFAULT '',
  howto_en TEXT NOT NULL DEFAULT '',
  howto_zh TEXT NOT NULL DEFAULT '',
  howto_ja TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS cpa_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL UNIQUE,
  subid TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_name TEXT NOT NULL DEFAULT '',
  payout REAL NOT NULL DEFAULT 0,
  country_iso TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_games_category ON games(category);
CREATE INDEX IF NOT EXISTS idx_games_plays ON games(plays);
CREATE INDEX IF NOT EXISTS idx_plays_log_user ON plays_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_game ON comments(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_games_pub_plays ON games(published, plays DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_games_pub_cat_plays ON games(published, category, plays DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_games_pub_created ON games(published, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_games_pub_likes ON games(published, likes DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_games_pub_featured ON games(published, featured, plays DESC);
CREATE INDEX IF NOT EXISTS idx_games_pub_tags ON games(published, tags);
`;
db.exec(SCHEMA);

// lightweight migrations for databases created by earlier versions
const catCols = db.pragma('table_info(categories)');
if (!catCols.some((c) => c.name === 'name_ja')) {
  db.exec('ALTER TABLE categories ADD COLUMN name_ja TEXT NOT NULL DEFAULT ""');
}
const gameCols = db.pragma('table_info(games)');
if (!gameCols.some((c) => c.name === 'source')) {
  db.exec('ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT ""');
}
if (!gameCols.some((c) => c.name === 'title_ja')) {
  db.exec('ALTER TABLE games ADD COLUMN title_ja TEXT NOT NULL DEFAULT ""');
}
if (!gameCols.some((c) => c.name === 'desc_ja')) {
  db.exec('ALTER TABLE games ADD COLUMN desc_ja TEXT NOT NULL DEFAULT ""');
}
if (!gameCols.some((c) => c.name === 'howto_ja')) {
  db.exec('ALTER TABLE games ADD COLUMN howto_ja TEXT NOT NULL DEFAULT ""');
}

function getSetting(key, def = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : def;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value == null ? '' : value));
}

const CATEGORIES = [
  ['puzzle', 'Puzzle', '益智', 'パズル', 1],
  ['arcade', 'Arcade', '街机', 'アーケード', 2],
  ['action', 'Action', '动作', 'アクション', 3],
  ['casual', 'Casual', '休闲', 'カジュアル', 4],
  ['skill', 'Skill', '技巧', 'スキル', 5],
  ['board', 'Board', '棋牌', 'ボードゲーム', 6],
  ['racing', 'Racing', '赛车', 'レース', 7],
  ['shooting', 'Shooting', '射击', 'シューティング', 8],
  ['sports', 'Sports', '体育', 'スポーツ', 9],
  ['platform', 'Platformer', '闯关', 'プラットフォーマー', 10],
  ['adventure', 'Adventure', '冒险', 'アドベンチャー', 11],
  ['simulation', 'Simulation', '模拟', 'シミュレーション', 12],
  ['clicker', 'Clicker', '放置', 'クリッカー', 13],
  ['girls', 'Girls', '女生', 'ガールズ', 14]
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
  const upsertCat = db.prepare('INSERT INTO categories(slug,name_en,name_zh,name_ja,sort) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name_en=excluded.name_en, name_zh=excluded.name_zh, name_ja=excluded.name_ja, sort=excluded.sort');
  for (const [slug, en, zh, ja, sort] of CATEGORIES) upsertCat.run(slug, en, zh, ja, sort);

  const defaults = {
    site_name: 'Peachcade',
    tagline_en: 'Free Online Browser Games — Play Instantly',
    tagline_zh: '免费免下载在线小游戏 · 即点即玩',
    tagline_ja: '無料・ダウンロード不要のオンラインブラウザゲーム · 今すぐ遊べる',
    footer_text_en: '',
    footer_text_zh: '',
    footer_text_ja: '',
    ads_txt: 'google.com, pub-2264028095354486, DIRECT, f08c47fec0942fa0\n\n# GameMonetize publisher ads.txt\ngoogle.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0\ngoogle.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0',
    ads_enabled: '1',
    registration_open: '1',
    ezoic_enabled: '1',
    ezoic_adstxt_redirect: '0'
  };
  const insSet = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(defaults)) insSet.run(k, v);

  // Auto-migrate legacy site_name and tagline if still default
  db.prepare("UPDATE settings SET value='Peachcade' WHERE key='site_name' AND value='PixelPlay'").run();
  db.prepare("UPDATE settings SET value='Free Online Browser Games — Play Instantly' WHERE key='tagline_en' AND value='Instant HTML5 games — play free in your browser'").run();
  db.prepare("UPDATE settings SET value='免费免下载在线小游戏 · 即点即玩' WHERE key='tagline_zh' AND value='即点即玩 · 免费在线小游戏'").run();
  // Auto-migrate admin contact email
  db.prepare("UPDATE users SET email='wyjv58787@gmail.com' WHERE username='mqx' AND (email='mqx@peachcat.fun' OR email LIKE '%example.com')").run();
  // Auto-migrate Google AdSense publisher snippet into ads_txt
  const googleAdSenseSnippet = 'google.com, pub-2264028095354486, DIRECT, f08c47fec0942fa0';
  const currentAds = getSetting('ads_txt', '');
  if (!currentAds.includes('pub-2264028095354486')) {
    const updatedAds = currentAds ? (googleAdSenseSnippet + '\n\n' + currentAds).trim() : googleAdSenseSnippet;
    setSetting('ads_txt', updatedAds);
  }

  if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) {
    const adminUser = process.env.ADMIN_USERNAME || 'mqx';
    const adminEmail = process.env.ADMIN_EMAIL || 'wyjv58787@gmail.com';
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

  // Auto-seed Japanese localizations for built-in seed games. This must run
  // AFTER the insert above: on a brand new database the games do not exist yet
  // when seed() starts, so updating them first silently matched zero rows.
  db.prepare("UPDATE games SET title_ja='2048', desc_ja='同じ数字のタイルをスライドさせて合体し、2048とその先のハイスコアを目指そう。', howto_ja='矢印キー / WASDまたはスワイプでタイルを移動。同じ数字が重なると合体します。' WHERE slug='2048' AND (title_ja IS NULL OR title_ja='')").run();
  db.prepare("UPDATE games SET title_ja='スネーク クラシック', desc_ja='リンゴを食べて成長しながら生き残れ！懐かしくも新しいレトロスネークゲーム。', howto_ja='矢印キーまたはWASDで方向転換（スマホはスワイプ）。壁や自分の体に衝突しないように注意。' WHERE slug='snake' AND (title_ja IS NULL OR title_ja='')").run();
  db.prepare("UPDATE games SET title_ja='絵合わせ神経衰弱', desc_ja='カードをめくって同じ絵柄のペアを見つけよう。できるだけ少ない手数でクリアを目指せ。', howto_ja='クリックまたはタップでカードをめくり、同じ絵柄のペアを揃えて消去します。' WHERE slug='memory-match' AND (title_ja IS NULL OR title_ja='')").run();
  db.prepare("UPDATE games SET title_ja='三目並べ (Tic-Tac-Toe)', desc_ja='3×3マスの王道頭脳対決。手強いAIに挑戦して勝利を掴もう。', howto_ja='マスをクリックして自分の「X」を配置。AIより先に縦・横・斜めのいずれかに3つ並べれば勝利。' WHERE slug='tic-tac-toe' AND (title_ja IS NULL OR title_ja='')").run();
  db.prepare("UPDATE games SET title_ja='マインスイーパ', desc_ja='隠された地雷を避けながら、すべての安全なマスを開放しよう。', howto_ja='左クリックでマスを開き、右クリックで地雷フラグを設置。数字は周囲にある地雷の数を示します。' WHERE slug='minesweeper' AND (title_ja IS NULL OR title_ja='')").run();

  // Optional filler catalogue: the smoke runner boots a throwaway database with
  // SMOKE_SEED_GAMES=60 so paging/sorting suites have more than one page of games
  // without writing fixtures into a real install.
  const extraGames = parseInt(process.env.SMOKE_SEED_GAMES || '0', 10) || 0;
  if (extraGames > 0) {
    const insExtra = db.prepare("INSERT OR IGNORE INTO games(slug,title_en,category,thumb,embed_url,source,plays,likes,published) VALUES(?,?,?,?,?,?,?,?,1)");
    const txExtra = db.transaction((n) => {
      for (let i = 1; i <= n; i++) {
        insExtra.run('smoke-seed-' + i, 'Smoke Seed ' + i, i % 2 ? 'puzzle' : 'arcade',
          '/img/games/default.svg', '/games/2048/', 'smoke-seed', i * 10, i * 3);
      }
    });
    txExtra(extraGames);
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

module.exports = { db, getSetting, setSetting, DATA_DIR };
