// Houses and bases (floor, walls, doorway, roof), walkable garden beds, packs, and respawning on your own.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS, BUILD_ORDER, type BuildingKind } from '../src/shared/data/buildings';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import { Sim } from '../src/shared/sim/sim';
import { QUEST_BY_ID } from '../src/shared/data/sidequests';
import { qsOf, stepProgress } from '../src/shared/sim/quests';
import { countOf, derived, itemCap, scaledCost } from '../src/shared/sim/stats';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

/** A player on their island (12 × 11 tiles of land; the yard starts 2 tiles in from the corner) with room around them, loaded up with building materials and every unlock. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'h');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 8) * TILE; p.y = (o.ty + 8) * TILE; p.hearts = 99; p.invuln = 999;
    for (const id of Object.keys(ITEMS) as ItemId[]) if (ITEMS[id].kind !== 'gear') p.inv[id] = 200;
    return { sim, p, tx: o.tx + 2, ty: o.ty + 2 };
}
/** Place one building as the player; gives back what was newly built, or undefined if the sim said no. */
const build = (sim: Sim, kind: BuildingKind, tx: number, ty: number, rot = 0) => {
    const before = new Set(Object.keys(sim.s.ents));
    sim.command('a', { t: 'build', kind, tx, ty, rot });
    return Object.values(sim.s.ents).find((e): e is BuildE => e.k === 'bld' && !before.has(String(e.id)));
};

test('every house piece is in the Build menu and can be made from what the game gives out', () => {
    const home = BUILD_ORDER.filter((b) => BUILDINGS[b].cat === 'home');
    for (const k of ['wall_wood', 'wall_stone', 'wall_brick', 'wall_window', 'doorway', 'roof_thatch', 'roof_tile', 'roof_slate'] as const) assert.ok(home.includes(k), `${k} is listed`);
    for (const k of ['planks', 'path', 'brickfloor', 'slatefloor', 'carpet'] as const) assert.ok(home.includes(k), `${k} is listed with the walls (floors are where people look for them)`);
    for (const k of home) assert.ok(BUILDINGS[k].wall || BUILDINGS[k].roof || BUILDINGS[k].gate || BUILDINGS[k].floor, `${k} has a role`);
    assert.equal(BUILDINGS.sleepbed.cat, 'craft', 'the Bed is in Crafting, next to the Workbench (the first place a farmer looks)');
    assert.ok(Object.keys(BUILDINGS.sleepbed.cost).every((i) => ['plank', 'wood'].includes(i)), 'and it is made from what the first hours give');
});

test('walls and a floor make a room: walls are solid, the doorway is a way in that monsters cannot use', () => {
    const { sim, p, tx, ty } = yard('H-1');
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) build(sim, 'planks', tx + x, ty + y);
    // walls on the floor all round, a doorway in the south middle
    for (let x = 0; x < 5; x++) { build(sim, 'wall_wood', tx + x, ty); if (x !== 2) build(sim, 'wall_wood', tx + x, ty + 3); }
    for (let y = 1; y < 3; y++) { build(sim, 'wall_brick', tx, ty + y); build(sim, 'wall_stone', tx + 4, ty + y); }
    const door = build(sim, 'doorway', tx + 2, ty + 3)!;
    assert.ok(door, 'the doorway went up');
    const w = sim.world, c = (t: number) => (t + 0.5) * TILE;
    assert.ok(w.solidAt(c(tx), c(ty)), 'a wall stops you');
    assert.ok(w.solidAt(c(tx + 4), c(ty + 1)), 'so does a side wall');
    assert.ok(!w.solidAt(c(tx + 2), c(ty + 3)), 'you walk straight through the doorway');
    assert.ok(!w.boxBlocked(c(tx + 2), c(ty + 3), 3, 3), 'a player fits through');
    assert.ok(w.mobBlocked(c(tx + 2), c(ty + 3), 3, 3), 'a monster does not');
    assert.ok(!w.mobBlocked(c(tx + 2), c(ty + 1), 3, 3), 'the room itself is open to anything inside it');
    assert.equal(w.rectFree(tx + 2, ty + 3, 1, 1), false, 'nothing else can be built in the doorway');
    // taking the doorway down opens the gate again
    p.x = c(tx + 2); p.y = c(ty + 2);                                 // (taking something down needs you within reach)
    sim.command('a', { t: 'demolish', id: door.id });
    assert.ok(!w.mobBlocked(c(tx + 2), c(ty + 3), 3, 3), 'no door, no gate');
    assert.ok(p.stats.built >= 10);
});

