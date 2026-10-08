// Headless tests for the shared simulation and host: `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CENTER, GRID, MAX_PLAYERS, TILE, TUNING } from '../src/shared/config';
import { CROPS } from '../src/shared/data/buildings';
import type { ItemId } from '../src/shared/data/items';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';
import { addItem, countOf, derived, xpToNext } from '../src/shared/sim/stats';
import type { BuildE, MobE, NodeE, PlayerS, SimEvent } from '../src/shared/sim/types';
import { slotPlot } from '../src/shared/sim/worldgen';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const banners = (ev: SimEvent[]) => ev.filter((e) => e.e === 'banner').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);
/** Put a player right next to an entity's tile, facing it. */
function standBy (sim: Sim, p: PlayerS, tx: number, ty: number) {
    p.x = (tx - 1) * TILE + 10; p.y = (ty + 1) * TILE - 3; p.fx = 1; p.fy = 0;
    sim.world.setOcc(tx - 1, ty, 0);
}
/** Place a building on a free tile next to the player. */
function placeNear (sim: Sim, p: PlayerS, kind: BuildE['kind'], extra: Partial<BuildE> = {}) {
    const spot = sim.nearestFree(Math.floor(p.x / TILE) + 2, Math.floor(p.y / TILE))!;
    return sim.add<BuildE>({ k: 'bld', kind, tx: spot.tx, ty: spot.ty, rot: 0, ...extra });
}
const give = (sim: Sim, id: string, res: Parameters<Sim['give']>[1], n: number) => sim.give(sim.s.players[id], res, n);

test('spawn slots are spread around two rings, neighbours ~6 plots apart on the first', () => {
    const slots = Array.from({ length: MAX_PLAYERS }, (_, k) => slotPlot(k));
    assert.equal(new Set(slots.map((s) => `${s.gx},${s.gy}`)).size, MAX_PLAYERS);
    for (const s of slots) {
        assert.ok(s.gx > 0 && s.gy > 0 && s.gx < GRID - 1 && s.gy < GRID - 1, 'home not on the edge');
        assert.notDeepEqual(s, CENTER);
    }
    for (let k = 0; k < 8; k++) {
        const a = slots[k], b = slots[(k + 1) % 8];
        const d = Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
        assert.ok(d >= 6, `slots ${k} and ${k + 1} are ${d} plots apart`);
    }
    for (let i = 0; i < MAX_PLAYERS; i++) for (let j = i + 1; j < MAX_PLAYERS; j++) {
        const d = Math.abs(slots[i].gx - slots[j].gx) + Math.abs(slots[i].gy - slots[j].gy);
        assert.ok(d >= 4, `homes ${i} and ${j} are ${d} plots apart`);
    }
});

test('16 players join on separate home islands; the 17th is refused', () => {
    const sim = Sim.create('TEST-1', 'test');
    const players = Array.from({ length: MAX_PLAYERS }, (_, k) => sim.join(`p${k}`, `P${k}`)!);
    assert.ok(players.every(Boolean), 'everybody got in');
    assert.equal(new Set(players.map((p) => p.slot)).size, MAX_PLAYERS);
    assert.equal(new Set(players.map((p) => sim.homePlot(p.slot).i)).size, MAX_PLAYERS, 'every island is somebody’s own');
    for (const p of players) {
        const home = sim.homePlot(p.slot);
        assert.ok(home.owned && home.nodes >= 10, 'home raised and stocked');
        assert.equal(home.biome, 'meadow', 'a meadow');
        assert.equal(home.mod, null, 'nothing strange about it');
        assert.equal(home.home, p.slot);
        assert.equal(sim.world.plotAtPx(p.x, p.y), home);
        assert.ok(!sim.world.boxBlocked(p.x, p.y, 4, 3), 'player does not start inside something');
        assert.equal(p.equip.tool, 'pick_flint');
    }
    assert.equal(sim.join('p17', 'Late'), null);
    sim.leave('p3');
    assert.equal(sim.join('p3', 'P3')!.slot, players[3].slot);
    // and the same homes come back after a save and a load
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    for (const p of players) assert.equal(back.homePlot(p.slot).i, sim.homePlot(p.slot).i);
});

