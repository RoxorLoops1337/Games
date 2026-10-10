// Co-op boss statuses: Frozen, Hexed and Tethered (the data is data/costatus.ts). A boss lays one with a pattern that needs teammates
// (boss.ts: `freeze`, `hex`, `chain`), and only while two or more farmers are up in its arena; with a lone farmer it fights the old
// fight. A status is a small JSON record on the farmer (`PlayerS.co`, one at a time, public so friends see it, never saved: a loaded
// world strips it), ticked here every step. It ends when its boss is gone, when the farmer is downed, leaves or goes home, when the
// expedition ends, or by itself, and nothing here may crash because the boss, the farmer or the partner is suddenly not there.
//
//   Frozen   cannot move, swing, dig, use or dash and cannot be hurt. A friend beside you holding E thaws you in `thawSeconds`
//            (the same hold-to-revive command); alone you thaw by yourself in `frostSelf`, or `frostAlone` when nobody else is up.
//   Hexed    a tick of damage every second that grows the longer the curse lives; standing beside another farmer for `hexHold`
//            passes it on (the carrier is cured). It fades after `hexSeconds`, or `hexAlone` for a carrier on their own.
//   Tether   two farmers chained for `chainSeconds`: beyond `chainTiles` the chain pulls both and hurts both every second.
// A curse or a chain wounds but never fells (`floor`), and everything ends gently: nobody is ever stuck.

import { TUNING } from '../config';
import { CHAIN_LEN, CO_INFO, COOP_PATTERNS, hexTick, type CoKind, type CoStatus } from '../data/costatus';
import { type CoPattern, MOBS } from '../data/mobs';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as fishing from './fishing';
import type { Sim } from './sim';
import type { Cmd, MobE, PlayerS } from './types';

const K = TUNING.coop;

/** The arena of an expedition guardian (it has no altar: the fight is wherever it stands). */
export const GUARDIAN_ARENA = 140;
const arenaOf = (e: MobE) => MOBS[e.kind].boss?.arena ?? GUARDIAN_ARENA;

/** What a frozen farmer cannot ask for (the menus, eating and gear still work). */
const BLOCKED = new Set<Cmd['t']>(['move', 'swing', 'dig', 'use', 'dash', 'art', 'revive', 'fish', 'tame', 'summon', 'travel']);
export const blocks = (p: PlayerS, c: Cmd) => p.co?.k === 'frozen' && BLOCKED.has(c.t);

// ── who and where ───────────────────────────────────────────────────────────
/** The boss that laid a status, if it is still about. */
const bossOf = (sim: Sim, c: { b: number }): MobE | undefined => { const e = c.b ? sim.s.ents[c.b] : undefined; return e && e.k === 'mob' ? e : undefined; };
const homeOf = (e: MobE) => ({ x: e.hx ?? e.x, y: e.hy ?? e.y });

/** The farmers up and in a boss's arena (the same circle the boss fights in, with the margin it uses). */
function farmersIn (sim: Sim, boss: MobE): PlayerS[] {
    const h = homeOf(boss), r = arenaOf(boss) + 40;
    return sim.online.filter((q) => q.downed <= 0 && dist(q.x, q.y, h.x, h.y) <= r);
}

const isFree = (p: PlayerS) => !p.co;
export const free = (players: PlayerS[]) => players.filter(isFree);

/** May this boss lay this kind of status right now? Two or more free farmers up in the arena, and no curse or chain of its own still on. */
export function canLay (sim: Sim, boss: MobE, players: PlayerS[], pattern: CoPattern): boolean {
    if (free(players).length < 2) return false;
    const kind = COOP_PATTERNS[pattern].status;
    if (kind === 'frozen') return players.filter((q) => q.co?.k === 'frozen').length < Math.max(1, players.length - 2);      // (never most of the party at once)
    return !Object.values(sim.s.players).some((q) => q.co?.k === kind && q.co.b === boss.id);
}

// ── runtime timers (not saved: a loaded world starts without any status) ───
interface Timers { tick: number; touch: number; cool: number; tug: number; pull: number; taut: boolean }
const memory = new WeakMap<Sim, Map<string, Timers>>();
function timers (sim: Sim, id: string): Timers {
    let m = memory.get(sim);
    if (!m) { m = new Map(); memory.set(sim, m); }
    let t = m.get(id);
    if (!t) { t = { tick: K.hexEvery, touch: 0, cool: 0, tug: 0, pull: 0, taut: false }; m.set(id, t); }
    return t;
}
const forget = (sim: Sim, id: string) => { memory.get(sim)?.delete(id); };

