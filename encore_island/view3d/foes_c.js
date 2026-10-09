// Encore Island 3D, act 3 foes (the showbiz / editing room act): Tuner Drone, Synchro Dancer, VIP Bouncer, Chrome Siren, Clapperboard Knight,
// Glitch Gremlin, Ring Light Sentinel, Airbrush Wraith and the final boss Flawless. Designed from the 2D sprites, built on the CK rig helpers
// of encore_island_3d/js/characters.js (inked parts, makeLife hurt / attack / death, addFace). Every build returns the actor contract of README.md.
// Baked-rig rules respected: only node transforms / visibility animate, and the std materials share a few buckets (default + chrome/gold) so a foe
// bakes to <= 5 draw calls (boss <= 8): solid, chrome, ink hull, unlit bits (eyes, glows, globs), optional translucent / additive bits.
import * as THREE from 'three';
import { CK, STYLE } from '../../encore_island_3d/js/characters.js';

const { clamp, lerp, damp, ease, part, flat, aim, addFace, makeLife, lifeXform, makeCtx, creatureBase, newState, setBlink, setMouth, ico, box, cyl, hang, cone, torus, cap, geo, basic } = CK;
const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs;
const M = { metalness: 0.12, roughness: 0.28 }, MG = { metalness: 0.35, roughness: 0.3 }; // chrome; also what gold uses, so a build has at most two solid buckets
const GOLDC = new THREE.Color(0xffc929), _c = new THREE.Color();
const goldOf = (c) => _c.set(c).lerp(GOLDC, 0.78).getHex();

// unlit glow materials (colour may exceed 1 for bloom), shared. add = additive translucent.
const GMAT = new Map();
const gl = (r, g, b, o = {}) => { const k = [r, g, b, o.add ? 1 : 0, o.op ?? 1].join(); let m = GMAT.get(k); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: !!o.add, opacity: o.op ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add }); m.userData.noCast = true; GMAT.set(k, m); } return m; };
const oct = () => geo('c3oct', () => new THREE.OctahedronGeometry(1, 0));
const arcTor = (t) => geo('c3arc' + t, () => new THREE.TorusGeometry(1, t, 6, 16, PI));
const lathe = (key, pts, n = 14) => geo(key, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n));
const starGeo = () => geo('c3star', () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.45 : 1, a = i * PI / 5 + PI / 2; i ? s.lineTo(cos(a) * r, sin(a) * r) : s.moveTo(cos(a) * r, sin(a) * r); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }); g.translate(0, 0, -0.15); return g; });
const ez = (rx, ry, rz, x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - (y / ry) ** 2)); // z of an ellipsoid surface at (x, y)
const stripes = (c, par, n, x0, dx, y, z, w, h, d, col = 0x2d2640, p = {}) => { for (let i = 0; i < n; i++) c.P(par, box(1, 1, 1), col, x0 + i * dx, y, z, w, h, d, { ol: false, nt: true, ...p }); };

// a pivot group holding one unlit flat bit of the given size: animate the pivot (scale / position) without losing the size
const bit = (par, g, mat, x, y, z, sx, sy = sx, sz = sx) => { const p = new THREE.Group(); p.position.set(x, y, z); par.add(p); flat(g, mat, p, 0, 0, 0, sx, sy, sz); return p; };

// ---------------------------------------------------------------- shared rig plumbing
function core(name, seed, o, atkDur = 0.55, dieDur = 0.8) {
  const ctx = makeCtx(), { group, fitG, root } = creatureBase(ctx, name), gold = !!o.gold, elite = !!o.elite;
  const L = makeLife(ctx, atkDur, dieDur), S = newState(seed); S.cd = 0; S.ph = 0;
  const c = { ctx, group, fitG, root, L, S, F: { dt: 0, sp: 0, amp: 0, A: 0, u: -1, bl: 0, h: 0 }, gold, elite, atkDur, dieDur, gl: [], gems: [] };
  // inked part; gold swaps the colour toward gold and the material to the chrome bucket (nt = never tint: eyes, gems, stripes)
  c.P = (par, g, col, x, y, z, sx, sy = sx, sz = sx, p = {}) => (gold && !p.nt ? part(ctx, par, g, goldOf(col), x, y, z, sx, sy, sz, { ...p, mo: MG }) : part(ctx, par, g, col, x, y, z, sx, sy, sz, p));
  // tapered limb between two points a, b (thick at a)
  c.limb = (par, a, b, r, col, p = {}) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; return c.P(par, cyl(0.84, 1, 1, 7), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r, Math.hypot(dx, dy, dz), r, { q: aim(dx, dy, dz), ol: 0.013, ...p }); };
  // elite: a glinting crown on a parent node
  c.crown = (par, x, y, z, s = 1) => {
    if (!elite) return null;
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); par.add(g);
    part(ctx, g, cyl(0.15, 0.17, 0.07, 8), 0xffd84d, 0, 0, 0, 1, 1, 1, { mo: M, ol: 0.012 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; part(ctx, g, cone(0.045, 0.13, 4), 0xffd84d, cos(a) * 0.15, 0.09, sin(a) * 0.15, 1, 1, 1, { mo: M, ol: 0.01 }); c.gems.push(bit(g, ico(0), i % 2 ? gl(1.6, 0.5, 0.8) : gl(0.5, 1.5, 1.7), cos(a) * 0.15, 0.175, sin(a) * 0.15, 0.03)); }
    c.gems.push(bit(g, oct(), gl(2.2, 2, 1.3), 0, 0.2, 0, 0.05, 0.11, 0.05));
    return g;
  };
  // gold: orbiting glints
  c.glints = (par, n, R, y, r = 0.05) => { if (!gold) return; for (let i = 0; i < n; i++) c.gl.push({ m: bit(par, oct(), gl(2.2, 2, 1.2), 0, y, 0, r, r * 1.9, r * 0.5), a: i / n * TAU, r: R * (0.85 + 0.15 * (i % 2)), y: y + (i % 3) * 0.13, s: r }); };
  c.fx = (t) => {
    for (let i = 0; i < c.gl.length; i++) { const g = c.gl[i], a = t * 1.1 + g.a; g.m.position.set(cos(a) * g.r, g.y + sin(t * 2.1 + g.a * 3) * 0.07, sin(a) * g.r); g.m.rotation.y = t * 3 + g.a; g.m.scale.setScalar(Math.max(0.05, 0.5 + 0.6 * sin(t * 5 + g.a * 4))); }
    for (let i = 0; i < c.gems.length; i++) c.gems[i].scale.setScalar(0.75 + 0.35 * sin(t * 6 + i * 1.7));
  };
  c.done = (self, h, rad = 0.55) => {
    const k = elite ? 1.14 : 1; fitG.scale.setScalar(k);
    Object.assign(self, { group, height: h * k + (elite ? 0.1 : 0), radius: rad, attack() { if (L.atkT < 0 && L.dieT < 0) { L.attack(); S.cd = atkDur + 0.5; } }, die: () => L.die(), isDead: () => L.dead, dispose() { for (const m of ctx.list) m.dispose(); } });
    Object.defineProperty(self, 'dead', { get: () => L.dead }); return self;
  };
  return c;
}
// per frame: triggers the attack from st.atk (repeating while it stays on), ticks hurt / attack / death, returns shared locals
function frame(c, dt, st) {
  const { S, L, F } = c; dt = Math.min(dt, 0.05); st = st || {};
  if (st.atk && S.cd <= 0 && L.atkT < 0 && L.dieT < 0) { L.attack(); S.cd = c.atkDur + 0.5; }
  S.cd -= dt; L.tick(dt, st);
  if (st.die > 0) { L.dieT = st.die * c.dieDur; L.dieU = Math.min(1, st.die); L.dead = st.die >= 1; } // the engine may drive the death progress itself
  if (st.slow) dt *= 0.55;
  S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 10, dt);
  F.dt = dt; F.sp = S.sp; F.amp = Math.min(1, S.sp * 2.4); F.A = L.atkEnv; F.u = L.atkT >= 0 ? L.atkT / c.atkDur : -1; F.h = L.hurt;
  S.blinkIn -= dt; if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
  F.bl = 0; if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else F.bl = 1 - Math.abs(u * 2 - 1); }
  return F;
}
// a fanned jazz / glove hand hanging along -y of its parent; returns the group
function glove(c, par, col = 0xffffff, s = 1) {
  const h = new THREE.Group(); par.add(h);
  c.P(h, ico(1), col, 0, -0.04 * s, 0, 0.065 * s, 0.06 * s, 0.04 * s, { ol: 0.01 });
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5, l = [0.065, 0.09, 0.1, 0.09, 0.065][i] * s; c.P(h, hang(0.019 * s, 0.013 * s, l, 4), col, sin(a) * 0.045 * s, -0.075 * s, 0, 1, 1, 1, { rz: a, ol: 0.008 }); }
  return h;
}
// bake.js's visibility collapse only holds on the first frame (it keeps a stale boneMatrices array), so hidden nodes are also scaled to ~0
const show = (n, on) => { n.visible = on; if (!on) n.scale.setScalar(1e-4); else if (n.scale.x < 0.01) n.scale.setScalar(1); };
const wrap = (fn) => (o) => { const sb = STYLE.boost; STYLE.boost = 0; try { return fn(o || {}); } finally { STYLE.boost = sb; } }; // foes use fixed detail (budget), whatever the hero boost is
const kf = (u, pts) => { // piecewise ease through [[u, value], ...]; u < 0 = idle (first value)
  if (u < 0 || u <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], ease((u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]))); return pts[pts.length - 1][1];
};

