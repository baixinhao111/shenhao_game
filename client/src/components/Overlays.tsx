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
import { GameIcon } from './GameIcon';

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
      {/* 1. Top notice */}
      <AnimatePresence>
        {topToast && (
          <motion.div
            key={topToast.id}
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={dismissToast}
            className="absolute top-2.5 left-3 right-3 z-50 cursor-pointer"
          >
            <div
              className="relative rounded-[12px] pl-2 pr-3.5 py-2 flex items-center gap-2.5"
              style={{
                background: 'linear-gradient(180deg, rgba(26,36,72,0.97), rgba(10,15,31,0.97))',
                border: `1px solid ${
                  topToast.kind === 'wechat' ? 'rgba(240,120,154,0.6)' : topToast.kind === 'system' ? 'rgba(99,230,242,0.55)' : 'rgba(226,189,114,0.6)'
                }`,
                boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
              }}
            >
              <GameIcon
                name={topToast.kind === 'bank' ? 'income' : topToast.kind === 'wechat' ? 'nav_contact' : 'tianshu'}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-editorial font-black text-[#FBF1D8] truncate">{topToast.title}</span>
                  <span className="text-[10px] text-[#7F88A6] shrink-0">刚刚</span>
                </div>
                <p className="text-[11.5px] text-[#C3C9DC] line-clamp-2 mt-0.5 leading-snug">{topToast.body}</p>
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
            className="absolute bottom-24 left-6 right-6 z-50 flex justify-center pointer-events-none"
          >
            <span className="px-4 py-2 rounded-full text-[12.5px] text-[#FFE3EA] text-center leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.55)]" style={{ background: 'linear-gradient(180deg, rgba(70,20,40,0.96), rgba(36,10,22,0.96))', border: '1px solid rgba(255,120,150,0.55)' }}>
              {errorToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Crit cashback */}
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
            className="absolute inset-0 z-[70] bg-[#05070F]/80 backdrop-blur-[5px] flex items-center justify-center px-8 cursor-pointer overflow-hidden"
          >
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 w-[820px] h-[820px] -ml-[410px] -mt-[410px] pointer-events-none opacity-60"
              style={{
                background: 'repeating-conic-gradient(rgba(255,226,160,0.3) 0deg 7deg, transparent 7deg 20deg)',
                maskImage: 'radial-gradient(circle, #000, transparent 58%)',
                WebkitMaskImage: 'radial-gradient(circle, #000, transparent 58%)',
              }}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 24, ease: 'linear' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
              className="relative w-full text-center"
            >
              <div className="cyan-glow-text text-[11px] font-black tracking-[0.5em]">天枢 · 消费返现</div>
              <motion.div
                initial={{ scale: 2.6, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 520, damping: 14 }}
                className="inline-block mt-2 px-4 border-[3px] border-[#FF5C7A] rounded-[8px] font-num text-[46px] font-semibold text-[#FF5C7A] leading-tight shadow-[0_0_26px_rgba(255,92,122,0.55)]"
              >
                暴击 ×{critBanner.multiplier}
              </motion.div>
              <div className="flex justify-center mt-3">
                <GameIcon name="income" size={86} />
              </div>
              <div className="font-num text-[40px] font-semibold gold-gradient-text leading-none mt-1 drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)]">
                +<AnimatedNumber value={critBanner.amount} duration={650} />
              </div>
              {critBanner.subtitle && <div className="text-[12.5px] text-[#D3D8E8] mt-2">{critBanner.subtitle}</div>}
              <div className="pt-5 text-[11px] text-[#8B93AD] tracking-[0.3em]">轻触继续</div>
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
                  ? 'bg-gradient-to-r from-[#3A2A10]/95 to-[#1A1F33]/90 border border-[#E2BD72]/70 text-[#FFE7B0] !rounded-full font-bold shadow-[0_0_12px_rgba(226,189,114,0.3)]'
                  : 'bg-[#0A0F1F]/80 border border-white/15 text-[#EBE8E1] !rounded-full'
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
              className="panel-elevated w-full max-h-[82%] rounded-[12px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 text-sm text-[#F3F0E8]">
                  <GameIcon name="rank" size={28} />
                  <span className="font-editorial text-[17px] font-black tracking-[0.2em] gold-gradient-text">海城财富榜</span>
                </div>
                <button
                  onClick={() => {
                    playTap();
                    setShowLeaderboard(false);
                  }}
                  className="p-1 text-[#8E96B0] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto no-scrollbar p-3 space-y-1.5">
                {leaderboard.map((row, idx) => {
                  const medal = ['linear-gradient(180deg,#FFF0C8,#D6A85A)', 'linear-gradient(180deg,#F2F5FF,#9AA6C8)', 'linear-gradient(180deg,#F5C9A0,#A8693A)'][idx];
                  return (
                    <div key={row.userId} className={`rounded-[10px] px-3 py-2.5 flex items-center gap-3 ${idx === 0 ? 'panel-brass' : 'panel-arch'}`}>
                      <div
                        className={`w-8 h-8 shrink-0 flex items-center justify-center font-num text-[15px] font-semibold ${medal ? 'rotate-45 rounded-[6px] text-[#1E1506] shadow-[0_3px_8px_rgba(0,0,0,0.5)]' : 'text-[#8E96B0]'}`}
                        style={medal ? { background: medal } : undefined}
                      >
                        <span className={medal ? '-rotate-45' : ''}>{idx + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-editorial font-black text-[14px] text-[#FBF1D8] truncate">{row.nickname}</span>
                          <span className="px-1.5 rounded-sm text-[9.5px] text-[#F6DDA4] border border-[#E2BD72]/40 shrink-0">{row.tierName}</span>
                        </div>
                        <div className="text-[11px] text-[#8B93AD] mt-0.5 truncate">
                          {row.mainResidence} · {row.carName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-num text-[15px] text-[#FFE7B0]">
                          <AnimatedNumber value={row.netWorth} />
                        </div>
                        <div className="text-[10px] text-[#6F7896]">身价</div>
                      </div>
                    </div>
                  );
                })}
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
              className="panel-elevated w-full max-h-[82%] rounded-[12px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 text-sm text-[#F3F0E8]">
                  <GameIcon name="mail" size={28} />
                  <span className="font-editorial text-[17px] font-black tracking-[0.2em] gold-gradient-text">私人信箱</span>
                </div>
                <button
                  onClick={() => {
                    playTap();
                    setShowMail(false);
                  }}
                  className="p-1 text-[#8E96B0] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto no-scrollbar p-3 space-y-2">
                {state.mails?.length === 0 && (
                  <div className="flex flex-col items-center gap-2 text-xs text-[#8B93AD] py-10">
                    <GameIcon name="mail" size={56} className="opacity-50 grayscale" />
                    暂无来信
                  </div>
                )}
                {state.mails?.map((m: any) => (
                  <div key={m.id} className={`rounded-[10px] px-3 py-3 space-y-2 ${m.claimed ? 'panel-arch opacity-60' : 'panel-brass'}`}>
                    <div className="flex items-center gap-2">
                      <GameIcon name="mail" size={30} className={m.claimed ? 'grayscale' : ''} />
                      <span className="flex-1 min-w-0 text-[13.5px] font-editorial font-black text-[#FBF1D8] truncate">{m.title}</span>
                      <span className="text-[10px] text-[#7F88A6] shrink-0">{formatShortTime(m.created_at)}</span>
                    </div>
                    <p className="text-[12px] text-[#B4BBD0] leading-relaxed">{m.body}</p>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-3 font-num text-[12px]">
                        {m.cash > 0 && (<span className="flex items-center gap-0.5 text-[#FFE7B0]"><GameIcon name="cash" size={18} shadow={false} />{formatMoney(m.cash)}</span>)}
                        {m.sys_points > 0 && (<span className="flex items-center gap-0.5 text-[#B9F6FB]"><GameIcon name="syspoint" size={18} shadow={false} />+{m.sys_points}</span>)}
                        {m.energy > 0 && (<span className="flex items-center gap-0.5 text-[#F4EFE4]"><GameIcon name="energy" size={18} shadow={false} />+{m.energy}</span>)}
                      </div>
                      {m.claimed ? (
                        <span className="text-[11px] text-[#6F7896]">已领取</span>
                      ) : (
                        <button onClick={() => claimMail(m.id)} className="gold-btn-shimmer text-[12.5px] font-editorial px-4 py-1">
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
              className="panel-elevated w-full max-h-[86%] rounded-[12px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08]">
                <div className="flex items-center gap-2 font-semibold text-sm text-[#F6DDA4]">
                  <Shield className="w-4 h-4" /> 服主控制台
                </div>
                <button onClick={() => setShowAdmin(false)} className="p-1 text-[#8E96B0] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto no-scrollbar space-y-4 text-xs">
                <div className="panel-arch rounded-[6px] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#F3F0E8]">DeepSeek 对话接口</span>
                    <span className={adminData?.stats?.keyConfigured ? 'text-emerald-400' : 'text-[#E2BD72]'}>
                      {adminData?.stats?.keyConfigured ? '已接入' : '未配置 Key'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8B93AD]">
                    累计对话 {adminData?.stats?.totalMessages || 0} 条 · Tokens {adminData?.stats?.totalTokensUsed || 0}
                  </div>
                  <input
                    type="password"
                    placeholder="DeepSeek API Key (sk-...)"
                    value={gmKey}
                    onChange={(e) => setGmKey(e.target.value)}
                    className="w-full rounded-[4px] bg-[#0D1326] border border-white/12 px-3 py-2 text-xs text-white outline-none focus:border-[#E2BD72]/55"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={gmModel}
                      onChange={(e) => setGmModel(e.target.value)}
                      className="flex-1 rounded-[4px] bg-[#0D1326] border border-white/12 px-3 py-1.5 text-xs text-white outline-none focus:border-[#E2BD72]/55"
                    />
                    <button onClick={saveGmConfig} className="btn-brass px-3.5 py-1.5 rounded-[4px] text-xs">
                      保存
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={toggleCruiseEvent} className="game-action-tile rounded-[6px] p-3 text-left">
                    <div className="font-semibold text-[#F6DDA4]">限时游轮活动</div>
                    <div className="text-[11px] text-[#8B93AD] mt-0.5">
                      {adminData?.stats?.eventActive ? '开启中' : '已关闭'}
                    </div>
                  </button>
                  <button onClick={reloadContent} className="game-action-tile rounded-[6px] p-3 text-left">
                    <div className="font-semibold text-[#F3F0E8] flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 text-[#E2BD72]" /> 重载剧本配置
                    </div>
                    <div className="text-[11px] text-[#8B93AD] mt-0.5">免重启刷新 content/</div>
                  </button>
                </div>

                <div className="panel-arch rounded-[6px] p-3.5 space-y-2.5">
                  <div className="font-semibold text-[#F3F0E8]">全服发信</div>
                  <input
                    value={mailTitle}
                    onChange={(e) => setMailTitle(e.target.value)}
                    className="w-full rounded-[4px] bg-[#0D1326] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={mailCash}
                      onChange={(e) => setMailCash(e.target.value)}
                      placeholder="现金"
                      className="rounded-[4px] bg-[#0D1326] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
                    />
                    <input
                      type="number"
                      value={mailPts}
                      onChange={(e) => setMailPts(e.target.value)}
                      placeholder="积分"
                      className="rounded-[4px] bg-[#0D1326] border border-white/12 px-3 py-1.5 text-xs text-white outline-none"
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
                  className="w-full py-2.5 rounded-[4px] border border-[#FF4F72]/40 hover:bg-[#FF4F72]/10 text-[#E88CA1] text-xs font-medium flex items-center justify-center gap-1.5 transition"
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
