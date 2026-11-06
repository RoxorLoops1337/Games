// The walking cat of Whiskerton Walk: a pure pose function (catPose) and the drawing of one cat standing on a point (drawWalkCat).
// The cat is the same front facing loaf as everywhere else, baked once as four small layers (torso, ears, head, tail) so the head
// can lag and look, the ears can twitch, the tail can bend in four joints and the whole body can squash, stretch, bob and lean.
// animateCat (the rig) feeds the pure modules kingdom_gait (stride by distance), kingdom_idle (blink, ears, head, sit, sleep),
// kingdom_tail (spring chain) and kingdom_air (jump, land, turn squash, dust) and returns one `look` that drawWalkCat draws.
import { CAT_BY_ID } from './cats.js';
import { drawCat } from './art_cats.js';
import { drawLook } from './cosmetics.js';
import { texturize, outlineCanvas, hash, shade } from './art_util.js';
import { gaitState, stepGait } from './kingdom_gait.js';
import { idleState, stepIdle, reducedIdle } from './kingdom_idle.js';
import { tailState, stepTail, tailRest } from './kingdom_tail.js';
import { airState, stepAir, pushDust, stepDust } from './kingdom_air.js';

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
      tilt = 0.12; tailSwing = Math.sin(tt * 5) * 0.2;   // slow trailing sway, never at the footstep rate
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

// ---------------------------------------------------------------- baked layers (four canvases per cat, at most CAP cats resident)
// torso (body, front paws, patterns, no hind feet), ears, head (face and front accessories), tail (a straight tail, 150 wide, bent joint by joint)
const CAP = 14, TAILW = 150;
const layers = new Map();   // key -> { torso, ears, head, tail, fur, ghost, use }
let lookFor = null;         // (catId) -> { sig, look } so cosmetics follow the cat (injected by main.js)
let useN = 0;
export function setWalkLook(fn) { lookFor = typeof fn === 'function' ? fn : null; }

function canvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
const NAMES = ['torso', 'ears', 'head', 'tail'];
const zero = (L) => { for (const n of NAMES) if (L[n]) L[n].width = L[n].height = 0; };
function bake(catId) {
  const d = CAT_BY_ID[catId];
  const lk = lookFor ? lookFor(catId) : null;
  const sig = lk && lk.sig && lk.sig !== '..' ? lk.sig : '';
  const key = catId + '|' + sig;
  let L = layers.get(key);
  if (L) { L.use = ++useN; return L; }
  if (!d) return null;
  const src = { torso: canvas(BOX, BOX), ears: canvas(BOX, BOX), head: canvas(BOX, BOX), tail: canvas(TAILW, BOX) };
  if (!src.torso || !src.ears || !src.head || !src.tail || !src.torso.getContext) return null;
  try {
    const cx = {}; for (const n of NAMES) cx[n] = src[n].getContext('2d');
    drawCat(cx.torso, d, 'open', { part: 'torso', noFeet: true });
    drawCat(cx.ears, d, 'open', { part: 'ears' });
    drawCat(cx.head, d, 'open', { part: 'head' });
    if (sig && lk.look) drawLook(cx.head, lk.look, catId);
    drawCat(cx.tail, d, 'open', { part: 'tail', tailShape: 'straight' });
    const seed = hash(key);
    texturize(src.torso, { seed, len: 4, lw: 1.1, count: 150, alpha: 0.3, amp: 0.09, dir: Math.PI / 2 + 0.25, spread: 1.3 });
    texturize(src.head, { seed: seed ^ 77, len: 4, lw: 1.1, count: 130, alpha: 0.3, amp: 0.09, dir: Math.PI / 2 + 0.25, spread: 1.3 });
    L = { fur: d.art.fur, ghost: d.id === 'boo', use: ++useN };
    for (const n of NAMES) L[n] = outlineCanvas(src[n], 1.5, '#2a1840', 0.8);
    for (const n of NAMES) src[n].width = src[n].height = 0;
  } catch (e) { return null; }
  layers.set(key, L);
  if (layers.size > CAP) {   // free the least recently drawn cat
    let old = null;
    for (const [k, v] of layers) if (k !== key && (!old || v.use < old[1].use)) old = [k, v];
    if (old) { zero(old[1]); layers.delete(old[0]); }
  }
  return L;
}
export function freeWalkCats() {
  for (const L of layers.values()) zero(L);
  layers.clear(); anims.clear();
}
export const walkCatCount = () => layers.size;
export const walkCatMemMB = () => { let b = 0; for (const L of layers.values()) for (const n of NAMES) b += L[n].width * L[n].height * 4; return b / 1048576; };

