// Encore Island 3D, act 2 foes ("Social Media Strait", the feed / ads gag act) + boss Scrollspinner. Design source: the 2D sprites (FOE_ART[1], BOSS_ART[1]).
//   FOES_B = { chochin, karakuri_puppet, drowned_samurai, nopperabo, koi_spirit, tsukumogami, ittan_momen, silk_weaver, boss_jorogumo }, each build({ elite, gold }) -> actor
//   actor = { group, update(dt, t, st), height, radius, attack(), die(), isDead(), reset(), dispose() }   (contract: README.md; the engine bakes the rig)
// Rigs use the characters.js helper bundle (CK): inked hulls, per-actor materials (hurt flash), makeLife (attack pulse, hurt squash, death).
// Modelled ~2 units tall for a nominal radius of 0.55 (boss ~3.8 / 1.6); the engine rescales the group. Headless safe: nothing here touches the DOM at import.
// Bake friendly: <= 2 lit buckets (matte + glossy, gold swaps every colour into the glossy one), 1 unlit bucket (faces, glows), 1 ink bucket.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CK } from '../../encore_island_3d/js/characters.js';
import { Q, LOOK, glow, roundedBoxGeo, latheGeo } from './kit.js';

const { clamp, damp, lerp, ease } = CK, PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs;
const sat = (x) => clamp(x, 0, 1), fract = (x) => x - Math.floor(x);
const _gc = new THREE.Color();
const hash = (k) => fract(sin(k * 127.1 + 311.7) * 43758.5453) * 2 - 1; // -1..1, deterministic
/** windup / strike curve: 0 idle, falls to -1 (lean back) at u .3, snaps to +1 at u .5, relaxes to 0 */
const strike = (u) => (u < 0 ? 0 : u < 0.3 ? -ease(u / 0.3) : u < 0.5 ? -1 + 2 * ease((u - 0.3) / 0.2) : 1 - ease((u - 0.5) / 0.5));

// ---------------------------------------------------------------- geometry (cached in CK.geo; independent of STYLE.boost so the triangle budget is stable)
const lv = (n) => Math.max(0, n - (Q.detail === 0 ? 1 : 0));
const ico = (n) => CK.geo('fb_ico' + lv(n), () => new THREE.IcosahedronGeometry(1, lv(n)));
const box = CK.box(1, 1, 1), hang = CK.hang, cone = CK.cone, cyl = CK.cyl;
const rb = (w, h, d, r, s = 2) => CK.geo(`fb_rb${w},${h},${d},${r},${s}`, () => { const g = roundedBoxGeo(w, h, d, r, s); g.deleteAttribute('uv'); return g; }); // s = segments per corner (1 for small trim)
const tor = (R, t, a = 6, b = 14, arc = TAU) => CK.geo(`fb_tor${R},${t},${a},${b},${arc}`, () => new THREE.TorusGeometry(R, t, a, b, arc));
const spike = (n = 6) => CK.geo('fb_spk' + n, () => new THREE.ConeGeometry(1, 1, n).translate(0, 0.5, 0)); // unit cone, base at the origin, tip at y = 1
const dome = (n = 10) => CK.geo('fb_dome' + n, () => new THREE.SphereGeometry(1, n, 5, 0, TAU, 0, PI / 2));
const oct = CK.geo('fb_oct', () => new THREE.OctahedronGeometry(1, 0));
const heart = CK.geo('fb_heart', () => { const s = new THREE.Shape(); s.moveTo(0, -0.9); s.bezierCurveTo(-1.5, 0.1, -0.7, 1.1, 0, 0.4); s.bezierCurveTo(0.7, 1.1, 1.5, 0.1, 0, -0.9); const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -0.25); g.deleteAttribute('uv'); return g; });
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3();
/** merge [geo, x, y, z, sx, sy, sz, rx, ry, rz] entries into ONE geometry (one bone, one draw) */
function compose(list) {
  return mergeGeometries(list.map(([g, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0]) => {
    const c = g.index ? g.toNonIndexed() : g.clone(); c.deleteAttribute('uv'); if (!c.attributes.normal) c.computeVertexNormals();
    return c.applyMatrix4(_M.compose(_V.set(x, y, z), _Q.setFromEuler(_E.set(rx, ry, rz)), _S.set(sx, sy, sz)));
  }));
}
const cog = () => CK.geo('fb_cog', () => compose([[cyl(1, 1, 1, 8), 0, 0, 0, 0.1, 0.07, 0.1, PI / 2], [cyl(1, 1, 1, 8), 0, 0, 0, 0.1, 0.07, 0.1, PI / 2, PI / 8]]));
const grp = (par, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (par) par.add(g); return g; };
/** hide / show a node. Baked rigs collapse a bone on node.visible = false, but bake.js keeps a stale boneMatrices array (three re-allocates it on the first render),
 *  so the flag alone does not hide anything yet: also squash the node to ~0 scale (animation of scale always survives baking). */
const _s0 = new WeakMap();
function vis(n, on) {
  n.visible = on; let s = _s0.get(n); if (!s) _s0.set(n, s = n.scale.toArray());
  if (on) n.scale.set(s[0], s[1], s[2]); else n.scale.set(1e-4, 1e-4, 1e-4);
}
const G = (r, g, b) => glow(r, g, b); // unlit HDR colours in LINEAR space (values above 1 bloom)
const GH = (hex, k = 1) => { _gc.set(hex); return glow(_gc.r * k, _gc.g * k, _gc.b * k); }; // unlit colour from an sRGB hex, optionally boosted past 1 for bloom
// gold: every lit colour is remapped onto a metallic gold ramp by its luminance
const goldTone = (c) => { const r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255, l = sat(r * 0.3 + g * 0.59 + b * 0.11), k = 0.42 + l * 0.8; return _gc.setRGB(sat(k), sat(k * 0.76), sat(k * 0.22), THREE.SRGBColorSpace).getHex(); };
const SH = { roughness: 0.34, metalness: 0.08 }; // the one glossy bucket (crown, gems, gold)
const GOLDC = 0xffd24a, BLUE = 0x3b6fe0;

