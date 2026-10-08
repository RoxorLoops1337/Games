// How the developer menu is opened: nothing in the game's menus or guide mentions it.
//   - tap the farmer's portrait (top left) 7 times within 4 seconds, or
//   - press Ctrl + Shift + D.
// Already unlocked: it opens the Developer screen. Solo: it unlocks at once (the world is nobody else's). Online: it asks for the
// server's developer key (window.prompt, which phones handle well), sends it, and opens the screen when the server says yes
// (the farmer's own record then carries `dev`). The key is only ever typed here: it is not stored or logged by the client.

import type * as Phaser from 'phaser';
import { logical } from '../res';
import type { GameScene } from '../scenes/Game';
import { onPortrait, TapCounter } from './devgesture';

const WAIT_MS = 5000;

/** What this needs from the HUD scene (HudScene has both). */
interface HudLike extends Phaser.Scene {
    openScreen (name: string): void;
    closeScreen (): void;
}

export class DevUnlock {
    private taps = new TapCounter();
    private asking = false;

    /** `screen` says which window is open right now ('' for none). */
    constructor (private hud: HudLike, private screen: () => string) {
        hud.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p));
        hud.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
            if (!ev.ctrlKey || !ev.shiftKey || ev.altKey || ev.metaKey || ev.code !== 'KeyD') return;
            ev.preventDefault();
            this.use();
        });
    }

    private get farm () { return this.hud.scene.get('Game') as GameScene; }

    private tap (p: Phaser.Input.Pointer) {
        if (!this.farm.ready || this.screen()) { this.taps.reset(); return; }
        const q = logical(p);
        if (onPortrait(q.x, q.y) && this.taps.hit(performance.now())) this.use();
    }

    /** The gesture was made: open the screen (closing it again if it is open), unlocking first if need be. */
    private use () {
        const f = this.farm;
        if (!f.ready || !f.meS || this.asking) return;
        if (this.screen() === 'dev') { this.hud.closeScreen(); return; }
        if (f.meS.dev) { this.hud.openScreen('dev'); return; }
        let key = '';
        if (f.conn.mode === 'online') {
            const typed = window.prompt('Developer key');
            if (typed === null) return;
            key = typed;
        }
        f.send({ t: 'dev', key });
        // the server answers with the flag in this farmer's own record; give it a few seconds
        this.asking = true;
        const until = performance.now() + WAIT_MS;
        const timer = this.hud.time.addEvent({
            delay: 100, loop: true, callback: () => {
                if (this.farm.meS?.dev) { timer.remove(false); this.asking = false; this.hud.openScreen('dev'); }
                else if (performance.now() > until || !this.farm.ready) { timer.remove(false); this.asking = false; }
            },
        });
    }
}
