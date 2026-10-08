// Co-op boss statuses: Frozen (a friend thaws you), Hexed (touch a friend to pass the curse on) and Tethered (a chain that hurts
// when two farmers stray apart). Staged with real altar bosses and two farmers; the rules are sim/costatus.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { CHAIN_LEN, CO_INFO, COOP_PATTERNS, hexTick } from '../src/shared/data/costatus';
import { BOSS_ORDER, BOSSES, MOBS, type PatternId } from '../src/shared/data/mobs';
import { RIFT_TIERS } from '../src/shared/data/rift';
import * as costatus from '../src/shared/sim/costatus';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { BuildE, MobE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const K = TUNING.coop;
const run = (sim: Sim, seconds: number, each?: () => void) => { for (let t = 0; t < seconds - 1e-9; t += STEP) { each?.(); sim.step(STEP); } };
type Knock = Extract<SimEvent, { e: 'knock' }>;

/** A home plot with an altar and its boss awake, and farmers a (and, unless `farmers` is 1, b) standing `gap` px apart. */
function stage (seed: string, boss: string, opts: { gap?: number; farmers?: number } = {}) {
    const sim = Sim.create(seed, 'co');
    const a = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || e.k === 'mob') sim.remove(e.id);      // (no trees, and none of the Dread Reaches' wardens either)
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 4, ty: o.ty + 3, rot: 0 });
    const farmers: PlayerS[] = [a];
    if ((opts.farmers ?? 2) >= 2) farmers.push(sim.join('b', 'B')!);
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 7) * TILE;
    sim.give(a, BOSSES[boss].info.sigil, 1);
    sim.command('a', { t: 'summon', id: altar.id, boss });
    const e = Object.values(sim.s.ents).find((m): m is MobE => m.k === 'mob' && m.kind === BOSSES[boss].kind)!;
    farmers.forEach((p, i) => { p.skills = { c_vit: 6 }; p.x = (o.tx + 6) * TILE + i * (opts.gap ?? 70); p.y = (o.ty + 9) * TILE; p.fx = 1; p.fy = 0; p.hearts = derived(p).maxHearts; p.energy = 100; });
    return { sim, a, b: farmers[1], e, o };
}
const boss = (sim: Sim, e: MobE) => sim.s.ents[e.id] as MobE | undefined;
const full = (p: PlayerS) => derived(p).maxHearts;
/** A farmer's status kind, read fresh (the compiler remembers what an earlier assert said about `p.co`). */
const kindOf = (p: PlayerS) => p.co?.k;
/** Make the boss start the pattern at index `i` of its phase `ph` on the next step. */
function cue (e: MobE, ph: number, i: number) { e.ph = ph; e.hp = e.mhp * [1, 0.5, 0.2][ph]; e.pat = undefined; e.pi = i; e.pt = 0.01; e.st = 0; }
/** Keep the boss resting far away (so only the status is looked at), and the farmers' hearts topped up unless a test is measuring them. */
const park = (sim: Sim, e: MobE) => () => { const g = boss(sim, e); if (g) { g.pat = undefined; g.pt = 9; g.st = 0; g.vx = 0; g.vy = 0; g.x = (g.hx ?? 0) + 330; g.y = (g.hy ?? 0) - 40; } };
const calm = (sim: Sim, e: MobE, ...ps: PlayerS[]) => { const away = park(sim, e); return () => { away(); for (const p of ps) if (!p.co) p.hearts = full(p); }; };

test('the three statuses are told in data: each has a pattern, a warning, a chip and numbers that match their words', () => {
    assert.deepEqual(Object.values(COOP_PATTERNS).map((p) => p.status).sort(), ['frozen', 'hexed', 'tether']);
    for (const kind of ['frozen', 'hexed', 'tether'] as const) {
        const i = CO_INFO[kind];
        assert.ok(i.name && i.warn.endsWith('!') && i.how.length > 10 && i.tip.length > 20, kind);
    }
    assert.ok(CO_INFO.frozen.tip.includes(`${K.thawSeconds} seconds`) && CO_INFO.frozen.tip.includes(`${K.frostSelf}`), 'the thaw times in the words are the real ones');
    assert.ok(CO_INFO.hexed.tip.includes(`${K.hexSeconds}`) && CO_INFO.tether.tip.includes(`${K.chainTiles} tiles`));
    assert.equal(CHAIN_LEN, K.chainTiles * TILE);
    // the curse gets worse with age, and a lone carrier's stays gentle
    assert.ok(hexTick(0, false) < hexTick(K.hexWorsen, false) && hexTick(K.hexWorsen, false) < hexTick(K.hexSeconds - 1, false));
    assert.equal(hexTick(10, true), K.hexAloneDmg);
    assert.ok(hexTick(K.hexSeconds, false) <= 1, 'even at its worst it is a tick, not a blow');
    // the brief's numbers
    assert.equal(K.thawSeconds, 1.5); assert.equal(K.frostSelf, 8); assert.equal(K.frostAlone, 3); assert.equal(K.hexSeconds, 12); assert.equal(K.hexAlone, 6); assert.equal(K.chainTiles, 7);
    assert.ok(K.thawSeconds < TUNING.reviveSeconds, 'thawing is quicker than a revive');
});

