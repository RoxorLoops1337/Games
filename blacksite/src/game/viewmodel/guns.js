// The five weapons, built out of profiles.
//
// Everything lives in one convention so the animation layer never has to think
// about which gun it is holding: the bore runs along Z with -Z forward (the view
// camera looks down -Z), the bore line is at y = 0, and the origin is the
// trigger — which is roughly where the right hand is, and therefore the natural
// thing to position in camera space.
//
// Each builder returns the same contract:
//
//   group      the assembled weapon in weapon space
//   sight      { pos, dir, up } — the *rear* sight datum and the line through it
//   eyeRelief  how far behind that datum the eye sits when aiming
//   hip        the camera-space pose when not aiming
//   nodes      the parts the animator moves: mag, charge, trigger, pump, slide
//   optic      lens centre/radius, for the collimated reticle
//   muzzle     where a flash belongs
//
// The sight datum is the only thing the ADS solve needs, and it is deliberately
// not assumed to be parallel to the bore. On the shotgun the rear ghost ring
// stands 4 cm over a bore-level bead, so the sight line slopes 2.5° nose-down
// relative to the barrel. A viewmodel that just slides toward the screen centre
// gets that wrong and the whole gun looks like it is aiming at the floor.

import * as THREE from 'three';
import {
  roundRectPts, receiverPts, extrudePts, slab, latheZ, sweep, frameChain,
  tubeCurve, partBin,
} from './geometry.js';
import { buildHand, placeHand } from './hands.js';

// A profile drawn in the (z, y) plane — the weapon's side view — extruded across
// its width. Half the parts of a gun are best described this way: trigger
// guards, magwells, stocks, receivers seen from the side.
function sideProfile(pts, width, opts) {
  const g = extrudePts(pts, width, opts);
  g.rotateY(-Math.PI / 2);
  return g;
}

// ── shared sub-assemblies ───────────────────────────────────────────────────

// MIL-STD-1913. It is a row of trapezoid ribs with slots between them, and it
// is worth building for real: it runs down the top of the silhouette where the
// eye tracks, and a smooth bar there reads as a toy.
function railRibs(add, z0, z1, y, w, hex) {
  const base = slab(w, 0.0035, z0 - z1, 0.0008, 0.0006);
  base.translate(0, y + 0.00175, (z0 + z1) / 2);
  add(base, hex, { wear: 0.7 });
  const pitch = 0.0100, rw = 0.0052;
  const n = Math.floor((z0 - z1) / pitch);
  const trap = [[-w / 2, 0], [w / 2, 0], [w / 2 * 0.80, 0.0052], [-w / 2 * 0.80, 0.0052]];
  for (let i = 0; i < n; i++) {
    const z = z0 - 0.004 - i * pitch;
    const g = extrudePts(trap, rw, { bevel: 0.0006, bevelSegments: 1 });
    g.translate(0, y + 0.0035, z);
    add(g, hex, { wear: 0.9, ao: 0.2 });
  }
}

// A tube optic: mount, body, bezels, and the hollow bore through it. The
// hollowness matters — you look *through* a red dot, and a capped tube reads as
// a soup can bolted to the gun.
function tubeOptic(add, opts) {
  const { z0, z1, y, r, hex } = opts;
  const rIn = r - 0.0035;
  const body = latheZ([
    [rIn, z0], [r * 1.06, z0], [r * 1.06, z0 - 0.006], [r, z0 - 0.008],
    [r, z1 + 0.010], [r * 1.08, z1 + 0.008], [r * 1.08, z1], [rIn, z1],
    [rIn, z0],
  ], 22);
  body.translate(0, y, 0);           // a lathe is born on the bore; the sight is not
  add(body, hex, { round: true, wear: 0.35, ao: 0.45 });
  // Saddle mount with two clamp bolts, straddling the rail.
  const m = sideProfile([
    [z0 - 0.004, y - r], [z1 + 0.004, y - r], [z1 + 0.004, y - r - 0.018],
    [z1 - 0.006, y - r - 0.022], [z0 + 0.006, y - r - 0.022], [z0 - 0.004, y - r - 0.018],
  ], 0.024, { bevel: 0.0012 });
  add(m, hex, { wear: 0.5 });
  for (const z of [z0 - 0.001, z1 + 0.001]) {
    const b = latheZ([[0, 0], [0.0045, 0], [0.0045, 0.004], [0.0032, 0.005]], 10);
    b.rotateZ(Math.PI / 2); b.translate(0.013, y - r - 0.012, z);
    add(b, 0x8a8f92, { round: true, wear: 0.6 });
  }
  // Windage and elevation turrets — small, but they are the two knurled lumps
  // that say "optic" from any angle.
  for (const [ax, zz] of [[0, z1 + 0.018], [1, z1 + 0.018]]) {
    const t = latheZ([[0, 0], [0.0062, 0], [0.0062, 0.007], [0.0050, 0.009], [0, 0.009]], 12);
    if (ax) { t.rotateX(-Math.PI / 2); t.translate(0, y + r - 0.002, zz); }
    else { t.rotateZ(-Math.PI / 2); t.translate(-(r - 0.002), y, zz); }
    add(t, hex, { round: true, wear: 0.5 });
  }
  return { rIn, lensZ: z1 + 0.004, lensR: rIn };
}

// A front post inside a hood. The hood wings are what make irons legible
// against a bright wall; a naked post disappears.
function frontSight(add, z, yBase, h, hex) {
  const base = slab(0.020, 0.006, 0.016, 0.002, 0.0008);
  base.translate(0, yBase + 0.003, z);
  add(base, hex, { wear: 0.6 });
  const post = slab(0.0026, h, 0.0032, 0.0008, 0.0005);
  post.translate(0, yBase + 0.006 + h / 2, z);
  add(post, hex, { wear: 1.0 });
  for (const s of [-1, 1]) {
    const w = slab(0.0028, h + 0.004, 0.014, 0.001, 0.0006);
    w.translate(s * 0.0082, yBase + 0.006 + (h + 0.004) / 2, z);
    w.rotateZ(-s * 0.10);
    add(w, hex, { wear: 0.75 });
  }
  return yBase + 0.006 + h;
}

// Rear aperture: a ring on a base, with the ring genuinely open.
function rearSight(add, z, yTop, hex) {
  const base = slab(0.019, 0.008, 0.014, 0.002, 0.0008);
  base.translate(0, yTop - 0.010, z);
  add(base, hex, { wear: 0.6 });
  const rr = 0.0060;
  const ring = latheZ([
    [rr, z + 0.002], [rr + 0.0022, z + 0.002], [rr + 0.0022, z - 0.002], [rr, z - 0.002], [rr, z + 0.002],
  ], 16);
  ring.translate(0, yTop - 0.006 + rr, 0);
  add(ring, hex, { round: true, wear: 0.8, ao: 0.3 });
  return yTop - 0.006 + rr;
}

function triggerGuard(add, z, y, w, hex) {
  const outer = [
    [z + 0.026, y + 0.004], [z + 0.026, y - 0.012], [z + 0.014, y - 0.030],
    [z - 0.012, y - 0.032], [z - 0.026, y - 0.020], [z - 0.028, y - 0.002], [z - 0.028, y + 0.004],
  ];
  const hole = [
    [z + 0.018, y + 0.004], [z + 0.006, y - 0.022], [z - 0.010, y - 0.024],
    [z - 0.020, y - 0.014], [z - 0.020, y + 0.004],
  ];
  add(sideProfile(outer, w, { holes: [hole], bevel: 0.0012 }), hex, { wear: 0.55, ao: 0.45 });
}

