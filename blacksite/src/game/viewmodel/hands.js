// Gloved hands and forearms.
//
// A first-person weapon with no hands is a floating prop, and the eye spots it
// instantly — not because it notices the missing hands, but because nothing is
// holding the thing up. Hands do not need to articulate to fix that; they need
// to be *in contact*. A finger that intersects the handguard by two millimetres
// reads as grip. A finger hovering two millimetres off it reads as a bug. So
// everything here is built slightly oversized and pressed into the surface.
//
// Local frame for a hand: the gripped cylinder runs along +Y with the wrist at
// the +Y end, the palm sits on the +X side facing inward, and the fingers wrap
// around through -Z while the thumb comes back over +Z to meet them. Placing a
// hand is then one quaternion that maps +Y onto the grip axis and +X onto
// whichever side of the weapon the palm belongs.

import * as THREE from 'three';
import { roundRectPts, sweep, frameChain, tubeCurve, latheZ, partBin } from './geometry.js';

const GLOVE = 0x33383a;      // dark nomex, slightly cool
const GLOVE_HI = 0x474d50;   // the knuckle and finger crowns catch light
const CUFF = 0x23282a;
const SLEEVE = 0x4c4636;     // fatigue tan, desaturated

// A finger is a tube through three control points on a circle around the grip.
// Real fingers are not circular arcs, so the middle point is pushed slightly
// off the arc — that tiny break is what makes the knuckle read.
function fingerPts(R, y, a0, a1, drop) {
  const p = [];
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    // Radius pinches in toward the tip so the fingertip presses on the grip
    // rather than floating off it.
    const r = R * (1 - 0.10 * t * t) + (t > 0 && t < 1 ? 0.0016 : 0);
    p.push([Math.cos(a) * r, y - drop * t, Math.sin(a) * r]);
  }
  return p;
}

