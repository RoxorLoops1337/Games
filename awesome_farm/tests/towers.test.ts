// Tower levels and perks: XP from kills, the level curve, the three-perk offer (deterministic, by rarity), the pick command and
// every perk's effect in a headless sim. (data/towerperks.ts, sim/defense.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { MOBS } from '../src/shared/data/mobs';
import { canTake, count, repairCost, killXp, levelFrac, levelOf, offer, PERK_BY_ID, PERKS, pending, RARITIES, statsOf, towerType, xpAt, xpStep, type Rarity, type TowerType } from '../src/shared/data/towerperks';
import * as defense from '../src/shared/sim/defense';
import * as mobs from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, Cmd, MobE } from '../src/shared/sim/types';
import { Rng } from '../src/shared/rng';
import { countOf } from '../src/shared/sim/stats';

const T = TUNING.towers;
const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const KIND: Record<TowerType, string> = { archer: 'tower_archer', ballista: 'ballista', tesla: 'tesla', spike: 'spike' };
const TYPES: TowerType[] = ['archer', 'ballista', 'tesla', 'spike'];

/** A world with one farmer far away (out of every monster's sight), and one tower with the given perks and XP. */
function rig (type: TowerType, perks: string[] = [], xp = 0) {
    const sim = Sim.create('TOWERS-1', 'w');
    const p = sim.join('a', 'A')!;
    p.level = 5; p.invuln = 1e9;
    for (const q of sim.s.plots) if (q.blight === 1) { q.blight = undefined; }
    for (const id of Object.keys(sim.s.ents)) { const e = sim.s.ents[+id]; if (e.k === 'node' && e.kind === 'nest') sim.remove(e.id); }
    sim.world.recompute();
    const h = sim.world.plotCenter(sim.homePlot(p.slot));
    const free = sim.nearestFree(Math.floor(h.x / TILE), Math.floor(h.y / TILE), 8)!;
    const t = sim.add<BuildE>({ k: 'bld', kind: KIND[type] as BuildE['kind'], tx: free.tx, ty: free.ty, rot: 0, by: 'a', ...(perks.length ? { pk: perks } : {}), ...(xp ? { xp } : {}) });
    if (type === 'tesla') { sim.add<BuildE>({ k: 'bld', kind: 'windturbine', tx: free.tx + 2, ty: free.ty, rot: 0, by: 'a' }); sim.add<BuildE>({ k: 'bld', kind: 'pole', tx: free.tx + 1, ty: free.ty + 2, rot: 0, by: 'a' }); }
    p.x = h.x - 300; p.y = h.y;
    const at = (dx: number, dy = 0, kind: MobE['kind'] = 'slime', hp = 1000) => {
        const m = mobs.spawnMob(sim, kind, undefined, undefined, { x: (t.tx + 0.5) * TILE + dx, y: (t.ty + 1) * TILE + dy, lv: 1, pack: false })!;
        m.hp = m.mhp = hp; m.vx = m.vy = 0;
        return m;
    };
    return { sim, p, t, at, h };
}

test('the level curve: 30 XP for level 2, about five times that for level 10, nothing past the top', () => {
    assert.equal(xpStep(2), T.xpFirst);
    assert.equal(xpStep(10), T.xpFirst * 5);
    for (let l = 3; l <= 10; l++) assert.ok(xpStep(l) > xpStep(l - 1), 'every level costs more');
    assert.equal(levelOf(0), 1); assert.equal(levelOf(xpAt(2) - 1), 1); assert.equal(levelOf(xpAt(2)), 2);
    assert.equal(levelOf(xpAt(10)), 10); assert.equal(levelOf(1e9), 10);
    for (const bad of [undefined, NaN, -5, Infinity, '12' as unknown as number]) assert.ok(levelOf(bad) >= 1 && levelOf(bad) <= 10);
    assert.ok(levelFrac(xpAt(2) + xpStep(3) / 2) > 0.49 && levelFrac(xpAt(2) + xpStep(3) / 2) < 0.51);
    assert.equal(levelFrac(1e9), 1);
    assert.ok(killXp(10, true, false) > killXp(10, false, false) * 2 && killXp(10, false, true) > killXp(10, true, false), 'elites and bosses give much more');
});

