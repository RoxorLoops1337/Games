// The stat ledger (sim/stats.ts): how skills, gear, buffs, boons and the season wish add up, XP and levels, pockets, learning, costs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/shared/config';
import { ITEMS } from '../src/shared/data/items';
import { BOON_BY_ID } from '../src/shared/data/rift';
import { SKILLS } from '../src/shared/data/skills';
import { BUFFS } from '../src/shared/data/stats';
import { WISH_BY_ID } from '../src/shared/data/wishes';
import {
    addItem, addRes, canAfford, canLearn, countOf, derived, grantXp, hasUnlock, have, itemCap, learnSkill, MAX_LEVEL, modsOf, newPlayer, pay, rankOf,
    scaledCost, sellValue, stat, takeItem, unlocks, xpToNext,
} from '../src/shared/sim/stats';

const farmer = () => newPlayer('a', 'A', 0, 0, 0);

test('a new farmer starts with the tuning’s hearts and energy, a flint pick and a club, and nothing else on the ledger', () => {
    const p = farmer();
    const d = derived(p);
    assert.equal(p.hearts, TUNING.startHearts);
    assert.equal(p.energy, TUNING.maxEnergy);
    assert.deepEqual(p.inv, {});
    assert.equal(p.level, 1); assert.equal(p.points, 0); assert.equal(p.coins, 0);
    assert.equal(d.maxHearts, TUNING.startHearts);
    assert.equal(d.maxEnergy, TUNING.maxEnergy);
    assert.equal(d.armor, 0);
    assert.equal(d.toolPower, ITEMS.pick_flint.gear!.power);
    assert.equal(d.toolTier, 0);
    assert.deepEqual(d.weapon, { dmg: ITEMS.club.gear!.dmg, wtype: 'club', cd: 1, reach: ITEMS.club.gear!.reach });
    assert.equal(d.speed, TUNING.moveSpeed);
    assert.equal(d.reach, TUNING.reach);
    assert.equal(d.swingCd, TUNING.swingCooldown);
    assert.deepEqual(modsOf(p), {});
    for (const k of ['xpMul', 'sellMul', 'landMul', 'buildMul', 'growMul', 'respawnMul', 'foodMul', 'healMul', 'buffMul'] as const) assert.equal(d[k], 1, k);
    for (const k of ['luck', 'crit', 'dodge', 'energyRegen', 'nightShorten'] as const) assert.equal(d[k], 0, k);
});

test('skills by rank, gear, buffs, boons and the season wish add up on one ledger', () => {
    const p = farmer();
    p.skills.c_vit = 2;                                            // half a heart a rank
    assert.equal(derived(p).maxHearts, TUNING.startHearts + 1);
    p.equip.head = 'helm_steel';                                   // armor 0.75, half a heart
    assert.equal(derived(p).maxHearts, TUNING.startHearts + 1.5);
    assert.equal(derived(p).armor, 0.75);
    p.buffs.push({ id: 'ironhide', t: 10 });                       // armor 0.5
    assert.equal(derived(p).armor, 0.75 + BUFFS.ironhide.mods.armor!);
    assert.equal(stat(p, 'armor'), derived(p).armor);
    const boon = Object.values(BOON_BY_ID).find((b) => b.mods?.dmg)!;
    assert.ok(boon, 'a boon that adds plain damage');
    const dmg0 = derived(p).weapon.dmg;
    p.boons = [boon.id];
    assert.equal(derived(p).weapon.dmg, dmg0 + boon.mods!.dmg!);
    const wish = Object.values(WISH_BY_ID).find((w) => w.mods.cropYield)!;
    assert.ok(wish, 'a wish for the crops');
    assert.equal(derived(p).mods.cropYield ?? 0, 0);
    p.wish = wish.id;
    assert.equal(derived(p).mods.cropYield, wish.mods.cropYield);
    // percentages multiply the base; a cost stat below zero is a discount
    p.skills.c_brawn = 5;                                          // +8% damage a rank
    assert.ok(Math.abs(derived(p).weapon.dmg - (dmg0 + boon.mods!.dmg!) * 1.4) < 1e-9);
    p.skills.x_land = 5;
    assert.ok(Math.abs(derived(p).landMul - 0.75) < 1e-9);
    // an unknown skill or buff id on an old save adds nothing and throws nothing
    p.skills.gone_skill = 3;
    p.buffs.push({ id: 'gone_buff' as never, t: 5 });
    assert.doesNotThrow(() => derived(p));
    assert.equal(derived(p).armor, 0.75 + BUFFS.ironhide.mods.armor!);
});

