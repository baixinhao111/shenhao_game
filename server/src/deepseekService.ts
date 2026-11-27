import { config } from './config.js';
import { getContent } from './contentLoader.js';
import { execute, getGmSetting, queryAll, queryOne } from './db.js';
import {
  computePortfolioAndTier,
  formatMoney,
  getHeroineStage,
  getTimePeriodLabel,
  incrementDailyTask,
  postMoment,
  resolveHeroineLocations,
  todayKey,
} from './gameEngine.js';

export interface AiChatReply {
  reply: string;
  inner_thought: string;
  mood: string;
  affection_delta: number;
  applied_affection_delta: number;
  trigger_moment: string | null;
  aiMode: 'deepseek' | 'fallback';
  tokensUsed: number;
  newAffection: number;
  dailyCapReached: boolean;
}

function getEffectiveDeepseekKey(): string {
  return (getGmSetting('deepseek_api_key') || config.deepseekApiKey || '').trim();
}

function getEffectiveModel(): string {
  return (getGmSetting('deepseek_model') || config.deepseekModel || 'deepseek-chat').trim();
}

function buildDynamicStateSnapshot(userId: number, heroineId: string, overrideLocation?: string): { snapshot: string; locationLabel: string } {
  const content = getContent();
  const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
  const portfolio = computePortfolioAndTier(userId);
  const { state, netWorth, tierInfo, ownedProps } = portfolio;

  const heroineDef = content.heroines.find((h) => h.id === heroineId);
  const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
  const stage = getHeroineStage(heroineDef, hRow?.affection || 0);

  const carDef = content.assetsCatalog.assets.find((a) => a.id === state.equipped_car_id);
  const districtDef = content.map.districts.find((d: any) => d.id === state.current_district);
  const mainPropDef = content.properties.find((p) => p.id === state.main_property_id);

  const locs = resolveHeroineLocations(userId);
  const locInfo = locs[heroineId];

  // Check if heroine has keys to one of player's properties
  const herProp = ownedProps.find((p) => {
    try {
      return JSON.parse(p.residents_json || '[]').includes(heroineId);
    } catch {
      return false;
    }
  });
  const herPropDef = herProp ? content.properties.find((p) => p.id === herProp.property_id) : null;

  // Latest completed story episode
  const lastEp = queryOne<any>(
    'SELECT episode_id FROM player_progress WHERE user_id = ? ORDER BY completed_at DESC LIMIT 1',
    [userId],
  );
  let lastEpTitle = '刚刚在海城崭露头角';
  if (lastEp) {
    for (const v of content.stories.volumes) {
      const found = v.episodes.find((e: any) => e.episodeId === lastEp.episode_id);
      if (found) lastEpTitle = `${found.chapterTitle}《${found.title}》`;
    }
  }

  // Jealousy / harem context: did player recently gift another heroine?
  let jealousyNote = '暂无明显修罗场动态。';
  if (
    state.last_gift_heroine_id &&
    state.last_gift_heroine_id !== heroineId &&
    Date.now() - Number(state.last_gift_time || 0) < 6 * 3600 * 1000
  ) {
    const other = content.heroines.find((h) => h.id === state.last_gift_heroine_id);
    if (other) {
      jealousyNote = `玩家最近刚给另一位美女【${other.name}】豪掷千金送了礼物（若你们好感较高，你可以结合性格隐晦吃醋或调侃）。`;
    }
  }

  const locationLabel = overrideLocation || (herProp && locInfo?.propertyId ? `你送她的【${herProp.custom_name || herPropDef?.name}】` : `海城·${districtDef?.name || '外滩'}`);

  const snapshot = [
    `【当前实时游戏状态 — 请自然融入回复，不要生硬报数据】`,
    `- 当前时间：${getTimePeriodLabel()}`,
    `- 玩家昵称：${user?.nickname || '陆沉'}`,
    `- 玩家当前社会阶层与总身价：${tierInfo.name}（总身价约 ${formatMoney(netWorth)}）`,
    `- 玩家当前驾驶座驾：${carDef?.name || '小电驴'} | 主居所：${mainPropDef?.name || '城南老巷单间'}`,
    `- 当前聊天场景/你的位置：${locationLabel}（${locInfo?.label || ''}）`,
    `- 你们当前关系阶段：Lv.${stage.level} ${stage.name}（推荐称呼对方：${stage.address}，好感度 ${hRow?.affection || 0}）`,
    `- 房产羁绊：${herPropDef ? `玩家已把【${herProp.custom_name || herPropDef.name}】的钥匙送你入住` : '尚未获赠私人房产钥匙'}`,
    `- 最近送你的礼物：${hRow?.last_gift_name || '暂无'}`,
    `- 玩家最新主线成就：刚经历 ${lastEpTitle}`,
    `- 修罗场状态：${jealousyNote}`,
  ].join('\n');

  return { snapshot, locationLabel };
}

