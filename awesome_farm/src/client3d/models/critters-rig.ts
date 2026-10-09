// The creature rig: bones, procedural walk, breathing, blinking, sleep and work, colour helpers and shared parts (limbs, eyes, flames).
import * as THREE from 'three';
import type { Ent } from '../../shared/sim/types';
import { bake, Bld, clamp, type Col, type ColorFn, hash3, M, MB, mix, TAU, type Xf } from './kit';

export const _hc = new THREE.Color();
export const _hs = { h: 0, s: 0, l: 0 };
export function hsl(c: number, dh: number, ds: number, lm: number, la = 0) {
    _hc.setHex(c).getHSL(_hs, THREE.SRGBColorSpace);
    _hc.setHSL((_hs.h + dh + 1) % 1, clamp(_hs.s * ds), clamp(_hs.l * lm + la), THREE.SRGBColorSpace);
    return _hc.getHex();
}
export const rampCache = new Map<number, number[]>();
export const S = (c: number) => {
    let r = rampCache.get(c);
    if (!r) {
        r = [hsl(c, -0.025, 1.18, 0.8), hsl(c, -0.012, 1.12, 0.9), hsl(c, -0.002, 1.06, 0.98), hsl(c, 0.012, 1, 1.07, 0.01)];
        rampCache.set(c, r);
    }
    return r;
};
export const sh = (c: number, y0: number, y1: number, n = 0.3, seed = 0): ColorFn => {
    const R = S(c);
    return (x: number, y: number, z: number) => {
        const t = (y - y0) / (y1 - y0) + z * 1.3 - x * 0.4 + (hash3(x * 9.1 + seed, y * 9.1, z * 9.1) - 0.5) * n;
        return R[Math.max(0, Math.min(3, Math.round(t * 3)))];
    };
};
export const tone = (c: number, y0: number, y1: number, lo = 0.72, hi = 0.97, n = 0.12): ColorFn => {
    const a = hsl(c, -0.015, 1.04, lo), b = hsl(c, 0.01, 0.98, hi);
    return (x: number, y: number, z: number) => mix(a, b, clamp((y - y0) / (y1 - y0) + z * 0.9 - x * 0.3 + (hash3(x * 9.1, y * 9.1, z * 9.1) - 0.5) * n));
};
/** A bone's rest (or asleep) placement. */
export interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number }
/** One pivot of a creature: its rest pose, its asleep pose and the per-frame offsets the animation adds. */
export class Bone {
    dx = 0;
    dy = 0;
    dz = 0;
    drx = 0;
    dry = 0;
    drz = 0;
    mx = 1;
    my = 1;
    mz = 1;
    g: THREE.Object3D;
    r: Pose;
    s: Pose;
    constructor(g3: THREE.Object3D, x: number, y: number, z: number, sleep?: Partial<Pose>) {
        this.g = g3;
        g3.position.set(x, y, z);
        this.r = { x, y, z, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
        this.s = { ...this.r, ...sleep };
    }
    /** Rest rotation (set by the builder, e.g. an ear that leans outwards). */
    rot(rx: number, ry = 0, rz = 0, sleepRot?: number[]) {
        this.r.rx = rx;
        this.r.ry = ry;
        this.r.rz = rz;
        if (sleepRot) {
            this.s.rx = sleepRot[0];
            this.s.ry = sleepRot[1];
            this.s.rz = sleepRot[2];
        } else {
            this.s.rx = rx;
            this.s.ry = ry;
            this.s.rz = rz;
        }
        return this;
    }
    flush(sl: number) {
        const g3 = this.g, r = this.r, z = this.s, a = 1 - sl;
        g3.position.set(r.x + (z.x - r.x) * sl + this.dx * a, r.y + (z.y - r.y) * sl + this.dy * a, r.z + (z.z - r.z) * sl + this.dz * a);
        g3.rotation.set(r.rx + (z.rx - r.rx) * sl + this.drx * a, r.ry + (z.ry - r.ry) * sl + this.dry * a, r.rz + (z.rz - r.rz) * sl + this.drz * a);
        g3.scale.set((r.sx + (z.sx - r.sx) * sl) * this.mx, (r.sy + (z.sy - r.sy) * sl) * this.my, (r.sz + (z.sz - r.sz) * sl) * this.mz);
        this.dx = this.dy = this.dz = this.drx = this.dry = this.drz = 0;
        this.mx = this.my = this.mz = 1;
    }
}
export let zGeo: THREE.BufferGeometry | null = null;
export let zMat: THREE.MeshBasicMaterial | null = null;
export let zMat2: THREE.MeshBasicMaterial | null = null;
export function zShape(): [THREE.BufferGeometry, THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] {
    if (!zGeo) {
        const quads = [
            [-0.5, 0.5, 0.5, 0.5, 0.5, 0.26, -0.5, 0.26],
            [-0.5, -0.26, 0.5, -0.26, 0.5, -0.5, -0.5, -0.5],
            [0.5, 0.26, 0.14, 0.26, -0.5, -0.26, -0.14, -0.26]
        ];
        const p: number[] = [];
        for (const q of quads) p.push(q[0], q[1], 0, q[2], q[3], 0, q[4], q[5], 0, q[0], q[1], 0, q[4], q[5], 0, q[6], q[7], 0);
        zGeo = new THREE.BufferGeometry();
        zGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        zGeo.computeVertexNormals();
        zGeo.userData.shared = true;
        zMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, side: THREE.DoubleSide, toneMapped: false });
        zMat2 = new THREE.MeshBasicMaterial({ color: 0x5d4a7c, side: THREE.DoubleSide, toneMapped: false });
    }
    return [zGeo, zMat!, zMat2!];
}
export const OFF = 1;
/** Creature parts are modelled around y = 0 but baked OFF higher (so ao and shading read them standing): shift every part up. */
export function patch(b: Bld): Bld {
    const q = b as Bld & { __p?: boolean };
    if (q.__p) return b;
    q.__p = true;
    const add0 = b.add.bind(b);
    b.add = ((geo, color, t = {}) => add0(geo, typeof color === 'function' ? (x: number, y: number, z: number) => color(x, y - OFF, z) : color, { ...t, y: (t.y ?? 0) + OFF })) as Bld['add'];
    return b;
}
export function patchMB(mb: MB) {
    patch(mb.main);
    const g0 = mb.glow.bind(mb), c0 = mb.custom.bind(mb);
    mb.glow = (c: number, e?: number) => patch(g0(c, e));
    mb.custom = (k: string, m2: THREE.Material, cast?: boolean) => patch(c0(k, m2, cast));
}
/** How a species moves: stride frequency `f`, hop height, squash, roll / pitch / yaw of the body, leg swing and lift, tail, ears, looking about, breathing. */
export interface RigCfg {
    f: number; hop?: number; arc?: boolean; sq?: number; roll?: number; pitch?: number; yaw?: number;
    leg?: number; lift?: number; legAmp?: number[]; legMode?: string;
    tail?: number; tailF?: number; tailMv?: number; ear?: number; look?: number; breathe?: number; seed?: number;
}
/** A species: how it moves and how to build its body on a rig. */
export interface CritterSpec { cfg: RigCfg; build(r: Rig): void }
/** The animation state the rig passes to a species' own `extra` code each frame. */
export interface RigState { t: number; dt: number; mv: number; sl: number; aw: number; ph: number; bnc: number; busy: number; blink: number; twitch: number; face: number }
/** A creature: a tree of bones built by its species, animated procedurally (walk cycle, breathing, blinking, sleep, work). */
export class Rig {
    obj = new THREE.Group();
    torso: Bone | null = null;
    head: Bone | null = null;
    tail: Bone | null = null;
    ears: Bone[] = [];
    legs: Bone[] = [];
    wings: Bone[] = [];
    eyes: Bone | null = null;
    all: Bone[] = [];
    /** height of the top of the head when awake (where the z's and the stars start) */
    topY = 0.5;
    /** extra hooks: per-frame code of a species (flames, mouths ...) and per-apply code */
    extra: ((rig: Rig, s: RigState) => void) | null = null;
    legPh = [0, Math.PI, Math.PI, 0];
    ph0 = 0;
    s: RigState = { t: 0, dt: 0, mv: 0, sl: 0, aw: 1, ph: 0, bnc: 0, busy: 0, blink: 0, twitch: 0, face: 0 };
    // sim state
    flee = false;
    stWork = false;
    wLeft = 0;
    shake = false;
    zs: THREE.Group[] = [];
    starG: THREE.Group | null = null;
    stars: THREE.Group[] = [];
    nStars = 0;
    /** the whole animal is built at one size and scaled here (the briefed size of the species) */
    scaler = new THREE.Group();
    k = 1;
    body: Bone;
    bo: number;
    to: number;
    zg = new THREE.Group();
    constructor(public sp: string, public v: number, public cfg: RigCfg, public seed: number) {

        const g3 = new THREE.Group();
        this.obj.add(this.scaler);
        this.scaler.add(g3);
        this.body = new Bone(g3, 0, 0, 0);
        this.all.push(this.body);
        this.bo = seed * 1.37 % 3.7;
        this.to = seed * 2.11 % 11;
        this.ph0 = seed % 7 * 0.9;
        const [geo, m1] = zShape();
        for (let i = 0; i < 3; i++) {
            const z = new THREE.Group();
            const a = new THREE.Mesh(geo, m1);
            a.renderOrder = 3;
            z.add(a);
            z.scale.setScalar(0.0001);
            z.rotation.set(-Math.PI / 3, 0, -0.22);
            this.zg.add(z);
            this.zs.push(z);
        }
        this.obj.add(this.zg);
    }
    /** A bare pivot (no geometry). */
    pivot(parent: Bone | null, x: number, y: number, z: number, sleep?: Partial<Pose>) {
        const b = new Bone(new THREE.Group(), x, y, z, sleep);
        (parent ?? this.body).g.add(b.g);
        this.all.push(b);
        return b;
    }
    /** Bake a part (geometry around its own pivot) once per species, variant and name; hang it under `parent`. */
    part(name: string, parent: Bone | null, fn: (mb: MB) => void, x = 0, y = 0, z = 0, sleep?: Partial<Pose>) {
        const g3 = bake(`crit|${this.sp}|${name}|${this.v}`, (mb) => {
            patchMB(mb);
            fn(mb);
        }, this.v * 7 + 3);
        for (const m2 of g3.children) m2.position.y = -OFF;
        const b = new Bone(g3, x, y, z, sleep);
        (parent ?? this.body).g.add(g3);
        this.all.push(b);
        return b;
    }
    setScale(k: number) {
        this.k = k;
        this.scaler.scale.setScalar(k);
    }
    /** Show n golden awakening stars circling above the head. */
    setStars(n: number) {
        n = Math.max(0, Math.min(3, Math.floor(n)));
        if (n > 0 && !this.starG) {
            this.starG = new THREE.Group();
            this.obj.add(this.starG);
            for (let i = 0; i < 3; i++) {
                const g3 = bake('crit|star', (mb) => {
                    mb.glow(0xffb41e, 2.2).oct(0.06, 0xffe080, { sx: 0.9, sy: 1.5, sz: 0.9, ao: false, v: 0.1 });
                });
                this.starG.add(g3);
                this.stars.push(g3);
            }
        }
        this.nStars = n;
        for (let i = 0; i < this.stars.length; i++) this.stars[i].visible = i < n;
    }
    apply(e: Ent) {
        if (e.k !== 'crit') return;
        this.flee = e.st === 1;
        this.stWork = e.st === 3;
        this.wLeft = Math.max(0, e.w ?? 0);
        this.shake = !!e.cat;
        if (e.star !== undefined) this.setStars(e.star);
    }
    pose(face: number, moving: boolean, sleeping: boolean, dt: number) {
        dt = Math.min(Math.max(dt, 0), 0.1);
        const s = this.s, c = this.cfg, b = this.body;
        s.t += dt;
        s.dt = dt;
        s.face = face;
        s.mv += ((moving && !sleeping ? 1 : 0) - s.mv) * Math.min(1, dt * 7);
        s.sl += ((sleeping ? 1 : 0) - s.sl) * Math.min(1, dt * 3);
        if (s.sl < 0.001) s.sl = 0;
        else if (s.sl > 0.999) s.sl = 1;
        if (s.mv < 0.001) s.mv = 0;
        s.aw = 1 - s.sl;
        this.wLeft = Math.max(0, this.wLeft - dt);
        s.busy += (((this.stWork || this.wLeft > 0) && !sleeping ? 1 : 0) - s.busy) * Math.min(1, dt * 8);
        s.ph = (s.ph + dt * c.f * TAU * s.mv * (this.flee ? 1.4 : 1)) % TAU;
        this.obj.rotation.y = face;
        const mv = s.mv, aw = s.aw, t = s.t + this.ph0, sd = c.seed ?? 0;
        const sp = Math.sin(s.ph), cp = Math.cos(s.ph);
        s.bnc = c.arc ? Math.max(0, sp) : Math.abs(sp);
        const bu = (t + this.bo) % 3.7;
        s.blink = bu < 0.16 ? Math.sin(bu / 0.16 * Math.PI) : 0;
        s.twitch = Math.pow(Math.max(0, Math.sin(t * 0.83 + this.to) * Math.sin(t * 1.37 + this.to * 2.1)), 5);
        let sq = 0;
        if (c.hop) b.dy += c.hop * s.bnc * mv;
        if (c.sq) sq = c.sq * mv * (c.arc ? sp : s.bnc * 2 - 1);
        b.my *= 1 + sq;
        b.mx *= 1 - sq * 0.5;
        b.mz *= 1 - sq * 0.5;
        if (c.roll) b.drz += sp * c.roll * mv;
        if (c.pitch) b.drx += (c.arc ? -cp * c.pitch : Math.sin(2 * s.ph) * c.pitch * 0.5) * mv;
        if (c.yaw) b.dry += sp * c.yaw * mv;
        if (s.busy > 0.01) {
            b.dy += Math.abs(Math.sin(t * 8)) * 0.035 * s.busy;
            b.drx += Math.sin(t * 8) * 0.1 * s.busy;
            b.my *= 1 + Math.sin(t * 16) * 0.04 * s.busy;
        }
        if (this.shake) b.drz += Math.sin(t * 46) * 0.16;
        if (this.torso) {
            const br = (c.breathe ?? 0.025) * (1 + s.sl * 1.2), fq = 2.2 - s.sl * 0.9;
            const k = Math.sin(t * fq + sd) * br;
            this.torso.my *= 1 + k;
            this.torso.mx *= 1 - k * 0.5;
            this.torso.mz *= 1 - k * 0.5;
        }
        if (c.leg) {
            const n = this.legs.length, amp = c.leg, lift = c.lift ?? 0.18;
            for (let i = 0; i < n; i++) {
                const L = this.legs[i], ph = s.ph + this.legPh[i % 4], sw = Math.sin(ph);
                L.drx += sw * amp * (c.legAmp ? c.legAmp[i % c.legAmp.length] : 1) * mv;
                L.my *= 1 - lift * Math.max(0, -sw) * mv;
            }
        }
        if (this.head) {
            const h = this.head;
            h.dry += Math.sin(t * 0.55 + sd) * (c.look ?? 0.18) * (1 - mv * 0.6) * (1 + 0.5 * Math.sin(t * 0.21));
            h.drx += Math.sin(t * 0.37 + sd * 2) * 0.05 * (1 - mv) + Math.sin(2 * s.ph) * 0.05 * mv;
        }
        if (this.tail) {
            const T = this.tail, f = c.tailF ?? 2;
            T.dry += Math.sin(t * f + sd) * (c.tail ?? 0.25) * (1 + mv * (c.tailMv ?? 0.7));
            T.drx += Math.sin(t * f * 0.7 + 1) * 0.06 + sp * 0.12 * mv;
        }
        if (this.ears.length) {
            const ea = c.ear ?? 0.15;
            for (let i = 0; i < this.ears.length; i++) {
                const E3 = this.ears[i], side = i % 2 ? -1 : 1;
                E3.drz += side * (ea * 0.5 * Math.sin(2 * s.ph + i) * mv + Math.sin(t * 1.6 + i + sd) * 0.04);
                E3.drx += -ea * (c.arc ? sp : Math.abs(sp)) * mv * 0.8;
            }
            const E = this.ears[this.ears.length > 1 ? Math.floor(this.to) % 2 : 0];
            E.drz += 0.5 * s.twitch * aw;
            E.drx -= 0.25 * s.twitch * aw;
        }
        if (this.eyes) this.eyes.my *= Math.max(0.1, (1 - 0.9 * s.blink) * (1 - 0.9 * s.sl));
        if (this.extra) this.extra(this, s);
        for (const bn of this.all) bn.flush(s.sl);
        const zl = s.sl;
        if (zl > 0.02 || this.zg.visible) {
            this.zg.visible = zl > 0.02;
            this.zg.rotation.y = -face;
            this.zg.position.y = this.topY * this.k * (1 - 0.35 * zl);
            for (let i = 0; i < 3; i++) {
                const u = (t * 0.32 + i / 3) % 1, z = this.zs[i];
                z.position.set(0.06 + u * 0.16 + Math.sin(u * 7 + i * 2) * 0.025, 0.03 + u * 0.36, 0.04);
                z.scale.setScalar(Math.max(0.0001, zl * Math.sin(u * Math.PI) * (0.045 + u * 0.05)));
            }
        }
        if (this.starG && this.nStars) {
            const n = this.nStars, y = (this.topY * (1 - 0.3 * s.sl) + b.g.position.y * 0.6) * this.k + 0.17;
            this.starG.position.y = y;
            for (let i = 0; i < n; i++) {
                const a = t * 1.7 + i / n * TAU, st = this.stars[i], k = 0.85 + 0.25 * Math.sin(t * 3.3 + i * 2), rr = 0.2 + 0.08 * this.k;
                st.position.set(Math.cos(a) * rr, Math.sin(t * 2.1 + i * 2.1) * 0.03, Math.sin(a) * rr);
                st.rotation.y = t * 2.4 + i;
                st.scale.setScalar(k);
            }
        }
    }
}
export function limb(b: Bld, h: number, wt: number, wb: number, c: Col, dz = 0, t: Xf = {}) {
    b.hull([[-wt, 0, -wt * 0.8], [wt, 0, -wt * 0.8], [0, 0, wt * 1.1], [-wb, -h, -wb * 0.8 + dz * 0.5], [wb, -h, -wb * 0.8 + dz * 0.5], [0, -h, wb * 1.1 + dz]], c, { j: 0.004, ...t });
}
export function eyePair(b: Bld, x: number, y: number, z: number, r: number, o: { col?: number; sy?: number; sz?: number; hl?: number } = {}) {
    const col = o.col ?? 0x3a2433, sy = o.sy ?? 1.18;
    for (const sx of [-1, 1]) {
        b.ico(r, 0, col, { x: sx * x, y, z, sx: 0.92, sy, sz: o.sz ?? 0.62, ao: false, v: 0.02 });
        b.oct(r * 0.36, o.hl ?? 0xffffff, { x: sx * x - r * 0.3, y: y + r * 0.45 * sy, z: z + r * 0.44, sz: 0.7, ao: false, v: 0 });
    }
}
export const fireMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.15, 1.9, 1.75) });
export const FIRE_R = 0xe02a14;
export const FIRE_O = 0xff7a16;
export const FIRE_Y = 0xffd860;
export const FIRE_W = 0xfff4c0;
export const fireCol = (h: number, hot: boolean) => (_x: number, y: number) => {
    const t = clamp(y / h);
    return hot ? mix(FIRE_O, FIRE_W, t) : t < 0.5 ? mix(FIRE_R, FIRE_O, t * 2) : mix(FIRE_O, FIRE_Y, (t - 0.5) * 2);
};
export function flameShape(mb: MB, h: number, w: number, o: { n?: number; curl?: number; hot?: boolean; x?: number; y?: number; z?: number; ry?: number; rz?: number } = {}) {
    const n = o.n ?? 5, curl = o.curl ?? 0.3;
    const ring = (y: number, r: number, cx: number, rot: number) => {
        const out: number[][] = [];
        for (let i = 0; i < n; i++) {
            const a = rot + i / n * TAU;
            out.push([cx + Math.cos(a) * r, y, Math.sin(a) * r]);
        }
        return out;
    };
    mb.custom('fire', fireMat).hull([...ring(0, w, 0, 0), ...ring(h * 0.5, w * 0.6, curl * w * 0.5, 0.5), [curl * w * 1.7, h, 0]], fireCol(h, !!o.hot), { ao: false, v: 0.1, j: 0.004, x: o.x, y: o.y, z: o.z, ry: o.ry, rz: o.rz });
}
export function soft(mb: MB, name: string, color: number, e = 0.5) {
    return mb.custom(name, M(0xffffff, { vc: true, e, ec: color, r: 0.6 }));
}
