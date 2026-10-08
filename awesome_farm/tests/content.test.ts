// Data integrity: every table agrees with every other, the skill tree is well-formed
// and laid out cleanly, and every item can actually be obtained.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/shared/data/buildings';
import { BIOME_DEFS } from '../src/shared/data/biomes';
import { ITEMS, ItemId, STARTER_GEAR } from '../src/shared/data/items';
import { FISH } from '../src/shared/data/fish';
import { MOBS } from '../src/shared/data/mobs';
import { NODES } from '../src/shared/data/nodes';
import { RECIPE_LIST } from '../src/shared/data/recipes';
import { CRATE_ITEM, LOOT_POOL } from '../src/shared/data/loot';
import { BOONS, RIFT_TIERS } from '../src/shared/data/rift';
import { BRANCHES, SKILL_LIST, SKILLS, SKILL_POINT_TOTAL, UNLOCK_INFO, skillPos } from '../src/shared/data/skills';
import { BUFFS, STAT_INFO } from '../src/shared/data/stats';
import { MAX_LEVEL, xpToNext } from '../src/shared/sim/stats';

const tokens = new Set(SKILL_LIST.flatMap((s) => s.unlock ?? []));

test('recipes reference real items, valid stations and unlock tokens', () => {
    for (const r of RECIPE_LIST) {
        assert.ok(ITEMS[r.out], `${r.id}: unknown output`);
        for (const id of Object.keys(r.in)) assert.ok(id === 'coin' || ITEMS[id as ItemId], `${r.id}: unknown input ${id}`);
        if (r.req) assert.ok(tokens.has(r.req), `${r.id}: token "${r.req}" is granted by no skill`);
        assert.ok(r.station in { hand: 1, workbench: 1, anvil: 1, kitchen: 1, loom: 1, alchemy: 1, altar: 1, riftforge: 1, furnace: 1, sawmill: 1, millstone: 1, assembler: 1 }, `${r.id}: bad station`);
        if (['furnace', 'sawmill', 'millstone', 'assembler'].includes(r.station)) assert.ok(r.time > 0, `${r.id}: processors need a time`);
    }
});

test('buildings: costs and tokens are real, stations exist, sizes are sane', () => {
    for (const [kind, def] of Object.entries(BUILDINGS)) {
        for (const id of Object.keys(def.cost)) assert.ok(id === 'coin' || ITEMS[id as ItemId], `${kind}: unknown cost item ${id}`);
        if (def.req) assert.ok(tokens.has(def.req), `${kind}: token "${def.req}" is granted by no skill`);
        assert.ok(def.size[0] >= 1 && def.size[1] >= 1 && def.size[0] <= 4 && def.size[1] <= 4, `${kind}: footprint`);
        if (def.station) assert.ok(RECIPE_LIST.some((r) => r.station === def.station), `${kind}: station with no recipes`);
        if (def.proc) assert.ok(RECIPE_LIST.some((r) => r.station === def.proc), `${kind}: processor with no recipes`);
    }
});

test('nodes and biomes line up', () => {
    for (const [kind, def] of Object.entries(NODES)) {
        for (const [res] of def.drops) assert.ok(res === 'coin' || ITEMS[res], `${kind}: unknown drop ${res}`);
        assert.ok(def.hp >= 1 && def.xp >= 1);
    }
    for (const [b, def] of Object.entries(BIOME_DEFS)) {
        for (const k of Object.keys(def.nodes)) assert.ok(NODES[k as keyof typeof NODES], `${b}: unknown node ${k}`);
    }
});

test('every item can be obtained: dropped, grown, crafted or a starter item', () => {
    const got = new Set<string>(Object.values(STARTER_GEAR));
    for (const n of Object.values(NODES)) for (const [res] of n.drops) got.add(res);
    for (const m of Object.values(MOBS)) {
        for (const [item] of m.drops) got.add(item);
        if (m.boss) { got.add(m.boss.trophy); for (const g of m.boss.gear) got.add(g); }
    }
    // luck: every crate, bottle and shard comes out of the loot tables, the wheel or a monster
    for (const rows of Object.values(LOOT_POOL)) for (const r of rows) got.add(r.item);
    for (const it of Object.values(CRATE_ITEM)) got.add(it);
    // expeditions pay out shards and the loot tables of each tier
    got.add('rift_shard');
    for (const f of FISH) got.add(f.id);
    for (const id of ['junk_boot', 'pearl']) got.add(id);
    for (const t of RIFT_TIERS) for (const [item] of t.loot) got.add(item);
    // fixpoint: a recipe is doable once all its inputs are obtainable
    for (let changed = true; changed;) {
        changed = false;
        for (const r of RECIPE_LIST) {
            if (!got.has(r.out) && Object.keys(r.in).every((i) => i === 'coin' || got.has(i))) { got.add(r.out); changed = true; }
        }
        for (const id of Object.keys(ITEMS)) {
            // crops: the seed grows the produce
            if (id.startsWith('seed_') && got.has(id)) {
                const out = id.replace('seed_', '');
                if (!got.has(out)) { got.add(out); changed = true; }
            }
        }
    }
    const missing = Object.keys(ITEMS).filter((i) => !got.has(i));
    assert.deepEqual(missing, [], `unobtainable items: ${missing.join(', ')}`);
});

