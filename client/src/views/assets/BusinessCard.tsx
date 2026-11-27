import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../../components/GameIcon';
import { PortraitAvatar } from '../../components/PortraitAvatar';
import { formatMoney } from '../../lib/format';
import { playTap } from '../../lib/sound';

/**
 * 产业卡（经营模拟的核心单元）
 *  - 金库条：这家产业离上次收取累计了多少、离 12 小时满仓还有多久；满仓会停止累计并提示
 *  - 红颜委派：头像直接点选，契合的红颜标「契合」
 *  - 升级：按钮上就写清「下一级 +¥/时」，升级成功后卡片金光一闪、等级章弹起、收益数字飘起
 */

export interface BizEventOutcome {
  resultText: string;
  cashReward: number;
  sysPoints: number;
  affectionGain: number;
}

export interface BizCardProps {
  b: any;
  cash: number;
  heroines: any[];
  tierName: (tier: number) => string;
  locked: boolean;
  busy: boolean;
  onUpgrade: () => Promise<boolean>;
  onBuy: () => void;
  onDeal: () => void;
  onAssign: (heroineId: string) => void;
  onResolveEvent?: (eventId: string, choiceId: string) => Promise<BizEventOutcome | null>;
}

const VaultMeter: React.FC<{ hours: number; pending: number }> = ({ hours, pending }) => {
  const full = hours >= 11.95;
  const pct = Math.min(100, (hours / 12) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px] mb-1">
        <span className={full ? 'text-[#FF8FA6] font-bold animate-pulse' : 'text-[#8C90A0]'}>
          {full ? '金库已满 · 停止累计' : `金库 ${hours.toFixed(1)} / 12 时`}
        </span>
        <span className="font-num text-[#7BE0A8]">+{formatMoney(pending)}</span>
      </div>
      <div className="h-[6px] rounded-full bg-[#05070D] border border-white/[0.06] overflow-hidden">
        <motion.div
          initial={false}
          animate={{ width: `${Math.max(2, pct)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            full ? 'bg-gradient-to-r from-[#C2475F] to-[#FF8FA6]' : 'bg-gradient-to-r from-[#2E8A5E] to-[#7BE0A8]'
          }`}
        />
      </div>
    </div>
  );
};

