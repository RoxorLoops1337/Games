// The developer menu's rules: what a tester may do to their own game (level up, spawn things, jump about) and who may do it.
//
// Nothing here runs unless the sim says the player is unlocked (`sim.devs`: runtime only, never saved) or the host runs with
// cheats on. Unlocking is the host's business (net/host.ts: the key is checked there, with a rate limit); `unlock` and `lock`
// are what it calls. Every op is one small function that reads its numbers through `int` (finite, clamped) and its words
// through `has` (an own key of a data table), and says what it did the way any game action does: an fx and a float or toast.
// The client's Developer screen (ui/screens/devtools.ts) only sends `devdo` commands: it never changes anything itself.

import type { Action } from '../actions';
import { PLOT, RIFT_ISLANDS, TILE, TUNING, UNDER_Y, WORLD_TILES } from '../config';
import { PET_MAX_LEVEL, SPECIES, SPECIES_LIST, type SpeciesId } from '../data/creatures';
import { GEAR_SLOTS, ITEM_ORDER, ITEMS, type GearSlot, type ItemId } from '../data/items';
import { BOSS_ORDER, isBoss, MOBS, nightCount, type MobKind } from '../data/mobs';
import { NODES, type NodeKind } from '../data/nodes';
import { CHAPTERS, MEDALS } from '../data/quests';
import { SKILL_LIST } from '../data/skills';
import { clock as mmss } from '../fmt';
import { feetTile } from '../geom';
import { PAL } from '../palette';
import { seasonDay } from '../season';
import { NIGHT_EVENTS, type NightEvent } from '../weather';
import * as clock from './clock';
import * as costatus from './costatus';
import * as creatures from './creatures';
import * as dread from './dread';
import * as economy from './economy';
import * as fishing from './fishing';
import * as gather from './gather';
import * as mines from './mines';
import * as mobs from './mobs';
import { findPet } from './petlib';
import * as potluck from './potluck';
import * as quests from './quests';
import * as shop from './shop';
import type { Sim } from './sim';
import { addItem, derived, MAX_LEVEL, xpToNext } from './stats';
import type { Cmd, CritE, MobE, PlayerS, Plot } from './types';
import { ensureVeins } from './worldgen';

/** Every op the menu can ask for. (A record below has to answer each one, so a new op does not compile until it is handled.) */
export const DEV_OPS = [
    'level', 'levelTo', 'xp', 'points', 'coins',
    'item', 'kit', 'gear', 'wipe',
    'heal', 'revive', 'hurt', 'down', 'god', 'speed',
    'skills', 'respec', 'story', 'medals', 'bosses', 'dex', 'refresh',
    'time', 'day', 'event', 'clock',
    'mob', 'boss', 'creature', 'node', 'pet',
    'killNear', 'killAll', 'clearDrops',
    'land', 'tp',
    'affection',
    'feast',
    'co',
] as const;
export type DevOp = typeof DEV_OPS[number];
export type DevCmd = Extract<Cmd, { t: 'devdo' }>;

/** What the "starter kit" gives: good tools, food, potions, building materials, seeds, pods and a fishing rod. */
export const KIT: [ItemId, number][] = [
    ['pick_crystal', 1], ['sword_steel', 1], ['helm_steel', 1], ['plate_steel', 1], ['bag_pack', 1], ['charm_swift', 1], ['rod_fine', 1], ['bait', 40],
    ['bread', 30], ['stew', 20], ['pie', 10], ['potion_heal', 15], ['potion_energy', 15], ['potion_swift', 5],
    ['wood', 300], ['stone', 300], ['plank', 150], ['brick', 100], ['coal', 150], ['ironbar', 80], ['steel', 40], ['rope', 40], ['cloth', 40], ['glass', 40],
    ['seed_wheat', 30], ['seed_carrot', 30], ['seed_pumpkin', 20], ['pod', 20], ['pod_great', 10], ['treat', 10],
];

/** Times of day, night events and teleport places the menu offers (the client lists them from here). */
export const TIMES = ['dawn', 'noon', 'dusk', 'midnight'] as const;
export const EVENTS = ['bloodmoon', 'meteors', 'fairies'] as const;
const DEV_BUFFS = ['devgod', 'devspeed'] as const;

// ── who may ─────────────────────────────────────────────────────────────────
/** May this farmer use the menu? (Unlocked with the key, or the host runs with cheats on.) */
const isDev = (sim: Sim, id: string) => sim.cheats || sim.devs.has(id);

