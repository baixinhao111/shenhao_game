import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { formatMoney } from '../lib/format';
import { playLose, playSystemPing, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, StakePicker, useMgApi } from './Stage';

interface Pitch {
  index: number;
  founder: string;
  project: string;
  pitch: string;
  claims: string[];
  fact: string | null;
}
interface AngelSession {
  id: string;
  pitches: Pitch[];
  questions: number;
  amounts: number[];
  hintCost: number;
}

const STAMP: Record<string, { text: string; color: string }> = {
  gem: { text: '潜力股', color: '#E0B04A' },
  solid: { text: '稳健', color: '#4C9A78' },
  hype: { text: '注水', color: '#D24A5C' },
};

export const AngelGame: React.FC = () => {
  const { closeMinigame, flyReward } = useGameStore();
  const { busy, call } = useMgApi();
  const [session, setSession] = useState<AngelSession | null>(null);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const start = async () => {
    const res = await call<any>('/mg/angel/start', {});
    if (!res) return;
    setSession(res.session);
    setActive(0);
    setHint(null);
    setResult(null);
  };

  const ask = async (i: number) => {
    if (!session) return;
    const res = await call<any>('/mg/angel/ask', { id: session.id, index: i });
    if (!res) return;
    playTap();
    setSession({ ...session, questions: res.questions, pitches: session.pitches.map((p) => (p.index === i ? res.pitch : p)) });
  };

  const askHint = async () => {
    if (!session) return;
    const res = await call<any>('/mg/angel/hint', { id: session.id });
    if (res) {
      playSystemPing();
      setHint(res.hint);
    }
  };

  const invest = async (amount: number) => {
    if (!session) return;
    const res = await call<any>('/mg/angel/invest', { id: session.id, index: active, amount });
    if (!res) return;
    setResult(res.result);
    if (res.result.profit > 0) {
      const el = scrollRef.current?.getBoundingClientRect();
      flyReward(res.result.payout, el ? { x: el.left + el.width / 2, y: el.top + el.height / 2 } : undefined);
    } else playLose();
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.scrollWidth / 3));
    if (i !== active) setActive(Math.max(0, Math.min(2, i)));
  };

  const typeOf = (i: number) => result?.all?.[i]?.type as string | undefined;

  return (
    <Stage bg="/assets/scene/pitch.jpg" title="天使投资" subtitle="读路演、追问细节，看穿谁在吹牛" onBack={closeMinigame} dim={0.45}>
      {!session && (
        <div className="flex-1 flex flex-col justify-end px-4 pb-5 gap-3">
          <Speech who="陆知微" tone="rose" text="今天孵化器有三个团队来路演。数据我都看过了……真真假假，你自己判断。" />
          <button disabled={busy} onClick={start} className="w-full gold-btn-shimmer py-3 text-[15px] font-editorial flex items-center justify-center gap-1">
            听路演 <GameIcon name="energy" size={16} shadow={false} />6
          </button>
        </div>
      )}

      {session && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex justify-center gap-1.5 pt-1">
            {session.pitches.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  scrollRef.current?.scrollTo({ left: (scrollRef.current.scrollWidth / 3) * i, behavior: 'smooth' });
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-editorial font-bold transition ${
                  active === i ? 'bg-[#FFE7B0] text-[#2A1C06]' : 'bg-black/40 text-[#C3C9DC] border border-white/15'
                }`}
              >
                {p.founder}
              </button>
            ))}
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar px-[7%] gap-[4%] py-3">
            {session.pitches.map((p, i) => {
              const stamp = typeOf(i) ? STAMP[typeOf(i)!] : null;
              return (
                <div key={i} className="snap-center shrink-0 w-[86%] flex items-start">
                  <motion.div
                    animate={{ rotate: i === active ? 0 : i < active ? -2 : 2, scale: i === active ? 1 : 0.94 }}
                    className="relative w-full max-h-full rounded-[4px] px-4 py-4 overflow-y-auto no-scrollbar text-[#2A2418] shadow-[0_18px_30px_rgba(0,0,0,0.6)]"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0) 30%), repeating-linear-gradient(0deg, rgba(120,100,60,0.05) 0 1px, transparent 1px 26px), #F3EBDA',
                    }}
                  >
                    <div className="text-[10.5px] tracking-[0.3em] text-[#8A7A5A]">商业计划书 · BP</div>
                    <div className="font-editorial text-[21px] font-black mt-1 leading-tight">{p.project}</div>
                    <div className="text-[12px] text-[#5C5240] mt-0.5">创始人 {p.founder}</div>
                    <p className="font-editorial text-[14px] mt-3 leading-relaxed border-l-2 border-[#C9A45C] pl-2.5">「{p.pitch}」</p>
                    <ul className="mt-3 space-y-1.5">
                      {p.claims.map((c) => (
                        <li key={c} className="text-[12.5px] flex gap-1.5">
                          <span className="text-[#C9A45C]">▸</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                    <AnimatePresence>
                      {p.fact && (
                        <motion.div
                          initial={{ opacity: 0, scale: 1.1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-3 text-[12.5px] leading-relaxed text-[#B0302F] font-bold font-editorial italic"
                        >
                          追问：{p.fact}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {!result && !p.fact && (
                      <button
                        disabled={busy || session.questions <= 0}
                        onClick={() => ask(i)}
                        className="mt-3 px-3 py-1 rounded-full border border-[#8A7A5A] text-[12px] text-[#5C5240] disabled:opacity-40"
                      >
                        追问细节（剩 {session.questions} 次）
                      </button>
                    )}
                    {stamp && (
                      <motion.div
                        initial={{ scale: 2.2, rotate: -20, opacity: 0 }}
                        animate={{ scale: 1, rotate: -12, opacity: 0.9 }}
                        transition={{ delay: 0.15 * i, type: 'spring', stiffness: 400, damping: 14 }}
                        className="absolute right-3 top-3 px-2.5 py-0.5 border-[3px] rounded-[6px] font-editorial font-black text-[20px]"
                        style={{ color: stamp.color, borderColor: stamp.color }}
                      >
                        {stamp.text}
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>

          {!result ? (
            <div className="px-4 pb-5 space-y-2.5">
              {hint ? (
                <Speech who="天枢" tone="cyan" text={hint.replace('天枢判定：', '')} />
              ) : (
                <button disabled={busy} onClick={askHint} className="btn-system flex items-center gap-1 pl-1.5 pr-3 py-1.5 text-[12px]">
                  <GameIcon name="tianshu" size={22} shadow={false} />
                  天枢判定 · {session.hintCost}积分
                </button>
              )}
              <div className="text-[12px] text-[#D3D8E8] text-stroke-dark">
                投给 <span className="font-editorial font-black text-[#FFE7B0]">{session.pitches[active].founder}</span>：
              </div>
              <StakePicker
                options={session.amounts as unknown as readonly number[]}
                busy={busy}
                onPick={invest}
                render={(v) => (
                  <>
                    <span className="font-editorial text-[13px]">投资</span>
                    <span className="font-num text-[12px]">{formatMoney(v)}</span>
                  </>
                )}
              />
            </div>
          ) : (
            <ResultStrip
              win={result.profit >= 0}
              title={`回报 ×${result.mult}`}
              amount={result.profit}
              line={result.news}
              formatAmount={formatMoney}
              primary={{ label: '下一场路演', onClick: start }}
              secondary={{ label: '离开', onClick: closeMinigame }}
            />
          )}
        </div>
      )}
    </Stage>
  );
};
