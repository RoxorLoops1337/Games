// GRAFTWORK icons. Everything is procedural canvas. Every drawer is CENTERED at (x,y); `size` is the badge diameter.
// Glyphs are authored in a unit space (about -0.65..0.65) and scaled, so they stay crisp from 20 to 48px.
// Exports: drawStatus drawIntent drawRelic drawPotion drawNodeIcon drawEnergyOrb drawCoin drawHeart drawShield
//          drawBudgetGauge(ctx,x,y,w,weight,budget,preview) (x,y = top-left, returns height)  drawStrainMeter(ctx,x,y,w,strain,max)
//          drawDeckIcon drawPileIcon(ctx,x,y,size,'draw'|'discard'|'exhaust')  drawMapPath(ctx,x1,y1,x2,y2,state,t)
//          STATUS_IDS_DRAWN / RELIC_GLYPHS (introspection for tests)
import { COL, FONT, rgba, shade } from '../ui/core.js';
import { RELICS } from '../data/index.js';

const TAU = Math.PI * 2;
const D = '#120d0b';
const LW = 0.11;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- tiny path helpers (unit space) ----
const path = (c, p, close = true) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); if (close) c.closePath(); };
const fs = (c, k, w = 0.06) => { c.fillStyle = k; c.fill(); if (w) { c.lineWidth = w; c.strokeStyle = D; c.lineJoin = 'round'; c.stroke(); } };
const ln = (c, k, w = LW) => { c.lineWidth = w; c.strokeStyle = k; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); };
const ci = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
const seg = (c, x1, y1, x2, y2, k, w = LW) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); ln(c, k, w); };
const sub = (c, fn, x, y, s, rot = 0, k, a) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(s, s); fn(c, k, a); c.restore(); };
const starPath = (c, x, y, r, pts = 5, inner = 0.45) => { c.beginPath(); for (let i = 0; i < pts * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / pts, rad = i % 2 ? r * inner : r; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); };
const shieldPath = (c, s = 1, yo = 0) => { c.beginPath(); c.moveTo(-0.5 * s, -0.5 * s + yo); c.lineTo(0.5 * s, -0.5 * s + yo); c.lineTo(0.5 * s, 0.05 * s + yo); c.quadraticCurveTo(0.5 * s, 0.45 * s + yo, 0, 0.66 * s + yo); c.quadraticCurveTo(-0.5 * s, 0.45 * s + yo, -0.5 * s, 0.05 * s + yo); c.closePath(); };
const arrow = (c, x1, y1, x2, y2, k, w = 0.14, head = 0.22) => { const a = Math.atan2(y2 - y1, x2 - x1); seg(c, x1, y1, x2, y2, k, w); c.beginPath(); c.moveTo(x2 + Math.cos(a) * head * 0.5, y2 + Math.sin(a) * head * 0.5); c.lineTo(x2 + Math.cos(a + 2.5) * head, y2 + Math.sin(a + 2.5) * head); c.lineTo(x2 + Math.cos(a - 2.5) * head, y2 + Math.sin(a - 2.5) * head); c.closePath(); fs(c, k, 0.03); };
const flamePath = (c) => { c.beginPath(); c.moveTo(0, -0.68); c.bezierCurveTo(0.12, -0.35, 0.5, -0.15, 0.5, 0.2); c.bezierCurveTo(0.5, 0.5, 0.28, 0.64, 0, 0.64); c.bezierCurveTo(-0.28, 0.64, -0.5, 0.5, -0.5, 0.2); c.bezierCurveTo(-0.5, -0.05, -0.3, -0.2, -0.22, -0.42); c.bezierCurveTo(-0.1, -0.3, -0.05, -0.3, 0, -0.68); c.closePath(); };
const dropPath = (c, s = 1, yo = 0) => { c.beginPath(); c.moveTo(0, -0.66 * s + yo); c.bezierCurveTo(0.1 * s, -0.4 * s + yo, 0.46 * s, -0.05 * s + yo, 0.46 * s, 0.22 * s + yo); c.bezierCurveTo(0.46 * s, 0.5 * s + yo, 0.26 * s, 0.66 * s + yo, 0, 0.66 * s + yo); c.bezierCurveTo(-0.26 * s, 0.66 * s + yo, -0.46 * s, 0.5 * s + yo, -0.46 * s, 0.22 * s + yo); c.bezierCurveTo(-0.46 * s, -0.05 * s + yo, -0.1 * s, -0.4 * s + yo, 0, -0.66 * s + yo); c.closePath(); };
const heartPath = (c, s = 1, yo = 0) => { c.beginPath(); c.moveTo(0, 0.6 * s + yo); c.bezierCurveTo(-0.9 * s, 0.0 * s + yo, -0.6 * s, -0.7 * s + yo, 0, -0.28 * s + yo); c.bezierCurveTo(0.6 * s, -0.7 * s + yo, 0.9 * s, 0.0 * s + yo, 0, 0.6 * s + yo); c.closePath(); };

