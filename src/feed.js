'use strict';
// RSS 2.0 feed of the newest games. Feed readers and a number of "new browser
// games" roundups still poll RSS, so this is a cheap second discovery surface
// next to the sitemaps.
const { db } = require('./db');
const { gt, gd } = require('./queries');

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Only covers files the site hosts itself. Provider thumbnails are external
// URLs that may redirect, which feed readers handle poorly.
function selfHostedImage(url) {
  const u = String(url || '');
  return u.charAt(0) === '/' ? u : '';
}

function toUtc(value, fallback) {
  if (!value) return fallback;
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? fallback : d.toUTCString();
}

function build(siteUrl, siteName, lang) {
  const games = db.prepare(
    'SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja FROM games g ' +
    'LEFT JOIN categories c ON c.slug=g.category WHERE g.published=1 ' +
    'ORDER BY g.created_at DESC, g.id DESC LIMIT 50'
  ).all();

  const now = new Date().toUTCString();
  const lastBuild = games.length ? toUtc(games[0].created_at, now) : now;

  const items = games.map((g) => {
    const title = gt(g, lang);
    const link = siteUrl + '/game/' + g.slug;
    const desc = gd(g, lang) || (title + ' — a free online game on ' + siteName + '.');
    const img = selfHostedImage(g.thumb);
    const lines = [
      '    <item>',
      '      <title>' + escapeXml(title) + '</title>',
      '      <link>' + escapeXml(link) + '</link>',
      '      <guid isPermaLink="true">' + escapeXml(link) + '</guid>',
      '      <pubDate>' + toUtc(g.created_at, lastBuild) + '</pubDate>',
      '      <description>' + escapeXml(desc.slice(0, 600)) + '</description>'
    ];
    if (g.cat_en) lines.push('      <category>' + escapeXml(g.cat_en) + '</category>');
    if (img) lines.push('      <enclosure url="' + escapeXml(siteUrl + img) + '" type="image/svg+xml" length="0"/>');
    lines.push('    </item>');
    return lines.join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>' + escapeXml(siteName + ' — new free online games') + '</title>',
    '    <link>' + escapeXml(siteUrl) + '</link>',
    '    <atom:link href="' + escapeXml(siteUrl + '/feed.xml') + '" rel="self" type="application/rss+xml"/>',
    '    <description>' + escapeXml('The newest HTML5 games on ' + siteName + '. Free, instant play, no download.') + '</description>',
    '    <language>' + (lang === 'ja' ? 'ja' : 'en') + '</language>',
    '    <lastBuildDate>' + lastBuild + '</lastBuildDate>',
    items.length ? items.join('\n') : '',
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

module.exports = { build };
