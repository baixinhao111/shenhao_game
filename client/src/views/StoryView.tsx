import React, { useMemo, useState } from 'react';
import { Lock, Play } from 'lucide-react';
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
    <div className="h-full overflow-y-auto no-scrollbar deco-texture">
      {/* Featured poster */}
      {featuredEpisode && (
        <div className="px-3 pt-3">
          <div
            onClick={() => openEpisode(featuredEpisode)}
            className="relative h-[210px] w-full rounded-[10px] cursor-pointer group"
          >
            <div className="absolute inset-0 rounded-[10px] overflow-hidden border border-[#E2BD72]/70 shadow-[0_14px_36px_rgba(0,0,0,0.55),0_0_24px_rgba(226,189,114,0.15)]">
              <img
                src={featuredVol?.cover || featuredEpisode.bg}
                alt={featuredEpisode.title}
                className={`w-full h-full object-cover transition duration-700 group-hover:scale-[1.03] ${
                  featuredLocked ? 'grayscale brightness-50' : ''
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0A0F1F]/95 via-[#0A0F1F]/55 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1F]/90 via-transparent to-transparent" />
            </div>
            <OrnateCorners size={24} inset={-5} />

            {featuredEpisode.posterLead && (
              <img
                src={featuredEpisode.posterLead}
                alt=""
                className={`absolute right-0 bottom-0 h-[112%] w-auto object-contain object-bottom sprite-fade-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)] pointer-events-none ${
                  featuredLocked ? 'grayscale opacity-50' : ''
                }`}
              />
            )}

            <div className="absolute inset-0 p-4 flex flex-col justify-between max-w-[66%]">
              <div className="flex items-center gap-2">
                <span className="px-2 py-[2px] rounded-sm text-[10px] font-black tracking-[0.2em] text-[#1E1506] bg-gradient-to-b from-[#FFE9BB] to-[#D6A85A]">
                  {featuredDone ? '回顾' : '当前主线'}
                </span>
                <span className="text-[11px] text-[#F6DDA4] tracking-wider text-stroke-dark">{featuredEpisode.chapterTitle}</span>
              </div>

              <div className="space-y-2">
                <h2 className="font-editorial text-[26px] font-black leading-tight gold-gradient-text drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  {featuredEpisode.title}
                </h2>
                <p className="text-[11.5px] text-[#D3D8E8] line-clamp-2 leading-relaxed text-stroke-dark">
                  {featuredEpisode.summary}
                </p>
                <div className="pt-1 flex items-center gap-3">
                  {featuredLocked ? (
                    <span className="btn-navy inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs">
                      <Lock className="w-3 h-3" /> 待解锁
                    </span>
                  ) : (
                    <span className="gold-btn-shimmer inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-editorial">
                      <Play className="w-3.5 h-3.5 fill-current" /> {featuredDone ? '重温' : '继续'}
                    </span>
                  )}
                  {featuredLocked && !featuredNwMet ? (
                    <span className="text-[11px] text-[#FF8FA6] text-stroke-dark">
                      身价需达 {formatMoney(featuredEpisode.requireNetWorth)}
                    </span>
                  ) : featuredEpisode.costEnergy > 0 && !featuredDone ? (
                    <span className="text-[12px] text-[#F6DDA4] flex items-center gap-0.5 font-num text-stroke-dark">
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
                  className="btn-brass py-2 text-[12.5px] font-editorial flex items-center justify-center gap-1.5"
                >
                  <GameIcon name="nav_assets" size={20} shadow={false} /> 经营产业
                  {state.player.pendingIncome > 0 && <span className="font-num text-[10.5px] opacity-80">待收 {formatMoney(state.player.pendingIncome)}</span>}
                </button>
                <button
                  onClick={() => {
                    playTap();
                    setActiveTab('map');
                  }}
                  className="btn-navy py-2 text-[12.5px] font-editorial flex items-center justify-center gap-1.5"
                >
                  <GameIcon name="nav_map" size={20} shadow={false} /> 海城出手
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-[11px] text-[#A3AAC2] tracking-wider">主线进度</span>
            <div className="bar-track flex-1">
              <div className="bar-fill" style={{ width: `${Math.max(3, (doneCount / Math.max(1, totalCount)) * 100)}%` }} />
            </div>
            <span className="font-num text-[12px] text-[#F6DDA4]">
              {doneCount}/{totalCount}
            </span>
          </div>
        </div>
      )}

      {/* Volume chips */}
      <div className="sticky top-0 z-20 mt-2 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#0A0F1F]/85 backdrop-blur-md border-b border-[#E2BD72]/15">
        <button
          data-active={selectedVolId === 'all'}
          onClick={() => {
            playTap();
            setSelectedVolId('all');
          }}
          className="tab-chip shrink-0 font-editorial"
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
            className="tab-chip shrink-0 font-editorial"
          >
            {shortVolumeLabel(vol)}
          </button>
        ))}
      </div>

      {/* Volumes */}
      <div className="px-3 py-4 pb-10 space-y-6">
        {visibleVolumes.map((vol: any) => {
          const { kicker, name } = splitVolTitle(vol);
          const eps = vol.episodes || [];
          const volDone = eps.filter((e: any) => completedSet.has(e.episodeId)).length;
          return (
            <section key={vol.volumeId} className="space-y-2.5">
              {/* Volume banner */}
              <div className="relative h-[92px] rounded-[8px] overflow-hidden border border-[#E2BD72]/35">
                <img src={vol.cover || eps[0]?.bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0A0F1F]/95 via-[#0A0F1F]/60 to-[#0A0F1F]/55" />
                <div className="relative h-full px-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {kicker && (
                      <div className="text-[10.5px] tracking-[0.35em] text-[#E2BD72] font-bold">{kicker}</div>
                    )}
                    <div className="font-editorial text-[26px] font-black leading-tight gold-gradient-text tracking-[0.2em]">
                      {name}
                    </div>
                    <div className="text-[10.5px] text-[#C3C9DC] truncate max-w-[220px]">{vol.subtitle}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-num text-[22px] text-[#FFE7B0] leading-none text-stroke-dark">
                      {volDone}
                      <span className="text-[13px] text-[#A3AAC2]">/{eps.length}</span>
                    </div>
                    <div className="text-[9.5px] text-[#C3C9DC] tracking-widest mt-0.5 text-stroke-dark">已阅</div>
                  </div>
                </div>
              </div>

              {/* Episodes on a timeline */}
              <div className="relative pl-5">
                <span className="absolute left-[7px] top-3 bottom-3 w-px bg-gradient-to-b from-[#E2BD72]/60 via-[#E2BD72]/25 to-transparent" />
                <div className="space-y-2">
                  {eps.map((ep: any, idx: number) => {
                    const done = completedSet.has(ep.episodeId);
                    const prereqMet = !ep.requireEpisode || completedSet.has(ep.requireEpisode);
                    const nwMet = !ep.requireNetWorth || state.player.netWorth >= ep.requireNetWorth;
                    const locked = !prereqMet || !nwMet;
                    const current = !done && !locked;
                    return (
                      <button
                        key={ep.episodeId}
                        onClick={() => openEpisode(ep)}
                        className={`relative w-full text-left rounded-[8px] p-2 flex items-center gap-3 transition active:scale-[0.99] ${
                          current ? 'panel-brass' : 'panel-arch'
                        } ${locked ? 'opacity-60' : ''}`}
                      >
                        <span
                          className={`absolute -left-[17px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 border ${
                            done
                              ? 'bg-[#E2BD72] border-[#FFE7B0]'
                              : current
                                ? 'bg-[#FFE7B0] border-white shadow-[0_0_10px_rgba(255,231,176,0.9)]'
                                : 'bg-[#141C35] border-[#6B7392]'
                          }`}
                        />
                        <div className="relative w-[86px] h-[58px] shrink-0 rounded-[5px] overflow-hidden border border-white/10">
                          <img
                            src={ep.bg}
                            alt={ep.title}
                            className={`w-full h-full object-cover ${locked ? 'grayscale brightness-50' : ''}`}
                          />
                          {ep.posterLead && (
                            <img
                              src={ep.posterLead}
                              alt=""
                              className={`absolute right-0 bottom-0 h-[100%] w-auto object-contain object-bottom ${
                                locked ? 'grayscale opacity-60' : ''
                              }`}
                            />
                          )}
                          <span className="absolute left-1 top-0.5 font-num text-[15px] font-semibold text-[#FFE7B0] text-stroke-dark">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-[#E2BD72] tracking-wider">{ep.chapterTitle}</div>
                          <div className="font-editorial text-[15px] font-black text-[#FBF1D8] truncate">{ep.title}</div>
                          <p className="text-[11px] text-[#929AB4] line-clamp-1 leading-snug mt-0.5">{ep.summary}</p>
                          {Number(ep.requireNetWorth) > 0 && !done && !nwMet && (
                            <div className="text-[10.5px] text-[#FF8FA6] mt-0.5">需身价 {formatMoney(ep.requireNetWorth)}</div>
                          )}
                        </div>

                        <div className="shrink-0 pr-1">
                          {done ? (
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-[#E2BD72]/70 text-[10px] font-black text-[#E2BD72] rotate-[-14deg] font-editorial">
                              已阅
                            </span>
                          ) : locked ? (
                            <GameIcon name="lock" size={26} className="opacity-80" />
                          ) : (
                            <GameIcon name="play" size={32} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