// ---------------------------------------------------------------- 1. Tuner Drone (melee): a hovering dial with four rotor arms and a claw
function drone(o) {
  const c = core('storm_drone', 1, o, 0.65, 0.8), { P, root, S, L } = c, SIL = 0xdde2ec, SIL2 = 0x9ea8c0, CREAM = 0xf7f3e6;
  const hover = new THREE.Group(); root.add(hover);
  const tilt = new THREE.Group(); tilt.position.y = 0.82; hover.add(tilt);
  P(tilt, ico(2), SIL, 0, 0, 0, 0.45, 0.45, 0.3, { mo: M });
  flat(ico(0), basic(0xffffff), tilt, -0.24, 0.24, 0.2, 0.11, 0.03, 0.03).rotation.z = 0.8; // gloss streak
  P(tilt, torus(0.35, 0.05, 6, 20), SIL2, 0, 0, 0.27, 1, 1, 1, { mo: M });
  P(tilt, cyl(1, 1, 1, 22), CREAM, 0, 0, 0.3, 0.33, 0.06, 0.33, { rx: PI / 2, ol: false });
  for (let i = 0; i < 12; i++) { const a = i * PI / 6; flat(box(1, 1, 1), basic(0x6a5a7a), tilt, sin(a) * 0.275, cos(a) * 0.275, 0.335, 0.018, i % 3 ? 0.04 : 0.07, 0.01, { rz: -a }); }
  const needle = new THREE.Group(); needle.position.set(0, 0, 0.34); tilt.add(needle);
  flat(box(1, 1, 1), basic(0xff4a5a), needle, 0, 0.1, 0, 0.032, 0.2, 0.014); flat(ico(0), basic(0xffd0d4), needle, 0, 0, 0, 0.04, 0.04, 0.02);
  const face = addFace(c.ctx, tilt, { cy: 0, rx: 3, ry: 3, rz: 0.35, hs: 1 }, { ex: 0.1, ey: -0.035, ew: 0.052, eh: 0.066, mw: 0.05, my: -0.13, iris: 0x8a7ad0, blush: false });
  P(tilt, cyl(0.08, 0.11, 0.08, 8), SIL2, 0, 0.45, 0, 1, 1, 1, { mo: M });
  const beacon = flat(ico(1), gl(0.5, 1.6, 1.7), tilt, 0, 0.53, 0, 0.085, 0.085, 0.085);
  c.crown(tilt, 0, 0.64, 0, 0.8); c.glints(tilt, 4, 0.7, 0.1);
  const rot = [];
  for (const [sx, e, L2] of [[-1, 0.7, 0.25], [1, 0.7, 0.25], [-1, -0.05, 0.28], [1, -0.05, 0.28]]) {
    const bx = sx * 0.37, by = e > 0.3 ? 0.2 : -0.12, tx = bx + sx * cos(e) * L2, ty = by + sin(e) * L2;
    c.limb(tilt, [bx - sx * 0.04, by, 0], [tx, ty, 0], 0.036, SIL2, { mo: M });
    P(tilt, cyl(0.032, 0.04, 0.1, 6), SIL2, tx, ty + 0.05, 0, 1, 1, 1, { mo: M, ol: 0.01 });
    const r = new THREE.Group(); r.position.set(tx, ty + 0.11, 0); tilt.add(r); r.rotation.y = rot.length;
    flat(box(1, 1, 1), basic(0x5b6a9a), r, 0, 0, 0, 0.34, 0.014, 0.055); flat(box(1, 1, 1), basic(0x5b6a9a), r, 0, 0, 0, 0.055, 0.014, 0.34); flat(ico(0), basic(0xcfd6ea), r, 0, 0.01, 0, 0.035, 0.03, 0.035);
    rot.push(r);
  }
  const claw = new THREE.Group(); claw.position.set(0, -0.56, 0.02); tilt.add(claw);
  P(claw, cyl(0.065, 0.075, 0.1, 8), SIL2, 0, 0, 0, 1, 1, 1, { mo: M });
  const prongs = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.04, -0.05, 0); claw.add(g); P(g, hang(0.032, 0.02, 0.16, 5), SIL, 0, 0, 0, 1, 1, 1, { mo: M, ol: 0.01 }); P(g, ico(0), SIL2, 0, -0.16, 0, 0.032, 0.03, 0.03, { mo: M, ol: false }); return g; });
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, ho = F.h;
      const bob = sin(t * 3.1 + S.off) * 0.05, jit = sin(t * 55) * 0.05 * ho;
      hover.position.set(jit, bob - A * 0.28, A * 0.6);
      tilt.rotation.set(0.14 * amp + A * 0.55 - ho * 0.2, sin(t * 1.3 + S.off) * 0.12, sin(t * 2.2 + S.off) * 0.05 + sin(t * 5) * 0.03 * amp + jit);
      for (let i = 0; i < 4; i++) rot[i].rotation.y += F.dt * (34 + 24 * amp) * (i % 2 ? -1 : 1);
      needle.rotation.z = sin(t * 9) * (0.06 + A * 0.12) - A * 1.1 + ho * 0.5;
      const open = kf(u, [[0, 0.22 + 0.1 * sin(t * 2)], [0.4, 0.85], [0.55, -0.05], [1, 0.22]]);
      prongs[0].rotation.z = open; prongs[1].rotation.z = -open;
      const pu = 0.7 + 0.3 * sin(t * 5); beacon.scale.setScalar(0.085 * (pu + A * 0.4));
      setBlink(face, F.bl); setMouth(face, A * 0.8, 0);
      lifeXform(L, root, 1, 1, 1, 1, 1); c.fx(t);
    },
  };
  return c.done(self, 1.3, 0.62);
}

// ---------------------------------------------------------------- 2. Synchro Dancer (fast): a white mannequin in a pink dotted leotard, jazz hands, pirouette strike
function dancer(o) {
  const c = core('blank_soldier', 2, o, 0.7, 0.8), { P, root, S, L } = c, WH = 0xf7f4fd, WH2 = 0xe2def3, LAV = 0xb9a8f0, PINK = 0xffd0e4, DOT = 0xff8fbd, SHOE = 0xc3b2f2;
  const dance = new THREE.Group(); root.add(dance);
  const legs = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.1, 0.56, 0); dance.add(g);
    P(g, hang(0.05, 0.043, 0.46, 6), WH, 0, 0, 0, 1, 1, 1, { ol: 0.013 }); P(g, ico(0), WH2, 0, -0.25, 0.005, 0.062, 0.062, 0.062, { ol: 0.01 }); P(g, ico(1), SHOE, 0, -0.5, 0.045, 0.085, 0.055, 0.13); return g; });
  const body = new THREE.Group(); body.position.y = 0.56; dance.add(body);
  P(body, ico(1), PINK, 0, 0.03, 0, 0.17, 0.11, 0.13); P(body, ico(2), PINK, 0, 0.27, 0, 0.19, 0.22, 0.14);
  for (const [x, y] of [[-0.09, 0.17], [0.08, 0.16], [-0.02, 0.1], [0.11, 0.3], [-0.11, 0.31], [0.0, 0.43], [-0.07, 0.4], [0.07, 0.42]]) flat(ico(0), basic(DOT), body, x, y, ez(0.19, 0.22, 0.14, x, y - 0.27) + 0.002, 0.018, 0.018, 0.008);
  const hz = ez(0.19, 0.22, 0.14, 0, 0.04) + 0.004; flat(starGeo(), basic(0xff3a5a), body, 0, 0.32, hz, 0.04, 0.04, 0.05);
  const head = new THREE.Group(); head.position.y = 0.62; body.add(head);
  P(head, ico(2), WH, 0, 0, 0, 0.29, 0.27, 0.26, { ol: 0.017 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.29, ry: 0.27, rz: 0.26, hs: 1 }, { ex: 0.115, ey: -0.02, ew: 0.058, eh: 0.082, mw: 0.05, my: -0.125, iris: 0x9a8ad8, blushColor: 0xffa6c8 });
  P(head, cap(10, 5, 1.55), LAV, 0, 0.02, -0.03, 0.31, 0.29, 0.28, { rx: -0.4 });
  for (const sd of [-1, 1]) P(head, ico(1), LAV, sd * 0.27, -0.04, -0.02, 0.09, 0.17, 0.1);
  for (let i = 0; i < 3; i++) { const x = -0.1 + i * 0.1; P(head, cone(0.06, 0.12, 4), LAV, x, 0.2, 0.15 - Math.abs(x) * 0.2, 1, 1, 0.8, { rx: PI, ol: 0.01 }); }
  P(head, cone(0.07, 0.15, 5), LAV, 0, 0.3, -0.06, 1, 1, 1, { rx: -0.25, ol: 0.012 });
  const arms = [-1, 1].map((sd) => { const sh = new THREE.Group(); sh.position.set(sd * 0.2, 0.4, 0); body.add(sh);
    P(sh, hang(0.04, 0.035, 0.2, 6), WH, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el); P(el, hang(0.035, 0.03, 0.18, 6), WH, 0, 0, 0, 1, 1, 1, { ol: 0.012 }); P(el, ico(0), WH2, 0, 0, 0, 0.046, 0.046, 0.046, { ol: 0.01 });
    const hand = glove(c, el, WH); hand.position.y = -0.19; return { sh, el, hand, sd }; });
  c.crown(head, 0, 0.36, 0, 0.8); c.glints(dance, 4, 0.65, 0.6, 0.045);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, idle = 1 - amp; S.ph += F.dt * F.sp * 17; const ph = S.ph, bt = t * 5.4 + S.off;
      root.position.set(0, abs(sin(ph)) * 0.13 * amp + abs(sin(bt)) * 0.05 * idle + (u >= 0 ? sin(clamp(u, 0, 1) * PI) * 0.18 : 0), A * 0.4);
      dance.rotation.y = u >= 0 ? TAU * ease(clamp(u / 0.8, 0, 1)) : 0; // the pirouette strike
      legs[0].rotation.x = sin(ph) * 0.95 * amp + sin(bt) * 0.2 * idle; legs[1].rotation.x = -sin(ph) * 0.95 * amp - sin(bt) * 0.2 * idle - A * 1.1;
      body.rotation.set(0.12 * amp + A * 0.2, sin(ph) * 0.25 * amp + sin(bt * 0.5) * 0.12 * idle, sin(bt * 0.5) * 0.09 * idle + F.h * sin(t * 50) * 0.1);
      head.rotation.set(-0.05 * amp, -sin(ph) * 0.1 * amp, sin(bt * 0.5 + 1) * 0.12 * idle);
      for (let i = 0; i < 2; i++) { const a = arms[i], sd = a.sd;
        a.sh.rotation.set(sin(ph + i * PI) * 0.7 * amp, 0, sd * lerp(2.4 + sin(bt + i * PI) * 0.2 * idle, 1.7, A));
        a.el.rotation.z = sd * (0.3 + sin(bt * 2 + i) * 0.14); a.hand.rotation.z = sin(t * 14 + i * 2) * 0.32; }
      setBlink(face, F.bl); setMouth(face, 0.2 + 0.3 * Math.max(0, sin(bt)) + A * 0.5, 0.4);
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.04, 1); c.fx(t);
    },
  };
  return c.done(self, 1.5, 0.55);
}

