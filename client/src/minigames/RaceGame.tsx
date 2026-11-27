import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatMoney } from '../lib/format';
import { playLose, playPerfect, playTap, playTick } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

const STAKES = [100000, 500000, 2000000] as const;
const STAKE_NAME = ['切磋赛', '对决', '豪赌'];
const SEG_TIMEOUT = 3200;
/** Speed streaks rushing past while the race runs (fixed so they don't reshuffle on every render). */
const STREAKS = Array.from({ length: 14 }, (_, i) => ({
  top: 30 + ((i * 37) % 62),
  w: 60 + ((i * 53) % 110),
  d: 0.45 + ((i * 7) % 5) * 0.08,
  delay: ((i * 13) % 10) * 0.05,
}));

interface RaceSession {
  id: string;
  stake: number;
  car: { name: string; image: string; power: number };
  opponent: { name: string; car: string; power: number };
  segments: Array<{ name: string; zone: number; speed: number }>;
  oppSeg: number[];
}

/** accuracy 0..1 from needle position vs zone */
function judge(needle: number, center: number, zone: number): number {
  const half = zone / 2;
  const dist = Math.abs(needle - center);
  if (dist <= half) return 0.75 + 0.25 * (1 - dist / half);
  return Math.max(0, 0.75 - (dist - half) * 3);
}

