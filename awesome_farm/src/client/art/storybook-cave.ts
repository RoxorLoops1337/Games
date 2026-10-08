// The art of the caves under the world: tiles for the cave floor and the rock (with ore showing in it), and the Mine Shaft and its ladder.
// Everything is painted by code in the cozy storybook style: cool violet and teal stone, lit from the top left, a small glow where the cave is magical.
//
// Tile frames (32×32 px each, the same density as every other ground tile), in this order, appended after the shore frames of the tile sheet:
//    0–5    cave floor, six variants (plain, plain, plain, then three with a feature: pebbles, glowing mushrooms, a crack with a crystal glint)
//    6–8    rock seen from above (the top of a wall of rock): three plain variants
//    9–10   rock face: the front of a wall of rock, shown on a rock tile that has open floor to its south: two variants
//   11–15   rock from above with ore showing: coal, iron, copper, gold, crystal (in that order)
//   16–20   rock face with ore showing: coal, iron, copper, gold, crystal
// Rock is rock-coloured, the floor is darker and cooler; everything is lit from the top left; nothing paints a ground shadow.
// Every tile keeps its features a few pixels inside its edge and paints its edge in the plain base colour, so rows of one frame
// (and neighbours of different frames) read as one continuous surface; the strata of the faces wrap round exactly once per tile.

import { INK, mixc, paint, Pix, RAMP, RNG } from './paint';
import { IRON, lit } from './storybook-build';

export const CAVE_FRAMES = 21;

const T = 32;

/** The cave's colours: floor (dark, cool), rock seen from above (lighter), rock face (the dark front of the wall). */
const FL = { base: 0x413c58, dark: 0x35314b, deep: 0x2b2840, light: 0x504b6b, glint: 0x645f86 };
const RK = { base: 0x6f6a8a, hi: 0x8e89aa, bright: 0xaaa6c6, sh: 0x58537a, deep: 0x46416a };
const FC = { base: 0x4a4566, dark: 0x35314b, light: 0x5f5a80, deep: 0x2a2640, foot: 0x1b1829 };
const SHROOM = [0x2f8a8a, 0x4fb8ac, 0x7ad6c8, 0xbdf5ea];
const COAL = [0x12101a, 0x25222f, 0x3d394f, 0x6a6684, 0xaeaacb];

const inside = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo));

/** Mix a colour into what is already painted at a pixel. */
function blend (p: Pix, x: number, y: number, c: number, t: number) {
    const o = p.get(x, y);
    if (o !== -1) p.set(x, y, mixc(o, c, t));
}

/** A soft banded glow of colour `c` on what is painted (three flat bands, so it stays pixel art). */
function halo (p: Pix, cx: number, cy: number, r: number, c: number, strength: number) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d >= r) continue;
            blend(p, x, y, c, d < r * 0.4 ? strength : d < r * 0.7 ? strength * 0.6 : strength * 0.3);
        }
    }
}

/** Paint a layer on its own, wrap it in a dark outline, and lay it on the tile (so only the decal gets an outline). */
function decal (p: Pix, draw: (d: Pix) => void, line: (c: number) => number = (c) => mixc(c, INK, 0.6)) {
    const d = new Pix(p.w, p.h);
    draw(d);
    d.outline(line);
    p.stamp(d, 0, 0);
}

/** A polygon shaded from the top left through the ramp (dark → light). */
function shaded (d: Pix, pts: [number, number][], ramp: readonly number[], lean = 0) {
    const n = ramp.length;
    d.poly(pts, (u, v) => ramp[Math.max(0, Math.min(n - 1, Math.floor((1.12 + lean - (0.62 * u + 0.78 * v)) * n)))]);
}

/** An irregular, roundish outline: `nv` corners at jittered radii. */
function blob (rnd: () => number, x: number, y: number, r: number, nv = 7, squash = 1, jitter = 0.4): [number, number][] {
    const a0 = rnd() * 6;
    return Array.from({ length: nv }, (_, i) => {
        const a = a0 + (i / nv) * Math.PI * 2, rr = r * (1 - jitter / 2 + rnd() * jitter);
        return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * squash];
    });
}

/** A four-point sparkle. */
function sparkle (p: Pix, x: number, y: number, c: number, arm = 2, core = 0xffffff) {
    p.set(x, y, core);
    for (let i = 1; i <= arm; i++) { const t = i === arm ? mixc(c, core, 0.2) : c; p.set(x - i, y, t); p.set(x + i, y, t); p.set(x, y - i, t); p.set(x, y + i, t); }
}

/** A pointed prism of ice-blue crystal standing on `by`: a lit left face, a darker right face, a pale edge and a glint; `lean` tilts its tip. */
function shard (d: Pix, cx: number, by: number, hw: number, h: number, lean = 0) {
    const I = RAMP.ice, top = by - h, tx = cx + lean, shoulder = by - Math.round(h * 0.72), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw), k = lean * 0.4;
    d.poly([[x0, by], [x0 + k, shoulder], [tx, top], [cx, by]], I[2]);
    d.poly([[tx, top], [x1 + k, shoulder], [x1, by], [cx, by]], I[1]);
    d.line(x0 + 1, by - 2, Math.round(x0 + 1 + k), shoulder + 1, I[3]);
    d.set(Math.round(tx) - 1, top + 3, I[3]); d.set(Math.round(tx) - 1, top + 4, I[3]); d.line(Math.round(tx), top + 2, Math.round(cx), by - 1, I[2]);
    for (let x = x0; x < x1; x++) d.set(x, by, I[0]);
    d.line(x1 - 1, by - 1, Math.round(x1 - 1 + k), shoulder + 1, I[0]);
}