// A grip or a stock comb: a rounded section swept down a raked path, pinching
// where the fingers close and flaring at the heel.
function sweptBlock(from, to, w, h, r, scales, up) {
  const n = scales.length;
  const path = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    path.push([
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ]);
  }
  const f = frameChain(path, up || [0, 0, 1]);
  f.forEach((fr, i) => { fr.sx = scales[i][0]; fr.sy = scales[i][1]; });
  return sweep(roundRectPts(w, h, r, 3), f);
}

// ── the forge ───────────────────────────────────────────────────────────────

function forge(mats) {
  const bin = partBin();
  const group = new THREE.Group();
  const nodes = {};
  const subs = [];
  const self = {
    group, nodes,
    steel: (g, c, o) => bin.add('steel', g, c === undefined ? 0x63686d : c, Object.assign({ wear: 0.55, ao: 0.30 }, o)),
    phos: (g, c, o) => bin.add('phos', g, c === undefined ? 0x4b4f53 : c, Object.assign({ wear: 0.4, ao: 0.30 }, o)),
    poly: (g, c, o) => bin.add('poly', g, c === undefined ? 0x39392f : c, Object.assign({ wear: 0.22, ao: 0.38, grain: 0.05 }, o)),
    rubber: (g, c, o) => bin.add('rubber', g, c === undefined ? 0x24252a : c, Object.assign({ wear: 0.12, ao: 0.42, grain: 0.07 }, o)),
    mesh(geo, mat) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      group.add(m);
      return m;
    },
    sub(name) {
      const c = forge(mats);
      c.group.name = name;
      group.add(c.group);
      nodes[name] = c.group;
      subs.push(c);
      c.nodes = nodes;
      return c;
    },
    finish() {
      for (const s of subs) s.finish();
      for (const [k, g] of bin.bake()) self.mesh(g, mats[k] || mats.steel);
      return self;
    },
  };
  return self;
}

// ── the assault rifle ───────────────────────────────────────────────────────