test('every co-op pattern in a boss or guardian phase has an ordinary pattern to fall back on, and every status is used somewhere', () => {
    const phases = [...BOSS_ORDER.map((id) => ({ who: id, phases: BOSSES[id].info.phases })), ...RIFT_TIERS.map((t) => ({ who: `rift ${t.id}`, phases: t.phases }))];
    const used = new Set<string>();
    for (const { who, phases: list } of phases) {
        for (const [i, ph] of list.entries()) {
            for (const id of ph.patterns) {
                if (!(id in COOP_PATTERNS)) continue;
                used.add(COOP_PATTERNS[id as keyof typeof COOP_PATTERNS].status);
                const stand: PatternId | undefined = ph.alone?.[id as keyof typeof COOP_PATTERNS];
                assert.ok(stand && !(stand in COOP_PATTERNS), `${who} phase ${i}: ${id} needs an ordinary stand-in for a lone farmer`);
            }
            assert.ok(ph.patterns.some((id) => !(id in COOP_PATTERNS)), `${who} phase ${i}: not all co-op`);
        }
    }
    assert.deepEqual([...used].sort(), ['frozen', 'hexed', 'tether']);
    // the opening phase of every boss is learned without a co-op pattern
    for (const id of BOSS_ORDER) assert.ok(BOSSES[id].info.phases[0].patterns.every((p) => !(p in COOP_PATTERNS)), `${id} opens the old way`);
});

// ── Frozen ──────────────────────────────────────────────────────────────────
test('the Frost Giant freezes one of two farmers solid with a blue warning first, never the last free one, and turns on the one still standing', () => {
    const { sim, a, b, e } = stage('CO-F1', 'frost');
    const g0 = boss(sim, e)!;
    // b (the one it will mark) stands west of the giant, a east and well clear of the blast
    b.x = g0.x - 40; b.y = g0.y + 30; a.x = g0.x + 130; a.y = g0.y + 30;
    cue(e, 1, 2);                                                        // phase two: slam, rain, FREEZE, summon
    run(sim, 1.5, () => { for (const p of [a, b]) p.hearts = full(p); });
    const hit = [a, b].filter((p) => p.co?.k === 'frozen');
    assert.equal(hit.length, 1, 'one is frozen, the other stands');
    const ice = hit[0], other = ice === a ? b : a;
    assert.equal(other.co, undefined);
    assert.equal(ice.co!.b, e.id, 'laid by the giant');
    assert.ok(sim.events.some((ev) => ev.e === 'tele' && ev.kind === 'frost'), 'a blue warning on the ground first');
    assert.ok(sim.events.some((ev) => ev.e === 'fx' && ev.fx === 'freeze' && ev.by === ice.id), 'a sound and a burst, for the one it landed on');
    assert.ok(sim.events.some((ev) => ev.e === 'banner' && ev.to === ice.id && ev.text === 'Frozen!'), 'a big warning for them');
    assert.ok(sim.events.some((ev) => ev.e === 'banner' && ev.to === other.id && /is frozen/.test(ev.text)), 'and one for their friend');
    // the giant goes for the farmer who can still fight, even though the frozen one is nearer
    const g = boss(sim, e)!;
    assert.ok(Math.hypot(g.x - ice.x, g.y - ice.y) < Math.hypot(g.x - other.x, g.y - other.y), 'the frozen one is nearer');
    for (let i = 0; i < 60 && !(g.pat === undefined && Math.hypot(g.vx, g.vy) > 1); i++) { for (const p of [a, b]) if (!p.co) p.hearts = full(p); sim.step(STEP); }
    assert.ok(Math.hypot(g.vx, g.vy) > 1, 'it walks again');
    assert.ok(g.vx * (other.x - g.x) + g.vy * (other.y - g.y) > g.vx * (ice.x - g.x) + g.vy * (ice.y - g.y), 'towards the free farmer');
    // two farmers in one blast: only one is frozen, so somebody can always thaw the other
    const t = stage('CO-F1b', 'frost', { gap: 8 });
    cue(t.e, 1, 2);
    run(t.sim, 1.5, () => { for (const p of [t.a, t.b]) if (!p.co) p.hearts = full(p); });
    assert.equal([t.a, t.b].filter((p) => p.co).length, 1, 'never both');
});

