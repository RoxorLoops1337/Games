// Sound Lab control room hardware (Interior Artist INT-A): the mixing desk with 16 channel strips, LED VU ladders and two analog needle meters (they bounce on setBeat),
// DAW screens, studio monitors on stands, two rack towers with blinking LEDs, the MPC pad table and a small synth, the engineer's chair.
import { P, mix, mul, bar, col, WARM, PINKN, CYANN, YELN, GREENN, WHITEN } from './flat_kit.js';
import { wallDecal } from './shop_shell.js';
import { lamp } from './shop_front.js';

const C = (h) => col(h);
export const DESK = { cx: -1.95, cz: -1.5, w: 2.9, d: 0.95, top: 0.8 };
const GREEN = [0.35, 2.6, 0.7], AMBER = [3.0, 2.3, 0.3], REDL = [3.2, 0.4, 0.35], DARK = (c) => [c[0] * 0.06, c[1] * 0.06, c[2] * 0.06];

// rotate a local point (x, y, z) by pitch rx about X, then translate: used for faces on the tilted meter bridge
const tilt = (ox, oy, oz, x, y, z, rx) => { const c = Math.cos(rx), s = Math.sin(rx); return [ox + x, oy + y * c - z * s, oz + y * s + z * c]; };

export function buildDesk(S, F) {
  const B = S.B, G = S.GLOW, D = S.dyn, hit = S.hit, R = S.rand, N = F.N, d = DESK, x0 = d.cx - d.w / 2, x1 = d.cx + d.w / 2, z0 = d.cz - d.d / 2, z1 = d.cz + d.d / 2, ty = d.top;
  const ui = S.ui = { ladders: [], needles: [], rackLeds: [], pads: [], needleDefs: [] };
  S.soft(d.cx, d.cz + 0.3, d.w / 2 + 0.5, 1.0, 0.45);
  // ---- cabinet: dark body, walnut cheeks, front kick, sloped control surface
  B.box(d.cx, 0, d.cz, d.w - 0.12, ty - 0.02, d.d - 0.02, C('#2f2a48'), { base: 0.35, tint: 0.03 }); [x0 + 0.04, x1 - 0.04].forEach((x) => B.box(x, 0, d.cz, 0.1, ty + 0.06, d.d + 0.04, C('#7a4a32'), { base: 0.2, tint: 0.04, top: C('#9a6a48') }));
  B.box(d.cx, 0, z1 - 0.02, d.w - 0.1, 0.12, 0.04, C('#1c1830'), { base: 0 }); B.box(d.cx, ty - 0.05, z1 + 0.0, d.w - 0.1, 0.06, 0.1, C('#7a4a32'), { base: 0.1, top: C('#9a6a48') });
  B.push(d.cx, ty - 0.02, d.cz + 0.06, 0, 1, 0.0); B.box(0, 0, 0, d.w - 0.2, 0.05, d.d - 0.3, C('#3a3560'), { base: 0.05, tint: 0.02, top: C('#454078') }); B.pop();
  // ---- channel strips: 16 faders, 3 knobs, a mute button each, colour-coded groups
  const grp = [PINKN, CYANN, YELN, GREENN], gc = [P.pink, P.cyan, P.yellow, P.lime];
  const sx0 = x0 + 0.2, pitch = (d.w - 0.7) / 16;
  for (let i = 0; i < 16; i++) {
    const x = sx0 + (i + 0.5) * pitch * 0.96, c = gc[((i / 4) | 0) % 4], fy = ty + 0.03 + 0.0, fz = z1 - 0.2 + 0.0;
    B.box(x, fy, fz, 0.012, 0.004, 0.24, P.black, { base: 0 }); B.box(x, fy, fz + 0.12 - ((i * 37) % 10) * 0.022, 0.026, 0.02, 0.04, i % 2 ? P.cream : P.steelL, { base: 0 }); B.box(x, fy + 0.02, fz + 0.12 - ((i * 37) % 10) * 0.022, 0.016, 0.006, 0.012, c, { base: 0 });
    for (let k = 0; k < 3; k++) B.cyl(x, fy, z1 - 0.38 - k * 0.1, 0.014, 0.012, 0.022 + 0.0, 5, k === 0 ? c : mix(P.steelD, c, 0.2));
    B.box(x, fy, z1 - 0.62, 0.03, 0.014, 0.02, i % 3 === 0 ? P.red : P.cream, { base: 0 });
  }
  // master section: big knob, a bar of buttons, a talkback mic and a transport
  { const mx = x1 - 0.3; B.cyl(mx, ty + 0.03, z1 - 0.3, 0.045, 0.04, 0.04, 8, P.cream); B.cyl(mx, ty + 0.03, z1 - 0.3, 0.05, 0.05, 0.012, 8, P.pink); for (let k = 0; k < 5; k++) B.box(mx - 0.1 + k * 0.05, ty + 0.03, z1 - 0.52, 0.035, 0.016, 0.025, [P.pink, P.cyan, P.yellow, P.lime, P.red][k], { base: 0 }); B.box(mx, ty + 0.03, z1 - 0.14, 0.2, 0.012, 0.06, P.ink, { base: 0 }); [-0.07, 0, 0.07].forEach((dx) => G.box(mx + dx - 0.01, ty + 0.043, z1 - 0.16, 0.02, 0.004, 0.02, [GREEN, AMBER, REDL][(dx * 14 + 1) | 0], { base: 0, tint: 0 })); }
  // scribble strip decal across the surface, and a lit edge line
  S.decal('strip', d.cx - 0.1, ty + 0.034, z0 + 0.3, 2.28, 0.19, 0, -Math.PI / 2, [1.05, 1.05, 1.05]); G.box(x0 + 0.16, ty + 0.01, z1 + 0.05, d.w - 0.32, 0.006, 0.01, PINKN, { base: 0, tint: 0 });
  // ---- meter bridge (tilted back 17 degrees) with the LED ladders and the analog meters
  const bz = z0 + 0.14, by = ty + 0.03, tl = -0.3;
  B.push(d.cx, by, bz, 0, 1, tl); B.box(0, 0, 0, d.w - 0.34, 0.34, 0.2, C('#262142'), { base: 0.2, tint: 0.02, top: C('#3a3560') }); B.box(0, 0.33, 0.02, d.w - 0.3, 0.03, 0.24, C('#7a4a32'), { base: 0 }); B.pop();
  // LED ladders: 16 columns x 11 segments on the bridge face
  { const segs = 11, fw = 0.075, pw = (d.w - 0.7) / 16 * 0.96; for (let i = 0; i < 16; i++) { const x = d.cx - 0.45 - 0.24 + (i - 7.5) * (1.62 / 15) - 0.0 + 0.0, col = []; for (let s = 0; s < segs; s++) { const y = 0.035 + s * 0.026, c0 = s < 7 ? GREEN : s < 9 ? AMBER : REDL, p = tilt(x, by, bz, 0, y, 0.101, tl); col.push(D.rect(p[0], p[1], p[2], fw, 0.017, 0, tl, DARK(c0))); } ui.ladders.push({ q: col, lv: 0, pk: 0, ph: R() * 6, rate: 1.6 + R() * 1.4 }); } void pw; }
  // analog VU meters (decal faces) with needle quads rewritten per frame
  [[d.cx + 0.95, 0], [d.cx + 1.27 - 0.0, 1]].forEach(([mx, k]) => {
    const f = tilt(mx, by, bz, 0, 0.17, 0.103, tl); S.decal('vu', f[0], f[1], f[2], 0.29, 0.18, 0, tl, [1.05, 1.05, 1.05]); B.push(mx, by, bz, 0, 1, tl); B.box(0, 0.07, 0.095, 0.32, 0.21, 0.012, C('#1a1630'), { base: 0 }); B.pop();
    const piv = tilt(mx, by, bz, 0, 0.1, 0.108, tl), nq = D.rect(piv[0], piv[1], piv[2], 0.004, 0.14, 0, tl, [0.1, 0.07, 0.07]); ui.needles.push({ q: nq, piv, ang: -0.9, vel: 0, k, mx });
  });
  G.box(d.cx + 0.82, by + 0.28, bz + 0.0, 0.5, 0.012, 0.04, [2.4, 1.7, 0.7], { base: 0, tint: 0 });
  // ---- DAW screens on a stand behind the bridge, desk lamp, headphones, mug, notepad, keyboard
  { const mz = z0 - 0.12, my = by + 0.4;
    [[d.cx - 0.55, 'daw', 0.18], [d.cx + 0.4, 'daw2', -0.12]].forEach(([mx, nm, ry]) => { B.push(mx, my, mz, ry); B.box(0, 0.0, 0.0, 0.76, 0.46, 0.04, P.ink, { base: 0, tint: 0.01 }); B.box(0, -0.4, -0.02, 0.05, 0.4, 0.04, P.ink, { base: 0 }); B.box(0, -0.4, -0.02, 0.22, 0.02, 0.16, P.ink, { base: 0 }); B.pop(); S.screen(nm, mx + Math.sin(ry) * 0.023, my + 0.23, mz + Math.cos(ry) * 0.023, 0.7, 0.4, ry, 0, [1.1, 1.1, 1.1]); });
    S.lights.push({ x: d.cx, y: 1.25, z: d.cz + 0.5, color: '#9ad0ff', r: 4.2, i: 0.55, kind: 'tv' });
    lamp(S, x0 + 0.3, ty + 0.03, z0 + 0.18, 0.4, C('#ffd23f'), [3.0, 2.2, 0.8]); S.lights.push({ x: x0 + 0.3, y: 1.3, z: z0 + 0.25, color: '#ffb866', r: 4.2, i: 0.75, kind: 'lamp' });
    B.lathe([[0.035, 0, P.cream], [0.04, 0.085, P.cream], [0.0, 0.085, P.coral]], 8, x1 - 0.55, ty + 0.03, z1 - 0.15, {}); B.box(x0 + 0.85, ty + 0.03, z1 - 0.15, 0.2, 0.012, 0.28, P.cream, { base: 0, ry: 0.3 }); B.box(x0 + 0.88, ty + 0.042, z1 - 0.12, 0.12, 0.003, 0.003, P.ink, { base: 0 });
    B.lathe([[0.05, 0, P.pink], [0.05, 0.035, P.pinkL], [0, 0.035, P.pink]], 8, x1 - 0.85, ty + 0.03, z1 - 0.2, { sx: 0.9 }); B.lathe([[0.05, 0, P.pink], [0.05, 0.035, P.pinkL], [0, 0.035, P.pink]], 8, x1 - 0.7, ty + 0.03, z1 - 0.2, {}); bar(B, [x1 - 0.85, ty + 0.07, z1 - 0.2], [x1 - 0.78, ty + 0.12, z1 - 0.2], 0.012, 0.012, P.ink); bar(B, [x1 - 0.78, ty + 0.12, z1 - 0.2], [x1 - 0.7, ty + 0.07, z1 - 0.2], 0.012, 0.012, P.ink);
  }
  hit.box(d.cx, d.cz, d.w / 2 + 0.04, d.d / 2 + 0.04, 0);
  // ---- studio monitors on stands, toed in toward the engineer
  [[-3.75, -2.35, 0.7], [-0.15, -2.35, -0.7]].forEach(([x, z, ry]) => { S.soft(x, z, 0.35, 0.35, 0.35); B.cyl(x, 0, z, 0.2, 0.2, 0.03, 8, P.ink); B.cyl(x, 0.03, z, 0.025, 0.025, 1.0, 6, P.steelD); B.push(x, 1.04, z, ry); B.box(0, 0, 0, 0.26, 0.38, 0.26, C('#20202e'), { base: 0.2, tint: 0.02, top: C('#2a2a3c') }); B.lathe([[0.1, 0, P.black], [0.1, 0.012, P.inkL], [0.05, 0.02, P.black], [0.0, 0.03, P.steelD]], 10, 0, 0.12, 0.132, { rot: 0 }); B.push(0, 0.3, 0.132, 0, 1, Math.PI / 2); B.pop(); B.lathe([[0.03, 0, P.black], [0.03, 0.012, P.steelL], [0.0, 0.015, P.steelL]], 8, 0, 0.3, 0.132, {}); B.pop(); hit.circle(x, z, 0.2); });
  // ---- two rack towers against the north wall; units with knobs and blinking LEDs (dynamic)
  [[-2.75, 6], [-2.1, 7]].forEach(([x, seed], t) => {
    const z = -3.2, w = 0.58, h = 1.95, dp = 0.5; S.soft(x, z + 0.1, 0.5, 0.45, 0.4);
    B.box(x, 0, z, w, h, dp, C('#1e1a30'), { base: 0.3, tint: 0.02, top: C('#2a2540') }); B.box(x, 0, z + dp / 2 + 0.005, w + 0.03, 0.08, 0.02, P.black, { base: 0 }); B.box(x, h - 0.02, z + dp / 2 + 0.005, w + 0.03, 0.04, 0.02, P.black, { base: 0 });
    const fz = z + dp / 2 + 0.012, nU = 20; let u = 0;
    while (u < nU - 1) { const hu = (R() < 0.3 ? 2 : 1), y = 0.1 + u * 0.09, hh = hu * 0.09 - 0.006, pc = [C('#3a3a50'), C('#2f2f46'), C('#4a3a58'), C('#34465a'), C('#454560')][((R() * 5) | 0)]; if (R() < 0.12) { u += 1; continue; }
      B.box(x, y, fz, w - 0.06, hh, 0.01, pc, { base: 0, tint: 0.04 }); B.box(x - w / 2 + 0.045, y + hh / 2 - 0.004, fz + 0.006, 0.012, 0.012, 0.004, P.steelL, { base: 0 }); B.box(x + w / 2 - 0.045, y + hh / 2 - 0.004, fz + 0.006, 0.012, 0.012, 0.004, P.steelL, { base: 0 });
      const nk = 2 + ((R() * 3) | 0); for (let k = 0; k < nk; k++) B.cyl(x - 0.2 + k * 0.075, y + 0.025, fz + 0.005, 0.014, 0.012, 0.014, 5, [P.cream, P.pinkL, P.cyan, P.yellow][((R() * 4) | 0)]);
      const nl = 3 + ((R() * 5) | 0); for (let k = 0; k < nl; k++) { const c = [[0.3, 2.8, 1.0], [3.0, 0.5, 0.4], [3.0, 2.2, 0.3], [0.4, 2.2, 3.0]][((R() * 4) | 0)]; ui.rackLeds.push({ q: D.rect(x + 0.04 + k * 0.032 - 0.02, y + hh / 2 + 0.012, fz + 0.007, 0.014, 0.014, 0, 0, DARK(c)), c, ph: R() * 6.3, rate: 0.5 + R() * 4, thr: -0.2 + R() * 0.6 }); }
      u += hu; }
    [-1, 1].forEach((sd) => B.box(x + sd * (w / 2 - 0.04), 0.08, fz + 0.002, 0.03, h - 0.12, 0.014, P.black, { base: 0 }));
    hit.box(x, z, w / 2 + 0.03, dp / 2 + 0.03, 0);
  });
  S.lights.push({ x: -2.4, y: 1.4, z: -2.5, color: '#35f2e0', r: 3.4, i: 0.4, kind: 'neon' });
  // ---- MPC pad table with a 4 x 4 pad grid (dynamic), an LCD, and a small synth next to it
  { const tx = 0.75, tz = -1.45, th = 0.85; S.soft(tx, tz, 0.8, 0.6, 0.4); B.box(tx, th - 0.04, tz, 0.9, 0.04, 0.62, P.woodL, { base: 0.1, tint: 0.03, top: C('#e0b27a') }); [[-0.4, -0.26], [0.4, -0.26], [-0.4, 0.26], [0.4, 0.26]].forEach(([dx, dz]) => B.box(tx + dx, 0, tz + dz, 0.04, th - 0.04, 0.04, P.black, { base: 0.2 })); B.box(tx, 0.4, tz, 0.84, 0.02, 0.56, P.steelD, { base: 0 });
    B.push(tx - 0.08, th, tz + 0.02, 0.0, 1, 0.2); B.box(0, 0, 0, 0.5, 0.05, 0.4, C('#2a2a38'), { base: 0.1, top: C('#34344a') }); B.pop();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const p = tilt(tx - 0.08, th, tz + 0.02, -0.12 + i * 0.075, 0.058, -0.04 + j * 0.065, 0.2), pc = [[3.2, 0.5, 1.6], [0.5, 2.6, 3.0], [3.0, 2.3, 0.4], [0.9, 2.8, 0.8]][(i + j) % 4], q = D.rect(p[0], p[1], p[2] + 0.0, 0.06, 0.052, 0, -1.37, DARK(pc)); ui.pads.push({ q, c: pc, flash: 0, i, j }); }
    { const lc = tilt(tx - 0.08, th, tz + 0.02, 0.0, 0.056, -0.15, 0.2); S.screen('mpc', lc[0], lc[1], lc[2], 0.2, 0.12, 0, -1.37, [1.1, 1.1, 1.1]); }
    for (let k = 0; k < 4; k++) B.cyl(tx + 0.12 + (k % 2) * 0.05, th + 0.03, tz - 0.12 + (k >> 1) * 0.06, 0.016, 0.014, 0.02, 6, [P.pink, P.cyan, P.yellow, P.cream][k]);
    // synth on an A-frame stand
    const sx = 0.55, sz = -2.7; B.push(sx, 0, sz, 0.1); [-0.4, 0.4].forEach((dx) => { bar(B, [dx, 0.82, 0], [dx - 0.1, 0, 0.0], 0.03, 0.03, P.ink); bar(B, [dx, 0.82, 0], [dx + 0.1, 0, 0.0], 0.03, 0.03, P.ink); }); B.box(0, 0.82, 0, 0.9, 0.03, 0.34, P.ink, { base: 0 });
    B.box(0, 0.85, 0, 0.9, 0.06, 0.28, C('#c04a58'), { base: 0.1, tint: 0.03, top: C('#d85a68') }); for (let k = 0; k < 14; k++) B.box(-0.41 + k * 0.063, 0.905, 0.05, 0.058, 0.014, 0.17, P.cream, { base: 0 }); for (let k = 0; k < 13; k++) if (![2, 6, 9].includes(k)) B.box(-0.38 + k * 0.063, 0.915, 0.0, 0.034, 0.016, 0.1, P.ink, { base: 0 }); for (let k = 0; k < 6; k++) B.cyl(-0.38 + k * 0.1, 0.91, -0.1, 0.018, 0.015, 0.016, 5, [P.cyan, P.yellow, P.pink][k % 3]); B.pop();
    hit.box(tx, tz, 0.48, 0.34, 0); hit.box(sx, sz, 0.5, 0.2, 0.1);
  }
  // ---- engineer's chair (5-star base, seat, backrest) pulled out from the desk
  { const cx = -1.0, cz = 0.0, ry = 0.5; S.soft(cx, cz, 0.45, 0.45, 0.4); B.push(cx, 0, cz, ry); for (let k = 0; k < 5; k++) { const a = k * 1.2566; bar(B, [0, 0.1, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.04, 0.03, P.black); B.box(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.05, 0.05, 0.05, P.ink, { base: 0 }); }
    B.cyl(0, 0.1, 0, 0.03, 0.03, 0.32, 6, P.steelD); B.box(0, 0.42, 0, 0.5, 0.09, 0.5, P.ink, { base: 0.3, taper: 0.92, top: P.inkL }); B.box(0, 0.46, 0, 0.36, 0.07, 0.46, P.teal, { base: 0, taper: 0.9 });
    B.push(0, 0.5, -0.25, 0, 1, 0.14); B.box(0, 0, 0, 0.48, 0.66, 0.1, P.ink, { base: 0.1, taper: 0.94, top: P.inkL }); B.box(0, 0.08, 0.03, 0.26, 0.5, 0.06, P.teal, { base: 0, taper: 0.92 }); B.pop(); B.pop(); hit.circle(cx, cz, 0.34); }
}