/** The key was right (the host checked it): this farmer may use the menu until they leave. */
export function unlock (sim: Sim, id: string) {
    const p = sim.s.players[id];
    if (!p || sim.devs.has(id)) return;
    sim.devs.add(id);
    sim.fx('unlock', p.x, p.y - 10, id);
    sim.float(p.x, p.y - 24, 'Developer menu', PAL.plum, id);
    sim.toast(id, 'Developer menu unlocked', 'k_star', PAL.plum);
}

/** A connection ended or was replaced: the unlock goes with it, and so do the buffs it handed out. */
export function lock (sim: Sim, id: string) {
    sim.devs.delete(id);
    const p = sim.s.players[id];
    if (p) strip(p);
}

const isDevBuff = (b: { id: string }) => (DEV_BUFFS as readonly string[]).includes(b.id);
/** God mode and the speed boost are buffs so the client sees them; they never outlive the session (or a save). */
export function strip (p: PlayerS) {
    if (Array.isArray(p.buffs) && p.buffs.some(isDevBuff)) p.buffs = p.buffs.filter((b) => !isDevBuff(b));
}

// ── reading the command ─────────────────────────────────────────────────────
/** A whole number from the wire: finite, clamped to lo..hi (the default when it is not a number at all). */
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
/** A number from the wire kept as it is (no rounding): finite, clamped to lo..hi (the default when it is not a number at all). */
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
/** Is `k` a key of the table itself (never an inherited name like `constructor`)? */
const has = <T extends object>(table: T, k: unknown): k is keyof T => typeof k === 'string' && Object.prototype.hasOwnProperty.call(table, k);
const word = (v: unknown) => (typeof v === 'string' ? v.slice(0, 64) : '');

/** Say what happened: the juice rule's sound and burst, and the words above the farmer (a float; repeats merge). */
function note (sim: Sim, p: PlayerS, fx: Action, text: string, color: number = PAL.gold) {
    sim.fx(fx, p.x, p.y - 10, p.id);
    sim.float(p.x, p.y - 24, text, color, p.id, 'dev');
}
const toast = (sim: Sim, p: PlayerS, text: string, icon = 'k_star', color: number = PAL.plum) => sim.toast(p.id, text, icon, color);

// ── moving about ────────────────────────────────────────────────────────────
type Pt = { x: number; y: number };
const inCaves = (y: number) => mines.isUnder(y);

/** A free tile in the middle of the farmer's own home plot. */
function homeSpot (sim: Sim, p: PlayerS) {
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    return sim.nearestFree(o.tx + PLOT / 2, o.ty + PLOT / 2, 8);
}
const feetOf = (tx: number, ty: number): Pt => ({ x: (tx + 0.5) * TILE, y: (ty + 1) * TILE - 3 });

/** Put a farmer somewhere else (the waystone's flash at both ends, and a moment of safety). */
function moveTo (sim: Sim, p: PlayerS, at: Pt) {
    fishing.stop(p);
    sim.fx('summon', p.x, p.y - 8, p.id);
    p.x = at.x; p.y = at.y; p.warp++; p.moving = false;
    p.invuln = Math.max(p.invuln, 1.5);
    sim.fx('summon', p.x, p.y - 8, p.id);
}

/** Open the rock round a tile in the caves, so a farmer put there is not inside a wall. */
function clearRock (sim: Sim, tx: number, ty: number, r: number) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) mines.open(sim, tx + dx, ty + dy);
    const at = sim.world.occAt(tx, ty);
    if (at > 0) sim.remove(at);
}

/** Straight into the caves at a tile (the caves are made first if nobody has been down yet). */
function intoCave (sim: Sim, p: PlayerS, tx: number, ty: number) {
    mines.ensure(sim);
    const x = Math.max(6, Math.min(WORLD_TILES - 7, tx)), y = UNDER_Y + Math.max(6, Math.min(WORLD_TILES - 7, ty - (ty >= UNDER_Y ? UNDER_Y : 0)));
    clearRock(sim, x, y, 3);
    moveTo(sim, p, feetOf(x, y));
}

/** Raise a plot of land that nobody can reach yet (the Old Heart), stocked as any new land is. */
function raise (sim: Sim, p: PlayerS, plot: Plot) {
    plot.owned = true;
    plot.buyer = p.id;
    ensureVeins(sim.s.seed, plot);
    sim.world.recompute();
    sim.dirtyPlots.add(plot.i);
    gather.populate(sim, plot, false, sim.online.map((q) => ({ x: q.x, y: q.y })));
    sim.homeGroups = sim.countHomeGroups();
    const c = sim.world.plotCenter(plot);
    sim.fx('buyLand', c.x, c.y, p.id);
}

