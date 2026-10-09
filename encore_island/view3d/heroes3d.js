// Encore Island 3D, the cast: hero, companion, fans and the stall keeper (NPC).
//   makeHero(art, opts)  art in jasmin | roxor | rawclaw | andy | jasmin_unicorn | roxor_monster | rawclaw_goat | jordan
//     opts.fan = true builds the cheap crowd version (no textures, boost 0, simple face); opts.tint / opts.acc vary a fan's outfit and accessory.
//     opts.pack = true adds the companion's wooden pack frame (the loot stack is drawn by the shared loot pool, see init()).
//   -> actor { group, update(dt, t, st), height, radius, attack(), die(), isDead(), dispose() }   (see README, actor contract)
//   init(V) syncs S.player / S.comp / S.pop / the stall keeper from the game state every frame (read only).
import * as THREE from 'three';
import { CK, makeJasmin, makeRoxor, STYLE } from '../../encore_island_3d/js/characters.js';
import { bakeActor } from './bake.js';
import { W as WU, softTex, lit, clamp, lerp, damp, hash01, canvasTex as kitCanvasTex } from './kit.js';

const { part, flat, ico, box, cyl, hang, cone, torus, cap, dome, basic, aim, blade, tubeGeo, flameGeo, lockGeo, pleatGeo, geo, makeCtx, makeLife, newState, kidTick, poseArm, setBlinkH, setMouthH, lifeXform,
  buildHero, fitHero, makeHead, patchGeo, decal, cylDecal, decalMat, ctex, ell, star, addHeroFace, addFanFace, eyeJ, paintEyeShutJ, paintEyeR, paintEyeShutR, paintMouthJ, paintMouthR, paintMouthSmile, heroBase, finishHero, makeNotes, SKIN } = CK;

const PI = Math.PI;
const mixHex = (a, b, t) => { const k = new THREE.Color(a).lerp(new THREE.Color(b), t); return k.getHex(); };
const sphX = (rx, ry, rz) => (x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - (y / ry) ** 2)); // z on an ellipse centred at 0
const DEF_ATK = [[-1.55, 0, -0.1, -0.2, 0, 0], [0.6, 0, -0.6, -0.4, 0, 0]];

// generic hero update: kidTick locomotion, then the rig's idle / sing / attack arm poses, extras, notes, shared overlays (cast / cheer / dash / hurt)
function makeUpdate(self, R, S, L, NT, cfg) {
  const c = { R, S, L, t: 0, dt: 0, st: null, amp: 0, ph: 0, s: 0, sg: 0, A: 0, beat: 0, hit: 0, open: 0, wide: 0, shut: 0 };
  return (dt, t, st) => {
    if (L.dead) return;
    dt = Math.min(dt, 0.05); st = st || {};
    L.tick(dt, st); kidTick(R, S, dt, t, st);
    const sg = (S.sing = damp(S.sing, st.singing || st.atk ? 1 : 0, 9, dt)), beat = Math.sin(t * PI * 4), hit = Math.abs(Math.sin(t * PI * 2)), A = L.atkEnv;
    c.t = t; c.dt = dt; c.st = st; c.amp = S.amp; c.ph = S.ph; c.s = S.s; c.sg = sg; c.A = A; c.beat = beat; c.hit = hit; c.open = 0; c.wide = 0; c.shut = 0;
    const ir = cfg.idle(c); poseArm(R.armR, 1, ...ir[0]); poseArm(R.armL, 1, ...ir[1]);
    if (sg > 0.01) {
      if (cfg.sing) { const sr = cfg.sing(c); poseArm(R.armR, sg, ...sr[0]); poseArm(R.armL, sg, ...sr[1]); }
      R.head.rotation.x += sg * (-0.1 + beat * 0.05); R.head.rotation.z += sg * Math.sin(t * PI * 2) * 0.07; R.root.position.y += sg * hit * 0.035; R.body.rotation.x += sg * -0.05; R.body.rotation.z = sg * Math.sin(t * PI * 2) * 0.04;
    }
    if (A > 0) { const a = cfg.atk ? cfg.atk(c) : DEF_ATK; poseArm(R.armR, A, ...a[0]); poseArm(R.armL, A, ...a[1]); R.body.rotation.x += A * 0.28; R.head.rotation.x -= A * 0.12; R.root.position.z = A * 0.28; } else R.root.position.z = 0;
    if (cfg.extra) cfg.extra(c);
    NT.tick(dt, sg > 0.3 && !cfg.noNotes);
    const vowel = 0.72 + 0.28 * Math.sin(t * 3.1);
    finishHero(R, S, L, st, t, dt, Math.max(sg * (0.5 + 0.5 * beat) * vowel, A * 0.9, c.open), Math.max(A * 0.5, c.wide), Math.max(c.shut, sg > 0.7 ? sg * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.8)) : 0), cfg.mouthBase ?? 1.0);
  };
}
// microphone (hand +x is the singing hand in the 2D art)
function addMic(ctx, hand, col = 0x1b1b24, ring = 0xff5fa5, fan) {
  const mic = new THREE.Group(); hand.add(mic);
  part(ctx, mic, hang(0.025, 0.021, 0.2, 6), col, 0, -0.1, 0, 1, 1, 1, { ol: 0.01 });
  part(ctx, mic, ico(1), col, 0, -0.32, 0, 0.056, 0.06, 0.056, { ol: 0.012 });
  if (!fan) { part(ctx, mic, ico(0), 0x70708a, 0, -0.345, 0.035, 0.022, 0.016, 0.014, { ol: false }); part(ctx, mic, torus(0.027, 0.012, 3, 7), ring, 0, -0.1, 0, 1, 1, 1, { rx: PI / 2, ol: false }); }
  return mic;
}
// 5-point star prism, cached
const starGeo = (r, ri, d) => geo(`star${r},${ri},${d}`, () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? ri : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; });
// lofted hair tail made of coloured segments, each a child of the previous one so it can whip (returns the joints, root first)
function makeTail(ctx, parent, cols, len, w0, w1, seg = 7) {
  const joints = [], n = cols.length, prof = (u) => (u < 0.15 ? w0 * (0.55 + u / 0.15 * 0.45) : lerp(w0, w1, (u - 0.15) / 0.85) * (u > 0.85 ? 1 - (u - 0.85) / 0.15 * 0.92 : 1));
  let par = parent, y = 0;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); g.position.y = y; par.add(g); joints.push(g);
    const t0 = i / n, t1 = (i + 1) / n, L = len / n, rings = [];
    for (let k = 0; k <= 2; k++) { const w = prof(lerp(t0, t1, k / 2)); rings.push([-L * k / 2, w * 1.25, w * 0.85, 0]); }
    part(ctx, g, tubeGeo(rings, seg), cols[i], 0, 0, 0, 1, 1, 1, { ol: 0.012 });
    par = g; y = -L;
  }
  return joints;
}
const whip = (joints, ph, a, amp, side = 0) => { for (let i = 0; i < joints.length; i++) { const g = joints[i]; g.rotation.x = a.x * (i + 1) * 0.3 + Math.sin(ph * 2 - i * 0.8) * amp * (0.1 + i * 0.07); g.rotation.z = side + a.z * (i ? 0.5 : 1) + Math.sin(ph - i * 0.7) * amp * (0.12 + i * 0.07); } };

