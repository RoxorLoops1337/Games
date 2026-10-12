// The entity layer: one model per node, building, monster, creature, drop and shot, kept in step with the simulation; farmers; joining walls and belts; hp bars; fading roofs.
import { Group, type Material, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, Scene } from 'three';
import { TILE } from '../shared/config';
import { type BuildingDef, type BuildingKind, BUILDINGS } from '../shared/data/buildings';
import type { PlayerView } from '../shared/net/protocol';
import type { BuildE, Ent } from '../shared/sim/types';
import type { World } from '../shared/world';
import type { Model } from './models/kit';
import type { Farmer } from './models/farmer';
import { groundY } from './ground';
import { buildingModel } from './models/buildings';
import { critterModel } from './models/critters';
import { dropModel } from './models/drops';
import { farmerModel } from './models/farmer';
import { mobModel } from './models/mobs';
import { nodeModel } from './models/nodes';
import { shotModel } from './models/shots';
import { layChain, STATUS_MODELS } from './models/costatus';
import { MOBS } from '../shared/data/mobs';
import { WATER_Y } from './terrain';
import { dressSnow } from './seasons';
import { wadeDepth, type Wading } from './wade';

/** Pieces of one family join their neighbours (walls, fences, belts ...): which family a building kind belongs to, if any. */
export function familyOf(kind: string) {
    const d = BUILDINGS[kind as BuildingKind] as BuildingDef | undefined;
    if (!d) return null;
    if (d.wall || d.gate) return 'wall';
    if (d.floor) return 'floor:' + kind;
    if (d.roof) return 'roof';
    if (['fence', 'hedge', 'stonewall', 'path', 'belt', 'tunnel', 'tunnelx', 'splitter', 'sorter'].includes(kind)) return kind === 'splitter' || kind === 'sorter' ? 'belt' : kind === 'tunnelx' ? 'tunnel' : kind;
    return null;
}
export const px = (v: number) => v / TILE;
/** Buildings that take snow on top in winter: the house pieces and the decor (roofs, walls, fences, benches...), not the machines. */
const snowy = (kind: BuildingKind) => { const d = BUILDINGS[kind] as BuildingDef; return !!(d.roof || d.wall || d.gate) || d.cat === 'home' || d.cat === 'decor'; };
const outBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
/** What the view keeps for one entity: its latest state, its model, where it is drawn and facing, the hurt flash, hp, how it joins
 * its family, its hp bar and the roof fade. */
