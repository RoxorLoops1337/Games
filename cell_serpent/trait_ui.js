// Species trait chip (batch 8): from stage 21 the regular snakes behave in their own way (sim.js traitOf).
// The stage intro card shows a small icon plus a two word name so the player knows what is coming. Pure display.
import { TRAIT_FROM } from './sim.js';
const TAU = Math.PI * 2;
export const TRAIT_LABEL = {
  love: 'HEART PULSE', rust: 'CREAKY', grumpy: 'QUICK SURGES', disco: 'ON THE BEAT',
  sour: 'POP RUSH', mighty: 'HARD TO SLOW', frosty: 'ICE PATCH', sneezy: 'SNEEZE JOLT',
};
export const hasTrait = (skin, stage, boss, mode) => !!TRAIT_LABEL[skin] && !boss && !mode && stage >= TRAIT_FROM;

// icon centred on (x, y), radius r, ink on a round plate in the species colour
export function drawTraitIcon(ctx, k, x, y, r, col, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = 'rgba(8,6,24,.78)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
  const u = r * 0.5; ctx.strokeStyle = '#fff'; ctx.fillStyle = col; ctx.lineWidth = 2.6;
  ctx.beginPath();
  switch (k) {
    case 'love': ctx.moveTo(0, u); ctx.bezierCurveTo(-u * 2, -u * 0.2, -u, -u * 1.4, 0, -u * 0.5); ctx.bezierCurveTo(u, -u * 1.4, u * 2, -u * 0.2, 0, u); ctx.fill(); ctx.stroke(); break;
    case 'rust': for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 0.5; ctx.moveTo(Math.cos(a) * u * 0.7, Math.sin(a) * u * 0.7); ctx.lineTo(Math.cos(a) * u * 1.2, Math.sin(a) * u * 1.2); } ctx.arc(0, 0, u * 0.7, 0, TAU); ctx.stroke(); break;
    case 'grumpy': ctx.moveTo(-u * 1.1, -u * 0.9); ctx.lineTo(-u * 0.2, -u * 0.3); ctx.moveTo(u * 1.1, -u * 0.9); ctx.lineTo(u * 0.2, -u * 0.3); ctx.moveTo(-u * 0.8, u * 0.8); ctx.quadraticCurveTo(0, u * 0.2, u * 0.8, u * 0.8); ctx.stroke(); break;
    case 'disco': ctx.arc(0, 0, u * 1.05, 0, TAU); ctx.moveTo(-u * 1.05, 0); ctx.lineTo(u * 1.05, 0); ctx.moveTo(0, -u * 1.05); ctx.lineTo(0, u * 1.05); ctx.moveTo(-u * 0.7, -u * 0.7); ctx.lineTo(u * 0.7, u * 0.7); ctx.stroke(); break;
    case 'sour': ctx.moveTo(-u * 0.3, -u * 1.2); ctx.lineTo(u * 0.7, -u * 0.1); ctx.lineTo(0, -u * 0.1); ctx.lineTo(u * 0.3, u * 1.2); ctx.lineTo(-u * 0.7, u * 0.1); ctx.lineTo(0, u * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'mighty': ctx.moveTo(-u * 1.0, -u * 1.0); ctx.lineTo(u * 1.0, -u * 1.0); ctx.lineTo(u * 0.9, u * 0.3); ctx.quadraticCurveTo(0, u * 1.4, -u * 0.9, u * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'frosty': for (let i = 0; i < 3; i++) { const a = i * TAU / 6; ctx.moveTo(Math.cos(a) * u * 1.15, Math.sin(a) * u * 1.15); ctx.lineTo(-Math.cos(a) * u * 1.15, -Math.sin(a) * u * 1.15); } ctx.stroke(); break;
    default: ctx.arc(-u * 0.4, 0, u * 0.35, 0, TAU); ctx.fill(); ctx.moveTo(u * 0.1, -u * 0.5); ctx.quadraticCurveTo(u * 0.9, -u * 0.6, u * 1.1, -u * 0.9); ctx.moveTo(u * 0.1, 0); ctx.lineTo(u * 1.2, 0); ctx.moveTo(u * 0.1, u * 0.5); ctx.quadraticCurveTo(u * 0.9, u * 0.6, u * 1.1, u * 0.9); ctx.stroke();   // sneezy: puff lines
  }
  ctx.restore();
}
