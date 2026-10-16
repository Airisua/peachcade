# Peachcade 更新日志 (Changelog)

本文档记录 Peachcade 游戏门户项目的所有重大更新、架构优化与运维变更。

---

## [2026-10-16] 全面引入日语版本支持与多语言交互体验升级 (Japanese Language Support)

### 1. 国际化架构升级 (Tri-lingual i18n Core)
- **多语言扩展为英、中、日三语系统**：`src/i18n.js` 拓展 `SUPPORTED_LANGS = ["en", "zh", "ja"]`，原生支持 `/lang/ja` 路由切换与 365 天 cookie 持久化。
- **全量原生日语语言包**：新增 `src/i18n/ja.json`，全面翻译 284 个全站词条（涵盖导航、首页、游戏详情、关于、个人中心、登录注册、所有错误/提示文案及完整的后台管理系统），文风贴合日本大型网页游戏门户规范。
- **多语言校验工具升级**：`scripts/check-i18n.js` 升级为英、中、日三语对齐校验，自动化确保 284 个键值在全部词典中 100% 完整无缺漏。

### 2. 数据库与元数据多语言化 (Database Localization)
- **分类日文名原生入库**：`categories` 表通过轻量迁移自动追加 `name_ja` 字段，14 个分类全部植入规范日文译名（パズル、アーケード、アクション、レース、シューティング等）。
- **游戏日文字段与内置游戏本地化**：`games` 表轻量扩展 `title_ja`、`desc_ja`、`howto_ja` 字段；系统初始化自动为 2048、贪吃蛇、翻牌、井字棋、扫雷等内置离线游戏补充地道日文标题、介绍与操作说明。
- **后台管理与自定义配置**：后台 `/wyj/settings` 增设日文标语（`tagline_ja`）与页脚文案（`footer_text_ja`）；后台游戏编辑表单增设日文标题、描述与玩法录入。
- **日期与分类多语言格式化**：`src/common.js` 的 `fmtDate` 动态适配 `ja-JP` 格式；`catName` 支持三语无缝回退；`src/schema.js` 的 VideoGame JSON-LD 结构化数据智能输出 `ja-JP`。

### 3. 导航与语言切换器交互重构 (Language Switcher UI)
- **专业三语切换下拉菜单**：顶栏语言切换器从原两语切换链接升级为 `<details class="dropdown lang-dropdown">` 交互菜单，支持高亮当前选中的语言，展开时直观提供「English / 中文 / 日本語」三语一键切换。
- **页脚与移动端无缝联动**：页脚快捷语言列表中同步追加「日本語」直达链接。
- **点击页面空白处自动收起**：在 `public/js/main.js` 中增设全局点击外部委托，任意打开的下拉菜单在点击外部时均会自动平滑收起。

---

## [2026-10-16] 性能飞跃、PWA支持、播放器体验与后台多维筛选全面升级

### 1. 数据库多维索引构建与查询极速优化 (Database Indexing)
- **复合索引全面加持**：针对已膨胀至 16,000+ 款海量游戏的线上库，在 `src/db.js` 中构建全套复合索引：
  - `idx_games_pub_plays`: `(published, plays DESC, created_at DESC, id DESC)` 消除首页与全站最热排行的全部全表扫描 (`SCAN g`) 与临时内存 B-Tree 排序。
  - `idx_games_pub_cat_plays`: `(published, category, plays DESC, id DESC)` 分类筛选毫秒级即时定位。
  - `idx_games_pub_created`: `(published, created_at DESC, id DESC)` 最新游戏专享索引。
  - `idx_games_pub_likes`: `(published, likes DESC, created_at DESC, id DESC)` 最受好评专享索引。
  - `idx_games_pub_featured`: `(published, featured, plays DESC)` 精选推荐快速召回。
- **查询性能质变**：所有前台核心页面查询计划均变为 `SEARCH g USING INDEX`，耗时从数十毫秒压至 sub-millisecond 亚毫秒级。

### 2. PWA (Progressive Web App) 与移动端渐进式 Web 应用落地
- **Web App Manifest**：新增 `public/manifest.webmanifest`，规范定义应用名称、独立全屏窗口展示 (`standalone`)、深色主题色 (`#0e0e16`) 及自适应矢量图标。
- **移动端应用标签**：在 `views/partials/head.ejs` 注入 `apple-mobile-web-app-capable`、`theme-color` 等元信息，支持手机（iOS/Android）或电脑（Chrome/Edge）一键「添加到主屏幕 / 安装为应用」，提供类似原生客户端的沉浸式体验。

### 3. 游戏详情页沉浸式播放器体验与容灾 (Player UX & Resilience)
- **优雅加载中占位遮罩**：游戏 iframe 加载阶段展示高档深色径向渐变加载遮罩 (`.player-loader`)，辅以平滑旋转加载环与「游戏载入中」文案，iframe 触发 `load` 事件后平滑淡出，彻底告别白屏/黑屏等待。
- **一键重载游戏按钮**：播放器控制栏新增刷新图标按钮 (`#i-reload`)，当外部 iframe 游戏偶发卡死或报错时，玩家无需刷新整个网页即可一键快速重启游戏。
- **全屏快捷键 (F 键)**：浏览游戏详情页时，按下键盘 `F` 键即可秒切全屏模式（智能规避文本框与评论区输入冲突），对齐主流国际大厂游戏站标准。
- **加载异常逃生兜底**：加载遮罩配备「游戏载入缓慢？新窗口打开」引导链接，并在 8 秒超时后自动隐退，确保极端网络环境或跨域阻断下用户不被卡死。

