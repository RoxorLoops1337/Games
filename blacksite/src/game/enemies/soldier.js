// The soldier himself: a skeleton, a skinned body built out of primitives, and
// the two cheap stand-ins he turns into at distance.
//
// Everything is authored once at boot and shared by every rig in the pool. The
// geometry is built in bind space — feet on the origin, facing −Z, arms hanging —
// so the bone inverses fall out of the rest pose for free and every vertex can be
// weighted by where it sits rather than by a painted map we have no tool to paint.
//
// Why primitives and not a modelled mesh: the brief is no downloaded assets, and
// a body assembled from capsules and rounded boxes is exactly what a low-poly
// character is anyway once it is 15 m from the camera. The silhouette is doing
// all the work — helmet, plate carrier, shoulder line, boots — so that is where
// the vertices went.

import * as THREE from 'three';

// name, parent index, offset from the parent joint.
// Bone +Y always runs toward the child, which is what lets `boneQuat` aim a limb
// by pointing one axis and twisting about it.
export const BONES = [
  ['root',   -1,  0,      0,      0],
  ['pelvis',  0,  0,      0.955,  0],
  ['spine',   1,  0,      0.135,  0],
  ['chest',   2,  0,      0.170,  0],
  ['neck',    3,  0,      0.190,  0],
  ['head',    4,  0,      0.090,  0],
  ['clavR',   3,  0.058,  0.130,  0],
  ['armR',    6,  0.167,  0,      0],
  ['foreR',   7,  0,     -0.285,  0],
  ['handR',   8,  0,     -0.260,  0],
  ['clavL',   3, -0.058,  0.130,  0],
  ['armL',   10, -0.167,  0,      0],
  ['foreL',  11,  0,     -0.285,  0],
  ['handL',  12,  0,     -0.260,  0],
  ['thighR',  1,  0.095, -0.070,  0],
  ['shinR',  14,  0,     -0.450,  0],
  ['footR',  15,  0,     -0.355,  0],
  ['toeR',   16,  0,     -0.050, -0.125],
  ['thighL',  1, -0.095, -0.070,  0],
  ['shinL',  18,  0,     -0.450,  0],
  ['footL',  19,  0,     -0.355,  0],
  ['toeL',   20,  0,     -0.050, -0.125],
];

export const B = BONES.reduce((m, b, i) => (m[b[0]] = i, m), {});

// Measurements the poser needs and the geometry already assumes. Kept here so a
// change to the body changes the animation with it.
export const DIM = {
  hipY: 0.885, kneeY: 0.435, ankleY: 0.080,
  thigh: 0.450, shin: 0.355,
  shoulderY: 1.390, shoulderX: 0.225,
  upperArm: 0.285, foreArm: 0.260,
  chestY: 1.260, headY: 1.540, eyeY: 1.635,
  standPelvis: 0.925,        // 3 cm under the bind height: knees never lock
  crouchDrop: 0.400,
  footHalf: 0.125,
  // Where the rifle sits in the right hand's frame. The hand *is* the gun mount:
  // the poser places the weapon and the wrist inherits it, so the muzzle below is
  // exact rather than approximated.
  gunStock: [0, 0.050, 0.235],
  gunFore: [0, -0.015, -0.205],
  gunMuzzle: [0, 0.062, -0.512],
  gunEject: [0.045, 0.070, -0.030],
};

// ── vertex colours and surface response ──────────────────────────────────────
// One material for the whole body. Albedo rides the colour attribute and
// roughness/metalness ride a second two-channel attribute the shader patch
// unpacks, so a soldier in kit is one draw call instead of six.

const SURF = {
  cloth: [0.94, 0.0],
  webbing: [0.80, 0.0],
  hard: [0.52, 0.10],
  rubber: [0.72, 0.0],
  metal: [0.34, 0.72],
  skin: [0.68, 0.0],
};

// Lifted off black on purpose. A soldier in true dark olive disappears into a
// concrete level under a low sun, and an enemy the player cannot pick out of the
// background is a bug however accurate the colour is.
const COL = {
  fatigue: 0x4e5340,
  fatigueDark: 0x373b2e,
  carrier: 0x23251e,
  pouch: 0x33362b,
  helmet: 0x2b2e26,
  boot: 0x1a1c1d,
  glove: 0x202223,
  face: 0x25272b,
  skin: 0x9a7355,
  gun: 0x1e2124,
  gunMetal: 0x3a3e43,
  lens: 0x2c3f42,
};

