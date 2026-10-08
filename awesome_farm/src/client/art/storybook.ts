// The painted ("storybook") world art. Each sprite takes the same logical room as the grid sprite it
// replaces, but is drawn on a twice-as-dense grid (so a 16×18 unit tree is 32×36 pixels here).
// Nothing in here draws a ground shadow: the game puts one under everything that stands.

import { INK, mixc, outlineOf, paint, Pix, RAMP } from './paint';

const { leaf: LEAF, wood: WOOD, red: RED, stone: STONE } = RAMP;

const berryOutline = (c: number) => mixc(c, INK, 0.6);

// ── trees ──────────────────────────────────────────────────────────────────
function tree (p: Pix, rnd: () => number) {
    // trunk, lit from the left, with a few bark notches
    for (let y = 22; y <= 34; y++) {
        const w = y < 30 ? 4 : y < 32 ? 6 : 8;
        const x0 = 16 - Math.floor(w / 2);
        for (let i = 0; i < w; i++) { const t = i / (w - 1); p.set(x0 + i, y, t < 0.25 ? WOOD[3] : t < 0.6 ? WOOD[2] : t < 0.85 ? WOOD[1] : WOOD[0]); }
    }
    for (let y = 24; y < 33; y += 3) { p.set(15, y, WOOD[1]); p.set(16, y + 1, WOOD[1]); }
    // the crown: a heap of lit balls of leaves
    const clumps = [[9, 17, 8.5, 7], [23, 17, 8.5, 7], [16, 20, 9, 5.5], [16, 12, 12.5, 9.5], [16, 6.5, 8, 5.5], [8, 11, 6.5, 5.5], [24, 11, 6.5, 5.5]];
    for (const [cx, cy, rx, ry] of clumps) p.ellipse(cx, cy, rx, ry, LEAF, { bias: 0.15 });
    p.speckle(LEAF, rnd, 0.09, 0.08);
    // apples
    for (const [x, y] of [[10, 15], [21, 11], [15, 19], [24, 17]]) { p.rect(x, y, 2, 2, RED[1]); p.set(x, y, RED[3]); p.set(x + 1, y + 1, RED[0]); }
    p.outline((c) => (c === RED[1] || c === RED[3] || c === RED[0] ? berryOutline(c) : outlineOf(c)));
}

function pine (p: Pix, rnd: () => number) {
    const P = RAMP.pine, SNOW = [0xb8d4e4, 0xdcecf4, 0xf4fbff];
    // trunk
    for (let y = 29; y <= 33; y++) for (let x = 14; x < 18; x++) p.set(x, y, x < 15 ? WOOD[3] : x < 17 ? WOOD[2] : WOOD[1]);
    // four tiers, widest at the bottom, each with a ragged skirt; lit on the left, snowed along its upper edges
    const tiers: [number, number, number][] = [[18, 31, 13], [11, 24, 11], [5, 18, 8.5], [0, 11, 6]];   // [top y, bottom y, half width at the bottom]
    for (const [top, bot, hw] of tiers) {
        for (let y = top; y <= bot; y++) {
            const half = ((y - top) / (bot - top)) * hw + 0.6;
            // the skirt: the bottom two rows are zigzagged
            const skirt = y >= bot - 1 ? ((y + 1) % 2) * 1.5 : 0;
            for (let x = Math.round(16 - half + skirt); x <= Math.round(16 + half - skirt - 1); x++) {
                const u = (x - (16 - half)) / (2 * half), edge = Math.min(x - (16 - half), 16 + half - x);
                let c = u < 0.3 ? P[3] : u < 0.62 ? P[2] : u < 0.84 ? P[1] : P[0];
                if (y >= bot - 2) c = u < 0.5 ? P[1] : P[0];
                else if (y < top + (bot - top) * 0.7 && edge < 2.4 + rnd() * 1.4) c = edge < 1.2 ? SNOW[2] : SNOW[1 + (u > 0.55 ? -1 : 0)];
                p.set(x, y, c);
            }
        }
    }
    p.outline((c) => (SNOW.includes(c) ? mixc(P[1], INK, 0.55) : outlineOf(c)));
}

