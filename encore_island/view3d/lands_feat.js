// Encore Island 3D, lands: the feature visuals that live on lands. Read from the feature modules' own state (f_lands.js: Land Mastery flags,
// Hidden Secrets, Land Events; f_rivals.js: taken-land banners and the Stage Battle pad). Everything is looked up defensively because a
// feature can be switched off; nothing here writes to S.
import * as THREE from 'three';
import { Builder, C, INK, TAU, PI, W, clamp, lerp, seg, LOOK, hash01, canvasTex, FONT, addOutline } from './kit.js';
import { iconTex } from './plate3d.js';
import { clothGeo, clothMesh, clothMerge, moteField, glowSprite, ringMesh, texSprite, textTex, col, disposeDeep } from './lands_fx.js';

const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const PILL_BATTLE = { c1: '#fff6c0', c2: '#ffb640', px: 12 }; // label option objects are built once (a pill call keeps the reference until the overlay draws it)

// outline ribbon of a land (follows radiusAt): one strip, soft glow + dashed white variants share the shader
const RIB_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RIB_F = `varying vec2 vUv; uniform float uT, uA, uDash, uSpeed; uniform vec3 uCol;
void main(){ float c = abs(vUv.y - 0.5) * 2.0, a = 1.0 - c * c; if (uDash > 0.5) a = smoothstep(1.0, 0.7, c) * smoothstep(0.38, 0.5, fract(vUv.x * uDash - uT * uSpeed)) * (1.0 - smoothstep(0.88, 1.0, fract(vUv.x * uDash - uT * uSpeed)));
  gl_FragColor = vec4(uCol, a * uA);${OUT} }`;
function ribbon(gg, f, width, o) {
  const N = 96, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  for (let i = 0; i <= N; i++) { const a = i / N * TAU, R = radiusAt(gg, a) * W * f, c = Math.cos(a), s = Math.sin(a); pos.set([c * (R - width / 2), 0, s * (R - width / 2), c * (R + width / 2), 0, s * (R + width / 2)], i * 6); uv.set([i / N, 0, i / N, 1], i * 4); if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // normal blending: additive saturates to white on the pale ground
    uniforms: { uT: LOOK.t, uA: { value: o.a ?? 1 }, uDash: { value: o.dash ?? 0 }, uSpeed: { value: o.speed ?? 0 }, uCol: { value: col(o.c) } }, vertexShader: RIB_V, fragmentShader: RIB_F });
  m.userData.noCast = m.userData.noLook = m.userData.own = true; const mesh = new THREE.Mesh(g, m); mesh.position.set(gg.x * W, 0.11, gg.y * W); mesh.renderOrder = 3; mesh.userData.u = m.uniforms; return mesh;
}

