// 3D character gear (beatbox_heroes/park3d/char_gear.js): glasses and every accessory slot sit on the character they are built for, on every body type, over
// representative hair, hats and tops, in the rest pose and through the animation clips. Headless: characters.js is bundled with esbuild and run in node,
// the measurements use the real triangles of the built geometry (per slot ranges of the lit mesh) and CPU skinning for the clips.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, done } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), CH = path.join(REPO, 'beatbox_heroes', 'park3d', 'characters.js');
const req = createRequire(import.meta.url), esbuild = req(path.join(REPO, 'node_modules', 'esbuild'));
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'gear3d_test_'));
const watchdog = setTimeout(() => { console.error('FAIL: gear3d suite hung'); process.exit(1); }, 300000);
await esbuild.build({ entryPoints: [CH], outfile: path.join(tmp, 'chars.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const M = await import(pathToFileURL(path.join(tmp, 'chars.mjs')).href);
const { createCharacter, KNOWN, TRI_BUDGET } = M;
const errs = [], origErr = console.error; let quiet = false; console.error = (...a) => { if (quiet) errs.push(a.join(' ').slice(0, 300)); else origErr(...a); };
const HY = 0.98, EY = 0.275, BODIES = ['boy', 'girl', 'neutral'];
const SLOTS = ['head', 'face', 'facial', 'arms', 'legs', 'midriff', 'top', 'bottom', 'shoes', 'hair', 'hat', 'glasses', 'acc'];
const base = (o) => Object.assign({ body: 'neutral', skin: '#c68b5e', hair: { style: 'crop', color: '#2a2024' }, eyes: { style: 'round' }, top: { id: 'tee', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'jeans' }, shoes: { id: 'sneakers' }, hat: { id: 'none', color: '#e63946' }, glasses: { id: 'none' }, acc: {} }, o);
const hero = createCharacter({ quality: 'high' }, base({}));

// ------------------------------------------------------------------ geometry access and math
// the lit triangles of the built character, per slot, in the rest pose (or skinned, with pos from skin())
function grab(c, pos) {
  const g = c.object.getObjectByName('char_lit').geometry, P = pos || g.attributes.position.array, R = {}; let t = 0;
  SLOTS.forEach((n) => { const k = c.slotTris[n] || 0; R[n] = [t, t + k]; t += k; });
  const set = (names) => { const out = []; names.forEach((n) => { for (let i = R[n][0]; i < R[n][1]; i++) out.push(i); }); return mkSet(P, out); };
  return { P, R, set, gear: (n) => { const a = []; for (let i = R[n][0]; i < R[n][1]; i++) a.push(i); return a; } };
}
function mkSet(P, ids) { const bb = new Float32Array(ids.length * 6); ids.forEach((t, j) => { for (let k = 0; k < 3; k++) { const a = P[t * 9 + k], b = P[t * 9 + 3 + k], c = P[t * 9 + 6 + k]; bb[j * 6 + k] = Math.min(a, b, c); bb[j * 6 + 3 + k] = Math.max(a, b, c); } }); return { P, ids, bb }; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const V = (P, t, k) => [P[t * 9 + k * 3], P[t * 9 + k * 3 + 1], P[t * 9 + k * 3 + 2]];
// closest distance from point p to triangle abc (Ericson)
function ptTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return Math.hypot(...sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return Math.hypot(...sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const bc = sub(c, b); return Math.hypot(...sub(p, [b[0] + bc[0] * w, b[1] + bc[1] * w, b[2] + bc[2] * w])); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return Math.hypot(...sub(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]));
}
// distance from p to the nearest triangle of a set (AABB pruned at `cap`)
function dist(S, p, cap) { let best = cap || 1; for (let j = 0; j < S.ids.length; j++) { const b = S.bb; if (p[0] < b[j * 6] - best || p[0] > b[j * 6 + 3] + best || p[1] < b[j * 6 + 1] - best || p[1] > b[j * 6 + 4] + best || p[2] < b[j * 6 + 2] - best || p[2] > b[j * 6 + 5] + best) continue; const t = S.ids[j], d = ptTri(p, V(S.P, t, 0), V(S.P, t, 1), V(S.P, t, 2)); if (d < best) best = d; } return best; }
// first hit distance of a ray (unit d) against a set, or -1
// flat: skip triangles whose |normal.y| is above it (horizontal rays pass under a hat brim)
function ray(S, o, d, flat) {
  let best = 1e9; for (const t of S.ids) { const a = V(S.P, t, 0), e1 = sub(V(S.P, t, 1), a), e2 = sub(V(S.P, t, 2), a); if (flat) { const nn = cross(e1, e2); if (Math.abs(nn[1]) / (Math.hypot(...nn) || 1) > flat) continue; } const p = cross(d, e2), det = dot(e1, p); if (Math.abs(det) < 1e-12) continue; const s = sub(o, a), u = dot(s, p) / det; if (u < 0 || u > 1) continue; const q = cross(s, e1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue; const tt = dot(e2, q) / det; if (tt > 1e-6 && tt < best) best = tt; }
  return best < 1e9 ? best : -1;
}
// connected components of a slot (triangles sharing a vertex position)
function comps(P, ids) {
  const par = ids.map((_, i) => i), f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }, key = new Map();
  ids.forEach((t, i) => { for (let k = 0; k < 3; k++) { const q = V(P, t, k), kk = q.map((x) => Math.round(x * 2e4)).join(','); if (key.has(kk)) { const a = f(key.get(kk)), b = f(i); if (a !== b) par[a] = b; } else key.set(kk, i); } });
  const g = new Map(); ids.forEach((t, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(t); }); return [...g.values()];
}
const vertsOf = (P, tris, n) => { const out = [], step = Math.max(1, Math.floor(tris.length * 3 / (n || 48))); for (let i = 0; i < tris.length * 3; i += step) out.push(V(P, tris[Math.floor(i / 3)], i % 3)); return out; };
// every component of a gear slot is attached: within tol of the body, or (a pendant, a hook) within tol of an attached component. Returns the floating ones.
function floating(G, slot, tol, body) {
  const cs = comps(G.P, G.gear(slot)); if (!cs.length) return [];
  const pts = cs.map((c) => vertsOf(G.P, c, 40)), att = cs.map((c, i) => pts[i].some((p) => dist(body, p, tol) < tol));
  const sets = cs.map((c) => mkSet(G.P, c));
  for (let pass = 0; pass < 4; pass++) cs.forEach((c, i) => { if (att[i]) return; for (let j = 0; j < cs.length; j++) if (att[j] && pts[i].some((p) => dist(sets[j], p, tol) < tol)) { att[i] = true; break; } });
  return cs.map((c, i) => (att[i] ? null : { n: c.length, at: pts[i][0].map((x) => x.toFixed(3)).join(',') })).filter(Boolean);
}
const BODY = ['head', 'face', 'facial', 'arms', 'legs', 'midriff', 'top', 'bottom', 'shoes', 'hair', 'hat'];
const fails = {}; const fail = (k, m) => { (fails[k] = fails[k] || []).push(m); };
const report = (k, msg) => ok(!fails[k], msg + (fails[k] ? ' (' + fails[k].length + '): ' + fails[k].slice(0, 5).join(' | ') : ''));
const build = (L) => { quiet = true; hero.setLook(L); quiet = false; hero.object.updateMatrixWorld(true); return grab(hero); };
let looks = 0, maxTris = 0;
const budget = (tag) => { looks++; maxTris = Math.max(maxTris, hero.tris); if (hero.tris > TRI_BUDGET) fail('budget', tag + ' ' + hero.tris); };

// ------------------------------------------------------------------ 1. glasses: lenses in front of the eyes on the face, temples to the ears, straps over hair and hats, nothing floating
const HAIRS = [['bald', 'none'], ['crop', 'none'], ['buzz', 'none'], ['long', 'none'], ['afro', 'none'], ['bob', 'none'], ['crop', 'cap'], ['long', 'beanie'], ['afro', 'fitted'], ['locs', 'bucket'], ['hightop', 'none'], ['curly', 'hood']];
const LENSES = ['round', 'nerd', 'shades', 'aviator', 'wayfarer', 'sport', 'heart', 'star', 'oversized', 'gold_round', 'goggles', 'pixel'], TEMPLES = LENSES.filter((x) => x !== 'goggles').concat(['neonbar', 'chromeshield', 'visor_shield']), STRAPS = ['goggles', 'vr', 'eyepatch'];
for (const id of KNOWN.glasses.filter((x) => x !== 'none')) for (const [hs, hat] of HAIRS) {
  const body = BODIES[looks % 3], tag = id + ' ' + hs + '/' + hat + ' ' + body, G = build(base({ body, hair: { style: hs, color: '#5a3520' }, hat: { id: hat, color: '#e63946' }, glasses: { id, color: '#17141f' } })); budget(tag);
  const head = G.set(['head']), gl = G.gear('glasses'), P = G.P, all = G.set(BODY);
  if (!gl.length) { fail('built', tag); continue; }
  // every glasses vertex over the face sits in front of it (not sunk, no z-fight with the face decals)
  let sunk = 0, n = 0; gl.forEach((t) => { for (let k = 0; k < 3; k++) { const p = V(P, t, k); if (Math.abs(p[0]) > 0.2 || p[1] < HY + 0.16 || p[1] > HY + 0.36 || p[2] < 0.12) continue; const h = ray(head, [p[0], p[1], 1], [0, 0, -1]); if (h < 0) continue; n++; if (p[2] < 1 - h + 0.002) { sunk++; if (!fails.sunkAt) fails.sunkAt = [tag + ' ' + p.map((x) => x.toFixed(3)).join(',') + ' d ' + (p[2] - 1 + h).toFixed(4)]; } } });
  if (sunk) fail('sunk', tag + ' ' + sunk + '/' + n);
  if (LENSES.includes(id)) [1, -1].forEach((s) => { let z = -1; gl.forEach((t) => { for (let k = 0; k < 3; k++) { const p = V(P, t, k); if (Math.abs(p[0] - s * 0.124) < 0.085 && Math.abs(p[1] - HY - EY) < 0.02) z = Math.max(z, p[2]); } }); const f = 1 - ray(head, [s * 0.124, HY + EY, 1], [0, 0, -1]), off = z - f; if (!(off > 0.012 && off < 0.045)) fail('lens', tag + ' s' + s + ' ' + off.toFixed(3)); });
  if (TEMPLES.includes(id)) [1, -1].forEach((s) => { if (!gl.some((t) => [0, 1, 2].some((k) => { const p = V(P, t, k); return s * p[0] > 0.27 && p[1] > HY + 0.22 && p[1] < HY + 0.34 && p[2] < 0.03; }))) fail('temple', tag + ' s' + s); });
  if (STRAPS.includes(id)) {
    // the strap goes round the back of the head, outside the hair and hat (rays from outside reach the strap before any surface)
    const back = []; gl.forEach((t) => { for (let k = 0; k < 3; k++) { const p = V(P, t, k); if (p[2] < -0.12) back.push(p); } }); if (back.length < 12) fail('strap', tag + ' no strap behind the head');
    let out = 0; back.forEach((p) => { const cz = -0.01, u = [p[0], 0, p[2] - cz], l = Math.hypot(...u), d = [-u[0] / l, 0, -u[2] / l], o = [p[0] - d[0] * 0.6, p[1], p[2] - d[2] * 0.6], h = ray(all, o, d, 0.8); if (h < 0 || h > 0.6 - 0.003) out++; });
    if (back.length && out / back.length < (hs === 'locs' ? 0.85 : 0.9)) fail('strap', tag + ' ' + out + '/' + back.length + ' outside');
  }
  const fl = floating(G, 'glasses', 0.035, all); if (fl.length) fail('float', tag + ' ' + JSON.stringify(fl[0]));
}
if (fails.sunkAt) console.log('first sunk', fails.sunkAt[0]); delete fails.sunkAt;
report('built', 'every glasses id builds over every hair and hat'); report('sunk', 'no glasses vertex sinks into the face (lenses, frames, visors, bars, patches)');
report('lens', 'lenses sit 12..45 mm in front of the eyes on both sides'); report('temple', 'temples reach back to the ears on both sides');
report('strap', 'goggle, VR and eyepatch straps run round the back of the head over the hair and hat'); report('float', 'no glasses part floats free of the head');

// ------------------------------------------------------------------ 2. accessories per slot over bodies, tops, hair and hats
const TOPS = ['tee', 'hoodie', 'jacket', 'puffer', 'turtleneck', 'tank', 'hoodiebig', 'dress', 'jersey', 'croptop', 'overalls', 'poncho'];
const torsoOf = (G) => G.set(['head', 'top', 'bottom', 'midriff']);
// neck
for (const id of KNOWN.acc.neck.filter((x) => x.indexOf('none') !== 0)) for (const top of TOPS) for (const body of BODIES) {
  const tag = id + ' ' + top + ' ' + body, G = build(base({ body, top: { id: top, color: '#3a3f5c' }, hair: { style: looks % 2 ? 'long' : 'crop' }, acc: { neck: { id, color: '#d4a017' } } })); budget(tag);
  const T = torsoOf(G), info = hero.gearInfo && hero.gearInfo.neck;
  if (!info) { fail('neckinfo', tag); continue; }
  if (info.path && info.r) { let bad = 0, worst = ''; info.path.forEach((p, i) => { if (id === 'scarf' && i === 0) return; const dd = dist(T, p, 0.1); if (dd > info.r + 0.025 || dd < info.r * 0.3) { bad++; worst = i + ':' + dd.toFixed(3); } }); if (bad > info.path.length * 0.12) fail('neck', tag + ' ' + bad + '/' + info.path.length + ' ' + worst); }
  if (hero.gearInfo.pend) { const dd = dist(T, hero.gearInfo.pend, 0.1); if (dd > 0.02) fail('pend', tag + ' ' + dd.toFixed(3)); }
  if (info.cups) info.cups.forEach((q, i) => { const dd = dist(T, q.c, 0.2); if (dd > 0.06 || dd < 0.012) fail('hpneck', tag + ' cup' + i + ' ' + dd.toFixed(3)); if (q.c[1] > 1.0) fail('hpneck', tag + ' cup up at the jaw ' + q.c[1].toFixed(3)); });
  const fl = floating(G, 'acc', 0.03, G.set(BODY)); if (fl.length) fail('float_neck', tag + ' ' + JSON.stringify(fl[0]));
}
report('neckinfo', 'neckwear reports where it sits'); report('neck', 'chains, ribbons, scarf tails and bands rest on the neck, collar and chest (not floating, not buried) over every top and body');
report('pend', 'pendants (medal, cuban chain) lie on the chest'); report('hpneck', 'neck headphone cups rest on the shoulders, below the jaw'); report('float_neck', 'no neckwear part floats');
// ears
const EH = [['bald', 'none'], ['crop', 'none'], ['long', 'none'], ['afro', 'none'], ['bob', 'none'], ['buns', 'none'], ['hightop', 'none'], ['crop', 'cap'], ['long', 'beanie'], ['afro', 'bucketfur'], ['crop', 'hood'], ['crop', 'headphonehat'], ['pigtails', 'none'], ['mullet', 'cowboy']];
for (const id of KNOWN.acc.ears.filter((x) => x.indexOf('none') !== 0)) for (const [hs, hat] of EH) {
  const body = BODIES[looks % 3], tag = id + ' ' + hs + '/' + hat + ' ' + body, G = build(base({ body, hair: { style: hs }, hat: { id: hat }, acc: { ears: { id, color: '#d4a017' } } })); budget(tag);
  const all = G.set(BODY), HS = G.set(['head', 'hair', 'hat']), info = hero.gearInfo && hero.gearInfo.ears;
  if (id === 'hpears' && hat === 'headphonehat') { if (G.gear('acc').length) fail('ears', tag + ' doubles the headphone hat'); continue; }
  if (!info) { fail('ears', tag + ' no info'); continue; }
  if (id === 'hpears') {
    info.cups.forEach((c, i) => { const s = Math.sign(c[0]); let dd = 1; for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = k ? info.R * 0.9 : 0; dd = Math.min(dd, dist(HS, [c[0] - s * info.dep / 2, c[1] + Math.sin(a) * rr, c[2] + Math.cos(a) * rr], 0.2)); } if (dd > 0.012) fail('cups', tag + ' cup' + i + ' pad ' + dd.toFixed(3) + ' off'); if (Math.abs(c[1] - HY - 0.258) > 0.01) fail('cups', tag + ' cup not at ear height'); });
    // the band tube (r 0.02) never cuts a surface: every point and segment middle keeps 15 mm; it rests somewhere (35 mm); its top is outside everything above it
    let bad = 0, near = 1; const B = info.band || [[0, 9, 0]]; if (info.band) B.forEach((p, i) => { const q = i ? B[i - 1] : p; for (const x of [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]]) { const dd = dist(HS, x, 0.2); near = Math.min(near, dd); if (dd < 0.015) bad++; } });
    const top = B.reduce((a, p) => (p[1] > a[1] ? p : a), B[0]), ht = !info.band ? -1 : ray(HS, [top[0], top[1] + 0.6, top[2]], [0, -1, 0]); if (ht > 0 && ht < 0.6 - 0.02) bad++;
    if (bad || (info.band && near > 0.035) || (!info.band && !['cowboy', 'bucket', 'bucketfur', 'fedora', 'tophat', 'wizard', 'pirate'].includes(hat))) fail('band', tag + ' ' + bad + ' buried, nearest ' + near.toFixed(3));
  } else {
    if (hat === 'headphonehat') { if (info.list.length) fail('ears', tag + ' earrings poke out of a hat over the ears'); }
    else { if (info.list.length !== 2) fail('ears', tag + ' ' + info.list.length + ' earrings'); info.list.forEach((e) => { const dd = dist(HS, e.lobe, 0.1); if (dd > 0.025) fail('lobe', tag + ' ' + dd.toFixed(3)); }); }
  }
  const fl = floating(G, 'acc', 0.03, all); if (fl.length) fail('float_ears', tag + ' ' + JSON.stringify(fl[0]));
}
report('ears', 'earrings hang from both lobes, and hide under a hood or headphone hat'); report('lobe', 'earrings sit on the lobe or on the hair over it'); report('cups', 'headphone cups sit on the ears (or the hair and hat over them) at ear height');
report('band', 'the headphone band rides over the hair and hat, never through it'); report('float_ears', 'no earwear part floats');
// wrist
for (const id of KNOWN.acc.wrist.filter((x) => x.indexOf('none') !== 0)) for (const top of ['tee', 'tank', 'hoodie', 'puffer', 'hoodiebig', 'jacket', 'oversized', 'puffvest', 'flannel', 'kimono']) for (const body of BODIES) {
  const tag = id + ' ' + top + ' ' + body, G = build(base({ body, top: { id: top }, acc: { wrist: { id, color: '#2ee6ff' } } })); budget(tag);
  const info = hero.gearInfo && hero.gearInfo.wrist; if (!info) { fail('wrist', tag + ' no info'); continue; }
  const x = info.x, si = hero.object.getObjectByName('char_lit').geometry.attributes.skinIndex.array, armB = ['shL', 'elL', 'wrL'].map((nm) => hero.rig.bones.findIndex((b) => b.name === nm)), arm = mkSet(G.P, G.set(['arms', 'top']).ids.filter((t) => armB.includes(si[t * 12])));
  info.rings.forEach((r) => { let under = 0; for (const yy of [r.y - r.h / 2, r.y, r.y + r.h / 2]) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = [-Math.sin(a), 0, -Math.cos(a)], o = [x - d[0] * 0.15, yy, -d[2] * 0.15], h = ray(arm, o, d); if (h > 0) under = Math.max(under, 0.15 - h); }
    const inner = r.r * Math.cos(Math.PI / 8); if (inner - under < 0.002 || inner - under > 0.03) fail('wrist', tag + ' ring at ' + r.y.toFixed(3) + ' gap ' + (inner - under).toFixed(3)); });
  if (G.set(['arms']).ids.length && info.bare && wearLong(top)) fail('wrist', tag + ' bare under a long sleeve');
  const fl = floating(G, 'acc', 0.03, G.set(BODY)); if (fl.length) fail('float_wrist', tag + ' ' + JSON.stringify(fl[0]));
}
function wearLong(top) { return ['hoodie', 'puffer', 'hoodiebig', 'jacket', 'flannel', 'kimono'].includes(top); }
report('wrist', 'wristwear wraps the bare wrist or the cuff, 2..30 mm clear all round (no z-fight, not hidden in the sleeve)'); report('float_wrist', 'no wristwear part floats');
// back
for (const id of KNOWN.acc.back.filter((x) => x.indexOf('none') !== 0)) for (const top of ['tee', 'hoodie', 'puffer', 'hoodiebig', 'dress', 'tank', 'jacket', 'jersey', 'croptop']) for (const body of BODIES) {
  const tag = id + ' ' + top + ' ' + body, G = build(base({ body, top: { id: top, color: '#3a3f5c' }, acc: { back: { id, color: '#e63946' } } })); budget(tag);
  const T = torsoOf(G), info = hero.gearInfo && hero.gearInfo.back, bk = (x, y) => { const h = ray(T, [x, y, -1], [0, 0, 1]); return h < 0 ? null : -1 + h; };
  if (!info) { fail('back', tag + ' no info'); continue; }
  if (id === 'backpack') { let minGap = 1, pen = 0; for (const x of [-0.12, -0.06, 0, 0.06, 0.12]) for (const y of [0.6, 0.66, 0.72, 0.78, 0.84]) { const z = bk(x, y); if (z === null) continue; const gap = z - info.front(y); minGap = Math.min(minGap, gap); if (gap < -0.004) pen++; } if (pen) fail('pack', tag + ' sinks into the back at ' + pen + ' points'); if (minGap > 0.015) fail('pack', tag + ' floats ' + minGap.toFixed(3) + ' off the back');
    info.straps.forEach((s) => s.forEach((p, i) => { if (i === 7 || i === 8) return; const dd = dist(T, p, 0.1); if (dd > 0.03) fail('straps', tag + ' strap point ' + i + ' ' + dd.toFixed(3)); })); }
  if (id === 'cape') { const r = info.rows[0], z = bk(0, r.y); if (z !== null && (r.cz + r.rz > z + 0.003 || z - (r.cz + r.rz) > 0.035)) fail('cape', tag + ' top row gap ' + (z - r.cz - r.rz).toFixed(3)); info.rows.forEach((r2) => { for (const k of [-0.5, 0, 0.5]) { const z2 = bk(k * r2.rx, r2.y); if (z2 !== null && r2.cz + r2.rz > z2 + 0.004) fail('cape', tag + ' row ' + r2.y + ' cuts into the body'); } }); }
  if (id === 'wings') info.roots.forEach((p) => { const dd = dist(T, p, 0.1); if (dd > 0.02) fail('wings', tag + ' root ' + dd.toFixed(3)); });
  if (id === 'guitar') { const z = bk(info.bc[0], info.bc[1]); if (z !== null && (info.gz + 0.06 > z + 0.002 || z - info.gz - 0.06 > 0.03)) fail('guitar', tag + ' body gap ' + (z - info.gz - 0.06).toFixed(3)); info.strap.forEach((p, i) => { if (i === 0 || i === 8 || i === 10) return; const dd = dist(T, p, 0.1); if (dd > 0.03) fail('guitar', tag + ' strap ' + i + ' ' + dd.toFixed(3)); }); }
  if (id === 'crossbody') { const [bx, , bz, bw, , bd] = info.bag, gap = bz - bd / 2 - info.zf; if (gap < 0 || gap > 0.01) fail('bag', tag + ' bag gap ' + gap.toFixed(3)); if (Math.abs(bx) + bw / 2 > hero.d.shX - 0.068 - 0.004) fail('bag', tag + ' bag in the arm'); info.strap.forEach((p, i) => { if (i === 0 || i === 9 || i === 10) return; const dd = dist(T, p, 0.1); if (dd > 0.03) fail('bag', tag + ' strap ' + i + ' ' + dd.toFixed(3)); }); }
  const fl = floating(G, 'acc', 0.035, G.set(BODY)); if (fl.length) fail('float_back', tag + ' ' + JSON.stringify(fl[0]));
}
report('back', 'backwear reports where it sits'); report('pack', 'the backpack touches the back without sinking in (hoods and puffers included)'); report('straps', 'backpack straps lie over the shoulders and down the chest');
report('cape', 'the cape hangs just behind the back, never through it'); report('wings', 'the wings grow from the back'); report('guitar', 'the guitar rests on the back on a strap across the chest');
report('bag', 'the crossbody bag rests on the hip clear of the arm, its strap on the body'); report('float_back', 'no backwear part floats');
// hand: the boombox handle goes through the fist
for (const body of BODIES) { build(base({ body, acc: { hand: { id: 'boombox', color: '#c0392b' } } })); const f = hero.gearInfo.hand.fist, W = hero.rest.wrR; ok(Math.abs(f[0] - W[0]) < 0.01 && W[1] - f[1] > 0.08 && W[1] - f[1] < 0.125, 'the boombox handle runs through the fist (' + body + ')'); }

// ------------------------------------------------------------------ 3. the budget: every id, and the heaviest full-gear looks
const HEAVY = [['afro', 'bucketfur', 'puffer', 'vr'], ['locs', 'cowboy', 'hoodiebig', 'goggles'], ['long', 'wizard', 'champ', 'chromeshield'], ['buns', 'crown', 'kimono', 'eyepatch'], ['afro', 'beanie', 'puffer', 'goggles'], ['locs', 'hood', 'hoodiebig', 'vr'], ['hightop', 'headphonehat', 'champ', 'pixel']];
for (const [hs, hat, top, gid] of HEAVY) for (const body of BODIES) for (const set of [['cubanchain', 'hpears', 'icedwatch', 'backpack', 'boombox'], ['hpneck', 'dangles', 'stackedbands', 'guitar', 'neonmic'], ['scarf', 'hoops', 'bracelets', 'crossbody', 'goldmic'], ['medal', 'iced', 'watch', 'cape', 'mic']]) {
  build(base({ body, hair: { style: hs }, hat: { id: hat }, top: { id: top }, glasses: { id: gid }, facial: 'longbeard', marks: ['freckles', 'goldgrill'], acc: { neck: { id: set[0] }, ears: { id: set[1] }, wrist: { id: set[2] }, back: { id: set[3] }, hand: { id: set[4] } } })); budget(hs + '/' + hat + '/' + top + '/' + gid + ' ' + set.join(','));
  const lit = hero.triParts.lit + hero.triParts.glow; if (lit > TRI_BUDGET) fail('budget', 'lit+glow alone ' + lit);
}
console.log('gear3d: ' + looks + ' looks, largest ' + maxTris + ' tris');
report('budget', 'every gear look stays within ' + TRI_BUDGET + ' tris (largest ' + maxTris + ', ' + looks + ' looks)');
ok(errs.length === 0, 'no build errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

// ------------------------------------------------------------------ 4. clips: skinned gear stays on the skinned body (CPU skinning of the lit mesh)
{
  const CLIPS = ['idle', 'walk', 'run', 'dance', 'beatbox', 'battle', 'cheer', 'sit', 'hit'], v = new (hero.object.position.constructor)();
  const LOOKS = [
    base({ body: 'boy', hair: { style: 'long' }, hat: { id: 'cap' }, glasses: { id: 'aviator' }, top: { id: 'hoodie' }, acc: { neck: { id: 'cubanchain' }, ears: { id: 'hoops' }, wrist: { id: 'watch' }, back: { id: 'backpack' } } }),
    base({ body: 'girl', hair: { style: 'afro' }, glasses: { id: 'vr' }, top: { id: 'jacket' }, acc: { neck: { id: 'chain' }, ears: { id: 'hpears' }, wrist: { id: 'stackedbands' }, back: { id: 'crossbody' } } }),
    base({ body: 'neutral', hair: { style: 'bob' }, hat: { id: 'beanie' }, glasses: { id: 'eyepatch' }, top: { id: 'tee' }, acc: { neck: { id: 'hpneck' }, ears: { id: 'dangles' }, wrist: { id: 'bracelets' }, back: { id: 'guitar' } } }),
    base({ body: 'boy', hair: { style: 'crop' }, glasses: { id: 'goggles' }, top: { id: 'tank' }, acc: { neck: { id: 'medal' }, ears: { id: 'studs' }, wrist: { id: 'wristband' }, back: { id: 'cape' } } }),
  ];
  for (const L of LOOKS) {
    const c = createCharacter({ quality: 'high' }, L), mesh = c.object.getObjectByName('char_lit'), n = mesh.geometry.attributes.position.count, P = new Float32Array(n * 3);
    for (const clip of CLIPS) {
      c.play(clip, { speed: 1.3, bpm: 100, seat: 0.46 });
      for (let f = 0; f < 60; f++) { c.update(1 / 30, f / 30); if (f % 20 !== 19) continue; c.object.updateMatrixWorld(true); mesh.skeleton.update(); for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
        const G = grab(c, P), body = G.set(BODY), tag = L.body + '/' + clip + '@' + f;
        ['glasses', 'acc'].forEach((s) => { const fl = floating(G, s, 0.05, body); if (fl.length) fail('anim', tag + ' ' + s + ' ' + JSON.stringify(fl[0])); }); }
    }
    c.dispose();
  }
  report('anim', 'through idle, walk, run, dance, beatbox, battle, cheer, sit and hit every gear part stays on the body');
}
console.error = origErr; clearTimeout(watchdog); fs.rmSync(tmp, { recursive: true, force: true }); done();
