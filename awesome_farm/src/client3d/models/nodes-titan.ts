// The Titans: the Great Oak (a towering pine on snowy islands) and the Titan Boulder. Huge, rare nodes that only fall to two or
// more farmers together, so each carries what the 2D view draws round it: a gold ring on the ground that pulses (faster once
// somebody is working on it), the "2+" badge over the top and a health bar once it has been struck.
import * as THREE from 'three';
import { RAMP } from './data';
import { bake, Bld, byHeight, clamp, hash3, mix, pick, seedRand, TAU } from './kit';
import { friendsBadge, groundRing, healthBar } from './marks';
import type { NodeOpts, NodeRig } from './nodes';

const W = RAMP.wood, L = RAMP.leaf, LD = RAMP.leafDeep, P = RAMP.pine, ST = RAMP.stone, ICE = RAMP.ice;
const SNOW = [0xb8d4e4, 0xdcecf4, 0xf4fbff];

const bark = (x: number, y: number, z: number) => pick(W, clamp(0.45 + (-x - z) * 0.5 + (hash3(x * 30, y * 9, z * 30) - 0.5) * 0.35 + y * 0.05));

/** The Great Oak: flared roots, a thick trunk splitting into a mountain of leafy clumps, moss, red apples and golden acorns. */
function oak (b: Bld, mb: { glow (c: number, e?: number): Bld }) {
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + 0.3;
        b.rod([Math.cos(a) * 0.2, 0.34, Math.sin(a) * 0.2], [Math.cos(a) * 0.82, 0.02, Math.sin(a) * 0.78], 0.13, 5, bark, 0.05, { j: 0.02 });
    }
    b.cyl(0.3, 0.46, 1.5, 8, bark, { y: 0.75, j: 0.03, v: 0.08 });
    b.ico(0.12, 0, 0x2a1d2c, { x: -0.05, y: 0.7, z: 0.36, sy: 1.4, sz: 0.5, ao: false });
    b.ico(0.16, 0, W[0], { x: -0.05, y: 0.7, z: 0.33, sy: 1.4, sz: 0.4, ao: false });
    for (const [x, z, y1] of [[0.55, 0.1, 1.95], [-0.6, -0.05, 1.9], [0.1, -0.5, 2.1], [0, 0.45, 1.85]]) b.rod([x * 0.3, 1.35, z * 0.3], [x, y1, z], 0.13, 5, bark, 0.07, { j: 0.02 });
    const leaf = byHeight(L, 1.3, 3.5, 0.55, 3);
    const clumps: [number, number, number, number][] = [[0, 2.35, 0, 0.95], [0.82, 2.0, 0.1, 0.62], [-0.82, 2.0, -0.05, 0.62], [0.05, 2.0, 0.62, 0.62], [0.1, 1.95, -0.62, 0.58],
        [0.5, 2.85, -0.15, 0.55], [-0.45, 2.8, 0.15, 0.55], [0, 3.2, 0, 0.48], [0.6, 2.3, 0.6, 0.45], [-0.6, 2.3, 0.55, 0.45]];
    for (const [x, y, z, r] of clumps) b.ico(r, 1, leaf, { x, y, z, sy: 0.88, j: 0.13 });
    const R = seedRand(41);
    for (let i = 0; i < 7; i++) {
        const [x, y, z, r] = clumps[i % clumps.length], a = R() * TAU;
        b.ico(r * 0.42, 0, byHeight(LD, y - r, y + r, 0.4, i), { x: x + Math.cos(a) * r * 0.55, y: y + r * 0.62, z: z + Math.sin(a) * r * 0.55, sy: 0.45, j: 0.05 });
    }
    for (let i = 0; i < 12; i++) {
        const [x, y, z, r] = clumps[i % clumps.length], a = R() * TAU, h = (R() - 0.3) * 0.8, k = Math.sqrt(Math.max(0.2, 1 - h * h)) * r * 0.97;
        const at = { x: x + Math.cos(a) * k, y: y + h * r * 0.88, z: z + Math.abs(Math.sin(a)) * k, ao: false };
        if (i % 3 === 2) mb.glow(0xffd966, 1.3).oct(0.07, RAMP.gold[2], { ...at, sy: 1.3 });
        else b.oct(0.085, RAMP.red[1 + i % 3], { ...at, j: 0.005 });
    }
}

