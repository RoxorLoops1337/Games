// Encore Island 3D, lands: (1) the unlock portal, the plate that opens the next island: a big plate with a pillar of light, ground ripples,
// a floating 'NEW LAND' pill and a bouncing arrow once you can pay; (2) the locked next island teaser: a ghost silhouette of the island
// that will appear, wrapped in drifting clouds with a big lock. Both are tinted with the NEXT biome.
import * as THREE from 'three';
import { Builder, C, INK, TAU, PI, W, clamp, lerp, damp, seg, icoDetail, LOOK, addOutline, hash01, softTex } from './kit.js';
import { makePlate, iconTex } from './plate3d.js';
import { moteField, beamMesh, glowSprite, ringMesh, texSprite, col, easeOut, disposeDeep, fixPlate } from './lands_fx.js';

const GOLD = 0xffe98a;
const hexStr = (c) => '#' + c.getHexString();

// ================================================================= the unlock portal (S.unlockPlate)
export function makePortal(V, n) {
  const B = biomeOf(n), root = new THREE.Group(), g = new THREE.Group(), bg = new THREE.Color(B.g[0]), tint = new THREE.Color(GOLD).lerp(bg, 0.28), deep = new THREE.Color(B.deep).lerp(new THREE.Color('#1a0a30'), 0.25);
  const R = 1.16, plate = fixPlate(makePlate(V, { r: R, icon: 'way', c1: B.g[0], c2: hexStr(deep), ring: '#ffe98a', lvl: false })); root.add(plate.group, g); // plate.update reads its own group position as world x,z (labels), so it must sit directly under an identity parent
  const pillar = beamMesh(0.85, 0.45, 11, { c: tint.getHex(), a: 0.3, fall: 0.9, stripes: 6, spd: 2.6, base: 0.04 }), core = beamMesh(0.34, 0.2, 11, { c: new THREE.Color(1, 0.95, 0.75).getHex(), a: 0.3, fall: 1.1, stripes: 3, spd: 3.2, base: 0.04 });
  pillar.position.y = core.position.y = 0.15; g.add(pillar, core);
  const rip = [ringMesh({ c: 0xffd678, a: 0.5, r: 1.2, in: 0.9, out: 1, soft: 0.04, y: 0.12 }), ringMesh({ c: 0xffd678, a: 0.5, r: 1.2, in: 0.9, out: 1, soft: 0.04, y: 0.12 })]; g.add(...rip);
  const glow = glowSprite(tint.getHex(), 5, { flat: true, a: 0.32 }); glow.position.y = 0.1; g.add(glow);
  const motes = moteField({ n: 26, h: 7, r: 0.9, cone: 0.5, size: 0.2, speed: 0.22, sway: 0.3, c: tint.getHex(), c2: 0xfff4c0, star: true, seed: n }); motes.position.y = 0.2; g.add(motes);
  // bouncing arrow (only when affordable): ink-hulled gold arrow pointing at the plate
  const ab = new Builder({ ao: 0.1 }); ab.rbox(C.gold, 0, 0.62, 0, 0.3, 0.55, 0.22, 0.4); ab.conec(C.gold, 0, 0.16, 0, 0.36, 0.5, seg(10), PI); const arrow = ab.build({ cast: false }); arrow.children.forEach((m) => addOutline(m, 0.03)); arrow.position.y = 4.9; g.add(arrow);
  const st = { aff: 0, boost: 0 };
  return { g: root, plate, n, B, update(dt, t, u, afford, boost, near, px, pz) {
    plate.group.position.set(px, 0, pz); g.position.set(px, 0, pz);
    const rem = Math.max(0, u.cost - u.paid); st.aff = damp(st.aff, afford ? 1 : 0, 4, dt); st.boost = damp(st.boost, boost ? 1 : 0, 3, dt);
    plate.setState({ afford, paid: u.paid, cost: u.cost, rem, near: false, label: null, hidden: false }); plate.update(dt, t);
    const hgt = lerp(0.36, 1, st.aff) * (1 + 0.45 * st.boost), wid = 1 + 0.4 * st.boost, pul = 0.5 + 0.5 * Math.sin(t * 5), bt = LOOK.beat.value;
    pillar.scale.set(wid, hgt, wid); core.scale.set(wid, hgt * 0.92, wid);
    pillar.userData.u.uA.value = lerp(0.1, 0.24 + 0.06 * pul + 0.05 * bt, st.aff) + 0.1 * st.boost; core.userData.u.uA.value = lerp(0.08, 0.3 + 0.08 * pul, st.aff) + 0.12 * st.boost;
    const ph = (t * 0.9) % 1; for (let i = 0; i < 2; i++) { const q = (ph + i * 0.5) % 1; rip[i].scale.setScalar(1.2 + q * 1.6); rip[i].userData.u.uA.value = 0.6 * (1 - q) * lerp(0.5, 1, st.aff); }
    glow.scale.setScalar(4.4 + 0.5 * pul * st.aff + 0.6 * st.boost); motes.userData.u.uOpacity.value = lerp(0.35, 1, st.aff);
    arrow.visible = st.aff > 0.05; arrow.position.y = 4.9 + Math.sin(t * 6) * 0.2; arrow.rotation.y = t * 1.8; arrow.scale.setScalar(st.aff);
    if (V.labels) V.labels.pill('NEW LAND  ' + B.name, px, 3.75 + Math.sin(t * 3) * 0.06, pz, afford ? { c1: '#ffe98a', c2: '#f0b422', px: 13 } : { c1: '#ffffff', c2: '#dccaff', px: 13 });
  }, dispose() { plate.dispose(); disposeDeep(root); } };
}

