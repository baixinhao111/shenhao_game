const m = await import(new URL('../../server/dist/minigames.js', import.meta.url).href);
const { generateStone, stoneTrueValue, jadeMarketEstimate, handValue, simulateLive, sanitizeLiveActions } = m._test;
const cost = { 1: 50000, 2: 300000, 3: 1500000 };
for (const tier of [1, 2, 3]) {
  let sum = 0, rock = 0, imp = 0, N = 20000, early = 0;
  for (let i = 0; i < N; i++) {
    const st = generateStone(tier, 0);
    sum += stoneTrueValue(st, cost[tier]);
    if (st.grade === 'rock') rock++;
    if (st.grade === 'imperial') imp++;
    // naive strategy: reveal a random 10% patch then sell at market estimate
    let mask = '';
    const x0 = Math.floor(Math.random() * 25), y0 = Math.floor(Math.random() * 16);
    for (let k = 0; k < 600; k++) { const x = k % 30, y = Math.floor(k / 30); mask += (x >= x0 && x < x0 + 6 && y >= y0 && y < y0 + 4) ? '1' : '0'; }
    early += jadeMarketEstimate(st, cost[tier], mask).base;
  }
  console.log(`tier${tier} fullEV=${(sum / N / cost[tier]).toFixed(2)}x  earlySellEV=${(early / N / cost[tier]).toFixed(2)}x rock=${(rock / N * 100).toFixed(0)}% imperial=${(imp / N * 100).toFixed(1)}%`);
}
console.log('bj', handValue([{ r: 'A', s: '♠' }, { r: 'K', s: '♠' }]).total, handValue([{ r: 'A', s: '♠' }, { r: 'A', s: '♠' }, { r: '9', s: '♠' }]).total);
const opp = []; for (let t = 1.2; t < 25; t += 2) opp.push({ t, power: 5.5 }); opp.push({ t: 26.5, power: 66 });
const smart = sanitizeLiveActions([...Array.from({ length: 6 }, (_, i) => ({ t: 3 + i * 3, type: 'carnival' })), { t: 27.2, type: 'finisher' }, ...Array.from({ length: 10 }, (_, i) => ({ t: 27.5 + i * 0.15, type: 'heart' }))]);
const dump = sanitizeLiveActions([{ t: 1, type: 'finisher' }, ...Array.from({ length: 7 }, (_, i) => ({ t: 2 + i * 2.6, type: 'carnival' }))]);
console.log('live smart bar', simulateLive({ opp }, smart).toFixed(1), 'dump-early bar', simulateLive({ opp }, dump).toFixed(1), 'none', simulateLive({ opp }, []).toFixed(1));
