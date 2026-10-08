// Creatures: wild spawns, pods, companions, dens and the jobs that run in them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { AWAKENINGS, BREED_SECS, breedOffspring, catchChance, PET_NAMES, Pet, petAtk, petMaxHp, pickSpecies, SPECIES, SPECIES_LIST, spOf, starsOf, workCycle } from '../src/shared/data/creatures';
import { SPROUTS } from '../src/shared/data/look';
import { GIVERS } from '../src/shared/data/sidequests';
import { Rng } from '../src/shared/rng';
import { breedTime, cmdPet, petsOf, rosterCap, workSlots } from '../src/shared/sim/creatures';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, CritE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

function yard (seed: string) {
    const sim = Sim.create(seed, 'c');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 9) * TILE; p.fx = 1; p.fy = 0; p.hearts = 99;
    return { sim, p, o };
}
const crits = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is CritE => e.k === 'crit');
let petN = 0;                                                       // (ids only have to differ: a counter, so a run is the same every time)
const pet = (sp: keyof typeof SPECIES, over: Partial<Pet> = {}): Pet => ({ id: `p${++petN}`, sp, name: 'Test', lv: 3, xp: 0, traits: [], ...over });
const den = (sim: Sim, o: { tx: number; ty: number }) => sim.add<BuildE>({ k: 'bld', kind: 'den', tx: o.tx + 5, ty: o.ty + 4, rot: 0, inv: {} });

test('the creature tables are consistent: aptitudes, rarities, spawn pools', () => {
    for (const id of SPECIES_LIST) {
        const s = spOf(id);
        assert.ok(Object.keys(s.work).length >= 1 && Object.values(s.work).every((v) => v! >= 1 && v! <= 5), id);
        assert.ok(s.hp > 0 && s.atk > 0);
    }
    const rng = new Rng('species');
    for (const biome of ['meadow', 'quarry', 'goldsand', 'snowcap', 'bog'] as const) {
        for (const night of [false, true]) {
            for (let i = 0; i < 40; i++) {
                const id = pickSpecies(biome, night, () => rng.next(), 0.5);
                const s = spOf(id);
                assert.ok(s.biomes === 'any' || s.biomes.includes(biome), `${id} in ${biome}`);
                assert.ok(!(s.when === 'night' && !night) && !(s.when === 'day' && night), `${id} at night=${night}`);
            }
        }
    }
    assert.ok(catchChance(0, 1, 1, 0) > catchChance(3, 1, 1, 0), 'rare is harder');
    assert.ok(catchChance(2, 1, 2.6, 0) > catchChance(2, 1, 1, 0), 'better pods help');
    assert.ok(workCycle(pet('pebbit'), 'mine') < workCycle(pet('pebbit', { lv: 1 }), 'mine'), 'levels speed work up');
    assert.equal(workCycle(pet('pebbit'), 'farm'), Infinity, 'no aptitude, no work');
});

test('a pet from the name pool is never called after an island character or the farmers\' mascot', () => {
    assert.ok(PET_NAMES.length >= 18, 'the pool stays rich');
    assert.equal(new Set(PET_NAMES).size, PET_NAMES.length, 'no name twice');
    const folk = new Set([...Object.values(GIVERS).flatMap((g) => g.name.split(' ')), ...SPROUTS, 'Sprout']);
    for (const n of PET_NAMES) assert.ok(!folk.has(n), `${n} is also somebody on the island`);
});

test('wild creatures appear on owned land near players and bolt when you get close', () => {
    const { sim, p } = yard('K-1');
    for (let t = 0; t < 150 && !crits(sim).some((c) => c.mode === 0); t += 5) run(sim, 5);   // they are rare: one turns up within a couple of minutes
    const wild = crits(sim).filter((c) => c.mode === 0);
    assert.ok(wild.length >= 1, 'something wandered in');
    for (const c of wild) assert.ok(sim.world.isLand(Math.floor(c.x / TILE), Math.floor(c.y / TILE)));
    const c = wild[0];
    p.x = c.x - 20; p.y = c.y;
    run(sim, 1);
    assert.equal((sim.s.ents[c.id] as CritE).st, 1, 'it ran');
});

