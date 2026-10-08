// The loot builder (richer colours, everything raised to stand) and shared loot shapes.
import * as THREE from 'three';
import { RAMP } from './data';
import { type Baked, Bld, byHeight, type Col, type ColorFn, E, lighten, MB, type Pt, stats, TAU, VCS, type Xf } from './kit';

/** How a dropped item shows: its model, how it turns (spin, sway or fast), the height of its centre, size, lean and diagonal tilt,
 * a glint that flashes as it turns, sparkles of a colour, and a heartbeat pulse. */
export interface DropSpec {
    build(mb: MB): void;
    turn?: 'spin' | 'sway' | 'fast'; cy?: number; size?: number; lean?: number; diag?: number;
    flash?: boolean; spark?: number; pulse?: boolean;
}

export const INK = 0x2a1d2c;
export const Y0 = 0.5;
export const SCALE = 0.36;
export const _hsl = { h: 0, s: 0, l: 0 };
export const _col = new THREE.Color();
export function tone(c: number) {
    _col.setHex(c).getHSL(_hsl);
    return _col.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.16 + 0.03), _hsl.l * 0.93).getHex();
}
/** A builder for loot: colours a little richer, and everything raised by Y0 so ao reads the item standing. */
export class LBld extends Bld {
    add(geo: THREE.BufferGeometry, color: Col, t: Xf = {}): this {
        const c = typeof color === 'function' ? (x: number, y: number, z: number) => tone(color(x, y, z)) : tone(color);
        return super.add(geo, c, { ...t, y: (t.y ?? 0) + Y0 });
    }
}
export class LMB extends MB {
    gl = new Map<string, { b: LBld; mat: THREE.Material }>();
    cu = new Map<string, { b: LBld; mat: THREE.Material; cast: boolean }>();
    declare main: LBld;
    constructor(seed = 0) {
        super(seed);
        this.main = new LBld(seed);
    }
    glow(color: number, e = 1.8): LBld {
        const key = `${color}|${e}`;
        let g = this.gl.get(key);
        if (!g) {
            g = { b: new LBld(this.main.seed + 11), mat: E(color, e) };
            this.gl.set(key, g);
        }
        return g.b;
    }
    custom(key: string, mat: THREE.Material, cast = false): LBld {
        let g = this.cu.get(key);
        if (!g) {
            g = { b: new LBld(this.main.seed + 5), mat, cast };
            this.cu.set(key, g);
        }
        return g.b;
    }
    finish(): Baked[] {
        const out: Baked[] = [];
        if (this.main.tris) out.push({ geo: this.main.build(), mat: VCS_MATTE, cast: this.cast, recv: this.recv });
        for (const g of this.cu.values()) if (g.b.tris) out.push({ geo: g.b.build(), mat: g.mat, cast: g.cast, recv: false });
        for (const g of this.gl.values()) if (g.b.tris) out.push({ geo: g.b.build(), mat: g.mat, cast: false, recv: false });
        return out;
    }
}
export const VCS_MATTE = VCS.clone();
VCS_MATTE.roughness = 0.78;
VCS_MATTE.metalness = 0.04;
export const cache = new Map<string, Baked[]>();
export function dbake(key: string, fn: (mb: MB) => void, seed = 0) {
    let list = cache.get(key);
    if (!list) {
        const mb = new LMB(seed);
        fn(mb);
        list = mb.finish();
        for (const b of list) {
            b.geo.translate(0, -Y0, 0);
            stats.tris += b.geo.attributes.position.count / 3;
        }
        cache.set(key, list);
        stats.bakes++;
    }
    const g = new THREE.Group();
    g.name = key;
    for (const b of list) {
        const m = new THREE.Mesh(b.geo, b.mat);
        m.castShadow = b.cast;
        m.receiveShadow = b.recv;
        g.add(m);
    }
    return g;
}
export const R = {
    iron: [0x585c74, 0x8a90a8, 0xb8bed2, 0xe4e8f4],
    steel: [0x2e3a5c, 0x4e6490, 0x7f98c4, 0xb4c8ec],
    copper: [0x8a4a1a, 0xc8702a, 0xf08a40, 0xffc078],
    gold: RAMP.gold,
    ice: RAMP.ice,
    violet: RAMP.violet,
    wood: RAMP.wood,
    leather: [0x5a3828, 0x7a4e30, 0xa8703f, 0xd49a62],
    cream: RAMP.cream,
    stone: RAMP.stone,
    bone: RAMP.bone,
    sand: RAMP.sand,
    clay: RAMP.clay,
    peat: RAMP.peat,
    leaf: RAMP.leaf,
    red: RAMP.red,
    brick: RAMP.brick,
    coal: RAMP.coal,
    pumpkin: RAMP.pumpkin,
    straw: RAMP.straw,
    thatch: RAMP.thatch,
    dusk: [0x35305c, 0x5d4a7c, 0x7a62a0, 0x9d84c4],
    teal: [0x2d6ea6, 0x3a94b8, 0x4ab2cf, 0x9be0e8],
    green: [0x2d6a50, 0x3f8a4c, 0x5cb04f, 0x92d364],
    moss: [0x3f6a3a, 0x6c9a49, 0x92b85c, 0xb9d98a]
};
export const hg = (ramp: readonly number[], y0: number, y1: number, n = 0.45, seed = 0) => byHeight(ramp, y0 + Y0, y1 + Y0, n, seed);
export const au = (f: (x: number, y: number, z: number) => number): ColorFn => (x, y, z) => f(x, y - Y0, z);
export const ribs = (n: number, a: number, b: number, phase = 0): ColorFn => (x: number, _y: number, z: number) => Math.floor((Math.atan2(z, x) + Math.PI + phase) / TAU * n) & 1 ? a : b;
export function strHash(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 100000 / 100000;
}
export function spike(b: Bld, h: number, w: number, c: Col, t: Xf = {}, n = 5) {
    const pts: Pt[] = [];
    for (let k = 0; k < n; k++) {
        const a = k / n * TAU + 0.3;
        pts.push([Math.cos(a) * w, 0, Math.sin(a) * w], [Math.cos(a) * w * 0.88, h * 0.7, Math.sin(a) * w * 0.88]);
    }
    pts.push([0, h, 0]);
    return b.hull(pts, c, t);
}
export function gem(b: Bld, r: number, c: Col, t: Xf = {}, n = 6) {
    const pts: Pt[] = [];
    for (let k = 0; k < n; k++) {
        const a = k / n * TAU + 0.2;
        pts.push([Math.cos(a) * r * 0.55, r * 0.5, Math.sin(a) * r * 0.55], [Math.cos(a) * r, 0, Math.sin(a) * r]);
    }
    pts.push([0, -r * 0.85, 0]);
    return b.hull(pts, c, t);
}
export function ring(b: Bld, R: number, r: number, c: Col, t: Xf = {}, ts = 8, rs = 3) {
    return b.torus(R, r, rs, ts, c, { rx: Math.PI / 2, ...t });
}
export function ingot(b: Bld, ramp: readonly number[], t: Xf = {}, w = 0.54, d = 0.28, h = 0.2) {
    const tw = w * 0.7, td = d * 0.64, y0 = (t.y ?? 0) + Y0;
    b.hull(
        [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], [-tw / 2, h, -td / 2], [tw / 2, h, -td / 2], [tw / 2, h, td / 2], [-tw / 2, h, td / 2]],
        (_x: number, y: number) => y > y0 + h * 0.8 ? ramp[3] : y > y0 + h * 0.4 ? ramp[2] : ramp[1],
        { v: 0.05, ...t }
    );
}
export function heart(b: Bld, s: number, c: Col, t: Xf = {}) {
    const lobe = 0.27 * s, ox = 0.2 * s, oy = 0.12 * s, th = 0.7;
    for (const sx of [-1, 1]) b.ico(lobe, 0, c, { ...t, x: (t.x ?? 0) + sx * ox, y: (t.y ?? 0) + oy, z: t.z, sz: th * 1.05, ry: 0.4, j: t.j });
    const d = 0.19 * s * th * 1.1;
    b.hull([[-0.43 * s, 0.1 * s, -d], [-0.43 * s, 0.1 * s, d], [0.43 * s, 0.1 * s, -d], [0.43 * s, 0.1 * s, d], [-0.2 * s, -0.12 * s, d * 0.9], [-0.2 * s, -0.12 * s, -d * 0.9], [0.2 * s, -0.12 * s, d * 0.9], [0.2 * s, -0.12 * s, -d * 0.9], [0, -0.46 * s, 0]], c, { ...t, x: t.x ?? 0, y: t.y ?? 0 });
}
export function curve(b: Bld, pts: Pt[], r0: number, r1: number, seg: number, c: Col, t: Xf = {}) {
    const { x, y, z, ...rest } = t, ox = x ?? 0, oy = y ?? 0, oz = z ?? 0, n = pts.length - 1;
    const q = pts.map((p) => [p[0] + ox, p[1] + oy, p[2] + oz]);
    for (let i = 0; i < n; i++) b.rod(q[i], q[i + 1], r0 + (r1 - r0) * (i / n), seg, c, r0 + (r1 - r0) * ((i + 1) / n), rest);
}
export function bowl(mb: MB, wall: number, fill: Col, o: { rim?: number; fillGlow?: number; e?: number } = {}, t: Xf = {}) {
    const b = mb.main, w = wall;
    b.lathe([[0, 0], [0.18, 0], [0.47, 0.4], [0.4, 0.4], [0.16, 0.08]], 7, (_x: number, y: number) => y - Y0 > 0.36 ? o.rim ?? lighten(w, 0.2) : w, { v: 0.05, j: 0.01, ...t });
    const fb = o.fillGlow ? mb.glow(o.fillGlow, o.e ?? 1.1) : b;
    fb.cyl(0.405, 0.405, 0.04, 7, fill, { y: 0.31, ao: false, v: 0.05, ...t });
}
export function plate(b: Bld, c: number, t: Xf = {}) {
    b.cyl(0.52, 0.4, 0.09, 9, (_x: number, y: number) => y - Y0 > 0.08 ? lighten(c, 0.12) : c, { y: 0, j: 0.01, v: 0.04, ...t });
}
export function puff(mb: MB, x: number, y: number, z: number, r: number, c = 0xfffbf4, e = 0.7) {

    mb.glow(c, e).oct(r * 1.15, c, { x, y, z, j: 0.01, ao: false, v: 0 });
}
export function glint(mb: MB, x: number, y: number, z: number, r = 0.05, c = 0xfffbf4, e = 1.8) {
    mb.glow(c, Math.min(e, 1.6)).oct(r, c, { x, y, z, sx: 0.6, sz: 0.6, sy: 1.7, ao: false, v: 0 });
}