// ======================================================================================
// GLYPH LIBRARY. G[name](ctx, main, accent)
// ======================================================================================
const G = {};
G.fist = (c, k, a) => { rr(c, -0.42, -0.05, 0.84, 0.62, 0.16); fs(c, k); for (let i = 0; i < 4; i++) { rr(c, -0.42 + i * 0.21, -0.42, 0.21, 0.5, 0.09); fs(c, k, 0.05); } rr(c, -0.5, 0.12, 0.62, 0.2, 0.1); fs(c, a, 0.05); };
G.feather = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, 0.58); c.quadraticCurveTo(-0.5, -0.35, 0.52, -0.6); c.quadraticCurveTo(0.42, 0.32, -0.5, 0.58); fs(c, k); seg(c, -0.52, 0.6, 0.4, -0.5, a, 0.07); for (let i = 0; i < 4; i++) seg(c, -0.3 + i * 0.17, 0.3 - i * 0.2, -0.05 + i * 0.17, 0.3 - i * 0.3 - 0.12, D, 0.04); };
G.droop = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, -0.5); c.quadraticCurveTo(0.38, -0.55, 0.36, 0.05); c.lineTo(0.36, 0.28); ln(c, D, 0.34); c.beginPath(); c.moveTo(-0.5, -0.5); c.quadraticCurveTo(0.38, -0.55, 0.36, 0.05); c.lineTo(0.36, 0.28); ln(c, k, 0.22); ci(c, 0.36, 0.42, 0.15); fs(c, k); arrow(c, -0.35, 0.1, -0.35, 0.55, a, 0.1, 0.2); };
G.crackshield = (c, k, a) => { shieldPath(c, 1.05); fs(c, k); c.beginPath(); c.moveTo(0.05, -0.5); c.lineTo(-0.1, -0.22); c.lineTo(0.12, -0.02); c.lineTo(-0.06, 0.24); c.lineTo(0.05, 0.62); ln(c, D, 0.1); c.beginPath(); c.moveTo(0.05, -0.5); c.lineTo(-0.1, -0.22); c.lineTo(0.12, -0.02); c.lineTo(-0.06, 0.24); c.lineTo(0.05, 0.62); ln(c, a, 0.04); };
G.bone = (c, k, a) => { const half = (dx, dy, flip) => { c.save(); c.translate(dx, dy); if (flip) c.scale(-1, 1); rr(c, -0.62, -0.1, 0.62, 0.2, 0.08); fs(c, k, 0.05); ci(c, -0.62, -0.14, 0.14); fs(c, k, 0.05); ci(c, -0.62, 0.14, 0.14); fs(c, k, 0.05); c.restore(); }; c.save(); c.rotate(-0.6); half(-0.02, -0.07, false); half(0.02, 0.09, true); c.restore(); seg(c, -0.06, 0.02, 0.1, -0.08, a, 0.07); };
G.caltrop = (c, k, a) => { for (const ang of [-90, -18, -162, 54, 126]) { const r = (ang * Math.PI) / 180; c.save(); c.rotate(r + Math.PI / 2); c.beginPath(); c.moveTo(-0.13, 0); c.lineTo(0, -0.66); c.lineTo(0.13, 0); c.closePath(); fs(c, k, 0.04); c.restore(); } ci(c, 0, 0, 0.16); fs(c, a, 0.04); };
G.flame = (c, k, a) => { flamePath(c); fs(c, k); c.save(); c.translate(0, 0.22); c.scale(0.55, 0.55); flamePath(c); fs(c, a || '#ffd86b', 0); c.restore(); };
G.drop = (c, k, a) => { dropPath(c); fs(c, k); c.beginPath(); c.ellipse(-0.18, 0.12, 0.07, 0.15, 0.3, 0, TAU); c.fillStyle = a || 'rgba(255,255,255,.45)'; c.fill(); };
G.cross = (c, k, a) => { path(c, [-0.15, -0.5, 0.15, -0.5, 0.15, -0.15, 0.5, -0.15, 0.5, 0.15, 0.15, 0.15, 0.15, 0.5, -0.15, 0.5, -0.15, 0.15, -0.5, 0.15, -0.5, -0.15, -0.15, -0.15]); fs(c, k); sub(c, G.sparkle, 0.5, -0.5, 0.3, 0, a, a); };
G.pentacle = (c, k, a) => { ci(c, 0, 0, 0.58); ln(c, a, 0.07); c.beginPath(); for (let i = 0; i <= 5; i++) { const ang = -Math.PI / 2 + ((i * 2) % 5) * (TAU / 5); c[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * 0.58, Math.sin(ang) * 0.58); } ln(c, k, 0.09); };
G.plate = (c, k, a) => { rr(c, -0.58, -0.42, 1.16, 0.84, 0.12); fs(c, k); seg(c, -0.45, -0.22, 0.45, -0.22, 'rgba(255,255,255,.28)', 0.06); for (const [x, y] of [[-0.44, -0.28], [0.44, -0.28], [-0.44, 0.28], [0.44, 0.28]]) { ci(c, x, y, 0.07); fs(c, a || D, 0.03); } };
G.bricks = (c, k, a) => { rr(c, -0.6, -0.5, 1.2, 1, 0.06); c.fillStyle = D; c.fill(); for (let r = 0; r < 4; r++) { const off = r % 2 ? 0.3 : 0; for (let i = -1; i < 3; i++) { const x = -0.6 + off + i * 0.6 + 0.03, w = 0.54; const x0 = Math.max(-0.58, x), x1 = Math.min(0.58, x + w); if (x1 - x0 < 0.08) continue; c.fillStyle = (r + i) % 3 === 0 ? a : k; c.fillRect(x0, -0.48 + r * 0.25, x1 - x0, 0.21); } } };
G.ghost = (c, k, a) => { c.beginPath(); c.moveTo(-0.45, 0.58); c.lineTo(-0.45, -0.08); c.arc(0, -0.08, 0.45, Math.PI, 0); c.lineTo(0.45, 0.58); c.quadraticCurveTo(0.3, 0.38, 0.15, 0.58); c.quadraticCurveTo(0, 0.38, -0.15, 0.58); c.quadraticCurveTo(-0.3, 0.38, -0.45, 0.58); c.closePath(); c.save(); c.globalAlpha *= 0.88; fs(c, k); c.restore(); ci(c, -0.17, -0.12, 0.09); c.fillStyle = D; c.fill(); ci(c, 0.17, -0.12, 0.09); c.fill(); c.beginPath(); c.ellipse(0, 0.14, 0.07, 0.09, 0, 0, TAU); c.fill(); };
G.rings = (c, k, a) => { ci(c, -0.16, 0, 0.38); ln(c, k, 0.13); ci(c, 0.16, 0, 0.38); ln(c, a, 0.13); ci(c, 0.16, 0, 0.12); c.fillStyle = a; c.fill(); };
G.cardDown = (c, k, a) => { rr(c, -0.36, -0.55, 0.72, 1.0, 0.09); fs(c, k); arrow(c, 0, -0.3, 0, 0.18, a, 0.16, 0.3); seg(c, -0.2, 0.34, 0.2, 0.34, a, 0.06); };
G.cardUp = (c, k, a) => { rr(c, -0.36, -0.45, 0.72, 1.0, 0.09); fs(c, k); arrow(c, 0, 0.3, 0, -0.18, a, 0.16, 0.3); };
G.gem = (c, k, a) => { path(c, [0, -0.62, 0.5, -0.1, 0, 0.62, -0.5, -0.1]); fs(c, k); seg(c, -0.5, -0.1, 0.5, -0.1, a, 0.05); seg(c, 0, -0.62, -0.18, -0.1, a, 0.04); seg(c, 0, -0.62, 0.18, -0.1, a, 0.04); seg(c, -0.18, -0.1, 0, 0.62, a, 0.04); seg(c, 0.18, -0.1, 0, 0.62, a, 0.04); };
G.costup = (c, k, a) => { sub(c, G.gem, 0, 0.08, 0.9, 0, k, a); seg(c, 0, -0.34, 0, -0.04, D, 0.1); seg(c, -0.15, -0.19, 0.15, -0.19, D, 0.1); };
G.ringflame = (c, k, a) => { for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; ci(c, Math.cos(an) * 0.58, Math.sin(an) * 0.58, 0.08); c.fillStyle = a; c.fill(); } sub(c, G.flame, 0, 0.04, 0.62, 0, k, '#ffd86b'); };
G.bolt = (c, k, a) => { path(c, [0.14, -0.66, -0.42, 0.1, -0.04, 0.1, -0.16, 0.66, 0.42, -0.12, 0.04, -0.12]); fs(c, k); };
G.sparkle = (c, k, a) => { c.beginPath(); c.moveTo(0, -0.66); c.quadraticCurveTo(0.08, -0.08, 0.66, 0); c.quadraticCurveTo(0.08, 0.08, 0, 0.66); c.quadraticCurveTo(-0.08, 0.08, -0.66, 0); c.quadraticCurveTo(-0.08, -0.08, 0, -0.66); c.closePath(); fs(c, k, 0.03); };
G.gilt = (c, k, a) => { sub(c, G.sparkle, -0.08, 0.05, 0.9, 0, k, a); sub(c, G.sparkle, 0.42, -0.42, 0.28, 0, a, a); sub(c, G.sparkle, 0.4, 0.45, 0.2, 0, a, a); };
G.crosshair = (c, k, a) => { ci(c, 0, 0, 0.38); ln(c, k, 0.1); for (const [x1, y1, x2, y2] of [[0, -0.66, 0, -0.2], [0, 0.66, 0, 0.2], [-0.66, 0, -0.2, 0], [0.66, 0, 0.2, 0]]) seg(c, x1, y1, x2, y2, k, 0.1); ci(c, 0, 0, 0.09); c.fillStyle = a; c.fill(); };
G.stars = (c, k, a) => { ci(c, 0, 0.1, 0.5); c.save(); c.scale(1, 0.4); c.translate(0, 0.25); ci(c, 0, 0, 0.55); c.restore(); c.beginPath(); c.ellipse(0, 0.12, 0.55, 0.22, 0, 0, TAU); ln(c, a, 0.05); for (const [x, y, r] of [[-0.3, -0.18, 0.27], [0.32, -0.05, 0.22], [0.0, -0.5, 0.2]]) { starPath(c, x, y, r); fs(c, k, 0.04); } };
G.stitch = (c, k, a) => { c.beginPath(); c.moveTo(-0.58, 0.42); c.lineTo(-0.2, 0.05); c.lineTo(0.15, -0.05); c.lineTo(0.58, -0.42); ln(c, k, 0.2); for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, x = -0.5 + t * 1.0, y = 0.36 - t * 0.74; seg(c, x - 0.1, y - 0.12, x + 0.1, y + 0.12, a, 0.07); } };
G.dropslash = (c, k, a) => { sub(c, G.drop, 0, 0, 0.95, 0, k); seg(c, -0.55, -0.55, 0.55, 0.55, D, 0.2); seg(c, -0.55, -0.55, 0.55, 0.55, a, 0.09); };
G.dagger = (c, k, a) => { c.beginPath(); c.moveTo(0, -0.7); c.lineTo(0.12, 0.05); c.lineTo(-0.12, 0.05); c.closePath(); fs(c, k); seg(c, -0.3, 0.05, 0.3, 0.05, a, 0.1); seg(c, 0, 0.05, 0, 0.5, a, 0.12); ci(c, 0, 0.58, 0.07); c.fillStyle = a; c.fill(); };
G.bloodrite = (c, k, a) => { sub(c, G.dagger, -0.12, 0, 0.9, 0.5, '#d8d8e0', '#8a5a2a'); sub(c, G.drop, 0.38, 0.38, 0.4, 0, k); };
G.flames3 = (c, k, a) => { sub(c, G.flame, -0.38, 0.2, 0.5, 0, k, a); sub(c, G.flame, 0.38, 0.2, 0.5, 0, k, a); sub(c, G.flame, 0, 0.0, 0.78, 0, k, a); };
G.ember = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, 0.45); c.quadraticCurveTo(-0.55, 0.0, -0.2, 0.0); c.quadraticCurveTo(0, -0.1, 0.25, 0.0); c.quadraticCurveTo(0.58, 0.05, 0.5, 0.45); c.closePath(); fs(c, '#3a2a24'); seg(c, -0.3, 0.3, -0.1, 0.12, k, 0.07); seg(c, -0.1, 0.12, 0.15, 0.3, k, 0.07); seg(c, 0.15, 0.3, 0.32, 0.14, k, 0.07); c.beginPath(); c.moveTo(0, -0.1); c.bezierCurveTo(-0.25, -0.3, 0.25, -0.4, 0, -0.62); ln(c, a, 0.07); };
G.candle = (c, k, a) => { rr(c, -0.2, -0.12, 0.4, 0.74, 0.05); fs(c, k); c.beginPath(); c.moveTo(-0.2, -0.12); c.quadraticCurveTo(-0.1, 0.1, -0.12, 0.0); ln(c, 'rgba(255,255,255,.4)', 0.04); c.beginPath(); c.ellipse(0.12, 0.1, 0.05, 0.12, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill(); seg(c, 0, -0.12, 0, -0.24, D, 0.05); sub(c, G.flame, 0, -0.42, 0.3, 0, a, '#fff3b0'); };
G.gear = (c, k, a) => { const n = 8; c.beginPath(); for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU; const w = 0.17; c.lineTo(Math.cos(a0 - w) * 0.42, Math.sin(a0 - w) * 0.42); c.lineTo(Math.cos(a0 - w * 0.7) * 0.62, Math.sin(a0 - w * 0.7) * 0.62); c.lineTo(Math.cos(a0 + w * 0.7) * 0.62, Math.sin(a0 + w * 0.7) * 0.62); c.lineTo(Math.cos(a0 + w) * 0.42, Math.sin(a0 + w) * 0.42); } c.closePath(); fs(c, k); ci(c, 0, 0, 0.17); fs(c, a || D, 0.04); };
G.dynamo = (c, k, a) => { sub(c, G.gear, 0, 0, 1, 0, k, D); sub(c, G.bolt, 0, 0, 0.42, 0, a, a); };
G.barrel = (c, k, a) => { c.beginPath(); c.moveTo(-0.38, -0.45); c.quadraticCurveTo(-0.62, 0.0, -0.38, 0.5); c.lineTo(0.38, 0.5); c.quadraticCurveTo(0.62, 0.0, 0.38, -0.45); c.closePath(); fs(c, k); seg(c, -0.5, -0.2, 0.5, -0.2, a, 0.07); seg(c, -0.5, 0.25, 0.5, 0.25, a, 0.07); c.beginPath(); c.moveTo(0, -0.45); c.quadraticCurveTo(0.1, -0.7, 0.3, -0.62); ln(c, '#d8c8a0', 0.05); sub(c, G.sparkle, 0.34, -0.62, 0.2, 0, '#ffd86b', '#ffd86b'); };
G.coin = (c, k, a) => { ci(c, 0, 0, 0.55); fs(c, k); ci(c, 0, 0, 0.38); ln(c, a, 0.05); seg(c, 0, -0.2, 0, 0.2, a, 0.08); seg(c, -0.14, -0.1, 0.14, -0.1, a, 0.06); seg(c, -0.14, 0.1, 0.14, 0.1, a, 0.06); };
G.locket = (c, k, a) => { c.beginPath(); c.arc(0, -0.36, 0.26, Math.PI * 1.1, Math.PI * 1.9); ln(c, a, 0.06); ci(c, 0, 0.14, 0.42); fs(c, k); ci(c, 0, 0.14, 0.31); ln(c, a, 0.04); sub(c, (cc) => { heartPath(cc, 0.5); fs(cc, D, 0); }, 0, 0.13, 0.8, 0, D, D); };
G.purse = (c, k, a) => { c.beginPath(); c.moveTo(-0.22, -0.34); c.bezierCurveTo(-0.7, 0.0, -0.66, 0.62, 0, 0.62); c.bezierCurveTo(0.66, 0.62, 0.7, 0.0, 0.22, -0.34); c.closePath(); fs(c, k); rr(c, -0.28, -0.42, 0.56, 0.14, 0.05); fs(c, a, 0.04); c.beginPath(); c.moveTo(-0.22, -0.46); c.lineTo(-0.32, -0.64); c.moveTo(0.22, -0.46); c.lineTo(0.32, -0.64); ln(c, a, 0.07); sub(c, G.coin, 0, 0.18, 0.42, 0, a, D); };
G.scroll = (c, k, a) => { rr(c, -0.4, -0.5, 0.8, 1.0, 0.07); fs(c, k); for (let i = 0; i < 4; i++) seg(c, -0.25, -0.3 + i * 0.2, 0.25, -0.3 + i * 0.2, D, 0.05); seg(c, -0.18, 0.48, -0.04, 0.34, a, 0.1); seg(c, -0.04, 0.34, 0.24, 0.6, a, 0.1); };
G.swerve = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, 0.55); c.bezierCurveTo(-0.5, 0.0, 0.4, 0.1, 0.3, -0.35); ln(c, D, 0.26); c.beginPath(); c.moveTo(-0.5, 0.55); c.bezierCurveTo(-0.5, 0.0, 0.4, 0.1, 0.3, -0.35); ln(c, k, 0.14); arrow(c, 0.3, -0.3, 0.3, -0.58, k, 0.01, 0.34); seg(c, -0.1, 0.55, 0.0, 0.55, a, 0.07); seg(c, 0.2, 0.55, 0.3, 0.55, a, 0.07); };
G.eyeshut = (c, k, a) => { c.beginPath(); c.moveTo(-0.62, 0); c.quadraticCurveTo(0, -0.62, 0.62, 0); c.quadraticCurveTo(0, 0.62, -0.62, 0); c.closePath(); fs(c, k); ci(c, 0, 0, 0.2); fs(c, D, 0); seg(c, -0.55, 0.5, 0.55, -0.5, D, 0.2); seg(c, -0.55, 0.5, 0.55, -0.5, a, 0.09); };
G.eye = (c, k, a) => { c.beginPath(); c.moveTo(-0.66, 0); c.quadraticCurveTo(0, -0.7, 0.66, 0); c.quadraticCurveTo(0, 0.7, -0.66, 0); c.closePath(); fs(c, k); ci(c, 0, 0, 0.27); fs(c, a, 0.04); ci(c, 0, 0, 0.12); c.fillStyle = D; c.fill(); ci(c, -0.06, -0.07, 0.04); c.fillStyle = '#fff'; c.fill(); };
G.seam = (c, k, a) => { rr(c, -0.6, -0.5, 0.52, 1.0, 0.06); fs(c, k, 0.05); rr(c, 0.08, -0.5, 0.52, 1.0, 0.06); fs(c, shade(k.startsWith('#') ? k : '#aaaaaa', 0.85), 0.05); for (let i = 0; i < 3; i++) { const y = -0.32 + i * 0.32; seg(c, -0.16, y - 0.1, 0.16, y + 0.1, a, 0.09); seg(c, 0.16, y - 0.1, -0.16, y + 0.1, a, 0.09); } };
G.seamheavy = (c, k, a) => { sub(c, G.seam, 0, 0, 1, 0, k, a); seg(c, 0, -0.55, 0, 0.55, D, 0.05); };
G.recall = (c, k, a) => { c.beginPath(); c.arc(0, 0, 0.45, -0.4, 4.9); ln(c, k, 0.14); const ex = Math.cos(-0.4) * 0.45, ey = Math.sin(-0.4) * 0.45; path(c, [ex + 0.25, ey - 0.02, ex - 0.02, ey - 0.28, ex - 0.08, ey + 0.2]); fs(c, k, 0.03); ci(c, 0, 0, 0.1); c.fillStyle = a; c.fill(); };
G.clock = (c, k, a) => { ci(c, 0, 0, 0.55); fs(c, '#2a221e'); ln(c, k, 0.09); seg(c, 0, 0, 0, -0.34, k, 0.09); seg(c, 0, 0, 0.24, 0.12, a, 0.09); for (let i = 0; i < 12; i += 3) { const an = (i / 12) * TAU; seg(c, Math.cos(an) * 0.4, Math.sin(an) * 0.4, Math.cos(an) * 0.48, Math.sin(an) * 0.48, k, 0.05); } };
G.battery = (c, k, a) => { rr(c, -0.5, -0.3, 0.95, 0.6, 0.08); fs(c, '#2a221e'); ln(c, k, 0.08); rr(c, 0.45, -0.12, 0.12, 0.24, 0.03); fs(c, k, 0.03); for (let i = 0; i < 3; i++) { rr(c, -0.42 + i * 0.28, -0.2, 0.22, 0.4, 0.03); fs(c, i < 2 ? a : 'rgba(255,255,255,.18)', 0); } };
G.hook = (c, k, a) => { c.beginPath(); c.moveTo(0.1, -0.62); c.lineTo(0.1, 0.2); c.arc(-0.12, 0.2, 0.22, 0, Math.PI * 0.95); c.lineTo(-0.36, 0.05); ln(c, D, 0.2); c.beginPath(); c.moveTo(0.1, -0.62); c.lineTo(0.1, 0.2); c.arc(-0.12, 0.2, 0.22, 0, Math.PI * 0.95); c.lineTo(-0.36, 0.05); ln(c, k, 0.1); ci(c, 0.1, -0.64, 0.07); ln(c, k, 0.05); c.beginPath(); c.ellipse(-0.42, -0.1, 0.1, 0.18, 0.4, 0, TAU); fs(c, a, 0.03); };
G.holes = (c, k, a) => { ci(c, 0, -0.05, 0.52); fs(c, k); for (const [x, y, r] of [[-0.2, -0.2, 0.12], [0.18, -0.05, 0.15], [-0.08, 0.15, 0.09], [0.2, -0.32, 0.07]]) { ci(c, x, y, r); c.fillStyle = D; c.fill(); } ln(c, k, 0.01); for (const x of [-0.25, 0, 0.25]) { c.beginPath(); c.ellipse(x, 0.52 + (x ? 0.04 : 0), 0.05, 0.08, 0, 0, TAU); c.fillStyle = a; c.fill(); } };
G.mirror = (c, k, a) => { c.beginPath(); c.ellipse(0, -0.14, 0.38, 0.46, 0, 0, TAU); fs(c, a); c.beginPath(); c.ellipse(0, -0.14, 0.29, 0.37, 0, 0, TAU); fs(c, '#bfe3ea', 0); rr(c, -0.07, 0.3, 0.14, 0.34, 0.06); fs(c, k, 0.04); seg(c, -0.16, -0.34, -0.02, -0.46, '#fff', 0.07); };
G.cleaver = (c, k, a) => { c.save(); c.rotate(0.5); c.beginPath(); c.moveTo(-0.08, 0.05); c.lineTo(-0.08, -0.65); c.lineTo(0.42, -0.55); c.lineTo(0.42, -0.1); c.lineTo(0.08, 0.05); c.closePath(); fs(c, k); rr(c, -0.06, 0.02, 0.14, 0.58, 0.05); fs(c, a, 0.04); c.restore(); for (let i = 0; i < 3; i++) seg(c, -0.62, -0.5 + i * 0.16, -0.46, -0.5 + i * 0.16, a, 0.05); };
G.tally = (c, k, a) => { for (let i = 0; i < 4; i++) seg(c, -0.4 + i * 0.22, -0.45, -0.4 + i * 0.22, 0.35, k, 0.1); seg(c, -0.55, 0.28, 0.4, -0.38, a, 0.1); seg(c, 0.5, -0.2, 0.5, 0.5, k, 0.1); };
G.tag = (c, k, a) => { path(c, [-0.55, 0.0, -0.15, -0.5, 0.55, -0.5, 0.55, 0.5, -0.15, 0.5]); fs(c, k); ci(c, -0.2, 0, 0.09); fs(c, D, 0); c.beginPath(); c.moveTo(-0.2, 0); c.bezierCurveTo(-0.6, -0.4, -0.5, -0.7, -0.3, -0.62); ln(c, a, 0.05); sub(c, G.coin, 0.24, 0, 0.45, 0, a, D); };
G.scales = (c, k, a) => { seg(c, 0, -0.55, 0, 0.5, k, 0.1); seg(c, -0.4, 0.58, 0.4, 0.58, k, 0.12); seg(c, -0.55, -0.35, 0.55, -0.35, k, 0.09); for (const s of [-1, 1]) { seg(c, s * 0.55, -0.35, s * 0.55, 0.0, a, 0.04); c.beginPath(); c.arc(s * 0.55, 0.0, 0.2, 0, Math.PI); c.closePath(); fs(c, k, 0.04); } };
G.percent = (c, k, a) => { ci(c, 0, 0, 0.58); fs(c, '#2a221e'); ln(c, a, 0.06); ci(c, -0.2, -0.2, 0.11); ln(c, k, 0.09); ci(c, 0.2, 0.2, 0.11); ln(c, k, 0.09); seg(c, 0.22, -0.28, -0.22, 0.28, k, 0.1); };
G.jar = (c, k, a) => { rr(c, -0.3, -0.62, 0.6, 0.16, 0.05); fs(c, a, 0.04); rr(c, -0.42, -0.46, 0.84, 1.08, 0.18); fs(c, 'rgba(120,170,160,.35)', 0.05); rr(c, -0.42, -0.1, 0.84, 0.72, 0.16); fs(c, k, 0); for (const [x, y, r] of [[-0.12, 0.2, 0.06], [0.14, 0.05, 0.05], [0.0, 0.38, 0.04]]) { ci(c, x, y, r); ln(c, 'rgba(255,255,255,.6)', 0.03); } seg(c, -0.3, -0.34, -0.3, 0.1, 'rgba(255,255,255,.4)', 0.05); };
G.marionette = (c, k, a) => { seg(c, -0.4, -0.55, 0.4, -0.55, k, 0.1); seg(c, 0, -0.55, 0, -0.38, k, 0.08); for (const x of [-0.4, 0, 0.4]) seg(c, x, -0.55, x * 0.7, 0.2, a, 0.04); ci(c, 0, 0.42, 0.18); fs(c, k, 0.04); ci(c, -0.28, 0.2, 0.08); fs(c, k, 0.03); ci(c, 0.28, 0.2, 0.08); fs(c, k, 0.03); };
G.goblet = (c, k, a) => { c.beginPath(); c.moveTo(-0.4, -0.55); c.lineTo(0.4, -0.55); c.quadraticCurveTo(0.42, -0.05, 0, 0.1); c.quadraticCurveTo(-0.42, -0.05, -0.4, -0.55); c.closePath(); c.save(); c.globalAlpha *= 0.85; fs(c, k); c.restore(); seg(c, 0, 0.1, 0, 0.5, k, 0.09); seg(c, -0.3, 0.55, 0.3, 0.55, k, 0.1); c.beginPath(); c.moveTo(0.05, -0.55); c.lineTo(-0.08, -0.3); c.lineTo(0.1, -0.12); c.lineTo(-0.02, 0.06); ln(c, D, 0.07); };
G.curtain = (c, k, a) => { seg(c, -0.62, -0.55, 0.62, -0.55, a, 0.1); for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.62, -0.5); c.lineTo(s * 0.1, -0.5); c.quadraticCurveTo(s * 0.4, 0.0, s * 0.12, 0.6); c.lineTo(s * 0.62, 0.6); c.closePath(); fs(c, k); for (let i = 1; i < 4; i++) seg(c, s * (0.1 + i * 0.13), -0.45, s * (0.18 + i * 0.12), 0.55, 'rgba(0,0,0,.35)', 0.04); } };
G.baton = (c, k, a) => { c.save(); c.rotate(-0.7); rr(c, -0.04, -0.62, 0.08, 1.0, 0.04); fs(c, k, 0.04); c.beginPath(); c.ellipse(0, 0.48, 0.1, 0.17, 0, 0, TAU); fs(c, a, 0.04); c.restore(); ci(c, 0.3, 0.4, 0.1); fs(c, k, 0.03); seg(c, 0.39, 0.4, 0.39, 0.0, k, 0.06); seg(c, 0.39, 0.0, 0.52, 0.1, k, 0.06); };
// ---- relic glyphs ----
G.bag = (c, k, a) => { rr(c, -0.58, -0.22, 1.16, 0.78, 0.14); fs(c, k); c.beginPath(); c.arc(0, -0.22, 0.3, Math.PI, 0); ln(c, D, 0.14); c.beginPath(); c.arc(0, -0.22, 0.3, Math.PI, 0); ln(c, a, 0.07); seg(c, 0, 0.0, 0, 0.4, a, 0.12); seg(c, -0.2, 0.2, 0.2, 0.2, a, 0.12); };
G.matchbox = (c, k, a) => { rr(c, -0.5, -0.1, 1.0, 0.6, 0.06); fs(c, k); rr(c, -0.5, -0.1, 1.0, 0.14, 0.04); fs(c, a, 0.03); seg(c, 0.0, -0.1, 0.0, 0.2, D, 0.04); c.save(); c.rotate(-0.6); rr(c, -0.04, -0.7, 0.08, 0.6, 0.03); fs(c, '#d8c8a0', 0.03); ci(c, 0, -0.74, 0.1); fs(c, '#e84a2a', 0.03); c.restore(); };
G.tin = (c, k, a) => { c.beginPath(); c.ellipse(0, -0.12, 0.55, 0.22, 0, 0, TAU); fs(c, a); rr(c, -0.55, -0.12, 1.1, 0.56, 0.05); fs(c, k); c.beginPath(); c.ellipse(0, 0.44, 0.55, 0.12, 0, 0, Math.PI); fs(c, k); c.beginPath(); c.ellipse(0, -0.12, 0.55, 0.22, 0, 0, TAU); fs(c, a, 0.05); sub(c, G.coin, 0, -0.14, 0.3, 0, '#f2c14e', D); };
G.bandage = (c, k, a) => { ci(c, -0.1, 0.02, 0.5); fs(c, k); ci(c, -0.1, 0.02, 0.2); fs(c, D, 0); ci(c, -0.1, 0.02, 0.35); ln(c, 'rgba(0,0,0,.25)', 0.03); c.beginPath(); c.moveTo(0.3, 0.38); c.lineTo(0.6, 0.55); c.lineTo(0.5, 0.65); c.lineTo(0.1, 0.5); c.closePath(); fs(c, k); seg(c, -0.1, -0.1, 0.0, 0.1, a, 0.07); };
G.vial = (c, k, a) => { rr(c, -0.17, -0.64, 0.34, 0.2, 0.05); fs(c, a, 0.04); rr(c, -0.22, -0.46, 0.44, 1.1, 0.14); fs(c, 'rgba(140,180,200,.35)', 0.05); rr(c, -0.22, 0.0, 0.44, 0.64, 0.14); fs(c, k, 0); rr(c, -0.26, -0.15, 0.52, 0.24, 0.02); fs(c, '#e8dcc4', 0.03); };
G.snow = (c, k, a) => { for (let i = 0; i < 3; i++) { const an = (i / 3) * Math.PI; seg(c, Math.cos(an) * 0.62, Math.sin(an) * 0.62, -Math.cos(an) * 0.62, -Math.sin(an) * 0.62, k, 0.1); } for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; const x = Math.cos(an) * 0.4, y = Math.sin(an) * 0.4; seg(c, x, y, x + Math.cos(an + 2.2) * 0.17, y + Math.sin(an + 2.2) * 0.17, a, 0.07); seg(c, x, y, x + Math.cos(an - 2.2) * 0.17, y + Math.sin(an - 2.2) * 0.17, a, 0.07); } };
G.receipt = (c, k, a) => { c.beginPath(); c.moveTo(-0.38, -0.62); c.lineTo(0.38, -0.62); for (let i = 0; i < 6; i++) c.lineTo(0.38 - (i % 2 ? 0 : 0.0), 0.62 - 0.0); c.lineTo(0.38, 0.62); for (let i = 0; i < 5; i++) { c.lineTo(0.38 - (i + 0.5) * 0.152, 0.5); c.lineTo(0.38 - (i + 1) * 0.152, 0.62); } c.closePath(); fs(c, k); for (let i = 0; i < 4; i++) seg(c, -0.24, -0.42 + i * 0.2, 0.2 - (i === 3 ? 0.2 : 0), -0.42 + i * 0.2, D, 0.06); seg(c, -0.2, 0.3, 0.2, 0.3, a, 0.09); };
G.drawer = (c, k, a) => { rr(c, -0.58, -0.4, 1.16, 0.9, 0.08); fs(c, k); rr(c, -0.48, -0.3, 0.96, 0.7, 0.05); ln(c, D, 0.05); rr(c, -0.15, -0.02, 0.3, 0.1, 0.05); fs(c, a, 0.03); seg(c, -0.3, -0.42, -0.1, -0.62, a, 0.07); seg(c, 0.2, -0.42, 0.34, -0.58, '#d8c8a0', 0.07); };
G.spool = (c, k, a) => { rr(c, -0.4, -0.5, 0.8, 0.16, 0.05); fs(c, '#caa66a', 0.04); rr(c, -0.4, 0.34, 0.8, 0.16, 0.05); fs(c, '#caa66a', 0.04); rr(c, -0.3, -0.34, 0.6, 0.68, 0.04); fs(c, k, 0.04); for (let i = 0; i < 4; i++) seg(c, -0.3, -0.24 + i * 0.17, 0.3, -0.18 + i * 0.17, 'rgba(0,0,0,.25)', 0.03); c.beginPath(); c.moveTo(0.3, 0.0); c.bezierCurveTo(0.7, 0.1, 0.4, 0.5, 0.62, 0.62); ln(c, k, 0.06); };
G.weight = (c, k, a) => { c.beginPath(); c.moveTo(-0.28, -0.2); c.lineTo(0.28, -0.2); c.lineTo(0.6, 0.55); c.lineTo(-0.6, 0.55); c.closePath(); fs(c, k); c.beginPath(); c.arc(0, -0.34, 0.2, Math.PI, 0); ln(c, D, 0.12); c.beginPath(); c.arc(0, -0.34, 0.2, Math.PI, 0); ln(c, k, 0.06); c.save(); c.fillStyle = D; c.font = 'bold 0.3px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('10', 0, 0.28); c.restore(); };
G.sterile = (c, k, a) => { path(c, [-0.55, -0.4, 0.55, -0.4, 0.55, 0.5, -0.55, 0.5]); fs(c, k); path(c, [-0.55, -0.4, -0.55, 0.5, -0.1, 0.1]); c.fillStyle = 'rgba(0,0,0,.12)'; c.fill(); ci(c, 0.05, 0.05, 0.22); fs(c, '#2a221e', 0); sub(c, G.cross, 0.05, 0.05, 0.28, 0, a, a); sub(c, G.sparkle, 0.4, -0.25, 0.14, 0, '#fff', '#fff'); };
G.dish = (c, k, a) => { c.beginPath(); c.ellipse(0, 0.2, 0.62, 0.22, 0, 0, TAU); fs(c, k); c.beginPath(); c.ellipse(0, 0.14, 0.45, 0.13, 0, 0, TAU); fs(c, D, 0); for (const [x, y] of [[-0.18, -0.08], [0.1, -0.16], [0.0, 0.0], [0.22, -0.02]]) sub(c, G.coin, x, y, 0.3, 0, a, D); };
G.glove = (c, k, a) => { rr(c, -0.4, 0.15, 0.8, 0.45, 0.08); fs(c, a); c.beginPath(); c.moveTo(-0.35, 0.2); c.lineTo(-0.38, -0.2); for (let i = 0; i < 4; i++) { rr(c, -0.4 + i * 0.2, -0.58 + (i === 1 || i === 2 ? -0.06 : 0), 0.17, 0.5, 0.08); fs(c, k, 0.04); } rr(c, -0.38, -0.12, 0.76, 0.4, 0.1); fs(c, k, 0.04); rr(c, 0.3, -0.04, 0.3, 0.16, 0.08); fs(c, k, 0.04); };
G.soap = (c, k, a) => { rr(c, -0.5, 0.0, 0.8, 0.5, 0.18); fs(c, k); for (const [x, y, r] of [[-0.1, -0.2, 0.18], [0.3, -0.42, 0.12], [0.35, -0.12, 0.09], [-0.4, -0.42, 0.1]]) { ci(c, x, y, r); fs(c, 'rgba(200,235,255,.35)', 0); ln(c, a, 0.04); } seg(c, -0.3, 0.2, 0.1, 0.2, 'rgba(255,255,255,.5)', 0.05); };
G.clot = (c, k, a) => { sub(c, G.drop, 0, 0, 1, 0, k); for (const [x1, y1, x2, y2] of [[-0.2, 0.15, 0.2, 0.15], [-0.28, 0.35, 0.28, 0.35], [-0.12, -0.12, 0.12, -0.12]]) seg(c, x1, y1, x2, y2, a, 0.06); seg(c, -0.1, 0.08, -0.2, 0.5, a, 0.05); seg(c, 0.12, 0.08, 0.2, 0.5, a, 0.05); };
G.speech = (c, k, a) => { c.beginPath(); c.moveTo(-0.2, 0.55); c.lineTo(-0.08, 0.28); c.lineTo(-0.1, 0.28); c.closePath(); rr(c, -0.62, -0.5, 0.9, 0.62, 0.2); fs(c, k); rr(c, -0.2, -0.22, 0.82, 0.55, 0.18); fs(c, a, 0.05); for (let i = 0; i < 3; i++) { ci(c, -0.36 + i * 0.18, -0.2, 0.05); c.fillStyle = D; c.fill(); } };
G.iron = (c, k, a) => { rr(c, -0.04, -0.2, 0.08, 0.84, 0.04); c.save(); c.rotate(0.0); rr(c, -0.12, 0.3, 0.24, 0.34, 0.06); fs(c, '#7a5a3a', 0.04); c.restore(); rr(c, -0.4, -0.58, 0.8, 0.5, 0.06); fs(c, k); seg(c, -0.04, -0.08, -0.04, 0.34, k, 0.1); seg(c, -0.22, -0.46, -0.22, -0.18, a, 0.09); seg(c, -0.22, -0.46, 0.2, -0.46, a, 0.09); seg(c, 0.2, -0.46, 0.2, -0.18, a, 0.09); };
G.lens = (c, k, a) => { ci(c, -0.12, -0.12, 0.4); fs(c, 'rgba(150,200,220,.35)', 0.05); ln(c, k, 0.12); seg(c, 0.17, 0.17, 0.55, 0.55, k, 0.16); sub(c, G.eye, -0.12, -0.12, 0.3, 0, '#fff', a); };
G.wardshield = (c, k, a) => { sub(c, (cc) => { shieldPath(cc, 1.05); fs(cc, k); }, 0, 0, 1); sub(c, G.sparkle, 0, -0.02, 0.5, 0, a, a); };
G.clamp = (c, k, a) => { c.save(); c.rotate(0.6); c.beginPath(); c.moveTo(-0.28, 0.6); c.lineTo(-0.1, -0.35); c.lineTo(-0.1, -0.66); ln(c, D, 0.22); c.beginPath(); c.moveTo(0.28, 0.6); c.lineTo(0.1, -0.35); c.lineTo(0.1, -0.66); ln(c, D, 0.22); c.beginPath(); c.moveTo(-0.28, 0.6); c.lineTo(-0.1, -0.35); c.lineTo(-0.1, -0.66); ln(c, k, 0.12); c.beginPath(); c.moveTo(0.28, 0.6); c.lineTo(0.1, -0.35); c.lineTo(0.1, -0.66); ln(c, k, 0.12); ci(c, 0, 0.02, 0.1); fs(c, a, 0.04); for (let i = 0; i < 3; i++) seg(c, -0.1, -0.5 + i * 0.07, 0.1, -0.5 + i * 0.07, D, 0.03); c.restore(); };
G.valve = (c, k, a) => { seg(c, 0, 0, 0, 0.62, k, 0.14); rr(c, -0.2, 0.5, 0.4, 0.14, 0.04); fs(c, k, 0.04); ci(c, 0, -0.1, 0.46); ln(c, k, 0.12); for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + 0.4; seg(c, 0, -0.1, Math.cos(an) * 0.44, -0.1 + Math.sin(an) * 0.44, k, 0.09); } ci(c, 0, -0.1, 0.12); fs(c, a, 0.04); };
G.gauge = (c, k, a) => { ci(c, 0, 0.05, 0.56); fs(c, '#2a221e'); ln(c, k, 0.1); for (let i = 0; i < 7; i++) { const an = Math.PI * (0.85 + (i / 6) * 1.3); seg(c, Math.cos(an) * 0.42, 0.05 + Math.sin(an) * 0.42, Math.cos(an) * 0.5, 0.05 + Math.sin(an) * 0.5, i > 4 ? '#ff7a7a' : k, 0.06); } seg(c, 0, 0.05, 0.3, -0.25, a, 0.08); ci(c, 0, 0.05, 0.07); c.fillStyle = a; c.fill(); };
G.palm = (c, k, a) => { for (let i = 0; i < 4; i++) { rr(c, -0.38 + i * 0.2, -0.62 + (i === 0 || i === 3 ? 0.1 : 0) + (i === 1 || i === 2 ? 0 : 0), 0.16, 0.6, 0.08); fs(c, k, 0.04); } rr(c, -0.38, -0.12, 0.76, 0.7, 0.2); fs(c, k, 0.04); c.save(); c.translate(-0.42, 0.05); c.rotate(-0.8); rr(c, -0.08, -0.3, 0.17, 0.4, 0.08); fs(c, k, 0.04); c.restore(); seg(c, -0.1, 0.2, 0.15, 0.2, a, 0.04); seg(c, 0.0, 0.3, 0.2, 0.3, a, 0.04); };
G.oilcan = (c, k, a) => { rr(c, -0.4, -0.05, 0.62, 0.6, 0.1); fs(c, k); c.beginPath(); c.moveTo(0.2, 0.05); c.lineTo(0.62, -0.5); ln(c, D, 0.16); c.beginPath(); c.moveTo(0.2, 0.05); c.lineTo(0.62, -0.5); ln(c, k, 0.08); rr(c, -0.3, -0.18, 0.4, 0.13, 0.04); fs(c, a, 0.04); c.beginPath(); c.ellipse(0.66, -0.3, 0.05, 0.1, 0, 0, TAU); c.fillStyle = '#f2c14e'; c.fill(); seg(c, -0.25, 0.1, -0.25, 0.4, 'rgba(255,255,255,.3)', 0.05); };
G.seal = (c, k, a) => { c.beginPath(); for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU, r = i % 2 ? 0.5 : 0.6; c[i ? 'lineTo' : 'moveTo'](Math.cos(an) * r, Math.sin(an) * r); } c.closePath(); fs(c, k); ci(c, 0, 0, 0.34); ln(c, 'rgba(0,0,0,.35)', 0.05); sub(c, G.cross, 0, 0, 0.36, 0, a, a); };
G.hammer = (c, k, a) => { c.save(); c.rotate(0.6); rr(c, -0.07, -0.25, 0.14, 0.9, 0.05); fs(c, '#8a5f3a', 0.04); rr(c, -0.4, -0.55, 0.8, 0.34, 0.07); fs(c, k); seg(c, 0.2, -0.5, 0.2, -0.26, a, 0.05); c.restore(); };
G.dustpan = (c, k, a) => { c.beginPath(); c.moveTo(-0.6, 0.45); c.lineTo(0.3, 0.45); c.lineTo(0.55, 0.0); c.lineTo(-0.6, 0.2); c.closePath(); fs(c, k); seg(c, 0.55, 0.0, 0.62, -0.5, a, 0.1); for (const [x, y, r] of [[-0.3, 0.05, 0.05], [0, 0.0, 0.04], [-0.1, -0.2, 0.04], [0.2, -0.15, 0.05], [-0.4, -0.25, 0.03]]) { ci(c, x, y, r); c.fillStyle = '#d6c7a6'; c.fill(); } };
G.billcheck = (c, k, a) => { rr(c, -0.58, -0.38, 1.16, 0.76, 0.06); fs(c, k); rr(c, -0.5, -0.3, 1.0, 0.6, 0.04); ln(c, D, 0.04); c.beginPath(); c.moveTo(-0.28, 0.0); c.lineTo(-0.06, 0.2); c.lineTo(0.3, -0.2); ln(c, D, 0.17); c.beginPath(); c.moveTo(-0.28, 0.0); c.lineTo(-0.06, 0.2); c.lineTo(0.3, -0.2); ln(c, a, 0.09); };
G.saint = (c, k, a) => { c.beginPath(); c.ellipse(0, -0.42, 0.34, 0.1, 0, 0, TAU); ln(c, a, 0.07); c.beginPath(); c.moveTo(-0.38, 0.62); c.lineTo(-0.3, 0.2); c.quadraticCurveTo(0, 0.05, 0.3, 0.2); c.lineTo(0.38, 0.62); c.closePath(); c.save(); c.globalAlpha *= 0.85; fs(c, k); c.restore(); ci(c, 0, -0.1, 0.26); c.save(); c.globalAlpha *= 0.85; fs(c, k); c.restore(); seg(c, 0.0, -0.3, -0.12, -0.05, D, 0.04); seg(c, -0.12, -0.05, 0.08, 0.1, D, 0.04); };
G.puzzle = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, -0.5); c.lineTo(-0.1, -0.5); c.arc(0.0, -0.6, 0.12, Math.PI, 0, false); c.lineTo(0.5, -0.5); c.lineTo(0.5, -0.1); c.arc(0.62, 0.0, 0.12, -Math.PI / 2, Math.PI / 2, false); c.lineTo(0.5, 0.5); c.lineTo(0.1, 0.5); c.lineTo(-0.5, 0.5); c.lineTo(-0.5, 0.1); c.arc(-0.38, 0.0, 0.12, Math.PI / 2, -Math.PI / 2, true); c.closePath(); fs(c, k); seg(c, -0.1, -0.1, 0.1, 0.1, a, 0.06); };
G.ledger = (c, k, a) => { rr(c, -0.46, -0.58, 0.92, 1.16, 0.07); fs(c, k); rr(c, -0.46, -0.58, 0.14, 1.16, 0.05); fs(c, a, 0.04); for (let i = 0; i < 4; i++) seg(c, -0.18, -0.34 + i * 0.22, 0.34, -0.34 + i * 0.22, D, 0.05); sub(c, G.coin, 0.2, 0.42, 0.26, 0, a, D); };
G.vault = (c, k, a) => { rr(c, -0.56, -0.56, 1.12, 1.12, 0.1); fs(c, k); ci(c, 0, 0, 0.34); fs(c, '#2a221e'); ln(c, a, 0.06); for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; seg(c, 0, 0, Math.cos(an) * 0.3, Math.sin(an) * 0.3, a, 0.06); } ci(c, 0, 0, 0.07); fs(c, a, 0.03); };
G.monolith = (c, k, a) => { path(c, [-0.22, 0.6, -0.3, -0.5, 0.0, -0.66, 0.3, -0.5, 0.22, 0.6]); fs(c, k); seg(c, -0.1, -0.4, -0.12, 0.4, 'rgba(255,255,255,.2)', 0.05); ln(c, a, 0.01); c.beginPath(); c.ellipse(0, 0.62, 0.5, 0.1, 0, 0, TAU); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill(); sub(c, G.sparkle, 0, -0.1, 0.16, 0, a, a); };
G.gate = (c, k, a) => { rr(c, -0.55, 0.0, 0.2, 0.62, 0.04); fs(c, '#8a5f3a', 0.04); rr(c, -0.4, -0.12, 1.0, 0.18, 0.04); fs(c, k); for (let i = 0; i < 4; i++) { c.save(); c.beginPath(); c.rect(-0.3 + i * 0.22, -0.12, 0.11, 0.18); c.fillStyle = i % 2 ? a : '#fff'; c.fill(); c.restore(); } ci(c, -0.45, 0.0, 0.08); fs(c, a, 0.03); sub(c, G.coin, 0.3, 0.38, 0.32, 0, '#f2c14e', D); };
G.moneyeye = (c, k, a) => { sub(c, G.coin, 0, 0, 1.1, 0, k, a); sub(c, G.eye, 0, 0, 0.5, 0, '#fff', D); };
G.engine = (c, k, a) => { sub(c, G.gear, -0.18, 0.1, 0.7, 0, k, a); sub(c, G.gear, 0.28, -0.22, 0.5, 0.3, a, D); seg(c, -0.55, 0.62, 0.62, 0.62, k, 0.1); for (let i = 0; i < 2; i++) seg(c, 0.4 + i * 0.1, -0.62, 0.45 + i * 0.1, -0.7, '#8a8a8a', 0.05); };
G.deck = (c, k, a) => { for (let i = 0; i < 3; i++) { c.save(); c.rotate((i - 1) * 0.22); c.translate((i - 1) * 0.1, 0); rr(c, -0.3, -0.5, 0.6, 0.95, 0.07); fs(c, i === 2 ? k : shade(k.startsWith('#') ? k : '#bbbbbb', 0.7 + i * 0.1), 0.05); if (i === 2) sub(c, G.stitch, 0, 0, 0.3, 0, a, a); c.restore(); } };
G.patch = (c, k, a) => { rr(c, -0.5, -0.4, 1.0, 0.8, 0.1); fs(c, k); rr(c, -0.4, -0.3, 0.8, 0.6, 0.06); c.save(); c.setLineDash([0.1, 0.09]); ln(c, a, 0.05); c.restore(); sub(c, G.cross, 0, 0, 0.3, 0, a, a); };
G.lungs = (c, k, a) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.1, -0.35); c.bezierCurveTo(s * 0.7, -0.35, s * 0.8, 0.4, s * 0.3, 0.55); c.bezierCurveTo(s * 0.1, 0.6, s * 0.08, 0.2, s * 0.1, -0.35); c.closePath(); fs(c, k); } seg(c, 0, -0.65, 0, -0.1, a, 0.08); seg(c, 0, -0.12, -0.25, 0.05, a, 0.06); seg(c, 0, -0.12, 0.25, 0.05, a, 0.06); for (const [x, y] of [[-0.45, 0.0], [0.45, 0.0]]) ci(c, x, y, 0.05), (c.fillStyle = a), c.fill(); };
G.openbook = (c, k, a) => { c.beginPath(); c.moveTo(0, -0.4); c.quadraticCurveTo(-0.3, -0.55, -0.64, -0.4); c.lineTo(-0.64, 0.5); c.quadraticCurveTo(-0.3, 0.35, 0, 0.5); c.closePath(); fs(c, k); c.beginPath(); c.moveTo(0, -0.4); c.quadraticCurveTo(0.3, -0.55, 0.64, -0.4); c.lineTo(0.64, 0.5); c.quadraticCurveTo(0.3, 0.35, 0, 0.5); c.closePath(); fs(c, k); ci(c, 0.3, 0.0, 0.14); ln(c, a, 0.06); ci(c, -0.3, 0.0, 0.14); ln(c, a, 0.06); };
G.apron = (c, k, a) => { c.beginPath(); c.moveTo(-0.22, -0.62); c.lineTo(0.22, -0.62); c.lineTo(0.28, -0.3); c.lineTo(0.55, -0.2); c.lineTo(0.5, 0.62); c.lineTo(-0.5, 0.62); c.lineTo(-0.55, -0.2); c.lineTo(-0.28, -0.3); c.closePath(); fs(c, k); sub(c, G.sparkle, 0, 0.15, 0.3, 0, a, a); rr(c, -0.3, 0.38, 0.6, 0.14, 0.04); ln(c, 'rgba(0,0,0,.3)', 0.04); };
G.halo = (c, k, a) => { c.beginPath(); c.ellipse(0, -0.35, 0.42, 0.13, 0, 0, TAU); ln(c, a, 0.12); sub(c, G.drop, 0, 0.25, 0.6, 0, k); };
G.heartworm = (c, k, a) => { heartPath(c, 1); fs(c, k); c.beginPath(); c.moveTo(-0.5, 0.5); c.bezierCurveTo(-0.2, 0.2, -0.3, 0.0, 0.0, 0.0); c.bezierCurveTo(0.3, 0.0, 0.2, -0.3, 0.5, -0.45); ln(c, D, 0.18); c.beginPath(); c.moveTo(-0.5, 0.5); c.bezierCurveTo(-0.2, 0.2, -0.3, 0.0, 0.0, 0.0); c.bezierCurveTo(0.3, 0.0, 0.2, -0.3, 0.5, -0.45); ln(c, a, 0.09); };
G.ticket = (c, k, a) => { c.beginPath(); c.moveTo(-0.6, -0.34); c.lineTo(0.6, -0.34); c.lineTo(0.6, -0.1); c.arc(0.6, 0.0, 0.1, -Math.PI / 2, Math.PI / 2, true); c.lineTo(0.6, 0.34); c.lineTo(-0.6, 0.34); c.lineTo(-0.6, 0.1); c.arc(-0.6, 0.0, 0.1, Math.PI / 2, -Math.PI / 2, true); c.closePath(); fs(c, k); seg(c, 0.2, -0.3, 0.2, 0.3, D, 0.04); c.save(); c.setLineDash([0.05, 0.05]); c.beginPath(); c.moveTo(0.2, -0.3); c.lineTo(0.2, 0.3); ln(c, D, 0.04); c.restore(); sub(c, G.coin, -0.22, 0, 0.36, 0, a, D); };
G.abacus = (c, k, a) => { rr(c, -0.58, -0.5, 1.16, 1.0, 0.06); ln(c, k, 0.1); for (let r = 0; r < 3; r++) { seg(c, -0.55, -0.28 + r * 0.28, 0.55, -0.28 + r * 0.28, k, 0.04); for (let i = 0; i < 4; i++) { const x = -0.42 + ((i + r * 2) % 5) * 0.2; ci(c, x, -0.28 + r * 0.28, 0.09); fs(c, i % 2 ? a : k, 0.03); } } };
G.scalpel = (c, k, a) => { c.save(); c.rotate(-0.7); c.beginPath(); c.moveTo(0.0, -0.7); c.quadraticCurveTo(0.14, -0.3, 0.1, -0.05); c.lineTo(-0.08, -0.05); c.closePath(); fs(c, '#dfe4e8'); rr(c, -0.09, -0.05, 0.18, 0.7, 0.05); fs(c, k); seg(c, 0, 0.05, 0, 0.5, a, 0.04); c.restore(); };
G.tooth = (c, k, a) => { c.beginPath(); c.moveTo(-0.42, -0.4); c.quadraticCurveTo(0, -0.7, 0.42, -0.4); c.quadraticCurveTo(0.5, 0.05, 0.28, 0.25); c.quadraticCurveTo(0.22, 0.65, 0.1, 0.65); c.quadraticCurveTo(0.0, 0.3, -0.1, 0.65); c.quadraticCurveTo(-0.24, 0.65, -0.28, 0.25); c.quadraticCurveTo(-0.5, 0.05, -0.42, -0.4); c.closePath(); fs(c, k); seg(c, -0.2, -0.38, -0.1, -0.2, 'rgba(255,255,255,.7)', 0.06); };
G.key = (c, k, a) => { ci(c, -0.28, -0.28, 0.27); fs(c, k); ci(c, -0.28, -0.28, 0.1); fs(c, D, 0); c.beginPath(); c.moveTo(-0.1, -0.1); c.lineTo(0.5, 0.5); ln(c, D, 0.2); c.beginPath(); c.moveTo(-0.1, -0.1); c.lineTo(0.5, 0.5); ln(c, k, 0.11); seg(c, 0.3, 0.3, 0.48, 0.12, k, 0.1); seg(c, 0.45, 0.45, 0.6, 0.3, k, 0.1); };
G.lamp = (c, k, a) => { c.beginPath(); c.moveTo(-0.52, 0.0); c.quadraticCurveTo(0, -0.7, 0.52, 0.0); c.closePath(); fs(c, k); seg(c, 0, -0.64, 0, -0.45, k, 0.07); ci(c, 0, 0.2, 0.16); fs(c, a, 0.03); c.beginPath(); c.moveTo(-0.2, 0.0); c.lineTo(-0.5, 0.62); c.lineTo(0.5, 0.62); c.lineTo(0.2, 0.0); c.closePath(); c.fillStyle = rgba('#F2C14E', 0.22); c.fill(); };
G.bell = (c, k, a) => { c.beginPath(); c.moveTo(-0.58, 0.4); c.quadraticCurveTo(-0.4, 0.3, -0.36, -0.05); c.quadraticCurveTo(-0.34, -0.5, 0, -0.52); c.quadraticCurveTo(0.34, -0.5, 0.36, -0.05); c.quadraticCurveTo(0.4, 0.3, 0.58, 0.4); c.closePath(); fs(c, k); ci(c, 0, 0.55, 0.11); fs(c, a, 0.04); seg(c, 0, -0.52, 0, -0.66, k, 0.08); seg(c, -0.2, -0.2, -0.2, 0.15, 'rgba(255,255,255,.3)', 0.06); };
G.crown = (c, k, a) => { path(c, [-0.55, 0.4, -0.6, -0.35, -0.25, -0.05, 0, -0.55, 0.25, -0.05, 0.6, -0.35, 0.55, 0.4]); fs(c, k); for (const [x, y] of [[-0.6, -0.4], [0, -0.6], [0.6, -0.4]]) { ci(c, x, y, 0.08); fs(c, a, 0.03); } rr(c, -0.55, 0.28, 1.1, 0.14, 0.03); fs(c, a, 0.03); };
G.skull = (c, k, a) => { c.beginPath(); c.moveTo(-0.46, 0.0); c.bezierCurveTo(-0.5, -0.7, 0.5, -0.7, 0.46, 0.0); c.bezierCurveTo(0.46, 0.18, 0.3, 0.2, 0.3, 0.3); c.lineTo(0.3, 0.52); c.lineTo(-0.3, 0.52); c.lineTo(-0.3, 0.3); c.bezierCurveTo(-0.3, 0.2, -0.46, 0.18, -0.46, 0.0); c.closePath(); fs(c, k); for (const s of [-1, 1]) { ci(c, s * 0.19, 0.0, 0.14); c.fillStyle = D; c.fill(); } path(c, [0, 0.1, -0.07, 0.25, 0.07, 0.25]); c.fillStyle = D; c.fill(); for (let i = -1; i <= 1; i++) seg(c, i * 0.12, 0.38, i * 0.12, 0.52, D, 0.04); };
G.staplecrown = (c, k, a) => { sub(c, G.skull, 0, 0.14, 0.82, 0, k, a); for (let i = -2; i <= 2; i++) { c.save(); c.translate(i * 0.22, -0.46 + Math.abs(i) * 0.07); c.rotate(i * 0.2); c.beginPath(); c.moveTo(-0.08, 0.0); c.lineTo(-0.08, -0.16); c.lineTo(0.08, -0.16); c.lineTo(0.08, 0.0); ln(c, D, 0.12); c.beginPath(); c.moveTo(-0.08, 0.0); c.lineTo(-0.08, -0.16); c.lineTo(0.08, -0.16); c.lineTo(0.08, 0.0); ln(c, a, 0.06); c.restore(); } };
G.heart = (c, k, a) => { heartPath(c, 1); fs(c, k); c.beginPath(); c.ellipse(-0.3, -0.18, 0.09, 0.14, 0.7, 0, TAU); c.fillStyle = 'rgba(255,255,255,.4)'; c.fill(); };
G.sword = (c, k, a) => { c.save(); c.rotate(0.785); c.beginPath(); c.moveTo(0, -0.74); c.lineTo(0.12, -0.55); c.lineTo(0.12, 0.2); c.lineTo(-0.12, 0.2); c.lineTo(-0.12, -0.55); c.closePath(); fs(c, k); seg(c, 0, -0.6, 0, 0.12, 'rgba(0,0,0,.25)', 0.04); rr(c, -0.34, 0.18, 0.68, 0.12, 0.05); fs(c, a, 0.04); rr(c, -0.07, 0.28, 0.14, 0.32, 0.05); fs(c, a, 0.04); ci(c, 0, 0.66, 0.09); fs(c, a, 0.04); c.restore(); };
G.shieldg = (c, k, a) => { shieldPath(c, 1.1); fs(c, k); shieldPath(c, 0.78); ln(c, a, 0.06); seg(c, 0, -0.3, 0, 0.4, a, 0.06); };
G.arrowup = (c, k, a) => { path(c, [0, -0.66, 0.55, 0.0, 0.2, 0.0, 0.2, 0.62, -0.2, 0.62, -0.2, 0.0, -0.55, 0.0]); fs(c, k); };
G.arrowdown = (c, k, a) => { path(c, [0, 0.66, 0.55, 0.0, 0.2, 0.0, 0.2, -0.62, -0.2, -0.62, -0.2, 0.0, -0.55, 0.0]); fs(c, k); };
G.debuff = (c, k, a) => { sub(c, G.skull, 0, -0.1, 0.72, 0, k, a); path(c, [0, 0.66, 0.34, 0.3, 0.12, 0.3, 0.12, 0.2, -0.12, 0.2, -0.12, 0.3, -0.34, 0.3]); fs(c, a, 0.04); };
G.paper = (c, k, a) => { c.save(); c.rotate(-0.12); c.beginPath(); c.moveTo(-0.4, -0.6); c.lineTo(0.2, -0.6); c.lineTo(0.42, -0.38); c.lineTo(0.42, 0.6); c.lineTo(-0.4, 0.6); c.closePath(); fs(c, k); path(c, [0.2, -0.6, 0.2, -0.38, 0.42, -0.38]); fs(c, a, 0.03); for (let i = 0; i < 4; i++) seg(c, -0.26, -0.24 + i * 0.2, 0.28, -0.24 + i * 0.2, D, 0.05); c.restore(); };
G.summon = (c, k, a) => { c.beginPath(); c.ellipse(0, 0.35, 0.6, 0.24, 0, 0, TAU); ln(c, a, 0.09); c.beginPath(); c.ellipse(0, 0.35, 0.34, 0.12, 0, 0, TAU); ln(c, a, 0.05); for (const x of [-0.25, 0, 0.25]) { c.beginPath(); c.moveTo(x, 0.35); c.bezierCurveTo(x - 0.12, 0.0, x + 0.12, -0.2, x, -0.55); ln(c, k, 0.1); } sub(c, G.sparkle, 0, -0.6, 0.2, 0, k, k); };
G.question = (c, k, a) => { c.beginPath(); c.arc(0, -0.2, 0.3, Math.PI * 1.05, Math.PI * 2.45); c.quadraticCurveTo(0.3, 0.1, 0, 0.25); c.lineTo(0, 0.32); ln(c, D, 0.28); c.beginPath(); c.arc(0, -0.2, 0.3, Math.PI * 1.05, Math.PI * 2.45); c.quadraticCurveTo(0.3, 0.1, 0, 0.25); c.lineTo(0, 0.32); ln(c, k, 0.16); ci(c, 0, 0.58, 0.12); fs(c, k, 0.04); };
G.anvil = (c, k, a) => { c.beginPath(); c.moveTo(-0.65, -0.3); c.lineTo(0.4, -0.3); c.quadraticCurveTo(0.6, -0.3, 0.68, -0.14); c.quadraticCurveTo(0.3, -0.1, 0.22, 0.05); c.lineTo(0.22, 0.28); c.lineTo(0.42, 0.5); c.lineTo(-0.42, 0.5); c.lineTo(-0.22, 0.28); c.lineTo(-0.22, 0.05); c.quadraticCurveTo(-0.3, -0.12, -0.65, -0.14); c.closePath(); fs(c, k); seg(c, -0.55, -0.24, 0.4, -0.24, 'rgba(255,255,255,.3)', 0.05); };
G.forgeicon = (c, k, a) => { sub(c, G.anvil, 0, 0.12, 0.88, 0, k, a); c.save(); c.rotate(0.9); seg(c, 0, -0.7, 0, 0.1, '#e8e8f0', 0.07); ci(c, 0, -0.62, 0.04); ln(c, D, 0.03); c.restore(); c.beginPath(); c.moveTo(-0.5, -0.6); c.bezierCurveTo(-0.2, -0.3, -0.6, -0.2, -0.25, -0.35); ln(c, a, 0.04); };
G.crossedscalpels = (c, k, a) => { sub(c, G.scalpel, -0.1, 0, 1, 0, '#8c2f2f', a); sub(c, (cc, kk, aa) => { cc.scale(-1, 1); G.scalpel(cc, kk, aa); }, 0.1, 0, 1, 0, '#8c2f2f', a); };

