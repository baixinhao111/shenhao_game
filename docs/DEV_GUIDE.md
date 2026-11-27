# 天枢神豪 · 开发规范（给后续开发者与 AI 模型）

> 这是项目的**现行**开发规范，优先级高于 `docs/01~05` 里的早期设计稿（特别是 `03_UI交互规范` 的配色与弹窗规则已作废）。
> 动手之前请先读完 §1–§4；做 UI 看 §5–§6；加玩法看 §7–§8；交付前按 §12 自查。

---

## 1. 项目一句话

手机竖屏（9:16）H5/PWA 都市神豪养成游戏。核心循环：**读主线剧情 → 赚钱（产业收租 + 区域小玩法）→ 买产业/物业/座驾（可谈判）→ 身价晋升解锁新区域与剧情 → 和红颜互动（AI 私聊）**。

视觉方向代号 **「海城夜金」**：夜蓝底 + 香槟金 + 天枢冰蓝 + 玫瑰色点缀，外滩 Art Deco 装饰语言，全部入口使用彩绘图标资产。

## 2. 技术栈与命令

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Tailwind 3 + framer-motion + zustand |
| 后端 | Node 18+ / Express + TypeScript，`sql.js`（WASM SQLite，单文件数据库 `data/tianshu.sqlite`） |
| AI 私聊 | DeepSeek（`server/src/deepseekService.ts`，Key 在 `.env` 或 GM 后台） |
| 字体 | 自托管 `@fontsource/noto-serif-sc`（标题）、`@fontsource/oswald`（数字），入口 `client/src/fonts.ts` |

```bash
npm run install:all                 # 安装前后端依赖
npm run build                       # 打包前端 + 编译后端
npm start                           # 生产运行，默认 http://localhost:3080（前后端同端口）
npm run dev --prefix server         # 后端热更新（tsx watch）
npm run dev --prefix client         # 前端 Vite，/api 代理到 3080
npm run build:demo --prefix client  # 离线试玩版（见 §10）
```

## 3. 目录结构

```
client/src/
  App.tsx                 手机外壳（data-app-shell）、主 Tab 路由、全局层（MinigameHost/Overlays/RewardFlyLayer）
  design.css              ★ 设计系统（所有颜色 token 与组件类），index.css 只放动画关键帧
  store/useGameStore.ts   全局状态：state(服务端全量快照)、导航、弹层、flyReward、activeMinigame/activeDeal
  lib/api.ts              apiRequest（试玩版时自动走 demo mock）
  lib/sound.ts            WebAudio 合成音效（无音频文件）
  components/
    GameIcon.tsx          ★ 彩绘图标 <GameIcon name/>、OrnateCorners 角花、DecoHeading 章节标题
    TopBar.tsx            PlayerEmblem 头像徽章、ResourceCapsules 资源胶囊（金币飞入的锚点）
    BottomNav.tsx         彩绘图标底栏
    RewardFly.tsx         金币飞入资源栏的动效层
    Overlays.tsx          顶部通知、错误提示、暴击全屏、弹幕、信箱、财富榜、GM 后台
    VisualNovelTheater.tsx 剧情演出（对话框、选项、结算页）
  views/                  五个主 Tab：Home / CityMap / Story / Assets / Heroines，+ SystemView(个人档案)
  minigames/              ★ 全屏小玩法场景 + 谈判场景（见 §7–§8）
  demo/                   离线试玩版 mock（只在 --mode demo 打包）
client/public/assets/     所有图片资产（见 §6）
server/src/
  routes.ts               大部分 REST 接口（剧情、地图、房产、产业、聊天、系统、GM）
  gameEngine.ts           身价/阶层计算、每日重置、暴击返现、buildFullGameState、player_kv
  economy.ts              ★ 扣钱/扣精力/扣积分/发奖的唯一入口
  purchases.ts            ★ 产业/物业购买（全款与谈判共用）
  minigames.ts            ★ 小玩法会话引擎（服务端权威）+ 本金账本
  negotiation.ts          ★ 商战谈判
  contentLoader.ts        读取 content/*.json，支持 GM 热重载
content/                  ★ 所有剧情/地图/产业/资产/红颜数据（热插拔，改完 GM 后台点「热重载」）
scripts/assets/           Seedream 出图与抠图脚本
scripts/qa/               接口测试、平衡性模拟、浏览器场景脚本
scripts/demo/             试玩版录制与打包
```

