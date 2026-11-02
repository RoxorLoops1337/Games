// Round 3 battle view: Larger text scales HUD text, fit-to-width still holds, default look unchanged, panel side hysteresis, phase counting.
import assert from 'node:assert/strict';
import * as DH from '../drop_the_bass/js/doodle_hud.js';
import * as A from '../drop_the_bass/js/a11y.js';
import { panelSide } from '../drop_the_bass/js/doodle_battle.js';
import { phaseState } from '../drop_the_bass/js/doodle_depth.js';
const fonts = [];
const ctx = new Proxy({}, { get: (o, k) => (k === 'measureText' ? (s) => ({ width: s.length * parseFloat(String(ctx.font).match(/([\d.]+)px/)?.[1] || 10) * 0.5 }) : k === 'font' ? o.font : typeof o[k] !== 'undefined' ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; if (k === 'font') fonts.push(v); return true; } });
const sizeOf = () => parseFloat(fonts[fonts.length - 1].match(/([\d.]+)px/)[1]);
A.applyA11y({ bigtext: false }); fonts.length = 0; DH.text(ctx, 'HYPE', 10, 10, 20, '#fff'); const base = sizeOf();
A.applyA11y({ bigtext: true }); fonts.length = 0; DH.text(ctx, 'HYPE', 10, 10, 20, '#fff'); const big = sizeOf();
assert.ok(Math.abs(big / base - 1.12) < 0.01, 'text grows by 1.12: ' + base + ' -> ' + big);
fonts.length = 0; DH.text(ctx, 'A very long German sentence that cannot fit', 10, 10, 20, '#fff', 'left', 900, { maxW: 80 });
const f = DH.fitText(ctx, 'A very long German sentence that cannot fit', 22.4, 80);
assert.ok(f.s.endsWith('…') && DH.measureStr(ctx, f.s, f.size) <= 80, 'fit shrinks then cuts');
const L = DH.wrapLines(ctx, 'one two three four five six seven eight nine ten', 60, 13, 15, 2);
assert.ok(L.lines.length <= 2, 'wrapLines honours maxLines');
A.applyA11y({ bigtext: false }); fonts.length = 0; DH.text(ctx, 'HYPE', 10, 10, 20, '#fff'); assert.equal(sizeOf(), base, 'off again: default look unchanged');
// panel side: away from the turret, with hysteresis
const b = {}; const tu = { id: 1, y: 300 };
assert.equal(panelSide(b, tu, 150, false), false, 'turret high: panel at the bottom');
tu.y = 490; assert.equal(panelSide(b, tu, 150, false), false, 'inside the dead zone it stays');
tu.y = 560; assert.equal(panelSide(b, tu, 150, false), true, 'turret low: panel flips to the top');
tu.y = 470; assert.equal(panelSide(b, tu, 150, false), true, 'and stays there near the middle');
// Dr. Dead Air lists seven effects on four thresholds: the bar says PHASE 1/4, not 1/8
const run = { bossPhaseList: () => [{ at: 1 }, { at: 0.66 }, { at: 0.66 }, { at: 0.33 }, { at: 0.33 }, { at: 0.33 }, { at: 0.09 }] };
const ps = phaseState({ run }, { hp: 1, maxHp: 1 }, { hpFrac: 0.5, phase: 4, phases: 8 });
assert.deepEqual(ps, { phase: 2, phases: 4 });
console.log('drop_the_bass battle r3: ok');
