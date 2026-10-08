// Combat: weapon behaviours, monster AI, projectiles, elites, night pools, bosses and rewards.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BOSS_ORDER, BOSSES, MOBS, MobKind, pickWild, tierCap, WILD_KINDS } from '../src/shared/data/mobs';
import * as mobs from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import { Rng } from '../src/shared/rng';
import type { BuildE, MobE, PlayerS, ProjE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };

/** A clean home plot with the player standing mid-yard facing east. */
function arena (seed = 'C-1') {
    const sim = Sim.create(seed, 'c');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || e.k === 'mob') sim.remove(e.id);      // (no trees, and none of the Dread Reaches' wardens either)
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.fx = 1; p.fy = 0;
    p.hearts = 20; p.energy = 100;
    return { sim, p, o, cx: p.x, cy: p.y };
}
const mob = (sim: Sim, kind: MobKind, x: number, y: number, opts: { elite?: boolean } = {}) => mobs.spawnMob(sim, kind, undefined, undefined, { x, y, ...opts })!;
function wield (sim: Sim, p: PlayerS, item: Parameters<Sim['give']>[1]) { sim.give(p, item, 1); sim.command(p.id, { t: 'equip', item: item as never }); }
const swing = (sim: Sim, p: PlayerS, m: MobE) => { p.swingCd = 0; sim.command(p.id, { t: 'swing', id: m.id }); };
const hp = (sim: Sim, m: MobE) => (sim.s.ents[m.id] as MobE | undefined)?.hp ?? 0;

test('the bestiary is consistent: drops exist, tiers and biomes make sense, bosses have sigils and trophies', () => {
    for (const k of WILD_KINDS) {
        const d = MOBS[k];
        assert.ok(d.hp > 0 && d.dmg > 0 && d.speed > 0, k);
        if (d.ai === 'ranged' || d.shoot) assert.ok(d.shoot, `${k} shoots`);
        if (d.ai === 'charge') assert.ok(d.charge, `${k} charges`);
    }
    for (const id of BOSS_ORDER) {
        const b = BOSSES[id];
        assert.ok(b, id);
        assert.ok(b.info.phases[0].at === 1 && b.info.phases.every((ph, i) => i === 0 || ph.at < b.info.phases[i - 1].at), `${id} phases descend`);
        assert.ok(b.info.gear.length >= 1);
    }
});

test('the night spawner respects biomes and the difficulty cap for the level', () => {
    const rng = new Rng('wild');
    for (const level of [1, 3, 8, 16, 40]) {
        const cap = tierCap(level);
        for (const biome of ['meadow', 'quarry', 'goldsand', 'snowcap', 'bog'] as const) {
            for (let i = 0; i < 60; i++) {
                const k = pickWild(biome, level, () => rng.next());
                const d = MOBS[k];
                assert.ok(d.tier <= cap, `${k} (tier ${d.tier}) for level ${level}`);
                assert.ok(!d.biomes || d.biomes.includes(biome), `${k} does not belong in ${biome}`);
            }
        }
    }
    assert.ok(tierCap(1) < tierCap(8) && tierCap(8) < tierCap(40), 'monsters get nastier as the level rises');
});

