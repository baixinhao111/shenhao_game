import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatMoney } from '../lib/format';
import { playLose, playPerfect, playTap, playTick } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

const STAKES = [100000, 500000, 2000000] as const;
const STAKE_NAME = ['切磋赛', '对决', '豪赌'];
const SEG_TIMEOUT = 3200;

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

  const equipped = state?.assets?.find((a: any) => a.id === state?.player?.equippedCarId);

  const start = async (stake: number) => {
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
    setTimeout(() => {
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
    setTimeout(() => setFlash(null), 700);
    if (nextHits.length >= session.segments.length) {
      setTimeout(() => void finish(nextHits), 800);
    } else {
      setTimeout(() => {
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
      await finish([...hits, ...Array(Math.max(0, session.segments.length - hits.length)).fill(0)]);
    }
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
              className="absolute right-[-8%] bottom-[-10px] h-[230px] object-contain object-bottom drop-shadow-[0_12px_20px_rgba(0,0,0,0.8)]"
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
          {/* track */}
          <div className="px-4 pt-3 space-y-3">
            {[
              { label: '你', img: session.car.image, pos: mePos, color: '#FFE7B0' },
              { label: session.opponent.name, img: '/assets/items/car_ferrari_sf90.png', pos: oppPos, color: '#FF8FA6' },
            ].map((lane) => (
              <div key={lane.label} className="relative h-12">
                <div className="absolute inset-x-0 bottom-1 h-px bg-gradient-to-r from-white/40 via-white/20 to-[#FFE7B0]" />
                <div className="absolute right-0 bottom-0 w-1 h-6 bg-[repeating-linear-gradient(0deg,#fff_0_4px,#111_4px_8px)]" />
                <motion.div
                  className="absolute bottom-0 flex items-end gap-1"
                  animate={{ left: `calc(${Math.min(1, lane.pos) * 82}% )` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                >
                  <img src={lane.img} alt="" className="h-11 w-[78px] object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.8)]" />
                  <span className="text-[10px] font-bold mb-1 text-stroke-dark" style={{ color: lane.color }}>
                    {lane.label}
                  </span>
                </motion.div>
              </div>
            ))}
          </div>

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
                  <div className="absolute inset-0 rounded-full bg-[#05070F]/75 border border-white/20 overflow-hidden">
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
