// The house kit: walls that join up with their neighbours (16 frames per material, picked by which of the four
// sides have another wall: north 1, east 2, south 4, west 8), a doorway, and roof tiles. Painted like everything
// else, top-down with a lit top edge and a darker front face along the south side so a wall reads as having height.

import { mixc, outlineOf, paint, paintFrames, Pix, RAMP } from './paint';

const BRICK = [0x5e2a28, 0x8a4036, 0xb35e48, 0xd4805c, 0xefa27e];

interface WallStyle { ramp: readonly number[]; pattern: 'wood' | 'stone' | 'brick'; window?: boolean }

/** One frame of a wall: the centre post, plus an arm towards every side that has a neighbour. */
function wallFrame (p: Pix, mask: number, st: WallStyle) {
    const S = p.w, C = S / 2, T = 6;                     // thickness 12 painted pixels (6 logical)
    const x0 = C - T, x1 = C + T;
    const solid = new Uint8Array(S * S);
    const put = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) solid[j * S + i] = 1; };
    put(x0, x0, 2 * T, 2 * T);
    if (mask & 1) put(x0, 0, 2 * T, x0);
    if (mask & 2) put(x1, x0, S - x1, 2 * T);
    if (mask & 4) put(x0, x1, 2 * T, S - x1);
    if (mask & 8) put(0, x0, x0, 2 * T);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 1 : solid[y * S + x]);   // (beyond the tile there is wall: arms run on to the next tile)
    const R = st.ramp;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!solid[y * S + x]) continue;
        // how far to the south edge of the wall mass: the front face is the last few rows
        let face = 99;
        for (let k = 1; k <= 7; k++) if (!at(x, y + k)) { face = k; break; }
        let c = R[2];
        if (face <= 6) c = face === 1 ? R[0] : R[1];
        if (!at(x, y - 1)) c = R[4];                      // lit top edge
        else if (!at(x - 1, y) && face > 6) c = R[3];     // lit left edge
        // courses and joints
        if (st.pattern === 'brick' || st.pattern === 'stone') {
            const row = Math.floor(y / 4), off = st.pattern === 'brick' ? (row & 1) * 4 : ((row * 5) & 3) * 2;
            if (y % 4 === 3 && at(x, y - 1)) c = mixc(c, R[0], 0.55);
            else if ((x + off) % 8 === 0 && y % 4 !== 3) c = mixc(c, R[0], 0.4);
        } else {
            if (x % 6 === 0) c = mixc(c, R[0], 0.45);                 // plank seams
            if (x % 6 === 3 && (y % 9 === 4)) c = R[0];               // a nail
        }
        p.set(x, y, c);
    }
    // a window in a straight run
    if (st.window && (mask === 10 || mask === 5)) {
        const horiz = mask === 10;
        const w = horiz ? 12 : 8, h = horiz ? 8 : 12;
        const wx = C - w / 2, wy = C - h / 2 - 1;
        p.rect(wx - 1, wy - 1, w + 2, h + 2, R[0]);
        p.rect(wx, wy, w, h, 0xa8dcee);
        p.rect(wx, wy, w, 2, 0xe8fbff);
        p.rect(C - 0.5, wy, 1, h, R[1]); p.rect(wx, C - 1, w, 1, R[1]);
    }
    p.outline((c) => outlineOf(c, 0.66));
}

/** A doorway lying east-west: two posts and a lintel, with the way through open between them. */
function doorway (p: Pix) {
    const W = RAMP.wood, S = p.w;
    // the threshold: a worn plank strip you walk over
    p.rect(8, 20, S - 16, 8, W[3]); p.rect(8, 20, S - 16, 1, W[4]); p.rect(8, 27, S - 16, 1, W[1]);
    for (let x = 12; x < S - 8; x += 7) p.rect(x, 21, 1, 6, W[2]);
    // the posts
    for (const x of [1, S - 9]) {
        p.rect(x, 6, 8, 22, W[2]); p.rect(x, 6, 2, 22, W[3]); p.rect(x + 6, 6, 2, 22, W[1]); p.rect(x, 26, 8, 2, W[0]);
        p.rect(x - 1, 4, 10, 3, W[4]); p.rect(x - 1, 6, 10, 1, W[1]);                       // caps
    }
    // the lintel across the top
    p.rect(1, 6, S - 2, 5, W[3]); p.rect(1, 6, S - 2, 1, W[4]); p.rect(1, 10, S - 2, 1, W[1]);
    p.rect(S / 2 - 1, 11, 2, 3, RAMP.brass[2]);                                              // a little lamp-hook
    p.outline((c) => outlineOf(c, 0.66));
}

// ── roofs ────────────────────────────────────────────────────────────────────
/** Thatch: bundled straw laid in slanting courses. Seamless across tiles. */
function thatch (p: Pix) {
    const R = RAMP.straw;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const course = Math.floor(y / 5), local = y % 5;
        const strand = (x + course * 7 + (local >> 1)) % 6;
        const c0 = strand < 2 ? R[2] : strand < 4 ? R[1] : R[3 - (course & 1)];
        const c = local === 4 ? R[0] : local === 0 && strand > 3 ? R[3] : c0;
        p.set(x, y, c);
    }
}

/** Tiles in staggered rows, each with a curved lower edge. */
function tiles (p: Pix, ramp: readonly number[]) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const row = Math.floor(y / 8), ly = y % 8, xo = (x + (row & 1) * 8) % 16;
        let c = ramp[2];
        const curve = Math.abs(xo - 8) / 8;                     // 0 in the middle of a tile, 1 at its sides
        if (ly >= 5 + Math.round(curve * 2)) c = ramp[1];       // the shaded rounded lower edge
        if (ly === 7 || ly >= 6 + Math.round(curve * 2)) c = ramp[0];
        if (xo === 0 || xo === 15) c = ramp[0];
        else if (xo === 1 || (ly === 0 && xo < 14)) c = ramp[3];
        p.set(x, y, c);
    }
}

const WALL_STYLES: Record<string, WallStyle> = {
    wall_wood: { ramp: RAMP.wood, pattern: 'wood' },
    wall_stone: { ramp: RAMP.stone, pattern: 'stone' },
    wall_brick: { ramp: BRICK, pattern: 'brick' },
    wall_window: { ramp: RAMP.wood, pattern: 'wood', window: true },
};

export function registerStorybookHouse (scene: Phaser.Scene) {
    for (const [key, st] of Object.entries(WALL_STYLES)) {
        paintFrames(scene, key, 16, 16, 16, (p, _r, f) => wallFrame(p, f, st), 1);
        paint(scene, `${key}_icon`, 16, 16, (p) => wallFrame(p, 10, st), 1);          // for menus: a short run, east to west
    }
    paint(scene, 'doorway', 16, 16, (p) => doorway(p), 1);
    paint(scene, 'roof_thatch', 16, 16, (p) => thatch(p), 1);
    paint(scene, 'roof_tile', 16, 16, (p) => tiles(p, [0x7a2f2a, 0xa84a3a, 0xd0684a, 0xf08a64]), 1);
    paint(scene, 'roof_slate', 16, 16, (p) => tiles(p, [0x3a3c52, 0x555878, 0x747aa0, 0x9ea4c8]), 1);
}
