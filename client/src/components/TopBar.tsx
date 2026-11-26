import React from 'react';
import { Mail, Plus, Zap } from 'lucide-react';
import { playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { AnimatedNumber } from './AnimatedNumber';
import { PortraitAvatar } from './PortraitAvatar';

interface TopBarProps {
  hidden?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ hidden = false }) => {
  const { state, setActiveTab, openProfile, setShowMail } = useGameStore();

  if (!state) return null;
  const { player, user, unreadMailCount } = state;
  const protagonistSrc =
    (state.stories?.completedEpisodes?.length || 0) >= 2
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  return (
    <header
      className={`relative shrink-0 z-30 bg-[#0A0B0E]/96 backdrop-blur-xl border-b border-white/[0.08] px-3.5 h-[56px] flex items-center justify-between gap-2 transition-all duration-300 ${
        hidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Left: Framed Protagonist Identity (Taps cleanly to Personal Profile / TianShu) */}
      <button
        onClick={() => {
          playTap();
          openProfile('tasks');
        }}
        className="flex items-center gap-2.5 min-w-0 text-left group active:opacity-80 transition"
      >
        <div className="relative w-10 h-10 shrink-0 border border-[#CFB073]/55 bg-[#121319] p-[1.5px]">
          <PortraitAvatar src={protagonistSrc} alt={user.nickname} className="w-full h-full" rounded="sm" />
          <span className="absolute -bottom-1 -right-1 px-1 bg-[#141310] border border-[#CFB073]/65 text-[8.5px] font-bold text-[#EBD4A2] leading-tight tabular-nums">
            {player.sysLevel}
          </span>
        </div>
        <div className="min-w-0 leading-tight">
          <div className="font-editorial text-[14px] font-bold text-[#F3F0E8] truncate max-w-[104px] tracking-wide">
            {user.nickname}
          </div>
          <div className="text-[10px] text-[#CFB073] truncate max-w-[104px] mt-0.5">{player.tier.name}</div>
        </div>
      </button>

      {/* Right: Clean Architectural Resource Readouts + Mail */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => {
            playTap();
            setActiveTab('assets');
          }}
          className="text-right group active:opacity-75 transition"
          title="查看资产"
        >
          <div className="text-[9px] text-[#7D818E] leading-none">流动资金</div>
          <div className="text-[12.5px] font-bold text-[#EBD4A2] leading-tight mt-0.5">
            <AnimatedNumber value={player.cash} highlightOnIncrease />
          </div>
        </button>

        <div className="w-[1px] h-5 bg-white/[0.1]" />

        <button
          onClick={() => {
            playTap();
            openProfile('mall');
          }}
          className="flex items-center gap-1 text-[11.5px] font-semibold text-[#E2E4EC] tabular-nums active:opacity-75 transition"
          title="精力与补给"
        >
          <Zap className="w-3.5 h-3.5 text-[#CFB073]" />
          <span>{player.energy}</span>
          <Plus className="w-3 h-3 text-[#8F93A0]" />
        </button>

        <button
          onClick={() => {
            playTap();
            setShowMail(true);
          }}
          className="relative w-8 h-8 flex items-center justify-center text-[#C9CCD6] hover:text-[#F3F0E8] border border-white/[0.1] bg-white/[0.03] rounded-[4px] transition active:scale-95"
          aria-label="信箱"
        >
          <Mail className="w-4 h-4" strokeWidth={1.75} />
          {unreadMailCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#D95B78] ring-2 ring-[#0A0B0E]" />
          )}
        </button>
      </div>
    </header>
  );
};
