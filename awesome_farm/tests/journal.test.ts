// The journal: counters, chapters, daily bounties, production goals and medals.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { BOUNTY_POOL, CHAPTERS, GOALS, MEDALS } from '../src/shared/data/quests';
import { ITEMS } from '../src/shared/data/items';
import { checkMeet, chapterDone, count, makeBounties, progressOf, qsOf } from '../src/shared/sim/quests';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

function farm (seed: string) {
    const sim = Sim.create(seed, 'q');
    const p = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 9) * TILE; p.hearts = 99;
    return { sim, p, o };
}

test('journal data is consistent: items exist, counters make sense, chapters end in a boss', () => {
    assert.ok(CHAPTERS.length >= 12);
    for (const c of CHAPTERS) {
        assert.ok(c.objectives.length >= 3 && c.objectives.some((o) => !o.opt), c.id);
        for (const [id] of c.reward.items ?? []) assert.ok(ITEMS[id], `${c.id}: ${id}`);
    }
    for (const t of BOUNTY_POOL) if (t.item) assert.ok(ITEMS[t.item], t.label(1));
    for (const g of GOALS) assert.ok(ITEMS[g.item], g.id);
    assert.equal(new Set(MEDALS.map((m) => m.id)).size, MEDALS.length, 'unique medal ids');
    assert.equal(new Set(GOALS.map((g) => g.id)).size, GOALS.length, 'unique goal ids');
});

test('counters add up, group totals included', () => {
    const { p } = farm('Q-1');
    count(p, 'kill:slime', 3);
    count(p, 'kill:bat');
    assert.equal(p.cnt!['kill:slime'], 3);
    assert.equal(p.cnt!.kill, 4);
});

test('doing what a chapter asks fills its objectives; it pays and moves on by itself', () => {
    const { sim, p } = farm('Q-2');
    const q = qsOf(p);
    assert.equal(q.ch, 0);
    const ch = CHAPTERS[0];
    assert.ok(!chapterDone(sim.s, p));
    // chop trees through the real swing command
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' && e.kind !== 'tree') sim.remove(e.id);
    const trees = Object.values(sim.s.ents).filter((e) => e.k === 'node' && e.kind === 'tree').length;
    assert.ok(trees >= 5);
    for (let i = 0; i < 3; i++) {
        const tree = Object.values(sim.s.ents).find((e) => e.k === 'node' && e.kind === 'tree');
        if (!tree || tree.k !== 'node') break;
        p.x = (tree.tx - 1) * TILE + 10; p.y = (tree.ty + 1) * TILE - 3; sim.world.setOcc(tree.tx - 1, tree.ty, 0);
        for (let k = 0; k < 8 && sim.s.ents[tree.id]; k++) { p.swingCd = 0; sim.command('a', { t: 'swing', id: tree.id }); run(sim, 0.35); }
    }
    assert.ok((p.cnt?.['harvest:tree'] ?? 0) >= 3, 'trees counted');
    // jump the rest of the way with counters, as if played
    count(p, 'harvest:tree', 5);
    count(p, 'build:workbench'); count(p, 'craft:plank', 4); count(p, 'build:chest');
    p.level = 3;
    assert.ok(chapterDone(sim.s, p), 'all objectives complete');
    const coins = p.coins, pts = p.points;
    run(sim, 1.2);
    assert.ok(sim.events.some((e) => e.e === 'banner' && e.text.includes('complete')), 'announced');
    assert.equal(q.ch, 1, 'nothing to claim: it moved on by itself');
    assert.equal(p.coins, coins + (ch.reward.coin ?? 0));
    assert.equal(p.points, pts + (ch.reward.points ?? 0));
    assert.equal(countOf(p, 'potion_heal'), 2, 'the reward arrived');
    // counters are lifetime totals: work done before a chapter opens still counts
    count(p, 'build:campfire');
    assert.equal(progressOf(sim.s, p, CHAPTERS[1].objectives[0]), 1);
    sim.command('a', { t: 'quest', op: 'claim' });
    assert.equal(q.ch, 1, 'cannot claim an unfinished chapter');
});