export const RaceGame: React.FC = () => {
  const { state, closeMinigame, flyReward, showError } = useGameStore();
  const { busy, call } = useMgApi();
  const [session, setSession] = useState<RaceSession | null>(null);
  const [seg, setSeg] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const [needle, setNeedle] = useState(0);
  const [zoneCenter, setZoneCenter] = useState(0.5);
  const [flash, setFlash] = useState<{ text: string; tone: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [intro, setIntro] = useState(false);
  const rafRef = useRef<number>(0);
  const segStartRef = useRef(0);
  const lockedRef = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };

  useEffect(() => () => clearTimers(), []);

  const equipped = state?.assets?.find((a: any) => a.id === state?.player?.equippedCarId);

  const start = async (stake: number) => {
    clearTimers();
    const res = await call<any>('/mg/race/start', { stake });
    if (!res) return;
    setSession(res.session);
    setHits([]);
    setSeg(0);
    setResult(null);
    beginSegment();
  };

  const beginSegment = () => {
    lockedRef.current = true;
    setIntro(true);
    setZoneCenter(0.3 + Math.random() * 0.4);
    later(() => {
      setIntro(false);
      lockedRef.current = false;
      segStartRef.current = performance.now();
    }, 900);
  };

  // needle animation
  useEffect(() => {
    if (!session || result || seg >= session.segments.length) return;
    const speed = session.segments[seg].speed;
    const loop = (now: number) => {
      if (!lockedRef.current) {
        const t = (now - segStartRef.current) / 1000;
        const phase = (t * speed) % 2;
        setNeedle(phase < 1 ? phase : 2 - phase);
        if (now - segStartRef.current > SEG_TIMEOUT) commit(0);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, seg, result]);

  const commit = (acc: number) => {
    if (!session || lockedRef.current) return;
    lockedRef.current = true;
    const nextHits = [...hits, acc];
    setHits(nextHits);
    if (acc >= 0.9) {
      playPerfect();
      setFlash({ text: '完美！', tone: 'gold' });
    } else if (acc >= 0.75) {
      playTick();
      setFlash({ text: '漂亮', tone: 'cyan' });
    } else {
      playTap();
      setFlash({ text: acc > 0 ? '偏了' : '失误', tone: 'red' });
    }
    later(() => setFlash(null), 700);
    if (nextHits.length >= session.segments.length) {
      later(() => void finish(nextHits), 800);
    } else {
      later(() => {
        setSeg((s) => s + 1);
        beginSegment();
      }, 800);
    }
  };

  const finish = async (h: number[]) => {
    if (!session) return;
    const res = await call<any>('/mg/race/finish', { id: session.id, hits: h });
    if (!res) return;
    setResult(res.result);
    if (res.result.win) {
      const r = bannerRef.current?.getBoundingClientRect();
      flyReward(res.result.payout, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
    } else playLose();
  };

  const tapGauge = () => {
    if (!session || lockedRef.current || result) return;
    commit(judge(needle, zoneCenter, session.segments[seg].zone));
  };

  const leaveArmedRef = useRef(0);
  const leave = async () => {
    if (session && !result) {
      if (Date.now() - leaveArmedRef.current > 3000) {
        leaveArmedRef.current = Date.now();
        showError('比赛进行中，再按一次返回将直接判负');
        return;
      }
      clearTimers();
      await finish([...hits, ...Array(Math.max(0, session.segments.length - hits.length)).fill(0)]);
    }
    clearTimers();
    closeMinigame();
  };

  // positions along the track (0..1)
  const total = session?.segments.length || 4;
  const mePos = hits.reduce((a, b) => a + 0.55 + b * 0.45, 0) / total;
  const oppPos = session ? session.oppSeg.slice(0, hits.length).reduce((a, b) => a + 0.55 + b * 0.45, 0) / total : 0;

  return (
    <Stage bg="/assets/scene/race.jpg" title="江畔竞速" subtitle="看准时机操作，马力越高判定越宽" onBack={leave} dim={0.3}>
      {!session && (
        <div className="flex-1 flex flex-col justify-end px-4 pb-5 gap-3">
          <div className="relative h-[170px]">
            {equipped?.image && (
              <img src={equipped.image} alt="" className="absolute left-[-4%] bottom-0 w-[62%] object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.85)]" />
            )}
            <img
              src="/assets/characters/zhao_tianyu.png"
              alt=""
              className="absolute right-[-8%] bottom-[-10px] h-[230px] object-contain object-bottom sprite-fade-bottom drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)]"
            />
          </div>
          <Speech who="赵天宇" tone="rose" text="开这种车也敢来外滩？彩头你定，我奉陪。" />
          <div className="text-[11.5px] text-[#C3C9DC] text-stroke-dark">
            你的座驾：<span className="text-[#FFE7B0] font-bold">{equipped?.name}</span> · 马力 {equipped?.racePower || 10}
          </div>
          <StakePicker
            options={STAKES}
            busy={busy}
            onPick={start}
            render={(v, i) => (
              <>
                <span className="font-editorial text-[13.5px]">{STAKE_NAME[i]}</span>
                <span className="font-num text-[11.5px]">押 {formatMoney(v)}</span>
              </>
            )}
          />
        </div>
      )}

      {session && (
        <div className="flex-1 flex flex-col" onPointerDown={tapGauge}>
          {/* track: asphalt strip, two lanes, checkpoints for each segment, checkered finish */}
          <div className="px-3 pt-3">
            <div
              className="relative rounded-[8px] overflow-hidden border border-white/15 shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
              style={{
                background:
                  'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 9px), linear-gradient(180deg, #1A1E28 0%, #0E1118 100%)',
              }}
            >
              {/* checkpoints */}
              {session.segments.map((sg, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: `${6 + ((i + 1) / total) * 80}%` }}>
                  <div className={`w-px h-full ${i < hits.length ? 'bg-[#FFE7B0]/40' : 'bg-white/12'}`} />
                  <span className="absolute top-0.5 -translate-x-1/2 text-[8.5px] text-[#8B93AD] whitespace-nowrap">{sg.name}</span>
                </div>
              ))}
              <div className="absolute top-0 bottom-0 left-[6%] w-[3px] bg-white/50" />
              <div className="absolute top-0 bottom-0 right-0 w-[14px] bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:7px_7px] opacity-90" />
              <div className="absolute left-0 right-[14px] top-1/2 border-t border-dashed border-[#E2BD72]/45" />
              {[
                { label: '你', img: session.car.image, pos: mePos, color: '#FFE7B0' },
                { label: session.opponent.name, img: '/assets/items/car_ferrari_sf90.png', pos: oppPos, color: '#FF8FA6' },
              ].map((lane, li) => (
                <div key={lane.label} className={`relative h-[46px] ${li === 0 ? 'mt-3' : ''}`}>
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 flex items-center"
                    initial={false}
                    animate={{ left: `calc(${2 + Math.min(1, lane.pos) * 80}%)` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                  >
                    {/* light trail */}
                    <span
                      className="absolute right-[62px] top-1/2 -translate-y-1/2 h-[3px] w-[70px] rounded-full"
                      style={{ background: `linear-gradient(90deg, transparent, ${li === 0 ? 'rgba(255,231,176,0.7)' : 'rgba(255,92,122,0.7)'})` }}
                    />
                    <img src={lane.img} alt="" className="relative h-[40px] w-[74px] object-contain drop-shadow-[0_5px_5px_rgba(0,0,0,0.9)]" />
                    <span className="ml-0.5 text-[10px] font-bold text-stroke-dark" style={{ color: lane.color }}>
                      {lane.label}
                    </span>
                  </motion.div>
                </div>
              ))}
            </div>
          </div>

          {/* rushing speed lines while the race is on */}
          {!result && !intro && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {STREAKS.map((st, i) => (
                <motion.span
                  key={i}
                  className="absolute h-[2px] rounded-full"
                  style={{
                    top: `${st.top}%`,
                    width: st.w,
                    background: `linear-gradient(90deg, transparent, ${i % 3 ? 'rgba(255,255,255,0.35)' : 'rgba(255,231,176,0.5)'})`,
                  }}
                  initial={{ left: '110%' }}
                  animate={{ left: '-40%' }}
                  transition={{ repeat: Infinity, duration: st.d, delay: st.delay, ease: 'linear' }}
                />
              ))}
            </div>
          )}

          {/* segment & gauge */}
          <div ref={bannerRef} className="relative flex-1 flex flex-col items-center justify-center px-6">
            {!result && seg < session.segments.length && (
              <>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={seg + (intro ? 'i' : '')}
                    initial={{ opacity: 0, scale: 1.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="font-editorial text-[30px] font-black gold-gradient-text drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)] mb-6"
                  >
                    {session.segments[seg].name}
                  </motion.div>
                </AnimatePresence>
                <div className="relative w-full h-10">
                  <div className="absolute -inset-[3px] rounded-full bg-gradient-to-b from-[#C9CED8] via-[#5A606C] to-[#2A2E36] shadow-[0_6px_16px_rgba(0,0,0,0.7)]" />
                  <div className="absolute inset-0 rounded-full bg-[#05070F] overflow-hidden">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_10%)]" />
                    <div
                      className="absolute top-0 bottom-0 bg-gradient-to-r from-[#3FD69A]/40 via-[#7BFFC8] to-[#3FD69A]/40 shadow-[0_0_14px_rgba(123,255,200,0.7)]"
                      style={{
                        left: `${(zoneCenter - session.segments[seg].zone / 2) * 100}%`,
                        width: `${session.segments[seg].zone * 100}%`,
                      }}
                    />
                  </div>
                  <div
                    className="absolute -top-2 -bottom-2 w-1.5 -ml-[3px] rounded-full bg-[#FFE7B0] shadow-[0_0_12px_rgba(255,231,176,0.9)]"
                    style={{ left: `${needle * 100}%`, opacity: intro ? 0.3 : 1 }}
                  />
                </div>
                <div className="mt-4 text-[12px] text-[#C3C9DC] tracking-[0.3em] text-stroke-dark">
                  {intro ? '准备……' : '指针进入绿区时 · 轻触屏幕'}
                </div>
                <div className="mt-2 flex gap-1.5">
                  {session.segments.map((_, i) => (
                    <span
                      key={i}
                      className={`w-6 h-1.5 rounded-full ${i < hits.length ? (hits[i] >= 0.75 ? 'bg-[#7BFFC8]' : 'bg-[#FF5C7A]') : i === seg ? 'bg-[#FFE7B0]' : 'bg-white/15'}`}
                    />
                  ))}
                </div>
              </>
            )}
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`absolute top-[18%] font-editorial text-[34px] font-black drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)] ${
                    flash.tone === 'gold' ? 'gold-gradient-text' : flash.tone === 'cyan' ? 'cyan-glow-text' : 'text-[#FF8FA6]'
                  }`}
                >
                  {flash.text}
                </motion.div>
              )}
            </AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, scale: 1.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`font-editorial text-[44px] font-black drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] ${result.win ? 'gold-gradient-text' : 'text-[#A3AAC2]'}`}
              >
                {result.win ? (result.perfect ? '完美胜利' : '胜') : '惜败'}
              </motion.div>
            )}
          </div>

          {result && (
            <div onPointerDown={(e) => e.stopPropagation()}>
              <ResultStrip
                win={result.win}
                title={result.win ? `甩开${session.opponent.name}` : `${session.opponent.name}领先冲线`}
                amount={result.profit}
                line={result.win ? (result.perfect ? '四段全部完美，彩头 ×2.8！' : '彩头 ×2.2 已入账') : '升级座驾马力，判定区会更宽。'}
                formatAmount={formatMoney}
                primary={{
                  label: '再来一局',
                  onClick: () => {
                    setSession(null);
                    setResult(null);
                  },
                }}
                secondary={{ label: '离开', onClick: closeMinigame }}
              />
            </div>
          )}
        </div>
      )}
    </Stage>
  );
};
