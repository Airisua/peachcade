'use strict';
const providers = require('../src/providers');

let pass = 0;
let fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); }
}

const sampleRss = '<rss><channel>' +
  '<item><id>87711</id><title>Grave Blast</title><type>html5</type>' +
  '<description>Fun &amp; fast shooter</description>' +
  '<instructions>Use WASD to move</instructions>' +
  '<category>Shooting</category><tags>Action, Arcade, Zombie</tags>' +
  '<url>https://html5.gamemonetize.co/abc123/</url>' +
  '<thumb>https://img.gamemonetize.com/abc123/512x384.jpg</thumb>' +
  '<width>1280</width><height>720</height></item>' +
  '</channel></rss>';

const sampleJson = JSON.stringify([
  { name: 'Test Puzzle', embed_url: 'https://example.com/games/test/', thumbnail: 'https://example.com/t.jpg', description: 'A test', category: 'Puzzle', id: 42 }
]);

const cats = [
  { slug: 'puzzle', name_en: 'Puzzle' },
  { slug: 'arcade', name_en: 'Arcade' },
  { slug: 'action', name_en: 'Action' },
  { slug: 'casual', name_en: 'Casual' },
  { slug: 'skill', name_en: 'Skill' },
  { slug: 'board', name_en: 'Board' }
];

(async function () {
  const rssItems = providers.__test.parseRssItems ? providers.__test.parseRssItems(sampleRss) : null;
  if (rssItems) {
    ok(rssItems.length === 1, 'rss: one item parsed', rssItems.length);
    ok(rssItems[0].title === 'Grave Blast', 'rss: title', rssItems[0].title);
    ok(rssItems[0].url === 'https://html5.gamemonetize.co/abc123/', 'rss: embed url', rssItems[0].url);
    ok(rssItems[0].thumb === 'https://img.gamemonetize.com/abc123/512x384.jpg', 'rss: thumb', rssItems[0].thumb);
    ok(rssItems[0].instructions === 'Use WASD to move', 'rss: instructions', rssItems[0].instructions);
    ok(rssItems[0].description === 'Fun & fast shooter', 'rss: entities decoded', rssItems[0].description);
    ok(rssItems[0].category === 'Shooting', 'rss: category', rssItems[0].category);
  } else {
    ok(false, 'rss: internal parser exported for tests');
  }

  const jsonItems = providers.__test.parseJsonItems ? providers.__test.parseJsonItems(sampleJson) : null;
  if (jsonItems) {
    ok(jsonItems.length === 1 && jsonItems[0].title === 'Test Puzzle', 'json: title mapping');
    ok(jsonItems[0].url === 'https://example.com/games/test/', 'json: embed_url mapping');
    ok(jsonItems[0].thumb === 'https://example.com/t.jpg', 'json: thumbnail mapping');
    ok(jsonItems[0].sourceId === '42', 'json: id mapping');
  } else {
    ok(false, 'json: internal parser exported for tests');
  }

  ok(providers.slugFor('gamemonetize', { title: 'Grave Blast', sourceId: '87711' }) === 'grave-blast-gm-87711', 'slug: deterministic', providers.slugFor('gamemonetize', { title: 'Grave Blast', sourceId: '87711' }));
  ok(providers.mapCategory('Shooting', cats) === 'action', 'category: shooting -> action');
  ok(providers.mapCategory('Puzzle', cats) === 'puzzle', 'category: exact name match');
  ok(providers.mapCategory('Something Weird', cats) === 'casual', 'category: fallback casual');
  ok(providers.tagsFor('gamemonetize', 'Action, Arcade, Zombie').indexOf('gamemonetize') === 0, 'tags: provider tag first');

  console.log('');
  console.log('RESULT: pass=' + pass + ' fail=' + fail);
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error('CHECK CRASH', e); process.exitCode = 2; });