// ── stone and ore ──────────────────────────────────────────────────────────
function boulder (p: Pix, rnd: () => number, ramp: readonly number[] = STONE) {
    // a faceted, lumpy silhouette, lit from the top left
    const sil: [number, number][] = [[3, 22], [1, 16], [3, 10], [9, 5], [17, 2], [24, 4], [29, 10], [31, 17], [29, 22]];
    const n = ramp.length;
    p.poly(sil, (u, v) => ramp[Math.max(0, Math.min(n - 1, Math.floor((1.12 - (0.62 * u + 0.78 * v)) * n)))]);
    // the right-hand face turns away from the light: one step darker
    p.poly([[17, 2], [24, 4], [29, 10], [31, 17], [29, 22], [18, 22], [20, 12]], (u, v) => ramp[Math.max(0, Math.min(n - 1, Math.floor((0.78 - (0.5 * u + 0.62 * v)) * n)))]);
    // a lit ridge, cracks, and a dark foot so it sits on the ground
    p.line(10, 6, 16, 3, ramp[n - 1]); p.line(4, 12, 7, 8, ramp[n - 2]);
    p.line(14, 8, 16, 14, ramp[0]); p.line(16, 14, 15, 19, ramp[0]);
    p.line(23, 9, 25, 13, ramp[1]);
    p.speckle(ramp, rnd, 0.05, 0.05);
    for (let x = 4; x < 29; x++) { p.set(x, 22, mixc(ramp[0], INK, 0.35)); if (x % 2 === 0) p.set(x, 21, ramp[0]); }
}

function ore (p: Pix, rnd: () => number, nugget: readonly number[]) {
    boulder(p, rnd);
    // chunks of ore set into the stone: little diamonds with a lit corner
    const spots: [number, number, number][] = [[8, 13, 2.4], [14, 9, 2], [22, 10, 2.6], [26, 16, 2], [12, 17, 2.2], [20, 16, 1.8]];
    for (const [x, y, r] of spots) {
        p.poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], (u, v) => nugget[Math.max(0, Math.min(nugget.length - 1, Math.floor((1.1 - (u * 0.6 + v * 0.7)) * nugget.length)))]);
        p.set(Math.round(x - r * 0.35), Math.round(y - r * 0.45), nugget[nugget.length - 1]);
    }
    p.outline((c) => (nugget.includes(c) ? mixc(nugget[0], INK, 0.6) : outlineOf(c)));
}

// ── plants ─────────────────────────────────────────────────────────────────
function bush (p: Pix, rnd: () => number) {
    p.ellipse(8, 14, 7, 6, LEAF, { bias: 0.2 });
    p.ellipse(24, 14, 7, 6, LEAF, { bias: 0.3 });
    p.ellipse(16, 11, 11, 8.5, LEAF, { bias: 0.15 });
    p.ellipse(16, 17, 14, 4.5, LEAF, { bias: 0.4 });
    p.speckle(LEAF, rnd, 0.1, 0.08);
    // berries
    for (const [x, y] of [[8, 10], [14, 7], [21, 11], [26, 15], [12, 15], [18, 16], [5, 15]]) { p.rect(x, y, 2, 2, RED[1]); p.set(x, y, RED[3]); p.set(x + 1, y + 1, RED[0]); }
    p.outline((c) => (c === RED[1] || c === RED[3] || c === RED[0] ? berryOutline(c) : outlineOf(c)));
}

function flower (p: Pix) {
    const PET = [0xd8588c, 0xf28cb6, 0xf8b6d2, 0xffdce8];
    p.line(9, 17, 9, 9, LEAF[1]); p.line(10, 17, 10, 9, LEAF[2]);
    p.ellipseRot(5.5, 13.5, 3.4, 1.4, -0.6, LEAF, { bias: 0.1 }); p.ellipseRot(13.5, 12.5, 3.4, 1.4, 0.6, LEAF, { bias: 0.1 });
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        p.ellipseRot(9.5 + Math.cos(a) * 3.2, 6 + Math.sin(a) * 3.2, 2.4, 1.7, a, PET, { bias: 0.2 });
    }
    p.ellipse(9.5, 6, 1.9, 1.9, [0xd49a1a, 0xffd966, 0xfff3b0]);
    p.outline((c) => (PET.includes(c) ? mixc(PET[0], INK, 0.55) : outlineOf(c)));
}

function mushroom (p: Pix, cap: readonly number[], spot: number) {
    const stem = RAMP.cream;
    // a small one behind, a big one in front
    for (const [cx, cy, r, h] of [[16, 11, 7.5, 5.5], [7, 14, 4.5, 3.6]] as const) {
        p.ellipse(cx, cy + h + 2, 2.2 * (r / 7), 4.2 * (r / 7), stem, { bias: 0.3 });
        p.ellipse(cx, cy, r, h, cap, { bias: 0.15 });
        for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) p.set(x, Math.round(cy + h * 0.55), cap[0]);
        p.ellipse(cx - r * 0.35, cy - h * 0.35, r * 0.28, h * 0.22, [spot]);
        p.ellipse(cx + r * 0.4, cy - h * 0.1, r * 0.2, h * 0.2, [spot]);
    }
    p.outline((c) => (c === spot ? mixc(cap[0], INK, 0.4) : outlineOf(c)));
}

