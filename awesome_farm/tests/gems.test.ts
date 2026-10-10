// Gems: cuts and merging, sockets, what each kind does on a hit and in armour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GEM_ARMOR, GEM_KINDS, GEM_POWER, GEM_TIERS, gemId, gemMods, mergeTarget, parseGem } from '../src/shared/data/gems';
import { ITEMS, type ItemId } from '../src/shared/data/items';
import { LOOT_POOL } from '../src/shared/data/loot';
import { Sim } from '../src/shared/sim/sim';
import { modsOf } from '../src/shared/sim/stats';

const STEP = 1 / 20;
const g = (kind: string, tier: number) => `gem_${kind}_${tier}` as ItemId;

test('every kind has three cuts, each an item, each found in a crate; finer cuts are worth more', () => {
    const pool = JSON.stringify(LOOT_POOL);
    for (const k of GEM_KINDS) {
        let last = 0;
        for (const t of GEM_TIERS) {
            const id = gemId(k, t);
            assert.ok(ITEMS[id as ItemId], `${id} exists`);
            assert.ok(pool.includes(id), `${id} is in a crate`);
            assert.ok(ITEMS[id as ItemId].sell > last, 'a finer cut is worth more');
            last = ITEMS[id as ItemId].sell;
            assert.deepEqual(parseGem(id), { kind: k, tier: t });
        }
        assert.ok(GEM_ARMOR[k].every((m, i) => i === 0 || Object.values(m)[0]! > Object.values(GEM_ARMOR[k][i - 1])[0]!), 'and does more in armour');
    }
    assert.equal(parseGem('gem_ruby_4'), null);
    assert.equal(parseGem('gem_cheese_1'), null);
    assert.equal(parseGem('wood'), null);
});

test('merging: three of a cut make the next, a flawless one is final', () => {
    assert.equal(mergeTarget('gem_ruby_1'), 'gem_ruby_2');
    assert.equal(mergeTarget('gem_ruby_2'), 'gem_ruby_3');
    assert.equal(mergeTarget('gem_ruby_3'), null);
    const sim = Sim.create('GEMS', 'b'), p = sim.join('a', 'A')!;
    sim.give(p, g('ruby', 1), 7);
    sim.command('a', { t: 'gem', op: 'merge', item: g('ruby', 1) });
    sim.command('a', { t: 'gem', op: 'merge', item: g('ruby', 1) });
    assert.equal(p.inv[g('ruby', 1)], 1, 'six went');
    assert.equal(p.inv[g('ruby', 2)], 2);
    sim.command('a', { t: 'gem', op: 'merge', item: g('ruby', 1) });      // only one left: refused
    assert.equal(p.inv[g('ruby', 1)], 1);
    sim.give(p, g('ruby', 3), 3);
    sim.command('a', { t: 'gem', op: 'merge', item: g('ruby', 3) });
    assert.equal(p.inv[g('ruby', 3)], 3, 'flawless cannot be merged');
});

test('sockets: a gem goes in, the one that was there comes back, armour gems add to the stats, and hostile input does nothing', () => {
    const sim = Sim.create('GEMS2', 'b'), p = sim.join('a', 'A')!;
    sim.give(p, g('sapphire', 1), 1); sim.give(p, g('sapphire', 2), 1); sim.give(p, g('diamond', 3), 1);
    const base = modsOf(p);
    sim.command('a', { t: 'gem', op: 'set', socket: 'body', item: g('sapphire', 1) });
    assert.equal(p.gems!.body, g('sapphire', 1));
    assert.ok((modsOf(p).armor ?? 0) - (base.armor ?? 0) > 0.14, 'armor from a sapphire in the body');
    sim.command('a', { t: 'gem', op: 'set', socket: 'body', item: g('sapphire', 2) });
    assert.equal(p.inv[g('sapphire', 1)], 1, 'the old one came back');
    sim.command('a', { t: 'gem', op: 'set', socket: 'w1', item: g('diamond', 3) });
    assert.ok((modsOf(p).crit ?? 0) - (base.crit ?? 0) >= GEM_POWER.crit[2] - 1e-9, 'a diamond in the weapon is critical chance');
    sim.command('a', { t: 'gem', op: 'clear', socket: 'w1' });
    assert.equal(p.gems!.w1, undefined);
    assert.equal(p.inv[g('diamond', 3)], 1);
    for (const c of [{ socket: '__proto__', item: g('sapphire', 1) }, { socket: 'tail', item: g('sapphire', 1) }, { socket: 'head', item: 'wood' }, { socket: 'head', item: g('ruby', 1) }]) sim.command('a', { t: 'gem', op: 'set', ...c } as never);
    sim.command('a', { t: 'gem', op: 'clear', socket: 'constructor' as never });
    assert.equal(p.gems!.head, undefined);
    assert.deepEqual(gemMods({ head: 'wood', body: 'gem_ruby_9' }), {});
});

test('a ruby burns, a sapphire slows, an emerald poisons: the damage lands after the swing, and counts as the farmer\'s', () => {
    for (const [gem, check] of [['ruby', 'burn'], ['emerald', 'poison'], ['sapphire', 'slow']] as const) {
        const sim = Sim.create(`GEMS-${gem}`, 'b'), p = sim.join('a', 'A')!;
        p.invuln = 1e9;
        sim.give(p, g(gem, 3), 1);
        sim.command('a', { t: 'gem', op: 'set', socket: 'w1', item: g(gem, 3) });
        const m = sim.spawnMob('slime', 'a')!;
        if (!m) continue;
        m.hp = m.mhp = 5000; p.x = m.x - 10; p.y = m.y;
        sim.command('a', { t: 'swing', id: m.id });
        const after = m.hp;
        if (gem === 'sapphire') assert.ok((m.sm ?? 1) < 1, 'it is slowed at once');
        assert.ok(after < 5000, `${check}: the hit landed`);
        for (let t = 0; t < 4; t += STEP) sim.step(STEP);
        if (gem === 'sapphire') assert.equal(m.sm ?? 1, 1, 'and it wears off');
        else assert.ok(m.hp < after - 1, `${check} ticked (${after} -> ${m.hp})`);
    }
});

test('the ruby, the topaz and the amethyst have numbers that grow with the cut', () => {
    for (const a of [GEM_POWER.burn, GEM_POWER.poison, GEM_POWER.chain, GEM_POWER.heal, GEM_POWER.crit]) assert.ok(a[0] < a[1] && a[1] < a[2]);
    assert.ok(GEM_POWER.slow[0] > GEM_POWER.slow[1] && GEM_POWER.slow[1] > GEM_POWER.slow[2], 'a finer sapphire leaves them slower');
});