// ======================================================================================
// STATUS TABLE: id -> [glyph, main, accent]
// ======================================================================================
const GR = '#bfe5c1', RD = '#ffb0a8', GO = '#F2C14E', OR = '#ff8a3c', CY = '#7FD1E0', VI = '#c9a8ff', SL = '#c8d2d8';
const ST = {
  strength: ['fist', '#f0c8a0', '#d2a070'], dexterity: ['feather', GR, '#8fbf94'], weak: ['droop', '#d9b49a', RD], vulnerable: ['crackshield', '#9fb2bd', RD],
  frail: ['bone', '#efe6d0', RD], thorns: ['caltrop', '#8fcf7a', '#c9b06a'], burn: ['flame', OR, '#ffd86b'], bleed: ['drop', '#d2243c', 'rgba(255,255,255,.4)'],
  regen: ['cross', GR, '#d8ffd8'], ritual: ['pentacle', VI, '#e0d0ff'], plated: ['plate', SL, '#6a747a'], barricade: ['bricks', '#c0704c', '#8a4a30'],
  intangible: ['ghost', '#e8f0ff', D], echo: ['rings', CY, '#e6fbff'], drawdown: ['cardDown', '#e8dcc4', RD], costup: ['costup', '#c8b8ff', '#ffffff'],
  emberaura: ['ringflame', OR, '#ffb36b'], charge: ['bolt', '#ffe55a', D], gilt: ['gilt', GO, '#fff3b0'], marked: ['crosshair', '#ff6a5a', '#fff'],
  stun: ['stars', '#ffe55a', '#8fa0ff'], scar: ['stitch', '#e6c9bd', '#b3263a'], rustplate: ['plate', '#b9714a', '#6e3b22'], anticoag: ['dropslash', '#d2243c', '#f4f0e8'],
  bloodrite: ['bloodrite', '#d2243c', '#fff'], wildfire: ['flames3', OR, '#ffd86b'], smolder: ['ember', '#ff7a2b', '#c8c8c8'], waxarmor: ['candle', '#efe4c4', OR],
  dynamo: ['dynamo', '#c9a227', '#ffe55a'], powderkeg: ['barrel', '#a0663a', '#6a4a30'], dividend: ['coin', GO, '#7a5a10'], keepsake: ['locket', GO, '#6a4a10'],
  patronage: ['purse', '#b98a50', GO], standing_order: ['scroll', '#e8dcc4', '#5aa86a'], dodge: ['swerve', '#d8f0ff', CY], hidden: ['eyeshut', '#d6c7a6', '#ff6a5a'],
  sutured: ['seam', '#e6c9bd', '#2a1e1a'], recall: ['recall', '#9ec4ff', '#fff'], countdown: ['clock', '#ffcf6a', '#ff6a5a'], charging: ['battery', '#d0d6dc', '#ffcf3a'],
  lured: ['hook', '#c8d2d8', '#e86a8a'], corroded: ['holes', '#9fb0a0', '#9cff5a'], mirror: ['mirror', '#c8d2d8', '#8a7a5a'], raised: ['cleaver', '#d8dde2', '#9a6a3a'],
  tally: ['tally', '#e8dcc4', RD], priced: ['tag', '#e8dcc4', GO], offer: ['scales', GO, '#e8dcc4'], interest: ['percent', GO, '#fff3b0'],
  brined: ['jar', '#6fb8a8', '#c8c0a0'], strings: ['marionette', '#e8dcc4', '#b3a58a'], fragile: ['goblet', '#bfe3ea', '#fff'], veiled: ['curtain', '#8e3a52', GO],
  baton: ['baton', '#f0ead8', '#6a4a30'],
};
export const STATUS_IDS_DRAWN = Object.keys(ST);

