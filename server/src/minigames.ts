/**
 * Interactive minigames (server-authoritative sessions).
 *
 * Every game is start -> (interact) -> settle. The server keeps the hidden
 * state (stone interior, price path, deck, opponent script ...) in memory and
 * computes every payout itself; the client only renders and reports inputs,
 * which are validated and clamped here.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import { getContent } from './contentLoader.js';
import { execute, getGmSetting, persistDb, queryAll, queryOne } from './db.js';
import {
  assertCashSufficient,
  assertEnergySufficient,
  grant,
  spendCashOrThrow,
  spendEnergyOrThrow,
  spendSysPointsOrThrow,
} from './economy.js';
import {
  buildFullGameState,
  computePortfolioAndTier,
  ensurePlayerKvTable,
  getPlayerKv,
  incrementDailyTask,
  postMoment,
  rollCritCashback,
  setPlayerKv,
  todayKey,
} from './gameEngine.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

// ======================================================================
// Session store
// ======================================================================

type Kind = 'jade' | 'stock' | 'race' | 'live' | 'angel' | 'cruise';

interface Session {
  id: string;
  userId: number;
  kind: Kind;
  createdAt: number;
  data: any;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, Session>();
const activeByUserKind = new Map<string, string>();

const keyOf = (userId: number, kind: Kind) => `${userId}:${kind}`;

/**
 * Stake ledger: the cash a player put into an open session is recorded in
 * player_kv, so if the server restarts mid-game the stake is refunded on boot
 * instead of vanishing with the in-memory session.
 */
const LEDGER_PREFIX = 'mg_open_';

function ledgerOpen(userId: number, kind: Kind, stake: number): void {
  setPlayerKv(userId, LEDGER_PREFIX + kind, JSON.stringify({ stake, at: Date.now() }));
}

function ledgerAdd(userId: number, kind: Kind, extra: number): void {
  const raw = getPlayerKv(userId, LEDGER_PREFIX + kind);
  const cur = raw ? JSON.parse(raw) : { stake: 0, at: Date.now() };
  setPlayerKv(userId, LEDGER_PREFIX + kind, JSON.stringify({ ...cur, stake: (cur.stake || 0) + extra }));
}

function ledgerClose(userId: number, kind: Kind): void {
  ensurePlayerKvTable();
  execute('DELETE FROM player_kv WHERE user_id = ? AND key = ?', [userId, LEDGER_PREFIX + kind]);
}

/** Called once at boot: refund every stake left open by a previous process. */
export function refundOrphanedStakes(): number {
  ensurePlayerKvTable();
  const rows = queryAll<{ user_id: number; key: string; value: string }>(
    "SELECT user_id, key, value FROM player_kv WHERE key LIKE 'mg_open_%'",
  );
  for (const r of rows) {
    let stake = 0;
    try {
      stake = Number(JSON.parse(r.value).stake) || 0;
    } catch {
      stake = 0;
    }
    if (stake > 0) grant(r.user_id, stake);
    execute('DELETE FROM player_kv WHERE user_id = ? AND key = ?', [r.user_id, r.key], false);
  }
  if (rows.length) persistDb();
  return rows.length;
}

function openSession(userId: number, kind: Kind, data: any): Session {
  const prevId = activeByUserKind.get(keyOf(userId, kind));
  if (prevId) {
    const prev = sessions.get(prevId);
    if (prev) autoSettle(prev);
  }
  const s: Session = { id: crypto.randomBytes(9).toString('hex'), userId, kind, createdAt: Date.now(), data };
  sessions.set(s.id, s);
  activeByUserKind.set(keyOf(userId, kind), s.id);
  return s;
}

function getSession(userId: number, id: unknown, kind: Kind): Session {
  const s = sessions.get(String(id || ''));
  if (!s || s.userId !== userId || s.kind !== kind) throw new Error('本局已结束或已过期，请重新开始');
  return s;
}

function closeSession(s: Session): void {
  ledgerClose(s.userId, s.kind);
  sessions.delete(s.id);
  if (activeByUserKind.get(keyOf(s.userId, s.kind)) === s.id) activeByUserKind.delete(keyOf(s.userId, s.kind));
}

/** Settle an abandoned session with its safest default so stakes are never silently lost. */
function autoSettle(s: Session): void {
  try {
    if (s.kind === 'jade') settleJade(s, s.data.mask, bestBuyer(jadeOffers(s)));
    else if (s.kind === 'stock') settleStock(s, s.data.path.length - 1);
    else if (s.kind === 'race') settleRace(s, []);
    else if (s.kind === 'live') settleLive(s, [], true);
    else if (s.kind === 'cruise') cruiseStand(s);
    else closeSession(s);
  } catch {
    closeSession(s);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const s of [...sessions.values()]) if (now - s.createdAt > SESSION_TTL_MS) autoSettle(s);
}, 5 * 60 * 1000).unref();

// ======================================================================
// Small helpers
// ======================================================================

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const roundK = (v: number) => Math.max(0, Math.round(v / 1000) * 1000);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function insightOf(userId: number): number {
  return computePortfolioAndTier(userId).skills.insightLevel || 0;
}

function finishCommon(userId: number): void {
  incrementDailyTask(userId, 'task_minigame', 1);
}

/** 当前阶层的档位倍率（content/maps/haicheng.json 的 tiers[].stakeScale） */
function stakeScaleOf(userId: number): number {
  return Number((computePortfolioAndTier(userId).tierInfo as any).stakeScale || 1);
}
const scaled = (arr: readonly number[], k: number): number[] => arr.map((x) => Math.round(x * k));

function choice<T extends number>(value: unknown, allowed: readonly T[], label: string): T {
  const n = Number(value);
  if (!allowed.includes(n as T)) throw new Error(`${label}不在可选范围内`);
  return n as T;
}

function unlockHeroine(userId: number, heroineId: string, affection: number): boolean {
  const row = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
  if (!row) return false;
  execute('UPDATE player_heroines SET unlocked = 1, affection = affection + ? WHERE user_id = ? AND heroine_id = ?', [
    affection,
    userId,
    heroineId,
  ]);
  return !row.unlocked;
}

