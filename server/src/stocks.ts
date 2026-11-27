/**
 * 海城交易所 · 实时行情引擎 & 天枢内参调度
 *
 * - 6 只海城板块个股在服务端每 2 秒真实跳动，维护 24 点实时走势与短期动量；
 * - 剧情进度（赵氏地产控股 / 盛世资本集团）持续影响基本面偏置与新闻抬头，但不再锁死内参；
 * - 每位玩家拥有动态轮换的「天枢内参」：每 45 秒自然换股换风口，且每次交易平仓后立刻刷新；
 * - 支持主动消耗积分「定向研判」任意自选股，以及开仓后「盘中异动预警」提前标出突发新闻点位。
 */
import { getStoryStockContext } from './empire.js';

export interface StockMeta {
  id: string;
  name: string;
  code: string;
  sector: string;
  base: number;
  vol: number; // relative volatility multiplier
  upNews: string[];
  downNews: string[];
  upReasons: string[];
  downReasons: string[];
}

export const STOCK_CATALOG: readonly StockMeta[] = [
  {
    id: 'stk_tech',
    name: '天枢芯科',
    code: '688001',
    sector: '算力芯片',
    base: 128,
    vol: 1.15,
    upNews: [
      '突发：天枢芯科自研算力模组通过大厂验货，北向资金大单扫货！',
      '突发：海外云厂商追加全年订单，天枢芯科盘面直线拉升！',
    ],
    downNews: [
      '突发：半导体板块获利盘集中兑现，天枢芯科遭遇大单砸盘！',
      '突发：上游晶圆代工涨价传闻发酵，天枢芯科短线承压跳水！',
    ],
    upReasons: ['北向席位连续三个周期净流入，筹码高度锁仓', '算力模组良率突破传闻正在陆家湾机构圈扩散'],
    downReasons: ['量化资金高位派发迹象明显，上影线抛压沉重', '科技板块情绪过热，短线筹码松动回吐风险升温'],
  },
  {
    id: 'stk_land',
    name: '海城锦绣地产',
    code: '600882',
    sector: '核心地产',
    base: 42,
    vol: 0.95,
    upNews: [
      '突发：海城豪宅限购松绑预期升温，锦绣地产领涨地产链！',
      '突发：锦绣滨江地块首开破百亿，主力资金迅速回补！',
    ],
    downNews: [
      '突发：周度楼市网签数据低于预期，锦绣地产抛压骤增！',
      '突发：海外美元债再融资成本攀升，地产板块集体回调！',
    ],
    upReasons: ['滨江核心项目回款超预期，机构席位逢低承接', '地产链政策吹风临近，盘口出现连续护盘买单'],
    downReasons: ['成交量持续萎缩，反弹缺乏增量资金配合', '板块融资利率走高，空头借机压盘试探支撑'],
  },
  {
    id: 'stk_media',
    name: '星耀娱乐控股',
    code: '300619',
    sector: '文娱传媒',
    base: 66,
    vol: 1.2,
    upNews: [
      '突发：星耀头部直播盛典成交额破纪录，游资强势点火抢筹！',
      '突发：王牌综艺独家冠名落地，星耀娱乐放量突破前高！',
    ],
    downNews: [
      '突发：竞对高价挖角头部达人传闻发酵，星耀娱乐急跌！',
      '突发：传媒板块高位分歧加剧，游资筹码加速撤离！',
    ],
    upReasons: ['陆家湾一线游资席位悄然建仓，盘口拉升意愿极强', '高奢品牌季末投放激增，业绩预期正快速上修'],
    downReasons: ['连涨后获利浮筹偏重，盘面频繁出现大额压单', '热点切换至硬科技，文娱资金存在短期抽血压力'],
  },
  {
    id: 'stk_bio',
    name: '云顶生物医药',
    code: '688309',
    sector: '创新医药',
    base: 94,
    vol: 1.1,
    upNews: [
      '突发：云顶生物三期临床核心指标超预期，机构席位大举买入！',
      '突发：海外药企重磅授权协议落地，云顶生物盘中急拉！',
    ],
    downNews: [
      '突发：医药集采降价传闻突袭盘面，云顶生物放量闪崩！',
      '突发：新药审批节点延后消息流出，资金快速避险离场！',
    ],
    upReasons: ['临床数据揭盲在即，公募医药基金暗中加仓抢跑', '创新药出海估值重塑，低位放量形态已然成形'],
    downReasons: ['盘口大单暗中减持，短期缺乏强催化接力', '防御板块情绪降温，均线压制下回踩概率放大'],
  },
  {
    id: 'stk_zhao',
    name: '赵氏地产控股',
    code: '600998',
    sector: '赵氏集团',
    base: 58,
    vol: 1.25,
    upNews: [
      '突发：赵氏地产抛售非核心资产回血，空头回补引发急弹！',
      '突发：传赵氏正洽谈过桥展期，短线投机资金入场博弈！',
    ],
    downNews: [
      '突发：赵氏股权质押逼近预警线，陆家湾机构连续砸盘！',
      '突发：城西项目供应商集体催款消息外泄，赵氏地产放量跳水！',
    ],
    upReasons: ['超跌后空头回补需求集中释放，短线存在技术性反抽', '传赵氏动用关联账户护盘，短期托单密集'],
    downReasons: ['股权质押暗雷与供应链欠款叠加，资金持续净流出', '离岸空头借机增仓压盘，盘面承接力度极为脆弱'],
  },
  {
    id: 'stk_shengshi',
    name: '盛世资本集团',
    code: '601888',
    sector: '资本旗舰',
    base: 112,
    vol: 1.05,
    upNews: [
      '突发：盛世资本百亿并购基金正式落地，大资金强势扫货！',
      '突发：苏清婉团队新季度回报领跑全城，外资席位连续加仓！',
    ],
    downNews: [
      '突发：盛世资本短期涨幅过大，量化基金程序化止盈回踩！',
      '突发：外围金融市场突发震荡，盛世资本盘中短暂洗盘！',
    ],
    upReasons: ['盛世基本面持续修复，机构长线配置买盘源源不断', '并购扩张预期兑现前夕，主力资金正温和推升重心'],
    downReasons: ['连续拉升后乖离率偏高，获利盘短线兑现意愿抬头', '大盘权重短暂休整，上方整数关口抛压初现'],
  },
];

