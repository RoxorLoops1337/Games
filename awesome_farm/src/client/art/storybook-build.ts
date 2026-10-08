// Painted buildings and furniture: the workshop set. Same logical sizes as the grid sprites they replace
// (the pixel sizes below are twice that), no ground shadows, light from the top left.

import { INK, mixc, outlineOf, paint, paintFrames, Pix, RAMP } from './paint';

const W = RAMP.wood, ST = RAMP.stone, CR = RAMP.cream, B = RAMP.brass, RD = RAMP.red;
export const IRON = [0x2e2c3c, 0x4a475c, 0x6a6a82, 0x9496ae];   // dark steel, dark → light

/** A flat-lit block: bright top and left edge, dark right and bottom, ramp[2] in between. */
export function lit (p: Pix, x: number, y: number, w: number, h: number, ramp: readonly number[]) {
    p.rect(x, y, w, h, ramp[2]);
    p.rect(x, y, w, 1, ramp[3]); p.rect(x, y, 1, h, ramp[3]);
    p.rect(x + w - 1, y, 1, h, ramp[1]); p.rect(x, y + h - 1, w, 1, ramp[1]);
    if (h > 3 && w > 3) p.rect(x + 1, y + h - 1, w - 1, 1, ramp[0]);
}

/** Planks laid side by side (vertical seams) or one above another (horizontal seams). */
export function planks (p: Pix, x: number, y: number, w: number, h: number, vertical: boolean, ramp: readonly number[] = W, step = 5) {
    lit(p, x, y, w, h, ramp);
    if (vertical) for (let i = step; i < w - 1; i += step) p.rect(x + i, y + 1, 1, h - 2, ramp[1]);
    else for (let j = step; j < h - 1; j += step) p.rect(x + 1, y + j, w - 2, 1, ramp[1]);
}

export function steel (p: Pix, x: number, y: number, w: number, h: number) { lit(p, x, y, w, h, IRON); }

// ── workshop benches ───────────────────────────────────────────────────────
function workbench (p: Pix) {
    // legs and a low brace
    for (const x of [3, 25]) { lit(p, x, 14, 4, 9, W); }
    p.rect(7, 18, 18, 2, W[1]); p.rect(7, 18, 18, 1, W[2]);
    // the top: a lit surface, then the thick front edge
    p.poly([[2, 9], [30, 9], [31, 5], [1, 5]], (u, v) => (v < 0.35 ? W[4] : W[3]) + 0 * u);
    for (let x = 4; x < 29; x += 7) p.line(x, 6, x - 1, 9, W[2]);
    planks(p, 1, 9, 30, 5, false, W, 3);
    // a saw and a hammer left lying on it
    p.poly([[4, 6], [14, 4], [14, 6], [4, 8]], (u) => (u < 0.5 ? IRON[3] : IRON[2]));
    for (let x = 5; x < 14; x += 2) p.set(x, 8 - Math.round((x - 4) * 0.2), IRON[1]);
    p.rect(3, 6, 2, 3, W[1]);
    p.rect(20, 5, 7, 2, W[2]); p.rect(20, 5, 7, 1, W[3]); steel(p, 24, 2, 4, 5);
    p.outline();
}

function anvil (p: Pix) {
    // a stump under it
    lit(p, 9, 16, 15, 6, W); p.rect(10, 17, 13, 1, W[3]);
    // base, waist, then a long top with the horn out to the left
    steel(p, 8, 13, 17, 4);
    p.poly([[11, 13], [22, 13], [20, 8], [13, 8]], (u) => (u < 0.4 ? IRON[2] : IRON[1]));
    p.poly([[4, 4], [26, 4], [29, 3], [29, 8], [25, 8], [8, 8], [0, 6]], (u, v) => (v < 0.4 ? IRON[3] : u < 0.6 ? IRON[2] : IRON[1]));
    p.rect(4, 4, 22, 1, 0xd6d9ec);
    p.set(27, 4, IRON[0]); p.set(28, 5, IRON[0]);
    p.outline();
}

