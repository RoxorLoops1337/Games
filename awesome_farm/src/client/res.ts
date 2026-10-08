// Render density. The game is laid out in a logical 960x540 space (HUD) with the world seen at ZOOM;
// the canvas itself is SS times denser so art and text can be drawn with finer detail than one pixel
// per logical unit. Everything outside this file keeps thinking in logical units.

import * as Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../shared/config';

export const SS = 2;

/** Make a scene's main camera show logical (0,0)..(VIEW_W,VIEW_H), at SS device pixels per unit. */
export function hudCamera (cam: Phaser.Cameras.Scene2D.Camera) {
    // zoom happens around the middle of the canvas; scroll so logical (0,0) lands in the top-left corner
    return cam.setZoom(SS).setScroll(-VIEW_W * (SS - 1) / 2, -VIEW_H * (SS - 1) / 2);
}

/** A pointer position in logical HUD units (Phaser reports canvas pixels). */
export function logical (p: { x: number; y: number }) {
    return { x: p.x / SS, y: p.y / SS };
}

/**
 * Register a canvas painted at SS-times density so it occupies 1/SS of its pixel size in the world:
 * a 64x76 canvas is a 32x38-unit sprite with twice the detail. `frames` are cut from the canvas in pixels.
 */
/** The part of a Frame's private record an Image takes its logical size from (a getter over `data.sourceSize`). */
interface DenseFrame { data: { sourceSize: { w: number; h: number } } }

export function addDense (scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frames: { name: string | number; x: number; y: number; w: number; h: number }[] = []) {
    const tex = scene.textures.addCanvas(key, canvas)!;
    tex.source[0].resolution = SS;
    for (const f of frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    for (const name of tex.getFrameNames(true)) {
        const fr = tex.get(name);
        const size = (fr as unknown as DenseFrame).data.sourceSize;
        size.w = fr.cutWidth / SS;
        size.h = fr.cutHeight / SS;
    }
    return tex;
}
