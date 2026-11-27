import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import type { VNChoiceOption, VNNode } from '../../store/useGameStore';
import { GameIcon } from '../GameIcon';
import { PortraitAvatar } from '../PortraitAvatar';

/**
 * 天枢系统在剧情里的三种出场方式（全部居中、全息面板风格）：
 *  - SystemAlertPanel   剧情中的 system_alert：「叮」一声后面板从中线展开
 *  - SystemChoicePanel  system_choice：系统给出抉择
 *  - TianshuStatusPanel 玩家随时点右上「天枢」唤出的宿主面板
 * 冰蓝只属于天枢；到账/暴击类提示用金色强调。
 */

/** Highlight 【】 entities and money/number figures inside system copy. */
export function renderSysText(text: string, tone: 'cyan' | 'gold' = 'cyan'): React.ReactNode[] {
  const parts = text.split(/(【[^】]*】|¥\s?[\d,.]+\s?[万亿]?\+?|[\d,]+(?:\.\d+)?\s?(?:元|万|亿|%|×|倍)|\d+×)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('【')) {
      return (
        <span key={i} className={tone === 'gold' ? 'text-[#FFE7B0] font-bold' : 'text-white font-bold'}>
          {p}
        </span>
      );
    }
    if (i % 2 === 1) {
      return (
        <span key={i} className="font-num text-[#FFE7B0] tracking-wide">
          {p}
        </span>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const isRewardAlert = (n: VNNode | null) =>
  !!n && (n.effect === 'impact' || /到账|入账|暴击|返现|回款|积分 \+/.test(`${n.title || ''}${n.text || ''}`));

/** Four L-shaped corner brackets. */
const HoloCorners: React.FC<{ color: string }> = ({ color }) => (
  <>
    {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
      <span
        key={c}
        className="absolute w-4 h-4 pointer-events-none"
        style={{
          [c[0] === 't' ? 'top' : 'bottom']: -1,
          [c[1] === 'l' ? 'left' : 'right']: -1,
          borderColor: color,
          borderStyle: 'solid',
          borderWidth: 0,
          [c[0] === 't' ? 'borderTopWidth' : 'borderBottomWidth']: 2,
          [c[1] === 'l' ? 'borderLeftWidth' : 'borderRightWidth']: 2,
        }}
      />
    ))}
  </>
);

const HoloFrame: React.FC<{ gold?: boolean; className?: string; children: React.ReactNode }> = ({ gold, className = '', children }) => (
  <div className={`holo-panel ${gold ? 'holo-gold' : ''} ${className}`}>
    <div className="holo-scan" aria-hidden />
    <HoloCorners color={gold ? '#FFE7B0' : '#9AF4FB'} />
    {children}
  </div>
);

const HoloHeader: React.FC<{ kicker: string; title?: string; gold?: boolean; onClose?: () => void }> = ({ kicker, title, gold, onClose }) => (
  <div className="relative flex items-center gap-2.5 pb-2.5 mb-3 border-b border-[var(--holo-line)]">
    <div className="relative shrink-0">
      <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: gold ? '#E2BD72' : '#63E6F2' }} />
      <GameIcon name="tianshu" size={30} shadow={false} />
    </div>
    <div className="min-w-0 flex-1">
      <div className={`text-[10px] tracking-[0.45em] font-bold ${gold ? 'text-[#E2BD72]' : 'text-[#63E6F2]'}`}>{kicker}</div>
      {title && (
        <div className={`text-[14.5px] font-black tracking-[0.08em] leading-snug mt-0.5 ${gold ? 'gold-gradient-text' : 'cyan-glow-text'}`}>
          {title}
        </div>
      )}
    </div>
    {onClose && (
      <button onClick={onClose} className="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center text-[#9AF4FB]/80 active:opacity-60" aria-label="关闭">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

const unfold = {
  initial: { opacity: 0, scaleY: 0.02, scaleX: 0.7 },
  animate: { opacity: 1, scaleY: 1, scaleX: 1 },
  exit: { opacity: 0, scaleY: 0.02, scaleX: 0.9 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as any },
};

/** Ripple + 「叮」 glyph that plays as the panel opens. */
const DingBurst: React.FC<{ gold?: boolean }> = ({ gold }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    {[0, 0.12].map((d) => (
      <motion.span
        key={d}
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 3.2, opacity: 0 }}
        transition={{ duration: 0.75, delay: d, ease: 'easeOut' }}
        className="absolute w-28 h-28 rounded-full"
        style={{ border: `2px solid ${gold ? 'rgba(255,231,176,0.8)' : 'rgba(99,230,242,0.8)'}` }}
      />
    ))}
  </div>
);

