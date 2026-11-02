// 05-screen-feel (round 7): the stage title card gives every serpent species its own entrance. pose() moves the portrait
// (drop, sway, shiver, hop), draw() adds a few cheap shapes around it (hearts, z's, snow, coins). No allocations per frame:
// the pose object is reused and every shape is a plain arc or a short line.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const P = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

// where a species' portrait is at card time t (seconds since the card began; the portrait is fully in after 0.52)
export function cardPose(skin, t) {
  const u = clamp((t - 0.12) / 0.4, 0, 1), d = 1 - u;   // d: 1 while arriving, 0 once settled
  P.dx = 0; P.dy = 0; P.rot = 0; P.sx = 1; P.sy = 1;
  const late = Math.max(0, t - 0.5);
  switch (skin) {
    case 'love': { const k = 1 + 0.07 * Math.sin(t * 9) * Math.exp(-late * 0.7); P.sx = k; P.sy = k; break; }
    case 'rust': P.rot = Math.sin(t * 34) * 0.07 * d + Math.sin(t * 5) * 0.03; P.dy = -d * 26; break;
    case 'sneezy': { const w = t - 0.85; if (w > 0 && w < 0.55) { const a = w < 0.3 ? w / 0.3 : 1 - (w - 0.3) / 0.25; P.dx = 12 * Math.max(0, 1 - Math.abs(w - 0.34) * 4) - (w < 0.3 ? 5 * a : 0); P.sx = 1 + 0.1 * (w < 0.3 ? -a : a * 0.6); P.sy = 1 - P.sx + 1; } else { P.dx = Math.sin(t * 25) * 2.4 * d; } break; }
    case 'grumpy': { P.dy = -d * d * 90; if (u >= 1) { const q = Math.max(0, 1 - late * 4); P.sx = 1 + 0.2 * q; P.sy = 1 - 0.2 * q; } break; }
    case 'sleepy': P.rot = Math.sin(t * 2.1) * 0.13; P.dy = 5 + Math.sin(t * 2.1) * 3 - d * 10; break;
    case 'disco': P.rot = (t < 0.7 ? d * TAU : 0) + Math.sin(t * 4) * 0.05; break;
    case 'sour': { const q = Math.exp(-late * 2.4); P.sx = 1 - 0.14 * Math.sin(late * 15) * q; P.sy = 1 + 0.14 * Math.sin(late * 15) * q; break; }
    case 'mighty': P.dy = -d * d * d * 150; if (u >= 1) { const q = Math.max(0, 1 - late * 3.5); P.sx = 1 + 0.26 * q; P.sy = 1 - 0.26 * q; } break;
    case 'frosty': P.dx = Math.sin(t * 46) * (1.6 + 2.5 * d); P.dy = Math.sin(t * 3) * 2; break;
    case 'piggy': { const h = Math.abs(Math.sin(t * 5.2)) * Math.exp(-late * 0.9); P.dy = -h * 18 - d * 14; P.sx = 1 + 0.05 * (1 - h); P.sy = 1 - 0.05 * (1 - h); break; }
    case 'gloomy': P.dy = 8 - d * 6 + Math.sin(t * 1.6) * 2; P.rot = -0.05; P.sx = 0.97; break;
    default: break;
  }
  return P;
}