const HISTORY_LEN = 24;
const MARKET_TICK_MS = 2000;
const TIP_TTL_MS = 45 * 1000;

export const STOCK_SCAN_COST = 10;
export const STOCK_ALERT_COST = 15;
export const STOCK_LEVERAGES = [2, 3, 5] as const;
export type StockLeverage = (typeof STOCK_LEVERAGES)[number];

interface LiveStockState {
  meta: StockMeta;
  price: number;
  openPrice: number;
  lastDelta: number;
  history: number[];
  momentum: 'up' | 'down';
  regimeLeft: number; // ticks left in current momentum regime
  turnover: number; // 亿
}

export interface UserStockTip {
  stockId: string;
  direction: 'up' | 'down';
  reason: string;
  issuedAt: number;
  expiresAt: number;
  scanned: boolean;
  seq: number;
}

const market = new Map<string, LiveStockState>();
const userTips = new Map<number, UserStockTip>();
let marketTickSeq = 0;

function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pickOne = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function initMarket(): void {
  if (market.size > 0) return;
  for (const meta of STOCK_CATALOG) {
    const startDrift = (Math.random() - 0.5) * 0.08;
    const openPrice = Number((meta.base * (1 + startDrift * 0.4)).toFixed(2));
    let p = openPrice;
    const history: number[] = [];
    let mom: 'up' | 'down' = Math.random() < 0.5 ? 'up' : 'down';
    for (let i = 0; i < HISTORY_LEN; i++) {
      const pull = ((meta.base - p) / meta.base) * 0.04;
      const drift = (mom === 'up' ? 1 : -1) * 0.0014 + pull;
      const step = drift + 0.0055 * meta.vol * gaussian();
      p = Number(clamp(p * (1 + step), meta.base * 0.65, meta.base * 1.45).toFixed(2));
      history.push(p);
      if (Math.random() < 0.14) mom = mom === 'up' ? 'down' : 'up';
    }
    const lastDelta = history.length >= 2 ? Number((history[history.length - 1] - history[history.length - 2]).toFixed(2)) : 0;
    market.set(meta.id, {
      meta,
      price: p,
      openPrice,
      lastDelta,
      history,
      momentum: mom,
      regimeLeft: 12 + Math.floor(Math.random() * 16),
      turnover: Number((1.8 + Math.random() * 6.5).toFixed(2)),
    });
  }
}

