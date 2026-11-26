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
import { GameIcon, OrnateCorners } from './GameIcon';

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
    <div className="relative h-full w-full overflow-hidden bg-[#0A0F1F] select-none">
      <motion.div
        animate={cameraAnimate}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="relative h-full w-full flex flex-col justify-between overflow-hidden"
      >
        {/* 1. Crossfading Scene Backdrop */}
        <div className="absolute inset-0 overflow-hidden bg-[#0A0F1F]">
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/52 via-transparent to-[#0A0F1F] pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-[44%] bg-gradient-to-t from-[#0A0F1F] via-[#0A0F1F]/78 to-transparent pointer-events-none" />
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
              <div className="px-4 py-1 bg-[#0A0B0F]/76 backdrop-blur-md border-y border-[#E2BD72]/35 flex items-center gap-2.5 max-w-full">
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
                className="h-full bg-[#E2BD72] transition-all duration-300"
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
                      autoPlay ? 'text-[#F6DDA4] font-semibold' : 'hover:text-white'
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
                    className={`p-1 ${fastForward ? 'text-[#F6DDA4]' : 'hover:text-white'}`}
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
              <Eye className="w-3.5 h-3.5 text-[#E2BD72]" /> 恢复界面
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
                /* Choice plates */
                <div className="px-5 pb-10 pt-10 bg-gradient-to-t from-[#0A0F1F] via-[#0A0F1F]/80 to-transparent space-y-3">
                  {currentNode?.title && (
                    <div className="flex justify-center pb-1">
                      <span className="inline-flex items-center gap-2 px-5 py-1 rounded-full bg-[#070B18]/85 backdrop-blur-md border border-[#63E6F2]/45 text-[12px] tracking-[0.2em] cyan-glow-text font-bold">
                        <GameIcon name="tianshu" size={18} shadow={false} />
                        {currentNode.title}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {(currentNode?.options || []).map((opt, idx) => {
                      const cashCost = opt.cost?.cash ?? opt.cashCost ?? 0;
                      const unaffordable = script.mode === 'stroll' && cashCost > (state?.player?.cash ?? 0);
                      return (
                        <motion.button
                          key={opt.id}
                          initial={{ opacity: 0, x: idx % 2 ? 24 : -24 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.07, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          disabled={submitting}
                          onClick={() => handleSelectChoice(opt)}
                          className={`group relative w-full rounded-[8px] px-6 py-3 text-center transition active:scale-[0.985] ${
                            unaffordable ? 'opacity-55' : ''
                          }`}
                          style={{
                            background:
                              'linear-gradient(180deg, rgba(30,40,78,0.92) 0%, rgba(12,18,38,0.94) 100%)',
                            border: '1px solid rgba(226,189,114,0.6)',
                            boxShadow:
                              'inset 0 0 0 1px rgba(10,15,31,0.9), inset 0 0 0 2px rgba(226,189,114,0.18), 0 8px 20px rgba(0,0,0,0.5)',
                          }}
                        >
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-gradient-to-br from-[#FFE7B0] to-[#A07C3E] group-hover:shadow-[0_0_10px_rgba(255,231,176,0.9)]" />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-gradient-to-br from-[#FFE7B0] to-[#A07C3E] group-hover:shadow-[0_0_10px_rgba(255,231,176,0.9)]" />
                          <div className="text-[14px] font-editorial font-bold text-[#FBF1D8] leading-[1.6]">{opt.label}</div>
                          {unaffordable && <div className="text-[10.5px] text-[#FF8FA6] mt-0.5">资金不足</div>}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Dialogue box */
                <div
                  onClick={() => {
                    playTap();
                    stepForward();
                  }}
                  className="bg-gradient-to-t from-[#05070F]/95 via-[#05070F]/60 to-transparent pt-14 pb-4 px-3 cursor-pointer"
                >
                  <AnimatePresence>
                    {peekOpen && currentNode?.innerThought && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        onClick={(e) => e.stopPropagation()}
                        className="mb-3 mx-2 rounded-[14px] px-4 py-2.5 border border-[#F0789A]/50"
                        style={{
                          background: 'linear-gradient(180deg, rgba(70,24,48,0.88), rgba(30,12,28,0.9))',
                          boxShadow: '0 0 18px rgba(240,120,154,0.25)',
                        }}
                      >
                        <div className="flex items-center gap-1.5 text-[10.5px] tracking-[0.25em] text-[#FFB3C6] font-bold mb-0.5">
                          <GameIcon name="heart" size={14} shadow={false} /> 心声
                        </div>
                        <p className="text-[13px] italic text-[#FBE3EA] leading-relaxed">「{currentNode.innerThought}」</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {currentNode?.type === 'system_alert' ? (
                    <div
                      className="relative rounded-[10px] px-4 pt-6 pb-4 min-h-[118px]"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(14,46,70,0.88) 0%, rgba(6,18,36,0.94) 100%)',
                        border: '1px solid rgba(99,230,242,0.6)',
                        boxShadow: 'inset 0 0 24px rgba(99,230,242,0.18), 0 0 24px rgba(99,230,242,0.22)',
                      }}
                    >
                      <div className="absolute inset-0 rounded-[10px] pointer-events-none opacity-30"
                        style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(99,230,242,0.18) 0 1px, transparent 1px 4px)' }} />
                      <div className="absolute -top-3.5 left-3 flex items-center gap-1.5 pl-1 pr-3 py-0.5 rounded-full bg-[#06121F] border border-[#63E6F2]/70">
                        <GameIcon name="tianshu" size={22} shadow={false} />
                        <span className="text-[11.5px] font-black tracking-[0.25em] cyan-glow-text">{currentNode.title || '天枢系统'}</span>
                      </div>
                      <p className="relative text-[14px] leading-[1.8] text-[#DDFBFF] whitespace-pre-line">
                        {fullText.slice(0, typedCount)}
                      </p>
                    </div>
                  ) : (
                    <div
                      className="relative rounded-[10px] px-4 pt-5 pb-3 min-h-[128px]"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(20,28,58,0.9) 0%, rgba(8,12,26,0.94) 100%)',
                        border: '1px solid rgba(226,189,114,0.5)',
                        boxShadow:
                          'inset 0 0 0 1px rgba(10,15,31,0.9), inset 0 0 0 2px rgba(226,189,114,0.14), 0 12px 30px rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      <OrnateCorners size={18} inset={-4} />

                      {currentNode?.type === 'dialogue' && (
                        <div className="absolute -top-4 left-3 flex items-end gap-2">
                          <span
                            className="font-editorial text-[16px] font-black tracking-[0.12em] text-[#2A1C06] pl-3 pr-5 py-[3px]"
                            style={{
                              background: 'linear-gradient(180deg,#FFF0C8 0%,#E8C27A 55%,#B7843A 100%)',
                              clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                            }}
                          >
                            {currentNode.name}
                          </span>
                          {currentNode.role && (
                            <span className="text-[10.5px] text-[#C3C9DC] mb-0.5 text-stroke-dark">{currentNode.role}</span>
                          )}
                        </div>
                      )}
                      {currentNode?.type === 'thought' && (
                        <div className="absolute -top-3 left-3 px-2.5 py-[1px] rounded-full bg-[#0A0F1F] border border-[#E2BD72]/50 text-[10.5px] tracking-[0.3em] text-[#F6DDA4]">
                          内心
                        </div>
                      )}

                      {currentNode?.type === 'dialogue' && currentNode.innerThought && (
                        <button
                          onClick={handleTogglePeek}
                          className={`absolute -top-3.5 right-3 flex items-center gap-1 pl-1 pr-2.5 py-0.5 rounded-full text-[11px] font-bold border transition ${
                            peekOpen
                              ? 'bg-[#4A1830] border-[#F0789A] text-[#FFC4D3]'
                              : 'bg-[#0A0F1F] border-[#F0789A]/60 text-[#FFB3C6] animate-pulse'
                          }`}
                        >
                          <GameIcon name="heart" size={18} shadow={false} />
                          {peekOpen ? '收起' : '心声'}
                        </button>
                      )}

                      <p
                        className={
                          currentNode?.type === 'thought'
                            ? 'text-[14.5px] leading-[1.86] italic text-[#E9DFC9] tracking-[0.015em]'
                            : currentNode?.type === 'narration' || currentNode?.type === 'barrage'
                              ? 'text-[14.5px] leading-[1.88] text-[#D7DAE3] tracking-[0.02em]'
                              : 'text-[15px] leading-[1.84] text-[#FBF6EA] tracking-[0.015em]'
                        }
                      >
                        {fullText.slice(0, typedCount)}
                        {isTyping && (
                          <span className="inline-block w-[2px] h-[14px] bg-[#E2BD72]/80 ml-0.5 align-middle animate-pulse" />
                        )}
                      </p>

                      <div className="flex items-center justify-between pt-2 text-[10.5px] text-[#6B7392]">
                        <span className="font-num tracking-wider truncate max-w-[60%]">
                          {script.chapterTitle} · {nodeIdx + 1}/{queue.length}
                        </span>
                        <span className="text-[#E2BD72] flex items-center gap-1 shrink-0">
                          {submitting ? (
                            '请稍候…'
                          ) : isTyping ? (
                            ''
                          ) : isLast ? (
                            <>
                              <span className="font-editorial font-bold">{script.alreadyCompleted ? '结束' : '继续'}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <motion.span
                              animate={{ y: [0, 3, 0] }}
                              transition={{ repeat: Infinity, duration: 1.1 }}
                              className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-[#FFE7B0] drop-shadow-[0_0_4px_rgba(255,231,176,0.8)]"
                            />
                          )}
                        </span>
                      </div>
                    </div>
                  )}
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
            className="absolute inset-0 z-40 bg-[#0A0F1F]/94 backdrop-blur-md flex flex-col items-center justify-center px-8 text-center cursor-pointer"
          >
            <div className="text-[11px] tracking-[0.4em] text-[#E2BD72] font-bold">
              {script.sceneLabel || `${MODE_LABELS[script.mode]} · ${script.chapterTitle}`}
            </div>
            <div className="flex items-center gap-2 my-4">
              <span className="w-14 h-px bg-gradient-to-r from-transparent to-[#E2BD72]" />
              <span className="w-2 h-2 rotate-45 bg-gradient-to-br from-[#FFE7B0] to-[#A07C3E]" />
              <span className="w-14 h-px bg-gradient-to-l from-transparent to-[#E2BD72]" />
            </div>
            <h2 className="font-editorial text-[32px] font-black tracking-[0.2em] gold-gradient-text">{script.title}</h2>
            {script.subtitle && (
              <p className="text-xs text-[#A3AAC2] mt-3 leading-relaxed max-w-[270px]">{script.subtitle}</p>
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
            className="absolute inset-0 z-50 bg-[#0A0F1F]/96 backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
              <div>
                <div className="font-editorial text-[16px] font-black gold-gradient-text tracking-wider">对话记录</div>
                <div className="text-[10px] text-[#8B93AD] mt-0.5">
                  {script.chapterTitle} · {script.title}
                </div>
              </div>
              <button onClick={() => setShowLog(false)} className="p-1.5 text-[#929AB4] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
              {queue.slice(0, nodeIdx + 1).map((n, idx) => {
                if (n.type === 'system_choice') {
                  const chosen = resolvedChoices[idx];
                  if (!chosen) return null;
                  return (
                    <div key={`log-choice-${idx}`} className="border-l-2 border-[#E2BD72] pl-3 py-1">
                      <div className="text-[10px] text-[#E2BD72]">你的选择</div>
                      <div className="text-xs text-[#F3EAD5] mt-0.5 leading-relaxed">{chosen.label}</div>
                    </div>
                  );
                }
                if (!n.text) return null;
                return (
                  <div key={`log-${idx}`} className="space-y-1">
                    {n.sceneBanner && (
                      <div className="text-[10px] tracking-[0.16em] text-[#E2BD72]/80 pb-1">— {n.sceneBanner} —</div>
                    )}
                    {n.type === 'dialogue' && n.name && (
                      <div className="text-xs font-semibold text-[#F6DDA4]">
                        {n.name}
                        {n.role && <span className="text-[10px] text-[#7F88A6] font-normal ml-1.5">{n.role}</span>}
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

      {/* 9. Balanced Editorial Epilogue Curtain */}
      <AnimatePresence>
        {settlement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 bg-[#0A0F1F]/92 backdrop-blur-xl flex flex-col justify-center px-6 py-8 overflow-y-auto no-scrollbar"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.3 }}
              className="w-full space-y-6"
            >
              {/* Title Block */}
              <div className="text-center space-y-2">
                <div className="text-[11px] tracking-[0.24em] text-[#E2BD72]">
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
                          <div className="text-[10px] text-[#8B93AD]">{settlement.locationLabel}</div>
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
                      color: 'text-[#F6DDA4]',
                    });
                    if (r.cash && r.cash > r.critCashback) {
                      items.push({
                        label: '资金',
                        value: `+${formatMoney(r.cash - r.critCashback)}`,
                        color: 'text-[#F6DDA4]',
                      });
                    }
                  } else if (r.cash && r.cash > 0) {
                    items.push({ label: '资金', value: `+${formatMoney(r.cash)}`, color: 'text-[#F6DDA4]' });
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
                    items.push({ label: '入库', value: r.unlockedAssetName, color: 'text-[#F6DDA4]' });
                  }
                  if (items.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 py-1">
                      {items.map((it, i) => (
                        <div key={i} className="text-center">
                          <div className="text-[10px] text-[#8B93AD]">{it.label}</div>
                          <div className={`text-sm font-bold tabular-nums mt-0.5 ${it.color}`}>{it.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}

              {settlement.alreadyCompleted && (
                <div className="text-center text-xs text-[#8B93AD]">本幕回顾结束</div>
              )}

              {/* Next Chapter Teaser */}
              {settlement.cliffhanger && (
                <div className="border-l-2 border-[#E2BD72]/70 pl-3.5 py-0.5 space-y-1">
                  <div className="text-[10px] tracking-[0.2em] text-[#E2BD72]">下幕预告</div>
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
    <div className="absolute inset-0 z-[38] bg-[#0A0F1F]">
      <VisualNovelTheater
        script={script}
        onExit={closeMiniStory}
        onComplete={handleComplete}
        onOpenChat={(heroineId, loc) => openHeroineChat(heroineId, loc)}
      />
    </div>
  );
};