// small shapes around the portrait centre (cx, cy), r is the head radius, col the species colour; a is the card's opacity so far
export function cardFlair(ctx, skin, t, cx, cy, r, col) {
  if (t < 0.2) return;
  ctx.save();
  ctx.lineCap = 'round';
  switch (skin) {
    case 'love':
      for (let i = 0; i < 5; i++) { const q = ((t * 0.7 + i * 0.2) % 1), x = cx + (i - 2) * 22 + Math.sin(q * 6 + i) * 8, y = cy - r * 0.5 - q * 110; ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9; heart(ctx, x, y, 7 + (i % 2) * 3, '#ff7eb6'); }
      break;
    case 'rust':
      for (let i = 0; i < 7; i++) { const q = (t * 1.3 + i * 0.37) % 1, a = i * 2.4 + 0.5, x = cx + Math.cos(a) * (r * 0.8 + q * 60), y = cy + Math.sin(a) * (r * 0.8 + q * 60) * 0.7; ctx.globalAlpha = (1 - q) * 0.9; ctx.fillStyle = i % 2 ? '#ffd84d' : '#ff9a3d'; ctx.beginPath(); ctx.arc(x, y, 3.2 * (1 - q) + 1, 0, TAU); ctx.fill(); }
      break;
    case 'sneezy': {
      const w = t - 1.15; if (w > 0 && w < 0.7) for (let i = 0; i < 7; i++) { const a = -0.5 + i * 0.17, v = 60 + i * 24, x = cx + r * 0.5 + Math.cos(a) * v * w * 2.2, y = cy + r * 0.3 + Math.sin(a) * v * w * 2.2 + 90 * w * w; ctx.globalAlpha = 1 - w / 0.7; ctx.fillStyle = '#bfe9ff'; ctx.beginPath(); ctx.arc(x, y, 4 - i * 0.3, 0, TAU); ctx.fill(); }
      break;
    }
    case 'grumpy':
      if (t > 0.5 && t < 1.1) { const q = (t - 0.5) / 0.6; ctx.globalAlpha = 1 - q; ctx.strokeStyle = '#cdeaff'; ctx.lineWidth = 6 * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.95, r * (0.9 + q * 1.3), r * (0.2 + q * 0.2), 0, 0, TAU); ctx.stroke(); }
      for (let i = 0; i < 3; i++) { const q = (t * 1.1 + i * 0.33) % 1; ctx.globalAlpha = (1 - q) * 0.6; ctx.fillStyle = '#3a4a6a'; ctx.beginPath(); ctx.arc(cx + (i - 1) * 28, cy - r - q * 40, 6 + q * 8, 0, TAU); ctx.fill(); }
      break;
    case 'sleepy':
      for (let i = 0; i < 3; i++) { const q = (t * 0.55 + i * 0.33) % 1; ctx.globalAlpha = Math.sin(q * Math.PI) * 0.95; ctx.fillStyle = '#e8ddff'; ctx.strokeStyle = '#2a1a5a'; ctx.lineWidth = 3; ctx.font = `800 ${16 + i * 6}px system-ui, sans-serif`; const x = cx + r * 0.7 + q * 36, y = cy - r * 0.6 - q * 70; ctx.strokeText('z', x, y); ctx.fillText('z', x, y); }
      break;
    case 'disco':
      for (let i = 0; i < 4; i++) { const a = t * 2.2 + i * TAU / 4, x = cx + Math.cos(a) * (r + 22), y = cy + Math.sin(a) * (r * 0.8 + 16), s = 6 + 3 * Math.sin(t * 8 + i * 2); ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 8 + i); spark(ctx, x, y, s, i % 2 ? '#ff7eb6' : '#fff'); }
      break;
    case 'sour':
      for (let i = 0; i < 4; i++) { const q = (t * 0.9 + i * 0.25) % 1, x = cx + (i % 2 ? 1 : -1) * (r * 0.9 + q * 14) , y = cy - r * 0.2 + q * 50 * (1 + i * 0.1); ctx.globalAlpha = (1 - q) * 0.9; drop(ctx, x, y, 6, '#b7f0a8'); }
      break;
    case 'mighty':
      if (t > 0.45 && t < 1.05) { const q = (t - 0.45) / 0.6; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.globalAlpha = (1 - q) * 0.7; ctx.fillStyle = '#d3def2'; ctx.beginPath(); ctx.arc(cx + s * (r * 0.9 + q * (50 + i * 22)), cy + r * 0.8 - q * (10 + i * 12), 8 + q * 12 - i * 2, 0, TAU); ctx.fill(); } }
      break;
    case 'frosty':
      for (let i = 0; i < 8; i++) { const q = (t * 0.5 + i * 0.125) % 1, x = cx + ((i * 53) % 150) - 75 + Math.sin(q * 9 + i) * 8, y = cy - r * 1.1 + q * r * 2.6; ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9; spark(ctx, x, y, 4 + (i % 3), '#fff'); }
      break;
    case 'piggy':
      for (let i = 0; i < 3; i++) { const q = (t * 0.8 + i * 0.33) % 1, x = cx + r * 0.7 + (i - 1) * 24 + q * 26, y = cy - r * 0.2 - Math.sin(q * Math.PI) * 70; ctx.globalAlpha = 1 - q * q; coin(ctx, x, y, 8, Math.abs(Math.cos(t * 9 + i * 2))); }
      break;
    case 'gloomy':
      for (let i = 0; i < 9; i++) { const q = (t * 1.5 + i * 0.111) % 1, x = cx - 100 + i * 25 + ((i * 7) % 5), y = cy - 100 + q * 200; ctx.globalAlpha = (1 - q) * 0.5; ctx.strokeStyle = '#a58be0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 10); ctx.stroke(); }
      break;
    default: break;
  }
  ctx.restore();
  void col;
}

function heart(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.6, y - s * 1.1, x, y - s * 0.3); ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); ctx.fill(); }
function spark(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.lineTo(x + s * 0.4, y - s * 0.4); ctx.lineTo(x + s * 1.5, y); ctx.lineTo(x + s * 0.4, y + s * 0.4); ctx.lineTo(x, y + s * 1.5); ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.lineTo(x - s * 1.5, y); ctx.lineTo(x - s * 0.4, y - s * 0.4); ctx.closePath(); ctx.fill(); }
function drop(ctx, x, y, s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s, y + s * 0.2, x, y + s); ctx.quadraticCurveTo(x - s, y + s * 0.2, x, y - s); ctx.fill(); }
function coin(ctx, x, y, s, w) { ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = '#8a5a06'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, Math.max(1.5, s * w), s, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
