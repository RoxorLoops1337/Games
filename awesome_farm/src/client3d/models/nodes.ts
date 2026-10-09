// Resource node models: trees, rocks, ores, sand, clay, peat, crystal, plants, chests, vaults and treasure mounds, with golden variants.
import * as THREE from 'three';
import { type NodeKind, NODES } from '../../shared/data/nodes';
import type { NodeE } from '../../shared/sim/types';
import { PAL } from '../../shared/palette';
import { RAMP } from './data';
import { bake, Bld, byHeight, type Model, type Xf, clamp, env, grad, hash, lighten, MB, mix, seedRand, smooth, TAU } from './kit';
import { nestNode } from './nodes-nest';
import { titan } from './nodes-titan';

export const L = RAMP.leaf;
export const ST = RAMP.stone;
export const W = RAMP.wood;
export const GOLD_LEAF = [0xa8741a, 0xd89a20, 0xffd966, 0xfff0a0, 0xfffbd0];
/** A node's model: the object, the body that sways and squashes when hit, how much it sways, and its own per-frame extras. */
export interface NodeRig { obj: THREE.Group; body: THREE.Group; swayAmp: number; extra?: (dt: number, t: number) => void; /** the node's health changed (0..1) */ onHp?: (f: number) => void }
/** What a node model is made from: the island's biome, golden or not, and a seed for variety. */
export interface NodeOpts { biome: string; gold: boolean; seed: number; /** a Blight nest: its plot's level now (`Plot.nl`) */ level?: () => number }
export type Rand = () => number;
export function rig(swayAmp = 0): NodeRig {
    const obj = new THREE.Group(), body = new THREE.Group();
    obj.add(body);
    return { obj, body, swayAmp };
}
export const glowTex = (() => {
    const n = 32, d = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const r = Math.hypot((x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1), a = Math.max(0, 1 - r), k = Math.round(255 * a * a * (3 - 2 * a));
        d.set([255, 255, 255, k], (y * n + x) * 4);
    }
    const t2 = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
    t2.needsUpdate = true;
    t2.colorSpace = THREE.SRGBColorSpace;
    t2.magFilter = THREE.LinearFilter;
    t2.minFilter = THREE.LinearFilter;
    return t2;
})();
export const glowDiscMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffd966, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
export let glowDiscGeo: THREE.CircleGeometry | null = null;
export function goldAura(r: NodeRig, rad = 0.55, height = 0.9) {
    if (!glowDiscGeo) glowDiscGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(glowDiscGeo, glowDiscMat);
    disc.scale.setScalar((rad || 0.001) * 1.5);
    disc.position.y = 0.025;
    disc.renderOrder = 2;
    disc.visible = rad > 0;
    disc.userData.glow = true;
    r.obj.add(disc);
    const sr = rad || 0.55;
    const sp = bake('gold.sparkle', (mb) => {
        mb.glow(0xffe680, 2.6).oct(0.07, 0xffe680, { sy: 1.5, ao: false, v: 0 });
    });
    const stars: { g: THREE.Group; a: number; ph: number; h: number; }[] = [];
    for (let i = 0; i < 4; i++) {
        const g = bake('gold.sparkle', (mb) => {
            mb.glow(0xffe680, 2.6).oct(0.07, 0xffe680, { sy: 1.5, ao: false, v: 0 });
        });
        r.obj.add(g);
        stars.push({ g, a: i / 4 * TAU, ph: i * 1.7, h: height * (0.45 + 0.2 * i) });
    }
    void sp;
    const prev = r.extra;
    r.extra = (dt: number, t2: number) => {
        prev?.(dt, t2);
        if (rad) disc.scale.setScalar(rad * 1.5 * (1 + 0.08 * Math.sin(t2 * 2.4)));
        for (const s of stars) {
            const a = s.a + t2 * 0.5, k = 0.5 + 0.5 * Math.sin(t2 * 3.1 + s.ph);
            s.g.position.set(Math.cos(a) * sr * 0.8, s.h + Math.sin(t2 * 1.6 + s.ph) * 0.1, Math.sin(a) * sr * 0.8);
            s.g.rotation.y = t2 * 2 + s.ph;
            s.g.scale.setScalar(0.4 + k * 0.9);
        }
    };
}
export function treeKind(biome: string, r: Rand) {
    const x = r();
    switch (biome) {
        case 'snowcap':
            return x < 0.68 ? 'pine' : 'snowy';
        case 'goldsand':
            return x < 0.66 ? 'palm' : 'round';
        case 'bog':
            return x < 0.36 ? 'dead' : 'bog';
        case 'quarry':
            return x < 0.5 ? 'round' : x < 0.75 ? 'dead' : 'tall';
        default:
            return x < 0.42 ? 'round' : x < 0.72 ? 'apple' : 'tall';
    }
}
export function treeRamp(kind: string, biome: string, gold: boolean) {
    if (gold) return GOLD_LEAF;
    if (kind === 'bog') return [0x233f40, 0x2f5a52, 0x45795f, 0x6a9a70];
    if (kind === 'snowy') return RAMP.pine;
    if (biome === 'goldsand') return [0x4a6a34, 0x6a8a3e, 0x92ad4c, 0xbcd468];
    if (biome === 'quarry') return [0x35603a, 0x517f44, 0x74a14e, 0x9cc464];
    return L;
}
export const trunkCol = (gold: boolean, dead = false) => (x: number, y: number, z: number) => pickTrunk(gold ? RAMP.brass : dead ? [0x4a3e4a, 0x6a5a66, 0x8a7a80, 0xa8989a] : W, clamp(0.5 + (-x - z) * 0.8 + (hash(y * 40, x * 40) - 0.5) * 0.4));
export const pickTrunk = (R: readonly number[], t2: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t2 * (R.length - 1))))];
export function buildTree(b: Bld, kind: string, ramp: readonly number[], gold: boolean, r: Rand, sc: number, mbGlow?: MB) {
    const tc = trunkCol(gold, kind === 'dead');
    const lean = (r() - 0.5) * 0.1;
    if (kind === 'pine') {
        b.cyl(0.07 * sc, 0.12 * sc, 0.55 * sc, 6, tc, { y: 0.27 * sc, j: 0.02 });
        const tiers = [[0.18, 0.62, 0.62], [0.55, 0.52, 0.56], [0.9, 0.42, 0.5], [1.22, 0.3, 0.46]];
        tiers.forEach(([y, rad, h], i) => {
            b.cone(rad * sc, h * sc, 6, byHeight(RAMP.pine, y * sc, (y + h) * sc, 0.5, i), { y: (y + h / 2) * sc + 0.3 * sc, ry: i * 0.7, j: 0.06 });
            b.cone(rad * 0.66 * sc, h * 0.66 * sc, 6, (x: number, yy: number, z: number) => hash3s(x, yy, z) < 0.25 ? 0xdcecf4 : 0xf4fbff, { y: (y + h * 0.66) * sc + 0.3 * sc + 0.02, ry: i * 0.7 + 0.2, j: 0.05, ao: false });
        });
        return;
    }
    if (kind === 'palm') {
        const pts = [[0, 0, 0], [0.04, 0.45, 0.02], [0.14, 0.9, 0], [0.2, 1.3, -0.04], [0.2, 1.62, -0.06]];
        for (let i = 0; i < pts.length - 1; i++) b.rod(pts[i], pts[i + 1], 0.07 * (1 - i * 0.1) * sc, 6, tc, 0.06 * (1 - i * 0.1) * sc, { j: 0.015 });
        const top = pts[pts.length - 1];
        const fc = (x: number, y: number, z: number) => pickTrunk(gold ? GOLD_LEAF : [0x3a6a3a, 0x5a8f3e, 0x86bc4c, 0xb8de6a], clamp(0.45 + (y - 1.4) * 0.8 + (hash3s(x, y, z) - 0.5) * 0.7));
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU + r() * 0.3, droop = 0.5 + r() * 0.4;
            const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
            const P = (t2: number, w: number, y: number) => [[top[0] + dx * t2 + nx * w, top[1] + y, top[2] + dz * t2 + nz * w], [top[0] + dx * t2 - nx * w, top[1] + y, top[2] + dz * t2 - nz * w]];
            b.hull([[top[0], top[1] - 0.02, top[2]], ...P(0.3, 0.13, 0.16), ...P(0.52, 0.12, 0.17), [top[0] + dx * 0.34, top[1] + 0.2, top[2] + dz * 0.34], [top[0] + dx * 0.84, top[1] - droop * 0.5, top[2] + dz * 0.84]], fc, { j: 0.018 });
        }
        for (let i = 0; i < 3; i++) {
            const a = i * 2.1 + 0.4;
            b.ico(0.075, 0, gold ? 0xffd966 : 0x6a432f, { x: top[0] + Math.cos(a) * 0.11, y: top[1] - 0.1, z: top[2] + Math.sin(a) * 0.11, j: 0.01 });
        }
        void mbGlow;
        return;
    }
    if (kind === 'dead') {
        const pts = [[0, 0, 0], [0.05, 0.4, 0.02], [-0.02, 0.85, 0.04], [0.06, 1.3, 0]];
        for (let i = 0; i < pts.length - 1; i++) b.rod(pts[i], pts[i + 1], 0.12 * (1 - i * 0.25) * sc, 6, tc, 0.12 * (1 - (i + 1) * 0.25) * sc, { j: 0.02 });
        const br = [[0.03, 0.65, 0.03, -0.35, 1.05, 0.08], [0, 0.9, 0.03, 0.4, 1.3, -0.1], [0.05, 1.15, 0, -0.2, 1.55, -0.12], [0.06, 1.3, 0, 0.2, 1.7, 0.1]];
        for (const [x0, y0, z0, x1, y1, z1] of br) {
            b.rod([x0, y0, z0], [x1, y1, z1], 0.045, 5, tc, 0.015, { j: 0.01 });
            b.rod([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 + (x1 > 0 ? 0.12 : -0.12), y1 + 0.12, z1 + 0.1], 0.025, 4, tc, 0.008);
        }
        return;
    }
    const tall = kind === 'tall', bog = kind === 'bog';
    const th = (tall ? 0.95 : 0.7) * sc;
    b.cyl(0.08 * sc, 0.15 * sc, th, 6, tc, { y: th / 2, rz: lean, j: 0.025 });
    for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + r();
        b.tet(0.07 * sc, tc, { x: Math.cos(a) * 0.12 * sc, y: 0.04, z: Math.sin(a) * 0.12 * sc, ry: a, j: 0.01 });
    }
    const cy = th + (tall ? 0.46 : 0.38) * sc;
    const cr = (tall ? 0.4 : 0.46) * sc;
    const col = byHeight(ramp, cy - cr * 1.1, cy + cr * 1.35, 0.55);
    const big = kind === 'apple' ? 0 : 1;
    b.ico(cr, 1, col, { y: cy, sy: tall ? 1.3 : 0.9, j: 0.15 * sc, x: lean * 2 });
    const blobs = tall ? [[0.2, -0.28, 0.12, 0.3], [-0.18, 0.2, -0.1, 0.28], [0.02, 0.62, 0.02, 0.28]] : [[0.34, -0.1, 0.08, 0.34], [-0.3, -0.02, -0.14, 0.34], [0.04, 0.4, -0.04, 0.3]];
    blobs.forEach(([x, y, z, rr], i) => b.ico(rr * sc, i === 2 ? 0 : big, col, { x: x * sc, y: cy + y * sc, z: z * sc, j: 0.12 * sc }));
    if (bog) {
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * TAU + r() * 0.5, rad = cr * (0.75 + r() * 0.2);
            b.cone(0.045, 0.34 + r() * 0.2, 4, (x: number, y: number, z: number) => pickTrunk([0x2a5a4a, 0x4a7a64, 0x7aa088], clamp((y - 0.5) * 1.5 + (hash3s(x, y, z) - 0.5) * 0.5)), { x: Math.cos(a) * rad, y: cy - cr * 0.55, z: Math.sin(a) * rad, rx: Math.PI, j: 0.02 });
        }
    }
    if (kind === 'apple') for (let i = 0; i < 6; i++) {
        const a = i * 2.4 + r(), h = (r() - 0.35) * 0.7, rad = cr * 0.98 * Math.sqrt(Math.max(0.2, 1 - h * h));
        b.oct(0.075, RAMP.red[i % 2 + 2], { x: Math.cos(a) * rad * 0.97, y: cy + h * cr, z: Math.sin(a) * rad * 0.97, j: 0.005, ao: false });
    }
    if (kind === 'snowy') {
        b.ico(cr * 0.78, 0, 0xf4fbff, { y: cy + cr * 0.52, sy: 0.55, j: 0.1, ao: false });
        for (const [x, z] of [[0.3, 0.1], [-0.28, -0.1]]) b.ico(0.2 * sc, 0, 0xdcecf4, { x: x * sc, y: cy + cr * 0.4, z: z * sc, sy: 0.5, j: 0.06, ao: false });
    }
}
export const hash3s = (x: number, y: number, z: number) => hash(x * 12.9 + z * 4.1, y * 78.2 + z * 17.1);
export function tree(o: NodeOpts): NodeRig {
    const r0 = seedRand(o.seed * 7919 + 13), kind = treeKind(o.biome, r0);
    const sc = (0.9 + r0() * 0.22) * (kind === 'tall' ? 1 : 1);
    const rg = rig(0.012);
    const key = `tree|${kind}|${o.biome}|${o.gold ? 'g' : ''}|${o.seed % 9}`;
    const g = bake(key, (mb) => {
        const r = seedRand(o.seed * 31 + 5);
        buildTree(mb.main, kind, treeRamp(kind, o.biome, o.gold), o.gold, r, sc);
    }, o.seed);
    rg.body.add(g);
    rg.swayAmp = kind === 'pine' ? 0.008 : kind === 'dead' ? 0.004 : 0.013;
    if (o.gold) goldAura(rg, 0.62, 1.5);
    return rg;
}
export function rockRamp(biome: string) {
    if (biome === 'quarry') return [0x6c5a62, 0x8c7a80, 0xb09ea0, 0xd2c4c0];
    if (biome === 'goldsand') return [0x9a7a54, 0xbf9c6a, 0xdcbc86, 0xf0d9a6];
    if (biome === 'bog') return [0x2f2c3e, 0x45405a, 0x5e5976, 0x7d7896];
    return [ST[0], ST[1], ST[2], ST[3], ST[4]];
}
export function boulder(b: Bld, ramp: readonly number[], r: Rand, s = 1, biome = 'meadow', gold = false) {
    const col = byHeight(gold ? RAMP.gold : ramp, -0.05 * s, 0.7 * s, 0.7);
    b.dode(0.48 * s, col, { y: 0.27 * s, sx: 1.12, sy: 0.74, sz: 1, ry: r() * TAU, j: 0.16 * s });
    b.dode(0.27 * s, col, { x: 0.38 * s, y: 0.13 * s, z: 0.14 * s, sy: 0.7, ry: r() * TAU, j: 0.09 * s });
    b.dode(0.2 * s, col, { x: -0.34 * s, y: 0.09 * s, z: -0.22 * s, sy: 0.7, ry: r() * TAU, j: 0.07 * s });
    if (biome === 'meadow' && !gold) b.ico(0.2 * s, 0, (x: number, y: number, z: number) => pickTrunk(L, 0.3 + hash3s(x, y, z) * 0.5), { x: -0.14 * s, y: 0.43 * s, z: -0.06 * s, sy: 0.35, j: 0.06 });
    if (biome === 'snowcap') b.dode(0.33 * s, 0xf4fbff, { x: -0.04 * s, y: 0.4 * s, z: -0.02 * s, sy: 0.38, sx: 1.2, j: 0.07, ao: false });
    if (biome === 'bog') for (const [x, z] of [[0.2, 0.2], [-0.3, 0.05]]) b.ico(0.14 * s, 0, 0x4a7a4a, { x: x * s, y: 0.38 * s, z: z * s, sy: 0.4, j: 0.05 });
}
export function rock(o: NodeOpts): NodeRig {
    const rg = rig(0);
    const v = o.seed % 4;
    rg.body.add(bake(`rock|${o.biome}|${v}|${o.gold ? 'g' : ''}`, (mb) => {
        boulder(mb.main, rockRamp(o.biome), seedRand(o.seed * 17 + 1), [1, 0.88, 1.06, 0.95][v], o.biome, o.gold);
    }, o.seed));
    if (o.gold) goldAura(rg, 0.6, 0.8);
    return rg;
}
/** An ore vein's look: its colour ramp, an optional glow colour and strength, and the shape of its chunks. */
export interface OreLook { ramp: readonly number[]; glow?: number; e?: number; shape: string }
export const ORE: Record<string, OreLook> = {
    iron: { ramp: [0x9a5a42, 0xc87a54, 0xe8a070, 0xffc8a0], shape: 'nugget' },
    copper: { ramp: [0x2f7a6a, 0x4aa088, 0xec9040, 0xffc078], shape: 'nugget' },
    gold: { ramp: RAMP.gold, glow: 0xffd966, e: 1.5, shape: 'crystal' },
    coal: { ramp: [0x1a1822, 0x2a2736, 0x45415a, 0x6a6684], shape: 'lump' }
};
export function oreRock(kind: string, o: NodeOpts): NodeRig {
    const rg = rig(0), d = ORE[kind];
    rg.body.add(bake(`ore|${kind}|${o.seed % 4}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 13 + kind.length);
        const host = kind === 'coal' ? [0x2a2733, 0x3f3b4d, 0x575468, 0x75708a] : [0x4e5272, 0x636890, 0x7e84a6, 0xa2a8c4];
        boulder(mb.main, host, r, 1.05, 'ore', o.gold);
        const n = kind === 'coal' ? 8 : 7;
        for (let i = 0; i < n; i++) {
            const a = i / n * TAU + r() * 0.6, rad = 0.1 + r() * 0.4, x = Math.cos(a) * rad, z = Math.sin(a) * rad * 0.9 + 0.04;
            const y = 0.3 + 0.36 * Math.sqrt(Math.max(0.05, 1 - (rad / 0.58) ** 2)) - 0.03;
            const rr = (kind === 'coal' ? 0.11 : 0.1) + r() * 0.06, h = 1.5 + r() * 0.9;
            const tilt = { rx: Math.sin(a) * 0.55, rz: -Math.cos(a) * 0.55, ry: r() * TAU };
            const col = (xx: number, yy: number, zz: number) => pick(d.ramp, clamp(0.5 + (yy - y) * 3.2 + (-xx - zz) * 0.5 + (hash3s(xx, yy, zz) - 0.5) * 0.35));
            if (d.glow) mbGlowOre(mb, d, x, y, z, rr, rr * h, tilt);
            else mb.main.oct(rr, col, { x, y: y + rr * 0.35, z, sy: h, ...tilt, j: 0.014, v: 0.09, ao: false });
        }
        if (kind === 'copper') for (let i = 0; i < 3; i++) mb.main.ico(0.07, 0, 0x4aa088, { x: -0.3 + i * 0.28, y: 0.2 + i % 2 * 0.05, z: 0.34 - i * 0.08, sy: 0.5, j: 0.02 });
        if (kind === 'coal') for (let i = 0; i < 4; i++) mb.glow(0xb8b0e8, 0.5).oct(0.03, 0xb8b0e8, { x: -0.25 + i * 0.17, y: 0.52 + i % 2 * 0.04, z: 0.1 - i * 0.1, sy: 1.5, ry: i, ao: false, v: 0 });
        if (kind === 'iron') for (let i = 0; i < 4; i++) mb.main.box(0.2, 0.03, 0.05, 0xd08a60, { x: -0.3 + i * 0.2, y: 0.4 - i % 2 * 0.07, z: 0.33, ry: 0.5 + i, j: 0.005 });
    }, o.seed));
    if (o.gold) goldAura(rg, 0.66, 0.85);
    else if (kind === 'gold') goldAura(rg, 0, 0.7);
    return rg;
}
export function mbGlowOre(mb: MB, d: OreLook, x: number, y: number, z: number, rr: number, h: number, tilt: Xf) {
    mb.glow(d.glow!, d.e).oct(rr, (_x: number, yy: number) => mix(0xffc030, 0xfff3b0, clamp((yy - y) / 0.3 + 0.2)), { x, y: y + rr * 0.35, z, sy: h / rr, ...tilt, j: 0.014, ao: false, v: 0.12 });
}
export function sandDune(o: NodeOpts): NodeRig {
    const rg = rig(0);
    rg.body.add(bake(`sand|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 5 + 2), R = o.gold ? RAMP.gold : RAMP.sand;
        const col = (x: number, y: number, z: number) => pick(R, clamp(0.35 + y * 1.6 + (-x - z) * 0.35 + (hash3s(x, y, z) - 0.5) * 0.25));
        mb.main.ico(0.58, 1, col, { y: 0.04, sy: 0.42, sx: 1, sz: 0.9, ry: r() * 3, j: 0.07, v: 0.07 });
        mb.main.ico(0.36, 0, col, { x: 0.3, y: 0.02, z: 0.26, sy: 0.46, ry: r() * 3, j: 0.06, v: 0.07 });
        mb.main.ico(0.22, 0, col, { x: -0.38, y: 0, z: 0.3, sy: 0.5, j: 0.04 });
        for (let i = 0; i < 4; i++) {
            const z = -0.18 + i * 0.14, hh = 0.25 - Math.abs(z) * 0.28;
            mb.main.rod([-0.3 + i * 0.03, hh, z], [0.28 - i * 0.02, hh - 0.01, z + 0.04], 0.022, 4, R[3], 0.016, { j: 0.004, v: 0.02, ao: false });
        }
        for (const [x, z] of [[0.45, -0.28], [-0.5, -0.12]]) mb.main.ico(0.045, 0, R[1], { x, y: 0.03, z, j: 0.01 });
    }, o.seed));
    if (o.gold) goldAura(rg, 0.6, 0.6);
    return rg;
}
export function clayBank(o: NodeOpts): NodeRig {
    const rg = rig(0);
    rg.body.add(bake(`clay|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const C = RAMP.clay;
        const layers = [[0.5, 0.17, 0], [0.43, 0.15, 1], [0.34, 0.14, 2], [0.22, 0.1, 3]];
        let y = 0;
        layers.forEach(([rad, h, ci], i) => {
            mb.main.cyl(rad * 0.88, rad, h, 8, o.gold ? RAMP.gold[ci] : C[ci], { y: y + h / 2, ry: i * 0.5, j: 0.045 });
            y += h * 0.9;
        });
        mb.main.ico(0.12, 0, C[3], { x: 0.36, y: 0.08, z: 0.3, sy: 0.6, j: 0.03 });
    }, o.seed));
    if (o.gold) goldAura(rg, 0.6, 0.6);
    return rg;
}
export function peatMound(o: NodeOpts): NodeRig {
    const rg = rig(0.01);
    rg.body.add(bake(`peat|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const P = RAMP.peat, r = seedRand(o.seed + 9);
        mb.main.ico(0.52, 1, o.gold ? byHeight(RAMP.gold, 0, 0.4) : byHeight(P, 0, 0.42, 0.5), { y: 0.03, sy: 0.55, j: 0.09 });
        mb.main.ico(0.3, 0, P[2], { x: 0.3, y: 0.02, z: 0.2, sy: 0.55, j: 0.06 });
        mb.main.ico(0.3, 0, (x, y, z) => pickTrunk(L, 0.25 + hash3s(x, y, z) * 0.5), { x: -0.06, y: 0.22, z: -0.04, sy: 0.3, j: 0.06 });
        for (let i = 0; i < 6; i++) {
            const a = r() * TAU, rad = r() * 0.22;
            mb.main.blade(Math.cos(a) * rad - 0.06, Math.sin(a) * rad - 0.04, 0.18 + r() * 0.12, (r() - 0.5) * 0.12, (r() - 0.5) * 0.1, 0.025, L[2 + i % 2], { y: 0.2 });
        }
    }, o.seed));
    if (o.gold) goldAura(rg, 0.6, 0.6);
    return rg;
}
export function crystalCluster(o: NodeOpts): NodeRig {
    const rg = rig(0);
    const I = RAMP.ice;
    rg.body.add(bake(`crystal|${o.seed % 4}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 3 + 1);
        mb.main.ico(0.46, 0, byHeight(ST, 0, 0.3, 0.5), { y: 0, sy: 0.4, j: 0.07 });
        const gl = mb.glow(o.gold ? 0xffe680 : 0x7ae0f4, 1.9);
        const spec = [[0, 0, 0.9, 0.17], [0.27, 0.14, 0.62, 0.13], [-0.27, 0.12, 0.5, 0.13], [0.1, -0.28, 0.42, 0.11], [-0.1, 0.3, 0.36, 0.1]];
        spec.forEach(([x, z, h, w], i) => {
            const lean = i === 0 ? 0 : 0.28 + r() * 0.15, a = Math.atan2(z, x);
            const pts = [];
            const n = 6;
            for (let k = 0; k < n; k++) {
                const an = k / n * TAU + 0.3;
                pts.push([Math.cos(an) * w, 0, Math.sin(an) * w], [Math.cos(an) * w * 0.9, h * 0.72, Math.sin(an) * w * 0.9]);
            }
            pts.push([0, h, 0]);
            const col = (xx: number, yy: number, zz: number) => o.gold ? pick(RAMP.gold, yy / 0.9 + (hash3s(xx, yy, zz) - 0.5) * 0.3) : pick(I, clamp(yy / 0.9 + 0.2 + (-xx - zz) * 0.3 + (hash3s(xx, yy, zz) - 0.5) * 0.5));
            const tr = { x, y: 0.03, z, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: r() };
            gl.hull(pts, col, { ...tr, ao: false, v: 0.1 });
        });
    }, o.seed));
    return rg;
}
export const pick = (R: readonly number[], t2: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t2 * (R.length - 1))))];
export function berryBush(o: NodeOpts): NodeRig {
    const rg = rig(0.02);
    rg.body.add(bake(`bush|${o.seed % 4}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 11 + 3), R = o.gold ? GOLD_LEAF : [0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c];
        const col = byHeight(R, 0.1, 0.75, 0.55);
        mb.main.ico(0.4, 1, col, { y: 0.32, sy: 0.78, sx: 1.12, j: 0.11 });
        mb.main.ico(0.28, 0, col, { x: 0.28, y: 0.26, z: 0.1, sy: 0.8, j: 0.09 });
        mb.main.ico(0.26, 0, col, { x: -0.26, y: 0.28, z: -0.08, j: 0.08 });
        mb.main.ico(0.22, 0, col, { x: 0.02, y: 0.52, z: -0.1, j: 0.07 });
        for (let i = 0; i < 9; i++) {
            const a = r() * TAU, h = r() * 0.8 - 0.1, rad = (0.36 + (1 - Math.abs(h)) * 0.08) * (1 - Math.abs(h) * 0.3);
            mb.main.oct(0.07, RAMP.red[2 + i % 2], { x: Math.cos(a) * rad, y: 0.3 + h * 0.3, z: Math.sin(a) * rad * 0.9 + 0.04, j: 0.004, ao: false, v: 0.08 });
        }
    }, o.seed));
    if (o.gold) goldAura(rg, 0.55, 0.7);
    return rg;
}
export function wildFlower(o: NodeOpts): NodeRig {
    const rg = rig(0.05);
    const cols = [PAL.blossom, PAL.gold, PAL.foam, PAL.berry, PAL.plum];
    rg.body.add(bake(`flower|${o.seed % 5}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 5 + 1), pc = cols[o.seed % cols.length];
        const stems = [[-0.2, 0.06, 0.52, 0], [0.17, -0.1, 0.68, 1], [0.06, 0.2, 0.42, 2]];
        for (let i = 0; i < 6; i++) {
            const a = i * 1.1;
            mb.main.blade(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.16 + r() * 0.1, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.03, L[1 + i % 3]);
        }
        stems.forEach(([x, z, h, k]) => {
            const c = o.gold ? PAL.gold : k === 0 ? pc : cols[(o.seed + k * 2) % cols.length];
            mb.main.rod([x, 0, z], [x + 0.03, h, z], 0.014, 4, L[1], 0.01);
            mb.main.leaf(0.22, 0.06, 0.016, L[2], { x, y: h * 0.4, z, ry: 1.6 * (k % 2 ? 1 : -1) + 0.5, rx: -0.5 });
            for (let i = 0; i < 5; i++) {
                const a = i / 5 * TAU;
                mb.main.oct(0.09, (_x, y) => y > h + 0.01 ? lighten(c, 0.25) : c, { x: x + 0.03 + Math.cos(a) * 0.1, y: h, z: z + Math.sin(a) * 0.1, sx: 1.5, sy: 0.38, sz: 0.9, ry: -a, j: 0.006, ao: false });
            }
            mb.main.oct(0.062, 0xffd966, { x: x + 0.03, y: h + 0.02, z, j: 0.003, ao: false });
        });
    }, o.seed));
    if (o.gold) goldAura(rg, 0.5, 0.6);
    return rg;
}
export function mushrooms(o: NodeOpts): NodeRig {
    const rg = rig(0);
    const bog = o.biome === 'bog';
    rg.body.add(bake(`mushroom|${bog ? 'bog' : 'meadow'}|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const cap = o.gold ? RAMP.gold : bog ? RAMP.violet : RAMP.red, spot = bog ? 0xbdf4ee : 0xfff6e0, stem = RAMP.cream;
        const group = [[0.02, 0, 0.2, 0.42], [-0.3, 0.14, 0.14, 0.26], [0.28, 0.2, 0.12, 0.2]];
        group.forEach(([x, z, rad, h], i) => {
            mb.main.cyl(rad * 0.42, rad * 0.58, h, 5, grad(stem[1], stem[3], 0, h), { x, y: h * 0.5, z, j: 0.012 });
            mb.main.dome(rad * 1.55, h * 0.62, 7, 2, byHeight(cap, h * 1, h * 1.6, 0.35, i), { x, y: h * 0.98, z, j: 0.014 });
            for (let k = 0; k < 3; k++) {
                const a = k * 2.1 + i * 0.7, rr = rad * (k === 0 ? 0.05 : 0.7);
                const yy = h * 0.98 + h * 0.62 * Math.sqrt(Math.max(0.05, 1 - (rr / (rad * 1.55)) ** 2));
                mb.main.oct(rad * 0.3, spot, { x: x + Math.cos(a) * rr, y: yy - rad * 0.04, z: z + Math.sin(a) * rr, sy: 0.45, j: 0.004, ao: false, v: 0.02 });
            }
        });
        if (bog) for (let i = 0; i < 3; i++) mb.glow(0xbdf4ee, 1.2).oct(0.03, 0xbdf4ee, { x: -0.1 + i * 0.12, y: 0.7 + i * 0.05, z: -0.18, ao: false, v: 0 });
    }, o.seed));
    if (o.gold) goldAura(rg, 0.5, 0.5);
    return rg;
}
export function reedClump(o: NodeOpts): NodeRig {
    const rg = rig(0.05);
    rg.body.add(bake(`reeds|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 9 + 4), R = o.gold ? GOLD_LEAF : [0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c];
        mb.main.ico(0.3, 0, 0x3a2f28, { y: -0.04, sy: 0.3, j: 0.05 });
        for (let i = 0; i < 12; i++) {
            const a = i / 12 * TAU + r() * 0.5, rad = 0.04 + r() * 0.2, h = 0.7 + r() * 0.5;
            mb.main.blade(Math.cos(a) * rad, Math.sin(a) * rad, h, Math.cos(a) * (0.1 + r() * 0.16), Math.sin(a) * (0.1 + r() * 0.16), 0.046, (x, y) => pick(R, clamp(y / 1.2 + 0.2 + (hash3s(x, y, 0) - 0.5) * 0.3)));
        }
        for (const [x, z, h] of [[-0.1, 0.08, 0.84], [0.1, -0.06, 0.95]]) {
            mb.main.rod([x, 0, z], [x, h - 0.1, z], 0.013, 4, R[1], 0.01);
            mb.main.cyl(0.036, 0.036, 0.19, 6, byHeight([0x5a3a24, 0x7a5030, 0x9a6a3a], h - 0.25, h, 0.3), { x, y: h, z, j: 0.006 });
            mb.main.cone(0.012, 0.07, 4, 0x7a5030, { x, y: h + 0.13, z });
        }
    }, o.seed));
    if (o.gold) goldAura(rg, 0.5, 0.8);
    return rg;
}
export function swampHerb(o: NodeOpts): NodeRig {
    const rg = rig(0.03);
    rg.body.add(bake(`herb|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 4 + 7), D = o.gold ? GOLD_LEAF : [0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c];
        mb.main.ico(0.34, 0, 0x2a3a30, { y: -0.04, sy: 0.3, j: 0.05 });
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * TAU + r(), lean = 0.18 + r() * 0.16;
            mb.main.leaf(0.5 + r() * 0.22, 0.09, 0.02, (x, y, z) => pick(D, clamp(y / 0.55 + (hash3s(x, y, z) - 0.5) * 0.4)), { x: Math.cos(a) * 0.04, y: 0.02, z: Math.sin(a) * 0.04, ry: -a + Math.PI / 2, rx: -(0.9 - lean) });
        }
        for (const [x, z, h] of [[-0.14, 0.04, 0.4], [0.1, -0.1, 0.5], [0.18, 0.14, 0.34]]) {
            mb.main.rod([x, 0.08, z], [x, h, z], 0.012, 4, D[1], 0.01);
            mb.main.ico(0.055, 0, RAMP.bloom[2], { x, y: h + 0.03, z, sy: 1.3, j: 0.006, ao: false });
            mb.glow(0xc4a4f0, 0.8).oct(0.02, 0xe8dcff, { x, y: h + 0.1, z, ao: false, v: 0 });
        }
    }, o.seed));
    if (o.gold) goldAura(rg, 0.5, 0.7);
    return rg;
}
export function cottonPlant(o: NodeOpts): NodeRig {
    const rg = rig(0.03);
    rg.body.add(bake(`cotton|${o.seed % 3}|${o.gold ? 'g' : ''}`, (mb) => {
        const r = seedRand(o.seed * 8 + 5), D = [0x2f6b4b, 0x3f8a4c, 0x5cb04f, 0x86cc5c];
        mb.main.ico(0.3, 0, 0x2a3a30, { y: -0.04, sy: 0.3, j: 0.05 });
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU + r();
            mb.main.blade(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.45 + r() * 0.15, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.04, (x, y) => pick(D, clamp(y / 0.6 + (hash3s(x, y, 0) - 0.5) * 0.3)));
        }
        const C = o.gold ? RAMP.gold : RAMP.cream;
        for (const [x, y, z, rr] of [[-0.2, 0.5, 0.06, 0.15], [0.12, 0.62, -0.06, 0.16], [0.24, 0.44, 0.16, 0.13], [-0.02, 0.38, 0.22, 0.13]]) {
            mb.main.ico(rr, 0, (xx, yy, zz) => pick(C, clamp(0.55 + (yy - y) * 3 + (-xx - zz) * 0.5 + (hash3s(xx, yy, zz) - 0.5) * 0.3)), { x, y, z, j: 0.02, ao: false });
            mb.main.oct(rr * 0.7, C[2], { x: x + rr * 0.8, y: y - rr * 0.3, z: z + rr * 0.3, j: 0.015, ao: false });
            mb.main.cone(0.04, 0.08, 4, 0x5a3a24, { x, y: y - rr * 0.95, z, rx: Math.PI });
        }
    }, o.seed));
    if (o.gold) goldAura(rg, 0.5, 0.7);
    return rg;
}
export function woodChest(b: Bld, big: boolean) {
    const s = big ? 1.62 : 1.3, w = 0.58 * s, d = 0.38 * s, h = 0.26 * s, lid = 0.16 * s, BR = RAMP.brass;
    const wood = (x: number, y: number) => pick(W, clamp(0.45 + -x * 0.5 + (y > h ? 0.15 : 0) + Math.round(x * 14) % 2 * 0.08));
    b.box(w, h, d, wood, { y: h / 2, j: 0.01 });
    const lw = w / 2 + 0.005, ld = d / 2 + 0.005;
    b.hull([[-lw, h, -ld], [lw, h, -ld], [lw, h, ld], [-lw, h, ld], [-lw + 0.03, h + lid, -ld * 0.62], [lw - 0.03, h + lid, -ld * 0.62], [lw - 0.03, h + lid, ld * 0.62], [-lw + 0.03, h + lid, ld * 0.62]], (x: number, y: number) => pick(W, clamp(0.55 + (y - h) * 2 + -x * 0.4)), { j: 0.008 });
    for (const x of [-w * 0.3, w * 0.3]) {
        b.box(0.06 * s, h + lid + 0.01, d + 0.02, BR[1], { x, y: (h + lid) / 2, ao: true, v: 0.05 });
    }
    b.box(0.1 * s, 0.11 * s, 0.04 * s, BR[2], { y: h + 0.01, z: ld + 0.015, v: 0.03 });
    b.box(0.035 * s, 0.045 * s, 0.045 * s, W[0], { y: h - 0.005, z: ld + 0.02 });
    if (big) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, 0.07, 0.07, BR[3], { x: sx * (w / 2 - 0.02), y: 0.045, z: sz * (d / 2 - 0.02), ry: 0.4 });
}
export function chestNode(o: NodeOpts, big: boolean): NodeRig {
    const rg = rig(0);
    rg.body.add(bake(big ? 'vault' : 'chest', (mb) => {
        woodChest(mb.main, big);
        if (big) {
            const g = mb.glow(0xf79fc6, 2.4);
            g.oct(0.06, 0xffe4ef, { y: 0.4, z: 0.32, sy: 1.3, ao: false, v: 0.05 });
            for (const x of [-0.26, 0.26]) g.box(0.09, 0.015, 0.015, 0xf79fc6, { x, y: 0.17, z: 0.32, ao: false, v: 0 });
        }
    }, 3));
    const t0 = 0;
    void t0;
    if (big) rg.extra = (_dt: number, t2: number) => {
        void t2;
    };
    if (o.gold) goldAura(rg, 0.6, 0.6);
    return rg;
}
export function treasureMound(o: NodeOpts): NodeRig {
    const rg = rig(0);
    rg.body.add(bake(`mound|${o.seed % 3}`, (mb) => {
        const C = RAMP.clay;
        mb.main.ico(0.46, 1, byHeight(C, 0, 0.32, 0.5), { y: 0, sy: 0.55, sx: 1.1, j: 0.08 });
        mb.main.ico(0.22, 0, C[2], { x: 0.34, y: 0.02, z: 0.18, sy: 0.6, j: 0.05 });
        mb.main.ico(0.16, 0, C[1], { x: -0.38, y: 0.02, z: -0.04, sy: 0.6, j: 0.04 });
        mb.main.box(0.36, 0.02, 0.06, 0xe85d62, { y: 0.255, z: 0.07, ry: 0.78, j: 0.003, ao: false, v: 0.04 });
        mb.main.box(0.36, 0.02, 0.06, 0xc9505a, { y: 0.258, z: 0.07, ry: -0.78, j: 0.003, ao: false, v: 0.04 });
        for (const [x, y, z] of [[-0.26, 0.17, 0.14], [0.22, 0.2, -0.1]]) mb.glow(0xffd966, 1.2).oct(0.05, (_x, yy) => mix(0xe0a020, 0xfff3b0, clamp((yy - y) * 8 + 0.5)), { x, y, z, sy: 1.1, ry: x, ao: false });
        mb.main.rod([0.3, 0.02, -0.2], [0.34, 0.5, -0.24], 0.016, 5, W[3]);
        mb.main.box(0.12, 0.12, 0.018, RAMP.steel[3], { x: 0.3, y: 0.1, z: -0.2, ry: 0.4, rx: 0.1, j: 0.004 });
    }, o.seed));
    const star = bake('gold.sparkle', (mb) => {
        mb.glow(0xffe680, 2.6).oct(0.07, 0xffe680, { sy: 1.5, ao: false, v: 0 });
    });
    rg.obj.add(star);
    rg.extra = (_dt: number, t2: number) => {
        star.position.set(-0.22, 0.42 + Math.sin(t2 * 2.2) * 0.05, 0.1);
        star.rotation.y = t2 * 2.6;
        star.scale.setScalar(0.5 + 0.5 * Math.abs(Math.sin(t2 * 2.2)));
    };
    return rg;
}
export const BUILD: Record<string, ((o: NodeOpts) => NodeRig) | undefined> = {
    tree,
    rock,
    sand: sandDune,
    clay: clayBank,
    peat: peatMound,
    crystal: crystalCluster,
    iron: (o: NodeOpts) => oreRock('iron', o),
    copper: (o: NodeOpts) => oreRock('copper', o),
    gold: (o: NodeOpts) => oreRock('gold', o),
    coal: (o: NodeOpts) => oreRock('coal', o),
    bush: berryBush,
    flower: wildFlower,
    mushroom: mushrooms,
    reeds: reedClump,
    herb: swampHerb,
    cotton: cottonPlant,
    chest: (o: NodeOpts) => chestNode(o, false),
    vault: (o: NodeOpts) => chestNode(o, true),
    mound: treasureMound,
    titan_oak: (o: NodeOpts) => titan('titan_oak', o),
    titan_rock: (o: NodeOpts) => titan('titan_rock', o),
    nest: nestNode
};
export const NODE_MODEL_KINDS = Object.keys(BUILD);
export function nodeModel(kind: string, o: NodeOpts): Model<NodeE> {
    const mk = BUILD[kind] ?? rock;
    const rg = mk(o);
    const def = NODES[kind as NodeKind] as { hp: number; group: string } | undefined;
    const max = def?.hp ?? 1;
    let hp = max, hit = 0, phase = hash(o.seed, kind.length) * TAU, shown = 1, seen = false;
    const soft = def?.group === 'plant';
    return {
        obj: rg.obj,
        update(dt: number, t2: number) {
            if (hit > 0) {
                hit = Math.max(0, hit - dt * 3.2);
                const k = hit * Math.cos((1 - hit) * 15);
                rg.body.scale.set(shown * (1 + 0.1 * k), shown * (1 - 0.17 * k), shown * (1 + 0.1 * k));
                rg.body.rotation.z = Math.sin(t2 * 46) * 0.07 * hit;
                if (hit === 0) {
                    rg.body.scale.setScalar(shown);
                    rg.body.rotation.z = 0;
                }
            }
            if (rg.swayAmp && hit === 0) {
                const w = 0.35 + env.wind * 0.9;
                rg.body.rotation.z = Math.sin(t2 * (soft ? 1.9 : 1.2) * w + phase) * rg.swayAmp * w;
                rg.body.rotation.x = Math.cos(t2 * 0.9 * w + phase * 1.3) * rg.swayAmp * 0.6 * w;
            }
            rg.extra?.(dt, t2);
        },
        apply(e: NodeE) {
            const n = e;
            if (typeof n.hp !== 'number') return;
            if (n.hp < hp && seen) hit = 1;
            seen = true;
            hp = n.hp;
            const f = clamp(hp / max);
            rg.onHp?.(f);
            shown = soft ? 1 : 0.8 + 0.2 * smooth(0, 1, f);
            if (hit === 0) rg.body.scale.setScalar(shown);
        }
    };
}