// ---------------------------------------------------------------- the rig: per cat animation state
const anims = new Map();   // key -> state (freed with freeWalkCats, trimmed to ANIM_CAP)
const ANIM_CAP = 64;
const smoothK = (dt, tau) => 1 - Math.exp(-dt / tau);

function newAnim(key) {
  const seed = key;
  return {
    key, gait: gaitState(), idle: idleState(seed), tail: tailState(seed), air: airState(seed), dust: [],
    t: NaN, px: NaN, py: NaN, vx: 0, vy: 0, ax: 0, pose: 'idle', poseAt: 0, face: 1, oldFace: 1, fall: 0, impact: 0,
    sit: 0, sleep: 0, hl: 0, tailDir: 0, use: 0,
    look: { pose: 'idle', sx: 1, sy: 1, bob: 0, tilt: 0, fd: 1, turn: 1, headX: 0, headY: 0, headRot: 0, blink: 0, earL: 0, earR: 0,
      tail: [0, 0, 0, 0], pawL: 0, pawR: 0, phase: 0, swing: 0, grounded: true, zzz: false, zzzT: 0, speed: 0, dust: null },
  };
}

// animateCat(anim, key, snap, dt) -> look. anim is the Map holding every cat's state, key tells cats apart,
// snap = { pose, x, y, face, reduced, t } (the sim snapshot of one cat), dt = seconds since this cat was last animated (0 to 0.25).
// The returned look is owned by the cat's state: read it, do not keep it. Pure apart from the Map; deterministic (seeded by key).
// look = { sx, sy, bob, tilt, fd (shown facing), turn (turn squash 0.6 to 1), headX, headY, headRot (art px and radians, art frame),
//          blink, earL, earR (art frame, left ear first), tail[4] (relative angles, positive up), pawL, pawR, phase, swing, dust }
export function animateCat(anim, key, snap, dt) {
  let A = anim.get(key);
  if (!A) {
    A = newAnim(key); anim.set(key, A);
    if (anim.size > ANIM_CAP) { let o = null; for (const [k, v] of anim) if (k !== key && (!o || v.use < o[1].use)) o = [k, v]; if (o) anim.delete(o[0]); }
    A.t = snap.t - 1; A.face = A.oldFace = snap.face < 0 ? -1 : 1; A.pose = snap.pose; A.poseAt = snap.t;
  }
  A.use = ++useN;
  const L = A.look, reduced = !!snap.reduced, f = snap.face < 0 ? -1 : 1;
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
  if (dt <= 0) return L;
  const pose = snap.pose || 'idle';
  if (pose !== A.pose || snap.t < A.poseAt) { A.pose = pose; A.poseAt = snap.t; }
  const poseT = Math.max(0, snap.t - A.poseAt);
  // velocity from the position (the snapshot carries no speed): teleports and first frames count as standing still
  let rvx = 0, rvy = 0;
  if (Number.isFinite(A.px)) { rvx = (snap.x - A.px) / dt; rvy = (snap.y - A.py) / dt; if (Math.abs(rvx) > 700 || Math.abs(rvy) > 1800) { rvx = 0; rvy = 0; A.vx = 0; A.vy = 0; } }
  A.px = snap.x; A.py = snap.y;
  const k = smoothK(dt, 0.04), pvx = A.vx;
  A.vx += (rvx - A.vx) * k; A.vy += (rvy - A.vy) * k;
  A.ax += (((A.vx - pvx) / dt) - A.ax) * smoothK(dt, 0.1);
  const speed = Math.abs(A.vx), grounded = pose !== 'jump' && pose !== 'fall';
  const turned = f !== A.face;
  if (turned) { A.oldFace = A.face; A.face = f; }
  if (pose === 'fall') A.fall = Math.max(A.fall, A.vy);
  if (pose === 'land' && poseT < dt * 1.5 + 0.001 && A.fall > 0) { A.impact = A.fall; A.fall = 0; }
  if (grounded && pose !== 'land') A.fall = 0;

  if (reduced) {   // a still pose; running swaps two paw frames, nothing else moves
    const P = catPose(pose, poseT, snap.t, true), io = reducedIdle(A.idle.out);
    const sw = pose === 'run' && Math.floor(snap.t * 6) % 2 === 0;
    const rest = stepTail(A.tail, dt, { ax: 0, vx: 0, vy: 0, face: f, grounded, mood: pose === 'sit' ? 'sit' : pose === 'sleep' ? 'sleep' : 'calm', excite: 0, reduced: true });
    L.pose = pose; L.sx = P.sx; L.sy = P.sy; L.bob = 0; L.tilt = pose === 'run' ? 0.06 : 0; L.fd = f; L.turn = 1;
    L.headX = L.headY = L.headRot = 0; L.blink = pose === 'sleep' ? 1 : (io && io.blink > 0.5 ? 1 : 0); L.earL = L.earR = 0;
    for (let i = 0; i < 4; i++) L.tail[i] = rest.a[i]; L.pawL = sw ? 0.7 : 0; L.pawR = pose === 'run' && !sw ? 0.7 : 0;
    L.phase = 0; L.swing = pose === 'run' ? 1 : 0; L.grounded = grounded; L.zzz = pose === 'sleep'; L.zzzT = 0; L.speed = speed; L.dust = null; L.dustN = 0;
    return L;
  }

  const g = stepGait(A.gait, dt, grounded ? speed : 0, grounded, A.face);
  const moving = speed > 20 || !grounded;
  const io = stepIdle(A.idle, dt, { moving, grounded, nearTarget: false, poke: false, reduced: false });
  const air = stepAir(A.air, dt, { pose, poseT, vy: A.vy, impact: A.impact, grounded, turned, startedRun: pose === 'run', stopped: pose !== 'run' && speed < 20 && A.gait.sp > 40, face: f });
  // posture follows the sim's pose (it owns sitting and sleeping), eased so nothing pops
  const wantSit = pose === 'sit' || pose === 'sleep' ? 1 : 0, wantSleep = pose === 'sleep' ? 1 : 0;
  A.sit += (wantSit - A.sit) * smoothK(dt, 0.16); A.sleep += (wantSleep - A.sleep) * smoothK(dt, 0.3);
  const breath = (io.breath - 0.5) * (0.02 + 0.02 * A.sleep);
  let sy = g.sy * air.sy * (1 - 0.1 * A.sit - 0.08 * A.sleep) * (1 + breath);
  let sx = g.sx * air.sx * (1 + 0.04 * A.sit + 0.03 * A.sleep) * (1 - breath * 0.4);
  const st = io.startle || 0; sy *= 1 + 0.05 * st; sx *= 1 - 0.03 * st;
  const bob = g.bob + air.bob - A.sleep * 1;
  // the head lags the body bob a little and leads the travel; it looks where the idle module says
  A.hl += (bob - A.hl) * smoothK(dt, 0.07);
  const shown = air.flip < 0.5 ? A.oldFace : A.face;
  const lead = grounded ? g.amp * (0.9 + 1.6 * g.blend) : 0;
  const screenDx = io.headYaw * 3.2 + shown * lead + shown * g.lean * 6;
  const droop = A.sleep * 6 + A.sit * 0.8 + (io.pose === 'groom' ? 3 : 0);
  L.pose = pose; L.sx = clamp(sx, 0.6, 1.3); L.sy = clamp(sy, 0.6, 1.3); L.bob = clamp(bob, -6, 6);
  L.tilt = clamp(g.tilt + air.tilt, -0.25, 0.25); L.fd = shown; L.turn = 0.62 + 0.38 * Math.abs(Math.cos(Math.PI * air.flip));
  L.headX = -screenDx * shown;                                   // art x runs opposite to screen x when the cat faces right
  L.headY = (A.hl - bob) * -0.8 - io.headPitch * 2.4 + droop;
  L.headRot = -shown * (io.headYaw * 0.07 + A.sleep * 0.18 * shown + g.tilt * 0.4);   // screen roll to art roll (the art is mirrored)
  L.blink = Math.max(io.blink, pose === 'sleep' ? A.sleep : 0);
  const ef = (e) => e - 0.25 * g.blend * g.amp;
  const eL = ef(io.earL), eR = ef(io.earR);
  L.earL = shown > 0 ? eR : eL; L.earR = shown > 0 ? eL : eR;   // art-left ear first (screen left when the cat faces left)
  const mood = pose === 'fall' ? 'fall' : pose === 'sleep' ? 'sleep' : (pose === 'sit' || A.sit > 0.6) ? 'sit' : (io.pose === 'look' || io.excite > 0.35) ? (io.excite > 0.6 ? 'happy' : 'alert') : 'calm';
  const tl = stepTail(A.tail, dt, { ax: A.ax * shown, vx: A.vx * shown, vy: A.vy, face: shown, grounded, mood, excite: io.excite });
  for (let i = 0; i < 4; i++) L.tail[i] = tl.a[i];
  L.pawL = g.pawL; L.pawR = g.pawR; L.phase = g.phase; L.swing = g.amp * (0.5 + 0.5 * g.blend); L.grounded = grounded;
  L.zzz = !!io.zzz; L.zzzT = io.zzzT || 0; L.speed = speed;
  // dust: spawn requests are relative to the feet, the pool lives in world coordinates
  if (air.dust && air.dust.length) { const rq = air.dust.map((p) => ({ x: snap.x + p.x, y: snap.y + p.y, vx: p.vx, vy: p.vy, life: p.life, size: p.size })); pushDust(A.dust, rq); }
  stepDust(A.dust, dt);
  L.dust = A.dust;
  return L;
}