// ======================================================================
// 1. 赌石 · 擦石定价
// ======================================================================

export const JADE_COLS = 30;
export const JADE_ROWS = 20;
const JADE_N = JADE_COLS * JADE_ROWS;
const JADE_COST: Record<number, number> = { 1: 50000, 2: 300000, 3: 1500000 };
type Grade = 'rock' | 'waxy' | 'ice' | 'imperial';
const GRADE_FACTOR: Record<Grade, number> = { rock: 0, waxy: 1.0, ice: 2.4, imperial: 7.0 };
const GRADE_NAME: Record<Grade, string> = { rock: '垮料', waxy: '糯种', ice: '冰种', imperial: '帝王绿' };
const GRADE_TABLE: Record<number, Array<[Grade, number]>> = {
  1: [['imperial', 0.02], ['ice', 0.13], ['waxy', 0.45], ['rock', 0.4]],
  2: [['imperial', 0.06], ['ice', 0.19], ['waxy', 0.37], ['rock', 0.38]],
  3: [['imperial', 0.1], ['ice', 0.22], ['waxy', 0.33], ['rock', 0.35]],
};
// 鬼市传世奇珍 set pieces obtainable by collecting an imperial stone (in this order)
const RARE_SET = ['col_jade_emperor', 'col_blood_agate', 'col_blue_vase'];
const STAIN_FACTOR = 2.0; // a surface 色皮 looks icy to bystanders until its surroundings are exposed
// value scale per tier, tuned so a fully scratched stone returns ~1.0x its price on average
const JADE_SCALE: Record<number, number> = { 1: 2.6, 2: 1.95, 3: 1.56 };
const ROCK_SCRAP = 0.12;

const BUYERS = [
  { id: 'zhou', name: '周老', title: '老牌鉴玉师' },
  { id: 'qian', name: '钱总', title: '煤老板' },
  { id: 'akun', name: '阿坤', title: '缅甸玉商' },
] as const;
type BuyerId = (typeof BUYERS)[number]['id'];

interface Stone {
  tier: number;
  grade: Grade;
  cells: string; // r rock, j jade, s surface stain, c crack
  jadeTotal: number;
  crackInJade: number;
  jadeOriginal: number;
}

function generateStone(tier: number, insight: number): Stone {
  const table = GRADE_TABLE[tier];
  let roll = Math.random() - insight * 0.02;
  let grade: Grade = 'rock';
  for (const [g, p] of table) {
    if (roll < p) {
      grade = g;
      break;
    }
    roll -= p;
  }

  const cells: string[] = new Array(JADE_N).fill('r');
  const center = (i: number) => [((i % JADE_COLS) + 0.5) / JADE_COLS * 1.5, (Math.floor(i / JADE_COLS) + 0.5) / JADE_ROWS];
  const inCircle = (i: number, cx: number, cy: number, r: number) => {
    const [x, y] = center(i);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  let jadeOriginal = 0;
  if (grade !== 'rock') {
    const target = rand(0.25, 0.7);
    const blobs = Array.from({ length: randInt(1, 3) }, () => ({ x: rand(0.35, 1.15), y: rand(0.25, 0.75), w: rand(0.7, 1.2) }));
    for (let r = 0.08; r < 0.9; r += 0.015) {
      jadeOriginal = 0;
      for (let i = 0; i < JADE_N; i++) {
        const hit = blobs.some((b) => inCircle(i, b.x, b.y, r * b.w));
        cells[i] = hit ? 'j' : 'r';
        if (hit) jadeOriginal++;
      }
      if (jadeOriginal / JADE_N >= target) break;
    }
  }

  // surface stain (色皮): looks like colour, is worthless
  if (Math.random() < (grade === 'rock' ? 0.85 : 0.4)) {
    const sx = rand(0.15, 1.35);
    const sy = rand(0.15, 0.85);
    const sr = rand(0.08, 0.14);
    for (let i = 0; i < JADE_N; i++) if (cells[i] === 'r' && inCircle(i, sx, sy, sr)) cells[i] = 's';
  }

  // cracks
  let crackInJade = 0;
  const crackCount = grade === 'rock' ? randInt(1, 3) : randInt(0, 2);
  for (let k = 0; k < crackCount; k++) {
    const x1 = rand(0, 1.5);
    const y1 = 0;
    const x2 = rand(0, 1.5);
    const y2 = 1;
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let i = 0; i < JADE_N; i++) {
      const [x, y] = center(i);
      const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
      if (d < 0.022) {
        if (cells[i] === 'j') crackInJade++;
        cells[i] = 'c';
      }
    }
  }

  const jadeTotal = cells.filter((c) => c === 'j').length;
  return { tier, grade, cells: cells.join(''), jadeTotal, crackInJade, jadeOriginal };
}

function stoneTrueValue(stone: Stone, cost: number): number {
  if (stone.grade === 'rock' || stone.jadeTotal === 0) return roundK(cost * ROCK_SCRAP);
  const crackMult = 1 - Math.min(0.5, (stone.crackInJade / Math.max(1, stone.jadeOriginal)) * 3);
  return roundK(cost * GRADE_FACTOR[stone.grade] * (stone.jadeTotal / JADE_N) * JADE_SCALE[stone.tier] * crackMult);
}

function revealCounts(stone: Stone, mask: string) {
  const n = { r: 0, j: 0, s: 0, c: 0, total: 0 };
  for (let i = 0; i < JADE_N; i++) {
    if (mask[i] !== '1') continue;
    n.total++;
    n[stone.cells[i] as 'r' | 'j' | 's' | 'c']++;
  }
  return n;
}

