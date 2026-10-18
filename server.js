'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { db } = require('./src/db');
const { i18nMiddleware } = require('./src/i18n');
const { loadUser } = require('./src/auth');
const { csrfMiddleware, csrfGuard } = require('./src/csrf');
const common = require('./src/common');
const { ASSET_VERSION } = require('./src/assets');

const siteRouter = require('./src/routes/site');
const authRouter = require('./src/routes/auth');
const apiRouter = require('./src/routes/api');
const adminRouter = require('./src/routes/admin');

// non-obvious admin path (security through obscurity for the dashboards)
const ADMIN_BASE = process.env.ADMIN_BASE || '/wyj';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
// cache-busting token for /css + /js + the icon sprite (see src/assets.js)
app.locals.assetV = ASSET_VERSION;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer-when-downgrade' }
}));
app.use(morgan('tiny', {
  skip: (req) => req.url.startsWith('/thumb/') || req.url.startsWith('/img/') || req.url.startsWith('/css/') || req.url.startsWith('/js/')
}));
app.use(express.urlencoded({ extended: false, limit: '300kb' }));
app.use(express.json({ limit: '300kb' }));
app.use(cookieParser());
app.use(i18nMiddleware);
app.use(loadUser);
app.use(csrfMiddleware);
app.use(common);
app.use(csrfGuard);

app.use('/', siteRouter);
app.use('/', authRouter);
app.use('/api', apiRouter);
app.use(ADMIN_BASE, adminRouter);

// static files are served after routes so that page routes such as /games
// are never shadowed by same-named directories inside public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    const versioned = /[?&]v=/.test(res.req.url || '');
    const uploaded = /[\\/]uploads[\\/]/.test(filePath);
    // Versioned assets (?v=<hash>) and uploads (timestamped filenames) never
    // change under the same URL, so they can be cached for a year.
    if (versioned || uploaded) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(svg|css|js|webmanifest|png|jpg|jpeg|webp|ico)$/i.test(filePath)) {
      // favicon / built-in art / manifest: still cacheable, but a change should
      // reach visitors within a day rather than being pinned for a year.
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.use((req, res) => {
  let suggestions = [];
  try {
    suggestions = db.prepare('SELECT g.*, c.name_en AS cat_en, c.name_zh AS cat_zh, c.name_ja AS cat_ja FROM games g LEFT JOIN categories c ON c.slug=g.category WHERE g.published=1 ORDER BY g.plays DESC LIMIT 4').all();
  } catch (e) { /* ignore */ }
  res.status(404).render('error', { status: 404, message: res.locals.t('err.notFound'), suggestions });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const multerish = err && (err.code === 'LIMIT_FILE_SIZE' || err.message === 'bad-file-type');
  const status = multerish ? 400 : 500;
  if ((req.originalUrl || '').startsWith('/api')) return res.status(status).json({ error: 'error' });
  let message = res.locals.t('err.serverError');
  if (err && err.code === 'LIMIT_FILE_SIZE') message = res.locals.t('err.fileTooBig');
  else if (err && err.message === 'bad-file-type') message = res.locals.t('err.fileType');
  res.status(status).render('error', { status, message });
});

app.listen(PORT, () => {
  console.log('[Peachcade] listening on http://localhost:' + PORT);
});

module.exports = app;
