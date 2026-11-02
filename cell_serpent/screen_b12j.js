// Screen moments round 12: pure helpers for tap-to-skip on long cards, the ring stage intro flourish
// (the circle closes in on the duo) and the near-miss gap bar. No canvas, no sim writes.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A tap skips a card only after its main beat has landed, so a mashing thumb never eats the stars or the boss slam.
export const SKIP_AFTER = { card: 0.5, boss: 1.0, clear: 1.85, fin: 2.4 };
export const skipReady = (kind, t) => t >= (SKIP_AFTER[kind] == null ? 0.5 : SKIP_AFTER[kind]);
export const FADE_OUT = 0.35;   // seconds a skipped card needs to fade

// The ring flourish: a bright circle starts wide and closes in on the real circle, then pulses once.
export const RING_IN = 0.9, RING_TAIL = 0.3;
export const ringProgress = t => clamp(t / RING_IN, 0, 1);
export const ringEase = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
// radius of the closing circle for the real circle radius r at time t (r at the end)
export const ringRadius = (r, t) => r * (1 + 3.4 * (1 - ringEase(ringProgress(t))));
// opacity: fades in fast, holds, then fades out over the tail
export const ringAlpha = t => clamp(t / 0.15, 0, 1) * (t <= RING_IN ? 1 : clamp(1 - (t - RING_IN) / RING_TAIL, 0, 1));

// Near miss: how much of the bar is filled (0..1) from the closest percent the face got.
export const gapFill = (closePct, t) => clamp(closePct / 100, 0, 1) * (1 - Math.pow(1 - clamp(t / 0.5, 0, 1), 3));
