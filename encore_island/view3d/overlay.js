// Encore Island 3D, HUD overlay. Text and bars belong to the crisp 2D canvas: modules queue labels at WORLD points (V.labels), the engine
// projects them with the real 3D camera and draws them with the 2D game's own pill / price tag / bar styles. Also draws the damage numbers.
// Everything here is pooled: no allocation per frame.
const POOL = []; let N = 0;
function take() { return POOL[N] || (POOL[N] = { k: 0, txt: '', v: 0, x: 0, y: 0, z: 0, c1: '', c2: '', px: 12, gem: false, afford: false, f: 0, w: 0, col: '', col2: '', icon: '', size: 0, boss: false }), POOL[N++]; }

/** The label queue handed to modules as V.labels (world units: x, height y, z). Cleared by the engine every frame. */
export const labels = {
  clear() { N = 0; },
  pill(txt, x, y, z, o) { const e = take(); e.k = 0; e.txt = txt; e.x = x; e.y = y; e.z = z; e.c1 = (o && o.c1) || '#ffffff'; e.c2 = (o && o.c2) || '#dccaff'; e.px = (o && o.px) || 12; },
  price(v, x, y, z, o) { const e = take(); e.k = 1; e.v = v; e.x = x; e.y = y; e.z = z; e.gem = !!(o && o.gem); e.afford = !!(o && o.afford); },
  bar(frac, x, y, z, w, col, col2, boss) { const e = take(); e.k = 2; e.f = frac; e.x = x; e.y = y; e.z = z; e.w = w || 40; e.col = col || '#7fe36a'; e.col2 = col2 || ''; e.boss = !!boss; },
  icon(name, x, y, z, size) { const e = take(); e.k = 3; e.icon = name; e.x = x; e.y = y; e.z = z; e.size = size || 24; },
};
export const labelCount = () => N;

/** project(x, y, z) -> { x, y, k, ok } screen px (shared result object). Draws every queued label with the 2D game's own styles. */
export function drawLabels(ctx, project, vw, vh, kScale) {
  for (let i = 0; i < N; i++) {
    const e = POOL[i], p = project(e.x, e.y, e.z); if (!p.ok || p.x < -120 || p.x > vw + 120 || p.y < -80 || p.y > vh + 80) continue;
    const k = kScale; ctx.translate(p.x, p.y); ctx.scale(k, k);
    if (e.k === 0) labelPill(e.txt, 0, 0, e.c1, e.c2, e.px);
    else if (e.k === 1) priceTag(e.v, 0, 0, e.gem, e.afford);
    else if (e.k === 2) {
      const w = e.w, h = e.boss ? 9 : 6, f = e.f < 0 ? 0 : e.f > 1 ? 1 : e.f;
      ctx.fillStyle = 'rgba(58,26,58,0.85)'; rr(-w / 2 - 1.5, -1.5, w + 3, h + 3, 4); ctx.fill();
      ctx.fillStyle = f > 0.4 ? e.col : (e.col2 || '#ff6a8a'); rr(-w / 2, 0, Math.max(3, w * f), h, 3); ctx.fill();
    } else if (e.k === 3) drawIcon(e.icon, 0, 0, e.size);
    ctx.scale(1 / k, 1 / k); ctx.translate(-p.x, -p.y);
  }
}

const HIT_W = ['POW!', 'BAM!', 'ZAP!', 'BOP!'];
/** floating damage numbers and pickups (S.floats), same look as the 2D drawFloats, anchored to projected world points */
export function drawFloats3(ctx, project, S, kScale) {
  for (const f of S.floats) {
    const p = project(f.x * 0.02, 0.9, f.y * 0.02); if (!p.ok) continue;
    const life = f.big ? 1.6 : 0.8; ctx.globalAlpha = Math.min(1, 3 * (1 - f.t / life)); const k = kScale, lift = 26 * k;
    if (f.crit) {
      const pop = 1 + Math.max(0, 0.14 - f.t) * 7, sz = 24 * pop; ctx.save(); ctx.translate(p.x, p.y - lift); ctx.scale(k, k); ctx.font = font(sz); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(45,23,15,0.9)'; ctx.strokeText(f.txt, 0, 0);
      ctx.fillStyle = '#fff2b0'; ctx.fillText(f.txt, 0, 0); ctx.fillStyle = '#ff7eb6'; ctx.font = font(sz * 0.5); ctx.rotate(-0.12); ctx.fillText(HIT_W[Math.abs((f.x * 7 + f.y * 3) | 0) % 4], 0, -sz * 0.78); ctx.restore();
    } else {
      const pop = 1 + Math.max(0, 0.12 - f.t) * 5; ctx.save(); ctx.translate(p.x, p.y - lift); ctx.scale(k * pop, k * pop); ctx.font = font(f.big ? 20 : 14); ctx.textAlign = 'center';
      const coinF = f.txt[0] === '+' && f.color === '#ffd94a'; if (coinF) { const tw = ctx.measureText(f.txt).width; drawIcon('coin', -tw / 2 - 11, -5, f.big ? 22 : 18); ctx.translate(9, 0); }
      ctx.fillStyle = f.color; ctx.fillText(f.txt, 0, 0); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
