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
  const unreadMailCount = state?.unreadMailCount || 0;
  const timePeriod = state?.timePeriod;
  const timeLabel = state?.timeLabel || '';

  const protagonistSrc =
    (stories?.completedEpisodes?.length || 0) >= 2
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
      (v.episodes || []).map((ep: any) => ({ ...ep, volumeTitle: v.title })),
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
    !player.signedInToday || dailyTasks?.some((t: any) => !t.claimed && t.progress >= t.target);
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
      applyServerState(res.state);
      playCoinBurst();
      notifyTop('bank', '签到完成', res.message || '今日补给已入账');
      spawnParticle('签到已领', 'gold');
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
      playCoinBurst();
      spawnParticle(`+${formatMoney(collected)}`, 'gold');
      notifyTop('bank', '收益已入账', `产业分红与物业租金共计 ${formatMoney(collected)}`);
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

  const handleResumeStory = () => {
    playTap();
    if (nextEpisode?.episodeId) {
      setActiveTab('story');
      setActiveStoryEpisodeId(nextEpisode.episodeId);
    } else {
      setActiveTab('map');
    }
  };

  const shortTime = timeLabel.split(' ')[0] || timeLabel;

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
      className="relative h-full w-full overflow-hidden bg-[#08090C] select-none"
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
        className={`absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#07080B]/92 via-[#07080B]/58 to-transparent pointer-events-none transition-opacity duration-500 ${
          pureArtMode ? 'opacity-15' : 'opacity-100'
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 h-[250px] bg-gradient-to-t from-[#08090C] via-[#08090C]/78 to-transparent pointer-events-none transition-opacity duration-500 ${
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
            key={activeCompanion.id}
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
                p.kind === 'heart' ? 'text-[#EEA0B8]' : 'text-[#EBD4A2]'
              }`}
            >
              {p.label}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* LAYER 2: MATURE-GAME HOMEPAGE HEADER — LARGE TOP-LEFT PLAYER EMBLEM + CLEAN TOP-RIGHT HUD */}
      <div
        className={`absolute top-0 inset-x-0 z-20 px-3.5 pt-3.5 flex items-start justify-between gap-2 pointer-events-none transition-all duration-500 ${
          pureArtMode ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* TOP-LEFT: PROMINENT LARGE PLAYER IDENTITY CARD (62x62 portrait + serif name + tier progress bar) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            playTap();
            openProfile('tasks');
          }}
          className="pointer-events-auto flex items-center gap-3 text-left group active:scale-[0.985] transition max-w-[60%]"
          title="个人档案与天枢"
        >
          {/* Large 62x62 Framed Protagonist Portrait with Brass Corner Ticks */}
          <div className="relative w-[62px] h-[62px] shrink-0 bg-[#101116] p-[2px] border border-[#CFB073]/60 shadow-[0_10px_26px_rgba(0,0,0,0.72)]">
            <PortraitAvatar src={protagonistSrc} alt={user.nickname} className="w-full h-full" rounded="sm" />
            {/* Architectural brass corner accents */}
            <span className="absolute -top-[1px] -left-[1px] w-2.5 h-2.5 border-t-2 border-l-2 border-[#EBD4A2] pointer-events-none" />
            <span className="absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 border-b-2 border-r-2 border-[#EBD4A2] pointer-events-none" />
            {/* Level Crest */}
            <span className="absolute -bottom-1.5 -left-1.5 px-1.5 py-[1px] bg-[#161410] border border-[#CFB073]/75 text-[9.5px] font-bold text-[#EBD4A2] leading-tight tabular-nums shadow">
              Lv.{player.sysLevel}
            </span>
            {hasProfileDot && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D95B78] ring-2 ring-[#090A0D]" />
            )}
          </div>

          {/* Open-Air Player Name, Rank & Net-Worth Progress Hairline */}
          <div className="min-w-0 py-0.5 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-editorial text-[18px] font-bold text-[#F6F3EB] tracking-wider leading-none text-shadow-stage truncate">
                {user.nickname}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-shadow-stage">
              <span className="text-[#EBD4A2] font-medium shrink-0">{player.tier.name}</span>
              <span className="text-[#DCDFE8] tabular-nums truncate">
                <AnimatedNumber value={player.netWorth} />
              </span>
            </div>
            {/* Sleek Tier Progress Hairline Bar */}
            <div className="w-[106px] h-[3px] bg-white/15 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#B7914A] to-[#F1DBAA] transition-all duration-500"
                style={{ width: `${tierProgressPct}%` }}
              />
            </div>
          </div>
        </button>

        {/* TOP-RIGHT: CLEAN OPEN-AIR RESOURCES + FRAMELESS UTILITY ROW */}
        <div className="pointer-events-auto flex flex-col items-end gap-2 shrink-0">
          {/* Numeric Strip: Cash + Energy */}
          <div className="hud-strip px-2.5 py-1 flex items-center gap-2.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setActiveTab('assets');
              }}
              className="text-[12px] font-bold text-[#EBD4A2] tracking-tight active:opacity-75"
              title="资金与产业"
            >
              <AnimatedNumber value={player.cash} highlightOnIncrease />
            </button>
            <span className="w-[1px] h-3 bg-white/15" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                openProfile('mall');
              }}
              className="flex items-center gap-0.5 text-[11.5px] font-semibold text-[#F0EDE6] tabular-nums active:opacity-75"
              title="精力补给"
            >
              <Zap className="w-3 h-3 text-[#CFB073]" />
              <span>{player.energy}</span>
              <Plus className="w-2.5 h-2.5 text-[#9EA2AE]" />
            </button>
          </div>

          {/* Frameless Minimal Icon Row (Mail, Rank, Switch Companion, Hide UI) */}
          <div className="flex items-center gap-2.5 pr-0.5 text-[#DDDAD2]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setShowMail(true);
              }}
              className="relative p-1 hover:text-[#EBD4A2] transition active:scale-90 text-shadow-stage"
              aria-label="信箱"
              title="信箱"
            >
              <Mail className="w-[17px] h-[17px] drop-shadow" strokeWidth={1.75} />
              {unreadMailCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#D95B78]" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setShowLeaderboard(true);
              }}
              className="p-1 hover:text-[#EBD4A2] transition active:scale-90"
              aria-label="财富榜"
              title="财富榜"
            >
              <Trophy className="w-[17px] h-[17px] drop-shadow" strokeWidth={1.75} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setPickerOpen((v) => !v);
              }}
              className={`p-1 transition active:scale-90 ${pickerOpen ? 'text-[#EBD4A2]' : 'hover:text-[#EBD4A2]'}`}
              aria-label="切换看板"
              title="切换人物"
            >
              <Users className="w-[17px] h-[17px] drop-shadow" strokeWidth={1.75} />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                onTogglePureArt(true);
              }}
              className="p-1 hover:text-[#EBD4A2] transition active:scale-90"
              aria-label="纯享视野"
              title="隐藏界面"
            >
              <EyeOff className="w-[17px] h-[17px] drop-shadow" strokeWidth={1.75} />
            </button>
          </div>

          {/* Compact Accruing Dividend Seal (upper-right edge, clear of companion's face/shoulder) */}
          {livePendingIncome > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleCollectVault();
              }}
              disabled={collecting}
              className="mt-0.5 panel-brass clip-chamfer-sm px-2.5 py-1.5 flex items-center gap-2 text-left animate-float-slow active:scale-95 transition"
            >
              <Coins className="w-3.5 h-3.5 text-[#EBD4A2] shrink-0" />
              <div className="leading-tight">
                <div className="text-[9px] text-[#C8B489]">待收分红</div>
                <div className="text-[11px] font-bold text-[#F5E3B6]">
                  <AnimatedNumber value={livePendingIncome} duration={360} />
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Slim Left-Edge Sign-In Trigger (ONLY shown when not yet signed in today — disappears after!) */}
      {!pureArtMode && !player.signedInToday && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleQuickSignIn();
          }}
          disabled={signingIn}
          className="absolute left-3.5 top-[96px] z-20 panel-brass clip-chamfer-sm px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#F4DFA8] active:scale-95 transition"
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          <span>今日签到</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#D95B78]" />
        </button>
      )}

      {/* Companion Switcher Popover */}
      <AnimatePresence>
        {!pureArtMode && pickerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-[74px] right-3.5 z-40 w-[228px] panel-elevated rounded-[6px] p-2 space-y-1"
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.08]">
              <span className="text-[11px] font-medium tracking-wider text-[#CFB073]">切换驻留人物</span>
              <button onClick={() => setPickerOpen(false)} className="text-[#848896] hover:text-white">
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
                        ? 'bg-[#CFB073]/16 border-l-2 border-l-[#CFB073]'
                        : c.unlocked
                          ? 'hover:bg-white/[0.05]'
                          : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <PortraitAvatar src={c.avatar} alt={c.name} className="w-8 h-8" rounded="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#F3F0E8] truncate">{c.name}</span>
                        {c.isResident && <span className="text-[9px] text-[#CFB073]">同住</span>}
                      </div>
                      <div className="text-[10px] text-[#8A8E9B] truncate">
                        {c.unlocked ? c.title : '待结识'}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-[#CFB073] shrink-0" />
                    ) : !c.unlocked ? (
                      <Lock className="w-3 h-3 text-[#757986] shrink-0" />
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
            className="absolute inset-x-4 bottom-[106px] z-30"
          >
            <div className="bg-[#0B0C10]/86 backdrop-blur-xl border-l-2 border-l-[#CFB073] border-y border-r border-white/[0.08] px-3.5 py-2.5 space-y-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.72)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#EBD4A2] tracking-wider">{pokeBubble.name}</span>
                <div className="flex items-center gap-2.5">
                  {pokeBubble.innerThought && (
                    <button
                      onClick={() => {
                        playTap();
                        setThoughtOpen((v) => !v);
                        scheduleBubbleAutoDismiss(11000);
                      }}
                      className="text-[10.5px] text-[#D8B979] hover:text-[#F4DFA8] flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{thoughtOpen ? '收起' : '心声'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPokeBubble(null);
                      setThoughtOpen(false);
                    }}
                    className="text-[#848896] hover:text-white"
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

      {/* LAYER 4: CLEAN SINGLE-TIER EDITORIAL BOTTOM FOOTER (Zero duplicate buttons!) */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-6 flex items-end justify-between gap-3 transition-all duration-500 ${
          pureArtMode ? 'opacity-0 translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Bottom-Left: Open-Air Companion Nameplate + Residence Home-Time Entry */}
        <div className="min-w-0 space-y-1.5">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="font-editorial text-[24px] font-bold text-[#F6F3EB] tracking-[0.08em] leading-none text-shadow-stage">
                {activeCompanion.name}
              </h1>
              {activeCompanion.kind === 'heroine' && activeCompanion.stage && (
                <span className="text-[10.5px] text-[#E6A4B8] font-medium tabular-nums text-shadow-stage">
                  {activeCompanion.stage.name}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#B8BBC6] mt-1.5 text-shadow-stage truncate">
              {mainResidence?.displayName || '海城居所'} · {shortTime}
            </div>
          </div>

          {/* Direct Residence Interaction / Keys Trigger right from Home (no teleporting through Map!) */}
          <div className="flex items-center gap-3 pt-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setResidenceSheet('interact');
              }}
              className="text-[11px] text-[#EBD4A2] hover:text-white flex items-center gap-1 border-b border-[#CFB073]/45 pb-0.5 transition active:opacity-75"
            >
              <Heart className="w-3 h-3 text-[#D97791]" />
              <span>居家时光</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                playTap();
                setResidenceSheet('keys');
              }}
              className="text-[11px] text-[#B8BBC6] hover:text-white flex items-center gap-1 border-b border-white/20 pb-0.5 transition active:opacity-75"
            >
              <KeyRound className="w-3 h-3 text-[#CFB073]" />
              <span>居所钥匙</span>
            </button>
          </div>
        </div>

        {/* Bottom-Right: ONE Sculptural Asymmetric Editorial Action Block */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleResumeStory();
          }}
          className="shrink-0 w-[166px] panel-brass clip-chamfer px-3.5 py-2.5 text-left group active:scale-[0.975] transition"
        >
          {nextEpisode ? (
            <>
              <div className="flex items-center justify-between text-[10px] text-[#CFB073] tracking-wider">
                <span>主线 · {nextEpisode.chapterTitle}</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="font-editorial text-[15px] font-bold text-[#F7F3EA] truncate mt-1 tracking-wide">
                {nextEpisode.title}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] text-[#CFB073] tracking-wider">海城出行</div>
                <div className="font-editorial text-[14px] font-bold text-[#F7F3EA] mt-0.5 truncate">
                  {equippedCar?.name || '前往海城'}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#CFB073] shrink-0" />
            </div>
          )}
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
              className="panel-elevated w-full max-h-[72%] border-t border-[#CFB073]/30 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setResidenceSheet('interact')}
                    className={`text-sm font-editorial font-bold pb-0.5 border-b-2 transition ${
                      residenceSheet === 'interact'
                        ? 'text-[#EBD4A2] border-[#CFB073]'
                        : 'text-[#848896] border-transparent'
                    }`}
                  >
                    居家时光
                  </button>
                  <button
                    onClick={() => setResidenceSheet('keys')}
                    className={`text-sm font-editorial font-bold pb-0.5 border-b-2 transition ${
                      residenceSheet === 'keys'
                        ? 'text-[#EBD4A2] border-[#CFB073]'
                        : 'text-[#848896] border-transparent'
                    }`}
                  >
                    居所与钥匙
                  </button>
                </div>
                <button onClick={() => setResidenceSheet(null)} className="p-1 text-[#848896] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto no-scrollbar space-y-3">
                {residenceSheet === 'interact' && (
                  <>
                    {residentHeroineObjs.length === 0 ? (
                      <div className="py-6 text-center space-y-3">
                        <p className="text-xs text-[#9EA2AE]">
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
                                  <div className="text-[11px] text-[#8E92A0] mt-0.5 line-clamp-1">{inter.desc}</div>
                                </div>
                                <span className="text-xs text-[#CFB073] flex items-center gap-0.5 shrink-0 tabular-nums">
                                  <Zap className="w-3 h-3" /> {inter.energy}
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
                      <span className="text-[#EBD4A2] font-medium">
                        {mainResidence.displayName}（入住 {residentHeroineObjs.length}/{mainResidence.maxResidents}）
                      </span>
                      <span className="text-[11px] text-[#848896]">同住每日提升好感</span>
                    </div>
                    {unlockedHeroines.length === 0 ? (
                      <div className="text-xs text-[#8E92A0] py-4 text-center">
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
                                  ? 'bg-[#D97791]/12 border-[#D97791]/40'
                                  : 'bg-white/[0.03] border-white/[0.08] hover:border-[#CFB073]/40'
                              }`}
                            >
                              <PortraitAvatar src={h.avatar} alt={h.name} className="w-8 h-8" rounded="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#F3F0E8] truncate">{h.name}</div>
                                <div className="text-[10px] text-[#CFB073]">{here ? '已入住' : '赠予钥匙'}</div>
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
              <Eye className="w-3.5 h-3.5 text-[#CFB073]" />
              <span>轻触屏幕恢复界面</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
