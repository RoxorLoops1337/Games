// VENUE BASE (Stage and Club Artist INT-B): shared scaffolding for the rhythm venues (venue_bar/showcase/booth/arena.js) and the arena world.
//   const V = beginVenue(ctx, name, opts);  ... write geometry into V.S (flat_kit store: B lit, GLOW night glow, DEC/SCR atlas decals, SOFT, GLASS) and V.TA / V.TB (white geometry tinted by the theme
//   colours A and B every frame, so a venue recolours without a rebuild);  V.ups.push((dt, t, k) => ...) per-frame updaters;  return finishVenue(V, extras).
// Every venue returns the SAME contract (documented for mg_rhythm in venue.js):
//   { name, group, update(dt, t, v), setEnergy(e), setBeat(pulse 0..1), setTheme(name), dispose(), anchors, cams, led?, crowd?, theme, stats() }
//   v (optional, same object mg_rhythm_world.update gets): { energy 0..1, beat (beats since the downbeat, float), spb, approach, flee }
import { THREE, flatMat, disposeTree } from './kit.js';
import { makeStore, meshesFromStore, Buf, col, mul, mix, storeTris } from './venue_kit.js';

export const THEMES = { pink: ['#ff3d9a', '#7a3dff', '#ffe3ee'], cyan: ['#35f2e0', '#3d7aff', '#e2fbff'], lime: ['#a6ff3d', '#2bd9a0', '#f2ffd8'], gold: ['#ffc83d', '#ff6a3d', '#fff0c0'] };
export const THEME_IDS = ['pink', 'cyan', 'lime', 'gold'];
export const STAGE_DEF = { w: 9.2, d: 4.4, h: 0.6, x: 0, z: -12.4 };        // mg_rhythm_world STAGE: performer at (0, h, z), front lip at z + 2.3
export const W3 = [1, 1, 1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function beginVenue(ctx, name, o) {
  o = Object.assign({ q: (ctx && ctx.quality) || 'high', x: STAGE_DEF.x, z: STAGE_DEF.z, theme: 'pink', stageH: STAGE_DEF.h, scale: 1, seed: 5 }, o || {});
  const group = new THREE.Group(); group.name = 'venue_' + name; group.position.set(o.x, 0, o.z);
  const rig = new THREE.Group(); rig.name = 'venue_rig'; rig.scale.setScalar(o.scale); group.add(rig);   // everything is built at 1:1 inside rig; scale > 1 matches the oversized performer of the rhythm game
  const S = makeStore(); S.group = rig;
  const V = { ctx, name, o, group, rig, S, TA: new Buf({ rng: () => 0.5 }), TB: new Buf({ rng: () => 0.5 }), ups: [], anchors: {}, cams: {}, disposers: [], theme: THEMES[o.theme] ? o.theme : 'pink', energy: 0.3, pulse: 0, beatF: 0, mats: {} };
  return V;
}

// build the merged meshes and the shared api. extras: { led, crowd, characters[], api: {...extra methods} }
export function finishVenue(V, extras) {
  extras = extras || {}; const { S, rig, o } = V;
  const M = meshesFromStore(S, rig, { prefix: 'v_' + V.name, beatGain: 0.4, cast: o.q !== 'low' });
  const mk = (buf) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color('#ffffff') }); const me = new THREE.Mesh(buf.geometry(false), m); me.frustumCulled = false; me.name = 'v_' + V.name + '_theme'; rig.add(me); return me; };
  const ta = V.TA.p.length ? mk(V.TA) : null, tb = V.TB.p.length ? mk(V.TB) : null; let tris = storeTris(S) + (V.TA.p.length + V.TB.p.length) / 9, draws = 0;
  rig.traverse((c) => { if (c.isMesh) draws++; });
  const cA = new THREE.Color(), cB = new THREE.Color(), tA = new THREE.Color(), tB = new THREE.Color(), api = { name: V.name, group: V.group, rig, anchors: V.anchors, cams: V.cams, led: extras.led || null, crowd: extras.crowd || null, M, hint: extras.hint || {}, options: o };
  let themeName = V.theme, lastPulse = 0, lastBeat = -1, autoBpm = 100, manualT = -99, t0 = 0;
  function setTheme(name) { const T = THEMES[name]; if (!T) return themeName; themeName = name; api.theme = name; tA.set(T[0]); tB.set(T[1]); api.colors = T; if (extras.onTheme) extras.onTheme(name, T); if (api.onThemeChange) api.onThemeChange(name, T); return name; }
  function setBeat(b) { V.pulse = clamp(+b || 0, 0, 1); manualT = V.t0 === undefined ? 0 : V.t0; }
  function update(dt, t, v) {
    dt = Math.min(dt || 0.016, 0.1); V.t0 = t; v = v || {};
    let e = v.energy !== undefined ? v.energy : V.energy, pulse;
    if (v.beat !== undefined && isFinite(v.beat)) { const f = v.beat - Math.floor(v.beat); pulse = Math.exp(-f * 4.5); V.beatF = v.beat; } else if (t - manualT < 1.5) pulse = V.pulse; else { const bp = (t * autoBpm) / 60; V.beatF = bp; pulse = Math.exp(-(bp % 1) * 4.5); }
    V.energy += (e - V.energy) * (1 - Math.exp(-4 * dt)); lastPulse = pulse; const ee = V.energy;
    if (ta) { cA.copy(tA).multiplyScalar(0.55 + 0.35 * ee + 0.9 * pulse * (0.3 + ee)); ta.material.color.copy(cA); }
    if (tb) { cB.copy(tB).multiplyScalar(0.55 + 0.35 * ee + 0.9 * (1 - pulse) * 0.35 * (0.3 + ee) + 0.5 * pulse * ee); tb.material.color.copy(cB); }
    if (M.scrMat) { const k = 0.94 + 0.06 * Math.sin(t * 11) * Math.sin(t * 3.7) + 0.06 * pulse; M.scrMat.color.setRGB(k, k, k); }
    for (let i = 0; i < V.ups.length; i++) V.ups[i](dt, t, ee, pulse, v);
    if (extras.crowd) { extras.crowd.setEnergy(clamp(ee + 0.2 * pulse, 0, 1)); extras.crowd.setBeat(autoBpm); extras.crowd.update(dt, t); }
    (extras.characters || []).forEach((c) => { if (c && c.update) c.update(dt, t); });
  }
  function dispose() { // the tree first (skeleton bone textures, geometries, canvas textures), THEN the character objects themselves: character.dispose() detaches the object, which would hide its skeleton from disposeTree
    try { (V.pre || []).forEach((f) => f()); } catch (e) { /* ignore */ } const parent = V.group.parent; if (parent) parent.remove(V.group); try { disposeTree(V.group); } catch (e) { /* ignore */ }
    try { V.disposers.forEach((f) => f()); } catch (e) { /* ignore */ } try { if (extras.crowd) extras.crowd.dispose(); } catch (e) { /* ignore */ } (extras.characters || []).forEach((c) => { try { if (c && c.dispose) c.dispose(); } catch (e) { /* ignore */ } }); }
  Object.assign(api, { update, setEnergy(e) { V.energy = clamp(+e || 0, 0, 1); }, setBeat, setTheme, dispose, colors: THEMES[themeName], theme: themeName, pulse: () => lastPulse,
    stats() { let tr = tris; if (extras.crowd) tr += extras.crowd.mesh.count * extras.crowd.trisPer; (extras.characters || []).forEach((c) => { tr += (c && c.tris) || 0; }); let d = 0; V.group.traverse((c) => { if (c.isMesh && c.visible) d++; }); return { tris: Math.round(tr), draws: d + (extras.characters || []).length * 2, meshes: d }; } });
  Object.assign(api, extras.api || {}); V.api = api; setTheme(V.theme); update(0, 0, { energy: V.energy });
  return api;
}