// ── mounds, crystals and marsh plants ──────────────────────────────────────
function mound (p: Pix, rnd: () => number, ramp: readonly number[], w: number, h: number, ripples: boolean) {
    const n = ramp.length;
    const pts: [number, number][] = [[1, h - 1], [2, h - 5], [6, h - 9], [Math.round(w * 0.4), 1], [Math.round(w * 0.62), 2], [w - 6, h - 8], [w - 2, h - 5], [w - 1, h - 1]];
    p.poly(pts, (u, v) => ramp[Math.max(0, Math.min(n - 1, Math.floor((1.15 - (0.55 * u + 0.8 * v)) * n)))]);
    if (ripples) for (let k = 0; k < 3; k++) { const y = h - 4 - k * 3; for (let x = 4 + k * 2; x < w - 5 - k; x++) if ((x + k) % 4 < 3) p.set(x, y + Math.round(Math.sin(x * 0.7 + k) * 0.8), ramp[Math.max(0, 1 - (k > 1 ? 1 : 0))]); }
    for (let x = 2; x < w - 1; x++) p.set(x, h - 1, ramp[0]);
    p.speckle(ramp, rnd, 0.07, 0.06);
}

function clay (p: Pix, rnd: () => number) {
    const C = RAMP.clay;
    mound(p, rnd, C, 28, 16, false);
    // layered strata
    for (const y of [9, 12]) for (let x = 3; x < 25; x++) if ((x + y) % 5 !== 0) p.set(x, y, C[0]);
    for (const [x, y] of [[8, 5], [9, 5], [17, 4], [18, 4]]) p.set(x, y, C[3]);
    p.outline();
}

function peat (p: Pix, rnd: () => number) {
    const P = RAMP.peat;
    mound(p, rnd, P, 26, 15, false);
    // moss on the top, and a few stalks of grass
    for (let x = 6; x < 20; x++) { p.set(x, 4 + (x % 3 === 0 ? 1 : 0), LEAF[1]); if (x % 2 === 0) p.set(x, 5, LEAF[2]); }
    for (const x of [8, 13, 19]) p.blade(x, 6, x - 1, 2, x - 2 + (x % 2) * 3, 0, 1.2, LEAF);
    p.outline();
}

function crystal (p: Pix) {
    const I = RAMP.ice;
    // a little stone base
    p.ellipse(16, 17, 14, 3.4, STONE, { bias: 0.3 });
    // three separate pointed prisms: a lit left face, a darker right face, a glint
    const prisms: [number, number, number, number, number][] = [[6, 18, 4, 10, 0], [25, 18, 4, 8, 0], [15, 18, 5.5, 17, 0]];   // [cx, base y, half width, height]
    prisms.sort((a, b) => a[3] - b[3]);
    for (const [cx, by, hw, h] of prisms) {
        const top = by - h, shoulder = by - Math.round(h * 0.72), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
        p.poly([[x0, by], [x0, shoulder], [cx, top], [cx, by]], I[2]);
        p.poly([[cx, top], [x1, shoulder], [x1, by], [cx, by]], I[1]);
        p.line(x0 + 1, shoulder + 1, x0 + 1, by - 2, I[3]);
        p.set(Math.round(cx) - 1, top + 3, I[3]); p.set(Math.round(cx) - 1, top + 4, I[3]); p.line(Math.round(cx), top + 2, Math.round(cx), by - 1, I[2]);
        for (let x = x0; x < x1; x++) p.set(x, by, I[0]);
        // a pale rim along the right edge
        p.line(x1 - 1, shoulder + 1, x1 - 1, by - 1, I[0]);
    }
    p.outline((c) => (I.includes(c) ? mixc(I[0], INK, 0.55) : outlineOf(c)));
}

function reeds (p: Pix) {
    const L = RAMP.leaf, B = [0x5a3a24, 0x7a5030, 0x9a6a3a];
    for (const [x, lean, h] of [[5, -2, 14], [9, -1, 17], [13, 0, 15], [17, 2, 17], [20, 3, 13]] as const) {
        p.blade(x, 17, x + lean * 0.3, 17 - h * 0.6, x + lean, 17 - h, 1.6, L);
    }
    // cattails
    for (const [x, y] of [[9, 2], [17, 2]] as const) { p.line(x, y + 3, x, y + 9, L[1]); p.ellipse(x, y + 2, 1.5, 3.2, B, { bias: 0.2 }); }
    p.outline();
}

