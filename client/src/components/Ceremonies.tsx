import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playCritExplosion, playFanfare, playRollTick, playStamp, playTap } from '../lib/sound';
import type { TierUpFx } from '../store/useGameStore';
import { AnimatedNumber } from './AnimatedNumber';
import { GameIcon, iconSrc } from './GameIcon';

/**
 * 系统爽文的两个「大时刻」——都是分段演出，而不是一张静态卡：
 *   CritShow   消费返现暴击：叮 → 倍率滚动 → 印章砸下（震屏）→ 金额从 0 滚到到账数 + 金币雨
 *   TierUpShow 阶层晋升：光柱 → 旧阶层褪去 → 新阶层印章落下 → 解锁清单逐条亮起
 * 轻触任意处跳到下一段 / 关闭。
 */

const Rays: React.FC<{ color?: string; speed?: number; opacity?: number }> = ({ color = 'rgba(255,226,160,0.3)', speed = 24, opacity = 0.6 }) => (
  <motion.div
    aria-hidden
    className="absolute left-1/2 top-1/2 w-[860px] h-[860px] -ml-[430px] -mt-[430px] pointer-events-none"
    style={{
      opacity,
      background: `repeating-conic-gradient(${color} 0deg 7deg, transparent 7deg 20deg)`,
      maskImage: 'radial-gradient(circle, #000, transparent 58%)',
      WebkitMaskImage: 'radial-gradient(circle, #000, transparent 58%)',
    }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: speed, ease: 'linear' }}
  />
);

