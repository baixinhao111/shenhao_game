import React from 'react';
import { motion } from 'framer-motion';
import { playTap } from '../lib/sound';
import { useGameStore, type MainTab } from '../store/useGameStore';
import { iconSrc, type GameIconName } from './GameIcon';

interface BottomNavProps {
  hidden?: boolean;
}

const TABS: Array<{ id: MainTab; label: string; icon: GameIconName }> = [
  { id: 'home', label: '邸宅', icon: 'nav_home' },
  { id: 'map', label: '海城', icon: 'nav_map' },
  { id: 'story', label: '剧情', icon: 'nav_story' },
  { id: 'assets', label: '产业', icon: 'nav_assets' },
  { id: 'heroines', label: '联系', icon: 'nav_contact' },
];

export const BottomNav: React.FC<BottomNavProps> = ({ hidden = false }) => {
  const { activeTab, showProfile, setActiveTab, state } = useGameStore();
  if (!state) return null;

  const hasPendingIncome = (state.player?.pendingIncome || 0) >= 10000;
  const nextEpObj = (() => {
    const nextId = state.stories?.nextEpisodeId;
    if (!nextId) return null;
    const vols = state.stories?.volumes || [];
    for (const v of vols) {
      const found = (v.episodes || []).find((ep: any) => ep.episodeId === nextId);
      if (found) return found;
    }
    return null;
  })();
  const hasNextStory = Boolean(
    nextEpObj && (!nextEpObj.requireNetWorth || (state.player?.netWorth || 0) >= nextEpObj.requireNetWorth),
  );
  const hasHomeNotice = !state.player?.signedInToday;

  return (
    <nav
      className={`relative shrink-0 z-30 transition-all duration-300 ${
        hidden
          ? 'max-h-0 !pb-0 opacity-0 translate-y-full overflow-hidden pointer-events-none'
          : 'max-h-[96px] pb-[max(0.35rem,env(safe-area-inset-bottom))] opacity-100 translate-y-0'
      }`}
      style={{
        background:
          'linear-gradient(180deg, rgba(10,12,20,0.97) 0%, rgba(4,5,10,0.99) 100%)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.45)',
      }}
    >
      {/* gold rail with centre diamond */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D9C49A]/35 to-transparent" />
      
      <span className="absolute left-1/2 -top-[3px] -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-[#D9C49A]/70" />

      <div className="grid grid-cols-5 px-1">
        {TABS.map(({ id, label, icon }) => {
          const active = !showProfile && activeTab === id;
          const showDot =
            (id === 'home' && !active && hasHomeNotice) ||
            (id === 'story' && !active && hasNextStory) ||
            (id === 'assets' && !active && hasPendingIncome);

          return (
            <button
              key={id}
              onClick={() => {
                playTap();
                setActiveTab(id);
              }}
              className="relative flex flex-col items-center justify-end h-[58px] pt-1"
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-glow"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-x-1 top-0 bottom-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(60% 55% at 50% 45%, rgba(217,196,154,0.16) 0%, rgba(217,196,154,0) 70%)',
                  }}
                />
              )}

              <motion.img
                src={iconSrc(icon)}
                alt=""
                draggable={false}
                animate={{ y: active ? -7 : 0, scale: active ? 1.18 : 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                className="relative w-[34px] h-[34px] select-none"
                style={{
                  filter: active
                    ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.7)) drop-shadow(0 0 8px rgba(255,220,150,0.35))'
                    : 'grayscale(0.55) brightness(0.72) drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
                }}
              />
              <span
                className={`relative text-[11px] leading-none mb-1 tracking-[0.14em] font-editorial ${
                  active ? 'font-black gold-gradient-text' : 'font-bold text-[#6D7183]'
                }`}
                style={{ marginTop: active ? -4 : 2 }}
              >
                {label}
              </span>

              {showDot && <span className="red-dot top-1.5 right-[22%]" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