function buildSmartFallback(
  heroineDef: any,
  userMessage: string,
  stateSnapshot: string,
  systemEventNote?: string,
  recentReplies: string[] = [],
  stageLevel = 1,
): { reply: string; inner_thought: string; mood: string; affection_delta: number; trigger_moment: string | null } {
  const lower = userMessage.toLowerCase();
  const hid: string = heroineDef.id;
  const pickFresh = <T extends { reply: string }>(arr: T[]): T => {
    const unused = arr.filter((x) => !recentReplies.includes(x.reply));
    const pool = unused.length > 0 ? unused : arr;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const giftMatch = userMessage.match(/^\[向你赠送了礼物：(.+)\]$/);
  if (giftMatch) {
    const giftName = giftMatch[1];
    const isFav = Boolean(systemEventNote && systemEventNote.includes('最心仪'));
    const byHeroine: Record<string, { reply: string; inner_thought: string }> = {
      su_qingwan: {
        reply: isFav
          ? `你倒是很会挑东西——「${giftName}」我确实很喜欢。收下了，下回换我请你。`
          : `「${giftName}」我收到了。平白让你破费，这份心意我记在账上了。`,
        inner_thought: isFav ? '竟然正好踩中我最喜欢的一样……这家伙平时是在暗中观察吗。' : '嘴上说着记账，其实心里早就偷偷高兴了。',
      },
      lin_wanxing: {
        reply: isFav
          ? `呀！「${giftName}」我之前看了好久都没舍得买，你怎么知道我喜欢这个呀～太开心啦！`
          : `谢谢你送我的「${giftName}」！我会好好收起来的，你对我真好～`,
        inner_thought: '拆开礼物的那一秒，心跳又快了半拍呢。',
      },
      shen_liuli: {
        reply: isFav
          ? `哇！哥哥连「${giftName}」都给我搞到手了？今晚的榜一位置永远给你锁死～`
          : `收到你的「${giftName}」啦～眼光真不错嘛，改天当面好好谢你！`,
        inner_thought: '哼，别的老板只会砸榜，只有他送的东西总能送到我心坎上。',
      },
      lu_zhiwei: {
        reply: isFav
          ? `……喂，你从哪打听到我在找「${giftName}」的？行吧，勉为其难收下了，算你有点眼光！`
          : `「${giftName}」？突然送礼物干嘛……咳，既然都送来了，那我就收着咯。`,
        inner_thought: '才不是在偷偷笑呢……回去就把它摆在书桌最显眼的地方。',
      },
    };
    const chosen = byHeroine[hid] || {
      reply: `收到你的「${giftName}」了，很喜欢，谢谢你！`,
      inner_thought: '能被他记挂着的感觉真好。',
    };
    return {
      reply: chosen.reply,
      inner_thought: chosen.inner_thought,
      mood: isFav ? 'touched' : 'happy',
      affection_delta: isFav ? 3 : 2,
      trigger_moment: null,
    };
  }

  // Topic buckets (10 rich conversational domains × 4 heroines)
  const topicPools: Array<{ match: RegExp; byHeroine: Record<string, Array<{ reply: string; inner_thought: string; mood: string; affection_delta: number }>> }> = [
    {
      match: /吃|面|饭|宵夜|饿|喝|咖啡|茶|餐厅/,
      byHeroine: {
        su_qingwan: [
          { reply: '正好刚散会有点饿了。城南老巷那家热阳春面还开着，现在过来接我？', inner_thought: '其实吃什么不重要，重点是下班后能和他单独坐一会儿。', mood: 'happy', affection_delta: 2 },
          { reply: '今晚不想去应酬局了。如果你顺路，带两杯不加糖的热乌龙茶上来吧。', inner_thought: '竟然开始习惯把最放松的一面留给他。', mood: 'calm', affection_delta: 2 },
        ],
        lin_wanxing: [
          { reply: '哇，你怎么知道我刚练完琴肚子咕咕叫啦～只要和你一起吃，路边摊我都超开心！', inner_thought: '他总是能第一时间想到我有没有好好吃饭呢。', mood: 'happy', affection_delta: 2 },
          { reply: '那家小店新出了桂花糖藕！等你忙完，我们手牵手去排队好不好呀～', inner_thought: '一想到晚饭有他陪，练琴都不觉得累了。', mood: 'shy', affection_delta: 2 },
        ],
        shen_liuli: [
          { reply: '哟，大老板终于想起请我吃顿好的了？位置发你了，敢迟到就罚你多陪我待一小时哦～', inner_thought: '早就把晚上的通告推掉了，就等他开口。', mood: 'tease', affection_delta: 2 },
          { reply: '今晚我想去外滩那家能看江景的酒廊吃宵夜，哥哥可不许只顾着看手机不看我。', inner_thought: '酒不醉人，主要是对面坐着的是他。', mood: 'happy', affection_delta: 2 },
        ],
        lu_zhiwei: [
          { reply: '宵夜？我要双份冰美式加老街煎饺！顺便把刚截到的赵氏黑料当佐料给你讲讲。', inner_thought: '难得他主动投喂，可不能客气！', mood: 'happy', affection_delta: 2 },
          { reply: '啧，就知道拿吃的收买我。不过算你识相，五分钟后巷口见，不准放鸽子。', inner_thought: '其实桌上泡面已经凉了，刚好等他救场。', mood: 'tease', affection_delta: 2 },
        ],
      },
    },
    {
      match: /想你|喜欢|爱|心动|陪我|抱|亲|表白|在一起/,
      byHeroine: {
        su_qingwan: [
          {
            reply: stageLevel >= 4
              ? '……别在文字里说这种犯规的话。真想见我，现在就来外滩，门禁密码你又不是不知道。'
              : '陆先生的直球一向这么不按常理出牌吗？不过……这句话我确实不讨厌。',
            inner_thought: '指尖在屏幕上停了整整十秒才敢发出去，心跳快得不像自己。',
            mood: 'shy',
            affection_delta: 3,
          },
          { reply: '海城这么多人对我客套奉承，偏偏只有你这句最让人没法保持冷静。', inner_thought: '冰山大概就是这样一点点融化的吧。', mood: 'touched', affection_delta: 3 },
        ],
        lin_wanxing: [
          {
            reply: stageLevel >= 4
              ? '我也在想你呀……刚才弹琴走神了好几次，脑子里全是你笑起来的样子。'
              : '呀……突然说这个，我脸一下子就红透啦！你、你不要总这么逗我嘛～',
            inner_thought: '要是此刻能扑进他怀里就好了。',
            mood: 'shy',
            affection_delta: 3,
          },
          { reply: '你只要回头看，我一直都在你身后呀。不管今天还是以后。', inner_thought: '能这样毫无保留地偏爱一个人，真幸福。', mood: 'touched', affection_delta: 3 },
        ],
        shen_liuli: [
          {
            reply: stageLevel >= 4
              ? '嘴这么甜，是想让我今晚直接鸽了直播间飞奔过去找你吗？定位发来，哥哥。'
              : '哟，学会反撩了？小心玩火自焚哦，我可比你想象的更粘人～',
            inner_thought: '明明平时都是我拿捏别人，怎么被他一句话就勾走了魂。',
            mood: 'shy',
            affection_delta: 3,
          },
        ],
        lu_zhiwei: [
          {
            reply: stageLevel >= 4
              ? '……笨蛋！突然发这种高危指令，我的心率警报都要把整层楼吵醒了啦！'
              : '喂喂喂！别乱发肉麻台词！我的情感防火墙都要被你搞出严重 Bug 了！',
            inner_thought: '嘴上骂着笨蛋，嘴角却怎么压都压不下来……',
            mood: 'shy',
            affection_delta: 3,
          },
        ],
      },
    },
    {
      match: /早安|晚安|睡|失眠|累|加班|熬夜|休息/,
      byHeroine: {
        su_qingwan: [
          { reply: '还没睡？把手机放下早点休息，明天海城还有硬仗要打。晚安。', inner_thought: '其实我也有点失眠，看见他发来晚安才真正安心。', mood: 'calm', affection_delta: 2 },
          { reply: '刚处理完盛世的最后一份报表。你先睡吧，不必每次都等我下班。', inner_thought: '嘴上说不用等，心里却贪恋这份有人守候的感觉。', mood: 'touched', affection_delta: 2 },
        ],
        lin_wanxing: [
          { reply: '辛苦啦～快洗个热水澡早点睡吧，明早起来我给你带温热的豆浆和三明治！晚安呀～', inner_thought: '希望今晚他的梦里也能有我出现。', mood: 'touched', affection_delta: 2 },
        ],
        shen_liuli: [
          { reply: '熬夜可会变丑的哦大老板～快去睡吧，梦里允许你继续当我的榜一大哥，晚安啦～', inner_thought: '下播后最期待的，就是他睡前这句晚安。', mood: 'happy', affection_delta: 2 },
        ],
        lu_zhiwei: [
          { reply: '哼，总算知道休息了？你先睡，我把外围风控脚本跑完也去睡——才不是替你守夜呢。', inner_thought: '这家伙最近太拼了，我得帮他把后方盯牢。', mood: 'calm', affection_delta: 2 },
        ],
      },
    },
    {
      match: /车|房|钱|买|产业|投资|股票|生意|公司|谈判/,
      byHeroine: {
        su_qingwan: [
          { reply: '你的扩张节奏连盛世风控部都在复盘。不过比起数字，我更欣赏你落子时的定力。', inner_thought: stateSnapshot.includes('房产钥匙') ? '连私宅钥匙都交到我手里了，这家伙野心可真不小。' : '他站得越高，反而越沉得住气。', mood: 'tease', affection_delta: 2 },
          { reply: '陆家湾的盘口风声紧，明天收购案如果需要盛世的尽调通道，随时知会我。', inner_thought: '和他联手改写海城版图，比一个人独行有趣得多。', mood: 'calm', affection_delta: 2 },
        ],
        lin_wanxing: [
          { reply: '你越来越厉害啦！不过别给自己太大压力呀，不管身价多少，你平平安安才是最重要的。', inner_thought: '别人羡慕他的光环，我只心疼他背后的奔波。', mood: 'touched', affection_delta: 2 },
        ],
        shen_liuli: [
          { reply: '不愧是海城第一神豪！下次提新车记得第一个带我去外滩兜风，副驾不许留给别人～', inner_thought: '有他在背后撑腰，整个星耀谁还敢给我脸色看。', mood: 'tease', affection_delta: 2 },
        ],
        lu_zhiwei: [
          { reply: '哟，又在海城大杀四方？刚才顺手帮你扫了一遍竞对财报，漏洞我都标红发你邮箱了。', inner_thought: '跟着他一起把那些老狐狸掀翻，简直太爽了！', mood: 'happy', affection_delta: 2 },
        ],
      },
    },
    {
      match: /吃醋|别的女生|修罗场|她|谁|苏清婉|林晚星|沈琉璃|陆知微/,
      byHeroine: {
        su_qingwan: [
          { reply: '你的私事我没立场过问。只是提醒一句，精力分得太散，可容易在关键局里失手。', inner_thought: '语气听起来挺冷静……其实手里钢笔都快被我捏断了。', mood: 'jealous', affection_delta: 1 },
        ],
        lin_wanxing: [
          { reply: '没、没关系呀，你这么优秀，身边有人喜欢很正常……只是，你不会忘了今晚答应陪我的事吧？', inner_thought: '心里酸酸的，可又不想变成无理取闹的样子……', mood: 'jealous', affection_delta: 1 },
        ],
        shen_liuli: [
          { reply: '哼，哥哥在外面沾花惹草之前，是不是先问问我同不同意？今晚不哄好我，后果自负哦～', inner_thought: '嘴上说着玩，其实真的很在意他眼里有没有别人。', mood: 'jealous', affection_delta: 1 },
        ],
        lu_zhiwei: [
          { reply: '呵，大老板还真是时间管理大师呢。再让我抓到你给别人乱撒币，我就把你微信置顶改成「海王」信不信！', inner_thought: '可恶，为什么知道他见了别人我会这么不爽啊！', mood: 'jealous', affection_delta: 1 },
        ],
      },
    },
  ];

  for (const bucket of topicPools) {
    if (bucket.match.test(lower)) {
      const list = bucket.byHeroine[hid];
      if (list && list.length > 0) {
        return { ...pickFresh(list), trigger_moment: null };
      }
    }
  }

  // Stage-tiered general fallback pool (avoids repeating the 2-3 base replies)
  const stageExtras: Record<string, Array<{ reply: string; inner_thought: string; mood: string; affection_delta: number }>> = {
    su_qingwan: [
      ...(heroineDef.fallbackReplies || []),
      { reply: '窗外江风正好。刚泡了一壶大红袍，你要不要过来帮我参谋一份并购协议？', inner_thought: '协议早就看完了，只是想找个顺理成章见他的借口。', mood: 'calm', affection_delta: 2 },
      { reply: stageLevel >= 3 ? '陆沉，今天在陆家湾听见有人议论你，我替你压下去了。下回动作小点，别总让我操心。' : '海城的水比你想象的深，不过既然你已经入局，我就拭目以待。', inner_thought: '什么时候开始，我竟把护着他当成了习惯。', mood: 'touched', affection_delta: 2 },
    ],
    lin_wanxing: [
      ...(heroineDef.fallbackReplies || []),
      { reply: '刚才在校园里捡到一片特别完整的银杏叶，夹进琴谱里啦，下次见面送给你当书签！', inner_thought: '遇到一切好看的风景，第一反应都是想分享给他。', mood: 'happy', affection_delta: 2 },
      { reply: stageLevel >= 3 ? '阿沉，今天风有点凉，出门记得穿外套呀。我一直把手机开着响铃等你消息呢。' : '学长今天忙不忙呀？如果累了，随时可以找我聊聊天解解闷哦～', inner_thought: '听见手机响，心跳就会漏掉一拍。', mood: 'shy', affection_delta: 2 },
    ],
    shen_liuli: [
      ...(heroineDef.fallbackReplies || []),
      { reply: '刚试完一条新款酒红礼服，发照片给你看怕你把持不住，还是留着今晚当面惊艳你吧～', inner_thought: '满衣柜的高定，现在穿给别人看都没意思，只想穿给他看。', mood: 'tease', affection_delta: 2 },
      { reply: stageLevel >= 3 ? '哥哥，全网都在猜我背后的神秘神豪是谁，你说我要不要干脆发个朋友圈官宣呀？' : '大老板今天心情不错嘛，赏个脸带我去兜风呗？', inner_thought: '真想光明正大挽着他的胳膊走在外滩上。', mood: 'happy', affection_delta: 2 },
    ],
    lu_zhiwei: [
      ...(heroineDef.fallbackReplies || []),
      { reply: '刚在旧街地摊一眼扫出个清代老玉坠，老板还想忽悠我，笑死。下次带你去捡漏！', inner_thought: '其实顺手买了个平安扣，等找个自然点的机会塞给他。', mood: 'happy', affection_delta: 2 },
      { reply: stageLevel >= 3 ? '喂，笨蛋老板，别以为身价涨了就能甩开我。你的后台安全全归我管，听见没？' : '有事直说，没事的话陪我开一局黑曜电竞双排！', inner_thought: '和他并肩作战的感觉，比拿任何黑客大赛冠军都上头。', mood: 'tease', affection_delta: 2 },
    ],
  };

  const pool = stageExtras[hid] || heroineDef.fallbackReplies || [
    { reply: '刚看到你的消息，今晚海城的风挺舒服的，你在哪呢？', inner_thought: '他主动找我聊天，心情一下子好起来了。', mood: 'happy', affection_delta: 1 },
  ];
  return { ...pickFresh(pool), trigger_moment: null };
}

async function maybeSummarizeMemories(userId: number, heroineId: string, apiKey: string): Promise<void> {
  const countRow = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM npc_chat_messages WHERE user_id = ? AND heroine_id = ?',
    [userId, heroineId],
  );
  const totalMsgs = countRow?.cnt || 0;
  if (totalMsgs < 16 || totalMsgs % 16 !== 0) return;

  const recent = queryAll<any>(
    'SELECT role, content FROM npc_chat_messages WHERE user_id = ? AND heroine_id = ? ORDER BY id DESC LIMIT 16',
    [userId, heroineId],
  ).reverse();

  const transcript = recent.map((m) => `${m.role === 'user' ? '玩家' : '她'}: ${m.content}`).join('\n');

  try {
    const resp = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getEffectiveModel(),
        temperature: 0.3,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content: '请用1句极其精炼的中文（不超过55字）总结下面两人聊天中最值得长期记住的情感承诺、约会细节或关键事件。只输出总结句本身。',
          },
          { role: 'user', content: transcript },
        ],
      }),
    });
    if (!resp.ok) return;
    const data: any = await resp.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    if (summary) {
      execute(
        'INSERT INTO npc_memories (user_id, heroine_id, summary, created_at) VALUES (?, ?, ?, ?)',
        [userId, heroineId, summary.slice(0, 120), Date.now()],
      );
    }
  } catch {
    // Non-blocking background summarization
  }
}

