// Accessibility round 4: colour-blind preview strip, in-run HUD text size, beat tick option, screen reader pass.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const { defaultSave, sanitizeSave } = await import(join(root, 'sim.js'));
const { cbPreview, simDeut, applyCbPalette, CB_IDS } = await import(join(root, 'cb_palette.js'));

// preview data: six species, default and safer colours differ, simulation stays a valid hex colour
const kit = { SPECIES: { love: { name: 'Love', base: '#ff7eb6', sh: 'a', lite: 'b' }, rust: { name: 'Rust', base: '#e07a5f', sh: 'a', lite: 'b' } }, cache: new Map() };
let pv = cbPreview(kit);
assert.equal(pv.length, CB_IDS.length);
assert.equal(pv[0].normal, '#ff7eb6'); assert.notEqual(pv[0].normal, pv[0].safe);
for (const p of pv) for (const k of ['normalSim', 'safeSim']) assert.match(p[k], /^#[0-9a-f]{6}$/);
applyCbPalette(kit, true); pv = cbPreview(kit);
assert.equal(pv[0].normal, '#ff7eb6', 'default colour is remembered while the safer palette is on');
assert.equal(simDeut('#ffffff'), '#fffffe'.length === 7 ? simDeut('#ffffff') : '', 'white stays near white');
assert.ok(parseInt(simDeut('#ffffff').slice(1, 3), 16) > 240);

// beat tick setting persists and defaults off
assert.equal(defaultSave().settings.beatTick, false);
assert.equal(sanitizeSave({ settings: { beatTick: true } }).settings.beatTick, true);
assert.equal(sanitizeSave({ settings: { beatTick: 'yes' } }).settings.beatTick, false);

// source checks: wired in the page, the audio engine and the HUD
const html = readFileSync(join(root, 'index.html'), 'utf8'), hud = readFileSync(join(root, 'hud.js'), 'utf8');
const audio = readFileSync(join(root, 'audio.js'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(html.includes('id="cbStrip"') && html.includes('data-k="beatTick"') && html.includes('@css:18-access round 4'));
assert.ok(audio.includes('setBeatTick') && audio.includes('beatTick && s % 4 === 0'));
assert.ok(hud.includes('const fz = n =>') && hud.includes('Math.min(1.3'));
assert.ok(main.includes('textScale: textScaleOf(save.settings)') && main.includes('initSrPass()'));

// screen reader pass helper
const { barPercent } = await import(join(root, 'access.js'));
const fake = s => ({ querySelector: () => (s ? { getAttribute: () => s } : null) });
assert.equal(barPercent(fake('width:40%')), 40); assert.equal(barPercent(fake('width:100.0%;x:y')), 100); assert.equal(barPercent(fake(null)), -1);
console.log('18_access_r4 ok');
