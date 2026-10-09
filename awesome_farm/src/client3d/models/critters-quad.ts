// Four-legged creature species: gnaw, cinderkit, sandpaw, frostpup, duskmaw, pyrelion and aurorin.
import { type Bone, type CritterSpec, eyePair, flameShape, limb, type Rig, sh, soft } from './critters-rig';
import { type Col, flicker, MB, mix } from './kit';

export const PINK = 0xf79fc6;
export const CREAM = 0xfff6e0;
export const NOSE = 0x3a2433;
/** A four-legged body: colour, belly, sock colour, body radii and height, legs and hips; `col` overrides the body colour, `torsoExtra` adds to it. */
export interface QuadBody {
    c: number; belly?: number; sock?: number; col?: Col; segs?: number;
    by: number; bx: number; bh: number; bz: number;
    legH: number; legW: number; hipX: number; hipF: number; hipB: number;
    torsoExtra?(mb: MB): void;
}
/** A round head: colour, radii, where it sits, a lighter lower half or a cap, a muzzle, nose, eyes, sleeping offsets and extra parts. */
export interface QuadHead {
    c: number; hx: number; hy: number; hz: number; y: number; z: number;
    lower?: number; cap?: number;
    muzzle?: { c: number; r: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number };
    nose?: number; noseY?: number; noseZ?: number; sleepY?: number; sleepZ?: number;
    eye?: { rad?: number; glow?: number; col?: number };
    extra?(mb: MB): void;
}
export function quadBody(r: Rig, o: QuadBody) {
    r.torso = r.part('torso', null, (mb: MB) => {
        mb.main.sph(1, o.segs ?? 7, 4, o.col ?? ((x: number, y: number, z: number) => y < -o.bh * 0.35 ? o.belly! : sh(o.c, -o.bh, o.bh * 1.1, 0.3)(x, y, z)), { sx: o.bx, sy: o.bh, sz: o.bz, j: 0.01 });
        o.torsoExtra?.(mb);
    }, 0, o.by, 0);
    const hipY = o.legH + 0.004;
    const sock = o.sock ?? o.c;
    ['legFL', 'legFR', 'legBL', 'legBR'].forEach((nm, i) => {
        const front = i < 2, sx = i % 2 ? -1 : 1;
        const L = r.part(nm, null, (mb: MB) => {
            limb(mb.main, o.legH, o.legW, o.legW * 1.15, (_x: number, y: number) => y < -o.legH * 0.5 ? sock : o.c, o.legW * 0.8);
        }, sx * o.hipX, hipY, front ? o.hipF : o.hipB, { sy: 0.28 });
        r.legs.push(L);
    });
    r.body.s.y = -o.legH * 0.72;
    r.body.s.sy = 0.9;
    r.body.s.sx = 1.06;
    r.body.s.sz = 1.04;
}
export function quadHead(r: Rig, o: QuadHead) {
    r.head = r.part('head', null, (mb: MB) => {
        mb.main.sph(1, 7, 4, (x: number, y: number, z: number) => o.lower !== undefined && y < -o.hy * 0.3 && z > 0 ? o.lower : o.cap !== undefined && y > o.hy * 0.35 ? sh(o.cap, -o.hy, o.hy * 1.1, 0.25)(x, y, z) : sh(o.c, -o.hy, o.hy * 1.1, 0.25)(x, y, z), { sx: o.hx, sy: o.hy, sz: o.hz, j: 0.008 });
        if (o.muzzle) {
            const m = o.muzzle;
            mb.main.oct(m.r, m.c, { y: m.y ?? -o.hy * 0.3, z: m.z ?? o.hz * 0.85, sx: m.sx ?? 0.9, sy: m.sy ?? 0.65, sz: m.sz ?? 1.2, ao: false, v: 0.03, j: 0.004 });
        }
        if (o.nose !== undefined) mb.main.tet(o.hx * 0.14, o.nose, { y: o.noseY ?? -o.hy * 0.16, z: o.noseZ ?? o.hz * 1.3, ry: 0.4, ao: false, v: 0 });
        o.extra?.(mb);
    }, 0, o.y, o.z, { y: o.y - (o.sleepY ?? 0.07), z: o.z + (o.sleepZ ?? 0.05) });
    const head = r.head;
    head.rot(-0.42, 0, 0, [0.5, 0, 0]);
    const ex = o.hx * 0.44, ey = o.hy * 0.14, ez = o.hz * Math.sqrt(Math.max(0.2, 1 - (ex / o.hx) ** 2 - (ey / o.hy) ** 2)) * 0.97, rad = o.hx * (o.eye?.rad ?? 0.29);
    r.eyes = r.part('eyes', head, (mb: MB) => {
        if (o.eye?.glow) {
            for (const sx of [-1, 1]) {
                mb.glow(o.eye.glow, 1.9).ico(rad, 0, o.eye.glow, { x: sx * ex, y: 0, z: ez, sx: 0.95, sy: 1.1, sz: 0.62, ao: false, v: 0.02 });
                mb.main.oct(rad * 0.36, 0xffffff, { x: sx * ex - rad * 0.3, y: rad * 0.45, z: ez + rad * 0.44, sz: 0.7, ao: false, v: 0 });
            }
        } else eyePair(mb.main, ex, 0, ez, rad, { col: o.eye?.col });
    }, 0, ey, 0);
    return head;
}
export function coneEar(r: Rig, x: number, y: number, z: number, o: { r: number; h: number; c: number; inner: number; tilt: number; tip?: number }) {

    const sx = x < 0 ? -1 : 1;
    const E = r.part('ear', r.head, (mb: MB) => {
        mb.main.cone(o.r, o.h, 4, (xx: number, yy: number, zz: number) => o.tip && yy > o.h * 0.62 ? o.tip : sh(o.c, -o.h * 0.7, o.h * 0.9, 0.2)(xx, yy, zz), { y: o.h / 2, ry: 0.78, j: 0.004 });
        mb.main.tet(o.r * 0.8, o.inner, { y: o.h * 0.34, z: o.r * 0.42, sy: 2.6, ry: 0.5, ao: false, v: 0.03 });
    }, x, y, z);
    E.rot(-0.1, 0, -sx * o.tilt, [-0.7, 0, -sx * (o.tilt + 0.6)]);
    r.ears.push(E);
    return E;
}
export const cinderkit: CritterSpec = {
    cfg: { f: 3, hop: 0.06, sq: 0.07, roll: 0.05, pitch: 0.12, leg: 0.8, tail: 0.3, tailF: 2.6, tailMv: 1.2, ear: 0.14, look: 0.22 },
    build(r) {
        const C = 0xf8a24a, SOCK = 0xb05a28;
        quadBody(r, {
            c: C,
            belly: CREAM,
            sock: SOCK,
            by: 0.165,
            bx: 0.125,
            bh: 0.11,
            bz: 0.17,
            legH: 0.09,
            legW: 0.037,
            hipX: 0.07,
            hipF: 0.09,
            hipB: -0.1,
            torsoExtra: (mb: MB) => mb.main.oct(0.09, CREAM, { y: -0.02, z: 0.13, sz: 0.8, sx: 1, ao: false, v: 0.04, j: 0.006 })
        });
        quadHead(r, { c: C, hx: 0.2, hy: 0.165, hz: 0.17, y: 0.29, z: 0.13, lower: CREAM, muzzle: { c: CREAM, r: 0.08, y: -0.06, z: 0.16, sz: 1.15 }, nose: NOSE, noseY: -0.04, noseZ: 0.255 });
        coneEar(r, 0.105, 0.115, -0.02, { r: 0.085, h: 0.21, c: C, inner: 0xc8643a, tilt: 0.28 });
        coneEar(r, -0.105, 0.115, -0.02, { r: 0.085, h: 0.21, c: C, inner: 0xc8643a, tilt: 0.28 });
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.oct(0.075, (x: number, y: number, z: number) => sh(C, -0.1, 0.1, 0.25)(x, y, z), { z: -0.09, sx: 0.85, sy: 0.85, sz: 2.2, j: 0.006 });
        }, 0, 0.19, -0.14);
        r.tail.rot(0.7, 0, 0, [0.25, 1.5, 0]);
        const fl = r.part('flame', r.tail, (mb: MB) => {
            flameShape(mb, 0.3, 0.085, { curl: 0.35 });
            flameShape(mb, 0.19, 0.05, { curl: 0.25, hot: true, z: 0.025 });
        }, 0, 0, -0.2);
        fl.rot(-0.7, 0, 0, [-0.25, 0, 0]);
        const fl2 = r.part('flame2', fl, (mb: MB) => {
            flameShape(mb, 0.15, 0.04, { curl: -0.5, n: 4 });
        }, 0.045, 0.12, -0.02);
        r.topY = 0.6;
        r.extra = (_rg, s) => {
            const f = flicker(s.t, 0.3), g = flicker(s.t + 0.4, 1.7);
            fl.my *= 0.85 + f * 0.55;
            fl.mx *= 1.1 - f * 0.3;
            fl.mz *= 1.1 - f * 0.3;
            fl.drz += Math.sin(s.t * 5 + 1) * 0.12 + Math.sin(s.t * 2.2) * 0.1 * (1 + s.mv);
            fl2.my *= 0.7 + g * 0.8;
            fl2.drz += Math.sin(s.t * 7) * 0.2;
            r.tail!.drx += s.mv * Math.sin(s.ph * 2) * 0.1;
        };
    }
};
export const gnaw: CritterSpec = {
    cfg: { f: 2.2, hop: 0.02, sq: 0.05, roll: 0.11, pitch: 0.05, leg: 0.6, legMode: 'diag', tail: 0.12, tailF: 2, tailMv: 1.3, ear: 0.1, look: 0.2, breathe: 0.03 },
    build(r) {
        const C = 0xb87a46, FEET = 0x8a5a34, LIGHT = 0xf4deaa;
        quadBody(r, {
            c: C,
            belly: LIGHT,
            sock: FEET,
            by: 0.17,
            bx: 0.16,
            bh: 0.135,
            bz: 0.19,
            legH: 0.08,
            legW: 0.045,
            hipX: 0.09,
            hipF: 0.1,
            hipB: -0.1,
            torsoExtra: (mb: MB) => mb.main.oct(0.09, LIGHT, { y: -0.03, z: 0.14, sz: 0.8, ao: false, v: 0.04, j: 0.006 })
        });
        quadHead(r, {
            c: C,
            hx: 0.2,
            hy: 0.165,
            hz: 0.165,
            y: 0.285,
            z: 0.125,
            lower: LIGHT,
            muzzle: { c: LIGHT, r: 0.085, y: -0.055, z: 0.15, sx: 1.15, sy: 0.75, sz: 1 },
            nose: NOSE,
            noseY: -0.02,
            noseZ: 0.245,
            // the chisel teeth
            extra: (mb: MB) => {
                for (const sx of [-1, 1]) mb.main.box(0.036, 0.062, 0.02, 0xfff6e0, { x: sx * 0.022, y: -0.108, z: 0.222, rx: 0.12, ao: false, v: 0.03 });
            }
        });
        for (const sx of [-1, 1]) {
            const E = r.part('ear', r.head, (mb: MB) => {
                mb.main.ico(0.055, 0, (x: number, y: number, z: number) => sh(0x7a4a2c, -0.05, 0.05, 0.2)(x, y, z), { sy: 0.8, sz: 0.6, j: 0.004 });
            }, sx * 0.15, 0.1, -0.03);
            E.rot(0, 0, -sx * 0.5, [0.2, 0, -sx * 0.9]);
            r.ears.push(E);
        }
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.box(0.16, 0.03, 0.22, (x: number, _y: number, z: number) => Math.round((z + x * 0.5) * 22) % 2 ? 0x6a402f : 0x7a4a34, { z: -0.12, j: 0.006, v: 0.04 });
        }, 0, 0.09, -0.17);
        r.tail.rot(0.25, 0, 0, [0.35, 0.6, 0]);
        r.topY = 0.5;
        r.extra = (rg, s) => {
            const u = (s.t + rg.ph0 * 1.3) % 7.5 / 7.5;
            if (u < 0.3) {
                const k = Math.sin(u / 0.3 * Math.PI) * (1 - s.mv);
                rg.head!.drx += Math.sin(s.t * 22) * 0.07 * k;
                rg.head!.dy += Math.abs(Math.sin(s.t * 22)) * 0.008 * k;
            }
        };
    }
};
export const sandpaw: CritterSpec = {
    cfg: { f: 3.4, hop: 0.035, sq: 0.05, roll: 0.04, pitch: 0.08, leg: 0.85, tail: 0.3, tailF: 2.4, tailMv: 0.8, ear: 0.3, look: 0.3, breathe: 0.025 },
    build(r) {
        const C = 0xf4deaa, SOCK = 0xd0a868;
        quadBody(r, {
            c: C,
            belly: CREAM,
            sock: SOCK,
            by: 0.2,
            bx: 0.105,
            bh: 0.1,
            bz: 0.165,
            legH: 0.12,
            legW: 0.03,
            hipX: 0.06,
            hipF: 0.09,
            hipB: -0.1,
            torsoExtra: (mb: MB) => mb.main.oct(0.075, CREAM, { y: -0.02, z: 0.12, sz: 0.8, ao: false, v: 0.04, j: 0.006 })
        });
        quadHead(r, { c: C, hx: 0.185, hy: 0.15, hz: 0.155, y: 0.31, z: 0.12, lower: CREAM, muzzle: { c: CREAM, r: 0.065, y: -0.05, z: 0.15, sx: 0.8, sy: 0.6, sz: 1.4 }, nose: NOSE, noseY: -0.035, noseZ: 0.245 });
        for (const sx of [-1, 1]) {
            const E = r.part('ear', r.head, (mb: MB) => {
                mb.main.oct(0.085, (x: number, y: number, z: number) => y > 0.27 ? 0x8a5a38 : sh(C, -0.05, 0.3, 0.25)(x, y, z), { y: 0.22, sx: 0.55, sy: 3.1, sz: 0.38, j: 0.005 });
                mb.main.oct(0.062, PINK, { y: 0.21, z: 0.018, sx: 0.5, sy: 2.7, sz: 0.3, ao: false, v: 0.03 });
            }, sx * 0.1, 0.09, -0.03);
            E.rot(-0.12, 0, -sx * 0.32, [-1.15, 0, -sx * 0.5]);
            r.ears.push(E);
        }
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.oct(0.055, (x: number, y: number, z: number) => z < -0.2 ? 0x6a402f : sh(C, -0.06, 0.06, 0.2)(x, y, z), { z: -0.14, sx: 0.8, sy: 0.8, sz: 3.2, j: 0.004 });
        }, 0, 0.19, -0.14);
        r.tail.rot(0.45, 0, 0, [0.15, 1.4, 0]);
        r.topY = 0.78;
    }
};
export const frostpup: CritterSpec = {
    cfg: { f: 3, hop: 0.04, sq: 0.05, roll: 0.06, pitch: 0.1, leg: 0.75, tail: 0.28, tailF: 2.2, tailMv: 1, ear: 0.12, look: 0.25, breathe: 0.03 },
    build(r) {
        const C = 0xd5d9e6, SNOW = 0xfffbf4, CAP = 0x8a90ac, ICE = 0x6ad0f0;
        quadBody(r, {
            c: C,
            belly: SNOW,
            sock: SNOW,
            by: 0.17,
            bx: 0.14,
            bh: 0.12,
            bz: 0.175,
            legH: 0.095,
            legW: 0.04,
            hipX: 0.08,
            hipF: 0.09,
            hipB: -0.1,
            torsoExtra: (mb: MB) => {
                mb.main.oct(0.095, SNOW, { y: -0.015, z: 0.13, sz: 0.8, sx: 1.05, ao: false, v: 0.04, j: 0.008 });
                for (const [x, z, k] of [[0.07, 0.05, 1], [-0.065, -0.07, 0.8]]) mb.glow(ICE, 2).oct(0.04 * k, 0x9ae0ee, { x, y: 0.115, z, sx: 0.8, sy: 2.4, sz: 0.8, rz: x * 2, ao: false, v: 0.08 });
            }
        });
        quadHead(r, {
            c: SNOW,
            cap: CAP,
            hx: 0.205,
            hy: 0.17,
            hz: 0.17,
            y: 0.3,
            z: 0.13,
            muzzle: { c: SNOW, r: 0.08, y: -0.06, z: 0.165, sz: 1.2 },
            nose: NOSE,
            noseY: -0.04,
            noseZ: 0.26,
            eye: { col: 0x2f86e0, rad: 0.3 },
            extra: (mb: MB) => {
                mb.glow(ICE, 2).oct(0.035, 0x9ae0ee, { x: 0.08, y: 0.16, z: -0.02, sx: 0.8, sy: 2.4, sz: 0.8, rz: -0.3, ao: false, v: 0.08 });
            }
        });
        coneEar(r, 0.115, 0.11, -0.03, { r: 0.08, h: 0.19, c: 0x666b86, inner: 0xd5d9e6, tilt: 0.25 });
        coneEar(r, -0.115, 0.11, -0.03, { r: 0.08, h: 0.19, c: 0x666b86, inner: 0xd5d9e6, tilt: 0.25 });
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.ico(0.095, 0, (x: number, y: number, z: number) => y > 0.08 ? 0xcdf4ee : sh(SNOW, -0.1, 0.1, 0.2)(x, y, z), { y: 0.07, z: -0.07, sx: 0.85, sy: 1.25, sz: 1.2, j: 0.012 });
        }, 0, 0.22, -0.15);
        r.tail.rot(0.5, 0, 0, [0.2, 1.3, 0]);
        r.topY = 0.6;
    }
};
export const duskmaw: CritterSpec = {
    cfg: { f: 2.3, hop: 0.018, sq: 0.03, roll: 0.05, yaw: 0.07, pitch: 0.06, leg: 0.65, legMode: 'walk', tail: 0.4, tailF: 1.9, tailMv: 0.5, ear: 0.1, look: 0.25, breathe: 0.03 },
    build(r) {
        const C = 0x7a62a0, BELLY = 0x9a82bc, GOLD = 0xffd966;
        r.legPh = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
        quadBody(r, { c: C, belly: BELLY, sock: 0x5a4678, by: 0.155, bx: 0.115, bh: 0.1, bz: 0.18, legH: 0.08, legW: 0.035, hipX: 0.07, hipF: 0.1, hipB: -0.11 });
        quadHead(r, {
            c: C,
            hx: 0.215,
            hy: 0.15,
            hz: 0.165,
            y: 0.27,
            z: 0.14,
            eye: { glow: GOLD, rad: 0.3 },
            extra: (mb: MB) => {
                mb.main.hull([[-0.1, -0.03, 0.14], [0.1, -0.03, 0.14], [0.085, -0.095, 0.13], [-0.085, -0.095, 0.13], [0, -0.035, 0.165], [0, -0.105, 0.158]], 0x35223c, { ao: false, v: 0.02 });
                for (let i = 0; i < 5; i++) {
                    const x = -0.075 + i * 0.0375, big = i % 2 === 0;
                    mb.main.tet(big ? 0.024 : 0.017, 0xffffff, { x, y: -0.045 - (big ? 0.012 : 0), z: 0.166, rx: Math.PI * 0.9, ao: false, v: 0, sy: 1.5 });
                    mb.main.tet(big ? 0.017 : 0.024, 0xffffff, { x: x + 0.015, y: -0.09 + (big ? 0 : 0.01), z: 0.162, rx: -0.1, ao: false, v: 0, sy: 1.5 });
                }
                mb.main.tet(0.03, PINK, { y: 0, z: 0.195, ry: 0.4, ao: false, v: 0 });
            }
        });
        coneEar(r, 0.115, 0.11, -0.02, { r: 0.085, h: 0.2, c: C, inner: PINK, tilt: 0.3 });
        coneEar(r, -0.115, 0.11, -0.02, { r: 0.085, h: 0.2, c: C, inner: PINK, tilt: 0.3 });
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.oct(0.06, (x: number, y: number, z: number) => sh(C, -0.08, 0.08, 0.2)(x, y, z), { z: -0.12, sx: 0.7, sy: 0.7, sz: 2.4, j: 0.005 });
        }, 0, 0.17, -0.15);
        r.tail.rot(0.35, 0, 0, [0.05, 1.4, 0]);
        const t = r.part('tail2', r.tail, (mb: MB) => {
            mb.main.oct(0.055, (x: number, y: number, z: number) => sh(0x9d6fdb, -0.08, 0.08, 0.2)(x, y, z), { z: -0.11, sx: 0.7, sy: 0.7, sz: 2.2, j: 0.005 });
            mb.glow(0xf0709e, 2).oct(0.04, PINK, { z: -0.235, ao: false, v: 0.05 });
        }, 0, 0, -0.23);
        t.rot(-0.4, 0, 0, [-0.1, 0.4, 0]);
        r.topY = 0.55;
        r.extra = (_rg, s) => {
            t.dry += Math.sin(s.t * 2.4 + 1.2) * 0.45;
            t.drx += Math.sin(s.t * 1.7) * 0.15;
        };
    }
};
export const pyrelion: CritterSpec = {
    cfg: { f: 2.2, hop: 0.035, sq: 0.05, roll: 0.05, pitch: 0.06, leg: 0.6, legMode: 'walk', tail: 0.3, tailF: 2, tailMv: 0.6, ear: 0.1, look: 0.2, breathe: 0.03 },
    build(r) {
        const C = 0xffd966, ORANGE = 0xf8a24a;
        r.legPh = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
        quadBody(r, {
            c: C,
            belly: CREAM,
            sock: 0xe0a020,
            by: 0.19,
            bx: 0.16,
            bh: 0.14,
            bz: 0.2,
            legH: 0.1,
            legW: 0.05,
            hipX: 0.09,
            hipF: 0.11,
            hipB: -0.12,
            segs: 6
        });
        quadHead(r, { c: C, hx: 0.18, hy: 0.155, hz: 0.155, y: 0.31, z: 0.15, lower: CREAM, muzzle: { c: CREAM, r: 0.078, y: -0.055, z: 0.16, sz: 1.15 }, nose: 0xe0708f, noseY: -0.035, noseZ: 0.245 });
        for (const sx of [-1, 1]) {
            const E = r.part('ear', r.head, (mb: MB) => {
                mb.main.oct(0.065, (x: number, y: number, z: number) => sh(ORANGE, -0.06, 0.06, 0.2)(x, y, z), { sy: 0.9, sz: 0.6, j: 0.004 });
            }, sx * 0.135, 0.1, -0.03);
            E.rot(0, 0, -sx * 0.4, [0.2, 0, -sx * 0.8]);
            r.ears.push(E);
        }
        const mane = r.part('mane', r.head, (mb: MB) => {
            mb.main.oct(0.19, (x: number, y: number, z: number) => sh(0xe8803a, -0.17, 0.17, 0.35)(x, y, z), { z: -0.1, sx: 1, sy: 0.9, sz: 0.55, j: 0.012 });
            const n = 6;
            for (let i = 0; i < n; i++) {
                const a = -Math.PI * 0.12 + i / (n - 1) * Math.PI * 1.24, h = i % 2 === 0 ? 0.24 : 0.19, rr = 0.15;
                flameShape(mb, h, 0.075, { n: 3, curl: 0.35 * (i % 2 ? -1 : 1), x: Math.cos(a) * rr * 1.08, y: Math.sin(a) * rr * 0.95 - 0.01, z: -0.09, rz: a - Math.PI / 2, ry: i * 0.7 });
            }
        }, 0, 0, 0);
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.oct(0.065, (x: number, y: number, z: number) => sh(C, -0.08, 0.08, 0.2)(x, y, z), { z: -0.12, sx: 0.75, sy: 0.75, sz: 2.2, j: 0.005 });
        }, 0, 0.22, -0.18);
        r.tail.rot(0.3, 0, 0, [0.1, 1.3, 0]);
        const tf = r.part('tailflame', r.tail, (mb: MB) => {
            flameShape(mb, 0.22, 0.07, { curl: 0.3, n: 3 });
        }, 0, 0, -0.26);
        tf.rot(-0.3, 0, 0, [-0.1, 0, 0]);
        r.topY = 0.78;
        r.extra = (_rg, s) => {
            const f = flicker(s.t, 2.1);
            mane.drz += Math.sin(s.t * 1.7) * 0.05 + Math.sin(s.ph) * 0.06 * s.mv;
            mane.my *= 0.96 + f * 0.1;
            mane.mx *= 0.98 + f * 0.05;
            tf.my *= 0.85 + f * 0.5;
            tf.drz += Math.sin(s.t * 5) * 0.15;
            r.body.drx -= 0.04 * s.mv;
        };
    }
};
export const aurorin: CritterSpec = {
    cfg: { f: 1.7, hop: 0.03, sq: 0.03, roll: 0.025, pitch: 0.03, leg: 0.55, legMode: 'walk', tail: 0.2, tailF: 1.5, tailMv: 0.4, ear: 0.2, look: 0.22, breathe: 0.02 },
    build(r) {
        const C = 0xfffbf4, GOLD = 0xffd966;
        r.legPh = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
        const dawn = (_x: number, y: number, _z: number) => y > 0 ? mix(0xf2ece4, 0xb4d8f0, Math.min(1, y * 6)) : mix(0xf2ece4, 0xf4c0a8, Math.min(1, -y * 6));
        quadBody(r, {
            c: C,
            belly: 0xffe8d8,
            sock: GOLD,
            by: 0.34,
            bx: 0.14,
            bh: 0.125,
            bz: 0.19,
            legH: 0.25,
            legW: 0.032,
            hipX: 0.075,
            hipF: 0.1,
            hipB: -0.11,
            col: dawn,
            torsoExtra: (mb: MB) => {
                [[0xaee8f0, 0.07], [0xf79fc6, 0.02], [0xffd966, -0.03]].forEach(([col, y], i) => {
                    const g = soft(mb, 'ribbon' + i, col, 0.9);
                    for (const sx of [-1, 1]) g.hull([[0, 0, -0.06], [0.02, 0.02, 0.04], [0, 0.01, 0.13], [-0.02, -0.02, 0.04]], col, { x: sx * 0.13, y, z: -0.04 + i * 0.02, rz: sx * 0.3, sx: 1.4, ao: false, v: 0.05 });
                });
            }
        });
        r.body.s.y = -0.17;
        const H = {
            c: C,
            hx: 0.17,
            hy: 0.15,
            hz: 0.15,
            y: 0.55,
            z: 0.15,
            muzzle: { c: 0xfff6e0, r: 0.07, y: -0.05, z: 0.14, sx: 0.8, sy: 0.7, sz: 1.3 },
            nose: PINK,
            noseY: -0.03,
            noseZ: 0.23,
            sleepY: 0.2,
            sleepZ: 0.06,
            eye: { col: 0x3a86b8, rad: 0.3 }
        };
        quadHead(r, H);
        for (const sx of [-1, 1]) {
            const E = r.part(sx > 0 ? 'earR' : 'earL', r.head, (mb: MB) => {
                mb.main.oct(0.065, (x: number, y: number, z: number) => sh(C, -0.04, 0.14, 0.2)(x, y, z), { x: 0.075 * sx, sx: 2.5, sy: 0.8, sz: 0.5, j: 0.004 });
                mb.main.tet(0.05, PINK, { x: 0.075 * sx, z: 0.02, sx: 1.6, sy: 0.7, sz: 0.5, ao: false, v: 0.03 });
            }, sx * 0.13, 0.04, -0.03);
            E.rot(0, 0, sx * 0.3, [0, 0, sx * 0.9]);
            r.ears.push(E);
        }
        const ants: Bone[] = [];
        for (const sx of [-1, 1]) {
            const A = r.part('antler', r.head, (mb: MB) => {
                const g = mb.glow(0xf0b020, 2.1);
                g.blade(0, 0, 0.22, 0, 0, 0.022, GOLD, { ao: false, v: 0.05 });
                g.blade(0, 0, 0.14, 0.09, 0.05, 0.016, 0xffe680, { y: 0.1, x: 0, ao: false, v: 0.05 });
                g.blade(0, 0, 0.1, 0, 0, 0.016, 0xffe680, { y: 0, ao: false, v: 0.05, rz: 0 });
            }, sx * 0.07, 0.115, -0.02);
            A.rot(0, 0, -sx * 0.4, [0.3, 0, -sx * 0.9]);
            if (sx < 0) A.g.scale.x = -1;
            ants.push(A);
        }
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.oct(0.055, 0xfffbf4, { z: -0.04, sx: 0.8, sy: 1.1, sz: 1.5, j: 0.005 });
            mb.glow(0x8ad8f0, 1.8).oct(0.03, 0xaee8f0, { z: -0.11, y: 0.01, sx: 0.8, sz: 1.5, ao: false, v: 0.05 });
        }, 0, 0.4, -0.2);
        r.tail.rot(0.5, 0, 0, [0.5, 0, 0]);
        r.topY = 0.92;
        r.extra = (_rg, s) => {
            r.body.dy += Math.sin(s.ph * 2) * 0.012 * s.mv;
            r.head!.dry += Math.sin(s.t * 0.9) * 0.1;
            for (let i = 0; i < ants.length; i++) ants[i].my *= 1 + Math.sin(s.t * 2.2 + i * 2.7) * 0.04;
        };
    }
};