// ---------------------------------------------------------------- 3. VIP Bouncer (tank): a gold pawn-shaped doorman on a hover pad, shades, earpiece, shoving arms
function bouncer(o) {
  const c = core('komainu_guardian', 3, o, 0.7, 0.85), { P, root, S, L } = c, GOLD = 0xf3d37f, GOLD2 = 0xd9b24f, MAR = 0x92306c, MAR2 = 0x732556, PLAT = 0xc5cde0, PLAT2 = 0xe8edfa;
  P(root, cyl(0.64, 0.66, 0.05, 24), PLAT, 0, 0.025, 0, 1, 1, 1, { mo: M }); P(root, cyl(0.5, 0.54, 0.04, 20), PLAT2, 0, 0.065, 0, 1, 1, 1, { mo: M });
  flat(torus(0.56, 0.014, 3, 26), gl(1.4, 1.5, 1.8), root, 0, 0.088, 0, 1, 1, 1, { rx: PI / 2 });
  const body = new THREE.Group(); body.position.y = 0.09; root.add(body);
  const pawn = lathe('c3pawn', [[0, 0], [0.3, 0], [0.34, 0.05], [0.28, 0.2], [0.17, 0.4], [0.16, 0.52], [0.26, 0.68], [0.33, 0.84], [0.27, 0.98], [0.12, 1.05], [0, 1.05]].map(([r, y]) => [r * 0.9, y * 0.85]), 14);
  P(body, pawn, GOLD, 0, 0, 0, 1, 1, 1, { ol: 0.02 });
  P(body, torus(0.2, 0.03, 4, 14), GOLD2, 0, 0.36, 0, 1, 1, 1, { rx: PI / 2, ol: 0.01 });
  P(body, torus(0.17, 0.035, 4, 14), GOLD2, 0, 0.83, 0, 1, 1, 1, { rx: PI / 2, ol: 0.011 }); // collar, so the head reads as its own ball
  const arms = [-1, 1].map((sd) => { const sh = new THREE.Group(); sh.position.set(sd * 0.3, 0.7, 0); body.add(sh);
    P(sh, hang(0.082, 0.07, 0.3, 7), MAR, 0, 0, 0, 1, 1, 1, { ol: 0.016 }); P(sh, ico(0), MAR, 0, 0, 0, 0.09, 0.09, 0.09, { ol: 0.012 });
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el); P(el, hang(0.07, 0.06, 0.26, 7), MAR2, 0, 0, 0, 1, 1, 1, { ol: 0.015 }); P(el, ico(1), GOLD, 0, -0.29, 0.01, 0.09, 0.085, 0.09, { ol: 0.012 });
    return { sh, el, sd }; });
  const head = new THREE.Group(); head.position.y = 0.98; body.add(head);
  P(head, ico(2), GOLD, 0, 0, 0, 0.28, 0.27, 0.26, { ol: 0.019 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.28, ry: 0.27, rz: 0.26, hs: 0.95 }, { mw: 0.055, my: -0.135, blushColor: 0xffa070 });
  for (const e of face.eyes) show(e, false);
  for (const sd of [-1, 1]) { P(head, ico(1), 0x241c30, sd * 0.1, 0.045, 0.2, 0.108, 0.075, 0.07, { ol: 0.01, nt: true }); flat(ico(0), basic(0xffffff), head, sd * 0.13, 0.075, 0.262, 0.035, 0.012, 0.01).rotation.z = 0.6; }
  flat(box(1, 1, 1), basic(0x241c30), head, 0, 0.055, 0.25, 0.07, 0.02, 0.02);
  P(head, ico(1), GOLD2, 0.27, 0.0, 0.0, 0.05, 0.065, 0.045, { ol: 0.008 });
  for (let i = 0; i < 3; i++) P(head, torus(0.03, 0.01, 3, 6), 0x3a3a50, 0.285 + i * 0.012, -0.07 - i * 0.08, -0.01, 1, 1, 1, { ol: false, nt: true, ry: PI / 2 });
  c.crown(head, 0, 0.27, 0, 0.95); c.glints(root, 5, 0.7, 0.5, 0.055);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u; S.ph += F.dt * F.sp * 6.5; const ph = S.ph, br = sin(t * 2 + S.off), step = abs(sin(ph));
      root.position.set(0, 0, A * 0.38);
      body.position.set(sin(ph) * 0.045 * amp, 0.09 + step * 0.045 * amp + br * 0.008, 0);
      body.rotation.set(0.1 * amp + A * 0.32 - kf(u, [[0, 0], [0.25, 0.18], [0.4, 0]]), 0, sin(ph) * 0.1 * amp);
      body.scale.set(1 + (1 - step) * 0.04 * amp, 1 - (1 - step) * 0.07 * amp + br * 0.01, 1 + (1 - step) * 0.04 * amp);
      head.rotation.set(-A * 0.2, -sin(ph) * 0.07 * amp + sin(t * 0.8) * 0.06, sin(t * 1.1) * 0.03);
      const sw = kf(u, [[0, 0], [0.25, -0.5], [0.45, 1], [0.75, 1], [1, 0]]); // wind up, then the two-handed shove
      for (const a of arms) { a.sh.rotation.set(-sw * 1.55 + sin(ph + (a.sd > 0 ? PI : 0)) * 0.3 * amp, 0, a.sd * (0.5 - sw * 0.4)); a.el.rotation.set(-sw * 0.5, 0, -a.sd * (0.9 - sw * 0.5)); }
      setMouth(face, A * 0.8 + 0.1 * br, 0.3);
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.04, 1 + A * 0.04); c.fx(t);
    },
  };
  return c.done(self, 1.4, 0.64);
}