/* ------------------------------------------------------------------ RAWCLAW + GOAT */
// the beat-pad rig on the chest: pad body, 2x3 pads, two dials, shoulder straps
function addBeatPad(ctx, body, y, z, fan, col = 0xe9e7f7) {
  const pad = new THREE.Group(); pad.position.set(0, y, z); pad.rotation.x = -0.12; body.add(pad);
  part(ctx, pad, box(0.27, 0.19, 0.06), col, 0, 0, 0, 1, 1, 1, { ol: 0.01 });
  const cols = [0x7a52e0, 0x9b7bff, 0x7a52e0, 0x9b7bff, 0x7a52e0, 0x6a45d0];
  for (let i = 0; i < (fan ? 4 : 6); i++) part(ctx, pad, box(0.065, 0.05, 0.03), cols[i], -0.075 + (i % 3) * 0.075, 0.03 - Math.floor(i / 3) * 0.062, 0.04, 1, 1, 1, { ol: false });
  if (!fan) for (const sd of [-1, 1]) {
    part(ctx, pad, torus(0.04, 0.016, 4, 10), 0x7a52e0, sd * 0.1, 0.12, 0.02, 1, 1, 1, { ol: 0.008 });
    part(ctx, pad, cyl(0.03, 0.03, 0.03, 8), 0xd9ccff, sd * 0.1, 0.12, 0.03, 1, 1, 1, { rx: PI / 2, ol: false });
    part(ctx, body, box(0.035, 0.3, 0.02), 0x4a3a9a, sd * 0.1, y + 0.12, z - 0.07, 1, 1, 1, { rz: sd * -0.12, ol: false });
  }
  return pad;
}
function rigRawclaw(o = {}, goat = false) {
  const fan = !!o.fan, ctx = makeCtx(), tc = o.tc || ((c) => c);
  const SK = 0xe4b389, HAIR = 0x25211f, HAIR2 = 0x4a4343, PURP = 0x8a5cf0;
  const HOOD = goat ? 0xf3e7c6 : 0xb7bbdc, HOOD2 = goat ? 0xe8d9b0 : 0x2b3478, PANTS = goat ? 0xeadcb8 : 0x252b57;
  const R = buildHero(ctx, { skin: SK, hip: 0.46, legX: 0.09, legR: 0.064, legColor: tc(PANTS), head: { rx: 0.385, ry: 0.36, rz: 0.36, jaw: 0.24 }, headY: 0.35, shX: 0.2, shY: 0.29, armR: 0.052, upLen: 0.16, foreLen: 0.14, handR: 0.058, earH: 0.09, upperColor: tc(HOOD), foreColor: tc(HOOD),
    leg(piv) {
      part(ctx, piv, hang(0.074, 0.074, 0.06, 8), goat ? 0xb59cff : mixHex(PANTS, 0x6a5cd8, 0.3), 0, -0.3, 0, 1, 1, 1, { ol: 0.01 });
      part(ctx, piv, ico(1), PURP, 0, -0.38, 0.04, 0.092, 0.058, 0.17, { ol: 0.013 });
      part(ctx, piv, ico(0), 0xfff4ff, 0, -0.37, 0.15, 0.06, 0.036, 0.06, { ol: false });
      part(ctx, piv, ico(1), 0xffffff, 0, -0.425, 0.04, 0.096, 0.022, 0.18, { ol: 0.007 });
    } });
  const { head, body, H } = R, { cy, rx, ry, rz } = H;
  part(ctx, body, cyl(0.175, 0.19, 0.2, 12), tc(HOOD2), 0, 0.09, 0, 1, 1, 0.88);
  part(ctx, body, cyl(0.158, 0.175, 0.2, 12), tc(HOOD), 0, 0.26, 0, 1, 1, 0.88);
  part(ctx, body, torus(0.13, 0.055, 5, 12), tc(HOOD), 0, 0.355, -0.01, 1, 1, 0.8, { rx: PI / 2, ol: 0.012 });
  part(ctx, body, ico(1), tc(HOOD), 0, 0.33, -0.14, 0.12, 0.1, 0.09, { ol: 0.012 });
  for (const sd of [-1, 1]) { part(ctx, body, hang(0.01, 0.01, 0.13, 5), 0xffffff, sd * 0.05, 0.33, 0.145, 1, 1, 1, { ol: false }); part(ctx, R.arms[sd < 0 ? 0 : 1].el, hang(0.058, 0.056, 0.03, 8), tc(HOOD2), 0, -0.1, 0, 1, 1, 1, { ol: 0.008 }); }
  addBeatPad(ctx, body, 0.2, 0.162, fan, goat ? 0xfff6e0 : 0xe9e7f7);
  // hair: dark cap, swept pompadour (blobs running front to back), flicks, nape tuft
  const hm = ctx.mk('rcHair', { color: HAIR, flatShading: false }), hl = ctx.mk('rcHair2', { color: HAIR2, flatShading: false });
  part(ctx, head, cap(16, 7, 1.25), 0, 0, cy + 0.02, -0.035, rx * 1.1, ry * 1.1, rz * 1.12, { mat: hm, hull: true, ol: 0.014, rx: -0.55 });
  // pompadour: a big swept-back wave (two stretched blobs, front high, tail sloping back) with lighter strand streaks along it
  part(ctx, head, ico(1), 0, 0, cy + ry * 0.98, 0.07, rx * 0.56, ry * 0.3, rz * 0.7, { mat: hm, hull: true, ol: 0.014, rx: -0.3 });
  part(ctx, head, ico(1), 0, 0.03, cy + ry * 1.1, -0.13, rx * 0.46, ry * 0.3, rz * 0.56, { mat: hm, hull: true, ol: 0.014, rx: -0.65, rz: -0.12 });
  for (let i = 0; i < (fan ? 0 : 3); i++) part(ctx, head, ico(0), 0, (i - 1) * 0.1, cy + ry * (1.2 - Math.abs(i - 1) * 0.06), 0.02 - Math.abs(i - 1) * 0.02, 0.028, 0.02, 0.24, { mat: hl, ol: false, rx: -0.5 });
  if (!fan) {
    blade(ctx, head, HAIR, 0.1, cy + ry * 1.02, 0.12, 0.2, cy + ry * 1.24, 0.0, 0.045, 0.03, { mat: hm });
    blade(ctx, head, HAIR, -0.02, cy + ry * 1.04, 0.14, 0.0, cy + ry * 1.28, 0.02, 0.04, 0.03, { mat: hm });
    part(ctx, head, ico(1), 0, -0.2, cy - 0.04, -rz * 0.8, 0.1, 0.1, 0.09, { mat: hm, ol: 0.012 });
    part(ctx, head, ico(0), 0, -0.16, cy - 0.0, -rz * 0.88, 0.05, 0.05, 0.05, { mat: hm, ol: false });
  }
  // goat: floppy ears + purple headphones; rawclaw: plain
  if (goat) {
    for (const sd of [-1, 1]) {
      part(ctx, head, ico(1), 0xf1d5b0, sd * (rx + 0.2), cy + 0.01, -0.03, 0.27, 0.075, 0.115, { ol: 0.013, rz: sd * -0.28 });
      part(ctx, head, ico(1), 0xf2a3ab, sd * (rx + 0.2), cy + 0.0, 0.03, 0.2, 0.05, 0.07, { ol: false, rz: sd * -0.28, ry: sd * 0.2 });
      part(ctx, head, cyl(0.105, 0.105, 0.075, 12), PURP, sd * (rx + 0.03), cy - 0.02, 0.03, 1, 1, 1, { rz: PI / 2, ol: 0.012 });
      part(ctx, head, torus(0.075, 0.016, 5, 12), 0xc8b3ff, sd * (rx + 0.075), cy - 0.02, 0.03, 1, 1, 1, { ry: PI / 2, ol: false });
    }
    part(ctx, head, geo('hpband', () => new THREE.TorusGeometry(1, 0.045, 6, 28, PI)), PURP, 0, cy - 0.02, 0.0, rx * 1.12, ry * 1.2, rx * 1.12, { ol: 0.012 });
  }
  const eye = eyeJ({ gr: ['#4a2a14', '#7a4a26', '#c89050'], star: null, lash: 7 });
  R.face = fan ? addFanFace(ctx, head, H, { ex: 0.17, iris: 0x6a3a22 }) : addHeroFace(ctx, head, H, {
    id: goat ? 'G' : 'C', eyeP: eye, shutP: paintEyeShutJ, ex: 0.18, ey: -0.04, ew: 0.19, eh: 0.19, blush: '#ff9a8a', bx: 0.23, by: -0.15, bw: 0.14,
    brow: { col: '#24181a', thick: 9, arch: 0.22, x: 0.185, y: 0.17, w: 0.17, h: 0.07, rot: 0.1 }, noseCol: '#b8806a', ny: -0.12, mouthP: goat ? paintMouthJ : paintMouthSmile, my: -0.215, mw: goat ? 0.17 : 0.14, mh: goat ? 0.12 : 0.08 });
  fitHero(R, 1.7);
  const { self, S, L, NT } = heroBase(R, { seed: goat ? 7 : 5, height: 1.7, radius: 0.42, note: [0.0, 1.3, 0.4] });
  self.update = makeUpdate(self, R, S, L, NT, {
    mouthBase: goat ? 1 : 0.9,
    idle: (c) => goat
      ? [[-1.75 - c.s * 0.05 * c.amp, 0.1, -0.35, -2.3, 0, 0], [-0.55 + c.s * 0.1 * c.amp, -0.3, -0.2, -1.25, 0, 0]] // right hand under the chin, left hand on the pad
      : [[-0.55 - c.s * 0.1 * c.amp, -0.3, -0.12, -1.3, 0, 0], [-0.55 + c.s * 0.1 * c.amp, 0.3, 0.12, -1.3, 0, 0]],
    sing: (c) => [[-0.75 + c.beat * 0.06, -0.2, -0.1, -1.5 - Math.abs(c.beat) * 0.2], [-0.75 - c.beat * 0.06, 0.2, 0.1, -1.5 - Math.abs(c.beat) * 0.2]],
    atk: () => [[-1.5, 0, 0.1, -0.5], [-1.5, 0, -0.1, -0.5]],
    extra(c) { // taps the pad to the beat
      const tap = Math.max(0, Math.sin(c.t * PI * 4)) * (1 - c.s * 0 - c.A) * (goat ? 0.5 : 1);
      R.armR.el.rotation.x -= tap * 0.18 * (1 - c.amp); R.armL.el.rotation.x -= (Math.max(0, -Math.sin(c.t * PI * 4))) * 0.18 * (1 - c.amp) * (goat ? 1 : 1);
      if (goat) R.head.rotation.z += Math.sin(c.t * 2.1) * 0.05;
    } });
  self.group.name = goat ? 'RawClawGoat' : 'RawClaw';
  return self;
}

