// The Defense Lab: a test arena for the towers, walls and the Blight's raids (`?lab=defense` on the solo page, never on a server).
//
// `create` makes a world of its own (a fixed seed, never saved by the client) with the farmer standing in a small walled yard in the
// middle of a flat island that is open to the sea on the east: a ring of mixed walls (wood, stone, brick, Fortified) with a doorway
// facing the sea, one of each tower just inside, a wind turbine and a pole for the Tesla Coil, spike traps outside the doorway, every
// skill and a stack of building materials. The lab's own developer ops (sim/dev.ts: `labWave`, `labNight`, `labMend`, `labClear`,
// `labSpeed`, `labReset`) only work in such a world (`sim.lab`), and only for a farmer the developer menu is open to.
// Waves are raiders (`MobE.rd`, sim/raid.ts): they march on the yard and break the walls in their way, exactly as a real raid does.
// The clock is held at noon or at midnight (`step`), so no night spawns, no dawn and no weather get in the way of a test.

import { TILE, TUNING } from '../config';
import { BUILDINGS, type BuildingKind } from '../data/buildings';
import type { ItemId } from '../data/items';
import { MOBS, type MobKind } from '../data/mobs';
import { levelOf, pending, towerType, xpAt } from '../data/towerperks';
import { CHAPTERS, MEDALS } from '../data/quests';
import { SKILL_LIST } from '../data/skills';
import { PAL } from '../palette';
import * as blight from './blight';
import * as defense from './defense';
import * as mobs from './mobs';
import * as quests from './quests';
import { Sim } from './sim';
import { addItem, derived, MAX_LEVEL } from './stats';
import type { BuildE, PlayerS, Plot } from './types';

export const LAB_SEED = 'DEFENSE-LAB';
/** The monsters a wave can be made of (the panel lists these, then `mixed`: all of them in turn). */
export const LAB_MOBS = ['slime', 'skeleton', 'bat', 'boar', 'archer'] as const satisfies readonly MobKind[];
export const LAB_COUNTS = [5, 10, 20, 40] as const;
/** Where a wave comes from: the four sides, or wading in from the open sea (the east) like a real raid. */
export const LAB_DIRS = ['n', 'e', 's', 'w', 'sea'] as const;
export type LabDir = typeof LAB_DIRS[number];
export const LAB_SPEEDS = [1, 2, 4] as const;
/** Tiles from the yard's middle where a wave appears (the sea wave a little further out). */
export const WAVE_OUT = 14, SEA_OUT = 18;
/** The yard: walls this many tiles from its middle (a 11 x 11 ring). */
export const YARD_R = 5;
const MAX_WAVE = 60;
/** An arena plot counts as this full of trees and rocks, so none grow back on it. */
const NO_REGROWTH = 9999;

/** What the backpack is filled with (and topped up to on a reset): enough to build plenty more. */
export const LAB_KIT: [ItemId, number][] = [
    ['plank', 400], ['wood', 300], ['stone', 400], ['brick', 300], ['ironbar', 300], ['steel', 150], ['gear', 150], ['wire', 200], ['circuit', 100],
    ['rope', 150], ['blightcore', 40], ['glass', 60], ['cloth', 60], ['coal', 100], ['sword_steel', 1], ['bread', 40], ['potion_heal', 20],
];

/** One piece of the arena, in tiles from the yard's middle. */
interface Piece { kind: BuildingKind; dx: number; dy: number; rot?: number }

/** The arena, from the yard's middle: the wall ring (north stone, west wood, south brick, east Fortified with the doorway), the towers, the power and the traps. */
export function layout (): Piece[] {
    const out: Piece[] = [];
    const R = YARD_R;
    for (let d = -R; d <= R; d++) {
        out.push({ kind: 'wall_stone', dx: d, dy: -R });
        out.push({ kind: 'wall_brick', dx: d, dy: R });
        if (d > -R && d < R) {
            out.push({ kind: 'wall_wood', dx: -R, dy: d });
            out.push(d === 0 ? { kind: 'doorway', dx: R, dy: 0, rot: 1 } : { kind: 'wall_fort', dx: R, dy: d });
        }
    }
    out.push({ kind: 'tower_archer', dx: 3, dy: -3 }, { kind: 'ballista', dx: 0, dy: -3 }, { kind: 'tesla', dx: 3, dy: 3 }, { kind: 'tower_archer', dx: 3, dy: 0 });
    out.push({ kind: 'windturbine', dx: -1, dy: 3 }, { kind: 'pole', dx: 2, dy: 3 });
    for (const [dx, dy] of [[6, -1], [6, 0], [6, 1], [7, 0], [8, -1], [8, 1]]) out.push({ kind: 'spike', dx, dy });
    return out;
}

