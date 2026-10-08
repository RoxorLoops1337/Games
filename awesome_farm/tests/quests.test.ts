// The journal: chapters pay themselves, every objective explains how to do it, and side quests from the island's
// people can be accepted, counted from that moment, finished and chained.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAPTERS } from '../src/shared/data/quests';
import { GIVERS, QUESTS, QUEST_BY_ID } from '../src/shared/data/sidequests';
import { ITEMS } from '../src/shared/data/items';
import { BUILDINGS } from '../src/shared/data/buildings';
import { MAX_ACTIVE_QUESTS, MAX_TRACKED, availableQuests, progressOf, qsOf, stepProgress } from '../src/shared/sim/quests';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };
const setup = (seed: string) => {
    const sim = Sim.create(seed, 'q');
    const p = sim.join('a', 'A')!;
    p.hearts = 99; p.invuln = 999;
    return { sim, p, q: qsOf(p) };
};

test('every objective says how to do it, and the data is consistent', () => {
    for (const c of CHAPTERS) for (const o of c.objectives) {
        assert.ok(o.how && o.how.length > 20, `${c.id}: "${o.text}" needs a hint`);
        for (const [item] of c.reward.items ?? []) assert.ok(ITEMS[item], `${c.id} rewards ${item}`);
    }
    const ids = new Set<string>();
    for (const x of QUESTS) {
        assert.ok(!ids.has(x.id), `duplicate quest ${x.id}`);
        ids.add(x.id);
        assert.ok(GIVERS[x.giver], `${x.id} has a giver`);
        assert.ok(x.after === undefined || QUEST_BY_ID[x.after], `${x.id} comes after a real quest`);
        assert.ok(x.steps.length >= 1 && x.steps.every((o) => o.how && o.how.length > 15), `${x.id} steps explain themselves`);
        assert.ok(x.offer.length > 30 && x.thanks.length > 20);
        for (const [item] of x.reward.items ?? []) assert.ok(ITEMS[item], `${x.id} rewards ${item}`);
        for (const o of x.steps) {
            if (o.key.startsWith('have:')) assert.ok(ITEMS[o.key.slice(5) as keyof typeof ITEMS], `${x.id} counts ${o.key}`);
            if (o.key.startsWith('build:')) assert.ok(BUILDINGS[o.key.slice(6) as keyof typeof BUILDINGS], `${x.id} builds ${o.key}`);
        }
    }
    // each chain starts somewhere reachable without finishing anything
    for (const g of Object.keys(GIVERS)) assert.ok(QUESTS.some((x) => x.giver === g && !x.after), `${g} has a first quest`);
});

test('chapters pay themselves: nothing to claim, and an old backlog is caught up in one go', () => {
    const { sim, p, q } = setup('QT-1');
    // a farmer who did everything in the first two chapters but never opened the Journal (like the ones stuck on chapter 1)
    p.cnt = { 'harvest:tree': 9, 'build:workbench': 1, 'craft:plank': 5, 'build:chest': 1, 'build:campfire': 1, 'build:bed': 1, crop: 3, buy: 1, night: 1, harvest: 9 };
    p.level = 5;
    const coins = p.coins;
    assert.equal(q.ch, 0);
    sim.events = [];
    run(sim, 2.5);
    assert.ok(q.ch >= 2, `moved on to chapter ${q.ch + 1}`);
    assert.ok(p.coins >= coins + 40 + 70, 'both chapter rewards were paid');
    assert.equal(sim.events.filter((e) => e.e === 'banner').length, 1, 'one banner for the catch-up, not one per chapter');
    // the campfire objective of chapter 2 was ticked by a campfire built long before
    const campfire = CHAPTERS[1].objectives.find((o) => o.key === 'build:campfire')!;
    assert.equal(progressOf(sim.s, p, campfire), 1, 'ticked');
});

