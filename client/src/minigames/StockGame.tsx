import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playLose, playSystemPing, playTap, playTick } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

const AMOUNTS = [100000, 300000, 1000000] as const;
const LEVERAGES = [
  { v: 2 as const, label: '2×', tag: '稳健' },
  { v: 3 as const, label: '3×', tag: '标准' },
  { v: 5 as const, label: '5×', tag: '激进' },
];
const CHART_W = 316;
const CHART_H = 208;
const AXIS_W = 48;

interface Quote {
  id: string;
  name: string;
  code: string;
  sector?: string;
  price: number;
  changePct: number;
  lastDelta?: number;
  turnover?: number;
  history?: number[];
  storyTag?: string;
}

interface TipMeta {
  stockId: string;
  stockName: string;
  direction: 'up' | 'down';
  reason: string;
  accuracyPct: number;
  scanned: boolean;
  expiresInSec: number;
  seq: number;
}

interface MarketSnapshot {
  serverTime?: number;
  tickSeq?: number;
  marketTickMs?: number;
  headline?: string;
  insiderTip?: string;
  scanCost?: number;
  alertCost?: number;
  tip?: TipMeta;
  quotes?: Quote[];
}

interface StockSession {
  id: string;
  stockId: string;
  name: string;
  code: string;
  sector?: string;
  stake: number;
  direction: 'long' | 'short';
  leverage: number;
  tickMs: number;
  preHistory?: number[];
  path: number[];
  newsAt: number;
  newsText?: string;
  alertCost?: number;
}

interface AlertInfo {
  newsAt: number;
  shockDir: 'up' | 'down';
  favorable: boolean;
  summary: string;
}

const Sparkline: React.FC<{ data: number[]; up: boolean }> = ({ data, up }) => {
  if (!data || data.length < 2) return <div className="w-[54px] h-[24px]" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(0.01, max - min);
  const w = 54;
  const h = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const color = up ? '#FF5C7A' : '#3FD69A';
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible">
      <path d={line} fill="none" stroke={color} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
};

