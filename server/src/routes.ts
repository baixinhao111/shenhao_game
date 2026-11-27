import bcrypt from 'bcryptjs';
import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getContent, reloadContent } from './contentLoader.js';
import { execute, getGmSetting, getLastInsertId, queryAll, queryOne, setGmSetting } from './db.js';
import { chatWithHeroine } from './deepseekService.js';
import { assertCashSufficient, assertEnergySufficient, spendCashOrThrow, spendEnergyOrThrow } from './economy.js';
import { registerMinigameRoutes } from './minigames.js';
import { buildStockMarketSnapshot } from './stocks.js';
import { assertInteractionOpen, assetPriceNow, registerMapSpotRoutes } from './mapSpots.js';
import { registerNegotiationRoutes } from './negotiation.js';
import { registerBondRoutes, resolveHeroineActivePortrait } from './bonds.js';
import { getEquippedTitleInfo, getStoryLinkedStockExtras, registerEmpireRoutes } from './empire.js';
import { getBusinessDef, getPropertyDef, purchaseBusiness, purchaseProperty } from './purchases.js';
import {
  buildFullGameState,
  computePortfolioAndTier,
  DAILY_POKE_LIMIT,
  ensureDailyResetAndEnergy,
  formatMoney,
  getDailyPokeCount,
  getHeroineStage,
  getPokesRemainingToday,
  getTimePeriod,
  getTimePeriodLabel,
  incrementDailyPokeCount,
  incrementDailyTask,
  initNewPlayer,
  postMoment,
  rollCritCashback,
  todayKey,
} from './gameEngine.js';

interface AuthedRequest extends Request {
  userId?: number;
  isAdmin?: boolean;
}

function signToken(userId: number, isAdmin: boolean): string {
  return jwt.sign({ userId, isAdmin }, config.jwtSecret, { expiresIn: '30d' });
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: '请先登录海城黑金终端' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: number; isAdmin: boolean };
    req.userId = payload.userId;
    req.isAdmin = Boolean(payload.isAdmin);
    next();
  } catch {
    res.status(401).json({ error: '登录状态已过期，请重新登录' });
  }
}

// Track last home poke line index per user+companion so rapid taps cycle fresh lines
const lastPokeIndexMap = new Map<string, number>();

function interpolateText(value: string, vars: Record<string, string>): string {
  if (!value || !value.includes('{{')) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function interpolateNode(node: any, vars: Record<string, string>): any {
  if (!node || typeof node !== 'object') return node;
  const out: any = { ...node };
  const stringKeys = [
    'text',
    'title',
    'name',
    'role',
    'innerThought',
    'sceneBanner',
    'sprite',
    'leftSprite',
    'rightSprite',
    'bg',
    'speaker',
  ];
  for (const k of stringKeys) {
    if (typeof out[k] === 'string') {
      out[k] = interpolateText(out[k], vars);
    }
  }
  if (out.speaker === 'heroine' && vars.heroineId) {
    out.speaker = vars.heroineId;
  }
  if (Array.isArray(out.lines)) {
    out.lines = out.lines.map((line: any) => (typeof line === 'string' ? interpolateText(line, vars) : line));
  }
  if (Array.isArray(out.options)) {
    out.options = out.options.map((opt: any) => {
      const nextOpt: any = { ...opt };
      if (typeof nextOpt.label === 'string') nextOpt.label = interpolateText(nextOpt.label, vars);
      if (typeof nextOpt.tag === 'string') nextOpt.tag = interpolateText(nextOpt.tag, vars);
      if (typeof nextOpt.resultText === 'string') nextOpt.resultText = interpolateText(nextOpt.resultText, vars);
      if (Array.isArray(nextOpt.branchNodes)) {
        nextOpt.branchNodes = nextOpt.branchNodes.map((bn: any) => interpolateNode(bn, vars));
      }
      return nextOpt;
    });
  }
  return out;
}

function buildMiniStoryTemplateVars(
  userId: number,
  hDef: any,
  opts: { district?: any; inter?: any; propertyName?: string },
): Record<string, string> {
  const content = getContent();
  const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
  const st = queryOne<any>('SELECT equipped_car_id FROM player_state WHERE user_id = ?', [userId]);
  const car = content.assetsCatalog.assets.find((a: any) => a.id === st?.equipped_car_id);
  const locationName = opts.inter?.name || opts.propertyName || opts.district?.name || '海城';
  const activePortrait = hDef ? resolveHeroineActivePortrait(userId, hDef).portrait : '';
  return {
    heroineId: hDef?.id || 'heroine',
    heroineName: hDef?.name || '红颜',
    heroineRole: hDef?.title || hDef?.archetype || '',
    heroineSprite: activePortrait || hDef?.portrait || hDef?.avatar || '',
    playerName: user?.nickname || '陆沉',
    carName: car?.name || '座驾',
    locationName,
    interactionName: opts.inter?.name || '',
    districtName: opts.district?.name || '海城',
    propertyName: opts.propertyName || locationName,
  };
}

function buildFallbackDateScript(district: any, inter: any, hDef: any) {
  return {
    title: `${inter.name} · ${hDef.name}`,
    subtitle: `${district.name} · 私密约会`,
    bg: inter.image || district.bg,
    nodes: [
      {
        type: 'narration',
        sceneBanner: `${district.name} · ${inter.name}`,
        sprite: '{{heroineSprite}}',
        text: `{{carName}}缓缓停稳在{{districtName}}的灯火边缘。今晚的{{locationName}}少了白日的喧嚣，倒多了几分恰到好处的暧昧。`,
      },
      {
        type: 'dialogue',
        speaker: hDef.id,
        name: '{{heroineName}}',
        role: '{{heroineRole}}',
        sprite: '{{heroineSprite}}',
        text: `没想到{{playerName}}会选在{{locationName}}见面……今晚倒是很会挑地方。`,
        innerThought: '嘴上说得轻描淡写，其实出门前特意换了最衬今晚灯光的一套衣服。',
      },
      {
        type: 'thought',
        sprite: '{{heroineSprite}}',
        text: '灯光落在她眼尾，比平时多了几分松弛。难得避开海城所有的目光，今晚的节奏由我来定。',
      },
      {
        type: 'system_choice',
        id: `date_choice_${inter.id}`,
        title: '此刻你的回应',
        sprite: '{{heroineSprite}}',
        options: [
          {
            id: 'opt_sincere',
            label: '“平时太忙了，今晚只想安安静静陪你待一会儿。”',
            tag: '真诚偏爱 · 额外好感',
            affectionBonus: 4,
            resultText: '{{heroineName}}轻轻弯起眉眼，悄悄朝你这边靠了半寸。',
            branchNodes: [
              {
                type: 'dialogue',
                speaker: hDef.id,
                name: '{{heroineName}}',
                role: '{{heroineRole}}',
                sprite: '{{heroineSprite}}',
                effect: 'heartbeat',
                text: '……你总是这样，一句话就能让人把所有防备都卸下来。',
                innerThought: '完了，心跳好像真的被他带乱了。',
              },
              {
                type: 'narration',
                sprite: '{{heroineSprite}}',
                text: '夜风拂过，她没有躲开你递过去的外套，反而自然地挽住了你的手臂。',
              },
            ],
          },
          {
            id: 'opt_playful',
            label: '“海城最好的地方，当然要留给最重要的人先体验。”',
            tag: '气场全开 · 额外好感',
            affectionBonus: 2,
            resultText: '{{heroineName}}被你的直球逗笑，眼底藏着藏不住的笑意。',
            branchNodes: [
              {
                type: 'dialogue',
                speaker: hDef.id,
                name: '{{heroineName}}',
                role: '{{heroineRole}}',
                sprite: '{{heroineSprite}}',
                text: '真会说话。不过看在你今晚诚意十足的份上，这句夸奖我收下了。',
                innerThought: '虽然有点霸道，但听着确实很受用嘛。',
              },
            ],
          },
        ],
      },
      {
        type: 'dialogue',
        speaker: hDef.id,
        name: '{{heroineName}}',
        role: '{{heroineRole}}',
        sprite: '{{heroineSprite}}',
        text: '今晚很开心。下一次，可不许让我等太久。',
      },
      {
        type: 'narration',
        sprite: '{{heroineSprite}}',
        text: '回程的路上车厢很安静，只有窗外流淌的江城霓虹，与两人之间悄然升温的默契。',
      },
    ],
  };
}

function buildFallbackHomeScript(prop: any, propDisplayName: string, inter: any, hDef: any) {
  return {
    title: `${inter.name} · ${hDef.name}`,
    subtitle: `${propDisplayName} · 私宅时光`,
    bg: prop.image || prop.bg,
    nodes: [
      {
        type: 'narration',
        sceneBanner: `${propDisplayName} · ${inter.name}`,
        sprite: '{{heroineSprite}}',
        text: `推开{{propertyName}}的门，室内的暖灯早已亮起。卸下白日海城的风云起伏，此刻只剩下独属于两人的私密空间。`,
      },
      {
        type: 'dialogue',
        speaker: hDef.id,
        name: '{{heroineName}}',
        role: '{{heroineRole}}',
        sprite: '{{heroineSprite}}',
        text: `回来啦，{{playerName}}？今晚刚好有空，陪我一起「${inter.name}」吧。`,
        innerThought: '其实从傍晚起就在算他大概几点进门了。',
      },
      {
        type: 'thought',
        sprite: '{{heroineSprite}}',
        text: '外面的海城灯火再璀璨，也比不上推开门时，有一盏灯专门为你留着。',
      },
      {
        type: 'system_choice',
        id: `home_choice_${inter.id}`,
        title: '这一刻，你想怎么回应她',
        sprite: '{{heroineSprite}}',
        options: [
          {
            id: 'opt_home_tender',
            label: '走近轻抚她的发梢：“有你在的地方，才像真正的家。”',
            tag: '温柔升温 · 额外好感',
            affectionBonus: 4,
            resultText: '{{heroineName}}眼底染上柔软的笑意，轻轻靠在了你肩头。',
            branchNodes: [
              {
                type: 'dialogue',
                speaker: hDef.id,
                name: '{{heroineName}}',
                role: '{{heroineRole}}',
                sprite: '{{heroineSprite}}',
                effect: 'heartbeat',
                text: '……别突然靠这么近说话呀。不过，这句话我很喜欢。',
                innerThought: '如果时间能一直停在这一刻就好了。',
              },
              {
                type: 'narration',
                sprite: '{{heroineSprite}}',
                text: '暖黄的灯光洒在落地窗边，这一夜的温柔比整座城市的霓虹更让人沉溺。',
              },
            ],
          },
          {
            id: 'opt_home_tease',
            label: '“看来把钥匙交给你，是我做过最划算的一笔投资。”',
            tag: '神豪调侃 · 额外好感',
            affectionBonus: 2,
            resultText: '{{heroineName}}轻嗔地瞥了你一眼，嘴角却扬得更高了。',
            branchNodes: [
              {
                type: 'dialogue',
                speaker: hDef.id,
                name: '{{heroineName}}',
                role: '{{heroineRole}}',
                sprite: '{{heroineSprite}}',
                text: '满脑子都是投资回报率？那你可得做好被我长期套牢的准备。',
                innerThought: '这家伙嘴上没正形，心里其实比谁都在意。',
              },
            ],
          },
        ],
      },
      {
        type: 'dialogue',
        speaker: hDef.id,
        name: '{{heroineName}}',
        role: '{{heroineRole}}',
        sprite: '{{heroineSprite}}',
        text: '夜还长呢，今晚就别再看那些工作消息了，专心陪我好不好？',
      },
      {
        type: 'narration',
        sprite: '{{heroineSprite}}',
        text: '窗外江风微凉，室内茶香与笑语正暖。你们之间的距离又悄悄拉近了一步。',
      },
    ],
  };
}

function resolveDateMiniStoryScript(userId: number, district: any, inter: any, hDef: any) {
  const content = getContent();
  const spotBucket = content.miniStories?.dates?.[inter.id];
  const raw = spotBucket?.[hDef.id] || spotBucket?.default || buildFallbackDateScript(district, inter, hDef);
  const vars = buildMiniStoryTemplateVars(userId, hDef, { district, inter });

  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map((n: any) => interpolateNode(n, vars)) : [];
  const bg = interpolateText(raw.bg || '', vars) || inter.image || district.bg;
  return {
    title: interpolateText(raw.title || `${inter.name} · ${hDef.name}`, vars),
    subtitle: interpolateText(raw.subtitle || `${district.name} · 浪漫约会`, vars),
    bg,
    heroineId: hDef.id,
    heroineName: hDef.name,
    heroinePortrait: hDef.portrait,
    districtId: district.id,
    interactionId: inter.id,
    costEnergy: inter.energy || 6,
    costCash: inter.cashCost || 0,
    nodes,
  };
}

function resolveHomeMiniStoryScript(userId: number, prop: any, owned: any, inter: any, hDef: any) {
  const content = getContent();
  const propDisplayName = owned.custom_name || prop.name;
  const district = content.map.districts.find((d: any) => d.id === prop.districtId);
  const bucket = content.miniStories?.homeInteractions?.[inter.id];
  const raw = bucket?.[hDef.id] || bucket?.default || buildFallbackHomeScript(prop, propDisplayName, inter, hDef);
  const vars = buildMiniStoryTemplateVars(userId, hDef, { district, inter, propertyName: propDisplayName });

  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map((n: any) => interpolateNode(n, vars)) : [];
  const bg = prop.image || prop.bg || interpolateText(raw.bg || '', vars);
  return {
    title: interpolateText(raw.title || `${inter.name} · ${hDef.name}`, vars),
    subtitle: interpolateText(raw.subtitle || `${propDisplayName} · 私宅互动`, vars),
    bg,
    heroineId: hDef.id,
    heroineName: hDef.name,
    heroinePortrait: hDef.portrait,
    propertyId: prop.id,
    propertyName: propDisplayName,
    interactionId: inter.id,
    costEnergy: inter.energy || 5,
    costCash: 0,
    nodes,
  };
}

function findMiniStoryOption(nodes: any[], choiceId?: string): any | null {
  if (!choiceId || !Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node?.type === 'system_choice' && Array.isArray(node.options)) {
      for (const opt of node.options) {
        if (opt?.id === choiceId) return opt;
        if (Array.isArray(opt?.branchNodes)) {
          const nested = findMiniStoryOption(opt.branchNodes, choiceId);
          if (nested) return nested;
        }
      }
    }
  }
  return null;
}

