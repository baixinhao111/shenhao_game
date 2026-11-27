// End-to-end API tests for the new minigame + negotiation endpoints.
const BASE = 'http://localhost:3080/api';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL:', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mk() {
  let token = '';
  const api = async (path, body, method) => {
    const r = await fetch(BASE + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...d };
  };
  const reg = await api('/auth/register', { username: 't' + Date.now() + Math.floor(Math.random() * 1e4), password: '123456', nickname: '测' });
  token = reg.token;
  return { api, state: reg.state };
}
function firstChoices(nodes, out = []) {
  for (const n of nodes || []) if (n.type === 'system_choice' && n.options?.length) {
    const o = n.options.find((x) => !(x.cost?.cash || x.cashCost)) || n.options[0];
    out.push(o.id); firstChoices(o.branchNodes, out);
  }
  return out;
}
async function progressed() {
  const u = await mk();
  for (const ep of u.state.stories.volumes.flatMap((v) => v.episodes)) {
    const st = (await u.api('/state')).state;
    if (st.player.energy < 40) await u.api('/system/mall/buy', { itemId: 'item_energy_drink' });
    const ids = firstChoices(ep.nodes);
    const r = await u.api('/story/complete', { episodeId: ep.episodeId, choiceId: ids[0] || '', choiceIds: ids });
    if (!r.ok) break;
  }
  for (let k = 0; k < 6; k++) await u.api('/system/mall/buy', { itemId: 'item_energy_drink' });
  return u;
}
const cash = async (u) => (await u.api('/state')).state.player.cash;
const pts = async (u) => (await u.api('/state')).state.player.sysPoints;

// ---------- fresh player: insufficient funds / validation ----------
console.log('== validation (fresh player)');
{
  const u = await mk();
  let r = await u.api('/mg/jade/start', { tier: 3 });
  ok(!r.ok && /现金不足/.test(r.error), 'jade tier3 needs cash: ' + r.error);
  r = await u.api('/mg/jade/start', { tier: 7 });
  ok(!r.ok && /档位/.test(r.error), 'invalid tier rejected');
  r = await u.api('/mg/stock/open', { stockId: 'stk_tech', direction: 'long', amount: 12345 });
  ok(!r.ok, 'invalid stock amount rejected');
  r = await u.api('/mg/race/finish', { id: 'nope', hits: [1, 1, 1, 1] });
  ok(!r.ok && /过期/.test(r.error), 'unknown session rejected');
  r = await u.api('/deal/start', { kind: 'business', id: 'biz_hotel' });
  ok(!r.ok && /阶层/.test(r.error), 'deal tier gate: ' + r.error);
  r = await u.api('/minigame/jade/cut', { tier: 1 });
  ok(r.status === 404 || !r.ok, 'old endpoint removed');
}

const u = await progressed();
const K = (await u.api('/state')).state.player.stakeScale || 1; // stakes scale with tier
const st0 = (await u.api('/state')).state;
console.log('== progressed player tier', st0.player.tier?.tier, 'cash', st0.player.cash, 'energy', st0.player.energy, 'pts', st0.player.sysPoints);

