'use strict';
const fs = require('fs');
const path = require('path');

const SUPPORTED_LANGS = ['en', 'zh', 'ja'];

const dicts = {
  en: JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'en.json'), 'utf8')),
  zh: JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'zh.json'), 'utf8')),
  ja: JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'ja.json'), 'utf8'))
};

function makeT(lang) {
  const dict = dicts[lang] || dicts.en;
  return function t(key, vars) {
    let s = (dict && dict[key]) || dicts.en[key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    }
    return s;
  };
}

function i18nMiddleware(req, res, next) {
  const queryLang = req.query && (req.query.lang || req.query.hl);
  const cookieLang = req.cookies && req.cookies.lang;
  const lang = (queryLang && SUPPORTED_LANGS.includes(queryLang))
    ? queryLang
    : (cookieLang && SUPPORTED_LANGS.includes(cookieLang) ? cookieLang : 'en');
  if (queryLang && SUPPORTED_LANGS.includes(queryLang) && cookieLang !== queryLang) {
    res.cookie('lang', queryLang, { sameSite: 'lax', maxAge: 365 * 864e5 });
  }
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.supportedLangs = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'ja', label: '日本語', short: '日本語' }
  ];
  res.locals.currentLang = res.locals.supportedLangs.find((l) => l.code === lang) || res.locals.supportedLangs[0];
  res.locals.otherLang = lang === 'en' ? 'ja' : 'en';
  res.locals.t = makeT(lang);
  next();
}

module.exports = { i18nMiddleware, makeT, SUPPORTED_LANGS };
