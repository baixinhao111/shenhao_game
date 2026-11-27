// Progression simulator: how fast does net worth grow, and when does each main-story gate open?
//
//   node scripts/qa/balance_progress.mjs             # report with the gates in content/stories/stories.json
//   node scripts/qa/balance_progress.mjs --suggest   # also print requireNetWorth values that hit TARGET_HOURS
//
// Mirrors server/src/gameEngine.ts (keep CRIT in sync with rollCritCashback):
//   - net worth = cash + business valuation (base × (1 + 0.45·(lv-1))) + property valuation + assets
//   - every purchase rolls the 天枢 crit cashback; the charge meter fills in proportion to spend / net worth
//   - income accrues per hour, capped at 12h per collection
//   - story rewards = the free option of every choice (a player who never pays in-story)
//   - minigames are ~1.0× EV and not counted as growth; daily-task cash is
// Players: "engaged" plays 4 sessions a day (08/13/18/24h), "casual" 2 sessions (08h/24h).
// A session = collect income → daily tasks (first session) → read every open chapter → reinvest greedily.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const unwrap = (x, k) => (Array.isArray(x) ? x : x[k]);

const businesses = unwrap(J('content/businesses.json'), 'businesses');
const properties = unwrap(J('content/properties.json'), 'properties');
const catalog = J('content/assets_catalog.json');
const tiers = J('content/maps/haicheng.json').tiers;
const skillsData = J('content/skills.json');
const episodes = J('content/stories/stories.json').volumes.flatMap((v) => v.episodes);
const assetVal = Object.fromEntries(catalog.assets.map((a) => [a.id, a.valuation || 0]));
const dailyCash = (skillsData.dailyTasks || []).reduce((s, t) => s + (t.rewardCash || 0), 0);

/** Same constants as rollCritCashback in server/src/gameEngine.ts */
export const CRIT = { baseProb: 0.12, chargeOnCrit: 10, chargeMax: 25, chargeMin: 2, chargeScale: 400 };

function storyDelta(ep) {
  let cash = 0;
  let worth = 0;
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type !== 'system_choice' || !n.options?.length) continue;
      const o = n.options.find((x) => !(x.cost?.cash || x.cashCost)) || n.options[0];
      const cost = Number(o.cost?.cash || 0);
      const r = o.reward || {};
      cash -= cost;
      if (r.critMultiplier && cost > 0) cash += Math.max(cost * r.critMultiplier, Number(r.cash || 0));
      else cash += Number(r.cash || 0);
      for (const id of [r.unlockAsset, r.equipCar]) if (id) worth += assetVal[id] || 0;
      worth += Number(r.affectionGain || 0) * 5000;
      walk(o.branchNodes);
    }
  };
  walk(ep.nodes);
  return { cash, worth };
}
const STORY = episodes.map(storyDelta);

const rng = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const tierOf = (nw) => tiers.reduce((t, x) => (nw >= x.minNetWorth ? x : t), tiers[0]).tier;
const SESSIONS = { 4: [8, 13, 18, 24], 2: [8, 24] };

/**
 * One player. gates[i] = requireNetWorth of episode i. Stops after `maxSessions` sessions.
 * Returns { unlockAt[i] (hours), netWorth, spendStats }.
 */
