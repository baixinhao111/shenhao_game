import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CreditCard,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  Shield,
  Trophy,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatMoney, formatShortTime } from '../lib/format';
import { playCoinBurst, playSystemPing, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { AnimatedNumber } from './AnimatedNumber';

export const Overlays: React.FC = () => {
  const {
    state,
    topToast,
    dismissToast,
    critBanner,
    barrage,
    errorToast,
    showLeaderboard,
    setShowLeaderboard,
    showMail,
    setShowMail,
    showAdmin,
    setShowAdmin,
    applyServerState,
    notifyTop,
    showError,
    logout,
  } = useGameStore();

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [adminData, setAdminData] = useState<any>(null);
  const [gmKey, setGmKey] = useState('');
  const [gmModel, setGmModel] = useState('deepseek-chat');
  const [mailTitle, setMailTitle] = useState('海城周末津贴');
  const [mailCash, setMailCash] = useState('1000000');
  const [mailPts, setMailPts] = useState('100');
  const [dismissedCritId, setDismissedCritId] = useState<number | null>(null);

  useEffect(() => {
    if (showLeaderboard) {
      apiRequest('/leaderboard')
        .then((r) => setLeaderboard(r.leaderboard || []))
        .catch(() => {});
    }
  }, [showLeaderboard]);

  useEffect(() => {
    if (showAdmin) {
      apiRequest('/admin/overview')
        .then((r) => {
          setAdminData(r);
          if (r?.stats?.model) setGmModel(r.stats.model);
        })
        .catch((e) => showError(e.message));
    }
  }, [showAdmin, showError]);

  const claimMail = async (mailId: number) => {
    try {
      const res = await apiRequest('/mail/claim', { body: { mailId } });
      applyServerState(res.state);
      playCoinBurst();
      notifyTop('bank', '已领取附件', '款项与补给已汇入账户');
    } catch (e: any) {
      showError(e.message);
    }
  };

  const saveGmConfig = async () => {
    try {
      const body: any = { deepseekModel: gmModel };
      if (gmKey.trim()) body.deepseekApiKey = gmKey.trim();
      const res = await apiRequest('/admin/config', { body });
      setGmKey('');
      notifyTop('system', '配置已保存', res.message);
      const ov = await apiRequest('/admin/overview');
      setAdminData(ov);
    } catch (e: any) {
      showError(e.message);
    }
  };

  const toggleCruiseEvent = async () => {
    try {
      const nextActive = !(adminData?.stats?.eventActive ?? true);
      await apiRequest('/admin/config', { body: { eventCruiseActive: nextActive } });
      notifyTop('system', '活动状态已更新', `公海星耀号已${nextActive ? '开启' : '关闭'}`);
      const ov = await apiRequest('/admin/overview');
      setAdminData(ov);
    } catch (e: any) {
      showError(e.message);
    }
  };

  const sendAllMail = async () => {
    try {
      const res = await apiRequest('/admin/mail/send', {
        body: {
          title: mailTitle,
          body: '一份来自海城的补给，请查收。',
          cash: Number(mailCash || 0),
          sysPoints: Number(mailPts || 0),
          energy: 30,
        },
      });
      notifyTop('system', '全服邮件已发送', `已发放给 ${res.sentCount} 位玩家`);
      const st = await apiRequest('/state');
      applyServerState(st.state);
    } catch (e: any) {
      showError(e.message);
    }
  };

  const reloadContent = async () => {
    try {
      const res = await apiRequest('/admin/reload-content', { method: 'POST' });
      playSystemPing();
      notifyTop('system', '配置已重载', res.message);
      const st = await apiRequest('/state');
      applyServerState(st.state);
    } catch (e: any) {
      showError(e.message);
    }
  };

  return (
    <>
      {/* 1. Sleek Tap-to-Dismiss Top Notice */}
      <AnimatePresence>
        {topToast && (
          <motion.div
            key={topToast.id}
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={dismissToast}
            className="absolute top-3 left-3.5 right-3.5 z-50 cursor-pointer"
          >
            <div className="panel-elevated rounded-[6px] px-3.5 py-2.5 flex items-center gap-3 border-l-2 border-l-[#CFB073]">
              <div
                className={`w-7 h-7 rounded-[4px] flex items-center justify-center shrink-0 ${
                  topToast.kind === 'bank'
                    ? 'bg-[#CFB073]/15 text-[#EBD4A2]'
                    : topToast.kind === 'wechat'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/[0.07] text-[#E6E3DC]'
                }`}
              >
                {topToast.kind === 'bank' ? (
                  <CreditCard className="w-3.5 h-3.5" />
                ) : topToast.kind === 'wechat' ? (
                  <MessageCircle className="w-3.5 h-3.5" />
                ) : (
                  <Bell className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F3F0E8] truncate">{topToast.title}</span>
                  <span className="text-[10px] text-[#7D818E] shrink-0">刚刚</span>
                </div>
                <p className="text-[11px] text-[#B4B7C2] line-clamp-2 mt-0.5 leading-snug">{topToast.body}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Error Notice */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            className="absolute bottom-20 left-4 right-4 z-50 bg-[#231218]/96 backdrop-blur-xl border border-[#D95B78]/45 text-[#F6CFD9] text-xs px-4 py-2.5 rounded-[6px] shadow-xl text-center"
          >
            {errorToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Architectural Crit Cashback Curtain */}
      <AnimatePresence>
        {critBanner && critBanner.id !== dismissedCritId && (
          <motion.div
            key={critBanner.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              playTap();
              setDismissedCritId(critBanner.id);
            }}
            className="absolute inset-0 z-50 bg-black/68 backdrop-blur-[5px] flex items-center justify-center px-6 cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="w-full panel-brass clip-chamfer px-6 py-7 text-center space-y-2.5"
            >
              <div className="text-[11px] tracking-[0.26em] text-[#CFB073] font-medium">
                消费返现 · ×{critBanner.multiplier}
              </div>
              <div className="hairline-gold w-20 mx-auto" />
              <div className="font-editorial text-4xl font-bold gold-gradient-text tracking-tight py-1">
                +<AnimatedNumber value={critBanner.amount} duration={650} />
              </div>
              {critBanner.subtitle && <div className="text-xs text-[#B9BCC8]">{critBanner.subtitle}</div>}
              <div className="pt-2 text-[10px] text-[#7D818E] tracking-[0.16em]">点击继续</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Flying Barrage */}
      {barrage && (
        <div key={barrage.id} className="absolute inset-x-0 top-16 h-40 z-40 pointer-events-none overflow-hidden">
          {barrage.lines.map((line, i) => (
            <div
              key={`${barrage.id}-${i}`}
              className={`absolute whitespace-nowrap font-medium text-xs px-3 py-1 rounded-[4px] animate-barrage ${
                barrage.style === 'gold'
                  ? 'bg-[#1D1810]/92 border border-[#CFB073]/50 text-[#EBD4A2]'
                  : 'bg-black/72 border border-white/12 text-[#EBE8E1]'
              }`}
              style={{ top: `${(i % 4) * 32 + 6}px`, animationDelay: `${i * 0.65}s` }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* 5. Leaderboard Modal */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLeaderboard(false)}
            className="absolute inset-0 z-50 bg-black/78 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full max-h-[82%] rounded-[8px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 text-sm text-[#F3F0E8]">
                  <Trophy className="w-4 h-4 text-[#CFB073]" />
                  <span className="font-editorial font-bold tracking-wider">海城财富榜</span>
                </div>
                <button
                  onClick={() => {
                    playTap();
                    setShowLeaderboard(false);
                  }}
                  className="p-1 text-[#8C8F9A] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="divide-y divide-white/[0.06] overflow-y-auto no-scrollbar px-4">
                {leaderboard.map((row, idx) => (
                  <div key={row.userId} className="py-3.5 flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-[4px] flex items-center justify-center font-bold text-xs shrink-0 tabular-nums ${
                        idx === 0
                          ? 'bg-[#CFB073] text-[#0D0C0A]'
                          : idx === 1
                            ? 'bg-white/15 text-[#F3F0E8]'
                            : idx === 2
                              ? 'bg-[#937A49]/35 text-[#EBD4A2]'
                              : 'text-[#8C8F9A]'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#F3F0E8] truncate">{row.nickname}</span>
                        <span className="text-[10px] text-[#CFB073] shrink-0">{row.tierName}</span>
                      </div>
                      <div className="text-[11px] text-[#848896] mt-0.5 truncate">
                        {row.mainResidence} · {row.carName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-[#EBD4A2]">
                        <AnimatedNumber value={row.netWorth} />
                      </div>
                      <div className="text-[10px] text-[#757986]">身价</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Mail Modal */}
      <AnimatePresence>
        {showMail && state && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMail(false)}
            className="absolute inset-0 z-50 bg-black/78 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full max-h-[82%] rounded-[8px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 text-sm text-[#F3F0E8]">
                  <Mail className="w-4 h-4 text-[#CFB073]" />
                  <span className="font-editorial font-bold tracking-wider">私人信箱</span>
                </div>
                <button
                  onClick={() => {
                    playTap();
                    setShowMail(false);
                  }}
                  className="p-1 text-[#8C8F9A] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="divide-y divide-white/[0.06] overflow-y-auto no-scrollbar px-4">
                {state.mails?.length === 0 && (
                  <div className="text-center text-xs text-[#848896] py-10">暂无来信</div>
                )}
                {state.mails?.map((m: any) => (
                  <div key={m.id} className={`py-3.5 space-y-2 ${m.claimed ? 'opacity-65' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F3F0E8]">{m.title}</span>
                      <span className="text-[10px] text-[#7D818E]">{formatShortTime(m.created_at)}</span>
                    </div>
                    <p className="text-xs text-[#A5A9B5] leading-relaxed">{m.body}</p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs text-[#EBD4A2] space-x-2.5 tabular-nums">
                        {m.cash > 0 && <span>{formatMoney(m.cash)}</span>}
                        {m.sys_points > 0 && <span>积分 +{m.sys_points}</span>}
                        {m.energy > 0 && <span>精力 +{m.energy}</span>}
                      </div>
                      {m.claimed ? (
                        <span className="text-[11px] text-[#757986]">已领取</span>
                      ) : (
                        <button onClick={() => claimMail(m.id)} className="btn-brass text-xs px-3 py-1 rounded-[4px]">
                          领取
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. GM Admin Panel */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAdmin(false)}
            className="absolute inset-0 z-50 bg-black/82 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel-elevated w-full max-h-[86%] rounded-[8px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 font-semibold text-sm text-[#EBD4A2]">
                  <Shield className="w-4 h-4" /> 服主控制台
                </div>
                <button onClick={() => setShowAdmin(false)} className="p-1 text-[#8C8F9A] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto no-scrollbar space-y-4 text-xs">
                <div className="panel-arch rounded-[6px] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#F3F0E8]">DeepSeek 对话接口</span>
                    <span className={adminData?.stats?.keyConfigured ? 'text-emerald-400' : 'text-[#CFB073]'}>
                      {adminData?.stats?.keyConfigured ? '已接入' : '未配置 Key'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#848896]">
                    累计对话 {adminData?.stats?.totalMessages || 0} 条 · Tokens {adminData?.stats?.totalTokensUsed || 0}
                  </div>
                  <input
                    type="password"
                    placeholder="DeepSeek API Key (sk-...)"
                    value={gmKey}
                    onChange={(e) => setGmKey(e.target.value)}
                    className="w-full rounded-[4px] bg-[#0B0C10] border border-white/12 px-3 py-2 text-xs text-white outline-none focus:border-[#CFB073]/55"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gmModel}
                      onChange={(e) => setGmModel(e.target.value)}
                      className="flex-1 rounded-[4px] bg-[#0B0C10] border border-white/12 px-3 py-1.5 text-xs text-white outline-none focus:border-[#CFB073]/55"
                    />
                    <button onClick={saveGmConfig} className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs">
                      保存
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={toggleCruiseEvent} className="game-action-tile rounded-[6px] p-3 text-left">
                    <div className="font-semibold text-[#EBD4A2]">限时游轮活动</div>
                    <div className="text-[11px] text-[#848896] mt-0.5">
                      {adminData?.stats?.eventActive ? '开启中' : '已关闭'}
                    </div>
                  </button>
                  <button onClick={reloadContent} className="game-action-tile rounded-[6px] p-3 text-left">
                    <div className="font-semibold text-[#F3F0E8] flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 text-[#CFB073]" /> 重载剧本配置
                    </div>
                    <div className="text-[11px] text-[#848896] mt-0.5">免重启刷新 content/</div>
                  </button>
                </div>

                <div className="panel-arch rounded-[6px] p-3.5 space-y-2.5">
                  <div className="font-semibold text-[#F3F0E8]">全服发信</div>
                  <input
                    value={mailTitle}
                    onChange={(e) => setMailTitle(e.target.value)}
                    className="w-full rounded-[4px] bg-[#0B0C10] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={mailCash}
                      onChange={(e) => setMailCash(e.target.value)}
                      placeholder="现金"
                      className="rounded-[4px] bg-[#0B0C10] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
                    />
                    <input
                      type="number"
                      value={mailPts}
                      onChange={(e) => setMailPts(e.target.value)}
                      placeholder="积分"
                      className="rounded-[4px] bg-[#0B0C10] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                  <button
                    onClick={sendAllMail}
                    className="w-full btn-brass rounded-[4px] py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> 发送
                  </button>
                </div>

                <button
                  onClick={logout}
                  className="w-full py-2.5 rounded-[4px] border border-[#D95B78]/40 hover:bg-[#D95B78]/10 text-[#E88CA1] text-xs font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" /> 退出账号
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
