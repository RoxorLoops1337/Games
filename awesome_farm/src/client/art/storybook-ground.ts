// Painted ground, water and cliff tiles (32×32 pixels each: a 16-unit tile at twice the density).
// The frame numbers are the same as the old grid tiles, so the tilemap and the title screen don't change:
//   0-1 deep water, 2 shallow, 3-7 a cliff per biome, 8-22 three ground variants per biome, 23 rift cliff, 24-26 rift floor.
// Features stay a couple of pixels inside the tile so neighbours never show a cut-off tuft.

import { BIOMES, type Biome } from '../../shared/data/biomes';
import { INK, mixc, paintTexture, Pix, RAMP, RNG } from './paint';
import { caveTileFrames } from './storybook-cave';

const T = 32;

/** Ground variants per biome: the first three are plain, the rest carry a tuft, flowers, pebbles… */
export const GROUND_VARIANTS = 6;

interface Ground { base: number; light: number; dark: number; deep: number; high: number; speck: number; kind: 'grass' | 'stone' | 'sand' | 'snow' | 'bog' | 'blight' }

const GROUND: Record<Biome, Ground> = {
    meadow:   { base: 0x92d364, light: 0xa4de78, dark: 0x84c85a, deep: 0x70bc58, high: 0xb6e880, speck: 0xf79fc6, kind: 'grass' },
    quarry:   { base: 0x7aa456, light: 0x8cb462, dark: 0x6c9a49, deep: 0x4f7e3e, high: 0xa4c878, speck: 0xb8bdd0, kind: 'stone' },
    goldsand: { base: 0xf4deaa, light: 0xfbeac0, dark: 0xe8cd92, deep: 0xd9b56e, high: 0xfff3d6, speck: 0xffd966, kind: 'sand' },
    snowcap:  { base: 0xfdfbf4, light: 0xffffff, dark: 0xe6eef4, deep: 0xcadbe8, high: 0xcdf4ee, speck: 0xa8dcee, kind: 'snow' },
    bog:      { base: 0x66527f, light: 0x78629a, dark: 0x5a4772, deep: 0x463a64, high: 0x8f78b6, speck: 0x7ec06a, kind: 'bog' },
};

/** The blighted ground of a nest isle: bruised violet-black earth with crimson cracks. */
const BLIGHT: Ground = { base: 0x3a2c44, light: 0x48364f, dark: 0x30243a, deep: 0x22182c, high: 0x5e4466, speck: 0x8e2446, kind: 'blight' };

const CLIFF: Record<Biome, { face: number; dark: number; light: number }> = {
    meadow:   { face: 0xd49a62, dark: 0xa8703f, light: 0xe8b47c },
    quarry:   { face: 0x9ea4b9, dark: 0x666b86, light: 0xc2c8da },
    goldsand: { face: 0xe4c07a, dark: 0xb88a4a, light: 0xf2d896 },
    snowcap:  { face: 0xdce8f2, dark: 0x9ec0d8, light: 0xf6fbff },
    bog:      { face: 0x5d4a7c, dark: 0x35305c, light: 0x7a64a0 },
};

const SEA = { deep: 0x2d6ea6, deepLo: 0x2860a0, deepHi: 0x4a8cc4, shallow: 0x4ab2cf, shallowHi: 0x74cce0, caustic: 0xaee8f0, foam: 0xfffbf4, foamLo: 0xcdf4ee };

const inside = (rnd: () => number, lo = 4, hi = T - 4) => lo + Math.floor(rnd() * (hi - lo));

function patches (p: Pix, rnd: () => number, g: Ground, n: number) {
    for (let k = 0; k < n; k++) {
        const rx = 3 + rnd() * 4, ry = 2 + rnd() * 2.5, cx = inside(rnd, Math.ceil(rx) + 1, T - Math.ceil(rx) - 1), cy = inside(rnd, Math.ceil(ry) + 1, T - Math.ceil(ry) - 1);
        p.ellipse(cx, cy, rx, ry, [mixc(g.base, rnd() < 0.5 ? g.light : g.dark, 0.6)]);
    }
}

