// Resource nodes (sim/gather.ts): what a swing does, what breaks drop, how land is stocked and how it grows back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLOT, TILE, TUNING } from '../src/shared/config';
import { BIOME_DEFS } from '../src/shared/data/biomes';
import { NODES, type NodeKind } from '../src/shared/data/nodes';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { NodeE, PlayerS, Plot, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);

function farm (seed: string) {
    const sim = Sim.create(seed, 'gather');
    const p = sim.join('a', 'A')!;
    events(sim);
    return { sim, p, home: sim.homePlot(p.slot) };
}
/** Stand on a free tile beside a node, facing it. */
function standBy (sim: Sim, p: PlayerS, n: NodeE) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!sim.world.isFree(n.tx + dx, n.ty + dy)) continue;
        p.x = (n.tx + dx + 0.5) * TILE; p.y = (n.ty + dy + 1) * TILE - 3; p.fx = -dx; p.fy = -dy; p.warp++;
        return;
    }
    throw new Error('no free tile beside the node');
}
const swing = (sim: Sim, p: PlayerS, n: NodeE) => { p.swingCd = 0; sim.command(p.id, { t: 'swing', id: n.id }); };
/** Grow a node of a kind on a free tile near the farmer (as the world would), and return it. */
function grow (sim: Sim, p: PlayerS, kind: NodeKind, plot: Plot, gold?: 1) {
    const spot = sim.nearestFree(Math.floor(p.x / TILE) + 2, Math.floor(p.y / TILE), 6)!;
    const n = sim.add<NodeE>({ k: 'node', kind, tx: spot.tx, ty: spot.ty, hp: NODES[kind].hp, plot: plot.i, ...(gold ? { gold } : {}) });
    plot.nodes++;
    return n;
}
/** Break a node and count what it dropped, by resource. */
function breakAndCount (sim: Sim, p: PlayerS, n: NodeE) {
    const before = new Set(sim.ents('drop').map((d) => d.id));
    standBy(sim, p, n);
    for (let i = 0; i < 40 && sim.s.ents[n.id]; i++) swing(sim, p, n);
    assert.equal(sim.s.ents[n.id], undefined, `the ${n.kind} broke`);
    const got: Record<string, number> = {};
    for (const d of sim.ents('drop')) if (!before.has(d.id)) got[d.res] = (got[d.res] ?? 0) + 1;
    return got;
}

test('a node takes one swing per point of pick power, plays its sounds, and pays the table’s XP when it breaks', () => {
    const { sim, p, home } = farm('GATHER-tree');
    const tree = sim.ents('node').find((n) => n.kind === 'tree' && !n.gold && n.plot === home.i)!;
    standBy(sim, p, tree);
    const nodes0 = home.nodes, energy0 = p.energy;
    swing(sim, p, tree);
    assert.equal(tree.hp, NODES.tree.hp - 1, 'a flint pick does one');
    assert.ok(fxNames(events(sim)).includes('hitWood'));
    assert.ok(Math.abs(energy0 - p.energy - TUNING.swingEnergy) < 1e-9, 'a swing costs its energy');
    sim.command('a', { t: 'swing', id: tree.id });
    assert.equal(tree.hp, NODES.tree.hp - 1, 'a swing inside the cooldown is ignored');
    swing(sim, p, tree);
    swing(sim, p, tree);
    assert.equal(sim.s.ents[tree.id], undefined, 'three swings for three hit points');
    assert.ok(fxNames(events(sim)).includes('breakTree'));
    assert.equal(p.xp, NODES.tree.xp);
    assert.equal(p.stats.harvested, 1);
    assert.equal(p.cnt?.['harvest:tree'], 1);
    assert.equal(home.nodes, nodes0 - 1, 'the island counts one node fewer');
    const wood = sim.ents('drop').filter((d) => d.res === 'wood').length;
    assert.ok(wood >= 2 && wood <= 3, `a tree drops two or three logs (${wood})`);
    run(sim, 2);
    assert.equal(countOf(p, 'wood'), wood, 'and they fly to the farmer');
});

