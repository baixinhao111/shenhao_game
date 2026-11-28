/**
 * 商业帝国扩展：产业经营事件、成就与可佩戴称号、主线联动股市情报、账号安全与存档导出
 */
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response, Router } from 'express';
import { resolveHeroineActivePortrait } from './bonds.js';
import { getContent } from './contentLoader.js';
import { execute, queryAll, queryOne } from './db.js';
import {
  assertEnergySufficient,
  assertSysPointsSufficient,
  grant,
  spendEnergyOrThrow,
  spendSysPointsOrThrow,
} from './economy.js';
import {
  buildFullGameState,
  computePortfolioAndTier,
  formatMoney,
  getPlayerKv,
  setPlayerKv,
} from './gameEngine.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const KV_ACH_STATS = 'ach_stats';
const KV_ACH_CLAIMED = 'ach_claimed';
const KV_EQUIPPED_TITLE = 'equipped_title';
const KV_BIZ_EV_CD = 'biz_ev_cd';

const BIZ_EVENT_COOLDOWN_MS = 90 * 60 * 1000; // 90 mins between operating events per business
/** at most this many events are open at once across all businesses (red dots everywhere stop meaning anything) */
const BIZ_EVENT_MAX_ACTIVE = 2;
/** a resolved event keeps its slot this long, so the queue can't be churned through in one sitting */
const BIZ_EVENT_SLOT_MS = 40 * 60 * 1000;
const KV_BIZ_EV_RECENT = 'biz_ev_recent';