/** Coins raining from the top edge. */
const CoinRain: React.FC<{ count?: number }> = ({ count = 22 }) => {
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i * 37) % 100,
        delay: (i % 7) * 0.09 + Math.floor(i / 7) * 0.18,
        size: 20 + ((i * 13) % 16),
        spin: (i % 2 ? 1 : -1) * (180 + ((i * 47) % 260)),
        dur: 1.1 + ((i * 17) % 9) / 10,
      })),
    [count],
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c, i) => (
        <motion.img
          key={i}
          src={iconSrc('cash')}
          alt=""
          className="absolute -top-10 drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)]"
          style={{ left: `${c.x}%`, width: c.size, height: c.size }}
          initial={{ y: -40, rotate: 0, opacity: 0 }}
          animate={{ y: 900, rotate: c.spin, opacity: [0, 1, 1, 0.8] }}
          transition={{ delay: c.delay, duration: c.dur, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
};

export const CritShow: React.FC<{ multiplier: number; amount: number; subtitle?: string; onClose: () => void }> = ({
  multiplier,
  amount,
  subtitle,
  onClose,
}) => {
  // 0 叮 · 1 倍率滚动 · 2 印章落下 · 3 金额到账
  const [stage, setStage] = useState(0);
  const [rolled, setRolled] = useState(1);
  const skipped = useRef(false);

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];
    const up = (n: number) => setStage((s) => Math.max(s, n));
    ts.push(setTimeout(() => up(1), 420));
    // decelerating slot roll ×1 → ×N
    const steps = Math.max(1, multiplier - 1);
    let at = 420;
    for (let k = 1; k <= steps; k += 1) {
      at += 60 + (k / steps) * 120;
      const val = k + 1;
      ts.push(
        setTimeout(() => {
          if (skipped.current) return;
          setRolled((r) => Math.max(r, val));
          playRollTick(k);
        }, at),
      );
    }
    ts.push(
      setTimeout(() => {
        if (skipped.current) return;
        up(2);
        playStamp();
      }, at + 160),
    );
    ts.push(
      setTimeout(() => {
        if (skipped.current) return;
        up(3);
        playCritExplosion();
        ts.push(setTimeout(() => {
          if (!skipped.current) playCoinBurst();
        }, 300));
      }, at + 620),
    );
    return () => ts.forEach(clearTimeout);
  }, [multiplier]);

  const advance = () => {
    playTap();
    if (stage < 3) {
      skipped.current = true;
      setRolled(multiplier);
      setStage(3);
      playCritExplosion();
    } else onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={stage === 2 ? { opacity: 1, x: [0, -12, 10, -6, 4, 0] } : { opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: stage === 2 ? 0.4 : 0.2 }}
      onClick={advance}
      className="absolute inset-0 z-[70] flex items-center justify-center px-8 cursor-pointer overflow-hidden backdrop-blur-md"
      style={{ background: 'radial-gradient(70% 55% at 50% 45%, rgba(40,26,6,0.9), rgba(3,5,12,0.97))' }}
    >
      {stage >= 2 && <Rays />}
      {stage >= 2 && (
        <motion.div
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,244,214,0.85),transparent_65%)] pointer-events-none"
        />
      )}
      {stage >= 3 && <CoinRain />}

      <div className="relative w-full text-center">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="cyan-glow-text text-[11px] font-black tracking-[0.5em]">
          叮！天枢 · 消费返现协议
        </motion.div>

        <div className="h-[92px] flex items-center justify-center mt-3">
          {stage === 1 && (
            <motion.div
              key={rolled}
              initial={{ y: -16, opacity: 0.4 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.08 }}
              className="font-num text-[56px] font-semibold text-[#B9F6FB] leading-none drop-shadow-[0_0_14px_rgba(99,230,242,0.7)]"
            >
              ×{rolled}
            </motion.div>
          )}
          {stage >= 2 && (
            <motion.div
              initial={{ scale: 3.2, rotate: -18, opacity: 0 }}
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 560, damping: 15 }}
              className="inline-block px-4 border-[3px] border-[#FF5C7A] rounded-[8px] font-num text-[52px] font-semibold text-[#FF5C7A] leading-tight shadow-[0_0_30px_rgba(255,92,122,0.6)] bg-[#2A0812]/40"
            >
              暴击 ×{multiplier}
            </motion.div>
          )}
        </div>

        <div className="h-[150px]">
          {stage >= 3 && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="flex justify-center">
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
                  <GameIcon name="income" size={84} />
                </motion.div>
              </div>
              <div className="font-num text-[42px] font-semibold gold-gradient-text leading-none mt-1 drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)]">
                +<AnimatedNumber from={0} value={amount} duration={1100} />
              </div>
              {subtitle && <div className="text-[12.5px] text-[#E9DFC6] mt-2">{subtitle}</div>}
            </motion.div>
          )}
        </div>

        <div className="h-[34px] pt-4">
          {stage >= 3 && (
            <motion.div
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="text-[11px] text-[#C9B58A] tracking-[0.4em]"
            >
              轻触收下
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const TierUpShow: React.FC<{ fx: TierUpFx; onClose: () => void }> = ({ fx, onClose }) => {
  const [stage, setStage] = useState(0); // 0 光柱+旧阶层 · 1 新阶层印章 · 2 清单

  useEffect(() => {
    let fanfareTimer: ReturnType<typeof setTimeout> | null = null;
    const a = setTimeout(() => {
      setStage((s) => Math.max(s, 1));
      playStamp();
      fanfareTimer = setTimeout(playFanfare, 180);
    }, 900);
    const b = setTimeout(() => setStage((s) => Math.max(s, 2)), 1700);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      if (fanfareTimer) clearTimeout(fanfareTimer);
    };
  }, []);

  const advance = () => {
    playTap();
    if (stage < 2) setStage(2);
    else onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={advance}
      className="absolute inset-0 z-[72] flex items-start justify-center px-7 pt-[22%] cursor-pointer overflow-hidden backdrop-blur-md"
      style={{ background: 'radial-gradient(80% 60% at 50% 40%, rgba(30,24,10,0.95), rgba(3,5,12,0.985))' }}
    >
      {/* light pillar */}
      <motion.div
        aria-hidden
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: stage >= 1 ? 0.55 : 0.9 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-1/2 top-0 bottom-0 w-[180px] -ml-[90px] origin-bottom pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,231,176,0.35), transparent)' }}
      />
      {stage >= 1 && <Rays speed={40} opacity={0.5} />}

      <div className="relative w-full text-center">
        <div className="text-[11px] font-black tracking-[0.5em] text-[#E2BD72]">天枢 · 身价突破</div>

        <div className="relative h-[150px] mt-3 flex items-center justify-center">
          {/* old tier fades and shatters upward */}
          <motion.div
            initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            animate={stage >= 1 ? { opacity: 0, y: -40, filter: 'blur(6px)' } : { opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute font-editorial text-[30px] font-black tracking-[0.3em] text-[#8B93AD]"
          >
            {fx.fromName}
          </motion.div>
          {stage >= 1 && (
            <motion.div
              initial={{ scale: 2.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16 }}
              className="relative flex flex-col items-center"
            >
              <div className="relative">
                <motion.span
                  className="absolute inset-[-14px] rounded-full"
                  style={{ boxShadow: '0 0 40px rgba(255,220,150,0.6)' }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                <GameIcon name="crown" size={78} />
              </div>
              <div className="font-num text-[12px] text-[#E2BD72] tracking-[0.4em] mt-1">TIER {fx.toTier}</div>
              <div className="font-editorial text-[38px] font-black tracking-[0.22em] gold-gradient-text leading-tight drop-shadow-[0_4px_14px_rgba(0,0,0,0.9)]">
                {fx.toName}
              </div>
            </motion.div>
          )}
        </div>

        <div className="min-h-[170px] mt-4">
          {stage >= 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="text-[12.5px] text-[#E9DFC6] leading-relaxed">
                恭喜宿主身价达到 <span className="font-num text-[#FFE7B0]">{formatMoney(fx.netWorth)}</span>
                <br />
                海城对你的称呼，从今天起不一样了。
              </div>
              {fx.unlocks.length > 0 && (
                <div className="mx-auto max-w-[280px] space-y-1.5">
                  {fx.unlocks.map((u, i) => (
                    <motion.div
                      key={u}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.12 }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] text-[12px] text-[#FBF1D8] text-left"
                      style={{ background: 'linear-gradient(90deg, rgba(226,189,114,0.22), rgba(226,189,114,0.02))', borderLeft: '2px solid #E2BD72' }}
                    >
                      <GameIcon name="key" size={18} shadow={false} /> {u}
                    </motion.div>
                  ))}
                </div>
              )}
              {fx.nextName && fx.nextAt ? (
                <div className="text-[10.5px] text-[#8B93AD]">
                  下一阶层「{fx.nextName}」· 身价 {formatMoney(fx.nextAt)}
                </div>
              ) : null}
              <motion.div
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="pt-2 text-[11px] text-[#C9B58A] tracking-[0.4em]"
              >
                轻触继续
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
