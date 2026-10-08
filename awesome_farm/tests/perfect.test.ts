// The Perfect dash: a dash whose invulnerability soaks up a real attack gives the energy back, a buff that makes the next hit
// on a monster a critical one, and a fanfare. Once per dash, never for a dash at nothing, and every farmer on their own.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { ACTIONS } from '../src/shared/actions';
import { BUFFS } from '../src/shared/data/stats';
import { HINTS } from '../src/shared/data/hints';
import { MOBS } from '../src/shared/data/mobs';
import * as mobs from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { MobE, NodeE, PlayerS, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += STEP) sim.step(STEP); };
const dash = (sim: Sim, p: PlayerS) => sim.command(p.id, { t: 'dash', fx: 1, fy: 0 });
const perfects = (sim: Sim, who?: string) => sim.events.filter((e): e is Extract<SimEvent, { e: 'fx' }> => e.e === 'fx' && e.fx === 'perfect' && (!who || e.by === who));
const buff = (p: PlayerS) => p.buffs.find((b) => b.id === 'perfect');

/** A clean home yard with a farmer who has the Dash skill, plenty of hearts and energy to spare. */
function yard (seed = 'PD-1') {
    const sim = Sim.create(seed, 'pd');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node' || e.k === 'mob') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.fx = 1; p.fy = 0;
    p.hearts = TUNING.startHearts; p.energy = 50; p.invuln = 0; p.skills.c_dash = 1;
    sim.events = [];
    return { sim, p, o, plot: sim.homePlot(p.slot).i };
}

/** The Stone Colossus on its own, about to start pattern number `pi` of its first phase (0 slam, 1 sweep, 2 rain). */
function colossus (sim: Sim, p: PlayerS, pi: number, dx = 24) {
    const def = MOBS.colossus;
    const b = sim.add<MobE>({ k: 'mob', kind: 'colossus', x: p.x + dx, y: p.y, hp: def.hp, mhp: def.hp, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, st: 0, ph: 0, pi, pt: 0, hx: p.x, hy: p.y, idle: 0 });
    return b;
}
/** Step until the boss is `at` seconds into its pattern `id`. */
function until (sim: Sim, b: MobE, id: string, at: number) {
    for (let i = 0; i < 400; i++) {
        const cur = sim.s.ents[b.id] as MobE;
        if (cur.pat === id && (cur.pt ?? 0) >= at) return;
        sim.step(STEP);
    }
    assert.fail(`the boss never got ${at}s into ${id}`);
}

// ── the rule ────────────────────────────────────────────────────────────────
test('dashing into a telegraphed boss slam is a Perfect dash: the cost back, the buff, the fanfare', () => {
    const { sim, p } = yard();
    const b = colossus(sim, p, 0);
    until(sim, b, 'slam', 0.45);                         // (the red circle is on the ground; the hit lands at 0.85)
    assert.ok(sim.events.some((e) => e.e === 'tele'), 'it was telegraphed');
    const energy = p.energy;
    sim.events = [];
    dash(sim, p);
    assert.equal(p.energy, energy - TUNING.dashEnergy, 'the dash cost its energy');
    assert.equal(buff(p), undefined, 'nothing yet: nothing has tried to hit me');
    run(sim, 0.6);
    assert.equal(p.hearts, TUNING.startHearts, 'the slam hit nobody');
    assert.equal(p.energy, energy, 'the energy came back, exactly what the dash cost');
    assert.ok(buff(p) && buff(p)!.t > TUNING.perfectSeconds - 0.7 && buff(p)!.t <= TUNING.perfectSeconds, 'the buff runs for about four seconds');
    assert.equal(perfects(sim, 'a').length, 1, 'one fanfare, for the farmer who did it');
    const c = yard();                                    // (the control: the very same slam, no dash)
    const cb = colossus(c.sim, c.p, 0);
    until(c.sim, cb, 'slam', 0.45);
    run(c.sim, 0.6);
    assert.ok(c.p.hearts < TUNING.startHearts, 'it really would have hit');
    assert.ok(sim.events.some((e) => e.e === 'float' && e.text === 'Perfect!'), 'and a floating Perfect!');
    assert.equal(p.cnt?.perfect, 1, 'counted for quests and medals');
});

test('a dash at nothing is not perfect: no reward, and the cost stays paid', () => {
    const { sim, p } = yard('PD-2');
    sim.events = [];
    const energy = p.energy;
    dash(sim, p);
    run(sim, 1);
    assert.equal(p.energy, energy - TUNING.dashEnergy);
    assert.equal(buff(p), undefined);
    assert.equal(perfects(sim).length, 0);
});

