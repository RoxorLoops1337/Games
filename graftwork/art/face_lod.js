// Card face cache policy (pure, no DOM). Round 2 perf + sharpness.
// A card face is rendered once into an offscreen canvas and drawn with drawImage every frame. It used to be ONE size (1.5 px per logical px for every card), which was
// wasteful for the deck view (a 40 card grid shrinks it 2 to 3x every frame, the slowest draw there is) and slightly soft for zoomed cards on DPR 2 to 3 phones.
// Now the face is rendered at a BUCKET: the smallest step that is not below the device pixels the card is drawn at, so a draw is near 1:1 at any size.
//   need   = device px per logical card px at the moment of the draw (ctx transform scale, including the card's own scale)
//   bucket = one of BUCKETS, the render scale of the cached canvas
export const BUCKETS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
export const LEGACY = 1.5; // the one size every card used before (also what a context without getTransform gets)
const SLACK = 0.92; // a bucket up to 8 percent below the need still counts (an upscale that small is invisible and saves a size step)
const REUSE = 1.45; // a cached bucket up to 1.45x the need is reused instead of building the ideal one (downscale stays mild)
export const BIG_FROM = 2; // buckets from here up are the "zoom" sizes: few, big, kept in their own small LRU
export const BIG_MAX = 6;
export const BUILDS_PER_FRAME = 2;
export const PIXEL_BUDGET = 24e6; // pixels of face canvases kept alive in total (about what 110 faces at the old single size held: 96 MB)

export function idealBucket(need) {
  if (!(need > 0)) return LEGACY;
  for (const b of BUCKETS) if (b >= need * SLACK) return b;
  return BUCKETS[BUCKETS.length - 1];
}
// has(b) -> bool. built: how many faces were built this frame. Returns { bucket, build } : build=false means "draw this cached one".
export function chooseBucket(need, has, built = 0) {
  const want = idealBucket(need);
  if (has(want)) return { bucket: want, build: false };
  // a cached neighbour that is close enough: at or above the ideal, never more than REUSE x the need
  for (const b of BUCKETS) if (b > want && b <= need * REUSE && has(b)) return { bucket: b, build: false };
  if (built < BUILDS_PER_FRAME) return { bucket: want, build: true };
  // out of budget this frame: anything cached, bigger first (a downscale looks right, an upscale looks soft)
  for (const b of BUCKETS) if (b > want && has(b)) return { bucket: b, build: false };
  for (let i = BUCKETS.length - 1; i >= 0; i--) if (BUCKETS[i] < want && has(BUCKETS[i])) return { bucket: BUCKETS[i], build: false };
  return { bucket: want, build: true }; // nothing at all cached for this card: it must be drawn
}
// canvas pixels of a face at a bucket (the card plus its padding)
export const facePixels = (b, w = 220, h = 310, pad = 26) => Math.ceil((w + pad * 2) * b) * Math.ceil((h + pad * 2) * b);

// A small LRU keyed by string with a pixel budget and a separate cap for the big (zoom) sizes. Entries: { px, big }.
export function createFaceLru(o = {}) {
  const max = o.max || 110, budget = o.budget || PIXEL_BUDGET, bigMax = o.bigMax || BIG_MAX;
  const m = new Map(); let px = 0, big = 0;
  const L = { stats: { evicted: 0 } };
  const drop = (k) => { const e = m.get(k); if (!e) return; m.delete(k); px -= e.px; if (e.big) big--; L.stats.evicted++; };
  L.get = (k) => { const e = m.get(k); if (e) { m.delete(k); m.set(k, e); } return e; };
  L.has = (k) => m.has(k);
  L.set = (k, e) => {
    if (m.has(k)) drop(k);
    m.set(k, e); px += e.px; if (e.big) big++;
    // evict least recently used first; big faces only compete among themselves for their cap
    while (m.size > max || px > budget) { const k0 = m.keys().next().value; if (k0 === k && m.size === 1) break; drop(k0); }
    if (e.big) { while (big > bigMax) { for (const [kk, v] of m) if (v.big && kk !== k) { drop(kk); break; } } }
  };
  L.clear = () => { m.clear(); px = 0; big = 0; };
  Object.defineProperties(L, { size: { get: () => m.size }, pixels: { get: () => px }, bigCount: { get: () => big } });
  L.keys = () => [...m.keys()];
  return L;
}

