// 36-e in-run HUD readability: the second and third HUD rows (progress track, stats strip) fade to a ghost while snake
// cells pass under them, so the HP numbers on those cells stay readable. Pure helpers, no allocation per call.
export const CLEAR_TOP = 78;      // game units (below the notch inset): the progress row starts here
export const CLEAR_BOTTOM = 176;  // and the stats row ends about here
export const FADE_MIN = 0.28, FADE_TOP_MIN = 0.7;

// true when any living cell (centre plus radius) reaches into the band [y0, y1]
export function cellsUnderBand(g, y0, y1) {
  const sn = g && g.snakes;
  if (!sn) return false;
  for (let i = 0; i < sn.length; i++) {
    const segs = sn[i].segs;
    for (let j = 0; j < segs.length; j++) { const q = segs[j]; if (q.hp > 0 && q.y + q.r > y0 && q.y - q.r < y1) return true; }
  }
  return false;
}
// eased value toward the target: fast to fade out (cells arrive quickly), slower to come back
export function fadeStep(cur, target, dt) {
  const rate = target < cur ? 9 : 3.2, k = Math.min(1, Math.max(0, dt) * rate);
  return cur + (target - cur) * k;
}
