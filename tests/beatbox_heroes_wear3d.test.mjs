// 3D clothing fit (beatbox_heroes/park3d/char_wear.js): every top over a set of bottoms, every bottom under a set of tops, every shoe with long pants, shorts, skirts
// and flares, on all three bodies, plus the whole cast. Headless: the characters are skinned on the CPU and probed with rays. Checks:
//   1. budget and finite geometry; 2. the waist never shows skin or void between top and bottom (rays from front, back and sides, standing and in clips);
//   3. feet sit on y=0 when standing and never sink below the ground in any clip; 4. no floating pieces (every connected part of the clothes touches the body);
//   5. seams stay closed: rays aimed at the spine and limb axes always hit cloth or skin (no see-through slit at shoulders, cuffs, waist, knees, under a skirt);
//   6. layers stay nested: where a top covers a bottom, the bottom never pokes out through it, in any sampled frame of the key clips.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done, load } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), P3 = path.join(REPO, 'beatbox_heroes', 'park3d').replace(/\\/g, '/');
const req = createRequire(import.meta.url), esbuild = req(path.join(REPO, 'node_modules', 'esbuild'));
const BBH = load('pix', 'catalog', 'core'), CAT = BBH.CATALOG, Core = BBH.Core;
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wear3d_test_'));
const watchdog = setTimeout(() => { console.error('FAIL: wear3d suite hung'); process.exit(1); }, 300000);
await esbuild.build({ stdin: { contents: "export * from '" + P3 + "/characters.js'; export { TOPS as WTOPS, BOTTOMS as WBOTTOMS } from '" + P3 + "/char_wear.js';", resolveDir: REPO }, outfile: path.join(tmp, 'c.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const M = await import(pathToFileURL(path.join(tmp, 'c.mjs')).href);
const { createCharacter, castLooks, crowdLook, TRI_BUDGET, WTOPS, WBOTTOMS } = M;
const CTX = { quality: 'high' }, BODIES = ['boy', 'girl', 'neutral'], clone = (o) => JSON.parse(JSON.stringify(o)), SLOTS = ['head', 'face', 'facial', 'arms', 'legs', 'midriff', 'top', 'bottom', 'shoes', 'hair', 'hat', 'glasses', 'acc'];
const look = (o) => Object.assign(clone(CAT.DEFAULT_LOOK), { acc: {}, hat: { id: 'none' } }, o);
const bad = {}, fail = (k, msg) => { (bad[k] = bad[k] || []).push(msg); };

// ---- probe kit: skinned world triangles with their slot, ray casts
function snap(c) {
  c.object.updateMatrixWorld(true); const mesh = c.object.getObjectByName('char_lit'), g = mesh.geometry, P = g.attributes.position.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, sk = mesh.skeleton;
  const bm = sk.bones.map((b, i) => b.matrixWorld.clone().multiply(sk.boneInverses[i]).elements), n = P.length / 3, W = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let ox = 0, oy = 0, oz = 0; for (let k = 0; k < 2; k++) { const w = SW[i * 4 + k]; if (!w) continue; const e = bm[SI[i * 4 + k]]; ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); } W[i * 3] = ox; W[i * 3 + 1] = oy; W[i * 3 + 2] = oz; }
  const slot = new Uint8Array(n / 3); let t = 0; for (const nm of Object.keys(c.slotTris)) { const k = SLOTS.indexOf(nm); for (let j = 0; j < c.slotTris[nm]; j++) slot[t++] = k; }
  const hp = c.rig.map.hips.matrixWorld.elements; return { W, rest: P, slot, n: n / 3, hips: [hp[12], hp[13], hp[14]] };
}
// first hit along a ray: mode 'front' = first front facing triangle of any slot (what the camera sees); mode = slot index = first hit of that slot, any facing,
// skipping inward facing triangles (linings) when axis is given. Returns { t, slot, front } or null
function cast(s, o, d, mode, axis) {
  const W = s.W; let best = 1e9, bs = -1, bf = false;
  for (let f = 0; f < s.n; f++) {
    if (mode !== 'front' && s.slot[f] !== mode) continue;
    const a = f * 9, ax = W[a], ay = W[a + 1], az = W[a + 2], e1x = W[a + 3] - ax, e1y = W[a + 4] - ay, e1z = W[a + 5] - az, e2x = W[a + 6] - ax, e2y = W[a + 7] - ay, e2z = W[a + 8] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, front = nx * d[0] + ny * d[1] + nz * d[2] < 0; if (mode === 'front' && !front) continue;
    if (axis && nx * ((ax + W[a + 3] + W[a + 6]) / 3 - axis[0]) + nz * ((az + W[a + 5] + W[a + 8]) / 3 - axis[2]) < 0) continue;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue; const inv = 1 / det;
    const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > 1e-5 && t < best) { best = t; bs = s.slot[f]; bf = front; }
  }
  return bs < 0 ? null : { t: best, slot: SLOTS[bs], front: bf };
}
const pose = (L, clip, t) => { const c = createCharacter(CTX, L); c.play(clip, { speed: clip === 'walk' ? 1.2 : clip === 'run' ? 3 : 0, bpm: 100, seat: 0.46, fade: 0 }); for (let k = 0; k <= Math.round(t * 30); k++) c.update(1 / 30, k / 30); return c; };

