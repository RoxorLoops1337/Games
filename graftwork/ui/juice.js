// JUICE tuning tables and pure helpers (design/JUICE.md). No DOM, no engine imports: ui/combat.js owns the state and calls these.
// Everything that draws takes a plain 2D ctx. Reduced motion and shake settings are applied by the caller (combat.js).
import { timing as rigTiming } from '../art/attacks.js';

// ---------------------------------------------------------------- relative hit tiers
// Tiers are relative to the VICTIM's max HP: light < 8%, medium 8 to 18%, heavy > 18%; crit = Vulnerable or > 30%; overkill = beyond remaining HP.
export const TIERS = {
  light:    { stop: 0,   shake: 3,  decay: 8, roll: 0,   flash: 0,  ab: 0, zoom: 1,    sparks: 6,  ring: false, dust: false, shards: false, size: 28, vy: -95, pop: 1,   tilt: 0,    wait: 70,  pitch: 1.15, body: 'hitSmall', vol: 0.8, kick: 0.5, vig: 0.4,  sq: 0.06 },
  medium:   { stop: 45,  shake: 6,  decay: 6, roll: 0,   flash: 60, ab: 0, zoom: 1,    sparks: 12, ring: true,  dust: false, shards: false, size: 36, vy: -70, pop: 1.4, tilt: 0,    wait: 100, pitch: 1,    body: 'hitSmall', vol: 1,   kick: 0.8, vig: 0.65, sq: 0.12 },
  heavy:    { stop: 90,  shake: 11, decay: 5, roll: 1.5, flash: 90, ab: 3, zoom: 1,    sparks: 20, ring: true,  dust: true,  shards: false, size: 48, vy: -60, pop: 1.4, tilt: 0,    wait: 120, pitch: 0.9,  body: 'hitBig',   vol: 1,   kick: 1.2, vig: 0.9,  sq: 0.18, ink: true },
  crit:     { stop: 120, shake: 14, decay: 4, roll: 2,   flash: 90, ab: 6, zoom: 1.04, sparks: 26, ring: true,  dust: true,  shards: true,  size: 58, vy: -50, pop: 1.5, tilt: 0.14, wait: 140, pitch: 0.8,  body: 'hitBig',   vol: 1,   kick: 1.6, vig: 1,    sq: 0.22, ink: true, rim: '#ff2a3a' },
  overkill: { stop: 140, shake: 16, decay: 4, roll: 2.5, flash: 90, ab: 8, zoom: 1.05, sparks: 30, ring: true,  dust: true,  shards: true,  size: 58, vy: -50, pop: 1.5, tilt: 0.14, wait: 150, pitch: 0.7,  body: 'hitBig',   vol: 1,   kick: 2,   vig: 1,    sq: 0.24, ink: true, rim: '#ff2a3a', slow: 0.4, slowMs: 250, gore: true },
};
export const TIER_ORDER = ['light', 'medium', 'heavy', 'crit', 'overkill'];

// n = damage that reached HP, maxHp / hpBefore = victim values, vulnerable = victim carries Vulnerable.
export function classify(n, maxHp, hpBefore, vulnerable) {
  const mx = Math.max(1, maxHp || 1);
  const pct = n / mx;
  const over = Math.max(0, n - Math.max(0, hpBefore));
  const overkill = over >= Math.max(2, 0.05 * mx) && n > 0;
  const crit = pct > 0.30 || (!!vulnerable && pct >= 0.08);
  let tier = pct < 0.08 ? 'light' : pct <= 0.18 ? 'medium' : 'heavy';
  if (crit) tier = 'crit';
  if (overkill) tier = 'overkill';
  return { tier, crit, overkill, over, pct };
}

