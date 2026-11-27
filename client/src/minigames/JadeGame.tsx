import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameIcon } from '../components/GameIcon';
import { apiRequest } from '../lib/api';
import { formatMoney } from '../lib/format';
import { playLose, playScrape, playStoneCrack, playSystemPing, playTap } from '../lib/sound';
import { useGameStore } from '../store/useGameStore';
import { ResultStrip, Speech, Stage, useMgApi, useStakeScale } from './Stage';

const COLS = 30;
const ROWS = 20;
const N = COLS * ROWS;
const CW = 336; // css px
const CH = 224;
const BRUSH = 17;

const TIERS = [
  { tier: 1, name: '青皮原石', cost: 50000, note: '试手', hue: ['#6E7F63', '#3B4636'] },
  { tier: 2, name: '莫西沙料', cost: 300000, note: '老场口', hue: ['#8A7A55', '#4A3F26'] },
  { tier: 3, name: '标王毛料', cost: 1500000, note: '高货率', hue: ['#9A7B45', '#4E3A18'] },
];

const BUYER_IMG: Record<string, string> = {
  zhou: '/assets/npc/zhou.webp',
  qian: '/assets/npc/qian.webp',
  akun: '/assets/npc/akun.webp',
};

const GRADE_TEX: Record<string, string> = {
  imperial: '/assets/tex/imperial.webp',
  ice: '/assets/tex/ice.webp',
  waxy: '/assets/tex/waxy.webp',
  rock: '/assets/tex/waxy.webp',
};
/** Irregular boulder outline shared by the rind, the scratch surface and the shading overlay. */
const STONE_CLIP =
  'polygon(7% 16%, 16% 6%, 31% 2%, 47% 4%, 63% 1%, 79% 3%, 92% 10%, 98% 26%, 100% 45%, 97% 63%, 99% 79%, 91% 93%, 75% 99%, 56% 97%, 39% 100%, 21% 97%, 8% 90%, 2% 74%, 0% 54%, 3% 34%)';
const RIND_CLIP =
  'polygon(6% 13%, 15% 3%, 31% 0%, 47% 2%, 63% 0%, 80% 1%, 94% 8%, 100% 25%, 100% 46%, 99% 64%, 100% 81%, 93% 96%, 75% 100%, 56% 99%, 39% 100%, 20% 100%, 6% 92%, 0% 75%, 0% 53%, 1% 33%)';

const GRADE_NAME: Record<string, string> = { rock: '垮料', waxy: '糯种', ice: '冰种', imperial: '帝王绿' };

