// The entity layer: one model per node, building, monster, creature, drop and shot, kept in step with the simulation; farmers; joining walls and belts; hp bars; fading roofs.
import { Group, IcosahedronGeometry, type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene } from 'three';
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
/** What the view keeps for one entity: its latest state, its model, where it is drawn and facing, the hurt flash, hp, how it joins
 * its family, its hp bar and the roof fade. */
export interface View {
    e: Ent; model: Model; x: number; z: number; face: number; px: number; pz: number; moving: boolean; hurt: number; hp: number; mask: number;
    bar?: Group; roofA?: number; fade?: Material[];
}
/** A farmer on screen: the model, where it is, facing and walking, and the look it was dressed in. */
export interface FarmerView { m: Farmer; x: number; z: number; face: number; moving: boolean; sx: number; sz: number; key: string }
export class Entities {
    world: World;
    group = new Group();
    views = new Map<number, View>();
    farmers = new Map<string, FarmerView>();
    /** Which building family stands on which tile (for joining walls, floors, belts…). */
    fam = new Map<number, string>();
    hpMat = new MeshBasicMaterial({ color: 0xe85d62, depthTest: false, transparent: true });
    hpBack = new MeshBasicMaterial({ color: 0x2a1d2c, depthTest: false, transparent: true, opacity: 0.85 });
    shotGeo = new IcosahedronGeometry(0.16, 0);
    shotMat = new MeshStandardMaterial({ color: 0xffd966, emissive: 0xffa040, emissiveIntensity: 2, flatShading: true });
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
                model = nodeModel(e.kind, { biome, gold: !!e.gold, seed: e.id });
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
            default: {
                const m = new Mesh(this.shotGeo, this.shotMat);
                m.castShadow = false;
                const g = new Group();
                g.add(m);
                m.position.y = 0.6;
                model = { obj: g };
                x = px(e.x);
                z = px(e.y);
            }
        }
        model.obj.position.set(x, groundY(x, z), z);
        this.group.add(model.obj);
        return { e, model, x, z, face: 0, px: x, pz: z, moving: false, hurt: 0, hp: e.k === 'mob' ? e.hp : 0, mask };
    }
    /** The simulation sent this entity (new, or changed). */
    upsert(e: Ent) {
        const old = this.views.get(e.id);
        if (e.k === 'bld') {
            const f = familyOf(e.kind), [w, h] = BUILDINGS[e.kind].size;
            if (f) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.fam.set(this.tileKey(e.tx + i, e.ty + j), f);
        }
        if (!old) {
            const v = this.make(e);
            if (!v) return;
            this.views.set(e.id, v);
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
        this.group.remove(v.model.obj);
        v.model.dispose?.();
        if (v.bar) this.group.remove(v.bar);
        this.views.delete(id);
        if (v.e.k === 'bld' && familyOf(v.e.kind)) this.refreshAround(v.e);
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
    /** The farmers (including you). */
    setFarmer(id: string, p: PlayerView, x: number, z: number, fx: number, fy: number, moving: boolean, swing: number, hold?: string | null) {
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
        f.m.obj.position.set(x, groundY(x, z), z);
        f.m.hold?.(hold);
        f.m.pose(fx, fy, moving, swing, p.downed > 0, 1 / 60);
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
    update(dt: number, t: number, cx: number, cz: number) {
        const k = Math.min(1, dt * 14);
        for (const v of this.views.values()) {
            const e = v.e;
            if (e.k === 'mob' || e.k === 'crit' || e.k === 'drop' || e.k === 'proj') {
                const ex = px(e.x), ez = px(e.y);
                const near = Math.abs(ex - cx) < 60 && Math.abs(ez - cz) < 50;
                v.model.obj.visible = near;
                if (!near) {
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
                v.hurt = Math.max(0, v.hurt - dt * 4);
                if (e.k === 'mob') v.model.pose?.(v.face, v.moving, v.hurt, dt);
                else if (e.k === 'crit') v.model.pose?.(v.face, v.moving, e.st === 1 ? false : false, dt);
                if (e.k === 'mob' && e.hp < e.mhp) this.hpBar(v, e.hp / e.mhp, 1.9); // a monster's entity carries no radius: every bar sits at the same height
                else if (v.bar) v.bar.visible = false;
            } else {
                const dxn = Math.abs(v.x - cx), dzn = Math.abs(v.z - cz);
                if (dxn > 70 || dzn > 60) {
                    v.model.obj.visible = false;
                    continue;
                }
                v.model.obj.visible = true;
            }
            v.model.update?.(dt, t);
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
    hpBar(v: View, frac: number, h: number) {
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
        v.bar.position.set(v.x, 1 + h * 0.7, v.z + 0.2);
        const fill = v.bar.userData.fill as Mesh;
        fill.scale.x = Math.max(0.02, frac);
        fill.position.x = -0.45 * (1 - frac);
    }
}