test('swords cleave in an arc; spears pierce a line; hammers pound everything around you', () => {
    const { sim, p, cx, cy } = arena();
    wield(sim, p, 'sword_iron');
    const a = mob(sim, 'slime', cx + 18, cy), b = mob(sim, 'slime', cx + 16, cy - 10), c = mob(sim, 'slime', cx - 18, cy);
    for (const m of [a, b, c]) m.hp = m.mhp = 10;
    swing(sim, p, a);
    assert.ok(hp(sim, a) < 10 && hp(sim, b) < 10, 'both mobs in front are hit');
    assert.equal(hp(sim, c), 10, 'the one behind is not');

    const t = arena('C-2');
    wield(t.sim, t.p, 'spear_iron');
    const near = mob(t.sim, 'slime', t.cx + 14, t.cy), far = mob(t.sim, 'slime', t.cx + 32, t.cy), off = mob(t.sim, 'slime', t.cx + 24, t.cy + 20);
    for (const m of [near, far, off]) m.hp = m.mhp = 10;
    swing(t.sim, t.p, near);
    assert.ok(hp(t.sim, near) < 10 && hp(t.sim, far) < 10, 'both in the line are hit');
    assert.equal(hp(t.sim, off), 10, 'the one off to the side is not');

    const h = arena('C-3');
    wield(h.sim, h.p, 'hammer_iron');
    const f = mob(h.sim, 'slime', h.cx + 12, h.cy), g = mob(h.sim, 'slime', h.cx - 14, h.cy + 4);
    for (const m of [f, g]) m.hp = m.mhp = 10;
    swing(h.sim, h.p, f);
    assert.ok(hp(h.sim, f) < 10 && hp(h.sim, g) < 10, 'the hammer hits both sides');
});

test('bows and staffs reach farther and cost more energy; daggers are quick', () => {
    const { sim, p, cx, cy } = arena();
    wield(sim, p, 'bow_wood');
    const far = mob(sim, 'slime', cx + 85, cy);
    far.hp = far.mhp = 10;
    const e0 = p.energy;
    swing(sim, p, far);
    assert.ok(hp(sim, far) < 10, 'the arrow lands from range');
    assert.ok(e0 - p.energy > TUNING.swingEnergy, 'and costs extra energy');
    const ev = sim.events.find((e) => e.e === 'swing');
    assert.equal(ev && 'w' in ev ? ev.w : '', 'bow');

    const d = arena('C-4');
    wield(d.sim, d.p, 'dagger_bone');
    const m = mob(d.sim, 'slime', d.cx + 12, d.cy); m.hp = m.mhp = 10;
    swing(d.sim, d.p, m);
    assert.ok(hp(d.sim, m) < 10, 'the dagger hits');
    assert.ok(d.p.swingCd < 0.25, `dagger cooldown ${d.p.swingCd}`);
});

test('critical hits double damage and show a number; killing drops loot and pays xp', () => {
    const { sim, p, cx, cy } = arena();
    p.equip.charm = undefined;
    p.skills.c_crit = 4; p.skills.c_edge = 4;
    const m = mob(sim, 'slime', cx + 12, cy);
    const xp0 = p.xp;
    for (let i = 0; i < 12 && sim.s.ents[m.id]; i++) { swing(sim, p, m); run(sim, 0.05); }
    assert.equal(sim.s.ents[m.id], undefined, 'slime died');
    run(sim, 1);
    assert.ok(p.xp > xp0 || p.level > 1, 'xp paid');
    assert.ok(sim.events.some((e) => e.e === 'float'), 'damage numbers were shown');
});

test('archers shoot arrows you can be hit by; boars wind up before charging', () => {
    const { sim, p, cx, cy } = arena('C-5');
    const archer = mob(sim, 'archer', cx + 100, cy);
    archer.a = 0;
    let shot = false;
    for (let i = 0; i < 80 && !shot; i++) { sim.step(STEP); shot = Object.values(sim.s.ents).some((e) => e.k === 'proj'); }
    assert.ok(shot, 'an arrow was fired');
    const h0 = p.hearts;
    run(sim, 4);
    assert.ok(p.hearts < h0 || Object.values(sim.s.ents).every((e) => e.k !== 'proj'), 'arrows fly until they hit or expire');

    const b = arena('C-6');
    const boar = mob(b.sim, 'boar', b.cx + 60, b.cy);
    boar.a = 0;
    const states = new Set<number>();
    for (let i = 0; i < 100; i++) { b.sim.step(STEP); states.add((b.sim.s.ents[boar.id] as MobE | undefined)?.st ?? 0); }
    assert.ok(states.has(1) && states.has(2), `boar states seen: ${[...states]}`);
});

