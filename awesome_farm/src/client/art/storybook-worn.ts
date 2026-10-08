// What a farmer wears, painted to sit on the farmer sprite (storybook-chars.ts): hats and helms, armor and tunics,
// charms on a cord, and a cloak behind. Each is its own texture the game lays over the character, so changing gear
// is just swapping a layer, and other players see it too.
//
// The overlay canvas is bigger than the farmer (17×18 logical against 13×14) so crowns, horns and pauldrons can
// stick out; both share the same bottom-centre, so they line up. Coordinates below are the FARMER's own (the
// sprite is 26×28 painted pixels, body ellipse centred at 13,16): the `W` helper shifts them into the overlay.

import { PAL } from '../../shared/palette';
import { INK, mixc, outlineOf, paint, Pix, RAMP } from './paint';

const OX = 4, OY = 8;                   // where the farmer sits inside the bigger overlay canvas
const CX = 13;                          // the farmer's centre line

/** Painting in the farmer's coordinates. */
class W {
    constructor (readonly p: Pix) {}
    e (cx: number, cy: number, rx: number, ry: number, ramp: readonly number[], o: { light?: [number, number]; bias?: number; alpha?: number } = {}) { this.p.ellipse(cx + OX, cy + OY, rx, ry, ramp, o); }
    er (cx: number, cy: number, rx: number, ry: number, ang: number, ramp: readonly number[], o: { bias?: number } = {}) { this.p.ellipseRot(cx + OX, cy + OY, rx, ry, ang, ramp, o); }
    r (x: number, y: number, w: number, h: number, c: number, a = 1) { this.p.rect(x + OX, y + OY, w, h, c, a); }
    s (x: number, y: number, c: number, a = 1) { this.p.set(x + OX, y + OY, c, a); }
    poly (pts: [number, number][], c: number | ((u: number, v: number) => number)) { this.p.poly(pts.map(([x, y]) => [x + OX, y + OY] as [number, number]), c); }
    line (x0: number, y0: number, x1: number, y1: number, c: number) { this.p.line(x0 + OX, y0 + OY, x1 + OX, y1 + OY, c); }
    /** Make a column of pixels see-through again (the sprout comes up through a hat). */
    hole (x: number, y0: number, y1: number, wd = 2) { for (let y = y0; y <= y1; y++) for (let i = 0; i < wd; i++) this.p.set(x + i + OX, y + OY, -1); }
    get (x: number, y: number) { return this.p.get(x + OX, y + OY); }
    /** Clear everything above row `y` (so armor leaves the face and scarf alone). */
    clearAbove (y: number) { for (let j = 0; j < y + OY; j++) for (let i = 0; i < this.p.w; i++) this.p.set(i, j, -1); }
    /** Keep only what lies inside the farmer's round body. */
    clipToBody (pad = 0) {
        for (let j = 0; j < this.p.h; j++) for (let i = 0; i < this.p.w; i++) {
            const dx = (i - OX + 0.5 - CX) / (9.2 + pad), dy = (j - OY + 0.5 - 16) / (9.6 + pad);
            if (dx * dx + dy * dy > 1) this.p.set(i, j, -1);
        }
    }
}

const finish = (w: W, rim?: (c: number) => number) => { w.p.outline(rim ?? ((c) => outlineOf(c, 0.62))); };

// ── colour ramps ─────────────────────────────────────────────────────────────
const CLOTH = [0x4d6b86, 0x6d8fae, 0x93b6d2, 0xbcd8ea];
const LINEN = [0x7d8f6a, 0xa3b88a, 0xc5d6a8, 0xe4efca];
const LEATHER = [0x5a3a26, 0x7e5236, 0xa06a42, 0xc48a58];
const IRON = RAMP.stone;
const STEEL = [0x5f7595, 0x8aa3c4, 0xbad0ea, 0xeaf4ff];
const CRYSTAL = [0x3f3a8a, 0x6154c8, 0x8f80f0, 0xcfc4ff];
const STONE = [0x5a5a52, 0x7f7f72, 0xa4a490, 0xcbcbb4];
const VIOLET = [0x2c2150, 0x483a86, 0x6a58b8, 0x9a88e0];
const FROST = RAMP.ice;
const SLIME = [0x358a52, 0x58b96f, 0x86e098, 0xc8ffd2];
const WRAITH = [0x1e1a30, 0x362f58, 0x544b82, 0x7c72aa];
const GOLD = RAMP.gold;
const CYAN = 0x7af0ff;

