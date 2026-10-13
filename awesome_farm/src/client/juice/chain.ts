// Harvest chain chimes: pickups and harvests that follow one another within a beat and a bit climb a pentatonic ladder (the notes
// cannot clash), then step back down to the root once you stop. Pure: Fx asks it for the pitch of each one.

/** Pitch ratios of the ladder: root, 2nd, 3rd, 5th, 6th, octave, and on up. */
export const LADDER = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2] as const;
/** How long (ms) after one pickup the next still counts as part of the chain. */
export const CHAIN_GAP = 1300;

export class Chain {
    private n = 0;
    private last = -1e9;
    /** The pitch for a pickup at this time (ms). */
    next (now: number): number {
        this.n = now - this.last > CHAIN_GAP ? 0 : Math.min(this.n + 1, LADDER.length - 1);
        this.last = now;
        return LADDER[this.n];
    }
    /** How far up the ladder the chain is (0: the root). */
    get step () { return this.n; }
}