// ---------- jade ----------
console.log('== jade');
{
  const c0 = await cash(u);
  let r = await u.api('/mg/jade/start', { tier: 2 });
  ok(r.ok && r.session.cells.length === 600, 'jade start');
  ok((await cash(u)) === c0 - 300000 * K, 'jade cost deducted');
  const id = r.session.id; const cells = r.session.cells;
  ok(r.offers.length === 3 && r.offers.every((o) => o.offer > 0), 'initial offers');
  let mask = '0'.repeat(600);
  r = await u.api('/mg/jade/appraise', { id, mask: '01' });
  ok(!r.ok, 'bad mask rejected');
  // reveal the middle band
  mask = Array.from({ length: 600 }, (_, i) => (Math.floor(i / 30) >= 8 && Math.floor(i / 30) < 12 ? '1' : '0')).join('');
  r = await u.api('/mg/jade/appraise', { id, mask });
  ok(r.ok && r.revealed === 20, 'appraise revealed% = ' + r.revealed);
  // un-reveal attempt must not lower revealed
  r = await u.api('/mg/jade/appraise', { id, mask: '0'.repeat(600) });
  ok(r.ok && r.revealed === 20, 'mask is monotonic');
  r = await u.api('/mg/jade/vision', { id });
  ok(r.ok && r.heat.length === 24, 'vision heat map');
  r = await u.api('/mg/jade/vision', { id });
  ok(!r.ok, 'vision only once');
  const full = '1'.repeat(600);
  r = await u.api('/mg/jade/appraise', { id, mask: full });
  const best = r.offers.reduce((a, b) => (b.offer > a.offer ? b : a));
  const c1 = await cash(u);
  r = await u.api('/mg/jade/sell', { id, mask: full, buyer: best.id });
  ok(r.ok && r.result.payout === best.offer, 'sold at quoted offer');
  ok((await cash(u)) === c1 + best.offer, 'payout credited');
  console.log('   grade', r.result.grade, 'payout', r.result.payout, 'true', r.result.trueValue, 'jade cells', [...cells].filter((c) => c === 'j').length);
  r = await u.api('/mg/jade/sell', { id, mask: full, buyer: 'zhou' });
  ok(!r.ok, 'double sell rejected');
  // abandon -> auto settle on next start
  r = await u.api('/mg/jade/start', { tier: 1 });
  const c2 = await cash(u);
  const r2 = await u.api('/mg/jade/start', { tier: 1 });
  ok(r2.ok, 'second start');
  const c3 = await cash(u);
  ok(c3 > c2 - 50000, 'abandoned stone auto-sold (cash ' + (c3 - c2) + ')');
  r = await u.api('/mg/jade/collect', { id: r2.session.id, mask: full });
  ok(r2.session.grade === 'imperial' ? r.ok || /展柜/.test(r.error) : !r.ok, 'collect only for imperial: ' + (r.error || 'ok'));
}

// ---------- stocks ----------
console.log('== stocks');
{
  const q = await u.api('/minigame/stocks');
  const s = q.quotes[0];
  const c0 = await cash(u);
  let r = await u.api('/mg/stock/open', { stockId: s.id, direction: 'long', amount: 300000 * K });
  ok(r.ok && r.session.path.length === 41, 'stock open');
  const id = r.session.id;
  r = await u.api('/mg/stock/close', { id, tick: 40 });
  ok(r.ok && r.result.tick <= 2, 'cannot close in the future (tick ' + r.result?.tick + ')');
  ok((await cash(u)) === c0 - 300000 * K + r.result.payout, 'stock payout consistent');
  r = await u.api('/mg/stock/open', { stockId: s.id, direction: 'short', amount: 100000 * K });
  await sleep(3200);
  r = await u.api('/mg/stock/close', { id: r.session.id, tick: 4 });
  ok(r.ok && r.result.tick === 4, 'close at elapsed tick');
}

// ---------- race ----------
console.log('== race');
{
  let r = await u.api('/mg/race/start', { stake: 100000 * K });
  ok(r.ok && r.session.segments.length === 4, 'race start');
  let f = await u.api('/mg/race/finish', { id: r.session.id, hits: [1, 1, 1, 1] });
  ok(f.ok && f.result.win === false && f.result.accs.every((a) => a === 0), 'instant finish counts as zero');
  r = await u.api('/mg/race/start', { stake: 100000 * K });
  await sleep(4200);
  f = await u.api('/mg/race/finish', { id: r.session.id, hits: [1, 1, 1, 1] });
  ok(f.ok && f.result.win && f.result.perfect && f.result.payout === 280000 * K, 'perfect run pays 2.8x');
  r = await u.api('/mg/race/start', { stake: 100000 * K });
  await sleep(4200);
  f = await u.api('/mg/race/finish', { id: r.session.id, hits: [5, -2, 'x', 0.5] });
  ok(f.ok && f.result.accs.join(',') === '1,0,0,0.5', 'hits clamped: ' + f.result.accs);
}

