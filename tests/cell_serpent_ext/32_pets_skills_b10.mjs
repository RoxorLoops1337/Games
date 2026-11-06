// Round 10 skills and pets: treats, save sanitizing, mastery path, hatch tag, sheet wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const b = await import(join(root, 'pets_b10.js'));

const s = sim.defaultSave(); const id = sim.PETS[0].id, day = 20000;
assert.equal(b.treatBlock(s, id, day), 'not met');
s.pets[id].star = 1; s.beats = 100;
assert.equal(b.treatBlock(s, id, day), '');
const r = b.feedPet(s, id, day);
assert.deepEqual([r.from, r.to, s.beats, s.pets[id].joy], [0, b.TREAT_JOY, 100 - b.TREAT_COST, b.TREAT_JOY]);
assert.equal(b.treatsLeft(s, id, day), b.TREAT_DAILY - 1);
b.feedPet(s, id, day); const r3 = b.feedPet(s, id, day);
assert.equal(r3.to, 30); assert.equal(r3.tierUp, false, 'joy 30 is still Curious');
const s5 = sim.defaultSave(); s5.pets[id].star = 1; s5.beats = 100; s5.pets[id].joy = 25;
assert.equal(b.feedPet(s5, id, day).tierUp, true, '25 to 35 crosses Content');
assert.equal(b.feedPet(s, id, day), null, 'daily limit');
assert.equal(b.treatBlock(s, id, day), 'daily');
assert.equal(b.treatsLeft(s, id, day + 1), b.TREAT_DAILY, 'new day resets');
// poor and full
const s2 = sim.defaultSave(); s2.pets[id].star = 1; s2.beats = 29;
assert.equal(b.treatBlock(s2, id, day), 'poor'); assert.equal(b.feedPet(s2, id, day), null); assert.equal(s2.beats, 29);
s2.beats = 500; s2.pets[id].joy = 95; const rf = b.feedPet(s2, id, day);
assert.equal(rf.to, sim.PET_JOY_MAX, 'joy is capped'); assert.equal(b.treatBlock(s2, id, day), 'full');
assert.ok(b.treatLabel(s2, id, day).includes('FULL'));

// save round trip keeps treats, old saves and junk get safe defaults
const rt = sim.sanitizeSave(JSON.parse(JSON.stringify(s)));
assert.equal(rt.treats.day, day); assert.equal(rt.treats.n[id], 3);
assert.equal(sim.sanitizeSave({}).treats, undefined);
assert.equal(sim.sanitizeSave({ treats: 5 }).treats, undefined);
const junk = sim.sanitizeSave({ treats: { day: -4, n: { [id]: 'x', ghost: 9 } } });
assert.equal(junk.treats.day, 0); assert.equal(junk.treats.n[id], 0); assert.equal(junk.treats.n.ghost, undefined);
assert.equal(sim.sanitizeSave({ treats: { day: 1, n: { [id]: 99 } } }).treats.n[id], 9);
assert.equal(b.treatsLeft(sim.sanitizeSave({}), id, day), b.TREAT_DAILY);

// mastery path
const sv = sim.defaultSave(); const sk = sim.WEAPONS[0].id;
let mp = b.masteryPath(sv, sk);
assert.equal(mp.steps.length, sim.SKILL_MILES.length); assert.equal(mp.steps[0].state, 'next'); assert.equal(mp.steps[1].state, 'todo');
sv.addict.sk[sk] = 500; mp = b.masteryPath(sv, sk);
assert.deepEqual(mp.steps.map(x => x.state), ['ready', 'ready', 'next', 'todo', 'todo']);
sim.claimMastery(sv, 'sk:' + sk, 0); mp = b.masteryPath(sv, sk);
assert.equal(mp.steps[0].state, 'done');
const html = b.masteryPathHTML(sv, sk); assert.ok(html.includes('mp done') && html.includes('mp ready') && html.includes('mp next') && html.includes('12k'));
assert.ok(!html.includes('—'));

assert.equal(b.hatchTag(true, 3), 'NEW FRIEND'); assert.equal(b.hatchTag(false, 3), '+3 fragments');

// wiring: sheets use the new helpers, main reveals the hatch tag, css block exists
const sheet = readFileSync(join(root, 'skill_sheet.js'), 'utf8');
assert.ok(sheet.includes('upgradeCeremony(') && sheet.includes('masteryPathHTML(') && sheet.includes('feedPet('));
assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes('hatchTag('));
const html0 = readFileSync(join(root, 'index.html'), 'utf8');
for (const c of ['.dstreat', '.upcer', '.mpath', 'htag']) assert.ok(html0.includes(c), 'css ' + c);
for (const f of ['pets_b10.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes('—'), 'no em dash');