function collectStorySelectedOptions(
  nodes: any[],
  choiceId?: string,
  choiceIds?: string[] | Record<string, string>,
): any[] {
  if (!Array.isArray(nodes)) return [];
  const idList: string[] = Array.isArray(choiceIds)
    ? choiceIds.map((x) => String(x))
    : choiceIds && typeof choiceIds === 'object'
      ? Object.values(choiceIds).map((x) => String(x))
      : [];
  const idMap: Record<string, string> | null =
    choiceIds && !Array.isArray(choiceIds) && typeof choiceIds === 'object' ? (choiceIds as Record<string, string>) : null;

  const selected: any[] = [];
  let choiceCursor = 0;

  const walk = (nodeList: any[]) => {
    for (const node of nodeList) {
      if (node?.type !== 'system_choice' || !Array.isArray(node.options) || node.options.length === 0) {
        continue;
      }
      const opts = node.options;
      let matched: any = null;

      if (idMap && node.id && idMap[node.id]) {
        matched = opts.find((o: any) => o.id === idMap[node.id]) || null;
      }
      if (!matched && Array.isArray(choiceIds) && idList[choiceCursor]) {
        matched = opts.find((o: any) => o.id === idList[choiceCursor]) || null;
      }
      if (!matched && idList.length > 0) {
        matched = opts.find((o: any) => idList.includes(o.id)) || null;
      }
      if (!matched && choiceId) {
        matched = opts.find((o: any) => o.id === choiceId) || null;
      }
      if (!matched) {
        matched = opts[0];
      }

      choiceCursor += 1;
      if (matched) {
        selected.push(matched);
        if (Array.isArray(matched.branchNodes)) {
          walk(matched.branchNodes);
        }
      }
    }
  };

  walk(nodes);
  return selected;
}

function postSweetDateMoment(userId: number, hDef: any, district: any, inter: any, userNickname: string): void {
  const templates: Record<string, { text: string; comment: string }> = {
    su_qingwan: {
      text: `难得在【${inter.name}】把工作全抛在脑后。海城今晚的风，意外地很温柔。`,
      comment: '下次提前约好，我把日程空出来。',
    },
    lin_wanxing: {
      text: `和重要的人一起在【${inter.name}】度过了一个很甜的夜晚，回去的路上嘴角都没放下来呢～`,
      comment: '今晚的画面我会记很久的！',
    },
    shen_liuli: {
      text: `今晚鸽了直播间，在【${inter.name}】被某位大老板承包了全部快乐，不接受反驳～`,
      comment: '哥哥下次带我去更绝的地方呀～',
    },
    lu_zhiwei: {
      text: `在【${inter.name}】被某人强行拉出来放风，虽然不想承认，但今晚确实还挺解压的。`,
      comment: '哼，这顿算你请客，下次我带你去捡漏。',
    },
  };
  const tpl = templates[hDef.id] || {
    text: `在【${inter.name}】度过了一段很难忘的时光。`,
    comment: '期待下一次见面。',
  };
  postMoment(
    userId,
    hDef.name,
    tpl.text,
    `海城 · ${district.name}`,
    [{ author: userNickname, text: '随时奉陪。' }, { author: hDef.name, text: tpl.comment }],
    ['陈默（私人管家）'],
    hDef.avatar || '',
  );
}

