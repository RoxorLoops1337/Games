// Crops on a bed: sprouts, then each crop's own leafy and ripe plants.
import * as THREE from 'three';
import { bake, Bld, byHeight, clamp, Col, hash as hash2, M, MB, mix, pick } from './kit';
import { RAMP } from './data';

export const CROP_MAT = M(0xffffff, { vc: true, r: 0.85 });
export const cropB = (mb: MB) => mb.custom('crop', CROP_MAT, true);
export const SOIL_TOP = 0.085;
export const L = RAMP.leaf;
export const LD = RAMP.leafDeep;
export const S = RAMP.straw;
export const O = RAMP.pumpkin;
export const blade = (b: Bld, x: number, z: number, h: number, lx: number, lz: number, w: number, c: Col) => b.blade(x, z, h, lx, lz, w, c, { j: 0.004, v: 0.08 });
export const leaf = (b: Bld, x: number, y: number, z: number, a: number, len: number, wid: number, up: number, c: Col) => b.leaf(len, wid, wid * 0.22, c, { x, y, z, ry: Math.PI / 2 - a, rx: -up, j: 0.004, v: 0.08, ao: false });
export const stalk = (b: Bld, x: number, z: number, h: number, lx: number, lz: number, r: number, c: Col, seg = 3) => {
    const len = Math.hypot(h, lx, lz), ax = Math.atan2(lz, h), az = -Math.atan2(lx, h);
    return b.tube(r * 0.7, r, len, seg, c, { x: x + lx / 2, y: h / 2, z: z + lz / 2, rx: ax, rz: az, j: 0.002, ao: false });
};
export const leafCol = (h: number, ramp = L, n = 0.35, lift = 0.48) => (x: number, y: number, z: number) => pick(ramp, clamp(lift + y / h * 0.45 + (-x - z) * 0.2 + (hash2(x * 31, z * 31 + y * 17) - 0.5) * n));
export const hash = (i: number, k = 0) => hash2(i * 12.9 + k, 7.7 + k * 3.1);
export const G = 0.27;
/** A crop stage: where the plants stand on the bed (x, z) and how to model one plant there. */
export interface CropStage { pos: number[][]; plant(mb: MB, x: number, z: number, i: number): void }
export const GRID9: number[][] = [];
for (const z of [-G, 0, G]) for (const x of [-G, 0, G]) GRID9.push([x + (hash(GRID9.length) - 0.5) * 0.05, z + (hash(GRID9.length, 3) - 0.5) * 0.05]);
export const GRID6 = [[-G, -G], [0, -G + 0.04], [G, -G], [-G, G], [0, G - 0.04], [G, G]];
export const GRID5 = [[-0.25, -0.24], [0.25, -0.24], [0, 0], [-0.25, 0.24], [0.25, 0.24]];
export const GRID4 = [[-0.22, -0.2], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.2]];
export const WHEAT15: number[][] = [];
for (const [cx, cz] of [[-0.27, -0.27], [0.27, -0.27], [0, 0], [-0.27, 0.27], [0.27, 0.27]]) for (const [dx, dz] of [[-0.06, 0.02], [0.06, -0.04], [0, 0.07]]) WHEAT15.push([cx + dx, cz + dz]);
export const WHEAT12 = [[-0.34, -0.3], [-0.12, -0.34], [0.14, -0.3], [0.36, -0.34], [-0.3, -0.04], [-0.06, 0.02], [0.18, -0.06], [0.38, 0], [-0.34, 0.3], [-0.1, 0.34], [0.14, 0.3], [0.36, 0.34]];
export function sprout(tint: readonly number[]): CropStage {
    return {
        pos: GRID9,
        plant(mb: MB, x: number, z: number, i: number) {
            const b = cropB(mb), a = hash(i) * 6.28;
            b.tet(0.05, byHeight(tint, -0.03, 0.1, 0.3, i), { x: x + Math.cos(a) * 0.03, y: 0.045, z: z + Math.sin(a) * 0.03, sy: 1.7, sx: 0.8, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9, j: 0.004, ao: false, v: 0.1 });
            b.tet(0.042, byHeight(tint, -0.03, 0.1, 0.3, i + 1), { x: x - Math.cos(a) * 0.03, y: 0.04, z: z - Math.sin(a) * 0.03, sy: 1.5, sx: 0.8, rz: -Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, ry: 1.2, j: 0.004, ao: false, v: 0.1 });
        }
    };
}
export const W = RAMP.wood[1];
export const GOLD_EAR = [0xc58f3e, 0xdcaa38, 0xf0cc58, 0xfff0a0];
export const SPECS: Record<string, CropStage[] | undefined> = {
    // ── wheat: green tufts, then golden stalks each with a heavy ear ──
    seed_wheat: [
        {
            pos: WHEAT12,
            plant(mb: MB, x: number, z: number, i: number) {
                const a = hash(i) * 6.28;
                blade(cropB(mb), x, z, 0.27 + hash(i, 1) * 0.07, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.03, leafCol(0.3, L, 0.3, 0.8));
                blade(cropB(mb), x + 0.02, z + 0.02, 0.2 + hash(i, 2) * 0.06, Math.cos(a + 2.4) * 0.1, Math.sin(a + 2.4) * 0.1, 0.028, leafCol(0.26, L, 0.3, 0.78));
            }
        },
        {
            pos: WHEAT15,
            plant(mb: MB, x: number, z: number, i: number) {
                const h = 0.46 + i % 3 * 0.06 + hash(i, 1) * 0.04, lx = (hash(i, 2) - 0.5) * 0.1, lz = (hash(i, 3) - 0.5) * 0.06, b = cropB(mb);
                stalk(b, x, z, h, lx, lz, 0.022, (_px: number, py: number) => pick([0xc8b840, 0xe8d060, 0xf0d870], clamp(py / 0.6)), 3);
                b.oct(0.046, (px: number, py: number, pz: number) => pick(GOLD_EAR, clamp(0.6 + (py - h) * 3 + (-px - pz) * 0.5 + (hash2(px * 40, pz * 40) - 0.5) * 0.3)), { x: x + lx + 0.015, y: h + 0.045, z: z + lz, sy: 3.2, sx: 1.2, rz: -0.22, ry: i, j: 0.004, ao: false, v: 0.06 });
            }
        }
    ],
    // ── carrot: feathery tops, with orange shoulders peeking out of the soil ──
    seed_carrot: [
        {
            pos: GRID9,
            plant(mb: MB, x: number, z: number, i: number) {
                const a = hash(i) * 6.28;
                cropB(mb).hull([[x - 0.04, 0, z], [x + 0.04, 0, z + 0.03], [x, 0, z - 0.04], [x + Math.cos(a) * 0.1, 0.2, z + Math.sin(a) * 0.1], [x + Math.cos(a + 2.1) * 0.1, 0.17, z + Math.sin(a + 2.1) * 0.1], [x + Math.cos(a + 4.2) * 0.09, 0.14, z + Math.sin(a + 4.2) * 0.09]], leafCol(0.2, L, 0.4, 0.6), { j: 0.004, v: 0.08 });
            }
        },
        {
            pos: GRID9,
            plant(mb: MB, x: number, z: number, i: number) {
                const a = hash(i) * 6.28;
                cropB(mb).oct(0.1, byHeight([0xd8601a, 0xf08a2a, 0xf8a24a, 0xffc878], -0.04, 0.06, 0.3, i), { x, y: 0.015, z, sy: 0.62, ry: i, j: 0.006, v: 0.08 });
                cropB(mb).hull([[x - 0.03, 0.03, z], [x + 0.03, 0.03, z + 0.025], [x, 0.03, z - 0.035], [x + Math.cos(a) * 0.09, 0.24, z + Math.sin(a) * 0.09], [x + Math.cos(a + 2.1) * 0.08, 0.2, z + Math.sin(a + 2.1) * 0.08], [x + Math.cos(a + 4.2) * 0.07, 0.18, z + Math.sin(a + 4.2) * 0.07]], leafCol(0.26, L, 0.4, 0.6), { j: 0.004, v: 0.08 });
            }
        }
    ],
    // ── beet: broad leaves on red stems, a deep purple-red shoulder ──
    seed_beet: [
        {
            pos: GRID6,
            plant(mb: MB, x: number, z: number, i: number) {
                for (let k = 0; k < 2; k++) leaf(cropB(mb), x, 0, z, hash(i, k) * 6.28, 0.2, 0.075, 0.7, (_px: number, py: number) => mix(0xc9505a, 0x7acb5c, clamp(py / 0.06 + 0.2)));
            }
        },
        {
            pos: GRID6,
            plant(mb: MB, x: number, z: number, i: number) {
                cropB(mb).oct(0.085, byHeight([0x7a2a5c, 0xa8386e, 0xd05a8c, 0xf088aa], -0.04, 0.07, 0.3, i), { x, y: 0.01, z, sy: 0.65, ry: i, j: 0.008, v: 0.08 });
                for (let k = 0; k < 2; k++) {
                    const a = hash(i, k) * 6.28 + k * 2.6;
                    leaf(cropB(mb), x + Math.cos(a) * 0.03, 0.08, z + Math.sin(a) * 0.03, a, 0.3, 0.11, 0.55, (px: number, py: number, pz: number) => mix(0xd05a64, pick(L, clamp(0.55 + (-px - pz) * 0.3 + (py - 0.1) * 3)), clamp((py - 0.07) * 14)));
                }
            }
        }
    ],
    // ── flax: slender stems, blue flowers ──
    seed_flax: [
        {
            pos: GRID9,
            plant(mb: MB, x: number, z: number, i: number) {
                const a = hash(i) * 6.28;
                blade(cropB(mb), x, z, 0.24, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.03, leafCol(0.25, [L[1], L[2], L[3]], 0.3, 0.7));
                blade(cropB(mb), x, z, 0.18, -Math.cos(a) * 0.07, -Math.sin(a) * 0.07, 0.026, leafCol(0.2, [L[1], L[2], L[3]], 0.3, 0.7));
            }
        },
        {
            pos: GRID9,
            plant(mb: MB, x: number, z: number, i: number) {
                const h = 0.46 + hash(i, 1) * 0.1, lx = (hash(i, 2) - 0.5) * 0.1, lz = (hash(i, 3) - 0.5) * 0.08;
                stalk(cropB(mb), x, z, h, lx, lz, 0.011, leafCol(0.5, [L[1], L[2], L[3]], 0.3, 0.55), 3);
                cropB(mb).oct(0.062, (px: number, py: number, pz: number) => py > h + 0.015 ? 0x9ac4f4 : hash2(px * 40, pz * 40) < 0.5 ? 0x6a9af0 : 0x4a78d8, { x: x + lx, y: h + 0.01, z: z + lz, sy: 0.55, sx: 1.15, ry: i, j: 0.005, ao: false, v: 0.06 });
                cropB(mb).tet(0.04, L[3], { x: x + lx * 0.5, y: h * 0.45, z: z + lz * 0.5, sy: 1.6, rz: 1.2 * (i % 2 ? 1 : -1), ao: false });
            }
        }
    ],
    // ── corn: a few tall stalks with arching leaves and a cob in its husk ──
    seed_corn: [
        {
            pos: GRID5,
            plant(mb: MB, x: number, z: number, i: number) {
                stalk(cropB(mb), x, z, 0.3, 0, 0, 0.026, leafCol(0.3, L, 0.3, 0.6), 4);
                for (let k = 0; k < 2; k++) leaf(cropB(mb), x, 0.12 + k * 0.06, z, hash(i, k) * 6.28, 0.36, 0.075, 0.5, leafCol(0.3, L, 0.3, 0.6));
            }
        },
        {
            pos: GRID5,
            plant(mb: MB, x: number, z: number, i: number) {
                const h = 0.82 + hash(i, 1) * 0.12, b = cropB(mb);
                stalk(b, x, z, h, 0, 0, 0.034, (_px: number, py: number) => pick(L, clamp(py / h * 0.5 + 0.35)), 4);
                leaf(b, x, 0.26, z, hash(i, 2) * 6.28, 0.44, 0.08, 0.2, leafCol(0.5, L, 0.3, 0.55));
                leaf(b, x, 0.5, z, hash(i, 2) * 6.28 + 3.3, 0.42, 0.075, 0.25, leafCol(0.5, L, 0.3, 0.55));
                const a = hash(i, 4) * 6.28;
                b.hull([[x + Math.cos(a) * 0.04, 0.4, z + Math.sin(a) * 0.04], [x + Math.cos(a + 1.3) * 0.08, 0.42, z + Math.sin(a + 1.3) * 0.08], [x + Math.cos(a - 1.3) * 0.08, 0.42, z + Math.sin(a - 1.3) * 0.08], [x + Math.cos(a) * 0.12, 0.64, z + Math.sin(a) * 0.12], [x + Math.cos(a) * 0.1, 0.45, z + Math.sin(a) * 0.1]], (_px: number, py: number) => py > 0.56 ? 0xf0cc58 : pick(L, clamp(0.5 + (py - 0.4))), { j: 0.004, v: 0.06 });
                b.cone(0.035, 0.14, 3, GOLD_EAR[2], { x, y: h + 0.05, z, j: 0.004, ao: false });
            }
        }
    ],
    // ── pepper: dark bushes hung with red peppers ──
    seed_pepper: [
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                cropB(mb).ico(0.11, 0, leafCol(0.2, LD, 0.4, 0.6), { x, y: 0.1, z, sy: 0.9, j: 0.02, v: 0.1 });
                cropB(mb).oct(0.035, 0xfff6e0, { x: x + 0.03, y: 0.2, z: z + 0.08, ao: false, v: 0 });
                void i;
            }
        },
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                cropB(mb).ico(0.15, 0, leafCol(0.4, LD, 0.45, 0.62), { x, y: 0.2, z, sy: 0.95, j: 0.04, v: 0.1 });
                for (let k = 0; k < 4; k++) {
                    const a = hash(i, k) * 6.28 + k * 1.6, r = 0.12 + hash(i, k + 3) * 0.04;
                    cropB(mb).cone(0.055, 0.17, 4, (_px: number, py: number) => pick([0xa82a3c, 0xd0384a, 0xe8505a, 0xf27078], clamp(0.35 + (py - 0.15) * 3)), { x: x + Math.cos(a) * r, y: 0.15 + hash(i, k + 6) * 0.1, z: z + Math.sin(a) * r, rx: Math.PI - Math.sin(a) * 0.4, rz: Math.cos(a) * 0.4, j: 0.004, ao: false, v: 0.08 });
                }
            }
        }
    ],
    // ── cotton: green stalks crowned with white bolls ──
    seed_cotton: [
        {
            pos: GRID5,
            plant(mb: MB, x: number, z: number, i: number) {
                for (let k = 0; k < 2; k++) leaf(cropB(mb), x, 0.02, z, hash(i, k) * 6.28, 0.22, 0.065, 0.6, leafCol(0.2, LD, 0.3, 0.6));
            }
        },
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                const b = cropB(mb);
                stalk(b, x, z, 0.3, 0, 0, 0.022, leafCol(0.3, LD, 0.3, 0.55), 3);
                b.tet(0.09, leafCol(0.3, LD, 0.3, 0.62), { x: x + 0.09, y: 0.1, z, sy: 0.7, rz: -0.9, ry: hash(i) * 6, ao: false });
                const C = RAMP.cream;
                for (let k = 0; k < 2; k++) {
                    const a = hash(i, k) * 6.28 + k * 3.1, r = 0.075;
                    b.ico(0.088, 0, (px: number, py: number, pz: number) => pick(C, clamp(0.7 + (py - 0.3) * 1.5 + (-px - pz) * 0.3 + (hash2(px * 30, pz * 30) - 0.5) * 0.25)), { x: x + Math.cos(a) * r, y: 0.34 + k * 0.05, z: z + Math.sin(a) * r, sy: 0.9, j: 0.014, ao: false, v: 0.05 });
                }
            }
        }
    ],
    // ── pumpkin: fat orange pumpkins on curling vines ──
    seed_pumpkin: [
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                for (let k = 0; k < 2; k++) leaf(cropB(mb), x, 0.02, z, hash(i, k) * 6.28, 0.28, 0.12, 0.35, leafCol(0.2, LD, 0.3, 0.62));
                cropB(mb).oct(0.035, 0xffd966, { x: x + 0.02, y: 0.1, z: z + 0.05, ao: false, v: 0 });
            }
        },
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                cropB(mb).ico(0.2, 0, (px: number, py: number, pz: number) => pick(O, clamp((py - 0.02) * 3 + 0.12 + Math.sin(Math.atan2(pz - z, px - x) * 5) * 0.25 + (-px - pz) * 0.1)), { x, y: 0.14, z, sy: 0.74, sx: 1.05, ry: i, j: 0.012, v: 0.06 });
                cropB(mb).box(0.06, 0.09, 0.06, W, { x, y: 0.28, z, rz: 0.2, j: 0.005, ao: false });
                leaf(cropB(mb), x + 0.1, 0.05, z - 0.1, hash(i, 1) * 6.28, 0.24, 0.11, 0.4, leafCol(0.2, LD, 0.3, 0.62));
            }
        }
    ],
    // ── melon: striped green melons among their vines ──
    seed_melon: [
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                for (let k = 0; k < 3; k++) leaf(cropB(mb), x, 0.02, z, hash(i, k) * 6.28, 0.25, 0.095, 0.3, leafCol(0.2, LD, 0.3, 0.62));
                cropB(mb).oct(0.035, 0xffd966, { x: x - 0.05, y: 0.09, z: z + 0.04, ao: false, v: 0 });
            }
        },
        {
            pos: GRID4,
            plant(mb: MB, x: number, z: number, i: number) {
                const M = [0x3a8a48, 0x62bc62, 0x86d874, 0xc2f0a4];
                cropB(mb).ico(0.18, 0, (px: number, py: number, pz: number) => Math.sin(Math.atan2(pz - z, px - x) * 7 + i) > 0.05 ? 0x1f6a3a : pick(M, clamp(0.4 + (py - 0.02) * 2.5 + (-px - pz) * 0.3 + (hash2(px * 30, pz * 30) - 0.5) * 0.2)), { x, y: 0.13, z, sy: 0.82, sx: 1.2, ry: i * 0.7, j: 0.012, v: 0.05 });
                cropB(mb).box(0.05, 0.06, 0.05, W, { x: x - 0.09, y: 0.25, z, j: 0.004, ao: false });
                leaf(cropB(mb), x + 0.12, 0.04, z + 0.12, hash(i, 1) * 6.28, 0.22, 0.095, 0.3, leafCol(0.2, LD, 0.3, 0.62));
                leaf(cropB(mb), x - 0.1, 0.04, z - 0.13, hash(i, 2) * 6.28, 0.22, 0.095, 0.3, leafCol(0.2, LD, 0.3, 0.62));
            }
        }
    ]
};
export const TINT: Record<string, readonly number[] | undefined> = {
    seed_wheat: [0x6aa84a, 0x92d364, 0xc4e880, 0xe0f0a0],
    seed_carrot: L,
    seed_beet: [0x4a8a4c, 0x6ab85a, 0xc85a8a, 0xe888aa],
    seed_corn: [0x3f8a4c, 0x5cb04f, 0x86cc5c, 0xb9e47c],
    seed_pepper: LD,
    seed_flax: [0x3f8a4c, 0x5cb04f, 0x92d364, 0xb9e47c],
    seed_cotton: LD,
    seed_pumpkin: LD,
    seed_melon: [0x2f6b3a, 0x3f8a4c, 0x6ab85a, 0xa6dc7a]
};
export const cache = new Map<string, number>();
export function cropGroup(plant: string, stage: number) {
    const spec = stage === 0 ? sprout(TINT[plant] ?? L) : (SPECS[plant] ?? SPECS.seed_wheat!)[stage - 1];
    const g = new THREE.Group();
    g.name = `crop|${plant}|${stage}`;
    const rows: THREE.Group[] = [];
    const nRows = stage === 0 ? 1 : 3;
    for (let r = 0; r < nRows; r++) {
        const row = bake(`crop|${plant}|${stage}|${r}`, (mb) => {
            spec.pos.forEach(([x, z], i: number) => {
                const rr = nRows === 1 ? 0 : z < -0.14 ? 0 : z > 0.14 ? 2 : 1;
                if (rr === r) spec.plant(mb, x, z, i);
            });
        }, 5);
        row.position.y = SOIL_TOP;
        g.add(row);
        rows.push(row);
    }
    g.userData.rows = rows;
    g.userData.stage = stage;
    cache.set(g.name, rows.length);
    return g;
}