// 2. waist: 16 directions x the band from just under the hip joint to the lower chest; the first visible surface must be cloth of the top or bottom
// (a crop top shows its midriff, sitting thighs under shorts and skirts are skin; feet, a beard or hair may pass in front, arms and legs too as long as
// they are not at the torso itself: a leg hit within 0.2 m of the hip axis is a leg showing through the clothes). Under a skirt or shorts the band starts
// just under the hip joint, lower down the hem lifting with the stride is expected to show the thigh
function waist(c, L, tag) {
  const s = snap(c), h = s.hips, crop = L.top.id === 'croptop', bare = WBOTTOMS[L.bottom.id].f !== 'pants', sit = /sit/.test(tag); let n = 0, ex = '';
  for (let y = h[1] - (bare ? 0.035 : 0.08); y <= h[1] + 0.16 + 1e-6; y += 0.03) for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2, d = [-Math.sin(th), 0, -Math.cos(th)], r = cast(s, [h[0] + Math.sin(th) * 1.5, y, h[2] + Math.cos(th) * 1.5], d, 'front'), sl = r && r.slot;
    const front = r && (sl === 'hair' || sl === 'facial' || sl === 'shoes' || (r.t < 1.3 && ['arms', 'legs', 'acc'].includes(sl)));
    if (!(front || sl === 'top' || sl === 'bottom' || sl === 'arms' || sl === 'acc' || (sl === 'midriff' && crop) || (sl === 'legs' && bare && (sit || y < h[1] - 0.02)))) { n++; ex = ex || (sl || 'void') + '@' + (y - h[1]).toFixed(2); }
  }
  if (n) fail('waist', tag + ' ' + n + ' rays (' + ex + ')');
}
// 5. seams: rays from 12 azimuths x 3 elevations aimed at points on the spine and limb axes must hit something (a miss is a see-through slit)
const SEG = [['hips', 'chest', 4], ['chest', 'neck', 2], ['shL', 'elL', 3], ['elL', 'wrL', 3], ['shR', 'elR', 3], ['elR', 'wrR', 3], ['thL', 'knL', 3], ['knL', 'anL', 2], ['thR', 'knR', 3], ['knR', 'anR', 2]];
function seams(c, tag) {
  const s = snap(c), B = c.rig.map, V = c.object.position.constructor, a = new V(), b = new V(); let n = 0, ex = '';
  for (const [p, q, k] of SEG) { B[p].getWorldPosition(a); B[q].getWorldPosition(b); for (let i = 0; i <= k; i++) { const f = (i + 0.5) / (k + 1), C0 = [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f];
    for (let az = 0; az < 12; az++) for (const el of [-0.55, 0, 0.55]) { const th = az / 12 * Math.PI * 2 + 0.13, d = [-Math.sin(th) * Math.cos(el), -Math.sin(el), -Math.cos(th) * Math.cos(el)]; if (!cast(s, [C0[0] - d[0] * 2, C0[1] - d[1] * 2, C0[2] - d[2] * 2], d, 'front')) { n++; ex = ex || p + '-' + q; } } } }
  if (n) fail('seams', tag + ' ' + n + ' rays (' + ex + ')');
}
// 6. nesting: bottom triangles that rest under the top (above its hem, below the chest) must not end up outside the top's outer surface
function nested(c, L, tag) {
  if (L.top.id === 'croptop') return; const s = snap(c), W = s.W, R = s.rest, hem = WTOPS[L.top.id].f === 'dress' ? 0.3 : WTOPS[L.top.id].hem, kb = SLOTS.indexOf('bottom'), kt = SLOTS.indexOf('top'); let n = 0, ex = '';
  for (let f = 0; f < s.n; f++) {
    if (s.slot[f] !== kb) continue; const a = f * 9, ry = (R[a + 1] + R[a + 4] + R[a + 7]) / 3; if (ry < hem + 0.015 || ry > 0.62) continue;
    const e1 = [W[a + 3] - W[a], W[a + 4] - W[a + 1], W[a + 5] - W[a + 2]], e2 = [W[a + 6] - W[a], W[a + 7] - W[a + 1], W[a + 8] - W[a + 2]], nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...nn); if (l < 1e-10 || Math.abs(nn[1] / l) > 0.8) continue;
    const lh = Math.hypot(nn[0], nn[2]), d = [nn[0] / lh, 0, nn[2] / lh], cc = [(W[a] + W[a + 3] + W[a + 6]) / 3, (W[a + 1] + W[a + 4] + W[a + 7]) / 3, (W[a + 2] + W[a + 5] + W[a + 8]) / 3]; if (d[0] * (cc[0] - s.hips[0]) + d[2] * (cc[2] - s.hips[2]) < 0) continue;
    const o = [cc[0] + d[0] * 0.001, cc[1], cc[2] + d[2] * 0.001]; if (cast(s, o, d, kt, s.hips)) continue; const back = cast(s, o, [-d[0], 0, -d[2]], kt, s.hips); if (back && back.front) { n++; ex = ex || ry.toFixed(2); }
  }
  if (n > 0) fail('nested', tag + ' ' + n + ' bottom tris outside the top (rest y ' + ex + ')');
}
// 3. ground: lowest point of each shoe
function feet(c) { const s = snap(c), k = SLOTS.indexOf('shoes'), m = [1e9, 1e9]; for (let f = 0; f < s.n; f++) { if (s.slot[f] !== k) continue; for (let q = 0; q < 3; q++) { const i = f * 9 + q * 3; m[s.W[i] > 0 ? 0 : 1] = Math.min(m[s.W[i] > 0 ? 0 : 1], s.W[i + 1]); } } return m; }
// 4. floating pieces: union the clothes' triangles by shared corners; every part must come within 2 cm of another part of the character (body or cloth)
function floating(c, tag) {
  const s = snap(c), R = s.rest, ks = ['top', 'bottom', 'shoes'].map((n) => SLOTS.indexOf(n)), par = new Int32Array(s.n).map((_, i) => i), find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, key = new Map();
  for (let f = 0; f < s.n; f++) for (let q = 0; q < 3; q++) { const i = f * 9 + q * 3, kk = Math.round(R[i] * 2000) + ',' + Math.round(R[i + 1] * 2000) + ',' + Math.round(R[i + 2] * 2000), o = key.get(kk); if (o === undefined) key.set(kk, f); else par[find(f)] = find(o); }
  const comp = new Map(); for (let f = 0; f < s.n; f++) { if (ks.indexOf(s.slot[f]) < 0) continue; const r = find(f); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(f); }
  const tri = (f) => [0, 1, 2].map((q) => [R[f * 9 + q * 3], R[f * 9 + q * 3 + 1], R[f * 9 + q * 3 + 2]]);
  const ptTri = (p, T) => { const [A, Bv, Cv] = T, ab = Bv.map((v, i) => v - A[i]), ac = Cv.map((v, i) => v - A[i]), ap = p.map((v, i) => v - A[i]), dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; const d1 = dot(ab, ap), d2 = dot(ac, ap), d3 = dot(ab, ab), d4 = dot(ab, ac), d5 = dot(ac, ac), den = d3 * d5 - d4 * d4; let v = den ? (d5 * d1 - d4 * d2) / den : 0, w = den ? (d3 * d2 - d4 * d1) / den : 0; if (v < 0 || w < 0 || v + w > 1) { const seg = (P0, P1) => { const e = P1.map((x, i) => x - P0[i]), t = Math.max(0, Math.min(1, dot(p.map((x, i) => x - P0[i]), e) / (dot(e, e) || 1))); return Math.hypot(...p.map((x, i) => x - P0[i] - e[i] * t)); }; return Math.min(seg(A, Bv), seg(A, Cv), seg(Bv, Cv)); } return Math.hypot(...p.map((x, i) => x - A[i] - ab[i] * v - ac[i] * w)); };
  // a piece that intersects another part touches it, even when none of its corners is close to a surface (a strap through a foot)
  const segHits = (p0, p1, T) => { const d = p1.map((v, i) => v - p0[i]), l = Math.hypot(...d); if (l < 1e-9) return false; const dn = d.map((v) => v / l), e1 = T[1].map((v, i) => v - T[0][i]), e2 = T[2].map((v, i) => v - T[0][i]), pv = [dn[1] * e2[2] - dn[2] * e2[1], dn[2] * e2[0] - dn[0] * e2[2], dn[0] * e2[1] - dn[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2]; if (Math.abs(det) < 1e-12) return false; const tv = p0.map((v, i) => v - T[0][i]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det; if (u < 0 || u > 1) return false; const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (dn[0] * qv[0] + dn[1] * qv[1] + dn[2] * qv[2]) / det; if (v < 0 || u + v > 1) return false; const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det; return t >= 0 && t <= l; };
  for (const [r, fs] of comp) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], pts = []; fs.forEach((f) => tri(f).forEach((p) => { for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } pts.push(p); }));
    let best = 1e9; for (let f = 0; f < s.n && best > 0.02; f++) { if (find(f) === r) continue; const T = tri(f); if (T.every((p) => p.some((v, i) => v < lo[i] - 0.03 || v > hi[i] + 0.03))) { let out = false; for (let i = 0; i < 3 && !out; i++) out = T.every((p) => p[i] < lo[i] - 0.03) || T.every((p) => p[i] > hi[i] + 0.03); if (out) continue; } for (let j = 0; j < pts.length && best > 0.02; j += Math.max(1, Math.floor(pts.length / 24))) best = Math.min(best, ptTri(pts[j], T)); for (let j = 0; j < pts.length && best > 0.02; j += 3) for (const [p0, p1] of [[pts[j], pts[j + 1]], [pts[j + 1], pts[j + 2]], [pts[j + 2], pts[j]]]) if (segHits(p0, p1, T)) best = 0; }
    if (best > 0.02) fail('floating', tag + ' ' + SLOTS[s.slot[fs[0]]] + ' piece of ' + fs.length + ' tris ' + best.toFixed(3) + ' m from everything');
  }
}
const finite = (c) => { let good = true; c.object.traverse((o) => { if (o.isSkinnedMesh) for (const k of Object.keys(o.geometry.attributes)) { const a = o.geometry.attributes[k].array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { good = false; break; } } }); return good; };

