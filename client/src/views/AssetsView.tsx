import React, { useState } from 'react';
import { Check, Coins, Crown, UserCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';

export const AssetsView: React.FC = () => {
  const {
    state,
    applyServerState,
    notifyTop,
    showError,
    setActiveTab,
    setSelectedDistrictId,
    setActivePropertyId,
  } = useGameStore();

  const [subTab, setSubTab] = useState<'garage' | 'biz' | 'props'>('garage');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!state) return null;
  const { player, businesses, properties, assets, assetSets, heroines } = state;
  const unlockedHeroines = heroines.filter((h: any) => h.unlocked);

  const featuredAsset =
    assets.find((a: any) => a.id === selectedAssetId) ||
    assets.find((a: any) => a.id === player.equippedCarId) ||
    assets[0];

  const collectOffline = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('/income/collect', { method: 'POST' });
      applyServerState(res.state);
      playCoinBurst();
      notifyTop('bank', '收益已入账', res.message);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buyBiz = async (businessId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/business/buy', { body: { businessId } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      notifyTop('system', '收购完成', '该产业已开始计入分红');
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upgradeBiz = async (businessId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/business/upgrade', { body: { businessId } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const assignHeroine = async (businessId: string, heroineId: string) => {
    try {
      const res = await apiRequest('/business/assign', { body: { businessId, heroineId } });
      applyServerState(res.state);
      playTap();
    } catch (e: any) {
      showError(e.message);
    }
  };

  const buyAsset = async (assetId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/asset/buy', { body: { assetId } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      notifyTop('bank', '已收入展厅', '估值已计入总身价');
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const equipCar = async (assetId: string) => {
    try {
      const res = await apiRequest('/asset/equip-car', { body: { assetId } });
      applyServerState(res.state);
      notifyTop('system', '座驾已更换', '已设为当前出行座驾');
    } catch (e: any) {
      showError(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#090A0D]">
      {/* Clean Hairline-Divided Cashflow Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-[#0C0D12]">
        <div className="min-w-0">
          <div className="text-[10.5px] text-[#848896]">产业分红与物业租金</div>
          <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
            <span className="font-editorial text-[19px] font-bold text-[#EBD4A2] tabular-nums">
              +<AnimatedNumber value={player.incomePerHour} />/时
            </span>
            <span className="text-xs text-emerald-400/90 tabular-nums">
              待收 <AnimatedNumber value={player.pendingIncome} highlightOnIncrease />
            </span>
          </div>
        </div>
        <button
          disabled={busy || player.pendingIncome <= 0}
          onClick={collectOffline}
          className={`px-4 py-2 rounded-[4px] text-xs flex items-center gap-1.5 shrink-0 transition ${
            player.pendingIncome > 0
              ? 'btn-brass clip-chamfer-sm'
              : 'border border-white/10 text-[#6F7380] cursor-not-allowed'
          }`}
        >
          <Coins className="w-3.5 h-3.5" /> {player.pendingIncome > 0 ? '收取' : '暂无'}
        </button>
      </div>

      {/* Hairline-Underlined Sub Navigation */}
      <div className="sticky top-0 z-20 bg-[#090A0D]/95 backdrop-blur-md border-b border-white/[0.08] px-4 flex items-center gap-6">
        {[
          { id: 'garage', label: '座驾与藏品' },
          { id: 'biz', label: '名下产业' },
          { id: 'props', label: '全城物业' },
        ].map(({ id, label }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                playTap();
                setSubTab(id as 'garage' | 'biz' | 'props');
              }}
              className={`py-3 text-xs tracking-wider border-b-2 transition ${
                active
                  ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
                  : 'text-[#7D818E] border-transparent hover:text-[#C5C8D3]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: STUDIO SHOWROOM + HORIZONTAL FILMSTRIP SELECTOR */}
      {subTab === 'garage' && featuredAsset && (
        <div className="pb-8">
          {/* Full-Bleed Dark Studio Pedestal */}
          <div className="relative h-56 w-full bg-[radial-gradient(ellipse_at_50%_78%,rgba(207,176,115,0.16),#090A0D_70%)] flex items-center justify-center px-6 pt-4 pb-6 overflow-hidden border-b border-white/[0.07]">
            <div className="absolute inset-0 film-grain pointer-events-none" />
            <div className="absolute inset-x-10 bottom-5 hairline-gold opacity-65" />
            <AnimatePresence mode="wait">
              <motion.img
                key={featuredAsset.id}
                src={featuredAsset.image}
                alt={featuredAsset.name}
                initial={{ opacity: 0, scale: 0.95, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                className="relative z-10 max-h-44 max-w-full object-contain drop-shadow-[0_20px_24px_rgba(0,0,0,0.88)]"
              />
            </AnimatePresence>

            {featuredAsset.equipped && (
              <span className="absolute top-3.5 left-4 text-[10px] tracking-[0.16em] text-[#EBD4A2] border-l-2 border-[#CFB073] pl-2">
                当前座驾
              </span>
            )}
            {featuredAsset.owned && !featuredAsset.equipped && (
              <span className="absolute top-3.5 left-4 text-[10px] tracking-[0.14em] text-emerald-400">
                已收藏
              </span>
            )}
          </div>

          {/* Editorial Spec Strip */}
          <div className="px-4 py-4 border-b border-white/[0.08] space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-editorial text-[19px] font-bold text-[#F5F2EA] tracking-wide">
                  {featuredAsset.name}
                </h3>
                <div className="text-xs text-[#CFB073] tabular-nums mt-0.5">
                  估值 {formatMoney(featuredAsset.valuation)}
                  {featuredAsset.racePower > 0 ? ` · 竞速马力 ${featuredAsset.racePower}` : ''}
                </div>
              </div>

              {featuredAsset.owned ? (
                featuredAsset.type === 'car' && !featuredAsset.equipped ? (
                  <button
                    onClick={() => equipCar(featuredAsset.id)}
                    className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs shrink-0"
                  >
                    设为座驾
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400 pt-1 shrink-0 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> {featuredAsset.equipped ? '使用中' : '已入库'}
                  </span>
                )
              ) : featuredAsset.dropOnly ? (
                <span className="text-[11px] text-[#8E92A0] pt-1 shrink-0">赌石 / 活动获取</span>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => buyAsset(featuredAsset.id)}
                  className="btn-brass clip-chamfer-sm px-3.5 py-1.5 text-xs shrink-0"
                >
                  全款 {formatMoney(featuredAsset.price)}
                </button>
              )}
            </div>
            <p className="text-xs text-[#9EA2AE] leading-relaxed">{featuredAsset.description}</p>
          </div>

          {/* Clean Horizontal Filmstrip Selector */}
          <div className="px-4 py-4 space-y-2.5">
            <div className="text-[11px] text-[#848896] tracking-wider">全部藏品 ({assets.length})</div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {assets.map((a: any) => {
                const selected = a.id === featuredAsset.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      playTap();
                      setSelectedAssetId(a.id);
                    }}
                    className={`shrink-0 w-32 p-2.5 text-left border transition ${
                      selected
                        ? 'bg-[#171510] border-[#CFB073]/65'
                        : 'bg-[#0F1015] border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="h-14 flex items-center justify-center relative">
                      <img
                        src={a.image}
                        alt={a.name}
                        className={`max-h-12 max-w-full object-contain ${!a.owned ? 'opacity-70' : ''}`}
                      />
                    </div>
                    <div className="mt-2">
                      <div className="text-[11.5px] font-semibold text-[#F3F0E8] truncate">{a.name}</div>
                      <div className="text-[10px] text-[#8E92A0] tabular-nums mt-0.5 truncate">
                        {a.equipped ? '驾驶中' : a.owned ? '已入库' : a.dropOnly ? '限定' : formatMoney(a.price)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hairline Set Bonuses */}
          <div className="px-4 divide-y divide-white/[0.07] border-t border-white/[0.07]">
            {assetSets.map((s: any) => (
              <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#F3F0E8] flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-[#CFB073]" />
                    <span>{s.name}</span>
                  </div>
                  <div className="text-[11px] text-[#8E92A0] mt-0.5">{s.bonusDesc}</div>
                </div>
                <span className={`text-[10.5px] shrink-0 ${s.completed ? 'text-[#EBD4A2]' : 'text-[#6F7380]'}`}>
                  {s.completed ? '已达成' : '收集中'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BUSINESSES — CLEAN ARCHITECTURAL ROWS */}
      {subTab === 'biz' && (
        <div className="px-4 py-4 pb-8 divide-y divide-white/[0.08]">
          {businesses.map((b: any) => {
            const assignedObj = unlockedHeroines.find((h: any) => h.id === b.assignedHeroineId);
            const locked = !b.owned && player.tier.tier < b.unlockTier;
            return (
              <div key={b.id} className="py-4 first:pt-0 space-y-3">
                <div className="relative aspect-[16/9] w-full bg-black overflow-hidden border border-white/[0.08]">
                  <img
                    src={b.image}
                    alt={b.name}
                    className={`w-full h-full object-cover ${locked ? 'grayscale opacity-50' : ''}`}
                  />
                  {b.owned && (
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/75 border-l-2 border-[#CFB073] text-[10px] text-[#EBD4A2] tabular-nums">
                      Lv.{b.level}
                    </span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-editorial text-[16px] font-bold text-[#F5F2EA]">{b.name}</h3>
                    <div className="text-xs text-[#CFB073] tabular-nums mt-0.5">
                      收益 {formatMoney(b.currentIncomePerHour)} / 时
                    </div>
                  </div>
                  {b.owned ? (
                    <button
                      disabled={busy}
                      onClick={() => upgradeBiz(b.id)}
                      className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs shrink-0"
                    >
                      升级 {formatMoney(b.upgradeCost)}
                    </button>
                  ) : (
                    <button
                      disabled={busy || locked}
                      onClick={() => buyBiz(b.id)}
                      className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs shrink-0 disabled:opacity-40"
                    >
                      {locked ? `阶层 Lv.${b.unlockTier}` : `收购 ${formatMoney(b.buyCost)}`}
                    </button>
                  )}
                </div>

                <p className="text-xs text-[#9EA2AE] leading-relaxed">{b.description}</p>

                {b.owned && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-[#B6B9C4] flex items-center gap-2">
                      {assignedObj ? (
                        <PortraitAvatar src={assignedObj.avatar} alt="" className="w-6 h-6" rounded="sm" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-[#848896]" />
                      )}
                      顾问
                    </span>
                    <select
                      value={b.assignedHeroineId || ''}
                      onChange={(e) => assignHeroine(b.id, e.target.value)}
                      className="bg-[#0E0F14] border border-white/12 rounded-[4px] px-2.5 py-1 text-xs text-[#EBD4A2] outline-none"
                    >
                      <option value="">暂未委派</option>
                      {unlockedHeroines.map((h: any) => (
                        <option key={h.id} value={h.id}>
                          {h.name} {b.preferredHeroine === h.id ? '(契合 +35%)' : '(+15%)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: PROPERTIES */}
      {subTab === 'props' && (
        <div className="px-4 py-4 pb-8 divide-y divide-white/[0.08]">
          {properties.map((p: any) => (
            <div key={p.id} className="py-4 first:pt-0 space-y-3">
              <div className="relative aspect-[16/9] w-full bg-black overflow-hidden border border-white/[0.08]">
                <img src={p.image || p.bg} alt={p.displayName} className="w-full h-full object-cover" />
                {p.isMain && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-[#CFB073] text-[#100E0B] text-[10px] font-bold">
                    主居所
                  </span>
                )}
                {p.owned && !p.isMain && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/75 border-l-2 border-emerald-400 text-emerald-300 text-[10px]">
                    已持有
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-editorial text-[16px] font-bold text-[#F5F2EA] truncate">{p.displayName}</h3>
                  <div className="text-xs text-[#CFB073] tabular-nums mt-0.5">
                    估值 {formatMoney(p.currentValuation)}
                    {p.currentRentPerHour > 0 ? ` · 租金 ${formatMoney(p.currentRentPerHour)}/时` : ''}
                    {p.energyBonus > 0 ? ` · 精力 +${p.energyBonus}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    playTap();
                    setActiveTab('map');
                    setSelectedDistrictId(p.districtId);
                    if (p.owned) setActivePropertyId(p.id);
                  }}
                  className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs shrink-0"
                >
                  {p.owned ? '前往' : '去置业'}
                </button>
              </div>
              <p className="text-xs text-[#9EA2AE] leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
