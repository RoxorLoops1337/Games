// Geometry the sim and the client share: distances, and where a farmer's body is relative to the sprite's origin.
// A farmer (and a creature) stands on its origin: x, y is the bottom middle of the sprite, a couple of pixels under the
// feet, so everything that measures to a farmer takes a little off y. Pure functions: no world, no Phaser.

import { TILE } from './config';
import { BUILDINGS } from './data/buildings';
import type { BuildE } from './sim/types';

/** Distance between two points. */
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Distance from a point to the nearest edge of a rectangle (px; 0 inside it). */
export function distToRect (x: number, y: number, rx: number, ry: number, w: number, h: number) {
    return Math.hypot(Math.max(rx - x, 0, x - (rx + w)), Math.max(ry - y, 0, y - (ry + h)));
}

/** Distance from a point to the nearest edge of a building's footprint. */
export function distToBuilding (x: number, y: number, b: BuildE) {
    const [w, h] = BUILDINGS[b.kind].size;
    return distToRect(x, y, b.tx * TILE, b.ty * TILE, w * TILE, h * TILE);
}

/** The feet are this far above the origin: the tile a farmer stands on is read here. */
const FEET_Y = 2;
/** The body is this far above the origin: buildings, drops, blasts and creature reach measure to it. */
export const BODY_Y = 4;
/** The hands are this far above the origin: a swing starts here, and a point target (a node, a monster) is measured from it. */
const HIT_Y = 5;

/** The tile a farmer (or any sprite standing on its origin) stands on. */
export const feetTile = (p: { x: number; y: number }) => ({ tx: Math.floor(p.x / TILE), ty: Math.floor((p.y - FEET_Y) / TILE) });
/** Where a farmer's hands are: where a swing is measured from. */
export const hitPoint = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - HIT_Y });
