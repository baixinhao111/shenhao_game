/**
 * Monte Carlo expected-return balance check for the overhauled Stock Market minigame.
 * Run after `npm run build` from repo root: `node scripts/qa/balance_stock.mjs`
 */
import { generateStockSessionPath, STOCK_CATALOG } from '../../server/dist/stocks.js';

const TRIALS = 15000;
const TICKS = 40;
const STAKE = 100000;

function simOne({ leverage, insightLevel, strategy }) {
  const meta = STOCK_CATALOG[Math.floor(Math.random() * STOCK_CATALOG.length)];
  const marketTrend = Math.random() < 0.5 ? 'up' : 'down';
  const tipDir = Math.random() < 0.5 ? 'up' : 'down';
  const useTip = strategy !== 'blind';
  const activeTip = useTip
    ? { stockId: meta.id, direction: tipDir, reason: '', issuedAt: 0, expiresAt: 1e15, scanned: false, seq: 1 }
    : null;

  const gen = generateStockSessionPath({
    stockId: meta.id,
    startPrice: meta.base,
    marketTrend,
    activeTip,
    insightLevel,
    ticks: TICKS,
  });

  const dir = useTip ? (tipDir === 'up' ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
  const val = (t) => Math.max(0, Math.min(STAKE * (1 + leverage), STAKE * (1 + leverage * dir * (gen.path[t] / gen.path[0] - 1))));

  let exitTick = TICKS;
  let liq = false;
  for (let t = 1; t <= TICKS; t++) {
    const v = val(t);
    if (v <= STAKE * 0.2) {
      exitTick = t;
      liq = true;
      break;
    }
    if (strategy === 'tip_tp_sl') {
      if (v >= STAKE * 1.35 || v <= STAKE * 0.72) {
        exitTick = t;
        break;
      }
    } else if (strategy === 'tip_alert') {
      const adverseShock = (gen.shockDir === 'up' && dir === -1) || (gen.shockDir === 'down' && dir === 1);
      if (adverseShock && t === gen.shockAt - 1) {
        exitTick = t;
        break;
      }
      if (v >= STAKE * 1.45) {
        exitTick = t;
        break;
      }
    }
  }
  return { ret: val(exitTick) / STAKE, liq };
}

for (const lev of [2, 3, 5]) {
  console.log(`\n=== Leverage ${lev}x ===`);
  for (const [label, insightLevel, strategy] of [
    ['blind hold (Lv.0)     ', 0, 'blind'],
    ['follow tip hold (Lv.0)', 0, 'tip_hold'],
    ['follow tip hold (Lv.5)', 5, 'tip_hold'],
    ['tip + TP/SL (Lv.0)    ', 0, 'tip_tp_sl'],
    ['tip + alert (Lv.3)    ', 3, 'tip_alert'],
  ]) {
    let sum = 0;
    let liqs = 0;
    for (let i = 0; i < TRIALS; i++) {
      const r = simOne({ leverage: lev, insightLevel, strategy });
      sum += r.ret;
      if (r.liq) liqs++;
    }
    console.log(`  ${label}: EV = ${(sum / TRIALS).toFixed(3)}x  (liq ${((liqs / TRIALS) * 100).toFixed(1)}%)`);
  }
}
