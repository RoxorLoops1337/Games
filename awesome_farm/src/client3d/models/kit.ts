// The model kit: the vertex-coloured, flat-shaded builder (Bld), the model builder with glow and custom parts (MB), baking and caching, colour helpers.
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Euler, Float32BufferAttribute, FrontSide, Group, IcosahedronGeometry, LatheGeometry, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, OctahedronGeometry, Quaternion, SphereGeometry, TetrahedronGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { BuildE, Ent } from '../../shared/sim/types';

/** A colour: a 0xRRGGBB number, or a function of the triangle's centre (model space). */
export type ColorFn = (x: number, y: number, z: number) => number;
export type Col = number | ColorFn;
/** A point [x, y, z] (or [x, z] / [radius, height] where a method says so). */
export type Pt = number[];
/** Where and how a part goes in: position, rotation (YXZ), scale, jitter `j` of the corners,
 * shade variation `v` per face and `ao` (darken faces near the ground and facing down, on by default). */
export interface Xf {
    x?: number; y?: number; z?: number;
    rx?: number; ry?: number; rz?: number; q?: Quaternion;
    s?: number; sx?: number; sy?: number; sz?: number;
    j?: number; v?: number; ao?: boolean;
}
/** Material options: roughness, metalness, emissive strength and colour, vertex colours, opacity, both sides. */
export interface MatOpts { r?: number; m?: number; e?: number; ec?: number; vc?: boolean; t?: number; double?: boolean }
/** One baked mesh of a model: its geometry, material and shadow flags. */
export interface Baked { geo: BufferGeometry; mat: Material; cast: boolean; recv: boolean }
/** What every model maker returns: the object to place, plus optional hooks the view calls. */
export interface Model<E extends Ent = Ent> {
    obj: Object3D;
    /** every frame while in view: dt and the world clock in seconds */
    update?(dt: number, t: number): void;
    /** the simulation sent a new state of the entity */
    apply?(e: E): void;
    /** animate a moving thing: facing angle, moving, hurt (0..1) or asleep, dt */
    pose?(face: number, moving: boolean, k: number | boolean, dt: number): void;
    /** roofs fade while the farmer stands under them */
    fade?(a: number): void;
    dispose?(): void;
}

