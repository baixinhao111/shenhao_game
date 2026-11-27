/**
 * 区域小地图的「打卡点」（kind: 'visit'）：每个点每天可去一次，花少量精力换天枢积分 + 一句见闻；
 * 有 affinity 的点在对应红颜已解锁时额外 +3 好感。其他种类的点（小玩法/约会/车行/物业/产业）
 * 都复用已有接口，这里只负责打卡。
 */
import type { NextFunction, Request, Response, Router } from 'express';
import { getContent } from './contentLoader.js';
import { execute, queryOne } from './db.js';
import { grant, spendEnergyOrThrow } from './economy.js';
import { buildFullGameState, computePortfolioAndTier, getPlayerKv, setPlayerKv, todayKey } from './gameEngine.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const KV_VISITS = 'map_visits';
const AFFINITY_GAIN = 3;

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
      const visited = getVisitedSpotsToday(userId);
      if (visited.includes(spot.id)) throw new Error(`今天已经去过${spot.name}了，明天再来看看`);

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
