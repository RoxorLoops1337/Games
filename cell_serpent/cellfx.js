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
  if (s.gloom) glow(s.x, s.y, r * 1.9, '#6a3fd0', 0.42 + Math.sin(t * 5 + i) * 0.12);   // gloomy boss: a storm cloud sits on these cells
  if (s.drum) glow(s.x, s.y, r * 1.8, '#ff7a3d', 0.3 + Math.abs(Math.sin(t * 6 + i)) * 0.2);
  if (s.lull) glow(s.x, s.y, r * 1.8, '#b79bff', 0.3 + Math.sin(t * 3 + i) * 0.12);
  if (s.choir) glow(s.x, s.y, r * 1.9, '#ffd0ec', 0.3 + Math.sin(t * 2.4 + i) * 0.12);
  if (s.frost) { glow(s.x, s.y, r * 1.9, '#bfe9ff', 0.45 + Math.sin(t * 4 + i) * 0.12); ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = t * 0.6 + k * 2.094; ctx.moveTo(s.x + Math.cos(a) * r * 0.5, s.y + Math.sin(a) * r * 0.5); ctx.lineTo(s.x + Math.cos(a) * r * 1.35, s.y + Math.sin(a) * r * 1.35); } ctx.stroke(); ctx.restore(); }
  if (s.bell) glow(s.x, s.y, r * 1.8, '#ffd9a0', 0.32 + Math.abs(Math.sin(t * 3 + i)) * 0.2);
  if (s.quartet) glow(s.x, s.y, r * 1.7, '#6fffd2', 0.28 + Math.abs(Math.sin(t * 5 + i)) * 0.2);
}

// Quartet links (agent 14, round 5): a dashed ribbon joins the four linked cells; once the first one pops the
// ribbon turns hot and every survivor wears a countdown ring. Called once per snake, behind the cells.
export function drawQuartetLinks(ctx, sn, t) {
  let px = 0, py = 0, n = 0;
  const hot = sn.qT > 0, k = hot ? Math.max(0, sn.qT / (sn.qWin || 2)) : 1;
  ctx.save(); ctx.lineCap = 'round';
  for (const s of sn.segs) {
    if (!s.quartet || s.hp <= 0) continue;
    if (n && Math.hypot(s.x - px, s.y - py) < 400) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(s.x, s.y); ctx.lineWidth = hot ? 7 : 4; ctx.strokeStyle = hot ? (k < 0.35 ? '#ff6a8a' : '#fff6a8') : '#6fffd2'; ctx.globalAlpha = hot ? 0.9 : 0.55; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -t * (hot ? 90 : 26); ctx.stroke(); }
    px = s.x; py = s.y; n++;
  }
  ctx.setLineDash([]);
  // r6: a bead of light runs down every ribbon link (faster once it is hot), so the four read as one linked chord
  { let qx = 0, qy = 0, m = 0, u = 0; ctx.lineWidth = 2.5; ctx.strokeStyle = INKC;
    for (const s of sn.segs) {
      if (!s.quartet || s.hp <= 0) continue;
      if (m && Math.hypot(s.x - qx, s.y - qy) < 400) { const f = (t * (hot ? 1.6 : 0.6) + u * 0.37) % 1, bx = qx + (s.x - qx) * f, by = qy + (s.y - qy) * f, bs = hot ? 6.5 : 5; ctx.globalAlpha = 1; ctx.fillStyle = hot ? '#fff6a8' : '#e8fff8'; ctx.beginPath(); ctx.moveTo(bx, by - bs); ctx.lineTo(bx + bs, by); ctx.lineTo(bx, by + bs); ctx.lineTo(bx - bs, by); ctx.closePath(); ctx.fill(); ctx.stroke(); u++; }
      qx = s.x; qy = s.y; m++;
    } }
  if (hot) for (const s of sn.segs) if (s.quartet && s.hp > 0) { ctx.globalAlpha = 0.95; ctx.lineWidth = 6; ctx.strokeStyle = k < 0.35 ? '#ff6a8a' : '#fff6a8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke(); }
  ctx.restore();
}