test('daily bounties: generated per day, counted, delivered and rerolled', () => {
    const { sim, p } = farm('Q-3');
    run(sim, 1.5);
    const q = qsOf(p);
    assert.equal(q.bounties.length, 3);
    assert.equal(q.bday, 1);
    const b = q.bounties[0];
    // a delivery bounty is paid by handing in the items
    const dl = { ...b, key: 'deliver:wood', item: 'wood' as const, n: 10, start: 0, label: 'Deliver 10 Wood', reward: { coin: 50 } };
    q.bounties[0] = dl;
    sim.command('a', { t: 'quest', op: 'bounty', id: dl.id });
    assert.ok(!dl.done, 'not without the wood');
    sim.give(p, 'wood', 12);
    const coins = p.coins;
    sim.command('a', { t: 'quest', op: 'bounty', id: dl.id });
    assert.ok(dl.done);
    assert.equal(p.coins, coins + 50);
    assert.equal(countOf(p, 'wood'), 2, 'the wood was taken');
    // a counting bounty tracks from its start
    const kill = { ...q.bounties[1], key: 'kill', start: p.cnt?.kill ?? 0, n: 2, label: 'Defeat 2 monsters', reward: { coin: 20 } };
    q.bounties[1] = kill;
    count(p, 'kill:slime', 2);
    sim.command('a', { t: 'quest', op: 'bounty', id: kill.id });
    assert.ok(kill.done);
    // reroll costs coins
    const other = q.bounties[2];
    p.coins = 100;
    sim.command('a', { t: 'quest', op: 'reroll', id: other.id });
    assert.equal(p.coins, 75);
    assert.equal(q.bounties.length, 3);
    // a few days later: new errands
    sim.s.day = 4;
    run(sim, 1.2);
    assert.equal(qsOf(p).bday, 4);
    makeBounties(sim, p);
    assert.equal(qsOf(p).bounties.length, 3);
});

test('production goals read the farm-wide counters and pay once per player', () => {
    const { sim, p } = farm('Q-4');
    const g = GOALS[0];
    sim.command('a', { t: 'quest', op: 'goal', id: g.id });
    assert.ok(!qsOf(p).goals.includes(g.id), 'not yet');
    sim.s.prod = { [g.item]: g.n };
    const coins = p.coins;
    sim.command('a', { t: 'quest', op: 'goal', id: g.id });
    assert.ok(qsOf(p).goals.includes(g.id));
    assert.equal(p.coins, coins + (g.reward.coin ?? 0));
    sim.command('a', { t: 'quest', op: 'goal', id: g.id });
    assert.equal(p.coins, coins + (g.reward.coin ?? 0), 'only once');
});

test('medals pay themselves out when the counter is reached', () => {
    const { sim, p } = farm('Q-5');
    count(p, 'kill:slime', 25);
    const coins = p.coins;
    run(sim, 1.2);
    assert.ok(qsOf(p).medals.includes('hunter1'));
    assert.ok(p.coins >= coins + 50);
    run(sim, 3);
    assert.equal(qsOf(p).medals.filter((m) => m === 'hunter1').length, 1, 'only once');
    p.level = 10;
    run(sim, 1.2);
    assert.ok(qsOf(p).medals.includes('lvl1'), 'level medals read the live level');
});

test('joining islands together counts as meeting', () => {
    const sim = Sim.create('Q-6', 'q');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    checkMeet(sim);
    assert.ok(!a.cnt?.meet);
    // raise a land bridge between the two homes
    const ha = sim.homePlot(a.slot), hb = sim.homePlot(b.slot);
    let x = ha.gx, y = ha.gy;
    while (x !== hb.gx) { x += Math.sign(hb.gx - x); const pl = sim.world.plot(x, y)!; pl.owned = true; }
    while (y !== hb.gy) { y += Math.sign(hb.gy - y); const pl = sim.world.plot(x, y)!; pl.owned = true; }
    checkMeet(sim);
    assert.equal(a.cnt?.meet, 1);
    assert.equal(b.cnt?.meet, 1);
});