function tuft (p: Pix, x: number, y: number, g: Ground, big = false) {
    const h = big ? 6 : 4;
    p.blade(x, y, x - 1, y - h * 0.5, x - 2, y - h, 0.9, [g.deep, g.deep, g.dark]);
    p.blade(x, y, x, y - h * 0.6, x + 0.5, y - h - 1, 0.9, [g.deep, g.dark, g.high]);
    p.blade(x, y, x + 1, y - h * 0.5, x + 2, y - h, 0.9, [g.deep, g.deep, g.dark]);
}

function flower (p: Pix, x: number, y: number, petal: number) {
    p.set(x, y - 1, petal); p.set(x - 1, y, petal); p.set(x + 1, y, petal); p.set(x, y + 1, petal); p.set(x, y, 0xfff3b0);
}

function ground (g: Ground, v: number, seed: number) {
    const rnd = RNG(seed);
    const p = new Pix(T, T);
    p.rect(0, 0, T, T, g.base);
    patches(p, rnd, g, 4 + (v % 3));
    // fine texture on every tile: a scatter of tiny ticks
    const ticks = g.kind === 'snow' ? 5 : 10;
    for (let k = 0; k < ticks; k++) { const x = inside(rnd, 2, 30), y = inside(rnd, 2, 30); p.set(x, y, k % 3 === 0 ? g.high : g.deep); if (g.kind === 'grass' && k % 2) p.set(x, y - 1, g.deep); }
    const s3 = v - 3;   // 0..2 for the special variants
    if (v >= 3) switch (g.kind) {
        case 'grass':
            if (s3 === 0) { tuft(p, inside(rnd, 6, 14), inside(rnd, 14, 22), g, true); tuft(p, inside(rnd, 18, 26), inside(rnd, 8, 14), g); }
            if (s3 === 1) { tuft(p, inside(rnd, 8, 24), inside(rnd, 14, 26), g, true); flower(p, inside(rnd, 6, 12), inside(rnd, 6, 12), 0xf79fc6); flower(p, inside(rnd, 20, 26), inside(rnd, 20, 26), 0xfff6e0); }
            if (s3 === 2) { for (let k = 0; k < 3; k++) flower(p, inside(rnd, 5, 27), inside(rnd, 5, 27), k === 0 ? 0xf7d36a : k === 1 ? 0xfff6e0 : 0xf79fc6); tuft(p, inside(rnd, 8, 24), inside(rnd, 16, 26), g); }
            break;
        case 'stone':
            for (let k = 0; k < 1 + s3; k++) { const x = inside(rnd, 6, 26), y = inside(rnd, 7, 26); p.ellipse(x, y, 2.4, 1.6, [g.speck, 0xd5d9e6]); p.set(x - 1, y + 1, 0x8a91a8); p.set(x, y + 1, 0x8a91a8); }
            if (s3 === 2) tuft(p, inside(rnd, 8, 24), inside(rnd, 16, 26), g);
            break;
        case 'sand':
            for (let k = 0; k < 2 + (s3 === 1 ? 1 : 0); k++) { const x = inside(rnd, 4, 18), y = inside(rnd, 6, 26); for (let i = 0; i < 9; i++) p.set(x + i, y + Math.round(Math.sin(i * 0.8) * 1.2), g.deep); for (let i = 1; i < 8; i++) p.set(x + i, y + 1 + Math.round(Math.sin(i * 0.8) * 1.2), g.high); }
            if (s3 === 2) { p.ellipse(inside(rnd, 8, 24), inside(rnd, 8, 24), 2.4, 1.6, [0xf7e7d2, 0xffffff]); for (let k = 0; k < 4; k++) p.set(inside(rnd, 3, 29), inside(rnd, 3, 29), g.speck); }
            break;
        case 'snow':
            for (let k = 0; k < 3 + s3 * 2; k++) { const x = inside(rnd, 4, 28), y = inside(rnd, 4, 28); p.set(x, y, g.speck); p.set(x - 1, y, g.high); p.set(x + 1, y, g.high); p.set(x, y - 1, g.high); p.set(x, y + 1, g.high); }
            if (s3 === 2) tuft(p, inside(rnd, 8, 24), inside(rnd, 14, 26), { ...g, deep: 0x8fb8a0, dark: 0xa8cfb8, high: 0xc8e4d0 });
            break;
        case 'bog':
            for (let k = 0; k < 1 + s3; k++) { const x = inside(rnd, 6, 26), y = inside(rnd, 6, 26); p.ellipse(x, y, 3.4, 1.9, [g.deep, g.dark]); p.set(x - 1, y - 1, g.high); }
            if (s3 === 1) { const x = inside(rnd, 8, 22), y = inside(rnd, 10, 22); p.rect(x, y, 2, 3, 0xd5d9e6); p.ellipse(x + 1, y - 1, 2.6, 1.8, [0x9d6fdb, 0xc4a4f0]); }
            if (s3 === 2) tuft(p, inside(rnd, 8, 24), inside(rnd, 12, 26), { ...g, deep: 0x4a8a44, dark: 0x66a850, high: 0x8ac870 });
            break;
        case 'blight':
            // cracks that glow, pools of dark ooze, a dead tuft, a bone
            for (let k = 0; k < 1 + s3; k++) { let x = inside(rnd, 6, 26), y = inside(rnd, 6, 26); for (let i = 0; i < 7; i++) { p.set(x, y, i % 3 ? g.speck : 0xff6a7a); x += rnd() < 0.5 ? 1 : 0; y += rnd() < 0.6 ? 1 : -1; } }
            if (s3 === 0) { const x = inside(rnd, 8, 24), y = inside(rnd, 8, 24); p.ellipse(x, y, 4, 2.2, [0x120c18, g.deep]); p.set(x - 1, y - 1, 0x6e3c6a); }
            if (s3 === 1) tuft(p, inside(rnd, 8, 24), inside(rnd, 14, 26), { ...g, deep: 0x2a2230, dark: 0x4a3c44, high: 0x6a5a5a });
            if (s3 === 2) { const x = inside(rnd, 8, 22), y = inside(rnd, 10, 24); p.rect(x, y, 6, 2, 0xe8e0d0); p.rect(x - 1, y - 1, 2, 4, 0xe8e0d0); p.rect(x + 5, y - 1, 2, 4, 0xd0c8b8); }
            break;
    }
    return p;
}

