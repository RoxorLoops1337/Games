// VENUE KIT (Stage and Club Artist INT-B): shared builders for the bar world, the arena world and the rhythm venues (venue_*.js).
// Same house style as flat3d: every static part is written into a few Buf stores (flat_kit.js makeStore) and merged to ~6 meshes; dynamic bits (LED walls, chalkboard) are canvas textures.
//   meshesFromStore(S, group, o) -> { main, glow, dec, scr, sg, scrMat, glowMat, tris }       (one lit mesh, one glow mesh, decals, always-on screens, soft shadows + glass)
//   truss(B, a, b, s, color)  speaker(B, x, z, ry, o)  parCan(B, GL, x, y, z, yaw, pitch, color)  micStand(B, x, y0, z, ry)  curtain(B, o)  podium(B, GL, x, y0, z, r, color, neon)
//   makeLed(w, h, res)  -> { mesh, draw(fn), text(lines, o), tex, setRect }      canvas LED wall (MeshBasic, not tone mapped, so it blooms)
//   stageDeck(B, o) deck with front lip, rim light glow strip and step blocks
// All colours are linear [r,g,b] arrays (flat_kit col()). Glow colours may exceed 1 (bloom).
import { THREE, flatMat, mergeGeometries } from './kit.js';
import { Buf, col, mix, mul, aoTint, bar, glowLambert, makeStore, P, WARM, WARMS, PINKN, CYANN, REDN, GREENN, WHITEN, YELN } from './flat_kit.js';
export { THREE, Buf, col, mix, mul, aoTint, bar, glowLambert, makeStore, P, WARM, WARMS, PINKN, CYANN, REDN, GREENN, WHITEN, YELN };

export const VIOLETN = [1.6, 0.7, 3.2], ORANGEN = [3.2, 1.4, 0.4], GOLDN = [3.2, 2.2, 0.5], LIMEN = [1.5, 3.0, 0.5];
// club palette (hue shifted, no pure black or white)
export const K = {
  deck: col('#3a2f52'), deckL: col('#54476f'), deckD: col('#241a38'), ink: col('#2b2438'), inkL: col('#3f3857'), steel: col('#8d8aa8'), steelL: col('#b9b7d0'), steelD: col('#5e5a7a'),
  velvet: col('#b02a58'), velvetD: col('#6e1a45'), velvetL: col('#d8487a'), gold: col('#e0b04a'), goldD: col('#a67a2c'), plum: col('#5a3a78'), plumD: col('#3b2655'), plumL: col('#7a56a0'),
  teal: col('#2f8f93'), tealD: col('#1f6670'), brick: col('#8e4455'), brickD: col('#6a2f44'), brickL: col('#b05a64'), wood: col('#7a4a3a'), woodD: col('#4e3040'), woodL: col('#b4784c'), cream: col('#efe1c4'), creamD: col('#cdb99a'),
  mint: col('#8fd6c0'), green: col('#3fd37a'), greenD: col('#1f8a52'), pink: col('#ff4f8b'), cyan: col('#35f2e0'), yellow: col('#ffd23f'), lime: col('#9dff4a'), violet: col('#7b5cff'), red: col('#d9433f'), orange: col('#ff8a3d'),
};
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export { sm };

