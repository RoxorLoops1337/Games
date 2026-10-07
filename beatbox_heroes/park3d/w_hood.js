// World module: HOOD map (W-STREET). A tabletop miniature diorama of Neon Row + the park + Tay's flat, tilt-shifted, with five place pins (park, home, shop, studio, bar).
// Spot ids = the five place ids (+ none else): tapping a pin (or its icon) emits ctx.events 'spot' {id, scene:'hood', locked, reason} through spots.activate.
//   world.setSpotState(id, { locked, reason, goal, badge }) greys a locked pin, shows the OPEN tag on open ones, bobs a goal pin higher. Time of day, rain and the day clock
//   follow lighting like every world. args.here = place id to mark with YOU ARE HERE ('street' default marks the bus stop, or args.px = street x in metres), args.locks = { bar:true }.
// The camera is the hood's own tabletop rig (drag = turn, wheel / pinch = zoom, slow idle sway); controls.js is parked (player hidden, setEnabled/setViewInset are taken over so the
// game's sheets can still re-frame the table).
import { THREE, flatMat } from './kit.js';
import { makeStore, glowMaterial, decalMaterial, signMaterial, haloMaterial, Buf, col } from './street_kit.js';
import { makeStreetAtlas } from './street_atlas.js';
import { K, HOOD_PIN, buildTable, buildRow, buildPark, buildFlat, buildLod } from './w_hood_build.js';

const D2R = Math.PI / 180, IDS = ['park', 'home', 'shop', 'studio', 'bar'];
const INFO = { park: { label: 'PARK', icon: 'gate', c: '#58b667', c2: '#2ee6ff' }, home: { label: 'HOME', icon: 'door', c: '#ff8a3d', c2: '#ffe14d' }, shop: { label: 'SHOP', icon: 'racks', c: '#2ec4b6', c2: '#ffe14d' }, studio: { label: 'STUDIO', icon: 'mixer', c: '#a86bff', c2: '#2ee6ff' }, bar: { label: 'BAR', icon: 'counter', c: '#ff3ea5', c2: '#2ee6ff' } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function guard(name, fn) { try { fn(); } catch (e) { console.error('[hood] ' + name + ' failed: ' + (e && e.stack || e)); } }

function pinGeometry(hex) {
  const B = new Buf({ rng: () => 0.5 }), c = col(hex), lo = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.6], hi = [Math.min(1, c[0] * 1.2 + 0.1), Math.min(1, c[1] * 1.2 + 0.1), Math.min(1, c[2] * 1.2 + 0.1)];
  B.lathe([[0.0, 0.0, lo], [0.05, 0.16, lo], [0.15, 0.4, c], [0.21, 0.62, hi], [0.18, 0.82, hi], [0.09, 0.95, c], [0.0, 0.99, c]], 10, 0, 0, 0, { tint: 0.02 });
  const w = [1.5, 1.45, 1.4]; for (let i = 0; i < 10; i++) { const a0 = i / 10 * 6.283, a1 = (i + 1) / 10 * 6.283; B.tri([0, 0.64, 0.214], [Math.cos(a0) * 0.09, 0.64 + Math.sin(a0) * 0.09, 0.214], [Math.cos(a1) * 0.09, 0.64 + Math.sin(a1) * 0.09, 0.214], w); }
  return B.geometry(false);
}