function teleport (sim: Sim, p: PlayerS, c: DevCmd) {
    const where = word(c.id);
    const here = { tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) };
    const go = (spot: { tx: number; ty: number } | null, label: string) => {
        if (!spot) { sim.deny(p, 'No room there'); return; }
        moveTo(sim, p, feetOf(spot.tx, spot.ty));
        sim.float(p.x, p.y - 24, label, PAL.foam, p.id, 'dev');
    };
    if (where === 'home') return go(homeSpot(sim, p), 'Home');
    if (where === 'heart') {
        const heart = sim.s.plots.find((q) => q.heart);
        if (!heart) { sim.deny(p, 'This world has no Old Heart'); return; }
        if (!heart.owned) raise(sim, p, heart);          // (nobody has bought the middle of the world yet: it is raised for the visit)
        const o = sim.world.plotOrigin(heart);
        return go(sim.nearestFree(o.tx + PLOT / 2, o.ty + PLOT / 2 + 6, 8), 'The Old Heart');
    }
    if (where === 'dread') {
        const z = dread.zones(sim).find((q) => q.q === int(c.n, 0, 3, -1));
        if (!z) { sim.deny(p, 'No such Dread block'); return; }
        return go(sim.nearestFree(Math.floor(z.cx / TILE), Math.floor(z.cy / TILE) + 9, 8), `Dread Reach ${z.q + 1}`);
    }
    if (where === 'rift') {
        const i = int(c.n, 0, RIFT_ISLANDS - 1, -1);
        if (i < 0) { sim.deny(p, 'No such rift island'); return; }
        const r = sim.world.riftCenter(i);
        return go(sim.nearestFree(Math.floor(r.x / TILE), Math.floor(r.y / TILE) + 3, 8), `Rift island ${i + 1}`);
    }
    if (where === 'cave') {
        if (inCaves(p.y)) { sim.deny(p, 'You are already down here'); return; }
        // beside a shaft: the real way down (its ladder and banner); anywhere else: straight in, under the same spot
        const shaft = sim.buildings('mineshaft').find((b) => Math.hypot((b.tx + 0.5) * TILE - p.x, (b.ty + 0.5) * TILE - p.y) < 8 * TILE);
        if (shaft && !p.rift && p.downed <= 0) { mines.descend(sim, p, shaft); return; }
        return intoCave(sim, p, here.tx, here.ty);
    }
    if (where === 'surface') {
        if (!inCaves(p.y)) { sim.deny(p, 'You are already on the surface'); return; }
        return go(sim.nearestFree(here.tx, here.ty - UNDER_Y, 14) ?? homeSpot(sim, p), 'The surface');
    }
    if (where === 'player') {
        const who = word(c.who);
        const t = has(sim.s.players, who) ? sim.s.players[who] : undefined;
        if (!t || !t.online || t.id === p.id) { sim.deny(p, 'Nobody to go to'); return; }
        return go(sim.nearestFree(Math.floor(t.x / TILE), Math.floor(t.y / TILE), 4), t.name);
    }
    if (where === 'xy') {
        const tx = int(c.x, 0, WORLD_TILES - 1, here.tx), ty = int(c.y, 0, UNDER_Y + WORLD_TILES - 1, here.ty);
        if (ty >= UNDER_Y) return intoCave(sim, p, tx, ty);
        return go(sim.nearestFree(tx, ty, 10), `${tx}, ${ty}`);
    }
}

// ── spawning ────────────────────────────────────────────────────────────────
/** Up to `n` free spots round the farmer's feet, or round a point just in front of them. */
function spots (sim: Sim, p: PlayerS, at: 'feet' | 'front', n: number): Pt[] {
    const l = Math.hypot(p.fx, p.fy) > 0.1 ? Math.hypot(p.fx, p.fy) : 0;
    const fx = l ? p.fx / l : 0, fy = l ? p.fy / l : 1;
    const bx = at === 'front' ? p.x + fx * 46 : p.x, by = at === 'front' ? p.y + fy * 46 : p.y;
    const out: Pt[] = [];
    for (let i = 0; out.length < n && i < n * 16 + 24; i++) {
        const a = i * 2.399963, r = i === 0 && at === 'front' ? 0 : 10 + 7 * Math.sqrt(i);
        const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r * 0.8;
        const feet = feetTile({ x, y });
        if (!sim.world.isLand(feet.tx, feet.ty) || sim.world.boxBlocked(x, y, 3, 2)) continue;
        out.push({ x, y });
    }
    return out;
}
const placeOf = (c: DevCmd): 'feet' | 'front' => (c.at === 'feet' ? 'feet' : 'front');
const MOB_CAP = 300;
const mobCount = (sim: Sim) => sim.ents('mob').length;

