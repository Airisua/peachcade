# PixelPlay - a self-hosted HTML5 games portal

PixelPlay is a dynamic, database-driven games website a premier destination for instant, free HTML5 browser games with user accounts, community features, and management tooling.

## Features

- Dynamic server-rendered site (Node.js + Express + EJS + SQLite): game catalog,
  categories, search with live suggestions, sorting, pagination, random game.
- 5 built-in playable mini games (ported as standalone HTML5 pages, embedded in a
  16:9 player): 2048, Snake Classic, Memory Match, Tic-Tac-Toe, Minesweeper.
- Game integration model: like the big portals, PixelPlay aggregates games.
  Admins can embed any external HTML5 game by setting an embed URL per game
  (iframe). Built-in games simply use a local embed URL, e.g. /games/2048/.
- Accounts: register / login (bcrypt hashing + JWT in an httpOnly cookie),
  favorites, play history, comments on games.
- Independent admin panel at /admin: dashboard stats, game CRUD with EN/ZH
  fields and thumbnail upload, comment moderation, user management (roles /
  ban), ad management, site settings (name, taglines, ads on-off, open
  registration).
- Advertising: 6 configurable slots (header, home-mid, list-top, game-under,
  sidebar, footer). Each slot takes raw HTML (e.g. an AdSense snippet) or an
  image banner; until configured, a placeholder box is shown.
