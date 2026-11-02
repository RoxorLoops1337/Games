// First-run guide (runs 1 and 2 only). Mostly wordless: a sliding finger with chevrons, a pulsing ring on the
// first yellow cell, a golden beacon on the first chest. Every hint has a time budget and fades once learned,
// so it never nags.
const TAU = Math.PI * 2;
const EMO = 'system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif';
export function drawHints(ctx, g, S, h) {
  const st = S.hint && S.hint.g === g ? S.hint : (S.hint = { g, moved: 0, lastX: g.p.x, slide: 0, ring: 0, chest: 0, alone: 0, learned: false, t0: S.t });
  const dt = Math.max(0, Math.min(0.05, S.t - st.t0)); st.t0 = S.t;
  st.moved += Math.abs(g.p.x - st.lastX); st.lastX = g.p.x;
  if (st.moved > 220) st.learned = true;
  const p = g.p;
  // 1. slide: finger and chevrons above the cell, until the player has moved a bit (or 14 s)
  if (!st.learned && g.t < 14 && g.phase === 'play') {
    st.slide += dt;
    const a = Math.min(1, st.slide * 2) * (g.t > 11 ? Math.max(0, (14 - g.t) / 3) : 1);
    const sw = Math.sin(S.t * 2.6), fx = p.x + sw * 130, fy = p.y - 150;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const run = (S.t * 60) % 40, fade = 1 - run / 40;
    for (const d of [-1, 1]) {   // chevrons that chase the finger
      const bx = p.x + d * (88 + run);
      ctx.globalAlpha = 0.9 * a * (d * sw > 0 ? 1 : 0.35) * fade;
      ctx.strokeStyle = '#10131c'; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(bx - d * 14, p.y - 176); ctx.lineTo(bx + d * 8, p.y - 150); ctx.lineTo(bx - d * 14, p.y - 124); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke();
    }
    ctx.globalAlpha = a; ctx.font = '64px ' + EMO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(fx, fy); ctx.rotate(sw * 0.18); ctx.fillText('\u{1F446}', 0, 0);
    ctx.restore();
    h.glow(p.x, p.y, 120 + Math.sin(S.t * 5) * 14, '#6fe3ff', 0.35 * a);
  }
  // 2. the first yellow cell gets a pulsing ring (budget 12 s of showing, gone after the first upgrade)
  if (g.level === 1 && g.upgradeLeft > 0 && g.t > 2 && st.ring < 12) {
    let s = null; for (const sn of g.snakes) for (const q of sn.segs) if (q.kind === 'upgrade' && q.hp > 0 && q.y > 40 && (!s || q.y > s.y)) s = q;
    if (s) { st.ring += dt; ring(ctx, s, S.t, '#ffe14a', Math.min(1, st.ring * 2)); }
  }
  // 3. the first chest cell: beacon (budget 8 s)
  if (g.kills < 14 && st.chest < 8) {
    let s = null; for (const sn of g.snakes) for (const q of sn.segs) if (q.carry === 'chest' && q.hp > 0 && q.y > 40 && (!s || q.y > s.y)) s = q;
    if (s) {
      st.chest += dt; const a = Math.min(1, st.chest * 2);
      ring(ctx, s, S.t + 0.5, '#ff9ad6', a);
      ctx.save(); ctx.globalAlpha = a; ctx.font = '40px ' + EMO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('\u{1F381}', s.x, s.y - s.r * 2.3 + Math.sin(S.t * 6) * 6); ctx.restore();
    }
  }
  // 4. the face pops when alone: a short hint, 4 s at most
  const sn = g.snakes[0];
  if (sn && sn.segs.length <= 3 && sn.segs[0].shield && st.alone < 4) { st.alone += dt; const hd = sn.segs[0]; h.glow(hd.x, hd.y, hd.r * 3, '#bfe9ff', 0.5); h.text('ALONE = POP!', hd.x, hd.y + hd.r * 2.2, 26, '#fff', '#0b1020'); }
}
function ring(ctx, s, t, col, a) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 6;
  for (let k = 0; k < 2; k++) { const ph = (t * 1.2 + k * 0.5) % 1; ctx.globalAlpha = a * (1 - ph) * 0.95; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1.15 + ph), 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = a * 0.9; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.2, 0, TAU); ctx.stroke();
  ctx.restore();
}
