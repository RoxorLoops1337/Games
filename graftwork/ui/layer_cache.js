// Room layer cache policy (pure, no DOM). The Ward and the title draw each room's static layer (floor, walls, slab) from an offscreen canvas baked at a zoom BUCKET.
// Round 2: the cache used to hold ONE bucket per room, so an eased camera zoom that crossed a bucket edge rebuilt every visible room (a 12 room hospital = 12 bakes in
// one frame, again on the way back). Now a room keeps up to MAX_BUCKETS buckets (re-entering one is a hit), builds are limited per frame, and while the zoom is
// still moving an already baked neighbour bucket is drawn instead of baking a new one; the ideal bucket is baked once the zoom settles.
export const LAYER_BUCKETS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
export const bucketOf = (z) => { for (const b of LAYER_BUCKETS) if (z <= b * 1.08) return b; return 4; };
export const MAX_BUCKETS = 3; // per room
export const BUILDS_PER_FRAME = 3;
export const MOVING_EPS = 0.004; // relative zoom change per frame that counts as "moving"
export const MAX_RATIO = 2; // a stand-in bucket may be at most this far (either way) from the ideal one
// have: array of cached buckets of this room (same base key). Returns { bucket, build }.
export function pickLayer(want, have, o = {}) {
  const built = o.built || 0, moving = !!o.moving;
  if (have.includes(want)) return { bucket: want, build: false };
  // the nearest cached bucket within MAX_RATIO of the ideal; larger preferred on a tie (downscaling stays sharp, upscaling goes soft)
  let alt = 0, bestD = 1e9;
  for (const b of have) { const r = b / want; if (r > MAX_RATIO || r < 1 / MAX_RATIO) continue; const d = Math.abs(Math.log(r)) - (b > want ? 1e-6 : 0); if (d < bestD) { bestD = d; alt = b; } }
  if (alt && (moving || built >= BUILDS_PER_FRAME)) return { bucket: alt, build: false };
  if (!alt && built >= BUILDS_PER_FRAME && have.length) return { bucket: nearest(have, want), build: false }; // over budget: anything beats a hitch
  return { bucket: want, build: true };
}
export function nearest(have, want) { let best = have[0], bd = 1e9; for (const b of have) { const d = Math.abs(Math.log(b / want)); if (d < bd) { bd = d; best = b; } } return best; }
// buckets to evict after adding `added` to `have` (keeps MAX_BUCKETS, drops the farthest from `want`)
export function evictFor(have, want) {
  const out = []; const l = have.slice();
  while (l.length > MAX_BUCKETS) { let worst = 0, wd = -1; for (let i = 0; i < l.length; i++) { const d = Math.abs(Math.log(l[i] / want)); if (d > wd) { wd = d; worst = i; } } out.push(l.splice(worst, 1)[0]); }
  return out;
}
export const isMoving = (prevZ, z) => prevZ > 0 && Math.abs(z - prevZ) / prevZ > MOVING_EPS;
