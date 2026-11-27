/**
 * 商业帝国扩展：产业经营事件、成就与可佩戴称号、主线联动股市情报、账号安全与存档导出
 */
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response, Router } from 'express';
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

  for (const row of ownedBizRows) {
    const bizId = row.business_id;
    const pool = allEvents.filter((e) => e.businessId === bizId);
    if (pool.length === 0) continue;
    const rec = cdMap[bizId];
    if (rec && rec.nextAt > now) continue;
    const idx = rec ? rec.idx % pool.length : 0;
    out[bizId] = pool[idx];
  }
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

export function getStoryLinkedStockExtras(userId: number) {
  const progressRows = queryAll<{ episode_id: string }>('SELECT episode_id FROM player_progress WHERE user_id = ?', [userId]);
  const done = new Set(progressRows.map((r) => r.episode_id));
  const props = queryAll<any>('SELECT custom_name FROM player_properties WHERE user_id = ? AND custom_name != ""', [userId]);
  const namedTower = props[0]?.custom_name || '';

  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const wave = (seed: number) => Math.sin(bucket * 0.7 + seed) * 0.11 + Math.cos(bucket * 0.4 + seed) * 0.06;

  // 赵氏地产控股: bears heavily after ep_004/005/010/016 face-slaps
  let zhaoBias = 0;
  let zhaoTag = '赵氏核心上市平台';
  if (done.has('ep_026')) {
    zhaoBias = -0.24;
    zhaoTag = '终局清盘 · 崩跌';
  } else if (done.has('ep_016')) {
    zhaoBias = -0.18;
    zhaoTag = '资金链告急 · 利空';
  } else if (done.has('ep_005') || done.has('ep_004')) {
    zhaoBias = -0.11;
    zhaoTag = '暗账丑闻 · 看空';
  }

  // 盛世资本集团: rallies after cleaning internal corruption & partnering with Lu Chen
  let shengshiBias = 0;
  let shengshiTag = '苏清婉执掌资本旗舰';
  if (done.has('ep_022')) {
    shengshiBias = 0.2;
    shengshiTag = '资本联盟 · 强势看多';
  } else if (done.has('ep_010')) {
    shengshiBias = 0.14;
    shengshiTag = '并购扩张 · 利好';
  } else if (done.has('ep_005')) {
    shengshiBias = 0.09;
    shengshiTag = '清查内鬼 · 修复';
  }

  const zhaoWave = wave(4.3) + zhaoBias * 0.5;
  const shengshiWave = wave(5.7) + shengshiBias * 0.5;

  const extraQuotes = [
    {
      id: 'stk_zhao',
      name: '赵氏地产控股',
      code: '600998',
      base: 58,
      price: Number(Math.max(8, 58 * (1 + zhaoWave)).toFixed(2)),
      changePct: Number((zhaoWave * 100).toFixed(2)),
      trend: (zhaoBias < -0.05 ? 'down' : zhaoWave >= 0 ? 'up' : 'down') as 'up' | 'down',
      storyTag: zhaoTag,
    },
    {
      id: 'stk_shengshi',
      name: '盛世资本集团',
      code: '601888',
      base: 112,
      price: Number(Math.max(15, 112 * (1 + shengshiWave)).toFixed(2)),
      changePct: Number((shengshiWave * 100).toFixed(2)),
      trend: (shengshiBias > 0.05 ? 'up' : shengshiWave >= 0 ? 'up' : 'down') as 'up' | 'down',
      storyTag: shengshiTag,
    },
  ];

  let headline = '海城财经快讯：陆家湾资本暗流涌动，机构资金正密集调仓。';
  if (namedTower) {
    headline = `海城头条：地标【${namedTower}】登顶陆家湾成交榜，机构热议新晋神秘大鳄动向！`;
  } else if (done.has('ep_016')) {
    headline = '海城财经：赵氏地产多笔质押触发预警，盛世资本逆势吸筹！';
  } else if (done.has('ep_005')) {
    headline = '海城财经：盛世资本雷霆清查三十二层暗账，赵氏关联供应链股价承压。';
  }

  return { extraQuotes, headline };
}

// ================= ROUTES =================

export function registerEmpireRoutes(router: Router, auth: Auth): void {
  // 1. Resolve Business Operating Event
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
      const cashReward = Math.round(hr * Number(choice.incomeHoursReward || 3));
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

      // Advance cooldown & rotate to next event for this business
      const cdMap = parseKv<Record<string, { nextAt: number; idx: number }>>(userId, KV_BIZ_EV_CD, {});
      const prevIdx = cdMap[businessId]?.idx ?? 0;
      cdMap[businessId] = { nextAt: Date.now() + BIZ_EVENT_COOLDOWN_MS, idx: prevIdx + 1 };
      setPlayerKv(userId, KV_BIZ_EV_CD, JSON.stringify(cdMap));

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
