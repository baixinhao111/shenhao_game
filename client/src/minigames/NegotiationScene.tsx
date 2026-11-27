import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon, type GameIconName } from '../components/GameIcon';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { formatMoney } from '../lib/format';
import { playCritExplosion, playLose, playSystemPing, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Stage, useMgApi } from './Stage';

interface Deal {
  id: string;
  kind: 'business' | 'property';
  item: { id: string; name: string; image: string; list: number };
  seller: { id: string; name: string; title: string; portrait: string; temper: string };
  ask: number;
  patience: number;
  maxPatience: number;
  round: number;
  maxRounds: number;
  finalCall: boolean;
  minOffer: number;
  cards: {
    funds: { used: boolean; available: boolean };
    network: { used: boolean; available: boolean };
    intel: { used: boolean; cost: number };
    heroine: { used: boolean; heroines: Array<{ id: string; name: string; avatar: string; effect: string }> };
    mindread: { cost: number };
  };
  reveal: { weakness: string | null; range: [number, number] | null; temperHint: string | null };
  log: Array<{ who: 'seller' | 'me' | 'system' | 'ally'; text: string; allyId?: string }>;
  done?: boolean;
  result?: { success: boolean; price?: number; saved?: number; savedPct?: number };
}

const stepOf = (list: number) => (list >= 1e8 ? 1e6 : list >= 1e7 ? 1e5 : 1e4);

