// Hit juice round 11: damage numbers that move like the weapon that hit (a dagger number slides and tilts, a tower number lands
// with a thud, a bubble number wobbles), the armor cell break (a clank on every hit, steel plates when it falls), the bomb blast
// ring with cracks, and the gold cell pop (a fan of spinning coins). Pure draw helpers: no allocations per call, never touches the sim.
const TAU = Math.PI * 2;

// ---- per weapon number motion. out = {dx, dy, rot, sc}; age in seconds since the number appeared, t the renderer clock.
export const NUM_STYLE = {
  capsule: { rot: -0.05, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0 },
  swab: { rot: 0, sx: 5, fx: 9, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0 },
  daggers: { rot: -0.34, sx: 0, fx: 0, slide: 70, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0 },
  tower: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 1, jit: 0, hop: 0, ring: 0, shrink: 0 },
  dragon: { rot: 0, sx: 10, fx: 7, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0, follow: 0.03 },
  needles: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0, small: 0.86 },
  stick: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 1, hop: 0, ring: 0, shrink: 0 },
  bubble: { rot: 0, sx: 8, fx: 6, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0, wob: 1 },
  satellite: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 5, shrink: 0 },
  maw: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0.35 },
  puppy: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 22, ring: 0, shrink: 0 },
  bell: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0, ding: 0.16 },
  encore: { rot: 0, sx: 0, fx: 0, slide: 0, thud: 0, jit: 0, hop: 0, ring: 0, shrink: 0, pulse: 0.12 },
};
export const numStyleOf = src => NUM_STYLE[src] || NUM_STYLE.capsule;

export function numMotion(src, age, t, out) {
  const s = numStyleOf(src);
  let dx = 0, dy = 0, rot = s.rot, sc = s.small || 1;
  if (s.sx) dx += Math.sin(age * s.fx) * s.sx;
  if (s.follow) rot += Math.cos(age * s.fx) * s.sx * s.follow;
  if (s.slide) dx += Math.min(1, age / 0.5) * s.slide;
  if (s.thud) { const q = Math.max(0, 1 - age / 0.16); sc *= 1 + 0.55 * q; dy += Math.sin(age * 70) * 5 * q; }   // lands heavy: big, shaking, then settles
  if (s.jit) { dx += Math.sin(age * 83) * 2.4; dy += Math.cos(age * 97) * 2; rot += Math.sin(age * 61) * 0.09; }
  if (s.hop) dy -= Math.abs(Math.sin(age * 11)) * s.hop * Math.max(0, 1 - age * 1.3);
  if (s.ring) { dx += Math.cos(age * 14) * s.ring; dy += Math.sin(age * 14) * s.ring; }
  if (s.shrink) sc *= 1 - s.shrink * Math.min(1, age / 0.7);
  if (s.wob) sc *= 1 + Math.sin(age * 18) * 0.07;
  if (s.ding) rot += Math.sin(age * 26) * s.ding * Math.max(0, 1 - age * 2);
  if (s.pulse) sc *= 1 + Math.sin(t * 16 + age * 9) * s.pulse;
  out.dx = dx; out.dy = dy; out.rot = rot; out.sc = sc;
  return out;
}

// ---- new marks
export const KINDS11 = ['clank', 'plates', 'blast', 'goldburst', 'volley'];
export const isKind11 = k => k === 'clank' || k === 'plates' || k === 'blast' || k === 'goldburst' || k === 'volley';
const STEEL = ['#e4ebf5', '#aab6c8', '#7d8aa0'];

function star4(c, r) { c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0); c.quadraticCurveTo(r * 0.14, r * 0.14, 0, r); c.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0); c.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r); c.closePath(); }