// ---------- angel ----------
console.log('== angel');
{
  let r = await u.api('/mg/angel/start', {});
  ok(r.ok && r.session.pitches.length === 3 && r.session.pitches.every((p) => p.fact === null), 'angel start hides facts');
  const id = r.session.id;
  r = await u.api('/mg/angel/ask', { id, index: 0 });
  ok(r.ok && r.pitch.fact && r.questions === 1, 'ask reveals fact');
  r = await u.api('/mg/angel/ask', { id, index: 0 });
  ok(!r.ok, 'cannot ask same twice');
  r = await u.api('/mg/angel/ask', { id, index: 1 });
  r = await u.api('/mg/angel/ask', { id, index: 2 });
  ok(!r.ok && /用完/.test(r.error), 'only two questions');
  const p0 = await pts(u);
  r = await u.api('/mg/angel/hint', { id });
  ok(r.ok && /天枢判定/.test(r.hint) && (await pts(u)) === p0 - 15, 'hint costs 15 pts');
  const c0 = await cash(u);
  r = await u.api('/mg/angel/invest', { id, index: 1, amount: 500000 * K });
  ok(r.ok && (await cash(u)) === c0 - 500000 * K + r.result.payout, 'invest payout consistent (' + r.result.type + ' x' + r.result.mult + ')');
}

// ---------- livestream ----------
console.log('== livestream (waits 26s)');
{
  let r = await u.api('/mg/live/start', { budget: 300000 * K });
  ok(r.ok && r.session.opp.length > 5 && r.session.warnAt > 20, 'live start');
  const s = r.session;
  let f = await u.api('/mg/live/finish', { id: s.id, actions: [] });
  ok(!f.ok && /没结束/.test(f.error), 'cannot finish early');
  await sleep(25500);
  const c0 = await cash(u);
  const acts = [
    ...[3, 6, 9].map((t) => ({ t, type: 'carnival' })),
    { t: s.doubleAt + 0.2, type: 'carnival' }, { t: s.doubleAt + 2.75, type: 'carnival' },
    { t: 23, type: 'carnival' }, { t: 24.5, type: 'carnival' },
    { t: (s.counter.from + s.counter.to) / 2, type: 'finisher' },
    { t: 29.5, type: 'finisher' }, // second finisher must be ignored
    ...Array.from({ length: 200 }, (_, i) => ({ t: 28 + 0.01 * i, type: 'heart' })), // spam must be rate limited
  ];
  f = await u.api('/mg/live/finish', { id: s.id, actions: acts });
  ok(f.ok, 'live finish ' + (f.error || ''));
  ok(f.result.spent <= 300000 * K && f.result.spent + f.result.refund === 300000 * K, 'budget accounting spent=' + f.result.spent);
  ok(f.result.win, 'smart timing wins (bar ' + f.result.finalBar.toFixed(1) + ')');
  const crit = f.result.crit?.cashback || 0;
  ok((await cash(u)) === c0 + f.result.refund + crit, 'refund + crit credited');
}

// ---------- cruise ----------
console.log('== cruise');
{
  let played = 0;
  for (let k = 0; k < 6; k++) {
    let r = await u.api('/mg/cruise/start', {});
    if (!r.ok) { ok(k === 5 && /用完/.test(r.error), 'daily limit at 5: ' + r.error); break; }
    played++;
    let h = r.hand;
    if (!h.done) {
      ok(h.dealer[1].r === '?', 'hole card hidden');
      if (k === 0) {
        r = await u.api('/mg/cruise/action', { id: h.id, action: 'vision' });
        ok(r.ok && r.hand.dealer[1].r !== '?', 'vision reveals hole');
        h = r.hand;
      }
      while (!h.done && h.playerTotal < 17) { r = await u.api('/mg/cruise/action', { id: h.id, action: 'hit' }); h = r.hand; }
      if (!h.done) { r = await u.api('/mg/cruise/action', { id: h.id, action: 'stand' }); h = r.hand; }
    }
    ok(h.done && h.result && ['blackjack', 'win', 'push', 'lose'].includes(h.result.outcome), 'hand settled: ' + h.result?.outcome + ' P' + h.playerTotal + ' D' + h.dealerTotal);
    const r2 = await u.api('/mg/cruise/action', { id: h.id, action: 'hit' });
    ok(!r2.ok, 'no actions after settle');
  }
  ok(played === 5, 'played 5 hands');
}

