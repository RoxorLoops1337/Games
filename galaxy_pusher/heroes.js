// Galaxy Pusher heroes: Rox and Jas as slim sci-fi fighters. Thin ink lines, two-tone cel fills and neon trim.
// drawFighter(g, id, x, y, h, t, pose): feet at (x, y), h tall, facing right. Poses: idle attack sing hurt cheer.
// drawHeroBust(g, id, cx, cy, R): head and shoulders filling a circle of radius R (for the tokens).
const TAU = Math.PI * 2;
const INK = '#120a1f';

const LOOK = {
  rox: {
    skin: '#e9b48f', skinSh: '#c98d6c', hair: '#4a2c1b', hairHi: '#7a4a2c',
    suit: '#1d2333', suitSh: '#11151f', plate: '#3a4560', plateHi: '#5d6c90', neon: '#3fd0ff', neon2: '#a8ecff',
    boot: '#e8eef8', bootSh: '#9aa6bd',
  },
  jas: {
    skin: '#f2c4a4', skinSh: '#d39f80', hair: '#5a3220', hairHi: '#8c5534',
    suit: '#f3eff9', suitSh: '#c9c0dc', plate: '#ff5fb8', plateHi: '#ffb3dd', neon: '#ff4fb0', neon2: '#ffd1ea',
    boot: '#ff5fb8', bootSh: '#b8287a',
  },
};

// joint angles per pose, radians, 0 = limb hanging straight down, + = swung forward (toward +x)
const POSE = {
  idle: { lean: 0.02, head: 0, fu: 0.35, ff: 1.2, bu: -0.2, bf: 0.35, ft: 0.18, fs: -0.08, bt: -0.2, bs: 0.12 },
  attack: { lean: 0.16, head: 0.05, fu: 1.5, ff: 1.55, bu: -0.75, bf: -0.2, ft: 0.62, fs: -0.35, bt: -0.55, bs: 0.25 },
  sing: { lean: -0.06, head: -0.22, fu: 0.55, ff: 2.55, bu: 1.9, bf: 2.3, ft: 0.15, fs: -0.05, bt: -0.25, bs: 0.15 },
  hurt: { lean: -0.2, head: -0.2, fu: -0.3, ff: 0.3, bu: -0.5, bf: 0.2, ft: 0.3, fs: -0.3, bt: -0.1, bs: 0.3 },
  cheer: { lean: -0.04, head: -0.12, fu: 2.8, ff: 2.9, bu: 2.6, bf: 2.7, ft: 0.12, fs: 0, bt: -0.12, bs: 0 },
};

const pt = (x, y, len, a) => [x + Math.sin(a) * len, y + Math.cos(a) * len];

