// Encore Island 3D, the Smelter yard: the furnace building (chimney, smoke, glowing mouth, level pips) and the bar TRAY with its ingot pyramid.
// Appears once S.forge exists (the plate for it is made by hub_plates.js). Hot while S.forge.queue has shields in it. Local frame = FORGE / TRAY position.
import * as THREE from 'three';
import { Builder, C, W, PI, seg, GB, GOLD, lit, damp, clamp } from './kit.js';
import { Inst, QuadSet, outline, rbx, bll, stat } from './hub_fx.js';

const GOLDM = { m: GOLD, c: 0xffd84d };

export function buildForge(V, fx) {
  const g = new THREE.Group(); g.name = 'forge'; g.position.set(FORGE.x * W, 0, FORGE.y * W);
  const b = new Builder({ ao: 0.2 }), BX = -0.2, BW = 2.0, BHT = 1.7, BD = 1.5, MX = -0.2;
  rbx(b, 0xe8dcc4, 0, 0.05, 0.05, 2.7, 0.1, 2.15, 0.4); // stone apron
  rbx(b, 0x8a62e8, BX, BHT / 2 + 0.05, 0, BW, BHT, BD, 0.1); rbx(b, 0xb494ff, BX, BHT + 0.1, 0, BW + 0.14, 0.2, BD + 0.14, 0.4); rbx(b, 0x6a46c8, BX, 0.14, 0.0, BW + 0.1, 0.24, BD + 0.1, 0.3);
  const z0 = BD / 2 + 0.005; // brick joints on the front
  for (let r = 0; r < 4; r++) { const y = 0.5 + r * 0.33; b.box(0x5a3aa8, BX, y, z0, BW - 0.06, 0.028, 0.02); for (let c = 0; c < 5; c++) b.box(0x5a3aa8, BX - 0.8 + c * 0.4 + (r % 2) * 0.2, y + 0.165, z0, 0.026, 0.3, 0.02); }
  // furnace mouth frame: cream arch around the glowing opening
  rbx(b, C.cream, MX - 0.52, 0.55, z0 + 0.03, 0.14, 1.0, 0.1, 0.4); rbx(b, C.cream, MX + 0.52, 0.55, z0 + 0.03, 0.14, 1.0, 0.1, 0.4); b.tor(C.cream, MX, 1.0, z0 + 0.03, 0.45, 0.075, 8, seg(20)); b.part(GB.box(), 0xfff0d8, MX, 0.1, z0 + 0.12, 1.3, 0.1, 0.4, 0, 0, 0); // step
  rbx(b, 0x3a2a70, MX, 1.4, z0 + 0.02, 1.34, 0.16, 0.04, 0.4); // pip plaque
  for (const sx of [-1, 1]) for (const y of [0.24, 1.46]) bll(b, C.cream, BX + sx * 0.9, y, z0 + 0.03, 0.055, 1); // rivets
  // chimney: pink with gold bands
  rbx(b, 0xff9ac8, 0.52, 2.3, -0.28, 0.56, 1.4, 0.56, 0.25); rbx(b, 0xffc9de, 0.52, 3.04, -0.28, 0.72, 0.16, 0.72, 0.4); rbx(b, GOLDM, 0.52, 1.95, -0.28, 0.6, 0.07, 0.6, 0.5); rbx(b, GOLDM, 0.52, 2.55, -0.28, 0.6, 0.07, 0.6, 0.5); rbx(b, 0xffffff, 0.4, 2.3, -0.0, 0.07, 1.1, 0.04, 0.5);
  // fuel: coal heap on the left, a log stack on the right, a cart wheel prop
  for (const [x, z, r] of [[-1.45, 0.45, 0.2], [-1.25, 0.65, 0.16], [-1.55, 0.75, 0.15], [-1.38, 0.3, 0.14]]) bll(b, 0x3a3050, x, r * 0.8, z, r, 0.8);
  for (let i = 0; i < 3; i++) b.cylc(0xb07840, 1.15 + (i === 2 ? 0.0 : (i - 0.5) * 0.3), 0.18 + (i === 2 ? 0.26 : 0), 0.7, 0.14, 0.7, 10, PI / 2);
  for (let i = 0; i < 3; i++) b.cylc(0xe8c49a, 1.15 + (i === 2 ? 0.0 : (i - 0.5) * 0.3), 0.18 + (i === 2 ? 0.26 : 0), 1.06, 0.1, 0.02, 10, PI / 2);
  const qs = new QuadSet(); { const tilt = -0.6, sy = 2.28, sz = -0.15, sn = [-Math.sin(tilt), Math.cos(tilt)]; rbx(b, 0x4a2a90, -0.62, sy, sz, 1.28, 0.5, 0.1, 0.4, 0, tilt); fx.atlas.quad(qs, 'SMELTER', 1.2, -0.62, sy + sn[0] * 0.056, sz + sn[1] * 0.056, 0, tilt, 0.4); }
  g.add(stat(outline(b.build({ cast: true }))));
  g.add(stat(fx.atlas.mesh(qs)));
  // glowing mouth (arch shape, vertex gradient, brightness driven by heat)
  const sh = new THREE.Shape(); sh.moveTo(-0.38, 0); sh.lineTo(0.38, 0); sh.lineTo(0.38, 0.9); sh.absarc(0, 0.9, 0.38, 0, PI, false); sh.lineTo(-0.38, 0); const mg = new THREE.ShapeGeometry(sh, 10).toNonIndexed(), mp = mg.attributes.position, mc = new Float32Array(mp.count * 3);
  for (let i = 0; i < mp.count; i++) { const k = clamp(mp.getY(i) / 1.28, 0, 1); mc[i * 3] = 1.0; mc[i * 3 + 1] = 0.78 - k * 0.5; mc[i * 3 + 2] = 0.3 - k * 0.28; }
  mg.setAttribute('color', new THREE.BufferAttribute(mc, 3)); mg.deleteAttribute('uv');
  const mouthMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); mouthMat.userData.noCast = true; mouthMat.userData.noLook = true;
  const mouth = new THREE.Mesh(mg, mouthMat); mouth.position.set(MX, 0.12, z0 + 0.06); g.add(mouth);
  const fgeo = new THREE.ConeGeometry(1, 1, 7).toNonIndexed(); fgeo.deleteAttribute('uv'); const fmat = new THREE.MeshBasicMaterial({ fog: true }); fmat.userData.noLook = true;
  const flames = new Inst(fgeo, fmat, 6, { colors: true }); g.add(flames.mesh);
  const wx = g.position.x, wz = g.position.z; let heat = 0;
  return {
    group: g, dynGroups: [g],
    update(dt, t) {
      const f = S.forge; if (!f) { g.visible = false; return; } g.visible = true;
      const hot = f.queue.length > 0; heat = damp(heat, hot ? 1 : 0.28, 4, dt); const lvl = S.forgeLvl || 0;
      mouthMat.color.setRGB(0.55 + 0.9 * heat, 0.42 + 0.4 * heat, 0.4 + 0.1 * heat);
      flames.begin(); for (let i = 0; i < 5; i++) { const x = MX - 0.25 + i * 0.125, h = (0.22 + 0.25 * Math.sin(t * 9 + i * 1.7) * 0.5 + 0.12 * (i % 2) + 0.08) * (0.4 + 0.9 * heat), w = 0.075; flames.put(x, 0.13 + h / 2, z0 + 0.1, 0, 0, Math.sin(t * 7 + i) * 0.1, w, h, w, i % 2 ? 1.8 : 1.5, i % 2 ? 1.5 : 0.8, i % 2 ? 0.5 : 0.15); } flames.end();
      // ground + mouth glow
      fx.glow(wx + MX, 0.6, wz + z0 + 0.5, 2.4 + 0.5 * heat, 1.4, 0.55, 0.15, 0.12 + 0.4 * heat * (0.8 + 0.2 * Math.sin(t * 11)));
      fx.glow(wx + MX, 0.08, wz + z0 + 1.0, 3.0, 1.4, 0.6, 0.2, 0.1 + 0.28 * heat);
      // smoke up the chimney
      for (let i = 0; i < 6; i++) { const ph = (t * (0.3 + 0.2 * heat) + i / 6) % 1, y = 3.2 + ph * 1.9, x = 0.52 + Math.sin(ph * 6 + i * 2) * 0.22 + ph * 0.5, s = 0.3 + ph * 0.9; fx.puff(wx + x, y, wz - 0.28, s, 1.0, 0.97, 0.97, (1 - ph) * (0.35 + 0.45 * heat)); }
      if (hot) for (let i = 0; i < 4; i++) { const ph = (t * 0.9 + i / 4) % 1, id = i * 5 + Math.floor(t * 0.9 + i / 4); fx.glow(wx + MX + (Math.sin(id * 12.9) * 0.3), 0.5 + ph * 1.2, wz + z0 + 0.12, 0.12 * Math.sin(ph * PI) + 0.02, 1.8, 1.0, 0.3, 0.9 * Math.sin(ph * PI)); }
      // level pips: lit gold up to the smelter level
      for (let i = 0; i < 10; i++) { const on = i < lvl; fx.bulb(wx + MX - 0.54 + i * 0.12, 1.4, wz + z0 + 0.06, 0.04, on ? 1.8 : 0.35, on ? 1.4 : 0.3, on ? 0.45 : 0.3); }
      const L = V.labels; if (L) {
        L.pill('SMELTER LV' + (lvl + 1) + '  x' + BAR_MUL, wx + MX, 3.55, wz, { c1: '#ffe98a', c2: '#f0b422', px: 12 });
        L.pill(f.queue.length + '/' + forgeQ() + ' shields', wx, 0.05, wz + 1.45, { c1: '#ffffff', c2: '#dccaff', px: 11 });
      }
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mouthMat.dispose(); fmat.dispose(); }
  };
}