export interface View {
    e: Ent; model: Model; x: number; z: number; face: number; px: number; pz: number; moving: boolean; hurt: number; hp: number; mask: number;
    bar?: Group; roofA?: number; fade?: Material[];
    /** a Blight raider: how far it stands in the sea (0 on land, 1 wading to the waist) */
    wade?: number;
    /** a creature being caught: seconds until the thrown pod lands, and the pod that holds it afterwards */
    podWait?: number; pod?: Object3D;
    /** a creature hopping for joy (petted, or glad at a kindled fire) */
    hop?: { t: number; dur: number };
    /** a worker darting at its target and back (tiles to go) */
    lunge?: { t: number; dur: number; dx: number; dz: number };
    /** just arrived: a node or building grows in, a creature or monster pops in, a drop arcs out from where it came */
    born?: { t: number; dur: number; k: 'grow' | 'bld' | 'pop'; s: { x: number; y: number; z: number } };
}
/** A pod in the air: thrown from a farmer to the creature it is meant for. */
interface Flight { obj: Object3D; t: number; dur: number; x0: number; z0: number; x1: number; z1: number; /** lower arc and smaller (a stacked item, not a pod) */ small?: boolean }
/** A farmer on screen: the model, where it is, facing and walking, and the look it was dressed in. */
export interface FarmerView { m: Farmer; x: number; z: number; face: number; moving: boolean; sx: number; sz: number; key: string; /** tethered to this farmer (a co-op chain) */ co?: string }
export class Entities {
    world: World;
    group = new Group();
    views = new Map<number, View>();
    farmers = new Map<string, FarmerView>();
    /** Which building family stands on which tile (for joining walls, floors, belts…). */
    fam = new Map<number, string>();
    hpMat = new MeshBasicMaterial({ color: 0xe85d62, depthTest: false, transparent: true });
    hpBack = new MeshBasicMaterial({ color: 0x2a1d2c, depthTest: false, transparent: true, opacity: 0.85 });
    /** Things on their way out: a beaten monster shrinks away, a picked-up drop flies to the farmer who took it. */
    /** Called with a leaving model once it is finally out of the scene (the view hands its one-off geometry back to the GPU then). */
    gone?: (obj: Object3D) => void;
    /** The foam a wading raider leaves (wade.ts), when the view has it. */
    wading?: Wading;
    flights: Flight[] = [];
    leaving: { obj: Object3D; model: Model; t: number; k: 'mob' | 'drop'; x: number; z: number; tx: number; tz: number; face: number }[] = [];
    constructor(scene: Scene, world: World) {
        this.world = world;
        scene.add(this.group);
    }
    tileKey(tx: number, ty: number) {
        return ty * 100000 + tx;
    }
    maskAt(e: BuildE, fam: string) {
        const [w, h] = BUILDINGS[e.kind].size;
        let m = 0;
        const has = (x: number, y: number) => this.fam.get(this.tileKey(x, y)) === fam;
        for (let i = 0; i < w; i++) {
            if (has(e.tx + i, e.ty - 1)) m |= 1;
            if (has(e.tx + i, e.ty + h)) m |= 4;
        }
        for (let j = 0; j < h; j++) {
            if (has(e.tx + w, e.ty + j)) m |= 2;
            if (has(e.tx - 1, e.ty + j)) m |= 8;
        }
        return m;
    }
    make(e: Ent): View {
        let model: Model, x = 0, z = 0, mask = 0;
        switch (e.k) {
            case 'node': {
                const biome = this.world.plotAt(e.tx, e.ty)?.biome ?? 'meadow';
                const plot = e.kind === 'nest' ? e.plot : -1, world = this.world;
                model = nodeModel(e.kind, { biome, gold: !!e.gold, seed: e.id, level: plot >= 0 ? () => world.plots[plot]?.nl ?? 1 : undefined });
                x = e.tx + 0.5;
                z = e.ty + 0.5;
                break;
            }
            case 'bld': {
                const [w, h] = BUILDINGS[e.kind].size, f = familyOf(e.kind);
                mask = f ? this.maskAt(e, f) : 0;
                model = buildingModel(e.kind, { rot: e.rot ?? 0, seed: e.id, mask });
                x = e.tx + w / 2;
                z = e.ty + h / 2;
                break;
            }
            case 'mob':
                model = mobModel(e.kind, { elite: !!e.el, seed: e.id });
                x = px(e.x);
                z = px(e.y);
                break;
            case 'crit':
                model = critterModel(e.sp, { seed: e.id, stage: e.star });
                x = px(e.x);
                z = px(e.y);
                break;
            case 'drop':
                model = dropModel(e.res);
                x = px(e.x);
                z = px(e.y);
                break;
            default:
                model = shotModel(e.kind);
                x = px(e.x);
                z = px(e.y);
        }
        model.apply?.(e);
        if (e.k === 'bld' && snowy(e.kind)) dressSnow(model.obj);
        model.obj.position.set(x, groundY(x, z), z);
        this.group.add(model.obj);
        return { e, model, x, z, face: 0, px: x, pz: z, moving: false, hurt: 0, hp: e.k === 'mob' ? e.hp : 0, mask };
    }
    /** The simulation sent this entity (new, or changed). */
    upsert(e: Ent, pop = false) {
        const old = this.views.get(e.id);
        if (e.k === 'bld') {
            const f = familyOf(e.kind), [w, h] = BUILDINGS[e.kind].size;
            if (f) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.fam.set(this.tileKey(e.tx + i, e.ty + j), f);
        }
        if (!old) {
            const v = this.make(e);
            if (!v) return;
            this.views.set(e.id, v);
            if (pop) this.arrive(v, e);
            if (e.k === 'bld' && familyOf(e.kind)) this.refreshAround(e);
            return;
        }
        if (e.k === 'mob' && old.e.k === 'mob' && e.hp < old.hp) old.hurt = 1;
        if (e.k === 'mob') old.hp = e.hp;
        old.e = e;
        old.model.apply?.(e);
    }
    remove(id: number) {
        const v = this.views.get(id);
        if (!v) return;
        if (v.e.k === 'bld') {
            const [w, h] = BUILDINGS[v.e.kind].size, f = familyOf(v.e.kind);
            if (f) {
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.fam.delete(this.tileKey(v.e.tx + i, v.e.ty + j));
            }
        }
        if (v.bar) this.group.remove(v.bar);
        if (v.pod) { this.group.remove(v.pod); v.pod = undefined; }
        this.views.delete(id);
        this.wading?.forget(id);
        if ((v.e.k === 'mob' || v.e.k === 'drop') && v.model.obj.visible) {
            // a drop flies to the nearest farmer within reach (who picked it up); a monster gives a last flash and shrinks away
            let tx = v.x, tz = v.z, best = 2.5 * 2.5;
            if (v.e.k === 'drop') for (const f of this.farmers.values()) { const d = (f.x - v.x) ** 2 + (f.z - v.z) ** 2; if (d < best) { best = d; tx = f.x; tz = f.z; } }
            this.leaving.push({ obj: v.model.obj, model: v.model, t: 0, k: v.e.k, x: v.x, z: v.z, tx, tz, face: v.face });
        } else {
            this.group.remove(v.model.obj);
            v.model.dispose?.();
        }
        if (v.e.k === 'bld' && familyOf(v.e.kind)) this.refreshAround(v.e);
    }
    /** A pod is thrown at a creature: it flies in an arc (the creature stays where it is until the pod lands, then the pod holds it). */
    throwPod(e: { id: number; px: number; py: number; x: number; y: number; pod: string }) {
        const x0 = px(e.px), z0 = px(e.py), x1 = px(e.x), z1 = px(e.y);
        const dur = Math.max(0.26, Math.hypot(e.x - e.px, e.y - e.py) * 0.0032);
        const model = dropModel(e.pod);
        model.obj.scale.setScalar(1.15);
        this.group.add(model.obj);
        this.flights.push({ obj: model.obj, t: 0, dur, x0, z0, x1, z1 });
        const v = this.views.get(e.id);
        if (v) v.podWait = dur;
    }
    /** A stacked or fetched item arcs between a farmer and a chest, after `delay` seconds. */
    flyItem(e: { item: string; x0: number; y0: number; x1: number; y1: number; d: number }) {
        const model = dropModel(e.item);
        model.obj.scale.setScalar(0.8);
        model.obj.visible = false;
        this.group.add(model.obj);
        this.flights.push({ obj: model.obj, t: -e.d, dur: 0.3, x0: px(e.x0), z0: px(e.y0), x1: px(e.x1), z1: px(e.y1), small: true });
    }
    /** Something new came into being (not part of the world that was just loaded): it grows in, pops in, or arcs out of where it came from. */
    private arrive(v: View, e: Ent) {
        const s = v.model.obj.scale, keep = { x: s.x, y: s.y, z: s.z };
        if (e.k === 'node' || (e.k === 'bld' && !BUILDINGS[e.kind].floor)) v.born = { t: 0, dur: e.k === 'bld' ? 0.32 : 0.26, k: e.k === 'bld' ? 'bld' : 'grow', s: keep };
        else if (e.k === 'crit' || e.k === 'mob') v.born = { t: 0, dur: 0.35, k: 'pop', s: keep };
        else if (e.k === 'drop') { v.x = px(e.ox); v.z = px(e.oy); v.px = v.x; v.pz = v.z; v.born = { t: 0, dur: 0.38, k: 'grow', s: keep }; }
        if (v.born && e.k !== 'drop') this.arrived?.(e, px(e.k === 'bld' ? e.tx + BUILDINGS[e.kind].size[0] / 2 : e.k === 'node' ? e.tx + 0.5 : e.x), px(e.k === 'bld' ? e.ty + BUILDINGS[e.kind].size[1] / 2 : e.k === 'node' ? e.ty + 0.5 : e.y));
    }
    /** Called with where a new node, building, creature or monster appeared, for a puff of dust (the view owns the particles). */
    arrived?: (e: Ent, x: number, z: number) => void;
    private bornStep(v: View, dt: number) {
        const b = v.born!, o = v.model.obj;
        b.t += dt;
        const u = Math.min(1, b.t / b.dur);
        if (v.e.k === 'drop') {
            o.position.y += Math.sin(u * Math.PI) * 0.45;           // (it slides to where it lies in the usual way; this is the hop on the way)
        } else if (b.k === 'bld') {
            const e = outBack(u);
            o.scale.set(b.s.x * (1 + 0.3 * (1 - e)), b.s.y * (0.2 + 0.8 * e), b.s.z * (1 + 0.3 * (1 - e)));
        } else {
            const e = Math.max(0.01, outBack(u));
            o.scale.set(b.s.x * e, b.s.y * e, b.s.z * e);
        }
        if (u >= 1) { o.scale.set(b.s.x, b.s.y, b.s.z); v.born = undefined; }
    }
    /** A worker darts toward its target and back. */
    lunge(id: number, x: number, z: number, kind: string) {
        const v = this.views.get(id);
        if (!v) return;
        const dx = x - v.x, dz = z - v.z, l = Math.max(0.0625, Math.hypot(dx, dz)), reach = Math.min(1, l * 0.6);
        v.lunge = { t: 0, dur: kind === 'guard' ? 0.34 : 0.7, dx: dx / l * reach, dz: dz / l * reach };
    }
    /** A creature hops for joy. */
    hop(id: number) {
        const v = this.views.get(id);
        if (v) v.hop = { t: 0, dur: 0.72 };
    }
    private updateFlights(dt: number) {
        for (let i = this.flights.length - 1; i >= 0; i--) {
            const f = this.flights[i];
            f.t += dt;
            if (f.t < 0) continue;
            f.obj.visible = true;
            const u = Math.min(1, f.t / f.dur);
            const x = f.x0 + (f.x1 - f.x0) * u, z = f.z0 + (f.z1 - f.z0) * u;
            f.obj.position.set(x, groundY(x, z) + 0.45 + Math.sin(u * Math.PI) * (f.small ? 0.8 : 1.4), z);
            f.obj.rotation.set(u * 9, 0, u * 6);
            if (u >= 1) { this.group.remove(f.obj); this.flights.splice(i, 1); }
        }
    }
    /** The creature inside a pod is gone and the pod rocks in its place (three rocks, as in 2D); a hop is a leap with a squash. */
    private critStep(v: View, e: Extract<Ent, { k: 'crit' }>, dt: number, t: number) {
        if ((v.podWait ?? 0) > 0) v.podWait = (v.podWait ?? 0) - dt;
        const inPod = (e.st ?? 0) === 2 && (v.podWait ?? 0) <= 0;
        v.model.obj.visible = !inPod;
        if (inPod) {
            if (!v.pod) {
                v.pod = dropModel(e.cat?.pod ?? 'pod').obj;
                v.pod.scale.setScalar(1.15);
                this.group.add(v.pod);
            }
            const a = e.a ?? 0, shaking = (a < 1.55 && a > 1.25) || (a < 1.05 && a > 0.75) || (a < 0.55 && a > 0.25);
            v.pod.visible = true;
            v.pod.position.set(v.x, groundY(v.x, v.z) + 0.3, v.z);
            v.pod.rotation.set(0, 0, shaking ? Math.sin(t * 26) * 0.45 : 0);
        } else if (v.pod) v.pod.visible = false;
        const o = v.model.obj;
        let sx = 1, sy = 1;
        if (v.hop && !inPod) {
            v.hop.t += dt;
            const p = Math.min(1, v.hop.t / v.hop.dur), air = Math.abs(Math.sin(p * Math.PI * 2)), rest = 1 - p;
            o.position.y += air * 0.5 * (1 - p * 0.3);
            sx *= 1 + (1 - air) * 0.09 * rest; sy *= 1 - (1 - air) * 0.11 * rest;
            if (p >= 1) v.hop = undefined;
        }
        if (v.lunge && !inPod) {
            v.lunge.t += dt;
            const p = Math.min(1, v.lunge.t / v.lunge.dur), s = Math.sin(p * Math.PI);
            o.position.x += v.lunge.dx * s; o.position.z += v.lunge.dz * s; o.position.y += s * 0.2;
            sx *= 1 + s * 0.12; sy *= 1 - s * 0.08;
            if (p >= 1) v.lunge = undefined;
        }
        if (sx !== 1 || sy !== 1) o.scale.set(sx, sy, sx);
        else if (!v.born && (o.scale.x !== 1 || o.scale.y !== 1)) o.scale.set(1, 1, 1);
    }
    /** A joining piece appeared or went: its neighbours of the same family redraw with their new connections. */
    refreshAround(e: BuildE) {
        const [w, h] = BUILDINGS[e.kind].size;
        const near = new Set<number>();
        for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
            if ((i === -1 || i === w) === (j === -1 || j === h)) continue;
            for (const v of this.views.values()) if (v.e.k === 'bld' && v.e.id !== e.id && v.e.tx <= e.tx + i && v.e.tx + BUILDINGS[v.e.kind].size[0] > e.tx + i && v.e.ty <= e.ty + j && v.e.ty + BUILDINGS[v.e.kind].size[1] > e.ty + j) near.add(v.e.id);
        }
        for (const id of near) {
            const v = this.views.get(id);
            if (!v || v.e.k !== 'bld') continue;
            const f = familyOf(v.e.kind);
            if (!f) continue;
            const mask = this.maskAt(v.e, f);
            if (mask === v.mask) continue;
            this.group.remove(v.model.obj);
            v.model.dispose?.();
            const [bw, bh] = BUILDINGS[v.e.kind].size;
            const m = buildingModel(v.e.kind, { rot: v.e.rot ?? 0, seed: v.e.id, mask });
            m.apply?.(v.e);                                     // (its state carries over: a hurt wall keeps its cracks)
            if (snowy(v.e.kind)) dressSnow(m.obj);
            m.obj.position.set(v.e.tx + bw / 2, 0, v.e.ty + bh / 2);
            this.group.add(m.obj);
            v.model = m;
            v.mask = mask;
        }
    }
    has(id: number) {
        return this.views.has(id);
    }
    /** Placing and the pointer need to know what is on a tile. */
    buildingAt(tx: number, ty: number) {
        for (const v of this.views.values()) if (v.e.k === 'bld') {
            const [w, h] = BUILDINGS[v.e.kind].size;
            if (tx >= v.e.tx && tx < v.e.tx + w && ty >= v.e.ty && ty < v.e.ty + h) return v.e;
        }
        return null;
    }
    /** The farmers (including you). `dt`: seconds since the last frame. */
    setFarmer(id: string, p: PlayerView, x: number, z: number, fx: number, fy: number, moving: boolean, swing: number, hold?: string | null, dt = 1 / 60) {
        let f = this.farmers.get(id);
        const key = JSON.stringify([p.look ?? null, p.color, p.equip ?? null]);
        if (!f) {
            const m = farmerModel(p.look, p.color, p.equip);
            this.group.add(m.obj);
            f = { m, x, z, face: 0, moving, sx: x, sz: z, key };
            this.farmers.set(id, f);
        } else if (f.key !== key) {
            f.m.dress(p.look, p.color, p.equip);
            f.key = key;
        }
        f.x = x;
        f.z = z;
        f.moving = moving;
        f.m.obj.position.set(x, groundY(x, z) + (p.ride ? 0.5 : 0), z);        // (riding: up on the mount's back)
        f.m.hold?.(hold);
        f.m.pose(fx, fy, moving, swing, p.downed > 0, dt);
        f.m.react(p.hearts, p.invuln ?? 0, p.downed > 0, dt, !!p.cl);
        f.m.status(p.co);
        f.co = p.co?.k === 'tether' ? p.co.w : undefined;
        f.m.obj.visible = true;
    }
    dropFarmer(id: string) {
        const f = this.farmers.get(id);
        if (f) {
            this.group.remove(f.m.obj);
            f.m.dispose?.();
            this.farmers.delete(id);
        }
    }
    farmerIds() {
        return [...this.farmers.keys()];
    }
    /** The chains between tethered farmers (one per pair, its links reused), laid between them every frame. */
    chains = new Map<string, Object3D[]>();
    drawChains(t: number) {
        const seen = new Set<string>();
        for (const [id, f] of this.farmers) {
            const o = f.co ? this.farmers.get(f.co) : undefined;
            if (!o || !f.co) continue;
            const key = id < f.co ? `${id}|${f.co}` : `${f.co}|${id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            let links = this.chains.get(key);
            if (!links) {
                links = Array.from({ length: 14 }, () => STATUS_MODELS.tether());
                for (const l of links) this.group.add(l);
                this.chains.set(key, links);
            }
            layChain(links, f.x, f.z, o.x, o.z, t);
        }
        for (const [key, links] of this.chains) if (!seen.has(key)) { for (const l of links) this.group.remove(l); this.chains.delete(key); }
    }
    /** Animate what is near (cx, cz). `near`: how far (tiles) things are shown and animated; the game's view passes what its camera
     * sees plus a margin (budget.ts `reach`), the prototype keeps the wide default. */
    update(dt: number, t: number, cx: number, cz: number, near?: { rx: number; rz: number }) {
        const k = Math.min(1, dt * 14);
        const mx = near?.rx ?? 60, mz = near?.rz ?? 50, sx = near?.rx ?? 70, sz = near?.rz ?? 60;
        for (const v of this.views.values()) {
            const e = v.e;
            if (e.k === 'mob' || e.k === 'crit' || e.k === 'drop' || e.k === 'proj') {
                const ex = px(e.x), ez = px(e.y);
                const seen = Math.abs(ex - cx) < mx && Math.abs(ez - cz) < mz;
                v.model.obj.visible = seen;
                if (v.bar && !seen) v.bar.visible = false;
                if (!seen) {
                    v.x = ex;
                    v.z = ez;
                    continue;
                }
                v.x += (ex - v.x) * k;
                v.z += (ez - v.z) * k;
                const dx = v.x - v.px, dz = v.z - v.pz, sp = Math.hypot(dx, dz) / Math.max(dt, 0.0001);
                v.moving = sp > 0.6;
                if (v.moving) v.face = Math.atan2(dx, dz);
                v.px = v.x;
                v.pz = v.z;
                v.model.obj.position.set(v.x, groundY(v.x, v.z), v.z);
                if (e.k === 'mob' && (e.rd || v.wade)) this.wadeStep(v, e.kind, !!e.rd, dt);
                v.hurt = Math.max(0, v.hurt - dt * 4);
                if (e.k === 'mob') v.model.pose?.(v.face, v.moving, v.hurt, dt);
                // a den worker with nothing to do curls up and sleeps (the rig's z's) until its next job
                else if (e.k === 'crit') { v.model.pose?.(v.face, v.moving, e.mode === 2 && e.ac === 'idle' && !v.moving, dt); this.critStep(v, e, dt, t); }
                if (e.k === 'mob' && e.hp < e.mhp) this.hpBar(v, e.hp / e.mhp, 1.9, v.model.obj.position.y); // a monster's entity carries no radius: every bar sits at the same height
                else if (v.bar) v.bar.visible = false;
                if (v.born) this.bornStep(v, dt);
            } else {
                const dxn = Math.abs(v.x - cx), dzn = Math.abs(v.z - cz);
                if (dxn > sx || dzn > sz) {
                    v.model.obj.visible = false;
                    continue;
                }
                v.model.obj.visible = true;
                if (v.born) this.bornStep(v, dt);
            }
            v.model.update?.(dt, t);
        }
        this.updateLeaving(dt, t);
        this.updateFlights(dt);
        this.drawChains(t);
    }
    /**
     * A Blight raider in the sea wades (the 2D BlightFx.wade): it sinks to the waist (gliding down off the shore and back up onto
     * land), leaves foam on the water, and its hp bar rides lower with it. A flier never wades.
     */
    private wadeStep(v: View, kind: string, raider: boolean, dt: number) {
        const def = MOBS[kind as keyof typeof MOBS] as { r?: number; flies?: boolean } | undefined;
        const wet = raider && !def?.flies && !this.world.isLand(Math.floor(v.x), Math.floor(v.z));
        const w = (v.wade ?? 0) + ((wet ? 1 : 0) - (v.wade ?? 0)) * Math.min(1, dt * 5);
        v.wade = w < 0.01 && !wet ? 0 : w;
        if (!v.wade) return;
        const r = def?.r ?? 6;
        v.model.obj.position.y += (WATER_Y - wadeDepth(r)) * v.wade;
        if (v.wade > 0.6) this.wading?.step(v.e.id, v.x, v.z, Math.max(0.3, (r / TILE) * 1.3), v.moving, dt);
    }
    private updateLeaving(dt: number, t: number) {
        for (let i = this.leaving.length - 1; i >= 0; i--) {
            const l = this.leaving[i];
            l.t += dt;
            const dur = l.k === 'drop' ? 0.28 : 0.32, u = Math.min(1, l.t / dur);
            if (l.k === 'drop') {
                const e = u * u;
                const x = l.x + (l.tx - l.x) * e, z = l.z + (l.tz - l.z) * e;
                l.obj.position.set(x, groundY(x, z) + Math.sin(u * Math.PI) * 0.5, z);
                l.obj.scale.setScalar(Math.max(0.001, 1 - u * 0.7));
                l.model.update?.(dt, t);
            } else {
                l.obj.scale.set(Math.max(0.001, 1 + u * 0.25 - u * u * 1.25), Math.max(0.001, 1 - u), Math.max(0.001, 1 + u * 0.25 - u * u * 1.25));
                l.model.pose?.(l.face, false, 1 - u, dt);
            }
            if (u >= 1) {
                this.group.remove(l.obj);
                l.model.dispose?.();
                this.gone?.(l.obj);
                this.leaving.splice(i, 1);
            }
        }
    }
    /** Roofs fade away while the farmer is under one (like the game's), so the rooms show. */
    fadeRoofs(under: boolean, dt: number, px: number, pz: number) {
        for (const v of this.views.values()) {
            if (v.e.k !== 'bld' || !BUILDINGS[v.e.kind].roof) continue;
            const target = under && Math.abs(v.x - px) < 10 && Math.abs(v.z - pz) < 10 ? 0 : 1;
            let a = v.roofA ?? 1;
            if (a === target) continue;
            a += (target - a) * Math.min(1, dt * 7);
            if (Math.abs(a - target) < 0.02) a = target;
            v.roofA = a;
            const fm = v.model.fade;
            if (fm) {
                fm.call(v.model, a);
                continue;
            }
            if (!v.fade) {
                v.fade = [];
                v.model.obj.traverse((o) => {
                    const m = o as Mesh;
                    if (!m.isMesh) return;
                    const list = Array.isArray(m.material) ? m.material : [m.material], own = list.map((q: Material) => {
                        const c = q.clone();
                        c.transparent = true;
                        v.fade!.push(c);
                        return c;
                    });
                    m.material = Array.isArray(m.material) ? own : own[0];
                });
            }
            for (const m of v.fade) m.opacity = a;
            v.model.obj.visible = a > 0.03;
        }
    }
    hpBar(v: View, frac: number, h: number, base = 0) {
        if (!v.bar) {
            const g = new Group();
            const back = new Mesh(new PlaneGeometry(0.9, 0.12), this.hpBack), fill = new Mesh(new PlaneGeometry(0.9, 0.12), this.hpMat);
            fill.position.z = 0.001;
            back.renderOrder = 20;
            fill.renderOrder = 21;
            g.add(back, fill);
            g.userData.fill = fill;
            g.rotation.x = -(Math.PI / 2 - 1.05);
            this.group.add(g);
            v.bar = g;
        }
        v.bar.visible = true;
        v.bar.position.set(v.x, base + 1 + h * 0.7, v.z + 0.2);
        const fill = v.bar.userData.fill as Mesh;
        fill.scale.x = Math.max(0.02, frac);
        fill.position.x = -0.45 * (1 - frac);
    }
}
