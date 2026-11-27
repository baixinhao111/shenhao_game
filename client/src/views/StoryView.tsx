import React, { useMemo, useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { StoryRoute } from './story/StoryRoute';
import { Atmosphere, EdgeLabel } from '../components/Atmosphere';
import { GameIcon, OrnateCorners } from '../components/GameIcon';
import {
  VisualNovelTheater,
  type VisualNovelScript,
  type VNSettlementData,
} from '../components/VisualNovelTheater';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playSystemPing, playTap } from '../lib/sound';
import { useGameStore, type VNChoiceOption } from '../store/useGameStore';

function shortVolumeLabel(vol: any): string {
  const title: string = vol?.title || '';
  if (title.includes('序章')) return '序章';
  return title.split('·')[0]?.trim() || title;
}

export const StoryView: React.FC = () => {
  const {
    state,
    activeStoryEpisodeId,
    setActiveStoryEpisodeId,
    applyServerState,
    notifyTop,
    showError,
    setActiveTab,
    openAssetsTab,
  } = useGameStore();

  const [selectedVolId, setSelectedVolId] = useState<string>('all');

  const volumes = state?.stories?.volumes || [];
  const allEpisodes = useMemo(
    () => volumes.flatMap((v: any) => (v.episodes || []).map((ep: any) => ({ ...ep, volumeId: v.volumeId }))),
    [volumes],
  );
  const completedSet = useMemo(
    () => new Set<string>(state?.stories?.completedEpisodes || []),
    [state?.stories?.completedEpisodes],
  );

  const activeEpisode = useMemo(
    () => allEpisodes.find((e: any) => e.episodeId === activeStoryEpisodeId) || null,
    [allEpisodes, activeStoryEpisodeId],
  );

  const featuredEpisode = useMemo(() => {
    const nextUnfinished = allEpisodes.find((ep: any) => !completedSet.has(ep.episodeId));
    return nextUnfinished || allEpisodes[allEpisodes.length - 1] || null;
  }, [allEpisodes, completedSet]);

  if (!state) return null;

  // ==================== ACTIVE VN THEATER ====================
  if (activeEpisode) {
    const isAlreadyDone = completedSet.has(activeEpisode.episodeId);
    const epIdx = allEpisodes.findIndex((e: any) => e.episodeId === activeEpisode.episodeId);
    const nextEp = epIdx >= 0 && epIdx < allEpisodes.length - 1 ? allEpisodes[epIdx + 1] : null;

    const script: VisualNovelScript = {
      id: activeEpisode.episodeId,
      mode: 'main',
      chapterTitle: activeEpisode.chapterTitle,
      sceneLabel: activeEpisode.sceneLabel,
      title: activeEpisode.title,
      subtitle: activeEpisode.summary,
      bg: activeEpisode.bg,
      nodes: activeEpisode.nodes || [],
      cliffhanger: activeEpisode.cliffhanger,
      alreadyCompleted: isAlreadyDone,
    };

    const handleCompleteEpisode = async ({
      chosenIds,
      chosenOptions,
    }: {
      chosenIds: string[];
      chosenOptions: VNChoiceOption[];
    }): Promise<VNSettlementData | null> => {
      if (isAlreadyDone) {
        const nextPrereqMet = !nextEp?.requireEpisode || completedSet.has(nextEp.requireEpisode);
        const nextNwMet = !nextEp?.requireNetWorth || state.player.netWorth >= nextEp.requireNetWorth;
        return {
          mode: 'main',
          chapterLabel: activeEpisode.chapterTitle,
          title: activeEpisode.title,
          cliffhanger: activeEpisode.cliffhanger,
          alreadyCompleted: true,
          nextEpisodeId: nextEp?.episodeId || null,
          nextEpisodeLabel: nextEp?.chapterTitle || null,
          nextEpisodeTitle: nextEp?.title || null,
          nextEpisodeUnlocked: Boolean(nextEp && nextPrereqMet && nextNwMet),
          nextEpisodeLockReason: nextEp && !nextNwMet ? `身价达 ${formatMoney(nextEp.requireNetWorth)}` : null,
        };
      }

      const res = await apiRequest('/story/complete', {
        body: {
          episodeId: activeEpisode.episodeId,
          choiceId: chosenIds[0] || '',
          choiceIds: chosenIds,
        },
      });
      applyServerState(res.state, res.critResult, { silentToast: true });
      if (!res.critResult?.triggered) playSystemPing();

      const freshState = res.state || state;
      const freshCompleted = new Set<string>(freshState?.stories?.completedEpisodes || []);
      const freshNetWorth = freshState?.player?.netWorth ?? state.player.netWorth;

      const rs = res.rewardsSummary;
      let totalCash = Number(rs?.cashGain || 0);
      let totalSysPts = Number(rs?.sysPoints || 0);
      let totalAff = 0;
      let affectionHeroineName: string | undefined;

      if (Array.isArray(rs?.affectionGains) && rs.affectionGains.length > 0) {
        totalAff = rs.affectionGains.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0);
        affectionHeroineName = rs.affectionGains.map((a: any) => a.name).join(' / ');
      }

      let unlockedHeroineId: string | undefined = res.unlockedHeroines?.[0];
      let unlockedAssetName: string | undefined =
        res.unlockedAssets?.map((a: any) => a.name).filter(Boolean).join('、') || undefined;

      if (!rs) {
        for (const opt of chosenOptions) {
          const r = opt?.reward;
          if (!r) continue;
          if (r.cash && !r.critMultiplier) totalCash += r.cash;
          if (r.sysPoints) totalSysPts += r.sysPoints;
          if (r.affectionGain) totalAff += r.affectionGain;
          if (r.unlockHeroine && !unlockedHeroineId) unlockedHeroineId = r.unlockHeroine;
          if ((r.unlockAsset || r.equipCar) && !unlockedAssetName) {
            const assetObj = (freshState?.assets || []).find(
              (a: any) => a.id === (r.unlockAsset || r.equipCar),
            );
            unlockedAssetName = assetObj?.name;
          }
        }
      }

      const unlockedHeroineObj = unlockedHeroineId
        ? (freshState?.heroines || []).find((h: any) => h.id === unlockedHeroineId)
        : null;

      if (unlockedHeroineObj) {
        notifyTop('wechat', `已添加 ${unlockedHeroineObj.name}`, '可在「联系」中随时发消息');
      }

      const nextPrereqMet = !nextEp?.requireEpisode || freshCompleted.has(nextEp.requireEpisode);
      const nextNwMet = !nextEp?.requireNetWorth || freshNetWorth >= nextEp.requireNetWorth;

      return {
        mode: 'main',
        chapterLabel: activeEpisode.chapterTitle,
        title: activeEpisode.title,
        reactionText: res.reactionText || res.resultText || chosenOptions[chosenOptions.length - 1]?.resultText,
        cliffhanger: res.cliffhanger || activeEpisode.cliffhanger,
        heroineId: unlockedHeroineObj?.id,
        heroineName: unlockedHeroineObj?.name,
        heroineAvatar: unlockedHeroineObj?.avatar,
        rewards: {
          cash: totalCash > 0 ? totalCash : undefined,
          critCashback: res.critResult?.triggered ? res.critResult.cashback : undefined,
          critMultiplier: res.critResult?.triggered ? res.critResult.multiplier : undefined,
          sysPoints: totalSysPts > 0 ? totalSysPts : undefined,
          affectionGain: totalAff > 0 ? totalAff : undefined,
          affectionHeroineName,
          unlockedHeroineName: unlockedHeroineObj?.name,
          unlockedAssetName,
        },
        nextEpisodeId: nextEp?.episodeId || null,
        nextEpisodeLabel: nextEp?.chapterTitle || null,
        nextEpisodeTitle: nextEp?.title || null,
        nextEpisodeUnlocked: Boolean(nextEp && nextPrereqMet && nextNwMet),
        nextEpisodeLockReason: nextEp && !nextNwMet ? `身价达 ${formatMoney(nextEp.requireNetWorth)}` : null,
      };
    };

    return (
      <VisualNovelTheater
        script={script}
        onExit={() => setActiveStoryEpisodeId(null)}
        onComplete={handleCompleteEpisode}
        onNextEpisode={(nextId) => setActiveStoryEpisodeId(nextId)}
      />
    );
  }

  // ==================== EDITORIAL MAGAZINE CHAPTER DIRECTORY ====================
  const totalCount = allEpisodes.length;
  const doneCount = completedSet.size;
  const visibleVolumes =
    selectedVolId === 'all' ? volumes : volumes.filter((v: any) => v.volumeId === selectedVolId);

  const openEpisode = (ep: any) => {
    const prereqMet = !ep.requireEpisode || completedSet.has(ep.requireEpisode);
    const nwMet = !ep.requireNetWorth || state.player.netWorth >= ep.requireNetWorth;
    if (!prereqMet) {
      showError('请先完成上一幕');
      return;
    }
    if (!nwMet) {
      showError(`需身价达到 ${formatMoney(ep.requireNetWorth)}`);
      return;
    }
    playTap();
    setActiveStoryEpisodeId(ep.episodeId);
  };

  const featuredDone = featuredEpisode ? completedSet.has(featuredEpisode.episodeId) : false;
  const featuredPrereqMet = !featuredEpisode?.requireEpisode || completedSet.has(featuredEpisode.requireEpisode);
  const featuredNwMet =
    !featuredEpisode?.requireNetWorth || state.player.netWorth >= featuredEpisode.requireNetWorth;
  const featuredLocked = Boolean(featuredEpisode && (!featuredPrereqMet || !featuredNwMet));

  const featuredVol = volumes.find((v: any) => (v.episodes || []).some((e: any) => e.episodeId === featuredEpisode?.episodeId));
  const splitVolTitle = (vol: any) => {
    const [a, b] = String(vol?.title || '').split('·').map((x: string) => x.trim());
    return { kicker: b ? a : '', name: b || a };
  };

  return (
    <div className="relative h-full overflow-y-auto no-scrollbar night-page">
      <Atmosphere />
      <EdgeLabel text="HAICHENG · MAIN STORY · TIANSHU" top="14%" />
      {/* Featured poster */}
      {featuredEpisode && (
        <div className="px-3">
          <div
            onClick={() => openEpisode(featuredEpisode)}
            className="relative h-[250px] -mx-3 cursor-pointer group"
          >
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={featuredVol?.cover || featuredEpisode.bg}
                alt={featuredEpisode.title}
                className={`w-full h-full object-cover transition duration-700 group-hover:scale-[1.03] ${
                  featuredLocked ? 'grayscale brightness-50' : ''
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#04050A]/95 via-[#04050A]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#04050A] via-[#04050A]/10 to-[#04050A]/50" />
            </div>

            {featuredEpisode.posterLead && (
              <img
                src={featuredEpisode.posterLead}
                alt=""
                className={`absolute right-0 bottom-0 h-[112%] w-auto object-contain object-bottom sprite-fade-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)] pointer-events-none ${
                  featuredLocked ? 'grayscale opacity-50' : ''
                }`}
              />
            )}

            <div className="absolute inset-0 px-5 pt-5 pb-4 flex flex-col justify-between max-w-[68%]">
              <div>
                <div className="label-en">{featuredDone ? 'REPLAY' : 'NOW PLAYING'} · {featuredEpisode.episodeId.replace('ep_', 'EP.')}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="w-4 h-px bg-[var(--champagne)]" />
                  <span className="text-[11px] text-[var(--champagne)] tracking-[0.25em]">{featuredEpisode.chapterTitle}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="font-editorial text-[28px] font-black leading-tight ink-title tracking-[0.08em]">
                  {featuredEpisode.title}
                </h2>
                <p className="text-[11.5px] text-[#A9AEBE] line-clamp-2 leading-relaxed" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
                  {featuredEpisode.summary}
                </p>
                <div className="pt-1 flex items-center gap-3">
                  {featuredLocked ? (
                    <span className="btn-ghost inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs">
                      <Lock className="w-3 h-3" /> 待解锁
                    </span>
                  ) : (
                    <span className="btn-champagne inline-flex items-center gap-1.5 px-5 py-1.5 text-[13px] font-editorial">
                      <Play className="w-3.5 h-3.5 fill-current" /> {featuredDone ? '重温' : '继续'}
                    </span>
                  )}
                  {featuredLocked && !featuredNwMet ? (
                    <span className="text-[11px] text-[#D99AA6]">
                      身价需达 {formatMoney(featuredEpisode.requireNetWorth)}
                    </span>
                  ) : featuredEpisode.costEnergy > 0 && !featuredDone ? (
                    <span className="text-[12px] text-[var(--mist-2)] flex items-center gap-0.5 font-num">
                      <GameIcon name="energy" size={18} /> {featuredEpisode.costEnergy}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* 身价卡点：告诉玩家差多少、去哪里赚 */}
          {featuredEpisode && featuredPrereqMet && !featuredNwMet && !featuredDone && (
            <div className="holo-panel mt-3 px-3.5 py-3">
              <div className="holo-scan" aria-hidden />
              <div className="relative flex items-center gap-2">
                <GameIcon name="tianshu" size={26} shadow={false} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold cyan-glow-text">天枢：宿主身价尚不足以撬动下一幕</div>
                  <div className="text-[10.5px] text-[#9AF4FB]/70 mt-0.5">
                    还差 <span className="font-num text-[#FFE7B0]">{formatMoney(featuredEpisode.requireNetWorth - state.player.netWorth)}</span>
                    ，经营产业或在海城各区出手都能抬高身价
                  </div>
                </div>
              </div>
              <div className="relative mt-2.5 flex items-center gap-2">
                <div className="flex-1 h-[5px] rounded-full bg-[#06222F] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1FA9BC] to-[#B9F6FB] shadow-[0_0_6px_rgba(99,230,242,0.8)]"
                    style={{ width: `${Math.max(3, Math.min(100, (state.player.netWorth / featuredEpisode.requireNetWorth) * 100))}%` }}
                  />
                </div>
                <span className="font-num text-[11px] text-[#B9F6FB]">
                  {formatMoney(state.player.netWorth)} / {formatMoney(featuredEpisode.requireNetWorth)}
                </span>
              </div>
              <div className="relative grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={() => {
                    playTap();
                    openAssetsTab('biz');
                  }}
                  className="btn-champagne py-2 text-[12.5px] font-editorial flex items-center justify-center gap-1.5"
                >
                  <GameIcon name="nav_assets" size={20} shadow={false} /> 经营产业
                  {state.player.pendingIncome > 0 && <span className="font-num text-[10.5px] opacity-80">待收 {formatMoney(state.player.pendingIncome)}</span>}
                </button>
                <button
                  onClick={() => {
                    playTap();
                    setActiveTab('map');
                  }}
                  className="btn-ghost py-2 text-[12.5px] font-editorial flex items-center justify-center gap-1.5"
                >
                  <GameIcon name="nav_map" size={20} shadow={false} /> 海城出手
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="label-en !tracking-[0.3em]">PROGRESS</span>
            <div className="flex-1 h-px bg-white/[0.08]">
              <div className="h-full bg-[var(--champagne)]" style={{ width: `${Math.max(3, (doneCount / Math.max(1, totalCount)) * 100)}%` }} />
            </div>
            <span className="font-num text-[12px] text-[var(--ivory-2)]">
              {doneCount}/{totalCount}
            </span>
          </div>
        </div>
      )}

      {/* Volume chips */}
      <div className="sticky top-0 z-20 mt-2 px-4 flex items-center gap-5 overflow-x-auto no-scrollbar bg-gradient-to-b from-[#04050A] via-[#04050A]/95 to-[#04050A]/0 pb-3">
        <button
          data-active={selectedVolId === 'all'}
          onClick={() => {
            playTap();
            setSelectedVolId('all');
          }}
          className="route-tab v2 shrink-0 font-editorial"
        >
          全部
        </button>
        {volumes.map((vol: any) => (
          <button
            key={vol.volumeId}
            data-active={selectedVolId === vol.volumeId}
            onClick={() => {
              playTap();
              setSelectedVolId(vol.volumeId);
            }}
            className="route-tab v2 shrink-0 font-editorial"
          >
            {shortVolumeLabel(vol)}
          </button>
        ))}
      </div>

      {/* Volumes: each one is a route of chapter medallions joined by a golden line */}
      <div className="px-3 pb-16 space-y-4">
        {visibleVolumes.map((vol: any) => {
          const { kicker, name } = splitVolTitle(vol);
          return (
            <StoryRoute
              key={vol.volumeId}
              vol={vol}
              kicker={kicker}
              name={name}
              episodes={vol.episodes || []}
              completed={completedSet}
              netWorth={state.player.netWorth}
              onOpen={openEpisode}
              volIndex={volumes.indexOf(vol)}
            />
          );
        })}
      </div>
    </div>
  );
};