/** The titan pine of the snowy islands: five tiers, widest at the bottom, snow on every tier, golden cones. */
function pine (b: Bld, mb: { glow (c: number, e?: number): Bld }) {
    b.cyl(0.24, 0.36, 0.9, 7, bark, { y: 0.45, j: 0.02 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        b.rod([Math.cos(a) * 0.15, 0.28, Math.sin(a) * 0.15], [Math.cos(a) * 0.6, 0.02, Math.sin(a) * 0.58], 0.1, 4, bark, 0.04, { j: 0.015 });
    }
    const tiers: [number, number, number][] = [[0.55, 1.2, 1.15], [1.25, 1.0, 1.05], [1.9, 0.8, 0.95], [2.5, 0.6, 0.85], [3.05, 0.4, 0.8]];
    tiers.forEach(([y, r, h], i) => {
        b.cone(r, h, 8, byHeight(P, y, y + h, 0.5, i), { y: y + h / 2, ry: i * 0.6, j: 0.07 });
        b.cone(r * 0.7, h * 0.55, 8, (x, yy, z) => (hash3(x * 9, yy * 9, z * 9) < 0.3 ? SNOW[1] : SNOW[2]), { y: y + h * 0.66, ry: i * 0.6 + 0.3, j: 0.05, ao: false });
    });
    for (const [x, y, z] of [[0.55, 1.0, 0.45], [-0.5, 1.6, 0.3], [0.3, 2.2, 0.45], [-0.2, 2.75, 0.3]]) mb.glow(0xffd966, 1.3).oct(0.07, RAMP.gold[2], { x, y, z, sy: 1.5, ao: false });
}

/** The Titan Boulder: a tall craggy block with a lower boulder leaning on it, deep cracks, moss on top and veins of blue crystal. */
function boulder (b: Bld, mb: { glow (c: number, e?: number): Bld }) {
    const R = seedRand(97), pts: number[][] = [];
    for (let i = 0; i < 22; i++) {
        const a = R() * TAU, u = R(), y = u * 1.55, w = 0.95 - u * 0.45;
        pts.push([0.15 + Math.cos(a) * w * (0.85 + R() * 0.2), y, Math.sin(a) * w * 0.75 * (0.85 + R() * 0.2)]);
    }
    pts.push([0.2, 1.7, -0.05], [0.45, 1.6, 0.1], [-0.1, 1.55, 0.1]);
    const LIT = ST.slice(1), stone = byHeight(LIT, -0.5, 1.6, 0.45, 4);
    b.hull(pts, stone, { j: 0.06, v: 0.1 });
    b.dode(0.55, byHeight(LIT, -0.4, 0.9, 0.45, 5), { x: -0.72, y: 0.36, z: 0.42, sy: 0.75, sx: 1.1, ry: 0.7, j: 0.1 });
    b.dode(0.3, byHeight(LIT, -0.3, 0.6, 0.45, 6), { x: 0.85, y: 0.18, z: 0.55, sy: 0.7, ry: 1.3, j: 0.06 });
    // cracks down the front, a dark foot
    for (const [x, y, rz, h] of [[0.0, 1.15, 0.25, 0.45], [0.1, 0.75, -0.35, 0.4], [0.55, 0.9, 0.15, 0.5], [-0.25, 0.5, 0.4, 0.3]]) b.box(0.035, h, 0.04, ST[1], { x, y, z: 0.62 - Math.abs(y - 0.8) * 0.15, rz, ao: false, v: 0 });
    b.cyl(1.05, 1.15, 0.06, 10, mix(ST[0], 0x2a1d2c, 0.35), { x: 0.05, y: 0.03, z: 0.1, sz: 0.85, ao: false, v: 0.02 });
    // moss on top and in the gap between the two stones
    for (const [x, y, z, r] of [[0.1, 1.62, 0, 0.32], [0.55, 1.45, -0.1, 0.22], [-0.7, 0.68, 0.4, 0.22], [-0.3, 0.95, 0.45, 0.16]]) b.ico(r, 0, byHeight(L, y - 0.1, y + 0.2, 0.5, 2), { x, y, z, sy: 0.35, j: 0.04 });
    // veins of blue crystal set into the stone
    for (const [x, y, z, r, a] of [[-0.05, 0.95, 0.6, 0.12, 0.3], [0.45, 1.1, 0.5, 0.1, -0.4], [0.35, 0.55, 0.66, 0.13, 0.2], [-0.55, 0.45, 0.85, 0.08, -0.2], [0.15, 1.4, 0.4, 0.08, 0.5]]) {
        mb.glow(0x8ac4e0, 1.4).oct(r, (_x, yy) => mix(ICE[1], ICE[3], clamp((yy - y) / r + 0.5)), { x, y, z, sy: 1.6, rz: a, rx: 0.4, ao: false, v: 0.08 });
    }
}

/** A Titan node: its body (shaken by the node model), the ring, the badge and the health bar (on the root, so they never shake). */
export function titan (kind: 'titan_oak' | 'titan_rock', o: NodeOpts): NodeRig {
    const obj = new THREE.Group(), body = new THREE.Group();
    obj.add(body);
    const snowy = kind === 'titan_oak' && o.biome === 'snowcap';
    const look = kind === 'titan_rock' ? 'rock' : snowy ? 'pine' : 'oak';
    body.add(bake(`titan|${look}`, (mb) => (look === 'rock' ? boulder : look === 'pine' ? pine : oak)(mb.main, mb), 17));
    const top = look === 'rock' ? 1.85 : 3.6;
    const ring = groundRing(look === 'rock' ? 1.35 : 1.25);
    const badge = friendsBadge(), bar = healthBar(1.2, 0.13);
    badge.position.y = top + 0.45;
    bar.group.position.y = top + 0.1;
    obj.add(ring.group, badge, bar.group);
    const phase = (o.seed * 0.37) % TAU;
    let hurt = false;
    return {
        obj, body, swayAmp: look === 'rock' ? 0 : 0.006,
        extra (_dt: number, t: number) {
            ring.update(t, phase, hurt);
            badge.position.y = top + 0.45 + Math.abs(Math.sin(t * 2 + phase)) * 0.06;
            badge.scale.setScalar(1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 3 + phase)));
        },
        onHp (f: number) {
            hurt = f < 1;
            bar.set(f);
        },
    };
}
