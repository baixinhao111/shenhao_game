import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { formatMoney } from '../lib/format';
import { playCritExplosion, playLose, playPerfect, playSystemPing, playTap, playTick } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

const BUDGETS = [300000, 1500000, 5000000] as const;
type Gift = 'heart' | 'carnival' | 'finisher';

interface LiveSession {
  id: string;
  budget: number;
  duration: number;
  gifts: Record<Gift, { units: number; power: number; cooldown: number }>;
  barK: number;
  opp: Array<{ t: number; power: number }>;
  warnAt: number;
  doubleAt: number;
  doubleLen: number;
  counter: { from: number; to: number; mult: number };
}

function powerOf(s: LiveSession, a: { t: number; type: Gift }) {
  let p = s.gifts[a.type].power;
  if (a.type === 'carnival' && a.t >= s.doubleAt && a.t <= s.doubleAt + s.doubleLen) p *= 2;
  if (a.type === 'finisher' && a.t >= s.counter.from && a.t <= s.counter.to) p *= s.counter.mult;
  return p;
}

/** Same ordering + clamping as the server, evaluated up to time t. */
function barAt(s: LiveSession, actions: Array<{ t: number; type: Gift }>, t: number) {
  const ev = [
    ...actions.filter((a) => a.t <= t).map((a) => ({ t: a.t, d: powerOf(s, a) * s.barK })),
    ...s.opp.filter((o) => o.t <= t).map((o) => ({ t: o.t, d: -o.power * s.barK })),
  ].sort((a, b) => a.t - b.t);
  let bar = 50;
  for (const e of ev) bar = Math.max(0, Math.min(100, bar + e.d));
  return bar;
}

