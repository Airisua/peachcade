# 广告位说明与排障

后台 `/wyj/ads` 里每条广告绑定一个 `slot`，slot 决定它出现在哪个页面的哪个位置。

## 1. slot 对照表

| slot | 出现位置 | 建议尺寸 |
|---|---|---|
| `header` | 首页 / 游戏页 顶部 | 728×90、970×90、320×50（移动） |
| `list-top` | 列表页 / 标签页 顶部 | 728×90、970×90 |
| `home-mid` | 首页 中部 | 300×250、336×280、728×90 |
| `game-under` | 游戏页 播放器下方 | 300×250、336×280 |
| `sidebar` | 游戏页 右侧栏 | 300×250、300×600 |
| `footer` | 全站 页脚上方 | 728×90 |

每个 slot 只渲染**一条**启用中的广告（`sort, id` 最小那条）。

## 2. 为什么「放了广告但什么都不显示」

广告代码分三种，只有第一种是「页面一打开就能看见」的：

| 类型 | 行为 | 在 banner 位里的表现 |
|---|---|---|
| **Display Banner**（图文 / iframe） | 立刻渲染 | ✅ 正常 |
| **Popunder** | 用户点击页面后**另开一个窗口** | ❌ 页面静置时永远空白 |
| **Social Bar** | 页面角落浮出一条小横条 | ⚠️ 不在 banner 位，位置由它自己决定 |
| **In-Page Push** | 右下角弹出一条通知样式卡片 | ⚠️ 位置由它自己决定 |

判断方法：看后台里那条广告的 HTML——含 `window.open` / `popunder` 字样的基本都是
popunder；`socialbar` / `Social Bar` 是浮条。**这类代码不要贴进 `header` / `game-under`
这类展示位**，页面不会因为它而出现横幅。

## 3. 30 秒排障

1. F12 → Network → 过滤广告域名（如 `bauval` / `abscloud` / `subtle-injury`）；
2. 刷新页面，看脚本状态：
   - `200` 且有响应体 → 脚本加载了，问题在素材类型（见上一节）；
   - `403` → 广告平台拒绝了这个域名 / 出口 IP / 标签已停用；
   - `(failed)` → 网络层被拦（代理规则、AdBlock、地区封锁）。
3. 对比测试：关掉系统代理再刷新。代理出口常被广告平台判为异常流量（实测同一个
   Adsterra 标签：直连 200，走代理 403）。

## 4. 贴素材的注意事项

- 用平台后台的 **Display Banner / 横幅** 代码，不要用 Popunder / Social Bar 占 banner 位；
- 图片素材直接填 `type=image` + 图片地址 + 跳转地址，由站内渲染 `<img>`；
- 富文本 / iframe 素材走 `type=html`，脚本原样输出（`data-cfasync="false"` 要保留，
  否则 Cloudflare Rocket Loader 会把脚本改成异步，部分平台会失效）；
- 换了 banner 之后如果出现布局跳动（CLS），再给对应 slot 加 `min-height`；
  目前只对 `type=image` 预留了 120px（`.ad-slot-image`），脚本类不预留，
  避免 popunder 在页面上留一块空白。

## 5. ads.txt

`/ads.txt` 由后台「设置」里的 `ads_txt` 直接输出，目前是 Google AdSense + GameMonetize
的两条 seller。Adsterra / HilltopAds 一般不要求 ads.txt；如果平台后台给了
`ads.txt` 片段，直接追加到同一文本框即可，保存后立即生效。
