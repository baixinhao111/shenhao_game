/**
 * 活城反馈引擎：事件触发红颜主动私信、未读红点计数、高光时刻朋友圈联动
 */
import { getContent } from './contentLoader.js';
import { execute, queryAll, queryOne } from './db.js';
import { formatMoney, getPlayerKv, postMoment, setPlayerKv } from './gameEngine.js';

const KV_CHAT_UNREAD = 'chat_unread_map';
const KV_PROACTIVE_CD = 'proactive_cd_map';

function parseKv<T>(userId: number, key: string, fallback: T): T {
  const raw = getPlayerKv(userId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getUnreadChatMap(userId: number): Record<string, number> {
  const map = parseKv<Record<string, number>>(userId, KV_CHAT_UNREAD, {});
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    const n = Number(v || 0);
    if (n > 0) out[k] = n;
  }
  return out;
}

export function markHeroineChatRead(userId: number, heroineId: string): void {
  const map = getUnreadChatMap(userId);
  if (!map[heroineId]) return;
  delete map[heroineId];
  setPlayerKv(userId, KV_CHAT_UNREAD, JSON.stringify(map));
}

function getUnlockedHeroineIds(userId: number): string[] {
  const rows = queryAll<{ heroine_id: string }>(
    'SELECT heroine_id FROM player_heroines WHERE user_id = ? AND unlocked = 1',
    [userId],
  );
  return rows.map((r) => r.heroine_id);
}

function pickFirstUnlocked(userId: number, preferredOrder: string[]): string | null {
  const unlocked = new Set(getUnlockedHeroineIds(userId));
  for (const id of preferredOrder) {
    if (unlocked.has(id)) return id;
  }
  return unlocked.size > 0 ? [...unlocked][0] : null;
}

export function pushHeroineProactiveMessage(
  userId: number,
  heroineId: string,
  text: string,
  innerThought: string,
  mood = 'happy',
  opts?: { dedupeKey?: string; cooldownMs?: number; bypassGlobalCd?: boolean },
): { pushed: boolean; heroineId: string; name?: string; avatar?: string } {
  const row = queryOne<any>(
    'SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?',
    [userId, heroineId],
  );
  if (!row || !row.unlocked) return { pushed: false, heroineId };

  const now = Date.now();
  const cdMap = parseKv<Record<string, number>>(userId, KV_PROACTIVE_CD, {});

  const dedupeKey = opts?.dedupeKey;
  const cooldownMs = opts?.cooldownMs ?? 15 * 60 * 1000;
  if (dedupeKey && cdMap[dedupeKey] && now - cdMap[dedupeKey] < cooldownMs) {
    return { pushed: false, heroineId };
  }
  const globalKey = `__h_${heroineId}`;
  if (!opts?.bypassGlobalCd && cdMap[globalKey] && now - cdMap[globalKey] < 3 * 60 * 1000) {
    return { pushed: false, heroineId };
  }

  execute(
    `INSERT INTO npc_chat_messages (user_id, heroine_id, role, content, inner_thought, mood, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
    [userId, heroineId, text, innerThought, mood, now],
  );

  const unread = getUnreadChatMap(userId);
  unread[heroineId] = Math.min(9, Number(unread[heroineId] || 0) + 1);
  setPlayerKv(userId, KV_CHAT_UNREAD, JSON.stringify(unread));

  if (dedupeKey) cdMap[dedupeKey] = now;
  cdMap[globalKey] = now;
  // Prune old entries to keep player_kv small
  const entries = Object.entries(cdMap).slice(-40);
  setPlayerKv(userId, KV_PROACTIVE_CD, JSON.stringify(Object.fromEntries(entries)));

  const hDef = getContent().heroines.find((h: any) => h.id === heroineId);
  return { pushed: true, heroineId, name: hDef?.name, avatar: hDef?.avatar };
}

export type MilestoneKind =
  | 'stock_big_win'
  | 'jade_high_grade'
  | 'live_pk_win'
  | 'deal_win'
  | 'business_bought'
  | 'luxury_asset_bought'
  | 'story_milestone';

export function triggerMilestoneReactions(userId: number, kind: MilestoneKind, payload: Record<string, any> = {}): void {
  const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
  const playerName = user?.nickname || '陆沉';

  if (kind === 'stock_big_win') {
    const profit = Number(payload.profit || 0);
    const stockName = String(payload.stockName || '海城行情');
    const dirLabel = payload.dir === -1 ? '反手做空' : '精准做多';
    const hid = pickFirstUnlocked(userId, ['su_qingwan', 'lu_zhiwei', 'shen_liuli', 'lin_wanxing']);
    if (!hid) return;
    if (hid === 'su_qingwan') {
      pushHeroineProactiveMessage(
        userId,
        hid,
        `刚在盛世交易终端扫到【${stockName}】那波异动，${dirLabel}一把收走 ${formatMoney(profit)}——陆先生的盘感，比陆家湾一半基金经理都稳。`,
        '其实刚才盯盘时心跳比他还快，还好他平仓收手卡得恰到好处。',
        'happy',
        { dedupeKey: `stock_win_${hid}`, cooldownMs: 12 * 60 * 1000 },
      );
    } else if (hid === 'lu_zhiwei') {
      pushHeroineProactiveMessage(
        userId,
        hid,
        `喂大老板！我后台刚抓到【${stockName}】那笔漂亮收割，净赚 ${formatMoney(profit)} 哦？记得请我喝冰美式加双份浓缩！`,
        '哼，这波节奏简直像开了上帝视角，这家伙越来越让人看不透了。',
        'tease',
        { dedupeKey: `stock_win_${hid}`, cooldownMs: 12 * 60 * 1000 },
      );
    } else {
      pushHeroineProactiveMessage(
        userId,
        hid,
        `听说你刚才在【${stockName}】一把落袋 ${formatMoney(profit)}？真是越来越厉害了，今晚可得庆祝一下～`,
        '他每次出手都从容得让人移不开眼。',
        'happy',
        { dedupeKey: `stock_win_${hid}`, cooldownMs: 12 * 60 * 1000 },
      );
    }
    if (profit >= 400000) {
      postMoment(
        userId,
        playerName,
        `陆家湾短线收官，【${stockName}】${dirLabel}落袋 ${formatMoney(profit)}。顺势者赢，贪心者输。`,
        '海城 · 陆家湾 CBD',
        [
          { author: '陈默（私人管家）', text: '资金已自动转入主账，风控净值再创新高。' },
          ...(hid === 'su_qingwan'
            ? [{ author: '苏清婉', text: '止盈很克制，今晚有空一起复个盘？' }]
            : hid === 'lu_zhiwei'
              ? [{ author: '陆知微', text: '这波曲线真漂亮，算你厉害一回。' }]
              : []),
        ],
        ['陈默（私人管家）', ...(hid === 'su_qingwan' ? ['苏清婉'] : hid === 'lu_zhiwei' ? ['陆知微'] : [])],
      );
    }
    return;
  }

  if (kind === 'jade_high_grade') {
    const grade = String(payload.grade || '');
    const payout = Number(payload.payout || 0);
    const gradeName = String(payload.gradeName || '高冰翡翠');
    const hid = pickFirstUnlocked(userId, ['lu_zhiwei', 'su_qingwan', 'lin_wanxing', 'shen_liuli']);
    if (hid === 'lu_zhiwei') {
      pushHeroineProactiveMessage(
        userId,
        hid,
        grade === 'imperial'
          ? `疯了吧你？！老街传疯了，你真在石摊上切出【${gradeName}】卖了 ${formatMoney(payout)}？！周老手里的紫砂壶都差点晃洒了！`
          : `听说你今天在城南赌石街见绿了，一刀切出【${gradeName}】收了 ${formatMoney(payout)}？下次去鬼市不带我，我把你手机 Wi-Fi 断了！`,
        '其实刚才远远看着他擦窗落刀的样子，还挺帅的……呸，我在想什么！',
        grade === 'imperial' ? 'shy' : 'tease',
        { dedupeKey: `jade_${grade}`, cooldownMs: 10 * 60 * 1000 },
      );
    } else if (hid) {
      pushHeroineProactiveMessage(
        userId,
        hid,
        `城南古玩行都传遍啦，说你切出了一块稀罕的【${gradeName}】，转手就是 ${formatMoney(payout)}！眼光也太毒了吧。`,
        '总觉得他身上还有好多惊喜没露出来呢。',
        'happy',
        { dedupeKey: `jade_${grade}`, cooldownMs: 10 * 60 * 1000 },
      );
    }
    if (grade === 'imperial') {
      postMoment(
        userId,
        playerName,
        `城南老街一刀见帝王绿，尘封的石头终究藏不住真光。`,
        '海城 · 城南古玩街',
        [
          { author: '周老（古玩行会长）', text: '后生可畏，二十年没见过这么干净的玻璃种了。' },
          ...(hid === 'lu_zhiwei' ? [{ author: '陆知微', text: '少得意，分我一半庆功夜宵！' }] : []),
        ],
        ['周老（古玩行会长）', '钱总（盛矿实业）', ...(hid === 'lu_zhiwei' ? ['陆知微'] : [])],
      );
    }
    return;
  }

  if (kind === 'live_pk_win') {
    const spent = Number(payload.spent || 0);
    pushHeroineProactiveMessage(
      userId,
      'shen_liuli',
      spent >= 1000000
        ? `哥哥今晚在星耀公屏砸穿全场，弹幕现在还在刷你的名字呢～下播了，要不要来后巷接我去兜个风？`
        : `榜一大哥今天卡点压哨太准了吧！对面主播脸色绿得我都快憋不住笑了，今晚想怎么让小女子报答你呀？`,
      '站在聚光灯下这么久，只有他在公屏亮起的那一刻，我才真正觉得背后有靠山。',
      'tease',
      { dedupeKey: 'live_pk_win', cooldownMs: 10 * 60 * 1000 },
    );
    return;
  }

  if (kind === 'deal_win') {
    const itemName = String(payload.itemName || '');
    const sellerId = String(payload.sellerId || '');
    const savedPct = Number(payload.savedPct || 0);
    const saved = Number(payload.saved || 0);
    const preferMap: Record<string, string[]> = {
      zhao: ['su_qingwan', 'shen_liuli', 'lin_wanxing', 'lu_zhiwei'],
      wang: ['su_qingwan', 'lu_zhiwei', 'shen_liuli', 'lin_wanxing'],
      qian: ['lin_wanxing', 'su_qingwan', 'lu_zhiwei', 'shen_liuli'],
      zhou: ['lu_zhiwei', 'su_qingwan', 'lin_wanxing', 'shen_liuli'],
      akun: ['shen_liuli', 'lu_zhiwei', 'su_qingwan', 'lin_wanxing'],
      lin_jie: ['su_qingwan', 'lin_wanxing', 'shen_liuli', 'lu_zhiwei'],
    };
    const hid = pickFirstUnlocked(userId, preferMap[sellerId] || ['su_qingwan', 'lin_wanxing', 'shen_liuli', 'lu_zhiwei']);
    if (!hid) return;

    const sellerLabelMap: Record<string, string> = {
      zhao: '赵天宇',
      wang: '王强',
      qian: '钱总',
      zhou: '周老',
      akun: '阿坤',
      lin_jie: '林姐',
    };
    const sName = sellerLabelMap[sellerId] || '对方';
    const savePhrase = savedPct > 0 ? `还硬生生砍下 ${savedPct}%（省了 ${formatMoney(saved)}）` : '干脆利落拍板拿下';

    const copyByHeroine: Record<string, { text: string; thought: string; mood: string }> = {
      su_qingwan: {
        text: `听说你刚在谈判桌上从${sName}手里拿下了【${itemName}】，${savePhrase}。这份压场定力，盛世投行部都该向你取经。`,
        thought: '他把控节奏的样子越来越让人安心……海城的格局真的在因他改写。',
        mood: 'happy',
      },
      lin_wanxing: {
        text: `刚刚听人说你谈下了【${itemName}】，${savePhrase}！太棒啦～忙完记得按时吃饭，别光顾着拼事业哦。`,
        thought: '他总是这样不声不响就做成大事，真为他骄傲呀。',
        mood: 'touched',
      },
      shen_liuli: {
        text: `哇哦，老板连${sName}的【${itemName}】都吃下来了，${savePhrase}？${sName}出门时脸都黑了吧，真解气～`,
        thought: '看那些目中无人的人在哥哥面前吃瘪，比自己赢十场 PK 还痛快。',
        mood: 'tease',
      },
      lu_zhiwei: {
        text: `哟，刚从${sName}那儿把【${itemName}】撬到手，${savePhrase}？数据模型没白帮你看吧，记得算我一份功劳。`,
        thought: '其实他自己临场反应就已经够狠了，我就是顺便锦上添花而已。',
        mood: 'tease',
      },
    };
    const c = copyByHeroine[hid];
    if (c) {
      pushHeroineProactiveMessage(userId, hid, c.text, c.thought, c.mood, {
        dedupeKey: `deal_win_${payload.itemId || itemName}`,
        cooldownMs: 30 * 60 * 1000,
      });
    }
    if (payload.kind === 'business') {
      postMoment(
        userId,
        playerName,
        savedPct > 0
          ? `刚刚在茶桌签下【${itemName}】，比挂牌价省下 ${savedPct}%。做实业，靠的是筹码与定力。`
          : `【${itemName}】正式并入名下版图，海城实业链再落一子。`,
        `海城 · ${itemName}`,
        [
          { author: '陈默（私人管家）', text: '股权过户与分红链路已全部打通，少爷可随时委派红颜坐镇。' },
          ...(c ? [{ author: getContent().heroines.find((h: any) => h.id === hid)?.name || '熟人', text: '恭喜新老板，看来以后要常来捧场了。' }] : []),
        ],
        ['陈默（私人管家）', '钱总（盛矿实业）'],
      );
    }
    return;
  }

  if (kind === 'business_bought') {
    const bizId = String(payload.businessId || '');
    const bizName = String(payload.name || '');
    const prefer: Record<string, string[]> = {
      biz_milktea: ['lin_wanxing', 'su_qingwan'],
      biz_esports: ['lu_zhiwei', 'shen_liuli'],
      biz_antique: ['lu_zhiwei', 'su_qingwan'],
      biz_mcn: ['shen_liuli', 'su_qingwan'],
      biz_hotel: ['su_qingwan', 'lin_wanxing'],
      biz_quant: ['su_qingwan', 'lu_zhiwei'],
    };
    const hid = pickFirstUnlocked(userId, prefer[bizId] || ['su_qingwan', 'lin_wanxing', 'shen_liuli', 'lu_zhiwei']);
    if (!hid) return;
    pushHeroineProactiveMessage(
      userId,
      hid,
      `听说【${bizName}】刚刚正式划入你名下了？如果有需要我帮忙坐镇或出谋划策的地方，随时在产业页点我名字就行。`,
      '他每拿下一块实业版图，就离海城之巅更近一步——我也想站在他身侧。',
      'happy',
      { dedupeKey: `biz_buy_${bizId}`, cooldownMs: 60 * 60 * 1000 },
    );
    return;
  }

  if (kind === 'luxury_asset_bought') {
    const assetId = String(payload.assetId || '');
    const assetName = String(payload.name || '');
    const price = Number(payload.price || 0);
    if (price < 1000000) return;

    const prefer =
      assetId === 'yacht_poseidon' || assetId === 'island_private'
        ? ['shen_liuli', 'su_qingwan', 'lin_wanxing', 'lu_zhiwei']
        : assetId === 'watch_tourbillon' || assetId === 'art_ink_scroll' || assetId === 'jet_g700'
          ? ['su_qingwan', 'lu_zhiwei', 'shen_liuli', 'lin_wanxing']
          : ['lin_wanxing', 'shen_liuli', 'su_qingwan', 'lu_zhiwei'];
    const hid = pickFirstUnlocked(userId, prefer);

    const isFleet = ['yacht_poseidon', 'island_private', 'jet_g700'].includes(assetId);
    if (hid) {
      const msg = isFleet
        ? `等等……你真把【${assetName}】拿下来了？！海城圈子都炸锅了，记得留个位置给我，什么时候带我开启专属私宴？`
        : `刚刷到你提了【${assetName}】！这品味和排面在海城真没几个比得上，下次约会记得开/戴出来让我好好看看～`;
      pushHeroineProactiveMessage(
        userId,
        hid,
        msg,
        '别人买这些是为了炫耀，他却像顺手添置了一件称手的装备……心跳又快了。',
        'shy',
        { dedupeKey: `lux_buy_${assetId}`, cooldownMs: 60 * 60 * 1000 },
      );
    }
    postMoment(
      userId,
      playerName,
      isFleet
        ? `【${assetName}】交付完成。山海辽阔，往后的风景值得慢慢看。`
        : `新入【${assetName}】，偶尔也要犒劳一下一路拼杀的自己。`,
      isFleet ? '海城 · 云顶海岸私人泊位' : '海城 · 外滩顶奢会所',
      [
        { author: '陈默（私人管家）', text: '保养团队与专属泊位/展柜已就位，随时听候少爷调遣。' },
        ...(hid ? [{ author: getContent().heroines.find((h: any) => h.id === hid)?.name || '红颜', text: '排面拉满！我可是预约了第一位体验席哦。' }] : []),
      ],
      ['陈默（私人管家）', '林姐（林氏资本）'],
    );
    return;
  }

  if (kind === 'story_milestone') {
    const epId = String(payload.episodeId || '');
    const STORY_DMS: Record<string, { heroineId: string; text: string; thought: string; mood: string }> = {
      ep_006: {
        heroineId: 'su_qingwan',
        text: '到家了。今晚老巷那碗阳春面……谢谢你的外套，也谢谢你没多问董事局的事。晚安，陆先生。',
        thought: '明明只是吃了一碗六块钱的面，今晚却久违地觉得不再失眠了。',
        mood: 'shy',
      },
      ep_008: {
        heroineId: 'lin_wanxing',
        text: '陆沉学长，我刚回到宿舍！今天真的太谢谢你保住老琴房，还帮学长们拆穿那家假基金……周末可以请你喝热桂花奶吗？',
        thought: '他帮我留住的哪里只是琴房呀，还有我最狼狈时的那点倔强和体面。',
        mood: 'touched',
      },
      ep_014: {
        heroineId: 'su_qingwan',
        text: '外滩酒会散场了，三家银行已经连夜冻结了赵氏授信。陆沉，今晚和你并肩站在灯火之上，是我接掌盛世以来最痛快的一晚。',
        thought: '原来有人能把后背完全托付出去，是这种感觉……',
        mood: 'happy',
      },
      ep_016: {
        heroineId: 'shen_liuli',
        text: '新老板～那份卖身契烧掉的时候，后台姐妹们都看呆了！以后我沈琉璃这条命和流量都归你调遣，今晚不许装高冷不回我哦。',
        thought: '三年来第一次，我不需要再戴着笑面具硬撑了。',
        mood: 'tease',
      },
      ep_019: {
        heroineId: 'lu_zhiwei',
        text: '喂！鬼市阿坤那批假青花彻底凉了，帝王绿的尾款也到你账上了吧？顺手把你手机里的防追踪补丁升级了一版，不客气。',
        thought: '跟他打双簧意外地合拍……以后查 2016 的旧账，好像终于不是我一个人了。',
        mood: 'tease',
      },
      ep_022: {
        heroineId: 'su_qingwan',
        text: '雨停了。阿沉，谢谢你在我签下辞职书前推开那扇门。十年前父辈没写完的约定，明天陆家湾开盘，换我们一起写完。',
        thought: '压在心口十年的石头终于碎了——这辈子，我都不会再放开他的手。',
        mood: 'touched',
      },
      ep_024: {
        heroineId: 'su_qingwan',
        text: '收盘 148 亿成交额，赵氏清盘，苏文渊彻底出局。庆功香槟冰好了，等你回来一起开。',
        thought: '全海城都在猜陆家湾新王是谁，只有我知道他心里装着怎样一片星海。',
        mood: 'happy',
      },
      ep_026: {
        heroineId: 'lin_wanxing',
        text: '阿沉！演出结束观众鼓了足足五分钟掌！那台维也纳九尺施坦威的音色像在发光一样……这辈子我弹过最好听的《月光》，是弹给你听的。',
        thought: '台下所有人都在看我，可我的眼睛从头到尾只找得到第一排的他。',
        mood: 'touched',
      },
      ep_032: {
        heroineId: 'shen_liuli',
        text: '公海风浪过去了，哥哥你在 21 点桌上掀翻顾明泽的样子帅得我差点当场破功！下层舱黑盒已经交给知微了，今晚甲板风好舒服。',
        thought: '为了哥哥的案子，他真的陪我闯了一趟公海龙潭。',
        mood: 'touched',
      },
      ep_034: {
        heroineId: 'su_qingwan',
        text: '半山夜宴尘埃落定，顾明泽连夜登机回京了。海城从今晚起，真正姓陆了。',
        thought: '不管接下来去京城还是港岛，盛世与我都会永远站在他身侧。',
        mood: 'happy',
      },
      ep_036: {
        heroineId: 'lu_zhiwei',
        text: '老大，湾流起飞前我把京城与港岛的星轨监听站都接进天枢三层了！海城只是序幕，下一站京华旧盟，我们一起杀穿！',
        thought: '父母留下的密钥终于走到这一步了……阿沉，这次换我一直跟着你。',
        mood: 'happy',
      },
    };
    const dm = STORY_DMS[epId];
    if (dm) {
      pushHeroineProactiveMessage(userId, dm.heroineId, dm.text, dm.thought, dm.mood, {
        dedupeKey: `story_dm_${epId}`,
        cooldownMs: 365 * 24 * 3600 * 1000,
        bypassGlobalCd: true,
      });
    }
  }
}