test('a frozen farmer cannot move, swing, dig, use or dash, cannot be hurt, and can still eat and open menus', () => {
    const { sim, a, b } = stage('CO-F2', 'frost', { gap: 40 });
    assert.ok(costatus.freeze(sim, b, undefined));
    const warp = b.warp, x = b.x, y = b.y;
    sim.command('b', { t: 'move', x: b.x + 20, y: b.y, fx: 1, fy: 0, moving: true });
    assert.equal(b.x, x, 'does not move'); assert.equal(b.y, y);
    b.skills.c_dash = 1;
    const energy = b.energy;
    sim.command('b', { t: 'dash', fx: 1, fy: 0 });
    assert.equal(b.invuln, 0, 'no dash'); assert.equal(b.energy, energy, 'and no energy spent on it');
    const h = b.hearts;
    sim.hurt(b, { x: b.x + 10, y: b.y }, 5);
    assert.equal(b.hearts, h, 'nothing can hurt a frozen farmer');
    assert.equal(b.invuln, 0, 'and a blow that did not land gives no i-frames either');
    sim.give(b, 'potion_heal', 1);
    b.hearts = 1;
    sim.command('b', { t: 'eat', item: 'potion_heal' });
    assert.ok(b.hearts > 1, 'a potion still works');
    sim.give(b, 'sword_iron', 1);
    sim.command('b', { t: 'equip', item: 'sword_iron' });
    assert.equal(b.equip.weapon, 'sword_iron', 'and so does changing gear');
    assert.equal(b.warp, warp, 'the client was snapped back once, when it froze, and not on every refused move');
    // the unfrozen friend is not affected
    sim.command('a', { t: 'move', x: a.x + 3, y: a.y, fx: 1, fy: 0, moving: true });
    assert.equal(a.x, (sim.s.players.a.x), 'a can still walk');
    assert.ok(Math.abs(a.x - (sim.world.plotOrigin(sim.homePlot(a.slot)).tx + 6) * TILE - 3) < 1e-9);
});

test('a friend beside a frozen farmer holds E for 1.5 seconds and thaws them; too far away, or holding too briefly, does nothing', () => {
    const { sim, a, b } = stage('CO-F3', 'frost', { gap: 300 });
    costatus.freeze(sim, b, undefined);
    for (let i = 0; i < 40; i++) sim.command('a', { t: 'revive', who: 'b' });
    assert.equal(b.co?.th ?? 0, 0, 'out of reach: nothing');
    a.x = b.x - 14; a.y = b.y;
    for (let i = 0; i < 4; i++) { sim.command('a', { t: 'revive', who: 'b' }); run(sim, 0.1); }       // a short hold…
    assert.ok((b.co?.th ?? 0) > 0 && b.co!.th! < K.thawSeconds, 'some progress');
    run(sim, 1.5);
    assert.ok(!b.co!.th, '… drains away when the friend lets go');
    let secs = 0;                                                         // a full hold: ten messages a second, as the client sends them
    while (b.co && secs < 3) { sim.command('a', { t: 'revive', who: 'b' }); run(sim, 0.1); secs += 0.1; }
    assert.equal(b.co, undefined, 'thawed');
    assert.ok(secs >= K.thawSeconds - 0.25 && secs <= K.thawSeconds + 0.25, `thawed after ${secs.toFixed(1)} s, not the 2.5 of a revive`);
    assert.ok(sim.events.some((ev) => ev.e === 'fx' && ev.fx === 'thaw' && ev.by === 'b'));
    assert.ok(sim.events.some((ev) => ev.e === 'banner' && ev.to === 'b' && /thawed you/.test(ev.text)));
    assert.equal(a.stats.revives, 1, 'it counts as helping a friend up');
    assert.ok(b.invuln > 0, 'a moment to step out of the way');
    const x = b.x;                                                        // and the farmer walks again
    sim.command('b', { t: 'move', x: b.x + 4, y: b.y, fx: 1, fy: 0, moving: true });
    assert.equal(b.x, x + 4);
    // a downed friend is still revived the old way (2.5 s)
    const c = stage('CO-F3b', 'frost', { gap: 10 });
    c.sim.down(c.b);
    let s2 = 0;
    while (c.b.downed > 0 && s2 < 4) { c.sim.command('a', { t: 'revive', who: 'b' }); run(c.sim, 0.1); s2 += 0.1; }
    assert.ok(s2 >= TUNING.reviveSeconds - 0.3 && c.b.downed === 0, `revived after ${s2.toFixed(1)} s`);
});