// ── laying a status ─────────────────────────────────────────────────────────
function say (sim: Sim, p: PlayerS, boss: MobE | undefined, kind: CoKind, others: string) {
    const info = CO_INFO[kind];
    sim.banner(info.warn, info.how, info.color, p.id);
    sim.float(p.x, p.y - 24, info.warn, info.color, p.id, 'co');
    // the rest of the fight sees who needs them
    for (const q of boss ? farmersIn(sim, boss) : sim.online) if (q.id !== p.id) sim.banner(`${p.name} ${others}`, undefined, info.color, q.id);
}

/** Freeze a farmer solid. False when they already carry a status (or are down). */
export function freeze (sim: Sim, p: PlayerS, boss: MobE | undefined): boolean {
    if (p.co || p.downed > 0 || !p.online) return false;
    const now = sim.s.time;
    p.co = { k: 'frozen', b: boss?.id ?? 0, s: now, u: now + K.frostSelf };
    p.moving = false;
    p.warp++;                                       // the client stops exactly where the world has them
    fishing.stop(p);
    sim.fx('freeze', p.x, p.y - 8, p.id);
    say(sim, p, boss, 'frozen', 'is frozen! Stand next to them and hold E');
    return true;
}

/** Lay a curse on a farmer. */
export function hex (sim: Sim, p: PlayerS, boss: MobE | undefined): boolean {
    if (p.co || p.downed > 0 || !p.online) return false;
    const now = sim.s.time, others = (boss ? farmersIn(sim, boss) : sim.online.filter((q) => q.downed <= 0)).some((q) => q.id !== p.id);
    p.co = { k: 'hexed', b: boss?.id ?? 0, s: now, u: now + (others ? K.hexSeconds : K.hexAlone) };
    const t = timers(sim, p.id);
    t.tick = K.hexEvery; t.touch = 0; t.cool = K.hexCool;
    sim.fx('hex', p.x, p.y - 8, p.id);
    say(sim, p, boss, 'hexed', 'is hexed! Stay close so they can pass it on');
    return true;
}

/** Chain two farmers together. */
export function bind (sim: Sim, a: PlayerS, b: PlayerS, boss: MobE | undefined): boolean {
    if (a === b || a.co || b.co || a.downed > 0 || b.downed > 0 || !a.online || !b.online) return false;
    const now = sim.s.time;
    a.co = { k: 'tether', b: boss?.id ?? 0, s: now, u: now + K.chainSeconds, w: b.id };
    b.co = { k: 'tether', b: boss?.id ?? 0, s: now, u: now + K.chainSeconds, w: a.id };
    for (const p of [a, b]) { const t = timers(sim, p.id); t.taut = false; t.tug = 0; t.pull = 0; }
    sim.fx('chain', a.x, a.y - 8, a.id);
    sim.fx('chain', b.x, b.y - 8, b.id);
    for (const [p, q] of [[a, b], [b, a]]) {
        const info = CO_INFO.tether;
        sim.banner(`Chained to ${q.name}!`, info.how, info.color, p.id);
        sim.float(p.x, p.y - 24, info.warn, info.color, p.id, 'co');
    }
    return true;
}

// ── what the boss patterns call ─────────────────────────────────────────────
/** Everyone free inside the blast at (x, y) is frozen, but never the last free farmer, so somebody can always thaw the rest. Returns how many. */
export function freezeAt (sim: Sim, boss: MobE, players: PlayerS[], x: number, y: number): number {
    const cand = free(players).filter((q) => q.invuln <= 0 && Math.hypot(q.x - x, q.y - 4 - y) <= K.freezeRadius + 4)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    let left = free(players).length - 1, n = 0;
    for (const q of cand) { if (left <= 0) break; if (freeze(sim, q, boss)) { n++; left--; } }
    return n;
}

/** The curse bolt lands at (x, y): the nearest free farmer inside it is hexed (one curse at a time per boss). */
export function hexAt (sim: Sim, boss: MobE, players: PlayerS[], x: number, y: number): boolean {
    if (!canLay(sim, boss, players, 'hex')) return false;
    const v = free(players).filter((q) => q.invuln <= 0 && Math.hypot(q.x - x, q.y - 4 - y) <= K.hexRadius + 4)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    return v ? hex(sim, v, boss) : false;
}

/** The two free farmers nearest the boss, if there are two. */
export function nearestPair (boss: MobE, players: PlayerS[]): [PlayerS, PlayerS] | null {
    const c = free(players).sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y));
    return c.length >= 2 ? [c[0], c[1]] : null;
}

