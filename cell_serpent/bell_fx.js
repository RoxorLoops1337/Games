// Bell links (batch 8): a golden tether runs from the bell cell to the cells it will hit when popped (BELL_REACH each side),
// so the danger zone is readable before the ring. A bead drifts out along each line. Strokes only, once per snake, behind the cells.
const TAU = Math.PI * 2;
export function drawBellLinks(ctx, sn, t, reach = 3) {
  const segs = sn.segs; let any = false;
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i]; if (!c.bell || !(c.hp > 0)) continue;
    if (!any) { ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([9, 8]); any = true; }
    ctx.lineDashOffset = -t * 40;
    for (let j = Math.max(1, i - reach); j <= Math.min(segs.length - 1, i + reach); j++) {
      const q = segs[j]; if (j === i || !(q.hp > 0)) continue;
      const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy); if (d > 320 || d < 1) continue;
      const near = 1 - (Math.abs(j - i) - 1) / (reach + 1);
      ctx.globalAlpha = 0.28 + 0.4 * near; ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 3 + 2 * near;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  }
  if (!any) return;
  ctx.setLineDash([]);
  const f = (t * 0.8) % 1;
  for (let i = 1; i < segs.length; i++) {   // a bead drifting out along each tether
    const c = segs[i]; if (!c.bell || !(c.hp > 0)) continue;
    for (let j = Math.max(1, i - reach); j <= Math.min(segs.length - 1, i + reach); j++) {
      const q = segs[j]; if (j === i || !(q.hp > 0)) continue;
      if (Math.hypot(q.x - c.x, q.y - c.y) > 320) continue;
      ctx.globalAlpha = 0.9 * (1 - f); ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(c.x + (q.x - c.x) * f, c.y + (q.y - c.y) * f, 3.5, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
