// Batch 12 (agent f): the aim controller of the ring (circle) stages. Pure maths, no DOM, safe to import headless.
// Two ways to aim with one finger, chosen when the finger lands:
//   - AT THE ARENA (a touch within about a circle radius of the duo): the duo aims straight at the finger.
//   - ANYWHERE ELSE (thumb zone at the bottom, HUD side, corners): a floating stick. The first touch point is the anchor,
//     dragging sets the aim to the drag direction, the anchor trails behind a long drag so reversing is instant.
// A small dead zone stops jitter (it never freezes the aim while the finger moves), the sim gets an eased angle,
// and the optional Aim assist nudges a near miss onto the nearest cell edge (never past a few degrees).
export const TAU = Math.PI * 2;
export const UP = -Math.PI / 2;
export const DEAD_ABS = 20;      // game units around the duo where an absolute finger is ignored (the finger is on the duo)
export const DEAD_STICK = 22;    // game units a stick drag must travel before it steers
export const STICK_MAX = 120;    // game units the anchor lets the finger stray before it follows
export const ARENA_PAD = 110;    // a touch this far outside the circle still counts as aiming at it
export const ASSIST_CONE = 0.17; // radians (about 10 degrees) a near miss can be pulled in
export const wrap = a => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
export const angDiff = (a, b) => wrap(a - b);

export function newAim() { return { now: UP, tgt: UP, mode: 0, ax: 0, ay: 0, off: 0, id: -1 }; }   // mode 0 idle, 1 arena (absolute), 2 stick
export function aimReset(A) { A.now = A.tgt = UP; A.mode = 0; A.off = 0; A.id = -1; }

// finger lands at (gx, gy) in game units; the duo is at (px, py), the circle radius is rr
export function aimDown(A, gx, gy, px, py, rr, id = -1) {
  const d = Math.hypot(gx - px, gy - py);
  A.id = id;
  if (d <= rr + ARENA_PAD) { A.mode = 1; aimMove(A, gx, gy, px, py); }
  else { A.mode = 2; A.ax = gx; A.ay = gy; }   // keeps the old aim until the thumb has moved
  return A.mode;
}
export function aimMove(A, gx, gy, px, py) {
  if (A.mode === 1) { const dx = gx - px, dy = gy - py; if (dx * dx + dy * dy > DEAD_ABS * DEAD_ABS) A.tgt = Math.atan2(dy, dx); }
  else if (A.mode === 2) {
    let dx = gx - A.ax, dy = gy - A.ay; const d = Math.hypot(dx, dy);
    if (d > STICK_MAX) { A.ax = gx - dx / d * STICK_MAX; A.ay = gy - dy / d * STICK_MAX; dx = gx - A.ax; dy = gy - A.ay; }
    if (d > DEAD_STICK) A.tgt = Math.atan2(dy, dx);
  }
}
export function aimUp(A) { A.mode = 0; A.id = -1; }   // lifting the finger leaves the duo aiming where it was

// one fixed step (dt in seconds): eased towards the target, frame rate independent
export function aimTick(A, dt) {
  const da = angDiff(A.tgt, A.now), k = 1 - Math.exp(-dt * 24);
  A.now = Math.abs(da) < 0.0015 ? A.tgt : wrap(A.now + da * k);
  return A.now;
}

// Aim assist: when a cell is within the cone but the aim would miss it, bias the angle to just inside its edge.
// Returns the offset (radians) to add to the aim. g.snakes[].segs[] with x, y, r, hp. Cheap: one pass over the live cells.
export function assistOffset(g, a) {
  const p = g.p; let best = 0, bestScore = 1e9;
  for (const sn of g.snakes) for (const c of sn.segs) {
    if (!(c.hp > 0) || c.x < 0 || c.x > 720 || c.y < 0) continue;
    const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy); if (d < 30) continue;
    const half = Math.asin(Math.min(0.99, (c.r || 20) / d)), diff = angDiff(Math.atan2(dy, dx), a), miss = Math.abs(diff) - half * 0.7;
    if (miss <= 0 || miss > ASSIST_CONE) continue;   // already on it, or too far to be a miss
    const score = miss + d * 0.0002; if (score < bestScore) { bestScore = score; best = diff - Math.sign(diff) * half * 0.7; }
  }
  return best;
}
// smooth the offset so it never snaps between cells; returns the assisted angle
export function aimAssisted(A, g, dt, on) {
  const want = on ? assistOffset(g, A.now) : 0;
  A.off += (want - A.off) * (1 - Math.exp(-dt * 9));
  if (Math.abs(A.off) < 1e-4) A.off = 0;
  return wrap(A.now + A.off);
}
