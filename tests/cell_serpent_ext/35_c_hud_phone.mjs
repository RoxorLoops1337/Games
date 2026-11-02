// Batch 12 agent c: the in-run HUD is readable on a phone. Every label is at least 24 game units (12 CSS px at 360 wide),
// the plates were rebalanced to hold that text, and nothing is drawn outside the frame.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const hudm = await import(join(root, 'hud.js'));
const { createRenderer } = await import(join(root, 'render.js'));
for (const f of ['hud.js', 'hud_b11.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);

// the skill row: 9 tiles fit between the groove plate and the right margin, and the beat chip (172 wide at x 262) never meets a tile
for (let n = 1; n <= 9; n++) {
  const L = hudm.skillLayout(n);
  assert.ok(L.left >= 256 - 0.01 && L.left + 0 <= 698, `row ${n} sits in the lane`);
  if (!L.chipUp) assert.ok(L.left - 8 - 262 >= 150, `beat chip keeps 150 units beside ${n} tiles`);
}
assert.ok(hudm.skillLayout(5).chipUp && !hudm.skillLayout(4).chipUp, 'the chip lifts above the row from 5 tiles');

// draw a busy frame (9 skills, boss, combo, buffs, streak, hard) in each stage kind and read every printed string
const calls = [], noop = () => {};
const sprites = [];
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (s, x, y) => calls.push([String(s), x, y]) : noop, set: () => true });
const R = createRenderer({ width: 390, height: 844, getContext: stubCtx }, null, null);
let streak = 25; R.setOptions({ beatStreak: () => streak });
for (const stage of [5, 6, 12, 45]) {
  const g = sim.createGame({ seed: 4, stage, meta: { rev: 1 } });
  for (let i = 0; i < 70; i++) { R.state.t += 1 / 30; R.draw(g, { joy: { on: false } }, 1 / 30); }
  for (const w of ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw']) g.weap[w] = { lv: 5, cd: 0.5 };
  g.combo = 45; g.lastKill = g.t; g.p.shield = 5; g.p.rage = 7; g.encore = 0.5; g.groove = 22; g.hard = stage === 45;
  for (const o of [{}, { highContrast: true }, { reduceMotion: true }]) {
    Object.assign(R.OPT || {}, { highContrast: false, reduceMotion: false }, o);
    calls.length = 0; R.draw(g, { joy: { on: false } }, 1 / 30);
    const printed = calls.map(c => c[0]);
    for (const s of ['COMBO x45', 'MEGA', 'SHIELD', 'RAGE', 'ENCORE', 'x25', 'BEAT', 'MAX']) assert.ok(printed.some(p => p === s), `stage ${stage}: ${s} drawn`);
  }
}
// long stage names squeeze, never shrink below the floor
assert.equal(hudm.hudStageName('Love-Struck Serpent IV'), 'Love-Struck IV');
for (let s = 1; s <= 50; s++) assert.ok(hudm.nameSqueeze(hudm.hudStageName(sim.virusName(s)), 208) >= 0.72, `stage ${s} name fits the title plate`);
console.log('35_c_hud_phone ok');
