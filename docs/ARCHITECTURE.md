# PixelPlay architecture

## Request pipeline (server.js)

    helmet (CSP off - games/ads need inline JS)
    -> morgan (request log)
    -> express.urlencoded / express.json (body parse, 300 kb limit)
    -> cookieParser
    -> i18nMiddleware        lang cookie -> req.lang, t(), otherLang
    -> loadUser              JWT cookie -> req.user (banned users are signed out)
    -> csrfMiddleware        issues/echoes the csrf cookie, exposes res.locals.csrf
    -> csrfGuard             blocks non-multipart POSTs without a valid token
    -> common                view locals: site, categories, ads helpers, formatters
    -> routers (site / auth / api / admin) -> express.static -> 404 -> error handler

CSRF strategy: double-submit token. Forms embed it as _csrf; fetch() calls send
it in the x-csrf-token header. Multipart requests validate after multer runs.

## Data model (SQLite, better-sqlite3)

- users        id, username, email, password_hash, role (user|admin), banned, created_at
- categories   slug, name_en, name_zh, sort
- games        slug, title/desc/howto in EN+ZH, category, tags, thumb,
               embed_url (iframe source: local path or external URL),
               plays, likes, featured, published, created_at
- likes        (user_id, game_id) unique pair
- favorites    (user_id, game_id) unique pair
- plays_log    play events per user (powers "Continue playing" and history)
- comments     game comments (soft-hidden by admin moderation)
- ads          slot, type (html|image), html/image_url/link_url, enabled, sort
- settings     key/value (site_name, taglines, footer text, ads_enabled,
               registration_open)

All game/user FK columns cascade on delete. The schema runs idempotently on
boot; seed data (5 games, categories, admin + demo user, sample comments) is
inserted only when the corresponding table is empty.

## Routes

Public:  GET /  /games  /game/:slug  /category/:slug  /search  /random  /about
         GET /lang/:code  GET /healthz
         POST /game/:id/comment  POST /comment/:id/delete
Auth:    GET/POST /login  GET/POST /register  POST /logout
         GET /profile  POST /profile/password
API:     GET /api/games (search suggestions)  POST /api/like/:id  POST /api/favorite/:id
Admin:   GET /admin  /admin/games (+new, edit)  /admin/users  /admin/comments
         /admin/ads  /admin/settings and their POST actions

## i18n

src/i18n/en.json + zh.json hold all UI strings. Views call t('key'); the
language comes from the lang cookie (default en). /lang/:code sets the cookie
and redirects back. scripts/check-i18n.js statically verifies that every key
used in views/src exists in both dictionaries (run: npm run check:i18n).

## Games

Built-in games are standalone HTML5 pages under public/games/<slug>/index.html
(no external requests, localStorage best score, #game-root container). The game
page embeds embed_url in a 16:9 iframe with a sandbox attribute. External games
are configured per game in the admin panel by pasting their iframe URL - the
same aggregator model used by large portals.

scripts/check-games.js validates all five games: file size, inline script
syntax (new Function) and a jsdom boot test (300 ms, no uncaught errors,
#game-root present): npm run check:games

## Verification

- npm run smoke      - 50 end-to-end HTTP checks (auth, admin CRUD, ads, i18n)
- npm run check:games / check:i18n
- docker compose up -d --build + GET /healthz for containerised runs

