// 37-c in-run HUD ideas: (1) a baked danger chevron stack on the floor line under the snake face when it gets close,
// (2) a one-time cycling caption for the cryptic stats strip icons, (3) left-hand mirror helpers for the pause and stats buttons.
// Pure helpers plus two small draw functions; sprites are baked once through the kit, nothing allocates per frame.
import { W, LINE_Y } from './sim.js';

// ---------------------------------------------------------------- danger chevron
export const DANGER_MIN = 0.22;   // g.danger below this draws nothing (the sim raises it when the face is within 300 units of the end of the path)
// the face that is closest to the line (lowest on screen), or null
export function lowestHead(g) {
  const sn = g && g.snakes; let best = null;
  if (!sn) return null;
  for (let i = 0; i < sn.length; i++) { const q = sn[i].segs && sn[i].segs[0]; if (q && q.hp > 0 && (!best || q.y > best.y)) best = q; }
  return best;
}
export const dangerK = g => Math.max(0, Math.min(1, ((g.danger || 0) - DANGER_MIN) / (1 - DANGER_MIN)));
// x of the stack: under the face, kept clear of the screen edge
export const chevX = x => Math.max(54, Math.min(W - 54, x));
// one chevron pointing up at the face: dark outline under a hot red body with a pale rim
function chevronPaint(c) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-34, 11); c.lineTo(0, -11); c.lineTo(34, 11);
  c.strokeStyle = '#2a0614'; c.lineWidth = 19; c.stroke();
  c.strokeStyle = '#ff3d66'; c.lineWidth = 13; c.stroke();
  c.strokeStyle = '#ffd0da'; c.lineWidth = 4; c.stroke();
}
export function drawDangerChevron(ctx, kit, g, S, reduce, glow) {
  if (!g || g.ring || g.phase !== 'play') return false;
  const k = dangerK(g); if (k <= 0) return false;
  const h = lowestHead(g); if (!h) return false;
  const spr = kit && kit.bake ? kit.bake('dngchev14c', 84, 44, chevronPaint) : null;
  const x = chevX(h.x), y0 = LINE_Y + 22, a = 0.35 + 0.65 * k;
  const ph = reduce ? 0 : (S.t * (1.6 + 2.2 * k)) % 1;   // the three chevrons light one after another, upward, faster as the face nears
  ctx.save();
  if (glow && !reduce) glow(x, LINE_Y + 40, 70 + 30 * k, '#ff3d66', 0.12 + 0.16 * k);
  for (let i = 0; i < 3; i++) {   // i = 0 is the lowest; the top one sits right under the line
    const lit = reduce ? (i === 2 ? 1 : 0.5) : Math.max(0.25, 1 - Math.abs(ph * 3 - i) * 0.55);
    ctx.globalAlpha = Math.min(1, a * lit);
    const cy = y0 + (2 - i) * 24 + 12;
    if (spr) ctx.drawImage(spr.c, x - 42, cy - 22, 84, 44); else { ctx.save(); ctx.translate(x, cy); chevronPaint(ctx); ctx.restore(); }
  }
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- one-time caption for the stats strip
export const STATS_LABELS = [
  { k: 'speed', text: 'SNAKE SPEED', x: 72 },
  { k: 'notes', text: 'NOTES PER SHOT', x: 167 },
  { k: 'burst', text: 'BURSTS PER SHOT', x: 229 },
  { k: 'rate', text: 'FIRE RATE', x: 291 },
  { k: 'dmg', text: 'DAMAGE', x: 397 },
];
export const LABEL_T0 = 5, LABEL_STEP = 1.4;   // starts 5 s into a run (after the slide hint), 1.4 s per caption
export const LABEL_END = LABEL_T0 + STATS_LABELS.length * LABEL_STEP;
const KEY = 'cell_serpent_hint_stats_b14c';
let memSeen = false;
export function statsHintSeen() {
  if (memSeen) return true;
  try { if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) memSeen = true; } catch (e) { /* private mode */ }
  return memSeen;
}
export function markStatsHintSeen() {
  memSeen = true;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
}
export function statsHintReset() { memSeen = false; try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
// which caption shows at run time t: -1 = none
export function statsLabelAt(t) { if (t < LABEL_T0 || t >= LABEL_END) return -1; return Math.min(STATS_LABELS.length - 1, Math.floor((t - LABEL_T0) / LABEL_STEP)); }
// draws the caption pill under the strip; call inside the (possibly mirrored) HUD layer with the plain text/glass helpers
export function drawStatsHint(g, cy, S, helpers) {
  if (!g || g.phase !== 'play' || statsHintSeen()) return false;
  const i = statsLabelAt(g.t);
  if (i < 0) { if (g.t >= LABEL_END) markStatsHintSeen(); return false; }
  const L = STATS_LABELS[i], { glass, text, ctx, reduce } = helpers;
  const into = (g.t - LABEL_T0) - i * LABEL_STEP, a = Math.min(1, into * 6, (LABEL_STEP - into) * 6);
  const w = Math.round(L.text.length * 14.4 + 36), x = Math.max(w / 2 + 12, Math.min(W - w / 2 - 12, L.x)), y = cy + 40;
  ctx.save(); ctx.globalAlpha *= Math.max(0, a);
  glass(x - w / 2, y - 18, w, 36, 18, 'rgba(255,255,255,.6)', 'rgba(14,9,48,.9)');
  // a small pointer toward the icon
  ctx.beginPath(); ctx.moveTo(L.x - 8, y - 18); ctx.lineTo(L.x, y - 28 + (reduce ? 0 : 2 * Math.sin(S.t * 8))); ctx.lineTo(L.x + 8, y - 18); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  text(L.text, x, y + 1, 24, '#ffffff', '#0b1020');
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- left-hand mirror
// x of a hud element when the HUD rows are mirrored for left-handed play
export const mirrorX = (x, left) => left ? W - x : x;
// pause and stats button zones in left-hand play: the same rows, the left edge (hud.js hudZone calls this)
export function hudZoneLeft(gp, t, pe, se, m) {
  if (gp.x < Math.max(76, m)) { if (gp.y < t + pe) return 'pause'; if (gp.y < t + se) return 'stats'; }
  return '';
}
