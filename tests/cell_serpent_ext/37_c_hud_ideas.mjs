// b14c: danger chevron under the snake face, one-time stats strip captions, left-hand mirrored pause and stats buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const m = await import(path.join(ROOT, 'cell_serpent', 'hud_b14c.js'));
const { hudZone } = await import(path.join(ROOT, 'cell_serpent', 'hud.js'));
const { W, LINE_Y } = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));

// ---- danger chevron
const G = (danger, y, extra = {}) => Object.assign({ phase: 'play', danger, snakes: [{ segs: [{ x: 300, y, hp: 1 }] }] }, extra);
assert.equal(m.dangerK(G(0.1)), 0, 'no cue while the face is far');
assert.ok(m.dangerK(G(0.6)) > 0.4 && m.dangerK(G(1)) === 1, 'the cue grows with danger');
assert.equal(m.lowestHead({ snakes: [{ segs: [{ x: 1, y: 100, hp: 1 }] }, { segs: [{ x: 2, y: 900, hp: 1 }] }] }).x, 2, 'the lowest face wins');
assert.equal(m.lowestHead({ snakes: [{ segs: [{ x: 1, y: 100, hp: 0 }] }] }), null, 'a dead face is no target');
assert.equal(m.chevX(3), 54); assert.equal(m.chevX(W + 40), W - 54); assert.equal(m.chevX(300), 300);
const calls = []; const ctx = new Proxy({}, { get: (t, k) => k === 'globalAlpha' ? 1 : (...a) => { calls.push([k, a]); }, set: () => true });
let bakes = 0; const kit = { bake: (k, w, h, fn) => { bakes++; return { c: {}, w, h }; } };
assert.equal(m.drawDangerChevron(ctx, kit, G(0.05, 900), { t: 1 }, false, null), false, 'far: nothing drawn');
assert.equal(m.drawDangerChevron(ctx, kit, G(0.9, 1000, { ring: {} }), { t: 1 }, false, null), false, 'ring stages have their own rim');
assert.equal(m.drawDangerChevron(ctx, kit, G(0.9, 1000, { phase: 'won' }), { t: 1 }, false, null), false, 'only while playing');
calls.length = 0;
assert.equal(m.drawDangerChevron(ctx, kit, G(0.9, 1000), { t: 1 }, false, null), true);
const imgs = calls.filter(c => c[0] === 'drawImage'); assert.equal(imgs.length, 3, 'three baked chevrons');
assert.ok(imgs.every(c => c[1][2] > LINE_Y - 30), 'they sit on the floor, under the line');
m.drawDangerChevron(ctx, kit, G(0.9, 1000), { t: 2 }, true, null); assert.ok(bakes >= 1, 'the chevron sprite is requested through the kit cache');

// ---- stats captions
assert.equal(m.statsLabelAt(1), -1, 'not at the start of the run');
assert.equal(m.statsLabelAt(m.LABEL_T0 + 0.1), 0);
assert.equal(m.statsLabelAt(m.LABEL_END - 0.1), m.STATS_LABELS.length - 1);
assert.equal(m.statsLabelAt(m.LABEL_END + 1), -1, 'ends');
for (const l of m.STATS_LABELS) assert.ok(l.text.length > 3 && l.x > 30 && l.x < 420, 'captions point at the strip: ' + l.text);
m.statsHintReset();
const hp = { glass() {}, text() {}, ctx, reduce: false };
assert.equal(m.drawStatsHint({ phase: 'play', t: 2 }, 146, { t: 2 }, hp), false, 'too early');
assert.equal(m.drawStatsHint({ phase: 'play', t: 6 }, 146, { t: 6 }, hp), true, 'shown once the slide hint is done');
assert.equal(m.drawStatsHint({ phase: 'play', t: m.LABEL_END + 0.1 }, 146, { t: 9 }, hp), false);
assert.equal(m.statsHintSeen(), true, 'seen after the last caption');
assert.equal(m.drawStatsHint({ phase: 'play', t: 6 }, 146, { t: 6 }, hp), false, 'never again');
m.statsHintReset(); m.markStatsHintSeen(); assert.equal(m.drawStatsHint({ phase: 'play', t: 6 }, 146, { t: 6 }, hp), false, 'tapping the stats button counts as learned');
m.statsHintReset();

// ---- left hand
assert.equal(hudZone({ x: 700, y: 30 }, 0), 'pause'); assert.equal(hudZone({ x: 20, y: 30 }, 0), '', 'right hand: the left edge is no button');
assert.equal(hudZone({ x: 20, y: 30 }, 0, 0, true), 'pause', 'left hand: pause on the left');
assert.equal(hudZone({ x: 20, y: 100 }, 0, 0, true), 'stats', 'left hand: stats on the left');
assert.equal(hudZone({ x: 700, y: 30 }, 0, 0, true), '', 'left hand: the right edge is free');
assert.equal(hudZone({ x: 40, y: 30 }, 0, 0.5, true), 'pause', 'the 44 px zone also grows on the left');
assert.equal(m.mirrorX(100, true), W - 100); assert.equal(m.mirrorX(100, false), 100);

// ---- wiring
const rd = n => fs.readFileSync(path.join(ROOT, 'cell_serpent', n), 'utf8');
assert.ok(/MIR = !!\(env\.OPT && env\.OPT\.leftHand\)/.test(rd('hud.js')) && rd('hud.js').includes('drawDangerChevron(') && rd('hud.js').includes('drawStatsHint('), 'hud.js wires the three ideas');
assert.ok(rd('render.js').includes('!!OPT.leftHand'), 'render passes the hand to the hit zones');
assert.ok(rd('main.js').includes('leftHand: !!save.settings.leftHand, textScale'), 'main hands the setting to the renderer');
for (const n of ['hud_b14c.js', 'hud.js']) assert.ok(!rd(n).includes('—'), 'no em dash');
console.log('37_c_hud_ideas ok');
