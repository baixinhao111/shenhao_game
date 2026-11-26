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
import { PortraitAvatar } from './PortraitAvatar';

export interface VNSettlementData {
  mode: 'main' | 'date' | 'home' | 'stroll';
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
  mode: 'main' | 'date' | 'home' | 'stroll';
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
};

const MODE_LABELS: Record<VisualNovelScript['mode'], string> = {
  main: '主线',
  date: '赴约',
  home: '居家',
  stroll: '偶遇',
};

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

  useEffect(() => {
    setQueue(script.nodes || []);
    setNodeIdx(0);
    setTypedCount(0);
    setShowOpeningCard(true);
    setAutoPlay(false);
    setFastForward(false);
    setHideUi(false);
    setShowLog(false);
    setChosenIds([]);
    setChosenOptions([]);
    setResolvedChoices({});
    setPeekOpen(false);
    setRevealedThoughts({});
    setActiveBanner(null);
    setEffectTick(null);
    setSubmitting(false);
    setSettlement(null);
    lastEffectKeyRef.current = '';
    lastBannerKeyRef.current = '';
    skipTypewriterRef.current = false;

    const timer = setTimeout(() => setShowOpeningCard(false), 1250);
    return () => clearTimeout(timer);
  }, [script.id]);

  const currentNode = queue[nodeIdx] || null;
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
        const result = await onComplete({ chosenIds: finalIds, chosenOptions: finalOpts });
        if (result) {
          setShowLog(false);
          setHideUi(false);
          setSettlement(result);
        } else {
          onExit();
        }
      } catch (e: any) {
        showError(e?.message || '结算失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, onComplete, onExit, showError],
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
    if (!autoPlay || showOpeningCard || showLog || hideUi || settlement || submitting) return;
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
    if (!fastForward || showOpeningCard || showLog || hideUi || settlement || submitting) return;
    if (currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx]) {
      setFastForward(false);
      return;
    }
    if (isLast) {
      setFastForward(false);
      return;
    }
    const timer = setTimeout(() => {
      const nextIdx = nodeIdx + 1;
      if (queue[nextIdx]?.type === 'system_choice' && !resolvedChoices[nextIdx]) {
        setNodeIdx(nextIdx);
        setFastForward(false);
      } else {
        stepForward();
      }
    }, 145);
    return () => clearTimeout(timer);
  }, [
    fastForward,
    showOpeningCard,
    showLog,
    hideUi,
    settlement,
    submitting,
    currentNode,
    resolvedChoices,
    nodeIdx,
    isLast,
    queue,
    stepForward,
  ]);

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
    const cashCost = opt.cost?.cash ?? opt.cashCost ?? 0;
    const playerCash = state?.player?.cash ?? 0;
    if (script.mode === 'stroll' && cashCost > playerCash) {
      showError(`资金不足（需要 ${formatMoney(cashCost)}）`);
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
    if (!currentNode?.innerThought) return;
    if (!peekOpen) {
      playHeartbeat();
      setRevealedThoughts((prev) => ({ ...prev, [nodeIdx]: true }));
    } else {
      playTap();
    }
    setPeekOpen((v) => !v);
  };

  const progressPct = queue.length > 0 ? Math.min(100, ((nodeIdx + 1) / queue.length) * 100) : 100;
  const isUnansweredChoice = currentNode?.type === 'system_choice' && !resolvedChoices[nodeIdx];

  const cameraAnimate =
    effectTick?.kind === 'impact'
      ? { x: [0, -10, 9, -6, 5, -2, 0], y: [0, -3, 3, -2, 0] }
      : effectTick?.kind === 'shake'
        ? { x: [0, -8, 7, -5, 4, -2, 0], y: 0 }
        : { x: 0, y: 0 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#08090C] select-none">
      <motion.div
        animate={cameraAnimate}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="relative h-full w-full flex flex-col justify-between overflow-hidden"
      >
        {/* 1. Crossfading Scene Backdrop */}
        <div className="absolute inset-0 overflow-hidden bg-[#08090C]">
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/52 via-transparent to-[#08090C] pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-[44%] bg-gradient-to-t from-[#08090C] via-[#08090C]/78 to-transparent pointer-events-none" />
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
              <div className="px-4 py-1 bg-[#0A0B0F]/76 backdrop-blur-md border-y border-[#CFB073]/35 flex items-center gap-2.5 max-w-full">
                <span className="text-[11px] font-medium tracking-[0.16em] text-[#EFE2C6] truncate">
                  {activeBanner.text}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. Top Hairline Progress & Minimal Frameless Utility Bar */}
        <div className="relative z-30">
          {!hideUi && !settlement && (
            <div className="h-[2px] w-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-[#CFB073] transition-all duration-300"
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      playTap();
                      onExit();
                    }}
                    className="h-7 px-2 text-xs text-[#EAE7E0] hover:text-white flex items-center gap-1 text-shadow-stage active:opacity-75"
                  >
                    <ArrowLeft className="w-4 h-4" /> 返回
                  </button>
                  <button
                    onClick={handleBack}
                    disabled={prevStepIdx < 0}
                    title="上一句"
                    className="h-7 w-7 flex items-center justify-center text-[#C8CBD6] disabled:opacity-25 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2.5 text-[#D8DAE2]">
                  <button
                    onClick={() => {
                      playTap();
                      setAutoPlay(false);
                      setFastForward(false);
                      setShowLog(true);
                    }}
                    className="text-[11px] hover:text-white flex items-center gap-1 text-shadow-stage"
                  >
                    <History className="w-3.5 h-3.5" /> 回顾
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setFastForward(false);
                      setAutoPlay((v) => !v);
                    }}
                    className={`text-[11px] flex items-center gap-1 text-shadow-stage ${
                      autoPlay ? 'text-[#EBD4A2] font-semibold' : 'hover:text-white'
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
                    className={`p-1 ${fastForward ? 'text-[#EBD4A2]' : 'hover:text-white'}`}
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
                    className="p-1 hover:text-white"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
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
              <Eye className="w-3.5 h-3.5 text-[#CFB073]" /> 恢复界面
            </motion.button>
          )}
        </AnimatePresence>

        {/* 6. Bottom Interactive Region: SPOILER-FREE Choices OR Clean Cinematic Dialogue Scrim */}
        <AnimatePresence mode="wait">
          {!hideUi && !settlement && (
            <motion.div
              key={isUnansweredChoice ? `choice-${nodeIdx}` : 'dialogue-box'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="relative z-30"
            >
              {isUnansweredChoice && !showOpeningCard ? (
                /* Clean Architectural Choice Plates — PURE DIALOGUE ONLY, ZERO EFFECT SPOILERS! */
                <div className="px-5 pb-9 pt-8 bg-gradient-to-t from-[#08090C] via-[#08090C]/86 to-transparent space-y-2.5">
                  {currentNode?.title && (
                    <div className="flex justify-center pb-1">
                      <span className="inline-block px-4 py-1 bg-[#090A0E]/82 backdrop-blur-md border-y border-[#CFB073]/35 text-[11.5px] tracking-[0.16em] text-[#EFE0BC]">
                        {currentNode.title}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {(currentNode?.options || []).map((opt, idx) => {
                      const cashCost = opt.cost?.cash ?? opt.cashCost ?? 0;
                      const unaffordable = script.mode === 'stroll' && cashCost > (state?.player?.cash ?? 0);
                      return (
                        <motion.button
                          key={opt.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.2 }}
                          disabled={submitting}
                          onClick={() => handleSelectChoice(opt)}
                          className={`w-full text-left backdrop-blur-xl border px-4 py-3.5 transition active:scale-[0.985] ${
                            unaffordable
                              ? 'bg-[#121319]/75 border-white/10 opacity-55'
                              : 'bg-[#0E1016]/88 hover:bg-[#161822]/95 border-white/14 hover:border-[#CFB073]/55 border-l-2 border-l-[#CFB073]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-[13.5px] font-normal text-[#F5F2EA] leading-[1.68]">
                              {opt.label}
                            </div>
                            <ChevronRight className="w-4 h-4 text-[#CFB073]/70 shrink-0 mt-1" />
                          </div>
                          {unaffordable && (
                            <div className="text-[10.5px] text-[#E6829A] mt-1">资金不足</div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Clean Edge-to-Edge Dialogue Scrim */
                <div
                  onClick={() => {
                    playTap();
                    stepForward();
                  }}
                  className="bg-gradient-to-t from-[#08090C] via-[#08090C]/95 to-transparent pt-12 pb-5 px-5 cursor-pointer"
                >
                  {/* Restrained Heroine Inner Thought Whisper */}
                  <AnimatePresence>
                    {peekOpen && currentNode?.innerThought && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                        className="mb-3 bg-[#151116]/90 backdrop-blur-xl border-l-2 border-l-[#D97791] border-y border-r border-white/[0.08] px-3.5 py-2"
                      >
                        <p className="text-[12.5px] italic text-[#F1D4DD] leading-relaxed">
                          「{currentNode.innerThought}」
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {currentNode?.type === 'system_alert' ? (
                    <div className="bg-[#101012]/90 border-l-2 border-l-[#CFB073] border-y border-r border-white/[0.1] px-4 py-3.5 min-h-[104px] flex flex-col justify-between">
                      <div>
                        <div className="text-[11px] font-semibold tracking-[0.18em] text-[#CFB073] mb-1.5">
                          {currentNode.title || '天枢'}
                        </div>
                        <p className="text-[13.5px] leading-[1.8] text-[#EFE2C6] whitespace-pre-line">
                          {fullText.slice(0, typedCount)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[114px] flex flex-col justify-between">
                      <div>
                        {currentNode?.type === 'dialogue' && (
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-baseline gap-2">
                                <span className="font-editorial text-[17px] font-bold tracking-wider text-[#F6F3EB]">
                                  {currentNode.name}
                                </span>
                                {currentNode.role && (
                                  <span className="text-[11px] text-[#8E92A0]">{currentNode.role}</span>
                                )}
                              </div>
                              <div className="w-7 h-[1.5px] bg-[#CFB073] mt-1.5" />
                            </div>

                            {currentNode.innerThought && (
                              <button
                                onClick={handleTogglePeek}
                                className={`shrink-0 text-[11px] flex items-center gap-1 pb-0.5 border-b transition ${
                                  peekOpen
                                    ? 'text-[#F1A3B9] border-[#D97791]/70'
                                    : 'text-[#D8B979] border-[#CFB073]/40 hover:text-[#F4DFA8]'
                                }`}
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>{peekOpen ? '收起' : '心声'}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <p
                          className={
                            currentNode?.type === 'thought'
                              ? 'text-[14.5px] leading-[1.86] italic text-[#E9DFC9] border-l-2 border-[#CFB073]/55 pl-3.5 tracking-[0.015em]'
                              : currentNode?.type === 'narration' || currentNode?.type === 'barrage'
                                ? 'text-[14.5px] leading-[1.88] text-[#D7DAE3] tracking-[0.02em]'
                                : 'text-[15px] leading-[1.84] text-[#F6F3EB] tracking-[0.015em]'
                          }
                        >
                          {fullText.slice(0, typedCount)}
                          {isTyping && (
                            <span className="inline-block w-[2px] h-[14px] bg-[#CFB073]/80 ml-0.5 align-middle animate-pulse" />
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 text-[11px] text-[#7D818E]">
                    <span className="tabular-nums truncate max-w-[60%]">
                      {script.chapterTitle} · {nodeIdx + 1}/{queue.length}
                    </span>
                    <span className="text-[#CFB073] flex items-center gap-1 shrink-0">
                      {submitting ? (
                        '请稍候…'
                      ) : isTyping ? (
                        ''
                      ) : isLast ? (
                        <>
                          <span>{script.alreadyCompleted ? '结束' : '继续'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CFB073] animate-pulse" />
                      )}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 7. Opening Title Curtain */}
      <AnimatePresence>
        {showOpeningCard && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42 }}
            onClick={() => setShowOpeningCard(false)}
            className="absolute inset-0 z-40 bg-[#08090C]/94 backdrop-blur-md flex flex-col items-center justify-center px-8 text-center cursor-pointer"
          >
            <div className="text-[11px] tracking-[0.26em] text-[#CFB073]">
              {script.sceneLabel || `${MODE_LABELS[script.mode]} · ${script.chapterTitle}`}
            </div>
            <div className="w-10 hairline-gold my-3.5" />
            <h2 className="font-editorial text-2xl font-bold tracking-[0.16em] text-[#F6F3EB]">{script.title}</h2>
            {script.subtitle && (
              <p className="text-xs text-[#9EA2AE] mt-3 leading-relaxed max-w-[270px]">{script.subtitle}</p>
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
            className="absolute inset-0 z-50 bg-[#08090C]/96 backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
              <div>
                <div className="font-editorial text-sm font-bold text-[#F5F2EA] tracking-wider">对话记录</div>
                <div className="text-[10px] text-[#848896] mt-0.5">
                  {script.chapterTitle} · {script.title}
                </div>
              </div>
              <button onClick={() => setShowLog(false)} className="p-1.5 text-[#8E92A0] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
              {queue.slice(0, nodeIdx + 1).map((n, idx) => {
                if (n.type === 'system_choice') {
                  const chosen = resolvedChoices[idx];
                  if (!chosen) return null;
                  return (
                    <div key={`log-choice-${idx}`} className="border-l-2 border-[#CFB073] pl-3 py-1">
                      <div className="text-[10px] text-[#CFB073]">你的选择</div>
                      <div className="text-xs text-[#F3EAD5] mt-0.5 leading-relaxed">{chosen.label}</div>
                    </div>
                  );
                }
                if (!n.text) return null;
                return (
                  <div key={`log-${idx}`} className="space-y-1">
                    {n.sceneBanner && (
                      <div className="text-[10px] tracking-[0.16em] text-[#CFB073]/80 pb-1">— {n.sceneBanner} —</div>
                    )}
                    {n.type === 'dialogue' && n.name && (
                      <div className="text-xs font-semibold text-[#EBD4A2]">
                        {n.name}
                        {n.role && <span className="text-[10px] text-[#7D818E] font-normal ml-1.5">{n.role}</span>}
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
                      <p className="text-[11.5px] italic text-[#EBA3B7] pl-2.5 border-l border-[#D97791]/50">
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

      {/* 9. Balanced Editorial Epilogue Curtain */}
      <AnimatePresence>
        {settlement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 bg-[#08090C]/92 backdrop-blur-xl flex flex-col justify-center px-6 py-8 overflow-y-auto no-scrollbar"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.3 }}
              className="w-full space-y-6"
            >
              {/* Title Block */}
              <div className="text-center space-y-2">
                <div className="text-[11px] tracking-[0.24em] text-[#CFB073]">
                  {settlement.chapterLabel || MODE_LABELS[settlement.mode]}
                </div>
                <h2 className="font-editorial text-[26px] font-bold tracking-[0.12em] text-[#F6F3EB]">
                  {settlement.title}
                </h2>
                <div className="w-12 hairline-gold mx-auto pt-1" />
              </div>

              {/* Natural Closing Note */}
              {(settlement.reactionText || settlement.resultText) && (
                <div className="border-y border-white/[0.09] py-4 space-y-2.5">
                  {settlement.heroineName && (
                    <div className="flex items-center gap-2.5">
                      {settlement.heroineAvatar && (
                        <PortraitAvatar
                          src={settlement.heroineAvatar}
                          alt={settlement.heroineName}
                          className="w-8 h-8"
                          rounded="sm"
                        />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-[#F5F2EA]">{settlement.heroineName}</div>
                        {settlement.locationLabel && (
                          <div className="text-[10px] text-[#848896]">{settlement.locationLabel}</div>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-[13px] leading-[1.82] text-[#E4E1DA]">
                    {settlement.reactionText || settlement.resultText}
                  </p>
                </div>
              )}

              {/* Compact Hairline Rewards Strip */}
              {settlement.rewards && !settlement.alreadyCompleted && (
                (() => {
                  const r = settlement.rewards;
                  const items: { label: string; value: string; color: string }[] = [];
                  if (r.critCashback && r.critCashback > 0) {
                    items.push({
                      label: `返现 ×${r.critMultiplier || 10}`,
                      value: `+${formatMoney(r.critCashback)}`,
                      color: 'text-[#EBD4A2]',
                    });
                    if (r.cash && r.cash > r.critCashback) {
                      items.push({
                        label: '资金',
                        value: `+${formatMoney(r.cash - r.critCashback)}`,
                        color: 'text-[#EBD4A2]',
                      });
                    }
                  } else if (r.cash && r.cash > 0) {
                    items.push({ label: '资金', value: `+${formatMoney(r.cash)}`, color: 'text-[#EBD4A2]' });
                  }
                  if (r.affectionGain && r.affectionGain > 0) {
                    items.push({
                      label: r.affectionHeroineName ? `${r.affectionHeroineName}好感` : '好感',
                      value: `+${r.affectionGain}`,
                      color: 'text-[#EEA0B8]',
                    });
                  }
                  if (r.sysPoints && r.sysPoints > 0) {
                    items.push({ label: '积分', value: `+${r.sysPoints}`, color: 'text-emerald-300' });
                  }
                  if (r.unlockedHeroineName) {
                    items.push({ label: '新联系人', value: r.unlockedHeroineName, color: 'text-[#EEA0B8]' });
                  }
                  if (r.unlockedAssetName) {
                    items.push({ label: '入库', value: r.unlockedAssetName, color: 'text-[#EBD4A2]' });
                  }
                  if (items.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 py-1">
                      {items.map((it, i) => (
                        <div key={i} className="text-center">
                          <div className="text-[10px] text-[#848896]">{it.label}</div>
                          <div className={`text-sm font-bold tabular-nums mt-0.5 ${it.color}`}>{it.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}

              {settlement.alreadyCompleted && (
                <div className="text-center text-xs text-[#848896]">本幕回顾结束</div>
              )}

              {/* Next Chapter Teaser */}
              {settlement.cliffhanger && (
                <div className="border-l-2 border-[#CFB073]/70 pl-3.5 py-0.5 space-y-1">
                  <div className="text-[10px] tracking-[0.2em] text-[#CFB073]">下幕预告</div>
                  <p className="text-xs text-[#C6C9D4] leading-[1.8]">{settlement.cliffhanger}</p>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 space-y-2.5">
                {settlement.mode === 'main' &&
                  settlement.nextEpisodeId &&
                  settlement.nextEpisodeUnlocked &&
                  onNextEpisode && (
                    <button
                      onClick={() => {
                        playSystemPing();
                        onNextEpisode(settlement.nextEpisodeId!);
                      }}
                      className="w-full btn-brass clip-chamfer-sm py-3 px-4 text-sm flex items-center justify-center gap-1.5"
                    >
                      <span>
                        下一幕{settlement.nextEpisodeTitle ? ` · ${settlement.nextEpisodeTitle}` : ''}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                {settlement.mode === 'main' &&
                  settlement.nextEpisodeId &&
                  !settlement.nextEpisodeUnlocked &&
                  settlement.nextEpisodeLockReason && (
                    <div className="text-center text-[11px] text-[#E6829A]">
                      下一幕需{settlement.nextEpisodeLockReason}
                    </div>
                  )}

                {settlement.mode !== 'main' && settlement.heroineId && onOpenChat && (
                  <button
                    onClick={() => {
                      playTap();
                      onOpenChat(settlement.heroineId!, settlement.locationLabel || null);
                    }}
                    className="w-full btn-brass clip-chamfer-sm py-3 px-4 text-sm flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>发微信给{settlement.heroineName || '她'}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    playTap();
                    onExit();
                  }}
                  className={`w-full py-2.5 rounded-[4px] text-xs font-medium transition active:scale-[0.99] ${
                    (settlement.mode === 'main' && settlement.nextEpisodeUnlocked) ||
                    (settlement.mode !== 'main' && settlement.heroineId)
                      ? 'border border-white/12 text-[#C8CBD6] hover:bg-white/[0.04]'
                      : 'btn-brass text-sm py-3'
                  }`}
                >
                  {settlement.mode === 'main' ? '返回目录' : '返回'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
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
  } = useGameStore();

  const script = useMemo<VisualNovelScript | null>(() => {
    if (!activeMiniStory) return null;
    const chapterTitle =
      activeMiniStory.mode === 'date'
        ? '赴约'
        : activeMiniStory.mode === 'home'
          ? '居家'
          : '偶遇';
    return {
      id: `${activeMiniStory.mode}:${activeMiniStory.interactionId || activeMiniStory.eventId || activeMiniStory.title}:${activeMiniStory.heroineId || 'any'}`,
      mode: activeMiniStory.mode,
      chapterTitle,
      sceneLabel: activeMiniStory.sceneLabel || activeMiniStory.locationLabel || chapterTitle,
      title: activeMiniStory.title,
      subtitle: activeMiniStory.subtitle,
      bg: activeMiniStory.bg,
      nodes: activeMiniStory.nodes,
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
          sysPoints: 25,
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
    <div className="absolute inset-0 z-[38] bg-[#08090C]">
      <VisualNovelTheater
        script={script}
        onExit={closeMiniStory}
        onComplete={handleComplete}
        onOpenChat={(heroineId, loc) => openHeroineChat(heroineId, loc)}
      />
    </div>
  );
};
