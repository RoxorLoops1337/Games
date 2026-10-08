// HAIR + HAT AUDIT KIT for the 3D chibi characters (beatbox_heroes/park3d/characters.js). Used by tools/beatbox_heroes/hair_gallery.mjs (contact sheets)
// and tests/beatbox_heroes_hair3d.test.mjs (numeric audit). Everything runs in node: the character geometry is built on the CPU, a tiny z-buffer rasteriser draws it.
//   loadChars()                      bundles characters.js with esbuild and imports it (returns the module)
//   slots(ch)                        { name: { t0, t1 } } triangle ranges of every slot inside the lit geometry (rest pose, head-local = absolute - [0, HY, 0])
//   tris(ch, names, posed)           Float32Array of 9 floats per triangle (head-local) for those slots, optionally skinned by the current bone pose (head bone frame)
//   audit(ch, M)                     numeric hair/hat audit of the current look: { float, uncovered, poke, hatGap, hatEyes, inverted, budget, ... }
//   render(ch, view, o) / sheet()    orthographic flat shaded render of the head region with the outline hull, and PNG contact sheets (sharp)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..', '..');
const req = createRequire(import.meta.url);
export const HY = 0.98;

export async function loadChars() {
  const esbuild = req(path.join(REPO, 'node_modules', 'esbuild')), tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'hair3d_'));
  const CH = path.join(REPO, 'beatbox_heroes', 'park3d', 'characters.js').replace(/\\/g, '/'), HAIR = path.join(REPO, 'beatbox_heroes', 'park3d', 'char_hair.js').replace(/\\/g, '/');
  await esbuild.build({ stdin: { contents: "export * from '" + CH + "'; export { HAT_COVER } from '" + HAIR + "'; export { headP } from '" + HAIR.replace('char_hair', 'char_body') + "';", resolveDir: REPO }, outfile: path.join(tmp, 'chars.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
  const M = await import(pathToFileURL(path.join(tmp, 'chars.mjs')).href); fs.rmSync(tmp, { recursive: true, force: true }); return M;
}

const meshOf = (ch, k) => ch.object.children.find((o) => o.name === 'char_' + k);
export function slots(ch) { const out = {}; let t = 0; for (const n in ch.slotTris) { out[n] = { t0: t, t1: t + ch.slotTris[n] }; t += ch.slotTris[n]; } return out; }

// bone skinning matrices relative to the head bone (so posed geometry is expressed in the head frame: hair that rides the head stays put, springs show up as motion)
function skinMats(ch, headFrame) {
  ch.object.updateMatrixWorld(true); const sk = meshOf(ch, 'lit').skeleton, T = ch.object.matrixWorld.constructor, inv = new T();
  if (headFrame) { const hb = sk.bones.find((b) => b.name === 'head'); inv.copy(hb.matrixWorld).invert(); const toRest = new T().makeTranslation(0, HY, 0); inv.premultiply(toRest); } else inv.copy(ch.object.matrixWorld).invert();
  return sk.bones.map((b, i) => new T().multiplyMatrices(inv, b.matrixWorld).multiply(sk.boneInverses[i]).elements);
}
const apply = (m, x, y, z, o, k) => { o[k] = m[0] * x + m[4] * y + m[8] * z + m[12]; o[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; o[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; };
// geometry (lit or hull) -> head-local positions; posed: skinned by the current pose
function positions(geo, mats) {
  const P = geo.attributes.position.array, out = new Float32Array(P.length);
  if (!mats) { for (let i = 0; i < P.length; i += 3) { out[i] = P[i]; out[i + 1] = P[i + 1] - HY; out[i + 2] = P[i + 2]; } return out; }
  const SI = geo.attributes.skinIndex.array, SW = geo.attributes.skinWeight.array, a = [0, 0, 0], b = [0, 0, 0];
  for (let v = 0; v < P.length / 3; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], w0 = SW[v * 4], w1 = SW[v * 4 + 1]; apply(mats[SI[v * 4]], x, y, z, a, 0); apply(mats[SI[v * 4 + 1]], x, y, z, b, 0); out[v * 3] = a[0] * w0 + b[0] * w1; out[v * 3 + 1] = a[1] * w0 + b[1] * w1 - HY; out[v * 3 + 2] = a[2] * w0 + b[2] * w1; }
  return out;
}
export function tris(ch, names, posed) {
  const g = meshOf(ch, 'lit').geometry, S = slots(ch), P = positions(g, posed ? skinMats(ch, true) : null), parts = [];
  for (const n of names) { const s = S[n]; if (s && s.t1 > s.t0) parts.push(P.subarray(s.t0 * 9, s.t1 * 9)); }
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Float32Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

// ------------------------------------------------------------------ head surface (head-local, same model as char_body.js headP/ringAt)
export function headModel(M) {
  const ringAt = M.headRingAt, SQ = M.HEAD_SQ, TOP = M.HEAD_TOP, e = 2 / SQ;
  const inside = (x, y, z, m) => { if (y < 0.02 || y > TOP) return false; const r = ringAt(y), k = y > 0.585 ? Math.max(0.001, (TOP - y) / (TOP - 0.585)) : 1; return Math.pow(Math.abs(x) / ((r.rx + (m || 0)) * k), e) + Math.pow(Math.abs(z - r.cz) / ((r.rz + (m || 0)) * k), e) < 1; };
  // signed distance along the ray from the head centre (positive outside)
  const C0 = [0, 0.3, -0.01];
  const radius = (dx, dy, dz) => { let lo = 0, hi = 0.8; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inside(C0[0] + dx * m, C0[1] + dy * m, C0[2] + dz * m)) lo = m; else hi = m; } return lo; };
  const sd = (x, y, z) => { const dx = x - C0[0], dy = y - C0[1], dz = z - C0[2], l = Math.hypot(dx, dy, dz) || 1e-9; return l - radius(dx / l, dy / l, dz / l); };
  return { inside, sd, C0, radius };
}

// ------------------------------------------------------------------ ray casting (Moller Trumbore against a triangle soup, with a coarse angular bucket grid around C0)
export function rayIndex(T, C0) {
  const NA = 36, NE = 18, grid = Array.from({ length: NA * NE }, () => []), nt = T.length / 9;
  const cell = (x, y, z) => { const dx = x - C0[0], dy = y - C0[1], dz = z - C0[2], l = Math.hypot(dx, dy, dz) || 1e-9, az = Math.atan2(dx, dz), el = Math.asin(Math.max(-1, Math.min(1, dy / l))); return [Math.min(NA - 1, Math.floor((az + Math.PI) / (2 * Math.PI) * NA)), Math.min(NE - 1, Math.floor((el + Math.PI / 2) / Math.PI * NE))]; };
  for (let t = 0; t < nt; t++) {
    let a0 = 1e9, a1 = -1e9, e0 = 1e9, e1 = -1e9; const az = [];
    for (let k = 0; k < 3; k++) { const c = cell(T[t * 9 + k * 3], T[t * 9 + k * 3 + 1], T[t * 9 + k * 3 + 2]); az.push(c[0]); e0 = Math.min(e0, c[1]); e1 = Math.max(e1, c[1]); }
    az.sort((p, q) => p - q); let span = [az[0], az[2]]; if (az[2] - az[0] > NA / 2) span = [az[2], az[0] + NA];
    if (e1 >= NE - 2 || e0 <= 1) { a0 = 0; a1 = NA - 1; span = [0, NA - 1]; }
    for (let a = span[0] - 1; a <= span[1] + 1; a++) for (let e = Math.max(0, e0 - 1); e <= Math.min(NE - 1, e1 + 1); e++) grid[((a % NA) + NA) % NA + e * NA].push(t);
    void a0; void a1;
  }
  return { T, grid, cell, NA, C0 };
}
// all hits t > 0 along origin + t * dir (dir unit) for rays that start at C0 (bucketed) ; returns sorted array of [t, tri, facing] (facing > 0: ray leaves through the front of the triangle)
export function castFromCentre(ix, dir, maxT) {
  const C0 = ix.C0 || [0, 0.3, -0.01], c = ix.cell(C0[0] + dir[0], C0[1] + dir[1], C0[2] + dir[2]), list = ix.grid[c[0] + c[1] * ix.NA], out = [];
  for (const t of list) { const h = hitTri(ix.T, t, C0, dir); if (h && h[0] > 1e-5 && h[0] < (maxT || 9)) out.push(h); }
  return out.sort((p, q) => p[0] - q[0]);
}
export function castAll(T, o, dir, maxT) { const out = [], nt = T.length / 9; for (let t = 0; t < nt; t++) { const h = hitTri(T, t, o, dir); if (h && h[0] > 1e-5 && h[0] < (maxT || 9)) out.push(h); } return out.sort((p, q) => p[0] - q[0]); }
function hitTri(T, t, o, d) {
  const i = t * 9, ax = T[i], ay = T[i + 1], az = T[i + 2], e1x = T[i + 3] - ax, e1y = T[i + 4] - ay, e1z = T[i + 5] - az, e2x = T[i + 6] - ax, e2y = T[i + 7] - ay, e2z = T[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az, u = (sx * px + sy * py + sz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) return null;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * inv, nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  return [tt, t, nx * d[0] + ny * d[1] + nz * d[2]];
}

// connected components of a triangle soup (vertices welded at 0.5 mm, triangles sharing a welded vertex OR touching edges join)
export function components(T) {
  const nt = T.length / 9, par = new Int32Array(nt).map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const key = (x, y, z) => Math.round(x * 2000) + ',' + Math.round(y * 2000) + ',' + Math.round(z * 2000), first = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const i = t * 9 + k * 3, kk = key(T[i], T[i + 1], T[i + 2]); const f = first.get(kk); if (f === undefined) first.set(kk, t); else uni(t, f); }
  const comp = new Map(); for (let t = 0; t < nt; t++) { const r = find(t); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(t); }
  return [...comp.values()];
}

// ------------------------------------------------------------------ renderer
const LIGHT = (() => { const l = [-0.45, 0.65, 0.62], n = Math.hypot(...l); return l.map((v) => v / n); })();
export function view(yaw, pitch) { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0); return (x, y, z) => { const x1 = x * cy - z * sy, z1 = x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; }; }
export const VIEWS = { front: view(0, 0), q34: view(Math.PI / 4, 0.12), side: view(Math.PI / 2, 0), back: view(Math.PI, 0.1), top: view(0.3, 1.25), q34b: view(Math.PI * 0.78, 0.15) };
// o: { size, cy (head-local centre y), half (half extent), posed, hull (default true), tint: { slot: [r,g,b] } (debug colours per slot), bg }
export function render(ch, vf, o) {
  o = o || {}; const W = o.size || 180, H = W, cy = o.cy === undefined ? 0.3 : o.cy, half = o.half || 0.48, img = new Uint8ClampedArray(W * H * 4), zb = new Float32Array(W * H).fill(-1e9), bg = o.bg || [44, 29, 77];
  for (let i = 0; i < W * H; i++) { img[i * 4] = bg[0]; img[i * 4 + 1] = bg[1]; img[i * 4 + 2] = bg[2]; img[i * 4 + 3] = 255; }
  const mats = o.posed ? skinMats(ch, true) : null, lit = meshOf(ch, 'lit').geometry, hull = meshOf(ch, 'hull').geometry, glow = meshOf(ch, 'glow').geometry, S = slots(ch);
  const slotOf = []; for (const n in S) for (let t = S[n].t0; t < S[n].t1; t++) slotOf[t] = n;
  const draw = (P, Cl, back, shadeF, tintF) => {
    const nt = P.length / 9, v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) { const i = t * 9 + k * 3, q = vf(P[i], P[i + 1] - cy, P[i + 2]); v[k][0] = (q[0] / half) * W / 2 + W / 2; v[k][1] = H / 2 - (q[1] / half) * H / 2; v[k][2] = q[2]; v[k].w = q; }
      const a = v[0].w, b = v[1].w, c = v[2].w, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (back ? nz >= 0 : nz <= 0) continue;
      let r = 0, g = 0, bl = 0; for (let k = 0; k < 3; k++) { r += Cl[t * 9 + k * 3] / 3; g += Cl[t * 9 + k * 3 + 1] / 3; bl += Cl[t * 9 + k * 3 + 2] / 3; }
      const tc = tintF ? tintF(t) : null; if (tc) { r = tc[0]; g = tc[1]; bl = tc[2]; }
      const f = shadeF(nx, ny, nz), col = [Math.min(255, Math.pow(Math.max(0, r * f), 1 / 2.2) * 255), Math.min(255, Math.pow(Math.max(0, g * f), 1 / 2.2) * 255), Math.min(255, Math.pow(Math.max(0, bl * f), 1 / 2.2) * 255)];
      const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0]))), y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
      const ar = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]); if (Math.abs(ar) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5, w0 = ((v[1][0] - px) * (v[2][1] - py) - (v[2][0] - px) * (v[1][1] - py)) / ar, w1 = ((v[2][0] - px) * (v[0][1] - py) - (v[0][0] - px) * (v[2][1] - py)) / ar, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue; const z = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2], i = y * W + x; if (z <= zb[i]) continue; zb[i] = z; img[i * 4] = col[0]; img[i * 4 + 1] = col[1]; img[i * 4 + 2] = col[2];
      }
    }
  };
  const lin = (a) => { const o2 = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o2[i] = a[i]; return o2; };
  const tint = o.tint ? (t) => o.tint[slotOf[t]] || null : null;
  draw(positions(lit, mats), lin(lit.attributes.color.array), false, (nx, ny, nz) => 0.55 + 0.75 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]), tint);
  if (glow.attributes.position && glow.attributes.position.count) draw(positions(glow, mats), lin(glow.attributes.color.array), false, () => 1);
  if (o.hull !== false && hull.attributes.position && hull.attributes.position.count) {
    const hp = positions(hull, mats), hn = hull.attributes.hullN.array, P = new Float32Array(hp.length); for (let i = 0; i < hp.length; i++) P[i] = hp[i] + hn[i] * 0.013;
    const Cl = lin(hull.attributes.color.array); for (let i = 0; i < Cl.length; i += 3) { Cl[i] *= 0.24; Cl[i + 1] *= 0.2; Cl[i + 2] *= 0.32; }
    draw(P, Cl, true, () => 1);
  }
  return { w: W, h: H, data: img };
}

