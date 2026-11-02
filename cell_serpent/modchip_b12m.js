// 12m: the stage twist label on the intro card ("Armored", "Swift", ...) as a solid chip with a drawn icon, instead of faint gold text.
// Contrast: the chip is near black (#0b1020 at .82) under #ffe27a text (well over 4.5:1). Drawn only while the card is up.
const INK = '#0b1020', TAU = Math.PI * 2;
function icon(g, kind, x, y, q) {
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = INK;
  if (kind === 'armored') { g.beginPath(); g.moveTo(-q, -q * 0.8); g.lineTo(q, -q * 0.8); g.lineTo(q, 0); g.quadraticCurveTo(q, q * 0.8, 0, q * 1.15); g.quadraticCurveTo(-q, q * 0.8, -q, 0); g.closePath(); g.fillStyle = '#aebbd6'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -q * 0.6); g.lineTo(0, q * 0.8); g.moveTo(-q * 0.6, -q * 0.05); g.lineTo(q * 0.6, -q * 0.05); g.strokeStyle = '#5b6d94'; g.lineWidth = 2.4; g.stroke(); }
  else if (kind === 'swift') { g.beginPath(); g.moveTo(q * 0.25, -q * 1.1); g.lineTo(-q * 0.7, q * 0.15); g.lineTo(-q * 0.05, q * 0.15); g.lineTo(-q * 0.3, q * 1.1); g.lineTo(q * 0.7, -q * 0.25); g.lineTo(q * 0.05, -q * 0.25); g.closePath(); g.fillStyle = '#ffe27a'; g.fill(); g.stroke(); }
  else if (kind === 'boomy') { g.beginPath(); g.arc(0, q * 0.2, q * 0.85, 0, TAU); g.fillStyle = '#ff4d6d'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(q * 0.4, -q * 0.5); g.lineTo(q * 0.8, -q * 1.0); g.strokeStyle = '#ffe27a'; g.stroke(); }
  else if (kind === 'rich') { g.beginPath(); g.arc(0, 0, q * 0.95, 0, TAU); g.fillStyle = '#ffd24a'; g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, q * 0.5, 0, TAU); g.strokeStyle = '#b9760f'; g.lineWidth = 2.2; g.stroke(); }
  else { g.beginPath(); g.moveTo(0, -q * 1.1); g.lineTo(q * 0.95, 0); g.lineTo(0, q * 1.1); g.lineTo(-q * 0.95, 0); g.closePath(); g.fillStyle = '#9bffe0'; g.fill(); g.stroke(); }
  g.restore();
}
// x is the left edge, y the vertical centre. mk is the fade-in 0..1. Returns nothing.
export function drawModChipB12m(g, name, x, y, mk) {
  if (!name || !(mk > 0)) return;
  const kind = String(name).toLowerCase(), size = 28, padL = 50, padR = 18, h = 46;
  g.save(); g.globalAlpha *= mk;
  g.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = padL + g.measureText(name).width + padR;
  g.beginPath(); if (g.roundRect) g.roundRect(x - 6, y - h / 2, w, h, h / 2); else g.rect(x - 6, y - h / 2, w, h);
  g.fillStyle = 'rgba(11,16,32,.82)'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ffd24a'; g.stroke();
  icon(g, kind, x + 22, y, 12);
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#ffe27a'; g.fillText(name, x + padL - 6, y + 1.5);
  g.restore();
}
