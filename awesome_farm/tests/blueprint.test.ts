// Blueprints: a saved layout placed in one command: every piece obeys the ordinary rules and
// costs its ordinary price, settings come along, misfits are skipped, and running dry stops it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { BLUEPRINT_MAX, canTurn, captureItems, extent, totalCost, turnItems } from '../src/shared/blueprint';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BlueprintItem, BuildE, PlayerS } from '../src/shared/sim/types';

function yard (seed: string, unlock = true) {
    const sim = Sim.create(seed, 'bp');
    sim.cheats = true;
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    if (unlock) sim.command('a', { t: 'devdo', op: 'skills' });
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 3) * TILE; p.y = (o.ty + 3) * TILE;
    return { sim, p, o };
}
const give = (sim: Sim, p: PlayerS, item: Parameters<Sim['give']>[1], n: number) => sim.give(p, item, n);
/** A tiny line: chest → inserter (filter: iron) → three belts → sorter (filter: iron) → chest. */
const LINE: BlueprintItem[] = [
    { kind: 'chest', dx: 0, dy: 0, rot: 0 },
    { kind: 'inserter', dx: 1, dy: 0, rot: 0, flt: 'iron' },
    { kind: 'belt', dx: 2, dy: 0, rot: 0 },
    { kind: 'belt', dx: 3, dy: 0, rot: 0 },
    { kind: 'belt', dx: 4, dy: 0, rot: 0 },
    { kind: 'sorter', dx: 5, dy: 0, rot: 0, flt: 'copper' },
    { kind: 'chest', dx: 6, dy: 0, rot: 0 },
    { kind: 'assembler', dx: 0, dy: 3, rot: 0, sel: 'assembler:gear' },
];
const stock = (sim: Sim, p: PlayerS) => {
    for (const [item, n] of [['wood', 200], ['plank', 100], ['gear', 40], ['ironbar', 80], ['wire', 40], ['circuit', 20], ['stone', 100], ['motor', 10], ['steel', 20], ['glass', 20]] as const) give(sim, p, item, n);
};

test('a blueprint places every piece, with its settings, and charges the ordinary prices', () => {
    const { sim, p, o } = yard('BP-1');
    stock(sim, p);
    const before = { wood: countOf(p, 'wood'), iron: countOf(p, 'ironbar'), gear: countOf(p, 'gear') };
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 4, items: LINE });
    const at = (kind: string) => Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && e.kind === kind);
    assert.equal(at('chest').length, 2);
    assert.equal(at('belt').length, 3);
    assert.equal(at('inserter')[0].flt, 'iron');
    assert.equal(at('sorter')[0].flt, 'copper');
    assert.equal(at('assembler')[0].sel, 'assembler:gear');
    // positions are relative to the anchor
    const chest = at('chest').sort((a, b) => a.tx - b.tx);
    assert.deepEqual([chest[0].tx, chest[0].ty], [o.tx + 2, o.ty + 4]);
    assert.deepEqual([chest[1].tx, chest[1].ty], [o.tx + 8, o.ty + 4]);
    // the same materials a person would have spent placing them one by one
    let wood = 0, iron = 0, gear = 0;
    for (const it of LINE) { const c = BUILDINGS[it.kind].cost; wood += c.wood ?? 0; iron += c.ironbar ?? 0; gear += c.gear ?? 0; }
    assert.ok(wood > 0 && before.wood - countOf(p, 'wood') >= wood * 0.4, 'materials were spent');
    assert.ok(before.iron - countOf(p, 'ironbar') >= iron * 0.4);
    assert.ok(p.stats.built >= LINE.length, 'each piece counts as built');
    assert.equal(p.cnt?.['build:belt'], 3, 'and for the journal');
});