// ------------------------------------------------------------------ stores to meshes (same recipe as flat.js)
export function meshesFromStore(S, group, o) {
  o = o || {}; const add = (geo, mat, opt) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!(opt && opt.cast); m.receiveShadow = !(opt && opt.receive === false); if (opt && opt.order) m.renderOrder = opt.order; if (opt && opt.name) m.name = opt.name; m.frustumCulled = false; group.add(m); return m; };
  const R = { tris: 0 }; const cnt = (B) => B.p.length / 9;
  const main = add(S.B.geometry(false), flatMat(), { cast: o.cast !== false, name: (o.prefix || 'v') + '_main' }); R.main = main; R.tris += cnt(S.B);
  const glowMat = glowLambert(1.0); glowMat.userData.beatGain = o.beatGain === undefined ? 0.45 : o.beatGain; R.glowMat = glowMat; R.glow = add(S.GLOW.geometry(false), glowMat, { cast: false, name: (o.prefix || 'v') + '_glow' }); R.tris += cnt(S.GLOW);
  if (S.atlas && S.DEC.p.length) { const decMat = new THREE.MeshLambertMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); R.dec = add(S.DEC.geometry(false), decMat, { name: (o.prefix || 'v') + '_decals', order: 2 }); R.tris += cnt(S.DEC); }
  if (S.atlas && S.SCR.p.length) { const scrMat = new THREE.MeshBasicMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); scrMat.userData.screen = true; R.scrMat = scrMat; R.scr = add(S.SCR.geometry(false), scrMat, { receive: false, name: (o.prefix || 'v') + '_screens', order: 3 }); R.tris += cnt(S.SCR); }
  if (S.SOFT.p.length || S.GLASS.p.length) { const sg = mergeGeometries([S.SOFT.geometry(false), S.GLASS.geometry(false)].filter((g) => g.attributes.position.count)); const sgMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }); R.sg = add(sg, sgMat, { receive: false, order: 4, name: (o.prefix || 'v') + '_soft_glass' }); R.tris += cnt(S.SOFT) + cnt(S.GLASS); }
  return R;
}

