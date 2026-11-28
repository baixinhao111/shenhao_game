import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FastForward,
  History,
  MessageCircle,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import {
  playAffectionChime,
  playCoinBurst,
  playHeartbeat,
  playImpactSlap,
  playSystemPing,
  playTap,
} from '../lib/sound';
import { useGameStore, type VNChoiceOption, type VNNode } from '../store/useGameStore';
import { AnimatedNumber } from './AnimatedNumber';
import { Atmosphere, EdgeLabel, Watermark } from './Atmosphere';
import { PortraitAvatar } from './PortraitAvatar';
import { GameIcon, OrnateCorners, type GameIconName } from './GameIcon';
import { NarrativeChoicePanel, renderSysText, SystemAlertPanel, SystemChoicePanel, TianshuStatusPanel, TianshuSummonButton } from './vn/SystemPanels';

export interface VNSettlementData {
  mode: 'main' | 'date' | 'home' | 'stroll' | 'bond' | 'shura' | 'biz_event' | 'luxury';
  chapterLabel?: string;
  title: string;
  subtitle?: string;
  reactionText?: string;
  resultText?: string;
  cliffhanger?: string;
  heroineId?: string;
  heroineName?: string;
  heroineAvatar?: string;
  heroinePortrait?: string;
  locationLabel?: string;
  rewards?: {
    cash?: number;
    critCashback?: number;
    critMultiplier?: number;
    sysPoints?: number;
    affectionGain?: number;
    affectionHeroineName?: string;
    bonusAffection?: number;
    unlockedHeroineName?: string;
    unlockedAssetName?: string;
    unlockedOutfitName?: string;
  };
  nextEpisodeId?: string | null;
  nextEpisodeLabel?: string | null;
  nextEpisodeTitle?: string | null;
  nextEpisodeUnlocked?: boolean;
  nextEpisodeLockReason?: string | null;
  alreadyCompleted?: boolean;
}

export interface VisualNovelScript {
  id: string;
  mode: 'main' | 'date' | 'home' | 'stroll' | 'bond' | 'shura' | 'biz_event' | 'luxury';
  chapterTitle: string;
  sceneLabel?: string;
  title: string;
  subtitle?: string;
  bg: string;
  nodes: VNNode[];
  cliffhanger?: string;
  alreadyCompleted?: boolean;
}

export interface VisualNovelTheaterProps {
  script: VisualNovelScript;
  onExit: () => void;
  onComplete: (result: {
    chosenIds: string[];
    chosenOptions: VNChoiceOption[];
  }) => Promise<VNSettlementData | null>;
  onNextEpisode?: (episodeId: string) => void;
  onOpenChat?: (heroineId: string, locationOverride?: string | null) => void;
}

const SPEAKER_FALLBACK_SPRITE: Record<string, string> = {
  protagonist: '/assets/characters/protagonist.png',
  su_qingwan: '/assets/characters/su_qingwan.png',
  lin_wanxing: '/assets/characters/lin_wanxing.png',
  shen_liuli: '/assets/characters/shen_liuli.png',
  lu_zhiwei: '/assets/characters/lu_zhiwei.png',
  bai_mengyao: '/assets/characters/bai_mengyao.png',
  zhao_tianyu: '/assets/characters/zhao_tianyu.png',
  wang_qiang: '/assets/characters/wang_qiang.png',
  chen_mo: '/assets/characters/chen_mo.png',
  zhou: '/assets/npc/zhou.webp',
  qian: '/assets/npc/qian.webp',
  lin_jie: '/assets/npc/lin_jie.webp',
  akun: '/assets/npc/akun.webp',
};

interface VNBookmark {
  scriptId: string;
  baseLen: number;
  nodeIdx: number;
  queue: VNNode[];
  chosenIds: string[];
  chosenOptions: VNChoiceOption[];
  resolvedChoices: Record<number, VNChoiceOption>;
}

const BOOKMARK_PREFIX = 'tianshu_vn_bm_';

function bmKey(userId: string | number | undefined, scriptId: string): string {
  return `${BOOKMARK_PREFIX}${userId ?? 'anon'}_${scriptId}`;
}

