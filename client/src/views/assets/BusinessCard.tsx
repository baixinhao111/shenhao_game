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
      className={`relative rounded-[10px] overflow-hidden ${b.owned ? 'panel-brass' : 'panel-arch'}`}
      animate={pulse ? { boxShadow: ['0 0 0 rgba(255,220,150,0)', '0 0 34px rgba(255,220,150,0.75)', '0 0 0 rgba(255,220,150,0)'] } : {}}
      transition={{ duration: 0.9 }}
      key={b.id}
    >
      {/* ---------- poster ---------- */}
      <div className="relative h-[132px] w-full overflow-hidden">
        <motion.img
          src={b.image}
          alt={b.name}
          animate={pulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 0.6 }}
          className={`w-full h-full object-cover ${locked ? 'grayscale brightness-50' : !b.owned ? 'brightness-[0.8]' : ''}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/25 to-transparent" />

        {b.owned && (
          <motion.span
            key={`lv-${b.level}`}
            initial={pulse ? { scale: 1.8, rotate: -10 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
            className="absolute top-2 left-2 flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-black/65 border border-[#D9C49A]/70"
          >
            <GameIcon name="medal" size={18} shadow={false} />
            <span className="font-num text-[12px] text-[#EADBB8]">Lv.{b.level}</span>
          </motion.span>
        )}
        {assigned && (
          <span className="absolute top-2 right-2 flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-black/65 border border-[#F0789A]/70">
            <PortraitAvatar src={assigned.avatar} alt="" className="w-5 h-5" rounded="full" />
            <span className="text-[10.5px] text-[#FFC9D6]">{assigned.name} 坐镇</span>
          </span>
        )}
        {locked && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <GameIcon name="lock" size={36} />
            <span className="text-[11px] text-[#B3B6C2] text-stroke-dark">晋升「{tierName(b.unlockTier)}」解锁</span>
          </span>
        )}

        <div className="absolute left-3 right-3 bottom-2 flex items-end justify-between gap-2">
          <h3 className="font-editorial text-[18px] font-black text-[#ECE6DA] text-stroke-dark truncate">{b.name}</h3>
          <span className="font-num text-[13px] text-[#EADBB8] text-stroke-dark shrink-0 flex items-center gap-1">
            <GameIcon name="income" size={18} /> {formatMoney(b.currentIncomePerHour)}/时
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
      <div className="px-3 pt-2.5 pb-3 space-y-2.5">
        {b.owned ? (
          <>
            <VaultMeter hours={b.pendingHours || 0} pending={b.pendingIncome || 0} />

            {/* Business Operating Event */}
            {b.activeEvent && onResolveEvent && (
              <div className="rounded-[8px] border border-[#D9C49A]/45 bg-[#121933]/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    playTap();
                    setEventOpen((v) => !v);
                  }}
                  className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#EADBB8] animate-pulse shrink-0" />
                    <span className="text-[11.5px] font-editorial font-black text-[#EADBB8] truncate">
                      突发经营事件 · {b.activeEvent.title}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-[#B3B6C2] shrink-0">{eventOpen ? '收起 ▴' : '决策 ▾'}</span>
                </button>
                <AnimatePresence>
                  {eventOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-white/[0.07] px-2.5 pb-2.5 pt-2 space-y-2"
                    >
                      <p className="text-[11.5px] text-[#C8CEE0] leading-relaxed">{b.activeEvent.desc}</p>
                      <div className="space-y-1.5">
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
                              className={`w-full rounded-[6px] px-2.5 py-2 text-left border transition active:scale-[0.98] disabled:opacity-45 ${
                                isTianshuChoice
                                  ? 'bg-[#07202D]/85 border-[#63E6F2]/45 hover:border-[#63E6F2]'
                                  : isHeroineChoice
                                    ? 'bg-[#2C1020]/85 border-[#F0789A]/45 hover:border-[#F0789A]'
                                    : 'bg-[#0A1024]/85 border-white/12 hover:border-[#D9C49A]/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[12px] font-bold ${isTianshuChoice ? 'text-[#B9F6FB]' : isHeroineChoice ? 'text-[#FFC4D3]' : 'text-[#ECE6DA]'}`}>
                                  {c.label}
                                </span>
                                <span className="font-num text-[11px] text-[#7BE0A8] shrink-0">+{formatMoney(estCash)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-1 text-[10px]">
                                <span className="text-[#858999]">
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
              <div className="rounded-[8px] px-2.5 py-2 bg-[#0B2219]/90 border border-[#7BE0A8]/45 text-[11.5px] space-y-1">
                <div className="text-[#DDFCE9] leading-relaxed">{eventOutcome.resultText}</div>
                <div className="font-num text-[11px] text-[#7BE0A8] flex items-center gap-2.5">
                  <span>+{formatMoney(eventOutcome.cashReward)}</span>
                  {eventOutcome.sysPoints > 0 && <span className="text-[#B9F6FB]">积分 +{eventOutcome.sysPoints}</span>}
                  {eventOutcome.affectionGain > 0 && <span className="text-[#FFB3C6]">好感 +{eventOutcome.affectionGain}</span>}
                </div>
              </div>
            )}

            {heroines.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-[#7A7E8E] shrink-0">委派</span>
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
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-sm text-[8.5px] leading-[12px] bg-[#F0789A] text-white whitespace-nowrap">
                            契合
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="min-w-0 text-[10.5px] leading-snug">
                <div className="text-[#7A7E8E]">升至 Lv.{b.level + 1}</div>
                <div className="font-num text-[#7BE0A8]">
                  +{formatMoney(gainPerHour)}/时 · 估值 +{formatMoney((b.nextValuation || 0) - (b.currentValuation || 0))}
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => void onUpgrade()}
                className={`${canAffordUpgrade ? 'btn-brass' : 'btn-navy opacity-70'} shrink-0 px-3.5 py-2 text-[12.5px] font-num flex items-center gap-1`}
              >
                <GameIcon name="cash" size={16} shadow={false} /> 升级 {formatMoney(b.upgradeCost)}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11.5px] text-[#8C90A0] leading-relaxed line-clamp-2">{b.description}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10.5px] leading-snug min-w-0">
                <div className="text-[#7A7E8E]">收购后</div>
                <div className="font-num text-[#7BE0A8]">
                  {formatMoney(b.currentIncomePerHour)}/时 · 估值 {formatMoney(b.baseValuation)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!locked && (
                  <button disabled={busy} onClick={onDeal} className="btn-navy px-3 py-1.5 text-[12px] font-editorial">
                    谈判
                  </button>
                )}
                <button
                  disabled={busy || locked}
                  onClick={onBuy}
                  className={`${locked || !canAffordBuy ? 'btn-navy opacity-70' : 'gold-btn-shimmer'} px-3 py-1.5 text-[12px] font-num disabled:opacity-45`}
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
