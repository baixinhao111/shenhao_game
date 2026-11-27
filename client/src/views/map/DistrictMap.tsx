import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, X } from 'lucide-react';
import { GameIcon, type GameIconName } from '../../components/GameIcon';
import { PortraitAvatar } from '../../components/PortraitAvatar';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { playCoinBurst, playSystemPing, playTap } from '../../lib/sound';
import { useGameStore, type VNNode } from '../../store/useGameStore';
import { MINIGAME_OF } from '../../minigames/MinigameHost';

/**
 * 区域小地图：一张俯瞰插画（content 里的 localMap），上面按百分比坐标钉着可去的地点。
 * 地点种类（content/maps/haicheng.json → districts[].spots[].kind）：
 *   venue 小玩法 · date 约会 · stroll 闲逛偶遇 · showroom 车行/拍卖行 · property 物业 · business 产业 · visit 每日打卡
 * 点地点 → 底部抽屉（出血图 + 文案 + 操作）。底部还有一条地点索引，方便不认图的玩家直接点。
 */

export const VENUE_ICON: Record<string, GameIconName> = {
  jade_gambling: 'jade',
  angel_invest: 'briefcase',
  street_race: 'race',
  stock_market: 'stocks',
  livestream_pk: 'livestream',
  cruise_event: 'cruise',
  future_expansion: 'hourglass',
};

const KIND_LABEL: Record<string, string> = {
  venue: '玩法',
  date: '约会',
  stroll: '闲逛',
  showroom: '商行',
  property: '物业',
  business: '产业',
  visit: '打卡',
};

type Spot = {
  id: string;
  kind: 'venue' | 'date' | 'stroll' | 'showroom' | 'property' | 'business' | 'visit';
  name: string;
  en?: string;
  x: number;
  y: number;
  ref?: string;
  stock?: string[];
  desc?: string;
  energy?: number;
  sysPoints?: number;
  affinity?: string;
  visited?: boolean;
};

function showroomIcon(stock: string[] = [], assets: any[]): GameIconName {
  const items = stock.map((id) => assets.find((a) => a.id === id)).filter(Boolean);
  if (items.some((a: any) => a.id.startsWith('jet') || a.id.startsWith('island'))) return 'crown';
  if (items.some((a: any) => a.id.startsWith('yacht') || a.id.startsWith('boat'))) return 'cruise';
  if (items.every((a: any) => a.type === 'collectible')) return 'crown';
  return 'race';
}