function simulate({ gates, sessionsPerDay, seed = 1, days = 40, maxSessions = Infinity }) {
  const rand = rng(seed);
  const p = { cash: 12000, charge: 40, assetWorth: 182000, biz: {}, props: new Set(['prop_old_room']), done: 0 };
  const unlockAt = [];
  let lastCollect = 0;
  let sessions = 0;
  let maxSessionGrowth = 1;

  const bizDef = (id) => businesses.find((b) => b.id === id);
  const propDef = (id) => properties.find((x) => x.id === id);
  const netWorth = () =>
    p.cash +
    p.assetWorth +
    Object.entries(p.biz).reduce((s, [id, lv]) => s + bizDef(id).baseValuation * (1 + 0.45 * (lv - 1)), 0) +
    [...p.props].reduce((s, id) => s + propDef(id).baseValuation, 0);
  const income = () =>
    Object.entries(p.biz).reduce((s, [id, lv]) => s + bizDef(id).baseIncomePerHour * (1 + 0.45 * (lv - 1)), 0) +
    [...p.props].filter((id) => id !== 'prop_old_room').reduce((s, id) => s + (propDef(id).rentPerHour || 0), 0);

  const spend = (cost) => {
    const nw = netWorth();
    p.cash -= cost;
    let mult = 0;
    if (p.charge >= 100) {
      const r = rand();
      mult = r < 0.08 ? 10 : r < 0.35 ? 5 : 3;
      p.charge = 0;
    } else if (rand() < CRIT.baseProb) {
      const r = rand();
      mult = r < 0.05 ? 10 : r < 0.25 ? 5 : 2;
      p.charge = Math.min(100, p.charge + CRIT.chargeOnCrit);
    } else {
      const gain = Math.round((cost / Math.max(1, nw)) * CRIT.chargeScale);
      p.charge = Math.min(100, p.charge + Math.max(CRIT.chargeMin, Math.min(CRIT.chargeMax, gain)));
    }
    p.cash += cost * mult;
  };

  const invest = () => {
    for (let guard = 0; guard < 600; guard++) {
      const tier = tierOf(netWorth());
      const opts = [];
      for (const b of businesses) {
        if (b.unlockTier > tier) continue;
        const lv = p.biz[b.id];
        if (!lv) opts.push({ cost: b.buyCost, gain: b.baseValuation + b.baseIncomePerHour * 24, act: () => (p.biz[b.id] = 1) });
        else {
          const cost = Math.round(b.upgradeBaseCost * Math.pow(1.45, lv - 1));
          opts.push({ cost, gain: (b.baseValuation + b.baseIncomePerHour * 24) * 0.45, act: () => (p.biz[b.id] = lv + 1) });
        }
      }
      for (const x of properties) {
        if (p.props.has(x.id) || !x.price || (x.unlockTier || 1) > tier) continue;
        opts.push({ cost: x.price, gain: x.baseValuation + (x.rentPerHour || 0) * 24, act: () => p.props.add(x.id) });
      }
      // a sensible player only makes purchases that pay back (valuation + a day of income ≥ cost)
      const best = opts
        .filter((o) => o.cost <= p.cash && o.gain >= o.cost)
        .sort((a, b) => b.gain / b.cost - a.gain / a.cost)[0];
      if (!best) return;
      spend(best.cost);
      best.act();
    }
  };

  const readStory = (t) => {
    while (p.done < episodes.length && netWorth() >= (gates[p.done] ?? 0)) {
      if (unlockAt[p.done] === undefined) unlockAt[p.done] = t;
      p.cash += STORY[p.done].cash;
      p.assetWorth += STORY[p.done].worth;
      p.done += 1;
    }
  };

  outer: for (let day = 0; day < days; day++) {
    for (const [i, h] of SESSIONS[sessionsPerDay].entries()) {
      if (sessions++ >= maxSessions) break outer;
      const t = day * 24 + h - 8;
      p.cash += income() * Math.min(12, t - lastCollect);
      lastCollect = t;
      if (i === 0) p.cash += dailyCash;
      readStory(t);
      const before = netWorth();
      invest();
      maxSessionGrowth = Math.max(maxSessionGrowth, netWorth() / before);
      readStory(t);
    }
    if (p.done >= episodes.length && maxSessions === Infinity) break;
  }
  return { unlockAt, netWorth: netWorth(), maxSessionGrowth };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}亿` : n >= 1e4 ? `${(n / 1e4).toFixed(0)}万` : `${n}`);
const when = (h) => (h >= 1e9 ? '   >40d' : `D${Math.floor(h / 24) + 1} ${String(Math.round((h % 24) + 8) % 24).padStart(2, '0')}:00`);
const SEEDS = Array.from({ length: 41 }, (_, i) => i + 1);

function report(gates, label) {
  console.log(`\n== ${label}`);
  console.log('episode    gate       engaged     casual');
  const E = SEEDS.map((seed) => simulate({ gates, sessionsPerDay: 4, seed }));
  const C = SEEDS.map((seed) => simulate({ gates, sessionsPerDay: 2, seed }));
  episodes.forEach((ep, i) => {
    const e = median(E.map((r) => r.unlockAt[i] ?? 1e9));
    const c = median(C.map((r) => r.unlockAt[i] ?? 1e9));
    console.log(`${ep.episodeId}  ${fmt(gates[i] || 0).padStart(8)}  ${when(e).padStart(10)}  ${when(c).padStart(10)}`);
  });
  console.log(`largest single-session net-worth jump (median): ×${median(E.map((r) => r.maxSessionGrowth)).toFixed(2)}`);
}

// When (hours since first launch, engaged player) each chapter should open.
// Prologue + first two acts flow freely; vol1 ≈ day 1–2, vol2 ≈ day 3–6, vol3 ≈ day 7–12.
export const TARGET_HOURS = {
  ep_006: 5, ep_007: 10, ep_008: 16, ep_009: 24, ep_010: 29, ep_011: 34,
  ep_012: 48, ep_013: 53, ep_014: 58, ep_015: 72, ep_016: 77, ep_017: 82, ep_018: 96, ep_019: 101, ep_020: 106, ep_021: 120,
  ep_022: 144, ep_023: 168, ep_024: 192, ep_025: 216, ep_026: 240, ep_027: 264, ep_028: 288,
};

const nice = (n) => {
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.floor(n / mag) * mag;
};

function suggest() {
  const gates = episodes.map(() => 0);
  episodes.forEach((ep, i) => {
    const T = TARGET_HOURS[ep.episodeId];
    if (T === undefined) return;
    const idx = Math.floor(T / 24) * 4 + SESSIONS[4].findLastIndex((h) => h - 8 <= T % 24) + 1;
    const g = [...gates];
    g[i] = Infinity;
    const nws = SEEDS.map((seed) => simulate({ gates: g, sessionsPerDay: 4, seed, maxSessions: idx }).netWorth);
    gates[i] = Math.max(gates[i - 1] || 0, nice(median(nws) * 0.9));
  });
  return gates;
}

const current = episodes.map((e) => Number(e.requireNetWorth || 0));
report(current, 'gates in content/stories/stories.json');
if (process.argv.includes('--suggest')) {
  const g = suggest();
  report(g, 'suggested gates');
  console.log('\nsuggested requireNetWorth:\n' + JSON.stringify(Object.fromEntries(episodes.map((e, i) => [e.episodeId, g[i]]))));
}