// m: {x,y,r,rot,col,seed,t}; the caller translated to m.x, m.y and set the alpha to 1 - k. k 0..1, a = 1 - k.
export function drawMark11(c, m, k, a, glow) {
  switch (m.k) {
    case 'clank': {   // a hit on an armor plate: a bright cross flash, a steel ring and two sparks that skip off
      c.lineCap = 'round'; c.strokeStyle = '#dfe8f6'; c.lineWidth = 3 * a + 1; c.beginPath(); c.arc(0, 0, m.r * (0.3 + 0.7 * k), 0, TAU); c.stroke();
      c.fillStyle = '#fff'; c.rotate(m.rot); star4(c, m.r * 0.75 * (1 - k * 0.6)); c.fill();
      c.fillStyle = '#10131c';
      for (let i = 0; i < 2; i++) { const d = m.t * (150 + i * 70) * (i ? -1 : 1); c.fillRect(d - 2.6, -m.t * 120 + 120 * m.t * m.t * (3 + i) - 2.6, 5.2, 5.2); }
      c.fillStyle = '#e4ebf5';
      for (let i = 0; i < 2; i++) { const d = m.t * (150 + i * 70) * (i ? -1 : 1); c.fillRect(d - 1.6, -m.t * 120 + 120 * m.t * m.t * (3 + i) - 1.6, 3.2, 3.2); }
      break;
    }
    case 'plates': {   // the armor falls apart: rivetted steel plates tumble away, a dull ring and a sharp glint
      c.lineCap = 'round'; c.strokeStyle = '#aab6c8'; c.lineWidth = 6 * a + 1; c.beginPath(); c.arc(0, 0, m.r * (0.4 + 0.9 * (1 - a * a)), 0, TAU); c.stroke();
      for (let i = 0; i < 5; i++) {
        const an = i / 5 * TAU + m.seed, v = 150 + (i % 3) * 45, x = Math.cos(an) * v * m.t, y = Math.sin(an) * v * m.t - 40 * m.t + 560 * m.t * m.t;
        c.save(); c.translate(x, y); c.rotate(an + m.t * (9 + i * 2) * (i & 1 ? 1 : -1));
        const w = m.r * 0.65 * (0.75 + 0.1 * i), h = w * 0.62;
        c.fillStyle = '#10131c'; c.fillRect(-w - 1.5, -h - 1.5, 2 * w + 3, 2 * h + 3);
        c.fillStyle = STEEL[i % 3]; c.fillRect(-w, -h, 2 * w, 2 * h);
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-w, -h, 2 * w, h * 0.45);
        c.fillStyle = '#4a5468'; c.beginPath(); c.arc(w * 0.55, h * 0.3, 1.8, 0, TAU); c.fill();
        c.restore();
      }
      if (k < 0.35) { c.globalAlpha = (1 - k / 0.35) * a; c.fillStyle = '#fff'; c.rotate(0.4); star4(c, m.r * 1.1); c.fill(); }
      break;
    }
    case 'blast': {   // a bomb: a hot flash, a dark scorched ring racing out with jagged cracks, a thin shock ring behind it
      const e = 1 - a * a * a, R = m.r * (0.2 + 0.8 * e);
      if (k < 0.3) { c.globalAlpha = (1 - k / 0.3) * a; c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(0, 0, m.r * 0.55 * (0.4 + k * 2.4), 0, TAU); c.fill(); c.globalAlpha = a; }
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#2a1a1a'; c.lineWidth = 16 * a + 2; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
      c.strokeStyle = '#ff9a3d'; c.lineWidth = 7 * a + 1; c.beginPath(); c.arc(0, 0, R * 0.97, 0, TAU); c.stroke();
      c.strokeStyle = '#fff2c8'; c.lineWidth = 2.5 * a + 0.5; c.beginPath(); c.arc(0, 0, R * 0.7, 0, TAU); c.stroke();
      c.strokeStyle = '#ffd24a'; c.lineWidth = 3 * a + 1; c.beginPath();
      for (let i = 0; i < 9; i++) { const an = i / 9 * TAU + m.seed, r0 = R * 0.35, r1 = R * (0.62 + 0.3 * ((i * 7) % 5) / 5), j = 0.16 * (i & 1 ? 1 : -1);
        c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); c.lineTo(Math.cos(an + j) * (r0 + r1) * 0.5, Math.sin(an + j) * (r0 + r1) * 0.5); c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); }
      c.stroke();
      break;
    }
    case 'volley': {   // b12: an aimed volley in a circle stage: three chevron arcs race out along the aim, with thin spokes between them
      c.rotate(m.rot); c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const kk = Math.max(0, Math.min(1, k * 1.5 - i * 0.18)); if (kk <= 0 || kk >= 1) continue;
        const r = 26 + m.r * kk * (0.55 + i * 0.22), w = 0.5 - 0.22 * kk;
        c.globalAlpha = (1 - kk) * 0.75; c.strokeStyle = i === 0 ? '#ffffff' : '#7fe9ff'; c.lineWidth = 4.5 * (1 - kk) + 1;
        c.beginPath(); c.arc(0, 0, r, -w, w); c.stroke();
      }
      c.globalAlpha = a * 0.6; c.strokeStyle = '#bff6ff'; c.lineWidth = 2; c.beginPath();
      for (let i = -2; i <= 2; i++) { const an = i * 0.16, r0 = 30 + 40 * k, r1 = r0 + 34 * a + 6; c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); }
      c.stroke();
      break;
    }
    case 'goldburst': {   // a gold cell pops: coins fan out spinning and fall, with a warm shine at the centre
      glow(0, 0, m.r * 1.5 * (1 - k * 0.5), '#ffd24a', 0.6 * a);
      c.fillStyle = '#fff6c2'; c.rotate(k * 1.5); star4(c, m.r * (0.9 - k * 0.5)); c.fill(); c.rotate(-k * 1.5);
      for (let i = 0; i < 8; i++) {
        const an = -Math.PI / 2 + (i - 3.5) / 8 * 2.6 + (i & 1 ? 0.05 : -0.05), v = 300 + (i % 3) * 70, x = Math.cos(an) * v * m.t, y = Math.sin(an) * v * m.t + 640 * m.t * m.t;
        const sw = Math.abs(Math.cos(m.t * 14 + i)), rr = 9 + (i & 1) * 2;
        c.fillStyle = '#7a4a00'; c.beginPath(); c.ellipse(x, y, rr * sw + 1.6, rr + 1.6, 0, 0, TAU); c.fill();
        c.fillStyle = i & 1 ? '#ffe36b' : '#ffd24a'; c.beginPath(); c.ellipse(x, y, rr * sw, rr, 0, 0, TAU); c.fill();
        c.fillStyle = '#fff6c2'; c.beginPath(); c.ellipse(x - rr * sw * 0.25, y - rr * 0.3, rr * sw * 0.3, rr * 0.28, 0, 0, TAU); c.fill();
      }
      break;
    }
  }
}