test('with no friend to help, a frozen farmer thaws by themselves in 8 seconds (3 when nobody else is up in the arena)', () => {
    const { sim, a, b, e } = stage('CO-F4', 'frost', { gap: 40 });
    costatus.freeze(sim, b, e);
    run(sim, K.frostSelf - 0.5, calm(sim, e, a));
    assert.ok(b.co, 'still frozen just before 8 s');
    run(sim, 1, calm(sim, e, a));
    assert.equal(b.co, undefined, 'thawed by itself');
    // nobody else alive in the arena: 3 s
    const t = stage('CO-F5', 'frost', { gap: 40 });
    costatus.freeze(t.sim, t.b, t.e);
    t.sim.down(t.a);                                                      // the friend falls
    assert.ok(t.a.downed > 0 && t.b.co, 'still frozen at the moment the friend falls');
    run(t.sim, K.frostAlone + 0.3, park(t.sim, t.e));
    assert.equal(t.b.co, undefined, 'a lone frozen farmer is free in 3 s');
    // a friend who leaves does the same, and one who stays far from the fight counts as gone
    const u = stage('CO-F6', 'frost', { gap: 40 });
    costatus.freeze(u.sim, u.b, u.e);
    u.sim.leave('a');
    run(u.sim, K.frostAlone + 0.3, park(u.sim, u.e));
    assert.equal(u.b.co, undefined);
    const w = stage('CO-F6b', 'frost', { gap: 40 });
    costatus.freeze(w.sim, w.b, w.e);
    w.a.x += 2000; w.a.warp++;
    run(w.sim, K.frostAlone + 0.3, park(w.sim, w.e));
    assert.equal(w.b.co, undefined);
});

test('a lone farmer meets the old Giant: no freeze, and its ordinary pattern stands in', () => {
    const { sim, a, e } = stage('CO-F7', 'frost', { farmers: 1 });
    cue(e, 1, 2);
    const seen = new Set<string>();
    run(sim, 8, () => { a.hearts = full(a); a.invuln = 1; const g = boss(sim, e); if (g?.pat) seen.add(g.pat); });
    assert.ok(!seen.has('freeze'), `patterns: ${[...seen]}`);
    assert.ok(seen.has('aimed'), 'aimed shots stand in for the freeze');
    assert.equal(a.co, undefined);
    assert.ok(!sim.events.some((ev) => ev.e === 'tele' && ev.kind === 'frost'));
});

// ── Hexed ───────────────────────────────────────────────────────────────────
test('the Witch curses one farmer; it ticks every second, gets worse, and fades by itself after 12 seconds', () => {
    const { sim, a, b, e } = stage('CO-H1', 'bog', { gap: 120 });
    cue(e, 1, 2);                                                         // phase two: aimed, spiral, HEX, summon
    run(sim, 1.5, () => { for (const p of [a, b]) if (!p.co) p.hearts = full(p); });
    const sick = [a, b].filter((p) => p.co?.k === 'hexed');
    assert.equal(sick.length, 1, 'one curse');
    const p = sick[0], other = p === a ? b : a;
    assert.ok(sim.events.some((ev) => ev.e === 'tele' && ev.kind === 'hex'), 'a purple warning first');
    assert.ok(sim.events.some((ev) => ev.e === 'fx' && ev.fx === 'hex' && ev.by === p.id));
    assert.ok(sim.events.some((ev) => ev.e === 'banner' && ev.to === p.id && ev.text === 'Hexed!'));
    // the friend keeps clear (but in the fight) and the witch keeps out of it: watch the curse tick
    p.x = e.hx! - 80; other.x = e.hx! + 80; p.y = other.y = e.hy! + 60;
    const t0 = p.co!.s, lost: number[] = [], away = park(sim, e);
    let last = p.hearts = full(p);
    for (let i = 0; i < 20 * 14 && p.co; i++) {
        away(); other.hearts = full(other);
        sim.step(STEP);
        if (p.hearts < last - 1e-6) lost.push(Math.round((last - p.hearts) * 100) / 100);
        if (p.hearts < 2) p.hearts = full(p);
        last = p.hearts;
    }
    assert.equal(p.co, undefined, 'it faded');
    const lived = sim.s.time - t0;
    assert.ok(lived >= K.hexSeconds - 0.2 && lived <= K.hexSeconds + 0.3, `lasted ${lived.toFixed(1)} s`);
    assert.ok(lost.length >= K.hexSeconds - 2 && lost.length <= K.hexSeconds, `${lost.length} ticks`);
    assert.ok(lost[lost.length - 1] > lost[0], `it got worse: ${lost.join(' ')}`);
    assert.ok(lost.every((x) => x >= K.hexDmg - 1e-6 && x <= 1), `small steps: ${lost.join(' ')}`);
    assert.ok(sim.events.some((ev) => ev.e === 'fx' && ev.fx === 'hexTick' && ev.by === p.id));
    assert.ok(sim.events.some((ev) => ev.e === 'fx' && ev.fx === 'unbind' && ev.by === p.id), 'and a soft sound when it fades');
});

