// Neon Row shared kit (W-STREET): the geometry stores, materials, decal helpers and the open/closed "sections" every street module writes into.
// Everything static goes into five Buf stores that street.js turns into five merged meshes:
//   B     solid vertex-coloured, flat shaded, casts shadows          GLOW  night emissive (windows, neon tubes, lamp heads), colours may exceed 1
//   DEC   lit decals (graffiti, notices, posters, the map board)     SIGN  self-lit decals (neon signs), emissive at night
//   FX    additive halos and puddle streaks (texture: glow atlas)    PUD   dark puddle discs (alpha vertex colours)
// A SECTION is a named range of vertices inside those stores. sections let one door show an OPEN look (lit window, neon on) or a CLOSED look
// (dark window, red sign, padlock plate) by collapsing or restoring that range of vertices, with no extra draw calls.
import { THREE, rng } from './kit.js';
import { Buf, col, mix, mul } from './flat_kit.js';
import { makeCollider } from './terrain_util.js';
export { Buf, col, mix, mul };

export const Z0 = -3.6; // the building line: every facade's front plane
export const SIDE_TOP = 0.14; // height of the sidewalk above the road

export const NEON = { pink: [3.2, 0.5, 1.6], cyan: [0.5, 2.6, 3.0], yellow: [3.2, 2.5, 0.5], green: [1.0, 2.8, 0.8], red: [3.2, 0.45, 0.4], violet: [1.9, 0.9, 3.4], warm: [3.0, 2.0, 0.85], white: [2.8, 2.5, 2.2], orange: [3.2, 1.5, 0.4] };
export const WINCOL = [[3.0, 2.0, 0.8], [3.2, 1.7, 0.7], [2.8, 2.2, 1.2], [3.2, 1.2, 0.8], [2.2, 2.4, 3.0], [3.0, 1.0, 1.9]].map((c) => [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72]);

export const PAL = {
  ink: col('#2b2438'), inkL: col('#3f3857'), steel: col('#8d8aa8'), steelD: col('#5e5a7a'), iron: col('#3a3550'), stone: col('#b9afb8'), stoneD: col('#8d8397'),
  brick: [col('#b5573f'), col('#a64c3b'), col('#9a4638'), col('#c26a4a')], mortar: col('#d9b79e'), cream: col('#efe1c4'), creamD: col('#cdb99a'),
  wood: col('#a8693b'), woodD: col('#7a4a32'), teal: col('#2ec4b6'), tealD: col('#217a78'), plum: col('#8f5a98'), plumD: col('#683f7c'), pinkC: col('#ff4f8b'), yellowC: col('#ffd23f'),
  glassD: col('#2c3358'), glassL: col('#55639a'), asphalt: col('#4a4262'), asphaltD: col('#3d3654'), curb: col('#cbbba8'), paving: [col('#cdb2a0'), col('#c3a894'), col('#d6bcaa')], leaf: [col('#3f9b5a'), col('#58b667'), col('#2f7d4e'), col('#7ac96c')],
};

