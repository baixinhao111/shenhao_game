import React, { useEffect, useLayoutEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatMoney } from '../lib/format';
import { recordPointer, useGameStore, type RewardFx } from '../store/useGameStore';
import { iconSrc } from './GameIcon';

/** Coins burst from where a reward happened and stream into the matching resource capsule. */
const FlyBurst: React.FC<{ fx: RewardFx }> = ({ fx }) => {
  const [geo, setGeo] = useState<null | { sx: number; sy: number; tx: number; ty: number; lx: number; ly: number }>(null);

  useLayoutEffect(() => {
    const shell = document.querySelector('[data-app-shell]') as HTMLElement | null;
    const base = shell?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const anchors = Array.from(document.querySelectorAll(`[data-fx-anchor="${fx.kind}"]`)) as HTMLElement[];
    const target = anchors.reverse().find((a) => a.offsetParent !== null);
    const tr = target?.getBoundingClientRect();
    const sx = fx.x - base.left;
    const sy = fx.y - base.top;
    setGeo({
      sx,
      sy,
      tx: tr ? tr.left + 12 - base.left : base.width - 120,
      ty: tr ? tr.top + tr.height / 2 - base.top : 28,
      lx: Math.max(88, Math.min(base.width - 88, sx)),
      ly: Math.max(48, sy - 40),
    });
  }, [fx]);

  if (!geo) return null;
  const coins = Array.from({ length: 9 }, (_, i) => {
    const angle = (i / 9) * Math.PI * 2;
    const r = 34 + (i % 3) * 14;
    return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r * 0.7 - 10, delay: i * 0.035 };
  });
  const icon = fx.kind === 'points' ? 'syspoint' : 'cash';

  return (
    <>
      {coins.map((c, i) => (
        <motion.img
          key={i}
          src={iconSrc(icon)}
          alt=""
          className="absolute w-7 h-7 -ml-3.5 -mt-3.5 drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]"
          initial={{ x: geo.sx, y: geo.sy, scale: 0.4, opacity: 0 }}
          animate={{
            x: [geo.sx, geo.sx + c.dx, geo.tx],
            y: [geo.sy, geo.sy + c.dy, geo.ty],
            scale: [0.4, 1.1, 0.55],
            opacity: [0, 1, 0.9],
          }}
          transition={{ duration: 0.95, delay: c.delay, times: [0, 0.32, 1], ease: ['easeOut', 'easeIn'] }}
        />
      ))}
      <motion.div
        className="absolute font-num text-[22px] font-semibold gold-gradient-text whitespace-nowrap drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
        style={{ left: geo.lx, top: geo.ly }}
        initial={{ opacity: 0, x: '-50%', y: 8, scale: 0.8 }}
        animate={{ opacity: [0, 1, 1, 0], x: '-50%', y: -26, scale: 1 }}
        transition={{ duration: 1.25, times: [0, 0.15, 0.7, 1] }}
      >
        +{fx.kind === 'points' ? fx.amount : formatMoney(fx.amount)}
      </motion.div>
    </>
  );
};

export const RewardFlyLayer: React.FC = () => {
  const rewardFx = useGameStore((s) => s.rewardFx);
  useEffect(() => {
    const onDown = (e: PointerEvent) => recordPointer(e.clientX, e.clientY);
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  return (
    <div className="absolute inset-0 z-[80] pointer-events-none overflow-hidden">
      {rewardFx.map((fx) => (
        <FlyBurst key={fx.id} fx={fx} />
      ))}
    </div>
  );
};
