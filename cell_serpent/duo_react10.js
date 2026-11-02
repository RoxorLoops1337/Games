// 02-duo-pets (round 10): how the duo and their pets react to what happens in a run.
// 1) run end: the duo sinks, dizzy stars orbit their heads and the pets stay slumped until the revive prompt or result arrives.
// 2) revive: the duo pops up in a hop and the pets cheer.
// 3) glance: the pets lean toward the nearest snake head (more the closer it is).
// 4) pounce: the kitten springs toward the spot of a crit, claws out at the top of the jump.
// 5) bark: the puppy barks at a boss when the fight starts and again on FINAL CHORUS.
// Pure maths plus a few numbers of state: nothing is allocated per frame (the pose objects are reused).
export const TAU = 6.2832;
export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export function createReact() { return { koT: -9, rvT: -9, pT: -9, pDir: 1, bT: -9, bAt: -1 }; }
export const POUNCE_GAP = 0.9, POUNCE_LEN = 0.55, BARK_LEN = 0.7, REVIVE_LEN = 0.7;

// feed every sim event here; px: the duo x, t: renderer clock
export function reactEvent(R, e, px, t) {
  switch (e.t) {
    case 'dead': R.koT = t; R.rvT = -9; break;
    case 'revive': R.koT = -9; R.rvT = t; break;
    case 'hit': if (e.crit && t - R.pT > POUNCE_GAP) { R.pT = t; R.pDir = e.x < px ? -1 : 1; } break;
    case 'stage': if (e.boss) R.bAt = t + 1.3; break;
    case 'phase2': R.bAt = t + 0.05; break;
  }
}
// true once when a pending bark is due
export function barkDue(R, t) { if (R.bAt >= 0 && t >= R.bAt) { R.bAt = -1; R.bT = t; return true; } return false; }
export const barkU = (R, t) => { const u = (t - R.bT) / BARK_LEN; return u >= 0 && u < 1 ? u : -1; };

// ---- run end: the sunken duo --------------------------------------------------------------------------------------
const KO = { dy: 0, rot: 0, sy: 1, stars: 0 };
// u: seconds since the run ended. Drops fast, then sways a little.
export function koPose(u, reduce) {
  const k = clamp01(u / 0.22), e = 1 - (1 - k) * (1 - k);
  KO.dy = 12 * e; KO.sy = 1 - 0.07 * e; KO.rot = reduce ? 0.05 * e : (0.05 + Math.sin(u * 3.2) * 0.035) * e; KO.stars = clamp01((u - 0.1) / 0.25);
  return KO;
}
// dizzy star i of n orbiting (cx, cy): writes {x, y, front, s} into o. The front half is bigger.
export function starAt(o, i, n, cx, cy, rx, ry, t, reduce) {
  const a = (reduce ? 0 : t * 3.4) + i * TAU / n, sn = Math.sin(a);
  o.x = cx + Math.cos(a) * rx; o.y = cy + sn * ry; o.front = sn > 0; o.s = 0.75 + 0.25 * sn;
  return o;
}
// ---- revive: a hop with a landing squash -------------------------------------------------------------------------
const RV = { dy: 0, sy: 1, sx: 1, u: -1 };
export function revivePose(u) {
  if (u < 0 || u >= REVIVE_LEN) { RV.dy = 0; RV.sy = 1; RV.sx = 1; RV.u = -1; return RV; }
  const k = u / REVIVE_LEN; RV.u = k;
  if (k < 0.75) { const j = k / 0.75, s = Math.sin(j * Math.PI); RV.dy = s * 34; RV.sy = 1 + s * 0.06; RV.sx = 1 / RV.sy; }
  else { const q = Math.sin((k - 0.75) / 0.25 * Math.PI); RV.dy = 0; RV.sy = 1 - q * 0.08; RV.sx = 1 + q * 0.06; }
  return RV;
}
// ---- glance: lean toward the nearest head -------------------------------------------------------------------------
// st: per pet state (gz), hx: nearest head x (NaN when none), dist: its distance. Returns the lean in radians.
export function glance(st, px, hx, dist, dt) {
  const want = hx === hx && dist < 560 ? Math.max(-1, Math.min(1, (hx - px) / 220)) * clamp01((560 - dist) / 300) : 0;
  const k = Math.min(1, dt * 7); st.gz = (st.gz || 0) + (want - (st.gz || 0)) * k;
  return st.gz * 0.16;
}
// ---- kitten pounce -------------------------------------------------------------------------------------------------
const PN = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, claws: 0, u: -1 };
// u: seconds since the crit. A crouch, a spring toward dir, claws out at the top, a soft landing.
export function pouncePose(u, dir) {
  if (u < 0 || u >= POUNCE_LEN) { PN.dx = PN.dy = PN.rot = PN.claws = 0; PN.sx = PN.sy = 1; PN.u = -1; return PN; }
  const k = u / POUNCE_LEN; PN.u = k;
  if (k < 0.18) { const c = k / 0.18; PN.sy = 1 - 0.16 * c; PN.sx = 1 + 0.1 * c; PN.dy = 0; PN.dx = 0; PN.rot = -dir * 0.1 * c; PN.claws = 0; }
  else if (k < 0.8) { const j = (k - 0.18) / 0.62, s = Math.sin(j * Math.PI); PN.dy = s * 44; PN.dx = dir * Math.sin(j * Math.PI * 0.5) * 20; PN.sy = 1 + s * 0.12; PN.sx = 1 - s * 0.07; PN.rot = dir * (0.35 * s - 0.1 * (1 - j)); PN.claws = s > 0.6 ? 1 : 0; }
  else { const l = (k - 0.8) / 0.2, q = Math.sin(l * Math.PI); PN.dx = dir * 20 * (1 - l); PN.dy = 0; PN.sy = 1 - q * 0.12; PN.sx = 1 + q * 0.08; PN.rot = 0; PN.claws = 0; }
  return PN;
}
// three little claw marks swiped at (x, y) facing dir
export function clawDraw(ctx, x, y, dir) {
  ctx.save(); ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) { ctx.strokeStyle = k ? '#ffe14a' : '#3a1d1d'; ctx.lineWidth = k ? 4 : 8;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + dir * 6, y + i * 10 - 8); ctx.lineTo(x + dir * 30, y + i * 10 + 7); ctx.stroke(); } }
  ctx.restore();
}
// ---- puppy bark -----------------------------------------------------------------------------------------------------
// three arcs fly out of the puppy's mouth (dir -1 left, 1 right, always opening upward), u in 0..1
export function barkDraw(ctx, x, y, dir, u) {
  ctx.save(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const c = dir > 0 ? -0.7 : -Math.PI + 0.7;
  for (let i = 0; i < 3; i++) {
    const f = clamp01(u * 1.3 - i * 0.16); if (f <= 0 || f >= 1) continue;
    ctx.globalAlpha = (1 - f) * 0.9;
    ctx.beginPath(); ctx.arc(x + dir * 22, y - 16, 14 + f * 34 + i * 10, c - 0.5, c + 0.5); ctx.stroke();
  }
  ctx.restore();
}
