'use strict';
const { ctx } = require('./context');

module.exports = {
  title: 'Accounts, profile, likes, favorites, comments',
  async run() {
    const ok = ctx.ok;
    const user = ctx.user;
    const db = ctx.db;
    let r;
    let j;
  await user.get('/register');
  const uname = 'smoke_' + Date.now().toString().slice(-8);
  let resp = await user.post('/register', { _csrf: user.csrf(), username: uname, email: uname + '@example.com', password: 'smoke123' });
  ok(resp.status === 302 && resp.location.indexOf('ok=registered') >= 0, 'register works', resp.status + ' ' + resp.location);
  r = await user.get('/profile');
  ok(r.status === 200 && r.text.includes(uname), 'profile shows username', r.status);
  ok(r.text.includes('profile-contact'), 'profile renders contact email row');
  const newEmail = 'updated_' + uname + '@example.com';
  resp = await user.post('/profile/email', { _csrf: user.csrf(), email: newEmail });
  ok(resp.status === 302, 'profile email update post works', resp.status);
  r = await user.get('/profile');
  ok(r.status === 200 && r.text.includes(newEmail), 'profile displays updated email');
  r = await user.get('/about');
  ok(r.status === 200 && r.text.includes('wyjv58787@gmail.com'), 'about page displays official contact email');
  r = await user.get('/');
  ok(r.status === 200 && r.text.includes('wyjv58787@gmail.com'), 'footer displays contact email');
  ok(r.status === 200 && r.text.includes('footer-categories'), 'footer renders dual-column categories grid');
  r = await user.post('/api/like/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.liked === true && typeof j.likes === 'number', 'like on', r.status + ' ' + r.text.slice(0, 80));
  r = await user.post('/api/like/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.liked === false, 'like off', r.status);
  r = await user.post('/api/favorite/1', null, { headers: { 'x-csrf-token': user.csrf() } });
  j = JSON.parse(r.text);
  ok(r.status === 200 && j.favorited === true, 'favorite on', r.status);
  r = await user.get('/profile');
  ok(r.text.includes('2048'), 'favorite listed in profile', r.status);
  const ctext = 'Smoke comment ' + Date.now();
  r = await user.post('/game/1/comment', { content: 'missing csrf' });
  ok(r.status === 403, 'missing CSRF token rejected (403)', r.status);
  resp = await user.post('/game/1/comment', { _csrf: user.csrf(), content: ctext });
  ok(resp.status === 302, 'comment posted', resp.status);
  r = await user.get('/game/2048');
  ok(r.text.includes(ctext), 'comment visible on page', r.status);
    r = await user.get('/wyj');
    ok(r.status === 302 && r.location.indexOf('/login') >= 0, 'admin guarded for normal user', r.status + ' ' + r.location);
    resp = await user.post('/logout', { _csrf: user.csrf() });
    r = await user.get('/profile');
    ok(r.status === 302 && r.location.indexOf('/login') >= 0, 'logout works', r.status + ' ' + r.location);
  }
};