test('the XP curve climbs, every level pays a skill point, Scholar stretches each point of XP, and eighty is the top', () => {
    assert.equal(xpToNext(1), 14);
    for (let l = 1; l < MAX_LEVEL; l++) assert.ok(xpToNext(l + 1) > xpToNext(l), `level ${l + 1} asks more than ${l}`);
    const p = farmer();
    assert.equal(grantXp(p, xpToNext(1) - 1), 0);
    assert.equal(p.level, 1);
    assert.equal(grantXp(p, 1), 1);
    assert.deepEqual([p.level, p.points, p.xp], [2, 1, 0]);
    const gained = grantXp(p, 1000);
    assert.ok(gained >= 5);
    assert.equal(p.points, p.level - 1, 'a point a level');
    assert.ok(p.xp >= 0 && p.xp < xpToNext(p.level), 'the rest carries over');
    const q = farmer();
    q.skills.x_scholar = 5;                                        // +30% XP
    grantXp(q, 10);
    assert.ok(Math.abs(q.xp - 13) < 1e-9);
    const top = farmer();
    top.level = MAX_LEVEL - 1;
    assert.equal(grantXp(top, 1e9), 1, 'one level left to gain');
    assert.deepEqual([top.level, top.xp], [MAX_LEVEL, 0]);
    assert.equal(grantXp(top, 1e9), 0, 'and no further');
    assert.equal(top.xp, 0);
});

test('pockets hold the base of each thing (nine for gear), more with packs and the Backpack skills; adding and taking say what fit', () => {
    const p = farmer();
    assert.equal(itemCap(p, 'wood'), TUNING.baseCarry);
    assert.equal(itemCap(p, 'sword_iron'), 9);
    p.equip.bag = 'bag_satchel';
    assert.equal(itemCap(p, 'wood'), TUNING.baseCarry + ITEMS.bag_satchel.gear!.mods!.carry!);
    p.skills.x_pack = 4;                                           // +25 a rank
    assert.equal(itemCap(p, 'wood'), TUNING.baseCarry + 40 + 100);
    assert.equal(itemCap(p, 'sword_iron'), 9, 'gear stays at nine');
    const cap = itemCap(p, 'wood');
    assert.equal(addItem(p, 'wood', cap + 5), cap);
    assert.equal(countOf(p, 'wood'), cap);
    assert.equal(addItem(p, 'wood', 1), 0);
    assert.equal(takeItem(p, 'wood', cap + 1), false);
    assert.equal(countOf(p, 'wood'), cap, 'nothing was taken');
    assert.equal(takeItem(p, 'wood', cap - 1), true);
    assert.equal(countOf(p, 'wood'), 1);
    assert.equal(takeItem(p, 'wood', 1), true);
    assert.equal(p.inv.wood, undefined, 'an empty stack is gone from the pocket');
    assert.equal(addRes(p, 'coin', 7), 7);
    assert.equal(have(p, 'coin'), 7);
    assert.equal(addRes(p, 'stone', 3), 3);
    assert.equal(have(p, 'stone'), 3);
    assert.ok(canAfford(p, { coin: 7, stone: 3 }));
    assert.ok(!canAfford(p, { stone: 4 }));
    assert.ok(!canAfford(p, { coin: 8 }));
    pay(p, { coin: 7, stone: 3 });
    assert.deepEqual([p.coins, p.inv.stone], [0, undefined]);
});

