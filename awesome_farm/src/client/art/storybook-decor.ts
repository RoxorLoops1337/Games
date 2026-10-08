// Painted decorations and floors: hedges, planters, statue, banners, fountain, walls, barrels and the
// floor tiles friends use to make the farm their own.

import { INK, mixc, outlineOf, paint, paintFrames, paintTexture, Pix, RAMP, RNG } from './paint';
import { IRON, lit, planks, steel } from './storybook-build';

const W = RAMP.wood, ST = RAMP.stone, LEAF = RAMP.leaf, CR = RAMP.cream, RD = RAMP.red, TH = RAMP.thatch;

function hedge (p: Pix, rnd: () => number) {
    // a clipped, rounded block of leaves on a little trunk
    p.rect(14, 28, 8, 7, W[1]); p.rect(14, 28, 3, 7, W[3]);
    p.ellipse(18, 18, 16.5, 14, LEAF, { bias: 0.2 });
    p.ellipse(11, 14, 10, 8, LEAF, { bias: 0.15 });
    p.ellipse(26, 16, 9, 8, LEAF, { bias: 0.35 });
    p.speckle(LEAF, rnd, 0.1, 0.1);
    for (const [x, y] of [[8, 12], [15, 8], [24, 12], [28, 20], [12, 22]] as const) { p.rect(x, y, 2, 1, LEAF[4]); p.set(x + 1, y + 1, LEAF[3]); }
    p.outline();
}

function flowerbed (p: Pix, rnd: () => number) {
    // a timber planter of dark earth with a cluster of blooms
    lit(p, 2, 20, 32, 14, W);
    p.rect(4, 22, 28, 8, 0x4a2f2a);
    for (let x = 5; x < 31; x++) { p.set(x, 22, 0x6a432f); if (rnd() < 0.3) p.set(x, 23, 0x6a432f); }
    p.rect(2, 31, 32, 3, W[1]); p.rect(2, 31, 32, 1, W[3]);
    const blooms: [number, number, number][] = [[7, 12, 0xf79fc6], [14, 8, 0xffd966], [21, 11, 0xe85d62], [28, 9, 0xcdf4ee], [10, 17, 0xffd966], [25, 16, 0xf79fc6], [17, 15, 0xfff6e0]];
    for (const [x, y, c] of blooms) {
        p.line(x, y + 3, x, 22, LEAF[1]); p.line(x + 1, y + 4, x + 1, 22, LEAF[2]);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.ellipse(x + 0.5 + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.7, 1.7, [mixc(c, INK, 0.2), c, mixc(c, 0xffffff, 0.4)], { bias: 0.2 }); }
        p.ellipse(x + 0.5, y, 1.5, 1.5, [0xd49a1a, 0xfff3b0]);
    }
    p.ellipse(18, 22, 15, 3, LEAF, { bias: 0.3 });
    p.outline();
}

function statue (p: Pix) {
    // a mossy stone figure with a leaf crown, on a plinth
    lit(p, 3, 38, 30, 12, ST); p.rect(4, 39, 28, 2, ST[4]);
    lit(p, 6, 34, 24, 5, ST);
    p.ellipse(18, 27, 8.5, 9, ST, { bias: 0.2 });
    p.ellipse(18, 14, 6.5, 7, ST, { bias: 0.25 });
    p.ellipse(9, 28, 2.4, 5, ST); p.ellipse(27, 28, 2.4, 5, ST, { bias: 0.4 });
    for (const [x, y, w] of [[14, 22, 5], [20, 30, 4], [8, 36, 6], [24, 41, 5]] as const) p.rect(x, y, w, 1, LEAF[1]);
    p.set(15, 14, ST[0]); p.set(21, 14, ST[0]); p.rect(16, 18, 4, 1, ST[1]);
    for (let i = 0; i < 4; i++) p.ellipseRot(18 + (i - 1.5) * 3.6, 8.5 - (i === 1 || i === 2 ? 1.5 : 0), 2.6, 1.3, (i - 1.5) * 0.45, LEAF, { bias: 0.1 });
    p.speckle(ST, RNG(5), 0.02, 0.05);
    p.outline();
}