test('a monster cannot walk through a doorway, and a wall holds it back as well', () => {
    const { sim, tx, ty } = yard('H-2');
    for (let x = 0; x < 3; x++) build(sim, 'wall_wood', tx + x, ty + 4);
    build(sim, 'doorway', tx + 1, ty + 4);
    build(sim, 'wall_wood', tx, ty + 4); // (already there: no second wall on the same tile)
    const w = sim.world, c = (t: number) => (t + 0.5) * TILE;
    // slide a monster-sized box south across the line of the wall, through the doorway column and through a wall column
    const cross = (col: number) => { let y = c(ty + 2); for (; y < c(ty + 6); y += 1) if (w.mobBlocked(c(col), y, 4, 4)) return false; return true; };
    assert.equal(cross(tx + 1), false, 'the doorway column is shut to monsters');
    assert.equal(cross(tx + 0), false, 'a wall column is shut too');
    assert.equal(cross(tx + 3), true, 'open ground is open');
});

test('a roof goes over a floor and its furniture, one per tile, and comes down cleanly', () => {
    const { sim, p, tx, ty } = yard('H-3');
    build(sim, 'planks', tx, ty);
    const chest = build(sim, 'chest', tx, ty)!;
    assert.ok(chest, 'furniture stands on the floor');
    const roof = build(sim, 'roof_tile', tx, ty);
    assert.ok(roof, 'the roof went over the chest');
    assert.equal(sim.world.roofAt(tx, ty), roof!.id);
    assert.equal(sim.world.occAt(tx, ty), chest.id, 'the roof does not take the tile from what is under it');
    assert.equal(build(sim, 'roof_slate', tx, ty), undefined, 'one roof per tile');
    assert.equal(sim.world.roofAt(tx, ty), roof!.id);
    p.x = (tx + 0.5) * TILE; p.y = (ty + 1.5) * TILE;
    sim.command('a', { t: 'demolish', id: roof!.id });
    assert.equal(sim.world.roofAt(tx, ty), 0);
    assert.ok(sim.s.ents[chest.id], 'taking the roof off leaves the chest');
    assert.ok(countOf(p, 'plank') > 0);
});

test('a garden bed can be walked over, still takes its tile, and still grows a crop', () => {
    const { sim, p, tx, ty } = yard('H-4');
    const bed = build(sim, 'bed', tx, ty)!;
    assert.ok(bed);
    const w = sim.world, cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    assert.ok(!w.solidAt(cx, cy), 'it does not stop you');
    assert.ok(!w.boxBlocked(cx, cy, 4, 3));
    assert.equal(w.isFree(tx, ty), false, 'but nothing else fits on it');
    assert.equal(build(sim, 'chest', tx, ty), undefined, 'no building on top of a bed');
    assert.equal(build(sim, 'bed', tx, ty), undefined, 'nor a second bed');
    // you can build one while standing on it
    p.x = cx; p.y = cy + 6;
    assert.ok(build(sim, 'bed', tx + 1, ty), 'a bed next to where you stand');
    p.x = (tx + 2.5) * TILE; p.y = (ty + 2.5) * TILE;
    assert.ok(build(sim, 'bed', tx + 2, ty + 2), 'a bed on the tile you stand on');
    // planting still works (a seed in the bed, then time)
    sim.give(p, 'seed_wheat', 1);
    p.x = cx; p.y = cy + 8; p.fx = 0; p.fy = -1;
    sim.command('a', { t: 'use', id: bed.id, seed: 'seed_wheat' });
    assert.equal(bed.plant, 'seed_wheat', 'the seed went into the bed you can walk over');
    assert.ok((bed.crop ?? -1) >= 0, 'and it is growing');
    // demolishing frees the tile
    sim.command('a', { t: 'demolish', id: bed.id });
    assert.equal(sim.world.isFree(tx, ty), true);
    // and it survives a save/load as a walkable bed
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(back.world.isFree(tx + 1, ty), false);
    assert.ok(!back.world.solidAt((tx + 1.5) * TILE, cy));
});

