/**
 * 区域小地图的地点规则（其他种类的点复用已有接口，这里放共用的判断 + 打卡接口）：
 *  - requireEpisode：读完这一幕才在地图上出现
 *  - hours：只在这些时段开放（'day' | 'evening' | 'night'，见 getTimePeriod）
 *  - 打卡点（kind: 'visit'）：每天约三成的点「有事发生」（至少 HOT_MIN 个）（按玩家 + 日期固定抽取），
 *    去一次花少量精力换天枢积分 + 一句见闻；affinity 红颜已解锁再 +3 好感。其余点只是氛围。
 *  - 每周特惠：每周一件车行/拍卖行在售品打 9 折（全服相同）。
 */
import type { NextFunction, Request, Response, Router } from 'express';
import { getContent } from './contentLoader.js';
import { execute, queryAll, queryOne } from './db.js';
import { grant, spendEnergyOrThrow } from './economy.js';
import { buildFullGameState, computePortfolioAndTier, getPlayerKv, getTimePeriod, setPlayerKv, todayKey } from './gameEngine.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const KV_VISITS = 'map_visits';
const AFFINITY_GAIN = 3;
/** share of visit spots that have something going on today, and the floor */
const HOT_CHANCE = 0.3;
const HOT_MIN = 2;
const WEEK_MS = 7 * 24 * 3600 * 1000;
export const WEEKLY_DEAL_PCT = 0.1;

const PERIOD_LABEL: Record<string, string> = { day: '白天', evening: '傍晚', night: '深夜' };

/** null if open now, otherwise a player-facing reason */
export function spotClosedReason(sp: any): string | null {
  const hours: string[] = Array.isArray(sp?.hours) ? sp.hours : [];
  if (!hours.length || hours.includes(getTimePeriod())) return null;
  return `${sp.name}只在${hours.map((h) => PERIOD_LABEL[h] || h).join('、')}开放（傍晚 18 点、深夜 22 点起）`;
}

export function isSpotRevealed(sp: any, completed: Set<string>): boolean {
  return !sp?.requireEpisode || completed.has(sp.requireEpisode);
}