function herb (p: Pix) {
    const D = RAMP.leafDeep, V = RAMP.bloom;
    for (const [x, lean] of [[6, -4], [11, -1], [16, 3], [20, 5]] as const) p.blade(x, 15, x + lean * 0.4, 9, x + lean, 5, 2.4, D);
    for (const [x, y] of [[4, 4], [11, 1], [20, 3]] as const) { p.ellipse(x, y, 2.2, 2.8, V, { bias: 0.1 }); p.set(x - 1, y - 1, V[3]); }
    p.ellipse(12, 14, 11, 2.6, D, { bias: 0.3 });
    p.outline((c) => (V.includes(c) ? mixc(V[0], INK, 0.55) : outlineOf(c)));
}

function cottonPlant (p: Pix, rnd: () => number, puffs: [number, number][]) {
    const D = RAMP.leafDeep, C = RAMP.cream;
    p.ellipse(12, 12, 11, 4.5, D, { bias: 0.3 });
    for (const [x, lean] of [[5, -3], [10, -1], [15, 2], [19, 3]] as const) p.blade(x, 13, x + lean * 0.4, 9, x + lean, 5, 2.2, D);
    for (const [x, y] of puffs) { p.ellipse(x, y, 3, 2.7, C, { bias: 0.1 }); p.ellipse(x - 2, y + 1, 2, 1.8, C, { bias: 0.1 }); p.ellipse(x + 2, y + 1, 2, 1.8, C, { bias: 0.1 }); }
    p.speckle(D, rnd, 0.08, 0.06);
    p.outline((c) => (C.includes(c) ? mixc(0xb8a090, INK, 0.5) : outlineOf(c)));
}

// ── chests ─────────────────────────────────────────────────────────────────
function chest (p: Pix, big = false) {
    const W = WOOD, B = RAMP.brass, w = p.w, h = p.h;
    const lidH = Math.round(h * 0.42);
    // body, then a lid that is a little domed
    p.rect(1, lidH, w - 2, h - lidH - 1, W[2]);
    for (let y = lidH; y < h - 1; y++) { p.set(1, y, W[3]); p.set(2, y, W[3]); p.set(w - 3, y, W[1]); p.set(w - 2, y, W[1]); }
    for (let x = 1; x < w - 1; x++) { p.set(x, h - 2, W[0]); p.set(x, h - 1, W[0]); }
    for (let y = 0; y < lidH; y++) {
        const inset = y < 2 ? 2 - y : 0;
        for (let x = 1 + inset; x < w - 1 - inset; x++) p.set(x, y, y < 3 ? W[4] : x < w / 2 ? W[3] : W[2]);
    }
    for (let x = 2; x < w - 2; x++) p.set(x, lidH - 1, W[0]);
    // plank lines
    for (let x = 5; x < w - 4; x += 5) { for (let y = 2; y < lidH - 1; y++) p.set(x, y, W[1]); for (let y = lidH + 1; y < h - 2; y++) p.set(x, y, W[1]); }
    // brass: two straps and a lock
    for (const x of [Math.round(w * 0.2), Math.round(w * 0.8) - 2]) { p.rect(x, 1, 3, h - 3, B[2]); p.rect(x, 1, 1, h - 3, B[3]); p.rect(x + 2, 2, 1, h - 4, B[1]); }
    const cx = Math.round(w / 2) - 2;
    p.rect(cx, lidH - 2, 5, 6, B[2]); p.rect(cx, lidH - 2, 5, 1, B[3]); p.rect(cx + 1, lidH + 1, 3, 2, W[0]); p.set(cx + 2, lidH + 1, B[3]);
    if (big) for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 6], [w - 5, h - 6]]) { p.rect(x, y, 2, 2, B[2]); p.set(x, y, B[3]); }
    p.outline();
}

