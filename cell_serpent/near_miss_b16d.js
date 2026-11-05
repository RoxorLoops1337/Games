// b16d: NEAR-MISS. Watches how close the snake face comes to the line during a run (path distance, no sim writes).
// When the face gets right up to the line and is then pushed back, the run gets a CLOSE CALL moment (slow motion, text, sound).
// Pure and tiny: one number compare per snake per frame, no allocations.
export const ARM_PX = 95;        // the face is this close to the line (path distance): armed
export const RELEASE_PX = 100;   // pushed back by this much beyond the closest point: the call fires
export const MIN_PX = 1;         // a breach (0) is a loss, not a call
export const COOLDOWN = 7;       // seconds of game time between two calls

const S = { armed: false, low: 1e9, last: -99, calls: 0, best: 1e9, x: 0, y: 0 };
export function nmReset() { S.armed = false; S.low = 1e9; S.last = -99; S.calls = 0; S.best = 1e9; S.x = 0; S.y = 0; }
export const nmState = () => S;

// gap of the lowest living face to the end of its path
export function faceGap(g) {
  let gap = 1e9, x = 0, y = 0;
  for (const sn of g.snakes) {
    const s = sn.segs && sn.segs[0]; if (!s || !(s.hp > 0)) continue;
    const len = (sn.path || g.path).len, d = len - s.ps;
    if (d < gap) { gap = d; x = s.x; y = s.y; }
  }
  S.x = x; S.y = y;
  return gap;
}

// call once per frame after the sim steps. Returns the gap (px) when a close call fires, else 0.
export function nmWatch(g) {
  if (!g || g.phase !== 'play' || g.mode) return 0;
  const gap = faceGap(g);
  if (gap >= 1e8) return 0;
  if (gap < S.best) S.best = gap;
  if (gap < MIN_PX) { S.armed = false; S.low = 1e9; return 0; }
  if (gap < ARM_PX) { if (!S.armed || gap < S.low) S.low = gap; S.armed = true; return 0; }
  if (S.armed && gap > S.low + RELEASE_PX) {
    const low = S.low; S.armed = false; S.low = 1e9;
    if (g.t - S.last < COOLDOWN) return 0;
    S.last = g.t; S.calls++;
    return Math.max(1, Math.round(low));
  }
  return 0;
}
export const closeCalls = () => S.calls;

// result copy: the exact share of the snake that was popped
export function soClose(pct) {
  const p = Math.max(0, Math.min(99, Math.floor(pct))), left = 100 - p;
  if (p >= 90) return { title: 'SO CLOSE!', sub: `${p}% popped. Just ${left}% left, one tap and you are back in.` };
  if (p >= 80) return { title: 'SO CLOSE!', sub: `${p}% popped. Only ${left}% left. One more go!` };
  if (p >= 55) return { title: 'ALMOST!', sub: `${p}% popped, ${left}% to go.` };
  return null;
}
