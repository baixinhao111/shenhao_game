import React from 'react';
import { motion } from 'framer-motion';

/**
 * 产业天际线：每家产业是江边的一栋楼。
 *  - 楼高 = 等级（未收购是一栋虚线轮廓，未解锁几乎看不见）
 *  - 亮着的窗户越多 = 等级越高；顶上信标：红色闪 = 有经营事件，绿色 = 金库已满
 *  - 点楼 = 选中下方的产业详情。水面倒影只是氛围。
 */

const SHORT: Record<string, string> = {
  retail: '茶饮',
  entertainment: '电竞',
  antique: '古玩',
  media: '传媒',
  hospitality: '酒店',
  finance: '量化',
};

/** roof silhouettes, picked by category so the skyline isn't a row of identical boxes */
const ROOF: Record<string, string> = {
  retail: 'polygon(0 14%, 50% 0, 100% 14%, 100% 100%, 0 100%)',
  entertainment: 'polygon(0 8%, 30% 8%, 30% 0, 70% 0, 70% 8%, 100% 8%, 100% 100%, 0 100%)',
  antique: 'polygon(0 12%, 12% 4%, 50% 0, 88% 4%, 100% 12%, 100% 100%, 0 100%)',
  media: 'polygon(0 0, 100% 6%, 100% 100%, 0 100%)',
  hospitality: 'polygon(0 10%, 20% 4%, 50% 0, 80% 4%, 100% 10%, 100% 100%, 0 100%)',
  finance: 'polygon(42% 0, 58% 0, 58% 6%, 100% 10%, 100% 100%, 0 100%, 0 10%, 42% 6%)',
};

/** silhouette height at Lv1 by category, so the skyline has rhythm even before upgrades */
const BASE: Record<string, number> = { retail: 50, entertainment: 66, antique: 44, media: 84, hospitality: 74, finance: 96 };

/** deterministic 0..1 noise so window patterns don't flicker between renders */
const noise = (a: number, b: number, c: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

const Windows: React.FC<{ h: number; w: number; lit: number; seed: number }> = ({ h, w, lit, seed }) => {
  const rows = Math.floor((h - 14) / 8);
  const cols = Math.max(2, Math.floor((w - 6) / 7));
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = noise(seed, r, c) < lit;
      if (!on) continue;
      out.push(
        <span
          key={`${r}-${c}`}
          className="absolute"
          style={{
            bottom: 5 + r * 8,
            left: 4 + c * ((w - 8) / cols),
            width: 3,
            height: 4,
            background: noise(seed + 9, r, c) < 0.18 ? 'rgba(170,210,255,0.75)' : 'rgba(255,224,170,0.85)',
          }}
        />,
      );
    }
  return <>{out}</>;
};

const H = 176; // scene height
const WATER = 34; // waterline height from bottom