function furnace (p: Pix, rnd: () => number) {
    const BR = [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc];
    // chimney
    lit(p, 20, 0, 7, 12, BR); p.rect(19, 0, 9, 2, BR[3]); p.rect(19, 2, 9, 1, BR[1]);
    // the body: stone bricks, staggered
    lit(p, 2, 8, 28, 18, BR);
    for (let y = 11; y < 24; y += 4) { p.rect(3, y, 26, 1, BR[1]); for (let x = 3 + ((y / 4) % 2) * 4; x < 29; x += 8) p.rect(x, y + 1, 1, 3, BR[1]); }
    p.rect(1, 8, 30, 2, BR[3]); p.rect(1, 9, 30, 1, BR[1]);
    // the mouth: dark arch with a fire in it
    p.poly([[9, 26], [9, 17], [11, 14], [21, 14], [23, 17], [23, 26]], 0x25222f);
    p.ellipse(16, 24, 6, 3, [0xc84a1a, 0xf08a2a, 0xffc060]);
    p.poly([[11, 25], [13, 18], [15, 22], [16, 16], [18, 22], [20, 18], [21, 25]], (_u, v) => (v < 0.4 ? 0xffe08a : v < 0.7 ? 0xffb040 : 0xf07a22));
    for (let k = 0; k < 4; k++) p.set(11 + Math.floor(rnd() * 10), 19 + Math.floor(rnd() * 5), 0xfff3b0);
    p.rect(6, 25, 20, 1, BR[0]);
    p.outline((c) => (c === 0xffe08a || c === 0xffb040 || c === 0xf07a22 || c === 0xfff3b0 ? 0x7a2a12 : outlineOf(c)));
}

function campfire (p: Pix) {
    // a ring of stones
    for (const [x, y, r] of [[5, 13, 2.8], [10, 15, 2.6], [17, 16, 2.8], [24, 15, 2.6], [22, 12, 2.4], [8, 11, 2.2]] as const) p.ellipse(x + 1, y, r, r * 0.8, ST, { bias: 0.2 });
    // crossed logs
    p.poly([[5, 13], [8, 10], [23, 15], [20, 17]], (u) => (u < 0.3 ? W[3] : u < 0.7 ? W[2] : W[1]));
    p.poly([[22, 11], [25, 13], [9, 17], [6, 15]], (u) => (u < 0.3 ? W[3] : u < 0.7 ? W[2] : W[1]));
    p.ellipse(6, 14, 1.5, 1.6, [W[1], W[2]]); p.ellipse(24, 13, 1.5, 1.6, [W[1], W[2]]);
    // flames
    p.poly([[9, 12], [11, 6], [13, 9], [14, 2], [17, 8], [19, 5], [21, 12], [15, 14]], (u, v) => (v < 0.35 ? 0xffe08a : v < 0.7 ? 0xffb040 : 0xf07a22) + 0 * u);
    p.poly([[12, 12], [14, 7], [16, 10], [18, 12], [15, 13]], 0xfff3b0);
    p.outline((c) => (c === 0xffe08a || c === 0xffb040 || c === 0xf07a22 || c === 0xfff3b0 ? 0xa83a14 : outlineOf(c)));
}

