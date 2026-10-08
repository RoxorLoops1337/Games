// Painted landmarks: the creature den, the hatchery and its egg, the waystone, the boss altar and the
// rift station pieces (dock, forge, gate). Frames match the grid sprites they replace.

import { INK, mixc, outlineOf, paint, paintFrames, Pix, RAMP, RNG } from './paint';
import { IRON, lit } from './storybook-build';

const W = RAMP.wood, ST = RAMP.stone, CR = RAMP.cream, TH = RAMP.thatch, VI = RAMP.violet;
const PLASTER = [0xd9c3a0, 0xecdcb8, 0xf8ecd0, 0xfff7e3];

// ── the creature den: a thatched cottage with a round door ─────────────────
function den (p: Pix, occupied: boolean) {
    const rnd = RNG(21);
    // a chimney with a curl of smoke
    lit(p, 44, 8, 8, 18, ST); p.rect(43, 7, 10, 3, ST[3]); p.rect(43, 9, 10, 1, ST[1]);
    for (const [x, y, r, a] of [[48, 4, 3, 0.55], [51, 1, 2.4, 0.4]] as const) p.ellipse(x, y, r, r, [0xfff7e3], { alpha: a });
    // walls: plaster lit from the left, with timbers and a stone foundation
    for (let y = 30; y <= 60; y++) for (let x = 8; x <= 56; x++) {
        const t = (x - 8) / 48;
        let c = t < 0.12 ? PLASTER[3] : t < 0.7 ? PLASTER[2] : PLASTER[1];
        if (y > 56) c = t < 0.7 ? ST[2] : ST[1];
        p.set(x, y, c);
    }
    for (let x = 8; x <= 56; x += 4) p.set(x, 58, ST[1]);
    p.rect(8, 30, 3, 28, W[2]); p.rect(54, 30, 3, 28, W[1]); p.rect(8, 31, 49, 3, W[2]); p.rect(11, 34, 43, 1, W[1]);
    // the round door, with a handle
    p.poly([[24, 59], [24, 46], [26, 42], [30, 40], [34, 40], [38, 42], [40, 46], [40, 59]], W[1]);
    p.poly([[26, 59], [26, 47], [28, 44], [31, 42], [33, 42], [36, 44], [38, 47], [38, 59]], (u) => (u < 0.4 ? W[3] : u < 0.75 ? W[2] : W[1]));
    p.rect(32, 43, 1, 16, W[1]);
    if (occupied) { p.poly([[27, 59], [27, 47], [29, 45], [35, 45], [37, 47], [37, 59]], 0x25222f); p.rect(29, 49, 2, 2, 0xffd966); p.rect(34, 49, 2, 2, 0xffd966); }
    else { p.set(36, 52, 0xffd966); p.set(36, 53, TH[1]); }
    p.rect(22, 58, 20, 2, ST[3]);
    // a round window with a cross, and a flower box
    p.ellipse(47, 46, 5.5, 5.5, [W[1]]); p.ellipse(47, 46, 4.4, 4.4, [0xffcf6a, 0xffe08a, 0xfff0b0], { light: [-0.3, -0.5] });
    p.rect(42, 46, 10, 1, W[1]); p.rect(47, 41, 1, 10, W[1]);
    p.rect(12, 46, 9, 6, W[1]); p.rect(13, 47, 7, 4, 0xffe08a); p.rect(16, 47, 1, 4, W[1]);
    p.rect(11, 52, 11, 3, W[2]); p.rect(11, 54, 11, 1, W[1]);
    for (const [x, y, c] of [[12, 51, 0xf79fc6], [15, 51, 0xe85d62], [18, 51, 0xf79fc6], [13, 50, 0x5cb04f], [16, 50, 0x5cb04f], [20, 51, 0xfff6e0]] as const) p.set(x, y, c);
    // a deep thatched roof with a ragged hem
    const top = 6, rows = 24;
    for (let r = 0; r < rows; r++) {
        const y = top + r, hw = 10 + r * 0.82;
        for (let x = Math.ceil(32 - hw); x <= Math.floor(32 + hw - 0.5); x++) {
            const t = (x - (32 - hw)) / (2 * hw);
            let i = t < 0.18 ? 3 : t < 0.55 ? 2 : t < 0.85 ? 1 : 0;
            if (r < 3) i = Math.min(3, i + 1);
            if ((r + (x >> 1)) % 4 === 3) i = Math.max(0, i - 1);
            if (rnd() < 0.07) i = Math.min(3, i + 1);
            p.set(x, y, TH[i]);
        }
    }
    for (let x = 2; x <= 62; x++) { const y = top + rows; if ((x + (x >> 2)) % 3 !== 0) p.set(x, y, x < 32 ? TH[2] : TH[0]); if ((x + 1) % 4 < 2) p.set(x, y + 1, TH[0]); }
    p.rect(29, top - 2, 6, 2, W[2]);
    p.outline();
}