test('pods: they are spent, take a moment to shake, and either befriend or release the creature', () => {
    const { sim, p } = yard('K-2');
    sim.give(p, 'pod', 60);
    let caught = 0, escaped = 0;
    let kept: Pet | undefined;
    for (let i = 0; i < 40; i++) {
        const c = sim.add<CritE>({ k: 'crit', sp: 'hopper', x: p.x + 24, y: p.y, vx: 0, vy: 0, t: 1, lv: 2, mode: 0, st: 0, hx: p.x + 24, hy: p.y, a: 0, life: 100 });
        const before = countOf(p, 'pod');
        sim.command('a', { t: 'tame', id: c.id, pod: 'pod' });
        assert.equal(countOf(p, 'pod'), before - 1);
        assert.equal((sim.s.ents[c.id] as CritE).st, 2, 'inside the pod');
        assert.ok(sim.events.some((e) => e.e === 'pod'));
        const n = petsOf(p).length;
        run(sim, 2.4);
        if (petsOf(p).length > n) { caught++; assert.equal(sim.s.ents[c.id], undefined, 'the creature went into the pod'); if (!kept) kept = petsOf(p)[0]; petsOf(p).splice(0); }
        else { escaped++; assert.equal((sim.s.ents[c.id] as CritE).st, 1, 'it fled'); sim.remove(c.id); }
    }
    assert.ok(caught > 5 && escaped > 5, `caught ${caught}, escaped ${escaped}`);
    const first = kept!;
    assert.ok(first.name && first.lv >= 2 && first.id.startsWith('p'));
    // too far, no pods, full roster
    const far = sim.add<CritE>({ k: 'crit', sp: 'hopper', x: p.x + 300, y: p.y, vx: 0, vy: 0, t: 1, lv: 2, mode: 0, st: 0, a: 0 });
    sim.command('a', { t: 'tame', id: far.id, pod: 'pod' });
    assert.equal((sim.s.ents[far.id] as CritE).st, 0, 'out of range');
});

test('the roster has a cap that skills raise, and work slots too', () => {
    const { p } = yard('K-3');
    assert.equal(rosterCap(p), 12);
    assert.equal(workSlots(p), 4);
    p.skills.t_slot = 3;
    assert.equal(rosterCap(p), 21);
    assert.equal(workSlots(p), 7);
});