// ── storage ────────────────────────────────────────────────────────────────
function chestBox (p: Pix, body: readonly number[], trim: readonly number[], big = false) {
    const w = p.w, h = p.h, lidH = Math.round(h * 0.42);
    p.rect(1, lidH, w - 2, h - lidH - 1, body[2]);
    for (let y = lidH; y < h - 1; y++) { p.set(1, y, body[3]); p.set(2, y, body[3]); p.set(w - 3, y, body[1]); p.set(w - 2, y, body[1]); }
    for (let x = 1; x < w - 1; x++) { p.set(x, h - 2, body[0]); p.set(x, h - 1, body[0]); }
    for (let y = 0; y < lidH; y++) {
        const inset = y < 2 ? 2 - y : 0;
        for (let x = 1 + inset; x < w - 1 - inset; x++) p.set(x, y, y < 3 ? body[Math.min(4, body.length - 1)] : x < w / 2 ? body[3] : body[2]);
    }
    for (let x = 2; x < w - 2; x++) p.set(x, lidH - 1, body[0]);
    for (let x = 5; x < w - 4; x += 5) { for (let y = 2; y < lidH - 1; y++) p.set(x, y, body[1]); for (let y = lidH + 1; y < h - 2; y++) p.set(x, y, body[1]); }
    for (const x of [Math.round(w * 0.2), Math.round(w * 0.8) - 2]) { p.rect(x, 1, 3, h - 3, trim[2]); p.rect(x, 1, 1, h - 3, trim[3]); p.rect(x + 2, 2, 1, h - 4, trim[1]); }
    const cx = Math.round(w / 2) - 2;
    p.rect(cx, lidH - 2, 5, 6, trim[2]); p.rect(cx, lidH - 2, 5, 1, trim[3]); p.rect(cx + 1, lidH + 1, 3, 2, body[0]); p.set(cx + 2, lidH + 1, trim[3]);
    if (big) for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 6], [w - 5, h - 6]]) { p.rect(x, y, 2, 2, trim[2]); p.set(x, y, trim[3]); }
    p.outline();
}

function bed (p: Pix, rnd: () => number) {
    const SOIL = [0x5a3a28, 0x7a5232, 0x946440, 0xb48458];
    // a timber frame round a bed of turned earth, planted in ridges
    lit(p, 0, 2, 32, 16, W);
    p.rect(2, 4, 28, 12, SOIL[1]);
    for (let y = 5; y < 15; y += 4) {
        p.rect(3, y, 26, 1, SOIL[0]);                       // the furrow
        for (let x = 3; x < 29; x++) { p.set(x, y + 1, SOIL[3]); p.set(x, y + 2, x % 6 < 3 ? SOIL[2] : SOIL[1]); }
    }
    for (let k = 0; k < 12; k++) p.set(3 + Math.floor(rnd() * 25), 5 + Math.floor(rnd() * 9), k % 2 ? SOIL[3] : SOIL[0]);
    p.rect(0, 15, 32, 3, W[1]); p.rect(0, 15, 32, 1, W[3]);
    for (const x of [0, 29]) { p.rect(x, 2, 3, 16, W[3]); p.rect(x, 2, 1, 16, W[4]); p.rect(x + 2, 3, 1, 15, W[1]); }
    p.outline();
}

// ── crafting stations ──────────────────────────────────────────────────────
function kitchen (p: Pix) {
    const BR = [0x8a4a34, 0xaa6244, 0xc8805a, 0xe0a07a];
    // a brick range with a pot and a chimney pipe
    lit(p, 2, 12, 28, 14, BR);
    for (let y = 15; y < 24; y += 4) { p.rect(3, y, 26, 1, BR[1]); for (let x = 3 + ((y / 4) % 2) * 4; x < 29; x += 8) p.rect(x, y + 1, 1, 3, BR[1]); }
    p.rect(1, 11, 30, 2, 0x9ea4bf); p.rect(1, 11, 30, 1, 0xc4c9dc);
    p.poly([[8, 25], [8, 19], [10, 17], [22, 17], [24, 19], [24, 25]], 0x25222f);
    p.poly([[11, 25], [14, 20], [16, 23], [18, 20], [21, 25]], (u, v) => (v < 0.5 ? 0xffc060 : 0xf07a22) + 0 * u);
    steel(p, 18, 1, 5, 10); p.rect(17, 0, 7, 2, IRON[3]);
    // a cooking pot on the top, with its lid and a ladle
    p.ellipse(10, 8, 6, 5, IRON, { bias: 0.2 }); p.rect(5, 5, 11, 2, IRON[3]); p.ellipse(10, 4, 3.4, 1.4, IRON); p.rect(9, 1, 3, 2, IRON[3]);
    p.line(24, 10, 29, 3, W[2]); p.ellipse(29, 3, 2, 1.5, IRON);
    p.outline((c) => (c === 0xffc060 || c === 0xf07a22 ? 0x7a2a12 : outlineOf(c)));
}

