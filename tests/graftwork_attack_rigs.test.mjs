import assert from 'node:assert/strict';
import { timing, pose, defaultPose, BODY_KEYWORDS } from '../graftwork/art/attacks.js';
import { ENEMIES } from '../graftwork/data/index.js';

const PH = ['tell', 'act', 'hold', 'rec'];
const EXTRA_IDS = ['suture_wasp', 'ward_clerk', 'knitter', 'surge_tick', 'needle_nanny', 'brine_surgeon', 'scissor_nurse', 'ferric_warden', 'tax_collector', 'stage_manager', 'understudys_shadow', 'locksmith', 'totally_unknown'];
const list = Object.values(ENEMIES);
assert.ok(list.length >= 50, 'enemy count ' + list.length);
const cases = [];
for (const e of list) {
  const body = e.art && e.art.body;
  cases.push([e.id, body, undefined]);
  const mv = e.moves || {};
  for (const mid of Object.keys(mv)) cases.push([e.id, body, mid]);
}
for (const id of EXTRA_IDS) for (const b of BODY_KEYWORDS.concat(['nonsense', undefined])) cases.push([id, b, undefined]);
for (const b of BODY_KEYWORDS) cases.push(['x_' + b, b, undefined]);
const keys = ['dx', 'dy', 'sx', 'sy', 'rot', 'glow'];
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const TOL = { dx: 1e-6, dy: 1e-6, sx: 1e-6, sy: 1e-6, rot: 1e-6, glow: 1e-6 };