test('a farmer from the second ring gets a home even when the spot is already taken', () => {
    const sim = Sim.create('TEST-1b', 'test');
    for (let k = 0; k < 8; k++) sim.join(`p${k}`, `P${k}`);
    // a friend has already bought the land where farmer nine would live
    const spot = slotPlot(8);
    const taken = sim.world.plot(spot.gx, spot.gy)!;
    taken.owned = true; taken.buyer = 'p0';
    sim.world.recompute();
    const p = sim.join('p8', 'Nine')!;
    const home = sim.homePlot(p.slot);
    assert.notEqual(home.i, taken.i, 'not on somebody else’s island');
    assert.ok(home.owned && home.home === 8 && home.biome === 'meadow' && home.mod === null);
    assert.ok(Math.abs(home.gx - taken.gx) + Math.abs(home.gy - taken.gy) >= 1);
    assert.ok(sim.s.homes?.[8], 'the choice is remembered');
    // the land beside it has resources worth having and nothing haunted
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = sim.world.plot(home.gx + dx, home.gy + dy);
        if (n && !n.owned) assert.ok(n.mod === null && n.biome !== undefined);
    }
});

test('harvesting a tree drops wood that flies to the nearest player', () => {
    const sim = Sim.create('TEST-2', 'test');
    const p = sim.join('a', 'A')!;
    const tree = Object.values(sim.s.ents).find((e): e is NodeE => e.k === 'node' && e.kind === 'tree')!;
    standBy(sim, p, tree.tx, tree.ty);
    for (let i = 0; i < 10 && sim.s.ents[tree.id]; i++) { sim.command('a', { t: 'swing', id: tree.id }); run(sim, 0.4); }
    assert.equal(sim.s.ents[tree.id], undefined, 'tree broke');
    run(sim, 2);
    assert.ok(countOf(p, 'wood') >= 2, `got ${countOf(p, 'wood')} wood`);
    assert.ok(p.xp > 0 && p.energy < TUNING.maxEnergy);
    const fx = fxNames(events(sim));
    assert.ok(fx.includes('hitWood') && fx.includes('breakTree') && fx.includes('pickup'));
});

test('swings out of reach or too fast are ignored; crystals need a better pick', () => {
    const sim = Sim.create('TEST-3', 'test');
    const p = sim.join('a', 'A')!;
    const rock = Object.values(sim.s.ents).find((e): e is NodeE => e.k === 'node' && e.kind === 'rock')!;
    p.x = (rock.tx + 6) * TILE; p.y = rock.ty * TILE;
    sim.command('a', { t: 'swing', id: rock.id });
    assert.equal(rock.hp, 4, 'far swing ignored');
    standBy(sim, p, rock.tx, rock.ty);
    sim.command('a', { t: 'swing', id: rock.id });
    sim.command('a', { t: 'swing', id: rock.id });
    assert.equal(rock.hp, 3, 'second swing inside the cooldown ignored');
    const crystal = sim.add<NodeE>({ k: 'node', kind: 'crystal', tx: rock.tx, ty: rock.ty + 2, hp: 10, plot: rock.plot });
    standBy(sim, p, crystal.tx, crystal.ty);
    run(sim, 0.5);
    sim.command('a', { t: 'swing', id: crystal.id });
    assert.equal(crystal.hp, 10, 'a flint pick cannot dent a crystal');
});

test('buying land: needs coins, prices scale per buyer, lands connect', () => {
    const sim = Sim.create('TEST-4', 'test');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    const ha = sim.homePlot(a.slot), hb = sim.homePlot(b.slot);
    const next = (gx: number, gy: number) => sim.world.plot(gx, gy)!;
    const path = [];
    let { gx, gy } = ha;
    while (gx !== hb.gx) { gx += Math.sign(hb.gx - gx); if (gx !== hb.gx || gy !== hb.gy) path.push(next(gx, gy)); }
    while (gy !== hb.gy) { gy += Math.sign(hb.gy - gy); if (gx !== hb.gx || gy !== hb.gy) path.push(next(gx, gy)); }
    assert.ok(path.length >= 4, `homes are ${path.length + 1} plots apart`);

    sim.command('a', { t: 'buy', plot: path[0].i });
    assert.equal(path[0].owned, false, 'no coins, no land');
    const firstPriceB = sim.world.price(path[path.length - 1], b.plotsBought);
    a.coins = 1000;
    events(sim);
    for (const plot of path.slice(0, -1)) sim.command('a', { t: 'buy', plot: plot.i });
    assert.ok(path.slice(0, -1).every((p) => p.owned));
    assert.equal(sim.world.price(path[path.length - 1], b.plotsBought), firstPriceB, "A's buying doesn't raise B's prices");
    assert.ok(!banners(events(sim)).includes('Lands connected!'));
    b.coins = 100;
    sim.command('b', { t: 'buy', plot: path[path.length - 1].i });
    assert.ok(path[path.length - 1].owned);
    assert.ok(banners(events(sim)).includes('Lands connected!'), 'meeting up is celebrated');
});

