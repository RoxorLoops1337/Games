// b13c: follow-finger feel. Pure helpers (edge reach) and the finger marker drawing. No allocations per frame.
// edgeMap: a thumb rarely reaches the bezel, so the outer strip of the screen is a magnet onto the lane wall: the duo can
// always reach the edge. The strip is wider on the side the holding hand strains toward (left-hand: the right edge).
export const EDGE_M = 26, EDGE_FAR = 46;
export function edgeMap(x, x0, x1, left) {
  if (!Number.isFinite(x)) return x0;
  const w = x1 - x0, ml = Math.min(left ? EDGE_M : EDGE_FAR, w * 0.2), mr = Math.min(left ? EDGE_FAR : EDGE_M, w * 0.2);
  if (x <= x0 + ml) return x0;
  if (x >= x1 - mr) return x1;
  return x;   // 1:1 in the middle, so the duo sits right under the finger
}
const TAU = Math.PI * 2;
// the marker: a ring at the (mapped) finger x just under the floor line, and a tether to the duo while it is catching up
export function drawFinger(ctx, g, fx, t, reduce) {
  const px = g.p.x, fy = g.p.y + 58, gap = fx - px, ag = Math.abs(gap), pr = reduce ? 0 : Math.sin(t * 8) * 2;
  ctx.save(); ctx.lineCap = 'round';
  if (ag > 30) {   // tether: a bar from the duo to the ring, fading out as the duo arrives
    ctx.globalAlpha = Math.min(1, (ag - 30) / 60) * 0.75;
    ctx.strokeStyle = 'rgba(16,19,28,.6)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(px, fy); ctx.lineTo(fx - Math.sign(gap) * 24, fy); ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = 'rgba(16,19,28,.55)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(fx, fy, 22 + pr, 0, TAU); ctx.moveTo(fx, fy - 30); ctx.lineTo(fx, fy - 78); ctx.stroke();
  ctx.strokeStyle = ag < 8 ? 'rgba(255,255,255,.85)' : 'rgba(255,226,120,.95)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
}