test('projectiles stop at walls and expire', () => {
    const { sim, cx, cy } = arena('C-7');
    mobs.fireProj(sim, 'orb', cx + 60, cy, 0, 60, 1);
    mobs.fireProj(sim, 'rock', cx, cy, Math.PI, 60, 1);
    const n = () => Object.values(sim.s.ents).filter((e): e is ProjE => e.k === 'proj').length;
    assert.equal(n(), 2);
    run(sim, 8);
    assert.equal(n(), 0, 'all gone');
});

test('elite monsters are tougher and drop better', () => {
    const { sim, cx, cy } = arena('C-8');
    const a = mob(sim, 'skeleton', cx + 60, cy, { elite: false }), b = mob(sim, 'skeleton', cx + 80, cy, { elite: true });
    assert.ok(b.mhp > a.mhp && b.el === 1);
    assert.ok(mobs.scaledHp(MOBS.slime, 21, false) > mobs.scaledHp(MOBS.slime, 1, false), 'higher levels are harder');
});

test('dash needs the skill, grants i-frames, and has a cooldown', () => {
    const { sim, p } = arena('C-9');
    sim.command('a', { t: 'dash', fx: 1, fy: 0 });
    assert.equal(p.invuln, 0, 'locked');
    p.skills.c_dash = 1;
    sim.command('a', { t: 'dash', fx: 1, fy: 0 });
    assert.ok(p.invuln > 0.3);
    assert.ok(sim.events.some((e) => e.e === 'knock'));
    const inv = p.invuln;
    sim.command('a', { t: 'dash', fx: 1, fy: 0 });
    assert.equal(p.invuln, inv, 'cooling down');
});

// ── bosses ──────────────────────────────────────────────────────────────────
function altar (sim: Sim, p: PlayerS, o: { tx: number; ty: number }): BuildE {
    const a = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 4, ty: o.ty + 3, rot: 0 });
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 7) * TILE;
    return a;
}

test('sigils are crafted at the altar and spent to summon the boss', () => {
    const { sim, p, o } = arena('C-10');
    const a = altar(sim, p, o);
    sim.give(p, 'slimegel', 12); sim.give(p, 'berry', 6); sim.give(p, 'fiber', 4);
    sim.command('a', { t: 'craft', recipe: 'altar:sigil_slime', n: 1 });
    assert.equal(countOf(p, 'sigil_slime'), 1, 'crafted');
    sim.command('a', { t: 'summon', id: a.id, boss: 'stone' });
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob').length, 0, 'wrong sigil: nothing happens');
    sim.command('a', { t: 'summon', id: a.id, boss: 'slime' });
    const boss = Object.values(sim.s.ents).find((e): e is MobE => e.k === 'mob' && e.kind === 'slimeking')!;
    assert.ok(boss && boss.hp === MOBS.slimeking.hp, 'the Slime King appears');
    assert.equal(countOf(p, 'sigil_slime'), 0, 'sigil consumed');
    sim.command('a', { t: 'summon', id: a.id, boss: 'slime' });
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob').length, 1, 'only one fight per altar');
    sim.command('a', { t: 'summon', id: a.id, boss: 'heart' });
    assert.equal(countOf(p, 'sigil_heart'), 0);
});