/** What the market believes the stone is worth, given only what has been exposed. */
function jadeMarketEstimate(stone: Stone, cost: number, mask: string) {
  const n = revealCounts(stone, mask);
  const fully = n.total >= JADE_N * 0.97;
  if (fully) return { base: stoneTrueValue(stone, cost), n, green: n.j > 0 || n.s > 0, fully };
  if (n.total === 0) return { base: cost * 0.78, n, green: false, fully };

  const stainCred = n.s > 0 ? clamp(1 - n.r / (n.s * 2.5 + 4), 0, 1) : 0;
  const perceivedGreen = n.j + n.s * stainCred;
  const w = Math.min(1, n.total / 220);
  if (perceivedGreen <= 0) {
    return { base: cost * (0.78 * (1 - w) + ROCK_SCRAP * w), n, green: false, fully };
  }
  const ratio = perceivedGreen / n.total;
  const estRatio = ratio * w + 0.32 * (1 - w);
  const estCells = Math.min(JADE_N, perceivedGreen + (JADE_N - n.total) * estRatio);
  const gf = (GRADE_FACTOR[stone.grade] * n.j + STAIN_FACTOR * n.s * stainCred) / perceivedGreen;
  const crackMult = 1 - Math.min(0.55, (n.c / n.total) * 3.5);
  const base = cost * gf * (estCells / JADE_N) * JADE_SCALE[stone.tier] * crackMult;
  return { base, n, green: true, fully };
}

function noise(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

function jadeOffers(s: Session) {
  const { stone, cost, mask } = s.data as { stone: Stone; cost: number; mask: string };
  const est = jadeMarketEstimate(stone, cost, mask);
  const trust = Math.min(1, est.n.total / 300);
  const imperialSeen = stone.grade === 'imperial' && est.n.j > 0;
  const mult: Record<BuyerId, number> = {
    zhou: est.fully ? 0.97 : 0.88 + 0.06 * trust,
    qian: est.fully ? 0.95 : est.green ? 1.1 + (imperialSeen ? 0.22 : 0) : 0.8,
    akun: est.fully ? 1.0 : 0.95 + 0.08 * noise(est.n.total + stone.jadeTotal),
  };
  return BUYERS.map((b) => ({ ...b, offer: Math.max(roundK(cost * 0.05), roundK(est.base * mult[b.id])) }));
}

function bestBuyer(offers: Array<{ id: BuyerId; offer: number }>): BuyerId {
  return offers.reduce((a, b) => (b.offer > a.offer ? b : a)).id;
}

function jadeVerdict(s: Session): { label: string; tone: 'hot' | 'cold' | 'neutral' } {
  const { stone, mask } = s.data as { stone: Stone; mask: string };
  const n = revealCounts(stone, mask);
  if (n.total === 0) return { label: '原石未开', tone: 'neutral' };
  if (n.j > 0) return { label: `见${GRADE_NAME[stone.grade]}`, tone: 'hot' };
  if (n.s > 0 && n.r < n.s * 2) return { label: '疑似出色', tone: 'hot' };
  if (n.s > 0) return { label: '色皮，只浮在表面', tone: 'cold' };
  if (n.c > 2) return { label: '见裂，不妙', tone: 'cold' };
  return { label: '暂未见绿', tone: 'neutral' };
}

function mergeMask(s: Session, incoming: unknown): string {
  const m = String(incoming ?? '');
  if (m.length !== JADE_N || /[^01]/.test(m)) throw new Error('擦石数据异常，请重试');
  const prev: string = s.data.mask;
  let out = '';
  for (let i = 0; i < JADE_N; i++) out += prev[i] === '1' || m[i] === '1' ? '1' : '0';
  s.data.mask = out;
  return out;
}

function settleJade(s: Session, mask: string, buyerId: BuyerId) {
  s.data.mask = mask;
  const offers = jadeOffers(s);
  const buyer = offers.find((o) => o.id === buyerId) || offers[0];
  const { stone, cost } = s.data as { stone: Stone; cost: number };
  const n = revealCounts(stone, mask);
  closeSession(s);
  grant(s.userId, buyer.offer, 20);
  let unlockedHeroine: string | null = null;
  if (stone.grade === 'imperial' && n.j > 0 && unlockHeroine(s.userId, 'lu_zhiwei', 20)) unlockedHeroine = 'lu_zhiwei';
  finishCommon(s.userId);
  return {
    buyer: { id: buyer.id, name: buyer.name },
    payout: buyer.offer,
    profit: buyer.offer - cost,
    grade: stone.grade,
    gradeName: GRADE_NAME[stone.grade],
    trueValue: stoneTrueValue(stone, cost),
    unlockedHeroine,
  };
}

// ======================================================================
// 2. 股市 · 实时盯盘
// ======================================================================

const STOCK_TICKS = 40;
const STOCK_TICK_MS = 750;
const STOCK_LEVERAGE = 3;
const STOCK_STAKES = [100000, 300000, 1000000] as const;

export function getCurrentStockQuotes() {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000)); // shifts every 10 minutes
  const stocks = [
    { id: 'stk_tech', name: '天枢芯科', code: '688001', base: 128 },
    { id: 'stk_land', name: '海城锦绣地产', code: '600882', base: 42 },
    { id: 'stk_media', name: '星耀娱乐控股', code: '300619', base: 66 },
    { id: 'stk_bio', name: '云顶生物医药', code: '688309', base: 94 },
  ];
  return stocks.map((s, idx) => {
    const wave = Math.sin(bucket * 0.7 + idx * 1.9) * 0.14 + Math.cos(bucket * 0.35 + idx) * 0.08;
    const price = Number((s.base * (1 + wave)).toFixed(2));
    const changePct = Number((wave * 100).toFixed(2));
    const nextWave = Math.sin((bucket + 1) * 0.7 + idx * 1.9) * 0.14 + Math.cos((bucket + 1) * 0.35 + idx) * 0.08;
    const trend: 'up' | 'down' = nextWave >= wave ? 'up' : 'down';
    return { ...s, price, changePct, trend };
  });
}

function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function stockValue(d: any, tick: number): number {
  const p0 = d.path[0];
  const pt = d.path[tick];
  return clamp(d.stake * (1 + STOCK_LEVERAGE * d.dir * (pt / p0 - 1)), 0, d.stake * 4);
}

function liquidationTick(d: any): number {
  for (let t = 1; t < d.path.length; t++) if (stockValue(d, t) <= d.stake * 0.2) return t;
  return -1;
}