## 4. 架构铁律

1. **服务端权威**。任何影响钱、积分、好感、资产的结果都由服务端计算；客户端只负责渲染和上报操作，服务端必须校验与钳制（范围、次数、冷却、时间）。
2. **全量状态快照**。写操作接口统一返回 `{ ..., state: buildFullGameState(userId) }`，前端用 `applyServerState(res.state, critResult?)` 覆盖。不要在前端自行改数值（试玩 mock 除外）。高频只读接口（如赌石估价）可以不带 state。
3. **经济操作只走 `economy.ts`**：`spendCashOrThrow / spendEnergyOrThrow / spendSysPointsOrThrow / grant`。先 `assert*` 全部校验通过再扣，避免扣了一半报错。不要在新代码里手写 `UPDATE player_state SET cash = ...`。
4. **购买只走 `purchases.ts`**（`purchaseBusiness / purchaseProperty`），它负责阶层校验、扣款、暴击返现、入库、朋友圈。
5. **内容与代码分离**。剧情、区域、产业、物业、资产、红颜都在 `content/`；新增内容优先改 JSON，不要把文案写死在组件里（UI 提示语除外）。
6. **错误信息给玩家看**：服务端 `throw new Error('中文、说明原因与解决办法')`，前端 `showError(e.message)` 直接展示。
7. 进程是**单实例**：小玩法/谈判会话存在内存 Map 里。不要多进程部署；重启时未结算本金由账本自动退还（§7.4）。

## 5. UI 设计规范（海城夜金）

### 5.1 颜色（定义在 `client/src/design.css` 的 `:root`）

| 用途 | 值 | 说明 |
|---|---|---|
| 底色 ink | `#05070F` `#0A0F1F` `#0F1630` `#172142` | 夜蓝，**禁止**再用中性纯黑 `#000/#0A0B0F` 做面板 |
| 金 | `--gold #E2BD72`，亮 `#FFE7B0`/`#F6DDA4`，暗 `#A07C3E` | 金额、标题、主按钮、选中态 |
| 天枢冰蓝 | `--cyan #63E6F2`，浅 `#9BF5FF`/`#B9F6FB` | **只**用于天枢系统相关（透视、读心、内参、系统提示、积分） |
| 玫瑰 | `--rose #F0789A`，浅 `#FFB3C6` | **只**用于红颜/好感/心声 |
| 正文 | `#F4EFE4` 主，`#C3C9DC`/`#A3AAC2` 次，`#8B93AD`/`#6B7392` 弱 | 带蓝调的灰，不用纯灰 |
| 涨跌 | 涨 `#FF5C7A`（红），跌 `#3FD69A`（绿） | 中国习惯：涨红跌绿 |

### 5.2 字体

- 标题、人名、按钮文案：`font-editorial`（思源宋体 700/900）。大标题用 `gold-gradient-text`。
- 金额、数字、计时：`font-num`（Oswald，等宽数字）。
- 正文：系统无衬线（默认）。
- 压在插画上的文字一律加 `text-stroke-dark`（或 `text-shadow-stage`）保证可读。

### 5.3 组件类速查（`design.css`）