test('misfits are skipped, locked pieces too, and running out of materials stops it', () => {
    const { sim, p, o } = yard('BP-2');
    stock(sim, p);
    // an obstacle where one belt would go
    sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + 5, ty: o.ty + 4, rot: 0, inv: {} });
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 4, items: LINE });
    const belts = Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && e.kind === 'belt');
    assert.equal(belts.length, 2, 'the belt that did not fit was skipped, the rest went down');
    // a player without the Logistics skill cannot place belts from a blueprint either
    const { sim: s2, p: q, o: o2 } = yard('BP-3');
    q.skills = {};
    s2.s.players.a.skills = {};
    give(s2, q, 'wood', 100); give(s2, q, 'ironbar', 40); give(s2, q, 'stone', 40);
    s2.command('a', { t: 'bp', tx: o2.tx + 2, ty: o2.ty + 6, items: [{ kind: 'belt', dx: 0, dy: 0, rot: 0 }, { kind: 'workbench', dx: 3, dy: 0, rot: 0 }] });
    assert.equal(Object.values(s2.s.ents).filter((e) => e.k === 'bld' && e.kind === 'belt').length, 0, 'locked');
    assert.equal(Object.values(s2.s.ents).filter((e) => e.k === 'bld' && e.kind === 'workbench').length, 1, 'but the workbench went down');
    // a poor farmer gets as far as the money lasts
    const { sim: s3, p: r, o: o3 } = yard('BP-4', false);
    give(s3, r, 'wood', 14);        // a workbench costs 6
    s3.command('a', { t: 'bp', tx: o3.tx + 2, ty: o3.ty + 4, items: [{ kind: 'workbench', dx: 0, dy: 0, rot: 0 }, { kind: 'workbench', dx: 2, dy: 0, rot: 0 }, { kind: 'workbench', dx: 4, dy: 0, rot: 0 }] });
    const wb = Object.values(s3.s.ents).filter((e) => e.k === 'bld' && e.kind === 'workbench').length;
    assert.equal(wb, 2, 'two workbenches, then the wood ran out');
});

test('range, size and expeditions limit what a blueprint can do', () => {
    const { sim, p, o } = yard('BP-5');
    stock(sim, p);
    sim.command('a', { t: 'bp', tx: o.tx + 40, ty: o.ty + 4, items: [{ kind: 'chest', dx: 0, dy: 0, rot: 0 }] });
    assert.equal(sim.buildings('chest').length, 0, 'the anchor is too far from you');
    const huge: BlueprintItem[] = Array.from({ length: BLUEPRINT_MAX + 1 }, (_, i) => ({ kind: 'path', dx: i % 10, dy: Math.floor(i / 10), rot: 0 }));
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 2, items: huge });
    assert.equal(sim.buildings('path').length, 0, 'too many pieces');
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 2, items: [{ kind: 'nothing' as never, dx: 0, dy: 0, rot: 0 }, { kind: 'chest', dx: 99, dy: 0, rot: 0 }, null as never] });
    assert.equal(sim.buildings('chest').length, 0, 'junk entries are ignored');
    // never while away on an expedition
    p.rift = { arena: 0, tier: 0, wave: 1, waves: 4, ph: 1, left: 3, t: 0, party: 1, kills: 0 };
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 2, items: [{ kind: 'chest', dx: 0, dy: 0, rot: 0 }] });
    assert.equal(sim.buildings('chest').length, 0);
});

test('a pasted production line actually runs', () => {
    const { sim, p, o } = yard('BP-6');
    stock(sim, p);
    // a drill on a vein, a pole and a turbine, pasted as a blueprint
    const plot = sim.world.plotAt(o.tx + 1, o.ty + 1)!;
    plot.veins = [[o.tx + 3, o.ty + 3, 'iron'], [o.tx + 4, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 4, 'iron'], [o.tx + 4, o.ty + 4, 'iron']];
    const items: BlueprintItem[] = [
        { kind: 'drill', dx: 0, dy: 0, rot: 0 }, { kind: 'chest', dx: 2, dy: 0, rot: 0 }, { kind: 'pole', dx: 1, dy: 2, rot: 0 }, { kind: 'windturbine', dx: 3, dy: 2, rot: 0 },
    ];
    sim.command('a', { t: 'bp', tx: o.tx + 3, ty: o.ty + 3, items });
    for (let t = 0; t < 60; t += 1 / 20) sim.step(1 / 20);
    const box = sim.buildings('chest')[0];
    assert.ok((box?.inv?.iron ?? 0) >= 3, `the pasted drill mined into the pasted chest: ${box?.inv?.iron}`);
});

