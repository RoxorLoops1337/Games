// Small drawing + rules helpers for the graft table and reward screens (pure canvas, no state).
import { COL, EASE, clamp, rgba } from './core.js';
import { SCHOOLS, GRAFTS, CARDS } from '../data/index.js';
import * as ICONS from '../art/icons.js';
import { cardSpec } from '../engine/cards.js';
import { OVERLOAD_SHATTER, relicMod } from '../engine/cards.js';

export const TIER = {
  safe: { label: 'SAFE', color: '#7fc4b4', ink: '#0f2a24' },
  greedy: { label: 'GREEDY', color: '#F2C14E', ink: '#2b1e00' },
  weird: { label: 'WEIRD', color: '#b78be6', ink: '#1d0f33' },
};
export const schoolColor = (id) => (SCHOOLS[id] && SCHOOLS[id].color) || COL[id] || '#aaa';

export function shatterChance(run) {
  return Math.max(0, OVERLOAD_SHATTER + relicMod(run, 'shatter') + (run.ascension >= 8 ? 0.1 : 0) + ((run.dailyMod && run.dailyMod.shatter) || 0));
}

// Why can this graft not go on this card? (text for the dim tooltip)
export function cantReason(inst, gid) {
  const g = GRAFTS[gid];
  if (!g) return 'Unknown graft.';
  if (inst.grafts.includes(gid)) return 'This card already wears that graft.';
  if (g.not) { const hit = g.not.filter((x) => inst.grafts.includes(x)); if (hit.length) return 'Conflicts with ' + hit.map((x) => (GRAFTS[x] ? GRAFTS[x].name : x)).join(', ') + '.'; }
  const spec = cardSpec(inst);
  if (g.types && !g.types.includes(spec.type)) return 'Only goes on ' + g.types.join(' or ') + ' cards.';
  return 'This card cannot take that graft (nothing for it to hook into).';
}

// School resonance line: "Ember 2/3 resonance" and what the next step does.
export function resonanceInfo(run, schoolId, counts) {
  const s = SCHOOLS[schoolId]; if (!s) return null;
  const n = (counts && counts[schoolId]) || 0;
  const next = n < 3 ? 3 : n < 6 ? 6 : 6;
  const lines = [];
  lines.push(`${s.name} ${Math.min(n, next)}/${next} resonance`);
  if (n >= 3) lines.push('Active (3): ' + s.resonance[3]);
  if (n >= 6) lines.push('Active (6): ' + s.resonance[6]);
  if (n < 6) lines.push(`At ${next}: ${s.resonance[next]}`);
  return { name: s.name, n, next, color: s.color, lines, blurb: s.blurb };
}

export function wrapLimit(app, str, maxW, size, maxLines, o = {}) {
  const lines = app.wrap(str, maxW, size, o);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1];
  while (last.length > 2 && app.measure(last + '...', size, o) > maxW) last = last.slice(0, -1);
  out[maxLines - 1] = last.replace(/[ ,.;:]+$/, '') + '...';
  return out;
}

// A staple (weight pip): a small bracket.
export function drawStaple(ctx, x, y, w = 14, color = '#cfd6da') {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 7); ctx.lineTo(x + w, y + 7); ctx.lineTo(x + w, y); ctx.stroke();
  ctx.restore();
}

export function keyBadge(app, label, x, y) {
  const ctx = app.ctx;
  ctx.save(); ctx.fillStyle = 'rgba(14,12,10,.85)'; ctx.strokeStyle = 'rgba(232,220,196,.6)'; ctx.lineWidth = 1.5;
  app.rr(x - 11, y - 11, 22, 22, 5); ctx.fill(); ctx.stroke(); ctx.restore();
  app.text(label, x, y - 8, { size: 14, ui: true, bold: true, align: 'center', color: COL.vellum });
}

// Red tithe seam across a rect centered at (cx,cy). p 0..1 = how much is drawn.
export function drawSeam(ctx, cx, cy, w, h, p = 1, t = 0) {
  if (p <= 0) return;
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = cx - w / 2 + 6 + (w - 12) * k;
    const y = cy - h / 2 + 8 + (h - 16) * k + (i % 2 ? 7 : -7);
    pts.push([x, y]);
  }
  const upto = p * n;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.strokeStyle = COL.scar; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= n; i++) {
    if (i <= upto) ctx.lineTo(pts[i][0], pts[i][1]);
    else { const f = clamp(upto - (i - 1), 0, 1); if (f > 0) ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); break; }
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff9aa6'; ctx.lineWidth = 1.5; ctx.stroke();
  // cross stitches
  ctx.strokeStyle = '#1a0a0c'; ctx.lineWidth = 2.5;
  for (let i = 1; i < n; i++) {
    if (i > upto) break;
    const [x, y] = pts[i];
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
  }
  ctx.restore();
}