// ── the hatchery: a crate of straw with an egg ─────────────────────────────
function egg (p: Pix, cx: number, cy: number, rx: number, ry: number, cracked: boolean, f: number) {
    p.ellipse(cx, cy, rx, ry, CR, { bias: 0.2 });
    // speckles
    for (const [dx, dy, c] of [[-2, 1, 0xf2a3b8], [1, -2, 0xd8b08a], [2, 2, 0xf2a3b8], [-1, 3, 0xd8b08a], [0, 0, 0xf2a3b8], [-2, -3, 0xd8b08a], [3, -1, 0xd8b08a]] as const) { const x = Math.round(cx + dx * (rx / 4.5)), y = Math.round(cy + dy * (ry / 6)); p.set(x, y, c); p.set(x + 1, y, c); }
    if (cracked) {
        const c = f ? 0xffd966 : 0xf8a24a;
        p.line(Math.round(cx - 3), Math.round(cy - ry + 3), Math.round(cx), Math.round(cy - 2), INK);
        p.line(Math.round(cx), Math.round(cy - 2), Math.round(cx + 3), Math.round(cy + 1), INK);
        p.line(Math.round(cx + 3), Math.round(cy + 1), Math.round(cx + 1), Math.round(cy + 5), INK);
        p.set(Math.round(cx - 1), Math.round(cy - 4), c); p.set(Math.round(cx + 1), Math.round(cy), c); p.set(Math.round(cx - 2), Math.round(cy - 3), c);
    }
}

function sparkle (p: Pix, x: number, y: number, c: number) { p.set(x, y, c); p.set(x - 1, y, 0xffffff); p.set(x + 1, y, 0xffffff); p.set(x, y - 1, 0xffffff); p.set(x, y + 1, 0xffffff); }

function hatchery (p: Pix, frame: number, f: number) {
    // the crate
    lit(p, 4, 34, 60, 26, W);
    for (const x of [18, 32, 46]) p.rect(x, 38, 1, 18, W[1]);
    p.rect(4, 34, 4, 26, W[3]); p.rect(60, 34, 4, 26, W[1]); p.rect(4, 56, 60, 4, W[1]); p.rect(4, 56, 60, 1, W[2]);
    // straw heaped inside
    p.ellipse(34, 36, 26, 9, [RAMP.straw[0], RAMP.straw[1], RAMP.straw[2]], { bias: 0.15 });
    p.ellipse(32, 35, 21, 6.4, [RAMP.straw[2], RAMP.straw[3]], { bias: 0.1 });
    for (let i = 0; i < 26; i++) { const x = 10 + ((i * 7) % 46), y = 30 + ((i * 3) % 10); p.set(x, y, i % 3 ? RAMP.straw[1] : RAMP.straw[3]); p.set(x + 1, y + 1, RAMP.straw[3]); }
    if (frame === 1) {
        egg(p, 34, 22, 9, 12, false, f);
        if (f) { sparkle(p, 20, 16, 0xf79fc6); sparkle(p, 46, 12, 0xf79fc6); } else { sparkle(p, 22, 12, 0xf79fc6); sparkle(p, 44, 18, 0xf79fc6); }
    } else if (frame === 2) {
        egg(p, 34, 20, 9, 12, true, f);
        const s = f ? [[16, 10], [48, 8], [24, 2], [41, 4]] : [[18, 6], [50, 14], [28, 0], [39, 8]];
        for (const [x, y] of s) sparkle(p, x, Math.max(1, y), 0xffd966);
    }
    p.outline((c) => (c === 0xf2a3b8 || c === 0xd8b08a ? outlineOf(CR[1]) : outlineOf(c)));
}

