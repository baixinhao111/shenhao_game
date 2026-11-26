import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Brain,
  Camera,
  Gift,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Pin,
  Send,
  Sparkles,
  ThumbsUp,
  X,
} from 'lucide-react';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { PortraitAvatar } from '../components/PortraitAvatar';
import { apiRequest } from '../lib/api';
import { formatMoney, formatShortTime } from '../lib/format';
import { playSystemPing, playTap, playWeChatChime } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { GameIcon, iconSrc } from '../components/GameIcon';

const HEROINE_CARD_BG: Record<string, string> = {
  su_qingwan: '/assets/bg/bg_bund_penthouse.jpg',
  lin_wanxing: '/assets/bg/bg_campus_ginkgo.jpg',
  shen_liuli: '/assets/bg/bg_night_city.jpg',
  lu_zhiwei: '/assets/bg/bg_old_street.jpg',
};

export const HeroinesView: React.FC = () => {
  const {
    state,
    activeChatHeroineId,
    chatLocationOverride,
    pinnedCompanionId,
    setPinnedCompanionId,
    openHeroineChat,
    closeHeroineChat,
    applyServerState,
    notifyTop,
    showError,
  } = useGameStore();

  const [viewMode, setViewMode] = useState<'gallery' | 'moments'>('gallery');
  const [selectedId, setSelectedId] = useState<string>('su_qingwan');
  const [messages, setMessages] = useState<any[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [revealedThoughts, setRevealedThoughts] = useState<Record<number, boolean>>({});
  const [moments, setMoments] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeChatHeroineId) {
      apiRequest(`/heroines/${activeChatHeroineId}/chat`)
        .then((r) => {
          setMessages(r.messages || []);
          setMemories(r.memories || []);
        })
        .catch(() => {});
    }
  }, [activeChatHeroineId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (viewMode === 'moments') {
      apiRequest('/moments')
        .then((r) => setMoments(r.moments || []))
        .catch(() => {});
    }
  }, [viewMode]);

  if (!state) return null;
  const { heroines, gifts, timePeriod } = state;
  const protagonistSrc =
    (state.stories?.completedEpisodes?.length || 0) >= 2
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const sendGiftTo = async (heroineId: string, giftId: string) => {
    setSending(true);
    setShowGifts(false);
    try {
      const res = await apiRequest(`/heroines/${heroineId}/gift`, { body: { giftId } });
      applyServerState(res.state, res.critResult);
      playWeChatChime();
      const target = heroines.find((x: any) => x.id === heroineId);
      notifyTop('wechat', `${target?.name} 收下了礼物`, `好感 +${res.affectionGain}`);
      if (activeChatHeroineId === heroineId) {
        const reloaded = await apiRequest(`/heroines/${heroineId}/chat`);
        setMessages(reloaded.messages || []);
      }
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSending(false);
    }
  };

  // ==================== AUTHENTIC WECHAT PRIVATE CHAT (Zero AI/dev debug chrome!) ====================
  if (activeChatHeroineId) {
    const heroine = heroines.find((h: any) => h.id === activeChatHeroineId);
    if (!heroine) return null;

    const sendChat = async (customText?: string) => {
      const text = (customText ?? input).trim();
      if (!text || sending) return;
      if (!customText) setInput('');
      setSending(true);
      const optimisticId = Date.now();
      setMessages((prev) => [...prev, { id: optimisticId, role: 'user', content: text, created_at: Date.now() }]);

      try {
        const res = await apiRequest(`/heroines/${heroine.id}/chat`, {
          body: { message: text, overrideLocation: chatLocationOverride || undefined },
        });
        applyServerState(res.state);
        playWeChatChime();
        const reloaded = await apiRequest(`/heroines/${heroine.id}/chat`);
        setMessages(reloaded.messages || []);
        setMemories(reloaded.memories || []);
      } catch (e: any) {
        showError(e.message);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setSending(false);
      }
    };

    return (
      <div className="h-full flex flex-col bg-[#0D0E12]">
        <div className="shrink-0 bg-[#141C34] border-b border-white/[0.08] px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={closeHeroineChat} className="p-1 text-[#C6C9D2] hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <PortraitAvatar src={heroine.avatar} alt={heroine.name} className="w-9 h-9" rounded="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[#F5F2EA] truncate">{heroine.name}</span>
                <span className="text-[10px] text-[#E6A4B8]">{heroine.stage.name}</span>
              </div>
              <div className="text-[10px] text-[#8B93AD] truncate">
                {chatLocationOverride || heroine.location?.label}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                playTap();
                setShowMemories(!showMemories);
              }}
              className="p-2 text-[#B6B9C4] hover:text-[#F6DDA4] transition"
              title="共同记忆"
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                playTap();
                setShowGifts(!showGifts);
              }}
              className="px-2.5 py-1.5 rounded-[4px] border border-[#E2BD72]/40 bg-[#E2BD72]/10 text-[#F6DDA4] text-xs flex items-center gap-1"
            >
              <Gift className="w-3.5 h-3.5" /> 送礼
            </button>
          </div>
        </div>

        {showMemories && (
          <div className="shrink-0 bg-[#13141B] border-b border-white/[0.08] p-3.5 space-y-1.5">
            <div className="text-xs font-medium text-[#F6DDA4] flex items-center justify-between">
              <span>她记得的事</span>
              <button onClick={() => setShowMemories(false)} className="text-[#8B93AD]">
                收起
              </button>
            </div>
            {memories.length === 0 ? (
              <div className="text-[11px] text-[#8B93AD]">聊得久了，她会慢慢记下你们之间的细节。</div>
            ) : (
              memories.map((m: any) => (
                <div key={m.id} className="text-[11px] text-[#D7DAE3] leading-relaxed">
                  · {m.summary}
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-6 space-y-2.5">
              <div className="h-44 flex items-end justify-center">
                <img
                  src={heroine.portrait}
                  alt={heroine.name}
                  className="h-full w-auto object-contain object-bottom sprite-fade-bottom"
                />
              </div>
              <div className="text-xs text-[#B6B9C4]">你已添加 {heroine.name}，现在可以开始聊天了。</div>
            </div>
          )}

          {messages.map((m: any) => {
            const isUser = m.role === 'user';
            const thoughtOpen = revealedThoughts[m.id];

            return (
              <div key={m.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                <PortraitAvatar src={isUser ? protagonistSrc : heroine.avatar} alt="" className="w-9 h-9 mt-0.5" rounded="sm" />
                <div className={`max-w-[75%] space-y-1.5 ${isUser ? 'items-end flex flex-col' : ''}`}>
                  <div
                    className={`rounded-[6px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                      isUser ? 'bg-[#2B6B42] text-white' : 'bg-[#191B23] text-[#F3F0E8] border border-white/[0.06]'
                    }`}
                  >
                    {m.content}
                  </div>
                  {!isUser && m.inner_thought && (
                    <div className="pl-0.5">
                      <button
                        onClick={() => setRevealedThoughts((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className="text-[10px] text-[#E2BD72] flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> {thoughtOpen ? '收起' : '心声'}
                      </button>
                    </div>
                  )}
                  {!isUser && thoughtOpen && m.inner_thought && (
                    <div className="border-l-2 border-[#E2BD72]/60 pl-2.5 py-0.5 text-[11px] text-[#E5D3A8] italic">
                      「{m.inner_thought}」
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {sending && <div className="text-xs text-[#8B93AD] pl-11">对方正在输入…</div>}
          <div ref={chatEndRef} />
        </div>

        {showGifts && (
          <div className="shrink-0 bg-[#141C35] border-t border-white/[0.08] p-3.5 max-h-56 overflow-y-auto no-scrollbar space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#F6DDA4]">挑选礼物</span>
              <button onClick={() => setShowGifts(false)} className="text-[#8B93AD]">
                关闭
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gifts.map((g: any) => (
                <button
                  key={g.id}
                  disabled={sending}
                  onClick={() => sendGiftTo(heroine.id, g.id)}
                  className="text-left panel-arch rounded-[4px] p-2.5 hover:border-[#E2BD72]/40 transition"
                >
                  <div className="text-xs font-semibold text-[#F3F0E8] truncate">{g.name}</div>
                  <div className="text-[10.5px] text-[#E2BD72] tabular-nums mt-1">{formatMoney(g.price)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 bg-[#141C34] border-t border-white/[0.08] p-3 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {heroine.quickPrompts?.map((q: string, idx: number) => (
              <button
                key={idx}
                disabled={sending}
                onClick={() => sendChat(q)}
                className="shrink-0 text-[11px] px-3 py-1 rounded-[4px] bg-[#1A1C24] border border-white/[0.07] text-[#C8CBD4] hover:border-[#E2BD72]/35 transition"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`发消息给 ${heroine.name}…`}
              className="flex-1 rounded-[4px] bg-[#0D1326] border border-white/12 focus:border-[#E2BD72]/55 px-3.5 py-2 text-xs text-white outline-none"
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn-brass p-2.5 rounded-[4px] disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== MOMENTS FEED ====================
  if (viewMode === 'moments') {
    const toggleLike = async (momentId: number) => {
      try {
        await apiRequest(`/moments/${momentId}/like`, { method: 'POST' });
        const r = await apiRequest('/moments');
        setMoments(r.moments || []);
      } catch {}
    };

    return (
      <div className="h-full overflow-y-auto no-scrollbar bg-[#0B1122]">
        <div className="sticky top-0 z-20 bg-[#0B1122]/95 backdrop-blur-md border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              playTap();
              setViewMode('gallery');
            }}
            className="text-xs text-[#F6DDA4] flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 返回
          </button>
          <span className="font-editorial text-[16px] font-black gold-gradient-text tracking-wider">朋友圈</span>
          <span className="w-10" />
        </div>

        <div className="px-4 divide-y divide-white/[0.08]">
          {moments.map((m: any) => (
            <div key={m.id} className="py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <PortraitAvatar src={m.author_avatar || protagonistSrc} alt="" className="w-9 h-9" rounded="sm" />
                  <div>
                    <div className="text-xs font-semibold text-[#F5F2EA]">{m.author_name}</div>
                    <div className="text-[10px] text-[#8B93AD]">
                      {m.location} · {formatShortTime(m.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleLike(m.id)}
                  className={`px-2 py-1 text-[11px] flex items-center gap-1 transition ${
                    m.likedByPlayer ? 'text-[#E6829A]' : 'text-[#8B93AD]'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> {m.likes.length + (m.likedByPlayer ? 1 : 0)}
                </button>
              </div>
              <p className="text-[13px] text-[#EAE7E0] leading-relaxed">{m.content}</p>
              {m.comments?.length > 0 && (
                <div className="bg-[#131B33] border-l-2 border-white/12 px-3 py-2 space-y-1.5">
                  {m.comments.map((c: any, i: number) => (
                    <div key={i} className="text-xs leading-snug">
                      <span className="font-semibold text-[#E2BD72]">{c.author}：</span>
                      <span className="text-[#C6C9D2]">{c.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== FULL-SCREEN PORTRAIT GALLERY ====================
  const current = heroines.find((h: any) => h.id === selectedId) || heroines[0];
  const bgImg = HEROINE_CARD_BG[current.id] || '/assets/bg/bg_bund_penthouse.jpg';
  const isPinned = pinnedCompanionId === current.id;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0A0F1F] flex flex-col justify-between">
      <AmbientBackdrop
        src={bgImg}
        alt={current.name}
        timePeriod={timePeriod}
        imageClassName={`transition duration-500 ${current.unlocked ? 'brightness-[0.68]' : 'grayscale brightness-[0.35]'}`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/58 via-transparent to-[#0A0F1F] pointer-events-none" />

      {/* Top Selector Strip */}
      <div className="relative z-20 px-3.5 pt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          {heroines.map((h: any) => {
            const active = h.id === current.id;
            return (
              <button
                key={h.id}
                onClick={() => {
                  playTap();
                  setSelectedId(h.id);
                }}
                className={`relative rounded-full p-[2px] transition shrink-0 ${
                  active
                    ? 'bg-gradient-to-b from-[#FFE7B0] to-[#B7843A] scale-110 shadow-[0_0_12px_rgba(255,220,150,0.55)]'
                    : 'bg-white/20 opacity-70 hover:opacity-100'
                }`}
              >
                <PortraitAvatar
                  src={h.avatar}
                  alt={h.name}
                  className={`w-10 h-10 !border-0 ${!h.unlocked ? 'grayscale brightness-50' : ''}`}
                  rounded="full"
                />
                {!h.unlocked && <GameIcon name="lock" size={18} className="absolute -bottom-1 -right-1" />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[11px]">
          {current.unlocked && (
            <button
              onClick={() => {
                playSystemPing();
                setPinnedCompanionId(current.id);
                notifyTop('system', '主页人物已切换', `${current.name}已驻留主页`);
              }}
              className={`icon-entry ${isPinned ? '' : 'opacity-85'}`}
            >
              <img src={iconSrc('nav_home')} alt="" className="!w-[34px] !h-[34px]" />
              <span className="lbl">{isPinned ? '已驻留' : '驻主页'}</span>
            </button>
          )}
          <button
            onClick={() => {
              playTap();
              setViewMode('moments');
            }}
            className="icon-entry"
          >
            <img src={iconSrc('moments')} alt="" className="!w-[34px] !h-[34px]" />
            <span className="lbl">朋友圈</span>
          </button>
        </div>
      </div>

      {/* Standing Character Stage */}
      <div className="absolute inset-x-0 top-14 bottom-12 z-10 flex items-end justify-center px-4 pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.img
            key={current.id}
            src={current.portrait}
            alt={current.name}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28 }}
            className={`h-full max-h-[90%] max-w-[94%] w-auto object-contain object-bottom sprite-fade-bottom animate-breathe drop-shadow-[0_18px_38px_rgba(0,0,0,0.85)] ${
              !current.unlocked ? 'brightness-[0.38] grayscale-[0.3]' : ''
            }`}
          />
        </AnimatePresence>
      </div>

      {/* Editorial Bottom Profile & Actions */}
      <div className="relative z-20 px-4 pb-5 pt-20 bg-gradient-to-t from-[#0A0F1F] via-[#0A0F1F]/95 to-transparent space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-editorial text-[32px] font-black gold-gradient-text leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                {current.name}
              </h2>
              <span className="px-1.5 py-[1px] rounded-sm border border-[#E2BD72]/50 bg-black/40 text-[10.5px] text-[#F6DDA4]">
                {current.archetype}
              </span>
            </div>
            <div className="text-xs text-[#B4BBD0] mt-1.5">
              {current.age}岁 · {current.title}
            </div>
          </div>
          {current.unlocked && (
            <div className="flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-[#2A0F1E]/80 border border-[#F0789A]/50">
              <GameIcon name="heart" size={30} />
              <div className="leading-tight">
                <div className="text-[11px] font-bold text-[#FFB3C6]">{current.stage.name}</div>
                <div className="font-num text-[12px] text-[#FBE3EA]">{current.affection}</div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs">
          {current.unlocked ? (
            <div className="text-[#C8CBD5] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#E2BD72] shrink-0" />
              <span className="truncate">{current.location?.label}</span>
            </div>
          ) : (
            <div className="text-[#F6DDA4] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" /> {current.unlockHint}
            </div>
          )}
          <div className="text-[11px] text-[#8B93AD]">{current.synergyDesc}</div>
        </div>

        {current.unlocked && (
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => openHeroineChat(current.id)}
              className="gold-btn-shimmer py-2 text-[14px] font-editorial flex items-center justify-center gap-1.5"
            >
              <GameIcon name="nav_contact" size={26} shadow={false} /> 发微信
            </button>
            <button
              onClick={() => {
                playTap();
                setShowGifts(true);
              }}
              className="btn-navy py-2 text-[14px] font-editorial flex items-center justify-center gap-1.5"
            >
              <GameIcon name="mall" size={26} shadow={false} /> 送礼物
            </button>
          </div>
        )}
      </div>

      {/* Gift Sheet */}
      <AnimatePresence>
        {showGifts && current.unlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGifts(false)}
            className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end p-3"
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative panel-elevated w-full rounded-[12px] p-4 space-y-3 max-h-[65%] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <span className="font-editorial text-[16px] font-black gold-gradient-text">送给 {current.name}</span>
                <button onClick={() => setShowGifts(false)} className="text-[#8B93AD] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {gifts.map((g: any) => (
                  <button
                    key={g.id}
                    disabled={sending}
                    onClick={() => sendGiftTo(current.id, g.id)}
                    className="text-left panel-arch rounded-[8px] p-2.5 flex items-center gap-2 hover:border-[#E2BD72]/50 transition active:scale-95"
                  >
                    <GameIcon name="mall" size={30} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-[#FBF1D8] truncate">{g.name}</div>
                      <div className="font-num text-[11.5px] text-[#FFE7B0] mt-0.5">{formatMoney(g.price)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
