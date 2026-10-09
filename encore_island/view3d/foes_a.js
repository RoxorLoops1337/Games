// Encore Island 3D, act 1 foes ("Blossom Bay", the music-gag act) + boss Kraki. Design source: the 2D sprites (FOE_ART[0], BOSS_ART[0]).
//   FOES_A = { kappa, oni_cub, bamboo_boar, crow_tengu, mushroom_folk, hitodama, oni_brute, karakasa, boss_kuzunoha }, each build({ elite, gold }) -> actor
//   actor = { group, update(dt, t, st), height, radius, attack(), die(), isDead(), dispose() }   (contract: README.md; the engine bakes the rig)
// Rigs use the characters.js helper bundle (CK): inked hulls, per-actor materials (hurt flash), makeLife (attack pulse, death). Models are built at
// ~2 units tall for a nominal radius of 0.55 (boss ~3.6 / 1.6); the engine rescales the group. Headless safe: nothing here touches the DOM at import.
import * as THREE from 'three';
import { CK } from '../../encore_island_3d/js/characters.js';
import { roundedBoxGeo, LOOK } from './kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const { clamp, damp, lerp } = CK, PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos;
const sat = (x) => clamp(x, 0, 1), sstep = (a, b, x) => { const u = sat((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const tri = (u) => 1 - Math.abs(((u % 1) + 1) % 1 * 2 - 1); // 0..1..0 triangle wave
// geometry (cached in CK.geo, so every build shares it; independent of STYLE.boost so the triangle budget is stable)
const ic = (d) => CK.geo('fa_ico' + d, () => new THREE.IcosahedronGeometry(1, d));
const bx = CK.box(1, 1, 1);
const disc = (n) => CK.geo('fa_disc' + n, () => new THREE.CircleGeometry(1, n)), half = CK.geo('fa_half', () => new THREE.CircleGeometry(1, 14, 0, PI)); // flat face bits (cheap)
const hang = CK.hang, cone = CK.cone;
const tor = (t, a = 5, b = 10, arc = TAU) => CK.geo(`fa_tor${t},${a},${b},${arc}`, () => new THREE.TorusGeometry(1, t, a, b, arc));
const cylg = (rt, n = 8) => CK.geo(`fa_cyl${rt},${n}`, () => new THREE.CylinderGeometry(rt, 1, 1, n, 1)); // unit height, radius 1 at the bottom
const rb = (w, h, d, r, s = 2) => CK.geo(`fa_rb${w},${h},${d},${r},${s}`, () => { // rounded box (r = corner radius as a fraction of the smallest side) with welded smooth normals
  let g = roundedBoxGeo(w, h, d, Math.min(w, h, d) * Math.min(r, 0.5), s); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g; });
const grp = (par, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (par) par.add(g); return g; };
const _hdr = new Map(), hdr = (r, g, b) => { const k = r + ',' + g + ',' + b; let c = _hdr.get(k); if (!c) _hdr.set(k, c = new THREE.Color(r, g, b)); return c; }; // cached HDR colours (glints)
const F = (par, g, col, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, o = {}) => CK.flat(g, CK.basic(col), par, x, y, z, sx, sy, sz, o); // unlit bits (faces, glows)
const GLOSS = { metalness: 0.14, roughness: 0.34, flatShading: false }, MATT = { flatShading: false };
const _gc = new THREE.Color();
const goldify = (c) => { _gc.set(c); const l = _gc.r * 0.3 + _gc.g * 0.59 + _gc.b * 0.11, k = 0.5 + l * 0.9; return _gc.setRGB(Math.min(1, k), Math.min(1, k * 0.6), Math.min(1, k * 0.07)).getHex(); };
function mkB(ctx, gold) { // lit part with an inked hull; gold swaps every colour for a metallic gold ramp, o.sh = glossy
  return (par, g, c, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, o = {}) =>
    CK.part(ctx, par, g, gold && !o.nk ? goldify(c) : c, x, y, z, sx, sy, sz, Object.assign({ ol: 0.026 }, o, { mo: Object.assign({}, gold || o.sh ? GLOSS : MATT, o.mo) }));
}
// hiding: node.visible plus a ~0 scale, because a baked rig only collapses `visible = false` bones while its bone array stays in sync
const HID = 1e-4, vis = (n, on, s = 1) => { n.visible = on; n.scale.setScalar(on ? s : HID); };
const note = (par, col, s = 1) => { const g = grp(par); F(g, ic(0), col, 0, 0, 0, 0.1 * s, 0.075 * s, 0.05 * s); F(g, bx, col, 0.085 * s, 0.17 * s, 0, 0.026 * s, 0.34 * s, 0.03 * s); F(g, bx, col, 0.14 * s, 0.31 * s, 0, 0.1 * s, 0.05 * s, 0.03 * s, { rz: -0.5 }); g.visible = false; return g; };
function flyNote(n, u, x, y, z, dx, dy, s = 1) { // u 0..1 along a rising wobbly path, hidden outside
  const on = u > 0 && u < 1; n.visible = on; if (!on) { n.scale.setScalar(HID); return; } n.position.set(x + dx * u + sin(u * 9) * 0.05, y + dy * u, z); n.scale.setScalar(s * Math.sqrt(sin(u * PI)) * 1.1); n.rotation.z = sin(u * 7) * 0.3;
}

// ---------------------------------------------------------------- face kit: eyes with sclera + iris + pupil + glint, lids, brows, mouths
// d = head ellipsoid { cy, rx, ry, rz }; features sit on its surface and face along the surface normal
function surf(d, x, y, sink = 0) {
  const z = d.rz * Math.sqrt(Math.max(0.03, 1 - (x / d.rx) ** 2 - ((y - d.cy) / d.ry) ** 2)) - sink, nx = x / (d.rx * d.rx), ny = (y - d.cy) / (d.ry * d.ry), nz = z / (d.rz * d.rz);
  return { z, ry: Math.atan2(nx, nz), rx: -Math.atan2(ny, Math.hypot(nx, nz)) };
}
function mkEyes(X, par, d, f) {
  const r = f.r ?? 0.13, h = f.h ?? 1.1, out = { eyes: [], pu: [], lids: [], r, h, droop: f.droop || 0 };
  for (const sd of [-1, 1]) {
    const x = sd * (f.ex ?? 0.2), y = d.cy + (f.ey ?? 0), s = surf(d, x, y, -r * (f.lift ?? 0.12));
    const g = grp(par, x, y, s.z); g.rotation.set(s.rx, s.ry, sd * (f.tilt || 0), 'YXZ');
    F(g, disc(16), f.sclera ?? 0xffffff, 0, 0, 0, r, r * h, 1);
    const pu = grp(g, 0, 0, r * 0.02);
    F(pu, disc(12), f.iris ?? 0x7a5cd8, 0, 0, r * 0.03, r * 0.68, r * 0.68 * h, 1);
    F(pu, disc(10), 0x2b1426, 0, 0, r * 0.06, r * 0.38, r * 0.38 * h, 1);
    F(pu, disc(8), 0xffffff, r * 0.24, r * 0.26 * h, r * 0.09, r * 0.17, r * 0.17, 1);
    out.eyes.push(g); out.pu.push(pu);
    if (f.ring) F(g, tor(0.2, 4, 12), f.ring, 0, 0, r * 0.05, r * 1.25, r * h * 1.25, r * 0.7);
    if (f.lid) out.lids.push(X.B(g, half, f.lid, 0, 0, r * 0.14, r * 1.12, r * h * 1.15, 1, { ol: false }));
    if (f.brow) { const b = F(g, bx, f.brow, -sd * r * 0.1, r * h * 1.3, r * 0.2, r * 1.5, r * 0.3, r * 0.1, { rz: sd * (f.browTilt ?? 0.3) }); (out.brow = out.brow || []).push(b); }
  }
  return out;
}
function eyesSet(E, bl = 0, lx = 0, ly = 0, droop) { // blink / droop and gaze (lx, ly in -1..1)
  const cl = Math.max(droop ?? E.droop, bl), r = E.r, h = E.h;
  for (let i = 0; i < 2; i++) {
    if (E.lids.length) { E.lids[i].position.y = r * h * (1 - 2 * cl); E.lids[i].scale.set(r * 1.1, Math.max(0.01, r * h * 2 * cl), 1); } else E.eyes[i].scale.y = Math.max(0.08, 1 - 0.92 * cl);
    E.pu[i].position.set(lx * r * 0.28, ly * r * 0.28 * h, r * 0.3);
  }
}
function mkMouth(X, par, d, x, y, kind, w, col = 0x5a1426) { // returns { g, fill, kind, w }; open amount via mouthSet
  const s = surf(d, x, d.cy + y, -w * 0.12), g = grp(par, x, d.cy + y, s.z); g.rotation.set(s.rx, s.ry, 0, 'YXZ');
  const M = { g, kind, w, fill: null, tongue: null };
  if (kind === 'smile') { F(g, tor(0.12, 3, 8, PI), col, 0, w * 0.35, 0, w, w * 0.62, w * 0.3, { rz: PI }); M.fill = F(g, disc(10), col, 0, 0, 0, w * 0.9, w * 0.1, 1); }
  else if (kind === 'line') M.fill = F(g, disc(10), col, 0, 0, 0, w, w * 0.12, 1);
  else { M.fill = F(g, disc(12), col, 0, 0, 0, w, w * 0.6, 1); M.tongue = F(g, disc(8), 0xff7f95, 0, -w * 0.25, w * 0.02, w * 0.55, w * 0.25, 1); }
  return M;
}
function mouthSet(M, v) { // v 0..1
  const w = M.w;
  if (M.kind === 'smile') M.fill.scale.y = Math.max(w * 0.08, v * w * 0.8); else if (M.kind === 'line') M.fill.scale.set(w * (1 - v * 0.3), w * (0.12 + v * 0.9), 1);
  else { M.fill.scale.set(w * (1 - v * 0.15), w * (0.3 + v * 0.7), 1); if (M.tongue) { M.tongue.position.y = -w * (0.1 + v * 0.3); M.tongue.visible = v > 0.12; M.tongue.scale.set(w * 0.55, w * 0.25, v > 0.12 ? 1 : HID); } }
}
const limb = (X, par, x, y, z, len, r, col, hand = col, hr = r * 1.3) => { // shoulder pivot with a hanging tube and a ball hand; returns the pivot
  const g = grp(par, x, y, z); g.rotation.order = 'YXZ';
  X.B(g, hang(r, r * 0.88, len, 8), col, 0, 0, 0, 1, 1, 1, { ol: 0.018 }); X.B(g, ic(1), col, 0, 0, 0, r * 1.06, r * 1.06, r * 1.06, { ol: false });
  g.userData.hand = X.B(g, ic(1), hand, 0, -len - hr * 0.2, 0, hr, hr, hr, { ol: 0.018 }); return g;
};
const foot = (X, par, x, y, z, col, w = 0.16, h = 0.09, l = 0.25) => X.B(par, ic(1), col, x, y, z, w, h, l, { ol: 0.02 });

// ---------------------------------------------------------------- shared actor factory
// cfg: { name, H (model height), R (nominal radius), seed, stride (steps per second at full speed), crown: [x, y, z, scale], puff (death colour), atk, die }
// setup(X) builds the rig into X.root and returns tick(c); c = per-frame context (see below).
function foe(o, cfg, setup) {
  o = o || {}; const gold = !!o.gold, elite = !!o.elite, ctx = CK.makeCtx(), { group, fitG, root } = CK.creatureBase(ctx, cfg.name), pre = grp(group);
  pre.add(fitG); group.name = cfg.name;
  const B = mkB(ctx, gold), X = { ctx, root, B, gold, elite, pre, fitG, cfg };
  const tick = setup(X), L = CK.makeLife(ctx, cfg.atk || 0.55, cfg.die || 0.8), S = CK.newState(cfg.seed || 1);
  // overlays: elite crown + glint, gold sparkles, death puffs (all part of the rig; shown with node.visible so baking keeps working)
  let crown = null, glint = null, sparks = null;
  if (elite) {
    const [cx, cy, cz, cs] = cfg.crown || [0, cfg.H, 0, 1]; crown = grp(pre, cx, cy, cz); crown.scale.setScalar(cs);
    CK.part(ctx, crown, tor(0.14, 5, 12), 0xffd84d, 0, 0.1, 0, 0.3, 0.3, 0.16, { rx: PI / 2, ol: 0.016, mo: GLOSS });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; CK.part(ctx, crown, cone(0.075, 0.22, 5), 0xffd84d, sin(a) * 0.3, 0.26, cos(a) * 0.3 * 0.55, 1, 1, 1, { ol: 0.014, mo: GLOSS }); F(crown, ic(0), i % 2 ? 0xff7eb6 : 0x8fe3f0, sin(a) * 0.3, 0.4, cos(a) * 0.3 * 0.55, 0.045); }
    glint = F(crown, CK.geo('fa_oct', () => new THREE.OctahedronGeometry(1, 0)), hdr(2.2, 1.9, 0.9), 0.32, 0.46, 0.08, 0.09, 0.2, 0.02);
  }
  if (gold) { sparks = grp(pre); for (let i = 0; i < 3; i++) { const m = F(sparks, CK.geo('fa_oct', () => new THREE.OctahedronGeometry(1, 0)), hdr(2.2, 1.7, 0.6), 0, 0, 0, 0.06, 0.15, 0.02); m.userData.k = i; } }
  const puffs = []; for (let i = 0; i < 6; i++) { const m = F(grp(pre), ic(0), cfg.puff ?? 0xfff4e6, 0, 0, 0, 0.2); m.parent.visible = false; puffs.push(m.parent); puffs[i].userData.m = m; }
  const c = { ctx, L, S, t: 0, dt: 0, sp: 0, amp: 0, ph: 0, s: 0, cs: 1, A: 0, hold: 0, spit: -1, bl: 0, beat: 0, sy: 1, sxz: 1, st: null, die: 0 };
  let pa = false, spitT = -1, eS = 1;
  const self = {
    group, radius: cfg.R, height: cfg.H * (elite ? 1.14 : 1) + (elite ? 0.25 : 0), ctx,
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {}; c.st = st; c.dt = dt; c.t = t;
      L.tick(dt, st);
      if (st.atk && !pa) { L.attack(); spitT = 0; } pa = !!st.atk;
      if (spitT >= 0) { spitT += dt / 0.6; if (spitT >= 1) spitT = -1; } c.spit = spitT;
      c.hold = damp(c.hold, st.atk ? 1 : 0, 12, dt); c.A = Math.max(L.atkEnv, c.hold * 0.6);
      c.sp = damp(c.sp, clamp(st.speed || 0, 0, 1), 10, dt); c.amp = Math.min(1, c.sp * 2.4); c.ph += dt * c.sp * (cfg.stride || 12) * (st.slow ? 0.6 : 1);
      c.s = sin(c.ph); c.cs = cos(c.ph); c.beat = LOOK.beat.value; c.sy = 1; c.sxz = 1; root.position.set(0, 0, 0);
      S.blinkIn -= dt; if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
      c.bl = 0; if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else c.bl = 1 - Math.abs(u * 2 - 1); }
      tick(c);
      if (st.die > 0) { if (L.dieT < 0) L.dieT = 0; L.dieU = Math.max(L.dieU, sat(st.die)); if (L.dieU >= 1) L.dead = true; }
      c.die = L.dieT >= 0 ? L.dieU : 0;
      CK.lifeXform(L, root, 1, 1, 1, c.sy, c.sxz);
      const ev = elite || st.elite; eS = damp(eS, ev ? 1.14 : 1, 8, dt); pre.scale.setScalar(eS);
      if (crown) { vis(crown, ev, cfg.crown ? cfg.crown[3] : 1); crown.position.y = (cfg.crown ? cfg.crown[1] : cfg.H) + sin(t * 3) * 0.02; crown.rotation.y = sin(t * 1.4) * 0.3; if (glint) glint.scale.set(0.09 * (0.3 + tri(t * 0.8)), 0.2 * (0.3 + tri(t * 0.8)), 0.02); }
      if (sparks) for (const m of sparks.children) { const k = m.userData.k, a = t * 1.3 + k * 2.1, tw = tri(t * 0.9 + k * 0.33); m.position.set(sin(a) * cfg.R * 1.15, cfg.H * (0.3 + 0.28 * k) + sin(t * 2 + k) * 0.1, cos(a) * cfg.R * 1.0); m.scale.set(0.06 * tw, 0.16 * tw, 0.02); m.rotation.y = -a; }
      for (let i = 0; i < 6; i++) { const p = puffs[i], a = i / 6 * TAU + 0.4, u = c.die, r = Math.sqrt(u) * cfg.R * 1.8; vis(p, u > 0 && u < 0.98); if (!p.visible) continue; p.position.set(sin(a) * r, cfg.H * 0.45 + u * 0.5, cos(a) * r); p.userData.m.scale.setScalar(Math.max(0.001, sin(u * PI) * 0.2 * (1 + (i % 2) * 0.5))); }
    },
    attack() { L.attack(); }, die() { L.die(); }, isDead() { return L.dead; }, get dead() { return L.dead; },
    dispose() { for (const m of ctx.list) m.dispose(); },
  };
  return self;
}