// ── crops: what a bed shows as the plant grows ─────────────────────────────
function seedling (p: Pix) {
    p.blade(6, 9, 4, 6, 2, 3, 1.4, LEAF); p.blade(6, 9, 8, 6, 10, 4, 1.4, LEAF); p.blade(6, 9, 6, 6, 6, 2, 1, LEAF);
    p.outline();
}
function sprouting (p: Pix) {
    for (const [x, lx, tx, ty] of [[6, 2, 1, 4], [10, 12, 9, 2], [14, 17, 19, 3], [10, 8, 5, 0], [13, 13, 14, 1]] as const) p.blade(x, 14, lx, 10, tx, ty, 2, LEAF);
    p.ellipse(10, 14, 9, 2.4, LEAF, { bias: 0.3 });
    p.outline();
}
function wheat (p: Pix, rnd: () => number) {
    const S = RAMP.straw;
    for (const [x, lean, h] of [[3, -1, 17], [8, 1, 20], [13, 0, 18], [18, -1, 20], [23, 1, 16]] as const) {
        p.blade(x, 22, x + lean * 0.3, 22 - h * 0.5, x + lean, 22 - h, 1, LEAF);
        // the ear: a column of grains, each a pair leaning outwards, and a tip
        for (let k = 0; k < 4; k++) { const yy = 23 - h + k * 2.4 + 1.5; p.ellipseRot(x + lean - 1.1, yy, 1.1, 1.8, -0.5, S, { bias: 0.1 }); p.ellipseRot(x + lean + 1.1, yy + 0.6, 1.1, 1.8, 0.5, S, { bias: 0.1 }); }
        p.line(x + lean, 23 - h - 2, x + lean, 23 - h + 2, S[2]);
    }
    for (const [x, tx] of [[2, -3], [10, 6], [16, 21], [22, 27]] as const) p.blade(x, 22, (x + tx) / 2, 17, tx, 18, 1.4, LEAF);
    p.speckle(S, rnd, 0.1, 0.05);
    p.outline();
}

function carrot (p: Pix) {
    const O = RAMP.pumpkin;
    for (const x of [5, 12, 19]) {
        p.ellipse(x, 16, 3, 3.4, O, { bias: 0.1 });
        p.blade(x, 14, x - 3, 9, x - 5, 5, 1.5, LEAF); p.blade(x, 14, x, 8, x, 2, 1.5, LEAF); p.blade(x, 14, x + 3, 9, x + 5, 5, 1.5, LEAF);
    }
    p.outline((c) => (O.includes(c) ? mixc(O[0], INK, 0.55) : outlineOf(c)));
}

function beet (p: Pix) {
    const R = [0x6a2a52, 0x9a3a6a, 0xc85a8a, 0xe888aa];
    for (const x of [5, 12, 19]) {
        p.ellipse(x, 12, 3.6, 3.2, R, { bias: 0.1 });
        p.blade(x, 9, x - 3, 5, x - 4, 1, 1.8, LEAF); p.blade(x, 9, x + 3, 5, x + 4, 1, 1.8, LEAF); p.blade(x, 9, x, 4, x, 0, 1.4, LEAF);
        p.set(x - 1, 4, RED[1]); p.set(x, 5, RED[1]);
    }
    p.outline((c) => (R.includes(c) ? mixc(R[0], INK, 0.55) : outlineOf(c)));
}
function corn (p: Pix) {
    const S = RAMP.straw;
    for (const [x, h] of [[6, 24], [15, 28], [24, 23]] as const) {
        const top = 31 - h;
        // a sturdy stalk, leaves angled up and out, a cob in its husk, a tassel on top
        p.rect(x - 1, top + 2, 3, h - 2, LEAF[1]); p.rect(x - 1, top + 2, 1, h - 2, LEAF[3]); p.rect(x + 1, top + 2, 1, h - 2, LEAF[0]);
        p.blade(x, 27, x - 4, 22, x - 8, 19, 2.2, LEAF); p.blade(x, 21, x + 4, 16, x + 8, 13, 2.2, LEAF);
        p.ellipseRot(x + 2.5, 18, 2.4, 4.6, 0.15, S, { bias: 0.1 });
        p.poly([[x + 1, 23], [x + 6, 23], [x + 4.5, 17]], LEAF[2]);
        p.blade(x, top + 3, x - 3, top - 1, x - 4, top + 1, 0.9, S); p.blade(x, top + 3, x + 3, top - 1, x + 4, top + 1, 0.9, S); p.line(x, top + 3, x, top - 1, S[2]);
    }
    p.outline();
}

function pepper (p: Pix, rnd: () => number) {
    p.ellipse(12, 10, 11, 5.5, LEAF, { bias: 0.2 }); p.ellipse(12, 6, 8, 4, LEAF, { bias: 0.15 });
    p.speckle(LEAF, rnd, 0.1, 0.08);
    for (const [x, y] of [[5, 11], [10, 13], [15, 11], [20, 12], [12, 8]] as const) p.ellipseRot(x, y, 1.6, 3.2, 0.2, RED, { bias: 0.1 });
    p.outline((c) => (RED.includes(c) ? berryOutline(c) : outlineOf(c)));
}
function flax (p: Pix) {
    const B = [0x3a5aa8, 0x5a8ad8, 0x9ac4f4, 0xd8ecff], G = [LEAF[1], LEAF[2], LEAF[3]];
    // stems fan out from the base; each carries a pale-blue flower and a pair of narrow leaves
    for (const [x, tx, h] of [[8, 2, 18], [12, 8, 22], [16, 17, 21], [20, 24, 17]] as const) {
        p.blade(x, 26, (x + tx) / 2, 26 - h * 0.55, tx, 26 - h, 1.1, G);
        for (const [t, side] of [[0.4, -1], [0.62, 1]] as const) p.ellipseRot(x + (tx - x) * t + side * 2.6, 26 - h * t, 2.6, 1, side * -0.5, LEAF, { bias: 0.1 });
        p.ellipse(tx, 26 - h, 2.5, 2.5, B, { bias: 0.1 }); p.set(tx, 26 - h, RAMP.straw[2]);
    }
    p.outline((c) => (B.includes(c) ? mixc(B[0], INK, 0.55) : outlineOf(c)));
}