function stepMarket(): void {
  initMarket();
  marketTickSeq += 1;
  for (const st of market.values()) {
    st.regimeLeft -= 1;
    if (st.regimeLeft <= 0) {
      // slight mean reversion on regime flip so stocks don't hug walls forever
      const ratio = st.price / st.meta.base;
      const upProb = ratio > 1.18 ? 0.3 : ratio < 0.84 ? 0.7 : 0.5;
      st.momentum = Math.random() < upProb ? 'up' : 'down';
      st.regimeLeft = 10 + Math.floor(Math.random() * 18); // 20s–56s per short wave
    }
    const pull = ((st.meta.base - st.price) / st.meta.base) * 0.035;
    const drift = (st.momentum === 'up' ? 1 : -1) * 0.0016 + pull;
    const ret = drift + 0.0052 * st.meta.vol * gaussian();
    const next = Number(clamp(st.price * (1 + ret), st.meta.base * 0.65, st.meta.base * 1.45).toFixed(2));
    st.lastDelta = Number((next - st.price).toFixed(2));
    st.price = next;
    st.history.push(next);
    if (st.history.length > HISTORY_LEN) st.history.shift();
    // gently drift openPrice every ~100 ticks so daily % stays meaningful over long uptime
    if (marketTickSeq % 120 === 0) {
      st.openPrice = Number((st.openPrice * 0.8 + st.price * 0.2).toFixed(2));
    }
    st.turnover = Number(clamp(st.turnover + Math.abs(ret) * 42 + Math.random() * 0.12 - 0.08, 0.8, 28.5).toFixed(2));
  }
}

initMarket();
setInterval(stepMarket, MARKET_TICK_MS).unref();

/** Blend a player's settled K-line closing move gently into the live market so quotes feel continuous. */
export function applySessionFeedbackToMarket(stockId: string, startPrice: number, endPrice: number): void {
  const st = market.get(stockId);
  if (!st || startPrice <= 0) return;
  const rel = clamp((endPrice - startPrice) / startPrice, -0.14, 0.14);
  const next = Number(clamp(st.price * (1 + rel * 0.35), st.meta.base * 0.65, st.meta.base * 1.45).toFixed(2));
  st.lastDelta = Number((next - st.price).toFixed(2));
  st.price = next;
  st.history.push(next);
  if (st.history.length > HISTORY_LEN) st.history.shift();
}

export function getStockMeta(stockId: string): StockMeta | undefined {
  return STOCK_CATALOG.find((s) => s.id === stockId);
}

