// The open sea: deep water is not tiled at all. The map leaves those cells empty and two slowly drifting
// layers of painted waves show through, over the camera's sea-blue background, so the ocean moves.

import * as Phaser from 'phaser';
import { TILE, WORLD_TILES } from '../../shared/config';
import { SS } from '../res';

export class Sea {
    private near: Phaser.GameObjects.TileSprite;
    private far: Phaser.GameObjects.TileSprite;

    constructor (scene: Phaser.Scene) {
        const size = WORLD_TILES * TILE;
        this.far = scene.add.tileSprite(0, 0, size, size, 'sea_far').setOrigin(0).setDepth(-11).setAlpha(0.8).setTileScale(1 / SS);
        this.near = scene.add.tileSprite(0, 0, size, size, 'sea_near').setOrigin(0).setDepth(-10.9).setTileScale(1 / SS);
    }

    setVisible (on: boolean) {
        this.far.setVisible(on);
        this.near.setVisible(on);
    }

    destroy () {
        this.far.destroy();
        this.near.destroy();
    }

    update (seconds: number) {
        // in texture pixels: the far layer drifts one way, the near one the other and a little faster
        this.far.tilePositionX = seconds * 2.2 * SS;
        this.far.tilePositionY = seconds * 0.9 * SS;
        this.near.tilePositionX = -seconds * 3.4 * SS;
        this.near.tilePositionY = seconds * 1.3 * SS;
    }
}
