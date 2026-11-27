import { motion } from 'framer-motion';
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
import { Atmosphere, EdgeLabel, Watermark } from '../components/Atmosphere';
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
    <div className="relative h-full flex flex-col night-page">
      {/* Reversible Navigation Header */}
      <header className="relative z-10 shrink-0 h-[56px] px-4 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            playTap();
            closeProfile();
          }}
          className="flex items-center gap-1.5 text-xs text-[#E6E3DC] hover:text-white active:opacity-75"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--champagne)]" />
          <span>返回</span>
        </button>

        <span className="flex flex-col items-center leading-none">
          <span className="label-en !text-[8px]">PROFILE · DOSSIER</span>
          <span className="font-editorial text-[15px] font-black tracking-[0.4em] ink-title mt-1">个人档案</span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              playTap();
              setShowSettings((v) => !v);
            }}
            className={`p-1.5 transition ${showSettings ? 'text-[#EADBB8]' : 'text-[#8C90A0] hover:text-[#E2D3B0]'}`}
            title="视听与账号设置"
            aria-label="视听与账号设置"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMuted(toggleSoundMute())}
            className="p-1.5 text-[#8C90A0] hover:text-[#E2D3B0]"
            title={muted ? '开启音效' : '静音'}
            aria-label={muted ? '开启音效' : '静音'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#D9C49A]" />}
          </button>
          {Boolean(user.is_admin) && (
            <button
              onClick={() => {
                playTap();
                setShowAdmin(true);
              }}
              className="p-1.5 text-[#D9C49A] hover:text-[#E2D3B0]"
              title="服主控制台"
              aria-label="服主控制台"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={logout}
            className="p-1.5 text-[#7A7E8E] hover:text-[#E88CA1]"
            title="退出账号"
            aria-label="退出账号"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <Atmosphere />
      <EdgeLabel text="TIANSHU · HOST FILE · NO.0001" top="30%" />
      <div className="relative flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-5">
        {/* Audio & Account Security Settings Panel */}
        {showSettings && (
          <section className="panel-elevated rounded-[12px] p-3.5 space-y-3.5 border border-[#D9C49A]/40">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <span className="font-editorial text-[15px] font-black gold-gradient-text">视听与账号设置</span>
              <button onClick={() => setShowSettings(false)} className="text-[#7A7E8E] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] tracking-[0.2em] text-[#7A7E8E]">声音氛围</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    playTap();
                    setBgmOn(toggleBgm());
                  }}
                  className={`rounded-[8px] px-2 py-2 border text-center transition ${
                    bgmOn
                      ? 'bg-[#251C0C]/90 border-[#D9C49A]/60 text-[#EADBB8]'
                      : 'bg-[#080D1D]/80 border-white/10 text-[#6D7183]'
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
                      : 'bg-[#080D1D]/80 border-white/10 text-[#6D7183]'
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
                      ? 'bg-[#251C0C]/90 border-[#D9C49A]/60 text-[#EADBB8]'
                      : 'bg-[#080D1D]/80 border-white/10 text-[#6D7183]'
                  }`}
                >
                  {muted ? <VolumeX className="w-4 h-4 mx-auto mb-1" /> : <Volume2 className="w-4 h-4 mx-auto mb-1" />}
                  <div className="text-[11px] font-bold">交互音效</div>
                  <div className="text-[10px] opacity-80">{muted ? '静音' : '开启'}</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-2 pt-1 border-t border-white/[0.07]">
              <div className="text-[11px] tracking-[0.2em] text-[#7A7E8E] flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-[#D9C49A]" /> 修改登录密码
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="输入原密码"
                  className="rounded-[6px] bg-[#06080E] border border-white/12 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#D9C49A]/60"
                />
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码（4位以上）"
                  className="rounded-[6px] bg-[#06080E] border border-white/12 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#D9C49A]/60"
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
                  <Download className="w-3.5 h-3.5 text-[#D9C49A]" /> 导出存档
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Dossier: open hero, no frame */}
        <section className="relative pt-2 pb-1">
          <Watermark text="TIANSHU" className="-top-3 right-[-6px] text-[64px]" />
          <div className="relative flex items-center gap-4">
            <PlayerEmblem src={protagonistSrc} level={player.sysLevel} size={72} />
            <div className="min-w-0 flex-1">
              <div className="label-en">HOST · LV.{player.sysLevel}</div>
              <h2 className="font-editorial text-[30px] font-black ink-title truncate leading-none tracking-[0.12em] mt-1.5">{user.nickname}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="inline-flex items-center gap-1">
                  <GameIcon name="crown" size={16} shadow={false} />
                  <span className="text-[12px] text-[var(--champagne)] tracking-[0.25em]">{player.tier.name}</span>
                </span>
                {user.equippedTitle?.titleBadge && (
                  <span
                    className={`text-[10.5px] font-bold tracking-wider ${
                      user.equippedTitle.titleTone === 'cyan'
                        ? 'text-[#B9F6FB]'
                        : user.equippedTitle.titleTone === 'rose'
                          ? 'text-[#FFC4D3]'
                          : 'text-[#EADBB8]'
                    }`}
                  >
                    「{user.equippedTitle.titleBadge}」
                  </span>
                )}
              </div>
            </div>
            <button
              disabled={busy || player.signedInToday}
              onClick={signIn}
              className={`shrink-0 flex flex-col items-center ${player.signedInToday ? 'opacity-50 grayscale' : ''}`}
            >
              <GameIcon name="signin" size={42} className={player.signedInToday ? '' : 'animate-float-slow'} />
              <span className="text-[10.5px] font-bold text-[#ECE6DA] -mt-0.5 text-stroke-dark">{player.signedInToday ? '已签到' : '签到'}</span>
            </button>
          </div>

          {/* figures separated by hairlines */}
          <div className="relative mt-5 grid grid-cols-3">
            {[
              { icon: 'cash' as const, label: '总身价', value: <AnimatedNumber value={player.netWorth} /> },
              { icon: 'syspoint' as const, label: '天枢积分', value: player.sysPoints },
              { icon: 'energy' as const, label: '精力', value: `${player.energy}/${player.maxEnergy}` },
            ].map((x, i) => (
              <div key={x.label} className={`flex flex-col items-center ${i ? 'border-l border-white/[0.07]' : ''}`}>
                <div className="flex items-center gap-1 text-[10px] tracking-[0.25em] text-[#6D7183]">
                  <GameIcon name={x.icon} size={16} shadow={false} />
                  {x.label}
                </div>
                <div className="font-num text-[18px] text-[var(--ivory-2)] mt-1 truncate max-w-full">{x.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-5">
            <div>
              <div className="flex items-center justify-between text-[10.5px] mb-1">
                <span className="text-[#B9F6FB] tracking-wider">返现蓄能</span>
                <span className="font-num text-[#B9F6FB]">{critPct}%</span>
              </div>
              <div className="h-[2px] bg-white/[0.08] rounded-full">
                <div className="h-full rounded-full bg-gradient-to-r from-[#1F8FA6] to-[#9BF5FF] shadow-[0_0_8px_rgba(99,230,242,0.8)]" style={{ width: `${critPct}%` }} />
              </div>
            </div>
            {player.nextTier && (
              <div>
                <div className="flex items-center justify-between text-[10.5px] mb-1 gap-1">
                  <span className="text-[#8C90A0] truncate tracking-wider">晋升 · {player.nextTier.name}</span>
                  <span className="font-num text-[var(--ivory-2)] shrink-0">{Math.round(tierRatio)}%</span>
                </div>
                <div className="h-[2px] bg-white/[0.08] rounded-full">
                  <div className="h-full rounded-full bg-[var(--champagne)]" style={{ width: `${tierRatio}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* text tabs */}
        <div className="flex items-center justify-around border-b border-white/[0.05]">
          {[
            { id: 'tasks', label: '日程' },
            { id: 'achievements', label: '成就' },
            { id: 'skills', label: '进修' },
            { id: 'mall', label: '补给' },
          ].map(({ id, label }) => (
            <button
              key={id}
              data-active={subTab === id}
              onClick={() => {
                playTap();
                setSubTab(id as ProfileSubTab);
              }}
              className="relative route-tab v2 font-editorial"
            >
              {label}
              {id === 'achievements' && unclaimedAchCount > 0 && <span className="red-dot top-1.5 -right-2" />}
            </button>
          ))}
        </div>

        {/* ---------------- 日程：账本式列表 ---------------- */}
        {subTab === 'tasks' && (
          <div>
            {dailyTasks.map((t: any, i: number) => {
              const ready = t.progress >= t.target && !t.claimed;
              const ratio = Math.min(100, (t.progress / t.target) * 100);
              return (
                <div key={t.id} className={`relative py-3.5 flex items-center gap-3 ${t.claimed ? 'opacity-50' : ''}`}>
                  {i > 0 && <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />}
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rotate-45 ${
                      t.claimed ? 'bg-[var(--champagne-dim)]' : ready ? 'bg-[var(--ivory-2)] shadow-[0_0_10px_rgba(236,230,218,0.8)] animate-pulse' : 'border border-[#4E5262]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-editorial font-bold text-[#D9D4C9] truncate">{t.title}</span>
                      <span className="font-num text-[11px] text-[#7A7E8E] shrink-0">
                        {Math.min(t.progress, t.target)}/{t.target}
                      </span>
                    </div>
                    <div className="h-px bg-white/[0.07] mt-1.5 mb-1.5 max-w-[220px]">
                      <div className="h-full bg-[var(--champagne)]" style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="flex items-center gap-3 font-num text-[11px]">
                      <span className="flex items-center gap-0.5 text-[#CDBB93]">
                        <GameIcon name="cash" size={15} shadow={false} />+{formatMoney(t.rewardCash)}
                      </span>
                      <span className="flex items-center gap-0.5 text-[#8FC6CC]">
                        <GameIcon name="syspoint" size={15} shadow={false} />+{t.rewardPoints}
                      </span>
                      <span className="flex items-center gap-0.5 text-[#A9AEBE]">
                        <GameIcon name="energy" size={15} shadow={false} />+{t.rewardEnergy}
                      </span>
                    </div>
                  </div>
                  {t.claimed ? (
                    <span className="shrink-0 w-11 h-11 rounded-full border border-[var(--champagne-dim)] flex items-center justify-center text-[11px] font-black text-[var(--champagne)] rotate-[-14deg] font-editorial">
                      已领
                    </span>
                  ) : ready ? (
                    <button disabled={busy} onClick={() => claimTask(t.id)} className="btn-champagne shrink-0 px-4 py-1.5 text-[12.5px] font-editorial">
                      领取
                    </button>
                  ) : (
                    <span className="shrink-0 label-en !tracking-[0.25em]">ONGOING</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------- 成就：勋章墙 ---------------- */}
        {subTab === 'achievements' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="text-[#8C90A0] tracking-wider">
                已达成 <span className="font-num text-[#EADBB8] text-[14px]">{achievements.filter((a) => a.unlocked).length}</span> / {achievements.length}
              </span>
              {user.equippedTitle?.titleBadge ? (
                <button disabled={busy} onClick={() => void equipTitle('')} className="text-[#E2D3B0]">
                  佩戴「{user.equippedTitle.titleBadge}」<span className="text-[#6D7183] ml-1">卸下</span>
                </button>
              ) : (
                <span className="text-[#6D7183]">点亮勋章可佩戴称号</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-5">
              {[...achievements]
                .sort((a, b) => {
                  const rank = (x: any) => (x.unlocked && !x.claimed ? 0 : x.claimed ? 1 : 2);
                  return rank(a) - rank(b);
                })
                .map((ach: any) => {
                  const ready = ach.unlocked && !ach.claimed;
                  const ratio = Math.min(1, Number(ach.progress || 0) / Math.max(1, Number(ach.target || 1)));
                  const fmtVal = (v: number) => (ach.statKey === 'netWorth' ? formatMoney(v) : String(v));
                  const R = 31;
                  const C = 2 * Math.PI * R;
                  return (
                    <button
                      key={ach.id}
                      disabled={busy || (!ready && !ach.claimed)}
                      onClick={() => (ready ? void claimAchievement(ach.id) : void equipTitle(ach.equipped ? '' : ach.id))}
                      className="flex flex-col items-center text-center active:scale-95 transition disabled:active:scale-100"
                    >
                      <span className="relative w-[72px] h-[72px] flex items-center justify-center">
                        {ready && (
                          <motion.span
                            className="absolute inset-0 rounded-full"
                            style={{ background: 'radial-gradient(circle, rgba(230,214,178,0.3), transparent 70%)' }}
                            animate={{ scale: [0.9, 1.2, 0.9] }}
                            transition={{ repeat: Infinity, duration: 1.8 }}
                          />
                        )}
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 72 72">
                          <circle cx="36" cy="36" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" />
                          <circle
                            cx="36"
                            cy="36"
                            r={R}
                            stroke={ach.unlocked ? '#E6D6B2' : '#5E6273'}
                            strokeWidth="2"
                            fill="none"
                            strokeDasharray={`${C * ratio} ${C}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <GameIcon name={(ach.icon || 'medal') as GameIconName} size={44} className={!ach.unlocked ? 'grayscale opacity-55' : ''} />
                        {ach.equipped && (
                          <span className="absolute -bottom-1 px-1.5 rounded-sm bg-[#D9C49A] text-[#19130A] text-[9px] font-black">佩戴</span>
                        )}
                      </span>
                      <span className={`mt-1.5 text-[12px] font-editorial font-black ${ach.unlocked ? 'text-[var(--ivory-2)]' : 'text-[#7C8092]'}`}>{ach.name}</span>
                      {ach.titleBadge && (
                        <span
                          className={`text-[9.5px] ${
                            ach.titleTone === 'cyan' ? 'text-[#9AF4FB]' : ach.titleTone === 'rose' ? 'text-[#FFB3C6]' : 'text-[#D9C49A]'
                          }`}
                        >
                          「{ach.titleBadge}」
                        </span>
                      )}
                      <span className="text-[10px] text-[#6D7183] leading-snug mt-0.5 line-clamp-2 px-1">{ach.desc}</span>
                      {ready ? (
                        <span className="mt-1 px-3 py-[2px] text-[10.5px] btn-champagne">领取</span>
                      ) : !ach.unlocked ? (
                        <span className="mt-1 font-num text-[10px] text-[#7A7E8E]">
                          {fmtVal(ach.progress)}/{fmtVal(ach.target)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* ---------------- 进修：天枢技能脉络 ---------------- */}
        {subTab === 'skills' && (
          <div className="relative pl-1">
            <span className="absolute left-[29px] top-6 bottom-6 w-px bg-gradient-to-b from-[#63E6F2]/60 via-[#63E6F2]/25 to-transparent" />
            {skills.map((sk: any) => {
              const maxed = sk.level >= sk.maxLevel;
              const cost = sk.costPerLevel * (sk.level + 1);
              const canAfford = !maxed && player.sysPoints >= cost;
              return (
                <div key={sk.id} className="relative py-3 flex items-center gap-3">
                  <span className="relative shrink-0 w-[56px] h-[56px] flex items-center justify-center">
                    <span
                      className="absolute inset-0 rotate-45 rounded-[10px]"
                      style={{
                        background: sk.level > 0 ? 'linear-gradient(135deg, rgba(99,230,242,0.35), rgba(4,18,31,0.9))' : 'rgba(4,18,31,0.9)',
                        border: `1px solid ${sk.level > 0 ? 'rgba(155,245,255,0.7)' : 'rgba(99,230,242,0.25)'}`,
                        boxShadow: sk.level > 0 ? '0 0 14px rgba(99,230,242,0.35)' : undefined,
                      }}
                    />
                    <GameIcon name="skill" size={34} className={`relative ${sk.level > 0 ? '' : 'grayscale opacity-60'}`} />
                    <span className="absolute -bottom-2 font-num text-[11px] text-[#B9F6FB] text-stroke-dark">Lv.{sk.level}</span>
                  </span>
                  <div className="min-w-0 flex-1 pl-1">
                    <div className="text-[14px] font-editorial font-bold text-[#D9D4C9]">{sk.name}</div>
                    <p className="text-[11px] text-[#858999] mt-0.5 leading-relaxed">{sk.desc}</p>
                    <div className="flex gap-[3px] mt-1.5">
                      {Array.from({ length: sk.maxLevel }).map((_, i) => (
                        <span key={i} className={`w-[10px] h-[3px] ${i < sk.level ? 'bg-[#9BF5FF] shadow-[0_0_5px_rgba(99,230,242,0.8)]' : 'bg-white/[0.1]'}`} />
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={busy || !canAfford}
                    onClick={() => upgradeSkill(sk.id)}
                    className={`shrink-0 flex items-center gap-0.5 font-num text-[12px] px-2.5 py-1 rounded-full border ${
                      maxed
                        ? 'border-transparent text-[#5E6273]'
                        : canAfford
                          ? 'border-[#63E6F2]/70 text-[#B9F6FB] bg-[#04121F] shadow-[0_0_10px_rgba(99,230,242,0.3)]'
                          : 'border-white/10 text-[#5E6273]'
                    }`}
                  >
                    {maxed ? '已满级' : (
                      <>
                        <GameIcon name="syspoint" size={15} shadow={false} /> {cost}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------- 补给：展台陈列 ---------------- */}
        {subTab === 'mall' && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 pt-2">
            {mallItems.map((item: any) => {
              const icon = item.id === 'item_energy_drink' ? 'energy' : item.id === 'item_crit_charge' ? 'skill' : 'briefcase';
              const chargeFull = item.id === 'item_crit_charge' && (player.critCharge || 0) >= 100;
              const can = !busy && !chargeFull && player.sysPoints >= item.costPoints;
              return (
                <div key={item.id} className="flex flex-col items-center text-center">
                  <div className="relative h-[92px] w-full flex items-end justify-center">
                    <span className="absolute bottom-1 w-[70%] h-[16px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(217,196,154,0.25),transparent)]" />
                    <span className="absolute bottom-[9px] w-[54%] h-px bg-gradient-to-r from-transparent via-[#D9C49A]/45 to-transparent" />
                    <GameIcon name={icon as GameIconName} size={66} className="relative animate-float-slow mb-3" />
                  </div>
                  <div className="text-[14px] font-editorial font-black text-[#D9D4C9] mt-1">{item.name}</div>
                  <div className="text-[10.5px] text-[#7A7E8E] leading-snug mt-0.5 min-h-[28px] px-1">{item.desc}</div>
                  <button
                    disabled={!can}
                    onClick={() => buyMall(item.id)}
                    className="mt-1.5 px-4 py-1 rounded-full border border-[#63E6F2]/60 text-[#B9F6FB] bg-[#04121F] text-[12px] font-num flex items-center gap-1 disabled:opacity-40"
                  >
                    {chargeFull ? '蓄能已满' : (
                      <>
                        <GameIcon name="syspoint" size={15} shadow={false} /> {item.costPoints}
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