function loom (p: Pix) {
    // a wooden frame with a woven strip hanging in it and the shuttle
    lit(p, 2, 0, 4, 19, W); lit(p, 22, 0, 4, 19, W); lit(p, 1, 0, 26, 3, W);
    lit(p, 1, 16, 26, 3, W);
    p.rect(7, 3, 14, 13, CR[1]);
    for (let x = 7; x < 21; x += 2) p.rect(x, 3, 1, 13, CR[0]);
    for (let y = 5; y < 15; y += 4) { p.rect(7, y, 14, 2, RD[1]); p.rect(7, y, 14, 1, RD[2]); }
    p.rect(8, 15, 9, 2, W[3]); p.rect(15, 15, 5, 2, W[1]);
    p.outline();
}

function alchemy (p: Pix, rnd: () => number) {
    for (const x of [3, 23]) lit(p, x, 14, 4, 7, W);
    p.rect(4, 17, 22, 1, W[1]);
    p.poly([[1, 10], [27, 10], [28, 6], [0, 6]], W[3]);
    planks(p, 0, 10, 28, 4, false, W, 3);
    // flasks with bright liquids
    const flask = (cx: number, top: number, liquid: readonly number[], round: boolean) => {
        p.rect(cx - 1, top, 3, 4, 0xdff4f0); p.rect(cx - 1, top, 3, 1, 0xffffff);
        p.ellipse(cx, top + 8, round ? 4.5 : 3.6, round ? 4.2 : 4.4, [0xcfeee8, 0xe8fbff]);
        p.ellipse(cx, top + 9, round ? 3.6 : 2.8, round ? 3.2 : 3.4, liquid, { bias: 0.2 });
        p.set(cx - 2, top + 6, 0xffffff);
    };
    flask(7, 0, [0x9a3a8a, 0xd05aa8, 0xf79fc6], true); flask(15, 1, [0x2a7aa8, 0x4ab2cf, 0xa8e8f0], false); flask(22, 2, [0x5a3aa8, 0x8f72cc, 0xc4a4f0], false);
    for (let k = 0; k < 3; k++) p.set(6 + Math.floor(rnd() * 3) + k * 8, Math.floor(rnd() * 3), 0xe8fbff);
    p.outline((c) => (c === 0xdff4f0 || c === 0xcfeee8 || c === 0xe8fbff || c === 0xffffff ? mixc(0x7ac0c0, INK, 0.5) : outlineOf(c)));
}

function sawmill (p: Pix) {
    // a long bench with a big round saw and a log waiting to be cut
    for (const x of [4, 28, 52]) lit(p, x, 18, 5, 11, W);
    p.rect(8, 23, 44, 2, W[1]);
    p.poly([[1, 15], [63, 15], [62, 11], [2, 11]], W[3]);
    planks(p, 0, 15, 64, 5, false, W, 3);
    // the log, end-on at the right
    p.ellipse(50, 8, 9, 6.5, [W[1], W[2], 0xe0b078], { bias: 0.1 }); p.ellipse(50, 8, 5.5, 4, [0xd9a468, 0xe8bc84]); p.ellipse(50, 8, 2.2, 1.6, [W[2]]);
    p.poly([[40, 14], [44, 4], [58, 4], [60, 14]], W[2]);
    p.ellipse(50, 8, 9, 6.5, [W[1], W[2], 0xe0b078], { bias: 0.1 }); p.ellipse(50, 8, 5.5, 4, [0xd9a468, 0xe8bc84]); p.ellipse(50, 8, 2.2, 1.6, [W[2]]);
    // the saw: a steel disc with teeth, on a short post
    lit(p, 22, 6, 6, 9, W);
    p.ellipse(25, 8, 9, 8, IRON, { bias: 0.1 });
    for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; p.set(Math.round(25 + Math.cos(an) * 9.5), Math.round(8 + Math.sin(an) * 8.4), IRON[3]); }
    p.ellipse(25, 8, 2.4, 2.2, [0x25222f, W[2]]);
    p.line(20, 3, 28, 2, IRON[3]);
    p.outline();
}