function settleStock(s: Session, tick: number) {
  const d = s.data;
  const last = d.path.length - 1;
  // never settle at a price from the future: clamp to the elapsed tick
  const elapsedTick = Math.floor((Date.now() - s.createdAt) / STOCK_TICK_MS);
  const t0 = clamp(Math.floor(Number(tick) || 0), 0, last);
  let t = Math.min(t0, elapsedTick + 1);
  const liq = liquidationTick(d);
  const liquidated = liq >= 0 && liq <= t;
  if (liquidated) t = liq;
  const payout = Math.round(stockValue(d, t));
  closeSession(s);
  grant(s.userId, payout, 28);
  finishCommon(s.userId);
  return { tick: t, price: d.path[t], payout, profit: payout - d.stake, liquidated };
}

// ======================================================================
// 3. 江畔竞速 · 时机操作
// ======================================================================

const RACE_STAKES = [100000, 500000, 2000000] as const;
const RACE_SEGMENTS = [
  { name: '起步', weight: 1 },
  { name: '外滩大弯', weight: 1.3 },
  { name: '隧道连弯', weight: 1.3 },
  { name: '氮气冲刺', weight: 1.6 },
];
const RACE_MIN_MS = 4000;

function raceScore(accs: number[], power: number): number {
  const sumW = RACE_SEGMENTS.reduce((a, b) => a + b.weight, 0);
  const perf = RACE_SEGMENTS.reduce((a, seg, i) => a + seg.weight * clamp(accs[i] ?? 0, 0, 1), 0) / sumW;
  return perf * 0.75 + (clamp(power, 0, 120) / 100) * 0.25;
}

function settleRace(s: Session, hits: unknown) {
  const d = s.data;
  const tooFast = Date.now() - s.createdAt < RACE_MIN_MS;
  const accs = RACE_SEGMENTS.map((_, i) => (tooFast || !Array.isArray(hits) ? 0 : clamp(Number(hits[i]) || 0, 0, 1)));
  const playerScore = raceScore(accs, d.power);
  const oppScore = raceScore(d.oppSeg, d.oppPower);
  const win = playerScore > oppScore;
  const perfect = win && accs.every((a) => a >= 0.9);
  const payout = win ? Math.round(d.stake * (perfect ? 2.8 : 2.2)) : 0;
  closeSession(s);
  grant(s.userId, payout, win ? 40 : 10);
  finishCommon(s.userId);
  return { win, perfect, playerScore, oppScore, accs, payout, profit: payout - d.stake };
}

// ======================================================================
// 4. 星耀打榜 · 直播 PK 拔河
// ======================================================================

const LIVE_BUDGETS = [300000, 1500000, 5000000] as const;
const LIVE_DURATION = 30;
const LIVE_GIFTS = {
  heart: { units: 1, power: 1, cooldown: 0.1 },
  carnival: { units: 10, power: 15, cooldown: 2.5 },
  finisher: { units: 30, power: 50, cooldown: 999 },
} as const;
type GiftType = keyof typeof LIVE_GIFTS;
const LIVE_BAR_K = 0.4;
const LIVE_DOUBLE_LEN = 3; // 双倍时刻: carnival counts x2
const LIVE_COUNTER = { before: 1.2, after: 0.6, mult: 1.6 }; // 反偷塔: finisher around the steal

function livePower(d: any, a: { t: number; type: GiftType }): number {
  let p: number = LIVE_GIFTS[a.type].power;
  if (a.type === 'carnival' && a.t >= d.doubleAt && a.t <= d.doubleAt + LIVE_DOUBLE_LEN) p *= 2;
  if (a.type === 'finisher' && a.t >= d.spikeAt - LIVE_COUNTER.before && a.t <= d.spikeAt + LIVE_COUNTER.after) p *= LIVE_COUNTER.mult;
  return p;
}

function simulateLive(d: any, actions: Array<{ t: number; type: GiftType }>) {
  const events: Array<{ t: number; delta: number }> = [];
  for (const a of actions) events.push({ t: a.t, delta: livePower(d, a) * LIVE_BAR_K });
  for (const o of d.opp) events.push({ t: o.t, delta: -o.power * LIVE_BAR_K });
  events.sort((a, b) => a.t - b.t);
  let bar = 50;
  for (const e of events) bar = clamp(bar + e.delta, 0, 100);
  return bar;
}

function sanitizeLiveActions(raw: unknown): Array<{ t: number; type: GiftType }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ t: number; type: GiftType }> = [];
  const lastAt: Partial<Record<GiftType, number>> = {};
  let units = 0;
  const sorted = raw
    .map((a: any) => ({ t: Number(a?.t), type: String(a?.type) as GiftType }))
    .filter((a) => Number.isFinite(a.t) && a.t >= 0 && a.t <= LIVE_DURATION && a.type in LIVE_GIFTS)
    .sort((a, b) => a.t - b.t);
  let finisherUsed = false;
  for (const a of sorted) {
    const g = LIVE_GIFTS[a.type];
    if (a.type === 'finisher' && finisherUsed) continue;
    const prev = lastAt[a.type];
    if (prev !== undefined && a.t - prev < g.cooldown - 0.05) continue;
    if (units + g.units > 100) continue;
    units += g.units;
    lastAt[a.type] = a.t;
    if (a.type === 'finisher') finisherUsed = true;
    out.push(a);
  }
  return out;
}

function settleLive(s: Session, rawActions: unknown, auto = false) {
  const d = s.data;
  const actions = auto ? [] : sanitizeLiveActions(rawActions);
  const units = actions.reduce((a, x) => a + LIVE_GIFTS[x.type].units, 0);
  const spent = Math.round((d.budget * units) / 100);
  const refund = d.budget - spent;
  const finalBar = simulateLive(d, actions);
  const win = finalBar > 50;
  closeSession(s);
  if (refund > 0) grant(s.userId, refund);
  const crit = spent > 0 ? rollCritCashback(s.userId, spent) : null;
  const affectionGain = win ? 18 : 6;
  const newlyUnlocked = unlockHeroine(s.userId, 'shen_liuli', affectionGain);
  grant(s.userId, 0, win ? 45 : 10);
  if (win) {
    const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [s.userId]);
    postMoment(
      s.userId,
      user?.nickname || '陆沉',
      '星耀直播间今晚的公屏，很热闹。',
      '海城 · 星耀不夜城',
      [{ author: '沈琉璃', text: '最后十秒那一下……你是故意卡着点的吧？' }],
      ['沈琉璃'],
    );
  }
  finishCommon(s.userId);
  return { win, finalBar, spent, refund, affectionGain, newlyUnlocked, crit };
}

