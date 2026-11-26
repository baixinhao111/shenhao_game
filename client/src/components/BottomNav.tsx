import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Building2, Compass, Home, MessageCircle } from 'lucide-react';
import { playTap } from '../lib/sound';
import { useGameStore, type MainTab } from '../store/useGameStore';

interface BottomNavProps {
  hidden?: boolean;
}

const TABS: Array<{ id: MainTab; label: string; Icon: React.ComponentType<any> }> = [
  { id: 'home', label: '邸宅', Icon: Home },
  { id: 'map', label: '海城', Icon: Compass },
  { id: 'story', label: '剧情', Icon: BookOpen },
  { id: 'assets', label: '产业', Icon: Building2 },
  { id: 'heroines', label: '联系', Icon: MessageCircle },
];

export const BottomNav: React.FC<BottomNavProps> = ({ hidden = false }) => {
  const { activeTab, showProfile, setActiveTab, state } = useGameStore();
  if (!state) return null;

  const hasPendingIncome = (state.player?.pendingIncome || 0) >= 10000;
  const hasNextStory = Boolean(state.stories?.nextEpisodeId);
  const hasHomeNotice = !state.player?.signedInToday;

  return (
    <nav
      className={`shrink-0 z-30 bg-[#0A0B0E]/96 backdrop-blur-xl border-t border-white/[0.09] px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-all duration-400 ${
        hidden ? 'opacity-0 translate-y-full pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, label, Icon }) => {
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
              className={`relative flex flex-col items-center justify-center py-1.5 transition-colors duration-200 ${
                active ? 'text-[#EBD4A2]' : 'text-[#757986] hover:text-[#C5C8D3]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-line"
                  transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                  className="absolute -top-[5px] w-7 h-[2px] bg-[#CFB073]"
                />
              )}

              <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.05 : 1.65} />
              <span className={`text-[10px] mt-1 tracking-[0.08em] ${active ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>

              {showDot && (
                <span className="absolute top-1 right-5 w-1.5 h-1.5 rounded-full bg-[#D95B78]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