// ---- the combos: every top x 4 bottoms, every bottom x 6 tops, every shoe x 6 bottoms, bodies rotate; shoes and colours vary too
const tops = CAT.TOPS.map((x) => x.id), bottoms = CAT.BOTTOMS.map((x) => x.id), shoes = CAT.SHOES.map((x) => x.id), COMBOS = [];
tops.forEach((t, i) => ['jeans', 'shorts', 'skirt', 'baggy'].forEach((b, j) => COMBOS.push(look({ body: BODIES[(i + j) % 3], top: { id: t, color: CAT.OUTFIT_COLORS[(i * 5) % 24], color2: CAT.OUTFIT_COLORS[(i * 7 + 3) % 24] }, bottom: { id: b, color: '#34303f' }, shoes: { id: shoes[(i + j) % shoes.length] } }))));
bottoms.forEach((b, i) => ['tee', 'croptop', 'hoodie', 'dress', 'kimono', 'puffvest'].forEach((t, j) => COMBOS.push(look({ body: BODIES[(i + j + 1) % 3], top: { id: t }, bottom: { id: b, color: CAT.OUTFIT_COLORS[(i * 5 + 2) % 24] }, shoes: { id: shoes[(i * 3 + j) % shoes.length] } }))));
shoes.forEach((sh, i) => ['jeans', 'shorts', 'skirt', 'flares', 'baggy', 'leggings'].forEach((b, j) => COMBOS.push(look({ body: BODIES[(i + j + 2) % 3], age: i % 4 === 0 ? 'old' : undefined, top: { id: tops[(i * 4 + j) % tops.length] }, bottom: { id: b }, shoes: { id: sh, color: CAT.OUTFIT_COLORS[(i * 5 + 1) % 24] } }))));