function buildRifle(mats) {
  const f = forge(mats);
  const TAN = 0x6a6048, BLK = 0x2e3033;

  // Upper receiver. The cross-section is the whole point: a rounded slab with a
  // rib along the spine, so the rail has something to sit on and the side view
  // has a shoulder that catches light.
  const up = extrudePts(receiverPts(0.040, 0.048, 0.22, 0.55, 0.0065), 0.225, { bevel: 0.0018 });
  up.translate(0, 0.004, -0.045);
  f.steel(up, 0x5c6165);

  // Lower: the fire control housing plus the magwell flare, drawn in side view
  // because that is the shape you actually recognise.
  f.steel(sideProfile([
    [0.070, -0.002], [0.070, -0.034], [0.030, -0.040], [0.006, -0.052],
    [-0.040, -0.058], [-0.062, -0.050], [-0.062, -0.002],
  ], 0.036, { bevel: 0.0016 }), 0x585d61);

  // Magwell flare — a short tapered collar the magazine drops through.
  f.steel(sweptBlock([0, -0.036, -0.040], [0, -0.062, -0.046], 0.034, 0.052, 0.006,
    [[1.10, 1.06], [1.0, 1.0], [0.97, 0.98]], [0, 0, 1]), 0x5a6063, { wear: 0.7 });

  // Rail, unbroken from the charging handle out over the handguard.
  railRibs(f.steel, 0.055, -0.152, 0.0350, 0.0212, 0x54585c);

  // Barrel: chamber shoulder, a slim profile under the handguard, and a step up
  // at the gas block where a real barrel is thickest.
  f.phos(latheZ([
    [0.0000, -0.140], [0.0130, -0.140], [0.0130, -0.170], [0.0098, -0.180],
    [0.0092, -0.376], [0.0108, -0.376], [0.0108, -0.404], [0.0086, -0.408],
    [0.0082, -0.552], [0.0000, -0.552],
  ], 18), 0x45484b, { round: true, wear: 0.5 });

  // Gas block and tube.
  const gb = slab(0.021, 0.026, 0.030, 0.003, 0.0010);
  gb.translate(0, 0.006, -0.392);
  f.phos(gb, 0x4e5154, { wear: 0.6 });
  f.phos(latheZ([[0.0032, -0.392], [0.0032, -0.170]], 8), 0x50565a, { round: true });

  // A2-pattern flash hider: shoulder, body, tines with real gaps between them.
  f.phos(latheZ([
    [0.0082, -0.548], [0.0132, -0.552], [0.0132, -0.566], [0.0116, -0.570],
    [0.0116, -0.628], [0.0132, -0.632], [0.0132, -0.640], [0.0086, -0.644], [0.0000, -0.644],
  ], 16), 0x3f4245, { round: true, wear: 0.55 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + 0.5 + (i / 5) * (Math.PI * 2 - 1.0);
    const t = slab(0.0042, 0.0030, 0.052, 0.0010, 0.0006);
    t.translate(0, 0.0128, -0.598);
    t.rotateZ(a);
    f.phos(t, 0x44474a, { wear: 0.8 });
  }

  // Handguard: two vented side panels, a top deck the rail continues over, and
  // a floor. Building it as panels rather than a tube means you can genuinely
  // see the barrel through the slots, which is the detail that sells it.
  const hz0 = -0.152, hz1 = -0.398, hy = 0.002;
  const holes = [];
  for (let i = 0; i < 3; i++) {
    const cz = hz0 - 0.044 - i * 0.070;
    holes.push(roundRectPts(0.048, 0.019, 0.008, 3).map(([a, b]) => [a + cz, b + hy]));
  }
  for (const s of [-1, 1]) {
    const p = sideProfile(
      roundRectPts(hz0 - hz1, 0.058, 0.007, 3).map(([a, b]) => [a + (hz0 + hz1) / 2, b + hy]),
      0.0055, { holes, bevel: 0.0012 });
    p.translate(s * 0.0192, 0, 0);
    f.poly(p, TAN);
  }
  const deck = slab(0.042, 0.008, hz0 - hz1, 0.004, 0.0012);
  deck.translate(0, 0.0310, (hz0 + hz1) / 2);
  f.poly(deck, TAN);
  const floor = slab(0.038, 0.008, hz0 - hz1 - 0.02, 0.004, 0.0012);
  floor.translate(0, -0.0290, (hz0 + hz1) / 2 - 0.008);
  f.poly(floor, TAN);
  // The rail continues over the handguard at exactly the receiver's height —
  // two rails at two heights is the classic procedural-gun giveaway.
  railRibs(f.poly, hz0 - 0.002, hz1 + 0.006, 0.0350, 0.0212, 0x3c3a31);
  // Two M-LOK lugs on the underside, where a hand actually grips.
  for (const z of [-0.230, -0.300]) {
    const l = slab(0.026, 0.010, 0.030, 0.004, 0.0010);
    l.translate(0, hy - 0.034, z);
    f.poly(l, 0x2f2f28);
  }

  // Ejection port: a recessed rectangle, a hinged dust cover lip and the brass
  // deflector behind it. Cheap, and the right side of a rifle is featureless
  // without it.
  const port = slab(0.034, 0.026, 0.008, 0.003, 0.0008);
  port.rotateY(Math.PI / 2); port.translate(0.0172, 0.006, -0.055);
  f.steel(port, 0x0d0f11, { wear: 0.25, ao: 0.7 });
  for (const dy of [0.0145, -0.0145]) {
    const lip = slab(0.038, 0.0032, 0.005, 0.001, 0.0006);
    lip.rotateY(Math.PI / 2); lip.translate(0.0204, 0.006 + dy, -0.055);
    f.steel(lip, 0x606468, { wear: 1.0 });
  }
  const cover = slab(0.034, 0.026, 0.004, 0.004, 0.0010);
  cover.rotateY(Math.PI / 2); cover.translate(0.0212, 0.004, -0.055);
  cover.rotateX(0);
  f.steel(cover, 0x565b60, { wear: 0.75 });
  const defl = sweptBlock([0.019, 0.020, -0.018], [0.030, 0.006, -0.026], 0.018, 0.012, 0.004,
    [[0.5, 0.6], [1, 1], [0.8, 0.7]], [0, 1, 0]);
  f.steel(defl, 0x5c6165, { wear: 0.7 });
  const fwd = latheZ([[0, 0], [0.0062, 0], [0.0062, 0.010], [0.0048, 0.012], [0, 0.012]], 12);
  fwd.rotateZ(-Math.PI / 2); fwd.translate(0.0192, 0.008, 0.020);
  f.steel(fwd, 0x5c6165, { round: true });

  // Charging handle, on its own node so the reload can run it.
  const ch = f.sub('charge');
  const bar = slab(0.048, 0.009, 0.030, 0.002, 0.0010);
  bar.translate(0, 0.030, 0.074);
  ch.steel(bar, 0x4f5458, { wear: 0.85 });
  const stem = slab(0.016, 0.007, 0.048, 0.002, 0.0008);
  stem.translate(0, 0.030, 0.052);
  ch.steel(stem, 0x4a4f53);
  const latch = slab(0.014, 0.011, 0.008, 0.002, 0.0008);
  latch.translate(-0.017, 0.030, 0.070);
  ch.steel(latch, 0x6b7174, { wear: 0.9 });

  // Trigger, on a node so it can be pulled.
  const tg = f.sub('trigger');
  const tr = sideProfile([
    [0.008, -0.018], [0.008, -0.030], [0.002, -0.038], [-0.004, -0.038], [-0.002, -0.026], [-0.001, -0.018],
  ], 0.007, { bevel: 0.0008 });
  tg.steel(tr, 0x8a9094, { wear: 0.9 });
  tg.group.position.set(0, -0.018, 0);
  tr.translate(0, 0.018, 0);
  triggerGuard(f.steel, -0.004, -0.008, 0.032, 0x54595d);
  // Safety selector and mag release — two small lumps that break the flat side.
  const sel = latheZ([[0, 0], [0.0075, 0], [0.0075, 0.006], [0.0055, 0.008], [0, 0.008]], 10);
  sel.rotateZ(-Math.PI / 2); sel.translate(0.0182, -0.012, 0.030);
  f.steel(sel, 0x3d4145, { round: true });
  const rel = slab(0.006, 0.011, 0.011, 0.002, 0.0006);
  rel.translate(0.0202, -0.020, -0.030);
  f.steel(rel, 0x4a4f53);

  // Magazine — swept down a curve, because a straight box magazine is the single
  // most obvious "programmer art" tell on a rifle.
  const mg = f.sub('mag');
  const magPath = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    // A shallow arc bending forward as it drops: the curve of a 5.56 stack.
    magPath.push([0, -0.050 - 0.135 * t, -0.040 - 0.030 * t * t]);
  }
  const mf = frameChain(magPath, [0, 0, 1]);
  mf.forEach((fr, i) => { const t = i / 6; fr.sx = 1 - t * 0.04; fr.sy = 1 - t * 0.05; });
  mg.poly(sweep(roundRectPts(0.0240, 0.0400, 0.0060, 3), mf), 0x2c2e26, { wear: 0.3 });
  const plate = slab(0.030, 0.012, 0.046, 0.004, 0.0010);
  plate.rotateX(-0.30); plate.translate(0, -0.190, -0.072);
  mg.poly(plate, 0x24261f, { wear: 0.35 });
  // A witness-hole column: five dots down the side, unmistakably a magazine.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const h = latheZ([[0, 0], [0.0028, 0], [0.0028, 0.002], [0, 0.002]], 8);
    h.rotateZ(-Math.PI / 2);
    h.translate(0.0124, -0.070 - t * 0.100, -0.043 - t * 0.022);
    mg.poly(h, 0x111310, { round: true, ao: 0.7 });
  }

  // Pistol grip and stock.
  f.poly(sweptBlock([0, -0.030, 0.022], [0, -0.118, 0.056], 0.034, 0.042, 0.010,
    [[0.92, 0.90], [1.0, 1.0], [1.0, 0.98], [0.90, 0.82]], [0, 0, 1]), TAN, { wear: 0.2 });
  const beaver = slab(0.030, 0.016, 0.020, 0.006, 0.0012);
  beaver.rotateX(0.35); beaver.translate(0, -0.024, 0.058);
  f.poly(beaver, TAN);
  f.steel(latheZ([[0, 0.062], [0.0175, 0.062], [0.0175, 0.185], [0, 0.185]], 16), 0x4a4e53, { round: true, wear: 0.45 });
  for (let i = 0; i < 6; i++) {
    const r = latheZ([[0.0175, 0.078 + i * 0.019], [0.0198, 0.080 + i * 0.019], [0.0198, 0.088 + i * 0.019], [0.0175, 0.090 + i * 0.019]], 14);
    f.steel(r, 0x4f5357, { round: true, wear: 0.6 });
  }
  f.poly(sweptBlock([0, -0.004, 0.120], [0, -0.006, 0.246], 0.044, 0.052, 0.008,
    [[0.86, 0.72], [1.0, 0.92], [1.0, 1.0], [0.96, 1.06]], [0, 1, 0]), BLK, { wear: 0.25 });
  const pad = slab(0.042, 0.062, 0.014, 0.006, 0.0016);
  pad.rotateX(-0.12); pad.translate(0, -0.006, 0.252);
  f.rubber(pad, 0x1e2024);

  // Sights: the optic is the primary, and the folded-down irons stay on the gun
  // because that is what a real rifle looks like.
  const opt = tubeOptic(f.steel, { z0: -0.052, z1: -0.148, y: 0.0640, r: 0.0195, hex: 0x494e53 });
  // Co-witnessed with the dot: the post tip lands on the optic's axis, which is
  // what a real backup sight is set up to do and reads as intent, not accident.
  frontSight(f.phos, -0.378, 0.0437, 0.0130, 0x4d5154);

  f.finish();

  // Lens and reticle carry their own materials, so they sit outside the merge.
  const lensGeo = new THREE.CircleGeometry(opt.lensR, 22);
  const lens = new THREE.Mesh(lensGeo, mats.lens);
  lens.position.set(0, 0.0640, opt.lensZ);
  lens.rotation.y = Math.PI;    // face the shooter
  lens.castShadow = false; lens.frustumCulled = false;
  f.group.add(lens);
  const reticle = new THREE.Mesh(new THREE.PlaneGeometry(0.020, 0.020), mats.reticleDot);
  reticle.position.set(0, 0.0640, opt.lensZ + 0.002);
  reticle.renderOrder = 20;
  reticle.frustumCulled = false;
  f.group.add(reticle);
  f.nodes.reticle = reticle;
  f.nodes.lens = lens;

  return {
    id: 'rifle',
    group: f.group, nodes: f.nodes,
    sight: { pos: [0, 0.0640, -0.052], dir: [0, 0, -1], up: [0, 1, 0] },
    eyeRelief: 0.160,
    optic: { centre: [0, 0.0640, opt.lensZ], r: opt.lensR },
    muzzle: [0, 0, -0.648],
    hip: { pos: [0.113, -0.104, -0.296], rot: [-0.042, 0.052, -0.062] },
    mass: 1.0,
    hands: {
      // The grip axis runs up-and-back out of the web of the hand, so that is
      // where the wrist goes; the palm rides the backstrap on the right.
      right: { pos: [0, -0.058, 0.036], axis: [0, 0.93, -0.36], palm: [1, 0, 0.30], gripR: 0.019,
               index: [[0.014, 0.036, -0.020], [0.002, 0.041, -0.028]], armDir: [0.80, -0.60, 0.10] },
      // Support hand under the handguard, forearm dropping away to the left.
      left: { pos: [0, -0.008, -0.272], axis: [0, 0, -1], palm: [-0.46, -0.89, 0], gripR: 0.026, wrap: 2.4,
              armDir: [0.74, -0.66, 0] },
    },
  };
}

