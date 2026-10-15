# Peachcade 内置游戏实现规范（子代理契约 v1.1）

> 范围调整（v1.1）：本次交付内置 5 款演示游戏（2048、snake、memory-match、tic-tac-toe、minesweeper）。brick-breaker、pong-duel、flappy-wing 暂缓，后续可由管理员以后台「外部 embed_url」方式接入（见 README「接入游戏」章节）。

本文件定义 8 款内置 HTML5 小游戏与其 SVG 缩略图的实现契约；集成脚本 `scripts/check-games.js` 会据此自动验证。

## 通用要求（每款游戏）

- 文件：`public/games/<slug>/index.html`，单文件内联 CSS+JS，UTF-8，≤450 行。
- 零外部请求：无 CDN / 字体 / 图片 / 音频 / fetch。
- 必含：`<meta charset="utf-8">`、`<meta name="viewport" content="width=device-width, initial-scale=1">`、`<title>`、顶层容器 `<div id="game-root">`（包住全部游戏内容）。
- 深色背景（约 #0f0f1a）；内容居中；自适应 iframe（16:9）与手机竖屏；canvas 加 `touch-action:none`。
- canvas 缩放模式（推荐）：
```js
const W=640,H=400; // 各游戏按下方清单规定
function fit(){const s=Math.min(innerWidth/W,innerHeight/H);cv.style.width=(W*s)+'px';cv.style.height=(H*s)+'px';}
addEventListener('resize',fit);fit();
```
- 键盘可用；触屏游戏监听 touchstart/touchmove 并 preventDefault。
- 界面文案全英文（Score / Best / Restart / New Game / Game Over / You Win!）。
- 最高分：`localStorage` key=`pixelplay.best.<slug>`，读写包 try/catch。
- 禁用：alert/confirm/prompt、measureText、WebAudio、pointer lock。
- 每款都有 Restart 与明确的开始/结束状态；控制台零报错。

## 游戏清单

1. `2048`（缩略图 emoji 🔢）
   - DOM 4×4 网格；方向键/WASD 移动合并；触屏滑动（位移阈值 ~24px）；Score/Best；到达 2048 显示 "You Win!" 且可继续玩；无法移动时 Game Over 覆盖层 + Restart。
2. `snake`（🐍）
   - canvas 480×480，20×20 格；方向键/WASD 转向（禁 180° 反向）；吃食物 +1 分并加速（8→16 步/秒）；撞墙/自撞结束；Best；触屏 4 向滑动。
3. `memory-match`（🃏）
   - DOM 4×4 卡片、8 对 emoji（🐶🐱🐭🐹🐰🦊🐻🐼）；点击翻牌；不同 0.7s 后翻回；动画期间锁输入；显示 Moves 与配对进度；全部配对 "You Win!" + Restart；最少步数 Best。
4. `brick-breaker`（🧱）
   - canvas 640×400；挡板+球+8×5 砖块；鼠标/←→/触摸拖动控制挡板；清空砖块进下一关（球速×1.15 并重砌）；3 条命；Score/Best；Restart。
5. `pong-duel`（🏓）
   - canvas 640×400；左玩家 vs 右侧 AI（限速追赶、随比分小幅提速）；鼠标 Y/↑↓/触摸拖动；先到 7 分结束；Space 或点击发球；显示双方比分；Restart。
6. `flappy-wing`（🐦）
   - canvas 480×640（竖屏比例）；点击/触摸/空格向上冲量、重力下落；通过管道间隙 +1 分；碰撞结束；Score/Best；空格或点击重开；间隙与间距受限保证可通过。
7. `tic-tac-toe`（⭕）
   - DOM 3×3；玩家 X 先手 vs AI O；AI=minimax 基础上 20% 概率走随机合法步（聪明但可战胜）；回合判定胜负/平局并高亮三连；计分板 X胜/O胜/平局；New Round 重开并轮换先手；顶部 "You are X"。
8. `minesweeper`（💣）
   - DOM 9×9 网格 / 10 雷；左键翻开、右键标旗、触屏长按 ~400ms 标旗；首次点击及其邻居无雷（冲突时重新布雷）；数字配色（1 蓝 2 绿 3 红 4 深蓝…）；显示剩余旗数与计时；胜/负提示；Restart。

## 缩略图

- `public/img/games/<slug>.svg`：viewBox 512×288；圆角矩形渐变背景（颜色贴合对应游戏主题）；中央大号 emoji（font-size≈96）；底部居中白色粗体英文标题（≈30px, font-weight 700）；纯内联 SVG，无外部引用。

## 自动检查与报告

- checker：文件存在且 ≥2KB；全部内联 `<script>` 编译通过（无语法错误）；jsdom 可用时加载 300ms 内无未捕获异常且存在 `#game-root`。
- 报告格式（每款一行）：`slug | 行数 | 语法 | jsdom | 缩略图 | 备注`。禁止虚报；未验证就写 TODO。
