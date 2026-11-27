import React from 'react';

/**
 * 质感层 v2 的通用组件。
 *  <Atmosphere/>  整页氛围：角落香槟漏光 + 冷色底光 + 胶片颗粒 + 稀疏碎光（不拦截点击）
 *  <EdgeLabel/>   屏幕边缘的竖排微标（装饰性信息，不承载功能）
 *  <Watermark/>   超大半透明描边水印字
 *  <Masthead/>    中文标题 + 英文小标签的标题组
 */

const MOTES = [
  { l: '12%', t: '18%', d: '0s', s: 2 },
  { l: '78%', t: '9%', d: '1.8s', s: 3 },
  { l: '88%', t: '34%', d: '3.1s', s: 2 },
  { l: '23%', t: '57%', d: '2.4s', s: 2 },
  { l: '64%', t: '71%', d: '0.9s', s: 3 },
  { l: '40%', t: '88%', d: '4s', s: 2 },
];

export const Atmosphere: React.FC<{ tone?: 'amber' | 'cool'; className?: string }> = ({ tone = 'amber', className = '' }) => (
  <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
    {/* light leak, top-right */}
    <div
      className="absolute -top-24 -right-20 w-[360px] h-[300px] rounded-full blur-2xl"
      style={{
        background:
          tone === 'amber'
            ? 'radial-gradient(closest-side, rgba(226,186,128,0.22), rgba(170,120,80,0.08) 55%, transparent)'
            : 'radial-gradient(closest-side, rgba(150,175,230,0.18), transparent)',
        animation: 'leakDrift 14s ease-in-out infinite',
      }}
    />
    {/* cool floor light, bottom-left */}
    <div
      className="absolute -bottom-28 -left-24 w-[340px] h-[260px] rounded-full blur-2xl"
      style={{ background: 'radial-gradient(closest-side, rgba(70,92,160,0.16), transparent)' }}
    />
    <div className="absolute inset-0 film-grain" />
    {MOTES.map((m, i) => (
      <span
        key={i}
        className="absolute rounded-full"
        style={{
          left: m.l,
          top: m.t,
          width: m.s,
          height: m.s,
          background: 'rgba(255,236,200,0.9)',
          boxShadow: '0 0 6px rgba(255,226,170,0.8)',
          animation: `motePulse 5s ease-in-out ${m.d} infinite`,
        }}
      />
    ))}
  </div>
);

export const EdgeLabel: React.FC<{ text: string; side?: 'left' | 'right'; top?: string }> = ({ text, side = 'right', top = '22%' }) => (
  <span
    aria-hidden
    className="absolute pointer-events-none font-num text-[8px] tracking-[0.5em] text-white/[0.18] whitespace-nowrap"
    style={{
      top,
      [side]: 4,
      writingMode: 'vertical-rl',
      transform: side === 'left' ? 'rotate(180deg)' : undefined,
    }}
  >
    {text}
  </span>
);

export const Watermark: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span
    aria-hidden
    className={`absolute pointer-events-none select-none font-num font-semibold leading-none whitespace-nowrap ${className}`}
    style={{ color: 'transparent', WebkitTextStroke: '1px rgba(236,230,218,0.06)' }}
  >
    {text}
  </span>
);

export const Masthead: React.FC<{ zh: string; en: string; className?: string; size?: number }> = ({ zh, en, className = '', size = 26 }) => (
  <div className={className}>
    <div className="label-en">{en}</div>
    <div className="font-editorial font-black ink-title leading-none mt-1.5 tracking-[0.18em]" style={{ fontSize: size }}>
      {zh}
    </div>
  </div>
);
