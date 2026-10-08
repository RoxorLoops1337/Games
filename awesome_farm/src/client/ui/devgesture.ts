// The secret tap on the farmer's portrait, as plain numbers (no Phaser), so a test can run it: seven taps within four seconds.

/** The farmer's portrait, in HUD units (the picture sits at 36, 38 and is drawn three times its size). */
const PORTRAIT = { x: 6, y: 8, w: 64, h: 64 };
export const TAPS = 7;
export const WITHIN_MS = 4000;

export const onPortrait = (x: number, y: number) => x >= PORTRAIT.x && y >= PORTRAIT.y && x <= PORTRAIT.x + PORTRAIT.w && y <= PORTRAIT.y + PORTRAIT.h;

/** Counts taps: `hit(now)` is true on the seventh within the window (and starts over); `reset()` forgets them. */
export class TapCounter {
    private times: number[] = [];

    hit (now: number): boolean {
        this.times = this.times.filter((t) => now - t < WITHIN_MS);
        this.times.push(now);
        if (this.times.length < TAPS) return false;
        this.times = [];
        return true;
    }

    reset () { this.times = []; }
}