// ======================================================================
// 5. 天使投资 · 路演面试
// ======================================================================

type PitchType = 'gem' | 'solid' | 'hype';
const ANGEL_AMOUNTS = [100000, 500000, 2000000] as const;
const PITCH_POOL = [
  {
    project: 'AI 声乐伴奏',
    pitch: '让每个练琴的学生，都有一支随叫随到的伴奏乐队。',
    claims: ['上线三个月，注册用户 12 万', '已和 5 家琴行签约分成', '付费转化率 9%'],
    facts: {
      gem: '后台数据显示七日留存 61%，琴行老板主动追加了预付款。',
      solid: '用户数属实，但大部分是免费用户，增长平稳不算惊艳。',
      hype: '12 万用户里有 9 万来自一次抽奖活动，活动结束后日活掉了九成。',
    },
  },
  {
    project: '校园无人咖啡站',
    pitch: '一台机器、一块屏，把精品咖啡开进每一栋教学楼。',
    claims: ['单台机器日均 180 杯', '已落地 14 所高校', '毛利率 58%'],
    facts: {
      gem: '实地看了三台机器，排队的学生比描述的还多，原料供应链是自己的。',
      solid: '杯量属实，但寒暑假两个月几乎停摆，全年算下来是稳健的小生意。',
      hype: '所谓 14 所高校，实际在运营的只有 2 所，其余是意向书。',
    },
  },
  {
    project: '国风数字艺术社区',
    pitch: '让年轻画师把国风作品卖给全世界的收藏者。',
    claims: ['签约画师 3000 名', '月交易额 800 万', '海外用户占 40%'],
    facts: {
      gem: '头部画师的作品被海外拍卖行收录，平台抽成模式已经跑通。',
      solid: '交易额属实，但集中在少数几名画师，平台议价能力一般。',
      hype: '月交易额里有一半是创始人自己的关联账户在对倒刷量。',
    },
  },
  {
    project: '城市夜跑智能鞋垫',
    pitch: '一双鞋垫，读懂你的每一步，纠正跑姿、预防伤病。',
    claims: ['众筹 48 小时破 500 万', '专利 11 项', '与两家运动品牌洽谈中'],
    facts: {
      gem: '品牌方的采购总监私下说，合同只差最后一轮盖章。',
      solid: '产品不错，但硬件良率还在爬坡，量产要再等半年。',
      hype: '11 项专利里 9 项是外观设计，核心传感方案是买来的公版。',
    },
  },
  {
    project: '社区老人陪伴机器人',
    pitch: '让独居老人每天都有人说说话，子女随时看得到。',
    claims: ['试点社区满意度 96%', '政府采购意向', '单台成本已降到 1800 元'],
    facts: {
      gem: '街道办的采购批文已经下来了，首批订单两千台。',
      solid: '口碑确实好，但政府回款周期长，现金流会比较紧。',
      hype: '满意度调查是公司员工上门代填的，老人们大多不会用。',
    },
  },
  {
    project: '海城本地生鲜团购',
    pitch: '凌晨四点的码头海鲜，早上七点送到你家楼下。',
    claims: ['日订单 6000 单', '团长 900 名', '复购率 70%'],
    facts: {
      gem: '跟着跑了一趟凌晨码头，船老大只认他，货源是独家的。',
      solid: '订单量属实，但同行补贴大战打得凶，利润很薄。',
      hype: '日订单 6000 单是大促当天的数字，平时只有八百单。',
    },
  },
];
const FOUNDER_NAMES = ['周屿', '林可', '许知远', '唐果', '韩松', '叶澜', '顾北', '沈言', '程一'];
const ANGEL_MULT: Record<PitchType, [number, number]> = { gem: [3.5, 6.5], solid: [1.5, 2.3], hype: [0.2, 0.5] };

function generatePitches() {
  const projects = [...PITCH_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  const names = [...FOUNDER_NAMES].sort(() => Math.random() - 0.5);
  const types: PitchType[] = [Math.random() < 0.45 ? 'gem' : 'solid', 'solid', 'hype'].sort(() => Math.random() - 0.5) as PitchType[];
  return projects.map((p, i) => ({ founder: names[i], ...p, type: types[i] }));
}

function publicPitch(p: any, i: number, asked: Record<number, boolean>) {
  return {
    index: i,
    founder: p.founder,
    project: p.project,
    pitch: p.pitch,
    claims: p.claims,
    fact: asked[i] ? p.facts[p.type] : null,
  };
}

// ======================================================================
// 6. 星耀号公海局 · 21 点
// ======================================================================

const CRUISE_EVENT_ID = 'event_cruise_01';
const CRUISE_BUYIN = 300000;
const CRUISE_DAILY_PLAYS = 5;
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
type Card = { r: string; s: string };

function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 'A') {
      aces++;
      total += 11;
    } else total += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

function cruisePublic(s: Session, done = false) {
  const d = s.data;
  const showHole = done || d.vision;
  return {
    id: s.id,
    bet: d.bet,
    player: d.player,
    dealer: showHole ? d.dealer : [d.dealer[0], { r: '?', s: '?' }],
    playerTotal: handValue(d.player).total,
    dealerTotal: showHole ? handValue(d.dealer).total : null,
    canDouble: d.player.length === 2 && !d.doubled,
    vision: d.vision,
    done,
  };
}

function cruiseRow(userId: number) {
  return queryOne<any>('SELECT * FROM player_events WHERE user_id = ? AND event_id = ?', [userId, CRUISE_EVENT_ID]);
}

function addCruiseTokens(userId: number, tokens: number) {
  execute('UPDATE player_events SET tokens = tokens + ? WHERE user_id = ? AND event_id = ?', [tokens, userId, CRUISE_EVENT_ID]);
}