// ---------------------------------------------------------------- shared rig: life, blink, walk phase, elite crown, gold sparkles, reset
// spec = { atk (s), rate (walk phase speed), h (height), seed, build(K) -> tick(m, st) }
function rig(name, o, spec) {
  o = o || {}; const gold = !!o.gold, ctx = CK.makeCtx(), { group, fitG, root } = CK.creatureBase(ctx, name);
  const K = { ctx, root, gold, crowns: [], sparks: [] };
  K.P = (par, g, c, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, op = {}) => CK.part(ctx, par, g, gold ? goldTone(c) : c, x, y, z, sx, sy, sz, Object.assign({ ol: 0.024 }, op, op.sh || gold ? { mo: SH } : {}));
  K.U = (par, g, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, op = {}) => CK.part(ctx, par, g, 0, x, y, z, sx, sy, sz, Object.assign({ ol: 0.02, hull: true, mat }, op)); // unlit part WITH an inked hull (bright whites)
  K.F = (par, g, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, op = {}) => CK.flat(g, mat, par, x, y, z, sx, sy, sz, op);
  K.face = (host, d, f) => CK.addFace(ctx, host, d, Object.assign({ iris: BLUE, blushColor: 0xff8fa8 }, f));
  K.crown = (par, x, y, z, s) => { // elite: a golden crown with a glinting gem, shown when opts.elite or st.elite
    const g = grp(par, x, y, z); g.scale.setScalar(s); g.visible = !!o.elite; const cp = { mo: SH, ol: 0.012 };
    CK.part(ctx, g, cyl(0.19, 0.21, 0.1, 8), GOLDC, 0, 0.05, 0, 1, 1, 1, cp);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; CK.part(ctx, g, cone(0.05, 0.17, 4), GOLDC, cos(a) * 0.19, 0.17, sin(a) * 0.19, 1, 1, 1, cp); }
    K.F(g, ico(0), G(2.4, 0.35, 0.6), 0, 0.07, 0.21, 0.05, 0.05, 0.035);
    g.userData.glint = K.F(g, oct, G(3, 3, 2.4), 0.12, 0.3, 0.12, 0.06, 0.09, 0.02); K.crowns.push(g); return g;
  };
  K.sparkle = (par, y, R, n = 3) => { // gold: orbiting glints
    const g = grp(par, 0, y, 0); g.visible = gold; for (let i = 0; i < n; i++) { const a = i / n * TAU; K.F(g, oct, G(2.8, 2.2, 0.8), cos(a) * R, sin(i * 2.1) * 0.12, sin(a) * R, 0.05, 0.08, 0.02, { ry: a }); }
    K.sparks.push(g); return g;
  };
  const tick = spec.build(K), L = CK.makeLife(ctx, spec.atk, spec.die || 0.8), S = CK.newState(spec.seed || 1), m = { dt: 0 };
  const seed = () => { S.sp = 0; S.ph = spec.seed * 1.3; S.tt = spec.seed * 3.1; S.el = o.elite ? 1 : 0; S.pa = false; S.off = spec.seed * 1.7; };
  seed(); fitG.scale.setScalar(1 + 0.12 * S.el);
  const self = { group, height: spec.h, radius: spec.rad || 0.55, M: m,
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {}; L.tick(dt, st);
      if (st.die > 0) { L.dieT = Math.max(1e-4, st.die * (spec.die || 0.8)); L.dieU = sat(st.die); L.dead = false; } // the engine's death progress is authoritative (keeps the actor reusable)
      if (L.dead) { root.scale.setScalar(1e-4); return; }
      const atk = !!st.atk; if (atk && !S.pa && L.dieT < 0) L.attack(); S.pa = atk;
      const k = st.slow ? 0.6 : 1, da = dt * k, sp = (S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 9, dt));
      S.ph += da * sp * spec.rate; S.tt += da;
      m.dt = da; m.sp = sp; m.amp = Math.min(1, sp * 2.4); m.ph = S.ph; m.s = sin(S.ph); m.c = cos(S.ph); m.t = S.tt; m.T = t;
      m.A = L.atkEnv; m.u = L.atkT >= 0 ? L.atkT / spec.atk : -1; m.du = L.dieT >= 0 ? L.dieU : 0; m.hurt = L.hurt; m.sing = st.singing ? 1 : 0;
      m.br = sin(S.tt * 2.3 + S.off); m.beat = LOOK.beat.value; m.sy = 1; m.sxz = 1;
      S.blinkIn -= da; if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
      m.bl = 0; if (S.blinkT >= 0) { S.blinkT += da; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else m.bl = 1 - abs(u * 2 - 1); }
      root.position.set(0, 0, 0); tick(m, st);
      const el = (o.elite || st.elite) ? 1 : 0, gl = gold || st.gold; S.el = damp(S.el, el, 8, dt); fitG.scale.setScalar(1 + 0.12 * S.el); self.height = spec.h * (1 + 0.12 * S.el);
      for (const c of K.crowns) { vis(c, S.el > 0.2); c.rotation.y = m.t * 1.6; const gl2 = c.userData.glint; gl2.scale.set(0.06 * (0.4 + abs(sin(m.t * 5))), 0.09 * (0.4 + abs(sin(m.t * 5))), 0.02); }
      for (const s of K.sparks) { vis(s, gl); s.rotation.y = m.t * 2.2; }
      CK.lifeXform(L, root, 1, 1, 1, m.sy, m.sxz);
    },
    reset() { // recycle after death (the engine reuses actors that support it)
      L.atkT = -1; L.dieT = -1; L.dead = false; L.hurt = 0; L.hurtApplied = 0; L.atkEnv = 0; L.dieU = 0; ctx.setHurt(0); seed(); S.blinkT = -1;
      root.scale.set(1, 1, 1); root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); fitG.scale.setScalar(1 + 0.12 * S.el);
    },
    dispose() { for (const mt of ctx.list) mt.dispose(); },
  };
  self.attack = () => L.attack(); self.die = () => L.die(); self.isDead = () => L.dead; Object.defineProperty(self, 'dead', { get: () => L.dead });
  self.setCarry = () => {}; return self;
}
/** a big open "D" smile inside a face's mouth group (scale the returned group to open and close it) */
const smile = (K, face, w, h) => { const mo = grp(face.mouth); K.F(mo, dome(10), CK.basic(0x5a1226), 0, h * 0.35, 0.004, w, h, 0.05, { rz: PI }); K.F(mo, dome(8), CK.basic(0xff7f95), 0, -h * 0.35, 0.012, w * 0.55, h * 0.4, 0.05, { rz: PI }); return mo; };
const faceTick = (face, m, open, wide) => { CK.setBlink(face, m.bl); CK.setMouth(face, open, wide); };
/** a limb that hangs from its pivot: returns the pivot group (rotate it) */
const limb = (K, par, x, y, z, len, r0, r1, col, hand, hc, seg = 6) => {
  const j = grp(par, x, y, z); K.P(j, hang(r0, r1, len, seg), col, 0, 0, 0, 1, 1, 1, { ol: 0.02 });
  if (hand) K.P(j, ico(1), hc ?? 0xffffff, 0, -len - hand * 0.25, 0, hand, hand, hand, { ol: 0.018 }); return j;
};

// ================================================================ 1. chochin: Flamebait (melee). A matchstick with a flaming head, glued to its phone.
function bChochin(K) {
  const { P, F, root } = K, WOOD = 0xf2c382, HEAD = 0xee5a3c, body = grp(root), head = grp(body, 0, 1.42, 0);
  P(body, rb(0.3, 1.3, 0.27, 0.12), WOOD, 0, 0.65, 0, 1, 1, 1, { ol: 0.026 });
  for (const [x, y, h] of [[-0.05, 0.45, 0.55], [0.06, 0.72, 0.36], [-0.02, 0.2, 0.18]]) F(body, box, CK.basic(0xc98a48), x, y, 0.138, 0.016, h, 0.01);
  P(head, ico(2), HEAD, 0, 0, 0, 0.43, 0.41, 0.41, { ol: 0.03 });
  P(head, ico(1), 0xc8486e, 0, -0.26, 0.03, 0.3, 0.17, 0.3, { ol: false }); // scorched purple underside (sprite gradient)
  const face = K.face(head, { cy: 0, rx: 0.43, ry: 0.41, rz: 0.41, hs: 1.55 }, { ex: 0.12, ey: -0.01, ew: 0.075, eh: 0.1, my: -0.13, mw: 0.045, blushColor: 0xff9ab0 });
  // flame: tongues + hot core, unlit HDR so bloom lights it
  const fl = grp(head, 0, 0.3, 0), tongues = [], hot = G(1.7, 0.2, 0.02), core = G(1.9, 0.85, 0.08);
  for (const [x, rz, sc, c] of [[0, 0, 1, hot], [-0.14, 0.4, 0.62, hot], [0.14, -0.4, 0.7, hot], [0, 0, 0.62, core]]) { const g = grp(fl, x, 0, 0); g.rotation.z = rz; const w = 0.19 * (c === core ? 0.62 : 1); F(g, spike(6), c, 0, 0, c === core ? 0.07 : 0, w, 0.62 * sc * (c === core ? 0.85 : 1), w); tongues.push([g, rz, sc]); }
  const crown = K.crown(head, 0, 0.36, 0, 0.9); K.sparkle(root, 1.2, 0.8);
  // arms: left holds the glowing phone up in front of its face, right is a stub
  const aL = limb(K, body, -0.17, 0.95, 0.05, 0.34, 0.05, 0.045, WOOD, 0.075, WOOD), aR = limb(K, body, 0.17, 0.95, 0, 0.3, 0.05, 0.045, WOOD, 0.07, WOOD);
  const ph = grp(aL, 0, -0.42, 0.04); P(ph, rb(0.2, 0.32, 0.06, 0.04, 1), 0x3a6ad8, 0, 0, 0, 1, 1, 1, { ol: 0.016 });
  F(ph, box, G(0.4, 0.8, 1.4), 0, 0.01, 0.034, 0.15, 0.25, 0.01); F(ph, heart, G(1.6, 0.5, 0.9), 0, 0.02, 0.042, 0.035, 0.035, 0.012);
  return (m, st) => {
    const { amp, s, t, A, du } = m, sk = strike(m.u), hop = abs(s) * 0.17 * amp;
    body.position.set(0, hop, Math.max(0, sk) * 0.5); body.rotation.set(sk * 0.3 + 0.05 * amp, 0, s * 0.11 * amp + sin(t * 1.7) * 0.03);
    m.sy = 1 + 0.08 * amp * abs(s) - 0.07 * amp * (1 - abs(s)) + A * 0.06; m.sxz = 1 - 0.03 * amp * abs(s) + A * 0.04;
    head.rotation.set(0.14 - A * 0.2 + sin(t * 2) * 0.03, sin(t * 1.3) * 0.12 * (1 - amp), sin(t * 1.9) * 0.05 - s * 0.05 * amp);
    const th = Math.max(0, sk); aL.rotation.set(-1.15 + sin(t * 3.1) * 0.07 - th * 1.0, 0, -0.35 + th * 0.2); aR.rotation.set(-s * 0.5 * amp - th * 1.5, 0, 1.0 + sin(t * 2.4) * 0.1 - th * 0.3);
    ph.rotation.set(0.7, 0, 0.08 + sin(t * 3.1) * 0.05);
    for (let i = 0; i < tongues.length; i++) { const [g, rz, sc] = tongues[i]; g.scale.y = (1 + 0.17 * sin(t * 15 + i * 2.3) + 0.1 * sin(t * 24 + i)) * (1 + A * 0.6 + du * 1.6); g.rotation.z = rz + 0.1 * sin(t * 6 + i * 1.7) - body.rotation.z * 0.5; }
    fl.rotation.x = sk * 0.18; fl.scale.set(1 + A * 0.5, 1, 1 + A * 0.5);
    faceTick(face, m, A * 0.9 + m.sing * 0.3, 0.8 - A * 0.5);
  };
}

