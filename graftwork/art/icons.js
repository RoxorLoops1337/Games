// STUB. All icon drawers are CENTERED at (x,y) with the given size (diameter-ish), unless noted.
import { COL } from '../ui/core.js';
const dot = (ctx, x, y, s, c, ch) => { ctx.save(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, s / 2, 0, 6.283); ctx.fill(); if (ch) { ctx.fillStyle = '#000'; ctx.font = `bold ${s * 0.6}px Georgia`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y); } ctx.restore(); };
export function drawStatus(ctx, id, x, y, size, good = true) { dot(ctx, x, y, size, good ? '#7fcf8a' : '#ff7a7a', id[0].toUpperCase()); }
export function drawIntent(ctx, kind, x, y, size) { dot(ctx, x, y, size, kind === 'attack' ? '#ff7a7a' : '#ccc', kind[0].toUpperCase()); }
export function drawRelic(ctx, id, x, y, size) { dot(ctx, x, y, size, '#c9a227', 'R'); }
export function drawPotion(ctx, id, x, y, size) { dot(ctx, x, y, size, '#7fd1e0', 'P'); }
export function drawNodeIcon(ctx, type, x, y, size, state) { dot(ctx, x, y, size, '#aaa', type[0].toUpperCase()); }
export function drawEnergyOrb(ctx, x, y, size, n, max) { dot(ctx, x, y, size, '#7fd1e0', String(n)); }
export function drawCoin(ctx, x, y, size) { dot(ctx, x, y, size, COL.gold); }
export function drawHeart(ctx, x, y, size) { dot(ctx, x, y, size, COL.scar); }
export function drawShield(ctx, x, y, size, n) { dot(ctx, x, y, size, '#7fa0ad', n === undefined ? '' : String(n)); }
