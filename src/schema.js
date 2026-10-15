'use strict';
// schema.org structured data (JSON-LD) rendered by views/partials/head.ejs.
// Only facts the site actually knows are emitted (no invented ratings).

function abs(url, siteUrl) {
  const u = String(url || '');
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : siteUrl + (u[0] === '/' ? u : '/' + u);
}

function website(site, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: siteUrl + '/',
    description: site.tagline || '',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: siteUrl + '/search?q={search_term_string}' },
      'query-input': 'required name=search_term_string'
    }
  };
}

function breadcrumbs(items, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.url, siteUrl)
    }))
  };
}

function videoGame(game, opt) {
  const o = opt || {};
  const siteUrl = o.siteUrl || '';
  const block = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: o.title || game.title_en,
    url: siteUrl + '/game/' + game.slug,
    applicationCategory: 'Game',
    operatingSystem: 'Web browser',
    playMode: 'SinglePlayer',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    inLanguage: o.lang === 'zh' ? 'zh-CN' : 'en'
  };
  const img = abs(game.thumb, siteUrl);
  if (img) block.image = img;
  if (o.description) block.description = o.description;
  if (o.genre) block.genre = o.genre;
  if (game.created_at) block.datePublished = String(game.created_at).slice(0, 10);
  if (Number(game.plays) > 0) {
    block.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/PlayAction',
      userInteractionCount: Number(game.plays)
    };
  }
  return block;
}

function itemList(games, opt) {
  const o = opt || {};
  const siteUrl = o.siteUrl || '';
  return {
    '@type': 'ItemList',
    numberOfItems: Number(o.total || games.length),
    itemListElement: games.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: o.titleFor ? o.titleFor(g) : g.title_en,
      url: siteUrl + '/game/' + g.slug
    }))
  };
}

function collectionPage(opt) {
  const o = opt || {};
  const block = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: o.name,
    url: o.siteUrl + o.path,
    isPartOf: { '@type': 'WebSite', name: o.siteName, url: o.siteUrl + '/' },
    mainEntity: itemList(o.games || [], { siteUrl: o.siteUrl, total: o.total, titleFor: o.titleFor })
  };
  if (o.description) block.description = o.description;
  return block;
}

module.exports = { website, breadcrumbs, videoGame, collectionPage, itemList };