// ================================================================ 2. karakuri_puppet: Clickbait Goblin (fast). A jerky string puppet with a red arrow.
function bPuppet(K) {
  const { P, F, root } = K, CREAM = 0xfff0cc, GREEN = 0x86d86c, GREEN2 = 0x5cb64e, RED = 0xff4a55, NAVY = 0x24306a;
  const legs = [];
  for (const sd of [-1, 1]) { const g = limb(K, root, sd * 0.15, 0.5, 0, 0.42, 0.085, 0.07, CREAM); P(g, ico(1), RED, 0, -0.43, 0.06, 0.14, 0.085, 0.2, { ol: 0.02 }); legs.push(g); }
  const body = grp(root, 0, 0.5, 0); P(body, rb(0.62, 0.56, 0.4, 0.17), CREAM, 0, 0.3, 0);
  P(body, rb(0.4, 0.3, 0.07, 0.07, 1), NAVY, 0, 0.3, 0.2, 1, 1, 1, { ol: 0.014 }); F(body, box, GH(0x1d44e6), 0, 0.3, 0.238, 0.34, 0.24, 0.01);
  F(body, spike(3), G(1.8, 1.8, 2), -0.015, 0.32, 0.246, 0.06, 0.1, 0.012, { rz: -PI / 2 }); F(body, box, GH(0xff4a60, 1.3), 0, 0.2, 0.246, 0.2, 0.02, 0.01);
  const arms = [];
  for (const sd of [-1, 1]) arms.push(limb(K, body, sd * 0.37, 0.5, 0, 0.36, 0.065, 0.06, CREAM, 0.09, 0xffffff));
  const cg = grp(body, 0.27, 0.58, -0.22); P(cg, cog(), 0xd89a3a, 0, 0, 0, 1, 1, 1.2, { ol: false }); P(cg, ico(0), 0x7a4a1a, 0, 0, 0.06, 0.04, 0.04, 0.03, { ol: false });
  const arrow = grp(body, 0.34, 0.62, -0.1); arrow.rotation.z = -0.85;
  P(arrow, rb(0.11, 0.62, 0.11, 0.05, 1), RED, 0, 0.34, 0, 1, 1, 1, { ol: 0.02 }); P(arrow, cone(0.21, 0.34, 4), RED, 0, 0.76, 0, 1, 1, 0.6, { ol: 0.022 });
  const head = grp(body, 0, 0.96, 0); P(head, ico(2), GREEN, 0, 0, 0, 0.44, 0.4, 0.38, { ol: 0.028 });
  for (const sd of [-1, 1]) { const dir = new THREE.Vector3(sd, 0.34, -0.12).normalize(), L = sd < 0 ? 0.7 : 0.58; P(head, cone(0.15, L, 5), GREEN, sd * 0.4 + dir.x * L / 2, 0.07 + dir.y * L / 2, -0.02 + dir.z * L / 2, 1, 1, 0.55, { q: CK.aim(dir.x, dir.y, dir.z), ol: 0.02 }); }
  for (const [x, rz, h] of [[0, 0, 0.3], [-0.17, 0.42, 0.22], [0.17, -0.42, 0.22]]) P(head, cone(0.08, h, 4), GREEN2, x, 0.38 + (x ? -0.03 : 0.02), -0.04, 1, 1, 1, { rz, ol: 0.014 });
  const face = K.face(head, { cy: 0, rx: 0.44, ry: 0.4, rz: 0.38, hs: 1.35 }, { ex: 0.125, ey: 0.0, ew: 0.07, eh: 0.1, my: -0.15, mw: 0.03 });
  for (const sd of [-1, 1]) P(head, tor(0.125, 0.021, 5, 14), RED, sd * 0.17, 0.0, 0.345, 1, 1, 0.7, { ol: false });
  P(head, box, RED, 0, 0.02, 0.37, 0.05, 0.02, 0.02, { ol: false }); K.crown(head, 0, 0.42, 0, 1); K.sparkle(root, 1.1, 0.7);
  return (m) => {
    const { amp, s, c, t, A, du } = m, sk = strike(m.u), js = Math.floor(m.T * 7), lean = Math.max(0, sk);
    root.position.set(0, abs(c) * 0.13 * amp + m.br * 0.008, lean * 0.55);
    legs[0].rotation.x = s * 1.0 * amp; legs[1].rotation.x = -s * 1.0 * amp;
    body.rotation.set(0.14 * amp + sk * 0.3, s * 0.14 * amp, hash(js + 9) * 0.05 * (1 - amp));
    m.sy = 1 + 0.07 * amp * (abs(c) - 0.5) + A * 0.05;
    // puppet-on-strings: the head and arms snap to a new pose a few times a second instead of flowing
    const tz = hash(js) * 0.2, tx = hash(js + 50) * 0.1; head.rotation.z = damp(head.rotation.z, tz, 26, m.dt); head.rotation.x = damp(head.rotation.x, tx - sk * 0.25, 26, m.dt); head.rotation.y = -s * 0.1 * amp;
    arms[0].rotation.set(s * 1.0 * amp - lean * 2.0 + hash(js + 21) * 0.2 * (1 - amp), 0, -0.4 - hash(js + 3) * 0.15); arms[1].rotation.set(-s * 1.0 * amp - lean * 2.0 + hash(js + 33) * 0.2 * (1 - amp), 0, 0.4 + hash(js + 7) * 0.15);
    arrow.rotation.z = -0.85 + sin(t * 9) * 0.08 + lean * 0.5; arrow.scale.setScalar(1 + 0.08 * sin(t * 9) + lean * 0.3 + du); cg.rotation.z = m.ph * 0.5 + t * 2;
    faceTick(face, m, 0.2 + A * 0.9 + abs(hash(js + 4)) * 0.2, 0);
  };
}

