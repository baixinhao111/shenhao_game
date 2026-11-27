import React from 'react';
import { motion } from 'framer-motion';
import { GameIcon } from '../../components/GameIcon';
import { formatMoney } from '../../lib/format';

/**
 * 主线章节「航线图」：一卷一张。
 * 卷首是出血到屏幕边缘的卷封面 + 大号书法标题；下面每一幕是一枚圆形徽章，
 * 沿一条左右摆动的金线串起来（已读段是亮金实线，未读段是暗色虚线）。
 * 文字直接排在画面上，不再用卡片框。
 */

const ROW = 124; // vertical distance between nodes
const TOP = 54;

interface Props {
  vol: any;
  kicker: string;
  name: string;
  episodes: any[];
  completed: Set<string>;
  netWorth: number;
  onOpen: (ep: any) => void;
  volIndex: number;
}

/** gated = the very next chapter, waiting only on net worth */
type NodeState = 'done' | 'current' | 'gated' | 'locked';

const xOf = (i: number) => (i % 2 === 0 ? 24 : 76);
const yOf = (i: number) => TOP + i * ROW;

export const StoryRoute: React.FC<Props> = ({ vol, kicker, name, episodes, completed, netWorth, onOpen, volIndex }) => {
  const states: NodeState[] = episodes.map((ep) => {
    if (completed.has(ep.episodeId)) return 'done';
    const prereq = !ep.requireEpisode || completed.has(ep.requireEpisode);
    const nw = !ep.requireNetWorth || netWorth >= ep.requireNetWorth;
    if (prereq && nw) return 'current';
    return prereq ? 'gated' : 'locked';
  });
  const doneCount = states.filter((s) => s === 'done').length;
  const height = TOP + (episodes.length - 1) * ROW + 70;

  return (
    <section className="relative">
      {/* ---------- masthead: cover art bleeds to the edges and dissolves into the page ---------- */}
      <div className="relative h-[176px] -mx-3 overflow-hidden">
        <img src={vol.cover || episodes[0]?.bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#04050A]/75 via-[#04050A]/25 to-[#04050A]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04050A]/90 via-[#04050A]/20 to-transparent" />
        <div className="absolute left-5 bottom-3">
          <div className="label-en">{volIndex === 0 ? 'PROLOGUE' : `VOLUME ${String(volIndex).padStart(2, '0')}`}{kicker ? ` · ${kicker}` : ''}</div>
          <div className="font-editorial text-[40px] leading-none font-black tracking-[0.3em] ink-title mt-2">{name}</div>
          {vol.subtitle && <div className="text-[11px] text-[#8C90A0] mt-2 max-w-[240px] truncate">{vol.subtitle}</div>}
        </div>
        <div className="absolute right-5 bottom-4 text-right">
          <div className="font-num leading-none">
            <span className="text-[30px] text-[var(--ivory-2)]">{doneCount}</span>
            <span className="text-[13px] text-[#6D7183]"> / {episodes.length}</span>
          </div>
          <div className="mt-1.5 flex justify-end gap-[3px]">
            {states.map((s, i) => (
              <span key={i} className={`w-[4px] h-[4px] rotate-45 ${s === 'done' ? 'bg-[var(--champagne)]' : s === 'current' ? 'bg-[var(--ivory-2)] animate-pulse' : 'bg-white/12'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* ---------- route ---------- */}
      <div className="relative" style={{ height }}>
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`rt-${vol.volumeId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#E6D6B2" />
              <stop offset="100%" stopColor="#9C8660" />
            </linearGradient>
          </defs>
          {/* lead-in from the masthead */}
          <path d={`M ${xOf(0)} 0 L ${xOf(0)} ${yOf(0)}`} stroke="#D9C49A" strokeOpacity={0.35} strokeWidth={1.5} vectorEffect="non-scaling-stroke" fill="none" />
          {episodes.slice(0, -1).map((_, i) => {
            const x1 = xOf(i);
            const y1 = yOf(i);
            const x2 = xOf(i + 1);
            const y2 = yOf(i + 1);
            const d = `M ${x1} ${y1} C ${x1} ${y1 + ROW * 0.62}, ${x2} ${y2 - ROW * 0.62}, ${x2} ${y2}`;
            const lit = states[i] === 'done';
            return (
              <g key={i}>
                {lit && (
                  <path d={d} stroke="#E6D6B2" strokeOpacity={0.12} strokeWidth={6} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" />
                )}
                <path
                  d={d}
                  stroke={lit ? `url(#rt-${vol.volumeId})` : 'rgba(200,205,220,0.2)'}
                  strokeWidth={lit ? 1.5 : 1}
                  strokeDasharray={lit ? undefined : '3 6'}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                />
              </g>
            );
          })}
        </svg>

        {episodes.map((ep, i) => {
          const st = states[i];
          const left = xOf(i) < 50;
          const size = st === 'current' ? 76 : st === 'gated' ? 66 : st === 'done' ? 58 : 52;
          const nwShort = Number(ep.requireNetWorth) > 0 && st !== 'done' && netWorth < ep.requireNetWorth;
          return (
            <button
              key={ep.episodeId}
              onClick={() => onOpen(ep)}
              className="absolute inset-x-0 text-left active:scale-[0.99] transition"
              style={{ top: yOf(i) - size / 2, height: Math.max(size, 80) }}
            >
              {/* ghost numeral */}
              <span
                className="absolute font-num text-[64px] leading-none font-semibold pointer-events-none select-none"
                style={{
                  top: -8,
                  [left ? 'right' : 'left']: '6%',
                  color: 'transparent',
                  WebkitTextStroke: '1px rgba(236,230,218,0.07)',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* medallion */}
              <span className="absolute" style={{ left: `${xOf(i)}%`, top: 0, width: size, height: size, marginLeft: -size / 2 }}>
                {st === 'current' && (
                  <motion.span
                    className="absolute -inset-3 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(230,214,178,0.22), transparent 70%)' }}
                    animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2.4 }}
                  />
                )}
                <span
                  className="absolute inset-0 rounded-full p-[1.5px]"
                  style={{
                    background:
                      st === 'gated'
                        ? 'repeating-conic-gradient(rgba(217,196,154,0.8) 0deg 12deg, rgba(217,196,154,0.1) 12deg 22deg)'
                        : st === 'locked'
                        ? 'rgba(120,124,140,0.35)'
                        : st === 'current'
                          ? 'conic-gradient(from 200deg, #F3EAD6, #9C8660, #E6D6B2, #7A6848, #F3EAD6)'
                          : 'rgba(217,196,154,0.7)',
                    boxShadow: st === 'current' ? '0 0 26px rgba(230,214,178,0.28), 0 10px 20px rgba(0,0,0,0.6)' : '0 8px 16px rgba(0,0,0,0.6)',
                  }}
                >
                  <span className="relative block w-full h-full rounded-full overflow-hidden bg-[#05070D]">
                    <img src={ep.bg} alt="" className={`w-full h-full object-cover ${st === 'locked' ? 'grayscale brightness-[0.35]' : st === 'gated' ? 'brightness-[0.5] saturate-[0.6]' : st === 'done' ? 'brightness-[0.85]' : ''}`} />
                    {ep.posterLead && st !== 'locked' && (
                      <img src={ep.posterLead} alt="" className="absolute left-1/2 -translate-x-1/2 bottom-[-12%] h-[120%] w-auto object-contain" />
                    )}
                    {(st === 'locked' || st === 'gated') && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <GameIcon name="lock" size={22} />
                      </span>
                    )}
                  </span>
                </span>
                {st === 'done' && (
                  <span className="absolute -right-1 -bottom-1 w-[20px] h-[20px] rounded-full bg-[#04050A] border border-[var(--champagne-dim)] flex items-center justify-center font-editorial text-[10px] font-black text-[var(--champagne)] rotate-[-12deg]">
                    阅
                  </span>
                )}
                {st === 'gated' && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-2 py-[1px] rounded-full text-[10px] font-bold text-[#B9F6FB] bg-[#04121F] border border-[#63E6F2]/60 whitespace-nowrap">
                    下一站
                  </span>
                )}
                {st === 'current' && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-2.5 py-[1px] text-[10px] btn-champagne font-editorial whitespace-nowrap">
                    继续
                  </span>
                )}
              </span>

              {/* text, set straight onto the page */}
              <span
                className={`absolute top-0 flex flex-col ${left ? 'items-start text-left' : 'items-end text-right'}`}
                style={left ? { left: `calc(${xOf(i)}% + ${size / 2 + 14}px)`, right: '5%' } : { right: `calc(${100 - xOf(i)}% + ${size / 2 + 14}px)`, left: '5%' }}
              >
                <span className={`text-[10px] tracking-[0.3em] ${st === 'locked' ? 'text-[#5E6273]' : 'text-[var(--champagne-dim)]'}`}>{ep.chapterTitle}</span>
                <span
                  className={`font-editorial font-black leading-tight mt-0.5 ${st === 'current' ? 'text-[19px] ink-title' : st === 'locked' ? 'text-[16px] text-[#7C8092]' : 'text-[16px] text-[#D9D4C9]'}`}
                >
                  {ep.title}
                </span>
                <span className={`text-[11px] leading-snug mt-1 line-clamp-2 ${st === 'locked' ? 'text-[#585C6C]' : 'text-[#8C90A0]'}`}>{ep.summary}</span>
                {nwShort && (
                  <span className="mt-1 text-[10.5px] text-[#C98F9A] font-num">身价 {formatMoney(ep.requireNetWorth)} 开启</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