| 类 | 用途 |
|---|---|
| `panel-arch` | 普通卡片（夜蓝漆面 + 细边） |
| `panel-brass` | 强调卡片（金边，当前项/可领取/主线） |
| `panel-elevated` | 浮层/底部抽屉 |
| `gold-btn-shimmer` / `btn-brass` | 主按钮（带流光 / 不带） |
| `btn-navy` | 次按钮 |
| `btn-system` | 天枢相关按钮（冰蓝） |
| `tab-chip` + `data-active` | 胶囊分段切换，外层用 `rounded-full bg-[#070B18]/90 border` 包一圈 |
| `bar-track` + `bar-fill` | 金色进度条 |
| `res-capsule` | 顶部资源胶囊（用 `ResourceCapsules` 组件，不要手搓） |
| `icon-entry` + `.lbl` | 首页侧栏图标入口（图标在上、描边小字在下） |
| `red-dot` | 红点提示 |
| `deco-texture` | 页面底纹（Art Deco，已压暗） |
| `ornate` 或 `<OrnateCorners/>` | 四角金色角花，只给最重要的 1 个面板用 |
| `<DecoHeading title aside/>` | ◆ 标题 ——— 的章节头 |
| `holo-panel`（+`holo-gold`）/ `holo-option` | 天枢全息面板 / 系统选项（只给天枢用，见 §5.7） |
| `vn-dialogue-band` / `vn-name-rule` | 剧情对白区底部渐隐带 / 名字下金线 |

### 5.3.1 少用框，多用线与留白（2026-11 起的方向）

之前的「AI 味」很大一部分来自**什么都装进圆角卡片**。新做或重做界面时按下面的优先级选：

1. **画面出血 + 渐隐**：有图的区块（卷封面、精选主线、展厅）让图铺到屏幕边缘，用渐变溶进底色，文字直接压在图上（`text-stroke-dark`）。
2. **节点 + 连线**：有先后/成长关系的内容（主线章节 `views/story/StoryRoute.tsx`、进修技能脉络）用徽章节点串在一条线上；已完成的线段是亮金实线，未到的是暗色虚线。
3. **发丝线分隔**：列表（日程、套装）用 `h-px bg-gradient-to-r from-transparent via-[#E2BD72]/20 to-transparent` 分隔，不给每行套卡片。
4. **陈列**：物品（藏品、补给）放在「光台/层板」上（底部椭圆光 + 金色发丝线），不放进方格。
5. **数据用排版而不是框**：几项并列的数字用细竖线分隔（`border-l border-[#E2BD72]/15`），进度条用 2px 细线。
6. **页签**：`route-tab`（文字 + 金色短下划线）优先于胶囊 `tab-chip`。

仍然可以用面板的地方：浮层/抽屉、天枢全息面板（`holo-panel`）、需要强调「可点击的一整块」的产业海报卡。一屏里面板不要超过两种。

### 5.3.2 质感层 v2：更暗、更少金（样板：剧情目录、个人档案、剧情结算）

| 要素 | 用什么 |
|---|---|
| 页面底 | `.night-page`（#04050A + 角落暖光/冷光），不再用 `deco-texture` 花纹底 |
| 氛围 | `<Atmosphere/>`（漏光、胶片颗粒、稀疏碎光）放在页面最底层 |
| 面板 | `.smoke-glass`：透出背景的烟熏玻璃 + 顶部 1px 高光；需要标区域时用 `.tick-corners` 角标，不画整框 |
| 文字四级 | 中文标题 `.ink-title`（象牙白，不用金渐变）/ 英文小标签 `.label-en` / 边缘竖排微标 `<EdgeLabel/>` / 超大描边水印 `<Watermark/>` |
| 颜色 | 香槟 `var(--champagne)` 代替亮金；正文 `#D9D4C9`、次要 `#8C90A0`；鲜色只给关键数值 |
| 按钮 | 常规主按钮 `.btn-champagne`，次按钮 `.btn-ghost`；闪光金 `gold-btn-shimmer` 只留给全屏大时刻 |
| 页签 | `route-tab v2` |
| 结算 | 日常结算安静：模糊场景 + 引语 + 一张烟熏玻璃奖励单；只有出现暴击才加放射光 |

新做页面直接按 v2 写；旧页面逐步迁移，迁移时整页一起换，避免一屏新旧混搭。

### 5.4 图标