// ── hats and helms ───────────────────────────────────────────────────────────
/** The dome that sits on the head: it hides the top of the body, the sprout comes up through a hole. */
function dome (w: W, ramp: readonly number[], o: { top?: number; rx?: number; ry?: number } = {}) {
    const top = o.top ?? 5.4, rx = o.rx ?? 8.5, ry = o.ry ?? 3.7;
    w.e(CX, top + ry, rx, ry, ramp, { bias: 0.22 });
    w.hole(CX - 1, 0, 11, 2);
}
function band (w: W, c: number, y = 12, x0 = 5, x1 = 21) { w.r(x0, y, x1 - x0, 1, c); }

const HEADS: Record<string, (w: W) => void> = {
    cap_cloth (w) {
        dome(w, CLOTH);
        band(w, CLOTH[0], 11.6, 6, 20);
        w.e(5.4, 12.4, 1.8, 1.3, CLOTH, { bias: 0.2 }); w.e(20.6, 12.4, 1.8, 1.3, CLOTH, { bias: 0.2 });       // a soft fold over each ear
        w.s(8, 7, CLOTH[3]); w.s(9, 7, CLOTH[3]);
        w.hole(CX - 1, 0, 11, 2);
    },
    cap_hide (w) {
        dome(w, LEATHER);
        band(w, LEATHER[0], 11.6, 6, 20);
        for (let x = 7; x <= 19; x += 3) if (x < 12 || x > 13) w.s(x, 12, LEATHER[3]);                         // stitches
        w.e(4.6, 15, 2, 3.3, LEATHER, { bias: 0.2 }); w.e(21.4, 15, 2, 3.3, LEATHER, { bias: 0.2 });          // ear flaps
        w.hole(CX - 1, 0, 11, 2);
    },
    helm_iron (w) {
        dome(w, IRON);
        band(w, IRON[0], 11.6, 5, 21);
        w.r(CX - 1, 11, 2, 4, IRON[1]);                                                                       // the nose guard
        for (const x of [7, 10, 16, 19]) w.s(x, 11, IRON[4]);                                                  // rivets
        w.e(4.8, 14.4, 1.6, 2.5, IRON, { bias: 0.2 }); w.e(21.2, 14.4, 1.6, 2.5, IRON, { bias: 0.2 });         // cheek plates
        w.hole(CX - 1, 0, 10, 2);
    },
    helm_steel (w) {
        dome(w, STEEL, { rx: 8.8 });
        band(w, GOLD[1], 11.6, 5, 21);
        w.r(CX - 1, 11, 2, 4, STEEL[1]);
        w.e(4.8, 14.6, 1.8, 2.9, STEEL, { bias: 0.2 }); w.e(21.2, 14.6, 1.8, 2.9, STEEL, { bias: 0.2 });
        w.poly([[10, 5.4], [12, 2], [13, 5.4]], STEEL[2]); w.poly([[13, 5.4], [14, 2], [16, 5.4]], STEEL[1]);  // a little crest either side of the stem
        for (const x of [7, 10, 16, 19]) w.s(x, 11, GOLD[2]);
        w.hole(CX - 1, 0, 10, 2);
    },
    helm_crystal (w) {
        dome(w, CRYSTAL, { rx: 8.8 });
        band(w, CRYSTAL[0], 11.6, 5, 21);
        w.poly([[5, 8], [3, 1], [8, 6]], CRYSTAL[3]); w.poly([[21, 8], [23, 1], [18, 6]], CRYSTAL[2]); w.poly([[8.5, 6], [8, 0], [11, 5]], CRYSTAL[2]); w.poly([[17.5, 6], [18, 0], [15, 5]], CRYSTAL[3]);
        w.poly([[12, 9.4], [13, 8], [14, 9.4], [13, 11.6]], 0xf4eeff);                                       // a gem on the brow
        w.hole(CX - 1, 2, 7, 2);
    },
    crown_slime (w) {
        w.r(5, 9, 16, 3, SLIME[1]);
        w.r(5, 9, 16, 1, SLIME[3]); w.r(5, 11, 16, 1, SLIME[0]);
        for (const x of [5, 8, 16, 19]) w.poly([[x, 9], [x + 1.5, 4.5], [x + 3, 9]], (_u, v) => (v < 0.5 ? SLIME[3] : SLIME[2]));      // points
        for (const [x, l] of [[7, 3], [11, 2], [15, 3], [19, 4]] as [number, number][]) { w.r(x, 12, 2, l, SLIME[1]); w.e(x + 1, 12 + l, 1.3, 1.2, SLIME, { bias: 0.3 }); }  // drips
        w.hole(CX - 1, 0, 11, 2);
    },
    helm_frost (w) {
        dome(w, FROST, { rx: 8.8 });
        w.r(5, 11, 16, 2, 0xf4fdff); w.r(5, 13, 16, 1, 0xcfeaf4);                                             // a rim of white fur
        w.er(4, 7, 4.2, 1.4, -1.0, [0xaeb8d0, 0xd2dcec, 0xf2f6ff], {}); w.er(22, 7, 4.2, 1.4, 1.0, [0xaeb8d0, 0xd2dcec, 0xf2f6ff], {});   // horns
        w.poly([[2.5, 4], [1, 0], [4.5, 3]], 0xf2f6ff); w.poly([[23.5, 4], [25, 0], [21.5, 3]], 0xf2f6ff);
        w.s(10, 7, 0xffffff); w.s(16, 8, 0xffffff); w.s(13, 3, 0xffffff);
        w.hole(CX - 1, 0, 10, 2);
    },
    helm_rift (w) {
        dome(w, VIOLET, { rx: 8.8 });
        band(w, VIOLET[0], 11.6, 5, 21);
        w.poly([[11.5, 9.4], [13, 7.6], [14.5, 9.4], [13, 11.4]], CYAN);                                      // a rune on the brow
        w.poly([[12.3, 9.4], [13, 8.6], [13.7, 9.4], [13, 10.4]], 0xffffff);
        w.poly([[3, 4], [4.5, 1.5], [6, 4], [4.5, 6]], [0x9a88e0, 0x7af0ff][0]); w.poly([[20, 5], [21.5, 2.5], [23, 5], [21.5, 7]], 0x7af0ff);   // shards that drift beside it
        w.hole(CX - 1, 0, 10, 2);
    },
};

