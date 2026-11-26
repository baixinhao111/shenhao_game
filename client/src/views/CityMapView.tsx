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
import { DecoHeading, GameIcon, OrnateCorners, type GameIconName } from '../components/GameIcon';

const DISTRICT_ICON: Record<string, GameIconName> = {
  jade_gambling: 'jade',
  angel_invest: 'briefcase',
  street_race: 'race',
  stock_market: 'stocks',
  livestream_pk: 'livestream',
  cruise_event: 'cruise',
  future_expansion: 'hourglass',
};

interface MgResult {
  tone: 'jackpot' | 'win' | 'lose';
  stamp: string;
  headline: string;
  amount?: number;
  extra?: string;
  image?: string;
  icon?: GameIconName;
}

const MinigameResultCard: React.FC<{ result: MgResult; onClose: () => void }> = ({ result, onClose }) => {
  const win = result.tone !== 'lose';
  const jackpot = result.tone === 'jackpot';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-[#05070F]/75 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[86%] rounded-[12px] px-4 pt-6 pb-3.5 text-center overflow-hidden"
        style={{
          background: win
            ? 'radial-gradient(80% 60% at 50% 0%, rgba(255,220,150,0.35), transparent 70%), linear-gradient(180deg, #1E2850, #0A0F1F)'
            : 'radial-gradient(80% 60% at 50% 0%, rgba(120,140,200,0.25), transparent 70%), linear-gradient(180deg, #161C34, #0A0F1F)',
          border: `1px solid ${win ? 'rgba(255,231,176,0.8)' : 'rgba(160,178,230,0.35)'}`,
          boxShadow: win ? '0 0 30px rgba(226,189,114,0.35)' : '0 10px 30px rgba(0,0,0,0.5)',
        }}
      >
        {win && <OrnateCorners size={18} inset={-3} />}
        {jackpot && (
          <motion.div
            aria-hidden
            className="absolute left-1/2 top-10 w-[420px] h-[420px] -ml-[210px] -mt-[210px] pointer-events-none opacity-50"
            style={{
              background: 'repeating-conic-gradient(rgba(255,226,160,0.35) 0deg 8deg, transparent 8deg 24deg)',
              maskImage: 'radial-gradient(circle, #000, transparent 60%)',
              WebkitMaskImage: 'radial-gradient(circle, #000, transparent 60%)',
            }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
          />
        )}
        <motion.div
          initial={{ scale: 2.2, rotate: -18, opacity: 0 }}
          animate={{ scale: 1, rotate: -8, opacity: 1 }}
          transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 16 }}
          className={`relative inline-block px-4 py-0.5 font-editorial font-black text-[28px] tracking-[0.15em] border-[3px] rounded-[6px] ${
            jackpot
              ? 'text-[#FF5C7A] border-[#FF5C7A] shadow-[0_0_18px_rgba(255,92,122,0.5)]'
              : win
                ? 'text-[#FFE7B0] border-[#E2BD72]'
                : 'text-[#8B93AD] border-[#6B7392]'
          }`}
        >
          {result.stamp}
        </motion.div>

        {(result.image || result.icon) && (
          <div className="relative mt-2 flex justify-center">
            {result.image ? (
              <img src={result.image} alt="" className="h-20 object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.7)]" />
            ) : (
              <GameIcon name={result.icon!} size={56} />
            )}
          </div>
        )}

        {typeof result.amount === 'number' && (
          <div className={`relative font-num text-[30px] font-semibold mt-1 ${result.amount >= 0 ? 'text-[#FFE7B0]' : 'text-[#8B93AD]'}`}>
            {result.amount >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(result.amount))}
          </div>
        )}
        {result.extra && <div className="relative font-num text-[13px] text-[#B9F6FB]">{result.extra}</div>}
        <p className="relative text-[12px] text-[#C6CBDB] leading-relaxed mt-1.5">{result.headline}</p>
        <button onClick={onClose} className={`relative mt-3 w-full py-2 text-[13.5px] font-editorial ${win ? 'gold-btn-shimmer' : 'btn-navy'}`}>
          {win ? '收下' : '再接再厉'}
        </button>
      </motion.div>
    </motion.div>
  );
};


