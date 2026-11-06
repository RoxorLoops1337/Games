// GRAFTWORK Ward art: manifest parses, every room has both files, files are real WebP with alpha, size budget, no em dashes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../graftwork/assets/ward/', import.meta.url).pathname;
const { ROOMS, BUILD_CARDS } = await import('../graftwork/data/ward.js');
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const raw = readFileSync(join(root, 'manifest.json'), 'utf8');
const man = JSON.parse(raw);
const files = (e) => [e.file1x, e.file2x, e.walk1x, e.walk2x].filter(Boolean);
const webp = (f) => {
  const b = readFileSync(join(root, f));
  assert.equal(b.toString('latin1', 0, 4), 'RIFF', f); assert.equal(b.toString('latin1', 8, 12), 'WEBP', f);
  const tag = b.toString('latin1', 12, 16);
  // alpha lives in VP8X flag bit 4, or in a lossless VP8L stream
  if (tag === 'VP8X') assert.ok(b[20] & 0x10, 'no alpha flag ' + f); else assert.equal(tag, 'VP8L', 'no alpha ' + f);
  return b;
};
t('manifest_schema', () => {
  assert.ok(man.version >= 1); assert.ok(man.tile.w > 0 && man.tile.h > 0);
  for (const k of ['rooms', 'actors', 'icons', 'cards']) assert.equal(typeof man[k], 'object', k);
});
t('every_room_has_entry_and_files', () => {
  for (const id of Object.keys(ROOMS)) {
    const e = man.rooms[id]; assert.ok(e, 'missing room ' + id);
    for (const f of [e.file1x, e.file2x]) assert.ok(existsSync(join(root, f)), f);
    for (const k of ['w', 'h', 'floorCx', 'floorCy', 'floorW', 'floorH']) assert.ok(Number.isFinite(e[k]) && e[k] > 0, id + '.' + k);
    assert.ok(e.floorCx < e.w && e.floorCy < e.h);
  }
  assert.ok(man.rooms.plot_empty, 'plot tile');
});
t('floor_diamonds_are_consistent_so_rooms_tile', () => {
  const ws = Object.entries(man.rooms).filter(([k]) => k !== 'plot_empty').map(([, e]) => e.floorW);
  assert.ok(Math.max(...ws) - Math.min(...ws) < 8);
});
t('every_building_card_resolves_to_an_image', () => {
  for (const c of Object.values(BUILD_CARDS)) {
    const m = man.cardsById[c.id]; assert.ok(m, c.id);
    const e = m.room ? man.rooms[m.room] : man.cards[m.card];
    assert.ok(e && existsSync(join(root, e.file2x)), c.id);
  }
});
t('resource_and_phase_icons', () => {
  for (const id of ['wood', 'stone', 'gold', 'power', 'morning', 'midday', 'evening', 'night']) assert.ok(man.icons[id], id);
});
t('actors_have_anchor_and_files', () => {
  for (const id of ['marrow', 'wick', 'odile', 'the_matron', 'the_resident', 'the_resident_l2']) assert.ok(man.actors[id], id);
  for (const [id, e] of Object.entries(man.actors)) { assert.ok(e.anchorX > 0 && e.anchorY > 0 && e.anchorY <= e.h, id); for (const f of files(e)) assert.ok(existsSync(join(root, f)), f); }
});
t('all_files_are_webp_with_alpha', () => {
  for (const sec of ['rooms', 'actors', 'icons', 'cards']) for (const e of Object.values(man[sec])) for (const f of files(e)) webp(f);
});
t('total_size_under_budget', () => {
  let total = 0;
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else total += statSync(p).size; } };
  walk(root); assert.ok(total < 12 * 1024 * 1024, 'size ' + total);
});
t('no_em_dashes', () => { assert.ok(!raw.includes(String.fromCharCode(0x2014))); });
console.log(n + ' ok');