test('a pack raises how many of every item you can carry (but not gear), and swaps cleanly', () => {
    const { sim, p } = yard('H-5');
    p.inv.wood = 0;
    const base = itemCap(p, 'wood');
    assert.equal(base, TUNING.baseCarry, 'the normal limit');
    const sizes: [ItemId, number][] = [['bag_satchel', 40], ['bag_rucksack', 100], ['bag_pack', 220], ['bag_frame', 450], ['bag_rift', 900]];
    let last = base;
    for (const [bag, extra] of sizes) {
        sim.give(p, bag, 1);
        sim.command('a', { t: 'equip', item: bag });
        assert.equal(p.equip.bag, bag);
        assert.equal(itemCap(p, 'wood'), base + extra, `${bag}: +${extra}`);
        assert.ok(itemCap(p, 'wood') > last, 'every pack is bigger than the last');
        last = itemCap(p, 'wood');
    }
    assert.equal(itemCap(p, 'bag_satchel'), 9, 'gear stays at nine, a pack does not carry more swords');
    sim.give(p, 'wood', 100000);
    assert.equal(countOf(p, 'wood'), base + 900, 'filled to the new limit');
    // taking the pack off does not delete anything: you simply cannot pick up more
    sim.command('a', { t: 'unequip', slot: 'bag' });
    assert.equal(p.equip.bag, undefined);
    assert.equal(countOf(p, 'wood'), base + 900, 'nothing is lost');
    sim.give(p, 'wood', 10);
    assert.equal(countOf(p, 'wood'), base + 900, 'but nothing more fits');
    // each pack can be made, and the better ones need better stations
    for (const [bag] of sizes) assert.ok(Object.values(RECIPES).some((r) => r.out === bag), `${bag} has a recipe`);
    assert.ok(ITEMS.bag_satchel.gear?.slot === 'bag');
});

test('down and waiting for a friend, you can choose to wake up at home at once', () => {
    const { sim, p } = yard('H-6');
    const b = sim.join('b', 'B')!;
    b.x = p.x + 20; b.y = p.y; // a friend is on the island
    const home = { x: p.x, y: p.y };
    p.x += 6 * TILE;
    sim.command('a', { t: 'respawn' });
    assert.equal(p.downed, 0, 'nothing happens while you are standing');
    assert.ok(Math.abs(p.x - (home.x + 6 * TILE)) < 1, 'and you did not move');
    p.hearts = 0; p.downed = 40;
    const warp = p.warp;
    sim.command('a', { t: 'respawn' });
    assert.equal(p.downed, 0, 'up again');
    assert.equal(p.hearts, derived(p).maxHearts, 'at full health');
    assert.ok(p.warp > warp, 'put back at your spawn (the client snaps to it)');
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    assert.ok(Math.abs(p.x / TILE - (o.tx + 17)) < 12 && Math.abs(p.y / TILE - (o.ty + 17)) < 12, 'on your home island');
    assert.ok(sim.events.some((e) => e.e === 'banner'), 'told so');
});

test('Ferro’s house quest follows what you really build, and the next one wants you to wear a pack', () => {
    const { sim, p, tx, ty } = yard('H-7');
    p.level = 8;
    sim.command('a', { t: 'quest', op: 'accept', id: 'f5' });
    const log = () => (qsOf(p).log ?? []).map((x) => x.id);
    assert.ok(log().includes('f5'), 'accepted');
    for (let x = 0; x < 6; x++) build(sim, 'planks', tx + x, ty + 3);
    for (let x = 0; x < 8; x++) build(sim, 'wall_wood', tx + (x % 6), ty + (x < 6 ? 2 : 4));
    build(sim, 'doorway', tx + 6, ty + 3);
    for (let x = 0; x < 6; x++) build(sim, 'roof_thatch', tx + x, ty + 3);
    run(sim, 1.5);
    assert.ok(!log().includes('f5'), 'finished by building it');
    assert.ok(qsOf(p).fin?.includes('f5'), 'and recorded as done');
    assert.ok(countOf(p, 'bag_satchel') >= 1, 'the satchel arrives as the reward');
    // the follow-up: a rucksack, worn
    p.level = 8;
    sim.command('a', { t: 'quest', op: 'accept', id: 'f6' });
    assert.ok(log().includes('f6'));
    sim.give(p, 'hide', 6); sim.give(p, 'rope', 6);
    p.x = (tx + 0.5) * TILE; p.y = (ty + 6.5) * TILE;
    const bench = build(sim, 'workbench', tx + 1, ty + 7);
    assert.ok(bench, 'a workbench');
    sim.command('a', { t: 'craft', recipe: 'workbench:bag_rucksack', n: 1 });
    run(sim, 1.5);
    assert.equal(p.equip.bag, 'bag_rucksack', 'a pack you craft is put on for you when your bag slot is empty');
    assert.ok(!log().includes('f6'), 'so the quest is done');
    // the "wear a pack" step reads the bag slot live
    const q = QUEST_BY_ID.f6, wear = q.steps[1];
    delete p.equip.bag;
    assert.equal(stepProgress(sim.s, p, wear, {}), 0, 'nothing on your back');
    p.equip.bag = 'bag_satchel';
    assert.equal(stepProgress(sim.s, p, wear, {}), 1, 'any pack counts');
});