// ---------------------------------------------------------------- per-frame animation: VU ladders, needles, rack LEDs, pads. beat 0..1 (eased), kick = impulse on a rising beat
export function makeDeskAnim(S) {
  const ui = S.ui, D = S.dyn; let t = 0, beat = 0, beatT = 0, kick = 0, rec = 0, seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return {
    setBeat(b) { b = Math.max(0, Math.min(1, +b || 0)); if (b - beatT > 0.14) { kick = 1; ui.pads[(rnd() * 16) | 0].flash = 1; ui.pads[(rnd() * 16) | 0].flash = 1; } beatT = b; },
    update(dt, time) {
      t = time; beat += (beatT - beat) * (1 - Math.exp(-dt * 14)); kick = Math.max(0, kick - dt * 5.5); const lift = 0.2 + 0.42 * beat + 0.4 * kick, segs = 11;
      let avg = 0;
      ui.ladders.forEach((L, i) => {
        const wob = 0.5 + 0.5 * Math.sin(t * L.rate * (1.5 + beat * 2) + L.ph), tgt = Math.min(1, lift * (0.55 + 0.7 * wob) + 0.1 * Math.sin(t * 7.3 + i * 1.7)); L.lv += (tgt - L.lv) * (1 - Math.exp(-dt * (tgt > L.lv ? 22 : 7))); if (L.lv > L.pk) L.pk = L.lv; else L.pk = Math.max(L.lv, L.pk - dt * 0.45); avg += L.lv;
        const on = Math.round(L.lv * segs), pk = Math.min(segs - 1, Math.round(L.pk * segs));
        for (let s = 0; s < segs; s++) { const c0 = s < 7 ? GREEN : s < 9 ? AMBER : REDL; D.color(L.q[s], s < on || s === pk && pk > 0 ? c0 : DARK(c0)); }
      });
      avg /= ui.ladders.length;
      ui.needles.forEach((N, k) => { const tg = -1.05 + 1.5 * Math.min(1, avg * 1.1 + 0.08 * Math.sin(t * 3 + k)) + 0.12 * kick, ac = (tg - N.ang) * 90 - N.vel * 9; N.vel += ac * dt; N.ang += N.vel * dt; const a = Math.max(-1.1, Math.min(0.62, N.ang)), len = 0.14, px = Math.sin(a) * len, py = Math.cos(a) * len, w = 0.005, p = N.piv; const tl = -0.3, c = Math.cos(tl), s = Math.sin(tl);
        const pt = (u, v) => [p[0] + u, p[1] + v * c, p[2] + v * s]; D.setQuad(N.q, pt(-w, 0), pt(w, 0), pt(px + w, py), pt(px - w, py)); });
      ui.rackLeds.forEach((L) => { const on = Math.sin(t * L.rate + L.ph) > L.thr + (L.rate > 3 ? 0 : 0.3 - 0.4 * beat); D.color(L.q, on ? L.c : DARK(L.c)); });
      ui.pads.forEach((P_) => { P_.flash = Math.max(0, P_.flash - dt * 4); const base = 0.28 + 0.18 * Math.sin(t * 1.2 + P_.i * 0.9 + P_.j * 1.3) + 0.2 * beat, k = Math.min(1.3, base + P_.flash); D.color(P_.q, [P_.c[0] * k, P_.c[1] * k, P_.c[2] * k]); });
      D.flush();
    },
  };
}