export const NegotiationScene: React.FC = () => {
  const { state, activeDeal, closeDeal } = useGameStore();
  const { busy, call } = useMgApi();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [offer, setOffer] = useState(0);
  const [heroPick, setHeroPick] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!activeDeal || startedRef.current) return;
    startedRef.current = true;
    call<any>('/deal/start', activeDeal).then((res) => {
      if (!res) {
        closeDeal();
        return;
      }
      setDeal(res.deal);
      setOffer(Math.round((res.deal.item.list * 0.85) / stepOf(res.deal.item.list)) * stepOf(res.deal.item.list));
    });
  }, [activeDeal, call, closeDeal]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!deal) return;
    const res = await call<any>('/deal/act', { id: deal.id, action, ...extra });
    if (!res) return;
    const d: Deal = res.deal;
    setDeal(d);
    setHeroPick(false);
    if (d.done) {
      if (d.result?.success) playCritExplosion();
      else playLose();
    } else if (action === 'mindread' || action === 'intel') playSystemPing();
    else playTap();
    if (!d.done && offer >= d.ask) setOffer(Math.max(d.minOffer, d.ask - stepOf(d.item.list)));
  };

  const ruler = useMemo(() => {
    if (!deal) return null;
    const lo = deal.minOffer;
    const hi = Math.max(deal.ask, deal.item.list * 1.08);
    const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    return { lo, hi, pct };
  }, [deal]);

  const leave = () => {
    if (deal && !deal.done) void act('leave');
    closeDeal();
  };

  const cash = state?.player?.cash || 0;
  const lastLines = deal ? deal.log.slice(-4) : [];
  const allyOf = (id?: string) => deal?.cards.heroine.heroines.find((h) => h.id === id);

  const CARDS: Array<{ id: string; name: string; icon: GameIconName; desc: string; disabled: boolean; sub: string }> = deal
    ? [
        {
          id: 'funds',
          name: '资金实力',
          icon: 'income',
          desc: '亮出流水，逐利者最吃这套',
          disabled: deal.cards.funds.used || !deal.cards.funds.available,
          sub: deal.cards.funds.used ? '已用' : !deal.cards.funds.available ? '现金不足' : '一次',
        },
        {
          id: 'network',
          name: '人脉施压',
          icon: 'crown',
          desc: '缺钱者会松口，要面子的会翻脸',
          disabled: deal.cards.network.used || !deal.cards.network.available,
          sub: deal.cards.network.used ? '已用' : !deal.cards.network.available ? '需2阶' : '一次',
        },
        {
          id: 'intel',
          name: '情报揭底',
          icon: 'briefcase',
          desc: '揭开对方软肋，底价下探',
          disabled: deal.cards.intel.used,
          sub: deal.cards.intel.used ? '已用' : `${deal.cards.intel.cost}积分`,
        },
        {
          id: 'heroine',
          name: '红颜助攻',
          icon: 'heart',
          desc: '请她出面',
          disabled: deal.cards.heroine.used || deal.cards.heroine.heroines.length === 0,
          sub: deal.cards.heroine.used ? '已用' : deal.cards.heroine.heroines.length === 0 ? '待结识' : '一次',
        },
      ]
    : [];

  return (
    <Stage
      bg="/assets/scene/negotiate.jpg"
      title="商战谈判"
      subtitle={deal ? `${deal.item.name} · 挂牌 ${formatMoney(deal.item.list)}` : '茶已经泡好了'}
      onBack={leave}
      dim={0.35}
    >
      {deal && ruler && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* seller + status */}
          <div className="relative flex-1 min-h-0">
            <motion.img
              key={deal.seller.portrait}
              src={deal.seller.portrait}
              alt=""
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute right-[-22%] bottom-[18%] h-[78%] max-h-[380px] object-contain object-bottom sprite-fade-bottom pointer-events-none drop-shadow-[0_14px_24px_rgba(0,0,0,0.75)]"
            />
            <div className="absolute left-4 top-2 space-y-2 max-w-[58%]">
              <div>
                <div className="font-editorial text-[20px] font-black gold-gradient-text leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{deal.seller.name}</div>
                <div className="text-[11px] text-[#C3C9DC] text-stroke-dark">
                  {deal.seller.title} · <span className="text-[#FFB3C6]">{deal.seller.temper}</span>
                </div>
              </div>
              <div className="flex items-center gap-1" title="耐心">
                <span className="text-[10.5px] text-[#A3AAC2] mr-1 text-stroke-dark">耐心</span>
                {Array.from({ length: Math.max(deal.maxPatience, deal.patience) }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-4 h-2.5 rounded-sm -skew-x-12 ${
                      i < deal.patience ? (deal.patience <= 1 ? 'bg-[#FF5C7A]' : 'bg-gradient-to-r from-[#FFE7B0] to-[#D6A85A]') : 'bg-white/12'
                    }`}
                  />
                ))}
              </div>
              <div className="text-[10.5px] text-[#A3AAC2] text-stroke-dark">
                第 {Math.min(deal.round + 1, deal.maxRounds)} / {deal.maxRounds} 回合{deal.finalCall ? ' · 最后报价' : ''}
              </div>
              <div>
                <div className="text-[10.5px] text-[#A3AAC2] text-stroke-dark">对方报价</div>
                <motion.div key={deal.ask} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="font-num text-[28px] text-[#FFE7B0] leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {formatMoney(deal.ask)}
                </motion.div>
              </div>
            </div>

            {/* dialogue on the scene */}
            <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#05070F]/95 via-[#05070F]/75 to-transparent pointer-events-none" />
            <div className="absolute left-4 right-4 bottom-2 space-y-1.5">
              <AnimatePresence initial={false}>
                {lastLines.map((l, i) => {
                  const ally = allyOf(l.allyId);
                  return (
                    <motion.div
                      key={deal.log.length - lastLines.length + i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: i === lastLines.length - 1 ? 1 : 0.62, y: 0 }}
                      className="text-[12.5px] leading-relaxed text-stroke-dark flex gap-1.5"
                    >
                      {ally && (
                        <span className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-[#F0789A]">
                          <PortraitAvatar src={ally.avatar} alt="" className="w-full h-full !border-0" rounded="full" />
                        </span>
                      )}
                      <span>
                        <span
                          className={`font-editorial font-black mr-1 ${
                            l.who === 'seller' ? 'text-[#FFE7B0]' : l.who === 'me' ? 'text-[#C3C9DC]' : l.who === 'ally' ? 'text-[#FFB3C6]' : 'text-[#9BF5FF]'
                          }`}
                        >
                          {l.who === 'seller' ? deal.seller.name : l.who === 'me' ? '我' : l.who === 'ally' ? ally?.name : '天枢'}
                        </span>
                        <span className={l.who === 'system' ? 'text-[#DDFBFF]' : 'text-[#F4EFE4]'}>{l.text}</span>
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {!deal.done ? (
            <div className="px-4 pb-4 pt-1 space-y-2.5">
              {/* price ruler */}
              <div className="relative h-9">
                <div className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-white/12" />
                {deal.reveal.range && (
                  <div
                    className="absolute top-3 h-3.5 rounded-full bg-[#63E6F2]/45 border border-[#9BF5FF] shadow-[0_0_10px_rgba(99,230,242,0.7)]"
                    style={{ left: `${ruler.pct(deal.reveal.range[0])}%`, width: `${Math.max(2, ruler.pct(deal.reveal.range[1]) - ruler.pct(deal.reveal.range[0]))}%` }}
                  />
                )}
                <div className="absolute top-1.5 w-0.5 h-6 bg-[#FF8FA6]" style={{ left: `${ruler.pct(deal.ask)}%` }} />
                <div className="absolute top-1.5 w-0.5 h-6 bg-white/50" style={{ left: `${ruler.pct(deal.item.list)}%` }} />
                <div
                  className="absolute -top-0.5 text-[9.5px] text-[#FF8FA6] -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${Math.max(7, Math.min(93, ruler.pct(deal.ask)))}%` }}
                >
                  报价
                </div>
                <div
                  className="absolute top-7 text-[9.5px] text-[#A3AAC2] -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${Math.max(7, Math.min(93, ruler.pct(deal.item.list)))}%` }}
                >
                  挂牌
                </div>
                <div
                  className="absolute top-2 w-4 h-4 -ml-2 rounded-full bg-gradient-to-b from-[#FFF0C8] to-[#D6A85A] border-2 border-white shadow-[0_0_10px_rgba(255,231,176,0.9)]"
                  style={{ left: `${ruler.pct(offer)}%` }}
                />
                <input
                  type="range"
                  min={deal.minOffer}
                  max={deal.ask}
                  step={stepOf(deal.item.list)}
                  value={Math.min(offer, deal.ask)}
                  onChange={(e) => setOffer(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  aria-label="出价"
                  disabled={busy || deal.finalCall}
                />
              </div>

              {!deal.finalCall && (
                <div className="grid grid-cols-4 gap-1.5">
                  {CARDS.map((c) => (
                    <button
                      key={c.id}
                      disabled={busy || c.disabled}
                      onClick={() => (c.id === 'heroine' ? setHeroPick((v) => !v) : act(c.id))}
                      className="relative rounded-[8px] px-1 pt-1.5 pb-1 flex flex-col items-center text-center border border-[#E2BD72]/45 bg-gradient-to-b from-[#1E2850]/90 to-[#0A0F1F]/95 disabled:opacity-35 active:scale-95 transition"
                      title={c.desc}
                    >
                      <GameIcon name={c.icon} size={28} />
                      <span className="text-[11px] font-editorial font-black text-[#FBF1D8] mt-0.5">{c.name}</span>
                      <span className="text-[9px] text-[#A3AAC2] leading-tight whitespace-nowrap">{c.sub}</span>
                    </button>
                  ))}
                </div>
              )}
              <AnimatePresence>
                {heroPick && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {deal.cards.heroine.heroines.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => act('heroine', { heroineId: h.id })}
                        className="shrink-0 rounded-full pl-1 pr-3 py-1 flex items-center gap-1.5 bg-[#2A0F1E]/85 border border-[#F0789A]/60 text-left"
                      >
                        <span className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                          <PortraitAvatar src={h.avatar} alt="" className="w-full h-full !border-0" rounded="full" />
                        </span>
                        <span>
                          <span className="block text-[12px] font-editorial font-black text-[#FBE3EA]">{h.name}</span>
                          <span className="block text-[9.5px] text-[#FFB3C6] max-w-[150px] truncate">{h.effect}</span>
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
                <button disabled={busy} onClick={() => act('mindread')} className="btn-system px-2.5 py-2 text-[11.5px] flex flex-col items-center leading-tight">
                  <span className="flex items-center gap-0.5">
                    <GameIcon name="tianshu" size={18} shadow={false} />
                    读心
                  </span>
                  <span className="text-[9.5px] opacity-80">{deal.cards.mindread.cost}积分</span>
                </button>
                <button
                  disabled={busy || cash < deal.ask}
                  onClick={() => act('accept')}
                  className="btn-navy py-2 text-[13px] font-editorial flex flex-col items-center leading-tight disabled:opacity-40"
                >
                  接受报价
                  <span className="font-num text-[11px] text-[#FFE7B0]">{formatMoney(deal.ask)}</span>
                </button>
                {deal.finalCall ? (
                  <button disabled={busy} onClick={() => act('leave')} className="btn-navy py-2 text-[13px] font-editorial">
                    不谈了
                  </button>
                ) : (
                  <button
                    disabled={busy || cash < offer}
                    onClick={() => act('offer', { price: offer })}
                    className="gold-btn-shimmer py-2 text-[13px] font-editorial flex flex-col items-center leading-tight disabled:opacity-50"
                  >
                    出价
                    <span className="font-num text-[11px]">{formatMoney(offer)}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <ResultStrip
              win={Boolean(deal.result?.success)}
              title={deal.result?.success ? `成交 · ${deal.item.name}` : '谈崩了'}
              amount={deal.result?.success ? deal.result.saved : undefined}
              line={
                deal.result?.success
                  ? `成交价 ${formatMoney(deal.result.price || 0)}，${(deal.result.savedPct || 0) > 0 ? `比挂牌价省下 ${deal.result.savedPct}%` : '没占到便宜'}。`
                  : '对方拂袖而去，十分钟内不会再见你。'
              }
              formatAmount={formatMoney}
              primary={{ label: '完成', onClick: closeDeal }}
            />
          )}
        </div>
      )}
    </Stage>
  );
};
