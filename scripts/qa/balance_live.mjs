const { _test } = await import(new URL('../../server/dist/minigames.js', import.meta.url).href);
const { simulateLive, sanitizeLiveActions } = _test;
let res = { smart: 0, naive: 0, none: 0, counterOnly: 0, doubleOnly: 0 }; const N = 4000;
for (let k = 0; k < N; k++) {
  const opp = []; for (let t = 1.2; t < 25; t += 1.6 + Math.random() * 0.8) opp.push({ t, power: 6 + Math.floor(Math.random() * 4) });
  const spikeAt = 25.5 + Math.random() * 2; opp.push({ t: spikeAt, power: 60 + Math.floor(Math.random() * 13) });
  const doubleAt = 14 + Math.random() * 6; const d = { opp, spikeAt, doubleAt };
  const naive = sanitizeLiveActions([{ t: 1, type: 'finisher' }, ...Array.from({ length: 7 }, (_, i) => ({ t: 0.5 + i * 2.5, type: 'carnival' }))]);
  const smart = sanitizeLiveActions([{ t: doubleAt + 0.2, type: 'carnival' }, { t: doubleAt + 2.75, type: 'carnival' }, ...[3, 6, 20, 23, 24.6].map(t => ({ t, type: 'carnival' })), { t: spikeAt - 0.3, type: 'finisher' }]);
  if (simulateLive(d, smart) > 50) res.smart++;
  if (simulateLive(d, naive) > 50) res.naive++;
  if (simulateLive(d, []) > 50) res.none++;
  const counterOnly = sanitizeLiveActions([...[2, 5, 8, 11, 14, 17, 20].map(t => ({ t, type: 'carnival' })), { t: spikeAt - 0.3, type: 'finisher' }].filter(a => !(a.type==='carnival' && a.t>=doubleAt && a.t<=doubleAt+3)).concat([]));
  if (simulateLive(d, counterOnly) > 50) res.counterOnly++;
  const doubleOnly = sanitizeLiveActions([{ t: 1, type: 'finisher' }, { t: doubleAt + 0.2, type: 'carnival' }, { t: doubleAt + 2.75, type: 'carnival' }, ...[3, 6, 20, 23, 24.6].map(t => ({ t, type: 'carnival' }))]);
  if (simulateLive(d, doubleOnly) > 50) res.doubleOnly++;
}
console.log('win rates', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, (v / N * 100).toFixed(0) + '%'])));
