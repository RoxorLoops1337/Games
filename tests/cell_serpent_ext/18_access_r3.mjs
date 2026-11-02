// Accessibility round 3: text size slider, grid arrow navigation, colour-blind snake palettes, groove tier audio cues.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const { defaultSave, sanitizeSave } = await import(join(root, 'sim.js'));
const acc = await import(join(root, 'access.js'));
const { applyCbPalette, CB_IDS } = await import(join(root, 'cb_palette.js'));

// text size: default 1, clamped, old switch counts as 112%
assert.equal(defaultSave().settings.textScale, 1);
assert.equal(sanitizeSave({ settings: { textScale: 1.25 } }).settings.textScale, 1.25);
assert.equal(sanitizeSave({ settings: { textScale: 9 } }).settings.textScale, 1.4);
assert.equal(sanitizeSave({ settings: { textScale: 0.2 } }).settings.textScale, 1);
assert.equal(sanitizeSave({ settings: { textScale: 'big' } }).settings.textScale, 1);
assert.equal(acc.textScaleOf({ bigText: true }), 1.12); assert.equal(acc.textScaleOf({ textScale: 1.3, bigText: true }), 1.3); assert.equal(acc.textScaleOf({}), 1);
assert.equal(acc.textScaleLabel(1.15), '115%');
const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(html.includes('id="tsRange"') && html.includes('html.ts .scr:not(#hub)') && html.includes('@css:18-access round 3'));

// grid navigation: 2 rows of 3 buttons
const R = (x, y) => ({ x, y, w: 80, h: 40 }), grid = [R(0, 0), R(100, 0), R(200, 0), R(0, 60), R(100, 60), R(200, 60)];
assert.equal(acc.gridNext(grid, 0, 'R'), 1); assert.equal(acc.gridNext(grid, 1, 'L'), 0); assert.equal(acc.gridNext(grid, 1, 'D'), 4); assert.equal(acc.gridNext(grid, 4, 'U'), 1);
assert.equal(acc.gridNext(grid, 2, 'R'), -1); assert.equal(acc.gridNext(grid, 0, 'U'), -1); assert.equal(acc.gridNext(grid, 5, 'D'), -1);
assert.equal(acc.gridNext([R(0, 0), R(100, 0), R(10, 60)], 0, 'D'), 2, 'down picks the column below, not the far row item');

// colour-blind palettes recolour species in place and restore them
const kit = { SPECIES: { rust: { base: '#e07a5f', sh: '1', lite: '2' }, sour: { base: '#5fb85f', sh: '3', lite: '4' }, love: { base: '#ff7eb6', sh: '5', lite: '6' } }, cache: new Map([['x', 1]]) };
assert.equal(applyCbPalette(kit, false), false);
assert.equal(applyCbPalette(kit, true), true); assert.notEqual(kit.SPECIES.rust.base, '#e07a5f'); assert.equal(kit.cache.size, 0);
assert.equal(applyCbPalette(kit, true), false);
assert.equal(applyCbPalette(kit, false), true); assert.equal(kit.SPECIES.rust.base, '#e07a5f'); assert.equal(kit.SPECIES.sour.lite, '4');
assert.ok(CB_IDS.length >= 5);
// the rust and sour cells (red versus green) must differ clearly in brightness in the safe palette
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const live = await import(join(root, 'art_draw.js'));
const liveKit = { SPECIES: live.SPECIES, cache: new Map() };
applyCbPalette(liveKit, true);
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
assert.ok(ratio(live.SPECIES.rust.base, live.SPECIES.sour.base) >= 1.6, 'rust vs sour luminance ' + ratio(live.SPECIES.rust.base, live.SPECIES.sour.base).toFixed(2));
assert.ok(ratio(live.SPECIES.rust.base, live.SPECIES.sneezy.base) >= 2, 'rust vs sneezy luminance');
applyCbPalette(liveKit, false);
assert.equal(live.SPECIES.rust.base, '#e07a5f');

// groove: tier rises are announced, a real streak running out reports -1 once
acc.resetGroove();
assert.equal(acc.watchGroove(0), 0); acc.watchGroove(5); acc.watchGroove(10);
assert.equal(acc.watchGroove(7), 0); assert.equal(acc.watchGroove(3), -1); assert.equal(acc.watchGroove(0), 0);
assert.equal(acc.watchGroove(0), 0); acc.watchGroove(5); assert.equal(acc.watchGroove(0), 0, 'a tier 1 blip is not a streak');
const audioSrc = readFileSync(join(root, 'audio.js'), 'utf8');
assert.ok(audioSrc.includes('groovelost:') && audioSrc.includes('groovehit:'));
assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes("watchGroove(g.groove) < 0"));
for (const f of ['cb_palette.js', 'access.js', 'audio.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);
console.log('18_access_r3 ok');