/* ------------------------------------------------------------------ ANDY */
function rigAndy(o = {}) {
  const fan = !!o.fan, ctx = makeCtx(), tc = o.tc || ((c) => c);
  const SK = 0xf2c29a, HAIR = 0x7a4a26, HAIR2 = 0xb1743c, ORG = 0xff9a2e, PANTS = 0x7b5233;
  const R = buildHero(ctx, { skin: SK, hip: 0.45, legX: 0.095, legR: 0.066, legColor: tc(PANTS), head: { rx: 0.39, ry: 0.36, rz: 0.365, jaw: 0.24 }, headY: 0.35, shX: 0.2, shY: 0.29, armR: 0.046, upLen: 0.16, foreLen: 0.14, handR: 0.058, earH: 0.09, sleeve: { col: tc(ORG), len: 0.1 },
    leg(piv) {
      part(ctx, piv, hang(0.076, 0.076, 0.05, 8), mixHex(PANTS, 0x3a2412, 0.4), 0, -0.3, 0, 1, 1, 1, { ol: 0.01 });
      part(ctx, piv, ico(1), ORG, 0, -0.375, 0.04, 0.094, 0.058, 0.17, { ol: 0.013 });
      part(ctx, piv, ico(0), 0xfff0d8, 0, -0.365, 0.15, 0.06, 0.036, 0.06, { ol: false });
      part(ctx, piv, ico(1), 0xfff4e6, 0, -0.42, 0.04, 0.098, 0.022, 0.18, { ol: 0.007 });
    } });
  const { head, body, H } = R, { cy, rx, ry, rz } = H;
  part(ctx, body, cyl(0.16, 0.18, 0.36, 12), tc(ORG), 0, 0.16, 0, 1, 1, 0.88);
  part(ctx, body, torus(0.095, 0.03, 4, 12), mixHex(ORG, 0xffffff, 0.3), 0, 0.345, 0, 1, 1, 0.9, { rx: PI / 2, ol: 0.01 });
  part(ctx, body, cyl(0.17, 0.182, 0.06, 12), mixHex(PANTS, 0x000000, 0.1), 0, -0.02, 0, 1, 1, 0.88, { ol: 0.01 });
  // hair: brown cap + spiky crown + bangs, orange headband with a knot and flying tails on the viewer's left
  const hm = ctx.mk('anHair', { color: HAIR, flatShading: false }), hl = ctx.mk('anHair2', { color: HAIR2, flatShading: false });
  part(ctx, head, cap(16, 7, 1.3), 0, 0, cy + 0.03, -0.04, rx * 1.1, ry * 1.1, rz * 1.12, { mat: hm, hull: true, ol: 0.014, rx: -0.4 });
  const sp = [[-0.62, 0.05, 0.3, 0.26, 0], [-0.34, 0.3, 0.12, 0.32, 1], [-0.04, 0.4, 0.0, 0.36, 0], [0.26, 0.34, -0.12, 0.32, 1], [0.58, 0.18, -0.32, 0.27, 0], [-0.3, -0.35, 0.05, 0.3, 1], [0.12, -0.4, -0.1, 0.33, 0], [0.5, -0.25, -0.3, 0.28, 1], [-0.6, -0.25, 0.2, 0.26, 0]];
  for (const q of (fan ? sp.slice(0, 6) : sp)) {
    const bx = q[0] * rx, bz = q[1] * rz, by = cy + ry * Math.sqrt(Math.max(0.05, 1 - q[0] ** 2 - q[1] ** 2)) - 0.02;
    part(ctx, head, cone(0.1, q[3] * 1.15, 6), 0, bx, by + q[3] * 0.35, bz, 1, 1, 1, { mat: q[4] ? hl : hm, hull: true, ol: 0.012, rz: -q[0] * 0.9, rx: q[1] * 0.9 });
  }
  if (!fan) { part(ctx, head, ico(1), 0, -0.34, cy - 0.12, -0.04, 0.07, 0.17, 0.12, { mat: hm, ol: 0.012 }); part(ctx, head, ico(1), 0, 0.34, cy - 0.1, -0.04, 0.06, 0.15, 0.1, { mat: hm, ol: 0.012 }); }
  const hb = new THREE.Group(); hb.position.set(0, cy + ry * 0.38, -0.012); hb.rotation.x = -0.14; head.add(hb);
  part(ctx, hb, torus(1, 0.075, 5, 24), ORG, 0, 0, 0, rx * 1.03, rz * 1.04, 0.55, { ol: 0.012, rx: PI / 2 }); // ring turned flat, z scale = band height
  const knot = new THREE.Group(); knot.position.set(-rx * 0.95, -0.02, -0.12); hb.add(knot);
  part(ctx, knot, ico(1), mixHex(ORG, 0xffffff, 0.15), 0, 0, 0, 0.08, 0.07, 0.07, { ol: 0.012 });
  const tails = [0, 1].map((i) => { const g = new THREE.Group(); knot.add(g); blade(ctx, g, ORG, 0, 0, 0, -0.1 - i * 0.05, -0.09 - i * 0.07, -0.22 - i * 0.04, 0.075, 0.025); return g; });
  const eye = eyeJ({ gr: ['#4a2a14', '#7a4a26', '#c89050'], star: null, lash: 7 });
  R.face = fan ? addFanFace(ctx, head, H, { ex: 0.17, iris: 0x6a3a22 }) : addHeroFace(ctx, head, H, {
    id: 'A', eyeP: eye, shutP: paintEyeShutJ, ex: 0.185, ey: -0.045, ew: 0.195, eh: 0.195, blush: '#ff8a7a', bx: 0.235, by: -0.16, bw: 0.14,
    brow: { col: '#4a2a14', thick: 8, arch: 0.25, x: 0.185, y: 0.165, w: 0.17, h: 0.07, rot: 0.08 }, noseCol: '#c08068', ny: -0.125, mouthP: paintMouthJ, my: -0.22, mw: 0.17, mh: 0.12 });
  // electric guitar (strap on the body): double-cut orange sunburst body, long neck pointing up to the viewer's right
  const gt = new THREE.Group(); gt.position.set(-0.02, 0.08, 0.2); gt.rotation.set(0, -0.12, 0.5); gt.scale.setScalar(1.2); body.add(gt);
  const GO = 0xff8a1e, GY = 0xffc64a, WD = 0x8a5a30;
  part(ctx, gt, ico(2), GO, -0.02, -0.05, 0, 0.17, 0.14, 0.045, { ol: 0.012 });
  part(ctx, gt, ico(2), GO, 0.1, 0.05, 0, 0.12, 0.1, 0.045, { ol: 0.012 });
  part(ctx, gt, ico(1), GY, -0.01, -0.03, 0.035, 0.13, 0.1, 0.018, { ol: false });
  part(ctx, gt, box(0.5, 0.05, 0.035), WD, 0.42, 0.075, 0.0, 1, 1, 1, { ol: 0.01 });
  part(ctx, gt, box(0.5, 0.032, 0.012), 0x3a2414, 0.42, 0.075, 0.02, 1, 1, 1, { ol: false });
  part(ctx, gt, box(0.14, 0.07, 0.03), 0xfff0d0, 0.73, 0.08, 0.0, 1, 1, 1, { ol: 0.01, rz: 0.08 });
  if (!fan) {
    for (const x of [0.02, 0.1]) part(ctx, gt, box(0.012, 0.075, 0.016), 0x2a2020, x, 0.0 + x * 0.3, 0.05, 1, 1, 1, { ol: false, rz: 0.1 });
    part(ctx, gt, box(0.5, 0.01, 0.006), 0xdedee8, 0.42, 0.076, 0.026, 1, 1, 1, { ol: false });
    part(ctx, body, box(0.035, 0.42, 0.014), 0x4a2a14, 0.0, 0.18, 0.168, 1, 1, 1, { ol: false, rz: -0.55 });
  }
  // effects pedal on the floor beside his feet
  const ped = new THREE.Group(); ped.position.set(-0.4, 0, 0.12); ped.rotation.y = 0.35; R.root.add(ped);
  part(ctx, ped, box(0.22, 0.07, 0.15), 0x4f4a68, 0, 0.035, 0, 1, 1, 1, { ol: 0.01 });
  part(ctx, ped, box(0.2, 0.012, 0.13), 0xd8d4ee, 0, 0.075, 0, 1, 1, 1, { ol: false });
  const btn = [0x6fd36a, ORG].map((c, i) => part(ctx, ped, cyl(0.032, 0.032, 0.03, 8), c, -0.05 + i * 0.1, 0.09, 0.02, 1, 1, 1, { ol: 0.008 }));
  flat(ico(0), basic(0xff3d6e), ped, 0.0, 0.088, -0.05, 0.014, 0.014, 0.014);
  fitHero(R, 1.7);
  const { self, S, L, NT } = heroBase(R, { seed: 9, height: 1.7, radius: 0.45, note: [0.3, 1.2, 0.5] });
  let strum = 0;
  self.update = makeUpdate(self, R, S, L, NT, {
    idle: (c) => [[-1.15 - c.s * 0.05 * c.amp, 0.15, 0.5, -0.5, 0, 0], [-0.75 + c.s * 0.1 * c.amp, 0.3, 0.45, -1.2, 0, 0]],
    sing: (c) => [[-1.25 + c.beat * 0.04, 0.15, 0.55, -0.45], [-0.8, 0.3, 0.45, -1.2]],
    atk: () => [[-1.35, 0.1, 0.5, -0.3], [-0.9, 0.3, 0.4, -1.1]],
    extra(c) { // strum hand sweeps over the strings, faster while singing; foot taps the pedal
      const sw = Math.sin(c.t * (c.sg > 0.3 ? 17 : 6)) * (1 - c.amp);
      strum = damp(strum, c.sg > 0.3 || Math.sin(c.t * 0.9) > 0.55 ? 1 : 0.25, 8, c.dt);
      R.armL.el.rotation.x -= sw * 0.3 * strum; R.armL.sh.rotation.x -= sw * 0.07 * strum;
      const tap = Math.max(0, Math.sin(c.t * PI * 4)) * (1 - c.amp);
      R.legs[0].rotation.x -= tap * 0.2; btn[0].position.y = 0.09 - tap * 0.02; btn[1].position.y = 0.09 - (1 - tap) * 0.005 * 0;
      ped.scale.setScalar(Math.max(0.0001, 1 - c.amp * 1.6)); ped.visible = c.amp < 0.55;
      for (let i = 0; i < 2; i++) tails[i].rotation.set(Math.sin(c.t * 5 + i) * 0.2 + c.amp * 0.5, Math.sin(c.t * 4 + i * 2) * 0.3, Math.sin(c.t * 3.2 + i) * 0.25);
      gt.rotation.z = 0.5 + c.sg * c.beat * 0.03;
    } });
  self.group.name = 'Andy';
  return self;
}

