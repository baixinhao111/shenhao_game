import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCard, playLose, playPerfect, playSystemPing } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, useMgApi, useStakeScale } from './Stage';

interface Card {
  r: string;
  s: string;
}
interface Hand {
  id: string;
  bet: number;
  player: Card[];
  dealer: Card[];
  playerTotal: number;
  dealerTotal: number | null;
  canDouble: boolean;
  vision: boolean;
  done: boolean;
  result?: { outcome: 'blackjack' | 'win' | 'push' | 'lose'; payout: number; profit: number; tokens: number };
}

const OUTCOME: Record<string, string> = { blackjack: '黑杰克！', win: '赢下这手', push: '平局', lose: '庄家胜' };

const PlayingCard: React.FC<{ card: Card; index: number }> = ({ card, index }) => {
  const hidden = card.r === '?';
  const red = card.s === '♥' || card.s === '♦';
  return (
    <motion.div
      initial={{ y: -120, x: 40, rotate: -18, opacity: 0 }}
      animate={{ y: 0, x: 0, rotate: (index - 1) * 4, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: index * 0.06 }}
      className="relative w-[74px] h-[106px] -ml-4 first:ml-0 rounded-[8px] shadow-[0_10px_18px_rgba(0,0,0,0.6)] overflow-hidden"
      style={
        hidden
          ? { background: 'url(/assets/ui/deco_tile.webp) center/120px, #0E1119', border: '2px solid #D9C49A' }
          : { background: 'linear-gradient(160deg,#FFFDF6,#EDE4CF)', border: '1px solid #C9B37E' }
      }
    >
      {!hidden && (
        <>
          <div className={`absolute top-1 left-1.5 leading-none font-num font-semibold text-[19px] ${red ? 'text-[#C2263F]' : 'text-[#1B2340]'}`}>
            {card.r}
            <div className="text-[14px]">{card.s}</div>
          </div>
          <div className={`absolute bottom-1 right-1.5 leading-none font-num font-semibold text-[19px] rotate-180 ${red ? 'text-[#C2263F]' : 'text-[#1B2340]'}`}>
            {card.r}
            <div className="text-[14px]">{card.s}</div>
          </div>
          <div className={`absolute inset-0 flex items-center justify-center text-[38px] ${red ? 'text-[#C2263F]' : 'text-[#1B2340]'}`}>{card.s}</div>
          {/* gloss */}
          <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.55)_0%,transparent_35%,transparent_70%,rgba(0,0,0,0.06)_100%)] pointer-events-none" />
        </>
      )}
    </motion.div>
  );
};