/** What a building model is made from: its quarter turn, a seed for variety and which neighbours of its family it joins (bits N E S W). */
export interface BOpts { rot: number; seed: number; mask: number }
export type BuildingMaker = (o: BOpts) => Model<BuildE>;

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
};
export const hash = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
};
export const hash3 = (x: number, y: number, z: number) => hash(x * 12.9898 + z * 4.1414, y * 78.233 + z * 17.17);
export function seedRand(seed: number): () => number {
    let a = (seed | 0) ^ 2654435769;
    return () => {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
export const env = { wind: 0.5, sun: 1, night: 0 };
export const _c1 = new Color();
export const _c2 = new Color();
export function mix(a: number, b: number, t: number): number {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return Math.round(lerp(ar, br, t)) << 16 | Math.round(lerp(ag, bg, t)) << 8 | Math.round(lerp(ab, bb, t));
}
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x2a1d2c, t);
export const grad = (lo: number, hi: number, y0: number, y1: number): ColorFn => (_x, y) => mix(lo, hi, clamp((y - y0) / (y1 - y0)));
export const pick = (ramp: readonly number[], t: number): number => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))))];
export const byHeight = (ramp: readonly number[], y0: number, y1: number, n = 0.5, seed = 0): ColorFn => (x, y, z) => pick(ramp, clamp((y - y0) / (y1 - y0) + (-x - z) * 0.18 + (hash3(x * 9.1 + seed, y * 9.1, z * 9.1) - 0.5) * n));
export const matCache = new Map<string, MeshStandardMaterial>();
export function M(color: number, o: MatOpts = {}): MeshStandardMaterial {
    const key = `${color}|${o.r ?? 0.9}|${o.m ?? 0}|${o.e ?? 0}|${o.ec ?? ''}|${o.vc ? 1 : 0}|${o.t ?? 1}|${o.double ? 1 : 0}`;
    let m = matCache.get(key);
    if (!m) {
        m = new MeshStandardMaterial({ color, flatShading: true, roughness: o.r ?? 0.9, metalness: o.m ?? 0, vertexColors: !!o.vc, transparent: (o.t ?? 1) < 1, opacity: o.t ?? 1, side: o.double ? DoubleSide : FrontSide });
        if (o.e) {
            m.emissive = new Color(o.ec ?? color);
            m.emissiveIntensity = o.e;
        }
        if ((o.t ?? 1) < 1) m.depthWrite = false;
        matCache.set(key, m);
    }
    return m;
}
export const VC = M(0xffffff, { vc: true });
export const VCS = M(0xffffff, { vc: true, r: 0.45, m: 0.15 });
export const VCM = M(0xffffff, { vc: true, r: 0.5, m: 0.18 });
export const E = (color: number, e = 1.8) => M(0xffffff, { vc: true, e: e * 1.3, ec: color, r: 0.6 });
export const FLASH = M(0xffffff, { vc: true, e: 0.5, ec: 0xffffff });
export const _m = new Matrix4();
export const _q = new Quaternion();
export const _e = new Euler();
export const _p = new Vector3();
export const _s = new Vector3();
export const _v = new Vector3();
export const _a = new Vector3();
export const _b = new Vector3();
export const _n = new Vector3();
export const _up = new Vector3(0, 1, 0);
export const q4 = (v: number) => Math.round(v * 4000) / 4000;
export const primCache = new Map<string, BufferGeometry>();
export function prim(key: string, make: () => BufferGeometry): BufferGeometry {
    let g = primCache.get(key);
    if (!g) {
        const src = make();
        g = src.index ? src.toNonIndexed() : src;
        primCache.set(key, g);
    }
    return g;
}
export class Bld {
    pos: number[] = [];
    col: number[] = [];
    constructor(public seed = 0) {}
    get tris() {
        return this.pos.length / 9;
    }
    /** Add any geometry (indexed or not) with a colour and a transform. The source geometry is never modified. */
    add(geo: BufferGeometry, color: Col, t: Xf = {}): this {
        const src = geo.index ? geo.toNonIndexed() : geo;
        const sp = src.attributes.position;
        const n = sp.count;
        if (t.q) _q.copy(t.q);
        else _q.setFromEuler(_e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ'));
        const k = t.s ?? 1;
        _m.compose(_p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0), _q, _s.set((t.sx ?? 1) * k, (t.sy ?? 1) * k, (t.sz ?? 1) * k));
        const P = new Float32Array(n * 3);
        const j = t.j ?? 0, seed = this.seed;
        for (let i = 0; i < n; i++) {
            _v.fromBufferAttribute(sp, i).applyMatrix4(_m);
            let x = _v.x, y = _v.y, z = _v.z;
            if (j) {
                const rx = q4(x), ry = q4(y), rz = q4(z);
                x += (hash(rx * 12.9 + seed, ry * 7.7 + rz * 3.1) - 0.5) * j;
                y += (hash(rx * 5.3 + seed + 1.7, ry * 9.1 + rz * 6.2 + 3) - 0.5) * j;
                z += (hash(rx * 8.8 + seed + 4.1, ry * 3.3 + rz * 11.9 + 7) - 0.5) * j;
            }
            P[i * 3] = x;
            P[i * 3 + 1] = y;
            P[i * 3 + 2] = z;
        }
        const v = t.v ?? 0.06, ao = t.ao !== false;
        const fn = typeof color === 'function' ? color : null;
        if (!fn) _c1.setHex(color as number);
        for (let i = 0; i < n; i += 3) {
            const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[i * 3 + 3], by = P[i * 3 + 4], bz = P[i * 3 + 5], cx = P[i * 3 + 6], cy = P[i * 3 + 7], cz = P[i * 3 + 8];
            const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
            _a.set(bx - ax, by - ay, bz - az);
            _b.set(cx - ax, cy - ay, cz - az);
            _n.crossVectors(_a, _b);
            const len = _n.length();
            if (len < 1e-9) continue;
            const ny = _n.y / len;
            let f = 1 + (hash3(q4(mx) * 7.1 + seed, q4(my) * 7.1, q4(mz) * 7.1) - 0.5) * 2 * v;
            if (ao) f *= (ny >= 0 ? 0.95 + 0.05 * ny : 0.95 + 0.14 * ny) * (my < 0.4 ? 0.84 + 0.16 * smooth(0, 0.4, my) : 1);
            if (fn) _c1.setHex(fn(mx, my, mz));
            _c2.copy(_c1).multiplyScalar(f);
            for (let c = 0; c < 3; c++) {
                this.pos.push(P[(i + c) * 3], P[(i + c) * 3 + 1], P[(i + c) * 3 + 2]);
                this.col.push(_c2.r, _c2.g, _c2.b);
            }
        }
        return this;
    }
    box(w: number, h: number, d: number, c: Col, t?: Xf) {
        return this.add(prim(`box${w}|${h}|${d}`, () => new BoxGeometry(w, h, d)), c, t);
    }
    /** A box standing on the ground (its base at y = t.y ?? 0, centred in x and z). */
    slab(w: number, h: number, d: number, c: Col, t: Xf = {}) {
        return this.box(w, h, d, c, { ...t, y: (t.y ?? 0) + h / 2 });
    }
    cyl(rt: number, rb: number, h: number, seg: number, c: Col, t?: Xf) {
        return this.add(prim(`cyl${rt}|${rb}|${h}|${seg}`, () => new CylinderGeometry(rt, rb, h, seg, 1)), c, t);
    }
    /** An open tube (no caps). */
    tube(rt: number, rb: number, h: number, seg: number, c: Col, t?: Xf) {
        return this.add(prim(`tub${rt}|${rb}|${h}|${seg}`, () => new CylinderGeometry(rt, rb, h, seg, 1, true)), c, { ...t });
    }
    cone(r: number, h: number, seg: number, c: Col, t?: Xf) {
        return this.add(prim(`con${r}|${h}|${seg}`, () => new ConeGeometry(r, h, seg, 1)), c, t);
    }
    ico(r: number, detail: number, c: Col, t?: Xf) {
        return this.add(prim(`ico${r}|${detail}`, () => new IcosahedronGeometry(r, detail)), c, t);
    }
    oct(r: number, c: Col, t?: Xf) {
        return this.add(prim(`oct${r}`, () => new OctahedronGeometry(r, 0)), c, t);
    }
    tet(r: number, c: Col, t?: Xf) {
        return this.add(prim(`tet${r}`, () => new TetrahedronGeometry(r, 0)), c, t);
    }
    dode(r: number, c: Col, t?: Xf) {
        return this.add(prim(`dod${r}`, () => new DodecahedronGeometry(r, 0)), c, t);
    }
    sph(r: number, ws: number, hs: number, c: Col, t?: Xf) {
        return this.add(prim(`sph${r}|${ws}|${hs}`, () => new SphereGeometry(r, ws, hs)), c, t);
    }
    torus(R: number, r: number, rs: number, ts: number, c: Col, t?: Xf) {
        return this.add(prim(`tor${R}|${r}|${rs}|${ts}`, () => new TorusGeometry(R, r, rs, ts)), c, t);
    }
    /** A spun profile: points are [radius, height]. */
    lathe(profile: Pt[], seg: number, c: Col, t?: Xf) {
        return this.add(prim(`lat${profile.join(',')}|${seg}`, () => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg)), c, t);
    }
    /** The convex hull of some points: the workhorse for rocks, crystals, roofs, wedges and any chunky shape. */
    hull(pts: Pt[], c: Col, t?: Xf) {
        return this.add(new ConvexGeometry(pts.map((p) => new Vector3(p[0], p[1], p[2]))), c, t);
    }
    /** A convex polygon (points are [x, z]) extruded from y0 to y1. */
    prism(pts: Pt[], y0: number, y1: number, c: Col, t?: Xf) {
        return this.hull([...pts.map(([x, z]) => [x, y0, z]), ...pts.map(([x, z]) => [x, y1, z])], c, t);
    }
    /** A rod (square-ish to round by `seg`) between two points, optionally tapering to radius r2. */
    rod(a: Pt, b: Pt, r: number, seg: number, c: Col, r2?: number, t: Xf = {}) {
        _a.set(a[0], a[1], a[2]);
        _b.set(b[0], b[1], b[2]);
        const len = _a.distanceTo(_b);
        if (len < 0.00001) return this;
        _n.subVectors(_b, _a).normalize();
        const q = new Quaternion().setFromUnitVectors(_up, _n);
        return this.add(prim(`rod${r}|${r2 ?? r}|${seg}`, () => new CylinderGeometry(r2 ?? r, r, 1, seg, 1)), c, { ...t, q, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, sx: 1, sy: len, sz: 1 });
    }
    /** A flat leaf / blade: a thin lens `len` long (+z), `wid` wide, `th` thick. */
    leaf(len: number, wid: number, th: number, c: Col, t?: Xf) {
        return this.hull([[0, 0, 0], [wid, 0, len * 0.4], [-wid, 0, len * 0.4], [0, th, len * 0.5], [0, -th, len * 0.5], [0, th * 0.4, len]], c, t);
    }
    /** A half-ball (flat underside): radius r, height h. */
    dome(r: number, h: number, seg: number, rings: number, c: Col, t?: Xf) {
        const prof = [[0, 0], [r, 0]];
        for (let i = 1; i <= rings; i++) {
            const a = i / rings * Math.PI / 2;
            prof.push([Math.max(0.0001, r * Math.cos(a)), h * Math.sin(a)]);
        }
        return this.lathe(prof, seg, c, t);
    }
    /** A grass blade / reed / petal spike standing from (x, 0, z) up to height h, leaning by (lx, lz), `w` wide at the base. */
    blade(x: number, z: number, h: number, lx: number, lz: number, w: number, c: Col, t: Xf = {}) {
        const ox = t.x ?? 0, oy = t.y ?? 0, oz = t.z ?? 0;
        return this.hull([
            [x - w, 0, z],
            [x + w, 0, z],
            [x, 0, z - w * 0.7],
            [x + lx * 0.45 - w * 0.5, h * 0.5, z + lz * 0.45],
            [x + lx * 0.45 + w * 0.5, h * 0.5, z + lz * 0.45],
            [x + lx, h, z + lz]
        ], c, { ...t, x: ox, y: oy, z: oz });
    }
    /** Merge another builder's triangles (already coloured) in. */
    merge(o: Bld, x = 0, y = 0, z = 0) {
        for (let i = 0; i < o.pos.length; i += 3) this.pos.push(o.pos[i] + x, o.pos[i + 1] + y, o.pos[i + 2] + z);
        for (const c of o.col) this.col.push(c);
        return this;
    }
    build() {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
        g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        g.userData.shared = true;
        return g;
    }
}
export const bakeCache = new Map<string, Baked[]>();
export const stats = { bakes: 0, tris: 0 };
/** A model builder: the main vertex-coloured body plus glowing and custom-material parts. */
export class MB {
    /** does the body receive shadows (default yes) */
    recv = true;
    /** does the body cast shadows (default yes) */
    cast = true;
    glows = new Map<string, { b: Bld; mat: Material }>();
    customs = new Map<string, { b: Bld; mat: Material; cast: boolean }>();
    main: Bld;
    constructor(seed = 0) {
        this.main = new Bld(seed);
    }
    /** A builder whose parts glow: `color` is the light colour, `e` the emissive intensity (1.4 .. 3 reads as light with a bloom pass). */
    glow(color: number, e = 1.8): Bld {
        const key = `${color}|${e}`;
        let g = this.glows.get(key);
        if (!g) {
            g = { b: new Bld(this.main.seed + 11), mat: E(color, e) };
            this.glows.set(key, g);
        }
        return g.b;
    }
    /** A builder for parts with their own material (shiny metal, glass, water ...). */
    custom(key: string, mat: Material, cast = false): Bld {
        let g = this.customs.get(key);
        if (!g) {
            g = { b: new Bld(this.main.seed + 5), mat, cast };
            this.customs.set(key, g);
        }
        return g.b;
    }
    /** Shiny vertex-colour parts: metal, glass, gems. */
    shiny() {
        return this.custom('shiny', VCS, true);
    }
    metal() {
        return this.custom('metal', VCM, true);
    }
    finish(): Baked[] {
        const out: Baked[] = [];
        if (this.main.tris) out.push({ geo: this.main.build(), mat: VC, cast: this.cast, recv: this.recv });
        for (const g of this.customs.values()) if (g.b.tris) out.push({ geo: g.b.build(), mat: g.mat, cast: g.cast, recv: false });
        for (const g of this.glows.values()) if (g.b.tris) out.push({ geo: g.b.build(), mat: g.mat, cast: false, recv: false });
        return out;
    }
}
export function bake(key: string, fn: (mb: MB) => void, seed = 0): Group {
    let list = bakeCache.get(key);
    if (!list) {
        const mb = new MB(seed);
        fn(mb);
        list = mb.finish();
        bakeCache.set(key, list);
        stats.bakes++;
        for (const b of list) stats.tris += b.geo.attributes.position.count / 3;
    }
    const g = new Group();
    g.name = key;
    for (const b of list) {
        const m = new Mesh(b.geo, b.mat);
        m.castShadow = b.cast;
        m.receiveShadow = b.recv;
        g.add(m);
    }
    return g;
}
export function countTris(o: Object3D) {
    let n = 0;
    o.traverse((c) => {
        const m = c as Mesh;
        if (m.isMesh) {
            const g = m.geometry;
            n += (g.index ? g.index.count : g.attributes.position.count) / 3;
        }
    });
    return n;
}
export function at<T extends Object3D>(o: T, x = 0, y = 0, z = 0): T {
    o.position.set(x, y, z);
    return o;
}
export function pivot(o: Object3D, x = 0, y = 0, z = 0, ox = 0, oy = 0, oz = 0) {
    const g = new Group();
    g.position.set(x, y, z);
    o.position.set(ox, oy, oz);
    g.add(o);
    return g;
}
export function meshesOf(o: Object3D) {
    const out: Mesh[] = [];
    o.traverse((c) => {
        if ((c as Mesh).isMesh) out.push(c as Mesh);
    });
    return out;
}
export function flashMeshes(list: Mesh[], on: boolean) {
    for (const m of list) {
        const ud = m.userData;
        if (on) {
            if (!ud.mat0) {
                ud.mat0 = m.material;
                m.material = FLASH;
            }
        } else if (ud.mat0) {
            m.material = ud.mat0;
            ud.mat0 = undefined;
        }
    }
}
export function flicker(t: number, phase = 0) {
    return 0.5 + 0.25 * Math.sin(t * 13 + phase * 6.3) + 0.15 * Math.sin(t * 29 + phase * 2.1) + 0.1 * Math.sin(t * 7.3 + phase);
}
