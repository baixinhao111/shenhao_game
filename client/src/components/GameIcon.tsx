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
  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    backgroundImage: `url(${iconSrc('corner')})`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    pointerEvents: 'none',
    zIndex: 3,
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
  };
  return (
    <span className={className} aria-hidden>
      <span style={{ ...base, top: inset, left: inset }} />
      <span style={{ ...base, top: inset, right: inset, transform: 'scaleX(-1)' }} />
      <span style={{ ...base, bottom: inset, left: inset, transform: 'scaleY(-1)' }} />
      <span style={{ ...base, bottom: inset, right: inset, transform: 'rotate(180deg)' }} />
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
    <span className="w-[7px] h-[7px] rotate-45 bg-gradient-to-br from-[#FFE7B0] to-[#A07C3E] shadow-[0_0_8px_rgba(226,189,114,0.6)] shrink-0" />
    <span className="font-editorial font-black text-[16px] text-[#F8EBCB] tracking-[0.12em] whitespace-nowrap">
      {title}
    </span>
    <span className="flex-1 h-px bg-gradient-to-r from-[#E2BD72]/55 to-transparent" />
    {aside && <span className="text-[11px] text-[#8B93AD] whitespace-nowrap">{aside}</span>}
  </div>
);