/** Runtime only (never saved): the yard's middle, the clock it is held at, the game speed, and the counters the panel shows. */
interface LabState {
    kind: 'defense';
    who: string;
    cx: number; cy: number;
    night: boolean;
    /** What the counters stood at when this wave was sent (the panel shows the difference). */
    base: { kills: number; tk: number; dmg: number; broke: number };
    /** The plots the arena stands on. */
    plots: number[];
}
const labs = new WeakMap<Sim, LabState>();
export const stateOf = (sim: Sim) => labs.get(sim);

/** The lab world, built: a new world with the farmer joined and standing in the yard. */
export function create (id: string, name: string): Sim {
    const sim = Sim.create(LAB_SEED, 'Defense Lab');
    const p = sim.join(id, name || 'Tester')!;
    p.look ??= { b: 0, l: 0, e: 1, m: 0 };
    build(sim, p);
    sim.events = [];
    return sim;
}

/** Turn the farmer's world into the lab: raise the island, clear it, build the arena, fill the backpack. */
export function build (sim: Sim, p: PlayerS) {
    sim.lab = 'defense';
    sim.cheats = true;
    const home = sim.homePlot(p.slot);
    const plots: number[] = [];
    // a flat island two plots wide and three tall, the home plot on its east side: the sea is right there to the east
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 0; dx++) {
        const q = sim.world.plot(home.gx + dx, home.gy + dy);
        if (!q || q.heart || q.dread || q.blight) continue;
        if (!q.owned) { q.owned = true; q.buyer = p.id; q.biome = home.biome; }
        q.veins = [];                                 // (plain grass: no ore in the ground)
        q.nodes = NO_REGROWTH;                        // (and nothing grows back on it: gather.updateRespawn fills a plot up to its cap)
        sim.dirtyPlots.add(q.i);
        plots.push(q.i);
    }
    sim.world.recompute();
    const c = sim.world.plotCenter(home);
    const ctx = Math.floor(c.x / TILE), cty = Math.floor(c.y / TILE);
    const st: LabState = { kind: 'defense', who: p.id, cx: (ctx + 0.5) * TILE, cy: (cty + 1) * TILE - 3, night: false, base: { kills: 0, tk: 0, dmg: 0, broke: 0 }, plots };
    labs.set(sim, st);
    clearArena(sim, st);
    for (const piece of layout()) put(sim, p, piece.kind, ctx + piece.dx, cty + piece.dy, piece.rot ?? 0);
    // a nest isle out at sea, in raid range (for the look of it, and for a real raid: the clock is held, so it only grows if you let it)
    const isle = sim.world.plot(home.gx + 4, home.gy);
    if (isle && !isle.blight) blight.raise(sim, isle, 'bone');
    // the farmer: every skill, a sword, the materials, god mode on, standing in the middle of the yard
    for (const s of SKILL_LIST) p.skills[s.id] = s.max;
    // the story told and every medal won already, so their banners stay out of the way of a test
    const q = quests.qsOf(p);
    q.ch = CHAPTERS.length;
    for (const m of MEDALS) if (!q.medals.includes(m.id)) q.medals.push(m.id);
    if (p.level < 10) { p.level = 10; p.xp = 0; }
    p.level = Math.min(p.level, MAX_LEVEL);
    refill(p);
    const d = derived(p);
    if (p.downed > 0) sim.getUp(p);
    p.hearts = d.maxHearts; p.energy = d.maxEnergy;
    p.buffs = p.buffs.filter((b) => b.id !== 'devgod');
    p.buffs.push({ id: 'devgod', t: 9999 });
    p.x = st.cx; p.y = st.cy; p.warp++;
    hold(sim, st);
    mark(sim, st);
}

/** Top the backpack up to the lab's kit. */
function refill (p: PlayerS) {
    for (const [id, n] of LAB_KIT) { const have = p.inv[id] ?? 0; if (have < n) addItem(p, id, n - have); }
}

/** The arena's ground: every node, drop and building on its plots goes. */
function clearArena (sim: Sim, st: LabState) {
    const on = new Set(st.plots);
    for (const e of Object.values(sim.s.ents)) {
        if (e.k === 'mob' || e.k === 'proj' || e.k === 'drop') { sim.forgetCredit(e.id); sim.remove(e.id); continue; }
        if (e.k !== 'node' && e.k !== 'bld') continue;
        const plot = sim.world.plotAt(e.tx, e.ty);
        if (plot && on.has(plot.i) && !(e.k === 'node' && e.kind === 'nest')) sim.remove(e.id);
    }
}