export const DistrictMap: React.FC<{ d: any }> = ({ d }) => {
  const {
    state,
    setSelectedDistrictId,
    setActivePropertyId,
    applyServerState,
    openHeroineChat,
    openMiniStory,
    notifyTop,
    showError,
    openMinigame,
    openDeal,
    flyReward,
    focusSpotId,
    clearFocusSpot,
    focusBusiness,
  } = useGameStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visitLine, setVisitLine] = useState<{ spotId: string; line: string; pts: number; aff?: string } | null>(null);
  const [stockIdx, setStockIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const spots: Spot[] = d.spots || [];

  const centerOn = (sp: Spot, smooth = true) => {
    const el = scrollRef.current;
    const m = mapRef.current;
    if (!el || !m) return;
    const y = m.offsetTop + (sp.y / 100) * m.offsetHeight;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight * 0.38), behavior: smooth ? 'smooth' : 'auto' });
  };

  // open straight onto a spot when we were sent here from elsewhere (e.g. 产业 → 车行)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const m = mapRef.current;
    if (!el || !m) return;
    const target = spots.find((s) => s.id === focusSpotId) || spots.find((s) => s.kind === 'venue');
    if (target) centerOn(target, false);
    if (focusSpotId && spots.some((s) => s.id === focusSpotId)) {
      setOpenId(focusSpotId);
      clearFocusSpot();
    }
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setStockIdx(0);
    setVisitLine(null);
  }, [openId]);

  if (!state) return null;
  const { player, properties, businesses, heroines, assets, events, map } = state;
  const unlockedHeroines = heroines.filter((h: any) => h.unlocked);
  const present: any[] = (d.presentHeroines || []).map((p: any) => ({ ...p, full: heroines.find((h: any) => h.id === p.id) }));
  const cruiseEvent = events?.find((e: any) => e.id === 'event_cruise_01');
  const tierName = (t: number) => (map.tiers || []).find((x: any) => x.tier === t)?.name || `阶层 ${t}`;
  const open = spots.find((s) => s.id === openId) || null;

  const interOf = (sp: Spot) => (d.interactions || []).find((i: any) => i.id === sp.ref);
  const propOf = (sp: Spot) => properties.find((p: any) => p.id === sp.ref);
  const bizOf = (sp: Spot) => businesses.find((b: any) => b.id === sp.ref);

  const iconOf = (sp: Spot): GameIconName => {
    switch (sp.kind) {
      case 'venue':
        return VENUE_ICON[d.coreMinigame] || 'play';
      case 'date':
        return 'heart';
      case 'stroll':
        return 'nav_map';
      case 'showroom':
        return showroomIcon(sp.stock, assets);
      case 'property':
        return 'nav_home';
      case 'business':
        return 'briefcase';
      default:
        return 'tianshu';
    }
  };

  // ---------------- actions ----------------
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startVenue = () => {
    playTap();
    const kind = MINIGAME_OF[d.coreMinigame];
    if (!kind) return showError(d.coreMinigameDesc || '航线还在筹备中，敬请期待');
    if (kind === 'cruise' && !cruiseEvent?.active) return showError('星耀号暂未靠港');
    setOpenId(null);
    openMinigame(kind);
  };

  const runStroll = (sp: Spot) =>
    run(async () => {
      const res = await apiRequest('/map/stroll', { body: { districtId: d.id } });
      applyServerState(res.state);
      playSystemPing();
      const ev = res.event;
      const introNodes: VNNode[] = (ev.introNodes || []).map((n: VNNode, i: number) =>
        i === 0 && !n.sprite && !n.leftSprite && !n.rightSprite && ev.npcSprite ? { ...n, sprite: ev.npcSprite } : n,
      );
      const choiceNode: VNNode = {
        type: 'system_choice',
        id: `stroll_choice_${ev.id}`,
        title: ev.title || '',
        sprite: ev.npcSprite || undefined,
        options: (ev.choices || []).map((c: any, idx: number) => ({
          id: String(idx),
          choiceIndex: idx,
          label: c.label,
          cashCost: c.cashCost || 0,
          cashGain: c.cashGain || 0,
          sysPoints: c.sysPoints || 0,
          affectionGain: c.affectionGain || 0,
          unlockHeroine: c.unlockHeroine,
          resultText: c.resultText,
          branchNodes: Array.isArray(c.branchNodes) ? c.branchNodes : undefined,
        })),
      };
      setOpenId(null);
      openMiniStory({
        mode: 'stroll',
        title: ev.title,
        subtitle: ev.desc || '',
        sceneLabel: `${d.name} · ${sp.name}`,
        bg: ev.bg || d.bg,
        nodes: introNodes.length ? [...introNodes, choiceNode] : [{ type: 'narration', text: ev.desc || '' } as VNNode, choiceNode],
        districtId: d.id,
        eventId: ev.id,
        strollChoices: ev.choices || [],
        locationLabel: `${d.name} · ${sp.name}`,
      });
    });

  const startDate = (inter: any, h: any) =>
    run(async () => {
      const res = await apiRequest('/map/date/start', { body: { districtId: d.id, interactionId: inter.id, heroineId: h.id } });
      const script = res.script;
      playSystemPing();
      setOpenId(null);
      openMiniStory({
        mode: 'date',
        title: script?.title || inter.name,
        subtitle: script?.subtitle || `${d.name} · ${inter.name}`,
        sceneLabel: `${d.name} · ${inter.name}`,
        bg: script?.bg || d.bg,
        nodes: script?.nodes || [],
        districtId: d.id,
        interactionId: inter.id,
        heroineId: h.id,
        heroineName: h.name,
        heroineAvatar: h.avatar,
        heroinePortrait: h.portrait,
        locationLabel: `${d.name} · ${inter.name}`,
        costEnergy: script?.costEnergy ?? inter.energy,
        costCash: script?.costCash ?? inter.cashCost,
      });
    });

  const visit = (sp: Spot, e: React.MouseEvent) => {
    const from = { x: e.clientX, y: e.clientY };
    return run(async () => {
      const res = await apiRequest('/map/visit', { body: { districtId: d.id, spotId: sp.id } });
      applyServerState(res.state);
      playSystemPing();
      flyReward(res.sysPoints, from, 'points');
      setVisitLine({ spotId: sp.id, line: res.line, pts: res.sysPoints, aff: res.affinity ? `${res.affinity.name} 好感 +${res.affinity.gain}` : undefined });
    });
  };

  const buyAsset = (id: string) =>
    run(async () => {
      const res = await apiRequest('/asset/buy', { body: { assetId: id } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      notifyTop('bank', '已提货入库', '估值已计入总身价，可在「产业 · 座驾藏品」查看');
    });

  const equipCar = (id: string) =>
    run(async () => {
      const res = await apiRequest('/asset/equip-car', { body: { assetId: id } });
      applyServerState(res.state);
      notifyTop('system', '座驾已更换', '已设为当前出行座驾');
    });

  const buyProperty = (id: string) =>
    run(async () => {
      const res = await apiRequest('/property/buy', { body: { propertyId: id } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      notifyTop('bank', '过户完成', '可进入私宅升级装潢或赠予钥匙');
    });

  const buyBiz = (id: string) =>
    run(async () => {
      const res = await apiRequest('/business/buy', { body: { businessId: id } });
      applyServerState(res.state, res.critResult);
      playCoinBurst();
      notifyTop('system', '收购完成', '该产业已开始计入分红');
    });

  // ---------------- marker look ----------------
  const markerLook = (sp: Spot) => {
    const biz = sp.kind === 'business' ? bizOf(sp) : null;
    const prop = sp.kind === 'property' ? propOf(sp) : null;
    const owned = Boolean(biz?.owned || prop?.owned);
    switch (sp.kind) {
      case 'venue':
        return { size: 54, ring: 'conic-gradient(from 200deg, #F3EAD6, #9C8660, #E6D6B2, #7A6848, #F3EAD6)', dim: false, halo: 'rgba(230,214,178,0.3)' };
      case 'date':
        return { size: 42, ring: 'linear-gradient(160deg,#FFC2D1,#C24E74)', dim: false, halo: '' };
      case 'stroll':
        return { size: 40, ring: 'repeating-conic-gradient(rgba(236,230,218,0.85) 0deg 14deg, rgba(236,230,218,0.15) 14deg 26deg)', dim: false, halo: '' };
      case 'showroom':
        return { size: 46, ring: 'linear-gradient(160deg,#EEE2C6,#8E7B58)', dim: false, halo: '' };
      case 'visit':
        return { size: 38, ring: 'linear-gradient(160deg,#B9F6FB,#2C8C99)', dim: Boolean(sp.visited), halo: sp.visited ? '' : 'rgba(99,230,242,0.25)' };
      default:
        return { size: 42, ring: owned ? 'linear-gradient(160deg,#EEE2C6,#8E7B58)' : 'rgba(170,175,190,0.4)', dim: !owned, halo: '' };
    }
  };

  const heroineAnchor = spots.find((s) => s.kind === 'date') || spots.find((s) => s.kind === 'stroll') || spots[0];

  return (
    <div className="relative h-full w-full bg-[#04050A] overflow-hidden">
      {/* ---------- the map ---------- */}
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden no-scrollbar">
        {/* the header sits over this strip, so markers near the top of the art never collide with the title */}
        <div className="h-[78px] bg-[#04050A]" />
        <div ref={mapRef} className="relative w-full" style={{ aspectRatio: '9 / 16' }}>
          <img src={d.localMap || d.bg} alt={d.name} className="absolute inset-0 w-full h-full object-cover select-none" draggable={false} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 70% at 50% 45%, transparent 40%, rgba(4,5,10,0.55) 100%)' }} />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#04050A] to-transparent pointer-events-none" />

          {spots.map((sp, i) => {
            const look = markerLook(sp);
            const biz = sp.kind === 'business' ? bizOf(sp) : null;
            const active = openId === sp.id;
            return (
              <button
                key={sp.id}
                onClick={() => {
                  playTap();
                  setOpenId(sp.id);
                }}
                className="absolute flex flex-col items-center"
                style={{ left: `${sp.x}%`, top: `${sp.y}%`, transform: 'translate(-50%, -100%)', zIndex: active ? 6 : 3 }}
              >
                <motion.span
                  initial={{ opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: active ? 1.12 : 1 }}
                  transition={{ delay: 0.05 * i, type: 'spring', stiffness: 300, damping: 20 }}
                  className="relative flex flex-col items-center"
                >
                  {look.halo && (
                    <motion.span
                      className="absolute rounded-full pointer-events-none"
                      style={{ width: look.size + 26, height: look.size + 26, top: -13, background: `radial-gradient(circle, ${look.halo}, transparent 70%)` }}
                      animate={{ scale: [0.9, 1.12, 0.9], opacity: [0.6, 1, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2.6 }}
                    />
                  )}
                  <span
                    className={`relative rounded-full p-[1.5px] ${look.dim ? 'opacity-60' : ''}`}
                    style={{ width: look.size, height: look.size, background: look.ring, boxShadow: '0 6px 14px rgba(0,0,0,0.7)' }}
                  >
                    <span className="w-full h-full rounded-full bg-[#06080F]/90 backdrop-blur-sm flex items-center justify-center">
                      <GameIcon name={iconOf(sp)} size={Math.round(look.size * 0.66)} shadow={false} />
                    </span>
                    {sp.kind === 'business' && biz?.owned && (
                      <span className="absolute -right-1.5 -top-1 px-1 rounded-full bg-[#04050A] border border-[var(--champagne-dim)] font-num text-[9px] text-[var(--champagne)] leading-[14px]">
                        Lv{biz.level}
                      </span>
                    )}
                    {sp.kind === 'business' && biz?.activeEvent && <span className="red-dot -top-0.5 -left-0.5" />}
                    {sp.kind === 'visit' && sp.visited && (
                      <span className="absolute -right-1 -bottom-1 w-[16px] h-[16px] rounded-full bg-[#04121F] border border-[#63E6F2]/60 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-[#B9F6FB]" />
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-col items-center leading-none text-shadow-stage">
                    <span className={`font-editorial font-black whitespace-nowrap ${sp.kind === 'venue' ? 'text-[13px] text-[var(--ivory-2)]' : 'text-[11px] text-[#E4DED2]'}`}>{sp.name}</span>
                    {sp.en && <span className="mt-[3px] font-num text-[7.5px] tracking-[0.28em] text-white/45 whitespace-nowrap">{sp.en}</span>}
                  </span>
                  <span className="w-px h-2.5 bg-gradient-to-b from-white/50 to-transparent mt-0.5" />
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--champagne)] shadow-[0_0_6px_rgba(230,214,178,0.9)]" />
                </motion.span>
              </button>
            );
          })}

          {/* heroines who are in this district right now stand next to the date spot */}
          {heroineAnchor &&
            present.map((h, i) => (
              <button
                key={h.id}
                onClick={() => {
                  playTap();
                  openHeroineChat(h.id, d.name);
                }}
                className="absolute flex flex-col items-center"
                style={{ left: `${heroineAnchor.x > 55 ? heroineAnchor.x - 15 - i * 11 : heroineAnchor.x + 15 + i * 11}%`, top: `${heroineAnchor.y - 3}%`, transform: 'translate(-50%, -100%)', zIndex: 5 }}
              >
                <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.2, delay: i * 0.4 }} className="flex flex-col items-center">
                  <span className="w-[38px] h-[38px] rounded-full p-[1.5px] bg-gradient-to-b from-[#FFC2D1] to-[#C24E74] shadow-[0_0_14px_rgba(240,120,154,0.45)]">
                    <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                  </span>
                  <span className="mt-1 text-[10px] font-bold text-[#FBE3EA] text-shadow-stage whitespace-nowrap">{h.name}</span>
                </motion.span>
              </button>
            ))}
        </div>
        {/* room for the spot index dock */}
        <div className="h-[92px]" />
      </div>

      {/* ---------- header ---------- */}
      <div className="absolute inset-x-0 top-0 h-[96px] z-10 pointer-events-none bg-gradient-to-b from-[#04050A] via-[#04050A]/75 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-3 flex items-start justify-between pointer-events-none">
        <button
          onClick={() => {
            playTap();
            setSelectedDistrictId(null);
          }}
          className="pointer-events-auto text-[12px] text-[var(--ivory-2)] flex items-center gap-1 text-shadow-stage active:opacity-75 pt-1"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--champagne)]" /> 海城
        </button>
        <div className="text-right text-shadow-stage">
          <div className="label-en">{d.tag}</div>
          <div className="font-editorial text-[24px] leading-none font-black ink-title tracking-[0.2em] mt-1.5">{d.name}</div>
          <div className="text-[10.5px] text-[#9A9EAE] mt-1.5">
            {spots.length} 处可去{present.length > 0 ? ` · ${present.map((h) => h.name).join('、')}在附近` : ''}
          </div>
        </div>
      </div>

      {/* ---------- spot index dock ---------- */}
      <div className="absolute inset-x-0 bottom-0 z-20 pt-8 pb-3 bg-gradient-to-t from-[#04050A] via-[#04050A]/85 to-transparent">
        <div className="flex gap-4 overflow-x-auto no-scrollbar px-4">
          {spots.map((sp) => (
            <button
              key={sp.id}
              onClick={() => {
                playTap();
                centerOn(sp);
                setOpenId(sp.id);
              }}
              className={`shrink-0 flex flex-col items-center gap-0.5 ${openId === sp.id ? '' : 'opacity-75'}`}
            >
              <GameIcon name={iconOf(sp)} size={30} />
              <span className={`text-[10.5px] whitespace-nowrap ${openId === sp.id ? 'text-[var(--champagne)]' : 'text-[#B7B3AA]'}`}>{sp.name}</span>
              <span className="text-[8.5px] tracking-[0.2em] text-[#6D7183]">{KIND_LABEL[sp.kind]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- spot sheet ---------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
            className="absolute inset-0 z-40 bg-black/55 flex items-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-h-[84%] overflow-y-auto no-scrollbar rounded-t-[18px] bg-[#070910] border-t border-[var(--champagne-dim)]/50"
            >
              <SpotSheet
                sp={open}
                d={d}
                busy={busy}
                player={player}
                assets={assets}
                inter={interOf(open)}
                prop={propOf(open)}
                biz={bizOf(open)}
                heroines={unlockedHeroines}
                present={present}
                tierName={tierName}
                stockIdx={stockIdx}
                setStockIdx={setStockIdx}
                visitLine={visitLine?.spotId === open.id ? visitLine : null}
                onClose={() => setOpenId(null)}
                onVenue={startVenue}
                onStroll={() => runStroll(open)}
                onDate={startDate}
                onVisit={(e) => visit(open, e)}
                onBuyAsset={buyAsset}
                onEquip={equipCar}
                onBuyProperty={buyProperty}
                onEnterProperty={(id) => {
                  setOpenId(null);
                  setActivePropertyId(id);
                }}
                onBuyBiz={buyBiz}
                onManageBiz={(id) => {
                  setOpenId(null);
                  focusBusiness(id);
                }}
                onDeal={(kind, id) => {
                  setOpenId(null);
                  openDeal({ kind, id });
                }}
                cruiseActive={Boolean(cruiseEvent?.active)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ======================================================================
// Sheet
// ======================================================================

interface SheetProps {
  sp: Spot;
  d: any;
  busy: boolean;
  player: any;
  assets: any[];
  inter: any;
  prop: any;
  biz: any;
  heroines: any[];
  present: any[];
  tierName: (t: number) => string;
  stockIdx: number;
  setStockIdx: (i: number) => void;
  visitLine: { line: string; pts: number; aff?: string } | null;
  cruiseActive: boolean;
  onClose: () => void;
  onVenue: () => void;
  onStroll: () => void;
  onDate: (inter: any, h: any) => void;
  onVisit: (e: React.MouseEvent) => void;
  onBuyAsset: (id: string) => void;
  onEquip: (id: string) => void;
  onBuyProperty: (id: string) => void;
  onEnterProperty: (id: string) => void;
  onBuyBiz: (id: string) => void;
  onManageBiz: (id: string) => void;
  onDeal: (kind: 'business' | 'property', id: string) => void;
}

const Stat: React.FC<{ icon?: GameIconName; label: string; value: React.ReactNode; tone?: string }> = ({ icon, label, value, tone = 'text-[var(--ivory-2)]' }) => (
  <div className="min-w-0">
    <div className="text-[9.5px] tracking-[0.25em] text-[#6D7183]">{label}</div>
    <div className={`mt-0.5 flex items-center gap-1 font-num text-[14px] ${tone} truncate`}>
      {icon && <GameIcon name={icon} size={16} shadow={false} />}
      {value}
    </div>
  </div>
);

const SpotSheet: React.FC<SheetProps> = (p) => {
  const { sp, d, busy, player } = p;
  const art =
    sp.kind === 'date' || sp.kind === 'stroll'
      ? p.inter?.image || d.bg
      : sp.kind === 'property'
        ? p.prop?.image || d.bg
        : sp.kind === 'business'
          ? p.biz?.image || d.bg
          : d.bg;

  const header = (
    <div className="relative h-[150px] overflow-hidden">
      {sp.kind === 'showroom' ? (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 70% at 50% 20%, rgba(120,130,170,0.25), transparent 70%), linear-gradient(180deg,#0E1119,#070910)' }} />
      ) : (
        <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070910]/30 via-[#070910]/40 to-[#070910]" />
      <button onClick={p.onClose} aria-label="关闭" className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-[#B7B3AA]">
        <X className="w-4 h-4" />
      </button>
      <div className="absolute left-4 bottom-2 right-4">
        <div className="label-en">
          {KIND_LABEL[sp.kind]} · {sp.en || d.tag}
        </div>
        <div className="font-editorial text-[24px] font-black ink-title leading-tight mt-1 tracking-[0.08em]">{sp.name}</div>
      </div>
    </div>
  );

  let body: React.ReactNode = null;

  if (sp.kind === 'venue') {
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{d.coreMinigameDesc}</p>
        <div className="text-[11px] text-[#6D7183]">彩头随你的阶层放大 · 当前倍率 ×{player.stakeScale || 1}</div>
        <button disabled={busy} onClick={p.onVenue} className="btn-champagne w-full py-3 text-[15px] font-editorial tracking-[0.3em]">
          {d.coreMinigame === 'cruise_event' && !p.cruiseActive ? '星耀号暂未靠港' : MINIGAME_OF[d.coreMinigame] ? `进入${d.coreMinigameLabel}` : '敬请期待'}
        </button>
      </>
    );
  } else if (sp.kind === 'stroll') {
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{p.inter?.desc}</p>
        <div className="flex items-center gap-4">
          <Stat icon="energy" label="精力" value={5} />
          <Stat label="可能遇到" value={<span className="font-sans text-[12px]">奇遇 · 捡漏 · 新联系人</span>} />
        </div>
        <button disabled={busy} onClick={p.onStroll} className="btn-champagne w-full py-3 text-[15px] font-editorial tracking-[0.3em]">
          四处转转
        </button>
      </>
    );
  } else if (sp.kind === 'date') {
    const inter = p.inter;
    const here = new Set(p.present.map((h) => h.id));
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{inter?.desc}</p>
        <div className="flex items-center gap-6">
          <Stat icon="energy" label="精力" value={inter?.energy} />
          {inter?.cashCost > 0 && <Stat icon="cash" label="花费" value={formatMoney(inter.cashCost)} tone="text-[var(--champagne)]" />}
        </div>
        <div className="pt-1">
          <div className="text-[10.5px] tracking-[0.3em] text-[#FFB3C6] mb-2">邀请谁同去</div>
          {p.heroines.length === 0 ? (
            <div className="text-[12px] text-[#7A7E8E] py-2">先推进主线结识她们，再来邀约。</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {p.heroines.map((h) => (
                <button key={h.id} disabled={busy} onClick={() => p.onDate(inter, h)} className="shrink-0 flex flex-col items-center gap-1 active:scale-95 transition">
                  <span className={`relative w-[56px] h-[56px] rounded-full p-[2px] ${here.has(h.id) ? 'bg-gradient-to-b from-[#FFC2D1] to-[#C24E74] shadow-[0_0_14px_rgba(240,120,154,0.5)]' : 'bg-white/15'}`}>
                    <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                  </span>
                  <span className="text-[11.5px] font-editorial font-black text-[#FBE3EA]">{h.name}</span>
                  <span className="text-[9.5px] font-num text-[#FFB3C6] flex items-center gap-0.5">
                    {here.has(h.id) ? '就在附近' : <><GameIcon name="heart" size={11} shadow={false} />{h.affection}</>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  } else if (sp.kind === 'visit') {
    const aff = sp.affinity ? p.heroines.find((h) => h.id === sp.affinity) : null;
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{sp.desc}</p>
        <div className="flex items-center gap-6">
          <Stat icon="energy" label="精力" value={sp.energy || 4} />
          <Stat icon="syspoint" label="天枢积分" value={`+${sp.sysPoints || 20}`} tone="text-[#B9F6FB]" />
          {aff && <Stat icon="heart" label={aff.name} value="+3" tone="text-[#FFB3C6]" />}
        </div>
        <AnimatePresence>
          {p.visitLine && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative pl-3 py-1 border-l border-[#63E6F2]/60"
            >
              <p className="text-[13px] text-[#E4DED2] leading-relaxed font-editorial">「{p.visitLine.line}」</p>
              <p className="mt-1 text-[11px] font-num text-[#B9F6FB]">
                天枢积分 +{p.visitLine.pts}
                {p.visitLine.aff ? <span className="text-[#FFB3C6]"> · {p.visitLine.aff}</span> : null}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          disabled={busy || sp.visited}
          onClick={p.onVisit}
          className={`${sp.visited ? 'btn-ghost opacity-60' : 'btn-champagne'} w-full py-3 text-[15px] font-editorial tracking-[0.3em]`}
        >
          {sp.visited ? '今日已到访' : '去坐坐'}
        </button>
      </>
    );
  } else if (sp.kind === 'property' && p.prop) {
    const pr = p.prop;
    const reqTier = Math.max(Number(pr.unlockTier || 1), Number(d.unlockTier || 1));
    const locked = !pr.owned && player.tier.tier < reqTier;
    const earnsRent = pr.currentRentPerHour > 0 && !(pr.isMain && pr.type === 'residence');
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{pr.description}</p>
        <div className="grid grid-cols-3 gap-3">
          <Stat icon="cash" label={pr.owned ? '估值' : '售价'} value={formatMoney(pr.owned ? pr.currentValuation : pr.price)} tone="text-[var(--champagne)]" />
          {earnsRent ? <Stat icon="income" label="租金/时" value={formatMoney(pr.currentRentPerHour)} tone="text-[#7BE0A8]" /> : <Stat label="用途" value={<span className="font-sans text-[12px]">{pr.type === 'residence' ? '住宅' : pr.type === 'landmark' ? '地标' : '商铺'}</span>} />}
          {pr.energyBonus > 0 && <Stat icon="energy" label="精力上限" value={`+${pr.energyBonus}`} tone="text-[#B9F6FB]" />}
        </div>
        {pr.owned ? (
          <button onClick={() => p.onEnterProperty(pr.id)} className="btn-champagne w-full py-3 text-[15px] font-editorial tracking-[0.3em]">
            {pr.isMain ? '回家' : '进入私宅'}
          </button>
        ) : locked ? (
          <div className="btn-ghost w-full py-3 text-center text-[13px] opacity-70">晋升「{p.tierName(reqTier)}」后可置业</div>
        ) : (
          <div className="flex gap-2">
            {pr.price > 0 && (
              <button disabled={busy} onClick={() => p.onDeal('property', pr.id)} className="btn-ghost flex-1 py-3 text-[14px] font-editorial">
                约业主谈判
              </button>
            )}
            <button disabled={busy} onClick={() => p.onBuyProperty(pr.id)} className="btn-champagne flex-[1.3] py-3 text-[14px] font-num">
              全款 {formatMoney(pr.price)}
            </button>
          </div>
        )}
      </>
    );
  } else if (sp.kind === 'business' && p.biz) {
    const b = p.biz;
    const locked = !b.owned && player.tier.tier < b.unlockTier;
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed">{b.description}</p>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="等级" value={b.owned ? `Lv.${b.level}` : '未收购'} />
          <Stat icon="income" label="时薪" value={formatMoney(b.owned ? b.currentIncomePerHour : b.baseIncomePerHour)} tone="text-[#7BE0A8]" />
          <Stat icon="cash" label={b.owned ? '估值' : '收购价'} value={formatMoney(b.owned ? b.currentValuation : b.buyCost)} tone="text-[var(--champagne)]" />
        </div>
        {b.owned ? (
          <button onClick={() => p.onManageBiz(b.id)} className="btn-champagne w-full py-3 text-[15px] font-editorial tracking-[0.3em]">
            {b.activeEvent ? '有经营事件 · 去处理' : '去经营'}
          </button>
        ) : locked ? (
          <div className="btn-ghost w-full py-3 text-center text-[13px] opacity-70">晋升「{p.tierName(b.unlockTier)}」后可收购</div>
        ) : (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => p.onDeal('business', b.id)} className="btn-ghost flex-1 py-3 text-[14px] font-editorial">
              约老板谈判
            </button>
            <button disabled={busy} onClick={() => p.onBuyBiz(b.id)} className="btn-champagne flex-[1.3] py-3 text-[14px] font-num">
              全款 {formatMoney(b.buyCost)}
            </button>
          </div>
        )}
      </>
    );
  } else if (sp.kind === 'showroom') {
    const items = (sp.stock || []).map((id) => p.assets.find((a) => a.id === id)).filter(Boolean);
    const cur = items[Math.min(p.stockIdx, items.length - 1)];
    body = (
      <>
        <p className="text-[12.5px] text-[#A9ADBA] leading-relaxed -mt-1">{sp.desc}</p>
        {/* stage: the current piece under a spotlight */}
        <div className="relative h-[150px] -mx-4">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[60%] h-full pointer-events-none opacity-60" style={{ background: 'conic-gradient(from 160deg at 50% 0%, transparent 0deg, rgba(255,240,210,0.28) 20deg, transparent 40deg)' }} />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-3 w-[66%] h-[22px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(217,196,154,0.35),transparent)]" />
          <AnimatePresence mode="wait">
            {cur && (
              <motion.img
                key={cur.id}
                src={cur.image}
                alt={cur.name}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-x-0 mx-auto bottom-5 max-h-[130px] max-w-[78%] object-contain drop-shadow-[0_14px_14px_rgba(0,0,0,0.85)]"
              />
            )}
          </AnimatePresence>
        </div>
        {cur && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="font-editorial text-[17px] font-black text-[var(--ivory-2)] truncate">{cur.name}</div>
                <p className="text-[11.5px] text-[#8C90A0] leading-snug mt-1 line-clamp-2">{cur.description}</p>
              </div>
              {cur.racePower > 0 && (
                <div className="shrink-0 text-right">
                  <div className="text-[9.5px] tracking-[0.25em] text-[#6D7183]">性能</div>
                  <div className="font-num text-[18px] text-[#B9F6FB] leading-none mt-0.5">{cur.racePower}</div>
                </div>
              )}
            </div>
            {cur.owned ? (
              cur.type === 'car' && !cur.equipped ? (
                <button disabled={busy} onClick={() => p.onEquip(cur.id)} className="btn-ghost w-full py-3 text-[14px] font-editorial tracking-[0.2em]">
                  已入库 · 设为座驾
                </button>
              ) : (
                <div className="btn-ghost w-full py-3 text-center text-[13px] opacity-70">{cur.equipped ? '正在驾驶' : '已入库'}</div>
              )
            ) : (
              <button disabled={busy} onClick={() => p.onBuyAsset(cur.id)} className="btn-champagne w-full py-3 text-[15px] font-num tracking-[0.1em]">
                {player.cash >= cur.price ? '提货' : '现金不足'} · {formatMoney(cur.price)}
              </button>
            )}
          </>
        )}
        {items.length > 1 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pt-1">
            {items.map((a: any, i: number) => (
              <button
                key={a.id}
                onClick={() => {
                  playTap();
                  p.setStockIdx(i);
                }}
                className={`shrink-0 w-[96px] flex flex-col items-center pb-1 border-b ${i === p.stockIdx ? 'border-[var(--champagne)]' : 'border-transparent opacity-60'}`}
              >
                <img src={a.image} alt="" className="h-[44px] max-w-full object-contain" />
                <span className="mt-1 text-[10.5px] text-[#D9D4C9] truncate max-w-full">{a.name}</span>
                <span className={`text-[10px] font-num ${a.owned ? 'text-[#7BE0A8]' : 'text-[var(--champagne)]'}`}>{a.owned ? '已入库' : formatMoney(a.price)}</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      {header}
      <div className="px-4 pb-6 pt-2 space-y-3.5">{body}</div>
    </div>
  );
};