test('a companion follows you and fights monsters, earning experience', () => {
    const { sim, p } = yard('K-4');
    const buddy = pet('frostpup', { lv: 5 });
    petsOf(p).push(buddy);
    cmdPet(sim, p, { t: 'pet', op: 'companion', pet: buddy.id });
    run(sim, 0.2);
    const comp = crits(sim).find((c) => c.mode === 1)!;
    assert.ok(comp && comp.pid === buddy.id);
    p.x += 80;
    run(sim, 2);
    assert.ok(Math.hypot(comp.x - p.x, comp.y - p.y) < 50, 'it kept up');
    const m = sim.add<MobE>({ k: 'mob', kind: 'skeleton', x: p.x + 30, y: p.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    run(sim, 6);
    assert.equal(sim.s.ents[m.id], undefined, 'the companion killed it');
    assert.ok(buddy.xp > 0 || buddy.lv > 5, 'and learned something');
    cmdPet(sim, p, { t: 'pet', op: 'rest', pet: buddy.id });
    run(sim, 0.2);
    assert.equal(crits(sim).filter((c) => c.mode === 1).length, 0, 'sent home');
});

test('feeding, renaming and releasing', () => {
    const { sim, p } = yard('K-5');
    const a = pet('hopper', { lv: 1 });
    petsOf(p).push(a);
    sim.give(p, 'treat', 5);
    cmdPet(sim, p, { t: 'pet', op: 'feed', pet: a.id, item: 'treat' });
    assert.ok(a.xp > 0 || a.lv > 1);
    for (let i = 0; i < 4; i++) cmdPet(sim, p, { t: 'pet', op: 'feed', pet: a.id, item: 'treat' });
    assert.ok(a.lv > 1, 'levelled up');
    cmdPet(sim, p, { t: 'pet', op: 'feed', pet: a.id, item: 'wood' });
    assert.equal(countOf(p, 'wood'), 0, 'will not eat wood (and had none)');
    cmdPet(sim, p, { t: 'pet', op: 'rename', pet: a.id, name: '  Sir Hops-a-lot the Third  ' });
    assert.equal(a.name, 'Sir Hops-a-lot');
    const coins = p.coins;
    cmdPet(sim, p, { t: 'pet', op: 'release', pet: a.id });
    assert.equal(petsOf(p).length, 0);
    assert.ok(p.coins > coins);
});

test('a den: assigned creatures work — lumber, mining, farming, hauling and guarding', () => {
    const { sim, p, o } = yard('K-6');
    const d = den(sim, o);
    const lumber = pet('gnaw', { lv: 6 }), farmer = pet('bogsprout', { lv: 6 }), hauler = pet('fuzzle', { lv: 6 });
    petsOf(p).push(lumber, farmer, hauler);
    for (const x of [lumber, farmer, hauler]) cmdPet(sim, p, { t: 'pet', op: 'assign', pet: x.id, den: d.id });
    assert.equal(lumber.den, d.id);
    // some trees and rocks, a ripe bed, a drill-style machine with output waiting
    const addNode = (kind: NodeE['kind'], dx: number, dy: number) => sim.add<NodeE>({ k: 'node', kind, tx: o.tx + dx, ty: o.ty + dy, hp: 1, plot: sim.homePlot(p.slot).i });
    for (let i = 0; i < 4; i++) addNode('tree', 1 + i, 1);
    const bed = sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 8, ty: o.ty + 4, rot: 0, crop: 2, plant: 'seed_wheat', growT: 0 });
    const furnace = sim.add<BuildE>({ k: 'bld', kind: 'furnace', tx: o.tx + 8, ty: o.ty + 7, rot: 0, inv: {}, out: { ironbar: 6 }, fin: {}, fuel: 0, prog: 0 });
    run(sim, 60);
    assert.equal(crits(sim).filter((c) => c.mode === 2).length, 3, 'three workers are visible at the den');
    assert.ok((d.inv?.wood ?? 0) > 0, `wood arrived: ${JSON.stringify(d.inv)}`);
    assert.ok((d.inv?.wheat ?? 0) > 0 || bed.crop !== 2, 'the bed was harvested');
    assert.equal(furnace.out?.ironbar ?? 0, 0, 'the furnace output was hauled away');
    assert.ok((d.inv?.ironbar ?? 0) >= 6, 'into the den');
    assert.ok(lumber.xp > 0 || lumber.lv > 6, 'working earns experience');
    assert.ok(sim.events.some((e) => e.e === 'work'), 'work was announced for the client');
    // unassign: the workers go
    cmdPet(sim, p, { t: 'pet', op: 'unassign', pet: lumber.id });
    run(sim, 0.2);
    assert.equal(crits(sim).filter((c) => c.mode === 2).length, 2);
    // taking the den down frees everyone
    sim.remove(d.id);
    run(sim, 0.2);
    assert.equal(crits(sim).filter((c) => c.mode === 2).length, 0);
    assert.ok(!farmer.den && !hauler.den);
});

