'use strict';
const { ctx } = require('./context');

module.exports = {
  title: 'Internationalization & language switching',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    // required inside run(): the runner may have swapped DATA_DIR for --fresh
    const gt = require('../../src/queries').gt;
    await user.get('/lang/en?next=/');
  ok(gt({ title_en: 'CatchFish &mdash; Fishing Master' }) === 'CatchFish — Fishing Master', 'entity decoding decodes named mdash entity');
  ok(gt({ title_en: 'Double &amp;mdash; test &#8212;' }) === 'Double — test —', 'entity decoding decodes double-encoded and numeric entities');
  let r = await user.get('/');
  ok(r.status === 200 && r.text.includes('/game/2048') && !r.text.includes('热门游戏'), 'home renders EN with games', r.status);
  ok(r.text.includes('Peachcade'), 'home renders new brand name Peachcade');
  ok(r.text.includes('cmp.gatekeeperconsent.com') && r.text.includes('ezstandalone'), 'home includes Ezoic privacy & header scripts');
  r = await user.get('/lang/zh?next=/');
  ok(r.status === 302, 'lang switch to zh', r.status);
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('热门游戏'), 'home renders ZH', r.status);
  r = await user.get('/lang/ja?next=/');
  ok(r.status === 302, 'lang switch to ja', r.status);
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('いま人気のゲーム') && r.text.includes('lang="ja"'), 'home renders JA with localized headings', r.status);
  r = await user.get('/game/snake');
  ok(r.status === 200 && r.text.includes('スネーク クラシック'), 'game detail renders Japanese title in JA mode');
  r = await user.get('/about');
  ok(r.status === 200 && r.text.includes('Peachcadeについて'), 'about page renders Japanese in JA mode');
  r = await user.get('/lang/en?next=/');
  ok(r.status === 302, 'lang switch back to en', r.status);
  }
};
