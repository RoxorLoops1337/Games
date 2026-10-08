// The economy (sim/economy.ts): crafting, land, the market, gear, building and taking down, moving things in and out, food and skills.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BIOME_DEFS, MODS } from '../src/shared/data/biomes';
import { ITEMS } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import { UNLOCK_INFO } from '../src/shared/data/skills';
import { Sim } from '../src/shared/sim/sim';
import { countOf, derived, hasUnlock, itemCap } from '../src/shared/sim/stats';
import type { BuildE, Cmd, SimEvent } from '../src/shared/sim/types';

const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);
const toasts = (ev: SimEvent[]) => ev.filter((e) => e.e === 'toast').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);
const denied = (ev: SimEvent[]) => fxNames(ev).includes('deny');

/** A cleared home island with the farmer standing six tiles in from its corner. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'eco');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    events(sim);
    return { sim, p, o, tx: o.tx + 6, ty: o.ty + 6 };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });

test('crafting needs the station within reach, the ingredients and the unlock; it pays XP, counts, and puts better gear straight on', () => {
    const { sim, p, o } = yard('ECO-craft');
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 1 });
    assert.ok(floats(events(sim)).includes('Stand next to a workbench'));
    put(sim, 'workbench', o.tx + 6, o.ty + 4);
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 1 });
    assert.ok(floats(events(sim)).includes('Not enough materials'));
    sim.give(p, 'wood', 3);
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 1 });
    const ev = events(sim);
    assert.equal(countOf(p, 'plank'), 1);
    assert.equal(countOf(p, 'wood'), 1, 'two logs went into the plank');
    assert.equal(p.xp, RECIPES['workbench:plank'].xp);
    assert.equal(p.stats.crafted, 1);
    assert.ok(fxNames(ev).includes('craft') && floats(ev).includes('+1 Plank'));
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 5 });
    assert.ok(floats(events(sim)).includes('Not enough materials'), 'one log is not a plank');
    assert.equal(countOf(p, 'wood'), 1);
    // by hand: no station needed
    sim.give(p, 'fiber', 2);
    sim.command('a', { t: 'craft', recipe: 'hand:rope', n: 1 });
    assert.equal(countOf(p, 'rope'), 1);
    // a freshly made pick that beats the flint one goes on at once, and the old one goes in the pocket
    put(sim, 'anvil', o.tx + 8, o.ty + 4);
    sim.give(p, 'ironbar', 4); sim.give(p, 'plank', 2);
    sim.command('a', { t: 'craft', recipe: 'anvil:pick_iron', n: 1 });
    assert.equal(p.equip.tool, 'pick_iron');
    assert.equal(countOf(p, 'pick_flint'), 1);
    assert.ok(toasts(events(sim)).includes('Equipped Iron Pick'));
    // a recipe behind a skill
    sim.give(p, 'goldbar', 4); sim.give(p, 'ironbar', 2); sim.give(p, 'plank', 2);
    sim.command('a', { t: 'craft', recipe: 'anvil:pick_gold', n: 1 });
    assert.ok(floats(events(sim)).includes('Locked — learn it in the skill tree'));
    assert.equal(countOf(p, 'goldbar'), 4, 'nothing was taken');
    // an order is one to twenty-five
    sim.give(p, 'wood', 60);
    const planks = countOf(p, 'plank');
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 100 });
    assert.equal(countOf(p, 'plank'), planks + 25);
    assert.equal(countOf(p, 'wood'), 61 - 50);
    assert.ok(floats(events(sim)).includes('+25 Plank'));
    sim.command('a', { t: 'craft', recipe: 'no:such', n: 1 });
    assert.equal(events(sim).length, 0, 'an unknown recipe is nothing');
});

test('the chests beside a station count as pockets when crafting, pockets first', () => {
    const { sim, p, o } = yard('ECO-pool');
    put(sim, 'workbench', o.tx + 6, o.ty + 4);
    const chest = put(sim, 'chest', o.tx + 9, o.ty + 4, { inv: { wood: 4 } });
    sim.give(p, 'wood', 2);
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 2 });
    assert.equal(countOf(p, 'plank'), 2);
    assert.equal(countOf(p, 'wood'), 0, 'the pocket logs went first');
    assert.equal(chest.inv!.wood, 2, 'then the chest’s');
    assert.ok(floats(events(sim)).includes('from the chests nearby'));
});

test('land is bought next to owned land only, for a price that grows with each plot the buyer owns, coins counted exactly', () => {
    const { sim, p } = yard('ECO-land');
    const home = sim.homePlot(p.slot);
    const far = sim.s.plots.find((pl) => !pl.owned && !pl.dread && !pl.heart && pl.home === undefined && Math.abs(pl.gx - home.gx) + Math.abs(pl.gy - home.gy) > 3)!;
    p.coins = 100000;
    sim.command('a', { t: 'buy', plot: far.i });
    assert.equal(far.owned, false, 'not touching the farm: not for sale');
    assert.equal(p.coins, 100000);
    assert.equal(events(sim).length, 0, 'and nothing is said');
    const next = sim.world.plot(home.gx + 1, home.gy)!;
    const price = sim.world.price(next, 0);
    p.coins = price - 1;
    sim.command('a', { t: 'buy', plot: next.i });
    assert.ok(floats(events(sim)).includes(`Needs ${price} coins`));
    assert.equal(next.owned, false);
    p.coins = price;
    sim.command('a', { t: 'buy', plot: next.i });
    const ev = events(sim);
    assert.ok(next.owned && next.buyer === 'a');
    assert.equal(p.coins, 0, 'the exact price');
    assert.equal(p.plotsBought, 1);
    assert.equal(p.xp, 10);
    assert.ok(next.nodes > 0 && next.veins !== undefined, 'the land is stocked and has ore');
    assert.ok(fxNames(ev).includes('buyLand'));
    assert.ok(ev.some((e) => e.e === 'banner' && e.text.startsWith(BIOME_DEFS[next.biome].name)), 'the land is named');
    // the second plot costs more, by the growth factor
    const next2 = sim.world.plot(home.gx + 2, home.gy)!;
    const mods = BIOME_DEFS[next2.biome].priceMul * (next2.mod ? MODS[next2.mod].priceMul : 1);
    assert.equal(sim.world.price(next2, p.plotsBought), Math.round(TUNING.landBasePrice * TUNING.landPriceGrowth * mods));
    assert.ok(sim.world.price(next2, 1) >= sim.world.price(next2, 0));
    // Land Baron takes a quarter off
    p.skills.x_land = 5;
    const cheaper = Math.max(1, Math.round(sim.world.price(next2, 1) * 0.75));
    p.coins = cheaper;
    sim.command('a', { t: 'buy', plot: next2.i });
    assert.ok(next2.owned && p.coins === 0, 'the discounted price, exactly');
    // another farmer starts at the first price again
    const b = sim.join('b', 'B')!;
    const next3 = sim.world.plot(home.gx + 3, home.gy)!;
    b.coins = 100000;
    sim.command('b', { t: 'buy', plot: next3.i });
    assert.equal(b.coins, 100000 - sim.world.price(next3, 0));
    assert.equal(b.plotsBought, 1);
});

test('selling needs a market within three tiles and pays the market price times the selling bonus', () => {
    const { sim, p, o } = yard('ECO-sell');
    sim.give(p, 'wood', 5);
    sim.command('a', { t: 'sell', item: 'wood', n: 5 });
    assert.ok(floats(events(sim)).includes('Stand next to a market'));
    assert.equal(countOf(p, 'wood'), 5);
    put(sim, 'market', o.tx + 5, o.ty + 4);
    sim.command('a', { t: 'sell', item: 'wood', n: 5 });
    const ev = events(sim);
    assert.equal(p.coins, 5 * ITEMS.wood.sell);
    assert.equal(countOf(p, 'wood'), 0);
    assert.ok(fxNames(ev).includes('sell') && floats(ev).includes('+5 coins'));
    // Haggler: thirty percent more
    p.skills.x_haggle = 5;
    sim.give(p, 'goldbar', 10);
    sim.command('a', { t: 'sell', item: 'goldbar', n: 10 });
    assert.equal(p.coins, 5 + Math.round(ITEMS.goldbar.sell * 10 * 1.3));
    // more than you have sells what you have; nothing sells for nothing
    const coins = p.coins;
    sim.give(p, 'stone', 3);
    sim.command('a', { t: 'sell', item: 'stone', n: 10 });
    assert.equal(countOf(p, 'stone'), 0);
    assert.equal(p.coins, coins + Math.round(3 * 1.3));
    const again = p.coins;
    sim.command('a', { t: 'sell', item: 'stone', n: 0 });
    sim.command('a', { t: 'sell', item: 'stone', n: NaN });
    assert.equal(p.coins, again, 'no count, no sale');
    // a farmer far from the stall
    p.x = (o.tx + 12) * TILE;
    sim.give(p, 'wood', 1);
    sim.command('a', { t: 'sell', item: 'wood', n: 1 });
    assert.ok(floats(events(sim)).includes('Stand next to a market'));
});

test('selling an item you do not carry pays nothing', () => {
    const { sim, p, o } = yard('ECO-sell-empty');
    put(sim, 'market', o.tx + 5, o.ty + 4);
    sim.command('a', { t: 'sell', item: 'wood', n: 5 });
    assert.equal(p.coins, 0, 'no wood, no coins');
    assert.ok(!fxNames(events(sim)).includes('sell'));
});

test('gear changes the derived stats: equipping swaps the old piece back, unequipping needs room in the pockets, a pack widens them', () => {
    const { sim, p } = yard('ECO-gear');
    assert.equal(derived(p).armor, 0);
    sim.give(p, 'helm_iron', 1);
    sim.command('a', { t: 'equip', item: 'helm_iron' });
    assert.equal(p.equip.head, 'helm_iron');
    assert.equal(countOf(p, 'helm_iron'), 0);
    assert.equal(derived(p).armor, 0.5);
    assert.ok(fxNames(events(sim)).includes('equip'));
    sim.give(p, 'helm_steel', 1);
    sim.command('a', { t: 'equip', item: 'helm_steel' });
    assert.equal(p.equip.head, 'helm_steel');
    assert.equal(countOf(p, 'helm_iron'), 1, 'the iron helm came back');
    assert.equal(derived(p).armor, 0.75);
    assert.equal(derived(p).maxHearts, TUNING.startHearts + 0.5);
    assert.ok(fxNames(events(sim)).includes('equip'));
    sim.command('a', { t: 'equip', item: 'plate_steel' });
    sim.command('a', { t: 'equip', item: 'wood' });
    assert.equal(events(sim).length, 0, 'gear you do not have, or no gear at all: nothing');
    assert.equal(p.equip.body, undefined);
    sim.command('a', { t: 'unequip', slot: 'head' });
    assert.equal(p.equip.head, undefined);
    assert.equal(countOf(p, 'helm_steel'), 1);
    assert.equal(derived(p).armor, 0);
    assert.ok(fxNames(events(sim)).includes('equip'));
    sim.command('a', { t: 'unequip', slot: 'body' });
    assert.equal(events(sim).length, 0, 'an empty slot is nothing');
    // nine of a piece of gear is the most a pocket holds
    sim.give(p, 'helm_iron', 8);
    sim.command('a', { t: 'equip', item: 'helm_iron' });
    sim.give(p, 'helm_iron', 1);
    assert.equal(countOf(p, 'helm_iron'), itemCap(p, 'helm_iron'));
    sim.command('a', { t: 'unequip', slot: 'head' });
    assert.ok(floats(events(sim)).includes('Your pockets are full'));
    assert.equal(p.equip.head, 'helm_iron', 'still worn');
    // a pack
    assert.equal(itemCap(p, 'wood'), TUNING.baseCarry);
    sim.give(p, 'bag_satchel', 1);
    sim.command('a', { t: 'equip', item: 'bag_satchel' });
    assert.equal(itemCap(p, 'wood'), TUNING.baseCarry + 40);
});

test('building needs range, free ground, nobody in the way, the materials and the unlock; it pays XP and counts', () => {
    const { sim, p, o, tx, ty } = yard('ECO-build');
    sim.give(p, 'wood', 100);
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 10, ty, rot: 0 });
    assert.equal(sim.buildings('chest').length, 0, 'too far');
    assert.equal(events(sim).length, 0, 'and quietly so');
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 2, ty, rot: 0 });
    const ev = events(sim);
    const chest = sim.buildings('chest')[0];
    assert.ok(chest && chest.tx === tx + 2 && chest.ty === ty && chest.by === 'a');
    assert.deepEqual(chest.inv, {}, 'a chest gets its storage');
    assert.equal(countOf(p, 'wood'), 92);
    assert.equal(p.stats.built, 1);
    assert.equal(p.xp, 4 + 2);
    assert.ok(fxNames(ev).includes('build'));
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 2, ty, rot: 0 });
    assert.ok(floats(events(sim)).includes("Can't build there"));
    assert.equal(countOf(p, 'wood'), 92);
    sim.command('a', { t: 'build', kind: 'anvil', tx: tx + 3, ty, rot: 0 });
    assert.ok(floats(events(sim)).includes('Locked — learn it in the skill tree'));
    sim.command('a', { t: 'build', kind: 'campfire', tx: tx + 3, ty, rot: 0 });
    assert.ok(floats(events(sim)).includes('Not enough materials'), 'no stone for a campfire');
    const q = sim.join('b', 'B')!;
    q.x = (tx + 3.5) * TILE; q.y = (ty + 1) * TILE - 2;
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 3, ty, rot: 0 });
    assert.ok(floats(events(sim)).includes("Someone's standing there"));
    sim.command('a', { t: 'build', kind: 'lostpack', tx: tx + 4, ty, rot: 0 });
    assert.equal(sim.buildings('lostpack').length, 0, 'what the world makes is never built');
    // Master Builder cuts the materials (never below one)
    p.skills.i_build = 4;
    sim.command('a', { t: 'build', kind: 'chest', tx: tx + 2, ty: ty + 2, rot: 0 });
    assert.equal(countOf(p, 'wood'), 92 - Math.round(8 * 0.76));
    // a bed gets its crop slot, a furnace its buffers
    sim.command('a', { t: 'build', kind: 'bed', tx: tx - 2, ty, rot: 0 });
    assert.equal(sim.buildings('bed')[0].crop, -1);
    sim.give(p, 'stone', 12);
    sim.command('a', { t: 'build', kind: 'furnace', tx: tx - 3, ty, rot: 0 });
    const f = sim.buildings('furnace')[0];
    assert.ok(f && f.inv && f.out && f.fuel === 0 && f.prog === 0);
    assert.equal(countOf(p, 'stone'), 12 - Math.round(12 * 0.76), 'Master Builder cut the stone too');
    void o;
});

test('taking a building down gives back what was in it and six tenths of its materials', () => {
    const { sim, p, tx, ty } = yard('ECO-demolish');
    const chest = put(sim, 'chest', tx + 2, ty, { inv: { stone: 5, coal: 2 } });
    sim.command('a', { t: 'demolish', id: chest.id });
    assert.equal(sim.s.ents[chest.id], undefined);
    assert.equal(countOf(p, 'wood'), Math.floor(8 * 0.6));
    assert.equal(countOf(p, 'stone'), 5);
    assert.equal(countOf(p, 'coal'), 2);
    assert.ok(fxNames(events(sim)).includes('collect'));
    const f = put(sim, 'furnace', tx + 2, ty, { inv: { iron: 3 }, out: { ironbar: 2 }, fin: { coal: 4 }, fuel: 0, prog: 0 });
    sim.command('a', { t: 'demolish', id: f.id });
    assert.equal(countOf(p, 'iron'), 3);
    assert.equal(countOf(p, 'ironbar'), 2);
    assert.equal(countOf(p, 'coal'), 6, 'the fuel too');
    assert.equal(countOf(p, 'stone'), 5 + Math.floor(12 * 0.6));
    const belt = put(sim, 'belt', tx + 2, ty, { belt: ['wood', null, 'sand'] });
    sim.command('a', { t: 'demolish', id: belt.id });
    assert.equal(countOf(p, 'sand'), 1, 'what rode the belt');
    assert.equal(countOf(p, 'ironbar'), 2, 'six tenths of one bar is nothing');
    // out of reach: it stays
    const far = put(sim, 'chest', tx + 9, ty, { inv: {} });
    sim.command('a', { t: 'demolish', id: far.id });
    assert.ok(sim.s.ents[far.id]);
    // a ladder goes with its shaft, but a lost backpack can be emptied by taking it down
    const ladder = put(sim, 'mineladder', tx + 2, ty);
    sim.command('a', { t: 'demolish', id: ladder.id });
    assert.ok(sim.s.ents[ladder.id], 'the ladder stays');
    sim.remove(ladder.id);
    const pack = put(sim, 'lostpack', tx + 2, ty, { inv: { wood: 2 } });
    sim.command('a', { t: 'demolish', id: pack.id });
    assert.equal(sim.s.ents[pack.id], undefined);
    assert.equal(countOf(p, 'wood'), Math.floor(8 * 0.6) + 1 + 2, 'the chest’s share, the log off the belt, and the backpack’s two');
});

test('moving things into and out of a building respects its capacity, its filter, what it burns or takes, and your pockets', () => {
    const { sim, p, o } = yard('ECO-xfer');
    const chest = put(sim, 'chest', o.tx + 6, o.ty + 4, { inv: {}, by: undefined });
    sim.give(p, 'wood', 500);
    sim.command('a', { t: 'xfer', id: chest.id, item: 'wood', n: 500, dir: 'put' });
    assert.equal(chest.inv!.wood, 400, 'a chest holds four hundred');
    assert.equal(countOf(p, 'wood'), 100);
    assert.equal(chest.by, 'a');
    assert.ok(fxNames(events(sim)).includes('load'));
    sim.command('a', { t: 'xfer', id: chest.id, item: 'wood', n: 1, dir: 'put' });
    assert.ok(floats(events(sim)).includes('The chest is full'));
    sim.command('a', { t: 'xfer', id: chest.id, item: 'wood', n: 50, dir: 'take' });
    assert.equal(chest.inv!.wood, 350);
    assert.equal(countOf(p, 'wood'), 150);
    // a chest set to take only ore
    chest.fl = ['#ore'];
    sim.command('a', { t: 'xfer', id: chest.id, item: 'wood', n: 1, dir: 'put' });
    assert.ok(floats(events(sim)).includes('This chest only takes ores'));
    sim.give(p, 'iron', 2);
    sim.command('a', { t: 'xfer', id: chest.id, item: 'iron', n: 2, dir: 'put' });
    assert.equal(chest.inv!.iron, 2);
    // pockets full of wood: nothing more comes out
    sim.give(p, 'wood', TUNING.baseCarry - 150);
    sim.command('a', { t: 'xfer', id: chest.id, item: 'wood', n: 1, dir: 'take' });
    assert.ok(floats(events(sim)).includes('Your pockets are full'));
    assert.equal(chest.inv!.wood, 350);
    // a furnace: ingredients in one slot, fuel in another
    const f = put(sim, 'furnace', o.tx + 8, o.ty + 4, { inv: {}, out: {}, fin: {}, fuel: 0, prog: 0 });
    sim.command('a', { t: 'xfer', id: f.id, item: 'wood', n: 1, dir: 'put' });
    assert.ok(floats(events(sim)).includes("That doesn't go in here"));
    sim.give(p, 'stone', 1);
    sim.command('a', { t: 'xfer', id: f.id, item: 'stone', n: 1, dir: 'put', part: 'fuel' });
    assert.ok(floats(events(sim)).includes("That won't burn"));
    sim.give(p, 'coal', 3);
    sim.command('a', { t: 'xfer', id: f.id, item: 'coal', n: 3, dir: 'put', part: 'fuel' });
    assert.deepEqual({ ...f.fin }, { coal: 3 });
    sim.give(p, 'iron', 2);
    sim.command('a', { t: 'xfer', id: f.id, item: 'iron', n: 2, dir: 'put' });
    assert.deepEqual({ ...f.inv }, { iron: 2 });
    assert.equal(fxNames(events(sim)).filter((x) => x === 'load').length, 2, 'the coal and the ore each made a sound');
    sim.command('a', { t: 'xfer', id: f.id, item: 'iron', n: 1, dir: 'put', part: 'out' });
    sim.command('a', { t: 'xfer', id: f.id, item: 'iron', n: 0, dir: 'take' });
    sim.command('a', { t: 'xfer', id: f.id, item: 'iron', n: NaN, dir: 'take' });
    assert.equal(events(sim).length, 0, 'nothing goes into the tray, and no count is no move');
    f.out = { ironbar: 3 };
    sim.command('a', { t: 'xfer', id: f.id, item: 'ironbar', n: 3, dir: 'take' });
    assert.equal(countOf(p, 'ironbar'), 3);
    assert.deepEqual(f.out, {});
    assert.ok(fxNames(events(sim)).includes('collect'));
});

test('eating fills energy by the food’s power, heals, gives the dish’s buff, picks sensibly, and refuses what would be wasted', () => {
    const { sim, p } = yard('ECO-eat');
    sim.give(p, 'berry', 1);
    p.energy = TUNING.maxEnergy;
    sim.command('a', { t: 'eat', item: 'berry' });
    assert.ok(floats(events(sim)).includes('Not hungry'));
    assert.equal(countOf(p, 'berry'), 1);
    p.energy = 50;
    sim.command('a', { t: 'eat', item: 'berry' });
    const ev = events(sim);
    assert.equal(p.energy, 50 + ITEMS.berry.food!);
    assert.equal(countOf(p, 'berry'), 0);
    assert.ok(fxNames(ev).includes('eat') && floats(ev).includes('+6 energy'));
    assert.equal(p.cnt?.eat, 1);
    sim.command('a', { t: 'eat' });
    assert.ok(floats(events(sim)).includes('No food — try berries'));
    // a meal fills only what is missing, and leaves its buff
    sim.give(p, 'bread', 1);
    p.energy = 90;
    sim.command('a', { t: 'eat', item: 'bread' });
    assert.equal(p.energy, TUNING.maxEnergy);
    assert.deepEqual(p.buffs.map((b) => [b.id, b.t]), [['sated', ITEMS.bread.buff!.secs]]);
    // a potion heals, but not a healthy farmer
    sim.give(p, 'potion_heal', 1);
    p.hearts = derived(p).maxHearts;
    sim.command('a', { t: 'eat', item: 'potion_heal' });
    assert.ok(floats(events(sim)).includes('Already healthy'));
    p.hearts = 1;
    sim.command('a', { t: 'eat', item: 'potion_heal' });
    assert.equal(p.hearts, 3);
    assert.ok(fxNames(events(sim)).includes('drink'));
    // with nothing named, the biggest food that fits is eaten (the bread's buff has widened the stomach a little)
    const full = derived(p).maxEnergy;
    assert.equal(full, TUNING.maxEnergy + 15, 'Well fed: fifteen more energy');
    sim.give(p, 'carrot', 1); sim.give(p, 'pumpkin', 1);
    p.energy = full - 15;
    sim.command('a', { t: 'eat' });
    assert.equal(countOf(p, 'carrot'), 0, 'the carrot fits');
    assert.equal(countOf(p, 'pumpkin'), 1, 'the pumpkin would be wasted');
    assert.equal(p.energy, full - 5);
    // Gourmet makes food go further
    p.skills.f_gourmet = 4;
    p.energy = 0;
    sim.command('a', { t: 'eat', item: 'pumpkin' });
    assert.ok(Math.abs(p.energy - ITEMS.pumpkin.food! * 1.48) < 1e-9);
});

test('learning a skill needs the points and a learned neighbour, stops at the top rank, and unlocks what it says', () => {
    const { sim, p } = yard('ECO-skill');
    sim.command('a', { t: 'skill', id: 'g_wood' });
    assert.ok(floats(events(sim)).includes('Learn a connected skill first'));
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.ok(floats(events(sim)).includes('Needs 1 skill point'));
    p.points = 3;
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.equal(p.skills.g_hands, 1);
    assert.equal(p.points, 2);
    assert.ok(fxNames(events(sim)).includes('skill'));
    assert.ok(Math.abs(derived(p).swingCd - TUNING.swingCooldown / 1.06) < 1e-9, 'the rank shows in the stats');
    sim.command('a', { t: 'skill', id: 'g_wood' });
    assert.equal(p.skills.g_wood, 1);
    sim.command('a', { t: 'skill', id: 'nope' });
    assert.ok(floats(events(sim)).includes('Unknown skill'));
    p.points = 10;
    sim.command('a', { t: 'skill', id: 'g_hands' });
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.equal(p.skills.g_hands, 3);
    sim.command('a', { t: 'skill', id: 'g_hands' });
    assert.ok(floats(events(sim)).includes('Maxed out'));
    assert.equal(p.points, 8);
    assert.equal(hasUnlock(p, 'smithing'), false);
    sim.command('a', { t: 'skill', id: 'i_smith' });
    const ev = events(sim);
    assert.ok(hasUnlock(p, 'smithing'));
    assert.ok(fxNames(ev).includes('unlock') && toasts(ev).includes(UNLOCK_INFO.smithing));
    assert.equal(p.cnt?.skill, 5, 'five skills learned, counted for the tutorial');
});

test('a refused command says so and changes nothing in the world', () => {
    const { sim, p, o, tx, ty } = yard('ECO-deny');
    put(sim, 'chest', o.tx + 6, o.ty + 4, { inv: { stone: 1 }, fl: ['#ore'] });
    const chest = sim.buildings('chest')[0];
    const home = sim.homePlot(p.slot);
    const next = sim.world.plot(home.gx + 1, home.gy)!;
    sim.give(p, 'wood', 1);
    const cases: [Cmd, boolean][] = [
        [{ t: 'craft', recipe: 'workbench:plank', n: 1 }, true],
        [{ t: 'buy', plot: next.i }, true],
        [{ t: 'sell', item: 'wood', n: 1 }, true],
        [{ t: 'build', kind: 'chest', tx: tx + 20, ty, rot: 0 }, false],
        [{ t: 'build', kind: 'anvil', tx: tx + 2, ty, rot: 0 }, true],
        [{ t: 'equip', item: 'sword_iron' }, false],
        [{ t: 'unequip', slot: 'head' }, false],
        [{ t: 'xfer', id: chest.id, item: 'wood', n: 1, dir: 'put' }, true],
        [{ t: 'travel', to: chest.id }, true],
        [{ t: 'shop', i: 0, n: 1 }, true],
        [{ t: 'skill', id: 'g_wood' }, true],
        [{ t: 'eat', item: 'berry' }, false],
        [{ t: 'demolish', id: 999999 }, false],
    ];
    for (const [c, says] of cases) {
        const before = JSON.stringify(sim.s);
        sim.command('a', c);
        assert.equal(JSON.stringify(sim.s), before, `${c.t} changed nothing`);
        assert.equal(denied(events(sim)), says, `${c.t} ${says ? 'says why' : 'is silent'}`);
    }
});