function cliff (face: number, dark: number, light: number, lip: Ground, rnd: () => number, icy = false) {
    const p = new Pix(T, T);
    // the lip of the land overhanging, then the face with its strata, a dark foot, foam and a strip of water
    for (let y = 0; y < 22; y++) for (let x = 0; x < T; x++) p.set(x, y, y < 3 ? lip.dark : y < 5 ? mixc(face, lip.dark, 0.4) : y < 8 ? light : face);
    for (let x = 0; x < T; x++) { p.set(x, 0, lip.base); if ((x * 5 + 3) % 7 < 3) p.set(x, 3, lip.deep); }
    // strata: wavy bands that repeat every 32 pixels, so tiles join up
    for (const [y0, amp] of [[11, 1.2], [16, 1.6]] as const) for (let x = 0; x < T; x++) { const y = Math.round(y0 + Math.sin((x / T) * Math.PI * 4) * amp); if ((x + y0) % 6 !== 0) p.set(x, y, dark); }
    for (let k = 0; k < 7; k++) { const x = inside(rnd, 2, 29), y = inside(rnd, 8, 20); p.rect(x, y, 2, 1, light); p.set(x, y + 1, dark); }
    for (let x = 0; x < T; x++) { p.set(x, 20, mixc(face, dark, 0.5)); p.set(x, 21, dark); p.set(x, 22, dark); }
    if (icy) for (let x = 2; x < T; x += 6) { const l = 2 + ((x * 3) % 4); for (let i = 0; i < l; i++) p.set(x, 5 + i, light); }
    // water below, with a scalloped line of foam
    for (let y = 23; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, SEA.shallow);
    for (let x = 0; x < T; x++) { p.set(x, 23, SEA.foam); p.set(x, 24, x % 8 < 5 ? SEA.foam : SEA.foamLo); p.set(x, 25, x % 8 < 3 ? SEA.foamLo : SEA.shallowHi); }
    for (let x = 0; x < T; x += 8) { p.set(x + 3, 28, SEA.caustic); p.set(x + 4, 28, SEA.caustic); p.set(x + 7, 30, SEA.shallowHi); }
    return p;
}

