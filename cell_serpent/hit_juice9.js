// Hit juice round 9: the impact and pop looks the weapons were missing (Dove Squad feathers, Duckling soap pops, puppy paw
// stamps, bell dings, Encore sparkles, capsule note bursts) and the cell chips that fly off every hit.
// Pure draw helpers called from the mark loop in hitjuice.js: render-only, no allocations, never touches the sim.
const TAU = Math.PI * 2;

// the weapons that get their own mark here (everything else keeps its round 1 to 8 look)
export const NEW_KINDS = ['shock', 'feather', 'bpop', 'paw', 'ding', 'twink', 'chip'];
export const isNewKind = k => NEW_KINDS.indexOf(k) >= 0;

// colour of the chips a hit knocks off, per weapon
export const CHIP_COL = { capsule: '#ffd23a', swab: '#ffc4e4', daggers: '#e8f4ff', tower: '#ffb15a', dragon: '#ffffff', needles: '#a8f0ff', stick: '#fff08a', bubble: '#bfe9ff', satellite: '#9db4ff', maw: '#c79bff', puppy: '#ffe0b0', bell: '#ffd9a0', encore: '#fff2a0' };

function star4(c, r) { c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0); c.quadraticCurveTo(r * 0.14, r * 0.14, 0, r); c.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0); c.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r); c.closePath(); }

// m: a mark {x,y,r,vx,vy,rot,col,seed,n}; the caller already translated to m.x, m.y and set the alpha to 1 - k.
// k 0..1 age, a = 1 - k. glow(x, y, r, col, alpha) is the renderer's soft light.
export function drawMark9(c, m, k, a, glow) {
  switch (m.k) {
    case 'shock': {   // a chain milestone (every 5th kill): a fat ring sweeps out with a crown of ticks and a lagging echo
      const e = 1 - a * a * a, R = m.r * (0.15 + 0.85 * e);
      c.lineCap = 'round'; c.strokeStyle = m.col; c.lineWidth = 12 * a + 2; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 4 * a + 1; c.beginPath(); c.arc(0, 0, R * 0.78, 0, TAU); c.stroke();
      c.strokeStyle = m.col; c.lineWidth = 5 * a + 1; c.beginPath();
      for (let i = 0; i < 16; i++) { const an = i / 16 * TAU + m.rot, r0 = R * 1.06, r1 = R * (1.06 + 0.16 * a); c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); }
      c.stroke();
      break;
    }
    case 'feather': {   // a white dove feather drifts down, swaying, with a faint green edge
      const sway = Math.sin(m.t * 11 + m.seed) * 7, x = m.vx * m.t + sway, y = m.vy * m.t + 90 * m.t * m.t;
      c.translate(x, y); c.rotate(m.rot + Math.sin(m.t * 9 + m.seed) * 0.7);
      const L = m.r;
      c.fillStyle = 'rgba(40,70,60,.55)'; c.beginPath(); c.ellipse(0, 0, L * 0.4 + 1.6, L + 1.6, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -L); c.quadraticCurveTo(L * 0.62, -L * 0.2, 0, L); c.quadraticCurveTo(-L * 0.62, -L * 0.2, 0, -L); c.fill();
      c.strokeStyle = '#9dff6d'; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -L * 0.8); c.lineTo(0, L * 0.9); c.stroke();
      break;
    }
    case 'bpop': {   // a soap bubble pops: the film ring grows and thins, glints spin off and droplets fly out
      const R = m.r * (0.35 + 0.85 * (1 - a * a));
      c.lineCap = 'round'; c.fillStyle = 'rgba(214,242,255,.22)'; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.strokeStyle = '#ff9ad6'; c.lineWidth = 5.5 * a + 1.4; c.beginPath(); c.arc(0, 0, R, -0.3, 1.9); c.stroke();
      c.strokeStyle = '#6fe3ff'; c.beginPath(); c.arc(0, 0, R, 2.3, 4.6); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2 * a + 0.6; c.beginPath(); c.arc(0, 0, R * 0.8, 3.5, 4.4); c.stroke();
      c.fillStyle = '#e8fbff';
      for (let i = 0; i < 5; i++) { const an = i / 5 * TAU + m.seed, d = R * (0.9 + k * 0.9); c.beginPath(); c.arc(Math.cos(an) * d, Math.sin(an) * d + k * k * 14, 2.6 * a + 0.8, 0, TAU); c.fill(); }
      break;
    }
    case 'paw': {   // a puppy paw print stamps down, holds, fades
      const pop = k < 0.2 ? 0.4 + 3 * k : 1;
      c.rotate(m.rot); c.scale(m.r * pop / 20, m.r * pop / 20);
      c.fillStyle = '#10131c'; pawPath(c, 1.18); c.fill();
      c.fillStyle = m.col; pawPath(c, 1); c.fill();
      break;
    }
    case 'ding': {   // a bell struck: a bronze ring, a cross sparkle and two thin echo rings
      c.strokeStyle = m.col; c.lineWidth = 4 * a + 1; c.beginPath(); c.arc(0, 0, m.r * (0.3 + k * 0.7), 0, TAU); c.stroke();
      c.globalAlpha = a * 0.7; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, m.r * (0.15 + k * 0.45), 0, TAU); c.stroke();
      c.globalAlpha = a; c.fillStyle = '#fff'; c.rotate(0.3); star4(c, m.r * 0.5 * (1 - k * 0.5)); c.fill();
      break;
    }
    case 'twink': {   // gold sparkles that rise and spin (Encore beam, bell chime)
      c.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); c.rotate(m.rot + k * 2);
      glow(0, 0, m.r * 1.8, m.col, 0.45 * a); c.fillStyle = '#fff'; star4(c, m.r * (0.4 + 0.6 * a)); c.fill();
      c.fillStyle = m.col; star4(c, m.r * 0.5 * a); c.fill();
      break;
    }
    case 'chip': {   // a little piece knocked off the cell: tumbles and falls with a dark edge so it reads on any cell colour
      c.translate(m.vx * m.t, m.vy * m.t + 520 * m.t * m.t); c.rotate(m.rot + m.t * 14 * (m.seed > 3 ? 1 : -1));
      const s = m.r * (0.5 + 0.5 * a);
      c.fillStyle = '#10131c'; c.fillRect(-s - 1.2, -s * 0.7 - 1.2, 2 * s + 2.4, 1.4 * s + 2.4);
      c.fillStyle = m.col; c.fillRect(-s, -s * 0.7, 2 * s, 1.4 * s);
      break;
    }
  }
}

function pawPath(c, s) {
  c.beginPath();
  c.ellipse(0, 5 * s, 8.5 * s, 7 * s, 0, 0, TAU);
  c.moveTo(-12 * s + 4 * s, -4 * s); c.ellipse(-12 * s, -4 * s, 3.8 * s, 5 * s, -0.3, 0, TAU);
  c.moveTo(-4 * s + 3.8 * s, -12 * s); c.ellipse(-4 * s, -12 * s, 3.8 * s, 5 * s, -0.1, 0, TAU);
  c.moveTo(4 * s + 3.8 * s, -12 * s); c.ellipse(4 * s, -12 * s, 3.8 * s, 5 * s, 0.1, 0, TAU);
  c.moveTo(12 * s + 3.8 * s, -4 * s); c.ellipse(12 * s, -4 * s, 3.8 * s, 5 * s, 0.3, 0, TAU);
}