test('downed players can be revived by a friend, or wake at home', () => {
    const sim = Sim.create('TEST-5', 'test');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    b.x = a.x + 10; b.y = a.y;
    a.hearts = 1;
    const add = (sim as unknown as { add: (e: object) => MobE }).add.bind(sim);
    add({ k: 'mob', kind: 'skeleton', x: a.x + 2, y: a.y, hp: 9, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    run(sim, 0.2);
    assert.ok(a.downed > 0 && a.hearts === 0, 'A is down');
    for (const e of Object.values(sim.s.ents)) if (e.k === 'mob') sim.remove(e.id);
    for (let t = 0; t < 3; t += 0.1) { sim.command('b', { t: 'revive', who: 'a' }); run(sim, 0.1); }
    assert.equal(a.downed, 0);
    assert.equal(a.hearts, 2);
    assert.equal(b.stats.revives, 1);
    a.hearts = 1; a.invuln = 0;
    const warp = a.warp;
    add({ k: 'mob', kind: 'skeleton', x: a.x + 2, y: a.y, hp: 9, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    run(sim, 0.2);
    for (const e of Object.values(sim.s.ents)) if (e.k === 'mob') sim.remove(e.id);
    run(sim, TUNING.downedSeconds + 1);
    assert.equal(a.downed, 0);
    assert.equal(a.hearts, derived(a).maxHearts);
    assert.equal(a.warp, warp + 1);
    assert.equal(sim.world.plotAtPx(a.x, a.y), sim.homePlot(a.slot));
});

test('armor reduces damage in half-hearts, but never below half a heart', () => {
    const sim = Sim.create('TEST-5b', 'test');
    const a = sim.join('a', 'A')!;
    a.invuln = 0;
    sim.hurt(a, { x: a.x + 1, y: a.y }, 1);
    assert.equal(a.hearts, TUNING.startHearts - 1);
    give(sim, 'a', 'plate_steel', 1); give(sim, 'a', 'helm_steel', 1);
    sim.command('a', { t: 'equip', item: 'plate_steel' });
    sim.command('a', { t: 'equip', item: 'helm_steel' });
    a.hearts = derived(a).maxHearts; a.invuln = 0;
    const before = a.hearts;
    sim.hurt(a, { x: a.x + 1, y: a.y }, 1);
    assert.equal(before - a.hearts, 0.5, 'steel armor shrugs a hit down to half a heart');
});

test('nights bring mobs near each player and dawn clears them', () => {
    const sim = Sim.create('TEST-6', 'test');
    const a = sim.join('a', 'A')!;
    sim.s.clock = TUNING.dayLength - 0.5;
    run(sim, 1 + TUNING.nightSpawnWindow + 3);
    const mobs = Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !e.zone);
    assert.ok(sim.s.night && mobs.length >= 1, `${mobs.length} mobs at night`);
    assert.ok(mobs.every((m) => sim.world.plotAtPx(m.x, m.y)?.owned));
    a.invuln = 999;
    run(sim, sim.s.nightLen + 1);
    assert.equal(sim.s.night, false);
    assert.equal(sim.s.day, 2);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob' && !(e as MobE).zone).length, 0);
});

test('a saved world loads back with players offline and keeps their stuff', () => {
    const sim = Sim.create('TEST-7', 'test');
    const a = sim.join('a', 'A')!;
    a.inv.wood = 42; a.coins = 7; a.skills.g_wood = 2; a.points = 3;
    run(sim, 3);
    const loaded = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(Object.keys(loaded.s.ents).length, Object.keys(sim.s.ents).length);
    assert.equal(loaded.s.players.a.online, false);
    for (const e of Object.values(loaded.s.ents)) if (e.k === 'node') assert.equal(loaded.world.occAt(e.tx, e.ty), e.id);
    const back = loaded.join('a', 'A')!;
    assert.equal(countOf(back, 'wood'), 42);
    assert.equal(back.coins, 7);
    assert.equal(back.skills.g_wood, 2);
    assert.throws(() => new Sim({ ...JSON.parse(JSON.stringify(sim.s)), version: 1 }), /version/);
});

test('levelling grants skill points; learning a skill needs a connected parent and changes stats', () => {
    const sim = Sim.create('TEST-8', 'test');
    const a = sim.join('a', 'A')!;
    assert.equal(a.points, 0);
    sim.gainXp(a, xpToNext(1));
    assert.equal(a.level, 2);
    assert.equal(a.points, 1);
    sim.command('a', { t: 'skill', id: 'g_wood' });
    assert.equal(a.skills.g_wood, undefined, 'g_wood needs g_hands first');
    const swing0 = derived(a).swingCd;
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.equal(a.skills.g_hands, 1);
    assert.equal(a.points, 0);
    assert.ok(derived(a).swingCd < swing0, 'swing speed improved');
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.equal(a.skills.g_hands, 1, 'no points left');
    // unlocks gate buildings
    a.points = 5;
    give(sim, 'a', 'ironbar', 3); give(sim, 'a', 'stone', 6); give(sim, 'a', 'wood', 4);
    const tx = Math.floor(a.x / TILE) + 2, ty = Math.floor(a.y / TILE);
    sim.command('a', { t: 'build', kind: 'anvil', tx, ty });
    assert.equal(sim.buildings('anvil').length, 0, 'anvil is locked until Blacksmithing');
    sim.command('a', { t: 'skill', id: 'i_smith' });
    sim.command('a', { t: 'build', kind: 'anvil', tx, ty });
    assert.equal(sim.buildings('anvil').length, 1);
});

test('a paused solo world still takes menu actions but not world ones', () => {
    const sim = Sim.create('TEST-8b', 'test');
    const a = sim.join('a', 'A')!;
    a.points = 2;
    sim.command('a', { t: 'pause', on: true });
    assert.equal(sim.s.paused, true);
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.equal(a.skills.g_hands, 1, 'skills work in menus');
    const x = a.x;
    sim.command('a', { t: 'move', x: a.x + 5, y: a.y, fx: 1, fy: 0, moving: true });
    assert.equal(a.x, x, 'but you cannot walk');
    run(sim, 1);
    assert.equal(sim.s.time, 0, 'and time stands still');
});

test('crafting needs the right station, consumes materials and auto-equips better gear', () => {
    const sim = Sim.create('TEST-9', 'test');
    const a = sim.join('a', 'A')!;
    give(sim, 'a', 'fiber', 4);
    sim.command('a', { t: 'craft', recipe: 'hand:rope', n: 2 });
    assert.equal(countOf(a, 'rope'), 2);
    assert.equal(countOf(a, 'fiber'), 0);
    give(sim, 'a', 'wood', 10);
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 1 });
    assert.equal(countOf(a, 'plank'), 0, 'needs a workbench nearby');
    placeNear(sim, a, 'workbench');
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 3 });
    assert.equal(countOf(a, 'plank'), 3);
    assert.equal(countOf(a, 'wood'), 4);
    // iron pick via the anvil, auto-equipped
    a.skills.i_smith = 1;
    placeNear(sim, a, 'anvil');
    give(sim, 'a', 'ironbar', 4);
    sim.command('a', { t: 'craft', recipe: 'anvil:pick_iron', n: 1 });
    assert.equal(a.equip.tool, 'pick_iron');
    assert.equal(derived(a).toolPower, 2);
    assert.equal(countOf(a, 'pick_flint'), 1, 'the old pick went back to the pack');
    sim.command('a', { t: 'unequip', slot: 'tool' });
    assert.equal(a.equip.tool, undefined);
    sim.command('a', { t: 'equip', item: 'pick_iron' });
    assert.equal(a.equip.tool, 'pick_iron');
    // locked recipe
    give(sim, 'a', 'goldbar', 4); give(sim, 'a', 'ironbar', 4);
    const before = countOf(a, 'pick_gold');
    sim.command('a', { t: 'craft', recipe: 'anvil:pick_gold', n: 1 });
    assert.equal(countOf(a, 'pick_gold'), before, 'golden pick needs Steelwork');
});