export const BusinessCard: React.FC<BizCardProps> = ({ b, cash, heroines, tierName, locked, busy, onUpgrade, onBuy, onDeal, onAssign, onResolveEvent }) => {
  const canAffordBuy = cash >= (b.buyCost || 0);
  const canAffordUpgrade = cash >= (b.upgradeCost || 0);
  const [pulse, setPulse] = useState(0);
  const [lastLevel, setLastLevel] = useState(b.level);
  const [sealed, setSealed] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventOutcome, setEventOutcome] = useState<BizEventOutcome | null>(null);

  // level went up / just acquired → celebrate on the card itself
  useEffect(() => {
    if (b.level > lastLevel && lastLevel > 0) setPulse(Date.now());
    if (b.level > 0 && lastLevel === 0) setSealed(Date.now());
    setLastLevel(b.level);
  }, [b.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const gainPerHour = Math.max(0, (b.nextIncomePerHour || 0) - (b.currentIncomePerHour || 0));
  const assigned = heroines.find((h) => h.id === b.assignedHeroineId);

  return (
    <motion.div
      layout
      className="relative"
      animate={pulse ? { filter: ['brightness(1)', 'brightness(1.35)', 'brightness(1)'] } : {}}
      transition={{ duration: 0.9 }}
      key={b.id}
    >
      {/* ---------- poster ---------- */}
      <div className="relative h-[150px] -mx-3 overflow-hidden">
        <motion.img
          src={b.image}
          alt={b.name}
          animate={pulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 0.6 }}
          className={`w-full h-full object-cover ${locked ? 'grayscale brightness-50' : !b.owned ? 'brightness-[0.8]' : ''}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#04050A] via-[#04050A]/30 to-[#04050A]/40" />

        {b.owned && (
          <motion.span
            key={`lv-${b.level}`}
            initial={pulse ? { scale: 1.8, rotate: -10 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            className="absolute top-3 left-4 flex items-baseline gap-1 text-shadow-stage"
          >
            <span className="font-num text-[10px] tracking-[0.3em] text-[#B7B3AA]">LV</span>
            <span className="font-num text-[26px] leading-none text-[var(--ivory-2)]">{b.level}</span>
          </motion.span>
        )}
        {assigned && (
          <span className="absolute top-3 right-4 flex items-center gap-1.5 text-shadow-stage">
            <span className="w-6 h-6 rounded-full p-[1.5px] bg-gradient-to-b from-[#FFC2D1] to-[#C24E74]">
              <PortraitAvatar src={assigned.avatar} alt="" className="w-full h-full !border-0" rounded="full" />
            </span>
            <span className="text-[11px] text-[#FFC9D6]">{assigned.name} 坐镇</span>
          </span>
        )}
        {locked && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <GameIcon name="lock" size={36} />
            <span className="text-[11px] text-[#B3B6C2] text-stroke-dark">晋升「{tierName(b.unlockTier)}」解锁</span>
          </span>
        )}

        <div className="absolute left-4 right-4 bottom-2.5 flex items-end justify-between gap-2 text-shadow-stage">
          <span className="text-[11px] text-[#B7B3AA]">{b.owned ? '当前时薪' : '收购后时薪'}</span>
          <span className="font-num text-[20px] leading-none text-[var(--ivory-2)] shrink-0">
            {formatMoney(b.currentIncomePerHour)}
            <span className="text-[11px] text-[#8C90A0]"> /时</span>
          </span>
        </div>

        {/* acquisition seal */}
        <AnimatePresence>
          {sealed > 0 && (
            <motion.div
              key={sealed}
              initial={{ opacity: 0, scale: 2.4, rotate: -24 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [2.4, 1, 1, 1], rotate: -12 }}
              transition={{ duration: 2.2, times: [0, 0.15, 0.8, 1] }}
              onAnimationComplete={() => setSealed(0)}
              className="absolute right-6 top-6 px-3 py-1 border-[3px] border-[#D9C49A] rounded-[6px] font-editorial font-black text-[22px] tracking-[0.2em] text-[#EADBB8] bg-black/40 shadow-[0_0_24px_rgba(217,196,154,0.6)] pointer-events-none"
            >
              已收购
            </motion.div>
          )}
        </AnimatePresence>

        {/* floating gain after an upgrade */}
        <AnimatePresence>
          {pulse > 0 && (
            <motion.div
              key={pulse}
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: [0, 1, 1, 0], y: -34, scale: 1.05 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              onAnimationComplete={() => setPulse(0)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 font-num text-[20px] font-semibold gold-gradient-text drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] pointer-events-none whitespace-nowrap"
            >
              Lv.{b.level} · 时薪 {formatMoney(b.currentIncomePerHour)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------- body ---------- */}
      <div className="pt-3 space-y-3.5">
        {b.owned ? (
          <>
            <VaultMeter hours={b.pendingHours || 0} pending={b.pendingIncome || 0} />

            {/* Business Operating Event */}
            {b.activeEvent && onResolveEvent && (
              <div className="relative pl-3 border-l-2 border-[#FF8FA6]/70">
                <button
                  type="button"
                  onClick={() => {
                    playTap();
                    setEventOpen((v) => !v);
                  }}
                  className="w-full py-0.5 flex items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] tracking-[0.3em] text-[#FF8FA6]">经营事件</div>
                    <div className="text-[14px] font-editorial font-black text-[var(--ivory-2)] truncate mt-0.5">{b.activeEvent.title}</div>
                  </div>
                  <span className="text-[11px] text-[var(--champagne)] shrink-0">{eventOpen ? '收起' : '去决策 ›'}</span>
                </button>
                <AnimatePresence>
                  {eventOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pt-2 space-y-1"
                    >
                      <p className="text-[12px] text-[#A9ADBA] leading-relaxed pb-1">{b.activeEvent.desc}</p>
                      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                        {(b.activeEvent.choices || []).map((c: any) => {
                          const isHeroineChoice = c.kind === 'heroine';
                          const isTianshuChoice = c.kind === 'tianshu';
                          const reqHeroine = c.requireHeroine
                            ? heroines.find((h) => h.id === c.requireHeroine)
                            : null;
                          const heroineReady = !isHeroineChoice || b.assignedHeroineId === c.requireHeroine;
                          const estCash = Math.round(Math.max(15000, Number(b.currentIncomePerHour || 20000)) * Number(c.incomeHoursReward || 3));
                          return (
                            <button
                              key={c.id}
                              disabled={busy || !heroineReady}
                              onClick={async () => {
                                playTap();
                                const res = await onResolveEvent(b.activeEvent.id, c.id);
                                if (res) {
                                  setEventOpen(false);
                                  setEventOutcome(res);
                                  setTimeout(() => setEventOutcome(null), 6500);
                                }
                              }}
                              className="w-full py-2.5 text-left transition active:bg-white/[0.03] disabled:opacity-45"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`flex items-center gap-1.5 text-[13px] font-bold ${isTianshuChoice ? 'text-[#B9F6FB]' : isHeroineChoice ? 'text-[#FFC4D3]' : 'text-[#ECE6DA]'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isTianshuChoice ? 'bg-[#63E6F2]' : isHeroineChoice ? 'bg-[#F0789A]' : 'bg-[var(--champagne)]'}`} />
                                  {c.label}
                                </span>
                                <span className="font-num text-[11px] text-[#7BE0A8] shrink-0">+{formatMoney(estCash)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-1 pl-3 text-[11px]">
                                <span className="text-[#8C90A0]">
                                  {c.costEnergy > 0 ? `精力 -${c.costEnergy}` : ''}
                                  {c.costSysPoints > 0 ? `${c.costEnergy > 0 ? ' · ' : ''}积分 -${c.costSysPoints}` : ''}
                                  {isHeroineChoice && !heroineReady
                                    ? ` · 需委派${reqHeroine?.name || '契合红颜'}坐镇`
                                    : isHeroineChoice
                                      ? ' · 红颜坐镇加成'
                                      : ''}
                                </span>
                                <span className="text-[#EADBB8]">
                                  {c.affectionGain ? `好感 +${c.affectionGain}` : ''}
                                  {c.sysPoints ? `${c.affectionGain ? ' · ' : ''}积分 +${c.sysPoints}` : ''}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {eventOutcome && (
              <div className="pl-3 border-l-2 border-[#7BE0A8]/70 text-[12px] space-y-1">
                <div className="text-[#DDFCE9] leading-relaxed font-editorial">「{eventOutcome.resultText}」</div>
                <div className="font-num text-[11px] text-[#7BE0A8] flex items-center gap-2.5">
                  <span>+{formatMoney(eventOutcome.cashReward)}</span>
                  {eventOutcome.sysPoints > 0 && <span className="text-[#B9F6FB]">积分 +{eventOutcome.sysPoints}</span>}
                  {eventOutcome.affectionGain > 0 && <span className="text-[#FFB3C6]">好感 +{eventOutcome.affectionGain}</span>}
                </div>
              </div>
            )}

            {heroines.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#8C90A0] shrink-0">委派红颜</span>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5 pb-2">
                  {heroines.map((h) => {
                    const on = h.id === b.assignedHeroineId;
                    const fit = b.preferredHeroine === h.id;
                    return (
                      <button
                        key={h.id}
                        onClick={() => {
                          playTap();
                          onAssign(on ? '' : h.id);
                        }}
                        className="relative shrink-0 active:scale-90 transition"
                        title={`${h.name}${fit ? '（契合 +35%）' : '（+15%）'}`}
                      >
                        <span
                          className={`block rounded-full p-[1.5px] ${
                            on ? 'bg-gradient-to-b from-[#FFB3C6] to-[#C24E74]' : 'bg-white/10'
                          }`}
                        >
                          <PortraitAvatar src={h.avatar} alt={h.name} className={`w-8 h-8 !border-0 ${on ? '' : 'opacity-60 grayscale-[40%]'}`} rounded="full" />
                        </span>
                        {fit && (
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-sm text-[10px] leading-[12px] bg-[#F0789A] text-white whitespace-nowrap">
                            契合
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
              <div className="min-w-0 text-[11.5px] leading-snug">
                <div className="text-[#8C90A0]">升至 Lv.{b.level + 1}</div>
                <div className="font-num text-[#7BE0A8]">
                  +{formatMoney(gainPerHour)}/时 · 估值 +{formatMoney((b.nextValuation || 0) - (b.currentValuation || 0))}
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => void onUpgrade()}
                className={`${canAffordUpgrade ? 'btn-champagne' : 'btn-ghost opacity-70'} shrink-0 px-4 py-2.5 text-[13px] font-num`}
              >
                升级 · {formatMoney(b.upgradeCost)}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-[#A9ADBA] leading-relaxed">{b.description}</p>
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
              <div className="text-[11.5px] leading-snug min-w-0">
                <div className="text-[#8C90A0]">收购后</div>
                <div className="font-num text-[#7BE0A8]">
                  {formatMoney(b.currentIncomePerHour)}/时 · 估值 {formatMoney(b.baseValuation)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!locked && (
                  <button disabled={busy} onClick={onDeal} className="btn-ghost px-3.5 py-2.5 text-[13px] font-editorial">
                    谈判
                  </button>
                )}
                <button
                  disabled={busy || locked}
                  onClick={onBuy}
                  className={`${locked || !canAffordBuy ? 'btn-ghost opacity-70' : 'btn-champagne'} px-3.5 py-2.5 text-[13px] font-num disabled:opacity-45`}
                >
                  {locked ? '未解锁' : `全款 ${formatMoney(b.buyCost)}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};
