import React from 'react';
import { Plus } from 'lucide-react';
import { playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { AnimatedNumber } from './AnimatedNumber';
import { GameIcon, iconSrc } from './GameIcon';

interface TopBarProps {
  hidden?: boolean;
}

/** Round gold-ringed player avatar with hex level badge — shared by TopBar and Home header */
export const PlayerEmblem: React.FC<{ src: string; level: number; size?: number; dot?: boolean }> = ({
  src,
  level,
  size = 44,
  dot = false,
}) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <div
      className="absolute inset-0 rounded-full p-[2px]"
      style={{
        background: 'conic-gradient(from 200deg, #FFE7B0, #A07C3E, #FFE7B0, #B7843A, #FFE7B0)',
        boxShadow: '0 0 0 1px rgba(10,15,31,0.9), 0 4px 14px rgba(0,0,0,0.6), 0 0 12px rgba(226,189,114,0.25)',
      }}
    >
      <div className="w-full h-full rounded-full overflow-hidden bg-[#1A2344]">
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover object-[50%_8%] scale-[1.9] origin-[50%_6%] select-none pointer-events-none"
        />
      </div>
    </div>
    <div
      className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center"
      style={{ width: Math.max(22, size * 0.5), height: Math.max(22, size * 0.5) }}
    >
      <img src={iconSrc('badge')} alt="" className="absolute inset-0 w-full h-full object-contain" />
      <span className="relative font-num text-[11px] font-semibold text-[#FFE7B0] leading-none mt-[1px]">{level}</span>
    </div>
    {dot && <span className="red-dot -top-0.5 -right-0.5" />}
  </div>
);

export const ResourceCapsules: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { state, setActiveTab, openProfile } = useGameStore();
  if (!state) return null;
  const { player } = state;
  return (
    <div className={`flex items-center ${compact ? 'gap-3.5' : 'gap-4'}`}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          playTap();
          setActiveTab('assets');
        }}
        className="res-capsule active:scale-95 transition"
        title="流动资金"
      >
        <GameIcon name="cash" size={30} className="res-icon" shadow={false} />
        <span className="font-num text-[13px] font-semibold text-[#FFE7B0] min-w-[44px] text-right">
          <AnimatedNumber value={player.cash} highlightOnIncrease />
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          playTap();
          openProfile('mall');
        }}
        className="res-capsule active:scale-95 transition"
        title="精力"
      >
        <GameIcon name="energy" size={28} className="res-icon" shadow={false} />
        <span className="font-num text-[13px] font-semibold text-[#F4EFE4] min-w-[22px] text-right">
          {player.energy}
        </span>
        <span className="res-plus">
          <Plus className="w-3 h-3" strokeWidth={3} />
        </span>
      </button>
    </div>
  );
};

export const TopBar: React.FC<TopBarProps> = ({ hidden = false }) => {
  const { state, openProfile, setShowMail } = useGameStore();

  if (!state) return null;
  const { player, user, unreadMailCount } = state;
  const protagonistSrc =
    (state.stories?.completedEpisodes?.length || 0) >= 2
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  return (
    <header
      className={`relative shrink-0 z-30 px-3 h-[60px] flex items-center justify-between gap-2 transition-all duration-300 ${
        hidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
      style={{
        background: 'linear-gradient(180deg, rgba(20,28,56,0.98) 0%, rgba(11,16,33,0.98) 100%)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      }}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#E2BD72]/55 to-transparent" />

      <button
        onClick={() => {
          playTap();
          openProfile('tasks');
        }}
        className="flex items-center gap-2.5 min-w-0 text-left active:opacity-80 transition"
      >
        <PlayerEmblem src={protagonistSrc} level={player.sysLevel} size={40} />
        <div className="min-w-0 leading-tight">
          <div className="font-editorial text-[14px] font-black text-[#F8EBCB] truncate max-w-[92px]">
            {user.nickname}
          </div>
          <div className="text-[10px] text-[#E2BD72] truncate max-w-[92px] mt-0.5 tracking-wider">
            {player.tier.name}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2.5 shrink-0">
        <ResourceCapsules compact />
        <button
          onClick={() => {
            playTap();
            setShowMail(true);
          }}
          className="relative w-9 h-9 flex items-center justify-center active:scale-90 transition"
          aria-label="信箱"
        >
          <GameIcon name="mail" size={32} />
          {unreadMailCount > 0 && <span className="red-dot top-0 right-0" />}
        </button>
      </div>
    </header>
  );
};