// 1 + 2 + 3 + 4 at rest (idle) for every combo
let maxTris = 0;
for (const L of COMBOS) {
  const tag = L.body + ' ' + L.top.id + '/' + L.bottom.id + '/' + L.shoes.id, c = pose(L, 'idle', 0.4);
  if (c.tris > TRI_BUDGET) fail('budget', tag + ' ' + c.tris); maxTris = Math.max(maxTris, c.tris); if (!finite(c)) fail('finite', tag);
  waist(c, L, tag + ' idle'); floating(c, tag);
  const m = feet(c); if (Math.abs(m[0]) > 0.006 || Math.abs(m[1]) > 0.006) fail('ground', tag + ' idle feet at ' + m.map((v) => v.toFixed(3)).join(','));
  c.dispose();
}
ok(!bad.budget, 'every combo within ' + TRI_BUDGET + ' tris (largest ' + maxTris + ')' + (bad.budget ? ': ' + bad.budget.slice(0, 4).join(' | ') : ''));
ok(!bad.finite, 'every combo builds finite geometry' + (bad.finite ? ': ' + bad.finite.slice(0, 4).join(' | ') : ''));
ok(!bad.waist, 'standing: no gap at the waist between any top and bottom (' + COMBOS.length + ' combos)' + (bad.waist ? ': ' + bad.waist.slice(0, 4).join(' | ') : ''));
ok(!bad.floating, 'no floating clothing pieces' + (bad.floating ? ': ' + bad.floating.slice(0, 4).join(' | ') : ''));
ok(!bad.ground, 'standing: both feet sit on y=0 for every shoe' + (bad.ground ? ': ' + bad.ground.slice(0, 4).join(' | ') : ''));

