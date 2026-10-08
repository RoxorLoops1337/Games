// Tools and weapons in the farmer's hand, and the one stowed on the back.
import * as THREE from 'three';
import { Bld, clamp, Col, hash, MB } from './kit';
import { itemDef } from './data';
import { CYAN, fbake, GOLD, rampAt, SLIME, STONE, VIOLET, WOODR } from './farmer-base';

export const PI = Math.PI;
export const IRONR = [0x6a6f88, 0x9ea4b9, 0xc4c9dc, 0xeef1f8];
export const STEELR = [0x6a82a6, 0x9db6d6, 0xc8dcf2, 0xf4faff];
export const FLINTR = [0x4a4d68, 0x666b86, 0x8a90a8, 0xb4b9cc];
export const ICER = [0x3c88b8, 0x5cc0e0, 0x9eeaf2, 0xe4fcff];
export const BONER = [0xbfb8a8, 0xe0dac8, 0xf4f0e2, 0xffffff];
export const SANDR = [0x9c6a2c, 0xc58f3e, 0xe3b155, 0xf6d27a];
export const DARKWOOD = [0x2a1d22, 0x3f2c30, 0x5a4244, 0x76605a];
export const woodCol = (y0 = -0.15, y1 = 0.6, k = 0) => (x: number, y: number, z: number) => rampAt(WOODR, clamp(0.3 + (y - y0) / (y1 - y0) * 0.35 + (hash(x * 70 + k, z * 70 + y * 11) - 0.5) * 0.25));
export const metalCol = (R: readonly number[], y0: number, y1: number, k = 0) => (x: number, y: number, z: number) => rampAt(R, clamp(0.45 + (y - y0) / (y1 - y0) * 0.3 + (hash(x * 50 + k, z * 50 + y * 13) - 0.5) * 0.25 + (Math.abs(x) < 0.012 ? 0.15 : 0)));
export function shaft(b: Bld, y0: number, y1: number, r0 = 0.024, r1 = r0, col = woodCol(y0, y1)) {
    b.cyl(r1, r0, y1 - y0, 4, col, { y: (y0 + y1) / 2, j: 0.004, v: 0.05 });
}
export function blade(b: Bld, col: Col, y0: number, y1: number, w0: number, w1: number, th: number, tip: number, o: { skew?: number; x?: number; z?: number } = {}) {
    const sk = o.skew ?? 0;
    b.hull([[-w0, y0, 0], [w0, y0, 0], [0, y0, th], [0, y0, -th], [-w1 + sk, y1, 0], [w1 + sk, y1, 0], [sk, y1, th * 0.8], [sk, y1, -th * 0.8], [sk * 1.2, y1 + tip, 0]], col, { x: o.x ?? 0, z: o.z ?? 0, j: 0.003, v: 0.05 });
}
export const PICK_TIER = [FLINTR, IRONR, [0xb8741a, 0xe0a020, 0xffd966, 0xfff3b0], ICER];
export function pickBuild(b: Bld, mb: MB, tier: number) {
    const R = PICK_TIER[Math.min(3, tier)];
    shaft(b, -0.14, 0.5, 0.022, 0.026, woodCol(-0.14, 0.5, tier));
    const M = tier === 0 ? b : mb.shiny();
    const col = metalCol(R, 0.4, 0.55, tier);
    const arm = (s: number, c: Bld) => c.hull([[s * 0.03, 0.55, 0.032], [s * 0.03, 0.55, -0.032], [s * 0.03, 0.455, 0.032], [s * 0.03, 0.455, -0.032], [s * 0.15, 0.552, 0.022], [s * 0.15, 0.552, -0.022], [s * 0.15, 0.495, 0.02], [s * 0.15, 0.495, -0.02], [s * 0.27, 0.425, 0]], col, { j: tier === 0 ? 0.012 : 0.003, v: 0.06 });
    if (tier === 3) {
        const g = mb.glow(0x6cd8f4, 1.5);
        for (const s of [-1, 1]) g.hull([[s * 0.03, 0.55, 0.03], [s * 0.03, 0.55, -0.03], [s * 0.03, 0.46, 0.03], [s * 0.03, 0.46, -0.03], [s * 0.14, 0.55, 0.02], [s * 0.14, 0.55, -0.02], [s * 0.14, 0.5, 0.018], [s * 0.14, 0.5, -0.018], [s * 0.27, 0.425, 0]], (x: number, y: number) => rampAt(ICER, clamp(0.55 + (y - 0.45) * 2.4 - Math.abs(x) * 0.5)), { j: 0.004, v: 0.06, ao: false });
        b.box(0.075, 0.11, 0.07, 0x3c88b8, { y: 0.505, v: 0.05 });
    } else {
        arm(-1, M);
        arm(1, M);
        M.box(0.08, 0.11, 0.075, tier === 0 ? 0x5a4a3a : tier === 1 ? 0x7a7f9e : 0xe0a020, { y: 0.505, v: 0.05, j: tier === 0 ? 0.006 : 0.002 });
    }
    if (tier === 0) for (const y of [0.44, 0.465]) b.box(0.06, 0.012, 0.07, 0xc9a070, { y, ry: 0.2, v: 0.05 });
    if (tier === 2) b.ico(0.028, 0, 0xfff3b0, { y: 0.505, z: 0.04, ao: false });
}
export function clubBuild(b: Bld) {
    const prof = [[0, -0.15], [0.034, -0.15], [0.03, -0.02], [0.04, 0.16], [0.075, 0.3], [0.1, 0.4], [0.085, 0.5], [0, 0.55]];
    b.lathe(prof, 6, woodCol(-0.15, 0.55, 3), { j: 0.008, v: 0.06 });
    for (const [a, y] of [[0.3, 0.37], [2.4, 0.43], [4.2, 0.34]]) b.cone(0.016, 0.04, 4, 0x9ea4b9, { x: Math.sin(a) * 0.095, y, z: Math.cos(a) * 0.095, rx: PI / 2, ry: a, ao: false });
    b.torus(0.036, 0.011, 3, 6, 0xc9a070, { y: -0.04, rx: PI / 2, ao: false });
}
export function swordBuild(b: Bld, mb: MB, id: string) {
    const sp: Record<string, { ramp: readonly number[]; len: number; wid: number; guard: number; guardCol: number; grip: number; pommel: number }> = {
        sword_iron: { ramp: IRONR, len: 0.46, wid: 0.062, guard: 0.17, guardCol: 0x7a4a3a, grip: 0x5a3a26, pommel: 0x7a7f9e },
        sword_steel: { ramp: STEELR, len: 0.52, wid: 0.056, guard: 0.2, guardCol: 0xe0a020, grip: 0x3a4a6a, pommel: 0xffd966 }
    };
    const s = sp[id];
    const M = mb.shiny();
    shaft(b, -0.13, 0.07, 0.021, 0.021, () => s.grip);
    b.oct(0.038, s.pommel, { y: -0.14, ao: false });
    M.box(s.guard, 0.032, 0.05, s.guardCol, { y: 0.085, j: 0.002, v: 0.05 });
    blade(M, metalCol(s.ramp, 0.1, 0.1 + s.len, 1), 0.1, 0.1 + s.len * 0.82, s.wid, s.wid * 0.85, 0.014, s.len * 0.18);
}
export function crystalSword(b: Bld, mb: MB) {
    shaft(b, -0.13, 0.07, 0.021, 0.021, () => 0x3f3a8a);
    b.ico(0.036, 0, 0x6a58b8, { y: -0.145, ao: false });
    const g = mb.glow(0x8fe8ff, 1.5);
    b.box(0.19, 0.034, 0.05, 0x3f3a8a, { y: 0.085, v: 0.05 });
    for (const sg of [-1, 1]) b.cone(0.02, 0.07, 4, 0x6154c8, { x: sg * 0.1, y: 0.085, rz: -sg * PI / 2, ao: false });
    g.hull([[-0.065, 0.1, 0], [0.065, 0.1, 0], [0, 0.1, 0.03], [0, 0.1, -0.03], [-0.08, 0.3, 0], [0.055, 0.34, 0], [0, 0.32, 0.036], [0, 0.32, -0.036], [-0.01, 0.64, 0]], (x: number, y: number) => rampAt(ICER, clamp(0.5 + (y - 0.1) * 1.2 - Math.abs(x) * 2)), { j: 0.005, v: 0.08, ao: false });
    mb.shiny().hull([[-0.062, 0.2, 0], [0, 0.18, 0.03], [0, 0.22, 0], [-0.075, 0.26, 0]], 0xcfc4ff, { ao: false });
}
export function khopesh(b: Bld, mb: MB) {
    shaft(b, -0.14, 0.06, 0.021, 0.021, () => 0x6a432f);
    b.ico(0.036, 0, 0xffd966, { y: -0.15, ao: false });
    const M = mb.shiny();
    M.box(0.12, 0.035, 0.05, 0xe0a020, { y: 0.075, v: 0.05 });
    const P = [[0, 0.08, 0.05], [0, 0.24, 0.05], [-0.06, 0.38, 0.045], [-0.17, 0.46, 0.04], [-0.27, 0.43, 0.034], [-0.3, 0.35, 0.03]];
    for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c = P[i + 1], wa = 0.07 - i * 0.008, wc = 0.07 - (i + 1) * 0.008;
        M.hull([[a[0] - wa, a[1], 0], [a[0] + wa * 0.4, a[1], 0], [a[0], a[1], 0.02], [a[0], a[1], -0.02], [c[0] - wc, c[1], 0], [c[0] + wc * 0.4, c[1], 0], [c[0], c[1], 0.018], [c[0], c[1], -0.018]], (x: number, y: number) => rampAt(GOLD, clamp(0.55 + y * 0.5 + x * 0.6 + (hash(x * 40, y * 40) - 0.5) * 0.2)), { v: 0.06 });
    }
    b.ico(0.02, 0, 0x2fa090, { y: 0.075, z: 0.04, ao: false });
}
export function riftSword(b: Bld, mb: MB) {
    shaft(b, -0.13, 0.07, 0.021, 0.021, () => 0x2c2150);
    b.ico(0.036, 0, 0x483a86, { y: -0.145, ao: false });
    const g = mb.glow(CYAN, 1.7), M = mb.shiny();
    M.box(0.2, 0.034, 0.05, 0x483a86, { y: 0.085, v: 0.05 });
    for (const sg of [-1, 1]) g.cone(0.016, 0.07, 4, CYAN, { x: sg * 0.105, y: 0.085, rz: -sg * PI / 2, ao: false });
    blade(M, (x: number, y: number) => rampAt(VIOLET, clamp(0.45 + (y - 0.1) * 0.9 + (Math.abs(x) < 0.01 ? 0.2 : 0))), 0.1, 0.5, 0.05, 0.036, 0.016, 0.12, { skew: 0.012 });
    g.hull([[-0.058, 0.12, 0], [-0.044, 0.12, 0.016], [-0.044, 0.44, 0.012], [-0.04, 0.5, 0], [-0.052, 0.3, 0]], CYAN, { ao: false, v: 0 });
    g.hull([[0.058, 0.12, 0], [0.044, 0.12, 0.016], [0.044, 0.44, 0.012], [0.04, 0.5, 0], [0.052, 0.3, 0]], CYAN, { ao: false, v: 0 });
}
export function daggerBuild(b: Bld, mb: MB, id: string) {
    const bone = id === 'dagger_bone', M = bone ? b : mb.shiny();
    shaft(b, -0.1, 0.05, 0.02, 0.02, () => bone ? 0xa06a42 : 0x3a4a6a);
    b.ico(0.028, 0, bone ? 0xe0dac8 : 0xffd966, { y: -0.11, ao: false });
    M.box(bone ? 0.09 : 0.1, 0.026, 0.04, bone ? 0xf4f0e2 : 0xe0a020, { y: 0.06, v: 0.05 });
    if (bone) {
        blade(M, (x: number, y: number) => rampAt(BONER, clamp(0.5 + y * 0.8 - Math.abs(x) * 3)), 0.07, 0.24, 0.048, 0.03, 0.018, 0.1, { skew: 0.02 });
        for (const y of [0.1, 0.15]) b.box(0.07, 0.01, 0.04, 0xbfb8a8, { y, v: 0.02, ao: false });
    } else blade(M, metalCol(STEELR, 0.07, 0.34, 7), 0.07, 0.3, 0.038, 0.03, 0.014, 0.1);
}
export function spearBuild(b: Bld, mb: MB, id: string) {
    const steel = id === 'spear_steel', M = mb.shiny();
    shaft(b, -0.3, 0.72, 0.02, 0.022, woodCol(-0.3, 0.72, 5));
    b.torus(0.024, 0.01, 3, 6, 0xc9a070, { y: 0, rx: PI / 2, ao: false });
    const R = steel ? STEELR : IRONR;
    M.hull([[0, 0.7, 0], [-0.07, 0.8, 0], [0.07, 0.8, 0], [0, 0.8, 0.022], [0, 0.8, -0.022], [0, 1.02, 0]], metalCol(R, 0.7, 1, 9), { v: 0.06 });
    M.hull([[-0.03, 0.7, 0], [0.03, 0.7, 0], [0, 0.7, 0.02], [0, 0.7, -0.02], [0, 0.77, 0]], steel ? GOLD[1] : 0x7a7f9e, { v: 0.04 });
    if (steel) {
        for (const s of [-1, 1]) M.cone(0.018, 0.08, 4, 0xffd966, { x: s * 0.05, y: 0.72, rz: -s * PI / 2.4, ao: false });
        b.cone(0.03, 0.14, 5, 0xe85d62, { y: 0.66, rx: PI, ao: false, j: 0.004 });
    }
}
export function hammerBuild(b: Bld, mb: MB, id: string) {
    const M = mb.shiny();
    shaft(b, -0.16, 0.5, 0.025, 0.029, woodCol(-0.16, 0.5, 6));
    if (id === 'hammer_iron') {
        M.box(0.27, 0.15, 0.15, 0x9ea4b9, { y: 0.55, j: 0.004, v: 0.06 });
        for (const s of [-1, 1]) M.box(0.04, 0.17, 0.17, 0x6a6f88, { x: s * 0.125, y: 0.55, v: 0.05 });
        b.box(0.07, 0.04, 0.17, 0x7a4a3a, { y: 0.49, ao: false });
    } else if (id === 'hammer_steel') {
        const col = (x: number, y: number) => rampAt(STEELR, clamp(0.5 + (y - 0.55) * 3 - Math.abs(x) * 0.8));
        M.cyl(0.085, 0.085, 0.3, 8, col, { y: 0.56, rz: PI / 2, j: 0.003, v: 0.05 });
        for (const s of [-1, 1]) M.cyl(0.09, 0.09, 0.03, 8, 0xe0a020, { x: s * 0.1, y: 0.56, rz: PI / 2, ao: false, v: 0.04 });
        b.box(0.08, 0.04, 0.12, 0x3a4a6a, { y: 0.48, ao: false });
    } else {
        const col = (x: number, y: number, z: number) => rampAt(STONE, clamp(0.45 + (y - 0.55) * 2.5 + (hash(x * 30, z * 30 + y * 7) - 0.5) * 0.5));
        b.ico(0.17, 0, col, { y: 0.6, sx: 1.25, sy: 0.9, sz: 0.95, ry: 0.4, j: 0.06, v: 0.08 });
        b.oct(0.08, col, { x: 0.14, y: 0.5, z: 0.07, j: 0.02 });
        b.oct(0.08, 0x5cb04f, { x: -0.08, y: 0.78, z: -0.02, sy: 0.5, ao: false, j: 0.02 });
        const g = mb.glow(CYAN, 1.5);
        for (const [x, y] of [[-0.08, 0.62], [0.08, 0.6]]) g.oct(0.03, CYAN, { x, y, z: 0.17, sz: 0.5, ao: false, v: 0 });
    }
}
/** A bow: arc radius, half height, wood ramp, tip accent and limb thickness. */
export interface BowLook { R: number; half: number; wood: readonly number[]; accent: number; tube: number }
export const BOWS: Record<string, BowLook> = {
    bow_wood: { R: 0.52, half: 0.3, wood: WOODR, accent: 0xc9a070, tube: 0.017 },
    bow_long: { R: 0.8, half: 0.4, wood: SANDR, accent: 0x6a432f, tube: 0.016 },
    bow_frost: { R: 0.56, half: 0.33, wood: ICER, accent: 0xf4fbff, tube: 0.02 },
    bow_rift: { R: 0.56, half: 0.33, wood: VIOLET, accent: CYAN, tube: 0.019 }
};
export function bowBuild(b: Bld, mb: MB, id: string) {
    const s = BOWS[id], arc = 2 * Math.asin(s.half / s.R);
    const col = (x: number, y: number, z: number) => rampAt(s.wood, clamp(0.5 + Math.abs(y) * 0.5 - z * 2 + (hash(x * 50, y * 50) - 0.5) * 0.3));
    const geo = new THREE.TorusGeometry(s.R, s.tube * 1.7, 3, 8, arc);
    const M = id === 'bow_frost' || id === 'bow_rift' ? mb.shiny() : b;
    M.add(geo, col, { ry: -PI / 2, rz: -arc / 2, z: -s.R, j: 0.003, v: 0.06 });
    b.box(0.045, 0.12, 0.05, id === 'bow_rift' ? 0x2c2150 : 0x6a432f, { z: 0.004, v: 0.05 });
    const sag = s.R * (1 - Math.cos(arc / 2));
    for (const sg of [-1, 1]) b.cone(0.016, 0.04, 4, s.accent, { y: sg * s.half, z: -sag, ao: false, rx: sg > 0 ? 0 : PI });
    if (id === 'bow_frost') for (const [y, l] of [[0.1, 0.07], [-0.12, 0.09], [0.2, 0.05]]) b.cone(0.016, l, 4, 0xf4fbff, { x: 0.012, y, z: 0.03, rx: PI, ao: false });
    if (id === 'bow_rift') {
        const g = mb.glow(CYAN, 1.6);
        g.oct(0.03, CYAN, { y: 0, z: 0.04, sy: 1.6, ao: false, v: 0 });
        for (const sg of [-1, 1]) g.oct(0.018, CYAN, { y: sg * (s.half - 0.02), z: 0.045, sy: 1.5, ao: false, v: 0 });
    }
    if (id === 'bow_wood' || id === 'bow_long') b.box(0.05, 0.03, 0.054, s.accent, { y: 0.06, ao: false, v: 0.04 });
    return { sag, half: s.half };
}
export function staffBuild(b: Bld, mb: MB, id: string) {
    const wood = id === 'staff_witch' ? DARKWOOD : WOODR;
    const wcol = (x: number, y: number, z: number) => rampAt(wood, clamp(0.3 + (y + 0.35) * 0.35 + (hash(x * 60, z * 60 + y * 9) - 0.5) * 0.3));
    if (id === 'staff_witch') {
        const P = [[0, -0.35, 0], [0.01, 0.2, 0.01], [-0.012, 0.65, -0.005], [0.05, 0.95, 0], [0.12, 0.92, 0]];
        for (let i = 0; i < P.length - 1; i++) b.rod(P[i], P[i + 1], 0.026 - i * 0.003, 3, wcol, 0.024 - i * 0.003, { j: 0.006, v: 0.06 });
        b.oct(0.04, 0x5a4244, { x: 0, y: 0.62, ao: false, sy: 1.3 });
        for (const s of [-1, 1]) b.cone(0.016, 0.1, 4, 0x3f2c30, { x: 0.08 + s * 0.035, y: 0.99, z: 0, rz: -s * 0.5, ao: false });
        return { orb: [0x6aff7a, 1.7, 0.99, 0.065, 0] };
    }
    shaft(b, -0.35, 0.78, 0.022, 0.026, wcol);
    if (id === 'staff_apprentice') {
        b.rod([0, 0.7, 0], [0.05, 0.8, 0], 0.02, 4, wcol, 0.017);
        for (let i = 0; i < 3; i++) {
            const a = i * 2.09;
            b.cone(0.012, 0.1, 4, 0x6a432f, { x: 0.05 + Math.sin(a) * 0.045, y: 0.84, z: Math.cos(a) * 0.045, rz: -Math.sin(a) * 0.4, rx: Math.cos(a) * 0.4, ao: false });
        }
        return { orb: [0xcdf4ee, 1.3, 0.9, 0.06, 0] };
    }
    if (id === 'staff_slime') {
        const M = mb.shiny();
        M.ico(0.075, 0, (x: number, y: number) => rampAt(SLIME, clamp(0.5 + (y - 0.9) * 4 - x * 1.5)), { y: 0.92, sy: 1.1, j: 0.012, v: 0.07 });
        for (const [x, z, l] of [[0.05, 0.03, 0.09], [-0.04, 0.05, 0.12], [0, -0.06, 0.07]]) M.cone(0.018, l, 5, SLIME[1], { x, y: 0.82 - l / 2 + 0.02, z, rx: PI, ao: false });
        b.torus(0.03, 0.012, 3, 6, 0x9d6fdb, { y: 0.76, rx: PI / 2, ao: false });
        return { orb: [0x86e098, 1.2, 0.92, 0.05, 0] };
    }
    for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.3;
        b.cone(0.012, 0.13, 4, 0x6a432f, { x: Math.sin(a) * 0.05, y: 0.82, z: Math.cos(a) * 0.05, rz: -Math.sin(a) * 0.5, rx: Math.cos(a) * 0.5, ao: false });
    }
    b.torus(0.032, 0.012, 3, 6, 0xe0a020, { y: 0.78, rx: PI / 2, ao: false });
    return { orb: [0x6cd8f4, 1.6, 0.93, 0.07, 1] };
}
export function orbBuild(mb: MB, o: number[]) {
    const [color, e, , r, shape] = o;
    const g = mb.glow(color, e);
    if (shape === 1) {
        g.oct(r * 0.8, (_x: number, y: number) => rampAt(ICER, clamp(0.5 + y * 6)), { sy: 2, ao: false, v: 0.08 });
        g.oct(r * 0.5, 0xcdf4ee, { x: 0.05, y: -0.02, sy: 1.6, rz: -0.5, ao: false, v: 0.08 });
        g.oct(r * 0.45, 0x9eeaf2, { x: -0.05, y: -0.03, sy: 1.5, rz: 0.5, ao: false, v: 0.08 });
    } else g.ico(r, 0, color, { ao: false, v: 0.06 });
}
export function rodBuild(b: Bld, mb: MB, id: string) {
    const R = id === 'rod_master' ? ICER : id === 'rod_fine' ? IRONR : WOODR;
    const M = id === 'rod' ? b : mb.shiny();
    const col = (x: number, y: number, z: number) => rampAt(R, clamp(0.4 + y * 0.4 + (hash(x * 60, z * 60) - 0.5) * 0.2));
    const P = [[0, -0.14, 0], [0, 0.1, 0.01], [0, 0.45, 0.05], [0, 0.75, 0.15], [0, 0.92, 0.3]];
    for (let i = 0; i < P.length - 1; i++) M.rod(P[i], P[i + 1], 0.02 - i * 0.004, 4, col, 0.02 - (i + 1) * 0.004, { j: 0.002, v: 0.05 });
    b.cyl(0.04, 0.04, 0.05, 6, id === 'rod_master' ? 0x6cd8f4 : 0x6a6f88, { y: 0, z: 0, x: 0.03, rz: PI / 2, ao: false });
    b.rod([0, 0.92, 0.3], [0, 0.55, 0.32], 0.004, 3, 0xf4fbff, 0.004, { ao: false, v: 0 });
    b.oct(0.03, 0xe85d62, { y: 0.52, z: 0.32, sy: 1.3, ao: false });
}
/** How a tool or weapon sits in the hand: its kind, two-handed or not, the wrist turn, the left hand (bows), and its moving bits. */
export interface ToolMeta { type: string; twoHand: boolean; rwx: number; rwz: number; left: boolean }
export interface ToolPart extends ToolMeta {
    g: THREE.Group;
    orb?: THREE.Group;
    bow?: { half: number; sag: number; top: THREE.Group; bot: THREE.Group };
}
export const cache = new Map<string, ToolMeta>();
export function toolPart(id: string | undefined): ToolPart | null {
    if (!id) return null;
    const def = itemDef(id);
    let type: string, tier = 0;
    if (/^rod/.test(id)) type = 'rod';
    else if (def?.gear?.slot === 'tool') {
        type = 'pick';
        tier = def.gear.tier;
    } else if (def?.gear?.slot === 'weapon') {
        type = def.gear.wtype === 'fist' || !def.gear.wtype ? 'club' : def.gear.wtype;
        tier = def.gear.tier;
    } else return null;
    const key = `farmer.tool.${id}`;
    const meta = cache.get(id) ?? (() => {
        const m = ({ club: [-0.3, -0.6], pick: [-0.35, -0.5], sword: [-0.4, -0.5], dagger: [0.2, -0.5], spear: [-0.25, -0.3], hammer: [-0.35, -0.5], bow: [0, 0.1], staff: [-0.15, -0.2], rod: [-0.1, -0.35] } as Record<string, number[]>)[type];
        const v = { type, twoHand: type === 'spear' || type === 'hammer' || type === 'staff', rwx: m[0], rwz: m[1], left: type === 'bow' };
        cache.set(id, v);
        return v;
    })();
    const g = fbake(key, (b: Bld, mb: MB) => {
        if (type === 'pick') pickBuild(b, mb, tier);
        else if (type === 'club') clubBuild(b);
        else if (type === 'sword') {
            if (id === 'sword_crystal') crystalSword(b, mb);
            else if (id === 'sword_pharaoh') khopesh(b, mb);
            else if (id === 'sword_rift') riftSword(b, mb);
            else swordBuild(b, mb, id);
        } else if (type === 'dagger') daggerBuild(b, mb, id);
        else if (type === 'spear') spearBuild(b, mb, id);
        else if (type === 'hammer') hammerBuild(b, mb, id);
        else if (type === 'bow') bowBuild(b, mb, id);
        else if (type === 'staff') staffBuild(b, mb, id);
        else rodBuild(b, mb, id);
    });
    if (type === 'bow') g.scale.setScalar(1.15);
    else if (type === 'hammer') g.scale.setScalar(id === 'hammer_colossus' ? 0.85 : 0.92);
    g.rotation.y = ({ sword: 0.8, dagger: 0.8, pick: 0.7, hammer: 0.6, spear: 0.5, club: 0, bow: 0, staff: 0, rod: 0 } as Record<string, number>)[type];
    const out: ToolPart = { g, type, twoHand: meta.twoHand, rwx: meta.rwx, rwz: meta.rwz, left: meta.left };
    if (type === 'staff') {
        const spec = staffSpec(id);
        const og = fbake(`farmer.orb.${id}`, (_b, mb: MB) => orbBuild(mb, spec), false);
        og.position.set(0, spec[2], 0);
        out.orb = og;
        g.add(og);
    }
    if (type === 'bow') {
        const s = BOWS[id], sag = s.R * (1 - Math.cos(Math.asin(s.half / s.R)));
        const str = () => fbake(`farmer.string.${id}`, (b: Bld) => b.rod([0, 0, 0], [0, -1, 0], 0.007, 3, id === 'bow_rift' ? CYAN : 0xf4f0e2, 0.007, { ao: false, v: 0 }), false);
        const top = new THREE.Group(), bot = new THREE.Group();
        top.position.set(0, s.half, -sag);
        bot.position.set(0, -s.half, -sag);
        const a = str();
        a.scale.y = s.half;
        top.add(a);
        const c = str();
        c.scale.y = s.half;
        c.rotation.z = PI;
        bot.add(c);
        g.add(top, bot);
        out.bow = { half: s.half, sag, top, bot };
    }
    return out;
}
export function staffSpec(id: string): number[] {
    switch (id) {
        case 'staff_witch':
            return [0x6aff7a, 1.7, 0.99, 0.065, 0];
        case 'staff_apprentice':
            return [0xcdf4ee, 1.3, 0.9, 0.06, 0];
        case 'staff_slime':
            return [0x86e098, 1.2, 0.92, 0.05, 0];
        default:
            return [0x6cd8f4, 1.6, 0.93, 0.07, 1];
    }
}
export function arrowPart() {
    return fbake('farmer.arrow', (b: Bld, mb: MB) => {
        b.rod([0, 0, 0], [0, 0, 0.5], 0.009, 3, (_x: number, _y: number, z: number) => rampAt(WOODR, clamp(0.35 + z * 0.5)), 0.008, { ao: false, v: 0.04 });
        mb.shiny().cone(0.022, 0.07, 4, 0xc4c9dc, { z: 0.535, rx: PI / 2, ao: false });
        for (const a of [0, PI / 2]) b.hull([[0, 0, 0], [0, 0, 0.1], [Math.sin(a) * 0.04, Math.cos(a) * 0.04, 0], [Math.sin(a) * 0.04, Math.cos(a) * 0.04, 0.08]], 0xe85d62, { ao: false, v: 0.03 });
    }, false);
}
export function stowPart(id: string | undefined) {
    if (!id) return null;
    const def = itemDef(id);
    const slot = def?.gear?.slot, tier = def?.gear?.tier ?? 0;
    if (slot !== 'tool' && slot !== 'weapon') return null;
    const wt = slot === 'tool' ? 'pick' : def!.gear!.wtype ?? 'club';
    const R = tier >= 4 ? VIOLET : tier === 3 ? ICER : tier === 2 ? wt === 'pick' || id === 'sword_pharaoh' ? GOLD : STEELR : tier === 1 ? IRONR : wt === 'club' || wt === 'bow' || wt === 'staff' ? WOODR : FLINTR;
    return fbake(`farmer.stow.${id}`, (b: Bld, mb: MB) => {
        const M = mb.shiny();
        const wood = (_x: number, y: number) => rampAt(WOODR, clamp(0.4 + y * 0.3));
        if (wt === 'bow') {
            b.add(new THREE.TorusGeometry(0.5, 0.025, 3, 6, 1.1), (_x: number, y: number) => rampAt(R, clamp(0.5 + y)), { ry: -PI / 2, rz: -0.55, z: -0.5, ao: false });
            return;
        }
        const len = wt === 'dagger' ? 0.3 : wt === 'spear' || wt === 'staff' ? 0.95 : 0.6;
        b.cyl(0.026, 0.03, len, 3, wood, { y: len / 2 - 0.1, v: 0.05, ao: false });
        if (wt === 'pick') M.box(0.4, 0.07, 0.06, rampAt(R, 0.5), { y: len - 0.12, v: 0.05 });
        else if (wt === 'hammer') M.box(0.24, 0.14, 0.14, rampAt(R, 0.45), { y: len - 0.08, v: 0.05 });
        else if (wt === 'club') b.ico(0.1, 0, rampAt(WOODR, 0.5), { y: len - 0.05, j: 0.01 });
        else if (wt === 'staff') b.oct(0.06, rampAt(R, 0.7), { y: len - 0.05, sy: 1.4 });
        else if (wt === 'spear') M.cone(0.05, 0.2, 4, rampAt(R, 0.6), { y: len - 0.02 });
        else {
            M.box(0.14, 0.03, 0.04, rampAt(R, 0.6), { y: 0.06 });
            M.hull([[-0.04, 0.08, 0], [0.04, 0.08, 0], [0, 0.08, 0.015], [0, len, 0]], rampAt(R, 0.65), { v: 0.05 });
        }
    });
}