export function getCurrentStockQuotes(userId?: number) {
  initMarket();
  const storyCtx = userId ? getStoryStockContext(userId) : null;

  return STOCK_CATALOG.map((meta) => {
    const st = market.get(meta.id)!;
    let priceMult = 1;
    let storyTag = '';
    let effectiveTrend: 'up' | 'down' = st.momentum;

    if (storyCtx) {
      if (meta.id === 'stk_zhao') {
        priceMult = 1 + storyCtx.zhaoBias * 0.35;
        storyTag = storyCtx.zhaoTag;
        if (storyCtx.zhaoBias < -0.05 && Math.random() < 0.75) effectiveTrend = 'down';
      } else if (meta.id === 'stk_shengshi') {
        priceMult = 1 + storyCtx.shengshiBias * 0.35;
        storyTag = storyCtx.shengshiTag;
        if (storyCtx.shengshiBias > 0.05 && Math.random() < 0.75) effectiveTrend = 'up';
      }
    }

    const adj = (v: number) => Number(Math.max(1, v * priceMult).toFixed(2));
    const price = adj(st.price);
    const open = adj(st.openPrice);
    const changePct = Number((((price - open) / Math.max(0.01, open)) * 100).toFixed(2));
    const history = st.history.map(adj);

    return {
      id: meta.id,
      name: meta.name,
      code: meta.code,
      sector: meta.sector,
      base: meta.base,
      vol: meta.vol,
      price,
      changePct,
      lastDelta: Number((st.lastDelta * priceMult).toFixed(2)),
      turnover: st.turnover,
      history,
      trend: effectiveTrend,
      storyTag,
    };
  });
}

function buildTipForStock(
  userId: number,
  stockId: string,
  scanned: boolean,
  prevSeq: number,
): UserStockTip {
  const st = market.get(stockId) || market.get(STOCK_CATALOG[0].id)!;
  const storyCtx = getStoryStockContext(userId);
  let dir: 'up' | 'down' = st.momentum;
  // Story-linked stocks lean strongly in their narrative direction, while still allowing occasional counter-bounces
  if (stockId === 'stk_zhao' && storyCtx.zhaoBias < -0.05) {
    dir = Math.random() < 0.8 ? 'down' : 'up';
  } else if (stockId === 'stk_shengshi' && storyCtx.shengshiBias > 0.05) {
    dir = Math.random() < 0.8 ? 'up' : 'down';
  }
  const reason = dir === 'up' ? pickOne(st.meta.upReasons) : pickOne(st.meta.downReasons);
  const now = Date.now();
  return {
    stockId: st.meta.id,
    direction: dir,
    reason,
    issuedAt: now,
    expiresAt: now + TIP_TTL_MS,
    scanned,
    seq: prevSeq + 1,
  };
}

/** Rotate the player's TianShu insider tip to a different stock (called after each trade or on wave expiry). */
export function rotateUserStockTip(userId: number, excludeStockId?: string): UserStockTip {
  initMarket();
  const prev = userTips.get(userId);
  const avoid = excludeStockId || prev?.stockId;
  const storyCtx = getStoryStockContext(userId);

  const pool = STOCK_CATALOG.filter((s) => s.id !== avoid);
  // Build weighted candidates: active story stocks get a modest 1.6x weight, never locking out other stocks
  const weighted: string[] = [];
  for (const s of pool) {
    weighted.push(s.id, s.id);
    if ((s.id === 'stk_zhao' && storyCtx.zhaoHot) || (s.id === 'stk_shengshi' && storyCtx.shengshiHot)) {
      weighted.push(s.id);
    }
  }
  const nextId = pickOne(weighted);
  const tip = buildTipForStock(userId, nextId, false, prev?.seq || 0);
  userTips.set(userId, tip);
  return tip;
}

/** Set a targeted TianShu insider tip for the exact stock the player chose to scan. */
export function scanUserStockTip(userId: number, stockId: string): UserStockTip {
  initMarket();
  const meta = getStockMeta(stockId);
  if (!meta) throw new Error('股票不存在');
  const prev = userTips.get(userId);
  const tip = buildTipForStock(userId, stockId, true, prev?.seq || 0);
  userTips.set(userId, tip);
  return tip;
}

export function getOrCreateUserStockTip(userId: number): UserStockTip {
  const cur = userTips.get(userId);
  if (cur && Date.now() < cur.expiresAt) return cur;
  return rotateUserStockTip(userId, cur?.stockId);
}