function buildHomePokePayload(
  userId: number,
  targetId: string,
  ctx: {
    timePeriod: 'day' | 'evening' | 'night';
    timeLabel: string;
    netWorthText: string;
    tierName: string;
    carName: string;
    residenceName: string;
    nickname: string;
    incomePerHourText: string;
    affectionStage?: string;
    address?: string;
  },
): { line: string; mood: string; innerThought: string } {
  const addr = ctx.address || ctx.nickname;
  const pools: Record<string, Array<{ line: string; mood: string; innerThought: string }>> = {
    su_qingwan: [
      {
        line:
          ctx.timePeriod === 'night'
            ? `${ctx.timeLabel}了还不休息？${addr}，海城的钱是赚不完的，坐下来陪我喝杯热茶。`
            : `刚看完盛世的午间简报。听说你名下身价已经到了 ${ctx.netWorthText}，节奏稳得让人佩服。`,
        mood: 'calm',
        innerThought: '明明是来谈正事的，看见他走近，注意力还是忍不住全偏了过去。',
      },
      {
        line: `你把${ctx.carName}停在楼下太招摇了，刚才物业经理还特意来问是不是有大人物莅临。`,
        mood: 'tease',
        innerThought: '嘴上说他高调，其实从窗边往下看那台车时，心里莫名有点骄傲。',
      },
      {
        line: `别总拿那种眼神看我，${addr}。在${ctx.residenceName}里，可没有外人替你解围。`,
        mood: 'shy',
        innerThought: '距离太近了……他肯定是故意试探我还能保持多久冷静。',
      },
      {
        line: `现在你是${ctx.tierName}了，盯上你的人只会越来越多。不过放心，背后那半盘棋，我替你看着。`,
        mood: 'touched',
        innerThought: '从前习惯了一个人扛下所有风浪，现在竟也开始期待和他并肩。',
      },
    ],
    lin_wanxing: [
      {
        line:
          ctx.timePeriod === 'evening'
            ? `傍晚的光照进${ctx.residenceName}好温柔呀～${addr}，我刚练完一首新曲子，要不要第一个听？`
            : `${addr}今天忙坏了吧？我一直留着温热的花茶，快过来歇一会儿呀。`,
        mood: 'happy',
        innerThought: '只要他一靠近，整间屋子好像都跟着亮起来了呢。',
      },
      {
        line: `刚才在窗边看到你的${ctx.carName}开进来，我就知道你回来啦！今天在外面有没有受委屈？`,
        mood: 'touched',
        innerThought: '别人只看见他站在高处多耀眼，可我更想知道他累不累。',
      },
      {
        line: `呀……突然戳我干嘛呀${addr}，害我手里的乐谱都差点掉地上啦！`,
        mood: 'shy',
        innerThought: '明明只是轻轻碰了一下，脸怎么一下子就烫起来了……',
      },
      {
        line: `不管你的身价涨到 ${ctx.netWorthText} 还是更高，在我心里，你永远是银杏树下护着我的那个${addr}。`,
        mood: 'touched',
        innerThought: '如果以后也能每天这样等他回家，就太幸福了。',
      },
    ],
    shen_liuli: [
      {
        line:
          ctx.timePeriod === 'night'
            ? `都 ${ctx.timeLabel} 了还专门来撩我？${addr}，今晚星耀的榜一位置可还给你留着呢～`
            : `哟，身价 ${ctx.netWorthText} 的大老板大驾光临，说吧，今天打算带我去哪儿兜风？`,
        mood: 'tease',
        innerThought: '哼，这男人越来越懂怎么拿捏我的心跳了。',
      },
      {
        line: `你的${ctx.carName}声浪太迷人了，下次开去星耀楼下接我，保证让全公司女生羡慕到失眠。`,
        mood: 'happy',
        innerThought: '其实哪是为了排面，就是想光明正大坐在他副驾上而已。',
      },
      {
        line: `别光动手动脚的呀${addr}……在${ctx.residenceName}里这样试探我，就不怕我反客为主？`,
        mood: 'shy',
        innerThought: '糟糕，明明平时最会撩人的是我，怎么到他面前反倒先心慌了。',
      },
      {
        line: `外面人人都喊你${ctx.tierName}，可只有我知道，你护短的时候才最让人挪不开眼。`,
        mood: 'touched',
        innerThought: '见过那么多逢场作戏的老板，只有他让我真想交付全部真心。',
      },
    ],
    lu_zhiwei: [
      {
        line:
          ctx.timePeriod === 'night'
            ? `喂，${ctx.timeLabel} 还在戳我？刚替你扫完陆家湾的暗网舆情，夜宵不请双份可说不过去。`
            : `啧，总身价都 ${ctx.netWorthText} 了还这么闲？我刚发现个挺有意思的古玩局，去不去？`,
        mood: 'tease',
        innerThought: '其实早就把周边所有潜在对手的底细整理成加密报告存在他桌面上了。',
      },
      {
        line: `喂喂喂！别突然靠这么近！你这样会干扰我写代码的逻辑——我的心率传感器都要报警了！`,
        mood: 'shy',
        innerThought: '可恶，这家伙怎么每次都能精准触发我的宕机 Bug 啊……',
      },
      {
        line: `开着${ctx.carName}住在${ctx.residenceName}，${addr}，你这升级速度连我写的外挂脚本都追不上。`,
        mood: 'happy',
        innerThought: '跟着他一起把海城掀个底朝天，好像真的挺酷的。',
      },
      {
        line: `行了行了，${ctx.tierName}大人，有事随时喊我。不管线上还是线下，我给你兜底。`,
        mood: 'touched',
        innerThought: '才不是因为喜欢他才这么拼呢……好吧，可能有一点点。',
      },
    ],
    chen_mo: [
      {
        line: `少爷，名下总身价已达 ${ctx.netWorthText}，各处产业每小时进账 ${ctx.incomePerHourText}。`,
        mood: 'calm',
        innerThought: '少爷如今的气度，早已非那个雨夜可比。',
      },
      {
        line: `${ctx.carName}已停在${ctx.residenceName}地库。${ctx.timePeriod === 'night' ? '海城夜色正好，今晚打算去哪一片区？' : '今日海城各方动向已整理妥当。'}`,
        mood: 'calm',
        innerThought: '这座城的格局，正一点点改写。',
      },
      {
        line: `少爷，随时可以去海城各区走走，或继续推进手头的正事。`,
        mood: 'happy',
        innerThought: '属于陆沉的时代，才刚刚揭开序幕。',
      },
    ],
    protagonist: [
      {
        line:
          ctx.timePeriod === 'night'
            ? `${ctx.timeLabel}，海城的霓虹从未熄灭。从十八平隔断间走到如今的 ${ctx.netWorthText}，这还只是热身。`
            : `坐进${ctx.carName}之前，先确认今天的盘口与行程。海城的规矩，以后由我来定。`,
        mood: 'calm',
        innerThought: '曾经失去的尊严与筹码，我会连本带利全部收回。',
      },
      {
        line: `站在${ctx.residenceName}的窗前看这座城，视野确实和从前不一样了。下一枚棋子，该落去哪一区？`,
        mood: 'happy',
        innerThought: '天枢给的只是入场券，真正能走多远，靠的是我自己的手腕。',
      },
    ],
  };

  const pool = pools[targetId] || pools.chen_mo;
  const key = `${userId}:${targetId}`;
  const prevIdx = lastPokeIndexMap.get(key) ?? -1;
  const nextIdx = (prevIdx + 1) % pool.length;
  lastPokeIndexMap.set(key, nextIdx);
  return pool[nextIdx];
}

// Lightweight sliding-window auth rate limiter (60 req/min per IP)
const authRateMap = new Map<string, number[]>();
function checkAuthRateLimit(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket?.remoteAddress || 'local';
  const now = Date.now();
  const recent = (authRateMap.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) {
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    return false;
  }
  recent.push(now);
  authRateMap.set(ip, recent);
  return true;
}