// ── cave floor ─────────────────────────────────────────────────────────────

/** The floor of the caves: a cool, dark stone, mottled with softer and deeper patches, a scatter of grit and chips. */
function floorTile (v: number): Pix {
    const rnd = RNG(5000 + v * 37), p = new Pix(T, T);
    p.rect(0, 0, T, T, FL.base);
    // soft mottling: small irregular patches (two overlapping ovals each), a little darker or lighter than the floor
    for (let k = 0; k < 9; k++) {
        const rx = 2 + rnd() * 3, ry = 1.5 + rnd() * 2;
        const cx = inside(rnd, Math.ceil(rx) + 4, T - Math.ceil(rx) - 4), cy = inside(rnd, Math.ceil(ry) + 4, T - Math.ceil(ry) - 4);
        const c = mixc(FL.base, k % 3 === 0 ? FL.light : FL.dark, 0.5);
        p.ellipse(cx, cy, rx, ry, [c]); p.ellipse(cx + (rnd() - 0.5) * rx * 1.4, cy + (rnd() - 0.5) * ry, rx * 0.7, ry * 0.8, [c]);
    }
    // a lit sliver on the upper left of a patch or two, so the floor has a little relief (only on some variants, so it never repeats like a stamp)
    if (v % 3 !== 1) for (let k = 0; k < 2; k++) { const x = inside(rnd, 5, 22), y = inside(rnd, 5, 26), w = 2 + inside(rnd, 0, 3); p.rect(x, y, w, 1, FL.light); p.set(x + 1, y + 1, FL.dark); }
    // grit
    for (let k = 0; k < 18; k++) {
        const x = inside(rnd, 2, 29), y = inside(rnd, 2, 30), c = k % 3 === 0 ? FL.glint : k % 3 === 1 ? FL.light : FL.deep;
        p.set(x, y, c);
        if (k % 4 === 0) p.set(x + 1, y, c);
    }
    // small chips of stone: a lit sliver with a dark pixel under it
    for (let k = 0; k < 3; k++) { const x = inside(rnd, 3, 27), y = inside(rnd, 3, 28); p.rect(x, y, 2, 1, FL.light); p.set(x, y, FL.glint); p.set(x + 1, y + 1, FL.dark); }

    // a few flecks of mica and crystal dust that catch the light
    if (v < 3) for (let k = 0; k < 2 + (v === 2 ? 1 : 0); k++) { const x = inside(rnd, 4, 28), y = inside(rnd, 4, 28); p.set(x, y, 0x9cb4de); if (k === 0) { p.set(x - 1, y, 0x5e6e9e); p.set(x + 1, y, 0x5e6e9e); } }
    if (v === 1) {
        // a hairline crack, lit along its lower lip
        let x = inside(rnd, 4, 10), y = inside(rnd, 8, 22);
        for (let i = 0; i < 15; i++) { p.set(x, y, FL.deep); p.set(x, y + 1, FL.light); x += 1; if (rnd() < 0.45) y += rnd() < 0.5 ? -1 : 1; if (x > 27) break; }
    }
    if (v === 2) {
        // lichen: a few muted teal specks
        for (let k = 0; k < 5; k++) { const x = inside(rnd, 4, 27), y = inside(rnd, 4, 27); p.set(x, y, 0x4d7580); if (k % 2) p.set(x + 1, y, 0x5e8a8c); }
    }
    if (v === 3) {
        // a handful of pebbles, and one small glowing mushroom in a corner
        const spots: [number, number, number, number][] = [[9, 12, 2.7, 1.9], [20, 9, 1.8, 1.4], [17, 21, 3.1, 2.1], [25, 25, 1.7, 1.3], [8, 25, 1.5, 1.2]];
        const PEB = [0x3a3654, 0x5a5578, 0x7c779a, 0xa09cbc];
        for (const [x, y, rx, ry] of spots) p.ellipse(x + 1, y + 1, rx, ry, [FL.deep]);
        decal(p, (d) => { for (const [x, y, rx, ry] of spots) { d.ellipse(x, y, rx, ry, PEB, { bias: 0.25 }); d.set(Math.round(x - rx * 0.35), Math.round(y - ry * 0.4), PEB[3]); } });
        halo(p, 26, 13, 6, 0x7ad6c8, 0.2);
        decal(p, (d) => shroom(d, 26, 15, 0.8), (c) => mixc(c, 0x10202a, 0.65));
    }
    if (v === 4) {
        // a cluster of glowing mushrooms, with a few lichen specks round their feet
        for (let k = 0; k < 6; k++) { const x = inside(rnd, 5, 27), y = inside(rnd, 20, 28); p.set(x, y, 0x4d7580); }
        halo(p, 15, 15, 12, 0x7ad6c8, 0.2);
        decal(p, (d) => { shroom(d, 9, 21, 0.9); shroom(d, 21, 17, 1.0); shroom(d, 15, 24, 1.4); }, (c) => mixc(c, 0x10202a, 0.65));
    }
    if (v === 5) {
        // a crack across the floor with a blue crystal glint peeking out of it
        const pts: [number, number][] = [[4, 8], [8, 11], [11, 12], [14, 15], [16, 17], [19, 19], [22, 22], [25, 23], [28, 26]];
        for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], FL.deep);
        for (let i = 0; i < pts.length - 1; i++) {
            // the lower lip catches the light; the middle of the crack is wider and darker
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
            for (let k = 0; k <= n; k++) {
                const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
                if (p.get(x, y + 1) === FL.base || p.get(x, y + 1) === FL.dark || p.get(x, y + 1) === FL.light) p.set(x, y + 1, FL.light);
                if (i >= 2 && i <= 5) p.set(x + 1, y, 0x1f1c30);
            }
        }
        halo(p, 17, 15, 9, 0x8ac4e0, 0.2);
        decal(p, (d) => { shard(d, 13, 19, 2, 6, -1); shard(d, 20, 20, 2.5, 8, 1); shard(d, 16, 19, 2.6, 11, 0); }, () => mixc(RAMP.ice[0], INK, 0.55));
        sparkle(p, 16, 8, 0xbce8f4, 2);
        p.set(21, 12, 0xe8fbff); p.set(12, 13, 0xbce8f4);
    }
    return p;
}

