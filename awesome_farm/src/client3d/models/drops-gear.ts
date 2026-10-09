// Loot models: picks and weapons.
import { au, curve, type DropSpec, glint, INK, R, spike } from './drops-shapes';
import { Bld, Col, MB, mix, type Pt, TAU, type Xf } from './kit';

export const ICE2 = [0x3a6a9a, 0x5a8fb8, 0x8ac4e0, 0xbce8f4];
export const gearSpec = (build: (mb: MB) => void, o: Partial<DropSpec> = {}): DropSpec => ({ build, turn: 'sway', lean: 0.95, diag: 0.7, ...o });
export function blade(b: Bld, y0: number, len: number, w: number, th: number, c: Col, t = {}) {
    b.hull([[0, y0, th * 0.9], [0, y0, -th * 0.9], [w, y0 + len * 0.05, 0], [-w, y0 + len * 0.05, 0], [w, y0 + len * 0.76, 0], [-w, y0 + len * 0.76, 0], [0, y0 + len * 0.78, th], [0, y0 + len * 0.78, -th], [0, y0 + len, 0]], c, { v: 0.07, ...t });
}
export function strip(b: Bld, st: Pt[], th: number, c: Col, t: Xf = {}) {
    const edge = (i: number) => {
        const a = st[Math.max(0, i - 1)], d = st[Math.min(st.length - 1, i + 1)];
        let dx = d[0] - a[0], dy = d[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        const nx = -dy, ny = dx, [x, y, w] = st[i];
        return [[x + nx * w, y + ny * w, 0], [x - nx * w * 0.35, y - ny * w * 0.35, 0]];
    };
    for (let i = 0; i < st.length - 1; i++) {
        const [a1, a2] = edge(i), [b1, b2] = edge(i + 1), pts = [];
        for (const p of [a1, a2, b1, b2]) pts.push([p[0], p[1], th], [p[0], p[1], -th]);
        b.hull(pts, c, { v: 0.07, ...t });
    }
}
export const grip = (b: Bld, y0: number, y1: number, c: number, r = 0.05) => {
    b.rod([0, y0, 0], [0, y1, 0], r, 5, c, r, { j: 0.006 });
    for (let i = 0; i < 2; i++) b.tube(r * 1.3, r * 1.3, 0.03, 5, mix(c, 0x2a1d2c, 0.3), { y: y0 + (y1 - y0) * (0.3 + i * 0.4), ao: false, v: 0.02 });
};
export function pick(mb: MB, o: { head: number[]; flint?: boolean; shaft?: number[]; ferrule?: number; glow?: number[]; }) {
    const b = mb.main, W = o.shaft ?? R.wood, h = o.head;
    b.rod([0, 0, 0], [0, 1, 0], 0.045, 5, au((_x: number, y: number) => W[1 + (y > 0.5 ? 1 : 0)]), 0.04, { j: 0.01 });
    grip(b, 0.06, 0.34, W[0], 0.05);
    const hb = o.glow ? mb.glow(o.glow[0], o.glow[1]) : mb.shiny();
    if (o.flint) {
        hb.hull([[-0.5, 0.78, 0.06], [-0.5, 0.78, -0.06], [-0.2, 1, 0.09], [-0.2, 1, -0.09], [0, 0.86, 0.1], [0, 0.86, -0.1], [0.3, 0.98, 0.07], [0.3, 0.98, -0.07], [0.52, 0.78, 0.03], [0.52, 0.78, -0.03], [-0.1, 0.78, 0.07], [-0.1, 0.78, -0.07]], au((_x: number, y: number, _z: number) => y > 0.92 ? h[2] : h[1]), { j: 0.02, v: 0.12 });
        b.box(0.24, 0.05, 0.2, R.sand[1], { y: 0.9, rz: 0.1, ao: false });
    } else {
        for (const s of [-1, 1]) {
            hb.hull(
                [[s * 0.06, 0.99, 0.065], [s * 0.06, 0.99, -0.065], [s * 0.06, 0.82, 0.065], [s * 0.06, 0.82, -0.065], [s * 0.34, 0.97, 0.045], [s * 0.34, 0.97, -0.045], [s * 0.3, 0.88, 0.04], [s * 0.3, 0.88, -0.04], [s * 0.54, 0.74, 0]],
                au((_x: number, y: number) => y > 0.93 ? h[3] : y > 0.85 ? h[2] : h[1]),
                { v: 0.07 }
            );
        }
        hb.box(0.2, 0.2, 0.16, h[2], { y: 0.9, j: 0.006 });
    }
    b.box(0.14, 0.05, 0.12, o.ferrule ?? R.iron[0], { y: 0.78, ao: false });
}
export function sword(mb: MB, o: { ramp: number[]; guard: number[]; grip: number; len?: number; gem?: number; pommel?: number; glowBlade?: number[]; wide?: boolean; w?: number; }) {
    const len = o.len ?? 0.6, w = o.w ?? 0.085, b = mb.main;
    const bb = o.glowBlade ? mb.glow(o.glowBlade[0], o.glowBlade[1]) : mb.shiny();
    blade(bb, 0.4, len, w, 0.035, au((_x: number, _y: number, z: number) => z > 0 ? o.ramp[2] : o.ramp[1]), { ao: false });
    bb.box(0.03, len * 0.6, 0.08, o.ramp[3], { y: 0.46 + len * 0.3, ao: false, v: 0.03 });
    const gc = o.guard;
    b.box(o.wide ? 0.5 : 0.4, 0.07, 0.1, gc[2], { y: 0.37, j: 0.006 });
    for (const s of [-1, 1]) b.oct(0.065, gc[2], { x: s * (o.wide ? 0.25 : 0.2), y: 0.37, j: 0.004 });
    grip(b, 0.14, 0.36, o.grip, 0.05);
    b.oct(0.085, o.pommel ?? gc[2], { y: 0.1, j: 0.006 });
    if (o.gem) mb.glow(o.gem, 1.6).oct(0.05, o.gem, { y: 0.37, z: 0.06, sy: 1.3, ao: false, v: 0.05 });
}
export function khopesh(mb: MB) {
    const b = mb.main, G = R.gold, bb = mb.shiny();
    strip(bb, [[0, 0.4, 0.07], [0.02, 0.62, 0.09], [0.14, 0.8, 0.09], [0.36, 0.92, 0.08], [0.55, 0.86, 0.055], [0.62, 0.76, 0.03]], 0.032, au((_x: number, y: number) => y > 0.8 ? G[3] : G[2]), { ao: false });
    b.box(0.34, 0.07, 0.11, G[1], { y: 0.37, j: 0.006 });
    for (const s of [-1, 1]) b.oct(0.065, G[2], { x: s * 0.17, y: 0.37 });
    grip(b, 0.12, 0.36, 0x6a402f, 0.05);
    b.oct(0.095, G[2], { y: 0.08, j: 0.006 });
    mb.glow(0x4ab2cf, 1.6).oct(0.055, 0x4ab2cf, { y: 0.37, z: 0.07, sy: 1.3, ao: false });
}
export function dagger(mb: MB, o: { ramp: number[]; len: number; w: number; grip: number; guard: number; bone?: boolean; gem?: number; }) {
    const b = mb.main, bb = mb.shiny();
    blade(bb, 0.34, o.len, o.w, 0.03, au((_x: number, _y: number, z: number) => z > 0 ? o.ramp[2] : o.ramp[1]), { ao: false });
    if (o.bone) for (const s of [-1, 1]) for (let i = 0; i < 2; i++) b.tet(0.04, o.ramp[3], { x: s * o.w, y: 0.5 + i * 0.12, ry: i, ao: false });
    b.box(0.26, 0.06, 0.09, o.guard, { y: 0.31, j: 0.005 });
    grip(b, 0.1, 0.3, o.grip, 0.045);
    b.oct(0.07, o.guard, { y: 0.07 });
    if (o.gem) mb.glow(o.gem, 1.6).oct(0.045, o.gem, { y: 0.07, z: 0.04, sy: 1.2, ao: false });
}
export function spear(mb: MB, o: { ramp: number[]; len: number; w: number; tassel: number; gold?: boolean; }) {
    const b = mb.main, W = R.wood;
    b.rod([0, 0, 0], [0, 0.78, 0], 0.04, 5, au((_x: number, y: number) => W[1 + (y > 0.4 ? 1 : 0)]), 0.037, { j: 0.008 });
    const hb = mb.shiny();
    hb.hull([[0, 0.7, 0.045], [0, 0.7, -0.045], [o.w, 0.78, 0], [-o.w, 0.78, 0], [0, 0.8, 0.05], [0, 0.8, -0.05], [0, 0.78 + o.len, 0]], au((_x: number, _y: number, z: number) => z > 0 ? o.ramp[2] : o.ramp[1]), { ao: false, v: 0.07 });
    b.cyl(0.055, 0.045, 0.1, 5, o.gold ? R.gold[2] : o.ramp[0], { y: 0.7, ao: false });
    b.cyl(0.055, 0.055, 0.04, 5, R.sand[2], { y: 0.6, ao: false });
    b.cyl(0.055, 0.055, 0.04, 5, R.sand[1], { y: 0.56, ao: false });
    b.hull([[0, 0.66, 0.03], [0, 0.66, -0.03], [0.2, 0.46, 0], [0.04, 0.5, 0], [0.1, 0.4, 0.02]], o.tassel, { j: 0.01, ao: false });
    b.hull([[0, 0.66, 0.03], [0, 0.66, -0.03], [-0.2, 0.5, 0], [-0.04, 0.46, 0]], mix(o.tassel, 0x2a1d2c, 0.15), { j: 0.01, ao: false });
    b.cone(0.05, 0.1, 5, o.ramp[0], { y: -0.04, rx: Math.PI });
}
export function hammer(mb: MB, o: { ramp: number[]; head: number[]; band: number; spike?: boolean; stone?: boolean; shaft?: number[]; cracks?: number; }) {
    const b = mb.main, W = o.shaft ?? R.wood, [hw, hh, hd] = o.head;
    b.rod([0, 0, 0], [0, 0.9, 0], o.stone ? 0.055 : 0.042, 5, au((_x: number, y: number) => W[1 + (y > 0.45 ? 1 : 0)]), o.stone ? 0.05 : 0.04, { j: 0.01 });
    grip(b, 0.04, 0.3, W[0], o.stone ? 0.06 : 0.05);
    const hb = o.stone ? b : mb.shiny();
    if (o.stone) {
        hb.dode(hw * 0.52, au((x: number, y: number) => y > 0.84 ? R.stone[4] : R.stone[3 - (x > 0 ? 1 : 0)]), { y: 0.82, sx: 1.25, sy: 0.9, sz: 0.85, ry: 0.4, j: 0.07, v: 0.1 });
        b.oct(0.2, R.moss[1], { x: -0.1, y: 1, z: 0.06, sy: 0.35, j: 0.04, ao: false });
        for (const [x, y, z] of [[-0.36, 0.84, 0.28], [-0.1, 0.9, 0.34], [0.3, 0.85, 0.26]]) mb.glow(o.cracks ?? 0xf8a24a, 1.4).box(0.14, 0.03, 0.03, o.cracks ?? 0xf8a24a, { x, y, z, rz: x * 2, ao: false, v: 0 });
    } else {
        hb.box(hw, hh, hd, au((_x: number, y: number) => y > 0.84 ? o.ramp[3] : o.ramp[2]), { y: 0.84, j: 0.006, v: 0.06 });
        for (const s of [-1, 1]) {
            hb.box(0.06, hh * 1.08, hd * 1.08, o.band, { x: s * (hw / 2 - 0.02), y: 0.84, ao: false, v: 0.03 });
        }
        hb.box(0.08, hh * 1.1, hd * 1.1, o.band, { y: 0.84, ao: false, v: 0.03 });
        if (o.spike) b.cone(0.1, 0.24, 5, o.ramp[1], { x: hw / 2 + 0.1, y: 0.84, rz: -Math.PI / 2, j: 0.01 });
    }
}
export function bow(mb: MB, o: { limb: number[]; tip: number; string: number; scale?: number; glow?: number[]; frost?: boolean; }) {
    const b = mb.main, sc = o.scale ?? 1, S = (x: number, y: number) => [x * sc, 0.5 + (y - 0.5) * sc, 0];
    const pts = [S(0.14, 1), S(-0.06, 0.78), S(-0.2, 0.5), S(-0.06, 0.22), S(0.14, 0)];
    const lb = o.glow ? mb.glow(o.glow[0], o.glow[1]) : mb.main;
    for (let i = 0; i < pts.length - 1; i++) {
        const k = 1 - Math.abs(i - 1.5) / 2.2, k2 = 1 - Math.abs(i + 1 - 1.5) / 2.2;
        lb.rod(pts[i], pts[i + 1], (0.034 + 0.026 * k) * sc, 4, au((_x: number, y: number) => y > 0.5 ? o.limb[2] : o.limb[1]), (0.034 + 0.026 * k2) * sc, { v: 0.07, ao: false });
    }
    b.box(0.1, 0.2 * sc, 0.1, 0x6a402f, { x: -0.2 * sc, y: 0.5, ao: false, v: 0.05 });
    b.rod(S(0.14, 1), S(0.14, 0), 0.012 * sc, 3, o.string, 0.012 * sc, { ao: false });
    for (const y of [1, 0]) b.oct(0.055 * sc, o.tip, { x: 0.14 * sc, y: 0.5 + (y - 0.5) * sc, j: 0.004 });
    b.rod([0.14 * sc, 0.5, 0], [0.62 * sc, 0.5, 0], 0.014, 3, R.wood[3], 0.014, { ao: false });
    b.cone(0.04, 0.1, 4, R.iron[2], { x: 0.64 * sc, y: 0.5, rz: -Math.PI / 2, ao: false });
    if (o.frost) for (const [x, y] of [[-0.12, 0.7], [0, 0.9]]) spike(mb.glow(0xcdf4ee, 1.2), 0.16, 0.04, 0xe8fbff, { x, y, rz: -0.8, ao: false }, 4);
}
export function staff(mb: MB, o: { shaft: number[]; kind: string; crooked?: boolean; }) {
    const b = mb.main, W = o.shaft;
    if (o.crooked) curve(b, [[0, 0, 0], [0.06, 0.3, 0], [-0.04, 0.58, 0], [0, 0.8, 0]], 0.045, 0.036, 4, W[2], { j: 0.012 });
    else b.rod([0, 0, 0], [0, 0.8, 0], 0.045, 5, au((_x: number, y: number) => W[1 + (y > 0.4 ? 1 : 0)]), 0.038, { j: 0.01 });
    if (o.kind === 'crystal') {
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * TAU + 0.5;
            b.rod([0, 0.78, 0], [Math.cos(a) * 0.13, 0.93, Math.sin(a) * 0.13], 0.025, 4, R.iron[1], 0.018, { ao: false });
        }
        spike(mb.glow(0x4ab2cf, 1), 0.5, 0.11, au((_x: number, y: number) => y > 1.1 ? 0xbce8f4 : y > 0.95 ? 0x8ac4e0 : 0x5a8fb8), { y: 0.84, j: 0.008, ao: false, v: 0.09 }, 5);
        spike(mb.glow(0x4ab2cf, 1), 0.22, 0.06, 0x8ac4e0, { x: 0.13, y: 0.86, rz: -0.6, ao: false }, 4);
        glint(mb, -0.12, 1.2, 0.08, 0.04, 0xffffff, 2.4);
    } else if (o.kind === 'bead') {
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * TAU + 0.5;
            b.rod([0, 0.76, 0], [Math.cos(a) * 0.15, 0.9, Math.sin(a) * 0.15], 0.022, 3, W[0], 0.018, { ao: false });
        }
        mb.glow(0x4ab2cf, 1).ico(0.16, 0, au((_x: number, y: number) => y > 1 ? 0xcdf4ee : 0x6ad8e8), { y: 0.98, ao: false, v: 0.06 });
        b.ico(0.04, 0, 0xf79fc6, { x: 0.06, y: 0.5, z: 0.04, ao: false });
    } else if (o.kind === 'slime') {
        mb.shiny().ico(0.2, 0, au((_x: number, y: number) => y > 1 ? 0xbba0ee : 0x9d6fdb), { y: 0.98, sy: 1.1, j: 0.03, v: 0.07 });
        mb.glow(0xb07aff, 1.2).ico(0.1, 0, 0xe8dcff, { y: 0.98, ao: false, v: 0.05 });
        for (const [x, y] of [[0.14, 0.78], [-0.1, 0.72]]) mb.shiny().ico(0.06, 0, 0x9d6fdb, { x, y, sy: 1.4, j: 0.01 });
        glint(mb, -0.08, 1.1, 0.12, 0.04, 0xffffff, 2.2);
    } else {
        curve(b, [[0, 0.76, 0], [0.16, 0.92, 0], [0.12, 1.1, 0]], 0.04, 0.025, 3, W[1], { j: 0.008 });
        curve(b, [[0, 0.76, 0], [-0.16, 0.96, 0]], 0.035, 0.022, 3, W[1], { j: 0.008 });
        mb.glow(0x92d364, 1.9).ico(0.12, 0, 0xd4f08a, { x: 0, y: 1.02, ao: false, v: 0.06 });
        mb.main.oct(0.035, INK, { x: 0, y: 1.02, z: 0.1, sy: 2.4, ao: false });
        for (const [x, y, c] of [[-0.12, 0.62, 0xf4f0e2], [0.08, 0.5, 0xfff6e0]]) b.oct(0.05, c, { x, y, z: 0.04, ao: false });
    }
}
export const ironSword = gearSpec((mb: MB) => sword(mb, { ramp: R.iron, guard: [R.iron[0], R.iron[1], R.iron[2]], grip: 0x7a4a2a }));
export const GEAR: Record<string, DropSpec> = {
    pick_flint: gearSpec((mb: MB) => pick(mb, { head: [R.stone[1], R.stone[2], 0x9ea4bf, R.stone[3]], flint: true, shaft: [0x4a2f2a, 0x6a432f, 0x8f5a36] })),
    pick_iron: gearSpec((mb: MB) => pick(mb, { head: R.iron })),
    pick_gold: gearSpec((mb: MB) => pick(mb, { head: R.gold, ferrule: R.gold[1] })),
    pick_crystal: gearSpec((mb: MB) => pick(mb, { head: ICE2, glow: [0x4ab2cf, 0.9], ferrule: R.ice[1] })),
    club: gearSpec((mb: MB) => {
        const b = mb.main, W = R.wood;
        b.cyl(0.2, 0.07, 0.8, 7, au((_x: number, y: number) => W[y > 0.55 ? 3 : 2]), { y: 0.5, j: 0.03, v: 0.1 });
        b.cyl(0.215, 0.215, 0.05, 7, W[4], { y: 0.9, ao: false, j: 0.01 });
        b.cyl(0.055, 0.055, 0.2, 5, W[1], { y: 0.12, j: 0.008 });
        for (const [x, y] of [[0.12, 0.7], [-0.1, 0.78], [0.04, 0.56]]) b.cone(0.035, 0.08, 4, W[1], { x, y, z: 0.15, rx: 1.3, ao: false });
        b.ico(0.07, 0, W[1], { y: 0.04 });
    }, { diag: 0.6 }),
    sword_iron: ironSword,
    sword_steel: gearSpec((mb: MB) => sword(mb, { ramp: R.steel, len: 0.66, guard: R.gold, grip: 0x2e3a5c, gem: 0xf79fc6, pommel: R.gold[2] })),
    sword_crystal: gearSpec((mb: MB) => sword(mb, { ramp: ICE2, len: 0.68, guard: R.ice, grip: 0x5a8fb8, glowBlade: [0x4ab2cf, 0.9], wide: true, gem: 0x7ae0f4 })),
    sword_pharaoh: gearSpec(khopesh),
    sword_rift: gearSpec((mb: MB) => {
        sword(mb, { ramp: R.violet, len: 0.72, guard: R.dusk, grip: 0x35305c, glowBlade: [0x9d6fdb, 0.9], wide: true, gem: 0x8aeaf8, pommel: 0x8aeaf8 });
        for (const s of [-1, 1]) spike(mb.main, 0.2, 0.05, R.dusk[2], { x: s * 0.27, y: 0.34, rz: -s * 1 }, 4);
        mb.glow(0x8aeaf8, 1.6).box(0.02, 0.5, 0.05, 0xe8fbff, { y: 0.74, ao: false, v: 0 });
    }),
    dagger_bone: gearSpec((mb: MB) => dagger(mb, { ramp: R.bone, len: 0.4, w: 0.075, grip: 0x7a4a2a, guard: 0xd49a62, bone: true }), { diag: 0.55 }),
    dagger_steel: gearSpec((mb: MB) => dagger(mb, { ramp: R.steel, len: 0.5, w: 0.05, grip: 0x35305c, guard: R.gold[2], gem: 0xe85d62 }), { diag: 0.55 }),
    spear_iron: gearSpec((mb: MB) => spear(mb, { ramp: R.iron, len: 0.26, w: 0.08, tassel: 0xe85d62 })),
    spear_steel: gearSpec((mb: MB) => spear(mb, { ramp: R.steel, len: 0.34, w: 0.07, tassel: 0x4ab2cf, gold: true })),
    hammer_iron: gearSpec((mb: MB) => hammer(mb, { ramp: R.iron, head: [0.5, 0.3, 0.3], band: R.iron[0] }), { diag: 0.55 }),
    hammer_steel: gearSpec((mb: MB) => hammer(mb, { ramp: R.steel, head: [0.6, 0.36, 0.36], band: R.gold[1], spike: true }), { diag: 0.55, size: 1.05 }),
    hammer_colossus: gearSpec((mb: MB) => hammer(mb, { ramp: R.stone, head: [0.7, 0.4, 0.4], band: R.stone[0], stone: true }), { diag: 0.5, size: 1.05 }),
    bow_wood: gearSpec((mb: MB) => bow(mb, { limb: R.wood, tip: R.wood[4], string: 0xfff0d2 }), { diag: 0.1 }),
    bow_long: gearSpec((mb: MB) => bow(mb, { limb: R.leather.slice(1), tip: R.gold[2], string: 0xfff0d2, scale: 1.08 }), { diag: 0.1 }),
    bow_frost: gearSpec((mb: MB) => bow(mb, { limb: ICE2, tip: 0xe8fbff, string: 0xe8fbff, glow: [0x4ab2cf, 0.8], frost: true, scale: 1.05 }), { diag: 0.1 }),
    bow_rift: gearSpec((mb: MB) => bow(mb, { limb: R.violet, tip: 0x8aeaf8, string: 0x8aeaf8, glow: [0x9d6fdb, 0.9], scale: 1.05 }), { diag: 0.1 }),
    staff_crystal: gearSpec((mb: MB) => staff(mb, { shaft: R.iron, kind: 'crystal' })),
    staff_apprentice: gearSpec((mb: MB) => staff(mb, { shaft: R.wood, kind: 'bead', crooked: true })),
    staff_slime: gearSpec((mb: MB) => staff(mb, { shaft: R.dusk, kind: 'slime' })),
    staff_witch: gearSpec((mb: MB) => staff(mb, { shaft: [0x2a1d2c, 0x3a2f28, 0x5a4a3a, 0x7a6a52], kind: 'witch', crooked: true }))
};
