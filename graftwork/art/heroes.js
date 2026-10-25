// STUB. drawHero: FEET at (x,y). o: { scale, t, hurt 0..1, attack -1..1, dying 0..1 }
export function drawHero(ctx, heroId, x, y, o = {}) { const s = o.scale || 1; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#c9b48a'; ctx.fillRect(-35, -150, 70, 150); ctx.restore(); }
export function drawPortrait(ctx, heroId, x, y, size) { ctx.save(); ctx.fillStyle = '#c9b48a'; ctx.fillRect(x - size / 2, y - size / 2, size, size); ctx.restore(); }