/* ------------------------------------------------------------------ onesie hoods (unicorn + monster) */
// an open hood: a sphere cap turned to the back (pole = -z) so its rim frames the face, plus a ring at the rim
function addHood(ctx, head, H, col, rimCol, o = {}) {
  const { cy, rx, ry, rz } = H, hm = ctx.mk('hood' + col, { color: col, flatShading: false, roughness: 0.95 });
  part(ctx, head, cap(20, 10, 2.05), 0, 0, cy - 0.0, -0.03, rx * 1.14, rz * 1.12, ry * 1.1, { mat: hm, hull: true, ol: 0.015, rx: -PI / 2 });
  const rim = part(ctx, head, torus(1, 0.13, 6, 24), rimCol, 0, cy, 0.165, rx * 1.06 * 0.887, ry * 1.1 * 0.887, 0.4 * 0.887, { ol: 0.013 });
  return rim;
}
/* ------------------------------------------------------------------ UNICORN JASMIN */
function rigUnicorn(o = {}) {
  const fan = !!o.fan, ctx = makeCtx(), tc = o.tc || ((c) => c);
  const PK = 0xffa8c8, PK2 = 0xffc2da, WH = 0xfffaf6, LILAC = 0xc9b3ff;
  const R = buildHero(ctx, { hip: 0.46, legX: 0.09, legR: 0.07, legColor: tc(PK), head: { rx: 0.4, ry: 0.375, rz: 0.372, jaw: 0.22 }, headY: 0.35, shX: 0.19, shY: 0.29, armR: 0.052, upLen: 0.16, foreLen: 0.14, handR: 0.06, earH: 0.1, upperColor: tc(PK), foreColor: tc(PK), skin: 0xffc9a8,
    leg(piv) {
      part(ctx, piv, ico(1), WH, 0, -0.37, 0.03, 0.105, 0.08, 0.16, { ol: 0.013 });
      part(ctx, piv, ico(1), WH, 0, -0.31, 0.0, 0.1, 0.045, 0.1, { ol: false });
      part(ctx, piv, ico(1), LILAC, 0, -0.425, 0.03, 0.1, 0.022, 0.17, { ol: 0.008 });
    } });
  const { head, body, H } = R, { cy, rx, ry, rz } = H;
  part(ctx, body, ico(1), tc(PK), 0, 0.15, 0, 0.2, 0.22, 0.175, { ol: 0.015 });
  part(ctx, body, ico(1), WH, 0, 0.12, 0.13, 0.1, 0.12, 0.05, { ol: false });
  part(ctx, body, starGeo(0.045, 0.02, 0.02), 0xffd84d, 0, 0.13, 0.185, 1, 1, 1, { ol: false });
  part(ctx, body, box(0.014, 0.2, 0.012), WH, 0, 0.28, 0.168, 1, 1, 1, { ol: false });
  for (const sd of [-1, 1]) { part(ctx, R.arms[sd < 0 ? 0 : 1].el, hang(0.062, 0.062, 0.05, 8), WH, 0, -0.09, 0, 1, 1, 1, { ol: 0.01 }); }
  addHood(ctx, head, H, PK2, WH);
  // ears + horn on top of the hood
  for (const sd of [-1, 1]) { part(ctx, head, cone(0.085, 0.2, 6), PK2, sd * 0.2, cy + ry * 0.98, 0.0, 1, 1, 0.6, { ol: 0.012, rz: -sd * 0.3, rx: -0.15 }); part(ctx, head, cone(0.05, 0.14, 5), 0xff9ec0, sd * 0.2 + sd * 0.012, cy + ry * 0.95, 0.03, 1, 1, 0.5, { ol: false, rz: -sd * 0.3, rx: -0.15 }); }
  const hn = new THREE.Group(); hn.position.set(0, cy + ry * 1.0, 0.1); hn.rotation.x = 0.18; head.add(hn);
  part(ctx, hn, cone(0.075, 0.3, 8), 0xffe27a, 0, 0.14, 0, 1, 1, 1, { ol: 0.013 });
  if (!fan) for (let i = 0; i < 3; i++) part(ctx, hn, torus(0.062 - i * 0.015, 0.012, 3, 9), 0xffb52e, 0, 0.07 + i * 0.07, 0, 1, 1, 1, { rx: PI / 2, ol: false });
  // rainbow ponytail from the back left of the hood
  const tail = new THREE.Group(); tail.position.set(-0.26, cy + ry * 0.55, -0.19); head.add(tail);
  part(ctx, tail, ico(1), 0xff9ec8, 0, 0, 0, 0.11, 0.1, 0.1, { ol: 0.012 });
  const tj = makeTail(ctx, tail, fan ? [0xff9ec8, 0xc3a6ff, 0x9fdcff, 0xa6f0c0, 0xffe48a] : [0xff9ec8, 0xc3a6ff, 0x9fdcff, 0xa6f0c0, 0xffe48a], 1.0, 0.1, 0.16);
  const eye = eyeJ({ gr: ['#4a2815', '#7c4824', '#c08848'] });
  R.face = fan ? addFanFace(ctx, head, H, { ex: 0.17 }) : addHeroFace(ctx, head, H, {
    id: 'U', eyeP: eye, shutP: paintEyeShutJ, ex: 0.204, ey: -0.045, ew: 0.215, eh: 0.215, blush: '#ff7fa4', bx: 0.235, by: -0.17, bw: 0.17,
    brow: { col: '#7a4a30', thick: 6, arch: 0.3, x: 0.2, y: 0.185, w: 0.17, h: 0.09, rot: 0.06 }, noseCol: '#d9877a', ny: -0.135, mouthP: paintMouthJ, my: -0.232, mw: 0.2, mh: 0.14 });
  addMic(ctx, R.armR.el, 0x1b1b24, 0xff5fa5, fan);
  fitHero(R, 1.7);
  const { self, S, L, NT } = heroBase(R, { seed: 11, height: 1.7, radius: 0.45, note: [0.12, 1.25, 0.45] });
  self.update = makeUpdate(self, R, S, L, NT, {
    idle: (c) => [[-0.65 - c.s * 0.1 * c.amp, -0.1, -0.3, -1.9, 0, 0], [-0.1 + c.s * 0.5 * c.amp, 0, -0.8, -0.15, 0, -(0.95 + Math.sin(c.t * 3.2) * 0.2 * (1 - c.sg))]],
    sing: (c) => [[-0.8 + c.beat * 0.05, -0.1, -0.25, -1.95], [-0.25 + c.beat * 0.15, -0.2, -0.95, -0.35, 0, -(0.5 + c.beat * 0.12)]],
    extra(c) {
      const idle = Math.sin(c.t * 1.7), side = Math.sin(c.ph - 0.6);
      tail.rotation.set(0.1 * c.amp + c.sg * (0.1 + 0.15 * c.beat) + idle * 0.05 + c.A * 0.4, 0, -0.5 + side * 0.15 * c.amp + c.sg * Math.sin(c.t * PI * 2 - 0.4) * 0.12);
      whip(tj, c.ph, { x: 0.2, z: 0.1 }, c.amp + c.sg * 0.5 + c.A, 0);
      for (let i = 0; i < tj.length; i++) tj[i].rotation.z += Math.sin(c.t * 1.7 - i * 0.8) * 0.05 + 0.04;
      hn.rotation.z = Math.sin(c.t * 2) * 0.03 + c.sg * c.beat * 0.04;
    } });
  self.group.name = 'UnicornJasmin';
  return self;
}

/* ------------------------------------------------------------------ MONSTER ROXOR */
const smileyTex = () => ctex('smiley', 128, 128, (g, W, H) => {
  ell(g, W / 2, H / 2, 54, 54, '#f7a928'); g.lineWidth = 5; g.strokeStyle = '#d9770f'; g.stroke(); ell(g, W / 2 - 4, H / 2 - 6, 40, 38, '#ffbc3d');
  ell(g, W * 0.37, H * 0.4, 6, 9, '#8a4a10'); ell(g, W * 0.63, H * 0.4, 6, 9, '#8a4a10');
  g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = '#a85a10'; g.beginPath(); g.arc(W / 2, H * 0.47, 28, 0.25, PI - 0.25); g.stroke();
});
function rigMonster(o = {}) {
  const fan = !!o.fan, ctx = makeCtx(), tc = o.tc || ((c) => c);
  const G1 = 0x55ad3e, G2 = 0x3f8f30, G3 = 0x2c7024, CRM = 0xf6e7b5;
  const R = buildHero(ctx, { hip: 0.42, legX: 0.115, legR: 0.095, legColor: tc(G2), head: { rx: 0.35, ry: 0.32, rz: 0.335, jaw: 0.3 }, headY: 0.35, shX: 0.235, shY: 0.28, armR: 0.05, upLen: 0.15, foreLen: 0.14, handR: 0.057, earH: 0.085, upperColor: tc(G1), foreColor: tc(G1), skin: 0xffc9a0,
    leg(piv) {
      part(ctx, piv, ico(1), G1, 0, -0.355, 0.05, 0.115, 0.07, 0.18, { ol: 0.013 });
      for (let i = -1; i <= 1; i++) part(ctx, piv, ico(0), CRM, i * 0.05, -0.36, 0.2 - Math.abs(i) * 0.02, 0.032, 0.03, 0.04, { ol: 0.007 });
      part(ctx, piv, ico(1), G3, 0, -0.405, 0.05, 0.115, 0.022, 0.19, { ol: 0.008 });
    } });
  const { head, body, H } = R, { cy, rx, ry, rz } = H;
  part(ctx, body, ico(1), tc(G1), 0, 0.16, 0, 0.215, 0.22, 0.19, { ol: 0.015 });
  const mat = decalMat('smiley', smileyTex()); if (!fan) cylDecal(body, mat, 0.2, 0.9, 0.17, 0.23, 0.23, { eps: 0.03 }); else part(ctx, body, ico(1), 0xffb52e, 0, 0.16, 0.16, 0.09, 0.09, 0.03, { ol: false });
  part(ctx, body, ico(1), tc(G2), 0, -0.02, 0, 0.19, 0.08, 0.17, { ol: false });
  for (let i = 0; i < (fan ? 3 : 4); i++) part(ctx, body, cone(0.05, 0.14, 4), G3, 0, 0.3 - i * 0.1, -0.17 - (i % 2) * 0.01, 1, 1, 1, { ol: 0.01, rx: -PI / 2 - 0.2 });
  addHood(ctx, head, H, G1, G3);
  // leafy fringe round the face opening, spikes + horns + eyeballs on top of the hood
  const nf = fan ? 6 : 10;
  for (let i = 0; i < nf; i++) { const a = PI * 0.5 + (i / (nf - 1)) * PI * 1.55 - 0.1, rr = 0.355; part(ctx, head, cone(0.04, 0.12, 4), i % 2 ? G2 : G3, Math.cos(a) * rr * 1.13, cy + Math.sin(a) * rr * 1.0, 0.18, 1, 1, 0.7, { ol: false, rz: a - PI / 2 }); }
  for (let i = 0; i < 5; i++) { const u = i / 4, y = cy + ry * (1.03 - Math.abs(u - 0.5) * 0.15), z = lerp(0.12, -0.24, u); part(ctx, head, cone(0.055, 0.17 - Math.abs(u - 0.5) * 0.06, 4), G3, 0, y, z, 1, 1, 1, { ol: 0.011, rx: (u - 0.5) * -0.9 }); }
  for (const sd of [-1, 1]) {
    part(ctx, head, cone(0.065, 0.22, 6), CRM, sd * 0.25, cy + ry * 0.82, -0.02, 1, 1, 1, { ol: 0.013, rz: -sd * 0.55 });
    const ey = new THREE.Group(); ey.position.set(sd * 0.12, cy + ry * 1.06, 0.06); head.add(ey);
    part(ctx, ey, ico(1), 0xffffff, 0, 0.03, 0, 0.075, 0.075, 0.075, { ol: 0.012 });
    flat(ico(1), CK.eyeMat, ey, 0, 0.035, 0.065, 0.034, 0.034, 0.02); flat(ico(0), CK.whiteMat, ey, 0.012, 0.05, 0.078, 0.012, 0.012, 0.01);
  }
  const eye = paintEyeR;
  R.face = fan ? addFanFace(ctx, head, H, { ex: 0.15, iris: 0x4a6aa8 }) : addHeroFace(ctx, head, H, {
    id: 'M', eyeP: eye, shutP: paintEyeShutR, ex: 0.16, ey: -0.035, ew: 0.17, eh: 0.15, blush: '#ff9fb0', bx: 0.2, by: -0.13, bw: 0.1,
    brow: { col: '#5a3220', thick: 11, arch: 0.28, x: 0.158, y: 0.15, w: 0.17, h: 0.1, rot: -0.04 }, noseCol: '#cf8a74', ny: -0.1, mouthP: paintMouthR, my: -0.175, mx: 0.02, mw: 0.15, mh: 0.092 });
  addMic(ctx, R.armR.el, 0x1b1b24, 0x76d04a, fan);
  if (!fan) { part(ctx, R.armL.el, hang(0.017, 0.011, 0.1, 5), 0xffc9a0, -0.004, -0.2, 0.02, 1, 1, 1, { ol: 0.009 }); part(ctx, R.armL.el, ico(0), 0xffc9a0, 0.045, -0.19, 0.02, 0.022, 0.03, 0.02, { ol: 0.008 }); }
  // dino tail
  const tail = new THREE.Group(); tail.position.set(0, 0.0, -0.15); body.add(tail);
  const t1 = new THREE.Group(), t2 = new THREE.Group(); tail.add(t1); t1.add(t2); t2.position.set(0, 0, -0.17);
  part(ctx, t1, ico(1), G2, 0, 0, -0.09, 0.09, 0.08, 0.14, { ol: 0.012 }); part(ctx, t2, ico(1), G2, 0, 0, -0.08, 0.06, 0.055, 0.11, { ol: 0.012 });
  part(ctx, t1, cone(0.035, 0.08, 4), G3, 0, 0.08, -0.08, 1, 1, 1, { ol: false }); part(ctx, t2, cone(0.03, 0.07, 4), G3, 0, 0.055, -0.06, 1, 1, 1, { ol: false });
  fitHero(R, 1.8);
  const { self, S, L, NT } = heroBase(R, { seed: 13, height: 1.8, radius: 0.5, note: [0.12, 1.3, 0.45] });
  self.update = makeUpdate(self, R, S, L, NT, {
    mouthBase: 0.8,
    idle: (c) => [[-0.4 - c.s * 0.08 * c.amp, -0.1, -0.25, -1.95, 0, 0], [-0.3 + c.s * 0.4 * c.amp, 0, -0.85, -0.3, 0, -(0.9 + Math.sin(c.t * 1.9) * 0.06)]],
    sing: (c) => [[-0.8, -0.1, -0.2, -2.0], [-0.5 + c.beat * 0.15, 0, -1.0, -0.35, 0, -(0.9 + c.beat * 0.1)]],
    atk: () => [[-1.6, 0, 0.05, -0.05], [0.5, 0, -0.5, -0.5]],
    extra(c) { tail.rotation.set(0.1, Math.sin(c.t * 1.6) * 0.25 + Math.sin(c.ph) * 0.3 * c.amp, 0); t1.rotation.y = Math.sin(c.t * 2.1 - 0.7) * 0.3 + Math.sin(c.ph - 0.7) * 0.3 * c.amp; t2.rotation.y = Math.sin(c.t * 2.1 - 1.4) * 0.4 + Math.sin(c.ph - 1.4) * 0.35 * c.amp; } });
  self.group.name = 'MonsterRoxor';
  return self;
}