for (const [id, body, mid] of cases) {
  const tag = `${id}/${body}/${mid}`;
  const t = timing(id, body, mid);
  for (const f of ['tell', 'act', 'hold', 'rec', 'impactMs']) assert.ok(ok(t[f]) && t[f] > 0, `${tag} timing.${f}`);
  assert.equal(t.impactMs, t.tell + t.act, `${tag} impact`);
  assert.ok(Array.isArray(t.hits) && t.hits.length >= 1 && t.hits[t.hits.length - 1] === t.impactMs, `${tag} hits`);
  const lim = (() => { const b = body; return null; })();
  for (const ph of PH) {
    for (let i = 0; i <= 200; i++) {
      const p = pose(id, body, ph, i / 200, mid);
      assert.ok(p, `${tag} null pose`);
      for (const kk of keys) assert.ok(ok(p[kk]), `${tag} ${ph} ${kk} NaN`);
      assert.ok(Math.abs(p.sx * p.sy - 1) < 1e-9, `${tag} volume`);
      assert.ok(p.sy >= 1 / 1.3 - 1e-9 && p.sy <= 1.3 + 1e-9, `${tag} sy range ${p.sy}`);
      assert.ok(p.glow >= 0 && p.glow <= 1, `${tag} glow`);
      assert.ok(p.extra && typeof p.extra.contact === 'boolean' && ['light', 'heavy', 'boss'].includes(p.extra.weight), `${tag} extra`);
      assert.ok(ok(p.extra.shakeDir), `${tag} shakeDir`);
      for (const [n, v] of Object.entries(p.extra)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${tag} extra.${n}`);
    }
  }
  // continuity at phase boundaries
  for (let i = 0; i < 3; i++) {
    const a = pose(id, body, PH[i], 1, mid), b = pose(id, body, PH[i + 1], 0, mid);
    for (const kk of keys) assert.ok(Math.abs(a[kk] - b[kk]) <= TOL[kk] + 1e-9, `${tag} ${PH[i]}->${PH[i + 1]} ${kk}: ${a[kk]} vs ${b[kk]}`);
  }
  // rec ends at rest
  const r = pose(id, body, 'rec', 1, mid);
  for (const kk of ['dx', 'dy', 'rot', 'glow']) assert.ok(Math.abs(r[kk]) < 1e-6, `${tag} rec end ${kk}`);
  assert.ok(Math.abs(r.sy - 1) < 1e-6, `${tag} rec end sy`);
  // contact exists around impact for attacks
  if (t.kind === 'attack') assert.ok(pose(id, body, 'act', 1, mid).extra.contact, `${tag} contact`);
}

// hard bodies barely deform; soft bodies may reach 1.3
for (const b of ['box', 'bell', 'cleaver']) for (const ph of PH) for (let i = 0; i <= 50; i++) { const p = defaultPose(b, ph, i / 50, 'boss'); assert.ok(p.sy <= 1.08 + 1e-9 && p.sy >= 1 / 1.08 - 1e-9, `hard ${b}`); }
let mx = 1; for (let i = 0; i <= 100; i++) mx = Math.max(mx, 1 / pose('bedpan_slime', 'dome', 'tell', i / 100).sy); assert.ok(mx > 1.25 && mx <= 1.3 + 1e-9, 'slime squash reaches ~1.3 ' + mx);

// weights: heavy tells are longer than light ones; table values
const L = timing('crutchling', 'stilts', 'jab'), H = timing('orderly', 'tall', 'stamp'), B = timing('the_matron', 'bell', 'rap');
assert.deepEqual([L.tell, L.act, L.hold, L.rec], [120, 60, 40, 180]);
assert.ok(H.tell > L.tell && B.tell > H.tell, 'tell ordering');
assert.equal(timing('cleaver', 'cleaver', 'chop').act, 50);
assert.equal(timing('cleaver', 'cleaver', 'chop').hold, 120);
const sw = timing('pill_swarm', 'capsules', 'rattle'); assert.ok(sw.hits.length >= 5 && sw.hits.every((v, i, a) => !i || v > a[i - 1]), 'swarm hits');
assert.equal(pose('x', 'dome', 'bogus', 0), null);

// signatures
const ex = (id, b, ph, k, m) => pose(id, b, ph, k, m).extra;
assert.ok(ex('iron_lung', 'bellows', 'tell', 1, 'blow').inhale > 0.99 && ex('iron_lung', 'bellows', 'act', 0.5, 'blow').push > 0);
assert.ok(ex('pill_swarm', 'capsules', 'act', 0.9, 'rattle').orbit > ex('pill_swarm', 'capsules', 'tell', 0, 'rattle').orbit && ex('pill_swarm', 'capsules', 'act', 1, 'rattle').peel >= 4);
assert.ok(ex('stitch_rat', 'tail', 'hold', 0.5, 'snip').thread === 1);
assert.ok(Math.abs(ex('night_nurse', 'lamp', 'tell', 1, 'injection').dim - 0.3) < 1e-9);
assert.ok(ex('defibrillator', 'box', 'act', 1, 'discharge').flash >= 0.99 && ex('defibrillator', 'box', 'tell', 0.5, 'discharge').flatline > 0);
assert.equal(ex('the_matron', 'bell', 'act', 0.5, 'rap').shakeDir, Math.PI);
assert.ok(ex('the_grafter', 'patchwork', 'act', 1, 'stitch').limb === 1 && ex('the_grafter', 'patchwork', 'hold', 1, 'stitch').strain === 1);
assert.ok(ex('cleaver', 'cleaver', 'hold', 0.5, 'chop').embedded === 1 && ex('cleaver', 'cleaver', 'hold', 0.5, 'raise').attacking === false);
assert.ok(ex('bedpan_slime', 'dome', 'hold', 0.5, 'slap').splat === 1.4);
assert.ok(ex('orderly', 'tall', 'tell', 1, 'stamp').clipboard > 0.99);
// signature styles are varied
const styles = new Set(list.map((e) => JSON.stringify(pose(e.id, e.art && e.art.body, 'act', 0.5).dx.toFixed(1) + pose(e.id, e.art && e.art.body, 'tell', 1).dy.toFixed(1) + pose(e.id, e.art.body, 'act', 1).rot.toFixed(2))));
assert.ok(styles.size >= 12, 'variety ' + styles.size);
console.log('graftwork attack rigs ok', cases.length, 'cases');
