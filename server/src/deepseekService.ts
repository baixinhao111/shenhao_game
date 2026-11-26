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
): { reply: string; inner_thought: string; mood: string; affection_delta: number; trigger_moment: string | null } {
  const lower = userMessage.toLowerCase();
  const baseList = heroineDef.fallbackReplies || [];
  const picked = baseList[Math.floor(Math.random() * baseList.length)] || {
    reply: '刚看到你的消息，今晚海城的风挺舒服的，你在哪呢？',
    inner_thought: '他主动找我聊天，心情一下子好起来了。',
    mood: 'happy',
    affection_delta: 1,
  };

  if (lower.includes('吃') || lower.includes('面') || lower.includes('饭')) {
    return {
      reply:
        heroineDef.id === 'su_qingwan'
          ? '正好刚散会有点饿了。城南老巷那家热阳春面还开着，陆先生现在开车过来接我？'
          : heroineDef.id === 'lin_wanxing'
            ? '哇，你怎么知道我刚练完琴肚子咕咕叫啦～只要和你一起吃，路边摊我都超开心！'
            : '哟，老板终于想起请我吃顿好的了？位置发你了，敢迟到就罚你多陪我待一小时哦～',
      inner_thought: '其实吃什么不重要，重点是和他待在一起。',
      mood: 'happy',
      affection_delta: 2,
      trigger_moment: null,
    };
  }
  if (lower.includes('车') || lower.includes('房') || lower.includes('钱') || lower.includes('买')) {
    return {
      reply:
        heroineDef.id === 'su_qingwan'
          ? '你的扩张速度连盛世的风控部都在议论了。不过我更在意的，是你这份说一不二的魄力。'
          : heroineDef.id === 'lin_wanxing'
            ? '你对我已经太好了啦，不用老是乱花钱的……你平平安安陪在我身边就够了。'
            : '不愧是海城第一神豪！下次提新车记得第一个带我兜风，不许被别人抢了副驾～',
      inner_thought: stateSnapshot.includes('房产钥匙') ? '连钥匙都给了，这家伙真是让人毫无抵抗力。' : '他现在越来越耀眼了……',
      mood: 'tease',
      affection_delta: 2,
      trigger_moment: null,
    };
  }

  return { ...picked, trigger_moment: null };
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
    parsed = buildSmartFallback(heroineDef, userMessage, snapshot);
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