// ---------------------------------------------------------------- 4. Chrome Siren (spitter): a floating singer, faders on her head, leans back and spits a teal glob
function siren(o) {
  const c = core('void_scribe', 4, o, 0.8, 0.85), { P, root, S, L } = c, MINT = 0xa6ecc8, MINT2 = 0x8fdcb4, SKIN = 0xf3fbf6, LAV = 0xcdbdfa, LAV2 = 0xa890e8, TOP = 0xb4efd9;
  const fl = new THREE.Group(); fl.position.y = 0.26; root.add(fl);
  P(fl, cyl(0.15, 0.36, 0.44, 12), LAV, 0, 0.26, 0, 1, 1, 1, { ol: 0.016 });
  const hem = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, g = new THREE.Group(); g.position.set(cos(a) * 0.31, 0.07, sin(a) * 0.31); fl.add(g); P(g, cone(0.1, 0.17, 4), LAV2, 0, -0.03, 0, 1, 1, 1, { rx: PI, ol: 0.011 }); hem.push(g); }
  const upper = new THREE.Group(); upper.position.y = 0.46; fl.add(upper);
  P(upper, ico(1), TOP, 0, 0.1, 0, 0.17, 0.17, 0.13);
  const head = new THREE.Group(); head.position.y = 0.4; upper.add(head);
  P(head, ico(2), SKIN, 0, 0, 0, 0.25, 0.24, 0.225, { ol: 0.017 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.25, ry: 0.24, rz: 0.225, hs: 0.95 }, { ex: 0.105, ey: -0.01, ew: 0.052, eh: 0.07, mw: 0.04, my: -0.115, iris: 0x4a6a6a, blushColor: 0xffa6c0 });
  P(head, cap(10, 5, 1.55), MINT, 0, 0.02, -0.03, 0.27, 0.25, 0.25, { rx: -0.4 });
  for (const sd of [-1, 1]) { P(head, ico(1), MINT, sd * 0.24, -0.1, 0.0, 0.1, 0.2, 0.11); P(head, ico(0), MINT2, sd * 0.27, -0.28, 0.02, 0.08, 0.07, 0.08, { ol: 0.01 }); }
  P(head, ico(1), MINT, 0, -0.05, -0.14, 0.25, 0.24, 0.12);
  for (let i = 0; i < 3; i++) { const x = -0.09 + i * 0.09; P(head, cone(0.055, 0.1, 4), MINT, x, 0.17, 0.14 - Math.abs(x) * 0.25, 1, 1, 0.8, { rx: PI, ol: 0.01 }); }
  const fad = [];
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5, g = new THREE.Group(); g.position.set(sin(a) * 0.14, 0.2 + cos(a) * 0.03, -0.02); g.rotation.z = -a; head.add(g);
    P(g, ico(0), 0x8c8ca8, 0, 0, 0, 0.035, 0.035, 0.035, { ol: 0.008 }); P(g, cyl(0.012, 0.012, 0.2, 4), 0x8c8ca8, 0, 0.1, 0, 1, 1, 1, { ol: false, nt: true });
    P(g, box(1, 1, 1), i === 2 ? 0xff4a5a : 0xf2f0ff, 0, 0.15 + (i % 2) * 0.03, 0, 0.075, 0.04, 0.05, { ol: 0.008 }); fad.push(g); }
  // mic at the lips, held in both hands
  P(upper, cyl(0.03, 0.036, 0.2, 6), 0x7e809a, 0, 0.17, 0.3, 1, 1, 1, { rx: -0.35, ol: 0.01, mo: M }); P(upper, ico(1), 0x5a5a76, 0, 0.3, 0.27, 0.062, 0.062, 0.062, { ol: 0.01 });
  for (const sd of [-1, 1]) { c.limb(upper, [sd * 0.16, 0.12, 0.02], [sd * 0.22, 0.04, 0.16], 0.04, SKIN); c.limb(upper, [sd * 0.22, 0.04, 0.16], [sd * 0.05, 0.16, 0.3], 0.036, SKIN); P(upper, ico(1), SKIN, sd * 0.05, 0.16, 0.31, 0.05, 0.05, 0.05, { ol: 0.01 }); }
  c.crown(head, 0, 0.3, 0, 0.85); c.glints(fl, 4, 0.55, 0.3, 0.045);
  const gb = new THREE.Group(); fl.add(gb); show(gb, false); // the spat glob: windup bubble at the mic, then it flies forward
  const gm = gl(0.05, 1.05, 0.85), glob = flat(ico(1), gm, gb, 0, 0, 0, 1, 1, 1), hl = flat(ico(0), basic(0xffffff), gb, 0, 0, 0, 1, 1, 1), d1 = flat(ico(0), gm, gb, 0, 0, 0, 1, 1, 1), d2 = flat(ico(0), gm, gb, 0, 0, 0, 1, 1, 1);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, sg = sin(t * 2.4 + S.off), ho = F.h;
      S.ph += F.dt * F.sp * 8;
      const lean = kf(u, [[0, 0], [0.45, 1], [0.58, -0.6], [0.8, 0], [1, 0]]); // back, then snap forward as it spits
      fl.position.set(sin(t * 52) * 0.04 * ho, 0.26 + sg * 0.06 + amp * 0.04, 0);
      fl.rotation.set(0.16 * amp, sin(t * 0.9 + S.off) * 0.08, sin(t * 1.7 + S.off) * 0.05);
      upper.rotation.set(-lean * 0.5 + 0.05 * sg, 0, 0); head.rotation.set(-lean * 0.35, sin(t * 1.3) * 0.08, sin(t * 1.9) * 0.05);
      for (let i = 0; i < 10; i++) { hem[i].rotation.set(sin(t * 3 + i * 0.9) * 0.18 - amp * 0.35, 0, cos(t * 2.6 + i * 1.3) * 0.18); }
      for (let i = 0; i < 5; i++) fad[i].rotation.z = -(i - 2) * 0.5 + sin(t * 4 + i * 1.7) * 0.12 + lean * 0.12;
      // glob: grows in u 0..0.55, flies 0.58..1
      const fly = u < 0.58 ? 0 : clamp((u - 0.58) / 0.42, 0, 1), on = u >= 0 && fly < 1; show(gb, on);
      if (on) { const g = u < 0.55 ? ease(u / 0.55) : 1, s = 0.16 * g * (1 - 0.6 * fly * fly), k = Math.max(0.001, s);
        gb.position.set(0, 0.78 + 0.05 * sg - fly * 0.28, 0.4 + fly * 2.0); glob.scale.setScalar(k); hl.scale.set(k * 0.4, k * 0.25, k * 0.2); hl.position.set(-k * 0.35, k * 0.4, k * 0.8);
        d1.scale.setScalar(Math.max(0.001, k * 0.55 * fly)); d2.scale.setScalar(Math.max(0.001, k * 0.4 * fly)); d1.position.set(0, 0, -k * 7 * fly); d2.position.set(0.02, 0.01, -k * 12 * fly); }
      setBlink(face, clamp(0.88 - ho * 0.8 - A * 0.4, 0, 1)); setMouth(face, 0.35 + 0.45 * Math.max(0, sin(t * 7)) * (1 - A) + lean * 0.9, 0.2);
      lifeXform(L, root, 1, 1, 1, 1, 1); c.fx(t);
    },
  };
  return c.done(self, 1.42, 0.55);
}