interface Offer {
  id: string;
  name: string;
  title: string;
  offer: number;
}
interface JadeSession {
  id: string;
  tier: number;
  cost: number;
  cells: string;
  grade: string;
  visionCost: number;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

function drawInterior(canvas: HTMLCanvasElement, cells: string, grade: string, tex: Record<string, HTMLImageElement>) {
  const dpr = canvas.width / CW;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = CW / COLS;
  const ch = CH / ROWS;
  ctx.fillStyle = ctx.createPattern(tex.rock, 'repeat') || '#bbb';
  ctx.fillRect(0, 0, CW, CH);

  const layer = (type: string, img: HTMLImageElement, alpha: number) => {
    const m = document.createElement('canvas');
    m.width = canvas.width;
    m.height = canvas.height;
    const mc = m.getContext('2d')!;
    mc.setTransform(dpr, 0, 0, dpr, 0, 0);
    mc.filter = 'blur(4px)';
    mc.fillStyle = '#fff';
    for (let i = 0; i < N; i++) {
      if (cells[i] !== type) continue;
      const x = (i % COLS) * cw;
      const y = Math.floor(i / COLS) * ch;
      mc.fillRect(x - 1.5, y - 1.5, cw + 3, ch + 3);
    }
    mc.filter = 'none';
    mc.globalCompositeOperation = 'source-in';
    mc.drawImage(img, 0, 0, CW, CW);
    ctx.globalAlpha = alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(m, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  };
  layer('j', tex[grade] || tex.waxy, 1);
  layer('s', tex.stain, 0.9);

  // cracks: one polyline per crack, through the centre of each row's run of crack cells
  const runs: Array<Array<{ x: number; y: number }>> = [];
  for (let row = 0; row < ROWS; row++) {
    let col = 0;
    while (col < COLS) {
      if (cells[row * COLS + col] !== 'c') {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 < COLS && cells[row * COLS + end + 1] === 'c') end++;
      const pt = { x: ((col + end) / 2 + 0.5) * cw, y: (row + 0.5) * ch };
      const line = runs.find((r) => {
        const last = r[r.length - 1];
        return Math.abs(last.y - (pt.y - ch)) < 0.1 && Math.abs(last.x - pt.x) <= cw * 2.5;
      });
      if (line) line.push(pt);
      else runs.push([pt]);
      col = end + 1;
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of runs) {
    if (r.length < 2) continue;
    for (const [color, width, off] of [
      ['rgba(46,28,14,0.85)', 2.2, 0],
      ['rgba(255,255,255,0.22)', 0.8, 1],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      r.forEach((pt, k) => (k ? ctx.lineTo(pt.x + off, pt.y + off) : ctx.moveTo(pt.x + off, pt.y + off)));
      ctx.stroke();
    }
  }
  // polished-face sheen
  const g = ctx.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
}

function drawSkin(canvas: HTMLCanvasElement, skin: HTMLImageElement) {
  const dpr = canvas.width / CW;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(skin, 0, 0, CW, CW);
  // weathered speckles and pits so the rind reads as stone, not a flat texture
  for (let i = 0; i < 260; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 12543.123) % 1;
    const r = 0.6 + ((i * 7) % 5) * 0.35;
    ctx.fillStyle = i % 3 ? 'rgba(40,28,16,0.35)' : 'rgba(255,236,200,0.18)';
    ctx.beginPath();
    ctx.arc(Math.abs(x) * CW, Math.abs(y) * CH, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(CW * 0.38, CH * 0.28, 10, CW / 2, CH / 2, CW * 0.68);
  g.addColorStop(0, 'rgba(255,240,210,0.2)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
}

const LINES: Record<string, Array<[string, string]>> = {
  start: [['周老', '先擦个窗，看看里头的种水。']],
  neutral: [['阿坤', '还没见绿，慢慢擦。'], ['周老', '别急，好料子都藏得深。']],
  hot: [['钱总', '出绿了！这块我要了，价钱好说！'], ['阿坤', '这颜色……老板，开个价？']],
  cold: [['周老', '唉，色只浮在皮上，可惜了。'], ['钱总', '这料子……我再考虑考虑。']],
};

export const JadeGame: React.FC = () => {
  const { closeMinigame, flyReward, notifyTop, showError } = useGameStore();
  const { busy, call } = useMgApi();
  const stakeScale = useStakeScale();
  const [phase, setPhase] = useState<'pick' | 'scratch' | 'done'>('pick');
  const [session, setSession] = useState<JadeSession | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [prevOffers, setPrevOffers] = useState<Record<string, number>>({});
  const [verdict, setVerdict] = useState<{ label: string; tone: string }>({ label: '原石未开', tone: 'neutral' });
  const [revealed, setRevealed] = useState(0);
  const [heat, setHeat] = useState<number[] | null>(null);
  const [visionNote, setVisionNote] = useState<string | null>(null);
  const [dust, setDust] = useState<Array<{ id: number; x: number; y: number; dx: number }>>([]);
  const dustAtRef = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [lineIdx, setLineIdx] = useState(0);

  const interiorRef = useRef<HTMLCanvasElement>(null);
  const skinRef = useRef<HTMLCanvasElement>(null);
  const texRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const maskRef = useRef<Uint8Array>(new Uint8Array(N));
  const dirtyRef = useRef(false);
  const lastSentRef = useRef(0);
  const drawingRef = useRef<{ x: number; y: number } | null>(null);
  const buyerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const appraiseSeqRef = useRef(0);
  const offersRef = useRef<Offer[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadImg('/assets/tex/skin.webp'),
      loadImg('/assets/tex/rock.webp'),
      loadImg(GRADE_TEX.imperial),
      loadImg(GRADE_TEX.ice),
      loadImg(GRADE_TEX.waxy),
    ]).then(([skin, rock, imperial, ice, waxy]) => {
      if (alive) texRef.current = { skin, rock, imperial, ice, waxy, stain: ice };
    });
    return () => {
      alive = false;
    };
  }, []);

  const paint = useCallback(() => {
    const tex = texRef.current;
    if (!tex || !session || !interiorRef.current || !skinRef.current) return;
    drawInterior(interiorRef.current, session.cells, session.grade, tex);
    drawSkin(skinRef.current, tex.skin);
  }, [session]);

  useEffect(() => {
    if (phase !== 'scratch' || !session) return;
    const id = setInterval(() => {
      if (texRef.current) {
        paint();
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, session, paint]);

  const maskString = () => Array.from(maskRef.current, (v) => (v ? '1' : '0')).join('');

  const applyQuote = useCallback(
    (res: { offers: Offer[]; verdict: { label: string; tone: string }; revealed?: number }) => {
      setPrevOffers(Object.fromEntries(offersRef.current.map((o) => [o.id, o.offer])));
      offersRef.current = res.offers;
      setOffers(res.offers);
      setVerdict((v) => {
        if (res.verdict.tone !== v.tone) {
          setLineIdx((i) => i + 1);
          if (res.verdict.tone === 'hot') playStoneCrack();
        }
        return res.verdict;
      });
      if (typeof res.revealed === 'number') setRevealed(res.revealed);
    },
    [],
  );

  /** Background re-quote while rubbing. Separate from the action `busy` flag so it never blocks input. */
  const appraise = useCallback(
    async (force = false): Promise<boolean> => {
      if (!session || phase !== 'scratch') return false;
      if (!dirtyRef.current) return true;
      if (!force && Date.now() - lastSentRef.current < 550) return true;
      dirtyRef.current = false;
      lastSentRef.current = Date.now();
      const seq = ++appraiseSeqRef.current;
      try {
        const res = await apiRequest<any>('/mg/jade/appraise', { body: { id: session.id, mask: maskString() } });
        if (seq === appraiseSeqRef.current) applyQuote(res);
        return true;
      } catch (e: any) {
        if (/过期|结束/.test(e.message || '')) {
          showError('这块石头已按当时最高价自动成交');
          setPhase('pick');
        } else {
          dirtyRef.current = true; // retry on next tick
        }
        return false;
      }
    },
    [session, phase, applyQuote, showError],
  );

  // keep quotes flowing while rubbing
  useEffect(() => {
    if (phase !== 'scratch') return;
    const id = setInterval(() => void appraise(), 600);
    return () => clearInterval(id);
  }, [phase, appraise]);

  const start = async (tier: number) => {
    const res = await call<any>('/mg/jade/start', { tier });
    if (!res) return;
    maskRef.current = new Uint8Array(N);
    setSession(res.session);
    offersRef.current = res.offers;
    setOffers(res.offers);
    setPrevOffers({});
    setVerdict(res.verdict);
    setRevealed(0);
    setHeat(null);
    setVisionNote(null);
    setSelected(null);
    setResult(null);
    setLineIdx(0);
    setPhase('scratch');
  };

  const scratchAt = (x: number, y: number) => {
    const c = skinRef.current;
    if (!c) return;
    const dpr = c.width / CW;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(x, y, 2, x, y, BRUSH);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
    ctx.fill();
    const cw = CW / COLS;
    const ch = CH / ROWS;
    const r = BRUSH * 0.78;
    for (let row = Math.max(0, Math.floor((y - r) / ch)); row <= Math.min(ROWS - 1, Math.floor((y + r) / ch)); row++) {
      for (let col = Math.max(0, Math.floor((x - r) / cw)); col <= Math.min(COLS - 1, Math.floor((x + r) / cw)); col++) {
        const cx = (col + 0.5) * cw;
        const cy = (row + 0.5) * ch;
        if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r && !maskRef.current[row * COLS + col]) {
          maskRef.current[row * COLS + col] = 1;
          dirtyRef.current = true;
        }
      }
    }
    playScrape();
    // a few grains of rind fall away from the finger (throttled)
    const now = Date.now();
    if (now - dustAtRef.current > 70) {
      dustAtRef.current = now;
      const grains = Array.from({ length: 3 }, (_, k) => ({ id: now + k, x: (x / CW) * 100, y: (y / CH) * 100, dx: (Math.random() - 0.5) * 30 }));
      setDust((d) => [...d.slice(-24), ...grains]);
    }
  };

  const pointerPos = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * CW, y: ((e.clientY - rect.top) / rect.height) * CH };
  };

  const onDown = (e: React.PointerEvent) => {
    if (phase !== 'scratch') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    drawingRef.current = p;
    scratchAt(p.x, p.y);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = pointerPos(e);
    const last = drawingRef.current;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 5));
    for (let k = 1; k <= steps; k++) scratchAt(last.x + ((p.x - last.x) * k) / steps, last.y + ((p.y - last.y) * k) / steps);
    drawingRef.current = p;
  };
  const onUp = () => {
    drawingRef.current = null;
    void appraise(true);
  };

  const useVision = async () => {
    if (!session) return;
    const res = await call<any>('/mg/jade/vision', { id: session.id });
    if (res) {
      playSystemPing();
      const h: number[] = Array.isArray(res.heat) ? res.heat : [];
      setHeat(h);
      const maxH = h.length ? Math.max(...h) : 0;
      const hotCount = h.filter((v) => v >= 2).length;
      if (maxH >= 3) {
        setVisionNote(`扫描完成：石内探得浓郁玉脉（${hotCount} 处高能区），沿青光高亮位置擦窗最稳。`);
      } else if (maxH >= 1) {
        setVisionNote('扫描完成：石内有零星玉脉反应，可沿淡青光区试擦开窗。');
      } else {
        setVisionNote('扫描完成：原石内部未探测到有效玉脉，大概率垮料，建议趁早止损。');
      }
    }
  };

  const sell = async () => {
    if (!session || !selected) return;
    const shown = offersRef.current.find((o) => o.id === selected)?.offer || 0;
    if (dirtyRef.current) {
      await appraise(true);
      const fresh = offersRef.current.find((o) => o.id === selected)?.offer || 0;
      if (fresh !== shown) {
        showError(`行情变了：${offersRef.current.find((o) => o.id === selected)?.name}改口 ${formatMoney(fresh)}`);
        return;
      }
    }
    const res = await call<any>('/mg/jade/sell', { id: session.id, mask: maskString(), buyer: selected, expect: shown });
    if (!res) return;
    if (res.requote) {
      applyQuote(res);
      showError(`行情变了：${res.offers.find((o: Offer) => o.id === selected)?.name}改口 ${formatMoney(res.offers.find((o: Offer) => o.id === selected)?.offer || 0)}`);
      return;
    }
    const r = res.result;
    setResult(r);
    setPhase('done');
    const el = buyerRefs.current[r.buyer.id];
    const rect = el?.getBoundingClientRect();
    if (r.profit >= 0) flyReward(r.payout, rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
    else playLose();
    if (r.unlockedHeroine) notifyTop('wechat', '陆知微 加你为好友', '「你那块帝王绿，是怎么看出来的？」');
  };

  const collect = async () => {
    if (!session) return;
    const res = await call<any>('/mg/jade/collect', { id: session.id, mask: maskString() });
    if (!res) return;
    playStoneCrack();
    setResult({ ...res.result, collected: true, grade: 'imperial', gradeName: '帝王绿' });
    if (res.result.traded) notifyTop('system', `周老换给你一件${res.result.asset?.name}`, '展柜里已有帝王绿，他拿镇店之宝跟你换了这块。');
    setPhase('done');
    if (res.result.unlockedHeroine) notifyTop('wechat', '陆知微 加你为好友', '「你那块帝王绿，是怎么看出来的？」');
  };

  const topOffer = useMemo(() => offers.reduce((a, b) => (b.offer > (a?.offer ?? 0) ? b : a), offers[0]), [offers]);
  const jadeExposed = useMemo(() => {
    if (!session) return 0;
    let total = 0;
    let seen = 0;
    for (let i = 0; i < N; i++) {
      if (session.cells[i] !== 'j') continue;
      total++;
      if (maskRef.current[i]) seen++;
    }
    return total ? seen / total : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, revealed]);
  const canCollect = session?.grade === 'imperial' && jadeExposed >= 0.5;
  const line = (LINES[revealed === 0 ? 'start' : verdict.tone] || LINES.neutral)[lineIdx % 2] || LINES.start[0];

  return (
    <Stage bg="/assets/scene/jade_stall.jpg" title="古玩赌石" subtitle="擦开石皮，看准时机出手" onBack={() => {
        if (phase === 'scratch') {
          showError('石头还没出手，先卖给一位买家再走');
          return;
        }
        closeMinigame();
      }} dim={0.35}>
      {phase === 'pick' && (
        <div className="flex-1 flex flex-col justify-end">
          <img
            src="/assets/npc/zhou.webp"
            alt=""
            className="absolute left-[-10%] bottom-[170px] h-[40%] object-contain object-bottom sprite-fade-bottom pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)]"
          />
          <div className="relative px-4 pb-3">
            <div className="mb-3 w-[60%] ml-auto rounded-[10px] bg-[#070B18]/72 backdrop-blur-sm border border-[#E2BD72]/25 px-3 py-2">
              <Speech who="周老" text="今天新到一批缅料。挑一块，擦开了，是金是石当场见分晓。" />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {TIERS.map((t) => (
                <button key={t.tier} disabled={busy} onClick={() => start(t.tier)} className="group flex flex-col items-center active:scale-95 transition">
                  <div
                    className="w-[92px] h-[70px] shadow-[0_14px_18px_rgba(0,0,0,0.65),inset_0_-8px_14px_rgba(0,0,0,0.45),inset_0_6px_10px_rgba(255,240,200,0.18)]"
                    style={{
                      borderRadius: '46% 54% 42% 58% / 56% 44% 58% 42%',
                      background: `url(/assets/tex/skin.webp) center/180px, linear-gradient(160deg, ${t.hue[0]}, ${t.hue[1]})`,
                      backgroundBlendMode: 'multiply',
                    }}
                  />
                  <div className="mt-2 font-editorial text-[13.5px] font-black text-[#FBF1D8] text-stroke-dark">{t.name}</div>
                  <div className="font-num text-[13px] text-[#FFE7B0] flex items-center gap-0.5 text-stroke-dark">
                    <GameIcon name="cash" size={14} shadow={false} />
                    {formatMoney(t.cost * stakeScale)}
                  </div>
                  <div className="text-[10px] text-[#A3AAC2] flex items-center gap-0.5">
                    <GameIcon name="energy" size={11} shadow={false} />6 · {t.note}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase !== 'pick' && session && (
        <div className="flex-1 flex flex-col">
          {/* dealers */}
          <div className="flex justify-around px-2 pt-1">
            {offers.map((o) => {
              const prev = prevOffers[o.id];
              const delta = prev ? o.offer - prev : 0;
              const isTop = topOffer?.id === o.id;
              const isSel = selected === o.id;
              return (
                <div
                  key={o.id}
                  ref={(el) => {
                    buyerRefs.current[o.id] = el;
                  }}
                  onClick={() => {
                    if (phase !== 'scratch') return;
                    playTap();
                    setSelected(isSel ? null : o.id);
                  }}
                  className={`flex flex-col items-center cursor-pointer transition ${phase === 'done' && result?.buyer?.id !== o.id ? 'opacity-40' : ''}`}
                >
                  <div
                    className={`relative w-[64px] h-[64px] rounded-full overflow-hidden p-[2px] transition ${
                      isSel ? 'bg-gradient-to-b from-[#FFF0C8] to-[#D6A85A] scale-110 shadow-[0_0_16px_rgba(255,220,150,0.7)]' : 'bg-white/20'
                    }`}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden bg-[#1A2344]">
                      <img src={BUYER_IMG[o.id]} alt="" className="w-full h-full object-cover object-top scale-[1.5] origin-top" />
                    </div>
                  </div>
                  <div className="text-[11px] font-editorial font-black text-[#FBF1D8] mt-1 text-stroke-dark">{o.name}</div>
                  <motion.div
                    key={o.offer}
                    initial={{ scale: 1.25 }}
                    animate={{ scale: 1 }}
                    className={`font-num text-[15px] leading-none text-stroke-dark ${isTop ? 'text-[#FFE7B0]' : 'text-[#D3D8E8]'}`}
                  >
                    {formatMoney(o.offer)}
                  </motion.div>
                  <div className={`h-3 text-[10px] font-num ${delta > 0 ? 'text-[#FF6B86]' : delta < 0 ? 'text-[#3FD69A]' : 'text-transparent'}`}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {delta ? formatMoney(Math.abs(delta)) : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* stone */}
          <div className="relative flex-1 flex flex-col items-center justify-center">
            <div className="absolute w-[380px] h-[260px] rounded-full bg-[radial-gradient(closest-side,rgba(255,214,150,0.28),transparent)] pointer-events-none" />
            <div className="relative flex items-center gap-2 mb-2 text-stroke-dark">
              <span
                className={`px-2 py-[1px] rounded-sm text-[11px] font-bold ${
                  verdict.tone === 'hot'
                    ? 'bg-gradient-to-r from-[#3FD69A] to-[#14805A] text-white'
                    : verdict.tone === 'cold'
                      ? 'bg-[#3A1C24] text-[#FF9AAE] border border-[#FF5C7A]/50'
                      : 'bg-black/50 text-[#C3C9DC] border border-white/15'
                }`}
              >
                {phase === 'done' ? `开出：${result?.gradeName || GRADE_NAME[session.grade]}` : verdict.label}
              </span>
              <span className="font-num text-[12px] text-[#C3C9DC]">已擦开 {phase === 'done' ? 100 : revealed}%</span>
            </div>
            {/* contact shadow on the table */}
            <div className="absolute bottom-[8%] w-[78%] h-[34px] rounded-[50%] bg-black/70 blur-[14px] pointer-events-none" />
            <div className="relative" style={{ filter: 'drop-shadow(0 18px 22px rgba(0,0,0,0.75))' }}>
              {/* rind: the uncut skin around the window */}
              <div
                className="absolute -inset-[10px]"
                style={{
                  clipPath: RIND_CLIP,
                  background:
                    'radial-gradient(120% 90% at 35% 25%, rgba(255,230,190,0.25), transparent 55%), radial-gradient(90% 80% at 70% 85%, rgba(0,0,0,0.55), transparent 70%), url(/assets/tex/skin.webp) center/220px',
                }}
              />
              <div
                className="relative overflow-hidden touch-none"
                style={{ width: `min(${CW}px, 84vw)`, aspectRatio: `${CW} / ${CH}`, clipPath: STONE_CLIP }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <canvas ref={interiorRef} width={CW * 2} height={CH * 2} className="absolute inset-0 w-full h-full" />
                <canvas
                  ref={skinRef}
                  width={CW * 2}
                  height={CH * 2}
                  className="absolute inset-0 w-full h-full transition-opacity duration-[1200ms]"
                  style={{ opacity: phase === 'done' ? 0 : 1 }}
                />
                {/* 3D shading: light from top-left, bevel at the edge */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(90% 70% at 30% 22%, rgba(255,250,235,0.22), transparent 60%), radial-gradient(120% 100% at 50% 50%, transparent 58%, rgba(0,0,0,0.45) 100%)',
                    mixBlendMode: 'soft-light',
                  }}
                />
                {/* light sweep once real green shows */}
                {(verdict.tone === 'hot' || (phase === 'done' && (result?.grade === 'imperial' || result?.grade === 'ice'))) && (
                  <motion.div
                    className="absolute inset-y-0 w-[40%] pointer-events-none"
                    style={{ background: 'linear-gradient(100deg, transparent, rgba(220,255,235,0.45), transparent)', mixBlendMode: 'screen' }}
                    initial={{ left: '-45%' }}
                    animate={{ left: '120%' }}
                    transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 1.2, ease: 'easeInOut' }}
                  />
                )}
                {/* falling rind grains */}
                {dust.map((d) => (
                  <motion.span
                    key={d.id}
                    className="absolute w-[3px] h-[3px] rounded-[1px] bg-[#7A6040] pointer-events-none"
                    style={{ left: `${d.x}%`, top: `${d.y}%` }}
                    initial={{ opacity: 1, x: 0, y: 0 }}
                    animate={{ opacity: 0, x: d.dx, y: 36 }}
                    transition={{ duration: 0.6, ease: 'easeIn' }}
                    onAnimationComplete={() => setDust((arr) => arr.filter((z) => z.id !== d.id))}
                  />
                ))}
                {heat && phase === 'scratch' && (
                  <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none">
                    {heat.map((h, i) => (
                      <div
                        key={i}
                        className="border border-[#63E6F2]/25"
                        style={{
                          background: `rgba(99,230,242,${[0.03, 0.16, 0.3, 0.48][h] ?? 0.03})`,
                          boxShadow: h >= 2 ? 'inset 0 0 14px rgba(155,245,255,0.75)' : undefined,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            {phase === 'scratch' && revealed === 0 && (
              <div className="mt-2 text-[11.5px] text-[#C3C9DC] tracking-wider text-stroke-dark">手指在石面上来回擦动</div>
            )}
          </div>

          {/* controls */}
          <AnimatePresence mode="wait">
            {phase === 'scratch' && (
              <motion.div key="ctl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 pb-5 space-y-2.5">
                {visionNote ? (
                  <Speech who="天枢" text={visionNote} tone="cyan" />
                ) : (
                  <Speech who={line[0]} text={line[1]} tone={verdict.tone === 'cold' ? 'plain' : 'gold'} />
                )}
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy || Boolean(heat)}
                    onClick={useVision}
                    className="btn-system flex items-center gap-1 pl-1.5 pr-3 py-1.5 text-[12px] disabled:opacity-40"
                  >
                    <GameIcon name="tianshu" size={22} shadow={false} />
                    天枢透视{session.visionCost ? ` · ${session.visionCost}积分` : ' · 免费'}
                  </button>
                  {canCollect && (
                    <button disabled={busy} onClick={collect} className="btn-navy flex items-center gap-1 pl-1.5 pr-3 py-1.5 text-[12px]">
                      <GameIcon name="crown" size={20} shadow={false} />
                      收藏入库
                    </button>
                  )}
                </div>
                <button
                  disabled={busy || !selected}
                  onClick={sell}
                  className="w-full gold-btn-shimmer py-3 text-[15px] font-editorial disabled:opacity-60"
                >
                  {selected
                    ? `卖给${offers.find((o) => o.id === selected)?.name} · ${formatMoney(offers.find((o) => o.id === selected)?.offer || 0)}`
                    : '点选上方买家，随时出手'}
                </button>
              </motion.div>
            )}
            {phase === 'done' && result && (
              <ResultStrip
                key="res"
                win={result.collected || result.profit >= 0}
                title={result.collected ? `${result.asset?.name || '帝王绿'} · 收藏入库` : `卖给${result.buyer.name}`}
                amount={result.collected ? undefined : result.profit}
                line={
                  result.collected
                    ? '展柜里多了一件镇馆之宝，天枢积分 +60。'
                    : `这块石头的真实价值是 ${formatMoney(result.trueValue)}（${result.gradeName}）。${
                        result.trueValue > result.payout * 1.15 ? '卖早了……' : result.trueValue < result.payout * 0.85 ? '出手时机刚好。' : ''
                      }`
                }
                formatAmount={formatMoney}
                primary={{ label: '再挑一块', onClick: () => setPhase('pick') }}
                secondary={{ label: '离开', onClick: closeMinigame }}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </Stage>
  );
};