// ---------------------------------------------------------------- 1. kappa = Fussy Foghorn (melee): orange sailor-capped tooter, mint shorts, brass horn
function kappa(X) {
  const { root, B } = X, OR = 0xffa63a, CRM = 0xfff1dc, MINT = 0x8fe3b8, MINT2 = 0x66c99a, NAVY = 0x2f3b7e, BRASS = 0xf6b82e, YEL = 0xf2c14a;
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.2, 0.62, 0); B(g, hang(0.09, 0.08, 0.4, 8), MINT2, 0, 0, 0, 1, 1, 1, { ol: 0.02 }); foot(X, g, 0, -0.43, 0.07, NAVY); return g; });
  const body = grp(root, 0, 0.6, 0);
  B(body, ic(2), CRM, 0, 0.36, 0, 0.47, 0.5, 0.37); B(body, ic(1), MINT, 0, 0.12, 0.01, 0.485, 0.27, 0.385, { ol: 0.02 });
  B(body, tor(0.07, 4, 12), YEL, 0, 0.25, 0, 0.47, 0.37, 0.4, { rx: PI / 2, ol: 0.012 });
  B(body, ic(0), MINT2, -0.22, 0.12, 0.34, 0.1, 0.08, 0.04, { ol: false }); B(body, ic(0), MINT2, 0.18, 0.06, 0.36, 0.07, 0.06, 0.03, { ol: false });
  // head: big orange ball, sleepy lids, round shouting mouth, navy sailor cap with a pink pom
  const head = grp(body, 0, 0.98, 0), d = { cy: 0.0, rx: 0.64, ry: 0.58, rz: 0.56 };
  B(head, ic(2), OR, 0, 0, 0, d.rx, d.ry, d.rz, { ol: 0.03 });
  const E = mkEyes(X, head, d, { ex: 0.25, ey: 0.05, r: 0.15, h: 1.1, iris: 0x4fa8e8, lid: OR, droop: 0.42, tilt: 0.12 });
  const M = mkMouth(X, head, d, 0, -0.3, 'o', 0.15);
  B(head, ic(2), NAVY, 0, 0.33, -0.02, 0.5, 0.3, 0.46, { ol: 0.026 }); B(head, tor(0.16, 4, 12), NAVY, 0, 0.3, 0, 0.5, 0.46, 0.2, { rx: PI / 2, ol: 0.02 });
  B(head, ic(1), 0xff7eb6, 0, 0.64, -0.02, 0.1, 0.1, 0.1, { ol: false }); B(head, ic(0), 0xfff4e6, 0.2, 0.43, 0.3, 0.05, 0.03, 0.03, { ol: false });
  // worm arm (left): three soft segments that dangle
  const arm = grp(body, -0.4, 0.42, 0.02); arm.rotation.order = 'YXZ'; const seg = [arm];
  for (let i = 0; i < 3; i++) { const g = i ? grp(seg[i - 1], 0, -0.22, 0) : arm; if (i) seg.push(g); B(g, hang(0.075 - i * 0.008, 0.07 - i * 0.008, 0.22, 8), CRM, 0, 0, 0, 1, 1, 1, { ol: 0.016 }); B(g, ic(0), CRM, 0, -0.22, 0, 0.08 - i * 0.01, 0.08 - i * 0.01, 0.08 - i * 0.01, { ol: false }); }
  F(seg[2], ic(0), 0xffc9a8, 0, -0.3, 0, 0.001);
  // brass horn on the right side: coiled loop, flared bell and a mouthpiece pipe to the face
  const horn = grp(body, 0.55, 0.6, 0.0);
  B(horn, tor(0.2, 5, 12), BRASS, 0, 0, 0, 0.3, 0.3, 0.3, { sh: true, ol: 0.022 });
  const bell = grp(horn, 0.22, 0.28, 0); bell.rotation.z = -0.55;
  B(bell, CK.cyl(0.3, 0.08, 0.42, 10), BRASS, 0, 0.21, 0, 1, 1, 1, { sh: true, ol: 0.022 }); F(bell, ic(1), 0x7a4a14, 0, 0.41, 0, 0.27, 0.04, 0.27);
  const pipe = B(horn, cylg(1, 7), BRASS, -0.2, 0.2, 0.2, 0.07, 0.6, 0.07, { sh: true, ol: 0.016, rz: 1.1, rx: -0.5 });
  const nts = [note(root, 0x4f8cf0, 1.2), note(root, 0xff5fa0, 1.2)];
  return (c) => {
    const { t, amp, s, cs, A, st } = c, br = sin(t * 2.2 + 1), tc = (t * 0.42 + 0.25) % 1, toot = Math.max(A, tc < 0.22 ? sin(tc / 0.22 * PI) : 0, st.singing ? 0.5 + 0.5 * sin(t * 6) : 0);
    root.position.set(0, Math.abs(cs) * 0.08 * amp + br * 0.01, A * 0.45);
    legs[0].rotation.x = s * 0.7 * amp; legs[1].rotation.x = -s * 0.7 * amp;
    body.rotation.set(0.1 * amp + A * 0.3 - toot * 0.12, 0, s * 0.08 * amp); body.scale.set(1 + br * 0.012, 1 + br * 0.02, 1 + br * 0.012);
    head.rotation.set(-A * 0.2 + toot * 0.18, -s * 0.05 * amp, sin(t * 1.1) * 0.04); head.scale.set(1 + toot * 0.08, 1 + toot * 0.03, 1 + toot * 0.05);
    for (let i = 0; i < 3; i++) seg[i].rotation.set(s * 0.5 * amp * (1 + i * 0.3) + sin(t * 2.1 - i * 0.8) * 0.12 * (1 + i * 0.4), 0, -0.25 - i * 0.12 + sin(t * 1.7 - i) * 0.1 - A * 0.5);
    horn.rotation.set(A * 0.9 - toot * 0.1, A * -0.5, 0); bell.scale.set(1 + toot * 0.3, 1 + toot * 0.15, 1 + toot * 0.3);
    horn.scale.setScalar(1 + toot * 0.07);
    eyesSet(E, c.bl, -toot * 0.3, 0.1, 0.42 - toot * 0.2 + A * 0.2); mouthSet(M, 0.3 + toot * 0.7);
    flyNote(nts[0], (tc - 0.06) / 0.5, 0.82, 1.85 + root.position.y, 0.0, 0.4, 0.9, 1 + A * 0.4); flyNote(nts[1], (tc - 0.2) / 0.5, 0.7, 1.9 + root.position.y, 0.05, 0.1, 0.9, 0.9 + A * 0.4);
    c.sy = 1 + A * 0.06; c.sxz = 1 + A * 0.04;
  };
}