// ── primitive helpers ────────────────────────────────────────────────────────

const _mat = new THREE.Matrix4();
const _v = new THREE.Vector3();

function place(geom, x, y, z, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) {
    _mat.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    _mat.setPosition(x, y, z);
  } else {
    _mat.makeTranslation(x, y, z);
  }
  geom.applyMatrix4(_mat);
  return geom;
}

function ellipsoid(rx, ry, rz, wSeg = 8, hSeg = 6) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.scale(rx, ry, rz);
  return g;
}

// A box with its corners knocked off, built by pushing every box vertex out from
// the inner core onto a rounded shell. Gear is boxy — that boxiness is what tells
// the eye "plate carrier" and not "torso" — but a hard 90° corner catches the sun
// like plastic, and one rounding pass fixes it for 30 extra vertices.
function roundBox(w, h, d, r, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position;
  const ix = Math.max(0, w / 2 - r), iy = Math.max(0, h / 2 - r), iz = Math.max(0, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const cx = clampf(x, -ix, ix), cy = clampf(y, -iy, iy), cz = clampf(z, -iz, iz);
    _v.set(x - cx, y - cy, z - cz);
    const l = _v.length();
    if (l > 1e-6) _v.multiplyScalar(r / l);
    p.setXYZ(i, cx + _v.x, cy + _v.y, cz + _v.z);
  }
  return g;
}

function capsule(r, len, radial = 8) {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, radial);
}