test('every perk is defined once, with a rarity, an icon, a description and a tower it fits; every tower has a deep enough pool', () => {
    assert.equal(new Set(PERKS.map((p) => p.id)).size, PERKS.length);
    for (const p of PERKS) {
        assert.ok(RARITIES.includes(p.rarity) && p.icon.startsWith('tp_') && p.desc.length > 8 && p.name && p.on.length && p.max >= 1, p.id);
        assert.ok(!/—/.test(p.desc + p.name), 'no em dash');
    }
    for (const r of RARITIES) assert.ok(PERKS.some((p) => p.rarity === r), `a ${r} perk exists`);
    for (const type of TYPES) {
        const pool = PERKS.filter((p) => p.on.includes(type));
        assert.ok(pool.length >= 6, `${type}: ${pool.length} perks`);
        // nine picks (levels 2 to 10), always three to choose from, greedily taking the last on offer
        const t: { xp?: number; pk: string[] } = { pk: [] };
        for (let i = 0; i < 9; i++) {
            const o = offer('S', 1, type, t);
            assert.equal(o.length, 3, `${type} pick ${i + 1}`);
            assert.equal(new Set(o).size, 3);
            t.pk.push(o[2]);
        }
    }
    assert.ok(TYPES.every((tp) => PERKS.some((p) => p.rarity === 'legendary' && p.on.includes(tp)) || tp === 'spike'), 'every tower has a legendary but the trap');
});

test('the offer is the same every time (from the seed, the tower and the pick), by rarity, legendary only from level 5', () => {
    const a = offer('SEED', 7, 'archer', { pk: [] }), b = offer('SEED', 7, 'archer', { pk: [] });
    assert.deepEqual(a, b);
    assert.notDeepEqual(offer('SEED', 8, 'archer', { pk: [] }).concat(offer('SEED', 9, 'archer', { pk: [] })), a.concat(a), 'other towers see other offers');
    // rarity weights and the legendary gate, over many towers
    const seen: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    let total = 0, legendEarly = 0;
    for (let id = 1; id <= 3000; id++) {
        const early = offer('W', id, 'archer', { pk: ['power'] });                  // (the second pick: level 3)
        for (const x of early) if (PERK_BY_ID[x].rarity === 'legendary') legendEarly++;
        for (const x of offer('W', id, 'archer', { pk: ['power', 'haste', 'range', 'sturdy'] })) { seen[PERK_BY_ID[x].rarity]++; total++; }       // (the fifth pick: level 6)
    }
    assert.equal(legendEarly, 0, 'no legendary before level 5');
    assert.ok(seen.common > seen.uncommon && seen.uncommon > seen.rare && seen.rare > seen.legendary, JSON.stringify(seen));
    assert.ok(seen.legendary > 0 && seen.legendary / total < 0.06, `legendary is really rare: ${seen.legendary}/${total}`);
    assert.ok(seen.common / total > 0.4, 'mostly common');
    // nothing taken twice unless it stacks; nothing that is not for this tower
    for (const type of TYPES) for (let id = 1; id <= 200; id++) {
        const pk: string[] = [];
        for (let i = 0; i < 9; i++) {
            const o = offer('X', id, type, { pk });
            for (const x of o) assert.ok(canTake(type, pk, x, i + 2), `${type}: ${x}`);
            pk.push(o[id % o.length]);
        }
        for (const x of new Set(pk)) assert.ok(count(pk, x) <= PERK_BY_ID[x].max);
    }
});

test('a kill earns the tower XP (an elite more), a level makes a pick wait, the offer survives a save and a load', () => {
    const { sim, t, at, p } = rig('archer');
    const m = at(40, 0, 'skeleton', 1);
    run(sim, 4);
    assert.ok(!sim.s.ents[m.id], 'shot down');
    assert.equal(t.xp, killXp(MOBS.skeleton.xp, false, false));
    assert.ok(p.stats.kills >= 1, 'the builder still gets the kill');
    const e = at(40, 0, 'skeleton', 1); e.el = 1; sim.touch(e);
    const before = t.xp!;
    run(sim, 4);
    assert.equal(t.xp! - before, killXp(MOBS.skeleton.xp, true, false), 'an elite gives more');
    // a flood of kills reaches level 2
    t.xp = xpAt(2) - 1;
    sim.events = [];
    const m3 = at(40, 0, 'slime', 1);
    run(sim, 4);
    assert.ok(!sim.s.ents[m3.id]);
    assert.equal(levelOf(t.xp), 2);
    assert.equal(pending(t), 1);
    assert.ok(sim.events.some((x) => x.e === 'toast' && /choose an upgrade/.test(x.text)), 'its builder is told');
    const o = defense.offerFor(sim, t);
    assert.equal(o.length, 3);
    const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(defense.offerFor(copy, copy.s.ents[t.id] as BuildE), o, 'reloading does not reroll');
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(rig('archer').t))).filter((k) => k === 'xp' || k === 'pk'), [], 'no XP, no fields: saves stay small');
});