function deepWater (v: number) {
    const p = new Pix(T, T);
    p.rect(0, 0, T, T, SEA.deep);
    // two tones of wave band; crests every 16 pixels, offset on the second variant
    for (let y = 0; y < T; y++) if (y % 8 === 5 || y % 8 === 6) for (let x = 0; x < T; x++) p.set(x, y, SEA.deepLo);
    for (const [y, off] of [[3, 2], [11, 12], [19, 6], [27, 18]] as const) for (let i = 0; i < 7; i++) { p.set((off + i + v * 8) % T, y, SEA.deepHi); if (i > 1 && i < 5) p.set((off + i + v * 8) % T, y - 1, SEA.deepHi); }
    for (const [x, y] of [[5, 15], [22, 24], [27, 8]] as const) p.set((x + v * 9) % T, y, 0xa8d4ee);
    return p;
}

function shallowWater () {
    const p = new Pix(T, T), rnd = RNG(11);
    p.rect(0, 0, T, T, SEA.shallow);
    for (let k = 0; k < 4; k++) p.ellipse(inside(rnd, 6, 26), inside(rnd, 6, 26), 5 + rnd() * 3, 2 + rnd() * 1.5, [SEA.shallowHi]);
    for (const [x, y] of [[4, 8], [18, 20], [10, 26]] as const) for (let i = 0; i < 6; i++) p.set(x + i, y + Math.round(Math.sin(i * 1.1)), SEA.caustic);
    for (let k = 0; k < 4; k++) p.set(inside(rnd, 2, 30), inside(rnd, 2, 30), SEA.foam);
    return p;
}

function riftFloor (v: number) {
    const rnd = RNG(40 + v), p = new Pix(T, T);
    p.rect(0, 0, T, T, 0x35305c);
    for (let k = 0; k < 6; k++) p.ellipse(inside(rnd, 6, 26), inside(rnd, 6, 26), 3 + rnd() * 3, 2 + rnd() * 2, [rnd() < 0.5 ? 0x3d3868 : 0x2d2850]);
    for (let k = 0; k < 10; k++) p.set(inside(rnd, 2, 30), inside(rnd, 2, 30), k % 2 ? 0x5d4a7c : 0x666b86);
    if (v === 1) { const x = inside(rnd, 8, 20), y = inside(rnd, 8, 20); p.rect(x, y, 6, 1, 0x9d6fdb); p.rect(x + 2, y + 1, 1, 5, 0x9d6fdb); p.rect(x + 3, y + 3, 4, 1, 0xf79fc6); p.set(x, y, 0xc4a4f0); }
    if (v === 2) for (let k = 0; k < 8; k++) p.set(inside(rnd, 3, 29), inside(rnd, 3, 29), 0x4b3a6b);
    return p;
}

/**
 * Shallow water that meets land: foam lapping the shore. One frame per combination of land to the east,
 * west and south, plus a corner when land only touches diagonally (bits: E 1, W 2, S 4, SE 8, SW 16).
 */