function cruiseFinish(s: Session) {
  const d = s.data;
  const p = handValue(d.player).total;
  const playerBJ = isBlackjack(d.player) && !d.doubled;
  let dealer = handValue(d.dealer).total;
  if (p <= 21 && !playerBJ) {
    while (dealer < 17) {
      d.dealer.push(d.deck.pop());
      dealer = handValue(d.dealer).total;
    }
  }
  const dealerBJ = isBlackjack(d.dealer);
  let outcome: 'blackjack' | 'win' | 'push' | 'lose';
  if (p > 21) outcome = 'lose';
  else if (playerBJ && !dealerBJ) outcome = 'blackjack';
  else if (dealerBJ && !playerBJ) outcome = 'lose';
  else if (dealer > 21 || p > dealer) outcome = 'win';
  else if (p === dealer) outcome = 'push';
  else outcome = 'lose';

  const payout =
    outcome === 'blackjack' ? Math.round(d.bet * 2.5) : outcome === 'win' ? d.bet * 2 : outcome === 'push' ? d.bet : 0;
  const tokens = outcome === 'blackjack' ? 90 : outcome === 'win' ? randInt(60, 80) : outcome === 'push' ? 25 : 15;
  const view = cruisePublic(s, true);
  closeSession(s);
  grant(s.userId, payout, outcome === 'lose' ? 5 : 20);
  addCruiseTokens(s.userId, tokens);
  finishCommon(s.userId);
  return { ...view, result: { outcome, payout, profit: payout - d.bet, tokens } };
}

function cruiseStand(s: Session) {
  return cruiseFinish(s);
}

// ======================================================================
// Routes
// ======================================================================