test('den limits and the miner / guard jobs', () => {
    const { sim, p, o } = yard('K-7');
    const d = den(sim, o);
    const pets = [pet('pebbit'), pet('cinderkit'), pet('frostpup'), pet('hopper')];
    petsOf(p).push(...pets);
    for (const x of pets) cmdPet(sim, p, { t: 'pet', op: 'assign', pet: x.id, den: d.id });
    assert.equal(pets.filter((x) => x.den).length, 3, 'a den holds three');
    const plotI = sim.homePlot(p.slot).i;
    for (let i = 0; i < 3; i++) sim.add<NodeE>({ k: 'node', kind: 'rock', tx: o.tx + 1 + i, ty: o.ty + 1, hp: 1, plot: plotI });
    const dc = { x: (d.tx + 1) * TILE, y: (d.ty + 2) * TILE };
    const slime = sim.add<MobE>({ k: 'mob', kind: 'slime', x: dc.x + 40, y: dc.y + 20, hp: 3, mhp: 3, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    run(sim, 40);
    assert.ok((d.inv?.stone ?? 0) > 0, 'the pebbit mined');
    assert.equal(sim.s.ents[slime.id], undefined, 'the guards dealt with the slime');
});

test('kindlers stoke a furnace: fuel from storage and a speed boost', () => {
    const { sim, p, o } = yard('K-8');
    const d = den(sim, o);
    d.inv = { coal: 10, iron: 12 };
    const kit = pet('cinderkit', { lv: 5 });
    petsOf(p).push(kit);
    cmdPet(sim, p, { t: 'pet', op: 'assign', pet: kit.id, den: d.id });
    const f = sim.add<BuildE>({ k: 'bld', kind: 'furnace', tx: o.tx + 8, ty: o.ty + 6, rot: 0, inv: { iron: 6 }, out: {}, fin: {}, fuel: 0, prog: 0, by: 'a' });
    run(sim, 40);
    assert.ok((d.inv?.coal ?? 10) < 10 || (f.fuel ?? 0) > 0 || (f.out?.ironbar ?? 0) > 0, 'the furnace got fuel');
    assert.ok((f.boost ?? 0) > 0, 'and a boost');
});

// ── breeding ────────────────────────────────────────────────────────────────
test('offspring: a parent species (rarely a close relative), traits from both parents, never duplicates', () => {
    const rng = new Rng('breed');
    const a = pet('hopper', { traits: ['diligent', 'fierce'] }), b = pet('hopper', { traits: ['diligent', 'lucky'] });
    let mutated = 0, inherited = 0, fresh = 0;
    for (let i = 0; i < 600; i++) {
        const kid = breedOffspring(a, b, rng);
        assert.ok(new Set(kid.traits).size === kid.traits.length && kid.traits.length <= 3, 'no duplicate traits, at most three');
        if (kid.mutated) {
            mutated++;
            assert.notEqual(kid.sp, 'hopper');
            assert.ok(spOf(kid.sp).rarity <= spOf('hopper').rarity + 1, 'a mutation is only a step up');
            assert.equal(spOf(kid.sp).element, 'leaf', 'and a relative of a parent');
        } else assert.equal(kid.sp, 'hopper');
        if (kid.traits.some((t) => t === 'diligent' || t === 'fierce' || t === 'lucky')) inherited++;
        if (kid.traits.some((t) => !['diligent', 'fierce', 'lucky'].includes(t))) fresh++;
    }
    assert.ok(mutated > 10 && mutated < 120, `~8% mutate: ${mutated}`);
    assert.ok(inherited > 300, `most children take something from their parents: ${inherited}`);
    assert.ok(fresh > 40, `and a few come with something new: ${fresh}`);
    // two different species: both turn up
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(breedOffspring(pet('gnaw'), pet('cinderkit'), rng).sp);
    assert.ok(seen.has('gnaw') && seen.has('cinderkit'));
});

test('a hatchery: two creatures, three treats, an egg after a while, and a baby with its parents\' best traits', () => {
    const { sim, p, o } = yard('K-breed');
    const h = sim.add<BuildE>({ k: 'bld', kind: 'hatchery', tx: o.tx + 5, ty: o.ty + 4, rot: 0, by: 'a' });
    const a = pet('gnaw', { id: 'pa', traits: ['hardy', 'swift'], name: 'Ma' }), b = pet('gnaw', { id: 'pb', traits: ['hardy', 'bright'], name: 'Pa' });
    p.pets = [a, b]; p.petSeq = 2;
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'pa', b: 'pb' });
    assert.equal(h.par, undefined, 'no treats, no egg');
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'item', id: 'treat', n: 7 });
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'pa', b: 'pa' });
    assert.equal(h.par, undefined, 'two different creatures');
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'pa', b: 'pb' });
    assert.deepEqual(h.par, ['pa', 'pb']);
    assert.equal(countOf(p, 'treat'), 4, 'three treats were used');
    assert.equal(a.nest, h.id);
    // resting parents cannot be sent anywhere else
    cmdPet(sim, p, { t: 'pet', op: 'companion', pet: 'pa' });
    assert.notEqual(p.comp, 'pa');
    cmdPet(sim, p, { t: 'pet', op: 'release', pet: 'pb' });
    assert.equal(petsOf(p).length, 2, 'cannot be released from the nest');
    sim.command('a', { t: 'breed', op: 'hatch', id: h.id });
    assert.equal(petsOf(p).length, 2, 'nothing to hatch yet');
    run(sim, BREED_SECS - 10);
    assert.equal(h.egg, undefined, 'still forming');
    run(sim, 12);
    assert.ok(h.egg, 'the egg is ready');
    assert.equal(h.par, undefined);
    assert.equal(a.nest, undefined, 'the parents walk free');
    // the baby
    sim.command('a', { t: 'breed', op: 'hatch', id: h.id });
    assert.equal(petsOf(p).length, 3);
    const baby = petsOf(p)[2];
    assert.equal(baby.lv, 1);
    assert.ok(['gnaw'].includes(baby.sp) || spOf(baby.sp).element === 'earth', 'a relative at most');
    assert.equal(h.egg, undefined);
    assert.equal(p.cnt?.hatch, 1, 'the hatching is counted');
    assert.ok(p.dex?.includes(baby.sp));
    // ready for the next clutch
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'pa', b: 'pb' });
    assert.deepEqual(h.par, ['pa', 'pb']);
    sim.command('a', { t: 'breed', op: 'cancel', id: h.id });
    assert.equal(h.par, undefined);
    assert.equal(a.nest, undefined);
});