// ── armor and clothes ────────────────────────────────────────────────────────
/** Refill the belly below the scarf in a new material (the body ellipse again, so the shading matches). */
function belly (w: W, ramp: readonly number[], from = 23) {
    const t = new Pix(w.p.w, w.p.h);
    const s = new W(t);
    s.e(CX, 16, 9.2, 9.6, ramp, { bias: 0.25 });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { const c = t.get(x, y); if (c !== -1 && y >= from + OY) w.p.set(x, y, c); }
}
function cuffs (w: W, ramp: readonly number[]) { w.e(3.6, 19.4, 2.1, 2.2, ramp, { bias: 0.2 }); w.e(22.4, 18.6, 2.2, 2.2, ramp, { bias: 0.2 }); }
function pauldrons (w: W, ramp: readonly number[], rx = 3.4, ry = 2.5, trim?: number) {
    w.e(4.6, 13.8, rx, ry, ramp, { bias: 0.2 }); w.e(21.4, 13.8, rx, ry, ramp, { bias: 0.2 });
    if (trim !== undefined) { w.r(4.6 - rx + 0.6, 15.4, rx * 2 - 1, 1, trim); w.r(21.4 - rx + 0.6, 15.4, rx * 2 - 1, 1, trim); }
}
function belt (w: W, c: number, buckle: number, y = 24) { w.r(5, y, 16, 1, c); w.r(CX - 1, y - 0.5, 3, 2, buckle); w.s(CX, y, c); }

