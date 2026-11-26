import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const config = {
  port: Number(process.env.PORT || 3080),
  jwtSecret: process.env.JWT_SECRET || 'tianshu_shenhao_dev_secret_2026',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  aiDailyMessageLimit: Number(process.env.AI_DAILY_MESSAGE_LIMIT || 80),
  adminSecret: process.env.ADMIN_SECRET || 'tianshu_gm_2026',
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/tianshu.sqlite'),
  contentDir: path.join(ROOT_DIR, 'content'),
  clientDistDir: path.join(ROOT_DIR, 'client', 'dist'),
};
