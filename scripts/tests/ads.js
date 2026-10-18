'use strict';
const { ctx, client, snapshotSettings, restoreSettings } = require('./context');

module.exports = {
  title: 'Ad slots, ads.txt, Ezoic redirect',
  async run() {
    const ok = ctx.ok;
    const db = ctx.db;
    const user = ctx.user;
    await user.get('/lang/en?next=/');
    const settingsBefore = snapshotSettings();
    const headerAds = db.prepare("SELECT id, enabled FROM ads WHERE slot='header'").all();
    const previousSmoke = db.prepare("SELECT * FROM ads WHERE title='Smoke Ad'").all();
    db.prepare("DELETE FROM ads WHERE title='Smoke Ad'").run();
    let resp;
    let r;
    try {
      // One ad per slot is rendered, so park the live header ads while the fixture runs.
      db.prepare("UPDATE ads SET enabled=0 WHERE slot='header'").run();
      const admin = client();
      await admin.get('/login');
      resp = await admin.post('/login', { _csrf: admin.csrf(), username: process.env.ADMIN_USERNAME || 'mqx', password: process.env.ADMIN_PASSWORD || 'mqx331606110' });
      ok(resp.status === 302 && resp.location === '/', 'ad suite admin login', resp.status + ' ' + resp.location);
      db.prepare("DELETE FROM ads WHERE title='Smoke Ad'").run();
      resp = await admin.post('/wyj/ads', { _csrf: admin.csrf(), slot: 'header', type: 'html', title: 'Smoke Ad', html: '<div id="smoke-ad-marker">SMOKE-AD-123</div>', enabled: 'on', sort: '-999' });
      ok(resp.status === 302 && resp.location.includes('ok=created'), 'ad created', resp.status + ' -> ' + resp.location);
      r = await user.get('/');
      const headerSnippet = (r.text.match(/class="ad-slot ad-slot-header"[\s\S]*?<\/div>/) || [''])[0];
      ok(r.text.includes('SMOKE-AD-123'), 'ad renders on homepage', r.status + ' :: ' + headerSnippet.slice(0, 200));
      const smokeAdRow = db.prepare("SELECT id FROM ads WHERE title='Smoke Ad' ORDER BY id DESC LIMIT 1").get();
      const adId = smokeAdRow ? String(smokeAdRow.id) : null;
      ok(!!adId, 'ad id found');
      if (adId) {
        resp = await admin.post('/wyj/ads/' + adId + '/delete', { _csrf: admin.csrf() });
        ok(resp.status === 302, 'ad deleted', resp.status);
      }
      r = await user.get('/');
      ok(!r.text.includes('SMOKE-AD-123'), 'ad removed from homepage', r.status);
      const baseSettings = { site_name: 'Peachcade', tagline_en: 'Free Online Browser Games — Play Instantly' };
      const setAds = (extra) => admin.post('/wyj/settings', Object.assign({ _csrf: admin.csrf() }, baseSettings, extra));
      const originalAdsTxt = settingsBefore.get('ads_txt');
      resp = await setAds({ ads_enabled: 'on', ads_txt: originalAdsTxt });
      ok(resp.status === 302, 'settings save (ads on)', resp.status);
      resp = await setAds({ ads_enabled: '' });
      r = await user.get('/');
      ok(!r.text.includes('ad-slot-header') && !r.text.includes('ad-slot-home-mid'), 'ads can be disabled', r.status);
      resp = await setAds({ ads_enabled: 'on' });
      r = await user.get('/');
      ok(r.text.includes('ad-slot-header'), 'ads re-enabled with placeholders', r.status);
      r = await user.get('/ads.txt');
      ok(r.status === 200 && r.text.includes('pub-2264028095354486'), 'ads.txt served with google adsense snippet', r.status);
      const smokeAdsTxt = 'google.com, pub-2264028095354486, DIRECT, f08c47fec0942fa0\n\n#GameMonetize.com\ngoogle.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0\ngoogle.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0';
      resp = await setAds({ ads_enabled: 'on', ads_txt: smokeAdsTxt, ezoic_adstxt_redirect: '0' });
      ok(resp.status === 302, 'ads.txt saved via settings', resp.status);
      r = await user.get('/ads.txt');
      ok(r.status === 200 && r.text.includes('pub-2264028095354486') && r.text.includes('pub-5519830896693885'), 'ads.txt reflects admin content', JSON.stringify(r.text.slice(0, 60)));
      resp = await setAds({ ads_enabled: 'on', ads_txt: smokeAdsTxt, ezoic_adstxt_redirect: 'on' });
      ok(resp.status === 302, 'enable ezoic ads.txt redirect', resp.status);
      r = await user.get('/ads.txt');
      ok(r.status === 301 && r.location.includes('srv.adstxtmanager.com/19390/'), 'ads.txt 301 redirects to Ezoic AdstxtManager', r.status + ' ' + r.location);
      resp = await setAds({ ads_enabled: 'on', ads_txt: smokeAdsTxt, ezoic_adstxt_redirect: '0' });
      r = await user.get('/ads.txt');
      ok(r.status === 200 && r.text.includes('pub-2264028095354486'), 'ads.txt returns to standard content when redirect disabled', r.status);
    } finally {
      db.prepare("DELETE FROM ads WHERE title='Smoke Ad'").run();
      for (const a of headerAds) db.prepare('UPDATE ads SET enabled=? WHERE id=?').run(a.enabled, a.id);
      const ins = db.prepare('INSERT INTO ads(slot,title,type,html,image_url,link_url,enabled,sort) VALUES(@slot,@title,@type,@html,@image_url,@link_url,@enabled,@sort)');
      for (const a of previousSmoke) ins.run(a);
      restoreSettings(settingsBefore);
    }
  }
};