test('towerpick: the i-th perk on offer, once, by its owner or a farmer beside it; every bad request is ignored', () => {
    const { sim, t, p } = rig('archer', [], xpAt(3));
    assert.equal(pending(t), 2);
    const q = sim.join('b', 'B')!;
    q.x = p.x; q.y = p.y;
    const send = (who: string, c: unknown) => sim.command(who, c as Cmd);
    const snap = () => JSON.stringify([t.pk, t.xp]);
    const was = snap();
    for (const bad of [{ id: t.id, i: 3 }, { id: t.id, i: -1 }, { id: t.id, i: 1.5 }, { id: t.id, i: '0' }, { id: t.id, i: NaN }, { id: t.id, i: Infinity }, { id: 'x', i: 0 }, { id: 99999, i: 0 }, { id: -1, i: 0 }, { id: NaN, i: 0 }, { id: 1e300, i: 0 }, {}, { id: t.id }, { i: 0 }, { id: '__proto__', i: 0 }, { id: t.id, i: '__proto__' }, { id: null, i: null }, { id: [t.id], i: [0] }, { id: { a: 1 }, i: 0 }]) send('a', { t: 'towerpick', ...bad });
    assert.equal(snap(), was, 'nothing changed');
    send('b', { t: 'towerpick', id: t.id, i: 0 });                      // (a stranger far from it)
    assert.equal(snap(), was, 'a stranger far away cannot');
    const o = defense.offerFor(sim, t);
    send('a', { t: 'towerpick', id: t.id, i: 1 });
    assert.deepEqual(t.pk, [o[1]], 'the second card');
    assert.equal(pending(t), 1);
    const o2 = defense.offerFor(sim, t);
    assert.ok(!o2.includes(o[1]) || PERK_BY_ID[o[1]].max > 1, 'a taken perk is not offered again unless it stacks');
    // a farmer beside the tower may choose too
    const c = sim.center(t);
    q.x = c.x + 10; q.y = c.y;
    send('b', { t: 'towerpick', id: t.id, i: 0 });
    assert.equal(t.pk!.length, 2);
    assert.equal(pending(t), 0);
    send('a', { t: 'towerpick', id: t.id, i: 0 });
    assert.equal(t.pk!.length, 2, 'no pick waits');
    // something that is not a tower
    const wall = sim.add<BuildE>({ k: 'bld', kind: 'wall_wood', tx: t.tx + 4, ty: t.ty, rot: 0, by: 'a' });
    send('a', { t: 'towerpick', id: wall.id, i: 0 });
    assert.equal(wall.pk, undefined);
});

test('fuzz: towerpick and tower state never throw or break the numbers', () => {
    const { sim, t } = rig('tesla', [], xpAt(10));
    const rng = new Rng('tower-fuzz');
    const junk = (): unknown => { const r = rng.next(); return r < 0.4 ? rng.int(-3, 6) : r < 0.5 ? t.id : r < 0.6 ? 'x' : r < 0.7 ? NaN : r < 0.8 ? null : r < 0.9 ? {} : r < 0.95 ? '__proto__' : 1e300; };
    for (let i = 0; i < 3000; i++) {
        sim.command('a', { t: 'towerpick', id: rng.chance(0.6) ? t.id : junk(), i: junk() } as unknown as Cmd);
        if (i % 40 === 0) run(sim, 0.2);
    }
    assert.ok(t.pk!.length <= 9 && t.pk!.every((x) => canTake('tesla', [], x, 10)));
    assert.ok(Number.isFinite(t.xp!));
    for (const bad of [{ xp: NaN, pk: ['nope', 7, '__proto__'] }, { xp: 'a', pk: 'x' }, { xp: -4, pk: null }]) {
        const b = sim.add<BuildE>({ k: 'bld', kind: 'tower_archer', tx: t.tx + 6, ty: t.ty + 3, rot: 0, by: 'a', ...bad } as never);
        run(sim, 0.5);
        assert.doesNotThrow(() => { defense.offerFor(sim, b); defense.statsFor(sim, b); defense.towerWords(b); });
        sim.remove(b.id);
    }
});