const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (e0, e1, x) => {
  const t = clampf((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── skin weighting ───────────────────────────────────────────────────────────

// Kit does not deform: a pouch belongs to exactly one bone and the eye reads the
// hard edge as equipment rather than as a tear in the mesh.
function rigid(b) {
  return (x, y, z, o) => { o[0] = b; o[1] = 1; o[2] = o[3] = o[4] = o[5] = o[6] = o[7] = 0; };
}

// A limb segment: its own bone through the middle, easing into the parent at the
// proximal end and into the child at the distal one. The two soft bands are the
// whole shoulder and knee solution — a hard split there is what makes a
// procedural character crease like folded paper.
function segment(bone, prev, next, yTop, yBot, softTop = 0.09, softBot = 0.09, kTop = 0.42, kBot = 0.46) {
  return (x, y, z, o) => {
    const wp = prev >= 0 ? kTop * (1 - sstep(0, 1, (yTop - y) / softTop)) : 0;
    const wn = next >= 0 ? kBot * (1 - sstep(0, 1, (y - yBot) / softBot)) : 0;
    o[0] = bone; o[1] = Math.max(0, 1 - wp - wn);
    o[2] = prev >= 0 ? prev : bone; o[3] = wp;
    o[4] = next >= 0 ? next : bone; o[5] = wn;
    o[6] = bone; o[7] = 0;
  };
}

// The foot runs along −Z rather than −Y, so its blend into the toe is a depth
// blend. Toes matter more than they sound: the roll onto the ball of the foot at
// the end of stance is most of what sells a planted stride.
function footWeight(foot, shin, toe, zBall) {
  return (x, y, z, o) => {
    const wn = 0.55 * sstep(0, 1, (zBall - z) / 0.07);
    const wp = 0.30 * (1 - sstep(0, 1, (0.135 - y) / 0.05));
    o[0] = foot; o[1] = Math.max(0, 1 - wn - wp);
    o[2] = toe; o[3] = wn;
    o[4] = shin; o[5] = wp;
    o[6] = foot; o[7] = 0;
  };
}

// ── merge ────────────────────────────────────────────────────────────────────

function mergeParts(parts, skinned) {
  let vc = 0, ic = 0;
  for (const p of parts) { vc += p.g.attributes.position.count; ic += p.g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const col = new Float32Array(vc * 3), srf = new Float32Array(vc * 2);
  const si = skinned ? new Uint16Array(vc * 4) : null;
  const sw = skinned ? new Float32Array(vc * 4) : null;
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);

  const c = new THREE.Color();
  const w = new Array(8).fill(0);
  let vo = 0, io = 0;

  for (const part of parts) {
    const g = part.g;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const I = g.index;
    c.setHex(part.color, THREE.SRGBColorSpace);
    const s = part.surf || SURF.cloth;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const o = (vo + i) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
      srf[(vo + i) * 2] = s[0]; srf[(vo + i) * 2 + 1] = s[1];
      if (skinned) {
        part.w(x, y, z, w);
        const t = (w[1] + w[3] + w[5] + w[7]) || 1;
        const k = (vo + i) * 4;
        si[k] = w[0]; si[k + 1] = w[2]; si[k + 2] = w[4]; si[k + 3] = w[6];
        sw[k] = w[1] / t; sw[k + 1] = w[3] / t; sw[k + 2] = w[5] / t; sw[k + 3] = w[7] / t;
      }
    }
    for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
    vo += P.count; io += I.count;
    g.dispose();
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geom.setAttribute('aSurf', new THREE.BufferAttribute(srf, 2));
  if (skinned) {
    geom.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geom.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeVertexNormals();
  // The bind-pose bounds are wrong the moment the body moves, so give the culler
  // a sphere big enough to cover any pose instead of letting a lunging soldier
  // pop out of frame at the edge of the screen.
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.45);
  geom.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.4, -1), new THREE.Vector3(1, 2.1, 1));
  return geom;
}

// ── the body ─────────────────────────────────────────────────────────────────

function buildBodyParts() {
  const p = [];
  const add = (g, color, surf, w) => p.push({ g, color, surf, w });
  const M = DIM;

  // Torso: three overlapping ellipsoids rather than one barrel, because the
  // waist has to be narrower than both the ribcage and the hips or the body
  // reads as a bollard in a helmet.
  add(place(ellipsoid(0.148, 0.128, 0.115), 0, 0.955, 0), COL.fatigue, SURF.cloth,
    segment(B.pelvis, -1, B.spine, 1.09, 0.83, 0.10, 0.12, 0.4, 0.42));
  add(place(ellipsoid(0.136, 0.122, 0.106), 0, 1.115, 0), COL.fatigue, SURF.cloth,
    segment(B.spine, B.pelvis, B.chest, 1.24, 0.99, 0.13, 0.13));
  add(place(ellipsoid(0.166, 0.150, 0.118), 0, 1.285, 0), COL.fatigue, SURF.cloth,
    segment(B.chest, B.spine, B.neck, 1.42, 1.15, 0.14, 0.13, 0.40, 0.30));

  // Plate carrier. Sits proud of the chest and squares the silhouette off — the
  // one shape that turns "person" into "soldier" at 30 m. The straps over the
  // trapezius matter as much as the plate: they are what widens the shoulder
  // line, and a narrow shoulder line is what makes a character read as a doll.
  add(place(roundBox(0.402, 0.390, 0.300, 0.050), 0, 1.255, 0), COL.carrier, SURF.hard, rigid(B.chest));
  add(place(roundBox(0.090, 0.070, 0.300, 0.028), 0.125, 1.428, -0.010), COL.carrier, SURF.hard, rigid(B.chest));
  add(place(roundBox(0.090, 0.070, 0.300, 0.028), -0.125, 1.428, -0.010), COL.carrier, SURF.hard, rigid(B.chest));
  add(place(roundBox(0.100, 0.108, 0.060, 0.022), 0.078, 1.190, -0.145), COL.pouch, SURF.webbing, rigid(B.chest));
  add(place(roundBox(0.100, 0.108, 0.060, 0.022), -0.020, 1.190, -0.148), COL.pouch, SURF.webbing, rigid(B.chest));
  add(place(roundBox(0.086, 0.070, 0.052, 0.020), -0.098, 1.196, -0.140), COL.pouch, SURF.webbing, rigid(B.chest));
  add(place(roundBox(0.150, 0.062, 0.046, 0.018), 0.010, 1.318, -0.142), COL.pouch, SURF.webbing, rigid(B.chest));
  add(place(roundBox(0.128, 0.150, 0.082, 0.024), -0.045, 1.270, 0.156), COL.pouch, SURF.webbing, rigid(B.chest));
  add(place(new THREE.BoxGeometry(0.020, 0.020, 0.150), -0.045, 1.360, 0.150), COL.gunMetal, SURF.metal, rigid(B.chest));

  // Belt and drop pouches.
  add(place(roundBox(0.352, 0.078, 0.258, 0.030), 0, 0.902, 0), COL.carrier, SURF.webbing, rigid(B.pelvis));
  add(place(roundBox(0.096, 0.115, 0.062, 0.022), 0.172, 0.700, -0.030), COL.pouch, SURF.webbing, rigid(B.thighR));
  add(place(roundBox(0.086, 0.100, 0.058, 0.020), -0.168, 0.720, 0.010), COL.pouch, SURF.webbing, rigid(B.thighL));

  // Shoulders. Weighted to the clavicles so the deltoid rolls with the arm
  // instead of shearing at the seam.
  for (const s of [1, -1]) {
    const clav = s > 0 ? B.clavR : B.clavL;
    const arm = s > 0 ? B.armR : B.armL;
    const fore = s > 0 ? B.foreR : B.foreL;
    const hand = s > 0 ? B.handR : B.handL;
    add(place(ellipsoid(0.098, 0.088, 0.096, 8, 5), s * M.shoulderX, 1.378, 0), COL.fatigueDark, SURF.cloth,
      (x, y, z, o) => { o[0] = clav; o[1] = 0.55; o[2] = arm; o[3] = 0.40; o[4] = B.chest; o[5] = 0.05; o[6] = clav; o[7] = 0; });
    add(place(capsule(0.058, 0.170), s * M.shoulderX, 1.2475, 0), COL.fatigue, SURF.cloth,
      segment(arm, clav, fore, 1.39, 1.105, 0.075, 0.075, 0.45, 0.42));
    add(place(capsule(0.048, 0.165), s * M.shoulderX, 0.975, 0), COL.fatigue, SURF.cloth,
      segment(fore, arm, hand, 1.105, 0.845, 0.075, 0.055, 0.40, 0.30));
    // Elbow pad — reads as kit and hides the crease at the same time.
    add(place(roundBox(0.084, 0.092, 0.086, 0.032), s * M.shoulderX, 1.098, -0.012), COL.fatigueDark, SURF.hard,
      (x, y, z, o) => { o[0] = fore; o[1] = 0.55; o[2] = arm; o[3] = 0.45; o[4] = fore; o[5] = 0; o[6] = fore; o[7] = 0; });
  }

  // Neck and head. The face is a balaclava with a strip of skin at the eyes: a
  // bare face needs features this budget cannot pay for, and a covered one is
  // what the reference wears anyway.
  add(place(capsule(0.050, 0.055), 0, 1.470, -0.005), COL.face, SURF.skin,
    segment(B.neck, B.chest, B.head, 1.53, 1.40, 0.06, 0.06, 0.45, 0.35));
  add(place(ellipsoid(0.094, 0.113, 0.102), 0, 1.628, -0.004), COL.face, SURF.cloth, rigid(B.head));
  add(place(ellipsoid(0.070, 0.030, 0.022, 8, 4), 0, 1.652, -0.090), COL.skin, SURF.skin, rigid(B.head));
  // Helmet: a cut sphere, a brim, and the rail furniture that breaks its outline.
  const dome = new THREE.SphereGeometry(0.121, 10, 6, 0, Math.PI * 2, 0, 1.75);
  dome.scale(1, 1.02, 1.06);
  add(place(dome, 0, 1.636, 0.004), COL.helmet, SURF.hard, rigid(B.head));
  add(place(roundBox(0.150, 0.030, 0.060, 0.012), 0, 1.664, -0.104), COL.helmet, SURF.hard, rigid(B.head));
  add(place(roundBox(0.186, 0.048, 0.052, 0.018), 0, 1.688, -0.072), COL.lens, SURF.metal, rigid(B.head));
  add(place(roundBox(0.030, 0.056, 0.070, 0.014), 0.112, 1.622, 0.010), COL.helmet, SURF.hard, rigid(B.head));
  add(place(roundBox(0.030, 0.056, 0.070, 0.014), -0.112, 1.622, 0.010), COL.helmet, SURF.hard, rigid(B.head));
  add(place(new THREE.BoxGeometry(0.034, 0.034, 0.030), 0, 1.716, -0.086), COL.gunMetal, SURF.metal, rigid(B.head));

  // Legs. Boots are deliberately oversized: a soldier's foot is a slab and a
  // dainty one makes the whole body look like it is standing on tiptoe.
  for (const s of [1, -1]) {
    const thigh = s > 0 ? B.thighR : B.thighL;
    const shin = s > 0 ? B.shinR : B.shinL;
    const foot = s > 0 ? B.footR : B.footL;
    const toe = s > 0 ? B.toeR : B.toeL;
    add(place(capsule(0.091, 0.268), s * 0.098, 0.660, 0), COL.fatigue, SURF.cloth,
      segment(thigh, B.pelvis, shin, 0.885, 0.435, 0.11, 0.09, 0.42, 0.44));
    add(place(capsule(0.068, 0.219), s * 0.098, 0.2575, 0.004), COL.fatigue, SURF.cloth,
      segment(shin, thigh, foot, 0.435, 0.080, 0.085, 0.06, 0.42, 0.25));
    add(place(roundBox(0.098, 0.104, 0.100, 0.036), s * 0.098, 0.440, -0.020), COL.fatigueDark, SURF.hard,
      (x, y, z, o) => { o[0] = shin; o[1] = 0.55; o[2] = thigh; o[3] = 0.45; o[4] = shin; o[5] = 0; o[6] = shin; o[7] = 0; });
    add(place(roundBox(0.114, 0.110, 0.274, 0.032), s * 0.098, 0.058, -0.048), COL.boot, SURF.rubber,
      footWeight(foot, shin, toe, -0.100));
    add(place(roundBox(0.110, 0.068, 0.112, 0.024), s * 0.098, 0.132, 0.038), COL.boot, SURF.rubber,
      footWeight(foot, shin, toe, -0.100));
  }

  // Gloves, authored in the hand's own frame — which, in bind, hangs at the
  // wrist with the fingers pointing down.
  add(place(roundBox(0.074, 0.116, 0.086, 0.030), M.shoulderX, 0.800, 0.004), COL.glove, SURF.rubber, rigid(B.handR));
  add(place(roundBox(0.074, 0.116, 0.086, 0.030), -M.shoulderX, 0.800, 0.004), COL.glove, SURF.rubber, rigid(B.handL));

  return p;
}

// The rifle is skinned rigidly to the right hand rather than parented as a prop.
// It costs no extra draw call, it can never desync from the hand, and it means
// the muzzle marker is a child of the same bone the poser aims.
function buildRifleParts() {
  const p = [];
  const hx = DIM.shoulderX, hy = 0.845;   // the right wrist, in bind
  const add = (g, color, surf) => p.push({ g, color, surf, w: rigid(B.handR) });
  const at = (g, x, y, z, rx = 0) => place(g, hx + x, hy + y, z, rx);

  add(at(roundBox(0.056, 0.086, 0.300, 0.014), 0, 0.062, -0.070), COL.gun, SURF.hard);          // receiver
  add(at(roundBox(0.050, 0.056, 0.250, 0.012), 0, 0.060, -0.330), COL.gun, SURF.hard);          // handguard
  add(at(new THREE.CylinderGeometry(0.011, 0.011, 0.150, 6), 0, 0.062, -0.430, Math.PI / 2), COL.gunMetal, SURF.metal);
  add(at(roundBox(0.030, 0.030, 0.052, 0.008), 0, 0.062, -0.482), COL.gunMetal, SURF.metal);    // brake
  add(at(roundBox(0.048, 0.082, 0.190, 0.020), 0, 0.048, 0.165), COL.gun, SURF.hard);           // stock
  add(at(roundBox(0.040, 0.062, 0.140, 0.016), 0, 0.058, 0.052), COL.gun, SURF.hard);           // buffer tube
  add(place(roundBox(0.040, 0.110, 0.050, 0.014), hx, hy - 0.048, 0.014, 0.34), COL.gun, SURF.hard);   // pistol grip
  add(place(roundBox(0.036, 0.150, 0.078, 0.012), hx, hy - 0.040, -0.118, -0.12), COL.gun, SURF.hard); // magazine
  add(at(roundBox(0.038, 0.052, 0.112, 0.012), 0, 0.128, -0.110), COL.gunMetal, SURF.hard);     // optic
  add(at(new THREE.BoxGeometry(0.026, 0.006, 0.230), 0, 0.106, -0.170), COL.gunMetal, SURF.metal); // rail
  for (const q of p) q.w = rigid(B.handR);
  return p;
}

// ── far LOD ──────────────────────────────────────────────────────────────────
// Past ~30 m the skinning, the pouches and the fingers are all sub-pixel. What
// still reads is the silhouette and the fact that the legs are moving, so that is
// all the far body keeps: three boxes and a swing.

function buildFarParts() {
  const p = [];
  const add = (g, color, surf) => p.push({ g, color, surf });
  add(place(new THREE.BoxGeometry(0.400, 0.560, 0.280), 0, 1.230, 0), COL.carrier, SURF.hard);
  add(place(new THREE.BoxGeometry(0.190, 0.230, 0.210), 0, 1.628, 0), COL.helmet, SURF.hard);
  add(place(new THREE.BoxGeometry(0.520, 0.130, 0.150), 0.030, 1.290, -0.140), COL.fatigue, SURF.cloth);
  add(place(new THREE.BoxGeometry(0.060, 0.090, 0.700), 0.110, 1.400, -0.260), COL.gun, SURF.hard);
  return p;
}

function buildFarLegParts() {
  // Authored hanging from the origin so the mesh can be rotated straight from
  // the hip without a parent transform.
  return [{ g: place(new THREE.BoxGeometry(0.140, 0.800, 0.170), 0, -0.400, 0), color: COL.fatigue, surf: SURF.cloth }];
}

// ── materials ────────────────────────────────────────────────────────────────

// A rim term and the packed surface attribute, injected into whatever the
// materials module handed us so the soldier inherits its tone map, envmap and
// any future texture work for free. If the patch fails to compile the body still
// renders — it just goes uniformly rough, which is a bad look and not a crash.
function patchSoldier(mat, rim) {
  mat.vertexColors = true;
  mat.color.setHex(0xffffff);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSurf;\nvarying vec2 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nvarying vec2 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = vSurf.y;')
      // Wrap light at the silhouette. A body lit only from the front dies into
      // the background; a hot edge is what separates a man from a wall behind
      // him, and it is the cheapest possible substitute for area lighting.
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\tfloat rimF = 1.0 - abs(dot(normal, normalize(vViewPosition)));\n\ttotalEmissiveRadiance += uRim * pow(rimF, 3.5);');
  };
  mat.customProgramCacheKey = () => 'bs-soldier-1';
  mat.needsUpdate = true;
  return mat;
}