test('standing next to a friend for a moment passes the curse on: the carrier is cured, and it cannot bounce straight back', () => {
    const { sim, a, b, e } = stage('CO-H2', 'bog', { gap: 200 });
    costatus.hex(sim, a, e);
    const until = a.co!.u;
    run(sim, K.hexCool + 0.1, calm(sim, e, a, b));
    assert.equal(a.co?.k, 'hexed', 'a friend at a distance: nothing');
    b.x = a.x + K.hexTouch - 4; b.y = a.y;                               // within about a tile
    const mark = sim.events.length;
    run(sim, K.hexHold - 0.15, calm(sim, e, a, b));
    assert.equal(a.co?.k, 'hexed', 'a brush is not enough');
    run(sim, 0.5, calm(sim, e, a, b));
    assert.equal(a.co, undefined, 'the carrier is cured');
    assert.equal(b.co?.k, 'hexed', 'and it is on the friend');
    assert.equal(b.co!.u, until, 'the same curse: it ends when it would have ended');
    assert.equal(b.co!.s, 0, 'and it is as old as it was');
    assert.ok(sim.events.slice(mark).some((ev) => ev.e === 'fx' && ev.fx === 'hexJump'));
    assert.ok(sim.events.slice(mark).some((ev) => ev.e === 'banner' && ev.to === 'b'));
    // standing still together does not bounce it back at once, but it does after the cool-down
    run(sim, K.hexCool - 0.8, calm(sim, e, a, b));
    assert.equal(kindOf(b), 'hexed', 'it stays for the cool-down');
    run(sim, 1.2, calm(sim, e, a, b));
    assert.equal(kindOf(a), 'hexed', 'and goes back, so a pair that stays together shares the pain');
    assert.equal(b.co, undefined);
    // a farmer with a status of their own cannot take it: a frozen friend is no place to dump a curse
    const t = stage('CO-H2b', 'bog', { gap: 10 });
    costatus.hex(t.sim, t.b, t.e);
    costatus.freeze(t.sim, t.a, t.e);
    run(t.sim, K.hexCool + K.hexHold + 0.5, calm(t.sim, t.e, t.b));
    assert.equal(t.b.co?.k, 'hexed');
    assert.equal(t.a.co?.k, 'frozen');
});

test('a curse wounds but never fells, and a lone carrier is hexed gently and only for 6 seconds', () => {
    const { sim, a, b, e } = stage('CO-H3', 'bog', { gap: 300 });
    costatus.hex(sim, a, e);
    a.hearts = 1;
    const away = park(sim, e);
    run(sim, K.hexSeconds + 1, () => { away(); b.hearts = full(b); });
    assert.ok(a.hearts >= K.floor - 1e-6 && a.downed === 0, `left with ${a.hearts} hearts, up`);
    assert.equal(a.co, undefined);
    // alone in the arena (the friend left the fight): 6 s, and gentle ticks
    const t = stage('CO-H4', 'bog', { gap: 40 });
    costatus.hex(t.sim, t.a, t.e);
    t.sim.leave('b');
    const start = t.sim.s.time, lost: number[] = [], hold = park(t.sim, t.e);
    let last = t.a.hearts = full(t.a);
    for (let i = 0; i < 20 * 9 && t.a.co; i++) {
        hold();
        t.sim.step(STEP);
        if (t.a.hearts < last - 1e-6) lost.push(Math.round((last - t.a.hearts) * 100) / 100);
        last = t.a.hearts;
    }
    assert.equal(t.a.co, undefined);
    const lived = t.sim.s.time - start;
    assert.ok(lived <= K.hexAlone + 0.3, `a lone curse lasted ${lived.toFixed(1)} s`);
    assert.ok(lost.length > 0 && lost.every((x) => x === K.hexAloneDmg), `gentle: ${lost.join(' ')}`);
    // a lone farmer is never cursed in the first place
    const u = stage('CO-H5', 'bog', { farmers: 1 });
    cue(u.e, 1, 2);
    run(u.sim, 8, () => { u.a.hearts = full(u.a); u.a.invuln = 1; });
    assert.equal(u.a.co, undefined);
    // god mode in the developer menu is never hurt by it
    const g = stage('CO-H6', 'bog', { gap: 300 });
    g.a.buffs.push({ id: 'devgod', t: 99 });
    costatus.hex(g.sim, g.a, g.e);
    const hearts = g.a.hearts;
    run(g.sim, 4, park(g.sim, g.e));
    assert.equal(g.a.hearts, hearts);
});

