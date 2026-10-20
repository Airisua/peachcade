# Peachcade SEO 运行手册

本文档记录站点当前已落地的 SEO 机制，以及需要人工在站外完成的动作。
代码侧的改动不需要重复执行，除非看到「失效信号」。

---

## 一、已由代码保证的部分

### 1. 唯一 URL

| 规则 | 行为 | 代码位置 |
|---|---|---|
| `www.peachcat.fun` | 301 → `peachcat.fun`，保留 path 与 query | `src/host.js` `redirectTarget()` |
| `/GAMES`、`/games/`、`/Tag/Car` | 301 → 小写、无尾斜杠、query 保留 | `src/host.js` `pathTarget()` |
| `/tag/cars`、`/tag/3d-games` 等别名 | 301 → 规范标签 | `src/tags.js` `ALIASES` |
| 静态资源、`/api/`、`/wyj` | 不参与上述跳转 | `src/host.js` `RAW_PREFIXES` |

`SITE_URL` 与 `CANONICAL_HOST` 在 `docker-compose.yml` 中注入，生产 `.env` 已设为
`https://peachcat.fun` / `peachcat.fun`。若某天换了域名，这两个值要同步改。

### 2. 索引范围

- 可索引：首页、`/games`、14 个 `/category/*`、约 320 个 `/tag/*`（≥5 款游戏）、
  `/tags`、全部已发布 `/game/*`、`/about`、`/privacy`、`/terms`。
- 主动 noindex：`/search`、游戏数 <5 的标签页、泛词标签（`game`、`fun`、`html5`…）、
  **所有第 2 页起的分页**、`/tags` 之外的筛选参数页。
- 分页页仍然 `follow`，爬虫可以顺着走，只是不占索引位。

### 3. 站点地图

- `/sitemap.xml` 是索引，指向 `sitemap-main`、`sitemap-tags` 和 8 个游戏分片（每片 5000）。
- 分类页与标签页的 `<lastmod>` 是该集合下最新一款游戏的更新时间，不是抓取当天。
- 全部响应 `Cache-Control: public, max-age=3600`，Cloudflare 可直接应答。

### 4. 结构化数据

| 页面 | 类型 |
|---|---|
| 首页 | `WebSite` + `SearchAction` + `ItemList` |
| 分类页 | `CollectionPage` + `BreadcrumbList` + `FAQPage` |
| 标签页 | `CollectionPage` + `BreadcrumbList` |
| `/tags` | `CollectionPage` + `BreadcrumbList` |
| 游戏页 | `VideoGame` + `BreadcrumbList` + `FAQPage` |

规则：**JSON-LD 里的每一条问答，正文里必须能看见**（FAQ 通过 `<details>` 渲染）。
如果以后新增 schema，必须同步可见内容，否则会被判为无效标记。

### 5. 多语言

- 公开语言：英文（默认，无参数）、日文（`?lang=ja`）。
- 两种语言互相 `hreflang`，并声明 `x-default`；日文页 canonical 自指 `?lang=ja`。
- 中文仅保留可达性（`?lang=zh`），canonical 归并到英文，不参与索引。

### 6. 内容深度

- 14 个分类各有三语编辑介绍 + 亮点 + 2~3 条专属 FAQ（`src/category_content.js`）。
- 标签页根据真实数据生成介绍：收录数量 + 当前最热门前 3 款 + 相关标签图谱。
- 游戏页有规格表（平台/技术/类型/操作/价格/上架时间/游玩数/评分）与 3~4 条可见 FAQ。
- 每个游戏页额外推荐 14 款同分类 + 8 款跨分类游戏，避免链接图被切成 14 个孤岛。

---

## 二、需要人工完成的部分

### 1. Google Search Console（一次性 + 每周）

1. 验证 `peachcat.fun`（DNS TXT 或 HTML 文件均可）。
2. 提交 `https://peachcat.fun/sitemap.xml`。
3. 用「网址检查」逐个请求编入索引：`/`、`/games`、14 个分类页、你最看重的 20 个游戏页。
   **不要**一次请求几千个，会浪费配额。
4. 每周看两个数字：
   - 「已编入索引」是否在涨；
   - 「已发现 - 尚未编入索引」是否在缩。

如果 8 周后已编入索引占比仍低于 10%，问题在站点权重而不是技术，转向外链。

### 2. Cloudflare 设置

- **Scrape Shield → Email Address Obfuscation：关闭**。开启时全站邮箱会被改写成
  `/cdn-cgi/l/email-protection`，Google 抓不到明文联系方式。
- 目前 Cloudflare 会在 `robots.txt` 前注入托管内容（AI 爬虫拦截 + Content-Signal）。
  Google 搜索不受影响（`search=yes`），但 Baidu、PetalBot 等被 `Disallow: /`。
  如果要百度收录，需要在 Cloudflare 里关闭对应的 AI 爬虫拦截。

### 3. 外链（唯一绕不过去的部分）

可执行的低成本渠道，按投入产出排序：

1. GitHub 个人主页 / 项目 README 放站点链接；
2. itch.io 开发者页 + 每周一款自研游戏；
3. Reddit `r/WebGames`、`r/playmygame`（发游戏，不发广告）；
4. Product Hunt 发布；
5. X 每天发一款游戏 + 截图（同时喂给 RSS 聚合器）；
6. 各类「free games」目录站提交。

### 4. 内容节奏

- 每周导入 20~50 款新游戏，让「New games」真实变化；
- 新游戏导入后跑一次 `node scripts/indexnow.js --limit 500`，把新 URL 推给 Bing/Yandex。

---

## 三、失效信号（出现就要回头查）

| 现象 | 先查什么 |
|---|---|
| GSC 报「网页无法访问」 | `https://peachcat.fun/` 是否 200；容器是否 healthy |
| 索引数突然掉一半 | 是否有人把 `www` 或另一个域名也解析到了同一容器 |
| 游戏页 `lastmod` 全是当天 | `updated_at` 是否被导入流程误刷 |
| 分类页描述出现 `{site}` 之类的占位符 | 冒烟里的占位符断言会先失败 |
| 富媒体结果消失 | 正文 FAQ 是否还在渲染（schema 与正文必须同源） |

---

## 四、快速自检命令

```bash
npm run smoke:quick                      # 0.2s，只读
node scripts/smoke.js --fresh core       # 结构化数据 / sitemap / 标签矩阵
node scripts/smoke.js --base https://peachcat.fun quick   # 线上只读体检
npm run check:i18n                       # 三语字典一致性
```