// ---------------------------------------------------------------- 2. oni_cub = Jitterbug (fast): nervous purple ant with antennae, bow tie, sheet music
function oni_cub(X) {
  const { root, B } = X, PUR = 0xa98af0, PUR2 = 0x8a6ce0, LIL = 0xe9ddff, SHOE = 0x7a63e0, YEL = 0xffd23a, PINK = 0xff5fa0;
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.13, 0.62, 0); B(g, hang(0.07, 0.06, 0.4, 8), PUR2, 0, 0, 0, 1, 1, 1, { ol: 0.018 }); foot(X, g, 0, -0.43, 0.06, SHOE, 0.13, 0.08, 0.22); return g; });
  const body = grp(root, 0, 0.62, 0);
  B(body, ic(2), PUR, 0, 0.3, 0, 0.42, 0.46, 0.34); B(body, ic(2), LIL, 0, 0.3, 0.12, 0.3, 0.34, 0.26, { ol: false });
  const head = grp(body, 0, 0.88, 0), d = { cy: 0.0, rx: 0.56, ry: 0.5, rz: 0.48 };
  B(head, ic(2), PUR, 0, 0, 0, d.rx, d.ry, d.rz, { ol: 0.028 });
  const E = mkEyes(X, head, d, { ex: 0.21, ey: 0.04, r: 0.17, h: 1.12, iris: 0xb59cff, brow: 0x5a3aa8, browTilt: -0.28, lift: 0.1 });
  const M = mkMouth(X, head, d, 0, -0.26, 'o', 0.07);
  const ants = [-1, 1].map((sd) => { const g = grp(head, sd * 0.22, 0.42, -0.05); g.rotation.order = 'YXZ'; B(g, hang(0.025, 0.03, 0.4, 6), PUR2, 0, 0.4, 0, 1, 1, 1, { ol: 0.014 }); B(g, ic(1), YEL, 0, 0.46, 0, 0.1, 0.1, 0.1, { ol: false }); return g; });
  // bow tie + sheet music held in both hands
  B(body, ic(1), PINK, -0.11, 0.45, 0.33, 0.13, 0.1, 0.06, { ol: false }); B(body, ic(1), PINK, 0.11, 0.45, 0.33, 0.13, 0.1, 0.06, { ol: false }); B(body, ic(0), 0xd8387a, 0, 0.45, 0.37, 0.055, 0.055, 0.045, { ol: false });
  const sheet = grp(body, 0, 0.27, 0.38); sheet.rotation.x = -0.15; B(sheet, rb(0.34, 0.44, 0.03, 0.4, 1), 0xfffaf0, 0, 0, 0, 1, 1, 1, { ol: 0.014 });
  for (let i = 0; i < 4; i++) F(sheet, bx, 0x4a3a6a, 0, 0.14 - i * 0.075, 0.02, 0.26, 0.012, 0.01);
  for (const [x, y] of [[-0.07, 0.14], [0.02, 0.1], [0.08, 0.03], [-0.04, -0.04]]) F(sheet, ic(0), 0x2b1426, x, y, 0.025, 0.04, 0.03, 0.02);
  const arms = [-1, 1].map((sd) => { const a = limb(X, body, sd * 0.36, 0.5, 0.04, 0.3, 0.05, PUR, LIL, 0.07); return a; });
  const drop = grp(head, 0.5, 0.1, 0.2); F(drop, ic(1), 0x9de0ff, 0, 0, 0, 0.07, 0.09, 0.07); F(drop, cone(0.06, 0.14, 6), 0x9de0ff, 0, 0.1, 0, 1);
  return (c) => {
    const { t, amp, s, cs, A, sp } = c, jit = sin(t * 47) * (0.012 + 0.02 * amp + 0.012 * A), jit2 = sin(t * 53 + 1) * (0.012 + 0.02 * amp);
    const hop = Math.abs(sin(c.ph * 0.5)) * 0.2 * amp;
    root.position.set(jit * 0.5, hop + sin(t * 3.1) * 0.01, A * 0.5);
    legs[0].rotation.set(s * 0.9 * amp, 0, 0.12 - sin(t * 8) * 0.04 * (1 - amp)); legs[1].rotation.set(-s * 0.9 * amp, 0, -0.12 + sin(t * 8 + 2) * 0.04 * (1 - amp));
    body.rotation.set(0.12 * amp + A * 0.45, jit2 * 2, jit * 2); head.rotation.set(-0.05 * amp - A * 0.2 + jit, jit2, sin(t * 1.9) * 0.05 + jit2 * 2);
    ants.forEach((a, i) => a.rotation.set(-0.15 - 0.35 * amp - A * 0.6 + sin(t * 31 + i) * 0.1 * (0.5 + amp), 0, (i ? -1 : 1) * (0.4 + sin(t * 17 + i * 2) * 0.12 * (0.4 + amp))));
    arms[0].rotation.set(-0.9 - A * 0.4 + jit * 3, 0, -0.35); arms[1].rotation.set(-0.9 - A * 0.4 - jit * 3, 0, 0.35);
    sheet.rotation.set(-0.15 + jit * 4, 0, jit * 3);
    eyesSet(E, c.bl, sin(t * 3.7) * 0.8, sin(t * 2.3) * 0.5); mouthSet(M, 0.1 + A * 0.7 + 0.12 * (0.5 + 0.5 * sin(t * 19)));
    const dd = (t * 0.7) % 1; drop.position.set(0.5, 0.15 - dd * dd * 0.35, 0.18); drop.scale.setScalar(Math.max(0.001, sstep(0, 0.1, dd) * (1 - sstep(0.85, 1, dd))));
    c.sy = 1 + A * 0.08 - hop * 0.2; c.sxz = 1 + A * 0.05;
  };
}

