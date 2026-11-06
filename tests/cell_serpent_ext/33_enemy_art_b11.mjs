// 01 enemy art b11: sibling head reactions, armour wear, mender plusses, boss rage face, slower crown roll.
import assert from 'node:assert';
import fs from 'node:fs';
import { createArtDraw, SPECIES } from '../../cell_serpent/art_draw.js';
import { SIB_MOOD, SIB_TIME, sibMood, drawSiblingReact, drawBossRage } from '../../cell_serpent/sibling_b11.js';
import { armorWearLevel, paintArmorWear } from '../../cell_serpent/armor_b11.js';
import { crownMotion } from '../../cell_serpent/head_death.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : ctx()), set: () => true, apply: () => ctx() });
const calls = { n: 0 };
const counting = () => new Proxy(function () {}, { get: (t, k) => { calls.n++; return k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : counting(); }, set: () => true, apply: () => counting() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);

// every species has a mood, the three moods are all used, and every reaction draws at every time without throwing
for (const sp of Object.keys(SPECIES)) assert(['frown', 'cheer', 'shock'].includes(SIB_MOOD[sp]), 'mood for ' + sp);
assert.strictEqual(sibMood('nope'), 'frown');
assert.deepStrictEqual([...new Set(Object.values(SIB_MOOD))].sort(), ['cheer', 'frown', 'shock']);
for (const sp of Object.keys(SPECIES)) for (let u = 0; u < 1; u += 0.05) { drawSiblingReact(ctx(), 40, sp, u, u * 3); kit.drawHead(ctx(), 0, 0, 30, 1.2, { skin: sp, t: 1, sib: u + 0.001 }); }
// outside the window nothing is drawn
calls.n = 0; drawSiblingReact(counting(), 40, 'love', 1.2, 0); drawSiblingReact(counting(), 40, 'love', -0.1, 0); assert.strictEqual(calls.n, 0, 'nothing drawn outside 0..1');
calls.n = 0; drawSiblingReact(counting(), 40, 'love', 0.3, 0); assert(calls.n > 20, 'something drawn inside');
assert(SIB_TIME > 1 && SIB_TIME < 3);

// boss rage face and the p2 head path
drawBossRage(ctx(), 40, 1.3);
for (const sp of Object.keys(SPECIES)) kit.drawHead(ctx(), 0, 0, 40, 0.5, { skin: sp, boss: true, p2: true, t: 2 });

// armour wear thresholds and baked sprites
assert.strictEqual(armorWearLevel(100, 100), 0); assert.strictEqual(armorWearLevel(70, 100), 0);
assert.strictEqual(armorWearLevel(60, 100), 1); assert.strictEqual(armorWearLevel(40, 100), 1);
assert.strictEqual(armorWearLevel(30, 100), 2); assert.strictEqual(armorWearLevel(1, 100), 2);
assert.strictEqual(armorWearLevel(5, 0), 0, 'no max, no wear');
for (const lv of [1, 2]) { assert(kit.SPR.armorWear(lv), 'armorWear ' + lv); assert.strictEqual(kit.SPR.armorWear(lv), kit.SPR.armorWear(lv), 'memoised'); paintArmorWear(ctx(), 40, lv); }
assert.notEqual(kit.SPR.armorWear(1), kit.SPR.armorWear(2));
// the split plate draws more than the cracked one
calls.n = 0; paintArmorWear(counting(), 40, 1); const c1 = calls.n; calls.n = 0; paintArmorWear(counting(), 40, 2); assert(calls.n > c1, 'level 2 is more damaged');

// the crown rolls slower and shorter than before but still leaves the head
const far = crownMotion(0.9, 100, 1).dx; assert(far > 200 && far < 340, 'crown roll distance ' + far);

// wiring
const rend = fs.readFileSync(new URL('../../cell_serpent/render.js', import.meta.url), 'utf8');
assert(/S\.sibT = S\.t/.test(rend) && /sib: S\.sibT/.test(rend), 'render starts and passes the sibling reaction');
assert(/armorWearLevel\(s\.hp, s\.max\)/.test(rend) && /SPR\.armorWear/.test(rend), 'render draws armour wear');
assert(/case 'p':/.test(rend) && /shaped\(e\.x, e\.y - 6, 3, 'p'/.test(rend), 'mender plusses');
const art = fs.readFileSync(new URL('../../cell_serpent/art_draw.js', import.meta.url), 'utf8');
assert(/drawSiblingReact\(g, R, o\.skin/.test(art) && /drawBossRage\(g, R, t\)/.test(art), 'art draws the reaction and the rage');
assert(!/—/.test(fs.readFileSync(new URL('../../cell_serpent/sibling_b11.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../cell_serpent/armor_b11.js', import.meta.url), 'utf8')), 'no em dash');
