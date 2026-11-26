/**
 * 商战谈判 — negotiate the price of a business or property with its owner.
 *
 * The seller has a hidden bottom line, a patience meter and a temperament.
 * Each round the player makes an offer or plays a card (proof of funds,
 * connections, intel, a heroine's assist, 天枢 mind-read). Offers at or above
 * the bottom line close the deal; lowballs cost patience; when patience runs
 * out the seller walks away and the item is on cooldown for a while.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import { getContent } from './contentLoader.js';
import { queryOne } from './db.js';
import { assertCashSufficient, spendEnergyOrThrow, spendSysPointsOrThrow } from './economy.js';
import { buildFullGameState, computePortfolioAndTier, formatMoney, getPlayerKv, setPlayerKv } from './gameEngine.js';
import { assertCanBuyBusiness, assertCanBuyProperty, purchaseBusiness, purchaseProperty } from './purchases.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

type Temper = 'greedy' | 'proud' | 'anxious';
type Kind = 'business' | 'property';
type CardId = 'funds' | 'network' | 'intel' | 'heroine';

const START_ENERGY = 5;
const MAX_ROUNDS = 6;
const COOLDOWN_MS = 10 * 60 * 1000;
const DEAL_TTL_MS = 30 * 60 * 1000;
const INTEL_COST = 20;
const MINDREAD_BASE = 10;

const SELLERS: Record<string, { name: string; title: string; portrait: string; temper: Temper }> = {
  zhou: { name: '周老', title: '老城区古玩行会长', portrait: '/assets/npc/zhou.webp', temper: 'proud' },
  qian: { name: '钱总', title: '矿业起家的煤老板', portrait: '/assets/npc/qian.webp', temper: 'greedy' },
  lin_jie: { name: '林姐', title: '林氏资本合伙人', portrait: '/assets/npc/lin_jie.webp', temper: 'anxious' },
  akun: { name: '阿坤', title: '跨境玉石商', portrait: '/assets/npc/akun.webp', temper: 'greedy' },
  zhao: { name: '赵天宇', title: '赵氏集团少东家', portrait: '/assets/characters/zhao_tianyu.png', temper: 'proud' },
  wang: { name: '王强', title: '盛世资本前部门主管', portrait: '/assets/characters/wang_qiang.png', temper: 'anxious' },
};

const SELLER_OF: Record<string, keyof typeof SELLERS> = {
  biz_milktea: 'qian',
  biz_esports: 'zhao',
  biz_antique: 'zhou',
  biz_mcn: 'akun',
  biz_hotel: 'lin_jie',
  biz_quant: 'wang',
  prop_old_shop: 'qian',
  prop_campus_apt: 'akun',
  prop_bund_flat: 'lin_jie',
  prop_night_loft: 'zhao',
  prop_cbd_tower: 'wang',
  prop_peak_manor: 'zhou',
};

const TEMPER_INFO: Record<Temper, { label: string; patience: number; concession: number; hint: string }> = {
  greedy: { label: '逐利', patience: 4, concession: 0.3, hint: '只认钱，看到真金白银会松口' },
  proud: { label: '要面子', patience: 3, concession: 0.2, hint: '压价太狠会被激怒，人脉施压适得其反' },
  anxious: { label: '缺钱', patience: 5, concession: 0.45, hint: '急着回笼资金，施压最有效' },
};

const WEAKNESS: Record<Temper, string[]> = {
  greedy: ['他手里压着另一家的报价，但对方付款要拖三个月。', '他刚在澳门输了一大笔，急着找人接盘。'],
  proud: ['他最怕外人说他的东西卖不出去，私下早就放出风想脱手。', '家族里正在逼他交出这块资产，他只是嘴硬。'],
  anxious: ['下个月有一笔过桥贷款到期，再不回款就要违约。', '合伙人正在撤资，他需要一笔现金稳住局面。'],
};

const LINES = {
  open: {
    greedy: '开门见山吧，{item}这个价，{ask}，少一分我都亏。',
    proud: '{item}不是谁都能接的。看在你的面子上，{ask}。',
    anxious: '{item}的情况你也了解……{ask}，诚心要的话可以谈。',
  },
  lowball: {
    greedy: '你这是来捡便宜的？这价我宁可放着落灰。',
    proud: '这个数？你是在侮辱我，还是在侮辱这块招牌？',
    anxious: '这……差得也太多了，你再想想。',
  },
  counter: {
    greedy: '行，看你爽快，我让一点：{ask}。',
    proud: '我退一步，{ask}，这是给你面子。',
    anxious: '{ask}吧，这真的已经是我能接受的了。',
  },
  final: {
    greedy: '最后一口价：{ask}。不要我就找下家了。',
    proud: '{ask}，这是最后的报价，没得再谈。',
    anxious: '{ask}……我真的不能再低了，你给句准话。',
  },
  walk: {
    greedy: '谈不拢就算了，生意不成仁义在。',
    proud: '送客。这桩生意，以后不必再提。',
    anxious: '……算了，我再去找别人问问吧。',
  },
  accept: {
    greedy: '痛快！合同拿来，现在就签。',
    proud: '……成交。往后好好经营，别砸了这块招牌。',
    anxious: '成交！你可真是帮了我大忙。',
  },
};

interface Deal {
  id: string;
  userId: number;
  createdAt: number;
  kind: Kind;
  itemId: string;
  itemName: string;
  itemImage: string;
  list: number;
  sellerId: keyof typeof SELLERS;
  temper: Temper;
  bottom: number;
  ask: number;
  patience: number;
  maxPatience: number;
  round: number;
  used: CardId[];
  mindreads: number;
  weakness: string | null;
  range: [number, number] | null;
  log: Array<{ who: 'seller' | 'me' | 'system' | 'ally'; text: string; allyId?: string }>;
  finalCall: boolean;
}

const deals = new Map<string, Deal>();
const dealByUser = new Map<number, string>();

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const roundPrice = (v: number, list: number) => {
  const step = list >= 1e8 ? 1e6 : list >= 1e7 ? 1e5 : 1e4;
  return Math.max(step, Math.round(v / step) * step);
};
const fill = (t: string, d: Deal) => t.replace('{item}', `【${d.itemName}】`).replace('{ask}', formatMoney(d.ask));

setInterval(() => {
  const now = Date.now();
  for (const d of [...deals.values()]) if (now - d.createdAt > DEAL_TTL_MS) closeDeal(d);
}, 5 * 60 * 1000).unref();

function closeDeal(d: Deal) {
  deals.delete(d.id);
  if (dealByUser.get(d.userId) === d.id) dealByUser.delete(d.userId);
}

function cooldownKey(kind: Kind, itemId: string) {
  return `deal_cd_${kind}_${itemId}`;
}

function publicDeal(d: Deal, extra: Record<string, unknown> = {}) {
  const seller = SELLERS[d.sellerId];
  const info = TEMPER_INFO[d.temper];
  const { state, tierInfo } = computePortfolioAndTier(d.userId);
  const heroines = getContent()
    .heroines.map((h: any) => ({ h, row: queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [d.userId, h.id]) }))
    .filter((x: any) => x.row?.unlocked)
    .map((x: any) => ({ id: x.h.id, name: x.h.name, avatar: x.h.avatar, effect: HEROINE_ASSIST[x.h.id]?.desc || '' }));
  return {
    id: d.id,
    kind: d.kind,
    item: { id: d.itemId, name: d.itemName, image: d.itemImage, list: d.list },
    seller: { id: d.sellerId, name: seller.name, title: seller.title, portrait: seller.portrait, temper: info.label },
    ask: d.ask,
    patience: d.patience,
    maxPatience: d.maxPatience,
    round: d.round,
    maxRounds: MAX_ROUNDS,
    finalCall: d.finalCall,
    minOffer: roundPrice(d.list * 0.4, d.list),
    cards: {
      funds: { used: d.used.includes('funds'), available: state.cash >= d.ask * 0.6 },
      network: { used: d.used.includes('network'), available: tierInfo.tier >= 2 },
      intel: { used: d.used.includes('intel'), cost: INTEL_COST },
      heroine: { used: d.used.includes('heroine'), heroines },
      mindread: { cost: MINDREAD_BASE * (d.mindreads + 1) },
    },
    reveal: { weakness: d.weakness, range: d.range, temperHint: d.mindreads > 0 ? info.hint : null },
    log: d.log,
    ...extra,
  };
}

const HEROINE_ASSIST: Record<string, { desc: string; apply: (d: Deal) => string }> = {
  su_qingwan: {
    desc: '拿出尽调报告压价，对方底价 -6%',
    apply: (d) => {
      d.bottom *= 0.94;
      return '苏清婉把一份尽调报告推到桌上：「这里面的几处账，需要我念出来吗？」';
    },
  },
  lu_zhiwei: {
    desc: '数据建模，精准测出对方底价区间',
    apply: (d) => {
      d.range = [roundPrice(d.bottom * 0.97, d.list), roundPrice(d.bottom * 1.03, d.list)];
      return '陆知微敲了几下键盘，低声说：「他的心理价位，就在这个区间里。」';
    },
  },
  lin_wanxing: {
    desc: '缓和气氛，对方耐心 +2',
    apply: (d) => {
      d.patience = Math.min(d.maxPatience + 2, d.patience + 2);
      return '林晚星给两人添了茶，轻声聊起了对方年轻时的故事，气氛一下松了下来。';
    },
  },
  shen_liuli: {
    desc: '舆论造势，逐利/缺钱的卖家底价 -5%，要面子的会被激怒',
    apply: (d) => {
      if (d.temper === 'proud') {
        d.patience -= 1;
        return '沈琉璃笑着提了一句「网上都在传这笔生意」，对方的脸色明显沉了下来。';
      }
      d.bottom *= 0.95;
      return '沈琉璃晃了晃手机：「这笔生意要是谈成，我今晚的直播可以帮你们宣传一下哦。」';
    },
  },
};

function sellerSay(d: Deal, text: string) {
  d.log.push({ who: 'seller', text });
}

function failDeal(d: Deal) {
  sellerSay(d, LINES.walk[d.temper]);
  setPlayerKv(d.userId, cooldownKey(d.kind, d.itemId), String(Date.now() + COOLDOWN_MS));
  closeDeal(d);
  return publicDeal(d, { done: true, result: { success: false } });
}

function closeWin(d: Deal, price: number) {
  const pct = Math.round((1 - price / d.list) * 100);
  const text =
    pct > 0
      ? `谈下【${d.itemName}】，比挂牌价少花了 ${pct}%。生意场上，筹码比嗓门重要。`
      : `签下【${d.itemName}】。价格不是问题，时机才是。`;
  const { critResult } =
    d.kind === 'business' ? purchaseBusiness(d.userId, d.itemId, price) : purchaseProperty(d.userId, d.itemId, price, text);
  sellerSay(d, LINES.accept[d.temper]);
  closeDeal(d);
  return publicDeal(d, { done: true, result: { success: true, price, saved: d.list - price, savedPct: pct, critResult } });
}

function nextRound(d: Deal) {
  d.round += 1;
  if (d.round >= MAX_ROUNDS && !d.finalCall) {
    d.finalCall = true;
    d.ask = roundPrice(Math.max(d.bottom * 1.02, d.ask), d.list);
    sellerSay(d, fill(LINES.final[d.temper], d));
  }
}

export function registerNegotiationRoutes(router: Router, auth: Auth): void {
  router.post('/deal/start', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const kind: Kind = req.body?.kind === 'property' ? 'property' : 'business';
      const itemId = String(req.body?.id || '');
      const def = kind === 'business' ? assertCanBuyBusiness(userId, itemId) : assertCanBuyProperty(userId, itemId);
      const list = kind === 'business' ? def.buyCost : def.price;
      if (!list || list <= 0) throw new Error('这处物业无需谈判');
      const cd = Number(getPlayerKv(userId, cooldownKey(kind, itemId)) || 0);
      if (cd > Date.now()) {
        throw new Error(`对方还在气头上，${Math.ceil((cd - Date.now()) / 60000)} 分钟后再来谈`);
      }
      assertCashSufficient(userId, Math.round(list * 0.6));
      spendEnergyOrThrow(userId, START_ENERGY);

      const prev = dealByUser.get(userId);
      if (prev && deals.get(prev)) closeDeal(deals.get(prev)!);

      const sellerId = SELLER_OF[itemId] || 'qian';
      const temper = SELLERS[sellerId].temper;
      const { skills } = computePortfolioAndTier(userId);
      const bottom = list * rand(0.72, 0.9) * (1 - Math.min(0.1, (skills.upgradeDiscountPct || 0) * 0.4));
      const info = TEMPER_INFO[temper];
      const d: Deal = {
        id: crypto.randomBytes(9).toString('hex'),
        userId,
        createdAt: Date.now(),
        kind,
        itemId,
        itemName: def.name,
        itemImage: def.image || '',
        list,
        sellerId,
        temper,
        bottom,
        ask: roundPrice(list * 1.08, list),
        patience: info.patience,
        maxPatience: info.patience,
        round: 0,
        used: [],
        mindreads: 0,
        weakness: null,
        range: null,
        log: [],
        finalCall: false,
      };
      d.log.push({ who: 'system', text: `挂牌价 ${formatMoney(list)}。对方性格：${info.label}。` });
      sellerSay(d, fill(LINES.open[temper], d));
      deals.set(d.id, d);
      dealByUser.set(userId, d.id);
      res.json({ deal: publicDeal(d), state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/deal/act', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const d = deals.get(String(req.body?.id || ''));
      if (!d || d.userId !== userId) throw new Error('谈判已结束或已过期');
      const action = String(req.body?.action || '');
      let out: any;

      if (action === 'offer') {
        const price = roundPrice(Number(req.body?.price) || 0, d.list);
        if (price < d.list * 0.4) throw new Error('出价太低，对方根本不会坐下来谈');
        if (price >= d.ask) {
          assertCashSufficient(userId, d.ask);
          out = closeWin(d, d.ask);
        } else {
          d.log.push({ who: 'me', text: `我出 ${formatMoney(price)}。` });
          if (price >= d.bottom) {
            assertCashSufficient(userId, price);
            out = closeWin(d, price);
          } else if (d.finalCall) {
            out = failDeal(d);
          } else {
            const gap = (d.bottom - price) / d.list;
            let loss = gap > 0.15 ? 2 : 1;
            if (d.temper === 'proud' && gap > 0.08) loss += 1;
            d.patience -= loss;
            if (d.patience <= 0) {
              out = failDeal(d);
            } else {
              const target = Math.max(price, d.bottom);
              d.ask = roundPrice(Math.max(d.bottom, d.ask - (d.ask - target) * TEMPER_INFO[d.temper].concession), d.list);
              sellerSay(d, gap > 0.12 ? LINES.lowball[d.temper] : fill(LINES.counter[d.temper], d));
              if (gap > 0.12) sellerSay(d, fill(LINES.counter[d.temper], d));
              nextRound(d);
              out = publicDeal(d);
            }
          }
        }
      } else if (action === 'accept') {
        assertCashSufficient(userId, d.ask);
        out = closeWin(d, d.ask);
      } else if (action === 'leave') {
        d.log.push({ who: 'me', text: '今天先到这里吧。' });
        out = failDeal(d);
      } else if (action === 'mindread') {
        const cost = MINDREAD_BASE * (d.mindreads + 1);
        spendSysPointsOrThrow(userId, cost);
        d.mindreads += 1;
        const insight = computePortfolioAndTier(userId).skills.insightLevel || 0;
        const width = Math.max(0.02, 0.08 - insight * 0.012);
        const lo = d.bottom * (1 - rand(0, width));
        d.range = [roundPrice(lo, d.list), roundPrice(lo * (1 + width), d.list)];
        const mood = d.patience <= 1 ? '他已经快坐不住了' : d.patience >= d.maxPatience - 1 ? '他还很从容' : '他开始有些不耐烦';
        d.log.push({ who: 'system', text: `【天枢读心】${mood}。心理底价约在 ${formatMoney(d.range[0])} – ${formatMoney(d.range[1])}。` });
        out = publicDeal(d);
      } else if (['funds', 'network', 'intel', 'heroine'].includes(action)) {
        const card = action as CardId;
        if (d.used.includes(card)) throw new Error('这张牌已经打过了');
        if (d.finalCall) throw new Error('对方已经给出最后报价，只能成交或离开');
        const { state, tierInfo } = computePortfolioAndTier(userId);
        if (card === 'funds') {
          if (state.cash < d.ask * 0.6) throw new Error('账上现金不够亮出来镇场');
          d.bottom *= d.temper === 'greedy' ? 0.95 : d.temper === 'anxious' ? 0.97 : 0.98;
          d.log.push({ who: 'me', text: `（把银行流水推了过去）全款，今天就能到账。` });
          sellerSay(d, d.temper === 'greedy' ? '……全款？那倒是可以再商量商量。' : '实力是有的，我看到了。');
        } else if (card === 'network') {
          if (tierInfo.tier < 2) throw new Error('社会阶层不够，这张牌打不出去');
          d.log.push({ who: 'me', text: '前两天和你们行会的几位老前辈吃饭，还聊起你。' });
          if (d.temper === 'proud') {
            d.bottom *= 0.98;
            d.patience -= 1;
            sellerSay(d, '拿人压我？我最不吃这一套。');
          } else {
            d.bottom *= d.temper === 'anxious' ? 0.93 : 0.97;
            sellerSay(d, d.temper === 'anxious' ? '……你认识他们？那这事好说。' : '哦？那倒是自己人了。');
          }
        } else if (card === 'intel') {
          spendSysPointsOrThrow(userId, INTEL_COST);
          d.weakness = WEAKNESS[d.temper][Math.floor(Math.random() * WEAKNESS[d.temper].length)];
          d.bottom *= 0.95;
          d.log.push({ who: 'system', text: `【情报】${d.weakness}` });
          sellerSay(d, '……你从哪听来的？');
        } else {
          const hid = String(req.body?.heroineId || '');
          const row = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, hid]);
          const assist = HEROINE_ASSIST[hid];
          if (!row?.unlocked || !assist) throw new Error('这位红颜还不能来帮忙');
          d.log.push({ who: 'ally', allyId: hid, text: assist.apply(d) });
        }
        d.used.push(card);
        if (d.patience <= 0) out = failDeal(d);
        else {
          nextRound(d);
          out = publicDeal(d);
        }
      } else {
        throw new Error('未知操作');
      }
      res.json({ deal: out, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
