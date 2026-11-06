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

// text size floor (batch 12): the frame is 720 units wide, a 360 phone shows 0.5 CSS px per unit, so 24 units is 12 CSS px.
// Every text(...) call in hud.js and hud_b11.js uses TXT_MIN (24) or a literal of at least 24; no literal below the floor remains.
assert.equal(hudm.TXT_MIN, 24, 'the HUD text floor is 24 units');
assert.ok(hudm.TXT_MIN * 360 / 720 >= 12, 'at 360 wide the floor is 12 CSS px');
const src11 = readFileSync(join(root, 'hud_b11.js'), 'utf8');
let small = [], seen = 0;
for (const [name, code] of [['hud.js', src], ['hud_b11.js', src11]]) {
  const re = /[^\w.]text\(([^;\n]*)/g; let m;
  while ((m = re.exec(code))) {
    if (/function text|^\s*str\b/.test(m[1])) continue;
    seen++;
    // the size is the 4th argument: a bare literal, TXT_MIN, or TXT_MIN plus something; anything else with a number below 24 fails
    const lit = m[1].match(/,\s*(\d+(?:\.\d+)?)\s*,\s*(?:'#|urgent|low|gv|fire|maxed|ready|col|c\b|hot|leg|info|gi)/);
    if (lit && +lit[1] < 24) small.push(name + ': ' + m[0].slice(0, 70));
    if (/\bfzp?\(\s*(\d+)\s*\)/.test(m[1]) && +RegExp.$1 < 24) small.push(name + ': ' + m[0].slice(0, 70));
  }
}
assert.ok(seen > 30, 'the scan sees the text calls: ' + seen);
assert.deepEqual(small, [], 'tiny HUD text: ' + small.join(' | '));
// stage names lose the word Serpent and squeeze sideways instead of shrinking
assert.equal(hudm.hudStageName('Love-Struck Serpent III'), 'Love-Struck III');
assert.ok(hudm.nameSqueeze('Grumpy Python III', 208) < 1 && hudm.nameSqueeze('Grumpy Python III', 208) >= 0.72 && hudm.nameSqueeze('Sleepy Cobra', 208) === 1);

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
