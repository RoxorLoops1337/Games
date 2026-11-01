// The walking cat of Whiskerton Walk: a pure pose function (catPose) and the drawing of one cat standing on a point (drawWalkCat).
// The cat is the same front facing loaf as everywhere else, baked once as two small layers (body, tail) so the tail can swing on its
// own and the whole body can squash, stretch, bob and lean. Facing is a horizontal flip with a short squash turn.
import { CAT_BY_ID } from './cats.js';
import { drawCat } from './art_cats.js';
import { drawLook } from './cosmetics.js';
import { texturize, outlineCanvas, hash, shade } from './art_util.js';

export const WALK_CAT_SIZE = 92;   // px of the 120 unit art box on the stage; feet land on the point given to drawWalkCat
const BOX = 120, FEET_Y = 110, TAIL_ROOT = [80, 100];
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------- pose (pure)
// catPose(pose, poseT, t, reduced) -> { sx, sy, bob, tilt, tailSwing, pawPhase }
//   sx, sy   squash and stretch about the feet (always 0.6 to 1.3)
//   bob      pixels the body is lifted (positive is up)
//   tilt     lean in radians, positive leans toward the way the cat faces
//   tailSwing tail angle in radians about its root
//   pawPhase radians of the stride, 0 when the cat is not running
export function catPose(pose, poseT, t, reduced) {
  const pt = Math.max(0, fin(poseT)), tt = fin(t);
  let sx = 1, sy = 1, bob = 0, tilt = 0, tailSwing = 0, pawPhase = 0;
  if (reduced) {
    // a still pose; running is a two frame swap of the paws
    if (pose === 'run') pawPhase = (Math.floor(tt * 6) % 2) * Math.PI;
    else if (pose === 'sit') sy = 0.92;
    else if (pose === 'sleep') { sy = 0.84; sx = 1.05; }
    else if (pose === 'jump') sy = 1.08;
    else if (pose === 'fall') sy = 1.04;
    return { sx, sy, bob, tilt, tailSwing, pawPhase };
  }
  switch (pose) {
    case 'run': {
      const hz = 8 + Math.min(3, pt * 2);                    // quickens a little as the run goes on
      const ph = tt * hz * TAU;
      pawPhase = ph;
      bob = Math.abs(Math.sin(ph)) * 3;
      const foot = Math.pow(Math.max(0, -Math.cos(ph * 2)), 4);   // a small squash on every footfall
      sy = 1 - 0.05 * foot + 0.02; sx = 1 + 0.05 * foot - 0.015;
      tilt = 0.12; tailSwing = Math.sin(ph - 1.2) * 0.31;
      break;
    }
    case 'jump': {
      if (pt < 0.08) { const u = pt / 0.08; sy = 1 - 0.2 * (1 - u) + 0.1 * u; sx = 1 + 0.15 * (1 - u) - 0.05 * u; }
      else { sy = 1.14; sx = 0.92; }
      tilt = 0.05; tailSwing = -0.5;
      break;
    }
    case 'fall': sy = 1.08; sx = 0.95; tilt = -0.04; tailSwing = -0.35 + Math.sin(tt * 10) * 0.08; break;
    case 'land': {
      const k = Math.exp(-pt * 14) * Math.cos(pt * 28);
      sy = 1 - 0.28 * k; sx = 1 + 0.2 * k; tailSwing = 0.2 * k;
      break;
    }
    case 'sit': sy = 0.9 + Math.sin(tt * 1.8) * 0.012; sx = 1.04; tailSwing = 0.5 + Math.sin(tt * 1.3) * 0.08; break;
    case 'sleep': sy = 0.82 + Math.sin(tt * 1.4) * 0.015; sx = 1.07; bob = -1; tailSwing = 0.65; break;
    default:      // idle
      sy = 1 + Math.sin(tt * 2.2) * 0.015; sx = 1 - Math.sin(tt * 2.2) * 0.006; tailSwing = Math.sin(tt * 1.6) * 0.18;
  }
  return { sx: clamp(sx, 0.6, 1.3), sy: clamp(sy, 0.6, 1.3), bob: clamp(bob, -6, 6), tilt: clamp(tilt, -0.2, 0.2), tailSwing: clamp(tailSwing, -1, 1), pawPhase };
}

// ---------------------------------------------------------------- baked layers (two 120 px canvases per cat, at most CAP cats resident)
const CAP = 14;
const layers = new Map();   // key -> { body, tail, fur, use }
let lookFor = null;         // (catId) -> { sig, look } so cosmetics follow the cat (injected by main.js)
let useN = 0;
export function setWalkLook(fn) { lookFor = typeof fn === 'function' ? fn : null; }

function canvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
function bake(catId) {
  const d = CAT_BY_ID[catId];
  const lk = lookFor ? lookFor(catId) : null;
  const sig = lk && lk.sig && lk.sig !== '..' ? lk.sig : '';
  const key = catId + '|' + sig;
  let L = layers.get(key);
  if (L) { L.use = ++useN; return L; }
  if (!d) return null;
  const body = canvas(BOX, BOX), tail = canvas(BOX, BOX);
  if (!body || !tail || !body.getContext) return null;
  try {
    const bx = body.getContext('2d'), tx = tail.getContext('2d');
    drawCat(bx, d, 'open', { part: 'body' });
    if (sig && lk.look) drawLook(bx, lk.look, catId);
    drawCat(tx, d, 'open', { part: 'tail' });
    const seed = hash(key);
    texturize(body, { seed, len: 4, lw: 1.1, count: 260, alpha: 0.3, amp: 0.09, dir: Math.PI / 2 + 0.25, spread: 1.3 });
    L = { body: outlineCanvas(body, 1.5, '#2a1840', 0.8), tail: outlineCanvas(tail, 1.5, '#2a1840', 0.8), fur: d.art.fur, use: ++useN };
    body.width = body.height = 0; tail.width = tail.height = 0;
  } catch (e) { return null; }
  layers.set(key, L);
  if (layers.size > CAP) {   // free the least recently drawn cat
    let old = null;
    for (const [k, v] of layers) if (k !== key && (!old || v.use < old[1].use)) old = [k, v];
    if (old) { old[1].body.width = old[1].body.height = 0; old[1].tail.width = old[1].tail.height = 0; layers.delete(old[0]); }
  }
  return L;
}
export function freeWalkCats() {
  for (const L of layers.values()) { L.body.width = L.body.height = 0; L.tail.width = L.tail.height = 0; }
  layers.clear(); track.clear();
}
export const walkCatCount = () => layers.size;
export const walkCatMemMB = () => { let b = 0; for (const L of layers.values()) b += (L.body.width * L.body.height + L.tail.width * L.tail.height) * 4; return b / 1048576; };

// ---------------------------------------------------------------- drawing
const track = new Map();   // key -> { face, turnAt, pose, poseAt }: when a cat last turned round or changed pose
const TURN_T = 0.12;

// Draw one cat with its feet at (x, y). face 1 looks right, -1 left. key tells two cats of one kind apart (defaults to catId).
// How long the cat has been in its pose (for the jump and the landing spring) is tracked here from t, so callers need no extra clock.
export function drawWalkCat(ctx, catId, pose, x, y, face, t, reduced, key) {
  if (!CAT_BY_ID[catId] || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const f = face < 0 ? -1 : 1, tt = fin(t), k = key || catId;
  let tr = track.get(k);
  if (!tr) { tr = { face: f, turnAt: -9, pose, poseAt: tt }; track.set(k, tr); if (track.size > 64) track.clear(); }
  if (tr.pose !== pose || tt < tr.poseAt) { tr.pose = pose; tr.poseAt = tt; }
  if (tr.face !== f) { tr.face = f; tr.turnAt = tt; }
  const poseT = Math.max(0, tt - tr.poseAt);
  const P = catPose(pose, poseT, tt, !!reduced);
  let tx = 1;
  if (!reduced) {   // a quick squash when the cat turns round
    const e = (tt - tr.turnAt) / TURN_T;
    if (e >= 0 && e < 1) tx = 0.78 + 0.22 * Math.sin(e * Math.PI / 2);
  }
  const s = WALK_CAT_SIZE / BOX, L = bake(catId), d = CAT_BY_ID[catId];
  const lift = P.bob;
  // soft ground shadow (not while the cat is in the air)
  if (pose !== 'jump' && pose !== 'fall') {
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 26 * P.sx * (1 - lift * 0.03), 5.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y - lift);
  ctx.rotate(P.tilt * f);
  ctx.scale(P.sx * tx, P.sy);
  // the art has its tail on the right; looking right puts the tail behind, on the left
  ctx.scale(-f * s, s);
  ctx.translate(-BOX / 2, -FEET_Y);
  if (L) {
    ctx.save(); ctx.translate(TAIL_ROOT[0], TAIL_ROOT[1]); ctx.rotate(P.tailSwing); ctx.translate(-TAIL_ROOT[0], -TAIL_ROOT[1]);
    ctx.drawImage(L.tail, 0, 0, BOX, BOX); ctx.restore();
    ctx.drawImage(L.body, 0, 0, BOX, BOX);
  } else {   // no canvas support (a headless test): draw straight into the context
    ctx.save(); ctx.translate(TAIL_ROOT[0], TAIL_ROOT[1]); ctx.rotate(P.tailSwing); ctx.translate(-TAIL_ROOT[0], -TAIL_ROOT[1]);
    try { drawCat(ctx, d, 'open', { part: 'tail' }); } catch (e) { /* ignore */ }
    ctx.restore();
    try { drawCat(ctx, d, 'open', { part: 'body' }); } catch (e) { /* ignore */ }
  }
  // live paws: while running two small paws swing under the body, one lifted while the other pushes
  if (pose === 'run') {
    const fur = (L && L.fur) || d.art.fur;
    for (let i = 0; i < 2; i++) {
      const ph = P.pawPhase + i * Math.PI, lifted = Math.max(0, Math.cos(ph)) * 3.2;
      ctx.beginPath(); ctx.ellipse(60 + Math.sin(ph) * 15, 107.2 - lifted, 6.4, 3.6, 0, 0, TAU);
      ctx.fillStyle = fur; ctx.fill(); ctx.strokeStyle = shade(fur, -0.55); ctx.lineWidth = 1.1; ctx.stroke();
    }
  }
  ctx.restore();
}