export default function create(ctx, args) {
  args = args || {}; const t0 = performance.now(); let buildMs = 0;
  const group = new THREE.Group(); group.name = 'hood';
  const S = makeStore(); S.atlas = makeStreetAtlas();
  guard('table', () => buildTable(S)); guard('row', () => buildRow(S)); guard('park', () => buildPark(S)); guard('flat', () => buildFlat(S));
  const add = (buf, mat, o) => { if (!buf.p.length) return null; const m = new THREE.Mesh(buf.geometry(false), mat); m.castShadow = !!(o && o.cast); m.receiveShadow = !(o && o.receive === false); m.frustumCulled = false; if (o && o.order) m.renderOrder = o.order; if (o && o.name) m.name = o.name; group.add(m); return m; };
  const mats = { B: flatMat(), GLOW: glowMaterial(0.62, 'h'), SIGN: signMaterial(S.atlas.tex, 0.95), DEC: decalMaterial(S.atlas.tex), FX: haloMaterial(S.atlas.glow) };
  add(S.B, mats.B, { cast: true, name: 'hood_main' }); add(S.GLOW, mats.GLOW, { receive: false, name: 'hood_glow' }); add(S.DEC, mats.DEC, { order: 2, name: 'hood_decals' }); add(S.SIGN, mats.SIGN, { order: 3, receive: false, name: 'hood_signs' }); add(S.FX, mats.FX, { order: 7, receive: false, name: 'hood_halos' });
  const lod = buildLod(S, ctx.kit.rng(4711), flatMat(), glowMaterial(0.62, 'hl')); group.add(lod);
  // the desk the diorama stands on, and a soft pool of light around the plinth
  const desk = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 0.2, 40), new THREE.MeshLambertMaterial({ color: '#8d7aa8' })); desk.position.y = -3.1; desk.receiveShadow = true; desk.name = 'hood_desk'; group.add(desk);

  // ---- miniature rain: short falling lines over the table (the park-scale rain ribbons are too fine to read from table distance)
  const ND = 520, rp = new Float32Array(ND * 6), rx0 = new Float32Array(ND), rz0 = new Float32Array(ND), ry0 = new Float32Array(ND), rv = new Float32Array(ND), rr = ctx.kit.rng(99);
  for (let i = 0; i < ND; i++) { rx0[i] = (rr() - 0.5) * 20; rz0[i] = (rr() - 0.5) * 18; ry0[i] = rr() * 9; rv[i] = 11 + rr() * 5; }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3)); const rainMat = new THREE.LineBasicMaterial({ color: '#c8d4ff', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.renderOrder = 15; rain.visible = false; rain.name = 'hood_rain'; group.add(rain);
  // ---- pins
  const pins = {}, state = {}; let pinTime = 0;
  IDS.forEach((id, i) => {
    const m = glowMaterial(0, 'pin'); delete m.userData.nightGlow; m.emissiveIntensity = 0.4; const mesh = new THREE.Mesh(pinGeometry(INFO[id].c), m); mesh.castShadow = true; mesh.name = 'pin_' + id; mesh.scale.setScalar(1.3);
    mesh.position.set(HOOD_PIN[id].x, 0.06, HOOD_PIN[id].z); group.add(mesh); pins[id] = { mesh, mat: m, base: HOOD_PIN[id], pop: 0, i }; state[id] = { locked: !!(args.locks && args.locks[id]), goal: false, badge: false, reason: '' };
  });
  // ---- YOU ARE HERE: a bobbing arrow + a label plate (billboards in one dynamic mesh with the OPEN tags)
  const here = args.here && HOOD_PIN[args.here] ? args.here : 'street', hx = here === 'street' ? (args.px === undefined ? 6 : args.px) * K : HOOD_PIN[here].x;
  const arrowB = new Buf({ rng: () => 0.5 }); arrowB.lathe([[0, 0, [1, 0.9, 0.2]], [0.17, 0.36, [1, 0.8, 0.15]], [0.07, 0.36, [1, 0.8, 0.15]], [0.07, 0.8, [1, 0.7, 0.1]], [0, 0.8, [1, 0.7, 0.1]]], 8, 0, 0, 0, { tint: 0 });
  const arrow = new THREE.Mesh(arrowB.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); arrow.scale.setScalar(1.2); arrow.rotation.x = Math.PI; arrow.name = 'you_are_here'; group.add(arrow);
  const NQ = IDS.length + 1, bq = new Float32Array(NQ * 12), bu = new Float32Array(NQ * 8), bg = new THREE.BufferGeometry(), idx = [];
  const rect = (n) => S.atlas.rect[n]; const uvs = IDS.map(() => rect('pinopen')).concat([rect('here')]);
  uvs.forEach((r, q) => { bu.set([r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], q * 8); idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3); });
  bg.setAttribute('position', new THREE.BufferAttribute(bq, 3)); bg.setAttribute('uv', new THREE.BufferAttribute(bu, 2)); bg.setIndex(idx);
  const bill = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: S.atlas.tex, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); bill.frustumCulled = false; bill.renderOrder = 12; bill.name = 'hood_tags'; group.add(bill);

  // ---- terrain contract (the hood has no walking: every cell is blocked, the player stays hidden at the middle of the table)
  const spotDefs = IDS.map((id) => ({ id, x: HOOD_PIN[id].x, z: HOOD_PIN[id].z, label: INFO[id].label, icon: INFO[id].icon, color: INFO[id].c, color2: INFO[id].c2, ring: 0.55, radius: 0.4, release: 0.7, iconY: 2.5, iconK: 0.5, pillar: 0.01, cine: { snap: false, face: 'toward', clip: 'wave', zoom: 0.1 } }));
  const terrain = {
    group, bounds: { minX: -3.4, maxX: 3.4, minZ: -3.4, maxZ: 3.4 }, blocked: () => true, heightAt: () => 0, pathDist: () => 0, keepout: () => true, paths: [], spotDefs, camera: { mode: 'follow' },
    anchors: { start: { x: 0, z: -3.0, rot: 0 }, lamps: [{ x: 0, y: 3.6, z: -250 }], graffiti: { x: 0, z: -250 }, buskSpot: { x: 0, z: -250 }, fountain: { x: 0, z: -3 }, gate: { x: 0, z: 0, rot: 0 } },
    pins: HOOD_PIN, here: { id: here, x: hx },
    stats() { return { lod: lod.userData.count, pins: IDS.length, buildMs: Math.round(buildMs) }; },
  };

  // ---- camera rig + taps
  const cam = ctx.camera, canvas = ctx.canvas, target = new THREE.Vector3(0, 0.5, 0.2), tmp = new THREE.Vector3(), ptr = new Map();
  const R = { yaw: 6 * D2R, pitch: 50 * D2R, zoom: 1, userYaw: 0, fov: 30, it: 0, ib: 0, enabled: true, down: null, pinch: 0, bindDone: false, tiltDiv: null, tiltChecked: 0, dist: 50 };
  function worldNow() { return ctx.host && ctx.host.world; }
  function project(x, y, z) { tmp.set(x, y, z).project(cam); const r = canvas.getBoundingClientRect(); return { x: (tmp.x * 0.5 + 0.5) * r.width, y: (-tmp.y * 0.5 + 0.5) * r.height, behind: tmp.z > 1 }; }
  function pickPin(px, py) {
    let best = null, bd = 56; for (const id of IDS) { const b = HOOD_PIN[id]; for (const y of [0.7, 1.2, 2.5]) { const q = project(b.x, y, b.z), d = Math.hypot(q.x - px, q.y - py); if (!q.behind && d < bd) { bd = d; best = id; } } }
    if (best) return best; const r = canvas.getBoundingClientRect(); tmp.set((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1, 0.5).unproject(cam); tmp.sub(cam.position); if (tmp.y > -1e-4) return null; const t = -cam.position.y / tmp.y, gx = cam.position.x + tmp.x * t, gz = cam.position.z + tmp.z * t; let bg = 0.85, id2 = null;
    for (const id of IDS) { const b = HOOD_PIN[id], d = Math.hypot(gx - b.x, gz - b.z); if (d < bg) { bg = d; id2 = id; } } return id2;
  }
  function tapPin(id) { if (!R.enabled) return; pins[id].pop = 1; const w = worldNow(); if (w && w.spots && w.spots.activate) w.spots.activate(id); else ctx.events.emit('spot', { id, scene: 'hood', kind: '', locked: !!state[id].locked, reason: state[id].reason }); }
  const onDown = (e) => { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) R.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; else { R.down = null; const a = [...ptr.values()]; R.pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); } try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
  const onMove = (e) => {
    const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptr.size >= 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (R.pinch > 0) R.zoom = clamp(R.zoom * (R.pinch / Math.max(20, d)), 0.55, 1.5); R.pinch = d; return; }
    if (R.down) { R.down.moved += Math.abs(dx) + Math.abs(dy); if (R.down.moved > 8) { R.userYaw = clamp(R.userYaw - dx * 0.006, -0.9, 0.9); R.pitch = clamp(R.pitch + dy * 0.0035, 36 * D2R, 66 * D2R); } }
  };
  const onUp = (e) => { const d = R.down; ptr.delete(e.pointerId); R.pinch = 0; R.down = null; if (d && d.moved < 9 && performance.now() - d.t < 600) { const r = canvas.getBoundingClientRect(), id = pickPin(e.clientX - r.left, e.clientY - r.top); if (id) tapPin(id); } };
  const onWheel = (e) => { R.zoom = clamp(R.zoom * (1 + Math.sign(e.deltaY) * 0.07), 0.55, 1.5); e.preventDefault(); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---- spot state (pins) -------------------------------------------------------------------------------------------------
  function setPin(id, st) { const s = state[id]; if (!s || !st) return; if ('locked' in st) s.locked = !!st.locked; if ('reason' in st) s.reason = st.reason || ''; if ('goal' in st) s.goal = !!st.goal; if ('badge' in st) s.badge = st.badge || false; }

  // ---- frame ---------------------------------------------------------------------------------------------------------------
  terrain.rig = R; terrain.pinMeshes = pins;
  let parked = false;
  function park(w) {
    parked = true; const c = w.controls; if (!c) return;
    try { c.setEnabled(false); } catch (e) { /* ignore */ } c.setEnabled = (b) => { R.enabled = !!b; }; c.setViewInset = (o) => { o = o || {}; R.it = +o.top || 0; R.ib = +o.bottom || 0; };
    c.focus = () => false; if (w.player && w.player.object) w.player.object.visible = false;
    if (w.lighting && w.lighting.group) w.lighting.group.traverse((o) => { if (o.isPoints || o.name === 'splashes' || o.name === 'wet_sheen') { o.visible = false; o.layers.set(5); } }); // the park's fireflies, dust, ripples and ground splashes are the wrong size for a tabletop
  }
  function frame(dt, t) {
    const w = worldNow(); if (!w) return; if (!parked) park(w);
    // camera: fit the whole table in the free part of the screen, gentle idle sway
    const cw = canvas.clientWidth || 360, ch = canvas.clientHeight || 640, asp = cw / ch, fov = R.fov, tanV = Math.tan(fov * D2R / 2), tanH = tanV * asp, yaw = R.yaw + R.userYaw + Math.sin(t * 0.17) * 0.05;
    const X = 15.4, Z = 14.2, w1 = Math.abs(X * Math.cos(yaw)) + Math.abs(Z * Math.sin(yaw)), hExt = (X * Math.abs(Math.sin(yaw)) + Z * Math.abs(Math.cos(yaw))) * Math.sin(R.pitch) + 4.2 * Math.cos(R.pitch);
    const free = clamp((ch - R.it - R.ib) / ch, 0.35, 1), dist = Math.max(w1 / (2 * tanH * 0.94), hExt / (2 * tanV * 0.92 * free)) * R.zoom; R.dist = dist;
    const cp = Math.cos(R.pitch), sp = Math.sin(R.pitch); cam.position.set(target.x + Math.sin(yaw) * cp * dist, target.y + sp * dist, target.z + Math.cos(yaw) * cp * dist); cam.lookAt(target);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } cam.near = Math.max(0.5, dist * 0.2); cam.far = dist * 6;
    const vis = Math.max(0.3 * ch, ch - R.it - R.ib), cy = R.it + vis * 0.5, off = -(cy - ch / 2); if (!cam.view || !cam.view.enabled || Math.abs(cam.view.offsetY - off) > 0.5 || cam.view.fullWidth !== cw) { cam.setViewOffset(cw, ch, 0, off, cw, ch); }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // fog scaled to the table, stronger tilt-shift, neon halo level
    const L = w.lighting, st = L && L.getState ? L.getState() : null; if (ctx.scene.fog) { ctx.scene.fog.near = dist * 0.85; ctx.scene.fog.far = dist * 3.2; } if (st) { st.tilt = 2.4; }
    const neon = st ? st.neon : 0.7; mats.FX.color.setScalar(0.03 + 0.7 * clamp(neon, 0, 1));
    // rain
    const rn = st ? st.rain || 0 : 0; rain.visible = rn > 0.02; if (rain.visible) { rainMat.opacity = 0.55 * rn; for (let i = 0; i < ND; i++) { const y = ((ry0[i] - t * rv[i]) % 9 + 9) % 9, x = rx0[i] + y * 0.12, o = i * 6; rp[o] = x; rp[o + 1] = y; rp[o + 2] = rz0[i]; rp[o + 3] = x + 0.07; rp[o + 4] = y + 0.55; rp[o + 5] = rz0[i]; } rainGeo.attributes.position.needsUpdate = true; }
    // pins
    pinTime += dt; const open = (id) => !state[id].locked;
    IDS.forEach((id, i) => {
      const p = pins[id], s = state[id], o = open(id); p.pop = Math.max(0, p.pop - dt * 3.2); const bob = Math.sin(pinTime * (s.goal ? 4.2 : 2.0) + i) * (s.goal ? 0.1 : 0.04), k = 1.3 * (o ? 1 : 0.9) * (1 + 0.1 * Math.sin(p.pop * Math.PI) + (s.goal ? 0.12 : 0));
      p.mesh.position.set(p.base.x, 0.06 + bob + (s.goal ? 0.12 : 0) + p.pop * 0.12, p.base.z); p.mesh.scale.setScalar(k); p.mesh.rotation.y = yaw;
      p.mat.color.setRGB(o ? 1 : 0.42, o ? 1 : 0.42, o ? 1 : 0.5); p.mat.emissiveIntensity = o ? 0.42 + 0.18 * Math.sin(pinTime * 3 + i) + (s.goal ? 0.3 : 0) : 0.0;
    });
    for (const id of IDS) { const sp = w.spots && w.spots.byId && w.spots.byId[id]; if (sp && sp.ex && sp.ex.beam) sp.ex.beam.scale.y = 0.15; } // the goal beam is built 16 m tall: shrink it to table size
    // YOU ARE HERE arrow + billboards (OPEN tags above open pins)
    const ay = 1.15 + Math.sin(t * 3.2) * 0.12; arrow.position.set(hx, ay + 0.3, 2.35); arrow.rotation.y = t * 1.6;
    const ex = cam.matrixWorld.elements, rx = ex[0], ry = ex[1], rz = ex[2], ux = ex[4], uy = ex[5], uz = ex[6]; let q = 0;
    const quad = (cx, cy2, cz, wq, hq) => { const o = q * 12, a = wq / 2, b = hq / 2; bq.set([cx - rx * a - ux * b, cy2 - ry * a - uy * b, cz - rz * a - uz * b, cx + rx * a - ux * b, cy2 + ry * a - uy * b, cz + rz * a - uz * b, cx + rx * a + ux * b, cy2 + ry * a + uy * b, cz + rz * a + uz * b, cx - rx * a + ux * b, cy2 - ry * a + uy * b, cz - rz * a + uz * b], o); q++; };
    const sc = dist / 50;
    IDS.forEach((id) => { const p = pins[id]; if (open(id)) quad(p.base.x, p.mesh.position.y + 1.66, p.base.z, 0.62 * sc * 1.1, 0.26 * sc * 1.1); else bq.fill(0, q++ * 12, q * 12); });
    quad(hx, ay + 1.55, 2.35, 1.6 * sc * 1.1, 0.47 * sc * 1.1); bg.attributes.position.needsUpdate = true;
    // CSS tilt-shift fallback when the post chain is not running (low tier)
    R.tiltChecked += dt; if (R.tiltChecked > 1.2 && !R.tiltDiv && ctx.shared && !(ctx.shared.post && ctx.shared.post.active)) addTiltFallback();
  }
  function addTiltFallback() {
    const dom = canvas.parentElement; if (!dom) return; const mk = (top) => { const d = document.createElement('div'); d.setAttribute('data-park3d', 'tilt'); d.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none;z-index:1;height:20%;' + (top ? 'top:0;' : 'bottom:0;') + 'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);-webkit-mask-image:linear-gradient(' + (top ? 'to bottom' : 'to top') + ',#000,transparent);mask-image:linear-gradient(' + (top ? 'to bottom' : 'to top') + ',#000,transparent)'; dom.appendChild(d); return d; };
    R.tiltDiv = [mk(true), mk(false)];
  }

  IDS.forEach((id) => { if (state[id].locked) setPin(id, { locked: true }); });
  buildMs = performance.now() - t0;
  return {
    terrain, flora: null, npcSpecs: [], profile: 'out',
    update: frame,
    setSpotState(id, st) { setPin(id, st); },
    dispose() { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel); if (R.tiltDiv) R.tiltDiv.forEach((d) => { if (d.parentElement) d.parentElement.removeChild(d); }); },
  };
}