// ---------------------------------------------------------------- 5. Clapperboard Knight (tank): armoured robot, clapper hat that claps, striped slate beard, megaphone
function clapper(c, par, w, d, y, z, closed) { // a striped clapper board; returns the pivot group (hinged at its left end)
  const g = new THREE.Group(); g.position.set(-w / 2, y, z); par.add(g);
  c.P(g, box(1, 1, 1), 0xf4f1ff, w / 2, 0, 0, w, 0.07, d, { ol: 0.013 }); const n = 5; for (let i = 0; i < n; i += 2) c.P(g, box(1, 1, 1), 0x2d2640, w * (i + 0.5) / n, 0.001, 0, w / n * 0.98, 0.074, d * 1.001, { ol: false, nt: true });
  return g;
}
function knight(o) {
  const c = core('redaction_knight', 5, o, 0.8, 0.9), { P, root, S, L } = c, SIL = 0xcdd1de, SIL2 = 0xa6aec4, LAV = 0xcdbdf6, BOOT = 0xb6a6ee, WH = 0xf6f3ff;
  const legs = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.14, 0.34, 0); root.add(g);
    P(g, hang(0.085, 0.078, 0.22, 7), WH, 0, 0, 0, 1, 1, 1, { ol: 0.015 }); P(g, ico(1), BOOT, 0, -0.27, 0.04, 0.125, 0.09, 0.18); return g; });
  const body = new THREE.Group(); body.position.y = 0.34; root.add(body);
  P(body, ico(2), SIL, 0, 0.28, 0, 0.3, 0.27, 0.23, { mo: M, ol: 0.018 }); P(body, ico(1), SIL2, 0, 0.06, 0, 0.25, 0.1, 0.19, { mo: M });
  P(body, torus(0.22, 0.03, 4, 14), 0x4a4660, 0, 0.12, 0, 1, 1, 1, { rx: PI / 2, ol: 0.01, nt: true }); flat(ico(1), gl(1.5, 0.5, 0.9), body, 0, 0.12, 0.225, 0.045, 0.045, 0.025);
  P(body, ico(0), SIL, 0, 0.5, 0, 0.2, 0.08, 0.16, { mo: M });
  const head = new THREE.Group(); head.position.y = 0.76; body.add(head);
  P(head, ico(2), WH, 0, 0, 0, 0.3, 0.28, 0.27, { ol: 0.019 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.3, ry: 0.28, rz: 0.27, hs: 1 }, { ex: 0.12, ey: 0.03, ew: 0.056, eh: 0.075, my: -0.2, mw: 0.02, iris: 0x7a8296, brow: 0x4a4660, browTilt: -0.15, blushColor: 0xffa6c8 });
  // slate beard (hides the mouth) and the clapper hat
  const slate = c.P(head, box(1, 1, 1), 0xf4f1ff, 0, -0.17, 0.2, 0.44, 0.13, 0.1, { rx: 0.2, ol: 0.014 }); stripes(c, head, 3, -0.18, 0.18, -0.17, 0.205, 0.075, 0.136, 0.104, 0x2d2640, { rx: 0.2 });
  c.P(head, box(1, 1, 1), 0xf4f1ff, 0, 0.27, 0.03, 0.5, 0.07, 0.32, { rx: -0.12, ol: 0.014 }); stripes(c, head, 3, -0.2, 0.2, 0.27, 0.03, 0.1, 0.074, 0.322, 0x2d2640, { rx: -0.12 });
  const stick = clapper(c, head, 0.5, 0.32, 0.345, 0.03); stick.rotation.z = 0.55;
  flat(ico(0), gl(1.6, 0.4, 0.5), head, -0.25, 0.31, 0.2, 0.03, 0.03, 0.03);
  const flash = flat(oct(), gl(2.4, 2.3, 1.6), head, 0, 0.36, 0.05, 0.001, 0.001, 0.001);
  // arms: megaphone on the left, board arm on the right
  const aL = new THREE.Group(); aL.position.set(-0.33, 0.4, 0); body.add(aL); P(aL, hang(0.08, 0.07, 0.2, 7), SIL, 0, 0, 0, 1, 1, 1, { mo: M }); P(aL, ico(0), SIL2, 0, 0, 0, 0.1, 0.1, 0.1, { mo: M });
  const eL = new THREE.Group(); eL.position.y = -0.2; aL.add(eL); P(eL, hang(0.07, 0.06, 0.2, 7), SIL, 0, 0, 0, 1, 1, 1, { mo: M }); P(eL, ico(1), WH, 0, -0.22, 0.01, 0.085, 0.08, 0.085);
  const mg = new THREE.Group(); mg.position.set(0, -0.24, 0.1); eL.add(mg);
  P(mg, cyl(0.2, 0.06, 0.32, 10), LAV, 0, 0, 0.12, 1, 1, 1, { rx: PI / 2, ol: 0.016 }); P(mg, torus(0.2, 0.025, 4, 12), WH, 0, 0, 0.28, 1, 1, 1, { ol: 0.01 }); P(mg, ico(0), 0x8a7ad0, 0, 0, -0.05, 0.05, 0.05, 0.05, { ol: 0.008 });
  const rings = [0, 1, 2].map((i) => flat(torus(1, 0.05, 3, 14), gl(1.7, 1.2, 2), mg, 0, 0, 0.3, 0.001, 0.001, 0.001));
  const aR = new THREE.Group(); aR.position.set(0.33, 0.4, 0); body.add(aR); P(aR, hang(0.08, 0.07, 0.2, 7), SIL, 0, 0, 0, 1, 1, 1, { mo: M }); P(aR, ico(0), SIL2, 0, 0, 0, 0.1, 0.1, 0.1, { mo: M });
  const eR = new THREE.Group(); eR.position.y = -0.2; aR.add(eR); P(eR, hang(0.07, 0.06, 0.2, 7), SIL, 0, 0, 0, 1, 1, 1, { mo: M }); P(eR, ico(1), WH, 0, -0.22, 0.01, 0.085, 0.08, 0.085);
  c.crown(head, 0, 0.4, 0, 0.95); c.glints(root, 5, 0.7, 0.6, 0.055);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u; S.ph += F.dt * F.sp * 6; const ph = S.ph, br = sin(t * 2.2 + S.off), step = abs(sin(ph));
      root.position.set(0, step * 0.04 * amp, A * 0.3);
      legs[0].rotation.x = sin(ph) * 0.55 * amp; legs[1].rotation.x = -sin(ph) * 0.55 * amp;
      const lunge = kf(u, [[0, 0], [0.3, -0.3], [0.5, 0.5], [1, 0]]);
      body.rotation.set(0.07 * amp + lunge * 0.3, sin(ph) * 0.12 * amp, sin(ph) * 0.05 * amp);
      body.scale.set(1 + (1 - step) * 0.04 * amp, 1 - (1 - step) * 0.06 * amp + br * 0.01, 1 + (1 - step) * 0.04 * amp);
      head.rotation.set(-lunge * 0.2 + sin(t * 1.3) * 0.03, -sin(ph) * 0.06 * amp, sin(t) * 0.03);
      // idle clap: every ~1.7 s the stick snaps shut, a spark pops; the attack is one big clap
      const cp = (t * 0.6 + S.off) % 1, ca = cp < 0.12 ? 1 - ease(cp / 0.12) : cp < 0.2 ? ease((cp - 0.12) / 0.08) * 0 : 0;
      const open = u >= 0 ? kf(u, [[0, 0.55], [0.3, 1.05], [0.48, 0.0], [0.7, 0.0], [1, 0.55]]) : lerp(0.55, 0.0, cp < 0.12 ? ease(cp / 0.12) : cp < 0.3 ? 1 : 1 - ease((cp - 0.3) / 0.3)) ;
      stick.rotation.z = open;
      const hit = u >= 0 ? clamp(1 - abs(u - 0.5) * 9, 0, 1) : (cp > 0.1 && cp < 0.22 ? 1 - abs(cp - 0.16) / 0.06 : 0); flash.scale.set(0.12 * hit, 0.2 * hit, 0.12 * hit); flash.rotation.z = hit;
      // megaphone arm: raises to shout on the attack
      const sh = kf(u, [[0, 0], [0.4, 0], [0.5, 1], [0.85, 1], [1, 0]]);
      aL.rotation.set(-1.0 - sh * 0.5 + sin(ph) * 0.35 * amp, 0.2, -0.25 + sin(t * 1.5) * 0.04); eL.rotation.x = -0.3 - sh * 0.2;
      for (let i = 0; i < 3; i++) { const k = clamp((u - 0.5 - i * 0.1) / 0.3, 0, 1); const on = u >= 0 && k > 0 && k < 1; show(rings[i], on); if (on) { const s = 0.18 + k * 0.35; rings[i].scale.set(s, s, 0.2); rings[i].position.z = 0.3 + k * 0.7; } }
      aR.rotation.set(-sin(ph) * 0.5 * amp - lunge * 0.9, 0, 0.3 + sin(t * 1.4) * 0.04 + A * 0.3); eR.rotation.x = -0.2 - A * 0.6;
      setBlink(face, F.bl); head.rotation.z += 0;
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.05, 1 + A * 0.04); c.fx(t);
    },
  };
  return c.done(self, 1.4, 0.68);
}