function spawnMobs (sim: Sim, p: PlayerS, c: DevCmd, boss: boolean) {
    if (!has(MOBS, c.id) || isBoss(c.id) !== boss) { sim.deny(p, 'Pick one from the list'); return; }
    const kind = c.id as MobKind;
    const n = boss ? 1 : int(c.n, 1, 50, 1);
    if (mobCount(sim) + n > MOB_CAP) { sim.deny(p, 'Too many monsters about already'); return; }
    const lv = int(c.lv, 1, MAX_LEVEL, 0) || mobs.groupLevel(sim, p);
    const where = spots(sim, p, boss ? 'front' : placeOf(c), n);
    if (!where.length) { sim.deny(p, 'No room to stand there'); return; }
    let made = 0;
    for (const w of where) {
        if (boss) {
            const def = MOBS[kind], hp = def.hp;
            // as an altar fight begins: the arena is centred where the farmer stands now
            const b = sim.add<MobE>({ k: 'mob', kind, x: w.x, y: w.y, hp, mhp: hp, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, st: 1, ph: 0, pi: 0, pt: 2.2, hx: p.x, hy: p.y, idle: 0 });
            sim.fx('summon', p.x, p.y - 10, '*');
            sim.fx('roar', b.x, b.y - 6, '*');
            const info = def.boss!;
            sim.banner(info.title, info.blurb, info.color, p.id);
            made++;
        } else if (mobs.spawnMob(sim, kind, undefined, undefined, { x: w.x, y: w.y, lv, elite: c.elite === true, pack: false })) made++;
    }
    note(sim, p, boss ? 'roar' : 'summon', `${made > 1 ? `${made} × ` : ''}${MOBS[kind].name}${boss ? '' : ` (level ${lv})`}`, PAL.berry);
}

function spawnCreatures (sim: Sim, p: PlayerS, c: DevCmd) {
    if (!has(SPECIES, c.id)) { sim.deny(p, 'Pick one from the list'); return; }
    const sp = c.id as SpeciesId, def = SPECIES[sp];
    const n = int(c.n, 1, 20, 1), lv = int(c.lv, 1, PET_MAX_LEVEL, 1);
    const where = spots(sim, p, placeOf(c), n);
    if (!where.length) { sim.deny(p, 'No room to stand there'); return; }
    for (const w of where) sim.add<CritE>({ k: 'crit', sp, x: w.x, y: w.y, vx: 0, vy: 0, t: sim.rng.next() * 3, lv, mode: 0, st: 0, hx: w.x, hy: w.y, life: 240, a: 0 });
    note(sim, p, 'catchOk', `${where.length > 1 ? `${where.length} × ` : ''}${def.name} (level ${lv})`, PAL.blossom);
}

function spawnNodes (sim: Sim, p: PlayerS, c: DevCmd) {
    if (!has(NODES, c.id)) { sim.deny(p, 'Pick one from the list'); return; }
    const kind = c.id as NodeKind;
    const n = int(c.n, 1, 30, 1);
    const l = Math.hypot(p.fx, p.fy) > 0.1 ? Math.hypot(p.fx, p.fy) : 0;
    const bx = Math.floor((p.x + (l ? (p.fx / l) * 36 : 0)) / TILE), by = Math.floor((p.y + (l ? (p.fy / l) * 36 : 36)) / TILE);
    const ghost = mines.ghostPlot(sim);                   // (a node on a rift island or in the caves belongs to no island)
    const feet = feetTile(p);
    let made = 0;
    for (let k = 0; k < 9 && made < n; k++) {
        for (let dy = -k; dy <= k && made < n; dy++) for (let dx = -k; dx <= k && made < n; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
            const tx = bx + dx, ty = by + dy;
            if (!sim.world.isFree(tx, ty) || (feet.tx === tx && feet.ty === ty)) continue;
            gather.addNode(sim, kind, tx, ty, sim.world.plotAt(tx, ty) ?? ghost);
            made++;
        }
    }
    if (!made) { sim.deny(p, 'No room to put it'); return; }
    note(sim, p, 'build', `${made > 1 ? `${made} × ` : ''}${NODES[kind].name}`, PAL.lime);
}

// ── time ────────────────────────────────────────────────────────────────────