export async function chatWithHeroine(
  userId: number,
  heroineId: string,
  userMessage: string,
  options?: { overrideLocation?: string; systemEventNote?: string },
): Promise<AiChatReply> {
  const content = getContent();
  const heroineDef = content.heroines.find((h) => h.id === heroineId);
  if (!heroineDef) throw new Error('红颜不存在');

  const hRow = queryOne<any>('SELECT * FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, heroineId]);
  if (!hRow || !hRow.unlocked) throw new Error('尚未结识该红颜');

  const state = queryOne<any>('SELECT ai_msg_today FROM player_state WHERE user_id = ?', [userId]);
  if ((state?.ai_msg_today || 0) >= config.aiDailyMessageLimit) {
    throw new Error(`今日 AI 私聊次数已达上限（${config.aiDailyMessageLimit} 条），明天再来聊吧！`);
  }

  const { snapshot, locationLabel } = buildDynamicStateSnapshot(userId, heroineId, options?.overrideLocation);

  // Store user message
  execute(
    `INSERT INTO npc_chat_messages (user_id, heroine_id, role, content, location_label, created_at)
     VALUES (?, ?, 'user', ?, ?, ?)`,
    [userId, heroineId, userMessage, locationLabel, Date.now()],
  );

  const memories = queryAll<any>(
    'SELECT summary FROM npc_memories WHERE user_id = ? AND heroine_id = ? ORDER BY id DESC LIMIT 10',
    [userId, heroineId],
  ).reverse();

  const history = queryAll<any>(
    'SELECT role, content FROM npc_chat_messages WHERE user_id = ? AND heroine_id = ? ORDER BY id DESC LIMIT 12',
    [userId, heroineId],
  ).reverse();

  const apiKey = getEffectiveDeepseekKey();
  let parsed: { reply: string; inner_thought: string; mood: string; affection_delta: number; trigger_moment: string | null } | null = null;
  let aiMode: 'deepseek' | 'fallback' = 'fallback';
  let tokensUsed = 0;

  if (apiKey) {
    try {
      const memoryText =
        memories.length > 0
          ? `【你们的长期记忆胶囊】\n${memories.map((m, i) => `${i + 1}. ${m.summary}`).join('\n')}`
          : '【你们的长期记忆胶囊】初识不久，正在共同书写新的海城回忆。';

      const dynamicBlock = `${snapshot}\n\n${memoryText}${options?.systemEventNote ? `\n\n【刚刚发生的事件】${options.systemEventNote}` : ''}`;

      // Block 1 (Static Prefix for DeepSeek Context Caching) -> Block 2/3 -> Block 4 (Recent history)
      const messages = [
        { role: 'system', content: heroineDef.systemPrompt },
        { role: 'user', content: `[系统状态同步，无需直接复述]\n${dynamicBlock}` },
        { role: 'assistant', content: '{"reply":"明白，我已入戏。","inner_thought":"保持角色状态。","mood":"calm","affection_delta":0,"trigger_moment":null}' },
        ...history.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      ];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);

      const resp = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getEffectiveModel(),
          temperature: 0.85,
          max_tokens: 320,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data: any = await resp.json();
        tokensUsed = Number(data?.usage?.total_tokens || 0);
        const rawText = data?.choices?.[0]?.message?.content || '';
        const jsonObj = JSON.parse(rawText);
        if (jsonObj && typeof jsonObj.reply === 'string' && jsonObj.reply.trim()) {
          parsed = {
            reply: jsonObj.reply.trim(),
            inner_thought: typeof jsonObj.inner_thought === 'string' ? jsonObj.inner_thought.trim() : '心里泛起一丝涟漪。',
            mood: typeof jsonObj.mood === 'string' ? jsonObj.mood : 'calm',
            affection_delta: Number.isFinite(Number(jsonObj.affection_delta)) ? Math.round(Number(jsonObj.affection_delta)) : 1,
            trigger_moment: typeof jsonObj.trigger_moment === 'string' && jsonObj.trigger_moment.trim() ? jsonObj.trigger_moment.trim() : null,
          };
          aiMode = 'deepseek';
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  if (!parsed) {
    const recentAssistant = history.filter((m) => m.role === 'assistant').slice(-4).map((m) => m.content);
    const stageInfo = getHeroineStage(heroineDef, Number(hRow.affection || 0));
    parsed = buildSmartFallback(
      heroineDef,
      userMessage,
      snapshot,
      options?.systemEventNote,
      recentAssistant,
      Number(stageInfo?.level || 1),
    );
    aiMode = 'fallback';
  }

  // Server-side anti-cheat affection clamping & daily cap (+8/day per heroine)
  const clampedDelta = Math.max(-3, Math.min(3, parsed.affection_delta));
  const today = todayKey();
  const prevDaily = hRow.daily_date === today ? Number(hRow.daily_chat_affection || 0) : 0;
  let appliedDelta = clampedDelta;
  let dailyCapReached = false;

  if (appliedDelta > 0) {
    const remaining = Math.max(0, 8 - prevDaily);
    if (remaining <= 0) {
      appliedDelta = 0;
      dailyCapReached = true;
    } else {
      appliedDelta = Math.min(appliedDelta, remaining);
    }
  }

  const newAffection = Math.max(0, Number(hRow.affection || 0) + appliedDelta);
  const newDailyChatAff = prevDaily + Math.max(0, appliedDelta);

  execute(
    `UPDATE player_heroines
     SET affection = ?, daily_chat_affection = ?, daily_date = ?, last_interaction_at = ?
     WHERE user_id = ? AND heroine_id = ?`,
    [newAffection, newDailyChatAff, today, Date.now(), userId, heroineId],
    false,
  );

  execute(
    `INSERT INTO npc_chat_messages (user_id, heroine_id, role, content, inner_thought, mood, location_label, affection_delta, tokens_used, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      heroineId,
      parsed.reply,
      parsed.inner_thought,
      parsed.mood,
      locationLabel,
      appliedDelta,
      tokensUsed,
      Date.now(),
    ],
    false,
  );

  execute('UPDATE player_state SET ai_msg_today = ai_msg_today + 1 WHERE user_id = ?', [userId]);

  incrementDailyTask(userId, 'task_chat', 1);

  if (parsed.trigger_moment) {
    postMoment(userId, heroineDef.name, parsed.trigger_moment, locationLabel, [], ['你'], heroineDef.avatar);
  }

  if (aiMode === 'deepseek' && apiKey) {
    void maybeSummarizeMemories(userId, heroineId, apiKey);
  }

  return {
    reply: parsed.reply,
    inner_thought: parsed.inner_thought,
    mood: parsed.mood,
    affection_delta: clampedDelta,
    applied_affection_delta: appliedDelta,
    trigger_moment: parsed.trigger_moment,
    aiMode,
    tokensUsed,
    newAffection,
    dailyCapReached,
  };
}