test('a furnace burns fuel, smelts ore into bars and hands them back', () => {
    const sim = Sim.create('TEST-10', 'test');
    const a = sim.join('a', 'A')!;
    const f = placeNear(sim, a, 'furnace', { inv: {}, out: {}, fin: {}, fuel: 0, prog: 0, by: 'a' });
    give(sim, 'a', 'iron', 3); give(sim, 'a', 'coal', 2);
    sim.command('a', { t: 'xfer', id: f.id, item: 'iron', n: 3, dir: 'put' });
    assert.equal(f.inv!.iron, 3);
    run(sim, 6);
    assert.equal(f.out?.ironbar ?? 0, 0, 'no fuel, no smelting');
    sim.command('a', { t: 'xfer', id: f.id, item: 'coal', n: 1, dir: 'put', part: 'fuel' });
    run(sim, 12);
    assert.equal(f.out!.ironbar, 3, 'three bars smelted');
    assert.ok((f.fuel ?? 0) > 0 || Object.keys(f.fin ?? {}).length === 0);
    sim.command('a', { t: 'collect', id: f.id });
    assert.equal(countOf(a, 'ironbar'), 3);
    assert.ok(a.xp > 0);
    sim.command('a', { t: 'xfer', id: f.id, item: 'wood', n: 1, dir: 'put' });
    assert.equal(f.inv!.wood, undefined, "a furnace won't take wood as an ingredient");
    // load-all convenience
    give(sim, 'a', 'copper', 2); give(sim, 'a', 'sand', 4); give(sim, 'a', 'peat', 5);
    sim.command('a', { t: 'load', id: f.id });
    assert.equal(f.inv!.copper, 2);
    assert.equal(f.inv!.sand, 4);
    assert.ok((f.fin?.coal ?? 0) + (f.fin?.peat ?? 0) > 0, 'fuel loaded too');
});

