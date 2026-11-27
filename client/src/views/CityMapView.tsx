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
import { MINIGAME_OF } from '../minigames/MinigameHost';

const DISTRICT_ICON: Record<string, GameIconName> = {
  jade_gambling: 'jade',
  angel_invest: 'briefcase',
  street_race: 'race',
  stock_market: 'stocks',
  livestream_pk: 'livestream',
  cruise_event: 'cruise',
  future_expansion: 'hourglass',
};


const DISTRICT_AMBIENT: Record<string, string> = {
  old_street: '青石巷口灯笼微晃，老茶馆与古玩摊掩在晚风里。',
  university: '夕阳穿过银杏枝桠落在琴房窗台，风里飘着烘焙咖啡味。',
  bund: '江面碎金摇晃，落地窗展厅与江岸大道连成一片灯火。',
  cbd: '玻璃幕墙映着蓝调夜色，整座海城的资金在此流转。',
  night_city: '巨幕霓虹永不熄灭，晚间的酒廊与演播厅正热闹。',
  peak_coast: '海风微凉，游艇码头的灯光映在平静海面上。',
};

type DistrictSheet = null | 'explore' | 'properties';
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
  } = useGameStore();

  const [previewDistrictId, setPreviewDistrictId] = useState<string | null>(null);
  const [districtSheet, setDistrictSheet] = useState<DistrictSheet>(null);
  const [homeSheet, setHomeSheet] = useState<HomeSheet>(null);
  const [expandedDateSpotId, setExpandedDateSpotId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [strollEvent, setStrollEvent] = useState<any | null>(null);
  const [strollResult, setStrollResult] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [showRename, setShowRename] = useState(false);

  useEffect(() => {
    setDistrictSheet(null);
    setExpandedDateSpotId(null);
    setStrollEvent(null);
    setStrollResult(null);
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
      <div className="relative h-full w-full overflow-hidden bg-[#0A0F1F] flex flex-col justify-between">
        <img
          src={prop.image || prop.bg}
          alt={prop.displayName}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 vignette-stage pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-[#0A0F1F]/95 pointer-events-none" />

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
              setActivePropertyId(null);
            }}
            className="text-xs text-[#F3F0E8] flex items-center gap-1 text-shadow-stage active:opacity-75"
          >
            <ArrowLeft className="w-4 h-4 text-[#E2BD72]" /> 返回片区
          </button>
          <div className="text-right text-shadow-stage">
            <div className="font-editorial text-[16px] font-black gold-gradient-text">{prop.displayName}</div>
            <div className="text-[10px] text-[#E2BD72]">装潢 Lv.{prop.renovationLevel}</div>
          </div>
        </div>

        {/* Bottom Dock */}
        <div className="relative z-20 px-4 pt-12 pb-5 bg-gradient-to-t from-[#0A0F1F] via-[#0A0F1F]/90 to-transparent space-y-3">
          {featuredResident ? (
            <div className="text-center text-xs text-[#E6E3DC] text-shadow-stage">
              {featuredResident.name}正在客厅等你
            </div>
          ) : (
            <div className="flex justify-center gap-4 font-num text-[13px] text-stroke-dark">
              <span className="flex items-center gap-1 text-[#FFE7B0]">
                <GameIcon name="cash" size={18} /> 估值 {formatMoney(prop.currentValuation)}
              </span>
              {prop.energyBonus > 0 && (
                <span className="flex items-center gap-1 text-[#F4EFE4]">
                  <GameIcon name="energy" size={18} /> 上限 +{prop.energyBonus}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                playTap();
                setHomeSheet('interact');
              }}
              className="btn-navy py-1.5 text-[12.5px] font-editorial flex flex-col items-center"
            >
              <GameIcon name="heart" size={32} />
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
              className="gold-btn-shimmer py-1.5 text-[12.5px] font-editorial flex flex-col items-center"
            >
              <GameIcon name={featuredResident ? 'nav_contact' : 'key'} size={32} />
              {featuredResident ? '发微信' : '赠予钥匙'}
            </button>
            <button
              onClick={() => {
                playTap();
                setHomeSheet('manage');
              }}
              className="btn-navy py-1.5 text-[12.5px] font-editorial flex flex-col items-center"
            >
              <GameIcon name="settings" size={32} />
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
                className="panel-elevated w-full rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[72%] overflow-y-auto no-scrollbar space-y-3"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <span className="font-editorial text-[16px] font-black gold-gradient-text">居家时光</span>
                  <button onClick={() => setHomeSheet(null)} aria-label="关闭" className="p-1 text-[#8B93AD] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {residentObjs.length === 0 ? (
                  <div className="text-xs text-[#A3AAC2] py-6 text-center space-y-3">
                    <div>这套私宅暂未赠予钥匙</div>
                    <button onClick={() => setHomeSheet('keys')} className="btn-brass px-4 py-1.5 rounded-[4px] text-xs">
                      赠予钥匙
                    </button>
                  </div>
                ) : (
                  residentObjs.map((h: any) => (
                    <div key={h.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-[#E6A4B8]">
                        <PortraitAvatar src={h.avatar} alt={h.name} className="w-6 h-6" rounded="sm" />
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
                              <div className="text-[11px] text-[#929AB4] mt-0.5">{inter.desc}</div>
                            </div>
                            <span className="text-xs text-[#E2BD72] flex items-center gap-0.5 shrink-0 font-num">
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
                className="panel-elevated w-full rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[78%] overflow-y-auto no-scrollbar space-y-4"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-1 p-1 rounded-full bg-[#070B18]/90 border border-[#E2BD72]/25">
                    {prop.maxResidents > 0 && (
                      <button
                        data-active={homeSheet === 'keys'}
                        onClick={() => setHomeSheet('keys')}
                        className="tab-chip font-editorial flex items-center gap-1 !pl-1.5"
                      >
                        <GameIcon name="key" size={18} shadow={false} />
                        居所钥匙
                      </button>
                    )}
                    <button
                      data-active={homeSheet === 'manage'}
                      onClick={() => setHomeSheet('manage')}
                      className="tab-chip font-editorial flex items-center gap-1 !pl-1.5"
                    >
                      <GameIcon name="settings" size={18} shadow={false} />
                      装潢与管理
                    </button>
                  </div>
                  <button onClick={() => setHomeSheet(null)} aria-label="关闭" className="p-1 text-[#8B93AD] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {homeSheet === 'manage' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-editorial text-[15px] font-black text-[#FBF1D8]">{prop.displayName}</span>
                      {prop.canRename && (
                        <button
                          onClick={() => {
                            setRenameText(prop.displayName);
                            setShowRename(!showRename);
                          }}
                          className="text-xs text-[#E2BD72] flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04]"
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
                          className="flex-1 bg-[#0D1326] border border-white/12 rounded-[4px] px-3 py-2 text-xs text-white outline-none"
                        />
                        <button onClick={handleRename} className="btn-brass px-3.5 rounded-[4px] text-xs">
                          保存
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      {prop.type === 'residence' && !prop.isMain && (
                        <button
                          onClick={handleSetMain}
                          className="game-action-tile rounded-[4px] py-2.5 text-xs font-medium text-[#F3F0E8]"
                        >
                          设为主居所
                        </button>
                      )}
                      {prop.renovationLevel < 5 && (
                        <button
                          disabled={busy}
                          onClick={handleRenovate}
                          className={`${player.cash >= prop.renovateCost ? 'btn-brass' : 'btn-navy opacity-75'} rounded-[4px] py-2.5 text-xs ${
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
                      <span className="font-medium text-[#F6DDA4]">
                        {prop.displayName}（入住 {residentObjs.length}/{prop.maxResidents}）
                      </span>
                      <span className="text-[10.5px] text-[#8B93AD]">入住后每日增进好感</span>
                    </div>
                    {unlockedHeroines.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {unlockedHeroines.map((h: any) => {
                          const here = prop.residents?.includes(h.id);
                          return (
                            <button
                              key={h.id}
                              disabled={here}
                              onClick={() => handleAssignHeroine(h.id)}
                              className={`rounded-[4px] p-2.5 flex items-center gap-2 text-left border transition ${
                                here ? 'bg-[#F0789A]/12 border-[#F0789A]/40' : 'panel-arch hover:border-[#E2BD72]/40'
                              }`}
                            >
                              <PortraitAvatar src={h.avatar} alt={h.name} className="w-8 h-8" rounded="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#F3F0E8] truncate">{h.name}</div>
                                <div className="text-[10px] text-[#E2BD72]">{here ? '已入住' : '赠予钥匙'}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-[#8B93AD]">推进主线结识联系人后即可赠予钥匙。</div>
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
  if (activeDistrict) {
    const d = activeDistrict;
    const districtProps = properties.filter((p: any) => p.districtId === d.id);
    const streetHeroine = d.presentHeroines?.[0] || null;
    const streetHeroineFull = streetHeroine ? heroines.find((h: any) => h.id === streetHeroine.id) : null;

    const runStroll = async () => {
      setBusy(true);
      setStrollResult(null);
      try {
        const res = await apiRequest('/map/stroll', { body: { districtId: d.id } });
        applyServerState(res.state);
        playSystemPing();
        const ev = res.event;

        if (Array.isArray(ev?.introNodes) && ev.introNodes.length > 0) {
          const introNodes: VNNode[] = ev.introNodes.map((n: VNNode, i: number) => {
            if (i === 0 && !n.sprite && !n.leftSprite && !n.rightSprite && ev.npcSprite) {
              return { ...n, sprite: ev.npcSprite };
            }
            return n;
          });

          // Spoiler-free choice node: NO outcome tags attached!
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

          setDistrictSheet(null);
          openMiniStory({
            mode: 'stroll',
            title: ev.title,
            subtitle: ev.desc || '',
            sceneLabel: `${d.name} · 偶遇`,
            bg: ev.bg || d.bg,
            nodes: [...introNodes, choiceNode],
            districtId: d.id,
            eventId: ev.id,
            strollChoices: ev.choices || [],
            locationLabel: d.name,
          });
        } else {
          setStrollEvent(ev);
        }
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const resolveStroll = async (choiceIndex: number) => {
      if (!strollEvent) return;
      setBusy(true);
      try {
        const res = await apiRequest('/map/stroll/resolve', {
          body: { districtId: d.id, eventId: strollEvent.id, choiceIndex },
        });
        applyServerState(res.state, res.critResult);
        playCoinBurst();
        setStrollResult(res.resultText);
        setStrollEvent(null);
        if (res.unlockedHeroine) {
          notifyTop('wechat', '新增联系人', '可在「联系」中随时发消息');
        }
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const buyProperty = async (propertyId: string) => {
      setBusy(true);
      try {
        const res = await apiRequest('/property/buy', { body: { propertyId } });
        applyServerState(res.state, res.critResult);
        playCoinBurst();
        notifyTop('bank', '过户完成', '可在私宅中升级装潢或赠予钥匙');
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    // Launches interactive Date VN Mini-Chapter directly from inline heroine selector!
    const triggerDate = async (spot: any, heroineObj: any) => {
      setBusy(true);
      try {
        const res = await apiRequest('/map/date/start', {
          body: { districtId: d.id, interactionId: spot.id, heroineId: heroineObj.id },
        });
        const script = res.script;
        playSystemPing();
        setExpandedDateSpotId(null);
        setDistrictSheet(null);
        openMiniStory({
          mode: 'date',
          title: script?.title || spot.name,
          subtitle: script?.subtitle || `${d.name} · ${spot.name}`,
          sceneLabel: `${d.name} · ${spot.name}`,
          bg: script?.bg || d.bg,
          nodes: script?.nodes || [],
          districtId: d.id,
          interactionId: spot.id,
          heroineId: heroineObj.id,
          heroineName: heroineObj.name,
          heroineAvatar: heroineObj.avatar,
          heroinePortrait: heroineObj.portrait,
          locationLabel: `${d.name} · ${spot.name}`,
          costEnergy: script?.costEnergy ?? spot.energy,
          costCash: script?.costCash ?? spot.cashCost,
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="relative h-full w-full overflow-hidden bg-[#0A0F1F] flex flex-col justify-between">
        <img src={d.bg} alt={d.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 vignette-stage pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-[#0A0F1F]/94 pointer-events-none" />

        {streetHeroineFull && (
          <div
            onClick={() => openHeroineChat(streetHeroineFull.id, d.name)}
            className="absolute inset-x-0 top-14 bottom-4 z-10 flex items-end justify-center cursor-pointer px-4"
          >
            <img
              src={streetHeroineFull.portrait}
              alt={streetHeroineFull.name}
              className="h-full max-h-[88%] w-auto object-contain object-bottom sprite-fade-bottom animate-breathe drop-shadow-[0_16px_36px_rgba(0,0,0,0.84)]"
            />
          </div>
        )}

        {/* Top Bar */}
        <div className="relative z-20 px-4 pt-3.5 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              playTap();
              setSelectedDistrictId(null);
            }}
            className="text-xs text-[#F3F0E8] flex items-center gap-1 text-shadow-stage active:opacity-75"
          >
            <ArrowLeft className="w-4 h-4 text-[#E2BD72]" /> 海城
          </button>

          <div className="text-right text-shadow-stage">
            <div className="font-editorial text-[16px] font-black gold-gradient-text tracking-wider">{d.name}</div>
            <div className="text-[10px] text-[#E2BD72]">{d.tag}</div>
          </div>
        </div>

        {/* Bottom Spatial Dock */}
        <div className="relative z-20 px-4 pt-12 pb-5 bg-gradient-to-t from-[#0A0F1F] via-[#0A0F1F]/90 to-transparent space-y-3">
          {streetHeroineFull ? (
            <div className="flex justify-center">
              <button
                onClick={() => openHeroineChat(streetHeroineFull.id, d.name)}
                className="pl-1 pr-3.5 py-1 rounded-full bg-[#2A0F1E]/85 backdrop-blur-md border border-[#F0789A]/60 text-xs text-[#FBE3EA] flex items-center gap-1.5 shadow-[0_0_14px_rgba(240,120,154,0.3)]"
              >
                <GameIcon name="heart" size={24} />
                <span>偶遇 {streetHeroineFull.name} · 搭话</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#DDDAD2] text-center leading-relaxed px-4 text-shadow-stage">
              {DISTRICT_AMBIENT[d.id] || d.description}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                playTap();
                const kind = MINIGAME_OF[d.coreMinigame];
                if (!kind) {
                  showError(d.coreMinigameDesc || '敬请期待');
                  return;
                }
                if (kind === 'cruise' && !cruiseEvent?.active) {
                  showError('星耀号暂未靠港');
                  return;
                }
                openMinigame(kind);
              }}
              className="gold-btn-shimmer py-1.5 px-1 text-[12.5px] font-editorial flex flex-col items-center gap-0"
            >
              <GameIcon name={DISTRICT_ICON[d.coreMinigame] || 'nav_map'} size={34} />
              <span className="truncate max-w-full">{d.coreMinigameLabel}</span>
            </button>

            <button
              onClick={() => {
                playTap();
                setExpandedDateSpotId(null);
                setDistrictSheet('explore');
              }}
              className="btn-navy py-1.5 px-1 text-[12.5px] font-editorial flex flex-col items-center gap-0"
            >
              <GameIcon name="champagne" size={34} />
              <span>赴约 · 闲逛</span>
            </button>

            <button
              onClick={() => {
                playTap();
                setDistrictSheet('properties');
              }}
              className="btn-navy py-1.5 px-1 text-[12.5px] font-editorial flex flex-col items-center gap-0"
            >
              <GameIcon name="key" size={34} />
              <span>地产 ({districtProps.length})</span>
            </button>
          </div>
        </div>

        {/* SHEET 2: STREAMLINED DATES (INLINE HEROINE EXPANSION) & STROLLS */}
        <AnimatePresence>
          {districtSheet === 'explore' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDistrictSheet(null)}
              className="absolute inset-0 z-40 bg-black/62 backdrop-blur-[2px] flex items-end"
            >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[82%] flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0 pb-3 border-b border-white/[0.08]">
                <span className="font-editorial text-[16px] font-black gold-gradient-text">{d.name} · 赴约与闲逛</span>
                <button onClick={() => setDistrictSheet(null)} className="p-1 text-[#8B93AD]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pt-2 space-y-3">
                <div className="space-y-2">
                  {d.interactions?.map((inter: any) => {
                    const isDate = inter.type !== 'stroll';
                    const isExpanded = isDate && expandedDateSpotId === inter.id;

                    return (
                      <div key={inter.id} className={`rounded-[10px] overflow-hidden ${isExpanded ? 'panel-brass' : 'panel-arch'}`}>
                        <button
                          disabled={busy}
                          onClick={() => {
                            playTap();
                            if (!isDate) {
                              void runStroll();
                            } else {
                              setExpandedDateSpotId(isExpanded ? null : inter.id);
                            }
                          }}
                          className="w-full text-left flex items-stretch gap-3 group active:scale-[0.99] transition"
                        >
                          <div className="relative w-[92px] shrink-0 min-h-[70px] overflow-hidden">
                            <img src={inter.image || d.bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0E1529]/80" />
                            <span
                              className={`absolute top-1.5 left-1.5 px-1.5 py-[1px] rounded-sm text-[9.5px] font-bold ${
                                isDate ? 'bg-gradient-to-r from-[#F0789A] to-[#C24E74] text-white' : 'bg-[#0A0F1F]/80 text-[#B9F6FB] border border-[#63E6F2]/40'
                              }`}
                            >
                              {isDate ? '邀约' : '闲逛'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 py-2.5">
                            <div className="text-[14px] font-editorial font-black text-[#FBF1D8] truncate">{inter.name}</div>
                            <div className="text-[11px] text-[#929AB4] mt-0.5 leading-snug line-clamp-2">{inter.desc}</div>
                          </div>
                          <div className="shrink-0 pr-3 py-2.5 flex flex-col items-end justify-center gap-0.5 font-num text-[12px]">
                            <span className="flex items-center gap-0.5 text-[#F4EFE4]">
                              <GameIcon name="energy" size={15} shadow={false} />
                              {inter.energy}
                            </span>
                            {inter.cashCost > 0 && (
                              <span className="flex items-center gap-0.5 text-[#FFE7B0]">
                                <GameIcon name="cash" size={15} shadow={false} />
                                {formatMoney(inter.cashCost)}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Inline Heroine Picker — No Stacked Modal! */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-2.5 pb-2.5 pt-1">
                                <div className="text-[10.5px] tracking-[0.25em] text-[#FFB3C6] mb-1.5">邀请谁同去？</div>
                                {unlockedHeroines.length === 0 ? (
                                  <div className="text-xs text-[#8B93AD] py-2">先推进主线结识联系人再来邀约。</div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    {unlockedHeroines.map((h: any) => (
                                      <button
                                        key={h.id}
                                        disabled={busy}
                                        onClick={() => triggerDate(inter, h)}
                                        className="rounded-full pl-1 pr-3 py-1 flex items-center gap-2 text-left bg-[#2A0F1E]/70 border border-[#F0789A]/45 hover:border-[#F0789A] transition active:scale-[0.97]"
                                      >
                                        <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-b from-[#FFB3C6] to-[#C24E74] shrink-0">
                                          <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="text-[12.5px] font-editorial font-black text-[#FBE3EA] truncate">{h.name}</div>
                                          <div className="text-[10px] text-[#FFB3C6] font-num flex items-center gap-0.5">
                                            <GameIcon name="heart" size={12} shadow={false} />
                                            {h.affection}
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                {strollEvent && (
                  <div className="relative panel-brass rounded-[10px] px-3.5 pt-4 pb-3 space-y-2.5">
                    <OrnateCorners size={16} inset={-4} />
                    <div className="absolute -top-2.5 left-3 px-2 bg-[#141C38] text-[10.5px] font-black tracking-[0.3em] text-[#E2BD72]">街头奇遇</div>
                    <div className="text-[15px] font-editorial font-black text-[#FBF1D8]">{strollEvent.title}</div>
                    <p className="text-[12px] text-[#C8CBD6] leading-relaxed">{strollEvent.desc}</p>
                    <div className="space-y-2">
                      {strollEvent.choices.map((c: any, idx: number) => (
                        <button
                          key={idx}
                          disabled={busy}
                          onClick={() => resolveStroll(idx)}
                          className="btn-navy w-full text-center px-3.5 py-2.5 text-[13px] font-editorial"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {strollResult && (
                  <div className="rounded-[10px] border border-emerald-400/50 bg-[#0E2A22]/80 px-3.5 py-2.5 text-[12px] text-emerald-100 leading-relaxed">
                    {strollResult}
                  </div>
                )}
              </div>
            </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SHEET 3: DISTRICT PROPERTIES */}
        <AnimatePresence>
          {districtSheet === 'properties' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDistrictSheet(null)}
              className="absolute inset-0 z-40 bg-black/62 backdrop-blur-[2px] flex items-end"
            >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full h-[78%] rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0 pb-3 border-b border-white/[0.08]">
                <span className="font-editorial text-[16px] font-black gold-gradient-text">
                  {d.name} · 地产 ({districtProps.length})
                </span>
                <button onClick={() => setDistrictSheet(null)} aria-label="关闭" className="p-1 text-[#8B93AD] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pt-3 divide-y divide-white/[0.08]">
                {districtProps.map((p: any) => {
                  const reqTierName =
                    (map.tiers || []).find((x: any) => x.tier === p.unlockTier)?.name || `阶层 ${p.unlockTier}`;
                  const earnsRent = p.currentRentPerHour > 0 && !(p.isMain && p.type === 'residence');
                  const canAffordProp = player.cash >= (p.price || 0);
                  return (
                  <div key={p.id} className="py-3.5 first:pt-0 space-y-2.5">
                    <div className="aspect-[16/9] w-full bg-black overflow-hidden border border-white/[0.08]">
                      <img src={p.image || p.bg} alt={p.displayName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-editorial text-[16px] font-black gold-gradient-text">{p.displayName}</div>
                        <div className="text-[11px] text-[#E2BD72] tabular-nums mt-0.5">
                          估值 {formatMoney(p.currentValuation)}
                          {earnsRent ? ` · 租金 ${formatMoney(p.currentRentPerHour)}/时` : p.isMain && p.type === 'residence' ? ' · 自住主宅' : ''}
                        </div>
                      </div>
                      {p.owned ? (
                        <button
                          onClick={() => {
                            setDistrictSheet(null);
                            setActivePropertyId(p.id);
                          }}
                          className="btn-brass px-3 py-1.5 rounded-[4px] text-xs flex items-center gap-0.5 shrink-0"
                        >
                          进入 <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="flex gap-1.5 shrink-0">
                          {player.tier.tier >= p.unlockTier && p.price > 0 && (
                            <button
                              disabled={busy}
                              onClick={() => {
                                playTap();
                                setDistrictSheet(null);
                                openDeal({ kind: 'property', id: p.id });
                              }}
                              className="btn-navy px-3 py-1.5 text-[12px] font-editorial"
                            >
                              谈判
                            </button>
                          )}
                          <button
                            disabled={busy || player.tier.tier < p.unlockTier}
                            onClick={() => buyProperty(p.id)}
                            className={`${player.tier.tier < p.unlockTier || !canAffordProp ? 'btn-navy opacity-70' : 'gold-btn-shimmer'} px-3 py-1.5 text-[12px] font-num disabled:opacity-45`}
                          >
                            {player.tier.tier < p.unlockTier ? `需「${reqTierName}」` : `全款 ${formatMoney(p.price)}`}
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[#A3AAC2] leading-snug">{p.description}</p>
                  </div>
                  );
                })}
              </div>
            </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==================== LEVEL 1: CLEAN UNCLUTTERED HAICHENG MAP ====================
  const previewDistrict = map.districts.find((d: any) => d.id === previewDistrictId) || null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0A0F1F]">
      <img
        src={map.mapImage}
        alt="海城地图"
        onClick={() => setPreviewDistrictId(null)}
        className="absolute inset-0 w-full h-full object-cover brightness-[0.88]"
      />
      <div className="absolute inset-0 vignette-stage pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/48 via-transparent to-black/68 pointer-events-none" />

      {/* Map header plate */}
      <div className="relative z-20 px-3 pt-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto relative pl-3 pr-5 py-1.5 rounded-r-full"
          style={{ background: 'linear-gradient(90deg, rgba(8,12,26,0.9), rgba(8,12,26,0.4) 85%, transparent)' }}>
          <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-gradient-to-b from-[#FFE7B0] to-[#A07C3E]" />
          <div className="font-editorial text-[20px] font-black gold-gradient-text tracking-[0.3em] leading-none">
            {map.cityName}
          </div>
          <div className="text-[10.5px] text-[#C3C9DC] mt-1 font-num tracking-wider">{state.timeLabel}</div>
        </div>

        <button
          onClick={() => {
            playTap();
            setActiveTab('assets');
          }}
          className="pointer-events-auto btn-navy !rounded-full pl-1.5 pr-3 py-1 flex items-center gap-1.5 active:opacity-80"
        >
          {equippedCar?.image && <img src={equippedCar.image} alt="" className="w-9 h-6 object-contain shrink-0" />}
          <span className="text-[11px] whitespace-nowrap">{equippedCar?.name}</span>
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
            <div className="flex flex-col items-center">
              {d.presentHeroines?.length > 0 && (
                <div className="flex -space-x-1.5 mb-1">
                  {d.presentHeroines.slice(0, 3).map((h: any) => (
                    <div key={h.id} className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-b from-[#FFB3C6] to-[#C24E74] shadow">
                      <PortraitAvatar src={h.avatar} alt={h.name} className="w-full h-full !border-0" rounded="full" />
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                {hot && (
                  <span className="absolute -inset-1.5 rounded-full border-2 border-[#FFE7B0]/80 pulse-ring pointer-events-none" />
                )}
                <div
                  className={`relative pl-0.5 pr-2.5 h-[30px] rounded-full flex items-center gap-1 whitespace-nowrap transition active:scale-95 ${
                    !d.unlocked ? 'grayscale-[0.8] opacity-75' : ''
                  }`}
                  style={{
                    background: hot
                      ? 'linear-gradient(180deg,#FFF0C8 0%,#E8C27A 55%,#B7843A 100%)'
                      : 'linear-gradient(180deg, rgba(30,40,78,0.95) 0%, rgba(10,15,31,0.95) 100%)',
                    border: hot ? '1px solid #FFF3D2' : '1px solid rgba(226,189,114,0.65)',
                    boxShadow: hot
                      ? '0 0 18px rgba(255,220,150,0.6), 0 6px 14px rgba(0,0,0,0.6)'
                      : 'inset 0 1px 0 rgba(255,231,176,0.25), 0 6px 14px rgba(0,0,0,0.65)',
                  }}
                >
                  <GameIcon name={d.unlocked ? icon : 'lock'} size={28} className="-my-1" />
                  <span
                    className={`font-editorial text-[12px] font-black tracking-wider ${
                      hot ? 'text-[#2A1C06]' : d.unlocked ? 'text-[#FBF1D8]' : 'text-[#A3AAC2]'
                    }`}
                  >
                    {d.name}
                  </span>
                  {hasCruise && <Sparkles className="w-3 h-3 text-[#FFE7B0]" />}
                  {d.hasNextStory && <span className="red-dot -top-1 -right-1" />}
                </div>
              </div>

              <div className={`w-px h-3 ${hot ? 'bg-[#FFE7B0]' : 'bg-[#E2BD72]/60'}`} />
              <div className={`w-2 h-2 rotate-45 border ${d.unlocked ? 'bg-[#FFE7B0] border-white/80 shadow-[0_0_8px_rgba(255,231,176,0.9)]' : 'bg-white/30 border-white/30'}`} />

              {d.ownedProperties?.length > 0 && (
                <div className="mt-1 pl-0.5 pr-2 py-[1px] rounded-full bg-[#0A0F1F]/92 border border-[#E2BD72]/50 text-[9.5px] text-[#F1DDA9] flex items-center gap-0.5 whitespace-nowrap shadow-md">
                  <GameIcon name="crown" size={14} shadow={false} />
                  {namedProp ? namedProp.name : `${d.ownedProperties.length}处物业`}
                </div>
              )}
            </div>
          </button>
        );
      })}

      {/* Quiet Whisper when no pin selected */}
      {!previewDistrict && (
        <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center pointer-events-none">
          <span className="px-3.5 py-1 rounded-full bg-[#070B18]/78 backdrop-blur-sm border border-[#E2BD72]/30 text-[11px] text-[#EFE7D6] tracking-wider shadow-[0_4px_14px_rgba(0,0,0,0.6)]">
            点选海城片区查看并前往
          </span>
        </div>
      )}

      {/* Architectural Location Preview Drawer */}
      <AnimatePresence>
        {previewDistrict && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="panel-elevated absolute inset-x-3 bottom-3 z-30 rounded-[10px]"
          >
            <OrnateCorners size={20} inset={-4} />
            <div className="flex items-stretch rounded-[10px] overflow-hidden">
              <div className="w-28 shrink-0 bg-black overflow-hidden relative">
                <img
                  src={previewDistrict.bg}
                  alt={previewDistrict.name}
                  className={`w-full h-full object-cover ${!previewDistrict.unlocked ? 'grayscale opacity-55' : ''}`}
                />
                {player.currentDistrict === previewDistrict.id && (
                  <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/80 text-[9px] text-[#F6DDA4]">
                    当前所在
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 p-3.5 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-editorial text-[17px] font-black gold-gradient-text truncate">
                        {previewDistrict.name}
                      </span>
                      <span className="text-[10px] text-[#E2BD72] shrink-0">{previewDistrict.tag}</span>
                    </div>
                    <button onClick={() => setPreviewDistrictId(null)} className="text-[#8B93AD] hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#A9ACB8] mt-1 leading-relaxed line-clamp-2">
                    {previewDistrict.coreMinigameLabel} · {previewDistrict.description}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] text-[#B4BBD0] truncate">
                    {previewDistrict.presentHeroines?.length > 0
                      ? `在场：${previewDistrict.presentHeroines.map((h: any) => h.name).join('、')}`
                      : `地产 ${properties.filter((p: any) => p.districtId === previewDistrict.id).length} 处`}
                  </span>
                  <button
                    onClick={() => handleTravelIntoDistrict(previewDistrict)}
                    disabled={!previewDistrict.unlocked}
                    className="gold-btn-shimmer px-5 py-1.5 text-[13px] font-editorial shrink-0"
                  >
                    {previewDistrict.unlocked ? '前往' : `阶层 Lv.${previewDistrict.unlockTier}`}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