/** A little glowing mushroom, standing with its foot at (x, y). */
function shroom (d: Pix, x: number, y: number, s: number) {
    // a pale stem, a domed cap (only the top half of an oval) with a dark rim underneath, and bright spots
    const sh = Math.max(3, Math.round(3.6 * s)), cr = 3.4 * s, ch = 3.2 * s, cy = y - sh;
    d.rect(x - 1, cy, 2, sh, 0xdcefea); d.rect(x, cy, 1, sh, 0x9fc4c2);
    d.set(x - 1, y - 1, 0xb4d6d2);
    for (let yy = Math.floor(cy - ch); yy <= cy; yy++) {
        for (let xx = Math.floor(x - cr); xx <= Math.ceil(x + cr); xx++) {
            const dx = (xx + 0.5 - x) / cr, dy = (yy + 0.5 - cy) / ch, r2 = dx * dx + dy * dy;
            if (r2 > 1) continue;
            const lightness = -(dx * 0.6 + dy * 0.75) + (1 - r2) * 0.5;
            d.set(xx, yy, SHROOM[lightness > 0.85 ? 3 : lightness > 0.45 ? 2 : lightness > 0.05 ? 1 : 0]);
        }
    }
    for (let xx = Math.round(x - cr + 1); xx <= Math.round(x + cr - 1); xx++) d.set(xx, cy + 1, SHROOM[0]);
    d.set(Math.round(x - cr * 0.4), Math.round(cy - ch * 0.55), 0xe8fff8);
    if (s > 1) d.set(Math.round(x + cr * 0.45), Math.round(cy - ch * 0.35), SHROOM[3]);
}

// ── rock ───────────────────────────────────────────────────────────────────

/** Rock seen from above: soft patches and rounded, lit lumps of stone with a little crevice shadow, a grain of speckle. */
function rockTop (v: number): Pix {
    const rnd = RNG(6000 + v * 53), p = new Pix(T, T);
    p.rect(0, 0, T, T, RK.base);
    for (let k = 0; k < 6; k++) {
        const rx = 3.5 + rnd() * 5, ry = 2.5 + rnd() * 3.5;
        const cx = inside(rnd, Math.ceil(rx) + 2, T - Math.ceil(rx) - 2), cy = inside(rnd, Math.ceil(ry) + 2, T - Math.ceil(ry) - 2);
        p.ellipse(cx, cy, rx, ry, [mixc(RK.base, k % 2 ? RK.hi : RK.sh, 0.55)]);
    }
    // lumps of stone on a loose grid, a few cells left empty
    const LUMP = [RK.sh, mixc(RK.sh, RK.base, 0.55), RK.base, RK.hi, RK.bright];
    const lumps: [number, number, number, number][] = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (rnd() < 0.3) continue;
        const rx = 2.6 + rnd() * 2.2, ry = 2 + rnd() * 1.8;
        lumps.push([8 + i * 8 + (rnd() - 0.5) * 3, 8 + j * 8 + (rnd() - 0.5) * 3, rx, ry]);
    }
    for (const [x, y, rx, ry] of lumps) p.ellipse(x + 1, y + 1.2, rx, ry, [mixc(RK.sh, RK.deep, 0.5)]);
    for (const [x, y, rx, ry] of lumps) p.ellipse(x, y, rx, ry, LUMP, { bias: 0.35 });
    // cracks and flecks
    const cracks = v === 1 ? 2 : 1;
    for (let k = 0; k < cracks; k++) {
        let x = inside(rnd, 4, 20), y = inside(rnd, 4, 27);
        for (let i = 0; i < 7; i++) { p.set(x, y, RK.deep); p.set(x + 1, y + 1, RK.hi); x += 1; if (rnd() < 0.5) y += rnd() < 0.5 ? -1 : 1; if (x > 28) break; }
    }
    for (let k = 0; k < 10; k++) p.set(inside(rnd, 2, 30), inside(rnd, 2, 30), k % 3 === 0 ? RK.bright : k % 3 === 1 ? RK.deep : RK.hi);
    if (v === 2) for (let k = 0; k < 3; k++) { const x = inside(rnd, 4, 27), y = inside(rnd, 4, 27); p.set(x, y, 0x62868e); p.set(x + 1, y, 0x78a0a0); }   // a little lichen
    p.speckle([RK.sh, RK.base, RK.hi], rnd, 0.05, 0.05);
    return p;
}

