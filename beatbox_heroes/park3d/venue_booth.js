// VENUE 'booth' (Stage and Club Artist INT-B): the practice room. A dim rehearsal space: foam-wedge walls (one textured mesh), teal carpet tiles, a low rubber riser for the performer, a glass vocal cabin with a
// glowing ON AIR sign, a mixing desk with VU meters, near-field monitors, a sofa, a mirror strip, four big metronome lamps on the back wall that light one beat at a time, and GHOST BEAT LINES: faint
// white bars that slide down the highway to the receptor a beat before the notes arrive (api.setGhost(bool); fed by update(dt,t,{beat,spb,approach})).
// Performer at the local origin, deck top at opts.stageH. Highway constants (mg_rhythm_hw): HIT_Z 2.2, SPAWN_Z -9.2 (world), lane width 1.06. api: setGhost(on), setMetronome(on).
import { THREE, rng, mergeGeometries } from './kit.js';
import { speaker, wedge, lightPool, K, mix, mul, bar, col, cylT, GREENN, CYANN, PINKN, REDN, WARMS, aoTint } from './venue_kit.js';
import { paintFloor, W3 } from './venue_base.js';
import { makeBarAtlas } from './bar_atlas.js';

const HIT_Z = 2.2, SPAWN_Z = -9.2, LW = 1.06;
function foamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#2b2740'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64, y = j * 64, teal = (i + j) % 5 === 0; const base = teal ? ['#2f8f93', '#1f6670', '#58b9b2', '#175058'] : ['#4a4468', '#2f2b48', '#6a6490', '#241f3a'];
    const tri = (pts, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(pts[0], pts[1]); g.lineTo(pts[2], pts[3]); g.lineTo(pts[4], pts[5]); g.closePath(); g.fill(); };
    tri([x, y, x + 64, y, x + 32, y + 32], base[2]); tri([x + 64, y, x + 64, y + 64, x + 32, y + 32], base[1]); tri([x + 64, y + 64, x, y + 64, x + 32, y + 32], base[3]); tri([x, y + 64, x, y, x + 32, y + 32], base[0]); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