function completedEpisodes(userId: number): Set<string> {
  return new Set(queryAll<{ episode_id: string }>('SELECT episode_id FROM player_progress WHERE user_id = ?', [userId]).map((r) => r.episode_id));
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** today's 「有事发生」 visit spots for this player: fixed for the day, drawn from unlocked + revealed districts */
export function getHotVisitSpots(userId: number, tier: number, completed: Set<string>): string[] {
  const pool: string[] = [];
  for (const d of getContent().map.districts) {
    if (tier < d.unlockTier) continue;
    for (const sp of d.spots || []) if (sp.kind === 'visit' && isSpotRevealed(sp, completed)) pool.push(sp.id);
  }
  // each spot rolls on its own (so unlocking a district mid-day doesn't reshuffle the others),
  // topped up to at least HOT_MIN from the lowest rolls
  const day = todayKey();
  const rolled = pool.map((id) => ({ id, k: hash(`${userId}|${day}|${id}`) % 1000 })).sort((a, b) => a.k - b.k);
  const hot = rolled.filter((x) => x.k < HOT_CHANCE * 1000);
  return (hot.length >= HOT_MIN ? hot : rolled.slice(0, HOT_MIN)).map((x) => x.id);
}

/** this week's showroom special (same for everyone) */
export function getWeeklyDeal(): { assetId: string; districtId: string; spotId: string; pct: number; endsAt: number } | null {
  const content = getContent();
  const items: Array<{ assetId: string; districtId: string; spotId: string }> = [];
  for (const d of content.map.districts)
    for (const sp of d.spots || [])
      if (sp.kind === 'showroom')
        for (const a of sp.stock || []) {
          const def = content.assetsCatalog.assets.find((x: any) => x.id === a);
          if (def && !def.dropOnly && def.price > 0) items.push({ assetId: a, districtId: d.id, spotId: sp.id });
        }
  if (!items.length) return null;
  const week = Math.floor(Date.now() / WEEK_MS);
  const pick = items[hash(`deal|${week}`) % items.length];
  return { ...pick, pct: WEEKLY_DEAL_PCT, endsAt: (week + 1) * WEEK_MS };
}

/** price after this week's special, if it applies to the asset */
export function assetPriceNow(asset: any): number {
  const deal = getWeeklyDeal();
  return deal && deal.assetId === asset.id ? Math.round(asset.price * (1 - deal.pct)) : asset.price;
}

/** dates are bound to spots on the small map; respect that spot's opening hours */
export function assertInteractionOpen(districtId: string, interactionId: string): void {
  const d = getContent().map.districts.find((x: any) => x.id === districtId);
  const sp = (d?.spots || []).find((x: any) => x.ref === interactionId);
  const why = sp ? spotClosedReason(sp) : null;
  if (why) throw new Error(why);
}

/** spot list as the client sees it: hidden until revealed, with open/hot/visited flags */
export function decorateSpots(userId: number, d: any, ctx: { tier: number; completed: Set<string>; hot: string[]; visited: string[] }) {
  return (d.spots || [])
    .filter((sp: any) => isSpotRevealed(sp, ctx.completed))
    .map((sp: any) => {
      const closed = spotClosedReason(sp);
      const base = { ...sp, open: !closed, closedReason: closed || undefined };
      return sp.kind === 'visit' ? { ...base, hot: ctx.hot.includes(sp.id), visited: ctx.visited.includes(sp.id) } : base;
    });
}

/** spot ids already visited today */
export function getVisitedSpotsToday(userId: number): string[] {
  try {
    const raw = JSON.parse(getPlayerKv(userId, KV_VISITS) || '{}');
    return raw.day === todayKey() && Array.isArray(raw.ids) ? raw.ids : [];
  } catch {
    return [];
  }
}

export function registerMapSpotRoutes(router: Router, auth: Auth): void {
  router.post('/map/visit', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const { districtId, spotId } = req.body || {};
      const content = getContent();
      const district = content.map.districts.find((d: any) => d.id === districtId);
      const spot = (district?.spots || []).find((s: any) => s.id === spotId && s.kind === 'visit');
      if (!district || !spot) throw new Error('这个地点不存在');
      const { tierInfo } = computePortfolioAndTier(userId);
      if (tierInfo.tier < district.unlockTier) {
        const reqTier = content.map.tiers.find((t: any) => t.tier === district.unlockTier);
        throw new Error(`需晋升至【${reqTier?.name || `阶层${district.unlockTier}`}】才能解锁【${district.name}】`);
      }
      const completed = completedEpisodes(userId);
      if (!isSpotRevealed(spot, completed)) throw new Error('这个地点不存在');
      const closed = spotClosedReason(spot);
      if (closed) throw new Error(closed);
      const visited = getVisitedSpotsToday(userId);
      if (visited.includes(spot.id)) throw new Error(`今天已经去过${spot.name}了，明天再来看看`);
      if (!getHotVisitSpots(userId, tierInfo.tier, completed).includes(spot.id)) throw new Error(`今天${spot.name}很安静，没什么事发生。看看地图上亮着的地方吧`);

      spendEnergyOrThrow(userId, Math.max(1, Math.min(10, Number(spot.energy) || 4)));
      const sysPoints = Math.max(0, Math.min(60, Number(spot.sysPoints) || 20));
      grant(userId, 0, sysPoints);

      let affinity: { heroineId: string; name: string; gain: number } | null = null;
      if (spot.affinity) {
        const row = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [userId, spot.affinity]);
        const def = content.heroines.find((h: any) => h.id === spot.affinity);
        if (row?.unlocked && def) {
          execute('UPDATE player_heroines SET affection = affection + ? WHERE user_id = ? AND heroine_id = ?', [AFFINITY_GAIN, userId, spot.affinity]);
          affinity = { heroineId: def.id, name: def.name, gain: AFFINITY_GAIN };
        }
      }

      setPlayerKv(userId, KV_VISITS, JSON.stringify({ day: todayKey(), ids: [...visited, spot.id] }));
      const lines: string[] = Array.isArray(spot.lines) && spot.lines.length ? spot.lines : [`你在${spot.name}待了一会儿。`];
      res.json({
        success: true,
        line: lines[Math.floor(Math.random() * lines.length)],
        sysPoints,
        affinity,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