// ── the SMG ─────────────────────────────────────────────────────────────────

function buildSMG(mats) {
  const f = forge(mats);
  const BLK = 0x30323a;

  // A rolled-steel receiver: round-backed rather than slab-sided, which is what
  // separates an SMG silhouette from a carbine at a glance.
  f.steel(latheZ([
    [0, 0.055], [0.0215, 0.052], [0.0215, -0.108], [0.0180, -0.118], [0, -0.118],
  ], 20), 0x4e5359, { round: true, wear: 0.5 });
  const spine = slab(0.026, 0.012, 0.170, 0.004, 0.0012);
  spine.translate(0, 0.021, -0.030);
  f.steel(spine, 0x4a4f54);
  railRibs(f.steel, 0.046, -0.240, 0.0265, 0.0212, 0x484c53);

  // Short barrel with a shroud and a three-prong flash hider.
  f.phos(latheZ([
    [0, -0.108], [0.0098, -0.108], [0.0098, -0.268], [0.0086, -0.272], [0, -0.272],
  ], 14), 0x44484b, { round: true });
  f.phos(latheZ([
    [0.0086, -0.268], [0.0128, -0.272], [0.0128, -0.284], [0.0104, -0.288],
    [0.0104, -0.328], [0.0118, -0.332], [0.0072, -0.336], [0, -0.336],
  ], 14), 0x3e4144, { round: true, wear: 0.6 });
  for (let i = 0; i < 3; i++) {
    const t = slab(0.0050, 0.0034, 0.044, 0.0012, 0.0006);
    t.translate(0, 0.0122, -0.310);
    t.rotateZ(i * (Math.PI * 2 / 3) + 0.4);
    f.phos(t, 0x44474a, { wear: 0.8 });
  }

  // Polymer handguard with side vents and a vertical foregrip.
  const hz0 = -0.115, hz1 = -0.262;
  const holes = [];
  for (let i = 0; i < 2; i++) {
    const cz = hz0 - 0.038 - i * 0.062;
    holes.push(roundRectPts(0.040, 0.016, 0.007, 3).map(([a, b]) => [a + cz, b + 0.001]));
  }
  for (const s of [-1, 1]) {
    const p = sideProfile(
      roundRectPts(hz0 - hz1, 0.046, 0.008, 3).map(([a, b]) => [a + (hz0 + hz1) / 2, b + 0.001]),
      0.0050, { holes, bevel: 0.0012 });
    p.translate(s * 0.0170, 0, 0);
    f.poly(p, BLK);
  }
  const hdeck = slab(0.036, 0.008, hz0 - hz1, 0.004, 0.0012);
  hdeck.translate(0, 0.0225, (hz0 + hz1) / 2);
  f.poly(hdeck, BLK);
  const hfloor = slab(0.034, 0.007, hz0 - hz1, 0.004, 0.0012);
  hfloor.translate(0, -0.0205, (hz0 + hz1) / 2);
  f.poly(hfloor, BLK);
  f.poly(sweptBlock([0, -0.026, -0.196], [0, -0.104, -0.190], 0.030, 0.030, 0.009,
    [[0.95, 0.95], [1.0, 1.0], [0.98, 0.98], [1.06, 1.06]], [0, 0, 1]), 0x2a2c31, { wear: 0.2 });

  // Straight-stack magazine, forward of the trigger guard.
  const mg = f.sub('mag');
  const mp = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; mp.push([0, -0.040 - 0.150 * t, -0.052 - 0.012 * t * t]); }
  const mf = frameChain(mp, [0, 0, 1]);
  mf.forEach((fr, i) => { fr.sx = 1 - (i / 5) * 0.03; });
  mg.poly(sweep(roundRectPts(0.0280, 0.0360, 0.0060, 3), mf), 0x26282c, { wear: 0.3 });
  const mplate = slab(0.032, 0.038, 0.010, 0.003, 0.0010);
  mplate.rotateX(Math.PI / 2); mplate.translate(0, -0.194, -0.064);
  mg.poly(mplate, 0x1e2024);

  // Skeleton folding stock: two struts and a pad. The gaps in it are the point.
  for (const s of [-1, 1]) {
    f.steel(sweptBlock([s * 0.014, 0.014, 0.052], [s * 0.020, -0.004, 0.196], 0.010, 0.010, 0.004,
      [[1, 1], [1, 1], [1, 1]], [0, 1, 0]), 0x4c5157, { wear: 0.5 });
  }
  const spad = slab(0.038, 0.052, 0.012, 0.006, 0.0014);
  spad.translate(0, -0.004, 0.200);
  f.rubber(spad, 0x1c1e21);

  triggerGuard(f.steel, -0.004, -0.006, 0.028, 0x4b5056);
  const tg = f.sub('trigger');
  tg.steel(sideProfile([[0.006, 0], [0.006, -0.012], [0.000, -0.019], [-0.005, -0.019], [-0.003, -0.008], [-0.002, 0]], 0.006, { bevel: 0.0007 }), 0x8a9094);
  tg.group.position.set(0, -0.016, 0);
  f.poly(sweptBlock([0, -0.026, 0.020], [0, -0.108, 0.048], 0.032, 0.040, 0.010,
    [[0.92, 0.90], [1.0, 1.0], [0.98, 0.96], [0.88, 0.80]], [0, 0, 1]), BLK, { wear: 0.2 });

  // Charging handle on the left, cocked out at 45° like an MP5's.
  const ch = f.sub('charge');
  const chg = latheZ([[0, 0], [0.0070, 0], [0.0070, 0.026], [0.0052, 0.030], [0, 0.030]], 12);
  chg.rotateZ(Math.PI / 2); chg.rotateX(0.4);
  chg.translate(-0.024, 0.016, -0.090);
  ch.steel(chg, 0x585d63, { round: true, wear: 0.8 });

  // An open reflex sight rather than a tube — a different sight archetype from
  // the rifle, so the two guns do not read as reskins of each other.
  const sy = 0.0530;
  const shoe = sideProfile([
    [-0.036, sy - 0.026], [-0.010, sy - 0.026], [-0.010, sy - 0.010],
    [-0.036, sy - 0.010],
  ], 0.026, { bevel: 0.0012 });
  f.steel(shoe, 0x484d53, { wear: 0.5 });
  for (const s of [-1, 1]) {
    const wing = slab(0.0040, 0.030, 0.030, 0.0015, 0.0008);
    wing.translate(s * 0.0130, sy + 0.001, -0.040);
    f.steel(wing, 0x484d53, { wear: 0.7 });
  }
  const hood = slab(0.030, 0.0045, 0.032, 0.0018, 0.0008);
  hood.translate(0, sy + 0.017, -0.040);
  f.steel(hood, 0x484d53, { wear: 0.7 });

  f.finish();

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.021, 0.026), mats.lens);
  glass.position.set(0, sy + 0.001, -0.030);
  glass.rotation.x = 0.22;      // a reflex lens leans back toward the eye
  glass.rotation.y = Math.PI;
  glass.frustumCulled = false;
  f.group.add(glass);
  const reticle = new THREE.Mesh(new THREE.PlaneGeometry(0.017, 0.017), mats.reticleDot);
  reticle.position.set(0, sy + 0.001, -0.028);
  reticle.renderOrder = 20;
  reticle.frustumCulled = false;
  f.group.add(reticle);
  f.nodes.reticle = reticle;
  f.nodes.lens = glass;

  return {
    id: 'smg',
    group: f.group, nodes: f.nodes,
    sight: { pos: [0, sy, -0.030], dir: [0, 0, -1], up: [0, 1, 0] },
    eyeRelief: 0.150,
    optic: { centre: [0, sy, -0.030], r: 0.0105 },
    muzzle: [0, 0, -0.340],
    hip: { pos: [0.108, -0.098, -0.262], rot: [-0.038, 0.056, -0.060] },
    mass: 0.78,
    hands: {
      right: { pos: [0, -0.054, 0.032], axis: [0, 0.94, -0.33], palm: [1, 0, 0.28], gripR: 0.018,
               index: [[0.013, 0.034, -0.018], [0.002, 0.039, -0.026]], armDir: [0.80, -0.60, 0.10] },
      // Vertical foregrip: the support hand stands on end rather than lying
      // along the bore, which is the whole reason a foregrip exists.
      left: { pos: [0, -0.070, -0.192], axis: [0, 1, -0.10], palm: [-0.25, 0, 0.97], gripR: 0.017, wrap: 2.4,
              armDir: [0.78, -0.62, 0.06] },
    },
  };
}