// Deterministic time-bucketed virtual stocks for Lujiazui CBD
export function createApiRouter(): Router {
  const router = Router();

  // ================= AUTH =================
  router.post('/auth/register', (req, res) => {
    if (!checkAuthRateLimit(req, res)) return;
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const nickname = String(req.body?.nickname || '陆沉').trim() || '陆沉';
      const adminSecret = String(req.body?.adminSecret || '');

      if (username.length < 2 || username.length > 24) {
        res.status(400).json({ error: '账号长度需在 2~24 个字符之间' });
        return;
      }
      if (password.length < 4) {
        res.status(400).json({ error: '密码至少需要 4 位' });
        return;
      }

      const existing = queryOne('SELECT id FROM users WHERE username = ?', [username]);
      if (existing) {
        res.status(400).json({ error: '该账号已被注册，请直接登录' });
        return;
      }

      const totalUsers = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users')?.cnt || 0;
      // First registered user OR matching admin secret becomes GM admin
      const isAdmin = totalUsers === 0 || adminSecret === config.adminSecret ? 1 : 0;
      const hash = bcrypt.hashSync(password, 8);

      execute(
        'INSERT INTO users (username, password_hash, nickname, is_admin, created_at) VALUES (?, ?, ?, ?, ?)',
        [username, hash, nickname.slice(0, 14), isAdmin, Date.now()],
      );
      const userId = getLastInsertId();
      initNewPlayer(userId, nickname.slice(0, 14));

      const token = signToken(userId, Boolean(isAdmin));
      res.json({ token, state: buildFullGameState(userId, { withStory: true }) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '注册失败' });
    }
  });

  router.post('/auth/login', (req, res) => {
    if (!checkAuthRateLimit(req, res)) return;
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const user = queryOne<any>('SELECT * FROM users WHERE username = ?', [username]);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        res.status(401).json({ error: '账号或密码错误' });
        return;
      }
      const token = signToken(user.id, Boolean(user.is_admin));
      res.json({ token, state: buildFullGameState(user.id, { withStory: true }) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '登录失败' });
    }
  });

  router.get('/state', authMiddleware, (req: AuthedRequest, res) => {
    res.json({ state: buildFullGameState(req.userId!, { withStory: true }) });
  });

  // ================= HOMEPAGE COMPANION INTERACTION =================
  router.post('/home/poke', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const requestedId = req.body?.heroineId ? String(req.body.heroineId).trim() : '';
      const content = getContent();
      const portfolio = computePortfolioAndTier(userId);
      const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);

      const mainPropRow = portfolio.ownedProps.find((p) => p.property_id === portfolio.state.main_property_id);
      const mainPropDef = content.properties.find((p) => p.id === portfolio.state.main_property_id);
      let mainResidents: string[] = [];
      try {
        mainResidents = mainPropRow ? JSON.parse(mainPropRow.residents_json || '[]') : [];
      } catch {}

      let targetId = requestedId;
      if (!targetId) {
        const firstResident = mainResidents.find((hid) =>
          portfolio.heroinesRows.some((r) => r.heroine_id === hid && r.unlocked),
        );
        const firstUnlocked = portfolio.heroinesRows.find((r) => r.unlocked)?.heroine_id;
        targetId = firstResident || firstUnlocked || 'chen_mo';
      }

      const hDef = content.heroines.find((h) => h.id === targetId);
      const hRow = hDef
        ? portfolio.heroinesRows.find((r) => r.heroine_id === targetId && r.unlocked)
        : null;

      let affectionGain = 0;
      let resolvedId = targetId;
      let address: string | undefined;
      let affectionStage: string | undefined;

      if (hDef && hRow) {
        const usedToday = getDailyPokeCount(userId);
        if (usedToday < DAILY_POKE_LIMIT) {
          affectionGain = 1;
          execute(
            'UPDATE player_heroines SET affection = affection + 1, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?',
            [Date.now(), userId, targetId],
            false,
          );
          incrementDailyPokeCount(userId);
        }
        const stage = getHeroineStage(hDef, hRow.affection + affectionGain);
        address = stage?.address;
        affectionStage = stage?.name;
      } else if (targetId !== 'chen_mo' && targetId !== 'protagonist') {
        // Fallback safely if requested heroine isn't unlocked yet
        resolvedId = 'chen_mo';
      }

      const car = content.assetsCatalog.assets.find((a) => a.id === portfolio.state.equipped_car_id);
      const reply = buildHomePokePayload(userId, resolvedId, {
        timePeriod: getTimePeriod(),
        timeLabel: getTimePeriodLabel(),
        netWorthText: formatMoney(portfolio.netWorth),
        tierName: portfolio.tierInfo.name,
        carName: car?.name || '小电驴',
        residenceName: mainPropRow?.custom_name || mainPropDef?.name || '城南老巷单间',
        nickname: user?.nickname || '陆沉',
        incomePerHourText: formatMoney(portfolio.incomePerHour),
        affectionStage,
        address,
      });

      const pokesLeftToday = getPokesRemainingToday(userId);

      res.json({
        success: true,
        heroineId: resolvedId,
        line: reply.line,
        mood: reply.mood,
        innerThought: reply.innerThought,
        affectionGain,
        pokesLeftToday,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= STORY ENGINE =================
  router.post('/story/complete', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { episodeId, choiceId, choiceIds } = req.body || {};
      const content = getContent();
      const allEps = content.stories.volumes.flatMap((v: any) => v.episodes);
      const ep = allEps.find((e: any) => e.episodeId === episodeId);
      if (!ep) throw new Error('剧情章节不存在');

      const already = queryOne('SELECT episode_id FROM player_progress WHERE user_id = ? AND episode_id = ?', [
        userId,
        episodeId,
      ]);
      if (already) {
        res.json({ alreadyCompleted: true, state: buildFullGameState(userId) });
        return;
      }

      if (ep.requireEpisode) {
        const prereq = queryOne('SELECT episode_id FROM player_progress WHERE user_id = ? AND episode_id = ?', [
          userId,
          ep.requireEpisode,
        ]);
        if (!prereq) throw new Error('请先完成上一节主线剧情');
      }

      const portfolio = computePortfolioAndTier(userId);
      if (ep.requireNetWorth && portfolio.netWorth < ep.requireNetWorth) {
        throw new Error(`总身价需达到 ${formatMoney(ep.requireNetWorth)} 才可开启本幕（当前 ${formatMoney(portfolio.netWorth)}）`);
      }

      // Collect ALL matched options across ALL system_choice nodes in ep.nodes
      const selectedOpts = collectStorySelectedOptions(ep.nodes, choiceId, choiceIds);

      // Validate energy & cumulative cash requirement BEFORE mutating any state
      assertEnergySufficient(userId, ep.costEnergy || 0);
      let simulatedCash = Number(portfolio.state.cash || 0);
      for (const opt of selectedOpts) {
        const cashCost = Number(opt?.cost?.cash || 0);
        if (cashCost > 0) {
          if (simulatedCash < cashCost) {
            throw new Error(`现金不足（需要 ${formatMoney(cashCost)}，当前 ${formatMoney(simulatedCash)}）`);
          }
          simulatedCash -= cashCost;
        }
        const r = opt?.reward;
        if (r) {
          if (r.critMultiplier && cashCost > 0) {
            simulatedCash += Math.max(Math.round(cashCost * r.critMultiplier), Number(r.cash || 0));
          } else if (r.cash) {
            simulatedCash += Number(r.cash);
          }
        }
      }

      // Now atomically apply energy cost and every selected option's cost & reward
      spendEnergyOrThrow(userId, ep.costEnergy || 0);

      let critResult: any = null;
      const unlockedHeroines: string[] = [];
      const unlockedAssets: Array<{ id: string; name: string }> = [];
      const affectionGains: Array<{ heroineId: string; name: string; amount: number }> = [];
      const resultTexts: string[] = [];
      let totalCashGain = 0;
      let totalSysPoints = 0;

      for (const opt of selectedOpts) {
        const cashCost = Number(opt?.cost?.cash || 0);
        if (cashCost > 0) {
          spendCashOrThrow(userId, cashCost);
        }

        if (opt?.reward) {
          const r = opt.reward;
          if (r.critMultiplier && cashCost > 0) {
            const crit = rollCritCashback(userId, cashCost, { forceMultiplier: r.critMultiplier });
            if (r.cash && r.cash > crit.cashback) {
              execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [r.cash - crit.cashback, userId]);
              crit.cashback = r.cash;
            }
            totalCashGain += crit.cashback;
            if (!critResult) {
              critResult = crit;
            } else {
              critResult = {
                ...crit,
                multiplier: Math.max(critResult.multiplier || 0, crit.multiplier || 0),
                cashback: (critResult.cashback || 0) + (crit.cashback || 0),
              };
            }
          } else if (r.cash) {
            execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [r.cash, userId]);
            totalCashGain += Number(r.cash);
            if (r.critMultiplier) {
              const synthetic = { triggered: true, multiplier: r.critMultiplier, cashback: r.cash };
              critResult = !critResult
                ? synthetic
                : {
                    triggered: true,
                    multiplier: Math.max(critResult.multiplier || 0, synthetic.multiplier),
                    cashback: (critResult.cashback || 0) + synthetic.cashback,
                  };
            }
          }
          if (r.sysPoints) {
            execute('UPDATE player_state SET sys_points = sys_points + ? WHERE user_id = ?', [r.sysPoints, userId]);
            totalSysPoints += Number(r.sysPoints);
          }
          if (r.critCharge !== undefined) {
            execute('UPDATE player_state SET crit_charge = ? WHERE user_id = ?', [Math.min(100, r.critCharge), userId]);
          }
          if (r.unlockAsset) {
            execute('INSERT OR IGNORE INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)', [
              userId,
              r.unlockAsset,
              Date.now(),
            ]);
            const assetDef = content.assetsCatalog.assets.find((a: any) => a.id === r.unlockAsset);
            if (!unlockedAssets.some((a) => a.id === r.unlockAsset)) {
              unlockedAssets.push({ id: r.unlockAsset, name: assetDef?.name || r.unlockAsset });
            }
          }
          if (r.equipCar) {
            execute('INSERT OR IGNORE INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)', [
              userId,
              r.equipCar,
              Date.now(),
            ]);
            execute('UPDATE player_state SET equipped_car_id = ? WHERE user_id = ?', [r.equipCar, userId]);
            const carDef = content.assetsCatalog.assets.find((a: any) => a.id === r.equipCar);
            if (!unlockedAssets.some((a) => a.id === r.equipCar)) {
              unlockedAssets.push({ id: r.equipCar, name: carDef?.name || r.equipCar });
            }
          }
          if (r.unlockHeroine) {
            execute('UPDATE player_heroines SET unlocked = 1 WHERE user_id = ? AND heroine_id = ?', [
              userId,
              r.unlockHeroine,
            ]);
            if (!unlockedHeroines.includes(r.unlockHeroine)) {
              unlockedHeroines.push(r.unlockHeroine);
            }
          }
          const affGainVal = Number(r.affectionGain || opt.affectionBonus || 0);
          if (r.affectionHeroine && affGainVal > 0) {
            const prevH = queryOne<any>(
              'SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?',
              [userId, r.affectionHeroine],
            );
            execute(
              'UPDATE player_heroines SET unlocked = 1, affection = affection + ? WHERE user_id = ? AND heroine_id = ?',
              [affGainVal, userId, r.affectionHeroine],
            );
            if (prevH && !prevH.unlocked && !unlockedHeroines.includes(r.affectionHeroine)) {
              unlockedHeroines.push(r.affectionHeroine);
            }
            const hDef = content.heroines.find((h) => h.id === r.affectionHeroine);
            const existingAff = affectionGains.find((x) => x.heroineId === r.affectionHeroine);
            if (existingAff) {
              existingAff.amount += affGainVal;
            } else {
              affectionGains.push({
                heroineId: r.affectionHeroine,
                name: hDef?.name || r.affectionHeroine,
                amount: affGainVal,
              });
            }
          }
        }

        if (opt?.resultText) {
          resultTexts.push(opt.resultText);
        }
      }

      const savedChoiceSummary = selectedOpts
        .map((o) => o?.id)
        .filter(Boolean)
        .join(',');

      execute(
        'INSERT INTO player_progress (user_id, episode_id, choice_id, completed_at) VALUES (?, ?, ?, ?)',
        [userId, episodeId, savedChoiceSummary, Date.now()],
      );

      // Move player to story district & post celebratory moment
      if (ep.districtId) {
        execute('UPDATE player_state SET current_district = ? WHERE user_id = ?', [ep.districtId, userId]);
      }

      const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
      const nick = user?.nickname || '陆沉';
      if (ep.moment && ep.moment.text) {
        const vars = { playerName: nick };
        const comments = Array.isArray(ep.moment.comments)
          ? ep.moment.comments.map((c: any) => ({
              author: interpolateText(String(c?.author || ''), vars),
              text: interpolateText(String(c?.text || ''), vars),
            }))
          : [];
        const likes = Array.isArray(ep.moment.likes)
          ? ep.moment.likes.map((l: any) => interpolateText(String(l || ''), vars))
          : [];
        postMoment(
          userId,
          ep.moment.author ? interpolateText(String(ep.moment.author), vars) : nick,
          interpolateText(String(ep.moment.text), vars),
          ep.moment.location || '海城',
          comments,
          likes,
          ep.moment.avatar || '',
        );
      }

      res.json({
        success: true,
        critResult,
        unlockedHeroines,
        unlockedAssets,
        rewardsSummary: {
          cashGain: totalCashGain,
          sysPoints: totalSysPoints,
          affectionGains,
          unlockedAssets,
          unlockedHeroines,
        },
        cliffhanger: ep.cliffhanger || '',
        resultText: resultTexts.join(' ') || '本节剧情推进完成！',
        reactionText: resultTexts[resultTexts.length - 1] || '本节剧情推进完成！',
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= MAP, STROLL & DATE =================
  router.post('/map/travel', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId } = req.body || {};
      const content = getContent();
      const d = content.map.districts.find((x: any) => x.id === districtId);
      if (!d) throw new Error('未知区域');
      const { tierInfo } = computePortfolioAndTier(userId);
      if (tierInfo.tier < d.unlockTier) {
        const reqTier = content.map.tiers.find((t: any) => t.tier === d.unlockTier);
        throw new Error(`需晋升至【${reqTier?.name || `阶层${d.unlockTier}`}】才能解锁【${d.name}】`);
      }
      execute('UPDATE player_state SET current_district = ? WHERE user_id = ?', [districtId, userId]);
      res.json({ success: true, district: d, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/map/stroll', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId } = req.body || {};
      const content = getContent();
      const district = content.map.districts.find((x: any) => x.id === districtId);
      if (!district) throw new Error('未知区域');
      const { tierInfo } = computePortfolioAndTier(userId);
      if (tierInfo.tier < district.unlockTier) {
        const reqTier = content.map.tiers.find((t: any) => t.tier === district.unlockTier);
        throw new Error(`需晋升至【${reqTier?.name || `阶层${district.unlockTier}`}】才能解锁【${district.name}】`);
      }
      const pool = content.districtEvents[districtId];
      if (!pool || pool.length === 0) throw new Error('该区域暂时没有随机事件');
      spendEnergyOrThrow(userId, 5);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      incrementDailyTask(userId, 'task_minigame', 1);
      res.json({ event: picked, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/map/stroll/resolve', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId, eventId, choiceIndex } = req.body || {};
      const content = getContent();
      const pool = content.districtEvents[districtId] || [];
      const ev = pool.find((x: any) => x.id === eventId);
      if (!ev) throw new Error('事件已过期');
      const choice = ev.choices[Number(choiceIndex) || 0];
      if (!choice) throw new Error('选项无效');

      let critResult: any = null;
      if (choice.cashCost > 0) {
        spendCashOrThrow(userId, choice.cashCost);
        if (choice.canCrit) {
          critResult = rollCritCashback(userId, choice.cashCost);
        }
      }
      if (choice.cashGain) {
        execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [choice.cashGain, userId]);
      }
      if (choice.sysPoints) {
        execute('UPDATE player_state SET sys_points = sys_points + ? WHERE user_id = ?', [choice.sysPoints, userId]);
      }
      if (choice.unlockHeroine) {
        execute('UPDATE player_heroines SET unlocked = 1 WHERE user_id = ? AND heroine_id = ?', [userId, choice.unlockHeroine]);
      }
      if (choice.affectionHeroine && choice.affectionGain) {
        execute(
          'UPDATE player_heroines SET affection = affection + ? WHERE user_id = ? AND heroine_id = ? AND unlocked = 1',
          [choice.affectionGain, userId, choice.affectionHeroine],
        );
      }

      res.json({
        success: true,
        resultText: choice.resultText,
        cashGain: choice.cashGain || 0,
        sysPoints: choice.sysPoints || 0,
        unlockedHeroine: choice.unlockHeroine || null,
        critResult,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/map/date/start', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId, interactionId, heroineId } = req.body || {};
      const content = getContent();
      const district = content.map.districts.find((d: any) => d.id === districtId);
      const inter = district?.interactions?.find((i: any) => i.id === interactionId);
      if (!district || !inter) throw new Error('该约会地点不存在');
      assertInteractionOpen(districtId, interactionId);
      const { tierInfo } = computePortfolioAndTier(userId);
      if (tierInfo.tier < district.unlockTier) {
        const reqTier = content.map.tiers.find((t: any) => t.tier === district.unlockTier);
        throw new Error(`需晋升至【${reqTier?.name || `阶层${district.unlockTier}`}】才能解锁【${district.name}】`);
      }

      const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        heroineId,
      ]);
      if (!hRow || !hRow.unlocked) throw new Error('请先解锁想要邀约的红颜');
      const hDef = content.heroines.find((h) => h.id === heroineId);
      if (!hDef) throw new Error('该红颜不存在');

      // Validate resources without deducting yet — charging happens atomically on completion
      assertEnergySufficient(userId, inter.energy || 6);
      assertCashSufficient(userId, inter.cashCost || 0);

      const script = resolveDateMiniStoryScript(userId, district, inter, hDef);
      res.json({ script });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/map/date', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId, interactionId, heroineId, choiceId, choiceIds } = req.body || {};
      const content = getContent();
      const district = content.map.districts.find((d: any) => d.id === districtId);
      const inter = district?.interactions?.find((i: any) => i.id === interactionId);
      if (!district || !inter) throw new Error('该约会地点不存在');
      assertInteractionOpen(districtId, interactionId);
      const { tierInfo: dateTierInfo } = computePortfolioAndTier(userId);
      if (dateTierInfo.tier < district.unlockTier) {
        const reqTier = content.map.tiers.find((t: any) => t.tier === district.unlockTier);
        throw new Error(`需晋升至【${reqTier?.name || `阶层${district.unlockTier}`}】才能解锁【${district.name}】`);
      }

      const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        heroineId,
      ]);
      if (!hRow || !hRow.unlocked) throw new Error('请先解锁想要邀约的红颜');
      const hDef = content.heroines.find((h) => h.id === heroineId);
      if (!hDef) throw new Error('该红颜不存在');

      // Validate BOTH energy & cash before spending either
      assertEnergySufficient(userId, inter.energy || 6);
      assertCashSufficient(userId, inter.cashCost || 0);

      spendEnergyOrThrow(userId, inter.energy || 6);
      let critResult: any = null;
      if (inter.cashCost > 0) {
        spendCashOrThrow(userId, inter.cashCost);
        critResult = rollCritCashback(userId, inter.cashCost);
      }

      // Resolve server-authoritative choice bonus from mini-story script if choiceId provided
      const resolvedChoiceId =
        choiceId || (Array.isArray(choiceIds) && choiceIds.length > 0 ? String(choiceIds[choiceIds.length - 1]) : '');
      let bonusAffection = 0;
      let reactionText = `和${hDef.name}在${inter.name}待了一晚。`;
      if (resolvedChoiceId) {
        const script = resolveDateMiniStoryScript(userId, district, inter, hDef);
        const matchedOpt = findMiniStoryOption(script.nodes, String(resolvedChoiceId));
        if (matchedOpt) {
          bonusAffection = Math.max(0, Math.min(8, Math.round(Number(matchedOpt.affectionBonus || 0))));
          if (matchedOpt.resultText) {
            reactionText = matchedOpt.resultText;
          }
        }
      }

      const { skills } = computePortfolioAndTier(userId);
      const baseAff = inter.cashCost >= 50000 ? 22 : inter.cashCost >= 15000 ? 15 : 10;
      const favSpotBonus =
        (interactionId === 'night_noodles' && (heroineId === 'su_qingwan' || heroineId === 'lu_zhiwei')) ||
        (interactionId === 'ginkgo_walk' && heroineId === 'lin_wanxing') ||
        (interactionId === 'vinyl_lounge' && heroineId === 'shen_liuli')
          ? 6
          : 0;
      const totalAff = Math.round((baseAff + favSpotBonus) * (1 + skills.charmPct)) + bonusAffection;

      execute(
        'UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?',
        [totalAff, Date.now(), userId, heroineId],
      );
      execute('UPDATE player_state SET sys_points = sys_points + 25 WHERE user_id = ?', [userId]);
      incrementDailyTask(userId, 'task_minigame', 1);

      if (bonusAffection >= 4 && Math.random() < 0.45) {
        const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
        postSweetDateMoment(userId, hDef, district, inter, user?.nickname || '陆沉');
      }

      res.json({
        success: true,
        message: `和${hDef.name}去了${district.name}${inter.name}，好感 +${totalAff}。`,
        affectionGain: totalAff,
        bonusAffection,
        reactionText,
        critResult,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= MULTI-PROPERTY SYSTEM =================
  router.post('/property/buy', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId } = req.body || {};
      const prop = getPropertyDef(String(propertyId || ''));
      const { critResult } = purchaseProperty(userId, prop.id, prop.price);
      res.json({ success: true, critResult, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/set-main', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId } = req.body || {};
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      const owned = queryOne('SELECT property_id FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!prop || !owned || prop.type !== 'residence') throw new Error('只能将已拥有的住宅设为主居所');
      execute('UPDATE player_state SET main_property_id = ? WHERE user_id = ?', [propertyId, userId]);
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/renovate', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId } = req.body || {};
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      const owned = queryOne<any>('SELECT * FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!prop || !owned) throw new Error('尚未拥有该房产');
      if (owned.renovation_level >= 5) throw new Error('已达顶级满星精装');

      const { skills } = computePortfolioAndTier(userId);
      const cost = Math.round(Math.max(250000, prop.price * 0.25) * owned.renovation_level * (1 - skills.upgradeDiscountPct));
      spendCashOrThrow(userId, cost);
      const critResult = rollCritCashback(userId, cost);

      execute('UPDATE player_properties SET renovation_level = renovation_level + 1 WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      res.json({ success: true, critResult, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/rename', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId, customName } = req.body || {};
      const name = String(customName || '').trim().slice(0, 14);
      if (!name) throw new Error('请输入冠名名称');
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      if (!prop || !prop.canRename) throw new Error('该房产不支持自定义冠名');
      const owned = queryOne('SELECT property_id FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!owned) throw new Error('请先购入该物业');

      execute('UPDATE player_properties SET custom_name = ? WHERE user_id = ? AND property_id = ?', [
        name,
        userId,
        propertyId,
      ]);
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/assign-heroine', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId, heroineId } = req.body || {};
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      const owned = queryOne<any>('SELECT * FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!prop || !owned || prop.maxResidents <= 0) throw new Error('该房产不可安排红颜入住');

      const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
      if (!hRow || !hRow.unlocked) throw new Error('请先解锁该红颜');

      // Remove heroine from any other property first
      const allProps = queryAll<any>('SELECT * FROM player_properties WHERE user_id = ?', [userId]);
      for (const p of allProps) {
        let arr: string[] = [];
        try {
          arr = JSON.parse(p.residents_json || '[]');
        } catch {}
        if (arr.includes(heroineId)) {
          const filtered = arr.filter((id) => id !== heroineId);
          execute('UPDATE player_properties SET residents_json = ? WHERE user_id = ? AND property_id = ?', [
            JSON.stringify(filtered),
            userId,
            p.property_id,
          ]);
        }
      }

      const fresh = queryOne<any>('SELECT residents_json FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      let residents: string[] = [];
      try {
        residents = JSON.parse(fresh.residents_json || '[]');
      } catch {}
      if (residents.length >= prop.maxResidents) {
        residents.shift();
      }
      residents.push(heroineId);
      execute('UPDATE player_properties SET residents_json = ? WHERE user_id = ? AND property_id = ?', [
        JSON.stringify(residents),
        userId,
        propertyId,
      ]);

      // Bonus affection for gifting keys!
      execute('UPDATE player_heroines SET affection = affection + 18 WHERE user_id = ? AND heroine_id = ?', [
        userId,
        heroineId,
      ]);

      const hDef = content.heroines.find((h) => h.id === heroineId);
      const multiNote = residents.length > 1 ? `（目前同住 ${residents.length} 人）` : '';

      res.json({
        success: true,
        message: `已把${owned.custom_name || prop.name}的钥匙交给了${hDef.name}，傍晚后她会在这里等你${multiNote}。`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/home-interact/start', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId, interactionId, heroineId } = req.body || {};
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      const owned = queryOne<any>('SELECT * FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!prop || !owned) throw new Error('房产不存在');
      const inter = prop.homeInteractions?.find((i: any) => i.id === interactionId);
      if (!inter) throw new Error('互动选项不存在');

      let residents: string[] = [];
      try {
        residents = JSON.parse(owned.residents_json || '[]');
      } catch {}
      const targetHeroine = heroineId || residents[0];
      if (!targetHeroine) throw new Error('这套房子目前没有红颜入住，先送一把钥匙给她吧！');
      if (!residents.includes(targetHeroine)) throw new Error('该红颜目前未入住这套私宅');

      const hRow = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        targetHeroine,
      ]);
      if (!hRow || !hRow.unlocked) throw new Error('请先解锁该红颜');
      const hDef = content.heroines.find((h) => h.id === targetHeroine);
      if (!hDef) throw new Error('红颜不存在');

      // Validate sufficient energy without deducting yet
      assertEnergySufficient(userId, inter.energy || 5);

      const script = resolveHomeMiniStoryScript(userId, prop, owned, inter, hDef);
      res.json({ script });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/property/home-interact', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { propertyId, interactionId, heroineId, choiceId, choiceIds } = req.body || {};
      const content = getContent();
      const prop = content.properties.find((p) => p.id === propertyId);
      const owned = queryOne<any>('SELECT * FROM player_properties WHERE user_id = ? AND property_id = ?', [
        userId,
        propertyId,
      ]);
      if (!prop || !owned) throw new Error('房产不存在');
      const inter = prop.homeInteractions?.find((i: any) => i.id === interactionId);
      if (!inter) throw new Error('互动选项不存在');

      let residents: string[] = [];
      try {
        residents = JSON.parse(owned.residents_json || '[]');
      } catch {}
      const targetHeroine = heroineId || residents[0];
      if (!targetHeroine) throw new Error('这套房子目前没有红颜入住，先送一把钥匙给她吧！');
      if (!residents.includes(targetHeroine)) {
        throw new Error('该红颜目前未入住这套私宅');
      }
      const hDef = content.heroines.find((h) => h.id === targetHeroine);
      if (!hDef) throw new Error('红颜不存在');

      spendEnergyOrThrow(userId, inter.energy || 5);

      const resolvedChoiceId =
        choiceId || (Array.isArray(choiceIds) && choiceIds.length > 0 ? String(choiceIds[choiceIds.length - 1]) : '');
      let bonusAffection = 0;
      let reactionText = `在${owned.custom_name || prop.name}和${hDef.name}度过了一个安静的夜晚。`;
      if (resolvedChoiceId) {
        const script = resolveHomeMiniStoryScript(userId, prop, owned, inter, hDef);
        const matchedOpt = findMiniStoryOption(script.nodes, String(resolvedChoiceId));
        if (matchedOpt) {
          bonusAffection = Math.max(0, Math.min(8, Math.round(Number(matchedOpt.affectionBonus || 0))));
          if (matchedOpt.resultText) {
            reactionText = matchedOpt.resultText;
          }
        }
      }

      const { skills } = computePortfolioAndTier(userId);
      const baseGain = Math.round(
        (inter.affection || 8) * (1 + skills.charmPct) * (1 + (owned.renovation_level - 1) * 0.15),
      );
      const gain = baseGain + bonusAffection;

      execute(
        'UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?',
        [gain, Date.now(), userId, targetHeroine],
      );
      execute('UPDATE player_state SET sys_points = sys_points + 20 WHERE user_id = ?', [userId]);

      res.json({
        success: true,
        message: `在${owned.custom_name || prop.name}和${hDef.name}共度「${inter.name}」，好感 +${gain}。`,
        affectionGain: gain,
        bonusAffection,
        reactionText,
        critResult: null,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= BUSINESSES, OFFLINE INCOME & ASSETS =================
  router.post('/income/collect', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { pendingIncome } = computePortfolioAndTier(userId);
      if (pendingIncome <= 0) {
        throw new Error('暂时没有待收取的收益');
      }
      const now = Date.now();
      execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [pendingIncome, userId], false);
      execute('UPDATE player_businesses SET last_collected_at = ? WHERE user_id = ?', [now, userId], false);
      execute('UPDATE player_properties SET last_rent_at = ? WHERE user_id = ?', [now, userId]);
      incrementDailyTask(userId, 'task_collect', 1);

      res.json({
        success: true,
        collected: pendingIncome,
        message: `招商私行：入账 ${formatMoney(pendingIncome)}（产业分红与物业租金）`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/business/buy', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { businessId } = req.body || {};
      const biz = getBusinessDef(String(businessId || ''));
      const { critResult } = purchaseBusiness(userId, biz.id, biz.buyCost);
      res.json({ success: true, critResult, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/business/upgrade', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { businessId } = req.body || {};
      const content = getContent();
      const biz = content.businesses.find((b) => b.id === businessId);
      const owned = queryOne<any>('SELECT * FROM player_businesses WHERE user_id = ? AND business_id = ?', [
        userId,
        businessId,
      ]);
      if (!biz || !owned) throw new Error('尚未收购该产业');

      const { skills } = computePortfolioAndTier(userId);
      const cost = Math.round(biz.upgradeBaseCost * Math.pow(1.45, Math.max(0, owned.level - 1)) * (1 - skills.upgradeDiscountPct));
      spendCashOrThrow(userId, cost);
      const critResult = rollCritCashback(userId, cost);
      execute('UPDATE player_businesses SET level = level + 1 WHERE user_id = ? AND business_id = ?', [userId, businessId]);
      res.json({ success: true, critResult, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/business/assign', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { businessId, heroineId } = req.body || {};
      if (heroineId) {
        const h = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
        if (!h || !h.unlocked) throw new Error('该红颜尚未解锁');
        // Unassign from other businesses
        execute('UPDATE player_businesses SET assigned_heroine_id = ? WHERE user_id = ? AND assigned_heroine_id = ?', [
          '',
          userId,
          heroineId,
        ]);
      }
      execute('UPDATE player_businesses SET assigned_heroine_id = ? WHERE user_id = ? AND business_id = ?', [
        heroineId || '',
        userId,
        businessId,
      ]);
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/asset/buy', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { assetId } = req.body || {};
      const content = getContent();
      const asset = content.assetsCatalog.assets.find((a) => a.id === assetId);
      if (!asset || asset.dropOnly) throw new Error('该典藏品无法直接购买，请通过赌石或活动获取');
      const owned = queryOne('SELECT asset_id FROM player_assets WHERE user_id = ? AND asset_id = ?', [userId, assetId]);
      if (owned) throw new Error('你已拥有该藏品');

      const price = assetPriceNow(asset);
      spendCashOrThrow(userId, price);
      const critResult = rollCritCashback(userId, price);
      execute('INSERT INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)', [userId, assetId, Date.now()]);

      if (asset.type === 'car') {
        // drive the new car only if it's faster than the current one (a used runabout shouldn't replace a supercar)
        const cur = queryOne<any>('SELECT equipped_car_id FROM player_state WHERE user_id = ?', [userId]);
        const curCar = content.assetsCatalog.assets.find((a) => a.id === cur?.equipped_car_id);
        if (!curCar || Number(asset.racePower || 0) > Number(curCar.racePower || 0)) {
          execute('UPDATE player_state SET equipped_car_id = ? WHERE user_id = ?', [assetId, userId]);
        }
      }
      res.json({ success: true, critResult, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/asset/equip-car', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { assetId } = req.body || {};
      const owned = queryOne('SELECT asset_id FROM player_assets WHERE user_id = ? AND asset_id = ?', [userId, assetId]);
      if (!owned) throw new Error('车库中暂无该座驾');
      execute('UPDATE player_state SET equipped_car_id = ? WHERE user_id = ?', [assetId, userId]);
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= HEROINES, DEEPSEEK AI CHAT, GIFTS & MOMENTS =================
  router.get('/heroines/:id/chat', authMiddleware, (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const heroineId = String(req.params.id);
    const messages = queryAll<any>(
      'SELECT * FROM npc_chat_messages WHERE user_id = ? AND heroine_id = ? ORDER BY id ASC LIMIT 60',
      [userId, heroineId],
    );
    const memories = queryAll<any>(
      'SELECT * FROM npc_memories WHERE user_id = ? AND heroine_id = ? ORDER BY id DESC LIMIT 10',
      [userId, heroineId],
    );
    res.json({ messages, memories });
  });

  router.post('/heroines/:id/chat', authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const heroineId = String(req.params.id);
      const message = String(req.body?.message || '').trim();
      const overrideLocation = req.body?.overrideLocation ? String(req.body.overrideLocation) : undefined;
      if (!message) throw new Error('请输入想说的话');
      if (message.length > 300) throw new Error('单条消息请控制在 300 字以内');

      const aiReply = await chatWithHeroine(userId, heroineId, message, { overrideLocation });
      res.json({ aiReply, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/heroines/:id/gift', authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const heroineId = String(req.params.id);
      const { giftId } = req.body || {};
      const content = getContent();
      const gift = content.gifts.find((g) => g.id === giftId);
      const hDef = content.heroines.find((h) => h.id === heroineId);
      if (!gift || !hDef) throw new Error('礼物或红颜不存在');

      const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
      if (!hRow || !hRow.unlocked) throw new Error('请先解锁该红颜');

      spendCashOrThrow(userId, gift.price);
      const critResult = rollCritCashback(userId, gift.price);

      const { skills } = computePortfolioAndTier(userId);
      const isFav = hDef.favoriteGifts?.includes(giftId);
      const affGain = Math.round(gift.affection * (isFav ? 1.4 : 1) * (1 + skills.charmPct));

      execute(
        'UPDATE player_heroines SET affection = affection + ?, last_gift_name = ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?',
        [affGain, gift.name, Date.now(), userId, heroineId],
        false,
      );
      execute('UPDATE player_state SET last_gift_heroine_id = ?, last_gift_time = ? WHERE user_id = ?', [
        heroineId,
        Date.now(),
        userId,
      ]);

      // Trigger immediate in-character AI reaction inside WeChat!
      const aiReply = await chatWithHeroine(userId, heroineId, `[向你赠送了礼物：${gift.name}]`, {
        systemEventNote: `玩家刚刚豪掷 ${formatMoney(gift.price)} 送给你【${gift.name}】${isFav ? '（正是你最心仪的礼物！）' : ''}，请立刻给出真实惊喜/傲娇回应！`,
      });

      res.json({
        success: true,
        affectionGain: affGain,
        isFav,
        critResult,
        aiReply,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/moments', authMiddleware, (req: AuthedRequest, res) => {
    const rows = queryAll<any>('SELECT * FROM social_moments WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.userId!]);
    const moments = rows.map((r) => ({
      ...r,
      likes: JSON.parse(r.likes_json || '[]'),
      comments: JSON.parse(r.comments_json || '[]'),
      likedByPlayer: Boolean(r.liked_by_player),
    }));
    res.json({ moments });
  });

  router.post('/moments/:id/like', authMiddleware, (req: AuthedRequest, res) => {
    const row = queryOne<any>('SELECT * FROM social_moments WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId!]);
    if (!row) {
      res.status(404).json({ error: '动态不存在' });
      return;
    }
    const nextLiked = row.liked_by_player ? 0 : 1;
    execute('UPDATE social_moments SET liked_by_player = ? WHERE id = ?', [nextLiked, row.id]);
    res.json({ success: true, likedByPlayer: Boolean(nextLiked) });
  });

  // ================= DISTRICT MINI-GAMES =================
  // 1. Old Street: Jade Gambling

  // 2. University: Angel Investment Corner

  // 3. Bund: Midnight Street Race (uses equipped supercar!)

  // 4. CBD: Virtual Stock Market (real-time ticking quotes + rotating TianShu insider tip)
  router.get('/minigame/stocks', authMiddleware, (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const { skills } = computePortfolioAndTier(userId);
    res.json(buildStockMarketSnapshot(userId, Number(skills.insightLevel || 0)));
  });


  // 5. Night City: Livestream PK

  // 6. Limited-Time Cruise Event

  router.post('/event/cruise/redeem', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { rewardId } = req.body || {};
      const content = getContent();
      const ev = content.events.find((e) => e.id === 'event_cruise_01');
      const rew = ev?.rewards?.find((r: any) => r.id === rewardId);
      if (!rew) throw new Error('活动奖励不存在');

      const row = queryOne<any>('SELECT * FROM player_events WHERE user_id = ? AND event_id = ?', [userId, ev.id]);
      if (!row || row.tokens < rew.costTokens) throw new Error(`星耀勋章不足（需要 ${rew.costTokens}）`);

      const redeemed: string[] = JSON.parse(row.redeemed_json || '[]');
      if (rew.assetId && redeemed.includes(rew.id)) throw new Error('该绝版典藏品已兑换');

      execute('UPDATE player_events SET tokens = tokens - ?, redeemed_json = ? WHERE user_id = ? AND event_id = ?', [
        rew.costTokens,
        JSON.stringify([...redeemed, rew.id]),
        userId,
        ev.id,
      ]);
      if (rew.assetId) {
        execute('INSERT OR IGNORE INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)', [
          userId,
          rew.assetId,
          Date.now(),
        ]);
      }
      if (rew.sysPoints) {
        execute('UPDATE player_state SET sys_points = sys_points + ? WHERE user_id = ?', [rew.sysPoints, userId]);
      }
      if (rew.cash) {
        execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [rew.cash, userId]);
      }

      res.json({ success: true, message: `成功兑换【${rew.name}】！`, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ================= SYSTEM CORE, TASKS, SKILLS, MALL, LEADERBOARD, MAIL =================
  router.post('/system/signin', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const st = ensureDailyResetAndEnergy(userId);
      if (st.signed_in_today) throw new Error('今日已完成天枢签到');
      const { tierInfo } = computePortfolioAndTier(userId);
      const cashBonus = 150000 * tierInfo.tier;
      execute(
        'UPDATE player_state SET signed_in_today = 1, cash = cash + ?, sys_points = sys_points + 40, energy = MIN(?, energy + 25) WHERE user_id = ?',
        [cashBonus, st.maxEnergy + 30, userId],
      );
      incrementDailyTask(userId, 'task_signin', 1);
      res.json({
        success: true,
        message: `签到成功！获得阶层补贴 ${formatMoney(cashBonus)}、系统积分 +40、精力 +25！`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/system/task/claim', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { taskId } = req.body || {};
      const content = getContent();
      const task = content.skillsData.dailyTasks.find((t) => t.id === taskId);
      if (!task) throw new Error('任务不存在');
      const st = ensureDailyResetAndEnergy(userId);
      const prog = JSON.parse(st.daily_progress_json || '{}');
      const claimed: string[] = JSON.parse(st.daily_claimed_json || '[]');
      if (claimed.includes(taskId)) throw new Error('该任务奖励已领取');
      if ((prog[taskId] || 0) < task.target) throw new Error('任务尚未达成');

      claimed.push(taskId);
      execute(
        'UPDATE player_state SET daily_claimed_json = ?, cash = cash + ?, sys_points = sys_points + ?, energy = energy + ? WHERE user_id = ?',
        [JSON.stringify(claimed), task.rewardCash, task.rewardPoints, task.rewardEnergy, userId],
      );
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/system/skill/upgrade', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { skillId } = req.body || {};
      const content = getContent();
      const sk = content.skillsData.skills.find((s) => s.id === skillId);
      if (!sk) throw new Error('词条不存在');
      const st = queryOne<any>('SELECT sys_points, skills_json FROM player_state WHERE user_id = ?', [userId]);
      const map = JSON.parse(st.skills_json || '{}');
      const currLv = Number(map[skillId] || 0);
      if (currLv >= sk.maxLevel) throw new Error('该词条已满级');
      const cost = sk.costPerLevel * (currLv + 1);
      if (st.sys_points < cost) throw new Error(`系统积分不足（需要 ${cost}）`);

      map[skillId] = currLv + 1;
      execute('UPDATE player_state SET sys_points = sys_points - ?, skills_json = ? WHERE user_id = ?', [
        cost,
        JSON.stringify(map),
        userId,
      ]);
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/system/mall/buy', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { itemId } = req.body || {};
      const content = getContent();
      const item = content.skillsData.mallItems.find((i) => i.id === itemId);
      if (!item) throw new Error('商品不存在');
      const st = queryOne<any>('SELECT sys_points, crit_charge FROM player_state WHERE user_id = ?', [userId]);
      if (st.sys_points < item.costPoints) throw new Error(`系统积分不足（需要 ${item.costPoints}）`);
      if (itemId === 'item_crit_charge' && Number(st.crit_charge || 0) >= 100) {
        throw new Error('返现蓄能已满 100%，先大额消费触发暴击后再兑换');
      }

      execute('UPDATE player_state SET sys_points = sys_points - ? WHERE user_id = ?', [item.costPoints, userId], false);
      let msg = `兑换【${item.name}】成功！`;
      if (itemId === 'item_energy_drink') {
        execute('UPDATE player_state SET energy = energy + 50 WHERE user_id = ?', [userId]);
        msg = '精力瞬间恢复 +50！继续纵横海城！';
      } else if (itemId === 'item_crit_charge') {
        execute('UPDATE player_state SET crit_charge = 100 WHERE user_id = ?', [userId]);
        msg = '暴击充能已满 100%！下一次高额消费必爆多倍神豪返现！';
      } else if (itemId === 'item_cash_pack') {
        const { tierInfo } = computePortfolioAndTier(userId);
        const bonus = 500000 * Math.pow(3, tierInfo.tier - 1);
        execute('UPDATE player_state SET cash = cash + ? WHERE user_id = ?', [bonus, userId]);
        msg = `应急黑金包开启成功，到账 ${formatMoney(bonus)}！`;
      }
      res.json({ success: true, message: msg, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/mail/claim', authMiddleware, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { mailId } = req.body || {};
      const mail = queryOne<any>('SELECT * FROM player_mails WHERE id = ? AND user_id = ?', [Number(mailId), userId]);
      if (!mail || mail.claimed) throw new Error('邮件不存在或已领取');
      execute('UPDATE player_mails SET claimed = 1 WHERE id = ?', [mail.id], false);
      execute(
        'UPDATE player_state SET cash = cash + ?, sys_points = sys_points + ?, energy = energy + ? WHERE user_id = ?',
        [mail.cash || 0, mail.sys_points || 0, mail.energy || 0, userId],
      );
      res.json({ success: true, state: buildFullGameState(userId) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/leaderboard', authMiddleware, (_req, res) => {
    const users = queryAll<any>('SELECT id, nickname, created_at FROM users');
    const content = getContent();
    const list = users
      .map((u) => {
        const p = computePortfolioAndTier(u.id);
        const car = content.assetsCatalog.assets.find((a) => a.id === p.state.equipped_car_id);
        const mainPropRow = p.ownedProps.find((x) => x.property_id === p.state.main_property_id);
        const mainPropDef = content.properties.find((x) => x.id === p.state.main_property_id);
        const namedTower = p.ownedProps.find((x) => x.custom_name);
        return {
          userId: u.id,
          nickname: u.nickname,
          netWorth: p.netWorth,
          tierName: p.tierInfo.name,
          tierColor: p.tierInfo.color,
          carName: car?.name || '小电驴',
          mainResidence: mainPropRow?.custom_name || mainPropDef?.name || '城南老巷单间',
          namedLandmark: namedTower?.custom_name || '',
          propertyCount: p.ownedProps.length,
          heroineCount: p.heroinesRows.filter((h) => h.unlocked).length,
          equippedTitle: getEquippedTitleInfo(u.id),
        };
      })
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, 30);

    res.json({ leaderboard: list });
  });

  // ================= GM ADMIN ROUTES =================
  router.get('/admin/overview', authMiddleware, (req: AuthedRequest, res) => {
    if (!req.isAdmin) {
      res.status(403).json({ error: '仅管理员可访问 GM 后台' });
      return;
    }
    const users = queryAll<any>('SELECT id, username, nickname, is_admin, created_at FROM users ORDER BY id ASC');
    const tokenSum = queryOne<{ total: number }>('SELECT SUM(tokens_used) as total FROM npc_chat_messages')?.total || 0;
    const msgCount = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM npc_chat_messages')?.cnt || 0;
    const keyConfigured = Boolean(getGmSetting('deepseek_api_key') || config.deepseekApiKey);
    const eventActive = getGmSetting('event_cruise_01_active') !== 'false';
    res.json({
      users: users.map((u) => {
        const p = computePortfolioAndTier(u.id);
        return { ...u, netWorth: p.netWorth, tierName: p.tierInfo.name, cash: Math.round(p.state.cash), aiMsgToday: p.state.ai_msg_today };
      }),
      stats: { totalTokensUsed: tokenSum, totalMessages: msgCount, keyConfigured, model: getGmSetting('deepseek_model') || config.deepseekModel, eventActive },
    });
  });

  router.post('/admin/config', authMiddleware, (req: AuthedRequest, res) => {
    if (!req.isAdmin) {
      res.status(403).json({ error: '无管理员权限' });
      return;
    }
    const { deepseekApiKey, deepseekModel, eventCruiseActive } = req.body || {};
    if (typeof deepseekApiKey === 'string') setGmSetting('deepseek_api_key', deepseekApiKey.trim());
    if (typeof deepseekModel === 'string' && deepseekModel.trim()) setGmSetting('deepseek_model', deepseekModel.trim());
    if (typeof eventCruiseActive === 'boolean') setGmSetting('event_cruise_01_active', String(eventCruiseActive));
    res.json({ success: true, message: 'GM 服务器配置已热更新生效！' });
  });

  router.post('/admin/mail/send', authMiddleware, (req: AuthedRequest, res) => {
    if (!req.isAdmin) {
      res.status(403).json({ error: '无管理员权限' });
      return;
    }
    const { targetUserId, title, body, cash, sysPoints, energy } = req.body || {};
    const recipients = targetUserId
      ? [{ id: Number(targetUserId) }]
      : queryAll<{ id: number }>('SELECT id FROM users');
    const now = Date.now();
    for (const r of recipients) {
      execute(
        'INSERT INTO player_mails (user_id, title, body, cash, sys_points, energy, claimed, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        [r.id, title || '【全服福利】系统维护补偿', body || '感谢各位老板支持！', Number(cash || 0), Number(sysPoints || 0), Number(energy || 0), now],
      );
    }
    res.json({ success: true, sentCount: recipients.length });
  });

  router.post('/admin/reload-content', authMiddleware, (req: AuthedRequest, res) => {
    if (!req.isAdmin) {
      res.status(403).json({ error: '无管理员权限' });
      return;
    }
    reloadContent();
    res.json({ success: true, message: '已热重载 content/ 目录下所有剧本、地图与活动配置！' });
  });

  registerMinigameRoutes(router, authMiddleware);
  registerNegotiationRoutes(router, authMiddleware);
  registerBondRoutes(router, authMiddleware);
  registerEmpireRoutes(router, authMiddleware);
  registerMapSpotRoutes(router, authMiddleware);

  return router;
}
