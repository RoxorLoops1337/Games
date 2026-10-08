import * as Phaser from 'phaser';
import { ART_GROUPS } from '../art/sprites';
import { initMusic } from '../juice/music';
import { initSfx } from '../juice/sfx';
import { hudCamera, SS } from '../res';

/** Waits for the pixel font, generates every texture from code (no asset files) and hooks up audio. */
export class BootScene extends Phaser.Scene {
    constructor () {
        super('Boot');
    }

    create () {
        hudCamera(this.cameras.main);
        const loading = this.add.text(480, 270, 'Loading…', { fontFamily: 'sans-serif', fontSize: '16px', color: '#d5d9e6', resolution: SS }).setOrigin(0.5);
        const fonts = [`400 16px "Pixelify Sans"`, `700 16px "Pixelify Sans"`, `16px "Jersey 15"`, `600 16px "Fredoka"`, `400 16px "Fredoka"`, `700 16px "Fredoka"`].map((f) => document.fonts.load(f).catch(() => undefined));
        const timeout = new Promise((r) => setTimeout(r, 2500));
        Promise.race([Promise.all(fonts), timeout]).then(() => this.paint(loading)).then(() => {
            loading.destroy();
            initSfx(this.game);
            initMusic(this.game);
            this.scene.start('Title');
        });
    }

    /** Paint the art a group at a time, letting the browser breathe (and the loading line change) between groups: one task of half a second is a frozen page on a phone. */
    private async paint (loading: Phaser.GameObjects.Text) {
        const t0 = performance.now();
        for (const [name, paint] of ART_GROUPS) {
            loading.setText(`Painting the ${name}…`);
            await new Promise((r) => setTimeout(r, 0));
            const t = performance.now();
            paint(this);
            performance.measure(`art:${name}`, { start: t });
        }
        performance.measure('art', { start: t0 });
    }
}