test('side quests unlock with level and with the quest before them', () => {
    const { sim, p, q } = setup('QT-2');
    p.level = 1;
    assert.equal(availableQuests(p).length, 0, 'nothing at level 1');
    p.level = 3;
    const ids = availableQuests(p).map((x) => x.id);
    assert.ok(ids.includes('m1') && ids.includes('o1') && ids.includes('b1') && ids.includes('w1'));
    assert.ok(!ids.includes('m2'), 'a follow-up waits for the first quest');
    run(sim, 1.2);
    assert.ok(sim.events.some((e) => e.e === 'toast' && /quest/i.test((e as { text: string }).text)), 'the player is told about new quests');
    assert.ok((q.offered ?? []).includes('m1'));
});

test('a quest counts from the moment you accept it, pays once, and opens the next one', () => {
    const { sim, p, q } = setup('QT-3');
    p.level = 5;
    p.cnt = { plant: 10, crop: 10, 'plant:x': 1 };               // old work does not count
    sim.command('a', { t: 'quest', op: 'accept', id: 'm1' });
    const entry = q.log!.find((x) => x.id === 'm1')!;
    assert.ok(entry && entry.track, 'accepted and pinned');
    assert.equal(entry.start.plant, 10);
    const quest = QUEST_BY_ID.m1;
    assert.equal(stepProgress(sim.s, p, quest.steps[0], entry.start), 0);
    const coins = p.coins;
    p.cnt.plant += 4; p.cnt.crop += 3;
    run(sim, 1.2);
    assert.ok(q.log!.some((x) => x.id === 'm1'), 'not done at 3/4 crops');
    p.cnt.crop += 1;
    run(sim, 1.2);
    assert.ok(!q.log!.some((x) => x.id === 'm1'), 'done');
    assert.deepEqual(q.fin, ['m1']);
    assert.equal(p.coins, coins + 40);
    assert.equal(countOf(p, 'seed_carrot') >= 4, true, 'the item reward arrived');
    run(sim, 1.2);
    assert.equal(p.coins, coins + 40, 'it does not pay twice');
    p.level = 5;
    assert.ok(availableQuests(p).some((x) => x.id === 'm2'), 'the next one opens');
});

test('"have" steps read your pockets, state steps read your level, and tracking is capped', () => {
    const { sim, p, q } = setup('QT-4');
    p.level = 20;
    for (const id of ['m1', 'o1', 'b1', 'w1']) sim.command('a', { t: 'quest', op: 'accept', id });
    assert.equal(q.log!.filter((x) => x.track).length, MAX_TRACKED, 'only a few can be pinned');
    assert.equal(q.log!.length, 4);
    // taking too many at once is refused
    for (const id of ['p1', 'f1', 'm1']) sim.command('a', { t: 'quest', op: 'accept', id });
    assert.ok(q.log!.length <= MAX_ACTIVE_QUESTS);
    sim.command('a', { t: 'quest', op: 'abandon', id: 'w1' });
    assert.ok(!q.log!.some((x) => x.id === 'w1'));
    sim.command('a', { t: 'quest', op: 'track', id: 'b1' });
    const have = QUEST_BY_ID.m2.steps[2];
    assert.equal(stepProgress(sim.s, p, have, {}), 0);
    sim.give(p, 'wheat', 7);
    assert.equal(stepProgress(sim.s, p, have, {}), 7);
    sim.give(p, 'wheat', 30);
    assert.equal(stepProgress(sim.s, p, have, {}), 10, 'capped at the goal');
    // a locked or unknown quest cannot be accepted
    p.level = 1;
    sim.command('a', { t: 'quest', op: 'accept', id: 'f4' });
    assert.ok(!q.log!.some((x) => x.id === 'f4'));
    sim.command('a', { t: 'quest', op: 'accept', id: 'nope' });
});

test('quests survive a save and load', () => {
    const { sim, p } = setup('QT-5');
    p.level = 5;
    sim.command('a', { t: 'quest', op: 'accept', id: 'o1' });
    p.cnt = { ...(p.cnt ?? {}), sell: 50 };
    run(sim, 1.2);
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    const q2 = qsOf(back.s.players.a);
    assert.ok(q2.log!.some((x) => x.id === 'o1'));
    assert.deepEqual(q2.offered, qsOf(p).offered);
});
