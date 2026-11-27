# 天枢神豪 · AI 开发须知

完整规范见 **docs/DEV_GUIDE.md**（动手前先读 §1–§4；做 UI 读 §5–§6；加玩法读 §7–§8；交付前按 §12 自查）。
`docs/01~05` 是早期设计稿，与 DEV_GUIDE 冲突时以 DEV_GUIDE 和代码为准。

## 必守规则（摘要）

- **服务端权威**：钱、积分、好感、资产只在服务端计算；客户端输入必须校验/钳制。写接口返回 `state: buildFullGameState(userId)`，前端用 `applyServerState` 覆盖。
- **经济只走 `server/src/economy.ts`**（`spend*OrThrow` / `grant`），购买只走 `server/src/purchases.ts`。不要手写 `UPDATE player_state SET cash`。
- **小玩法** = `server/src/minigames.ts` 会话（start → act → finish），先扣钱的必须 `ledgerOpen` 记账；前端用 `client/src/minigames/Stage.tsx` 外壳并在 `MinigameHost.tsx` 注册。期望回报 0.9–1.1×，用 `scripts/qa/balance_*.mjs` 模拟验证。
- **UI 视觉「海城夜金」**：颜色/组件类只用 `client/src/design.css` 里的；入口、资源、奖励用彩绘 `<GameIcon>`，lucide 只用于返回/关闭等微控件；冰蓝只给天枢，玫瑰色只给红颜。
- **少用框**：图出血渐隐、节点连线、发丝线分隔、光台陈列、`route-tab` 文字页签优先；不要把每一项都装进圆角卡片（DEV_GUIDE §5.3.1）。
- **剧情里的天枢居中出场**：`system_alert`/`system_choice` 用 `components/vn/SystemPanels.tsx` 的全息面板，对白区是无边框渐隐带（DEV_GUIDE §5.6），不要退回卡片式对话框。
- **大时刻分段演出**：≥5 倍暴击走 `Ceremonies.tsx` 的 `CritShow`，阶层晋升由 `applyServerState` 自动触发 `TierUpShow`；新状态一律经 `applyServerState` 写入，别直接 `set({ state })`，否则会漏掉晋升演出。
- **不弹居中结果卡**：结果在场景内演出 + 底部 `ResultStrip`；收钱用 `flyReward()` 金币飞入；全屏演出只给 ≥5 倍暴击等大时刻；`notifyTop` 不用于「到账」。
- **美术资产**用 Seedream 5.5（`scripts/assets/gen_image.py`），图标必须 3×3 整表生成保持风格统一，规格与 prompt 模板见 DEV_GUIDE §6。不用真实品牌/真实人物/其他游戏素材。
- **内容在 `content/*.json`**，新增产业/物业要在 `negotiation.ts` 的 `SELLER_OF` 指定卖家；新增红颜要补 `HEROINE_ASSIST`、首页台词与立绘；每个收藏品都要有获取途径。
- 单进程运行（会话在内存）；`localStorage` 访问一律 try/catch。
- 交付前：client `npx tsc -b`、server `npx tsc -p tsconfig.json --noEmit`、根目录 `npm run build` 通过；改动小玩法/谈判跑 `node scripts/qa/api_minigames.test.mjs`；UI 改动在 412×852 视口截图自查。