// a tapered limb segment with one thin outline
function seg(g, a, b, w0, w1, fill, lw) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  g.beginPath();
  g.moveTo(a[0] + nx * w0, a[1] + ny * w0);
  g.lineTo(b[0] + nx * w1, b[1] + ny * w1);
  g.arc(b[0], b[1], w1, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, false);
  g.lineTo(a[0] - nx * w0, a[1] - ny * w0);
  g.arc(a[0], a[1], w0, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, false);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
}
function neonLine(g, a, b, col, lw) {
  g.save(); g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = col; g.shadowBlur = lw * 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
}
function lerpP(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
function mixPose(p, q, k) { const o = {}; for (const key in p) o[key] = p[key] + (q[key] - p[key]) * k; return o; }

export function drawFighter(g, id, x, y, h, t, pose = 'idle', opt = {}) {
  const L = LOOK[id] || LOOK.rox;
  const u = h / 100, lw = Math.max(0.7, u * 0.55);
  let P = POSE[pose] || POSE.idle;
  // idle life: breathing, a little weight shift, arms swaying
  const br = Math.sin(t * 2.2 + (id === 'jas' ? 1.3 : 0));
  P = { ...P, fu: P.fu + br * 0.04, bu: P.bu - br * 0.05, head: P.head + Math.sin(t * 1.1) * 0.03 };
  g.save(); g.translate(x, y);
  if (opt.flip) g.scale(-1, 1);
  const bob = (pose === 'idle' ? br * 0.6 : 0) * u;
  // hover glow under the boots
  g.save(); g.globalAlpha = 0.55; const sg = g.createRadialGradient(0, 0, 0, 0, 0, 22 * u); sg.addColorStop(0, L.neon); sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(0, 0, 22 * u, 4 * u, 0, 0, TAU); g.fill(); g.restore();

  const hip = [0, -50 * u + bob];
  const neck = pt(hip[0], hip[1], 30 * u, Math.PI - P.lean);          // up the spine
  const sh = [neck[0], neck[1] + 3 * u];
  const fSh = [sh[0] + 2.5 * u, sh[1]], bSh = [sh[0] - 2.5 * u, sh[1]];
  const fHip = [hip[0] + 2.5 * u, hip[1]], bHip = [hip[0] - 2.5 * u, hip[1]];
  const fKnee = pt(fHip[0], fHip[1], 23 * u, P.ft), fAnk = pt(fKnee[0], fKnee[1], 24 * u, P.ft + P.fs);
  const bKnee = pt(bHip[0], bHip[1], 23 * u, P.bt), bAnk = pt(bKnee[0], bKnee[1], 24 * u, P.bt + P.bs);
  const fEl = pt(fSh[0], fSh[1], 15 * u, P.fu), fHand = pt(fEl[0], fEl[1], 14 * u, P.fu + (P.ff - P.fu) * 0.9);
  const bEl = pt(bSh[0], bSh[1], 15 * u, P.bu), bHand = pt(bEl[0], bEl[1], 14 * u, P.bu + (P.bf - P.bu) * 0.9);
  const headC = pt(neck[0], neck[1], 8.5 * u, Math.PI - P.lean - P.head * 0.5);

  // Jas: holographic wings behind everything
  if (id === 'jas') {
    g.save(); g.globalAlpha = 0.5 + 0.15 * Math.sin(t * 3);
    for (const [sp, len] of [[-0.9, 26], [-0.55, 22], [-0.25, 16]]) {
      const flap = Math.sin(t * 3) * 0.08;
      const tip = pt(sh[0] - 2 * u, sh[1] + 2 * u, len * u, Math.PI + sp - flap - 0.2);
      const gr = g.createLinearGradient(sh[0], sh[1], tip[0], tip[1]); gr.addColorStop(0, 'rgba(255,79,176,0.75)'); gr.addColorStop(1, 'rgba(255,209,234,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sh[0] - 1 * u, sh[1] + 3 * u);
      g.quadraticCurveTo(tip[0] + 6 * u, tip[1] + 6 * u, tip[0], tip[1]); g.quadraticCurveTo(tip[0] + 2 * u, tip[1] + 12 * u, sh[0] - 1 * u, sh[1] + 9 * u); g.fill();
    }
    g.restore();
    // ponytail (behind the head), swaying
    const base = [headC[0] - 4 * u, headC[1] - 5 * u];
    g.fillStyle = L.hair; g.strokeStyle = INK; g.lineWidth = lw;
    g.beginPath(); g.moveTo(base[0] + 1.5 * u, base[1] - 1.5 * u);
    const sw = Math.sin(t * 2.4) * 3 * u, sw2 = Math.sin(t * 2.4 - 0.8) * 5 * u;
    g.bezierCurveTo(base[0] - 9 * u, base[1] + 2 * u + sw * 0.2, base[0] - 10 * u + sw, base[1] + 16 * u, base[0] - 14 * u + sw2, base[1] + 30 * u);
    g.bezierCurveTo(base[0] - 6 * u + sw, base[1] + 20 * u, base[0] - 3 * u, base[1] + 8 * u, base[0] + 1 * u, base[1] + 3 * u);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = L.hairHi; g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(base[0] - 3 * u, base[1] + 4 * u); g.quadraticCurveTo(base[0] - 7 * u + sw, base[1] + 14 * u, base[0] - 10 * u + sw2, base[1] + 24 * u); g.stroke();
  }
  // back limbs (darker)
  seg(g, bHip, bKnee, 3.6 * u, 3.0 * u, L.suitSh, lw); seg(g, bKnee, bAnk, 3.0 * u, 2.4 * u, L.plate, lw);
  boot(g, bAnk, P.bt + P.bs, u, L.bootSh, lw);
  seg(g, bSh, bEl, 2.6 * u, 2.2 * u, L.suitSh, lw); seg(g, bEl, bHand, 2.3 * u, 2.0 * u, L.plate, lw);
  fist(g, bHand, u, L, lw);
  // torso: a tapered body with a chest plate
  const lean = P.lean;
  g.save(); g.translate(hip[0], hip[1]); g.rotate(lean);
  g.beginPath();
  g.moveTo(-4.5 * u, 0); g.lineTo(-5.8 * u, -16 * u); g.quadraticCurveTo(-7 * u, -26 * u, -5 * u, -28.5 * u);
  g.lineTo(5.5 * u, -28.5 * u); g.quadraticCurveTo(7.5 * u, -25 * u, 6 * u, -16 * u); g.lineTo(4.8 * u, 0); g.closePath();
  g.fillStyle = L.suit; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.fillStyle = L.suitSh; g.beginPath(); g.moveTo(-4.5 * u, 0); g.lineTo(-5.8 * u, -16 * u); g.quadraticCurveTo(-7 * u, -26 * u, -5 * u, -28.5 * u); g.lineTo(-2.5 * u, -28.5 * u); g.lineTo(-2 * u, 0); g.closePath(); g.fill();
  // chest plate
  g.beginPath(); g.moveTo(-4.5 * u, -27 * u); g.lineTo(5.8 * u, -27 * u); g.lineTo(5 * u, -18 * u); g.quadraticCurveTo(1 * u, -14.5 * u, -4 * u, -18 * u); g.closePath();
  const cg = g.createLinearGradient(0, -27 * u, 0, -15 * u); cg.addColorStop(0, L.plateHi); cg.addColorStop(1, L.plate); g.fillStyle = cg; g.fill(); g.stroke();
  // belt
  g.fillStyle = L.plate; g.fillRect(-4.8 * u, -4 * u, 9.8 * u, 2.6 * u); g.strokeRect(-4.8 * u, -4 * u, 9.8 * u, 2.6 * u);
  if (id === 'rox') { // glowing speaker core: it thumps with the beat
    const pulse = 1 + 0.12 * Math.max(0, Math.sin(t * 7.2));
    g.save(); g.shadowColor = L.neon; g.shadowBlur = 8 * u;
    g.fillStyle = INK; g.beginPath(); g.arc(1 * u, -21.5 * u, 3.4 * u, 0, TAU); g.fill();
    g.fillStyle = L.neon; g.beginPath(); g.arc(1 * u, -21.5 * u, 2.3 * u * pulse, 0, TAU); g.fill();
    g.fillStyle = L.neon2; g.beginPath(); g.arc(1 * u, -21.5 * u, 0.9 * u, 0, TAU); g.fill(); g.restore();
  } else { // Jas: a heart gem
    g.save(); g.shadowColor = L.neon; g.shadowBlur = 8 * u; g.fillStyle = L.neon;
    g.beginPath(); g.moveTo(1 * u, -18.5 * u); g.bezierCurveTo(-3 * u, -21 * u, -1.5 * u, -25 * u, 1 * u, -23 * u); g.bezierCurveTo(3.5 * u, -25 * u, 5 * u, -21 * u, 1 * u, -18.5 * u); g.fill(); g.restore();
    // flared hip plates (a short armoured skirt)
    g.beginPath(); g.moveTo(-5 * u, -3 * u); g.lineTo(5.2 * u, -3 * u); g.lineTo(8 * u, 5 * u); g.quadraticCurveTo(0, 7.5 * u, -8 * u, 5 * u); g.closePath();
    const sk = g.createLinearGradient(0, -3 * u, 0, 6 * u); sk.addColorStop(0, L.plateHi); sk.addColorStop(1, L.plate); g.fillStyle = sk; g.fill(); g.stroke();
  }
  // neon seams
  neonLine(g, [-3.5 * u, -1 * u], [-4.8 * u, -14 * u], L.neon, lw * 1.1);
  g.restore();
  // shoulder pad (back)
  pad(g, bSh, u, L, lw, 0.85);
  // neck + head
  seg(g, [neck[0], neck[1] + 2 * u], neck, 1.6 * u, 1.6 * u, L.skinSh, lw);
  drawHead(g, id, headC, u, L, lw, t, P.head, pose);
  // front leg
  seg(g, fHip, fKnee, 3.8 * u, 3.1 * u, L.suit, lw); seg(g, fKnee, fAnk, 3.1 * u, 2.5 * u, L.plate, lw);
  neonLine(g, lerpP(fKnee, fAnk, 0.15), lerpP(fKnee, fAnk, 0.8), L.neon, lw * 1.1);
  kneeCap(g, fKnee, u, L, lw);
  boot(g, fAnk, P.ft + P.fs, u, L.boot, lw);
  // front arm, holding the mic
  pad(g, fSh, u, L, lw, 1);
  seg(g, fSh, fEl, 2.7 * u, 2.3 * u, L.suit, lw); seg(g, fEl, fHand, 2.5 * u, 2.1 * u, L.plate, lw);
  neonLine(g, lerpP(fEl, fHand, 0.2), lerpP(fEl, fHand, 0.75), L.neon, lw * 1.1);
  const micA = P.fu + (P.ff - P.fu) * 0.9;
  mic(g, fHand, micA, u, L, lw, pose === 'attack' || pose === 'sing');
  fist(g, fHand, u, L, lw);
  g.restore();
}

function boot(g, a, ang, u, col, lw) {
  g.save(); g.translate(a[0], a[1]); g.rotate(-ang * 0.4);
  g.beginPath(); g.moveTo(-2.6 * u, -3 * u); g.lineTo(2.2 * u, -3 * u); g.quadraticCurveTo(7.5 * u, -1.5 * u, 7.5 * u, 1.5 * u); g.lineTo(-3 * u, 1.5 * u); g.closePath();
  g.fillStyle = col; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK; g.fillRect(-3 * u, 0.6 * u, 10.5 * u, 0.9 * u);
  g.restore();
}
function fist(g, a, u, L, lw) { g.beginPath(); g.arc(a[0], a[1], 2.3 * u, 0, TAU); g.fillStyle = L.plate; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
function kneeCap(g, a, u, L, lw) { g.beginPath(); g.ellipse(a[0] + 0.6 * u, a[1], 2.6 * u, 2.2 * u, 0, 0, TAU); g.fillStyle = L.plateHi; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
function pad(g, a, u, L, lw, k) {
  g.beginPath(); g.ellipse(a[0], a[1] + 0.8 * u, 3.6 * u * k, 2.8 * u * k, -0.2, Math.PI * 0.95, Math.PI * 2.05); g.closePath();
  g.fillStyle = k < 1 ? L.plate : L.plateHi; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
}
function mic(g, hand, ang, u, L, lw, hot) {
  // a slim stage mic pointing along the forearm
  const tip = pt(hand[0], hand[1], 6 * u, ang + 0.15);
  seg(g, hand, tip, 0.9 * u, 1.2 * u, '#2a2f3d', lw);
  g.beginPath(); g.arc(tip[0], tip[1], 1.9 * u, 0, TAU); g.fillStyle = '#c9d0db'; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  if (hot) { g.save(); g.shadowColor = L.neon; g.shadowBlur = 10 * u; g.fillStyle = L.neon2; g.beginPath(); g.arc(tip[0], tip[1], 1.1 * u, 0, TAU); g.fill(); g.restore(); }
}

function drawHead(g, id, c, u, L, lw, t, tilt, pose) {
  g.save(); g.translate(c[0], c[1]); g.rotate(tilt);
  const r = 6.2 * u;
  if (id === 'jas') { // long hair falling behind the shoulders
    g.fillStyle = L.hair; g.beginPath(); g.moveTo(-5.8 * u, -2 * u); g.quadraticCurveTo(-8 * u, 8 * u, -5 * u, 13 * u); g.lineTo(1 * u, 6 * u); g.lineTo(2 * u, -4 * u); g.closePath(); g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  }
  // face: a slim anime head in three-quarter view, chin to the right
  g.beginPath();
  g.moveTo(-r * 0.92, -r * 0.2);
  g.bezierCurveTo(-r * 0.95, -r * 1.15, r * 0.9, -r * 1.2, r * 0.95, -r * 0.25);
  g.bezierCurveTo(r * 1.0, r * 0.35, r * 0.75, r * 0.75, r * 0.32, r * 1.05);
  g.bezierCurveTo(r * 0.05, r * 1.2, -r * 0.55, r * 0.85, -r * 0.8, r * 0.45);
  g.closePath();
  g.fillStyle = L.skin; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  // jaw shade
  g.fillStyle = L.skinSh; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(-r * 0.8, r * 0.45); g.bezierCurveTo(-r * 0.4, r * 0.8, 0, r * 1.0, r * 0.32, r * 1.05); g.bezierCurveTo(-r * 0.1, r * 0.75, -r * 0.5, r * 0.4, -r * 0.8, r * 0.1); g.fill(); g.globalAlpha = 1;
  // ear
  g.beginPath(); g.ellipse(-r * 0.55, r * 0.1, r * 0.17, r * 0.26, 0.2, 0, TAU); g.fillStyle = L.skinSh; g.fill(); g.stroke();
  const blink = (t % 3.7) > 3.58;
  if (id === 'rox') {
    // cyan visor across the eyes
    g.save(); g.shadowColor = L.neon; g.shadowBlur = 6 * u;
    g.beginPath(); g.moveTo(-r * 0.35, -r * 0.18); g.lineTo(r * 1.04, -r * 0.3); g.lineTo(r * 0.98, r * 0.12); g.lineTo(-r * 0.3, r * 0.16); g.closePath();
    const vg = g.createLinearGradient(-r * 0.3, 0, r, 0); vg.addColorStop(0, '#0d6e9c'); vg.addColorStop(0.6, L.neon); vg.addColorStop(1, L.neon2); g.fillStyle = vg; g.fill();
    g.restore(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(r * 0.2, -r * 0.18); g.lineTo(r * 0.8, -r * 0.24); g.stroke();
    // mouth
    g.strokeStyle = INK; g.lineWidth = lw; g.beginPath();
    if (pose === 'attack') { g.ellipse(r * 0.55, r * 0.58, r * 0.16, r * 0.13, 0, 0, TAU); } else { g.moveTo(r * 0.35, r * 0.6); g.lineTo(r * 0.68, r * 0.55); }
    g.stroke();
    // hair: a swept undercut with three spikes going back
    g.fillStyle = L.hair; g.beginPath();
    g.moveTo(-r * 0.95, -r * 0.05); g.lineTo(-r * 1.0, -r * 0.6); g.lineTo(-r * 1.55, -r * 0.95); g.lineTo(-r * 0.75, -r * 1.05);
    g.lineTo(-r * 1.2, -r * 1.45); g.lineTo(-r * 0.2, -r * 1.25); g.lineTo(-r * 0.3, -r * 1.7); g.lineTo(r * 0.5, -r * 1.2);
    g.quadraticCurveTo(r * 1.15, -r * 1.0, r * 1.05, -r * 0.35); g.lineTo(r * 0.55, -r * 0.62); g.lineTo(r * 0.2, -r * 0.45); g.lineTo(-r * 0.25, -r * 0.6); g.lineTo(-r * 0.55, -r * 0.25);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = L.hairHi; g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(-r * 0.6, -r * 1.05); g.quadraticCurveTo(0, -r * 1.2, r * 0.6, -r * 1.0); g.stroke();
  } else {
    // anime eye
    if (blink) { g.strokeStyle = INK; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(r * 0.25, -r * 0.02); g.quadraticCurveTo(r * 0.5, r * 0.08, r * 0.78, -r * 0.04); g.stroke(); }
    else {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(r * 0.52, -r * 0.04, r * 0.27, r * 0.33, 0, 0, TAU); g.fill();
      const ig = g.createLinearGradient(0, -r * 0.35, 0, r * 0.3); ig.addColorStop(0, '#5a1f4a'); ig.addColorStop(1, L.neon);
      g.fillStyle = ig; g.beginPath(); g.ellipse(r * 0.58, 0, r * 0.18, r * 0.27, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(r * 0.52, -r * 0.12, r * 0.07, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = lw * 1.3; g.beginPath(); g.moveTo(r * 0.2, -r * 0.3); g.quadraticCurveTo(r * 0.5, -r * 0.48, r * 0.85, -r * 0.3); g.stroke();
    }
    g.strokeStyle = INK; g.lineWidth = lw; g.beginPath();
    if (pose === 'sing' || pose === 'attack') { g.fillStyle = '#8a2a4a'; g.ellipse(r * 0.55, r * 0.58, r * 0.13, r * 0.17, 0, 0, TAU); g.fill(); } else { g.moveTo(r * 0.4, r * 0.62); g.quadraticCurveTo(r * 0.55, r * 0.7, r * 0.7, r * 0.58); }
    g.stroke();
    g.fillStyle = 'rgba(255,120,160,0.35)'; g.beginPath(); g.ellipse(r * 0.35, r * 0.35, r * 0.17, r * 0.09, 0, 0, TAU); g.fill();
    // bangs and crown of hair, with a pink clip
    g.fillStyle = L.hair; g.strokeStyle = INK; g.lineWidth = lw; g.beginPath();
    g.moveTo(-r * 1.0, r * 0.2); g.quadraticCurveTo(-r * 1.25, -r * 1.25, r * 0.15, -r * 1.3); g.quadraticCurveTo(r * 1.15, -r * 1.2, r * 1.05, -r * 0.2);
    g.lineTo(r * 0.8, -r * 0.55); g.lineTo(r * 0.62, -r * 0.2); g.lineTo(r * 0.38, -r * 0.6); g.lineTo(r * 0.05, -r * 0.3); g.lineTo(-r * 0.1, -r * 0.7); g.lineTo(-r * 0.55, -r * 0.4); g.lineTo(-r * 0.6, r * 0.15);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = L.hairHi; g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(-r * 0.7, -r * 0.9); g.quadraticCurveTo(0, -r * 1.2, r * 0.7, -r * 0.95); g.stroke();
    g.save(); g.shadowColor = L.neon; g.shadowBlur = 5 * u; g.fillStyle = L.neon; g.beginPath(); g.moveTo(-r * 0.5, -r * 1.05); g.lineTo(-r * 0.1, -r * 1.25); g.lineTo(-r * 0.2, -r * 0.85); g.closePath(); g.fill(); g.restore();
  }
  // headset: ear cup + mic boom
  g.fillStyle = id === 'rox' ? '#2a2f3d' : '#ffffff'; g.strokeStyle = INK; g.lineWidth = lw;
  g.beginPath(); g.ellipse(-r * 0.55, r * 0.05, r * 0.3, r * 0.38, 0.2, 0, TAU); g.fill(); g.stroke();
  g.save(); g.shadowColor = L.neon; g.shadowBlur = 4 * u; g.fillStyle = L.neon; g.beginPath(); g.arc(-r * 0.55, r * 0.05, r * 0.12, 0, TAU); g.fill(); g.restore();
  g.strokeStyle = INK; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(-r * 0.4, r * 0.35); g.quadraticCurveTo(r * 0.0, r * 0.95, r * 0.42, r * 0.82); g.stroke();
  g.fillStyle = L.neon; g.beginPath(); g.arc(r * 0.45, r * 0.82, r * 0.09, 0, TAU); g.fill();
  g.restore();
}

export function drawHeroBust(g, id, cx, cy, R) {
  // the fighter drawn big so its head and shoulders fill the circle
  const h = R * 6.2;
  drawFighter(g, id, cx - R * 0.1, cy + h * 0.86, h, 0.6, 'idle');
}
