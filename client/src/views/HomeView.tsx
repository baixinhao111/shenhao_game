import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Lock,
  Mail,
  Plus,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { GameIcon, OrnateCorners, iconSrc } from '../components/GameIcon';
import { PlayerEmblem, ResourceCapsules } from '../components/TopBar';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playCoinBurst, playSystemPing, playTap, playWeChatChime } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';

interface HomeViewProps {
  pureArtMode: boolean;
  onTogglePureArt: (v: boolean) => void;
}

interface PokeBubble {
  id: number;
  name: string;
  line: string;
  innerThought?: string;
  affectionGain?: number;
}

interface FloatingParticle {
  id: number;
  x: number;
  y: number;
  label: string;
  kind: 'heart' | 'gold';
}

interface CompanionChoice {
  id: string;
  kind: 'heroine' | 'ally' | 'protagonist';
  name: string;
  title: string;
  portrait: string;
  avatar: string;
  unlocked: boolean;
  unlockHint?: string;
  affection?: number;
  stage?: { level: number; name: string };
  isResident?: boolean;
  apiHeroineId?: string;
}

const LOCAL_POKE_FALLBACKS: Record<string, Array<{ line: string; innerThought?: string }>> = {
  su_qingwan: [
    {
      line: '盯了我这么久，是在算盛世的账，还是在看我？',
      innerThought: '……他走近的时候，刚才那份报表全忘光了。',
    },
    {
      line: '江风挺舒服。忙完手头的事，陪我下楼吃碗热面？',
      innerThought: '也只有在他面前，不用一直端着。',
    },
    {
      line: '今天的日程表，我给你空了两个小时。',
      innerThought: '平时最烦人打断，唯独他伸手过来一点不讨厌。',
    },
  ],
  lin_wanxing: [
    {
      line: '你回来啦？刚把窗台上的银杏叶夹进琴谱里，挑了最好看的一片给你。',
      innerThought: '听见门响，整间屋子一下子就安静踏实了。',
    },
    {
      line: '刚练完一首夜曲，不嫌吵的话，今晚弹给你听？',
      innerThought: '心跳这么快，离得太近了……',
    },
    {
      line: '外面起风了，先喝口温水再出门。',
      innerThought: '真想每天都能这样等你回来。',
    },
  ],
  shen_liuli: [
    {
      line: '稀客呀，陆大少爷今天不忙着谈大生意，跑回来查我的岗？',
      innerThought: '嘴上这么说，其实早就换上了他上次夸过的裙子。',
    },
    {
      line: '直播间天天问我谈没谈，你说我要不要哪天不小心把你车钥匙拍进去？',
      innerThought: '才不想给外人看呢。',
    },
    {
      line: '别乱碰呀……再碰，今晚宵夜可归你请。',
      innerThought: '在他面前怎么一点架子都端不住。',
    },
  ],
  lu_zhiwei: [
    {
      line: '别突然从后面拍我，刚写的脚本差点敲错一行。',
      innerThought: '……不过他夸人的语气还挺顺耳。',
    },
    {
      line: '顺手筛了三条老街的消息，今晚去挑件真货？',
      innerThought: '这人花钱眼都不眨，幸好有我盯着真假。',
    },
    {
      line: '笑什么，我脸上又没沾东西……算了，看在手冲咖啡的面子上不计较。',
      innerThought: '耳朵怎么有点烫。',
    },
  ],
  chen_mo: [
    { line: '少爷，各处产业运行平稳，随时可以出门。' },
    { line: '车库已备好，今天打算开哪台车？' },
  ],
  protagonist: [
    { line: '海城这盘棋，才刚起手。' },
    { line: '从今往后，规矩由我来定。' },
  ],
};