- 功能入口、资源、奖励一律用彩绘图标 `<GameIcon name="cash" size={24}/>`，名称见 `GameIcon.tsx` 的 `GameIconName`。
- `lucide-react` 线条图标**只**允许用于微小的系统控件（返回箭头、关闭 ×、播放/暂停、发送），**不能**用于功能入口、奖励、资源。
- 不用 emoji 当图标（⚡💰 等），用 `energy` / `cash` 图标。

### 5.5 反馈与弹窗规则（最重要，也是之前「AI 味」的主要来源）

1. **结果在场景里演出来，不弹居中卡片**：石头裂开、车冲线、K 线标出平仓点、卡牌翻开、印章落下。结束时用底部 `ResultStrip`（标题 + 金额 + 一行说明 + 两个按钮）铺在场景上。
2. **收钱 = 金币飞入**：`useGameStore().flyReward(amount, from?)`，默认从玩家最后点击的位置飞向资金胶囊（`data-fx-anchor="cash"`）。签到、收租、领任务、领邮件都用这个，**不要**再配一个「到账」通知。
3. **全屏演出只留给大时刻**：暴击 ≥5 倍、帝王绿、章节通关。2–3 倍暴击只飞金币（`applyServerState` 已自动处理）。
4. **顶部通知 `notifyTop`** 只用于状态变化（新联系人、收购完成、兑换成功），不用于「钱到账」。
5. **NPC 说话用 `<Speech who text tone/>`**，直接压在场景上，不加对话框（剧情 VN 除外）。
6. **大时刻是分段演出**（`components/Ceremonies.tsx`）：
   - `CritShow`（≥5 倍暴击）：叮 → 倍率老虎机式滚动 → 印章砸下震屏 → 金额从 0 滚到到账数 + 金币雨，轻触可跳段。
   - `TierUpShow`（阶层晋升）：`applyServerState` 发现 `player.tier.tier` 变大时自动触发，排在暴击演出之后；会列出该阶层新开放的区域/产业。新增阶层或解锁内容只需改 `content/`，不需要动演出代码。
   - 剧情 `effect: "impact"` 自带集中线（`.fx-speedlines`）+ 镜头推近，适合打脸/反转那一句；不要每句都用。
   - 弹幕（`barrage` 节点）是直播式飘字：无底框、白字描边、`gold` 样式发金光，自动分 7 条轨道。
7. 主 Tab 切换有 0.18s 淡入上浮（`App.tsx`），不要在页面里再叠一层入场动画。
8. 底部抽屉（`panel-elevated rounded-t-[16px]`）只用于列表选择（赴约地点、地产列表、居家互动），不承载玩法本身。

### 5.6 剧情 VN（`VisualNovelTheater.tsx` + `components/vn/SystemPanels.tsx`）

- **对白区不是卡片**：底部一条渐隐暗带（`vn-dialogue-band`），上面是名字行（固定 30px 高，切换节点时文字不跳）+ 一条金线 + 正文。不要再加边框、圆角卡片、角花、页码。
- 名字颜色：红颜（`state.heroines` 里的 id）用玫瑰色，其他人用金色渐变；`thought` 显示「内心独白」，`narration` 不显示名字。
- **天枢一律居中出现**：`system_alert` → `SystemAlertPanel`（「叮！」+ 全息面板从中线展开，含到账/暴击字样时自动变金色）；`system_choice` → `SystemChoicePanel`（「请宿主抉择」+ A/B/C 选项）。两者都盖在场景上，顶部操作栏仍可点。
- **天枢面板可随时唤出**：右上角 `TianshuSummonButton` → `TianshuStatusPanel`（宿主数据、晋升进度、本幕进度/抉择数、人物洞察、本幕系统日志）。当前台词有心声时按钮带提示点，面板内可直接「读取心声」。打开时暂停自动/快进。
- 系统文案用 `renderSysText()` 渲染：`【实体】` 加粗、金额/百分比/倍数用数字字体金色。写剧本时把关键实体包在 `【】` 里即可。
- 键盘：空格/回车推进，Esc 关闭天枢面板或回顾。

