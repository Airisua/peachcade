'use strict';
const fs = require('fs');
const path = require('path');

const dicts = {
  en: JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'en.json'), 'utf8')),
  zh: JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'zh.json'), 'utf8'))
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
  const lang = (req.cookies && req.cookies.lang) === 'zh' ? 'zh' : 'en';
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.otherLang = lang === 'en' ? 'zh' : 'en';
  res.locals.t = makeT(lang);
  next();
}

module.exports = { i18nMiddleware, makeT };