test('a slam that would have missed saves nobody: dashing near a telegraph but out of its reach is not perfect', () => {
    const { sim, p } = yard('PD-3');
    const b = colossus(sim, p, 0, 100);                  // (the slam reaches 54 px: the farmer is 100 px away, inside the arena)
    until(sim, b, 'slam', 0.45);
    dash(sim, p);
    run(sim, 0.6);
    assert.equal(buff(p), undefined);
    assert.equal(perfects(sim).length, 0);
    assert.equal(p.energy, 50 - TUNING.dashEnergy);
});

test('the dash window is the dash: a slam that lands after the invulnerability has run out is not perfect (and it hurts)', () => {
    const { sim, p } = yard('PD-4');
    const b = colossus(sim, p, 0);
    until(sim, b, 'slam', 0.1);                          // (0.75 s before the hit: the dash is long over by then)
    dash(sim, p);
    run(sim, 0.9);
    assert.equal(buff(p), undefined, 'too early');
    assert.ok(p.hearts < TUNING.startHearts, 'and the slam landed');
});

test('a dash that absorbs three hits pays once', () => {
    const { sim, p } = yard('PD-5');
    const energy = p.energy;
    dash(sim, p);
    for (let i = 0; i < 3; i++) mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);       // (three arrows sitting right on the farmer)
    sim.events = [];
    run(sim, 0.3);
    assert.equal(p.hearts, TUNING.startHearts, 'all three passed through');
    assert.equal(perfects(sim).length, 1, 'one fanfare');
    assert.equal(p.energy, energy, 'one refund, not three');
    assert.equal(p.buffs.filter((b) => b.id === 'perfect').length, 1, 'one buff');
});

test("the boss's own multi-hit pattern (a rain of boulders) pays once", () => {
    const { sim, p } = yard('PD-6');
    const b = colossus(sim, p, 2);                        // (rain: three impact points, the first right on the farmer)
    until(sim, b, 'rain', 0.6);
    sim.events = [];
    const energy = p.energy;
    dash(sim, p);
    run(sim, 0.6);
    assert.equal(p.hearts, TUNING.startHearts, 'the dash covered the whole volley');
    assert.equal(perfects(sim).length, 1);
    assert.equal(p.energy, energy);
    // the same volley without the dash does hit (so the dash is what saved it)
    const c = yard('PD-6');
    const cb = colossus(c.sim, c.p, 2);
    until(c.sim, cb, 'rain', 0.6);
    run(c.sim, 0.6);
    assert.ok(c.p.hearts < TUNING.startHearts, 'without a dash the boulders land');
    assert.equal(perfects(c.sim).length, 0);
});

test('a charging monster is something to dash through; a monster that merely bumps into you is not', () => {
    const def = MOBS.boar;
    assert.equal(def.ai, 'charge');
    const { sim, p } = yard('PD-7');
    const charger = mobs.spawnMob(sim, 'boar', undefined, undefined, { x: p.x + 30, y: p.y })!;
    charger.st = 2; charger.pt = 0; charger.dx = -1; charger.dy = 0; charger.vx = -def.charge!.speed; charger.vy = 0;
    sim.touch(charger);
    dash(sim, p);
    run(sim, 0.45);
    assert.equal(p.hearts, TUNING.startHearts, 'the charge went through');
    assert.equal(perfects(sim).length, 1, 'a Perfect dash');

    const q = yard('PD-8');
    const walker = mobs.spawnMob(q.sim, 'skeleton', undefined, undefined, { x: q.p.x + 8, y: q.p.y })!;
    dash(q.sim, q.p);
    run(q.sim, 0.4);
    assert.equal(q.p.hearts, TUNING.startHearts, 'it could not hurt a dashing farmer');
    assert.ok(q.sim.s.ents[walker.id], 'it was right there');
    assert.equal(perfects(q.sim).length, 0, 'but a monster walking into you is not an attack you read');
    assert.equal(buff(q.p), undefined);
});

test("a big body touching you (the boss's own bulk) is not an attack either", () => {
    const { sim, p } = yard('PD-9');
    const b = colossus(sim, p, 1, 4);                     // (standing on top of the farmer)
    b.pt = 5;                                             // (resting between patterns: only its bulk can touch)
    dash(sim, p);
    run(sim, 0.3);
    assert.equal(p.hearts, TUNING.startHearts, 'no damage mid-dash');
    assert.equal(perfects(sim).length, 0);
});