// ================================================================ 3. drowned_samurai: Unskippable Ad (tank). A walking phone screen that will not let you skip.
function bAd(K) {
  const { P, F, root } = K, RED = 0xe03050, NAVY = 0x2e3060, W = 0.98, H = 1.16, LG = 0.72, legs = [];
  for (const sd of [-1, 1]) { const g = limb(K, root, sd * 0.22, LG, 0, LG - 0.05, 0.055, 0.05, NAVY); P(g, ico(1), 0xffffff, 0, -LG + 0.04, 0.05, 0.14, 0.08, 0.2, { ol: 0.02 }); P(g, ico(0), 0xff8fb0, 0, -LG - 0.01, 0.05, 0.12, 0.03, 0.17, { ol: false }); legs.push(g); }
  const fy = LG + H / 2 - 0.02, fr = grp(root, 0, fy, 0);
  const frame = CK.geo('fb_adframe', () => { const sh = new THREE.Shape(), r = 0.15, x = -W / 2, y = -H / 2; sh.moveTo(x + r, y); sh.lineTo(x + W - r, y); sh.quadraticCurveTo(x + W, y, x + W, y + r); sh.lineTo(x + W, y + H - r); sh.quadraticCurveTo(x + W, y + H, x + W - r, y + H); sh.lineTo(x + r, y + H); sh.quadraticCurveTo(x, y + H, x, y + H - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 4 }); g.translate(0, 0, -0.06); g.deleteAttribute('uv'); return g; });
  P(fr, frame, RED, 0, 0, 0, 1, 1, 1, { ol: 0.026 });
  for (const sd of [-1, 1]) P(fr, ico(1), NAVY, sd * 0.27, H / 2 + 0.07, -0.02, 0.13, 0.07, 0.06, { ol: 0.02 });
  const sz = 0.122; F(fr, box, GH(0x1f46e8), 0, 0.02, sz - 0.01, W - 0.14, H - 0.14, 0.012);
  const rays = grp(fr, 0, 0.12, sz); for (let i = 0; i < 8; i++) { const g = grp(rays); g.rotation.z = i / 8 * TAU; F(g, box, GH(0x4a78ff), 0, 0.2, 0.004, 0.07, 0.38, 0.004); }
  const sm = grp(fr, 0, 0.12, sz + 0.02); P(sm, ico(2), 0xffa640, 0, 0, 0, 0.27, 0.27, 0.09, { ol: false });
  const face = K.face(sm, { cy: 0, rx: 0.27, ry: 0.27, rz: 0.09, hs: 0.95 }, { ex: 0.125, ey: 0.04, ew: 0.07, eh: 0.1, my: -0.14, mw: 0.05, blush: false }), mo = smile(K, face, 0.09, 0.06);
  const hand = grp(sm, 0.3, 0.12, 0.02); P(hand, ico(1), 0xffa640, 0, 0.06, 0, 0.05, 0.1, 0.04, { ol: 0.012 });
  F(fr, box, GH(0x0e1a50), 0, -0.4, sz + 0.004, 0.62, 0.045, 0.006); const bar = grp(fr, -0.31, -0.4, sz + 0.012); F(bar, box, GH(0xff4f95, 1.3), 0.5, 0, 0, 1, 0.04, 0.006); bar.scale.x = 0.62;
  P(fr, rb(0.3, 0.12, 0.05, 0.05, 1), 0x9aa0b8, 0.25, -0.28, sz + 0.02, 1, 1, 1, { ol: 0.012 }); for (const dx of [0.18, 0.26]) F(fr, spike(3), CK.basic(0x3a3f66), dx + 0.01, -0.3, sz + 0.05, 0.026, 0.04, 0.01, { rz: -PI / 2 });
  const flash = F(fr, box, G(1.6, 1.6, 1.8), 0, 0.02, sz + 0.03, W - 0.14, H - 0.14, 0.006);
  const cogs = []; for (const [cx, cy, sd] of [[-0.5, 0.58, 1], [0.5, 0.56, -1], [-0.5, -0.56, -1]]) { const c = P(fr, cog(), 0xe5a53a, cx, cy, 0.02, 1.1, 1.1, 1.3, { ol: false }); c.userData.sd = sd; cogs.push(c); }
  const arms = []; for (const sd of [-1, 1]) arms.push(limb(K, root, sd * (W / 2 + 0.1), fy + 0.25, 0, 0.46, 0.05, 0.045, NAVY, 0.085, 0xffffff));
  K.crown(fr, 0, H / 2 + 0.12, 0, 1.3); K.sparkle(root, 1.2, 0.95);
  return (m) => {
    const { amp, s, c, t, A, du } = m, sk = strike(m.u), imp = Math.pow(Math.max(0, -cos(m.ph * 2)), 4) * amp;
    legs[0].position.y = LG + Math.max(0, s) * 0.12 * amp; legs[1].position.y = LG + Math.max(0, -s) * 0.12 * amp; legs[0].rotation.x = s * 0.45 * amp; legs[1].rotation.x = -s * 0.45 * amp;
    root.position.set(0, -imp * 0.04, Math.max(0, sk) * 0.3); m.sy = 1 - imp * 0.07 + A * 0.03 - (sk > 0 ? sk * 0.08 : 0); m.sxz = 1 + imp * 0.05 + (sk > 0 ? sk * 0.06 : 0);
    fr.rotation.set(sk * 0.5 + 0.04 * amp, 0, s * 0.07 * amp + sin(t * 1.4) * 0.02); fr.position.y = fy + sin(t * 2) * 0.01;
    rays.rotation.z = t * 0.45; bar.scale.x = 0.04 + 0.58 * fract(t * 0.22); sm.position.y = 0.12 + sin(t * 3) * 0.015; hand.rotation.z = sin(t * 5) * 0.4;
    for (const g of cogs) g.rotation.z = t * 1.6 * g.userData.sd + m.ph * 0.4; vis(flash, A > 0.55 && m.u < 0.7);
    arms[0].rotation.set(-s * 0.4 * amp - Math.max(0, sk) * 1.2, 0, -0.25 - sin(t * 2) * 0.05); arms[1].rotation.set(s * 0.4 * amp - Math.max(0, sk) * 1.2, 0, 0.25 + sin(t * 2 + 1) * 0.05);
    faceTick(face, m, 0.2 + A * 0.6, 0.6); mo.scale.set(1 + A * 0.2, 0.8 + A * 0.9 + abs(sin(t * 2.6)) * 0.15, 1);
  };
}

// ================================================================ 4. nopperabo: Filter Fairy (spitter). Faceless fairy behind a ring light; a face blinks on only while she spits.
function bFairy(K) {
  const { P, F, U, root } = K, PURP = 0xa58cf0, HAIR = 0x9a80e6, PINK = 0xff9cc8, fl = grp(root, 0, 0.6, 0), bd = grp(fl), WH = CK.basic(0xf8f4ff);
  P(bd, cyl(0.15, 0.34, 0.46, 10), PINK, 0, 0.52, 0); P(bd, cyl(0.34, 0.37, 0.07, 10), 0xffc4de, 0, 0.3, 0, 1, 1, 1, { ol: 0.016 }); P(bd, ico(1), PURP, 0, 0.8, 0, 0.19, 0.18, 0.15);
  const arms = [limb(K, bd, -0.22, 0.82, 0, 0.3, 0.05, 0.045, PURP, 0.08, 0xfff4ff), limb(K, bd, 0.22, 0.82, 0, 0.3, 0.05, 0.045, PURP, 0.08, 0xfff4ff)], legs = [];
  for (const sd of [-1, 1]) { const g = limb(K, bd, sd * 0.1, 0.3, 0, 0.34, 0.06, 0.05, PURP); P(g, ico(1), 0xff5f9a, 0, -0.35, 0.03, 0.095, 0.06, 0.13, { ol: 0.016 }); legs.push(g); }
  const wand = grp(arms[0], 0, -0.4, 0.02); wand.rotation.set(-0.3, 0, 2.5); P(wand, hang(0.022, 0.022, 0.5, 5), 0xfff4e6, 0, 0.1, 0, 1, 1, 1, { ol: 0.012 }); const wt = F(wand, oct, GH(0xff5fc0, 1.5), 0, -0.42, 0, 0.09, 0.12, 0.04);
  const head = grp(bd, 0, 1.28, 0);
  P(head, ico(2), HAIR, 0, 0.0, -0.05, 0.44, 0.45, 0.4, { ol: 0.028 });
  for (const sd of [-1, 1]) { P(head, cone(0.13, 0.5, 5), HAIR, sd * 0.36, -0.3, -0.03, 1, 1, 1, { rx: PI, rz: sd * 0.1, ol: 0.016 }); P(head, ico(1), HAIR, sd * 0.27, 0.0, 0.2, 0.17, 0.33, 0.18, { ol: 0.014 }); }
  U(head, ico(1), WH, 0, -0.03, 0.15, 0.3, 0.35, 0.24, { ol: 0.018 }); for (const [x, y, h] of [[-0.14, 0.31, 0.12], [0, 0.35, 0.15], [0.14, 0.31, 0.12]]) U(head, cone(0.065, h, 4), WH, x, y, 0.2, 1, 1, 0.8, { ol: 0.012 });
  const fh = grp(head, 0, -0.03, 0.15), face = K.face(fh, { cy: 0, rx: 0.3, ry: 0.35, rz: 0.24, hs: 1.1 }, { ex: 0.13, ey: 0.03, ew: 0.07, eh: 0.1, my: -0.15, mw: 0.05 });
  F(head, oct, G(2.6, 2.0, 0.6), 0.3, 0.34, 0.14, 0.07, 0.07, 0.03);
  const ring = grp(head, -0.06, 0.1, -0.22); F(ring, tor(0.62, 0.055, 5, 22), G(1.5, 1.4, 1.9), 0, 0, 0, 1, 1, 0.8);
  const wings = []; for (const sd of [-1, 1]) for (const [y, sc, a] of [[1.0, 1, 1.0], [0.72, 0.7, 1.35]]) { const g = grp(bd, sd * 0.1, y, -0.12); P(g, ico(0), 0xaee8f8, sd * 0.24 * sc, 0.08 * sc, 0, 0.07, 0.46 * sc, 0.26 * sc, { sh: true, ol: false, rz: sd * 0.4 }); g.rotation.y = sd * a; wings.push([g, sd, a]); }
  K.crown(head, 0, 0.42, -0.04, 1); K.sparkle(fl, 0.8, 0.75);
  const droplets = [0, 1, 2].map((i) => { const g = grp(fl, 0, 1.2, 1.9); F(g, ico(1), GH(0x2ee0c8, 1.3), 0, 0, 0, 0.17 * [1, 0.6, 0.45][i]); return g; });
  return (m) => {
    const { amp, s, t, A, du, u } = m, sk = strike(u);
    fl.position.y = 0.6 + sin(t * 2.2) * 0.06 + amp * 0.05; fl.rotation.set(sk * -0.3 + 0.12 * amp, 0, s * 0.06 * amp + sin(t * 1.3) * 0.03); m.sy = 1 + A * 0.04;
    arms[0].rotation.set(-0.3 + sin(t * 3) * 0.1 - Math.max(0, sk) * 1.2, 0, -0.45 - Math.max(0, sk) * 0.3); arms[1].rotation.set(s * 0.3 * amp, 0, 0.5 + sin(t * 2 + 1) * 0.1); wand.rotation.z = 2.5 + sin(t * 4) * 0.12;
    legs[0].rotation.x = s * 0.5 * amp + sin(t * 2.2) * 0.1; legs[1].rotation.x = -s * 0.5 * amp + sin(t * 2.2 + 1) * 0.1;
    head.rotation.set(-sk * 0.2 + 0.05, 0, sin(t * 1.6) * 0.05); ring.rotation.z = t * 0.5; ring.scale.setScalar(1 + m.beat * 0.04);
    for (const [g, sd, a] of wings) g.rotation.y = sd * (a + sin(t * 24 + (a > 0.6 ? 0 : 1.5)) * 0.35 + (A > 0.1 ? 0.3 : 0));
    const show = A > 0.02 || m.hurt > 0.15 || m.du > 0 || fract(t * 0.17) < 0.045; vis(fh, show); faceTick(face, m, A * 1.3 + (m.hurt > 0.15 ? 0.6 : 0), 0.3);
    // spit: the glob swells in front of her mouth during the windup, then flies out and shrinks
    for (let i = 0; i < 3; i++) { const g = droplets[i], k = u < 0 ? -1 : (u - 0.3 - i * 0.05) / 0.7, on = u >= 0 && (u < 0.3 && i === 0 || k >= 0 && k < 1); g.visible = on; if (!on) { g.scale.setScalar(1e-4); continue; }
      if (u < 0.3) { g.position.set(0, 1.0, 0.5); g.scale.setScalar(0.2 + ease(u / 0.3) * 0.7); } else { g.position.set(0, 1.0 - k * 0.3 + (i ? sin(k * 6 + i) * 0.1 : 0), 0.5 + k * 1.7); g.scale.setScalar((1.1 - 0.5 * k) * (1 - 0.2 * i)); } }
    wt.scale.setScalar(0.09 + 0.02 * m.beat); fl.scale.setScalar(1 + (du > 0 ? du * 0.2 : 0));
  };
}

