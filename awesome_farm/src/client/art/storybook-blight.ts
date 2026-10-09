// The Blight and the defenses against it, painted like everything else: the nest (a pulsing cluster of dark eggs, two frames so it
// can throb), the towers (Archer Tower, Ballista, Tesla Coil), the Spike Trap floor and the Bed. The Fortified Wall is the house kit's
// wall in iron-bound stone (storybook-house.ts), and the blighted ground is in the tile sheet (storybook-ground.ts).

import { IRON, lit, planks } from './storybook-build';
import { outlineOf, paint, paintFrames, Pix, RAMP } from './paint';

/** The nest's shell, dark → light, its veins and the glow in its cracks. */
export const NEST = [0x2a1830, 0x46284e, 0x6a3a6e, 0x925294, 0xbe7ab8];
const VEIN = 0xb02a50, GLOW = [0xe0405a, 0xff7a88, 0xffd0d6];
const W = RAMP.wood, ST = RAMP.stone, CU = [0x6a3a1c, 0x9a5a2a, 0xd08a4a, 0xf0b074];

/** One egg of the cluster: a dark shell with veins and, when `hot`, a glowing crack. */
function egg (p: Pix, cx: number, cy: number, rx: number, ry: number, hot: number, rnd: () => number) {
    p.ellipse(cx, cy, rx, ry, NEST);
    for (let k = 0; k < 3; k++) {
        let x = cx + (rnd() - 0.5) * rx, y = cy - ry * 0.6;
        for (let i = 0; i < ry * 1.3; i++) { p.set(x, y, VEIN); x += (rnd() - 0.5) * 1.6; y += 1; if (Math.hypot((x - cx) / rx, (y - cy) / ry) > 0.92) break; }
    }
    // the crack, lit from inside
    const kx = cx + rx * 0.15, ky = cy - ry * 0.1;
    for (let i = 0; i < ry * 0.9; i++) {
        const x = kx + Math.round(Math.sin(i * 1.3) * 1.2), y = ky - ry * 0.35 + i;
        p.set(x, y, GLOW[Math.min(2, hot + (i % 3 === 0 ? 1 : 0))]);
    }
    p.set(cx - rx * 0.45, cy - ry * 0.55, NEST[4]); p.set(cx - rx * 0.35, cy - ry * 0.6, NEST[4]);
}

function nest (p: Pix, rnd: () => number, frame: number) {
    const S = p.w, H = p.h;
    // the tendrils it grows from, spreading over the ground
    for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.05 + 0.9 * (k / 8)), len = 10 + rnd() * 9;
        p.blade(S / 2 + Math.cos(a) * 6, H - 7, S / 2 + Math.cos(a) * (len * 0.6), H - 4 - rnd() * 3, S / 2 + Math.cos(a) * len * 1.3, H - 3 - rnd() * 4, 1.6, [NEST[0], NEST[1], NEST[2]]);
    }
    p.ellipse(S / 2, H - 7, 15, 5, [NEST[0], NEST[1], NEST[1], NEST[2]]);
    const hot = frame;
    egg(p, S / 2 - 9, H - 14, 6, 8, hot, rnd);
    egg(p, S / 2 + 9, H - 13, 6, 7, hot, rnd);
    egg(p, S / 2 + 1, H - 21, 9, 12, hot, rnd);
    egg(p, S / 2 - 3, H - 8, 5, 5, hot, rnd);
    // a few pustules and drips of glowing ooze
    for (let k = 0; k < 5; k++) { const x = 6 + rnd() * (S - 12), y = H - 4 - rnd() * 4; p.set(x, y, GLOW[frame]); p.set(x + 1, y, GLOW[0]); }
    p.outline((c) => outlineOf(c, 0.6));
}

function archerTower (p: Pix, rnd: () => number) {
    const S = p.w;
    // the stone foot
    lit(p, 3, 46, S - 6, 21, ST);
    for (let y = 50; y < 66; y += 5) for (let x = 4 + ((y / 5) % 2) * 4; x < S - 4; x += 8) p.rect(x, y, 1, 4, ST[1]);
    for (let y = 50; y < 66; y += 5) p.rect(4, y, S - 8, 1, ST[1]);
    // the posts and their cross-braces
    for (const x of [5, S - 9]) lit(p, x, 20, 4, 27, W);
    p.line(9, 24, S - 9, 42, W[1]); p.line(S - 10, 24, 8, 42, W[1]);
    // the platform and its rail with an arrow slit
    planks(p, 1, 16, S - 2, 6, false, W, 3);
    lit(p, 2, 9, S - 4, 8, W);
    for (let x = 3; x < S - 3; x += 5) p.rect(x, 7, 3, 3, W[3]);
    p.rect(S / 2 - 1, 11, 2, 5, 0x2a1d2c);
    // a little thatched cap and a red pennant
    p.poly([[0, 8], [S, 8], [S / 2, -1]], (u, v) => (v > 0.7 ? RAMP.straw[0] : u < 0.45 ? RAMP.straw[3] : RAMP.straw[2]));
    p.rect(S / 2, 0, 1, 3, W[0]);
    p.poly([[S / 2 + 1, 0], [S / 2 + 7, 2], [S / 2 + 1, 4]], RAMP.red[2]);
    void rnd;
    p.outline();
}