### 5.7 天枢配色约束

冰蓝 `#63E6F2` 和 `holo-*` 类只给天枢（系统提示、系统选项、宿主面板、天枢按钮）。剧情里其他人的东西一律金色/玫瑰色。

### 5.8 布局

- 外壳在 PC 上是 412×852 居中手机框，手机上铺满 `100dvh`。所有截图和自测按 **412×852** 视口。
- 首页结构：左上玩家徽章、右上资源胶囊、左侧功能图标列、右侧（天枢/换人/赏图/待收分红）、底部人物名牌 + 主线入口卡。新增首页入口加到侧栏，不要加第三层浮层。
- 主 Tab 内页：`TopBar` + 内容 + `BottomNav`。全屏场景（剧情、聊天、小玩法、谈判）隐藏 TopBar/BottomNav（`App.tsx` 的 `hideChrome`）。

## 6. 美术资产规范

### 6.1 目录与格式

| 类型 | 路径 | 规格 |
|---|---|---|
| UI 彩绘图标 | `client/public/assets/ui/icons/*.webp` | 透明底，256×256，quality 90 |
| Logo / 底纹 | `client/public/assets/ui/` | logo.webp、deco_tile.webp |
| 场景背景（主线/区域） | `assets/bg/*.jpg` | 1024×1536（2:3 竖版） |
| 小玩法场景 | `assets/scene/*.jpg` | 1024×1536，quality 82 |
| 卷封面 | `assets/story/vol{n}.webp` | 1280×720，在 `stories.json` 卷上写 `"cover"` |
| 角色立绘 | `assets/characters/*.png` | 透明底半身/全身 |
| NPC 半身像 | `assets/npc/*.webp` | 透明底，长边 700 |
| 物品 | `assets/items/` | 车/游艇/藏品 png 透明底；产业/物业 jpg |
| 材质 | `assets/tex/*.webp` | 512×512，可平铺 |
| App 图标 | `public/icons/icon-{64,180,192,512}.png` | |

### 6.2 出图流程（Seedream 5.5 via OpenRouter）

```bash
export OPENROUTER_API_KEY=sk-or-...
python3 scripts/assets/gen_image.py out.png 1:1 "<prompt>"
python3 scripts/assets/cut_sheet.py out.png client/public/assets/ui/icons name1,name2,...,name9   # 3×3 图标表切图+抠图
```

- **图标一定要整表生成**（一张图 3×3 九个），风格才统一；单个补图会风格漂移。
- 图标风格句（固定附在 prompt 末尾）：
  `consistent style across all icons: glossy 3D rendered game icon, champagne gold polished metal combined with deep midnight-navy enamel, subtle cyan glowing accents, soft studio rim light, crisp clean silhouette, premium luxury modern Chinese urban mobile game UI, each object fully separated with large empty spacing between them, plain pure white background, no text, no letters, no numbers, no labels, no frames, no grid lines`
- 场景背景风格句：
  `anime background art for a Chinese urban otome mobile game, painterly cinematic lighting, high detail, vertical composition, no people, no text, no letters`（比例 2:3）
- 角色/NPC：`Chinese urban otome mobile game anime illustration style, semi-realistic attractive character art, half-body portrait facing viewer, clean lineart, soft cel shading, plain pure white background, no text`，多个角色用 2×2 表一次出，再用 rembg 抠图。
- 生成后**必须肉眼检查**：汉字是否写对、有无品牌 Logo（车钥匙、手表上的真实品牌要避免）、抠图边缘是否干净。不合格就重出。
- 不使用真实品牌、真实人物、其他游戏的角色或美术。

## 7. 小玩法开发规范（`server/src/minigames.ts` + `client/src/minigames/`）

### 7.1 会话模型

每个玩法都是 **start → interact* → settle**：