// ---------------------------------------------------------------- multi-hit counter
// Hits on the same victim within `win` ms merge into one counter that ticks up; the last hit slams "xN = total".
export class HitCounter {
  constructor(win = 350) { this.win = win; this.list = []; }
  hit(key, n, now, last = false, x = 0, y = 0) {
    let c = null;
    for (const k of this.list) if (k.key === key && !k.done && now - k.at <= this.win) { c = k; break; }
    if (!c) { c = { key, count: 0, total: 0, at: now, born: now, done: false, slamAt: 0, x, y, grow: 1 }; this.list.push(c); }
    c.count++; c.total += n; c.at = now; c.x = x; c.y = y; c.grow = 1 + 0.04 * (c.count - 1);
    if (last) this.finish(c, now);
    return c;
  }
  finish(c, now) { if (!c.done) { c.done = true; c.slamAt = now; } }
  update(now) {
    for (const c of this.list) if (!c.done && now - c.at > this.win) this.finish(c, now);
    if (this.list.length) this.list = this.list.filter((c) => !c.done || now - c.slamAt < 1100);
  }
}
export function counterText(c) { return c.done ? `x${c.count} = ${c.total}` : `x${c.count}  ${c.total}`; }
export function drawCounters(ctx, hc, now) {
  for (const c of hc.list) {
    if (c.count < 2) continue;
    const slam = c.done ? Math.min(1, (now - c.slamAt) / 140) : 0;
    const age = c.done ? (now - c.slamAt) / 1100 : 0;
    const spring = c.done ? 1 + 0.9 * (1 - slam) * (1 - slam) : c.grow;
    const size = Math.round((34 + Math.min(c.count, 12) * 2.5) * spring * (c.done ? 1.25 : 1));
    const shake = c.done ? 0 : Math.min(6, c.count * 0.7);
    const jx = shake ? Math.sin(now * 0.09 + c.count) * shake : 0, jy = shake ? Math.cos(now * 0.11) * shake : 0;
    ctx.save();
    ctx.globalAlpha = c.done ? Math.max(0, 1 - Math.max(0, age - 0.55) / 0.45) : 1;
    ctx.translate(c.x + jx, c.y - 70 - Math.min(40, c.count * 4) + jy + (c.done ? age * -26 : 0));
    ctx.rotate(c.done ? -0.08 * (1 - slam) : 0);
    ctx.font = `bold ${size}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#0e0e0e';
    const t = counterText(c);
    ctx.strokeText(t, 0, 0);
    ctx.fillStyle = c.done ? '#F2C14E' : c.count >= 6 ? '#ff7a3a' : '#e8dcc4';
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- enemy attack timeline
// timing(id, body) comes from art/attacks.js (ms). Returns null when absent so the caller falls back to the old 500 ms lunge.
export function atkTiming(def) {
  try {
    if (typeof rigTiming !== 'function') return null;
    const t = rigTiming(def && def.id, def && def.art && def.art.body);
    if (!t || !(t.tell >= 0) || !(t.act > 0)) return null;
    return { tell: t.tell, act: t.act, hold: t.hold || 0, rec: t.rec || 0, impactMs: t.impactMs || t.tell + t.act };
  } catch (e) { return null; }
}
export const atkTotal = (tm) => tm.tell + tm.act + tm.hold + tm.rec;
// ms since the act began -> { phase, k, lunge }. lunge is the old 0..1 scalar (1 at contact) for bodies that still read o.attack.
export function atkPhase(tm, ms) {
  const q = (a, b) => Math.max(0, Math.min(1, b > 0 ? a / b : 1));
  if (ms < tm.tell) { const k = q(ms, tm.tell); return { phase: 'tell', k, lunge: -0.2 * k }; }
  const a = ms - tm.tell;
  if (a < tm.act) { const k = q(a, tm.act); return { phase: 'act', k, lunge: -0.2 + 1.2 * k * k * (3 - 2 * k) }; }
  const h = a - tm.act;
  if (h < tm.hold) return { phase: 'hold', k: q(h, tm.hold), lunge: 1 };
  const r = h - tm.hold;
  if (r < tm.rec) { const k = q(r, tm.rec); return { phase: 'rec', k, lunge: 1 - k * k * (3 - 2 * k) }; }
  return { phase: 'idle', k: 0, lunge: 0 };
}

// ---------------------------------------------------------------- springs, noise, shake
// critically damped-ish spring on obj[key] with velocity in obj[key + 'v'].
export function spring(obj, key, target, dt, k = 380, c = 18) {
  const vk = key + 'v';
  let d = Math.min(dt, 0.03), v = obj[vk] || 0, x = obj[key] || 0;
  v += (-k * (x - target) - c * v) * d; x += v * d;
  if (Math.abs(x - target) < 0.0005 && Math.abs(v) < 0.01) { x = target; v = 0; }
  obj[key] = x; obj[vk] = v;
}
export function noise1(x) { // smooth value noise in 0..1
  const i = Math.floor(x), f = x - i, h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
// sh = { amp, dx, dy, roll (deg), t, seed } -> camera offset { x, y, rot } (directional oscillation plus smoothed perpendicular noise)
export function shakeOffset(sh, ampRef = 11) {
  if (!(sh.amp > 0)) return { x: 0, y: 0, rot: 0 };
  const osc = Math.sin(sh.t * 62) * sh.amp;
  const n1 = (noise1(sh.t * 30 + sh.seed) - 0.5) * 2, n2 = (noise1(sh.t * 27 + sh.seed + 40) - 0.5) * 2;
  return {
    x: sh.dx * osc + (-sh.dy) * n1 * sh.amp * 0.4 + n2 * sh.amp * 0.15,
    y: sh.dy * osc + sh.dx * n1 * sh.amp * 0.4 + n1 * sh.amp * 0.15,
    rot: (sh.roll || 0) * Math.PI / 180 * n2 * Math.min(1, sh.amp / ampRef),
  };
}
// stacking rule: a new kick never lowers the current amplitude, partly adds
export function kickAmp(cur, px) { return Math.min(24, Math.max(cur, px) + 0.25 * Math.min(cur, px)); }

// squash limit by body: jars and slime 1.3, metal 1.08, everything else 1.2 (returned as max deviation)
export function squashLimit(def) {
  const s = ((def && def.id) || '') + ' ' + ((def && def.art && def.art.body) || '');
  if (/slime|jar|brine|blob|sludge|pill/i.test(s)) return 0.3;
  if (/iron|steel|defib|cleaver|bell|lung|cage|gurney|machine|rust|clamp|saw/i.test(s)) return 0.08;
  return 0.2;
}

// ---------------------------------------------------------------- danger, combo, misc
export function danger(frac, alive = true) {
  if (!alive || !(frac < 0.3)) return { on: false, bpm: 0, lowpass: 0, level: 0 };
  const bpm = frac < 0.15 ? 110 : Math.round(60 + (0.3 - frac) / 0.15 * 50);
  return { on: true, bpm, lowpass: 800, level: frac < 0.15 ? 1 : 0.6 };
}
export const COMBO_STEPS = [{ at: 0, col: '#e8dcc4' }, { at: 20, col: '#F2C14E' }, { at: 40, col: '#E8571F' }, { at: 80, col: '#ff3a3a' }];
export function comboLevel(total) { let l = 0; for (let i = 0; i < COMBO_STEPS.length; i++) if (total >= COMBO_STEPS[i].at) l = i; return l; }
const PENT = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
export const pent = (i) => PENT[i % 5] * Math.pow(2, Math.floor(i / 5));
export function causeOfDeath(moveName, n) { return moveName ? `Killed by ${moveName}${n > 0 ? ` (${n})` : ''}` : n > 0 ? `Killed by the ward (${n})` : 'Killed by the ward'; }
// timings of a played card in seconds (JUICE.md card choreography)
export const CARD = { lift: 0.09, wind: 0.07, flight: 0.11, impact: 0.04, fold: 0.15, burn: 0.45, crack: 0.12, hold: 0.08 };
export const FINAL = { hold: 0.42, seams: 6, perSeam: 0.06 };

// ---------------------------------------------------------------- drawing helpers
export function drawCombo(ctx, cb, x, y, now) {
  if (!(cb.shown >= 1) && !cb.stamp) return;
  const lvl = comboLevel(cb.dmg), col = COMBO_STEPS[lvl].col;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (cb.dmg > 0 && !cb.stamp) {
    const s = 1 + cb.pulse * 0.4 + lvl * 0.12;
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.font = 'bold 13px Trebuchet MS, sans-serif'; ctx.fillStyle = 'rgba(232,220,196,.7)'; ctx.fillText('DAMAGE', 0, -26);
    ctx.font = 'bold 40px Georgia, serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#0e0e0e'; const t = String(Math.round(cb.shown));
    ctx.strokeText(t, Math.sin(now * 0.05) * lvl * 0.8, 0); ctx.fillStyle = col; ctx.fillText(t, Math.sin(now * 0.05) * lvl * 0.8, 0);
  } else if (cb.stamp) {
    const k = Math.min(1, cb.stamp.t / 1.1), pop = cb.stamp.t < 0.12 ? 1.8 - 0.8 * (cb.stamp.t / 0.12) : 1;
    ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    ctx.translate(x, y - k * 24); ctx.scale(pop, pop); ctx.rotate(-0.1);
    ctx.font = 'bold 46px Georgia, serif'; ctx.lineWidth = 7; ctx.strokeStyle = '#0e0e0e';
    ctx.strokeText(String(cb.stamp.total), 0, 0); ctx.fillStyle = COMBO_STEPS[comboLevel(cb.stamp.total)].col; ctx.fillText(String(cb.stamp.total), 0, 0);
  }
  ctx.restore();
}
export function drawKilledBy(ctx, text, x, y, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = 'bold 22px Georgia, serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#0e0e0e'; ctx.strokeText(text, x, y); ctx.fillStyle = '#ff5a5a'; ctx.fillText(text, x, y);
  ctx.restore();
}
// glowing seam lines over an enemy body (foot-anchored, w x h box): `lit` of FINAL.seams seams are lit
export function drawSeams(ctx, x, footY, w, h, lit, t, fade = 1) {
  if (lit <= 0) return;
  ctx.save(); ctx.translate(x, footY); ctx.lineCap = 'round'; ctx.setLineDash([7, 5]);
  for (let i = 0; i < Math.min(lit, FINAL.seams); i++) {
    const fy = -h * (0.14 + i * 0.13), amp = 5 + (i % 3) * 3, flick = 0.75 + 0.25 * Math.sin(t * 40 + i * 2);
    ctx.globalAlpha = flick * fade;
    for (const [lw, col] of [[7, 'rgba(242,193,78,.28)'], [2.4, '#ffe9a8']]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
      const x0 = -w * 0.42, x1 = w * 0.42, n = 8;
      for (let s = 0; s <= n; s++) { const px = x0 + (x1 - x0) * s / n, py = fy + (s % 2 ? -amp : amp) * 0.6; if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }
  ctx.restore();
}
// a lone black thread floating down from (x, y)
export function drawThread(ctx, th) {
  const k = th.t / th.life; if (k >= 1) return;
  ctx.save(); ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath();
  const y0 = th.y + k * 150;
  for (let i = 0; i <= 14; i++) { const u = i / 14, px = th.x + Math.sin(u * 5 + th.t * 2) * 12 * (1 - u * 0.3), py = y0 - 90 + u * 90; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke(); ctx.restore();
}
export function drawVictory(ctx, W, E, goldLine) {
  const t = E.t;
  if (t >= 0.12) {
    const k = Math.min(1, (t - 0.12) / 0.12), sc = 1.8 - 0.8 * (1 - Math.pow(1 - k, 3)) , a = Math.min(1, (t - 0.12) / 0.06) * (t > 1.5 ? Math.max(0, (1.8 - t) / 0.3) : 1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 250); ctx.scale(sc, sc); ctx.rotate(-0.04);
    ctx.font = 'bold 84px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = '#0e0e0e';
    ctx.strokeText('VICTORY', 0, 0); ctx.fillStyle = '#F2C14E'; ctx.fillText('VICTORY', 0, 0); ctx.restore();
  }
  if (t >= 0.9 && goldLine) {
    const k = Math.min(1, (t - 0.9) / 0.35), ease = 1 - Math.pow(1 - k, 3);
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 2) * (t > 1.55 ? Math.max(0, (1.8 - t) / 0.25) : 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = 'bold 28px Georgia, serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#0e0e0e';
    const y = 330 + (1 - ease) * 40; ctx.strokeText(goldLine, W / 2, y); ctx.fillStyle = '#e8dcc4'; ctx.fillText(goldLine, W / 2, y); ctx.restore();
  }
}
export function drawDeathCard(ctx, W, H, t) {
  const a = Math.max(0, Math.min(1, (t - 1.7) / 0.8));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#E8DCC4'; ctx.fillRect(0, 0, W, H);
  const b = Math.max(0, Math.min(1, (t - 2.0) / 0.6));
  ctx.globalAlpha = b; ctx.fillStyle = '#2B1E1A'; ctx.font = 'italic bold 40px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('The ward remembers.', W / 2, H / 2); ctx.restore();
}