// ================================================================ 5. koi_spirit: Hug Emoji (tank). A big yellow smiley on a trail of hearts, arms up for a hug.
function bEmoji(K) {
  const { P, F, root } = K, YEL = 0xfff070, ORG = 0xffa820, NAVY = 0x1c2a78;
  const base = grp(root); P(base, cyl(0.32, 0.52, 0.2, 10), NAVY, 0, 0.1, 0, 1, 1, 1, { ol: 0.026 }); F(base, ico(1), GH(0x4a6aff, 1.4), 0, 0.2, 0, 0.34, 0.03, 0.34); F(base, heart, GH(0xff4f9a, 1.6), 0, 0.235, 0.0, 0.1, 0.1, 0.03, { rx: -PI / 2 });
  const HY = 1.42, hd = grp(root, 0, HY, 0); P(hd, ico(2), YEL, 0, 0, 0, 0.5, 0.48, 0.46, { ol: 0.034 }); P(hd, ico(1), 0xffd84d, 0, -0.34, 0.02, 0.3, 0.1, 0.3, { ol: false });
  const face = K.face(hd, { cy: 0, rx: 0.5, ry: 0.48, rz: 0.46, hs: 1.45 }, { ex: 0.11, ey: 0.08, ew: 0.065, eh: 0.095, my: -0.13, mw: 0.01, blushColor: 0xff9a7a }), mo = smile(K, face, 0.12, 0.085);
  const arms = [];
  for (const sd of [-1, 1]) { const p = grp(hd, sd * 0.46, 0.1, 0.02); P(p, hang(0.085, 0.075, 0.55, 7), ORG, 0, 0, 0, 1, 1, 1, { ol: 0.026 }); P(p, ico(1), ORG, 0, -0.59, 0, 0.11, 0.11, 0.11, { ol: 0.022 }); arms.push(p); }
  const hearts = []; for (let i = 0; i < 5; i++) hearts.push(F(root, heart, GH(0xff5aa0, 1.5), 0, 0, 0, 0.1, 0.1, 0.05));
  K.crown(hd, 0, 0.46, 0, 1.2); K.sparkle(hd, 0.1, 0.75);
  return (m) => {
    const { amp, s, c, t, A, du } = m, sk = strike(m.u), pulse = Math.pow(Math.max(0, cos(m.ph * 2)), 3) * amp;
    hd.position.set(sin(m.ph) * 0.07 * amp, HY + sin(t * 1.8) * 0.05 + abs(s) * 0.06 * amp - Math.max(0, sk) * 0.25, Math.max(0, sk) * 0.35); hd.rotation.set(sk * 0.12, 0, s * 0.1 * amp + sin(t * 1.2) * 0.03);
    hd.scale.set(1 + pulse * 0.05 + A * 0.12, 1 - pulse * 0.06 - A * 0.12, 1 + pulse * 0.05 + A * 0.12); base.scale.set(1 + pulse * 0.06, 1 - pulse * 0.1, 1 + pulse * 0.06); base.position.x = hd.position.x * 0.2; base.rotation.z = -s * 0.04 * amp;
    for (let i = 0; i < 2; i++) { const sd = i ? 1 : -1, hug = Math.max(0, sk), w = sin(t * 3 + i * 1.7) * 0.18 * (1 - hug); arms[i].rotation.set(hug * 1.3, 0, sd * (2.5 + w - hug * 1.5)); }
    const top = hd.position.y - 0.46, bot = 0.32, span = top - bot;
    for (let i = 0; i < hearts.length; i++) { const f = fract(i / hearts.length + t * 0.22), h = hearts[i], q = sin(f * PI), k = 0.15 * (0.3 + q) * (1 + m.beat * 0.25);
      if (du >= 0.75) { vis(h, false); continue; } h.visible = true; h.position.set(sin(f * 9 + t * 2 + i) * 0.14 * (0.3 + f) + hd.position.x * f, bot + f * span, cos(f * 9 + t * 2) * 0.06); h.scale.set(k, k, 0.07); h.rotation.z = sin(f * 7 + i) * 0.4; }
    faceTick(face, m, 0, 0); face.mouth.scale.set(1, 1, 1); mo.scale.set(1 + A * 0.2, 0.85 + A * 0.9 + m.sing * 0.3 + abs(sin(t * 2)) * 0.1, 1);
  };
}

// ================================================================ 6. tsukumogami: Notification Imp (fast). A red cyclops ball with a bell, a belly screen and a badge that never reads zero.
function bImp(K) {
  const { P, F, root } = K, RED = 0xee3c58, NAVY = 0x24244a, legs = [];
  for (const sd of [-1, 1]) { const g = limb(K, root, sd * 0.2, 0.62, 0, 0.58, 0.055, 0.05, NAVY); P(g, ico(1), 0xff6a8a, 0, -0.6, 0.06, 0.15, 0.1, 0.21, { ol: 0.02 }); legs.push(g); }
  const body = grp(root, 0, 0.62, 0); P(body, ico(2), RED, 0, 0.5, 0, 0.58, 0.55, 0.55, { ol: 0.032 }); P(body, ico(1), 0xff8aa4, -0.2, 0.78, 0.22, 0.15, 0.1, 0.1, { ol: false, rz: 0.6 });
  const arms = []; for (const sd of [-1, 1]) arms.push(limb(K, body, sd * 0.56, 0.5, 0, 0.42, 0.045, 0.04, NAVY, 0.1, 0xffffff));
  const ey = grp(body, 0, 0.66, 0.5); F(ey, ico(2), CK.basic(0xffffff), 0, 0, 0, 0.26, 0.28, 0.11); F(ey, ico(1), CK.basic(0x3b6fe0), 0, -0.04, 0.07, 0.17, 0.18, 0.06); F(ey, ico(0), CK.basic(0x1b2a6a), 0, -0.05, 0.11, 0.09, 0.1, 0.05); F(ey, ico(0), CK.basic(0xffffff), 0.06, 0.03, 0.14, 0.05, 0.05, 0.03);
  const lid = grp(ey, 0, 0.0, 0.06); P(lid, dome(12), RED, 0, 0, 0, 0.285, 0.31, 0.15, { ol: 0.016, rz: 0.1 }); const brow = F(ey, box, CK.basic(0x7a1a34), -0.06, 0.3, 0.1, 0.34, 0.035, 0.04, { rz: -0.28 });
  P(body, rb(0.5, 0.34, 0.08, 0.08, 1), NAVY, 0, 0.1, 0.44, 1, 1, 1, { ol: 0.014 }); F(body, box, GH(0x1d44e6), 0, 0.1, 0.49, 0.42, 0.26, 0.01);
  const dg = CK.geo('fb_digit4', () => compose([[box, 0.03, 0, 0, 0.026, 0.15, 0.01], [box, -0.035, 0.035, 0, 0.026, 0.085, 0.01], [box, -0.002, -0.018, 0, 0.1, 0.026, 0.01], [box, -0.012, 0.045, 0, 0.026, 0.1, 0.01, 0, 0, 0.5]]));
  const digit = F(body, dg, G(1.8, 1.8, 2), 0, 0.1, 0.5, 1.7, 1.7, 1.7);
  const bell = grp(body, -0.12, 1.0, 0); bell.rotation.z = 0.2; P(bell, CK.geo('fb_bell', () => { const g = latheGeo([[0, 0], [0.24, 0], [0.235, 0.07], [0.19, 0.25], [0.12, 0.38], [0.07, 0.45], [0, 0.47]], 12); g.deleteAttribute('uv'); return g; }), 0xffe066, 0, 0, 0, 1, 1, 1, { sh: true, ol: 0.022 });
  P(bell, ico(1), 0xffe066, 0, 0.5, 0, 0.065, 0.065, 0.065, { sh: true, ol: 0.014 }); const clap = grp(bell, 0, -0.02, 0); P(clap, ico(1), 0xc88a2a, 0, -0.04, 0, 0.07, 0.07, 0.07, { ol: 0.012 });
  K.crown(body, 0.14, 1.06, 0, 1); K.sparkle(root, 1.2, 0.8);
  return (m) => {
    const { amp, s, c, t, A, du } = m, sk = strike(m.u), lean = Math.max(0, sk), buzz = 0.012 + amp * 0.012 + A * 0.02;
    root.position.set(sin(m.T * 61) * buzz, abs(c) * 0.16 * amp + abs(sin(t * 7)) * 0.03 + 0.0, lean * 0.6 + cos(m.T * 53) * buzz * 0.5);
    legs[0].rotation.x = s * 1.1 * amp; legs[1].rotation.x = -s * 1.1 * amp; body.rotation.set(0.18 * amp + sk * 0.3, s * 0.1 * amp, sin(m.T * 47) * 0.02 + sin(t * 1.5) * 0.03);
    m.sy = 1 + 0.08 * amp * (abs(c) - 0.5) + A * 0.06; m.sxz = 1 - 0.04 * amp * (abs(c) - 0.5) - A * 0.03;
    arms[0].rotation.set(s * 0.8 * amp - lean * 1.4, 0, -0.7 - sin(t * 3) * 0.1); arms[1].rotation.set(-s * 0.8 * amp - lean * 1.4, 0, 0.7 + sin(t * 3 + 1) * 0.1);
    bell.rotation.z = 0.2 + sin(m.T * 40) * (0.08 + A * 0.25 + amp * 0.1) + m.beat * 0.2; clap.rotation.z = -sin(m.T * 40) * 0.6;
    lid.position.y = lerp(0.1 - A * 0.12, -0.3, m.bl); lid.rotation.z = 0.12; digit.scale.setScalar(1.7 * (1 + m.beat * 0.25)); ey.scale.setScalar(1 + A * 0.12); brow.position.y = 0.3 - A * 0.05;
  };
}