test('a crystal needs a pick of the second tier; the pick’s power is the damage', () => {
    const { sim, p, home } = farm('GATHER-tier');
    const crystal = grow(sim, p, 'crystal', home);
    standBy(sim, p, crystal);
    swing(sim, p, crystal);
    assert.ok(floats(events(sim)).includes('Needs a better pick'));
    assert.equal(crystal.hp, NODES.crystal.hp);
    sim.give(p, 'pick_iron', 1);
    sim.command('a', { t: 'equip', item: 'pick_iron' });
    swing(sim, p, crystal);
    assert.equal(crystal.hp, NODES.crystal.hp, 'iron is still too soft');
    sim.give(p, 'pick_gold', 1);
    sim.command('a', { t: 'equip', item: 'pick_gold' });
    swing(sim, p, crystal);
    assert.equal(crystal.hp, NODES.crystal.hp - 3, 'a golden pick bites for three');
    sim.give(p, 'pick_crystal', 1);
    sim.command('a', { t: 'equip', item: 'pick_crystal' });
    swing(sim, p, crystal);
    assert.equal(crystal.hp, NODES.crystal.hp - 3 - 4);
});

test('drops follow the table: two or three stone a boulder, one more on bountiful land, more again for a Stonemason', () => {
    const { sim, p, home } = farm('GATHER-drops');
    const rocks = sim.ents('node').filter((n) => n.kind === 'rock' && !n.gold && n.plot === home.i);
    assert.ok(rocks.length >= 3, 'the home island has boulders');
    for (const r of rocks) {
        const got = breakAndCount(sim, p, r);
        assert.ok(got.stone >= 2 && got.stone <= 3, `stone: ${got.stone}`);
        assert.ok((got.coal ?? 0) <= 1, 'coal now and then, one at a time');
        assert.ok(Object.keys(got).every((k) => k === 'stone' || k === 'coal'), `only what the table says: ${Object.keys(got)}`);
    }
    home.mod = 'bountiful';
    for (let i = 0; i < 3; i++) {
        const got = breakAndCount(sim, p, grow(sim, p, 'rock', home));
        assert.ok(got.stone >= 3 && got.stone <= 4, `bountiful stone: ${got.stone}`);
        if (got.coal) assert.equal(got.coal, 2, 'the bonus applies to every material');
    }
    home.mod = null;
    p.skills.g_stone = 4;                                          // +1.6 stone a boulder: one for sure, a good chance of a second
    for (let i = 0; i < 3; i++) {
        const got = breakAndCount(sim, p, grow(sim, p, 'rock', home));
        assert.ok(got.stone >= 3 && got.stone <= 5, `a Stonemason’s stone: ${got.stone}`);
    }
});

test('a golden node drops three times as much and a crate on top, rolled with the luck dice', () => {
    const { sim, p, home } = farm('GATHER-golden');
    const rock = grow(sim, p, 'rock', home, 1);
    const got = breakAndCount(sim, p, rock);
    assert.ok([6, 9].includes(got.stone), `three times two or three stone: ${got.stone}`);
    const ev = events(sim);
    assert.ok(floats(ev).includes('GOLDEN!'));
    assert.ok(fxNames(ev).includes('golden'));
    assert.equal(countOf(p, 'crate_wood') + countOf(p, 'crate_silver'), 1, 'a crate came with it');
    assert.equal(p.cnt?.golden, 1);
});

test('luck rolls never move the world’s own dice: a crate opened in one world leaves the next harvest the same as in another', () => {
    const a = farm('GATHER-dice'), b = farm('GATHER-dice');
    b.sim.give(b.p, 'crate_wood', 1);
    b.sim.command('a', { t: 'crate', item: 'crate_wood' });
    assert.equal(countOf(b.p, 'crate_wood'), 0, 'the crate was opened');
    assert.ok(b.sim.events.some((e) => e.e === 'loot'), 'and its loot shown');
    const ra = a.sim.ents('node').find((n) => n.kind === 'rock' && !n.gold && n.plot === a.home.i)!;
    const rb = b.sim.s.ents[ra.id] as NodeE;
    assert.ok(rb && rb.kind === 'rock' && rb.tx === ra.tx && rb.ty === ra.ty, 'the same world so far');
    const dropsA = breakAndCount(a.sim, a.p, ra);
    const dropsB = breakAndCount(b.sim, b.p, rb);
    assert.deepEqual(dropsA, dropsB, 'the same drops');
    const spots = (sim: Sim) => sim.ents('drop').map((d) => `${d.res}@${d.x.toFixed(4)},${d.y.toFixed(4)}`).sort();
    assert.deepEqual(spots(a.sim), spots(b.sim), 'in the same places');
    assert.equal(a.sim.rng.next(), b.sim.rng.next(), 'the world’s dice are at the same throw');
});