// ---------- negotiation ----------
console.log('== negotiation');
{
  const st = (await u.api('/state')).state;
  const target = st.businesses.find((b) => !b.owned && st.player.tier.tier >= b.unlockTier && b.buyCost <= st.player.cash);
  ok(!!target, 'has a business to negotiate: ' + target?.name);
  let r = await u.api('/deal/start', { kind: 'business', id: target.id });
  ok(r.ok && r.deal.ask > target.buyCost && r.deal.log.length >= 2, 'deal start, ask above list');
  let d = r.deal;
  r = await u.api('/deal/act', { id: d.id, action: 'offer', price: target.buyCost * 0.1 });
  ok(!r.ok && /太低/.test(r.error), 'absurd lowball refused');
  r = await u.api('/deal/act', { id: d.id, action: 'mindread' });
  ok(r.ok && r.deal.reveal.range, 'mindread reveals range');
  d = r.deal;
  r = await u.api('/deal/act', { id: d.id, action: 'funds' });
  ok(r.ok && r.deal.cards.funds.used, 'funds card');
  r = await u.api('/deal/act', { id: d.id, action: 'funds' });
  ok(!r.ok, 'card only once');
  const hero = r.ok ? null : (await u.api('/state')).state.heroines.find((h) => h.unlocked);
  if (hero) {
    r = await u.api('/deal/act', { id: d.id, action: 'heroine', heroineId: hero.id });
    ok(r.ok && r.deal.log.some((l) => l.who === 'ally'), 'heroine assist ' + hero.id);
    if (r.deal.done) console.log('   deal ended by assist');
  }
  d = r.deal || d;
  // offer at upper end of mindread range -> should close
  const c0 = await cash(u);
  const offer = d.reveal.range ? d.reveal.range[1] : d.ask;
  r = await u.api('/deal/act', { id: d.id, action: 'offer', price: offer });
  if (r.ok && r.deal.done && r.deal.result.success) {
    const paid = r.deal.result.price; const crit = r.deal.result.critResult?.cashback || 0;
    ok((await cash(u)) === c0 - paid + crit, 'deal price charged (' + r.deal.result.savedPct + '% off)');
    const owned = (await u.api('/state')).state.businesses.find((b) => b.id === target.id).owned;
    ok(owned, 'business owned after deal');
  } else {
    console.log('   offer result', r.error || r.deal?.log?.slice(-2));
    ok(r.ok, 'offer accepted or countered');
  }
  // walk-away + cooldown
  const st2 = (await u.api('/state')).state;
  const t2 = st2.businesses.find((b) => !b.owned && st2.player.tier.tier >= b.unlockTier && b.buyCost * 0.6 <= st2.player.cash);
  if (t2) {
    r = await u.api('/deal/start', { kind: 'business', id: t2.id });
    r = await u.api('/deal/act', { id: r.deal.id, action: 'leave' });
    ok(r.ok && r.deal.done && !r.deal.result.success, 'leave ends deal');
    r = await u.api('/deal/start', { kind: 'business', id: t2.id });
    ok(!r.ok && /分钟后/.test(r.error), 'cooldown after walk-away');
  }
  // lowball until seller walks
  const st3 = (await u.api('/state')).state;
  const p3 = st3.properties.find((p) => !p.owned && p.price > 0 && st3.player.tier.tier >= p.unlockTier && p.price * 0.6 <= st3.player.cash);
  if (p3) {
    r = await u.api('/deal/start', { kind: 'property', id: p3.id });
    let dd = r.deal, n = 0;
    while (!dd.done && n++ < 10) { r = await u.api('/deal/act', { id: dd.id, action: 'offer', price: p3.price * 0.45 }); dd = r.deal; }
    ok(dd.done && !dd.result.success, 'repeated lowballs make seller walk (' + n + ' offers)');
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
