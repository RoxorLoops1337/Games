// The Perfect dash's beat: a stretch of slow motion on the screen of the farmer who pulled it off, a white ring and a
// little camera push. A view effect only: the simulation never slows, and a friend's Perfect dash never slows yours.

import * as Phaser from 'phaser';
import { TUNING } from '../../shared/config';
import { PAL } from '../../shared/palette';
import { settings } from '../settings';

export class SlowMo {
    /** Real seconds of slow motion left. */
    private t = 0;
    private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

    constructor (private scene: Phaser.Scene) {}

    /** How fast the world runs now: a stretch of crawl, then back up to full speed. */
    private scale () {
        if (this.t <= 0) return 1;
        const u = 1 - this.t / TUNING.perfectSlowMo;            // 0 → 1 over the beat
        return u < 0.45 ? 0.2 : 0.2 + 0.8 * Math.pow((u - 0.45) / 0.55, 2);
    }

    /** Called once a frame with the real dt: runs the beat's clock and hands the pace to everything that has a clock of its own (tweens, particles). Returns the world's time scale. */
    step (dt: number) {
        if (this.t <= 0) return 1;
        this.t = Math.max(0, this.t - dt);
        const k = this.scale();
        this.scene.tweens.timeScale = k;
        for (const em of this.emitters) if (em.active) em.timeScale = k;
        if (this.t <= 0) this.end();
        return k;
    }

    begin () {
        this.t = TUNING.perfectSlowMo;
        this.emitters = this.scene.children.list.filter((o): o is Phaser.GameObjects.Particles.ParticleEmitter => o instanceof Phaser.GameObjects.Particles.ParticleEmitter);
    }

    end () {
        this.t = 0;
        this.scene.tweens.timeScale = 1;
        for (const em of this.emitters) if (em.active) em.timeScale = 1;
        this.emitters = [];
    }

    /** How far the camera leans in during the beat (a small push, off when the player has turned screen shake off). */
    punch () {
        if (this.t <= 0 || !settings.shake) return 0;
        return 0.04 * Math.sin(Math.PI * (1 - this.t / TUNING.perfectSlowMo));
    }

    /** A white ring that opens around a farmer and fades (everyone in view sees it). */
    ringFlash (x: number, y: number) {
        const s = this.scene;
        for (const [delay, from, to] of [[0, 0.5, 3.6], [90, 0.4, 2.6]] as const) {
            const ring = s.add.circle(x, y, 5).setStrokeStyle(2, PAL.snow, 1).setDepth(9.5e4).setScale(from).setAlpha(0);
            s.tweens.add({
                targets: ring, scale: to, duration: 460, delay, ease: 'Quad.easeOut',
                onStart: () => ring.setAlpha(1),
                onUpdate: (t) => ring.setAlpha(1 - t.progress),
                onComplete: () => ring.destroy(),
            });
        }
        // and a bright glow that blooms and fades under it
        const glow = s.add.image(x, y, 'light', 0).setTint(PAL.snow).setAlpha(0.85).setScale(0.3).setDepth(9.49e4).setBlendMode(Phaser.BlendModes.ADD);
        s.tweens.add({ targets: glow, scale: 0.9, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
    }
}