function shore (mask: number) {
    const p = shallowWater();
    const E = mask & 1, W = mask & 2, S = mask & 4, SE = mask & 8, SW = mask & 16;
    // the foam's depth wobbles with a period that divides the tile, so it joins up along a straight shore
    const depth = (t: number, phase: number) => 4 + Math.round(1.5 * Math.sin(((t + phase) * Math.PI * 4) / T));
    const put = (x: number, y: number, c: number) => p.set(x, y, c);
    for (let t = 0; t < T; t++) {
        if (E) { const d = depth(t, 0); for (let i = 0; i < d + 5; i++) { const x = T - 1 - i; put(x, t, i < d ? SEA.foam : i < d + 2 ? ((t + i) % 2 ? SEA.foamLo : SEA.shallowHi) : (t * 3 + i) % 5 === 0 ? SEA.foamLo : SEA.shallowHi); } }
        if (W) { const d = depth(t, 7); for (let i = 0; i < d + 5; i++) { const x = i; put(x, t, i < d ? SEA.foam : i < d + 2 ? ((t + i) % 2 ? SEA.foamLo : SEA.shallowHi) : (t * 3 + i) % 5 === 0 ? SEA.foamLo : SEA.shallowHi); } }
        if (S) { const d = depth(t, 3); for (let i = 0; i < d + 5; i++) { const y = T - 1 - i; put(t, y, i < d ? SEA.foam : i < d + 2 ? ((t + i) % 2 ? SEA.foamLo : SEA.shallowHi) : (t * 3 + i) % 5 === 0 ? SEA.foamLo : SEA.shallowHi); } }
    }
    const corner = (cx: number, cy: number) => {
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d < 7) put(x, y, SEA.foam); else if (d < 9.5) put(x, y, (x + y) % 2 ? SEA.foamLo : SEA.shallowHi);
        }
    };
    if (SE) corner(T, T);
    if (SW) corner(0, T);
    return p;
}
export const SHORE_FRAMES = 32;

/**
 * Two seamless 64×64 wave layers (32 units square) that scroll over the sea: darker troughs and lighter
 * crests on the far layer, sparse bright glints on the near one. Everything wraps, so they tile.
 */
function seaLayers (scene: Phaser.Scene) {
    const N = 64, far = new Pix(N, N), near = new Pix(N, N), rnd = RNG(77);
    const wrap = (v: number) => ((v % N) + N) % N;
    for (const [y0, off] of [[6, 0], [22, 17], [38, 9], [54, 31]] as const) {
        for (let x = 0; x < N; x++) {
            const y = Math.round(y0 + Math.sin(((x + off) / N) * Math.PI * 4) * 2);
            far.set(x, wrap(y), SEA.deepLo); far.set(x, wrap(y + 1), SEA.deepLo);
            if ((x + off) % 32 < 13) { far.set(x, wrap(y - 3), SEA.deepHi); if ((x + off) % 32 > 2 && (x + off) % 32 < 10) far.set(x, wrap(y - 4), SEA.deepHi); }
        }
    }
    for (let k = 0; k < 26; k++) { const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N); near.set(x, y, 0xa8d4ee); if (k % 3 === 0) { near.set(x + 1, y, 0xe8fbff); near.set(x - 1, y, 0xe8fbff); } }
    for (let k = 0; k < 9; k++) { const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N); for (let i = 0; i < 6; i++) near.set(wrap(x + i), wrap(y + Math.round(Math.sin(i * 0.9))), 0x74a8d8); }
    paintTexture(scene, 'sea_far', [far]);
    paintTexture(scene, 'sea_near', [near]);
}

/** Paint every tile, in the same order as the old grid tiles. */
export function registerStorybookTiles (scene: Phaser.Scene) {
    const frames: Pix[] = [];
    frames.push(deepWater(0), deepWater(1), shallowWater());
    for (const b of BIOMES) frames.push(cliff(CLIFF[b].face, CLIFF[b].dark, CLIFF[b].light, GROUND[b], RNG(100 + BIOMES.indexOf(b)), b === 'snowcap'));
    for (const b of BIOMES) for (let v = 0; v < GROUND_VARIANTS; v++) frames.push(ground(GROUND[b], v, 1000 + BIOMES.indexOf(b) * 10 + v));
    frames.push(cliff(0x5d4a7c, 0x35305c, 0x7a64a0, { base: 0x9d6fdb, light: 0xc4a4f0, dark: 0x4b3a6b, deep: 0x7a5aa8, high: 0xc4a4f0, speck: 0xf79fc6, kind: 'bog' }, RNG(200)));
    for (let v = 0; v < 3; v++) frames.push(riftFloor(v));
    for (let m = 0; m < SHORE_FRAMES; m++) frames.push(shore(m));
    frames.push(...caveTileFrames());
    frames.push(...veinFrames());
    // a Blight nest isle: its own cliff and ground (sprites.ts TILE_BLIGHT_CLIFF)
    frames.push(cliff(0x3a2a44, 0x1c1424, 0x5a4068, BLIGHT, RNG(300)));
    for (let v = 0; v < GROUND_VARIANTS; v++) frames.push(ground(BLIGHT, v, 3000 + v));
    seaLayers(scene);
    return paintTexture(scene, 'tiles', frames, 64);
}