function banner (p: Pix, f: number) {
    // a pole, a cross-beam and a red banner with a gold sun; it ripples a little in the second frame
    p.rect(17, 4, 3, 42, W[1]); p.rect(17, 4, 1, 42, W[3]);
    lit(p, 14, 44, 10, 5, ST);
    lit(p, 5, 0, 26, 4, W);
    const w = f ? 1 : 0;
    p.poly([[7 + w, 4], [29 - w, 4], [29 - w - f, 26], [18, 34 + f], [7 + w + f, 26]], (u, v) => (u < 0.2 ? RD[2] : u < 0.8 ? RD[1] : RD[0]) + 0 * v);
    p.rect(7 + w, 4, 22 - 2 * w, 3, RD[3]);
    p.ellipse(18, 16, 5.5, 5.5, RAMP.brass, { bias: 0.1 });
    for (let a = 0; a < 8; a++) { const an = (a / 8) * Math.PI * 2; p.set(Math.round(18 + Math.cos(an) * 7.6), Math.round(16 + Math.sin(an) * 7.6), RAMP.brass[2]); }
    p.outline();
}

function table (p: Pix, laid = 0) {
    for (const x of [5, 59]) lit(p, x, 18, 5, 17, W);
    p.rect(8, 28, 52, 2, W[1]);
    p.poly([[2, 14], [66, 14], [64, 8], [4, 8]], W[4]);
    planks(p, 1, 14, 66, 5, false, W, 3);
    if (laid) {
        // frame 1, when dishes are set out: a clean cream runner with a red hem for the little dish icons to stand on (the world view draws them)
        p.poly([[6, 13], [62, 13], [61, 8], [7, 8]], (u, v) => (v < 0.35 ? CR[3] : CR[2]) + 0 * u);
        p.rect(6, 13, 56, 1, RD[1]); p.rect(6, 12, 56, 1, RD[2]);
    } else {
        // a spread: two plates with bread, a pumpkin and a cup
        for (const [x, c] of [[16, 0xe8bc84], [52, 0xe85d62]] as const) { p.ellipse(x, 9, 7, 2.8, CR, { bias: 0.2 }); p.ellipse(x, 8, 3.8, 2.6, [mixc(c, INK, 0.3), c, mixc(c, 0xffffff, 0.35)], { bias: 0.2 }); }
        p.ellipse(34, 8, 4.6, 4, RAMP.pumpkin, { bias: 0.15 }); p.rect(33, 3, 2, 2, W[1]); p.blade(35, 4, 38, 2, 39, 4, 1.2, LEAF);
    }
    p.outline();
}

function signpost (p: Pix) {
    p.rect(16, 8, 3, 36, W[1]); p.rect(16, 8, 1, 36, W[3]);
    p.poly([[1, 5], [24, 5], [30, 10], [24, 15], [1, 15]], (u, v) => (v < 0.3 ? W[4] : W[3]) + 0 * u);
    p.rect(1, 5, 23, 1, W[4]); p.rect(5, 9, 15, 2, W[1]); p.rect(5, 12, 10, 1, W[1]);
    p.poly([[10, 20], [33, 20], [33, 29], [10, 29], [6, 25]], (u, v) => (v < 0.3 ? W[4] : W[3]) + 0 * u);
    p.rect(14, 24, 15, 2, W[1]);
    p.outline();
}

function mailbox (p: Pix, up: number) {
    // a post and a blue box with a rounded lid; a red flag lies along its side, and stands up when there is post waiting
    const BX = [0x2d6ea6, 0x4ab2cf, 0x74cce0, 0xcdf4ee];
    p.rect(14, 26, 4, 24, W[1]); p.rect(14, 26, 1, 24, W[3]); p.rect(11, 47, 10, 3, W[0]); p.rect(11, 47, 10, 1, W[2]);
    p.rect(8, 24, 18, 3, W[2]); p.rect(8, 24, 18, 1, W[4]);
    p.poly([[3, 25], [3, 15], [8, 8], [20, 8], [25, 15], [25, 25]], (u, v) => BX[Math.min(3, Math.floor(v * 3.2 + (1 - u) * 0.6))]);
    p.rect(8, 17, 15, 1, BX[0]);                                  // the seam of the lid
    p.rect(11, 19, 9, 1, BX[3]); p.rect(12, 21, 7, 1, BX[0]);     // the letter slot and its shadow
    p.rect(21, 20, 2, 2, 0xffd966);                               // a brass latch
    if (up) {
        p.rect(27, 4, 2, 17, W[1]); p.rect(27, 4, 1, 17, W[3]);
        p.poly([[29, 4], [29, 11], [35, 7]], (u, v) => (v < 0.5 ? 0xf58c90 : 0xe85d62) + 0 * u);
    } else {
        p.rect(26, 20, 7, 2, 0xe85d62); p.rect(26, 20, 7, 1, 0xf58c90);
    }
    p.outline();
}

