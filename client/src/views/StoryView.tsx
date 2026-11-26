import React, { useMemo, useState } from 'react';
import { Check, ChevronRight, Lock, Play, Zap } from 'lucide-react';
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

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#090A0D]">
      {/* Featured Full-Bleed Current Chapter Poster */}
      {featuredEpisode && (
        <div
          onClick={() => openEpisode(featuredEpisode)}
          className="relative h-52 w-full overflow-hidden cursor-pointer border-b border-white/[0.08] group"
        >
          <img
            src={featuredEpisode.bg}
            alt={featuredEpisode.title}
            className={`w-full h-full object-cover transition duration-700 group-hover:scale-[1.03] ${
              featuredLocked ? 'grayscale brightness-45' : 'brightness-[0.76]'
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#090A0D]/95 via-[#090A0D]/62 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-transparent to-black/35" />

          {featuredEpisode.posterLead && (
            <img
              src={featuredEpisode.posterLead}
              alt=""
              className={`absolute right-1 bottom-0 h-[96%] w-auto object-contain object-bottom sprite-fade-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)] pointer-events-none ${
                featuredLocked ? 'grayscale opacity-50' : ''
              }`}
            />
          )}

          <div className="absolute inset-0 p-4 flex flex-col justify-between max-w-[68%]">
            <div className="flex items-center gap-2 text-[11px] text-[#CFB073]">
              <span className="font-medium tracking-wider">{featuredEpisode.chapterTitle}</span>
              <span className="text-white/25">/</span>
              <span className="text-[#9EA2AE] tabular-nums">
                进度 {doneCount}/{totalCount}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="font-editorial text-[22px] font-bold text-[#F6F3EB] tracking-wider leading-tight">
                {featuredEpisode.title}
              </h2>
              <p className="text-[11.5px] text-[#B8BBC6] line-clamp-2 leading-relaxed">
                {featuredEpisode.summary}
              </p>

              <div className="pt-1 flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs ${
                    featuredLocked
                      ? 'border border-white/15 text-[#8C8F9A]'
                      : 'btn-brass clip-chamfer-sm'
                  }`}
                >
                  {featuredLocked ? (
                    <>
                      <Lock className="w-3 h-3" /> 待解锁
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" /> {featuredDone ? '重温' : '继续'}
                    </>
                  )}
                </span>

                {featuredLocked && !featuredNwMet ? (
                  <span className="text-[11px] text-[#E6829A]">
                    身价需达 {formatMoney(featuredEpisode.requireNetWorth)}
                  </span>
                ) : featuredEpisode.costEnergy > 0 && !featuredDone ? (
                  <span className="text-[11px] text-[#CFB073] flex items-center gap-0.5 tabular-nums">
                    <Zap className="w-3 h-3" /> {featuredEpisode.costEnergy}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clean Hairline-Underlined Volume Tabs */}
      <div className="sticky top-0 z-20 bg-[#090A0D]/95 backdrop-blur-md border-b border-white/[0.08] px-4 flex items-center gap-5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            playTap();
            setSelectedVolId('all');
          }}
          className={`shrink-0 py-3 text-xs tracking-wider border-b-2 transition ${
            selectedVolId === 'all'
              ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
              : 'text-[#7D818E] border-transparent hover:text-[#C5C8D3]'
          }`}
        >
          全部
        </button>

        {volumes.map((vol: any) => {
          const active = selectedVolId === vol.volumeId;
          return (
            <button
              key={vol.volumeId}
              onClick={() => {
                playTap();
                setSelectedVolId(vol.volumeId);
              }}
              className={`shrink-0 py-3 text-xs tracking-wider border-b-2 transition ${
                active
                  ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
                  : 'text-[#7D818E] border-transparent hover:text-[#C5C8D3]'
              }`}
            >
              {shortVolumeLabel(vol)}
            </button>
          );
        })}
      </div>

      {/* Editorial Horizontal-Split Episode Index */}
      <div className="px-4 py-5 pb-10 space-y-6">
        {visibleVolumes.map((vol: any) => (
          <section key={vol.volumeId} className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2 pb-1">
              <h3 className="font-editorial text-[15px] font-bold text-[#F3F0E8] tracking-wider">{vol.title}</h3>
              <span className="text-[11px] text-[#7D818E] truncate">{vol.subtitle}</span>
            </div>

            <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {(vol.episodes || []).map((ep: any) => {
                const done = completedSet.has(ep.episodeId);
                const prereqMet = !ep.requireEpisode || completedSet.has(ep.requireEpisode);
                const nwMet = !ep.requireNetWorth || state.player.netWorth >= ep.requireNetWorth;
                const locked = !prereqMet || !nwMet;

                return (
                  <button
                    key={ep.episodeId}
                    onClick={() => openEpisode(ep)}
                    className={`w-full py-3.5 flex items-center gap-3.5 text-left transition hover:bg-white/[0.025] active:bg-white/[0.04] ${
                      locked ? 'opacity-55' : ''
                    }`}
                  >
                    {/* Crisp 16:10 Thumbnail */}
                    <div className="relative w-24 h-16 shrink-0 bg-[#121319] overflow-hidden border border-white/[0.08]">
                      <img
                        src={ep.bg}
                        alt={ep.title}
                        className={`w-full h-full object-cover ${locked ? 'grayscale brightness-50' : 'brightness-90'}`}
                      />
                      {ep.posterLead && (
                        <img
                          src={ep.posterLead}
                          alt=""
                          className={`absolute right-0 bottom-0 h-[96%] w-auto object-contain object-bottom ${
                            locked ? 'grayscale opacity-60' : ''
                          }`}
                        />
                      )}
                    </div>

                    {/* Concise Editorial Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-[10.5px] text-[#CFB073] shrink-0">{ep.chapterTitle}</span>
                          <span className="font-editorial text-[15px] font-bold text-[#F5F2EA] truncate">
                            {ep.title}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
                          {done ? (
                            <span className="text-emerald-400/90 flex items-center gap-0.5">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          ) : locked ? (
                            <Lock className="w-3.5 h-3.5 text-[#757986]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[#CFB073]" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11.5px] text-[#969AA6] line-clamp-2 leading-snug">{ep.summary}</p>

                      {ep.requireNetWorth && !done && !nwMet && (
                        <div className="text-[10.5px] text-[#E6829A]">
                          需身价 {formatMoney(ep.requireNetWorth)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