function millstone (p: Pix) {
    // a wooden base and a stone wheel with a hopper above it
    lit(p, 3, 14, 22, 6, W); p.rect(4, 15, 20, 1, W[3]);
    p.ellipse(14, 12, 12.5, 6.5, [0x8a8fae, 0xb0b5cc, 0xd9dcea], { bias: 0.1 });
    p.ellipse(14, 11, 11, 5, [0xb0b5cc, 0xd9dcea, 0xe8ebf6], { bias: 0.2 });
    p.ellipse(14, 11, 3, 1.8, [0x35305c]);
    for (const [x, y] of [[6, 11], [22, 12], [10, 14], [18, 8]] as const) p.set(x, y, 0x8a8fae);
    p.poly([[9, 8], [19, 8], [17, 1], [11, 1]], (u) => (u < 0.5 ? W[3] : W[2]));
    p.rect(11, 1, 6, 1, W[4]);
    p.outline();
}

function market (p: Pix, rnd: () => number) {
    // a striped awning over a counter loaded with produce
    for (const x of [2, 31]) lit(p, x, 6, 3, 19, W);
    p.rect(3, 17, 30, 8, W[1]);
    planks(p, 1, 17, 34, 8, false, W, 4);
    for (let x = 0; x < 36; x += 6) {
        const colA = (x / 6) % 2 ? CR[3] : RD[1], colB = (x / 6) % 2 ? CR[1] : RD[0];
        p.poly([[x, 1], [x + 6, 1], [x + 6, 8], [x, 8]], (u, v) => (v < 0.6 ? colA : colB) + 0 * u);
        p.rect(x, 8, 6, 2, colB); for (let i = 0; i < 6; i += 3) p.rect(x + i, 10, 2, 1, colB);
    }
    p.rect(0, 0, 36, 1, RD[3]);
    // goods on the counter
    for (const [x, c] of [[6, 0xe85d62], [11, 0xf8a24a], [16, 0x92d364], [21, 0xffd966], [26, 0xe85d62]] as const) { p.ellipse(x, 14, 2.8, 2.4, [mixc(c, INK, 0.3), c, mixc(c, 0xffffff, 0.35)], { bias: 0.2 }); }
    for (let k = 0; k < 6; k++) p.set(5 + Math.floor(rnd() * 24), 12 + Math.floor(rnd() * 4), 0xffffff);
    p.outline();
}

function mill (p: Pix) {
    // a tapering tower: cream plaster, a red cap, a door and a window
    p.poly([[5, 33], [8, 12], [24, 12], [27, 33]], (u) => (u < 0.18 ? CR[3] : u < 0.62 ? CR[2] : CR[1]));
    p.poly([[4, 13], [16, 1], [28, 13]], (u) => (u < 0.3 ? RD[2] : u < 0.7 ? RD[1] : RD[0]));
    p.rect(3, 12, 26, 2, RD[0]); p.rect(3, 12, 26, 1, RD[2]);
    p.poly([[12, 33], [12, 26], [14, 23], [18, 23], [20, 26], [20, 33]], [W[1]][0]);
    p.rect(13, 25, 6, 8, W[2]); p.rect(13, 25, 1, 8, W[3]); p.set(18, 30, B[2]);
    p.ellipse(16, 17, 2.4, 2.8, [0x35305c, 0x6a432f]); p.rect(14, 17, 4, 1, W[1]);
    for (let y = 18; y < 32; y += 4) p.rect(8 - Math.round((y - 18) / 5), y, 1, 1, CR[0]);
    p.rect(5, 32, 22, 2, 0xa89a82);
    p.outline();
}