/** End a night in progress properly (a new day begins, the dawn rules run). */
function endNight (sim: Sim) {
    if (!sim.s.night) return;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen;
    clock.dawn(sim);
}

/** Night begins right now, the way it does at dusk (monsters on their way, the night's event rolled), and the clock moves on to `at` seconds into it. */
function beginNight (sim: Sim, at: number) {
    if (!sim.s.night) { sim.duskWarned = 2; sim.s.clock = TUNING.dayLength; clock.startNight(sim); }
    sim.s.clock = Math.max(sim.s.clock, TUNING.dayLength + at);
}

function setTime (sim: Sim, p: PlayerS, c: DevCmd) {
    const s = sim.s, which = word(c.id);
    if (!(TIMES as readonly string[]).includes(which)) return;
    if (which === 'midnight') beginNight(sim, s.nightLen / 2);
    else {
        endNight(sim);
        sim.duskWarned = 0;
        s.clock = which === 'dawn' ? 0 : which === 'noon' ? TUNING.dayLength / 2 : TUNING.dayLength - 30;
    }
    note(sim, p, which === 'dawn' || which === 'noon' ? 'dawn' : 'dusk', which[0].toUpperCase() + which.slice(1), which === 'midnight' ? PAL.plum : PAL.gold);
}

function setDay (sim: Sim, p: PlayerS, c: DevCmd) {
    const s = sim.s, day = int(c.n, 1, 9999, s.day);
    const was = s.day;
    s.day = day; s.clock = 0; s.night = false;
    sim.nightSpawns = []; sim.nightEv = null; sim.duskWarned = 0;
    for (const e of sim.ents('mob')) if (!isBoss(e.kind) && !e.guard && e.rift === undefined) sim.killMob(e, undefined, true);
    for (const e of sim.ents('proj')) sim.remove(e.id);
    shop.refresh(sim);
    dread.ensure(sim);
    if (seasonDay(day) === 1 && day !== was) clock.seasonBegins(sim);
    sim.banner(`Day ${day}`, 'Skipped ahead from the developer menu', PAL.gold, p.id);
    note(sim, p, 'dawn', `Day ${day}`);
}

function setEvent (sim: Sim, p: PlayerS, c: DevCmd) {
    const ev = word(c.id);
    if (!(EVENTS as readonly string[]).includes(ev)) return;
    beginNight(sim, 2);
    const e = ev as Exclude<NightEvent, null>;
    if (sim.nightEv !== e) {
        sim.nightEv = e;
        const info = NIGHT_EVENTS[e];
        sim.banner(info.name, info.sub, e === 'bloodmoon' ? PAL.berry : e === 'meteors' ? PAL.gold : PAL.blossom);
        clock.startEvent(sim, e);
        if (e === 'bloodmoon') {
            // a Blood Moon sends more, and stronger, monsters: the extra ones arrive over the next few seconds
            const nt = sim.s.clock - TUNING.dayLength;
            for (const q of sim.online) {
                const extra = Math.min(14, Math.round(nightCount(mobs.groupLevel(sim, q)) * 0.8));
                for (let i = 0; i < extra; i++) sim.nightSpawns.push({ near: q.id, at: nt + 1 + sim.rng.next() * 8 });
            }
            sim.nightSpawns.sort((a, b) => a.at - b.at);
        }
    }
    note(sim, p, 'roar', NIGHT_EVENTS[e].name, e === 'bloodmoon' ? PAL.berry : PAL.plum);
}

// ── the player ──────────────────────────────────────────────────────────────
/** Move a farmer to level `to` through the real XP rules (a level-up banner, a skill point each); lower levels take points back. */
function setLevel (sim: Sim, p: PlayerS, to: number) {
    to = Math.max(1, Math.min(MAX_LEVEL, to));
    if (to > p.level) {
        let need = -p.xp;
        for (let l = p.level; l < to; l++) need += xpToNext(l);
        sim.gainXp(p, (need + 0.5) / derived(p).xpMul);
        if (p.level < MAX_LEVEL) p.xp = 0;
    } else if (to < p.level) {
        p.points = Math.max(0, p.points - (p.level - to));
        p.level = to; p.xp = 0;
        note(sim, p, 'skill', `Level ${to}`, PAL.plum);
    } else sim.deny(p, p.level >= MAX_LEVEL ? 'Already at the top' : `Already level ${to}`);
}