test('protection that is not the dash earns nothing: a fresh wake-up, or a dash while still protected from a hit', () => {
    const { sim, p } = yard('PD-10');
    p.invuln = 2;                                         // (woke up at home a moment ago)
    mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);
    run(sim, 0.3);
    assert.equal(perfects(sim).length, 0);
    assert.equal(buff(p), undefined);
    // hurt a moment ago, then dash: the hit's own invulnerability (1.2 s) covers the whole dash
    const q = yard('PD-11');
    q.sim.hurt(q.p, { x: q.p.x + 5, y: q.p.y }, 1);
    assert.ok(q.p.invuln > TUNING.dashInvuln);
    dash(q.sim, q.p);
    mobs.fireProj(q.sim, 'arrow', q.p.x, q.p.y - 5, 0, 0, 1);
    q.sim.events = [];
    run(q.sim, 0.3);
    assert.equal(perfects(q.sim).length, 0, 'the dash saved nobody: the hit already had');
    assert.equal(buff(q.p), undefined);
});

test('a dash with less than the cost in energy, or during its cooldown, does nothing at all', () => {
    const { sim, p } = yard('PD-12');
    p.energy = TUNING.dashEnergy - 1;
    dash(sim, p);
    assert.equal(p.invuln, 0, 'too tired');
    p.energy = 50;
    dash(sim, p);
    const win = { ...sim.perfectWin.a };
    dash(sim, p);
    assert.deepEqual(sim.perfectWin.a, win, 'cooling down: the window is the first dash');
    assert.equal(p.energy, 50 - TUNING.dashEnergy, 'and it cost nothing the second time');
});

test('a full tank is never overfilled by the refund', () => {
    const { sim, p } = yard('PD-13');
    p.energy = derived(p).maxEnergy;
    dash(sim, p);
    mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);
    run(sim, 0.2);
    assert.equal(perfects(sim).length, 1);
    assert.equal(p.energy, derived(p).maxEnergy);
});

// ── what the Perfect dash gives ─────────────────────────────────────────────
test('the buff expires after its four seconds', () => {
    const { sim, p } = yard('PD-14');
    dash(sim, p);
    mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);
    run(sim, 0.2);
    assert.ok(buff(p));
    run(sim, TUNING.perfectSeconds - 0.5);
    assert.ok(buff(p), 'still there at three and a half seconds');
    run(sim, 1);
    assert.equal(buff(p), undefined, 'gone');
});

test('the next swing at a monster is the critical one (twice the damage), and only that one', () => {
    const { sim, p } = yard('PD-15');
    sim.give(p, 'sword_iron', 1); sim.command('a', { t: 'equip', item: 'sword_iron' });
    const dmg = derived(p).weapon.dmg;
    const m = mobs.spawnMob(sim, 'slime', undefined, undefined, { x: p.x + 14, y: p.y })!;
    m.hp = m.mhp = 1000;
    p.buffs.push({ id: 'perfect', t: 4 });
    p.swingCd = 0; sim.command('a', { t: 'swing', id: m.id });
    const after1 = (sim.s.ents[m.id] as MobE).hp;
    assert.equal(after1, 1000 - dmg * 2, 'the first swing hits for double');
    assert.equal(buff(p), undefined, 'and spends the buff');
    assert.ok(sim.events.some((e) => e.e === 'fx' && e.fx === 'crit'), 'it shows as a critical hit');
    p.swingCd = 0; sim.command('a', { t: 'swing', id: m.id });
    assert.equal((sim.s.ents[m.id] as MobE).hp, after1 - dmg, 'the second swing is ordinary');
});

test('chopping a tree does not use up the critical hit', () => {
    const { sim, p, o, plot } = yard('PD-16');
    const tree = sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 7, ty: o.ty + 6, hp: 30, plot });
    p.buffs.push({ id: 'perfect', t: 4 });
    p.swingCd = 0; sim.command('a', { t: 'swing', id: tree.id });
    assert.ok(buff(p), 'a tree is not a monster');
});

test('a Perfect dash through a hit then a swing: the whole loop', () => {
    const { sim, p } = yard('PD-17');
    sim.give(p, 'sword_iron', 1); sim.command('a', { t: 'equip', item: 'sword_iron' });
    const b = colossus(sim, p, 0);
    until(sim, b, 'slam', 0.45);
    dash(sim, p);
    run(sim, 0.5);
    assert.ok(buff(p), 'perfect');
    const cur = sim.s.ents[b.id] as MobE;
    const before = cur.hp;
    p.x = cur.x - 12; p.y = cur.y; p.swingCd = 0;
    sim.command('a', { t: 'swing', id: b.id });
    assert.equal(before - (sim.s.ents[b.id] as MobE).hp, derived(p).weapon.dmg * 2, 'the swing at the boss is doubled');
});

