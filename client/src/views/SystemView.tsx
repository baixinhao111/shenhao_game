import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck,
  Check,
  LogOut,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { isSoundMuted, playCoinBurst, playSystemPing, playTap, toggleSoundMute } from '../lib/sound';
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
  } = useGameStore();

  const [subTab, setSubTab] = useState<ProfileSubTab>(profileTab || 'tasks');
  const [muted, setMuted] = useState(isSoundMuted());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSubTab(profileTab || 'tasks');
  }, [profileTab]);

  if (!state) return null;
  const { player, user, dailyTasks, skills, mallItems } = state;
  const protagonistSrc =
    (state.stories?.completedEpisodes?.length || 0) >= 2
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const signIn = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('/system/signin', { method: 'POST' });
      applyServerState(res.state);
      playCoinBurst();
      notifyTop('bank', '签到完成', res.message);
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
      applyServerState(res.state);
      playCoinBurst();
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
    <div className="h-full flex flex-col bg-[#090A0D]">
      {/* Reversible Navigation Header */}
      <header className="shrink-0 h-[54px] px-4 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-[#0B0C10]">
        <button
          onClick={() => {
            playTap();
            closeProfile();
          }}
          className="flex items-center gap-1.5 text-xs text-[#E6E3DC] hover:text-white active:opacity-75"
        >
          <ArrowLeft className="w-4 h-4 text-[#CFB073]" />
          <span>返回</span>
        </button>

        <span className="font-editorial text-[15px] font-bold tracking-[0.14em] text-[#F3F0E8]">个人档案</span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(toggleSoundMute())}
            className="p-1.5 text-[#9EA2AE] hover:text-[#EBD4A2]"
            title={muted ? '开启音效' : '静音'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#CFB073]" />}
          </button>
          {Boolean(user.is_admin) && (
            <button
              onClick={() => {
                playTap();
                setShowAdmin(true);
              }}
              className="p-1.5 text-[#CFB073] hover:text-[#EBD4A2]"
              title="服主控制台"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={logout}
            className="p-1.5 text-[#848896] hover:text-[#E88CA1]"
            title="退出账号"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-5">
        {/* Editorial Player Dossier Header */}
        <section className="space-y-4 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative w-16 h-16 shrink-0 border border-[#CFB073]/55 bg-[#111218] p-[2px]">
                <PortraitAvatar src={protagonistSrc} alt={user.nickname} className="w-full h-full" rounded="sm" />
                <span className="absolute -bottom-1 -right-1 px-1.5 bg-[#141310] border border-[#CFB073]/70 text-[9px] font-bold text-[#EBD4A2] tabular-nums">
                  Lv.{player.sysLevel}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h2 className="font-editorial text-xl font-bold text-[#F5F2EA] tracking-wider truncate">
                    {user.nickname}
                  </h2>
                  <span className="text-xs text-[#CFB073] shrink-0">{player.tier.name}</span>
                </div>
                <div className="text-xs text-[#9EA2AE] mt-1 tabular-nums">
                  总身价 <AnimatedNumber value={player.netWorth} className="text-[#F3F0E8] font-semibold" />
                </div>
                <div className="text-[11px] text-[#7D818E] mt-0.5 tabular-nums">
                  积分 <span className="text-[#EBD4A2] font-semibold">{player.sysPoints}</span> · 精力 {player.energy}/
                  {player.maxEnergy}
                </div>
              </div>
            </div>

            <button
              disabled={busy || player.signedInToday}
              onClick={signIn}
              className={`px-3 py-2 rounded-[4px] text-xs flex items-center gap-1.5 shrink-0 transition ${
                player.signedInToday
                  ? 'border border-white/10 text-[#7D818E]'
                  : 'btn-brass'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>{player.signedInToday ? '已签' : '签到'}</span>
            </button>
          </div>

          {/* Two Clean Hairline Meters */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#9EA2AE]">返现蓄能</span>
                <span className="text-[#EBD4A2] tabular-nums">
                  {critPct}%{critPct >= 100 ? ' · 已满' : ''}
                </span>
              </div>
              <div className="h-[3px] bg-white/[0.08] overflow-hidden">
                <div className="h-full bg-[#CFB073] transition-all duration-500" style={{ width: `${critPct}%` }} />
              </div>
            </div>

            {player.nextTier && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] gap-1">
                  <span className="text-[#9EA2AE] truncate">下一阶层 · {player.nextTier.name}</span>
                  <span className="text-[#F3F0E8] tabular-nums shrink-0">{Math.round(tierRatio)}%</span>
                </div>
                <div className="h-[3px] bg-white/[0.08] overflow-hidden">
                  <div className="h-full bg-[#EBD4A2] transition-all duration-500" style={{ width: `${tierRatio}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Clean Hairline-Underlined Sub Navigation */}
        <div className="flex items-center gap-6 border-b border-white/[0.08]">
          {[
            { id: 'tasks', label: '今日日程' },
            { id: 'skills', label: '能力进修' },
            { id: 'mall', label: '积分补给' },
          ].map(({ id, label }) => {
            const active = subTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  playTap();
                  setSubTab(id as ProfileSubTab);
                }}
                className={`pb-2.5 text-xs tracking-wider border-b-2 transition ${
                  active
                    ? 'text-[#EBD4A2] border-[#CFB073] font-semibold'
                    : 'text-[#7D818E] border-transparent hover:text-[#C5C8D3]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Hairline List: Daily Tasks */}
        {subTab === 'tasks' && (
          <div className="divide-y divide-white/[0.07]">
            {dailyTasks.map((t: any) => {
              const ready = t.progress >= t.target && !t.claimed;
              const ratio = Math.min(100, (t.progress / t.target) * 100);
              return (
                <div key={t.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#F3F0E8]">{t.title}</span>
                      <span className="text-[11px] text-[#848896] tabular-nums shrink-0">
                        {Math.min(t.progress, t.target)}/{t.target}
                      </span>
                    </div>
                    <div className="h-[2px] bg-white/[0.07] overflow-hidden">
                      <div className="h-full bg-[#CFB073]" style={{ width: `${ratio}%` }} />
                    </div>
                    <div className="text-[11px] text-[#8E92A0] flex items-center gap-3 tabular-nums">
                      <span className="text-[#EBD4A2]">+{formatMoney(t.rewardCash)}</span>
                      <span>积分 +{t.rewardPoints}</span>
                      <span>精力 +{t.rewardEnergy}</span>
                    </div>
                  </div>
                  {t.claimed ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0">
                      <Check className="w-3.5 h-3.5" /> 已领
                    </span>
                  ) : (
                    <button
                      disabled={busy || !ready}
                      onClick={() => claimTask(t.id)}
                      className={`px-3.5 py-1.5 rounded-[4px] text-xs shrink-0 transition ${
                        ready ? 'btn-brass' : 'border border-white/10 text-[#6F7380]'
                      }`}
                    >
                      {ready ? '领取' : '进行中'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Hairline List: Skills */}
        {subTab === 'skills' && (
          <div className="divide-y divide-white/[0.07]">
            {skills.map((sk: any) => {
              const maxed = sk.level >= sk.maxLevel;
              const cost = sk.costPerLevel * (sk.level + 1);
              const canAfford = !maxed && player.sysPoints >= cost;
              return (
                <div key={sk.id} className="py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-[#F3F0E8]">{sk.name}</span>
                      <span className="text-[10px] text-[#848896]">
                        Lv.{sk.level}/{sk.maxLevel}
                      </span>
                    </div>
                    <p className="text-xs text-[#9EA2AE] mt-1 leading-relaxed">{sk.desc}</p>
                    <div className="flex gap-1 mt-2.5 max-w-[180px]">
                      {Array.from({ length: sk.maxLevel }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-[3px] flex-1 ${i < sk.level ? 'bg-[#CFB073]' : 'bg-white/[0.09]'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={busy || !canAfford}
                    onClick={() => upgradeSkill(sk.id)}
                    className={`px-3 py-1.5 rounded-[4px] text-xs shrink-0 transition ${
                      canAfford
                        ? 'btn-brass'
                        : 'border border-white/10 text-[#7D818E] disabled:opacity-45'
                    }`}
                  >
                    {maxed ? '已满级' : `${cost} 积分`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Hairline List: Supply Mall */}
        {subTab === 'mall' && (
          <div className="divide-y divide-white/[0.07]">
            {mallItems.map((item: any) => {
              const IconComp =
                item.id === 'item_energy_drink' ? Zap : item.id === 'item_crit_charge' ? Sparkles : Briefcase;
              return (
                <div key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[4px] border border-[#CFB073]/30 bg-[#181611] flex items-center justify-center text-[#EBD4A2] shrink-0 mt-0.5">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#F3F0E8]">{item.name}</div>
                      <div className="text-xs text-[#9EA2AE] mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                  <button
                    disabled={busy || player.sysPoints < item.costPoints}
                    onClick={() => buyMall(item.id)}
                    className="btn-brass px-3 py-1.5 rounded-[4px] text-xs shrink-0 disabled:opacity-40"
                  >
                    {item.costPoints} 积分
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