// ── ore veins: patches of ground with the ore showing through (three variants per resource) ──
const VEIN: Record<string, { patch: number; nugget: readonly number[]; kind: 'ore' | 'sand' | 'peat' | 'crystal' | 'stone' }> = {
    iron:    { patch: 0x8e7468, nugget: RAMP.iron, kind: 'ore' },
    copper:  { patch: 0x6e8a78, nugget: RAMP.copper, kind: 'ore' },
    coal:    { patch: 0x44404f, nugget: RAMP.coal, kind: 'ore' },
    stone:   { patch: 0xa0a6ba, nugget: RAMP.stone, kind: 'stone' },
    goldore: { patch: 0xb49a62, nugget: RAMP.gold, kind: 'ore' },
    sand:    { patch: 0xe6cc94, nugget: RAMP.sand, kind: 'sand' },
    clay:    { patch: 0xb87c5c, nugget: RAMP.clay, kind: 'ore' },
    peat:    { patch: 0x4a3c34, nugget: RAMP.peat, kind: 'peat' },
    crystal: { patch: 0x7e90ae, nugget: RAMP.ice, kind: 'crystal' },
};
export const VEIN_KINDS = Object.keys(VEIN);

function vein (res: string, variant: number) {
    const v = VEIN[res], rnd = RNG((variant + 1) * 7919 + res.length * 31 + res.charCodeAt(0) * 13), p = new Pix(T, T);
    // an irregular patch of ground, lit a little on its upper left
    const edge = Array.from({ length: 24 }, () => 10.5 + rnd() * 3.5);
    for (let y = 1; y < T - 1; y++) for (let x = 1; x < T - 1; x++) {
        const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), r = edge[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 24];
        if (d < r) p.set(x, y, dx + dy < -4 ? mixc(v.patch, 0xffffff, 0.12) : dx + dy > 7 ? mixc(v.patch, INK, 0.16) : v.patch);
    }
    p.speckle([mixc(v.patch, INK, 0.16), v.patch, mixc(v.patch, 0xffffff, 0.12)], rnd, 0.08, 0.08);
    const n = v.kind === 'sand' ? 5 : 6;
    for (let i = 0; i < n; i++) {
        const x = 7 + Math.floor(rnd() * 18), y = 7 + Math.floor(rnd() * 18);
        if (p.get(x, y) === -1) continue;
        const r = 1.8 + rnd() * 1.2;
        if (v.kind === 'sand') { for (let k = 0; k < 7; k++) p.set(x - 3 + k, y + Math.round(Math.sin(k * 0.9)), v.nugget[2]); continue; }
        if (v.kind === 'peat') { p.ellipse(x, y, 2.6, 1.6, [LEAF_DARK, 0x4a8a44]); continue; }
        p.poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], (u, w) => v.nugget[Math.max(0, Math.min(v.nugget.length - 1, Math.floor((1.1 - (u * 0.6 + w * 0.7)) * v.nugget.length)))]);
        p.set(Math.round(x - r * 0.35), Math.round(y - r * 0.45), v.nugget[v.nugget.length - 1]);
    }
    p.outline((c) => mixc(c, INK, 0.3));
    return p;
}
const LEAF_DARK = 0x3a7a3a;

/** The ore vein decals, three per resource in VEIN_KINDS order: frames of the tile sheet, so a plot's veins are a tilemap layer (world/veins.ts). */
export const VEIN_VARIANTS = 3;
function veinFrames (): Pix[] {
    const out: Pix[] = [];
    for (const r of VEIN_KINDS) for (let i = 0; i < VEIN_VARIANTS; i++) out.push(vein(r, i));
    return out;
}