function parseKv<T>(userId: number, key: string, fallback: T): T {
  const raw = getPlayerKv(userId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ================= ACHIEVEMENTS & WEARABLE TITLES =================

export function getAchievementStats(userId: number): Record<string, number> {
  return parseKv<Record<string, number>>(userId, KV_ACH_STATS, {});
}

export function incrementAchievementStat(userId: number, statKey: string, delta = 1): void {
  if (!statKey || !Number.isFinite(delta) || delta === 0) return;
  const stats = getAchievementStats(userId);
  stats[statKey] = Math.max(0, Number(stats[statKey] || 0) + delta);
  setPlayerKv(userId, KV_ACH_STATS, JSON.stringify(stats));
}

export function getEquippedTitleInfo(userId: number): { id: string; titleBadge: string; titleTone: string } | null {
  const equippedId = getPlayerKv(userId, KV_EQUIPPED_TITLE) || '';
  if (!equippedId) return null;
  const ach = (getContent().achievements || []).find((a: any) => a.id === equippedId);
  if (!ach || !ach.titleBadge) return null;
  return { id: ach.id, titleBadge: ach.titleBadge, titleTone: ach.titleTone || 'gold' };
}

export function buildAchievementsView(
  userId: number,
  liveContext: { netWorth: number; episodesCompleted: number; ownedAssetsCount: number },
) {
  const content = getContent();
  const stats = getAchievementStats(userId);
  const claimed = new Set(parseKv<string[]>(userId, KV_ACH_CLAIMED, []));
  const equippedId = getPlayerKv(userId, KV_EQUIPPED_TITLE) || '';

  return (content.achievements || []).map((a: any) => {
    let progress = Number(stats[a.statKey] || 0);
    if (a.statKey === 'netWorth') progress = Math.max(progress, liveContext.netWorth);
    if (a.statKey === 'episodesCompleted') progress = Math.max(progress, liveContext.episodesCompleted);
    if (a.statKey === 'ownedAssetsCount') progress = Math.max(progress, liveContext.ownedAssetsCount);

    const unlocked = progress >= Number(a.target || 1);
    const isClaimed = claimed.has(a.id);
    return {
      ...a,
      progress: Math.min(progress, Number(a.target || 1)),
      rawProgress: progress,
      unlocked,
      claimed: isClaimed,
      equipped: equippedId === a.id && (unlocked || isClaimed),
    };
  });
}

// ================= BUSINESS OPERATING EVENTS =================

export function buildActiveBusinessEventsMap(userId: number, ownedBizRows: any[]): Record<string, any> {
  const content = getContent();
  const allEvents: any[] = content.businessEvents || [];
  if (allEvents.length === 0 || ownedBizRows.length === 0) return {};

  const cdMap = parseKv<Record<string, { nextAt: number; idx: number }>>(userId, KV_BIZ_EV_CD, {});
  const now = Date.now();
  const out: Record<string, any> = {};

  const ready: Array<{ bizId: string; since: number; ev: any }> = [];
  for (const row of ownedBizRows) {
    const bizId = row.business_id;
    const pool = allEvents.filter((e) => e.businessId === bizId);
    if (pool.length === 0) continue;
    const rec = cdMap[bizId];
    if (rec && rec.nextAt > now) continue;
    const idx = rec ? rec.idx % pool.length : 0;
    ready.push({ bizId, since: rec?.nextAt || 0, ev: pool[idx] });
  }
  // longest-waiting first; slots taken by recently resolved events stay closed for a while
  const recent = parseKv<number[]>(userId, KV_BIZ_EV_RECENT, []).filter((t) => now - t < BIZ_EVENT_SLOT_MS);
  const slots = Math.max(0, BIZ_EVENT_MAX_ACTIVE - recent.length);
  ready.sort((a, b) => a.since - b.since || a.bizId.localeCompare(b.bizId));
  for (const r of ready.slice(0, slots)) out[r.bizId] = r.ev;
  return out;
}

// ================= STORY-LINKED STOCKS & WEEKLY VIP THEME =================

export function getWeeklyCruiseTheme(): { name: string; desc: string; tokenMult: number } {
  const weekIdx = Math.floor(Date.now() / (7 * 24 * 3600 * 1000)) % 3;
  const themes = [
    { name: '公海豪赌周 · 勋章 ×1.5', desc: '本周星耀号 21 点胜出额外赠送 50% 星耀勋章', tokenMult: 1.5 },
    { name: '苏富比暗拍预热局', desc: '本周公海贵宾席开放，黑杰克赢取更高勋章奖池', tokenMult: 1.25 },
    { name: '海城慈善夜宴专场', desc: '顶奢名流齐聚甲板，筹码对决热度拉满', tokenMult: 1.2 },
  ];
  return themes[weekIdx];
}

export function getStoryStockContext(userId: number) {
  const progressRows = queryAll<{ episode_id: string }>('SELECT episode_id FROM player_progress WHERE user_id = ?', [userId]);
  const done = new Set(progressRows.map((r) => r.episode_id));
  const props = queryAll<any>('SELECT custom_name FROM player_properties WHERE user_id = ? AND custom_name != ""', [userId]);
  const namedTower = props[0]?.custom_name || '';

  // 赵氏地产控股: bears heavily after ep_005/014/024/032 face-slaps
  let zhaoBias = 0;
  let zhaoTag = '赵氏核心上市平台';
  let zhaoHot = false;
  if (done.has('ep_032')) {
    zhaoBias = -0.26;
    zhaoTag = '旧案清算 · 崩盘退市';
    zhaoHot = true;
  } else if (done.has('ep_024')) {
    zhaoBias = -0.22;
    zhaoTag = '破产重组 · 暴跌';
    zhaoHot = true;
  } else if (done.has('ep_014')) {
    zhaoBias = -0.16;
    zhaoTag = '授信冻结 · 利空';
    zhaoHot = true;
  } else if (done.has('ep_005') || done.has('ep_004')) {
    zhaoBias = -0.11;
    zhaoTag = '暗账丑闻 · 看空';
    zhaoHot = true;
  }

  // 盛世资本集团: rallies after cleaning internal corruption & partnering with Lu Chen
  let shengshiBias = 0;
  let shengshiTag = '苏清婉执掌资本旗舰';
  let shengshiHot = false;
  if (done.has('ep_024')) {
    shengshiBias = 0.21;
    shengshiTag = '共主海城 · 强势看多';
    shengshiHot = true;
  } else if (done.has('ep_014')) {
    shengshiBias = 0.14;
    shengshiTag = '联手护盘 · 利好';
    shengshiHot = true;
  } else if (done.has('ep_006') || done.has('ep_005')) {
    shengshiBias = 0.09;
    shengshiTag = '清查内鬼 · 修复';
    shengshiHot = true;
  }

  let headline = '海城财经快讯：陆家湾资本暗流涌动，机构资金正密集调仓。';
  if (namedTower) {
    headline = `海城头条：地标【${namedTower}】登顶陆家湾成交榜，机构热议新晋神秘大鳄动向！`;
  } else if (done.has('ep_032')) {
    headline = '海城财经：2016 金融风暴旧账重审，海城实业联盟股价全线领涨！';
  } else if (done.has('ep_024')) {
    headline = '海城财经：赵氏地产多笔质押爆仓退场，盛世与新锐实业资本逆势吸筹！';
  } else if (done.has('ep_014')) {
    headline = '海城财经：外滩授信风暴发酵，赵氏关联盘承压，盛世资本稳步回暖。';
  } else if (done.has('ep_005')) {
    headline = '海城财经：盛世资本雷霆清查三十二层暗账，赵氏关联供应链股价承压。';
  }

  return { zhaoBias, zhaoTag, zhaoHot, shengshiBias, shengshiTag, shengshiHot, headline };
}

export function getStoryLinkedStockExtras(userId: number) {
  const ctx = getStoryStockContext(userId);
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const wave = (seed: number) => Math.sin(bucket * 0.7 + seed) * 0.11 + Math.cos(bucket * 0.4 + seed) * 0.06;

  const zhaoWave = wave(4.3) + ctx.zhaoBias * 0.5;
  const shengshiWave = wave(5.7) + ctx.shengshiBias * 0.5;

  const extraQuotes = [
    {
      id: 'stk_zhao',
      name: '赵氏地产控股',
      code: '600998',
      base: 58,
      price: Number(Math.max(8, 58 * (1 + zhaoWave)).toFixed(2)),
      changePct: Number((zhaoWave * 100).toFixed(2)),
      trend: (ctx.zhaoBias < -0.05 ? 'down' : zhaoWave >= 0 ? 'up' : 'down') as 'up' | 'down',
      storyTag: ctx.zhaoTag,
    },
    {
      id: 'stk_shengshi',
      name: '盛世资本集团',
      code: '601888',
      base: 112,
      price: Number(Math.max(15, 112 * (1 + shengshiWave)).toFixed(2)),
      changePct: Number((shengshiWave * 100).toFixed(2)),
      trend: (ctx.shengshiBias > 0.05 ? 'up' : shengshiWave >= 0 ? 'up' : 'down') as 'up' | 'down',
      storyTag: ctx.shengshiTag,
    },
  ];

  return { extraQuotes, headline: ctx.headline };
}

// ================= BUSINESS EVENT MINI-THEATER BUILDER =================

function buildBusinessEventScript(userId: number, businessId: string) {
  const content = getContent();
  const portfolio = computePortfolioAndTier(userId);
  const owned = portfolio.ownedBiz.find((b) => b.business_id === businessId);
  if (!owned) throw new Error('尚未收购该产业');

  const activeMap = buildActiveBusinessEventsMap(userId, portfolio.ownedBiz);
  const ev = activeMap[businessId];
  if (!ev) throw new Error('该产业当前没有待处理的经营事件');

  const biz = content.businesses.find((x: any) => x.id === businessId);
  if (!biz) throw new Error('产业信息不存在');

  const completedRows = queryAll<{ episode_id: string }>('SELECT episode_id FROM player_progress WHERE user_id = ?', [userId]);
  const completedSet = new Set(completedRows.map((r) => r.episode_id));
  const protagonistSprite =
    completedSet.has('ep_003') || completedSet.size >= 3
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const assignedDef = owned.assigned_heroine_id
    ? content.heroines.find((h: any) => h.id === owned.assigned_heroine_id)
    : null;
  const assignedVisual = assignedDef ? resolveHeroineActivePortrait(userId, assignedDef) : null;

  const reporter = assignedDef
    ? {
        speaker: assignedDef.id,
        name: assignedDef.name,
        role: `${biz.name} · 坐镇顾问`,
        avatar: assignedDef.avatar,
        portrait: assignedVisual?.portrait || assignedDef.portrait,
        isHeroine: true,
      }
    : {
        speaker: 'chen_mo',
        name: '陈默',
        role: '私人管家',
        avatar: '/assets/characters/chen_mo.png',
        portrait: '/assets/characters/chen_mo.png',
        isHeroine: false,
      };

  const heroineBriefLine: Record<string, { text: string; thought: string; close: string; closeThought: string }> = {
    su_qingwan: {
      text: `「${ev.title}」的风声我已让团队先压了下来。几方人马都在等你的态度，三条应对预案已经排好——你怎么定？`,
      thought: '有他在身后兜底，哪怕是再棘手的商战局，我也不会乱半分阵脚。',
      close: `局势已经彻底翻过来了。${biz.name}这边的额外回款我会盯紧入账，今晚留点时间给我。`,
      closeThought: '和他并肩拆局的感觉，比一个人赢下十场并购还要让人踏实。',
    },
    lin_wanxing: {
      text: `学长，${biz.name}这边刚才突然出了状况……我先把现场和客人都安抚住了，具体的应对方案想听听你的主意。`,
      thought: '还好我今天就在这边坐镇，能帮他先顶住第一波压力。',
      close: `太好了，总算顺顺利利化解啦！店里大家都在夸你反应快，这波额外收益马上就能结算入库。`,
      closeThought: '能帮到学长一点点，心里就像晒过太阳一样暖融融的。',
    },
    shen_liuli: {
      text: `哥哥，你看他们又来搞小动作了～「${ev.title}」这点风浪，是稳稳吃下，还是让我直接替你掀翻全场？`,
      thought: '敢动哥哥名下的产业，真当我沈琉璃是好惹的呢？',
      close: `搞定收工！刚才那波反杀实在太解气了，收益翻番入账，今晚庆功酒哥哥可跑不掉～`,
      closeThought: '看吧，我就说只要我出手，全海城没谁能抢得过哥哥的风头。',
    },
    lu_zhiwei: {
      text: `${biz.name}的异常动向我三分钟前就截下来了。对方冲着「${ev.title}」来的，三条可行路径都在这里，你拍板。`,
      thought: '顺手把对方底牌也摸了一遍，等他定下方案我再补上最后一把锁。',
      close: `链路已经闭环，对手这回算是彻底踢到铁板了。额外分红马上进账，顺便帮我带杯冰美式。`,
      closeThought: '跟他配合打反击，效率永远比单打独斗高出一截。',
    },
  };

  const heroineOpt = (ev.choices || []).find((c: any) => c.kind === 'heroine' && c.requireHeroine);
  const reqHeroineForHint = heroineOpt
    ? content.heroines.find((h: any) => h.id === heroineOpt.requireHeroine)
    : null;

  const brief = assignedDef ? heroineBriefLine[assignedDef.id] : null;
  const briefText = brief
    ? brief.text
    : assignedDef
      ? `「${ev.title}」的一线情况已经稳住，接下来怎么落子，听你定夺。`
      : `少爷，${biz.name}突发「${ev.title}」。现场主管已把三条可行方案汇总完毕，请您定夺。`;
  const briefThought = brief
    ? brief.thought
    : !assignedDef && reqHeroineForHint
      ? `若能先委派${reqHeroineForHint.name}坐镇${biz.name}，往后此类突发状况便可动用她的专属破局方案。`
      : undefined;

  const bizDetail = portfolio.bizDetails[businessId];
  const hr = Math.max(15000, Number(bizDetail?.incomePerHour || 20000));
  const curEnergy = Number(portfolio.state.energy || 0);
  const curSysPts = Number(portfolio.state.sys_points || 0);

  const options = (ev.choices || []).map((c: any) => {
    const costEnergy = Number(c.costEnergy || 0);
    const costSysPoints = Number(c.costSysPoints || 0);
    const reqH = c.requireHeroine ? content.heroines.find((h: any) => h.id === c.requireHeroine) : null;
    const secH = c.secondaryHeroine ? content.heroines.find((h: any) => h.id === c.secondaryHeroine) : null;
    const secRow = secH
      ? queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, secH.id])
      : null;
    const duoReady = Boolean(c.kind === 'heroine' && secH && secRow?.unlocked);
    const estCash = Math.round(hr * Number(c.incomeHoursReward || 3) * (duoReady ? 1.2 : 1));
    const heroineReady = c.kind !== 'heroine' || (c.requireHeroine && owned.assigned_heroine_id === c.requireHeroine);

    let disabledReason: string | undefined;
    if (!heroineReady) {
      disabledReason = `需先在产业页委派 ${reqH?.name || '契合红颜'} 坐镇`;
    } else if (costEnergy > curEnergy) {
      disabledReason = `精力不足（需 ${costEnergy}，当前 ${curEnergy}）`;
    } else if (costSysPoints > curSysPts) {
      disabledReason = `天枢积分不足（需 ${costSysPoints}，当前 ${curSysPts}）`;
    }

    const branchNodes: any[] = [];
    if (c.kind === 'tianshu') {
      branchNodes.push(
        {
          type: 'system_alert',
          title: '天枢推演 · 最优破局启动',
          sprite: protagonistSprite,
          text: `已消耗 ${costSysPoints} 点天枢积分，完成【${ev.title}】多维链路推演，反制指令已同步至【${biz.name}】现场。`,
        },
        {
          type: 'narration',
          effect: 'impact',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'both',
          text: c.resultText,
        },
        {
          type: 'dialogue',
          speaker: reporter.speaker,
          name: reporter.name,
          role: reporter.role,
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'right',
          text: reporter.isHeroine
            ? `这一手实在太精准了……${biz.name}的额外回款马上就会入账。`
            : `干脆利落，少爷。现场已全面接管，这笔额外分红正在打入您的账户。`,
        },
      );
    } else if (c.kind === 'heroine') {
      const secVisual = secH ? resolveHeroineActivePortrait(userId, secH) : null;
      branchNodes.push(
        {
          type: 'dialogue',
          speaker: 'protagonist',
          name: '陆沉',
          role: '你',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'left',
          text: duoReady && secH
            ? `好，这件事交给你来主控，我同步让${secH.name}那边配合你双线合围！`
            : `好，这件事交给你来收口，需要什么资源我这边全权兜底。`,
        },
        ...(duoReady && secH
          ? [
              {
                type: 'dialogue',
                speaker: secH.id,
                name: secH.name,
                role: `双线支援 · ${secH.title}`,
                leftSprite: secVisual?.portrait || secH.portrait,
                rightSprite: reporter.portrait,
                activeSide: 'left',
                effect: 'flash',
                text: `这边已经同步切入完毕，${reporter.name}，正面交给你收网——我们联手，海城没人接得住这一波。`,
              },
            ]
          : []),
        {
          type: 'narration',
          effect: 'flash',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'right',
          text: c.resultText,
        },
        {
          type: 'dialogue',
          speaker: reporter.speaker,
          name: reporter.name,
          role: reporter.role,
          effect: 'heartbeat',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'right',
          innerThought: brief?.closeThought,
          text: brief?.close || `圆满解决！${biz.name}这波不仅化解了危机，额外收益也一并落袋了。`,
        },
      );
    } else {
      branchNodes.push(
        {
          type: 'dialogue',
          speaker: 'protagonist',
          name: '陆沉',
          role: '你',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'left',
          text: `按稳健预案立刻执行，先把现场节奏与口碑稳住。`,
        },
        {
          type: 'narration',
          effect: 'flash',
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'both',
          text: c.resultText,
        },
        {
          type: 'dialogue',
          speaker: reporter.speaker,
          name: reporter.name,
          role: reporter.role,
          leftSprite: protagonistSprite,
          rightSprite: reporter.portrait,
          activeSide: 'right',
          text: reporter.isHeroine
            ? `妥帖收尾了，${biz.name}运转恢复如常，这一波额外收益马上结算到账。`
            : `明白，现场已平稳接管，本轮额外收益即刻为您结算入账。`,
        },
      );
    }

    return {
      id: c.id,
      label: c.label,
      tag: duoReady && secH ? `双美联手 · ${reqH?.name}×${secH.name} (+20% 收益)` : undefined,
      kind: c.kind,
      costEnergy,
      costSysPoints,
      estCash,
      sysPoints: Number(c.sysPoints || 0),
      affectionGain: Number(c.affectionGain || 0),
      requireHeroine: c.requireHeroine || undefined,
      requireHeroineName: reqH?.name,
      disabledReason,
      resultText: c.resultText,
      branchNodes,
    };
  });

  const nodes = [
    {
      type: 'narration',
      bg: biz.image,
      sceneBanner: `${biz.name} · ${ev.tag}`,
      sprite: reporter.portrait,
      text: `${biz.name}传来紧急简报——${ev.summary}`,
    },
    {
      type: 'dialogue',
      speaker: reporter.speaker,
      name: reporter.name,
      role: reporter.role,
      leftSprite: protagonistSprite,
      rightSprite: reporter.portrait,
      activeSide: 'right',
      innerThought: briefThought,
      text: briefText,
    },
    {
      type: 'system_choice',
      id: ev.id,
      title: `${biz.name} · ${ev.title}`,
      leftSprite: protagonistSprite,
      rightSprite: reporter.portrait,
      activeSide: 'both',
      options,
    },
  ];

  return {
    businessId: biz.id,
    businessName: biz.name,
    eventId: ev.id,
    title: ev.title,
    subtitle: `${biz.name} · ${ev.tag}`,
    sceneLabel: `${biz.name} · 经营事件`,
    bg: biz.image,
    locationLabel: biz.name,
    heroineId: reporter.isHeroine ? reporter.speaker : undefined,
    heroineName: reporter.name,
    heroineAvatar: reporter.avatar,
    heroinePortrait: reporter.portrait,
    nodes,
  };
}