function lamppost (p: Pix, f: number) {
    // an iron post and a glass lantern; the second frame burns a little brighter
    p.rect(17, 18, 3, 38, IRON[1]); p.rect(17, 18, 1, 38, IRON[3]);
    lit(p, 11, 52, 14, 6, IRON);
    steel(p, 9, 2, 18, 4);
    p.poly([[10, 5], [26, 5], [24, 19], [12, 19]], (u, v) => (f ? (v < 0.4 ? 0xfffadc : 0xffe58a) : (v < 0.4 ? 0xffe58a : 0xf8b648)) + 0 * u);
    p.rect(17, 5, 3, 14, f ? 0xffd060 : 0xe89a30); p.rect(10, 5, 1, 14, IRON[2]); p.rect(25, 5, 1, 14, IRON[2]);
    p.poly([[8, 2], [28, 2], [18, -3]].map(([x, y]) => [x, Math.max(0, y)]) as [number, number][], IRON[2]);
    p.rect(8, 0, 20, 2, IRON[3]);
    p.outline((c) => (c === 0xfffadc || c === 0xffe58a || c === 0xf8b648 || c === 0xffd060 || c === 0xe89a30 ? 0x9a5a1a : outlineOf(c)));
}

function fountain (p: Pix, f: number) {
    // a round stone basin, a column and plumes of water; the water shimmers between the two frames
    p.ellipse(32, 44, 29, 14, [0x585c7c, 0x7a7f9e, 0x9ea4bf], { bias: 0.1 });
    p.ellipse(32, 42, 27, 12, [0x7a7f9e, 0x9ea4bf, 0xc4c9dc], { bias: 0.3 });
    p.ellipse(32, 42, 23, 10, [0x2f8fb8, 0x4ab2cf, 0x74cce0], { bias: 0.4 });
    p.ellipse(28, 40, 15, 5, [0x74cce0, 0xaee8f0], { bias: 0.1 });
    for (const [x, y] of [[12, 40], [48, 44], [22, 46], [40, 38]] as const) { p.set(x + f * 2, y, 0xffffff); p.set(x + 1 + f * 2, y, 0xe8fbff); }
    lit(p, 28, 16, 9, 26, [0x7a7f9e, 0x9ea4bf, 0xc4c9dc, 0xe4e7f2, 0xffffff]);
    p.ellipse(32, 15, 10, 4, [0x7a7f9e, 0x9ea4bf, 0xc4c9dc], { bias: 0.3 });
    p.ellipse(32, 14, 6.5, 2.4, [0x4ab2cf, 0x74cce0]);
    // the water arching out of the top and falling into the basin
    for (const [dx, dy, c] of [[0, 4 + f, 0xffffff], [-6, 8 + f, 0xcdf4ee], [6, 8 + f, 0xcdf4ee], [-9, 14 - f, 0xaee8f0], [9, 14 - f, 0xaee8f0], [-3, 6 - f, 0xe8fbff], [3, 6 - f, 0xe8fbff]] as const) { p.rect(32 + dx - 1, dy, 2, 2, c); }
    p.outline();
}

function stonewall (p: Pix) {
    lit(p, 0, 8, 36, 24, ST);
    p.rect(0, 8, 36, 4, ST[4]); p.rect(0, 11, 36, 1, ST[2]);
    // a course of stones, staggered
    for (const [y, xs] of [[13, [0, 11, 24]], [21, [5, 18, 30]]] as const) {
        p.rect(1, y + 6, 34, 1, ST[1]);
        for (const x of xs) p.rect(x, y, 1, 7, ST[1]);
        for (const x of xs) p.set(x + 2, y + 2, ST[4]);
    }
    p.speckle(ST, RNG(4), 0.08, 0.06);
    for (const [x, y] of [[8, 12], [26, 24]] as const) p.rect(x, y, 3, 1, LEAF[1]);
    p.outline();
}

function barrel (p: Pix) {
    // staves bulging in the middle, two iron hoops, a lid
    p.ellipse(18, 20, 14, 15, W, { bias: 0.2 });
    for (let x = 6; x < 31; x += 5) for (let y = 7; y < 33; y++) if (p.get(x, y) !== -1) p.set(x, y, W[1]);
    for (const y of [10, 27]) for (let x = 3; x < 33; x++) { if (p.get(x, y) !== -1) { p.set(x, y, IRON[2]); p.set(x, y + 1, IRON[1]); } }
    p.ellipse(18, 7, 10.5, 3.6, [W[2], W[3], W[4]], { bias: 0.1 }); p.ellipse(18, 7, 8, 2.6, [W[3], W[4]]);
    p.outline();
}