/** Put a building down for the farmer (whatever stood on its tiles is cleared first). */
function put (sim: Sim, p: PlayerS, kind: BuildingKind, tx: number, ty: number, rot: number): BuildE | null {
    const [w, h] = BUILDINGS[kind].size;
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
        if (!sim.world.isLand(x, y)) return null;
        for (const id of [sim.world.occAt(x, y), sim.world.softAt(x, y), sim.world.floorAt(x, y)]) if (id > 0) sim.remove(id);
    }
    return sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot, by: p.id });
}

/** The counters start again from here (a new wave). */
function mark (sim: Sim, st: LabState) {
    const p = sim.s.players[st.who];
    const t = defense.tally(sim);
    st.base = { kills: p?.stats.kills ?? 0, tk: t.kills, dmg: t.dmg, broke: t.broke };
}

/** Hold the clock: noon, or the middle of the night (no night spawns, no dawn, no rain or fog). */
function hold (sim: Sim, st: LabState) {
    const s = sim.s;
    sim.nightSpawns = [];
    sim.nightEv = null;
    sim.duskWarned = 0;
    if (st.night) { s.night = true; s.clock = TUNING.dayLength + s.nightLen / 2; } else { s.night = false; s.clock = TUNING.dayLength / 2; }
}

/** Every step, in a lab world. */
export function step (sim: Sim) {
    const st = labs.get(sim);
    if (st) hold(sim, st);
}

// ── what the panel shows ────────────────────────────────────────────────────
export interface LabReadout { levels: { kind: string; lv: number; pending: number }[]; alive: number; towers: number; you: number; dmg: number; broken: number; night: boolean; speed: number; god: boolean }
export function readout (sim: Sim): LabReadout | null {
    const st = labs.get(sim);
    if (!st) return null;
    const p = sim.s.players[st.who];
    const t = defense.tally(sim);
    const towers = t.kills - st.base.tk;
    const levels = Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && towerType(e.kind) !== null && e.kind !== 'spike').map((b) => ({ kind: b.kind, lv: levelOf(b.xp), pending: pending(b) }));
    return {
        levels,
        alive: sim.ents('mob').length,
        towers,
        you: Math.max(0, (p?.stats.kills ?? 0) - st.base.kills - towers),
        dmg: Math.round(t.dmg - st.base.dmg),
        broken: t.broke - st.base.broke,
        night: st.night,
        speed: sim.timeScale,
        god: !!p?.buffs.some((b) => b.id === 'devgod'),
    };
}

// ── the ops (reached through sim/dev.ts) ────────────────────────────────────
/** Where a wave stands: rows across its direction, `out` tiles from the yard. */
function waveSpots (sim: Sim, st: LabState, dir: LabDir, n: number) {
    const [ux, uy] = dir === 'n' ? [0, -1] : dir === 's' ? [0, 1] : dir === 'w' ? [-1, 0] : [1, 0];
    const out = (dir === 'sea' ? SEA_OUT : WAVE_OUT) * TILE, across = dir === 'sea' ? 10 : 8, gap = (dir === 'sea' ? 1.6 : 1.25) * TILE;
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; spots.length < n && i < n * 4 + 20; i++) {
        const row = Math.floor(i / across), col = i % across;
        const side = (col - (across - 1) / 2) * gap + (row % 2 ? gap / 2 : 0);
        const back = out + row * gap;
        const x = st.cx + ux * back - uy * side, y = st.cy + uy * back + ux * side;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (!sim.world.inBounds(tx, ty) || sim.world.occAt(tx, ty) !== 0 || sim.world.gateAt(tx, ty)) continue;
        spots.push({ x, y });
    }
    return spots;
}

export function wave (sim: Sim, p: PlayerS, id: string, n: number, lv: number, dir: LabDir): number {
    const st = labs.get(sim)!;
    const kinds: MobKind[] = id === 'mixed' ? [...LAB_MOBS] : [id as MobKind];
    n = Math.max(1, Math.min(MAX_WAVE, n));
    mark(sim, st);
    let made = 0;
    for (const at of waveSpots(sim, st, dir, n)) {
        const m = mobs.spawnMob(sim, kinds[made % kinds.length], undefined, undefined, { x: at.x, y: at.y, lv, elite: false, pack: false });
        if (!m) continue;
        m.rd = [Math.round(st.cx), Math.round(st.cy)];
        made++;
    }
    if (made) {
        sim.fx('raid', st.cx + (dir === 'w' ? -1 : dir === 'e' || dir === 'sea' ? 1 : 0) * WAVE_OUT * TILE, st.cy + (dir === 'n' ? -1 : dir === 's' ? 1 : 0) * WAVE_OUT * TILE, p.id);
        const what = id === 'mixed' ? 'monsters' : MOBS[id as MobKind].name;
        sim.float(p.x, p.y - 24, `${made} ${what} (level ${lv}) from the ${DIR_WORDS[dir]}`, PAL.berry, p.id, 'dev');
    }
    return made;
}
export const DIR_WORDS: Record<LabDir, string> = { n: 'north', e: 'east', s: 'south', w: 'west', sea: 'sea' };

