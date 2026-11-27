import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { loadContent } from './contentLoader.js';
import { initDatabase } from './db.js';
import { refundOrphanedStakes } from './minigames.js';
import { createApiRouter } from './routes.js';

function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

async function main() {
  loadContent();
  await initDatabase();
  const refunded = refundOrphanedStakes();
  if (refunded) console.log(`  已退还 ${refunded} 笔重启前未结算的小游戏本金`);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, game: '天枢神豪', time: Date.now() });
  });

  app.use('/api', createApiRouter());

  // Serve built mobile web app directly in production (single-port zero-ops deployment!)
  if (fs.existsSync(config.clientDistDir)) {
    app.use(
      express.static(config.clientDistDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res) => {
      // Never serve index.html for missing static chunks/assets or unknown API endpoints,
      // otherwise stale tabs get a text/html MIME error and SW caches HTML under .js URLs.
      if (
        /^\/(assets|icons|api)\//.test(req.path) ||
        /\.(js|mjs|css|map|png|jpg|jpeg|webp|svg|woff2?|json)$/i.test(req.path)
      ) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.clientDistDir, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    const lan = getLanIp();
    console.log(`\n================================================`);
    console.log(`  ⚡ 《天枢神豪》服务器已启动！`);
    console.log(`  本机访问:   http://localhost:${config.port}`);
    console.log(`  手机局域网: http://${lan}:${config.port}`);
    console.log(`  DeepSeek:   ${config.deepseekApiKey ? '已从 .env 加载' : '未配置（可在 .env 或 GM 后台随时填入）'}`);
    console.log(`================================================\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