/**
 * The front of a wall of rock. The top rows carry on the colour of the rock above (so a face under a top reads as one wall),
 * with a lit rim and the shadow it casts; below it the wall is laid in rough courses of stone. The courses are wavy lines that
 * repeat exactly across the tile (so tiles join), their joints stay inside the tile, and the foot is dark where the wall meets the floor.
 */
function faceTile (v: number): Pix {
    const rnd = RNG(7000 + v * 71), p = new Pix(T, T);
    p.rect(0, 0, T, T, FC.base);
    // the lip of the top above: its own colour, a lit rim, the shadow it casts
    p.rect(0, 0, T, 1, RK.base); p.rect(0, 1, T, 1, RK.hi); p.rect(0, 2, T, 1, mixc(RK.hi, RK.base, 0.5));
    p.rect(0, 3, T, 1, mixc(RK.sh, FC.dark, 0.5)); p.rect(0, 4, T, 1, FC.dark); p.rect(0, 5, T, 1, mixc(FC.dark, FC.base, 0.5));
    const wave = (y0: number, amp: number, k: number, ph: number) => Array.from({ length: T }, (_, x) => Math.round(y0 + Math.sin((x / T) * Math.PI * k + ph) * amp));
    const bounds = [Array(T).fill(6), v === 0 ? wave(14, 1.3, 2, 0.4) : wave(13, 1.2, 4, 1.1), v === 0 ? wave(21, 1.1, 4, 1.9) : wave(20, 1.4, 2, 2.4), Array(T).fill(29)] as number[][];
    const joints = v === 0 ? [[11, 24], [6, 17, 27], [13, 22]] : [[8, 19, 27], [14, 25], [5, 11, 20]];
    const tones = [0, 0.16, -0.14, 0.08, -0.06];
    for (let i = 0; i < 3; i++) {
        for (let x = 0; x < T; x++) {
            const block = joints[i].filter((j) => j <= x).length, tone = tones[(block + i * 2 + v) % tones.length];
            const base = mixc(FC.base, tone > 0 ? FC.light : FC.dark, Math.abs(tone) * 2);
            for (let y = bounds[i][x]; y < bounds[i + 1][x]; y++) {
                const dy = y - bounds[i][x];
                let c = base;
                if (dy === 0) c = FC.light; else if (dy === 1) c = mixc(base, FC.light, 0.45);
                if (y === bounds[i + 1][x] - 1) c = mixc(FC.dark, FC.deep, 0.4);
                else if (y === bounds[i + 1][x] - 2) c = mixc(base, FC.dark, 0.4);
                p.set(x, y, c);
            }
        }
        // the joints between the stones of the course: a dark line with its lit edge
        for (const jx of joints[i]) for (let y = bounds[i][jx] + 2; y < bounds[i + 1][jx] - 1; y++) { p.set(jx, y, FC.deep); p.set(jx + 1, y, mixc(FC.base, FC.light, 0.6)); }
    }
    // a crack running down one of the courses, and a couple of small stones set in the face
    { let x = inside(rnd, 8, 24), y = inside(rnd, 8, 11); const end = y + 8 + inside(rnd, 0, 6); for (; y < end; y++) { p.set(x, y, FC.deep); p.set(x + 1, y, FC.light); if (rnd() < 0.4) x += rnd() < 0.5 ? -1 : 1; } }
    for (let k = 0; k < 3; k++) {
        const x = inside(rnd, 5, 27), y = inside(rnd, 9, 24), rx = 1.5 + rnd() * 1.2;
        p.ellipse(x + 1, y + 1, rx, rx * 0.7, [FC.deep]);
        p.ellipse(x, y, rx, rx * 0.7, [FC.dark, FC.base, FC.light, RK.sh], { bias: 0.3 });
    }
    for (let k = 0; k < 12; k++) p.set(inside(rnd, 1, 31), inside(rnd, 8, 26), k % 2 ? FC.light : FC.dark);
    p.speckle([FC.dark, FC.base, FC.light], rnd, 0.05, 0.05);
    finishFoot(p);
    return p;
}

/** The base of a face: shaded toward the floor, with a dark line where the wall meets it. */
function finishFoot (p: Pix) {
    for (let y = 21; y < 29; y++) for (let x = 0; x < T; x++) blend(p, x, y, FC.deep, ((y - 20) / 9) * 0.55);
    for (let x = 0; x < T; x++) {
        p.set(x, 29, x % 2 ? FC.deep : mixc(FC.deep, FC.foot, 0.5));
        p.set(x, 30, FC.foot); p.set(x, 31, FC.foot);
    }
}

// ── ore ────────────────────────────────────────────────────────────────────