function millBlades (p: Pix, frame: number) {
    // four sails on a cross of timber, turned a little in each frame
    const cx = 25, cy = 25, rot = frame * (Math.PI / 8);
    const arm = (ang: number) => {
        const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
        const pt = (t: number, s: number): [number, number] => [cx + dx * t + nx * s, cy + dy * t + ny * s];
        // the timber and the cloth sail along it
        p.poly([pt(4, -1), pt(23, -1), pt(23, 1), pt(4, 1)], (u) => (u < 0.5 ? W[3] : W[2]));
        p.poly([pt(8, 1), pt(23, 1), pt(23, 8), pt(8, 8)], (u, v) => (v < 0.5 ? CR[3] : CR[1]) + 0 * u);
        for (let t = 10; t < 23; t += 4) p.line(...pt(t, 1), ...pt(t, 8), CR[0]);
    };
    for (let k = 0; k < 4; k++) arm(rot + (k * Math.PI) / 2);
    p.ellipse(cx, cy, 3.6, 3.6, [W[0], W[2], W[3]]); p.set(cx - 1, cy - 1, W[4]);
    p.outline();
}

// ── small standing things ──────────────────────────────────────────────────
function lantern (p: Pix) {
    lit(p, 7, 14, 3, 14, [IRON[0], IRON[1], IRON[2], IRON[3]]);
    p.rect(4, 26, 9, 2, IRON[2]);
    lit(p, 2, 1, 12, 3, [IRON[0], IRON[1], IRON[2], IRON[3]]);
    p.poly([[3, 4], [13, 4], [12, 14], [4, 14]], (u, v) => (v < 0.4 ? 0xfff0b0 : 0xffd060) + 0 * u);
    p.rect(8, 4, 1, 10, 0xc58f3e); p.rect(3, 4, 1, 10, IRON[2]); p.rect(12, 4, 1, 10, IRON[2]);
    p.rect(1, 0, 14, 2, IRON[3]);
    p.outline((c) => (c === 0xfff0b0 || c === 0xffd060 ? 0xa8641a : outlineOf(c)));
}

function fence (p: Pix) {
    for (const x of [1, 28]) { lit(p, x, 2, 5, 19, W); p.rect(x, 2, 5, 2, W[4]); }
    for (const y of [6, 13]) { lit(p, 5, y, 24, 3, W); p.rect(5, y, 24, 1, W[4]); }
    p.outline();
}

function bench (p: Pix) {
    for (const x of [3, 25]) lit(p, x, 5, 3, 9, W);
    p.poly([[1, 4], [31, 4], [30, 1], [2, 1]], W[4]);
    planks(p, 0, 4, 32, 4, false, W, 4);
    p.rect(3, 10, 26, 1, W[1]);
    p.outline();
}

/** A backpack left lying where its owner fell: a leather satchel with its flap undone, a ribbon tied to it and a coin that rolled out. */
function lostpack (p: Pix) {
    // the sack, a little wider at the bottom
    p.poly([[7, 11], [25, 11], [28, 25], [4, 25]], (u, v) => W[v > 0.8 ? 1 : u < 0.28 ? 3 : u > 0.75 ? 1 : 2]);
    p.rect(5, 23, 22, 2, W[0]);
    // seams and a stitched pocket
    p.line(9, 14, 7, 23, W[1]); p.line(23, 14, 25, 23, W[1]);
    lit(p, 11, 17, 10, 6, W);
    p.rect(12, 18, 8, 1, W[1]);
    // the flap, thrown back
    p.poly([[6, 6], [26, 6], [25, 13], [7, 13]], (u, v) => (v < 0.3 ? W[4] : v > 0.8 ? W[1] : u < 0.5 ? W[3] : W[2]));
    p.rect(7, 12, 18, 1, W[0]);
    // the strap and its buckle
    p.rect(14, 12, 4, 8, B[1]); p.rect(14, 12, 1, 8, B[2]); p.rect(15, 15, 2, 2, B[3]);
    // a handle
    p.line(12, 6, 13, 3, W[1]); p.line(13, 3, 19, 3, W[1]); p.line(19, 3, 20, 6, W[1]);
    // a red ribbon knotted on the side
    p.poly([[24, 12], [28, 10], [28, 14]], RD[2]); p.poly([[24, 12], [27, 17], [24, 16]], RD[1]); p.set(24, 12, RD[3]);
    // a coin that rolled out
    p.ellipse(4.5, 24.5, 2.4, 2.4, [B[1], B[2], B[3]]); p.set(4, 24, B[3]);
    p.outline();
}

