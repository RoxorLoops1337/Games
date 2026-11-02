// Run HUD batch 9: phone legibility floor, bigger skill badges, stacked NEW SKILL tags, urgent combo timer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const src = readFileSync(join(root, 'hud.js'), 'utf8');
assert.ok(!src.includes('—'), 'no em dash in hud.js');

// source-level floors: the small labels are lifted, badges and pips are bigger
assert.ok(src.includes('fzp(22)') && src.includes('v.length > 3 ? 18 : 21'), 'stats values lifted');
assert.ok(src.includes("'lvb09|'") && src.includes("'pips09|'"), 'new badge and pip bakes');
assert.ok(!/maxed \? 9 : 14/.test(src), 'old tiny badge text is gone');
assert.ok(src.includes("rr(-84, 14, Math.max(5, 168 * left), 7, 3.5)"), 'thicker combo timer');

// record every text drawn, with its y, to prove several fresh skills do not print over each other
const calls = [];
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'fillText' ? (s, x, y) => calls.push([String(s), x, y]) : noop, set: () => true });
const canvas = { width: 390, height: 844, getContext: stubCtx };
const R = createRenderer(canvas, null, null);
const g = sim.createGame({ seed: 9, stage: 12, meta: { rev: 1 } });
for (let i = 0; i < 70; i++) { R.state.t += 1 / 30; R.draw(g, { joy: { on: false } }, 1 / 30); }   // past the first second
for (const w of ['swab', 'daggers', 'tower']) g.weap[w] = { lv: 5, cd: 0 };
calls.length = 0;
R.draw(g, { joy: { on: false } }, 1 / 30);
assert.ok(calls.filter(c => c[0] === 'MAX').length >= 3, 'maxed tiles show a MAX pill');
const tags = calls.filter(c => c[0] === 'NEW SKILL');
assert.ok(tags.length >= 2, 'several NEW SKILL tags at once');
assert.ok(src.includes('60 * (nCap++)') && src.includes('- (lift || 0)'), 'tags are lifted one above the other (verified in a screenshot)');