export const LiveGame: React.FC = () => {
  const { closeMinigame, flyReward, triggerBarrage, showError } = useGameStore();
  const { busy, call } = useMgApi();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [now, setNow] = useState(0);
  const [actions, setActions] = useState<Array<{ t: number; type: Gift }>>([]);
  const [result, setResult] = useState<any>(null);
  const [floats, setFloats] = useState<Array<{ id: number; type: Gift; x: number }>>([]);
  const startRef = useRef(0);
  const finishedRef = useRef(false);
  const seenOppRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<Array<{ t: number; type: Gift }>>([]);

  const start = async (budget: number) => {
    const res = await call<any>('/mg/live/start', { budget });
    if (!res) return;
    finishedRef.current = false;
    seenOppRef.current = 0;
    actionsRef.current = [];
    setActions([]);
    setResult(null);
    setNow(0);
    startRef.current = performance.now();
    setSession(res.session);
  };

  useEffect(() => {
    if (!session || result) return;
    let raf = 0;
    const loop = () => {
      const t = Math.min(session.duration, (performance.now() - startRef.current) / 1000);
      setNow(t);
      const seen = session.opp.filter((o) => o.t <= t).length;
      if (seen > seenOppRef.current) {
        const latest = session.opp[seen - 1];
        if (latest.power > 30) playCritExplosion();
        else playTick();
        seenOppRef.current = seen;
      }
      if (t >= session.duration) void finish();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, result]);

  const usedUnits = useMemo(() => actions.reduce((a, x) => a + (session?.gifts[x.type].units || 0), 0), [actions, session]);
  const lastAt = (type: Gift) => [...actions].reverse().find((a) => a.type === type)?.t;

  const send = (type: Gift, e?: React.PointerEvent) => {
    if (!session || result || finishedRef.current) return;
    const g = session.gifts[type];
    const t = Number(((performance.now() - startRef.current) / 1000).toFixed(2));
    if (t > session.duration) return;
    const done = actionsRef.current;
    const used = done.reduce((a, x) => a + session.gifts[x.type].units, 0);
    if (used + g.units > 100) return;
    const prev = [...done].reverse().find((a) => a.type === type)?.t;
    if (type === 'finisher' && prev !== undefined) return;
    if (prev !== undefined && t - prev < g.cooldown) return;
    actionsRef.current = [...actionsRef.current, { t, type }];
    setActions(actionsRef.current);
    const shellRect = (document.querySelector('[data-app-shell]') as HTMLElement | null)?.getBoundingClientRect();
    const x =
      e && shellRect && shellRect.width > 0
        ? ((e.clientX - shellRect.left) / shellRect.width) * 100
        : e
          ? (e.clientX / window.innerWidth) * 100
          : 50;
    const id = Math.random();
    setFloats((f) => [...f.slice(-14), { id, type, x }]);
    setTimeout(() => setFloats((f) => f.filter((p) => p.id !== id)), 1300);
    if (type === 'heart') playTap();
    else if (type === 'carnival') playPerfect();
    else playCritExplosion();
  };

  const finish = async () => {
    if (!session || finishedRef.current) return;
    finishedRef.current = true;
    const res = await call<any>('/mg/live/finish', { id: session.id, actions: actionsRef.current });
    if (!res) {
      finishedRef.current = false;
      return;
    }
    setResult(res.result);
    if (res.result.win) {
      triggerBarrage('gold', ['卧槽神豪大哥空降！！', '最后那一下反偷塔绝了！', '对面榜一破防了哈哈哈', '琉璃眼眶都红了']);
      playSystemPing();
    } else playLose();
    const r = barRef.current?.getBoundingClientRect();
    if (res.result.refund > 0) flyReward(res.result.refund, r ? { x: r.left + r.width / 2, y: r.bottom + 30 } : undefined);
  };

  const leave = () => {
    if (session && !result && now < session.duration) {
      showError('PK 进行中，撑到最后一秒！');
      return;
    }
    closeMinigame();
  };

  const bar = session ? barAt(session, actions, now) : 50;
  const inDouble = session && now >= session.doubleAt && now <= session.doubleAt + session.doubleLen;
  const preDouble = session && now >= session.doubleAt - 1.5 && now < session.doubleAt;
  const warned = session && now >= session.warnAt && now < session.counter.to + 0.5;
  const inCounter = session && now >= session.counter.from && now <= session.counter.to;
  const carnivalCd = session ? Math.max(0, session.gifts.carnival.cooldown - (now - (lastAt('carnival') ?? -99))) : 0;
  const finisherUsed = actions.some((a) => a.type === 'finisher');
  const lastOpp = session?.opp.filter((o) => o.t <= now).slice(-1)[0];
  const showOpp = lastOpp && now - lastOpp.t < 0.9;

  return (
    <Stage bg="/assets/scene/live.jpg" title="星耀打榜" subtitle="30 秒 PK · 预算用不完会退回" onBack={leave} dim={0.3}>
      {!session && (
        <div className="flex-1 flex flex-col justify-end px-4 pb-5 gap-3">
          <img
            src="/assets/characters/shen_liuli.png"
            alt=""
            className="absolute right-[-10%] bottom-[150px] h-[58%] object-contain object-bottom sprite-fade-bottom pointer-events-none drop-shadow-[0_14px_24px_rgba(0,0,0,0.7)]"
          />
          <div className="relative space-y-1.5 max-w-[72%]">
            <Speech who="沈琉璃" tone="rose" text="赵氏公会又来砸场子了……今晚能帮我守住榜一吗？" />
            <div className="text-[11.5px] text-[#B3B6C2] leading-relaxed text-stroke-dark">
              小心心随手点，嘉年华在「双倍时刻」砸，绝杀留给对面的偷塔。
            </div>
          </div>
          <StakePicker
            options={BUDGETS}
            busy={busy}
            onPick={start}
            render={(v, i) => (
              <>
                <span className="font-editorial text-[13.5px]">{['小试牛刀', '撑场', '包场'][i]}</span>
                <span className="font-num text-[11.5px]">预算 {formatMoney(v)}</span>
              </>
            )}
          />
        </div>
      )}

      {session && (
        <div className="flex-1 flex flex-col">
          {/* PK bar */}
          <div ref={barRef} className="px-4 pt-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-b from-[#FFB3C6] to-[#C24E74]">
                  <PortraitAvatar src="/assets/characters/shen_liuli.png" alt="" className="w-full h-full !border-0" rounded="full" />
                </div>
                <span className="font-num text-[15px] text-[#FFB3C6] text-stroke-dark">{bar.toFixed(0)}%</span>
              </div>
              <div className="font-num text-[20px] text-[#ECE6DA] text-stroke-dark">{Math.max(0, Math.ceil(session.duration - now))}s</div>
              <div className="flex items-center gap-1.5">
                <span className="font-num text-[15px] text-[#AFC0FF] text-stroke-dark">{(100 - bar).toFixed(0)}%</span>
                <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-b from-[#9FB4FF] to-[#3B4FBF]">
                  <PortraitAvatar src="/assets/characters/zhao_tianyu.png" alt="" className="w-full h-full !border-0" rounded="full" />
                </div>
              </div>
            </div>
            <div className="relative h-4 rounded-full overflow-hidden flex border border-white/25 shadow-[0_0_16px_rgba(240,120,154,0.35)]">
              <motion.div className="h-full bg-gradient-to-r from-[#FF4F8B] to-[#FF9AB8]" animate={{ width: `${bar}%` }} transition={{ duration: 0.15 }} />
              <div className="h-full flex-1 bg-gradient-to-r from-[#5A78FF] to-[#2C3E9F]" />
              <div className="absolute top-0 bottom-0 w-[2px] bg-white/80 left-1/2" />
            </div>
          </div>

          {/* stage centre */}
          <div className="relative flex-1 overflow-hidden">
            <img
              src="/assets/characters/shen_liuli.png"
              alt=""
              className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[96%] object-contain object-bottom sprite-fade-bottom pointer-events-none"
            />
            <div className="absolute inset-0 pointer-events-none">
              <AnimatePresence>
                {floats.map((f) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 0, scale: 0.6 }}
                    animate={{ opacity: [0, 1, 0], y: -220, scale: f.type === 'heart' ? 1 : 1.4 }}
                    transition={{ duration: 1.2 }}
                    className="absolute bottom-6"
                    style={{ left: `${Math.min(88, Math.max(6, f.x))}%` }}
                  >
                    {f.type === 'heart' ? (
                      <GameIcon name="heart" size={30} />
                    ) : (
                      <span className={`font-editorial font-black text-[24px] whitespace-nowrap ${f.type === 'finisher' ? 'text-[#FF5C7A]' : 'gold-gradient-text'}`}>
                        {f.type === 'finisher' ? '绝杀！' : '嘉年华！'}
                      </span>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="absolute top-3 inset-x-4 space-y-1.5">
              <AnimatePresence>
                {(preDouble || inDouble) && !result && (
                  <motion.div
                    key="dbl"
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="font-editorial text-[18px] font-black gold-gradient-text drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  >
                    {inDouble ? '双倍时刻！嘉年华 ×2' : '双倍时刻即将开始……'}
                  </motion.div>
                )}
                {warned && !result && (
                  <motion.div
                    key="warn"
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5"
                  >
                    <GameIcon name="tianshu" size={24} />
                    <span className="font-editorial text-[16px] font-black cyan-glow-text">
                      {inCounter ? '就是现在 —— 绝杀！' : '天枢预警：对面准备偷塔'}
                    </span>
                  </motion.div>
                )}
                {showOpp && !result && (
                  <motion.div key={'o' + lastOpp!.t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-right text-[12px] text-stroke-dark">
                    <span className="text-[#AFC0FF] font-bold">赵氏公会</span>
                    <span className="text-[#ECE6DA]"> 送出 {lastOpp!.power > 30 ? '超级火箭 ×10' : '跑车'}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {result && (
              <motion.div
                initial={{ opacity: 0, scale: 1.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`absolute inset-x-0 top-[30%] text-center font-editorial text-[44px] font-black drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] ${result.win ? 'gold-gradient-text' : 'text-[#8C90A0]'}`}
              >
                {result.win ? '守住榜一' : '被偷塔了'}
              </motion.div>
            )}
          </div>

          {!result && now >= session.duration ? (
            <div className="px-4 pb-5">
              <button disabled={busy} onClick={() => void finish()} className="w-full gold-btn-shimmer py-3 text-[15px] font-editorial">
                {busy ? '结算中…' : '查看 PK 结果'}
              </button>
            </div>
          ) : !result ? (
            <div className="px-3 pb-5 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-[#B3B6C2] text-stroke-dark">
                <span>预算</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#FF9AB8] to-[#EADBB8]" style={{ width: `${100 - usedUnits}%` }} />
                </div>
                <span className="font-num">{formatMoney((session.budget * (100 - usedUnits)) / 100)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onPointerDown={(e) => send('heart', e)}
                  disabled={usedUnits >= 100}
                  className="btn-navy py-1.5 flex flex-col items-center active:scale-90 disabled:opacity-40"
                >
                  <GameIcon name="heart" size={28} />
                  <span className="text-[12px] font-editorial">小心心</span>
                  <span className="font-num text-[10px] text-[#8C90A0]">{formatMoney(session.budget / 100)}</span>
                </button>
                <button
                  onPointerDown={(e) => send('carnival', e)}
                  disabled={carnivalCd > 0 || usedUnits + 10 > 100}
                  className={`relative py-1.5 flex flex-col items-center active:scale-90 disabled:opacity-50 ${inDouble ? 'gold-btn-shimmer' : 'btn-navy'}`}
                >
                  <GameIcon name="champagne" size={28} />
                  <span className="text-[12px] font-editorial">嘉年华{inDouble ? ' ×2' : ''}</span>
                  <span className="font-num text-[10px]">{carnivalCd > 0 ? `${carnivalCd.toFixed(1)}s` : formatMoney(session.budget / 10)}</span>
                </button>
                <button
                  onPointerDown={(e) => send('finisher', e)}
                  disabled={finisherUsed || usedUnits + 30 > 100}
                  className={`py-1.5 flex flex-col items-center rounded-[6px] text-white font-bold border active:scale-90 disabled:opacity-40 ${
                    inCounter
                      ? 'bg-gradient-to-b from-[#9BF5FF] to-[#1F8FA6] border-white shadow-[0_0_22px_rgba(99,230,242,0.9)] animate-pulse'
                      : 'bg-gradient-to-b from-[#FF7BA0] to-[#C2335E] border-[#FFC4D3]'
                  }`}
                >
                  <GameIcon name="crown" size={28} />
                  <span className="text-[12px] font-editorial">{finisherUsed ? '已使用' : '绝杀'}</span>
                  <span className="font-num text-[10px]">{formatMoney((session.budget * 3) / 10)}</span>
                </button>
              </div>
            </div>
          ) : (
            <ResultStrip
              win={result.win}
              title={result.win ? '沈琉璃好感 +' + result.affectionGain : '下次留好绝杀'}
              line={`打赏 ${formatMoney(result.spent)} · 退回 ${formatMoney(result.refund)}${result.crit?.triggered ? ` · 返现 ×${result.crit.multiplier}` : ''}`}
              formatAmount={formatMoney}
              primary={{
                label: '再开一场',
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
