/**
 * 红颜羁绊系统：好感阶段突破剧情、换装立绘、显性修罗场事件
 */
import type { NextFunction, Request, Response, Router } from 'express';
import { getContent } from './contentLoader.js';
import { execute, queryAll, queryOne } from './db.js';
import { grant } from './economy.js';
import {
  buildFullGameState,
  getPlayerKv,
  postMoment,
  setPlayerKv,
  todayKey,
} from './gameEngine.js';
import { incrementAchievementStat } from './empire.js';

type AuthedRequest = Request & { userId?: number };
type Auth = (req: AuthedRequest, res: Response, next: NextFunction) => void;

const KV_OUTFITS = 'heroine_outfits';
const KV_BONDS_DONE = 'bonds_completed';
const KV_SHURA_DONE = 'shura_completed';
const KV_SHURA_LAST_DAY = 'shura_last_day';

function parseJsonKv<T>(userId: number, key: string, fallback: T): T {
  const raw = getPlayerKv(userId, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getCompletedBonds(userId: number): string[] {
  return parseJsonKv<string[]>(userId, KV_BONDS_DONE, []);
}

export function getCompletedShura(userId: number): string[] {
  return parseJsonKv<string[]>(userId, KV_SHURA_DONE, []);
}

export function getEquippedOutfitsMap(userId: number): Record<string, string> {
  return parseJsonKv<Record<string, string>>(userId, KV_OUTFITS, {});
}

export function getUnlockedOutfitIds(userId: number, heroineId: string): string[] {
  const content = getContent();
  const done = new Set(getCompletedBonds(userId));
  const unlocked = new Set<string>(['default']);
  for (const b of content.bondStories?.bonds || []) {
    if (b.heroineId === heroineId && b.unlockOutfit && done.has(b.id)) {
      unlocked.add(b.unlockOutfit);
    }
  }
  return [...unlocked];
}

export function resolveHeroineActivePortrait(userId: number, heroineDef: any): { outfitId: string; portrait: string } {
  const outfits: any[] = Array.isArray(heroineDef?.outfits) ? heroineDef.outfits : [];
  const equippedMap = getEquippedOutfitsMap(userId);
  const unlockedIds = new Set(getUnlockedOutfitIds(userId, heroineDef.id));
  const wanted = equippedMap[heroineDef.id] || 'default';
  const validId = unlockedIds.has(wanted) ? wanted : 'default';
  const matched = outfits.find((o) => o.id === validId);
  return {
    outfitId: validId,
    portrait: matched?.portrait || heroineDef.portrait,
  };
}

/** Permanent +3% net worth bonus for each Lv.6 ultimate bond completed */
export function getBondNetWorthBonus(userId: number): number {
  const content = getContent();
  const done = new Set(getCompletedBonds(userId));
  let bonus = 0;
  for (const b of content.bondStories?.bonds || []) {
    if (b.stageLevel >= 6 && done.has(b.id)) bonus += 0.03;
  }
  return bonus;
}

export function buildHeroineBondsSummary(userId: number, heroineId: string, affection: number, unlocked: boolean) {
  const content = getContent();
  const done = new Set(getCompletedBonds(userId));
  const bonds = (content.bondStories?.bonds || [])
    .filter((b: any) => b.heroineId === heroineId)
    .sort((a: any, b: any) => (a.stageLevel || 0) - (b.stageLevel || 0))
    .map((b: any) => ({
      id: b.id,
      stageLevel: b.stageLevel,
      minAffection: b.minAffection,
      title: b.title,
      subtitle: b.subtitle,
      unlockOutfit: b.unlockOutfit || null,
      completed: done.has(b.id),
      available: unlocked && affection >= (b.minAffection || 0) && !done.has(b.id),
    }));
  return bonds;
}

export function getActiveShuraTrigger(
  userId: number,
  heroinesRows: any[],
  playerState: any,
  ownedProps: any[],
): any | null {
  const content = getContent();
  const events: any[] = content.bondStories?.shuraEvents || [];
  if (events.length === 0) return null;

  const today = todayKey();
  const lastDay = getPlayerKv(userId, KV_SHURA_LAST_DAY);
  if (lastDay === today) return null;

  const unlockedMap = new Map<string, number>();
  for (const r of heroinesRows) {
    if (r.unlocked) unlockedMap.set(r.heroine_id, Number(r.affection || 0));
  }
  if (unlockedMap.size < 2) return null;

  // Trigger condition: either recent gift within 6h while >=2 heroines unlocked, OR >=2 heroines live in same property, OR both >= minAffectionEach
  const recentGift =
    Boolean(playerState?.last_gift_heroine_id) &&
    Date.now() - Number(playerState?.last_gift_time || 0) < 6 * 3600 * 1000;
  const cohabiting = ownedProps.some((p) => {
    try {
      return JSON.parse(p.residents_json || '[]').length >= 2;
    } catch {
      return false;
    }
  });

  const done = new Set(getCompletedShura(userId));
  // Prefer unfinished shura events first, else allow replay on another day if jealous/cohabiting
  const candidates = events.filter((ev) => {
    const ids: string[] = ev.heroineIds || [];
    if (ids.length < 2) return false;
    const minAff = recentGift || cohabiting ? Math.min(15, Number(ev.minAffectionEach || 30)) : Number(ev.minAffectionEach || 30);
    return ids.every((id) => unlockedMap.has(id) && (unlockedMap.get(id) || 0) >= minAff);
  });
  if (candidates.length === 0) return null;

  const picked = candidates.find((ev) => !done.has(ev.id)) || (recentGift || cohabiting ? candidates[0] : null);
  if (!picked) return null;

  return {
    id: picked.id,
    title: picked.title,
    subtitle: picked.subtitle,
    heroineIds: picked.heroineIds,
    reason: recentGift ? '刚给别的红颜送过礼，醋意触发！' : cohabiting ? '两位红颜在私宅撞见了彼此' : '两位红颜同时发来了行程邀约',
    completedBefore: done.has(picked.id),
  };
}

function interpolateText(text: string, vars: Record<string, string>): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function interpolateNode(node: any, vars: Record<string, string>): any {
  if (!node || typeof node !== 'object') return node;
  const out: any = { ...node };
  for (const k of ['text', 'title', 'name', 'role', 'innerThought', 'sceneBanner']) {
    if (typeof out[k] === 'string') out[k] = interpolateText(out[k], vars);
  }
  if (Array.isArray(out.options)) {
    out.options = out.options.map((opt: any) => ({
      ...opt,
      label: typeof opt.label === 'string' ? interpolateText(opt.label, vars) : opt.label,
      resultText: typeof opt.resultText === 'string' ? interpolateText(opt.resultText, vars) : opt.resultText,
      branchNodes: Array.isArray(opt.branchNodes) ? opt.branchNodes.map((b: any) => interpolateNode(b, vars)) : undefined,
    }));
  }
  return out;
}

function sumChoiceBonus(nodes: any[], choiceIds: string[]): { bonus: number; lastResultText: string } {
  let bonus = 0;
  let lastResultText = '';
  const wanted = new Set(choiceIds.filter(Boolean));
  const walk = (list: any[]) => {
    for (const n of list || []) {
      if (n?.type === 'system_choice' && Array.isArray(n.options)) {
        const hit = n.options.find((o: any) => wanted.has(o.id)) || n.options[0];
        if (hit) {
          bonus += Math.max(0, Math.min(8, Number(hit.affectionBonus || 0)));
          if (hit.resultText) lastResultText = hit.resultText;
          if (Array.isArray(hit.branchNodes)) walk(hit.branchNodes);
        }
      }
    }
  };
  walk(nodes);
  return { bonus, lastResultText };
}

export function registerBondRoutes(router: Router, auth: Auth): void {
  // 1. Equip heroine outfit
  router.post('/heroines/:id/outfit', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const heroineId = String(req.params.id);
      const outfitId = String(req.body?.outfitId || 'default');
      const content = getContent();
      const hDef = content.heroines.find((h: any) => h.id === heroineId);
      if (!hDef) throw new Error('红颜不存在');

      const hRow = queryOne<any>('SELECT unlocked FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        heroineId,
      ]);
      if (!hRow || !hRow.unlocked) throw new Error('请先结识该红颜');

      const unlockedIds = getUnlockedOutfitIds(userId, heroineId);
      if (!unlockedIds.includes(outfitId)) {
        throw new Error('该装扮尚未解锁，请先完成对应好感阶段羁绊剧情');
      }

      const map = getEquippedOutfitsMap(userId);
      map[heroineId] = outfitId;
      setPlayerKv(userId, KV_OUTFITS, JSON.stringify(map));

      const outfitObj = (hDef.outfits || []).find((o: any) => o.id === outfitId);
      res.json({
        success: true,
        message: `${hDef.name}已换上「${outfitObj?.name || outfitId}」`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 2. Start Heroine Bond Milestone Chapter
  router.post('/heroines/bond/start', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const bondId = String(req.body?.bondId || '');
      const content = getContent();
      const bond = (content.bondStories?.bonds || []).find((b: any) => b.id === bondId);
      if (!bond) throw new Error('该羁绊章节不存在');

      const hDef = content.heroines.find((h: any) => h.id === bond.heroineId);
      const hRow = queryOne<any>('SELECT unlocked, affection FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        bond.heroineId,
      ]);
      if (!hDef || !hRow || !hRow.unlocked) throw new Error('尚未结识该红颜');
      if (Number(hRow.affection || 0) < Number(bond.minAffection || 0)) {
        throw new Error(`好感度需达到 ${bond.minAffection} 才可开启本幕羁绊（当前 ${hRow.affection}）`);
      }

      const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
      const vars = { playerName: user?.nickname || '陆沉' };
      const done = getCompletedBonds(userId).includes(bond.id);

      res.json({
        script: {
          id: bond.id,
          bondId: bond.id,
          heroineId: hDef.id,
          heroineName: hDef.name,
          heroineAvatar: hDef.avatar,
          heroinePortrait: bond.unlockOutfit
            ? (hDef.outfits || []).find((o: any) => o.id === bond.unlockOutfit)?.portrait || hDef.portrait
            : hDef.portrait,
          title: bond.title,
          subtitle: bond.subtitle,
          sceneLabel: bond.sceneLabel || `${hDef.name} · 羁绊 Lv.${bond.stageLevel}`,
          bg: bond.bg,
          unlockOutfit: bond.unlockOutfit || null,
          alreadyCompleted: done,
          nodes: (bond.nodes || []).map((n: any) => interpolateNode(n, vars)),
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. Complete Heroine Bond Milestone Chapter
  router.post('/heroines/bond/complete', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const bondId = String(req.body?.bondId || '');
      const choiceIds: string[] = Array.isArray(req.body?.choiceIds)
        ? req.body.choiceIds.map(String)
        : req.body?.choiceId
          ? [String(req.body.choiceId)]
          : [];
      const content = getContent();
      const bond = (content.bondStories?.bonds || []).find((b: any) => b.id === bondId);
      if (!bond) throw new Error('该羁绊章节不存在');

      const hDef = content.heroines.find((h: any) => h.id === bond.heroineId);
      const hRow = queryOne<any>('SELECT unlocked, affection FROM player_heroines WHERE user_id = ? AND heroine_id = ?', [
        userId,
        bond.heroineId,
      ]);
      if (!hDef || !hRow || !hRow.unlocked) throw new Error('尚未结识该红颜');
      if (Number(hRow.affection || 0) < Number(bond.minAffection || 0)) {
        throw new Error(`好感度需达到 ${bond.minAffection} 才可完成本幕羁绊`);
      }

      const doneList = getCompletedBonds(userId);
      if (doneList.includes(bond.id)) {
        res.json({
          success: true,
          alreadyCompleted: true,
          reactionText: '这段只属于你们的回忆已珍藏在时光里。',
          state: buildFullGameState(userId),
        });
        return;
      }

      const { bonus, lastResultText } = sumChoiceBonus(bond.nodes || [], choiceIds);
      const affGain = Number(bond.reward?.affectionGain || 15) + bonus;
      const ptsGain = Number(bond.reward?.sysPoints || 60);

      execute('UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ?', [
        affGain,
        Date.now(),
        userId,
        bond.heroineId,
      ]);
      grant(userId, 0, ptsGain);

      doneList.push(bond.id);
      setPlayerKv(userId, KV_BONDS_DONE, JSON.stringify(doneList));
      incrementAchievementStat(userId, 'bondsCompleted', 1);

      let unlockedOutfitName: string | null = null;
      if (bond.unlockOutfit) {
        const outfitObj = (hDef.outfits || []).find((o: any) => o.id === bond.unlockOutfit);
        unlockedOutfitName = outfitObj?.name || bond.unlockOutfit;
        // Auto-equip newly unlocked outfit for immediate delight!
        const outfitMap = getEquippedOutfitsMap(userId);
        outfitMap[bond.heroineId] = bond.unlockOutfit;
        setPlayerKv(userId, KV_OUTFITS, JSON.stringify(outfitMap));
      }

      if (bond.moment?.text) {
        const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
        const vars = { playerName: user?.nickname || '陆沉' };
        postMoment(
          userId,
          bond.moment.author || hDef.name,
          interpolateText(bond.moment.text, vars),
          bond.moment.location || '海城',
          (bond.moment.comments || []).map((c: any) => ({
            author: interpolateText(String(c.author || ''), vars),
            text: interpolateText(String(c.text || ''), vars),
          })),
          (bond.moment.likes || ['陈默（私人管家）']).map((l: any) => interpolateText(String(l), vars)),
          bond.moment.avatar || hDef.avatar || '',
        );
      }

      res.json({
        success: true,
        affectionGain: affGain,
        sysPoints: ptsGain,
        unlockedOutfitName,
        reactionText: lastResultText || `你与${hDef.name}的关系迈入了全新的阶段。`,
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4. Start Shura-field Event
  router.post('/heroines/shura/start', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const eventId = String(req.body?.eventId || '');
      const content = getContent();
      const ev = (content.bondStories?.shuraEvents || []).find((e: any) => e.id === eventId);
      if (!ev) throw new Error('修罗场事件不存在');

      const heroinesRows = queryAll<any>('SELECT * FROM player_heroines WHERE user_id = ?', [userId]);
      const ok = (ev.heroineIds || []).every((hid: string) =>
        heroinesRows.some((r) => r.heroine_id === hid && r.unlocked),
      );
      if (!ok) throw new Error('尚未同时结识事件中的两位红颜');

      const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
      const vars = { playerName: user?.nickname || '陆沉' };
      const firstH = content.heroines.find((h: any) => h.id === ev.heroineIds?.[0]);

      res.json({
        script: {
          id: ev.id,
          eventId: ev.id,
          title: ev.title,
          subtitle: ev.subtitle,
          sceneLabel: ev.sceneLabel || '海城 · 修罗场',
          bg: ev.bg,
          heroineIds: ev.heroineIds,
          heroineId: firstH?.id,
          heroineName: (ev.heroineIds || [])
            .map((id: string) => content.heroines.find((h: any) => h.id === id)?.name)
            .filter(Boolean)
            .join(' × '),
          heroineAvatar: firstH?.avatar,
          nodes: (ev.nodes || []).map((n: any) => interpolateNode(n, vars)),
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Complete Shura-field Event
  router.post('/heroines/shura/complete', auth, (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const eventId = String(req.body?.eventId || '');
      const choiceIds: string[] = Array.isArray(req.body?.choiceIds)
        ? req.body.choiceIds.map(String)
        : req.body?.choiceId
          ? [String(req.body.choiceId)]
          : [];
      const content = getContent();
      const ev = (content.bondStories?.shuraEvents || []).find((e: any) => e.id === eventId);
      if (!ev) throw new Error('修罗场事件不存在');

      const today = todayKey();
      const alreadyToday = getPlayerKv(userId, KV_SHURA_LAST_DAY) === today;
      if (alreadyToday) {
        res.json({
          success: true,
          reactionText: '今天的修罗场风波已经安抚妥当了。',
          state: buildFullGameState(userId),
        });
        return;
      }

      const { bonus, lastResultText } = sumChoiceBonus(ev.nodes || [], choiceIds);
      const affEach = Number(ev.reward?.affectionEach || 12) + Math.floor(bonus / 2);
      const ptsGain = Number(ev.reward?.sysPoints || 80);

      for (const hid of ev.heroineIds || []) {
        execute(
          'UPDATE player_heroines SET affection = affection + ?, last_interaction_at = ? WHERE user_id = ? AND heroine_id = ? AND unlocked = 1',
          [affEach, Date.now(), userId, hid],
          false,
        );
      }
      grant(userId, 0, ptsGain);

      const doneList = getCompletedShura(userId);
      if (!doneList.includes(ev.id)) {
        doneList.push(ev.id);
        setPlayerKv(userId, KV_SHURA_DONE, JSON.stringify(doneList), false);
      }
      setPlayerKv(userId, KV_SHURA_LAST_DAY, today, true);
      incrementAchievementStat(userId, 'shuraResolved', 1);

      if (ev.moment?.text) {
        const user = queryOne<any>('SELECT nickname FROM users WHERE id = ?', [userId]);
        const vars = { playerName: user?.nickname || '陆沉' };
        postMoment(
          userId,
          ev.moment.author || user?.nickname || '陆沉',
          interpolateText(ev.moment.text, vars),
          ev.moment.location || '海城',
          (ev.moment.comments || []).map((c: any) => ({
            author: interpolateText(String(c.author || ''), vars),
            text: interpolateText(String(c.text || ''), vars),
          })),
          (ev.moment.likes || ['陈默（私人管家）']).map((l: any) => interpolateText(String(l), vars)),
          ev.moment.avatar || '',
        );
      }

      res.json({
        success: true,
        affectionEach: affEach,
        sysPoints: ptsGain,
        reactionText: lastResultText || '端水大师稳住全场，两位红颜虽嘴上不饶人，眼底却都软了下来。',
        state: buildFullGameState(userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}