// Takes the world material's *response* — env map, fog, tone mapping, whatever
// the render layer decides those should be — and leaves its maps behind. The
// level's surfaces are triplanar world-space projections, which is right for a
// wall and wrong for a man: walk through one and the texture swims over him.
// The body carries its colour per vertex instead.
function baseMaterial(materials, name, fallback) {
  const m = new THREE.MeshStandardMaterial();
  let src = null;
  try { src = materials && materials.get ? materials.get(name) : null; } catch { src = null; }
  if (src && src.isMeshStandardMaterial) {
    m.envMap = src.envMap;
    if (Number.isFinite(src.envMapIntensity)) m.envMapIntensity = src.envMapIntensity;
    m.fog = src.fog;
    m.toneMapped = src.toneMapped;
    m.dithering = src.dithering;
    m.shadowSide = src.shadowSide;
  }
  Object.assign(m, fallback);
  return m;
}

export function buildSoldierAssets(materials) {
  const rim = new THREE.Color(0x2a3644).multiplyScalar(0.55);

  const body = patchSoldier(baseMaterial(materials, 'dark', {
    roughness: 0.9, metalness: 0.0, envMapIntensity: 0.9, dithering: true,
  }), rim);
  body.name = 'soldier';

  const eye = baseMaterial(materials, 'dark', {
    roughness: 0.22, metalness: 0.0, color: new THREE.Color(0x0b0c0d),
    emissive: new THREE.Color(0x1b2026), emissiveIntensity: 1,
  });
  eye.vertexColors = false;
  eye.name = 'soldier-eye';

  const skinGeometry = mergeParts(buildBodyParts().concat(buildRifleParts()), true);
  const farGeometry = mergeParts(buildFarParts(), false);
  const farLegGeometry = mergeParts(buildFarLegParts(), false);

  // Two slits, authored around their own centre so a blink is a scale on Y and
  // a glance is an offset on X. Small, dark and just wet enough to catch a
  // highlight — the blink is worth more than the geometry is.
  const eyeGeometry = mergeParts([
    { g: place(new THREE.BoxGeometry(0.030, 0.015, 0.012), 0.036, 0, 0), color: 0x0a0b0c, surf: SURF.skin },
    { g: place(new THREE.BoxGeometry(0.030, 0.015, 0.012), -0.036, 0, 0), color: 0x0a0b0c, surf: SURF.skin },
  ], false);

  return {
    skinGeometry, farGeometry, farLegGeometry, eyeGeometry,
    materials: { body, eye }, rim,
    vertexCount: skinGeometry.attributes.position.count,
  };
}

// Builds one instance's bone hierarchy. Every rig needs its own bones (they hold
// the pose) but they all share one set of inverses, computed once from the rest
// pose below — which is also why the geometry above could be authored in world
// space and simply weighted.
export function buildSkeletonBones() {
  const bones = [];
  for (let i = 0; i < BONES.length; i++) {
    const [name, parent, x, y, z] = BONES[i];
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent >= 0) bones[parent].add(b);
    bones.push(b);
  }
  bones[0].updateMatrixWorld(true);
  return bones;
}
