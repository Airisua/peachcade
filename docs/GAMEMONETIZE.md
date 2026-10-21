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
- 收益分成 45%，NET 30，满 $30 起付（PayPal / USDT ERC20）。

---

## 3. 后台一直「无数据」的四个原因

按可能性排序：

1. **后台没把站点加进 Publisher → Websites**。官方 FAQ 明确要求 “add your site in the dashboard”；未登记的域名没有对应广告需求，请求返回空 VAST；
2. **广告请求被拦截或该地区无需求**。国内网络对 `doubleclick` / `googlesyndication` 基本不通，AdBlock 也会全部拦掉。自测请用海外节点并关闭广告拦截；
3. **报表按天更新**，不是实时；
4. **游戏本身没有广告代码**。随机抽样 120 款已发布游戏：**51 款（42.5%）加载 `api.gamemonetize.com` SDK，69 款（57.5%）一行广告代码都没有**，玩这些永远不会有数据。

---

## 4. 30 秒自检

打开任意游戏页 → F12 → Console：

```js
performance.getEntriesByType('resource').map(e => e.name)
  .filter(n => /gamemonetize|doubleclick|googlesyndication/.test(n))
```

| 看到什么 | 说明 |
|---|---|
| 有 `sdk.js` + `event.php?page_url=peachcat.fun`，没有 `gampad/ads` | 域名未被批准，广告根本没请求 |
| 有 `gampad/ads` 但后台空 | 有请求、没填充（地区/拦截/延迟） |
| 只有 `sdk.js`，没有 `event.php` | referrer 被中间层剥掉（本站目前不存在此问题） |

---

## 5. 本站的取舍

- 游戏 iframe 的 sandbox 已放开 `allow-popups-to-escape-sandbox`，保证广告落地页能正常打开；
- **没有**放开 `allow-top-navigation-by-user-activation`：那会让广告在手机上一按就顶掉当前页，即之前 Adsterra 的强制跳转体验；
- GameMonetize 只作为**内容源**，不作为主要收入来源；主力变现仍是 Ezoic / HilltopAds 与站内自建广告位。
