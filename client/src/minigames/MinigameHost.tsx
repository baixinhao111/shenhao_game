import React, { Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';

const AngelGame = lazy(() => import('./AngelGame').then((m) => ({ default: m.AngelGame })));
const CruiseGame = lazy(() => import('./CruiseGame').then((m) => ({ default: m.CruiseGame })));
const JadeGame = lazy(() => import('./JadeGame').then((m) => ({ default: m.JadeGame })));
const LiveGame = lazy(() => import('./LiveGame').then((m) => ({ default: m.LiveGame })));
const NegotiationScene = lazy(() => import('./NegotiationScene').then((m) => ({ default: m.NegotiationScene })));
const RaceGame = lazy(() => import('./RaceGame').then((m) => ({ default: m.RaceGame })));
const StockGame = lazy(() => import('./StockGame').then((m) => ({ default: m.StockGame })));

const GAMES = { jade: JadeGame, stock: StockGame, race: RaceGame, live: LiveGame, angel: AngelGame, cruise: CruiseGame } as const;

const MgLoadingFallback: React.FC = () => (
  <div className="absolute inset-0 z-40 bg-[#05070D]/95 flex flex-col items-center justify-center gap-3">
    <div className="w-28 bar-track">
      <div className="bar-fill w-1/3 animate-[loadSlide_1.2s_ease-in-out_infinite]" />
    </div>
    <div className="font-editorial text-[11px] text-[#E2D3B0] tracking-[0.35em]">场景加载中</div>
  </div>
);

/** Full-screen minigame / negotiation scenes, mounted above the main UI. */
export const MinigameHost: React.FC = () => {
  const activeMinigame = useGameStore((s) => s.activeMinigame);
  const activeDeal = useGameStore((s) => s.activeDeal);
  const Game = activeMinigame ? GAMES[activeMinigame] : null;
  return (
    <Suspense fallback={<MgLoadingFallback />}>
      <AnimatePresence>
        {Game && <Game key={activeMinigame} />}
        {activeDeal && <NegotiationScene key={`${activeDeal.kind}:${activeDeal.id}`} />}
      </AnimatePresence>
    </Suspense>
  );
};

/** coreMinigame id in content/maps -> scene */
export const MINIGAME_OF: Record<string, keyof typeof GAMES> = {
  jade_gambling: 'jade',
  angel_invest: 'angel',
  street_race: 'race',
  stock_market: 'stock',
  livestream_pk: 'live',
  cruise_event: 'cruise',
};
