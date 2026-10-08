// Frames that rarely change are drawn once into a texture, then shown as a single image.
// A Graphics object replays every one of its draw commands every frame; a storybook panel is dozens of them,
// and the HUD has plenty. Baking keeps the look and costs one quad.

import * as Phaser from 'phaser';
import { SS } from '../res';

export class Baked {
    /** Draw here in logical coordinates (the same ones the HUD uses), then call freeze(). */
    readonly g: Phaser.GameObjects.Graphics;
    private rt: Phaser.GameObjects.RenderTexture;

    constructor (scene: Phaser.Scene, depth: number, x: number, y: number, w: number, h: number) {
        this.g = scene.add.graphics().setDepth(depth);
        this.rt = scene.add.renderTexture(x, y, Math.ceil(w * SS), Math.ceil(h * SS)).setOrigin(0).setScale(1 / SS).setDepth(depth).setVisible(false);
        // the texture's own camera: SS device pixels per unit, with logical (x, y) in its top-left corner
        this.rt.camera.setOrigin(0, 0).setZoom(SS).setScroll(x, y);
        this.rt.camera.roundPixels = false;
    }

    /** Start drawing again (forget the baked picture). */
    thaw () {
        this.g.clear().setVisible(true);
        this.rt.setVisible(false);
    }

    /** Render what has been drawn into the texture and stop replaying the commands. */
    freeze () {
        this.rt.clear();
        this.rt.draw(this.g);
        this.rt.render();   // Phaser 4 queues texture commands until told to run them
        this.g.clear().setVisible(false);
        this.rt.setVisible(true);
    }

    setVisible (on: boolean) {
        this.rt.setVisible(on);
        return this;
    }

    destroy () {
        this.g.destroy();
        this.rt.destroy();
    }
}