// ── the marksman rifle ──────────────────────────────────────────────────────

function buildDMR(mats) {
  const f = forge(mats);
  const GRN = 0x3d4436;

  const up = extrudePts(receiverPts(0.044, 0.056, 0.20, 0.50, 0.007), 0.290, { bevel: 0.0020 });
  up.translate(0, 0.006, -0.060);
  f.steel(up, 0x54595e);
  f.steel(sideProfile([
    [0.086, -0.004], [0.086, -0.038], [0.030, -0.046], [0.006, -0.056],
    [-0.046, -0.062], [-0.070, -0.052], [-0.070, -0.004],
  ], 0.040, { bevel: 0.0018 }), 0x50545a);
  railRibs(f.steel, 0.070, -0.172, 0.0410, 0.0212, 0x4c5054);

  // A heavy fluted barrel. The flutes are actual geometry: six longitudinal
  // grooves that catch a rolling highlight as the weapon sways, which is the
  // clearest way to say "this barrel is thick" without measuring anything.
  f.phos(latheZ([
    [0, -0.178], [0.0165, -0.178], [0.0165, -0.212], [0.0140, -0.222],
    [0.0134, -0.640], [0.0120, -0.648], [0, -0.648],
  ], 20), 0x42464a, { round: true, wear: 0.45 });
  for (let i = 0; i < 6; i++) {
    const fl = latheZ([[0.0000, -0.240], [0.0038, -0.244], [0.0038, -0.612], [0.0000, -0.616]], 8);
    fl.translate(0, 0.0132, 0);
    fl.rotateZ((i / 6) * Math.PI * 2 + 0.3);
    f.phos(fl, 0x2f3235, { round: true, ao: 0.6, wear: 0.2 });
  }
  // Muzzle brake with three pairs of side ports.
  f.phos(latheZ([
    [0.0120, -0.640], [0.0182, -0.646], [0.0182, -0.726], [0.0150, -0.732], [0, -0.732],
  ], 16), 0x3c3f42, { round: true, wear: 0.6 });
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const p = slab(0.0060, 0.0140, 0.0120, 0.0015, 0.0006);
      p.rotateY(Math.PI / 2);
      p.translate(s * 0.0182, 0.0025, -0.660 - i * 0.024);
      f.phos(p, 0x1c1e20, { ao: 0.75, wear: 0.15 });
    }
  }

  // Free-float handguard: a slim tube with M-LOK slots and a folded bipod.
  const hz0 = -0.172, hz1 = -0.470;
  for (const s of [-1, 1]) {
    const holes = [];
    for (let i = 0; i < 4; i++) {
      const cz = hz0 - 0.045 - i * 0.062;
      holes.push(roundRectPts(0.034, 0.014, 0.006, 3).map(([a, b]) => [a + cz, b]));
    }
    const p = sideProfile(
      roundRectPts(hz0 - hz1, 0.068, 0.008, 3).map(([a, b]) => [a + (hz0 + hz1) / 2, b + 0.001]),
      0.0055, { holes, bevel: 0.0012 });
    p.translate(s * 0.0205, 0, 0);
    f.poly(p, GRN);
  }
  const ddeck = slab(0.044, 0.008, hz0 - hz1, 0.004, 0.0012);
  ddeck.translate(0, 0.0370, (hz0 + hz1) / 2);
  f.poly(ddeck, GRN);
  railRibs(f.poly, hz0 - 0.002, hz1 + 0.006, 0.0410, 0.0212, 0x2f352b);
  const dfloor = slab(0.040, 0.008, hz0 - hz1 - 0.02, 0.004, 0.0012);
  dfloor.translate(0, -0.0320, (hz0 + hz1) / 2 - 0.008);
  f.poly(dfloor, GRN);
  for (const s of [-1, 1]) {
    f.steel(sweptBlock([s * 0.012, -0.030, -0.400], [s * 0.026, -0.040, -0.300], 0.009, 0.009, 0.003,
      [[1, 1], [1, 1], [1, 1]], [0, 1, 0]), 0x3f4347, { wear: 0.5 });
  }

  // 20-round magazine, gently curved.
  const mg = f.sub('mag');
  const mp = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; mp.push([0, -0.054 - 0.118 * t, -0.046 - 0.020 * t * t]); }
  const mf = frameChain(mp, [0, 0, 1]);
  mg.poly(sweep(roundRectPts(0.0260, 0.0420, 0.0060, 3), mf), 0x2a2c26, { wear: 0.3 });
  const dplate = slab(0.032, 0.012, 0.048, 0.004, 0.0010);
  dplate.rotateX(-0.24); dplate.translate(0, -0.174, -0.070);
  mg.poly(dplate, 0x222419);

  // Fixed stock with a cheek riser and an adjustable pad.
  f.poly(sweptBlock([0, -0.010, 0.086], [0, -0.010, 0.290], 0.046, 0.062, 0.010,
    [[0.82, 0.66], [1.0, 0.92], [1.0, 1.04], [0.94, 1.10]], [0, 1, 0]), GRN, { wear: 0.22 });
  const comb = slab(0.036, 0.020, 0.130, 0.007, 0.0016);
  comb.rotateX(-0.05); comb.translate(0, 0.030, 0.190);
  f.poly(comb, 0x33382c);
  const dpad = slab(0.044, 0.070, 0.014, 0.006, 0.0016);
  dpad.rotateX(-0.10); dpad.translate(0, -0.012, 0.298);
  f.rubber(dpad, 0x1c1e21);

  triggerGuard(f.steel, -0.004, -0.010, 0.036, 0x4e5358);
  const tg = f.sub('trigger');
  tg.steel(sideProfile([[0.008, -0.018], [0.008, -0.032], [0.001, -0.040], [-0.005, -0.040], [-0.003, -0.026], [-0.001, -0.018]], 0.007, { bevel: 0.0008 }), 0x8a9094);
  tg.group.position.set(0, -0.018, 0);
  f.poly(sweptBlock([0, -0.034, 0.026], [0, -0.124, 0.062], 0.036, 0.044, 0.011,
    [[0.92, 0.90], [1.0, 1.0], [1.0, 0.98], [0.90, 0.82]], [0, 0, 1]), GRN, { wear: 0.2 });

  const ch = f.sub('charge');
  const bolt = slab(0.014, 0.014, 0.056, 0.005, 0.0012);
  bolt.translate(0.030, 0.014, 0.030);
  ch.steel(bolt, 0x6d7276, { wear: 0.9 });
  const knob = new THREE.SphereGeometry(0.0105, 10, 8);
  knob.translate(0.036, 0.014, 0.052);
  ch.steel(knob, 0x2c2e31, { round: true, wear: 0.4 });

  // The scope: a 30 mm tube with a real objective bell, a sunshade, turrets and
  // a rubber ocular ring.
  const sy = 0.0740;
  const opt = tubeOptic(f.steel, { z0: -0.012, z1: -0.196, y: sy, r: 0.0180, hex: 0x44484c });
  f.steel(latheZ([
    [0.0180, -0.190], [0.0180, -0.206], [0.0268, -0.222], [0.0268, -0.288],
    [0.0244, -0.292], [0.0244, -0.222], [0.0180, -0.208], [0.0180, -0.190],
  ], 22).translate(0, sy, 0), 0x404448, { round: true, wear: 0.4 });
  const ocular = latheZ([
    [0.0180, -0.012], [0.0250, -0.016], [0.0250, -0.050], [0.0180, -0.054],
  ], 20);
  ocular.translate(0, sy, 0);
  f.steel(ocular, 0x43474b, { round: true, wear: 0.45 });
  const eyecup = latheZ([[0.0252, 0.010], [0.0312, 0.004], [0.0312, -0.012], [0.0252, -0.018], [0.0252, 0.010]], 18);
  eyecup.translate(0, sy, 0);
  f.rubber(eyecup, 0x1a1c1e, { round: true });

  f.finish();

  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 22), mats.lens);
  glass.position.set(0, sy, -0.020);
  glass.rotation.y = Math.PI;
  glass.frustumCulled = false;
  f.group.add(glass);
  const reticle = new THREE.Mesh(new THREE.PlaneGeometry(0.031, 0.031), mats.reticleCross);
  reticle.position.set(0, sy, -0.018);
  reticle.renderOrder = 20;
  reticle.frustumCulled = false;
  f.group.add(reticle);
  f.nodes.reticle = reticle;
  f.nodes.lens = glass;

  return {
    id: 'dmr',
    group: f.group, nodes: f.nodes,
    sight: { pos: [0, sy, -0.012], dir: [0, 0, -1], up: [0, 1, 0] },
    eyeRelief: 0.098,
    optic: { centre: [0, sy, -0.020], r: 0.0175, scope: true },
    muzzle: [0, 0, -0.736],
    hip: { pos: [0.120, -0.110, -0.318], rot: [-0.045, 0.048, -0.064] },
    mass: 1.4,
    hands: {
      right: { pos: [0, -0.064, 0.042], axis: [0, 0.93, -0.36], palm: [1, 0, 0.30], gripR: 0.020,
               index: [[0.015, 0.038, -0.022], [0.002, 0.043, -0.030]], armDir: [0.80, -0.60, 0.10] },
      left: { pos: [0, -0.012, -0.326], axis: [0, 0, -1], palm: [-0.46, -0.89, 0], gripR: 0.030, wrap: 2.35,
              armDir: [0.74, -0.66, 0] },
    },
  };
}

