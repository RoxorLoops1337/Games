// Hit juice round 10: per-weapon crit and finish slow-mo, per-class mark budgets, snake coloured chips, full clear cascade.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const j10 = await import(join(root, 'hit_juice10.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const mk = () => createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 10, stage: 4 });
const WEAPONS = ['capsule', 'swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw', 'puppy', 'bell', 'encore'];

// tables are complete and sane; heavy weapons hit harder than light ones
for (const w of WEAPONS) for (const T of [j10.CRIT_FEEL, j10.FINISH_FEEL]) { const f = T[w]; assert.ok(f && f[0] > 0 && f[0] < 0.12 && f[1] > 0.1 && f[1] < 1 && f[2] > 0.05 && f[2] < 0.6, 'feel for ' + w); }
assert.ok(j10.CRIT_FEEL.maw[0] > j10.CRIT_FEEL.needles[0] && j10.CRIT_FEEL.maw[1] < j10.CRIT_FEEL.needles[1], 'maw thuds, needles tick');
assert.ok(j10.FINISH_FEEL.tower[2] > j10.CRIT_FEEL.tower[2], 'a finish lasts longer than a crit');

// a crit slows time a little, per weapon; a plain hit does not
for (const w of ['needles', 'maw']) {
  const R = mk(); for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 5, crit: false, src: w, s: {} }, g);
  assert.equal(R.timeScale(), 1, w + ' plain hit leaves time alone');
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src: w, s: {} }, g);
  const ts = R.timeScale(); assert.ok(ts < 1 && Math.abs(ts - j10.CRIT_FEEL[w][1]) < 0.02, w + ' crit slow ' + ts);
}
// crit punches are rate limited
{
  const R = mk(); for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src: 'maw', s: {} }, g);
  for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);   // slow-mo ends
  assert.equal(R.timeScale(), 1, 'crit slow-mo ends');
  R.onEvent({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src: 'maw', s: {} }, g);
  assert.equal(R.timeScale(), 1, 'a second crit within the gap does not slow again');
}
// the finishing blow: per weapon depth
for (const w of ['needles', 'tower']) {
  const R = mk(); for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  R.onEvent({ t: 'hit', x: 200, y: 300, d: 5, crit: false, src: w, s: {} }, g);
  R.onEvent({ t: 'kill', x: 200, y: 300, r: 30, kind: 'normal', skin: 'love', head: true }, g);
  const ts = R.timeScale(); assert.ok(ts <= j10.FINISH_FEEL[w][1] + 0.03, w + ' finish slow ' + ts);
}
// reduce motion: no slow-mo
{
  const R = mk(); R.setOptions({ reduceMotion: true }); R.onEvent({ t: 'hit', x: 300, y: 400, d: 9, crit: true, src: 'maw', s: {} }, g);
  assert.equal(R.timeScale(), 1, 'no slow-mo with reduce motion');
}

