import React from 'react';

/** Painted UI icon set (generated, transparent webp) living in /public/assets/ui/icons */
export type GameIconName =
  | 'cash'
  | 'energy'
  | 'syspoint'
  | 'nav_home'
  | 'nav_map'
  | 'nav_story'
  | 'nav_assets'
  | 'nav_contact'
  | 'mail'
  | 'signin'
  | 'task'
  | 'mall'
  | 'rank'
  | 'skill'
  | 'moments'
  | 'income'
  | 'key'
  | 'heart'
  | 'corner'
  | 'tianshu'
  | 'badge'
  | 'crown'
  | 'lock'
  | 'play'
  | 'champagne'
  | 'briefcase'
  | 'jade'
  | 'stocks'
  | 'race'
  | 'livestream'
  | 'cruise'
  | 'hourglass'
  | 'bell'
  | 'settings'
  | 'medal';

export const iconSrc = (name: GameIconName) => `/assets/ui/icons/${name}.webp`;

interface GameIconProps {
  name: GameIconName;
  size?: number;
  className?: string;
  alt?: string;
  shadow?: boolean;
}

export const GameIcon: React.FC<GameIconProps> = ({ name, size = 24, className = '', alt = '', shadow = true }) => (
  <img
    src={iconSrc(name)}
    alt={alt}
    width={size}
    height={size}
    draggable={false}
    className={`inline-block select-none pointer-events-none shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      filter: shadow ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' : undefined,
    }}
  />
);

/** Four-corner gold filigree overlay; place inside a `relative` container. */
export const OrnateCorners: React.FC<{ size?: number; inset?: number; className?: string }> = ({
  size = 22,
  inset = -3,
  className = '',
}) => {
  // v2: the painted filigree is retired — thin champagne L-ticks mark the corners instead
  const len = Math.max(8, Math.round(size * 0.5));
  const base: React.CSSProperties = {
    position: 'absolute',
    width: len,
    height: len,
    pointerEvents: 'none',
    zIndex: 3,
    borderColor: 'rgba(217,196,154,0.45)',
    borderStyle: 'solid',
    borderWidth: 0,
  };
  const o = Math.max(-2, inset + 2);
  return (
    <span className={className} aria-hidden>
      <span style={{ ...base, top: o, left: o, borderTopWidth: 1, borderLeftWidth: 1 }} />
      <span style={{ ...base, bottom: o, right: o, borderBottomWidth: 1, borderRightWidth: 1 }} />
    </span>
  );
};

/** ◆ 标题 ——— section header */
export const DecoHeading: React.FC<{ title: React.ReactNode; aside?: React.ReactNode; className?: string }> = ({
  title,
  aside,
  className = '',
}) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <span className="w-[5px] h-[5px] rotate-45 bg-[#D9C49A]/80 shrink-0" />
    <span className="font-editorial font-black text-[16px] text-[#ECE6DA] tracking-[0.12em] whitespace-nowrap">
      {title}
    </span>
    <span className="flex-1 h-px bg-gradient-to-r from-[#D9C49A]/25 to-transparent" />
    {aside && <span className="text-[11px] text-[#7A7E8E] whitespace-nowrap">{aside}</span>}
  </div>
);
