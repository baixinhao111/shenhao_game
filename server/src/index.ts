import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { loadContent } from './contentLoader.js';
import { initDatabase } from './db.js';
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

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, game: '天枢神豪', time: Date.now() });
  });

  app.use('/api', createApiRouter());

  // Serve built mobile web app directly in production (single-port zero-ops deployment!)
  if (fs.existsSync(config.clientDistDir)) {
    app.use(express.static(config.clientDistDir));
    app.get('*', (_req, res) => {
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