/** The chain snaps onto the two free farmers nearest the boss. */
export function bindNearest (sim: Sim, boss: MobE, players: PlayerS[]): boolean {
    if (!canLay(sim, boss, players, 'chain')) return false;
    const pair = nearestPair(boss, players);
    return pair ? bind(sim, pair[0], pair[1], boss) : false;
}

// ── a friend thaws you ──────────────────────────────────────────────────────
/** One tick of a friend holding E beside a frozen farmer (the revive command, answered here). Progress fades when the hold stops. */
export function thaw (sim: Sim, helper: PlayerS, t: PlayerS) {
    const c = t.co;
    if (!c || c.k !== 'frozen' || helper.co?.k === 'frozen') return;
    if (dist(t.x, t.y, helper.x, helper.y) > TUNING.reviveRange) return;
    const last = sim.reviveMsgAt[helper.id] ?? -1;
    c.th = (c.th ?? 0) + Math.min(0.15, Math.max(0, sim.s.time - last));
    sim.reviveMsgAt[helper.id] = sim.s.time;
    sim.reviveAt[t.id] = sim.s.time;
    if (c.th >= K.thawSeconds) thawed(sim, t, helper);
}

function thawed (sim: Sim, p: PlayerS, by?: PlayerS) {
    clear(sim, p);
    p.invuln = Math.max(p.invuln, 1);                // (a moment to step out of whatever is coming)
    sim.fx('thaw', p.x, p.y - 8, p.id);
    if (by) {
        by.stats.revives++;
        sim.banner(`${by.name} thawed you!`, undefined, PAL.lime, p.id);
        sim.float(by.x, by.y - 22, `Thawed ${p.name}`, PAL.lime, by.id);
    } else sim.float(p.x, p.y - 22, 'Thawed', PAL.foam, p.id);
}

// ── ending ──────────────────────────────────────────────────────────────────
/** Take a status off a farmer (and the other end of a chain). Quiet: whoever calls says why. */
export function clear (sim: Sim, p: PlayerS) {
    const c = p.co;
    if (!c) return;
    delete p.co;
    forget(sim, p.id);
    const q = c.k === 'tether' && c.w ? sim.s.players[c.w] : undefined;
    if (q?.co?.k === 'tether' && q.co.w === p.id) { delete q.co; forget(sim, q.id); }
}

/** A boss is gone (beaten, or it slunk away): everything it laid goes with it. */
export function clearBoss (sim: Sim, bossId: number) {
    for (const p of Object.values(sim.s.players)) if (p.co && p.co.b === bossId) { const k = p.co.k; clear(sim, p); if (p.online) sim.float(p.x, p.y - 22, k === 'frozen' ? 'Thawed' : 'Free', CO_INFO[k].color, p.id, 'co'); }
}

/** A saved world is never loaded in the middle of an effect. */
export function strip (p: PlayerS) { delete p.co; }

function release (sim: Sim, p: PlayerS, text: string) {
    const kind = p.co?.k ?? 'hexed', mate = p.co?.k === 'tether' && p.co.w ? sim.s.players[p.co.w] : undefined;
    clear(sim, p);
    for (const q of mate?.online ? [p, mate] : [p]) {
        sim.fx('unbind', q.x, q.y - 8, q.id);
        sim.float(q.x, q.y - 22, text, CO_INFO[kind].color, q.id, 'co');
    }
}

/** A curse or a chain costs hearts but never the last of them. (God mode in the developer menu is never hurt.) */
function drain (sim: Sim, p: PlayerS, amount: number, fx: 'hexTick' | 'chainTug') {
    if (p.buffs.some((b) => b.id === 'devgod')) return;
    if (p.hearts > K.floor) p.hearts = Math.max(K.floor, p.hearts - amount);
    sim.fx(fx, p.x, p.y - 8, p.id);
}

// ── the clock ───────────────────────────────────────────────────────────────
export function update (sim: Sim, dt: number) {
    for (const p of sim.online) {
        const c = p.co;
        if (!c) continue;
        const boss = bossOf(sim, c);
        // the fight is over for this status: its boss is gone, the farmer fell or left the arena, or the expedition ended
        if (p.downed > 0 || (c.b && (!boss || p.rift?.arena !== boss.rift))) { clear(sim, p); continue; }
        if (boss) { const h = homeOf(boss); if (dist(p.x, p.y, h.x, h.y) > arenaOf(boss) + 160) { clear(sim, p); continue; } }
        if (c.k === 'frozen') frozenStep(sim, p, c, boss, dt);
        else if (c.k === 'hexed') hexStep(sim, p, c, boss, dt);
        else tetherStep(sim, p, c, dt);
    }
}