export function setNight (sim: Sim, on: boolean) {
    const st = labs.get(sim)!;
    st.night = on;
    hold(sim, st);
}

/** Every damaged wall and tower whole again, and the arena's own pieces that broke put back. Returns how many were put back. */
export function mendAll (sim: Sim): number {
    const st = labs.get(sim)!;
    const p = sim.s.players[st.who];
    defense.mend(sim);
    if (!p) return 0;
    const ctx = Math.floor(st.cx / TILE), cty = Math.floor(st.cy / TILE);
    let back = 0;
    for (const piece of layout()) {
        const tx = ctx + piece.dx, ty = cty + piece.dy;
        const [w, h] = BUILDINGS[piece.kind].size;
        let free = true;
        for (let y = ty; y < ty + h && free; y++) for (let x = tx; x < tx + w; x++) {
            const floor = BUILDINGS[piece.kind].floor;
            if (!sim.world.isLand(x, y) || sim.world.occAt(x, y) !== 0 || sim.world.softAt(x, y) !== 0 || (floor && sim.world.floorAt(x, y) !== 0)) { free = false; break; }
        }
        if (!free || mobsOn(sim, tx, ty, w, h)) continue;
        sim.add<BuildE>({ k: 'bld', kind: piece.kind, tx, ty, rot: piece.rot ?? 0, by: p.id });
        back++;
    }
    return back;
}
const mobsOn = (sim: Sim, tx: number, ty: number, w: number, h: number) => sim.ents('mob').some((m) => m.x >= tx * TILE - 4 && m.x < (tx + w) * TILE + 4 && m.y >= ty * TILE - 2 && m.y < (ty + h) * TILE + 2);

/** Every tower and spike trap in the arena (what the tower tools reach). */
const defenses = (sim: Sim) => Object.values(sim.s.ents).filter((e): e is BuildE => e.k === 'bld' && towerType(e.kind) !== null);

/** XP for every tower: `n` of it, or (`levelUp`) enough for exactly the next level. Returns how many it reached. */
export function giveXp (sim: Sim, n: number, levelUp: boolean): number {
    const list = defenses(sim);
    for (const b of list) {
        const lv = levelOf(b.xp);
        const add = levelUp ? (lv >= TUNING.towers.maxLevel ? 0 : xpAt(lv + 1) - (b.xp ?? 0)) : n;
        defense.addXp(sim, b, add);
    }
    return list.length;
}

/** Every perk taken back (the XP stays), so every pick waits to be made again. */
export function resetPerks (sim: Sim): number {
    let n = 0;
    for (const b of defenses(sim)) if (b.pk?.length) { delete b.pk; sim.touch(b); n++; }
    return n;
}

/** Every monster, shot and dropped thing gone, quietly (nobody is credited). Returns how many monsters went. */
export function clearAll (sim: Sim): number {
    let n = 0;
    for (const e of Object.values(sim.s.ents)) {
        if (e.k === 'mob' && e.rift === undefined) { sim.forgetCredit(e.id); sim.remove(e.id); n++; }
        else if (e.k === 'proj' || e.k === 'drop') sim.remove(e.id);
    }
    return n;
}

export function setSpeed (sim: Sim, n: number) {
    sim.timeScale = (LAB_SPEEDS as readonly number[]).includes(n) ? n : 1;
}

/** The arena as it was built: monsters gone, every building on it torn down and built again, the farmer healed in the middle with a full backpack. */
export function reset (sim: Sim, p: PlayerS) {
    const st = labs.get(sim)!;
    clearAll(sim);
    st.night = false;
    sim.timeScale = 1;
    build(sim, p);
}

/** Plots of the arena (tests). */
export const arenaPlots = (sim: Sim): Plot[] => (labs.get(sim)?.plots ?? []).map((i) => sim.s.plots[i]);
/** The yard's middle, in px (tests and the client's camera). */
export const yardOf = (sim: Sim) => { const st = labs.get(sim); return st ? { x: st.cx, y: st.cy } : null; };
