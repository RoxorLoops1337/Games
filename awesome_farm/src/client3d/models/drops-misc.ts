// Loot models: potions, sigils, trophies, crates, pods, rods and the rest.
import { au, curve, type DropSpec, glint, heart, hg, INK, R, spike } from './drops-shapes';
import { darken, lighten, M, MB, Pt, TAU } from './kit';

export const S = (build: (mb: MB) => void, o: Partial<DropSpec> = {}): DropSpec => ({ build, ...o });
/** A potion bottle: liquid colour, body profile, neck height and radius, glow, cork and highlight colours, segments. */
export interface PotionLook { liquid: number; body: number[][]; neckY: number; neckR?: number; e: number; cork?: number; hi?: number; seg?: number }
export function potion(mb: MB, o: PotionLook, extra: ((mb: MB) => void) | ((mb: MB) => void) | ((mb: MB) => void) | ((mb: MB) => void) | ((mb: MB) => void) | ((mb: MB) => void) | ((mb: MB) => void)) {
    const seg = o.seg ?? 7, nr = o.neckR ?? 0.12, top = o.neckY + 0.22;
    const lq = o.liquid, L = [darken(lq, 0.3), darken(lq, 0.05), lq, lighten(lq, 0.25)];
    mb.glow(lq, o.e ?? 0.9).lathe(o.body, seg, hg(L, 0, o.neckY, 0.3), { j: 0.008, v: 0.06, ao: false });
    mb.shiny().cyl(nr, nr * 1.15, 0.24, 6, 0xcdf4ee, { y: o.neckY + 0.1, v: 0.04 });
    mb.shiny().tube(nr * 1.45, nr * 1.45, 0.05, 6, 0xf4fbff, { y: top - 0.05, ao: false });
    mb.main.cyl(nr * 0.95, nr * 0.8, 0.14, 6, o.cork ?? 0xa8703f, { y: top + 0.05, j: 0.008, v: 0.06 });
    const hy = o.neckY * 0.45;
    mb.glow(0xffffff, 1.3).box(0.045, o.neckY * 0.5, 0.03, o.hi ?? 0xffffff, { x: -(o.body[2]?.[0] ?? 0.4) * 0.72, y: hy + 0.1, z: (o.body[2]?.[0] ?? 0.4) * 0.45, rz: -0.12, ao: false, v: 0 });
    extra?.(mb);
}
export const BODY = {
    round: [[0, 0], [0.3, 0], [0.43, 0.17], [0.41, 0.4], [0.2, 0.58]],
    tall: [[0, 0], [0.27, 0], [0.33, 0.1], [0.33, 0.52], [0.18, 0.64]],
    slim: [[0, 0], [0.2, 0], [0.29, 0.12], [0.27, 0.5], [0.13, 0.62]],
    squat: [[0, 0], [0.4, 0], [0.5, 0.12], [0.48, 0.3], [0.22, 0.42]],
    hex: [[0, 0], [0.36, 0], [0.38, 0.5], [0.22, 0.62]],
    cone: [[0, 0], [0.46, 0], [0.32, 0.34], [0.12, 0.64]]
};
export const POTIONS = {
    potion_heal: { o: { liquid: 0xf0506e, body: BODY.round, neckY: 0.58, e: 0.75 }, extra: (mb: MB) => {
        mb.glow(0xffd0dc, 1.6).box(0.12, 0.035, 0.03, 0xfff0f4, { y: 0.28, z: 0.43, ao: false, v: 0 });
        mb.glow(0xffd0dc, 1.6).box(0.035, 0.12, 0.03, 0xfff0f4, { y: 0.28, z: 0.43, ao: false, v: 0 });
    } },
    potion_energy: { o: { liquid: 0xffc830, body: BODY.tall, neckY: 0.64, e: 0.7, cork: 0x6a402f }, extra: (mb: MB) => {
        glint(mb, 0, 0.34, 0.34, 0.06, 0xfff3b0, 2.2);
        glint(mb, 0.1, 0.46, 0.3, 0.04, 0xfff3b0, 2.2);
    } },
    potion_swift: { o: { liquid: 0x3ac8e8, body: BODY.slim, neckY: 0.62, neckR: 0.1, e: 0.75 }, extra: (mb: MB) => {
        mb.glow(0xe8fbff, 1.5).box(0.025, 0.4, 0.02, 0xe8fbff, { x: 0.04, y: 0.3, z: 0.29, rz: 0.5, ao: false, v: 0 });
    } },
    potion_might: { o: { liquid: 0xf07a20, body: BODY.squat, neckY: 0.42, neckR: 0.14, e: 0.75, cork: 0x6a402f }, extra: (mb: MB) => {
        mb.main.box(0.36, 0.1, 0.03, 0x6a402f, { y: 0.2, z: 0.47, ao: false, v: 0.03 });
    } },
    potion_guard: { o: { liquid: 0xa8aec8, body: BODY.hex, neckY: 0.62, seg: 6, e: 0.55 }, extra: (mb: MB) => {
        for (const y of [0.1, 0.42]) mb.shiny().tube(0.39, 0.39, 0.06, 6, R.iron[1], { y, ao: false, v: 0.03 });
    } },
    potion_vigor: { o: { liquid: 0xa070e8, body: BODY.cone, neckY: 0.64, neckR: 0.1, e: 0.85 }, extra: (mb: MB) => {
        glint(mb, 0.14, 0.9, 0.12, 0.05, 0xe8dcff, 2.4);
        glint(mb, -0.2, 0.8, 0.1, 0.035, 0xf79fc6, 2.4);
    } },
    potion_night: { o: { liquid: 0x4a5ce0, body: BODY.round, neckY: 0.58, e: 0.9 }, extra: (mb: MB) => {
        glint(mb, -0.12, 0.3, 0.38, 0.05, 0xe8f0ff, 2.6);
        glint(mb, 0.14, 0.4, 0.36, 0.035, 0xe8f0ff, 2.6);
        glint(mb, 0.02, 0.18, 0.42, 0.03, 0xffe680, 2.6);
    } }
};
export function mendJar(mb: MB) {
    mb.glow(0x7ad04a, 0.65).lathe([[0, 0], [0.42, 0], [0.47, 0.08], [0.47, 0.3], [0.4, 0.36]], 7, hg([0x4a9a2a, 0x7ad04a, 0xa8e870], 0, 0.35, 0.3), { j: 0.008, v: 0.06, ao: false });
    mb.main.cyl(0.43, 0.43, 0.13, 7, 0xfff0d2, { y: 0.4, j: 0.008, v: 0.04 });
    mb.main.tube(0.44, 0.44, 0.04, 7, 0xa8703f, { y: 0.4, ao: false });
    mb.glow(0xe8fff0, 1.3).oct(0.12, 0xe8fff0, { y: 0.52, sy: 0.7, ao: false });
    for (let i = 0; i < 2; i++) mb.main.leaf(0.3, 0.07, 0.01, R.leaf[1 + i % 2], { x: 0, y: 0.5, z: 0, ry: i * 3.1 + 0.4, rx: -0.7, j: 0.004, ao: false });
    mb.glow(0xffffff, 1.3).box(0.04, 0.2, 0.03, 0xffffff, { x: -0.34, y: 0.16, z: 0.28, rz: -0.12, ao: false, v: 0 });
    mb.main.box(0.26, 0.14, 0.03, 0xfff6e0, { y: 0.17, z: 0.47, ao: false, v: 0.02 });
}
export function sigil(mb: MB, o: { ramp: readonly number[]; glow: number; emblem: string; }) {
    const b = mb.main, h = Math.PI / 2, g = mb.glow(o.glow, 1.25), r = o.ramp, lg = lighten(o.glow, 0.35);
    b.cyl(0.5, 0.5, 0.13, 7, hg(r, 0, 0.9, 0.25), { y: 0.5, rx: h, ry: 0, j: 0.01, v: 0.06 });
    b.cyl(0.4, 0.4, 0.17, 6, r[1], { y: 0.5, rx: h, ao: false, v: 0.04 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + Math.PI / 8;
        b.oct(0.09, r[3], { x: Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5, z: 0.03, sz: 0.7, ao: false });
    }
    const c = (x: number, y: number) => ({ x, y: 0.5 + y, z: 0.1 });
    switch (o.emblem) {
        case 'drop':
            g.ico(0.19, 0, au((_x: number, y: number) => y > 0.46 ? lg : o.glow), { ...c(0, -0.08), sy: 1.05, ao: false, v: 0.06 });
            g.cone(0.15, 0.3, 5, lg, { ...c(0, 0.2), ao: false, v: 0.06 });
            break;
        case 'diamond':
            g.oct(0.3, au((_x: number, y: number) => y > 0.5 ? lg : o.glow), { ...c(0, 0), sy: 1.2, sz: 0.35, ao: false, v: 0.06 });
            b.oct(0.14, r[0], { ...c(0, 0), z: 0.16, sy: 1.2, sz: 0.3, ao: false });
            break;
        case 'eye':
            g.ico(0.3, 0, au((_x: number, y: number) => y > 0.5 ? lg : o.glow), { ...c(0, 0), sy: 0.55, sz: 0.4, ao: false, v: 0.06 });
            b.oct(0.065, INK, { ...c(0, 0), z: 0.16, sy: 2.4, sz: 0.5, ao: false });
            for (let i = -1; i <= 1; i++) g.cone(0.035, 0.12, 4, lg, { ...c(i * 0.14, 0.24), rz: -i * 0.4, ao: false });
            break;
        case 'sun':
            g.ico(0.15, 0, lg, { ...c(0, 0), sz: 0.6, ao: false, v: 0.05 });
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * TAU;
                g.cone(0.06, 0.2, 3, o.glow, { ...c(Math.cos(a) * 0.28, Math.sin(a) * 0.28), rz: a - h, ao: false });
            }
            break;
        case 'flake':
            for (let i = 0; i < 3; i++) g.box(0.6, 0.065, 0.07, i === 0 ? lg : o.glow, { ...c(0, 0), rz: i * Math.PI / 3, ao: false, v: 0.04 });
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * TAU;
                g.tet(0.07, lg, { ...c(Math.cos(a) * 0.32, Math.sin(a) * 0.32), rz: a, ao: false });
            }
            break;
        default:
            heart(mb.glow(0xe8402f, 1.3), 0.9, au((_x: number, y: number) => y > 0.5 ? 0xff7a68 : 0xe8503f), { ...c(0, -0.02), ao: false, v: 0.06 });
    }
}
export const sigilSpec = (ramp: readonly number[], glow: number, emblem: string, o = {}) => S((mb: MB) => sigil(mb, { ramp, glow, emblem }), { lean: 1, turn: 'sway', ...o });
export function trophySlime(mb: MB) {
    const b = mb.shiny(), P = [0x6a52a6, 0x9d6fdb, 0xbba0ee, 0xe8dcff];
    b.ico(0.42, 0, hg(P, 0, 0.8, 0.3), { y: 0.36, sy: 0.82, sx: 1.12, j: 0.04, v: 0.06 });
    b.oct(0.12, P[1], { x: 0.4, y: 0.08, z: 0.24, sy: 0.8, j: 0.01 });
    const G = R.gold;
    b.tube(0.2, 0.22, 0.13, 5, G[2], { y: 0.7, v: 0.04 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        b.cone(0.06, 0.17, 3, G[2], { x: Math.cos(a) * 0.2, y: 0.84, z: Math.sin(a) * 0.2, ao: false });
    }
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.4;
        mb.glow(0xffd966, 1.4).oct(0.045, 0xfff3b0, { x: Math.cos(a) * 0.2, y: 0.96, z: Math.sin(a) * 0.2, ao: false });
    }
    mb.glow(0xe85d62, 1.4).oct(0.05, 0xf79fc6, { y: 0.71, z: 0.22, sy: 1.3, ao: false });
    mb.main.oct(0.06, INK, { x: -0.14, y: 0.4, z: 0.38, sy: 1.5, ao: false });
    mb.main.oct(0.06, INK, { x: 0.14, y: 0.4, z: 0.38, sy: 1.5, ao: false });
}
export function trophyStone(mb: MB) {
    const b = mb.main, st = R.stone;
    b.dode(0.4, hg(st, 0, 0.9, 0.5), { y: 0.45, sy: 0.95, ry: 0.4, j: 0.07, v: 0.1 });
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 1.2;
        spike(b, 0.34, 0.1, hg(st, 0.3, 0.8, 0.5), { x: Math.cos(a) * 0.4, y: 0.4, z: Math.sin(a) * 0.4, rx: Math.sin(a) * 0.8, rz: -Math.cos(a) * 0.8, j: 0.012 }, 4);
    }
    mb.glow(0xf8a24a, 1.7).ico(0.21, 0, au((_x: number, y: number) => y > 0.48 ? 0xffd890 : 0xf8a24a), { y: 0.5, z: 0.24, ao: false, v: 0.06 });
    mb.glow(0xf8a24a, 1.4).box(0.2, 0.03, 0.03, 0xf8a24a, { x: -0.3, y: 0.62, z: 0.3, rz: 0.5, ao: false, v: 0 });
}
export function trophyBog(mb: MB) {
    const b = mb.main, W = [0x2a1d2c, 0x3a2f28, 0x5a4a3a, 0x7a6a52];
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5;
        b.rod([Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14], [Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34], 0.08, 3, W[2], 0.035, { j: 0.012, v: 0.07 });
    }
    mb.shiny().ico(0.33, 0, au((_x: number, y: number) => y > 0.7 ? 0xf0f8d8 : 0xdcecc0), { y: 0.68, j: 0.01, v: 0.06 });
    mb.glow(0x92d364, 1.5).cyl(0.17, 0.17, 0.06, 6, au((_x: number, y: number) => y > 0.7 ? 0xd4f08a : 0x92d364), { y: 0.68, z: 0.3, rx: Math.PI / 2, ao: false, v: 0.06 });
    b.box(0.045, 0.2, 0.05, INK, { y: 0.68, z: 0.34, ao: false, v: 0.02 });
    b.box(0.12, 0.025, 0.025, 0xe85d62, { x: -0.2, y: 0.84, z: 0.2, rz: 0.6, ao: false, v: 0 });
}
export function trophyDune(mb: MB) {
    const b = mb.shiny(), G = R.gold;
    b.ico(0.3, 0, hg(G, 0.15, 0.85, 0.3), { y: 0.5, sx: 0.88, sy: 1.15, sz: 0.85, j: 0.012, v: 0.06 });
    b.oct(0.17, G[2], { y: 0.86, z: 0.02, sx: 1.3, j: 0.008 });
    b.box(0.03, 0.52, 0.06, 0x35305c, { y: 0.5, z: 0, ao: false });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) b.rod([s * 0.24, 0.36 + i * 0.2, 0], [s * (0.5 + i * 0.04), 0.2 + i * 0.34, 0], 0.03, 3, G[1], 0.022, { ao: false });
    for (const s of [-1, 1]) b.cone(0.03, 0.14, 3, G[3], { x: s * 0.08, y: 1.02, rz: -s * 0.4, ao: false });
    for (const [x, y] of [[-0.12, 0.62], [0.12, 0.62]]) mb.glow(0x4ab2cf, 1.5).oct(0.09, 0x9be0e8, { x, y, z: 0.22, sy: 1.3, ao: false });
    mb.glow(0x4ab2cf, 1.5).oct(0.07, 0x9be0e8, { y: 0.4, z: 0.26, sy: 1.3, ao: false });
}
export function trophyFrost(mb: MB) {
    const I = R.ice;
    heart(mb.glow(0x4ab2cf, 0.8), 1, au((_x: number, y: number) => y > 0.5 ? 0xbce8f4 : y > 0.34 ? 0x8ac4e0 : 0x5a8fb8), { y: 0.52, ao: false, v: 0.08 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + 0.3;
        spike(mb.shiny(), 0.26 + i % 2 * 0.1, 0.06, I[3], { x: Math.cos(a) * 0.45, y: 0.5 + Math.sin(a) * 0.45, rz: a - Math.PI / 2, ao: false }, 4);
    }
    glint(mb, -0.15, 0.7, 0.2, 0.05, 0xffffff, 1.6);
}
export function trophyHeart(mb: MB) {
    heart(mb.glow(0xe8402f, 1.3), 1.12, au((_x: number, y: number) => y > 0.55 ? 0xff7a68 : y > 0.34 ? 0xe8503f : 0xb02a40), { y: 0.54, ao: false, v: 0.1 });
    for (const [x, y, rz] of [[-0.12, 0.62, 0.6], [0.14, 0.5, -0.5], [0, 0.36, 0.2]]) mb.main.box(0.22, 0.03, 0.03, 0x5a1a2a, { x, y, z: 0.24, rz, ao: false, v: 0 });
    glint(mb, -0.22, 0.8, 0.2, 0.05, 0xfff6e0, 2.6);
}
export function crate(mb: MB, o: { wood: number[]; band: number[]; lock: number; shiny?: boolean; studs?: number; glow?: number; }) {
    const b = o.shiny ? mb.shiny() : mb.main, w = o.wood;
    b.box(0.82, 0.5, 0.58, hg(w, 0, 0.7, 0.3), { y: 0.31, j: 0.01, v: 0.06 });
    b.box(0.86, 0.15, 0.62, au((_x: number, y: number) => y > 0.66 ? w[3] : w[2]), { y: 0.635, j: 0.01, v: 0.06 });
    for (const x of [-0.27, 0.27]) mb.shiny().box(0.12, 0.74, 0.66, au((_px: number, y: number) => y > 0.7 ? o.band[2] : o.band[1]), { x, y: 0.4, ao: false, v: 0.04 });
    b.box(0.4, 0.02, 0.02, w[0], { y: 0.22, z: 0.3, ao: false });
    mb.shiny().box(0.17, 0.2, 0.06, o.lock, { y: 0.5, z: 0.34, ao: false, v: 0.03 });
    mb.main.box(0.035, 0.08, 0.03, INK, { y: 0.49, z: 0.375, ao: false });
    if (o.studs) for (const x of [-0.27, 0.27]) for (const y of [0.1, 0.62]) mb.glow(o.studs, 1).oct(0.045, o.studs, { x, y, z: 0.34, ao: false });
    if (o.glow) {
        mb.glow(o.glow, 1.5).box(0.06, 0.4, 0.03, 0xd0b8ff, { x: -0.1, y: 0.32, z: 0.3, rz: 0.2, ao: false, v: 0 });
        mb.glow(o.glow, 1.5).box(0.05, 0.26, 0.03, 0xd0b8ff, { x: 0.1, y: 0.4, z: 0.3, rz: -0.4, ao: false, v: 0 });
        mb.glow(o.glow, 1.5).box(0.36, 0.03, 0.36, 0xd0b8ff, { y: 0.715, ao: false, v: 0 });
    }
}
export function pod(mb: MB, o: { top: number[]; bottom: number[]; band: number; button: number; studs?: number; r?: number; glow?: number; }) {
    const b = mb.shiny(), r = o.r ?? 0.43;
    b.dome(r, r, 6, 2, hg(o.top, 0.5, 0.5 + r, 0.3), { y: 0.5, j: 0.008, v: 0.06 });
    b.dome(r, r, 6, 2, hg(o.bottom, 0.5 - r, 0.5, 0.3), { y: 0.5, rx: Math.PI, j: 0.008, v: 0.05 });
    b.cyl(r * 1.05, r * 1.05, 0.12, 6, o.band, { y: 0.5, ao: false, v: 0.03 });
    b.cyl(0.12, 0.12, 0.1, 5, o.button, { y: 0.5, z: r * 1.02, rx: Math.PI / 2, ao: false, v: 0.03 });
    if (o.studs) for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + 0.6;
        b.oct(0.045, o.studs, { x: Math.sin(a) * r * 1.06, y: 0.5, z: Math.cos(a) * r * 1.06, ao: false });
    }
    if (o.glow) {
        for (let i = 0; i < 2; i++) {
            const a = i / 2 * TAU + 0.4;
            mb.glow(o.glow, 1.6).box(0.05, 0.18, 0.04, 0xd0b8ff, { x: Math.sin(a) * r * 0.8, y: 0.78, z: Math.cos(a) * r * 0.8, rx: -Math.cos(a) * 0.5, rz: Math.sin(a) * 0.5, ao: false, v: 0 });
        }
    }
    mb.glow(0xffffff, 1.2).box(0.05, 0.15, 0.03, 0xffffff, { x: -r * 0.55, y: 0.78, z: r * 0.5, rx: -0.5, rz: 0.4, ao: false, v: 0 });
}
export function treat(mb: MB) {
    const b = mb.main, c = [0xb8741a, 0xd89a38, 0xf0c070, 0xf8dca0];
    b.cyl(0.44, 0.42, 0.16, 8, au((_x: number, y: number) => y > 0.14 ? c[2] : c[1]), { y: 0.08, j: 0.012, v: 0.06 });
    b.cyl(0.4, 0.4, 0.03, 8, c[3], { y: 0.16, ao: false, v: 0.04 });
    b.oct(0.14, c[0], { y: 0.18, z: 0.1, sy: 0.35, ao: false });
    for (const x of [-0.22, -0.08, 0.08, 0.22]) b.oct(0.07, c[0], { x, y: 0.18, z: -0.12 + Math.abs(x) * -0.2, sy: 0.35, ao: false });
    b.hull([[0.2, 0.16, 0.2], [0.34, 0.16, 0.12], [0.3, 0.2, 0.28], [0.22, 0.2, 0.3]], 0xf79fc6, { ao: false, j: 0.005 });
    for (const [x, z] of [[-0.3, 0.2], [0.3, -0.2], [0, 0.3]]) b.oct(0.04, 0xffd966, { x, y: 0.2, z, ao: false });
}
export function rod(mb: MB, o: { shaft: number[]; reel: number; float: number; floatTop: number; gold?: number; glow?: number[]; }) {
    const b = mb.main, rb = o.glow ? mb.glow(o.glow[0], o.glow[1]) : mb.main;
    curve(rb, [[-0.3, 0.02, 0], [-0.1, 0.4, 0], [0.18, 0.76, 0], [0.36, 0.99, 0]], 0.04, 0.012, 3, au((_x: number, y: number) => o.shaft[y > 0.5 ? 2 : 1]), { v: 0.07, ao: false });
    b.cyl(0.055, 0.055, 0.3, 4, R.leather[1], { x: -0.32, y: 0.1, rz: -0.5 });
    mb.shiny().cyl(0.12, 0.12, 0.08, 5, o.reel, { x: -0.18, y: 0.26, z: 0.07, rx: Math.PI / 2, ao: false, v: 0.04 });
    mb.shiny().oct(0.07, o.gold ?? R.gold[2], { x: -0.18, y: 0.26, z: 0.13, ao: false });
    b.rod([0.36, 0.99, 0], [0.52, 0.6, 0], 0.01, 3, 0xfff6e0, 0.01, { ao: false });
    mb.glow(o.floatTop, o.glow ? 1.4 : 0.6).oct(0.1, o.floatTop, { x: 0.52, y: 0.56, z: 0, sy: 1.2, ao: false, v: 0.05 });
    b.oct(0.09, o.float, { x: 0.52, y: 0.46, z: 0, sy: 0.9, ao: false, v: 0.05 });
    b.rod([0.52, 0.4, 0], [0.5, 0.26, 0], 0.01, 3, 0xfff6e0, 0.01, { ao: false });
    b.tet(0.06, R.iron[2], { x: 0.5, y: 0.22, ao: false });
}
export function bait(mb: MB) {
    const b = mb.main, P = [0xc9505a, 0xe8737a, 0xf79fc6, 0xfbc4de];
    const worm = (pts: Pt[]) => {
        curve(b, pts, 0.1, 0.07, 4, au((x: number, y: number) => hashy(x, y) ? P[2] : P[1]), { v: 0.06, ao: false });
        b.oct(0.11, P[2], { x: pts[0][0], y: pts[0][1], z: pts[0][2], j: 0.005 });
    };
    worm([[-0.4, 0.14, 0.1], [-0.2, 0.26, 0.2], [0.05, 0.14, 0.1], [0.4, 0.2, 0.1]]);
    worm([[-0.34, 0.12, -0.2], [-0.1, 0.22, -0.3], [0.2, 0.12, -0.22]]);
    b.leaf(0.5, 0.2, 0.02, R.leaf[1], { x: -0.1, y: 0.04, z: 0.4, ry: 2, rx: 0, j: 0.008 });
    b.ico(0.2, 0, R.peat[2], { x: 0, y: 0, z: 0, sy: 0.35, sx: 2.2, j: 0.03 });
}
export const hashy = (x: number, y: number) => (Math.floor(x * 9) + Math.floor(y * 9) & 1) === 0;
export function boot(mb: MB) {
    const b = mb.main, L = [0x5a3828, 0x7a4e30, 0xa8703f, 0xc08a50];
    b.cyl(0.26, 0.28, 0.58, 7, hg(L, 0.15, 0.8, 0.3), { x: -0.12, y: 0.52, j: 0.02, v: 0.07 });
    b.tube(0.3, 0.3, 0.08, 7, L[0], { x: -0.12, y: 0.82, ao: false, v: 0.03 });
    b.hull([[-0.4, 0.08, 0.24], [-0.4, 0.08, -0.24], [0.5, 0.08, 0.18], [0.5, 0.08, -0.18], [-0.4, 0.3, 0.26], [-0.4, 0.3, -0.26], [0.42, 0.26, 0.17], [0.42, 0.26, -0.17], [0.55, 0.14, 0]], hg(L, 0, 0.4, 0.3), { j: 0.015, v: 0.07 });
    b.box(1, 0.1, 0.5, L[0], { x: 0.06, y: 0.05, j: 0.015, v: 0.05 });
    curve(b, [[0.1, 0.86, 0.05], [0.26, 0.6, 0.22], [0.3, 0.36, 0.32]], 0.04, 0.02, 3, R.leaf[0], { v: 0.06 });
    b.box(0.16, 0.14, 0.03, L[3], { x: -0.1, y: 0.5, z: 0.27, ao: false, v: 0.04 });
    for (const [x, y] of [[0.2, 0.2], [0.34, 0.2]]) b.oct(0.04, 0xcdf4ee, { x, y, z: 0.2, ao: false });
}
export function msgBottle(mb: MB) {
    const g = mb.custom('glass', M(0xffffff, { vc: true, r: 0.12, m: 0.2, t: 0.7 }), true);
    g.lathe([[0, 0], [0.28, 0], [0.38, 0.1], [0.38, 0.5], [0.2, 0.66], [0.1, 0.74]], 7, hg([0x6ac6d8, 0x9be0e8, 0xcdf4ee, 0xf4fbff], 0, 0.7, 0.3), { j: 0.006, v: 0.05, ao: false });
    g.cyl(0.1, 0.1, 0.26, 6, 0xcdf4ee, { y: 0.82, ao: false });
    mb.main.cyl(0.095, 0.075, 0.16, 6, 0xa8703f, { y: 1, j: 0.008, v: 0.06 });
    mb.main.cyl(0.11, 0.11, 0.5, 6, 0xf4e8c8, { y: 0.28, rz: 0.4, ry: 0.2, j: 0.012, v: 0.05 });
    mb.glow(0xffffff, 1.3).box(0.04, 0.4, 0.03, 0xffffff, { x: -0.3, y: 0.34, z: 0.24, ao: false, v: 0 });
    mb.main.oct(0.14, 0xecd49c, { y: 0, sy: 0.4, sx: 2.2, j: 0.02, ao: false });
}
export const MISC: Record<string, DropSpec> = {
    ...Object.fromEntries(Object.entries(POTIONS).map(([id, p]) => [id, S((mb: MB) => potion(mb, p.o, p.extra), { turn: 'sway', lean: 0.85 })])),
    potion_mend: S(mendJar, { lean: 0.7, turn: 'sway' }),
    sigil_slime: sigilSpec([0x4a3a7a, 0x6a52a6, 0x8f72cc, 0xbba0ee], 0x9d6fdb, 'drop'),
    sigil_stone: sigilSpec([0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc], 0xaab4d8, 'diamond'),
    sigil_bog: sigilSpec([0x264f46, 0x2f6b4b, 0x3f8a4c, 0x5cb04f], 0x92d364, 'eye'),
    sigil_dune: sigilSpec([0x8a5a18, 0xb8841e, 0xdcaa38, 0xf0cc58], 0xffd966, 'sun'),
    sigil_frost: sigilSpec([0x5a8fb8, 0x8ac4e0, 0xbce8f4, 0xe8fbff], 0x9be0e8, 'flake'),
    sigil_heart: sigilSpec([0x6a2a3a, 0x9a3446, 0xc9505a, 0xe8737a], 0xff5a4a, 'heart', { pulse: true }),
    trophy_slime: S(trophySlime, { turn: 'sway', spark: 0xffe680 }),
    trophy_stone: S(trophyStone, { spark: 0xffc878 }),
    trophy_bog: S(trophyBog, { turn: 'sway', spark: 0xd4f08a }),
    trophy_dune: S(trophyDune, { lean: 0.6, turn: 'sway', spark: 0xffe680 }),
    trophy_frost: S(trophyFrost, { lean: 0.8, turn: 'sway', pulse: true, spark: 0xcdf4ee }),
    trophy_heart: S(trophyHeart, { lean: 0.8, turn: 'sway', pulse: true, spark: 0xff8a7a }),
    crate_wood: S((mb: MB) => crate(mb, { wood: R.wood.slice(1), band: R.iron, lock: R.iron[1] }), { lean: 0.45 }),
    crate_silver: S((mb: MB) => crate(mb, { wood: [0x585c74, 0x8a90a8, 0xb8bed2, 0xd5d9e6], band: [0x2e3a5c, 0x4e6490, 0x7f98c4, 0xb4c8ec], lock: 0xe4e8f4, shiny: true }), { lean: 0.45 }),
    crate_gold: S((mb: MB) => crate(mb, { wood: [0x4a2f2a, 0x6a432f, 0x8f5a36, 0xb87a46], band: R.gold, lock: R.gold[3], shiny: true, studs: 0xffd966 }), { lean: 0.45 }),
    crate_mythic: S((mb: MB) => crate(mb, { wood: [0x2a1d4a, 0x4a3a7a, 0x6a52a6, 0x8f72cc], band: [0x6a52a6, 0x8f72cc, 0xbba0ee, 0xe8dcff], lock: 0xe8dcff, shiny: true, glow: 0xb07aff }), { lean: 0.45, spark: 0xb07aff }),
    bottle: S(msgBottle, { diag: 0.9, lean: 0.7, turn: 'sway' }),
    pod: S((mb: MB) => pod(mb, { top: [0xa8461a, 0xd8702a, 0xf39a3c, 0xffc878], bottom: R.cream, band: 0x6a402f, button: 0xffd966 }), { turn: 'spin' }),
    pod_great: S((mb: MB) => pod(mb, { top: R.teal, bottom: R.cream, band: R.iron[1], button: 0xe4e8f4, studs: 0xe4e8f4, r: 0.45 })),
    pod_ultra: S((mb: MB) => pod(mb, { top: R.violet, bottom: [0xc4a4f0, 0xe8dcff, 0xf6f0ff, 0xffffff], band: R.gold[2], button: 0xffd966, glow: 0xb07aff, r: 0.46 }), { spark: 0xb07aff }),
    treat: S(treat, { lean: 0.55 }),
    rod: S((mb: MB) => rod(mb, { shaft: R.wood, reel: R.iron[1], float: 0xfff6e0, floatTop: 0xe85d62 }), { lean: 0.9, turn: 'sway', diag: 0.2 }),
    rod_fine: S((mb: MB) => rod(mb, { shaft: R.steel, reel: R.gold[1], float: 0xfff6e0, floatTop: 0xf8a24a, gold: R.gold[3] }), { lean: 0.9, turn: 'sway', diag: 0.2 }),
    rod_master: S((mb: MB) => rod(mb, { shaft: R.ice, reel: R.ice[2], float: 0xfff6e0, floatTop: 0x7ae0f4, glow: [0x7ae0f4, 1.2] }), { lean: 0.9, turn: 'sway', diag: 0.2, spark: 0x9be0e8 }),
    bait: S(bait, { lean: 0.3 }),
    junk_boot: S(boot, { lean: 0.35, turn: 'sway' })
};
