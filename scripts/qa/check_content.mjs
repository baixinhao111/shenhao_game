// Content integrity for the district small maps: every spot ref resolves, and every buyable
// asset / property / business has a place on some map. usage: node scripts/qa/check_content.mjs
import fs from 'node:fs';
const J = (p) => JSON.parse(fs.readFileSync(new URL('../../' + p, import.meta.url)));
const list = (x) => (Array.isArray(x) ? x : Object.values(x)[0]);
const map = J('content/maps/haicheng.json');
const assets = J('content/assets_catalog.json').assets;
const biz = list(J('content/businesses.json'));
const props = list(J('content/properties.json'));
const errs = [];
const sold = new Set(), bizOn = new Set(), propOn = new Set();
for (const d of map.districts) {
  if (!d.localMap) errs.push(`${d.id}: no localMap`);
  else if (!fs.existsSync(new URL('../../client/public' + d.localMap, import.meta.url))) errs.push(`${d.id}: missing ${d.localMap}`);
  const ids = new Set();
  for (const s of d.spots || []) {
    if (ids.has(s.id)) errs.push(`${d.id}: duplicate spot ${s.id}`);
    ids.add(s.id);
    if (!(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100)) errs.push(`${s.id}: x/y out of range`);
    const inter = (d.interactions || []).find((i) => i.id === s.ref);
    if ((s.kind === 'date' || s.kind === 'stroll') && !inter) errs.push(`${s.id}: interaction ${s.ref} not in ${d.id}`);
    if (s.kind === 'business') (biz.some((b) => b.id === s.ref) ? bizOn.add(s.ref) : errs.push(`${s.id}: unknown business ${s.ref}`));
    if (s.kind === 'property') (props.some((p) => p.id === s.ref) ? propOn.add(s.ref) : errs.push(`${s.id}: unknown property ${s.ref}`));
    if (s.kind === 'showroom') for (const a of s.stock || []) (assets.some((x) => x.id === a) ? sold.add(a) : errs.push(`${s.id}: unknown asset ${a}`));
    if (s.kind === 'visit' && !(s.lines || []).length) errs.push(`${s.id}: visit spot without lines`);
  }
}
for (const a of assets) if (!a.dropOnly && !a.starterOwned && a.price > 0 && !sold.has(a.id)) errs.push(`asset ${a.id} is buyable but no showroom stocks it`);
for (const b of biz) if (!bizOn.has(b.id)) errs.push(`business ${b.id} has no map spot`);
for (const p of props) if (!propOn.has(p.id)) errs.push(`property ${p.id} has no map spot`);
console.log(errs.length ? errs.join('\n') : 'content OK');
process.exit(errs.length ? 1 : 0);
