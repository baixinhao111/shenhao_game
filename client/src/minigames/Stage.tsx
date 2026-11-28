import React, { useCallback, useState } from 'react';
import { ChevronLeft, HelpCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ResourceCapsules } from '../components/TopBar';
import { apiRequest } from '../lib/api';
import { playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';

export interface StageHelpConfig {
  title: string;
  subtitle?: string;
  tips: Array<{ label: string; desc: string; tone?: 'gold' | 'cyan' | 'rose' }>;
}

/** Full-screen minigame scene: painted background, slim header, no frames. */
export const Stage: React.FC<{
  bg: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
  dim?: number;
  help?: StageHelpConfig;
  children: React.ReactNode;
}> = ({ bg, title, subtitle, onBack, dim = 0.45, help, children }) => {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-40 overflow-hidden bg-[#04050A] flex flex-col select-none"
    >
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(5,7,15,${dim})` }} />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#04050A]/85 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#04050A]/95 via-[#04050A]/60 to-transparent pointer-events-none" />

      <header className="relative z-10 shrink-0 flex items-center justify-between gap-1.5 px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => {
              playTap();
              onBack();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#04050A]/60 border border-[#D9C49A]/40 text-[#E2D3B0] active:scale-90 transition shrink-0"
            aria-label="返回"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="font-editorial text-[18px] font-black gold-gradient-text leading-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {title}
            </div>
            {subtitle && <div className="text-[10.5px] text-[#B3B6C2] truncate text-stroke-dark">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ResourceCapsules compact />
          {help && (
            <button
              onClick={() => {
                playTap();
                setHelpOpen(true);
              }}
              aria-label="规则速览"
              title="规则速览"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[#0A0F1F]/80 border border-[#D9C49A]/40 text-[#E2D3B0] hover:border-[#E2BD72] active:scale-90 transition shrink-0"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col">{children}</div>

      <AnimatePresence>
        {help && helpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHelpOpen(false)}
            className="absolute inset-0 z-50 bg-black/72 backdrop-blur-sm flex items-end p-3"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full panel-elevated rounded-[14px] px-4 pt-3.5 pb-4 space-y-3 max-h-[75%] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.08]">
                <div className="min-w-0">
                  <div className="label-en">PLAYBOOK · 规则速览</div>
                  <div className="font-editorial text-[17px] font-black gold-gradient-text mt-0.5">{help.title}</div>
                  {help.subtitle && <div className="text-[11px] text-[#9EA4B5] mt-0.5">{help.subtitle}</div>}
                </div>
                <button
                  onClick={() => setHelpOpen(false)}
                  aria-label="关闭规则"
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-white/[0.06] text-[#C3C9DC] shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2.5">
                {help.tips.map((t, idx) => (
                  <div key={idx} className="pb-2.5 border-b border-white/[0.06] last:border-b-0 last:pb-0">
                    <div
                      className={`text-[12.5px] font-editorial font-black ${
                        t.tone === 'cyan'
                          ? 'text-[#9BF5FF]'
                          : t.tone === 'rose'
                            ? 'text-[#FFB3C6]'
                            : 'text-[#EADBB8]'
                      }`}
                    >
                      ◆ {t.label}
                    </div>
                    <div className="text-[12px] text-[#C6CCD9] leading-relaxed mt-0.5">{t.desc}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                className="w-full btn-champagne py-2 text-[13px] font-editorial tracking-[0.2em]"
              >
                明白了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/** Serif speech line from an NPC, sitting on the scene (no box). */
export const Speech: React.FC<{ who: string; text: string; tone?: 'gold' | 'rose' | 'cyan' | 'plain'; className?: string }> = ({
  who,
  text,
  tone = 'gold',
  className = '',
}) => (
  <motion.div
    key={text}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className={`text-[13px] leading-relaxed text-stroke-dark ${className}`}
  >
    <span
      className={`font-editorial font-black mr-1.5 ${
        tone === 'rose' ? 'text-[#FFB3C6]' : tone === 'cyan' ? 'text-[#9BF5FF]' : tone === 'plain' ? 'text-[#B3B6C2]' : 'text-[#EADBB8]'
      }`}
    >
      {who}
    </span>
    <span className="text-[#ECE6DA]">{text}</span>
  </motion.div>
);

/** API helper for minigame scenes: applies state, surfaces errors, tracks busy. */
export function useMgApi() {
  const { applyServerState, showError } = useGameStore();
  const [busy, setBusy] = useState(false);
  const call = useCallback(
    async <T = any,>(path: string, body: any = {}): Promise<T | null> => {
      setBusy(true);
      try {
        const res = await apiRequest<any>(path, { body });
        if (res?.state) applyServerState(res.state, res.result?.crit || res.deal?.result?.critResult);
        return res as T;
      } catch (e: any) {
        showError(e.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [applyServerState, showError],
  );
  return { busy, call };
}

/** Bottom result strip: amount + one line + actions, laid on the scene. */
export const ResultStrip: React.FC<{
  title: string;
  amount?: number;
  line?: string;
  win?: boolean;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  formatAmount: (n: number) => string;
}> = ({ title, amount, line, win = true, primary, secondary, formatAmount }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    className="px-4 pb-5 pt-2 space-y-2.5"
  >
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className={`font-editorial text-[22px] font-black ${win ? 'gold-gradient-text' : 'text-[#8C90A0]'} drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]`}>
          {title}
        </div>
        {line && <div className="text-[12px] text-[#C2C5CF] leading-relaxed text-stroke-dark mt-0.5">{line}</div>}
      </div>
      {typeof amount === 'number' && (
        <div className={`font-num text-[28px] font-semibold shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${amount >= 0 ? 'text-[#EADBB8]' : 'text-[#8C90A0]'}`}>
          {amount >= 0 ? '+' : '−'}
          {formatAmount(Math.abs(amount))}
        </div>
      )}
    </div>
    <div className="flex gap-2.5">
      {secondary && (
        <button onClick={secondary.onClick} className="btn-navy flex-1 py-2.5 text-[14px] font-editorial">
          {secondary.label}
        </button>
      )}
      <button onClick={primary.onClick} className="gold-btn-shimmer flex-[1.4] py-2.5 text-[14px] font-editorial">
        {primary.label}
      </button>
    </div>
  </motion.div>
);

/** Stake multiplier of the player's tier (server: tiers[].stakeScale). Base stakes × this = real stakes. */
export function useStakeScale(): number {
  return useGameStore((s) => Number(s.state?.player?.stakeScale || 1));
}

/**
 * Three-way stake picker laid on the scene. `options` are tier-1 base stakes and are scaled by the
 * player's tier automatically; pass `scale={false}` when the server already sent scaled amounts.
 */
export function StakePicker<T extends number>({
  options,
  onPick,
  busy,
  render,
  scale = true,
}: {
  options: readonly T[];
  onPick: (v: T) => void;
  busy: boolean;
  render: (v: T, i: number) => React.ReactNode;
  scale?: boolean;
}) {
  const k = useStakeScale();
  const values = options.map((v) => (scale ? (Math.round(v * k) as T) : v));
  return (
    <div className="grid grid-cols-3 gap-2">
      {values.map((v, i) => (
        <button
          key={v}
          disabled={busy}
          onClick={() => {
            playTap();
            onPick(v);
          }}
          className={`${i === 2 ? 'gold-btn-shimmer' : 'btn-navy'} py-2 px-1 flex flex-col items-center`}
        >
          {render(v, i)}
        </button>
      ))}
    </div>
  );
}
