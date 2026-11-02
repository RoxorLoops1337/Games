// Run HUD batch 10: combo tier tag, text size floor scan, bigger skill tiles with a safe area, 9 skill row, high contrast.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const hudm = await import(join(root, 'hud.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const src = readFileSync(join(root, 'hud.js'), 'utf8');
assert.ok(!src.includes('—'), 'no em dash in hud.js');

// tier names
assert.equal(hudm.comboTier(3), ''); assert.equal(hudm.comboTier(5), 'NICE'); assert.equal(hudm.comboTier(10), 'GROOVY');
assert.equal(hudm.comboTier(25), 'SUPER'); assert.equal(hudm.comboTier(40), 'MEGA');

// text size floor: every text(...) call in hud.js with a literal size draws at 16 game units or more (about 9px on a 390 screen)
let small = [];
const re = /[^\w.]text\((?:[^;]*?),\s*(?:fzp?\()?(\d+(?:\.\d+)?)\)?,\s*(?:'#|urgent|low|gv|fire|maxed|ready|col|c\b|hot|leg)/g;
let m, seen = 0;
while ((m = re.exec(src))) { seen++; if (+m[1] < 16) small.push(m[0].slice(0, 70)); }
assert.ok(seen > 25, 'the scan sees the text calls: ' + seen);
assert.deepEqual(small, [], 'tiny HUD text: ' + small.join(' | '));

// skill layout: 10 percent bigger tiles, never under the groove plate (right edge 244) or off the right margin
assert.ok(hudm.skillLayout(3).r >= 26 * 1.1 - 0.3, 'tiles about 10 percent bigger');
for (let n = 1; n <= 9; n++) {
  const L = hudm.skillLayout(n);
  assert.ok(L.left >= 244 + 12 - 0.01, `${n} skills keep a 12 unit gap to the groove plate (left ${L.left})`);
  assert.ok(L.pitch >= 2 * L.r + 3.9 || n >= 8, `${n} skills do not overlap`);
  assert.ok(L.pitch >= 2 * L.r + 3.9, `tiles keep a gap at ${n}`);
  assert.ok(L.r >= 22, 'tiles stay tappable size');
}
assert.ok(hudm.skillLayout(9).left >= 256 && hudm.skillLayout(6).chipUp && !hudm.skillLayout(4).chipUp, 'beat chip lifts when tiles reach it');

// render: 9 skills, a big combo, high contrast and reduced motion never throw and print the tier tag
const calls = [], noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (s, x, y) => calls.push([String(s), x, y]) : noop, set: () => true });
const R = createRenderer({ width: 390, height: 844, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 9, stage: 12, meta: { rev: 1 } });
for (let i = 0; i < 70; i++) { R.state.t += 1 / 30; R.draw(g, { joy: { on: false } }, 1 / 30); }
for (const w of ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw']) g.weap[w] = { lv: 2, cd: 0.5 };
for (const [combo, tag] of [[6, 'NICE'], [12, 'GROOVY'], [22, 'SUPER'], [45, 'MEGA']]) {
  g.combo = combo; g.lastKill = g.t;
  for (const o of [{}, { highContrast: true }, { reduceMotion: true }]) {
    Object.assign(R.OPT || {}, { highContrast: false, reduceMotion: false }, o);
    calls.length = 0; R.draw(g, { joy: { on: false } }, 1 / 30);
    assert.ok(calls.some(c => c[0] === tag), `${tag} tag drawn`);
  }
}