test('the numbers come from one function: perks change them as written, and stack up to their cap', () => {
    const base = statsOf('archer', []);
    assert.equal(base.dmg, TUNING.blight.archer.dmg);
    assert.ok(Math.abs(statsOf('archer', ['range']).range / base.range - (1 + T.range)) < 1e-9);
    assert.ok(Math.abs(base.every / statsOf('archer', ['haste', 'haste']).every - (1 + 2 * T.haste)) < 1e-9);
    assert.ok(Math.abs(statsOf('ballista', ['power']).dmg / statsOf('ballista', []).dmg - (1 + T.power)) < 1e-9);
    assert.equal(statsOf('tesla', ['sturdy']).hp, Math.round(TUNING.blight.hp.tesla * (1 + T.sturdy)));
    assert.equal(statsOf('tesla', ['chain', 'chain']).chain, TUNING.blight.tesla.chain + 2);
    assert.equal(statsOf('spike', []).range, 0);
    assert.ok(statsOf('archer', [], 11).dmg > base.dmg, 'the builder\'s level still counts');
    assert.equal(statsOf('archer', ['crit', 'crit', 'crit', 'crit']).crit, Math.min(1, 4 * T.crit));
    for (const tp of ['archer', 'ballista', 'tesla', 'spike'] as TowerType[]) assert.ok(towerType(KIND[tp]) === tp && BUILDINGS[KIND[tp] as 'spike']);
    assert.equal(towerType('wall_wood'), null);
});

test('common perks at work: faster fire, longer reach, tougher towers', () => {
    // attack speed: the same fight, more shots
    const shots = (perks: string[]) => { const r = rig('archer', perks); r.at(60); let n = 0; run(r.sim, 0.01); r.sim.events = []; for (let i = 0; i < 100; i++) { r.sim.step(STEP); n += r.sim.events.filter((e) => e.e === 'shot').length; } return n; };
    assert.ok(shots(['haste', 'haste', 'haste']) > shots([]) * 1.3);
    // range
    const reach = (perks: string[]) => { const r = rig('archer', perks); const m = r.at(TUNING.blight.archer.range * 1.25); const hp = m.hp; run(r.sim, 3); return m.hp < hp; };
    assert.equal(reach([]), false); assert.equal(reach(['range', 'range']), true);
    // health
    const { sim, t } = rig('ballista', ['sturdy', 'sturdy']);
    defense.hitBuilding(sim, t, 10);
    assert.equal(t.hp, Math.round(TUNING.blight.hp.ballista * (1 + 2 * T.sturdy)) - 10);
    assert.equal(defense.maxHp(t), Math.round(TUNING.blight.hp.ballista * (1 + 2 * T.sturdy)));
});

test('uncommon perks: piercing, multishot, crits, slowing, veteran XP, self-mending', () => {
    // pierce: a second monster behind the first, on the line
    let r = rig('archer', ['pierce']);
    const a = r.at(60), b = r.at(80), side = r.at(60, 30);
    run(r.sim, 0.3);
    assert.ok(a.hp < 1000 && b.hp < 1000, 'both in line were hit');
    assert.equal(side.hp, 1000, 'the one off the line was not');
    // multishot: one extra target per level of it, at a lower damage
    r = rig('archer', ['multi', 'multi']);
    const ms = [r.at(40), r.at(50, 8), r.at(50, -8), r.at(55, 16)];
    r.sim.events = [];
    run(r.sim, 0.3);
    assert.equal(r.sim.events.filter((e) => e.e === 'shot').length, 3, 'three arrows');
    assert.equal(ms.filter((m) => m.hp < 1000).length, 3);
    const dmgs = ms.map((m) => 1000 - m.hp).filter((d) => d > 0).sort((x, y) => x - y);
    assert.ok(dmgs[0] < dmgs[2] * 0.8, 'the extra arrows hit softer');
    // crits: with every crit perk, a good share of shots hit twice as hard
    r = rig('archer', ['crit', 'crit', 'crit']);
    const hits: number[] = [];
    for (let i = 0; i < 30; i++) { const m = r.at(40); const b0 = m.hp; run(r.sim, 1.4); hits.push(b0 - m.hp); r.sim.remove(m.id); }
    const base = statsOf('archer', [], 5).dmg;
    assert.ok(hits.some((h) => Math.abs(h - 2 * base) < 1e-6) && hits.some((h) => Math.abs(h - base) < 1e-6), `some crit, some not: ${hits.slice(0, 6)}`);
    // slow: the speed multiplier drops and comes back
    r = rig('archer', ['slow']);
    const sl = r.at(50);
    run(r.sim, 0.3);
    assert.ok(Math.abs((sl.sm ?? 1) - (1 - T.slow)) < 1e-9, `slowed: ${sl.sm}`);
    r.sim.remove(r.t.id);
    run(r.sim, T.slowSecs + 0.5);
    assert.equal(sl.sm, undefined, 'and back to normal');
    // veteran: more XP
    const xpFor = (perks: string[]) => { const q = rig('archer', perks); q.at(40, 0, 'skeleton', 1); run(q.sim, 3); return q.t.xp!; };
    assert.ok(Math.abs(xpFor(['veteran']) / xpFor([]) - 1.3) < 0.1);
    // (self-mending is in its own test below)
});

