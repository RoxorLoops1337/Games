// The authoritative world simulation. Pure TypeScript: it runs in the browser for solo
// play and inside the dedicated server for parties, always behind a SimHost.
// Players move themselves (client-authoritative, sanity-checked); every other change
// is a Cmd that this class validates. Everything that happens is pushed to `events`.
//
// Feature code lives in sibling modules that take the Sim: commands.ts (the Cmd check and dispatch, and the farmer's own
// commands: move, swing, dash, look, respawn, summon), gather.ts (nodes, respawn),
// steps moved out for room: clock.ts (day, dusk, night, dawn), health.ts (hurt, down, revive), social.ts (chat, emotes, pings).

import type { Action } from '../actions';
import { MAX_PLAYERS, OLD_DAY_LENGTH, TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import type { ItemId, Res } from '../data/items';
import { MOBS, type MobKind } from '../data/mobs';
import { BODY_Y, dist, distToBuilding, hitPoint } from '../geom';
import { PAL } from '../palette';
import { Rng } from '../rng';
import { World } from '../world';
import * as blight from './blight';
import * as boss from './boss';
import * as chronicle from './chronicle';
import * as clock from './clock';
import * as commands from './commands';
import * as costatus from './costatus';
import * as creatures from './creatures';
import * as death from './death';
import * as dev from './dev';
import * as lab from './lab';
import * as defense from './defense';
import * as dread from './dread';
import * as factory from './factory';
import * as gather from './gather';
import * as health from './health';
import * as satchel from './satchel';
import * as arts from './arts';
import * as hearth from './hearth';
import * as machines from './machines';
import * as mail from './mail';
import * as mines from './mines';
import * as mobs from './mobs';
import * as fishing from './fishing';
import * as quests from './quests';
import { tellLessons } from './petlib';
import * as rift from './rift';
import * as scholar from './scholar';
import * as uber from './uber';
import * as wish from './wish';
import * as shop from './shop';
import type { NightEvent } from '../weather';
import { addRes, countOf, derived, type Derived, grantXp, itemCap, newPlayer, unlocks } from './stats';
import { migrate } from './migrate';
import type { PowerGraph } from './power';
import { STATE_VERSION, type BuildE, type Cmd, type DropE, type Ent, type MobE, type PlayerS, type SimEvent, type WorldState } from './types';
import { ensureVeins, generatePlots, homeSpot, raiseHome, slotPlot } from './worldgen';

/** The pieces the automation step and the power grid care about: only their coming and going makes the grid stale. */
const factoryPiece = (kind: BuildE['kind']) => { const d = BUILDINGS[kind]; return !!(d.dir || d.gen || d.pole || d.use || d.store) || kind === 'drill' || kind === 'chute'; };

/** An entity of one kind. */
type Of<K extends Ent['k']> = Extract<Ent, { k: K }>;

export class Sim {
    readonly s: WorldState;
    readonly world: World;
    readonly rng: Rng;
    events: SimEvent[] = [];
    /** Entities / plots changed since the host last broadcast. */
    readonly dirty = new Set<number>();
    readonly gone = new Set<number>();
    readonly dirtyPlots = new Set<number>();
    /** Rock dug out of the caves since the host last broadcast (world tile indexes), and how far along each tile being dug is. Not saved. */
    readonly dirtyDug: number[] = [];
    /** How far along each cave tile being dug is (hit points left). Emptied at dawn, so a tile tapped once does not stay in it for ever. */
    readonly digHp = new Map<number, number>();
    /** The power grid as last built (sim/factory.ts), rebuilt when `powerDirty`. Runtime only. */
    powerGraph: PowerGraph | null = null;
    /** What each drill stands on (its ore and how many of its tiles have it), with the vein lists it was read from (sim/factory.ts `veinsUnder`). Runtime only. */
    readonly drillVeins = new Map<number, { best: ItemId | null; tiles: number; from: (unknown[] | undefined)[] }>();
    /** Where each posted creature stands (sim/jobs.ts `postAnchor`), looked up again once a second rather than every step. Keyed by owner:pet. Runtime only. */
    readonly postSpots = new Map<string, { at: number; post: unknown; spot: { x: number; y: number } | null }>();
    /**
     * Entity ids by kind, in the order they were added. Ids only ever grow, so this is the order `Object.values(ents)` gives, and the
     * per-step loops (drops, monsters, projectiles, creatures, buildings) read these instead of sifting every entity. Runtime only.
     */
    private readonly byKind: Record<Ent['k'], Set<number>> = { node: new Set(), bld: new Set(), drop: new Set(), mob: new Set(), proj: new Set(), crit: new Set() };
    private readonly kindCache: { [K in Ent['k']]?: Of<K>[] } = {};
    private readonly bldKindCache = new Map<string, BuildE[]>();
    /** How many automation pieces stand in the world (sim/factory.ts skips its step when there are none). */
    factoryN = 0;
    /** Per-step caches: a farmer's derived stats, their unlock tokens and who is online are asked for many times a step and change only between steps or by a command. */
    private readonly derivedCache = new Map<PlayerS, { d: Derived; buffs: PlayerS['buffs']; n: number; starving: boolean; boons: PlayerS['boons']; wish: string | undefined }>();
    private readonly unlockCache = new Map<PlayerS, Set<string>>();
    private onlineCache: PlayerS[] | null = null;
    /** Developer ops (`devdo`) work for everybody: dev builds and `--cheats` servers only. */
    cheats = false;
    /** A test arena (sim/lab.ts: the Defense Lab, `?lab=defense` in solo): its own ops, its clock held. Runtime only, never on a server. */
    lab = '';
    /** How fast the world runs (the lab's game speed: SimHost steps it this many times as often). Runtime only. */
    timeScale = 1;
    /** The farmers who have unlocked the developer menu (sim/dev.ts). Runtime only: never saved, never sent, gone when they leave. */
    readonly devs = new Set<string>();

    /** The night's monsters still to come: near a farmer, on a plot, or (`raid`: a nest isle's plot) a raider marching on the base at rx, ry. */
    nightSpawns: { at: number; kind?: MobKind; near?: string; plot?: number; raid?: number; rx?: number; ry?: number; side?: number; first?: boolean }[] = [];
    /** Damage dealt to each monster by each player (boss rewards). Not saved. */
    private credits: Record<number, Record<string, number>> = {};
    dashT: Record<string, number> = {};
    /** When each Combat Art is next ready, by `farmer:art` (runtime), and the Frost Zones lying on the ground (sim/arts.ts). */
    artT: Record<string, number> = {};
    artZones: { x: number; y: number; r: number; until: number; by: string; next: number }[] = [];
    /** Titan nodes (sim/titan.ts): who swung at each one and when (world time), and when each farmer was last told "Needs a friend!". Runtime only: the window is three seconds, shorter than a save. */
    readonly titanLog = new Map<number, { hits: Map<string, number>; coop: number }>();
    readonly titanSay = new Map<string, number>();
    /** Each farmer's latest dash: the stretch of world time when its invulnerability is the dash's own (`from`..`until`), what it cost, and whether it has already earned its Perfect (one per dash). Not saved: a dash lasts under half a second. */
    perfectWin: Record<string, { from: number; until: number; cost: number; got: boolean }> = {};
    critT = 2;
    questT = 1;
    travelT: Record<string, number> = {};
    /** The special event of the night in progress, if any. */
    nightEv: NightEvent = null;
    /** How many dusk warnings today's sunset has given (0 none, 1 the first, 2 the alarm). Not saved: a loaded world may warn once more. (sim/clock.ts) */
    duskWarned = 0;
    respawnT = 1;
    hauntT = 5;
    healT: Record<string, number> = {};
    /** The evening hearth (sim/hearth.ts): the clock for looking at the fires, and each Hearthside farmer's heart timer. Not saved. */
    hearthT = 0;
    hearthHeal: Record<string, number> = {};
    /** When each farmer last petted their companion (sim/bond.ts). Not saved. */
    patT: Record<string, number> = {};
    /** When each posted creature last told its owner something was wrong (not saved). */
    jobT: Record<string, number> = {};
    fireT: Record<string, number> = {};
    reviveAt: Record<string, number> = {};
    reviveMsgAt: Record<string, number> = {};
    combo: Record<string, { n: number; t: number }> = {};
    windUp = new Set<string>();
    homeGroups = 0;
    machineT = 0;
    beltT = 0;
    powerDirty = true;

    static create (seed: string, name: string) {
        const rng = new Rng(seed);
        return new Sim({
            version: STATE_VERSION, seed, name, tick: 0, time: 0, clock: 0, day: 1, night: false, nightLen: TUNING.nightLength,
            paused: false, plots: generatePlots(rng), ents: {}, nextId: 1, players: {},
        });
    }

    /** Rebuild a simulation from saved state (also used for a brand-new world). */
    constructor (state: WorldState) {
        migrate(state);                               // older saves are brought forward, never thrown away
        if (state.version !== STATE_VERSION) throw new Error(`World save is version ${state.version}, this game needs ${STATE_VERSION}`);
        this.s = state;
        // the days were stretched from 140 s: a night already under way keeps its place in the night instead of lasting a lot longer
        if (state.night && state.clock < TUNING.dayLength) state.clock += TUNING.dayLength - OLD_DAY_LENGTH;
        this.world = new World(state.plots, state.seed);
        for (const e of Object.values(state.ents)) { this.occupy(e); this.byKind[e.k].add(e.id); if (e.k === 'bld' && factoryPiece(e.kind)) this.factoryN++; }
        this.rng = new Rng(`${state.seed}:${state.tick}`);
        for (const p of state.plots) if (!p.owned && !p.dread) delete p.veins;         // (nobody's land has no ore until somebody takes it: ensureVeins)
        state.paused = false;                         // (a menu open when the page was saved paused the world: nobody is in that menu now)
        for (const p of Object.values(state.players)) { p.online = false; p.moving = false; dev.strip(p); costatus.strip(p); satchel.tidy(p); arts.sync(p); delete p.cl; }
        rift.recover(this);
        hearth.tidy(this);                             // (a fill or a buff that belongs to no dusk goes)
        creatures.tidy(this);                          // (a creature "in" a hatchery that is gone is free)
        this.homeGroups = this.countHomeGroups();
        shop.refresh(this);
        dread.ensure(this);
        blight.ensure(this);                           // (the Blight's first nests: placed once, from the seed)
        if (state.mine) mines.ensure(this);            // the caves have been visited: make them, with the dug-out rock opened again
        uber.link(this);                               // (every Uber Chest opens the one shared store)
    }

    /** The farmers playing right now. Kept until the next step, command, join or leave: those are the only things that change it. */
    get online () { return (this.onlineCache ??= Object.values(this.s.players).filter((p) => p.online)); }

    /** Forget the per-step caches (a step, a command, a join or a leave may change what they hold). */
    fresh () {
        this.onlineCache = null;
        this.derivedCache.clear();
        this.unlockCache.clear();
    }

    /**
     * A farmer's derived stats, worked out once per step (`derived()` walks every skill, gear piece and buff: asked for by every machine,
     * drill and creature they own, it was a tenth of a step). The things that change it inside a step (a buff ending or being given, running
     * out of energy, a boon, the season wish) are checked, so it is never stale; everything else changes only through a command.
     */
    derivedOf (p: PlayerS): Derived {
        const c = this.derivedCache.get(p);
        const starving = p.energy <= 0;
        if (c && c.buffs === p.buffs && c.n === p.buffs.length && c.starving === starving && c.boons === p.boons && c.wish === p.wish) return c.d;
        const d = derived(p);
        this.derivedCache.set(p, { d, buffs: p.buffs, n: p.buffs.length, starving, boons: p.boons, wish: p.wish });
        return d;
    }

    /** `hasUnlock` for the per-step callers (machines, posted creatures): the tokens are gathered once per step, since only a command can change them. */
    hasUnlock (p: PlayerS, token?: string) {
        if (!token) return true;
        let set = this.unlockCache.get(p);
        if (!set) { set = unlocks(p); this.unlockCache.set(p, set); }
        return set.has(token);
    }

    // ── events ──────────────────────────────────────────────────────────────
    fx (fx: Action, x: number, y: number, by?: string, pitch?: number) { this.events.push({ e: 'fx', fx, x, y, by, pitch }); }
    float (x: number, y: number, text: string, color?: number, to?: string, key?: string) {
        this.events.push({ e: 'float', x, y, text, color, to, key });
    }
    banner (text: string, sub?: string, color?: number, to?: string) { this.events.push({ e: 'banner', text, sub, color, to }); }
    toast (to: string, text: string, icon?: string, color?: number) { this.events.push({ e: 'toast', to, text, icon, color }); }
    bannerOthers (except: string, text: string, sub?: string, color?: number) {
        for (const q of this.online) if (q.id !== except) this.banner(text, sub, color, q.id);
    }
    deny (p: PlayerS, msg: string) {
        this.fx('deny', p.x, p.y - 10, p.id);
        this.float(p.x, p.y - 22, msg, PAL.berry, p.id);
    }

    // ── entities ────────────────────────────────────────────────────────────
    /** Mark an entity's tiles in the world grid. */
    occupy (e: Ent) {
        if (e.k === 'node') this.world.setOcc(e.tx, e.ty, e.id);
        else if (e.k === 'bld') {
            if (factoryPiece(e.kind)) this.powerDirty = true;          // (a fence or a bed changes nothing about the wires)
            const def = BUILDINGS[e.kind];
            const [w, h] = def.size;
            if (def.floor) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.world.setFloor(e.tx + x, e.ty + y, e.id); }
            else if (def.roof) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.world.setRoof(e.tx + x, e.ty + y, e.id); }
            else if (def.walk) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { this.world.setSoft(e.tx + x, e.ty + y, e.id); if (def.gate) this.world.setGate(e.tx + x, e.ty + y, true); } }
            else if (def.solid !== false) { this.world.setOccRect(e.tx, e.ty, w, h, e.id); if (def.wall) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.world.setWall(e.tx + x, e.ty + y, true); }
        }
    }

    vacate (e: Ent) {
        if (e.k === 'node') this.world.setOcc(e.tx, e.ty, 0);
        else if (e.k === 'bld') {
            if (factoryPiece(e.kind)) this.powerDirty = true;
            const def = BUILDINGS[e.kind];
            const [w, h] = def.size;
            if (def.floor) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.world.setFloor(e.tx + x, e.ty + y, 0); }
            else if (def.roof) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.world.roofAt(e.tx + x, e.ty + y) === e.id) this.world.setRoof(e.tx + x, e.ty + y, 0); }
            else if (def.walk) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.world.softAt(e.tx + x, e.ty + y) === e.id) { this.world.setSoft(e.tx + x, e.ty + y, 0); this.world.setGate(e.tx + x, e.ty + y, false); } }
            else if (def.solid !== false) { this.world.setOccRect(e.tx, e.ty, w, h, 0); if (def.wall) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.world.setWall(e.tx + x, e.ty + y, false); }
        }
    }

    add<T extends Ent> (e: Omit<T, 'id'>): T {
        const ent = { ...e, id: this.s.nextId++ } as T;
        this.s.ents[ent.id] = ent;
        this.byKind[ent.k].add(ent.id);
        this.kindCache[ent.k] = undefined;
        if (ent.k === 'bld') { this.bldKindCache.clear(); if (factoryPiece(ent.kind)) this.factoryN++; }
        this.occupy(ent);
        this.dirty.add(ent.id);
        uber.changed(this, ent);
        return ent;
    }

    remove (id: number) {
        const e = this.s.ents[id];
        if (!e) return;
        delete this.s.ents[id];
        this.byKind[e.k].delete(id);
        this.kindCache[e.k] = undefined;
        if (e.k === 'bld') { this.bldKindCache.clear(); if (factoryPiece(e.kind)) this.factoryN--; this.drillVeins.delete(id); }
        this.vacate(e);
        // (the island's node count: only for a node standing on that island, so the throwaway plot the caves and the developer menu use never touches a real one; buried treasure does not crowd out the trees)
        if (e.k === 'node' && e.kind !== 'mound') { const pl = this.s.plots[e.plot]; if (pl && this.world.plotAt(e.tx, e.ty) === pl) pl.nodes = Math.max(0, pl.nodes - 1); }
        if (e.k === 'bld' && e.kind === 'mineshaft') mines.onRemove(this, e);
        if (e.k === 'bld' && e.kind === 'hatchery') creatures.onRemove(this, e);      // (the parents in it walk free)
        if (e.k === 'bld' && e.kind === 'lostpack' && e.by) {                    // (the arrow to a backpack goes when the backpack does)
            const q = this.s.players[e.by];
            if (q?.pk && Math.abs(q.pk.x - (e.tx + 0.5) * TILE) < 1 && Math.abs(q.pk.y - (e.ty + 0.5) * TILE) < 1) delete q.pk;
        }
        if (e.k === 'node') this.titanLog.delete(id);
        if (e.k === 'mob') boss.forget(this, id);
        this.dirty.delete(id);
        this.gone.add(id);
        uber.changed(this, e);
    }

    /**
     * Every entity of one kind, in id order. The list is kept until one of that kind appears or goes, so a loop over it sees what was there
     * when it started (as a loop over `Object.values(ents)` did) however many are added or removed on the way.
     */
    ents<K extends Ent['k']> (k: K): readonly Of<K>[] {
        let list = this.kindCache[k] as Of<K>[] | undefined;
        if (!list) {
            list = [];
            for (const id of this.byKind[k]) list.push(this.s.ents[id] as Of<K>);
            this.kindCache[k] = list as never;
        }
        return list;
    }

    touch (e: Ent) { this.dirty.add(e.id); if (e.k === 'bld' && uber.isUber(e)) uber.touchAll(this); }

    /** Where hits land and effects play for an entity. */
    center (e: Ent) {
        if (e.k === 'node') return { x: (e.tx + 0.5) * TILE, y: (e.ty + 1) * TILE - 7 };
        if (e.k === 'bld') { const [w, h] = BUILDINGS[e.kind].size; return { x: (e.tx + w / 2) * TILE, y: (e.ty + h) * TILE - 7 }; }
        if (e.k === 'mob' || e.k === 'crit') return { x: e.x, y: e.y - 4 };
        return { x: e.x, y: e.y };
    }

    /** Every building (or every one of a kind), in id order. Both lists are kept until a building appears or goes (scanning every entity for each call was most of a step), so never change them in place. */
    buildings (kind?: string): readonly BuildE[] {
        if (!kind) return this.ents('bld');
        let list = this.bldKindCache.get(kind);
        if (!list) { list = this.ents('bld').filter((e) => e.kind === kind); this.bldKindCache.set(kind, list); }
        return list;
    }

    spawnDrop (res: Res, x: number, y: number, rng: Rng = this.rng) {
        let dx = x, dy = y;
        for (let i = 0; i < 4; i++) {
            const a = rng.next() * Math.PI * 2, r = 6 + rng.next() * 10;
            const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r * 0.7 + 4;
            if (this.world.isLand(Math.floor(nx / TILE), Math.floor(ny / TILE))) { dx = nx; dy = ny; break; }
        }
        return this.add<DropE>({ k: 'drop', res, x: dx, y: dy, ox: x, oy: y, age: 0 });
    }

    /** Give items straight to a player; whatever doesn't fit pops out on the ground. */
    give (p: PlayerS, res: Res, n: number, fromX = p.x, fromY = p.y - 8, rng?: Rng) {
        if (res === 'lantern_shard') quests.count(p, 'shard', n);
        const added = addRes(p, res, n);
        for (let i = 0; i < n - added; i++) this.spawnDrop(res, fromX, fromY, rng);
        return added;
    }

    // ── hearts (sim/health.ts; these are the names the modules and tests call) ──
    hurt (p: PlayerS, from: { x: number; y: number }, amount = 1) { health.hurt(this, p, from, amount); }
    down (p: PlayerS) { health.down(this, p); }
    getUp (p: PlayerS, by?: PlayerS) { health.getUp(this, p, by); }
    heal (p: PlayerS, amount = 1) { health.heal(this, p, amount); }
    respawnHome (p: PlayerS, note?: string) { health.respawnHome(this, p, note); }

    // ── players ─────────────────────────────────────────────────────────────
    homePlot (slot: number) {
        const h = this.s.homes?.[slot] ?? slotPlot(slot);
        return this.world.plot(h.gx, h.gy)!;
    }

    /** A player connects. Returns null when the world is full. */
    join (id: string, name: string): PlayerS | null {
        const s = this.s;
        let p = s.players[id];
        if (!p) {
            const used = new Set(Object.values(s.players).map((q) => q.slot));
            if (used.size >= MAX_PLAYERS) return null;
            let slot = 0;
            while (used.has(slot)) slot++;
            if (slot >= 8 && !s.homes?.[slot]) {
                // beyond the first eight the island is raised now, out of whatever land is still wild
                const spot = homeSpot(s.plots, slot);
                if (!spot) return null;
                for (const i of raiseHome(s.plots, spot, slot, new Rng(`${s.seed}:home:${slot}`))) this.dirtyPlots.add(i);
                (s.homes ??= {})[slot] = spot;
            }
            const home = this.homePlot(slot);
            const c = this.world.plotCenter(home);
            p = newPlayer(id, name || `Farmer ${slot + 1}`, slot, c.x, c.y + TILE / 2);
            s.players[id] = p;
            if (!home.owned) {
                home.owned = true;
                ensureVeins(s.seed, home);
                home.buyer = `home:${slot}`;
                this.world.recompute();
                this.dirtyPlots.add(home.i);
                gather.populate(this, home, true, [{ x: p.x, y: p.y }]);
            }
            this.banner(`Welcome, ${p.name}!`, Object.keys(s.players).length > 1
                ? 'Your friends are out there — buy land toward them (check the map)'
                : 'Harvest, build, and buy land to grow your farm', PAL.gold, id);
            chronicle.note(this, `join:${id}`, Object.keys(s.players).length > 1 ? `${p.name} joined the farm.` : `${p.name} set up camp on a small island.`, 'k_flag');
        } else {
            if (name) p.name = name;
            costatus.strip(p);
            if (p.downed > 0) this.respawnHome(p);
            rift.strandedCheck(this, p);
            this.banner(`Welcome back, ${p.name}`, `Day ${s.day}`, PAL.gold, id);
        }
        p.online = true;
        p.moving = false;
        this.fresh();
        wish.grant(this, p);
        scholar.grant(this, p);
        tellLessons(this, p, true);
        mail.onJoin(this, p);
        this.fx('join', p.x, p.y - 8, p.id);
        this.bannerOthers(id, `${p.name} joined`, undefined, PAL.lime);
        return p;
    }

    leave (id: string) {
        dev.lock(this, id);
        const p = this.s.players[id];
        if (!p || !p.online) return;
        const wasOnExpedition = !!p.rift;
        rift.onLeave(this, p);
        fishing.stop(p);
        costatus.clear(this, p);
        if (p.downed > 0) { if (wasOnExpedition) this.respawnHome(p); else health.die(this, p); }       // (leaving while down does not dodge it)
        p.online = false;
        p.moving = false;
        this.fresh();
        if (this.online.length <= 1) this.s.paused = false;
        this.bannerOthers(id, `${p.name} left`, undefined, PAL.pebble);
    }

    /** The nearest free standing tile to (tx, ty), looking up to `r` tiles out, ring by ring. */
    nearestFree (tx: number, ty: number, r = 5) {
        for (let k = 0; k <= r; k++) {
            for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
                if (this.world.isFree(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
            }
        }
        return null;
    }

    gainXp (p: PlayerS, n: number) {
        const levels = grantXp(p, n);
        if (!levels) return;
        this.fx('levelUp', p.x, p.y - 10, p.id);
        this.float(p.x, p.y - 30, `Level ${p.level}!`, PAL.gold);
        this.toast(p.id, `Level ${p.level}! +${levels} skill point${levels > 1 ? 's' : ''}  (K)`, 'k_star', PAL.gold);
        chronicle.levels(this, p, levels);
    }

    // ── commands ────────────────────────────────────────────────────────────
    /** Validate and apply one command from a farmer: sim/commands.ts checks and dispatches it; this is what hosts and tests call. */
    command (pid: string, c: Cmd) { commands.command(this, pid, c); }

    inReach (p: PlayerS, e: Ent, reach: number) {
        if (e.k === 'bld') return distToBuilding(p.x, p.y - BODY_Y, e) <= reach - 6;
        const c = this.center(e), h = hitPoint(p);
        return dist(c.x, c.y, h.x + p.fx * 4, h.y + p.fy * 4) <= reach || dist(c.x, c.y, h.x, h.y) <= reach;
    }

    /**
     * The building with this id if the farmer can use it from where they stand (within their reach plus `pad` px, and of
     * `kind` when one is given), else null. Every window that works a building by id (machines, chests, the mailbox) asks this.
     * (One pad for all of them: the mailbox had 20 px against 24 everywhere else, a difference nobody could feel.)
     */
    reachableBuilding (p: PlayerS, id: number, pad = 24, kind?: BuildE['kind']): BuildE | null {
        const b = this.s.ents[id];
        if (!b || b.k !== 'bld' || (kind && b.kind !== kind)) return null;
        return this.inReach(p, b, this.derivedOf(p).reach + pad) ? b : null;
    }

    /**
     * Is this farmer protected from a strike that has just connected? (Call it once the strike's own reach says it would land,
     * never before: a strike that would have missed saves nobody.) A farmer with no invulnerability is not protected.
     * When the invulnerability that stopped the strike is the dash's, and the strike was an attack (a telegraphed hit, a shot, a
     * charge: `attack`, not just a body brushing past), the dash saved them from something real: a Perfect dash, once per dash.
     */
    shielded (p: PlayerS, attack = true): boolean {
        if (p.invuln <= 0) return false;
        if (attack) this.perfect(p);
        return true;
    }

    /** A Perfect dash: the dash's energy back, a buff that makes the next hit on a monster a critical one, and the fanfare. */
    private perfect (p: PlayerS) {
        const w = this.perfectWin[p.id];
        if (!w || w.got || p.downed > 0 || this.s.time < w.from || this.s.time > w.until + 1e-6) return;
        w.got = true;
        p.energy = Math.min(Math.max(p.energy, derived(p).maxEnergy), p.energy + w.cost);
        p.buffs = p.buffs.filter((b) => b.id !== 'perfect');
        p.buffs.push({ id: 'perfect', t: TUNING.perfectSeconds });
        quests.count(p, 'perfect');
        this.fx('perfect', p.x, p.y - 8, p.id);
        this.float(p.x, p.y - 30, 'Perfect!', PAL.snow);
    }

    // ── damage credit (who gets boss rewards) ──
    credit (e: MobE, by: PlayerS, dmg: number) {
        if (!MOBS[e.kind].boss) return;
        const c = (this.credits[e.id] ??= {});
        c[by.id] = (c[by.id] ?? 0) + dmg;
    }
    creditOf (id: number) { return this.credits[id] ?? {}; }
    forgetCredit (id: number) { delete this.credits[id]; }

    /**
     * Which landmass each farmer's home is on: every owned plot reachable from a home → the number (from 1) of the group that home
     * belongs to. Two homes with the same number are joined by land (quests.checkMeet); the count of numbers is `countHomeGroups`.
     */
    homeGroupMap (): Map<number, number> {
        const seen = new Map<number, number>();
        let groups = 0;
        for (const q of Object.values(this.s.players)) {
            const h = this.homePlot(q.slot);
            if (!h.owned || seen.has(h.i)) continue;
            groups++;
            const stack = [h];
            seen.set(h.i, groups);
            while (stack.length) {
                const cur = stack.pop()!;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const n = this.world.plot(cur.gx + dx, cur.gy + dy);
                    if (n?.owned && !seen.has(n.i)) { seen.set(n.i, groups); stack.push(n); }
                }
            }
        }
        return seen;
    }

    /** How many separate landmasses the players' homes are on (merging = meeting up). */
    countHomeGroups () {
        return new Set(this.homeGroupMap().values()).size;
    }

    // ── simulation step ─────────────────────────────────────────────────────
    step (dt: number) {
        const s = this.s;
        if (s.paused) return;
        s.tick++;
        s.time += dt;
        this.fresh();
        clock.updateClock(this, dt);
        for (const p of this.online) this.updatePlayer(p, dt);
        this.updateDrops(dt);
        gather.updateRespawn(this, dt);
        machines.step(this, dt);
        factory.stepFactory(this, dt);
        mobs.updateMobs(this, dt);
        mobs.updateProjs(this, dt);
        blight.update(this);
        defense.update(this);                         // (towers shoot, spike traps bite)
        arts.update(this);                            // (Frost Zones chill, the Shroud ends)
        rift.update(this, dt);
        costatus.update(this, dt);
        death.update(this);
        dread.update(this);
        mines.update(this);
        fishing.update(this, dt);
        creatures.update(this, dt);
        hearth.update(this, dt);
        quests.update(this, dt);
        wish.update(this);
        if (this.lab) lab.step(this);                 // (the Defense Lab holds its clock)
    }

    private updatePlayer (p: PlayerS, dt: number) {
        p.invuln = Math.max(0, p.invuln - dt);
        p.swingCd = Math.max(0, p.swingCd - dt);
        if (this.combo[p.id]) {
            this.combo[p.id].t -= dt;
            if (this.combo[p.id].t <= 0) delete this.combo[p.id];
        }
        if (p.buffs.length) {
            for (const b of p.buffs) b.t -= dt;
            p.buffs = p.buffs.filter((b) => b.t > 0);
        }
        const d = this.derivedOf(p);
        if (p.downed > 0) {
            if (this.s.time - (this.reviveAt[p.id] ?? -9) > 0.4) p.revive = Math.max(0, p.revive - dt);
            p.downed -= dt;
            if (p.downed <= 0) {
                if (this.windUp.delete(p.id)) {
                    p.windDay = this.s.day;
                    this.getUp(p);
                    this.banner('Second Wind!', 'Back on your feet', PAL.blossom, p.id);
                } else if (p.rift) {
                    rift.eliminate(this, p);
                } else {
                    health.die(this, p);
                }
            }
            return;
        }
        if (d.energyRegen > 0 && p.energy < d.maxEnergy) p.energy = Math.min(d.maxEnergy, p.energy + d.energyRegen * dt);
        if (p.energy > d.maxEnergy) p.energy = d.maxEnergy;
        if (p.hearts > d.maxHearts) p.hearts = d.maxHearts;
        if (p.hearts >= d.maxHearts) return;
        const here = this.world.plotAtPx(p.x, p.y);
        if (here?.mod === 'fairy') {
            this.healT[p.id] = (this.healT[p.id] ?? 0) + dt;
            if (this.healT[p.id] >= TUNING.fairyHealEvery) { this.healT[p.id] = 0; this.heal(p); }
        }
        hearth.regen(this, p, dt);
        if (this.s.night && this.nearFire(p.x, p.y)) {
            this.fireT[p.id] = (this.fireT[p.id] ?? 0) + dt;
            if (this.fireT[p.id] >= TUNING.campfireHealEvery) { this.fireT[p.id] = 0; this.heal(p); }
        }
    }

    nearFire (x: number, y: number) {
        return this.buildings('campfire').some((e) => Math.hypot((e.tx + 0.5) * TILE - x, (e.ty + 1) * TILE - y) < TUNING.campfireRadius);
    }

    private updateDrops (dt: number) {
        const takers = this.online.filter((p) => p.downed <= 0);
        const reach = takers.map((p) => this.derivedOf(p).magnet);        // (once per farmer per step: working it out for every item on the ground cost most of a step)
        for (const e of this.ents('drop')) {
            e.age += dt;
            if (e.age > TUNING.dropLife) { this.remove(e.id); continue; }
            if (e.age < 0.4) continue;
            let best: PlayerS | null = null, bd = Infinity;
            for (let i = 0; i < takers.length; i++) {
                const p = takers[i];
                const d = dist(p.x, p.y - BODY_Y, e.x, e.y);
                if (d < reach[i] && d < bd) {
                    // a full pocket leaves the item on the ground for someone with room
                    if (e.res !== 'coin' && countOf(p, e.res as ItemId) >= itemCap(p, e.res as ItemId)) continue;
                    bd = d; best = p;
                }
            }
            if (!best) continue;
            addRes(best, e.res, 1);
            const combo = this.combo[best.id] ?? { n: 0, t: 0 };
            combo.n = Math.min(combo.n + 1, 10);
            combo.t = 0.45;
            this.combo[best.id] = combo;
            this.events.push({ e: 'pickup', id: e.id, by: best.id, res: e.res });
            this.fx('pickup', best.x, best.y - 8, best.id, 1 + combo.n * 0.06);
            this.remove(e.id);
        }
    }

    // ── mobs ────────────────────────────────────────────────────────────────
    spawnMob (kind?: MobKind, near?: string, plotIndex?: number) { return mobs.spawnMob(this, kind, near, plotIndex); }
    killMob (e: MobE, by?: PlayerS, silent = false) { mobs.killMob(this, e, by, silent); }

    // ── helpers used by modules ─────────────────────────────────────────────
    /** The nearest building matching `pred` that `p` stands within `range` tiles of. */
    stationNear (p: PlayerS, pred: (b: BuildE) => boolean, range = TUNING.stationRange): BuildE | null {
        for (const b of this.buildings()) {
            if (pred(b) && distToBuilding(p.x, p.y - BODY_Y, b) <= range * TILE) return b;
        }
        return null;
    }
}