// ── friends ─────────────────────────────────────────────────────────────────
test('two farmers are independent: only the one the slam would have hit is rewarded', () => {
    const { sim, p } = yard('PD-18');
    const q = sim.join('b', 'B')!;
    q.skills.c_dash = 1; q.hearts = TUNING.startHearts; q.energy = 50; q.invuln = 0;
    q.x = p.x + 160; q.y = p.y; q.warp++;                // (inside the arena, far from the slam)
    const b = colossus(sim, p, 0);
    until(sim, b, 'slam', 0.45);
    sim.events = [];
    dash(sim, p); dash(sim, q);
    run(sim, 0.6);
    assert.ok(buff(p) && !buff(q), 'only the farmer in the slam');
    assert.equal(p.energy, 50);
    assert.equal(q.energy, 50 - TUNING.dashEnergy, 'the other still paid for a dash at nothing');
    assert.equal(perfects(sim, 'a').length, 1);
    assert.equal(perfects(sim, 'b').length, 0);
});

test('two farmers who both dash into the same slam each get their own, once', () => {
    const { sim, p } = yard('PD-19');
    const q = sim.join('b', 'B')!;
    q.skills.c_dash = 1; q.hearts = TUNING.startHearts; q.energy = 50; q.invuln = 0;
    q.x = p.x + 6; q.y = p.y + 8; q.warp++;
    const b = colossus(sim, p, 0, 30);
    until(sim, b, 'slam', 0.45);
    sim.events = [];
    dash(sim, p); dash(sim, q);
    run(sim, 0.6);
    assert.ok(buff(p) && buff(q));
    assert.equal(perfects(sim, 'a').length, 1);
    assert.equal(perfects(sim, 'b').length, 1);
    assert.equal(p.energy, 50); assert.equal(q.energy, 50);
});

// ── the wiring ──────────────────────────────────────────────────────────────
test('the action, the buff and the first-time hint exist', () => {
    assert.ok((ACTIONS as readonly string[]).includes('perfect'));
    assert.ok(BUFFS.perfect && BUFFS.perfect.good && BUFFS.perfect.mods.crit === 1, 'a buff chip that makes a hit a sure critical one (the first swing at a monster spends it)');
    const { sim, p } = yard('PD-20');
    const hint = HINTS.find((h) => h.id === 'perfect')!;
    assert.ok(hint, 'a hint');
    assert.equal(hint.when({ me: p, prompt: '', windup: true }), true, 'with the dash and a monster winding up');
    assert.equal(hint.when({ me: p, prompt: '' }), false, 'not out of the blue');
    p.skills.c_dash = 0;
    assert.equal(hint.when({ me: p, prompt: '', windup: true }), false, 'not before the dash is learned');
    assert.ok(hint.text({ me: p, prompt: '' }, { fish: 'Q' }).includes('Dash through an attack at the last moment for a Perfect dash'));
    void sim;
});

test('hostile input: a dash with nonsense in it does nothing, and nobody is rewarded for it', () => {
    const { sim, p } = yard('PD-21');
    for (const bad of [{ fx: NaN, fy: NaN }, { fx: 0, fy: 0 }, { fx: Infinity, fy: 0 }, { fx: 'x', fy: {} }]) {
        sim.command('a', { t: 'dash', ...(bad as object) } as never);
    }
    sim.command('a', null as never); sim.command('a', { t: 'dash' } as never);
    sim.command('nobody', { t: 'dash', fx: 1, fy: 0 });
    assert.equal(p.energy, 50, 'nothing was paid');
    assert.equal(p.invuln, 0);
    assert.equal(sim.perfectWin.a, undefined, 'and no dash window was opened');
    mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);
    run(sim, 1);
    assert.ok(Number.isFinite(p.energy) && Number.isFinite(p.invuln) && Number.isFinite(p.hearts));
});

test('it all survives a save and a load: the buff is plain JSON, and a window left over is not needed', () => {
    const { sim, p } = yard('PD-22');
    dash(sim, p);
    mobs.fireProj(sim, 'arrow', p.x, p.y - 5, 0, 0, 1);
    run(sim, 0.2);
    assert.ok(buff(p));
    const copy = JSON.parse(JSON.stringify(sim.s));
    const again = new Sim(copy);
    const q = again.s.players.a;
    assert.ok(q.buffs.some((b) => b.id === 'perfect'), 'the buff came through the save');
    again.join('a', 'A');
    run(again, 0.1);
    assert.ok(again.s.players.a.buffs.some((b) => b.id === 'perfect'));
});