// ---------------------------------------------------------------- 6. Glitch Gremlin (fast): glossy magenta head, lime headphones, clipboard, jittery glitch cubes
function imp(o) {
  const c = core('margin_imp', 6, o, 0.55, 0.75), { P, root, S, L } = c, MAG = 0xe53bb4, MAG2 = 0xc22a95, LIME = 0xd2f56a, GREY = 0xc9cddb, PAPER = 0xfcffdc;
  const legs = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.11, 0.3, 0); root.add(g);
    P(g, hang(0.06, 0.055, 0.22, 6), MAG2, 0, 0, 0, 1, 1, 1, { ol: 0.014 }); P(g, ico(1), MAG, 0, -0.26, 0.04, 0.105, 0.07, 0.15); return g; });
  const body = new THREE.Group(); body.position.y = 0.3; root.add(body);
  P(body, ico(1), MAG2, 0, 0.14, 0, 0.2, 0.18, 0.16);
  const head = new THREE.Group(); head.position.y = 0.6; body.add(head);
  P(head, ico(2), MAG, 0, 0, 0, 0.38, 0.36, 0.34, { ol: 0.02 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.38, ry: 0.36, rz: 0.34, hs: 1.2 }, { ex: 0.115, ey: 0.02, ew: 0.074, eh: 0.1, mw: 0.05, my: -0.15, iris: 0x7edc3a, blushColor: 0xff9cd8 });
  flat(ico(0), basic(0xffffff), head, -0.17, 0.25, 0.26, 0.09, 0.05, 0.04).rotation.z = 0.7; flat(ico(0), basic(0xffd0f0), head, -0.28, 0.14, 0.2, 0.025, 0.025, 0.02);
  P(head, arcTor(0.07), GREY, 0, 0, 0, 0.42, 0.42, 0.42, { ol: 0.012, mo: M });
  for (const sd of [-1, 1]) { P(head, cyl(1, 1, 1, 14), LIME, sd * 0.4, 0, 0, 0.16, 0.1, 0.16, { rz: PI / 2, ol: 0.014 }); P(head, cyl(1, 1, 1, 14), GREY, sd * 0.45, 0, 0, 0.19, 0.05, 0.19, { rz: PI / 2, ol: 0.012, mo: M }); }
  const clip = new THREE.Group(); clip.position.set(0, 0.2, 0.22); body.add(clip);
  P(clip, box(1, 1, 1), PAPER, 0, 0, 0, 0.4, 0.5, 0.05, { ol: 0.013 }); P(clip, box(1, 1, 1), 0x8a8ea6, 0, 0.26, 0.03, 0.14, 0.06, 0.05, { ol: 0.009, mo: M });
  for (let i = 0; i < 3; i++) flat(box(1, 1, 1), basic(0x5c8a9a), clip, -0.02 + (i % 2) * 0.02, 0.1 - i * 0.12, 0.028, 0.24, 0.016, 0.008).rotation.z = i % 2 ? 0.08 : -0.07;
  const arms = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.19, 0.24, 0.02); body.add(g); c.limb(g, [0, 0, 0], [sd * 0.05, -0.1, 0.12], 0.045, MAG2); P(g, ico(1), MAG, sd * 0.02, -0.12, 0.14, 0.065, 0.065, 0.065, { ol: 0.011 }); return g; });
  c.crown(head, 0, 0.36, 0, 0.9);
  const bitCol = [0x40e8ff, 0xb8a8ff, 0xa8ff58, 0xffffff, 0x40e8ff], bits = bitCol.map((col, i) => flat(box(1, 1, 1), basic(col), root, 0, 0, 0, 0.08, 0.08, 0.08)); c.glints(root, 4, 0.55, 0.7, 0.045);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, idle = 1 - amp; S.ph += F.dt * F.sp * 20; const ph = S.ph, bt = t * 7 + S.off, ho = F.h;
      const gl2 = sin(t * 2.7 + S.off) * sin(t * 5.3) > 0.8 ? 1 : 0; // glitch twitch
      root.position.set(0, abs(sin(ph)) * 0.16 * amp + abs(sin(bt)) * 0.035 * idle + (u >= 0 ? sin(clamp(u, 0, 1) * PI) * 0.35 : 0), kf(u, [[0, 0], [0.3, -0.12], [0.55, 0.6], [1, 0]]));
      legs[0].rotation.x = sin(ph) * 1.0 * amp; legs[1].rotation.x = -sin(ph) * 1.0 * amp;
      body.rotation.set(0.18 * amp + A * 0.3, sin(ph) * 0.18 * amp, sin(bt * 0.5) * 0.06 * idle + ho * sin(t * 50) * 0.1);
      body.scale.set(1 + (1 - abs(sin(ph))) * 0.05 * amp, 1 - (1 - abs(sin(ph))) * 0.07 * amp + sin(bt) * 0.015 * idle, 1);
      head.rotation.set(-0.08 * amp - A * 0.2, -sin(ph) * 0.12 * amp + sin(bt * 0.4) * 0.07 * idle, sin(ph * 0.5) * 0.08 * amp);
      head.position.set(gl2 * sin(t * 90) * 0.035, 0.6, 0); head.scale.set(1 + gl2 * 0.05 * sin(t * 70), 1 - gl2 * 0.05 * sin(t * 70), 1);
      clip.rotation.set(kf(u, [[0, -0.05], [0.3, -0.7], [0.55, 0.5], [1, -0.05]]) + sin(ph) * 0.06 * amp, 0, 0); clip.position.y = 0.2 + sin(ph * 2) * 0.012 * amp;
      for (let i = 0; i < 2; i++) arms[i].rotation.x = kf(u, [[0, 0], [0.3, -1.1], [0.55, 0.3], [1, 0]]) - 0.1;
      for (let i = 0; i < 5; i++) { const a = t * (1.1 + i * 0.13) + i * 1.3, r = 0.6 + (i % 2) * 0.08, k = sin(t * 11 + i * 3) > 0.85 ? 1.6 : 1; bits[i].position.set(cos(a) * r, 0.75 + sin(t * 1.7 + i * 2) * 0.28 + i * 0.05, sin(a) * r); bits[i].rotation.set(t * 2 + i, t * 3 + i, 0); bits[i].scale.setScalar(0.11 * k * (0.7 + 0.3 * sin(t * 4 + i))); }
      setBlink(face, F.bl); setMouth(face, 0.25 + A * 0.7, 0.4);
      lifeXform(L, root, 1, 1, 1, 1, 1); c.fx(t);
    },
  };
  return c.done(self, 1.2, 0.6);
}

// ---------------------------------------------------------------- 7. Ring Light Sentinel (tank): a ring light on a tripod with a sleepy face, pulsing LEDs, blinding flash
function sentinel(o) {
  const c = core('thunder_crow', 7, o, 0.8, 0.85), { P, root, S, L } = c, SIL = 0xe6eaf4, SIL2 = 0xaab4cc;
  const body = new THREE.Group(); root.add(body);
  const ringG = new THREE.Group(); ringG.position.y = 0.92; body.add(ringG);
  P(ringG, torus(0.4, 0.085, 8, 28), SIL, 0, 0, 0, 1, 1, 1, { mo: M, ol: 0.016 });
  flat(cyl(1, 1, 1, 22), gl(0.8, 0.96, 1.04), ringG, 0, 0, 0, 0.37, 0.05, 0.37, { rx: PI / 2 }); // unlit glass so the face pops
  P(ringG, cyl(0.07, 0.08, 0.08, 8), SIL2, 0, 0.5, 0, 1, 1, 1, { mo: M, ol: 0.012 });
  const led = new THREE.Group(); ringG.add(led);
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; flat(ico(0), gl(1.7, 1.7, 1.55), led, cos(a) * 0.4, sin(a) * 0.4, 0.066, 0.033, 0.033, 0.02); }
  const face = addFace(c.ctx, ringG, { cy: 0, rx: 3, ry: 3, rz: 0.03, hs: 1.1 }, { ex: 0.11, ey: 0.01, ew: 0.07, eh: 0.052, mw: 0.05, my: -0.12, iris: 0x6a7a9a, brow: 0x6a7692, browTilt: 0.32, blush: false });
  const flash = flat(cyl(1, 1, 1, 18), gl(2.2, 2.2, 1.8), ringG, 0, 0, 0.09, 0.001, 0.001, 0.001, { rx: PI / 2 });
  P(body, cyl(0.045, 0.045, 0.14, 7), SIL2, 0, 0.45, 0, 1, 1, 1, { mo: M, ol: 0.012 }); P(body, ico(1), SIL2, 0, 0.52, 0, 0.09, 0.09, 0.09, { mo: M });
  const legs = [[-0.4, 0.32], [0.4, 0.32], [0, -0.42]].map(([fx, fz]) => { const hub = new THREE.Group(); hub.position.y = 0.52; body.add(hub); const sw = new THREE.Group(); hub.add(sw); const dx = fx, dy = -0.5, dz = fz, len = Math.hypot(dx, dy, dz);
    P(sw, cyl(0.032, 0.04, len, 6), SIL2, dx / 2, dy / 2, dz / 2, 1, 1, 1, { q: aim(dx, dy, dz), mo: M, ol: 0.013 }); P(sw, ico(1), SIL, dx, dy + 0.02, dz, 0.075, 0.04, 0.095, { mo: M, ol: 0.012 }); return sw; });
  c.crown(ringG, 0, 0.58, 0, 0.8); c.glints(root, 5, 0.7, 0.8, 0.055);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u; S.ph += F.dt * F.sp * 6; const ph = S.ph, br = sin(t * 2 + S.off), step = abs(sin(ph));
      root.position.set(0, step * 0.035 * amp, A * 0.25);
      body.rotation.set(0.06 * amp, 0, sin(ph) * 0.07 * amp); body.scale.set(1 + (1 - step) * 0.04 * amp, 1 - (1 - step) * 0.05 * amp + br * 0.008, 1 + (1 - step) * 0.04 * amp);
      legs[0].rotation.x = sin(ph) * 0.35 * amp; legs[1].rotation.x = -sin(ph) * 0.35 * amp; legs[2].rotation.x = cos(ph) * 0.12 * amp;
      const pulse = 0.5 + 0.5 * sin(t * 3.4 + S.off);
      led.scale.set(1 + pulse * 0.09 + A * 0.2, 1 + pulse * 0.09 + A * 0.2, 1);
      const pop = kf(u, [[0, 0], [0.35, -0.25], [0.5, 0.2], [1, 0]]);
      ringG.position.y = 0.92 + 0.012 * br; ringG.rotation.set(pop * 0.5 + 0.03 * sin(t * 1.1), sin(t * 0.7 + S.off) * 0.18, sin(t * 0.9) * 0.03);
      const fl = u >= 0 ? clamp(1 - abs(u - 0.5) * 5, 0, 1) : 0; flash.visible = fl > 0.02; flash.scale.set(0.46 * fl + 0.001, 0.05, 0.46 * fl + 0.001);
      setBlink(face, clamp(F.bl + 0.25 * (1 - A), 0, 1) * (1 - fl)); setMouth(face, 0.1 + A * 0.7, 0.3);
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.05, 1 + A * 0.04); c.fx(t);
    },
  };
  return c.done(self, 1.45, 0.62);
}

