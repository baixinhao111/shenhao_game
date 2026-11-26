import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthScreen } from './components/AuthScreen';
import { BottomNav } from './components/BottomNav';
import { Overlays } from './components/Overlays';
import { TopBar } from './components/TopBar';
import { MiniStoryOverlay } from './components/VisualNovelTheater';
import { useGameStore } from './store/useGameStore';
import { AssetsView } from './views/AssetsView';
import { CityMapView } from './views/CityMapView';
import { HeroinesView } from './views/HeroinesView';
import { HomeView } from './views/HomeView';
import { StoryView } from './views/StoryView';
import { SystemView } from './views/SystemView';

export function App() {
  const {
    token,
    state,
    loading,
    activeTab,
    showProfile,
    activeStoryEpisodeId,
    activeChatHeroineId,
    activeMiniStory,
    initSession,
    refreshState,
  } = useGameStore();

  const [pureArtMode, setPureArtMode] = useState(false);

  useEffect(() => {
    void initSession();
  }, [initSession]);

  useEffect(() => {
    if ((activeTab !== 'home' || showProfile) && pureArtMode) {
      setPureArtMode(false);
    }
  }, [activeTab, showProfile, pureArtMode]);

  // Passive state refresh every 45s to keep offline income & energy fresh
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      void refreshState();
    }, 45000);
    return () => clearInterval(id);
  }, [token, refreshState]);

  const hideChrome = Boolean(activeStoryEpisodeId) || Boolean(activeChatHeroineId) || Boolean(activeMiniStory);
  const isHome = activeTab === 'home';

  return (
    <div className="min-h-[100dvh] w-full bg-[#05070F] flex items-center justify-center sm:py-4" style={{ background: "radial-gradient(60% 50% at 50% 30%, #141C38 0%, #05070F 100%)" }}>
      {/* 9:16 Mobile-First Viewport Shell */}
      <div className="relative w-full h-[100dvh] sm:h-[852px] sm:max-h-[94dvh] sm:w-[412px] sm:rounded-[30px] sm:border sm:border-[#E2BD72]/22 sm:shadow-[0_0_90px_rgba(0,0,0,0.94)] bg-[#0B1122] overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 deco-texture">
            <img src="/assets/ui/logo.webp" alt="天枢神豪" className="w-[72%] max-w-[300px] animate-float-slow drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)]" />
            <div className="w-40 bar-track">
              <div className="bar-fill w-1/3 animate-[loadSlide_1.4s_ease-in-out_infinite]" />
            </div>
            <div className="font-editorial text-[12px] text-[#F6DDA4] tracking-[0.4em]">海城载入中</div>
          </div>
        ) : !token || !state ? (
          <AuthScreen />
        ) : (
          <>
            {/* Inner pages use compact TopBar; HomeView renders its own spacious game header with large Player Portrait */}
            {!hideChrome && !isHome && !showProfile && <TopBar />}

            <main className="flex-1 min-h-0 overflow-hidden relative">
              {activeTab === 'home' && <HomeView pureArtMode={pureArtMode} onTogglePureArt={setPureArtMode} />}
              {activeTab === 'map' && <CityMapView />}
              {activeTab === 'story' && <StoryView />}
              {activeTab === 'assets' && <AssetsView />}
              {activeTab === 'heroines' && <HeroinesView />}

              {/* Personal Profile & TianShu Slide-Over (Reversible via Back button, never strands BottomNav!) */}
              <AnimatePresence>
                {showProfile && !hideChrome && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 z-30 bg-[#0B1122]"
                  >
                    <SystemView />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {!hideChrome && !showProfile && <BottomNav hidden={isHome && pureArtMode} />}
          </>
        )}
        <MiniStoryOverlay />
        <Overlays />
      </div>
    </div>
  );
}

export default App;
