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
  const cookieLang = req.cookies && req.cookies.lang;
  const lang = SUPPORTED_LANGS.includes(cookieLang) ? cookieLang : 'en';
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.supportedLangs = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'zh', label: '中文', short: '中文' },
    { code: 'ja', label: '日本語', short: '日本語' }
  ];
  res.locals.currentLang = res.locals.supportedLangs.find((l) => l.code === lang) || res.locals.supportedLangs[0];
  res.locals.otherLang = lang === 'en' ? 'zh' : (lang === 'zh' ? 'ja' : 'en');
  res.locals.t = makeT(lang);
  next();
}

module.exports = { i18nMiddleware, makeT, SUPPORTED_LANGS };
