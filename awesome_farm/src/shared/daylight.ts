// The day clock as light: shared by the sim (solar power), the client (lighting) and the UI.

import { TUNING } from './config';

/** 0 = full day, 1 = full night (eases in at dusk and out at dawn). */
export function nightAmount (clock: number, nightLen: number) {
    const day = TUNING.dayLength, len = day + nightLen, f = TUNING.duskFade;
    if (clock < day - f) return 0;
    if (clock < day) return (clock - (day - f)) / f;
    if (clock > len - f) return Math.max(0, (len - clock) / f);
    return 1;
}

/** 1 = full sun, 0 = dark: what a solar panel sees. */
export const sunlight = (clock: number, nightLen: number) => 1 - nightAmount(clock, nightLen);