export const BizSkyline: React.FC<{ businesses: any[]; tier: number; selectedId: string; onSelect: (id: string) => void }> = ({ businesses, tier, selectedId, onSelect }) => {
  const maxLv = Math.max(5, ...businesses.map((b) => b.level || 0));
  return (
    <div className="relative -mx-3 overflow-hidden" style={{ height: H }}>
      {/* moon */}
      <span className="absolute right-[14%] top-4 w-[14px] h-[14px] rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #F3EAD6, #A89B80)', boxShadow: '0 0 18px rgba(243,234,214,0.35)', zIndex: 1 }} />
      {/* sky + far city haze */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #04050A 0%, #0A0E1C 55%, #121828 78%, #04050A 100%)' }} />
      <div
        className="absolute inset-x-0 opacity-50"
        style={{
          bottom: WATER,
          height: 46,
          background:
            'linear-gradient(90deg, transparent, rgba(30,36,56,0.9) 10%, rgba(24,30,48,0.9) 30%, rgba(34,40,60,0.9) 55%, rgba(22,28,44,0.9) 80%, transparent)',
          clipPath: 'polygon(0 60%, 6% 40%, 9% 55%, 15% 20%, 19% 50%, 27% 35%, 33% 60%, 41% 25%, 47% 45%, 55% 10%, 60% 40%, 68% 30%, 74% 55%, 82% 20%, 88% 45%, 94% 35%, 100% 55%, 100% 100%, 0 100%)',
        }}
      />
      {/* waterline + reflection glow */}
      <div className="absolute inset-x-0 bottom-0" style={{ height: WATER, background: 'linear-gradient(180deg, rgba(217,196,154,0.08), #04050A 80%)' }} />
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D9C49A]/50 to-transparent" style={{ bottom: WATER }} />

      <div className="absolute inset-x-3 flex items-end justify-around" style={{ bottom: WATER, top: 10 }}>
        {businesses.map((b, i) => {
          const locked = !b.owned && tier < b.unlockTier;
          const sel = b.id === selectedId;
          const lv = b.owned ? b.level : 0;
          const base = BASE[b.category] ?? 60;
          const h = b.owned ? base + (lv / maxLv) * 44 : base * 0.9;
          const w = 32 + (i % 3) * 5;
          const lit = b.owned ? Math.min(0.9, 0.3 + lv * 0.08) : 0;
          const full = b.owned && b.pendingHours >= 11.95;
          return (
            <button key={b.id} onClick={() => onSelect(b.id)} className="relative flex flex-col items-center justify-end h-full" style={{ width: `${100 / businesses.length}%` }}>
              {/* beacon */}
              {(b.activeEvent || full || sel) && (
                <motion.span
                  className="absolute rounded-full"
                  style={{
                    bottom: h + 6,
                    width: 6,
                    height: 6,
                    background: b.activeEvent ? '#FF6B86' : full ? '#7BE0A8' : '#EADBB8',
                    boxShadow: `0 0 10px ${b.activeEvent ? '#FF6B86' : full ? '#7BE0A8' : '#EADBB8'}`,
                  }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: b.activeEvent ? 0.9 : 2 }}
                />
              )}
              <motion.span
                initial={false}
                animate={{ height: h }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
                className="relative block"
                style={{
                  width: w,
                  clipPath: ROOF[b.category] || ROOF.media,
                  background: locked
                    ? 'rgba(60,66,84,0.18)'
                    : b.owned
                      ? 'linear-gradient(180deg, #1E2438, #0A0D16)'
                      : 'linear-gradient(180deg, rgba(40,46,64,0.5), rgba(16,20,30,0.5))',
                  boxShadow: sel ? 'inset 0 0 0 1.5px rgba(234,219,184,0.95)' : b.owned ? 'inset 0 0 0 1px rgba(217,196,154,0.35)' : 'inset 0 0 0 1px rgba(160,166,184,0.25)',
                  filter: sel ? 'drop-shadow(0 0 10px rgba(234,219,184,0.45))' : undefined,
                }}
              >
                {b.owned && <Windows h={h} w={w} lit={lit} seed={i + 1} />}
              </motion.span>
              {/* reflection */}
              <span
                className="absolute top-full mt-px block opacity-25 pointer-events-none"
                style={{
                  width: w,
                  height: Math.min(WATER - 4, h * 0.4),
                  background: b.owned ? `linear-gradient(180deg, rgba(255,226,170,${lit * 0.6}), transparent)` : 'linear-gradient(180deg, rgba(120,126,140,0.3), transparent)',
                  filter: 'blur(1.5px)',
                }}
              />
              <span
                className="absolute top-full mt-2 flex flex-col items-center leading-none whitespace-nowrap"
                style={{ zIndex: 2 }}
              >
                <span className={`text-[10.5px] font-editorial font-black ${sel ? 'text-[var(--ivory-2)]' : locked ? 'text-[#666A7E]' : 'text-[#9A9EAE]'}`}>{SHORT[b.category] || b.name.slice(0, 2)}</span>
                <span className={`mt-1 font-num text-[10px] ${b.owned ? 'text-[var(--champagne)]' : 'text-[#7C8093]'}`}>{b.owned ? `Lv${lv}` : locked ? '未解锁' : '可收购'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
