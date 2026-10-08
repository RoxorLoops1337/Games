// Painted characters: the farmer (Sprout) in eight scarf colours, with an idle and two walking frames.

import { PAL } from '../../shared/palette';
import { BODY_TONES, DEFAULT_LOOK, farmerKey, type Look } from '../../shared/data/look';
import { INK, mixc, outlineOf, paintFrames, Pix, RAMP } from './paint';

const { cream: CREAM, leaf: LEAF, wood: WOOD } = RAMP;
const EYE = 0x3a2433;

/** A scarf ramp, dark → light, from any colour. */
const scarfRamp = (c: number) => [mixc(c, INK, 0.38), c, mixc(c, 0xffffff, 0.28), mixc(c, 0xffffff, 0.55)];

/** The colours of the eight farmers, in slot order (the same as PLAYER_COLORS). */
const SCARVES = [PAL.berry, PAL.sea, PAL.gold, PAL.plum, PAL.lime, PAL.pumpkin, PAL.blossom, PAL.foam];

/** The ramp of a body tone, dark to light (tone 0 is the original cream). */
const toneRamp = (tone: number): readonly number[] => {
    if (tone === 0) return CREAM;
    const c = BODY_TONES[tone].color;
    return [mixc(c, 0x8a5a4a, 0.3), mixc(c, 0x8a5a4a, 0.1), c, mixc(c, 0xffffff, 0.55)];
};
/** The warmer belly the body shades into. */
const bellyOf = (tone: number, ramp: readonly number[]): readonly number[] => (tone === 0 ? [0xcf9fb8, 0xe2b8cc, 0xefcfdc, 0xf6dde6] : ramp.map((c) => mixc(c, 0xe28aa8, 0.3)));
const BLOSSOM = [0xd9709a, 0xf08cb4, 0xf79fc6, 0xffd0e4];
const MOUTH = 0x7a3a46;