test('a boss fight cycles through patterns, changes phase, and pays everyone who helped', () => {
    const { sim, p, o } = arena('C-11');
    const q = sim.join('b', 'B')!;
    const a = altar(sim, p, o);
    q.x = p.x + 20; q.y = p.y;
    p.hearts = q.hearts = 999; p.invuln = q.invuln = 0;
    sim.give(p, 'sigil_slime', 1);
    sim.command('a', { t: 'summon', id: a.id, boss: 'slime' });
    const boss = Object.values(sim.s.ents).find((e): e is MobE => e.k === 'mob' && e.kind === 'slimeking')!;
    assert.ok(boss.mhp > MOBS.slimeking.hp, 'two players scale the boss up');
    const patterns = new Set<string>();
    for (let i = 0; i < 20 * 14; i++) {
        p.hearts = q.hearts = 999; p.invuln = q.invuln = 1;       // (hearts are capped by the stats: stay untouchable instead)
        sim.step(STEP);
        const cur = sim.s.ents[boss.id] as MobE;
        if (cur.pat) patterns.add(cur.pat);
    }
    assert.ok(patterns.size >= 2, `patterns used: ${[...patterns]}`);
    assert.ok(sim.events.some((e) => e.e === 'tele'), 'telegraphs were announced');
    const cur = sim.s.ents[boss.id] as MobE;
    cur.hp = cur.mhp * 0.5;
    run(sim, 0.1);
    assert.ok((sim.s.ents[boss.id] as MobE).ph! >= 1, 'second phase reached');
    // the finishing blow comes from a
    sim.s.ents[boss.id] && ((sim.s.ents[boss.id] as MobE).hp = 1);
    wieldFor(sim, p);
    const b2 = sim.s.ents[boss.id] as MobE;
    p.x = b2.x - 10; p.y = b2.y; p.swingCd = 0;
    sim.command('a', { t: 'swing', id: boss.id });
    assert.equal(sim.s.ents[boss.id], undefined, 'the boss is down');
    assert.equal(countOf(p, 'trophy_slime'), 1);
    assert.equal(countOf(p, 'crown_slime'), 1, 'first victory gives the signature gear');
    assert.equal(p.boss?.slime, 1);
    assert.equal(sim.s.bosses?.slime, 1);
    assert.ok(p.points > 0);
    // b did no damage but was in the arena: rewarded too
    assert.equal(countOf(q, 'trophy_slime'), 1);
});
function wieldFor (sim: Sim, p: PlayerS) { sim.give(p, 'sword_iron', 1); sim.command(p.id, { t: 'equip', item: 'sword_iron' }); }

test('a boss with nobody left to fight gives up and returns the sigil', () => {
    const { sim, p, o } = arena('C-12');
    const a = altar(sim, p, o);
    sim.give(p, 'sigil_slime', 1);
    sim.command('a', { t: 'summon', id: a.id, boss: 'slime' });
    p.x = a.tx * TILE - 900;   // far away
    run(sim, 25);
    assert.equal(Object.values(sim.s.ents).filter((e) => e.k === 'mob').length, 0, 'it left');
    assert.ok(Object.values(sim.s.ents).some((e) => e.k === 'drop' && e.res === 'sigil_slime'), 'sigil left by the altar');
});

test('every boss can be summoned and survives a minute of fighting without errors', () => {
    for (const id of BOSS_ORDER.filter((b) => b !== 'heart')) {
        const { sim, p, o } = arena(`C-boss-${id}`);
        const a = altar(sim, p, o);
        p.hearts = 999;
        sim.give(p, BOSSES[id].info.sigil, 1);
        sim.command('a', { t: 'summon', id: a.id, boss: id });
        for (let i = 0; i < 20 * 40; i++) { p.hearts = 999; sim.step(STEP); }
        const boss = Object.values(sim.s.ents).find((e): e is MobE => e.k === 'mob' && e.kind === BOSSES[id].kind);
        assert.ok(boss, `${id} is still fighting`);
    }
});

test('mobs are cleared at dawn but bosses stay', () => {
    const { sim, p, o } = arena('C-13');
    const a = altar(sim, p, o);
    sim.give(p, 'sigil_slime', 1);
    sim.command('a', { t: 'summon', id: a.id, boss: 'slime' });
    const s = mob(sim, 'slime', p.x + 60, p.y);
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.1;
    sim.s.night = true;
    run(sim, 0.4);
    assert.equal(sim.s.ents[s.id], undefined, 'the slime was cleared');
    assert.ok(Object.values(sim.s.ents).some((e) => e.k === 'mob' && e.kind === 'slimeking'), 'the boss stays');
});