test('sawmill doubles planks; millstone grinds wheat; chests hold items for anyone', () => {
    const sim = Sim.create('TEST-11', 'test');
    const a = sim.join('a', 'A')!;
    const saw = placeNear(sim, a, 'sawmill', { inv: {}, out: {}, fuel: 0, prog: 0, by: 'a' });
    give(sim, 'a', 'wood', 6);
    sim.command('a', { t: 'xfer', id: saw.id, item: 'wood', n: 6, dir: 'put' });
    run(sim, 14);
    assert.equal(saw.out!.plank, 12);
    const chest = placeNear(sim, a, 'chest', { inv: {} });
    sim.command('a', { t: 'collect', id: saw.id });
    sim.command('a', { t: 'xfer', id: chest.id, item: 'plank', n: 8, dir: 'put' });
    assert.equal(chest.inv!.plank, 8);
    assert.equal(countOf(a, 'plank'), 4);
    sim.command('a', { t: 'xfer', id: chest.id, item: 'plank', n: 3, dir: 'take' });
    assert.equal(countOf(a, 'plank'), 7);
    assert.equal(chest.inv!.plank, 5);
});

test('food restores energy, potions heal and grant buffs that expire', () => {
    const sim = Sim.create('TEST-12', 'test');
    const a = sim.join('a', 'A')!;
    a.energy = 10;
    give(sim, 'a', 'bread', 1); give(sim, 'a', 'potion_swift', 1); give(sim, 'a', 'potion_heal', 1);
    const speed0 = derived(a).speed;
    sim.command('a', { t: 'eat' });
    assert.ok(a.energy >= 40, 'bread restores 30 energy');
    assert.ok(a.buffs.some((b) => b.id === 'sated'));
    sim.command('a', { t: 'eat', item: 'potion_swift' });
    assert.ok(derived(a).speed > speed0 * 1.2, 'swift brew speeds you up');
    a.hearts = 1;
    sim.command('a', { t: 'eat', item: 'potion_heal' });
    assert.equal(a.hearts, 3);
    run(sim, 200);
    assert.equal(a.buffs.length, 0, 'buffs wore off');
    assert.ok(Math.abs(derived(a).speed - speed0) < 1e-9);
});

