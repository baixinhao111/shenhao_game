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
import { Atmosphere } from '../components/Atmosphere';

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
    openMiniStory,
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
  const [showBonds, setShowBonds] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [revealedThoughts, setRevealedThoughts] = useState<Record<number, boolean>>({});
  const [moments, setMoments] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowGifts(false);
    setShowMemories(false);
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
  const completedEps: string[] = state.stories?.completedEpisodes || [];
  const protagonistSrc =
    completedEps.includes('ep_003') || completedEps.length >= 3
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

  const handleEquipOutfit = async (heroineId: string, outfit: any) => {
    if (!outfit.unlocked) {
      showError(`需完成对应羁绊剧情解锁「${outfit.name}」`);
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      const res = await apiRequest(`/heroines/${heroineId}/outfit`, { body: { outfitId: outfit.id } });
      applyServerState(res.state);
      playSystemPing();
      notifyTop('wechat', '装扮已更换', res.message);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleStartBond = async (bond: any) => {
    if (sending) return;
    setSending(true);
    try {
      const res = await apiRequest('/heroines/bond/start', { body: { bondId: bond.id } });
      const sc = res.script;
      playSystemPing();
      setShowBonds(false);
      openMiniStory({
        mode: 'bond',
        bondId: sc.bondId || bond.id,
        title: sc.title,
        subtitle: sc.subtitle,
        sceneLabel: sc.sceneLabel,
        bg: sc.bg,
        nodes: sc.nodes || [],
        heroineId: sc.heroineId,
        heroineName: sc.heroineName,
        heroineAvatar: sc.heroineAvatar,
        heroinePortrait: sc.heroinePortrait,
        unlockOutfit: sc.unlockOutfit,
        alreadyCompleted: Boolean(sc.alreadyCompleted),
      });
    } catch (e: any) {
      showError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleStartShura = async () => {
    if (!state.shuraEvent || sending) return;
    setSending(true);
    try {
      const res = await apiRequest('/heroines/shura/start', { body: { eventId: state.shuraEvent.id } });
      const sc = res.script;
      playSystemPing();
      openMiniStory({
        mode: 'shura',
        eventId: sc.eventId || state.shuraEvent.id,
        title: sc.title,
        subtitle: sc.subtitle,
        sceneLabel: sc.sceneLabel,
        bg: sc.bg,
        nodes: sc.nodes || [],
        heroineId: sc.heroineId,
        heroineIds: sc.heroineIds,
        heroineName: sc.heroineName,
        heroineAvatar: sc.heroineAvatar,
      });
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
      <div className="relative h-full flex flex-col deco-texture">
        <img src={heroine.portrait} alt="" className="absolute right-[-30%] bottom-0 h-[70%] w-auto object-contain opacity-[0.12] pointer-events-none select-none" />
        <div className="relative shrink-0 px-3 py-2 flex items-center justify-between gap-2" style={{ background: 'linear-gradient(180deg, rgba(14,16,24,0.98), rgba(11,16,33,0.98))' }}>
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#D9C49A]/55 to-transparent" />
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={closeHeroineChat} aria-label="返回" className="p-1 text-[#C6C9D2] hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="relative w-10 h-10 rounded-full p-[2px] bg-gradient-to-b from-[#FFB3C6] to-[#C24E74] shrink-0">
              <PortraitAvatar src={heroine.avatar} alt={heroine.name} className="w-full h-full !border-0" rounded="full" />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#3FD69A] border-2 border-[#05070D]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-editorial font-black text-[#ECE6DA] truncate">{heroine.name}</span>
                <span className="px-1.5 rounded-sm bg-gradient-to-r from-[#F0789A] to-[#C24E74] text-[10.5px] font-bold text-white">{heroine.stage.name}</span>
              </div>
              <div className="text-[10px] text-[#8C90A0] truncate">
                {chatLocationOverride || heroine.location?.label}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                playTap();
                setShowGifts(false);
                setShowMemories((v) => !v);
              }}
              className="p-2 text-[#B6B9C4] hover:text-[#E2D3B0] transition"
              title="共同记忆"
              aria-label="共同记忆"
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                playTap();
                setShowMemories(false);
                setShowGifts((v) => !v);
              }}
              className="btn-navy !rounded-full pl-1 pr-3 py-0.5 text-[12px] flex items-center gap-0.5"
            >
              <GameIcon name="mall" size={24} shadow={false} /> 送礼
            </button>
          </div>
        </div>

        {showMemories && (
          <div className="relative shrink-0 m-2.5 rounded-[10px] panel-elevated p-3.5 space-y-1.5">
            <div className="text-xs font-medium text-[#E2D3B0] flex items-center justify-between">
              <span>她记得的事</span>
              <button onClick={() => setShowMemories(false)} className="text-[#8C90A0]">
                收起
              </button>
            </div>
            {memories.length === 0 ? (
              <div className="text-[11px] text-[#8C90A0]">聊得久了，她会慢慢记下你们之间的细节。</div>
            ) : (
              memories.map((m: any) => (
                <div key={m.id} className="text-[11px] text-[#D7DAE3] leading-relaxed">
                  · {m.summary}
                </div>
              ))
            )}
          </div>
        )}

        <div className="relative flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-6 space-y-2.5">
              <div className="h-44 flex items-end justify-center">
                <img
                  src={heroine.portrait}
                  alt={heroine.name}
                  className="h-full w-auto object-contain object-bottom sprite-fade-bottom"
                />
              </div>
              <div className="inline-block px-3 py-1 rounded-full bg-[#05070D]/70 border border-white/10 text-[11.5px] text-[#B6B9C4]">你已添加 {heroine.name}，现在可以开始聊天了</div>
            </div>
          )}

          {messages.map((m: any) => {
            const isUser = m.role === 'user';
            const thoughtOpen = revealedThoughts[m.id];

            return (
              <div key={m.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`w-9 h-9 mt-0.5 rounded-full p-[1.5px] shrink-0 ${isUser ? 'bg-gradient-to-b from-[#EADBB8] to-[#8A7650]' : 'bg-gradient-to-b from-[#FFB3C6] to-[#C24E74]'}`}>
                  <PortraitAvatar src={isUser ? protagonistSrc : heroine.avatar} alt="" className="w-full h-full !border-0" rounded="full" />
                </div>
                <div className={`max-w-[75%] space-y-1.5 ${isUser ? 'items-end flex flex-col' : ''}`}>
                  <div
                    className={`px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${
                      isUser
                        ? 'rounded-[14px] rounded-tr-[4px] bg-gradient-to-b from-[#EEE2C6] to-[#DDB067] text-[#2A1C06] border border-[#FFF3D2]'
                        : 'rounded-[14px] rounded-tl-[4px] bg-[#16203F]/95 text-[#ECE6DA] border border-[#F0789A]/35'
                    }`}
                  >
                    {m.content}
                  </div>
                  {!isUser && m.inner_thought && (
                    <div className="pl-0.5">
                      <button
                        onClick={() => setRevealedThoughts((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className="text-[10.5px] font-bold text-[#FFB3C6] flex items-center gap-0.5"
                      >
                        <GameIcon name="heart" size={14} shadow={false} /> {thoughtOpen ? '收起' : '心声'}
                      </button>
                    </div>
                  )}
                  {!isUser && thoughtOpen && m.inner_thought && (
                    <div className="rounded-[10px] px-2.5 py-1.5 bg-[#3A1428]/80 border border-[#F0789A]/40 text-[11.5px] text-[#FBE3EA] italic">
                      「{m.inner_thought}」
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {sending && (
            <div className="pl-11 flex items-center gap-1 text-[11px] text-[#FFB3C6]">
              {[0, 1, 2].map((k) => (
                <motion.span key={k} className="w-1.5 h-1.5 rounded-full bg-[#F0789A]" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: k * 0.15 }} />
              ))}
              <span className="ml-1">对方正在输入</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {showGifts && (
          <div className="relative shrink-0 panel-elevated rounded-t-[14px] p-3.5 max-h-56 overflow-y-auto no-scrollbar space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#E2D3B0]">挑选礼物</span>
              <button onClick={() => setShowGifts(false)} className="text-[#8C90A0]">
                关闭
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gifts.map((g: any) => (
                <button
                  key={g.id}
                  disabled={sending}
                  onClick={() => sendGiftTo(heroine.id, g.id)}
                  className="text-left panel-arch rounded-[8px] p-2 flex items-center gap-2 hover:border-[#D9C49A]/50 transition active:scale-95"
                >
                  <GameIcon name="mall" size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-bold text-[#ECE6DA] leading-tight line-clamp-2">{g.name}</div>
                    <div className="font-num text-[11px] text-[#EADBB8] mt-0.5">{formatMoney(g.price)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2" style={{ background: 'linear-gradient(180deg, rgba(14,16,24,0.98), rgba(9,13,28,0.99))' }}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D9C49A]/55 to-transparent" />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {heroine.quickPrompts?.map((q: string, idx: number) => (
              <button
                key={idx}
                disabled={sending}
                onClick={() => sendChat(q)}
                className="shrink-0 text-[11.5px] px-3 py-1 rounded-full bg-[#05070D]/80 border border-[#D9C49A]/35 text-[#E2D3B0] hover:border-[#D9C49A] transition active:scale-95"
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
              className="flex-1 rounded-full bg-[#06080E]/90 border border-[#D9C49A]/30 focus:border-[#D9C49A]/70 px-4 py-2.5 text-[13px] text-white outline-none shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]"
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn-brass !rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-40">
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
      <div className="relative h-full overflow-y-auto no-scrollbar deco-texture">
        <Atmosphere />
        <div className="sticky top-0 z-20 bg-[#05070D]/90 backdrop-blur-md border-b border-[#D9C49A]/25 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              playTap();
              setViewMode('gallery');
            }}
            className="text-xs text-[#E2D3B0] flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 返回
          </button>
          <span className="font-editorial text-[16px] font-black gold-gradient-text tracking-wider">朋友圈</span>
          <span className="w-10" />
        </div>

        <div className="relative h-[170px] mb-8">
          <img src="/assets/bg/bg_bund_penthouse.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-transparent to-transparent" />
          <div className="absolute right-4 -bottom-6 flex items-end gap-3">
            <span className="mb-7 font-editorial text-[17px] font-black text-[#ECE6DA] text-stroke-dark">{state?.user?.nickname}</span>
            <div className="w-16 h-16 rounded-[10px] p-[2px] bg-gradient-to-b from-[#EADBB8] to-[#8A7650] shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
              <PortraitAvatar src={protagonistSrc} alt="" className="w-full h-full !border-0 !rounded-[8px]" rounded="sm" />
            </div>
          </div>
        </div>

        <div className="px-3 pb-6 space-y-2.5">
          {moments.map((m: any) => (
            <div key={m.id} className="panel-arch rounded-[12px] px-3.5 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full p-[1.5px] bg-gradient-to-b from-[#EADBB8] to-[#8A7650] shrink-0">
                    <PortraitAvatar src={m.author_avatar || protagonistSrc} alt="" className="w-full h-full !border-0" rounded="full" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-editorial font-black text-[#ECE6DA]">{m.author_name}</div>
                    <div className="text-[10px] text-[#8C90A0]">
                      {m.location} · {formatShortTime(m.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleLike(m.id)}
                  className={`pl-1 pr-2.5 py-0.5 rounded-full text-[12px] font-num flex items-center gap-0.5 border transition active:scale-90 ${
                    m.likedByPlayer ? 'text-[#FFB3C6] border-[#F0789A]/60 bg-[#3A1428]/60' : 'text-[#8C90A0] border-white/12'
                  }`}
                >
                  <GameIcon name="heart" size={20} shadow={false} className={m.likedByPlayer ? '' : 'grayscale opacity-60'} />
                  {(m.likes || []).filter((n: string) => n !== state?.user?.nickname).length + (m.likedByPlayer ? 1 : 0)}
                </button>
              </div>
              <p className="text-[13.5px] text-[#EAE7E0] leading-relaxed">{m.content}</p>
              {m.comments?.length > 0 && (
                <div className="rounded-[8px] bg-[#06080E]/70 border border-white/[0.06] px-3 py-2 space-y-1.5">
                  {m.comments.map((c: any, i: number) => (
                    <div key={i} className="text-xs leading-snug">
                      <span className="font-bold text-[#FFB3C6]">{c.author}：</span>
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
    <div className="relative h-full w-full overflow-hidden bg-[#05070D] flex flex-col justify-between">
      <AmbientBackdrop
        src={bgImg}
        alt={current.name}
        timePeriod={timePeriod}
        imageClassName={`transition duration-500 ${current.unlocked ? 'brightness-[0.68]' : 'grayscale brightness-[0.35]'}`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/58 via-transparent to-[#05070D] pointer-events-none" />

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
                    ? 'bg-gradient-to-b from-[#EADBB8] to-[#9C8660] scale-110 shadow-[0_0_12px_rgba(255,220,150,0.55)]'
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
                {h.unlocked && h.hasAvailableBond && <span className="red-dot -top-0.5 -right-0.5" />}
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
            key={`${current.id}:${current.equippedOutfit || 'default'}`}
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
      <div className="relative z-20 px-4 pb-5 pt-20 bg-gradient-to-t from-[#05070D] via-[#05070D]/95 to-transparent space-y-2.5">
        {/* Shura-field Crisis Banner (docked cleanly below standing face/shoulders) */}
        {state.shuraEvent && (
          <button
            disabled={sending}
            onClick={() => void handleStartShura()}
            className="w-full rounded-full pl-1.5 pr-3 py-1 bg-[#2D0E20]/90 border border-[#F0789A]/65 shadow-[0_0_18px_rgba(240,120,154,0.3)] backdrop-blur-md flex items-center gap-2 text-left active:scale-[0.98] transition"
          >
            <GameIcon name="heart" size={22} className="animate-pulse" />
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-[#FFC4D3] truncate">
                修罗场 · {state.shuraEvent.title}
              </span>
              <span className="text-[10px] text-[#E8A4B8]/85 truncate hidden sm:inline">· {state.shuraEvent.reason}</span>
            </div>
            <span className="text-[11px] font-editorial font-bold text-[#EADBB8] shrink-0">化解 ›</span>
          </button>
        )}

        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-editorial text-[32px] font-black gold-gradient-text leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                {current.name}
              </h2>
              <span className="px-1.5 py-[1px] rounded-sm border border-[#D9C49A]/50 bg-black/40 text-[10.5px] text-[#E2D3B0]">
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
              <MapPin className="w-3.5 h-3.5 text-[#D9C49A] shrink-0" />
              <span className="truncate">{current.location?.label}</span>
            </div>
          ) : (
            <div className="text-[#E2D3B0] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" /> {current.unlockHint}
            </div>
          )}
          <div className="text-[11px] text-[#8C90A0]">{current.synergyDesc}</div>
        </div>

        {current.unlocked && Array.isArray(current.outfits) && current.outfits.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            {current.outfits.map((o: any) => {
              const active = o.id === (current.equippedOutfit || 'default');
              return (
                <button
                  key={o.id}
                  disabled={sending}
                  onClick={() => void handleEquipOutfit(current.id, o)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-medium border flex items-center gap-1 transition active:scale-95 ${
                    active
                      ? 'bg-[#3B172B]/90 border-[#F0789A] text-[#FFD3DF] shadow-[0_0_10px_rgba(240,120,154,0.3)]'
                      : o.unlocked
                        ? 'bg-[#0C1329]/80 border-[#D9C49A]/35 text-[#E5DFD0] hover:border-[#D9C49A]'
                        : 'bg-[#05070D]/65 border-white/10 text-[#7B839E]'
                  }`}
                >
                  {!o.unlocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                  <span>{o.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {current.unlocked && (
          <div className="grid grid-cols-[1.15fr_0.95fr_0.9fr] gap-2 pt-0.5">
            <button
              onClick={() => openHeroineChat(current.id)}
              className="gold-btn-shimmer py-2 text-[13.5px] font-editorial flex items-center justify-center gap-1"
            >
              <GameIcon name="nav_contact" size={24} shadow={false} /> 发微信
            </button>
            <button
              onClick={() => {
                playTap();
                setShowBonds(true);
              }}
              className="relative btn-navy py-2 text-[13.5px] font-editorial flex items-center justify-center gap-1"
            >
              <GameIcon name="heart" size={22} shadow={false} /> 羁绊
              {current.hasAvailableBond && <span className="red-dot -top-0.5 -right-0.5" />}
            </button>
            <button
              onClick={() => {
                playTap();
                setShowGifts(true);
              }}
              className="btn-navy py-2 text-[13.5px] font-editorial flex items-center justify-center gap-1"
            >
              <GameIcon name="mall" size={22} shadow={false} /> 送礼
            </button>
          </div>
        )}
      </div>

      {/* Bond Milestone Drawer */}
      <AnimatePresence>
        {showBonds && current.unlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBonds(false)}
            className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end p-3"
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative panel-elevated w-full rounded-[12px] p-4 space-y-3 max-h-[72%] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div>
                  <span className="font-editorial text-[16px] font-black gold-gradient-text">{current.name} · 专属羁绊</span>
                  <div className="text-[10.5px] text-[#858999] mt-0.5">当前好感 {current.affection} · 突破解锁新装扮与永久身价加成</div>
                </div>
                <button onClick={() => setShowBonds(false)} className="text-[#8C90A0] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {(current.bonds || []).length === 0 ? (
                  <div className="text-center text-xs text-[#8C90A0] py-6">专属羁绊剧情筹备中</div>
                ) : (
                  (current.bonds || []).map((b: any) => {
                    const outfitLabel = b.unlockOutfit
                      ? (current.outfits || []).find((o: any) => o.id === b.unlockOutfit)?.name || b.unlockOutfit
                      : null;
                    const locked = !b.completed && !b.available;
                    return (
                      <div
                        key={b.id}
                        className={`rounded-[10px] p-3 flex items-center gap-3 ${
                          b.available ? 'panel-brass' : 'panel-arch'
                        } ${locked ? 'opacity-65' : ''}`}
                      >
                        <div className="shrink-0 w-10 h-10 rounded-full bg-[#2A0F1E]/85 border border-[#F0789A]/50 flex flex-col items-center justify-center">
                          <span className="font-num text-[12px] font-bold text-[#FFB3C6]">Lv.{b.stageLevel}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-editorial font-black text-[#ECE6DA] truncate">{b.title}</div>
                          <div className="text-[11px] text-[#8C90A0] line-clamp-1 mt-0.5">{b.subtitle}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                            {outfitLabel && (
                              <span className="px-1.5 py-[1px] rounded-sm bg-[#3A1428]/80 border border-[#F0789A]/45 text-[#FFC4D3]">
                                解锁「{outfitLabel}」
                              </span>
                            )}
                            {b.stageLevel >= 6 && (
                              <span className="px-1.5 py-[1px] rounded-sm bg-[#241B0B]/85 border border-[#D9C49A]/45 text-[#EADBB8]">
                                永久身价 +3%
                              </span>
                            )}
                            {locked && <span className="text-[#8C90A0]">需好感 {b.minAffection}</span>}
                          </div>
                        </div>
                        <button
                          disabled={sending || locked}
                          onClick={() => void handleStartBond(b)}
                          className={`shrink-0 px-3 py-1.5 text-[12px] font-editorial ${
                            b.available ? 'gold-btn-shimmer' : b.completed ? 'btn-navy' : 'btn-navy opacity-45'
                          }`}
                        >
                          {b.available ? '开启' : b.completed ? '重温' : '未解锁'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <button onClick={() => setShowGifts(false)} className="text-[#8C90A0] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {gifts.map((g: any) => (
                  <button
                    key={g.id}
                    disabled={sending}
                    onClick={() => sendGiftTo(current.id, g.id)}
                    className="text-left panel-arch rounded-[8px] p-2.5 flex items-center gap-2 hover:border-[#D9C49A]/50 transition active:scale-95"
                  >
                    <GameIcon name="mall" size={30} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-[#ECE6DA] truncate">{g.name}</div>
                      <div className="font-num text-[11.5px] text-[#EADBB8] mt-0.5">{formatMoney(g.price)}</div>
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
