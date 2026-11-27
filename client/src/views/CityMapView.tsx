import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Crown,
  Footprints,
  Gamepad2,
  Heart,
  KeyRound,
  Lock,
  MessageCircle,
  Pencil,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playStoneCrack, playSystemPing, playTap } from '../lib/sound';
import { useGameStore, type VNNode } from '../store/useGameStore';
import { GameIcon, OrnateCorners, type GameIconName } from '../components/GameIcon';
import { DistrictMap } from './map/DistrictMap';

const DISTRICT_ICON: Record<string, GameIconName> = {
  jade_gambling: 'jade',
  angel_invest: 'briefcase',
  street_race: 'race',
  stock_market: 'stocks',
  livestream_pk: 'livestream',
  cruise_event: 'cruise',
  future_expansion: 'hourglass',
};


const TAB_LABEL: Record<string, string> = { home: '邸宅', map: '海城', story: '剧情', assets: '产业', heroines: '联系' };
type HomeSheet = null | 'interact' | 'keys' | 'manage';

export const CityMapView: React.FC = () => {
  const {
    state,
    selectedDistrictId,
    setSelectedDistrictId,
    activePropertyId,
    setActivePropertyId,
    applyServerState,
    openHeroineChat,
    openMiniStory,
    setActiveTab,
    notifyTop,
    triggerBarrage,
    showError,
    openMinigame,
    openDeal,
    returnTo,
    mapBack,
  } = useGameStore();

  const [previewDistrictId, setPreviewDistrictId] = useState<string | null>(null);
  const [homeSheet, setHomeSheet] = useState<HomeSheet>(null);

  const [busy, setBusy] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showRename, setShowRename] = useState(false);

  useEffect(() => {
    if (selectedDistrictId && state?.map?.districts) {
      const target = state.map.districts.find((x: any) => x.id === selectedDistrictId);
      if (target && !target.unlocked) {
        setSelectedDistrictId(null);
      }
    }
  }, [selectedDistrictId, state?.map?.districts, setSelectedDistrictId]);

  useEffect(() => {
    setHomeSheet(null);
    setShowRename(false);
  }, [activePropertyId]);

  if (!state) return null;
  const { map, player, properties, heroines, assets, events } = state;
  const equippedCar = assets.find((a: any) => a.id === player.equippedCarId);
  const unlockedHeroines = heroines.filter((h: any) => h.unlocked);
  const cruiseEvent = events?.find((e: any) => e.id === 'event_cruise_01');

  const handleTravelIntoDistrict = async (d: any) => {
    playTap();
    if (!d.unlocked) {
      showError(`阶层达到 Lv.${d.unlockTier} 解锁${d.name}`);
      return;
    }
    try {
      const res = await apiRequest('/map/travel', { body: { districtId: d.id } });
      applyServerState(res.state);
      setPreviewDistrictId(null);
      setSelectedDistrictId(d.id);
    } catch (e: any) {
      showError(e.message);
    }
  };

  // ==================== LEVEL 3: PRIVATE RESIDENCE ====================
  if (activePropertyId) {
    const prop = properties.find((p: any) => p.id === activePropertyId);
    if (!prop) return null;
    const residentObjs = (prop.residents || [])
      .map((hid: string) => heroines.find((h: any) => h.id === hid))
      .filter(Boolean);
    const featuredResident = residentObjs[0] || null;
    const backLabel = returnTo ? `返回${TAB_LABEL[returnTo] || ''}` : '返回片区';

    const handleSetMain = async () => {
      try {
        const res = await apiRequest('/property/set-main', { body: { propertyId: prop.id } });
        applyServerState(res.state);
        notifyTop('system', '主居所已切换', `${prop.displayName}已设为当前主居所`);
      } catch (e: any) {
        showError(e.message);
      }
    };

    const handleRenovate = async () => {
      setBusy(true);
      try {
        const res = await apiRequest('/property/renovate', { body: { propertyId: prop.id } });
        applyServerState(res.state, res.critResult);
        playCoinBurst();
        notifyTop('system', '装潢升级', `${prop.displayName}已升级至 Lv.${prop.renovationLevel + 1}`);
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const handleRename = async () => {
      if (!renameText.trim()) return;
      try {
        const res = await apiRequest('/property/rename', {
          body: { propertyId: prop.id, customName: renameText.trim() },
        });
        applyServerState(res.state);
        setShowRename(false);
        setRenameText('');
        notifyTop('system', '冠名已生效', '海城地图已同步更新');
      } catch (e: any) {
        showError(e.message);
      }
    };

    const handleAssignHeroine = async (heroineId: string) => {
      try {
        const res = await apiRequest('/property/assign-heroine', { body: { propertyId: prop.id, heroineId } });
        applyServerState(res.state);
        playSystemPing();
        notifyTop('wechat', '钥匙已赠予', res.message);
      } catch (e: any) {
        showError(e.message);
      }
    };

    const handleHomeInteract = async (inter: any, heroineObj: any) => {
      setBusy(true);
      try {
        const res = await apiRequest('/property/home-interact/start', {
          body: { propertyId: prop.id, interactionId: inter.id, heroineId: heroineObj.id },
        });
        const script = res.script;
        playSystemPing();
        setHomeSheet(null);
        openMiniStory({
          mode: 'home',
          title: script?.title || inter.name,
          subtitle: script?.subtitle || prop.displayName,
          sceneLabel: prop.displayName,
          bg: script?.bg || prop.image || prop.bg,
          nodes: script?.nodes || [],
          propertyId: prop.id,
          interactionId: inter.id,
          heroineId: heroineObj.id,
          heroineName: heroineObj.name,
          heroineAvatar: heroineObj.avatar,
          heroinePortrait: heroineObj.portrait,
          locationLabel: prop.displayName,
          costEnergy: script?.costEnergy ?? inter.energy,
          costCash: 0,
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="relative h-full w-full overflow-hidden bg-[#05070D] flex flex-col justify-between">
        <img
          src={prop.image || prop.bg}
          alt={prop.displayName}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 vignette-stage pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-[#05070D]/95 pointer-events-none" />

        {featuredResident && (
          <div className="absolute inset-x-0 top-12 bottom-6 z-10 flex items-end justify-center pointer-events-none px-4">
            <img
              src={featuredResident.portrait}
              alt={featuredResident.name}
              className="h-full max-h-[86%] w-auto object-contain object-bottom sprite-fade-bottom animate-breathe drop-shadow-[0_16px_36px_rgba(0,0,0,0.82)]"
            />
          </div>
        )}

        {/* Top Bar */}
        <div className="relative z-20 px-4 pt-3.5 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              playTap();
              mapBack('home');
            }}
            className="text-xs text-[#F3F0E8] flex items-center gap-1 text-shadow-stage active:opacity-75"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--champagne)]" /> {backLabel}
          </button>
          <div className="text-right text-shadow-stage">
            <div className="label-en">{prop.isMain ? 'HOME · 主居所' : 'RESIDENCE'} · 装潢 Lv.{prop.renovationLevel}</div>
            <div className="font-editorial text-[22px] font-black ink-title leading-none mt-1.5 tracking-[0.1em]">{prop.displayName}</div>
          </div>
        </div>

        {/* Bottom Dock */}
        <div className="relative z-20 px-4 pt-12 pb-5 bg-gradient-to-t from-[#05070D] via-[#05070D]/90 to-transparent space-y-3">
          {featuredResident ? (
            <div className="text-center text-xs text-[#E6E3DC] text-shadow-stage">
              {featuredResident.name}正在客厅等你
            </div>
          ) : (
            <div className="flex justify-center gap-4 font-num text-[13px] text-stroke-dark">
              <span className="flex items-center gap-1 text-[#EADBB8]">
                <GameIcon name="cash" size={18} /> 估值 {formatMoney(prop.currentValuation)}
              </span>
              {prop.energyBonus > 0 && (
                <span className="flex items-center gap-1 text-[#ECE6DA]">
                  <GameIcon name="energy" size={18} /> 上限 +{prop.energyBonus}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 items-end gap-2">
            <button
              onClick={() => {
                playTap();
                setHomeSheet('interact');
              }}
              className="py-1 text-[12.5px] text-[#E4DED2] font-editorial flex flex-col items-center gap-0.5 text-shadow-stage active:scale-95 transition"
            >
              <GameIcon name="heart" size={34} />
              居家时光
            </button>
            <button
              onClick={() => {
                playTap();
                if (featuredResident) {
                  openHeroineChat(featuredResident.id, prop.displayName);
                } else {
                  setHomeSheet('keys');
                }
              }}
              className="btn-champagne py-2.5 text-[14px] font-editorial tracking-[0.2em] flex items-center justify-center gap-1"
            >
              {featuredResident ? '发微信' : '赠予钥匙'}
            </button>
            <button
              onClick={() => {
                playTap();
                setHomeSheet('manage');
              }}
              className="py-1 text-[12.5px] text-[#E4DED2] font-editorial flex flex-col items-center gap-0.5 text-shadow-stage active:scale-95 transition"
            >
              <GameIcon name="settings" size={34} />
              物业管理
            </button>
          </div>
        </div>

        {/* Sheet: Home Interactions */}
        <AnimatePresence>
          {homeSheet === 'interact' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHomeSheet(null)}
              className="absolute inset-0 z-40 bg-black/62 backdrop-blur-[2px] flex items-end"
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-t-[18px] bg-[#070910] border-t border-[var(--champagne-dim)]/50 p-4 max-h-[72%] overflow-y-auto no-scrollbar space-y-3"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <span className="font-editorial text-[18px] font-black ink-title tracking-[0.15em]">居家时光</span>
                  <button onClick={() => setHomeSheet(null)} aria-label="关闭" className="p-1 text-[#8C90A0] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {residentObjs.length === 0 ? (
                  <div className="text-xs text-[#8C90A0] py-6 text-center space-y-3">
                    <div>这套私宅暂未赠予钥匙</div>
                    <button onClick={() => setHomeSheet('keys')} className="btn-champagne px-5 py-2 text-[13px]">
                      赠予钥匙
                    </button>
                  </div>
                ) : (
                  residentObjs.map((h: any) => (
                    <div key={h.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-[12.5px] text-[#FFC2D1] font-editorial">
                        <PortraitAvatar src={h.avatar} alt={h.name} className="w-7 h-7" rounded="full" />
                        <span>{h.name}</span>
                      </div>
                      <div className="divide-y divide-white/[0.06] border-y border-white/[0.07]">
                        {prop.homeInteractions?.map((inter: any) => (
                          <button
                            key={inter.id}
                            disabled={busy}
                            onClick={() => handleHomeInteract(inter, h)}
                            className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition"
                          >
                            <div>
                              <div className="text-[13px] font-semibold text-[#F3F0E8]">{inter.name}</div>
                              <div className="text-[11px] text-[#858999] mt-0.5">{inter.desc}</div>
                            </div>
                            <span className="text-xs text-[#D9C49A] flex items-center gap-0.5 shrink-0 font-num">
                              <GameIcon name="energy" size={14} shadow={false} /> {inter.energy}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sheet: Keys / Property Management */}
        <AnimatePresence>
          {(homeSheet === 'keys' || homeSheet === 'manage') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHomeSheet(null)}
              className="absolute inset-0 z-40 bg-black/62 backdrop-blur-[2px] flex items-end"
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-t-[18px] bg-[#070910] border-t border-[var(--champagne-dim)]/50 p-4 max-h-[78%] overflow-y-auto no-scrollbar space-y-4"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-1">
                    {prop.maxResidents > 0 && (
                      <button data-active={homeSheet === 'keys'} onClick={() => setHomeSheet('keys')} className="route-tab v2 font-editorial !px-3">
                        居所钥匙
                      </button>
                    )}
                    <button data-active={homeSheet === 'manage'} onClick={() => setHomeSheet('manage')} className="route-tab v2 font-editorial !px-3">
                      装潢与管理
                    </button>
                  </div>
                  <button onClick={() => setHomeSheet(null)} aria-label="关闭" className="p-1 text-[#8C90A0] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {homeSheet === 'manage' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-editorial text-[15px] font-black text-[#ECE6DA]">{prop.displayName}</span>
                      {prop.canRename && (
                        <button
                          onClick={() => {
                            setRenameText(prop.displayName);
                            setShowRename(!showRename);
                          }}
                          className="text-[12px] text-[var(--champagne)] flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> 冠名
                        </button>
                      )}
                    </div>

                    {showRename && (
                      <div className="flex gap-2">
                        <input
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          placeholder="输入大楼冠名"
                          className="flex-1 bg-transparent border-b border-white/20 focus:border-[var(--champagne)] px-1 py-2 text-[13px] text-white outline-none"
                        />
                        <button onClick={handleRename} className="btn-champagne px-4 text-[13px]">
                          保存
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      {prop.type === 'residence' && !prop.isMain && (
                        <button
                          onClick={handleSetMain}
                          className="btn-ghost py-2.5 text-[13px] font-editorial"
                        >
                          设为主居所
                        </button>
                      )}
                      {prop.renovationLevel < 5 && (
                        <button
                          disabled={busy}
                          onClick={handleRenovate}
                          className={`${player.cash >= prop.renovateCost ? 'btn-champagne' : 'btn-ghost opacity-75'} py-2.5 text-[13px] font-num ${
                            prop.type !== 'residence' || prop.isMain ? 'col-span-2' : ''
                          }`}
                        >
                          升级装潢 Lv.{prop.renovationLevel + 1}（{formatMoney(prop.renovateCost)}）
                        </button>
                      )}
                      {prop.renovationLevel >= 5 && (
                        <div className="col-span-2 text-center text-xs text-[#7BE0A8] py-2">已达顶级满星精装 Lv.5</div>
                      )}
                    </div>
                  </div>
                )}

                {homeSheet === 'keys' && prop.maxResidents > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-editorial text-[13px] text-[var(--ivory-2)]">
                        {prop.displayName}（入住 {residentObjs.length}/{prop.maxResidents}）
                      </span>
                      <span className="text-[11px] text-[#8C90A0]">入住后每日增进好感</span>
                    </div>
                    {unlockedHeroines.length > 0 ? (
                      <div className="flex gap-5 overflow-x-auto no-scrollbar pt-1 pb-1">
                        {unlockedHeroines.map((h: any) => {
                          const here = prop.residents?.includes(h.id);
                          return (
                            <button
                              key={h.id}
                              disabled={here}
                              onClick={() => handleAssignHeroine(h.id)}
                              className="shrink-0 flex flex-col items-center gap-1 active:scale-95 transition"
                            >
                              <span className={`w-[56px] h-[56px] rounded-full p-[2px] ${here ? 'bg-gradient-to-b from-[#FFC2D1] to-[#C24E74] shadow-[0_0_14px_rgba(240,120,154,0.45)]' : 'bg-white/15'}`}>
                                <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                              </span>
                              <span className="text-[12px] font-editorial font-black text-[#FBE3EA]">{h.name}</span>
                              <span className={`text-[10.5px] ${here ? 'text-[#FFB3C6]' : 'text-[var(--champagne)]'}`}>{here ? '已入住' : '赠予钥匙'}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-[#8C90A0]">推进主线结识联系人后即可赠予钥匙。</div>
                    )}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==================== LEVEL 2: DISTRICT HUB ====================
  const activeDistrict = selectedDistrictId
    ? map.districts.find((x: any) => x.id === selectedDistrictId && x.unlocked) || null
    : null;
  if (activeDistrict) return <DistrictMap key={activeDistrict.id} d={activeDistrict} />;

  const previewDistrict = map.districts.find((d: any) => d.id === previewDistrictId) || null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070D]">
      <img
        src={map.mapImage}
        alt="海城地图"
        onClick={() => setPreviewDistrictId(null)}
        className="absolute inset-0 w-full h-full object-cover brightness-[0.88]"
      />
      <div className="absolute inset-0 vignette-stage pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#04050A]/80 via-transparent to-[#04050A]/75 pointer-events-none" />

      {/* Map header plate */}
      <div className="relative z-20 px-3 pt-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto text-shadow-stage pl-1">
          <div className="label-en">HAICHENG · {state.timeLabel}</div>
          <div className="font-editorial text-[26px] font-black ink-title tracking-[0.4em] leading-none mt-1.5">{map.cityName}</div>
        </div>

        <button
          onClick={() => {
            playTap();
            setActiveTab('assets');
          }}
          className="pointer-events-auto flex flex-col items-end text-shadow-stage active:opacity-80"
        >
          {equippedCar?.image && <img src={equippedCar.image} alt="" className="w-16 h-9 object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.8)]" />}
          <span className="text-[10.5px] text-[#B7B3AA] whitespace-nowrap">座驾 · {equippedCar?.name}</span>
        </button>
      </div>

      {/* Location plaques */}
      {map.districts.map((d: any) => {
        const isCurrent = player.currentDistrict === d.id;
        const isPreviewed = previewDistrictId === d.id;
        const hasCruise = d.id === 'peak_coast' && cruiseEvent?.active;
        const namedProp = d.ownedProperties?.find((p: any) => p.type === 'landmark' || p.isMain);
        const icon = DISTRICT_ICON[d.coreMinigame] || 'nav_map';
        const hot = isPreviewed || isCurrent;

        return (
          <button
            key={d.id}
            onClick={(e) => {
              e.stopPropagation();
              playTap();
              if (isPreviewed && d.unlocked) {
                void handleTravelIntoDistrict(d);
              } else {
                setPreviewDistrictId(d.id);
              }
            }}
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20 focus:outline-none"
          >
            <div className="relative flex flex-col items-center">
              {hot && (
                <motion.span
                  className="absolute -top-3 w-[70px] h-[70px] rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(230,214,178,0.32), transparent 70%)' }}
                  animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2.4 }}
                />
              )}
              <span
                className={`relative rounded-full p-[1.5px] ${!d.unlocked ? 'opacity-60' : ''}`}
                style={{
                  width: hot ? 50 : 44,
                  height: hot ? 50 : 44,
                  background: !d.unlocked
                    ? 'rgba(150,155,170,0.35)'
                    : hot
                      ? 'conic-gradient(from 200deg, #F3EAD6, #9C8660, #E6D6B2, #7A6848, #F3EAD6)'
                      : 'linear-gradient(160deg,#EEE2C6,#8E7B58)',
                  boxShadow: '0 6px 14px rgba(0,0,0,0.7)',
                }}
              >
                <span className="w-full h-full rounded-full bg-[#06080F]/90 flex items-center justify-center">
                  <GameIcon name={d.unlocked ? icon : 'lock'} size={hot ? 34 : 30} shadow={false} />
                </span>
                {d.hasNextStory && <span className="red-dot -top-0.5 -right-0.5" />}
                {hasCruise && <Sparkles className="absolute -left-1 -top-1 w-3.5 h-3.5 text-[#EADBB8]" />}
                {d.presentHeroines?.length > 0 && (
                  <span className="absolute -right-4 -bottom-1 flex -space-x-2">
                    {d.presentHeroines.slice(0, 2).map((h: any) => (
                      <span key={h.id} className="w-[22px] h-[22px] rounded-full p-[1.5px] bg-gradient-to-b from-[#FFC2D1] to-[#C24E74]">
                        <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="mt-1 flex flex-col items-center leading-none text-shadow-stage">
                <span className={`font-editorial font-black whitespace-nowrap tracking-[0.12em] ${hot ? 'text-[14px] text-[var(--ivory-2)]' : d.unlocked ? 'text-[12.5px] text-[#E4DED2]' : 'text-[12px] text-[#9A9EAE]'}`}>
                  {d.name}
                </span>
                <span className="mt-[3px] text-[10px] tracking-[0.2em] text-[#A9A49A] whitespace-nowrap">
                  {d.unlocked ? (namedProp ? `◆ ${namedProp.name}` : d.tag) : `${(map.tiers || []).find((t: any) => t.tier === d.unlockTier)?.name || ''}解锁`}
                </span>
              </span>
            </div>
          </button>
        );
      })}

      {/* Quiet Whisper when no pin selected */}
      {!previewDistrict && (
        <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center pointer-events-none">
          <span className="text-[11.5px] text-[#C9C3B6] tracking-[0.3em] text-shadow-stage">点选片区 · 走进去逛逛</span>
        </div>
      )}

      {/* Architectural Location Preview Drawer */}
      <AnimatePresence>
        {previewDistrict && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 z-30 rounded-t-[18px] overflow-hidden bg-[#070910] border-t border-[var(--champagne-dim)]/50"
          >
            <div className="relative h-[118px]">
              <img src={previewDistrict.bg} alt="" className={`absolute inset-0 w-full h-full object-cover ${!previewDistrict.unlocked ? 'grayscale brightness-50' : ''}`} />
              <div className="absolute inset-0 bg-gradient-to-b from-[#070910]/20 via-[#070910]/40 to-[#070910]" />
              <button onClick={() => setPreviewDistrictId(null)} aria-label="关闭" className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-[#B7B3AA]">
                <X className="w-4 h-4" />
              </button>
              <div className="absolute left-4 bottom-2 right-4">
                <div className="label-en">
                  {previewDistrict.tag}
                  {player.currentDistrict === previewDistrict.id ? ' · 你在这里' : ''}
                </div>
                <div className="font-editorial text-[24px] font-black ink-title leading-tight mt-1 tracking-[0.2em]">{previewDistrict.name}</div>
              </div>
            </div>
            <div className="px-4 pb-4 pt-1 space-y-3">
              <p className="text-[12px] text-[#A9ADBA] leading-relaxed line-clamp-2">{previewDistrict.description}</p>
              {(previewDistrict.spots || []).length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(previewDistrict.spots || []).map((sp: any) => (
                    <span key={sp.id} className={`text-[11px] whitespace-nowrap ${sp.kind === 'visit' && sp.hot ? 'text-[#B9F6FB]' : 'text-[#8C90A0]'}`}>
                      {sp.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-[#B7B3AA] truncate">
                  {previewDistrict.presentHeroines?.length > 0
                    ? `${previewDistrict.presentHeroines.map((h: any) => h.name).join('、')}在这里`
                    : `${(previewDistrict.spots || []).length} 处可去`}
                </span>
                <button
                  onClick={() => handleTravelIntoDistrict(previewDistrict)}
                  disabled={!previewDistrict.unlocked}
                  className={`${previewDistrict.unlocked ? 'btn-champagne' : 'btn-ghost opacity-60'} px-7 py-2.5 text-[14px] font-editorial tracking-[0.3em] shrink-0`}
                >
                  {previewDistrict.unlocked ? '前往' : `${(map.tiers || []).find((t: any) => t.tier === previewDistrict.unlockTier)?.name || ''}解锁`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