- Bilingual UI: English by default, one-click switch to Chinese (header /
  footer language links, /lang/zh). Dictionaries live in src/i18n/*.json.
- Docker one-command deployment with health check (GET /healthz).

## Quick start (local)

Requirements: Node.js >= 20.

    npm install
    npm start

Open http://localhost:3000

Default accounts (created on first start, change them!):

- Admin: admin / admin123  (admin panel: /admin)
- Demo player: player / player123

Useful scripts:

    npm run smoke        # end-to-end HTTP test of the running site (57 checks)
    npm run check:games  # validate the 5 built-in games (syntax + jsdom boot)
    npm run check:i18n   # verify all translation keys exist in EN and ZH
    npm run check:providers  # unit checks for the game feed parsers
    npm run reset:db     # delete the SQLite database (re-seeded on next start)

## Docker deployment (one command)

    docker compose up -d --build

Open http://localhost:3000 . The database (./data) and uploaded thumbnails
(./public/uploads) are bind-mounted and survive rebuilds.

    docker compose logs -f      # follow logs
    docker compose down         # stop
    docker compose up -d --build  # rebuild + restart after code changes

### Environment variables

Create a .env file next to docker-compose.yml (see .env.example):

    PORT=3000                               -- HTTP port (default 3000)
    JWT_SECRET=change-me                    -- REQUIRED in production
    ADMIN_USERNAME=admin                    -- initial admin (first start only)
    ADMIN_EMAIL=admin@example.com
    ADMIN_PASSWORD=admin123                 -- change it!

The initial admin account is created only when the database is empty. After
first start you can also change the password from the admin UI, or reset the
database and set new values.

## Documentation

- docs/ARCHITECTURE.md - code layout, routes, data model, request pipeline
- docs/DEPLOY.md - full deployment guide (Chinese): server prep, HTTPS reverse
  proxy for Nginx/Caddy, backup / restore, upgrade, FAQ
- docs/GAMES_SPEC.md - the contract for built-in game pages

## Admin guide (short)

- Games: /admin/games -> New game. Fill EN/ZH titles, descriptions and "how to
  play", pick a category, set a thumbnail (upload PNG/JPG/WebP/GIF <= 2 MB or
  paste a URL), and set the Embed URL. For a built-in game use the local path
  (/games/<slug>/); for an external game use its iframe URL. Check
  "Published" to make it visible; "Featured" games appear on the homepage hero
  and featured row.
- Ads: /admin/ads -> add an ad: choose slot, type html (paste an AdSense or
  any ad-network snippet) or image (image URL + link). Toggle enabled/disabled
  per ad; switch all ads off in /admin/settings (ads_enabled).
- Comments: /admin/comments to hide or delete user comments.
- Users: /admin/users to promote/demote admins, ban or delete accounts.
- Settings: /admin/settings - site name, taglines (EN/ZH), footer text,
  ads on/off, registration open/closed.

## Importing games from a distribution platform

The admin panel includes a feed importer at /admin/import:

- GameMonetize works out of the box: pick the preset and click "Preview feed".
- GameDistribution / GamePix / any other platform: register as a publisher
  there first, then choose "Custom JSON feed" (or RSS) and paste the feed URL
  from the dashboard.
- The preview shows title, thumbnail, mapped category and embed URL; games
  that were already imported are detected and skipped automatically.
- Imported games default to drafts (uncheck "Publish immediately") so you can
  polish the EN/ZH copy before going live.
- Whitelist your domain on the platform: ads and revenue tracking inside
  embedded games are handled by the provider SDK, while your own ad slots keep
  running around the player.

## Project structure

    server.js               Express app entry (middleware order, routes, errors)
    src/db.js               SQLite schema + first-run seed (games, admin, demo)
    src/i18n.js, src/i18n/  i18n middleware + EN/ZH dictionaries
    src/auth.js             JWT cookie auth (register/login/logout guards)
    src/csrf.js             CSRF token issue + validation
    src/ratelimit.js        small in-memory rate limiter for login/register
    src/queries.js          shared game list/search queries
    src/providers.js        game feed importers (GameMonetize, custom RSS/JSON)
    src/common.js           per-request view locals (site, categories, helpers)
    src/upload.js           multer upload for thumbnails (2 MB, png/jpg/webp/gif)
    src/routes/site.js      home, listing, search, category, game page, comments
    src/routes/auth.js      login/register/profile/password
    src/routes/api.js       JSON API: game search, like, favorite
    src/routes/admin.js     admin panel (games, users, comments, ads, settings)
    views/                  EJS templates (public site + admin panel)
    public/css|js|img       styles, front-end JS, SVG icon sprite, thumbnails
    public/games/<slug>/    the 5 built-in games (standalone HTML5 pages)
    scripts/                smoke test, game checker, i18n checker, provider checker, db reset
    Dockerfile, docker-compose.yml, .env.example

## Security notes

- Change JWT_SECRET and the admin password before going public.
- Serve behind HTTPS (see docs/DEPLOY.md for Nginx/Caddy snippets); cookies are
  httpOnly + SameSite=Lax and become secure behind TLS.
- SQLite is single-writer: run one app instance (the compose file does).
- Admin ad slots intentionally allow raw HTML (that is how ad networks work);
  only trusted admins should have access.
- Uploads are limited to raster images <= 2 MB.

---

## 中文摘要

PixelPlay 是一个可自托管的多人在线小游戏站（动态渲染，非静态页面），提供极速畅玩的精品网页小游戏，支持完整账号体系、社区互动与管理后台。核心能力：

- 动态游戏库：分类 / 搜索（实时联想）/ 热门、最新、好评排序 / 随机开玩。
- 内置 5 款可玩小游戏（2048、贪吃蛇、记忆翻牌、井字棋、扫雷），并以 iframe
  方式嵌入 16:9 播放器；同时效仿大型游戏站，支持站长在后台通过 Embed URL
  接入任意外部 HTML5 游戏。
- 账号系统：注册 / 登录（bcrypt + httpOnly JWT Cookie）、收藏、最近玩过、评论。
- 独立管理后台 /admin：仪表盘、游戏增删改查（中英双语文案 + 缩略图上传）、
  评论审核、用户管理（角色 / 封禁）、广告管理、站点设置。
- 广告位：6 个可配置位置，支持 AdSense 等 HTML 代码或图片横幅，未配置时显示占位。
- 中英文切换：默认英文，页头 / 页脚一键切换中文。
- Docker 一键部署：docker compose up -d --build，含 /healthz 健康检查。
- 游戏导入：后台「导入游戏」(/admin/import) 支持从 GameMonetize（免注册可先预览）
  或任意自定义 RSS/JSON 游戏源批量导入，自动去重、默认存草稿；正式接入前请先在
  平台注册出版商并登记你的站点域名。
- 文档：README（本文件）、docs/ARCHITECTURE.md、docs/DEPLOY.md、docs/GAMES_SPEC.md。

本地启动：npm install && npm start，默认管理员 admin / admin123（请尽快修改）。

