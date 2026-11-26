import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { AngelGame } from './AngelGame';
import { CruiseGame } from './CruiseGame';
import { JadeGame } from './JadeGame';
import { LiveGame } from './LiveGame';
import { NegotiationScene } from './NegotiationScene';
import { RaceGame } from './RaceGame';
import { StockGame } from './StockGame';

const GAMES = { jade: JadeGame, stock: StockGame, race: RaceGame, live: LiveGame, angel: AngelGame, cruise: CruiseGame } as const;

/** Full-screen minigame / negotiation scenes, mounted above the main UI. */
export const MinigameHost: React.FC = () => {
  const activeMinigame = useGameStore((s) => s.activeMinigame);
  const activeDeal = useGameStore((s) => s.activeDeal);
  const Game = activeMinigame ? GAMES[activeMinigame] : null;
  return (
    <AnimatePresence>
      {Game && <Game key={activeMinigame} />}
      {activeDeal && <NegotiationScene key={`${activeDeal.kind}:${activeDeal.id}`} />}
    </AnimatePresence>
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