export function registerMinigameRoutes(router: Router, auth: Auth): void {
  const handle =
    (fn: (userId: number, body: any) => any, opts: { withState?: boolean } = {}) =>
    (req: AuthedRequest, res: Response) => {
      try {
        const out = fn(req.userId!, req.body || {});
        res.json(opts.withState === false ? out : { ...out, state: buildFullGameState(req.userId!) });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    };

  // ---------- 赌石 ----------
  router.post(
    '/mg/jade/start',
    auth,
    handle((userId, body) => {
      const tier = choice(body.tier, [1, 2, 3] as const, '原石档位');
      const cost = Math.round(JADE_COST[tier] * stakeScaleOf(userId));
      assertEnergySufficient(userId, 6);
      assertCashSufficient(userId, cost);
      spendEnergyOrThrow(userId, 6);
      spendCashOrThrow(userId, cost);
      const insight = insightOf(userId);
      const stone = generateStone(tier, insight);
      const s = openSession(userId, 'jade', { tier, cost, stone, mask: '0'.repeat(JADE_N), vision: false });
      ledgerOpen(userId, 'jade', cost);
      return {
        session: {
          id: s.id,
          tier,
          cost,
          cols: JADE_COLS,
          rows: JADE_ROWS,
          cells: stone.cells,
          grade: stone.grade,
          visionCost: insight >= 3 ? 0 : 15,
        },
        offers: jadeOffers(s),
        verdict: jadeVerdict(s),
        revealed: 0,
      };
    }),
  );

  router.post(
    '/mg/jade/appraise',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'jade');
      const mask = mergeMask(s, body.mask);
      return {
        offers: jadeOffers(s),
        verdict: jadeVerdict(s),
        revealed: Math.round((mask.split('').filter((c) => c === '1').length / JADE_N) * 100),
      };
    }, { withState: false }),
  );

  router.post(
    '/mg/jade/vision',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'jade');
      if (s.data.vision) throw new Error('这块石头已经用过天枢透视了');
      const cost = insightOf(userId) >= 3 ? 0 : 15;
      spendSysPointsOrThrow(userId, cost);
      s.data.vision = true;
      // 6x4 heat map of where the real jade sits (stains excluded)
      const heat: number[] = [];
      const bw = JADE_COLS / 6;
      const bh = JADE_ROWS / 4;
      for (let by = 0; by < 4; by++)
        for (let bx = 0; bx < 6; bx++) {
          let j = 0;
          for (let y = by * bh; y < (by + 1) * bh; y++)
            for (let x = bx * bw; x < (bx + 1) * bw; x++) if (s.data.stone.cells[y * JADE_COLS + x] === 'j') j++;
          const f = j / (bw * bh);
          heat.push(f > 0.6 ? 3 : f > 0.3 ? 2 : f > 0.05 ? 1 : 0);
        }
      return { heat, visionCost: cost };
    }),
  );

  router.post(
    '/mg/jade/sell',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'jade');
      const mask = mergeMask(s, body.mask);
      const buyer = BUYERS.find((b) => b.id === body.buyer)?.id;
      if (!buyer) throw new Error('请选择买家');
      const expect = Number(body.expect);
      const quote = jadeOffers(s).find((o) => o.id === buyer)!;
      if (Number.isFinite(expect) && expect > 0 && Math.abs(quote.offer - expect) > Math.max(1000, expect * 0.01)) {
        return { requote: true, offers: jadeOffers(s), verdict: jadeVerdict(s) };
      }
      return { result: settleJade(s, mask, buyer) };
    }),
  );

  router.post(
    '/mg/jade/collect',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'jade');
      const mask = mergeMask(s, body.mask);
      const { stone } = s.data as { stone: Stone };
      const n = revealCounts(stone, mask);
      if (stone.grade !== 'imperial' || n.j < stone.jadeTotal * 0.5) {
        throw new Error('只有擦出过半的帝王绿才能收藏入库');
      }
      // the imperial stone goes to the showcase; if it is already there, 周老 trades it for another
      // piece of the 鬼市传世奇珍 set the player is missing
      const missing = RARE_SET.find(
        (id) => !queryOne('SELECT asset_id FROM player_assets WHERE user_id = ? AND asset_id = ?', [userId, id]),
      );
      if (!missing) throw new Error('鬼市三件珍品已经集齐了，这块不如卖个好价钱');
      execute('INSERT INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)', [userId, missing, Date.now()]);
      closeSession(s);
      grant(userId, 0, 60);
      const unlockedHeroine = unlockHeroine(userId, 'lu_zhiwei', 20) ? 'lu_zhiwei' : null;
      finishCommon(userId);
      const asset = getContent().assetsCatalog.assets.find((a: any) => a.id === missing);
      return {
        result: { collected: true, traded: missing !== 'col_jade_emperor', asset: { id: asset?.id, name: asset?.name, image: asset?.image }, unlockedHeroine },
      };
    }),
  );

  // ---------- 股市 ----------
  router.post(
    '/mg/stock/open',
    auth,
    handle((userId, body) => {
      const stake = choice(body.amount, scaled(STOCK_STAKES, stakeScaleOf(userId)), '投入金额');
      const dir = body.direction === 'short' ? -1 : body.direction === 'long' ? 1 : 0;
      if (!dir) throw new Error('请选择做多或做空');
      const quote = getCurrentStockQuotes().find((q) => q.id === body.stockId);
      if (!quote) throw new Error('股票不存在');
      assertEnergySufficient(userId, 6);
      assertCashSufficient(userId, stake);
      spendEnergyOrThrow(userId, 6);
      spendCashOrThrow(userId, stake);
      const insight = insightOf(userId);
      const tipRight = Math.random() < Math.min(0.95, 0.72 + insight * 0.05);
      const up = (quote.trend === 'up') === tipRight;
      const mu = (up ? 1 : -1) * 0.0032;
      const shockAt = randInt(12, 30);
      const shock = (Math.random() < 0.65 === up ? 1 : -1) * rand(0.03, 0.05);
      const path = [quote.price];
      for (let t = 1; t <= STOCK_TICKS; t++) {
        let r = mu + 0.011 * gaussian();
        if (t === shockAt) r += shock;
        path.push(Number(Math.max(0.5, path[t - 1] * (1 + r)).toFixed(2)));
      }
      const s = openSession(userId, 'stock', { stake, dir, path, stockId: quote.id, name: quote.name });
      ledgerOpen(userId, 'stock', stake);
      return {
        session: {
          id: s.id,
          name: quote.name,
          code: quote.code,
          stake,
          direction: dir === 1 ? 'long' : 'short',
          leverage: STOCK_LEVERAGE,
          tickMs: STOCK_TICK_MS,
          path,
          newsAt: shockAt,
        },
      };
    }),
  );

  router.post(
    '/mg/stock/close',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'stock');
      return { result: settleStock(s, body.tick) };
    }),
  );

  // ---------- 竞速 ----------
  router.post(
    '/mg/race/start',
    auth,
    handle((userId, body) => {
      const raceStakes = scaled(RACE_STAKES, stakeScaleOf(userId));
      const stake = choice(body.stake, raceStakes, '彩头');
      assertEnergySufficient(userId, 7);
      assertCashSufficient(userId, stake);
      spendEnergyOrThrow(userId, 7);
      spendCashOrThrow(userId, stake);
      const content = getContent();
      const st = queryOne<any>('SELECT equipped_car_id FROM player_state WHERE user_id = ?', [userId]);
      const car = content.assetsCatalog.assets.find((a: any) => a.id === st?.equipped_car_id);
      const power = car?.racePower || 10;
      const level = raceStakes.indexOf(stake);
      const oppPower = clamp(Math.round(power + rand(-15, 20) + level * 8), 20, 110);
      const oppMean = clamp(rand(0.5, 0.8) + level * 0.04, 0, 0.95);
      const oppSeg = RACE_SEGMENTS.map(() => Number(clamp(oppMean + rand(-0.15, 0.15), 0.2, 1).toFixed(3)));
      const segments = RACE_SEGMENTS.map((seg, i) => ({
        name: seg.name,
        zone: Number(clamp(0.1 + power / 650 - i * 0.01, 0.08, 0.3).toFixed(3)),
        speed: Number((0.7 + i * 0.18 + level * 0.15).toFixed(2)),
      }));
      const s = openSession(userId, 'race', { stake, power, oppPower, oppSeg });
      ledgerOpen(userId, 'race', stake);
      return {
        session: {
          id: s.id,
          stake,
          car: { name: car?.name || '座驾', image: car?.image || '', power },
          opponent: { name: '赵天宇', car: '法拉利 SF90', power: oppPower },
          segments,
          oppSeg,
        },
      };
    }),
  );

  router.post(
    '/mg/race/finish',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'race');
      return { result: settleRace(s, body.hits) };
    }),
  );

  // ---------- 直播 PK ----------
  router.post(
    '/mg/live/start',
    auth,
    handle((userId, body) => {
      const budget = choice(body.budget, scaled(LIVE_BUDGETS, stakeScaleOf(userId)), '打赏预算');
      assertEnergySufficient(userId, 8);
      assertCashSufficient(userId, budget);
      spendEnergyOrThrow(userId, 8);
      spendCashOrThrow(userId, budget);
      const opp: Array<{ t: number; power: number }> = [];
      for (let t = 1.2; t < 25; t += rand(1.6, 2.4)) opp.push({ t: Number(t.toFixed(2)), power: randInt(6, 9) });
      const spikeAt = Number(rand(25.5, 27.5).toFixed(2));
      opp.push({ t: spikeAt, power: randInt(60, 72) });
      const doubleAt = Number(rand(14, 20).toFixed(2));
      const s = openSession(userId, 'live', { budget, opp, spikeAt, doubleAt });
      ledgerOpen(userId, 'live', budget);
      return {
        session: {
          id: s.id,
          budget,
          duration: LIVE_DURATION,
          gifts: LIVE_GIFTS,
          barK: LIVE_BAR_K,
          opp,
          warnAt: Number((spikeAt - 3).toFixed(2)),
          doubleAt,
          doubleLen: LIVE_DOUBLE_LEN,
          counter: { from: Number((spikeAt - LIVE_COUNTER.before).toFixed(2)), to: Number((spikeAt + LIVE_COUNTER.after).toFixed(2)), mult: LIVE_COUNTER.mult },
        },
      };
    }),
  );

  router.post(
    '/mg/live/finish',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'live');
      if (Date.now() - s.createdAt < (LIVE_DURATION - 5) * 1000) throw new Error('PK 还没结束');
      return { result: settleLive(s, body.actions) };
    }),
  );

  // ---------- 天使投资 ----------
  router.post(
    '/mg/angel/start',
    auth,
    handle((userId) => {
      spendEnergyOrThrow(userId, 6);
      const pitches = generatePitches();
      const s = openSession(userId, 'angel', { pitches, asked: {}, questions: 2, hint: null });
      return {
        session: {
          id: s.id,
          pitches: pitches.map((p, i) => publicPitch(p, i, {})),
          questions: 2,
          amounts: scaled(ANGEL_AMOUNTS, stakeScaleOf(userId)),
          hintCost: 15,
        },
      };
    }),
  );

  router.post(
    '/mg/angel/ask',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'angel');
      const i = choice(body.index, [0, 1, 2] as const, '项目');
      if (s.data.asked[i]) throw new Error('已经追问过这位创始人了');
      if (s.data.questions <= 0) throw new Error('追问次数已用完');
      s.data.asked[i] = true;
      s.data.questions -= 1;
      return { pitch: publicPitch(s.data.pitches[i], i, s.data.asked), questions: s.data.questions };
    }),
  );

  router.post(
    '/mg/angel/hint',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'angel');
      if (s.data.hint) throw new Error('天枢已经给过判断了');
      spendSysPointsOrThrow(userId, 15);
      const pitches: any[] = s.data.pitches;
      const gem = pitches.findIndex((p) => p.type === 'gem');
      const hype = pitches.findIndex((p) => p.type === 'hype');
      const hint =
        gem >= 0 && Math.random() < 0.5
          ? `天枢判定：${pitches[gem].founder} 的项目潜力远超估值。`
          : `天枢判定：${pitches[hype].founder} 的数据存在严重水分。`;
      s.data.hint = hint;
      return { hint };
    }),
  );

  router.post(
    '/mg/angel/invest',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'angel');
      const i = choice(body.index, [0, 1, 2] as const, '项目');
      const amount = choice(body.amount, scaled(ANGEL_AMOUNTS, stakeScaleOf(userId)), '投资金额');
      spendCashOrThrow(userId, amount);
      const p = s.data.pitches[i];
      const [a, b] = ANGEL_MULT[p.type as PitchType];
      const mult = Number(rand(a, b).toFixed(2));
      const payout = Math.round(amount * mult);
      closeSession(s);
      grant(userId, payout, 22);
      finishCommon(userId);
      const news =
        p.type === 'gem'
          ? `三个月后：「${p.project}」完成新一轮融资，估值翻了数倍，${p.founder}在发布会上第一个感谢了你。`
          : p.type === 'solid'
            ? `三个月后：「${p.project}」稳步盈利，按约定给你分了红。`
            : `三个月后：「${p.project}」数据造假被曝光，项目停摆，只追回了一点残值。`;
      return {
        result: {
          type: p.type,
          founder: p.founder,
          project: p.project,
          truth: p.facts[p.type],
          mult,
          amount,
          payout,
          profit: payout - amount,
          news,
          all: s.data.pitches.map((x: any) => ({ founder: x.founder, type: x.type })),
        },
      };
    }),
  );

  // ---------- 公海 21 点 ----------
  router.post(
    '/mg/cruise/start',
    auth,
    handle((userId) => {
      const ev = getContent().events.find((e: any) => e.id === CRUISE_EVENT_ID);
      const toggle = getGmSetting('event_cruise_01_active');
      const active = toggle !== null ? toggle === 'true' : ev?.active;
      if (!ev || !active) throw new Error('星耀号暂未开放');
      const today = todayKey();
      const row = cruiseRow(userId);
      const playsToday = row && row.daily_date === today ? row.plays_today : 0;
      if (playsToday >= CRUISE_DAILY_PLAYS) throw new Error(`今日赌局次数已用完（${CRUISE_DAILY_PLAYS}/${CRUISE_DAILY_PLAYS}），明天再来`);
      const buyIn = Math.round(CRUISE_BUYIN * stakeScaleOf(userId));
      assertEnergySufficient(userId, 8);
      assertCashSufficient(userId, buyIn);
      spendEnergyOrThrow(userId, 8);
      spendCashOrThrow(userId, buyIn);
      if (!row) {
        execute(
          'INSERT INTO player_events (user_id, event_id, tokens, plays_today, daily_date, redeemed_json) VALUES (?, ?, 0, 1, ?, ?)',
          [userId, CRUISE_EVENT_ID, today, '[]'],
        );
      } else {
        execute('UPDATE player_events SET plays_today = ?, daily_date = ? WHERE user_id = ? AND event_id = ?', [
          playsToday + 1,
          today,
          userId,
          CRUISE_EVENT_ID,
        ]);
      }
      const deck = newDeck();
      const player = [deck.pop()!, deck.pop()!];
      const dealer = [deck.pop()!, deck.pop()!];
      const s = openSession(userId, 'cruise', { deck, player, dealer, bet: buyIn, doubled: false, vision: false });
      ledgerOpen(userId, 'cruise', buyIn);
      if (isBlackjack(player) || isBlackjack(dealer)) return { hand: cruiseFinish(s) };
      return { hand: cruisePublic(s), visionCost: 20 };
    }),
  );

  router.post(
    '/mg/cruise/action',
    auth,
    handle((userId, body) => {
      const s = getSession(userId, body.id, 'cruise');
      const d = s.data;
      const action = String(body.action);
      if (action === 'hit') {
        d.player.push(d.deck.pop());
        if (handValue(d.player).total >= 21) return { hand: cruiseFinish(s) };
        return { hand: cruisePublic(s) };
      }
      if (action === 'double') {
        if (d.player.length !== 2 || d.doubled) throw new Error('只有首两张牌时可以加倍');
        spendCashOrThrow(userId, d.bet);
        ledgerAdd(userId, 'cruise', d.bet);
        d.bet *= 2;
        d.doubled = true;
        d.player.push(d.deck.pop());
        return { hand: cruiseFinish(s) };
      }
      if (action === 'stand') return { hand: cruiseFinish(s) };
      if (action === 'vision') {
        if (d.vision) throw new Error('这一手已经透视过了');
        spendSysPointsOrThrow(userId, 20);
        d.vision = true;
        return { hand: cruisePublic(s) };
      }
      throw new Error('未知操作');
    }),
  );
}

export const _test = { generateStone, stoneTrueValue, jadeMarketEstimate, handValue, simulateLive, sanitizeLiveActions, raceScore };
