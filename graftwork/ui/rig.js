// RIG: a tiny 2D skeletal runtime for layered characters (design/ART_MODULAR.md "Character animation", option A).
// A character is a set of separate PARTS (head, torso, arms, legs, feet, weapon) on one skeleton; the game poses the skeleton with a real step
// cycle, so feet alternate by construction (one foot forward, then the other) and no walk frames have to be generated. Pure math plus one draw
// function; parts come from a callback so the art can arrive later (assets/ui/manifest.json icons or an atlas) and a procedural placeholder draws today.
//
//   walkPhase(distance, stride)        steps walked (a plant at every integer), like assets.walkIndex's ph
//   leadFoot(ph)                       'L' | 'R': the foot that is forward at the last contact (alternates every step, L first)
//   walkPose(ph, o?)                   { legL, legR, kneeL, kneeR, armL, armR, bob, lean, lead }  angles in radians, + = forward (toward +x, the facing side)
//   solveRig(rig, pose, x, y, s, flip) [{ name, x, y, rot, part }] in draw order (world positions of every bone origin)
//   drawRig(ctx, rig, pose, x, y, o)   draws parts via o.part(name) -> { img, sx,sy,sw,sh, px,py, w,h } | null, else the procedural placeholder
// Positions are in rig units (about 64 tall); o.scale maps them to pixels. x,y is the point between the feet on the ground.
// The PAINTED rigs (real parts from assets/rigs, the walk the Ward previews) are the second half of this file.
import { clamp, EASE } from './core.js';
export const HUMANOID = {
  id: 'humanoid', height: 64,
  // name, parent, local offset from the parent's origin (pivot), length used by the placeholder, draw order z (low = behind)
  // SIDE NAMES: the bone ids below are by SCREEN side (L = the bone on the left of the screen, R = on the right). The figure is seen from the front, so the
  // character's own right side is on the screen's LEFT: everything a person reads (labels, readouts) goes through `sideName`, which swaps L and R.
  // LAYERS: the bone ids named L (screen-left, the character's RIGHT leg and arm) are the NEAR side (in front of the body), the right ones the far side (behind it). Layers only: positions are unchanged.
  bones: [
    { n: 'hips', p: null, x: 0, y: -30, len: 0, z: 5 },
    { n: 'torso', p: 'hips', x: 0, y: 0, len: -20, z: 5 },
    { n: 'head', p: 'torso', x: 0, y: -20, len: -12, z: 7 },
    { n: 'armL_up', p: 'torso', x: -8, y: -18, len: 11, z: 8 }, { n: 'armL_lo', p: 'armL_up', x: 0, y: 11, len: 10, z: 8 }, { n: 'handL', p: 'armL_lo', x: 0, y: 10, len: 4, z: 8 },
    { n: 'armR_up', p: 'torso', x: 8, y: -18, len: 11, z: 2 }, { n: 'armR_lo', p: 'armR_up', x: 0, y: 11, len: 10, z: 2 }, { n: 'handR', p: 'armR_lo', x: 0, y: 10, len: 4, z: 2 },
    { n: 'weapon', p: 'handL', x: 0, y: 2, len: 14, z: 9 }, // the weapon is in the character's RIGHT hand: the bone on the screen-left side (see SIDE NAMES below), in front, with the near arm
    { n: 'legL_up', p: 'hips', x: -4, y: 0, len: 15, z: 6 }, { n: 'legL_lo', p: 'legL_up', x: 0, y: 15, len: 13, z: 6 }, { n: 'footL', p: 'legL_lo', x: 0, y: 13, len: 3, z: 6 },
    { n: 'legR_up', p: 'hips', x: 4, y: 0, len: 15, z: 1 }, { n: 'legR_lo', p: 'legR_up', x: 0, y: 15, len: 13, z: 1 }, { n: 'footR', p: 'legR_lo', x: 0, y: 13, len: 3, z: 1 },
  ],
};

// What to SHOW for a bone id side: the character's own side (the screen-left bone is the character's right one).
export const sideName = (s) => (s === 'L' ? 'R' : s === 'R' ? 'L' : s);
export const walkPhase = (distance, stride) => (stride > 0 ? Math.max(0, distance) / stride : 0);
export const leadFoot = (ph) => (Math.floor(Math.max(0, ph) + 1e-9) % 2 === 0 ? 'L' : 'R');