test('nodes grow back on the island’s own land, of its biome’s kinds, faster with Regrowth, never past the cap, and not while nobody is there', () => {
    const { sim, p } = farm('GATHER-regrow');
    const standing = (pl: Plot) => sim.ents('node').filter((n) => n.plot === pl.i && n.kind !== 'mound' && sim.world.plotAt(n.tx, n.ty) === pl).length;
    const before = new Set(sim.ents('node').map((n) => n.id));
    run(sim, 20);
    const grown = sim.ents('node').filter((n) => !before.has(n.id));
    assert.ok(grown.length >= 20, `${grown.length} nodes grew in twenty seconds`);
    for (const n of grown) {
        const pl = sim.s.plots[n.plot];
        assert.ok(pl.owned || pl.dread, 'on ground, never on the sea');
        assert.equal(sim.world.plotAt(n.tx, n.ty), pl, 'and on the island it is counted on');
        assert.ok(BIOME_DEFS[pl.biome].nodes[n.kind] !== undefined, `${n.kind} belongs in a ${pl.biome}`);
    }
    for (const pl of sim.s.plots) {
        if (!pl.owned && !pl.dread) continue;
        assert.ok(pl.nodes <= TUNING.plotNodeCap + (pl.mod === 'fertile' ? 8 : 0), `${pl.nodes} on plot ${pl.i}`);
        assert.equal(standing(pl), pl.nodes, `plot ${pl.i} counts what stands on it`);
    }
    // an island at its cap grows nothing more, one short of it grows one at most
    const home = sim.homePlot(p.slot);
    const was = home.nodes;
    home.nodes = TUNING.plotNodeCap;
    const n0 = standing(home);
    run(sim, 10);
    assert.equal(standing(home), n0, 'full: nothing grew here');
    home.nodes = TUNING.plotNodeCap - 1;
    run(sim, 20);
    assert.ok(standing(home) <= n0 + 1, 'one place left: one at most');
    home.nodes = was + (standing(home) - n0);
    // nobody about: nothing grows anywhere
    sim.leave('a');
    const total = sim.ents('node').length;
    run(sim, 10);
    assert.equal(sim.ents('node').length, total);
    // Regrowth: the same seconds grow more
    const slow = farm('GATHER-regrow2'), fast = farm('GATHER-regrow2');
    fast.p.skills.g_regrow = 4;                                    // +80%
    const count = (s: Sim) => s.ents('node').length;
    const s0 = count(slow.sim), f0 = count(fast.sim);
    run(slow.sim, 20); run(fast.sim, 20);
    assert.ok(count(fast.sim) - f0 > (count(slow.sim) - s0) * 1.4, `${count(fast.sim) - f0} with Regrowth against ${count(slow.sim) - s0}`);
});

test('bought land is stocked from its biome; a treasure island hides a chest in its middle; a home keeps a clearing for the camp', () => {
    const { sim, p, home } = farm('GATHER-populate');
    const next = sim.world.plot(home.gx + 1, home.gy)!;
    next.mod = 'treasure';
    p.coins = 1e6;
    sim.command('a', { t: 'buy', plot: next.i });
    assert.ok(next.owned);
    const nodes = sim.ents('node').filter((n) => n.plot === next.i);
    assert.ok(nodes.length >= 8 && nodes.length <= 14, `${nodes.length} nodes on new land`);
    assert.equal(nodes.length, next.nodes);
    const o = sim.world.plotOrigin(next);
    const chest = nodes.find((n) => n.kind === 'chest');
    assert.ok(chest && chest.tx === o.tx + PLOT / 2 && chest.ty === o.ty + PLOT / 2, 'the chest waits in the middle');
    for (const n of nodes) if (n.kind !== 'chest') assert.ok(BIOME_DEFS[next.biome].nodes[n.kind] !== undefined, `${n.kind} grows in a ${next.biome}`);
    // the home island: a clearing around where the farmer arrived
    const ho = sim.world.plotOrigin(home);
    const cx = ho.tx + PLOT / 2, cy = ho.ty + PLOT / 2;
    for (const n of sim.ents('node')) {
        if (n.plot !== home.i) continue;
        assert.ok(!(n.tx >= cx - 6 && n.tx <= cx + 5 && n.ty >= cy - 5 && n.ty <= cy + 4), `${n.kind} at ${n.tx - cx},${n.ty - cy} is in the clearing`);
    }
    assert.ok(home.nodes >= 10, 'and plenty to gather around it');
});