export function makeFeat(V) {
  const root = new THREE.Group(); root.name = 'lands_feat'; V.world.add(root);
  const flags = new Map(), secrets = new Map(), takenV = new Map(); let ev = null;

  // ------------------------------------------------------------ Land Mastery flags
  function makeFlag(k, n, lv, z) {
    const p = ldFlagPos(k), h = (74 + n * 6) * W, g = new THREE.Group(); g.position.set(p.x * W, 0, p.y * W);
    const b = new Builder({ ao: 0.12 }); b.cyl(C.cream, 0, 0, 0, 0.03, h, 8); b.cyl(0xe6d3a3, 0, 0, 0, 0.18, 0.1, 12); b.ball(C.gold, 0, h + 0.02, 0, 0.1);
    const pole = b.build({ cast: false }); pole.children.forEach((m) => addOutline(m, 0.02)); g.add(pole);
    const tex = canvasTex(128, 84, (c, w, hh) => { c.fillStyle = '#b8760a'; c.font = `900 56px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(lv), w * 0.55, hh * 0.55); });
    const cloth = clothMesh(clothGeo(0.92, 0.6, 0xffe98a, 0xe8a21e, k, 10), tex); cloth.userData.ownMap = true; cloth.material.userData.ownMap = true; cloth.position.set(0.02, h - 0.36, 0); g.add(cloth);
    let glow = null; if (n >= 3) { glow = glowSprite(0xffe98a, 2.6, { a: 0.35 }); glow.position.set(0.45, h - 0.36, 0.1); g.add(glow); }
    return { g, n, lv, z, glow, dispose() { disposeDeep(g); } };
  }
  function syncFlags() {
    const nl = S.lands.length;
    for (const [k, v] of flags) if (k > nl || v.z !== S.lands[k - 1]) { root.remove(v.g); v.dispose(); flags.delete(k); }
    if (typeof ldMsCount !== 'function') return;
    for (let k = 1; k <= nl; k++) {
      const n = ldMsCount(k); let v = flags.get(k);
      if (!n) { if (v) { root.remove(v.g); v.dispose(); flags.delete(k); } continue; }
      const lv = ldMastLv(k); if (v && (v.n !== n || v.lv !== lv)) { root.remove(v.g); v.dispose(); v = null; }
      if (!v) { v = makeFlag(k, n, lv, S.lands[k - 1]); flags.set(k, v); root.add(v.g); }
      if (v.glow) v.glow.scale.setScalar(2.4 + 0.5 * Math.sin(S.t * 3));
    }
  }

  // ------------------------------------------------------------ Hidden Secrets (a glowing '?' that shows when you are near or a scout pings)
  const qTex = textTex('?', '#ffe27a', '#ff9a2e', 100);
  function makeSecret() {
    const g = new THREE.Group(), dirt = ringMesh({ c: 0x78502a, a: 0.38, r: 0.34, in: 0, out: 1, soft: 0.2, add: false, y: 0.1 }); g.add(dirt);
    const glow = glowSprite(0xffd86a, 1.9, { flat: true, a: 0.6, order: 4 }); glow.position.y = 0.12; g.add(glow);
    const motes = moteField({ mode: 'orbit', n: 5, r: 0.42, h: 0.32, size: 0.1, c: 0xfff4c0, c2: 0xffd84d, star: false, seed: 4 }); g.add(motes);
    const q = texSprite(qTex, 0.9); q.position.y = 0.85; g.add(q);
    const rip = ringMesh({ c: 0xffc83a, a: 0.9, r: 1, in: 0.9, out: 1, soft: 0.03, y: 0.12, add: false }); rip.visible = false; g.add(rip);
    return { g, q, motes, rip, dirt };
  }
  function syncSecrets(t) {
    if (typeof ldSecrets !== 'function' || typeof fs !== 'function') return;
    const st = fs('lands'); if (!st) return; const p = S.player, nl = S.lands.length;
    for (const [k, v] of secrets) if (k > nl) { v.forEach((s) => { root.remove(s.g); disposeDeep(s.g); }); secrets.delete(k); }
    for (let k = 1; k <= nl; k++) {
      const gg = S.lands[k - 1].g, rv = LD.reveal[k] > S.t, near = Math.hypot(p.x - gg.x, p.y - gg.y) < gg.r * 1.25; let v = secrets.get(k);
      if (!rv && !near) { if (v) v.forEach((s) => { s.g.visible = false; }); continue; }
      const sp = ldSecrets(k), f = st.found && st.found[k]; if (!v) { v = [0, 1, 2].map(() => { const s = makeSecret(); root.add(s.g); return s; }); secrets.set(k, v); }
      for (let i = 0; i < 3; i++) {
        const s = v[i], sc = sp[i]; if (!sc || (f && f[i])) { s.g.visible = false; continue; }
        const d = Math.hypot(sc.x - p.x, sc.y - p.y); if (d > 140 && !rv) { s.g.visible = false; continue; }
        const a = rv ? 1 : clamp((140 - d) / 60, 0.25, 1); s.g.visible = true; s.g.position.set(sc.x * W, 0, sc.y * W);
        s.q.position.y = 0.85 + Math.sin(t * 3 + i) * 0.06; s.q.material.opacity = a; s.q.rotation.z = Math.sin(t * 2.5) * 0.12; s.motes.userData.u.uOpacity.value = a; s.dirt.userData.u.uA.value = 0.38 * a;
        s.rip.visible = rv; if (rv) { const u = (t * 1.3 + i * 0.3) % 1; s.rip.scale.setScalar(0.4 + u * 1.4); s.rip.userData.u.uA.value = (1 - u) * 0.9; }
      }
    }
  }

  // ------------------------------------------------------------ Land Events
  const petalGeo = new THREE.CircleGeometry(1, 8).scale(0.17, 0.1, 1); petalGeo.userData.sharedGeo = true;
  function makeEvent(e) {
    const D = LD_EV[e.type], gg = geoOf(e.k), g = new THREE.Group(), cx = gg.x * W, cz = gg.y * W; g.position.set(0, 0, 0);
    const soft = ribbon(gg, 0.97, 0.6, { c: D.col, a: 0.5 }), dash = ribbon(gg, 0.97, 0.16, { c: 0xffffff, a: 0.85, dash: 56, speed: 0.75 }); g.add(soft, dash);
    const rip = ringMesh({ c: D.col, a: 0.5, r: 1, in: 0.95, out: 1, soft: 0.02, y: 0.12, add: false }); rip.position.set(cx, 0.12, cz); g.add(rip);
    const v = { e, D, gg, g, soft, dash, rip, cx, cz, rings: null, motes: null, petals: null, pill: { c1: '#ffffff', c2: D.col, px: 13 } };
    if (e.type === 'blossom') {
      const pm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }); pm.userData.own = true; pm.userData.noCast = true; const im = new THREE.InstancedMesh(petalGeo, pm, 40);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3); const cc = new THREE.Color(); for (let i = 0; i < 40; i++) { cc.set(i % 3 === 0 ? '#fff4e6' : i % 3 === 1 ? '#ff9ac8' : '#ffc2dc'); im.setColorAt(i, cc); }
      im.frustumCulled = false; im.castShadow = false; g.add(im); v.petals = im;
    } else if (e.type === 'golden' || e.type === 'dark') {
      const m = moteField({ n: e.type === 'golden' ? 36 : 18, h: 1.5, r: gg.r * W * 0.88, size: 0.26, speed: 0.25, sway: 0.1, star: true, c: e.type === 'golden' ? 0xffe98a : 0xc6b4ff, c2: 0xffffff, seed: e.k * 3 }); m.position.set(cx, 0.2, cz); g.add(m); v.motes = m;
    } else if (e.type === 'sound') {
      v.rings = [0, 1, 2].map(() => { const r = ringMesh({ c: D.col, a: 1, r: 1, in: 0.93, out: 1, soft: 0.02, y: 0.13, add: false }); r.position.set(gg.den.x * W, 0.13, gg.den.y * W); g.add(r); return r; });
    }
    return v;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  function syncEvent(t) {
    const e = typeof fs === 'function' && typeof LD_EV !== 'undefined' ? fs('lands').ev : null;
    if (ev && ev.e !== e) { root.remove(ev.g); disposeDeep(ev.g); ev = null; }
    if (!e || !S.lands[e.k - 1] || !LD_EV[e.type]) return;
    if (!ev) { ev = makeEvent(e); root.add(ev.g); }
    const { D, gg, cx, cz } = ev, u = (t * 0.7) % 1, pul = 0.3 + 0.25 * Math.sin(t * 4);
    ev.soft.userData.u.uA.value = pul + 0.1; ev.rip.scale.setScalar(gg.r * W * (0.2 + u * 0.7)); ev.rip.userData.u.uA.value = (1 - u) * 0.55;
    if (ev.petals) for (let i = 0; i < 40; i++) {
      const hh = (j) => hash01(j * 31 + 7), uu = (t * (0.05 + hh(i) * 0.05) + hh(i + 40)) % 1, sn = Math.sin(uu * PI);
      _p.set((gg.x + (hh(i + 80) * 2 - 1) * gg.r * 1.05 + Math.sin(t * 1.3 + i) * 26 + uu * 90) * W, 0.25 + sn * 1.5, (gg.y + (uu * 2 - 1) * gg.r * 0.95 + gg.r * 0.1) * W);
      _q.setFromEuler(_e.set(t * 1.2 + i, t * 1.6 + i, t * 0.9)); const sc = 0.2 + sn; ev.petals.setMatrixAt(i, _m.compose(_p, _q, _s.set(sc, sc, sc)));
    }
    if (ev.petals) ev.petals.instanceMatrix.needsUpdate = true;
    if (ev.rings) for (let i = 0; i < 3; i++) { const q = (t * 0.8 + i / 3) % 1; ev.rings[i].scale.setScalar((30 + q * 70) * W); ev.rings[i].userData.u.uA.value = 1 - q; }
    if (V.labels) {
      const left = Math.max(0, e.dur - e.t), mm = Math.floor(left / 60), ss = Math.floor(left % 60), tm = mm + ':' + (ss < 10 ? '0' : '') + ss;
      V.labels.pill(D.name + '  ' + (e.type === 'sound' ? e.killed + '/' + e.total + ' defeated  ' + tm : D.short + '  ' + tm), cx, 4.6 + Math.sin(t * 2.2) * 0.12, cz, ev.pill);
    }
  }

  // ------------------------------------------------------------ Rival bands: banners around a taken land + the Stage Battle pad
  const micTex = () => iconTex('mic');
  function makeTaken(k, z, tk) {
    const B = RV_BANDS[tk.band], gg = z.g, g = new THREE.Group(), pb = new Builder({ ao: 0.1 }), items = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + 0.3, rd = radiusAt(gg, a) * 0.86, x = (gg.x + Math.cos(a) * rd) * W, zz = (gg.y + Math.sin(a) * rd) * W, h = 54 * W;
      pb.cyl(INK, x, 0, zz, 0.04, h, 6); pb.ball(INK, x, h + 0.02, zz, 0.07); pb.ball(C.cream, x, h + 0.02, zz, 0.05);
      items.push({ g: clothGeo(0.5, 0.36, i % 2 ? B.col : B.col2, i % 2 ? B.col2 : B.col, i * 0.9, 6, 0.85), x: x + 0.02, y: h - 0.2, z: zz, s: 1 });
    }
    g.add(pb.build({ cast: false })); const cg = clothMerge(items); items.forEach((it) => it.g.dispose()); g.add(clothMesh(cg));
    const ps = rvPadSpot(k), pg = new THREE.Group(); pg.position.set(ps.x * W, 0, ps.y * W);
    const disc = ringMesh({ c: 0xffd94a, a: 0.22, r: 0.72, in: 0, out: 1, soft: 0.04, y: 0.11 }), runes = ringMesh({ c: 0xffd94a, a: 1, r: 0.86, in: 0.9, out: 1, dash: 12, speed: -0.13, soft: 0.02, y: 0.13 }), prog = ringMesh({ c: B.col, a: 1, r: 0.98, in: 0.9, out: 1, soft: 0.02, prog: 0, y: 0.14 });
    const glow = glowSprite(0xffe98a, 3.0, { flat: true, a: 0.6 }); glow.position.y = 0.1; const mic = texSprite(micTex(), 0.9); mic.position.y = 0.55;
    pg.add(disc, runes, prog, glow, mic); g.add(pg);
    return { g, pg, prog, glow, mic, z, band: tk.band, B, k, pill: { c1: '#ffe0e8', c2: B.col, px: 13 }, dispose() { disposeDeep(g); } };
  }
  function syncTaken(t) {
    if (typeof landTaken !== 'function' || typeof rvState !== 'function' || typeof RV_BANDS === 'undefined') return;
    const st = rvState(); if (!st) return; const seen = new Set();
    for (const k in st.taken) {
      const kk = +k, z = S.lands[kk - 1]; if (!z || !landTaken(kk)) continue; seen.add(kk);
      let v = takenV.get(kk); if (v && (v.z !== z || v.band !== st.taken[k].band)) { root.remove(v.g); v.dispose(); v = null; }
      if (!v) { v = makeTaken(kk, z, st.taken[k]); takenV.set(kk, v); root.add(v.g); }
      const gg = z.g, pulse = 0.5 + 0.5 * Math.sin(t * 3), ps = rvPadSpot(kk);
      if (ps) v.pg.position.set(ps.x * W, 0, ps.y * W);
      v.glow.scale.setScalar(2.7 + pulse * 0.6); v.mic.position.y = 0.55 + Math.sin(t * 2) * 0.03; v.prog.userData.u.uProg.value = st.padHold > 0 ? Math.min(1, st.padHold / 1.2) : -1; v.prog.userData.u.uA.value = st.padHold > 0 ? 1 : 0;
      if (V.labels) {
        V.labels.pill('TAKEN · ' + v.B.name, gg.x * W, 2.6 + Math.sin(t * 2) * 0.06, (gg.y - gg.r * 0.5) * W, v.pill);
        const cool = st.cool && st.cool[kk], bossy = typeof rvBossAlive === 'function' && rvBossAlive(), txt = st.battle ? 'IN PROGRESS' : cool ? 'Rest ' + Math.ceil(cool) + 's' : bossy ? 'Beat the Headliner first' : 'STAGE BATTLE';
        V.labels.pill(txt, ps ? ps.x * W : gg.x * W, 0.05, (ps ? ps.y : gg.y) * W + 1.2, PILL_BATTLE);
      }
    }
    for (const [k, v] of takenV) if (!seen.has(k)) { root.remove(v.g); v.dispose(); takenV.delete(k); }
  }

  return { update(dt, t) {
    if (typeof S === 'undefined' || !S.lands) return;
    try { syncFlags(); } catch (e) { /* a feature is off or mid-reset: cosmetic only */ } try { syncSecrets(t); } catch (e) { /* same */ } try { syncEvent(t); } catch (e) { /* same */ } try { syncTaken(t); } catch (e) { /* same */ }
    const cam = V.camera; if (cam) root.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(cam.quaternion); }); // fixed-yaw camera: copying its rotation faces a quad exactly
  }, dispose() { for (const v of flags.values()) v.dispose(); for (const v of takenV.values()) v.dispose(); if (ev) disposeDeep(ev.g); secrets.forEach((a) => a.forEach((s) => disposeDeep(s.g))); V.world.remove(root); petalGeo.dispose(); } };
}