test('rare perks: executioner, splash, long chain, overcharge, vampiric aura', () => {
    // executioner: more damage to a wounded monster
    const dmgTo = (perks: string[], low: boolean) => { const r = rig('archer', perks); const m = r.at(40); if (low) m.hp = 200; const h = m.hp; run(r.sim, 1.3); return h - m.hp; };
    assert.ok(Math.abs(dmgTo(['execute'], true) / dmgTo([], true) - (1 + T.execute)) < 1e-6);
    assert.ok(Math.abs(dmgTo(['execute'], false) - dmgTo([], false)) < 1e-6, 'healthy monsters take the normal hit');
    // splash: monsters round the target
    let r = rig('ballista', ['splash']);
    const m1 = r.at(80), m2 = r.at(80, 14), far = r.at(80, 60);
    run(r.sim, 0.3);
    assert.ok(m1.hp < 1000 && m2.hp < m1.hp + 1000 && m2.hp < 1000, 'the neighbour was hit');
    assert.equal(far.hp, 1000);
    // long chain: the lightning leaps to one more
    const chained = (perks: string[]) => { const q = rig('tesla', perks); const ms = [0, 1, 2, 3, 4].map((i) => q.at(20 + i * 20, 0)); run(q.sim, 4); return ms.filter((m) => m.hp < 1000).length; };
    assert.ok(chained(['chain', 'chain']) > chained([]));
    // overcharge: every fifth shot hits three times as hard
    r = rig('archer', ['overcharge']);
    const m = r.at(40);
    const log: number[] = [];
    let last = m.hp;
    const mx = m.x, my = m.y;
    for (let i = 0; i < 200 && log.length < 5; i++) { m.x = mx; m.y = my; r.sim.step(STEP); if (m.hp < last) { log.push(last - m.hp); last = m.hp; } }
    assert.equal(log.length, 5);
    assert.ok(Math.abs(log[4] / log[0] - T.overMul) < 1e-6 && Math.abs(log[3] - log[0]) < 1e-6, `${log}`);
    // aura: a kill mends the hurt walls near it, and not far ones
    r = rig('archer', ['aura']);
    const wall = r.sim.add<BuildE>({ k: 'bld', kind: 'wall_stone', tx: r.t.tx + 2, ty: r.t.ty + 1, rot: 0, by: 'a' });
    const farWall = r.sim.add<BuildE>({ k: 'bld', kind: 'wall_stone', tx: r.t.tx + 12, ty: r.t.ty + 1, rot: 0, by: 'a' });
    wall.hp = 10; farWall.hp = 10;
    r.at(40, 0, 'slime', 1);
    run(r.sim, 3);
    assert.ok((wall.hp ?? 100) > 10 + 10, 'the near wall mended');
    assert.ok(farWall.hp! < 20, "the far wall got no aura (only the slow regeneration)");
});