// a big floor of plank/tile rows as one painted mesh section in the lit store. x0..x1, z0..z1; colour function cf(x, z) -> [r,g,b]
export function paintFloor(B, x0, x1, z0, z1, step, cf, y) {
  y = y || 0; const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz; B.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], cf(xa, za, i, j), cf(xa, zb, i, j), cf(xb, zb, i, j), cf(xb, za, i, j)); }
}
// pyro / spark fountains: n particles per fountain in one Points draw (cpu simulated, additive). api: { points, fire(ms), update(dt) }
export function makeSparks(positions, color, n) {
  n = n || 60; const cnt = positions.length * n, pos = new Float32Array(cnt * 3), vel = new Float32Array(cnt * 3), life = new Float32Array(cnt), col3 = new Float32Array(cnt * 3), c = new THREE.Color(color);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col3, 3));
  const m = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }); const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; pts.name = 'pyro';
  let burst = 0, hide = 0; const R = (i) => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); }; let seed = 1;
  function spawn(i, f) { const p = positions[f]; pos[i * 3] = p[0] + (R(seed++) - 0.5) * 0.2; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2] + (R(seed++) - 0.5) * 0.2; const a = R(seed++) * 6.283, s = 0.6 + R(seed++) * 2.2; vel[i * 3] = Math.cos(a) * s * 0.55; vel[i * 3 + 1] = 5 + R(seed++) * 5; vel[i * 3 + 2] = Math.sin(a) * s * 0.55; life[i] = 0.6 + R(seed++) * 0.9; const k = 0.6 + R(seed++) * 0.9; col3[i * 3] = Math.min(3, c.r * k * 2.4); col3[i * 3 + 1] = Math.min(3, c.g * k * 2.0); col3[i * 3 + 2] = Math.min(3, c.b * k * 1.4); }
  for (let i = 0; i < cnt; i++) life[i] = 0;
  return { points: pts, fire(sec) { burst = sec || 1.6; pts.visible = true; hide = burst + 1.8; }, active: () => burst > 0 || hide > 0,
    update(dt) { if (!pts.visible) return; if (burst > 0) { burst -= dt; for (let f = 0; f < positions.length; f++) for (let k = 0; k < n; k++) { const i = f * n + k; if (life[i] <= 0 && R(seed++) < dt * 7) spawn(i, f); } } hide -= dt; if (hide <= 0) { pts.visible = false; return; }
      for (let i = 0; i < cnt; i++) { if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; } life[i] -= dt; vel[i * 3 + 1] -= 9.8 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; if (pos[i * 3 + 1] < 0) { life[i] = 0; } else { const f = Math.min(1, life[i] * 1.5); col3[i * 3] *= 0.5 + 0.5 * f; } }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; } };
}