// cells: [{ img, label }], writes a PNG with labels under each cell
export async function sheet(file, cells, cols, title) {
  const sharp = req(path.join(REPO, 'node_modules', 'sharp')), cw = cells[0].img.w, chh = cells[0].img.h, lh = 16, th = title ? 24 : 0, rows = Math.ceil(cells.length / cols), W = cols * cw, H = th + rows * (chh + lh), buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { buf[i * 4] = 20; buf[i * 4 + 1] = 14; buf[i * 4 + 2] = 34; buf[i * 4 + 3] = 255; }
  cells.forEach((c, k) => { const ox = (k % cols) * cw, oy = th + Math.floor(k / cols) * (chh + lh); for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const s = (y * cw + x) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = c.img.data[s]; buf[d + 1] = c.img.data[s + 1]; buf[d + 2] = c.img.data[s + 2]; } });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'; if (title) svg += '<text x="6" y="17" font-family="sans-serif" font-size="15" fill="#ffd23f">' + esc(title) + '</text>';
  cells.forEach((c, k) => { if (!c.label) return; const ox = (k % cols) * cw, oy = th + Math.floor(k / cols) * (chh + lh) + chh; svg += '<text x="' + (ox + 3) + '" y="' + (oy + 12) + '" font-family="sans-serif" font-size="11" fill="' + (c.bad ? '#ff6b6b' : '#e8e0f0') + '">' + esc(c.label) + '</text>'; });
  svg += '</svg>';
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(file);
}