export function buildVenueBooth(V) {
  const { S, TA, TB, o } = V, B = S.B, GL = S.GLOW, h = o.stageH, R = rng(o.seed * 13 + 1); S.atlas = makeBarAtlas();
  const XW = 7.5, ZB = -3.2, ZF = 27, HH = 8;
  // ---------------------------------------------------------------- foam walls (one mesh, repeat texture) + trim
  const tex = foamTexture(), plane = (w, hgt, x, y, z, ry) => { const g = new THREE.PlaneGeometry(w, hgt); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.4, uv.getY(i) * hgt / 1.4); g.rotateY(ry); g.translate(x, y, z); return g; };
  const walls = mergeGeometries([plane(XW * 2, HH, 0, HH / 2, ZB, 0), plane(ZF - ZB, HH, -XW, HH / 2, (ZF + ZB) / 2, Math.PI / 2), plane(ZF - ZB, HH, XW, HH / 2, (ZF + ZB) / 2, -Math.PI / 2)]);
  const wm = new THREE.Mesh(walls, new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0.22, 0.2, 0.3), emissiveMap: tex })); wm.name = 'booth_foam'; wm.receiveShadow = true; S.group.add(wm);
  [[-XW + 0.05, 0], [XW - 0.05, 0]].forEach(([x]) => B.box(x, 0, (ZF + ZB) / 2, 0.1, 0.5, ZF - ZB, K.ink, { base: 0 })); B.box(0, 0, ZB + 0.05, XW * 2, 0.5, 0.1, K.ink, { base: 0 });
  // ---------------------------------------------------------------- floor: dark teal carpet tiles; the performer's riser
  paintFloor(B, -XW, XW, ZB, ZF, 0.75, (x, z, i, j) => mul((i + j) % 2 ? col('#2a6a74') : col('#245a66'), 0.9 + 0.12 * ((i * 7 + j * 3) % 5) / 5));
  B.box(0, 0, 0, 6.2, h, 4.4, mix(K.deckD, col('#3a2a50'), 0.5), { base: 0.3, tint: 0.02, top: mix(K.deckL, K.plumL, 0.3) }); B.box(0, h - 0.002, 0, 5.8, 0.01, 4.0, mix(K.deckL, K.plumL, 0.1), { base: 0 }); GL.box(0, h * 0.4, 2.2 + 0.004, 6.1, 0.05, 0.01, mul(CYANN, 0.5), { base: 0, tint: 0 });
  lightPool(S.SOFT, 0, h + 0.02, 0, 3.2, 2.0, '#ffd8a8', 0.3); lightPool(S.SOFT, 0, 0.02, 6, 6.0, 4.0, '#9af0ff', 0.1);
  // ---------------------------------------------------------------- vocal cabin (right back): frame, foam inside, glass, ON AIR
  { const cx = 4.5, cz = -0.2, w = 3.0, d = 3.0, hh = 3.0; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => B.box(cx + a * w / 2, 0, cz + b * d / 2, 0.12, hh, 0.12, K.ink, { base: 0.1 }));
    B.box(cx, hh, cz, w + 0.12, 0.12, d + 0.12, K.ink, { base: 0.1 }); B.box(cx, 0, cz - d / 2, w, hh, 0.1, mix(K.plumD, K.ink, 0.3), { base: 0.2 }); B.box(cx + w / 2, 0, cz, 0.1, hh, d, mix(K.plumD, K.ink, 0.3), { base: 0.2 });
    const gl = [0.55, 0.9, 1.0, 0.16]; S.GLASS.quad([cx - w / 2, 0.1, cz + d / 2], [cx + w / 2, 0.1, cz + d / 2], [cx + w / 2, hh, cz + d / 2], [cx - w / 2, hh, cz + d / 2], gl); S.GLASS.quad([cx - w / 2, 0.1, cz - d / 2], [cx - w / 2, 0.1, cz + d / 2], [cx - w / 2, hh, cz + d / 2], [cx - w / 2, hh, cz - d / 2], gl);
    cylT(B, cx - 0.6, 0.1, cz - 0.6, 0.015, 0.015, 1.5, 6, K.steel, {}); B.box(cx - 0.6, 1.62, cz - 0.4, 0.1, 0.1, 0.5, K.steelD, { base: 0 }); B.lathe([[0.16, 1.5, K.ink], [0.17, 1.6, K.steelD], [0.16, 1.7, K.ink]], 10, cx - 0.6, 0, cz - 0.15, {});
    B.box(cx + 0.5, 0, cz - 0.5, 0.5, 0.5, 0.5, K.plumL, { base: 0.1 }); S.screen('sign_live', cx, hh + 0.45, cz + d / 2, 1.2, 0.6, 0, 0, [1.3, 1.3, 1.3]); S.lights.push({ x: cx, y: hh + 0.4, z: cz + d / 2 + 0.3, color: '#ff4a4a', r: 2, i: 0.5, kind: 'neon' }); }
  // ---------------------------------------------------------------- mixing desk with meters and monitors, sofa, mirror, plant
  { const dx = -5.6, dz = 0.6; B.push(dx, 0, dz, 0.35); B.box(0, 0, 0, 2.6, 0.85, 1.1, K.ink, { base: 0.2, top: K.inkL }); B.quad([-1.3, 0.85, -0.55], [-1.3, 0.85, 0.55], [1.3, 0.85, 0.55], [1.3, 0.85, -0.55], K.inkL);
    for (let i = 0; i < 12; i++) { GL.box(-1.1 + i * 0.2 - 0.0, 0.86, 0.1, 0.04, 0.02, 0.28, i % 3 ? GREENN : CYANN, { base: 0, tint: 0 }); } for (let i = 0; i < 4; i++) B.box(-0.9 + i * 0.6, 0.86, -0.2, 0.3, 0.015, 0.1, K.steel, { base: 0 });
    B.box(0, 0.85, -0.5, 2.0, 0.6, 0.05, K.ink, { base: 0 }); GL.box(0, 0.98, -0.47, 1.8, 0.4, 0.01, [0.4, 1.6, 1.2], { base: 0, tint: 0 }); B.pop(); S.hit.circle(dx, dz, 1.3);
    [-1, 1].forEach((s) => { B.box(s * 3.3, 0, 1.0, 0.1, 1.2, 0.1, K.steelD, { base: 0 }); speaker(B, s * 3.3, 1.0, -s * 0.2, { y0: 1.2, h: 1, s: 0.8 }); }); }
  { const sx = -5.8, sz = 8; B.box(sx, 0, sz, 1.1, 0.45, 2.6, K.velvetD, { base: 0.15, tint: 0.04, top: K.velvet }); B.box(sx - 0.45, 0.45, sz, 0.25, 0.55, 2.6, K.velvet, { base: 0.1, tint: 0.04 }); [-0.9, 0.9].forEach((dz) => B.box(sx, 0.45, sz + dz, 1.1, 0.3, 0.25, K.velvetL, { base: 0.1, tint: 0.04 })); B.box(sx + 1.3, 0, sz, 0.8, 0.4, 1.2, K.woodL, { base: 0.1 }); }
  S.GLASS.quad([XW - 0.06, 0.9, 7], [XW - 0.06, 0.9, 20], [XW - 0.06, 3.6, 20], [XW - 0.06, 3.6, 7], [0.7, 0.95, 1.0, 0.22]); B.box(XW - 0.1, 0.85, 13.5, 0.08, 0.1, 13.2, K.gold, { base: 0 }); B.box(XW - 0.1, 3.6, 13.5, 0.08, 0.1, 13.2, K.gold, { base: 0 });
  // ---------------------------------------------------------------- metronome lamps (instanced, one beat lit at a time) and the sign wall
  const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: false }), 4); lamps.frustumCulled = false; lamps.position.set(0, 5.4, ZB + 0.06); lamps.name = 'metronome'; S.group.add(lamps);
  B.box(0, 4.6, ZB + 0.02, 7.0, 1.8, 0.06, K.ink, { base: 0 }); TA.box(0, 4.55, ZB + 0.06, 7.1, 0.05, 0.03, W3, { base: 0, tint: 0 }); TB.box(0, 6.45, ZB + 0.06, 7.1, 0.05, 0.03, W3, { base: 0, tint: 0 });
  const dm = new THREE.Matrix4(); for (let i = 0; i < 4; i++) { dm.makeTranslation((i - 1.5) * 1.7, 0, 0); lamps.setMatrixAt(i, dm); lamps.setColorAt(i, new THREE.Color('#222')); }
  S.decal('poster_open', -5.2, 4.2, ZB + 0.02, 1.3, 1.8, 0, 0, [1.05, 1.05, 1.05]); S.decal('poster_batt', 5.2, 4.2, ZB + 0.02, 1.3, 1.8, 0, 0, [1.05, 1.05, 1.05]);
  S.screen('sign_open', 0, 7.3, ZB + 0.04, 2.2, 0.95, 0, 0, [1.1, 1.1, 1.1]);
  // ---------------------------------------------------------------- ghost beat lines + lane guides (instanced translucent bars on the highway)
  const NG = 10, gGeo = new THREE.PlaneGeometry(4 * LW + 0.5, 0.09); gGeo.rotateX(-Math.PI / 2);
  const gMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff7ff'), transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const ghost = new THREE.InstancedMesh(gGeo, gMat, NG); ghost.frustumCulled = false; ghost.name = 'ghost_beats'; ghost.renderOrder = 6; S.group.add(ghost);
  const hitL = HIT_Z - o.z, spawnL = SPAWN_Z - o.z; let ghostOn = true, metOn = true; const gm = new THREE.Matrix4(), gs = new THREE.Vector3(), gq = new THREE.Quaternion(), gp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const tmpC = new THREE.Color(); let beatIdx = 0;
  V.ups.push((dt, t, e, pulse, v) => {
    const spb = v.spb || 0.6, appr = v.approach || 1.43, beat = v.beat !== undefined ? v.beat : V.beatF, frac = beat - Math.floor(beat), vis = appr / spb, spacing = (hitL - spawnL) / vis; beatIdx = ((Math.floor(beat) % 4) + 4) % 4;
    for (let k = 0; k < NG; k++) { const ahead = k - frac, z = hitL - ahead * spacing, on = ghostOn && ahead > -0.15 && ahead < vis + 0.05; gp.set(0, 0.05, z); gs.set(on ? 1 : 0.0001, 1, on ? 1 : 0.0001); gm.compose(gp, gq, gs); ghost.setMatrixAt(k, gm); }
    ghost.instanceMatrix.needsUpdate = true; gMat.opacity = 0.2 + 0.25 * pulse + 0.1 * e;
    for (let i = 0; i < 4; i++) { const lit = metOn && i === beatIdx; tmpC.set(lit ? (i === 0 ? '#ff4f8b' : '#35f2e0') : '#2a2440').multiplyScalar(lit ? 1.4 + 1.2 * pulse : 1); lamps.setColorAt(i, tmpC); } lamps.instanceColor.needsUpdate = true;
  });
  V.anchors.performer = { x: 0, y: h, z: 0 }; V.anchors.stageFront = { x: 0, y: h, z: 2.2 }; V.anchors.rig = [{ x: -3, y: 6.5, z: 1 }, { x: 3, y: 6.5, z: 1 }, { x: 0, y: 6.5, z: 6 }, { x: -3, y: 6.5, z: 10 }, { x: 3, y: 6.5, z: 10 }, { x: 0, y: 6.5, z: 14 }]; V.anchors.stageCenter = { x: 0, z: 0 };
  S.lights.push({ x: -5.6, y: 1.6, z: 0.6, color: '#7dffd8', r: 2.4, i: 0.5, kind: 'tv' }, { x: 0, y: 5.0, z: -2.5, color: '#ffd8a8', r: 3.0, i: 0.5, kind: 'lamp' });
  const P = (x, y, z) => [x + o.x, y, z + o.z];
  V.cams.play = { pos: P(0, 6.0, 23.8), look: P(0, 0.5, 5.4), fov: 0 }; V.cams.stage = { pos: P(0, 3.0, 7), look: P(0, 2.2, 0), fov: 46 }; V.cams.wide = { pos: P(0, 7, 26), look: P(0, 1.5, 4), fov: 56 };
  V.disposers.push(() => { tex.dispose(); });
  return { hint: { profile: 'studio', theme: 'cyan', interior: true, ceilY: 8 }, api: { setGhost(on) { ghostOn = !!on; ghost.visible = ghostOn; }, setMetronome(on) { metOn = !!on; } } };
}