```
POST /api/mg/<game>/start   扣精力+本金，生成隐藏状态，openSession()，ledgerOpen() 记账，返回渲染所需的公开数据
POST /api/mg/<game>/<act>   校验并推进（可多次）
POST /api/mg/<game>/finish  结算：closeSession()（自动销账）→ grant() 发奖 → finishCommon()（日常任务计数）
```

- 同一玩家同一玩法只能有一个进行中会话；开新局会先 `autoSettle` 旧局（按最安全的默认方式结算，不吞本金）。
- 会话 30 分钟过期，定时器自动结算。
- 所有客户端输入都要钳制/过滤：数组截断、数值 clamp、时间戳排序、冷却与频率限制、预算上限（参考 `sanitizeLiveActions`）。
- 需要时间的玩法用 `s.createdAt` 校验真实耗时（例：股票平仓不能早于已流逝的 tick，竞速 4 秒内完成视为无效）。
- 每个接口用 `handle(fn)` 包装，自动附带 state 与错误处理；高频只读接口用 `handle(fn, { withState: false })`。

### 7.2 现有玩法一览

| 玩法 | 区域 coreMinigame | 关键机制 | 平衡目标 |
|---|---|---|---|
| 赌石 jade | jade_gambling | 擦石掩码（30×20 格）→ 三买家实时报价；色皮诱饵、裂纹压价；天枢透视热力图；帝王绿可收藏（补齐鬼市三件套） | 全擦开期望 ≈1.0×，过早出手略亏（`JADE_SCALE` 按档位） |
| 股市 stock | stock_market | 3× 杠杆、40 tick×0.75s 价格路径、突发新闻冲击、爆仓线 | 天枢内参准确率 72%+洞察 |
| 竞速 race | street_race | 4 段计时指针，马力决定判定区宽度 | 全完美 ×2.8，胜 ×2.2 |
| 打榜 live | livestream_pk | 30s 拔河；双倍时刻（嘉年华×2）、反偷塔（绝杀×1.6）；预算用不完退回 | 会用时机 ≈99% 胜，开局梭哈 ≈43% |
| 天使 angel | angel_invest | 3 份 BP，2 次追问揭示真相，天枢判定 | 注水 0.2–0.5×，稳健 1.5–2.3×，潜力 3.5–6.5× |
| 公海 cruise | cruise_event | 21 点，天枢透视暗牌，每日 5 手，勋章兑换 | 筹码 30 万/手 |

### 7.3 新增一个小玩法（检查清单）

1. `content/maps/haicheng.json`：给区域设置 `coreMinigame`、`coreMinigameLabel`、`coreMinigameDesc`。
2. 服务端 `minigames.ts`：在 `Kind` 加类型；写 start/act/finish 路由；在 `autoSettle` 加默认结算；有本金就 `ledgerOpen`（加注用 `ledgerAdd`）；结算里 `grant` + `finishCommon`。
3. 用 `scripts/qa/balance_*.mjs` 的方式写蒙特卡洛模拟，**期望回报控制在 0.9–1.1×**，并保证「会玩」明显优于「乱玩」。
4. 前端 `client/src/minigames/XxxGame.tsx`：用 `<Stage bg title subtitle onBack>` 做外壳，`useMgApi()` 调接口，选档用 `StakePicker`，结果用 `ResultStrip`，收钱 `flyReward`，输了 `playLose()`。
5. `MinigameHost.tsx`：注册到 `GAMES`，并在 `MINIGAME_OF` 映射 coreMinigame → kind；`CityMapView` 的区域按钮会自动打开。
6. 图标：在 `CityMapView` 的 `DISTRICT_ICON` 指定地图牌子的图标；需要新图标就整表出图（§6.2）。
7. 场景背景出图到 `assets/scene/`。
8. **返回键**：中途离开时要么自动结算（股票按当前价平仓、21 点自动停牌），要么拦截并提示（赌石要求先卖、PK 不能中途退、竞速二次确认），不能让本金悬空。

### 7.3.1 彩头随阶层放大