// ------------------------------------------------------------------ numeric audit
// One look, rest pose (or the current pose with posed = true, in the head bone frame). Returns plain numbers so the test can put tolerances on them.
//   floatHair / floatHat / floatFacial  pieces (connected components) that touch neither the head nor an attached piece (their centres)
//   uncovered                            fraction of the crown samples (upper skull, see CROWN) where the scalp, not hair or hat, is the outermost surface (non-bald styles)
//   poke                                 deepest hair vertex outside the hat (metres along the ray from the head centre) for hats that cover (HAT_COVER >= 0.7)
//   hatBuried                            fraction of the hat's vertices that sit under the hair surface (band hats must ride on the hair)
//   rimGap                               widest gap between a covering hat's lower edge and the head or hair below it (the hat floats when this is large)
//   hatSink                              deepest hat vertex inside the head; hatEyes: hat vertices in front of the eyes and brows
//   inverted                             closed pieces with negative volume, or open shells mostly facing the head centre
//   zfight                               hair triangles lying within 3 mm of the scalp and parallel to it
const CROWN = (() => { const s = []; for (let i = 0; i < 28; i++) { const th = (i + 0.5) / 28 * Math.PI * 2, a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th))), y0 = a < 1.0 ? 0.49 : a < 2.0 ? 0.47 : 0.44; for (let y = y0; y <= 0.6; y += 0.025) s.push([th, y]); } return s; })();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(a[0], a[1], a[2]), nrm = (a) => { const l = len(a) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; };
function vtx(T) { const out = []; for (let i = 0; i < T.length; i += 3) out.push([T[i], T[i + 1], T[i + 2]]); return out; }
function compTris(T, ids) { const o = new Float32Array(ids.length * 9); ids.forEach((t, k) => o.set(T.subarray(t * 9, t * 9 + 9), k * 9)); return o; }
function boundaryEdges(T) { const m = new Map(), key = (i) => Math.round(T[i] * 2000) + ',' + Math.round(T[i + 1] * 2000) + ',' + Math.round(T[i + 2] * 2000); for (let t = 0; t < T.length / 9; t++) for (let k = 0; k < 3; k++) { const a = key(t * 9 + k * 3), b = key(t * 9 + ((k + 1) % 3) * 3); if (a === b) continue; const e = a < b ? a + '|' + b : b + '|' + a; m.set(e, (m.get(e) || 0) + 1); } let n = 0; for (const v of m.values()) if (v === 1) n++; return { open: n, edges: m.size }; }
function signedVolume(T) { let v = 0; for (let i = 0; i < T.length; i += 9) v += (T[i] * (T[i + 4] * T[i + 8] - T[i + 5] * T[i + 7]) - T[i + 1] * (T[i + 3] * T[i + 8] - T[i + 5] * T[i + 6]) + T[i + 2] * (T[i + 3] * T[i + 7] - T[i + 4] * T[i + 6])) / 6; return v; }
function ptTri(p, T, i) {
  const a = [T[i], T[i + 1], T[i + 2]], b = [T[i + 3], T[i + 4], T[i + 5]], c = [T[i + 6], T[i + 7], T[i + 8]], ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap); const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, add(a, ab, v))); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, add(a, ac, w))); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len(sub(p, add(b, sub(c, b), w))); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return len(sub(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]));
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];
const touches = (pc, T, eps) => { for (let i = 0; i < T.length; i += 9) { let mx = -1e9, mn = 1e9; for (let k = 0; k < 3; k++) { mx = Math.max(mx, T[i + k * 3 + 1]); mn = Math.min(mn, T[i + k * 3 + 1]); } if (pc.bb[1][1] < mn - eps || pc.bb[0][1] > mx + eps) continue; for (const p of pc.V) if (ptTri(p, T, i) < eps) return true; } return false; };
// anchoring: a piece is attached if a vertex is on or inside the head, under (radially inside) an attached piece, or within eps of an attached piece's vertex
function anchor(pieces, head, baseIx, eps) {
  const att = pieces.map(() => false), C0 = head.C0, hashOf = (p) => Math.round(p[0] / eps) + ',' + Math.round(p[1] / eps) + ',' + Math.round(p[2] / eps), grid = new Map();
  const addGrid = (k) => { for (const p of pieces[k].V) { const h = hashOf(p); if (!grid.has(h)) grid.set(h, []); grid.get(h).push(p); } };
  const near = (p) => { const cx = Math.round(p[0] / eps), cy = Math.round(p[1] / eps), cz = Math.round(p[2] / eps); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const l = grid.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (l) for (const q of l) if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < eps) return true; } return false; };
  const under = (p, ix) => { const d = sub(p, C0), t = len(d); return castFromCentre(ix, nrm(d), 3).some((h) => h[0] > t + 1e-4); };
  const attIx = [];
  for (let k = 0; k < pieces.length; k++) if (pieces[k].V.some((p) => head.sd(p[0], p[1], p[2]) < eps || (baseIx && under(p, baseIx)))) { att[k] = true; addGrid(k); attIx.push(rayIndex(pieces[k].T, C0)); }
  let changed = true; while (changed) { changed = false; for (let k = 0; k < pieces.length; k++) { if (att[k]) continue; if (pieces[k].V.some((p) => near(p) || attIx.some((ix) => under(p, ix))) || attIx.some((ix) => touches(pieces[k], ix.T, eps * 0.5))) { att[k] = true; changed = true; addGrid(k); attIx.push(rayIndex(pieces[k].T, C0)); } } }
  return att;
}
function piecesOf(T) { return components(T).map((ids) => { const t = compTris(T, ids), V = vtx(t); let cx = 0, cy = 0, cz = 0; const bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]; V.forEach((p) => { cx += p[0] / V.length; cy += p[1] / V.length; cz += p[2] / V.length; for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], p[k]); bb[1][k] = Math.max(bb[1][k], p[k]); } }); return { T: t, V, c: [cx, cy, cz], bb }; }); }
function invertedOf(pieces, C0) {
  let bad = 0; const where = [];
  for (const pc of pieces) {
    const be = boundaryEdges(pc.T);
    if (be.open === 0 && pc.T.length >= 36) { if (signedVolume(pc.T) < -1e-9) { bad++; where.push(pc.c); } continue; }
    let inA = 0, outA = 0;
    for (let i = 0; i < pc.T.length; i += 9) { const a = [pc.T[i], pc.T[i + 1], pc.T[i + 2]], u = sub([pc.T[i + 3], pc.T[i + 4], pc.T[i + 5]], a), v = sub([pc.T[i + 6], pc.T[i + 7], pc.T[i + 8]], a), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], ar = len(n) / 2, cen = [(pc.T[i] + pc.T[i + 3] + pc.T[i + 6]) / 3, (pc.T[i + 1] + pc.T[i + 4] + pc.T[i + 7]) / 3, (pc.T[i + 2] + pc.T[i + 5] + pc.T[i + 8]) / 3], d = sub(cen, C0); if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] >= 0) outA += ar; else inA += ar; }
    if (be.open > 0 && inA > outA * 1.5 && pc.T.length >= 9 * 8) { bad++; where.push(pc.c); }
  }
  return { bad, where };
}
const r3 = (p) => p.map((v) => +v.toFixed(3));
export function audit(ch, M, o) {
  o = o || {}; const head = headModel(M), C0 = head.C0, posed = !!o.posed, look = ch.getLook(), hatId = look.hat.id, cover = (M.HAT_COVER || {})[hatId] || 0, bald = look.hair.style === 'bald';
  const Th = tris(ch, ['head'], posed), Tr = tris(ch, ['hair'], posed), Tt = tris(ch, ['hat'], posed), Tf = tris(ch, ['facial'], posed), ixHead = rayIndex(Th, C0), ixHair = rayIndex(Tr, C0), ixHat = rayIndex(Tt, C0);
  const r = { tris: Object.assign({}, ch.slotTris), total: ch.tris, hullDropped: ch.hullDropped.slice() };
  // floating pieces
  const hp = piecesOf(Tr), ha = anchor(hp, head, null, 0.012); r.floatHair = hp.filter((_, k) => !ha[k]).map((p) => r3(p.c));
  const base = new Float32Array(Tr.length + Th.length); base.set(Tr); base.set(Th, Tr.length); const ixBase = rayIndex(base, C0);
  const tp = piecesOf(Tt), ta = hatId === 'halo' ? tp.map(() => true) : anchor(tp, head, ixBase, 0.012); r.floatHat = tp.filter((_, k) => !ta[k]).map((p) => r3(p.c));
  const fp = piecesOf(Tf), fa = anchor(fp, head, null, 0.012); r.floatFacial = fp.filter((_, k) => !fa[k]).map((p) => r3(p.c));
  // scalp coverage
  let unc = 0; r.uncoveredAt = [];
  if (!bald) for (const [th, y] of CROWN) { const p = M.headP(th, y), d = nrm(sub(p, C0)), hH = castFromCentre(ixHead, d, 2), hr = castFromCentre(ixHair, d, 2).concat(castFromCentre(ixHat, d, 2)), t0 = hH.length ? hH[hH.length - 1][0] : len(sub(p, C0)); if (!hr.some((h) => h[0] > t0 - 0.002)) { unc++; if (r.uncoveredAt.length < 6) r.uncoveredAt.push([+th.toFixed(2), +y.toFixed(3)]); } }
  r.uncovered = bald ? 0 : unc / CROWN.length;
  // hair through covering hats
  r.poke = 0; r.pokeAt = null;
  // posed: only the hat's main piece counts (its tails and bills swing on their own springs and may cross hanging hair)
  const mainHat = posed && Tt.length ? new Set(components(Tt).reduce((a, c) => (c.length > a.length ? c : a), [])) : null;
  if (cover >= 0.7 && Tt.length) for (const p of vtx(Tr)) { const dv = sub(p, C0), t = len(dv), hits = castFromCentre(ixHat, nrm(dv), 3).filter((h) => h[2] > 0 && (!mainHat || mainHat.has(h[1]))); if (!hits.length) continue; const last = hits[hits.length - 1][0]; if (t - last > r.poke) { r.poke = t - last; r.pokeAt = r3(p); } }
  // band hats buried in the hair: outward facing hat triangles whose centre sits under the hair surface
  const cen = (T, i) => [(T[i] + T[i + 3] + T[i + 6]) / 3, (T[i + 1] + T[i + 4] + T[i + 7]) / 3, (T[i + 2] + T[i + 5] + T[i + 8]) / 3], nOf = (T, i) => { const a = [T[i], T[i + 1], T[i + 2]], u = sub([T[i + 3], T[i + 4], T[i + 5]], a), v = sub([T[i + 6], T[i + 7], T[i + 8]], a); return nrm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); };
  r.hatBuried = 0;
  if (Tt.length && cover < 0.7 && hatId !== 'halo') { let n = 0, m = 0; for (let i = 0; i < Tt.length; i += 9) { const c = cen(Tt, i), dv = sub(c, C0), d = nrm(dv); if (dot(nOf(Tt, i), d) < 0.3) continue; m++; const vs = [0, 1, 2].map((k) => [Tt[i + k * 3], Tt[i + k * 3 + 1], Tt[i + k * 3 + 2]]); if (vs.every((p) => { const q = sub(p, C0); return castFromCentre(ixHair, nrm(q), 3).some((h) => h[0] > len(q) + 0.006); })) n++; } r.hatBuried = m ? n / m : 0; }
  // hat sinking into the forehead or face (pieces pressed into the skull elsewhere, like earmuff cups or a beret puff, are hidden by design), hat parts lying on the eyes or brows
  r.hatSink = 0; r.hatSinkAt = null; r.hatEyes = 0;
  if (Tt.length) for (const p of vtx(Tt)) { const s = -head.sd(p[0], p[1], p[2]); if (p[2] > 0.05 && p[1] < 0.45 && s > r.hatSink) { r.hatSink = s; r.hatSinkAt = r3(p); } if (Math.abs(p[0]) < 0.19 && p[1] > 0.21 && p[1] < 0.366 && p[2] > 0.1 && head.sd(p[0], p[1], p[2]) < 0.04) r.hatEyes++; }
  // rim seal of covering hats: just above the hat's lower edge, a point in the pocket between hat and head (or hair) must not see out downward (the hat would float over a visible gap)
  r.rimGap = 0; r.rimGapAt = null;
  if (cover >= 0.7 && Tt.length && hatId !== 'hood') {
    // brims and bills are double sided plates: their coincident hit pairs are not the hat's dome
    // and tails or bills are separate pieces: only the hat's largest piece (its dome or crown) counts
    const cmp = components(Tt), main = cmp.reduce((a, c) => (c.length > a.length ? c : a), []), inMain = new Set(main);
    const domeHits = (d) => { const h = castFromCentre(ixHat, d, 3); return h.filter((x, k) => inMain.has(x[1]) && !h.some((y, j) => j !== k && Math.abs(y[0] - x[0]) < 2e-4 && y[2] * x[2] < 0)); };
    const all = new Float32Array(Th.length + Tr.length + Tt.length); all.set(Th); all.set(Tr, Th.length); all.set(Tt, Th.length + Tr.length);
    for (let i = 0; i < 24; i++) {
      const th = (i + 0.5) / 24 * Math.PI * 2, dirAt = (y) => { const p = M.headP(th, Math.max(0.03, Math.min(0.58, y))); return nrm(sub([p[0], y, p[2]], C0)); }, surfAt = (d, lim) => { const sH = castFromCentre(ixHead, d, 3), sR = castFromCentre(ixHair, d, 3).filter((h) => h[0] <= lim + 1e-4); return Math.max(sH.length ? sH[sH.length - 1][0] : 0, sR.length ? sR[sR.length - 1][0] : 0); };
      const isDome = (y) => { const d = dirAt(y), hh = domeHits(d); return hh.length && hh[0][0] - surfAt(d, hh[0][0]) < 0.09; };
      let lowest = null; for (let y = -0.1; y < 0.62; y += 0.01) if (isDome(y) && isDome(y + 0.01) && isDome(y + 0.02)) { lowest = y; break; }
      if (lowest === null) continue;
      for (const dy of [0.006, 0.014]) {
        const d = dirAt(lowest + dy), hh = domeHits(d); if (!hh.length) continue; const s = surfAt(d, hh[0][0]), w = hh[0][0] - s; if (w < 0.008) continue;
        const Q = add(C0, d, (s + hh[0][0]) / 2), hz = nrm([d[0], 0, d[2]]);
        for (const a of [0.45, 0.8, 1.15]) { const dd = nrm([hz[0] * Math.cos(a), -Math.sin(a), hz[2] * Math.cos(a)]); if (!castAll(all, Q, dd, 2).length && w > r.rimGap) { r.rimGap = w; r.rimGapAt = [+th.toFixed(2), +(lowest + dy).toFixed(3)]; } }
      }
    }
  }
  const inv = invertedOf(hp.concat(tp, fp), C0); r.inverted = inv.bad; r.invertedAt = inv.where.slice(0, 4).map(r3);
  r.zfight = 0;
  for (let i = 0; i < Tr.length; i += 9) { const c = [(Tr[i] + Tr[i + 3] + Tr[i + 6]) / 3, (Tr[i + 1] + Tr[i + 4] + Tr[i + 7]) / 3, (Tr[i + 2] + Tr[i + 5] + Tr[i + 8]) / 3], d = nrm(sub(c, C0)), hh = castFromCentre(ixHead, d, 2); if (!hh.length) continue; const gapH = len(sub(c, C0)) - hh[hh.length - 1][0]; if (Math.abs(gapH) < 0.0025) { const a = [Tr[i], Tr[i + 1], Tr[i + 2]], u = sub([Tr[i + 3], Tr[i + 4], Tr[i + 5]], a), v = sub([Tr[i + 6], Tr[i + 7], Tr[i + 8]], a), n = nrm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); if (dot(n, d) > 0.95) { r.zfight++; (r.zfightAt = r.zfightAt || []).length < 4 && r.zfightAt.push(r3(c)); } } }
  return r;
}