// clips: the waist, the seams and the layering hold in sampled frames of the key clips (a deterministic subset of the combos, every body)
const CLIPS = [['walk', 0.45], ['run', 0.3], ['dance', 1.1], ['beatbox', 0.7], ['battle', 0.6], ['cheer', 0.5], ['sit', 0.8], ['hit', 0.2], ['finisher', 0.8], ['idle', 1.3]];
for (const k of ['waist', 'seams', 'nested']) delete bad[k];
const KEY = [['tee', 'jeans'], ['croptop', 'skirt'], ['dress', 'baggy'], ['hoodie', 'shorts'], ['kimono', 'skirt'], ['puffer', 'cargo'], ['champ', 'jeans'], ['dress', 'skirt'], ['oversized', 'shorts'], ['poncho', 'flares'], ['tux', 'slacks'], ['jersey', 'baggy']];
KEY.forEach(([t, b], i) => CLIPS.forEach(([clip, tt], j) => {
  const L = look({ body: BODIES[(i + j) % 3], top: { id: t }, bottom: { id: b }, shoes: { id: shoes[(i + j) % shoes.length] } }), c = pose(L, clip, tt), tag = L.body + ' ' + t + '/' + b + ' ' + clip;
  waist(c, L, tag); nested(c, L, tag); if ((i + j) % 2 === 0) seams(c, tag); c.dispose();
}));
// the long tops and wide bottoms that layer the most, over more frames
for (const t of ['dress', 'kimono', 'champ', 'poncho', 'hoodiebig']) for (const b of ['baggy', 'skirt', 'shorts']) for (const [clip, tt] of [['walk', 0.3], ['run', 0.5], ['sit', 2], ['battle', 1.2], ['dance', 2.6]]) { const L = look({ body: 'girl', top: { id: t }, bottom: { id: b } }), c = pose(L, clip, tt); nested(c, L, t + '/' + b + ' ' + clip + tt); c.dispose(); }
ok(!bad.waist, 'clips: the waist stays closed while bending and twisting' + (bad.waist ? ': ' + bad.waist.slice(0, 4).join(' | ') : ''));
ok(!bad.seams, 'clips: no see-through slit at shoulders, cuffs, waist, knees or under skirts' + (bad.seams ? ': ' + bad.seams.slice(0, 4).join(' | ') : ''));
ok(!bad.nested, 'clips: bottoms never poke out through the top that covers them' + (bad.nested ? ': ' + bad.nested.slice(0, 4).join(' | ') : ''));