/** Where the nuggets sit [x, y, radius] on a rock top: each ore has its own scatter (a face squeezes the same scatter into its lower part). */
const SPOTS: [number, number, number][][] = [
    // coal: heavy lumps in two clumps
    [[9, 21, 3.3], [14, 23, 2.4], [20, 15, 4], [25, 21, 2.2], [9, 10, 3], [26, 9, 2.4], [15, 9, 1.8], [5, 16, 1.5]],
    // iron: a vein running up to the right
    [[8, 22, 2.6], [13, 18, 3.4], [19, 14, 3.8], [25, 9, 2.8], [24, 22, 2.2], [8, 11, 2], [16, 24, 1.8], [14, 8, 1.6]],
    // copper: flat flakes strewn about
    [[8, 10, 2.8], [16, 14, 3.8], [23, 21, 3.2], [24, 9, 2.4], [9, 22, 2.4], [17, 25, 2], [20, 7, 1.6], [27, 16, 1.5]],
    // gold: a diagonal string of nuggets
    [[10, 21, 3.4], [16, 16, 4.4], [22, 11, 3.6], [26, 21, 2.4], [8, 11, 2.3], [18, 25, 2], [13, 8, 1.8], [25, 6, 1.6]],
];
const IRON_ORE = [0x5a3638, 0x9a5640, 0xcc8460, 0xf6c2a0];
const COPPER_ORE = [0x9a4a22, 0xd6762e, 0xf0a05a, 0xffd49a];

/** Ore showing in the rock: ore = 0 coal, 1 iron, 2 copper, 3 gold, 4 crystal. */
function addOre (p: Pix, ore: number, face: boolean, rnd: () => number) {
    if (ore === 4) { addCrystals(p, face); return; }
    const spots = SPOTS[ore].map(([x, y, r]): [number, number, number] => (face ? [x, 8 + (y - 5) * 0.8, r * 0.86] : [x, y, r]));
    const rock = face ? FC.base : RK.base;
    // a darker bed of rock under the nuggets
    for (const [x, y, r] of spots.slice(0, 5)) p.ellipse(x + 0.5, y + 1, r + 2, (r + 2) * 0.8, [face && ore === 0 ? mixc(FC.base, FC.light, 0.45) : mixc(rock, face ? FC.deep : RK.deep, 0.28)]);
    decal(p, (d) => {
        spots.forEach(([x, y, r]) => {
            const hx = Math.round(x - r * 0.4), hy = Math.round(y - r * 0.42);
            if (ore === 0) {
                // coal: heavy, rounded black lumps with a sheen
                shaded(d, blob(rnd, x, y, r * 1.05, 8, 0.85, 0.35), COAL, -0.05);
                d.set(hx, hy, COAL[4]);
                if (r > 2.2) d.set(hx + 1, hy, COAL[3]);
            } else if (ore === 1) {
                // iron: angular rusty chunks, a lit face, a darker facet and a silver glint
                const pts = blob(rnd, x, y, r * 1.05, 5, 0.95, 0.5);
                shaded(d, pts, IRON_ORE);
                d.poly([pts[2], pts[3], [x, y]], IRON_ORE[0]);
                d.set(hx, hy, 0xf4e4d8);
                if (r > 2.4) d.line(Math.round(x - r * 0.5), Math.round(y), Math.round(x + r * 0.3), Math.round(y + r * 0.5), IRON_ORE[1]);
            } else if (ore === 2) {
                // copper: flat, bright orange flakes with a green tarnish on their shaded side
                const pts = blob(rnd, x, y, r * 1.1, 6, 0.7, 0.4);
                shaded(d, pts, COPPER_ORE, 0.1);
                d.set(hx, hy, COPPER_ORE[3]);
                if (r > 2.3) { d.set(Math.round(x + r * 0.6), Math.round(y + r * 0.45), RAMP.copper[1]); d.set(Math.round(x + r * 0.2), Math.round(y + r * 0.6), RAMP.copper[0]); }
            } else {
                // gold: round, bright nuggets
                shaded(d, blob(rnd, x, y, r, 9, 0.9, 0.25), RAMP.gold, 0.08);
                d.set(hx, hy, RAMP.gold[3]);
                if (r > 2.2) d.set(hx + 1, hy, RAMP.gold[3]);
            }
        });
    }, ore === 3 ? (c) => mixc(c, 0x5a2a0a, 0.62) : ore === 2 ? (c) => mixc(c, 0x3a1a1a, 0.6) : undefined);
    // small flecks in the rock around the vein
    const fleck = ore === 0 ? COAL[2] : ore === 1 ? IRON_ORE[2] : ore === 2 ? COPPER_ORE[1] : RAMP.gold[2];
    for (let k = 0; k < 8; k++) {
        const x = inside(rnd, 4, 28), y = inside(rnd, face ? 8 : 5, face ? 25 : 28), at = p.get(x, y);
        if (at === rock || at === (face ? FC.light : RK.hi)) p.set(x, y, fleck);
    }
    if (ore === 2) for (const [x, y] of [[11, 14], [22, 15], [13, 24], [26, 24]] as const) { const yy = face ? Math.round(8 + (y - 5) * 0.8) : y; if (p.get(x, yy) === rock) { p.set(x, yy, RAMP.copper[1]); p.set(x + 1, yy + 1, RAMP.copper[0]); } }
    if (ore === 3) { sparkle(p, face ? 17 : 17, face ? 12 : 13, RAMP.gold[2], 2, 0xfffbe0); p.set(23, face ? 9 : 10, 0xfff3b0); p.set(9, face ? 18 : 20, 0xfff3b0); }
    if (ore === 1) { p.set(20, face ? 12 : 13, 0xe8e4f0); p.set(9, face ? 19 : 21, 0xe8e4f0); }
}