/** Toggle one of the two buffs the menu hands out. */
function toggleBuff (sim: Sim, p: PlayerS, id: 'devgod' | 'devspeed', on: boolean | undefined, text: string, fx: Action) {
    const had = p.buffs.some((b) => b.id === id);
    const want = on ?? !had;
    p.buffs = p.buffs.filter((b) => b.id !== id);
    if (want) p.buffs.push({ id, t: 9999 });
    note(sim, p, fx, `${text}: ${want ? 'on' : 'off'}`, want ? PAL.lime : PAL.pebble);
}

function fullHeal (sim: Sim, p: PlayerS) {
    if (p.downed > 0) sim.getUp(p);
    const d = derived(p);
    p.hearts = d.maxHearts; p.energy = d.maxEnergy;
}

/** The best piece of gear for a slot: rarer first, then the higher tier, then the stronger. */
function bestFor (slot: GearSlot): ItemId | null {
    let best: ItemId | null = null, score = -1;
    for (const id of ITEM_ORDER) {
        const g = ITEMS[id].gear;
        if (!g || g.slot !== slot) continue;
        const s = ITEMS[id].rarity * 1000 + g.tier * 100 + (g.dmg ?? g.power ?? 0);
        if (s > score) { score = s; best = id; }
    }
    return best;
}