// ------------------------------------------------------------------ small parts
// square truss between two points: 4 chords, zig-zag diagonals on the two sides and the top
export function truss(B, a, b, s, color, dcolor, step) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6, ux = dx / L, uy = dy / L, uz = dz / L;
  color = color || K.steel; let px = -uz, pz = ux; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl; const h = s / 2; step = step || Math.max(0.35, s * 1.2);
  const at = (t, sx, sy) => [a[0] + dx * t + px * h * sx, a[1] + dy * t + h * sy, a[2] + dz * t + pz * h * sx];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bar(B, at(0, sx, sy), at(1, sx, sy), 0.035, 0.035, color, { base: 0.1 });
  const n = Math.max(1, Math.round(L / step)); dcolor = dcolor || color;
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, f = i % 2 ? 1 : -1;
    bar(B, at(t0, -1, f), at(t1, -1, -f), 0.02, 0.02, dcolor, { base: 0.1 }); bar(B, at(t0, 1, f), at(t1, 1, -f), 0.02, 0.02, dcolor, { base: 0.1 }); bar(B, at(t0, f, 1), at(t1, -f, 1), 0.02, 0.02, dcolor, { base: 0.1 }); }
}
// PA speaker cabinet standing on y0 at (x, z), facing +z rotated by ry. o: {s scale, h cabinets high (1..3), sub (bool), color}
export function speaker(B, x, z, ry, o) {
  o = o || {}; const s = o.s || 1, hh = o.h || 1, c = o.color || K.ink, W = 0.62 * s, Hh = 0.86 * s, D = 0.5 * s, y0 = o.y0 || 0;
  B.push(x, y0, z, ry || 0);
  for (let k = 0; k < hh; k++) {
    const yb = k * (Hh + 0.02); B.box(0, yb, 0, W, Hh, D, c, { taper: 0.95, base: 0.12, tint: 0.03, top: mix(c, K.steelD, 0.35) });
    B.box(0, yb + Hh - 0.02, 0, W + 0.03, 0.04, D + 0.03, K.steelD, { base: 0 }); // rim
    [-1, 1].forEach((sx) => [0, 1].forEach((yy) => B.box(sx * (W / 2 - 0.02), yb + (yy ? Hh - 0.08 : 0.0), D / 2 - 0.02, 0.07, 0.08, 0.07, K.gold, { base: 0 }))); // corner guards
    B.push(0, yb + Hh * 0.36, D / 2 - 0.005, 0, 1, Math.PI / 2); B.lathe([[W * 0.38, 0, K.inkL], [W * 0.36, 0.03, K.steelD], [W * 0.17, 0.09, K.ink], [W * 0.05, 0.1, K.steel], [0, 0.1, K.inkL]], 9, 0, 0, 0, {}); B.pop();
    if (!o.sub) { B.push(0, yb + Hh * 0.8, D / 2 - 0.005, 0, 1, Math.PI / 2); B.lathe([[W * 0.2, 0, K.inkL], [W * 0.17, 0.04, K.steel], [0, 0.07, K.steelL]], 8, 0, 0, 0, {}); B.pop(); }
  }
  B.pop();
}
// monitor wedge
export function wedge(B, x, y0, z, ry, w) {
  w = w || 0.7; B.push(x, y0, z, ry || 0); B.box(0, 0, 0, w, 0.3, 0.42, K.ink, { taper: 1, base: 0.1 }); B.quad([-w / 2, 0.3, -0.21], [-w / 2, 0.14, 0.21], [w / 2, 0.14, 0.21], [w / 2, 0.3, -0.21], mul(K.steelD, 1.1)); B.box(0, 0.12, 0.2, w * 0.86, 0.02, 0.04, K.steel, { base: 0 }); B.pop();
}
// stage par can on a stand or hanging from a bar: housing aimed along (yaw, pitch); lens in the glow store. pitch > 0 looks down.
export function parCan(B, GL, x, y, z, yaw, pitch, glowCol, r) {
  r = r || 0.12; B.push(x, y, z, yaw, 1, pitch || 0);
  B.box(0, -r * 1.55, 0, r * 2.5, r * 0.5, r * 1.4, K.inkL, { base: 0 }); // yoke
  B.push(0, 0, 0, 0, 1, Math.PI / 2); B.lathe([[r * 0.9, -r * 1.2, K.ink], [r, -r * 0.2, K.inkL], [r * 1.05, r * 1.0, K.ink], [r * 0.7, r * 1.05, K.steelD]], 8, 0, 0, 0, {}); B.pop();
  GL.push(x, y, z, yaw, 1, pitch || 0); GL.push(0, 0, 0, 0, 1, Math.PI / 2); GL.lathe([[r * 0.7, r * 1.06, glowCol], [0, r * 1.08, mul(glowCol, 1.2)]], 8, 0, 0, 0, {}); GL.pop(); GL.pop();
  B.pop();
}
// microphone stand with boom and mic head (glow dot on the grille)
export function micStand(B, GL, x, y0, z, ry, tall) {
  tall = tall || 1.45; B.push(x, y0, z, ry || 0);
  B.lathe([[0.2, 0, K.ink], [0.2, 0.025, K.steelD], [0.04, 0.05, K.steel], [0, 0.05, K.steel]], 8, 0, 0, 0, {});
  B.cyl(0, 0.04, 0, 0.018, 0.016, tall, 6, K.steel, { base: 0.1 });
  bar(B, [0, tall, 0], [0, tall + 0.12, 0.3], 0.014, 0.014, K.steel);
  B.push(0, tall + 0.12, 0.3, 0, 1, 0.5); B.lathe([[0.035, -0.07, K.ink], [0.055, 0.0, K.steelD], [0.05, 0.09, K.steelL], [0.0, 0.14, K.steelL]], 8, 0, 0, 0, {}); B.pop();
  B.pop();
}
// guitar leaning (stage dressing)
export function guitar(B, x, y0, z, ry, lean, color) {
  color = color || K.orange; B.push(x, y0, z, ry || 0, 1, lean || 0.12);
  B.blob(0, 0.28, 0, 0.17, 0.26, 0.05, mul(color, 0.7), color, { detail: 1, jit: 0.03 }); B.blob(0, 0.58, 0, 0.13, 0.17, 0.05, mul(color, 0.7), color, { detail: 1, jit: 0.03 });
  B.box(0, 0.62, 0.0, 0.05, 0.62, 0.035, K.woodD, { base: 0 }); B.box(0, 1.2, 0.0, 0.08, 0.17, 0.04, K.ink, { base: 0 }); B.box(0, 0.3, 0.052, 0.07, 0.2, 0.01, K.ink, { base: 0 }); B.pop();
}