export function getStockTipAccuracy(insightLevel: number): number {
  return Math.min(0.82, 0.64 + Math.max(0, insightLevel) * 0.036);
}

/** Build the complete live market board payload for GET /minigame/stocks (and after scan/close). */
export function buildStockMarketSnapshot(userId: number, insightLevel: number) {
  const quotes = getCurrentStockQuotes(userId);
  const storyCtx = getStoryStockContext(userId);
  const tip = getOrCreateUserStockTip(userId);
  const tipQuote = quotes.find((q) => q.id === tip.stockId) || quotes[0];
  const accuracyPct = Math.round(getStockTipAccuracy(insightLevel) * 100);
  const actionText = tip.direction === 'up' ? '强势拉升（宜做多）' : '承压回调（宜做空）';
  const insiderTip = `【天枢内参 · 准度 ${accuracyPct}%】研判【${tipQuote.name}】下一波段大概率「${actionText}」——${tip.reason}。`;

  return {
    serverTime: Date.now(),
    tickSeq: marketTickSeq,
    marketTickMs: MARKET_TICK_MS,
    headline: storyCtx.headline,
    insiderTip,
    scanCost: insightLevel >= 4 ? 0 : STOCK_SCAN_COST,
    alertCost: insightLevel >= 3 ? 0 : STOCK_ALERT_COST,
    tip: {
      stockId: tipQuote.id,
      stockName: tipQuote.name,
      direction: tip.direction,
      reason: tip.reason,
      accuracyPct,
      scanned: tip.scanned,
      expiresInSec: Math.max(1, Math.ceil((tip.expiresAt - Date.now()) / 1000)),
      seq: tip.seq,
    },
    // strip hidden internal `trend` from client payload
    quotes: quotes.map(({ trend: _trend, ...q }) => q),
  };
}

/**
 * Generate a 40-tick leveraged price path starting seamlessly from the stock's current live price,
 * plus a stock-specific breaking news catalyst at `shockAt`.
 */
export function generateStockSessionPath(opts: {
  stockId: string;
  startPrice: number;
  marketTrend: 'up' | 'down';
  activeTip: UserStockTip | null;
  insightLevel: number;
  ticks: number;
}) {
  const meta = getStockMeta(opts.stockId)!;
  const vol = meta.vol || 1;
  const isTippedStock = Boolean(opts.activeTip && opts.activeTip.stockId === opts.stockId);
  const acc = getStockTipAccuracy(opts.insightLevel);

  // Tipped stock honors the TianShu insider call with probability `acc`;
  // non-tipped stocks gently follow their live market momentum (~60%).
  let up: boolean;
  if (isTippedStock && opts.activeTip) {
    const tipRight = Math.random() < acc;
    up = (opts.activeTip.direction === 'up') === tipRight;
  } else {
    const followMom = Math.random() < 0.6;
    up = (opts.marketTrend === 'up') === followMom;
  }

  const mu = (up ? 1 : -1) * 0.0009;
  const sigma = 0.0125 * vol;
  const shockAt = 11 + Math.floor(Math.random() * 17); // ticks 11..27
  const shockSameDir = Math.random() < 0.54;
  const shockUp = shockSameDir ? up : !up;
  const shockMag = 0.028 + Math.random() * 0.022;
  const shock = (shockUp ? 1 : -1) * shockMag;
  const newsText = shockUp ? pickOne(meta.upNews) : pickOne(meta.downNews);

  const path = [Number(opts.startPrice.toFixed(2))];
  for (let t = 1; t <= opts.ticks; t++) {
    let r = mu + sigma * gaussian();
    if (t === shockAt) r += shock;
    else if (t === shockAt + 1) r += shock * 0.22; // natural follow-through candle
    path.push(Number(Math.max(0.5, path[t - 1] * (1 + r)).toFixed(2)));
  }

  return {
    path,
    shockAt,
    shockDir: (shockUp ? 'up' : 'down') as 'up' | 'down',
    newsText,
    up,
    isTippedStock,
  };
}