// ---------------------------------------------------------------- 8. Airbrush Wraith (spitter): a drifting sheet ghost with a fading hem, airbrush gun and a waving glove
function wraith(o) {
  const c = core('eraser_wraith', 8, o, 0.8, 0.9), { P, root, S, L } = c, WHT = 0xfff1fb, WHT2 = 0xf1e2fb, SIL = 0xdfe3ee;
  const fl = new THREE.Group(); fl.position.y = 0.36; root.add(fl);
  const shape = lathe('c3ghost', [[0, 0.02], [0.3, 0.02], [0.42, 0.08], [0.46, 0.2], [0.46, 0.4], [0.44, 0.56], [0.42, 0.68], [0.36, 0.82], [0.24, 0.93], [0, 0.98]], 16);
  P(fl, shape, WHT, 0, 0, 0, 1, 1, 1, { ol: 0.019 });
  const face = addFace(c.ctx, fl, { cy: 0.67, rx: 0.43, ry: 0.31, rz: 0.43, hs: 1.1 }, { ex: 0.125, ey: -0.01, ew: 0.075, eh: 0.1, mw: 0.045, my: -0.15, iris: 0x8a7ad8, blushColor: 0xffa6c8 });
  flat(shape, gl(1, 0.92, 1, { add: true, op: 0.42 }), fl, 0, 0, 0, 0.985, 0.985, 0.985); // soft inner light: the ghost glows instead of greying in shade
  const teeth = [];
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, g = new THREE.Group(); g.position.set(cos(a) * 0.37, 0.08, sin(a) * 0.37); fl.add(g); P(g, cone(0.14, 0.34, 4), WHT2, 0, -0.13, 0, 1, 1, 1, { rx: PI, ol: false, mo: { transparent: true, opacity: 0.6 } }); teeth.push(g); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; P(fl, ico(1), WHT2, cos(a) * 0.2, -0.05, sin(a) * 0.2, 0.13, 0.1, 0.13, { ol: false, mo: { transparent: true, opacity: 0.6 } }); }
  // airbrush arm (left): sleeve, glove, gun
  c.limb(fl, [-0.36, 0.5, 0.05], [-0.56, 0.5, 0.3], 0.07, WHT); P(fl, ico(1), WHT, -0.58, 0.5, 0.32, 0.085, 0.08, 0.085, { ol: 0.012 });
  const gun = new THREE.Group(); gun.position.set(-0.62, 0.52, 0.34); gun.quaternion.copy(aim(-0.8, 0.12, 0.6)); fl.add(gun);
  const gIn = new THREE.Group(); gun.add(gIn);
  gun.scale.setScalar(1.3); P(gIn, cyl(0.066, 0.072, 0.34, 8), SIL, 0, 0.1, 0, 1, 1, 1, { ol: 0.013 }); P(gIn, cyl(0.078, 0.078, 0.05, 8), 0xff4a5a, 0, 0.0, 0, 1, 1, 1, { ol: 0.01 });
  P(gIn, cone(0.05, 0.16, 8), 0x9ea8c0, 0, 0.35, 0, 1, 1, 1, { ol: 0.011 }); P(gIn, cyl(0.04, 0.05, 0.09, 6), 0xff7a8a, 0.06, 0.12, -0.06, 1, 1, 1, { ol: 0.01 });
  // waving glove (right)
  const sh = new THREE.Group(); sh.position.set(0.38, 0.5, 0.04); fl.add(sh); P(sh, hang(0.065, 0.055, 0.24, 6), WHT, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
  const el = new THREE.Group(); el.position.y = -0.24; sh.add(el); const hand = glove(c, el, 0xffffff, 1.15); hand.position.y = 0;
  c.crown(fl, 0, 1.06, 0, 0.95); c.glints(fl, 4, 0.55, 0.5, 0.05);
  const gb = new THREE.Group(); gun.add(gb); show(gb, false); const gm = gl(1.1, 0.55, 1.5), glob = flat(ico(1), gm, gb, 0, 0, 0, 1, 1, 1), hl = flat(ico(0), basic(0xffffff), gb, 0, 0, 0, 1, 1, 1), d1 = flat(ico(0), gm, gb, 0, 0, 0, 1, 1, 1), d2 = flat(ico(0), gm, gb, 0, 0, 0, 1, 1, 1);
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, sg = sin(t * 2 + S.off), ho = F.h;
      const lean = kf(u, [[0, 0], [0.45, 1], [0.6, -0.5], [0.85, 0], [1, 0]]);
      fl.position.set(sin(t * 52) * 0.04 * ho, 0.36 + sg * 0.07 + amp * 0.03, 0); fl.rotation.set(0.14 * amp - lean * 0.3, sin(t * 0.8 + S.off) * 0.08, sin(t * 1.5 + S.off) * 0.07 + sin(t * 0.6) * 0.04);
      for (let i = 0; i < 9; i++) teeth[i].rotation.set(sin(t * 3.2 + i * 0.8) * 0.2 - amp * 0.4, 0, cos(t * 2.7 + i * 1.1) * 0.2);
      sh.rotation.set(0, 0, 2.2 + sin(t * 1.3) * 0.1 - A * 0.3); el.rotation.z = sin(t * 5.5 + S.off) * 0.4 + 0.3; hand.rotation.z = sin(t * 11) * 0.2;
      gIn.position.y = -0.1 * kf(u, [[0, 0], [0.58, 0], [0.64, 1], [0.9, 0]]) + 0.05 * lean; gun.rotation.z = 0;
      const fly = u < 0.58 ? 0 : clamp((u - 0.58) / 0.42, 0, 1), on = u >= 0 && fly < 1; show(gb, on);
      if (on) { const g = u < 0.55 ? ease(u / 0.55) : 1, s = 0.11 * g * (1 - 0.7 * fly * fly), k = Math.max(0.001, s);
        gb.position.set(0, 0.52 + fly * 2.2, 0); glob.scale.setScalar(k); hl.scale.set(k * 0.4, k * 0.25, k * 0.2); hl.position.set(-k * 0.35, k * 0.4, k * 0.8);
        d1.scale.setScalar(Math.max(0.001, k * 0.5 * fly)); d2.scale.setScalar(Math.max(0.001, k * 0.35 * fly)); d1.position.y = -k * 6 * fly; d2.position.y = -k * 11 * fly; }
      setBlink(face, F.bl); setMouth(face, 0.1 + lean * 0.8, 0.3);
      lifeXform(L, root, 1, 1, 1, 1, 1); c.fx(t);
    },
  };
  return c.done(self, 1.35, 0.6);
}