// velvet stage curtain: vertical folds between x0..x1, y0..y1 at depth z (facing +z). o: {folds, depth, a, b (colours), fringe, valance}
export function curtain(B, o) {
  const { x0, x1, y0, y1, z } = o, n = Math.max(2, Math.round((x1 - x0) / (o.fw || 0.22))), A = o.a || K.velvet, Bc = o.b || K.velvetD, dep = o.depth || 0.16, rows = 4, R = o.rand || Math.random;
  const zz = (i) => z + dep * (i % 2 ? 1 : 0) * (0.85 + 0.15 * Math.sin(i * 1.7));
  for (let i = 0; i < n; i++) {
    const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, za = zz(i), zb = zz(i + 1), peak = i % 2 ? 0 : 1; // folds: even edges recessed
    for (let j = 0; j < rows; j++) {
      const ya = y0 + (y1 - y0) * j / rows, yb = y0 + (y1 - y0) * (j + 1) / rows, ka = peak ? 1.0 : 0.62, kb = peak ? 0.62 : 1.0, ta = 0.7 + 0.3 * sm(0, 1, j / rows), tb = 0.7 + 0.3 * sm(0, 1, (j + 1) / rows);
      const c = (k, t) => mul(mix(Bc, A, k), t * (0.95 + R() * 0.08));
      B.quad([xa, ya, za], [xb, ya, zb], [xb, yb, zb], [xa, yb, za], c(ka, ta), c(kb, ta), c(kb, tb), c(ka, tb));
    }
  }
  if (o.fringe !== false) { for (let i = 0; i < n; i++) { const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n; B.quad([xa, y0, zz(i) + 0.01], [xb, y0, zz(i + 1) + 0.01], [xb, y0 + 0.07, zz(i + 1) + 0.01], [xa, y0 + 0.07, zz(i) + 0.01], K.gold); } }
  if (o.valance) { // scalloped swag along the top
    const vh = o.valance, m = Math.max(3, Math.round((x1 - x0) / 0.9));
    for (let i = 0; i < m; i++) { const xa = x0 + (x1 - x0) * i / m, xb = x0 + (x1 - x0) * (i + 1) / m, xm = (xa + xb) / 2, c0 = mul(A, 1.05), c1 = mul(Bc, 1.0);
      B.quad([xa, y1 - vh * 0.55, z + dep + 0.04], [xm, y1 - vh, z + dep + 0.12], [xm, y1, z + dep + 0.1], [xa, y1, z + dep + 0.04], c0, c1, c1, c0);
      B.quad([xm, y1 - vh, z + dep + 0.12], [xb, y1 - vh * 0.55, z + dep + 0.04], [xb, y1, z + dep + 0.04], [xm, y1, z + dep + 0.1], c1, c0, c0, c1);
      B.box(xm, y1 - vh - 0.02, z + dep + 0.12, 0.07, 0.07, 0.07, K.gold, { base: 0 }); }
    B.box((x0 + x1) / 2, y1, z + dep + 0.02, x1 - x0 + 0.1, 0.1, 0.12, K.goldD, { base: 0.1 });
  }
}
// round podium with a neon rim: platform of radius r from y0 up h. col = body colour, neon = glow colour
export function podium(B, GL, x, y0, z, r, h, color, neon, ry) {
  B.lathe([[r, 0, aoTint(color, 0.5)], [r, h * 0.85, color], [r * 0.98, h, mul(color, 1.2)], [0, h, mul(color, 1.25)]], 10, x, y0, z, { ry: ry || 0, rot: Math.PI / 10 });
  GL.lathe([[r * 1.012, h * 0.55, neon], [r * 1.012, h * 0.72, neon]], 10, x, y0, z, { rot: Math.PI / 10, tint: 0 });
  GL.lathe([[r * 0.98, h + 0.004, neon], [r * 0.9, h + 0.004, neon]], 10, x, y0, z, { rot: Math.PI / 10, tint: 0 });
}
// stage deck: top at y = h, spanning x0..x1, z0..z1 (z1 = front). Front lip glow strip + side faces; returns nothing
export function stageDeck(B, GL, o) {
  const { x0, x1, z0, z1, h } = o, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, c = o.color || K.deck;
  B.box(cx, 0, cz, w, h, d, mul(c, 0.9), { base: 0.35, tint: 0.03, top: c });
  // planks on the deck top (subtle stripes)
  const np = Math.round(w / 0.5); for (let i = 0; i < np; i++) { const xa = x0 + w * i / np + 0.01, xb = x0 + w * (i + 1) / np - 0.01, k = 0.94 + 0.1 * ((i * 7) % 5) / 5; B.quad([xa, h + 0.002, z0 + 0.02], [xa, h + 0.002, z1 - 0.02], [xb, h + 0.002, z1 - 0.02], [xb, h + 0.002, z0 + 0.02], mul(K.deckL, k)); }
  // gaffer-tape marks and front lip
  B.box(cx, h, z1 - 0.04, w, 0.04, 0.08, K.deckL, { base: 0 });
  const seg = o.segments || 8; for (let i = 0; i < seg; i++) { const xa = x0 + 0.05 + (w - 0.1) * i / seg, xb = x0 + 0.05 + (w - 0.1) * (i + 1) / seg - 0.04, g = (o.glow || [PINKN, CYANN])[i % 2]; GL.quad([xa, h * 0.35, z1 + 0.006], [xb, h * 0.35, z1 + 0.006], [xb, h * 0.75, z1 + 0.006], [xa, h * 0.75, z1 + 0.006], g); }
}
// stair block: n steps rising toward -z (from z1 down to the deck). o: {x, w, z, h, n}
export function steps(B, x, w, zFront, h, n, color) {
  for (let i = 0; i < n; i++) { const hh = h * (i + 1) / n, d = 0.3; B.box(x, 0, zFront - d * i - d / 2, w, hh, d, color || K.deckL, { base: 0.3, tint: 0.03 }); }
}