// ── the waystone: a standing stone with glowing runes ──────────────────────
function waystone (p: Pix, f: number) {
    // a ring of rubble at the foot, then the tall stone
    lit(p, 6, 52, 24, 6, ST);
    p.poly([[9, 52], [11, 12], [15, 3], [21, 3], [25, 12], [27, 52]], (u) => (u < 0.22 ? ST[3] : u < 0.62 ? ST[2] : u < 0.86 ? ST[1] : ST[0]));
    p.poly([[15, 3], [21, 3], [19, 0], [17, 0]], ST[4]);
    // runes cut into it, glowing blue-white (brighter in the second frame)
    const glow = f ? [0xe8fbff, 0xaee8f0] : [0x9edcf0, 0x4ab2cf];
    for (const [x, y] of [[16, 14], [20, 22], [15, 30], [21, 38], [17, 46]] as const) { p.rect(x, y, 3, 1, glow[0]); p.rect(x + 1, y + 1, 1, 3, glow[0]); p.rect(x - 1, y + 2, 2, 1, glow[1]); }
    p.ellipse(18, 8, 2.6, 2.6, [glow[1], glow[0]]);
    if (f) { sparkle(p, 6, 10, 0xffffff); sparkle(p, 31, 22, 0xcdf4ee); }
    p.outline();
}

// ── the boss altar: a stepped dais with a crystal obelisk ──────────────────
function altar (p: Pix, f: number) {
    lit(p, 3, 46, 58, 14, ST); p.rect(3, 46, 58, 3, ST[4]);
    for (let x = 8; x < 58; x += 8) p.rect(x, 53, 2, 2, f ? VI[3] : VI[2]);
    lit(p, 11, 36, 42, 11, ST); p.rect(11, 36, 42, 2, ST[4]);
    lit(p, 24, 26, 16, 11, ST);
    // the crystal rising out of it, with a bright core
    p.poly([[28, 28], [26, 18], [32, 4], [38, 18], [36, 28]], (u, v) => (u < 0.4 ? VI[3] : u < 0.7 ? VI[2] : VI[1]) + 0 * v);
    p.poly([[32, 4], [34, 10], [32, 26], [30, 10]], f ? 0xf0e4ff : VI[3]);
    p.set(31, 12, 0xffffff); p.set(31, 13, 0xffffff);
    for (const [x, y] of [[44, 24], [20, 14], [46, 12]] as const) { p.set(x, y, f ? 0xf79fc6 : VI[2]); p.set(x, y + 1, f ? 0xfff6e0 : VI[3]); }
    p.outline((c) => (VI.includes(c) || c === 0xf0e4ff ? mixc(VI[0], INK, 0.5) : outlineOf(c)));
}

// ── the rift station: a dock with crates and a flag, a forge, and the gate ─
function dock (p: Pix, f: number) {
    // a long counter, a crate, a flag on a pole, and a pink crystal on a plinth
    lit(p, 2, 40, 96, 26, W);
    for (let x = 14; x < 96; x += 14) p.rect(x, 42, 1, 20, W[1]);
    p.rect(2, 62, 96, 4, W[1]); p.rect(2, 40, 96, 3, W[3]);
    lit(p, 6, 18, 24, 22, W);
    for (const [x1, y1, x2, y2] of [[7, 19, 28, 38], [28, 19, 7, 38]] as const) p.line(x1, y1, x2, y2, W[1]);
    p.rect(30, 30, 10, 10, 0xe8bc84); p.rect(30, 30, 10, 2, 0xf8d8a8);
    p.rect(44, 4, 3, 40, W[1]); p.rect(44, 4, 1, 40, W[3]);
    const w = f ? 1 : 0;
    p.poly([[47, 6], [66 + w, 8 + w], [66 - w, 18], [47, 20]], (u) => (u < 0.5 ? VI[2] : VI[1]));
    p.rect(47, 6, 19, 2, VI[3]); p.rect(52, 12, 8, 2, CR[3]);
    lit(p, 68, 36, 24, 6, ST);
    p.poly([[72, 36], [74, 22], [80, 6], [86, 22], [88, 36]], (u) => (u < 0.4 ? 0xffd0e4 : u < 0.7 ? 0xf79fc6 : 0xc9609a));
    p.poly([[80, 6], [82, 14], [80, 34], [78, 14]], f ? 0xffffff : 0xffe4ef);
    if (f) { sparkle(p, 70, 12, 0xffffff); sparkle(p, 92, 22, 0xf79fc6); } else { sparkle(p, 92, 10, 0xf79fc6); sparkle(p, 68, 24, 0xffffff); }
    p.outline();
}