/* ------------------------------------------------------------------ JORDAN (stall keeper, idle only) */
const moonTex = () => ctex('moon', 128, 128, (g, W, H) => {
  g.fillStyle = '#5ee0d2'; g.beginPath(); g.arc(W * 0.5, H * 0.5, 40, 0, PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(W * 0.62, H * 0.44, 36, 0, PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
  star(g, W * 0.7, H * 0.7, 10, 4.5, '#b8fff6'); star(g, W * 0.28, H * 0.22, 7, 3, '#b8fff6');
});
function rigJordan(o = {}) {
  const ctx = makeCtx(), NAVY = 0x242c46, TEAL = 0x46c8c0, HAIR = 0x262a4c, HAIR2 = 0x3d4478, SK = 0xeabf9c;
  const R = buildHero(ctx, { skin: SK, hip: 0.44, legX: 0.09, legR: 0.056, legColor: NAVY, head: { rx: 0.385, ry: 0.36, rz: 0.36, jaw: 0.26 }, headY: 0.34, shX: 0.17, shY: 0.28, armR: 0.044, upLen: 0.16, foreLen: 0.14, handR: 0.056, earH: 0.09, upperColor: NAVY, foreColor: NAVY,
    leg(piv) {
      part(ctx, piv, ico(1), TEAL, 0, -0.375, 0.04, 0.086, 0.054, 0.16, { ol: 0.013 });
      part(ctx, piv, ico(0), 0xe9fffb, 0, -0.365, 0.14, 0.055, 0.034, 0.055, { ol: false });
      part(ctx, piv, ico(1), 0xffffff, 0, -0.42, 0.04, 0.09, 0.02, 0.17, { ol: 0.007 });
    } });
  const { head, body, H } = R, { cy, rx, ry, rz } = H;
  part(ctx, body, cyl(0.14, 0.165, 0.36, 12), NAVY, 0, 0.16, 0, 1, 1, 0.86);
  part(ctx, body, torus(0.1, 0.03, 4, 12), mixHex(NAVY, 0xffffff, 0.25), 0, 0.345, 0, 1, 1, 0.9, { rx: PI / 2, ol: 0.01 });
  cylDecal(body, decalMat('moon', moonTex()), 0.165, 0.86, 0.19, 0.2, 0.2, { eps: 0.012 });
  for (const sd of [-1, 1]) part(ctx, R.arms[sd < 0 ? 0 : 1].el, hang(0.05, 0.05, 0.03, 8), TEAL, 0, -0.1, 0, 1, 1, 1, { ol: 0.008 });
  // long hair: back mass, side locks over the shoulders, fringe
  const hm = ctx.mk('joHair', { color: HAIR, flatShading: false, roughness: 0.6 }), hl = ctx.mk('joHair2', { color: HAIR2, flatShading: false });
  part(ctx, head, cap(18, 8, 1.3), 0, 0, cy + 0.03, -0.04, rx * 1.1, ry * 1.1, rz * 1.12, { mat: hm, hull: true, ol: 0.014, rx: -0.35 });
  part(ctx, head, ico(1), 0, 0, cy - 0.3, -0.19, rx * 0.88, ry * 1.4, rz * 0.5, { mat: hm, hull: true, ol: 0.014 });
  for (const sd of [-1, 1]) { part(ctx, head, ico(1), 0, sd * (rx * 1.0), cy - 0.3, -0.03, 0.085, 0.36, 0.11, { mat: hm, hull: true, ol: 0.013, rz: sd * 0.06 }); part(ctx, head, ico(1), 0, sd * (rx * 0.99), cy - 0.2, 0.06, 0.04, 0.22, 0.06, { mat: hl, ol: false, rz: sd * 0.06 }); }
  const lock = (path, wid, lift) => part(ctx, head, lockGeo(H, path, wid, lift), 0, 0, 0, 0, 1, 1, 1, { mat: hm, hull: true, ol: 0.011 });
  lock([[0.0, 0.95], [0.3, 0.88], [0.6, 0.72], [0.82, 0.45], [0.92, 0.25]], [0.05, 0.16, 0.17, 0.12, 0.05], [0.03, 0.04, 0.045, 0.04, 0.03]);
  lock([[0.0, 0.95], [-0.3, 0.88], [-0.6, 0.72], [-0.82, 0.45], [-0.92, 0.25]], [0.05, 0.16, 0.17, 0.12, 0.05], [0.03, 0.04, 0.045, 0.04, 0.03]);
  lock([[0.05, 0.95], [0.18, 0.82], [0.28, 0.62]], [0.04, 0.1, 0.04], [0.04, 0.05, 0.035]);
  R.face = addHeroFace(ctx, head, H, {
    id: 'Jo', eyeP: paintEyeShutJ, shutP: paintEyeShutJ, ex: 0.178, ey: -0.035, ew: 0.17, eh: 0.15, blush: '#ff9a9a', bx: 0.23, by: -0.15, bw: 0.14,
    brow: { col: '#262a4c', thick: 6, arch: 0.25, x: 0.18, y: 0.14, w: 0.15, h: 0.06, rot: 0.1 }, noseCol: '#c08070', ny: -0.12, mouthP: paintMouthJ, my: -0.215, mw: 0.15, mh: 0.1 });
  // round glasses
  const gm = ctx.mk('joGlass', { color: 0x2d170f, flatShading: false }), gz = H.surf(0.178, cy - 0.035 - cy + cy) + 0.035;
  for (const sd of [-1, 1]) { part(ctx, head, torus(0.1, 0.013, 4, 16), 0, sd * 0.178, cy - 0.035, H.surf(sd * 0.178, cy - 0.035) + 0.03, 1, 1, 1, { mat: gm, ol: false }); part(ctx, head, box(0.012, 0.012, 0.2), 0, sd * 0.28, cy - 0.025, 0.1, 1, 1, 1, { mat: gm, ol: false, ry: sd * 0.28 }); }
  part(ctx, head, box(0.07, 0.014, 0.014), 0, 0, cy - 0.025, H.surf(0, cy - 0.025) + 0.03, 1, 1, 1, { mat: gm, ol: false });
  // phone with a glowing screen (right hand, +x) and a tiny second hand wave
  const ph = new THREE.Group(); ph.position.set(0.0, -0.2, 0.04); ph.rotation.set(1.0, 0, 0); R.armR.el.add(ph);
  part(ctx, ph, box(0.12, 0.2, 0.025), 0x1b6a68, 0, 0, 0, 1, 1, 1, { ol: 0.01 });
  flat(box(1, 1, 1), basic(mixHex(0x6ee9d8, 0xffffff, 0.2)), ph, 0, 0, 0.014, 0.1, 0.17, 0.004);
  flat(ico(0), basic(0xffffff), ph, -0.012, -0.02, 0.019, 0.02, 0.016, 0.004); flat(box(1, 1, 1), basic(0xffffff), ph, 0.004, 0.015, 0.019, 0.005, 0.06, 0.004); flat(box(1, 1, 1), basic(0xffffff), ph, 0.02, 0.04, 0.019, 0.03, 0.01, 0.004);
  fitHero(R, o.height || 1.25);
  const { self, S, L, NT } = heroBase(R, { seed: 17, height: o.height || 1.25, radius: 0.35, note: [0.12, 1.15, 0.35], noteCols: [0x5ee0d2, 0xb8fff6, 0x8fe3f0, 0x9af0b4] });
  self.update = makeUpdate(self, R, S, L, NT, {
    noNotes: true, mouthBase: 0.8,
    idle: (c) => { const up = Math.max(0, Math.sin(c.t * 0.5)) ** 3; return [[-0.85 - up * 0.2, -0.2, 0.12, -1.25 + up * 0.3, 0, 0], [-0.2 + Math.sin(c.t * 1.3) * 0.05, 0.1, -0.55 - Math.max(0, Math.sin(c.t * 0.5 + 1.5)) * 0.5, -0.3]]; },
    extra(c) {
      const up = Math.max(0, Math.sin(c.t * 0.5)) ** 3; // glances up from the phone now and then
      R.head.rotation.x += 0.09 * (1 - up) - up * 0.04; R.head.rotation.y += Math.sin(c.t * 0.5 + 0.8) * 0.05; c.wide = 0.3 + up * 0.5; c.open = up * 0.4;
      NT.tick(c.dt, true);
    } });
  if (o.counter) { const cn = new THREE.Group(); cn.position.set(0, 0, 0.55); part(ctx, cn, box(1.6, 0.6, 0.5), 0xb8844c, 0, 0.3, 0, 1, 1, 1, { ol: 0.012 }); part(ctx, cn, box(1.7, 0.06, 0.6), 0xdca466, 0, 0.63, 0, 1, 1, 1, { ol: 0.012 }); self.group.add(cn); }
  self.group.name = 'Jordan';
  return self;
}

/* ------------------------------------------------------------------ dispatcher, fans, companion pack */
const REG = { rawclaw: (o) => rigRawclaw(o), rawclaw_goat: (o) => rigRawclaw(o, true), andy: rigAndy, jasmin_unicorn: rigUnicorn, roxor_monster: rigMonster, jordan: rigJordan };
export const FAN_ARTS = ['rawclaw', 'roxor', 'andy', 'jasmin_unicorn', 'rawclaw_goat', 'roxor_monster'];
const FAN_TINTS = [0xffb0d0, 0x9af0b4, 0x8fe3f0, 0xffd84d, 0xc9b3ff, 0xff9a2e], FAN_ACC = [0x76e8ff, 0xff4d8d, 0xffd84d, 0x9af0b4, 0xb59cff];
// crowd accessories: 0 none, 1 glow stick, 2 foam finger, 3 star clip, 4 bow (colour from FAN_ACC)
function addFanAcc(a, acc, col) {
  const R = a.rig, ctx = R.ctx, { H, head } = R, cy = H.cy;
  if (acc === 1) { flat(CK.hang(0.026, 0.026, 0.34, 5), basic(col), R.armR.el, 0, -0.12, 0, 1, 1, 1); flat(ico(0), basic(0xffffff), R.armR.el, 0, -0.47, 0, 0.034, 0.034, 0.034); }
  else if (acc === 2) { part(ctx, R.armR.el, ico(0), col, 0, -0.2, 0, 0.12, 0.1, 0.07, { ol: 0.012 }); part(ctx, R.armR.el, hang(0.04, 0.045, 0.24, 5), col, 0, -0.2, 0, 1, 1, 1, { ol: 0.012 }); part(ctx, R.armR.el, ico(0), col, 0, -0.45, 0, 0.05, 0.05, 0.05, { ol: 0.012 }); }
  else if (acc === 3) part(ctx, head, starGeo(0.07, 0.03, 0.03), col, 0.26, cy + 0.2, H.surf(0.26, cy + 0.2) * 0.55 + 0.1, 1, 1, 1, { ol: 0.01, rz: 0.3 });
  else if (acc === 4) { for (const sd of [-1, 1]) part(ctx, head, cone(0.075, 0.17, 5), col, sd * 0.1 + 0.2, cy + H.ry * 0.95, 0.12, 1, 1, 0.7, { ol: 0.01, rz: sd * 1.5 }); part(ctx, head, ico(0), col, 0.2, cy + H.ry * 0.95, 0.12, 0.05, 0.05, 0.05, { ol: 0.01 }); }
}
// crowd behaviour: arms-up cheering while waiting, hero-style singing pose when shooting, loot held overhead when carrying
function fanUpdate(a, seed) {
  const { rig: R, S, L } = a, rn = CK.rng(seed * 31 + 5);
  S.phase = rn() * 6.28; S.speedF = 5 + rn() * 2.5; S.style = Math.floor(rn() * 2); S.carryW = 0; S.sing = 0;
  return (dt, t, st) => {
    if (L.dead) return;
    dt = Math.min(dt, 0.05); st = st || {};
    L.tick(dt, st); kidTick(R, S, dt, t, st);
    const amp = S.amp, A = L.atkEnv, ch = 1 - amp, fight = st.role === 'fight', carry = st.carry ? (st.carry.length || 0) : 0;
    const cw = (S.carryW = damp(S.carryW, carry > 0 ? 1 : 0, 9, dt)), sg = (S.sing = damp(S.sing, st.atk ? 1 : 0, 8, dt));
    const f = S.speedF * (1 + sg * 0.25), p = t * f + S.phase, pump = Math.sin(p), bounce = Math.abs(Math.sin(p * 0.5)), idleW = fight ? ch * 0.9 : ch * 0.0;
    if (S.style === 0) { poseArm(R.armR, idleW, -2.6 + pump * 0.3, -0.05, 0.6, -0.1); poseArm(R.armL, idleW, -2.6 - pump * 0.3, 0.05, -0.6, -0.1); }
    else { poseArm(R.armR, idleW, -2.8 + pump * 0.25, 0, 0.45 + pump * 0.3, -0.1); poseArm(R.armL, idleW, -0.25, 0.2, -0.4, -0.1); }
    poseArm(R.armR, sg * 0.8, -1.5, 0, 0.1, -0.5); poseArm(R.armL, sg * 0.8, 0.3, 0, -0.5, -0.4);
    poseArm(R.armR, cw, -2.55, 0, 0.18, -0.35); poseArm(R.armL, cw, -2.55, 0, -0.18, -0.35); // hands steady the stack overhead
    R.root.position.y += bounce * 0.07 * idleW * (1 + sg * 0.6 + A) * (1 - cw);
    R.body.rotation.z = Math.sin(p * 0.5) * 0.06 * ch * (1 - cw); R.head.rotation.z += Math.sin(p * 0.5 + 1) * 0.07 * ch;
    R.legs[0].rotation.x += bounce * -0.12 * ch * (fight ? 1 : 0); R.legs[1].rotation.x += bounce * 0.12 * ch * (fight ? 1 : 0);
    R.body.rotation.x += A * 0.2; R.root.position.z = A * 0.18;
    setBlinkH(R.face, S.blink, st.cheer ? 1 : 0); setMouthH(R.face, (ch * (0.3 + 0.5 * Math.max(0, Math.sin(p))) * (fight ? 1 : 0.3) + A * 0.6) * 0.78, 0.4, 1);
    lifeXform(L, R.root, 1, 1, 1, 1 + A * 0.08, 1 + A * 0.06);
  };
}
export function makeHero(art, o = {}) {
  const fan = !!o.fan, keep = { flat: STYLE.flat, boost: STYLE.boost };
  STYLE.flat = false; STYLE.boost = fan ? -1 : 1; // crowd actors drop one icosphere level (fans are ~47 px tall)
  if (fan) { const tint = o.tint || FAN_TINTS[(o.seed || 0) % FAN_TINTS.length]; o = Object.assign({}, o, { tc: (c) => mixHex(c, tint, 0.4) }); }
  try {
    let a;
    if (art === 'jasmin') a = makeJasmin({ tc: o.tc }); else if (art === 'roxor') a = makeRoxor({ rack: false, fan, tc: o.tc });
    else a = (REG[art] || REG.rawclaw)(o);
    a.art = art;
    if (fan) { addFanAcc(a, o.acc ?? 0, FAN_ACC[(o.seed || 0) % FAN_ACC.length]); a.update = fanUpdate(a, o.seed || 1); const an = new THREE.Group(); an.position.set(0, a.rig.H.cy + a.rig.H.ry * 0.95, 0); a.rig.head.add(an); a.anchor = an; }
    if (o.pack) addPack(a);
    return a;
  } finally { STYLE.flat = keep.flat; STYLE.boost = keep.boost; }
}
// the companion hauls the loot: a small wooden tray behind its back; `a.anchor` is where the stack stands (pool items are placed from it each frame)
function addPack(a) {
  const R = a.rig, ctx = R.ctx, body = R.body, WOOD = 0xc99060, WD2 = 0xa8703f, rack = new THREE.Group(); body.add(rack);
  part(ctx, rack, box(0.38, 0.46, 0.05), WOOD, 0, 0.15, -0.18, 1, 1, 1, { ol: 0.01 });
  part(ctx, rack, box(0.46, 0.05, 0.5), WOOD, 0, -0.08, -0.43, 1, 1, 1, { ol: 0.012 });
  for (const sd of [-1, 1]) { part(ctx, rack, box(0.045, 0.045, 0.3), WD2, sd * 0.17, 0.02, -0.32, 1, 1, 1, { ol: false }); part(ctx, rack, box(0.045, 0.3, 0.045), WD2, sd * 0.22, 0.09, -0.66, 1, 1, 1, { ol: false }); part(ctx, rack, box(0.04, 0.4, 0.02), 0xfff4e6, sd * 0.09, 0.17, 0.13, 1, 1, 1, { ol: false, rz: sd * -0.06 }); }
  const an = new THREE.Group(); an.position.set(0, -0.04, -0.43); body.add(an); a.anchor = an; a.rack = rack;
}

// ================================================================== the sync module
const ang = (a, b) => { let d = a - b; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; };
// pooled per-instance alpha + colour ring decals on the ground (fan rings, drummer beat rings, the ultimate's ring)
class RingPool {
  constructor(max = 96) {
    this.max = max; this.n = 0; const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: softTex('ring'), transparent: true, depthWrite: false, fog: false }); m.userData.noCast = true;
    this.mesh = new THREE.InstancedMesh(g, m, max); this.mesh.frustumCulled = false; this.mesh.renderOrder = -1; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); g.setAttribute('aA', this.a);
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vA;'); };
    m.customProgramCacheKey = () => 'ringpool'; this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  add(x, z, r, a, col, y = 0.045) { if (this.n >= this.max) return; this._m.makeScale(r * 2, 1, r * 2); this._m.setPosition(x, y, z); this.mesh.setMatrixAt(this.n, this._m); this.mesh.setColorAt(this.n, this._c.set(col)); this.a.setX(this.n, a); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.a.needsUpdate = true; }
}
// career badges: one billboard InstancedMesh per career (so each keeps its own painted texture); matrices face the camera each frame
const BADGES = { roadie: { col: ['#8ef0e4', '#1f9a98'], role: 'gather', g: (g) => { g.fillStyle = '#fff'; g.fillRect(-7, -5, 14, 11); g.fillStyle = '#1f6a68'; g.fillRect(-7, -1, 14, 3); } },
  manager: { col: ['#ffe27a', '#e8921e'], role: 'gather', g: (g) => { g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); g.fillStyle = '#b8760a'; g.font = '900 13px sans-serif'; g.textAlign = 'center'; g.fillText('$', 0, 5); } },
  scout: { col: ['#9af0b4', '#2a9a58'], role: 'gather', g: (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); } },
  bodyguard: { col: ['#ff9a8a', '#d8384f'], role: 'fight', g: (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-8, -7); g.lineTo(8, -7); g.lineTo(8, 1); g.quadraticCurveTo(8, 8, 0, 10); g.quadraticCurveTo(-8, 8, -8, 1); g.closePath(); g.fill(); } },
  drummer: { col: ['#c6a8ff', '#6a3fd8'], role: 'fight', g: (g) => { g.fillStyle = '#fff'; g.fillRect(-8, -2, 16, 9); g.beginPath(); g.ellipse(0, -2, 8, 3.2, 0, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-7, -9); g.lineTo(-1, -3); g.moveTo(7, -9); g.lineTo(1, -3); g.stroke(); } } };