test('legendary perks: fire arrows burn, frost bolts freeze, the storm strikes the whole group', () => {
    // fire: it keeps hurting after the shot, and kills count for the tower
    let r = rig('archer', ['fire']);
    const m = r.at(40, 0, 'slime', 6);
    m.hp = m.mhp = 9;
    run(r.sim, 0.1);
    const hp1 = m.hp;
    run(r.sim, 0.9);
    assert.ok(m.hp < hp1 || !r.sim.s.ents[m.id], 'burning');
    run(r.sim, 4);
    assert.ok(!r.sim.s.ents[m.id], 'burnt down');
    assert.ok(r.t.xp! > 0, 'the tower got the kill');
    assert.ok(r.sim.events.length >= 0);
    // the shot event says it is aflame
    r = rig('archer', ['fire']); r.at(40); r.sim.events = []; run(r.sim, 0.2);
    assert.ok(r.sim.events.some((e) => e.e === 'shot' && e.fx === 'fire'));
    // frost: frozen solid, then free
    r = rig('ballista', ['frost']);
    const f = r.at(60);
    run(r.sim, 0.2);
    assert.equal(f.sm, 0, 'frozen');
    r.sim.remove(r.t.id);
    run(r.sim, T.freezeSecs + 0.4);
    assert.equal(f.sm, undefined, 'thawed');
    assert.ok(r.sim.events.length >= 0);
    // storm: the whole group in range at once
    r = rig('tesla', ['storm']);
    const group = [0, 1, 2, 3, 4, 5].map((i) => r.at(20 + (i % 3) * 14, (i >> 1) * 12 - 12));
    run(r.sim, 2);
    assert.ok(group.every((g) => g.hp < 1000), 'every one was struck');
    const plain = rig('tesla');
    const g2 = [0, 1, 2, 3, 4, 5].map((i) => plain.at(20 + (i % 3) * 14, (i >> 1) * 12 - 12));
    run(plain.sim, 0.6);
    assert.ok(g2.filter((g) => g.hp < 1000).length <= TUNING.blight.tesla.chain, 'an ordinary coil reaches only its chain');
});

test('the Spike Trap levels too: XP from bites, and its perks (power, wider, bleed, slow, lasting, barbs)', () => {
    let r = rig('spike', ['power', 'power']);
    const m = r.at(0, -2, 'skeleton', 1);
    m.x = (r.t.tx + 0.5) * TILE; m.y = (r.t.ty + 1) * TILE - 3;
    run(r.sim, 1);
    assert.ok(!r.sim.s.ents[m.id], 'bitten dead');
    assert.equal(r.t.xp, killXp(MOBS.skeleton.xp, false, false), 'the trap got the XP');
    const bite = (perks: string[], dx = 0) => { const q = rig('spike', perks); const x = q.at(dx, -3); x.x = (q.t.tx + 0.5) * TILE + dx; x.y = (q.t.ty + 1) * TILE - 3; const h = x.hp; for (let i = 0; i < 8; i++) { x.vx = x.vy = 0; q.sim.step(STEP); } return { q, x, d: h - x.hp }; };
    assert.ok(Math.abs(bite(['power', 'power']).d / bite([]).d - (1 + 2 * T.power)) < 1e-6);
    assert.ok(Math.abs(bite(['barbs']).d / bite([]).d - T.barbs) < 1e-6);
    assert.equal(bite([], TILE).d, 0, 'a monster beside the trap is safe...');
    assert.ok(bite(['wider'], TILE).d > 0, '...unless the spikes are wide');
    const bl = bite(['bleed']);
    const after = bl.x.hp;
    run(bl.q.sim, 2);
    assert.ok(bl.x.hp < after, 'it keeps bleeding');
    const sl = bite(['slow', 'lasting']);
    assert.ok((sl.x.sm ?? 1) < 1);
    run(sl.q.sim, T.slowSecs + 0.3);
    assert.ok((sl.x.sm ?? 1) < 1, 'lasting: still slowed after the normal time');
    run(sl.q.sim, T.slowSecs + 0.6);
    r = rig('spike');
    assert.ok(/^Bites/.test(defense.towerWords(r.t)));
});

test('what a tower says: a pick waiting is the first thing', () => {
    const { t } = rig('ballista', [], xpAt(2));
    assert.ok(/^Choose an upgrade/.test(defense.towerWords(t)));
    t.pk = ['power'];
    assert.ok(/^Guards/.test(defense.towerWords(t)));
});

test('the Ballista and Tesla Coil remember where they last shot (data/aim.ts): eight directions, the short way round', async () => {
    const { aimOf, dir8, noteShot, sinceShot, turnTo } = await import('../src/shared/data/aim');
    assert.equal(aimOf(5, 5), 0, 'east, the sea side, until it has shot');
    assert.deepEqual([0, 0.3, Math.PI / 2, 2.4, Math.PI, -2.4, -Math.PI / 2, -0.7, -Math.PI].map(dir8), [0, 0, 2, 3, 4, 5, 6, 7, 4]);
    noteShot(5, 5, Math.PI / 2, 1000);
    assert.equal(aimOf(5, 5), Math.PI / 2);
    assert.equal(aimOf(5, 6), 0, 'by tile');
    assert.equal(sinceShot(5, 5, 1300), 300);
    assert.ok(sinceShot(9, 9, 1300) > 1e6);
    assert.ok(Math.abs(turnTo(3, -3) - (2 * Math.PI - 6)) < 1e-9, 'across the half turn the short way');
    assert.ok(Math.abs(turnTo(0, 1) - 1) < 1e-9);
});

