// Screenshots of the district small maps (spots + sheets) and the 产业 page on a progressed account.
// usage: node scripts/qa/map_assets.playwright.cjs OUT_DIR
const { chromium } = require('playwright');
const BASE = 'http://localhost:3080/api';
const out = process.argv[2] || 'ma';
let token = '';
async function api(path, body) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function firstChoices(nodes, o = []) { for (const n of nodes || []) if (n.type === 'system_choice' && n.options?.length) { const x = n.options.find((y) => !(y.cost?.cash || y.cashCost)) || n.options[0]; o.push(x.id); firstChoices(x.branchNodes, o); } return o; }
(async () => {
  const reg = await api('/auth/register', { username: 'ma' + Date.now(), password: '123456', nickname: '陆沉' });
  token = reg.token;
  for (const ep of reg.state.stories.volumes.flatMap((v) => v.episodes)) {
    const st = (await api('/state')).state;
    if (st.player.energy < 40) await api('/system/mall/buy', { itemId: 'item_energy_drink' });
    const ids = firstChoices(ep.nodes);
    const r = await api('/story/complete', { episodeId: ep.episodeId, choiceId: ids[0] || '', choiceIds: ids });
    if (r.error) break;
  }
  for (let k = 0; k < 8; k++) await api('/system/mall/buy', { itemId: 'item_energy_drink' });
  for (let k = 0; k < 400; k++) {
    const st = (await api('/state')).state;
    if (st.player.tier.tier >= 3) break;
    const buy = st.businesses.find((x) => !x.owned && x.unlockTier <= st.player.tier.tier && x.buyCost <= st.player.cash);
    if (buy) { await api('/business/buy', { businessId: buy.id }); continue; }
    const up = st.businesses.filter((x) => x.owned && x.upgradeCost <= st.player.cash).sort((a, b) => a.upgradeCost - b.upgradeCost)[0];
    if (!up) break;
    await api('/business/upgrade', { businessId: up.id });
  }
  await api('/asset/buy', { assetId: 'car_used_ev' });
  // a few more upgrades so the skyline shows different heights
  for (let k = 0; k < 6; k++) {
    const st = (await api('/state')).state;
    const up = st.businesses.filter((x) => x.owned && x.upgradeCost <= st.player.cash).sort((a, b) => a.upgradeCost - b.upgradeCost)[k % 2];
    if (up) await api('/business/upgrade', { businessId: up.id });
  }
  console.log('tier', (await api('/state')).state.player.tier.tier);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 852 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript((t) => localStorage.setItem('tianshu_token', t), token);
  const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
  const nav = async (l) => { await p.locator('nav button', { hasText: l }).first().click(); await p.waitForTimeout(900); };
  const tap = async (txt, wait = 700) => { await p.locator('button', { hasText: txt }).first().click(); await p.waitForTimeout(wait); };
  const close = async () => { await p.locator('button[aria-label="关闭"]').first().click(); await p.waitForTimeout(500); };
  await p.goto('http://localhost:3080'); await p.waitForTimeout(1800);
  await nav('海城'); await shot('m0_city');
  await tap('城南旧街', 400); await tap('前往', 1600); await shot('m1_old_street');
  await tap('老码头车行', 800); await shot('m2_showroom'); await close();
  await tap('老茶馆', 800); await tap('去坐坐', 1400); await shot('m3_visit'); await close();
  await tap('云起古玩轩', 800); await shot('m4_business'); await close();
  await tap('深夜大排档', 800); await shot('m5_date'); await close();
  for (const [name, id] of [['海城大学城', 'university'], ['外滩名利场', 'bund'], ['陆家湾', 'cbd'], ['星耀不夜城', 'night_city'], ['云顶海岸', 'peak_coast']]) {
    await p.locator('button:has(svg.lucide-arrow-left)').first().click(); await p.waitForTimeout(700);
    await tap(name, 400); await tap('前往', 1600); await shot('m_' + id);
  }
  await tap('云顶游艇会', 800); await shot('m6_marina'); await close();
  await nav('产业'); await shot('a2_biz');
  await p.mouse.wheel(0, 600); await p.waitForTimeout(500); await shot('a2b_biz_scroll');
  await p.locator('button', { hasText: '全城物业' }).first().click(); await p.waitForTimeout(900); await shot('a3_props');
  await p.mouse.wheel(0, 700); await p.waitForTimeout(500); await shot('a3b_props_scroll');
  await p.locator('button', { hasText: '座驾藏品' }).first().click(); await p.waitForTimeout(900); await shot('a1_garage');
  await p.mouse.wheel(0, 600); await p.waitForTimeout(500); await shot('a1b_garage_scroll');
  await p.mouse.wheel(0, 900); await p.waitForTimeout(500); await shot('a1c_garage_scroll');
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
