// Procedural art for the mice and rats, the nests and the parallax backdrops.
import { TAU, INK, mix, shade, lineOf, ell, cel, poly, fillPath, star, line, mulberry, hash, outlineCanvas, rimLight, texturize } from './art_util.js';

const B = [-20, -50, 20, 0];
function limb(ctx, x, y, rx, ry, fill, lw = 0.9) { fillPath(ctx, ell(ctx, x, y, rx, ry), fill, lw); }
function rod(ctx, x1, y1, x2, y2, w, color) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = lineOf(color); ctx.lineWidth = w + 1.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// ---------------------------------------------------------------- mice and rats (face left, feet at 0,0)
let curElite = false;
// soft fur shading: light from the upper left, a darker underside, clipped to the shape (no noise)
function furShade(ctx, path, x0, y0, len, diag) {
  ctx.save(); ctx.clip(path);
  const g = ctx.createLinearGradient(x0, y0, x0 + len * (diag ? 0.6 : 0.5), y0 + len * (diag ? 1 : 1.3));
  g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(30,10,50,.2)');
  ctx.fillStyle = g; ctx.fillRect(x0 - 4, y0 - 4, len + 30, len * 1.4 + 10); ctx.restore();
}
function earShade(ctx, x, y, rx, ry, inner) {
  ctx.save(); ctx.clip(ell(ctx, x, y, rx, ry));
  ctx.fillStyle = shade(inner, -0.22); ctx.beginPath(); ctx.ellipse(x + rx * 0.25, y + ry * 0.3, rx * 0.9, ry * 0.9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = shade(inner, 0.35); ctx.beginPath(); ctx.ellipse(x - rx * 0.1, y - ry * 0.1, rx * 0.55, ry * 0.6, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function mouseBody(ctx, o) {
  const fur = o.fur, belly = o.belly || shade(fur, 0.5), inner = o.inner || '#ffb3c8';
  // tail: tapers from a thick root to a fine tip, with a darker underside and faint rings
  ctx.lineCap = 'round';
  // optional shape knobs for the newer mice: bx/by/brx/bry move and size the body, earK scales the ears,
  // cute drops the mean lid, brow, glint, fang and scar (the Pup), noTail and noFeet (the Ghost)
  const bx = o.bx ?? 2, by = o.by ?? -13, brx = o.brx || 11.5, bry = o.bry || 12.5, ek = o.earK || 1;
  const bodyP = () => ell(ctx, bx, by, brx, bry);
  if (!o.noTail) {
  const tb = (u) => { const v = 1 - u; return [v * v * v * 8 + 3 * v * v * u * 26 + 3 * v * u * u * 30 + u * u * u * 38, v * v * v * -9 + 3 * v * v * u * -4 + 3 * v * u * u * -20 + u * u * u * -22]; };
  for (const [col, wk, dy] of [['#d48a9e', 1.35, 0.5], ['#f7bccb', 1, 0]]) {
    for (let k = 0; k < 14; k++) {
      const a = tb(k / 14), b2 = tb((k + 1) / 14);
      ctx.strokeStyle = k < 1 && wk > 1 ? lineOf('#f1a6b8') : col; ctx.lineWidth = (3.8 - 2.6 * k / 14) * wk + (wk > 1 ? 0.6 : 0);
      ctx.beginPath(); ctx.moveTo(a[0], a[1] + dy); ctx.lineTo(b2[0], b2[1] + dy); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(160,80,100,.45)'; ctx.lineWidth = 0.7;
  for (const u of [0.3, 0.5, 0.7]) { const q = tb(u); ctx.beginPath(); ctx.moveTo(q[0] - 0.5, q[1] - 1.6); ctx.lineTo(q[0] + 0.5, q[1] + 1.6); ctx.stroke(); }
  }
  // far ear and body
  fillPath(ctx, ell(ctx, 4, -41, 8 * ek, 8.4 * ek), fur, 1);
  cel(ctx, bodyP(), fur, { box: [bx - brx, by - bry, bx + brx, by + bry] });
  ctx.save(); ctx.clip(bodyP()); ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(bx - 5 * brx / 11.5, by + 3, 7 * brx / 11.5, 9.5 * bry / 12.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  furShade(ctx, bodyP(), bx - brx, by - bry, bry + 0.5, 0);
  ctx.save(); ctx.clip(bodyP()); ctx.strokeStyle = shade(fur, -0.22); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  for (const [x, y] of [[6, -6], [9, -12], [5, -17], [10, -20]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1.5, y + 2, x + 0.5, y + 4); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 1; ctx.stroke(bodyP());
  if (!o.noFeet) { limb(ctx, bx - 6 * brx / 11.5, -1.8, 5, 2.8, fur); limb(ctx, bx + 6 * brx / 11.5, -1.8, 5, 2.8, fur); }
  // head
  fillPath(ctx, ell(ctx, -9, -42, 7.6 * ek, 8 * ek), fur, 1); fillPath(ctx, ell(ctx, -9, -42, 4.5 * ek, 4.9 * ek), inner, 0.5); earShade(ctx, -9, -42, 4.5 * ek, 4.9 * ek, inner);
  fillPath(ctx, ell(ctx, 4, -41, 8 * ek, 8.4 * ek), fur, 1); fillPath(ctx, ell(ctx, 4.5, -41, 5 * ek, 5.4 * ek), inner, 0.5); earShade(ctx, 4.5, -41, 5 * ek, 5.4 * ek, inner);
  const head = new Path2D(); head.ellipse(-5, -31, 13.5, 11.8, 0, 0, TAU);
  cel(ctx, head, fur, { box: [-19, -43, 9, -19] });
  furShade(ctx, head, -19, -43, 24, 1);
  cel(ctx, ell(ctx, -16, -27.5, 7.4, 5.2), shade(fur, 0.22), { shade: false, lw: 0.9 });
  // whiskers: two fine pairs fanning from the muzzle, the far pair shorter and paler
  ctx.lineCap = 'round'; ctx.lineWidth = 0.6;
  for (const [dy, ex, ey, al] of [[-1.2, -32.5, -32.4, 0.85], [0.8, -32, -26.2, 0.8], [-0.2, -28, -34, 0.45], [1.6, -27.5, -22.6, 0.4]]) {
    ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.beginPath(); ctx.moveTo(-20.5, -27.6 + dy); ctx.quadraticCurveTo((-20.5 + ex) / 2, (-27.6 + ey) / 2 - 1.4, ex, ey); ctx.stroke();
    ctx.strokeStyle = `rgba(40,25,60,${al * 0.35})`; ctx.beginPath(); ctx.moveTo(ex + 3.4, ey + (dy > 0 ? 0.8 : -0.4)); ctx.lineTo(ex, ey); ctx.stroke();
  }
  fillPath(ctx, ell(ctx, -22.4, -29.6, 2.5, 2.2), '#ff8fa8', 0.7); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-23, -30.4, 0.7, 0, TAU); ctx.fill();
  // eye: big and shiny, with a mean brow
  const eyeC = o.eye || '#2a1a3a';
  if (o.cute) { ctx.save(); ctx.translate(-8.6, -33); ctx.scale(1.3, 1.3); ctx.translate(8.6, 33); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-8.6, -33, 4.2, 4.8, 0.1, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = eyeC; ctx.beginPath(); ctx.ellipse(-9.4, -32.8, 2.6, 3.7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10.2, -34.4, 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(-7.6, -30.9, 0.55, 0, TAU); ctx.fill();
  if (o.cute) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-8, -35.2, 0.7, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-20.5, -25.4); ctx.quadraticCurveTo(-17.5, -23, -14.5, -25); ctx.stroke();
  } else {
  // threat cue: narrowed upper lid and a red glint in the eye (stronger on elites)
  ctx.save(); ctx.beginPath(); ctx.ellipse(-8.6, -33, 4.2, 4.8, 0.1, 0, TAU); ctx.clip();
  ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(-14, -39); ctx.lineTo(-3, -39); ctx.lineTo(-3, -34.6); ctx.lineTo(-14, -36.8); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-14, -36.8); ctx.lineTo(-3, -34.6); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = curElite ? 'rgba(255,50,50,.95)' : 'rgba(255,60,60,.5)'; ctx.beginPath(); ctx.arc(-8.2, -31.2, curElite ? 1.25 : 0.95, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.9;
  ctx.beginPath(); ctx.moveTo(-14.2, -36.6); ctx.lineTo(-3.2, -40.4); ctx.stroke();
  // grin with a little fang
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-21, -25.6); ctx.quadraticCurveTo(-16, -22.4, -10.6, -25); ctx.stroke();
  fillPath(ctx, poly(ctx, [[-18, -24.6], [-16.6, -24], [-17.4, -21]]), '#fff', 0.5);
  fillPath(ctx, poly(ctx, [[-14, -24], [-12.8, -24.6], [-13.4, -21.4]]), '#fff', 0.5);
  }
  // scar
  if (o.scar !== false && !o.cute) { ctx.strokeStyle = 'rgba(170,60,80,.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-4, -28); ctx.lineTo(1, -33); ctx.moveTo(-5.2, -32); ctx.lineTo(-0.4, -28.6); ctx.stroke(); }
  // front paw
  limb(ctx, -11, -14, 3.6, 3.4, fur);
  ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-12.6, -12.6); ctx.lineTo(-12.2, -11.2); ctx.moveTo(-10.4, -12.2); ctx.lineTo(-10.2, -10.8); ctx.stroke();
}
function dagger(ctx, x = -13, y = -14, len = 15) {
  rod(ctx, x, y, x - len, y - len * 0.55, 2.4, '#dfe6f2');
  rod(ctx, x + 1, y + 0.5, x - 2.5, y - 1.3, 3.4, '#7a4a2a');
}
// props for the Rat Gang newcomers. a: rotation of a kunai (0 points the blade left)
function kunai(ctx, x, y, a, len = 11) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  fillPath(ctx, poly(ctx, [[0, -1.9], [-len, 0], [0, 1.9], [1.4, 0]]), '#d4dcea', 0.8);
  line(ctx, [[-len + 1.5, -0.1], [-0.5, -1]], 'rgba(255,255,255,.95)', 0.7);
  rod(ctx, 1.4, 0, 6.6, 0, 2.3, '#2e2440');
  ctx.strokeStyle = '#d8b860'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(8.6, 0, 1.7, 0, TAU); ctx.stroke();
  ctx.restore();
}
function plus(ctx, x, y, r, col, lw = 0.7) {
  const w = r * 0.4;
  fillPath(ctx, poly(ctx, [[x - w, y - r], [x + w, y - r], [x + w, y - w], [x + r, y - w], [x + r, y + w], [x + w, y + w], [x + w, y + r], [x - w, y + r], [x - w, y + w], [x - r, y + w], [x - r, y - w], [x - w, y - w]]), col, lw);
}
function flake(ctx, x, y, r, col = '#f4fbff') {
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.7, r * 0.24); ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3 + 0.26, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    for (const s of [1, -1]) { const px = x + dx * 0.6 * s, py = y + dy * 0.6 * s, b = r * 0.3, a2 = a + (s > 0 ? 0 : Math.PI);
      ctx.beginPath(); ctx.moveTo(px + Math.cos(a2 + 2.3) * b, py + Math.sin(a2 + 2.3) * b); ctx.lineTo(px, py); ctx.lineTo(px + Math.cos(a2 - 2.3) * b, py + Math.sin(a2 - 2.3) * b); ctx.stroke(); }
  }
}
function coin(ctx, x, y, r) {
  fillPath(ctx, ell(ctx, x, y, r, r), '#ffc92b', 0.9);
  fillPath(ctx, ell(ctx, x, y, r * 0.6, r * 0.6), '#f2a81c', 0.6);
  ctx.fillStyle = 'rgba(255,255,230,.9)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.32, r * 0.18, -0.6, 0, TAU); ctx.fill();
}
// the head and muzzle of mouseBody as one shape (for masks and hoods), and a clip that keeps paint off them
// (for coats, scarves and straps laid over the body after mouseBody has drawn the head)
function faceP() {
  const p = new Path2D(); p.ellipse(-5, -31, 13.5, 11.8, 0, 0, TAU); p.moveTo(-8.6, -27.5); p.ellipse(-16, -27.5, 7.4, 5.2, 0, 0, TAU); return p;
}
function offFace(ctx) {
  for (const [x, y, rx, ry] of [[-5, -31, 13.5, 11.8], [-16, -27.5, 7.4, 5.2]]) {
    const p = new Path2D(); p.rect(-80, -120, 160, 140); p.moveTo(x + rx, y); p.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip(p, 'evenodd');
  }
}
function spike(ctx, cx, cy, a, r0, r1, half, fill) {
  const b1 = [cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0], b2 = [cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0];
  const tip = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
  fillPath(ctx, poly(ctx, [b1, tip, b2]), fill, 0.9);
  const m = [(b1[0] * 0.35 + tip[0] * 0.65), (b1[1] * 0.35 + tip[1] * 0.65)];
  line(ctx, [[(b1[0] + b2[0]) / 2 * 0.5 + b1[0] * 0.5, (b1[1] + b2[1]) / 2 * 0.5 + b1[1] * 0.5], m, tip], 'rgba(255,244,220,.85)', 0.8);
  ctx.fillStyle = '#fff6e4'; ctx.beginPath(); ctx.arc(tip[0] - Math.cos(a) * 1.2, tip[1] - Math.sin(a) * 1.2, 0.7, 0, TAU); ctx.fill();
}

const ENEMY_ART = {
  mouse(ctx) { ctx.save(); ctx.scale(1.2, 1.2); mouseBody(ctx, { fur: '#b9b3cc' }); dagger(ctx); ctx.restore(); },
  scout(ctx) {
    mouseBody(ctx, { fur: '#d8cf9a', inner: '#ffc4b0' });
    ctx.fillStyle = '#e04a4a'; ctx.beginPath(); ctx.moveTo(-17, -38); ctx.quadraticCurveTo(-6, -46, 6, -36); ctx.lineTo(6, -33); ctx.quadraticCurveTo(-6, -42, -17, -34); ctx.fill();
    fillPath(ctx, poly(ctx, [[6, -37], [16, -42], [12, -36], [18, -33], [6, -33]]), '#e04a4a', 0.7);
    for (const y of [-20, -12]) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(30, y); ctx.stroke(); }
    dagger(ctx, -13, -14, 12);
  },
  slinger(ctx) {
    mouseBody(ctx, { fur: '#a9c2a4', inner: '#ffc4b0' });
    fillPath(ctx, new Path2D('M-16 -40 Q-6 -52 6 -40 Q-6 -43 -16 -40 Z'), '#6a8a4a', 1);
    fillPath(ctx, new Path2D('M6 -20 L16 -22 L18 -8 L8 -6 Z'), '#8a6a3a', 0.9);
    rod(ctx, -14, -14, -22, -24, 2.2, '#7a4a2a'); rod(ctx, -22, -24, -28, -30, 2.2, '#7a4a2a'); rod(ctx, -22, -24, -18, -31, 2.2, '#7a4a2a');
    ctx.strokeStyle = '#d4a050'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-28, -30); ctx.lineTo(-24, -26); ctx.lineTo(-18, -31); ctx.stroke();
    fillPath(ctx, ell(ctx, -24, -26.5, 2.2, 2.2), '#8a8a96', 0.6);
  },
  brute(ctx) {
    ctx.save(); ctx.scale(1.85, 1.85);
    mouseBody(ctx, { fur: '#6a6277', belly: '#a69eb8', inner: '#c98aa4', eye: '#d42a3a' });
    fillPath(ctx, new Path2D('M-4 -23 L10 -25 L12 -9 L-2 -6 Z'), '#4a3a30', 0.8);
    for (const [x, y] of [[0, -20], [4, -14], [8, -20], [6, -10]]) { ctx.fillStyle = '#c9c9d4'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
    for (const x of [-16, -11, -6]) fillPath(ctx, poly(ctx, [[x, -22.4], [x + 1.6, -26], [x + 3.2, -22.4]]), '#c9c9d4', 0.5);
    ctx.fillStyle = '#10101a'; ctx.beginPath(); ctx.moveTo(1.4, -45.5); ctx.lineTo(4, -43.5); ctx.lineTo(1.2, -41.8); ctx.fill();
    for (const [x, y] of [[-14, -30], [-9, -31.5], [-4, -30]]) { ctx.fillStyle = '#c9c9d4'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill(); }
    rod(ctx, -11, -14, -26, -30, 3.6, '#8a5a34'); fillPath(ctx, ell(ctx, -26.5, -30.5, 4.6, 4.6), '#8a5a34', 0.8);
    ctx.fillStyle = 'rgba(255,230,190,.35)'; ctx.beginPath(); ctx.ellipse(-27.6, -31.8, 1.8, 1.1, -0.6, 0, TAU); ctx.fill();
    for (const [x, y] of [[-28, -33], [-24, -34], [-29, -28]]) { ctx.fillStyle = '#d8d8e4'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x, y - 0.8); ctx.fill(); }
    ctx.restore();
  },
  armored(ctx) {
    ctx.save(); ctx.scale(1.12, 1.12);
    mouseBody(ctx, { fur: '#b5b0c0' });
    fillPath(ctx, new Path2D('M-19 -37 Q-5 -56 9 -37 Z'), '#aab4c4', 1.1);
    line(ctx, [[-17, -41], [-6, -50]], 'rgba(255,255,255,.65)', 1.1);
    line(ctx, [[-19, -37], [9, -37]], '#6c7688', 1.4);
    for (const x of [-12, -5, 2]) { ctx.fillStyle = '#6c7688'; ctx.beginPath(); ctx.arc(x, -42, 0.9, 0, TAU); ctx.fill(); }
    fillPath(ctx, ell(ctx, -15, -14, 7, 8.4), '#8a9ab0', 1.1); fillPath(ctx, ell(ctx, -15, -14, 3.4, 4.2), '#c4cfe0', 0.6);
    for (const [x, y] of [[-15, -20.5], [-15, -7.5], [-21, -14], [-9, -14]]) { ctx.fillStyle = '#eef3fa'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill(); }
    line(ctx, [[-19, -19], [-16, -21]], 'rgba(255,255,255,.7)', 1);
    dagger(ctx, -16, -16, 11);
    ctx.restore();
  },
  glider(ctx) {
    mouseBody(ctx, { fur: '#c7b9a5', inner: '#ffc4b0' });
    fillPath(ctx, new Path2D('M-34 -48 L8 -62 L38 -44 L2 -52 Z'), '#fffdf4', 1.1);
    fillPath(ctx, new Path2D('M2 -52 L8 -62 L38 -44 Z'), '#e8e2d0', 0.8);
    line(ctx, [[-34, -48], [2, -52]], 'rgba(120,100,70,.6)', 0.7);
    rod(ctx, -6, -48, -10, -38, 1.4, '#7a4a2a'); rod(ctx, 8, -50, 6, -38, 1.4, '#7a4a2a');
    dagger(ctx, -13, -14, 10);
  },
  bomber(ctx) {
    mouseBody(ctx, { fur: '#9aa0b8', eye: '#ff3a3a' });
    fillPath(ctx, ell(ctx, 12, -19, 11, 11), '#26242f', 1.1); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(8, -23, 3.4, 2, -0.6, 0, TAU); ctx.fill();
    line(ctx, [[13, -30], [16, -37], [21, -38]], '#caa86a', 1.4);
    ctx.fillStyle = '#ffcc33'; ctx.fill(star(22, -38.5, 4.4, 1.5, 6)); ctx.fillStyle = '#ff6a2b'; ctx.fill(star(22, -38.5, 2.6, 1, 6));
    line(ctx, [[-4, -6], [14, -14]], '#d44a4a', 2.2);
  },
  shaman(ctx) {
    ctx.save(); ctx.scale(1.18, 1.18);
    mouseBody(ctx, { fur: '#8a7ab0', inner: '#d9a6d0', eye: '#9bff6b' });
    fillPath(ctx, new Path2D('M-17 -37 Q-6 -58 8 -36 Q16 -20 14 -2 L-12 -2 L-8 -14 Q-20 -24 -17 -37 Z'), 'rgba(80,50,130,.92)', 1.1);
    ctx.fillStyle = 'rgba(155,255,107,.9)'; ctx.beginPath(); ctx.arc(-9, -32, 2.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9.8, -33, 0.9, 0, TAU); ctx.fill();
    rod(ctx, -13, -2, -15, -44, 2.2, '#6a4a2a'); fillPath(ctx, ell(ctx, -15.4, -48, 4.6, 4.6), '#7fdc5a', 1); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-16.6, -49.4, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(155,255,107,.3)'; ctx.beginPath(); ctx.arc(-15.4, -48, 7.2, 0, TAU); ctx.fill();
    for (const [x, y] of [[-9, -2], [-4, -8], [2, -4]]) { ctx.fillStyle = '#d7ffb0'; ctx.fill(star(x, y, 1.6, 0.6, 4)); }
    ctx.restore();
  },  dasher(ctx) {
    // lean and fast: speed streaks behind it, a flying red bandana
    ctx.save(); ctx.scale(0.95, 0.95); ctx.rotate(-0.07);
    for (const [y, l] of [[-30, 22], [-22, 30], [-14, 18]]) line(ctx, [[22, y], [22 + l, y + 1]], 'rgba(255,255,255,.55)', 1.6);
    mouseBody(ctx, { fur: '#c9a98a', inner: '#ffc4b0', eye: '#ff4a4a' });
    fillPath(ctx, poly(ctx, [[-17, -42], [4, -45], [3, -39], [-16, -37]]), '#e8404a', 1);
    fillPath(ctx, poly(ctx, [[3, -43], [20, -50], [14, -44], [22, -41], [4, -40]]), '#e8404a', 0.9);
    dagger(ctx, -14, -15, 12);
    ctx.restore();
  },
  shield(ctx) {
    // a big round shield held in front: it soaks up burns, slows and poison until it breaks
    ctx.save(); ctx.scale(1.08, 1.08);
    mouseBody(ctx, { fur: '#aeb4c8', inner: '#ffc4cc' });
    fillPath(ctx, new Path2D('M-17 -38 Q-5 -50 8 -38 Z'), '#7a8aa8', 1.1);
    fillPath(ctx, ell(ctx, -21, -17, 14, 17), '#4a7ad8', 1.5);
    fillPath(ctx, ell(ctx, -21, -17, 10.5, 13.5), '#5c90ee', 0.9);
    ctx.strokeStyle = '#d8e4ff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(-21, -17, 14, 17, 0, 0, TAU); ctx.stroke();
    fillPath(ctx, star(-21, -17, 6, 2.6, 4), '#ffd23f', 0.8);
    for (const [x, y] of [[-21, -31], [-21, -3], [-33, -17], [-9, -17]]) { ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  digger(ctx) {
    // hard hat with a lamp, goggles and a pickaxe, dusty from tunnelling
    ctx.save(); ctx.scale(1.08, 1.08);
    mouseBody(ctx, { fur: '#9a8068', inner: '#e0b090' });
    fillPath(ctx, new Path2D('M-18 -37 Q-5 -54 9 -37 Z'), '#ffcf3a', 1.1);
    line(ctx, [[-18, -37], [9, -37]], '#c8901a', 1.6);
    fillPath(ctx, ell(ctx, -15, -41, 3.4, 3), '#fff6b0', 0.9);
    ctx.fillStyle = 'rgba(255,255,200,.35)'; ctx.beginPath(); ctx.moveTo(-17, -41); ctx.lineTo(-34, -48); ctx.lineTo(-34, -33); ctx.fill();
    fillPath(ctx, ell(ctx, -8.5, -33, 5.6, 5.2), 'rgba(160,230,255,.55)', 1.2);
    rod(ctx, -4, -4, 12, -40, 2.4, '#7a4a2a');
    fillPath(ctx, new Path2D('M8 -43 Q14 -50 22 -44 L19 -41 Q14 -45 10 -40 Z'), '#aab4c4', 1);
    for (const [x, y] of [[8, -4], [16, -2], [-26, -2]]) { ctx.fillStyle = 'rgba(140,100,60,.8)'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  ninja(ctx) {
    // crouched, in an indigo hood and mask with only the white eyes showing, red scarf tails streaming behind, a kunai in each paw
    ctx.save(); ctx.scale(0.98, 0.9); ctx.rotate(-0.08);
    fillPath(ctx, new Path2D('M2 -25 Q14 -33 24 -29 Q31 -26 41 -33 Q38 -22 28 -20 Q17 -18 4 -19 Z'), '#ee3a44', 0.9);
    fillPath(ctx, new Path2D('M3 -21 Q13 -19 21 -14 Q28 -10 36 -14 Q33 -5 23 -7 Q14 -9 3 -16 Z'), '#b8222e', 0.9);
    mouseBody(ctx, { fur: '#3c3668', belly: '#4c4680', inner: '#8a6a9a', eye: '#14102a', scar: false });
    ctx.save(); ctx.clip(faceP());
    ctx.fillStyle = '#1c1834'; ctx.fillRect(-30, -29.4, 44, 16); ctx.fillRect(-30, -50, 44, 9.6);
    ctx.fillStyle = 'rgba(150,140,220,.35)'; ctx.fillRect(-30, -29.4, 44, 1); ctx.fillRect(-30, -41.4, 44, 0.9);
    ctx.restore();
    fillPath(ctx, poly(ctx, [[7, -42], [16, -47], [14, -41], [19, -37], [8, -38.5]]), '#1c1834', 0.8);
    ctx.save(); offFace(ctx);
    fillPath(ctx, new Path2D('M-16 -23 Q-3 -17 10 -23 L10 -17.5 Q-3 -12 -16 -18 Z'), '#ee3a44', 0.9);
    ctx.restore();
    ctx.save(); ctx.clip(ell(ctx, 2, -13, 11.5, 12.5)); ctx.fillStyle = '#ee3a44'; ctx.fillRect(-12, -9.6, 30, 2.6); ctx.restore();
    kunai(ctx, -9, -10, -0.5, 10);
    limb(ctx, -10.5, -10.5, 3, 2.8, '#3c3668');
    kunai(ctx, -12, -15, 0.55, 12);
    limb(ctx, -11, -14.5, 3.4, 3.2, '#3c3668');
    ctx.restore();
  },
  litter(ctx) {
    // a big round mother: polka dot kerchief, apron, rolling pin, and three pups peeking out of the basket on her back
    ctx.save(); ctx.scale(1.38, 1.38);
    const fur = '#c9a49c';
    mouseBody(ctx, { fur, belly: '#ecd6cc', inner: '#ffb0c0', bx: 3, by: -13.6, brx: 15, bry: 13.6, scar: false });
    ctx.save(); ctx.clip(ell(ctx, 3, -13.6, 15, 13.6)); offFace(ctx);
    const ap = new Path2D('M-12 -22 Q-4 -24 4 -21 L6 -3 Q-3 0 -13 -3 Z');
    fillPath(ctx, ap, '#fff6f2', 0.9);
    ctx.fillStyle = '#ff8fb0'; for (let x = -12; x < 6; x += 3.2) { ctx.beginPath(); ctx.arc(x + 1.6, -3, 1.6, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = '#ff6a94'; ctx.beginPath(); ctx.moveTo(-3.5, -9); ctx.bezierCurveTo(-7.5, -12, -6, -15.5, -3.5, -13); ctx.bezierCurveTo(-1, -15.5, 0.5, -12, -3.5, -9); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.clip(faceP()); ctx.fillStyle = '#e0485a'; ctx.fillRect(-22, -50, 34, 12.4);
    ctx.fillStyle = '#fff'; for (const [x, y] of [[-14, -40.5], [-8, -41], [-2, -40.5], [4, -40], [-11, -43], [-5, -43.5], [1, -43]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
    ctx.restore();
    fillPath(ctx, poly(ctx, [[7, -39], [13, -42], [11, -37], [14, -33], [7.5, -36]]), '#e0485a', 0.8);
    // basket: inside rim, the pups, then the front of the basket over them
    fillPath(ctx, ell(ctx, 22, -34, 10.5, 2.6), '#6a4420', 0.8);
    for (const [x, y, c] of [[15.5, -36.4, '#dccbe0'], [22, -38.4, '#c9b39a'], [28.5, -36.4, '#ece2d2']]) {
      for (const s of [-1, 1]) { fillPath(ctx, ell(ctx, x + s * 2.6, y - 3, 1.9, 2.1), c, 0.6); ctx.fillStyle = '#ffb8cc'; ctx.beginPath(); ctx.arc(x + s * 2.6, y - 3, 1, 0, TAU); ctx.fill(); }
      fillPath(ctx, ell(ctx, x, y, 3.7, 3.3), c, 0.7);
      ctx.fillStyle = INK; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 1.3, y - 0.4, 0.75, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ff8fa8'; ctx.beginPath(); ctx.arc(x, y + 1, 0.7, 0, TAU); ctx.fill();
    }
    const bk = new Path2D('M11 -34.5 L33 -34.5 L30 -16 Q22 -13 14 -16 Z');
    cel(ctx, bk, '#cf9850', { box: [11, -35, 33, -14] });
    ctx.save(); ctx.clip(bk); ctx.strokeStyle = '#9a6a2a'; ctx.lineWidth = 0.8;
    for (const y of [-29, -24, -19]) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(34, y); ctx.stroke(); }
    for (let x = 13; x < 33; x += 3.4) for (const [y, o] of [[-31.5, 0], [-26.5, 1.7], [-21.5, 0], [-16.5, 1.7]]) { ctx.beginPath(); ctx.moveTo(x + o, y - 1.6); ctx.lineTo(x + o, y + 1.6); ctx.stroke(); }
    ctx.restore();
    fillPath(ctx, new Path2D('M10.5 -35.6 L33.5 -35.6 L33 -33 L11 -33 Z'), '#a8742e', 0.8);
    ctx.save(); offFace(ctx); rod(ctx, 12, -32, -7, -19, 1.6, '#8a5a2a'); ctx.restore();
    rod(ctx, -6, -10, -26, -22.5, 4.2, '#e6b87e');
    rod(ctx, -26, -22.5, -29.5, -24.6, 1.8, '#b07a40'); rod(ctx, -6, -10, -2.5, -8, 1.8, '#b07a40');
    line(ctx, [[-9, -13.4], [-23, -21.8]], 'rgba(255,255,240,.7)', 0.8);
    limb(ctx, -11, -14, 3.6, 3.4, fur);
    ctx.restore();
  },
  pup(ctx) {
    // a tiny baby mouse: big head, big ears, big shiny eyes, a pacifier and a little blue bandana
    ctx.save(); ctx.scale(0.66, 0.66);
    mouseBody(ctx, { fur: '#ead8c6', belly: '#fff4ea', inner: '#ffb4c8', cute: true, earK: 1.28, bx: 1, by: -9.6, brx: 9, bry: 9.6 });
    ctx.save(); offFace(ctx);
    fillPath(ctx, new Path2D('M-12 -20.5 Q-3 -16 7 -20.5 L6 -16 Q0 -13 -3 -8 Q-8 -12.5 -12 -16.5 Z'), '#4aa8f4', 0.9);
    ctx.fillStyle = '#fff'; for (const [x, y] of [[-8, -17], [-3, -15.5], [2, -17], [-3.5, -11.5]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
    ctx.restore();
    fillPath(ctx, ell(ctx, -21.6, -24.6, 2, 3.8), '#ff9ac4', 0.8);
    ctx.strokeStyle = lineOf('#ffd23f'); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(-25.2, -24.6, 2.4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.stroke();
    fillPath(ctx, ell(ctx, -22.6, -24.6, 1.2, 1.2), '#ffd23f', 0.6);
    ctx.fillStyle = 'rgba(255,120,150,.45)'; ctx.beginPath(); ctx.ellipse(-12, -26, 3, 1.8, 0, 0, TAU); ctx.fill();
    ctx.restore();
  },
  medic(ctx) {
    // white coat, nurse cap with a red cross, a syringe of green tonic, and healing plus signs floating around
    ctx.save(); ctx.scale(1.1, 1.1);
    for (const [x, y, r] of [[-25, -47, 3.4], [15, -54, 2.8], [25, -38, 3.2], [-29, -10, 2.4]]) {
      plus(ctx, x, y, r, '#5ee07a');
    }
    const fur = '#c8bca8';
    mouseBody(ctx, { fur, inner: '#ffc0c8', scar: false });
    ctx.save(); offFace(ctx);
    const coat = new Path2D('M-11 -23 Q2 -28 13 -22 Q17 -12 16 -2.6 L-12 -2.6 Q-14 -14 -11 -23 Z');
    cel(ctx, coat, '#f6f8fc', { box: [-12, -27, 16, -3] });
    line(ctx, [[-9, -22], [-3, -13], [3, -24]], '#b8c2d2', 1.1);
    line(ctx, [[-3, -13], [-3, -3]], '#c8d0dc', 0.8);
    ctx.restore();
    plus(ctx, 7.5, -14, 3.4, '#e8343f');
    rod(ctx, 10.5, -21, 11, -17, 1.2, '#4a7ad8');
    const cap = new Path2D('M-14 -40 L-12 -49 L4 -50 L6 -41 Q-4 -38 -14 -40 Z');
    cel(ctx, cap, '#ffffff', { box: [-14, -50, 6, -39] });
    plus(ctx, -4, -44.6, 3, '#e8343f');
    ctx.save(); ctx.translate(-12, -16); ctx.rotate(0.45);
    fillPath(ctx, poly(ctx, [[-14, -2.2], [0, -2.2], [0, 2.2], [-14, 2.2]]), '#eaf6ff', 0.9);
    ctx.fillStyle = '#5ee07a'; ctx.fillRect(-13, -1.4, 9, 2.8);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(-12, -1.2, 7, 0.7);
    rod(ctx, 0, 0, 4.5, 0, 1.4, '#c8d0dc'); fillPath(ctx, poly(ctx, [[4.5, -2.6], [5.8, -2.6], [5.8, 2.6], [4.5, 2.6]]), '#c8d0dc', 0.7);
    line(ctx, [[-14, 0], [-20, 0]], '#e8eef8', 0.9);
    ctx.restore();
    limb(ctx, -11, -14, 3.6, 3.4, fur);
    ctx.restore();
  },
  thief(ctx) {
    // leaning in, a striped shirt and a black eye mask, a fat sack of stolen coins over the shoulder, and a sly smirk
    ctx.save(); ctx.rotate(-0.12);
    const fur = '#aaa4b6';
    mouseBody(ctx, { fur, inner: '#ffb8c4' });
    ctx.save(); ctx.clip(ell(ctx, 2, -13, 11.5, 12.5)); offFace(ctx);
    ctx.fillStyle = '#f4f2f8'; ctx.fillRect(-12, -27, 30, 23.4);
    ctx.fillStyle = '#2a2638'; for (let y = -24; y < -4; y += 4.4) ctx.fillRect(-12, y, 30, 2.2);
    ctx.restore();
    ctx.save(); ctx.clip(faceP());
    const m = new Path2D(); m.rect(-30, -38.6, 44, 8.6); m.moveTo(-3.6, -33); m.ellipse(-8.6, -33, 5, 5.6, 0.1, 0, TAU);
    ctx.fillStyle = '#1a1626'; ctx.fill(m, 'evenodd');
    ctx.restore();
    fillPath(ctx, poly(ctx, [[7, -36], [15, -40], [13, -35], [17, -31], [8, -33]]), '#1a1626', 0.8);
    fillPath(ctx, ell(ctx, -22.4, -29.6, 2.5, 2.2), '#ff8fa8', 0.7);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12.6, -25.2); ctx.quadraticCurveTo(-10.6, -25.6, -9.6, -28); ctx.stroke();
    const sk = new Path2D('M15 -42 Q5 -33 9 -20 Q15 -9 27 -11 Q38 -15 36 -28 Q34 -39 23 -43 Z');
    cel(ctx, sk, '#c69c62', { box: [6, -44, 37, -10] });
    fillPath(ctx, poly(ctx, [[22, -26], [29, -27], [30, -20], [23, -19]]), '#a47844', 0.8);
    ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 0.6; ctx.setLineDash([1.2, 1.2]); ctx.stroke(poly(ctx, [[23, -25.2], [28.2, -26], [29, -21], [23.8, -20]])); ctx.setLineDash([]);
    fillPath(ctx, ell(ctx, 18, -43, 6.4, 2.8), '#4a3020', 0.9);
    coin(ctx, 15.6, -45, 2.8); coin(ctx, 20.6, -46, 2.6);
    rod(ctx, 12, -40.5, 24, -40.5, 1.6, '#8a6a3a');
    limb(ctx, 10, -38, 3.2, 3, fur);
    ctx.restore();
  },
  spiky(ctx) {
    // a rat with a back full of sharp quills: a fan behind the body, a shorter row over the back, angry brows
    ctx.save(); ctx.scale(1.15, 1.15);
    for (let k = 0; k < 9; k++) spike(ctx, 4, -18, -1.72 + k * 0.235, 9, 25 + (k % 2) * 4 - Math.abs(k - 4) * 0.6, 0.19, '#4e3e34');
    const fur = '#8a7262';
    mouseBody(ctx, { fur, belly: '#c8b09a', inner: '#e0a090', eye: '#ff4a2a' });
    for (let k = 0; k < 5; k++) spike(ctx, 4, -13, -1.05 + k * 0.32, 5, 15.5 - Math.abs(k - 2) * 0.5, 0.2, '#6a5444');
    ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(-15.4, -36.4); ctx.lineTo(-3, -41.6); ctx.stroke();
    fillPath(ctx, poly(ctx, [[-16, -25], [-14.6, -24.4], [-15.4, -21.4]]), '#fff', 0.5);
    ctx.restore();
  },
  frosty(ctx) {
    // icy blue fur with an ice crest and frost crystals, a striped scarf, an icicle dagger, frozen breath and drifting snowflakes
    ctx.save(); ctx.scale(1.15, 1.15);
    for (const [x, y, r] of [[-27, -46, 3.6], [18, -50, 3.2], [28, -32, 2.8], [-31, -9, 2.6]]) { flake(ctx, x, y, r + 0.6, 'rgba(60,110,190,.55)'); flake(ctx, x, y, r); }
    const fur = '#a8d0f0';
    for (const [x, b, h, w] of [[-6.5, -41, 9, 2.6], [-1.5, -42.4, 12, 3.2], [3, -41.6, 8, 2.4]]) {
      fillPath(ctx, poly(ctx, [[x - w, b], [x, b - h], [x + w, b]]), '#e8f8ff', 0.9, '#5a9ad0');
      line(ctx, [[x - w * 0.4, b - 1], [x - 0.2, b - h + 1.5]], 'rgba(255,255,255,.95)', 0.7);
    }
    mouseBody(ctx, { fur, belly: '#eef8ff', inner: '#c4e2ff', eye: '#1a4a8a', scar: false });
    for (const [x, y, r] of [[8, -15, 1.9], [0, -7, 1.5], [2, -38, 1.6], [12, -8, 1.3]]) flake(ctx, x, y, r, '#ffffff');
    ctx.save(); offFace(ctx);
    const sc = new Path2D('M-15 -23 Q-2 -17 10 -23 L10 -17.6 Q-2 -12 -15 -18 Z'), tl = new Path2D('M5 -20 L12 -19 L15 -6 L9 -6 Z');
    for (const p of [tl, sc]) {
      fillPath(ctx, p, '#3a5ab8', 0.9);
      ctx.save(); ctx.clip(p); ctx.fillStyle = '#f4f8ff'; for (let x = -16; x < 18; x += 5) ctx.fillRect(x, -26, 2, 24); ctx.restore();
    }
    ctx.restore();
    for (const [x, y, rx, ry, c] of [[-30, -27, 4, 3, '#f4fbff'], [-36.5, -25, 3, 2.3, '#e2f2ff'], [-41.5, -23.6, 2, 1.6, '#d0e8fc']]) fillPath(ctx, ell(ctx, x, y, rx, ry), c, 0.6);
    fillPath(ctx, poly(ctx, [[-9, -12], [-14, -17], [-28, -25.5], [-13, -13]]), '#d8f2ff', 0.9, '#4a8ac8');
    line(ctx, [[-14, -16], [-26, -24.6]], 'rgba(255,255,255,.95)', 0.7);
    limb(ctx, -11, -14, 3.6, 3.4, fur);
    ctx.restore();
  },
  rocket(ctx) {
    // goggles up on the forehead, a launcher tube on the shoulder with a rocket in the muzzle, a jet pack spitting flames
    ctx.save(); ctx.scale(1.1, 1.1);
    ctx.save(); ctx.translate(0, -40); ctx.rotate(0.07);
    for (const [x, y, r, a] of [[35, -1, 3.4, 0.6], [40, -5.5, 2.8, 0.45], [44, -10.5, 2.2, 0.3]]) { ctx.fillStyle = `rgba(200,200,210,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    fillPath(ctx, poly(ctx, [[24, -5], [31, -7.6], [31, 7.6], [24, 5]]), '#4c5632', 1);
    fillPath(ctx, ell(ctx, 31, 0, 1.8, 7.4), '#1e2016', 0.6);
    ctx.fillStyle = 'rgba(255,150,60,.6)'; ctx.beginPath(); ctx.ellipse(31, 0, 0.9, 4.6, 0, 0, TAU); ctx.fill();
    cel(ctx, poly(ctx, [[-30, -5], [24, -5], [24, 5], [-30, 5]]), '#6c7a3e', { box: [-30, -5, 24, 5] });
    for (const x of [-24, 15]) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, -5, 3.2, 10); }
    fillPath(ctx, poly(ctx, [[-31, -6.2], [-27, -6.2], [-27, 6.2], [-31, 6.2]]), '#4c5632', 0.9);
    fillPath(ctx, poly(ctx, [[-31, -3.8], [-39, 0], [-31, 3.8]]), '#e8343f', 0.9);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-32, -2.4); ctx.lineTo(-37, -0.3); ctx.lineTo(-32, -1); ctx.fill();
    fillPath(ctx, poly(ctx, [[-10, -5], [-9, -9], [-3, -9], [-2, -5]]), '#4c5632', 0.8);
    ctx.restore();
    const fur = '#b4a492';
    mouseBody(ctx, { fur, inner: '#ffc0a8' });
    for (const [x, y] of [[12, -5], [18.5, -5.5]]) {
      fillPath(ctx, new Path2D(`M${x - 2.6} ${y} Q${x + 1} ${y + 7} ${x + 10} ${y + 6.5} Q${x + 4} ${y + 2.5} ${x + 2.6} ${y} Z`), '#ff8a2b', 0.8);
      fillPath(ctx, new Path2D(`M${x - 1.2} ${y} Q${x + 1.2} ${y + 4.4} ${x + 6} ${y + 4.4} Q${x + 2.5} ${y + 1.6} ${x + 1.4} ${y} Z`), '#ffe14a', 0.5);
    }
    const pk = new Path2D('M8 -30 Q21 -32 22 -26 L22 -11 Q21 -8 16 -8 L8 -8 Z');
    cel(ctx, pk, '#8c92a2', { box: [8, -32, 22, -8] });
    ctx.fillStyle = '#e8343f'; ctx.fillRect(9, -22, 12.6, 2.4);
    for (const x of [10, 16.5]) fillPath(ctx, poly(ctx, [[x, -8], [x + 4, -8], [x + 5, -4.6], [x - 1, -4.6]]), '#585e6c', 0.8);
    ctx.save(); offFace(ctx); rod(ctx, 9, -27, -7, -19, 1.6, '#5a4a3a'); ctx.restore();
    ctx.save(); ctx.clip(faceP()); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-22, -42.6, 34, 2.4); ctx.restore();
    for (const x of [-12.5, -5]) { fillPath(ctx, ell(ctx, x, -42, 3.3, 3.1), '#d0a840', 0.9); fillPath(ctx, ell(ctx, x, -42, 2.1, 1.9), '#8ae0ff', 0.6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 0.8, -42.7, 0.7, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  ghost(ctx) {
    // a pale mouse with a wavy wisp for a tail and no feet; ENEMY_POST makes it see-through and adds the glow
    ctx.save(); ctx.scale(1.1, 1.1); ctx.translate(0, -4);
    const w = new Path2D('M-9 -10 Q-10 0 -2 3 Q5 5 9 1 Q13 -2 17 2 Q21 6 27 3 Q33 0 36 4 Q35 -4 29 -5 Q23 -6 20 -9 Q16 -13 10 -12 Q6 -12 4 -18 Z');
    cel(ctx, w, '#dfe8ff', { box: [-10, -18, 36, 5] });
    ctx.save(); ctx.clip(w); ctx.strokeStyle = 'rgba(150,170,230,.5)'; ctx.lineWidth = 0.8;
    for (const [x1, y1, x2, y2] of [[0, -4, 14, -2], [10, -8, 26, 0]]) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, y1 + 4, x2, y2); ctx.stroke(); }
    ctx.restore();
    mouseBody(ctx, { fur: '#e2eaff', belly: '#ffffff', inner: '#c4ceff', eye: '#1aa8e0', scar: false, noTail: true, noFeet: true });
    ctx.restore();
  },
};

// passes laid on the finished sprite after the dark outline (in feet coordinates), for what an outline would spoil:
// soft glows go behind the sprite, and the Ghost is made see-through with glowing eyes on top
function glowDisc(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
const ENEMY_POST = {
  medic(ctx) {
    ctx.scale(1.1, 1.1); ctx.globalCompositeOperation = 'destination-over';
    for (const [x, y, r] of [[-25, -47, 3.4], [15, -54, 2.8], [25, -38, 3.2], [-29, -10, 2.4]]) glowDisc(ctx, x, y, r * 2.6, '120,255,140', 0.55);
  },
  frosty(ctx) {
    ctx.scale(1.15, 1.15); ctx.globalCompositeOperation = 'destination-over';
    glowDisc(ctx, 0, -26, 38, '170,225,255', 0.5);
  },
  ghost(ctx) {
    ctx.scale(1.1, 1.1); ctx.translate(0, -4);
    ctx.globalCompositeOperation = 'destination-in';
    const f = ctx.createLinearGradient(8, 0, 38, 0); f.addColorStop(0, 'rgba(0,0,0,.8)'); f.addColorStop(1, 'rgba(0,0,0,.2)');
    ctx.fillStyle = f; ctx.fillRect(-60, -80, 120, 100);
    ctx.globalCompositeOperation = 'source-over';
    glowDisc(ctx, -9, -33, 8, '160,240,255', 0.95);
    ctx.fillStyle = '#e8ffff'; ctx.beginPath(); ctx.ellipse(-9.4, -32.8, 1.4, 2.2, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'destination-over';
    glowDisc(ctx, 4, -24, 40, '130,200,255', 0.55);
  },
};

// elite dressing: a crimson cape behind the body, a gold-trimmed shoulder plate and a jewelled crown
function eliteCape(ctx, sc) {
  ctx.save(); ctx.scale(sc, sc);
  const p = new Path2D('M5 -33 Q24 -36 31 -6 L25 -9 L21 -2 L15 -8 L9 -1 L7 -10 Z');
  fillPath(ctx, p, '#b8283e', 1);
  ctx.save(); ctx.clip(p);
  const g = ctx.createLinearGradient(5, -33, 30, -2); g.addColorStop(0, 'rgba(255,170,170,.28)'); g.addColorStop(1, 'rgba(40,0,20,.4)');
  ctx.fillStyle = g; ctx.fillRect(0, -40, 40, 42);
  ctx.strokeStyle = 'rgba(60,0,20,.55)'; ctx.lineWidth = 0.8;
  for (const [x1, y1, x2, y2] of [[12, -28, 15, -8], [18, -29, 22, -6]]) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + 2, (y1 + y2) / 2, x2, y2); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(31, -6); ctx.lineTo(25, -9); ctx.lineTo(21, -2); ctx.lineTo(15, -8); ctx.stroke();
  ctx.restore();
}
function eliteGear(ctx, sc, type) {
  if (type === 'glider' || type === 'bomber' || type === 'scout' || type === 'slinger') sc = 1;
  ctx.save(); ctx.scale(sc, sc);
  const pl = new Path2D('M-1 -25 Q4 -31 11 -25 Q9 -20 3 -19 Q-1 -20 -1 -25 Z');
  fillPath(ctx, pl, '#e8b830', 1);
  ctx.save(); ctx.clip(pl); ctx.fillStyle = 'rgba(255,255,230,.5)'; ctx.beginPath(); ctx.ellipse(2.5, -26.5, 4.5, 1.6, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(120,60,0,.35)'; ctx.beginPath(); ctx.ellipse(6, -19.5, 6, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  for (const [x, y] of [[1, -24], [9, -24]]) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function eliteCrown(ctx, cx, hy) {
  const p = poly(ctx, [[cx - 9, hy], [cx - 9, hy - 9], [cx - 4.5, hy - 4.5], [cx, hy - 12], [cx + 4.5, hy - 4.5], [cx + 9, hy - 9], [cx + 9, hy]]);
  fillPath(ctx, p, '#ffc92b', 1);
  ctx.save(); ctx.clip(p);
  const g = ctx.createLinearGradient(cx - 9, hy - 12, cx + 9, hy); g.addColorStop(0, 'rgba(255,255,220,.6)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(150,70,0,.4)');
  ctx.fillStyle = g; ctx.fillRect(cx - 10, hy - 13, 20, 14);
  ctx.fillStyle = '#c98a12'; ctx.fillRect(cx - 10, hy - 3.2, 20, 3.2);
  ctx.restore();
  for (const [x, y, c] of [[cx, hy - 1.6, '#ff4a62'], [cx - 5, hy - 1.6, '#5ac8ff'], [cx + 5, hy - 1.6, '#5ac8ff']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 1.15, 0, TAU); ctx.fill(); }
  for (const [x, y] of [[cx - 9, hy - 9], [cx, hy - 12], [cx + 9, hy - 9]]) { ctx.fillStyle = '#fff8d0'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill(); }
}

const spriteCache = new Map();
export function enemySprite(type, elite) {
  const key = type + (elite ? '*' : '');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 2, W = 130, H = 130, ax = 65, ay = 110;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  curElite = !!elite;
  const sc = { brute: 1.85, armored: 1.12, shaman: 1.18, shield: 1.08, digger: 1.08, dasher: 0.95, ninja: 0.94, litter: 1.38, pup: 0.66, medic: 1.1, spiky: 1.15, frosty: 1.15, rocket: 1.1, ghost: 1.1 }[type] || 1;
  const draw = (last) => {
    ctx.save(); ctx.translate(ax, ay);
    if (elite && type !== 'glider') eliteCape(ctx, sc);
    ENEMY_ART[type](ctx);
    if (elite && last) eliteGear(ctx, sc, type);
    ctx.restore();
  };
  if (elite) { ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 10; draw(false); draw(false); ctx.shadowBlur = 0; }
  draw(true);
  if (elite) {
    ctx.save(); ctx.translate(ax, ay);
    const hy = { brute: -78, shaman: -62, armored: -58, ninja: -48, litter: -70, pup: -38, medic: -60, spiky: -58, frosty: -62, rocket: -58, ghost: -58 }[type] || -52;
    eliteCrown(ctx, -2, hy);
    ctx.restore();
  }
  const r = { c: outlineCanvas(rimLight(c, 2, '#fff0c0', 0.4), 2, '#2a1840', 0.85), ax, ay, w: W, h: H };
  if (ENEMY_POST[type]) { const x = r.c.getContext('2d'); x.save(); x.scale(S, S); x.translate(ax, ay); ENEMY_POST[type](x); x.restore(); }
  spriteCache.set(key, r);
  return r;
}

// ---------------------------------------------------------------- nests (drawn at 200x200, anchor bottom centre)
// second pass on the nest body: side shading, masonry, weave, rivets, loot (structured lines only, no noise)
function nestDetail(ctx, kind) {
  const side = (path, x0, x1, dark = 0.26) => {
    ctx.save(); ctx.clip(path);
    const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,255,235,.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(30,10,50,${dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 200); ctx.restore();
  };
  const hl = (pts, a = 0.55, w = 1.6) => line(ctx, pts, `rgba(255,255,240,${a})`, w);
  const rivet = (x, y, c = '#dfe6f2') => { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.7, 1.9, 0, TAU); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x - 0.5, y - 0.6, 0.6, 0, TAU); ctx.fill(); };
  const cheeseBit = (x, y, k = 1) => { fillPath(ctx, poly(ctx, [[x, y], [x + 12 * k, y - 3 * k], [x + 12 * k, y - 8 * k], [x, y - 6 * k]]), '#ffd34a', 0.9); fillPath(ctx, poly(ctx, [[x, y - 6 * k], [x + 12 * k, y - 8 * k], [x + 8 * k, y - 11 * k]]), '#ffe27a', 0.8); ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.arc(x + 5 * k, y - 4 * k, 1.5 * k, 0, TAU); ctx.fill(); };
  if (kind === 'cheese') {
    const face = new Path2D('M22 192 L40 100 L160 100 L178 192 Z');
    side(face, 22, 178, 0.3); side(new Path2D('M40 100 L100 54 L160 100 Z'), 40, 160, 0.2);
    hl([[42, 100], [100, 56]], 0.75, 2); ctx.fillStyle = '#d9992a'; ctx.fillRect(25, 178, 150, 3);
    for (const [x, y, r] of [[56, 120, 8], [140, 130, 10], [118, 108, 6], [60, 160, 9], [150, 168, 7]]) {   // hole depth: lit lower lip, shadowed upper wall
      ctx.strokeStyle = 'rgba(255,245,190,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 0.8, r, r * 0.8, 0, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = 'rgba(120,60,0,.4)'; ctx.beginPath(); ctx.ellipse(x + 1, y - 1, r * 0.75, r * 0.5, 0, 0, TAU); ctx.fill();
    }
    cheeseBit(24, 194); cheeseBit(44, 195, 0.8); cheeseBit(150, 195, 0.9);
  } else if (kind === 'pipe') {
    const body = new Path2D('M12 192 L12 106 Q12 90 30 90 L170 90 Q188 90 188 106 L188 192 Z');
    side(body, 12, 188, 0.34);
    for (const x of [30, 100, 170]) { hl([[x - 4, 92], [x - 4, 190]], 0.3, 1.2); for (const y of [100, 140, 180]) { rivet(x - 8, y); rivet(x + 8, y); } }
    hl([[18, 108], [18, 186]], 0.35, 2.4);
    ctx.fillStyle = 'rgba(180,90,40,.35)'; for (const [x, y, w] of [[40, 150, 14], [120, 120, 18], [150, 170, 12]]) { ctx.beginPath(); ctx.ellipse(x, y, w, 4, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(210,255,200,.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(100, 70, 44, 11, 0, Math.PI, TAU); ctx.stroke();
  } else if (kind === 'castle') {
    const wall = new Path2D('M30 192 L30 100 L170 100 L170 192 Z'), tw = [14, 150].map((x) => new Path2D(`M${x} 192 L${x} 70 L${x + 36} 70 L${x + 36} 192 Z`));
    for (const [pth, x0, x1] of [[wall, 30, 170], [tw[0], 14, 50], [tw[1], 150, 186]]) {
      ctx.save(); ctx.clip(pth); ctx.strokeStyle = 'rgba(40,30,60,.3)'; ctx.lineWidth = 1;
      for (let r = 0, y = 76; y < 192; y += 13, r++) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); for (let x = x0 + (r % 2 ? 9 : 0); x < x1; x += 18) { ctx.moveTo(x, y); ctx.lineTo(x, y + 13); } ctx.stroke(); }
      ctx.restore(); side(pth, x0, x1, 0.32);
    }
    for (const x of [32, 168]) { ctx.fillStyle = 'rgba(255,200,90,.75)'; ctx.fillRect(x - 2, 112, 4, 10); }   // lit windows
    hl([[16, 72], [16, 190]], 0.25, 2);
    ctx.save(); ctx.clip(new Path2D('M10 70 L32 22 L54 70 Z')); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; for (let y = 34; y < 70; y += 7) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(54, y); ctx.stroke(); } ctx.restore();
  } else if (kind === 'trash') {
    for (const [x, y, w, h] of [[20, 140, 60, 52], [90, 150, 50, 42], [130, 120, 56, 72], [50, 100, 50, 40]]) {
      hl([[x + 2, y + 2], [x + w - 2, y + 2]], 0.45, 1.6); ctx.strokeStyle = 'rgba(120,80,30,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.5, y + h * 0.4); ctx.stroke();   // packing tape
      ctx.fillStyle = 'rgba(30,10,40,.2)'; ctx.fillRect(x + w - 6, y + 3, 5, h - 3);
    }
    line(ctx, [[96, 92], [104, 80], [112, 92]], '#e8e8f0', 1.4);   // fish bone
    hl([[84, 62], [92, 90]], 0.4, 1.6);
  } else {
    const dome = new Path2D('M20 192 Q16 100 100 60 Q184 100 180 192 Z');
    side(dome, 20, 180, 0.34);
    ctx.save(); ctx.clip(dome);   // woven straw: staggered arcs in rings
    for (let r = 0, y = 74; y < 196; y += 11, r++) {
      ctx.strokeStyle = r % 2 ? 'rgba(20,10,60,.28)' : 'rgba(255,255,230,.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(10, y + 4); ctx.quadraticCurveTo(100, y - 12, 190, y + 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,10,60,.2)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 14 + (r % 2) * 9; x < 190; x += 18) { const dx = (x - 100) * 0.1; ctx.moveTo(x, y - 4 + Math.abs(x - 100) * 0.045 + 3); ctx.lineTo(x + dx, y + 8 + Math.abs(x - 100) * 0.045); }
      ctx.stroke();
    }
    ctx.restore();
    for (const x of [48, 152]) { rod(ctx, x, 178, x - 4, 150, 2.4, '#8a6a3a'); }   // tied sticks propping the door
    line(ctx, [[60, 74], [40, 96]], 'rgba(255,255,255,.35)', 2);
  }
}

function nestBody(ctx, kind) {
  const door = () => { ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.moveTo(78, 192); ctx.lineTo(78, 160); ctx.quadraticCurveTo(100, 126, 122, 160); ctx.lineTo(122, 192); ctx.fill(); ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 2; ctx.stroke(); };
  const mound = (c) => { fillPath(ctx, new Path2D('M8 196 Q30 150 100 146 Q170 150 192 196 Z'), c, 1.4); };
  if (kind === 'cheese') {
    mound('#8fd36e');
    fillPath(ctx, new Path2D('M22 192 L40 100 L160 100 L178 192 Z'), '#ffd34a', 1.6);
    fillPath(ctx, new Path2D('M40 100 L100 54 L160 100 Z'), '#ffe27a', 1.6);
    for (const [x, y, r] of [[56, 120, 8], [140, 130, 10], [118, 108, 6], [60, 160, 9], [150, 168, 7], [96, 78, 5], [112, 70, 4]]) { ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU); ctx.fill(); }
    door();
    rod(ctx, 100, 54, 100, 20, 2, '#6a4a2a'); fillPath(ctx, new Path2D('M100 20 L128 28 L100 38 Z'), '#e04a4a', 1);
  } else if (kind === 'pipe') {
    mound('#6f8a5f');
    fillPath(ctx, new Path2D('M12 192 L12 106 Q12 90 30 90 L170 90 Q188 90 188 106 L188 192 Z'), '#7a9a86', 1.6);
    for (const x of [30, 100, 170]) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 3, 90, 6, 102); }
    fillPath(ctx, ell(ctx, 100, 70, 46, 12), '#8aa896', 1.4); fillPath(ctx, ell(ctx, 100, 68, 38, 8), '#2a4a3a', 1);
    door();
    ctx.fillStyle = '#9bdc4a'; for (const x of [20, 60, 140, 176]) { ctx.beginPath(); ctx.ellipse(x, 120 + (x % 3) * 8, 4, 12, 0, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(18 + i * 42, 94, 6, 14); }
  } else if (kind === 'castle') {
    mound('#6a7a6a');
    fillPath(ctx, new Path2D('M30 192 L30 100 L170 100 L170 192 Z'), '#9a9aa8', 1.6);
    for (const x of [14, 150]) { fillPath(ctx, new Path2D(`M${x} 192 L${x} 70 L${x + 36} 70 L${x + 36} 192 Z`), '#8a8a9a', 1.6); fillPath(ctx, new Path2D(`M${x - 4} 70 L${x + 18} 22 L${x + 40} 70 Z`), '#7a3a4a', 1.6); }
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#9a9aa8'; ctx.fillRect(40 + i * 28, 90, 16, 12); ctx.strokeStyle = lineOf('#9a9aa8'); ctx.lineWidth = 1; ctx.strokeRect(40 + i * 28, 90, 16, 12); }
    for (const [x, y] of [[32, 110], [168, 110], [32, 140], [168, 140]]) { ctx.fillStyle = '#1b1020'; ctx.fillRect(x - 3, y, 6, 14); }
    door();
    for (const x of [32, 168]) { rod(ctx, x, 24, x, 6, 1.6, '#6a4a2a'); fillPath(ctx, new Path2D(`M${x} 6 L${x + 14} 11 L${x} 16 Z`), '#c0304a', 0.8); }
  } else if (kind === 'trash') {
    mound('#6a6a5a');
    for (const [x, y, w, h, c] of [[20, 140, 60, 52, '#c9a56a'], [90, 150, 50, 42, '#9aa6b8'], [130, 120, 56, 72, '#b58a56'], [50, 100, 50, 40, '#8aa86a']]) {
      fillPath(ctx, new Path2D(`M${x} ${y} h${w} v${h} h${-w} z`), c, 1.4);
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + h * 0.4); ctx.lineTo(x + w, y + h * 0.4); ctx.stroke();
    }
    fillPath(ctx, ell(ctx, 100, 92, 40, 12), '#3a3a44', 1.4); fillPath(ctx, new Path2D('M60 92 L140 92 L120 60 L80 60 Z'), '#8a8a96', 1.4);
    door();
    fillPath(ctx, ell(ctx, 40, 180, 16, 16), '#2a2a32', 1.2); fillPath(ctx, ell(ctx, 40, 180, 7, 7), '#6a6a74', 0.8);
    for (const [x, y] of [[70, 82], [116, 78]]) { ctx.fillStyle = '#e04a4a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  } else {
    mound('#5a5a9a');
    fillPath(ctx, new Path2D('M20 192 Q16 100 100 60 Q184 100 180 192 Z'), '#7a78c0', 1.6);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; for (const [x, y, r] of [[60, 120, 10], [140, 110, 8], [50, 160, 7], [150, 160, 12]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill(); }
    door();
    fillPath(ctx, new Path2D('M100 52 a22 22 0 1 0 14 38 a18 18 0 1 1 -14 -38 Z'), '#ffe9a0', 1.4);
    for (const [x, y, r] of [[30, 60, 5], [170, 70, 4], [150, 30, 3]]) { ctx.fillStyle = '#fff6c0'; ctx.fill(star(x, y, r, r * 0.4, 4)); }
  }
}
export function nestSprite(kind) {
  const key = 'nest_' + kind;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 2, W = 200, H = 200;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  nestBody(ctx, kind); nestDetail(ctx, kind);
  texturize(c, { seed: hash(key), len: 9, lw: 1.4, count: 4500, dir: 0.03, spread: 0.55, alpha: 0.42, amp: 0.12, minLum: 55 });   // brick, wood and cheese grain
  // art spans x 8..192, y 6..196 of the 200 box, so the 1px outline fits; nestOverlay shares these coordinates
  const r = { c: outlineCanvas(c, 2, '#2a1840', 0.85), ax: 100, ay: 192, w: W, h: H };
  spriteCache.set(key, r);
  return r;
}
// the angry glowing eyes in the doorway, blinking, plus cracks as it takes damage (drawn live)
export function nestOverlay(ctx, hpFrac, t, king) {
  const blink = Math.sin(t * 2.2) > 0.94 ? 0.2 : 1;
  ctx.save();   // glow from inside the doorway, flickering and stronger as the nest gets hurt
  ctx.beginPath(); ctx.moveTo(78, 192); ctx.lineTo(78, 160); ctx.quadraticCurveTo(100, 126, 122, 160); ctx.lineTo(122, 192); ctx.clip();
  const fl = 0.55 + 0.12 * Math.sin(t * 5) + (1 - hpFrac) * 0.25, dg = ctx.createRadialGradient(100, 190, 4, 100, 180, 44);
  dg.addColorStop(0, `rgba(255,170,60,${fl})`); dg.addColorStop(0.6, `rgba(220,60,40,${fl * 0.35})`); dg.addColorStop(1, 'rgba(120,20,60,0)');
  ctx.fillStyle = dg; ctx.fillRect(70, 120, 60, 74); ctx.restore();
  ctx.fillStyle = '#ff3a3a';
  for (const x of [91, 109]) { ctx.beginPath(); ctx.ellipse(x, 168, 4.4, 5.4 * blink, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#fff'; for (const x of [90, 108]) { ctx.beginPath(); ctx.arc(x, 166, 1.2, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(85, 158); ctx.lineTo(97, 163); ctx.moveTo(115, 158); ctx.lineTo(103, 163); ctx.stroke();
  if (king) {   // wave 30: this is King Squeakimus's own nest, with his golden crown floating on top
    const by = 10 + Math.sin(t * 2.4) * 2.5;
    ctx.save(); ctx.translate(100, by);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-26, 16); ctx.lineTo(-30, -8); ctx.lineTo(-14, 3); ctx.lineTo(0, -14); ctx.lineTo(14, 3); ctx.lineTo(30, -8); ctx.lineTo(26, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8a020'; ctx.fillRect(-26, 10, 52, 6);
    for (const [x, y, c] of [[-30, -8, '#ff5a7a'], [0, -14, '#6fd3ff'], [30, -8, '#ff5a7a']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  // the caged cat the nest is holding: a little cage by the door, ears and eyes peeking out, swaying and blinking
  {
    const sw = Math.sin(t * 1.7) * 1.2 + Math.sin(t * 14) * (1 - hpFrac) * 2.2,   // the captive panics as the nest is hurt
       ex = 164 + sw, top = 150, bot = 188;
    ctx.save(); ctx.translate(ex, bot); ctx.scale(1.35, 1.35); ctx.translate(-ex, -bot);   // bigger, grown from its base
    ctx.fillStyle = '#3a2a4a'; ctx.beginPath(); ctx.moveTo(ex - 15, top + 18); ctx.lineTo(ex - 11, top + 4); ctx.lineTo(ex - 5, top + 13); ctx.lineTo(ex + 5, top + 13); ctx.lineTo(ex + 11, top + 4); ctx.lineTo(ex + 15, top + 18); ctx.lineTo(ex + 15, bot - 2); ctx.lineTo(ex - 15, bot - 2); ctx.closePath(); ctx.fill();   // the cat silhouette
    ctx.fillStyle = '#ffe9a8'; const lid = Math.sin(t * 1.3 + 1) > 0.93 ? 0.3 : 1;
    for (const x of [ex - 6, ex + 6]) { ctx.beginPath(); ctx.ellipse(x, top + 24, 2.6, 3.2 * lid, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#c9b8a0'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeRect(ex - 17, top + 12, 34, bot - top - 14);
    ctx.lineWidth = 1.6; ctx.beginPath();   // cageBars
    for (let x = -9; x <= 9; x += 6) { ctx.moveTo(ex + x, top + 12); ctx.lineTo(ex + x, bot - 2); }
    ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(ex, top + 8, 5, Math.PI, 0); ctx.moveTo(ex, top + 3); ctx.lineTo(ex, top + 12); ctx.stroke();   // ring on top
    ctx.restore();
  }
  const cracks = hpFrac < 0.75 ? (hpFrac < 0.45 ? (hpFrac < 0.2 ? 3 : 2) : 1) : 0;
  const C = [[[50, 120], [58, 134], [52, 146], [62, 158]], [[150, 110], [142, 126], [150, 140]], [[100, 100], [94, 112], [104, 120], [98, 130]]];
  const BR = [[[58, 134], [68, 136], [72, 144]], [[142, 126], [132, 128], [128, 138]], [[94, 112], [86, 112], [82, 120]]];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < cracks; i++) {
    for (const [col, w, ox, oy] of [['rgba(255,240,200,.35)', 1.2, 1.4, 0.4], ['rgba(30,10,30,.85)', 1.8, 0, 0]]) {   // lit lip, then the dark gap
      ctx.strokeStyle = col; ctx.lineWidth = w;
      for (const pts of [C[i], BR[i]]) { ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(p[0] + ox, p[1] + oy) : ctx.moveTo(p[0] + ox, p[1] + oy))); ctx.stroke(); }
    }
    if (hpFrac < 0.3) { ctx.fillStyle = 'rgba(255,170,60,.55)'; const q = C[i][2]; ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, TAU); ctx.fill(); }   // glow leaking through
  }
}

// ---------------------------------------------------------------- backdrops
// give a backdrop's canvases back right away (waiting for the garbage collector lets phones run out of canvas memory)
export function freeBackdrop(bd) {
  if (!bd) return;
  for (const k of ['sky', 'far', 'mid', 'gr', 'front', 'rays']) if (bd[k] && bd[k].width) bd[k].width = bd[k].height = 0;
  if (bd.cloudSpr) for (const c of bd.cloudSpr) c.width = c.height = 0;
}
export function resetWorldArt() { spriteCache.clear(); }
export function makeBackdrop(theme, seed) {
  const W = 960, H = 540;
  const rnd = mulberry(hash(theme.name) + seed);
  const night = theme.deco === 'star';
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.lineJoin = 'round'; return [c, x]; };

  const [sky, sx] = mk();
  const g = sx.createLinearGradient(0, 0, 0, 430); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  const cave = theme.deco === 'hole';
  if (cave) {
    // a cave has no sky: deep amber at the top, a warm lantern glow instead of a sun
    const cg = sx.createLinearGradient(0, 0, 0, 430); cg.addColorStop(0, '#6a3f12'); cg.addColorStop(0.55, '#c98a2c'); cg.addColorStop(1, '#f2c460');
    sx.fillStyle = cg; sx.fillRect(0, 0, W, H);
  }
  const sun = sx.createRadialGradient(740, 120, 8, 740, 120, 150);
  sun.addColorStop(0, night ? 'rgba(255,250,220,.9)' : 'rgba(255,255,230,.95)'); sun.addColorStop(0.25, night ? 'rgba(255,240,200,.3)' : 'rgba(255,240,190,.4)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = sun; sx.fillRect(500, 0, 460, 300);
  if (!cave) { sx.fillStyle = night ? '#fff7d6' : '#fffbe6'; sx.beginPath(); sx.arc(740, 120, 38, 0, TAU); sx.fill(); }
  if (night) { sx.fillStyle = theme.sky[0]; sx.beginPath(); sx.arc(754, 112, 32, 0, TAU); sx.fill(); sx.fillStyle = '#fff7d6'; sx.beginPath(); sx.arc(740, 120, 38, 0, TAU); sx.fill(); sx.fillStyle = 'rgba(40,30,100,.2)'; sx.beginPath(); sx.arc(748, 126, 32, 0, TAU); sx.fill(); }

  const hz = theme.haze || '#ffffff';
  const rgba = (c0, a) => { const m = mix(c0, c0, 0); return `rgba(${parseInt(m.slice(1, 3), 16)},${parseInt(m.slice(3, 5), 16)},${parseInt(m.slice(5, 7), 16)},${a})`; };
  {
    // a warm band of light hugging the horizon, so the sky melts into the hills instead of meeting them
    const hg = sx.createLinearGradient(0, 230, 0, 430); hg.addColorStop(0, rgba(hz, 0)); hg.addColorStop(1, rgba(hz, night ? 0.3 : 0.5));
    sx.fillStyle = hg; sx.fillRect(0, 230, W, 200);
  }
  const wrapX = (x, fn) => { fn(x); fn(x - W); fn(x + W); };
  const [far, fx] = mk();
  fx.fillStyle = mix(theme.far, hz, 0.22);
  fx.beginPath(); fx.moveTo(0, H);
  const ph = rnd() * 6, ph2 = rnd() * 6;
  for (let x = 0; x <= W; x += 8) { const a = x / W * TAU; fx.lineTo(x, 320 + Math.sin(a * 2 + ph) * 26 + Math.sin(a * 3 + ph2) * 14); }
  fx.lineTo(W, H); fx.fill();
  fx.fillStyle = mix(mix(theme.far, theme.sky[1], 0.35), hz, 0.12);
  fx.beginPath(); fx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) { const a = x / W * TAU; fx.lineTo(x, 350 + Math.sin(a * 3 + ph2 + 1) * 18 + Math.sin(a * 5 + ph) * 8); }
  fx.lineTo(W, H); fx.fill();

  {
    // tiny far-off shapes standing on the back ridge: trees, spires, pines or stalagmites, per place
    const ry = (x) => { const a = x / W * TAU; return 350 + Math.sin(a * 3 + ph2 + 1) * 18 + Math.sin(a * 5 + ph) * 8; };
    fx.fillStyle = mix(mix(theme.far, theme.sky[1], 0.35), theme.mid, 0.3);
    const dd = theme.deco;
    for (let i = 0; i < 26; i++) {
      const x0 = (i + rnd() * 0.8) * (W / 26), sz = 0.7 + rnd() * 0.8;
      wrapX(x0, (xx) => {
        const y0 = ry(((xx % W) + W) % W) + 3;
        fx.beginPath();
        if (dd === 'snow' || dd === 'hole') { const h = (dd === 'hole' ? 16 : 22) * sz, w = (dd === 'hole' ? 7 : 8) * sz; fx.moveTo(xx - w, y0); fx.lineTo(xx, y0 - h); fx.lineTo(xx + w, y0); }
        else if (dd === 'leaf' || dd === 'star') { const w = (7 + rnd() * 9) * sz, h = (12 + rnd() * 20) * sz; fx.rect(xx - w / 2, y0 - h, w, h); if (rnd() < 0.4) fx.rect(xx + w * 0.1, y0 - h - 5, 3, 5); }
        else { fx.moveTo(xx - 1.5 * sz, y0); fx.lineTo(xx - 1.5 * sz, y0 - 6 * sz); fx.arc(xx, y0 - 11 * sz, 7.5 * sz, Math.PI, 0); fx.lineTo(xx + 1.5 * sz, y0); }
        fx.fill();
      });
    }
    // a pale mist trail slipping between the two ridges
    const mg = fx.createLinearGradient(0, 322, 0, 372); mg.addColorStop(0, rgba(hz, 0)); mg.addColorStop(0.5, rgba(hz, 0.2)); mg.addColorStop(1, rgba(hz, 0));
    fx.fillStyle = mg; fx.fillRect(0, 322, W, 50);
  }

  const [mid, mx] = mk();
  const base = 404;
  const tree = (x, s, c1, c2) => {
    wrapX(x, (xx) => {
      mx.fillStyle = 'rgba(0,0,0,.18)'; mx.beginPath(); mx.ellipse(xx, base + 1, 26 * s, 4.5 * s, 0, 0, TAU); mx.fill();
      mx.fillStyle = '#6a4a3a'; mx.fillRect(xx - 3 * s, base - 30 * s, 6 * s, 30 * s);
      for (const [dx, dy, r, c] of [[-12, -42, 18, c2], [12, -42, 18, c2], [0, -56, 22, c1], [0, -38, 20, c1]]) {
        const cy = base + dy * s, tg = mx.createLinearGradient(0, cy - r * s, 0, cy + r * s);
        tg.addColorStop(0, shade(c, 0.16)); tg.addColorStop(1, shade(c, -0.14));
        mx.fillStyle = tg; mx.beginPath(); mx.arc(xx + dx * s, cy, r * s, 0, TAU); mx.fill();
        // leaf clumps: lighter on top, darker underneath
        for (let k = 0; k < 9; k++) {
          const an = rnd() * TAU, dd = Math.sqrt(rnd()) * r * s * 0.82, lx = xx + dx * s + Math.cos(an) * dd, ly = cy + Math.sin(an) * dd, up = Math.sin(an) < 0;
          mx.globalAlpha = 0.5; mx.fillStyle = up ? shade(c, 0.22) : shade(c, -0.2);
          mx.beginPath(); mx.ellipse(lx, ly, (2.4 + rnd() * 3) * s, (1.8 + rnd() * 2) * s, rnd() * 3, 0, TAU); mx.fill(); mx.globalAlpha = 1;
        }
      }
    });
  };
  const col = mix(theme.mid, hz, 0.1), dark = shade(col, -0.18), light = shade(col, 0.18);
  if (theme.deco === 'petal') {
    // torii gates standing among the blossom trees give the hill its identity
    for (const [gx0, gs] of [[230, 1.0], [690, 0.85]]) wrapX(gx0, (xx) => {
      const w = 62 * gs, h = 78 * gs, pw = 7 * gs;
      mx.fillStyle = 'rgba(0,0,0,.16)'; mx.beginPath(); mx.ellipse(xx, base + 1, w * 0.7, 4, 0, 0, TAU); mx.fill();
      mx.fillStyle = '#d4463c'; mx.fillRect(xx - w / 2, base - h, pw, h); mx.fillRect(xx + w / 2 - pw, base - h, pw, h);
      mx.fillRect(xx - w / 2 - 4 * gs, base - h - 2 * gs, w + 8 * gs, 7 * gs);
      mx.fillStyle = '#2a1f2e'; mx.fillRect(xx - w / 2 - 9 * gs, base - h - 9 * gs, w + 18 * gs, 7 * gs);
      mx.fillStyle = '#d4463c'; mx.fillRect(xx - w / 2 + pw, base - h * 0.72, w - pw * 2, 5 * gs);
    });
  }
  if (theme.deco === 'snow') {
    // an igloo and a snowman between the pines
    wrapX(300, (xx) => {
      mx.fillStyle = 'rgba(0,0,0,.14)'; mx.beginPath(); mx.ellipse(xx, base + 1, 56, 5, 0, 0, TAU); mx.fill();
      const ig = mx.createLinearGradient(0, base - 54, 0, base); ig.addColorStop(0, '#ffffff'); ig.addColorStop(1, '#cfe2f5');
      mx.fillStyle = ig; mx.beginPath(); mx.arc(xx, base, 56, Math.PI, 0); mx.fill(); mx.strokeStyle = '#6a86ab'; mx.lineWidth = 2.5; mx.stroke();
      mx.fillRect(xx + 28, base - 18, 34, 18);
      mx.strokeStyle = 'rgba(120,150,190,.55)'; mx.lineWidth = 1.5;
      for (const r of [20, 36, 50]) { mx.beginPath(); mx.arc(xx, base, r, Math.PI, 0); mx.stroke(); }
      for (let k = -3; k <= 3; k++) { mx.beginPath(); mx.moveTo(xx + k * 14, base - 4); mx.lineTo(xx + k * 11, base - 44 * Math.cos(k * 0.3)); mx.stroke(); }
      mx.fillStyle = '#3a4a6a'; mx.beginPath(); mx.arc(xx + 44, base, 12, Math.PI, 0); mx.fill();
    });
    wrapX(760, (xx) => {
      mx.fillStyle = 'rgba(0,0,0,.14)'; mx.beginPath(); mx.ellipse(xx, base + 1, 24, 4, 0, 0, TAU); mx.fill();
      for (const [dy, r] of [[-17, 18], [-43, 14], [-63, 10.5]]) {
        const sg = mx.createRadialGradient(xx - r * 0.3, base + dy - r * 0.3, 2, xx, base + dy, r); sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#c4d8ee');
        mx.fillStyle = sg; mx.beginPath(); mx.arc(xx, base + dy, r, 0, TAU); mx.fill(); mx.strokeStyle = '#6a86ab'; mx.lineWidth = 2; mx.stroke();
      }
      mx.fillStyle = '#2a3550'; mx.beginPath(); mx.arc(xx - 3.5, base - 65, 1.6, 0, TAU); mx.arc(xx + 3.5, base - 65, 1.6, 0, TAU); mx.fill();
      mx.fillStyle = '#ff8a3a'; mx.beginPath(); mx.moveTo(xx, base - 62); mx.lineTo(xx + 12, base - 60); mx.lineTo(xx, base - 58); mx.fill();
      mx.fillStyle = '#d4463c'; mx.fillRect(xx - 11, base - 54, 22, 5);
    });
  }
  for (let i = 0; i < 9; i++) {
    const x = (i + rnd() * 0.7) * (W / 9), s = 0.8 + rnd() * 0.6;
    if (theme.deco === 'flower' || theme.deco === 'petal') tree(x, s, theme.deco === 'petal' ? '#ffa6c9' : light, theme.deco === 'petal' ? '#f27aa8' : col);
    else if (theme.deco === 'leaf') {
      wrapX(x, (xx) => { const w = 54 * s, h = (70 + rnd() * 50) * s; mx.fillStyle = i % 2 ? col : dark; mx.fillRect(xx - w / 2, base - h, w, h); mx.fillStyle = 'rgba(255,230,150,.75)'; for (let k = 0; k < 4; k++) mx.fillRect(xx - w / 2 + 8 + (k % 2) * 22, base - h + 12 + Math.floor(k / 2) * 24, 12, 14); });
    } else if (night) {
      wrapX(x, (xx) => { const w = 60 * s, h = (50 + rnd() * 60) * s; mx.fillStyle = i % 2 ? col : dark; mx.fillRect(xx - w / 2, base - h, w, h); mx.fillRect(xx + w * 0.2, base - h - 16, 10, 16); mx.fillStyle = 'rgba(255,225,120,.85)'; for (let k = 0; k < 3; k++) mx.fillRect(xx - w / 2 + 8 + (k % 2) * 24, base - h + 10 + Math.floor(k / 2) * 20, 10, 12);
        if (i === 3) {
          // a cat silhouette keeping watch on the roof, eyes glowing
          const cx0 = xx - w * 0.12, cy0 = base - h, k2 = 2.1 * s;
          mx.fillStyle = '#12102c';
          mx.beginPath(); mx.ellipse(cx0, cy0 - 5 * k2, 5.5 * k2, 5 * k2, 0, 0, TAU); mx.fill();
          mx.beginPath(); mx.arc(cx0 + 1.5 * k2, cy0 - 12 * k2, 3.6 * k2, 0, TAU); mx.fill();
          mx.beginPath(); mx.moveTo(cx0 - 1.6 * k2, cy0 - 14.2 * k2); mx.lineTo(cx0 - 1 * k2, cy0 - 18 * k2); mx.lineTo(cx0 + 1 * k2, cy0 - 15.2 * k2); mx.fill();
          mx.beginPath(); mx.moveTo(cx0 + 2.2 * k2, cy0 - 15.2 * k2); mx.lineTo(cx0 + 4.4 * k2, cy0 - 18 * k2); mx.lineTo(cx0 + 4.6 * k2, cy0 - 14 * k2); mx.fill();
          mx.strokeStyle = '#12102c'; mx.lineWidth = 2 * k2 * 0.6; mx.lineCap = 'round'; mx.beginPath(); mx.moveTo(cx0 - 5 * k2, cy0 - 2 * k2); mx.quadraticCurveTo(cx0 - 12 * k2, cy0 - 3 * k2, cx0 - 10 * k2, cy0 - 11 * k2); mx.stroke();
          mx.fillStyle = '#ffe27a'; mx.beginPath(); mx.arc(cx0 + 0.4 * k2, cy0 - 12.4 * k2, 0.7 * k2, 0, TAU); mx.arc(cx0 + 2.8 * k2, cy0 - 12.4 * k2, 0.7 * k2, 0, TAU); mx.fill();
        } });
    } else if (theme.deco === 'hole') {
      wrapX(x, (xx) => { const w = 60 * s, h = 50 * s; mx.fillStyle = i % 2 ? '#e6b64a' : '#f2cc5e'; mx.beginPath(); mx.moveTo(xx - w / 2, base); mx.lineTo(xx - w / 2 + 10, base - h); mx.lineTo(xx + w / 2, base - h * 0.7); mx.lineTo(xx + w / 2, base); mx.fill(); mx.fillStyle = 'rgba(160,100,20,.55)'; for (const [dx, dy, r] of [[-10, -20, 6], [12, -34, 5], [8, -12, 4]]) { mx.beginPath(); mx.ellipse(xx + dx * s, base + dy * s, r * s, r * s * 0.8, 0, 0, TAU); mx.fill(); } });
    } else {
      wrapX(x, (xx) => { const h = (60 + rnd() * 40) * s, w = 40 * s; mx.fillStyle = '#6a8a7a'; mx.fillRect(xx - 2, base - 12, 4, 12); for (let k = 0; k < 3; k++) { mx.fillStyle = k % 2 ? '#7aa08a' : '#8ab89a'; mx.beginPath(); mx.moveTo(xx - w / 2 + k * 3, base - 10 - k * h * 0.28); mx.lineTo(xx, base - h * (0.5 + k * 0.28)); mx.lineTo(xx + w / 2 - k * 3, base - 10 - k * h * 0.28); mx.fill(); mx.fillStyle = '#fff'; mx.beginPath(); mx.moveTo(xx - 8 + k * 2, base - h * (0.38 + k * 0.28)); mx.lineTo(xx, base - h * (0.5 + k * 0.28)); mx.lineTo(xx + 8 - k * 2, base - h * (0.38 + k * 0.28)); mx.fill(); } });
    }
  }
  if (theme.deco === 'flower') {
    // a windmill on the garden hill
    wrapX(560, (xx) => {
      mx.fillStyle = 'rgba(0,0,0,.14)'; mx.beginPath(); mx.ellipse(xx, base + 1, 34, 5, 0, 0, TAU); mx.fill();
      mx.fillStyle = '#f4ead6'; mx.beginPath(); mx.moveTo(xx - 17, base); mx.lineTo(xx - 10, base - 78); mx.lineTo(xx + 10, base - 78); mx.lineTo(xx + 17, base); mx.closePath(); mx.fill();
      mx.strokeStyle = '#8a6a4a'; mx.lineWidth = 2.4; mx.stroke();
      mx.fillStyle = '#c4533f'; mx.beginPath(); mx.moveTo(xx - 14, base - 76); mx.lineTo(xx, base - 98); mx.lineTo(xx + 14, base - 76); mx.closePath(); mx.fill(); mx.stroke();
      mx.fillStyle = '#6a4a3a'; mx.fillRect(xx - 5, base - 20, 10, 20);
      const hx = xx, hy = base - 70; mx.strokeStyle = '#8a6a4a'; mx.lineWidth = 2.2;
      for (let k = 0; k < 4; k++) {
        const an = Math.PI / 4 + k * Math.PI / 2, ex = hx + Math.cos(an) * 44, ey = hy + Math.sin(an) * 44;
        mx.beginPath(); mx.moveTo(hx, hy); mx.lineTo(ex, ey); mx.stroke();
        const nx = -Math.sin(an), ny = Math.cos(an);
        mx.fillStyle = 'rgba(255,250,235,.95)'; mx.beginPath(); mx.moveTo(hx + Math.cos(an) * 12, hy + Math.sin(an) * 12); mx.lineTo(ex, ey); mx.lineTo(ex + nx * 13, ey + ny * 13); mx.lineTo(hx + Math.cos(an) * 12 + nx * 13, hy + Math.sin(an) * 12 + ny * 13); mx.closePath(); mx.fill(); mx.stroke();
      }
      mx.fillStyle = '#8a6a4a'; mx.beginPath(); mx.arc(hx, hy, 4, 0, TAU); mx.fill();
    });
  }
  if (theme.deco === 'hole') { mx.fillStyle = '#8a5a14'; for (let i = 0; i < 12; i++) { const x = i * 84 + rnd() * 30; mx.beginPath(); mx.moveTo(x, 0); mx.lineTo(x + 26, 0); mx.lineTo(x + 13, 40 + rnd() * 50); mx.fill(); } }

  const [gr, gx] = mk();
  const top = 424;
  {
    // low ground fog drifting over the foot of the hills
    const fg = gx.createLinearGradient(0, top - 52, 0, top + 14); fg.addColorStop(0, rgba(hz, 0)); fg.addColorStop(0.7, rgba(hz, night ? 0.22 : 0.34)); fg.addColorStop(1, rgba(hz, 0.1));
    gx.fillStyle = fg; gx.fillRect(0, top - 52, W, 66);
  }
  const gg = gx.createLinearGradient(0, top, 0, H); gg.addColorStop(0, theme.ground[0]); gg.addColorStop(0.12, theme.ground[1]); gg.addColorStop(0.13, theme.dirt); gg.addColorStop(1, shade(theme.dirt, -0.25));
  gx.fillStyle = gg; gx.beginPath(); gx.moveTo(0, top + 6);
  for (let x = 0; x <= W; x += 6) gx.lineTo(x, top + Math.sin(x / W * TAU * 3) * 3 + 2);
  gx.lineTo(W, H); gx.lineTo(0, H); gx.fill();
  // thin light edge along the top of the strip
  gx.strokeStyle = shade(theme.ground[0], 0.4); gx.globalAlpha = 0.7; gx.lineWidth = 1.5; gx.beginPath();
  for (let x = 0; x <= W; x += 6) { const y = top + Math.sin(x / W * TAU * 3) * 3 + 2; x ? gx.lineTo(x, y) : gx.moveTo(x, y); }
  gx.stroke(); gx.globalAlpha = 1;
  gx.fillStyle = theme.ground[0];
  for (let i = 0; i < 90; i++) { const x = rnd() * W, h = 5 + rnd() * 9; gx.beginPath(); gx.moveTo(x - 2, top + 4); gx.lineTo(x, top - h + 4); gx.lineTo(x + 2, top + 4); gx.fill(); }
  const dec = theme.deco;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = top + 14 + rnd() * 90;
    if (dec === 'flower') { gx.fillStyle = ['#fff', '#ffd23f', '#ff9ac6'][i % 3]; gx.beginPath(); gx.arc(x, top + 3 + (i % 3), 2.6, 0, TAU); gx.fill(); }
    else if (dec === 'leaf') { gx.fillStyle = ['#d9532b', '#e8a22a', '#b8431f'][i % 3]; gx.beginPath(); gx.ellipse(x, y, 5, 2.6, rnd() * 3, 0, TAU); gx.fill(); }
    else if (dec === 'petal') { gx.fillStyle = 'rgba(255,190,215,.9)'; gx.beginPath(); gx.ellipse(x, y, 4, 2.2, rnd() * 3, 0, TAU); gx.fill(); }
    else if (dec === 'snow') { gx.fillStyle = 'rgba(255,255,255,.8)'; gx.beginPath(); gx.ellipse(x, y, 9, 2.4, 0, 0, TAU); gx.fill(); }
    else { gx.fillStyle = 'rgba(0,0,0,.14)'; gx.beginPath(); gx.ellipse(x, y, 6 + rnd() * 6, 2.6, 0, 0, TAU); gx.fill(); }
  }
  // a few stones or flowers in the mid ground
  const nProps = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < nProps; i++) {
    const x = rnd() * W, y = top + 20 + rnd() * 40, r = 2 + rnd() * 2.5;
    if (dec === 'flower' || dec === 'petal') {
      gx.strokeStyle = shade(theme.ground[1], -0.2); gx.lineWidth = 1; gx.beginPath(); gx.moveTo(x, y + 5); gx.lineTo(x, y); gx.stroke();
      gx.fillStyle = dec === 'petal' ? '#ffd0e2' : ['#fff', '#ffd23f', '#ff9ac6'][i % 3]; gx.beginPath(); gx.arc(x, y, r, 0, TAU); gx.fill();
      gx.fillStyle = '#ffcf3a'; gx.beginPath(); gx.arc(x, y, r * 0.35, 0, TAU); gx.fill();
    } else {
      gx.fillStyle = 'rgba(0,0,0,.2)'; gx.beginPath(); gx.ellipse(x + 1, y + r * 0.7, r * 1.4, r * 0.5, 0, 0, TAU); gx.fill();
      gx.fillStyle = shade(theme.dirt, 0.12 + rnd() * 0.12); gx.beginPath(); gx.ellipse(x, y, r * 1.3, r * 0.9, 0, 0, TAU); gx.fill();
      gx.fillStyle = 'rgba(255,255,255,.3)'; gx.beginPath(); gx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.3, 0, 0, TAU); gx.fill();
    }
  }
  for (let i = 0; i < 40; i++) { gx.fillStyle = 'rgba(255,255,255,.1)'; gx.fillRect(rnd() * W, top + 20 + rnd() * 90, 14 + rnd() * 26, 1.5); }

  const gb = 440, wrapG = (x, fn) => { fn(x); fn(x - W); fn(x + W); };
  if (theme.deco === 'leaf') {
    // street lamps and a bench along the alley
    for (const lx of [380, 700]) wrapG(lx, (xx) => {
      gx.fillStyle = 'rgba(0,0,0,.14)'; gx.beginPath(); gx.ellipse(xx, gb + 1, 14, 3.5, 0, 0, TAU); gx.fill();
      const lg = gx.createRadialGradient(xx + 14, gb - 92, 2, xx + 14, gb - 92, 46); lg.addColorStop(0, 'rgba(255,240,170,1)'); lg.addColorStop(0.45, 'rgba(255,225,130,.55)'); lg.addColorStop(1, 'rgba(255,225,130,0)');
      gx.fillStyle = lg; gx.fillRect(xx - 40, gb - 150, 110, 110);
      gx.strokeStyle = '#2a1c1c'; gx.lineWidth = 6.5; gx.lineCap = 'round';
      gx.beginPath(); gx.moveTo(xx, gb); gx.lineTo(xx, gb - 88); gx.quadraticCurveTo(xx, gb - 100, xx + 14, gb - 100); gx.stroke();
      gx.fillStyle = '#2a1c1c'; gx.fillRect(xx - 9, gb - 8, 18, 8);
      gx.fillStyle = '#fff3b8'; gx.beginPath(); gx.moveTo(xx + 6, gb - 102); gx.lineTo(xx + 24, gb - 102); gx.lineTo(xx + 21, gb - 88); gx.lineTo(xx + 9, gb - 88); gx.closePath(); gx.fill();
      gx.strokeStyle = '#2a1c1c'; gx.lineWidth = 3; gx.stroke();
    });
    wrapG(620, (xx) => {
      gx.fillStyle = '#5a3a2a'; gx.fillRect(xx - 24, gb - 22, 48, 6); gx.fillRect(xx - 24, gb - 34, 48, 4);
      gx.fillRect(xx - 22, gb - 16, 4, 16); gx.fillRect(xx + 18, gb - 16, 4, 16); gx.fillRect(xx - 24, gb - 36, 4, 20); gx.fillRect(xx + 20, gb - 36, 4, 20);
    });
  }
  // tall foreground tufts (drawn in front of the action) and soft sun rays
  // ground detail: soil grain, pebbles with a lit side, hairline cracks and a few faint paw prints
  texturize(gr, { seed: seed + 3, count: 8000, len: 7, lw: 1.2, dir: 0.05, spread: 0.7, alpha: 0.5, amp: 0.13, minLum: 35 });
  {
    const pc = shade(theme.dirt, -0.32), pl = shade(theme.dirt, 0.3);
    for (let i = 0; i < 80; i++) {
      const y = top + 20 + rnd() * (H - top - 34), x = rnd() * W, r = (1.4 + rnd() * 2.8) * (0.6 + (y - top) / 120);
      gx.fillStyle = 'rgba(30,18,10,.25)'; gx.beginPath(); gx.ellipse(x + 1, y + r * 0.7, r * 1.15, r * 0.5, 0, 0, TAU); gx.fill();
      gx.fillStyle = pc; gx.beginPath(); gx.ellipse(x, y, r, r * 0.72, 0, 0, TAU); gx.fill();
      gx.fillStyle = pl; gx.globalAlpha = 0.7; gx.beginPath(); gx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.28, 0, 0, TAU); gx.fill(); gx.globalAlpha = 1;
    }
    gx.strokeStyle = 'rgba(30,18,10,.22)'; gx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { let x = rnd() * W, y = top + 30 + rnd() * (H - top - 50); gx.beginPath(); gx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += 8 + rnd() * 12; y += (rnd() - 0.5) * 8; gx.lineTo(x, y); } gx.stroke(); }
    gx.fillStyle = 'rgba(30,18,10,.13)';
    for (let i = 0; i < 7; i++) {
      const x = 60 + rnd() * (W - 120), y = top + 36 + rnd() * (H - top - 70), a = -0.5 + rnd() * 1.0;
      gx.save(); gx.translate(x, y); gx.rotate(a);
      gx.beginPath(); gx.ellipse(0, 3, 5.5, 4.6, 0, 0, TAU); gx.fill();
      for (const [tx, ty] of [[-6, -4], [-2.2, -8], [2.2, -8], [6, -4]]) { gx.beginPath(); gx.ellipse(tx, ty, 1.9, 2.4, 0, 0, TAU); gx.fill(); }
      gx.restore();
    }
  }
  {
    // ground shading: contact shadow under the grass lip, a sunlit band, and a darker foreground for depth
    const ao = gx.createLinearGradient(0, top + 4, 0, top + 26); ao.addColorStop(0, 'rgba(10,5,20,.26)'); ao.addColorStop(1, 'rgba(10,5,20,0)');
    gx.fillStyle = ao; gx.fillRect(0, top + 4, W, 22);
    const dp = gx.createLinearGradient(0, 468, 0, H); dp.addColorStop(0, 'rgba(10,5,20,0)'); dp.addColorStop(1, 'rgba(10,5,20,.32)');
    gx.fillStyle = dp; gx.fillRect(0, 468, W, H - 468);
    // small props lying around, different per place (x wraps, so they tile)
    const prop = (x, y, fn) => { fn(x, y); if (x < 40) fn(x + W, y); if (x > W - 40) fn(x - W, y); };
    const shadow = (x, y, rx) => { gx.fillStyle = 'rgba(10,5,20,.22)'; gx.beginPath(); gx.ellipse(x + 1, y + 1, rx, rx * 0.32, 0, 0, TAU); gx.fill(); };
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = top + 26 + rnd() * (H - top - 60), k = 0.8 + (y - top) / 110;
      prop(x, y, (xx, yy) => {
        shadow(xx, yy, 9 * k);
        if (dec === 'flower') {   // a toadstool
          gx.fillStyle = '#f2e8d4'; gx.fillRect(xx - 1.6 * k, yy - 6 * k, 3.2 * k, 6 * k);
          gx.fillStyle = '#d4463c'; gx.beginPath(); gx.ellipse(xx, yy - 6 * k, 6 * k, 4 * k, 0, Math.PI, 0); gx.fill();
          gx.fillStyle = '#fff'; for (const dx of [-2.6, 0.5, 2.8]) { gx.beginPath(); gx.arc(xx + dx * k, yy - 8 * k, 0.9 * k, 0, TAU); gx.fill(); }
        } else if (dec === 'leaf') {   // a leaf pile
          for (let j = 0; j < 6; j++) { gx.fillStyle = ['#d9532b', '#e8a22a', '#b8431f'][j % 3]; gx.beginPath(); gx.ellipse(xx + (j - 3) * 2.4 * k, yy - (j % 3) * 1.6 * k, 4 * k, 1.9 * k, j * 0.7, 0, TAU); gx.fill(); }
        } else if (dec === 'star') {   // a puddle that catches the moon
          const pg = gx.createLinearGradient(xx - 12 * k, yy, xx + 12 * k, yy); pg.addColorStop(0, 'rgba(120,140,230,.0)'); pg.addColorStop(0.5, 'rgba(190,205,255,.55)'); pg.addColorStop(1, 'rgba(120,140,230,0)');
          gx.fillStyle = pg; gx.beginPath(); gx.ellipse(xx, yy, 13 * k, 3.4 * k, 0, 0, TAU); gx.fill();
        } else if (dec === 'hole') {   // cheese crumbs
          for (let j = 0; j < 4; j++) { gx.fillStyle = j % 2 ? '#ffe27a' : '#f5c040'; gx.beginPath(); gx.moveTo(xx + j * 4 * k - 6, yy); gx.lineTo(xx + j * 4 * k - 3, yy - 3 * k); gx.lineTo(xx + j * 4 * k, yy); gx.fill(); }
        } else if (dec === 'snow') {   // a small snow drift with a blue lee side
          gx.fillStyle = '#ffffff'; gx.beginPath(); gx.ellipse(xx, yy, 11 * k, 4 * k, 0, Math.PI, 0); gx.fill();
          gx.fillStyle = 'rgba(150,185,225,.55)'; gx.beginPath(); gx.ellipse(xx + 2 * k, yy, 8 * k, 2 * k, 0, 0, Math.PI); gx.fill();
        } else {   // fallen petals
          for (let j = 0; j < 5; j++) { gx.fillStyle = j % 2 ? '#ffd0e2' : '#ff9ac0'; gx.beginPath(); gx.ellipse(xx + (j - 2) * 3.2 * k, yy - (j % 2) * 1.5, 3 * k, 1.6 * k, j, 0, TAU); gx.fill(); }
        }
      });
    }
  }
  const [front, ftx] = mk();
  const tuft = theme.deco === 'snow' ? '#ffffff' : shade(theme.ground[1], -0.12);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, h = 22 + rnd() * 26, n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const bx = x + (k - n / 2) * 4, lean = (rnd() - 0.5) * 16;
      ftx.globalAlpha = 0.75; ftx.strokeStyle = shade(k % 2 ? tuft : shade(tuft, 0.14), (rnd() - 0.5) * 0.16); ftx.lineWidth = 3; ftx.lineCap = 'round';
      ftx.beginPath(); ftx.moveTo(bx, H + 2); ftx.quadraticCurveTo(bx + lean * 0.4, H - h * 0.6, bx + lean, H - h); ftx.stroke();
    }
  }
  const [rays, rx] = mk();
  for (let i = 0; i < (night ? 4 : 6); i++) {
    const a0 = 1.7 + i * 0.2 + (rnd() - 0.5) * 0.08, spread = 0.025 + rnd() * 0.075, peak = 0.05 + rnd() * 0.05;
    const L = 520 + rnd() * 120, ca = Math.cos(a0), sa = Math.sin(a0);
    // along the shaft: bright near the sun, gone before the ground
    const gl = rx.createLinearGradient(740, 120, 740 + ca * L, 120 + sa * L);
    const rc = night ? '190,205,255' : '255,255,220';
    gl.addColorStop(0, `rgba(${rc},${peak})`); gl.addColorStop(0.6, `rgba(${rc},${peak * 0.5})`); gl.addColorStop(1, `rgba(${rc},0)`);
    const [sh, shx] = mk();
    shx.fillStyle = gl; shx.beginPath(); shx.moveTo(740, 120);
    shx.lineTo(740 + Math.cos(a0 - spread) * 900, 120 + Math.sin(a0 - spread) * 900); shx.lineTo(740 + Math.cos(a0 + spread) * 900, 120 + Math.sin(a0 + spread) * 900); shx.fill();
    // soft edges: multiply the shaft by a gradient across its width
    const px = -sa, py = ca, mxp = 740 + ca * L * 0.5, myp = 120 + sa * L * 0.5, hw = Math.tan(spread) * L * 0.5 + 1;
    const ge = shx.createLinearGradient(mxp - px * hw, myp - py * hw, mxp + px * hw, myp + py * hw);
    ge.addColorStop(0, 'rgba(0,0,0,0)'); ge.addColorStop(0.35, 'rgba(0,0,0,1)'); ge.addColorStop(0.65, 'rgba(0,0,0,1)'); ge.addColorStop(1, 'rgba(0,0,0,0)');
    shx.globalCompositeOperation = 'destination-in'; shx.fillStyle = ge; shx.fillRect(0, 0, W, H);
    rx.drawImage(sh, 0, 0);
    sh.width = sh.height = 0;                 // temp canvases are freed at once: phones cap total canvas memory
  }
  // fade everything out toward the ground so rays never wash over the characters
  rx.globalCompositeOperation = 'destination-in';
  const rf = rx.createLinearGradient(0, 200, 0, 420); rf.addColorStop(0, 'rgba(0,0,0,1)'); rf.addColorStop(1, 'rgba(0,0,0,0)');
  rx.fillStyle = rf; rx.fillRect(0, 0, W, H); rx.globalCompositeOperation = 'source-over';

  // depth of field and atmospheric haze: the distant layers are softer and drift toward the haze colour
  const soften = (cv, px, haze, hazeA) => {
    const [o, ox] = mk();
    if (typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype && px > 0) ox.filter = `blur(${px}px)`;
    ox.drawImage(cv, 0, 0); ox.filter = 'none';
    ox.globalCompositeOperation = 'source-atop'; ox.globalAlpha = hazeA; ox.fillStyle = haze; ox.fillRect(0, 0, W, H);
    cv.width = cv.height = 0;                 // the sharp source layer is not needed again
    return o;
  };
  texturize(far, { seed: seed + 5, count: 5000, len: 5, lw: 1.2, dir: 0.9, spread: 2.2, alpha: 0.32, amp: 0.06, minLum: 25 });
  texturize(mid, { seed: seed + 6, count: 7000, len: 4.5, lw: 1.2, dir: 0.6, spread: 2.6, alpha: 0.42, amp: 0.1, minLum: 25 });
  const farSoft = soften(far, 2.6, hz, 0.38), midSoft = soften(mid, 0.9, hz, 0.14);

  const stars = []; if (night) for (let i = 0; i < 70; i++) stars.push([rnd() * W, rnd() * 300, 0.6 + rnd() * 1.4, rnd() * 6]);
  const clouds = []; for (let i = 0; i < 6; i++) clouds.push([rnd() * W, 50 + rnd() * 130, 0.6 + rnd() * 0.8, 6 + rnd() * 8]);
  // three shaded cloud sprites (lit top, soft shadowed belly), drawn with drawImage instead of four path fills per cloud
  const cloudSpr = [];
  if (!cave) for (let i = 0; i < 3; i++) {
    const cw = 252, ch = 92, c = document.createElement('canvas'); c.width = cw; c.height = ch; const cx = c.getContext('2d'), s2 = 1.4;
    const puffs = [[0, 0, 46, 14], [-24, 4, 28, 11], [26, 5, 30, 11], [4, -9, 24, 12]];
    if (i === 1) puffs.push([-48, 6, 18, 8]); if (i === 2) puffs.push([50, 7, 20, 8], [-10, -13, 16, 9]);
    cx.fillStyle = night ? '#c4bcff' : '#ffffff';
    for (const [dx, dy, rx, ry] of puffs) { cx.beginPath(); cx.ellipse(cw / 2 + dx * s2, ch / 2 + 6 + dy * s2, rx * s2, ry * s2, 0, 0, TAU); cx.fill(); }
    cx.globalCompositeOperation = 'source-atop';
    const cg = cx.createLinearGradient(0, 14, 0, ch - 14); cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.55, rgba(night ? '#6a60c0' : mix(theme.sky[1], '#8aa0c8', 0.5), 0)); cg.addColorStop(1, rgba(night ? '#5a50b0' : mix(theme.sky[1], '#8aa0c8', 0.5), 0.5));
    cx.fillStyle = cg; cx.fillRect(0, 0, cw, ch);
    cloudSpr.push(c);
  }
  const birds = []; if (!night && !cave) for (let i = 0; i < 3; i++) birds.push([rnd() * W, 90 + rnd() * 120, 0.7 + rnd() * 0.6, rnd() * 6]);
  const motes = []; for (let i = 0; i < 18; i++) motes.push([380 + rnd() * 520, 140 + rnd() * 260, 0.5 + rnd(), rnd() * 6]);
  return { cloudSpr, birds, motes, sky, far: farSoft, mid: midSoft, gr, front, rays, stars, clouds, night, cave, deco: theme.deco, sun: { x: 740, y: 120 } };
}

export function drawBackdrop(ctx, bd, scroll, t) {
  const W = 960;
  ctx.drawImage(bd.sky, 0, 0);
  if (bd.night) {
    for (const [x, y, r, p] of bd.stars) {
      const b = 0.45 + 0.45 * Math.sin(t * 2 + p); ctx.fillStyle = `rgba(255,250,220,${b})`; ctx.fillRect(x, y, r, r);
      if (r > 1.7 && b > 0.6) { ctx.fillStyle = `rgba(255,250,220,${(b - 0.6) * 1.6})`; ctx.fillRect(x - 2.5, y + r / 2 - 0.5, r + 5, 1); ctx.fillRect(x + r / 2 - 0.5, y - 2.5, 1, r + 5); }
    }
    // now and then a shooting star slips across the sky
    const per = 11, u = (t % per) / 0.8;
    if (u < 1) { const k = Math.floor(t / per), sx0 = 120 + (k * 377) % 480, sy0 = 40 + (k * 91) % 90, d = u * 190; ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx0 + d, sy0 + d * 0.38); ctx.lineTo(sx0 + d - 34, sy0 + (d - 34) * 0.38); ctx.stroke(); ctx.restore(); }
  }
  if (bd.birds) for (const [x, y, s, p] of bd.birds) {
    // distant birds: a flapping V that wraps the screen
    const bx = ((x + t * (18 + p * 3) - scroll * 0.06) % (W + 80) + W + 80) % (W + 80) - 40, by = y + Math.sin(t * 0.9 + p) * 14, fl = Math.sin(t * 9 + p * 3) * 3.4 * s;
    ctx.strokeStyle = bd.deco === 'snow' ? 'rgba(60,80,120,.5)' : 'rgba(50,40,70,.45)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx - 7 * s, by + fl * 0.3); ctx.quadraticCurveTo(bx - 3 * s, by - fl, bx, by); ctx.quadraticCurveTo(bx + 3 * s, by - fl, bx + 7 * s, by + fl * 0.3); ctx.stroke();
  }
  if (bd.deco === 'flower') {
    // a few butterflies flutter over the meadow
    for (let k = 0; k < 4; k++) {
      const bx = ((k * 260 + t * (14 + k * 3) - scroll * 0.1) % (W + 80) + W + 80) % (W + 80) - 40, by = 330 + k * 14 + Math.sin(t * 1.7 + k * 2) * 22, fl = Math.abs(Math.sin(t * 14 + k)) ;
      ctx.fillStyle = ['#ff8fb7', '#ffd23f', '#8fd0ff', '#ffffff'][k];
      ctx.beginPath(); ctx.ellipse(bx - 2.5, by, 3.2 * (0.35 + fl), 2.6, -0.4, 0, TAU); ctx.ellipse(bx + 2.5, by, 3.2 * (0.35 + fl), 2.6, 0.4, 0, TAU); ctx.fill();
    }
  }
  if (bd.cave) {
    // glowing dust motes drifting up through the cave air instead of clouds
    for (const [x, y, s, v] of bd.clouds) {
      const cx = ((x + Math.sin(t * 0.4 + v) * 30 - scroll * 0.05) % W + W) % W, cy = 380 - ((y * 2 + t * (6 + v)) % 330);
      ctx.fillStyle = `rgba(255,236,160,${0.25 + 0.25 * Math.sin(t * 1.5 + v + x)})`; ctx.beginPath(); ctx.arc(cx, cy, 1.4 + s * 1.2, 0, TAU); ctx.fill();
    }
  }
  if (!bd.cave && bd.cloudSpr) {
    ctx.globalAlpha = bd.night ? 0.34 : 0.85;
    let ci = 0;
    for (const [x, y, s, v] of bd.clouds) {
      const cx = ((x - t * v - scroll * 0.05 * s) % (W + 200) + W + 200) % (W + 200) - 100, sp = bd.cloudSpr[ci++ % 3], k = s / 1.4;
      ctx.drawImage(sp, cx - 126 * k, y - 46 * k - 6 * s, 252 * k, 92 * k);
    }
    ctx.globalAlpha = 1;
  }
  for (const [layer, k] of [[bd.far, 0.12], [bd.mid, 0.4], [bd.gr, 1]]) {
    const o = ((scroll * k) % W + W) % W;
    ctx.drawImage(layer, -o, 0); ctx.drawImage(layer, W - o, 0);
  }
}

export function drawRays(ctx, bd, t) {
  if (bd.cave) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (bd.night ? 0.085 : 0.11) + 0.05 * Math.sin(t * 0.7);
  ctx.drawImage(bd.rays, 0, 0);
  // dust motes turning slowly in the light
  ctx.fillStyle = bd.night ? 'rgba(190,205,255,1)' : 'rgba(255,250,215,1)';
  for (const [x, y, s, p] of bd.motes || []) {
    const mx2 = x + Math.sin(t * 0.35 + p) * 26, my2 = y + Math.cos(t * 0.27 + p * 2) * 18 - Math.sin(t * 0.2 + p) * 12 * s;
    ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 1.3 + p * 4) ** 2; ctx.fillRect(mx2, my2, 1.6 * s, 1.6 * s);
  }
  ctx.restore();
}
export function drawFront(ctx, bd, scroll) {
  const W = 960, o = ((scroll * 1.35) % W + W) % W;
  ctx.drawImage(bd.front, -o, 0); ctx.drawImage(bd.front, W - o, 0);
}
