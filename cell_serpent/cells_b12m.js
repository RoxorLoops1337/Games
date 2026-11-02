// 12m enemy art: HP number placement on the snake cells. Pure maths, no allocations.
// - a cell that wears a corner badge (metronome, pillow, ward, ...) drops its number a little so the two never touch;
// - on a tight spiral (ring stages near the circle) neighbouring cells overlap, so the number shrinks to the room it has.
export function hpDropB12m(s) {
  return (s.metro || s.pillow) ? 0.28 : (s.ward || s.lull || s.drum || s.choir || s.quartet || s.bell || s.snack || s.mirror) ? 0.2 : 0.05;
}
// size factor 0.7..1 from the distance to the nearest neighbours in the chain
export function hpSizeB12m(segs, i, r) {
  return hpSizeB12mRaw(segs, i, r) * ((segs[i].metro || segs[i].pillow || segs[i].ward || segs[i].lull) ? 0.94 : 1);
}
function hpSizeB12mRaw(segs, i, r) {
  const s = segs[i], a = segs[i - 1], b = segs[i + 1];
  let d = 1e9;
  if (a) d = Math.hypot(a.x - s.x, a.y - s.y);
  if (b) { const e = Math.hypot(b.x - s.x, b.y - s.y); if (e < d) d = e; }
  const k = d / (r * 1.9);
  return k >= 1 ? 1 : k < 0.7 ? 0.7 : k;
}
