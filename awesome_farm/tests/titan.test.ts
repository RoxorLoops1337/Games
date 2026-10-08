// Titan nodes: a Great Oak and a Titan Boulder that only fall to two or more farmers swinging together, pay every helper
// their own share (more for each extra hand), and only grow in a world with at least two farmers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIONS } from '../src/shared/actions';
import { TILE } from '../src/shared/config';
import { CRATE_ITEM, TITAN_CRATE } from '../src/shared/data/loot';
import { HINTS } from '../src/shared/data/hints';
import { SPECIES, type Pet } from '../src/shared/data/creatures';
import { NODES, TITAN, type NodeKind } from '../src/shared/data/nodes';
import * as fortune from '../src/shared/sim/fortune';
import * as gather from '../src/shared/sim/gather';
import { cmdPet, petsOf } from '../src/shared/sim/creatures';
import { Sim } from '../src/shared/sim/sim';
import * as titan from '../src/shared/sim/titan';
import { countOf } from '../src/shared/sim/stats';
import type { DropE, NodeE, PlayerS, Plot, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

/** A clean yard with `n` farmers standing at one node (a Great Oak unless said otherwise). Time is moved by hand (`later`), so nothing else in the world stirs. */
function glade (seed: string, n = 2, kind: NodeKind = 'titan_oak') {
    const sim = Sim.create(seed, 'ti');
    const people: PlayerS[] = [];
    for (let i = 0; i < n; i++) people.push(sim.join(IDS[i], IDS[i].toUpperCase())!);
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || e.k === 'mob') sim.remove(e.id);
    const a = people[0];
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    const plot = sim.homePlot(a.slot);
    plot.mod = null;
    const node = sim.add<NodeE>({ k: 'node', kind, tx: o.tx + 8, ty: o.ty + 6, hp: NODES[kind].hp, plot: plot.i });
    const c = sim.center(node);
    people.forEach((p, i) => { p.x = c.x - 14 + i * 5; p.y = c.y + 10; p.warp++; p.hearts = 99; p.invuln = 99999; p.energy = 100; p.fx = 0; p.fy = -1; });
    sim.events = [];
    return { sim, people, node, o, plot, c };
}
const swing = (sim: Sim, p: PlayerS, n: { id: number }) => { p.swingCd = 0; p.energy = 100; sim.command(p.id, { t: 'swing', id: n.id }); };
const later = (sim: Sim, s: number) => { sim.s.time += s; };
const hpOf = (sim: Sim, n: { id: number }) => (sim.s.ents[n.id] as NodeE | undefined)?.hp;
const events = <T extends SimEvent['e']>(sim: Sim, e: T) => sim.events.filter((x): x is Extract<SimEvent, { e: T }> => x.e === e);
const floats = (sim: Sim, text: string, to?: string) => events(sim, 'float').filter((f) => f.text === text && (!to || f.to === to));
const worldDice = (sim: Sim) => (sim.rng as unknown as { s: number }).s;

/** Everyone swings once, then a third of a second passes: until the node is gone. Returns how many rounds it took. */
function felled (sim: Sim, people: PlayerS[], n: { id: number }, max = 2000) {
    for (let r = 1; r <= max; r++) {
        for (const p of people) swing(sim, p, n);
        later(sim, 0.35);
        if (!sim.s.ents[n.id]) return r;
    }
    return assert.fail('it never fell');
}

// ── the tables ──────────────────────────────────────────────────────────────
test('the two Titans are in the node table with a lot of hit points, big drops and the flag', () => {
    for (const k of ['titan_oak', 'titan_rock'] as const) {
        const d = NODES[k];
        assert.ok(d.titan, `${k} is a Titan`);
        assert.ok(d.hp >= 60 && d.hp > NODES.tree.hp * 20, `${k}: a lot of hit points`);
        assert.ok(d.drops.some(([res, min]) => (res === 'wood' || res === 'stone') && min >= 20), `${k}: a big pile`);
        assert.ok(d.tex('meadow').length > 0);
    }
    assert.equal(NODES.titan_oak.group, 'wood');
    assert.equal(NODES.titan_rock.group, 'stone');
    assert.equal(NODES.titan_oak.tex('snowcap'), 'titan_pine', 'a pine in the snow');
    for (const k of Object.keys(NODES) as NodeKind[]) if (!NODES[k].titan) assert.ok(!k.startsWith('titan'), 'only the Titans are flagged');
    assert.ok(TITAN.minHands === 2 && TITAN.window === 3 && TITAN.share === 6 && TITAN.maxHands === 4 && TITAN.handBonus === 0.5);
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(titan.handsMul), [1, 1.5, 2, 2.5, 2.5, 2.5], 'fifty per cent more per extra hand, up to four hands');
    assert.deepEqual([0, -3, NaN, Infinity].map(titan.handsMul).map((x) => Number.isFinite(x)), [true, true, true, true], 'hostile counts are still numbers');
    assert.ok((ACTIONS as readonly string[]).includes('hollow') && (ACTIONS as readonly string[]).includes('titan'));
    assert.ok(TITAN_CRATE.every(([t, c]) => CRATE_ITEM[t] && c > 0 && c < 1));
});