// ── Tethered ────────────────────────────────────────────────────────────────
test('the Colossus chains two farmers: nothing while they stay close, a pull and a hurt every second beyond 7 tiles', () => {
    const { sim, a, b, e } = stage('CO-T1', 'stone', { gap: 40 });
    cue(e, 1, 2);                                                          // phase two: slam, rain, CHAIN, sweep
    run(sim, 1.4, () => { for (const p of [a, b]) if (!p.co) p.hearts = full(p); });
    assert.equal(a.co?.k, 'tether'); assert.equal(b.co?.k, 'tether');
    assert.equal(a.co!.w, 'b'); assert.equal(b.co!.w, 'a');
    assert.ok(sim.events.some((ev) => ev.e === 'tele' && ev.kind === 'chain'), 'two warnings on the ground');
    assert.ok(sim.events.some((ev) => ev.e === 'banner' && ev.to === 'a' && /Chained to B/.test(ev.text)));
    assert.ok(Math.abs(a.co!.u - sim.s.time - K.chainSeconds) < 1.2, 'it lasts about 16 s');
    // close together: no harm
    const away = park(sim, e);
    const h = [a.hearts, b.hearts];
    run(sim, 3, away);
    assert.deepEqual([a.hearts, b.hearts], h, 'within 7 tiles the chain is slack');
    // stray: beyond the chain's length
    b.x = a.x + CHAIN_LEN + 20; b.y = a.y;
    const mark = sim.events.length;
    run(sim, 0.4, away);
    assert.deepEqual([a.hearts, b.hearts], h, 'half a second to step back before it bites');
    run(sim, 2.2, away);
    const ev = sim.events.slice(mark);
    assert.ok(ev.filter((x) => x.e === 'knock' && x.soft).length >= 8, 'it pulls both ends together, softly (a pull is not a blow)');
    const pullA = ev.find((x) => x.e === 'knock' && x.to === 'a') as Knock, pullB = ev.find((x) => x.e === 'knock' && x.to === 'b') as Knock;
    assert.ok(pullA.vx > 0 && pullB.vx < 0, 'towards each other');
    assert.ok(a.hearts < h[0] && b.hearts < h[1], 'and hurts both');
    assert.ok(ev.filter((x) => x.e === 'fx' && x.fx === 'chainTug' && x.by === 'a').length >= 2);
    assert.ok(Math.abs((h[0] - a.hearts) - (h[1] - b.hearts)) < 1e-9, 'the same for both');
    assert.ok(h[0] - a.hearts <= 1.6, `small: ${h[0] - a.hearts} hearts in 2.6 s`);
    // step back in: it stops
    b.x = a.x + 30;
    run(sim, 0.2, away);
    const now = a.hearts;
    run(sim, 2, away);
    assert.equal(a.hearts, now, 'slack again');
    // it falls away after its time
    run(sim, K.chainSeconds, away);
    assert.equal(a.co, undefined); assert.equal(b.co, undefined);
    assert.ok(sim.events.some((x) => x.e === 'fx' && x.fx === 'unbind'));
});

test('a chain needs two ends: it is never laid on a lone farmer, and falls away when the partner is down, gone, home, or the boss is', () => {
    const solo = stage('CO-T2', 'stone', { farmers: 1 });
    cue(solo.e, 1, 2);
    run(solo.sim, 6, () => { solo.a.hearts = full(solo.a); solo.a.invuln = 1; });
    assert.equal(solo.a.co, undefined, 'never applied to one farmer');
    assert.ok(!solo.sim.events.some((ev) => ev.e === 'tele' && ev.kind === 'chain'));
    for (const how of ['down', 'leave', 'bossgone', 'home', 'offline']) {
        const t = stage(`CO-T3-${how}`, 'stone', { gap: 40 });
        assert.ok(costatus.bind(t.sim, t.a, t.b, t.e));
        if (how === 'down') t.sim.down(t.b);
        if (how === 'leave') t.sim.leave('b');
        if (how === 'bossgone') { t.sim.forgetCredit(t.e.id); t.sim.remove(t.e.id); }
        if (how === 'home') t.sim.respawnHome(t.b);
        if (how === 'offline') t.b.online = false;
        run(t.sim, 0.2, park(t.sim, t.e));
        assert.equal(t.a.co, undefined, `${how}: the survivor is free`);
        assert.equal(t.b.co, undefined, `${how}: and so is the other end`);
    }
    // three farmers: the two nearest the boss are chained, the third is free
    const three = stage('CO-T4', 'stone', { gap: 40, farmers: 2 });
    const c = three.sim.join('c', 'C')!;
    c.skills = { c_vit: 6 }; c.x = three.a.x - 200; c.y = three.a.y; c.hearts = full(c);
    assert.ok(costatus.bindNearest(three.sim, three.e, [three.a, three.b, c]));
    assert.equal(c.co, undefined, 'the farthest is left out');
    assert.equal([three.a, three.b].filter((p) => p.co?.k === 'tether').length, 2);
});

