import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { DecoHeading, GameIcon } from '../components/GameIcon';
import { BizSkyline } from './assets/BizSkyline';
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
    openSpot,
    focusBizId,
    focusBusiness,
  } = useGameStore();

  const subTab = assetsSubTab;
  const setSubTab = setAssetsSubTab;
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedBizId, setSelectedBizId] = useState<string>('');
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

  const ORDER: Array<'biz' | 'props' | 'garage'> = ['biz', 'props', 'garage'];
  const switchTab = (id: 'garage' | 'biz' | 'props') => {
    if (id === subTab) return;
    const order = ORDER;
    setDir(order.indexOf(id) > order.indexOf(subTab) ? 1 : -1);
    playTap();
    setSubTab(id);
  };

  // every tab starts at its top instead of inheriting the previous tab's scroll offset
  useEffect(() => {
    scrollToContentTop(false);
  }, [subTab]);

  // sent here from the map (产业 spot → 去经营): preselect that building
  useEffect(() => {
    if (!focusBizId) return;
    setSelectedBizId(focusBizId);
    focusBusiness(null);
  }, [focusBizId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;
  const { player, businesses, properties, assets, assetSets, heroines } = state;
  const unlockedHeroines = heroines.filter((h: any) => h.unlocked);


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

  const equipCar = async (assetId: string) => {
    try {
      const res = await apiRequest('/asset/equip-car', { body: { assetId } });
      applyServerState(res.state);
      notifyTop('system', '座驾已更换', '已设为当前出行座驾');
    } catch (e: any) {
      showError(e.message);
    }
  };

  const SUBTABS: Array<{ id: 'garage' | 'biz' | 'props'; label: string }> = [
    { id: 'biz', label: '名下产业' },
    { id: 'props', label: '全城物业' },
    { id: 'garage', label: '座驾藏品' },
  ];

  const districts: any[] = state.map?.districts || [];
  const tierName = (t: number) => (state.map?.tiers || []).find((x: any) => x.tier === t)?.name || `阶层 ${t}`;
  /** where on the map a thing lives: { district, spot } */
  const spotOf = (pred: (sp: any) => boolean) => {
    for (const d of districts) {
      const sp = (d.spots || []).find(pred);
      if (sp) return { d, sp };
    }
    return null;
  };

  // ---- holdings composition ----
  const ownedBiz = businesses.filter((x: any) => x.owned);
  const ownedProps = properties.filter((x: any) => x.owned);
  const ownedAssets = assets.filter((x: any) => x.owned);
  const bizVal = ownedBiz.reduce((t: number, x: any) => t + (x.currentValuation || 0), 0);
  const propVal = ownedProps.reduce((t: number, x: any) => t + (x.currentValuation || 0), 0);
  const assetVal = ownedAssets.reduce((t: number, x: any) => t + (x.valuation || 0), 0);
  const parts = [
    { label: '产业', v: bizVal, c: '#E6D6B2' },
    { label: '物业', v: propVal, c: '#9C8660' },
    { label: '藏品', v: assetVal, c: '#6E7FA8' },
    { label: '现金', v: Math.max(0, player.cash), c: '#3B4256' },
  ];
  const partTotal = Math.max(1, parts.reduce((t, x) => t + x.v, 0));

  const selBiz = businesses.find((b: any) => b.id === selectedBizId) || businesses.find((b: any) => b.activeEvent) || ownedBiz[0] || businesses[0];

  const featuredAsset =
    assets.find((a: any) => a.id === selectedAssetId) || assets.find((a: any) => a.id === player.equippedCarId) || assets[0];
  const featuredShop = featuredAsset ? spotOf((sp) => sp.kind === 'showroom' && (sp.stock || []).includes(featuredAsset.id)) : null;

  const GROUPS = [
    { id: 'car', title: '座驾', en: 'GARAGE', match: (a: any) => a.type === 'car' },
    { id: 'vehicle', title: '载具与领地', en: 'FLEET', match: (a: any) => a.type === 'vehicle' },
    { id: 'collectible', title: '珍藏', en: 'COLLECTION', match: (a: any) => a.type === 'collectible' },
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
        const next = ORDER[ORDER.indexOf(subTab) + (dx < 0 ? 1 : -1)];
        if (next) switchTab(next);
      }}
    >
      <Atmosphere />

      {/* ---------- masthead: income + composition of everything you own ---------- */}
      <div className="relative px-4 pt-4 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="label-en">HOLDINGS · 每小时进账</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="font-num text-[30px] leading-none text-[var(--ivory-2)]">
                +<AnimatedNumber value={player.incomePerHour} />
              </span>
              <span className="text-[11px] text-[#8C90A0]">/ 时</span>
            </div>
            <div className="text-[11px] text-[#7BE0A8] mt-1.5 font-num">
              待收 <AnimatedNumber value={player.pendingIncome} highlightOnIncrease />
              {businesses.some((x: any) => x.owned && x.pendingHours >= 11.95) && <span className="ml-2 text-[#FF8FA6] animate-pulse">有金库已满</span>}
            </div>
          </div>
          <button
            disabled={busy || player.pendingIncome <= 0}
            onClick={collectOffline}
            className={`shrink-0 px-5 py-2.5 text-[13px] font-editorial tracking-[0.2em] ${player.pendingIncome > 0 ? 'btn-champagne' : 'btn-ghost opacity-60'}`}
          >
            {player.pendingIncome > 0 ? '收取' : '暂无收益'}
          </button>
        </div>
        <div className="mt-3.5 flex h-[5px] rounded-full overflow-hidden bg-white/[0.04]">
          {parts.map((x) => (
            <motion.span key={x.label} initial={false} animate={{ width: `${(x.v / partTotal) * 100}%` }} transition={{ duration: 0.6 }} style={{ background: x.c }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px]">
          {parts.map((x) => (
            <span key={x.label} className="flex items-center gap-1 text-[#8C90A0]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.c }} />
              {x.label} <span className="font-num text-[#B7B3AA]">{formatMoney(x.v)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* sticky elements report their stuck offset, so measure from this marker instead */}
      <div ref={tabsRef} aria-hidden />
      <div className="sticky top-0 z-20 px-3 pt-1 bg-[#04050A]/92 backdrop-blur-md border-b border-white/[0.05]">
        <div className="grid grid-cols-3">
          {SUBTABS.map(({ id, label }) => (
            <button key={id} data-active={subTab === id} onClick={() => switchTab(id)} className="relative route-tab v2 font-editorial">
              {label}
              {id === 'biz' && businesses.some((b: any) => b.owned && b.activeEvent) && <span className="red-dot top-0.5 right-1.5" />}
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
          className="pt-1"
        >
          {/* ================= 产业 ================= */}
          {subTab === 'biz' && selBiz && (
            <div className="px-3 pb-10">
              <BizSkyline
                businesses={businesses}
                tier={player.tier.tier}
                selectedId={selBiz.id}
                onSelect={(id) => {
                  playTap();
                  setSelectedBizId(id);
                }}
              />

              <div className="grid grid-cols-3 divide-x divide-white/[0.06] py-3 border-b border-white/[0.06]">
                {[
                  { label: '名下产业', value: `${ownedBiz.length} / ${businesses.length}` },
                  { label: '产业时薪', value: formatMoney(ownedBiz.reduce((t: number, x: any) => t + (x.currentIncomePerHour || 0), 0)) },
                  { label: '产业估值', value: formatMoney(bizVal) },
                ].map((it) => (
                  <div key={it.label} className="text-center">
                    <div className="text-[9.5px] tracking-[0.25em] text-[#6D7183]">{it.label}</div>
                    <div className="font-num text-[15px] text-[var(--ivory-2)] mt-1">{it.value}</div>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <div className="flex items-end justify-between mb-2.5 px-1">
                  <div>
                    <div className="label-en">{selBiz.owned ? `LEVEL ${selBiz.level}` : player.tier.tier < selBiz.unlockTier ? 'LOCKED' : 'FOR SALE'}</div>
                    <div className="font-editorial text-[20px] font-black ink-title mt-1">{selBiz.name}</div>
                  </div>
                  {(() => {
                    const loc = spotOf((sp) => sp.kind === 'business' && sp.ref === selBiz.id);
                    return loc && loc.d.unlocked ? (
                      <button
                        onClick={() => {
                          playTap();
                          openSpot(loc.d.id, loc.sp.id);
                        }}
                        className="text-[11px] text-[var(--champagne)] flex items-center gap-1 pb-0.5"
                      >
                        <GameIcon name="nav_map" size={16} shadow={false} /> {loc.d.name}
                      </button>
                    ) : null;
                  })()}
                </div>
                <BusinessCard
                  key={selBiz.id}
                  b={selBiz}
                  cash={player.cash}
                  heroines={unlockedHeroines}
                  tierName={tierName}
                  locked={!selBiz.owned && player.tier.tier < selBiz.unlockTier}
                  busy={busy}
                  onUpgrade={() => upgradeBiz(selBiz.id)}
                  onBuy={() => buyBiz(selBiz.id)}
                  onDeal={() => {
                    playTap();
                    openDeal({ kind: 'business', id: selBiz.id });
                  }}
                  onAssign={(hid) => assignHeroine(selBiz.id, hid)}
                  onResolveEvent={(evId, chId) => resolveBizEvent(selBiz.id, evId, chId)}
                />
              </div>

              {/* ledger: every business on one line, for scanning */}
              <div className="pt-6">
                <DecoHeading title="经营台账" aside={`${ownedBiz.length} 家在营`} />
                <div className="mt-1">
                  {businesses.map((b: any) => {
                    const locked = !b.owned && player.tier.tier < b.unlockTier;
                    const status = b.activeEvent
                      ? { t: '待决策', c: 'text-[#FF8FA6]' }
                      : b.owned && b.pendingHours >= 11.95
                        ? { t: '金库满', c: 'text-[#7BE0A8]' }
                        : b.owned
                          ? { t: `${(b.pendingHours || 0).toFixed(1)}h`, c: 'text-[#8C90A0]' }
                          : locked
                            ? { t: tierName(b.unlockTier), c: 'text-[#5E6273]' }
                            : { t: '可收购', c: 'text-[var(--champagne)]' };
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          playTap();
                          setSelectedBizId(b.id);
                          scrollToContentTop(true);
                        }}
                        className={`w-full flex items-center gap-3 py-2.5 px-1 border-b border-white/[0.05] text-left ${b.id === selBiz.id ? 'bg-white/[0.025]' : ''}`}
                      >
                        <span className="relative w-[44px] h-[30px] shrink-0 overflow-hidden rounded-[3px]">
                          <img src={b.image} alt="" className={`w-full h-full object-cover ${locked ? 'grayscale brightness-50' : !b.owned ? 'brightness-75' : ''}`} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] font-editorial font-black truncate ${locked ? 'text-[#6D7183]' : 'text-[#E4DED2]'}`}>{b.name}</span>
                          <span className="block text-[10.5px] font-num text-[#6D7183] mt-0.5">{b.owned ? `Lv.${b.level} · ${formatMoney(b.currentIncomePerHour)}/时` : `收购 ${formatMoney(b.buyCost)}`}</span>
                        </span>
                        <span className={`text-[10.5px] font-num shrink-0 ${status.c}`}>{status.t}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= 物业 ================= */}
          {subTab === 'props' && (
            <div className="px-3 pb-10">
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] py-3 border-b border-white/[0.06]">
                {[
                  { label: '持有物业', value: `${ownedProps.length} / ${properties.length}` },
                  {
                    label: '租金/时',
                    value: formatMoney(ownedProps.filter((p: any) => !(p.isMain && p.type === 'residence')).reduce((t: number, p: any) => t + (p.currentRentPerHour || 0), 0)),
                  },
                  { label: '物业估值', value: formatMoney(propVal) },
                ].map((it) => (
                  <div key={it.label} className="text-center">
                    <div className="text-[9.5px] tracking-[0.25em] text-[#6D7183]">{it.label}</div>
                    <div className="font-num text-[15px] text-[var(--ivory-2)] mt-1">{it.value}</div>
                  </div>
                ))}
              </div>

              {districts
                .filter((d: any) => properties.some((p: any) => p.districtId === d.id))
                .map((d: any) => (
                  <section key={d.id} className="pt-5">
                    <div className="flex items-end justify-between px-1 pb-2">
                      <div>
                        <div className="label-en">{d.tag}</div>
                        <div className={`font-editorial text-[17px] font-black mt-1 tracking-[0.15em] ${d.unlocked ? 'ink-title' : 'text-[#5E6273]'}`}>{d.name}</div>
                      </div>
                      {d.unlocked ? (
                        <button
                          onClick={() => {
                            playTap();
                            setActiveTab('map');
                            setSelectedDistrictId(d.id);
                          }}
                          className="text-[11px] text-[var(--champagne)] flex items-center gap-1 pb-0.5"
                        >
                          <GameIcon name="nav_map" size={16} shadow={false} /> 去逛逛
                        </button>
                      ) : (
                        <span className="text-[10.5px] text-[#5E6273] pb-0.5">晋升「{tierName(d.unlockTier)}」开放</span>
                      )}
                    </div>
                    {properties
                      .filter((p: any) => p.districtId === d.id)
                      .map((p: any) => {
                        const reqTier = Math.max(Number(p.unlockTier || 1), Number(d.unlockTier || 1));
                        const locked = !p.owned && player.tier.tier < reqTier;
                        const earnsRent = p.currentRentPerHour > 0 && !(p.isMain && p.type === 'residence');
                        const loc = spotOf((sp) => sp.kind === 'property' && sp.ref === p.id);
                        return (
                          <button
                            key={p.id}
                            disabled={locked}
                            onClick={() => {
                              playTap();
                              if (p.owned) {
                                setActiveTab('map');
                                setSelectedDistrictId(p.districtId);
                                setActivePropertyId(p.id);
                              } else if (loc) openSpot(loc.d.id, loc.sp.id);
                            }}
                            className="relative w-full h-[92px] mb-2 overflow-hidden text-left flex items-end active:scale-[0.99] transition"
                          >
                            <img
                              src={p.image || p.bg}
                              alt=""
                              className={`absolute inset-0 w-full h-full object-cover ${locked ? 'grayscale brightness-[0.3]' : !p.owned ? 'brightness-[0.55]' : 'brightness-[0.8]'}`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-[#04050A] via-[#04050A]/70 to-transparent" />
                            {p.owned && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--champagne)]" />}
                            <div className="relative w-full px-3.5 pb-2.5 flex items-end justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`text-[10px] tracking-[0.25em] ${p.isMain ? 'text-[var(--champagne)]' : p.owned ? 'text-[#7BE0A8]' : 'text-[#6D7183]'}`}>
                                  {p.isMain ? '主居所' : p.owned ? '已持有' : locked ? `晋升「${tierName(reqTier)}」` : '可置业'}
                                </div>
                                <div className={`font-editorial text-[16px] font-black mt-0.5 truncate ${locked ? 'text-[#6D7183]' : 'text-[#ECE6DA]'}`}>{p.displayName}</div>
                                <div className="mt-1 flex items-center gap-3 font-num text-[11px]">
                                  <span className="text-[var(--champagne)]">{formatMoney(p.owned ? p.currentValuation : p.price)}</span>
                                  {earnsRent && <span className="text-[#7BE0A8]">租 {formatMoney(p.currentRentPerHour)}/时</span>}
                                  {p.energyBonus > 0 && <span className="text-[#B9F6FB]">精力 +{p.energyBonus}</span>}
                                </div>
                              </div>
                              {!locked && <span className="shrink-0 text-[11px] text-[#B7B3AA] font-editorial">{p.owned ? '回家 ›' : '看房 ›'}</span>}
                            </div>
                          </button>
                        );
                      })}
                  </section>
                ))}
            </div>
          )}

          {/* ================= 座驾藏品 ================= */}
          {subTab === 'garage' && featuredAsset && (
            <div className="pb-10">
              {/* stage */}
              <div className="relative h-[220px]">
                <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 50% 35%, rgba(120,140,220,0.16), transparent 70%)' }} />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-[70%] h-[110%] opacity-40 pointer-events-none" style={{ background: 'conic-gradient(from 160deg at 50% 0%, transparent 0deg, rgba(255,240,210,0.32) 20deg, transparent 40deg)' }} />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-5 w-[72%] h-[26px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(217,196,154,0.4),transparent)]" />
                <div className="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={featuredAsset.id}
                      src={featuredAsset.image}
                      alt={featuredAsset.name}
                      initial={{ opacity: 0, scale: 0.94, x: 30 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.96, x: -30 }}
                      transition={{ duration: 0.28 }}
                      className={`max-h-[160px] max-w-[84%] object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.85)] ${featuredAsset.owned ? '' : 'brightness-[0.55] saturate-[0.5]'}`}
                    />
                  </AnimatePresence>
                </div>
                <div className="absolute top-3 left-4 label-en">{featuredAsset.equipped ? 'NOW DRIVING' : featuredAsset.owned ? 'IN COLLECTION' : 'NOT OWNED'}</div>
              </div>

              <div className="px-4 -mt-1 space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-editorial text-[20px] font-black ink-title truncate">{featuredAsset.name}</h3>
                    <div className="flex items-center gap-4 mt-1 font-num text-[13px]">
                      <span className="flex items-center gap-1 text-[var(--champagne)]">
                        <GameIcon name="cash" size={16} shadow={false} /> 估值 {formatMoney(featuredAsset.valuation)}
                      </span>
                      {featuredAsset.racePower > 0 && (
                        <span className="flex items-center gap-1 text-[#B9F6FB]">
                          <GameIcon name="race" size={16} shadow={false} /> 性能 {featuredAsset.racePower}
                        </span>
                      )}
                    </div>
                  </div>
                  {featuredAsset.owned ? (
                    featuredAsset.type === 'car' && !featuredAsset.equipped ? (
                      <button onClick={() => equipCar(featuredAsset.id)} className="btn-champagne px-4 py-2 text-[13px] font-editorial shrink-0">
                        设为座驾
                      </button>
                    ) : (
                      <span className="text-[12px] text-[#7BE0A8] shrink-0 flex items-center gap-1 pb-1">
                        <Check className="w-3.5 h-3.5" /> {featuredAsset.equipped ? '驾驶中' : '已入库'}
                      </span>
                    )
                  ) : featuredShop ? (
                    <button
                      disabled={!featuredShop.d.unlocked}
                      onClick={() => {
                        playTap();
                        openSpot(featuredShop.d.id, featuredShop.sp.id);
                      }}
                      className={`${featuredShop.d.unlocked ? 'btn-champagne' : 'btn-ghost opacity-60'} px-3.5 py-2 text-[12.5px] font-editorial shrink-0`}
                    >
                      {featuredShop.d.unlocked ? `去${featuredShop.sp.name}` : `${featuredShop.d.name}未开放`}
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#858999] shrink-0 pb-1">赌石 / 活动获取</span>
                  )}
                </div>
                <p className="text-[12px] text-[#8C90A0] leading-relaxed">{featuredAsset.description}</p>
                {!featuredAsset.owned && featuredShop && (
                  <p className="text-[11px] text-[#6D7183]">
                    在 {featuredShop.d.name} · {featuredShop.sp.name} 有售 <span className="font-num text-[var(--champagne)]">{formatMoney(featuredAsset.price)}</span>
                  </p>
                )}
              </div>

              {GROUPS.map((g) => {
                const list = assets.filter(g.match);
                if (!list.length) return null;
                return (
                  <section key={g.id} className="px-3 pt-6">
                    <div className="flex items-end justify-between px-1">
                      <div>
                        <div className="label-en">{g.en}</div>
                        <div className="font-editorial text-[16px] font-black ink-title mt-1 tracking-[0.15em]">{g.title}</div>
                      </div>
                      <span className="font-num text-[11px] text-[#6D7183] pb-0.5">
                        {list.filter((a: any) => a.owned).length} / {list.length}
                      </span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {Array.from({ length: Math.ceil(list.length / 3) }, (_, row) => (
                        <div key={row} className="relative pt-2">
                          <div className="grid grid-cols-3">
                            {list.slice(row * 3, row * 3 + 3).map((a: any) => {
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
                                      className={`max-h-[56px] max-w-[88%] object-contain drop-shadow-[0_8px_6px_rgba(0,0,0,0.75)] ${!a.owned ? 'brightness-[0.35] saturate-0' : ''} ${selected ? 'scale-110' : ''} transition`}
                                    />
                                  </span>
                                  <span className={`mt-3 text-[11px] font-bold truncate max-w-[92%] ${selected ? 'text-[var(--champagne)]' : a.owned ? 'text-[#ECE6DA]' : 'text-[#7A7E8E]'}`}>{a.name}</span>
                                  <span className={`text-[10px] font-num ${a.owned ? 'text-[#7BE0A8]' : 'text-[#5E6273]'}`}>
                                    {a.equipped ? '驾驶中' : a.owned ? '已入库' : a.dropOnly ? '限定' : formatMoney(a.price)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <span className="absolute left-2 right-2 top-[70px] h-[6px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(217,196,154,0.35),transparent)] pointer-events-none" />
                          <span className="absolute left-4 right-4 top-[72px] h-px bg-gradient-to-r from-transparent via-[#D9C49A]/55 to-transparent pointer-events-none" />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

              <div className="px-3 pt-7 space-y-1">
                <DecoHeading title="套装羁绊" />
                {assetSets.map((s: any) => (
                  <div key={s.id} className="px-1 py-2.5 flex items-center gap-3 border-b border-white/[0.06] last:border-b-0">
                    <GameIcon name="crown" size={30} className={s.completed ? '' : 'grayscale opacity-60'} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-editorial font-black text-[#ECE6DA]">{s.name}</div>
                      <div className="text-[11px] text-[#858999] mt-0.5">{s.bonusDesc}</div>
                    </div>
                    <span className={`text-[10.5px] shrink-0 ${s.completed ? 'text-[var(--champagne)]' : 'text-[#6D7183]'}`}>{s.completed ? '已激活' : '收集中'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