export function makeStore() {
  const S = {
    B: new Buf({ rng: rng(201) }), GLOW: new Buf({ rng: rng(202) }), DEC: new Buf({ uv: true }), SIGN: new Buf({ uv: true }), FX: new Buf({ uv: true }), FXP: new Buf({ uv: true }), PUD: new Buf({ alpha: true }), BF: new Buf({ rng: rng(203) }),
    hit: makeCollider(), R: rng(77), atlas: null, sections: {}, lamps: [], lights: [], neons: [], reflect: [],
  };
  S.bufs = [S.B, S.GLOW, S.DEC, S.SIGN, S.FX, S.FXP, S.PUD, S.BF]; S.names = ['B', 'GLOW', 'DEC', 'SIGN', 'FX', 'FXP', 'PUD', 'BF'];
  // record every vertex the callback adds to any store under `name` (several calls with one name accumulate)
  S.section = (name, fn) => {
    const a = S.bufs.map((b) => b.p.length / 3); fn(S);
    const ranges = (S.sections[name] = S.sections[name] || []);
    S.bufs.forEach((b, i) => { const e = b.p.length / 3; if (e > a[i]) ranges.push({ store: S.names[i], a: a[i], b: e }); });
  };
  // textured quad from the atlas: centred (cx, cy, cz), facing +z (rotated by ry about its own centre, rx tilts it back), w x h metres. tint = colour multiplier.
  S.sprite = (buf, name, cx, cy, cz, w, h, ry, tint, rx) => {
    const r = S.atlas.rect[name]; if (!r) return; buf.push(cx, cy, cz, ry || 0, 1, rx || 0, 0);
    buf.uquad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], r[0], r[1], r[2], r[3], tint || [1, 1, 1]); buf.pop();
  };
  S.dec = (name, cx, cy, cz, w, h, ry, tint, rx) => S.sprite(S.DEC, name, cx, cy, cz, w, h, ry, tint, rx);
  S.sign = (name, cx, cy, cz, w, h, ry, tint, rx) => S.sprite(S.SIGN, name, cx, cy, cz, w, h, ry, tint, rx);
  // additive halo: round glow facing +z (ry turns it) or lying on the ground (flat = true). colour = [r,g,b] (additive strength)
  S.halo = (cx, cy, cz, w, h, color, o) => {
    o = o || {}; const r = o.streak ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1], fx = S.FX; color = [color[0] * 0.46, color[1] * 0.46, color[2] * 0.46];
    if (o.flat) { fx.push(cx, cy, cz, o.ry || 0, 1, 0, 0); fx.uquad([-w / 2, 0, h / 2], [w / 2, 0, h / 2], [w / 2, 0, -h / 2], [-w / 2, 0, -h / 2], r[0], r[1], r[2], r[3], color); fx.pop(); }
    else { fx.push(cx, cy, cz, o.ry || 0, 1, 0, 0); fx.uquad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], r[0], r[1], r[2], r[3], color); fx.pop(); }
  };
  // puddle reflection of a neon sign: a tall soft streak lying on the ground (FXP store = its own mesh, brightness follows rain and night)
  S.streak = (cx, cz, w, d, color, y) => { const fx = S.FXP, r = [0.5, 0, 1, 1]; fx.push(cx, y === undefined ? SIDE_TOP + 0.02 : y, cz, 0, 1, 0, 0); fx.uquad([-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], r[0], r[1], r[2], r[3], color); fx.pop(); };
  // a soft dark puddle disc on the ground (alpha vertex colours: opaque centre, clear rim)
  S.puddle = (x, z, rx, rz, a, ry, y) => {
    const buf = S.PUD, seg = 14, cl = col('#1a1033'), c0 = cl.concat([a]), c1 = cl.concat([a * 0.7]), c2 = cl.concat([0]), cs = Math.cos(ry || 0), sn = Math.sin(ry || 0), yy = y === undefined ? SIDE_TOP + 0.012 : y;
    const p = (k, f) => { const t = (k / seg) * Math.PI * 2, lx = Math.cos(t) * rx * f, lz = Math.sin(t) * rz * f; return [x + lx * cs - lz * sn, yy, z + lx * sn + lz * cs]; };
    for (let k = 0; k < seg; k++) { buf.tri([x, yy, z], p(k + 1, 0.62), p(k, 0.62), c0, c1, c1); buf.quad(p(k, 0.62), p(k + 1, 0.62), p(k + 1, 1), p(k, 1), c1, c1, c2, c2); }
  };
  // round disc facing +z (portholes, lamp lenses)
  S.disc = (buf, cx, cy, cz, r, c, n) => { n = n || 8; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; buf.tri([cx, cy, cz], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz], c); } };
  // upright quad facing +z
  S.wall = (buf, cx, cy, cz, w, h, c0, c1) => buf.quad([cx - w / 2, cy - h / 2, cz], [cx + w / 2, cy - h / 2, cz], [cx + w / 2, cy + h / 2, cz], [cx - w / 2, cy + h / 2, cz], c0, c0, c1 || c0, c1 || c0);
  // flat ground quad (facing up) between x0..x1, z0..z1 at height y
  // flat floors (ground, road, sidewalk, plazas) never need to CAST: in the casting store they shadowed themselves and threw big square dark patches that followed the shadow camera down the street
  S.floor = (buf, x0, x1, z0, z1, y, c) => (buf === S.B && S.BF ? S.BF : buf).quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c);
  return S;
}

// ---------------------------------------------------------------- materials
// glow material: vertex colour is the paint (clamped for the daytime diffuse) AND the emissive colour (can exceed 1, bloom picks it up). lighting.js drives
// emissiveIntensity through userData.nightGlow (windows / neon level of the time of day).
export function glowMaterial(nightGlow, key) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0 });
  m.userData.nightGlow = nightGlow; m.userData.beatGain = 0.25;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = min(diffuseColor.rgb, vec3(1.0)) * 0.82;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * emissive;');
  };
  m.customProgramCacheKey = () => 'streetglow' + (key || '');
  return m;
}
export function decalMaterial(tex) {
  return new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}
export function signMaterial(tex, nightGlow) {
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.userData.nightGlow = nightGlow; m.userData.beatGain = 0.3; return m;
}
export function haloMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  return m;
}
export function puddleMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}

// ---------------------------------------------------------------- section toggling (collapse or restore ranges of vertices)
export function makeToggler(S, geos) {
  const orig = {}; for (const k in geos) orig[k] = geos[k].attributes.position.array.slice();
  const state = {};
  return {
    set(name, on) {
      const ranges = S.sections[name]; if (!ranges || state[name] === !!on) return false; state[name] = !!on;
      for (const r of ranges) {
        const g = geos[r.store]; if (!g) continue; const arr = g.attributes.position.array, o = orig[r.store];
        if (on) arr.set(o.subarray(r.a * 3, r.b * 3), r.a * 3); else for (let i = r.a; i < r.b; i++) { arr[i * 3] = 0; arr[i * 3 + 1] = -500; arr[i * 3 + 2] = 0; }
        g.attributes.position.needsUpdate = true;
      }
      return true;
    },
    get(name) { return state[name]; },
  };
}

