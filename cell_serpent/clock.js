// Fixed-step clock for the run loop. The sim always advances in exact 1/60 s steps; slow motion only changes how fast
// real time is fed in (dt * scale), so the sim time can never drift away from the integral of the time scale.
export const STEP = 1 / 60;
export function createClock(maxBacklog = 0.25) {
  let acc = 0;
  return {
    feed(dt, scale = 1) { acc = Math.min(acc + dt * scale, maxBacklog); },   // the cap stops a long stall from fast-forwarding the sim
    take() { if (acc >= STEP) { acc -= STEP; return true; } return false; },
    drop() { acc = 0; },                                                      // sim paused (cards, game over): do not bank time
    get acc() { return acc; },
  };
}
