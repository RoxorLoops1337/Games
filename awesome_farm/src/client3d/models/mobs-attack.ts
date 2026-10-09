// How a boss's whole body moves through each attack pattern (`PatternId` in shared/data/mobs.ts), on top of its own rig's wind-up
// and act poses. Timings follow the scripts in shared/sim/boss.ts (a leap lifts off at 0.75 s and lands at 1.15 s, a slam falls at
// 0.85 s, a charge runs from 0.9 to 1.75 s, ...), so the body says what the telegraph on the ground says.
import type { PatternId } from '../../shared/data/mobs';
import { smooth } from './kit';

/** An offset for the boss's body: lift (tiles), lean forward (+rx), turn (ry), roll (rz) and squash (sy; sx = sz follow). */
export interface AtkPose { y: number; rx: number; ry: number; rz: number; sy: number }

const bump = (u: number, at: number, w: number) => Math.exp(-(((u - at) / w) ** 2));
const land = (u: number, at: number) => (u < at ? 0 : Math.exp(-(u - at) * 9) * Math.sin(Math.min(Math.PI, (u - at) * 14)));

/** One function per pattern: `u` is seconds into the pattern, `o` is reset to rest before each call. */
export const PATTERN_POSES: Record<PatternId, (u: number, o: AtkPose) => void> = {
    leap (u, o) {
        const crouch = smooth(0, 0.7, u) * (1 - smooth(0.72, 0.8, u));
        const air = u > 0.75 && u < 1.15 ? Math.sin((u - 0.75) / 0.4 * Math.PI) : 0;
        o.y = air * 1.5;
        o.sy = 1 - 0.22 * crouch + 0.15 * air - 0.3 * land(u, 1.15);
        o.rx = -0.2 * air + 0.25 * crouch;
    },
    slam (u, o) {
        const up = smooth(0, 0.8, u) * (1 - smooth(0.82, 0.9, u));
        o.y = 0.4 * up;
        o.rx = -0.3 * up + 0.35 * bump(u, 0.92, 0.07);
        o.sy = 1 + 0.1 * up - 0.32 * land(u, 0.88);
    },
    sweep (u, o) {
        const back = smooth(0, 0.65, u) * (1 - smooth(0.68, 0.8, u));
        const through = smooth(0.68, 0.82, u) * (1 - smooth(0.9, 1.3, u));
        o.ry = -0.85 * back + 1.1 * through;
        o.rz = 0.12 * back - 0.12 * through;
    },
    charge (u, o) {
        const paw = smooth(0, 0.3, u) * (1 - smooth(0.85, 0.95, u)), run = smooth(0.88, 1.0, u) * (1 - smooth(1.7, 1.9, u));
        o.rx = -0.18 * paw + 0.32 * run;
        o.rz = Math.sin(u * 32) * 0.05 * paw;
        o.y = Math.abs(Math.sin(u * 18)) * 0.09 * run;
        o.sy = 1 - 0.08 * paw;
    },
    radial (u, o) {
        const swell = smooth(0, 0.58, u) * (1 - smooth(0.6, 0.66, u));
        o.sy = 1 + 0.16 * swell + Math.sin(u * 40) * 0.02 * swell + 0.22 * bump(u, 0.66, 0.06) - 0.12 * land(u, 0.72);
        o.y = 0.08 * swell;
    },
    aimed (u, o) {
        const k = bump(u, 0.37, 0.06) + bump(u, 0.82, 0.06) + bump(u, 1.27, 0.06);
        o.rx = -0.28 * k + 0.08 * smooth(0, 0.3, u) * (1 - smooth(1.4, 1.8, u));
        o.sy = 1 - 0.06 * k;
    },
    rain (u, o) {
        const rise = smooth(0, 0.9, u) * (1 - smooth(1.0, 1.15, u));
        o.y = 0.3 * rise;
        o.rx = -0.22 * rise;
        o.ry = Math.sin(u * 3) * 0.15 * rise;
        o.sy = 1 + 0.06 * rise - 0.25 * land(u, 1.05);
    },
    spiral (u, o) {
        const on = smooth(0.3, 0.5, u) * (1 - smooth(2.7, 3.0, u));
        o.ry = on * (u - 0.4) * 7;
        o.y = 0.12 * on + Math.sin(u * 9) * 0.03 * on;
    },
    summon (u, o) {
        const sink = smooth(0, 0.65, u) * (1 - smooth(0.68, 0.75, u));
        o.sy = 1 - 0.2 * sink + 0.3 * bump(u, 0.76, 0.06);
        o.rz = Math.sin(u * 36) * 0.04 * sink;
        o.y = 0.25 * bump(u, 0.8, 0.1);
    },
    freeze (u, o) {
        const wind = smooth(0, 0.9, u) * (1 - smooth(0.93, 1.0, u));
        o.rx = -0.25 * wind + 0.3 * bump(u, 1.0, 0.08);
        o.rz = Math.sin(u * 45) * 0.04 * wind;
        o.sy = 1 + 0.08 * wind;
    },
    hex (u, o) {
        const rise = smooth(0, 0.85, u) * (1 - smooth(0.88, 1.0, u));
        o.y = 0.2 * rise;
        o.rz = Math.sin(u * 5) * 0.12 * rise;
        o.rx = -0.15 * rise + 0.25 * bump(u, 0.95, 0.08);
    },
    chain (u, o) {
        const twist = smooth(0, 0.75, u) * (1 - smooth(0.78, 0.86, u));
        o.ry = -0.6 * twist + 0.7 * bump(u, 0.86, 0.08);
        o.sy = 1 - 0.25 * land(u, 0.82);
    },
};

/** Rest: no offset. */
export const restPose = (o: AtkPose) => { o.y = 0; o.rx = 0; o.ry = 0; o.rz = 0; o.sy = 1; return o; };
