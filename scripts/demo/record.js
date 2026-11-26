// Records a real playthrough from the local server for the static demo build.
const fs = require('fs');
const BASE = 'http://localhost:3080/api';
let token = '';
async function api(path, body, method) {
  const r = await fetch(BASE + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(path + ' ' + (d.error || r.status));
  return d;
}
function firstChoices(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.type === 'system_choice' && n.options?.length) {
      const opt = n.options.find((o) => !(o.cost?.cash || o.cashCost)) || n.options[0];
      out.push(opt.id);
      firstChoices(opt.branchNodes, out);
    }
  }
  return out;
}
(async () => {
  const reg = await api('/auth/register', { username: 'demo' + Date.now(), password: '123456', nickname: '陆沉' });
  token = reg.token;
  const rec = { initial: reg.state, steps: {}, extras: {} };
  const eps = reg.state.stories.volumes.flatMap((v) => v.episodes);
  for (const ep of eps) {
    const ids = firstChoices(ep.nodes);
    try {
      // keep energy / cash topped up the legit way where possible
      try { await api('/income/collect', {}, 'POST'); } catch {}
      const cur = await api('/state'); const en = (cur.state || cur).player.energy; for (let k = 0; k < (en < 30 ? 1 : 0); k++) { try { await api('/system/mall/buy', { itemId: 'item_energy_drink' }); } catch (e) { if (k === 0) console.log('  refill:', e.message); break; } }
      const res = await api('/story/complete', { episodeId: ep.episodeId, choiceId: ids[0] || '', choiceIds: ids });
      rec.steps[ep.episodeId] = res;
      console.log('done', ep.episodeId, ep.title, 'cash', res.state.player.cash, 'energy', res.state.player.energy);
    } catch (e) {
      console.log('stop at', ep.episodeId, e.message);
      break;
    }
  }
  rec.extras.moments = await api('/moments').catch(() => ({ moments: [] }));
  rec.extras.leaderboard = await api('/leaderboard').catch(() => ({}));
  rec.extras.stocks = await api('/minigame/stocks').catch(() => ({}));
  const last = await api('/state');
  rec.extras.chats = {};
  for (const h of last.state?.heroines || last.heroines || []) {
    rec.extras.chats[h.id] = await api(`/heroines/${h.id}/chat`).catch(() => ({ messages: [] }));
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(rec));
  console.log('saved', Object.keys(rec.steps).length, 'steps');
})();