test('crops: plant a seed, wait, harvest more than you planted', () => {
    const sim = Sim.create('TEST-13', 'test');
    const a = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);          // (so the bed goes right beside the farmer)
    const bed = placeNear(sim, a, 'bed', { crop: -1 });
    sim.command('a', { t: 'use', id: bed.id });
    assert.equal(bed.crop, -1, 'no seeds, nothing planted');
    give(sim, 'a', 'seed_wheat', 2); give(sim, 'a', 'seed_carrot', 1);
    events(sim);
    sim.command('a', { t: 'use', id: bed.id });
    assert.ok(events(sim).some((e) => e.e === 'open' && e.ui === 'bed'), 'several seed types: asks which');
    sim.command('a', { t: 'use', id: bed.id, seed: 'seed_wheat' });
    assert.equal(bed.crop, 0);
    assert.equal(bed.plant, 'seed_wheat');
    run(sim, CROPS.seed_wheat!.stageSecs * 2 + 1);
    assert.equal(bed.crop, 2, 'ripe');
    a.x = (bed.tx - 0.2) * TILE; a.y = (bed.ty + 0.9) * TILE;          // (right beside it: the bed was put two tiles off, which is only just within reach)
    sim.command('a', { t: 'swing', id: bed.id });
    run(sim, 2);
    assert.ok(countOf(a, 'wheat') >= 2);
    assert.equal(bed.crop, -1);
});

test('every crop in the catalogue grows from its seed and yields its produce', () => {
    for (const [seed, crop] of Object.entries(CROPS)) {
        const sim = Sim.create('TEST-CROPS-' + seed, 'test');
        const a = sim.join('a', 'A')!;
        const bed = placeNear(sim, a, 'bed', { crop: -1 });
        a.x = (bed.tx + 0.5) * TILE; a.y = (bed.ty + 1.5) * TILE; a.warp++;   // stand right next to it
        give(sim, 'a', seed as ItemId, 1);
        sim.command('a', { t: 'use', id: bed.id, seed: seed as ItemId });
        assert.equal(bed.plant, seed, `${seed} planted`);
        run(sim, crop.stageSecs * 2 + 1);
        assert.equal(bed.crop, 2, `${seed} ripe`);
        sim.command('a', { t: 'swing', id: bed.id });
        run(sim, 2);
        assert.ok(countOf(a, crop.out) >= crop.yield[0], `${seed} gave ${crop.out}`);
    }
});

test('selling needs a market next to you and respects selling-price skills', () => {
    const sim = Sim.create('TEST-14', 'test');
    const a = sim.join('a', 'A')!;
    give(sim, 'a', 'wood', 10);
    sim.command('a', { t: 'sell', item: 'wood', n: 10 });
    assert.equal(a.coins, 0, 'no market');
    placeNear(sim, a, 'market');
    sim.command('a', { t: 'sell', item: 'wood', n: 10 });
    assert.equal(a.coins, 10);
    a.skills.x_haggle = 5;
    give(sim, 'a', 'ironbar', 10);
    sim.command('a', { t: 'sell', item: 'ironbar', n: 10 });
    assert.equal(a.coins, 10 + Math.round(7 * 10 * 1.3));
});

test('pockets have a cap: surplus stays on the ground, skills raise it', () => {
    const sim = Sim.create('TEST-15', 'test');
    const a = sim.join('a', 'A')!;
    const cap = TUNING.baseCarry;
    assert.equal(addItem(a, 'wood', cap + 20), cap);
    sim.give(a, 'wood', 5);
    assert.equal(countOf(a, 'wood'), cap);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'drop' && e.res === 'wood').length, 5);
    a.skills.x_pack = 2;
    assert.equal(addItem(a, 'wood', 100), 50);
});