test('an empty stomach slows the feet and the swing; speed and swing time have floors', () => {
    const p = farmer();
    p.energy = 0;
    assert.equal(derived(p).speed, TUNING.moveSpeed * TUNING.lowEnergySlow);
    assert.equal(derived(p).swingCd, TUNING.swingCooldown * 2);
    p.energy = 1;
    assert.equal(derived(p).speed, TUNING.moveSpeed);
    p.skills.g_hands = 3;                                          // +6% swing speed a rank
    assert.ok(Math.abs(derived(p).swingCd - TUNING.swingCooldown / 1.18) < 1e-9);
    p.skills.x_swift = 50;                                         // a save with a silly rank: more speed, no crash
    assert.ok(derived(p).speed > TUNING.moveSpeed);
    p.equip.body = 'plate_colossus';                               // -8% speed
    p.skills.x_swift = 0;
    assert.ok(Math.abs(derived(p).speed - TUNING.moveSpeed * 0.92) < 1e-9);
    p.skills.x_swift = -100;
    assert.equal(derived(p).speed, TUNING.moveSpeed * 0.4, 'never slower than two fifths');
    p.skills.g_hands = -100;
    assert.equal(derived(p).swingCd, TUNING.swingCooldown / 0.3, 'never slower than that');
    p.skills.g_swing = 100;
    assert.equal(derived(p).swingEnergy, 0.1, 'a swing always costs a little');
});

test('learning starts at the hub and follows the branch, needs the points, and stops at the top rank', () => {
    const p = farmer();
    assert.deepEqual(canLearn(p, 'nope'), { ok: false, why: 'Unknown skill' });
    assert.equal(canLearn(p, 'g_wood').why, 'Learn a connected skill first');
    assert.equal(canLearn(p, 'g_hands').why, 'Needs 1 skill point');
    p.skills.i_smelt = 1;
    assert.equal(canLearn(p, 'i_eng').why, 'Needs 2 skill points', 'the plural');
    assert.equal(learnSkill(p, 'g_hands'), false);
    p.points = 3;
    assert.equal(learnSkill(p, 'g_hands'), true);
    assert.deepEqual([rankOf(p, 'g_hands'), p.points], [1, 2]);
    assert.ok(canLearn(p, 'g_wood').ok, 'the branch opens');
    assert.equal(learnSkill(p, 'g_hands'), true);
    assert.equal(learnSkill(p, 'g_hands'), true);
    assert.equal(rankOf(p, 'g_hands'), SKILLS.g_hands.max);
    p.points = 10;
    assert.equal(canLearn(p, 'g_hands').why, 'Maxed out');
    assert.equal(learnSkill(p, 'g_hands'), false);
    assert.equal(p.points, 10, 'nothing is charged for a refusal');
    assert.equal(rankOf(p, 'never'), 0);
});

test('unlock tokens come from learned skills; no token means nothing is needed', () => {
    const p = farmer();
    assert.equal(unlocks(p).size, 0);
    assert.ok(hasUnlock(p));
    assert.ok(hasUnlock(p, undefined));
    assert.ok(!hasUnlock(p, 'smithing'));
    p.skills.i_smith = 1;
    assert.ok(hasUnlock(p, 'smithing'));
    assert.deepEqual([...unlocks(p)], SKILLS.i_smith.unlock);
    p.skills.i_power = 0;
    assert.ok(!hasUnlock(p, 'power'), 'rank zero grants nothing');
    p.skills.i_power = 1;
    assert.ok(hasUnlock(p, 'power'));
    p.skills.ghost = 2;
    assert.doesNotThrow(() => unlocks(p), 'a skill that no longer exists is skipped');
});

test('building discounts touch materials only and never go below one; selling scales with the bonus', () => {
    const p = farmer();
    assert.deepEqual(scaledCost(p, { wood: 8, coin: 60 }), { wood: 8, coin: 60 });
    p.skills.i_build = 4;                                          // -6% a rank
    assert.deepEqual(scaledCost(p, { wood: 8, coin: 60, fiber: 1 }), { wood: Math.round(8 * 0.76), coin: 60, fiber: 1 });
    p.skills.i_build = 100;
    assert.ok(Math.abs(derived(p).buildMul - 0.3) < 1e-9, 'the discount has a floor');
    assert.deepEqual(scaledCost(p, { stone: 12 }), { stone: Math.round(12 * 0.3) });
    const q = farmer();
    assert.equal(sellValue(q, 'goldbar', 3), ITEMS.goldbar.sell * 3);
    q.skills.x_haggle = 5;                                         // +6% a rank
    assert.ok(Math.abs(sellValue(q, 'goldbar', 3) - ITEMS.goldbar.sell * 3 * 1.3) < 1e-9);
    q.skills.x_land = 100;
    assert.ok(Math.abs(derived(q).landMul - 0.3) < 1e-9, 'land is never free');
    q.skills.c_dodge = 100;
    assert.equal(derived(q).dodge, 0.6, 'dodge is capped');
});