代码里的档位（`STOCK_STAKES`、`RACE_STAKES`、`JADE_COST` …）都是**阶层 1 的基础值**，实际金额 = 基础值 × `tiers[].stakeScale`（`content/maps/haicheng.json`，当前 1/3/30/300/…）。服务端 `stakeScaleOf(userId)` 校验，前端 `StakePicker` 自动乘倍率（服务端已下发换算后金额时传 `scale={false}`），其他显示用 `useStakeScale()`。新玩法照此处理，否则后期彩头对身价毫无影响。

### 7.4 本金账本

`minigames.ts` 的 `ledgerOpen/ledgerAdd/ledgerClose` 把进行中的本金写入 `player_kv`（`mg_open_<kind>`）。`closeSession()` 会自动销账；服务启动时 `refundOrphanedStakes()` 把残留的本金退还（日志「已退还 N 笔…」）。新玩法凡是先扣钱的都必须记账。

### 7.5 经济总则（改数值前必读）

- **身价的增长引擎是「投资 + 返现」**：买/升级产业、物业会按 `rollCritCashback` 掷返现。返现规则：基础 12%（+技能/套装/红颜），未触发时蓄能，蓄能与「这笔消费 ÷ 当前身价」成正比（≥6% 记满 25 点，最少 2 点），满 100 必出 3/5/10 倍。常量在 `gameEngine.ts` 的 `CRIT`，模拟器里有一份必须同步。
- 之前的规则（28% + 每笔固定 +25 蓄能）会让玩家一次上线就靠刷小升级把身价翻 5–10 倍，门槛形同虚设，不要改回去。
- 小玩法期望 ~1.0×，不是身价来源；它们提供的是参与感、天枢积分、好感、收藏与每日任务奖励。

## 8. 商战谈判（`server/src/negotiation.ts` + `NegotiationScene.tsx`）

- 入口：产业页「谈判」、区域地产抽屉「谈判」→ `openDeal({kind, id})`；全款购买仍保留。
- 卖家隐藏三项：底价（挂牌价的 72–90%，「并购谈判」技能再降）、耐心、性格（逐利 / 要面子 / 缺钱）。开价为挂牌价 1.08 倍，最多 6 回合，最后一回合对方给最终报价。
- 出价不低于底价就成交（按出价成交）；压价越狠扣耐心越多（要面子的额外扣）；耐心归零对方离场，该物品冷却 10 分钟（`player_kv: deal_cd_*`）。
- 牌：资金实力 / 人脉施压（阶层≥2）/ 情报揭底（20 积分）/ 红颜助攻（每局一位）/ 天枢读心（10、20、30… 积分，给出底价区间）。
- **扩展时必须同步**：
  - 新产业/物业 → 在 `SELLER_OF` 指定卖家（否则默认钱总）。
  - 新卖家 NPC → `SELLERS` 增加（立绘放 `assets/npc/`），台词在 `LINES` 按性格写。
  - 新红颜 → `HEROINE_ASSIST` 写她的助攻效果与台词，否则她不会出现在助攻列表。

## 9. 内容扩展

- **主线**：`content/stories/stories.json`，卷对象可带 `"cover"`（卷封面）。节点类型见 `useGameStore.ts` 的 `VNNode`。剧情选项奖励走 `reward` 字段，由服务端结算。
- **区域**：`content/maps/haicheng.json`（坐标 x/y 为地图百分比、`unlockTier`、`bg`、`interactions` 赴约/闲逛）。
- **红颜**：`content/heroines/heroines.json` + 立绘 + 首页戳一戳兜底台词（`HomeView.tsx` 的 `LOCAL_POKE_FALLBACKS`）+ 谈判助攻（§8）+ 剧情页 `HEROINE_CARD_BG`（`HeroinesView.tsx`）。
- **资产/套装**：`content/assets_catalog.json`。注意每个资产都要有获取途径（商店、剧情 `unlockAsset`、赌石收藏、活动兑换），否则套装永远集不齐。
- 改完内容：GM 后台「热重载剧本配置」即可，无需重启。