const BODIES: Record<string, (w: W) => void> = {
    tunic_cloth (w) {
        belly(w, LINEN); cuffs(w, LINEN); belt(w, LEATHER[0], GOLD[2]);
        w.r(5, 25, 16, 1, LINEN[0]);
        w.clipToBody(0.9);
    },
    tunic_hide (w) {
        belly(w, LEATHER); cuffs(w, LEATHER); belt(w, LEATHER[0], LEATHER[3]);
        w.line(5, 14, 9, 21, LEATHER[0]); w.line(6, 14, 10, 21, LEATHER[1]); w.line(21, 14, 17, 21, LEATHER[0]); w.line(20, 14, 16, 21, LEATHER[1]);   // crossed straps
        for (const [x, y] of [[8, 19], [18, 19]] as [number, number][]) w.s(x, y, LEATHER[3]);
        w.clipToBody(0.9);
    },
    mail_iron (w) {
        belly(w, IRON); cuffs(w, IRON); pauldrons(w, IRON, 3.0, 2.2);
        w.r(6, 20, 14, 1, IRON[2]);                                                                           // a ringed collar under the face
        for (let x = 6; x < 20; x += 2) w.s(x, 25, IRON[0]);
        belt(w, IRON[0], IRON[4]);
    },
    plate_steel (w) {
        belly(w, STEEL); cuffs(w, STEEL); pauldrons(w, STEEL, 3.6, 2.7, GOLD[2]);
        w.r(5, 23, 16, 1, GOLD[1]);
        w.poly([[12, 24], [13, 23.4], [14, 24], [13, 26]], GOLD[3]);
        w.r(6, 20, 14, 1, STEEL[2]);
    },
    plate_crystal (w) {
        belly(w, CRYSTAL); cuffs(w, CRYSTAL);
        pauldrons(w, CRYSTAL, 3.4, 2.5);
        w.poly([[2, 14], [0, 7], [5, 12]], CRYSTAL[3]); w.poly([[24, 14], [26, 7], [21, 12]], CRYSTAL[2]);
        w.poly([[12, 23.6], [13, 22.6], [14, 23.6], [13, 25.8]], 0xf4eeff);
        w.r(6, 20, 14, 1, CRYSTAL[3]);
    },
    plate_colossus (w) {
        belly(w, STONE); cuffs(w, STONE);
        pauldrons(w, STONE, 4.2, 3.0);
        w.r(5, 23, 16, 2, STONE[0]);
        for (const [x, y] of [[3, 11], [5, 11], [4, 12], [21, 11], [23, 11], [22, 12], [9, 24], [16, 25]] as [number, number][]) w.s(x, y, RAMP.leaf[2]);   // moss
        w.r(6, 20, 14, 1, STONE[2]);
    },
    plate_rift (w) {
        belly(w, VIOLET); cuffs(w, VIOLET); pauldrons(w, VIOLET, 3.7, 2.7, CYAN);
        w.line(7, 24, 11, 24, CYAN); w.line(15, 24, 19, 24, CYAN); w.s(13, 25, CYAN); w.s(13, 23, CYAN);
        w.poly([[1.5, 12], [0.5, 8], [4, 11]], CYAN);
        w.r(6, 20, 14, 1, VIOLET[3]);
    },
    cloak_shroud (w) {
        // the cloak itself hangs behind (worn_back_cloak_shroud); here only the clasp and collar show
        w.r(6, 20, 14, 1, WRAITH[2]);
        w.e(CX, 20.6, 1.6, 1.4, GOLD, { bias: 0.2 }); w.s(CX, 20, 0xffffff);
        cuffs(w, WRAITH);
    },
};

