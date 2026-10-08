// XP: the brews of the Alchemy Table, Scholar's Day, the lessons a farmer learns from their working creatures, and the
// skill tree's XP nodes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import type { Pet } from '../src/shared/data/creatures';
import { eventTag, forecastHint } from '../src/shared/data/forecast';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { LOOT_POOL } from '../src/shared/data/loot';
import { RECIPES } from '../src/shared/data/recipes';
import { SKILLS } from '../src/shared/data/skills';
import { BUFFS } from '../src/shared/data/stats';
import { cmdPet, petsOf } from '../src/shared/sim/creatures';
import { cmdEat } from '../src/shared/sim/economy';
import { crewShare } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import { derived, learnSkill, MAX_LEVEL, xpToNext } from '../src/shared/sim/stats';
import type { BuildE, NodeE, PlayerS } from '../src/shared/sim/types';
import { forecast, scholarDay } from '../src/shared/weather';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };
const BREWS: ItemId[] = ['potion_study', 'potion_insight', 'potion_memory', 'potion_kin'];

/** One farmer on a bare home island. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'x');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const plot = sim.homePlot(p.slot);
    const o = sim.world.plotOrigin(plot);
    p.x = (o.tx + 1) * TILE; p.y = (o.ty + 1) * TILE; p.hearts = 99; p.invuln = 9999;
    return { sim, p, o, plot: plot.i };
}
const drink = (sim: Sim, p: PlayerS, id: ItemId) => { p.inv[id] = (p.inv[id] ?? 0) + 1; cmdEat(sim, p, id); };

test('the XP brews: each is brewed at the Alchemy Table, turns up in chests, and does what it says', () => {
    for (const id of BREWS) {
        assert.ok(ITEMS[id], id);
        assert.ok(Object.values(RECIPES).some((r) => r.out === id && r.station === 'alchemy'), `${id} is brewed at the Alchemy Table`);
        assert.ok(Object.values(LOOT_POOL).some((rows) => rows.some((r) => r.item === id)), `${id} turns up in loot`);
    }
    const { sim, p } = yard('XP-1');
    assert.equal(derived(p).xpMul, 1);
    drink(sim, p, 'potion_study');
    assert.equal(derived(p).xpMul, 1.5, "Scholar's Tea: +50%");
    drink(sim, p, 'potion_insight');
    assert.equal(derived(p).xpMul, 2.5, 'the Elixir of Insight stacks with it: +100%');
    assert.equal(p.inv.potion_study ?? 0, 0, 'drunk, not kept');
    drink(sim, p, 'potion_kin');
    assert.ok(BUFFS.kinship.mods.crewXp! > 0 && derived(p).mods.crewXp === BUFFS.kinship.mods.crewXp);
});

test('Bottled Memories gives a quarter of the current level at once, at any level, but not at the top', () => {
    for (const level of [1, 20, 60]) {
        const { sim, p } = yard(`XP-2-${level}`);
        p.level = level; p.xp = 0;
        drink(sim, p, 'potion_memory');
        assert.ok(Math.abs(p.xp - xpToNext(level) * 0.25) < 1e-6, `level ${level}: ${p.xp}`);
        assert.equal(p.inv.potion_memory ?? 0, 0);
    }
    const { sim, p } = yard('XP-2-top');
    p.level = MAX_LEVEL;
    drink(sim, p, 'potion_memory');
    assert.equal(p.inv.potion_memory, 1, 'kept: there is nothing left to learn');
});

test("Scholar's Day: from the seed alone, on the weather vane, and double XP for everybody until the next dawn", () => {
    assert.equal(scholarDay('any', 3), false, 'never in the first days');
    assert.equal(scholarDay('any', 5), true, 'day 5 always is one');
    assert.equal(scholarDay('any', 15), true, 'and every tenth day after it');
    const f = forecast('any', 4, 3);
    assert.equal(f[1].study, true);
    assert.equal(eventTag(f[1])!.text, "Scholar's Day");
    assert.match(forecastHint(f), /Scholar's Day tomorrow/);

    const { sim, p } = yard('XP-3');
    sim.s.day = 4; sim.s.night = true; sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    run(sim, 0.1);
    assert.equal(sim.s.day, 5);
    assert.ok(p.buffs.some((b) => b.id === 'scholarday'), 'a new day brings it');
    assert.equal(derived(p).xpMul, 2);
    assert.ok(sim.events.some((e) => e.e === 'banner' && /Scholar/.test((e as { title?: string }).title ?? JSON.stringify(e))), 'with a banner');
    // a farmer who comes later gets it too; the next dawn takes it back
    const q = sim.join('b', 'B')!;
    assert.ok(q.buffs.some((b) => b.id === 'scholarday'));
    sim.s.night = true; sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    run(sim, 0.1);
    assert.equal(sim.s.day, 6);
    assert.ok(!p.buffs.some((b) => b.id === 'scholarday') && !q.buffs.some((b) => b.id === 'scholarday'), 'gone the next day');
});

test('creatures at work teach their keeper: a share of their XP, more with Shared Lessons, Pack Lore and a Kinship Tonic', () => {
    const { sim, p, o, plot } = yard('XP-4');
    sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + 8, ty: o.ty + 8, rot: 0, inv: {} });
    for (let i = 0; i < 6; i++) sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 3 + i, ty: o.ty + 3, hp: 3, plot });
    const g: Pet = { id: 'g1', sp: 'gnaw', name: 'Gnaw', lv: 6, xp: 0, traits: [] };
    petsOf(p).push(g);
    cmdPet(sim, p, { t: 'pet', op: 'post', pet: g.id, at: { plot, job: 'gather' } });
    p.level = 10; p.xp = 0;
    run(sim, 60);
    assert.ok(p.xp > 0 || p.level > 10, 'the keeper learned something without lifting a finger');
    assert.ok((p.lessons ?? 0) > 0, 'and it is counted for the dawn summary');
    // the dawn tells the keeper how much, and starts counting again
    sim.events.length = 0;
    sim.s.night = true; sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    run(sim, 0.1);
    assert.ok(sim.events.some((e) => e.e === 'toast' && /creatures taught you \d+ XP/.test((e as { text: string }).text)));
    assert.equal(p.lessons, undefined);

    assert.equal(crewShare(derived(p)), TUNING.crewXpShare);
    p.points = 99;
    for (const id of ['t_pod', 't_slot', 't_foreman', 't_stable', 't_mentor']) while (learnSkill(p, id)) { /* every rank */ }
    assert.ok(Math.abs(crewShare(derived(p)) - (TUNING.crewXpShare + 0.3)) < 1e-9, 'Shared Lessons: +10% a rank, three ranks');
    assert.ok(SKILLS.t_lore.mods!.crewXp! > 0 && SKILLS.x_sage.mods!.xp! > 0, 'Pack Lore and Sage add more');
});
