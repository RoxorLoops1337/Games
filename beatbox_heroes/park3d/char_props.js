// CHARACTER PROPS: small hand-held props for the 'hold' clip and the judges: card (playing card), box (cardboard), clipboard, scorecard (judge's card with a 7 segment score).
// A prop is a plain (unskinned) group in the character's object space. The animator places it between the hands (clip targets) or at the right hand when no clip drives it.
// Built from the same primitives and colours as the characters (vertex colours, shared lit/glow materials). Each prop is <= 120 tris.
import { THREE } from './kit.js';
import { MB, K, C, mix, shade, lite, box, plainGeo, INK, CREAM } from './char_geo.js';

export const PROP_KINDS = ['card', 'box', 'clipboard', 'scorecard'];
const SK = K('hips');
// 7 segment digits (glow): a b c d e f g
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(glow, ch, cx, cy, h, col, z) {
  const w = h * 0.5, t = h * 0.14, hx = w / 2, hy = h / 2, bar = (x0, y0, x1, y1) => glow.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], col, SK, [0, 0, 1], { flat: true, nh: true });
  const f = { a: [-hx + t, hy - t, hx - t, hy], d: [-hx + t, -hy, hx - t, -hy + t], g: [-hx + t, -t / 2, hx - t, t / 2], f: [-hx, 0.0 + t / 2, -hx + t, hy - t / 2], b: [hx - t, t / 2, hx, hy - t / 2], e: [-hx, -hy + t / 2, -hx + t, -t / 2], c: [hx - t, -hy + t / 2, hx, -t / 2] };
  (SEG[ch] || '').split('').forEach((s) => { const q = f[s]; bar(cx + q[0], cy + q[1], cx + q[2], cy + q[3]); });
}
export function buildProp(kind, o) {
  o = o || {}; const lit = new MB(77), glow = new MB(78), col = C(o.color || (kind === 'box' ? '#b98b5e' : kind === 'card' ? '#e63946' : '#f7f2e8'));
  const c0 = [0, 0, 0];
  if (kind === 'box') {
    const b = col, tape = lite(b, 0.35);
    box(lit, c0, [0.3, 0.22, 0.3], b, SK, { col2: lite(b, 0.1) });
    box(lit, [0, 0.114, 0], [0.31, 0.012, 0.31], shade(b, 0.88), SK);                 // lid edge
    box(lit, [0, 0.121, 0], [0.05, 0.004, 0.31], tape, SK);                           // tape across the lid
    box(lit, [0, 0, 0.152], [0.05, 0.22, 0.004], tape, SK);                           // tape down the front
    box(lit, [0.07, 0.03, 0.153], [0.07, 0.05, 0.004], '#f7f2e8', SK);                // label
  } else if (kind === 'card') {
    const w = 0.2, h = 0.29;
    box(lit, c0, [w, h, 0.012], '#fff6e6', SK);
    box(lit, [0, 0, 0.0065], [w - 0.03, h - 0.04, 0.002], col, SK);
    glow.poly([[0, 0.07, 0.009], [0.05, 0, 0.009], [0, -0.07, 0.009], [-0.05, 0, 0.009]], '#fff6e6', SK, [0, 0, 1], { flat: true, nh: true });
    box(lit, [-0.062, 0.1, 0.0075], [0.025, 0.025, 0.001], '#fff6e6', SK); box(lit, [0.062, -0.1, 0.0075], [0.025, 0.025, 0.001], '#fff6e6', SK);
  } else if (kind === 'clipboard') {
    const w = 0.25, h = 0.34;
    box(lit, c0, [w, h, 0.016], '#6b4a2a', SK, { col2: '#7f5a36' });
    box(lit, [0, -0.005, 0.0105], [w - 0.04, h - 0.06, 0.004], '#fffdf4', SK);
    for (let i = 0; i < 5; i++) box(lit, [-0.01 - (i === 4 ? 0.03 : 0), 0.08 - i * 0.04, 0.0135], [i === 4 ? 0.1 : 0.15, 0.007, 0.001], i === 0 ? mix(col, INK, 0.2) : '#7a7a90', SK);
    box(lit, [0, h / 2 - 0.012, 0.014], [0.09, 0.034, 0.014], '#c9d3e6', SK);        // metal clip
  } else {                                                                              // scorecard: white card on a short grip, big glowing digits
    const w = 0.34, h = 0.26, frame = col.clone();
    box(lit, c0, [w, h, 0.014], '#fffdf4', SK);
    box(lit, [0, h / 2 - 0.01, 0.0082], [w, 0.02, 0.002], frame, SK); box(lit, [0, -h / 2 + 0.01, 0.0082], [w, 0.02, 0.002], frame, SK);
    box(lit, [w / 2 - 0.01, 0, 0.0082], [0.02, h, 0.002], frame, SK); box(lit, [-w / 2 + 0.01, 0, 0.0082], [0.02, h, 0.002], frame, SK);
    box(lit, [0, -h / 2 - 0.05, -0.004], [0.026, 0.1, 0.02], '#6b4a2a', SK);        // grip
    const s = String(o.score === undefined || o.score === null ? '' : o.score).slice(0, 2), h2 = 0.15, gap = h2 * 0.65, x0 = -gap * (s.length - 1) / 2;
    const dc = shade(frame, 0.8).lerp(new THREE.Color('#2b2438'), 0.35);
    s.split('').forEach((ch, i) => digit(lit, ch, x0 + i * gap, 0, h2, dc, 0.0095));
  }
  const g = new THREE.Group(), M = mats_(); g.name = 'prop_' + kind;
  const m1 = new THREE.Mesh(plainGeo(lit), M.lit), m2 = new THREE.Mesh(plainGeo(glow), M.glow); m1.castShadow = true; g.add(m1); if (glow.tris) g.add(m2);
  g.userData.tris = lit.tris + glow.tris; g.userData.kind = kind; return g;
}
let _mats = null; export function setPropMats(m) { _mats = m; } const mats_ = () => _mats;
export function disposeProp(g) { if (!g) return; if (g.parent) g.parent.remove(g); g.traverse((n) => { if (n.geometry) n.geometry.dispose(); }); }

// where the hands hold each prop, in character object space (metres, y up, +z forward). pos = prop centre, rot = prop euler, L/R = wrist targets (left is +x)
export const HOLD = {
  box: { pos: [0, 0.86, 0.37], rot: [0, 0, 0], L: [0.2, 0.82, 0.35], R: [-0.2, 0.82, 0.35], poleL: [1, -0.3, 0.2], poleR: [-1, -0.3, 0.2] },
  card: { pos: [0.0, 1.02, 0.36], rot: [-0.25, 0, 0.06], L: [0.1, 0.9, 0.3], R: [-0.1, 0.9, 0.3], poleL: [0.8, -1, 0], poleR: [-0.8, -1, 0] },
  clipboard: { pos: [0.04, 0.98, 0.31], rot: [-0.3, -0.2, 0.0], L: [0.17, 0.88, 0.28], R: [-0.07, 1.0, 0.34], poleL: [1, -1, -0.2], poleR: [-0.7, -1, 0] },
  scorecard: { pos: [-0.2, 1.0, 0.34], rot: [-0.12, 0.15, 0], L: [0.26, 0.8, 0.1], R: [-0.17, 0.86, 0.33], poleL: [1, -1, -0.3], poleR: [-0.6, -1, -0.1] },
};