function badge(ctx, r, rim, centerCol = '#241c18', glow = 0) {
  // r = pixel radius. Outer ring, dark center, bevel.
  const g = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(centerCol, 1.5)); g.addColorStop(1, shade(centerCol, 0.55));
  ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fillStyle = D; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.fillStyle = rim; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.lineWidth = Math.max(0.8, r * 0.06); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.lineWidth = Math.max(0.8, r * 0.07); ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.stroke();
}
function withGlyph(ctx, x, y, size, k, a, name, gs = 0.64) {
  const r = size / 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(r * gs, r * gs);
  const fn = G[name] || G.question; fn(ctx, k, a); ctx.restore();
}
const GOODRIM = '#4f9a5c', BADRIM = '#c2433f';
export function drawStatus(ctx, id, x, y, size, good = true) {
  const r = size / 2; const e = ST[id];
  ctx.save(); ctx.translate(x, y);
  const rim = good ? GOODRIM : BADRIM;
  badge(ctx, r, rim, good ? '#1c2a20' : '#2e1818');
  // small pip so good/bad is readable without color: good = notch dots, bad = zigzag teeth
  ctx.restore();
  if (e) withGlyph(ctx, x, y, size, e[1], e[2], e[0], 0.62);
  else {
    ctx.save(); ctx.fillStyle = good ? '#d8f5da' : '#ffd2cc'; ctx.font = `bold ${Math.round(size * 0.5)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(id || '?')[0].toUpperCase(), x, y + size * 0.03); ctx.restore();
  }
  if (!good) { // bad: tiny downward notch at bottom of the rim; good: tiny up notch (colorblind cue)
    ctx.save(); ctx.fillStyle = '#ffd2cc'; ctx.translate(x, y + r * 0.84); ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.05); ctx.lineTo(r * 0.12, -r * 0.05); ctx.lineTo(0, r * 0.1); ctx.fill(); ctx.restore();
  } else {
    ctx.save(); ctx.fillStyle = '#d8f5da'; ctx.translate(x, y + r * 0.84); ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.05); ctx.lineTo(r * 0.12, r * 0.05); ctx.lineTo(0, -r * 0.1); ctx.fill(); ctx.restore();
  }
}

// ======================================================================================
// INTENTS (bare glyphs with a soft glow)
// ======================================================================================
const INT = {
  attack: ['sword', '#ffb0a0', '#8a5f3a', '#ff5a4a'], defend: ['shieldg', '#9ec8e8', '#e8f4ff', '#6aa8e0'], buff: ['arrowup', '#8fe29a', '#fff', '#5ac86a'],
  debuff: ['debuff', '#c9a8ff', '#ff9a8a', '#9a6aff'], junk: ['paper', '#e8dcc4', '#b3a58a', '#cfc6a8'], summon: ['summon', '#c9a8ff', '#7a5ac8', '#a07aff'],
  unknown: ['question', '#e8dcc4', '#fff', '#cfc6a8'], stun: ['stars', '#ffe55a', '#8fa0ff', '#ffe55a'], sleep: ['question', '#9ec8e8', '#fff', '#6aa8e0'],
  heal: ['cross', '#8fe29a', '#fff', '#5ac86a'], flee: ['swerve', '#d8f0ff', CY, CY], special: ['sparkle', GO, '#fff', GO],
};
export function drawIntent(ctx, kind, x, y, size) {
  if (Array.isArray(kind)) kind = kind[0];
  const e = INT[kind] || INT.unknown;
  const r = size / 2;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.15);
  g.addColorStop(0, rgba(e[3].length === 7 ? e[3] : '#ffffff', 0.28)); g.addColorStop(1, rgba(e[3].length === 7 ? e[3] : '#ffffff', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, TAU); ctx.fill();
  ctx.restore();
  withGlyph(ctx, x, y, size, e[1], e[2], e[0], 0.92);
}

// ======================================================================================
// RELICS
// ======================================================================================
const RIM = { start: '#E8DCC4', common: '#8d8a84', uncommon: '#5aa86a', rare: '#F2C14E', boss: '#B3263A', shop: '#5a8fd8' };
export const RELIC_GLYPHS = {
  r_marrow_kit: 'bag', r_wick_kit: 'matchbox', r_odile_kit: 'tin', r_bandage_roll: 'bandage', r_scar_tissue: 'stitch', r_free_sample: 'vial', r_cold_storage: 'snow',
  r_suture_thread: 'spool', r_tithe_receipt: 'receipt', r_bare_bones: 'bone', r_junk_drawer: 'drawer', r_loose_thread: 'needle', r_weighted_vest: 'weight', r_sterile_field: 'sterile',
  r_collection_plate: 'dish', r_haggler: 'glove', r_clean_hands: 'soap', r_clotting_agent: 'clot', r_second_opinion: 'speech', r_branding_iron: 'iron', r_second_look: 'lens',
  r_shatter_ward: 'wardshield', r_salvage_clamp: 'clamp', r_overload_valve: 'valve', r_strain_gauge: 'gauge', r_heavy_seam: 'seamheavy', r_bare_hands: 'palm', r_unjam_oil: 'oilcan',
  r_indulgence: 'seal', r_forge_hammer: 'hammer', r_dust_collector: 'dustpan', r_skip_prize: 'billcheck', r_glass_saint: 'saint', r_perfect_fit: 'puzzle', r_debt_collector: 'ledger',
  r_cold_vault: 'vault', r_monolith: 'monolith', r_toll_booth: 'gate', r_usurer: 'moneyeye', r_jam_engine: 'engine', r_pale_deck: 'deck', r_second_skin: 'patch',
  r_second_wind: 'lungs', r_hollow_ledger: 'openbook', r_lead_apron: 'apron', r_absolution: 'halo', r_parasite_heart: 'heartworm', r_pawn_ticket: 'ticket', r_budget_ledger: 'abacus',
  r_pocket_surgeon: 'scalpel',
};
G.needle = (c, k, a) => { c.save(); c.rotate(0.7); seg(c, 0, -0.66, 0, 0.62, '#e8e8f0', 0.08); c.beginPath(); c.ellipse(0, -0.5, 0.045, 0.12, 0, 0, TAU); ln(c, D, 0.04); c.restore(); c.beginPath(); c.moveTo(-0.34, -0.6); c.bezierCurveTo(-0.7, -0.1, 0.1, 0.0, -0.2, 0.45); c.bezierCurveTo(-0.3, 0.6, -0.1, 0.65, 0.1, 0.55); ln(c, a || k, 0.07); };
const KEYWORDS = [['clamp', 'clamp'], ['staple', 'staple'], ['ledger', 'ledger'], ['tooth', 'tooth'], ['lens', 'lens'], ['look', 'lens'], ['thread', 'spool'], ['key', 'key'], ['bell', 'bell'], ['scale', 'scales'], ['jar', 'jar'], ['coin', 'coin'], ['heart', 'heart'], ['lamp', 'lamp'], ['gear', 'gear'], ['engine', 'engine'], ['gold', 'coin'], ['bone', 'bone'], ['blood', 'drop'], ['fire', 'flame'], ['shield', 'shieldg'], ['ward', 'wardshield'], ['hammer', 'hammer'], ['eye', 'eye'], ['skull', 'skull'], ['crown', 'crown'], ['glove', 'glove'], ['hand', 'palm'], ['book', 'openbook'], ['card', 'deck'], ['deck', 'deck'], ['bolt', 'bolt'], ['star', 'sparkle']];
G.staple = (c, k, a) => { c.beginPath(); c.moveTo(-0.5, 0.2); c.lineTo(-0.5, -0.1); c.lineTo(0.5, -0.1); c.lineTo(0.5, 0.2); ln(c, D, 0.26); c.beginPath(); c.moveTo(-0.5, 0.2); c.lineTo(-0.5, -0.1); c.lineTo(0.5, -0.1); c.lineTo(0.5, 0.2); ln(c, k, 0.15); };
const GLYPH_NAMES = Object.keys(G);
function relicGlyph(id, name) {
  if (RELIC_GLYPHS[id]) return RELIC_GLYPHS[id];
  const s = (String(id) + ' ' + String(name || '')).toLowerCase();
  for (const [kw, g] of KEYWORDS) if (s.includes(kw)) return g;
  return GLYPH_NAMES[hash(id) % GLYPH_NAMES.length];
}
const RTINT = ['#e8dcc4', '#c9d6e0', '#e8c9a0', '#cfe6c4', '#e0c4d8', '#d8d0a0', '#bcd8d0', '#e8b8a8'];
const RACC = ['#F2C14E', '#B3263A', '#5aa86a', '#7FD1E0', '#c9a8ff', '#ff8a3c', '#e8dcc4', '#8c6a3a'];
const RSPEC = { r_marrow_kit: ['#cfd6dc', '#B3263A'], r_wick_kit: ['#c9a227', '#ff6a2b'], r_odile_kit: ['#b98a50', '#F2C14E'] };
export function drawRelic(ctx, id, x, y, size, rarity) {
  const h = hash(id); const r = size / 2;
  const rar = rarity || (RELICS[id] && RELICS[id].rarity) || 'common';
  const rim = RIM[rar] || RIM.common;
  const k = (RSPEC[id] && RSPEC[id][0]) || RTINT[h % RTINT.length], a = (RSPEC[id] && RSPEC[id][1]) || RACC[(h >> 5) % RACC.length];
  ctx.save(); ctx.translate(x, y);
  // medallion: rim, bronze bevel, dark center
  ctx.beginPath(); ctx.arc(0, 0, r * 0.97, 0, TAU); ctx.fillStyle = D; ctx.fill();
  const rg = ctx.createLinearGradient(-r, -r, r, r); rg.addColorStop(0, shade(rim, 1.3)); rg.addColorStop(0.5, rim); rg.addColorStop(1, shade(rim, 0.55));
  ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.fillStyle = rg; ctx.fill();
  const cg = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r * 0.76); cg.addColorStop(0, '#3a2f29'); cg.addColorStop(1, '#17110f');
  ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.fillStyle = cg; ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * 0.07); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
  // hash pips on the rim (1 to 3) so two relics sharing a glyph never match
  const pips = 1 + (h % 3);
  for (let i = 0; i < pips; i++) { const an = ((((h >> (3 + i * 4)) % 12) / 12) * TAU) - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(an) * r * 0.83, Math.sin(an) * r * 0.83, Math.max(0.9, r * 0.055), 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); }
  ctx.restore();
  withGlyph(ctx, x, y, size, k, a, relicGlyph(id), 0.6);
}
// ======================================================================================
// POTIONS
// ======================================================================================
// id -> [shape, liquid, label-glyph, extra]
const PT = {
  p_smelling_salts: ['jar', '#e8f4ff', 'sparkle'], p_tonic: ['round', '#5ccf7a', 'cross'], p_firebomb: ['round', '#ff6a2b', 'flame', 'fuse'], p_sting: ['tall', '#f2d24e', 'caltrop'],
  p_adrenaline: ['syringe', '#ff5a6a', 'bolt'], p_bitter_draught: ['jar', '#7a5a2a', 'skull'], p_weak_tea: ['tall', '#c8a064', 'droop'], p_unjam: ['tall', '#e8b84e', 'gear'],
  p_untithe: ['round', '#f5e6a8', 'halo'], p_vapors: ['cone', '#a070e0', 'crackshield'], p_ether: ['tall', '#bfe3f0', 'ghost'], p_burn_flask: ['cone', '#ff8a3c', 'flame'],
  p_bleed_vial: ['tall', '#b01030', 'drop'], p_strength_draught: ['round', '#d8503a', 'fist'], p_steady_hand: ['cone', '#4ac0b0', 'crosshair'], p_remission: ['jar', '#6ae09a', 'heart'],
  p_liquid_courage: ['hip', '#d89a3a', 'star'], p_plague_vial: ['syringe', '#a8d03a', 'skull'],
};
const PSHAPES = ['round', 'tall', 'syringe', 'jar', 'cone', 'hip'];
G.star = (c, k, a) => { starPath(c, 0, 0.03, 0.6); fs(c, k, 0.05); };
function bottle(c, shape, liquid, label, extra, t) {
  // unit space: bottle fits in -0.75..0.75
  const glass = 'rgba(190,225,235,.28)', edge = 'rgba(220,240,245,.75)';
  const fill = (body, level) => { // liquid clipped to body path
    c.save(); body(); c.clip(); const lg = c.createLinearGradient(-0.5, 0, 0.5, 0); lg.addColorStop(0, shade(liquid, 0.75)); lg.addColorStop(0.45, liquid); lg.addColorStop(1, shade(liquid, 0.6)); c.fillStyle = lg; c.fillRect(-1, level, 2, 2); c.beginPath(); c.moveTo(-1, level); for (let i = 0; i <= 8; i++) c.lineTo(-1 + i * 0.25, level + Math.sin(i * 1.7 + t * 2) * 0.012); c.lineTo(1, level + 0.06); c.lineTo(-1, level + 0.06); c.fillStyle = shade(liquid, 1.25); c.fill(); c.restore();
  };
  const outline = (body) => { body(); c.lineWidth = 0.07; c.strokeStyle = D; c.stroke(); body(); c.fillStyle = glass; c.fill(); c.lineWidth = 0.04; c.strokeStyle = edge; c.stroke(); };
  const cork = (x, y, w, h) => { rr(c, x - w / 2, y, w, h, 0.04); fs(c, '#b98a50', 0.04); };
  if (shape === 'round') {
    const body = () => { c.beginPath(); c.moveTo(-0.14, -0.62); c.lineTo(-0.14, -0.28); c.arc(0, 0.2, 0.5, -2.0, Math.PI + 2.0 - Math.PI * 2 + Math.PI * 2, false); c.lineTo(0.14, -0.28); c.lineTo(0.14, -0.62); c.closePath(); };
    const b2 = () => { c.beginPath(); c.moveTo(-0.13, -0.56); c.lineTo(-0.13, -0.26); c.bezierCurveTo(-0.62, -0.1, -0.62, 0.7, 0, 0.7); c.bezierCurveTo(0.62, 0.7, 0.62, -0.1, 0.13, -0.26); c.lineTo(0.13, -0.56); c.closePath(); };
    fill(b2, 0.08); outline(b2); cork(0, -0.74, 0.3, 0.2);
    if (extra === 'fuse') { c.beginPath(); c.moveTo(0, -0.74); c.quadraticCurveTo(0.2, -0.9, 0.34, -0.8); ln(c, '#d8c8a0', 0.05); sub(c, G.sparkle, 0.36, -0.82, 0.14, 0, '#ffd86b', '#ffd86b'); }
    sub(c, G[label] || G.star, 0, 0.3, 0.26, 0, '#f4ecd8', D);
  } else if (shape === 'tall') {
    const b = () => { c.beginPath(); c.moveTo(-0.14, -0.58); c.lineTo(-0.14, -0.4); c.lineTo(-0.26, -0.34); c.lineTo(-0.26, 0.6); c.quadraticCurveTo(-0.26, 0.7, -0.16, 0.7); c.lineTo(0.16, 0.7); c.quadraticCurveTo(0.26, 0.7, 0.26, 0.6); c.lineTo(0.26, -0.34); c.lineTo(0.14, -0.4); c.lineTo(0.14, -0.58); c.closePath(); };
    fill(b, -0.05); outline(b); cork(0, -0.72, 0.26, 0.18);
    sub(c, G[label] || G.star, 0, 0.3, 0.2, 0, '#f4ecd8', D);
  } else if (shape === 'jar') {
    const b = () => { c.beginPath(); c.roundRect ? c.roundRect(-0.5, -0.36, 1.0, 1.06, 0.18) : c.rect(-0.5, -0.36, 1, 1.06); };
    fill(b, -0.05); outline(b); rr(c, -0.4, -0.6, 0.8, 0.26, 0.07); fs(c, '#8a8f95', 0.05); seg(c, -0.25, -0.5, 0.25, -0.5, 'rgba(255,255,255,.3)', 0.04);
    rr(c, -0.34, 0.1, 0.68, 0.38, 0.05); fs(c, '#e8dcc4', 0.03); sub(c, G[label] || G.star, 0, 0.29, 0.24, 0, D, liquid);
  } else if (shape === 'cone') {
    const b = () => { c.beginPath(); c.moveTo(-0.14, -0.58); c.lineTo(-0.14, -0.2); c.lineTo(-0.6, 0.6); c.quadraticCurveTo(-0.64, 0.7, -0.5, 0.7); c.lineTo(0.5, 0.7); c.quadraticCurveTo(0.64, 0.7, 0.6, 0.6); c.lineTo(0.14, -0.2); c.lineTo(0.14, -0.58); c.closePath(); };
    fill(b, 0.22); outline(b); cork(0, -0.72, 0.28, 0.18); sub(c, G[label] || G.star, 0, 0.45, 0.2, 0, '#f4ecd8', D);
    for (const [x, y, r] of [[-0.2, 0.36, 0.05], [0.18, 0.5, 0.04], [0.02, 0.3, 0.035]]) { ci(c, x, y - (t * 0.05 % 0.1), r); ln(c, 'rgba(255,255,255,.6)', 0.025); }
  } else if (shape === 'hip') {
    const b = () => { c.beginPath(); c.moveTo(-0.3, -0.45); c.lineTo(0.3, -0.45); c.quadraticCurveTo(0.58, -0.45, 0.58, -0.15); c.lineTo(0.58, 0.55); c.quadraticCurveTo(0.58, 0.7, 0.42, 0.7); c.lineTo(-0.42, 0.7); c.quadraticCurveTo(-0.58, 0.7, -0.58, 0.55); c.lineTo(-0.58, -0.15); c.quadraticCurveTo(-0.58, -0.45, -0.3, -0.45); c.closePath(); };
    fill(b, 0.0); outline(b); rr(c, -0.2, -0.64, 0.4, 0.22, 0.05); fs(c, '#b0b6bc', 0.05); sub(c, G[label] || G.star, 0, 0.28, 0.28, 0, '#f4ecd8', D);
  } else if (shape === 'syringe') {
    c.save(); c.rotate(-0.6);
    rr(c, -0.2, -0.45, 0.4, 0.9, 0.06); fill(() => rr(c, -0.2, -0.45, 0.4, 0.9, 0.06), -0.1); outline(() => rr(c, -0.2, -0.45, 0.4, 0.9, 0.06));
    seg(c, 0, 0.45, 0, 0.74, '#dfe4e8', 0.05); seg(c, -0.3, -0.45, 0.3, -0.45, '#9aa2a8', 0.1); seg(c, 0, -0.45, 0, -0.74, '#9aa2a8', 0.07); seg(c, -0.16, -0.76, 0.16, -0.76, '#9aa2a8', 0.09);
    for (let i = 0; i < 4; i++) seg(c, 0.2, -0.3 + i * 0.2, 0.3, -0.3 + i * 0.2, edge, 0.03);
    c.restore();
    sub(c, G[label] || G.star, 0.3, 0.4, 0.2, 0, '#f4ecd8', D);
  }
  // glint
  c.beginPath(); c.ellipse(-0.2, 0.15, 0.04, 0.2, 0.2, 0, TAU); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
}
export function drawPotion(ctx, id, x, y, size) {
  const e = PT[id] || [PSHAPES[hash(id) % PSHAPES.length], `hsl(${hash(id) % 360},60%,55%)`, GLYPH_NAMES[hash(id) % GLYPH_NAMES.length]];
  let liquid = e[1]; if (liquid.startsWith('hsl')) { liquid = '#' + [(hash(id) >> 3) & 255, (hash(id) >> 11) & 255, (hash(id) >> 19) & 255].map((v) => (80 + (v % 150)).toString(16)).join(''); }
  ctx.save(); ctx.translate(x, y); const s = size / 2 / 0.78; ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(0, 0.74, 0.42, 0.08, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  bottle(ctx, e[0], liquid, e[2], e[3], now());
  ctx.restore();
}

// ======================================================================================
// MAP NODES
// ======================================================================================
const NODE = {
  fight: { g: 'crossedscalpels', col: '#e8c8c0', acc: '#c9d6e0', rim: '#B3263A' },
  elite: { g: 'staplecrown', col: '#f2e6d0', acc: '#F2C14E', rim: '#F2C14E' },
  event: { g: 'speech', col: '#c9d6e0', acc: '#F2C14E', rim: '#7FD1E0', q: true },
  shop: { g: 'purse', col: '#c9a070', acc: '#F2C14E', rim: '#5a8fd8' },
  forge: { g: 'forgeicon', col: '#9aa4aa', acc: '#ff8a3c', rim: '#ff8a3c' },
  boss: { g: 'bellcrown', col: '#F2C14E', acc: '#B3263A', rim: '#B3263A' },
  final: { g: 'eye', col: '#f2e6d0', acc: '#B3263A', rim: '#F2C14E' },
};
NODE.normal = NODE.fight; NODE.rest = NODE.forge; NODE.start = NODE.event; NODE.treasure = NODE.shop; NODE.mystery = NODE.event;
G.bellcrown = (c, k, a) => { sub(c, G.bell, 0, 0.14, 0.85, 0, k, a); sub(c, G.crown, 0, -0.52, 0.42, 0, '#fff3b0', a); };
export function drawNodeIcon(ctx, type, x, y, size, state = 'available') {
  const d = NODE[type]; const r = size / 2; const t = now();
  const locked = state === 'locked', visited = state === 'visited', cur = state === 'current', avail = state === 'available';
  ctx.save();
  ctx.globalAlpha *= locked ? 0.38 : visited ? 0.62 : 1;
  if (avail || cur) { // glow
    const p = 0.5 + 0.5 * Math.sin(t * (cur ? 4 : 2.4));
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (1.5 + p * 0.25));
    const gc = cur ? '#F2C14E' : (d ? d.rim : '#F2C14E');
    g.addColorStop(0, rgba(gc, 0.55)); g.addColorStop(1, rgba(gc, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
  }
  ctx.translate(x, y);
  badge(ctx, r, locked ? '#5a5048' : visited ? '#7a6e60' : (d ? d.rim : '#aaa'), visited ? '#1c1816' : '#2a211d');
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= locked ? 0.4 : visited ? 0.55 : 1;
  if (d) {
    const k = locked || visited ? '#9a9088' : d.col, a = locked || visited ? '#7a7068' : d.acc;
    withGlyph(ctx, x, y, size, k, a, d.g, 0.64);
    if (d.q) { ctx.save(); ctx.fillStyle = D; ctx.font = `bold ${Math.round(size * 0.3)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x - size * 0.03, y - size * 0.1); ctx.restore(); }
  } else withGlyph(ctx, x, y, size, '#ddd', '#999', 'question', 0.6);
  ctx.restore();
  if (visited) { // tick
    ctx.save(); const tx = x + r * 0.55, ty = y + r * 0.55, tr = r * 0.38; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.fillStyle = '#1a1614'; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = COL.good; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - tr * 0.5, ty); ctx.lineTo(tx - tr * 0.1, ty + tr * 0.4); ctx.lineTo(tx + tr * 0.5, ty - tr * 0.4); ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.good; ctx.stroke(); ctx.restore();
  }
  if (cur) { // pulsing ring
    const p = (t * 1.2) % 1;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * (1.0 + p * 0.55), 0, TAU); ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.strokeStyle = rgba('#F2C14E', 0.9 * (1 - p)); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, TAU); ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.strokeStyle = '#F2C14E'; ctx.stroke(); ctx.restore();
  }
  if (locked) { // faint lock dot
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.fill(); ctx.restore();
  }
}