function melon (p: Pix, rnd: () => number) {
    const M = [0x3a8a48, 0x62bc62, 0x86d874, 0xc2f0a4], D = 0x1f5a34;
    p.blade(2, 17, 9, 12, 24, 15, 1.2, LEAF);
    p.ellipse(12, 12, 10.5, 7.8, M, { bias: 0.35 });
    // dark stripes running from the stem end to the blossom end
    for (const k of [-3.2, -1.7, -0.3, 1.2, 2.7]) {
        for (let y = 4; y <= 20; y++) {
            const t = (y - 12) / 7.8; if (Math.abs(t) > 0.96) continue;
            const x = 12 + k * 3.2 * Math.sqrt(1 - t * t);
            if (Math.abs(x - 12) < 10.4 * Math.sqrt(1 - t * t)) { p.set(Math.round(x), y, D); p.set(Math.round(x) + 1, y, y % 2 ? D : M[0]); }
        }
    }
    p.speckle(M, rnd, 0.03, 0.03);
    p.ellipse(7.5, 8, 2.6, 1.5, [M[3]]);
    p.rect(11, 3, 3, 3, WOOD[1]); p.rect(11, 3, 1, 3, WOOD[3]);
    p.outline();
}

function pumpkin (p: Pix) {
    const O = RAMP.pumpkin;
    for (const [cx, rx] of [[7, 6.5], [17, 6.5], [12, 6.2]] as const) p.ellipse(cx, 12, rx, 7.2, O, { bias: 0.15 });
    for (const x of [8, 12, 16]) for (let y = 6; y < 18; y++) p.set(x, y, O[0]);
    p.ellipse(8, 9, 2.4, 1.6, [O[3]]);
    p.rect(11, 2, 3, 4, WOOD[1]); p.rect(11, 2, 1, 4, WOOD[3]);
    p.blade(14, 4, 19, 1, 22, 4, 1.8, LEAF);
    p.outline((c) => (O.includes(c) ? mixc(O[0], INK, 0.55) : outlineOf(c)));
}

// ── the Titans: the biggest tree and the biggest boulder in the world ─────
// (dense grids: 56×64 is a 28×32 unit tree, nearly two tiles wide and two tall: it stands on one tile like any node)
function titanOak (p: Pix, rnd: () => number) {
    const cx = 28;
    // roots flare out at the foot, then a trunk that tapers and splits into the crown
    for (let y = 36; y <= 62; y++) {
        const w = y < 44 ? 9 : y < 52 ? 11 : y < 57 ? 15 : y < 60 ? 21 : 27;
        const x0 = cx - Math.floor(w / 2);
        for (let i = 0; i < w; i++) { const t = i / (w - 1); p.set(x0 + i, y, t < 0.22 ? WOOD[4] : t < 0.5 ? WOOD[3] : t < 0.78 ? WOOD[2] : t < 0.92 ? WOOD[1] : WOOD[0]); }
    }
    // bark seams, a knot-hole with a dark inside, and two big roots on the ground
    for (let y = 38; y < 58; y += 4) { p.set(cx - 2, y, WOOD[1]); p.set(cx - 1, y + 1, WOOD[1]); p.set(cx + 2, y + 2, WOOD[0]); }
    p.ellipse(cx - 1, 49, 2.6, 3.6, [WOOD[0], 0x2a1d2c], { bias: 0.1 });
    p.line(cx - 12, 62, cx - 17, 63, WOOD[1]); p.line(cx + 12, 62, cx + 17, 63, WOOD[0]);
    // the crown: a mountain of lit balls of leaves
    const clumps = [[12, 33, 11, 9], [44, 33, 11, 9], [28, 35, 14, 7], [8, 22, 8, 8], [48, 22, 8, 8], [28, 20, 24, 15], [16, 11, 11, 9], [40, 11, 11, 9], [28, 7, 13, 8]];
    for (const [x, y, rx, ry] of clumps) p.ellipse(x, y, rx, ry, LEAF, { bias: 0.15 });
    p.speckle(LEAF, rnd, 0.1, 0.08);
    // moss on the high branches, and a scatter of golden acorns and apples
    for (const [x, y] of [[20, 14], [34, 9], [10, 24], [44, 26], [27, 28], [49, 18]]) p.ellipse(x, y, 3.4, 2.2, RAMP.leafDeep, { bias: 0.2 });
    for (const [x, y] of [[14, 20], [38, 16], [26, 24], [46, 31], [8, 31], [31, 5]]) { p.rect(x, y, 2, 2, RED[1]); p.set(x, y, RED[3]); p.set(x + 1, y + 1, RED[0]); }
    for (const [x, y] of [[22, 31], [41, 23], [18, 8]]) { p.rect(x, y, 2, 2, RAMP.gold[2]); p.set(x, y, RAMP.gold[3]); }
    p.outline((c) => (c === RED[1] || c === RED[3] || c === RED[0] ? berryOutline(c) : RAMP.gold.includes(c) ? mixc(RAMP.gold[0], INK, 0.6) : outlineOf(c)));
}