/** Crystal ore: a cluster of blue prisms standing in the rock, with a faint glow round them and white glints. */
function addCrystals (p: Pix, face: boolean) {
    const I = RAMP.ice, cy0 = face ? 14 : 15;
    halo(p, 16, cy0 + 2, 12, 0x8ac4e0, 0.24);
    const prisms: [number, number, number, number, number][] = [[8, 22, 2.6, 8, -2], [24, 23, 2.8, 9, 2], [12, 24, 3.4, 12, -1.5], [20, 24, 3.2, 10, 1.5], [16, 25, 4, 17, 0]];
    if (face) for (const q of prisms) { q[1] -= 1; }
    prisms.sort((a, b) => a[3] - b[3]);
    decal(p, (d) => { for (const [cx, by, hw, h, lean] of prisms) shard(d, cx, by, hw, h, lean); }, () => mixc(I[0], INK, 0.55));
    sparkle(p, 12, face ? 11 : 12, I[3], 2);
    sparkle(p, 21, face ? 15 : 16, I[3], 1);
    p.set(26, face ? 12 : 13, 0xffffff); p.set(7, face ? 18 : 19, 0xe8fbff); p.set(16, face ? 6 : 7, 0xffffff);
}

// ── the tile frames ────────────────────────────────────────────────────────

export function caveTileFrames (): Pix[] {
    const frames: Pix[] = [];
    for (let v = 0; v < 6; v++) frames.push(floorTile(v));
    for (let v = 0; v < 3; v++) frames.push(rockTop(v));
    for (let v = 0; v < 2; v++) frames.push(faceTile(v));
    for (let o = 0; o < 5; o++) { const p = rockTop(o % 3); addOre(p, o, false, RNG(8100 + o * 29)); frames.push(p); }
    for (let o = 0; o < 5; o++) {
        const p = faceTile(o % 2), rnd = RNG(8200 + o * 31);
        // the ore sits above the foot, so re-paint the foot over any halo that reached it
        addOre(p, o, true, rnd); finishFoot(p);
        frames.push(p);
    }
    return frames;
}

// ── the Mine Shaft and its ladder ──────────────────────────────────────────

const W = RAMP.wood, ST = RAMP.stone, BR = RAMP.brass, RD = RAMP.red;

/** A timber along a line: lit on its left, grained, with square ends. */
function beam (p: Pix, rnd: () => number, x0: number, y0: number, x1: number, y1: number, w: number, ramp: readonly number[] = W) {
    const len = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / len, dy = (y1 - y0) / len;
    let nx = -dy, ny = dx;
    if (nx > 0 || (nx === 0 && ny > 0)) { nx = -nx; ny = -ny; }   // the normal points to the lit side
    for (let s = 0; s <= len; s += 0.35) {
        for (let k = 0; k <= w * 2; k++) {
            const u = k / (w * 2), off = (0.5 - u) * w;
            let i = u < 0.16 ? 4 : u < 0.5 ? 3 : u < 0.84 ? 2 : 1;
            if (rnd() < 0.05) i = Math.max(1, i - 1);
            p.set(Math.round(x0 + dx * s + nx * off), Math.round(y0 + dy * s + ny * off), ramp[i]);
        }
    }
    // the dark underside of the timber
    for (let s = 0; s <= len; s += 0.35) p.set(Math.round(x0 + dx * s - nx * (w / 2)), Math.round(y0 + dy * s - ny * (w / 2)), ramp[0]);
}

/** Planks side by side (seams every `step`), board ends staggered along each row. */
function deck (p: Pix, rnd: () => number, x: number, y: number, w: number, h: number, step = 4) {
    p.rect(x, y, w, h, W[2]);
    for (let j = 0; j < h; j += step) {
        p.rect(x, y + j, w, 1, W[3]);
        p.rect(x, y + j + step - 1, w, 1, W[1]);
        const bx = x + 4 + Math.floor(rnd() * (w - 8)); p.rect(bx, y + j + 1, 1, step - 2, W[1]);
        for (let i = 0; i < 3; i++) p.set(x + 2 + Math.floor(rnd() * (w - 4)), y + j + 1 + Math.floor(rnd() * (step - 2)), W[1]);
    }
    p.rect(x, y, 1, h, W[3]); p.rect(x + w - 1, y, 1, h, W[1]);
}