// One step = contact (leading leg forward, body lowest), down, passing (legs together, body highest), up. The cycle is two steps.
export function walkPose(ph, o = {}) {
  const A = o.swing === undefined ? 0.55 : o.swing, K = o.knee === undefined ? 0.9 : o.knee, B = o.bob === undefined ? 2 : o.bob, AR = o.arms === undefined ? 0.5 : o.arms;
  const c = Math.cos(Math.PI * ph), s = Math.sin(Math.PI * ph);
  return {
    legL: A * c, legR: -A * c,
    kneeL: K * Math.max(0, -s), kneeR: K * Math.max(0, s), // the leg that swings forward folds its knee
    armL: -AR * c, armR: AR * c, // arms counter-swing: the arm opposite the forward leg goes forward
    bob: -B * (1 - Math.abs(c)), lean: 0.05 * s * (o.lean === undefined ? 1 : o.lean), lead: leadFoot(ph),
  };
}
export const IDLE_POSE = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0.05, armR: -0.05, bob: 0, lean: 0, lead: 'L' };

// local angle of each bone (canvas rotation: positive = clockwise, so a hanging limb swung FORWARD (+x) uses -angle)
function localAngle(name, P) {
  switch (name) {
    case 'torso': return P.lean;
    case 'armL_up': return -P.armL; case 'armR_up': return -P.armR;
    case 'armL_lo': return -Math.abs(P.armL) * 0.5 - 0.1; case 'armR_lo': return -Math.abs(P.armR) * 0.5 - 0.1;
    case 'legL_up': return -P.legL; case 'legR_up': return -P.legR;
    case 'legL_lo': return P.kneeL; case 'legR_lo': return P.kneeR; // the shin folds backward
    case 'footL': return -P.kneeL * 0.4 + P.legL * 0.5; case 'footR': return -P.kneeR * 0.4 + P.legR * 0.5; // keep the sole roughly flat
    default: return 0;
  }
}
export function solveRig(rig, P, x = 0, y = 0, s = 1, flip = false) {
  const W = {}, out = [], fx = flip ? -1 : 1;
  for (const b of rig.bones) {
    const par = b.p ? W[b.p] : null, la = localAngle(b.n, P) * fx;
    let wx, wy, rot;
    if (!par) { wx = x + b.x * s * fx; wy = y + (b.y + P.bob) * s; rot = 0; } else {
      const cs = Math.cos(par.rot), sn = Math.sin(par.rot), ox = b.x * fx;
      wx = par.x + (ox * cs - b.y * sn) * s; wy = par.y + (ox * sn + b.y * cs) * s; rot = par.rot + la;
    }
    W[b.n] = { name: b.n, x: wx, y: wy, rot, z: b.z, len: b.len };
  }
  for (const b of rig.bones) out.push(W[b.n]);
  return out.sort((a, b) => a.z - b.z);
}
// procedural placeholder: capsules in the hospital palette, so the rig is testable before any part art exists (never shipped as art)
export function drawRig(ctx, rig, P, x, y, o = {}) {
  const s = o.scale || 1, bones = solveRig(rig, P, x, y, s, !!o.flip), col = o.color || '#8a7a60', ink = '#2b1e1a';
  for (const b of bones) {
    const part = o.part ? o.part(b.name) : null;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    if (part && part.img) {
      ctx.drawImage(part.img, part.sx || 0, part.sy || 0, part.sw || part.img.width, part.sh || part.img.height, -(part.px || 0) * s, -(part.py || 0) * s, (part.w || part.sw) * s, (part.h || part.sh) * s);
    } else if (b.len) {
      const L = b.len * s, w = Math.max(2.5, Math.abs(b.len) * 0.28) * s;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineTo(w * 0.8, L); ctx.lineTo(-w * 0.8, L); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = ink; ctx.stroke();
    }
    ctx.restore();
  }
  return bones;
}

