// Batch 8 animal art: slump faces for piglet, lamb and hamster, singing cheer frame, weapon level tiers, pet idle tricks (source level, headless).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cheerFrame } from '../../cell_serpent/duo_cheer.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const art = rd('art_draw.js'), r = rd('render.js'), ch = rd('duo_cheer.js');
assert.equal(cheerFrame(null, true), null);
assert.equal(cheerFrame({ width: 520, height: 460 }, true), null);   // no document in node
for (const k of ['piglet', 'lamb', 'hamster']) { const i = art.indexOf("k === '" + k + "'"); assert.ok(i > 0); assert.ok(art.slice(i, i + 2600).includes('MOOD === 7'), k + ' slump'); }
assert.ok(art.includes('function wpnTier') && art.includes('mood >> 4'));
assert.ok(r.includes('wT(g, ') && r.includes('function petTrick'));
assert.ok(r.includes('cheerFrame(art.get(key), singing)'));
assert.ok(!/—/.test(art + r + ch));
console.log('26_animal_art_r8 ok');