// ================================================================ 7. ittan_momen: Phone Charger (tank). A white charging cable that wiggles to the beat, battery band on its belly.
function bCable(K) {
  const { P, F, root } = K, N = 5, LEN = 0.26, WHT = 0xf4f0ff, JT = 0xdcd6f6, METAL = 0xb4bcd2, segs = [];
  const base = grp(root, 0, 0.14, 0); P(base, cyl(0.1, 0.13, 0.16, 8), METAL, 0, -0.07, 0, 1, 1, 1, { ol: 0.02 });
  let par = base;
  for (let i = 0; i < N; i++) { const g = grp(par, 0, i ? LEN : 0, 0); P(g, ico(1), JT, 0, 0, 0, 0.165, 0.15, 0.165, { ol: 0.02 }); P(g, cyl(0.16, 0.165, LEN, 9), WHT, 0, LEN / 2, 0, 1, 1, 1, { ol: 0.024 }); segs.push(g); par = g; }
  const band = grp(segs[1], 0, LEN * 0.55, 0); P(band, cyl(0.2, 0.2, 0.3, 10), 0x2c4fd0, 0, 0, 0, 1, 1, 1, { ol: 0.022 }); F(band, box, GH(0x8ab4ff), 0, 0, 0.195, 0.17, 0.26, 0.012); F(band, box, GH(0x5a7acc), 0, 0.15, 0.195, 0.07, 0.035, 0.012);
  const gfill = F(band, box, GH(0x2fe05a, 1.2), 0, -0.07, 0.205, 0.1, 0.1, 0.012), rfill = F(band, box, GH(0xff3050, 1.4), 0, -0.07, 0.205, 0.1, 0.1, 0.012);
  const hd = grp(par, 0, LEN, 0); P(hd, cyl(0.17, 0.17, 0.12, 8), METAL, 0, 0.04, 0, 1, 1, 1, { ol: 0.02 }); P(hd, ico(2), 0xffffff, 0, 0.42, 0, 0.42, 0.38, 0.36, { ol: 0.03 });
  const prongs = []; for (const sd of [-1, 1]) { const g = grp(hd, sd * 0.15, 0.74, 0); P(g, rb(0.1, 0.34, 0.08, 0.04, 1), METAL, 0, 0.14, 0, 1, 1, 1, { ol: 0.02 }); prongs.push(g); }
  const face = K.face(hd, { cy: 0.42, rx: 0.42, ry: 0.38, rz: 0.36, hs: 1.3 }, { ex: 0.125, ey: -0.01, ew: 0.07, eh: 0.1, my: -0.15, mw: 0.03, blushColor: 0xffa0c0 });
  K.crown(hd, 0, 0.88, 0, 1.1); K.sparkle(root, 1.0, 0.8);
  const rest = [-0.2, 0.36, 0.3, -0.36, -0.22];
  return (m) => {
    const { amp, s, t, A, du } = m, sk = strike(m.u), bt = m.beat;
    for (let i = 0; i < N; i++) segs[i].rotation.set(sk * 0.34 + 0.02, 0, rest[i] + sin(m.ph - i * 0.95) * 0.3 * amp + sin(t * 1.6 - i * 0.8) * 0.07 + bt * sin(i * 1.7 + 1) * 0.1);
    root.position.set(0, abs(sin(m.ph * 0.5)) * 0.06 * amp, Math.max(0, sk) * 0.35); m.sy = 1 + A * 0.05 - 0.04 * amp * abs(s); m.sxz = 1 - A * 0.04;
    hd.rotation.set(-sk * 0.15, sin(t * 1.4) * 0.08, sin(t * 3) * 0.04 + bt * 0.12 * sin(t * 2));
    for (let i = 0; i < 2; i++) prongs[i].rotation.z = (i ? 1 : -1) * (0.06 + 0.18 * bt) + sin(t * 3 + i) * 0.03 + (A > 0.2 ? (i ? 0.2 : -0.2) : 0);
    const low = m.hurt > 0.15 || A > 0.1, ch = 0.5 + 0.5 * abs(sin(t * 1.6)); gfill.scale.set(low ? 1e-4 : 0.1, 0.1 * ch, 0.012); gfill.position.y = -0.12 + 0.05 * ch; rfill.scale.set(low ? 0.1 : 1e-4, 0.1, 0.012);
    faceTick(face, m, A * 1.0 + 0.1, 0.2);
  };
}

