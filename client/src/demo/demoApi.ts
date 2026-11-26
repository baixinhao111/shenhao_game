/**
 * Offline demo backend (only bundled in `vite build --mode demo`).
 * Replays a real recorded playthrough so the static preview can be played
 * without the Node server: story progression, unlocks and rewards are genuine
 * server responses; a few light actions are simulated locally.
 */
import data from './demoData.json';

const D: any = data;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const withVolumes = (st: any) => ({ ...st, stories: { ...st.stories, volumes: D.volumes } });

let nickname = '陆沉';
let current: any = withVolumes(clone(D.initial));
const chats: Record<string, any[]> = {};

const NOT_IN_DEMO = '试玩版暂未开放此操作（剧情、浏览与基础互动可体验），完整玩法请在正式服体验';

function snapshot() {
  const st = clone(current);
  st.user = { ...st.user, nickname, username: 'demo', is_admin: 0 };
  return st;
}

const CHAT_REPLIES = [
  '（试玩版未接入 AI）正式版里我会结合你们的经历和记忆实时回复你。',
  '收到啦。正式服里这里是 DeepSeek 驱动的实时私聊，会记住你说过的每件事。',
  '嗯……等正式版上线，再好好陪你聊。',
];

export async function demoRequest(path: string, options?: { method?: string; body?: any }): Promise<any> {
  await new Promise((r) => setTimeout(r, 120));
  const body = options?.body || {};
  const p = current.player;

  if (path === '/auth/register' || path === '/auth/login') {
    if (body.nickname) nickname = String(body.nickname).slice(0, 12);
    return { token: 'demo', state: snapshot() };
  }
  if (path === '/state') return { state: snapshot() };

  if (path === '/story/complete') {
    const epId = body.episodeId;
    if ((current.stories.completedEpisodes || []).includes(epId)) {
      return { alreadyCompleted: true, state: snapshot() };
    }
    const step = D.steps[epId];
    if (!step) {
      const all = D.volumes.flatMap((v: any) => v.episodes);
      const ep = all.find((e: any) => e.episodeId === epId);
      if (ep?.requireNetWorth) throw new Error(`总身价需达到 ¥${(ep.requireNetWorth / 1e8).toFixed(2)}亿 才可开启本幕`);
      throw new Error('试玩版剧情到此为止，后续章节请在正式服体验');
    }
    const prev = current;
    current = withVolumes(clone(step.state));
    // keep simulated local progress (sign-in etc.) visible
    if (prev.player.signedInToday) current.player.signedInToday = true;
    return { ...clone(step), state: snapshot() };
  }

  if (path === '/system/signin') {
    if (p.signedInToday) throw new Error('今日已签到');
    p.signedInToday = true;
    p.cash += 100000;
    p.netWorth += 100000;
    return { state: snapshot(), message: '签到成功，入账 ¥10.0万' };
  }

  if (path === '/income/collect') {
    const collected = Math.floor(p.pendingIncome || 0);
    if (collected <= 0) throw new Error('暂无可收取的收益');
    p.cash += collected;
    p.pendingIncome = 0;
    return { state: snapshot(), collected, message: `已收取 ¥${collected}` };
  }

  if (path === '/map/travel') {
    const d = current.map.districts.find((x: any) => x.id === body.districtId);
    if (!d) throw new Error('未知区域');
    if (!d.unlocked) throw new Error(`需晋升至更高阶层才能解锁【${d.name}】`);
    p.currentDistrict = d.id;
    return { success: true, district: d, state: snapshot() };
  }

  if (path === '/asset/equip-car') {
    const a = current.assets.find((x: any) => x.id === body.assetId);
    if (!a?.owned) throw new Error('尚未拥有该座驾');
    current.assets.forEach((x: any) => (x.equipped = x.id === a.id));
    p.equippedCarId = a.id;
    return { state: snapshot() };
  }

  if (path === '/moments') return clone(D.extras.moments || { moments: [] });
  if (path.startsWith('/moments/')) return { ok: true };
  if (path === '/leaderboard') return clone(D.extras.leaderboard || { leaderboard: [] });
  if (path === '/minigame/stocks') return clone(D.extras.stocks || {});

  const chatMatch = path.match(/^\/heroines\/([^/]+)\/chat$/);
  if (chatMatch) {
    const hid = chatMatch[1];
    chats[hid] = chats[hid] || [];
    if ((options?.method || (options?.body ? 'POST' : 'GET')) === 'GET') {
      return { messages: clone(chats[hid]), memories: [] };
    }
    const now = Date.now();
    chats[hid].push({ id: now, role: 'user', content: String(body.message || ''), created_at: now });
    chats[hid].push({
      id: now + 1,
      role: 'assistant',
      content: CHAT_REPLIES[(chats[hid].length / 2) % CHAT_REPLIES.length | 0],
      created_at: now + 1,
    });
    return { aiReply: chats[hid][chats[hid].length - 1].content, state: snapshot() };
  }

  if (path === '/mail/claim') throw new Error(NOT_IN_DEMO);
  throw new Error(NOT_IN_DEMO);
}