// ── the ops ─────────────────────────────────────────────────────────────────
const OPS: Record<DevOp, (sim: Sim, p: PlayerS, c: DevCmd) => void> = {
    level: (sim, p, c) => setLevel(sim, p, p.level + int(c.n, 1, MAX_LEVEL, 1)),
    levelTo: (sim, p, c) => setLevel(sim, p, int(c.n, 1, MAX_LEVEL, p.level)),
    xp: (sim, p, c) => {
        if (p.level >= MAX_LEVEL) { sim.deny(p, 'Already at the top'); return; }
        const n = int(c.n, 1, 10_000_000, 1000);
        sim.gainXp(p, n / derived(p).xpMul);
        note(sim, p, 'perk', `+${n} XP`, PAL.plum);
    },
    points: (sim, p, c) => {
        const n = int(c.n, 1, 1000, 1);
        p.points += n;
        note(sim, p, 'skill', `+${n} skill point${n > 1 ? 's' : ''}`, PAL.plum);
    },
    coins: (sim, p, c) => {
        const n = int(c.n, 1, 1_000_000_000, 1000);
        p.coins = Math.min(1_000_000_000, p.coins + n);
        note(sim, p, 'sell', `+${n} coins`);
    },
    item: (sim, p, c) => {
        if (!has(ITEMS, c.id)) { sim.deny(p, 'No such item'); return; }
        const id = c.id as ItemId, added = addItem(p, id, int(c.n, 1, 999, 1));
        if (added <= 0) { sim.deny(p, 'Your pockets are full of that'); return; }
        note(sim, p, 'pickup', `+${added} ${ITEMS[id].name}`, PAL.cream);
    },
    kit: (sim, p) => {
        for (const [id, n] of KIT) addItem(p, id, n);
        note(sim, p, 'collect', 'Starter kit', PAL.lime);
        toast(sim, p, 'Starter kit: tools, food, potions, materials, seeds and pods', 'k_bag', PAL.lime);
    },
    gear: (sim, p) => {
        for (const slot of GEAR_SLOTS) {
            const id = bestFor(slot);
            if (!id || p.equip[slot] === id) continue;
            addItem(p, id, 1);
            economy.cmdEquip(sim, p, id);
        }
        note(sim, p, 'equip', 'Best gear on', PAL.lime);
    },
    wipe: (sim, p) => { p.inv = {}; note(sim, p, 'packDrop', 'Backpack emptied', PAL.pebble); },
    heal: (sim, p) => { fullHeal(sim, p); note(sim, p, 'heal', 'Full health and energy', PAL.blossom); },
    revive: (sim, p) => {
        if (p.downed <= 0) { sim.deny(p, 'You are on your feet'); return; }
        fullHeal(sim, p);
        p.invuln = 2;
        note(sim, p, 'revive', 'Back up', PAL.lime);
    },
    hurt: (sim, p, c) => {
        if (p.downed > 0) return;
        const n = int(c.n, 1, 20, 1);
        p.invuln = 0;
        sim.hurt(p, { x: p.x + 1, y: p.y }, n);
    },
    down: (sim, p) => { if (p.downed <= 0) sim.down(p); },
    god: (sim, p, c) => toggleBuff(sim, p, 'devgod', typeof c.on === 'boolean' ? c.on : undefined, 'God mode', 'perk'),
    speed: (sim, p, c) => toggleBuff(sim, p, 'devspeed', typeof c.on === 'boolean' ? c.on : undefined, 'Speed boost', 'dash'),
    skills: (sim, p) => {
        for (const s of SKILL_LIST) p.skills[s.id] = s.max;
        note(sim, p, 'unlock', 'Every skill learned', PAL.gold);
    },
    respec: (sim, p) => {
        for (const s of SKILL_LIST) p.points += s.cost * (p.skills[s.id] ?? 0);
        p.skills = {};
        note(sim, p, 'skill', 'Skills refunded', PAL.plum);
    },
    story: (sim, p, c) => {
        const q = quests.qsOf(p);
        if (q.ch >= CHAPTERS.length) { sim.deny(p, 'The story is finished'); return; }
        const upTo = word(c.id) === 'all' ? CHAPTERS.length : q.ch + 1;
        while (q.ch < upTo) { quests.pay(sim, p, CHAPTERS[q.ch].reward); q.ch++; }
        q.start = { ...(p.cnt ?? {}) };
        sim.events.push({ e: 'story', to: p.id, ch: q.ch });
        note(sim, p, 'win', q.ch >= CHAPTERS.length ? 'Story finished' : `Chapter ${q.ch + 1}`, PAL.gold);
    },
    medals: (sim, p) => {
        const q = quests.qsOf(p);
        for (const m of MEDALS) if (!q.medals.includes(m.id)) q.medals.push(m.id);
        note(sim, p, 'unlock', 'Every medal earned', PAL.gold);
    },
    bosses: (sim, p) => {
        p.boss ??= {};
        const s = (sim.s.bosses ??= {});
        for (const id of BOSS_ORDER) { p.boss[id] = Math.max(1, p.boss[id] ?? 0); s[id] = Math.max(1, s[id] ?? 0); }
        note(sim, p, 'bossDie', 'Every boss beaten', PAL.berry);
        toast(sim, p, 'Every expedition tier is open now', 'k_skull', PAL.berry);
    },
    dex: (sim, p) => {
        p.dex = [...SPECIES_LIST];
        note(sim, p, 'catchOk', 'Every creature befriended', PAL.blossom);
    },
    refresh: (sim, p) => {
        delete p.daily;
        if (p.fort) { p.fort.fd = -1; p.fort.pd = -1; p.fort.pn = 0; }
        quests.makeBounties(sim, p);
        note(sim, p, 'dawn', 'Dailies refreshed', PAL.gold);
        toast(sim, p, 'A free spin, the rift of the day and new bounties', 'k_star', PAL.gold);
    },
    time: setTime,
    day: setDay,
    event: setEvent,
    mob: (sim, p, c) => spawnMobs(sim, p, c, false),
    boss: (sim, p, c) => spawnMobs(sim, p, c, true),
    creature: spawnCreatures,
    node: spawnNodes,
    pet: (sim, p, c) => {
        if (!has(SPECIES, c.id)) { sim.deny(p, 'Pick one from the list'); return; }
        const sp = c.id as SpeciesId, def = SPECIES[sp];
        if (creatures.petsOf(p).length >= creatures.rosterCap(p)) { sim.deny(p, 'Your creature roster is full'); return; }
        const pet = creatures.newPet(p, sp, int(c.lv, 1, PET_MAX_LEVEL, 1), sim.rng);
        creatures.petsOf(p).push(pet);
        quests.count(p, `tame:${sp}`);
        if (def.rarity >= 2) quests.count(p, 'rare');
        if (def.rarity >= 3) quests.count(p, 'legend');
        p.dex ??= [];
        if (!p.dex.includes(sp)) p.dex.push(sp);
        note(sim, p, 'catchOk', `${pet.name} the ${def.name} joined`, PAL.blossom);
    },
    killNear: (sim, p) => clearMobs(sim, p, 420),
    killAll: (sim, p) => clearMobs(sim, p, Infinity),
    clearDrops: (sim, p) => {
        let n = 0;
        for (const e of Object.values(sim.s.ents)) if (e.k === 'drop' || e.k === 'proj') { if (e.k === 'drop') n++; sim.remove(e.id); }
        note(sim, p, 'collect', n ? `${n} dropped item${n > 1 ? 's' : ''} cleared` : 'Nothing on the ground', PAL.pebble);
    },
    land: (sim, p, c) => {
        const n = int(c.n, 1, 20, 1), had = p.coins;
        let got = 0;
        for (let i = 0; i < n; i++) {
            const next = sim.world.purchasable().sort((a, b) => dist(sim, p, a) - dist(sim, p, b))[0];
            if (!next) break;
            p.coins = 1e12;                         // the real purchase, with the price waived: every banner, effect and rule is the same
            economy.cmdBuy(sim, p, next.i);
            got++;
        }
        p.coins = had;
        if (!got) sim.deny(p, 'No land left to raise');
        else note(sim, p, 'buyLand', `${got} plot${got > 1 ? 's' : ''} raised, free`, PAL.foam);
    },
    tp: teleport,
    /** The clock set to a moment in seconds (0 is dawn, the night begins at TUNING.dayLength): the test harness's way to bring night on. */
    clock: (sim, p, c) => {
        const at = num(c.n, 0, TUNING.dayLength + sim.s.nightLen, sim.s.clock);
        sim.s.clock = at;
        note(sim, p, at >= TUNING.dayLength ? 'dusk' : 'dawn', `Clock ${mmss(at)}`, at >= TUNING.dayLength ? PAL.plum : PAL.gold);
    },
    /** Set how fond your companion is of you (0..100) and give it a fresh day, so petting and its daily gift can be tried at once. */
    affection: (sim, p, c) => {
        const pet = p.comp ? findPet(p, p.comp) : undefined;
        if (!pet) { note(sim, p, 'pat', 'Take a creature along first', PAL.pebble); return; }
        pet.aff = int(c.n, 0, 100, 40);
        pet.pt = undefined;
        note(sim, p, 'pat', `${pet.name}: affection ${pet.aff}`, PAL.blossom);
    },
    feast: (sim, p) => {
        if (!potluck.devTable(sim, p)) { sim.deny(p, 'No room to lay a table'); return; }
        note(sim, p, 'feast', 'A table laid with four dishes', PAL.gold);
    },
    // a co-op boss status on yourself, without a boss to lay it (frozen, hexed, tether: chained to the nearest friend) or `clear`: to see and test them alone
    co: (sim, p, c) => {
        const id = word(c.id);
        if (id === 'clear') { if (!p.co) { sim.deny(p, 'Nothing on you'); return; } costatus.clear(sim, p); note(sim, p, 'unbind', 'Cleared', PAL.pebble); return; }
        if (p.downed > 0) return;
        if (p.co) { sim.deny(p, 'You carry one already: clear it first'); return; }
        if (id === 'frozen') costatus.freeze(sim, p, undefined);
        else if (id === 'hexed') costatus.hex(sim, p, undefined);
        else if (id === 'tether') {
            const mate = sim.online.filter((q) => q.id !== p.id && q.downed <= 0 && !q.co).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
            if (!mate) { sim.deny(p, 'A chain needs a friend who is free'); return; }
            costatus.bind(sim, p, mate, undefined);
        } else sim.deny(p, 'Pick one from the list');
    },
};
const dist = (sim: Sim, p: PlayerS, plot: Plot) => { const c = sim.world.plotCenter(plot); return Math.hypot(c.x - p.x, c.y - p.y); };

