// Haptics: short vibration patterns for the moments that matter, on phones that can vibrate (the Shake setting turns it off too). Only your own
// actions buzz (the same rule as screen shake), and the busiest ones stay tiny. Patterns are in milliseconds (buzz, gap, buzz…).

import type { Action } from '../../shared/actions';
import { settings } from '../settings';

/** What each action feels like; anything not listed is silent in the hand. */
export const BUZZ: Partial<Record<Action, number | number[]>> = {
    pickup: 6, harvestCrop: 10, breakTree: 14, breakRock: 14, breakOre: 18, breakCrystal: 18, build: 16, craft: 12, sell: [10, 40, 10],
    levelUp: [20, 50, 20, 50, 40], perk: [14, 40, 14], unlock: [14, 40, 14], hurt: 40, downed: [80, 60, 80, 60, 140], revive: [30, 60, 30],
    crateOpen: [10, 30, 16, 30, 24, 30, 40], lucky: [20, 40, 20], golden: [20, 40, 40], jackpot: [30, 40, 30, 40, 30, 40, 80], rare: [16, 40, 30],
    catchOk: [20, 50, 20], fishCatch: [14, 30, 24], bossDie: [60, 50, 40, 50, 120], pat: [10, 50, 10], gift: [14, 40, 14, 40, 30],
    perfect: [12, 30, 40], dash: 8, hatch: [20, 40, 20, 40, 40],
};

const can = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Buzz for this action, if the player wants it and the device can. */
export function buzz (action: Action) {
    if (!settings.shake || !can()) return;
    const p = BUZZ[action];
    if (p === undefined) return;
    try { navigator.vibrate(p); } catch { /* some browsers refuse without a tap first */ }
}
