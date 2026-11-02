// Round 9 skills and pets: tile button names, mastery medals, bond steps, collection celebration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const b9 = await import(join(root, 'pets_b9.js'));
const sk = await import(join(root, 'skillpets8.js'));

const w = sim.WEAPONS[0];
const l1 = b9.skillTileLabel(w, { lv: 3 }, { gated: false, eq: true, ready: true, rank: 2 });
assert.ok(l1.includes(w.name) && l1.includes('level 3 of ' + sim.SKILL_MAX_LV) && l1.includes('Silver mastery') && l1.includes('in your loadout') && l1.includes('upgrade ready'), 'owned skill label: ' + l1);
assert.ok(b9.skillTileLabel(w, { lv: 0 }, { gated: true }).includes('locked'), 'locked skill label');
assert.ok(!/[<>]/.test(l1), 'labels are plain text');

const s = sim.defaultSave();
const p = sim.PETS[0];
s.pets[p.id].star = 2; s.pets[p.id].joy = 40;
const l2 = b9.petTileLabel(s, p, s.pets[p.id], true, false);
assert.ok(l2.includes('2 of ' + sim.PET_MAX_STAR + ' stars') && l2.includes('Content') && l2.includes('walking with you'), 'pet label: ' + l2);
assert.ok(b9.petTileLabel(s, sim.PETS[1], s.pets[sim.PETS[1].id], false, true).includes('not met yet'), 'unmet pet label');

assert.equal(b9.bondNext(0).name, 'Content');
assert.equal(b9.bondNext(40).name, 'Happy');
assert.equal(b9.bondNext(40).left, 26);
assert.equal(b9.bondNext(sim.PET_JOY_MAX), null);
assert.ok(b9.bondNote({ joy: 100 }).includes('Best friends'));
assert.ok(b9.bondNote({ joy: 10 }).includes('23 more to Content'));

// collection state and the one-time celebration (no DOM needed: a stub element)
const st0 = b9.collectionState(s); assert.equal(st0.home, false);
for (const q of sim.PETS) s.pets[q.id].star = 1;
assert.equal(b9.collectionState(s).home, true); assert.equal(b9.collectionState(s).perfect, false);
const store = {}; globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const mk = () => ({ cls: new Set(), classList: { toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, s: null } });
const el = mk(); el.classList.s = el.cls;
const calls = []; b9.collectionCelebrate(s, el, t => calls.push(t));
assert.deepEqual(calls, ['home']); assert.ok(el.cls.has('done'));
b9.collectionCelebrate(s, el, t => calls.push(t)); assert.equal(calls.length, 1, 'celebrates once');
for (const q of sim.PETS) s.pets[q.id].star = sim.PET_MAX_STAR;
b9.collectionCelebrate(s, el, t => calls.push(t)); assert.deepEqual(calls, ['home', 'perfect'], 'perfect celebrates once more');
b9.collectionCelebrate(s, el, t => calls.push(t)); assert.equal(calls.length, 2);
assert.ok(sk.collectionHTML(s).includes('Full house'), 'full house text');
delete globalThis.localStorage;

// wiring
const main = readFileSync(join(root, 'main.js'), 'utf8');
assert.ok(main.includes('tileA11y(t, skillTileLabel') && main.includes('tileA11y(t, petTileLabel'), 'tiles get button names');
assert.ok(main.includes('masteryMark(') && main.includes('petOnTile(') && main.includes('collectionCelebrate('), 'main wires the round 9 helpers');
const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(html.includes('@css:09-skills-pets round 9') && html.includes('end @css:09-skills-pets round 9'), 'css block present');
for (const f of ['pets_b9.js', 'index.html']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash in ' + f);