test('capturing a stretch of the farm and pasting it elsewhere reproduces it exactly, even turned', () => {
    const { sim, p, o } = yard('BP-7');
    stock(sim, p);
    p.x = (o.tx + 10.5) * TILE; p.y = (o.ty + 10) * TILE;      // out of the way of the pieces
    // build the line by hand, then capture it by dragging a rectangle around it
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 2, items: LINE });
    const made = [...sim.buildings()];
    const items = captureItems(made, o.tx + 1, o.ty + 1, o.tx + 10, o.ty + 8)!;
    assert.equal(items.length, LINE.length, 'every piece inside the rectangle');
    assert.equal(captureItems(made, o.tx + 20, o.ty + 1, o.tx + 22, o.ty + 2), null, 'nothing there');
    assert.equal(items.find((i) => i.kind === 'sorter')!.flt, 'copper', 'settings are captured');
    assert.equal(items.find((i) => i.kind === 'assembler')!.sel, 'assembler:gear');
    const box = extent(items);
    assert.deepEqual([box.w, box.h], [7, 5], 'the box around the pieces (the assembler is 2×2)');
    assert.ok(Object.keys(totalCost(items)).length > 2, 'a cost to show');
    // a partial rectangle only takes pieces that fit completely inside it
    const half = captureItems(made, o.tx + 2, o.ty + 2, o.tx + 4, o.ty + 2)!;
    assert.equal(half.length, 3, 'the chest, the inserter and the first belt');
    // pasting the capture somewhere else gives the same layout shifted
    sim.command('a', { t: 'bp', tx: o.tx + 2, ty: o.ty + 7, items });
    const again = sim.buildings().filter((b) => b.ty >= o.ty + 7);
    assert.equal(again.length, items.length);
    for (const it of items) assert.ok(again.some((b) => b.kind === it.kind && b.tx === o.tx + 2 + it.dx && b.ty === o.ty + 7 + it.dy && b.rot === it.rot), `${it.kind} at ${it.dx},${it.dy}`);
    // turning four quarters is the identity, and each turn keeps every piece inside its box without overlaps
    assert.ok(!canTurn(items) === items.some((i) => BUILDINGS[i.kind].size[0] !== BUILDINGS[i.kind].size[1]));
    const squares = items.filter((i) => BUILDINGS[i.kind].size[0] === BUILDINGS[i.kind].size[1]);
    let t = squares;
    for (let i = 0; i < 4; i++) {
        t = turnItems(t);
        const b = extent(t);
        assert.ok(t.every((it) => it.dx >= 0 && it.dy >= 0), 'inside the box');
        const tiles = new Set<string>();
        for (const it of t) { const [w, h] = BUILDINGS[it.kind].size; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = `${it.dx + x},${it.dy + y}`; assert.ok(!tiles.has(k), 'no overlap after turning'); tiles.add(k); } }
        assert.ok(b.w > 0 && b.h > 0);
    }
    assert.deepEqual(t.map((i) => [i.kind, i.dx, i.dy, i.rot]), squares.map((i) => [i.kind, i.dx, i.dy, i.rot]), 'four turns come back to the start');
    // belts turn with the layout: east becomes south
    assert.equal(turnItems([{ kind: 'belt', dx: 0, dy: 0, rot: 0 }])[0].rot, 1);
});
