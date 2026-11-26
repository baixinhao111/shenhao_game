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
// local gains/spends made outside the recorded story steps, carried across episodes
const delta = { cash: 0, sysPoints: 0, energy: 0 };
const claimedMail = new Set<number>();

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


const fmt = (n: number) => (n >= 1e8 ? `¥${(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `¥${(n / 1e4).toFixed(1)}万` : `¥${Math.round(n)}`);

function spend(cash: number, energy: number) {
  const p = current.player;
  if (p.energy < energy) throw new Error(`精力不足（需要 ⚡${energy}，当前 ⚡${p.energy}）`);
  if (p.cash < cash) throw new Error(`现金不足（需要 ${fmt(cash)}，当前 ${fmt(p.cash)}）`);
  p.energy -= energy;
  p.cash -= cash;
  p.netWorth -= cash;
  delta.energy -= energy;
  delta.cash -= cash;
}
function gain(cash: number, pts = 0) {
  const p = current.player;
  p.cash += cash;
  p.netWorth += cash;
  p.sysPoints += pts;
  delta.cash += cash;
  delta.sysPoints += pts;
}

function minigame(path: string, body: any): any | undefined {
  if (path === '/minigame/jade/cut') {
    const tier = Number(body.tier) || 1;
    const cost = ({ 1: 50000, 2: 300000, 3: 1500000 } as Record<number, number>)[tier] || 50000;
    spend(cost, 6);
    const roll = Math.random();
    let outcome = 'miss';
    let payout = Math.round(cost * 0.25);
    let headline = `切垮了，只剩一丢丢边角料卖了 ${fmt(payout)}，下次升级【黄金洞察眼】再来！`;
    let droppedAsset: any = null;
    if (roll > 0.96 && tier >= 2) {
      outcome = 'legendary';
      payout = cost * 8;
      const pool = current.assets.filter((a: any) => ['col_jade_emperor', 'col_blue_vase', 'col_blood_agate'].includes(a.id));
      droppedAsset = pool[Math.floor(Math.random() * pool.length)] || null;
      if (droppedAsset) droppedAsset.owned = true;
      headline = `惊天出绿！！一刀切出传世稀珍【${droppedAsset?.name}】并当场高价变现边角料！`;
    } else if (roll > 0.65) {
      outcome = 'big_win';
      payout = Math.round(cost * (2.2 + Math.random() * 1.8));
      headline = `出冰种飘花翡翠啦！行家当场疯抢加价，狂赚 ${fmt(payout)}！`;
    } else if (roll > 0.35) {
      outcome = 'small_win';
      payout = Math.round(cost * (1.15 + Math.random() * 0.45));
      headline = `切出糯种春带彩，稳稳回本小赚 ${fmt(payout)}！`;
    }
    gain(payout, 20);
    return { success: true, outcome, payout, profit: payout - cost, headline, droppedAsset: clone(droppedAsset), state: snapshot() };
  }
  if (path === '/minigame/angel/invest') {
    const amount = Math.max(20000, Math.min(2000000, Number(body.amount) || 100000));
    const name = String(body.pitchName || '项目');
    spend(amount, 6);
    const roll = Math.random();
    let mult = 0.4;
    let headline = `项目「${name}」首月冷启动不及预期，收回残值。`;
    if (roll > 0.88) {
      mult = 6.5;
      headline = `神级黑马！「${name}」一夜登顶热搜获红杉追投，你的天使轮暴赚 6.5 倍！`;
    } else if (roll > 0.5) {
      mult = 2.1;
      headline = `稳健翻倍！「${name}」顺利盈利分红，回报 2.1 倍！`;
    } else if (roll > 0.25) {
      mult = 1.25;
      headline = `「${name}」小有起色，稳拿 1.25 倍回报！`;
    }
    const payout = Math.round(amount * mult);
    gain(payout, 22);
    return { success: true, payout, mult, headline, state: snapshot() };
  }
  if (path === '/minigame/race/run') {
    const stake = Math.max(50000, Math.min(3000000, Number(body.stake) || 100000));
    spend(stake, 7);
    const car = current.assets.find((a: any) => a.id === current.player.equippedCarId);
    const won = Math.random() < Math.min(0.92, 0.25 + (car?.racePower || 10) / 130);
    const payout = won ? Math.round(stake * 2.4) : 0;
    gain(payout, won ? 40 : 10);
    return {
      success: true,
      won,
      payout,
      headline: won
        ? `驾驶【${car?.name}】在外滩弯道极限漂移甩开嚣张富少三个车身！赢得彩头 ${fmt(payout)} + 积分 40！`
        : `【${car?.name}】弯道被对手卡位，惜败一个车身。积分 +10，升级座驾马力再来！`,
      state: snapshot(),
    };
  }
  if (path === '/minigame/stocks/trade') {
    const stake = Math.max(100000, Number(body.amount) || 200000);
    spend(stake, 6);
    const q = (D.extras.stocks?.quotes || []).find((x: any) => x.id === body.stockId) || { name: '股票', changePct: 1 };
    const correct = (body.direction === 'long') === (q.trend ? q.trend === 'up' : q.changePct >= 0);
    const won = Math.random() < (correct ? 0.72 : 0.3);
    const payout = Math.round(stake * (won ? 1.55 + Math.random() * 0.65 : 0.65 + Math.random() * 0.2));
    gain(payout, 28);
    return {
      success: true,
      won,
      payout,
      profit: payout - stake,
      headline: won
        ? `精准${body.direction === 'long' ? '抄底做多' : '高位做空'}【${q.name}】，单波收割 ${fmt(payout - stake)}！`
        : `市场突发震荡，本轮【${q.name}】止损离场，收回 ${fmt(payout)}。`,
      state: snapshot(),
    };
  }
  if (path === '/minigame/livestream/pk') {
    const total = Math.max(100000, Number(body.amount) || 300000);
    spend(total, 8);
    gain(0, 45);
    const h = current.heroines.find((x: any) => x.id === 'shen_liuli');
    if (h) h.affection += 18;
    return {
      success: true,
      headline: '满屏星海嘉年华炸裂公屏！对面榜一大哥直接破防退网，沈琉璃好感度 +18，系统积分 +45！',
      barrage: ['卧槽神豪大哥空降！！', '这嘉年华雨停不下来了！！', '对面榜一连夜注销账号哈哈哈哈！', '琉璃眼眶都红了太宠了吧！'],
      state: snapshot(),
    };
  }
  if (path === '/event/cruise/play') {
    const ev = (current.events || []).find((e: any) => e.id === 'event_cruise_01');
    if (!ev) throw new Error('活动未开启');
    if ((ev.playsToday || 0) >= 5) throw new Error('今日公海赌局挑战次数已用完（5/5），明天再来赢星耀勋章！');
    spend(0, 8);
    const winTokens = 35 + Math.floor(Math.random() * 45);
    const cashBonus = 400000 + Math.floor(Math.random() * 600000);
    ev.tokens = (ev.tokens || 0) + winTokens;
    ev.playsToday = (ev.playsToday || 0) + 1;
    gain(cashBonus);
    return {
      success: true,
      winTokens,
      cashBonus,
      headline: `你在星耀号顶层赌桌一举压倒东南亚财阀！赢得【星耀勋章 +${winTokens}】与筹码分红 ${fmt(cashBonus)}！`,
      state: snapshot(),
    };
  }
  return undefined;
}

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
    // carry over simulated local progress (sign-in, minigames, mail, owned drops)
    const np = current.player;
    if (prev.player.signedInToday) np.signedInToday = true;
    np.cash += delta.cash;
    np.netWorth += delta.cash;
    np.sysPoints += delta.sysPoints;
    np.energy = Math.max(0, np.energy + delta.energy);
    np.equippedCarId = prev.player.equippedCarId;
    const ownedBefore = new Set(prev.assets.filter((a: any) => a.owned).map((a: any) => a.id));
    current.assets.forEach((a: any) => {
      if (ownedBefore.has(a.id)) a.owned = true;
      a.equipped = a.id === np.equippedCarId;
    });
    (current.mails || []).forEach((m: any) => claimedMail.has(m.id) && (m.claimed = 1));
    current.unreadMailCount = (current.mails || []).filter((m: any) => !m.claimed).length;
    return { ...clone(step), state: snapshot() };
  }

  if (path === '/system/signin') {
    if (p.signedInToday) throw new Error('今日已签到');
    p.signedInToday = true;
    gain(100000);
    return { state: snapshot(), message: '签到成功，入账 ¥10.0万' };
  }

  if (path === '/income/collect') {
    const collected = Math.floor(p.pendingIncome || 0);
    if (collected <= 0) throw new Error('暂无可收取的收益');
    gain(collected);
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

  const mg = minigame(path, body);
  if (mg) return mg;

  if (path === '/mail/claim') {
    const m = (current.mails || []).find((x: any) => x.id === body.mailId);
    if (!m || m.claimed) throw new Error('该邮件已领取');
    m.claimed = 1;
    claimedMail.add(m.id);
    gain(m.cash || 0, m.sys_points || 0);
    current.player.energy += m.energy || 0;
    delta.energy += m.energy || 0;
    current.unreadMailCount = Math.max(0, (current.unreadMailCount || 1) - 1);
    return { state: snapshot(), message: '附件已领取' };
  }
  throw new Error(NOT_IN_DEMO);
}
