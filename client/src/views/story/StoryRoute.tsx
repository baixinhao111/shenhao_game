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
}

/** gated = the very next chapter, waiting only on net worth */
type NodeState = 'done' | 'current' | 'gated' | 'locked';

const xOf = (i: number) => (i % 2 === 0 ? 24 : 76);
const yOf = (i: number) => TOP + i * ROW;

export const StoryRoute: React.FC<Props> = ({ vol, kicker, name, episodes, completed, netWorth, onOpen }) => {
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1F]/70 via-[#0A0F1F]/20 to-[#0A0F1F]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0F1F]/85 via-transparent to-transparent" />
        <div className="absolute left-5 bottom-3">
          {kicker && <div className="text-[11px] tracking-[0.6em] text-[#E2BD72] font-bold">{kicker}</div>}
          <div className="font-editorial text-[42px] leading-none font-black tracking-[0.28em] gold-gradient-text drop-shadow-[0_4px_14px_rgba(0,0,0,0.9)] mt-1">
            {name}
          </div>
          {vol.subtitle && <div className="text-[11px] text-[#C3C9DC] mt-2 max-w-[240px] truncate text-stroke-dark">{vol.subtitle}</div>}
        </div>
        <div className="absolute right-5 bottom-4 text-right">
          <div className="font-num leading-none text-stroke-dark">
            <span className="text-[30px] text-[#FFE7B0]">{doneCount}</span>
            <span className="text-[14px] text-[#A3AAC2]"> / {episodes.length}</span>
          </div>
          <div className="mt-1.5 flex justify-end gap-[3px]">
            {states.map((s, i) => (
              <span key={i} className={`w-[5px] h-[5px] rotate-45 ${s === 'done' ? 'bg-[#E2BD72]' : s === 'current' ? 'bg-[#FFE7B0] animate-pulse' : 'bg-white/15'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* ---------- route ---------- */}
      <div className="relative" style={{ height }}>
        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`rt-${vol.volumeId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#FFE7B0" />
              <stop offset="100%" stopColor="#B7843A" />
            </linearGradient>
          </defs>
          {/* lead-in from the masthead */}
          <path d={`M ${xOf(0)} 0 L ${xOf(0)} ${yOf(0)}`} stroke="#E2BD72" strokeOpacity={0.5} strokeWidth={1.5} vectorEffect="non-scaling-stroke" fill="none" />
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
                  <path d={d} stroke="#FFE7B0" strokeOpacity={0.25} strokeWidth={7} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" />
                )}
                <path
                  d={d}
                  stroke={lit ? `url(#rt-${vol.volumeId})` : 'rgba(160,178,230,0.32)'}
                  strokeWidth={lit ? 2 : 1.5}
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
                  WebkitTextStroke: '1px rgba(226,189,114,0.14)',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* medallion */}
              <span className="absolute" style={{ left: `${xOf(i)}%`, top: 0, width: size, height: size, marginLeft: -size / 2 }}>
                {st === 'current' && (
                  <motion.span
                    className="absolute -inset-3 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(255,231,176,0.35), transparent 70%)' }}
                    animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2.4 }}
                  />
                )}
                <span
                  className="absolute inset-0 rounded-full p-[2.5px]"
                  style={{
                    background:
                      st === 'gated'
                        ? 'repeating-conic-gradient(#E2BD72 0deg 14deg, rgba(226,189,114,0.15) 14deg 24deg)'
                        : st === 'locked'
                        ? 'rgba(107,115,146,0.55)'
                        : st === 'current'
                          ? 'conic-gradient(from 200deg, #FFF6DC, #B7843A, #FFE7B0, #8A6428, #FFF6DC)'
                          : 'linear-gradient(160deg,#FFE7B0,#9A7434)',
                    boxShadow: st === 'current' ? '0 0 22px rgba(255,220,150,0.55)' : '0 6px 14px rgba(0,0,0,0.6)',
                  }}
                >
                  <span className="relative block w-full h-full rounded-full overflow-hidden bg-[#0A0F1F]">
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
                  <span className="absolute -right-1 -bottom-1 w-[22px] h-[22px] rounded-full bg-[#0A0F1F] border border-[#E2BD72] flex items-center justify-center font-editorial text-[11px] font-black text-[#E2BD72] rotate-[-12deg]">
                    阅
                  </span>
                )}
                {st === 'gated' && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-2 py-[1px] rounded-full text-[10px] font-bold text-[#B9F6FB] bg-[#04121F] border border-[#63E6F2]/60 whitespace-nowrap">
                    下一站
                  </span>
                )}
                {st === 'current' && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-2.5 py-[1px] rounded-full text-[10.5px] font-editorial font-black text-[#1E1506] bg-gradient-to-b from-[#FFF0C8] to-[#D6A85A] shadow-[0_3px_8px_rgba(0,0,0,0.5)] whitespace-nowrap">
                    继续
                  </span>
                )}
              </span>

              {/* text, set straight onto the page */}
              <span
                className={`absolute top-0 flex flex-col ${left ? 'items-start text-left' : 'items-end text-right'}`}
                style={left ? { left: `calc(${xOf(i)}% + ${size / 2 + 14}px)`, right: '5%' } : { right: `calc(${100 - xOf(i)}% + ${size / 2 + 14}px)`, left: '5%' }}
              >
                <span className={`text-[10px] tracking-[0.3em] ${st === 'locked' ? 'text-[#7F88A6]' : 'text-[#E2BD72]'}`}>{ep.chapterTitle}</span>
                <span
                  className={`font-editorial font-black leading-tight mt-0.5 ${st === 'current' ? 'text-[19px] gold-gradient-text' : st === 'locked' ? 'text-[16px] text-[#A3AAC2]' : 'text-[16px] text-[#FBF1D8]'}`}
                >
                  {ep.title}
                </span>
                <span className={`text-[11px] leading-snug mt-1 line-clamp-2 ${st === 'locked' ? 'text-[#737C99]' : 'text-[#9AA2BC]'}`}>{ep.summary}</span>
                {nwShort && (
                  <span className="mt-1 text-[10.5px] text-[#FF8FA6] font-num">身价 {formatMoney(ep.requireNetWorth)} 开启</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
