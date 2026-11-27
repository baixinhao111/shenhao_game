import { getContent } from './contentLoader.js';
import { execute, getDb, getGmSetting, persistDb, queryAll, queryOne } from './db.js';

export const DAILY_POKE_LIMIT = 3;

let lastKvDbRef: unknown = null;

export function ensurePlayerKvTable(): void {
  const db = getDb();
  if (lastKvDbRef === db) return;
  execute(
    `CREATE TABLE IF NOT EXISTS player_kv (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )`,
    [],
    false,
  );
  lastKvDbRef = db;
}

export function getPlayerKv(userId: number, key: string): string | null {
  ensurePlayerKvTable();
  const row = queryOne<{ value: string }>('SELECT value FROM player_kv WHERE user_id = ? AND key = ?', [userId, key]);
  return row ? row.value : null;
}

export function setPlayerKv(userId: number, key: string, value: string, save = true): void {
  ensurePlayerKvTable();
  execute(
    'INSERT INTO player_kv (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value',
    [userId, key, value],
    save,
  );
}

export function getDailyPokeCount(userId: number): number {
  const raw = getPlayerKv(userId, `home_poke:${todayKey()}`);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function getPokesRemainingToday(userId: number): number {
  return Math.max(0, DAILY_POKE_LIMIT - getDailyPokeCount(userId));
}

export function incrementDailyPokeCount(userId: number): number {
  const next = getDailyPokeCount(userId) + 1;
  setPlayerKv(userId, `home_poke:${todayKey()}`, String(next), true);
  return next;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTimePeriod(): 'day' | 'evening' | 'night' {
  const h = new Date().getHours();
  if (h >= 7 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export function getTimePeriodLabel(): string {
  const h = new Date().getHours();
  const m = String(new Date().getMinutes()).padStart(2, '0');
  const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 18 ? '下午' : h < 22 ? '傍晚' : '深夜';
  return `${period} ${String(h).padStart(2, '0')}:${m}`;
}

export function formatMoney(amount: number): string {
  if (amount >= 1e12) return `¥${(amount / 1e12).toFixed(2)}万亿`;
  if (amount >= 1e8) return `¥${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `¥${(amount / 1e4).toFixed(1)}万`;
  return `¥${Math.round(amount).toLocaleString('zh-CN')}`;
}

export function initNewPlayer(userId: number, nickname: string): void {
  const now = Date.now();
  const today = todayKey();
  const content = getContent();

  execute(
    `INSERT INTO player_state
      (user_id, cash, sys_points, sys_level, sys_exp, energy, energy_updated_at, crit_charge, current_district, main_property_id, equipped_car_id, daily_date)
     VALUES (?, 12000, 60, 1, 0, 100, ?, 40, 'old_street', 'prop_old_room', 'car_ebike', ?)`,
    [userId, now, today],
    false,
  );

  // Starter property
  for (const prop of content.properties) {
    if (prop.starterOwned) {
      execute(
        `INSERT OR IGNORE INTO player_properties (user_id, property_id, renovation_level, custom_name, residents_json, last_rent_at, purchased_at)
         VALUES (?, ?, 1, '', '[]', ?, ?)`,
        [userId, prop.id, now, now],
        false,
      );
    }
  }

  // Starter car
  for (const asset of content.assetsCatalog.assets) {
    if (asset.starterOwned) {
      execute(
        `INSERT OR IGNORE INTO player_assets (user_id, asset_id, acquired_at) VALUES (?, ?, ?)`,
        [userId, asset.id, now],
        false,
      );
    }
  }

  // Initialize heroines rows
  for (const h of content.heroines) {
    execute(
      `INSERT OR IGNORE INTO player_heroines (user_id, heroine_id, unlocked, affection, daily_chat_affection, daily_date)
       VALUES (?, ?, ?, 0, 0, ?)`,
      [userId, h.id, h.starterUnlocked ? 1 : 0, today],
      false,
    );
  }

  // Welcome moment
  execute(
    `INSERT INTO social_moments (user_id, author_name, author_avatar, content, location, likes_json, comments_json, created_at)
     VALUES (?, ?, '', ?, '海城 · 城南旧街', ?, ?, ?)`,
    [
      userId,
      nickname,
      '暴雨夜，从零开始。今天起，海城的规则由我重写。',
      JSON.stringify(['陈默（私人管家）']),
      JSON.stringify([{ author: '陈默（私人管家）', text: '少爷，天枢黑金终端已就绪，请先前往【剧情】完成序章觉醒。' }]),
      now,
    ],
    false,
  );

  // Welcome GM mail
  execute(
    `INSERT INTO player_mails (user_id, title, body, cash, sys_points, energy, claimed, created_at)
     VALUES (?, ?, ?, 50000, 30, 20, 0, ?)`,
    [
      userId,
      '【天枢系统】新晋宿主启航补给',
      '欢迎来到海城！先去【剧情】完成序章觉醒，即可获得百万体验金与首波十倍暴击超跑打脸！这封系统补给随时可领。',
      now,
    ],
    false,
  );

  persistDb();
}

export function getSkillTotals(skillsJson: string): Record<string, number> {
  const content = getContent();
  let map: Record<string, number> = {};
  try {
    map = JSON.parse(skillsJson || '{}');
  } catch {
    map = {};
  }
  const totals: Record<string, number> = {
    critRatePct: 0,
    critMultBonus: 0,
    incomePct: 0,
    insightLevel: 0,
    upgradeDiscountPct: 0,
    charmPct: 0,
  };
  for (const sk of content.skillsData.skills) {
    const lv = Number(map[sk.id] || 0);
    if (lv > 0) {
      totals[sk.effectKey] = (totals[sk.effectKey] || 0) + lv * sk.valuePerLevel;
    }
  }
  return totals;
}

export function ensureDailyResetAndEnergy(userId: number): any {
  const content = getContent();
  const state = queryOne<any>('SELECT * FROM player_state WHERE user_id = ?', [userId]);
  if (!state) return null;

  const today = todayKey();
  const now = Date.now();
  let dirty = false;

  if (state.daily_date !== today) {
    state.daily_date = today;
    state.signed_in_today = 0;
    state.daily_progress_json = '{}';
    state.daily_claimed_json = '[]';
    state.ai_msg_today = 0;
    dirty = true;

    // Passive daily affection for resident heroines ("金屋藏娇" daily perk!)
    const props = queryAll<any>('SELECT * FROM player_properties WHERE user_id = ?', [userId]);
    for (const p of props) {
      let residents: string[] = [];
      try {
        residents = JSON.parse(p.residents_json || '[]');
      } catch {}
      for (const hid of residents) {
        execute(
          'UPDATE player_heroines SET affection = affection + 5 WHERE user_id = ? AND heroine_id = ? AND unlocked = 1',
          [userId, hid],
          false,
        );
      }
    }
  }

  // Compute max energy
  const mainPropDef = content.properties.find((p) => p.id === state.main_property_id);
  const maxEnergy = 100 + (mainPropDef?.energyBonus || 0) + (state.sys_level - 1) * 2;

  const elapsedMs = Math.max(0, now - Number(state.energy_updated_at || now));
  const regen = Math.floor(elapsedMs / (10 * 60 * 1000)); // 1 energy per 10 mins
  if (regen > 0) {
    if (state.energy < maxEnergy) {
      state.energy = Math.min(maxEnergy, state.energy + regen);
    }
    state.energy_updated_at = now - (elapsedMs % (10 * 60 * 1000));
    dirty = true;
  }

  if (dirty) {
    execute(
      `UPDATE player_state
       SET daily_date = ?, signed_in_today = ?, daily_progress_json = ?, daily_claimed_json = ?,
           ai_msg_today = ?, energy = ?, energy_updated_at = ?
       WHERE user_id = ?`,
      [
        state.daily_date,
        state.signed_in_today,
        state.daily_progress_json,
        state.daily_claimed_json,
        state.ai_msg_today,
        state.energy,
        state.energy_updated_at,
        userId,
      ],
    );
  }

  return { ...state, maxEnergy };
}

export function incrementDailyTask(userId: number, taskId: string, amount = 1): void {
  const state = queryOne<any>('SELECT daily_progress_json FROM player_state WHERE user_id = ?', [userId]);
  if (!state) return;
  let prog: Record<string, number> = {};
  try {
    prog = JSON.parse(state.daily_progress_json || '{}');
  } catch {}
  prog[taskId] = (prog[taskId] || 0) + amount;
  execute('UPDATE player_state SET daily_progress_json = ? WHERE user_id = ?', [JSON.stringify(prog), userId]);
}

export function getHeroineStage(heroineDef: any, affection: number) {
  let stage = heroineDef.stages[0];
  for (const s of heroineDef.stages) {
    if (affection >= s.minAffection) stage = s;
  }
  const idx = heroineDef.stages.indexOf(stage);
  const next = heroineDef.stages[idx + 1] || null;
  return { ...stage, nextAffection: next ? next.minAffection : null };
}

export function computePortfolioAndTier(userId: number) {
  const content = getContent();
  const state = ensureDailyResetAndEnergy(userId);
  const skills = getSkillTotals(state.skills_json);

  const ownedProps = queryAll<any>('SELECT * FROM player_properties WHERE user_id = ?', [userId]);
  const ownedBiz = queryAll<any>('SELECT * FROM player_businesses WHERE user_id = ?', [userId]);
  const ownedAssets = queryAll<any>('SELECT * FROM player_assets WHERE user_id = ?', [userId]);
  const heroinesRows = queryAll<any>('SELECT * FROM player_heroines WHERE user_id = ?', [userId]);

  const assetIds = new Set(ownedAssets.map((a) => a.asset_id));

  // Completed asset sets
  let setNetWorthBonus = 0;
  let setIncomeBonus = 0;
  let setCritBonus = 0;
  const completedSets: string[] = [];
  for (const set of content.assetsCatalog.sets) {
    if (set.requiredIds.every((id: string) => assetIds.has(id))) {
      completedSets.push(set.id);
      setNetWorthBonus += set.netWorthPct || 0;
      setIncomeBonus += set.incomeBonusPct || 0;
      setCritBonus += set.critBonusPct || 0;
    }
  }

  // Unlocked heroine global bonuses
  const unlockedHeroines = new Set(heroinesRows.filter((h) => h.unlocked).map((h) => h.heroine_id));
  const heroineNetWorthBonus = unlockedHeroines.has('su_qingwan') ? 0.05 : 0;
  const heroineCritBonus = unlockedHeroines.has('lin_wanxing') ? 0.06 : 0;
  const heroineAffectionSum = heroinesRows.reduce((s, h) => s + (h.unlocked ? h.affection : 0), 0);

  // Valuations
  let propValuation = 0;
  let rentPerHourTotal = 0;
  let pendingRent = 0;
  const now = Date.now();

  for (const p of ownedProps) {
    const def = content.properties.find((x) => x.id === p.property_id);
    if (!def) continue;
    const renoMult = 1 + (p.renovation_level - 1) * 0.25;
    propValuation += def.baseValuation * renoMult;

    // Commercial/landmark always earn rent; non-main residences also earn rent
    const earnsRent = def.type !== 'residence' || p.property_id !== state.main_property_id;
    if (earnsRent && def.rentPerHour > 0) {
      const hr = def.rentPerHour * renoMult * (1 + skills.incomePct + setIncomeBonus);
      rentPerHourTotal += hr;
      const hrs = Math.min(12, Math.max(0, (now - p.last_rent_at) / 3600000));
      pendingRent += hr * hrs;
    }
  }

  let bizValuation = 0;
  let bizIncomePerHourTotal = 0;
  let pendingBizIncome = 0;

  for (const b of ownedBiz) {
    const def = content.businesses.find((x) => x.id === b.business_id);
    if (!def) continue;
    const lvMult = 1 + (b.level - 1) * 0.45;
    bizValuation += def.baseValuation * lvMult;

    let assignMult = 1;
    if (b.assigned_heroine_id && unlockedHeroines.has(b.assigned_heroine_id)) {
      const hDef = content.heroines.find((x) => x.id === b.assigned_heroine_id);
      const matchBonus = def.preferredHeroine === b.assigned_heroine_id ? (hDef?.businessBonusPct || 0.35) : 0.15;
      assignMult = 1 + matchBonus + skills.charmPct * 0.4;
    }

    const hr = def.baseIncomePerHour * lvMult * assignMult * (1 + skills.incomePct + setIncomeBonus);
    bizIncomePerHourTotal += hr;
    const hrs = Math.min(12, Math.max(0, (now - b.last_collected_at) / 3600000));
    pendingBizIncome += hr * hrs;
  }

  let assetValuation = 0;
  for (const a of ownedAssets) {
    const def = content.assetsCatalog.assets.find((x) => x.id === a.asset_id);
    if (def) assetValuation += def.valuation || 0;
  }

  const rawNetWorth = state.cash + propValuation + bizValuation + assetValuation + heroineAffectionSum * 5000;
  const netWorth = Math.round(rawNetWorth * (1 + setNetWorthBonus + heroineNetWorthBonus));

  // Determine social tier
  let tierInfo = content.map.tiers[0];
  for (const t of content.map.tiers) {
    if (netWorth >= t.minNetWorth) tierInfo = t;
  }

  return {
    state,
    skills,
    ownedProps,
    ownedBiz,
    ownedAssets,
    heroinesRows,
    completedSets,
    netWorth,
    tierInfo,
    incomePerHour: Math.round(rentPerHourTotal + bizIncomePerHourTotal),
    pendingIncome: Math.round(pendingRent + pendingBizIncome),
    critBonusPct: skills.critRatePct + setCritBonus + heroineCritBonus,
    critMultBonus: skills.critMultBonus,
  };
}

/**
 * 天枢消费返现。保持「×2/×5/×10」的爽感，但期望值受控：
 *  - 基础触发率 12%（+技能/套装/红颜加成）
 *  - 未触发时蓄能，蓄能量与「这笔消费占身价的比例」成正比（占 6% 以上记满 25 点），
 *    小额刷单只能 +2，避免靠刷小升级稳拿保底暴击
 *  - 蓄满 100 必出 3/5/10 倍
 * scripts/qa/balance_progress.mjs 里的 CRIT 常量必须与这里一致。
 */
export const CRIT = { baseProb: 0.12, chargeOnCrit: 10, chargeMax: 25, chargeMin: 2, chargeScale: 400 };

export function rollCritCashback(
  userId: number,
  spendAmount: number,
  options?: { forceMultiplier?: number; allowCrit?: boolean },
) {
  const { state, critBonusPct, critMultBonus, netWorth } = computePortfolioAndTier(userId);
  if (spendAmount <= 0 || options?.allowCrit === false) {
    return { triggered: false, multiplier: 0, cashback: 0, newCharge: state.crit_charge, leveledUp: false };
  }

  let triggered = false;
  let multiplier = 0;
  let newCharge = state.crit_charge;

  if (options?.forceMultiplier && options.forceMultiplier > 0) {
    triggered = true;
    multiplier = options.forceMultiplier;
    newCharge = 0;
  } else {
    const baseProb = CRIT.baseProb + critBonusPct;
    if (state.crit_charge >= 100) {
      triggered = true;
      newCharge = 0;
      const roll = Math.random();
      multiplier = roll < 0.08 ? 10 : roll < 0.35 ? 5 : 3;
      multiplier += Math.floor(critMultBonus);
    } else if (Math.random() < baseProb) {
      triggered = true;
      const roll = Math.random();
      multiplier = roll < 0.05 ? 10 : roll < 0.25 ? 5 : 2;
      multiplier += Math.floor(critMultBonus * 0.5);
      newCharge = Math.min(100, state.crit_charge + CRIT.chargeOnCrit);
    } else {
      const gain = Math.round((spendAmount / Math.max(1, netWorth)) * CRIT.chargeScale);
      newCharge = Math.min(100, state.crit_charge + Math.max(CRIT.chargeMin, Math.min(CRIT.chargeMax, gain)));
    }
  }

  const cashback = triggered ? Math.round(spendAmount * multiplier) : 0;

  // Award System XP
  const expGain = Math.max(10, Math.min(300, Math.round(Math.log10(spendAmount + 10) * 18)));
  let newExp = state.sys_exp + expGain;
  let newLevel = state.sys_level;
  let leveledUp = false;
  while (newExp >= newLevel * 200) {
    newExp -= newLevel * 200;
    newLevel += 1;
    leveledUp = true;
  }

  execute(
    `UPDATE player_state
     SET cash = cash + ?, crit_charge = ?, sys_exp = ?, sys_level = ?, total_spent = total_spent + ?
     WHERE user_id = ?`,
    [cashback, newCharge, newExp, newLevel, spendAmount, userId],
  );

  incrementDailyTask(userId, 'task_spend', 1);

  return { triggered, multiplier, cashback, newCharge, leveledUp, newLevel };
}

export function postMoment(
  userId: number,
  authorName: string,
  contentText: string,
  location: string,
  comments: Array<{ author: string; text: string }> = [],
  likes: string[] = [],
  authorAvatar = '',
): void {
  execute(
    `INSERT INTO social_moments (user_id, author_name, author_avatar, content, location, likes_json, comments_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, authorName, authorAvatar, contentText, location, JSON.stringify(likes), JSON.stringify(comments), Date.now()],
  );
}

export function resolveHeroineLocations(userId: number): Record<string, { districtId: string; propertyId?: string; label: string }> {
  const content = getContent();
  const period = getTimePeriod();
  const props = queryAll<any>('SELECT * FROM player_properties WHERE user_id = ?', [userId]);

  const map: Record<string, { districtId: string; propertyId?: string; label: string }> = {};

  for (const h of content.heroines) {
    // Check if heroine lives in any player property (evening/night she relaxes at home!)
    let homeProp: any = null;
    for (const p of props) {
      let residents: string[] = [];
      try {
        residents = JSON.parse(p.residents_json || '[]');
      } catch {}
      if (residents.includes(h.id)) {
        homeProp = p;
        break;
      }
    }

    if (homeProp && period !== 'day') {
      const def = content.properties.find((x) => x.id === homeProp.property_id);
      map[h.id] = {
        districtId: def?.districtId || 'bund',
        propertyId: homeProp.property_id,
        label: `在${homeProp.custom_name || def?.name}等你`,
      };
    } else {
      const dId = h.schedule[period] || h.schedule.day;
      const dDef = content.map.districts.find((d: any) => d.id === dId);
      map[h.id] = {
        districtId: dId,
        label: `正在${dDef?.name || dId}`,
      };
    }
  }
  return map;
}

export function buildFullGameState(userId: number) {
  const content = getContent();
  const user = queryOne<any>('SELECT id, username, nickname, is_admin, created_at FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  const portfolio = computePortfolioAndTier(userId);
  const { state, skills, ownedProps, ownedBiz, ownedAssets, heroinesRows, completedSets, netWorth, tierInfo } = portfolio;

  const progressRows = queryAll<any>('SELECT * FROM player_progress WHERE user_id = ?', [userId]);
  const completedEpisodes = progressRows.map((r) => r.episode_id);

  const heroineLocs = resolveHeroineLocations(userId);

  const heroines = content.heroines.map((h) => {
    const row = heroinesRows.find((r) => r.heroine_id === h.id) || {
      unlocked: 0,
      affection: 0,
      daily_chat_affection: 0,
      last_gift_name: '',
    };
    const stage = getHeroineStage(h, row.affection);
    const assignedProp = ownedProps.find((p) => {
      try {
        return JSON.parse(p.residents_json || '[]').includes(h.id);
      } catch {
        return false;
      }
    });
    return {
      id: h.id,
      name: h.name,
      title: h.title,
      age: h.age,
      archetype: h.archetype,
      avatar: h.avatar,
      portrait: h.portrait,
      accentColor: h.accentColor,
      unlockHint: h.unlockHint,
      synergyDesc: h.synergyDesc,
      quickPrompts: h.quickPrompts,
      unlocked: Boolean(row.unlocked),
      affection: row.affection,
      dailyChatAffection: row.daily_date === todayKey() ? row.daily_chat_affection : 0,
      stage,
      location: heroineLocs[h.id],
      homePropertyId: assignedProp?.property_id || null,
    };
  });

  const properties = content.properties.map((p) => {
    const owned = ownedProps.find((o) => o.property_id === p.id);
    let residents: string[] = [];
    try {
      residents = owned ? JSON.parse(owned.residents_json || '[]') : [];
    } catch {}
    const renoLv = owned?.renovation_level || 1;
    return {
      ...p,
      owned: Boolean(owned),
      isMain: state.main_property_id === p.id,
      renovationLevel: renoLv,
      customName: owned?.custom_name || '',
      displayName: owned?.custom_name || p.name,
      currentValuation: Math.round(p.baseValuation * (1 + (renoLv - 1) * 0.25)),
      currentRentPerHour: Math.round(p.rentPerHour * (1 + (renoLv - 1) * 0.25)),
      residents,
      renovateCost: Math.round(Math.max(250000, p.price * 0.25) * renoLv * (1 - skills.upgradeDiscountPct)),
    };
  });

  const businesses = content.businesses.map((b) => {
    const owned = ownedBiz.find((o) => o.business_id === b.id);
    const lv = owned?.level || 0;
    const assignedId = owned?.assigned_heroine_id || '';
    const lvMult = lv > 0 ? 1 + (lv - 1) * 0.45 : 1;
    const upgradeCost = Math.round(b.upgradeBaseCost * Math.pow(1.45, Math.max(0, lv - 1)) * (1 - skills.upgradeDiscountPct));
    return {
      ...b,
      owned: Boolean(owned),
      level: lv,
      assignedHeroineId: assignedId,
      currentIncomePerHour: Math.round(b.baseIncomePerHour * lvMult),
      upgradeCost,
    };
  });

  const ownedAssetIds = new Set(ownedAssets.map((a) => a.asset_id));
  const assets = content.assetsCatalog.assets.map((a) => ({
    ...a,
    owned: ownedAssetIds.has(a.id),
    equipped: state.equipped_car_id === a.id,
  }));

  const skillsMap = (() => {
    try {
      return JSON.parse(state.skills_json || '{}');
    } catch {
      return {};
    }
  })();

  const dailyProgress = (() => {
    try {
      return JSON.parse(state.daily_progress_json || '{}');
    } catch {
      return {};
    }
  })();

  const dailyClaimed: string[] = (() => {
    try {
      return JSON.parse(state.daily_claimed_json || '[]');
    } catch {
      return [];
    }
  })();

  const mails = queryAll<any>('SELECT * FROM player_mails WHERE user_id = ? ORDER BY id DESC LIMIT 20', [userId]);
  const unreadMailCount = mails.filter((m) => !m.claimed).length;

  // Active events (can be toggled by GM)
  const eventToggle = getGmSetting('event_cruise_01_active');
  const events = content.events.map((ev) => {
    const active = ev.id === 'event_cruise_01' && eventToggle !== null ? eventToggle === 'true' : ev.active;
    const row = queryOne<any>('SELECT * FROM player_events WHERE user_id = ? AND event_id = ?', [userId, ev.id]);
    let redeemed: string[] = [];
    try {
      redeemed = row ? JSON.parse(row.redeemed_json || '[]') : [];
    } catch {}
    return {
      ...ev,
      active,
      tokens: row?.tokens || 0,
      playsToday: row && row.daily_date === todayKey() ? row.plays_today : 0,
      redeemed,
    };
  });

  // Next playable story episode
  const allEpisodes = content.stories.volumes.flatMap((v: any) =>
    v.episodes.map((ep: any) => ({ ...ep, volumeId: v.volumeId, volumeTitle: v.title })),
  );
  const nextEpisode = allEpisodes.find((ep: any) => !completedEpisodes.includes(ep.episodeId)) || null;

  // Homepage summary payload for AAA simulation lobby
  const mainResidence =
    properties.find((p) => p.id === state.main_property_id) ||
    properties.find((p) => p.owned && p.type === 'residence') ||
    properties.find((p) => p.owned) ||
    properties[0] ||
    null;

  const pokesRemaining = getPokesRemainingToday(userId);
  const period = getTimePeriod();
  const residentHeroine =
    mainResidence && mainResidence.residents?.length > 0
      ? heroines.find((h) => h.unlocked && mainResidence.residents.includes(h.id))
      : null;

  const nextEpDistrict = nextEpisode
    ? content.map.districts.find((d: any) => d.id === nextEpisode.districtId)
    : null;

  let todayHeadline = `${mainResidence?.displayName || '海城'} · ${getTimePeriodLabel()}`;
  if (portfolio.pendingIncome >= 50000) {
    todayHeadline = `待收分红与租金 ${formatMoney(portfolio.pendingIncome)}`;
  } else if (residentHeroine && period !== 'day' && mainResidence) {
    todayHeadline = `${residentHeroine.name}在${mainResidence.displayName}等你`;
  } else if (nextEpisode) {
    todayHeadline = `${nextEpisode.chapterTitle} · ${nextEpisode.title}（${nextEpDistrict?.name || '海城'}）`;
  } else if (portfolio.incomePerHour > 0 && mainResidence) {
    todayHeadline = `${mainResidence.displayName} · 每小时收益 +${formatMoney(portfolio.incomePerHour)}`;
  }

  return {
    user,
    timePeriod: period,
    timeLabel: getTimePeriodLabel(),
    homeSummary: {
      mainResidence,
      pendingIncome: portfolio.pendingIncome,
      incomePerHour: portfolio.incomePerHour,
      todayHeadline,
      pokesRemaining,
    },
    player: {
      cash: Math.round(state.cash),
      sysPoints: state.sys_points,
      sysLevel: state.sys_level,
      sysExp: state.sys_exp,
      sysExpNext: state.sys_level * 200,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      critCharge: state.crit_charge,
      currentDistrict: state.current_district,
      mainPropertyId: state.main_property_id,
      equippedCarId: state.equipped_car_id,
      signedInToday: Boolean(state.signed_in_today),
      aiMsgToday: state.ai_msg_today,
      netWorth,
      tier: tierInfo,
      /** 小玩法档位倍率：彩头/本金随阶层放大，保证后期小玩法仍然动得了身价 */
      stakeScale: Number((tierInfo as any).stakeScale || 1),
      nextTier: content.map.tiers.find((t: any) => t.tier === tierInfo.tier + 1) || null,
      incomePerHour: portfolio.incomePerHour,
      pendingIncome: portfolio.pendingIncome,
      critRatePct: Math.round((CRIT.baseProb + portfolio.critBonusPct) * 100),
    },
    map: {
      cityName: content.map.cityName,
      subtitle: content.map.subtitle,
      mapImage: content.map.mapImage,
      districts: content.map.districts.map((d: any) => ({
        ...d,
        unlocked: tierInfo.tier >= d.unlockTier,
        hasNextStory: nextEpisode?.districtId === d.id,
        presentHeroines: heroines
          .filter((h) => h.unlocked && h.location.districtId === d.id)
          .map((h) => ({ id: h.id, name: h.name, avatar: h.avatar, label: h.location.label })),
        ownedProperties: properties
          .filter((p) => p.districtId === d.id && p.owned)
          .map((p) => ({ id: p.id, name: p.displayName, isMain: p.isMain, type: p.type })),
      })),
    },
    stories: {
      volumes: content.stories.volumes,
      completedEpisodes,
      nextEpisodeId: nextEpisode?.episodeId || null,
    },
    properties,
    businesses,
    assets,
    assetSets: content.assetsCatalog.sets.map((s) => ({
      ...s,
      completed: completedSets.includes(s.id),
    })),
    heroines,
    gifts: content.gifts,
    skills: content.skillsData.skills.map((sk) => ({
      ...sk,
      level: Number(skillsMap[sk.id] || 0),
    })),
    dailyTasks: content.skillsData.dailyTasks.map((t) => ({
      ...t,
      progress: Number(dailyProgress[t.id] || 0),
      claimed: dailyClaimed.includes(t.id),
    })),
    mallItems: content.skillsData.mallItems,
    events,
    mails,
    unreadMailCount,
    deepseekConfigured: Boolean(getGmSetting('deepseek_api_key') || process.env.DEEPSEEK_API_KEY),
  };
}