/** Remove monsters (nobody gets loot or XP): the ones within `range` px, or all of them. Expedition monsters are left to their run. */
function clearMobs (sim: Sim, p: PlayerS, range: number) {
    let n = 0;
    for (const e of Object.values(sim.s.ents)) {
        if (e.k !== 'mob' || e.rift !== undefined || Math.hypot(e.x - p.x, e.y - p.y) > range) continue;
        if (isBoss(e.kind)) { sim.forgetCredit(e.id); sim.remove(e.id); } else sim.killMob(e, undefined, n >= 24);       // (a burst for the first few, the rest quietly)
        n++;
    }
    note(sim, p, 'enemyDie', n ? `${n} monster${n > 1 ? 's' : ''} gone` : 'No monsters', PAL.pebble);
}

/** Ops that change the world around the farmer: not while they are on an expedition (it would wreck the run). */
const WORLD_OPS = new Set<DevOp>(['time', 'day', 'event', 'clock', 'mob', 'boss', 'creature', 'node', 'killNear', 'killAll', 'clearDrops', 'land', 'tp', 'feast']);

/** Run one op for a farmer (a no-op unless they are allowed). Reached from Sim.command, after the command has passed the hostile-name check. */
export function run (sim: Sim, p: PlayerS, c: DevCmd) {
    if (!isDev(sim, p.id)) return;
    if (!has(OPS, c.op)) return;
    if (WORLD_OPS.has(c.op) && p.rift) { sim.deny(p, 'Not while you are on an expedition'); return; }
    OPS[c.op](sim, p, c);
}