// Boss phase 2 dash lane: the stretch of the path the head is about to rush down glows and ticks, then fades as it dashes.
export function drawDashLane(ctx, path, pointAt, sn, t) {
  const L = sn.lane; if (!L || (sn.surge !== 'warn' && sn.surge !== 'go')) return;
  const warn = sn.surge === 'warn', k = warn ? Math.max(0, 1 - sn.surgeT / L.w) : Math.max(0, 1 - sn.surgeT / 1.1);
  const a = Math.max(0, Math.min(path.len, warn ? L.a : sn.segs[0].ps)), b = Math.min(path.len, L.b), N = 16;
  if (b - a < 8) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const trace = () => { ctx.beginPath(); for (let j = 0; j <= N; j++) { const q = pointAt(path, a + (b - a) * j / N); j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } };
  const pulse = warn ? 0.55 + 0.45 * Math.sin(t * (10 + k * 22)) : 0.5 * (1 - k);
  trace(); ctx.globalAlpha = (warn ? 0.14 + k * 0.2 : 0.2 * (1 - k)); ctx.lineWidth = 64; ctx.strokeStyle = '#ff7a3d'; ctx.stroke();
  ctx.globalAlpha = Math.max(0, pulse) * (warn ? 0.4 + k * 0.5 : 1); ctx.lineWidth = 6; ctx.strokeStyle = '#ffe2c2'; ctx.setLineDash([16, 14]); ctx.lineDashOffset = -t * 120; trace(); ctx.stroke(); ctx.setLineDash([]);
  if (warn) { const q = pointAt(path, b), q2 = pointAt(path, b - 14), ang = Math.atan2(q.y - q2.y, q.x - q2.x); ctx.globalAlpha = 0.5 + k * 0.5; ctx.fillStyle = '#ff7a3d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.translate(q.x, q.y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-14, -22); ctx.lineTo(-14, 22); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

// badge drawn over the cell, under the number: a shield for the ward cell, a crescent moon for the lullaby cell
export function drawCellBadge(ctx, s, r, t, i, kit) {
  if (!s.ward && !s.lull && !s.drum && !s.choir && !s.quartet && !s.bell) return;
  const bs = (s.ward || s.lull) && !s.quartet && !s.choir && kit && kit.SPR.badge && kit.SPR.badge(s.ward ? 'ward' : 'lull');
  if (bs) { kit.blit(ctx, bs, s.x - r * 0.62, s.y - r * 0.7 + Math.sin(t * 3 + i) * 2, r * 1.0, s.lull ? Math.sin(t * 1.5 + i) * 0.14 : 0); return; }
  const q = r * 0.42, x = s.x - r * 0.5, y = s.y - r * 0.78 + Math.sin(t * 3 + i) * 2;
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = INKC; ctx.lineJoin = 'round';
  if (s.ward) { shield(ctx, x, y, q); ctx.fillStyle = '#8fe3ff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - q * 0.45, y); ctx.lineTo(x - q * 0.1, y + q * 0.4); ctx.lineTo(x + q * 0.5, y - q * 0.35); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.stroke(); }
  else if (s.drum) { const k = 1 + Math.max(0, Math.sin(t * 6 + i)) * 0.15; ctx.beginPath(); ctx.ellipse(x, y, q * 1.1 * k, q * 0.8 * k, 0, 0, TAU); ctx.fillStyle = '#ffb27a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - q * 0.9, y - q * 1.3); ctx.lineTo(x + q * 0.2, y - q * 0.1); ctx.moveTo(x + q * 0.9, y - q * 1.3); ctx.lineTo(x - q * 0.2, y - q * 0.1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.stroke(); }
  else if (s.quartet) { const o = q * 0.55; ctx.fillStyle = '#6fffd2'; for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, q * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); } }
  else if (s.bell) { const sw = Math.sin(t * 7 + i) * 0.28; ctx.save(); ctx.translate(x, y - q * 0.9); ctx.rotate(sw); ctx.beginPath(); ctx.moveTo(-q * 1.05, q * 1.5); ctx.quadraticCurveTo(-q * 1.0, -q * 0.2, 0, -q * 1.0); ctx.quadraticCurveTo(q * 1.0, -q * 0.2, q * 1.05, q * 1.5); ctx.closePath(); ctx.fillStyle = '#ffd04a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, q * 1.6, q * 0.38, 0, TAU); ctx.fillStyle = '#b8801c'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-q * 0.5, q * 0.1); ctx.lineTo(-q * 0.35, q * 1.0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.restore(); }
  else if (s.choir) { ctx.beginPath(); ctx.ellipse(x - q * 0.3, y + q * 0.55, q * 0.55, q * 0.4, -0.4, 0, TAU); ctx.fillStyle = '#ffd0ec'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + q * 0.12, y + q * 0.4); ctx.lineTo(x + q * 0.12, y - q * 1.1); ctx.lineTo(x + q * 0.75, y - q * 0.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6; ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(x, y, q * 1.05, 0.5, TAU - 0.5); ctx.arc(x + q * 0.55, y - q * 0.1, q * 0.85, TAU - 0.9, 0.9, true); ctx.closePath(); ctx.fillStyle = '#d9c8ff'; ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

// Quartet streak counter (round 6): a small pill under the duo while two or more Quartets in a row are alive.
export function drawStreak(ctx, g, t) {
  const n = g.qStreak | 0; if (n < 2) return;
  const p = g.p, x = p.x, y = p.y + 62;
  ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = 'rgba(20,40,60,.78)'; ctx.strokeStyle = '#6fffd2'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 44, y - 15, 88, 30, 15) : ctx.rect(x - 44, y - 15, 88, 30); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9bffe0'; ctx.font = '900 20px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('x' + n + (n >= 5 ? ' MAX' : ''), x, y + 1); ctx.restore();
}
// Choir links (agent 01, round 6): a soft pink tether runs from a choir cell to every neighbour it heals, with a little note bead drifting out
// along it, so the healing reach is readable at a glance. Called once per snake, behind the cells. Strokes only, no gradients.
export function drawChoirLinks(ctx, sn, t, reach = 2) {
  const segs = sn.segs; let any = false;
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i]; if (!c.choir || !(c.hp > 0)) continue;
    if (!any) { ctx.save(); ctx.lineCap = 'round'; any = true; }
    for (let j = Math.max(1, i - reach); j <= Math.min(segs.length - 1, i + reach); j++) {
      const q = segs[j]; if (j === i || !(q.hp > 0)) continue;
      const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy); if (d > 300 || d < 1) continue;
      const hurt = q.hp < q.max, nx = -dy / d, ny = dx / d, bend = Math.sin(t * 2.2 + i) * d * 0.12;
      ctx.globalAlpha = hurt ? 0.6 : 0.3; ctx.strokeStyle = '#ffb4dd'; ctx.lineWidth = hurt ? 5 : 3.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo((c.x + q.x) / 2 + nx * bend, (c.y + q.y) / 2 + ny * bend, q.x, q.y); ctx.stroke();
      if (hurt) { ctx.globalAlpha = 0.5 + Math.sin(t * 5 + j) * 0.2; ctx.strokeStyle = '#ffc8e6'; ctx.lineWidth = 4.5; ctx.setLineDash([q.r * 0.45, q.r * 0.3]); ctx.lineDashOffset = t * 14; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 1.2, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (hurt) {   // only a hurt neighbour gets the drifting beat: the tether is carrying health to it
        const f = (t * 0.9 + j * 0.31) % 1, om = 1 - f, bx = om * om * c.x + 2 * om * f * ((c.x + q.x) / 2 + nx * bend) + f * f * q.x, by = om * om * c.y + 2 * om * f * ((c.y + q.y) / 2 + ny * bend) + f * f * q.y;
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff0f8'; ctx.strokeStyle = INKC; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + 5, by); ctx.lineTo(bx + 5, by - 11); ctx.stroke();
      }
    }
  }
  if (any) ctx.restore();
}
