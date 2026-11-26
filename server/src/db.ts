import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { config } from './config.js';

let dbInstance: Database | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_state (
  user_id INTEGER PRIMARY KEY,
  cash REAL NOT NULL DEFAULT 12000,
  sys_points INTEGER NOT NULL DEFAULT 50,
  sys_level INTEGER NOT NULL DEFAULT 1,
  sys_exp INTEGER NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL DEFAULT 100,
  energy_updated_at INTEGER NOT NULL,
  crit_charge INTEGER NOT NULL DEFAULT 25,
  current_district TEXT NOT NULL DEFAULT 'old_street',
  main_property_id TEXT NOT NULL DEFAULT 'prop_old_room',
  equipped_car_id TEXT NOT NULL DEFAULT 'car_ebike',
  skills_json TEXT NOT NULL DEFAULT '{}',
  daily_date TEXT NOT NULL DEFAULT '',
  signed_in_today INTEGER NOT NULL DEFAULT 0,
  daily_progress_json TEXT NOT NULL DEFAULT '{}',
  daily_claimed_json TEXT NOT NULL DEFAULT '[]',
  ai_msg_today INTEGER NOT NULL DEFAULT 0,
  last_gift_heroine_id TEXT DEFAULT '',
  last_gift_time INTEGER DEFAULT 0,
  total_spent REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS player_businesses (
  user_id INTEGER NOT NULL,
  business_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  assigned_heroine_id TEXT DEFAULT '',
  last_collected_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS player_properties (
  user_id INTEGER NOT NULL,
  property_id TEXT NOT NULL,
  renovation_level INTEGER NOT NULL DEFAULT 1,
  custom_name TEXT DEFAULT '',
  residents_json TEXT NOT NULL DEFAULT '[]',
  last_rent_at INTEGER NOT NULL,
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS player_assets (
  user_id INTEGER NOT NULL,
  asset_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS player_heroines (
  user_id INTEGER NOT NULL,
  heroine_id TEXT NOT NULL,
  unlocked INTEGER NOT NULL DEFAULT 0,
  affection INTEGER NOT NULL DEFAULT 0,
  daily_chat_affection INTEGER NOT NULL DEFAULT 0,
  daily_date TEXT NOT NULL DEFAULT '',
  last_gift_name TEXT DEFAULT '',
  last_interaction_at INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, heroine_id)
);

CREATE TABLE IF NOT EXISTS npc_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  heroine_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  inner_thought TEXT DEFAULT '',
  mood TEXT DEFAULT 'calm',
  location_label TEXT DEFAULT '',
  affection_delta INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS npc_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  heroine_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS social_moments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT DEFAULT '',
  content TEXT NOT NULL,
  location TEXT DEFAULT '海城',
  likes_json TEXT NOT NULL DEFAULT '[]',
  comments_json TEXT NOT NULL DEFAULT '[]',
  liked_by_player INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_progress (
  user_id INTEGER NOT NULL,
  episode_id TEXT NOT NULL,
  choice_id TEXT DEFAULT '',
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS player_events (
  user_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  plays_today INTEGER NOT NULL DEFAULT 0,
  daily_date TEXT NOT NULL DEFAULT '',
  redeemed_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS player_mails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cash REAL DEFAULT 0,
  sys_points INTEGER DEFAULT 0,
  energy INTEGER DEFAULT 0,
  claimed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gm_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(config.dbPath)) {
    const fileBuf = fs.readFileSync(config.dbPath);
    dbInstance = new SQL.Database(fileBuf);
  } else {
    dbInstance = new SQL.Database();
  }

  dbInstance.run(SCHEMA_SQL);
  persistDb();
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

export function persistDb(): void {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const tmpPath = `${config.dbPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, config.dbPath);
}

export function queryOne<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T | null {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row: T | null = null;
  if (stmt.step()) {
    row = stmt.getAsObject() as T;
  }
  stmt.free();
  return row;
}

export function queryAll<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function execute(sql: string, params: SqlValue[] = [], save = true): void {
  const db = getDb();
  db.run(sql, params);
  if (save) persistDb();
}

export function getLastInsertId(): number {
  const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return row?.id ?? 0;
}

export function getGmSetting(key: string): string | null {
  const row = queryOne<{ value: string }>('SELECT value FROM gm_config WHERE key = ?', [key]);
  return row ? row.value : null;
}

export function setGmSetting(key: string, value: string): void {
  execute(
    'INSERT INTO gm_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