// ── the shotgun ─────────────────────────────────────────────────────────────

function buildShotgun(mats) {
  const f = forge(mats);
  const WOOD = 0x4a3528;

  // A milled steel receiver with a very large ejection port — the defining
  // feature of a pump gun from the side.
  const up = extrudePts(receiverPts(0.044, 0.058, 0.10, 0.45, 0.008), 0.200, { bevel: 0.0020 });
  up.translate(0, 0.008, -0.020);
  f.steel(up, 0x3a3d41);
  const port = slab(0.052, 0.028, 0.006, 0.004, 0.0010);
  port.rotateY(Math.PI / 2); port.translate(0.0206, 0.004, -0.030);
  f.steel(port, 0x1c1e21, { wear: 0.25, ao: 0.65 });
  const loadPort = slab(0.048, 0.022, 0.006, 0.004, 0.0010);
  loadPort.rotateX(Math.PI / 2); loadPort.translate(0, -0.022, -0.030);
  f.steel(loadPort, 0x1c1e21, { wear: 0.25, ao: 0.65 });

  // 18.5" barrel over a magazine tube, joined by two barrel bands.
  f.phos(latheZ([
    [0, -0.108], [0.0158, -0.108], [0.0158, -0.140], [0.0140, -0.150],
    [0.0136, -0.508], [0.0148, -0.512], [0.0148, -0.522], [0.0122, -0.524], [0, -0.524],
  ], 20), 0x393c3f, { round: true, wear: 0.45 });
  const tube = latheZ([
    [0, -0.120], [0.0118, -0.120], [0.0118, -0.452], [0.0132, -0.456],
    [0.0132, -0.470], [0.0100, -0.474], [0, -0.474],
  ], 16);
  tube.translate(0, -0.0272, 0);
  f.phos(tube, 0x3c4043, { round: true, wear: 0.5 });
  for (const z of [-0.300, -0.446]) {
    const band = slab(0.030, 0.052, 0.012, 0.006, 0.0012);
    band.translate(0, -0.0136, z);
    f.phos(band, 0x44484b, { wear: 0.6 });
  }

  // Heat shield: rings and longitudinal straps, so you see the barrel through
  // it. This is the single most recognisable piece of shotgun furniture there
  // is, and it costs eight small parts.
  for (const z of [-0.170, -0.240, -0.310, -0.380]) {
    const r = latheZ([[0.0176, z + 0.006], [0.0196, z + 0.006], [0.0196, z - 0.006], [0.0176, z - 0.006], [0.0176, z + 0.006]], 16);
    f.steel(r, 0x2f3235, { round: true, wear: 0.5 });
  }
  for (let i = 0; i < 6; i++) {
    const s = slab(0.0060, 0.0030, 0.226, 0.0012, 0.0006);
    s.translate(0, 0.0190, -0.276);
    s.rotateZ(-Math.PI / 2 + 0.45 + (i / 5) * (Math.PI * 2 - 0.9));
    f.steel(s, 0x2f3235, { wear: 0.55 });
  }

  // Pump forend on its own node — it cycles after every shot, which is the
  // strongest single piece of weapon animation in the whole loadout.
  const pump = f.sub('pump');
  const pz0 = -0.196, pz1 = -0.320;
  pump.poly(sweptBlock([0, -0.0272, pz0], [0, -0.0272, pz1], 0.046, 0.040, 0.010,
    [[0.94, 0.94], [1.0, 1.0], [1.0, 1.0], [0.94, 0.94]], [0, 1, 0]), WOOD, { wear: 0.2, grain: 0.10 });
  for (let i = 0; i < 7; i++) {
    const g = latheZ([[0.0230, pz0 - 0.012 - i * 0.016], [0.0250, pz0 - 0.016 - i * 0.016], [0.0230, pz0 - 0.020 - i * 0.016]], 14);
    g.translate(0, -0.0272, 0);
    pump.poly(g, 0x3e2c20, { round: true, ao: 0.6 });
  }

  // Stock: a pistol-grip type with a thick recoil pad, because a 12-gauge
  // without one looks like it would break a collarbone.
  f.poly(sweptBlock([0, -0.014, 0.078], [0, -0.030, 0.276], 0.044, 0.058, 0.010,
    [[0.84, 0.72], [1.0, 0.94], [1.02, 1.04], [0.96, 1.12]], [0, 1, 0]), WOOD, { wear: 0.2, grain: 0.10 });
  const spad = slab(0.046, 0.078, 0.018, 0.008, 0.0018);
  spad.rotateX(-0.16); spad.translate(0, -0.034, 0.284);
  f.rubber(spad, 0x1a1c1e);
  f.poly(sweptBlock([0, -0.034, 0.020], [0, -0.118, 0.058], 0.036, 0.044, 0.011,
    [[0.92, 0.90], [1.0, 1.0], [1.0, 0.98], [0.90, 0.82]], [0, 0, 1]), WOOD, { wear: 0.2, grain: 0.10 });
  triggerGuard(f.steel, -0.004, -0.014, 0.036, 0x3d4145);
  const tg = f.sub('trigger');
  tg.steel(sideProfile([[0.008, -0.022], [0.008, -0.036], [0.001, -0.044], [-0.005, -0.044], [-0.003, -0.030], [-0.001, -0.022]], 0.008, { bevel: 0.0008 }), 0x8a9094);
  tg.group.position.set(0, -0.022, 0);

  // Sights. The rear ghost ring stands well over a bore-level bead, so the
  // sight line is not parallel to the barrel — the ADS solve has to handle it.
  // A ventilated sighting rib, which is what a bead actually sits on. It also
  // buys the clearance the sight line needs: without it the line from a ghost
  // ring down to a bore-level bead clips the top of its own receiver and you
  // aim at the inside of the gun.
  const beadY = 0.0280, beadZ = -0.500;
  const rib = slab(0.0075, 0.0055, 0.360, 0.0015, 0.0008);
  rib.translate(0, 0.0243, -0.330);
  f.phos(rib, 0x26292c, { wear: 0.7 });
  for (const z of [-0.180, -0.290, -0.400, -0.495]) {
    const post = slab(0.0060, 0.0090, 0.0090, 0.0012, 0.0006);
    post.translate(0, 0.0185, z);
    f.phos(post, 0x222528, { wear: 0.5 });
  }
  const ringY = rearSight(f.steel, 0.070, 0.0580, 0x3f4347);
  const beadBase = slab(0.010, 0.005, 0.010, 0.002, 0.0008);
  beadBase.translate(0, 0.0252, beadZ);
  f.phos(beadBase, 0x3f4347);
  f.finish();

  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), mats.foresight);
  bead.position.set(0, beadY, beadZ);
  bead.frustumCulled = false;
  f.group.add(bead);

  const dir = new THREE.Vector3(0, beadY - ringY, beadZ - 0.070).normalize();

  return {
    id: 'shotgun',
    group: f.group, nodes: f.nodes,
    sight: { pos: [0, ringY, 0.070], dir: [dir.x, dir.y, dir.z], up: [0, 1, 0] },
    eyeRelief: 0.175,
    optic: null,
    muzzle: [0, 0, -0.528],
    hip: { pos: [0.116, -0.106, -0.292], rot: [-0.042, 0.052, -0.062] },
    mass: 1.25,
    pumpTravel: 0.062,
    hands: {
      right: { pos: [0, -0.062, 0.036], axis: [0, 0.92, -0.39], palm: [1, 0, 0.32], gripR: 0.020,
               index: [[0.015, 0.036, -0.022], [0.002, 0.041, -0.030]], armDir: [0.80, -0.60, 0.10] },
      // On the pump, so it travels with it when the action cycles.
      left: { pos: [0, -0.050, -0.252], axis: [0, 0, -1], palm: [-0.46, -0.89, 0], gripR: 0.026, wrap: 2.4,
              armDir: [0.74, -0.66, 0] },
    },
  };
}