function loadVNBookmark(userId: string | number | undefined, scriptId: string, baseLen: number): VNBookmark | null {
  try {
    if (typeof window === 'undefined' || !userId) return null;
    const raw = localStorage.getItem(bmKey(userId, scriptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VNBookmark;
    if (
      parsed &&
      parsed.scriptId === scriptId &&
      parsed.baseLen === baseLen &&
      Array.isArray(parsed.queue) &&
      parsed.nodeIdx > 0 &&
      parsed.nodeIdx < parsed.queue.length
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveVNBookmark(userId: string | number | undefined, bm: VNBookmark): void {
  try {
    if (typeof window !== 'undefined' && userId) {
      localStorage.setItem(bmKey(userId, bm.scriptId), JSON.stringify(bm));
    }
  } catch {}
}

function clearVNBookmark(userId: string | number | undefined, scriptId: string): void {
  try {
    if (typeof window !== 'undefined' && userId) {
      localStorage.removeItem(bmKey(userId, scriptId));
    }
  } catch {}
}

const MODE_LABELS: Record<VisualNovelScript['mode'], string> = {
  main: '主线',
  date: '赴约',
  home: '居家',
  stroll: '偶遇',
  bond: '羁绊',
  shura: '修罗场',
  biz_event: '经营',
  luxury: '私宴',
};

const PRELOADED_VN_URLS = new Set<string>();
function prefetchImage(url?: string) {
  if (!url || typeof window === 'undefined' || PRELOADED_VN_URLS.has(url)) return;
  PRELOADED_VN_URLS.add(url);
  const img = new Image();
  img.src = url;
}

interface StageSprites {
  dual: boolean;
  left?: string;
  right?: string;
  activeSide?: 'left' | 'right' | 'both' | 'none';
  single?: string;
  dimSingle?: boolean;
}

function resolveStageSprites(queue: VNNode[], idx: number): StageSprites {
  const cur = queue[idx];
  if (!cur) return { dual: false };

  if (cur.leftSprite || cur.rightSprite) {
    let activeSide = cur.activeSide;
    if (!activeSide) {
      if (cur.speaker === 'protagonist' && cur.leftSprite?.includes('protagonist')) activeSide = 'left';
      else if (cur.speaker && cur.speaker !== 'protagonist' && cur.rightSprite) activeSide = 'right';
      else activeSide = 'both';
    }
    return {
      dual: true,
      left: cur.leftSprite,
      right: cur.rightSprite,
      activeSide,
    };
  }

  if (cur.sprite || cur.portrait) {
    return { dual: false, single: cur.sprite || cur.portrait };
  }

  if (cur.type === 'narration' && (cur.bg || cur.sceneBanner)) {
    return { dual: false };
  }

  if (cur.speaker && SPEAKER_FALLBACK_SPRITE[cur.speaker]) {
    return { dual: false, single: SPEAKER_FALLBACK_SPRITE[cur.speaker] };
  }

  for (let i = idx - 1; i >= 0; i -= 1) {
    const prev = queue[i];
    if (prev.leftSprite || prev.rightSprite) {
      return {
        dual: true,
        left: prev.leftSprite,
        right: prev.rightSprite,
        activeSide: cur.type === 'narration' ? 'none' : prev.activeSide || 'both',
      };
    }
    if (prev.sprite || prev.portrait) {
      return {
        dual: false,
        single: prev.sprite || prev.portrait,
        dimSingle: cur.type === 'narration',
      };
    }
    if (prev.bg && prev.bg !== cur.bg) break;
  }

  return { dual: false };
}

function resolveActiveBg(queue: VNNode[], idx: number, defaultBg: string): string {
  for (let i = idx; i >= 0; i -= 1) {
    const bg = queue[i]?.bg;
    if (bg) return bg;
  }
  return defaultBg;
}

export const VisualNovelTheater: React.FC<VisualNovelTheaterProps> = ({
  script,
  onExit,
  onComplete,
  onNextEpisode,
  onOpenChat,
}) => {
  const { state, triggerBarrage, showError } = useGameStore();

  const [queue, setQueue] = useState<VNNode[]>(() => script.nodes || []);
  const [nodeIdx, setNodeIdx] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [showOpeningCard, setShowOpeningCard] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [fastForward, setFastForward] = useState(false);
  const [hideUi, setHideUi] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [chosenOptions, setChosenOptions] = useState<VNChoiceOption[]>([]);
  const [resolvedChoices, setResolvedChoices] = useState<Record<number, VNChoiceOption>>({});

  const [peekOpen, setPeekOpen] = useState(false);
  const [revealedThoughts, setRevealedThoughts] = useState<Record<number, boolean>>({});
  const [activeBanner, setActiveBanner] = useState<{ id: number; text: string } | null>(null);

  const [effectTick, setEffectTick] = useState<{ id: number; kind: NonNullable<VNNode['effect']> } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [settlement, setSettlement] = useState<VNSettlementData | null>(null);

  const lastEffectKeyRef = useRef<string>('');
  const lastBannerKeyRef = useRef<string>('');
  const skipTypewriterRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onExitRef = useRef(onExit);
  onCompleteRef.current = onComplete;
  onExitRef.current = onExit;

  const userId = state?.user?.id;

  useEffect(() => {
    const baseNodes = script.nodes || [];
    const saved =
      script.mode === 'main' && !script.alreadyCompleted
        ? loadVNBookmark(userId, script.id, baseNodes.length)
        : null;

    if (saved) {
      setQueue(saved.queue);
      setNodeIdx(saved.nodeIdx);
      setTypedCount(0);
      setShowOpeningCard(false);
      setChosenIds(saved.chosenIds || []);
      setChosenOptions(saved.chosenOptions || []);
      setResolvedChoices(saved.resolvedChoices || {});
      skipTypewriterRef.current = true;
    } else {
      setQueue(baseNodes);
      setNodeIdx(0);
      setTypedCount(0);
      setShowOpeningCard(true);
      setChosenIds([]);
      setChosenOptions([]);
      setResolvedChoices({});
      skipTypewriterRef.current = false;
    }

    setAutoPlay(false);
    setFastForward(false);
    setHideUi(false);
    setShowLog(false);
    setShowStatus(false);
    setPeekOpen(false);
    setRevealedThoughts({});
    setActiveBanner(null);
    setEffectTick(null);
    setSubmitting(false);
    setSettlement(null);
    lastEffectKeyRef.current = '';
    lastBannerKeyRef.current = '';

    if (!saved) {
      const timer = setTimeout(() => setShowOpeningCard(false), 1250);
      return () => clearTimeout(timer);
    }
  }, [script.id, userId]);

  // Persist reading position for long novel-grade main chapters
  useEffect(() => {
    if (script.mode !== 'main' || script.alreadyCompleted || settlement) return;
    if (nodeIdx > 0 && nodeIdx < queue.length) {
      saveVNBookmark(userId, {
        scriptId: script.id,
        baseLen: (script.nodes || []).length,
        nodeIdx,
        queue,
        chosenIds,
        chosenOptions,
        resolvedChoices,
      });
    }
  }, [userId, script.id, script.mode, script.alreadyCompleted, script.nodes, settlement, nodeIdx, queue, chosenIds, chosenOptions, resolvedChoices]);

  const currentNode = queue[nodeIdx] || null;
  // 序章 ep_001 在首次 system_alert（「天枢静默终端 · 首次唤醒」）出现前，天枢尚未激活：
  // 不显示右上天枢按钮、不允许唤出天枢面板、隐藏心声读心、抉择使用普通叙事面板而非天枢全息面板。
  const firstSysAlertIdx = useMemo(() => queue.findIndex((n) => n.type === 'system_alert'), [queue]);
  const tianshuAwakened = script.id !== 'ep_001' || (firstSysAlertIdx >= 0 && nodeIdx >= firstSysAlertIdx);

  useEffect(() => {
    if (!tianshuAwakened) {
      setShowStatus(false);
      setPeekOpen(false);
    }
  }, [tianshuAwakened]);
  const fullText = useMemo(() => {
    if (!currentNode) return '';
    if (currentNode.text) return currentNode.text;
    if (currentNode.type === 'barrage') {
      return currentNode.style === 'gold' ? '周围的低语一下子变了调子。' : '周围几道目光齐刷刷扫了过来。';
    }
    return '';
  }, [currentNode]);

  const activeBg = useMemo(() => resolveActiveBg(queue, nodeIdx, script.bg), [queue, nodeIdx, script.bg]);
  const stageSprites = useMemo(() => resolveStageSprites(queue, nodeIdx), [queue, nodeIdx]);

  // Lookahead preload: silently cache the next 3 nodes' backgrounds & portraits so transitions never flicker
  useEffect(() => {
    prefetchImage(script.bg);
    for (let i = nodeIdx; i <= Math.min(queue.length - 1, nodeIdx + 3); i += 1) {
      const n = queue[i];
      if (!n) continue;
      prefetchImage(n.bg);
      prefetchImage(n.sprite);
      prefetchImage(n.portrait);
      prefetchImage(n.leftSprite);
      prefetchImage(n.rightSprite);
      if (n.speaker && SPEAKER_FALLBACK_SPRITE[n.speaker]) {
        prefetchImage(SPEAKER_FALLBACK_SPRITE[n.speaker]);
      }
    }
  }, [queue, nodeIdx, script.bg]);

  const isLast = nodeIdx >= queue.length - 1;
  const isTyping = fullText.length > 0 && typedCount < fullText.length;

  const prevStepIdx = useMemo(() => {
    for (let i = nodeIdx - 1; i >= 0; i -= 1) {
      if (queue[i]?.type !== 'system_choice') return i;
    }
    return -1;
  }, [queue, nodeIdx]);

  useEffect(() => {
    setPeekOpen(false);
  }, [nodeIdx, queue.length]);

  useEffect(() => {
    if (showOpeningCard || settlement) return;
    if (!fullText) {
      setTypedCount(0);
      return;
    }
    if (skipTypewriterRef.current || fastForward) {
      skipTypewriterRef.current = false;
      setTypedCount(fullText.length);
      return;
    }
    setTypedCount(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTypedCount(i);
      if (i >= fullText.length) clearInterval(timer);
    }, 22);
    return () => clearInterval(timer);
  }, [nodeIdx, fullText, showOpeningCard, settlement, fastForward]);

  useEffect(() => {
    if (showOpeningCard || settlement || !currentNode) return;
    const nodeKey = `${script.id}:${nodeIdx}:${currentNode.type}:${currentNode.text?.slice(0, 12) || ''}`;
    if (currentNode.sceneBanner && lastBannerKeyRef.current !== nodeKey) {
      lastBannerKeyRef.current = nodeKey;
      const bannerId = Date.now();
      setActiveBanner({ id: bannerId, text: currentNode.sceneBanner });
      const t = setTimeout(() => {
        setActiveBanner((prev) => (prev?.id === bannerId ? null : prev));
      }, 2300);
      return () => clearTimeout(t);
    }
  }, [script.id, nodeIdx, currentNode, showOpeningCard, settlement]);

  useEffect(() => {
    if (showOpeningCard || settlement || !currentNode) return;
    const nodeKey = `${script.id}:${nodeIdx}:${currentNode.type}:${currentNode.effect || ''}:${currentNode.text?.slice(0, 12) || ''}`;
    if (lastEffectKeyRef.current === nodeKey) return;
    lastEffectKeyRef.current = nodeKey;

    if (currentNode.type === 'barrage') {
      triggerBarrage(currentNode.style === 'gold' ? 'gold' : 'mock', currentNode.lines || []);
    } else if (currentNode.type === 'system_alert') {
      playSystemPing();
    }

    if (currentNode.effect) {
      const id = Date.now();
      setEffectTick({ id, kind: currentNode.effect });
      if (currentNode.effect === 'shake' || currentNode.effect === 'impact') {
        playImpactSlap();
      } else if (currentNode.effect === 'heartbeat') {
        playHeartbeat();
      } else if (currentNode.effect === 'flash') {
        playSystemPing();
      }
      const dur = currentNode.effect === 'heartbeat' ? 960 : 540;
      const t = setTimeout(() => {
        setEffectTick((prev) => (prev?.id === id ? null : prev));
      }, dur);
      return () => clearTimeout(t);
    }
  }, [script.id, nodeIdx, currentNode, showOpeningCard, settlement, triggerBarrage]);

  useEffect(() => {
    if (currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx]) {
      setFastForward(false);
    }
  }, [currentNode, nodeIdx, resolvedChoices]);

  const finishPlayback = useCallback(
    async (finalIds: string[], finalOpts: VNChoiceOption[]) => {
      if (submitting) return;
      setAutoPlay(false);
      setFastForward(false);
      setSubmitting(true);
      try {
        const result = await onCompleteRef.current({ chosenIds: finalIds, chosenOptions: finalOpts });
        if (script.mode === 'main') clearVNBookmark(userId, script.id);
        if (result) {
          setShowLog(false);
          setHideUi(false);
          setSettlement(result);
        } else {
          onExitRef.current();
        }
      } catch (e: any) {
        showError(e?.message || '结算失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, script.mode, script.id, userId, showError],
  );

  const stepForward = useCallback(() => {
    if (showOpeningCard) {
      setShowOpeningCard(false);
      return;
    }
    if (settlement || submitting) return;
    if (hideUi) {
      setHideUi(false);
      return;
    }
    if (isTyping) {
      setTypedCount(fullText.length);
      return;
    }

    if (isLast) {
      void finishPlayback(chosenIds, chosenOptions);
      return;
    }

    let nextIdx = nodeIdx + 1;
    while (nextIdx < queue.length && queue[nextIdx]?.type === 'system_choice' && resolvedChoices[nextIdx]) {
      nextIdx += 1;
    }

    if (nextIdx >= queue.length) {
      void finishPlayback(chosenIds, chosenOptions);
    } else {
      setNodeIdx(nextIdx);
    }
  }, [
    showOpeningCard,
    settlement,
    submitting,
    hideUi,
    isTyping,
    fullText.length,
    isLast,
    finishPlayback,
    chosenIds,
    chosenOptions,
    nodeIdx,
    queue,
    resolvedChoices,
  ]);

  useEffect(() => {
    if (!autoPlay || showOpeningCard || showLog || showStatus || hideUi || settlement || submitting) return;
    if (currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx]) return;
    if (isTyping) return;
    if (isLast) {
      setAutoPlay(false);
      return;
    }
    const readDelay = Math.min(2800, Math.max(1450, fullText.length * 36));
    const timer = setTimeout(() => stepForward(), readDelay);
    return () => clearTimeout(timer);
  }, [
    autoPlay,
    showOpeningCard,
    showLog,
    showStatus,
    hideUi,
    settlement,
    submitting,
    currentNode,
    resolvedChoices,
    nodeIdx,
    isTyping,
    isLast,
    fullText.length,
    stepForward,
  ]);

  useEffect(() => {
    if (!fastForward || showOpeningCard || showLog || showStatus || hideUi || settlement || submitting) return;
    if (currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx]) {
      setFastForward(false);
      return;
    }
    if (isLast) {
      setFastForward(false);
      return;
    }
    const timer = setTimeout(() => {
      let nextIdx = nodeIdx + 1;
      while (nextIdx < queue.length && queue[nextIdx]?.type === 'system_choice' && resolvedChoices[nextIdx]) {
        nextIdx += 1;
      }
      if (nextIdx >= queue.length) {
        setFastForward(false);
        return;
      }
      if (queue[nextIdx]?.type === 'system_choice' && !resolvedChoices[nextIdx]) {
        setNodeIdx(nextIdx);
        setFastForward(false);
      } else {
        skipTypewriterRef.current = true;
        setNodeIdx(nextIdx);
      }
    }, 135);
    return () => clearTimeout(timer);
  }, [
    fastForward,
    showOpeningCard,
    showLog,
    showStatus,
    hideUi,
    settlement,
    submitting,
    currentNode,
    resolvedChoices,
    nodeIdx,
    isLast,
    queue,
  ]);

  const isUnansweredChoice = currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx];

  // desktop / PWA keyboard: Space or Enter advances, Esc closes the 天枢 panel or the log
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setShowStatus(false);
        setShowLog(false);
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && !showStatus && !showLog && !isUnansweredChoice && !settlement) {
        e.preventDefault();
        stepForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showStatus, showLog, isUnansweredChoice, settlement, stepForward]);

  // Running available cash across multi-choice episodes (mirrors server/src/routes.ts simulation)
  const availableCash = useMemo(() => {
    let cash = Number(state?.player?.cash ?? 0);
    if (script.mode !== 'main' || script.alreadyCompleted) return cash;
    for (const opt of chosenOptions) {
      const c = Number(opt?.cost?.cash ?? opt?.cashCost ?? 0);
      if (c > 0) cash -= c;
      const r = opt?.reward;
      if (r) {
        if (r.critMultiplier && c > 0) {
          cash += Math.max(Math.round(c * r.critMultiplier), Number(r.cash || 0));
        } else if (r.cash) {
          cash += Number(r.cash);
        }
      }
    }
    return cash;
  }, [state?.player?.cash, script.mode, script.alreadyCompleted, chosenOptions]);

  const isOptionUnaffordable = useCallback(
    (opt: VNChoiceOption) => {
      if (script.alreadyCompleted) return false;
      const cashCost = Number(opt.cost?.cash ?? opt.cashCost ?? 0);
      if (cashCost <= 0) return false;
      return (script.mode === 'stroll' || script.mode === 'main') && cashCost > availableCash;
    },
    [script.mode, script.alreadyCompleted, availableCash],
  );

  const handleBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (prevStepIdx < 0) return;
    playTap();
    setAutoPlay(false);
    setFastForward(false);
    skipTypewriterRef.current = true;
    setNodeIdx(prevStepIdx);
  };

  // ZERO mid-dialogue spoilers: choosing flows naturally into branch dialogue without flashing rewards/tags!
  const handleSelectChoice = (opt: VNChoiceOption) => {
    if (submitting) return;
    if (opt.disabledReason) {
      showError(opt.disabledReason);
      return;
    }
    if (script.mode === 'biz_event') {
      const eCost = Number(opt.costEnergy || 0);
      const sCost = Number(opt.costSysPoints || 0);
      const curE = Number(state?.player?.energy ?? 0);
      const curS = Number(state?.player?.sysPoints ?? 0);
      if (eCost > 0 && curE < eCost) {
        showError(`精力不足（需 ${eCost}，当前 ${curE}）`);
        return;
      }
      if (sCost > 0 && curS < sCost) {
        showError(`天枢积分不足（需 ${sCost}，当前 ${curS}）`);
        return;
      }
    }
    const cashCost = Number(opt.cost?.cash ?? opt.cashCost ?? 0);
    if (isOptionUnaffordable(opt)) {
      showError(`资金不足（需要 ${formatMoney(cashCost)}，当前可用 ${formatMoney(availableCash)}）`);
      return;
    }

    playTap();

    const nextIds = [...chosenIds, opt.id];
    const nextOpts = [...chosenOptions, opt];
    setChosenIds(nextIds);
    setChosenOptions(nextOpts);
    setResolvedChoices((prev) => ({ ...prev, [nodeIdx]: opt }));

    const branchNodes = Array.isArray(opt.branchNodes) ? opt.branchNodes.filter(Boolean) : [];
    if (branchNodes.length > 0) {
      const updatedQueue = [
        ...queue.slice(0, nodeIdx + 1),
        ...branchNodes,
        ...queue.slice(nodeIdx + 1),
      ];
      setQueue(updatedQueue);
      setNodeIdx(nodeIdx + 1);
    } else if (nodeIdx >= queue.length - 1) {
      void finishPlayback(nextIds, nextOpts);
    } else {
      setNodeIdx(nodeIdx + 1);
    }
  };

  const handleTogglePeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tianshuAwakened || !currentNode?.innerThought) return;
    if (!peekOpen) {
      playHeartbeat();
      setRevealedThoughts((prev) => ({ ...prev, [nodeIdx]: true }));
    } else {
      playTap();
    }
    setPeekOpen((v) => !v);
  };

  const progressPct = queue.length > 0 ? Math.min(100, ((nodeIdx + 1) / queue.length) * 100) : 100;
  const isSystemOverlay = !showOpeningCard && (currentNode?.type === 'system_alert' || isUnansweredChoice);
  const heroineIds = useMemo(() => new Set<string>((state?.heroines || []).map((h: any) => h.id)), [state?.heroines]);
  const speakerIsHeroine = !!currentNode?.speaker && heroineIds.has(currentNode.speaker);

  /** Who the 天枢 panel "scans": the current speaker, else the last non-protagonist speaker on stage. */
  const statusFocus = useMemo(() => {
    for (let i = nodeIdx; i >= Math.max(0, nodeIdx - 8); i -= 1) {
      const n = queue[i];
      if (n?.type === 'dialogue' && n.speaker && n.speaker !== 'protagonist' && n.name) {
        return { name: n.name, role: n.role, speaker: n.speaker, hasThought: i === nodeIdx && !!n.innerThought };
      }
    }
    return null;
  }, [queue, nodeIdx]);
  const systemLogs = useMemo(
    () =>
      queue
        .slice(0, nodeIdx + 1)
        .filter((n) => n.type === 'system_alert' && n.text)
        .map((n) => ({ title: n.title || '天枢系统', text: n.text || '' })),
    [queue, nodeIdx],
  );

  const cameraAnimate =
    effectTick?.kind === 'impact'
      ? { x: [0, -10, 9, -6, 5, -2, 0], y: [0, -3, 3, -2, 0], scale: [1, 1.06, 1.03, 1] }
      : effectTick?.kind === 'shake'
        ? { x: [0, -8, 7, -5, 4, -2, 0], y: 0 }
        : { x: 0, y: 0, scale: 1 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070D] select-none">
      <motion.div
        animate={cameraAnimate}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="relative h-full w-full flex flex-col justify-between overflow-hidden"
      >
        {/* 1. Crossfading Scene Backdrop */}
        <div className="absolute inset-0 overflow-hidden bg-[#05070D]">
          <AnimatePresence mode="sync">
            <motion.img
              key={activeBg}
              src={activeBg}
              alt={script.title}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.52, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full object-cover brightness-[0.83]"
            />
          </AnimatePresence>
          <div className="absolute inset-0 vignette-stage pointer-events-none" />
          <div className="absolute inset-0 film-grain pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/52 via-transparent to-[#05070D] pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-[44%] bg-gradient-to-t from-[#05070D] via-[#05070D]/78 to-transparent pointer-events-none" />
        </div>

        {/* 2. Screen Effects */}
        <AnimatePresence>
          {effectTick?.kind === 'flash' && (
            <motion.div
              key={`flash-${effectTick.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.36, ease: 'easeOut' }}
              className="absolute inset-0 z-30 pointer-events-none bg-[radial-gradient(circle_at_50%_42%,rgba(255,248,230,0.9),rgba(207,176,115,0.3)_65%,transparent)]"
            />
          )}
          {effectTick?.kind === 'impact' && (
            <motion.div
              key={`speed-${effectTick.id}`}
              initial={{ opacity: 0, scale: 1.25 }}
              animate={{ opacity: [0, 1, 0], scale: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="absolute inset-0 z-30 pointer-events-none fx-speedlines"
            />
          )}
          {effectTick?.kind === 'impact' && (
            <motion.div
              key={`impact-${effectTick.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.82, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute inset-0 z-30 pointer-events-none"
              style={{
                boxShadow: 'inset 0 0 90px rgba(207,176,115,0.52), inset 0 0 24px rgba(255,244,214,0.34)',
              }}
            />
          )}
          {effectTick?.kind === 'heartbeat' && (
            <motion.div
              key={`heart-${effectTick.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0.14, 0.42, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.92, ease: 'easeInOut' }}
              className="absolute inset-0 z-30 pointer-events-none"
              style={{
                boxShadow: 'inset 0 0 100px rgba(217,119,145,0.48)',
              }}
            />
          )}
        </AnimatePresence>

        {/* 3. Character Stage (Single OR Dual Confrontation) */}
        <div
          onClick={() => {
            if (hideUi) {
              setHideUi(false);
              return;
            }
            if (!isUnansweredChoice && !settlement) {
              playTap();
              stepForward();
            }
          }}
          className={`absolute inset-x-0 top-10 z-10 overflow-hidden transition-all duration-300 ${
            hideUi ? 'bottom-0' : 'bottom-[96px]'
          }`}
        >
          {stageSprites.dual ? (
            <div className="relative w-full h-full">
              <AnimatePresence mode="wait">
                {stageSprites.left && (
                  <motion.div
                    key={`left-${stageSprites.left}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{
                      opacity: stageSprites.activeSide === 'right' ? 0.9 : 1,
                      x: 0,
                      scale:
                        stageSprites.activeSide === 'left'
                          ? 1.035
                          : stageSprites.activeSide === 'right'
                            ? 0.94
                            : 0.98,
                    }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`absolute left-[-7%] bottom-0 w-[64%] h-[88%] flex items-end justify-center origin-bottom pointer-events-none ${
                      stageSprites.activeSide === 'left' ? 'z-20' : 'z-10'
                    }`}
                  >
                    <img
                      src={stageSprites.left}
                      alt=""
                      className={`h-full max-h-full w-full object-contain object-bottom sprite-fade-bottom transition-[filter] duration-300 drop-shadow-[0_14px_30px_rgba(0,0,0,0.82)] ${
                        stageSprites.activeSide === 'right'
                          ? 'brightness-[0.58] saturate-[0.82]'
                          : stageSprites.activeSide === 'none'
                            ? 'brightness-[0.76]'
                            : 'brightness-[1.03]'
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {stageSprites.right && (
                  <motion.div
                    key={`right-${stageSprites.right}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{
                      opacity: stageSprites.activeSide === 'left' ? 0.9 : 1,
                      x: 0,
                      scale:
                        stageSprites.activeSide === 'right'
                          ? 1.035
                          : stageSprites.activeSide === 'left'
                            ? 0.94
                            : 0.98,
                    }}
                    exit={{ opacity: 0, x: 14 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`absolute right-[-7%] bottom-0 w-[64%] h-[88%] flex items-end justify-center origin-bottom pointer-events-none ${
                      stageSprites.activeSide === 'right' ? 'z-20' : 'z-10'
                    }`}
                  >
                    <img
                      src={stageSprites.right}
                      alt=""
                      className={`h-full max-h-full w-full object-contain object-bottom sprite-fade-bottom transition-[filter] duration-300 drop-shadow-[0_14px_30px_rgba(0,0,0,0.82)] ${
                        stageSprites.activeSide === 'left'
                          ? 'brightness-[0.58] saturate-[0.82]'
                          : stageSprites.activeSide === 'none'
                            ? 'brightness-[0.76]'
                            : 'brightness-[1.03]'
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="w-full h-full flex items-end justify-center px-3">
              <AnimatePresence mode="wait">
                {stageSprites.single && (
                  <motion.div
                    key={`single-${stageSprites.single}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="h-full max-h-[94%] max-w-[94%] flex items-end justify-center pointer-events-none"
                  >
                    <img
                      src={stageSprites.single}
                      alt={currentNode?.name || ''}
                      className={`h-full max-h-full w-auto object-contain object-bottom sprite-fade-bottom animate-breathe drop-shadow-[0_18px_36px_rgba(0,0,0,0.82)] transition-[filter] duration-300 ${
                        stageSprites.dimSingle ? 'brightness-[0.78]' : 'brightness-100'
                      }`}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* 4. Mid-Scene Location Banner */}
        <AnimatePresence>
          {activeBanner && !showOpeningCard && !hideUi && !settlement && (
            <motion.div
              key={activeBanner.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32 }}
              className="absolute top-14 inset-x-4 z-30 flex justify-center pointer-events-none"
            >
              <div className="px-4 py-1 bg-[#0A0B0F]/76 backdrop-blur-md border-y border-[#D9C49A]/35 flex items-center gap-2.5 max-w-full">
                <span className="text-[11px] font-medium tracking-[0.16em] text-[#EFE2C6] truncate">
                  {activeBanner.text}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. Top Hairline Progress & Minimal Frameless Utility Bar (above z-[35] system panels!) */}
        <div className="relative z-[38] pointer-events-none">
          {!hideUi && !settlement && (
            <div className="h-[2px] w-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#9C8660] to-[#EADBB8] shadow-[0_0_6px_rgba(234,219,184,0.8)] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <AnimatePresence>
            {!hideUi && !settlement && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between gap-2 px-3.5 pt-2.5"
              >
                <div className="pointer-events-auto flex items-center gap-1 h-8 pl-1 pr-1 rounded-full bg-[#06080E]/78 backdrop-blur-md border border-[#D9C49A]/35">
                  <button
                    onClick={() => {
                      playTap();
                      onExit();
                    }}
                    className="h-7 px-2 text-[12px] font-editorial font-bold text-[#E2D3B0] flex items-center gap-1 active:opacity-75"
                  >
                    <ArrowLeft className="w-4 h-4" /> 返回
                  </button>
                  <button
                    onClick={handleBack}
                    disabled={prevStepIdx < 0}
                    title="上一句"
                    className="h-7 w-7 flex items-center justify-center text-[#E2D3B0] border-l border-white/10 disabled:opacity-25"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                <div className="flex items-center h-8 px-1 rounded-full bg-[#06080E]/70 backdrop-blur-md border border-[#D9C49A]/35 text-[#D8DAE2] divide-x divide-white/10">
                  <button
                    onClick={() => {
                      playTap();
                      setAutoPlay(false);
                      setFastForward(false);
                      setShowLog(true);
                    }}
                    className="text-[11px] px-2 hover:text-white flex items-center gap-1"
                  >
                    <History className="w-3.5 h-3.5" /> 回顾
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setFastForward(false);
                      setAutoPlay((v) => !v);
                    }}
                    className={`text-[11px] px-2 flex items-center gap-1 ${
                      autoPlay ? 'text-[#EADBB8] font-bold' : 'hover:text-white'
                    }`}
                  >
                    {autoPlay ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />} 自动
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setAutoPlay(false);
                      setFastForward((v) => !v);
                    }}
                    title="快进"
                    className={`px-2 py-1 ${fastForward ? 'text-[#EADBB8]' : 'hover:text-white'}`}
                  >
                    <FastForward className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setAutoPlay(false);
                      setFastForward(false);
                      setHideUi(true);
                    }}
                    title="隐藏文字"
                    className="px-2 py-1 hover:text-white"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
                {tianshuAwakened && (
                  <TianshuSummonButton
                    alert={statusFocus?.hasThought && !revealedThoughts[nodeIdx]}
                    onClick={(e) => {
                      e.stopPropagation();
                      playSystemPing();
                      setAutoPlay(false);
                      setFastForward(false);
                      setShowStatus(true);
                    }}
                  />
                )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pure View Restore */}
        <AnimatePresence>
          {hideUi && !settlement && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.72 }}
              exit={{ opacity: 0 }}
              onClick={() => setHideUi(false)}
              className="absolute bottom-5 right-4 z-30 px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/12 rounded-[4px] text-[11px] text-[#EAE7E0] flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-[#D9C49A]" /> 恢复界面
            </motion.button>
          )}
        </AnimatePresence>

        {/* 6a. 天枢 takes the centre of the screen: system alerts and choices */}
        <AnimatePresence>
          {!hideUi && !settlement && !showOpeningCard && currentNode?.type === 'system_alert' && (
            <SystemAlertPanel
              key={`alert-${nodeIdx}`}
              node={currentNode}
              typed={fullText.slice(0, typedCount)}
              isTyping={isTyping}
              onTap={() => {
                playTap();
                stepForward();
              }}
            />
          )}
          {!hideUi && !settlement && !showOpeningCard && isUnansweredChoice && currentNode && (
            !tianshuAwakened || script.mode === 'biz_event' ? (
              <NarrativeChoicePanel
                key={`choice-${nodeIdx}`}
                node={currentNode}
                kicker={script.mode === 'biz_event' ? '经营决策' : '此刻抉择'}
                showBizMeta={script.mode === 'biz_event'}
                disabled={submitting}
                isUnaffordable={isOptionUnaffordable}
                onChoose={handleSelectChoice}
              />
            ) : (
              <SystemChoicePanel
                key={`choice-${nodeIdx}`}
                node={currentNode}
                disabled={submitting}
                isUnaffordable={isOptionUnaffordable}
                onChoose={handleSelectChoice}
              />
            )
          )}
        </AnimatePresence>

        {/* 6b. Cinematic dialogue band (no card, no frame) */}
        <AnimatePresence>
          {!hideUi && !settlement && !isSystemOverlay && (
            <motion.div
              key="dialogue-band"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="relative z-30"
            >
              <div
                onClick={() => {
                  playTap();
                  stepForward();
                }}
                className="vn-dialogue-band pt-14 pb-6 px-5 cursor-pointer"
              >
                <AnimatePresence>
                  {tianshuAwakened && peekOpen && currentNode?.innerThought && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        playTap();
                        setPeekOpen(false);
                      }}
                      className="mb-4 relative pl-3.5 pr-2 py-2 cursor-pointer"
                    >
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-gradient-to-b from-[#FFB3C6] to-[#F0789A]/20" />
                      <div className="text-[10px] tracking-[0.4em] text-[#FFB3C6] font-bold mb-1">
                        {currentNode.name} · 心声
                      </div>
                      <p className="text-[13.5px] italic text-[#FBE3EA] leading-[1.8]">{currentNode.innerThought}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* speaker row: fixed height so the text never jumps between node types */}
                <div className="h-[30px] flex items-end gap-2.5">
                  {currentNode?.type === 'dialogue' && (
                    <>
                      <span
                        className={`font-editorial text-[20px] leading-none font-black tracking-[0.14em] ${
                          speakerIsHeroine ? 'text-[#FFC9D6]' : 'gold-gradient-text'
                        }`}
                        style={speakerIsHeroine ? { textShadow: '0 0 14px rgba(240,120,154,0.45)' } : undefined}
                      >
                        {currentNode.name}
                      </span>
                      {currentNode.role && (
                        <span className="text-[10.5px] leading-none text-[#8E97B3] tracking-[0.12em] pb-[2px] truncate">
                          {currentNode.role}
                        </span>
                      )}
                      <span className="flex-1" />
                      {tianshuAwakened && currentNode.innerThought && (
                        <button
                          onClick={handleTogglePeek}
                          className={`shrink-0 -mb-0.5 flex items-center gap-1 pl-0.5 pr-2 py-[2px] rounded-full text-[11px] font-bold border transition ${
                            peekOpen
                              ? 'bg-[#4A1830] border-[#F0789A] text-[#FFC4D3]'
                              : 'bg-[#1A0C18]/70 border-[#F0789A]/55 text-[#FFB3C6]'
                          }`}
                        >
                          <GameIcon name="heart" size={18} shadow={false} className={peekOpen ? '' : 'animate-pulse'} />
                          {peekOpen ? '收起' : '心声'}
                        </button>
                      )}
                    </>
                  )}
                  {currentNode?.type === 'thought' && (
                    <span className="text-[11px] leading-none tracking-[0.4em] text-[#C9B58A] pb-[3px]">内心独白</span>
                  )}
                </div>
                <div className={`vn-name-rule mt-2 mb-3 ${currentNode?.type === 'dialogue' || currentNode?.type === 'thought' ? '' : 'opacity-0'}`} />

                <p
                  className={`min-h-[86px] ${
                    currentNode?.type === 'thought'
                      ? 'text-[15px] leading-[1.9] italic text-[#E6DBC2]'
                      : currentNode?.type === 'dialogue'
                        ? 'text-[15.5px] leading-[1.88] text-[#FAF6EC]'
                        : 'text-[15px] leading-[1.9] text-[#D2D6E2]'
                  }`}
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                >
                  {fullText.slice(0, typedCount)}
                  {!isTyping && !submitting && (
                    isLast ? (
                      <span className="ml-2 inline-flex items-center text-[12px] not-italic font-editorial font-bold text-[#D9C49A] align-middle">
                        {script.alreadyCompleted ? '结束' : '继续'}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <motion.span
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        className="inline-block ml-1.5 w-[7px] h-[7px] rotate-45 align-middle bg-[#D9C49A] shadow-[0_0_6px_rgba(234,219,184,0.9)]"
                      />
                    )
                  )}
                  {submitting && <span className="ml-2 text-[12px] text-[#D9C49A]">请稍候…</span>}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 天枢宿主面板：唤醒后可随时唤出 */}
      <AnimatePresence>
        {tianshuAwakened && showStatus && !settlement && (
          <TianshuStatusPanel
            state={state}
            chapterLabel={`${script.chapterTitle} · ${script.title}`}
            progress={{ at: nodeIdx + 1, total: queue.length }}
            choicesMade={chosenIds.length}
            focus={statusFocus}
            logs={systemLogs}
            onReadThought={() => {
              setShowStatus(false);
              if (currentNode?.innerThought) {
                playHeartbeat();
                setRevealedThoughts((prev) => ({ ...prev, [nodeIdx]: true }));
                setPeekOpen(true);
              }
            }}
            onClose={() => {
              playTap();
              setShowStatus(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 7. Opening Title Curtain */}
      <AnimatePresence>
        {showOpeningCard && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42 }}
            onClick={() => setShowOpeningCard(false)}
            className="absolute inset-0 z-40 bg-[#050814]/96 backdrop-blur-md flex flex-col items-center justify-center px-8 text-center cursor-pointer"
          >
            <div className="text-[11px] tracking-[0.4em] text-[#D9C49A] font-bold text-stroke-dark">
              {script.sceneLabel || `${MODE_LABELS[script.mode]} · ${script.chapterTitle}`}
            </div>
            <div className="flex items-center gap-2 my-4">
              <span className="w-14 h-px bg-gradient-to-r from-transparent to-[#D9C49A]" />
              <span className="w-2 h-2 rotate-45 bg-gradient-to-br from-[#EADBB8] to-[#8A7650]" />
              <span className="w-14 h-px bg-gradient-to-l from-transparent to-[#D9C49A]" />
            </div>
            <h2
              className={`font-editorial font-black tracking-[0.16em] gold-gradient-text leading-snug text-balance ${
                script.title.length >= 9 ? 'text-[25px]' : 'text-[32px]'
              }`}
            >
              {script.title}
            </h2>
            {script.subtitle && script.subtitle !== script.sceneLabel && (
              <p className="text-[12.5px] text-[#DCE2F0] mt-3 leading-relaxed max-w-[280px] text-stroke-dark">{script.subtitle}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 8. Dialogue Transcript Log Drawer */}
      <AnimatePresence>
        {showLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#05070D]/96 backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
              <div>
                <div className="font-editorial text-[16px] font-black gold-gradient-text tracking-wider">对话记录</div>
                <div className="text-[10px] text-[#8C90A0] mt-0.5">
                  {script.chapterTitle} · {script.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {script.mode === 'main' && nodeIdx > 0 && (
                  <button
                    onClick={() => {
                      playTap();
                      clearVNBookmark(userId, script.id);
                      setQueue(script.nodes || []);
                      setNodeIdx(0);
                      setChosenIds([]);
                      setChosenOptions([]);
                      setResolvedChoices({});
                      setRevealedThoughts({});
                      setShowLog(false);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] text-[#D9C49A] border border-[#D9C49A]/40 bg-[#0B0E17]/80 active:opacity-75"
                  >
                    重读本章
                  </button>
                )}
                <button onClick={() => setShowLog(false)} className="p-1.5 text-[#858999] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
              {queue.slice(0, nodeIdx + 1).map((n, idx) => {
                if (n.type === 'system_choice') {
                  const chosen = resolvedChoices[idx];
                  if (!chosen) return null;
                  return (
                    <div key={`log-choice-${idx}`} className="border-l-2 border-[#D9C49A] pl-3 py-1">
                      <div className="text-[10px] text-[#D9C49A]">你的选择</div>
                      <div className="text-xs text-[#F3EAD5] mt-0.5 leading-relaxed">{chosen.label}</div>
                    </div>
                  );
                }
                if (!n.text) return null;
                if (n.type === 'system_alert') {
                  return (
                    <div key={`log-sys-${idx}`} className="rounded-[4px] px-3 py-2 border border-[#63E6F2]/30 bg-[#041826]/70">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold cyan-glow-text">
                        <GameIcon name="tianshu" size={16} shadow={false} /> {n.title || '天枢系统'}
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-[#CFEFF3] mt-1">{renderSysText(n.text)}</p>
                    </div>
                  );
                }
                return (
                  <div key={`log-${idx}`} className="space-y-1">
                    {n.sceneBanner && (
                      <div className="text-[10px] tracking-[0.16em] text-[#D9C49A]/80 pb-1">— {n.sceneBanner} —</div>
                    )}
                    {n.type === 'dialogue' && n.name && (
                      <div className="text-xs font-semibold text-[#E2D3B0]">
                        {n.name}
                        {n.role && <span className="text-[10px] text-[#8A8EA0] font-normal ml-1.5">{n.role}</span>}
                      </div>
                    )}
                    <p
                      className={`text-[13px] leading-relaxed ${
                        n.type === 'thought' ? 'italic text-[#E5DAC2]' : 'text-[#D4D7E0]'
                      }`}
                    >
                      {n.text}
                    </p>
                    {n.innerThought && revealedThoughts[idx] && (
                      <p className="text-[11.5px] italic text-[#EBA3B7] pl-2.5 border-l border-[#F0789A]/50">
                        「{n.innerThought}」
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 9. Settlement — calm: blurred scene, ivory title, one quiet glass sheet; rays only when a crit happened */}
      <AnimatePresence>
        {settlement && (() => {
          const r = settlement.rewards;
          const hasCrit = Boolean(r?.critCashback && r.critCashback > 0 && !settlement.alreadyCompleted);
          const modeEn =
            settlement.alreadyCompleted
              ? 'REPLAY END'
              : settlement.mode === 'main'
                ? 'CHAPTER CLEAR'
                : settlement.mode === 'date'
                  ? 'DATE · END'
                  : settlement.mode === 'home'
                    ? 'AT HOME'
                    : settlement.mode === 'bond'
                      ? 'BOND · UP'
                      : settlement.mode === 'shura'
                        ? 'SHURA · SETTLED'
                        : settlement.mode === 'biz_event'
                          ? 'BIZ · RESOLVED'
                          : settlement.mode === 'luxury'
                            ? 'LUXURY · NIGHT'
                            : 'STROLL · END';
          const modeZh =
            settlement.alreadyCompleted
              ? '回顾结束'
              : settlement.mode === 'main'
                ? '本幕完成'
                : settlement.mode === 'date'
                  ? '约会结束'
                  : settlement.mode === 'home'
                    ? '居家时光'
                    : settlement.mode === 'bond'
                      ? '羁绊突破'
                      : settlement.mode === 'shura'
                        ? '修罗场化解'
                        : settlement.mode === 'biz_event'
                          ? '危机化解'
                          : settlement.mode === 'luxury'
                            ? '顶奢私宴'
                            : '漫步结束';
          const items: { icon: GameIconName; label: string; value: string; tone: string; ribbon?: string; num?: number }[] = [];
          if (r && !settlement.alreadyCompleted) {
            if (r.critCashback && r.critCashback > 0) {
              items.push({ icon: 'income', label: '暴击返现', value: `+${formatMoney(r.critCashback)}`, num: r.critCashback, tone: 'text-[#F3E3BC]', ribbon: `×${r.critMultiplier || 10}` });
              if (r.cash && r.cash > r.critCashback) items.push({ icon: 'cash', label: '资金', value: '', num: r.cash - r.critCashback, tone: 'text-[var(--ivory-2)]' });
            } else if (r.cash && r.cash > 0) {
              items.push({ icon: 'cash', label: '资金', value: '', num: r.cash, tone: 'text-[var(--ivory-2)]' });
            }
            if (r.affectionGain && r.affectionGain > 0) items.push({ icon: 'heart', label: r.affectionHeroineName || '好感', value: `+${r.affectionGain}`, tone: 'text-[#F2B8C6]' });
            if (r.sysPoints && r.sysPoints > 0) items.push({ icon: 'syspoint', label: '天枢积分', value: `+${r.sysPoints}`, tone: 'text-[#A8E2E8]' });
            if (r.unlockedHeroineName) items.push({ icon: 'nav_contact', label: '新联系人', value: r.unlockedHeroineName, tone: 'text-[#F2B8C6]' });
            if (r.unlockedAssetName) items.push({ icon: 'key', label: '入库', value: r.unlockedAssetName, tone: 'text-[var(--ivory-2)]' });
            if (r.unlockedOutfitName) items.push({ icon: 'crown', label: '解锁装扮', value: r.unlockedOutfitName, tone: 'text-[#F2B8C6]' });
          }
          const primaryNext = settlement.mode === 'main' && settlement.nextEpisodeId && settlement.nextEpisodeUnlocked && onNextEpisode;
          const primaryChat = settlement.mode !== 'main' && settlement.heroineId && onOpenChat;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 z-50 overflow-hidden night-page"
            >
              <img src={script.bg} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-[18px] brightness-[0.38] saturate-[0.7]" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#04050A]/55 via-[#04050A]/70 to-[#04050A]/95" />
              <Atmosphere />
              {hasCrit && (
                <motion.div
                  aria-hidden
                  className="absolute left-1/2 top-[18%] w-[760px] h-[760px] -ml-[380px] -mt-[380px] pointer-events-none opacity-30"
                  style={{
                    background: 'repeating-conic-gradient(from 0deg, rgba(230,214,178,0.2) 0deg 6deg, transparent 6deg 22deg)',
                    maskImage: 'radial-gradient(circle, #000 0%, transparent 62%)',
                    WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 62%)',
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 60, ease: 'linear' }}
                />
              )}
              <Watermark text={modeEn.split(' ')[0]} className="top-[10%] -left-2 text-[86px]" />
              <EdgeLabel text={`HAICHENG · ${modeEn} · TIANSHU`} top="38%" />

              {settlement.mode !== 'main' && settlement.heroinePortrait && (
                <motion.img
                  src={settlement.heroinePortrait}
                  alt=""
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 0.92, x: 0 }}
                  transition={{ delay: 0.15, duration: 0.6 }}
                  className="absolute right-[-14%] bottom-0 h-[76%] max-w-[64%] w-auto object-contain object-bottom sprite-fade-bottom pointer-events-none"
                />
              )}

              <div className="relative h-full overflow-y-auto no-scrollbar flex flex-col justify-center px-6 py-10">
                <div className="w-full space-y-6">
                  {/* title */}
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="label-en">{modeEn}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="w-5 h-px bg-[var(--champagne)]" />
                      <span className="text-[11px] tracking-[0.3em] text-[var(--champagne)]">
                        {modeZh} · {settlement.chapterLabel || MODE_LABELS[settlement.mode]}
                      </span>
                    </div>
                    <h2 className="mt-2 font-editorial text-[34px] font-black tracking-[0.12em] ink-title leading-tight">{settlement.title}</h2>
                  </motion.div>

                  {/* closing line, set like a quotation — no box */}
                  {(settlement.reactionText || settlement.resultText) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.5 }}
                      className={`relative pl-5 ${settlement.mode !== 'main' && settlement.heroinePortrait ? 'max-w-[72%]' : ''}`}
                    >
                      <span className="absolute -left-1 -top-3 font-editorial text-[40px] leading-none text-[var(--champagne-dim)]">“</span>
                      <p className="text-[13.5px] leading-[1.9] text-[#D9D4C9]">{settlement.reactionText || settlement.resultText}</p>
                      {settlement.heroineName && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#8C90A0]">
                          {settlement.heroineAvatar && <PortraitAvatar src={settlement.heroineAvatar} alt="" className="w-5 h-5 !border-0" rounded="full" />}
                          — {settlement.heroineName}
                          {settlement.locationLabel && <span className="text-[#7C8093]">· {settlement.locationLabel}</span>}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* rewards: one glass sheet, items divided by hairlines */}
                  {items.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                      className={`smoke-glass tick-corners px-4 pt-3 pb-3.5 ${settlement.mode !== 'main' && settlement.heroinePortrait ? 'max-w-[70%]' : ''}`}
                    >
                      <div className="label-en mb-2">REWARDS</div>
                      <div className="flex flex-wrap">
                        {items.map((it, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                            className={`relative flex items-center gap-2 py-1.5 pr-4 mr-4 ${i ? '' : ''}`}
                          >
                            <GameIcon name={it.icon} size={30} shadow={false} />
                            <div className="min-w-0">
                              <div className="text-[10.5px] tracking-[0.2em] text-[#8A8EA0]">{it.label}</div>
                              <div className={`font-num text-[15px] leading-tight ${it.tone}`}>
                                {it.num != null ? <AnimatedNumber from={0} value={it.num} prefix="+" duration={900 + i * 150} /> : it.value}
                                {it.ribbon && <span className="ml-1.5 text-[10px] text-[#E79AA8]">{it.ribbon}</span>}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* next teaser */}
                  {settlement.cliffhanger && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65, duration: 0.5 }} className="pl-5 border-l border-white/[0.08]">
                      <div className="label-en mb-1.5">NEXT · 下幕预告</div>
                      <p className="text-[12px] text-[#8C90A0] leading-[1.85]">{settlement.cliffhanger}</p>
                    </motion.div>
                  )}

                  {/* actions */}
                  <div className="pt-1 space-y-2.5">
                    {primaryNext && (
                      <button
                        onClick={() => {
                          playSystemPing();
                          onNextEpisode!(settlement.nextEpisodeId!);
                        }}
                        className="w-full btn-champagne py-3 px-4 text-[14.5px] font-editorial flex items-center justify-center gap-1.5"
                      >
                        <span className="truncate">下一幕{settlement.nextEpisodeTitle ? ` · ${settlement.nextEpisodeTitle}` : ''}</span>
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      </button>
                    )}
                    {settlement.mode === 'main' && settlement.nextEpisodeId && !settlement.nextEpisodeUnlocked && settlement.nextEpisodeLockReason && (
                      <div className="flex items-center justify-center gap-1.5 text-[12px] text-[#C98F9A]">
                        <GameIcon name="lock" size={16} shadow={false} /> 下一幕需{settlement.nextEpisodeLockReason}
                      </div>
                    )}
                    {primaryChat && (
                      <button
                        onClick={() => {
                          playTap();
                          onOpenChat!(settlement.heroineId!, settlement.locationLabel || null);
                        }}
                        className="w-full btn-champagne py-3 px-4 text-[14.5px] font-editorial flex items-center justify-center gap-2"
                      >
                        <GameIcon name="nav_contact" size={22} shadow={false} />
                        <span>发微信给{settlement.mode === 'shura' ? '她' : settlement.heroineName || '她'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        playTap();
                        onExit();
                      }}
                      className={`w-full py-2.5 text-[13.5px] font-editorial ${primaryNext || primaryChat ? 'btn-ghost' : 'btn-champagne'}`}
                    >
                      {settlement.mode === 'main' ? '返回目录' : '返回'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

// ==================== GLOBAL MINI-STORY OVERLAY ====================
export const MiniStoryOverlay: React.FC = () => {
  const {
    state,
    activeMiniStory,
    closeMiniStory,
    applyServerState,
    openHeroineChat,
    notifyTop,
    flyReward,
  } = useGameStore();

  const script = useMemo<VisualNovelScript | null>(() => {
    if (!activeMiniStory) return null;
    const chapterTitle =
      activeMiniStory.mode === 'date'
        ? '赴约'
        : activeMiniStory.mode === 'home'
          ? '居家'
          : activeMiniStory.mode === 'bond'
            ? '红颜羁绊'
            : activeMiniStory.mode === 'shura'
              ? '修罗场'
              : activeMiniStory.mode === 'biz_event'
                ? '经营事件'
                : activeMiniStory.mode === 'luxury'
                  ? '顶奢私宴'
                  : '偶遇';
    return {
      id: `${activeMiniStory.mode}:${activeMiniStory.theaterId || activeMiniStory.bondId || activeMiniStory.interactionId || activeMiniStory.eventId || activeMiniStory.title}:${activeMiniStory.heroineId || 'any'}`,
      mode: activeMiniStory.mode,
      chapterTitle,
      sceneLabel: activeMiniStory.sceneLabel || activeMiniStory.locationLabel || chapterTitle,
      title: activeMiniStory.title,
      subtitle: activeMiniStory.subtitle,
      bg: activeMiniStory.bg,
      nodes: activeMiniStory.nodes,
      alreadyCompleted: activeMiniStory.alreadyCompleted,
    };
  }, [activeMiniStory]);

  if (!activeMiniStory || !script) return null;

  const handleComplete = async ({
    chosenIds,
    chosenOptions,
  }: {
    chosenIds: string[];
    chosenOptions: VNChoiceOption[];
  }): Promise<VNSettlementData | null> => {
    const primaryChoiceId = chosenIds[0];
    const primaryOpt = chosenOptions[0];

    if (activeMiniStory.mode === 'biz_event') {
      const res = await apiRequest('/business/event/resolve', {
        body: {
          businessId: activeMiniStory.businessId,
          eventId: activeMiniStory.eventId,
          choiceId: primaryChoiceId,
        },
      });
      applyServerState(res.state, undefined, { silentToast: true });
      if (Number(res.cashReward || 0) > 0) flyReward(Number(res.cashReward));
      else playCoinBurst();
      const hObj = activeMiniStory.heroineId
        ? (res.state?.heroines || state?.heroines || []).find((h: any) => h.id === activeMiniStory.heroineId)
        : null;
      return {
        mode: 'biz_event',
        chapterLabel: activeMiniStory.sceneLabel || '经营事件',
        title: activeMiniStory.title,
        reactionText: res.resultText || primaryOpt?.resultText || res.message,
        heroineId: hObj?.unlocked ? hObj.id : undefined,
        heroineName: hObj?.name || activeMiniStory.heroineName,
        heroineAvatar: hObj?.avatar || activeMiniStory.heroineAvatar,
        heroinePortrait: hObj?.portrait || activeMiniStory.heroinePortrait,
        locationLabel: activeMiniStory.locationLabel,
        rewards: {
          cash: Number(res.cashReward || 0) > 0 ? Number(res.cashReward) : undefined,
          sysPoints: Number(res.sysPoints || 0) > 0 ? Number(res.sysPoints) : undefined,
          affectionGain: Number(res.affectionGain || 0) > 0 ? Number(res.affectionGain) : undefined,
          affectionHeroineName: hObj?.name || activeMiniStory.heroineName,
        },
      };
    }

    if (activeMiniStory.mode === 'luxury') {
      const res = await apiRequest('/luxury-theater/complete', {
        body: {
          theaterId: activeMiniStory.theaterId || activeMiniStory.eventId,
          heroineId: activeMiniStory.heroineId || undefined,
          choiceId: primaryChoiceId,
        },
      });
      applyServerState(res.state, undefined, { silentToast: true });
      playAffectionChime();
      const hObj = activeMiniStory.heroineId
        ? (res.state?.heroines || state?.heroines || []).find((h: any) => h.id === activeMiniStory.heroineId)
        : null;
      return {
        mode: 'luxury',
        chapterLabel: activeMiniStory.sceneLabel || '顶奢私宴',
        title: activeMiniStory.title,
        reactionText: res.reactionText || primaryOpt?.resultText,
        heroineId: hObj?.unlocked ? hObj.id : undefined,
        heroineName: hObj?.name || activeMiniStory.heroineName,
        heroineAvatar: hObj?.avatar || activeMiniStory.heroineAvatar,
        heroinePortrait: hObj?.portrait || activeMiniStory.heroinePortrait,
        locationLabel: activeMiniStory.locationLabel || activeMiniStory.assetName,
        alreadyCompleted: Boolean(res.playedToday),
        rewards: res.playedToday
          ? undefined
          : {
              affectionGain: Number(res.affectionGain || 0) > 0 ? Number(res.affectionGain) : undefined,
              affectionHeroineName: hObj?.name || activeMiniStory.heroineName,
              sysPoints: Number(res.sysPoints || 0) > 0 ? Number(res.sysPoints) : undefined,
            },
      };
    }

    if (activeMiniStory.mode === 'bond') {
      const res = await apiRequest('/heroines/bond/complete', {
        body: {
          bondId: activeMiniStory.bondId || activeMiniStory.eventId,
          choiceIds: chosenIds,
        },
      });
      applyServerState(res.state, undefined, { silentToast: true });
      playAffectionChime();
      const hObj = res.state?.heroines?.find((h: any) => h.id === activeMiniStory.heroineId);
      if (res.unlockedOutfitName) {
        notifyTop('wechat', '解锁专属装扮', `${hObj?.name || activeMiniStory.heroineName} 已换上「${res.unlockedOutfitName}」`);
      }
      return {
        mode: 'bond',
        chapterLabel: activeMiniStory.sceneLabel || '红颜羁绊',
        title: activeMiniStory.title,
        reactionText: res.reactionText || primaryOpt?.resultText,
        heroineId: activeMiniStory.heroineId,
        heroineName: hObj?.name || activeMiniStory.heroineName,
        heroineAvatar: hObj?.avatar || activeMiniStory.heroineAvatar,
        heroinePortrait: hObj?.portrait || activeMiniStory.heroinePortrait,
        alreadyCompleted: Boolean(res.alreadyCompleted),
        rewards: res.alreadyCompleted
          ? undefined
          : {
              affectionGain: res.affectionGain,
              affectionHeroineName: hObj?.name || activeMiniStory.heroineName,
              sysPoints: res.sysPoints,
              unlockedOutfitName: res.unlockedOutfitName || undefined,
            },
      };
    }

    if (activeMiniStory.mode === 'shura') {
      const res = await apiRequest('/heroines/shura/complete', {
        body: {
          eventId: activeMiniStory.eventId,
          choiceIds: chosenIds,
        },
      });
      applyServerState(res.state, undefined, { silentToast: true });
      playAffectionChime();
      const hObj = res.state?.heroines?.find((h: any) => h.id === activeMiniStory.heroineId);
      return {
        mode: 'shura',
        chapterLabel: activeMiniStory.sceneLabel || '海城修罗场',
        title: activeMiniStory.title,
        reactionText: res.reactionText || primaryOpt?.resultText,
        heroineId: activeMiniStory.heroineId,
        heroineName: activeMiniStory.heroineName || hObj?.name,
        heroineAvatar: activeMiniStory.heroineAvatar || hObj?.avatar,
        heroinePortrait: hObj?.portrait,
        rewards: {
          affectionGain: res.affectionEach,
          affectionHeroineName: '双方好感',
          sysPoints: res.sysPoints,
        },
      };
    }

    if (activeMiniStory.mode === 'date') {
      const res = await apiRequest('/map/date', {
        body: {
          districtId: activeMiniStory.districtId,
          interactionId: activeMiniStory.interactionId,
          heroineId: activeMiniStory.heroineId,
          choiceId: primaryChoiceId,
        },
      });
      applyServerState(res.state, res.critResult, { silentToast: true });
      if (!res.critResult?.triggered) playAffectionChime();
      const hObj = res.state?.heroines?.find((h: any) => h.id === activeMiniStory.heroineId);
      return {
        mode: 'date',
        chapterLabel: activeMiniStory.sceneLabel || '赴约',
        title: activeMiniStory.title,
        reactionText: res.reactionText || primaryOpt?.resultText || res.message,
        heroineId: activeMiniStory.heroineId,
        heroineName: hObj?.name || activeMiniStory.heroineName,
        heroineAvatar: hObj?.avatar || activeMiniStory.heroineAvatar,
        heroinePortrait: hObj?.portrait || activeMiniStory.heroinePortrait,
        locationLabel: activeMiniStory.locationLabel,
        rewards: {
          affectionGain: res.affectionGain,
          bonusAffection: res.bonusAffection,
          sysPoints: Number(res.sysPoints || 25),
          critCashback: res.critResult?.triggered ? res.critResult.cashback : undefined,
          critMultiplier: res.critResult?.triggered ? res.critResult.multiplier : undefined,
        },
      };
    }

    if (activeMiniStory.mode === 'home') {
      const res = await apiRequest('/property/home-interact', {
        body: {
          propertyId: activeMiniStory.propertyId,
          interactionId: activeMiniStory.interactionId,
          heroineId: activeMiniStory.heroineId,
          choiceId: primaryChoiceId,
        },
      });
      applyServerState(res.state, res.critResult, { silentToast: true });
      playAffectionChime();
      const hObj = res.state?.heroines?.find((h: any) => h.id === activeMiniStory.heroineId);
      return {
        mode: 'home',
        chapterLabel: activeMiniStory.sceneLabel || '居家',
        title: activeMiniStory.title,
        reactionText: res.reactionText || primaryOpt?.resultText || res.message,
        heroineId: activeMiniStory.heroineId,
        heroineName: hObj?.name || activeMiniStory.heroineName,
        heroineAvatar: hObj?.avatar || activeMiniStory.heroineAvatar,
        heroinePortrait: hObj?.portrait || activeMiniStory.heroinePortrait,
        locationLabel: activeMiniStory.locationLabel,
        rewards: {
          affectionGain: res.affectionGain,
          bonusAffection: res.bonusAffection,
          sysPoints: 20,
        },
      };
    }

    const choiceIndex =
      typeof primaryOpt?.choiceIndex === 'number'
        ? primaryOpt.choiceIndex
        : Number.isFinite(Number(primaryChoiceId))
          ? Number(primaryChoiceId)
          : 0;
    const res = await apiRequest('/map/stroll/resolve', {
      body: {
        districtId: activeMiniStory.districtId,
        eventId: activeMiniStory.eventId,
        choiceIndex,
      },
    });
    applyServerState(res.state, res.critResult, { silentToast: true });
    if (!res.critResult?.triggered) playCoinBurst();

    const rawChoice = activeMiniStory.strollChoices?.[choiceIndex];
    const targetHeroineId = res.unlockedHeroine || rawChoice?.affectionHeroine || activeMiniStory.heroineId;
    const hObj = targetHeroineId
      ? (res.state?.heroines || state?.heroines || []).find((h: any) => h.id === targetHeroineId)
      : null;

    if (res.unlockedHeroine) {
      notifyTop('wechat', `已添加 ${hObj?.name || '新联系人'}`, '可在「联系」中发起私聊');
    }

    return {
      mode: 'stroll',
      chapterLabel: activeMiniStory.sceneLabel || '海城偶遇',
      title: activeMiniStory.title,
      resultText: res.resultText || primaryOpt?.resultText,
      heroineId: hObj?.unlocked ? hObj.id : undefined,
      heroineName: hObj?.name,
      heroineAvatar: hObj?.avatar,
      locationLabel: activeMiniStory.locationLabel,
      rewards: {
        cash: res.cashGain > 0 ? res.cashGain : undefined,
        sysPoints: res.sysPoints > 0 ? res.sysPoints : undefined,
        critCashback: res.critResult?.triggered ? res.critResult.cashback : undefined,
        critMultiplier: res.critResult?.triggered ? res.critResult.multiplier : undefined,
        affectionGain: hObj?.unlocked ? rawChoice?.affectionGain : undefined,
        unlockedHeroineName: res.unlockedHeroine ? hObj?.name : undefined,
      },
    };
  };

  return (
    <div className="absolute inset-0 z-[38] bg-[#05070D]">
      <VisualNovelTheater
        script={script}
        onExit={closeMiniStory}
        onComplete={handleComplete}
        onOpenChat={(heroineId, loc) => openHeroineChat(heroineId, loc)}
      />
    </div>
  );
};
