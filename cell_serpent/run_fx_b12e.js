// Batch 12 (agent e): the Mirror tether and the Beat Run pips. Pure canvas helpers, strokes and a few small texts only, no gradients, no clips.
import { shellFacing, shellBlocked, SHELL_HALF } from './sim.js';
const TAU = Math.PI * 2;
const SILVER = '#e6f2ff';

// Mirror tether: from every live Mirror cell a silver beam runs to the two cells that take the glanced share, with an arrowhead,
// a ring round the receiving cell and its share ("20%"). A bead drifts out along each beam, and a hit makes the beams flash.
// side = the share each neighbour takes (sim.mirrorSide); 0 (Pocket Mirror at full) draws nothing. Called after the cells so it stays readable.
export function drawMirrorTether(ctx, sn, t, side, H = 1280) {
  if (!(side > 0)) return;
  const segs = sn.segs; let any = false;
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i]; if (!c.mirror || !(c.hp > 0) || c.y < -c.r || c.y > H + c.r) continue;
    if (!any) { ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; any = true; }
    const hit = c.flash > 0 ? 1 : 0;
    for (let d = -1; d <= 1; d += 2) {
      const q = segs[i + d]; if (!q || !(q.hp > 0) || q.i === 0) continue;
      const dx = q.x - c.x, dy = q.y - c.y, len = Math.hypot(dx, dy); if (len < 2 || len > 320) continue;
      const ux = dx / len, uy = dy / len, mx = (c.x + q.x) / 2, my = (c.y + q.y) / 2, pulse = 1 + 0.12 * Math.sin(t * 6 + i) + 0.3 * hit;
      // a bold arrow from the mirror toward the cell that takes the glance (cells overlap, so it sits on the midpoint), dark outline under silver
      const ax = mx - ux * 14 * pulse, ay = my - uy * 14 * pulse, bx = mx + ux * 14 * pulse, by = my + uy * 14 * pulse;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = 0.95; ctx.strokeStyle = pass ? SILVER : '#10131c'; ctx.lineWidth = pass ? 5 : 10;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.moveTo(bx - ux * 11 - uy * 9, by - uy * 11 + ux * 9); ctx.lineTo(bx, by); ctx.lineTo(bx - ux * 11 + uy * 9, by - uy * 11 - ux * 9); ctx.stroke();
      }
      ctx.globalAlpha = 0.75 + 0.25 * hit; ctx.strokeStyle = SILVER; ctx.setLineDash([6, 5]); ctx.lineDashOffset = t * 20; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 1.14, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const x0 = c.x, y0 = c.y, x1 = q.x, y1 = q.y;
      const f = (t * 0.9 + i * 0.37 + d) % 1; ctx.globalAlpha = 0.9 * (1 - f); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 3.5, 0, TAU); ctx.fill();
    }
  }
  if (!any) return;
  // the shares: a little label above each receiving cell
  ctx.globalAlpha = 1; ctx.font = '900 24px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6;
  const label = Math.round(side * 100) + '%';
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i]; if (!c.mirror || !(c.hp > 0) || c.y < -c.r || c.y > H + c.r) continue;
    for (let d = -1; d <= 1; d += 2) {
      const q = segs[i + d]; if (!q || !(q.hp > 0) || q.i === 0 || Math.hypot(q.x - c.x, q.y - c.y) > 320) continue;
      const sx = q.x < 360 ? 1 : -1, lx = q.x + sx * q.r * 1.15, ly = q.y; ctx.strokeStyle = '#10131c'; ctx.strokeText(label, lx, ly); ctx.fillStyle = SILVER; ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();
}

// Beat Run pips: three small pips under the duo. Filled = the beats of the run so far, the next one pulses while its window is open.
// Faint when no run is going so the player learns where to look. Everything is read from the sim, nothing is changed.
export function beatPipState(g, T, BEAT_WIN, LEN) {
  const t = g.t, n = g.beatN | 0, alive = n > 0 && t / T - g.beatLast < 1 + BEAT_WIN / T;
  const ph = (t % T) / T, near = Math.min(ph, 1 - ph) * T < BEAT_WIN;
  return { n: alive ? n : 0, near, len: LEN, ph };
}
export function drawBeatPips(ctx, x, y, st, small = 1) {
  const n = st.n, len = st.len, gap = 40 * small, r = 13 * small, x0 = x - (len - 1) * gap / 2;
  ctx.save(); ctx.lineWidth = 3.5; ctx.globalAlpha = n > 0 ? 0.85 : 0.5; ctx.fillStyle = 'rgba(10,12,28,.7)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - len * gap / 2 - 2, y - r - 6, len * gap + 4, 2 * r + 12, r + 6) : ctx.rect(x - len * gap / 2, y - r - 6, len * gap, 2 * r + 12); ctx.fill();
  for (let k = 0; k < len; k++) {
    const px = x0 + k * gap, done = k < n, next = k === n && n > 0;
    ctx.globalAlpha = done ? 1 : next ? 0.9 : n > 0 ? 0.7 : 0.55;
    ctx.beginPath(); ctx.arc(px, y, r * (next && st.near ? 1.25 : 1), 0, TAU);
    if (done) { ctx.fillStyle = '#9bffe0'; ctx.strokeStyle = '#10131c'; ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(16,19,28,.6)'; ctx.fill(); ctx.strokeStyle = next ? '#ffe36b' : '#cfe8ff'; ctx.stroke(); }
  }
  ctx.restore();
}

// Shutter cell shield (circle stages): a bright arc round the cell that turns with the sim (sim.shellFacing). Notes through the arc do 30%,
// through the gap full damage. Dark under-stroke so it reads on any background. Two strokes per shell cell, nothing else.
export function drawShellArcs(ctx, g, sn, H = 1280) {
  const segs = sn.segs; let any = false;
  for (let i = 1; i < segs.length; i++) {
    const c = segs[i]; if (!c.shell || !(c.hp > 0) || c.y < -c.r || c.y > H + c.r) continue;
    if (!any) { ctx.save(); ctx.lineCap = 'round'; any = true; }
    const f = shellFacing(g, c), rr = c.r * 1.3, shut = shellBlocked(g, c);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#10131c'; ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(c.x, c.y, rr, f - SHELL_HALF, f + SHELL_HALF); ctx.stroke();
    ctx.strokeStyle = shut ? '#ffffff' : '#9ad0ff'; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.arc(c.x, c.y, rr, f - SHELL_HALF, f + SHELL_HALF); ctx.stroke();
  }
  if (any) ctx.restore();
}
