// Batch 12 (agent n): the first circle stage (stage 6) teaches its controls with the hint system.
// Wordless first: a finger sweeps along an arc around the circle and a dotted line shows where the notes will go.
// Then one short pill: "DRAG TO AIM" over "THE DUO SHOOTS ON ITS OWN". It stays until the player has really swept
// the aim (about 100 degrees in total), with a 12 s budget, then fades for good in that run. main.js only turns it on
// for the first three circle runs (aimHint). Text is big enough to read on a phone (34 and 24 game units, 17 and 12 CSS px).
const TAU = Math.PI * 2;
const EMO = 'system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif';
export const RING_HINT_SECONDS = 12;
export const RING_HINT_SWEEP = 1.75;   // radians of real aim travel that count as "learned"

// pure: shortest signed angle difference
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
// pure: the finger's angle on its arc (from -115 to -15 degrees, eased back and forth)
export function fingerAngle(t) { return -2.0 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 1.75; }
// pure: alpha of the hint given the state and the run clock
export function hintAlpha(st, gt) {
  if (st.done) return Math.max(0, 1 - (gt - st.doneAt) / 0.6);
  return Math.min(1, gt * 2, (RING_HINT_SECONDS - gt) * 1.5);
}
export function newRingHint(g) { return { g, last: g.p.aim, acc: 0, done: false, doneAt: 0 }; }

export function drawRingHint(ctx, g, S, h) {
  const st = S.ringHint && S.ringHint.g === g ? S.ringHint : (S.ringHint = newRingHint(g));
  if (g.phase !== 'play') return;
  const p = g.p;
  st.acc += Math.abs(angDiff(p.aim, st.last)); st.last = p.aim;
  if (!st.done && st.acc > RING_HINT_SWEEP) { st.done = true; st.doneAt = g.t; }
  if (g.t > RING_HINT_SECONDS || (st.done && g.t - st.doneAt > 0.6)) return;
  const a = hintAlpha(st, g.t); if (a <= 0) return;
  const R = g.ring.R, ro = R + 62, fa = fingerAngle(S.t);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the arc the finger travels on, with a bright dashed core
  ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = '#06323f'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(p.x, p.y, ro, -2.0, -0.25); ctx.stroke();
  ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = '#6fe3ff'; ctx.lineWidth = 6; ctx.setLineDash([2, 16]); ctx.lineDashOffset = -S.t * 30; ctx.beginPath(); ctx.arc(p.x, p.y, ro, -2.0, -0.25); ctx.stroke(); ctx.setLineDash([]);
  // the touch ring and the finger
  const fx = p.x + Math.cos(fa) * ro, fy = p.y + Math.sin(fa) * ro, pr = (S.t * 1.4) % 1;
  ctx.globalAlpha = 0.9 * a * (1 - pr); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(fx, fy, 16 + pr * 34, 0, TAU); ctx.stroke();
  ctx.globalAlpha = a; ctx.font = '70px ' + EMO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(fx + 8, fy + 30); ctx.rotate(0.12); ctx.fillText('\u{1F446}', 0, 0);
  ctx.restore();
  // the live aim: a glow at the duo while the hint is up
  h.glow(p.x, p.y, R * 0.9 + Math.sin(S.t * 5) * 10, '#6fe3ff', 0.25 * a);
  // the pill
  const y = p.y + R + 170;
  ctx.save(); ctx.globalAlpha = a * 0.92; ctx.fillStyle = 'rgba(16,10,50,.8)'; ctx.strokeStyle = '#6fe3ff'; ctx.lineWidth = 4;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(100, y - 52, 520, 104, 52); else ctx.rect(100, y - 52, 520, 104); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalAlpha = a; h.text('DRAG TO AIM', 360, y - 16, 38, '#ffffff', '#0b1020'); h.text('THE DUO SHOOTS ON ITS OWN', 360, y + 26, 24, '#ffe36b', '#0b1020'); ctx.restore();
}