// mark classes: a chain burst fills its own budget but the kill pops and hits still get marks
assert.equal(j10.classOf('chip'), 'chip'); assert.equal(j10.classOf('puff', 'pop'), 'pop'); assert.equal(j10.classOf('puff', 'hit'), 'hit'); assert.equal(j10.classOf('link', 'pop'), 'chain');
{
  const R = mk(), P = R.hj.pools; for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  for (let i = 0; i < 40; i++) R.onEvent({ t: 'kill', x: 60 + i * 8, y: 400, r: 30, kind: 'normal', skin: 'love' }, g);   // a long chain of kills, no hits
  const chain = P.marks.filter(m => m.cl === 'chain' && m.k !== 'shock').length;   // milestone shockwaves are forced on purpose
  assert.ok(chain <= j10.CLASS_CAP.chain, 'chain marks stay in their budget: ' + chain);
  assert.ok(P.marks.length <= 44, 'total cap holds');
  // now a hit still shows its impact and chips, and a fresh kill still pops in the weapon style
  R.onEvent({ t: 'hit', x: 300, y: 500, d: 5, crit: false, src: 'dragon', s: {} }, g);
  assert.ok(P.marks.some(m => m.k === 'feather' && m.cl === 'hit'), 'impact mark survives a chain burst');
  assert.ok(P.marks.some(m => m.k === 'chip'), 'chips survive a chain burst');
  // pooled marks keep one shape
  assert.equal(new Set(P.marks.filter(m => m.pool).map(m => Object.keys(m).length)).size, 1, 'one mark shape');
}
// chips: a pile of kill pops cannot starve the hit marks either
{
  const R = mk(), P = R.hj.pools; for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  for (let i = 0; i < 12; i++) { R.onEvent({ t: 'hit', x: 100 + i * 20, y: 300, d: 5, crit: false, src: 'swab', s: {} }, g); R.onEvent({ t: 'kill', x: 100 + i * 20, y: 300, r: 30, kind: 'normal', skin: 'love' }, g); }
  assert.ok(P.marks.filter(m => m.cl === 'pop').length <= j10.CLASS_CAP.pop, 'pop budget');
  R.onEvent({ t: 'hit', x: 400, y: 500, d: 5, crit: false, src: 'bubble', s: {} }, g);
  assert.ok(P.marks.some(m => m.k === 'bpop' && m.cl === 'hit'), 'a hit still marks after many pops');
}

// chips carry the colour of the snake that was hit
{
  const R = mk(), P = R.hj.pools; for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  const sn = g.snakes[0], seg = sn.segs[2];
  R.onEvent({ t: 'hit', x: seg.x, y: seg.y, d: 9, crit: true, src: 'daggers', s: seg }, g);
  const want = j10.SKIN_SPARK[sn.skin || g.skin];
  assert.ok(want && want.length === 2, 'skin colours exist for ' + (sn.skin || g.skin));
  const cols = P.marks.filter(m => m.k === 'chip').map(m => m.col);
  assert.ok(cols.some(c => want.includes(c)), 'a chip is in the snake colour ' + cols.join());
  assert.ok(cols.some(c => c === '#e8f4ff'), 'a chip keeps the weapon colour');
  for (const sk of Object.keys(j10.SKIN_SPARK)) assert.ok(/^#/.test(j10.sparkCol(sk, 0)) && /^#/.test(j10.sparkCol(sk, 1)), 'spark colour ' + sk);
  assert.ok(/^#/.test(j10.sparkCol('nope', 1)), 'unknown skin falls back');
}

// the full clear cascade
{
  const R = mk(), c = R.hj.cascade; for (let i = 0; i < 20; i++) R.draw(g, null, 1 / 60);
  assert.ok(c.t >= j10.CASCADE_DUR, 'idle before a clear');
  R.onEvent({ t: 'clear', n: 4, bonus: 10, boss: false, name: 'x' }, g);
  assert.ok(c.t === 0, 'a clear starts the cascade');
  const rects = []; const cx = stubCtx(); cx.fillRect = (x, y, w, h) => rects.push([x, y, w, h]);
  for (const k of [0.1, 0.4, 0.8, 0.95]) { rects.length = 0; j10.drawCascade(cx, 720, 1280, k, '#ffe14a', 3); assert.ok(rects.length >= 2, 'band drawn at ' + k); }
  rects.length = 0; j10.drawCascade(cx, 720, 1280, 0.3, '#ffe14a', 3); const y1 = rects[0][1]; rects.length = 0; j10.drawCascade(cx, 720, 1280, 0.5, '#ffe14a', 3);
  assert.ok(rects[0][1] > y1, 'the band sweeps down');
  for (let i = 0; i < 120; i++) R.draw(g, null, 1 / 60);
  assert.ok(c.t >= j10.CASCADE_DUR, 'the cascade ends');
  const R2 = mk(); R2.setOptions({ reduceMotion: true }); R2.onEvent({ t: 'clear', n: 4 }, g); assert.ok(R2.hj.cascade.t >= j10.CASCADE_DUR, 'no cascade with reduce motion');
}
console.log('04_hit_juice_r10 ok');