// ================================================================ PAINTED RIGS (assets/rigs/manifest.json, built by tools/graftwork_rig_build.py)
// A painted rig is a paper doll laid over the standing sprite: parts (atlas rect, pivot) hung on the humanoid bones above, listed back to front.
// Units are canvas px of the standing sprite (256 x 256, figure about 225 tall). Everything here is pure math plus one draw function.
//
//   makeRig(id, entry)             the runtime rig of a manifest entry: bone tree, parts in draw order, leg lengths, soles, stride, gait feel
//   poseRig(rig, st)               st = { ph, w, t, ux, uy, calm }: steps walked, walk weight 0..1, idle clock, heading in the figure's own frame.
//                                  Fills every bone and part matrix (figure space) and rig.info { plantL, plantR, lead, down }
//   footContact(rig, side, out)    where the sole of a foot touches the floor, read back from the solved matrices (what is drawn)
//   rigPlace(rig, x, y, s, flip)   the matrix that stands the figure on a floor point (mirroring is a negative x scale, nothing else)
//   drawRigged(g, rig, img, o)     contact shadows, then the parts back to front, in figure space (the caller sets the placement)
//
// THE WALK (design/ANIMATOR_GUIDE.md): the cycle is two steps. Each foot has a target on the floor: during its stance the target moves back exactly as
// fast as the body moves forward (along the real heading, both screen axes), so a planted foot stands still in the world by construction; in its
// swing it eases forward on an arc. The hip, knee and ankle are solved from the target (two-bone IK, knee forward); a leg that cannot reach stretches a
// little along its bones (hidden under the garment), never slides. The boot rolls: heel first, flat, then over the toe, about the edge that is on
// the floor. Body lowest just after contact, highest at passing; arms swing against the legs; cloth, hair and the prop follow a beat late.
// DEPTH: the Ward walks its diamond floor, so the heading has a screen-y part. A foot planted on that floor would travel as far up and down the screen as
// the floor does, and a flat painted leg would have to grow and fold by a tenth of the figure's height on every step (it cannot foreshorten). RIG_TUNE.depth
// is how much of the floor's screen-y travel the feet follow: 1 = exact on every heading (the solver is exact, the test proves it), 0 = level feet like the
// puppet. Along the screen x a planted foot is always exact.
// LAYERS: parts are drawn in manifest order: far arm, far leg, torso, near leg, the garment over both thighs, head, prop, near arm.
export const RIG_TUNE = { stride: 0.4, swing: 0.62, duty: 0.58, lift: 0.06, bob: 0.02, sway: 0.008, lean: 0.04, twist: 2.2, arms: 0.4, hem: 1, hemLag: 0.16, thigh: 1.5, bare: 1.12, shin: 1.06, flat: 0.14, roll: 0.6, depth: 0.5 };
const FEEL = { strideK: 1, duty: 0, lift: 1, bob: 1, sway: 1, lean: 1, arms: 1, hem: 1, head: 1 }; // per character multipliers (data/gaits.js RIG_GAITS)
const PI2 = Math.PI * 2, frac = (v) => v - Math.floor(v);
const M6 = () => { const m = new Float64Array(6); m[0] = m[3] = 1; return m; };
const mT = (o, m, x, y) => { o[4] = m[0] * x + m[2] * y + m[4]; o[5] = m[1] * x + m[3] * y + m[5]; o[0] = m[0]; o[1] = m[1]; o[2] = m[2]; o[3] = m[3]; return o; }; // o = m . translate
const mMul = (o, m, a, b, c, d) => { const a0 = m[0], b0 = m[1], c0 = m[2], d0 = m[3]; o[0] = a0 * a + c0 * b; o[1] = b0 * a + d0 * b; o[2] = a0 * c + c0 * d; o[3] = b0 * c + d0 * d; o[4] = m[4]; o[5] = m[5]; return o; }; // o = m . [a c; b d]
const mR = (o, m, r) => { const c = Math.cos(r), s = Math.sin(r); return mMul(o, m, c, s, -s, c); };
const mAt = (o, x, y, r) => { const c = Math.cos(r), s = Math.sin(r); o[0] = c; o[1] = s; o[2] = -s; o[3] = c; o[4] = x; o[5] = y; return o; };
// stretch by k along the direction (ux, uy) of the bone's own frame (the IK reach): I + (k - 1) u u^T
const mStretch = (o, m, ux, uy, k) => (k === 1 ? o : mMul(o, m, 1 + (k - 1) * ux * ux, (k - 1) * ux * uy, (k - 1) * ux * uy, 1 + (k - 1) * uy * uy));

