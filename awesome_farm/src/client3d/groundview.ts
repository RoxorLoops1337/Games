// How the 3D ground lies on the screen, read off a camera: the numbers the overlay camera (client/world/overlay3d.ts) copies so
// the 2D world overlays sit on the 3D ground. An orthographic camera that looks down at the ground without turning about the
// vertical (no yaw) maps the ground plane to the screen by an affine map with no shear: across is x only, down is z only. That
// is what lets a plain Phaser camera (a zoom across, another down, and a centre) reproduce it exactly.

import { type Camera, Vector3 } from 'three';
import { TILE, VIEW_H, VIEW_W } from '../shared/config';
import type { GroundView } from '../client/world/view3d-bridge';

const _a = new Vector3();
const _b = new Vector3();

/** A world point (tiles) to HUD units through a camera. */
function hud (cam: Camera, x: number, y: number, z: number, out: Vector3) {
    out.set(x, y, z).project(cam);
    out.set((out.x * 0.5 + 0.5) * VIEW_W, (-out.y * 0.5 + 0.5) * VIEW_H, 0);
    return out;
}

/**
 * The ground under the middle of the screen (`at`, tiles: what the camera looks at) and how a step of a tile east, south and up
 * moves on screen, measured through the camera itself (so a change of elevation or zoom is followed without a second formula).
 */
export function groundViewOf (cam: Camera, at: { x: number; z: number }, out: GroundView): GroundView {
    cam.updateMatrixWorld();
    const o = hud(cam, at.x, 0, at.z, _a);
    out.cx = at.x * TILE;
    out.cy = at.z * TILE;
    out.sx = (hud(cam, at.x + 1, 0, at.z, _b).x - o.x) / TILE;
    out.sy = (hud(cam, at.x, 0, at.z + 1, _b).y - o.y) / TILE;
    out.up = o.y - hud(cam, at.x, 1, at.z, _b).y;
    return out;
}

/** Where a ground point (sim pixels) `lift` tiles up lands on the HUD by a GroundView: what the overlay camera draws. */
export function groundToHud (gv: GroundView, x: number, y: number, lift = 0) {
    return { x: (x - gv.cx) * gv.sx + VIEW_W / 2, y: (y - gv.cy) * gv.sy + VIEW_H / 2 - lift * gv.up };
}
