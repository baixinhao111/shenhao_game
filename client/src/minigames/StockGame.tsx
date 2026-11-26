import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playLose, playSystemPing, playTap, playTick } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

const AMOUNTS = [100000, 300000, 1000000] as const;
const CHART_W = 360;
const CHART_H = 230;

interface Quote {
  id: string;
  name: string;
  code: string;
  price: number;
  changePct: number;
  trend: 'up' | 'down';
}
interface StockSession {
  id: string;
  name: string;
  code: string;
  stake: number;
  direction: 'long' | 'short';
  leverage: number;
  tickMs: number;
  path: number[];
  newsAt: number;
}

const NEWS_UP = ['突发：海外大单落地，资金疯狂涌入！', '突发：龙头机构上调评级，盘面急拉！'];
const NEWS_DOWN = ['突发：监管问询函下发，盘面跳水！', '突发：大股东减持公告，抛压骤增！'];

export const StockGame: React.FC = () => {
  const { closeMinigame, flyReward } = useGameStore();
  const { busy, call } = useMgApi();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [tip, setTip] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [dir, setDir] = useState<'long' | 'short'>('long');
  const [session, setSession] = useState<StockSession | null>(null);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<any>(null);
  const closingRef = useRef(false);
  const pnlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiRequest<any>('/minigame/stocks')
      .then((r) => {
        setQuotes(r.quotes || []);
        setTip(r.insiderTip || '');
      })
      .catch(() => {});
  }, []);

  const valueAt = (s: StockSession, t: number) => {
    const d = s.direction === 'long' ? 1 : -1;
    return Math.min(s.stake * 4, Math.max(0, s.stake * (1 + s.leverage * d * (s.path[t] / s.path[0] - 1))));
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
    const rect = pnlRef.current?.getBoundingClientRect();
    if (res.result.profit > 0) flyReward(res.result.payout, rect ? { x: rect.left + rect.width / 2, y: rect.top + 20 } : undefined);
    else playLose();
  };

  // live ticker
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

  // auto close at the bell or on liquidation
  useEffect(() => {
    if (!session || result || closingRef.current) return;
    if (tick >= session.path.length - 1 || valueAt(session, tick) <= session.stake * 0.2) void close(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session, result]);

  const open = async (amount: number) => {
    if (!pick) return;
    const res = await call<any>('/mg/stock/open', { stockId: pick, direction: dir, amount });
    if (!res) return;
    closingRef.current = false;
    setResult(null);
    setTick(0);
    setSession(res.session);
  };

  const chart = useMemo(() => {
    if (!session) return null;
    const p = session.path;
    const lo = Math.min(...p) * 0.995;
    const hi = Math.max(...p) * 1.005;
    const y = (v: number) => CHART_H - ((v - lo) / (hi - lo)) * CHART_H;
    const cw = CHART_W / p.length;
    const d = session.direction === 'long' ? 1 : -1;
    const liqPrice = p[0] * (1 - (0.8 / session.leverage) * d);
    return { y, cw, lo, hi, liqY: y(liqPrice), entryY: y(p[0]) };
  }, [session]);

  const value = session ? valueAt(session, tick) : 0;
  const pnl = session ? value - session.stake : 0;
  const pnlPct = session ? (pnl / session.stake) * 100 : 0;
  const shock = session ? session.path[session.newsAt] - session.path[session.newsAt - 1] : 0;
  const newsText = useMemo(() => (shock >= 0 ? NEWS_UP : NEWS_DOWN)[Math.floor(Math.random() * 2)], [shock]);

  return (
    <Stage bg="/assets/scene/trading.jpg" title="海城股市" subtitle="3 倍杠杆 · 30 秒盯盘，自己决定何时平仓" onBack={async () => {
        if (session && !result) await close(tick);
        closeMinigame();
      }} dim={0.55}>
      {!session && (
        <div className="flex-1 flex flex-col justify-end px-4 pb-5 gap-3">
          {tip && (
            <div className="flex items-start gap-2">
              <GameIcon name="tianshu" size={30} />
              <div className="text-[12.5px] leading-relaxed text-stroke-dark">
                <span className="font-editorial font-black cyan-glow-text mr-1">天枢内参</span>
                <span className="text-[#DDFBFF]">{tip}</span>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {quotes.map((q) => {
              const up = q.changePct >= 0;
              const sel = pick === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    playTap();
                    setPick(q.id);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-[10px] transition ${
                    sel ? 'bg-[#E2BD72]/18 border border-[#FFE7B0]/80' : 'bg-[#05070F]/55 border border-white/10'
                  }`}
                >
                  <div className="min-w-0 flex-1 text-left">
                    <div className="font-editorial font-black text-[14px] text-[#FBF1D8]">{q.name}</div>
                    <div className="font-num text-[11px] text-[#8B93AD]">{q.code}</div>
                  </div>
                  <div className="font-num text-[16px] text-[#F4EFE4]">¥{q.price}</div>
                  <div className={`font-num text-[13px] w-[68px] text-right ${up ? 'text-[#FF5C7A]' : 'text-[#3FD69A]'}`}>
                    {up ? '+' : ''}
                    {q.changePct}%
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['long', 'short'] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  playTap();
                  setDir(d);
                }}
                className={`py-2 rounded-[8px] font-editorial font-black text-[14px] border transition ${
                  dir === d
                    ? d === 'long'
                      ? 'bg-gradient-to-b from-[#FF6B86] to-[#C8264B] text-white border-[#FFB3C2]'
                      : 'bg-gradient-to-b from-[#3FD69A] to-[#17845A] text-white border-[#A8F0CF]'
                    : 'bg-[#05070F]/55 text-[#A3AAC2] border-white/12'
                }`}
              >
                {d === 'long' ? '做多 · 看涨' : '做空 · 看跌'}
              </button>
            ))}
          </div>
          <StakePicker
            options={AMOUNTS}
            busy={busy || !pick}
            onPick={open}
            render={(v) => (
              <>
                <span className="font-editorial text-[13px]">{pick ? '开仓' : '先选股票'}</span>
                <span className="font-num text-[12px]">{formatMoney(v)}</span>
              </>
            )}
          />
        </div>
      )}

      {session && chart && (
        <div className="flex-1 flex flex-col">
          <div className="px-4 pt-2 flex items-end justify-between">
            <div>
              <div className="font-editorial text-[16px] font-black text-[#FBF1D8] text-stroke-dark">
                {session.name} <span className="font-num text-[12px] text-[#8B93AD]">{session.code}</span>
              </div>
              <div className="text-[11px] text-stroke-dark">
                <span className={session.direction === 'long' ? 'text-[#FF8FA6]' : 'text-[#6FE3B4]'}>
                  {session.direction === 'long' ? '做多' : '做空'} ×{session.leverage}
                </span>
                <span className="text-[#A3AAC2]"> · 本金 {formatMoney(session.stake)}</span>
              </div>
            </div>
            <div ref={pnlRef} className="text-right">
              <div className="font-num text-[11px] text-[#A3AAC2]">¥{session.path[tick]}</div>
              <motion.div
                key={Math.round(pnl / 1000)}
                initial={{ scale: 1.08 }}
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

          <div className="relative flex-1 flex items-center justify-center">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-[92%] max-w-[380px]" style={{ overflow: 'visible' }}>
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={0} x2={CHART_W} y1={CHART_H * f} y2={CHART_H * f} stroke="rgba(160,178,230,0.1)" />
              ))}
              <line x1={0} x2={CHART_W} y1={chart.entryY} y2={chart.entryY} stroke="#E2BD72" strokeDasharray="4 4" strokeWidth={1} />
              <text x={CHART_W - 2} y={chart.entryY - 4} textAnchor="end" fill="#E2BD72" fontSize="10">
                开仓价
              </text>
              {chart.liqY > 0 && chart.liqY < CHART_H && (
                <>
                  <line x1={0} x2={CHART_W} y1={chart.liqY} y2={chart.liqY} stroke="#FF5C7A" strokeDasharray="2 4" strokeWidth={1} />
                  <text x={CHART_W - 2} y={chart.liqY - 4} textAnchor="end" fill="#FF5C7A" fontSize="10">
                    爆仓线
                  </text>
                </>
              )}
              {session.path.slice(1, tick + 1).map((v, i) => {
                const o = session.path[i];
                const up = v >= o;
                const x = (i + 1) * chart.cw;
                const top = chart.y(Math.max(o, v));
                const bot = chart.y(Math.min(o, v));
                const wick = Math.abs(v - o) * 0.6 + o * 0.002;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={chart.y(Math.max(o, v) + wick)} y2={chart.y(Math.min(o, v) - wick)} stroke={up ? '#FF5C7A' : '#3FD69A'} strokeWidth={1} />
                    <rect x={x - chart.cw * 0.32} y={top} width={chart.cw * 0.64} height={Math.max(1.2, bot - top)} fill={up ? '#FF5C7A' : '#3FD69A'} rx={1} />
                  </g>
                );
              })}
              <circle cx={(tick + 0.5) * chart.cw} cy={chart.y(session.path[tick])} r={4} fill="#FFE7B0">
                {!result && <animate attributeName="r" values="3;6;3" dur="0.8s" repeatCount="indefinite" />}
              </circle>
              {result && (
                <text x={(tick + 0.5) * chart.cw} y={chart.y(session.path[tick]) - 10} textAnchor="middle" fill="#FFE7B0" fontSize="12" fontWeight="700">
                  {result.liquidated ? '爆仓' : '平仓'}
                </text>
              )}
            </svg>

            <AnimatePresence>
              {!result && tick >= session.newsAt && tick < session.newsAt + 4 && (
                <motion.div
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-2 left-4 right-4 text-[13px] font-editorial font-black text-stroke-dark"
                >
                  <span className={shock >= 0 ? 'text-[#FF8FA6]' : 'text-[#6FE3B4]'}>{newsText}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!result ? (
            <div className="px-4 pb-5 space-y-2.5">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#B7843A] to-[#FFE7B0]" style={{ width: `${(tick / (session.path.length - 1)) * 100}%` }} />
              </div>
              <Speech
                who="天枢"
                tone="cyan"
                text={
                  pnlPct > 40
                    ? '浮盈已经很可观了，贪心是交易者最大的敌人。'
                    : pnlPct < -40
                      ? '离爆仓线越来越近，止损还是死扛？'
                      : '盯紧盘面，平仓的时机由你决定。'
                }
              />
              <button disabled={busy} onClick={() => close(tick)} className="w-full gold-btn-shimmer py-3 text-[16px] font-editorial">
                平仓 · {formatMoney(value)}
              </button>
            </div>
          ) : (
            <ResultStrip
              win={result.profit >= 0}
              title={result.liquidated ? '爆仓离场' : result.profit >= 0 ? '止盈离场' : '止损离场'}
              amount={result.profit}
              line={`平仓价 ¥${result.price} · 天枢积分 +28`}
              formatAmount={formatMoney}
              primary={{
                label: '再开一单',
                onClick: () => {
                  setSession(null);
                  setResult(null);
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
