// The Blight's art and the defenses against it, painted like everything else: the nest (a pulsing cluster of dark eggs, two frames so
// it can throb) and the Bed. The blighted ground is in the tile sheet (storybook-ground.ts).

import { lit } from './storybook-build';
import { outlineOf, paint, paintFrames, Pix, RAMP } from './paint';

/** The nest's shell, dark → light, its veins and the glow in its cracks. */
export const NEST = [0x2a1830, 0x46284e, 0x6a3a6e, 0x925294, 0xbe7ab8];
const VEIN = 0xb02a50, GLOW = [0xe0405a, 0xff7a88, 0xffd0d6];
const W = RAMP.wood;

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
    paint(scene, 'sleepbed', 16, 32, (p) => bed(p), 1);
}