const DISTRICT_AMBIENT: Record<string, string> = {
  old_street: '青石巷口灯笼微晃，老茶馆与古玩摊掩在晚风里。',
  university: '夕阳穿过银杏枝桠落在琴房窗台，风里飘着烘焙咖啡味。',
  bund: '江面碎金摇晃，落地窗展厅与江岸大道连成一片灯火。',
  cbd: '玻璃幕墙映着蓝调夜色，整座海城的资金在此流转。',
  night_city: '巨幕霓虹永不熄灭，晚间的酒廊与演播厅正热闹。',
  peak_coast: '海风微凉，游艇码头的灯光映在平静海面上。',
};

type DistrictSheet = null | 'minigame' | 'explore' | 'properties';
type HomeSheet = null | 'interact' | 'manage';

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
  } = useGameStore();

  const [previewDistrictId, setPreviewDistrictId] = useState<string | null>(null);
  const [districtSheet, setDistrictSheet] = useState<DistrictSheet>(null);
  const [homeSheet, setHomeSheet] = useState<HomeSheet>(null);
  const [expandedDateSpotId, setExpandedDateSpotId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [strollEvent, setStrollEvent] = useState<any | null>(null);
  const [strollResult, setStrollResult] = useState<string | null>(null);
  const [mgResult, setMgResult] = useState<MgResult | null>(null);
  const [stocksData, setStocksData] = useState<{ quotes: any[]; insiderTip: string } | null>(null);
  const [renameText, setRenameText] = useState('');
  const [showRename, setShowRename] = useState(false);

  useEffect(() => {
    setDistrictSheet(null);
    setExpandedDateSpotId(null);
    setMgResult(null);
    setStrollEvent(null);
    setStrollResult(null);
    if (selectedDistrictId === 'cbd') {
      apiRequest('/minigame/stocks')
        .then((r) => setStocksData(r))
        .catch(() => {});
    }
  }, [selectedDistrictId]);

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
                if (featuredResident) {
                  openHeroineChat(featuredResident.id, prop.displayName);
                } else {
                  setHomeSheet('manage');
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
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="panel-elevated absolute inset-x-0 bottom-0 z-40 rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[72%] overflow-y-auto no-scrollbar space-y-3"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                <span className="font-editorial text-[16px] font-black gold-gradient-text">居家时光</span>
                <button onClick={() => setHomeSheet(null)} className="p-1 text-[#8B93AD]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {residentObjs.length === 0 ? (
                <div className="text-xs text-[#A3AAC2] py-6 text-center space-y-3">
                  <div>这套私宅暂未赠予钥匙</div>
                  <button onClick={() => setHomeSheet('manage')} className="btn-brass px-4 py-1.5 rounded-[4px] text-xs">
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
                          <span className="text-xs text-[#E2BD72] flex items-center gap-0.5 shrink-0 tabular-nums">
                            <Zap className="w-3 h-3" /> {inter.energy}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sheet: Property Management */}
        <AnimatePresence>
          {homeSheet === 'manage' && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="panel-elevated absolute inset-x-0 bottom-0 z-40 rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[78%] overflow-y-auto no-scrollbar space-y-4"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="font-editorial text-[16px] font-black gold-gradient-text">{prop.displayName}</span>
                  {prop.canRename && (
                    <button
                      onClick={() => {
                        setRenameText(prop.displayName);
                        setShowRename(!showRename);
                      }}
                      className="p-1 text-[#E2BD72]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button onClick={() => setHomeSheet(null)} className="p-1 text-[#8B93AD]">
                  <X className="w-5 h-5" />
                </button>
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
                    className={`btn-brass rounded-[4px] py-2.5 text-xs ${
                      prop.type !== 'residence' || prop.isMain ? 'col-span-2' : ''
                    }`}
                  >
                    升级装潢 Lv.{prop.renovationLevel + 1}（{formatMoney(prop.renovateCost)}）
                  </button>
                )}
              </div>

              {prop.maxResidents > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#F6DDA4]">
                      居所钥匙 ({residentObjs.length}/{prop.maxResidents})
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
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==================== LEVEL 2: DISTRICT HUB ====================
  if (selectedDistrictId) {
    const d = map.districts.find((x: any) => x.id === selectedDistrictId);
    if (!d) return null;
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
            subtitle: d.name,
            sceneLabel: d.name,
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

    const cutJade = async (tier: number) => {
      setBusy(true);
      try {
        const res = await apiRequest('/minigame/jade/cut', { body: { tier } });
        applyServerState(res.state);
        playStoneCrack();
        setMgResult({
          tone: res.outcome === 'legendary' ? 'jackpot' : res.outcome === 'miss' ? 'lose' : 'win',
          stamp: res.outcome === 'legendary' ? '惊天出绿' : res.outcome === 'big_win' ? '大涨' : res.outcome === 'small_win' ? '小涨' : '切垮',
          amount: res.profit,
          headline: res.headline,
          image: res.droppedAsset?.image,
          icon: res.droppedAsset ? undefined : 'jade',
        });
        if (res.outcome === 'legendary') triggerBarrage('gold', ['帝王绿出世，整条街都围过来了！']);
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const angelInvest = async (pitchName: string, amount: number) => {
      setBusy(true);
      try {
        const res = await apiRequest('/minigame/angel/invest', { body: { pitchName, amount } });
        applyServerState(res.state);
        playCoinBurst();
        setMgResult({
          tone: res.mult >= 6 ? 'jackpot' : res.mult >= 1 ? 'win' : 'lose',
          stamp: res.mult >= 6 ? '神级黑马' : `回报 ×${res.mult}`,
          amount: Math.round(res.payout - amount),
          headline: res.headline,
          icon: 'briefcase',
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const runRace = async (stake: number) => {
      setBusy(true);
      try {
        const res = await apiRequest('/minigame/race/run', { body: { stake } });
        applyServerState(res.state);
        if (res.won) playCoinBurst();
        setMgResult({
          tone: res.won ? 'win' : 'lose',
          stamp: res.won ? '胜' : '惜败',
          amount: res.won ? res.payout - stake : -stake,
          headline: res.headline,
          icon: 'race',
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const tradeStock = async (stockId: string, direction: 'long' | 'short') => {
      setBusy(true);
      try {
        const res = await apiRequest('/minigame/stocks/trade', { body: { stockId, direction, amount: 300000 } });
        applyServerState(res.state);
        if (res.won) playCoinBurst();
        setMgResult({
          tone: res.won ? 'win' : 'lose',
          stamp: res.won ? '止盈' : '止损',
          amount: res.profit,
          headline: res.headline,
          icon: 'stocks',
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const runLivestreamPk = async (amount: number) => {
      setBusy(true);
      try {
        const res = await apiRequest('/minigame/livestream/pk', { body: { amount } });
        applyServerState(res.state, res.critResult);
        if (Array.isArray(res.barrage)) triggerBarrage('gold', res.barrage);
        setMgResult({ tone: 'jackpot', stamp: '绝杀', headline: res.headline, icon: 'livestream' });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const playCruise = async () => {
      setBusy(true);
      try {
        const res = await apiRequest('/event/cruise/play', { method: 'POST' });
        applyServerState(res.state);
        playCoinBurst();
        setMgResult({
          tone: 'win',
          stamp: '赢局',
          amount: res.cashBonus,
          extra: `星耀勋章 +${res.winTokens}`,
          headline: res.headline,
          icon: 'cruise',
        });
      } catch (e: any) {
        showError(e.message);
      } finally {
        setBusy(false);
      }
    };

    const redeemCruise = async (rewardId: string) => {
      setBusy(true);
      try {
        const res = await apiRequest('/event/cruise/redeem', { body: { rewardId } });
        applyServerState(res.state);
        playSystemPing();
        notifyTop('system', '兑换成功', res.message);
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
                setDistrictSheet('minigame');
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

        <AnimatePresence>
          {mgResult && <MinigameResultCard result={mgResult} onClose={() => setMgResult(null)} />}
        </AnimatePresence>

        {/* SHEET 1: CORE MINIGAME */}
        <AnimatePresence>
          {districtSheet === 'minigame' && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="panel-elevated absolute inset-x-0 bottom-0 z-40 rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[82%] flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 shrink-0 pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <GameIcon name={DISTRICT_ICON[d.coreMinigame] || 'nav_map'} size={40} />
                  <div>
                    <h3 className="font-editorial text-[18px] font-black gold-gradient-text">{d.coreMinigameLabel}</h3>
                    <p className="text-[11.5px] text-[#A3AAC2] mt-0.5">{d.coreMinigameDesc}</p>
                  </div>
                </div>
                <button onClick={() => setDistrictSheet(null)} className="p-1 text-[#8B93AD]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pt-3.5 space-y-3.5 relative">
                {d.coreMinigame === 'jade_gambling' && (
                  <div className="space-y-3">
                    <div className="relative rounded-[10px] overflow-hidden h-[112px] border border-[#E2BD72]/30"
                      style={{ background: 'radial-gradient(70% 70% at 50% 100%, rgba(80,200,140,0.22), transparent 70%), linear-gradient(180deg,#141C38,#0A0F1F)' }}>
                      <div className="absolute top-2 left-3 text-[10.5px] tracking-[0.3em] text-[#9FE8C4] font-bold">本期可出珍品</div>
                      <div className="absolute inset-x-0 bottom-2 flex items-end justify-around px-4">
                        {[
                          { img: '/assets/items/col_jade_emperor.png', name: '帝王绿', rare: 'SSR' },
                          { img: '/assets/items/col_blue_vase.png', name: '宣德青花', rare: 'SR' },
                          { img: '/assets/items/col_blood_agate.png', name: '鸡血龙印', rare: 'SR' },
                        ].map((t) => (
                          <div key={t.name} className="flex flex-col items-center">
                            <img src={t.img} alt={t.name} className="w-14 h-14 object-contain drop-shadow-[0_6px_8px_rgba(0,0,0,0.7)]" />
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`px-1 rounded-sm font-num text-[9px] ${t.rare === 'SSR' ? 'bg-gradient-to-r from-[#FFE7B0] to-[#D6A85A] text-[#2A1C06]' : 'bg-[#6B4FD8] text-white'}`}>{t.rare}</span>
                              <span className="text-[10.5px] text-[#C3C9DC]">{t.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { tier: 1, label: '青皮原石', cost: 50000, desc: '试水', hue: 'from-[#4A6B52] to-[#22352A]' },
                        { tier: 2, label: '莫西沙料', cost: 300000, desc: '可出珍品', hue: 'from-[#5B6E3A] to-[#2A3320]' },
                        { tier: 3, label: '标王毛料', cost: 1500000, desc: '高阶珍宝', hue: 'from-[#7A6232] to-[#3A2C14]' },
                      ].map((s) => (
                        <button
                          key={s.tier}
                          disabled={busy}
                          onClick={() => cutJade(s.tier)}
                          className={`relative rounded-[10px] pt-2 pb-2.5 px-1.5 text-center transition active:scale-95 ${s.tier === 3 ? 'panel-brass' : 'panel-arch'}`}
                        >
                          {s.tier === 3 && <span className="absolute -top-2 right-1 px-1.5 rounded-sm bg-[#FF4F72] text-[9px] font-bold text-white">高爆</span>}
                          <div className={`mx-auto w-14 h-11 rounded-[40%_55%_45%_50%] bg-gradient-to-br ${s.hue} border border-black/40 shadow-[inset_0_2px_6px_rgba(255,255,255,0.15),0_6px_10px_rgba(0,0,0,0.6)] flex items-center justify-center`}>
                            <GameIcon name="jade" size={30} className="opacity-80" />
                          </div>
                          <div className="text-[12.5px] font-editorial font-black text-[#FBF1D8] mt-1.5">{s.label}</div>
                          <div className="font-num text-[13px] text-[#FFE7B0] flex items-center justify-center gap-0.5">
                            <GameIcon name="cash" size={14} shadow={false} />{formatMoney(s.cost)}
                          </div>
                          <div className="text-[10px] text-[#8B93AD] flex items-center justify-center gap-0.5">
                            <GameIcon name="energy" size={12} shadow={false} />6 · {s.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {d.coreMinigame === 'angel_invest' && (
                  <div className="space-y-2">
                    {[
                      { name: 'AI 声乐伴奏团队', amount: 80000, tag: '产品扎实 · 稳健', risk: 1 },
                      { name: '校园无人咖啡站', amount: 250000, tag: '成长赛道 · 弹性较大', risk: 2 },
                      { name: '国风数字艺术社区', amount: 500000, tag: '高波动早期项目', risk: 3 },
                    ].map((p) => (
                      <div key={p.name} className="panel-arch rounded-[10px] px-3 py-2.5 flex items-center gap-3">
                        <GameIcon name="briefcase" size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-editorial font-black text-[#FBF1D8] truncate">{p.name}</div>
                          <div className="text-[11px] text-[#929AB4]">{p.tag}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] text-[#8B93AD]">风险</span>
                            {[1, 2, 3].map((k) => (
                              <span key={k} className={`w-3 h-1.5 -skew-x-12 ${k <= p.risk ? (p.risk === 3 ? 'bg-[#FF4F72]' : p.risk === 2 ? 'bg-[#F2B544]' : 'bg-[#4CCB8A]') : 'bg-white/10'}`} />
                            ))}
                          </div>
                        </div>
                        <button disabled={busy} onClick={() => angelInvest(p.name, p.amount)} className="btn-brass px-3 py-1.5 text-[12px] shrink-0 font-num">
                          投 {formatMoney(p.amount)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {d.coreMinigame === 'street_race' && (
                  <div className="space-y-3">
                    <div className="relative rounded-[10px] overflow-hidden h-[150px] border border-[#E2BD72]/30"
                      style={{ background: 'linear-gradient(180deg,#141C38 0%,#0A0F1F 60%,#05070F 100%)' }}>
                      {/* speed lines */}
                      <div className="absolute inset-0 opacity-50"
                        style={{ backgroundImage: 'repeating-linear-gradient(100deg, transparent 0 22px, rgba(255,231,176,0.18) 22px 23px, transparent 23px 60px)' }} />
                      <div className="absolute left-0 right-0 bottom-6 h-px bg-gradient-to-r from-transparent via-[#E2BD72]/60 to-transparent" />
                      <div className="absolute top-2 left-3 flex items-center gap-1.5">
                        <GameIcon name="race" size={22} />
                        <span className="text-[11px] tracking-[0.2em] font-bold text-[#F6DDA4]">外滩弯道 · 夜赛</span>
                      </div>
                      <div className="absolute top-2 right-3 text-right">
                        <div className="text-[9.5px] text-[#8B93AD]">马力</div>
                        <div className="font-num text-[20px] text-[#FFE7B0] leading-none">{equippedCar?.racePower || 10}</div>
                      </div>
                      {equippedCar?.image && (
                        <motion.img
                          key={busy ? 'go' : 'idle'}
                          src={equippedCar.image}
                          alt={equippedCar.name}
                          initial={{ x: busy ? 0 : -16 }}
                          animate={busy ? { x: [0, 8, -4, 260] } : { x: 0 }}
                          transition={{ duration: busy ? 0.9 : 0.4 }}
                          className="absolute left-1/2 -ml-[90px] bottom-4 w-[180px] h-[92px] object-contain drop-shadow-[0_12px_14px_rgba(0,0,0,0.85)]"
                        />
                      )}
                      <div className="absolute bottom-1 inset-x-0 text-center text-[11px] text-[#C3C9DC]">{equippedCar?.name}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button disabled={busy} onClick={() => runRace(100000)} className="btn-navy py-2 flex flex-col items-center">
                        <span className="font-editorial text-[13.5px]">切磋赛</span>
                        <span className="font-num text-[11px] text-[#FFE7B0]">押 ¥10万 · 赢 ×2.4</span>
                      </button>
                      <button disabled={busy} onClick={() => runRace(500000)} className="gold-btn-shimmer py-2 flex flex-col items-center">
                        <span className="font-editorial text-[13.5px]">高额对决</span>
                        <span className="font-num text-[11px]">押 ¥50万 · 赢 ×2.4</span>
                      </button>
                    </div>
                  </div>
                )}

                {d.coreMinigame === 'stock_market' && (
                  <div className="space-y-2.5">
                    {stocksData?.insiderTip && (
                      <div className="rounded-[10px] px-3 py-2 flex items-start gap-2 border border-[#63E6F2]/45"
                        style={{ background: 'linear-gradient(180deg, rgba(14,46,70,0.7), rgba(6,18,36,0.85))' }}>
                        <GameIcon name="tianshu" size={26} />
                        <div>
                          <div className="text-[10.5px] tracking-[0.3em] font-black cyan-glow-text">天枢内参</div>
                          <p className="text-[12px] text-[#DDFBFF] leading-relaxed">{stocksData.insiderTip}</p>
                        </div>
                      </div>
                    )}
                    {stocksData?.quotes?.map((q: any) => {
                      const up = q.changePct >= 0;
                      const pts = Array.from({ length: 12 }, (_, i) => {
                        const seed = Math.sin((q.id?.length || 3) * 7.1 + i * 1.7) * 0.5 + 0.5;
                        return 20 - (i / 11) * (up ? 12 : -12) * 0.8 - seed * 7;
                      });
                      const path = pts.map((y, i) => `${i === 0 ? 'M' : 'L'}${(i / 11) * 72},${Math.max(2, Math.min(30, y))}`).join(' ');
                      return (
                        <div key={q.id} className="panel-arch rounded-[10px] px-3 py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-editorial font-black text-[#FBF1D8] truncate">{q.name}</div>
                            <div className="flex items-baseline gap-2">
                              <span className="font-num text-[16px] text-[#F4EFE4]">¥{q.price}</span>
                              <span className={`font-num text-[12.5px] ${up ? 'text-[#FF5C7A]' : 'text-[#3FD69A]'}`}>
                                {up ? '▲' : '▼'} {Math.abs(q.changePct)}%
                              </span>
                            </div>
                          </div>
                          <svg width="72" height="32" viewBox="0 0 72 32" className="shrink-0">
                            <path d={path} fill="none" stroke={up ? '#FF5C7A' : '#3FD69A'} strokeWidth="1.8" strokeLinejoin="round" />
                          </svg>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button disabled={busy} onClick={() => tradeStock(q.id, 'long')}
                              className="px-2.5 py-1 rounded-[5px] text-[11.5px] font-bold text-white bg-gradient-to-b from-[#FF6B86] to-[#C8264B] border border-[#FFB3C2]/60 active:scale-95">
                              做多
                            </button>
                            <button disabled={busy} onClick={() => tradeStock(q.id, 'short')}
                              className="px-2.5 py-1 rounded-[5px] text-[11.5px] font-bold text-white bg-gradient-to-b from-[#3FD69A] to-[#17845A] border border-[#A8F0CF]/60 active:scale-95">
                              做空
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-center text-[10.5px] text-[#6B7392]">每笔投入 ¥30万 · 涨红跌绿</div>
                  </div>
                )}

                {d.coreMinigame === 'livestream_pk' && (
                  <div className="space-y-3">
                    <div className="relative rounded-[10px] overflow-hidden p-3 border border-[#F0789A]/40"
                      style={{ background: 'radial-gradient(80% 60% at 20% 0%, rgba(240,120,154,0.3), transparent 70%), radial-gradient(80% 60% at 80% 0%, rgba(90,120,255,0.3), transparent 70%), linear-gradient(180deg,#1A1433,#0A0F1F)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-b from-[#FFB3C6] to-[#C24E74]">
                            <PortraitAvatar src="/assets/characters/shen_liuli.png" alt="" className="w-full h-full !border-0" rounded="full" />
                          </div>
                          <div>
                            <div className="text-[12.5px] font-editorial font-black text-[#FFD3DE]">沈琉璃</div>
                            <div className="text-[10px] text-[#F0789A]">直播间 · LIVE</div>
                          </div>
                        </div>
                        <div className="font-num text-[22px] font-semibold italic text-transparent bg-clip-text bg-gradient-to-b from-[#FFF0C8] to-[#D6A85A]">VS</div>
                        <div className="flex items-center gap-2 flex-row-reverse text-right">
                          <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-b from-[#9FB4FF] to-[#3B4FBF]">
                            <PortraitAvatar src="/assets/characters/zhao_tianyu.png" alt="" className="w-full h-full !border-0" rounded="full" />
                          </div>
                          <div>
                            <div className="text-[12.5px] font-editorial font-black text-[#D6DEFF]">赵氏公会</div>
                            <div className="text-[10px] text-[#8FA2FF]">榜一大哥</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 h-3 rounded-full overflow-hidden flex border border-white/15">
                        <motion.div className="h-full bg-gradient-to-r from-[#FF6B9A] to-[#F0789A]" initial={{ width: '42%' }} animate={{ width: busy ? '86%' : '42%' }} transition={{ duration: 0.8 }} />
                        <div className="h-full flex-1 bg-gradient-to-r from-[#5A78FF] to-[#3B4FBF]" />
                      </div>
                      <div className="flex justify-between font-num text-[11px] mt-1">
                        <span className="text-[#FFB3C6]">我方 {busy ? '86%' : '42%'}</span>
                        <span className="text-[#AFC0FF]">对方</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button disabled={busy} onClick={() => runLivestreamPk(300000)} className="btn-navy py-2 flex flex-col items-center">
                        <span className="font-editorial text-[13.5px]">10 发嘉年华</span>
                        <span className="font-num text-[11px] text-[#FFE7B0]">¥30万</span>
                      </button>
                      <button disabled={busy} onClick={() => runLivestreamPk(1500000)}
                        className="py-2 flex flex-col items-center rounded-[6px] text-white font-bold border border-[#FFC4D3] bg-gradient-to-b from-[#FF7BA0] to-[#C2335E] shadow-[0_0_16px_rgba(240,120,154,0.45)] active:scale-95">
                        <span className="font-editorial text-[13.5px]">50 发绝杀</span>
                        <span className="font-num text-[11px]">¥150万</span>
                      </button>
                    </div>
                  </div>
                )}

                {d.coreMinigame === 'cruise_event' && cruiseEvent?.active && (
                  <div className="space-y-3">
                    <div className="relative rounded-[10px] overflow-hidden px-3 py-3 border border-[#E2BD72]/40 flex items-center gap-3"
                      style={{ background: 'radial-gradient(80% 80% at 0% 50%, rgba(99,230,242,0.18), transparent 70%), linear-gradient(180deg,#141C38,#0A0F1F)' }}>
                      <GameIcon name="cruise" size={64} />
                      <div className="flex-1">
                        <div className="text-[10.5px] tracking-[0.3em] text-[#E2BD72] font-bold">限时 · 星耀号公海局</div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <GameIcon name="medal" size={20} shadow={false} />
                          <span className="font-num text-[22px] text-[#FFE7B0] leading-none">{cruiseEvent.tokens}</span>
                          <span className="text-[10.5px] text-[#8B93AD]">勋章</span>
                        </div>
                        <div className="flex gap-1 mt-1.5">
                          {[0, 1, 2, 3, 4].map((k) => (
                            <span key={k} className={`w-4 h-1.5 rounded-full ${k < cruiseEvent.playsToday ? 'bg-white/15' : 'bg-gradient-to-r from-[#FFE7B0] to-[#D6A85A]'}`} />
                          ))}
                          <span className="text-[10px] text-[#8B93AD] ml-1">今日剩余 {5 - cruiseEvent.playsToday}</span>
                        </div>
                      </div>
                    </div>
                    <button disabled={busy} onClick={playCruise} className="w-full gold-btn-shimmer py-2.5 text-[14px] font-editorial flex items-center justify-center gap-1">
                      登船赴局 <GameIcon name="energy" size={16} shadow={false} />8
                    </button>
                    <div className="text-[11px] text-[#A3AAC2] tracking-[0.2em]">勋章兑换</div>
                    <div className="space-y-1.5">
                      {cruiseEvent.rewards?.map((rew: any) => {
                        const done = rew.assetId && cruiseEvent.redeemed?.includes(rew.id);
                        return (
                          <div key={rew.id} className="panel-arch rounded-[8px] px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-bold text-[#FBF1D8] truncate">{rew.name}</span>
                            <button disabled={busy || done} onClick={() => redeemCruise(rew.id)}
                              className="btn-navy px-2.5 py-1 text-[11.5px] flex items-center gap-0.5 font-num shrink-0 disabled:opacity-40">
                              {done ? '已兑换' : (<><GameIcon name="medal" size={14} shadow={false} />{rew.costTokens}</>)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SHEET 2: STREAMLINED DATES (INLINE HEROINE EXPANSION) & STROLLS */}
        <AnimatePresence>
          {districtSheet === 'explore' && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="panel-elevated absolute inset-x-0 bottom-0 z-40 rounded-t-[16px] border-t border-[#E2BD72]/50 p-4 max-h-[82%] flex flex-col"
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
          )}
        </AnimatePresence>

        {/* SHEET 3: DISTRICT PROPERTIES */}
        <AnimatePresence>
          {districtSheet === 'properties' && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="panel-elevated absolute inset-x-0 bottom-0 z-40 h-[78%] border-t border-[#E2BD72]/30 p-4 flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0 pb-3 border-b border-white/[0.08]">
                <span className="font-editorial text-[16px] font-black gold-gradient-text">
                  {d.name} · 地产 ({districtProps.length})
                </span>
                <button onClick={() => setDistrictSheet(null)} className="p-1 text-[#8B93AD]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar pt-3 divide-y divide-white/[0.08]">
                {districtProps.map((p: any) => (
                  <div key={p.id} className="py-3.5 first:pt-0 space-y-2.5">
                    <div className="aspect-[16/9] w-full bg-black overflow-hidden border border-white/[0.08]">
                      <img src={p.image || p.bg} alt={p.displayName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-editorial text-[16px] font-black gold-gradient-text">{p.displayName}</div>
                        <div className="text-[11px] text-[#E2BD72] tabular-nums mt-0.5">
                          估值 {formatMoney(p.currentValuation)}
                          {p.currentRentPerHour > 0 ? ` · 租金 ${formatMoney(p.currentRentPerHour)}/时` : ''}
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
                        <button
                          disabled={busy || player.tier.tier < p.unlockTier}
                          onClick={() => buyProperty(p.id)}
                          className="btn-brass px-3 py-1.5 rounded-[4px] text-xs shrink-0 disabled:opacity-40"
                        >
                          {player.tier.tier < p.unlockTier ? `阶层 Lv.${p.unlockTier}` : `购置 ${formatMoney(p.price)}`}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#A3AAC2] leading-snug">{p.description}</p>
                  </div>
                ))}
              </div>
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
          <span className="text-[11px] text-[#C8CBD6]/80 tracking-wider text-shadow-stage">
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
