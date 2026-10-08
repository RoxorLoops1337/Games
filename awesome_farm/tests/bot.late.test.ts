// The back half of the story (chapters 11–13: the other guardians, the rifts, the Old Heart),
// played by the same scripted player with real commands. Pure grind is skipped with the developer
// menu's devdo ops (item, coins, xp), since bot.test.ts already shows the grind to be possible and
// scripts/balance-hunt.ts measures how long it takes; everything that *does* something is real:
// buying land to the world's edge, crafting sigils, summoning and fighting every boss, taming a
// Rare creature, launching expeditions, building on the centre plot, waking the Old Heart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import type { ItemId } from '../src/shared/data/items';
import { MOBS } from '../src/shared/data/mobs';
import { CHAPTERS } from '../src/shared/data/quests';
import { RECIPES } from '../src/shared/data/recipes';
import { qsOf } from '../src/shared/sim/quests';
import { countOf, derived } from '../src/shared/sim/stats';
import type { Plot } from '../src/shared/sim/types';
import { Bot } from './botlib';

test('the late story can be finished: four corners, the rifts, and the Old Heart', () => {
    const b = new Bot('BOT-LATE');
    const sim = b.sim, p = b.p;
    sim.cheats = true;
    const give = (res: ItemId | 'coin', n: number) => sim.command('bot', res === 'coin' ? { t: 'devdo', op: 'coins', n } : { t: 'devdo', op: 'item', id: res, n });
    const log: string[] = [];
    const mark = (name: string) => log.push(`${name}: ${Math.round(b.sim.s.time / 60)} min  (day ${sim.s.day}, level ${p.level}, ${p.coins} coins, ${Object.keys(p.boss ?? {}).length} bosses)`);
    const raise = (level: number) => { for (let i = 0; i < 400 && p.level < level; i++) sim.command('bot', { t: 'devdo', op: 'xp', n: 150 }); };
    /** The ingredients of a recipe, enough for `times` crafts. */
    const stockFor = (recipe: string, times = 1) => { for (const [res, n] of Object.entries(RECIPES[recipe].in) as [ItemId, number][]) give(res, n * times); };
    const claim = () => { b.claim(); };

    // The kit a player would bring to each fight (the same ones scripts/balance-bosses.ts uses).
    interface Kit { level: number; gear: ItemId[]; skills: Record<string, number> }
    const KITS: Record<string, Kit> = {
        slime: { level: 12, gear: ['sword_iron', 'mail_iron'], skills: { c_vit: 4, c_skin: 2 } },
        stone: { level: 14, gear: ['sword_steel', 'helm_steel', 'plate_steel'], skills: { c_vit: 6, c_skin: 3, c_edge: 2 } },
        bog: { level: 18, gear: ['sword_steel', 'helm_steel', 'plate_steel'], skills: { c_vit: 6, c_skin: 4, c_edge: 3 } },
        dune: { level: 22, gear: ['sword_crystal', 'helm_crystal', 'plate_crystal'], skills: { c_vit: 6, c_skin: 4, c_guard: 2, c_edge: 3 } },
        frost: { level: 26, gear: ['sword_crystal', 'helm_crystal', 'plate_crystal', 'charm_vital'], skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 4 } },
        heart: { level: 36, gear: ['sword_pharaoh', 'helm_frost', 'plate_colossus', 'charm_heart'], skills: { c_vit: 6, c_skin: 4, c_guard: 3, c_edge: 4 } },
    };
    const outfit = (boss: string) => {
        const k = KITS[boss];
        raise(k.level);
        p.skills = { ...p.skills, ...k.skills };
        for (const it of k.gear) { give(it, 1); sim.command('bot', { t: 'equip', item: it }); }
        give('potion_heal', 40);                 // (a bot that never dodges lives on potions: the fights are not meant to be this one-sided for a player)
        p.hearts = derived(p).maxHearts;
    };

    // Where bot.test.ts leaves off: the first ten chapters of the story are behind us.
    raise(20);
    qsOf(p).ch = 10;
    b.rebase();
    give('coin', 400000);
    assert.equal(CHAPTERS[qsOf(p).ch].id, 'corners');

    // 11 — Four Corners
    // one plot of each biome, so the quarry, bog, desert and snow monsters come to us
    for (const biome of ['quarry', 'bog', 'goldsand', 'snowcap'] as const) b.reachBiome(biome);
    for (const sigil of ['sigil_slime', 'sigil_stone', 'sigil_bog', 'sigil_dune', 'sigil_frost'] as const) stockFor('altar:' + sigil);
    for (const [res, n] of [['stone', 120], ['brick', 40], ['ironbar', 40], ['plank', 80], ['wood', 80]] as [ItemId, number][]) give(res, n);
    b.ensure('altar');
    for (const boss of ['slime', 'stone', 'bog', 'dune', 'frost']) {
        outfit(boss);
        b.fightBoss(boss);
        mark('   defeated ' + boss);
    }
    raise(30);
    give('pod', 30); give('pod_ultra', 20);
    b.tameRare('bog');
    claim(); mark('11 Four Corners');

    // 12 — Into the Rift
    for (const [res, n] of [['plank', 30], ['rope', 12], ['ironbar', 10], ['goldbar', 4]] as [ItemId, number][]) give(res, n);
    b.ensure('dock');
    for (let runs = 0; runs < 8 && ((p.cnt?.['riftwin:0'] ?? 0) < 1 || (p.cnt?.riftwave ?? 0) < 15); runs++) {
        const tier = (p.cnt?.['riftwin:0'] ?? 0) < 1 ? 0 : 1;
        const won = b.riftRun(tier);
        if (process.env.BOT_DEBUG) console.log('rift run', runs, 'tier', tier, won ? 'cleared' : 'lost', 'waves', p.cnt?.riftwave ?? 0, 'hearts', p.hearts);
    }
    claim(); mark('12 Into the Rift');

    // 13 — The Old Heart: buy the way to the centre, raise an altar there, and wake it
    const heart = sim.world.plots.find((pl: Plot) => pl.heart)!;
    assert.ok(heart, 'the world has a centre plot');
    b.reachPlot(heart);
    assert.ok(heart.owned, 'the centre plot is ours');
    for (const [res, n] of [['stone', 60], ['brick', 20], ['ironbar', 10]] as [ItemId, number][]) give(res, n);
    const c = sim.world.plotCenter(heart);
    b.goto(c.x, c.y);
    const heartAltar = b.build('altar');
    assert.ok(heartAltar && sim.world.plotAt(heartAltar.tx, heartAltar.ty)?.heart, 'an altar on the centre plot');
    outfit('heart');
    // (this fight is knife-edge for a bot that never dodges: anything that shifts the simulation's random draws can
    // flip it, since the Old Heart hits for 7+ hearts. If it fails after an unrelated change, re-check the fight
    // with BOT_DEBUG=1 before touching the boss.)
    b.fightBoss('heart', heartAltar!);
    claim(); mark('13 The Old Heart');

    console.log('\n  ' + log.join('\n  '));
    assert.equal(qsOf(p).ch, CHAPTERS.findIndex((c) => c.id === 'heart') + 1, 'the first thirteen chapters are told (the Fortune story comes after the Old Heart)');
    void MOBS; void TILE; void countOf;
});