test('taking a hatchery down while an egg forms sets the parents free, and a load tidies a nest that is gone', () => {
    const { sim, p, o } = yard('K-breed3');
    const h = sim.add<BuildE>({ k: 'bld', kind: 'hatchery', tx: o.tx + 5, ty: o.ty + 4, rot: 0, by: 'a' });
    const a = pet('gnaw', { id: 'pa' }), b = pet('gnaw', { id: 'pb' });
    p.pets = [a, b]; p.petSeq = 2;
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'item', id: 'treat', n: 3 });
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'pa', b: 'pb' });
    assert.equal(a.nest, h.id);
    run(sim, 2);
    // the builder takes it down (within reach: a demolish is a real command)
    p.x = (h.tx + 1) * TILE; p.y = (h.ty + 3) * TILE;
    sim.command('a', { t: 'demolish', id: h.id });
    assert.equal(sim.s.ents[h.id], undefined, 'it is gone');
    assert.equal(a.nest, undefined, 'the mother walks free');
    assert.equal(b.nest, undefined, 'the father too');
    cmdPet(sim, p, { t: 'pet', op: 'companion', pet: 'pa' });
    assert.equal(p.comp, 'pa', 'and can be given something to do again');
    run(sim, 1);
    // a save from before this fix: a nest pointing at nothing, or at a hatchery that is not holding the creature
    a.nest = 999999; b.nest = sim.add<BuildE>({ k: 'bld', kind: 'hatchery', tx: o.tx + 9, ty: o.ty + 4, rot: 0, by: 'a' }).id;
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    const q = again.s.players.a;
    assert.equal(petsOf(q).find((x) => x.id === 'pa')!.nest, undefined, 'tidied on load');
    assert.equal(petsOf(q).find((x) => x.id === 'pb')!.nest, undefined);
});

test('the Nursery skill shortens the wait, a full roster blocks breeding, and others cannot take your egg', () => {
    const { sim, p, o } = yard('K-breed2');
    const h = sim.add<BuildE>({ k: 'bld', kind: 'hatchery', tx: o.tx + 5, ty: o.ty + 4, rot: 0, by: 'a' });
    const base = breedTime(p);
    p.skills.t_nursery = 3;
    assert.ok(breedTime(p) < base * 0.7, 'three ranks of Nursery');
    p.skills.t_nursery = 0;
    p.pets = Array.from({ length: rosterCap(p) }, (_, i) => pet('hopper', { id: 'q' + i }));
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'item', id: 'treat', n: 3 });
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'q0', b: 'q1' });
    assert.equal(h.par, undefined, 'a full roster has no room for a baby');
    p.pets.pop();
    sim.command('a', { t: 'breed', op: 'start', id: h.id, a: 'q0', b: 'q1' });
    assert.ok(h.par);
    // a friend standing here cannot hatch or cancel it
    const q = sim.join('b', 'B')!;
    q.x = p.x + 10; q.y = p.y;
    sim.command('b', { t: 'breed', op: 'cancel', id: h.id });
    assert.ok(h.par, 'not their creatures');
    // a parent that vanished ends the attempt gracefully
    p.pets = p.pets.filter((x) => x.id !== 'q1');
    run(sim, 1);
    assert.equal(h.par, undefined);
    assert.equal(p.pets.find((x) => x.id === 'q0')?.nest, undefined);
});