function haybale (p: Pix, rnd: () => number) {
    const S = RAMP.straw;
    lit(p, 1, 9, 34, 24, S);
    p.rect(1, 9, 34, 4, S[3]);
    for (const x of [9, 18, 27]) { p.rect(x, 9, 1, 24, TH[1]); p.rect(x + 1, 9, 1, 24, S[1]); }
    for (let k = 0; k < 40; k++) { const x = 2 + Math.floor(rnd() * 32), y = 10 + Math.floor(rnd() * 22); p.set(x, y, k % 2 ? S[3] : S[0]); p.set(x + 1, y, k % 2 ? S[3] : S[0]); }
    for (let i = 0; i < 12; i++) { p.set(2 + i * 3, 8 + (i % 2), S[2]); p.set(3 + i * 3, 7 + (i % 3), S[3]); }
    p.outline();
}

function scarecrow (p: Pix) {
    p.rect(17, 14, 3, 34, W[1]); p.rect(17, 14, 1, 34, W[3]);
    lit(p, 2, 20, 32, 4, W);
    // a sack-cloth head under a purple hat, and a pink shirt
    p.ellipse(18, 12, 6, 6.5, [0xc89a60, 0xe8c48a, 0xf8ddb0], { bias: 0.2 });
    p.set(15, 11, 0x3a2433); p.set(21, 11, 0x3a2433); p.rect(16, 15, 4, 1, 0xa83a46);
    p.poly([[6, 8], [18, -1], [30, 8]].map(([x, y]) => [x, Math.max(0, y)]) as [number, number][], RAMP.violet[2]);
    lit(p, 4, 6, 28, 3, RAMP.violet);
    lit(p, 10, 24, 16, 14, [0xcf6a8a, 0xe58aa8, 0xf5a9c0, 0xffd0e0]);
    p.rect(10, 33, 16, 2, RAMP.pumpkin[2]);
    // straw sticking out of the sleeves
    for (const x of [0, 30]) for (let k = 0; k < 4; k++) { p.set(x + k, 22 + (k % 2) * 2, RAMP.straw[2]); p.set(x + k, 24 + k % 2, RAMP.straw[1]); }
    p.outline();
}

function weathervane (p: Pix) {
    // a wooden post on a stone foot, a cross of iron under the top and a brass ball to carry the arrow (the arrow is its own picture: it turns)
    lit(p, 8, 50, 16, 6, ST); p.rect(9, 51, 14, 1, ST[4]);
    p.rect(14, 9, 4, 42, W[2]); p.rect(14, 9, 1, 42, W[3]); p.rect(17, 9, 1, 42, W[1]);
    p.rect(5, 23, 22, 2, IRON[2]); p.rect(5, 23, 22, 1, IRON[3]); p.rect(5, 25, 22, 1, IRON[1]);
    for (const x of [4, 27]) { p.ellipse(x + 0.5, 24, 1.8, 1.8, [RAMP.brass[1], RAMP.brass[2], RAMP.brass[3]], { bias: 0.1 }); }
    lit(p, 13, 22, 6, 4, IRON);
    p.ellipse(16, 8, 3, 3, RAMP.brass, { bias: 0.1 });
    p.rect(15, 3, 2, 5, IRON[2]);
    p.outline();
}

/** The arrow of the weather vane, pointing east; the world turns it by squashing it sideways, like a vane seen from the side. */
function vaneArrow (p: Pix) {
    p.rect(5, 4, 17, 2, IRON[2]); p.rect(5, 4, 17, 1, IRON[3]);
    p.poly([[21, 0], [28, 5], [21, 10]], (u) => (u < 0.5 ? RAMP.brass[3] : RAMP.brass[2]));
    p.poly([[0, 0], [8, 0], [11, 5], [8, 10], [0, 10], [3, 5]], (u, v) => (v < 0.4 ? RD[2] : RD[1]) + 0 * u);
    p.rect(0, 0, 8, 1, RD[3]);
    p.outline();
}

