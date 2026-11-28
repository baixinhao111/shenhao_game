/**
 * 顶奢资产场外排面系统：
 *  1. 豪车 / 游艇 / 海岛 / 公务机 / 孤品 / 佩戴称号反哺约会与商战谈判
 *  2. 顶级资产专属「豪奢私宴 / 私赏剧场」（VisualNovelTheater mode: 'luxury'）
 */
import type { NextFunction, Request, Response, Router } from 'express';
import { resolveHeroineActivePortrait } from './bonds.js';
import { getContent } from './contentLoader.js';
import { execute, queryAll, queryOne } from './db.js';
import { assertEnergySufficient, grant, spendEnergyOrThrow } from './economy.js';
import { getEquippedTitleInfo } from './empire.js';
import {
  buildFullGameState,
  computePortfolioAndTier,
  getPlayerKv,
  postMoment,
  setPlayerKv,
  todayKey,
} from './gameEngine.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const KV_LUXURY_DONE = 'luxury_theaters_done';
const KV_LUXURY_TODAY = 'luxury_theaters_today';

function parseKv<T>(userId: number, key: string, fallback: T): T {
  const raw = getPlayerKv(userId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function interpolate(text: string, vars: Record<string, string>): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// ================= PRESTIGE PROFILE (DATES & NEGOTIATION) =================

export interface DatePrestigeBonus {
  bonusAffection: number;
  bonusPoints: number;
  badge: string | null;
  carName: string | null;
  openingNode: any | null;
}

export function computeDatePrestigeBonus(
  userId: number,
  heroineDef: any,
  protagonistSprite: string,
  heroinePortrait: string,
): DatePrestigeBonus {
  const { state, ownedAssets } = computePortfolioAndTier(userId);
  const content = getContent();
  const ownedIds = new Set(ownedAssets.map((a) => a.asset_id));
  const car = content.assetsCatalog.assets.find((a: any) => a.id === state.equipped_car_id);
  const titleInfo = getEquippedTitleInfo(userId);

  const power = Number(car?.racePower || 0);
  const hasWatch = ownedIds.has('watch_tourbillon');
  const hasFleet = ownedIds.has('yacht_poseidon') || ownedIds.has('island_private') || ownedIds.has('jet_g700');

  let bonusAffection = 0;
  let bonusPoints = 0;
  let badge: string | null = null;
  let reactionText = '';
  let thoughtText = '';

  if (power >= 90) {
    bonusAffection = 5;
    bonusPoints = 10;
    badge = `${car.name} · 顶级排面`;
    const byH: Record<string, [string, string]> = {
      su_qingwan: [
        `你开【${car.name}】来接我？刚才一路过来，整条街的目光都粘在车标上了……低调点，陆先生。`,
        '嘴上提醒他低调，其实副驾驶门被他拉开的瞬间，虚荣心被轻轻填满了。',
      ],
      lin_wanxing: [
        `呀……这就是那台全球限量的【${car.name}】吗？路过的同学都在悄悄拍照呢，坐进去我都怕把真皮座椅压皱啦～`,
        '他每次来接我都这么郑重，好像生怕委屈了我一点点。',
      ],
      shen_liuli: [
        `哇哦，哥哥今天把【${car.name}】开出来了？这排面拉满，明天同城热搜怕是又要猜副驾坐着谁了～`,
        '全海城能坐进这台车副驾的，今晚只有我一个人。',
      ],
      lu_zhiwei: [
        `喂，开【${car.name}】赴约也太犯规了吧？声浪震得我耳机降噪都差点失效……行吧，勉强夸你一句眼光不赖。`,
        '啧，这漆面质感确实离谱，坐着还挺稳。',
      ],
    };
    const pair = byH[heroineDef.id] || [`你开着【${car.name}】赴约，全场目光顿时聚拢过来。`, '这份从容气场，海城少有人能及。'];
    [reactionText, thoughtText] = pair;
  } else if (power >= 68) {
    bonusAffection = 3;
    bonusPoints = 8;
    badge = `${car.name} · 豪车赴约`;
    const byH: Record<string, [string, string]> = {
      su_qingwan: [
        `【${car.name}】的线条和今晚海城的夜色很配。上车吧，别让门童一直盯着看。`,
        '和他一起出现，好像连空气都跟着安静了几分。',
      ],
      lin_wanxing: [
        `远远听见引擎声就知道是你开【${car.name}】来啦！今晚的风好温柔呀～`,
        '看见车灯亮起的那刻，一整天的疲惫都散掉了。',
      ],
      shen_liuli: [
        `哥哥开【${car.name}】来接人，门童跑得比我高跟鞋还快呢，真给小女子长脸～`,
        '有他在身边撑场，怎么闹都有底气。',
      ],
      lu_zhiwei: [
        `不错嘛大老板，【${car.name}】调校得挺丝滑，比你当年那台旧电驴拉风多了。`,
        '不过话说回来，跟他兜风确实挺解压的。',
      ],
    };
    const pair = byH[heroineDef.id] || [`【${car.name}】稳稳停在门前，引来四周一片注目。`, '今晚的约会开局就已经赢了一半。'];
    [reactionText, thoughtText] = pair;
  } else if (power >= 50 || hasWatch || hasFleet) {
    bonusAffection = 2;
    bonusPoints = 5;
    const itemLabel = power >= 50 ? car.name : hasWatch ? '天枢星轨陀飞轮' : '海城顶奢藏品';
    badge = `${itemLabel} · 格调加成`;
    reactionText = `门童一眼认出你身上的【${itemLabel}】，立刻恭敬引路至最佳观景席。${heroineDef.name}唇角微弯，眼底多了几分笑意。`;
    thoughtText = '从细节里透出来的从容与体面，最让人心动。';
  }

  if (titleInfo) {
    bonusPoints += 3;
    if (!badge) badge = `称号「${titleInfo.titleBadge}」`;
  }

  const openingNode = reactionText
    ? {
        type: 'dialogue',
        speaker: heroineDef.id,
        name: heroineDef.name,
        role: `${heroineDef.title} · ${badge || '排面瞩目'}`,
        leftSprite: protagonistSprite,
        rightSprite: heroinePortrait,
        activeSide: 'right',
        effect: 'flash',
        innerThought: thoughtText,
        text: reactionText,
      }
    : null;

  return {
    bonusAffection,
    bonusPoints,
    badge,
    carName: car?.name || null,
    openingNode,
  };
}

export interface NegotiationPrestigeBuff {
  discountPct: number;
  patienceBonus: number;
  badge: string;
  systemNote: string;
  sellerLine: string;
}

export function computeNegotiationPrestigeBuff(
  userId: number,
  sellerId: string,
  temper: 'greedy' | 'proud' | 'anxious',
): NegotiationPrestigeBuff | null {
  const { state, ownedAssets } = computePortfolioAndTier(userId);
  const content = getContent();
  const ownedIds = new Set(ownedAssets.map((a) => a.asset_id));
  const car = content.assetsCatalog.assets.find((a: any) => a.id === state.equipped_car_id);
  const titleInfo = getEquippedTitleInfo(userId);

  const highlights: string[] = [];
  let discountPct = 0;
  let patienceBonus = 0;

  if (ownedIds.has('island_private') || ownedIds.has('jet_g700')) {
    discountPct += 0.04;
    patienceBonus += 1;
    highlights.push(ownedIds.has('island_private') ? '东海私屿主人' : '湾流 G700 机主');
  } else if (ownedIds.has('yacht_poseidon')) {
    discountPct += 0.03;
    patienceBonus += 1;
    highlights.push('海神号游艇主');
  }

  if (Number(car?.racePower || 0) >= 90) {
    discountPct += 0.025;
    highlights.push(car.name);
  } else if (Number(car?.racePower || 0) >= 68) {
    discountPct += 0.015;
    highlights.push(car.name);
  }

  if (ownedIds.has('watch_tourbillon') || ownedIds.has('art_ink_scroll')) {
    discountPct += 0.015;
    highlights.push(ownedIds.has('art_ink_scroll') ? '《海城夜渡图》藏家' : '星轨陀飞轮');
  }

  if (titleInfo) {
    discountPct += 0.01;
    if (temper === 'proud') patienceBonus = Math.max(patienceBonus, 1);
    highlights.push(`称号「${titleInfo.titleBadge}」`);
  }

  discountPct = Math.min(0.06, discountPct);
  if (highlights.length === 0) return null;

  const topHighlight = highlights[0];
  const badge = `排面威压 · ${topHighlight}`;
  const sellerLines: Record<string, string> = {
    qian: `哟，刚才在楼下就瞅见【${topHighlight}】的排场了！行，冲你这实力，价格上咱们敞亮点谈。`,
    zhao: `……哼，别以为亮出【${topHighlight}】就能压我一头！不过算你有资格坐这张桌子，报数吧。`,
    zhou: `嗯？阁下竟带着【${topHighlight}】的气度登门。既是有眼界的藏家，老朽多留你一盏茶的耐心。`,
    lin_jie: `久仰【${topHighlight}】的大名，今天终于见到本人了。和爽快人谈生意，我不绕弯子。`,
    akun: `乖乖，【${topHighlight}】都亲自下场了？老板您放心，给您的价绝对留足诚意！`,
    wang: `您……连【${topHighlight}】都在您名下了？好好好，您开条件，我这边尽量配合……`,
  };
  const effectDesc = [
    discountPct > 0 ? `底价天然松动 -${Math.round(discountPct * 100)}%` : '',
    patienceBonus > 0 ? `卖家初始耐心 +${patienceBonus}` : '',
  ]
    .filter(Boolean)
    .join('，');

  return {
    discountPct,
    patienceBonus,
    badge,
    systemNote: `【排面威压】${highlights.slice(0, 2).join(' + ')} 镇住全场（${effectDesc}）。`,
    sellerLine: sellerLines[sellerId] || `见识过【${topHighlight}】的排面，今日这笔生意不妨痛快些谈。`,
  };
}

// ================= LUXURY SHOWCASE THEATERS =================

export function buildLuxuryTheatersView(userId: number) {
  const content = getContent();
  const list: any[] = content.luxuryTheaters || [];
  if (list.length === 0) return [];

  const ownedRows = queryAll<{ asset_id: string }>('SELECT asset_id FROM player_assets WHERE user_id = ?', [userId]);
  const ownedSet = new Set(ownedRows.map((r) => r.asset_id));
  const doneSet = new Set(parseKv<string[]>(userId, KV_LUXURY_DONE, []));
  const todayRec = parseKv<{ day: string; ids: string[] }>(userId, KV_LUXURY_TODAY, { day: '', ids: [] });
  const todaySet = new Set(todayRec.day === todayKey() ? todayRec.ids : []);

  return list.map((t) => {
    const matchedAssetId = (t.assetIds || []).find((aid: string) => ownedSet.has(aid)) || null;
    const matchedDef = matchedAssetId
      ? content.assetsCatalog.assets.find((a: any) => a.id === matchedAssetId)
      : null;
    return {
      id: t.id,
      assetIds: t.assetIds || [],
      matchedAssetId,
      matchedAssetName: matchedDef?.name || null,
      title: t.title,
      subtitle: t.subtitle,
      sceneLabel: t.sceneLabel,
      badge: t.badge || '顶奢私宴',
      bg: t.bg,
      costEnergy: Number(t.costEnergy || 3),
      rewardPoints: Number(t.rewardPoints || 40),
      rewardAffection: Number(t.rewardAffection || 15),
      unlocked: Boolean(matchedAssetId),
      completed: doneSet.has(t.id),
      playedToday: todaySet.has(t.id),
    };
  });
}

function hydrateLuxuryScript(userId: number, theater: any, matchedAsset: any, heroineDef: any | null) {
  const completedRows = queryAll<{ episode_id: string }>('SELECT episode_id FROM player_progress WHERE user_id = ?', [userId]);
  const completedSet = new Set(completedRows.map((r) => r.episode_id));
  const protagonistSprite =
    completedSet.has('ep_003') || completedSet.size >= 3
      ? '/assets/characters/protagonist.png'
      : '/assets/characters/protagonist_early.png';

  const activeVisual = heroineDef ? resolveHeroineActivePortrait(userId, heroineDef) : null;
  const partner = heroineDef
    ? {
        id: heroineDef.id,
        name: heroineDef.name,
        role: heroineDef.title,
        avatar: heroineDef.avatar,
        portrait: activeVisual?.portrait || heroineDef.portrait,
        isHeroine: true,
      }
    : {
        id: 'chen_mo',
        name: '陈默',
        role: '私人管家',
        avatar: '/assets/characters/chen_mo.png',
        portrait: '/assets/characters/chen_mo.png',
        isHeroine: false,
      };

  const openerKey = heroineDef ? heroineDef.id : 'solo';
  const opener = theater.heroineOpeners?.[openerKey] || theater.heroineOpeners?.solo || {
    openLine: `【${matchedAsset.name}】已经准备就绪，今晚海城的夜色专为您点亮。`,
    openThought: '站在这座城市的制高点，风景果然与众不同。',
    closeLine: '这一夜的记忆，足够让人回味很久。',
    closeThought: '往后还有更辽阔的版图在前方等着我们。',
    momentComment: '难忘的一夜！',
  };

  const vars: Record<string, string> = {
    assetName: matchedAsset.name,
    heroineName: partner.name,
    heroineRole: partner.role,
    heroineSprite: partner.portrait,
    heroinePortrait: partner.portrait,
    protagonistSprite,
    title: theater.title,
    openLine: interpolate(opener.openLine || '', { assetName: matchedAsset.name, heroineName: partner.name }),
    openThought: interpolate(opener.openThought || '', { assetName: matchedAsset.name, heroineName: partner.name }),
    closeLine: interpolate(opener.closeLine || '', { assetName: matchedAsset.name, heroineName: partner.name }),
    closeThought: interpolate(opener.closeThought || '', { assetName: matchedAsset.name, heroineName: partner.name }),
  };

  const hydrateNode = (raw: any): any => {
    const n: any = { ...raw };
    if (typeof n.text === 'string') n.text = interpolate(n.text, vars);
    if (typeof n.title === 'string') n.title = interpolate(n.title, vars);
    if (typeof n.sceneBanner === 'string') n.sceneBanner = interpolate(n.sceneBanner, vars);
    if (typeof n.innerThought === 'string') n.innerThought = interpolate(n.innerThought, vars);
    if (typeof n.sprite === 'string') n.sprite = interpolate(n.sprite, vars);
    if (typeof n.leftSprite === 'string') n.leftSprite = interpolate(n.leftSprite, vars);
    if (typeof n.rightSprite === 'string') n.rightSprite = interpolate(n.rightSprite, vars);

    if (n.speaker === 'heroine') {
      n.speaker = partner.id;
      n.name = partner.name;
      n.role = partner.role;
      n.leftSprite = protagonistSprite;
      n.rightSprite = partner.portrait;
      if (!n.activeSide) n.activeSide = 'right';
    } else if (n.speaker === 'protagonist') {
      n.name = '陆沉';
      n.role = '你';
      n.leftSprite = protagonistSprite;
      n.rightSprite = partner.portrait;
      if (!n.activeSide) n.activeSide = 'left';
    } else if (!n.sprite && !n.leftSprite && !n.rightSprite) {
      n.leftSprite = protagonistSprite;
      n.rightSprite = partner.portrait;
      if (!n.activeSide) n.activeSide = 'both';
    }
    return n;
  };

  const nodes: any[] = (theater.sceneNodes || []).map(hydrateNode);
  if (theater.choice) {
    const ch = theater.choice;
    nodes.push({
      type: 'system_choice',
      id: ch.id || `${theater.id}_choice`,
      title: interpolate(ch.title || theater.title, vars),
      leftSprite: protagonistSprite,
      rightSprite: partner.portrait,
      activeSide: 'both',
      options: (ch.options || []).map((opt: any) => ({
        id: opt.id,
        label: interpolate(opt.label || '', vars),
        tag: opt.tag || theater.badge,
        cost: { cash: 0 },
        affectionBonus: Number(opt.affectionBonus || 0),
        sysPoints: Number(opt.sysPointsBonus || 0),
        resultText: interpolate(opt.resultText || '', vars),
        branchNodes: (opt.branchNodes || []).map(hydrateNode),
      })),
    });
  }

  return {
    theaterId: theater.id,
    assetId: matchedAsset.id,
    assetName: matchedAsset.name,
    title: theater.title,
    subtitle: `${matchedAsset.name} · ${partner.name}`,
    sceneLabel: theater.sceneLabel || theater.badge,
    bg: theater.bg,
    heroineId: partner.isHeroine ? partner.id : undefined,
    heroineName: partner.name,
    heroineAvatar: partner.avatar,
    heroinePortrait: partner.portrait,
    locationLabel: matchedAsset.name,
    nodes,
  };
}

export function registerLuxuryRoutes(router: Router, auth: Auth): void {
  router.post('/luxury-theater/start', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const theaterId = String(req.body?.theaterId || '');
      const requestedHeroineId = req.body?.heroineId ? String(req.body.heroineId) : '';
      const content = getContent();
      const theater = (content.luxuryTheaters || []).find((t: any) => t.id === theaterId);
      if (!theater) throw new Error('该顶奢剧场不存在');

      const ownedRows = queryAll<{ asset_id: string }>('SELECT asset_id FROM player_assets WHERE user_id = ?', [userId]);
      const ownedSet = new Set(ownedRows.map((r) => r.asset_id));
      const matchedAssetId = (theater.assetIds || []).find((aid: string) => ownedSet.has(aid));
      if (!matchedAssetId) throw new Error('尚未拥有对应的顶级座驾或领地藏品');
      const matchedAsset = content.assetsCatalog.assets.find((a: any) => a.id === matchedAssetId);

      const todayRec = parseKv<{ day: string; ids: string[] }>(userId, KV_LUXURY_TODAY, { day: '', ids: [] });
      const playedToday = todayRec.day === todayKey() && todayRec.ids.includes(theater.id);
      if (!playedToday) {
        assertEnergySufficient(userId, Number(theater.costEnergy || 3));
      }

      let heroineDef: any = null;
      if (requestedHeroineId) {
        const hRow = queryOne<any>(
          'SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?',
          [userId, requestedHeroineId],
        );
        if (!hRow?.unlocked) throw new Error('请先结识该红颜再邀约同行');
        heroineDef = content.heroines.find((h: any) => h.id === requestedHeroineId) || null;
      } else {
        const firstUnlocked = queryOne<{ heroine_id: string }>(
          'SELECT heroine_id FROM player_heroines WHERE user_id = ? AND unlocked = 1 ORDER BY affection DESC LIMIT 1',
          [userId],
        );
        if (firstUnlocked) {
          heroineDef = content.heroines.find((h: any) => h.id === firstUnlocked.heroine_id) || null;
        }
      }

      const script = hydrateLuxuryScript(userId, theater, matchedAsset, heroineDef);
      res.json({ success: true, playedToday, script });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/luxury-theater/complete', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const theaterId = String(req.body?.theaterId || '');
      const heroineId = req.body?.heroineId ? String(req.body.heroineId) : '';
      const choiceId = String(req.body?.choiceId || '');
      const content = getContent();
      const theater = (content.luxuryTheaters || []).find((t: any) => t.id === theaterId);
      if (!theater) throw new Error('该顶奢剧场不存在');

      const ownedRows = queryAll<{ asset_id: string }>('SELECT asset_id FROM player_assets WHERE user_id = ?', [userId]);
      const ownedSet = new Set(ownedRows.map((r) => r.asset_id));
      const matchedAssetId = (theater.assetIds || []).find((aid: string) => ownedSet.has(aid));
      if (!matchedAssetId) throw new Error('尚未拥有对应的顶级座驾或领地藏品');
      const matchedAsset = content.assetsCatalog.assets.find((a: any) => a.id === matchedAssetId);

      const todayRec = parseKv<{ day: string; ids: string[] }>(userId, KV_LUXURY_TODAY, { day: '', ids: [] });
      const todayIds = todayRec.day === todayKey() ? todayRec.ids : [];
      const playedToday = todayIds.includes(theater.id);

      const matchedOpt = (theater.choice?.options || []).find((o: any) => o.id === choiceId) || theater.choice?.options?.[0];
      let sysPoints = 0;
      let affectionGain = 0;
      let heroineDef: any = null;

      if (heroineId) {
        const hRow = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
          userId,
          heroineId,
        ]);
        if (hRow?.unlocked) {
          heroineDef = content.heroines.find((h: any) => h.id === heroineId) || null;
        }
      }

      if (!playedToday) {
        spendEnergyOrThrow(userId, Number(theater.costEnergy || 3));
        sysPoints = Number(theater.rewardPoints || 40) + Number(matchedOpt?.sysPointsBonus || 0);
        grant(userId, 0, sysPoints);

        if (heroineDef) {
          affectionGain = Number(theater.rewardAffection || 15) + Number(matchedOpt?.affectionBonus || 0);
          execute(
            'UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?',
            [affectionGain, Date.now(), userId, heroineDef.id],
          );
        }

        const doneList = parseKv<string[]>(userId, KV_LUXURY_DONE, []);
        if (!doneList.includes(theater.id)) {
          setPlayerKv(userId, KV_LUXURY_DONE, JSON.stringify([...doneList, theater.id]));
        }
        setPlayerKv(userId, KV_LUXURY_TODAY, JSON.stringify({ day: todayKey(), ids: [...todayIds, theater.id] }));

        // Post luxury showcase Moment!
        const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
        const partnerName = heroineDef?.name || '陈默';
        const opener = theater.heroineOpeners?.[heroineDef ? heroineDef.id : 'solo'];
        const momentText = interpolate(
          theater.momentTemplate || `今晚携【{{assetName}}】共赴{{title}}，海城灯火尽收眼底。`,
          { assetName: matchedAsset.name, heroineName: partnerName, title: theater.title },
        );
        postMoment(
          userId,
          user?.nickname || '陆沉',
          momentText,
          `海城 · ${matchedAsset.name}`,
          opener?.momentComment ? [{ author: partnerName, text: opener.momentComment }] : [],
          [partnerName, '陈默（私人管家）'],
        );
      }

      const reactionText = interpolate(matchedOpt?.resultText || `你在【${matchedAsset.name}】度过了难忘的顶奢之夜。`, {
        assetName: matchedAsset.name,
        heroineName: heroineDef?.name || '陈默',
        title: theater.title,
      });

      res.json({
        success: true,
        playedToday,
        sysPoints,
        affectionGain,
        heroineName: heroineDef?.name || '陈默',
        reactionText,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