test('host: hello → welcome, ticks carry public views of others and only your own events', () => {
    const host = new SimHost(Sim.create('TEST-16', 'test'), 'Test', 'secret');
    const inbox = (): Peer & { msgs: ServerMsg[] } => {
        const msgs: ServerMsg[] = [];
        return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } };
    };
    const bad = inbox();
    host.attach(bad);
    host.receive(bad, JSON.stringify({ t: 'hello', v: 1, id: 'x', name: 'X', password: 'nope' }));
    assert.equal(bad.msgs[0].t, 'refused');

    const a = inbox(), b = inbox();
    host.attach(a); host.attach(b);
    host.receive(a, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'Ann', password: 'secret' }));
    host.receive(b, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'b', name: 'Bo', password: 'secret' }));
    assert.equal(a.msgs[0].t, 'welcome');
    host.update(0.15);
    const tickA = a.msgs.find((m): m is TickMsg => m.t === 'tick')!;
    const me = tickA.players.find((p) => p.id === 'a')!, other = tickA.players.find((p) => p.id === 'b')!;
    assert.ok(me.inv && !other.inv && !other.skills, 'own inventory and skills only');
    assert.equal(other.equip?.tool, 'pick_flint', 'but friends can see your gear');
    const welcome = tickA.ev.filter((e) => e.e === 'banner').map((e) => (e as { text: string }).text);
    assert.ok(welcome.includes('Welcome, Ann!') && !welcome.includes('Welcome, Bo!'));
    host.detach(b);
    assert.equal(host.sim.s.players.b.online, false);
    assert.equal(host.playerCount, 1);
});

test('an item nobody picks up fades from the ground after a while, and a full pocket leaves it there until then', () => {
    const sim = Sim.create('DROP-1', 'drop');
    const a = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    a.x += 400; a.warp++;                                       // far from the drop
    sim.spawnDrop('stone', a.x - 400, a.y);
    const drop = Object.values(sim.s.ents).find((e) => e.k === 'drop')!;
    run(sim, TUNING.dropLife - 5);
    assert.ok(sim.s.ents[drop.id], 'still there');
    run(sim, 10);
    assert.equal(sim.s.ents[drop.id], undefined, 'gone');
});

test('the per-step caches notice a buff given or ended inside a step, and a kind list is a snapshot of the step it was taken in', () => {
    const sim = Sim.create('TEST-cache', 'test');
    const a = sim.join('a', 'A')!;
    // derived stats: a buff pushed in place (as the hearth does) and one that runs out (a filtered list) both show at once
    const plain = sim.derivedOf(a).maxHearts;
    a.buffs.push({ id: 'vigor', t: 0.3 });
    assert.equal(sim.derivedOf(a).maxHearts, plain + 1.5, 'a buff given inside a step counts straight away');
    a.energy = 0;
    assert.equal(sim.derivedOf(a).speed, derived(a).speed, 'starving slows you the moment it happens');
    a.energy = 50;
    run(sim, 0.5);
    assert.equal(a.buffs.length, 0, 'the buff ran out');
    assert.equal(sim.derivedOf(a).maxHearts, plain, 'and is gone from the stats');
    assert.deepEqual(sim.derivedOf(a), derived(a), 'the cache agrees with the plain function');
    // unlock tokens: a skill learned by a command shows on the next look
    assert.equal(sim.hasUnlock(a, 'dash'), false, 'nothing learned');
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'skills' });
    assert.equal(sim.hasUnlock(a, 'dash'), true);
    // who is online: join and leave are the only writers, and the list follows them
    const b = sim.join('b', 'B')!;
    assert.deepEqual(sim.online.map((q) => q.id), ['a', 'b']);
    sim.leave('b');
    assert.deepEqual(sim.online.map((q) => q.id), ['a']);
    assert.ok(!b.online);
    // kind lists: what a loop started with is what it walks, however many are added or taken on the way, and the next look is current
    const drops = sim.ents('drop');
    const n0 = drops.length;
    const d1 = sim.spawnDrop('wood', a.x, a.y), d2 = sim.spawnDrop('wood', a.x, a.y);
    assert.equal(drops.length, n0, 'the list in hand did not change');
    assert.equal(sim.ents('drop').length, n0 + 2, 'the fresh list has both');
    sim.remove(d1.id);
    assert.deepEqual(sim.ents('drop').map((e) => e.id).slice(-1), [d2.id], 'in id order, with the removed one gone');
    assert.deepEqual([...sim.ents('drop')].map((e) => e.id), Object.values(sim.s.ents).filter((e) => e.k === 'drop').map((e) => e.id), 'the same order Object.values gives');
    const blds = sim.buildings();
    const fire = placeNear(sim, a, 'campfire');
    assert.ok(sim.buildings('campfire').includes(fire) && sim.buildings().length === blds.length + 1 && !blds.includes(fire));
    assert.equal(sim.factoryN, 0, 'a campfire is not a factory piece');
    placeNear(sim, a, 'pole');
    assert.equal(sim.factoryN, 1);
    assert.ok(sim.powerDirty, 'a pole makes the grid stale');
});