// ── the rule ────────────────────────────────────────────────────────────────
test('one farmer cannot hurt it: a hollow knock, and a word about needing a friend (once in a while)', () => {
    const { sim, people: [a], node } = glade('TI-1');
    for (let i = 0; i < 40; i++) { swing(sim, a, node); later(sim, 0.32); }
    assert.equal(hpOf(sim, node), NODES.titan_oak.hp, 'not a scratch');
    assert.equal(events(sim, 'fx').filter((e) => e.fx === 'hollow' && e.by === 'a').length, 40, 'a hollow knock every swing');
    assert.ok(!events(sim, 'fx').some((e) => e.fx === 'hitWood'), 'and never a chop');
    const says = floats(sim, 'Needs a friend!', 'a').length;
    assert.ok(says >= 2 && says <= 4, `the float did not spam: ${says} in 13 seconds`);
    assert.equal(floats(sim, 'Needs a friend!').filter((f) => f.to !== 'a').length, 0, 'told to the one who swung');
    assert.equal(a.stats.harvested, 0);
});

test('two different farmers within three seconds do full damage, each swing', () => {
    const { sim, people: [a, b], node } = glade('TI-2');
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 120, 'the first hand is alone');
    later(sim, 0.4);
    swing(sim, b, node);
    assert.equal(hpOf(sim, node), 119, 'the second hand makes it count');
    later(sim, 0.4);
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 118, 'and now the first one does too');
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'hitWood' && e.by === 'b'), 'a proper chop, with its sound');
    assert.equal(floats(sim, 'Together!').length, 1, 'a cheer when they start working together, not on every hit');
    // damage is the tool's own power (full), crits and all
    sim.give(a, 'pick_iron', 1); sim.command('a', { t: 'equip', item: 'pick_iron' });
    later(sim, 0.4);
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 116, 'an iron pick takes two');
});

test('the window is three seconds: a hand that has gone quiet no longer helps', () => {
    const { sim, people: [a, b], node } = glade('TI-3');
    swing(sim, a, node);
    later(sim, 2.8);
    swing(sim, b, node);
    assert.equal(hpOf(sim, node), 119, 'two and eight tenths of a second: still together');
    later(sim, 3.3);
    swing(sim, b, node);
    assert.equal(hpOf(sim, node), 119, 'a was quiet for over three seconds: b is alone again');
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 118, 'a swings again: b was just there');
    later(sim, 3.1);
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 118, 'and a alone, once more, does nothing');
});

test('only farmers count: not one who is away, down, out of reach, or the same one swinging twice as fast', () => {
    const { sim, people: [a, b], node } = glade('TI-4');
    swing(sim, a, node); swing(sim, a, node); swing(sim, a, node);
    assert.equal(hpOf(sim, node), 120, 'one farmer, however fast');
    // b is too far to reach it: the swing is refused before it can count as a hand
    const home = { x: b.x, y: b.y };
    b.x += 200; b.warp++;
    swing(sim, b, node);
    b.x = home.x; b.warp++;
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 120, 'a swing from far away was never a hand');
    // b helps, then falls down: no longer a hand
    swing(sim, b, node);
    assert.equal(hpOf(sim, node), 119);
    b.downed = 10;
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 119, 'b is down');
    b.downed = 0;
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 118, 'and back up');
    // b leaves the world
    sim.leave('b');
    later(sim, 0.4);
    swing(sim, a, node);
    assert.equal(hpOf(sim, node), 118, 'a friend who left is not a hand');
});

