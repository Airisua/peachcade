'use strict';
const { db, setSetting } = require('../src/db');

setSetting('site_name', 'Peachcade');
setSetting('tagline_en', 'Free Online Browser Games — Play Instantly');
setSetting('tagline_zh', '免费免下载在线小游戏 · 即点即玩');
setSetting('tagline_ja', '無料・ダウンロード不要のオンラインブラウザゲーム · 今すぐ遊べる');
setSetting('ezoic_enabled', '0');

console.log('Restored settings:');
console.log(db.prepare('SELECT * FROM settings').all());
