// What the world view keeps for each entity it draws: the sprite and whatever rides on it (a shadow, a crop, blades, belt
// items, a status mark, a hearth ring's fill…). Game.ts makes and destroys them; the world/* modules read their slices.

import type * as Phaser from 'phaser';
import type { Ent } from '../../shared/sim/types';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

export interface EntView {
    ent: Ent;
    sprite: Img | Spr;
    shadow?: Img;
    crop?: Img;
    blades?: Img;
    x: number;             // rendered position (mobs/drops interpolate toward ent.x/y)
    y: number;
    claimed?: boolean;     // a drop that is flying to whoever picked it up
    glow?: Img;
    items?: Img[];         // belt: sprites for the three slots
    hand?: Img;            // inserter: what it is holding
    pwIcon?: Img;          // blinking "no power" bolt
    swing?: number;        // inserter arm position 0..1 (smoothed)
    mark?: Img;            // monster: icon above its head (danger, stun, elite)
    born?: number;         // monster: when it appeared (pop-in)
    pod?: Img;             // creature: the pod shaking on it
    podWait?: number;
    lunge?: { t: number; dur: number; dx: number; dy: number };
    hop?: { t: number; dur: number };      // creature: a hop for joy
    hgShown?: number;      // a fire at dusk: how full its hearth ring is drawn (it glides to the world's value)
    tag?: Img[];           // a sorted chest: the plate and icon it wears
    wicon?: Img;
    bub?: Img;
    bubIcon?: Img;
    cargo?: Img;
    wiconT?: number;
    stars?: Img[];
    link?: Phaser.GameObjects.Graphics;    // tunnel entrance: the dotted line to its exit
    linkKey?: string;
    frame?: number;        // the frame the sprite was last given (so it is set only when it changes)
    sky?: Img;             // weather vane: a little picture of tomorrow's weather over it
    vday?: number;         // … and the day it was drawn for
    vang?: number;         // … the heading the arrow has swung to (radians)
    dishes?: Img[];        // potluck table: the little icons of the dishes on it
    dishKey?: string;
}

/** Destroy everything a view owns; with `keepSprite` the sprite itself is left for a parting animation. */
export function destroyView (v: EntView, keepSprite = false) {
    if (!keepSprite) v.sprite.destroy();
    v.shadow?.destroy(); v.crop?.destroy(); v.blades?.destroy(); v.sky?.destroy(); v.glow?.destroy(); v.mark?.destroy(); v.pod?.destroy(); v.wicon?.destroy(); v.bub?.destroy(); v.bubIcon?.destroy(); v.cargo?.destroy(); v.stars?.forEach((i) => i.destroy()); v.link?.destroy();
    v.tag?.forEach((i) => i.destroy());
    for (const i of v.items ?? []) i?.destroy();
    v.hand?.destroy(); v.pwIcon?.destroy();
    v.dishes?.forEach((i) => i.destroy());
}
