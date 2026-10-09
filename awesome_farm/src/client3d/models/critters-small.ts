// Small creature species: hopper, fuzzle, mossback, pebbit and sparkit.
import { type CritterSpec, eyePair, limb, type Rig, sh } from './critters-rig';
import { clamp, hash3, MB, mix } from './kit';

export const PINK = 0xf79fc6;
export const INKC = 0x2a1d2c;
/** A rabbit-like body: coat, belly, inner ear, ear length, tail tuft, cheeks, and a rocky back. */
export interface RabbitLook { C: number; BELLY: number; EARIN: number; earLen: number; tailC: number; cheek?: number; rocky?: boolean }
export function rabbit(r: Rig, o: RabbitLook) {
    const { C, BELLY } = o;
    r.body.s.sy = 0.9;
    r.body.s.sx = 1.06;
    r.body.s.sz = 1.06;
    r.torso = r.part('torso', null, (mb: MB) => {
        mb.main.sph(1, 7, 4, (x: number, y: number, z: number) => y < -0.05 ? BELLY : sh(C, -0.17, 0.17, 0.3)(x, y, z), { sx: 0.18, sy: 0.16, sz: 0.19, j: o.rocky ? 0.016 : 0.008 });
        if (o.rocky) {
            mb.main.hull([[-0.05, 0, -0.04], [0.05, 0, -0.04], [0.04, 0, 0.05], [-0.04, 0, 0.05], [0, 0.07, 0]], 0x666b86, { x: -0.06, y: 0.12, z: -0.06, rx: -0.2, rz: 0.3, j: 0.005 });
            mb.main.hull([[-0.04, 0, -0.04], [0.04, 0, -0.04], [0.04, 0, 0.04], [-0.04, 0, 0.04], [0, 0.06, 0.01]], 0x7a7f9e, { x: 0.07, y: 0.1, z: -0.1, rx: -0.3, rz: -0.35, j: 0.005 });
        }
    }, 0, 0.16, -0.05);
    r.legPh = [0.5, 0.5, 0, 0];
    r.cfg.legAmp = [-0.9, -0.9, 1.2, 1.2];
    const paw = (name: string, x: number, z: number, big: boolean) => {
        const L = r.part(name, null, (mb: MB) => {
            limb(mb.main, big ? 0.07 : 0.06, big ? 0.05 : 0.04, big ? 0.062 : 0.048, (_x: number, y: number) => y < -0.035 ? BELLY : C, big ? 0.07 : 0.035);
        }, x, big ? 0.075 : 0.07, z, { sy: 0.35 });
        r.legs.push(L);
    };
    paw('pawFL', 0.07, 0.1, false);
    paw('pawFR', -0.07, 0.1, false);
    paw('pawBL', 0.115, -0.1, true);
    paw('pawBR', -0.115, -0.1, true);
    r.tail = r.part('tail', null, (mb: MB) => {
        mb.main.ico(0.06, 0, (_x: number, y: number, z: number) => mix(o.tailC
, 0xffffff, clamp(y * 6 + 0.4 + z)), { j: 0.008 });
    }, 0, 0.16, -0.24);
    r.head = r.part('head', null, (mb: MB) => {
        mb.main.sph(1, 7, 5, sh(C, -0.18, 0.2, 0.25), { sx: 0.22, sy: 0.19, sz: 0.19, j: o.rocky ? 0.014 : 0.008 });
        if (o.cheek) for (const sx of [-1, 1]) mb.main.oct(0.04, o.cheek, { x: sx * 0.14, y: -0.045, z: 0.08, sz: 0.55, sy: 0.8, ao: false, v: 0.04 });
        mb.main.tet(0.028, 0xe0708f, { y: -0.015, z: 0.188, ry: 0.4, ao: false });
        if (o.rocky) for (const [x, z, k] of [[0, 0.07, 1], [0.045, 0, 0.8], [-0.045, 0, 0.8]]) mb.main.tet(0.035 * k, 0x666b86, { x, y: 0.185, z, sy: 1.5, ry: x * 9, j: 0.004 });
    }, 0, 0.34, 0.1, { y: 0.28, z: 0.14 });
    r.head.rot(-0.42, 0, 0, [0.55, 0, 0]);
    r.eyes = r.part('eyes', r.head, (mb: MB) => {
        eyePair(mb.main, 0.095, 0, 0.158, 0.06);
    }, 0, 0.045, 0);
    for (const sx of [-1, 1]) {
        const L = o.earLen;
        const E = r.part('ear', r.head, (mb: MB) => {
            mb.main.oct(0.065, (x: number, y: number, z: number) => sh(C, -0.1, L * 1.9, 0.2)(x, y, z), { y: L, sx: 0.62, sy: L / 0.055, sz: 0.5, j: 0.006 });
            mb.main.oct(0.045, o.EARIN, { y: L, z: 0.02, sx: 0.55, sy: L / 0.062, sz: 0.4, ao: false, v: 0.03 });
        }, sx * 0.085, 0.14, -0.02);
        E.rot(-0.08, 0, -sx * 0.22, [-1.25, 0, -sx * 0.3]);
        r.ears.push(E);
    }
    r.topY = 0.34 + 0.19 + o.earLen * 1.7;
}
export const hopper: CritterSpec = {
    cfg: { f: 2.1, hop: 0.17, arc: true, sq: 0.16, pitch: 0.3, leg: 0.75, lift: 0, tail: 0.3, tailF: 3, ear: 0.3, look: 0.25, breathe: 0.03 },
    build(r) {
        rabbit(r, { C: 0xb4e47a, BELLY: 0xf0f8c8, EARIN: PINK, earLen: 0.17, tailC: 0xfff0d2, cheek: PINK });
        r.extra = (rg, s) => {
            const u = (s.t + rg.ph0) % 6.5 / 6.5;
            if (u < 0.34) {
                const k = Math.sin(u / 0.34 * Math.PI) * (1 - s.mv);
                rg.head!.drx += (0.42 + 0.1 * Math.sin(s.t * 24)) * k;
                rg.body.drx += 0.14 * k;
                rg.ears[0].drx += 0.2 * k;
                rg.ears[1].drx += 0.2 * k;
            }
        };
    }
};
export const pebbit: CritterSpec = {
    cfg: { f: 3.6, hop: 0.09, arc: true, sq: 0.1, pitch: 0.2, leg: 0.8, lift: 0, tail: 0.2, tailF: 3.5, ear: 0.2, look: 0.3, breathe: 0.03 },
    build(r) {
        rabbit(r, { C: 0x9ea4b9, BELLY: 0xd5d9e6, EARIN: 0x666b86, earLen: 0.13, tailC: 0xd5d9e6, rocky: true });
        r.extra = (rg, s) => {
            const u = (s.t + rg.ph0) % 7 / 7;
            if (u < 0.3) {
                const k = Math.sin(u / 0.3 * Math.PI) * (1 - s.mv);
                rg.legs[0].drx += Math.sin(s.t * 19) * 0.9 * k - 0.2 * k;
                rg.legs[1].drx += Math.sin(s.t * 19 + 2.4) * 0.9 * k - 0.2 * k;
                rg.head!.drx += 0.5 * k;
                rg.body.drx += 0.16 * k;
                rg.body.dy += Math.abs(Math.sin(s.t * 19)) * 0.008 * k;
            }
        };
    }
};
export const sparkit: CritterSpec = {
    cfg: { f: 4.2, hop: 0.06, arc: true, sq: 0.12, pitch: 0.18, leg: 0.8, lift: 0, tail: 0.18, tailF: 4.2, tailMv: 0.8, ear: 0.2, look: 0.35, breathe: 0.035 },
    build(r) {
        const C = 0xf8a24a, CREAM = 0xfff6e0, GOLD = 0xffd966;
        r.legPh = [0.4, 0.4, 0, 0];
        r.cfg.legAmp = [-0.8, -0.8, 1.2, 1.2];
        r.body.s.sy = 0.88;
        r.body.s.sx = 1.06;
        r.body.s.sz = 1.06;
        r.body.s.y = 0;
        r.torso = r.part('torso', null, (mb: MB) => {
            mb.main.sph(1, 6, 4, (x: number, y: number, z: number) => z > 0.05 && y < 0.07 ? CREAM : sh(C, -0.15, 0.16, 0.3)(x, y, z), { sx: 0.125, sy: 0.15, sz: 0.13, j: 0.008, rx: 0.3 });
        }, 0, 0.16, -0.05);
        const paw = (name: string, x: number, z: number, big: boolean) => {
            const L = r.part(name, null, (mb: MB) => {
                limb(mb.main, big ? 0.06 : 0.07, big ? 0.045 : 0.03, big ? 0.055 : 0.04, (_x: number, y: number) => y < -0.03 ? CREAM : C, big ? 0.07 : 0.02);
            }, x, big ? 0.06 : 0.12, z, { sy: 0.4 });
            r.legs.push(L);
        };
        paw('pawFL', 0.06, 0.08, false);
        paw('pawFR', -0.06, 0.08, false);
        paw('pawBL', 0.09, -0.1, true);
        paw('pawBR', -0.09, -0.1, true);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 6, 4, (x: number, y: number, z: number) => y < -0.05 && z > 0.05 ? CREAM : sh(C, -0.15, 0.16, 0.25)(x, y, z), { sx: 0.19, sy: 0.16, sz: 0.155, j: 0.008 });
            mb.main.oct(0.075, CREAM, { y: -0.055, z: 0.1, sx: 1.7, sy: 0.8, sz: 1, ao: false, v: 0.03 });
            mb.main.tet(0.027, INKC, { y: -0.02, z: 0.205, ry: 0.4, ao: false, v: 0 });
        }, 0, 0.33, 0.1, { y: 0.25, z: 0.15 });
        r.head.rot(-0.42, 0, 0, [0.55, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            eyePair(mb.main, 0.082, 0, 0.134, 0.055);
        }, 0, 0.02, 0);
        for (const sx of [-1, 1]) {
            const E = r.part('ear', r.head, (mb: MB) => {
                mb.main.cone(0.06, 0.15, 4, (x: number, y: number, z: number) => sh(C, -0.02, 0.15, 0.2)(x, y, z), { y: 0.075, ry: 0.78, j: 0.004 });
                mb.main.tet(0.045, GOLD, { y: 0.05, z: 0.025, sy: 2.4, ry: 0.5, ao: false, v: 0.03 });
            }, sx * 0.1, 0.12, -0.02);
            E.rot(-0.1, 0, -sx * 0.25, [-0.7, 0, -sx * 0.8]);
            r.ears.push(E);
        }
        r.tail = r.part('tail', null, (mb: MB) => {
            const col = (x: number, y: number, z: number) => y > 0.3 ? 0xffc83c : sh(C, 0, 0.3, 0.3)(x, y, z);
            mb.main.ico(0.125, 0, col, { y: 0.1, z: -0.1, sx: 1, sy: 1.1, sz: 1.3, j: 0.014 });
            mb.main.ico(0.125, 0, col, { x: 0.03, y: 0.22, z: -0.27, sx: 1.05, sy: 1.25, sz: 1.1, j: 0.014 });
            mb.main.ico(0.095, 0, col, { x: 0.09, y: 0.37, z: -0.27, sx: 0.95, sy: 1.25, sz: 0.95, j: 0.012 });
        }, 0, 0.08, -0.12);
        r.tail.rot(0, 0, 0, [1.4, 0, 0]);
        const sparks = [[0.17, 0.5, -0.38], [-0.16, 0.34, -0.4], [-0.18, 0.5, 0]].map(([x, y, z]) => r.part('spark', null, (mb: MB) => {
            mb.glow(0xf5a818, 2.6).oct(0.03, 0xffd060, { sx: 0.7, sy: 1.5, sz: 0.7, ao: false, v: 0 });
        }, x, y, z));
        r.topY = 0.62;
        r.extra = (_rg, s) => {
            for (let i = 0; i < sparks.length; i++) {
                const B = sparks[i], k = Math.max(0, Math.sin(s.t * 9 + i * 2.3) * Math.sin(s.t * 5.3 + i * 1.7));
                const on = k > 0.08 && s.sl < 0.5 ? (0.5 + k * 1) * (1 - s.sl * 2) : 0.0001;
                B.mx *= on;
                B.my *= on;
                B.mz *= on;
                B.drz += s.t * 3 + i;
                B.dy += Math.sin(s.t * 2.3 + i) * 0.015;
            }
            r.tail!.drz += Math.sin(s.ph * 2) * 0.1 * s.mv;
        };
    }
};
export const fuzzle: CritterSpec = {
    cfg: { f: 2, hop: 0.03, sq: 0.07, roll: 0.14, pitch: 0.04, leg: 0.55, tail: 0.1, ear: 0.2, look: 0.25, breathe: 0.035 },
    build(r) {
        const FACE = 0x6e66b8, FACE2 = 0x8c86d4;
        r.body.s.sy = 0.92;
        r.body.s.sx = 1.08;
        r.body.s.sz = 1.08;
        r.body.s.y = -0.05;
        r.torso = r.part('wool', null, (mb: MB) => {
            const col = (x: number, y: number, z: number) => mix(0xf6b880, 0xfffadc, clamp((y + 0.2) / 0.42 + z * 0.9 - x * 0.3 + (hash3(x * 9, y * 9, z * 9) - 0.5) * 0.25));
            mb.main.sph(1, 8, 5, col, { sx: 0.24, sy: 0.21, sz: 0.245, j: 0.03 });
            for (const [x, y, z, k] of [[-0.18, 0.09, -0.06, 1.05], [0.18, 0.08, -0.05, 1.05], [0, 0.17, -0.14, 1]])
                mb.main.ico(0.1 * k, 0, col, { x, y, z, j: 0.02 });
        }, 0, 0.22, -0.05);
        const leg = (name: string, x: number, z: number) => r.legs.push(r.part(name, null, (mb: MB) => {
            limb(mb.main, 0.1, 0.037, 0.045, (xx: number, y: number, zz: number) => sh(FACE, -0.1, 0, 0.2)(xx, y, zz), 0.03);
        }, x, 0.115, z, { sy: 0.3 }));
        leg('legFL', 0.09, 0.1);
        leg('legFR', -0.09, 0.1);
        leg('legBL', 0.09, -0.1);
        leg('legBR', -0.09, -0.1);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 6, 4, sh(FACE, -0.13, 0.14, 0.25), { sx: 0.16, sy: 0.14, sz: 0.135, j: 0.008 });
            mb.main.oct(0.07, FACE2, { y: -0.04, z: 0.12, sx: 0.9, sy: 0.65, sz: 1.1, ao: false, v: 0.03 });
            mb.main.tet(0.025, PINK, { y: -0.022, z: 0.2, ry: 0.4, ao: false, v: 0 });
        }, 0, 0.24, 0.22, { y: 0.17, z: 0.21 });
        r.head.rot(-0.42, 0, 0, [0.5, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            for (const sx of [-1, 1]) {
                mb.main.ico(0.058, 0, 0xffffff, { x: sx * 0.07, z: 0.095, sx: 0.95, sy: 1.15, sz: 0.65, ao: false, v: 0.02 });
                mb.main.oct(0.034, 0x3a2433, { x: sx * 0.066, y: -0.008, z: 0.135, sx: 0.9, sy: 1.15, sz: 0.5, ao: false, v: 0 });
            }
        }, 0, 0.03, 0);
        for (const sx of [-1, 1]) {
            const E = r.part('ear', r.head, (mb: MB) => {
                mb.main.oct(0.045, (x: number, y: number, z: number) => sh(FACE, -0.06, 0.06, 0.2)(x, y, z), { y: -0.05, sx: 0.8, sy: 1.8, sz: 0.5, j: 0.004 });
            }, sx * 0.15, 0.04, 0);
            E.rot(0, 0, -sx * 0.9, [0.3, 0, -sx * 1.1]);
            r.ears.push(E);
        }
        r.topY = 0.52;
        r.extra = (_rg, s) => {
            const w = r.torso, k = Math.sin(s.ph) * s.mv;
            w!.drz -= k * 0.06;
            w!.mx *= 1 + Math.abs(k) * 0.05;
            w!.my *= 1 - Math.abs(Math.cos(s.ph)) * 0.04 * s.mv;
            r.head!.drz -= k * 0.08;
        };
    }
};
export const mossback: CritterSpec = {
    cfg: { f: 1.1, hop: 0.012, sq: 0.03, roll: 0.05, pitch: 0.03, leg: 0.5, legMode: 'walk', tail: 0.2, tailF: 1.5, ear: 0, look: 0.2, breathe: 0.025 },
    build(r) {
        const G = 0x8ad468, SHELL = 0x6cb85a, BROWN = 0xa8744a;
        r.legPh = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
        r.body.s.y = -0.04;
        r.torso = r.part('shell', null, (mb: MB) => {
            mb.main.dome(1, 1, 8, 2, (x: number, y: number, z: number) => {
                const plate = (Math.floor((x + 1) * 4.2) + Math.floor((z + 1) * 4.2) + Math.floor(y * 3)) % 3;
                return sh(plate === 0 ? SHELL : plate === 1 ? 0x84cc66 : 0x9ad870, 0, 0.26, 0.5)(x, y, z);
            }, { sx: 0.3, sy: 0.26, sz: 0.34, j: 0.014 });
            mb.main.ico(0.3, 0, (x: number, y: number, z: number) => sh(BROWN, -0.1, 0.1, 0.3)(x, y, z), { y: 0.03, sx: 1.02, sy: 0.3, sz: 1.12, j: 0.01 });
        }, 0, 0.09, 0);
        const leg = (name: string, x: number, z: number) => r.legs.push(r.part(name, null, (mb: MB) => {
            limb(mb.main, 0.1, 0.055, 0.065, (xx: number, y: number, zz: number) => sh(G, -0.1, 0, 0.25)(xx, y, zz), 0.04);
        }, x, 0.1, z, { sy: 0.2 }));
        leg('legFL', 0.2, 0.2);
        leg('legFR', -0.2, 0.2);
        leg('legBL', 0.2, -0.2);
        leg('legBR', -0.2, -0.2);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 6, 4, sh(G, -0.12, 0.13, 0.25), { sx: 0.14, sy: 0.12, sz: 0.13, j: 0.008 });
            mb.main.oct(0.06, 0xaee884, { y: -0.04, z: 0.1, sx: 1, sy: 0.6, sz: 1.1, ao: false, v: 0.03 });
        }, 0, 0.16, 0.4, { y: 0.1, z: 0.2, sx: 0.55, sy: 0.55, sz: 0.55 });
        r.head.rot(-0.4, 0, 0, [0.5, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            eyePair(mb.main, 0.06, 0, 0.1, 0.048);
        }, 0, 0.025, 0);
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.tet(0.05, G, { z: -0.04, rx: -1.2, sy: 1.5, j: 0.004 });
        }, 0, 0.08, -0.36);
        const garden = r.part('garden', null, (mb: MB) => {
            const L = [0x6cc454, 0x92d860, 0xc4f078];
            for (const [x, z, h, lx, lz] of [[-0.1, -0.02, 0.22, -0.06, 0.02], [0, 0.08, 0.18, 0.03, 0.05], [0.09, -0.07, 0.21, 0.06, -0.02], [0.14, 0.05, 0.14, 0.06, 0.02]])
                mb.main.blade(x, z, h, lx, lz, 0.036, (_xx: number, y: number) => L[Math.min(2, Math.max(0, Math.floor(y / h * 3)))], { ao: false });
            mb.main.blade(0, -0.02, 0.2, 0.02, 0.02, 0.012, 0x3f8a4c, { ao: false });
            mb.main.ico(0.062, 0, (_x: number, y: number) => mix(0xe0609a, 0xffdce8, clamp(y * 8 + 0.4)), { x: 0.02, y: 0.225, z: 0, sy: 0.8, j: 0.006, ao: false });
            mb.main.oct(0.024, 0xfff3b0, { x: 0.02, y: 0.255, z: 0.012, ao: false, v: 0 });
            mb.main.blade(-0.08, 0.04, 0.14, -0.01, 0, 0.012, 0x3f8a4c, { ao: false });
            mb.main.oct(0.04, 0xffd966, { x: -0.09, y: 0.16, z: 0.04, sy: 0.8, ao: false, v: 0.04 });
        }, 0, 0.3, -0.02, { y: 0.25, sx: 0.8, sy: 0.7, sz: 0.8 });
        r.topY = 0.62;
        r.extra = (_rg, s) => {
            garden.drz += Math.sin(s.t * 1.3) * 0.05 + Math.sin(s.ph) * 0.06 * s.mv;
            garden.drx += Math.cos(s.t * 1.1) * 0.03;
            r.head!.dz += Math.sin(s.ph * 2) * 0.012 * s.mv;
        };
    }
};