// Gold cracked border (Overload). p 0..1 reveals the cracks.
export function drawCrack(ctx, cx, cy, w, h, p = 1, t = 0) {
  ctx.save();
  const pulse = 0.65 + 0.35 * Math.sin(t * 5);
  ctx.shadowColor = COL.lamp; ctx.shadowBlur = 16 * pulse;
  ctx.strokeStyle = COL.lamp; ctx.lineWidth = 4;
  ctx.setLineDash([14, 5, 3, 5]);
  ctx.globalAlpha = clamp(p * 1.5, 0, 1);
  const x = cx - w / 2 - 3, y = cy - h / 2 - 3;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w + 6, h + 6, 12) : ctx.rect(x, y, w + 6, h + 6); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff3c4';
  const cracks = [
    [[-w / 2, -h * 0.18], [-w * 0.32, -h * 0.1], [-w * 0.4, h * 0.02], [-w * 0.2, h * 0.1]],
    [[w / 2, h * 0.28], [w * 0.3, h * 0.2], [w * 0.38, h * 0.08], [w * 0.18, -h * 0.02]],
    [[-w * 0.1, -h / 2], [-w * 0.02, -h * 0.38], [-w * 0.14, -h * 0.3], [-w * 0.06, -h * 0.2]],
    [[w * 0.2, h / 2], [w * 0.12, h * 0.38], [w * 0.24, h * 0.3]],
  ];
  const total = cracks.reduce((a, c) => a + c.length - 1, 0);
  let budget = p * total;
  for (const c of cracks) {
    ctx.beginPath(); ctx.moveTo(cx + c[0][0], cy + c[0][1]);
    for (let i = 1; i < c.length; i++) {
      if (budget <= 0) break;
      const f = Math.min(1, budget); budget -= 1;
      ctx.lineTo(cx + c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, cy + c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Budget gauge: weight cells (vellum, red past budget), preview cells (pulsing), empty cells outlined. Returns nothing.
// If art/icons ever ships drawBudgetGauge with a matching contract the screens can swap it in; this one has the preview cells.
export function drawGauge(app, x, y, w, h, weight, budget, addW = 0, t = 0) {
  const ctx = app.ctx;
  if (ICONS.drawBudgetGauge) { ICONS.drawBudgetGauge(ctx, x + 5, y + (h - 22) / 2, w - 10, weight, budget, addW); return { x, y, w, h }; }
  const total = clamp(Math.max(budget, weight + Math.max(0, addW), 1), 1, 30);
  const gap = 4;
  const cw = Math.min(34, (w - gap * (total - 1)) / total);
  const used = cw * total + gap * (total - 1);
  const pulse = 0.55 + 0.45 * Math.sin(t * 6);
  ctx.save();
  for (let i = 0; i < total; i++) {
    const cx = x + i * (cw + gap);
    const over = i >= budget;
    app.rr(cx, y, cw, h, 4);
    if (i < weight) {
      ctx.fillStyle = over ? COL.scar : COL.vellum; ctx.fill();
      ctx.strokeStyle = over ? '#ff6b7e' : '#fff6e0'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (i < weight + addW) {
      ctx.fillStyle = rgba(over ? '#ff3d55' : COL.lamp, 0.35 + 0.5 * pulse); ctx.fill();
      ctx.strokeStyle = over ? '#ff3d55' : COL.lamp; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(232,220,196,.06)'; ctx.fill();
      ctx.strokeStyle = over ? 'rgba(179,38,58,.55)' : 'rgba(232,220,196,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  // budget line
  if (budget > 0 && budget < total) {
    const lx = x + budget * (cw + gap) - gap / 2;
    ctx.strokeStyle = COL.lamp; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, y - 5); ctx.lineTo(lx, y + h + 5); ctx.stroke();
  }
  ctx.restore();
  return { x, y, w: used, h };
}

// Lamp cone from the ceiling. swing = angle in radians.
export function drawLamp(ctx, x, swing, a = 1) {
  ctx.save();
  ctx.translate(x, -10); ctx.rotate(swing);
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 54); ctx.stroke();
  // shade
  ctx.fillStyle = '#2c2520'; ctx.beginPath(); ctx.moveTo(-26, 76); ctx.lineTo(-10, 52); ctx.lineTo(10, 52); ctx.lineTo(26, 76); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(232,220,196,.25)'; ctx.stroke();
  // cone
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 76, 0, 700);
  g.addColorStop(0, `rgba(242,193,78,${0.22 * a})`); g.addColorStop(1, 'rgba(242,193,78,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-22, 76); ctx.lineTo(22, 76); ctx.lineTo(480, 720); ctx.lineTo(-480, 720); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(255,236,170,${0.95 * a})`; ctx.shadowColor = COL.lamp; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(0, 78, 8, 0, 6.283); ctx.fill();
  ctx.restore();
}

export const names = (ids) => ids.map((u) => (CARDS[u] ? CARDS[u].name : u));
export { EASE };