test('companions and workers are not hands: creatures never work a Titan at all', () => {
    const { sim, people: [a], o, plot } = glade('TI-5', 1);
    const oak = sim.add<NodeE>({ k: 'node', kind: 'titan_oak', tx: o.tx + 4, ty: o.ty + 9, hp: NODES.titan_oak.hp, plot: plot.i });
    const trees = Array.from({ length: 3 }, (_, i) => sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 3 + i, ty: o.ty + 11, hp: 3, plot: plot.i }).id);
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 10) * TILE; a.warp++;
    const gnaw: Pet = { id: 'p-gnaw', sp: 'gnaw' as keyof typeof SPECIES, name: 'Buddy', lv: 6, xp: 0, traits: [] };
    petsOf(a).push(gnaw);
    cmdPet(sim, a, { t: 'pet', op: 'task', pet: gnaw.id, task: 'gather' });
    for (let t = 0; t < 40; t += STEP) sim.step(STEP);
    assert.ok(trees.some((id) => !sim.s.ents[id]), 'the creature does work');
    assert.ok(sim.s.ents[oak.id], 'but the Great Oak is still standing');
    assert.equal(hpOf(sim, oak), NODES.titan_oak.hp, 'untouched');
    assert.equal(sim.titanLog.get(oak.id), undefined, 'and a creature leaves no hand on it');
});

// ── the fall ────────────────────────────────────────────────────────────────
test('felled by two: each helper gets their own pile, the XP and a share of the glory, once', () => {
    const { sim, people: [a, b], node, c } = glade('TI-6');
    const dice = worldDice(sim);
    const rounds = felled(sim, [a, b], node);
    assert.ok(rounds >= 60 && rounds <= 130, `${rounds} swings each: not a moment's work`);
    assert.equal(sim.s.ents[node.id], undefined, 'it is gone');
    for (const p of [a, b]) {
        const wood = countOf(p, 'wood');
        assert.ok(wood >= 54 && wood <= 72, `${p.id} got ${wood} wood: 36 to 48, and half again with two hands`);
        assert.ok(p.xp > 0 || p.level > 1, `${p.id} has XP`);
        assert.equal(p.stats.harvested, 1, 'counted as one harvest');
        assert.equal(p.cnt?.['harvest:titan_oak'], 1);
        assert.equal(p.cnt?.titan, 1);
        assert.ok(events(sim, 'banner').some((e) => e.to === p.id && e.text === 'Great Oak falls!'), `${p.id} was told`);
        assert.ok(events(sim, 'float').some((f) => f.to === p.id && f.text.startsWith('+')), 'with a float over their head');
    }
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'titan'), 'the fanfare');
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'breakTree'), 'and the timber');
    assert.equal(worldDice(sim), dice, "none of it touched the world's own dice");
    // nobody is paid twice: swinging at what is gone does nothing, and nothing is left on the ground
    const wood = [countOf(a, 'wood'), countOf(b, 'wood')];
    sim.events = [];
    for (const p of [a, b]) swing(sim, p, node);
    assert.deepEqual([countOf(a, 'wood'), countOf(b, 'wood')], wood);
    assert.equal(events(sim, 'banner').length, 0);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'drop').length, 0, 'it all went into pockets');
    void c;
});

test('every extra hand pays everyone more: x1.5, x2, x2.5, and no more after four', () => {
    const range = (hands: number): [number, number] => [Math.round(36 * titan.handsMul(hands)), Math.round(48 * titan.handsMul(hands))];
    const means: number[] = [];
    for (const hands of [2, 3, 4, 5]) {
        const { sim, people, node } = glade(`TI-7-${hands}`, hands);
        felled(sim, people, node);
        const [lo, hi] = range(hands);
        let sum = 0;
        for (const p of people) {
            const wood = countOf(p, 'wood');
            assert.ok(wood >= lo && wood <= hi, `${hands} hands: ${p.id} got ${wood}, wanted ${lo}-${hi}`);
            sum += wood;
        }
        means.push(sum / hands);
        assert.ok(events(sim, 'banner').some((e) => e.text === 'Great Oak falls!' && e.sub === `${hands} hands: ×${titan.handsMul(hands)} for everyone`), 'the banner says how many hands');
    }
    assert.ok(means[1] > means[0] * 1.2 && means[2] > means[1] * 1.1, `each share grows with the hands: ${means.map((m) => Math.round(m))}`);
    assert.ok(means[3] < means[2] * 1.15, 'a fifth hand shares at the four-hand rate');
});

