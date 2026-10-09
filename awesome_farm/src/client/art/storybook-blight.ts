// The Blight's art and the defenses against it, painted like everything else. For now: the Bed (a farmer's wake-up spot).

import { lit } from './storybook-build';
import { paint, Pix, RAMP } from './paint';

const W = RAMP.wood;

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
    paint(scene, 'sleepbed', 16, 32, (p) => bed(p), 1);
}