// ================================================================ 8. silk_weaver: Algo Rhythm (spitter). A bell-headed teal spider that rears back and spits silk.
function bSpider(K) {
  const { P, F, root } = K, TEAL = 0x45d0c0, LEG = 0x3ab8d8, bodyG = grp(root, 0, 0.78, 0), legs = [];
  P(bodyG, ico(2), TEAL, 0, 0, 0, 0.64, 0.42, 0.55, { ol: 0.03 }); P(bodyG, ico(1), 0x7aeadc, -0.2, 0.2, 0.25, 0.18, 0.08, 0.14, { ol: false, rz: 0.4 });
  P(bodyG, rb(0.4, 0.26, 0.07, 0.07, 1), 0x24306a, 0, -0.04, 0.5, 1, 1, 1, { ol: 0.014 }); F(bodyG, box, G(0.3, 0.55, 1.6), 0, -0.04, 0.54, 0.34, 0.2, 0.01); F(bodyG, heart, G(2.4, 0.6, 1.1), 0, -0.04, 0.55, 0.06, 0.06, 0.012);
  for (const sd of [-1, 1]) P(bodyG, cone(0.035, 0.15, 4), 0x2a98b8, sd * 0.17, -0.2, 0.5, 1, 1, 1, { rz: 0.3 * sd, rx: -2.4, ol: false }); // little fangs under the screen
  const tail = grp(bodyG, 0.5, 0.0, -0.2); P(tail, tor(0.34, 0.032, 4, 14, PI * 1.1), LEG, 0, 0, 0, 1, 1, 1, { ol: false, rz: 1.0 });
  const FAN = [0.78, 0.28, -0.28, -0.78], uA = 1.85, lA = 0.32, UL = 0.44, LL = 0.88;
  for (const sd of [-1, 1]) FAN.forEach((f, i) => { const hip = grp(bodyG, sd * 0.4, -0.04, f * 0.28); hip.rotation.y = sd > 0 ? -f : PI + f; const up = grp(hip); P(up, hang(0.05, 0.04, UL, 5), LEG, 0, 0, 0, 1, 1, 1, { ol: 0.016 }); up.rotation.z = uA;
    const lo = grp(up, 0, -UL, 0); P(lo, hang(0.04, 0.03, LL, 5), LEG, 0, 0, 0, 1, 1, 1, { ol: 0.016 }); P(lo, ico(0), 0xffffff, 0, -LL, 0, 0.07, 0.07, 0.07, { ol: 0.014 }); lo.rotation.z = lA - uA; legs.push({ hip, up, lo, f, sd, i, y0: hip.rotation.y }); });
  const bell = grp(bodyG, 0, 0.3, 0.0), BG = CK.geo('fb_bell2', () => { const g = latheGeo([[0, 0], [0.4, 0], [0.4, 0.05], [0.36, 0.2], [0.27, 0.45], [0.2, 0.62], [0.12, 0.7], [0, 0.72]], 14); g.deleteAttribute('uv'); return g; });
  P(bell, BG, 0xf0b13a, 0, 0, 0, 1, 1, 1, { ol: 0.03 }); P(bell, ico(1), 0xc8841e, 0, 0.74, 0, 0.1, 0.09, 0.1, { ol: 0.018 });
  const face = K.face(bell, { cy: 0.38, rx: 0.32, ry: 0.4, rz: 0.3, hs: 1.2 }, { ex: 0.12, ey: 0.07, ew: 0.07, eh: 0.1, my: -0.2, mw: 0.01, blushColor: 0xff9a7a });
  const nose = grp(bell, 0, 0.31, 0.34); F(nose, box, CK.basic(0xfff0c8), 0, -0.1, -0.01, 0.045, 0.2, 0.04); const nb = P(nose, ico(1), 0xff4a5a, 0, 0.03, 0.0, 0.07, 0.07, 0.07, { ol: 0.014 });
  K.crown(bell, 0, 0.78, 0, 1.15); K.sparkle(root, 1.1, 0.9);
  const glob = grp(root, 0, 1.2, 1.9), drops = [glob, grp(root, 0, 1.2, 1.9), grp(root, 0, 1.2, 1.9)], sc = [1, 0.6, 0.45]; drops.forEach((g, i) => F(g, ico(1), GH(0xe8f4ff, 1.2), 0, 0, 0, 0.17 * sc[i]));
  return (m) => {
    const { amp, s, t, A, du, u } = m, sk = strike(u);
    bodyG.position.set(0, 0.78 + abs(sin(m.ph * 2)) * 0.05 * amp + sin(t * 2) * 0.012 - Math.max(0, -sk) * 0.05, Math.max(0, sk) * 0.2); bodyG.rotation.set(sk * 0.3 + 0.05 * amp, 0, s * 0.05 * amp);
    bell.rotation.set(-sk * 0.35, sin(t * 1.3) * 0.08, sin(t * 1.7) * 0.04); m.sy = 1 + A * 0.05; tail.rotation.z = sin(t * 2.2) * 0.12; tail.rotation.y = sin(t * 1.4) * 0.15;
    for (const L of legs) { const ph = m.ph + (L.i % 2 ? PI : 0) + (L.sd > 0 ? PI * 0.5 : 0), lift = Math.max(0, sin(ph)) * 0.55 * amp, crouch = Math.max(0, -sk) * 0.25 - Math.max(0, sk) * 0.1;
      L.up.rotation.z = uA - lift * 0.5 + crouch + sin(t * 3 + L.i * 1.3 + L.sd) * 0.025; L.lo.rotation.z = lA - uA + lift * 0.9 - crouch * 0.6; L.hip.rotation.y = L.y0 + sin(ph + 1.5) * 0.18 * amp * (L.sd > 0 ? -1 : 1); }
    nb.scale.setScalar(0.07 * (1 + A * 0.5 + m.beat * 0.2)); nose.position.z = 0.34 + A * 0.04;
    faceTick(face, m, 0.1 + A * 0.6, 0);
    for (let i = 0; i < 3; i++) { const g = drops[i], k = u < 0 ? -1 : (u - 0.32 - i * 0.05) / 0.68; const on = u >= 0 && (u < 0.32 && i === 0 || k >= 0 && k < 1); g.visible = on; if (!on) { g.scale.setScalar(1e-4); continue; } if (u < 0.32) { g.position.set(0, 1.4, 0.5); g.scale.setScalar(0.2 + ease(u / 0.32) * 0.8); } else { g.position.set((i ? hash(i * 5) * 0.2 * k : 0), 1.4 - k * 0.9 + (i ? sin(k * 6 + i) * 0.1 : 0), 0.5 + k * 1.7); g.scale.setScalar((1.0 - 0.45 * k) * (1 - 0.2 * i)); } }
  };
}