export const StockGame: React.FC = () => {
  const { state, closeMinigame, flyReward } = useGameStore();
  const { busy, call } = useMgApi();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [tipMeta, setTipMeta] = useState<TipMeta | null>(null);
  const [tipText, setTipText] = useState('');
  const [headline, setHeadline] = useState('');
  const [scanCost, setScanCost] = useState(10);
  const [tickSeq, setTickSeq] = useState(0);
  const [tipCountdown, setTipCountdown] = useState(45);
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});

  const [pick, setPick] = useState<string | null>(null);
  const [dir, setDir] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState<2 | 3 | 5>(3);

  const [session, setSession] = useState<StockSession | null>(null);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);

  const closingRef = useRef(false);
  const pnlRef = useRef<HTMLDivElement>(null);
  const prevPricesRef = useRef<Record<string, number>>({});
  const autoPickedRef = useRef(false);

  const applyMarket = useCallback((m: MarketSnapshot) => {
    const nextQuotes = m.quotes || [];
    const nextFlash: Record<string, 'up' | 'down'> = {};
    for (const q of nextQuotes) {
      const prev = prevPricesRef.current[q.id];
      if (typeof prev === 'number' && prev !== q.price) {
        nextFlash[q.id] = q.price > prev ? 'up' : 'down';
      }
      prevPricesRef.current[q.id] = q.price;
    }
    if (Object.keys(nextFlash).length > 0) {
      setFlashMap(nextFlash);
      setTimeout(() => setFlashMap({}), 650);
    }
    setQuotes(nextQuotes);
    if (m.insiderTip !== undefined) setTipText(m.insiderTip);
    if (m.headline !== undefined) setHeadline(m.headline);
    if (typeof m.scanCost === 'number') setScanCost(m.scanCost);
    if (typeof m.tickSeq === 'number') setTickSeq(m.tickSeq);
    if (m.tip) {
      setTipMeta(m.tip);
      setTipCountdown(m.tip.expiresInSec);
      if (!autoPickedRef.current) {
        autoPickedRef.current = true;
        setPick(m.tip.stockId);
        setDir(m.tip.direction === 'up' ? 'long' : 'short');
      }
    } else if (!autoPickedRef.current && nextQuotes.length > 0) {
      autoPickedRef.current = true;
      setPick(nextQuotes[0].id);
    }
  }, []);

  // Live lobby market polling every 2s so prices, % changes, sparklines & rotating insider tips stay genuinely real-time
  useEffect(() => {
    if (session) return;
    let alive = true;
    const pull = () => {
      apiRequest<MarketSnapshot>('/minigame/stocks')
        .then((r) => {
          if (alive) applyMarket(r);
        })
        .catch(() => {});
    };
    pull();
    const id = setInterval(pull, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [session, applyMarket]);

  // Smooth 1s visual countdown for the rotating insider tip wave
  useEffect(() => {
    if (session) return;
    const id = setInterval(() => {
      setTipCountdown((s) => (s > 1 ? s - 1 : 1));
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  const valueAt = (s: StockSession, t: number) => {
    const d = s.direction === 'long' ? 1 : -1;
    const cap = s.stake * (1 + s.leverage);
    return Math.min(cap, Math.max(0, s.stake * (1 + s.leverage * d * (s.path[t] / s.path[0] - 1))));
  };

  const close = async (t: number) => {
    if (!session || closingRef.current) return;
    closingRef.current = true;
    const res = await call<any>('/mg/stock/close', { id: session.id, tick: t });
    if (!res) {
      closingRef.current = false;
      return;
    }
    setResult(res.result);
    setTick(res.result.tick);
    if (res.market) applyMarket(res.market);
    const rect = pnlRef.current?.getBoundingClientRect();
    if (res.result.profit > 0) flyReward(res.result.payout, rect ? { x: rect.left + rect.width / 2, y: rect.top + 20 } : undefined);
    else playLose();
  };

  // Live K-line ticker during an open trade
  useEffect(() => {
    if (!session || result) return;
    const id = setInterval(() => {
      setTick((t) => {
        const next = Math.min(session.path.length - 1, t + 1);
        playTick();
        if (next === session.newsAt) playSystemPing();
        return next;
      });
    }, session.tickMs);
    return () => clearInterval(id);
  }, [session, result]);

  // Auto close at closing bell or liquidation
  useEffect(() => {
    if (!session || result || closingRef.current) return;
    if (tick >= session.path.length - 1 || valueAt(session, tick) <= session.stake * 0.2) void close(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session, result]);

  const scanStock = async (stockId: string) => {
    const res = await call<any>('/mg/stock/scan', { stockId });
    if (!res) return;
    playSystemPing();
    if (res.market) {
      applyMarket(res.market);
      if (res.market.tip) {
        setPick(res.market.tip.stockId);
        setDir(res.market.tip.direction === 'up' ? 'long' : 'short');
      }
    }
  };

  const triggerAlert = async () => {
    if (!session || alertInfo || result) return;
    const res = await call<any>('/mg/stock/alert', { id: session.id });
    if (!res?.alert) return;
    playSystemPing();
    setAlertInfo(res.alert);
  };

  const open = async (amount: number) => {
    if (!pick) return;
    const res = await call<any>('/mg/stock/open', { stockId: pick, direction: dir, amount, leverage });
    if (!res) return;
    closingRef.current = false;
    setResult(null);
    setAlertInfo(null);
    setTick(0);
    setSession(res.session);
  };

  // Build seamless K-line geometry: 6 dimmed pre-entry context candles + live post-entry candles
  const chart = useMemo(() => {
    if (!session) return null;
    const rawPre = (session.preHistory || []).slice(-6);
    // Ensure pre-history smoothly meets path[0]
    const pre = rawPre.length >= 2 ? [...rawPre.slice(0, -1), session.path[0]] : [session.path[0]];
    const preSteps = Math.max(0, pre.length - 1);
    const totalSlots = preSteps + session.path.length;
    const seen = [...pre, ...session.path.slice(1, tick + 1)];
    const minSeen = Math.min(...seen);
    const maxSeen = Math.max(...seen);
    const span = maxSeen - minSeen;
    const pad = Math.max(span * 0.2, session.path[0] * 0.012);
    const lo = minSeen - pad;
    const hi = maxSeen + pad;
    const y = (v: number) => CHART_H - ((v - lo) / (hi - lo)) * CHART_H;
    const cw = CHART_W / totalSlots;
    const xOf = (slot: number) => (slot + 0.5) * cw;
    const d = session.direction === 'long' ? 1 : -1;
    const liqPrice = session.path[0] * (1 - (0.8 / session.leverage) * d);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * (1 - f));
    return { pre, preSteps, y, xOf, cw, lo, hi, liqPrice, liqY: y(liqPrice), entryY: y(session.path[0]), ticks };
  }, [session, tick]);

  const value = session ? valueAt(session, tick) : 0;
  const pnl = session ? value - session.stake : 0;
  const pnlPct = session ? (pnl / session.stake) * 100 : 0;
  const shock = session ? session.path[session.newsAt] - session.path[session.newsAt - 1] : 0;
  const newsText = session?.newsText || (shock >= 0 ? '突发：主力资金大单扫货，盘面急拉！' : '突发：盘口大单砸盘，短线跳水！');

  const selectedQuote = quotes.find((q) => q.id === pick) || null;
  const isSelectedTipped = Boolean(selectedQuote && tipMeta && tipMeta.stockId === selectedQuote.id);
  const sysPoints = Number(state?.player?.sysPoints || 0);
  const canAlert = Boolean(session && !result && !alertInfo && tick < session.newsAt);

  return (
    <Stage
      bg="/assets/scene/trading.jpg"
      title="海城交易所"
      subtitle={session ? `${session.name} · ${session.leverage}× 杠杆实时盘口` : '实时行情 · 动态内参 · 自主平仓'}
      onBack={async () => {
        if (session && !result) await close(tick);
        closeMinigame();
      }}
      dim={0.58}
    >
      {!session && (
        <div className="flex-1 flex flex-col justify-between px-3.5 pb-3.5 pt-0.5 gap-2 min-h-0">
          {/* Live market status + headline + rotating TianShu insider tip */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-[10.5px] px-0.5">
              <span className="flex items-center gap-1.5 text-[#B7B3AA]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3FD69A] animate-pulse shadow-[0_0_6px_#3FD69A]" />
                <span>实时行情 · 每 2 秒跳动</span>
                {tickSeq > 0 && <span className="font-num text-[#7C8093]">#{tickSeq}</span>}
              </span>
              <span className="font-num text-[#8C90A0]">下轮内参 {tipCountdown}s</span>
            </div>

            {headline && (
              <div className="pl-2.5 border-l-2 border-[var(--champagne)]/70 text-[11px] leading-snug text-[#D9D4C9] line-clamp-1">
                {headline}
              </div>
            )}

            {tipMeta && (
              <div className="smoke-glass tick-corners px-3 py-2 border border-[#63E6F2]/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <GameIcon name="tianshu" size={20} shadow={false} />
                    <span className="text-[11px] font-editorial font-black cyan-glow-text shrink-0">天枢内参</span>
                    <span className="font-num text-[10px] px-1.5 py-[1px] rounded-sm bg-[#041826]/85 border border-[#63E6F2]/40 text-[#9AF4FB] shrink-0">
                      准度 {tipMeta.accuracyPct}%
                    </span>
                    {tipMeta.scanned && (
                      <span className="text-[10px] text-[#EADBB8] shrink-0">· 定向</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playTap();
                      setPick(tipMeta.stockId);
                      setDir(tipMeta.direction === 'up' ? 'long' : 'short');
                    }}
                    className="shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold border border-[#63E6F2]/55 bg-[#041826]/85 text-[#B9F6FB] active:scale-95 transition"
                  >
                    跟单选中
                  </button>
                </div>
                <div className="mt-1 text-[11.5px] leading-[1.55] text-[#DDFBFF]">
                  研判 <span className="font-bold text-white">【{tipMeta.stockName}】</span> 大概率
                  <span className={`font-bold mx-0.5 ${tipMeta.direction === 'up' ? 'text-[#FF8FA6]' : 'text-[#7BE0A8]'}`}>
                    {tipMeta.direction === 'up' ? '强势拉升 · 宜做多' : '承压回调 · 宜做空'}
                  </span>
                  <span className="text-[#9FDCE3]">——{tipMeta.reason}</span>
                </div>
              </div>
            )}
            {!tipMeta && tipText && (
              <div className="text-[11.5px] text-[#DDFBFF] leading-snug">{tipText}</div>
            )}
          </div>

          {/* Live Quote Ledger (hairline rows with live SVG sparklines) */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar divide-y divide-white/[0.06] border-y border-white/[0.08]">
            {quotes.map((q) => {
              const up = q.changePct >= 0;
              const sel = pick === q.id;
              const isTip = tipMeta?.stockId === q.id;
              const flash = flashMap[q.id];
              const isBearTag = q.storyTag && /空|崩|告急|丑闻/.test(q.storyTag);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    playTap();
                    setPick(q.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-2 text-left transition relative ${
                    sel ? 'bg-white/[0.055]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {sel && <span className="absolute left-0 top-1 bottom-1 w-[2.5px] bg-[var(--champagne)]" />}
                  <div className="min-w-0 flex-1 pl-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-editorial font-black text-[13.5px] text-[#ECE6DA] truncate">{q.name}</span>
                      {isTip && (
                        <span className="px-1 py-[0.5px] rounded-sm text-[9.5px] font-bold bg-[#052333] border border-[#63E6F2]/55 text-[#9AF4FB] shrink-0">
                          内参
                        </span>
                      )}
                      {q.storyTag && (
                        <span
                          className={`px-1 py-[0.5px] rounded-sm text-[9.5px] font-bold shrink-0 border ${
                            isBearTag
                              ? 'bg-[#2C0E18]/85 border-[#FF5C7A]/45 text-[#FF8FA6]'
                              : 'bg-[#0C241E]/85 border-[#3FD69A]/45 text-[#7BE0A8]'
                          }`}
                        >
                          {q.storyTag}
                        </span>
                      )}
                    </div>
                    <div className="font-num text-[10px] text-[#8C90A0] mt-0.5 truncate">
                      {q.code}
                      {q.sector ? ` · ${q.sector}` : ''}
                      {typeof q.turnover === 'number' ? ` · 额 ${q.turnover.toFixed(1)}亿` : ''}
                    </div>
                  </div>

                  <Sparkline data={q.history || []} up={up} />

                  <div className="w-[74px] text-right shrink-0">
                    <div
                      className={`font-num text-[14.5px] leading-none transition-colors duration-300 ${
                        flash === 'up' ? 'text-[#FF8FA6]' : flash === 'down' ? 'text-[#7BE0A8]' : 'text-[#ECE6DA]'
                      }`}
                    >
                      ¥{q.price.toFixed(2)}
                    </div>
                    <div className={`font-num text-[11px] mt-1 leading-none ${up ? 'text-[#FF5C7A]' : 'text-[#3FD69A]'}`}>
                      {up ? '+' : ''}
                      {q.changePct.toFixed(2)}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Order Deck: optional targeted scan + direction + leverage + stake */}
          <div className="shrink-0 space-y-2">
            {selectedQuote && (
              <div className="flex items-center justify-between gap-2 text-[11px] px-0.5">
                <span className="text-[#B7B3AA] truncate">
                  已选 <span className="text-[var(--ivory-2)] font-editorial font-bold">{selectedQuote.name}</span>
                  <span className="font-num text-[#8C90A0] ml-1.5">¥{selectedQuote.price.toFixed(2)}</span>
                </span>
                {!isSelectedTipped && (
                  <button
                    type="button"
                    disabled={busy || (scanCost > 0 && sysPoints < scanCost)}
                    onClick={() => void scanStock(selectedQuote.id)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] border border-[#63E6F2]/55 bg-[#041826]/85 text-[#B9F6FB] disabled:opacity-40 active:scale-95 transition"
                  >
                    <GameIcon name="tianshu" size={14} shadow={false} />
                    <span>研判该股 {scanCost > 0 ? `${scanCost}积分` : '免费'}</span>
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-stretch">
              {(['long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    playTap();
                    setDir(d);
                  }}
                  className={`py-2 rounded-[6px] font-editorial font-black text-[13px] border transition ${
                    dir === d
                      ? d === 'long'
                        ? 'bg-gradient-to-b from-[#FF6B86] to-[#B82043] text-white border-[#FFB3C2]'
                        : 'bg-gradient-to-b from-[#3FD69A] to-[#157A52] text-white border-[#A8F0CF]'
                      : 'bg-[#070A12]/70 text-[#8C90A0] border-white/12'
                  }`}
                >
                  {d === 'long' ? '做多 · 看涨' : '做空 · 看跌'}
                </button>
              ))}

              <div className="flex rounded-[6px] overflow-hidden border border-white/12 bg-[#070A12]/80">
                {LEVERAGES.map((lv) => (
                  <button
                    key={lv.v}
                    type="button"
                    onClick={() => {
                      playTap();
                      setLeverage(lv.v);
                    }}
                    className={`px-2 py-1 flex flex-col items-center justify-center leading-none transition ${
                      leverage === lv.v
                        ? 'bg-[var(--champagne)] text-[#19130A] font-black'
                        : 'text-[#9A9EAE] hover:text-white'
                    }`}
                  >
                    <span className="font-num text-[11.5px]">{lv.label}</span>
                    <span className="text-[9px] mt-0.5 opacity-85">{lv.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            <StakePicker
              options={AMOUNTS}
              busy={busy || !pick}
              onPick={open}
              render={(v) => (
                <>
                  <span className="font-editorial text-[12.5px]">{pick ? `开仓 ×${leverage}` : '先选股票'}</span>
                  <span className="font-num text-[12px]">{formatMoney(v)}</span>
                </>
              )}
            />
          </div>
        </div>
      )}

      {session && chart && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-1.5 flex items-end justify-between">
            <div>
              <div className="font-editorial text-[16px] font-black text-[#ECE6DA] text-stroke-dark">
                {session.name} <span className="font-num text-[12px] text-[#8C90A0]">{session.code}</span>
              </div>
              <div className="text-[11px] text-stroke-dark mt-0.5">
                <span className={session.direction === 'long' ? 'text-[#FF8FA6] font-bold' : 'text-[#6FE3B4] font-bold'}>
                  {session.direction === 'long' ? '做多' : '做空'} ×{session.leverage}
                </span>
                <span className="text-[#8C90A0]"> · 本金 {formatMoney(session.stake)}</span>
              </div>
            </div>
            <div ref={pnlRef} className="text-right">
              <div className="font-num text-[11px] text-[#8C90A0]">现价 ¥{session.path[tick].toFixed(2)}</div>
              <motion.div
                key={Math.round(pnl / 1000)}
                initial={{ scale: 1.07 }}
                animate={{ scale: 1 }}
                className={`font-num text-[26px] font-semibold leading-none ${pnl >= 0 ? 'text-[#FF5C7A]' : 'text-[#3FD69A]'}`}
              >
                {pnl >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(pnl))}
              </motion.div>
              <div className={`font-num text-[12px] ${pnl >= 0 ? 'text-[#FF8FA6]' : 'text-[#6FE3B4]'}`}>
                {pnlPct >= 0 ? '+' : ''}
                {pnlPct.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center px-3">
            <div className="relative w-full max-w-[390px] rounded-[8px] border border-[#D9C49A]/25 bg-[#05080F]/88 backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.6)] overflow-hidden">
              {/* terminal header */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] text-[10px] tracking-wider">
                <span className="flex items-center gap-1.5 text-[#8C90A0]">
                  <span className={`w-1.5 h-1.5 rounded-full ${result ? 'bg-[#7C8093]' : 'bg-[#FF5C7A] animate-pulse'}`} />
                  {result ? '已收盘' : '实时 · 秒级 K 线'}
                </span>
                <span className="font-num text-[#B3B6C2]">
                  {result
                    ? `爆仓价 ¥${chart.liqPrice.toFixed(2)}`
                    : `爆仓 ¥${chart.liqPrice.toFixed(2)} · 剩 ${Math.max(0, Math.ceil(((session.path.length - 1 - tick) * session.tickMs) / 1000))}s`}
                </span>
              </div>

              <svg viewBox={`0 0 ${CHART_W + AXIS_W} ${CHART_H + 8}`} className="block w-full">
                <defs>
                  <linearGradient id="stkArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={pnl >= 0 ? 'rgba(255,92,122,0.22)' : 'rgba(63,214,154,0.22)'} />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                  </linearGradient>
                </defs>
                {/* grid + price axis */}
                {chart.ticks.map((v, i) => (
                  <g key={i}>
                    <line x1={0} x2={CHART_W} y1={4 + (CHART_H * i) / 4} y2={4 + (CHART_H * i) / 4} stroke="rgba(160,178,230,0.08)" />
                    <text x={CHART_W + 5} y={4 + (CHART_H * i) / 4 + 3} fill="#7C8093" fontSize="9" fontFamily="Oswald, sans-serif">
                      {v.toFixed(2)}
                    </text>
                  </g>
                ))}

                <g transform="translate(0,4)">
                  {/* subtle divider between pre-entry history and live session */}
                  {chart.preSteps > 0 && (
                    <line
                      x1={chart.xOf(chart.preSteps)}
                      x2={chart.xOf(chart.preSteps)}
                      y1={0}
                      y2={CHART_H}
                      stroke="rgba(217,196,154,0.22)"
                      strokeDasharray="2 3"
                      strokeWidth={1}
                    />
                  )}

                  {/* TianShu anomaly beacon before the breaking news hits */}
                  {alertInfo && (
                    <g>
                      <line
                        x1={chart.xOf(chart.preSteps + alertInfo.newsAt)}
                        x2={chart.xOf(chart.preSteps + alertInfo.newsAt)}
                        y1={0}
                        y2={CHART_H}
                        stroke="#63E6F2"
                        strokeDasharray="3 3"
                        strokeWidth={1.2}
                      />
                      <text
                        x={Math.min(CHART_W - 44, Math.max(4, chart.xOf(chart.preSteps + alertInfo.newsAt) + 3))}
                        y={13}
                        fill="#9AF4FB"
                        fontSize="9"
                        fontWeight="700"
                      >
                        ⚡{alertInfo.shockDir === 'up' ? '利好点' : '利空点'}
                      </text>
                    </g>
                  )}

                  {/* close-price area for live session */}
                  <path
                    d={`M ${chart.xOf(chart.preSteps)} ${chart.y(session.path[0])} ${session.path
                      .slice(1, tick + 1)
                      .map((v, i) => `L ${chart.xOf(chart.preSteps + i + 1)} ${chart.y(v)}`)
                      .join(' ')} L ${chart.xOf(chart.preSteps + tick)} ${CHART_H} L ${chart.xOf(chart.preSteps)} ${CHART_H} Z`}
                    fill="url(#stkArea)"
                  />

                  {/* entry & liquidation horizontal lines */}
                  <line x1={0} x2={CHART_W} y1={chart.entryY} y2={chart.entryY} stroke="#D9C49A" strokeDasharray="4 4" strokeWidth={1} />
                  <text x={4} y={Math.max(11, chart.entryY - 4)} fill="#D9C49A" fontSize="9.5">
                    开仓 {session.path[0].toFixed(2)}
                  </text>
                  {chart.liqY > 8 && chart.liqY < CHART_H - 4 && (
                    <>
                      <line x1={0} x2={CHART_W} y1={chart.liqY} y2={chart.liqY} stroke="#FF5C7A" strokeDasharray="2 4" strokeWidth={1} />
                      <text x={4} y={chart.liqY - 4} fill="#FF5C7A" fontSize="9.5">
                        爆仓线
                      </text>
                    </>
                  )}

                  {/* dimmed pre-entry context candles */}
                  {chart.pre.slice(1).map((v, i) => {
                    const o = chart.pre[i];
                    const up = v >= o;
                    const x = chart.xOf(i + 1);
                    const top = chart.y(Math.max(o, v));
                    const bot = chart.y(Math.min(o, v));
                    const wick = Math.abs(v - o) * 0.5 + o * 0.0015;
                    return (
                      <g key={`pre-${i}`} opacity={0.38}>
                        <line x1={x} x2={x} y1={chart.y(Math.max(o, v) + wick)} y2={chart.y(Math.min(o, v) - wick)} stroke={up ? '#FF5C7A' : '#3FD69A'} strokeWidth={1} />
                        <rect x={x - chart.cw * 0.3} y={top} width={chart.cw * 0.6} height={Math.max(1.2, bot - top)} fill={up ? '#FF5C7A' : '#3FD69A'} rx={0.7} />
                      </g>
                    );
                  })}

                  {/* live candles */}
                  {session.path.slice(1, tick + 1).map((v, i) => {
                    const o = session.path[i];
                    const up = v >= o;
                    const x = chart.xOf(chart.preSteps + i + 1);
                    const top = chart.y(Math.max(o, v));
                    const bot = chart.y(Math.min(o, v));
                    const wick = Math.abs(v - o) * 0.6 + o * 0.002;
                    return (
                      <g key={i}>
                        <line x1={x} x2={x} y1={chart.y(Math.max(o, v) + wick)} y2={chart.y(Math.min(o, v) - wick)} stroke={up ? '#FF5C7A' : '#3FD69A'} strokeWidth={1} />
                        <rect x={x - chart.cw * 0.34} y={top} width={chart.cw * 0.68} height={Math.max(1.2, bot - top)} fill={up ? '#FF5C7A' : '#3FD69A'} rx={0.8} />
                      </g>
                    );
                  })}

                  {/* current price line + axis tag */}
                  <line
                    x1={0}
                    x2={CHART_W}
                    y1={chart.y(session.path[tick])}
                    y2={chart.y(session.path[tick])}
                    stroke={session.path[tick] >= session.path[0] ? 'rgba(255,92,122,0.55)' : 'rgba(63,214,154,0.55)'}
                    strokeWidth={0.8}
                  />
                  <rect
                    x={CHART_W + 1}
                    y={chart.y(session.path[tick]) - 7}
                    width={AXIS_W - 2}
                    height={14}
                    rx={2}
                    fill={session.path[tick] >= session.path[0] ? '#FF5C7A' : '#20A774'}
                  />
                  <text x={CHART_W + 4} y={chart.y(session.path[tick]) + 3.5} fill="#fff" fontSize="9.5" fontFamily="Oswald, sans-serif">
                    {session.path[tick].toFixed(2)}
                  </text>
                  <circle cx={chart.xOf(chart.preSteps + tick)} cy={chart.y(session.path[tick])} r={3.5} fill="#EADBB8">
                    {!result && <animate attributeName="r" values="3;6;3" dur="0.8s" repeatCount="indefinite" />}
                  </circle>
                  {result && (
                    <text
                      x={Math.max(54, Math.min(CHART_W - 22, chart.xOf(chart.preSteps + tick)))}
                      y={Math.max(16, chart.y(session.path[tick]) - 10)}
                      textAnchor="middle"
                      fill="#EADBB8"
                      fontSize="12"
                      fontWeight="700"
                    >
                      {result.liquidated ? '爆仓' : '平仓'}
                    </text>
                  )}
                </g>
              </svg>
            </div>

            <AnimatePresence>
              {!result && tick >= session.newsAt && tick < session.newsAt + 5 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-2 left-4 right-4 px-3 py-1.5 rounded-[4px] bg-[#060912]/90 border border-white/15 text-[12px] font-editorial font-black text-stroke-dark shadow-lg"
                >
                  <span className={shock >= 0 ? 'text-[#FF8FA6]' : 'text-[#7BE0A8]'}>{newsText}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!result ? (
            <div className="px-4 pb-4 space-y-2.5">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#9C8660] to-[#EADBB8]" style={{ width: `${(tick / (session.path.length - 1)) * 100}%` }} />
              </div>
              <Speech
                who="天枢"
                tone="cyan"
                text={
                  alertInfo
                    ? alertInfo.summary
                    : pnlPct > 35
                      ? '浮盈已经很可观了，落袋为安还是等突发催化？'
                      : pnlPct < -35
                        ? '距离爆仓线越来越近，果断止损还是博弈反抽？'
                        : '实时盯盘中，可随时平仓或消耗积分开启异动预警。'
                }
              />
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button
                  type="button"
                  disabled={busy || !canAlert || ((session.alertCost ?? 15) > 0 && sysPoints < (session.alertCost ?? 15))}
                  onClick={() => void triggerAlert()}
                  className="btn-system px-3 py-2.5 text-[11.5px] flex flex-col items-center justify-center leading-tight disabled:opacity-40"
                >
                  <span className="flex items-center gap-1">
                    <GameIcon name="tianshu" size={16} shadow={false} />
                    {alertInfo ? '已预警' : '异动预警'}
                  </span>
                  <span className="text-[10px] opacity-80">
                    {alertInfo ? '已标点' : (session.alertCost ?? 15) > 0 ? `${session.alertCost ?? 15}积分` : '洞察免费'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void close(tick)}
                  className="w-full gold-btn-shimmer py-2.5 text-[15.5px] font-editorial"
                >
                  {pnl >= 0 ? '止盈平仓' : '止损平仓'} · {formatMoney(value)}
                </button>
              </div>
            </div>
          ) : (
            <ResultStrip
              win={result.profit >= 0}
              title={result.liquidated ? '爆仓离场' : result.profit >= 0 ? '止盈离场' : '止损离场'}
              amount={result.profit}
              line={`平仓价 ¥${Number(result.price).toFixed(2)} · 天枢积分 +28 · 内参已刷新`}
              formatAmount={formatMoney}
              primary={{
                label: '再开一单',
                onClick: () => {
                  setSession(null);
                  setResult(null);
                  setAlertInfo(null);
                },
              }}
              secondary={{ label: '离开', onClick: closeMinigame }}
            />
          )}
        </div>
      )}
    </Stage>
  );
};