function farmer (p: Pix, scarf: readonly number[], frame: number, look: Look = DEFAULT_LOOK) {
    const cx = 13;
    const body = toneRamp(look.b), belly = bellyOf(look.b, body);
    // feet: standing, or one lifted forward and then the other
    const lift = frame === 1 ? [0, 1.4] : frame === 2 ? [1.4, 0] : [0, 0];
    p.ellipse(cx - 4.5, 25.4 - lift[0], 3.2, 1.9, WOOD, { bias: 0.2 });
    p.ellipse(cx + 4.5, 25.4 - lift[1], 3.2, 1.9, WOOD, { bias: 0.2 });
    // the round body, with a warmer belly
    p.ellipse(cx, 16, 9.2, 9.6, body, { bias: 0.25 });
    for (let y = 20; y < 26; y++) for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y), k = body.indexOf(c);
        if (k >= 0) p.set(x, y, belly[k]);
    }
    // little hands
    p.ellipse(cx - 9.6, 18, 1.9, 2.6, body); p.ellipse(cx + 9.6, 17, 2, 2.6, body);
    // face: eyes
    for (const ex of [cx - 4, cx + 2]) {
        if (look.e === 1) { p.rect(ex, 13, 2, 1, EYE); p.set(ex - 1, 14, EYE); p.set(ex + 2, 14, EYE); }
        else if (look.e === 2) { p.rect(ex, 12, 2, 4, EYE); p.set(ex, 12, 0xffffff); p.set(ex + 1, 13, 0xffffff); p.set(ex, 15, 0x8a6a9a); }
        else if (look.e === 3) { p.rect(ex - 1, 14, 4, 1, EYE); p.set(ex - 1, 15, EYE); }
        else { p.rect(ex, 13, 2, 3, EYE); p.set(ex, 13, 0xffffff); }
    }
    p.rect(cx - 7, 17, 3, 2, 0xf59aa8); p.rect(cx + 4, 17, 3, 2, 0xf59aa8);
    // mouth
    if (look.m === 1) { p.rect(cx - 2, 18, 5, 1, MOUTH); p.rect(cx - 1, 19, 3, 1, MOUTH); p.set(cx, 19, 0xe8737a); }
    else if (look.m === 2) { p.set(cx - 2, 19, MOUTH); p.set(cx - 1, 18, MOUTH); p.set(cx, 19, MOUTH); p.set(cx + 1, 18, MOUTH); p.set(cx + 2, 19, MOUTH); }
    else if (look.m === 3) { p.rect(cx - 1, 18, 2, 2, MOUTH); p.set(cx, 19, 0xb86a78); }
    else { p.set(cx - 1, 18, MOUTH); p.set(cx, 19, MOUTH); p.set(cx + 1, 18, MOUTH); }
    // the scarf, with a knot and a tail
    for (let x = cx - 8; x <= cx + 8; x++) for (let y = 21; y <= 22; y++) p.set(x, y, y === 21 ? (x < cx - 1 ? scarf[2] : scarf[1]) : scarf[0]);
    p.rect(cx + 4, 23, 3, 3, scarf[1]); p.rect(cx + 6, 23, 1, 3, scarf[0]); p.set(cx + 4, 25, scarf[0]);
    // what grows on its head
    if (look.l === 1) {            // a blossom
        p.rect(cx - 1, 6, 2, 4, LEAF[1]); p.set(cx - 1, 6, LEAF[2]);
        p.ellipseRot(cx + 3.4, 8, 2.8, 1.2, 0.5, LEAF, { bias: 0.1 });
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; p.ellipse(cx + Math.cos(a) * 2.7, 3.6 + Math.sin(a) * 2.5, 1.9, 1.9, BLOSSOM, { bias: 0.1 }); }
        p.ellipse(cx, 3.6, 1.7, 1.7, RAMP.gold, { bias: 0.1 });
    } else if (look.l === 2) {     // one big curling leaf
        p.rect(cx - 1, 6, 2, 4, LEAF[1]); p.set(cx - 1, 6, LEAF[2]);
        p.ellipseRot(cx + 3.6, 3.4, 5.4, 2.5, 0.38, LEAF, { bias: 0.1 });
        p.ellipse(cx - 3.4, 5.4, 2.4, 1.7, LEAF, { bias: 0.1 });
        p.set(cx - 6, 3, LEAF[1]); p.set(cx - 6, 4, LEAF[1]); p.set(cx - 5, 2, LEAF[2]);
    } else if (look.l === 3) {     // a tuft of grass
        p.rect(cx - 1, 6, 2, 3, LEAF[1]);
        p.blade(cx, 8, cx - 3, 4, cx - 6.5, 0.8, 1.5, LEAF); p.blade(cx, 8, cx - 1.5, 3, cx - 2.5, 0.4, 1.4, LEAF);
        p.blade(cx, 8, cx + 1.5, 3, cx + 2, 0.5, 1.4, LEAF); p.blade(cx, 8, cx + 3.5, 4, cx + 6.5, 1.4, 1.5, LEAF);
    } else if (look.l === 4) {     // a bare twig with berries
        p.rect(cx - 1, 6, 2, 4, WOOD[2]); p.set(cx - 1, 6, WOOD[3]);
        p.line(cx, 7, cx - 5, 2, WOOD[3]); p.line(cx + 1, 7, cx - 4, 2, WOOD[2]);
        p.line(cx, 6, cx + 4, 1, WOOD[3]); p.line(cx + 1, 6, cx + 5, 1, WOOD[2]);
        p.ellipse(cx - 5, 2, 1.5, 1.5, RAMP.red, { bias: 0.1 }); p.ellipse(cx + 5, 1.6, 1.4, 1.4, RAMP.red, { bias: 0.1 });
    } else {                       // the sprout: a stem and three leaves
        p.rect(cx - 1, 6, 2, 4, LEAF[1]); p.set(cx - 1, 6, LEAF[2]);
        p.ellipseRot(cx - 4, 4.6, 4.2, 1.9, -0.55, LEAF, { bias: 0.1 }); p.ellipseRot(cx + 3.6, 3.6, 4.2, 1.9, 0.5, LEAF, { bias: 0.1 }); p.ellipseRot(cx, 2.4, 1.6, 2.2, 0, LEAF, { bias: 0.1 });
    }
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

/**
 * The texture key of a farmer with this look and scarf, painting it the first time it is asked for (there are hundreds of
 * combinations and only the few a game actually shows are ever made).
 */
export function ensureFarmer (scene: Phaser.Scene, look: Look | undefined, color: number): string {
    const key = farmerKey(look, color);
    if (!scene.textures.exists(key)) {
        const l = look ?? DEFAULT_LOOK, ramp = scarfRamp(SCARVES[color % SCARVES.length]);
        paintFrames(scene, key, 13, 14, 3, (p, _r, f) => farmer(p, ramp, f, l), 1);
    }
    return key;
}

export function registerStorybookChars (scene: Phaser.Scene) {
    paintFrames(scene, 'sprout', 13, 14, 3, (p, _r, f) => farmer(p, scarfRamp(PAL.berry), f), 1);       // (the title screen's farmer; every other farmer is painted by ensureFarmer)
}