test('only those who swung within the last six seconds share: a late helper, an early one and a bystander do not', () => {
    const { sim, people: [a, b, c, d], node } = glade('TI-8', 4);
    swing(sim, c, node);                                 // (c swings once, early, then wanders off)
    later(sim, 8);
    felled(sim, [a, b], node);
    assert.ok(countOf(a, 'wood') >= 54 && countOf(b, 'wood') >= 54);
    assert.equal(countOf(c, 'wood'), 0, 'eight seconds before the fall is too long ago');
    assert.equal(countOf(d, 'wood'), 0, 'standing there is not helping');
    assert.equal(c.stats.harvested, 0);
    assert.ok(events(sim, 'banner').every((e) => e.to !== 'c' && e.to !== 'd' && e.sub === '2 hands: ×1.5 for everyone'), 'and the number is of those who helped');
});

test('a helper who swung five seconds before the last blow still counts', () => {
    const { sim, people: [a, b, c], node } = glade('TI-9', 3);
    node.hp = 40;
    swing(sim, c, node); later(sim, 0.4);
    swing(sim, a, node); later(sim, 0.4);
    swing(sim, b, node);
    later(sim, 4);                                       // (c is long outside the three-second window, but not the six-second one)
    assert.ok(hpOf(sim, node)! < 40);
    node.hp = 1;
    swing(sim, a, node); later(sim, 0.4);                // (a and b have to find each other again first)
    assert.equal(hpOf(sim, node), 1);
    swing(sim, b, node);
    assert.equal(sim.s.ents[node.id], undefined, 'down');
    assert.ok(countOf(a, 'wood') > 0 && countOf(b, 'wood') > 0 && countOf(c, 'wood') > 0, 'all three were paid');
    assert.ok(events(sim, 'banner').some((e) => e.to === 'c' && e.sub === '3 hands: ×2 for everyone'));
});

test('pockets that are full leave the pile on the ground beside the tree: nothing is lost', () => {
    const { sim, people: [a, b], node } = glade('TI-10');
    a.inv.wood = 998;
    node.hp = 1;
    swing(sim, a, node); later(sim, 0.4);
    swing(sim, b, node); later(sim, 0.4);
    swing(sim, a, node);
    assert.equal(sim.s.ents[node.id], undefined);
    assert.equal(countOf(a, 'wood'), 999);
    const ground = Object.values(sim.s.ents).filter((e): e is DropE => e.k === 'drop' && e.res === 'wood').length;
    assert.ok(ground >= 50, `${ground} wood on the ground`);
});

test('a Titan Boulder pays stone (and coal), the same way', () => {
    const { sim, people, node } = glade('TI-11', 3, 'titan_rock');
    assert.equal(hpOf(sim, node), NODES.titan_rock.hp);
    felled(sim, people, node);
    for (const p of people) {
        assert.ok(countOf(p, 'stone') >= 72 && countOf(p, 'stone') <= 96, `${p.id}: ${countOf(p, 'stone')} stone with three hands`);
        assert.equal(p.cnt?.['harvest:titan_rock'], 1);
    }
    assert.ok(events(sim, 'fx').some((e) => e.fx === 'breakRock'));
});

test('each helper rolls their own crate with their own luck dice, and a better chance with more hands', () => {
    const odds = (hands: number) => {
        const sim = Sim.create(`TI-12-${hands}`, 'ti');
        const p = sim.join('a', 'A')!;
        let wood = 0, silver = 0;
        const dice = worldDice(sim);
        for (let i = 0; i < 400; i++) {
            const tier = fortune.titanCrate(sim, p, titan.handsMul(hands), p.x, p.y);
            if (tier === 'wood') wood++; else if (tier === 'silver') silver++;
        }
        assert.equal(worldDice(sim), dice, 'luck dice only');
        assert.equal(countOf(p, CRATE_ITEM.wood), wood);
        assert.equal(countOf(p, CRATE_ITEM.silver), silver);
        return { wood, silver };
    };
    const one = odds(1), two = odds(2), four = odds(4);
    // one hand: silver 12%, else wood 45%: about half of the rolls leave something
    assert.ok(one.silver >= 25 && one.silver <= 75, `silver ${one.silver}/400 with one hand`);
    assert.ok(one.wood + one.silver >= 150 && one.wood + one.silver <= 260, `${one.wood + one.silver}/400 crates with one hand`);
    assert.ok(two.silver > one.silver && four.silver > two.silver, 'more hands, more silver');
    assert.ok(four.wood + four.silver === 400, 'four hands: a crate every time');
});