test('awakening: levels and late-game goods buy stars, stars make a creature stronger, and the first and last bring a trait', () => {
    const { sim, p, o } = yard('K-awaken');
    const a = pet('crystalisk', { lv: 5, traits: ['hardy'] });
    petsOf(p).push(a);
    const denE = den(sim, o);
    const base = { hp: petMaxHp(a), atk: petAtk(a), work: workCycle(a, 'mine') };
    const awaken = () => cmdPet(sim, p, { t: 'pet', op: 'awaken', pet: a.id });
    // too low a level, then no goods
    awaken();
    assert.equal(starsOf(a), 0, 'level 5 is too young');
    a.lv = AWAKENINGS[0].lv;
    awaken();
    assert.equal(starsOf(a), 0, 'no treats or crystals');
    // pay for star one
    sim.give(p, 'treat', 6); sim.give(p, 'crystal', 2);
    sim.events = [];
    awaken();
    assert.equal(starsOf(a), 1);
    assert.equal(countOf(p, 'treat'), 0); assert.equal(countOf(p, 'crystal'), 0);
    assert.ok(sim.events.some((e) => e.e === 'fx' && e.fx === 'awaken'), 'the juice: an awakening effect');
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text.includes('awakened')));
    assert.equal(a.traits.length, 2, 'the first star reveals a trait');
    assert.ok(petMaxHp(a) >= Math.round(base.hp * 1.2) - 1 && petAtk(a) > base.atk * 1.19, 'stronger');
    assert.ok(workCycle(a, 'mine') < base.work, 'and quicker at work');
    // each star has a price and a level
    awaken();
    assert.equal(starsOf(a), 1, 'star two needs level 20');
    a.lv = AWAKENINGS[1].lv;
    sim.give(p, 'treat', 12); sim.give(p, 'crystal', 5); sim.give(p, 'rift_shard', 9);
    awaken();
    assert.equal(starsOf(a), 1, 'one shard short');
    sim.give(p, 'rift_shard', 1);
    awaken();
    assert.equal(starsOf(a), 2);
    assert.equal(a.traits.length, 2, 'the second star brings no trait');
    a.lv = AWAKENINGS[2].lv;
    sim.give(p, 'treat', 20); sim.give(p, 'crystal', 8); sim.give(p, 'rift_core', 2);
    awaken();
    assert.equal(starsOf(a), 3);
    assert.equal(a.traits.length, 3, 'the third star reveals another');
    assert.ok(petAtk(a) >= base.atk * 1.79, 'a fully awakened creature hits far harder');
    awaken();
    assert.equal(starsOf(a), 3, 'three is the top');
    assert.equal(p.cnt?.awaken, 3); assert.equal(p.cnt?.awakenmax, 1);
    // the creature in the world carries its stars (companion and den worker alike)
    p.comp = a.id;
    run(sim, 1);
    const comp = crits(sim).find((c) => c.mode === 1 && c.pid === a.id);
    assert.equal(comp?.star, 3, 'the companion shows three stars');
    p.comp = undefined; a.den = denE.id;
    run(sim, 1);
    assert.equal(crits(sim).find((c) => c.mode === 2 && c.pid === a.id)?.star, 3, 'so does the worker');
    // nothing is taken from someone else's creature, and an egg-sitter cannot be awakened
    const b = pet('hopper', { lv: 30, nest: 99 });
    petsOf(p).push(b);
    sim.give(p, 'treat', 6); sim.give(p, 'crystal', 2);
    cmdPet(sim, p, { t: 'pet', op: 'awaken', pet: b.id });
    assert.equal(starsOf(b), 0);
    assert.equal(countOf(p, 'treat'), 6);
});