// ---------------------------------------------------------------- 9. Flawless (boss): the perfect idol, ring of pearls, golden floor ring, a swooping ponytail
function editor(o) {
  const c = core('boss_editor', 9, o, 1.1, 1.2), { P, root, S, L } = c, WH = 0xf7f4fd, WH2 = 0xe4e0f4, LAV = 0xb9a8f0, LAV2 = 0x9d8ae2, PINK = 0xffd3e8, PETAL = 0xc9b6f6;
  const fig = new THREE.Group(); fig.scale.setScalar(1.95); root.add(fig);
  const legs = [-1, 1].map((sd) => { const g = new THREE.Group(); g.position.set(sd * 0.1, 0.86, 0); fig.add(g);
    P(g, hang(0.062, 0.054, 0.76, 8), WH, 0, 0, 0, 1, 1, 1, { ol: 0.012 }); P(g, hang(0.08, 0.075, 0.07, 8), LAV, 0, -0.06, 0, 1, 1, 1, { ol: 0.01 }); P(g, ico(1), WH, 0, -0.8, 0.05, 0.085, 0.06, 0.13, { ol: 0.012 }); return g; });
  const body = new THREE.Group(); body.position.y = 0.86; fig.add(body);
  const tut = [];
  P(body, cyl(0.16, 0.3, 0.18, 14), PETAL, 0, 0.03, 0, 1, 1, 1, { ol: 0.012 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, g = new THREE.Group(); g.position.set(cos(a) * 0.27, 0.0, sin(a) * 0.27); g.rotation.set(0, -a, 0); body.add(g); P(g, ico(1), i % 2 ? LAV2 : PETAL, 0.04, -0.01, 0, 0.1, 0.045, 0.085, { ol: false }); tut.push(g); }
  P(body, torus(0.17, 0.028, 5, 16), 0x8d7ae0, 0, 0.12, 0, 1, 1, 1, { rx: PI / 2, ol: 0.01 });
  P(body, ico(2), PINK, 0, 0.3, 0, 0.17, 0.2, 0.125, { ol: 0.014 });
  for (const [x, y] of [[-0.09, 0.2], [0.08, 0.19], [-0.02, 0.12], [0.11, 0.32], [-0.11, 0.33], [0.0, 0.43], [-0.07, 0.41], [0.07, 0.43]]) flat(ico(0), basic(0xff8fbd), body, x, y, ez(0.17, 0.2, 0.125, x, y - 0.3) + 0.002, 0.018, 0.018, 0.008);
  flat(starGeo(), basic(0xff3a5a), body, 0, 0.34, ez(0.17, 0.2, 0.125, 0, 0.04) + 0.004, 0.045, 0.045, 0.05);
  const head = new THREE.Group(); head.position.y = 0.66; head.scale.setScalar(0.9); body.add(head);
  P(head, ico(3), WH, 0, 0, 0, 0.3, 0.285, 0.27, { ol: 0.015 });
  const face = addFace(c.ctx, head, { cy: 0, rx: 0.3, ry: 0.285, rz: 0.27, hs: 1.02 }, { ex: 0.12, ey: -0.02, ew: 0.06, eh: 0.085, mw: 0.05, my: -0.13, iris: 0x9a8ad8, blushColor: 0xffa6c8 });
  P(head, cap(12, 6, 1.55), LAV, 0, 0.02, -0.03, 0.32, 0.3, 0.29, { rx: -0.4, ol: 0.014 }); P(head, ico(2), LAV, 0, -0.05, -0.14, 0.31, 0.29, 0.14, { ol: 0.012 });
  for (const sd of [-1, 1]) { P(head, ico(1), LAV, sd * 0.29, -0.1, 0.0, 0.085, 0.22, 0.1); P(head, ico(1), LAV2, sd * 0.3, -0.3, 0.02, 0.07, 0.09, 0.07, { ol: 0.009 }); }
  for (let i = 0; i < 4; i++) { const x = -0.14 + i * 0.093; P(head, cone(0.06, 0.12, 4), LAV, x, 0.2, 0.15 - Math.abs(x) * 0.25, 1, 1, 0.8, { rx: PI, ol: 0.01 }); }
  P(head, cyl(0.04, 0.05, 0.05, 6), 0xff7eb6, 0.2, 0.22, -0.1, 1, 1, 1, { ol: 0.008, rx: 0.6, rz: -0.6 }); // hair tie
  const tail = [];
  { let par = head, x = 0.2, y = 0.2, z = -0.1; const cols = [LAV, 0xaab0f2, 0x9fb4f4, 0x8fb4f6], rad = [0.13, 0.115, 0.092, 0.065], len = [0.26, 0.26, 0.24, 0.22];
    for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.z = i === 0 ? -0.8 : -0.42; par.add(g); P(g, ico(1), cols[i], 0, len[i] * 0.5, 0, rad[i], len[i] * 0.62, rad[i], { ol: 0.012 }); tail.push(g); par = g; x = 0; y = len[i] * 0.72; z = 0; } }
  // mic + arms (hands gather at the chest to hold it)
  const mic = new THREE.Group(); body.add(mic); P(mic, cyl(0.03, 0.036, 0.16, 6), 0x7e809a, 0, 0.26, 0.2, 1, 1, 1, { rx: -0.3, ol: 0.01, mo: M }); P(mic, ico(1), 0x5a5a76, 0, 0.36, 0.19, 0.06, 0.06, 0.06, { ol: 0.01 });
  const arms = [-1, 1].map((sd) => { const sh = new THREE.Group(); sh.position.set(sd * 0.19, 0.44, 0); body.add(sh); P(sh, hang(0.045, 0.04, 0.26, 7), WH, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
    const el = new THREE.Group(); el.position.y = -0.26; sh.add(el); P(el, hang(0.04, 0.034, 0.24, 7), WH, 0, 0, 0, 1, 1, 1, { ol: 0.012 }); const hand = glove(c, el, WH, 1.2); hand.position.y = -0.24; return { sh, el, sd, hand }; });
  c.crown(head, 0, 0.3, 0, 0.9); c.glints(fig, 6, 0.8, 0.8, 0.05);
  // ring of pearls (behind), floor ring of gold dashes, pink aura (flat additive discs), orbiting sparkles
  const halo = new THREE.Group(); halo.position.set(0, 1.75, -0.4); root.add(halo);
  flat(torus(1.35, 0.022, 4, 44), gl(1.9, 1.75, 1.5), halo, 0, 0, 0, 1, 1, 1);
  const pearls = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; { const pv = new THREE.Group(); pv.position.set(cos(a) * 1.35, sin(a) * 1.35, 0); halo.add(pv); part(c.ctx, pv, ico(1), 0, 0, 0, 0, 0.12, 0.12, 0.12, { mat: gl(1.9, 1.75, 1.5) }); pearls.push(pv); } }
  const fring = new THREE.Group(); fring.position.y = 0.03; root.add(fring);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; flat(box(1, 1, 1), gl(1.7, 1.35, 0.5), fring, cos(a) * 1.5, 0, sin(a) * 1.5, 0.22, 0.02, 0.05, { ry: -(a + PI / 2) }); }
  const aura = new THREE.Group(); aura.position.y = 0.012; root.add(aura);
  for (const [r, y] of [[1.45, 0], [1.1, 0.004], [0.75, 0.008]]) flat(cyl(1, 1, 1, 32), gl(1.0, 0.12, 0.42, { add: true, op: 0.2 }), aura, 0, y, 0, r, 0.004, r);
  const sparks = [0, 1, 2, 3, 4].map((i) => { const g = new THREE.Group(); root.add(g); flat(oct(), gl(2.2, 2, 1.4), g, 0, 0, 0, 0.07, 0.2, 0.04); flat(oct(), gl(2.2, 2, 1.4), g, 0, 0, 0, 0.2, 0.07, 0.04); return g; });
  const self = {
    group: c.group,
    update(dt, t, st) {
      if (L.dead) return; const F = frame(c, dt, st), amp = F.amp, A = F.A, u = F.u, ho = F.h; S.ph += F.dt * F.sp * 5; const ph = S.ph, br = sin(t * 1.6 + S.off);
      const sing = kf(u, [[0, 0], [0.3, -0.6], [0.45, 1], [0.8, 1], [1, 0]]); // inhale (lean back, arms rise), then the big note
      root.position.set(sin(t * 50) * 0.05 * ho, 0.1 + br * 0.06 + amp * 0.03, A * 0.3);
      fig.rotation.set(0.05 * amp - sing * 0.12, sin(t * 0.7) * 0.08, sin(t * 1.1 + 1) * 0.03);
      legs[0].rotation.x = sin(ph) * 0.35 * amp + 0.06 * br; legs[1].rotation.x = -sin(ph) * 0.35 * amp - 0.06 * br;
      body.rotation.set(0.04 * amp, sin(ph) * 0.1 * amp, 0); head.rotation.set(-0.06 * sing + sin(t * 1.3) * 0.03, sin(t * 0.9) * 0.1, sin(t * 1.4) * 0.04);
      for (let i = 0; i < tut.length; i++) tut[i].rotation.z = sin(t * 2.4 + i * 0.7) * 0.12 + amp * 0.18;
      for (let i = 0; i < tail.length; i++) tail[i].rotation.z = (i === 0 ? -0.8 : -0.42) + sin(t * 2.2 - i * 0.7) * 0.11 + sing * 0.1;
      const kk = clamp(sing, 0, 1), dn = clamp(-sing, 0, 1); mic.position.y = kk * 0.12; mic.rotation.x = -kk * 0.3;
      for (const a of arms) { a.hand.rotation.z = sin(t * 12 + a.sd) * 0.25 * kk; a.sh.rotation.set(lerp(-0.8, -0.15, kk) - dn * 0.4, 0, lerp(-a.sd * 0.45, a.sd * 2.5, kk)); a.el.rotation.set(lerp(-1.3, 0, kk), 0, lerp(-a.sd * 0.2, a.sd * 0.35, kk)); }
      halo.rotation.z = t * (0.35 + sing * 1.4); halo.scale.setScalar(1 + sing * 0.12 + A * 0.04);
      for (let i = 0; i < 12; i++) pearls[i].scale.setScalar(1 + 0.12 * sin(t * 4 + i * 1.3) + sing * 0.25);
      fring.rotation.y = -t * (0.25 + sing * 0.8); aura.scale.setScalar(1 + 0.06 * br + sing * 0.35);
      for (let i = 0; i < 5; i++) { const a = t * (0.6 + i * 0.09) + i * 1.26, r = 0.95 + 0.25 * sin(t + i); sparks[i].position.set(cos(a) * r, 1.0 + i * 0.5 + sin(t * 1.8 + i) * 0.15, sin(a) * r * 0.5 + 0.2); sparks[i].scale.setScalar(Math.max(0.05, 0.6 + 0.5 * sin(t * 5 + i * 2))); sparks[i].rotation.z = t + i; }
      setBlink(face, F.bl); setMouth(face, 0.18 + 0.12 * sin(t * 3) + sing * 0.95, 0.1);
      lifeXform(L, root, 1, 1, 1, 1, 1); c.fx(t);
    },
  };
  return c.done(self, 3.5, 1.6);
}

export const FOES_C = { storm_drone: wrap(drone), blank_soldier: wrap(dancer), komainu_guardian: wrap(bouncer), void_scribe: wrap(siren), redaction_knight: wrap(knight), margin_imp: wrap(imp), thunder_crow: wrap(sentinel), eraser_wraith: wrap(wraith), boss_editor: wrap(editor) };