test('a crate that came with the fall lands in the helper pocket and is announced', () => {
    let seen = 0;
    for (let s = 0; s < 8 && !seen; s++) {
        const { sim, people, node } = glade(`TI-13-${s}`, 4);
        felled(sim, people, node);
        const crates = people.reduce((n, p) => n + countOf(p, CRATE_ITEM.wood) + countOf(p, CRATE_ITEM.silver), 0);
        if (crates) {
            seen = crates;
            assert.ok(events(sim, 'toast').some((t) => /crate came with it/.test(t.text)));
            assert.ok(events(sim, 'float').some((f) => f.text === 'A crate!'));
        }
    }
    assert.ok(seen > 0, 'with four hands every helper has a very good chance');
});

// ── where they grow ─────────────────────────────────────────────────────────
const clearNodes = (sim: Sim) => { for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id); };
/** How many of `n` trees (or whatever) that grow on this plot would be Titans, given what already stands. */
const sample = (sim: Sim, plot: Plot, kind: NodeKind, n = 3000) => {
    let titans = 0;
    for (let i = 0; i < n; i++) if (titan.isTitan(titan.grown(sim, kind, 100 + (i % 60), 100 + Math.floor(i / 60), plot))) titans++;
    return titans;
};

test('a solo world never grows one; a world with two farmers sometimes does', () => {
    const solo = Sim.create('TI-14', 'ti');
    const a = solo.join('a', 'A')!;
    clearNodes(solo);
    const plot = solo.homePlot(a.slot);
    assert.equal(sample(solo, plot, 'tree'), 0, 'no Titan Oak for one farmer');
    assert.equal(sample(solo, plot, 'rock'), 0);
    const two = Sim.create('TI-14', 'ti');
    two.join('a', 'A'); two.join('b', 'B');
    clearNodes(two);
    const p2 = two.homePlot(two.s.players.a.slot);
    const dice = worldDice(two);
    const trees = sample(two, p2, 'tree'), rocks = sample(two, p2, 'rock');
    assert.ok(trees >= 25 && trees <= 110, `${trees} of 3000 trees were Titans (the dial says ${TITAN.chance * 100}%)`);
    assert.ok(rocks >= 25 && rocks <= 110, `${rocks} of 3000 rocks`);
    assert.equal(titan.grown(two, 'tree', 5, 5, p2) === 'titan_oak' || titan.grown(two, 'tree', 5, 5, p2) === 'tree', true);
    assert.equal(worldDice(two), dice, "deciding it never uses the world's dice");
    for (const kind of ['bush', 'iron', 'gold', 'crystal', 'flower', 'titan_oak'] as NodeKind[]) assert.equal(sample(two, p2, kind, 600), kind === 'titan_oak' ? 600 : 0, `${kind} stays what it is`);
    // the farmers do not have to be online: a farm each is enough (and a friend who has left still counts)
    two.leave('b');
    assert.ok(sample(two, p2, 'tree') > 0);
});

test('only on owned land, one to an island, and a few in the whole world', () => {
    const sim = Sim.create('TI-15', 'ti');
    const a = sim.join('a', 'A')!; sim.join('b', 'B');
    clearNodes(sim);
    const plot = sim.homePlot(a.slot);
    const wild = sim.s.plots.find((p) => !p.owned && !p.dread)!;
    assert.equal(sample(sim, wild, 'tree'), 0, 'wild land grows none');
    const o = sim.world.plotOrigin(plot);
    sim.add<NodeE>({ k: 'node', kind: 'titan_rock', tx: o.tx + 2, ty: o.ty + 2, hp: 5, plot: plot.i });
    assert.equal(sample(sim, plot, 'tree'), 0, 'one Titan on the island: no second');
    const other = sim.homePlot(sim.s.players.b.slot);
    const cap = TITAN.worldCap(sim.world.ownedPlots().length);
    assert.equal(cap, 1 + Math.floor(sim.world.ownedPlots().length / 4));
    if (cap <= 1) assert.equal(sample(sim, other, 'tree'), 0, 'the world already has the one it is allowed');
    assert.ok(TITAN.worldCap(4) > TITAN.worldCap(0) && TITAN.worldCap(40) > TITAN.worldCap(4), 'a bigger world has room for more');
});