function ballista (p: Pix) {
    const S = p.w;
    // a trestle
    lit(p, 6, 24, 4, 11, W); lit(p, S - 10, 24, 4, 11, W);
    planks(p, 4, 20, S - 8, 6, true, W, 4);
    // (the bow itself is a separate turning part: `ballistaBow`)
    lit(p, S / 2 - 3, 10, 6, 12, W);
    p.ellipse(S / 2, 11, 5, 3, IRON);
    p.outline();
}

/** The Ballista's bow, stock and bolt as one of eight frames (0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE), drawn round the middle of the frame. */
function ballistaBow (p: Pix, frame: number) {
    const cx = p.w / 2, cy = p.h / 2, a = (frame * Math.PI) / 4;
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, k = p.w / 22;
    const at = (f: number, s: number): [number, number] => [cx + (dx * f + nx * s) * k * 2, cy + (dy * f + ny * s) * k * 2];
    // the stock, two planks thick, with the bolt laid on it
    for (const s of [-0.5, 0.5]) { const [x0, y0] = at(-5, s), [x1, y1] = at(6, s); p.line(x0, y0, x1, y1, RAMP.wood[s < 0 ? 4 : 3]); }
    // the limbs, swept back, and the string
    const [lx, ly] = at(1, -6.5), [rx, ry] = at(1, 6.5), [mx, my] = at(0, 0), [sx, sy] = at(-3, 0);
    p.line(mx, my, lx, ly, IRON[2]); p.line(mx, my, rx, ry, IRON[2]);
    p.line(lx, ly, sx, sy, RAMP.cream[1]); p.line(rx, ry, sx, sy, RAMP.cream[1]);
    const [ex, ey] = at(7.5, 0), [bx, by] = at(-1, 0);
    p.line(bx, by, ex, ey, IRON[3]);
    p.set(Math.round(ex), Math.round(ey), 0xe8ebf6);
    p.outline();
}

function tesla (p: Pix, rnd: () => number) {
    const S = p.w, H = p.h;
    lit(p, 2, H - 10, S - 4, 9, IRON);
    p.rect(4, H - 8, S - 8, 1, IRON[3]);
    // the coil: copper turns stacked up the column
    lit(p, S / 2 - 3, 14, 6, H - 24, IRON);
    for (let y = 16; y < H - 12; y += 3) p.ellipse(S / 2, y, 6, 1.6, CU);
    // the crown: a sphere that crackles
    p.ellipse(S / 2, 9, 7, 7, [0x4a3a7a, 0x6a52a6, 0x9fd8f0, 0xe8fbff]);
    for (let k = 0; k < 4; k++) { const a = rnd() * Math.PI * 2; p.line(S / 2 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, S / 2 + Math.cos(a) * 9, 9 + Math.sin(a) * 9, 0xcdf4ee); }
    p.outline();
}

function spike (p: Pix, rnd: () => number) {
    const S = p.w;
    p.rect(1, 1, S - 2, S - 2, IRON[1]);
    p.rect(1, 1, S - 2, 1, IRON[2]); p.rect(1, S - 2, S - 2, 1, IRON[0]);
    for (let y = 5; y < S - 2; y += 8) for (let x = 5 + ((y >> 3) & 1) * 4; x < S - 3; x += 8) {
        p.poly([[x - 3, y + 3], [x + 3, y + 3], [x, y - 4]], (u) => (u < 0.5 ? IRON[3] : IRON[2]));
        p.set(x, y - 3, 0xe8ebf6);
        if (rnd() < 0.3) p.set(x + 1, y + 2, 0x8a2a2a);
    }
}

function bed (p: Pix) {
    const S = p.w, H = p.h;
    // the frame, a headboard at the top
    lit(p, 1, 2, S - 2, H - 3, W);
    lit(p, 0, 0, S, 6, W); p.rect(2, 1, S - 4, 1, W[4]);
    // the pillow and the blanket with its turned-down sheet
    p.ellipse(S / 2, 10, S / 2 - 5, 4, RAMP.cream);
    p.rect(3, 15, S - 6, 4, RAMP.cream[2]); p.rect(3, 18, S - 6, 1, RAMP.cream[1]);
    lit(p, 3, 19, S - 6, H - 23, [0x6a2440, 0x9a3446, 0xc9505a, 0xe8737a]);
    for (let y = 26; y < H - 6; y += 8) p.rect(4, y, S - 8, 1, 0x9a3446);
    for (let x = 9; x < S - 4; x += 8) p.rect(x, 20, 1, H - 26, 0x9a3446);
    p.rect(3, H - 4, S - 6, 1, W[0]);
    p.outline();
}

export function registerStorybookBlight (scene: Phaser.Scene) {
    paintFrames(scene, 'nest', 22, 20, 2, (p, rnd, f) => nest(p, rnd, f), 13);
    paint(scene, 'tower_archer', 16, 34, archerTower, 3);
    paint(scene, 'ballista', 16, 18, (p) => ballista(p), 1);
    paintFrames(scene, 'ballista_bow', 22, 22, 8, (p, _r, f) => ballistaBow(p, f), 1);
    paint(scene, 'tesla', 12, 30, tesla, 7);
    paint(scene, 'spike', 16, 16, spike, 5);
    paint(scene, 'sleepbed', 16, 32, (p) => bed(p), 1);
}

export const BLIGHT_TEXTURES = ['nest', 'tower_archer', 'ballista', 'ballista_bow', 'tesla', 'spike', 'sleepbed'];
