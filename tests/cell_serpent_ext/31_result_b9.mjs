// 31 result round 9: pause build chips with real run levels, stage line, CLAIM ALL reward flight, BRING THEM, lucky-win fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const B = await import(join(root, 'result_b9.js'));
const S = await import(join(root, 'sim.js'));
const main = readFileSync(join(root, 'main.js'), 'utf8'), html = readFileSync(join(root, 'index.html'), 'utf8');
const addict = readFileSync(join(root, 'addict_ui.js'), 'utf8');

// pause build: loadout order first (even before anything is picked), then weapons picked up in the run
let pb = B.pauseBuild({}, ['swab', 'tower']);
assert.deepEqual(pb, [{ id: 'swab', lv: 0 }, { id: 'tower', lv: 0 }]);
pb = B.pauseBuild({ tower: { lv: 5 }, dragon: { lv: 2 }, swab: { lv: 3 } }, ['swab', 'tower']);
assert.deepEqual(pb.map(x => x.id + x.lv), ['swab3', 'tower5', 'dragon2']);
assert.deepEqual(B.pauseBuild(null, null), []);
assert.ok(B.buildChipHTML({ id: 'swab', lv: 5 }, '<i></i>').includes('pb9 t5'));
assert.ok(B.buildChipHTML({ id: 'swab', lv: 3 }, '<i></i>').includes('pb9 t3'));
assert.ok(B.buildChipHTML({ id: 'swab', lv: 1 }, '<i></i>').includes('LV 1'));
assert.ok(B.buildChipHTML({ id: 'swab', lv: 0 }, '<i></i>').includes('t0') && !B.buildChipHTML({ id: 'swab', lv: 0 }, '').includes('LV'));
assert.equal(B.buildLine(pb), '7 upgrades picked');
assert.equal(B.buildLine([{ id: 'a', lv: 2 }]), '1 upgrade picked');
assert.equal(B.buildLine([{ id: 'a', lv: 0 }]), 'Pick yellow cells to upgrade');
assert.equal(B.pauseSub(8, 'Mighty Mamba'), 'Stage 8: Mighty Mamba. The snake waits.');
assert.equal(B.pauseSub(3, ''), 'Take a breath. The snake waits.');

// CLAIM ALL pays exactly what the sum says, and the sum does not touch the save
const save = S.defaultSave ? S.defaultSave() : S.sanitizeSave({});
save.addict.sp.love = 600; save.addict.sk.swab = 60;   // 3 species ranks (60 beats, 6 sparkles, 1 egg) and 1 skill rank (60 beats)
const before = JSON.stringify(save);
const tot = B.readyMasteryReward(S.masteryList(save), save.addict.claimed);
assert.equal(JSON.stringify(save), before, 'pure');
assert.deepEqual(tot, { beats: 120, sparkles: 6, eggs: 1, energy: 0 });
const b0 = save.beats, s0 = save.sparkles;
assert.equal(S.claimAllMastery(save), 4);
assert.equal(save.beats - b0, tot.beats); assert.equal(save.sparkles - s0, tot.sparkles);
assert.ok(!B.hasReward(B.readyMasteryReward(S.masteryList(save), save.addict.claimed)), 'nothing left after claiming');
assert.ok(!B.hasReward(null) && B.hasReward({ eggs: 1 }));

// BRING THEM: the button only shows when a better build is reachable
assert.ok(B.bringBtnHTML(true).includes('data-bring') && B.bringBtnHTML(false) === '');
const rec = await import(join(root, 'build_rec.js'));
const sv = S.sanitizeSave({}); for (const id of ['maw', 'tower', 'stick']) sv.skills[id].lv = 2; sv.loadout = ['swab'];
const out = rec.bestBuild(sv, 'mighty');
assert.ok(out && out.includes('tower') && out.length <= S.LOADOUT_SIZE, 'bestBuild packs owned picks');
const bu = await import(join(root, 'battle_ui.js'));
assert.ok(bu.bringHTML({ why: 'x', can: true, items: [{ name: 'Tower', ic: '', eq: false, own: true }] }).includes('ff-go9'));
assert.ok(!bu.bringHTML({ why: 'x', can: false, items: [{ name: 'Tower', ic: '', eq: true, own: true }] }).includes('ff-go9'));

// lucky win fixture: five weapon fragments, a pet and an egg in one result (the longest the result list gets)
{
  const sv2 = S.sanitizeSave({}), r = { won: true, stage: 5, kills: 120, coins: 300, frags: { swab: 3, tower: 2, dragon: 2, maw: 1, stick: 1 }, stars: 3, progress: 1, time: 90 };
  const o = S.applyResult(sv2, r);
  assert.equal(Object.keys(o.frags).length, 5);
  assert.equal(o.beats, 300);
}

// wiring and css
assert.ok(/pauseBuild\(g\.weap, save\.loadout\)/.test(main) && /pauseSub\(g\.stage/.test(main), 'pause wired');
assert.ok(/ff-go9/.test(main) && /bestBuild\(save, info\.skin\)/.test(main), 'bring wired');
assert.ok(/flyReward\(claimAll, tot/.test(addict), 'claim all flies');
assert.ok(html.includes('@css:11-result-pause round 9') && /#pause \.pb9n\{/.test(html) && /max-height:700px\)\{#pause \.pb9n\{display:none\}/.test(html), 'css');
const nd = String.fromCharCode(8212);
for (const f of ['result_b9.js', 'main.js', 'index.html', 'addict_ui.js', 'battle_ui.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes(nd), 'no em dash ' + f);
console.log('31_result_b9 ok');