test('the Ballista follows the nearest raider before it fires, and glances about when none is near', async () => {
    const { aimOf, lookAt, sinceShot } = await import('../src/shared/data/aim');
    lookAt(30, 30, 1.2);
    assert.equal(aimOf(30, 30), 1.2, 'it turns without having fired');
    assert.ok(sinceShot(30, 30, 5000) > 1e6, 'looking is not a shot');
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/client/world/blight.ts', import.meta.url), 'utf8');
    assert.ok(/track \(views/.test(src) && /lookAt\(g\.tx, g\.ty, Math\.atan2/.test(src) && /this\.idle/.test(src));
    assert.ok(/blightFx\.track\(this\.visViews/.test(readFileSync(new URL('../src/client/scenes/Game.ts', import.meta.url), 'utf8')), 'the game scene calls it every frame');
});

test('a Spike Trap wears no level badge or pick star in the world (its window and prompt carry them); towers do', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/client/world/blight.ts', import.meta.url), 'utf8');
    assert.ok(/type !== 'spike'\) this\.badge/.test(src));
    assert.ok(/this\.stars\.push/.test(src));
});

test('regeneration: nothing while it was hit a moment ago, then a small share a second; Self-Mending ranks multiply it', () => {
    const heal = (perks: string[], secs: number) => { const r = rig('archer', perks); defense.hitBuilding(r.sim, r.t, 40); const h0 = r.t.hp!; run(r.sim, secs); return { r, got: (r.t.hp ?? defense.maxHp(r.t)) - h0 }; };
    assert.equal(heal([], T.regenDelay - 1).got, 0, 'no regeneration while it was hit a few seconds ago');
    const base = heal([], T.regenDelay + 11);
    assert.ok(base.got > 0 && base.got < 5, `then it mends a little (${base.got})`);
    // a fresh hit starts the wait again
    const r = rig('archer'); defense.hitBuilding(r.sim, r.t, 20); run(r.sim, T.regenDelay - 1); defense.hitBuilding(r.sim, r.t, 5); const h = r.t.hp!; run(r.sim, T.regenDelay - 1);
    assert.equal(r.t.hp, h, 'hit again: the timer starts over');
    // the rate: a full heal from nearly nothing in about four minutes
    const z = rig('archer'); z.t.hp = 1; run(z.sim, 235);
    assert.ok(z.t.hp !== undefined && z.t.hp < defense.maxHp(z.t), 'not quite yet at 235 s');
    run(z.sim, 25);
    assert.equal(z.t.hp, undefined, 'whole again within four and a bit minutes');
    // ranks of Self-Mending
    const rate = (n: number) => { const q = rig('archer', Array(n).fill('mending')); q.t.hp = 10; run(q.sim, T.regenDelay + 1); const h0 = q.t.hp; run(q.sim, 10); return (q.t.hp! - h0) / 10; };
    const r0 = rate(0), r1 = rate(1), r3 = rate(3);
    assert.ok(Math.abs(r1 / r0 - (1 + T.mendMul)) < 0.05, `rank 1 is x${r1 / r0}`);
    assert.ok(Math.abs(r3 / r0 - (1 + 3 * T.mendMul)) < 0.1, `rank 3 is x${r3 / r0}`);
    assert.equal(canTake('archer', ['mending', 'mending'], 'mending', 5), true);
    assert.equal(canTake('archer', ['mending', 'mending', 'mending'], 'mending', 5), false, 'three ranks at most');
    // walls mend too
    const w = rig('archer'); const wall = w.sim.add<BuildE>({ k: 'bld', kind: 'wall_stone', tx: w.t.tx + 5, ty: w.t.ty + 2, rot: 0, by: 'a' });
    defense.hitBuilding(w.sim, wall, 50); run(w.sim, T.regenDelay + 5);
    assert.ok(wall.hp! > 50, 'a wall regenerates');
    // the readout the window shows
    assert.ok(Math.abs(defense.regenPerSecond(r.t) - defense.maxHp(r.t) * T.regen) < 1e-9);
});

test('repair by hand: the cost scales with the missing health, Field Repairs cut it, and only a farmer who can pay and reach it may', () => {
    assert.deepEqual(repairCost('ballista', 0), {});
    assert.deepEqual(repairCost('ballista', 1), { ironbar: 3, gear: 2 });
    assert.deepEqual(repairCost('ballista', 0.5), { ironbar: 2, gear: 1 });
    assert.deepEqual(repairCost('tesla', 0.01), { wire: 1, ironbar: 1 }, 'always at least one of each');
    assert.deepEqual(repairCost('tower_archer', 1, ['repairs']), { plank: 3, stone: 4 }, 'Field Repairs: 30% less');
    assert.ok(repairCost('tower_archer', 1, ['repairs', 'repairs']).stone <= 2, 'two ranks');
    assert.ok(repairCost('wall_stone', 1).stone >= 1, 'a wall costs its own material');
    assert.equal(canTake('archer', ['repairs', 'repairs'], 'repairs', 3), false);
    assert.equal(canTake('spike', [], 'repairs', 3), true);
    // in the sim
    const r = rig('ballista');
    const send = (who: string, c: unknown) => r.sim.command(who, c as Cmd);
    defense.hitBuilding(r.sim, r.t, 60);                              // (of 120)
    const cost = defense.repairCostOf(r.t);
    assert.deepEqual(cost, { ironbar: 2, gear: 1 });
    r.p.inv = {};
    send('a', { t: 'towerrepair', id: r.t.id });
    assert.equal(r.t.hp, 60, 'no materials, no repair');
    r.sim.give(r.p, 'ironbar', 5); r.sim.give(r.p, 'gear', 5);
    send('a', { t: 'towerrepair', id: r.t.id });
    assert.equal(r.t.hp, undefined, 'whole again');
    assert.equal(countOf(r.p, 'ironbar'), 3); assert.equal(countOf(r.p, 'gear'), 4);
    send('a', { t: 'towerrepair', id: r.t.id });
    assert.equal(countOf(r.p, 'ironbar'), 3, 'a whole tower costs nothing');
    // a stranger far away cannot, one beside it can (and pays)
    const q = r.sim.join('b', 'B')!; q.x = r.p.x; q.y = r.p.y; r.sim.give(q, 'ironbar', 9); r.sim.give(q, 'gear', 9);
    defense.hitBuilding(r.sim, r.t, 60);
    send('b', { t: 'towerrepair', id: r.t.id });
    assert.equal(r.t.hp, 60, 'too far');
    const c = r.sim.center(r.t); q.x = c.x + 8; q.y = c.y;
    send('b', { t: 'towerrepair', id: r.t.id });
    assert.equal(r.t.hp, undefined);
    assert.equal(countOf(q, 'ironbar'), 7, 'the one who repairs pays');
    // using a hurt wall repairs it
    const wall = r.sim.add<BuildE>({ k: 'bld', kind: 'wall_wood', tx: r.t.tx + 2, ty: r.t.ty + 2, rot: 0, by: 'a' });
    defense.hitBuilding(r.sim, wall, 30);
    const planks = countOf(q, 'plank'); r.sim.give(q, 'plank', 5);
    q.x = (wall.tx + 0.5) * TILE + 6; q.y = (wall.ty + 1) * TILE;
    r.sim.command('b', { t: 'use', id: wall.id });
    assert.equal(wall.hp, undefined, 'a hurt wall mends when used');
    assert.ok(countOf(q, 'plank') < planks + 5);
    // hostile requests
    const before = JSON.stringify([r.t, wall]);
    for (const bad of [{}, { id: 'x' }, { id: NaN }, { id: -1 }, { id: 1e300 }, { id: null }, { id: [r.t.id] }, { id: '__proto__' }, { id: 0.5 }, { id: r.p.id }]) send('a', { t: 'towerrepair', ...bad });
    assert.equal(JSON.stringify([r.t, wall]), before);
});

test('the Lab\'s hurt button leaves every wall and tower at 40%, and regeneration then brings them back', () => {
    const r = rig('archer');
    const wall = r.sim.add<BuildE>({ k: 'bld', kind: 'wall_brick', tx: r.t.tx + 5, ty: r.t.ty + 2, rot: 0, by: 'a' });
    const n = defense.hurtAll(r.sim, T.hurtTo);
    assert.ok(n >= 2);
    assert.equal(r.t.hp, Math.floor(defense.maxHp(r.t) * 0.4));
    assert.equal(wall.hp, Math.floor(defense.maxHp(wall) * 0.4));
    run(r.sim, T.regenDelay - 1);
    assert.equal(wall.hp, Math.floor(defense.maxHp(wall) * 0.4), 'they wait a moment');
    run(r.sim, 30);
    assert.ok(wall.hp! > Math.floor(defense.maxHp(wall) * 0.4));
});