export const HomeView: React.FC<HomeViewProps> = ({ pureArtMode, onTogglePureArt }) => {
  const {
    state,
    pinnedCompanionId,
    setPinnedCompanionId,
    setActiveTab,
    openProfile,
    setActiveStoryEpisodeId,
    openMiniStory,
    setShowMail,
    setShowLeaderboard,
    applyServerState,
    notifyTop,
    showError,
    flyReward,
  } = useGameStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [residenceSheet, setResidenceSheet] = useState<null | 'interact' | 'keys'>(null);
  const [pokeBubble, setPokeBubble] = useState<PokeBubble | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [pokeBump, setPokeBump] = useState(0);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pureHintFaded, setPureHintFaded] = useState(false);
  const [liveDriftCash, setLiveDriftCash] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIdxRef = useRef<Record<string, number>>({});

  const basePending = state?.player?.pendingIncome || 0;
  const incomePerHour = state?.player?.incomePerHour || 0;

  useEffect(() => {
    setLiveDriftCash(0);
    if (incomePerHour <= 0) return;
    const perSec = incomePerHour / 3600;
    const timer = setInterval(() => {
      setLiveDriftCash((prev) => Math.min(incomePerHour * 0.05, prev + perSec * 2));
    }, 2000);
    return () => clearInterval(timer);
  }, [basePending, incomePerHour]);

  useEffect(() => {
    if (!pureArtMode) {
      setPureHintFaded(false);
      return;
    }
    setPickerOpen(false);
    setResidenceSheet(null);
    const t = setTimeout(() => setPureHintFaded(true), 2000);
    return () => clearTimeout(t);
  }, [pureArtMode]);

  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, []);

  const player = state?.player;
  const user = state?.user;
  const properties = state?.properties || [];
  const assets = state?.assets || [];
  const heroines = state?.heroines || [];
  const stories = state?.stories;
  const dailyTasks = state?.dailyTasks || [];
  const skills = state?.skills || [];
  const canUpgradeSkill = Boolean(
    player &&
      skills.some((sk: any) => sk.level < sk.maxLevel && player.sysPoints >= sk.costPerLevel * (sk.level + 1)),
  );
  const unreadMailCount = state?.unreadMailCount || 0;
  const timePeriod = state?.timePeriod;
  const timeLabel = state?.timeLabel || '';

  const completedEps: string[] = stories?.completedEpisodes || [];
  const systemAwakened = completedEps.includes('ep_001') || completedEps.length > 0;
  const protagonistSrc =
    completedEps.includes('ep_003') || completedEps.length >= 3
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const mainResidence =
    state?.homeSummary?.mainResidence ||
    properties.find((p: any) => p.isMain) ||
    properties.find((p: any) => p.owned) ||
    properties[0];

  const residenceBg = mainResidence?.image || mainResidence?.bg || '/assets/bg/bg_bund_penthouse.jpg';
  const residenceResidents: string[] = mainResidence?.residents || [];
  const residentHeroineObjs = residenceResidents
    .map((hid: string) => heroines.find((h: any) => h.id === hid && h.unlocked))
    .filter(Boolean);

  const equippedCar =
    assets.find((a: any) => a.equipped) ||
    assets.find((a: any) => a.id === player?.equippedCarId) ||
    assets[0];

  const nextEpisode = useMemo(() => {
    if (!stories?.volumes) return null;
    const allEps = stories.volumes.flatMap((v: any) =>
      (v.episodes || []).map((ep: any) => ({ ...ep, volumeTitle: v.title, volumeCover: v.cover })),
    );
    if (stories.nextEpisodeId) {
      return allEps.find((ep: any) => ep.episodeId === stories.nextEpisodeId) || null;
    }
    return allEps.find((ep: any) => !(stories.completedEpisodes || []).includes(ep.episodeId)) || null;
  }, [stories]);

  const companionOptions: CompanionChoice[] = useMemo(() => {
    const heroineChoices: CompanionChoice[] = heroines.map((h: any) => ({
      id: h.id,
      kind: 'heroine',
      name: h.name,
      title: h.title,
      portrait: h.portrait,
      avatar: h.avatar,
      unlocked: Boolean(h.unlocked),
      unlockHint: h.unlockHint,
      affection: h.affection,
      stage: h.stage,
      isResident: residenceResidents.includes(h.id),
      apiHeroineId: h.id,
    }));
    const allies: CompanionChoice[] = [
      {
        id: 'chen_mo',
        kind: 'ally',
        name: '陈默',
        title: '私人管家',
        portrait: '/assets/characters/chen_mo.png',
        avatar: '/assets/characters/chen_mo.png',
        unlocked: true,
      },
      {
        id: 'protagonist',
        kind: 'protagonist',
        name: user?.nickname || '陆沉',
        title: player?.tier?.name || '海城新贵',
        portrait: protagonistSrc,
        avatar: protagonistSrc,
        unlocked: true,
      },
    ];
    return [...heroineChoices, ...allies];
  }, [heroines, residenceResidents, user?.nickname, player?.tier?.name, protagonistSrc]);

  const activeCompanion: CompanionChoice = useMemo(() => {
    if (pinnedCompanionId) {
      const match = companionOptions.find((c) => c.id === pinnedCompanionId && c.unlocked);
      if (match) return match;
    }
    const residentHeroine = companionOptions.find((c) => c.kind === 'heroine' && c.unlocked && c.isResident);
    if (residentHeroine) return residentHeroine;
    const firstUnlocked = companionOptions.find((c) => c.kind === 'heroine' && c.unlocked);
    if (firstUnlocked) return firstUnlocked;
    return companionOptions.find((c) => c.id === 'chen_mo') || companionOptions[companionOptions.length - 1];
  }, [pinnedCompanionId, companionOptions]);

  if (!state || !player || !user) return null;

  const unlockedHeroines = heroines.filter((h: any) => h.unlocked);
  const livePendingIncome = Math.floor(basePending + liveDriftCash);
  const hasProfileDot =
    !player.signedInToday ||
    dailyTasks?.some((t: any) => !t.claimed && t.progress >= t.target) ||
    Number(state?.unclaimedAchievementCount || 0) > 0;
  // 天枢指引：首页永远只给一条「下一步最值得做的事」（补全修罗场/未读私信/产业事件/羁绊/分红/主线/顶奢私宴/今日打卡）
  const guide: { id: string; tone?: 'rose' | 'cyan'; text: string; go: () => void } | null = (() => {
    if (state?.shuraEvent)
      return {
        id: `shura:${state.shuraEvent.id}`,
        tone: 'rose',
        text: `修罗场 · ${state.shuraEvent.title}`,
        go: async () => {
          try {
            const res = await apiRequest('/heroines/shura/start', { body: { eventId: state.shuraEvent.id } });
            const sc = res.script;
            playSystemPing();
            openMiniStory({
              mode: 'shura',
              eventId: sc.eventId || state.shuraEvent.id,
              title: sc.title,
              subtitle: sc.subtitle,
              sceneLabel: sc.sceneLabel,
              bg: sc.bg,
              nodes: sc.nodes || [],
              heroineId: sc.heroineId,
              heroineIds: sc.heroineIds,
              heroineName: sc.heroineName,
              heroineAvatar: sc.heroineAvatar,
            });
          } catch (e: any) {
            showError(e.message);
          }
        },
      };
    const unreadHeroine = unlockedHeroines.find((h: any) => Number(h.unreadCount || 0) > 0);
    if (unreadHeroine)
      return {
        id: `dm:${unreadHeroine.id}:${unreadHeroine.unreadCount}`,
        tone: 'rose',
        text: `${unreadHeroine.name} 发来 ${unreadHeroine.unreadCount} 条新微信`,
        go: () => useGameStore.getState().openHeroineChat(unreadHeroine.id),
      };
    const bizWithEvent = (state?.businesses || []).find((b: any) => b.owned && b.activeEvent);
    if (bizWithEvent)
      return {
        id: `bizev:${bizWithEvent.id}:${bizWithEvent.activeEvent.id}`,
        tone: 'cyan',
        text: `产业突发 · ${bizWithEvent.name}「${bizWithEvent.activeEvent.title}」`,
        go: () => {
          const st = useGameStore.getState();
          st.focusBusiness(bizWithEvent.id);
          st.openAssetsTab('biz');
        },
      };
    const bondHeroine = unlockedHeroines.find((h: any) => h.hasAvailableBond);
    if (bondHeroine)
      return {
        id: `bond:${bondHeroine.id}`,
        tone: 'rose',
        text: `${bondHeroine.name} · 专属羁绊剧情已解锁`,
        go: () => useGameStore.getState().setActiveTab('heroines'),
      };
    if (livePendingIncome >= 10000)
      return {
        id: 'income',
        text: `产业分红 ${formatMoney(livePendingIncome)} 待收取`,
        go: () => useGameStore.getState().openAssetsTab('biz'),
      };
    if (nextEpisode && !(stories?.completedEpisodes || []).includes(nextEpisode.episodeId)) {
      const nwOk = !nextEpisode.requireNetWorth || player.netWorth >= nextEpisode.requireNetWorth;
      if (nwOk)
        return {
          id: 'story',
          text: `主线《${nextEpisode.title}》等待宿主推进`,
          go: () => useGameStore.getState().setActiveTab('story'),
        };
      const newLux = (state?.luxuryTheaters || []).find((t: any) => t.unlocked && !t.completed);
      if (newLux)
        return {
          id: `lux:${newLux.id}`,
          tone: 'rose',
          text: `顶奢排面 · 《${newLux.title}》可启程`,
          go: () => useGameStore.getState().openAssetsTab('garage'),
        };
      // Check open today's hot visit spot on map before showing net-worth gate
      for (const d of state?.map?.districts || []) {
        if (!d.unlocked) continue;
        const hotSpot = (d.spots || []).find((sp: any) => sp.kind === 'visit' && sp.hot && !sp.visited && sp.open);
        if (hotSpot)
          return {
            id: `spot:${hotSpot.id}`,
            tone: 'cyan',
            text: `海城今日有事 · ${d.name}「${hotSpot.name}」`,
            go: () => useGameStore.getState().openSpot(d.id, hotSpot.id),
          };
      }
      return {
        id: 'gate',
        text: `身价再涨 ${formatMoney(nextEpisode.requireNetWorth - player.netWorth)} 解锁下一幕`,
        go: () => useGameStore.getState().openAssetsTab('biz'),
      };
    }
    const newLux = (state?.luxuryTheaters || []).find((t: any) => t.unlocked && !t.completed);
    if (newLux)
      return {
        id: `lux:${newLux.id}`,
        tone: 'rose',
        text: `顶奢排面 · 《${newLux.title}》可启程`,
        go: () => useGameStore.getState().openAssetsTab('garage'),
      };
    for (const d of state?.map?.districts || []) {
      if (!d.unlocked) continue;
      const hotSpot = (d.spots || []).find((sp: any) => sp.kind === 'visit' && sp.hot && !sp.visited && sp.open);
      if (hotSpot)
        return {
          id: `spot:${hotSpot.id}`,
          tone: 'cyan',
          text: `海城今日有事 · ${d.name}「${hotSpot.name}」`,
          go: () => useGameStore.getState().openSpot(d.id, hotSpot.id),
        };
    }
    if (Number(state?.unclaimedAchievementCount || 0) > 0)
      return {
        id: 'ach',
        text: `有 ${state.unclaimedAchievementCount} 项成就奖励待领取`,
        go: () => useGameStore.getState().openProfile('achievements'),
      };
    if (player.nextTier)
      return {
        id: 'tier',
        text: `距「${player.nextTier.name}」还差 ${formatMoney(Math.max(0, player.nextTier.minNetWorth - player.netWorth))}`,
        go: () => useGameStore.getState().openAssetsTab('biz'),
      };
    return null;
  })();
  const tierProgressPct = player.nextTier
    ? Math.min(100, Math.max(4, Math.round((player.netWorth / player.nextTier.minNetWorth) * 100)))
    : 100;

  const spawnParticle = (label: string, kind: 'heart' | 'gold', clientX?: number, clientY?: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const x = clientX && rect ? clientX - rect.left : (rect?.width || 380) * 0.54;
    const y = clientY && rect ? clientY - rect.top : (rect?.height || 760) * 0.42;
    const id = Date.now() + Math.random();
    setParticles((prev) => [...prev.slice(-5), { id, x, y, label, kind }]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1100);
  };

  const scheduleBubbleAutoDismiss = (ms = 7500) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setPokeBubble(null);
      setThoughtOpen(false);
    }, ms);
  };

  const handleCompanionPoke = async (e: React.MouseEvent) => {
    if (pureArtMode) {
      onTogglePureArt(false);
      return;
    }
    setPickerOpen(false);
    setPokeBump((n) => n + 1);
    setThoughtOpen(false);

    const clickX = e.clientX;
    const clickY = e.clientY;
    playTap();

    const applyFallback = () => {
      const list = LOCAL_POKE_FALLBACKS[activeCompanion.id] || LOCAL_POKE_FALLBACKS.chen_mo;
      const idx = fallbackIdxRef.current[activeCompanion.id] || 0;
      fallbackIdxRef.current[activeCompanion.id] = (idx + 1) % list.length;
      const picked = list[idx];
      setPokeBubble({
        id: Date.now(),
        name: activeCompanion.name,
        line: picked.line,
        innerThought: picked.innerThought,
      });
      scheduleBubbleAutoDismiss();
    };

    try {
      const payload = activeCompanion.apiHeroineId
        ? { heroineId: activeCompanion.apiHeroineId }
        : { heroineId: activeCompanion.id };
      const res = await apiRequest('/home/poke', { body: payload });
      if (res?.state) applyServerState(res.state);
      const gain = Number(res?.affectionGain || 0);
      if (gain > 0) {
        playWeChatChime();
        spawnParticle(`+${gain} ♥`, 'heart', clickX, clickY);
      }
      setPokeBubble({
        id: Date.now(),
        name: activeCompanion.name,
        line: res?.line || LOCAL_POKE_FALLBACKS[activeCompanion.id]?.[0]?.line || '夜色正好。',
        innerThought: res?.innerThought,
        affectionGain: gain,
      });
      scheduleBubbleAutoDismiss();
    } catch {
      applyFallback();
    }
  };

  const handleQuickSignIn = async () => {
    if (player.signedInToday || signingIn) return;
    setSigningIn(true);
    try {
      const res = await apiRequest('/system/signin', { method: 'POST' });
      const gained = Math.max(0, (res.state?.player?.cash || 0) - (useGameStore.getState().state?.player?.cash || 0));
      applyServerState(res.state);
      flyReward(gained);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSigningIn(false);
    }
  };

  const handleCollectVault = async () => {
    if (collecting || livePendingIncome <= 0) return;
    setCollecting(true);
    try {
      const res = await apiRequest('/income/collect', { method: 'POST' });
      const collected = Math.max(livePendingIncome, Number(res?.collected || 0));
      applyServerState(res.state);
      setLiveDriftCash(0);
      flyReward(collected);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setCollecting(false);
    }
  };

  const handleHomeInteract = async (inter: any, heroineObj: any) => {
    if (!mainResidence) return;
    setBusy(true);
    try {
      const res = await apiRequest('/property/home-interact/start', {
        body: { propertyId: mainResidence.id, interactionId: inter.id, heroineId: heroineObj.id },
      });
      const script = res.script;
      playSystemPing();
      setResidenceSheet(null);
      openMiniStory({
        mode: 'home',
        title: script?.title || inter.name,
        subtitle: script?.subtitle || mainResidence.displayName,
        sceneLabel: mainResidence.displayName,
        bg: script?.bg || mainResidence.image || mainResidence.bg,
        nodes: script?.nodes || [],
        propertyId: mainResidence.id,
        interactionId: inter.id,
        heroineId: heroineObj.id,
        heroineName: heroineObj.name,
        heroineAvatar: heroineObj.avatar,
        heroinePortrait: heroineObj.portrait,
        locationLabel: mainResidence.displayName,
        costEnergy: script?.costEnergy ?? inter.energy,
        costCash: 0,
      });
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAssignHeroine = async (heroineId: string) => {
    if (!mainResidence) return;
    try {
      const res = await apiRequest('/property/assign-heroine', {
        body: { propertyId: mainResidence.id, heroineId },
      });
      applyServerState(res.state);
      playSystemPing();
      notifyTop('wechat', '钥匙已赠予', res.message);
    } catch (e: any) {
      showError(e.message);
    }
  };

  const nextEpisodeLocked = Boolean(
    nextEpisode?.requireNetWorth && player.netWorth < nextEpisode.requireNetWorth,
  );

  const handleResumeStory = () => {
    playTap();
    if (nextEpisode?.episodeId) {
      setActiveTab('story');
      if (!nextEpisodeLocked) {
        setActiveStoryEpisodeId(nextEpisode.episodeId);
      }
    } else {
      setActiveTab('map');
    }
  };

  const shortTime = timeLabel.split(' ')[0] || timeLabel;
  const nextEpisodeCover =
    nextEpisode?.volumeCover || nextEpisode?.bg || equippedCar?.image || '/assets/story/vol1.webp';

  return (
    <div
      ref={stageRef}
      onClick={() => {
        if (pureArtMode) {
          playTap();
          onTogglePureArt(false);
        } else if (pickerOpen) {
          setPickerOpen(false);
        }
      }}
      className="relative h-full w-full overflow-hidden bg-[#05070D] select-none"
    >
      {/* LAYER 0: FULL-BLEED LIVING RESIDENCE STAGE */}
      <AmbientBackdrop
        src={residenceBg}
        alt={mainResidence?.displayName || '主居所'}
        timePeriod={timePeriod}
        imageClassName={pureArtMode ? 'brightness-[0.94]' : 'brightness-[0.84]'}
      />

      {/* Soft cinematic edge gradients (no boxed bars!) */}
      <div
        className={`absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#080C1A]/92 via-[#080C1A]/58 to-transparent pointer-events-none transition-opacity duration-500 ${
          pureArtMode ? 'opacity-15' : 'opacity-100'
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 h-[250px] bg-gradient-to-t from-[#05070D] via-[#05070D]/78 to-transparent pointer-events-none transition-opacity duration-500 ${
          pureArtMode ? 'opacity-20' : 'opacity-100'
        }`}
      />

      {/* LAYER 1: UNOBSTRUCTED STANDING COMPANION */}
      <div
        className={`absolute inset-x-0 top-[82px] bottom-[56px] z-10 flex items-end justify-center pointer-events-none transition-transform duration-700 ease-out ${
          pureArtMode ? 'scale-[1.03]' : ''
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeCompanion.id}:${activeCompanion.portrait}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-full w-full flex items-end justify-center"
          >
            <motion.img
              key={`bump-${pokeBump}`}
              src={activeCompanion.portrait}
              alt={activeCompanion.name}
              initial={pokeBump > 0 ? { scale: 1.02, y: -2 } : false}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="h-full max-h-[95%] max-w-[92%] w-auto object-contain object-bottom sprite-fade-bottom animate-breathe drop-shadow-[0_18px_38px_rgba(0,0,0,0.8)]"
            />
          </motion.div>
        </AnimatePresence>

        {/* Clean invisible tap target over companion */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleCompanionPoke(e);
          }}
          aria-label={`与${activeCompanion.name}交谈`}
          className="pointer-events-auto absolute top-[8%] bottom-[16%] left-[18%] right-[18%] cursor-pointer focus:outline-none"
        />
      </div>

      {/* Floating Tap Feedback Particles */}
      <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: p.y, x: p.x - 20, scale: 0.75 }}
              animate={{ opacity: [0, 1, 1, 0], y: p.y - 60, scale: 1.04 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
              className={`absolute font-bold text-sm tracking-wide text-shadow-stage ${
                p.kind === 'heart' ? 'text-[#EEA0B8]' : 'text-[#E2D3B0]'
              }`}
            >
              {p.label}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* LAYER 2: GAME HUD — player plate (left) + resource capsules (right) */}
      <div
        className={`absolute top-0 inset-x-0 z-20 px-3 pt-3 flex items-start justify-between gap-2 pointer-events-none transition-all duration-500 ${
          pureArtMode ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            openProfile('tasks');
          }}
          className="pointer-events-auto relative flex items-center gap-2.5 text-left active:scale-[0.98] transition max-w-[56%] pr-4 py-1 pl-1 rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(8,12,26,0.82) 0%, rgba(8,12,26,0.55) 75%, rgba(8,12,26,0) 100%)',
          }}
          title="个人档案与天枢"
        >
          <PlayerEmblem src={protagonistSrc} level={player.sysLevel} size={50} dot={hasProfileDot} />
          <div className="min-w-0 space-y-[3px]">
            <div className="font-editorial text-[16px] font-black text-[#ECE6DA] leading-none truncate text-stroke-dark">
              {user.nickname}
            </div>
            <div className="flex items-center gap-1 text-[10px] leading-none">
              <GameIcon name="crown" size={13} shadow={false} />
              <span className="text-[#E2D3B0] font-bold tracking-wider truncate">{player.tier.name}</span>
              {user.equippedTitle?.titleBadge && (
                <span
                  className={`px-1 py-[1px] rounded-sm text-[10px] font-bold shrink-0 border ${
                    user.equippedTitle.titleTone === 'cyan'
                      ? 'bg-[#072330]/85 border-[#63E6F2]/55 text-[#B9F6FB]'
                      : user.equippedTitle.titleTone === 'rose'
                        ? 'bg-[#361124]/85 border-[#F0789A]/55 text-[#FFC4D3]'
                        : 'bg-[#2B1F0B]/85 border-[#D9C49A]/55 text-[#EADBB8]'
                  }`}
                >
                  {user.equippedTitle.titleBadge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="bar-track w-[56px] shrink-0 !h-[5px]">
                <div className="bar-fill" style={{ width: `${tierProgressPct}%` }} />
              </div>
              <span className="font-num text-[10px] text-[#B3B6C2] leading-none whitespace-nowrap">
                <AnimatedNumber value={player.netWorth} />
              </span>
            </div>
          </div>
        </button>

        <div className="pointer-events-auto pt-2.5 pr-0.5 shrink-0">
          <ResourceCapsules compact />
        </div>
      </div>

      {/* 天枢指引 ticker (static wrapper centres it between the two rails; motion owns the transform) */}
      <div className="absolute z-20 top-[80px] inset-x-[66px] flex justify-center pointer-events-none">
      <AnimatePresence mode="wait">
        {guide && !pureArtMode && (
          <motion.button
            key={guide.id}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => {
              e.stopPropagation();
              playTap();
              guide.go();
            }}
            className={`pointer-events-auto max-w-full flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full backdrop-blur-md active:scale-95 ${
              guide.tone === 'rose'
                ? 'bg-[#2A0E1E]/88 border border-[#F0789A]/60 shadow-[0_0_16px_rgba(240,120,154,0.3)]'
                : 'bg-[#04121F]/80 border border-[#63E6F2]/45 shadow-[0_0_14px_rgba(99,230,242,0.25)]'
            }`}
          >
            <GameIcon name={guide.tone === 'rose' ? 'heart' : 'tianshu'} size={20} shadow={false} />
            <span className={`text-[11px] truncate ${guide.tone === 'rose' ? 'text-[#FFD3DF]' : 'text-[#CFF8FC]'}`}>{guide.text}</span>
            <span className={`text-[11px] shrink-0 ${guide.tone === 'rose' ? 'text-[#F0789A]' : 'text-[#63E6F2]'}`}>›</span>
          </motion.button>
        )}
      </AnimatePresence>
      </div>

      {/* LEFT RAIL: painted feature entries */}
      <div
        className={`absolute left-2 top-[86px] z-20 flex flex-col gap-2.5 transition-all duration-500 ${
          pureArtMode ? 'opacity-0 -translate-x-6 pointer-events-none' : 'opacity-100 translate-x-0'
        }`}
      >
        {!player.signedInToday && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleQuickSignIn();
            }}
            disabled={signingIn}
            className="icon-entry"
          >
            <img src={iconSrc('signin')} alt="" className="animate-float-slow" />
            <span className="lbl">签到</span>
            <span className="red-dot top-0 right-1" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            openProfile('tasks');
          }}
          className="icon-entry"
        >
          <img src={iconSrc('task')} alt="" />
          <span className="lbl">任务</span>
          {dailyTasks?.some((t: any) => !t.claimed && t.progress >= t.target) && (
            <span className="red-dot top-0 right-1" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            setShowMail(true);
          }}
          className="icon-entry"
        >
          <img src={iconSrc('mail')} alt="" />
          <span className="lbl">信箱</span>
          {unreadMailCount > 0 && <span className="red-dot top-0 right-1" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            openProfile('mall');
          }}
          className="icon-entry"
        >
          <img src={iconSrc('mall')} alt="" />
          <span className="lbl">商城</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            setShowLeaderboard(true);
          }}
          className="icon-entry"
        >
          <img src={iconSrc('rank')} alt="" />
          <span className="lbl">财富榜</span>
        </button>
      </div>

      {/* RIGHT RAIL: dividend vault, switch companion, hide UI */}
      <div
        className={`absolute right-2 top-[86px] z-20 flex flex-col items-end gap-2.5 transition-all duration-500 ${
          pureArtMode ? 'opacity-0 translate-x-6 pointer-events-none' : 'opacity-100 translate-x-0'
        }`}
      >
        {systemAwakened && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              playTap();
              openProfile('skills');
            }}
            className="icon-entry"
          >
            <img src={iconSrc('tianshu')} alt="" style={{ filter: 'drop-shadow(0 0 8px rgba(99,230,242,0.55)) drop-shadow(0 3px 5px rgba(0,0,0,0.7))' }} />
            <span className="lbl">天枢</span>
            {canUpgradeSkill && (
              <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-[#63E6F2] shadow-[0_0_8px_#63E6F2] animate-pulse" />
            )}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            setPickerOpen((v) => !v);
          }}
          className="icon-entry"
        >
          <div className="w-[40px] h-[40px] rounded-full p-[2px] bg-gradient-to-b from-[#EADBB8] to-[#8A7650] shadow-[0_3px_6px_rgba(0,0,0,0.6)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#10131C]">
              <img
                src={activeCompanion.avatar}
                alt=""
                className="w-full h-full object-cover object-[50%_8%] scale-[1.9] origin-[50%_6%]"
              />
            </div>
          </div>
          <span className="lbl">换人</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            onTogglePureArt(true);
          }}
          className="icon-entry"
          aria-label="隐藏界面"
        >
          <div className="w-[34px] h-[34px] my-[3px] rounded-full flex items-center justify-center bg-[#05070D]/70 border border-[#D9C49A]/45 text-[#E2D3B0] shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
            <EyeOff className="w-4 h-4" strokeWidth={2} />
          </div>
          <span className="lbl">赏图</span>
        </button>

        {livePendingIncome > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleCollectVault();
            }}
            disabled={collecting}
            className="icon-entry mt-1"
          >
            <img src={iconSrc('income')} alt="" className="animate-float-slow !w-[46px] !h-[46px]" />
            <span className="lbl !text-[#EADBB8] font-num !tracking-normal">
              <AnimatedNumber value={livePendingIncome} duration={360} />
            </span>
            <span className="absolute -top-1 -right-1 px-1 rounded-sm bg-[#FF4F72] text-[10px] font-bold text-white leading-[14px] shadow">
              收
            </span>
          </button>
        )}
      </div>
      {/* Companion Switcher Popover */}
      <AnimatePresence>
        {!pureArtMode && pickerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-[150px] right-[62px] z-40 w-[228px] panel-elevated rounded-[6px] p-2 space-y-1"
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.08]">
              <span className="text-[11px] font-medium tracking-wider text-[#D9C49A]">切换驻留人物</span>
              <button onClick={() => setPickerOpen(false)} className="text-[#8C90A0] hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5 max-h-[320px] overflow-y-auto no-scrollbar">
              {companionOptions.map((c) => {
                const isSelected = c.id === activeCompanion.id;
                return (
                  <button
                    key={c.id}
                    disabled={!c.unlocked}
                    onClick={() => {
                      playSystemPing();
                      setPinnedCompanionId(c.id);
                      setPokeBubble(null);
                      setPickerOpen(false);
                    }}
                    className={`w-full rounded-[4px] px-2 py-1.5 flex items-center gap-2.5 text-left transition ${
                      isSelected
                        ? 'bg-[#D9C49A]/16 border-l-2 border-l-[#D9C49A]'
                        : c.unlocked
                          ? 'hover:bg-white/[0.05]'
                          : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <PortraitAvatar src={c.avatar} alt={c.name} className="w-8 h-8" rounded="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#F3F0E8] truncate">{c.name}</span>
                        {c.isResident && <span className="text-[10px] text-[#D9C49A]">同住</span>}
                      </div>
                      <div className="text-[10px] text-[#8A8E9B] truncate">
                        {c.unlocked ? c.title : '待结识'}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-[#D9C49A] shrink-0" />
                    ) : !c.unlocked ? (
                      <Lock className="w-3 h-3 text-[#6F7896] shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LAYER 3: RESTRAINED BOTTOM-DOCKED COMPANION SPEECH SUBTITLE (Appears cleanly above bottom footer, never blocks face) */}
      <AnimatePresence>
        {!pureArtMode && pokeBubble && (
          <motion.div
            key={pokeBubble.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-4 bottom-[150px] z-30"
          >
            <div className="bg-[#0D1326]/86 backdrop-blur-xl border-l-2 border-l-[#D9C49A] border-y border-r border-white/[0.08] px-3.5 py-2.5 space-y-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.72)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#E2D3B0] tracking-wider">{pokeBubble.name}</span>
                <div className="flex items-center gap-2.5">
                  {pokeBubble.innerThought && (
                    <button
                      onClick={() => {
                        playTap();
                        setThoughtOpen((v) => !v);
                        scheduleBubbleAutoDismiss(11000);
                      }}
                      className="text-[10.5px] text-[#FFB3C6] hover:text-[#FFD6E1] flex items-center gap-0.5"
                    >
                      <GameIcon name="heart" size={14} shadow={false} />
                      <span>{thoughtOpen ? '收起' : '心声'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPokeBubble(null);
                      setThoughtOpen(false);
                    }}
                    className="text-[#8C90A0] hover:text-white"
                    aria-label="关闭"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[12.5px] text-[#F3F0E8] leading-[1.65]">{pokeBubble.line}</p>
              <AnimatePresence>
                {thoughtOpen && pokeBubble.innerThought && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="pt-1 border-t border-white/[0.07] text-[11px] text-[#DFC48A] italic leading-relaxed">
                      「{pokeBubble.innerThought}」
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LAYER 4: FOOTER — companion nameplate + main story entry */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6 flex items-end justify-between gap-3 transition-all duration-500 ${
          pureArtMode ? 'opacity-0 translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Nameplate */}
        <div className="min-w-0 pl-1">
          <div className="text-[10px] tracking-[0.3em] text-[#D9C49A]/90 font-bold mb-1 text-stroke-dark">
            {activeCompanion.kind === 'heroine' ? 'COMPANION' : activeCompanion.kind === 'ally' ? 'BUTLER' : 'MASTER'}
          </div>
          <h1 className="font-editorial text-[30px] font-black leading-none gold-gradient-text drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {activeCompanion.name}
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            {activeCompanion.kind === 'heroine' && activeCompanion.stage && (
              <span className="px-1.5 py-[1px] rounded-sm bg-gradient-to-r from-[#F0789A] to-[#C24E74] text-[10px] font-bold text-white shadow">
                {activeCompanion.stage.name}
              </span>
            )}
            <span className="text-[11px] text-[#C2C5CF] text-stroke-dark truncate">
              {mainResidence?.displayName || '海城居所'} · {shortTime}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setResidenceSheet('interact');
              }}
              className="btn-navy h-8 pl-1 pr-3 flex items-center gap-1 text-[11.5px] !rounded-full"
            >
              <GameIcon name="heart" size={24} />
              居家时光
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setResidenceSheet('keys');
              }}
              className="btn-navy h-8 pl-1 pr-3 flex items-center gap-1 text-[11.5px] !rounded-full"
            >
              <GameIcon name="key" size={24} />
              钥匙
            </button>
          </div>
        </div>

        {/* Main-story entry plate */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleResumeStory();
          }}
          className="relative shrink-0 w-[150px] h-[96px] rounded-[8px] overflow-visible text-left active:scale-[0.97] transition"
        >
          <div className="absolute inset-0 rounded-[8px] overflow-hidden border border-[#D9C49A]/80 shadow-[0_10px_28px_rgba(0,0,0,0.6),0_0_18px_rgba(217,196,154,0.25)]">
            <img
              src={nextEpisodeCover}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/55 to-[#05070D]/10" />
          </div>
          <OrnateCorners size={18} inset={-4} />
          <div className="absolute -top-2.5 left-2 px-2 py-[2px] rounded-sm text-[10px] font-black tracking-[0.2em] text-[#19130A] bg-gradient-to-b from-[#EEE2C6] to-[#C4AE80] shadow">
            {nextEpisode ? (nextEpisodeLocked ? '待解锁' : '主线') : '出行'}
          </div>
          <div className="absolute inset-x-2.5 bottom-2">
            <div className="text-[10px] text-[#E2D3B0] tracking-wider truncate text-stroke-dark">
              {nextEpisode
                ? nextEpisodeLocked
                  ? `身价需 ${formatMoney(nextEpisode.requireNetWorth)}`
                  : nextEpisode.chapterTitle
                : '海城出行'}
            </div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <div className="font-editorial text-[15px] font-black text-[#ECE6DA] truncate text-stroke-dark">
                {nextEpisode ? nextEpisode.title : equippedCar?.name || '前往海城'}
              </div>
              <GameIcon name={nextEpisodeLocked ? 'lock' : 'play'} size={nextEpisodeLocked ? 22 : 26} />
            </div>
          </div>
        </button>
      </div>
      {/* DIRECT HOME RESIDENCE SHEET (Home Interactions + Key Management right inside Home!) */}
      <AnimatePresence>
        {residenceSheet && mainResidence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setResidenceSheet(null)}
            className="absolute inset-0 z-40 bg-black/68 backdrop-blur-sm flex items-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full max-h-[72%] rounded-t-[16px] border-t border-[#D9C49A]/50 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-1 p-1 rounded-full bg-[#06080E]/90 border border-[#D9C49A]/25">
                  <button
                    data-active={residenceSheet === 'interact'}
                    onClick={() => setResidenceSheet('interact')}
                    className="tab-chip font-editorial flex items-center gap-1 !pl-1.5"
                  >
                    <GameIcon name="heart" size={20} shadow={false} />
                    居家时光
                  </button>
                  <button
                    data-active={residenceSheet === 'keys'}
                    onClick={() => setResidenceSheet('keys')}
                    className="tab-chip font-editorial flex items-center gap-1 !pl-1.5"
                  >
                    <GameIcon name="key" size={20} shadow={false} />
                    居所与钥匙
                  </button>
                </div>
                <button onClick={() => setResidenceSheet(null)} className="p-1 text-[#8C90A0] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto no-scrollbar space-y-3">
                {residenceSheet === 'interact' && (
                  <>
                    {residentHeroineObjs.length === 0 ? (
                      <div className="py-6 text-center space-y-3">
                        <p className="text-xs text-[#8C90A0]">
                          {mainResidence.displayName} 暂未留宿红颜，赠予钥匙后可在此共度居家时光。
                        </p>
                        <button
                          onClick={() => setResidenceSheet('keys')}
                          className="btn-brass px-4 py-2 rounded-[4px] text-xs"
                        >
                          赠予居所钥匙
                        </button>
                      </div>
                    ) : (
                      residentHeroineObjs.map((h: any) => (
                        <div key={h.id} className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-[#E6A4B8]">
                            <PortraitAvatar src={h.avatar} alt={h.name} className="w-6 h-6" rounded="sm" />
                            <span className="font-medium">{h.name}</span>
                          </div>
                          <div className="divide-y divide-white/[0.06] border-y border-white/[0.07]">
                            {(mainResidence.homeInteractions || []).map((inter: any) => (
                              <button
                                key={inter.id}
                                disabled={busy}
                                onClick={() => handleHomeInteract(inter, h)}
                                className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition"
                              >
                                <div className="min-w-0">
                                  <div className="text-[13px] font-semibold text-[#F3F0E8]">{inter.name}</div>
                                  <div className="text-[11px] text-[#858999] mt-0.5 line-clamp-1">{inter.desc}</div>
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
                  </>
                )}

                {residenceSheet === 'keys' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#E2D3B0] font-medium">
                        {mainResidence.displayName}（入住 {residentHeroineObjs.length}/{mainResidence.maxResidents}）
                      </span>
                      <span className="text-[11px] text-[#8C90A0]">同住每日提升好感</span>
                    </div>
                    {unlockedHeroines.length === 0 ? (
                      <div className="text-xs text-[#858999] py-4 text-center">
                        推进主线结识红颜后，可在此赠予居所钥匙。
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {unlockedHeroines.map((h: any) => {
                          const here = residenceResidents.includes(h.id);
                          return (
                            <button
                              key={h.id}
                              disabled={here}
                              onClick={() => handleAssignHeroine(h.id)}
                              className={`p-2.5 rounded-[4px] flex items-center gap-2.5 text-left border transition ${
                                here
                                  ? 'bg-[#F0789A]/12 border-[#F0789A]/40'
                                  : 'bg-white/[0.03] border-white/[0.08] hover:border-[#D9C49A]/40'
                              }`}
                            >
                              <PortraitAvatar src={h.avatar} alt={h.name} className="w-8 h-8" rounded="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#F3F0E8] truncate">{h.name}</div>
                                <div className="text-[10px] text-[#D9C49A]">{here ? '已入住' : '赠予钥匙'}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PURE ART MODE RESTORE HINT */}
      <AnimatePresence>
        {pureArtMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: pureHintFaded ? 0.25 : 0.85, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-6 inset-x-0 z-30 flex justify-center pointer-events-none"
          >
            <div className="game-pill px-3.5 py-1.5 rounded-[4px] text-[11px] text-[#E6E3DC] flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[#D9C49A]" />
              <span>轻触屏幕恢复界面</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
