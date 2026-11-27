import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthScreen } from './components/AuthScreen';
import { BottomNav } from './components/BottomNav';
import { Overlays } from './components/Overlays';
import { RewardFlyLayer } from './components/RewardFly';
import { MinigameHost } from './minigames/MinigameHost';
import { TopBar } from './components/TopBar';
import { MiniStoryOverlay } from './components/VisualNovelTheater';
import { setBgmMood } from './lib/bgm';
import { useGameStore } from './store/useGameStore';
import { HomeView } from './views/HomeView';

const AssetsView = lazy(() => import('./views/AssetsView').then((m) => ({ default: m.AssetsView })));
const CityMapView = lazy(() => import('./views/CityMapView').then((m) => ({ default: m.CityMapView })));
const HeroinesView = lazy(() => import('./views/HeroinesView').then((m) => ({ default: m.HeroinesView })));
const StoryView = lazy(() => import('./views/StoryView').then((m) => ({ default: m.StoryView })));
const SystemView = lazy(() => import('./views/SystemView').then((m) => ({ default: m.SystemView })));

const ViewFallback: React.FC = () => (
  <div className="h-full w-full bg-[#05070D] flex items-center justify-center">
    <div className="w-24 bar-track">
      <div className="bar-fill w-1/3 animate-[loadSlide_1.2s_ease-in-out_infinite]" />
    </div>
  </div>
);

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || '页面模块加载失败' };
  }
  componentDidCatch(error: Error) {
    const msg = String(error?.message || '');
    const isChunkError = /dynamically imported module|importing a module script|loading chunk|failed to fetch/i.test(msg);
    if (isChunkError && typeof window !== 'undefined') {
      try {
        const key = 'tianshu_chunk_reload_at';
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 15000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 bg-[#05070D]/96 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="font-editorial text-[18px] font-black text-[#EADBB8]">页面资源已更新</div>
          <p className="text-[12px] text-[#9EA4B5] leading-relaxed">检测到新版前端资源，刷新后即可继续当前进度。</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-champagne px-6 py-2.5 text-[13px] font-editorial"
          >
            立即刷新
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    activeMinigame,
    activeDeal,
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

  // Dynamic Web Audio BGM scene mood sync
  useEffect(() => {
    if (!token || !state) {
      setBgmMood('lounge');
      return;
    }
    if (activeMinigame) {
      setBgmMood('arcade');
    } else if (activeDeal || activeStoryEpisodeId) {
      setBgmMood('tension');
    } else if (activeMiniStory || activeChatHeroineId || activeTab === 'heroines') {
      setBgmMood('romance');
    } else {
      setBgmMood('lounge');
    }
  }, [token, state, activeMinigame, activeDeal, activeStoryEpisodeId, activeMiniStory, activeChatHeroineId, activeTab]);

  const hideChrome =
    Boolean(activeStoryEpisodeId) || Boolean(activeChatHeroineId) || Boolean(activeMiniStory) || Boolean(activeMinigame) || Boolean(activeDeal);
  const isHome = activeTab === 'home';

  return (
    <div className="min-h-[100dvh] w-full bg-[#04050A] flex items-center justify-center sm:py-4" style={{ background: "radial-gradient(60% 50% at 50% 30%, #0E1119 0%, #04050A 100%)" }}>
      {/* 9:16 Mobile-First Viewport Shell */}
      <div data-app-shell className="relative w-full h-[100dvh] sm:h-[852px] sm:max-h-[94dvh] sm:w-[412px] sm:rounded-[30px] sm:border sm:border-[#D9C49A]/22 sm:shadow-[0_0_90px_rgba(0,0,0,0.94)] bg-[#05070D] overflow-hidden flex flex-col">
        <ChunkErrorBoundary>
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 deco-texture">
            <img src="/assets/ui/logo.webp" alt="天枢神豪" className="w-[72%] max-w-[300px] animate-float-slow drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)]" />
            <div className="w-40 bar-track">
              <div className="bar-fill w-1/3 animate-[loadSlide_1.4s_ease-in-out_infinite]" />
            </div>
            <div className="font-editorial text-[12px] text-[#E2D3B0] tracking-[0.4em]">海城载入中</div>
          </div>
        ) : !token || !state ? (
          <AuthScreen />
        ) : (
          <>
            {/* Inner pages use compact TopBar; HomeView renders its own spacious game header with large Player Portrait */}
            {!hideChrome && !isHome && !showProfile && <TopBar />}

            <main className="flex-1 min-h-0 overflow-hidden relative">
              {/* tab switch: quick cross-fade with a slight rise, so pages feel like they slide into place */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10, scale: 0.995 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0"
                >
                  <Suspense fallback={<ViewFallback />}>
                    {activeTab === 'home' && <HomeView pureArtMode={pureArtMode} onTogglePureArt={setPureArtMode} />}
                    {activeTab === 'map' && <CityMapView />}
                    {activeTab === 'story' && <StoryView />}
                    {activeTab === 'assets' && <AssetsView />}
                    {activeTab === 'heroines' && <HeroinesView />}
                  </Suspense>
                </motion.div>
              </AnimatePresence>

              {/* Personal Profile & TianShu Slide-Over (Reversible via Back button, never strands BottomNav!) */}
              <AnimatePresence>
                {showProfile && !hideChrome && (
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 z-30 bg-[#05070D]"
                  >
                    <Suspense fallback={<ViewFallback />}>
                      <SystemView />
                    </Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {!hideChrome && !showProfile && <BottomNav hidden={isHome && pureArtMode} />}
          </>
        )}
        {token && state && <MinigameHost />}
        <MiniStoryOverlay />
        <Overlays />
        <RewardFlyLayer />
        </ChunkErrorBoundary>
      </div>
    </div>
  );
}

export default App;