/** The other farmers who could help (or take a curse) right now. */
const helpers = (sim: Sim, p: PlayerS, boss: MobE | undefined) => (boss ? farmersIn(sim, boss) : sim.online.filter((q) => q.downed <= 0)).filter((q) => q.id !== p.id);

function frozenStep (sim: Sim, p: PlayerS, c: CoStatus, boss: MobE | undefined, dt: number) {
    const now = sim.s.time;
    p.moving = false;
    const alone = !helpers(sim, p, boss).length;
    const end = c.s + (alone ? K.frostAlone : K.frostSelf);
    if (now >= end) { thawed(sim, p); return; }
    if (c.u !== end) c.u = end;
    // thawing is only progress while a friend keeps holding on
    if (c.th && now - (sim.reviveAt[p.id] ?? -9) > 0.4) { c.th = Math.max(0, c.th - dt); if (c.th <= 0) delete c.th; }
}

function hexStep (sim: Sim, p: PlayerS, c: CoStatus, boss: MobE | undefined, dt: number) {
    const now = sim.s.time, t = timers(sim, p.id);
    const others = helpers(sim, p, boss), alone = !others.length;
    if (alone && c.u > c.s + K.hexAlone) c.u = c.s + K.hexAlone;          // on your own it is cut short, and it ticks gently
    if (now >= c.u) { release(sim, p, 'The curse fades'); return; }
    t.tick -= dt;
    if (t.tick <= 0) { t.tick += K.hexEvery; drain(sim, p, hexTick(now - c.s, alone), 'hexTick'); }
    // standing beside a friend for a moment passes it on
    t.cool = Math.max(0, t.cool - dt);
    const near = others.filter((q) => !q.co && Math.hypot(q.x - p.x, q.y - p.y) <= K.hexTouch).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (near && t.cool <= 0) {
        t.touch += dt;
        if (t.touch >= K.hexHold) jump(sim, p, near, c);
    } else t.touch = Math.max(0, t.touch - dt * 2);
}

/** The curse leaps to a friend: the same curse (same age, same end), and the carrier is cured. */
function jump (sim: Sim, from: PlayerS, to: PlayerS, c: CoStatus) {
    const keep = timers(sim, from.id).tick;
    to.co = { ...c };
    delete from.co;
    forget(sim, from.id);
    const t = timers(sim, to.id);
    t.tick = keep; t.touch = 0; t.cool = K.hexCool;
    sim.fx('hexJump', from.x, from.y - 8, from.id);
    sim.fx('hexJump', to.x, to.y - 8, to.id);
    sim.float(from.x, from.y - 22, 'Passed it on!', PAL.lime, from.id, 'co');
    sim.float(to.x, to.y - 24, 'Hexed!', CO_INFO.hexed.color, to.id, 'co');
    sim.banner(`${from.name} passed the curse to you!`, CO_INFO.hexed.how, CO_INFO.hexed.color, to.id);
}

function tetherStep (sim: Sim, p: PlayerS, c: CoStatus, dt: number) {
    const now = sim.s.time, q = c.w ? sim.s.players[c.w] : undefined;
    // a chain needs both ends: if the other one is gone (left, down, cleared) it falls away
    if (!q || !q.online || q.downed > 0 || q.co?.k !== 'tether' || q.co.w !== p.id) { release(sim, p, 'The chain falls away'); return; }
    if (now >= c.u) { release(sim, p, 'The chain breaks'); return; }
    if (p.id > q.id) return;                                              // (the pair is looked after once)
    const d = dist(q.x, q.y, p.x, p.y), t = timers(sim, p.id);
    if (d <= CHAIN_LEN) { t.taut = false; return; }
    if (!t.taut) { t.taut = true; t.tug = 0.5; t.pull = 0; }              // (half a second to step back before it bites)
    t.pull -= dt;
    if (t.pull <= 0) {
        t.pull = 0.25;
        const over = Math.min(1, (d - CHAIN_LEN) / CHAIN_LEN), v = K.chainPull * (0.6 + 0.8 * over), ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
        sim.events.push({ e: 'knock', to: p.id, vx: ux * v, vy: uy * v, soft: 1 });
        sim.events.push({ e: 'knock', to: q.id, vx: -ux * v, vy: -uy * v, soft: 1 });
    }
    t.tug -= dt;
    if (t.tug <= 0) {
        t.tug += K.chainEvery;
        drain(sim, p, K.chainDmg, 'chainTug');
        drain(sim, q, K.chainDmg, 'chainTug');
    }
}