// ── charms on a cord ─────────────────────────────────────────────────────────
const CHARMS: Record<string, (w: W) => void> = {
    charm_lucky (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.r(12, 24, 3, 1, RAMP.leaf[3]); w.r(13, 23, 1, 3, RAMP.leaf[3]); w.r(12, 24, 1, 1, RAMP.leaf[2]); w.s(14, 24, RAMP.leaf[1]); },
    charm_fortune (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.r(12, 24, 3, 3, 0xffd966); w.r(13, 24, 1, 3, 0xfff3b0); w.s(13, 23, 0xc58f3e); w.s(12, 27, 0xc58f3e); w.s(14, 27, 0xc58f3e); },
    charm_swift (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.line(15, 23, 12, 26, 0xf4fbff); w.line(15, 24, 13, 26, 0xa8d8f0); w.s(15, 23, 0xffffff); },
    charm_vital (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.r(11, 24, 2, 1, 0xf0a020); w.r(14, 24, 2, 1, 0xf0a020); w.r(12, 25, 4, 1, 0xdc8a14); w.r(13, 26, 2, 1, 0xb8680c); w.s(11, 24, 0xffe090); },
    charm_hex (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.poly([[12, 25], [13.5, 23.2], [15, 25], [13.5, 27]], 0x9a5ad0); w.s(13, 25, 0xf0d8ff); w.s(14, 25, 0x3a1a60); },
    charm_scarab (w) { w.line(8, 21, 13, 24, 0x6a5238); w.line(18, 21, 13, 24, 0x6a5238); w.e(13.5, 25, 2.4, 2.0, [0x1f6a60, 0x2fa090, 0x56d0b8, 0xa8f4e0]); w.r(12, 24, 3, 1, GOLD[2]); w.s(13, 22.6, GOLD[2]); },
    charm_rift (w) { w.line(8, 21, 13, 24, 0x5a4a8a); w.line(18, 21, 13, 24, 0x5a4a8a); w.poly([[12, 25], [13.5, 22.8], [15, 25], [13.5, 27.4]], CYAN); w.poly([[12.8, 25], [13.5, 24], [14.2, 25], [13.5, 26]], 0xffffff); },
    charm_heart (w) { w.line(8, 21, 13, 24, 0xc8a050); w.line(18, 21, 13, 24, 0xc8a050); w.e(12.2, 25, 1.8, 1.6, RAMP.red); w.e(14.8, 25, 1.8, 1.6, RAMP.red); w.poly([[10.6, 25.4], [16.4, 25.4], [13.5, 28.4]], (_u, v) => (v < 0.5 ? RAMP.red[2] : RAMP.red[1])); w.s(11, 24, 0xffd8d8); },
};