// ── lifecycle and safety ────────────────────────────────────────────────────
test('every status ends when its boss dies, the farmer is downed, leaves or goes home, and a loaded world has none', () => {
    const kill = stage('CO-L1', 'frost', { gap: 40 });
    costatus.freeze(kill.sim, kill.b, kill.e);
    costatus.hex(kill.sim, kill.a, kill.e);
    kill.e.hp = 1;
    kill.sim.killMob(kill.e, kill.a);
    assert.equal(kill.a.co, undefined, 'the boss fell: the curse goes with it');
    assert.equal(kill.b.co, undefined, 'and the ice melts');
    const dn = stage('CO-L2', 'bog', { gap: 40 });                        // a curse that fells you is not carried into the down state
    costatus.hex(dn.sim, dn.a, dn.e);
    dn.sim.hurt(dn.a, { x: dn.a.x, y: dn.a.y }, 99);
    assert.ok(dn.a.downed > 0);
    assert.equal(dn.a.co, undefined);
    const sv = stage('CO-L3', 'frost', { gap: 40 });                      // leaving, and the saved world
    costatus.freeze(sv.sim, sv.b, sv.e);
    costatus.hex(sv.sim, sv.a, sv.e);
    const saved = JSON.parse(JSON.stringify(sv.sim.s));
    assert.ok(saved.players.a.co && saved.players.b.co, 'it is JSON: it would be saved');
    const back = new Sim(saved);
    assert.equal(back.s.players.a.co, undefined, 'a loaded world is never in the middle of an effect');
    assert.equal(back.s.players.b.co, undefined);
    sv.sim.leave('b');
    assert.equal(sv.b.co, undefined, 'leaving clears it');
    assert.equal(sv.sim.join('b', 'B')!.co, undefined);
});

test('hostile and odd input never throws: revive on strangers, a frozen farmer reviving, a boss that vanishes mid-pattern, stale boss ids', () => {
    const { sim, a, b, e } = stage('CO-X1', 'frost', { gap: 30 });
    cue(e, 1, 2);
    run(sim, 0.9, () => { for (const p of [a, b]) p.hearts = full(p); });          // the blast is in its wind-up
    sim.forgetCredit(e.id); sim.remove(e.id);                                       // the giant disappears before it lands
    run(sim, 2, () => { for (const p of [a, b]) p.hearts = full(p); });
    assert.equal(a.co ?? b.co, undefined, 'nothing was laid by a boss that is not there');
    costatus.freeze(sim, b, undefined);
    sim.command('b', { t: 'revive', who: 'a' });                                    // a frozen farmer cannot help
    for (const who of ['nobody', 'b', '__proto__', 'constructor', '']) sim.command('a', { t: 'revive', who });
    assert.equal(b.co?.th, undefined, 'the commands did nothing');
    assert.equal(costatus.freeze(sim, b, undefined), false, 'one status at a time');
    assert.equal(costatus.hex(sim, b, undefined), false);
    assert.equal(costatus.bind(sim, a, b, undefined), false);
    assert.equal(costatus.bind(sim, a, a, undefined), false, 'nobody is chained to themselves');
    costatus.clear(sim, b);
    b.co = { k: 'hexed', b: 99999, s: sim.s.time, u: sim.s.time + 99 };            // a stale boss id
    run(sim, 0.1);
    assert.equal(b.co, undefined, 'a curse with no boss is dropped');
    b.co = { k: 'tether', b: 0, s: sim.s.time, u: sim.s.time + 99, w: 'ghost' };    // a chain to nobody
    run(sim, 0.1);
    assert.equal(b.co, undefined, 'a chain to nobody is dropped');
    b.co = { k: 'tether', b: 0, s: sim.s.time, u: sim.s.time + 99, w: 'a' };        // a chain whose other end never agreed
    run(sim, 0.1);
    assert.equal(b.co, undefined);
    assert.equal(a.co, undefined);
});

test('a farmer who runs out of the arena, or into an expedition, sheds the status', () => {
    const { sim, a, b, e } = stage('CO-X2', 'bog', { gap: 40 });
    costatus.hex(sim, a, e);
    a.x += 900; a.warp++;
    run(sim, 0.1);
    assert.equal(a.co, undefined, 'out of the arena');
    costatus.hex(sim, b, e);
    b.rift = { arena: 1, tier: 0, wave: 1, waves: 4, ph: 1, left: 3, t: 0, party: 2, kills: 0 };
    run(sim, 0.1);
    assert.equal(b.co, undefined, 'a farmer in a run is not in this fight');
});

