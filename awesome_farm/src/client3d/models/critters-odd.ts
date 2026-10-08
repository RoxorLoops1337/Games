// Creature species with odd bodies: bogsprout, glimmoth, scarabeau and crystalisk.
import { type Bone, type CritterSpec, eyePair, limb, sh, soft, tone } from './critters-rig';
import { clamp, MB, mix } from './kit';

export const PINK = 0xf79fc6;
export const INKC = 0x2a1d2c;
export const bogsprout: CritterSpec = {
    cfg: { f: 2.2, hop: 0.03, sq: 0.08, roll: 0.13, pitch: 0.04, leg: 0.5, tail: 0, ear: 0, look: 0.2, breathe: 0.04 },
    build(r) {
        const CAP = 0x8b5cc8, STEM = 0xffe6b0, LEAF = 0x5cb04f;
        r.body.s.sy = 0.9;
        r.body.s.sx = 1.08;
        r.body.s.sz = 1.08;
        r.torso = r.part('belly', null, (mb: MB) => {
            mb.main.sph(1, 7, 4, tone(STEM, -0.19, 0.19, 0.8, 1.02, 0.1), { sx: 0.18, sy: 0.19, sz: 0.17, j: 0.01 });
            for (const sx of [-1, 1]) mb.main.oct(0.034, 0xf8a8b8, { x: sx * 0.115, y: -0.04, z: 0.1, sz: 0.5, ao: false, v: 0.04 });
            mb.main.tet(0.022, 0xe85d62, { y: -0.062, z: 0.165, ry: 0.4, ao: false, v: 0 });
        }, 0, 0.2, 0);
        r.eyes = r.part('eyes', r.torso, (mb: MB) => {
            eyePair(mb.main, 0.07, 0, 0.14, 0.054);
        }, 0, 0.04, 0);
        const cap = r.part('cap', null, (mb: MB) => {
            mb.main.dome(1, 1, 8, 2, (x: number, y: number, z: number) => sh(CAP, 0, 0.19, 0.4)(x, y, z), { sx: 0.24, sy: 0.17, sz: 0.24, j: 0.012 });
            for (const [x, z, k] of [[-0.1, 0.02, 1], [0.09, 0.06, 0.9], [0.01, -0.11, 1.1], [-0.04, 0.12, 0.7], [0.13, -0.06, 0.7]]) {
                const yy = 0.17 * Math.sqrt(Math.max(0.05, 1 - ((x / 0.24) ** 2 + (z / 0.24) ** 2)));
                mb.main.oct(0.042 * k, 0xf0fbff, { x, y: yy - 0.002, z, sy: 0.35, rz: -x * 2, rx: z * 2, ao: false, v: 0.03 });
            }
            mb.main.ico(0.042, 0, PINK, { x: -0.07, y: 0.185, z: -0.03, sy: 0.8, j: 0.004, ao: false });
            mb.main.oct(0.016, 0xfff3b0, { x: -0.07, y: 0.208, z: -0.03, ao: false, v: 0 });
            mb.main.leaf(0.15, 0.045, 0.012, 0x6cc450, { x: 0.05, y: 0.18, z: 0, rx: -0.9, ry: 0.5, ao: false });
            mb.main.leaf(0.12, 0.04, 0.012, 0x9ad870, { x: 0.05, y: 0.18, z: 0, rx: -0.7, ry: -0.8, ao: false });
        }, 0, 0.34, -0.05, { y: 0.27, z: 0 });
        cap.rot(-0.72, 0, 0, [0.28, 0, 0]);
        const foot = (name: string, x: number) => r.legs.push(r.part(name, null, (mb: MB) => {
            mb.main.leaf(0.15, 0.05, 0.015, (xx: number, y: number, zz: number) => sh(LEAF, -0.02, 0.05, 0.3)(xx, y, zz), { z: -0.04, ao: false });
            mb.main.tet(0.026, 0x86cc5c, { y: 0.02, z: 0, ao: false, v: 0.05 });
        }, x, 0.035, 0.06, { sy: 0.6 }));
        foot('footL', 0.08);
        foot('footR', -0.08);
        r.legPh = [0, Math.PI, 0, Math.PI];
        r.topY = 0.58;
        r.extra = (_rg, s) => {
            const k = Math.sin(s.ph) * s.mv;
            cap.drz -= k * 0.12;
            cap.dy += Math.abs(Math.cos(s.ph)) * 0.01 * s.mv;
            cap.my *= 1 + Math.sin(s.t * 1.7) * 0.02 - Math.abs(Math.sin(s.ph)) * 0.04 * s.mv;
        };
    }
};
export const glimmoth: CritterSpec = {
    cfg: { f: 3, hop: 0, pitch: 0, tail: 0, ear: 0, look: 0.2, breathe: 0.04 },
    build(r) {
        const WING = 0xaee8f0, WING2 = 0xd8f6f4, GOLD = 0xffd966, FUR = 0xfff0d2;
        r.body.r.y = 0.5;
        r.body.s.y = 0.05;
        r.body.s.sy = 0.9;
        r.torso = r.part('body', null, (mb: MB) => {
            mb.main.sph(1, 7, 4, tone(FUR, -0.12, 0.12, 0.8, 1, 0.1), { sx: 0.085, sy: 0.12, sz: 0.085, j: 0.006, rx: 0.25 });
            mb.main.oct(0.055, 0xfffaf0, { y: 0.075, z: 0.045, sx: 1.1, sy: 0.8, sz: 0.9, ao: false, v: 0.03 });
        }, 0, 0, 0);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 6, 4, tone(FUR, -0.09, 0.09, 0.82, 1, 0.1), { sx: 0.1, sy: 0.088, sz: 0.088, j: 0.005 });
        }, 0, 0.15, 0.06, { y: 0.1, z: 0.07 });
        r.head.rot(-0.35, 0, 0, [0.3, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            eyePair(mb.main, 0.045, 0, 0.065, 0.044, { sy: 1.2 });
        }, 0, 0.01, 0);
        const ants: Bone[] = [];
        for (const sx of [-1, 1]) {
            const A = r.part(sx > 0 ? 'antennaR' : 'antennaL', r.head, (mb: MB) => {
                mb.main.cone(0.012, 0.14, 3, 0xe8e0c8, { x: sx * 0.035, y: 0.06, z: 0.015, rz: -sx * 0.5, rx: 0.2 });
                mb.glow(GOLD, 2.2).oct(0.02, GOLD, { x: sx * 0.072, y: 0.128, z: 0.032, ao: false, v: 0 });
            }, sx * 0.03, 0.07, 0);
            A.rot(0, 0, 0, [-0.5, 0, 0]);
            ants.push(A);
        }
        const wings: Bone[] = [];
        for (const sx of [1, -1]) {
            for (const low of [false, true]) {
                const W = r.part(low ? 'wingLo' : 'wingUp', r.torso, (mb: MB) => {
                    const pts = low ? [[0, 0, -0.02], [0.17, 0, -0.06], [0.24, 0, -0.16], [0.14, 0, -0.23], [0.03, 0, -0.15]] : [[0, 0, 0], [0.11, 0, 0.17], [0.32, 0, 0.15], [0.38, 0, 0.02], [0.23, 0, -0.08], [0.04, 0, -0.04]];
                    const top = pts.map(([x, y, z]) => [x, y + 0.007, z]), bot = pts.map(([x, y, z]) => [x, y - 0.007, z]);
                    const c = low ? WING2 : WING;
                    soft(mb, low ? 'wingLo' : 'wingUp', c, 0.5).hull([...top, ...bot], (x: number, _y: number, z: number) => mix(mix(c, 0x7ad0e8, 0.35), 0xffffff, clamp(x * 1.6 - 0.05 + z * 0.6)), { ao: false, v: 0.05 });
                    if (!low) mb.glow(GOLD, 2).oct(0.032, GOLD, { x: 0.22, y: 0.012, z: 0.06, sy: 0.4, ao: false, v: 0 });
                    else mb.glow(GOLD, 2).oct(0.024, GOLD, { x: 0.14, y: 0.012, z: -0.11, sy: 0.4, ao: false, v: 0 });
                }, 0, low ? -0.02 : 0.03, 0);
                W.r.sx = sx;
                W.s.sx = sx;
                wings.push(W);
            }
        }
        r.wings = wings;
        r.topY = 0.85;
        wings.forEach((W, i) => {
            const side = i < 2 ? 1 : -1;
            W.s.rz = side * 1.3;
        });
        r.extra = (_rg, s) => {
            const aw = s.aw, fast = 1 + s.mv * 0.6, ph = s.t * 11 * fast;
            const amp = (0.5 + 0.2 * s.mv) * aw;
            const flap = Math.sin(ph) * amp;
            for (let i = 0; i < 4; i++) {
                const W = wings[i], side = i < 2 ? 1 : -1, low = i % 2 === 1;
                W.drz += side * ((low ? Math.sin(ph - 0.5) * amp * 0.8 : flap) + 0.12 * aw);
            }
            r.body.dy += Math.sin(s.t * 3.1) * 0.035 * aw;
            for (let i = 0; i < ants.length; i++) {
                const A = ants[i];
                A.drz += Math.sin(s.t * 2.2 + A.r.x * 30) * 0.15;
                A.drx += Math.sin(s.t * 1.7) * 0.1;
            }
            r.torso!.drx += s.mv * 0.25;
            r.head!.drx -= s.mv * 0.1;
        };
    }
};
export const scarabeau: CritterSpec = {
    cfg: { f: 5, hop: 0.006, sq: 0.02, yaw: 0.09, roll: 0.03, leg: 0, tail: 0, ear: 0, look: 0.2, breathe: 0.03 },
    build(r) {
        const B = 0x2d7ac0, HEAD = 0x3a8ad0, GOLD = 0xffd966;
        r.body.s.sy = 0.85;
        r.body.s.sx = 1.05;
        r.body.s.sz = 1.05;
        r.body.s.y = -0.03;
        r.torso = r.part('shell', null, (mb: MB) => {
            mb.shiny().dome(1, 1, 8, 2, (x: number, y: number, z: number) => sh(B, 0, 0.16, 0.35)(x, y, z), { sx: 0.2, sy: 0.16, sz: 0.25, j: 0.008 });
            mb.shiny().oct(0.09, 0x7ad0ee, { x: -0.07, y: 0.12, z: -0.04, sx: 0.8, sy: 0.35, sz: 1.5, ao: false, v: 0.04 });
            for (const [x, y, z] of [[-0.1, 0.1, 0.07], [0.1, 0.1, 0.07], [-0.11, 0.06, -0.08], [0.11, 0.06, -0.08]]) mb.shiny().oct(0.03, GOLD, { x, y, z, sy: 0.8, ao: false, v: 0.04 });
        }, 0, 0.1, -0.05);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 7, 4, sh(HEAD, -0.1, 0.11, 0.3), { sx: 0.13, sy: 0.105, sz: 0.11, j: 0.006 });
            mb.main.cone(0.03, 0.12, 4, (x: number, y: number, z: number) => sh(0x153a60, 0, 0.12, 0.3)(x, y, z), { y: 0.12, z: 0.06, rx: 0.45, ry: 0.78 });
            mb.main.oct(0.022, GOLD, { y: 0.19, z: 0.1, ao: false, v: 0 });
        }, 0, 0.1, 0.27, { y: 0.07, z: 0.24 });
        r.head.rot(-0.4, 0, 0, [0.3, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            eyePair(mb.main, 0.058, 0, 0.09, 0.047);
        }, 0, 0.015, 0);
        const ants: Bone[] = [];
        for (const sx of [-1, 1]) {
            const A = r.part(sx > 0 ? 'antennaR' : 'antennaL', r.head, (mb: MB) => {
                mb.main.cone(0.014, 0.12, 3, 0x153a60, { y: 0.06, z: 0.03, rx: 0.5, rz: -sx * 0.25 });
                mb.main.oct(0.02, GOLD, { x: -sx * 0.03, y: 0.12, z: 0.08, ao: false, v: 0 });
            }, sx * 0.06, 0.07, 0.05);
            ants.push(A);
        }
        const pairs: Bone[] = [];
        [0.12, -0.02, -0.16].forEach((z, i) => {
            const P = r.part('legs' + i, null, (mb: MB) => {
                for (const sx of [-1, 1]) mb.main.cone(0.024, 0.2, 3, 0x1b3f66, { x: sx * 0.11, y: -0.02, rz: sx * 1.05, ry: 0.35 * sx * (i - 1), j: 0.003 });
            }, 0, 0.065, z, { sy: 0.4, sx: 0.4 });
            pairs.push(P);
        });
        r.topY = 0.45;
        r.extra = (_rg, s) => {
            for (let i = 0; i < pairs.length; i++) {
                const P = pairs[i], o = i % 2 ? Math.PI : 0;
                P.dry += Math.sin(s.ph + o) * 0.45 * s.mv + Math.sin(s.t * 1.1 + i) * 0.03;
                P.my *= 1 - 0.2 * Math.max(0, Math.sin(s.ph + o + 1.5)) * s.mv;
            }
            for (let i = 0; i < ants.length; i++) {
                const A = ants[i];
                A.drx += Math.sin(s.t * 3 + A.r.x * 40) * 0.12;
                A.drz += Math.sin(s.t * 2.3 + A.r.x * 30) * 0.12;
            }
            r.head!.dry += Math.sin(s.ph) * 0.1 * s.mv;
        };
    }
};
export const crystalisk: CritterSpec = {
    cfg: { f: 2.8, hop: 0, sq: 0, yaw: 0.07, roll: 0.02, leg: 0.8, tail: 0.2, tailF: 1.4, ear: 0, look: 0.25, breathe: 0.03 },
    build(r) {
        const S = 0x7a7f9e, BELLY = 0xaab0c8, ICE = 0x3ac0ff, ICE2 = 0xb8ecfa;
        r.body.s.y = -0.045;
        r.body.s.sy = 0.9;
        r.body.s.sx = 1.08;
        r.torso = r.part('body', null, (mb: MB) => {
            mb.main.sph(1, 7, 4, (x: number, y: number, z: number) => y < -0.04 ? BELLY : sh(S, -0.1, 0.1, 0.35)(x, y, z), { sx: 0.14, sy: 0.1, sz: 0.22, j: 0.01 });
        }, 0, 0.125, 0);
        const leg = (name: string, x: number, z: number) => {
            const sx = x < 0 ? -1 : 1;
            const L = r.part(name, null, (mb: MB) => {
                limb(mb.main, 0.1, 0.036, 0.044, (xx: number, y: number, zz: number) => sh(S, -0.1, 0, 0.3)(xx, y, zz), 0.045);
            }, x, 0.095, z, { sy: 0.35 });
            L.rot(0, 0, sx * 0.75, [0, 0, sx * 1.2]);
            r.legs.push(L);
        };
        leg('legFL', 0.11, 0.13);
        leg('legFR', -0.11, 0.13);
        leg('legBL', 0.11, -0.12);
        leg('legBR', -0.11, -0.12);
        r.head = r.part('head', null, (mb: MB) => {
            mb.main.sph(1, 7, 4, sh(S, -0.1, 0.1, 0.3), { sx: 0.125, sy: 0.1, sz: 0.125, j: 0.008 });
            mb.main.hull([[-0.05, -0.02, 0.07], [0.05, -0.02, 0.07], [-0.045, -0.055, 0.07], [0.045, -0.055, 0.07], [-0.033, -0.025, 0.17], [0.033, -0.025, 0.17], [-0.03, -0.055, 0.165], [0.03, -0.055, 0.165]], (x: number, y: number, z: number) => sh(S, -0.1, 0.05, 0.25)(x, y, z), { j: 0.004 });
            mb.main.tet(0.013, INKC, { x: 0.014, y: -0.025, z: 0.174, ao: false, v: 0 });
            mb.glow(ICE, 2.2).oct(0.04, ICE2, { y: 0.12, z: -0.02, sx: 0.8, sy: 2.6, sz: 0.8, ao: false, v: 0.08 });
        }, 0, 0.14, 0.26, { y: 0.1, z: 0.22 });
        r.head.rot(-0.35, 0, 0, [0.4, 0, 0]);
        r.eyes = r.part('eyes', r.head, (mb: MB) => {
            eyePair(mb.main, 0.07, 0, 0.088, 0.05);
        }, 0, 0.03, 0);
        r.tail = r.part('tail', null, (mb: MB) => {
            mb.main.cone(0.09, 0.24, 5, (x: number, y: number, z: number) => sh(S, -0.1, 0.2, 0.3)(x, y, z), { z: -0.12, rx: -Math.PI / 2, j: 0.006 });
        }, 0, 0.115, -0.2);
        r.tail.rot(0.05, 0, 0, [0.02, 1.3, 0]);
        const t = r.part('tail2', r.tail, (mb: MB) => {
            mb.main.cone(0.055, 0.22, 5, (x: number, y: number, z: number) => sh(S, -0.1, 0.2, 0.3)(x, y, z), { z: -0.11, rx: -Math.PI / 2, j: 0.005 });
            mb.glow(ICE, 2.2).oct(0.036, ICE2, { z: -0.22, sx: 0.8, sy: 0.8, sz: 2.2, ao: false, v: 0.08 });
        }, 0, 0, -0.24);
        t.rot(0, 0, 0, [0, 0.8, 0]);
        const cr = r.part('crystals', null, (mb: MB) => {
            const g = mb.glow(ICE, 2.2);
            [[0, 0.12, 0.14, 1], [0, 0, 0.17, 1.3], [0.02, -0.12, 0.15, 1.1], [-0.05, 0.06, 0.14, 0.8], [0.055, -0.03, 0.13, 0.8]].forEach(([x, z, yy, k], i) => {
                g.oct(0.045 * k, (_x: number, y: number) => mix(0x62c8ee, 0xb8ecfa, clamp((y - yy) * 6 + 0.5)), { x, y: yy, z, sx: 0.75, sy: 2.5, sz: 0.75, rz: (i % 2 ? 1 : -1) * 0.1, ao: false, v: 0.1 });
            });
        }, 0, 0.125, 0);
        r.topY = 0.55;
        r.extra = (_rg, s) => {
            const sw = s.mv;
            r.tail!.dry += Math.sin(s.ph) * 0.4 * sw;
            t.dry += Math.sin(s.ph - 1) * 0.5 * sw + Math.sin(s.t * 1.8) * 0.12;
            r.head!.dry += Math.sin(s.ph + Math.PI) * 0.15 * sw;
            cr.my *= 1 + Math.sin(s.t * 2.4) * 0.04;
            cr.mx *= 1 + Math.sin(s.t * 2.4) * 0.03;
        };
    }
};