### 4. 搜索建议与全站静态缓存再优化 (API & Cache Headers)
- **实时搜索极速缩略图**：`/api/games` 搜索建议由返回原始大图改为走 `res.locals.thumb(g, "thumb")` 缩略图代理，体积骤减 85% 以上，并享受本地与 CDN 强缓存。
- **静态资源强缓存响应头**：`server.js` 针对 `.svg`, `.css`, `.js`, `.webmanifest` 等静态资源显式赋予 `max-age=86400` (1天) 缓存指令，结合已有 `?v=<hash>` 破缓存机制，既最大化加速静态命中，又确保发版即更新。

### 5. 后台游戏管理多维筛选与缩略图优化 (Admin Enhancement)
- **分类与状态复合筛选**：后台游戏管理 `/wyj/games` 新增分类下拉选择器及状态筛选（全部状态 / 已发布 / 未发布草稿 / 首页推荐），使管理员在大规模游戏库中能精准检索各状态游戏。
- **后台缩略图代理优化**：后台表格封面图改用 `thumb(g, "thumb")` 并开启 `loading="lazy"`，大幅减轻后台列表翻页时的网络传输开销。

### 6. SEO、Robots 与 Sitemap 健壮性防线
- **安全屏蔽爬虫**：`robots.txt` 明确追加 `Disallow: /wyj/` 与 `Disallow: /api/`，杜绝搜索引擎蜘蛛对后台管理路径与内部接口的无效攀爬。
- **Sitemap 内存缓存与频次标注**：针对 1.6 万+ 大规模 URL 的 `/sitemap.xml`，新增 1 小时内存缓存保护与 `<changefreq>`（首页/全站列表 daily，详情页 weekly）元标签，防止蜘蛛密集抓取导致的 CPU/IO 压力。

---

## [2026-10-16] 品牌全面升级为 Peachcade & 网站体验深度优化

### 1. 品牌全面重塑 (Rebranding)
- **品牌名称**：由原初始工程名 `PixelPlay` 全面升级为独立街机小游戏品牌 **`Peachcade`**（蜜桃街机），与域名 `peachcat.fun` 完美契合，兼具专业大厂游戏平台感与极低同名重叠度。
- **SEO 实体与标语优化**：
  - 英文标语：`Free Online Browser Games — Play Instantly`
  - 中文标语：`免费免下载在线小游戏 · 即点即玩`
  - 结构化数据：`src/schema.js` 的 `WebSite` Schema 补充 `alternateName: ['PeachCat Games', 'peachcat.fun', 'Peachcade Games']`，强化搜索引擎对域名与品牌的联合索引。
- **配置与文案更新**：
  - 数据库 `settings` 默认配置更新为 `Peachcade`，并在启动时轻量自动迁移旧设置。
  - i18n 语言包（中英双语）、关于页、默认封面 SVG、User-Agent 等全部同步更新。

### 2. 细节优化与缺陷修复 (Fixes & UX Enhancements)
- **详情页相关推荐缩略图代理**：
  - `views/game.ejs` 右侧相关游戏列表由原始原图 `<img src="<%= g.thumb %>">` 改为走 `<%= thumb(g, 'card') %>` 缓存缩略图代理，详情页加载体积减小 70% 以上，并享受本地与 CDN 双重缓存。
- **HTML 实体转义彻底解码**：
  - 针对分发平台抓取数据中残留的 `&mdash;`、`&ndash;`、`&bull;`、`&times;`、`&quot;` 等 HTML 字符实体，在 `src/queries.js`（`gt`, `gd`, `gh`）和 `src/providers.js`（`decodeEntities`）中实现多遍多层解码，避免前端页面显示如 `CatchFish &amp;mdash; Fishing Master` 乱码实体。
- **公共标签清洗**：
  - `views/game.ejs` 底部展示标签时过滤内部数据源标签（如 `gamemonetize`、`mapi-games`、`json`、`rss`），只展示真正与游戏内容相关的标签。
- **导航分类下拉体验增强**：
  - `.dropdown-panel` 增加最大高度限制与原生平滑滚动 (`max-height: min(500px, calc(100vh - 85px)); overflow-y: auto;`)，防止在小高度笔记本或移动端展开时溢出视口。
  - 下拉面板中每个分类项新增对应微图标，与首页分类卡片保持视觉系统统一。
  - 增加细致暗色自定义滚动条 (`scrollbar-width: thin`)，视觉体验更精致。
- **首页 Hero 描述排版保护**：
  - 为首页 Hero 区域简介增加 4 行文本截断 (`-webkit-line-clamp: 4`)，避免部分导入游戏过长英文简介撑破卡片比例。
- **首页热门与好评排序平滑度优化**：
  - 当大量新导入游戏播放数与点赞数均为 0 时，将第二排序由旧的 `g.id ASC` 优化为 `g.created_at DESC, g.id DESC`，赋予新入库优质游戏更合理的曝光机会。

---

## [2026-10-15] 后台游戏热度查看、滑动窗口分页与规模化导入

- **后台按热度查看调整**：`/wyj/games` 支持按最新、最早、播放最多/最少、点赞最多、收藏最多、评论最多和名称排序，表头支持点击快速排序。
- **双端滑动窗口分页**：分类列表与全部游戏列表采用 `« 首页 ‹ 1 2 [3] 4 5 … 31 › 末页 »` 响应式窗口分页。
- **静态资源版本化**：CSS/JS/SVG 带 `?v=<哈希>`，解决 CDN 缓存导致的更新延迟。
- **服务端批量导入工具**：新增 `scripts/import-all.js`，具备自动去重、指数退避、断点续传能力，支持数千款游戏平稳入库。
- **Sitemap 扩容**：上限提升至 45,000 款，防止随着规模增加收录被截断。
