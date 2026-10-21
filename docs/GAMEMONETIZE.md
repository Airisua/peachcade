# GameMonetize 接入与收益说明

本文记录 Peachcade 使用 GameMonetize 作为游戏内容源时，**收益是怎么产生的、后台为什么可能一直是 0、怎么在 30 秒内自证**。结论全部来自线上实测（2026-10-21）。

---

## 1. 游戏是怎么进来的

导入走公共 feed：`https://gamemonetize.com/feed.php?format=json&num={num}&page={page}`

feed 里的 `<url>` 就是游戏本体的裸地址：

```
https://html5.gamemonetize.co/<hash>/
```

这个地址返回的是一个**纯游戏页面**（Construct / Unity / Laya 之类），本身不含任何广告代码。广告是游戏在运行时自己加载的。

---

## 2. 收益链路（运行时实测）

在 `https://peachcat.fun/game/octopus-legs-gm-53596` 抓到的真实请求顺序：

| # | 请求 | 说明 |
|---|---|---|
| 1 | `https://api.gamemonetize.com/sdk.js` | 游戏内的 GameMonetize SDK（434KB） |
| 2 | `https://gamemonetize.com/account/event.php?page_url=peachcat.fun&game_id=<hash>&eventtype=1` | 事件上报，返回 1×1 像素；**`page_url` 就是你的域名** |
| 3 | `https://securepubads.g.doubleclick.net/pagead/ima_ppub_config?ippd=https://peachcat.fun/game/...` | IMA 视频广告初始化 |
| 4 | `https://pubads.g.doubleclick.net/gampad/ads?iu=/21739493398/ca-games-pub-5519830896693885-tag...` | 真正的广告请求（GameMonetize 的 GAM 广告单元） |

关键点：

- **域名归属靠 referrer**。第 2 步把 `peachcat.fun` 报给了 GameMonetize，所以 iframe 没有把域名藏掉；
- **后台统计的是广告曝光/收益，不是「游戏被打开」**。第 4 步没有填充，就没有曝光，后台就一直空白；
- **sdk.js 不一定是写死在 HTML 里的**。很多游戏（如 `stickman-bow-clash-gm-88749`）由 `js/monetization.js` 在运行时动态插入，静态 grep 会漏判——所以「HTML 里没有 sdk.js」不代表没有广告，只有运行时 Network 才算数；
- 收益分成 45%，NET 30，满 $30 起付（PayPal / USDT ERC20）。

---

## 3. 域名白名单与广告填充（2026-10-22 补充）

GameMonetize 的 SDK 会拉一份域名清单 `https://api.gamemonetize.com/datax.json`（约 2,970 条，包含 y8.com / poki.com / crazygames.com 等）。实测 **`peachcat.fun` 已在这份清单里**，说明站点域名侧没有问题。

真正的卡点在**广告填充**。用线上真实参数直接请求 GameMonetize 的 GAM 广告单元：

```
https://pubads.g.doubleclick.net/gampad/ads?iu=/21739493398/ca-games-pub-5519830896693885-tag
  &output=xml_vast4&ref=https://peachcat.fun/game/...&url=https://peachcat.fun/game/...
```

返回的是**空 VAST**：

```xml
<VAST xmlns:xsi="..." xsi:noNamespaceSchemaLocation="vast.xsd" version="4.0"/>
```

没有任何 `<Ad>` 节点 = 这次请求没有广告可放。也就是说：请求、域名、referrer 全部正确，**是 Google 侧没有给这个地域/这个流量返回广告**。

同一时间在测试浏览器里访问我们自己的游戏页，`doubleclick` / `googlesyndication` 全部 `net::ERR_CONNECTION_CLOSED`——网络层直接掐断，广告更没有机会播放。

---

## 4. 后台一直「无数据」的原因

按可能性排序：

1. **没有广告填充（no fill）——目前的主因**。请求正常发出，但广告服务器返回空 VAST（见上一节）。中文/HK 地域、机房 IP、无 Cookie 的新会话，填充率都非常低；
2. **广告域名被拦截**。国内网络对 `doubleclick` / `googlesyndication` 基本不通，AdBlock 也会全部拦掉。自测请用海外家宽节点并关闭广告拦截；
3. **报表按天更新**，不是实时；
4. **少量游戏确实没有广告代码**。静态抽样 120 款里 51 款 HTML 直接引用 SDK，其余多为运行时注入（见上一节的说明），静态统计只能算下限。

---

## 5. 30 秒自检

**推荐用 Network 面板**（能看到所有 frame 的请求）：打开任意游戏页 → F12 → Network → 过滤框输入 `gamemonetize` → 刷新 → 等 10 秒。

如果坚持用 Console：必须先点 Console 左上角的上下文下拉，把 `top` 切到 `html5.gamemonetize.co` 那个 frame。**在 top 里跑 `performance.getEntriesByType('resource')` 永远只能看到 iframe 自己的 URL**，看不到里面的 sdk.js——这是同源策略，不是没加载。

| 看到什么 | 说明 |
|---|---|
| 有 `sdk.js` + `event.php?page_url=peachcat.fun`，没有 `gampad/ads` | SDK 起了但没到广告请求，通常是游戏没实现广告位 |
| 有 `gampad/ads`，Response 是空 `<VAST/>` | **当前线上就是这种**：有请求、没填充 |
| 有 `gampad/ads` 但状态是 `(failed)` | 网络/AdBlock 拦截 |
| 只有 `sdk.js`，没有 `event.php` | referrer 被中间层剥掉（本站目前不存在此问题） |

---

## 6. 本站的取舍

- 游戏 iframe 的 sandbox 已放开 `allow-popups-to-escape-sandbox`，保证广告落地页能正常打开；
- **没有**放开 `allow-top-navigation-by-user-activation`：那会让广告在手机上一按就顶掉当前页，即之前 Adsterra 的强制跳转体验；
- GameMonetize 只作为**内容源**，不作为主要收入来源；主力变现仍是 Ezoic / HilltopAds 与站内自建广告位。