test('they really do appear when a plot is stocked, and stay one to an island', () => {
    const run = (farmers: number) => {
        const sim = Sim.create('TI-16', 'ti');
        for (let i = 0; i < farmers; i++) sim.join(IDS[i], IDS[i].toUpperCase());
        const plot = sim.homePlot(sim.s.players.a.slot);
        let seen = 0, most = 0;
        for (let i = 0; i < 300; i++) {
            clearNodes(sim);
            plot.nodes = 0;
            gather.populate(sim, plot, false, []);
            const here = Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && titan.isTitan(e.kind) && e.plot === plot.i).length;
            seen += here; most = Math.max(most, here);
        }
        return { seen, most };
    };
    assert.equal(run(1).seen, 0, 'never for one farmer');
    const two = run(2);
    assert.ok(two.seen >= 3, `${two.seen} over 300 plots`);
    assert.ok(two.most <= 1 + Math.max(0, TITAN.perPlot - 1), 'never more than one on the island');
});

test('a Titan already standing stays when the world has gone back to one farmer online, and waits for a friend', () => {
    const { sim, people: [a, b], node } = glade('TI-17');
    swing(sim, a, node);
    sim.leave('b');
    for (let i = 0; i < 5; i++) { later(sim, 0.4); swing(sim, a, node); }
    assert.equal(hpOf(sim, node), NODES.titan_oak.hp);
    assert.ok(floats(sim, 'Needs a friend!', 'a').length >= 1, 'it says so');
    sim.join('b', 'B'); b.x = a.x + 5; b.y = a.y; b.warp++; b.energy = 100;
    later(sim, 0.4);
    swing(sim, a, node); later(sim, 0.4); swing(sim, b, node);
    assert.ok(hpOf(sim, node)! < NODES.titan_oak.hp, 'the friend is back');
});

// ── the wiring ──────────────────────────────────────────────────────────────
test('the developer menu can put one down, and says so', () => {
    const { sim, people: [a] } = glade('TI-18', 1);
    sim.devs.add('a');
    sim.command('a', { t: 'devdo', op: 'node', id: 'titan_oak', n: 1 });
    const made = Object.values(sim.s.ents).filter((e): e is NodeE => e.k === 'node' && e.kind === 'titan_oak');
    assert.equal(made.length, 1 + 1, 'the one in the glade and the one it made');
    assert.ok(made.every((n) => n.hp === NODES.titan_oak.hp));
    void a;
});

test('the first-time hint for the Titans waits for one to be close, and is worded for friends', () => {
    const hint = HINTS.find((h) => h.id === 'titan');
    assert.ok(hint, 'a hint');
    const { people: [a] } = glade('TI-19', 1);
    assert.equal(hint!.when({ me: a, prompt: '' }), false);
    assert.equal(hint!.when({ me: a, prompt: '', titan: true }), true);
    const text = hint!.text({ me: a, prompt: '', titan: true }, { fish: 'Q' });
    assert.ok(/two|together|friend/i.test(text) && text.length < 220, text);
});

test('hostile input: nonsense swings do nothing, odd farmer ids and a node that is gone are safe, and it all survives a save', () => {
    const { sim, people: [a, b], node } = glade('TI-20');
    for (const id of ['x', NaN, -1, 0.5, node.id + 999, '__proto__', 'constructor', null, undefined, {}, [node.id]] as unknown[]) {          // (the sim refuses the inherited names itself)
        a.swingCd = 0;
        sim.command('a', { t: 'swing', id } as never);
    }
    assert.equal(hpOf(sim, node), 120);
    assert.ok(sim.titanLog.size <= 1, 'no log for a node that is not there');
    // a farmer whose id is a word every object has
    const odd = sim.join('odd id ✓', 'Odd')!;
    odd.x = a.x + 4; odd.y = a.y; odd.warp++; odd.energy = 100; odd.invuln = 99999;
    swing(sim, a, node); later(sim, 0.4); swing(sim, odd, node);
    assert.equal(hpOf(sim, node), 119, 'it counts like anyone');
    // removed while being worked on: the log goes with it
    sim.remove(node.id);
    assert.equal(sim.titanLog.size, 0);
    swing(sim, a, node); swing(sim, b, node);
    // save and load: the node is plain JSON, the swing window is not needed
    const n2 = sim.add<NodeE>({ k: 'node', kind: 'titan_rock', tx: node.tx + 1, ty: node.ty, hp: 77, plot: node.plot });
    const copy = JSON.parse(JSON.stringify(sim.s));
    assert.equal(copy.ents[n2.id].kind, 'titan_rock');
    const again = new Sim(copy);
    const n3 = again.s.ents[n2.id] as NodeE;
    assert.equal(n3.hp, 77);
    assert.equal(again.world.occAt(n3.tx, n3.ty), n3.id, 'and it blocks its tile again');
});