// ------------------------------------------------------------------ the bar tray
export function buildTray(V, fx) {
  const g = new THREE.Group(); g.name = 'tray'; g.position.set(TRAY.x * W, 0, TRAY.y * W);
  const b = new Builder({ ao: 0.2 });
  rbx(b, 0xe8c49a, 0, 0.1, 0, 2.5, 0.18, 0.95, 0.35); rbx(b, 0xb07840, 0, 0.22, 0.46, 2.5, 0.16, 0.08, 0.4); rbx(b, 0xb07840, 0, 0.22, -0.46, 2.5, 0.16, 0.08, 0.4); rbx(b, 0xb07840, -1.21, 0.22, 0, 0.08, 0.16, 0.95, 0.4); rbx(b, 0xb07840, 1.21, 0.22, 0, 0.08, 0.16, 0.95, 0.4);
  rbx(b, GOLDM, -1.0, 0.31, 0.46, 0.14, 0.05, 0.1, 0.5); rbx(b, GOLDM, 1.0, 0.31, 0.46, 0.14, 0.05, 0.1, 0.5);
  g.add(stat(b.build({ cast: true })));
  const barG = new Builder({ ao: 0 }); rbx(barG, 0xffffff, 0, 0, 0, 1, 1, 1, 0.3); rbx(barG, 0xeeeeee, 0, 0.45, 0, 0.78, 0.14, 0.78, 0.5);
  const bars = new Inst(barG.geometry(), lit(0xffffff, { vc: true, rough: 0.28, metal: 0.3 }), 15, { colors: true, cast: true }); g.add(bars.mesh);
  const c = new THREE.Color(), tray = { key: '', cols: [] }, kk = (v) => (typeof v === 'number' ? v : (v && v.k) || 1); // the sim stores plain numbers; tolerate {k} entries
  const wx = g.position.x, wz = g.position.z;
  return {
    group: g, dynGroups: [g],
    update(dt, t) {
      const f = S.forge; g.visible = !!f; if (!f) return;
      const tr = f.tray, show = Math.min(tr.length, 15), key = tr.slice(-15).map(kk).join(',');
      if (tray.key !== key) { tray.key = key; tray.cols.length = 0; for (let i = 0; i < show; i++) { const m = metal(kk(tr[tr.length - 1 - i])); c.set(m.col); tray.cols.push([c.r, c.g, c.b, m.glow ? 1 : 0]); } }
      bars.begin(); let idx = 0;
      for (let row = 0; row < 5 && idx < show; row++) { const per = 5 - row; for (let k = 0; k < per && idx < show; k++, idx++) { const col = tray.cols[idx], x = (k - (per - 1) / 2) * 0.46, y = 0.33 + row * 0.19; bars.put(x, y, 0.0, 0, 0, 0, 0.4, 0.17, 0.5, col[0], col[1], col[2]); if (col[3]) fx.glow(wx + x, y + 0.2, wz + 0.1, 0.7, 0.6, 1.3, 0.2, 0.35 + 0.2 * Math.sin(t * 4 + idx)); } }
      bars.end();
      const L = V.labels; if (L) L.pill(tr.length ? metal(kk(tr[tr.length - 1])).name + ' bars' : 'bars', wx, 0.05, wz + 0.95, { c1: '#ffe98a', c2: '#f0b422', px: 11 });
    },
    dispose() { g.removeFromParent(); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  };
}
