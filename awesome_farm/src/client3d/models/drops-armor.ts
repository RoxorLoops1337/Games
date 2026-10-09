// Loot models: helmets, armour, charms and bags.
import { au, curve, type DropSpec, gem, glint, heart, hg, INK, R, spike } from './drops-shapes';
import { Bld, Col, MB, TAU } from './kit';

export const S = (build: (mb: MB) => void, o: Partial<DropSpec> = {}): DropSpec => ({ build, turn: 'sway', ...o });
export function helmet(mb: MB, o: { ramp: number[]; band: number; slit?: number; h?: number; tubeBand?: boolean; glowSlit?: boolean; nose?: boolean; rivets?: number; cheeks?: boolean; crest?: number[]; plume?: number; }) {
    const b = mb.shiny(), H = o.h ?? 0.5;
    b.dome(0.5, H, 7, 2, hg(o.ramp, 0.1, 0.1 + H, 0.35), { y: 0.14, j: 0.01, v: 0.07 });
    if (o.tubeBand) b.tube(0.53, 0.53, 0.12, 7, o.band, { y: 0.1, j: 0.006, v: 0.05 });
    else b.cyl(0.53, 0.53, 0.12, 7, o.band, { y: 0.1, j: 0.006, v: 0.05 });
    const slit = o.glowSlit ? mb.glow(o.slit ?? 0x8aeaf8, 2) : mb.main;
    slit.box(0.46, 0.09, 0.08, o.glowSlit ? o.slit ?? 0x8aeaf8 : INK, { y: 0.27, z: 0.44, ao: false, v: 0.02 });
    if (o.nose) b.box(0.075, 0.3, 0.06, o.ramp[2], { y: 0.28, z: 0.5, ao: false });
    if (o.cheeks) for (const s of [-1, 1]) b.hull([[s * 0.5, 0.18, 0.2], [s * 0.5, 0.18, -0.15], [s * 0.4, -0.02, 0.2], [s * 0.4, -0.02, -0.05], [s * 0.54, 0, 0.12]], o.ramp[1], { j: 0.006 });
    if (o.crest) b.hull([[0, 0.62, -0.38], [0, 0.62, 0.36], [0, 0.98 - 0, 0], [0.04, 0.6, -0.2], [-0.04, 0.6, -0.2], [0.04, 0.6, 0.2], [-0.04, 0.6, 0.2]], o.crest[2], { j: 0.006, v: 0.07 });
    if (o.plume) b.hull([[0, 0.96, 0], [0, 1, -0.1], [0.04, 0.92, -0.5], [-0.04, 0.92, -0.5], [0, 0.6, -0.3]], o.plume, { j: 0.01, ao: false });
    for (let i = 0; i < (o.rivets ?? 0); i++) {
        const a = i / (o.rivets ?? 1) * TAU;
        if (Math.sin(a) > -0.1) b.oct(0.04, R.gold[2], { x: Math.cos(a) * 0.54, y: 0.1, z: Math.sin(a) * 0.54, ao: false });
    }
}
export function capCloth(mb: MB) {
    const b = mb.main, C = R.cream;
    b.dome(0.48, 0.5, 7, 2, hg(C, 0.1, 0.6, 0.3), { y: 0.16, ry: 0.2, j: 0.02, v: 0.06 });
    b.cyl(0.52, 0.52, 0.18, 7, 0x4ab2cf, { y: 0.08, j: 0.008, v: 0.05 });
    b.tube(0.535, 0.535, 0.05, 7, 0xcdf4ee, { y: 0.12, ao: false, v: 0.02 });
    b.ico(0.12, 0, C[3], { y: 0.74, j: 0.015 });
    b.hull([[0, 0.6, 0.02], [0, 0.6, -0.02], [0.3, 0.55, 0], [0.38, 0.38, 0], [0.2, 0.5, 0.05]], C[2], { j: 0.01, ao: false });
}
export function capHide(mb: MB) {
    const b = mb.main, L = R.leather;
    b.dome(0.49, 0.46, 7, 2, hg(L, 0.1, 0.55, 0.3), { y: 0.16, j: 0.02, v: 0.07 });
    b.cyl(0.52, 0.52, 0.13, 7, L[0], { y: 0.1, j: 0.01, v: 0.05 });
    for (const s of [-1, 1]) b.hull([[s * 0.5, 0.18, 0.16], [s * 0.5, 0.18, -0.16], [s * 0.54, -0.1, 0.12], [s * 0.54, -0.1, -0.1], [s * 0.46, -0.16, 0]], L[1], { j: 0.012 });
    for (let i = 0; i < 4; i++) b.box(0.035, 0.02, 0.1, 0xf4deaa, { y: 0.4 + i * 0.1 - (i > 1 ? 0.04 : 0), z: 0.44 - i * 0.12, rx: -0.5 - i * 0.3, ao: false, v: 0 });
    b.ico(0.055, 0, R.gold[2], { y: 0.69, ao: false });
    b.hull([[0.46, 0.36, 0.06], [0.46, 0.36, -0.06], [0.64, 0.5, 0], [0.7, 0.28, 0]], 0xe85d62, { j: 0.008, ao: false });
}
export function crownSlime(mb: MB) {
    const g = mb.shiny(), P = [0x6a52a6, 0x9d6fdb, 0xbba0ee, 0xe8dcff];
    g.tube(0.44, 0.48, 0.26, 7, hg(P, 0.1, 0.4, 0.3), { y: 0.1, v: 0.06, j: 0.01 });
    g.tube(0.5, 0.5, 0.06, 7, P[2], { y: 0.12, ao: false, v: 0.04 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + 0.3, x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45, h = 0.36 + i % 2 * 0.1;
        g.hull([[-0.13, 0, 0.05], [0.13, 0, 0.05], [-0.13, 0, -0.05], [0.13, 0, -0.05], [0, h, 0]], hg(P, 0.2, 0.8, 0.3), { x, y: 0.34, z, ry: Math.PI / 2 - a, j: 0.008, v: 0.07 });
        mb.glow(0xffd966, 1.5).oct(0.06, 0xfff3b0, { x, y: 0.34 + h + 0.04, z, sy: 1.3, ao: false });
    }
    for (const [x, z] of [[0.3, 0.38], [-0.2, 0.44], [0.46, -0.1]]) g.oct(0.07, P[1], { x, y: 0.02, z, sy: 1.8, j: 0.01 });
    mb.glow(0xf79fc6, 1.4).oct(0.09, 0xfbc4de, { y: 0.26, z: 0.5, sy: 1.5, ao: false });
}
export function helmFrost(mb: MB) {
    helmet(mb, { ramp: [0x5a8fb8, 0x8ac4e0, 0xbce8f4, 0xe8fbff], band: 0xe8fbff, slit: INK, h: 0.46, tubeBand: true });
    const g = mb.shiny();
    for (const s of [-1, 1]) g.rod([s * 0.46, 0.42, 0], [s * 0.66, 0.96, 0], 0.085, 4, 0xe8fbff, 0.02, { v: 0.06 });
    for (let i = 0; i < 4; i++) {
        const x = -0.3 + i * 0.2;
        g.cone(0.05, 0.2 + i % 2 * 0.08, 3, 0xcdf4ee, { x, y: 0.1, z: 0.5, rx: Math.PI, ao: false });
    }
    for (let i = 0; i < 2; i++) mb.main.oct(0.15, 0xfffbf4, { x: -0.25 + i * 0.5, y: 0.14, z: 0.42, ao: false, j: 0.02 });
}
export function helmCrystal(mb: MB) {
    helmet(mb, { ramp: R.ice, band: R.ice[2], slit: 0x7ae0f4, glowSlit: true, nose: false, h: 0.46 });
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + 0.5;
        spike(mb.glow(0x4ab2cf, 1), 0.3 + i % 2 * 0.12, 0.07, au((_x: number, y: number) => y > 0.85 ? 0xbce8f4 : 0x8ac4e0), { x: Math.cos(a) * 0.3, y: 0.52, z: Math.sin(a) * 0.3, rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3, ao: false }, 4);
    }
    spike(mb.glow(0x4ab2cf, 1.1), 0.4, 0.09, 0xbce8f4, { y: 0.56, ao: false }, 4);
}
export function helmRift(mb: MB) {
    helmet(mb, { ramp: R.violet, band: R.dusk[1], slit: 0x8aeaf8, glowSlit: true, h: 0.48, nose: true });
    for (const s of [-1, 1]) b2(mb.main, s);
    mb.glow(0xb07aff, 1.6).box(0.04, 0.4, 0.05, 0xe8dcff, { y: 0.52, z: 0.12, rx: -0.5, ao: false, v: 0 });
    for (const [x, y, z] of [[0.5, 0.9, 0], [-0.46, 0.8, 0.12]]) glint(mb, x, y, z, 0.04, 0xb07aff, 2.4);
}
export const b2 = (b: Bld, s: number) => {
    b.hull([[s * 0.42, 0.42, 0.08], [s * 0.42, 0.42, -0.08], [s * 0.7, 0.62, 0], [s * 0.78, 0.9, 0], [s * 0.5, 0.64, 0]], R.dusk[2], { j: 0.008, v: 0.06 });
};
export function torso(mb: MB, o: { ramp: number[]; trim: number; belt: number; shiny?: boolean; sleeve?: boolean; neck?: number; wide?: number; }) {
    const b = o.shiny ? mb.shiny() : mb.main, k = o.wide ?? 1;
    const st = [[0.9, 0.24, 0.12], [0.68, 0.4 * k, 0.16], [0.32, 0.3, 0.13], [0.04, 0.36, 0.13]];
    const pts = [];
    for (const [y, x, d] of st) pts.push([x, y, d], [-x, y, d], [x, y, -d], [-x, y, -d]);
    b.hull(pts, hg(o.ramp, 0, 0.9, 0.3), { j: 0.008, v: 0.06 });
    if (o.sleeve !== false) for (const s of [-1, 1]) b.hull([[s * 0.3, 0.9, 0.1], [s * 0.3, 0.9, -0.1], [s * 0.46, 0.84, 0.11], [s * 0.46, 0.84, -0.11], [s * 0.76, 0.52, 0.08], [s * 0.76, 0.52, -0.08], [s * 0.64, 0.42, 0.08], [s * 0.64, 0.42, -0.08]], hg(o.ramp, 0.4, 0.9, 0.3), { j: 0.008, v: 0.06 });
    mb.main.box(0.3, 0.03, 0.16, INK, { y: 0.91, ao: false, v: 0.02 });
    if (o.belt !== undefined) b.box(0.66 * k, 0.07, 0.31, o.belt, { y: 0.3, ao: false, v: 0.04 });
    if (o.trim !== undefined) b.box(0.76, 0.06, 0.3, o.trim, { y: 0.04, ao: false, v: 0.04 });
}
export function tunicCloth(mb: MB) {
    torso(mb, { ramp: R.cream, trim: 0x4ab2cf, belt: R.leather[1] });
    mb.main.box(0.1, 0.4, 0.04, 0x4ab2cf, { y: 0.66, z: 0.19, ao: false, v: 0.03 });
}
export function tunicHide(mb: MB) {
    torso(mb, { ramp: R.leather, trim: R.leather[0], belt: 0x35305c });
    for (let i = 0; i < 3; i++) mb.main.box(0.14, 0.02, 0.02, 0xf4deaa, { y: 0.78 - i * 0.1, z: 0.2, rz: i % 2 ? 0.5 : -0.5, ao: false, v: 0 });
    for (const s of [-1, 1]) mb.main.ico(0.14, 0, R.leather[0], { x: s * 0.46, y: 0.86, sy: 0.55, j: 0.02 });
}
export function mailIron(mb: MB) {
    torso(mb, { ramp: R.iron, belt: R.leather[1], shiny: true, trim: R.iron[0] });
    for (let i = 0; i < 3; i++) mb.main.box(0.6 - i * 0.04, 0.03, 0.02, R.iron[0], { y: 0.78 - i * 0.17, z: 0.17, ao: false, v: 0 });
    for (const s of [-1, 1]) mb.main.oct(0.16, R.iron[1], { x: s * 0.44, y: 0.86, sy: 0.6, j: 0.012 });
}
export function plateSteel(mb: MB) {
    torso(mb, { ramp: R.steel, belt: R.gold[1], shiny: true, trim: R.gold[2], sleeve: false });
    const b = mb.shiny();
    b.hull([[0, 0.88, 0.2], [0.34, 0.8, 0.19], [-0.34, 0.8, 0.19], [0.36, 0.5, 0.22], [-0.36, 0.5, 0.22], [0, 0.3, 0.2], [0, 0.6, 0.27]], hg(R.steel, 0.3, 0.9, 0.3), { j: 0.008, v: 0.07 });
    for (const s of [-1, 1]) {
        b.oct(0.26, hg(R.steel, 0.7, 1, 0.3), { x: s * 0.44, y: 0.84, sx: 1.1, sy: 0.7, sz: 0.9, j: 0.012 });
        b.tube(0.2, 0.2, 0.05, 6, R.gold[2], { x: s * 0.5, y: 0.78, rz: 1.2 * s, ao: false, v: 0.02 });
    }
    for (const x of [-0.18, 0.18]) b.box(0.3, 0.2, 0.05, R.steel[2], { x, y: 0, z: 0.14, rx: -0.12, j: 0.006 });
    mb.main.box(0.16, 0.18, 0.03, R.gold[2], { y: 0.62, z: 0.28, ao: false });
}
export function plateCrystal(mb: MB) {
    torso(mb, { ramp: R.ice, shiny: true, trim: R.ice[3], neck: R.ice[3], belt: R.ice[1] });
    const g = mb.glow(0x4ab2cf, 1);
    for (const s of [-1, 1]) {
        spike(g, 0.36, 0.09, 0x8ac4e0, { x: s * 0.42, y: 0.84, rz: -s * 0.4, ao: false }, 4);
        spike(g, 0.22, 0.06, 0xbce8f4, { x: s * 0.52, y: 0.82, rz: -s * 0.9, ao: false }, 4);
    }
    gem(mb.glow(0x4ab2cf, 1.6), 0.17, 0xbce8f4, { y: 0.6, z: 0.2, rx: 0, ao: false }, 4);
}
export function plateColossus(mb: MB) {
    torso(mb, { ramp: R.stone, wide: 1.1, trim: R.stone[1], belt: R.stone[1], sleeve: false });
    const b = mb.main;
    for (const s of [-1, 1]) {
        b.ico(0.25, 0, hg(R.stone, 0.6, 1.1, 0.5), { x: s * 0.46, y: 0.84, sy: 0.85, ry: s, j: 0.05, v: 0.1 });
        b.oct(0.12, R.moss[1], { x: s * 0.44, y: 1, z: 0.02, sy: 0.4, j: 0.02, ao: false });
    }
    mb.glow(0xf8a24a, 1.5).oct(0.2, au((_x: number, y: number) => y > 0.62 ? 0xffc878 : 0xf8a24a), { y: 0.6, z: 0.2, ao: false, v: 0.06 });
    for (const [x, y, z, rz] of [[-0.24, 0.64, 0.2, 0.5], [0.26, 0.56, 0.2, -0.4]]) mb.glow(0xf8a24a, 1.2).box(0.18, 0.025, 0.03, 0xf8a24a, { x, y, z, rz, ao: false, v: 0 });
}
export function plateRift(mb: MB) {
    torso(mb, { ramp: R.violet, shiny: true, trim: R.dusk[1], belt: R.dusk[1], neck: R.violet[3] });
    const g = mb.glow(0x8aeaf8, 1.8), b = mb.shiny();
    for (const s of [-1, 1]) {
        b.hull([[s * 0.4, 0.82, 0.14], [s * 0.4, 0.82, -0.14], [s * 0.66, 0.84, 0], [s * 0.7, 0.62, 0], [s * 0.46, 0.7, 0.16]], R.violet[2], { j: 0.008, v: 0.07 });
        g.box(0.03, 0.2, 0.03, 0xe8fbff, { x: s * 0.57, y: 0.78, z: 0.05, rz: s * 0.5, ao: false, v: 0 });
    }
    g.box(0.03, 0.5, 0.03, 0xe8fbff, { x: 0, y: 0.58, z: 0.21, rz: 0.1, ao: false, v: 0 });
    g.box(0.03, 0.3, 0.03, 0xe8fbff, { x: 0.12, y: 0.52, z: 0.21, rz: -0.8, ao: false, v: 0 });
    mb.glow(0xb07aff, 1.8).oct(0.09, 0xe8dcff, { y: 0.62, z: 0.22, sy: 1.5, ao: false });
    glint(mb, -0.34, 0.2, 0.2, 0.04, 0xb07aff, 2.4);
}
export function cloakShroud(mb: MB) {
    const b = mb.main, V = R.violet;
    const hem = [[-0.5, 0], [-0.3, 0.1], [-0.12, -0.02], [0.1, 0.1], [0.3, -0.02], [0.5, 0.06]];
    b.hull([[0, 0.98, 0], [-0.22, 0.84, 0.14], [0.22, 0.84, 0.14], [-0.22, 0.84, -0.14], [0.22, 0.84, -0.14], [-0.34, 0.62, 0.2], [0.34, 0.62, 0.2], ...hem.map(([x, y]) => [x, y, 0.18]), ...hem.map(([x, y]) => [x, y, -0.12])], hg([V[0], V[1], V[2], V[3]], 0, 0.95, 0.35), { j: 0.012, v: 0.07 });
    b.hull([[-0.16, 0.8, 0.1], [0.16, 0.8, 0.1], [-0.14, 0.58, 0.19], [0.14, 0.58, 0.19], [0, 0.82, 0.14]], 0x2a1d2c, { ao: false, v: 0.02 });
    b.cone(0.1, 0.18, 5, V[2], { y: 0.98, rx: 0.3, ao: false, v: 0.04 });
    for (const x of [-0.3, -0.05, 0.22]) b.box(0.07, 0.4, 0.03, V[0], { x, y: 0.3, z: 0.2, rz: x * -0.3, ao: false });
    mb.glow(0xbdf4ee, 1.6).oct(0.06, 0xbdf4ee, { y: 0.64, z: 0.2, sy: 1.3, ao: false });
    for (const [x, y] of [[-0.4, 0.06], [0.36, 0.1]]) glint(mb, x, y, 0.2, 0.04, 0xbdf4ee, 1.8);
}
export function loop(mb: MB, cord: Col, yc = 0.68) {
    mb.main.torus(0.3, 0.04, 3, 9, cord, { y: yc, ao: false, v: 0.05 });
}
export function charmLucky(mb: MB) {
    loop(mb, 0x6a402f);
    const b = mb.shiny(), G = R.gold;
    b.cyl(0.28, 0.28, 0.08, 7, G[2], { y: 0.22, rx: Math.PI / 2, v: 0.05 });
    b.cyl(0.2, 0.2, 0.1, 7, G[1], { y: 0.22, rx: Math.PI / 2, ao: false, v: 0.05 });
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + Math.PI / 4;
        mb.glow(0x5cb04f, 1).oct(0.1, i % 2 ? 0x92d364 : 0x5cb04f, { x: Math.cos(a) * 0.09, y: 0.22 + Math.sin(a) * 0.09, z: 0.07, sx: 1.2, sy: 1.2, sz: 0.5, ao: false, v: 0.06 });
    }
    b.oct(0.06, G[3], { y: 0.5, ao: false });
}
export function charmSwift(mb: MB) {
    loop(mb, 0x4a475c);
    const b = mb.main;
    b.hull([[0, 0.5, 0.035], [0, 0.5, -0.035], [0.28, 0.36, 0], [0.3, 0.14, 0], [0.08, -0.06, 0], [-0.16, 0.18, 0], [-0.14, 0.38, 0]], hg([0x2d6ea6, 0x4ab2cf, 0x9be0e8, 0xf4fbff], -0.05, 0.5, 0.3), { x: -0.04, j: 0.01, v: 0.06 });
    b.rod([-0.04, 0.52, 0], [0.04, -0.08, 0], 0.022, 3, 0xfff6e0, 0.012, { ao: false });
    for (let i = 0; i < 3; i++) b.box(0.16, 0.014, 0.02, 0xf4fbff, { x: 0.04, y: 0.34 - i * 0.08, z: 0.04, rz: 0.5, ao: false, v: 0 });
}
export function charmVital(mb: MB) {
    loop(mb, 0x6a402f);
    const b = mb.main;
    b.cyl(0.07, 0.07, 0.05, 5, R.gold[2], { y: 0.54, rx: Math.PI / 2, ao: false });
    heart(mb.glow(0xf0a020, 1), 0.88, au((_x: number, y: number) => y > 0.3 ? 0xffc040 : 0xe0901a), { y: 0.24, ao: false, v: 0.06 });
    glint(mb, -0.1, 0.38, 0.14, 0.04, 0xfff3b0, 2.4);
}
export function charmHex(mb: MB) {
    loop(mb, 0x2d6a50);
    const b = mb.shiny(), G = R.green;
    b.cyl(0.27, 0.27, 0.08, 6, G[0], { y: 0.26, rx: Math.PI / 2, ao: false, v: 0.05 });
    b.cyl(0.2, 0.2, 0.1, 6, G[1], { y: 0.26, rx: Math.PI / 2, ao: false, v: 0.05 });
    mb.glow(0x92d364, 2).oct(0.14, 0xd4f08a, { y: 0.26, z: 0.06, sx: 1.4, sy: 0.7, sz: 0.5, ao: false, v: 0.05 });
    mb.main.oct(0.04, INK, { y: 0.26, z: 0.11, sy: 2.2, ao: false });
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + Math.PI / 4;
        mb.main.oct(0.07, G[2], { x: Math.cos(a) * 0.33, y: 0.26 + Math.sin(a) * 0.33, sy: 1.6, rz: a - Math.PI / 2, ao: false });
    }
}
export function charmScarab(mb: MB) {
    loop(mb, 0x6a402f);
    const b = mb.shiny(), T = R.teal;
    for (const s of [-1, 1]) {
        b.ico(0.17, 0, hg([T[0], T[1], T[2], 0xcdf4ee], 0.1, 0.45, 0.3), { x: s * 0.095, y: 0.24, sx: 0.62, sy: 1, sz: 0.55, ry: 0, j: 0.008, v: 0.07 });
        b.rod([s * 0.14, 0.2, 0], [s * 0.3, 0.12, 0], 0.018, 3, R.gold[2], undefined, { ao: false });
    }
    b.oct(0.09, R.gold[2], { y: 0.45, z: 0, j: 0.005 });
    mb.glow(0xffd966, 1).oct(0.04, 0xffd966, { y: 0.27, z: 0.1, sy: 1.5, ao: false });
}
export function charmRift(mb: MB) {
    loop(mb, 0x35305c);
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5;
        mb.main.oct(0.06, R.dusk[2], { x: Math.cos(a) * 0.19, y: 0.26 + Math.sin(a) * 0.19, sy: 2.2, rz: a - Math.PI / 2, ao: false });
    }
    spike(mb.glow(0xb07aff, 1.7), 0.5, 0.12, au((_x: number, y: number) => y > 0.4 ? 0xe8dcff : 0xbba0ee), { y: 0, rx: 0, ao: false, v: 0.1 }, 5);
    glint(mb, 0.16, 0.5, 0.1, 0.04, 0x8aeaf8, 2.4);
    mb.glow(0x8aeaf8, 1.6).oct(0.045, 0xe8fbff, { y: 0.52, z: 0.1, sy: 1.4, ao: false });
}
export function charmHeart(mb: MB) {
    loop(mb, R.gold[1].valueOf());
    const b = mb.shiny();
    heart(mb.glow(0xe8503f, 1.1), 0.95, au((_x: number, y: number) => y > 0.3 ? 0xff6a58 : 0xc9304a), { y: 0.24, ao: false, v: 0.08 });
    b.cyl(0.08, 0.08, 0.06, 5, R.gold[2], { y: 0.56, rx: Math.PI / 2, ao: false });
    glint(mb, -0.14, 0.4, 0.14, 0.04, 0xfff6e0, 1.8);
}
export function charmFortune(mb: MB) {
    const b = mb.shiny(), G = R.gold;
    b.tube(0.1, 0.12, 0.1, 5, G[2], { y: 0.98, ao: false });
    b.cone(0.3, 0.2, 6, G[1], { y: 0.78, j: 0.008 });
    b.cyl(0.3, 0.3, 0.07, 6, G[2], { y: 0.66, ao: false });
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + Math.PI / 4;
        b.box(0.06, 0.52, 0.06, G[2], { x: Math.cos(a) * 0.28, y: 0.36, z: Math.sin(a) * 0.28, ao: false, v: 0.04 });
    }
    b.cyl(0.3, 0.26, 0.1, 6, G[1], { y: 0.04, j: 0.006 });
    mb.glow(0xffc030, 1.4).oct(0.25, au((_x: number, y: number) => y > 0.4 ? 0xffe070 : 0xffc030), { y: 0.36, sy: 1.5, ao: false, v: 0.06 });
}
export function satchel(mb: MB) {
    const b = mb.main, L = R.leather;
    b.box(0.82, 0.5, 0.3, hg(L, 0, 0.6, 0.3), { y: 0.3, j: 0.012, v: 0.06 });
    b.hull([[-0.43, 0.56, 0.17], [0.43, 0.56, 0.17], [-0.43, 0.56, -0.15], [0.43, 0.56, -0.15], [-0.4, 0.28, 0.2], [0.4, 0.28, 0.2]], L[3], { j: 0.012, v: 0.06 });
    b.box(0.1, 0.14, 0.04, R.gold[2], { y: 0.34, z: 0.2, ao: false });
    b.box(0.74, 0.03, 0.03, L[0], { y: 0.54, z: 0.2, ao: false });
    curve(b, [[-0.38, 0.55, 0], [-0.34, 0.86, 0], [0, 1, 0], [0.34, 0.86, 0], [0.38, 0.55, 0]], 0.04, 0.04, 4, L[0], { v: 0.05 });
    b.box(0.5, 0.025, 0.26, L[0], { y: 0.07, ao: false });
}
export function rucksack(mb: MB) {
    const b = mb.main, L = [0x7a4a2a, 0xa8703f, 0xd49a62, 0xe8b878];
    b.lathe([[0, 0], [0.34, 0], [0.44, 0.1], [0.44, 0.58], [0.34, 0.76]], 7, hg(L, 0, 0.8, 0.3), { j: 0.015, v: 0.06 });
    b.cone(0.4, 0.2, 7, L[2], { y: 0.78, j: 0.012, v: 0.05 });
    for (const s of [-1, 1]) b.box(0.22, 0.28, 0.14, L[1], { x: s * 0.2, y: 0.22, z: 0.4, j: 0.01, v: 0.06 });
    b.box(0.66, 0.04, 0.04, 0x4a2f2a, { y: 0.46, z: 0.46, ao: false });
    b.box(0.1, 0.12, 0.04, R.gold[2], { y: 0.46, z: 0.5, ao: false });
    curve(b, [[-0.3, 0.7, 0.28], [-0.5, 0.35, 0.24]], 0.045, 0.045, 3, 0x4a2f2a);
    curve(b, [[0.3, 0.7, 0.28], [0.5, 0.35, 0.24]], 0.045, 0.045, 3, 0x4a2f2a);
    b.box(0.12, 0.08, 0.12, 0x4a2f2a, { y: 0.97 });
}
export function packExplorer(mb: MB) {
    const b = mb.main, C = [0x2d6ea6, 0x3a94b8, 0x6ac6d8, 0xcdf4ee];
    b.box(0.74, 0.74, 0.44, hg(C, 0.1, 0.9, 0.3), { y: 0.5, j: 0.012, v: 0.06 });
    b.hull([[-0.38, 0.88, 0.24], [0.38, 0.88, 0.24], [-0.38, 0.88, -0.2], [0.38, 0.88, -0.2], [-0.4, 0.64, 0.28], [0.4, 0.64, 0.28], [0, 1, 0]], C[2], { j: 0.012, v: 0.06 });
    b.cyl(0.14, 0.14, 0.82, 6, 0xe85d62, { y: 0, rz: Math.PI / 2, rx: 0, j: 0.012, v: 0.06 });
    for (const x of [-0.24, 0.24]) b.tube(0.15, 0.15, 0.06, 6, 0xf4deaa, { x, y: 0, rz: Math.PI / 2, ao: false });
    for (const s of [-1, 1]) b.box(0.2, 0.3, 0.14, C[1], { x: s * 0.46, y: 0.34, z: 0.1, j: 0.01, v: 0.05 });
    for (const x of [-0.18, 0.18]) {
        b.box(0.06, 0.4, 0.03, 0x4a2f2a, { x, y: 0.5, z: 0.24, ao: false });
        b.box(0.08, 0.07, 0.04, R.iron[2], { x, y: 0.4, z: 0.26, ao: false });
    }
    b.box(0.4, 0.14, 0.03, R.gold[1], { y: 0.74, z: 0.25, ao: false });
}
export function packFrame(mb: MB) {
    const b = mb.shiny(), I = R.iron;
    for (const s of [-1, 1]) b.rod([s * 0.38, 0, 0], [s * 0.38, 1, 0], 0.045, 4, I[1], 0.045, { v: 0.05 });
    for (const y of [0, 1]) b.rod([-0.38, y, 0], [0.38, y, 0], 0.04, 4, I[2], 0.04, { v: 0.05 });
    mb.main.box(0.6, 0.38, 0.34, hg(R.wood, 0.2, 0.7, 0.3), { y: 0.36, z: 0.1, j: 0.01, v: 0.06 });
    mb.main.box(0.06, 0.42, 0.37, R.leather[1], { x: -0.18, y: 0.36, z: 0.1, ao: false });
    mb.main.box(0.06, 0.42, 0.37, R.leather[1], { x: 0.18, y: 0.36, z: 0.1, ao: false });
    mb.main.cyl(0.2, 0.2, 0.5, 6, 0xe85d62, { y: 0.78, z: 0.04, rz: Math.PI / 2, j: 0.01, v: 0.06 });
    mb.main.rod([-0.3, 0.9, 0.2], [-0.45, 0.4, 0.32], 0.045, 3, R.leather[0], 0.045);
    mb.main.rod([0.3, 0.9, 0.2], [0.45, 0.4, 0.32], 0.045, 3, R.leather[0], 0.045);
}
export function packRift(mb: MB) {
    const b = mb.shiny(), V = R.violet;
    b.lathe([[0, 0], [0.34, 0], [0.46, 0.1], [0.46, 0.56], [0.36, 0.74]], 6, hg(V, 0, 0.8, 0.3), { j: 0.015, v: 0.07 });
    b.cone(0.42, 0.22, 6, V[2], { y: 0.76, j: 0.012, v: 0.06 });
    mb.glow(0x4ab2cf, 1.4).torus(0.18, 0.035, 3, 6, 0x8aeaf8, { y: 0.44, z: 0.45, ao: false });
    mb.glow(0xb07aff, 1.6).oct(0.08, 0xe8dcff, { y: 0.44, z: 0.47, sy: 1.5, ao: false });
    mb.main.rod([-0.3, 0.7, 0.26], [-0.5, 0.35, 0.24], 0.045, 3, R.dusk[0], 0.045);
    mb.main.rod([0.3, 0.7, 0.26], [0.5, 0.35, 0.24], 0.045, 3, R.dusk[0], 0.045);
    b.box(0.2, 0.28, 0.12, R.dusk[1], { x: 0.26, y: 0.2, z: 0.4, j: 0.01 });
    glint(mb, 0.52, 0.86, 0.1, 0.045, 0xb07aff, 1.6);
}
export const ARMOR: Record<string, DropSpec> = {
    cap_cloth: S(capCloth, { lean: 0.2 }),
    cap_hide: S(capHide, { lean: 0.2 }),
    helm_iron: S((mb: MB) => helmet(mb, { ramp: R.iron, band: R.iron[0], nose: true, rivets: 8 }), { lean: 0.2 }),
    helm_steel: S((mb: MB) => helmet(mb, { ramp: R.steel, band: R.gold[1], nose: true, cheeks: true, crest: R.gold, plume: 0xe85d62, rivets: 8 }), { lean: 0.2 }),
    helm_crystal: S(helmCrystal, { lean: 0.2 }),
    helm_frost: S(helmFrost, { lean: 0.2 }),
    helm_rift: S(helmRift, { lean: 0.2 }),
    crown_slime: S(crownSlime, { lean: 0.25 }),
    tunic_cloth: S(tunicCloth, { lean: 0.9 }),
    tunic_hide: S(tunicHide, { lean: 0.9 }),
    mail_iron: S(mailIron, { lean: 0.9 }),
    plate_steel: S(plateSteel, { lean: 0.9 }),
    cloak_shroud: S(cloakShroud, { lean: 0.9 }),
    plate_crystal: S(plateCrystal, { lean: 0.9 }),
    plate_colossus: S(plateColossus, { lean: 0.9 }),
    plate_rift: S(plateRift, { lean: 0.9 }),
    charm_lucky: S(charmLucky, { lean: 0.9 }),
    charm_swift: S(charmSwift, { lean: 0.9 }),
    charm_vital: S(charmVital, { lean: 0.9, pulse: true }),
    charm_hex: S(charmHex, { lean: 0.9 }),
    charm_scarab: S(charmScarab, { lean: 0.9 }),
    charm_rift: S(charmRift, { lean: 0.9, spark: 0xb07aff }),
    charm_heart: S(charmHeart, { lean: 0.9, pulse: true, spark: 0xff8a7a }),
    charm_fortune: S(charmFortune, { lean: 0.4, turn: 'spin', spark: 0xffe680 }),
    bag_satchel: S(satchel, { lean: 0.45 }),
    bag_rucksack: S(rucksack, { lean: 0.45 }),
    bag_pack: S(packExplorer, { lean: 0.45 }),
    bag_frame: S(packFrame, { lean: 0.45 }),
    bag_rift: S(packRift, { lean: 0.45, spark: 0xb07aff })
};