function titanPine (p: Pix, rnd: () => number) {
    const P = RAMP.pine, SNOW = [0xb8d4e4, 0xdcecf4, 0xf4fbff];
    for (let y = 52; y <= 62; y++) for (let x = 24; x < 33; x++) p.set(x, y, x < 26 ? WOOD[3] : x < 30 ? WOOD[2] : WOOD[1]);
    // five tiers of branches, widest at the bottom, each with a ragged skirt and snow on its upper edges
    const tiers: [number, number, number][] = [[36, 58, 26], [26, 46, 22], [17, 36, 17], [9, 27, 12], [0, 17, 8]];   // [top y, bottom y, half width at the bottom]
    for (const [top, bot, hw] of tiers) {
        for (let y = top; y <= bot; y++) {
            const half = ((y - top) / (bot - top)) * hw + 0.8;
            const skirt = y >= bot - 2 ? ((y + 1) % 3) * 1.4 : 0;
            for (let x = Math.round(28 - half + skirt); x <= Math.round(28 + half - skirt - 1); x++) {
                const u = (x - (28 - half)) / (2 * half), edge = Math.min(x - (28 - half), 28 + half - x);
                let c = u < 0.3 ? P[3] : u < 0.62 ? P[2] : u < 0.84 ? P[1] : P[0];
                if (y >= bot - 3) c = u < 0.5 ? P[1] : P[0];
                else if (y < top + (bot - top) * 0.7 && edge < 3 + rnd() * 2) c = edge < 1.6 ? SNOW[2] : SNOW[1 + (u > 0.55 ? -1 : 0)];
                p.set(x, y, c);
            }
        }
    }
    for (const [x, y] of [[20, 40], [36, 30], [28, 22], [30, 48]]) { p.rect(x, y, 2, 2, RAMP.gold[2]); p.set(x, y, RAMP.gold[3]); }
    p.outline((c) => (SNOW.includes(c) ? mixc(P[1], INK, 0.55) : RAMP.gold.includes(c) ? mixc(RAMP.gold[0], INK, 0.6) : outlineOf(c)));
}

function titanBoulder (p: Pix, rnd: () => number) {
    const R = STONE, n = R.length, G = RAMP.ice;
    const shade = (a: number, b: number, off: number) => (u: number, v: number) => R[Math.max(0, Math.min(n - 1, Math.floor((off - (a * u + b * v)) * n)))];
    // a tall craggy block, its right face turned from the light, and a lower boulder leaning in front of it on the left
    p.poly([[6, 37], [3, 27], [6, 15], [13, 7], [23, 2], [33, 3], [42, 9], [48, 19], [50, 30], [47, 37]], shade(0.62, 0.78, 1.12));
    p.poly([[33, 3], [42, 9], [48, 19], [50, 30], [47, 37], [30, 37], [34, 20]], shade(0.5, 0.62, 0.78));
    p.poly([[1, 37], [2, 29], [7, 23], [15, 24], [19, 31], [18, 37]], shade(0.55, 0.7, 1.08));
    // a lit ridge, deep cracks, and a dark foot so it sits on the ground
    p.line(11, 10, 22, 4, R[n - 1]); p.line(4, 22, 8, 18, R[n - 2]);
    p.line(26, 5, 24, 14, R[0]); p.line(24, 14, 28, 22, R[0]); p.line(28, 22, 25, 31, R[0]); p.line(28, 22, 33, 26, R[0]);
    p.line(41, 14, 44, 24, R[1]); p.line(14, 30, 17, 36, R[0]);
    p.speckle(R, rnd, 0.05, 0.05);
    for (let x = 4; x < 49; x++) { p.set(x, 37, mixc(R[0], INK, 0.35)); if (x % 2 === 0) p.set(x, 36, R[0]); }
    // moss along the top and in the gap between the two boulders
    for (const [x, y, rx, ry] of [[22, 6, 7, 2.6], [36, 9, 5, 2.4], [11, 23, 4.5, 2.2], [44, 17, 3, 2]] as const) p.ellipse(x, y, rx, ry, RAMP.leaf, { bias: 0.2 });
    // veins of blue crystal set into the stone: this one is worth the trouble (and not a gold vein)
    for (const [x, y, r] of [[22, 20, 3.4], [37, 18, 3], [33, 29, 3.6], [12, 31, 2.4], [28, 12, 2.2]] as const) {
        p.poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], (u, v) => G[Math.max(0, Math.min(G.length - 1, Math.floor((1.1 - (u * 0.6 + v * 0.7)) * G.length)))]);
        p.set(Math.round(x - r * 0.35), Math.round(y - r * 0.45), G[G.length - 1]);
    }
    p.outline((c) => (G.includes(c) ? mixc(G[0], INK, 0.6) : RAMP.leaf.includes(c) ? mixc(RAMP.leaf[0], INK, 0.5) : outlineOf(c)));
}