function badgeTex(k) {
  const b = BADGES[k];
  return kitCanvasTex(64, 64, (g, w, h) => { g.translate(w / 2, h / 2); g.scale(2.1, 2.1); const gr = g.createRadialGradient(-2, -3, 1, 0, 0, 14); gr.addColorStop(0, b.col[0]); gr.addColorStop(1, b.col[1]); g.fillStyle = '#2d170f'; g.beginPath(); g.arc(0, 0, 14.5, 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 12.5, 0, 7); g.fill(); b.g(g); });
}

export function init(V) {
  const T = V.THREE || THREE, dyn = V.dyn, blobs = V.blobs;
  const bake = (a, opts) => { try { (V.bake || bakeActor)(a, opts); } catch (e) { /* unbaked actors still render, just with more calls */ } };
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tmpC = new THREE.Color();
  const root = new THREE.Group(); root.name = 'heroes3d'; dyn.add(root);
  const rings = new RingPool(96); root.add(rings.mesh);

  // ---- shared loot pool: companion stack + fan carries, all drawn from 4 instanced meshes (helmet body tinted, helmet trim, bar tinted, crown)
  const lootMats = { tint: lit(0xffffff, { rough: 0.35, metal: 0.35 }), vc: lit(0xffffff, { vc: true, rough: 0.5 }), gold: lit(0xffffff, { vc: true, rough: 0.28, metal: 0.4 }) };
  lootMats.tint.userData.noCast = true; lootMats.vc.userData.noCast = true; lootMats.gold.userData.noCast = true;
  const mkInst = (g, m, max, colors) => { const im = new THREE.InstancedMesh(g, m, max); im.frustumCulled = false; im.count = 0; if (colors) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); im.castShadow = false; root.add(im); return im; };
  const vcol = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), k = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const domeG = new THREE.SphereGeometry(0.5, 14, 8, 0, PI * 2, 0, PI / 2); domeG.scale(1, 0.8, 1);
  const trimG = (() => { const parts = [vcol(new THREE.CylinderGeometry(0.56, 0.56, 0.1, 14).translate(0, 0.03, 0), 0xfff4e6), vcol(new THREE.BoxGeometry(0.1, 0.1, 0.62).translate(0, 0.42, 0), 0xffd84d), vcol(new THREE.BoxGeometry(0.5, 0.07, 0.2).translate(0, 0.17, 0.4).rotateX(0.2), 0x2a2250)].map((g) => g.index ? g.toNonIndexed() : g); return mergeG(parts); })();
  const barG = new THREE.CylinderGeometry(0.44, 0.52, 0.42, 4, 1).rotateY(PI / 4).scale(1.35, 1, 0.8);
  const crownG = (() => { const p = [vcol(new THREE.CylinderGeometry(0.46, 0.5, 0.3, 12).translate(0, 0.15, 0), 0xffd84d), vcol(new THREE.CylinderGeometry(0.47, 0.51, 0.1, 12).translate(0, 0.05, 0), 0xffe98a)]; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; p.push(vcol(new THREE.ConeGeometry(0.12, 0.34, 5).translate(Math.cos(a) * 0.38, 0.45, Math.sin(a) * 0.38), 0xffd84d)); p.push(vcol(new THREE.SphereGeometry(0.06, 6, 5).translate(Math.cos(a) * 0.38, 0.64, Math.sin(a) * 0.38), 0xfff4e6)); } p.push(vcol(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.18, 0.5), 0xff3d6a)); return mergeG(p.map((g) => g.index ? g.toNonIndexed() : g)); })();
  const LOOT_MAX = 700, helm = mkInst(domeG, lootMats.tint, LOOT_MAX, true), trim = mkInst(trimG, lootMats.vc, LOOT_MAX, false), bars = mkInst(barG, lootMats.tint, LOOT_MAX, true), crowns = mkInst(crownG, lootMats.gold, 120, false);
  const lootN = { h: 0, b: 0, c: 0 };
  const metalCol = (k) => { const i = ((k || 1) - 1) % 8; return METAL_HEX[i]; };
  const METAL_HEX = [0xc87838, 0xb5804a, 0xc8ccd4, 0xe8b93a, 0xd6e2ea, 0x6ee0d8, 0x5a7fe0, 0xa6e04a];
  // stack the entries on a world anchor matrix: lean/sway grows toward the top like the 2D stack. size = item width in world units.
  function stackAt(anchor, items, t, moving, size, maxH, seed) {
    const n = items.length; if (!n) return 0;
    anchor.updateWorldMatrix(true, false); tmpM.copy(anchor.matrixWorld);
    const dy = clamp(maxH / n, size * 0.18, size * 0.5), sw = moving ? 1.6 : 0.6;
    for (let i = 0; i < n; i++) {
      const e = items[i]; if (!e) continue;
      const sx = Math.sin(t * 5 + i * 0.8 + seed) * (0.5 + i * 0.4) * 0.012 * sw * size * 8, sz = Math.cos(t * 4 + i * 0.7 + seed) * i * 0.004 * sw * size * 8;
      tmpV.set(sx + Math.sin(i * 2.3) * 0.02 * size * 6, size * 0.3 + i * dy, sz); tmpQ.setFromAxisAngle(UP, (i % 5 - 2) * 0.12 + Math.sin(t * 3 + i) * 0.04 * sw);
      const bar = !!e.bar, crown = !!e.crown, sc = size * (crown ? 1.05 : bar ? 0.9 : 1.0);
      tmpS.set(sc, sc, sc); tmpM2.compose(tmpV, tmpQ, tmpS).premultiply(tmpM);
      if (crown) { if (lootN.c < 120) crowns.setMatrixAt(lootN.c++, tmpM2); }
      else if (bar) { if (lootN.b < LOOT_MAX) { bars.setMatrixAt(lootN.b, tmpM2); bars.setColorAt(lootN.b, tmpC.set(metalCol(e.k))); lootN.b++; } }
      else if (lootN.h < LOOT_MAX) { helm.setMatrixAt(lootN.h, tmpM2); helm.setColorAt(lootN.h, tmpC.set(metalCol(e.k))); trim.setMatrixAt(lootN.h, tmpM2); lootN.h++; }
    }
    return n * dy;
  }
  function lootFlush() {
    helm.count = trim.count = lootN.h; bars.count = lootN.b; crowns.count = lootN.c;
    for (const im of [helm, trim, bars, crowns]) im.instanceMatrix.needsUpdate = true;
    helm.instanceColor.needsUpdate = true; bars.instanceColor.needsUpdate = true; lootN.h = lootN.b = lootN.c = 0;
  }

  // ---- generic entry: holder (position + yaw) around an actor; the actor's own group is never rotated
  function mkEntry(actor, o = {}) {
    const holder = new THREE.Group(); holder.add(actor.group); root.add(holder);
    if (o.scale) holder.scale.setScalar(o.scale);
    return { holder, actor, yaw: 0, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, init: false, st: { speed: 0, atk: false, cast: false, cheer: false, hurt: 0, singing: false, carry: null, glow: false, dash: false, die: 0, role: '' }, hold: 0, aim: 0, lastAtk: 0, scale: o.scale || 1 };
  }
  function place(e, x, z, dt, yawT, k = 12) {
    if (!e.init) { e.init = true; e.px = x; e.pz = z; e.yaw = yawT; }
    e.vx = (x - e.px) / Math.max(dt, 1e-4); e.vz = (z - e.pz) / Math.max(dt, 1e-4); e.px = x; e.pz = z; e.x = x; e.z = z;
    e.yaw += ang(yawT, e.yaw) * (1 - Math.exp(-k * dt)); e.holder.position.set(x, 0, z); e.holder.rotation.y = e.yaw;
  }
  function setAlpha(e, a) {
    const b = e.actor.baked; if (!b || e.alpha === a) return; e.alpha = a;
    for (const m of b.meshes) { const mt = m.material; if (mt.map) continue; const tr = a < 1; if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; } mt.opacity = a; mt.depthWrite = !tr; }
  }
  const nearestFoe = (x, y, r2) => { let best = null, bd = r2; const E = S.enemies; for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.hp <= 0) continue; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } } return best; };

  // ---- the hero + its effects
  const fx = new THREE.Group(); fx.name = 'heroFx'; root.add(fx);
  const spriteMat = (col, op = 1) => new THREE.SpriteMaterial({ map: softTex('glow'), color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const aura = new THREE.Sprite(spriteMat(0xff7eb6)), castGlow = new THREE.Sprite(spriteMat(0xfff0c8)), ghosts = [0, 1, 2].map(() => new THREE.Sprite(spriteMat(0xc6ffd8)));
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), new THREE.MeshBasicMaterial({ color: 0xc6a8ff, transparent: true, opacity: 0.25, depthWrite: false, fog: false })); shield.visible = false;
  for (const o of [aura, castGlow, shield, ...ghosts]) { o.visible = false; o.renderOrder = 6; fx.add(o); }
  const trail = new Float32Array(48 * 3); let trailT = 0, trailN = 0; // recent hero positions for the dash afterimage
  const H = { art: '', e: null }, C0 = { e: null, art: '' };
  function buildHero(art) {
    if (H.e) { root.remove(H.e.holder); disposeEntry(H.e); }
    const a = makeHero(art); const e = mkEntry(a); bake(a, { cast: true }); H.e = e; H.art = art; e.alpha = 1;
  }
  function disposeEntry(e) { try { if (e.actor.dispose) e.actor.dispose(); } catch (err) { /* ignore */ } e.holder.removeFromParent(); }
  function heroGrace() { try { const g = FEATS.find((f) => f.id === 'gear'); return g && g.api && g.api.T ? g.api.T.shield : 0; } catch (err) { return 0; } }
  let hasShot = 0;
  function updateHero(dt, t) {
    const p = S.player, sk = activeSkin(), art = sk.art;
    if (!H.e || H.art !== art) buildHero(art);
    const e = H.e, st = e.st, a = e.actor, x = p.x * WU, z = p.y * WU;
    const sp = Math.hypot(p.vx, p.vy), moving = p.moving || p.dashT > 0;
    // aim: the newest hero shot's target while firing, else the movement heading, else a gentle bias toward the camera
    let yawT = e.yaw, k = 10;
    if (p.atkT > 0) { for (let i = S.shots.length - 1; i >= 0; i--) { const sh = S.shots[i]; if (!sh.ally && !sh.boulder && sh.tgt && sh.tgt.hp > 0) { yawT = Math.atan2((sh.tgt.x - p.x), (sh.tgt.y - p.y)); break; } } k = 16; }
    else if (moving && sp > 30) yawT = Math.atan2(p.vx, p.vy);
    else yawT = clamp(p.face || 1, -1, 1) * 0.35;
    place(e, x, z, dt, yawT, k);
    if (p.atkT > e.lastAtk + 0.001) a.attack(); e.lastAtk = p.atkT;
    if (p.atkT > 0) e.hold = 0.55; else e.hold = Math.max(0, e.hold - dt);
    st.speed = moving ? clamp(sp / 260, 0.45, 1) : 0; st.atk = p.atkT > 0; st.singing = e.hold > 0; st.cast = S.ultCasting > 0; st.cheer = (p.cheerT || 0) > 0 && !st.cast; st.hurt = p.hurtT > 0 ? clamp(p.hurtT / 0.18, 0, 1) : 0; st.dash = p.dashT > 0; st.glow = !!sk.glow;
    a.update(dt, t, st);
    setAlpha(e, p.invuln > 0 && ((S.t * 14) | 0) % 2 && !(heroGrace() > 0) ? 0.5 : 1);
    // effects
    const enc = encoreOn(), pulse = 0.5 + 0.5 * Math.sin(S.t * 3);
    aura.visible = enc || st.glow; if (aura.visible) { aura.material.color.set(enc ? 0xff7eb6 : 0xffd94a); aura.material.opacity = enc ? 0.5 + 0.1 * pulse : 0.35 + 0.1 * pulse; aura.scale.set(enc ? 4 : 2.4, enc ? 4 : 3.4, 1); aura.position.set(x, 0.95, z); }
    const cu = S.ultCasting > 0 ? S.ultCasting / 1.4 : 0, cg = cu > 0 ? Math.sin(clamp(1 - cu, 0, 1) * PI) : 0;
    castGlow.visible = cg > 0.02; if (castGlow.visible) { castGlow.position.set(x, 1.0, z); const s = 3.5 + 6 * cg; castGlow.scale.set(s, s, 1); castGlow.material.opacity = 0.35 + 0.5 * cg; castGlow.material.color.setHSL((S.t * 0.8) % 1, 0.9, 0.8); }
    const gs = heroGrace(); shield.visible = gs > 0; if (shield.visible) { const al = Math.min(1, gs) * (0.35 + 0.1 * Math.sin(S.t * 10)); shield.material.opacity = al * 0.5; shield.position.set(x, 0.9, z); const r = 0.98 + 0.02 * Math.sin(S.t * 8); shield.scale.set(r, r * 1.08, r); }
    trailT -= dt; if (trailT <= 0) { trailT = 0.035; trail.copyWithin(3, 0, 45); trail[0] = x; trail[1] = 0.9; trail[2] = z; trailN = Math.min(15, trailN + 1); }
    for (let i = 0; i < 3; i++) { const g = ghosts[i], idx = (i + 1) * 2 * 3; g.visible = st.dash && trailN > (i + 1) * 2; if (g.visible) { g.position.set(trail[idx], trail[idx + 1], trail[idx + 2]); g.scale.set(1.1 - i * 0.15, 2.0, 1); g.material.opacity = 0.55 - i * 0.16; g.material.color.set(i % 2 ? 0xfff4e6 : 0xc6ffd8); } }
    if (cu > 0) { const r = 1 + (1 - cu) * 5; rings.add(x, z, r, 0.8 * cu, 0xff9ac8, 0.06); rings.add(x, z, r * 0.6, 0.6 * cu, 0xfff0c8, 0.065); }
    return { x, z };
  }

  // ---- companion
  function updateCompanion(dt, t) {
    const c = S.comp, art = activeSkin().comp;
    if (!C0.e || C0.art !== art) { if (C0.e) disposeEntry(C0.e); const a = makeHero(art, { pack: true }); C0.e = mkEntry(a); bake(a, { cast: true }); C0.art = art; }
    const e = C0.e, st = e.st, a = e.actor, x = c.x * WU, z = c.y * WU, moving = (c.mv || 0) > 0;
    place(e, x, z, dt, moving ? Math.atan2(e.vx, e.vz) : clamp(c.face || 1, -1, 1) * 0.35, 9);
    if ((c.drop || 0) > 0.3 && !(e.drop > 0.3)) a.attack(); e.drop = c.drop || 0;
    st.speed = moving ? 0.8 : 0; st.atk = false; st.singing = false; st.hurt = 0; st.cast = st.cheer = st.dash = false;
    a.update(dt, t, st);
    const items = S.player.helmets, n = items.length, hgt = stackAt(a.anchor, items, t, moving, 0.32, 1.4, 0);
    blobs.add(x, z, 0.5, 0.3);
    a.anchor.getWorldPosition(tmpV);
    if (n) V.labels.pill(n + '/' + cap(), tmpV.x, tmpV.y + hgt * 1.1 + 0.5, tmpV.z, { fill: n >= cap() ? '#ffe98a' : '#ffffff', stroke: n >= cap() ? '#f0b422' : '#dccaff', c1: n >= cap() ? '#ffe98a' : '#ffffff', c2: n >= cap() ? '#f0b422' : '#dccaff', size: 11, px: 11 });
  }

  // ---- fans
  const fanPool = new Map(), fans = new Map(); // art|variant -> free actors; id -> entry
  const FAN_V = 6;
  let built = 0;
  function fanFor(f) {
    let e = fans.get(f.id);
    if (e) return e;
    if (built >= 2) return null; // build at most two crowd actors per frame, the rest appear next frame
    const v = Math.floor(hash01(f.id * 7 + 3) * FAN_V), key = f.art + '|' + v, free = fanPool.get(key);
    if (free && free.length) { e = free.pop(); e.holder.visible = true; }
    else {
      built++;
      const a = makeHero(FAN_ARTS.includes(f.art) ? f.art : 'rawclaw', { fan: true, seed: v + FAN_ARTS.indexOf(f.art) * 3 + 1, acc: v % 5 }); a.height = 0.94; a.radius = 0.25;
      e = mkEntry(a, { scale: 0.55 }); bake(a, { cast: false }); if (a.baked) for (const m of a.baked.meshes) m.castShadow = false; e.key = key; e.alpha = 1;
    }
    e.init = false; e.id = f.id; fans.set(f.id, e); return e;
  }
  function releaseFan(e) { e.holder.visible = false; const l = fanPool.get(e.key) || []; l.push(e); fanPool.set(e.key, l); if (l.length > 8) { const old = l.shift(); disposeEntry(old); } }
  const seen = new Set();
  const badgeMeshes = {}, badgeN = {};
  for (const k in BADGES) { const m = new THREE.MeshBasicMaterial({ map: badgeTex(k), transparent: true, depthWrite: false, fog: false }); const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.34), m, 48); im.frustumCulled = false; im.count = 0; im.renderOrder = 7; root.add(im); badgeMeshes[k] = im; badgeN[k] = 0; }
  function updateFans(dt, t, focus) {
    seen.clear(); for (const k in badgeN) badgeN[k] = 0;
    const cam = V.camera;
    for (let i = 0; i < S.pop.length; i++) {
      const f = S.pop[i], fx0 = f.x * WU, fz0 = f.y * WU; seen.add(f.id);
      const far = focus && Math.hypot(fx0 - focus.x, fz0 - focus.z) > 45;
      let e = fans.get(f.id); if (far) { if (e) e.holder.visible = false; continue; }
      e = e || fanFor(f); if (!e) continue; e.holder.visible = true;
      const st = e.st, a = e.actor, moving = (f.mv || 0) > 0, fight = f.role === 'fight';
      let yawT;
      if ((f.atkT || 0) > 0) { if (!(e.lastAtk > 0)) { const fo = nearestFoe(f.x, f.y, 520 * 520); e.aim = fo ? Math.atan2(fo.x - f.x, fo.y - f.y) : e.yaw; a.attack(); } yawT = e.aim; } else yawT = moving && Math.hypot(e.vx, e.vz) > 0.4 ? Math.atan2(e.vx, e.vz) : (fight ? e.yaw * 0.9 : clamp(f.face || 1, -1, 1) * 0.4);
      e.lastAtk = f.atkT || 0;
      place(e, fx0, fz0, dt, yawT, 11);
      st.speed = moving ? clamp(Math.hypot(e.vx, e.vz) / 5, 0.4, 1) : 0; st.atk = (f.atkT || 0) > 0; st.role = f.role; st.carry = f.carry; st.cheer = false;
      a.update(dt, t, st);
      blobs.add(fx0, fz0, 0.3, 0.32);
      rings.add(fx0, fz0, 0.34, 0.9, fight ? 0x7fe36a : 0x6ac8ff, 0.05);
      if (f.carry && f.carry.length && e.actor.rig) stackAt(e.actor.anchor, f.carry, t, moving, 0.3, 0.75, f.id);
      if (f.spec && BADGES[f.spec]) {
        const b = BADGES[f.spec], ok = b.role === f.role, im = badgeMeshes[f.spec], n = badgeN[f.spec];
        if (n < 48) { tmpV.set(fx0 + 0.3, 0.95, fz0); tmpQ.copy(cam ? cam.quaternion : tmpQ.identity()); tmpS.setScalar(ok ? 1 : 0.8); tmpM.compose(tmpV, tmpQ, tmpS); im.setMatrixAt(n, tmpM); badgeN[f.spec]++; }
        if (f.spec === 'drummer' && fight) { const ph = (S.t * 2) % 1, R1 = 3.2; rings.add(fx0, fz0, R1 * (0.25 + 0.75 * ph), 0.5 * (1 - ph), 0xc6a8ff, 0.05); rings.add(fx0, fz0, R1, 0.25, 0xc6a8ff, 0.048); }
      }
    }
    for (const k in badgeMeshes) { badgeMeshes[k].count = badgeN[k]; badgeMeshes[k].instanceMatrix.needsUpdate = true; }
    for (const [id, e] of fans) if (!seen.has(id)) { fans.delete(id); releaseFan(e); }
  }

  // ---- the stall keeper
  let jordan = null;
  function updateJordan(dt, t) {
    if (!jordan) { const a = makeHero('jordan'); jordan = mkEntry(a); bake(a, { cast: true }); }
    const e = jordan; place(e, SELL.x * WU, (SELL.y + 6) * WU, dt, 0, 12); e.holder.position.y = 0; e.actor.update(dt, t, e.st);
  }

  return {
    update(dt, t, focus) {
      built = 0; rings.begin();
      let f = focus;
      try { f = updateHero(dt, t) || focus; } catch (err) { if (!this._e1) { this._e1 = 1; console.warn('heroes3d hero', err); } }
      try { updateCompanion(dt, t); } catch (err) { if (!this._e2) { this._e2 = 1; console.warn('heroes3d comp', err); } }
      try { updateFans(dt, t, f); } catch (err) { if (!this._e3) { this._e3 = 1; console.warn('heroes3d fans', err); } }
      try { updateJordan(dt, t); } catch (err) { if (!this._e4) { this._e4 = 1; console.warn('heroes3d jordan', err); } }
      lootFlush(); rings.end();
    },
    makeHero, get hero() { return H.e && H.e.actor; }, get companion() { return C0.e && C0.e.actor; }, get keeper() { return jordan && jordan.actor; }, fanCount: () => fans.size, fanActors: () => [...fans.values()].map((e) => e.actor),
    dispose() { root.removeFromParent(); },
  };
}
function mergeG(list) { // tiny local merge (non-indexed position/normal/color) so heroes3d needs no extra import path
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3); o += c; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m;
}
export { bakeActor };