// map connection between two nodes: stitched thread. state 'available' | 'visited' | 'locked'
export function drawMapPath(ctx, x1, y1, x2, y2, state = 'locked', t = 0) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = dx / len, ny = dy / len;
  ctx.save();
  const col = state === 'visited' ? 'rgba(232,220,196,.5)' : state === 'available' ? '#F2C14E' : 'rgba(232,220,196,.18)';
  ctx.strokeStyle = col; ctx.lineWidth = state === 'available' ? 3 : 2; ctx.lineCap = 'round';
  ctx.setLineDash([9, 7]); ctx.lineDashOffset = state === 'available' ? -t * 14 : 0;
  ctx.beginPath(); ctx.moveTo(x1 + nx * 28, y1 + ny * 28); ctx.lineTo(x2 - nx * 28, y2 - ny * 28); ctx.stroke(); ctx.setLineDash([]);
  if (state === 'visited') { // cross-stitches
    ctx.lineWidth = 1.6; for (let d = 40; d < len - 36; d += 22) { const cx = x1 + nx * d, cy = y1 + ny * d; ctx.beginPath(); ctx.moveTo(cx - ny * 5 - nx * 3, cy + nx * 5 - ny * 3); ctx.lineTo(cx + ny * 5 + nx * 3, cy - nx * 5 + ny * 3); ctx.stroke(); }
  }
  ctx.restore();
}