test('a doorway can be set straight into a wall: the wall comes down, its materials come back, and the doorway turns to fit', () => {
    const { sim, p, tx, ty } = yard('HO-door-1');
    p.inv.plank = 40;                                  // (the yard hands out more than a pocket holds, which would make refunds spill)
    // a wall running north to south: three pieces
    const w1 = build(sim, 'wall_wood', tx, ty)!, w2 = build(sim, 'wall_wood', tx, ty + 1)!, w3 = build(sim, 'wall_wood', tx, ty + 2)!;
    assert.ok(w1 && w2 && w3);
    const planks = countOf(p, 'plank');
    const door = build(sim, 'doorway', tx, ty + 1, 0);
    assert.ok(door, 'the doorway went in');
    assert.equal(door.rot, 1, 'turned across a wall that runs north to south');
    assert.equal(sim.s.ents[w2.id], undefined, 'the wall piece it replaced is gone');
    assert.ok(sim.s.ents[w1.id] && sim.s.ents[w3.id], 'its neighbours stay');
    assert.equal(sim.world.softAt(tx, ty + 1), door.id, 'a way through, monsters cannot use it');
    assert.equal(sim.world.occAt(tx, ty + 1), 0, 'nothing solid is left in the gap');
    // wall_wood costs planks: the replaced piece's planks come back, the doorway's cost is paid
    const wallPlanks = BUILDINGS.wall_wood.cost.plank ?? 0, doorPlanks = scaledCost(p, BUILDINGS.doorway.cost).plank ?? 0;
    assert.equal(countOf(p, 'plank'), planks + wallPlanks - doorPlanks);
    // and along a wall that runs east to west it faces the other way
    const e1 = build(sim, 'wall_wood', tx + 3, ty)!, e2 = build(sim, 'wall_wood', tx + 4, ty)!, e3 = build(sim, 'wall_wood', tx + 5, ty)!;
    assert.ok(e1 && e2 && e3);
    assert.equal(build(sim, 'doorway', tx + 4, ty, 1)!.rot, 0);
});

test('only a doorway may go into a wall, and only a wall: nothing else can be built over something', () => {
    const { sim, p, tx, ty } = yard('HO-door-2');
    const wall = build(sim, 'wall_wood', tx, ty)!;
    const chest = build(sim, 'chest', tx + 3, ty)!;
    const before = countOf(p, 'plank');
    assert.equal(build(sim, 'bed', tx, ty), undefined, 'a bed does not replace a wall');
    assert.equal(build(sim, 'chest', tx, ty), undefined);
    assert.equal(build(sim, 'doorway', tx + 3, ty), undefined, 'a doorway does not replace a chest');
    assert.ok(sim.s.ents[wall.id] && sim.s.ents[chest.id], 'both are still there');
    assert.equal(countOf(p, 'plank'), before - 0, 'nothing was spent');
    assert.ok(build(sim, 'doorway', tx, ty), 'but the wall takes a doorway');
});

test('a wall can be taken down with X: most of it comes back', () => {
    const { sim, p, tx, ty } = yard('HO-door-3');
    p.inv.stone = 40;
    const wall = build(sim, 'wall_stone', tx, ty)!;
    const stone = countOf(p, 'stone');
    p.x = (tx + 1.5) * TILE; p.y = (ty + 1.5) * TILE;
    sim.command('a', { t: 'demolish', id: wall.id });
    assert.equal(sim.s.ents[wall.id], undefined, 'gone');
    assert.equal(countOf(p, 'stone'), stone + Math.floor((BUILDINGS.wall_stone.cost.stone ?? 0) * 0.6));
    assert.equal(sim.world.occAt(tx, ty), 0);
});