/**
 * The Export Chute: a little oak hopper over a brass-banded box with a coin slot. Things go in at the top and come out as coins.
 * 32 x 34 pixels (16 x 17 tiles' worth of logical units, painted twice as dense), no ground shadow.
 */
function chute (p: Pix) {
    // little feet
    p.rect(6, 31, 5, 3, W[0]); p.rect(21, 31, 5, 3, W[0]); p.rect(6, 31, 5, 1, W[2]); p.rect(21, 31, 5, 1, W[2]);
    // the box: oak planks standing on end
    planks(p, 4, 16, 24, 16, true, W, 5);
    // two brass bands round it, with rivets
    for (const y of [18, 28]) {
        p.rect(4, y, 24, 3, B[1]); p.rect(4, y, 24, 1, B[3]); p.rect(4, y + 2, 24, 1, B[0]);
        for (const x of [6, 25]) p.set(x, y + 1, B[3]);
    }
    // the coin plate: brass, with a dark slot and a coin just going in
    lit(p, 9, 21, 14, 6, B);
    p.rect(11, 23, 10, 2, 0x25222f); p.rect(11, 25, 10, 1, B[0]);
    p.ellipse(16, 22.6, 2.6, 2.4, [B[1], B[2], B[3]], { bias: 0.1 }); p.set(15, 22, 0xffffff);
    // the hopper: a wide mouth narrowing down into the box
    p.poly([[2, 5], [30, 5], [24, 17], [8, 17]], (u, v) => (u < 0.18 ? W[4] : u > 0.82 ? W[1] : v > 0.7 ? W[2] : W[3]) + 0 * v);
    p.line(10, 7, 12, 16, W[1]); p.line(16, 7, 16, 16, W[1]); p.line(22, 7, 20, 16, W[1]);
    // the rim, and the dark inside of the mouth
    p.rect(1, 3, 30, 3, B[2]); p.rect(1, 3, 30, 1, B[3]); p.rect(1, 5, 30, 1, B[0]);
    p.ellipse(16, 4, 12, 1.4, [0x15131c, 0x25222f]);
    // a coin or two waiting on the lip, to say what it does
    p.ellipse(25, 2, 2.2, 1.6, [B[1], B[2], B[3]]);
    p.outline();
}

export function registerStorybookBuildings (scene: Phaser.Scene) {
    paint(scene, 'chute', 16, 17, (p) => chute(p), 1);
    paint(scene, 'lostpack', 16, 14, lostpack, 1);
    paint(scene, 'workbench', 16, 12, (p) => workbench(p), 1);
    paint(scene, 'anvil', 16, 11, (p) => anvil(p), 1);
    paint(scene, 'furnace', 16, 14, furnace, 3);
    paint(scene, 'campfire', 14, 9, (p) => campfire(p), 1);
    paint(scene, 'chest_b', 16, 9, (p) => chestBox(p, W, B), 1);
    paint(scene, 'steelchest', 16, 9, (p) => chestBox(p, [0x3a3647, 0x56526a, 0x7a7f9e, 0xb0b5cc, 0xd9dcea], [0x666b86, 0x9ea4bf, 0xc4c9dc, 0xe8ebf6]), 1);
    paint(scene, 'bed', 16, 9, bed, 4);
    paint(scene, 'kitchen', 16, 13, (p) => kitchen(p), 1);
    paint(scene, 'loom', 14, 10, (p) => loom(p), 1);
    paint(scene, 'alchemy', 14, 11, alchemy, 2);
    paint(scene, 'sawmill', 32, 15, (p) => sawmill(p), 1);
    paint(scene, 'millstone', 14, 10, (p) => millstone(p), 1);
    paint(scene, 'market', 18, 13, market, 5);
    paint(scene, 'mill', 16, 17, (p) => mill(p), 1);
    paintFrames(scene, 'mill_blades', 25, 25, 1, (p) => millBlades(p, 0), 1);
    paint(scene, 'lantern', 8, 14, (p) => lantern(p), 1);
    paint(scene, 'fence', 17, 11, (p) => fence(p), 1);
    paint(scene, 'bench', 16, 7, (p) => bench(p), 1);
}