// ── the sidearm ─────────────────────────────────────────────────────────────

function buildPistol(mats) {
  const f = forge(mats);
  const FRAME = 0x2f3236;

  // Slide: a squared section with a bevelled nose and a real ejection port.
  const slideProf = [
    [-0.0135, -0.0140], [0.0135, -0.0140], [0.0135, 0.0125], [0.0100, 0.0160],
    [-0.0100, 0.0160], [-0.0135, 0.0125],
  ];
  const sl = extrudePts(slideProf, 0.160, { bevel: 0.0018 });
  sl.translate(0, 0.0205, -0.036);
  f.steel(sl, 0x3a3e43, { wear: 0.6 });
  const nose = slab(0.026, 0.028, 0.012, 0.004, 0.0014);
  nose.translate(0, 0.0205, -0.114);
  f.steel(nose, 0x3a3e43, { wear: 0.8 });
  // Rear and front cocking serrations — actual cut geometry, twelve of them.
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) {
      const g = slab(0.0030, 0.0180, 0.0042, 0.0008, 0.0005);
      g.rotateY(Math.PI / 2);
      g.translate(s * 0.0138, 0.0195, 0.028 - i * 0.0072);
      f.steel(g, 0x2b2e32, { ao: 0.6, wear: 0.35 });
    }
  }
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const g = slab(0.0030, 0.0150, 0.0042, 0.0008, 0.0005);
      g.rotateY(Math.PI / 2);
      g.translate(s * 0.0138, 0.0195, -0.082 - i * 0.0072);
      f.steel(g, 0x2b2e32, { ao: 0.6, wear: 0.35 });
    }
  }
  const ejp = slab(0.044, 0.016, 0.006, 0.003, 0.0008);
  ejp.rotateY(Math.PI / 2); ejp.translate(0.0130, 0.0270, -0.052);
  f.steel(ejp, 0x17191b, { wear: 0.2, ao: 0.7 });
  // Barrel hood and crown, visible at the muzzle.
  f.phos(latheZ([
    [0, -0.108], [0.0082, -0.108], [0.0082, -0.122], [0.0058, -0.122], [0, -0.122],
  ], 14).translate(0, 0.0180, 0), 0x53585c, { round: true, wear: 0.7 });
  const rod = latheZ([[0, -0.100], [0.0046, -0.100], [0.0046, -0.120], [0, -0.120]], 12);
  rod.translate(0, 0.0025, 0);
  f.steel(rod, 0x6a6f73, { round: true, wear: 0.6 });

  // Polymer frame: dust cover with an accessory rail, then the grip.
  f.poly(sideProfile([
    [0.040, 0.006], [0.040, -0.016], [-0.048, -0.016], [-0.104, -0.012],
    [-0.104, 0.004], [-0.048, 0.006],
  ], 0.028, { bevel: 0.0014 }), FRAME);
  for (let i = 0; i < 3; i++) {
    const r = slab(0.024, 0.004, 0.007, 0.001, 0.0006);
    r.translate(0, -0.0175, -0.062 - i * 0.012);
    f.poly(r, 0x25282b);
  }
  triggerGuard(f.steel, -0.002, -0.002, 0.026, FRAME);
  const tg = f.sub('trigger');
  tg.steel(sideProfile([[0.005, -0.008], [0.005, -0.020], [0.000, -0.026], [-0.005, -0.026], [-0.003, -0.014], [-0.002, -0.008]], 0.006, { bevel: 0.0007 }), 0x83898d);
  tg.group.position.set(0, -0.008, 0);

  // Grip: raked back 18°, swelling at the palm and flaring at the heel. The
  // rake is what stops a pistol reading as a cordless drill.
  f.poly(sweptBlock([0, -0.014, 0.014], [0, -0.104, 0.050], 0.032, 0.040, 0.009,
    [[0.94, 0.92], [1.0, 1.02], [1.0, 1.00], [0.96, 0.92]], [0, 0, 1]), FRAME, { wear: 0.18 });
  for (const s of [-1, 1]) {
    const panel = slab(0.005, 0.062, 0.026, 0.004, 0.0010);
    panel.rotateX(-0.36);
    panel.translate(s * 0.0155, -0.058, 0.038);
    f.rubber(panel, 0x1b1d20, { grain: 0.13 });
  }
  const beaver = slab(0.026, 0.012, 0.020, 0.005, 0.0012);
  beaver.rotateX(0.42); beaver.translate(0, -0.006, 0.048);
  f.poly(beaver, FRAME);

  // Magazine inside the grip: only the floorplate shows, and that is enough.
  const mg = f.sub('mag');
  const mp = [];
  for (let i = 0; i <= 3; i++) { const t = i / 3; mp.push([0, -0.012 - 0.098 * t, 0.014 + 0.036 * t]); }
  const mf = frameChain(mp, [0, 0, 1]);
  mg.steel(sweep(roundRectPts(0.0225, 0.0300, 0.0045, 3), mf), 0x33373b, { wear: 0.3 });
  const pl = slab(0.030, 0.036, 0.010, 0.003, 0.0010);
  pl.rotateX(-0.36); pl.translate(0, -0.113, 0.052);
  mg.poly(pl, 0x24262a);

  // Slide stop, safety and the magazine release.
  const stop = slab(0.006, 0.010, 0.030, 0.002, 0.0006);
  stop.translate(-0.0152, 0.002, -0.006);
  f.steel(stop, 0x4b5054, { wear: 0.7 });
  const rel = latheZ([[0, 0], [0.0055, 0], [0.0055, 0.004], [0.0040, 0.005]], 10);
  rel.rotateZ(-Math.PI / 2); rel.translate(0.0146, -0.006, 0.010);
  f.steel(rel, 0x4b5054, { round: true });

  // Three-dot night sights: a blade up front, a notch at the back, tritium in
  // both. At arm's length they are two millimetres tall, so the glow is what
  // actually makes them readable.
  const sy = 0.0400;
  const fb = slab(0.0042, 0.0080, 0.0050, 0.0010, 0.0005);
  fb.translate(0, sy - 0.001, -0.100);
  f.steel(fb, 0x25282b, { wear: 0.9 });
  const rb = sideProfile([
    [0.036, sy - 0.005], [0.024, sy - 0.005], [0.024, sy + 0.003], [0.036, sy + 0.003],
  ], 0.024, { bevel: 0.0008, holes: [[[0.033, sy - 0.005], [0.027, sy - 0.005], [0.027, sy + 0.004], [0.033, sy + 0.004]]] });
  f.steel(rb, 0x25282b, { wear: 0.9 });

  f.finish();

  const dots = new THREE.Group();
  for (const [x, z] of [[0, -0.100], [-0.0062, 0.030], [0.0062, 0.030]]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 6, 5), mats.tritium);
    d.position.set(x, sy + 0.0005, z);
    d.frustumCulled = false;
    dots.add(d);
  }
  f.group.add(dots);

  return {
    id: 'pistol',
    group: f.group, nodes: f.nodes,
    sight: { pos: [0, sy + 0.0015, 0.030], dir: [0, -0.0005, -1], up: [0, 1, 0] },
    eyeRelief: 0.300,
    optic: null,
    muzzle: [0, 0.018, -0.126],
    hip: { pos: [0.074, -0.082, -0.300], rot: [-0.028, 0.034, -0.034] },
    mass: 0.55,
    slideTravel: 0.030,
    hands: {
      right: { pos: [0, -0.048, 0.028], axis: [0, 0.93, -0.37], palm: [1, 0, 0.30], gripR: 0.017,
               index: [[0.012, 0.030, -0.016], [0.001, 0.035, -0.024]], armDir: [0.80, -0.58, 0.14] },
      // The support hand cups the firing hand rather than the weapon — a
      // thumbs-forward grip, which is what makes a two-handed pistol read.
      left: { pos: [-0.006, -0.068, 0.038], axis: [0, 0.93, -0.37], palm: [-1, 0, 0.24], gripR: 0.028,
              wrap: 1.60, mirror: true, armDir: [0.80, -0.58, 0.14] },
    },
  };
}