// ================================================================= the locked next island teaser (2D drawMist)
const RAD_N = 56, PROFILE = [[0.98, 0], [1.0, -0.14], [0.93, -0.55], [0.74, -1.25], [0.46, -2.05], [0.2, -2.95], [0.0, -3.7]];
export function makeTeaser(V, n) {
  const gg = geoOf(n), B = biomeOf(n), cx = gg.x * W, cz = gg.y * W, g = new THREE.Group(); g.position.set(cx, 0, cz);
  // silhouette: top fan + rings down to a stalactite tip, shaped by the real radius profile of the island
  const rings = PROFILE.length, nv = 1 + rings * RAD_N, pos = new Float32Array(nv * 3), cl = new Float32Array(nv * 3), idx = [], base = new THREE.Color('#7e6ccc').lerp(new THREE.Color(B.g[0]), 0.16), under = new THREE.Color('#38297a');
  pos[1] = 0; cl[0] = base.r * 1.1; cl[1] = base.g * 1.1; cl[2] = base.b * 1.1;
  for (let r = 0; r < rings; r++) for (let i = 0; i < RAD_N; i++) {
    const a = i / RAD_N * TAU, Ra = radiusAt(gg, a) * W, [k, y] = PROFILE[r], j = 1 + r * RAD_N + i, wob = 1 + (r > 1 ? (hash01(i * 7 + r * 31 + n) - 0.5) * 0.18 : 0);
    pos[j * 3] = Math.cos(a) * Ra * k * wob; pos[j * 3 + 1] = y + (r > 1 ? (hash01(i + r * 17) - 0.5) * 0.25 : 0); pos[j * 3 + 2] = Math.sin(a) * Ra * k * wob;
    const c = r === 0 ? base : base.clone().lerp(under, clamp(r / 2.2, 0, 1)); cl[j * 3] = c.r; cl[j * 3 + 1] = c.g; cl[j * 3 + 2] = c.b;
  }
  for (let i = 0; i < RAD_N; i++) { const i2 = (i + 1) % RAD_N; idx.push(0, 1 + i2, 1 + i); }
  for (let r = 0; r < rings - 1; r++) for (let i = 0; i < RAD_N; i++) { const i2 = (i + 1) % RAD_N, a = 1 + r * RAD_N + i, b = 1 + r * RAD_N + i2, c = 1 + (r + 1) * RAD_N + i, d = 1 + (r + 1) * RAD_N + i2; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cl, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.9, emissive: 0x4a3a98, emissiveIntensity: 0.22, depthWrite: true }); sm.userData.own = true; sm.userData.noCast = true;
  const isle = new THREE.Mesh(geo, sm); g.add(isle);
  const shade = glowSprite(0x2a1a60, gg.r * W * 2.1, { flat: true, a: 0.3, map: 'shadow', k: 1 }); shade.material = shade.material.clone(); shade.material.blending = THREE.NormalBlending; shade.material.userData.own = true; shade.position.y = 0.03; shade.renderOrder = 1; g.add(shade);
  const gl = glowSprite(0xb8a0ff, gg.r * W * 2.3, { flat: true, a: 0.22, k: 1.1 }); gl.position.y = 0.9; g.add(gl);
  // clouds: clusters of soft balls drifting around the island plus a fuzzy ring over its rim (instanced, matrices animated on the CPU)
  const NC = 22, PER = 3, cm = new THREE.MeshStandardMaterial({ color: 0xf2eeff, roughness: 1, emissive: 0x8c84d8, emissiveIntensity: 0.32, transparent: true, opacity: 0.88, depthWrite: false }); cm.userData.own = true; cm.userData.noCast = true;
  const cg = new THREE.IcosahedronGeometry(1, icoDetail(1)), puffs = new THREE.InstancedMesh(cg, cm, NC * PER); puffs.frustumCulled = false; puffs.castShadow = false; puffs.receiveShadow = false; g.add(puffs);
  { const cc = new THREE.Color(), tints = [0xffffff, 0xece6ff, 0xdcd8ff, 0xf6e8ff, 0xe4f0ff]; for (let i = 0; i < NC * PER; i++) puffs.setColorAt(i, cc.set(tints[(hash01(i + n * 3) * 5) | 0])); }
  const sp = []; for (let i = 0; i < NC; i++) { const h = hash01(n * 31 + i), h2 = hash01(n * 17 + i), rim = i < 10; for (let j = 0; j < PER; j++) sp.push({ i, a0: i / NC * TAU, rr: gg.r * W * (rim ? 0.72 + 0.2 * h : 0.1 + 0.5 * h), sz: (0.8 + 0.7 * h2) * (j ? 0.7 : 1) * (rim ? 0.9 : 1.1), ox: (j - 1) * 0.9 * (0.6 + h), oz: (j % 2 ? 0.5 : -0.4) * (0.5 + h2), oy: (j === 1 ? 0.25 : 0) + (rim ? -0.15 : 0.3), dir: i % 2 ? 1 : -1, ph: i * 1.3 + j }); }
  const lock = texSprite(iconTex('lock'), 3.0); lock.position.y = 3.1; g.add(lock);
  const motes = moteField({ n: 34, h: 3.2, r: gg.r * W * 0.8, size: 0.2, speed: 0.12, sway: 0.4, star: true, c: 0xffffff, c2: B.g[0] ? new THREE.Color(B.g[0]).getHex() : 0xffffff, seed: n * 5 }); motes.position.y = 0.4; g.add(motes);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  let age = 0, dying = false, done = false;
  const api = { g, n, B, get done() { return done; }, die() { dying = true; age = 0; },
    update(dt, t) {
      if (dying) { age += dt; if (age > 1.0) { done = true; g.visible = false; return; } }
      const f = dying ? easeOut(age / 1.0) : 0, fadeA = 1 - f;
      const fl = 0.55 + Math.sin(t * 0.9) * 0.12; isle.position.y = fl - f * 0.55; sm.opacity = 0.9 * fadeA; cm.opacity = 0.88 * fadeA; motes.userData.u.uOpacity.value = fadeA; gl.scale.setScalar(gg.r * W * (2.3 + f * 1.2)); shade.visible = !dying;
      for (let k = 0; k < sp.length; k++) {
        const s = sp[k], a = s.a0 + t * 0.07 * s.dir, rr = s.rr * (1 + f * 1.8), y = 1.1 + 0.35 * Math.sin(t * 0.6 + s.ph) + s.oy + f * 1.6;
        vp.set(Math.cos(a) * rr + s.ox, y, Math.sin(a) * rr * 0.9 + s.oz); const sc = s.sz * (1 + f * 0.5); m4.compose(vp, q, vs.set(sc, sc * 0.78, sc)); puffs.setMatrixAt(k, m4);
      }
      puffs.instanceMatrix.needsUpdate = true;
      lock.position.y = 3.1 + Math.sin(t * 1.6) * 0.14 + f * 1.4; lock.scale.setScalar(Math.max(0.01, (1 + 0.5 * f) * fadeA)); lock.material.opacity = fadeA;
      if (V.labels && !dying) V.labels.pill(B.name, cx, 1.95, cz + 1.0, { c1: '#ffffff', c2: '#d8c8ff', px: 15 });
    }, dispose() { disposeDeep(g); cg.dispose(); } };
  return api;
}
