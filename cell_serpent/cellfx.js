// Drawing for the flagged special cells (agent 14, round 3): ward cell, warded neighbours, lullaby cell.
// Strokes and a few paths only, no gradients, so a snake full of them stays cheap on phones.
const TAU = Math.PI * 2;
const INKC = '#0b1020';

function shield(ctx, x, y, q) {
  ctx.beginPath(); ctx.moveTo(x - q, y - q * 0.8); ctx.lineTo(x + q, y - q * 0.8); ctx.lineTo(x + q, y + q * 0.1); ctx.quadraticCurveTo(x + q * 0.9, y + q * 0.9, x, y + q * 1.2);
  ctx.quadraticCurveTo(x - q * 0.9, y + q * 0.9, x - q, y + q * 0.1); ctx.closePath();
}

export function drawCellFlags(ctx, s, r, t, i, glow) {
  if (s.warded) {   // a thin cyan ring that shimmers: this cell takes half damage right now
    ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 7 + i) * 0.2; ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 5; ctx.setLineDash([r * 0.5, r * 0.28]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.12, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (s.ward) {
    const k = 0.5 + Math.sin(t * 4 + i) * 0.5;
    ctx.save(); ctx.globalAlpha = 0.35 + k * 0.3; ctx.strokeStyle = '#bff3ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, r * (1.45 + k * 0.22), 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (s.drum) glow(s.x, s.y, r * 1.8, '#ff7a3d', 0.3 + Math.abs(Math.sin(t * 6 + i)) * 0.2);
  if (s.lull) glow(s.x, s.y, r * 1.8, '#b79bff', 0.3 + Math.sin(t * 3 + i) * 0.12);
}

// badge drawn over the cell, under the number: a shield for the ward cell, a crescent moon for the lullaby cell
export function drawCellBadge(ctx, s, r, t, i, kit) {
  if (!s.ward && !s.lull && !s.drum) return;
  const bs = (s.ward || s.lull) && kit && kit.SPR.badge && kit.SPR.badge(s.ward ? 'ward' : 'lull');
  if (bs) { kit.blit(ctx, bs, s.x - r * 0.62, s.y - r * 0.7 + Math.sin(t * 3 + i) * 2, r * 1.0, s.lull ? Math.sin(t * 1.5 + i) * 0.14 : 0); return; }
  const q = r * 0.42, x = s.x - r * 0.5, y = s.y - r * 0.78 + Math.sin(t * 3 + i) * 2;
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = INKC; ctx.lineJoin = 'round';
  if (s.ward) { shield(ctx, x, y, q); ctx.fillStyle = '#8fe3ff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - q * 0.45, y); ctx.lineTo(x - q * 0.1, y + q * 0.4); ctx.lineTo(x + q * 0.5, y - q * 0.35); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.stroke(); }
  else if (s.drum) { const k = 1 + Math.max(0, Math.sin(t * 6 + i)) * 0.15; ctx.beginPath(); ctx.ellipse(x, y, q * 1.1 * k, q * 0.8 * k, 0, 0, TAU); ctx.fillStyle = '#ffb27a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - q * 0.9, y - q * 1.3); ctx.lineTo(x + q * 0.2, y - q * 0.1); ctx.moveTo(x + q * 0.9, y - q * 1.3); ctx.lineTo(x - q * 0.2, y - q * 0.1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(x, y, q * 1.05, 0.5, TAU - 0.5); ctx.arc(x + q * 0.55, y - q * 0.1, q * 0.85, TAU - 0.9, 0.9, true); ctx.closePath(); ctx.fillStyle = '#d9c8ff'; ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
