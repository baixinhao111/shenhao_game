// Browser run through every minigame scene + negotiation on a progressed account.
const { chromium } = require('playwright');
const BASE = 'http://localhost:3080/api';
const out = process.argv[2] || 'sc';
const only = (process.argv[3] || 'jade,stock,race,angel,cruise,deal,live').split(',');
let token = '';
async function api(path, body) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function firstChoices(nodes, o = []) { for (const n of nodes || []) if (n.type === 'system_choice' && n.options?.length) { const x = n.options.find((y) => !(y.cost?.cash || y.cashCost)) || n.options[0]; o.push(x.id); firstChoices(x.branchNodes, o); } return o; }
(async () => {
  // registered as GM (local default secret) so the run can mail itself a top-up when investing stalls
  const reg = await api('/auth/register', { username: 'sc' + Date.now(), password: '123456', nickname: '陆沉', adminSecret: process.env.ADMIN_SECRET || 'tianshu_gm_2026' });
  token = reg.token;
  for (const ep of reg.state.stories.volumes.flatMap((v) => v.episodes)) {
    const st = (await api('/state')).state;
    if (st.player.energy < 40) await api('/system/mall/buy', { itemId: 'item_energy_drink' });
    const ids = firstChoices(ep.nodes);
    const r = await api('/story/complete', { episodeId: ep.episodeId, choiceId: ids[0] || '', choiceIds: ids });
    if (r.error) break;
  }
  for (let k = 0; k < 8; k++) await api('/system/mall/buy', { itemId: 'item_energy_drink' });
  // story gates now need investment: reinvest until 阶层 3 so every district (云顶海岸 etc.) is open
  for (let k = 0; k < 400; k++) {
    const st = (await api('/state')).state;
    // only the cruise needs 阶层 3 (云顶海岸); higher tiers also scale stakes ×30, so stay at 2 otherwise
    if (st.player.tier.tier >= (only.includes('cruise') ? 3 : 2)) break;
    const own = st.businesses.filter((x) => x.owned);
    const buy = st.businesses.find((x) => !x.owned && x.unlockTier <= st.player.tier.tier && x.buyCost <= st.player.cash);
    if (buy) { await api('/business/buy', { businessId: buy.id }); continue; }
    const up = own.filter((x) => x.upgradeCost <= st.player.cash).sort((a, b) => a.upgradeCost - b.upgradeCost)[0];
    if (!up) {
      // story gates are tuned for days of play; top up the test account instead of waiting
      await api('/admin/mail/send', { targetUserId: st.user.id, title: 'QA', cash: 30000000 });
      const mail = ((await api('/state')).state.mails || []).find((m) => !m.claimed && m.title === 'QA');
      if (!mail) break;
      await api('/mail/claim', { mailId: mail.id });
      continue;
    }
    await api('/business/upgrade', { businessId: up.id });
  }
  {
    // pocket money for the stakes (×stakeScale at this tier); stays below the next tier's threshold
    const st = (await api('/state')).state;
    const room = (st.player.nextTier?.minNetWorth || Infinity) - st.player.netWorth;
    const amount = Math.max(0, Math.min(200000000, Math.floor(room * 0.8)));
    if (amount > 0) {
      await api('/admin/mail/send', { targetUserId: st.user.id, title: 'QA', cash: amount });
      const mail = ((await api('/state')).state.mails || []).find((m) => !m.claimed && m.title === 'QA');
      if (mail) await api('/mail/claim', { mailId: mail.id });
    }
  }
  console.log('tier after investing:', (await api('/state')).state.player.tier.tier, 'cash', (await api('/state')).state.player.cash);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 852 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript((t) => localStorage.setItem('tianshu_token', t), token);
  const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
  const nav = async (l) => { await p.locator('nav button', { hasText: l }).first().click(); await p.waitForTimeout(800); };
  const tap = async (txt, wait = 700) => { await p.locator('button', { hasText: txt }).first().click(); await p.waitForTimeout(wait); };
  const home = async () => { await p.goto('http://localhost:3080'); await p.waitForTimeout(1500); };
  // district small map: the venue is the first spot in the bottom index dock (kind label 玩法); its sheet button reads 进入<label>
  const enter = async (district, label) => { await home(); await nav('海城'); await tap(district, 400); await tap('前往', 1200); await tap('玩法', 600); await tap(label, 1000); };

  if (only.includes('jade')) {
    await enter('城南旧街', '古玩赌石');
    await shot('jade_1_pick');
    await tap('莫西沙料', 1500);
    await shot('jade_2_fresh');
    const box = await p.locator('canvas').nth(1).boundingBox();
    for (let row = 0; row < 3; row++) {
      await p.mouse.move(box.x + 20, box.y + box.height * (0.35 + row * 0.12));
      await p.mouse.down();
      for (let k = 0; k <= 12; k++) await p.mouse.move(box.x + 20 + (box.width - 40) * (k / 12), box.y + box.height * (0.35 + row * 0.12) + (k % 2) * 6);
      await p.mouse.up();
      await p.waitForTimeout(300);
    }
    await p.waitForTimeout(900);
    await shot('jade_3_scratched');
    await p.locator('text=周老').first().click(); await p.waitForTimeout(400);
    await shot('jade_4_selected');
    await p.locator('button', { hasText: '卖给' }).first().click(); await p.waitForTimeout(500);
    await shot('jade_5_sold_fly');
    await p.waitForTimeout(1500);
    await shot('jade_6_result');
  }
  if (only.includes('stock')) {
    await enter('陆家湾 CBD', '海城股市');
    await shot('stock_1_pick');
    await p.locator('button', { hasText: '天枢芯科' }).first().click();
    await p.waitForTimeout(300);
    await p.locator('button', { hasText: '开仓' }).nth(1).click();
    await p.waitForTimeout(9000);
    await shot('stock_2_live');
    await tap('平仓', 1200);
    await shot('stock_3_result');
  }
  if (only.includes('race')) {
    await enter('外滩名利场', '江畔竞速');
    await shot('race_1_pick');
    await tap('切磋赛', 1200);
    for (let s = 0; s < 4; s++) {
      await p.waitForTimeout(1100 + Math.random() * 700);
      if (s === 1) await shot('race_2_gauge');
      await p.mouse.click(206, 520);
      await p.waitForTimeout(900);
    }
    await p.waitForTimeout(1500);
    await shot('race_3_result');
  }
  if (only.includes('angel')) {
    await enter('海城大学城', '天使投资');
    await shot('angel_1_pick');
    await tap('听路演', 1200);
    await shot('angel_2_bp');
    await tap('追问细节', 900);
    await tap('天枢判定', 900);
    await shot('angel_3_asked');
    await p.locator('button', { hasText: '投资' }).nth(1).click(); await p.waitForTimeout(1800);
    await shot('angel_4_result');
  }
  if (only.includes('cruise')) {
    await enter('云顶海岸', '星耀号');
    await shot('cruise_1_pick');
    await tap('发牌', 1500);
    await shot('cruise_2_hand');
    if (await p.locator('button', { hasText: '天枢透视' }).count()) { await tap('天枢透视', 900); }
    if (await p.locator('button', { hasText: '停牌' }).count()) await tap('停牌', 1500);
    await shot('cruise_3_result');
  }
  if (only.includes('deal')) {
    await home(); await nav('产业'); await tap('名下产业', 600);
    const deal = p.locator('button', { hasText: '谈判' });
    if (await deal.count()) {
      await deal.first().click(); await p.waitForTimeout(1600);
      await shot('deal_1_open');
      await tap('读心', 900);
      await tap('资金实力', 900);
      await shot('deal_2_cards');
      if (await p.locator('button', { hasText: '红颜助攻' }).count()) { await tap('红颜助攻', 500); await shot('deal_3_heroine'); await p.locator('button', { hasText: '苏清婉' }).first().click().catch(() => {}); await p.waitForTimeout(900); }
      await tap('出价', 1200);
      await shot('deal_4_after_offer');
    }
  }
  if (only.includes('live')) {
    await enter('星耀不夜城', '星耀打榜');
    await shot('live_1_pick');
    await tap('小试牛刀', 1000);
    for (let k = 0; k < 8; k++) { await p.locator('button', { hasText: '小心心' }).first().dispatchEvent('pointerdown'); await p.waitForTimeout(120); }
    await p.waitForTimeout(3000);
    await shot('live_2_mid');
    await p.waitForTimeout(23000);
    await shot('live_3_warn');
    await p.locator('button', { hasText: '绝杀' }).first().dispatchEvent('pointerdown');
    await p.waitForTimeout(6000);
    await shot('live_4_result');
  }
  console.log('errors:', errs.length ? errs.slice(0, 10) : 'none');
  await b.close();
})();