// ---------------------------------------------------------------- drawing
const EAR_PIVOT = [[44, 42], [76, 42]];
const JOINTS = [74, 90, 106, 122];   // x of the four tail joints in the straight tail layer
function tailLayer(ctx, img, ang) {
  ctx.save();
  ctx.beginPath(); ctx.rect(-10, 0, TAILW + 20, FEET_Y + 2); ctx.clip();   // never through the floor
  const py = 101;
  for (let i = 0; i < 4; i++) {
    const v = ang[i] || 0, a = clamp(-(v < 0 ? v * 0.45 : v), -1.4, 1.4);   // curls down are softened so a sitting tail lies on the floor, not in it
    ctx.translate(JOINTS[i], py); ctx.rotate(a); ctx.translate(-JOINTS[i], -py);
    const x0 = i === 0 ? 0 : JOINTS[i], x1 = i === 3 ? TAILW : JOINTS[i + 1] + 1.5;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - (i ? 0.2 : 0), 0, x1 - x0, BOX); ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Draw one cat with its feet at (x, y). face 1 looks right, -1 left. key tells two cats of one kind apart (defaults to catId).
// All timing is derived from t (seconds, any clock that only moves forward), so callers need no extra state.
export function drawWalkCat(ctx, catId, pose, x, y, face, t, reduced, key) {
  if (!CAT_BY_ID[catId] || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const tt = fin(t), k = key || catId, red = !!reduced;
  const prev = anims.get(k);
  const dt = prev && Number.isFinite(prev.t) ? tt - prev.t : 0;
  const look = animateCat(anims, k, { pose, x, y, face, reduced: red, t: tt }, dt > 0 ? dt : 0);
  const A = anims.get(k); if (A) A.t = tt;
  const d = CAT_BY_ID[catId], L = bake(catId), s = WALK_CAT_SIZE / BOX, fd = look.fd;
  // dust puffs and the ground contact shadow (the world draws its own shadow while the cat is in the air)
  if (look.dust && look.dust.length) {
    ctx.save();
    for (const p of look.dust) { ctx.globalAlpha = 0.5 * Math.max(0, p.life / (p.life0 || p.life)); ctx.fillStyle = '#e9e0cc'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * s, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (look.grounded) {
    const lift = Math.max(0, look.bob);
    ctx.save(); ctx.globalAlpha = 0.3 - lift * 0.02; ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.ellipse(x - look.tilt * fd * 6, y + 1, 25 * look.sx * look.turn * (1 - lift * 0.03), 5.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y - look.bob);
  ctx.rotate(look.tilt * fd);
  ctx.scale(look.sx * look.turn, look.sy);
  // the art has its tail on the right; looking right puts the tail behind, on the left
  ctx.scale(-fd * s, s);
  ctx.translate(-BOX / 2, -FEET_Y);
  const fur = (L && L.fur) || d.art.fur;
  if (L) {
    tailLayer(ctx, L.tail, look.tail);
    ctx.drawImage(L.torso, 0, 0, BOX, BOX);
  } else {   // no canvas support (a headless test): draw straight into the context
    ctx.save(); ctx.translate(TAIL_ROOT[0], TAIL_ROOT[1]); ctx.rotate(-look.tail[0] - look.tail[1]); ctx.translate(-TAIL_ROOT[0], -TAIL_ROOT[1]);
    try { drawCat(ctx, d, 'open', { part: 'tail' }); } catch (e) { /* ignore */ }
    ctx.restore();
    try { drawCat(ctx, d, 'open', { part: 'torso', noFeet: true }); } catch (e) { /* ignore */ }
  }
  // the two hind feet are live: they swing with the stride and lift off the ground one at a time
  if (!(L ? L.ghost : d.id === 'boo')) {
    for (let i = 0; i < 2; i++) {
      const lift = i === 0 ? look.pawL : look.pawR, sw = Math.sin((look.phase + i * 0.5) * TAU) * look.swing;
      const px = (i === 0 ? 46 : 74) - sw * 4.5, py = 105.4 - lift * 5;
      ctx.beginPath(); ctx.ellipse(px, py, 8.5, 4.6 - lift * 0.8, 0, 0, TAU);
      ctx.fillStyle = fur; ctx.fill(); ctx.strokeStyle = 'rgba(42,24,64,.8)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
  // head: ears, head and face move as one, a neck pivot at the chest
  ctx.save();
  ctx.translate(look.headX, look.headY);
  ctx.translate(60, 80); ctx.rotate(look.headRot); ctx.translate(-60, -80);
  if (L) {
    for (let i = 0; i < 2; i++) {
      const e = i === 0 ? look.earL : look.earR, p = EAR_PIVOT[i];
      ctx.save(); ctx.beginPath(); ctx.rect(i === 0 ? 0 : 60, 0, 60, 90); ctx.clip();
      ctx.translate(p[0], p[1]); ctx.rotate((i === 0 ? -1 : 1) * 0.32 * clamp(e, -1, 1)); ctx.translate(-p[0], -p[1]);
      ctx.drawImage(L.ears, 0, 0, BOX, BOX); ctx.restore();   // the ears layer holds both; the clip keeps one ear
    }
    ctx.drawImage(L.head, 0, 0, BOX, BOX);
  } else {
    try { drawCat(ctx, d, 'open', { part: 'ears' }); drawCat(ctx, d, 'open', { part: 'head' }); } catch (e) { /* ignore */ }
  }
  if (look.blink > 0.05) {   // eyelids: fur coloured lids slide down over the open eyes
    const b = clamp(look.blink, 0, 1);
    for (const ex of [46, 74]) {
      ctx.save(); ctx.beginPath(); ctx.rect(ex - 9, 48, 18, 10 + 20 * b); ctx.clip();
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(ex, 59, 8.6, 10.4, 0, 0, TAU); ctx.fill(); ctx.restore();
      if (b > 0.6) { ctx.strokeStyle = '#2a1840'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - 6.4, 58.6); ctx.quadraticCurveTo(ex, 63.4, ex + 6.4, 58.6); ctx.stroke(); }
    }
  }
  ctx.restore();
  ctx.restore();
  if (look.zzz && !red) {   // a few Zs drift up from the sleeping cat
    ctx.save(); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(42,24,64,.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const u = (look.zzzT + i / 3) % 1, a = Math.sin(u * Math.PI);
      ctx.globalAlpha = a; ctx.font = 'bold ' + Math.round(8 + 5 * u) + 'px sans-serif';
      ctx.strokeText('z', x + fd * (12 + u * 10), y - 62 - u * 24); ctx.fillText('z', x + fd * (12 + u * 10), y - 62 - u * 24);
    }
    ctx.restore();
  }
}
