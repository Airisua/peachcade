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
    alternateName: ['PeachCat Games', 'peachcat.fun', 'Peachcade Games'],
    url: siteUrl + '/',
    description: site.tagline || '',
    author: {
      '@type': 'Organization',
      name: site.name,
      url: siteUrl,
      email: 'wyjv58787@gmail.com'
    },
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
    inLanguage: o.lang === 'zh' ? 'zh-CN' : (o.lang === 'ja' ? 'ja-JP' : 'en')
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

function faqPage(game, opt) {
  const o = opt || {};
  const title = o.title || game.title_en;
  const howto = o.howto || '';
  const lang = o.lang || 'en';

  const q1 = lang === 'zh' ? ('如何玩《' + title + '》？') : (lang === 'ja' ? ('『' + title + '』の操作方法・遊び方は？') : ('How do you play ' + title + '?'));
  const q2 = lang === 'zh' ? ('《' + title + '》是免费的吗？需要下载吗？') : (lang === 'ja' ? ('『' + title + '』は無料で遊べますか？ダウンロードは必要ですか？') : ('Is ' + title + ' free to play online?'));
  const a2 = lang === 'zh' ? ('是的，《' + title + '》100% 免费在线即点即玩，直接在电脑或手机浏览器中即可运行，无需下载或安装任何客户端与插件。')
    : (lang === 'ja' ? ('はい、『' + title + '』はPC・スマホのブラウザで100%完全無料で遊べます。ダウンロードやインストールは一切不要です。')
    : ('Yes, ' + title + ' is 100% free to play directly in your web browser on desktop, mobile, or tablet. No downloads, installs, or plugins required.'));

  const items = [];
  if (howto) {
    items.push({
      '@type': 'Question',
      name: q1,
      acceptedAnswer: {
        '@type': 'Answer',
        text: howto
      }
    });
  }
  items.push({
    '@type': 'Question',
    name: q2,
    acceptedAnswer: {
      '@type': 'Answer',
      text: a2
    }
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items
  };
}

module.exports = { website, breadcrumbs, videoGame, collectionPage, itemList, faqPage };
