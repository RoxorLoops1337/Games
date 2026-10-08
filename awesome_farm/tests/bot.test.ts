// The story, played by a scripted player using real commands only. It proves the early and middle
// chapters can be finished, and how long that takes in game time. If a chapter ever becomes impossible
// (a missing recipe, a coin drought…) this fails. The late chapters are in bot.late.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import type { ItemId } from '../src/shared/data/items';
import { wind } from '../src/shared/sim/power';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, MobE } from '../src/shared/sim/types';
import { Bot, CROPS_WAIT } from './botlib';
test('an unassisted player can play from the first tree to the Great Work (chapters 1–10) with real commands only', () => {
    const b = new Bot('BOT-1');
    const log: string[] = [];
    const mark = (name: string) => log.push(`${name}: ${Math.round(b.took / 60 * 10) / 10} min  (day ${b.sim.s.day}, level ${b.p.level}, ${b.p.coins} coins)`);

    // 1 — Fresh Soil
    b.harvest('tree', 8);
    b.gather('wood', 14, ['tree']);
    assert.ok(b.build('workbench'), 'a workbench');
    b.gather('wood', 18, ['tree']);
    b.craft('workbench:plank', 4);
    assert.ok(b.build('chest'), 'a chest');
    for (let i = 0; i < 60 && b.p.level < 3; i++) b.harvest('tree', 1);
    b.claim(); mark('1 Fresh Soil');

    // 2 — A Place to Rest
    b.gather('wood', 10, ['tree']);
    b.gather('stone', 4, ['rock']);
    assert.ok(b.build('campfire'), 'a campfire');
    assert.ok(b.build('bed'), 'a garden bed');
    for (let i = 0; countOf(b.p, 'seed_wheat') + countOf(b.p, 'seed_carrot') < 3 && i < 40; i++) b.harvest('flower', 1);
    const bed = b.sim.buildings('bed')[0];
    for (let n = 0; n < 3; n++) {
        const seed = (['seed_wheat', 'seed_carrot'] as const).find((s) => countOf(b.p, s) > 0)!;
        b.goto((bed.tx + 0.5) * TILE, (bed.ty + 2) * TILE);
        b.sim.command('bot', { t: 'use', id: bed.id, seed });
        b.run(CROPS_WAIT);
        b.sim.command('bot', { t: 'use', id: bed.id });
        b.run(1);
    }
    // coins: sell what we have at a market, then buy the first plot
    b.gather('wood', 14, ['tree']);
    b.gather('stone', 6, ['rock']);
    assert.ok(b.build('market'), 'a market');
    const sellable: ItemId[] = ['wood', 'berry', 'wheat', 'carrot', 'stone', 'fiber'];
    let coinsNeeded = 0;
    for (let guard = 0; guard < 30 && b.p.coins < 12; guard++) {
        const mk = b.sim.buildings('market')[0];
        b.goto((mk.tx + 1) * TILE, (mk.ty + 2) * TILE);
        for (const it of sellable) if (countOf(b.p, it) > 8) b.sim.command('bot', { t: 'sell', item: it, n: countOf(b.p, it) - 4 });
        if (b.p.coins < 12) { b.harvest('tree', 3); b.harvest('bush', 2); coinsNeeded++; }
    }
    assert.ok(b.p.coins >= 8, `earned the first plot's price (${b.p.coins})`);
    const next = b.sim.world.ownedPlots().flatMap((pl) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => b.sim.world.plot(pl.gx + dx, pl.gy + dy))).find((pl) => pl && b.sim.world.isPurchasable(pl))!;
    b.sim.command('bot', { t: 'buy', plot: next.i });
    assert.ok(next.owned, 'bought land');
    b.sleepThroughNight();
    assert.ok((b.p.cnt?.night ?? 0) >= 1, 'survived a night');
    b.claim(); mark('2 A Place to Rest');
    assert.ok(coinsNeeded < 30, 'the economy gets going');

    // 3 — Hot Metal
    b.gather('stone', 14, ['rock']);
    assert.ok(b.build('furnace'), 'a furnace');
    const furnace = b.sim.buildings('furnace')[0];
    // iron comes from quarry land: buy plots until one has iron nodes (or use what we have)
    for (let guard = 0; guard < 8 && !b.nodes('iron').length; guard++) {
        const plots = b.sim.world.ownedPlots();
        const cand = plots.flatMap((pl) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => b.sim.world.plot(pl.gx + dx, pl.gy + dy))).find((pl) => pl && b.sim.world.isPurchasable(pl) && pl.biome === 'quarry')
            ?? plots.flatMap((pl) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => b.sim.world.plot(pl.gx + dx, pl.gy + dy))).find((pl) => pl && b.sim.world.isPurchasable(pl))!;
        for (let i = 0; i < 40 && b.p.coins < b.sim.world.price(cand, b.p.plotsBought); i++) { b.harvest('tree', 2); b.harvest('rock', 1); const mk = b.sim.buildings('market')[0]; b.goto((mk.tx + 1) * TILE, (mk.ty + 2) * TILE); for (const it of sellable) if (countOf(b.p, it) > 6) b.sim.command('bot', { t: 'sell', item: it, n: countOf(b.p, it) - 4 }); }
        b.sim.command('bot', { t: 'buy', plot: cand.i });
    }
    assert.ok(b.nodes('iron').length > 0, 'found iron');
    b.gather('iron', 12, ['iron']);
    b.gather('coal', 6, ['coal', 'rock', 'tree']);
    b.goto((furnace.tx + 0.5) * TILE, (furnace.ty + 2) * TILE);
    b.sim.command('bot', { t: 'xfer', id: furnace.id, item: 'iron', n: 12, dir: 'put', part: 'inv' });
    b.sim.command('bot', { t: 'xfer', id: furnace.id, item: countOf(b.p, 'coal') >= 3 ? 'coal' : 'wood', n: 3, dir: 'put', part: 'fuel' });
    for (let w = 0; w < 60 && ((b.sim.s.ents[furnace.id] as BuildE).out?.ironbar ?? 0) < 12; w++) b.run(1);
    b.sim.command('bot', { t: 'collect', id: furnace.id });
    assert.ok(countOf(b.p, 'ironbar') >= 6, `smelted iron (${countOf(b.p, 'ironbar')})`);
    for (let i = 0; i < 80 && b.p.level < 6; i++) b.harvest('tree', 1);
    // an anvil and an iron pick, like any player would
    assert.ok(b.learnPath('i_smith'), 'learned Blacksmithing');
    b.gather('wood', 10, ['tree']);
    assert.ok(b.build('anvil'), 'an anvil');
    b.gather('plank', 2, ['tree']);
    b.craft('workbench:plank', 4);
    b.craft('anvil:pick_iron', 1);
    assert.equal(b.p.equip.tool, 'pick_iron', 'the iron pick is in hand');
    // skills: spend points
    b.learn('f_thumb', 'f_seed');
    assert.ok(Object.values(b.p.skills).filter((r) => r > 0).length >= 3, 'learned skills');
    b.harvest('rock', 8);
    b.claim(); mark('3 Hot Metal');

    // 4 — Reaching Out
    b.buyPlots(6);
    assert.ok(b.p.plotsBought + 1 >= 6, 'six plots');
    const coin0 = b.p.cnt?.sell ?? 0;
    for (let guard = 0; (b.p.cnt?.sell ?? 0) - coin0 < 150 && guard < 12; guard++) {
        b.smelt('iron', 'ironbar', 10);
        const mk = b.sim.buildings('market')[0];
        b.goto((mk.tx + 1) * TILE, (mk.ty + 2) * TILE);
        b.sim.command('bot', { t: 'sell', item: 'ironbar', n: countOf(b.p, 'ironbar') });
    }
    b.claim(); mark('4 Reaching Out');
    // 5 — Night Watch
    b.getResource('mail_iron', 1);
    assert.ok(b.p.equip.body, 'body armor on');
    b.getResource('sword_iron', 1);
    b.getResource('glass', 2);
    b.getResource('plank', 4);
    b.build('lantern'); b.build('lantern');
    for (let nights = 0; nights < 12 && ((b.p.cnt?.night ?? 0) < 3 || (b.p.cnt?.kill ?? 0) < 12 || b.p.level < 10); nights++) {
        b.fightNight();
        for (let i = 0; i < 40 && b.p.level < 10 && (b.p.cnt?.night ?? 0) >= 3; i++) b.harvest('tree', 1);
    }
    b.claim(); mark('5 Night Watch');

    // 6 — Wild Hearts
    assert.ok(b.learnPath('t_pod'), 'learned Pod Crafter');
    b.getResource('slimegel', 3);
    b.getResource('pod', 6);
    b.tameOne();
    b.ensure('den');
    const den = b.sim.buildings('den')[0];
    b.goto((den.tx + 1) * TILE, (den.ty + 3) * TILE);
    b.sim.command('bot', { t: 'pet', op: 'assign', pet: b.p.pets![0].id, den: den.id });
    b.claim();
    // (a worker with the knack for hauling would carry the furnace's bars off into the den, which this bot does not want to chase)
    b.sim.command('bot', { t: 'pet', op: 'unassign', pet: b.p.pets![0].id });
    mark('6 Wild Hearts');
    // 7 — Gears and Grids
    b.levelTo(15);
    assert.ok(b.learnPath('i_belts') && b.learnPath('i_drills') && b.learnPath('i_power'), 'learned the factory skills');
    b.ensure('drill');
    const spot = b.veinSpot('iron') ?? b.veinSpot('stone') ?? b.veinSpot('coal');
    assert.ok(spot, 'ore under free ground');
    b.goto((spot!.tx + 1) * TILE, (spot!.ty + 3) * TILE);
    b.sim.command('bot', { t: 'build', kind: 'drill', tx: spot!.tx, ty: spot!.ty, rot: 0 });
    assert.ok(b.sim.buildings('drill').length >= 1, 'a drill on the vein');
    b.getResource('ironbar', 14);
    b.goto((spot!.tx + 1) * TILE, (spot!.ty + 3) * TILE);
    for (let dy = 2; dy < 8 && b.sim.buildings('belt').length < 10; dy++) {
        for (let dx = 2; dx < 12 && b.sim.buildings('belt').length < 10; dx++) {
            if (b.sim.world.isFree(spot!.tx + dx, spot!.ty + dy) && b.sim.world.floorAt(spot!.tx + dx, spot!.ty + dy) === 0) b.sim.command('bot', { t: 'build', kind: 'belt', tx: spot!.tx + dx, ty: spot!.ty + dy, rot: 0 });
        }
    }
    b.ensure('inserter'); b.ensure('pole'); b.ensure('windturbine');
    for (const kind of ['belt', 'inserter', 'pole', 'windturbine'] as const) assert.ok(b.sim.buildings(kind).length > 0, `a ${kind}`);
    b.claim(); mark('7 Gears and Grids');
    void wind;

    // 8 — The First Challenge
    b.ensure('altar');
    b.getResource('sigil_slime', 1);
    const altar = b.sim.buildings('altar')[0];
    b.goto((altar.tx + 1) * TILE, (altar.ty + 3) * TILE);
    b.sim.command('bot', { t: 'summon', id: altar.id, boss: 'slime' });
    for (let i = 0; i < 700; i++) {
        const boss = Object.values(b.sim.s.ents).find((e): e is MobE => e.k === 'mob' && e.kind === 'slimeking');
        if (!boss) break;
        b.goto(boss.x - 12, boss.y);
        b.p.swingCd = 0; b.sim.command('bot', { t: 'swing', id: boss.id });
        b.run(0.35);
    }
    assert.ok((b.p.boss?.slime ?? 0) >= 1, 'the Slime King is down');
    b.claim(); mark('8 The First Challenge');
    // 9 — Deeper
    b.levelTo(18);
    assert.ok(b.learnPath('i_smith2'), 'learned Steelwork');
    b.cook('steel', 4);
    for (let nights = 0; nights < 10 && (b.p.cnt?.kill ?? 0) < 60; nights++) b.fightNight();
    for (let i = 0; i < 6 && (b.p.pets ?? []).length < 5; i++) { b.getResource('pod', 4); b.tameOne(); }
    assert.ok(b.buyPlots(20), 'twenty plots');
    b.claim(); mark('9 Deeper');

    // 10 — The Great Work
    assert.ok(b.learnPath('i_eng') && b.learnPath('i_asm'), 'learned Engineering and Assembly');
    const asm = b.ensure('assembler');
    b.stock('pole');
    const pole = b.buildNear('pole', asm, 2);
    assert.ok(pole, 'a pole by the assembler');
    b.stock('windturbine');
    assert.ok(b.buildNear('windturbine', pole!, 2), 'a wind turbine by the pole');
    b.assemble('circuit', 20);
    b.ensure('mill');                        // (before the workers move in: one with the knack for hauling would carry the furnace's bars off)
    const den2 = b.sim.buildings('den')[0];
    b.goto((den2.tx + 1) * TILE, (den2.ty + 3) * TILE);
    for (const pet of b.p.pets!.filter((x) => !x.den).slice(0, 3)) b.sim.command('bot', { t: 'pet', op: 'assign', pet: pet.id, den: den2.id });
    b.claim(); mark('10 The Great Work');

    console.log('\n  ' + log.join('\n  '));
    assert.ok(b.sim.s.time < 6 * 60 * 60, 'the first ten chapters in under six hours of game time');
});

