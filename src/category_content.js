'use strict';

/**
 * Editorial content, SEO introductions, and FAQs for category landing pages.
 * Providing substantial text and FAQs turns empty collection pages into
 * authoritative topic hubs that rank for high-intent search queries.
 */

const CATEGORY_DATA = {
  puzzle: {
    en: {
      about: "Dive into our collection of free online Puzzle Games on Peachcade! Puzzle games test your logic, memory, pattern recognition, and problem-solving abilities. Whether you enjoy sliding numbers, matching vibrant gems, or solving intricate brain teasers, there is always a mental challenge waiting.",
      highlights: "From legendary logic games like 2048 and Minesweeper to relaxing Match-3 challenges and physics puzzles, our browser puzzle games run smoothly on PC, Mac, Chromebook, iPhone, and Android without downloading.",
      faqs: [
        { q: "What are the most popular Puzzle Games on Peachcade?", a: "Player favorites include 2048, Minesweeper, Memory Match, block fitting puzzles, and physics-based brain riddles." },
        { q: "Are puzzle games on Peachcade completely free?", a: "Yes, every puzzle game is 100% free to play directly inside your web browser with no downloads, installs, or registration required." },
        { q: "Can puzzle games help improve brain focus?", a: "Studies show that solving puzzles regularly stimulates neural plasticity, enhances working memory, and sharpens analytical thinking." }
      ]
    },
    zh: {
      about: "欢迎来到 Peachcade 免费在线益智游戏专区！益智解谜游戏旨在考验并锻炼您的逻辑思维、记忆力、空间想象力和问题解决能力。无论您喜爱数字方块滑动、宝石消除还是精巧的机关谜题，这里都有丰富的烧脑挑战等待探索。",
      highlights: "收录了包括 2048、经典扫雷在内的经典与创新作品，全部游戏支持电脑、平板与手机浏览器即点即玩，免下载安装。",
      faqs: [
        { q: "Peachcade 上最受欢迎的益智游戏有哪些？", a: "人气精选包括《2048》、《经典扫雷》、《记忆翻牌》以及各类消除与物理机关解谜游戏。" },
        { q: "这里的益智游戏免费吗？需要下载客户端吗？", a: "全站所有小游戏 100% 免费，打开网页浏览器即可流畅运行，无需下载任何软件或插件。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料オンラインパズルゲームへようこそ！記憶力、論理的思考、ひらめき力を試す数多くの名作パズルゲームがブラウザ上で楽しめます。数字のスライドパズルからマッチ3、物理演算パズルまで多彩なラインナップ。",
      highlights: "『2048』や『マインスイーパ』など定番の頭脳パズルから最新作まで、PCやスマホのブラウザでダウンロード不要ですぐに遊べます。",
      faqs: [
        { q: "人気のパズルゲームにはどのようなものがありますか？", a: "『2048』、『マインスイーパ』、『絵合わせ神経衰弱』、ブロック消去ゲームなどが定番人気です。" },
        { q: "パズルゲームは無料で遊べますか？", a: "はい、Peachcadeのパズルゲームはすべて登録・ダウンロード不要で100%完全無料でプレイ可能です。" }
      ]
    }
  },
  arcade: {
    en: {
      about: "Relive the golden era of retro gaming with our free online Arcade Games on Peachcade. Featuring fast-paced reflex challenges, endless runners, classic brick breakers, and nostalgic coin-op styles updated for modern web browsers.",
      highlights: "Enjoy quick responsive gameplay with simple controls and intense replayability. Play classics like Snake alongside modern browser arcade hits directly on your computer or mobile device.",
      faqs: [
        { q: "What defines an Arcade Game?", a: "Arcade games emphasize intuitive controls, escalating difficulty, rapid reflexes, and chasing high scores across bite-sized play sessions." },
        { q: "Can I play arcade games with keyboard or touch controls?", a: "Yes, our arcade games support arrow keys / WASD on PC and seamless touch swipes on mobile phones and tablets." }
      ]
    },
    zh: {
      about: "在 Peachcade 重温经典的街机电玩时代！街机游戏强调即时反应、节奏感与高分突破，包含了贪吃蛇、打砖块、跑酷冲刺等丰富有趣的街机机制。",
      highlights: "操作简单易上手，游戏节奏爽快，电脑端支持键盘操作，手机端支持触控滑动，即开即玩。",
      faqs: [
        { q: "街机游戏的特点是什么？", a: "注重极简的操作、逐步递增的挑战关卡与对反应极限的考验，特别适合碎片时间游玩。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料アーケードゲームでレトロゲームの興奮を体験しよう！反射神経を試す名作スネークやブロック崩しなど、直感的操作で何度でも挑戦したくなる魅力が満載です。",
      highlights: "PCではキーボード操作、スマートフォンではタッチ操作で軽快に動作し、誰でもすぐにハイスコアを目指せます。",
      faqs: [
        { q: "アーケードゲームとはどんなゲームですか？", a: "シンプルなルールで瞬時の判断と操作が求められ、スコアアタックを楽しめるジャンルです。" }
      ]
    }
  },
  action: {
    en: {
      about: "Get your adrenaline pumping with top free Action Games on Peachcade! Jump into thrilling combat, intense boss battles, survival arenas, and fast-moving platform fights right inside your browser.",
      highlights: "Action games challenge your hand-eye coordination and tactical reflexes. No hefty installations or downloads required — experience high-framerate 3D and 2D action on any device.",
      faqs: [
        { q: "What are the best free online action games?", a: "Our action catalog covers survival arenas, beat 'em ups, stickman brawlers, and fast-paced melee combats with instant loading." },
        { q: "Do action games run well on Chromebooks?", a: "Yes, our HTML5 action titles are lightweight and optimized for standard web browsers, making them ideal for Chromebooks and laptops." }
      ]
    },
    zh: {
      about: "在 Peachcade 畅享刺激热血的免费在线动作游戏！从快节奏格斗冲刺、怪物竞技场生存，到激烈的闯关对决，随时随地开启你的冒险战斗之旅。",
      highlights: "考验手眼协调与战术决断，精简高效的 WebGL 引擎让低配设备和轻薄本也能流畅运行高帧率动作场面。",
      faqs: [
        { q: "动作小游戏需要很高的电脑配置吗？", a: "完全不需要，基于现代化 HTML5 网页技术，普通电脑、学生笔记本及手机浏览器均可稳定流畅畅玩。" }
      ]
    },
    ja: {
      about: "アドレナリン全開の無料アクションゲームをPeachcadeで楽しもう！激しいバトル、障害物回避、ボス戦など、爽快感あふれるアクションが勢揃い。",
      highlights: "素早い判断と操作が鍵となるアクションタイトルが、インストールなしでブラウザから即座に起動します。",
      faqs: [
        { q: "スマホや低スペックPCでも動作しますか？", a: "はい、最新のブラウザ技術に最適化されているため、Chromebookやスマートフォンでも快適に遊べます。" }
      ]
    }
  },
  racing: {
    en: {
      about: "Step on the gas in our free online Racing Games on Peachcade! Speed through city streets, drift around sharp hairpin turns, conquer off-road dirt tracks, and park with precision in high-speed driving simulators.",
      highlights: "Whether you prefer realistic 3D sports car physics, arcade kart drifting, or challenging stunt courses, our browser racing games offer thrilling velocity without downloads.",
      faqs: [
        { q: "What kinds of vehicles can I drive?", a: "You can race supercars, drift cars, monster trucks, motorcycles, rally buggies, and heavy transport vehicles." },
        { q: "Can I play racing games with arrow keys or WASD?", a: "Yes, full keyboard steering is supported on desktop, while mobile versions feature responsive touch controls." }
      ]
    },
    zh: {
      about: "踩下油门，在 Peachcade 体验极速狂飙的在线赛车游戏！从城市街道超车、漂移竞速，到山地越野和高难度停车模拟，体验速度与激情的极致碰撞。",
      highlights: "涵盖 3D 超跑模拟、越野拉力、卡丁车狂飙等丰富车型，无需等待漫长的下载安装，网页即开即赛。",
      faqs: [
        { q: "赛车游戏支持手柄或键盘操作吗？", a: "电脑端全面支持 WASD 与方向键控制转向与刹车漂移，触屏设备支持屏幕虚拟按键。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料レーシングゲームでアクセル全開！スポーツカーのドリフト走行、難関コースのタイムアタック、駐車シミュレーターなど多彩なドライブを楽しめます。",
      highlights: "本格派の3Dカーシミュレーターから爽快なカートレースまで、すべてブラウザ上で今すぐプレイ可能です。",
      faqs: [
        { q: "操作方法は？", a: "PCではWASDキーや矢印キー、スマートフォンでは画面上のタッチ操作で簡単にステアリング操作が可能です。" }
      ]
    }
  },
  shooting: {
    en: {
      about: "Lock and load with the best free online Shooting Games on Peachcade. Put your marksmanship to the test in fast-paced first-person shooters (FPS), tactical sniper missions, bubble poppers, and space alien defense battles.",
      highlights: "Enjoy smooth mouse aiming, realistic recoil mechanics, and intense firefights without installing gigabytes of client files.",
      faqs: [
        { q: "What are the most popular shooting games online?", a: "Top picks include 3D tactical FPS arenas, precision sniper challenges, zombie survival shootouts, and 2D arcade shoot-'em-ups." },
        { q: "Is shooting accuracy dependent on mouse DPI?", a: "Our web shooting games support pointer lock, giving you true raw mouse aim identical to desktop shooters." }
      ]
    },
    zh: {
      about: "在 Peachcade 瞄准射击，体验热血沸腾的免费在线射击游戏！涵盖第一人称射击（FPS）、特种狙击暗杀、末日丧尸清扫以及趣味弹幕射击。",
      highlights: "网页端原生支持鼠标锁定（Pointer Lock），实现顺滑的视角移动与精准爆头瞄准，免下载安装。",
      faqs: [
        { q: "网页射击游戏能精准瞄准吗？", a: "支持现代浏览器的光标锁定技术，鼠标移动与瞄准手感和客户端端游保持一致。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料シューティングゲームで照準を合わせよう！FPS、スナイパー、ゾンビサバイバル、レトロな弾幕シューティングまで大興奮のバトルが満載。",
      highlights: "ブラウザのマウスロック機能に対応しており、滑らかな視点移動と本格的なエイミング操作を体験できます。",
      faqs: [
        { q: "マウスエイムは快適ですか？", a: "ポインターロック技術に対応しており、本格的なFPSと同様の直感的なエイム操作が可能です。" }
      ]
    }
  },
  sports: {
    en: {
      about: "Experience stadium energy in free online Sports Games on Peachcade! Compete in soccer penalty shootouts, basketball free throws, tennis tournaments, billiards, golf, and extreme skateboarding.",
      highlights: "Play quick casual rounds or climb championship leaderboards. Every sports title is optimized for fast web loading and smooth physical simulation.",
      faqs: [
        { q: "What sports games are available to play?", a: "Our selection includes soccer, basketball, 8-ball pool, baseball, bowling, and tennis matches." }
      ]
    },
    zh: {
      about: "在 Peachcade 感受体育赛场的竞技魅力！包含足球点球对决、街头篮球投篮、台球母球落袋、网球锦标赛等丰富多样的体育对战游戏。",
      highlights: "真实的物理碰撞与简洁明快的操作机制，随时开启一场酣畅淋漓的体育友谊赛。",
      faqs: [
        { q: "有哪些热门体育项目？", a: "足球、篮球、经典台球、保龄球和极限运动等项目应有尽有。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料スポーツゲームで白熱の対決を繰り広げよう！サッカーのPK戦、バスケのシュートゲーム、ビリヤード、テニスなど多彩な競技が揃っています。",
      highlights: "物理演算に基づいた爽快なゲームプレイを、インストール不要で楽しめます。",
      faqs: [
        { q: "どんなスポーツが遊べますか？", a: "サッカー、バスケットボール、8ボールビリヤード、ボウリングなどが人気です。" }
      ]
    }
  },
  casual: {
    en: {
      about: "Unwind and de-stress with free online Casual Games on Peachcade. Perfect for quick coffee breaks or relaxing evenings, casual games feature friendly mechanics, bright visuals, and satisfying progression.",
      highlights: "From coloring and card solitaire to idle sorting and simple tap mechanics, casual games are accessible to players of all ages on any screen.",
      faqs: [
        { q: "What are Casual Games best for?", a: "They are designed for stress-free entertainment, easy picking up, and relaxing sessions with no steep learning curve." }
      ]
    },
    zh: {
      about: "工作学习之余，来 Peachcade 享受轻松愉悦的休闲小游戏！没有复杂难懂的规则与压力，轻松点击即可体验乐趣，适合所有年龄段的玩家。",
      highlights: "包含了经典接龙、色彩分类、趣味轻游戏，界面清新明快，即点即玩无需等待。",
      faqs: [
        { q: "休闲游戏适合什么时候玩？", a: "非常适合通勤路上、休息片刻或睡前放松时游玩，简单有趣又解压。" }
      ]
    },
    ja: {
      about: "Peachcadeのカジュアルゲームでリラックスした時間を過ごそう！難しいルールがなく、ちょっとした休憩時間やすきま時間に気軽に楽しめるゲームが満載です。",
      highlights: "カードゲーム、カラーソート、タップ系ゲームなど、誰でも直感的に楽しめるタイトルが揃っています。",
      faqs: [
        { q: "カジュアルゲームの特徴は？", a: "ルールが分かりやすく、ストレスなく短時間で楽しめるのが最大の魅力です。" }
      ]
    }
  },
  skill: {
    en: {
      about: "Test your precision, timing, and composure with free online Skill Games on Peachcade. These games push your reflexes, rhythm, and accuracy to the highest level.",
      highlights: "Jump over moving obstacles, time your clicks to the millisecond, and master complex multi-tasking challenges directly in your browser.",
      faqs: [
        { q: "How can I improve at skill games?", a: "Consistent practice, learning obstacle patterns, and staying calm under fast pacing will rapidly boost your high scores." }
      ]
    },
    zh: {
      about: "在 Peachcade 挑战技巧极限！技巧类游戏重点考察您的反应敏捷度、微操手速与精准时机把握能力，挑战更高连击与全球积分榜。",
      highlights: "毫秒级的时机点击、跨越障碍物与快节奏躲避，带给你纯粹的技术征服感。",
      faqs: [
        { q: "如何提高技巧游戏的得分？", a: "熟悉障碍物节奏与判定判定线，保持冷静平稳的按键频率是获得高分的关键。" }
      ]
    },
    ja: {
      about: "Peachcadeのスキルゲームで反射神経とタイミングを磨こう！ミリ秒単位の正確な操作やリズム感が求められる挑戦的なタイトルが揃っています。",
      highlights: "障害物ジャンプや精密なタップ操作など、自分の限界に挑戦できるハイスコアゲームが満載。",
      faqs: [
        { q: "上達のコツは？", a: "ステージのギミックやタイミングを覚え、落ち着いて反復練習することがスコアアップへの近道です。" }
      ]
    }
  },
  board: {
    en: {
      about: "Play timeless Board Games online for free on Peachcade. Enjoy strategic face-offs against smart AI or pass-and-play matches across Chess, Checkers, Tic-Tac-Toe, Ludo, and Dominoes.",
      highlights: "Rich board traditions reimagined for the digital screen. Test your foresight, strategy, and patience without setting up a physical board.",
      faqs: [
        { q: "Can I play board games against a computer AI?", a: "Yes, our board titles feature multiple difficulty levels from friendly beginner to master computer opponents." }
      ]
    },
    zh: {
      about: "在 Peachcade 体验经久不衰的经典棋牌游戏！涵盖国际象棋、五子棋、井字棋、跳棋、西洋双陆棋与多米诺骨牌等永恒策略对弈。",
      highlights: "支持高拟真人机智能对弈与双人同屏博弈，无需繁琐摆盘，随时随地开启智力较量。",
      faqs: [
        { q: "棋牌游戏支持人机对战吗？", a: "支持，多级别智能 AI 陪练，无论新手入门还是老手切磋都能找到适合的难度。" }
      ]
    },
    ja: {
      about: "Peachcadeの無料ボードゲームで世代を超えて愛される頭脳対決を楽しもう！チェス、三目並べ、チェッカー、バックギャモンなど名作棋盤ゲームが集結。",
      highlights: "賢いAIとの対局や思考力を深める戦略ゲームを、いつでもブラウザから楽しめます。",
      faqs: [
        { q: "コンピューターと対戦できますか？", a: "はい、初心者から上級者まで楽しめる様々な難易度のAI対戦機能が備わっています。" }
      ]
    }
  },
  platform: {
    en: {
      about: "Run, jump, and climb in exciting free Platformer Games on Peachcade. Navigate through hazardous obstacle courses, avoid traps, collect coins, and defeat tricky stage bosses.",
      highlights: "Classic 2D side-scrollers meet modern 3D parkour obby challenges. Responsive jumping physics make every platform leap thrilling.",
      faqs: [
        { q: "Are there both 2D and 3D platformers available?", a: "Yes, we feature nostalgic 2D pixel platformers as well as viral 3D parkour obstacle courses and tower climbs." }
      ]
    },
    zh: {
      about: "奔跑、跳跃与攀爬！在 Peachcade 畅玩热门闯关跳跃游戏。躲避尖刺陷阱、收集关卡金币、克服深渊障碍，向终点全力冲刺。",
      highlights: "汇聚经典 2D 横版卷轴与 3D 跑酷攀爬玩法，精准流畅的跳跃重力判定让每一次起跳都扣人心弦。",
      faqs: [
        { q: "跳跃闯关游戏包含哪些玩法？", a: "包含经典像素横版冒险、3D 极限跑酷（Obby）攀爬以及机关解谜跳跃等丰富模式。" }
      ]
    },
    ja: {
      about: "走って跳んで駆け抜けろ！Peachcadeのプラットフォーマーゲームでスリリングな冒険へ。トラップを回避し、コインを集めながらゴールを目指そう。",
      highlights: "名作2D横スクロールアクションから3Dパルクールタワーまで、爽快なジャンプアクションが楽しめます。",
      faqs: [
        { q: "どんなステージがありますか？", a: "レトロな2Dドット絵ステージから立体の障害物コースまで多彩なギミックが用意されています。" }
      ]
    }
  },
  adventure: {
    en: {
      about: "Embark on epic journeys with free online Adventure Games on Peachcade. Explore uncharted fantasy realms, solve mysterious quests, escape ancient temples, and uncover hidden treasures.",
      highlights: "Rich narrative worlds and discovery-driven gameplay ready to launch in seconds without massive game client downloads.",
      faqs: [
        { q: "What makes adventure games special?", a: "Adventure games focus on exploration, storyline immersion, curiosity, and unraveling mysteries across unique environments." }
      ]
    },
    zh: {
      about: "在 Peachcade 开启跌宕起伏的冒险之旅！探索未知的奇幻大陆、解开远古神庙的迷局谜题、逃离幽深古堡，发现深藏的神秘宝藏。",
      highlights: "沉浸式世界观与探索发现机制，网页即开即读档，免去大型单机端游漫长的下载等待。",
      faqs: [
        { q: "冒险游戏的魅力何在？", a: "融合剧情探索、场景解谜与未知挑战，带领玩家经历充满惊喜的探险历程。" }
      ]
    },
    ja: {
      about: "Peachcadeの冒険ゲームで未知なる世界へ旅立とう！古代遺跡の探索、謎解きクエスト、壮大なファンタジーワールドでの発見があなたを待っています。",
      highlights: "大容量ダウンロードなしで、本格的なストーリーや探索のワクワク感をブラウザで味わえます。",
      faqs: [
        { q: "セーブ機能はありますか？", a: "多くのタイトルがブラウザのローカルストレージに対応しており、前回の続きから冒険を再開できます。" }
      ]
    }
  },
  simulation: {
    en: {
      about: "Step into someone else's shoes with free online Simulation Games on Peachcade. Manage bustling restaurants, fly aircraft, design dream cities, and master life simulators in real-time.",
      highlights: "Satisfying management loops, realistic physics engines, and creative freedom let you build, test, and experiment in virtual sandbox environments.",
      faqs: [
        { q: "What simulation sub-genres can I play?", a: "Popular simulations include flight simulators, farming, restaurant cooking management, and vehicle driving sims." }
      ]
    },
    zh: {
      about: "在 Peachcade 体验不同人生的模拟经营乐趣！模拟驾驶真实飞机载具、经营属于自己的餐厅商铺、建设繁华都市，体验创造与管理的成就感。",
      highlights: "丰富的经营逻辑与物理模拟引擎，在虚拟沙盒中自由建造、调试与规划，免安装即点即玩。",
      faqs: [
        { q: "模拟游戏有哪些热门类型？", a: "涵盖飞行载具模拟、餐厅烹饪经营、农场种植以及建造类沙盒游戏。" }
      ]
    },
    ja: {
      about: "Peachcadeのシミュレーションゲームで理想の世界を築こう！レストラン経営、飛行機の操縦、街づくりなど、リアルな仮想体験が楽しめます。",
      highlights: "自由度の高いサンドボックスや緻密な経営システムを、ブラウザ上で手軽に楽しむことができます。",
      faqs: [
        { q: "どんな体験ができますか？", a: "パイロット体験、お店の経営、農業シミュレーションなど多種多様なシミュレーターを体験できます。" }
      ]
    }
  },
  clicker: {
    en: {
      about: "Tap your way to astronomical wealth with free online Clicker and Idle Games on Peachcade! Upgrade automated factories, recruit heroes, and watch numbers skyrocket exponentially.",
      highlights: "Addictive incremental progression continues even when you step away. Perfect for casual multi-tasking while studying or working.",
      faqs: [
        { q: "Do idle games continue progressing in the background?", a: "Yes, many idle clicker games calculate offline income and reward you with accumulated coins upon return." }
      ]
    },
    zh: {
      about: "在 Peachcade 享受指尖狂点与数字暴涨的放置放置类（Idle Clicker）游戏！建造全自动化流水线、招募伙伴、升级科技，见证财富指数级增长。",
      highlights: "极具魔性的成长系统与挂机离线收益，适合在工作学习间隙体验轻松升级的爽快感。",
      faqs: [
        { q: "放置游戏离线后还会增长吗？", a: "大多数放置挂机游戏支持后台与离线收益计算，再次上线时可一键收获丰厚奖励。" }
      ]
    },
    ja: {
      about: "クリックして資産を爆発的に増やそう！Peachcadeの無料クリッカー・放置ゲーム。自動化ラインの構築やアップグレードで爽快なインフレ感を体験。",
      highlights: "中毒性抜群の育成システムが魅力。勉強や仕事の合間に画面を開いて成果を確認するだけでも楽しめます。",
      faqs: [
        { q: "放置ゲームの魅力とは？", a: "簡単なタップから始まり、自動化が進むにつれて加速度的に数値が増えていく爽快な達成感です。" }
      ]
    }
  },
  girls: {
    en: {
      about: "Express your creativity with free online Games for Girls on Peachcade. Enjoy fashionable dress-up, makeover salons, cooking recipes, pet care, and interior decoration adventures.",
      highlights: "Vibrant art styles, hundreds of trendy wardrobe combinations, and heartwarming stories made for players who love style and aesthetics.",
      faqs: [
        { q: "Are dress up and makeover games mobile friendly?", a: "Yes, our fashion and styling games work wonderfully with intuitive touch controls on smartphones and tablets." }
      ]
    },
    zh: {
      about: "在 Peachcade 释放你的时尚创意与设计灵感！集合了精美换装、梦幻美妆沙龙、美食烹饪、萌宠护理与室内装饰等丰富游戏内容。",
      highlights: "清新唯美的画风、数百种时尚服饰搭配与趣味互动，随心打造专属风格形象。",
      faqs: [
        { q: "换装和美妆游戏支持手机触屏吗？", a: "全面支持手机与平板触摸操作，滑动点击即可为角色挑选搭配华丽发型与服饰。" }
      ]
    },
    ja: {
      about: "Peachcadeのガールズゲームでおしゃれやコーディネートを楽しもう！ドレスアップ、ヘアメイクサロン、クッキング、ペットのお世話などワクワクするゲームが集合。",
      highlights: "かわいいイラストと豊富なファッションアイテムで、自分好みのスタイルを自由にプロデュースできます。",
      faqs: [
        { q: "スマートフォンでも着せ替えは遊べますか？", a: "はい、タッチ操作に最適化されており、スマホやタブレットで手軽にコーディネートを楽しめます。" }
      ]
    }
  }
};

function get(categorySlug, lang) {
  const cat = CATEGORY_DATA[categorySlug];
  if (!cat) return null;
  const l = (lang === 'zh' || lang === 'ja') ? lang : 'en';
  return cat[l] || cat.en || null;
}

module.exports = { CATEGORY_DATA, get };