/** Everything painted so far. */
export function registerStorybookNature (scene: Phaser.Scene) {
    paint(scene, 'tree', 16, 18, tree, 7);
    paint(scene, 'pine', 16, 17, pine, 5);
    paint(scene, 'rock', 16, 12, (p, r) => { boulder(p, r); p.outline(); }, 3);
    paint(scene, 'ore_iron', 16, 12, (p, r) => ore(p, r, RAMP.iron), 3);
    paint(scene, 'ore_gold', 16, 12, (p, r) => ore(p, r, RAMP.gold), 3);
    paint(scene, 'ore_coal', 16, 12, (p, r) => ore(p, r, RAMP.coal), 3);
    paint(scene, 'ore_copper', 16, 12, (p, r) => ore(p, r, RAMP.copper), 3);
    paint(scene, 'bush', 16, 12, bush, 9);
    paint(scene, 'flower', 10, 10, flower, 2);
    paint(scene, 'mushroom', 12, 11, (p) => mushroom(p, RAMP.red, 0xfff6e0), 4);
    paint(scene, 'mushroom_bog', 12, 11, (p) => mushroom(p, RAMP.violet, 0xbdf4ee), 4);
    paint(scene, 'sand', 16, 8, (p, r) => { mound(p, r, RAMP.sand, 32, 16, true); p.outline(); }, 5);
    paint(scene, 'clay', 14, 8, clay, 6);
    paint(scene, 'peat', 13, 8, peat, 7);
    paint(scene, 'crystal', 16, 10, (p) => crystal(p), 1);
    paint(scene, 'reeds', 12, 9, (p) => reeds(p), 1);
    paint(scene, 'herb', 12, 8, (p) => herb(p), 1);
    paint(scene, 'cottonplant', 12, 8, (p, r) => cottonPlant(p, r, [[6, 5], [12, 3], [18, 6]]), 3);
    paint(scene, 'chest', 14, 10, (p) => chest(p), 1);
    paint(scene, 'vault', 18, 12, (p) => chest(p, true), 1);
    paint(scene, 'crop1', 7, 5, (p) => seedling(p), 1);
    paint(scene, 'crop2', 11, 8, (p) => sprouting(p), 1);
    paint(scene, 'crop_wheat', 13, 13, wheat, 3);
    paint(scene, 'crop_carrot', 13, 10, (p) => carrot(p), 1);
    paint(scene, 'crop_cotton', 13, 8, (p, r) => cottonPlant(p, r, [[5, 6], [12, 4], [19, 7]]), 5);
    paint(scene, 'crop_beet', 13, 8, (p) => beet(p), 1);
    paint(scene, 'crop_corn', 16, 16, (p) => corn(p), 1);
    paint(scene, 'crop_pepper', 13, 8, pepper, 4);
    paint(scene, 'crop_flax', 15, 14, (p) => flax(p), 1);
    paint(scene, 'crop_melon', 13, 11, melon, 2);
    paint(scene, 'pumpkin', 13, 10, (p) => pumpkin(p), 1);
    paint(scene, 'crop_pumpkin', 13, 10, (p) => pumpkin(p), 1);
    paint(scene, 'titan_oak', 28, 32, titanOak, 11);
    paint(scene, 'titan_pine', 28, 32, titanPine, 5);
    paint(scene, 'titan_rock', 28, 20, titanBoulder, 3);
}