function shaftPainting (p: Pix, rnd: () => number) {
    const SG = [0x15121c, 0x25222f, 0x35314b];
    const cx = 32, cy = 40, rxo = 15, ryo = 7.6, rxi = 10.4, ryi = 4.6, depth = 2;
    // ── the deck of planks the shaft sits on, and its dark front edge
    deck(p, rnd, 2, 29, 60, 20, 4);
    p.rect(2, 49, 60, 5, W[1]); p.rect(2, 49, 60, 1, W[2]); p.rect(2, 53, 60, 1, W[0]);
    for (const x of [6, 22, 38, 54]) { p.rect(x, 50, 3, 3, W[2]); p.rect(x, 50, 1, 3, W[3]); }

    // ── the headframe: two sturdy posts leaning in a little, knee braces, a cross beam on top; stone footings under the posts
    beam(p, rnd, 12, 45, 15.5, 10, 6);
    beam(p, rnd, 52, 45, 48.5, 10, 6);
    for (const x of [6, 47]) { lit(p, x, 41, 13, 7, ST); p.rect(x + 1, 42, 11, 1, ST[4]); p.rect(x + 6, 43, 1, 4, ST[1]); p.rect(x + 2, 45, 3, 1, ST[1]); p.rect(x + 8, 44, 3, 1, ST[1]); }
    beam(p, rnd, 17, 28, 26, 13, 2.6);
    beam(p, rnd, 47, 28, 38, 13, 2.6);
    lit(p, 7, 7, 50, 6, W); p.rect(7, 8, 50, 1, W[4]); p.rect(9, 12, 46, 1, W[1]);
    for (const [x, y] of [[11, 9], [20, 9], [43, 9], [52, 9], [15, 30], [49, 30]] as const) { p.rect(x - 1, y - 1, 3, 3, IRON[2]); p.set(x - 1, y - 1, IRON[3]); p.set(x + 1, y + 1, IRON[0]); }

    // ── the stone ring round the hole: its wall below the rim, the rim itself of laid stones
    for (let y = Math.floor(cy - ryo); y <= Math.ceil(cy + ryo + depth); y++) {
        for (let x = Math.floor(cx - rxo); x <= Math.ceil(cx + rxo); x++) {
            const dx = (x + 0.5 - cx) / rxo, dy = (y + 0.5 - cy - depth) / ryo;
            if (dx * dx + dy * dy > 1) continue;
            const u = (x + 0.5 - (cx - rxo)) / (2 * rxo);
            let c = u < 0.3 ? ST[1] : u < 0.75 ? ST[0] : mixc(ST[0], INK, 0.3);
            if ((x + (Math.floor(y / 3) % 2) * 3) % 6 === 0) c = mixc(c, INK, 0.35);
            p.set(x, y, c);
        }
    }
    const NB = 13;
    for (let y = Math.floor(cy - ryo); y <= Math.ceil(cy + ryo); y++) {
        for (let x = Math.floor(cx - rxo); x <= Math.ceil(cx + rxo); x++) {
            const dx = (x + 0.5 - cx) / rxo, dy = (y + 0.5 - cy) / ryo, r2 = dx * dx + dy * dy;
            if (r2 > 1) continue;
            const ang = Math.atan2(dy, dx), f = ((ang + Math.PI) / (Math.PI * 2)) * NB, bi = Math.floor(f), fr = f - bi;
            const lightSide = -(Math.cos(ang) * 0.6 + Math.sin(ang) * 0.7);   // the rim facing the light
            let c = [ST[2], ST[3], ST[2], ST[3], ST[4], ST[2]][(bi * 5 + 1) % 6];
            if (fr < 0.1 || fr > 0.94) c = ST[1];
            else if (r2 > 0.76 && lightSide > 0.35) c = ST[4];
            else if (r2 > 0.78) c = lightSide < -0.2 ? ST[1] : ST[2];
            p.set(x, y, c);
        }
    }
    // the hole: the far inner wall at the back, then the dark
    for (let y = Math.floor(cy - ryi - 1); y <= Math.ceil(cy + ryi + 1); y++) {
        for (let x = Math.floor(cx - rxi); x <= Math.ceil(cx + rxi); x++) {
            const dx = (x + 0.5 - cx) / rxi, dy = (y + 0.5 - cy) / ryi;
            if (dx * dx + dy * dy > 1) continue;
            const dy2 = (y + 0.5 - cy - 2.6) / ryi, r2 = dx * dx + dy2 * dy2;
            p.set(x, y, r2 > 1 ? (y < cy - 2 ? SG[2] : SG[1]) : r2 > 0.55 ? SG[0] : 0x0c0a12);
        }
    }
    for (const [x, y] of [[27, 38], [31, 37], [36, 38], [39, 39]] as const) p.set(x, y, 0x4a4566);

    // ── the rope runs from the pulley down into the dark
    for (let y = 28; y < 43; y++) {
        const dark = y > 39 ? (y - 39) / 4 : 0;
        for (const x of [31, 32]) {
            const c = (y + (x - 31)) % 3 === 0 ? 0xdcb870 : (y + (x - 31)) % 3 === 1 ? 0xb8944c : 0x8a6a3a;
            p.set(x, y, mixc(c, 0x0c0a12, Math.min(0.92, dark)));
        }
    }

    // ── the pulley wheel hung from the cross beam on an iron strap: a brass rim, iron spokes, the rope over its top
    const wx = 32, wy = 22;
    p.rect(31, 13, 2, 8, IRON[2]); p.rect(31, 13, 1, 8, IRON[3]);
    p.ellipse(wx, wy, 7.4, 7.4, BR, { bias: 0.2 });
    p.ellipse(wx, wy, 5, 5, [0x2a2236]);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; p.line(Math.round(wx + Math.cos(a) * 1.5), Math.round(wy + Math.sin(a) * 1.5), Math.round(wx + Math.cos(a) * 5), Math.round(wy + Math.sin(a) * 5), k % 2 ? IRON[2] : IRON[3]); }
    p.ellipse(wx, wy, 2.2, 2.2, IRON, { bias: 0.2 }); p.set(wx - 1, wy - 1, BR[3]); p.set(wx, wy, BR[2]);
    p.set(31, 28, 0xdcb870); p.set(32, 28, 0xb8944c);

    // ── a pennant on the top
    p.rect(32, 1, 1, 6, W[3]); p.rect(33, 1, 1, 6, W[1]);
    p.poly([[33, 1], [40, 3], [33, 6]], (u) => (u < 0.45 ? RD[2] : RD[1]));
    p.set(33, 1, RD[3]); p.line(33, 5, 38, 3, RD[0]);

    // ── a lantern hung from a post at the left
    beam(p, rnd, 3, 50, 3, 27, 3);
    lit(p, 2, 26, 8, 2, IRON);
    p.line(8, 28, 8, 30, IRON[2]);
    lit(p, 4, 30, 9, 2, IRON);
    p.poly([[5, 32], [12, 32], [11, 40], [6, 40]], (u, v) => (v < 0.35 ? 0xfff6c0 : u < 0.5 ? 0xffe27a : 0xffc850));
    p.rect(8, 32, 1, 8, 0xc58f3e); p.rect(5, 32, 1, 8, IRON[2]); p.rect(12, 32, 1, 8, IRON[1]);
    lit(p, 4, 40, 9, 2, IRON);

    // ── a pickaxe leaning on the right
    beam(p, rnd, 58, 51, 55, 33, 2.4);
    p.poly([[50, 36], [54, 31], [60, 32], [61, 34], [56, 33], [52, 38]], (u, v) => (v < 0.4 ? IRON[3] : u < 0.6 ? IRON[2] : IRON[1]));
    p.set(54, 32, 0xd6d9ec); p.set(55, 32, 0xd6d9ec);

    p.outline((c) => (c === 0xfff6c0 || c === 0xffe27a || c === 0xffc850 ? 0x8a4a14 : mixc(c, INK, 0.7)));

    // the warm glow round the lantern: a lick of light on what is near it, a faint halo in the air
    for (let y = 22; y < 54; y++) for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x + 0.5 - 8.5, y + 0.5 - 36);
        if (d > 10) continue;
        const t = d < 5.5 ? 0.22 : 0.1, o = p.get(x, y);
        if (o === -1) p.set(x, y, 0xffd870, t * 0.8);
        else if (o !== 0xfff6c0 && o !== 0xffe27a && o !== 0xffc850 && p.a[y * p.w + x] === 1) p.set(x, y, mixc(o, 0xffd870, t));
    }
}