// ── floors: 32×32 tiles that join seamlessly, with no outline ──────────────
function floor (kind: string) {
    const T = 32, rnd = RNG(kind.length * 17), p = new Pix(T, T);
    switch (kind) {
        case 'path': {
            const base = [0xb8946a, 0xcaa87c, 0xdcc090];
            p.rect(0, 0, T, T, base[1]);
            for (let k = 0; k < 14; k++) { const x = 2 + Math.floor(rnd() * 28), y = 2 + Math.floor(rnd() * 28); p.ellipse(x, y, 2 + rnd() * 1.5, 1.4 + rnd(), [base[0], base[2]], { bias: 0.2 }); }
            for (let k = 0; k < 24; k++) p.set(Math.floor(rnd() * T), Math.floor(rnd() * T), k % 2 ? base[2] : base[0]);
            break;
        }
        case 'plank': {
            const w = RAMP.wood;
            for (let y = 0; y < T; y += 8) {
                const off = (y / 8) % 2 ? 11 : 0;
                for (let x = 0; x < T; x++) for (let j = 0; j < 8; j++) p.set(x, y + j, j === 0 ? w[3] : j === 7 ? w[1] : w[2]);
                for (let j = 0; j < 8; j++) { p.set(off % T, y + j, w[0]); p.set((off + 16) % T, y + j, w[0]); }
                for (let k = 0; k < 4; k++) p.set(Math.floor(rnd() * T), y + 2 + Math.floor(rnd() * 4), w[1]);
            }
            break;
        }
        case 'brick': {
            const b = [0x6a2a24, 0x9a4a36, 0xc0664a, 0xd88868];
            p.rect(0, 0, T, T, b[0]);
            for (let y = 0; y < T; y += 8) { const off = (y / 8) % 2 ? 8 : 0; for (let x = -16; x < T; x += 16) { const bx = x + off; p.rect(bx + 1, y + 1, 14, 6, b[2]); p.rect(bx + 1, y + 1, 14, 1, b[3]); p.rect(bx + 1, y + 6, 14, 1, b[1]); } }
            for (let k = 0; k < 18; k++) p.set(Math.floor(rnd() * T), Math.floor(rnd() * T), b[k % 2 ? 1 : 3]);
            // wrap: restore what the offset rows pushed past the edges
            break;
        }
        case 'carpet': {
            const r = [0x7a2438, 0xa8384c, 0xd05a68, 0xf08a90];
            p.rect(0, 0, T, T, r[1]);
            for (let i = 0; i < T; i++) { p.set(i, 0, 0x4b3a6b); p.set(i, T - 1, 0x4b3a6b); p.set(0, i, 0x4b3a6b); p.set(T - 1, i, 0x4b3a6b); p.set(i, 3, 0xe0a020); p.set(i, T - 4, 0xe0a020); p.set(3, i, 0xe0a020); p.set(T - 4, i, 0xe0a020); }
            for (let y = 8; y < T - 6; y += 6) for (let x = 8; x < T - 6; x += 6) { p.set(x, y, r[3]); p.set(x + 1, y, r[2]); p.set(x, y + 1, r[2]); p.set(x - 1, y, r[0]); p.set(x, y - 1, r[0]); }
            break;
        }
        default: {
            const s = [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc];
            p.rect(0, 0, T, T, s[0]);
            for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]] as const) { p.rect(x + 1, y + 1, 14, 14, (x + y) % 32 === 0 ? s[2] : s[1]); p.rect(x + 1, y + 1, 14, 1, s[3]); p.rect(x + 1, y + 1, 1, 14, s[3]); }
            for (let k = 0; k < 20; k++) p.set(Math.floor(rnd() * T), Math.floor(rnd() * T), k % 2 ? s[3] : s[0]);
        }
    }
    return p;
}

export function registerStorybookDecor (scene: Phaser.Scene) {
    paint(scene, 'hedge', 18, 18, hedge, 2);
    paint(scene, 'flowerbed', 18, 18, flowerbed, 6);
    paint(scene, 'statue', 18, 26, (p) => statue(p), 1);
    paintFrames(scene, 'banner', 18, 26, 2, (p, _r, f) => banner(p, f), 1);
    paintFrames(scene, 'table', 34, 18, 2, (p, _r, f) => table(p, f), 1);
    paint(scene, 'signpost', 18, 22, (p) => signpost(p), 1);
    paintFrames(scene, 'mailbox', 18, 26, 2, (p, _r, f) => mailbox(p, f), 1);
    paintFrames(scene, 'lamppost', 18, 30, 2, (p, _r, f) => lamppost(p, f), 1);
    paintFrames(scene, 'fountain', 32, 32, 2, (p, _r, f) => fountain(p, f), 1);
    paint(scene, 'stonewall', 18, 18, (p) => stonewall(p), 1);
    paint(scene, 'barrel', 18, 18, (p) => barrel(p), 1);
    paint(scene, 'haybale', 18, 18, haybale, 3);
    paint(scene, 'scarecrow', 18, 26, (p) => scarecrow(p), 1);
    paint(scene, 'weathervane', 16, 28, (p) => weathervane(p), 1);
    paint(scene, 'weathervane_arrow', 14, 5, (p) => vaneArrow(p), 1);
    for (const k of ['path', 'plank', 'brick', 'carpet', 'slate']) paintTexture(scene, `floor_${k}`, [floor(k)]);
}