// ======================================================================================
// HUD PIECES
// ======================================================================================
function numText(ctx, str, x, y, px, col = '#fff', stroke = D) {
  ctx.save(); ctx.font = `bold ${Math.round(px)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, px * 0.2); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); ctx.fillStyle = col; ctx.fillText(str, x, y); ctx.restore();
}
export function drawEnergyOrb(ctx, x, y, size, n = 0, max) {
  const r = size / 2, t = now(); const empty = n <= 0;
  ctx.save();
  // glow
  if (!empty) { const p = 0.85 + 0.15 * Math.sin(t * 2.6); const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.6 * p); g.addColorStop(0, rgba('#F2C14E', 0.45)); g.addColorStop(1, rgba('#F2C14E', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.fill(); }
  // brass base
  const by = y + r * 0.74;
  const bg = ctx.createLinearGradient(x - r, 0, x + r, 0); bg.addColorStop(0, '#6a4a1c'); bg.addColorStop(0.35, '#d9b058'); bg.addColorStop(0.7, '#9a7228'); bg.addColorStop(1, '#4e3612');
  ctx.beginPath(); ctx.ellipse(x, by + r * 0.08, r * 0.82, r * 0.26, 0, 0, TAU); ctx.fillStyle = D; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.78, by - r * 0.1); ctx.lineTo(x + r * 0.78, by - r * 0.1); ctx.lineTo(x + r * 0.86, by + r * 0.08); ctx.quadraticCurveTo(x, by + r * 0.4, x - r * 0.86, by + r * 0.08); ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = D; ctx.stroke();
  for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(x + s * r * 0.5, by + r * 0.08, Math.max(1, r * 0.05), 0, TAU); ctx.fillStyle = '#3a280e'; ctx.fill(); }
  // glass orb
  ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, TAU); ctx.fillStyle = D; ctx.fill();
  const og = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 0.82);
  if (empty) { og.addColorStop(0, '#4a4a52'); og.addColorStop(1, '#17171c'); } else { og.addColorStop(0, '#fff3b0'); og.addColorStop(0.45, '#F2C14E'); og.addColorStop(1, '#8a5a10'); }
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fillStyle = og; ctx.fill();
  // arcing sparks inside
  if (!empty) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, r * 0.04); for (let i = 0; i < 3; i++) { const a0 = t * 1.3 + i * 2.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * r * 0.3 + Math.sin(a0 * 3) * r * 0.1, y + Math.sin(a0) * r * 0.3); ctx.lineTo(x + Math.cos(a0 + 0.1) * r * 0.7, y + Math.sin(a0 + 0.1) * r * 0.7); ctx.stroke(); } ctx.restore(); }
  // highlight
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.28, r * 0.14, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.lineWidth = Math.max(1, r * 0.05); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  ctx.restore();
  numText(ctx, String(n), x, y + r * 0.02, r * (max !== undefined ? 0.95 : 1.1), empty ? '#9a9aa4' : '#fffbe8', empty ? '#101014' : '#6a3c06');
  if (max !== undefined) numText(ctx, '/' + max, x + r * 0.02, y + r * 0.52, r * 0.38, empty ? '#7a7a84' : '#fff3b0', '#3a2008');
}
export function drawCoin(ctx, x, y, size) {
  const r = size / 2; ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, TAU); ctx.fillStyle = D; ctx.fill();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.45, '#F2C14E'); g.addColorStop(1, '#8a5f10');
  ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.lineWidth = Math.max(1, r * 0.09); ctx.strokeStyle = 'rgba(100,60,0,.6)'; ctx.stroke();
  // stitched cross emblem
  ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(90,50,0,.75)'; ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.34); ctx.lineTo(x, y + r * 0.34); ctx.moveTo(x - r * 0.34, y); ctx.lineTo(x + r * 0.34, y); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.12, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
  ctx.restore();
}
export function drawHeart(ctx, x, y, size) {
  const r = size / 2; ctx.save(); ctx.translate(x, y + r * 0.05); ctx.scale(r * 1.02, r * 1.02);
  heartPath(ctx, 1); const g = ctx.createLinearGradient(-0.8, -0.6, 0.8, 0.7); g.addColorStop(0, '#ff6a78'); g.addColorStop(0.5, '#B3263A'); g.addColorStop(1, '#5a0c1c'); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.08; ctx.strokeStyle = D; ctx.lineJoin = 'round'; ctx.stroke();
  // stitched scar
  ctx.beginPath(); ctx.moveTo(-0.25, 0.3); ctx.lineTo(0.28, -0.12); ctx.lineWidth = 0.07; ctx.strokeStyle = '#2b0a10'; ctx.lineCap = 'round'; ctx.stroke();
  for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.3, px = -0.25 + 0.53 * t, py = 0.3 - 0.42 * t; ctx.beginPath(); ctx.moveTo(px - 0.07, py - 0.09); ctx.lineTo(px + 0.07, py + 0.09); ctx.lineWidth = 0.05; ctx.strokeStyle = '#f0d8c8'; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(-0.38, -0.25, 0.1, 0.17, 0.7, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
  ctx.restore();
}
export function drawShield(ctx, x, y, size, n) {
  const r = size / 2; ctx.save(); ctx.translate(x, y); ctx.scale(r * 0.95, r * 0.95);
  shieldPath(ctx, 1.4, -0.0); ctx.fillStyle = D; ctx.fill();
  const g = ctx.createLinearGradient(-0.7, -0.7, 0.7, 0.8); g.addColorStop(0, '#d4e4ee'); g.addColorStop(0.5, '#7fa0ad'); g.addColorStop(1, '#3e5c6b');
  ctx.save(); ctx.scale(0.94, 0.94); shieldPath(ctx, 1.4, -0.0); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  ctx.save(); ctx.scale(0.74, 0.74); shieldPath(ctx, 1.4, -0.0); ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke(); ctx.restore();
  for (const [px, py] of [[-0.5, -0.5], [0.5, -0.5], [-0.52, 0.15], [0.52, 0.15], [0, 0.78]]) { ctx.beginPath(); ctx.arc(px, py, 0.075, 0, TAU); ctx.fillStyle = '#c9d6dc'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = D; ctx.stroke(); }
  ctx.restore();
  if (n !== undefined && n !== null) numText(ctx, String(n), x, y + r * 0.05, r * 0.95, '#ffffff', '#1e3340');
}
export function drawBudgetGauge(ctx, x, y, w, weight = 0, budget = 6, previewWeight = 0) {
  const h = 22; const total = Math.max(budget, weight + Math.max(0, previewWeight), 1);
  const gap = 4, cw = Math.min(46, (w - gap * (total - 1)) / total); const t = now();
  const used = Math.min(w, cw * total + gap * (total - 1)); const x0 = x;
  ctx.save();
  // brass frame
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0 - 5, y - 4, used + 10, h + 8, 6) : ctx.rect(x0 - 5, y - 4, used + 10, h + 8); ctx.fillStyle = 'rgba(14,12,10,.8)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8a6a2a'; ctx.stroke();
  for (let i = 0; i < total; i++) {
    const cx = x0 + i * (cw + gap); const over = i >= budget; const filled = i < weight; const prev = !filled && i < weight + previewWeight;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, y, cw, h, 3) : ctx.rect(cx, y, cw, h);
    if (filled) { const g = ctx.createLinearGradient(0, y, 0, y + h); if (over) { g.addColorStop(0, '#e0455c'); g.addColorStop(1, '#7a0f22'); } else { g.addColorStop(0, '#f1d287'); g.addColorStop(0.5, '#c9a227'); g.addColorStop(1, '#7a5a14'); } ctx.fillStyle = g; }
    else if (prev) { const p = 0.5 + 0.5 * Math.sin(t * 6); ctx.fillStyle = over ? rgba('#e0455c', 0.35 + p * 0.4) : rgba('#F2C14E', 0.25 + p * 0.4); }
    else ctx.fillStyle = over ? 'rgba(179,38,58,.14)' : 'rgba(232,220,196,.1)';
    ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = filled || prev ? (over ? '#ff9aa8' : '#fff0b8') : (over ? 'rgba(179,38,58,.55)' : 'rgba(232,220,196,.3)'); if (prev) ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    if (filled) { ctx.beginPath(); ctx.moveTo(cx + 3, y + 3); ctx.lineTo(cx + cw - 3, y + 3); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke(); }
    if ((filled || prev) && over) { // stitches across overflow cells
      ctx.strokeStyle = '#f4e0d8'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let s = 0; s < 3; s++) { const sx = cx + cw * (0.22 + s * 0.28); ctx.beginPath(); ctx.moveTo(sx - 3, y + 5); ctx.lineTo(sx + 3, y + h - 5); ctx.moveTo(sx + 3, y + 5); ctx.lineTo(sx - 3, y + h - 5); ctx.stroke(); }
    }
  }
  // budget line marker
  if (total > budget) { const bx = x0 + budget * (cw + gap) - gap / 2; ctx.beginPath(); ctx.moveTo(bx, y - 7); ctx.lineTo(bx, y + h + 7); ctx.lineWidth = 2; ctx.strokeStyle = '#F2C14E'; ctx.stroke(); path(ctx, [bx - 4, y - 8, bx + 4, y - 8, bx, y - 3]); ctx.fillStyle = '#F2C14E'; ctx.fill(); }
  ctx.restore();
  return h;
}
export function drawStrainMeter(ctx, x, y, w, strain = 0, max = 6) {
  const h = 14; const n = Math.max(max, strain, 1); const gap = 3; const cw = (w - gap * (n - 1)) / n; const t = now();
  ctx.save();
  for (let i = 0; i < n; i++) {
    const cx = x + i * (cw + gap); const on = i < strain;
    ctx.beginPath(); ctx.moveTo(cx, y + h); ctx.lineTo(cx + cw * 0.5, y + (on ? 0 : h * 0.35) - (on ? Math.sin(t * 8 + i) * 0.8 : 0)); ctx.lineTo(cx + cw, y + h); ctx.closePath();
    ctx.fillStyle = on ? (i >= max - 1 ? '#ff4a5e' : '#B3263A') : 'rgba(179,38,58,.15)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = on ? '#ffb0b8' : 'rgba(179,38,58,.4)'; ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x, y + h + 2); ctx.lineTo(x + w, y + h + 2); ctx.lineWidth = 1.5; ctx.strokeStyle = strain > 0 ? '#B3263A' : 'rgba(232,220,196,.25)'; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  return h + 4;
}
export function drawDeckIcon(ctx, x, y, size) {
  const r = size / 2; ctx.save(); ctx.translate(x, y);
  for (let i = 2; i >= 0; i--) {
    ctx.save(); ctx.rotate((i - 1) * 0.2); ctx.translate((i - 1) * r * 0.22, (2 - i) * -r * 0.02);
    const w = r * 1.0, h = r * 1.4; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, r * 0.1) : ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = i === 0 ? '#e8dcc4' : i === 1 ? '#d6c7a6' : '#3a2f29'; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.07); ctx.strokeStyle = D; ctx.stroke();
    if (i === 0) { ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.28); ctx.lineTo(-w * 0.1, h * 0.05); ctx.lineTo(w * 0.1, h * 0.12); ctx.lineTo(w * 0.3, -h * 0.15); ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = '#B3263A'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}
export function drawPileIcon(ctx, x, y, size, kind = 'draw', pile) {
  const k = ['draw', 'discard', 'exhaust'].includes(kind) ? kind : ['draw', 'discard', 'exhaust'].includes(pile) ? pile : 'draw';
  const r = size / 2; ctx.save(); ctx.translate(x, y);
  const col = k === 'draw' ? '#7FD1E0' : k === 'discard' ? '#E8DCC4' : '#ff7a4a';
  for (let i = 0; i < 3; i++) { const w = r * 1.0, h = r * 1.3, ox = (i - 1) * r * 0.1 * (k === 'discard' ? -1 : 1), oy = -i * r * 0.08 + r * 0.1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2 + ox, -h / 2 + oy, w, h, r * 0.1) : ctx.rect(-w / 2 + ox, -h / 2 + oy, w, h); ctx.fillStyle = k === 'exhaust' ? ['#3a2420', '#4a2c24', '#5a3226'][i] : ['#2a211d', '#3a2f29', '#4a3d36'][i]; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.07); ctx.strokeStyle = k === 'exhaust' ? 'rgba(255,122,74,.7)' : D; ctx.stroke(); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (k === 'draw') { ctx.beginPath(); ctx.moveTo(0, -r * 0.35); ctx.lineTo(0, r * 0.3); ctx.moveTo(-r * 0.25, r * 0.05); ctx.lineTo(0, r * 0.32); ctx.lineTo(r * 0.25, r * 0.05); ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = col; ctx.stroke(); }
  else if (k === 'discard') { ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.25); ctx.lineTo(r * 0.25, r * 0.25); ctx.moveTo(r * 0.25, -r * 0.25); ctx.lineTo(-r * 0.25, r * 0.25); ctx.lineWidth = Math.max(1.5, r * 0.13); ctx.strokeStyle = col; ctx.stroke(); }
  else { ctx.save(); ctx.translate(0, r * 0.05); ctx.scale(r * 0.5, r * 0.5); G.flame(ctx, '#ff7a2b', '#ffd86b'); ctx.restore(); }
  ctx.restore();
}