interface AlertProps {
  node: VNNode;
  typed: string;
  isTyping: boolean;
  onTap: () => void;
}

export const SystemAlertPanel: React.FC<AlertProps> = ({ node, typed, isTyping, onTap }) => {
  const gold = isRewardAlert(node);
  return (
    <motion.div
      key="sys-alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onTap}
      className="absolute inset-0 z-[35] flex items-center justify-center px-5 pt-16 pb-6 cursor-pointer"
      style={{ background: 'radial-gradient(80% 60% at 50% 48%, rgba(4,20,34,0.55), rgba(2,6,14,0.82))' }}
    >
      <DingBurst gold={gold} />
      <motion.div {...unfold} className="relative w-full max-w-[360px] origin-center">
        <motion.div
          initial={{ opacity: 0, scale: 1.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08, type: 'spring', stiffness: 420, damping: 16 }}
          className={`absolute -top-[52px] inset-x-0 text-center font-editorial font-black text-[34px] leading-none pointer-events-none ${
            gold ? 'gold-gradient-text' : 'cyan-glow-text'
          }`}
          style={{ filter: `drop-shadow(0 0 12px ${gold ? 'rgba(255,220,150,0.6)' : 'rgba(99,230,242,0.7)'})` }}
        >
          叮！
        </motion.div>
        <HoloFrame gold={gold} className="px-4 pt-3.5 pb-3">
          <HoloHeader kicker={gold ? '天枢 · 到账通知' : '天枢 · 系统提示'} title={node.title || '天枢系统'} gold={gold} />
          <p className="relative text-[14.5px] leading-[1.85] text-[#DDFBFF] whitespace-pre-line min-h-[78px]">
            {renderSysText(typed, gold ? 'gold' : 'cyan')}
            {isTyping && <span className="inline-block w-[7px] h-[14px] ml-0.5 align-middle bg-[#63E6F2]/80 animate-pulse" />}
          </p>
          <div className="relative mt-3 flex items-center justify-between text-[10px] tracking-[0.3em]">
            <span className="text-[#63E6F2]/50 font-num">TIANSHU · NODE 01</span>
            <motion.span
              animate={{ opacity: isTyping ? 0 : [0.35, 1, 0.35] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className={gold ? 'text-[#FFE7B0]' : 'text-[#9AF4FB]'}
            >
              轻触确认
            </motion.span>
          </div>
        </HoloFrame>
      </motion.div>
    </motion.div>
  );
};

interface ChoiceProps {
  node: VNNode;
  disabled: boolean;
  isUnaffordable: (opt: VNChoiceOption) => boolean;
  onChoose: (opt: VNChoiceOption) => void;
}

export const SystemChoicePanel: React.FC<ChoiceProps> = ({ node, disabled, isUnaffordable, onChoose }) => (
  <motion.div
    key="sys-choice"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    className="absolute inset-0 z-[35] flex items-center justify-center px-4 pt-16 pb-6"
    style={{ background: 'radial-gradient(80% 60% at 50% 50%, rgba(4,20,34,0.5), rgba(2,6,14,0.84))' }}
  >
    <DingBurst />
    <motion.div {...unfold} className="relative w-full max-w-[370px] max-h-full origin-center">
      <HoloFrame className="px-4 pt-3.5 pb-4 max-h-full flex flex-col">
        <HoloHeader kicker="天枢 · 请宿主抉择" title={node.title} />
        <div className="relative space-y-2.5 overflow-y-auto no-scrollbar max-h-[60vh] pr-0.5">
          {(node.options || []).map((opt, idx) => {
            const poor = isUnaffordable(opt);
            const cashCost = opt.cost?.cash ?? opt.cashCost ?? 0;
            return (
              <motion.button
                key={opt.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.22 + idx * 0.08, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onChoose(opt);
                }}
                className={`holo-option w-full text-left flex items-start gap-3 ${poor ? 'opacity-55' : ''}`}
              >
                <span className="holo-option-key">{String.fromCharCode(65 + idx)}</span>
                <span className="flex-1 min-w-0 pt-[1px]">
                  <span className="block text-[14px] font-editorial font-bold text-[#F4FDFF] leading-[1.6]">{opt.label}</span>
                  {poor && (
                    <span className="block text-[10.5px] text-[#FF8FA6] mt-0.5">
                      资金不足{cashCost > 0 ? `（需 ${formatMoney(cashCost)}，可点左上返回筹款）` : ''}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>
      </HoloFrame>
    </motion.div>
  </motion.div>
);

interface StatusProps {
  state: any;
  chapterLabel: string;
  progress: { at: number; total: number };
  choicesMade: number;
  focus: { name: string; role?: string; speaker?: string; hasThought: boolean } | null;
  logs: { title: string; text: string }[];
  onReadThought: () => void;
  onClose: () => void;
}

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-[#F4FDFF]' }) => (
  <div className="rounded-[6px] px-2.5 py-2 bg-[#041826]/70 border border-[var(--holo-line)]">
    <div className="text-[9.5px] tracking-[0.3em] text-[#63E6F2]/70">{label}</div>
    <div className={`font-num text-[15px] mt-0.5 leading-none ${tone}`}>{value}</div>
  </div>
);

const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="h-[5px] rounded-full bg-[#06222F] overflow-hidden">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="h-full rounded-full bg-gradient-to-r from-[#1FA9BC] to-[#B9F6FB] shadow-[0_0_6px_rgba(99,230,242,0.8)]"
    />
  </div>
);

export const TianshuStatusPanel: React.FC<StatusProps> = ({
  state,
  chapterLabel,
  progress,
  choicesMade,
  focus,
  logs,
  onReadThought,
  onClose,
}) => {
  const p = state?.player;
  const heroine = focus?.speaker ? state?.heroines?.find((h: any) => h.id === focus.speaker) : null;
  const tierPct =
    p?.nextTier && p.nextTier.minNetWorth > p.tier.minNetWorth
      ? ((p.netWorth - p.tier.minNetWorth) / (p.nextTier.minNetWorth - p.tier.minNetWorth)) * 100
      : 100;
  return (
    <motion.div
      key="sys-status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="absolute inset-0 z-[45] flex items-center justify-center px-4"
      style={{ background: 'rgba(2,6,14,0.78)' }}
    >
      <motion.div {...unfold} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-[370px] origin-center">
        <HoloFrame className="px-4 pt-3.5 pb-4 max-h-[78vh] overflow-y-auto no-scrollbar">
          <HoloHeader kicker="天枢 · 宿主面板" title={`宿主：${state?.user?.nickname || '陆沉'}`} onClose={onClose} />

          {p && (
            <div className="relative space-y-3">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-[1px] rounded-sm border border-[#63E6F2]/50 text-[#B9F6FB] tracking-[0.2em]">{p.tier?.name}</span>
                <span className="text-[#63E6F2]/80 font-num">系统 Lv.{p.sysLevel}</span>
                <span className="flex-1">
                  <Bar pct={(p.sysExp / Math.max(1, p.sysExpNext)) * 100} />
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="身价" value={formatMoney(p.netWorth)} tone="text-[#FFE7B0]" />
                <Stat label="可用资金" value={formatMoney(p.cash)} tone="text-[#FFE7B0]" />
                <Stat label="天枢积分" value={p.sysPoints} />
                <Stat label="暴击概率" value={`${p.critRatePct ?? 0}%`} />
              </div>
              {p.nextTier && (
                <div>
                  <div className="flex justify-between text-[10.5px] mb-1">
                    <span className="text-[#9AF4FB]/80">晋升「{p.nextTier.name}」</span>
                    <span className="font-num text-[#9AF4FB]/80">{formatMoney(p.nextTier.minNetWorth)}</span>
                  </div>
                  <Bar pct={tierPct} />
                </div>
              )}
            </div>
          )}

          <div className="relative mt-4">
            <div className="text-[10px] tracking-[0.4em] text-[#63E6F2] font-bold mb-1.5">当前进程</div>
            <div className="text-[13px] text-[#F4FDFF] font-editorial font-bold truncate">{chapterLabel}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="flex-1">
                <Bar pct={(progress.at / Math.max(1, progress.total)) * 100} />
              </span>
              <span className="font-num text-[11px] text-[#9AF4FB]/80">{Math.round((progress.at / Math.max(1, progress.total)) * 100)}%</span>
            </div>
            <div className="text-[10.5px] text-[#9AF4FB]/60 mt-1">本幕已作出 {choicesMade} 次抉择</div>
          </div>

          <div className="relative mt-4">
            <div className="text-[10px] tracking-[0.4em] text-[#63E6F2] font-bold mb-1.5">人物洞察</div>
            {focus ? (
              <div className="flex items-center gap-3 rounded-[6px] px-2.5 py-2 bg-[#041826]/70 border border-[var(--holo-line)]">
                {heroine?.avatar && <PortraitAvatar src={heroine.avatar} alt="" className="w-10 h-10" rounded="full" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold text-[#F4FDFF]">
                    {focus.name}
                    {focus.role && <span className="ml-2 text-[10.5px] font-normal text-[#9AF4FB]/70">{focus.role}</span>}
                  </div>
                  {heroine ? (
                    <div className="text-[11px] text-[#FFB3C6] mt-0.5">
                      {heroine.unlocked ? `${heroine.stage?.name} · 好感 ${heroine.affection}` : '尚未建立联系'}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#9AF4FB]/60 mt-0.5">关联实体已标定</div>
                  )}
                </div>
                {focus.hasThought && (
                  <button onClick={onReadThought} className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold text-[#FFC4D3] border border-[#F0789A]/70 bg-[#4A1830]/70">
                    读取心声
                  </button>
                )}
              </div>
            ) : (
              <div className="text-[11.5px] text-[#9AF4FB]/55">当前画面没有可解析的目标</div>
            )}
          </div>

          {logs.length > 0 && (
            <div className="relative mt-4">
              <div className="text-[10px] tracking-[0.4em] text-[#63E6F2] font-bold mb-1.5">本幕系统日志</div>
              <div className="space-y-2">
                {logs
                  .slice(-4)
                  .reverse()
                  .map((l, i) => (
                    <div key={i} className="pl-2.5 border-l border-[#63E6F2]/40">
                      <div className="text-[11.5px] font-bold text-[#B9F6FB]">{l.title}</div>
                      <div className="text-[11px] text-[#CFEFF3]/75 leading-relaxed line-clamp-2">{renderSysText(l.text)}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </HoloFrame>
      </motion.div>
    </motion.div>
  );
};

/** Round 天枢 summon button for the theater HUD. */
export const TianshuSummonButton: React.FC<{ onClick: (e: React.MouseEvent) => void; alert?: boolean }> = ({ onClick, alert }) => (
  <button onClick={onClick} aria-label="唤出天枢" className="relative w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition">
    <span className="absolute inset-0 rounded-full bg-[#04121F]/80 border border-[#63E6F2]/60 shadow-[0_0_12px_rgba(99,230,242,0.45)]" />
    <motion.span
      className="absolute inset-[-3px] rounded-full border border-[#63E6F2]/40"
      animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
      transition={{ repeat: Infinity, duration: 2.4 }}
    />
    <GameIcon name="tianshu" size={26} shadow={false} className="relative" />
    {alert && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#63E6F2] shadow-[0_0_6px_#63E6F2]" />}
  </button>
);