/** The ladder in the caves: a dark square hole in the floor with a wooden ladder coming up out of it, seen from above. */
function ladderPainting (p: Pix, rnd: () => number) {
    const HOLE = [0x0c0a12, 0x15121c, 0x25222f, 0x35314b], FRAME = [W[0], W[1], W[2], W[3]];
    // a dark timber frame round the hole, then the hole itself: the far wall lit a little, darker the deeper it goes
    lit(p, 3, 5, 26, 24, FRAME);
    for (let y = 7; y < 27; y++) { const c = y < 11 ? HOLE[3] : y < 14 ? HOLE[2] : y < 19 ? HOLE[1] : HOLE[0]; p.rect(5, y, 22, 1, c); }
    for (const x of [8, 14, 20]) p.set(x + Math.floor(rnd() * 2), 9, 0x4a4566);
    // the ladder: two rails running down into the hole, rungs fading with depth; the top ends stand up over the lip
    const rails = [10, 20];
    for (const rx of rails) {
        for (let y = 1; y < 27; y++) {
            const fade = Math.min(0.85, Math.max(0, (y - 8) / 19));
            const c0 = y < 8 ? [W[4], W[3], W[2]] : [W[3], W[2], W[1]];
            p.set(rx, y, mixc(c0[0], HOLE[0], fade)); p.set(rx + 1, y, mixc(c0[1], HOLE[0], fade)); p.set(rx + 2, y, mixc(c0[2], HOLE[0], fade));
        }
        p.rect(rx - 1, 0, 5, 1, W[3]); p.rect(rx, 1, 3, 1, W[4]);
    }
    for (let y = 10; y < 27; y += 4) {
        const fade = Math.min(0.85, (y - 8) / 19);
        p.rect(12, y, 8, 2, mixc(W[3], HOLE[0], fade)); p.rect(12, y, 8, 1, mixc(W[4], HOLE[0], fade)); p.rect(12, y + 1, 8, 1, mixc(W[1], HOLE[0], fade));
    }
    // the top rung, over the lip of the hole
    p.rect(12, 3, 8, 2, W[3]); p.rect(12, 3, 8, 1, W[4]);
    // loose stones at the corners of the frame
    const STONE = [0x35314b, 0x514c63, 0x6e6a82, 0x8e89aa];
    for (const [x, y] of [[3, 6], [28, 7], [4, 28], [27, 28]] as const) p.ellipse(x + 1, y, 2, 1.6, STONE, { bias: 0.2 });
    p.outline();
}

export function registerStorybookMine (scene: Phaser.Scene) {
    // the Mine Shaft: a 2×2 building, 32 wide and 30 high (logical), painted at twice that; the bottom rows are left clear for the game's shadow
    paint(scene, 'mineshaft', 32, 30, shaftPainting, 1);
    // its ladder, down in the caves: one tile, walked over
    paint(scene, 'mineladder', 16, 16, ladderPainting, 1);
}
