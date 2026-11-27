import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { DecoHeading, GameIcon, OrnateCorners, type GameIconName } from '../components/GameIcon';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BusinessCard } from './assets/BusinessCard';
import { Atmosphere } from '../components/Atmosphere';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';

export const AssetsView: React.FC = () => {
  const {
    state,
    assetsSubTab,
    setAssetsSubTab,
    applyServerState,
    notifyTop,
    showError,
    setActiveTab,
    setSelectedDistrictId,
    setActivePropertyId,
    openDeal,
    flyReward,
  } = useGameStore();

  const subTab = assetsSubTab;
  const setSubTab = setAssetsSubTab;
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [dir, setDir] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  /** Bring the top of the current tab's content right under the sticky tab bar (only if we scrolled past it). */
  const scrollToContentTop = (smooth: boolean) => {
    const el = scrollRef.current;
    const tabs = tabsRef.current;
    if (!el || !tabs) return;
    const target = tabs.offsetTop;
    if (el.scrollTop > target) el.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
  };

  const switchTab = (id: 'garage' | 'biz' | 'props') => {
    if (id === subTab) return;
    const order = ['garage', 'biz', 'props'];
    setDir(order.indexOf(id) > order.indexOf(subTab) ? 1 : -1);
    playTap();
    setSubTab(id);
  };

  // every tab starts at its top instead of inheriting the previous tab's scroll offset
  useEffect(() => {
    scrollToContentTop(false);
  }, [subTab]);

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
      const gained = Math.max(0, (res.state?.player?.cash || 0) - (useGameStore.getState().state?.player?.cash || 0));
      applyServerState(res.state);
      flyReward(gained);
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

  const upgradeBiz = async (businessId: string): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await apiRequest('/business/upgrade', { body: { businessId } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      return true;
    } catch (e: any) {
      showError(e.message);
      return false;
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

  const resolveBizEvent = async (businessId: string, eventId: string, choiceId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/business/event/resolve', { body: { businessId, eventId, choiceId } });
      applyServerState(res.state);
      if (res.cashReward > 0) flyReward(res.cashReward);
      return {
        resultText: res.resultText || '经营事件已妥善化解',
        cashReward: Number(res.cashReward || 0),
        sysPoints: Number(res.sysPoints || 0),
        affectionGain: Number(res.affectionGain || 0),
      };
    } catch (e: any) {
      showError(e.message);
      return null;
    } finally {
      setBusy(false);
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

  const SUBTABS: Array<{ id: 'garage' | 'biz' | 'props'; label: string; icon: GameIconName }> = [
    { id: 'garage', label: '座驾藏品', icon: 'key' },
    { id: 'biz', label: '名下产业', icon: 'briefcase' },
    { id: 'props', label: '全城物业', icon: 'nav_home' },
  ];

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-y-auto overflow-x-hidden no-scrollbar deco-texture"
      onTouchStart={(e) => {
        const t = e.touches[0];
        swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const st = swipeRef.current;
        swipeRef.current = null;
        if (!st) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - st.x;
        const dy = t.clientY - st.y;
        // horizontal flick switches tabs; vertical scrolling is left alone
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - st.t > 600) return;
        const order: Array<'garage' | 'biz' | 'props'> = ['garage', 'biz', 'props'];
        const next = order[order.indexOf(subTab) + (dx < 0 ? 1 : -1)];
        if (next) switchTab(next);
      }}
    >
      <Atmosphere />
      {/* Vault header */}
      <div className="px-3 pt-3">
        <div className="relative panel-brass rounded-[10px] px-3 py-3 flex items-center gap-3">
          <OrnateCorners size={18} inset={-4} />
          <GameIcon name="income" size={52} />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] text-[#B3B6C2] tracking-[0.2em]">产业分红 · 物业租金</div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-num text-[24px] font-semibold text-[#EADBB8] leading-none">
                +<AnimatedNumber value={player.incomePerHour} />
              </span>
              <span className="text-[11px] text-[#8C90A0]">/ 时</span>
            </div>
            <div className="text-[11px] text-[#7BE0A8] mt-1 font-num tracking-wide">
              待收 <AnimatedNumber value={player.pendingIncome} highlightOnIncrease />
              {businesses.some((x: any) => x.owned && x.pendingHours >= 11.95) && (
                <span className="ml-2 text-[#FF8FA6] animate-pulse">金库已满，快收取</span>
              )}
            </div>
          </div>
          <button
            disabled={busy || player.pendingIncome <= 0}
            onClick={collectOffline}
            className={`shrink-0 px-4 py-2 text-[13px] font-editorial flex items-center gap-1 ${
              player.pendingIncome > 0 ? 'gold-btn-shimmer' : 'btn-navy opacity-60'
            }`}
          >
            {player.pendingIncome > 0 ? '一键收取' : '暂无收益'}
          </button>
        </div>
      </div>

      {/* Segmented tabs */}
      {/* sticky elements report their stuck offset, so measure from this marker instead */}
      <div ref={tabsRef} aria-hidden />
      <div className="sticky top-0 z-20 px-3 pt-1 mt-0.5 bg-[#04050A]/92 backdrop-blur-md border-b border-white/[0.05]">
        <div className="grid grid-cols-3">
          {SUBTABS.map(({ id, label }) => (
            <button
              key={id}
              data-active={subTab === id}
              onClick={() => switchTab(id)}
              className="relative route-tab v2 font-editorial"
            >
              {label}
              {id === 'biz' && businesses.some((b: any) => b.owned && b.activeEvent) && (
                <span className="red-dot top-0.5 right-1.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={subTab}
        custom={dir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * 36 }),
          center: { opacity: 1, x: 0 },
          leave: (d: number) => ({ opacity: 0, x: d * -36 }),
        }}
        initial="enter"
        animate="center"
        exit="leave"
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="pt-2"
      >
      {/* TAB 1: SHOWROOM */}
      {subTab === 'garage' && featuredAsset && (
        <div className="pb-8">
          <div className="relative h-[230px] mx-3 rounded-[12px] overflow-hidden border border-[#D9C49A]/30"
            style={{
              background:
                'radial-gradient(70% 55% at 50% 30%, rgba(120,140,220,0.25) 0%, transparent 70%), radial-gradient(60% 30% at 50% 88%, rgba(217,196,154,0.35) 0%, transparent 70%), linear-gradient(180deg,#0E1119 0%,#05070D 100%)',
            }}
          >
            {/* spotlight beams */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[70%] h-[120%] opacity-40 pointer-events-none"
              style={{ background: 'conic-gradient(from 160deg at 50% 0%, transparent 0deg, rgba(255,240,210,0.35) 20deg, transparent 40deg)' }} />
            {/* podium */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[78%] h-[38px] rounded-[50%] pointer-events-none"
              style={{
                background: 'radial-gradient(50% 50% at 50% 50%, rgba(30,40,80,0.95) 0%, rgba(14,20,42,0.95) 70%)',
                boxShadow: '0 0 0 2px rgba(217,196,154,0.55), 0 0 28px rgba(217,196,154,0.35), inset 0 4px 10px rgba(0,0,0,0.6)',
              }} />
            <div className="absolute inset-x-0 bottom-9 z-10 flex justify-center pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.img
                key={featuredAsset.id}
                src={featuredAsset.image}
                alt={featuredAsset.name}
                initial={{ opacity: 0, scale: 0.94, x: 30 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.96, x: -30 }}
                transition={{ duration: 0.28 }}
                className="max-h-[170px] max-w-[86%] object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.85)]"
              />
            </AnimatePresence>
            </div>

            <div className="absolute top-3 left-3 z-20">
              {featuredAsset.equipped ? (
                <span className="px-2 py-[2px] rounded-sm text-[10px] font-black tracking-[0.2em] text-[#19130A] bg-gradient-to-b from-[#EEE2C6] to-[#C4AE80]">当前座驾</span>
              ) : featuredAsset.owned ? (
                <span className="px-2 py-[2px] rounded-sm text-[10px] font-bold tracking-[0.2em] text-white bg-emerald-600/90">已收藏</span>
              ) : (
                <span className="px-2 py-[2px] rounded-sm text-[10px] font-bold tracking-[0.2em] text-[#B3B6C2] bg-black/50 border border-white/15">未拥有</span>
              )}
            </div>
          </div>

          <div className="relative mx-3 -mt-2 z-10 px-2 pt-1 pb-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-editorial text-[20px] font-black text-[#ECE6DA] truncate">{featuredAsset.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 font-num text-[13px] text-[#EADBB8]">
                    <GameIcon name="cash" size={18} /> {formatMoney(featuredAsset.valuation)}
                  </span>
                  {featuredAsset.racePower > 0 && (
                    <span className="flex items-center gap-1 font-num text-[13px] text-[#B9F6FB]">
                      <GameIcon name="race" size={18} /> {featuredAsset.racePower}
                    </span>
                  )}
                </div>
              </div>

              {featuredAsset.owned ? (
                featuredAsset.type === 'car' && !featuredAsset.equipped ? (
                  <button onClick={() => equipCar(featuredAsset.id)} className="btn-brass px-4 py-2 text-[13px] font-editorial shrink-0">
                    设为座驾
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400 pt-1 shrink-0 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> {featuredAsset.equipped ? '使用中' : '已入库'}
                  </span>
                )
              ) : featuredAsset.dropOnly ? (
                <span className="text-[11px] text-[#858999] pt-1 shrink-0">赌石 / 活动获取</span>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => buyAsset(featuredAsset.id)}
                  className="gold-btn-shimmer px-3.5 py-2 text-[12.5px] shrink-0 font-num"
                >
                  购入 {formatMoney(featuredAsset.price)}
                </button>
              )}
            </div>
            <p className="text-[12px] text-[#8C90A0] leading-relaxed">{featuredAsset.description}</p>
          </div>

          <div className="px-3 pt-5 space-y-2.5">
            <DecoHeading title="珍藏陈列" aside={`${assets.filter((a: any) => a.owned).length} / ${assets.length}`} />
            {/* display shelves: three pieces per shelf, each standing on a lit ledge, no boxes */}
            <div className="space-y-1">
              {Array.from({ length: Math.ceil(assets.length / 3) }, (_, row) => (
                <div key={row} className="relative pt-2">
                  <div className="grid grid-cols-3">
                    {assets.slice(row * 3, row * 3 + 3).map((a: any) => {
                      const selected = a.id === featuredAsset.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => {
                            playTap();
                            setSelectedAssetId(a.id);
                            scrollToContentTop(true);
                          }}
                          className="relative flex flex-col items-center active:scale-95 transition"
                        >
                          {selected && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[70px] pointer-events-none" style={{ background: 'conic-gradient(from 160deg at 50% 0%, transparent 0deg, rgba(255,240,210,0.28) 20deg, transparent 40deg)' }} />
                          )}
                          <span className="relative h-[62px] w-full flex items-end justify-center">
                            <img
                              src={a.image}
                              alt={a.name}
                              className={`max-h-[56px] max-w-[88%] object-contain drop-shadow-[0_8px_6px_rgba(0,0,0,0.75)] ${
                                !a.owned ? 'brightness-[0.35] saturate-0' : ''
                              } ${selected ? 'scale-110' : ''} transition`}
                            />
                            {!a.owned && <GameIcon name="lock" size={16} className="absolute top-1 right-[18%] opacity-70" />}
                          </span>
                          <span className={`mt-3 text-[11px] font-bold truncate max-w-[92%] ${selected ? 'text-[#EADBB8]' : a.owned ? 'text-[#ECE6DA]' : 'text-[#7A7E8E]'}`}>
                            {a.name}
                          </span>
                          <span className={`text-[10px] font-num ${a.owned ? 'text-[#7BE0A8]' : 'text-[#5E6273]'}`}>
                            {a.equipped ? '驾驶中' : a.owned ? '已入库' : a.dropOnly ? '限定' : formatMoney(a.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* the ledge */}
                  <span className="absolute left-2 right-2 top-[70px] h-[6px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(217,196,154,0.35),transparent)] pointer-events-none" />
                  <span className="absolute left-4 right-4 top-[72px] h-px bg-gradient-to-r from-transparent via-[#D9C49A]/55 to-transparent pointer-events-none" />
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 pt-5 space-y-2">
            <DecoHeading title="套装羁绊" />
            {assetSets.map((s: any) => (
              <div key={s.id} className="relative px-1 py-2.5 flex items-center gap-3 border-b border-white/[0.06] last:border-b-0">
                <GameIcon name="crown" size={30} className={s.completed ? '' : 'grayscale opacity-60'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-editorial font-black text-[#ECE6DA]">{s.name}</div>
                  <div className="text-[11px] text-[#858999] mt-0.5">{s.bonusDesc}</div>
                </div>
                <span
                  className={`text-[10.5px] shrink-0 px-2 py-[2px] rounded-full border ${
                    s.completed ? 'text-[#19130A] bg-[#D9C49A] border-[#EADBB8]' : 'text-[#7A7E8E] border-white/15'
                  }`}
                >
                  {s.completed ? '已激活' : '收集中'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BUSINESSES */}
      {subTab === 'biz' && (
        <div className="px-3 pt-1 pb-8 space-y-3">
          {/* portfolio strip */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '名下产业', value: `${businesses.filter((x: any) => x.owned).length} / ${businesses.length}` },
              {
                label: '产业时薪',
                value: formatMoney(businesses.filter((x: any) => x.owned).reduce((t: number, x: any) => t + (x.currentIncomePerHour || 0), 0)),
              },
              {
                label: '产业估值',
                value: formatMoney(businesses.filter((x: any) => x.owned).reduce((t: number, x: any) => t + (x.currentValuation || 0), 0)),
              },
            ].map((it) => (
              <div key={it.label} className="panel-arch rounded-[8px] px-2.5 py-2">
                <div className="text-[9.5px] tracking-[0.2em] text-[#7A7E8E]">{it.label}</div>
                <div className="font-num text-[14px] text-[#EADBB8] mt-0.5 truncate">{it.value}</div>
              </div>
            ))}
          </div>

          {businesses.map((b: any) => (
            <BusinessCard
              key={b.id}
              b={b}
              cash={player.cash}
              heroines={unlockedHeroines}
              tierName={(t) => (state.map?.tiers || []).find((x: any) => x.tier === t)?.name || `阶层 ${t}`}
              locked={!b.owned && player.tier.tier < b.unlockTier}
              busy={busy}
              onUpgrade={() => upgradeBiz(b.id)}
              onBuy={() => buyBiz(b.id)}
              onDeal={() => {
                playTap();
                openDeal({ kind: 'business', id: b.id });
              }}
              onAssign={(hid) => assignHeroine(b.id, hid)}
              onResolveEvent={(evId, chId) => resolveBizEvent(b.id, evId, chId)}
            />
          ))}
        </div>
      )}

      {/* TAB 3: PROPERTIES */}
      {subTab === 'props' && (
        <div className="px-3 pt-1 pb-8 space-y-3">
          {properties.map((p: any) => {
            const dist = (state.map?.districts || []).find((d: any) => d.id === p.districtId);
            const reqTier = Math.max(Number(p.unlockTier || 1), Number(dist?.unlockTier || 1));
            const propLocked = !p.owned && (player.tier.tier < reqTier || (dist && !dist.unlocked));
            const reqTierName = (state.map?.tiers || []).find((x: any) => x.tier === reqTier)?.name || `阶层 ${reqTier}`;
            const earnsRent = p.currentRentPerHour > 0 && !(p.isMain && p.type === 'residence');
            return (
            <div key={p.id} className={`relative rounded-[10px] overflow-hidden ${p.isMain ? 'panel-brass' : 'panel-arch'}`}>
              <div className="relative h-[128px] w-full overflow-hidden">
                <img
                  src={p.image || p.bg}
                  alt={p.displayName}
                  className={`w-full h-full object-cover ${propLocked ? 'grayscale brightness-50' : !p.owned ? 'brightness-75' : ''}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/25 to-transparent" />
                {p.isMain && (
                  <span className="absolute top-2 left-2 px-2 py-[2px] rounded-sm text-[10px] font-black tracking-[0.2em] text-[#19130A] bg-gradient-to-b from-[#EEE2C6] to-[#C4AE80]">
                    主居所
                  </span>
                )}
                {p.owned && !p.isMain && (
                  <span className="absolute top-2 left-2 px-2 py-[2px] rounded-sm text-[10px] font-bold tracking-[0.2em] text-white bg-emerald-600/90">
                    已持有
                  </span>
                )}
                {propLocked && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <GameIcon name="lock" size={32} />
                    <span className="text-[11px] text-[#B3B6C2] text-stroke-dark">晋升「{reqTierName}」解锁</span>
                  </span>
                )}
                <div className="absolute left-3 right-3 bottom-2">
                  <h3 className="font-editorial text-[18px] font-black text-[#ECE6DA] text-stroke-dark truncate">{p.displayName}</h3>
                </div>
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-3 flex-wrap font-num text-[12px]">
                  <span className="flex items-center gap-1 text-[#EADBB8]">
                    <GameIcon name="cash" size={16} /> 估值 {formatMoney(p.currentValuation)}
                  </span>
                  {earnsRent ? (
                    <span className="flex items-center gap-1 text-[#7BE0A8]">
                      <GameIcon name="income" size={16} /> {formatMoney(p.currentRentPerHour)}/时
                    </span>
                  ) : p.isMain && p.type === 'residence' ? (
                    <span className="text-[11px] text-[#8C90A0]">自住主宅</span>
                  ) : null}
                  {p.energyBonus > 0 && (
                    <span className="flex items-center gap-1 text-[#B9F6FB]">
                      <GameIcon name="energy" size={16} /> +{p.energyBonus}
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-[11.5px] text-[#8C90A0] leading-relaxed line-clamp-2">{p.description}</p>
                  <button
                    disabled={propLocked}
                    onClick={() => {
                      if (propLocked) return;
                      playTap();
                      setActiveTab('map');
                      setSelectedDistrictId(p.districtId);
                      if (p.owned) setActivePropertyId(p.id);
                    }}
                    className={`${p.owned ? 'btn-navy' : propLocked ? 'btn-navy opacity-45' : 'btn-brass'} px-4 py-1.5 text-[12px] shrink-0 font-editorial`}
                  >
                    {p.owned ? '前往' : propLocked ? '未解锁' : '去置业'}
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
      </motion.div>
      </AnimatePresence>
    </div>
  );
};
