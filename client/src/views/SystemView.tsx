import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  KeyRound,
  LogOut,
  Music,
  Settings,
  Shield,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { GameIcon, OrnateCorners, type GameIconName } from '../components/GameIcon';
import { PlayerEmblem } from '../components/TopBar';
import { apiRequest } from '../lib/api';
import { isAmbienceEnabled, isBgmEnabled, toggleAmbience, toggleBgm } from '../lib/bgm';
import { formatMoney } from '../lib/format';
import { isSoundMuted, playSystemPing, playTap, toggleSoundMute } from '../lib/sound';
import { useGameStore, type ProfileSubTab } from '../store/useGameStore';

export const SystemView: React.FC = () => {
  const {
    state,
    profileTab,
    closeProfile,
    setShowAdmin,
    logout,
    applyServerState,
    notifyTop,
    showError,
    flyReward,
  } = useGameStore();

  const [subTab, setSubTab] = useState<ProfileSubTab>(profileTab || 'tasks');
  const [muted, setMuted] = useState(isSoundMuted());
  const [bgmOn, setBgmOn] = useState(isBgmEnabled());
  const [ambOn, setAmbOn] = useState(isAmbienceEnabled());
  const [showSettings, setShowSettings] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSubTab(profileTab || 'tasks');
  }, [profileTab]);

  if (!state) return null;
  const { player, user, dailyTasks, skills, mallItems } = state;
  const achievements: any[] = state.achievements || [];
  const unclaimedAchCount = Number(state.unclaimedAchievementCount || 0);
  const completedEps: string[] = state.stories?.completedEpisodes || [];
  const protagonistSrc =
    completedEps.includes('ep_003') || completedEps.length >= 3
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const claimAchievement = async (achievementId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/achievements/claim', { body: { achievementId } });
      applyServerState(res.state);
      if (res.rewardCash > 0) flyReward(res.rewardCash);
      else playSystemPing();
      notifyTop('system', '成就达成', res.titleBadge ? `获得专属称号「${res.titleBadge}」` : '奖励已到账');
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const equipTitle = async (achievementId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/achievements/equip-title', { body: { achievementId } });
      applyServerState(res.state);
      playSystemPing();
      notifyTop('system', '称号已更新', res.message);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPwd || !newPwd) return;
    setBusy(true);
    try {
      const res = await apiRequest('/auth/change-password', { body: { oldPassword: oldPwd, newPassword: newPwd } });
      setOldPwd('');
      setNewPwd('');
      playSystemPing();
      notifyTop('system', '密码已修改', res.message || '下次登录请使用新密码');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportSave = async () => {
    setBusy(true);
    try {
      const data = await apiRequest('/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tianshu_save_${user.username || 'player'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      playSystemPing();
      notifyTop('system', '存档已导出', 'JSON 备份文件已开始下载');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('/system/signin', { method: 'POST' });
      const gained = Math.max(0, (res.state?.player?.cash || 0) - (useGameStore.getState().state?.player?.cash || 0));
      applyServerState(res.state);
      flyReward(gained);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const claimTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/system/task/claim', { body: { taskId } });
      const gained = Math.max(0, (res.state?.player?.cash || 0) - (useGameStore.getState().state?.player?.cash || 0));
      applyServerState(res.state);
      flyReward(gained);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upgradeSkill = async (skillId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/system/skill/upgrade', { body: { skillId } });
      applyServerState(res.state);
      playSystemPing();
      notifyTop('system', '强化完成', '相关能力已生效');
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buyMall = async (itemId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest('/system/mall/buy', { body: { itemId } });
      applyServerState(res.state);
      playSystemPing();
      notifyTop('system', '兑换完成', res.message);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const critPct = Math.min(100, player.critCharge);
  const tierRatio = player.nextTier ? Math.min(100, (player.netWorth / player.nextTier.minNetWorth) * 100) : 100;

  return (
    <div className="h-full flex flex-col bg-[#0B1122]">
      {/* Reversible Navigation Header */}
      <header className="relative shrink-0 h-[56px] px-4 flex items-center justify-between gap-2" style={{ background: "linear-gradient(180deg, rgba(20,28,56,0.98), rgba(11,16,33,0.98))" }}>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#E2BD72]/55 to-transparent" />
        <button
          onClick={() => {
            playTap();
            closeProfile();
          }}
          className="flex items-center gap-1.5 text-xs text-[#E6E3DC] hover:text-white active:opacity-75"
        >
          <ArrowLeft className="w-4 h-4 text-[#E2BD72]" />
          <span>返回</span>
        </button>

        <span className="font-editorial text-[17px] font-black tracking-[0.3em] gold-gradient-text">个人档案</span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              playTap();
              setShowSettings((v) => !v);
            }}
            className={`p-1.5 transition ${showSettings ? 'text-[#FFE7B0]' : 'text-[#A3AAC2] hover:text-[#F6DDA4]'}`}
            title="视听与账号设置"
            aria-label="视听与账号设置"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMuted(toggleSoundMute())}
            className="p-1.5 text-[#A3AAC2] hover:text-[#F6DDA4]"
            title={muted ? '开启音效' : '静音'}
            aria-label={muted ? '开启音效' : '静音'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#E2BD72]" />}
          </button>
          {Boolean(user.is_admin) && (
            <button
              onClick={() => {
                playTap();
                setShowAdmin(true);
              }}
              className="p-1.5 text-[#E2BD72] hover:text-[#F6DDA4]"
              title="服主控制台"
              aria-label="服主控制台"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={logout}
            className="p-1.5 text-[#8B93AD] hover:text-[#E88CA1]"
            title="退出账号"
            aria-label="退出账号"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-4 deco-texture">
        {/* Audio & Account Security Settings Panel */}
        {showSettings && (
          <section className="panel-elevated rounded-[12px] p-3.5 space-y-3.5 border border-[#E2BD72]/40">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-editorial text-[15px] font-black gold-gradient-text">视听与账号设置</span>
              <button onClick={() => setShowSettings(false)} className="text-[#8B93AD] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] tracking-[0.2em] text-[#8B93AD]">声音氛围</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    playTap();
                    setBgmOn(toggleBgm());
                  }}
                  className={`rounded-[8px] px-2 py-2 border text-center transition ${
                    bgmOn
                      ? 'bg-[#251C0C]/90 border-[#E2BD72]/60 text-[#FFE7B0]'
                      : 'bg-[#080D1D]/80 border-white/10 text-[#7F88A6]'
                  }`}
                >
                  <Music className="w-4 h-4 mx-auto mb-1" />
                  <div className="text-[11px] font-bold">背景音乐</div>
                  <div className="text-[10px] opacity-80">{bgmOn ? '开启' : '关闭'}</div>
                </button>
                <button
                  onClick={() => {
                    playTap();
                    setAmbOn(toggleAmbience());
                  }}
                  className={`rounded-[8px] px-2 py-2 border text-center transition ${
                    ambOn && bgmOn
                      ? 'bg-[#08222E]/90 border-[#63E6F2]/55 text-[#B9F6FB]'
                      : 'bg-[#080D1D]/80 border-white/10 text-[#7F88A6]'
                  }`}
                >
                  <Wind className="w-4 h-4 mx-auto mb-1" />
                  <div className="text-[11px] font-bold">雨声江风</div>
                  <div className="text-[10px] opacity-80">{ambOn ? '开启' : '关闭'}</div>
                </button>
                <button
                  onClick={() => setMuted(toggleSoundMute())}
                  className={`rounded-[8px] px-2 py-2 border text-center transition ${
                    !muted
                      ? 'bg-[#251C0C]/90 border-[#E2BD72]/60 text-[#FFE7B0]'
                      : 'bg-[#080D1D]/80 border-white/10 text-[#7F88A6]'
                  }`}
                >
                  {muted ? <VolumeX className="w-4 h-4 mx-auto mb-1" /> : <Volume2 className="w-4 h-4 mx-auto mb-1" />}
                  <div className="text-[11px] font-bold">交互音效</div>
                  <div className="text-[10px] opacity-80">{muted ? '静音' : '开启'}</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-2 pt-1 border-t border-white/[0.07]">
              <div className="text-[11px] tracking-[0.2em] text-[#8B93AD] flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-[#E2BD72]" /> 修改登录密码
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="输入原密码"
                  className="rounded-[6px] bg-[#070B18] border border-white/12 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#E2BD72]/60"
                />
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码（4位以上）"
                  className="rounded-[6px] bg-[#070B18] border border-white/12 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#E2BD72]/60"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !oldPwd || newPwd.length < 4}
                  className="flex-1 btn-brass py-1.5 text-xs font-editorial disabled:opacity-45"
                >
                  确认修改密码
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleExportSave()}
                  className="btn-navy px-3 py-1.5 text-xs font-editorial flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-[#E2BD72]" /> 导出存档
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Dossier card */}
        <section className="relative panel-brass rounded-[12px] px-4 pt-4 pb-3.5 space-y-3.5">
          <OrnateCorners size={22} inset={-5} />
          <div className="flex items-center gap-3.5">
            <PlayerEmblem src={protagonistSrc} level={player.sysLevel} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="font-editorial text-[22px] font-black gold-gradient-text truncate leading-tight">{user.nickname}</h2>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <GameIcon name="crown" size={16} shadow={false} />
                  <span className="text-[12px] text-[#F6DDA4] font-bold tracking-wider">{player.tier.name}</span>
                </span>
                {user.equippedTitle?.titleBadge && (
                  <span
                    className={`px-1.5 py-[1px] rounded-sm text-[10px] font-bold border ${
                      user.equippedTitle.titleTone === 'cyan'
                        ? 'bg-[#072330]/85 border-[#63E6F2]/55 text-[#B9F6FB]'
                        : user.equippedTitle.titleTone === 'rose'
                          ? 'bg-[#361124]/85 border-[#F0789A]/55 text-[#FFC4D3]'
                          : 'bg-[#2B1F0B]/85 border-[#E2BD72]/55 text-[#FFE7B0]'
                    }`}
                  >
                    {user.equippedTitle.titleBadge}
                  </span>
                )}
              </div>
            </div>
            <button
              disabled={busy || player.signedInToday}
              onClick={signIn}
              className={`shrink-0 flex flex-col items-center ${player.signedInToday ? 'opacity-50 grayscale' : ''}`}
            >
              <GameIcon name="signin" size={40} className={player.signedInToday ? '' : 'animate-float-slow'} />
              <span className="text-[10.5px] font-bold text-[#FBF1D8] -mt-0.5">{player.signedInToday ? '已签到' : '签到'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: 'cash' as const, label: '总身价', value: <AnimatedNumber value={player.netWorth} /> },
              { icon: 'syspoint' as const, label: '天枢积分', value: player.sysPoints },
              { icon: 'energy' as const, label: '精力', value: `${player.energy}/${player.maxEnergy}` },
            ].map((x) => (
              <div key={x.label} className="rounded-[8px] bg-[#070B18]/70 border border-[#E2BD72]/20 px-2 py-1.5 flex items-center gap-1.5">
                <GameIcon name={x.icon} size={26} />
                <div className="min-w-0">
                  <div className="text-[9.5px] text-[#8B93AD]">{x.label}</div>
                  <div className="font-num text-[13px] text-[#FFE7B0] truncate">{x.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#B9F6FB]">返现蓄能</span>
                <span className="font-num text-[#B9F6FB]">{critPct}%</span>
              </div>
              <div className="bar-track">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1F8FA6] to-[#9BF5FF] shadow-[0_0_8px_rgba(99,230,242,0.7)]"
                  style={{ width: `${critPct}%` }}
                />
              </div>
            </div>
            {player.nextTier && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="text-[#A3AAC2] truncate">晋升 · {player.nextTier.name}</span>
                  <span className="font-num text-[#FFE7B0] shrink-0">{Math.round(tierRatio)}%</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${tierRatio}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Segmented tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-full bg-[#070B18]/90 border border-[#E2BD72]/25">
          {[
            { id: 'tasks', label: '日程', icon: 'task' as const },
            { id: 'achievements', label: '成就', icon: 'medal' as const },
            { id: 'skills', label: '进修', icon: 'skill' as const },
            { id: 'mall', label: '补给', icon: 'mall' as const },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              data-active={subTab === id}
              onClick={() => {
                playTap();
                setSubTab(id as ProfileSubTab);
              }}
              className="relative tab-chip !px-1.5 !py-1 flex items-center justify-center gap-1 font-editorial text-[12px]"
            >
              <GameIcon name={icon} size={18} shadow={false} />
              <span>{label}</span>
              {id === 'achievements' && unclaimedAchCount > 0 && <span className="red-dot top-0.5 right-1" />}
            </button>
          ))}
        </div>

        {subTab === 'achievements' && (
          <div className="space-y-2.5">
            <div className="panel-arch rounded-[10px] px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-[#C3C9DC]">
                已达成 <span className="font-num text-[#FFE7B0] font-bold">{achievements.filter((a) => a.unlocked).length}</span> / {achievements.length}
              </span>
              {user.equippedTitle?.titleBadge ? (
                <div className="flex items-center gap-2">
                  <span className="text-[#F6DDA4] text-[11px]">佩戴中：{user.equippedTitle.titleBadge}</span>
                  <button
                    disabled={busy}
                    onClick={() => void equipTitle('')}
                    className="text-[10.5px] text-[#929AB4] underline hover:text-white"
                  >
                    卸下
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-[#7F88A6]">领取成就后可佩戴专属称号</span>
              )}
            </div>

            {[...achievements]
              .sort((a, b) => {
                const rank = (x: any) => (x.unlocked && !x.claimed ? 0 : x.claimed ? 1 : 2);
                return rank(a) - rank(b);
              })
              .map((ach: any) => {
                const ready = ach.unlocked && !ach.claimed;
                const ratio = Math.min(100, (Number(ach.progress || 0) / Math.max(1, Number(ach.target || 1))) * 100);
                const fmtVal = (v: number) => (ach.statKey === 'netWorth' ? formatMoney(v) : String(v));
                const iconName = (ach.icon || 'medal') as GameIconName;
                const badgeCls =
                  ach.titleTone === 'cyan'
                    ? 'bg-[#072330]/85 border-[#63E6F2]/50 text-[#B9F6FB]'
                    : ach.titleTone === 'rose'
                      ? 'bg-[#361124]/85 border-[#F0789A]/50 text-[#FFC4D3]'
                      : 'bg-[#2B1F0B]/85 border-[#E2BD72]/50 text-[#FFE7B0]';
                return (
                  <div
                    key={ach.id}
                    className={`rounded-[10px] px-3 py-2.5 flex items-center gap-2.5 ${ready ? 'panel-brass' : 'panel-arch'}`}
                  >
                    <GameIcon name={iconName} size={38} className={!ach.unlocked ? 'grayscale opacity-65' : ''} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-editorial font-black text-[#FBF1D8]">{ach.name}</span>
                        {ach.titleBadge && (
                          <span className={`px-1.5 py-[0.5px] rounded-sm text-[9.5px] font-bold border ${badgeCls}`}>
                            称号 · {ach.titleBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A3AAC2] leading-snug">{ach.desc}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bar-track !h-[5px]">
                          <div className="bar-fill" style={{ width: `${ratio}%` }} />
                        </div>
                        <span className="font-num text-[10.5px] text-[#C3C9DC] shrink-0">
                          {fmtVal(ach.progress)}/{fmtVal(ach.target)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 font-num text-[11px]">
                        {ach.rewardCash > 0 && (
                          <span className="flex items-center gap-0.5 text-[#FFE7B0]">
                            <GameIcon name="cash" size={14} shadow={false} />+{formatMoney(ach.rewardCash)}
                          </span>
                        )}
                        {ach.rewardPoints > 0 && (
                          <span className="flex items-center gap-0.5 text-[#B9F6FB]">
                            <GameIcon name="syspoint" size={14} shadow={false} />+{ach.rewardPoints}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {ready ? (
                        <button
                          disabled={busy}
                          onClick={() => void claimAchievement(ach.id)}
                          className="gold-btn-shimmer px-3 py-1.5 text-[12px] font-editorial"
                        >
                          领取
                        </button>
                      ) : ach.claimed ? (
                        <button
                          disabled={busy}
                          onClick={() => void equipTitle(ach.equipped ? '' : ach.id)}
                          className={`px-2.5 py-1.5 text-[11.5px] font-editorial ${
                            ach.equipped ? 'btn-system' : 'btn-navy'
                          }`}
                        >
                          {ach.equipped ? '佩戴中' : '佩戴'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#78809B] px-2">进行中</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {subTab === 'tasks' && (
          <div className="space-y-2">
            {dailyTasks.map((t: any) => {
              const ready = t.progress >= t.target && !t.claimed;
              const ratio = Math.min(100, (t.progress / t.target) * 100);
              return (
                <div
                  key={t.id}
                  className={`rounded-[10px] px-3 py-3 flex items-center gap-3 ${ready ? 'panel-brass' : 'panel-arch'} ${
                    t.claimed ? 'opacity-55' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-editorial font-bold text-[#FBF1D8]">{t.title}</span>
                      <span className="font-num text-[12px] text-[#A3AAC2] shrink-0">
                        {Math.min(t.progress, t.target)}/{t.target}
                      </span>
                    </div>
                    <div className="bar-track !h-[5px]">
                      <div className="bar-fill" style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="flex items-center gap-3 font-num text-[11.5px]">
                      <span className="flex items-center gap-0.5 text-[#FFE7B0]">
                        <GameIcon name="cash" size={16} shadow={false} />+{formatMoney(t.rewardCash)}
                      </span>
                      <span className="flex items-center gap-0.5 text-[#B9F6FB]">
                        <GameIcon name="syspoint" size={16} shadow={false} />+{t.rewardPoints}
                      </span>
                      <span className="flex items-center gap-0.5 text-[#F4EFE4]">
                        <GameIcon name="energy" size={16} shadow={false} />+{t.rewardEnergy}
                      </span>
                    </div>
                  </div>
                  {t.claimed ? (
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-emerald-400/70 text-[11px] font-black text-emerald-300 rotate-[-14deg] font-editorial shrink-0">
                      已领
                    </span>
                  ) : (
                    <button
                      disabled={busy || !ready}
                      onClick={() => claimTask(t.id)}
                      className={`px-3.5 py-1.5 text-[12.5px] font-editorial shrink-0 ${ready ? 'gold-btn-shimmer' : 'btn-navy opacity-60'}`}
                    >
                      {ready ? '领取' : '进行中'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {subTab === 'skills' && (
          <div className="space-y-2">
            {skills.map((sk: any) => {
              const maxed = sk.level >= sk.maxLevel;
              const cost = sk.costPerLevel * (sk.level + 1);
              const canAfford = !maxed && player.sysPoints >= cost;
              return (
                <div key={sk.id} className="panel-arch rounded-[10px] px-3 py-3 flex items-center gap-3">
                  <div className="relative shrink-0">
                    <GameIcon name="skill" size={44} />
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 font-num text-[11px] text-[#FFE7B0] text-stroke-dark whitespace-nowrap">
                      Lv.{sk.level}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-editorial font-bold text-[#FBF1D8]">{sk.name}</div>
                    <p className="text-[11.5px] text-[#A3AAC2] mt-0.5 leading-relaxed">{sk.desc}</p>
                    <div className="flex gap-1 mt-2 max-w-[180px]">
                      {Array.from({ length: sk.maxLevel }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-[6px] flex-1 -skew-x-12 ${
                            i < sk.level
                              ? 'bg-gradient-to-r from-[#63E6F2] to-[#B9F6FB] shadow-[0_0_6px_rgba(99,230,242,0.7)]'
                              : 'bg-white/[0.08]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={busy || !canAfford}
                    onClick={() => upgradeSkill(sk.id)}
                    className={`px-2.5 py-1.5 text-[12px] shrink-0 flex items-center gap-0.5 font-num ${
                      canAfford ? 'btn-system' : 'btn-navy opacity-50'
                    }`}
                  >
                    {maxed ? (
                      '已满级'
                    ) : (
                      <>
                        <GameIcon name="syspoint" size={16} shadow={false} /> {cost}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {subTab === 'mall' && (
          <div className="grid grid-cols-2 gap-2">
            {mallItems.map((item: any) => {
              const icon =
                item.id === 'item_energy_drink' ? 'energy' : item.id === 'item_crit_charge' ? 'skill' : 'briefcase';
              const chargeFull = item.id === 'item_crit_charge' && (player.critCharge || 0) >= 100;
              return (
                <div key={item.id} className="panel-arch rounded-[10px] p-3 flex flex-col items-center text-center gap-1.5">
                  <div
                    className="w-full h-[70px] rounded-[8px] flex items-center justify-center"
                    style={{ background: 'radial-gradient(60% 60% at 50% 55%, rgba(120,140,220,0.25), transparent 75%)' }}
                  >
                    <GameIcon name={icon} size={56} />
                  </div>
                  <div className="text-[13px] font-editorial font-bold text-[#FBF1D8]">{item.name}</div>
                  <div className="text-[11px] text-[#A3AAC2] leading-snug min-h-[30px]">{item.desc}</div>
                  <button
                    disabled={busy || chargeFull || player.sysPoints < item.costPoints}
                    onClick={() => buyMall(item.id)}
                    className="btn-system w-full py-1.5 text-[12.5px] flex items-center justify-center gap-1 font-num disabled:opacity-40"
                  >
                    {chargeFull ? (
                      '蓄能已满'
                    ) : (
                      <>
                        <GameIcon name="syspoint" size={16} shadow={false} /> {item.costPoints}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