// ================= ROUTES =================

export function registerEmpireRoutes(router: Router, auth: Auth): void {
  // 1a. Start Business Operating Event Mini-Theater
  router.post('/business/event/start', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const businessId = String(req.body?.businessId || '');
      const script = buildBusinessEventScript(userId, businessId);
      res.json({ success: true, script });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 1b. Resolve Business Operating Event
  router.post('/business/event/resolve', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const businessId = String(req.body?.businessId || '');
      const eventId = String(req.body?.eventId || '');
      const choiceId = String(req.body?.choiceId || '');

      const portfolio = computePortfolioAndTier(userId);
      const owned = portfolio.ownedBiz.find((b) => b.business_id === businessId);
      if (!owned) throw new Error('尚未收购该产业');

      const activeMap = buildActiveBusinessEventsMap(userId, portfolio.ownedBiz);
      const ev = activeMap[businessId];
      if (!ev || ev.id !== eventId) throw new Error('该经营事件已处理或已过期');

      const choice = (ev.choices || []).find((c: any) => c.id === choiceId);
      if (!choice) throw new Error('无效的处理方案');

      if (choice.kind === 'heroine') {
        if (!choice.requireHeroine || owned.assigned_heroine_id !== choice.requireHeroine) {
          throw new Error('需先委派对应契合红颜坐镇该产业才可使用此方案');
        }
      }

      const costEnergy = Number(choice.costEnergy || 0);
      const costSysPoints = Number(choice.costSysPoints || 0);
      if (costEnergy > 0) assertEnergySufficient(userId, costEnergy);
      if (costSysPoints > 0) assertSysPointsSufficient(userId, costSysPoints);

      if (costEnergy > 0) spendEnergyOrThrow(userId, costEnergy);
      if (costSysPoints > 0) spendSysPointsOrThrow(userId, costSysPoints);

      const bizDetail = portfolio.bizDetails[businessId];
      const hr = Math.max(15000, Number(bizDetail?.incomePerHour || 20000));
      let duoActive = false;
      if (choice.kind === 'heroine' && choice.secondaryHeroine) {
        const secRow = queryOne<any>(
          'SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?',
          [userId, choice.secondaryHeroine],
        );
        if (secRow?.unlocked) duoActive = true;
      }
      const cashReward = Math.round(hr * Number(choice.incomeHoursReward || 3) * (duoActive ? 1.2 : 1));
      const sysPointsReward = Number(choice.sysPoints || 0);
      grant(userId, cashReward, sysPointsReward);

      let affectionGain = 0;
      if (choice.affectionGain && choice.requireHeroine) {
        affectionGain = Number(choice.affectionGain);
        execute(
          'UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ? AND unlocked = 1',
          [affectionGain, Date.now(), userId, choice.requireHeroine],
        );
      }
      if (duoActive && choice.secondaryHeroine) {
        execute(
          'UPDATE player_heroines SET affection = affection + 6, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ? AND unlocked = 1',
          [Date.now(), userId, choice.secondaryHeroine],
        );
      }

      // Advance cooldown & rotate to next event for this business
      const cdMap = parseKv<Record<string, { nextAt: number; idx: number }>>(userId, KV_BIZ_EV_CD, {});
      const prevIdx = cdMap[businessId]?.idx ?? 0;
      cdMap[businessId] = { nextAt: Date.now() + BIZ_EVENT_COOLDOWN_MS, idx: prevIdx + 1 };
      setPlayerKv(userId, KV_BIZ_EV_CD, JSON.stringify(cdMap));
      const recent = parseKv<number[]>(userId, KV_BIZ_EV_RECENT, []).filter((t) => Date.now() - t < BIZ_EVENT_SLOT_MS);
      setPlayerKv(userId, KV_BIZ_EV_RECENT, JSON.stringify([...recent, Date.now()]));

      incrementAchievementStat(userId, 'bizEventsResolved', 1);

      res.json({
        success: true,
        resultText: choice.resultText || '经营事件已妥善化解！',
        cashReward,
        sysPoints: sysPointsReward,
        affectionGain,
        message: `额外获利 ${formatMoney(cashReward)}${sysPointsReward > 0 ? ` · 天枢积分 +${sysPointsReward}` : ''}`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 2. Claim Achievement Reward
  router.post('/achievements/claim', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const achievementId = String(req.body?.achievementId || '');
      const state = buildFullGameState(userId);
      const ach = (state?.achievements || []).find((a: any) => a.id === achievementId);
      if (!ach) throw new Error('成就不存在');
      if (!ach.unlocked) throw new Error('成就条件尚未达成');
      if (ach.claimed) throw new Error('该成就奖励已领取');

      const claimed = parseKv<string[]>(userId, KV_ACH_CLAIMED, []);
      claimed.push(ach.id);
      setPlayerKv(userId, KV_ACH_CLAIMED, JSON.stringify(claimed));

      grant(userId, Number(ach.rewardCash || 0), Number(ach.rewardPoints || 0));

      // Auto-equip first earned title if player has none equipped yet
      if (ach.titleBadge && !getPlayerKv(userId, KV_EQUIPPED_TITLE)) {
        setPlayerKv(userId, KV_EQUIPPED_TITLE, ach.id);
      }

      res.json({
        success: true,
        rewardCash: Number(ach.rewardCash || 0),
        rewardPoints: Number(ach.rewardPoints || 0),
        titleBadge: ach.titleBadge || '',
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. Equip / Clear Wearable Title
  router.post('/achievements/equip-title', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const achievementId = String(req.body?.achievementId || '');
      if (!achievementId) {
        setPlayerKv(userId, KV_EQUIPPED_TITLE, '');
        res.json({ success: true, message: '已卸下称号', state: buildFullGameState(userId) });
        return;
      }

      const state = buildFullGameState(userId);
      const ach = (state?.achievements || []).find((a: any) => a.id === achievementId);
      if (!ach || (!ach.unlocked && !ach.claimed)) throw new Error('尚未解锁该称号');
      if (!ach.titleBadge) throw new Error('该成就无专属称号');

      setPlayerKv(userId, KV_EQUIPPED_TITLE, ach.id);
      res.json({
        success: true,
        message: `已佩戴称号「${ach.titleBadge}」`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4. Account Password Change
  router.post('/auth/change-password', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const oldPassword = String(req.body?.oldPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 4 || newPassword.length > 48) {
        throw new Error('新密码长度需在 4~48 位之间');
      }
      const user = queryOne<any>('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
      if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
        throw new Error('原密码不正确');
      }
      const nextHash = bcrypt.hashSync(newPassword, 8);
      execute('UPDATE users SET password_hash = ? WHERE id = ?', [nextHash, userId]);
      res.json({ success: true, message: '密码修改成功，下次登录请使用新密码' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Export Player Save Snapshot (JSON backup)
  router.get('/account/export', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const state = buildFullGameState(userId);
      const memories = queryAll<any>(
        'SELECT heroine_id, summary, created_at FROM npc_memories WHERE user_id = ? ORDER BY id DESC LIMIT 40',
        [userId],
      );
      res.json({
        exportedAt: new Date().toISOString(),
        version: '2.0',
        user: state?.user,
        player: state?.player,
        completedEpisodes: state?.stories?.completedEpisodes || [],
        heroines: (state?.heroines || []).map((h: any) => ({
          id: h.id,
          name: h.name,
          unlocked: h.unlocked,
          affection: h.affection,
          equippedOutfit: h.equippedOutfit,
        })),
        businesses: (state?.businesses || []).filter((b: any) => b.owned).map((b: any) => ({ id: b.id, name: b.name, level: b.level })),
        properties: (state?.properties || []).filter((p: any) => p.owned).map((p: any) => ({ id: p.id, name: p.displayName, renovationLevel: p.renovationLevel })),
        assets: (state?.assets || []).filter((a: any) => a.owned).map((a: any) => ({ id: a.id, name: a.name })),
        achievements: (state?.achievements || []).filter((a: any) => a.unlocked).map((a: any) => ({ id: a.id, name: a.name, titleBadge: a.titleBadge })),
        memories,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