// ---------------------------------------------------------------- 3. bamboo_boar = Runaway Melon (tank): grumpy watermelon with a vine, a rosette ribbon and stubby legs
function bamboo_boar(X) {
  const { root, B } = X, G1 = 0x84d64e, G2 = 0x2c8a38, LEG = 0x3a8f3a, CRM = 0xfff4e6;
  const mg = CK.geo(X.gold ? 'fa_melon_g' : 'fa_melon', () => { // vertex-coloured striped sphere (7 dark stripes), colours survive baking
    const g = new THREE.SphereGeometry(1, 28, 12), p = g.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(X.gold ? 0xffe688 : 0x92e05a), b = new THREE.Color(X.gold ? 0xd9a41c : 0x2f8f3a), m = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const lon = Math.atan2(p.getX(i), p.getZ(i)), w = 0.5 + 0.5 * Math.cos(lon * 7 + p.getY(i) * 0.5), k = sstep(0.55, 1, w); m.copy(a).lerp(b, k * 0.95); col[i * 3] = m.r; col[i * 3 + 1] = m.g; col[i * 3 + 2] = m.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; });
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.3, 0.3, 0.06); B(g, hang(0.1, 0.09, 0.26, 8), LEG, 0, 0, 0, 1, 1, 1, { ol: 0.02 }); foot(X, g, 0, -0.27, 0.07, CRM, 0.15, 0.08, 0.21); return g; });
  const body = grp(root, 0, 0.82, 0), d = { cy: 0, rx: 0.7, ry: 0.62, rz: 0.66 };
  B(body, mg, 0xffffff, 0, 0, 0, d.rx, d.ry, d.rz, { ol: 0.03, sh: true, nk: true });
  const E = mkEyes(X, body, d, { ex: 0.25, ey: 0.2, r: 0.115, h: 1.0, iris: 0x7aa86a, sclera: 0xf4fff0, lid: G1, droop: 0.38, brow: 0x1f5a28, browTilt: 0.35, lift: 0.12 });
  const M = mkMouth(X, body, d, 0, -0.05, 'line', 0.09, 0x1f4a24);
  F(body, ic(1), 0xeaffd8, 0.36, 0.42, 0.5, 0.16, 0.1, 0.03, { rz: 0.7, ry: 0.5, rx: -0.3 }); // gloss patch
  const rib = grp(body, 0.58, 0.05, 0.34); rib.rotation.set(0, 1.05, 0); // rosette ribbon on the right flank
  B(rib, ic(1), 0x3f7fe8, 0, 0, 0.02, 0.17, 0.17, 0.07, { ol: 0.014 }); F(rib, tor(0.15, 4, 10), 0x8fd0ff, 0, 0, 0.07, 0.15, 0.15, 0.05); F(rib, ic(0), 0xffd84d, 0, 0, 0.09, 0.05);
  for (const sd of [-1, 1]) F(rib, bx, 0x3f7fe8, sd * 0.06, -0.22, 0.0, 0.07, 0.22, 0.02, { rz: sd * 0.2 });
  const stem = [grp(body, 0, 0.6, -0.04)]; for (let i = 0; i < 3; i++) { if (i) stem.push(grp(stem[i - 1], 0, 0.2, 0)); B(stem[i], CK.cyl(0.05 - i * 0.008, 0.06 - i * 0.008, 0.2, 6), 0x3f9a3a, 0, 0.1, 0, 1, 1, 1, { ol: 0.014 }); }
  const leaf = grp(stem[2], 0, 0.2, 0); B(leaf, ic(1), 0x5cc43e, 0.2, 0.0, 0, 0.3, 0.035, 0.17, { ol: 0.016, rz: 0.2 }); F(leaf, bx, 0x2c8a38, 0.2, 0.04, 0, 0.5, 0.01, 0.02, { rz: 0.2 });
  return (c) => {
    const { t, amp, s, cs, A } = c, step = Math.abs(cs), rc = (t * 0.27 + 0.4) % 1, ang = rc < 0.3 ? rc / 0.3 * TAU * 1.3 : 0;
    root.position.set(0, step * 0.06 * amp + A * 0.1, A * 0.5 - A * c.hold * 0.1);
    legs[0].rotation.x = s * 0.55 * amp; legs[1].rotation.x = -s * 0.55 * amp;
    const land = Math.pow(1 - step, 6) * amp * 0.07; // squash on each stomp
    body.rotation.set(0.05 * amp + A * 0.42, s * 0.07 * amp, cs * 0.1 * amp + sin(t * 1.3) * 0.02); body.scale.set(1 + land + A * 0.05, 1 - land - A * 0.08, 1 + land + A * 0.05);
    stem.forEach((g, i) => g.rotation.set(0.1 * sin(t * 2 + i) - A * 0.3, 0, -0.18 + 0.14 * sin(t * 1.6 - i * 0.7) - cs * 0.08 * amp)); leaf.rotation.z = -0.5 + sin(t * 2.2) * 0.12;
    const big = rc < 0.3; eyesSet(E, c.bl, big ? sin(ang) * 0.9 : -0.5 + sin(t * 0.9) * 0.2, big ? cos(ang) * 0.9 : 0.1, 0.38 - (big ? 0.3 : 0) + A * 0.35); mouthSet(M, A * 0.9);
    rib.rotation.z = sin(t * 3) * 0.06; c.sy = 1; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 4. crow_tengu = Pitch-Perfect Gull (spitter): headphone gull that flaps, sings and spits a teal glob
function crow_tengu(X) {
  const { root, B } = X, WH = 0xfbfbff, WING = 0x7a88b8, WING2 = 0x56648f, ORG = 0xff9a2e, LEG = 0xff9a52, NAVY = 0x3a4a8a;
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.14, 0.72, 0); B(g, hang(0.045, 0.04, 0.7, 6), LEG, 0, 0, 0, 1, 1, 1, { ol: 0.016 }); B(g, ic(1), LEG, 0, -0.72, 0.1, 0.13, 0.035, 0.2, { ol: 0.016 }); return g; });
  const body = grp(root, 0, 0.8, 0); B(body, ic(2), WH, 0, 0.42, 0, 0.42, 0.55, 0.38); B(body, ic(1), 0xdfe6ff, 0, 0.4, -0.2, 0.3, 0.42, 0.2, { ol: false });
  const tail = grp(body, 0, 0.0, -0.3); for (let i = -1; i <= 1; i++) { const f = grp(tail); f.rotation.set(0.5, 0, i * 0.35); B(f, ic(0), WING, 0, -0.12, -0.05, 0.1, 0.3, 0.035, { ol: 0.014 }); F(f, ic(0), 0xffffff, 0, -0.36, -0.03, 0.035); }
  const wings = [-1, 1].map((sd) => { const w = grp(body, sd * 0.4, 0.66, -0.04); w.rotation.order = 'ZXY'; B(w, ic(2), WING, sd * 0.38, -0.04, 0, 0.5, 0.075, 0.26, { ol: 0.022 }); for (let k = 0; k < 3; k++) { B(w, ic(0), WING2, sd * (0.78 + k * 0.1), -0.08 - k * 0.025, -0.06 + k * 0.1, 0.17, 0.04, 0.07, { ol: 0.014, rz: -sd * 0.1 }); F(w, ic(0), 0xffffff, sd * (0.9 + k * 0.1), -0.05 - k * 0.025, -0.06 + k * 0.1, 0.03, 0.02, 0.03); } return w; });
  const neck = grp(body, 0, 0.88, 0.06), head = grp(neck, 0, 0.42, 0.02), d = { cy: 0, rx: 0.38, ry: 0.35, rz: 0.34 };
  B(head, ic(2), WH, 0, 0, 0, d.rx, d.ry, d.rz, { ol: 0.026 });
  const E = mkEyes(X, head, d, { ex: 0.2, ey: 0.07, r: 0.1, h: 1.1, iris: 0x8a5a30, sclera: 0xfff6dc, lift: 0.1 });
  const up = grp(head, 0, -0.06, 0.28); B(up, cone(0.19, 0.74, 7), ORG, 0, 0, 0.33, 1, 1, 0.55, { rx: PI / 2, ol: 0.02 });
  const low = grp(head, 0, -0.17, 0.26); B(low, cone(0.15, 0.58, 7), 0xf08020, 0, 0, 0.26, 1, 1, 0.45, { rx: PI / 2, ol: 0.016 }); F(low, ic(0), 0xff7f95, 0, 0.05, 0.16, 0.1, 0.025, 0.13);
  B(head, tor(0.08, 4, 12, PI), NAVY, 0, 0, 0, 0.42, 0.42, 0.42, { ol: 0.014 }); // headphones: band, cups, boom mic
  for (const sd of [-1, 1]) { B(head, CK.cyl(0.13, 0.13, 0.1, 10), NAVY, sd * 0.4, 0.0, -0.02, 1, 1, 1, { rz: PI / 2, ol: 0.016 }); B(head, CK.cyl(0.09, 0.09, 0.03, 10), 0x4fc6f0, sd * 0.46, 0.0, -0.02, 1, 1, 1, { rz: PI / 2, ol: false }); }
  B(head, cylg(1, 5), NAVY, -0.36, -0.14, 0.12, 0.016, 0.34, 0.016, { rz: -0.9, rx: -0.5, ol: false }); B(head, ic(0), 0xffffff, -0.22, -0.3, 0.3, 0.04, 0.04, 0.04, { ol: false });
  const glob = grp(root); B(glob, ic(1), 0x2ec4b6, 0, 0, 0, 0.19, 0.17, 0.26, { ol: false, nk: true }); F(glob, ic(0), 0xc8fff6, -0.06, 0.08, 0.12, 0.05); glob.visible = false;
  const nt = note(root, 0x4f8cf0, 1.3);
  return (c) => {
    const { t, amp, s, cs, A, st } = c, strut = Math.abs(cs), fl = 0.5 + 0.5 * sin(t * 9), idleFlap = (t * 0.33) % 1 < 0.22 ? sin((t * 0.33 % 1) / 0.22 * PI) : 0;
    const lean = Math.max(A, 0), u = c.spit, wind = u >= 0 && u < 0.35 ? sstep(0, 0.35, u) : 0, snap = u >= 0.35 ? 1 - sstep(0.35, 0.6, u) : 0;
    root.position.set(0, strut * 0.05 * amp + sin(t * 2.3) * 0.01, 0);
    legs[0].rotation.x = s * 0.6 * amp; legs[1].rotation.x = -s * 0.6 * amp;
    body.rotation.set(-0.05 + 0.12 * amp - wind * 0.4 + snap * 0.5 * (u >= 0 ? 1 : 0) - A * 0.1, 0, s * 0.05 * amp); body.position.z = -wind * 0.12 + snap * 0.12;
    neck.rotation.x = 0.1 + 0.18 * amp * (0.5 + 0.5 * cs) - wind * 0.4 + snap * 0.35; head.rotation.set(-wind * 0.3 + snap * 0.2 + sin(t * 1.5) * 0.04, -s * 0.06 * amp, sin(t * 1.1) * 0.04);
    const fAmt = Math.max(amp * 0.7, idleFlap, A * 0.9, st.singing ? 0.4 : 0);
    wings.forEach((w, i) => { const sd = i ? 1 : -1, f = sin(t * (9 + amp * 6) + (st.singing ? 0 : 0)) * 0.5 * fAmt; w.rotation.set(0, 0, -sd * (1.1 - fAmt * 0.6 - f - wind * 0.5 + snap * 0.7)); });
    tail.rotation.x = 0.1 + amp * 0.2 + sin(t * 2) * 0.05;
    const open = Math.max(wind * 0.8 + snap * 1, st.singing ? 0.4 + 0.4 * sin(t * 7) : 0, A * 0.4);
    up.rotation.x = -open * 0.12; low.rotation.x = open * 0.5; eyesSet(E, c.bl, 0, 0.1); 
    if (u >= 0.3) { const v = (u - 0.3) / 0.7; vis(glob, true); glob.position.set(0, 1.78 + head.rotation.x * 0 - v * v * 0.5, 0.9 + v * 1.6); glob.scale.set(sstep(0, 0.2, v) * (1 - sstep(0.8, 1, v)) + 0.001, 0.001 + sstep(0, 0.2, v) * (1 - sstep(0.8, 1, v)), 0.001 + sstep(0, 0.15, v) * (1 - sstep(0.85, 1, v)) * (1.2 - v * 0.4)); } else vis(glob, false);
    const tn = (t * 0.45) % 1; flyNote(nt, st.singing ? tn : -1, -0.5, 2.3, 0.2, -0.4, 0.7, 1);
    c.sy = 1 + A * 0.05; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 5. mushroom_folk = Jingle Machine (tank): vending-machine robot with a blinking-bulb head
function mushroom_folk(X) {
  const { root, B } = X, YEL = 0xfdc638, BLU = 0x62b4f0, BLU2 = 0x6ec3ee, NAVY = 0x2b3a7a, CRM = 0xfff4e6;
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.24, 0.5, 0); B(g, hang(0.08, 0.075, 0.34, 8), NAVY, 0, 0, 0, 1, 1, 1, { ol: 0.018 }); foot(X, g, 0, -0.36, 0.07, BLU, 0.16, 0.09, 0.24); return g; });
  const body = grp(root, 0, 0.5, 0);
  B(body, rb(0.9, 1.0, 0.6, 0.3, 2), YEL, 0, 0.5, 0, 1, 1, 1, { ol: 0.03 }); B(body, rb(0.62, 0.62, 0.05, 0.4, 1), CRM, -0.1, 0.62, 0.3, 1, 1, 1, { ol: 0.014 });
  const bot = [0xff7eb6, 0x9af0b4, 0xffd84d, 0x8fe3f0, 0xb59cff];
  for (let i = 0; i < 5; i++) { F(body, CK.cyl(0.05, 0.06, 0.28, 6), bot[i], -0.3 + i * 0.12, 0.7, 0.34, 1, 1, 1); F(body, CK.cyl(0.05, 0.06, 0.18, 6), bot[(i + 2) % 5], -0.3 + i * 0.12, 0.48, 0.34, 1, 1, 1); }
  F(body, bx, 0x6a6a88, -0.1, 0.34, 0.34, 0.6, 0.02, 0.02); B(body, rb(0.5, 0.12, 0.05, 0.4, 1), 0xd9941c, -0.1, 0.17, 0.3, 1, 1, 1, { ol: false });
  const btn = [0xff4d4d, 0x6fd36a, 0xff4d4d, 0xffd84d, 0x6fd36a]; const bl = btn.map((c, i) => F(body, ic(0), c, 0.34, 0.8 - i * 0.12, 0.31, 0.045));
  const spk = B(body, CK.cyl(0.12, 0.12, 0.04, 12), BLU, 0.34, 0.2, 0.3, 1, 1, 1, { rx: PI / 2, ol: 0.014 }); for (let i = 0; i < 3; i++) F(body, ic(0), 0x3a7ac0, 0.34 + (i - 1) * 0.06, 0.2 + (i % 2) * 0.04, 0.33, 0.02);
  const head = grp(body, 0, 1.28, 0), d = { cy: 0, rx: 0.5, ry: 0.4, rz: 0.4 };
  B(head, rb(1.0, 0.6, 0.56, 0.35, 2), BLU2, 0, 0, 0, 1, 1, 1, { ol: 0.03 }); B(head, rb(0.8, 0.44, 0.06, 0.45, 1), 0x9fdcff, 0, -0.02, 0.27, 1, 1, 1, { ol: false });
  const E = mkEyes(X, head, d, { ex: 0.2, ey: 0.05, r: 0.115, h: 1.1, iris: 0xf0a020, lift: 0.0 }), M = mkMouth(X, head, d, 0, -0.17, 'smile', 0.14);
  const bulbs = []; const bc = [0xff7eb6, 0xffd84d, 0x8fe3f0, 0xff9a2e, 0x9af0b4, 0xff7eb6, 0xffd84d]; for (let i = 0; i < 7; i++) bulbs.push(B(head, ic(0), bc[i], -0.36 + i * 0.12, 0.33, 0.05, 0.05, 0.05, 0.05, { ol: false }));
  const arms = [-1, 1].map((sd) => limb(X, body, sd * 0.56, 0.85, 0.02, 0.45, 0.07, BLU, BLU, 0.115));
  const nt = [note(root, 0xff5fa0, 1.2), note(root, 0x4f8cf0, 1.2)];
  return (c) => {
    const { t, amp, s, cs, A, beat } = c, step = Math.abs(cs), land = Math.pow(1 - step, 5) * amp * 0.06, pu = beat;
    root.position.set(0, step * 0.05 * amp + beat * 0.025, A * 0.4);
    legs[0].rotation.x = s * 0.5 * amp; legs[1].rotation.x = -s * 0.5 * amp;
    body.rotation.set(0.04 * amp + A * 0.3, s * 0.05 * amp, cs * 0.04 * amp); body.scale.set(1 + land + beat * 0.02, 1 - land - beat * 0.035 - A * 0.06, 1 + land + beat * 0.02);
    head.rotation.set(-A * 0.2 + beat * 0.04, sin(t * 1.3) * 0.05, sin(t * 2.2) * 0.04 * (1 - amp) - s * 0.03 * amp);
    arms[0].rotation.set(s * 0.45 * amp - A * 2.4, 0, -0.3 - 0.1 * beat); arms[1].rotation.set(-s * 0.45 * amp - 0.2 - A * 2.4 + sin(t * 2.4) * 0.05 + beat * 0.25 * (1 - A), 0, 0.3 + 0.1 * beat);
    bulbs.forEach((b, i) => { const k = 0.7 + 0.9 * tri(t * 2.2 + i * 0.14 - A * 3) + A * 0.3; b.scale.setScalar(0.05 * k); });
    bl.forEach((b, i) => b.scale.setScalar(0.045 * (0.7 + 0.8 * tri(t * 1.7 + i * 0.2)))); spk.scale.set(1 + beat * 0.12, 1, 1 + beat * 0.12);
    eyesSet(E, c.bl, sin(t * 0.8) * 0.4, 0.1); mouthSet(M, A * 0.9 + (c.st.singing ? 0.4 : 0));
    const tn = (t * 0.5) % 1; flyNote(nt[0], tn, -0.45, 2.1, 0.1, -0.4, 0.8, 1); flyNote(nt[1], (tn + 0.5) % 1, 0.45, 2.1, 0.1, 0.4, 0.8, 0.9);
    c.sy = 1; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 6. hitodama = Hot Chilli (fast): red pepper with a curly stem, steam wisps and quick little legs
function hitodama(X) {
  const { root, B } = X, RED = 0xe8352c, DK = 0xa8281f, GRN = 0x4ea83a, ST = 0xff9a3a;
  const pg = CK.geo('fa_chilli', () => { // teardrop lathe that curls to one side at the tip
    const pts = [[0.001, 0], [0.07, 0.1], [0.19, 0.34], [0.31, 0.62], [0.39, 0.92], [0.4, 1.15], [0.32, 1.36], [0.16, 1.46], [0.001, 1.49]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 14), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = Math.pow(1 - y / 1.5, 2.2); p.setX(i, p.getX(i) * 1.0 + k * 0.3); p.setZ(i, p.getZ(i) * 0.86); } g.computeVertexNormals(); return g; });
  const legs = [-1, 1].map((sd) => { const g = grp(root, 0.05 + sd * 0.14, 0.5, 0.04); B(g, hang(0.065, 0.058, 0.4, 7), DK, 0, 0, 0, 1, 1, 1, { ol: 0.018 }); foot(X, g, 0, -0.42, 0.06, 0x7a1a14, 0.12, 0.07, 0.19); return g; });
  const body = grp(root, 0, 0.3, 0); B(body, pg, RED, 0, 0, 0, 1, 1, 1, { ol: 0.028, sh: true });
  const d = { cy: 0.98, rx: 0.4, ry: 0.5, rz: 0.34 };
  const E = mkEyes(X, body, d, { ex: 0.15, ey: 0.08, r: 0.14, h: 1.15, iris: 0xb8a8f8, lift: 0.08 }), M = mkMouth(X, body, d, 0, -0.24, 'smile', 0.07, 0x5a1426);
  F(body, ic(1), 0xfff0e0, 0.24, 0.6, 0.15, 0.12, 0.22, 0.03, { ry: 0.9, rz: -0.25 }); F(body, ic(0), 0xffffff, -0.22, 1.1, 0.14, 0.04, 0.07, 0.02, { ry: -0.9 });
  B(body, ic(1), GRN, 0, 1.46, -0.02, 0.2, 0.09, 0.18, { ol: 0.016 });
  const stem = [grp(body, 0, 1.5, 0)]; for (let i = 0; i < 3; i++) { if (i) stem.push(grp(stem[i - 1], 0, 0.15, 0)); B(stem[i], CK.cyl(0.04 - i * 0.006, 0.055 - i * 0.008, 0.16, 6), GRN, 0, 0.08, 0, 1, 1, 1, { ol: 0.012 }); }
  const wisp = [-1, 1].map((sd) => { const g = grp(body, sd * 0.16, 2.0, 0), ch = []; ch.push(F(g, tor(0.3, 4, 8, PI), ST, 0.05, 0.08, 0, 0.09, 0.09, 0.09, { rz: -PI / 2 })); ch.push(F(g, tor(0.3, 4, 8, PI), ST, -0.05, 0.26, 0, 0.09, 0.09, 0.09, { rz: PI / 2 })); g.userData.ch = ch; return g; });
  return (c) => {
    const { t, amp, s, cs, A } = c, hop = Math.abs(sin(c.ph * 0.5)) * 0.14 * amp;
    root.position.set(0, hop + sin(t * 5) * 0.01, A * 0.65);
    legs[0].rotation.x = s * 0.95 * amp; legs[1].rotation.x = -s * 0.95 * amp;
    body.rotation.set(0.14 * amp + A * 0.5, sin(t * 11) * 0.04 * amp, sin(t * 3.4) * 0.05 + s * 0.12 * amp); body.scale.set(1 + hop * 0.2, 1 - hop * 0.2 + A * 0.04, 1 + hop * 0.2);
    stem.forEach((g, i) => g.rotation.set(-0.1 - 0.3 * amp - A * 0.3, 0, -0.3 + sin(t * 3 - i * 0.7) * 0.15 - 0.2 * i * 0.1));
    const flare = 1 + A * 1.0 + 0.2 * sin(t * 6);
    wisp.forEach((g, i) => { g.scale.set(1, flare, 1); g.rotation.z = (i ? -1 : 1) * 0.1; g.userData.ch.forEach((m, k) => { m.rotation.z = (k ? 1 : -1) * PI / 2 + sin(t * 4 - k * 1.3 + i * 2) * 0.3; m.scale.setScalar(0.09 * (0.7 + 0.5 * tri(t * 1.1 + k * 0.2 + i * 0.4))); }); });
    eyesSet(E, c.bl, sin(t * 6) * 0.4 * (0.3 + amp), 0.1); mouthSet(M, A * 0.9);
    c.sy = 1; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 7. oni_brute = One-Hit Jukebox (tank): wooden jukebox with a bear in the dome, grille, bulbs and a mic stand
function oni_brute(X) {
  const { root, B } = X, BR = 0x9a5a32, BR2 = 0x6e3a1e, CRM = 0xfff0d8, GRY = 0xb8bcc8;
  const legs = [-1, 1].map((sd) => { const g = grp(root, sd * 0.27, 0.46, 0); B(g, hang(0.13, 0.12, 0.34, 8), CRM, 0, 0, 0, 1, 1, 1, { ol: 0.02 }); foot(X, g, 0, -0.38, 0.08, CRM, 0.2, 0.1, 0.28); return g; });
  const body = grp(root, 0, 0.46, 0);
  B(body, rb(1.0, 0.95, 0.64, 0.3, 2), BR, 0, 0.45, 0, 1, 1, 1, { ol: 0.03 }); B(body, rb(1.04, 0.1, 0.68, 0.45, 1), 0xffd84d, 0, 0.0, 0, 1, 1, 1, { sh: true, ol: 0.016 });
  B(body, rb(0.66, 0.48, 0.06, 0.4, 1), CRM, 0, 0.2, 0.32, 1, 1, 1, { ol: 0.014 }); for (let i = 0; i < 5; i++) F(body, bx, 0x8a8aa0, -0.2 + i * 0.1, 0.2, 0.355, 0.04, 0.38, 0.02);
  const lights = [0xff4d4d, 0xffd84d, 0x6fd36a, 0xff7eb6, 0x8fe3f0, 0xff4d4d].map((c, i) => F(body, ic(0), c, -0.3 + i * 0.12, 0.56, 0.33, 0.04));
  const dome = grp(body, 0, 0.95, 0);
  B(dome, CK.cyl(0.5, 0.5, 0.64, 14), BR, 0, 0, 0, 1, 1, 1, { rx: PI / 2, ol: 0.028 }); B(dome, tor(0.07, 4, 14, PI), 0xe8887a, 0, 0, 0.33, 0.5, 0.5, 0.5, { ol: false });
  B(dome, ic(2), 0xd6eefa, 0, 0, 0.3, 0.4, 0.4, 0.07, { sh: true, ol: false }); B(dome, CK.cyl(0.26, 0.26, 0.03, 14), 0x3a2a3a, 0, 0.04, 0.37, 1, 1, 1, { rx: PI / 2, ol: false }); F(dome, ic(0), 0xff7eb6, 0, 0.04, 0.395, 0.07, 0.07, 0.02);
  const bear = grp(dome, 0, -0.04, 0.4), bd = { cy: 0, rx: 0.2, ry: 0.19, rz: 0.16 };
  B(bear, ic(1), 0x8a4a28, 0, 0, 0, bd.rx, bd.ry, bd.rz, { ol: 0.014 }); for (const sd of [-1, 1]) B(bear, ic(0), 0x8a4a28, sd * 0.15, 0.15, -0.02, 0.07, 0.07, 0.05, { ol: false });
  B(bear, ic(1), 0xe6b98a, 0, -0.06, 0.12, 0.1, 0.075, 0.07, { ol: false }); F(bear, ic(0), 0x2b1426, 0, -0.03, 0.18, 0.03, 0.022, 0.02);
  const E = mkEyes(X, bear, bd, { ex: 0.085, ey: 0.05, r: 0.05, h: 1.1, iris: 0x7a3f2c, lift: 0.0, brow: 0x3a2230, browTilt: -0.3 });
  F(dome, bx, 0xffffff, -0.18, 0.2, 0.37, 0.04, 0.2, 0.01, { rz: -0.7 });
  const arms = [-1, 1].map((sd) => limb(X, body, sd * 0.58, 0.82, 0.02, 0.5, 0.095, BR, CRM, 0.14));
  const stand = grp(arms[0], 0, -0.64, 0.06); // mic stand held in the viewer-left hand, base on the ground
  B(stand, cylg(1, 6), GRY, 0, -0.4, 0.03, 0.025, 1.0, 0.025, { ol: 0.01, sh: true }); B(stand, CK.cyl(0.22, 0.22, 0.04, 12), GRY, 0, -0.9, 0.03, 1, 1, 1, { ol: 0.016, sh: true });
  const mic = B(stand, ic(1), GRY, 0, 0.14, 0.03, 0.12, 0.13, 0.12, { ol: 0.018, sh: true }); F(stand, tor(0.2, 4, 10), 0x3a3a50, 0, 0.14, 0.03, 0.12, 0.12, 0.12, { rx: PI / 2 }); F(stand, ic(0), 0x3a3a50, 0, 0.14, 0.12, 0.06, 0.06, 0.03);
  const nt = [note(root, 0xff5fa0, 1.3), note(root, 0xffd84d, 1.3)];
  return (c) => {
    const { t, amp, s, cs, A, beat } = c, step = Math.abs(cs), land = Math.pow(1 - step, 5) * amp * 0.07;
    root.position.set(0, step * 0.04 * amp + beat * 0.03, A * 0.5);
    legs[0].rotation.x = s * 0.45 * amp; legs[1].rotation.x = -s * 0.45 * amp;
    body.rotation.set(0.03 * amp + A * 0.32, s * 0.05 * amp, cs * 0.05 * amp + sin(t * 4) * 0.015 * beat); body.scale.set(1 + land + beat * 0.025, 1 - land - beat * 0.05 - A * 0.05, 1 + land + beat * 0.025);
    dome.rotation.z = sin(t * 6.28 * 2) * 0.05 * (1 + beat); bear.rotation.set(-beat * 0.1, sin(t * 3) * 0.12, sin(t * 6.28 * 2) * 0.06);
    arms[0].rotation.set(s * 0.4 * amp - A * 2.9, 0, -0.18 - 0.08 * beat - A * 0.1); arms[1].rotation.set(-s * 0.4 * amp - A * 0.8 + beat * 0.2, 0, 0.3 + 0.1 * beat); stand.rotation.x = 0.1 + A * 0.4;
    lights.forEach((l, i) => l.scale.setScalar(0.04 * (0.6 + 1.0 * tri(t * 2 + i * 0.17) + beat * 0.5)));
    eyesSet(E, c.bl, sin(t * 1.2) * 0.5, 0.05); const tn = (t * 0.5) % 1; flyNote(nt[0], tn, -0.5, 2.1, 0.2, -0.3, 0.8, 1); flyNote(nt[1], (tn + 0.5) % 1, 0.5, 2.1, 0.2, 0.3, 0.8, 1);
    c.sy = 1; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 8. karakasa = Squeezebox (spitter): hopping one-legged accordion; squeezes, then blows a lilac glob
function karakasa(X) {
  const { root, B } = X, ORG = 0xff8a2e, RED = 0xe03a2e, RED2 = 0xa82a22, CRM = 0xfff4e6, NAVY = 0x2c3a78, YEL = 0xffd23a;
  const leg = grp(root, 0, 0.7, 0); B(leg, hang(0.12, 0.1, 0.5, 8), CRM, 0, 0, 0, 1, 1, 1, { ol: 0.02 }); B(leg, ic(1), 0x5aa0f0, 0, -0.56, 0.12, 0.19, 0.1, 0.32, { ol: 0.022 });
  const body = grp(root, 0, 0.7, 0); B(body, rb(0.66, 0.2, 0.48, 0.35, 1), ORG, 0, 0.05, 0, 1, 1, 1, { ol: 0.024 });
  const core = B(body, rb(0.72, 0.9, 0.5, 0.2, 1), RED2, 0, 0.62, 0, 1, 1, 1, { ol: 0.026 }), slabs = []; for (let i = 0; i < 8; i++) slabs.push(B(body, rb(0.8, 0.12, 0.56, 0.45, 1), i % 2 ? RED2 : RED, 0, 0.25 + i * 0.12, 0, 1, 1, 1, { ol: false }));
  const head = grp(body, 0, 1.43, 0), d = { cy: 0, rx: 0.4, ry: 0.28, rz: 0.3 };
  B(head, rb(0.8, 0.54, 0.6, 0.28, 2), ORG, 0, 0, 0, 1, 1, 1, { ol: 0.028 }); B(head, rb(0.14, 0.5, 0.54, 0.4, 1), CRM, 0.46, 0, 0, 1, 1, 1, { ol: 0.018 }); for (let i = 0; i < 4; i++) F(head, bx, 0x3a2a4a, 0.535, 0.17 - i * 0.11, 0, 0.02, 0.05, 0.4);
  B(head, rb(0.5, 0.1, 0.4, 0.4, 1), CRM, -0.04, 0.32, 0, 1, 1, 1, { ol: 0.016 });
  const E = mkEyes(X, head, d, { ex: 0.2, ey: 0.07, r: 0.135, h: 1.0, iris: 0xe89a2a, ring: YEL, lift: 0.0 }), M = mkMouth(X, head, d, 0, -0.17, 'grin', 0.2);
  for (let i = 0; i < 5; i++) F(M.g, bx, 0xffffff, (i - 2) * 0.075, 0.07, 0.02, 0.05, 0.065, 0.03);
  const arms = [-1, 1].map((sd) => limb(X, body, sd * 0.43, 1.12, 0.02, 0.42, 0.045, NAVY, CRM, 0.085));
  const glob = grp(root); B(glob, ic(1), 0xb9a8ff, 0, 0, 0, 0.2, 0.2, 0.2, { ol: false, nk: true }); F(glob, ic(0), 0xffffff, -0.06, 0.08, 0.12, 0.05); glob.visible = false;
  const nt = note(root, 0xb59cff, 1.2);
  return (c) => {
    const { t, amp, A, st } = c, hop = Math.abs(sin(c.ph * 0.5)), u = c.spit, wind = u >= 0 && u < 0.35 ? sstep(0, 0.35, u) : 0, snap = u >= 0.35 ? 1 - sstep(0.35, 0.65, u) : 0;
    const sq = clamp(0.5 + 0.45 * sin(t * 2.6) * (1 - amp) + amp * (0.5 - 0.5 * cos(c.ph)) * 0.9 + wind * 0.8 - snap * 0.6 + (u < 0 ? A * 0.5 : 0), 0, 1.2); // 0 = stretched, 1 = squeezed
    root.position.set(0, hop * 0.28 * amp + (1 - sq) * 0.0 + snap * 0.06, 0);
    leg.rotation.x = -c.s * 0.3 * amp + 0.1 * hop * amp;
    const hh = 1 - sq * 0.3; core.scale.y = hh; slabs.forEach((m, i) => { m.position.y = 0.25 + i * 0.12 * hh; m.scale.set(1 + sq * 0.06 * (i % 2 ? 0 : 1), 1 - sq * 0.15, 1 + sq * 0.05); });
    head.position.y = 0.25 + 8 * 0.12 * hh + 0.22; body.rotation.set(0.05 * amp - wind * 0.3 + snap * 0.3, sin(t * 1.2) * 0.04, c.s * 0.04 * amp);
    head.rotation.set(-wind * 0.3 + snap * 0.2, sin(t * 0.9) * 0.05, sin(t * 7) * 0.02 * (wind + A));
    arms[0].rotation.set(-0.2 + c.s * 0.4 * amp + wind * 0.6, 0, -0.4 - wind * 0.6 - 0.1 * sin(t * 2)); arms[1].rotation.set(-0.2 - c.s * 0.4 * amp + wind * 0.6, 0, 0.4 + wind * 0.6 + 0.1 * sin(t * 2.2));
    eyesSet(E, c.bl, sin(t * 0.7) * 0.4, 0.05); mouthSet(M, 0.15 + wind * 0.9 + snap * 0.5 + (st.singing ? 0.4 : 0));
    if (u >= 0.35) { const v = (u - 0.35) / 0.65, k = sstep(0, 0.2, v) * (1 - sstep(0.8, 1, v)) + 0.001; vis(glob, true); glob.position.set(0, 1.5 + head.position.y - 1.55 + 0.7 - v * v * 0.5, 0.7 + v * 1.6); glob.scale.set(k, k, k * (1.2 - v * 0.4)); } else vis(glob, false);
    const tn = (t * 0.5) % 1; flyNote(nt, st.singing ? tn : -1, 0.5, 2.5, 0.1, 0.4, 0.7, 1);
    c.sy = 1 + wind * 0.04; c.sxz = 1;
  };
}

// ---------------------------------------------------------------- 9. boss_kuzunoha = Kraki: big pink octopus blob with teal bubbles, a face mask, yellow-tipped tentacles, on a teal splash pad
let _bub = null; const bubMat = () => _bub || (_bub = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false }));
function boss_kuzunoha(X) {
  const { root, B } = X, PINK = 0xff93c8, PINK2 = 0xf56fae, TEAL = 0x35c4c0, YEL = 0xffd23a;
  const pad = grp(root); B(pad, ic(2), 0x4fd6cc, 0, 0.02, 0, 2.3, 0.14, 2.1, { ol: 0.03 }); B(pad, ic(2), 0x9ff2e8, 0, 0.1, 0, 1.8, 0.06, 1.6, { ol: false });
  const rip = [0, 1].map((i) => F(pad, tor(0.03, 3, 18), 0xe8fffb, 0, 0.17, 0, 1, 1, 1, { rx: PI / 2 }));
  const body = grp(root, 0, 1.85, 0), d = { cy: 0, rx: 0.78, ry: 0.55, rz: 0.2 };
  B(body, ic(3), PINK, 0, 0, 0, 1.2, 1.25, 1.15, { ol: 0.045 });
  [[-0.6, 0.7, 0.2], [0.3, 0.85, 0.15], [0.95, 0.55, 0.23], [-1.45, 0.3, 0.15], [2.3, 0.4, 0.2], [3.14, 0.7, 0.26], [-2.5, 0.55, 0.18], [1.7, 0.2, 0.12], [-0.2, 0.3, 0.1]].forEach(([lon, lat, r]) => {
    const nx = sin(lon) * cos(lat), ny = sin(lat), nz = cos(lon) * cos(lat); B(body, ic(1), TEAL, nx * 1.19, ny * 1.24, nz * 1.14, r, r * 0.5, r, { ol: false, q: CK.aim(nx, ny, nz) }); F(body, ic(0), 0xc2faf4, nx * 1.19 + nx * 0.03, ny * 1.24 + ny * 0.03, nz * 1.14 + nz * 0.03, r * 0.35);
  });
  const fg = grp(body, 0, -0.2, 0.93); B(fg, ic(2), 0xfff3f8, 0, 0, 0, d.rx, d.ry, d.rz, { ol: 0.022 });
  const E = mkEyes(X, fg, d, { ex: 0.32, ey: 0.05, r: 0.28, h: 1.05, iris: 0x22b8b0, lift: 0.0 }), M = mkMouth(X, fg, d, 0, -0.34, 'smile', 0.13);
  for (const sd of [-1, 1]) F(fg, ic(1), 0xff9cc6, sd * 0.58, -0.2, 0.06, 0.08, 0.05, 0.02, { ry: sd * 0.7 });
  const tops = [-1.5, -0.5, 0.5, 1.5].map((x, i) => { // curly little tentacles on top, yellow bulbs at the tips
    const ch = [grp(body, x * 0.34, 1.12 - Math.abs(x) * 0.1, -0.15 + (i % 2) * 0.1)]; for (let k = 0; k < 3; k++) { if (k) ch.push(grp(ch[k - 1], 0, 0.32 - k * 0.04, 0)); B(ch[k], CK.cyl(0.075 - k * 0.015, 0.09 - k * 0.015, 0.32 - k * 0.04, 7), PINK2, 0, (0.32 - k * 0.04) / 2, 0, 1, 1, 1, { ol: 0.016 }); }
    B(ch[2], ic(1), YEL, 0, 0.3, 0, 0.14, 0.14, 0.14, { ol: 0.016 }); return ch; });
  const legs = []; for (let i = 0; i < 6; i++) { // big tentacles: out, along the ground, curl up at the tip
    const a = i / 6 * TAU + 0.5, ch = [grp(body, sin(a) * 0.62, -1.05, cos(a) * 0.62)]; ch[0].rotation.set(-0.85, a, 0, 'YXZ');
    const L = [0.66, 0.58, 0.48], R0 = [0.27, 0.2, 0.14], R1 = [0.2, 0.14, 0.06];
    for (let k = 0; k < 3; k++) { if (k) ch.push(grp(ch[k - 1], 0, -L[k - 1], 0)); B(ch[k], hang(R0[k], R1[k], L[k], 8), PINK2, 0, 0, 0, 1, 1, 1, { ol: 0.022 }); B(ch[k], ic(0), PINK2, 0, 0, 0, R0[k] * 1.05, R0[k] * 1.05, R0[k] * 1.05, { ol: 0.016 }); }
    B(ch[2], ic(1), YEL, 0, -0.48, 0, 0.15, 0.15, 0.15, { ol: 0.018 }); legs.push(ch);
  }
  const bub = [0, 1, 2, 3, 4].map((i) => { const g = grp(root); CK.flat(ic(1), bubMat(), g, 0, 0, 0, 1, 1, 1); g.userData.noBake = false; return g; });
  const sp = [0, 1, 2].map((i) => F(grp(root), CK.geo('fa_oct', () => new THREE.OctahedronGeometry(1, 0)), hdr(2.2, 1.8, 0.5), 0, 0, 0, 0.1, 0.1, 0.02));
  const glob = grp(root); B(glob, ic(2), 0xffb0d8, 0, 0, 0, 0.3, 0.3, 0.3, { ol: 0.02, nk: true }); F(glob, ic(0), 0xffffff, -0.1, 0.12, 0.17, 0.08); glob.visible = false;
  const rest = legs.map((ch) => ch.map((g) => g.rotation.x));
  return (c) => {
    const { t, amp, s, A } = c, u = c.spit, wind = u >= 0 && u < 0.35 ? sstep(0, 0.35, u) : 0, snap = u >= 0.35 ? 1 - sstep(0.35, 0.6, u) : 0, br = sin(t * 1.9), hop = Math.abs(sin(c.ph * 0.5)) * 0.14 * amp;
    root.position.set(0, 0, 0); body.position.set(0, 1.85 + br * 0.04 + hop + A * 0.15 + wind * 0.15, A * 0.5 + snap * 0.3);
    body.rotation.set(0.05 * amp + A * 0.25 - wind * 0.2 + snap * 0.1, sin(t * 0.8) * 0.06 + s * 0.04 * amp, sin(t * 1.3) * 0.03 + s * 0.05 * amp);
    const bs = 1 + br * 0.012 - hop * 0.06 + wind * 0.08; body.scale.set(bs, 1 / bs * (1 + A * 0.05), bs);
    legs.forEach((ch, i) => { const ph = t * 2.3 + i * 1.1, w = sin(ph) * (0.12 + amp * 0.1) + sin(c.ph + i * 1.05) * 0.3 * amp; ch.forEach((g, k) => { g.rotation.x = rest[i][k] + w * (0.5 + k * 0.4) - (k ? 0 : (A * 0.5 + wind * 0.3) * (i % 2 ? 1 : 1)) + (k === 2 ? -A * 0.9 : 0); }); });
    tops.forEach((ch, i) => ch.forEach((g, k) => { g.rotation.set(0, 0, (i % 2 ? -1 : 1) * (0.35 + k * 0.28) + sin(t * 2.6 + i * 1.7 - k * 0.8) * 0.28 + (i < 2 ? -1 : 1) * 0.15 * (A + wind)); }));
    pad.scale.set(1 + sin(t * 1.4) * 0.015 + A * 0.04, 1, 1 + sin(t * 1.4) * 0.015 + A * 0.04); rip.forEach((r, i) => { const k = (t * 0.35 + i * 0.5) % 1, sc = 1.05 + k * 0.6; r.scale.set(sc * 1.4, sc * 1.25, 1); r.scale.z = 0.01 + (1 - k) * 1; r.position.y = 0.16; });
    eyesSet(E, c.bl, sin(t * 0.8) * 0.4, 0.1); mouthSet(M, A * 0.8 + wind * 0.8);
    bub.forEach((g, i) => { const k = (t * 0.18 + i * 0.2) % 1, a = i * 2.4 + t * 0.3; g.position.set(sin(a) * (1.6 + 0.2 * i % 2), 0.9 + k * 3.0, cos(a) * 1.4); g.scale.setScalar(0.001 + (0.1 + 0.05 * (i % 3)) * sin(k * PI)); });
    sp.forEach((m, i) => { const k = tri(t * 0.7 + i * 0.37); m.parent.position.set([-1.9, 1.7, 1.5][i], [3.4, 3.1, 2.0][i], [0.8, 0.5, 1.2][i]); m.scale.set(0.12 * k, 0.12 * k, 0.02); m.parent.rotation.z = t * 0.8; });
    if (u >= 0.3) { const v = (u - 0.3) / 0.7, k = sstep(0, 0.2, v) * (1 - sstep(0.8, 1, v)) + 0.001; vis(glob, true); glob.position.set(0, 1.9 - v * v * 0.6, 1.4 + v * 2.2); glob.scale.setScalar(k * (1 + v * 0.5)); } else vis(glob, false);
    c.sy = 1; c.sxz = 1;
  };
}

export const FOES_A = {};
const reg = (name, cfg, setup) => { FOES_A[name] = (o) => foe(o, Object.assign({ name }, cfg), setup); };
reg('kappa', { H: 2.3, R: 0.58, seed: 3, stride: 11, crown: [0, 2.28, 0, 1.1], puff: 0xffc66a }, kappa);
reg('oni_cub', { H: 2.45, R: 0.52, seed: 4, stride: 20, crown: [0, 2.02, 0, 0.9], puff: 0xc9b4ff, atk: 0.45 }, oni_cub);
reg('bamboo_boar', { H: 2.1, R: 0.66, seed: 5, stride: 8, crown: [0, 1.5, -0.04, 1.1], puff: 0x84d64e, atk: 0.6 }, bamboo_boar);
reg('crow_tengu', { H: 2.6, R: 0.6, seed: 6, stride: 12, crown: [0, 2.55, 0.04, 0.9], puff: 0xc8d4ff, atk: 0.6 }, crow_tengu);
reg('mushroom_folk', { H: 2.15, R: 0.58, seed: 7, stride: 8, crown: [0, 2.22, 0, 1.2], puff: 0xfdc638, atk: 0.6 }, mushroom_folk);
reg('hitodama', { H: 2.5, R: 0.5, seed: 8, stride: 22, crown: [0.0, 1.9, 0, 0.9], puff: 0xff7058, atk: 0.45 }, hitodama);
reg('oni_brute', { H: 2.05, R: 0.68, seed: 9, stride: 7, crown: [0, 1.98, 0, 1.3], puff: 0xc08050, atk: 0.7 }, oni_brute);
reg('karakasa', { H: 2.5, R: 0.55, seed: 10, stride: 14, crown: [0, 2.48, 0, 0.9], puff: 0xff8a2e, atk: 0.6 }, karakasa);
reg('boss_kuzunoha', { H: 4.0, R: 1.6, seed: 11, stride: 8, crown: [0, 3.15, 0, 1.8], puff: 0xff9cc6, atk: 0.8, die: 1.1 }, boss_kuzunoha);