// feet: in every clip no shoe goes below the ground; when standing (idle, beatbox, battle) the lower foot touches y=0
{
  const gb = [];
  for (const sh of shoes) for (const [clip, n] of [['idle', 40], ['beatbox', 60], ['battle', 60], ['walk', 50], ['run', 40], ['dance', 80], ['sit', 40], ['cheer', 40], ['finisher', 60]]) {
    const L = look({ body: BODIES[shoes.indexOf(sh) % 3], shoes: { id: sh }, bottom: { id: shoes.indexOf(sh) % 2 ? 'flares' : 'jeans' } }), c = createCharacter(CTX, L); c.play(clip, { speed: clip === 'walk' ? 1.2 : clip === 'run' ? 3 : 0, bpm: 100, seat: 0.46, fade: 0 }); let lo = 1e9, top = -1e9;
    for (let k = 0; k < n; k++) { c.update(1 / 30, k / 30); if (k % 5) continue; const m = feet(c); lo = Math.min(lo, m[0], m[1]); top = Math.max(top, Math.min(m[0], m[1])); }
    if (lo < -0.006) gb.push(sh + ' ' + clip + ' sinks to ' + lo.toFixed(3)); if (['idle', 'beatbox', 'battle'].includes(clip) && top > 0.012) gb.push(sh + ' ' + clip + ' floats ' + top.toFixed(3)); c.dispose();
  }
  ok(gb.length === 0, 'clips: shoes never sink below the ground and the standing foot stays on it' + (gb.length ? ': ' + gb.slice(0, 5).join(' | ') : ''));
}

// the whole cast (NPCs, opponents, finals, judges, clerk) and some generic crowd members: budget, waist, feet and floating pieces at rest, waist and seams sitting
{
  for (const k of Object.keys(bad)) delete bad[k];
  const cl = castLooks(Core), all = [].concat(Object.values(cl.npc), Object.values(cl.opponent), Object.values(cl.final), Object.values(cl.judge), [cl.clerk]); for (let i = 0; i < 12; i++) all.push(crowdLook(i));
  all.forEach((l0, i) => {
    const c = pose(l0, 'idle', 0.4), L = c.getLook(), tag = (L.name || 'crowd' + i) + ' ' + L.top.id + '/' + L.bottom.id + '/' + L.shoes.id;
    if (c.tris > TRI_BUDGET) fail('budget', tag); waist(c, L, tag); floating(c, tag); const m = feet(c); if (Math.abs(m[0]) > 0.006 || Math.abs(m[1]) > 0.006) fail('ground', tag + ' ' + m.map((v) => v.toFixed(3)).join(',')); c.dispose();
    if (i % 3 === 0) { const s2 = pose(L, 'sit', 0.8); waist(s2, L, tag + ' sit'); seams(s2, tag + ' sit'); s2.dispose(); }
  });
  ok(!bad.budget && !bad.waist && !bad.ground && !bad.floating && !bad.seams, 'the whole cast (' + all.length + ' looks) fits: budget, waist, feet, no floating pieces, seams closed sitting' + (Object.keys(bad).length ? ': ' + Object.entries(bad).map(([k, v]) => k + ' ' + v.slice(0, 2).join(' | ')).join(' || ') : ''));
}
clearTimeout(watchdog); fs.rmSync(tmp, { recursive: true, force: true }); done();