export const CruiseGame: React.FC = () => {
  const { state, closeMinigame, flyReward, applyServerState, showError, notifyTop } = useGameStore();
  const { busy, call } = useMgApi();
  const stakeScale = useStakeScale();
  const [hand, setHand] = useState<Hand | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const ev = state?.events?.find((e: any) => e.id === 'event_cruise_01');

  const settleFx = (h: Hand) => {
    if (!h.done || !h.result) return;
    if (h.result.outcome === 'lose') playLose();
    else {
      playPerfect();
      const r = tableRef.current?.getBoundingClientRect();
      if (h.result.payout > 0) flyReward(h.result.payout, r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.7 } : undefined);
    }
  };

  const deal = async () => {
    const res = await call<any>('/mg/cruise/start', {});
    if (!res) return;
    playCard();
    setHand(res.hand);
    settleFx(res.hand);
  };

  const act = async (action: 'hit' | 'stand' | 'double' | 'vision') => {
    if (!hand) return;
    const res = await call<any>('/mg/cruise/action', { id: hand.id, action });
    if (!res) return;
    if (action === 'vision') playSystemPing();
    else playCard();
    setHand(res.hand);
    settleFx(res.hand);
  };

  const redeem = async (rewardId: string) => {
    try {
      const res = await apiRequest<any>('/event/cruise/redeem', { body: { rewardId } });
      applyServerState(res.state);
      notifyTop('system', '兑换成功', res.message);
    } catch (e: any) {
      showError(e.message);
    }
  };

  const leave = async () => {
    if (hand && !hand.done) await act('stand');
    closeMinigame();
  };

  const playsLeft = Math.max(0, 5 - (ev?.playsToday || 0));

  return (
    <Stage bg="/assets/scene/casino.jpg" title="星耀号 · 公海局" subtitle={`21 点 · 每手筹码 ${formatMoney(300000 * stakeScale)}`} onBack={leave} dim={0.35}>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-1 flex items-center justify-between text-stroke-dark">
          <div className="flex items-center gap-1">
            <GameIcon name="medal" size={22} />
            <span className="font-num text-[18px] text-[#EADBB8]">{ev?.tokens ?? 0}</span>
            <span className="text-[11px] text-[#8C90A0]">星耀勋章</span>
          </div>
          <div className="text-[11.5px] text-[#B3B6C2]">今日剩余 {playsLeft} 手</div>
        </div>
        {ev?.weeklyTheme?.name && (
          <div className="px-4 mt-1 flex justify-center">
            <div
              title={ev.weeklyTheme.desc}
              className="px-3 py-0.5 rounded-full bg-[#1C160A]/80 border border-[#D9C49A]/45 text-[10.5px] text-[#EADBB8] tracking-wider"
            >
              {ev.weeklyTheme.name}
            </div>
          </div>
        )}

        <div ref={tableRef} className="relative flex-1 flex flex-col items-center justify-between py-3">
          {/* dealer */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-b from-[#EADBB8] to-[#8A7650]">
              <div className="w-full h-full rounded-full overflow-hidden bg-[#10131C]">
                <img src="/assets/npc/akun.webp" alt="" className="w-full h-full object-cover object-top scale-[1.5] origin-top" />
              </div>
            </div>
            <div className="mt-1 px-2.5 py-0.5 rounded-full bg-[#04050A]/72 backdrop-blur-sm border border-white/12 text-[11px] text-[#EAECEF]">
              财阀代理 · 阿坤 {hand?.dealerTotal != null ? `· ${hand.dealerTotal}点` : ''}
            </div>
            <div className="flex mt-2 h-[106px]">
              {hand?.dealer.map((c, i) => <PlayingCard key={`d${i}${c.r}${c.s}`} card={c} index={i} />)}
            </div>
          </div>

          <AnimatePresence>
            {hand?.done && hand.result && (
              <motion.div
                initial={{ opacity: 0, scale: 1.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`font-editorial text-[36px] font-black drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] ${
                  hand.result.outcome === 'lose' ? 'text-[#8C90A0]' : 'gold-gradient-text'
                }`}
              >
                {OUTCOME[hand.result.outcome]}
              </motion.div>
            )}
            {!hand && (
              <div className="px-6 text-center">
                <Speech who="阿坤" text="老板，公海上的规矩：二十一点，比大小。敢不敢坐下来？" />
              </div>
            )}
          </AnimatePresence>

          {/* player */}
          <div className="flex flex-col items-center">
            <div className="flex h-[106px]">{hand?.player.map((c, i) => <PlayingCard key={`p${i}${c.r}${c.s}`} card={c} index={i} />)}</div>
            {hand && <div className="mt-2 font-num text-[18px] text-[#EADBB8] text-stroke-dark">{hand.playerTotal} 点</div>}
          </div>
        </div>

        {!hand && (
          <div className="px-4 pb-5 space-y-2.5">
            {ev?.rewards?.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {ev.rewards.map((rew: any) => {
                  const done = rew.assetId && ev.redeemed?.includes(rew.id);
                  const shortName = String(rew.name || '').replace(/\s*[（(][^）)]*[）)]/g, '');
                  return (
                    <button
                      key={rew.id}
                      disabled={done || (ev.tokens || 0) < rew.costTokens}
                      onClick={() => redeem(rew.id)}
                      className="shrink-0 btn-navy !rounded-full pl-1 pr-2.5 py-1 text-[11px] flex items-center gap-1 disabled:opacity-45"
                    >
                      <GameIcon name="medal" size={16} shadow={false} />
                      {done ? '已兑换' : `${rew.costTokens}`} · {shortName}
                    </button>
                  );
                })}
              </div>
            )}
            <button disabled={busy || playsLeft <= 0} onClick={deal} className="w-full gold-btn-shimmer py-3 text-[15px] font-editorial flex items-center justify-center gap-1.5">
              {playsLeft > 0 ? (
                <>
                  <span>下注 {formatMoney(300000 * stakeScale)} · 发牌</span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#19130A]/85 text-[#EADBB8] font-num text-[11.5px]">
                    <GameIcon name="energy" size={14} shadow={false} />8
                  </span>
                </>
              ) : (
                '今日赌局已结束'
              )}
            </button>
          </div>
        )}

        {hand && !hand.done && (
          <div className="px-4 pb-5 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <button disabled={busy} onClick={() => act('hit')} className="btn-navy py-2.5 text-[14px] font-editorial">
                要牌
              </button>
              <button disabled={busy || !hand.canDouble} onClick={() => act('double')} className="btn-navy py-2.5 text-[14px] font-editorial disabled:opacity-40">
                加倍
              </button>
              <button disabled={busy} onClick={() => act('stand')} className="gold-btn-shimmer py-2.5 text-[14px] font-editorial">
                停牌
              </button>
            </div>
            {!hand.vision && (
              <button disabled={busy} onClick={() => act('vision')} className="btn-system w-full flex items-center justify-center gap-1 py-1.5 text-[12.5px]">
                <GameIcon name="tianshu" size={22} shadow={false} />
                天枢透视暗牌 · 20积分
              </button>
            )}
          </div>
        )}

        {hand?.done && hand.result && (
          <ResultStrip
            win={hand.result.outcome !== 'lose'}
            title={`星耀勋章 +${hand.result.tokens}`}
            amount={hand.result.profit}
            line={`你 ${hand.playerTotal} 点 · 庄家 ${hand.dealerTotal} 点`}
            formatAmount={formatMoney}
            primary={{ label: playsLeft > 0 ? '再来一手' : '今日已满', onClick: () => (playsLeft > 0 ? deal() : setHand(null)) }}
            secondary={{ label: '兑换 / 离开', onClick: () => setHand(null) }}
          />
        )}
      </div>
    </Stage>
  );
};