// ── packs: straps and hip bags in front, the load behind ────────────────────
const CANVAS = [0x2f6a78, 0x4a93a2, 0x72bccb, 0xa8e4ee];
const BAGS: Record<string, { front: (w: W) => void; back: (w: W) => void }> = {
    bag_satchel: {
        front (w) {
            w.line(5, 14, 6, 22, LEATHER[0]); w.line(6, 14, 7, 22, LEATHER[2]);
            w.line(6, 23, 20, 25, LEATHER[0]);
            w.r(19, 21, 6, 5, LEATHER[1]); w.r(19, 21, 6, 2, LEATHER[3]); w.r(21, 23, 2, 1, GOLD[2]);
        },
        back () { /* a satchel hangs at the hip, nothing behind */ },
    },
    bag_rucksack: {
        front (w) { for (const x of [5, 20]) { w.r(x, 13, 2, 10, LEATHER[1]); w.r(x, 13, 1, 10, LEATHER[3]); } w.r(5, 18, 16, 1, LEATHER[0]); w.s(13, 18, GOLD[2]); },
        back (w) {
            w.e(13, 17.5, 11.6, 8.6, LEATHER, { bias: 0.25 });
            w.e(13, 9.4, 6.5, 3, LEATHER, { bias: 0.25 });
            w.e(2.8, 21, 2.4, 3.2, LEATHER, { bias: 0.2 }); w.e(23.2, 21, 2.4, 3.2, LEATHER, { bias: 0.2 });
            w.r(8, 10, 10, 1, LEATHER[0]);
        },
    },
    bag_pack: {
        front (w) { for (const x of [5, 20]) { w.r(x, 13, 2, 11, CANVAS[1]); w.r(x, 13, 1, 11, CANVAS[3]); } w.r(5, 19, 16, 1, CANVAS[0]); w.r(12, 18, 2, 3, GOLD[2]); },
        back (w) {
            w.e(13, 17.5, 11.8, 9.2, CANVAS, { bias: 0.25 });
            w.er(13, 7.4, 8.4, 2.4, 0, [0x6a4a30, 0x8a6240, 0xb08050, 0xd8a870], {});                 // a bedroll on top
            w.r(7, 6, 1, 3, GOLD[1]); w.r(18, 6, 1, 3, GOLD[1]);
            w.e(2.6, 21.5, 2.5, 3.4, CANVAS, { bias: 0.2 }); w.e(23.4, 21.5, 2.5, 3.4, CANVAS, { bias: 0.2 });
        },
    },
    bag_frame: {
        front (w) { for (const x of [5, 20]) { w.r(x, 12, 2, 12, IRON[1]); w.r(x, 12, 1, 12, IRON[3]); } w.r(5, 17, 16, 2, IRON[0]); w.r(12, 17, 2, 2, GOLD[2]); },
        back (w) {
            w.r(2, 0, 22, 4, IRON[1]);                                                                   // the frame, standing taller than the farmer
            w.r(3, 4, 2, 22, IRON[1]); w.r(21, 4, 2, 22, IRON[1]);
            w.r(4, 4, 18, 10, 0x8f5a36); w.r(4, 4, 18, 2, 0xb87a46); w.r(4, 9, 18, 1, 0x6a432f); w.r(12, 4, 2, 10, 0x6a432f);   // a crate roped on
            w.r(4, 14, 18, 8, 0xc58f3e); w.r(4, 14, 18, 2, 0xe3b155); w.r(4, 18, 18, 1, 0x9c6a2c);    // and a bale under it
            w.r(3, 24, 20, 2, IRON[0]);
        },
    },
    bag_rift: {
        front (w) { for (const x of [5, 20]) { w.r(x, 13, 2, 11, VIOLET[2]); w.r(x, 13, 1, 11, VIOLET[3]); } w.r(5, 19, 16, 1, CYAN); w.poly([[12, 19], [13, 17.5], [14, 19], [13, 21]], CYAN); },
        back (w) {
            w.e(13, 16.5, 11.8, 9.6, VIOLET, { bias: 0.25 });
            w.e(13, 8.6, 7, 3.2, VIOLET, { bias: 0.25 });
            w.er(8, 17, 3, 1.1, 0.7, [0x7af0ff], {}); w.er(18, 20, 3, 1.1, -0.7, [0x7af0ff], {});        // a swirl that is not quite there
            w.e(3, 22, 2.4, 3, VIOLET, { bias: 0.2 }); w.e(23, 22, 2.4, 3, VIOLET, { bias: 0.2 });
        },
    },
};

/** The cloak hangs behind the body: only the flaps either side and the hem show. */
function cloakBack (w: W) {
    const top = 13.5, hem = 27;
    w.poly([[4, top], [22, top], [25.5, hem - 2], [24, hem], [20.5, hem - 1.2], [17, hem], [13, hem - 1], [9, hem], [5.5, hem - 1.2], [2, hem], [0.5, hem - 2]], (_u, v) => WRAITH[Math.min(3, Math.floor(v * 3.4))]);
    w.line(13, top + 2, 13, hem - 2, WRAITH[0]);
    w.p.outline((c) => outlineOf(c, 0.5));
}

/** Items the game knows how to dress a farmer in. */
export const WORN_HEAD = Object.keys(HEADS);
export const WORN_BODY = Object.keys(BODIES);
export const WORN_CHARM = Object.keys(CHARMS);
export const WORN_BACK = ['cloak_shroud'];
export const WORN_BAG = Object.keys(BAGS);

export function registerStorybookWorn (scene: Phaser.Scene) {
    const make = (key: string, draw: (w: W) => void, rim?: (c: number) => number, seed = 1) => paint(scene, key, 17, 18, (p) => { const w = new W(p); draw(w); finish(w, rim); }, seed);
    for (const [id, f] of Object.entries(HEADS)) make(`worn_${id}`, f);
    for (const [id, f] of Object.entries(BODIES)) make(`worn_${id}`, f);
    for (const [id, f] of Object.entries(CHARMS)) make(`worn_${id}`, f, (c) => (c === 0xffffff ? c : outlineOf(c, 0.55)));
    make('worn_back_cloak_shroud', cloakBack);
    for (const [id, b] of Object.entries(BAGS)) { make(`worn_${id}`, b.front); make(`worn_back_${id}`, b.back); }
    void INK; void mixc; void PAL;
}