export function makeRig(id, e) {
  const B = {}, bones = e.bones.map((b) => (B[b.n] = { n: b.n, p: b.p, x: b.x, y: b.y, empty: !!b.empty, m: M6() }));
  const feel = { ...FEEL, ...rigGait(id) }, H = e.height, rigid = e.rigid || [];
  const leg = (s) => {
    const hip = B['leg' + s + '_up'], kn = B['leg' + s + '_lo'], an = B['foot' + s], f = e.feet[s], one = rigid.includes('leg' + s);
    const d1 = Math.hypot(kn.x - hip.x, kn.y - hip.y), d2 = Math.hypot(an.x - kn.x, an.y - kn.y), d0 = Math.hypot(an.x - hip.x, an.y - hip.y);
    return { s, hip, kn, an, one, l1: one ? d0 : d1, l2: one ? 0 : d2, len: one ? d0 : d1 + d2, r1: Math.atan2(one ? an.y - hip.y : kn.y - hip.y, one ? an.x - hip.x : kn.x - hip.x), r2: Math.atan2(an.y - kn.y, an.x - kn.x),
      heel: f.heel, toe: f.toe, sole: f.sole, k1max: (e.garment || []).length ? RIG_TUNE.thigh : RIG_TUNE.bare, k2max: an.empty ? 1 : RIG_TUNE.shin, dz: an.empty ? 0 : RIG_TUNE.flat, sb: one ? hip : an.empty ? kn : an, phi: 0, k1: 1, k2: 1, slip: 0, lift: 0, off: 0, plant: true, cx: 0, cy: 0 };
  };
  const legs = { L: leg('L'), R: leg('R') }, T = RIG_TUNE, stiff = {}; for (const n of rigid) stiff[n] = true;
  const duty = clamp(T.duty + feel.duty, 0.52, 0.7);
  // the step the legs can take: a swing of about 38 degrees of the shorter leg (hip to sole), never more than the tune asks (figure heights)
  const stride = clamp(Math.min(T.stride * feel.strideK, T.swing * Math.min(legs.L.len + legs.L.sole, legs.R.len + legs.R.sole) / (duty * H)), 0.2, 0.5);
  const arms = e.arms || {}, prop = e.prop || null;
  const parts = e.parts.map((p) => { const b = B[p.bone] || null; return { n: p.n, bone: b, sx: p.rect[0], sy: p.rect[1], w: p.rect[2], h: p.rect[3], px: p.px, py: p.py, ox: p.x - (b ? b.x : 0), oy: p.y - (b ? b.y : 0), hem: p.hem, lag: p.lag || 0, upright: !!p.upright, hx: 0, hs: 1, m: M6() }; });
  return { id, H, w: e.w, foot: e.foot, bones, B, parts, legs, stiff, feel, duty, stride, arms: { L: arms.L === undefined ? 1 : arms.L, R: arms.R === undefined ? 1 : arms.R }, prop,
    root: M6(), info: { plantL: true, plantR: true, plant: 'LR', lead: 'L', down: 0, sway: 0, lean: 0, stretch: 1, thigh: 1, slip: 0 } };
}
// along-track offset of a foot over its own cycle f (0 = contact): stance moves back at exactly the body's speed, swing eases forward
const footS = (f, a, B) => (f < B ? a * (1 - 2 * f / B) : -a + 2 * a * EASE.inOut((f - B) / (1 - B)));
const footUp = (f, B, lift) => (f < B ? 0 : lift * Math.pow(Math.sin(Math.PI * (f - B) / (1 - B)), 0.85));
// one leg: the ankle target (floor point + the roll of the boot about its heel or toe), then hip, knee and ankle from it.
// Reach: a target the leg cannot reach is met by STRETCH, never by sliding the foot. The thigh takes it first: under a garment it is hidden, so it may
// grow a lot (k1max) and the leg simply comes out further from under the hem; the shin (visible) only a little (shin); what is still missing moves the
// hidden hip (slip). Heading down the screen asks for a longer leg, up the screen a shorter one: that is the isometric foreshortening of a planted
// foot, and the knee bends for the short one.
// A ONE-BONE leg (thigh, shin and boot painted as one piece) turns and stretches as a whole about the hip so that the edge of its sole that is on the
// floor lands on its floor point: toe while it leans back, heel while it leans forward. Tight limits (it carries the boot), the hip takes the rest.
function solveLeg(rig, L, hx, hy, bx, by, lift) {
  const T = RIG_TUNE, dz = L.dz; let phi = L.phi, th1 = 0, th2 = 0, k1 = 1, ax = 0, ay = 0, slip = 0;
  L.lift = lift; L.cx = bx; L.cy = by;
  if (L.one) {
    const vy = L.an.y - L.hip.y + L.sole, fy = by - lift + L.sole - hy, vh = L.an.x - L.hip.x + L.heel, vt = L.an.x - L.hip.x + L.toe;
    const tH = Math.atan2(fy, bx + L.heel - hx) - Math.atan2(vy, vh), tT = Math.atan2(fy, bx + L.toe - hx) - Math.atan2(vy, vt), toe = tH + tT > 0;
    const vx = toe ? vt : vh, fx = bx + (toe ? L.toe : L.heel) - hx, d = Math.hypot(fx, fy) || 1e-6, v = Math.hypot(vx, vy) || 1e-6;
    th1 = toe ? tT : tH; k1 = clamp(d / v, 0.82, T.shin + 0.06); slip = d - v * k1;
    L.phi = toe ? Math.max(th1, 1e-9) : Math.min(th1, 0); L.k1 = k1; L.k2 = k1; L.slip = Math.abs(slip);
    mStretch(L.hip.m, mAt(L.hip.m, hx + fx / d * slip, hy + fy / d * slip, th1), vx / v, vy / v, k1);
    mT(L.kn.m, L.hip.m, L.kn.x - L.hip.x, L.kn.y - L.hip.y); mT(L.an.m, L.hip.m, L.an.x - L.hip.x, L.an.y - L.hip.y);
    return;
  }
  if (!dz) { // the boot is painted on the shin: knee to sole edge is one rigid piece, so the floor point itself is the target (toe edge while it leans back, else heel)
    const wy = L.an.y - L.kn.y + L.sole, fy = by - lift + L.sole, rH = ik2(L, hx, hy, bx + L.heel, fy, Math.hypot(L.an.x - L.kn.x + L.heel, wy), IKH), rT = ik2(L, hx, hy, bx + L.toe, fy, Math.hypot(L.an.x - L.kn.x + L.toe, wy), IKT);
    const tH = rH.a2 - Math.atan2(wy, L.an.x - L.kn.x + L.heel), tT = rT.a2 - Math.atan2(wy, L.an.x - L.kn.x + L.toe), toe = tH + tT > 0, r = toe ? rT : rH;
    th2 = toe ? tT : tH; L.phi = toe ? Math.max(th2, 1e-9) : Math.min(th2, 0); L.k1 = r.k1; L.k2 = 1; L.slip = r.slip;
    mStretch(L.hip.m, mAt(L.hip.m, r.px, r.py, r.a1 - L.r1), Math.cos(L.r1), Math.sin(L.r1), r.k1);
    mAt(L.kn.m, r.kx, r.ky, th2); mT(L.an.m, L.kn.m, L.an.x - L.kn.x, L.an.y - L.kn.y);
    return;
  }
  let r = IKH;
  for (let it = 0; it < 3; it++) {
    // the boot turned by phi about the edge that stays on the floor: toe when the heel is up (phi > 0), heel when the toes are up
    const px = phi > 0 ? L.toe : L.heel, c = Math.cos(phi), s = Math.sin(phi);
    ax = bx + px - (px * c - L.sole * s); ay = by - lift + L.sole - (px * s + L.sole * c);
    r = ik2(L, hx, hy, ax, ay, L.l2, IKH); th2 = r.a2 - L.r2;
    if (it < 2) phi = clamp(th2 - clamp(th2, -dz, dz), -T.roll, T.roll); // the ankle keeps the boot flat for small tilts, then it rolls with the shin (never past `roll`)
  }
  L.phi = phi; L.k1 = r.k1; L.k2 = r.k2; L.slip = r.slip;
  mStretch(L.hip.m, mAt(L.hip.m, r.px, r.py, r.a1 - L.r1), Math.cos(L.r1), Math.sin(L.r1), r.k1);
  mStretch(L.kn.m, mAt(L.kn.m, r.kx, r.ky, th2), Math.cos(L.r2), Math.sin(L.r2), r.k2); mAt(L.an.m, ax, ay, phi);
}
// two-bone reach from the hip (hx, hy) to a target with lower length l2: stretch (thigh first, then shin), what is left moves the hidden hip; the knee points forward.
// -> o { px, py (the hip used), kx, ky (knee), a1, a2 (the directions of thigh and shin), k1, k2, slip }
const IKH = { px: 0, py: 0, kx: 0, ky: 0, a1: 0, a2: 0, k1: 1, k2: 1, slip: 0 }, IKT = { ...IKH };
function ik2(L, hx, hy, tx, ty, l2, o) {
  let dx = tx - hx, dy = ty - hy, d = Math.hypot(dx, dy) || 1e-6, l1 = L.l1;
  o.k1 = clamp((d - l2) / l1, 1, L.k1max); l1 *= o.k1; o.k2 = clamp((d - l1) / l2, 1, L.k2max); l2 *= o.k2; o.slip = Math.max(0, d - l1 - l2);
  o.px = hx + dx / d * o.slip; o.py = hy + dy / d * o.slip; dx = tx - o.px; dy = ty - o.py; d = Math.hypot(dx, dy) || 1e-6;
  const base = Math.atan2(dy, dx), al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), a1 = base - al, a2 = base + al;
  o.a1 = Math.cos(a1) >= Math.cos(a2) ? a1 : a2; o.kx = o.px + Math.cos(o.a1) * l1; o.ky = o.py + Math.sin(o.a1) * l1; o.a2 = Math.atan2(ty - o.ky, tx - o.kx);
  return o;
}
const ST0 = { ph: 0, w: 0, t: 0, ux: 1, uy: 0, calm: true };
export function poseRig(rig, st = ST0) {
  const T = RIG_TUNE, F = rig.feel, B = rig.B, H = rig.H, I = rig.info, ph = st.ph > 0 ? st.ph : 0, w = clamp(st.w || 0, 0, 1), idle = st.calm ? 0 : 1 - w, t = st.t || 0;
  let ux = st.ux === undefined ? 1 : st.ux, uy = st.uy || 0; const un = Math.hypot(ux, uy); if (un > 1e-6) { ux /= un; uy /= un; } else { ux = 1; uy = 0; }
  const D = rig.duty, S = rig.stride * H, a = D * S, spread = EASE.inOut(clamp((w - 0.2) / 0.6, 0, 1)), fL = frac(ph * 0.5), fR = frac(ph * 0.5 + 0.5), cs = Math.cos(Math.PI * ph);
  const lift = Math.min(T.lift * F.lift * H, 0.5 * Math.min(rig.legs.L.len, rig.legs.R.len));
  // ---- the body: drop (lowest just after contact), sway toward the planted foot, a slow weight shift and breathing at rest
  const down = T.bob * F.bob * H * w * 0.5 * (1 + Math.cos(PI2 * (ph - 0.06))), sway = -T.sway * F.sway * H * w * Math.sin(PI2 * (fL - 0.04));
  const shift = idle * 0.006 * H * Math.sin(t * 0.85), breath = idle * Math.sin(t * 2.1);
  const hips = B.hips, hx = hips.x + sway + shift, hy = hips.y + down + idle * 0.0015 * H * (1 - Math.cos(t * 0.85 * 2));
  mAt(hips.m, hx, hy, 0);
  const lean = T.lean * F.lean * w * (1 + 0.15 * Math.sin(Math.PI * ph)) + idle * 0.008 * Math.sin(t * 0.85 + 0.6), by = 1 + 0.012 * breath; // by: the chest rises as it fills
  const to = B.torso; mAt(to.m, hx + (to.x - hips.x), hy + (to.y - hips.y), lean);
  const onTorso = (b, ex) => { const dx = b.x - to.x + ex, dy = (b.y - to.y) * by; return [to.m[0] * dx + to.m[2] * dy + to.m[4], to.m[1] * dx + to.m[3] * dy + to.m[5]]; };
  const nod = (0.025 * w * Math.sin(PI2 * ph - 1.1) + idle * 0.012 * Math.sin(t * 0.9 + 1)) * F.head, hd = onTorso(B.head, 0);
  mAt(B.head.m, hd[0], hd[1], lean * 0.4 + nod);
  // ---- arms swing against the legs (the arm on the side of the forward leg goes back); the elbow folds more on the way forward
  const tw = T.twist * w * cs;
  for (const s of ['L', 'R']) {
    const up = B['arm' + s + '_up'], lo = B['arm' + s + '_lo'], hand = B['hand' + s], sg = s === 'L' ? 1 : -1, A = T.arms * F.arms * rig.arms[s];
    const sw = A * w * sg * cs + idle * 0.03 * Math.sin(t * 1.1 + (s === 'L' ? 0 : 2)) * rig.arms[s], sh = onTorso(up, -sg * tw);
    const el = rig.stiff['arm' + s] ? 0 : -A * w * (0.25 + 0.15 * (1 - sg * cs)), r1 = lean * 0.5 + sw; // an arm painted in one piece does not fold
    mAt(up.m, sh[0], sh[1], r1); mR(lo.m, mT(lo.m, up.m, lo.x - up.x, lo.y - up.y), el); mT(hand.m, lo.m, hand.x - lo.x, hand.y - lo.y);
  }
  // ---- legs
  let slip = 0, stretch = 1, thigh = 1;
  for (const s of ['L', 'R']) {
    const L = rig.legs[s], f = s === 'L' ? fL : fR, off = footS(f, a, D) * spread, up = footUp(f, D, lift) * w;
    L.off = off; L.plant = f < D;
    // at rest the feet stand where the standing sprite has them; walking, each foot tracks under its own hip (the middle of the sole below the joint)
    const ax0 = L.an.x + spread * (L.hip.x - (L.heel + L.toe) / 2 - L.an.x);
    solveLeg(rig, L, hx + (L.hip.x - hips.x), hy + (L.hip.y - hips.y), ax0 + off * ux, L.an.y + off * uy * T.depth, up);
    if (L.slip > slip) slip = L.slip; if (L.k2 > stretch) stretch = L.k2; if (L.k1 > thigh) thigh = L.k1;
  }
  I.plantL = rig.legs.L.plant; I.plantR = rig.legs.R.plant; I.plant = (I.plantL ? 'L' : '') + (I.plantR ? 'R' : ''); I.lead = leadFoot(ph); I.down = down; I.sway = sway; I.lean = lean; I.stretch = stretch; I.thigh = thigh; I.slip = slip;
  // ---- cloth, hair and the prop: follow-through, a beat behind the legs (ANIMATOR_GUIDE rule 4), small and bounded (rule 15)
  const G = T.hem * F.hem * w * spread, p2 = ph - T.hemLag, f2 = frac(p2 * 0.5), f3 = frac(p2 * 0.5 + 0.5);
  const dr = a > 0 ? clamp((footS(f2, a, D) - footS(f3, a, D)) / (2 * a), -1, 1) : 0, liftN = lift > 0 ? clamp((footUp(f2, D, lift) + footUp(f3, D, lift)) / lift, 0, 1.2) : 0;
  const hemX = G * (-0.04 + 0.13 * dr) * (ux >= 0 ? 1 : -1) + idle * 0.012 * Math.sin(t * 1.1 + 0.4), hemS = 1 - G * 0.045 * liftN;
  const late = Math.cos(Math.PI * (ph - 0.24)) - cs, bounce = w * Math.sin(PI2 * (ph - 0.2)), air = idle * Math.sin(t * 1.3 + 0.7);
  const ph2 = rig.prop ? rig.prop.hand : '', pA = ph2 ? T.arms * F.arms * rig.arms[ph2] * (ph2 === 'L' ? 1 : -1) : 0;
  for (const p of rig.parts) {
    const b = p.bone, m = b ? b.m : rig.root, oy = b === to ? p.oy * by : p.oy;
    if (p.upright) mAt(p.m, m[0] * p.ox + m[2] * oy + m[4], m[1] * p.ox + m[3] * oy + m[5], p.lag * (0.05 * bounce + 0.02 * air)); // a flame, a tray: carried level
    else { mT(p.m, m, p.ox, oy); if (b === to) mMul(p.m, p.m, 1, 0, 0, by); }
    if (p.hem !== undefined) { p.hx = hemX; p.hs = hemS; }
    else if (p.lag && !p.upright) mR(p.m, p.m, p.lag * (rig.prop && rig.prop.part === p.n ? 0.5 * pA * w * late + 0.02 * air : 0.045 * bounce + 0.012 * air));
  }
  return rig;
}
// where a sole meets the floor, read back from the matrix of the bone that carries the sole (the boot, or the shin or the whole leg when the boot is
// painted on it): the toe edge while the heel is up, else the heel edge. During a stance this point stands still in the world; (bx, by) is the floor
// point the pose asked for.
export function footContact(rig, side, out = { x: 0, y: 0, bx: 0, by: 0 }) {
  const L = rig.legs[side], b = L.sb, m = b.m, px = L.phi > 0 ? L.toe : L.heel, lx = L.an.x - b.x + px, ly = L.an.y - b.y + L.sole;
  out.x = m[0] * lx + m[2] * ly + m[4]; out.y = m[1] * lx + m[3] * ly + m[5]; out.bx = L.cx + px; out.by = L.cy + L.sole - L.lift; return out;
}
// stand the figure on a floor point: figure space -> the caller's space. flip mirrors x and nothing else.
export function rigPlace(rig, x, y, s = 1, flip = false, out = M6()) { const f = flip ? -1 : 1; out[0] = s * f; out[1] = 0; out[2] = 0; out[3] = s; out[4] = x - f * s * rig.foot[0]; out[5] = y - s * rig.foot[1]; return out; }
// Draw the posed rig in figure space. img: the decoded atlas (@1x or @2x; rects are in @2x px). o.contact === false leaves the foot shadows out.
export function drawRigged(g, rig, img, o = {}) {
  const k = (img.naturalWidth || img.width || rig.w) / rig.w;
  if (o.contact !== false) for (const s of ['R', 'L']) { // a small dark pool under each sole that fades as the foot leaves the floor: what glues a foot to the ground
    const L = rig.legs[s], al = 0.3 * (1 - clamp(L.lift / (0.05 * rig.H), 0, 1)); if (al <= 0.01) continue;
    const cx = L.cx + (L.heel + L.toe) / 2, cy = L.cy + L.sole - 1, rx = (L.toe - L.heel) * 0.62;
    g.fillStyle = `rgba(0,0,0,${al.toFixed(3)})`; g.beginPath(); g.ellipse(cx, cy, rx, rx * 0.38, 0, 0, PI2); g.fill();
  }
  for (const p of rig.parts) {
    const m = p.m; g.save(); g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    if (p.hem === undefined) g.drawImage(img, p.sx * k, p.sy * k, p.w * k, p.h * k, -p.px, -p.py, p.w, p.h);
    else { // cloth: rigid down to the hem line, below it a shear and a small lift hanging from that line, so no seam can open
      const y0 = Math.round(p.hem * p.h);
      g.drawImage(img, p.sx * k, p.sy * k, p.w * k, (y0 + 1) * k, -p.px, -p.py, p.w, y0 + 1);
      g.transform(1, 0, p.hx, p.hs, -p.px, -p.py + y0); g.drawImage(img, p.sx * k, (p.sy + y0) * k, p.w * k, (p.h - y0) * k, 0, 0, p.w, p.h - y0);
    }
    g.restore();
  }
}
