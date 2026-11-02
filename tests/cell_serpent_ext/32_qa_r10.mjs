// QA round 10: save corruption sweep, special cell badges in a pass of their own, bell reach rings.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { drawBellRings } = await import(join(root, 'bell_fx.js'));

// every broken save loads into a sane default or a clamped copy, and never throws
const BAD = [null, undefined, 0, 42, 'x', [], [1, 2], true, {}, { beats: 'x', skills: 5, pets: 'p', stars: [1], settings: 7, outfits: 3, keeps: 1, addict: 5, daily: 5, event: 'x', shop: 5, prog: 5, loadout: 'swab', petEquip: 'kitten' },
  { beats: null, skills: null, pets: null, stars: null, settings: null, addict: null, daily: null, loadout: null, petEquip: null, outfits: null, shop: null, energy: null },
  { addict: { claimed: [1], spin: 5, week: 'x', q: { p: 5 }, season: 3, qs: [] }, daily: { day: 'x', progress: 5, claimed: [1] }, shop: { bought: 5, limit: 5 }, outfits: { owned: 5, worn: 'nope' } },
  { beats: 1e999, sparkles: -1e999, cleared: NaN, xp: 1e999, energy: { n: 1e999, t: 1e999 } },
  { beats: -5, sparkles: -1, cleared: -3, best: -2, runs: -1, xp: -100, energy: { n: -3, t: -1 } },
  JSON.parse('{"__proto__":{"x":1},"constructor":{"prototype":{"y":1}},"skills":{"__proto__":{"lv":9}},"stars":{"__proto__":3}}')];
for (const raw of BAD) {
  const s = sim.sanitizeSave(raw);
  for (const k of ['beats', 'sparkles', 'cleared', 'best', 'runs', 'xp', 'eggs', 'ribbons', 'kills']) assert.ok(Number.isFinite(s[k]) && s[k] >= 0, k + ' stays a finite non-negative number');
  assert.ok(s.cleared <= 50 || raw === null || typeof raw === 'object', 'cleared');
  assert.ok(s.energy.n >= 0 && s.energy.n <= sim.ENERGY_OVER_MAX, 'energy clamped');
  assert.ok(s.loadout.length >= 1 && s.loadout.every(id => sim.WEAPONS.some(w => w.id === id)), 'loadout is never empty');
  assert.equal({}.x, undefined, 'no prototype pollution'); assert.equal({}.y, undefined, 'no prototype pollution');
  assert.ok(s.last.stage >= 1 && s.last.stage <= 50, 'last stage in range');
  JSON.stringify(s);   // it must also serialise again
  const s2 = sim.sanitizeSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(s2.skills, s.skills, 'sanitise is idempotent on skills');
}
// huge but finite numbers load (they only have to stay numbers)
{ const s = sim.sanitizeSave({ beats: 1e300, sparkles: 1e21, stars: { 1: 99, 2: -5, abc: 3 }, skills: { swab: { lv: 1e9, frag: 1e300 } }, pets: { kitten: { star: 1e9, joy: 1e9 } } });
  assert.ok(Number.isFinite(s.beats)); assert.equal(s.stars[1], 3); assert.ok(!('abc' in s.stars)); assert.ok(s.skills.swab.lv <= sim.SKILL_MAX_LV); assert.ok(s.pets.kitten.star <= sim.PET_MAX_STAR); }

// render: the special-cell badge is drawn in a pass after the cells, so a neighbour can no longer cover it
{
  const src = readFileSync(join(root, 'render.js'), 'utf8');
  const i = src.indexOf('function drawSnake'), j = src.indexOf('drawBellRings(ctx, sn, S.t)', i), k = src.indexOf('drawCellBadge(ctx, s, s.r, S.t, i, kit)', i), m = src.indexOf('drawQuartetLinks(ctx, sn, S.t)', i);
  assert.ok(k > 0 && j > 0 && m > k, 'badge pass and bell rings run after the cell loop, before the quartet links');
  assert.ok(!/drawCellBadge\(ctx, s, r, S\.t, i, kit\)/.test(src), 'no badge call is left inside the per-cell loop');
}
// bell rings: only a live bell draws, one ring per neighbour in reach, nothing when popped
{
  let arcs = 0; const ctx = new Proxy({}, { get: (t, p) => p === 'arc' ? () => { arcs++; } : () => {}, set: () => true });
  const mk = (bell, hp = 5) => Array.from({ length: 9 }, (_, i) => ({ x: 50 + i * 40, y: 10, r: 30, hp, bell: bell === i }));
  drawBellRings(ctx, { segs: mk(-1) }, 1); assert.equal(arcs, 0, 'no bell, no rings');
  drawBellRings(ctx, { segs: mk(4) }, 1); assert.equal(arcs, 6, 'three cells each side');
  arcs = 0; drawBellRings(ctx, { segs: mk(4, 0) }, 1); assert.equal(arcs, 0, 'a dead bell draws nothing');
}
// a huge xp used to hang levelInfo (one loop pass per level) at page load
{ const t0 = Date.now(), s = sim.sanitizeSave({ xp: 1e30 }); const li = sim.levelInfo(s.xp); assert.ok(Date.now() - t0 < 2000 && li.lv > 1, 'huge xp loads fast'); assert.equal(sim.sanitizeSave({ xp: 4321 }).xp, 4321); }
{ const s = sim.sanitizeSave({ beats: 1e300, sparkles: 1e21, cleared: 1e9, best: 1e9 }); assert.ok(s.beats <= 1e12 && s.sparkles <= 1e12 && s.cleared === 50 && s.best === 50, 'absurd currency and stage values are clamped'); }
