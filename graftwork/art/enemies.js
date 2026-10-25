// STUB. drawEnemy draws the enemy standing with its FEET at (x,y). o: { scale=1, t (sec), hurt 0..1, dying 0..1, attack -1..1 (lunge), flip, st:{status:n} }
import { COL } from '../ui/core.js';
export function enemyBounds(def) { return { w: 150, h: 170 }; }
export function drawEnemy(ctx, def, x, y, o = {}) { const s = o.scale || 1; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = (def.art && def.art.color) || '#888'; ctx.fillRect(-60, -150, 120, 150); ctx.restore(); }