test('wardens and expedition guardians use the same patterns', () => {
    const sim = Sim.create('CO-W1', 'w');
    const wardens = Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && !!e.zone);
    assert.equal(wardens.length, 4);
    const coop = (kind: MobE['kind']) => MOBS[kind].boss!.phases.some((ph) => ph.patterns.some((p) => p in COOP_PATTERNS));
    assert.ok(wardens.filter((w) => coop(w.kind)).length >= 3, 'most wardens bring a pattern that needs the party');
    assert.ok(RIFT_TIERS.filter((t) => t.phases.some((ph) => ph.patterns.some((p) => p in COOP_PATTERNS))).length >= 3, 'so do several expedition guardians');
});

test('friends see a status on the wire: it rides in the farmer\'s public record, stays small, and goes away when it ends', async () => {
    const { SimHost } = await import('../src/shared/net/host');
    const { PROTOCOL } = await import('../src/shared/net/protocol');
    type Msg = { t: string; players?: { id: string; co?: unknown; rm?: string[] }[] };
    const sim = Sim.create('CO-N1', 'net');
    const host = new SimHost(sim, 'Test');
    const inbox = () => { const msgs: Msg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } }; };
    const pa = inbox(), pb = inbox();
    for (const [peer, id, name] of [[pa, 'a', 'Ann'], [pb, 'b', 'Bo']] as const) { host.attach(peer); host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name })); }
    host.update(0.2);
    const A = sim.s.players.a;
    costatus.freeze(sim, A, undefined);
    host.update(0.2);
    const seen = (peer: { msgs: Msg[] }) => peer.msgs.filter((m) => m.t === 'tick').flatMap((m) => m.players ?? []).filter((d) => d.id === 'a' && d.co);
    assert.equal((seen(pb).at(-1)?.co as { k: string }).k, 'frozen', 'a friend is told');
    assert.equal((seen(pa).at(-1)?.co as { k: string }).k, 'frozen', 'and so is the farmer');
    assert.ok(JSON.stringify(A.co).length < 80, 'a few bytes');
    const before = pb.msgs.length;
    for (let i = 0; i < 6; i++) host.update(0.1);
    const idle = pb.msgs.slice(before).flatMap((m) => m.players ?? []).filter((d) => d.id === 'a');
    assert.ok(idle.every((d) => !('co' in d)), 'standing frozen costs nothing more on the wire');
    costatus.clear(sim, A);
    host.update(0.2);
    const gone = pb.msgs.filter((m) => m.t === 'tick').flatMap((m) => m.players ?? []).filter((d) => d.id === 'a' && d.rm?.includes('co'));
    assert.ok(gone.length >= 1, 'and told when it is gone');
});

test('an expedition guardian chains a party of two, and leaving the run (or the guardian falling) sets them free', () => {
    const sim = Sim.create('CO-R1', 'rift');
    sim.cheats = true;
    const a = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 8) * TILE;
    const dock = sim.add<BuildE>({ k: 'bld', kind: 'dock', tx: o.tx + 5, ty: o.ty + 5, rot: 0, by: 'a' });
    const b = sim.join('p1', 'P1')!;
    b.x = a.x + 14; b.y = a.y;
    for (const p of [a, b]) { p.boss = { slime: 1, stone: 1 }; p.skills = { c_vit: 6 }; }
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 2 });             // the Hollow Rift: a knight in armour that chains
    assert.equal(sim.s.rifts![0].party.length, 2);
    const mobs = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob' && e.rift === 0);
    let guardian: MobE | undefined;
    for (let i = 0; i < 20 * 400 && !guardian; i++) {
        for (const p of [a, b]) { p.hearts = full(p); if (p.rift?.ph === 2 && p.rift.offer) sim.command(p.id, { t: 'rift', op: 'pick', i: 0 }); }
        for (const m of mobs()) if (!m.rb) sim.killMob(m, a);
        sim.step(STEP);
        guardian = mobs().find((m) => m.rb);
    }
    assert.ok(guardian, 'the guardian came');
    guardian!.hp = guardian!.mhp * 0.5;
    cue(guardian!, 1, 2);
    guardian!.hp = guardian!.mhp * 0.5;
    run(sim, 1.6, () => { for (const p of [a, b]) if (!p.co) p.hearts = full(p); });
    assert.equal(kindOf(a), 'tether', 'chained in the arena of the rift');
    assert.equal(kindOf(b), 'tether');
    assert.equal(a.co!.b, guardian!.id);
    // leaving the run frees the farmer who leaves, and the chain falls from the other end
    sim.command('p1', { t: 'rift', op: 'leave' });
    assert.equal(b.co, undefined, 'free on leaving');
    run(sim, 0.1);
    assert.equal(a.co, undefined, 'and the partner is not left holding a chain to nobody');
    // a curse from the guardian dies with it
    costatus.hex(sim, a, guardian);
    sim.killMob(guardian!, a);
    run(sim, 0.1);
    assert.equal(a.co, undefined, 'the guardian fell: the curse goes with it');
    sim.command('a', { t: 'rift', op: 'leave' });
});