// ================================================================ 9. boss_jorogumo: Scrollspinner. A selfie-taking influencer in a galaxy gown over spider legs, ring light, comment bubbles and silk cables.
function bBoss(K) {
  const { P, F, root } = K, IND = 0x3b2a98, GOLD = 0xf6c537, YEL = 0xffd34a, SKIN = 0xffd9c0, HAIRC = 0x2b2080;
  const skirt = grp(root), legs = [];
  const SK = CK.geo('fb_gown', () => { const g = latheGeo([[1.5, 0.14], [1.38, 0.38], [1.1, 0.8], [0.78, 1.35], [0.5, 1.9], [0.36, 2.2], [0.02, 2.25]], 16); g.deleteAttribute('uv'); return g; });
  P(skirt, SK, IND, 0, 0, 0, 1, 1, 1, { ol: 0.04 }); const prof = [[2.2, 0.36], [1.9, 0.5], [1.35, 0.78], [0.8, 1.1], [0.38, 1.38]];
  const stars = CK.geo('fb_stars', () => { const r = CK.rng(7), l = []; for (let i = 0; i < 34; i++) { const k = r() * 3.6, j = Math.min(3, Math.floor(k)), f = k - j, y = lerp(prof[j][0], prof[j + 1][0], f), rr = lerp(prof[j][1], prof[j + 1][1], f) + 0.01, a = r() * TAU, s = 0.03 + r() * 0.045; l.push([oct, cos(a) * rr, y, sin(a) * rr, s, s * 1.4, s, 0, -a, 0]); } return compose(l); });
  F(skirt, stars, G(1.7, 1.7, 2.2), 0, 0, 0, 1, 1, 1);
  P(skirt, tor(1.46, 0.07, 6, 28), 0xfff0e0, 0, 0.14, 0, 1, 1, 1, { rx: PI / 2, ol: 0.02 }); P(skirt, tor(1.3, 0.04, 5, 28), GOLD, 0, 0.5, 0, 1, 1, 1, { rx: PI / 2, ol: 0.012, sh: true });
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8, hip = grp(root, cos(a) * 1.1, 0.46, sin(a) * 1.1); hip.rotation.y = -a; const up = grp(hip); P(up, hang(0.13, 0.095, 0.6, 6), GOLD, 0, 0, 0, 1, 1, 1, { ol: 0.028, sh: true }); up.rotation.z = 1.95;
    const lo = grp(up, 0, -0.6, 0); P(lo, hang(0.095, 0.02, 0.85, 6), GOLD, 0, 0, 0, 1, 1, 1, { ol: 0.026, sh: true }); P(lo, ico(0), 0x5a3aa8, 0, 0.0, 0, 0.13, 0.13, 0.13, { ol: 0.016 }); lo.rotation.z = 0.3 - 1.95; legs.push({ hip, up, lo, i, a }); }
  const tor_ = grp(root, 0, 2.1, 0); P(tor_, ico(2), YEL, 0, 0.32, 0, 0.42, 0.42, 0.34, { ol: 0.03 }); P(tor_, tor(0.34, 0.07, 6, 16), 0xff5fa0, 0, 0.0, 0, 1, 1, 0.9, { rx: PI / 2, ol: 0.018 }); P(tor_, tor(0.2, 0.05, 5, 14), 0xfff0e0, 0, 0.66, 0.02, 1, 1, 1, { rx: PI / 2, ol: 0.014 });
  const hd = grp(tor_, 0, 1.28, 0);
  P(hd, ico(2), HAIRC, 0, 0.04, -0.1, 0.62, 0.6, 0.55, { ol: 0.034 }); P(hd, ico(2), SKIN, 0, -0.04, 0.1, 0.5, 0.5, 0.44, { ol: 0.024 });
  for (const [x, y, z, sx, sy] of [[-0.3, 0.3, 0.38, 0.22, 0.2], [0.0, 0.42, 0.4, 0.22, 0.17], [0.3, 0.3, 0.38, 0.22, 0.2]]) P(hd, ico(1), HAIRC, x, y, z, sx, sy, 0.16, { ol: 0.016 });
  P(hd, ico(1), 0x4a3ab0, 0, 0.7, -0.1, 0.24, 0.22, 0.24, { ol: 0.022 }); P(hd, cone(0.19, 0.75, 6), 0x5a3ac0, 0.32, 0.74, -0.08, 1, 1, 1, { q: CK.aim(1, 0.7, 0), ol: 0.022 });
  const fh = grp(hd, 0, -0.04, 0.1), face = K.face(fh, { cy: 0, rx: 0.5, ry: 0.5, rz: 0.44, hs: 1.55 }, { iris: 0x5a4ae0, ex: 0.125, ey: 0.0, ew: 0.075, eh: 0.105, my: -0.14, mw: 0.03 });
  const ring = grp(hd, -0.04, 0.06, -0.5); F(ring, tor(0.88, 0.07, 5, 26), G(1.5, 1.45, 2.0), 0, 0, 0);
  const sh = grp(tor_, 0.4, 0.6, 0), sl = limb(K, sh, 0, 0, 0, 0.6, 0.14, 0.1, IND, 0.13, SKIN), phone = grp(sl, 0, -0.78, 0.04); P(phone, rb(0.3, 0.52, 0.06, 0.06, 1), YEL, 0, 0.04, 0, 1, 1, 1, { ol: 0.02 }); const scr = F(phone, box, GH(0xcfe4ff, 1.3), 0, 0.05, 0.034, 0.25, 0.42, 0.01), lens = F(phone, ico(0), CK.basic(0x2b1426), 0.07, 0.24, -0.04, 0.03, 0.03, 0.02), pop = F(phone, ico(1), G(3, 3, 3.4), 0, 0.1, 0.08, 0.3); // camera flash
  const lh = grp(tor_, -0.4, 0.6, 0), la = limb(K, lh, 0, 0, 0, 0.62, 0.14, 0.1, IND, 0.13, SKIN);
  const cables = [], cg = grp(root, 0, 2.3, -0.3), curveG = (dir, k) => CK.geo(`fb_cab${dir},${k}`, () => { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(dir * 0.9, 0.05 - k * 0.2, 0.1), new THREE.Vector3(dir * 1.7, 0.35 + k * 0.3, 0.0), new THREE.Vector3(dir * 2.4, 0.7 + k * 0.5, -0.1)]); const g = new THREE.TubeGeometry(c, 8, 0.04, 4); g.deleteAttribute('uv'); return g; });
  for (const sd of [-1, 1]) for (const [k, y] of [[-0.5, 0.2], [0.1, -0.45], [0.7, -1.05]]) { const g = grp(cg, 0, y, 0); P(g, curveG(sd, k), 0x3ad0d8, 0, 0, 0, 1, 1, 1, { ol: false }); cables.push([g, sd, k]); }
  const bubs = []; for (const [x, y, z] of [[-1.5, 3.7, 0.4], [1.7, 3.9, 0.1], [-1.1, 2.7, 0.9]]) { const g = grp(root, x, y, z); K.U(g, box, CK.basic(0xffffff), 0, 0, 0, 0.46, 0.32, 0.06, { ol: 0.012 }); F(g, heart, GH(0xff4f9a, 1.4), 0, 0.0, 0.045, 0.075, 0.075, 0.02); K.U(g, cone(0.06, 0.12, 4), CK.basic(0xffffff), -0.12, -0.19, 0, 1, 1, 0.4, { rx: PI, ol: 0.01 }); bubs.push([g, x, y, z]); }
  const sps = []; for (let i = 0; i < 6; i++) sps.push(F(root, oct, G(2.8, 2.2, 0.7), 0, 0, 0, 0.09, 0.14, 0.025));
  K.crown(hd, 0, 0.86, -0.06, 1.7); K.sparkle(root, 2.2, 1.3, 5);
  return (m) => {
    const { amp, s, c, t, A, du, u } = m, sk = strike(u), lean = Math.max(0, sk);
    root.position.set(0, abs(sin(m.ph)) * 0.05 * amp, lean * 0.6); m.sy = 1 + A * 0.03; skirt.rotation.set(0, 0, s * 0.04 * amp + sin(t * 1.2) * 0.012); skirt.rotation.y = sk < 0 ? 0 : sk * 0.0 + (A > 0.1 ? t * 8 * A : 0); skirt.scale.set(1 + m.br * 0.008 + A * 0.04, 1, 1 + m.br * 0.008 + A * 0.04);
    tor_.position.y = 2.1 + sin(t * 2.4) * 0.03; tor_.rotation.set(sk * 0.2, 0, sin(t * 1.6) * 0.03 + s * 0.03 * amp); hd.rotation.set(-sk * 0.15, sin(t * 1.1) * 0.1, sin(t * 1.9) * 0.06 + 0.05);
    sh.rotation.set(0.35 + lean * 0.3, 0, 2.55 + sin(t * 2) * 0.07 - lean * 0.2); phone.rotation.set(0, 0, -2.4 + sin(t * 3) * 0.06); scr.scale.set(0.25 * (1 + A * 0.2), 0.42 * (1 + A * 0.2), 0.01); pop.scale.setScalar(A > 0.35 && lean > 0.2 ? 0.5 * A : 1e-4);
    lh.rotation.set(sin(t * 1.5) * 0.1, 0, -0.45 - Math.max(0, sin(t * 2.4)) * 0.35 - lean * 0.8);
    ring.rotation.z = t * 0.4; ring.scale.setScalar(1 + m.beat * 0.05 + A * 0.1);
    for (const L of legs) { const ph = m.ph * 1.0 + L.i * PI * 0.5 + (L.i % 2 ? PI : 0), lift = Math.max(0, sin(ph)) * 0.45 * amp, st2 = Math.max(0, sk) * 0.35;
      L.up.rotation.z = 1.95 - lift * 0.6 - st2 + sin(t * 2.5 + L.i) * 0.03; L.lo.rotation.z = 0.3 - 1.95 + lift * 1.0 + st2 * 0.5; L.hip.rotation.y = -L.a + sin(ph + 1.5) * 0.1 * amp; }
    for (const [g, sd, k] of cables) { g.rotation.set(0, sd * (0.15 * sin(t * 1.4 + k * 3) + lean * 0.35), sd * (sin(t * 1.8 + k * 2) * 0.08 + lean * 0.12)); g.scale.setScalar(1 + lean * 0.15); }
    for (let i = 0; i < bubs.length; i++) { const [g, x, y, z] = bubs[i]; g.position.set(x + sin(t * 0.9 + i * 2) * 0.12, y + sin(t * 1.4 + i) * 0.12, z); g.scale.setScalar(du > 0 ? Math.max(0, 1 - du * 3) : 1 + m.beat * 0.05); g.rotation.z = sin(t + i) * 0.1; }
    for (let i = 0; i < sps.length; i++) { const a = t * 0.8 + i / sps.length * TAU, r = 1.9 + sin(t + i) * 0.15 + du * 2; sps[i].position.set(cos(a) * r, 1.0 + (i % 3) * 0.9 + sin(t * 2 + i) * 0.1, sin(a) * r * 0.7); sps[i].rotation.y = t * 2 + i; sps[i].scale.setScalar(0.09 * (0.6 + abs(sin(t * 4 + i)))); }
    faceTick(face, m, 0.1 + A * 0.7 + m.sing * 0.2, 0.3);
  };
}

// ---------------------------------------------------------------- exports
export const FOES_B = {
  chochin: (o) => rig('chochin', o, { atk: 0.55, rate: 11, h: 2.1, seed: 1, build: bChochin }),
  karakuri_puppet: (o) => rig('karakuri_puppet', o, { atk: 0.45, rate: 19, h: 1.95, seed: 2, build: bPuppet }),
  drowned_samurai: (o) => rig('drowned_samurai', o, { atk: 0.75, rate: 6, h: 2.1, seed: 3, build: bAd }),
  nopperabo: (o) => rig('nopperabo', o, { atk: 0.7, rate: 7, h: 2.0, seed: 4, build: bFairy }),
  koi_spirit: (o) => rig('koi_spirit', o, { atk: 0.7, rate: 5, h: 2.15, seed: 5, build: bEmoji }),
  tsukumogami: (o) => rig('tsukumogami', o, { atk: 0.42, rate: 20, h: 1.9, seed: 6, build: bImp }),
  ittan_momen: (o) => rig('ittan_momen', o, { atk: 0.8, rate: 5, h: 2.1, seed: 7, build: bCable }),
  silk_weaver: (o) => rig('silk_weaver', o, { atk: 0.7, rate: 9, h: 1.85, seed: 8, build: bSpider }),
  boss_jorogumo: (o) => rig('boss_jorogumo', o, { atk: 0.9, rate: 6, h: 4.1, seed: 9, rad: 1.6, build: bBoss }),
};