// ------------------------------------------------------------------ LED wall: a canvas texture on a plane (always lit, blooms)
export function makeLed(w, h, res) {
  res = res || 128; const cw = Math.round(res * w), ch = Math.round(res * h), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }); const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.name = 'led_wall'; mesh.frustumCulled = false;
  const api = { mesh, canvas: cv, g, tex, w: cw, h: ch, dirty: true, mat,
    draw(fn) { fn(g, cw, ch); tex.needsUpdate = true; api.dirty = false; return api; },
    // simple pixel grid overlay so it reads as LEDs even when the content is flat
    grid(a) { g.save(); g.fillStyle = 'rgba(15,8,35,' + (a === undefined ? 0.22 : a) + ')'; for (let y = 0; y < ch; y += 4) g.fillRect(0, y, cw, 1); for (let x = 0; x < cw; x += 4) g.fillRect(x, 0, 1, ch); g.restore(); },
    // multi-line text with fit-to-width. lines: [string | {t, c, k (size factor)}]
    text(lines, o) {
      o = o || {}; const bg = o.bg || ['#2a1058', '#120a2c']; const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      if (o.rays) { g.save(); g.translate(cw / 2, ch * 0.5); for (let i = 0; i < 16; i++) { g.rotate(Math.PI * 2 / 16); g.fillStyle = i % 2 ? (o.rays[0] || 'rgba(255,255,255,0.05)') : (o.rays[1] || 'rgba(255,255,255,0.0)'); g.beginPath(); g.moveTo(0, 0); g.lineTo(cw, -ch * 0.12); g.lineTo(cw, ch * 0.12); g.closePath(); g.fill(); } g.restore(); }
      const n = lines.length, each = ch / n; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => { const t = typeof l === 'string' ? l : l.t, c = (typeof l === 'string' ? null : l.c) || o.color || '#fff2dc', k = (typeof l === 'string' ? 1 : l.k || 1); let size = Math.min(each * 0.86 * k, ch * 0.9); g.font = '900 ' + size + 'px "Arial Black", Impact, system-ui, sans-serif'; const mw = g.measureText(t).width; if (mw > cw * 0.92) { size *= (cw * 0.92) / mw; g.font = '900 ' + size + 'px "Arial Black", Impact, system-ui, sans-serif'; }
        const y = each * (i + 0.5) + (o.dy || 0); g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = o.stroke || '#17102b'; g.strokeText(t, cw / 2, y); g.shadowColor = c; g.shadowBlur = size * 0.35; g.fillStyle = c; g.fillText(t, cw / 2, y); g.shadowBlur = 0; });
      if (o.grid !== false) api.grid(o.gridA); tex.needsUpdate = true; api.dirty = false; return api;
    },
  };
  return api;
}

// ------------------------------------------------------------------ misc canvas helpers
export const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
export const FONT = '"Arial Black", Impact, "Trebuchet MS", system-ui, sans-serif';

// the stats of a store, for the budget line in the header of each world
export function storeTris(S) { return (S.B.p.length + S.GLOW.p.length + S.SCR.p.length + S.DEC.p.length + S.SOFT.p.length + S.GLASS.p.length) / 9; }
