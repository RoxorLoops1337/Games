// Shared helpers for work buildings: on / working tests, facing, halos, smoke and sparks, item colours and chips, material ramps.
import * as THREE from 'three';
import { type ItemId, ITEMS } from '../../shared/data/items';
import type { BuildE } from '../../shared/sim/types';
import { RAMP } from './data';
import { bake, Bld, clamp, type Col, type ColorFn, env, hash3, M, pick, type Xf } from './kit';

export const isOn = (e: BuildE) => (e.fuel ?? 0) > 0 || (e.prog ?? 0) > 0 || (e.act ?? 0) > 0 && (e.pw ?? 0) > 0.05;
export const isWorking = (e: BuildE) => (e.act ?? 0) > 0 && (e.pw ?? 0) > 0.05;
export function dirWrap(rot: number, inner: THREE.Object3D) {
    const g = new THREE.Group();
    g.rotation.y = -(rot & 3) * Math.PI / 2;
    g.add(inner);
    return g;
}
export const BIT = [2, 4, 8, 1];
export function localMask(mask: number, rot: number) {
    const has = (l: number) => (mask & BIT[rot + l & 3]) !== 0;
    return { fwd: has(0), right: has(1), back: has(2), left: has(3) };
}
export let haloTex: THREE.CanvasTexture | null = null;
export function haloTexture() {
    if (haloTex) return haloTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    return haloTex;
}
export const haloMats = new Map<number, THREE.MeshBasicMaterial>();
export function haloMat(color: number) {
    let m = haloMats.get(color);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ map: haloTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 });
        haloMats.set(color, m);
    }
    return m;
}
export let haloGeo: THREE.BufferGeometry | null = null;
export function halo(color: number, radius: number, y = 0.04) {
    if (!haloGeo) haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(haloGeo, haloMat(color));
    m.scale.set(radius * 2, 1, radius * 2);
    m.position.y = y;
    m.renderOrder = 3;
    return m;
}
export function setHalo(color: number, day: number, night: number) {
    haloMat(color).opacity = day + (night - day) * clamp(env.night);
}
/** A little column of smoke or steam (or sparks, with `glow`): how many puffs, colour, where, how far they rise and drift, size, period, spread, phase. */
export interface PuffOpts { n?: number; color?: number; glow?: number; x?: number; y?: number; z?: number; rise?: number; dx?: number; dz?: number; size?: number; period?: number; spread?: number; phase?: number }
export function puffs(o: PuffOpts) {
    const n = o.n ?? 4, color = o.color ?? 0xe6e2ee, group = new THREE.Group(), list: THREE.Group[] = [];
    const key = `puff|${color}|${o.glow ?? 0}`;
    for (let i = 0; i < n; i++) {
        const p = bake(key, (mb) => {
            (o.glow ? mb.glow(color, o.glow) : mb.main).oct(0.1, color, { j: 0.03, ao: false, v: 0.05 });
        });
        group.add(p);
        list.push(p);
    }
    const x0 = o.x ?? 0, y0 = o.y ?? 0, z0 = o.z ?? 0, rise = o.rise ?? 0.5, dx = o.dx ?? 0.1, dz = o.dz ?? 0, size = o.size ?? 1, per = o.period ?? 2.4, sp = o.spread ?? 0.04, ph0 = o.phase ?? 0;
    group.visible = false;
    return {
        group,
        update(t: number, on: boolean) {
            if (group.visible !== on) group.visible = on;
            if (!on) return;
            const wind = 0.6 + env.wind * 0.8;
            for (let i = 0; i < n; i++) {
                const k = ((t / per + i / n + ph0) % 1 + 1) % 1;
                const p = list[i];
                p.position.set(x0 + dx * wind * k + Math.sin(k * 7 + i * 2.1) * sp, y0 + rise * k, z0 + dz * wind * k + Math.cos(k * 6 + i * 1.3) * sp);
                p.scale.setScalar(size * (0.35 + 0.65 * Math.sin(Math.min(1, k * 1.15) * Math.PI)) * (k < 0.08 ? k / 0.08 : 1));
                p.rotation.y = k * 3 + i;
            }
        }
    };
}
export function sparks(o: PuffOpts) {
    return puffs({ size: 0.45, period: 1.1, rise: 0.4, dx: 0.04, color: 0xffd060, glow: 2.4, spread: 0.07, ...o });
}
export const ITEM_COL: Record<string, number | undefined> = {
    wood: 0xb87a46,
    stone: 0x9ea4b9,
    coal: 0x3a3647,
    iron: 0xc8805a,
    copper: 0xe08a4a,
    goldore: 0xffd966,
    sand: 0xf4deaa,
    clay: 0xc8805a,
    fiber: 0x92d364,
    crystal: 0x7ae0f4,
    peat: 0x65503f,
    herb: 0x5cb04f,
    cotton: 0xfff6e0,
    plank: 0xd89c60,
    brick: 0xc9505a,
    glass: 0xbdf4ee,
    ironbar: 0xc4c9dc,
    copperbar: 0xf5b074,
    goldbar: 0xffd966,
    steel: 0x9496ae,
    cloth: 0xf79fc6,
    rope: 0xd2b283,
    gear: 0x9ea4bf,
    wire: 0xe08a4a,
    circuit: 0x5cb04f,
    flour: 0xfffaf0,
    motor: 0x9d6fdb,
    core: 0x7ae0f4,
    wheat: 0xf0cc58,
    carrot: 0xf8a24a,
    pumpkin: 0xf39a3c,
    berry: 0xe85d62,
    mushroom: 0xe8737a,
    beet: 0xc85a8a,
    corn: 0xf0cc58,
    melon: 0x86d874,
    pepper: 0xe85d62,
    flax: 0x9ac4f4,
    bread: 0xdcaa38,
    coin: 0xffd966
};
export const KIND_COL: Record<string, number | undefined> = { seed: 0xd2b283, food: 0xf8a24a, potion: 0x9d6fdb, gear: 0xb0b5cc, misc: 0xffd966, material: 0xb0b0c0 };
export function itemColor(id: string) {
    if (ITEM_COL[id] !== undefined) return ITEM_COL[id];
    const def: { kind: string } | undefined = ITEMS[id as ItemId];
    return (def && KIND_COL[def.kind]) ?? 0xb0b0c0;
}
export function itemShape(id: string) {
    switch (id) {
        case 'plank':
            return [1.9, 0.55, 0.8];
        case 'ironbar':
        case 'copperbar':
        case 'goldbar':
        case 'steel':
        case 'brick':
        case 'cloth':
            return [1.5, 0.6, 0.85];
        case 'glass':
            return [1.2, 0.5, 1.2];
        case 'wood':
            return [1.7, 0.9, 0.9];
        case 'gear':
        case 'coin':
        case 'circuit':
            return [1.15, 0.45, 1.15];
        case 'wire':
        case 'rope':
        case 'fiber':
            return [1.4, 0.55, 1];
        default:
            return [1, 0.9, 1];
    }
}
export const chipMats = new Map<number, THREE.MeshStandardMaterial>();
export function chipMat(color: number) {
    let m = chipMats.get(color);
    if (!m) {
        m = M(color, { vc: true, r: 0.7 });
        chipMats.set(color, m);
    }
    return m;
}
export let chipGeo: THREE.BufferGeometry | null = null;
export function chipPool(n: number, size = 0.15) {
    if (!chipGeo) chipGeo = new Bld(2).box(1.4, 1.4, 1.4, 0xffffff, { j: 0.22, v: 0.12, ao: false }).build();
    const group = new THREE.Group(), list: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(chipGeo, chipMat(0xb0b0c0));
        m.castShadow = true;
        m.visible = false;
        group.add(m);
        list.push(m);
    }
    return {
        group,
        put(i: number, x: number, y: number, z: number, id: string | null | undefined) {
            const m = list[i];
            if (!id) {
                m.visible = false;
                return;
            }
            m.visible = true;
            m.material = chipMat(itemColor(id));
            const [a, b, c] = itemShape(id);
            m.scale.set(size * a, size * b, size * c);
            m.position.set(x, y + size * b * 0.8, z);
            m.rotation.y = i * 1.3 + 0.3;
        }
    };
}
export const ramped = (R: readonly number[]) => (base = 0.55, n = 0.2, seed = 0, lift = 0.1): ColorFn => (x: number, y: number, z: number) => pick(R, clamp(base + (-x - z) * lift + (y - 0.4) * 0.1 + (hash3(x * 13 + seed, y * 13, z * 13) - 0.5) * n));
export const WL = [0x7a4c34, 0x9a6038, 0xc07e48, 0xdea264, 0xf0bc7c];
export const IL = [0x585468, 0x74728c, 0x9496b2, 0xb8bdd2];
export const SL = [0x5f6480, 0x7e84a2, 0x9ba1bb, 0xb9bfd4];
export const wc = ramped(WL);
export const sc = ramped(SL);
export const ic = ramped(IL);
export const cc = ramped(RAMP.clay);
export function taper(b: Bld, bw: number, bd: number, tw: number, td: number, y0: number, y1: number, c: Col, t?: Xf, cx = 0, cz = 0, tcx = cx, tcz = cz) {

    return b.hull([
        [cx - bw, y0, cz - bd],
        [cx + bw, y0, cz - bd],
        [cx + bw, y0, cz + bd],
        [cx - bw, y0, cz + bd],
        [tcx - tw, y1, tcz - td],
        [tcx + tw, y1, tcz - td],
        [tcx + tw, y1, tcz + td],
        [tcx - tw, y1, tcz + td]
    ], c, t);
}
export const W = RAMP.wood;
export const ST = RAMP.stone;
export const IR = RAMP.steel;
export const BR = RAMP.brass;
export const CL = RAMP.clay;