export function buildHand(mats, opt = {}) {
  const gr = opt.gripR === undefined ? 0.019 : opt.gripR;   // radius of what is being held
  const mirror = opt.mirror ? -1 : 1;                        // -1 flips to the other hand
  const fr = opt.fingerR === undefined ? 0.0082 : opt.fingerR;
  const spread = opt.spread === undefined ? 0.0215 : opt.spread;  // finger pitch along the grip
  const bin = partBin();
  const add = (g, hex, o) => bin.add('glove', g, hex, Object.assign({ wear: 0.18, ao: 0.4, grain: 0.05 }, o));

  const R = gr + fr * 0.72;

  // ── palm ──────────────────────────────────────────────────────────────────
  // A wedge rather than a slab: the heel of the hand is thicker than the top of
  // the palm, and that taper is most of what stops a hand looking like a mitten.
  const palmProf = roundRectPts(0.030, 0.056, 0.011, 3);
  const palmFrames = frameChain([
    [gr + 0.001, -0.040, 0], [gr + 0.006, -0.012, 0.0015], [gr + 0.008, 0.018, 0.001], [gr + 0.006, 0.040, -0.002],
  ], [0, 0, 1]);
  palmFrames[0].sx = 0.62; palmFrames[0].sy = 0.80;
  palmFrames[1].sx = 1.00; palmFrames[1].sy = 1.00;
  palmFrames[2].sx = 0.98; palmFrames[2].sy = 0.94;
  palmFrames[3].sx = 0.74; palmFrames[3].sy = 0.72;
  add(sweep(palmProf, palmFrames), GLOVE);

  // Knuckle ridge — the row of four bumps across the back of the hand.
  for (let i = 0; i < 4; i++) {
    const y = 0.030 - i * spread;
    const k = new THREE.SphereGeometry(fr * 0.92, 7, 5);
    k.scale(1.05, 0.85, 1.15);
    k.translate(Math.cos(-0.30) * (R + 0.0035), y, Math.sin(-0.30) * (R + 0.0035) * mirror);
    add(k, GLOVE_HI, { ao: 0.25 });
  }

  // ── fingers ───────────────────────────────────────────────────────────────
  // They wrap from just past the palm round the far side. The index sits
  // highest and curls least, the little finger lowest and tightest, which is
  // how a hand actually closes.
  const a0 = -0.34, wrap = opt.wrap === undefined ? 2.05 : opt.wrap;
  for (let i = 0; i < 4; i++) {
    if (i === 0 && opt.index) continue;      // the trigger hand routes its index elsewhere
    const y = 0.030 - i * spread;
    const t = i / 3;
    const w = wrap * (0.92 + t * 0.20);
    const pts = fingerPts(R, y, a0 * mirror, (a0 - w) * mirror, 0.004 + t * 0.004)
      .map((p) => [p[0], p[1], p[2] * mirror]);
    add(tubeCurve(pts, fr * (1 - t * 0.13), 9, 6, 0.80), i ? GLOVE : GLOVE_HI, { ao: 0.3 });
  }

  // The trigger finger, when the caller supplies a target: it leaves the palm
  // and runs forward to the trigger face instead of closing on the grip.
  if (opt.index) {
    const y = 0.030;
    const start = [Math.cos(a0 * mirror) * R, y, Math.sin(a0 * mirror) * R * mirror];
    const pts = [start].concat(opt.index);
    add(tubeCurve(pts, fr * 0.98, 10, 6, 0.84), GLOVE_HI, { ao: 0.28 });
  }

  // ── thumb ─────────────────────────────────────────────────────────────────
  // Thicker, two joints, coming back over the top from the palm side to meet
  // the index. Without it the hand silhouette is a claw.
  const th = opt.thumb || [
    [Math.cos(0.55) * (R + 0.002), 0.040, Math.sin(0.55) * (R + 0.002) * mirror],
    [Math.cos(0.95) * (R + 0.010), 0.028, Math.sin(0.95) * (R + 0.010) * mirror],
    [Math.cos(1.55) * (R + 0.008), 0.016, Math.sin(1.55) * (R + 0.008) * mirror],
    [Math.cos(2.05) * (R + 0.002), 0.010, Math.sin(2.05) * (R + 0.002) * mirror],
  ];
  add(tubeCurve(th, fr * 1.18, 10, 6, 0.78), GLOVE, { ao: 0.3 });

  // ── wrist and forearm ─────────────────────────────────────────────────────
  // The arm leaves the frame rather than ending, so it is swept out past where
  // the near plane will cut it. A forearm that stops in mid-air is worse than
  // no forearm at all.
  if (opt.arm !== false) {
    // The forearm leaves the *heel* of the hand and runs roughly along the palm
    // normal, not along the row of fingers — a wrist is perpendicular to the
    // thing it is gripping. Getting that backwards sends the arm straight up
    // the barrel, which is exactly what it looks like.
    const dir = opt.armDir || [0.85, -0.55, 0.10];
    const L = opt.armLen === undefined ? 0.24 : opt.armLen;
    const w0 = opt.wristY === undefined ? -0.006 : opt.wristY;
    const path = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      // A slight outward bow: forearms are not straight tubes, and the bow
      // makes the arm look attached to a shoulder that exists off-screen.
      // The arm always leaves from the palm side (+x); only the wrap axis
      // mirrors, or the left arm would be routed straight through the grip.
      const bow = Math.sin(t * Math.PI) * 0.010;
      path.push([
        (gr + 0.006) + dir[0] * L * t + bow,
        w0 + dir[1] * L * t,
        dir[2] * L * t * mirror,
      ]);
    }
    const frames = frameChain(path, [0, 0, 1]);
    const prof = roundRectPts(0.052, 0.044, 0.016, 3);
    const s = [0.62, 0.70, 0.86, 1.0, 1.12, 1.22];
    frames.forEach((f, i) => { f.sx = s[i]; f.sy = s[i] * 0.96; });
    add(sweep(prof, frames), SLEEVE, { wear: 0.10, ao: 0.5, grain: 0.09 });

    // Glove cuff: the hard edge where nomex meets sleeve. It is a 6 mm ring and
    // it does more for readability than the whole forearm behind it.
    const cuff = latheZ([[0.0, 0], [0.0245, 0], [0.0265, 0.006], [0.0265, 0.020], [0.0245, 0.026], [0, 0.026]], 14);
    cuff.translate(0, 0, 0.013);
    // Point the ring down the arm rather than down the bore.
    {
      const d = new THREE.Vector3(dir[0], dir[1], dir[2] * mirror).normalize();
      const m = new THREE.Matrix4();
      const z = d.clone().negate();
      const x = new THREE.Vector3(0, 1, 0).cross(z);
      if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
      x.normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      m.makeBasis(x, y, z);
      cuff.applyMatrix4(m);
    }
    cuff.translate((gr + 0.006) + dir[0] * L * 0.11, w0 + dir[1] * L * 0.11, dir[2] * L * 0.11 * mirror);
    add(cuff, CUFF, { round: true, wear: 0.2, ao: 0.35 });
  }

  const g = new THREE.Group();
  for (const [, geo] of bin.bake()) {
    const m = new THREE.Mesh(geo, mats.glove);
    m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
    g.add(m);
  }
  return g;
}

// Place a hand so that its grip axis lies along `axis` and its palm faces
// `palmDir`, both given in weapon space. Returns the group, positioned.
const _y = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function placeHand(group, pos, axis, palmDir) {
  _y.set(axis[0], axis[1], axis[2]).normalize();
  _x.set(palmDir[0], palmDir[1], palmDir[2]);
  _x.addScaledVector(_y, -_x.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  group.quaternion.setFromRotationMatrix(_m);
  group.position.set(pos[0], pos[1], pos[2]);
  return group;
}