test('buff and stat tables are complete', () => {
    for (const [id, b] of Object.entries(BUFFS)) assert.ok(Object.keys(b.mods).length, `${id} does nothing`);
    for (const it of Object.values(ITEMS)) {
        if (it.buff) assert.ok(BUFFS[it.buff.id]);
        for (const k of Object.keys(it.gear?.mods ?? {})) assert.ok(k in STAT_INFO, `unknown stat ${k}`);
    }
});

test('skill tree: ids, requirements, tokens and mods are all valid', () => {
    assert.ok(SKILL_LIST.length >= 95, `${SKILL_LIST.length} skills`);
    assert.equal(new Set(SKILL_LIST.map((s) => s.id)).size, SKILL_LIST.length, 'unique ids');
    for (const s of SKILL_LIST) {
        assert.ok(s.max >= 1 && s.cost >= 1, s.id);
        assert.ok(s.mods || s.unlock, `${s.id} has no effect`);
        for (const r of s.req) assert.ok(r === 'hub' || SKILLS[r], `${s.id}: unknown requirement ${r}`);
        for (const k of Object.keys(s.mods ?? {})) assert.ok(k in STAT_INFO, `${s.id}: unknown stat ${k}`);
        for (const t of s.unlock ?? []) assert.ok(t in UNLOCK_INFO, `${s.id}: undescribed token ${t}`);
        assert.ok(s.id.startsWith(s.branch[0]) || s.id.startsWith(s.branch === 'explore' ? 'x' : s.branch[0]), `${s.id}: id prefix`);
    }
    // every token that something asks for is available somewhere, and described
    for (const t of tokens) assert.ok(t in UNLOCK_INFO, `token ${t} has no description`);
});

test('skill tree: every node is reachable from the hub, with no cycles of dependency', () => {
    const reach = new Set<string>(['hub']);
    for (let changed = true; changed;) {
        changed = false;
        for (const s of SKILL_LIST) if (!reach.has(s.id) && s.req.some((r) => reach.has(r))) { reach.add(s.id); changed = true; }
    }
    assert.deepEqual(SKILL_LIST.filter((s) => !reach.has(s.id)).map((s) => s.id), []);
    for (const b of Object.keys(BRANCHES)) assert.ok(SKILL_LIST.filter((s) => s.branch === b).length >= 15, `${b} too small`);
});

test('skill tree layout: nodes never overlap and stay inside their wedge', () => {
    const pts = SKILL_LIST.map((s) => ({ s, ...skillPos(s) }));
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            assert.ok(d >= 70, `${pts[i].s.id} and ${pts[j].s.id} are only ${Math.round(d)}px apart`);
        }
    }
    for (const { s, x, y } of pts) {
        const want = BRANCHES[s.branch].angle;
        let a = (Math.atan2(y, x) * 180) / Math.PI - want;
        a = ((a + 540) % 360) - 180;
        assert.ok(Math.abs(a) <= 24, `${s.id} sits ${Math.round(a)}° off its branch axis`);
    }
});

test('progression: the tree is bigger than you can ever fill, and levels get slower', () => {
    const pointsFromLevels = MAX_LEVEL - 1;
    assert.ok(SKILL_POINT_TOTAL > pointsFromLevels * 1.4, `tree costs ${SKILL_POINT_TOTAL}, levels give ${pointsFromLevels}: choices must matter`);
    let prev = 0;
    for (let l = 1; l < MAX_LEVEL; l++) { assert.ok(xpToNext(l) > prev); prev = xpToNext(l); }
    assert.ok(xpToNext(1) < 20, 'first level comes quickly');
});

test('expedition data: tiers climb steadily, loot and boons only reference real things', () => {
    RIFT_TIERS.forEach((t, i) => {
        assert.equal(t.id, i);
        assert.ok(MOBS[t.guardian] && !MOBS[t.guardian].boss, `${t.name}: the guardian is a regular monster`);
        if (t.escorts) assert.ok(MOBS[t.escorts]);
        for (const [item, chance, lo, hi] of t.loot) assert.ok(ITEMS[item] && chance > 0 && chance <= 1 && lo >= 1 && hi >= lo, `${t.name}: loot ${item}`);
        if (i) {
            const p = RIFT_TIERS[i - 1];
            if (t.endless) assert.ok(i === RIFT_TIERS.length - 1 && t.hpMul >= p.hpMul && t.need >= p.need && t.level > p.level, 'the Abyss is the last and hardest');
            else assert.ok(t.waves >= p.waves && t.hpMul > p.hpMul && t.need >= p.need && t.level > p.level && t.shards[0] > p.shards[0] && t.coins > p.coins, `${t.name} is harder and pays more than ${p.name}`);
        }
    });
    for (const b of BOONS) {
        assert.ok(b.mods || b.special, `${b.id} does something`);
        for (const k of Object.keys(b.mods ?? {})) assert.ok(k in STAT_INFO, `${b.id}: unknown stat ${k}`);
    }
});
