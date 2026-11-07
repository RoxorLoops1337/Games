// GRAFTWORK modular room kit and its lab page: kit manifest valid, every file exists and is a WebP, size budget, the lab page and script
// reference files that exist, the lab only uses kit ids the manifest knows, no em dashes anywhere in the kit, the lab or the build tool.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../graftwork/', import.meta.url).pathname;
const kit = join(root, 'assets/ward_kit');
const man = JSON.parse(readFileSync(join(kit, 'manifest.json'), 'utf8'));
const wardMan = JSON.parse(readFileSync(join(root, 'assets/ward/manifest.json'), 'utf8'));
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const files = (e) => [e.file, e.file1x, e.file2x].filter(Boolean);
const webp = (f) => { const b = readFileSync(join(kit, f)); assert.equal(b.toString('latin1', 0, 4), 'RIFF', f); assert.equal(b.toString('latin1', 8, 12), 'WEBP', f); return b; };
const num = (v, name) => assert.ok(Number.isFinite(v) && v > 0, name);

t('kit_manifest_schema', () => {
  assert.ok(man.version >= 1);
  for (const k of ['floors', 'walls', 'pieces', 'props']) assert.equal(typeof man[k], 'object', k);
  assert.ok(Object.keys(man.floors).length >= 2 && Object.keys(man.walls).length >= 2, 'two themes');
  assert.ok(Object.keys(man.pieces).length >= 4 && Object.keys(man.props).length >= 10, 'pilot asset list');
  for (const id of ['window', 'door', 'banner', 'sconce']) assert.ok(man.pieces[id], 'piece ' + id);
  for (const id of ['sawbench', 'planks', 'toolrack', 'bed', 'stool', 'crate', 'bucket', 'shelf', 'rocks', 'generator']) assert.ok(man.props[id], 'prop ' + id);
});
t('kit_files_exist_and_are_webp', () => {
  for (const group of ['floors', 'walls', 'pieces', 'props']) for (const [id, e] of Object.entries(man[group])) {
    assert.ok(e.file && e.file1x && e.file2x, group + '.' + id + ' files');
    for (const f of files(e)) { assert.ok(existsSync(join(kit, f)), f); webp(f); }
  }
});
t('sprites_have_alpha_and_anchors', () => {
  for (const group of ['pieces', 'props']) for (const [id, e] of Object.entries(man[group])) {
    for (const f of [e.file1x, e.file2x]) { const b = webp(f); const tag = b.toString('latin1', 12, 16); if (tag === 'VP8X') assert.ok(b[20] & 0x10, 'no alpha ' + f); else assert.equal(tag, 'VP8L', 'no alpha ' + f); }
    for (const k of ['w', 'h', 'anchorX', 'anchorY']) num(e[k] + (k.startsWith('anchor') ? 1 : 0), id + '.' + k);
    assert.ok(e.anchorX <= e.w && e.anchorY <= e.h, id + ' anchor inside the sprite');
    assert.ok(e.w >= 64 && e.w <= 460 && e.h >= 64 && e.h <= 460, id + ' size ' + e.w + 'x' + e.h);
  }
  for (const [id, e] of Object.entries(man.props)) {
    assert.ok(Array.isArray(e.footprint) && e.footprint.length === 2 && e.footprint.every((v) => Number.isInteger(v) && v >= 1 && v <= 4), id + ' footprint');
    num(e.sw, id + '.sw');
  }
  for (const [id, e] of Object.entries(man.pieces)) assert.ok(['floor', 'mid'].includes(e.wallSlot), id + ' wallSlot');
});
t('textures_are_512_and_half_size_variants', () => {
  for (const group of ['floors', 'walls']) for (const [id, e] of Object.entries(man[group])) assert.equal(e.tile, 512, id);
});
t('half_size_variants_are_smaller', () => {
  for (const group of ['pieces', 'props']) for (const [id, e] of Object.entries(man[group])) assert.ok(statSync(join(kit, e.file1x)).size < statSync(join(kit, e.file2x)).size, id);
});
const dirSize = (d) => readdirSync(d, { withFileTypes: true }).reduce((s, f) => s + (f.isDirectory() ? dirSize(join(d, f.name)) : statSync(join(d, f.name)).size), 0);
t('kit_folder_under_budget', () => { assert.ok(dirSize(kit) < 4 * 1024 * 1024, 'kit folder is ' + dirSize(kit) + ' bytes'); });
const html = readFileSync(join(root, 'lab/rooms.html'), 'utf8'), js = readFileSync(join(root, 'lab/rooms.js'), 'utf8');
t('lab_page_references_existing_files', () => {
  assert.ok(/<script[^>]+type="module"[^>]+src="rooms\.js"/.test(html));
  assert.ok(existsSync(join(root, 'lab/rooms.js')));
  assert.ok(html.includes('name="viewport"') && html.includes('id="cv"') && html.includes('id="banner"'), 'viewport, canvas, fallback banner');
  assert.ok(js.includes("'../assets/ward_kit/'") && js.includes("'../assets/ward/'"));
  assert.ok(existsSync(join(root, 'assets/ward_kit/manifest.json')) && existsSync(join(root, 'assets/ward/manifest.json')));
});
t('lab_uses_only_known_ids', () => {
  const ids = (re) => [...js.matchAll(re)].map((m) => m[1]);
  const props = new Set(), pieces = new Set();
  for (const m of js.matchAll(/\[\s*'([a-z]+)'\s*,\s*(\d)\s*,\s*(\d)(?:\s*,\s*\d)?\s*\]/g)) props.add(m[1]);
  for (const m of js.matchAll(/\[\s*'([a-z]+)'\s*,\s*'[LR]'\s*,\s*[\d.]+\s*\]/g)) pieces.add(m[1]);
  assert.ok(props.size >= 8 && pieces.size >= 3);
  for (const id of props) assert.ok(man.props[id], 'unknown prop ' + id);
  for (const id of pieces) assert.ok(man.pieces[id], 'unknown piece ' + id);
  for (const id of ids(/'(?:floor|wall)':\s*'([a-z]+)'/g)) assert.ok(man.floors[id] || man.walls[id], 'unknown theme ' + id);
  for (const id of ids(/mkActor\('([a-z_]+)'/g)) assert.ok(wardMan.actors[id], 'unknown actor ' + id);
  const mon = [...js.matchAll(/MONSTERS = \{([^}]*)\}/g)][0][1]; for (const m of mon.matchAll(/'([a-z_]{4,})'/g)) assert.ok(wardMan.actors[m[1]], 'unknown monster ' + m[1]);
  assert.ok(wardMan.rooms.rm_sawmill, 'painted sawmill for the comparison');
});
t('lab_has_the_four_scenes_and_controls', () => {
  for (const s of ['compare:', 'build:', 'hospital:', 'day:']) assert.ok(js.includes(s), s);
  for (const w of ["'full'", "'low'", "'cutaway'", 'wheel', 'pointerdown', 'Generator', 'Structure']) assert.ok(js.includes(w), w);
});
t('no_em_dashes', () => {
  const tool = readFileSync(new URL('../tools/graftwork_kit_build.py', import.meta.url), 'utf8');
  for (const [name, s] of [['rooms.html', html], ['rooms.js', js], ['graftwork_kit_build.py', tool], ['manifest.json', JSON.stringify(man)]]) assert.ok(!/[—–]/.test(s), 'em or en dash in ' + name);
});
console.log(n + ' lab checks passed');
