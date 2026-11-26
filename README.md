# ⚡ 天枢神豪 · 现代都市系统流长线养成手游（H5 / PWA）

一款面向手机 9:16 竖屏、自建服务器、点开链接即可畅玩并云端存档的现代都市神豪养成游戏。  
融合**长篇爽文主线连载、海城两级电子沙盘大地图、多处可购可藏娇房产、产业离线收菜、6 大区域小玩法、限时游轮番外活动**，以及基于 **DeepSeek (`deepseek-chat`)** 的活人感红颜微信 AI 实时私聊与长期记忆系统。

---

## 一、快速启动（本机 / 个人服务器一键运行）

> 环境要求：Node.js 18+（无需安装外部数据库，内置纯 WASM SQLite，单文件零运维）

```bash
# 1. 复制环境变量配置（填入你的 DeepSeek API Key，也可稍后在游戏内 GM 后台直接热填）
cp .env.example .env

# 2. 安装依赖（已安装可跳过）
npm run install:all

# 3. 打包前端与后端（打包后前后端同端口运行，默认 3080）
npm run build

# 4. 启动游戏服务器
npm start
```

启动后手机或电脑浏览器直接访问 `http://你的服务器IP:3080` 即可游玩！  
- **首个注册的账号会自动获得 GM 服主权限**，右上角会出现蓝色盾牌按钮，可在线配置 DeepSeek Key、开关限时活动、全服发福利邮件、热重载新剧本！
- 手机 Safari / Chrome 点击「添加到主屏幕」即可作为全屏 PWA App 体验。

### Docker 一键部署（可选）
```bash
docker build -t tianshu-shenhao .
docker run -d --name tianshu \
  -p 3080:3080 \
  -e DEEPSEEK_API_KEY=你的sk密钥 \
  -e JWT_SECRET=请改成随机长密码 \
  -v $(pwd)/data:/app/data \
  tianshu-shenhao
```

---

## 二、如何像追更小说一样持续扩展内容（热插拔，免改代码）

所有游戏内容均位于 `content/` 目录，修改或新增后在游戏内点击 **GM 后台 → 热重载剧本配置** 即可实时生效：

- `content/stories/stories.json`：连载主线与支线剧本（新增第 2～6 卷章节）
- `content/maps/haicheng.json` & `district_events.json`：海城片区与街头奇遇事件池
- `content/properties.json`：可购置房产、冠名写字楼、居家互动配置
- `content/businesses.json` & `assets_catalog.json`：产业、超跑、游艇、藏品与套装羁绊
- `content/heroines/heroines.json`：红颜档案、昼夜行踪与 DeepSeek 人设提示词
- `content/events/events.json`：限时番外活动与商店奖励

---

## 三、开发调试模式
如需前后端热重载开发：
```bash
# 终端 1：启动后端（3080 端口）
npm run dev:server

# 终端 2：启动 Vite 前端（5173 端口，自动代理 /api）
npm run dev:client
```
