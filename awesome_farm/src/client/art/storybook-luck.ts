// The art for luck: the buried-treasure mound that appears on your islands, and Madame Fortuna's wheel.

import { WHEEL, wheelSpans } from '../../shared/data/loot';
import { INK, mixc, paint, Pix, RAMP } from './paint';

const C = RAMP.clay, G = RAMP.gold, W = RAMP.wood, RD = RAMP.red, CR = RAMP.cream;

/** A fresh mound of earth with a red X on it and a glint. */
function treasureMound (p: Pix, rnd: () => number) {
    const w = 28, h = 18;
    const pts: [number, number][] = [[1, h - 1], [2, h - 5], [6, h - 10], [Math.round(w * 0.4), 2], [Math.round(w * 0.62), 3], [w - 6, h - 9], [w - 2, h - 5], [w - 1, h - 1]];
    p.poly(pts, (u, v) => C[Math.max(0, Math.min(C.length - 1, Math.floor((1.15 - (0.55 * u + 0.8 * v)) * C.length)))]);
    for (let x = 2; x < w - 1; x++) p.set(x, h - 1, C[0]);
    p.speckle(C, rnd, 0.1, 0.08);
    // the X
    const cx = 14, cy = 9;
    for (let i = -3; i <= 3; i++) { p.set(cx + i, cy + i, RD[1]); p.set(cx + i, cy - i, RD[1]); }
    for (let i = -3; i <= 3; i++) { p.set(cx + i + 1, cy + i, RD[0]); p.set(cx + i + 1, cy - i, RD[0]); }
    // a little gold peeking out
    p.set(8, 7, G[2]); p.set(9, 7, G[3]); p.set(8, 8, G[1]);
    p.set(20, 6, G[3]); p.set(19, 6, G[2]);
    p.outline();
}

/** The wheel: a painted disc of wedges on a wooden stand, a gold rim with studs, a red pointer at the top. */
function fortuneWheel (p: Pix) {
    const W2 = p.w, cx = W2 / 2, cy = 28, R = 25;
    // the stand
    p.poly([[cx - 9, cy + 8], [cx - 5, cy + 8], [cx - 15, 61], [cx - 21, 61]], (u) => W[u < 0.5 ? 2 : 1]);
    p.poly([[cx + 5, cy + 8], [cx + 9, cy + 8], [cx + 21, 61], [cx + 15, 61]], (u) => W[u < 0.5 ? 2 : 1]);
    p.rect(cx - 24, 60, 48, 4, W[1]); p.rect(cx - 24, 60, 48, 1, W[3]);
    // the disc
    const spans = wheelSpans();
    for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < W2; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
            if (r > R) continue;
            if (r >= R - 2.5) { p.set(x, y, G[r >= R - 1 ? 0 : (dx + dy < 0 ? 3 : 2)]); continue; }
            if (r < 3.2) { p.set(x, y, r < 1.6 ? G[3] : G[1]); continue; }
            const turn = ((Math.atan2(dx, -dy) / (Math.PI * 2)) + 1) % 1;
            const i = spans.findIndex(([a, b]) => turn >= a && turn < b);
            const wedge = WHEEL[Math.max(0, i)];
            const [a, b] = spans[Math.max(0, i)];
            const edge = Math.min(turn - a, b - turn) * r * Math.PI * 2;      // pixels from the wedge's side
            let c = wedge.color;
            c = mixc(c, 0xffffff, Math.max(0, 0.22 - r / R * 0.2) + (dx + dy < 0 ? 0.08 : -0.06));
            if (edge < 0.9) c = mixc(wedge.color, INK, 0.55);
            p.set(x, y, c);
        }
    }
    // studs round the rim
    for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, x = Math.round(cx + Math.sin(a) * (R - 1.4)), y = Math.round(cy - Math.cos(a) * (R - 1.4));
        p.set(x, y, CR[3]);
    }
    // the pointer
    p.poly([[cx - 4, 0], [cx + 4, 0], [cx, 8]], (u) => RD[u < 0.5 ? 2 : 1]);
    p.rect(cx - 4, 0, 8, 1, RD[0]);
    p.outline();
}

export function registerStorybookLuck (scene: Phaser.Scene) {
    paint(scene, 'mound', 14, 9, treasureMound, 11);
    paint(scene, 'fortune', 32, 32, (p) => fortuneWheel(p), 1);
}