// ── assembly ────────────────────────────────────────────────────────────────

const BUILDERS = { rifle: buildRifle, smg: buildSMG, dmr: buildDMR, shotgun: buildShotgun, pistol: buildPistol };

export function buildArsenal(mats) {
  const out = {};
  for (const k in BUILDERS) {
    try {
      const m = BUILDERS[k](mats);
      attachHands(m, mats);
      out[k] = m;
    } catch (err) {
      // One bad weapon must not take the boot down with it — the rest of the
      // arsenal still works and the id falls back to whatever did build.
      console.warn('viewmodel: could not build', k, err);
    }
  }
  return out;
}

function attachHands(model, mats) {
  const h = model.hands;
  if (!h) return;
  model.nodes.handR = placeHand(buildHand(mats, {
    gripR: h.right.gripR, wrap: h.right.wrap, index: h.right.index, armDir: h.right.armDir || [0.50, 0.72, 0.48],
  }), h.right.pos, h.right.axis, h.right.palm);
  model.group.add(model.nodes.handR);

  model.nodes.handL = placeHand(buildHand(mats, {
    gripR: h.left.gripR, wrap: h.left.wrap, mirror: h.left.mirror !== false, armDir: h.left.armDir || [0.5, 0.6, 0.5],
    spread: h.left.spread,
  }), h.left.pos, h.left.axis, h.left.palm);
  model.group.add(model.nodes.handL);
}

// Map whatever the weapons agent calls its guns onto a model. Matching on
// keywords rather than on an exact table means a new weapon id gets a sensible
// silhouette on the day it is added rather than a missing one.
export function pickModel(arsenal, id) {
  if (!id) return arsenal.rifle || Object.values(arsenal)[0];
  if (arsenal[id]) return arsenal[id];
  const s = String(id).toLowerCase();
  const test = (m, keys) => keys.some((k) => s.includes(k)) && arsenal[m];
  if (test('pistol', ['pistol', 'side', 'hand', 'revol', 'glock', 'usp', 'm9'])) return arsenal.pistol;
  if (test('shotgun', ['shot', 'pump', 'gauge', 'slug', 'breach'])) return arsenal.shotgun;
  if (test('dmr', ['dmr', 'marks', 'snip', 'scout', 'sr-', 'bolt'])) return arsenal.dmr;
  if (test('smg', ['smg', 'sub', 'mp', 'vector', 'uzi', 'pdw'])) return arsenal.smg;
  return arsenal.rifle || Object.values(arsenal)[0];
}