// ---------------------------------------------------------------- small shared prop builders
const mk3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export { mk3 };
// windowed wall opening at the building line. lit = [r,g,b] glow colour or null for a dark pane. Returns nothing.
export function win(S, cx, cy, w, h, lit, o) {
  o = o || {}; const z = (o.z === undefined ? Z0 : o.z), R = S.R, frame = o.frame || mix(PAL.cream, PAL.creamD, 0.3);
  S.wall(S.B, cx, cy, z + 0.012, w + 0.16, h + 0.16, frame);
  if (lit) {
    S.wall(S.GLOW, cx, cy, z + 0.03, w, h, lit, mul(lit, 0.8));
    const sil = R();
    if (sil < 0.28) { const px = cx + (R() - 0.5) * w * 0.4, base = cy - h / 2; // a person standing at the window
      S.B.push(px, base, z + 0.045, 0, 1); const dk = [0.05, 0.04, 0.08]; S.B.quad([-0.14, 0, 0], [0.14, 0, 0], [0.11, h * 0.5, 0], [-0.11, h * 0.5, 0], dk); S.B.tri([-0.09, h * 0.5, 0], [0.09, h * 0.5, 0], [0, h * 0.5 + 0.2, 0], dk); S.B.pop(); }
    else if (sil < 0.5) { const px = cx + (R() - 0.5) * w * 0.5, base = cy - h / 2, dk = [0.05, 0.1, 0.07]; S.B.push(px, base, z + 0.045, 0, 1); S.B.quad([-0.1, 0, 0], [0.1, 0, 0], [0.07, 0.22, 0], [-0.07, 0.22, 0], mul(PAL.wood, 0.5)); for (let k = -1; k <= 1; k++) S.B.tri([k * 0.1 - 0.1, 0.2, 0], [k * 0.1 + 0.1, 0.2, 0], [k * 0.1, 0.5 + 0.1 * (1 - Math.abs(k)), 0], dk); S.B.pop(); }
  } else S.wall(S.B, cx, cy, z + 0.03, w, h, PAL.glassD, PAL.glassL);
  if (o.mullion !== false) { S.wall(S.B, cx, cy, z + 0.05, 0.05, h, frame); S.wall(S.B, cx, cy + h * 0.08, z + 0.05, w, 0.05, frame); }
  if (o.sill !== false) S.B.box(cx, cy - h / 2 - 0.1, z + 0.1, w + 0.24, 0.1, 0.3, PAL.stoneD, { base: 0, tint: 0.02 });
}
export function awningStripes(S, cx, y0, w, out, drop, c1, c2, n, z) {
  // sloped striped awning: top edge at the wall (y0 + drop), front edge `out` metres out at y0, scalloped front
  const k = n || 14, sw = w / k; z = z === undefined ? Z0 : z;
  for (let i = 0; i < k; i++) {
    const x0 = cx - w / 2 + i * sw, x1 = x0 + sw, c = i % 2 ? c2 : c1, lo = mul(c, 0.82);
    S.B.quad([x0, y0 + drop, z], [x1, y0 + drop, z], [x1, y0, z + out], [x0, y0, z + out], lo, lo, c, c);
    S.B.tri([x0, y0, z + out], [x1, y0, z + out], [(x0 + x1) / 2, y0 - 0.22, z + out + 0.02], mul(c, 0.9));
  }
  S.B.box(cx, y0 + drop - 0.05, z + 0.02, w + 0.1, 0.1, 0.1, mul(PAL.ink, 1.2), { base: 0 });
  S.B.box(cx - w / 2, y0 - 0.02, z + out * 0.5, 0.05, 0.05, out, PAL.iron, { base: 0 }); S.B.box(cx + w / 2, y0 - 0.02, z + out * 0.5, 0.05, 0.05, out, PAL.iron, { base: 0 });
}
// street lamp: pole, bent arm over the sidewalk and a glowing head. The head glow uses y = 4.1 (lighting's lamp list uses the same y)
export function lampPost(S, x, z, o) {
  o = o || {}; const h = 4.2, arm = o.arm === undefined ? -0.8 : o.arm, B = S.B, iron = PAL.iron;
  B.cyl(x, SIDE_TOP, z, 0.16, 0.1, 0.5, 8, mul(iron, 1.25), { base: 0.2 }); B.cyl(x, SIDE_TOP + 0.5, z, 0.07, 0.055, h - 0.5, 6, iron, { base: 0 });
  B.box(x, SIDE_TOP + h - 0.04, z + arm / 2, 0.09, 0.09, Math.abs(arm) + 0.1, iron, { base: 0 });
  B.box(x, SIDE_TOP + h - 0.17, z + arm, 0.52, 0.09, 0.52, iron, { base: 0.1 }); // hood
  S.GLOW.box(x, SIDE_TOP + h - 0.28, z + arm, 0.38, 0.12, 0.38, o.color || NEON.warm, { base: 0 });
  S.lamps.push({ x, y: SIDE_TOP + h - 0.1, z: z + arm });
  S.hit.circle(x, z, 0.3);
}