function riftforge (p: Pix, f: number) {
    // a steel slab on a studded base, with a glowing gem on top
    lit(p, 6, 24, 56, 10, IRON); for (const x of [14, 28, 42, 54]) { p.rect(x, 28, 3, 2, f ? 0xf79fc6 : VI[2]); }
    p.poly([[4, 18], [64, 18], [60, 24], [8, 24]], (u) => (u < 0.5 ? IRON[3] : IRON[2]));
    p.rect(4, 17, 60, 2, 0xd6d9ec);
    p.ellipse(34, 10, 7, 6.5, [VI[0], VI[1], VI[2], VI[3]], { bias: 0.1 });
    p.ellipse(32, 8, 2.6, 2.2, [f ? 0xffffff : VI[3]]);
    p.outline((c) => (VI.includes(c) ? mixc(VI[0], INK, 0.5) : outlineOf(c)));
}

function riftgate (p: Pix, f: number) {
    // a ring of grey stone studded with rivets round a swirling violet portal
    p.ellipse(34, 40, 30, 38, [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc], { bias: 0.15 });
    p.ellipse(34, 40, 24, 32, [0x2a1d50, 0x3d2a78]);
    // the vortex: a few bright arms spiralling out, turned a little each frame
    for (let k = 0; k < 140; k++) {
        const a = k * 0.55 + f * 0.7, r = 1 + k * 0.205;
        const x = Math.round(34 + Math.cos(a) * r * 0.8), y = Math.round(40 + Math.sin(a) * r);
        if (Math.hypot((x - 34) / 24, (y - 40) / 32) < 0.96) { p.set(x, y, k % 3 === 0 ? 0xf79fc6 : VI[3]); p.set(x + 1, y, k % 2 ? VI[2] : VI[3]); }
    }
    p.ellipse(34, 40, 4, 5, [0xfff6e0, 0xffffff]);
    for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; p.set(Math.round(34 + Math.cos(an) * 26.5), Math.round(40 + Math.sin(an) * 35), a % 2 ? 0xcdf4ee : 0x9ea4bf); }
    lit(p, 6, 74, 56, 8, ST);
    p.outline((c) => (VI.includes(c) ? mixc(VI[0], INK, 0.5) : outlineOf(c)));
}

export function registerStorybookSites (scene: Phaser.Scene) {
    paintFrames(scene, 'den', 32, 32, 2, (p, _r, f) => den(p, f === 1), 1);
    paintFrames(scene, 'hatchery', 34, 34, 5, (p, _r, k) => hatchery(p, k === 0 ? 0 : k < 3 ? 1 : 2, k === 2 || k === 4 ? 1 : 0), 1);
    paint(scene, 'egg', 16, 18, (p) => { egg(p, 16, 18, 11, 14.5, false, 0); p.outline(); }, 1);
    paintFrames(scene, 'waystone', 18, 30, 2, (p, _r, f) => waystone(p, f), 1);
    paintFrames(scene, 'altar', 32, 32, 2, (p, _r, f) => altar(p, f), 1);
    paintFrames(scene, 'dock', 50, 34, 2, (p, _r, f) => dock(p, f), 1);
    paintFrames(scene, 'riftforge', 34, 18, 2, (p, _r, f) => riftforge(p, f), 1);
    paintFrames(scene, 'riftgate', 34, 42, 3, (p, _r, f) => riftgate(p, f), 1);
}
