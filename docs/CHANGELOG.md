# Peachcade 更新日志 (Changelog)

本文档记录 Peachcade 游戏门户项目的所有重大更新、架构优化与运维变更。

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
- **首页热门与好评排序平滑度优化**：
  - 当大量新导入游戏播放数与点赞数均为 0 时，将第二排序由旧的 `g.id ASC` 优化为 `g.created_at DESC, g.id DESC`，赋予新入库优质游戏更合理的曝光机会。

---

## [2026-10-15] 后台游戏热度查看、滑动窗口分页与规模化导入

- **后台按热度查看调整**：`/wyj/games` 支持按最新、最早、播放最多/最少、点赞最多、收藏最多、评论最多和名称排序，表头支持点击快速排序。
- **双端滑动窗口分页**：分类列表与全部游戏列表采用 `« 首页 ‹ 1 2 [3] 4 5 … 31 › 末页 »` 响应式窗口分页。
- **静态资源版本化**：CSS/JS/SVG 带 `?v=<哈希>`，解决 CDN 缓存导致的更新延迟。
- **服务端批量导入工具**：新增 `scripts/import-all.js`，具备自动去重、指数退避、断点续传能力，支持数千款游戏平稳入库。
- **Sitemap 扩容**：上限提升至 45,000 款，防止随着规模增加收录被截断。