## 10. 离线试玩版（demo）

- `npm run build:demo --prefix client` 打出 `client/dist-demo/`：`lib/backend.ts` 被替换为 `demo/demoApi.ts`，所有请求在浏览器内由 mock 回放；字体改走 Google Fonts。
- 剧情数据来自真实服务端录制：`node scripts/demo/record.js /tmp/rec.json` → `python3 scripts/demo/build_demo_data.py /tmp/rec.json`。
- 打包成单页 + 资产：`python3 scripts/demo/package_demo.py`（输出 `scripts/demo/out/`，可发布为静态页面）。
- **当前限制**：demo mock 还没有实现新的 `/api/mg/*` 小玩法和 `/api/deal/*` 谈判接口，点进去会提示「暂未开放」。正式版不受影响；更新 demo 时需在 `demoApi.ts` 里按服务端同样规则补 mock。
- 正式构建不会包含 demo 代码（靠 vite alias），改 `lib/api.ts` 时不要直接 import `demo/`。

## 11. 代码约定

- TypeScript，函数组件 + hooks；全局状态放 zustand store，局部状态放组件。
- 客户端调接口：玩法场景用 `useMgApi().call`，其他用 `apiRequest` + `try/catch` + `showError`。
- 动效用 framer-motion，遵守 `prefers-reduced-motion`（`index.css` 已统一关闭持续动画）。
- 音效用 `lib/sound.ts` 现有函数（`playTap/playCoinBurst/playPerfect/playLose/playScrape/playCard/playSystemPing/playCritExplosion`），新音效也用 WebAudio 合成，不引入音频文件。
- `localStorage` 访问必须 `try/catch`（试玩版与隐私模式会抛错）。
- 新增服务端文件按职责拆分（参考 economy/purchases/minigames/negotiation），不要继续往 `routes.ts` 堆大段逻辑。
- 提交前：前后端 `tsc` 通过、`npm run build` 通过。

## 12. 交付前自查（QA）

```bash
npx tsc -b                 # client 目录
npx tsc -p tsconfig.json --noEmit   # server 目录
npm run build              # 根目录
npm start                  # 启动后另开终端：
node scripts/qa/api_minigames.test.mjs          # 小玩法+谈判接口测试（约 1 分钟，含 26s PK 等待）
node scripts/qa/balance_jade.mjs                # 赌石期望回报（需先 build server）
node scripts/qa/balance_live.mjs                # 打榜各打法胜率
node scripts/qa/balance_progress.mjs --suggest  # 身价成长曲线 + 每幕门槛建议（改经济/剧情奖励/门槛后必跑）
node scripts/qa/scenes.playwright.cjs out_dir jade,stock,race,angel,cruise,deal,live   # 浏览器实玩并截图
```

- 截图检查（412×852）：文字是否压在人物脸上/看不清、按钮是否被底栏挡住、金币是否飞向资金栏、结果条是否完整。
- 经济改动必须跑平衡模拟；新接口必须覆盖：钱不够、精力不够、非法参数、重复结算、他人会话 ID、过期会话。
- 改 UI 后对比 `docs/ui_before_after.jpg` 的风格基调，避免回退到「细线框 + 线条图标 + 居中弹窗」。

## 13. 已知事项 / 待办

- 股票价格路径整段下发给客户端（为了流畅渲染），懂开发者工具的玩家可以提前看到；如需防作弊改为分段下发。赌石石头内部布局同理。
- 会话在内存中，只能单进程运行（§4.7）。
- demo 版缺新玩法 mock（§10）。
- 主线身价门槛（ep_006 起）按 `scripts/qa/balance_progress.mjs` 调定：活跃玩家（一天 4 次上线）约第 12 天、休闲玩家（一天 2 次）约第 13 天读完第三卷。改了剧情奖励、产业数值、暴击规则后要重跑 `--suggest` 并同步 `stories.json` 的 `requireNetWorth`。
- `docs/01~05` 为早期设计稿，数值与玩法以代码和本规范为准。
