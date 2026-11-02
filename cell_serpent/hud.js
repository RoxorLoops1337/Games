// In-run HUD (canvas, 720x1280 game units). Glass chips, a title plate, a progress bar with
// chest markers, an equalizer groove meter and round skill tiles with cooldown rings.
// The renderer hands in its helpers; this file never touches the sim state.
import { landBounce } from './hitjuice.js';
import { paintPauseGlyph, paintStatsGlyph } from './glyphs_ui.js';
import { W, H, WEAPONS, uv, isBossStage, virusName, GOLD_TIME } from './sim.js';
import { heartbeat } from './feel6.js';
import { createTileMemo, createBuffChips, levelSparkle } from './hud_b11.js';

const TAU = Math.PI * 2;
const WMAX = Object.fromEntries(WEAPONS.map(w => [w.id, w.max]));
const WNAME = Object.fromEntries(WEAPONS.map(w => [w.id, w.name]));
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerpCol = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`; };
// 20 groove bars: pink at the bottom of the scale, cyan in the middle, gold at the top
const BAR_COL = Array.from({ length: 20 }, (_, i) => i < 10 ? lerpCol('#ff7eb6', '#6fe3ff', i / 9) : lerpCol('#6fe3ff', '#ffd84d', (i - 10) / 9));

// ---- notch / home bar: CSS insets measured through a hidden probe (var(--cs-sat) wins over env(), so a
// test can fake a notch), converted to game units. Only the part not already covered by the letterbox counts.
let probe = null, cssCache = { at: -1e9, t: 0, b: 0 };
function cssInsets() {
  if (typeof document === 'undefined' || !document.body) return cssCache;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - cssCache.at < 400) return cssCache;
  try {
    if (!probe) { probe = document.createElement('div'); probe.setAttribute('aria-hidden', 'true'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:var(--cs-sat,env(safe-area-inset-top,0px));padding-bottom:var(--cs-sab,env(safe-area-inset-bottom,0px))'; document.body.appendChild(probe); }
    const cs = getComputedStyle(probe);
    cssCache = { at: now, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  } catch (e) { cssCache = { at: now, t: 0, b: 0 }; }
  return cssCache;
}
// L is the renderer layout ({ cw, s, oy }); returns the extra top and bottom room in game units
export function safeUnits(L) {
  const c = cssInsets(), iw = typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : 0;
  if (!iw || !L || !(L.s > 0)) return { t: 0, b: 0 };
  const dpr = L.cw / iw;
  return { t: Math.min(140, Math.max(0, c.t * dpr - L.oy) / L.s), b: Math.min(140, Math.max(0, c.b * dpr - L.oy) / L.s) };
}
// pause and stats round buttons, top right; t is the top inset in game units (main.js hit test uses this too)
export function hudZone(gp, t = 0) {
  if (gp.x > W - 76) { if (gp.y < t + 76) return 'pause'; if (gp.y < t + 150) return 'stats'; }
  return '';
}
// 06-hud b10: skill tile layout. Tiles are about 10 percent bigger up to 4 skills, and a 9 skill row squeezes to
// fit between the groove plate (right edge 244, plus a 12 unit safe gap) and the right margin. Pure, so tests can check it.
export const SKILL_LEFT = 256, SKILL_RIGHT = 698;
export function skillLayout(n) {
  n = Math.max(1, n | 0);
  const r0 = n <= 4 ? 29 : n === 5 ? 26.5 : 26, pitch = Math.min(2 * r0 + 6, (SKILL_RIGHT - SKILL_LEFT) / n), r = Math.min(r0, pitch / 2 - 2);
  return { r, pitch, left: SKILL_RIGHT - (n - 1) * pitch - 2 * r, chipUp: SKILL_RIGHT - (n - 1) * pitch - 2 * r < 412 };
}
// combo tier names for the small tag on the combo plate
export function comboTier(n) { return n >= 40 ? 'MEGA' : n >= 20 ? 'SUPER' : n >= 10 ? 'GROOVY' : n >= 5 ? 'NICE' : ''; }
const BOSS_DY = 24;   // the boss HP bar pushes the stat row down

export function createHud(env) {
  const { ctx, text, blit, kit, S, INK, glow, sparkleAt } = env;
  const T = { g: null, pop: {}, pressAt: {}, gv: 0, bsLast: 0, bsAt: -9, bsHi: 0, cdMax: {}, cdLast: {}, chestAt: {}, lastProg: 0, readyAt: {}, lastSnd: -9, bossTot: 0, bossV: 1, bossHitAt: -9, encV: 0, encFull: -9, ins: { t: 0, b: 0 }, msAt: -9, msN: 0, lvLast: {}, lvAt: {}, t0: 0, bossGhost: 1, newAt: {}, coinV: -1, coinPrev: -1, coinAt: -9, coinT: 0, flashAt: -9 };
  const B8 = { fl: [], landAt: -9, gainN: 0, gainAt: -9, raw: -1, ch: 0, encPrev: 0, encGainAt: -9 };   // 06-hud b8: chest flights, the +N chip, encore gain pulse
  const reduce = () => !!(env.OPT && env.OPT.reduceMotion);
  // menu text size slider also lifts the small in-run labels (capped so the fixed glass plates still fit)
  const fz = n => Math.round(n * Math.min(1.3, (env.OPT && env.OPT.textScale) || 1));
  // 06-hud b9: phone legibility floor, the small labels are about 11px on a 390 wide screen (text size slider lifts them a little, capped to keep the plates intact)
  const fzp = n => Math.round(n * Math.min(1.12, (env.OPT && env.OPT.textScale) || 1));
  const bigT = () => ((env.OPT && env.OPT.textScale) || 1) > 1.1;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  // frosted glass: dark tint, hairline rim and a soft top gloss
  const hcOn = () => !!(env.OPT && env.OPT.highContrast);
  const hcRim = rim => /^rgba\(255,255,255/.test(rim) ? '#ffffff' : rim.replace(/,[\d.]+\)$/, ',1)');
  function glassPaint(c, x, y, w, h, r, rim, tint) {
    if (hcOn()) { rim = hcRim(rim); tint = tint === PLATE_BOSS_TINT ? 'rgba(48,4,24,.95)' : 'rgba(6,4,24,.93)'; }   // high contrast: near-solid panels and opaque rims, so numbers never sit on the art
    const path = () => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    path(); c.fillStyle = tint; c.fill();
    c.save(); path(); c.clip(); c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(x, y, w, h * 0.45); c.restore();
    path(); c.strokeStyle = rim; c.lineWidth = 2; c.stroke();
  }
  // panels are static, so each size/colour is baked once and blitted (a clip + 3 paths per panel per frame otherwise)
  // remembered by value (rim, tint, size) so a steady frame builds no key string and no closure per panel; dropped when the kit drops its sprites
  const GM = new Map(); let gmGen = -1, gmHc = -1;
  function glassSpr(w, h, r, rim, tint) {
    const hc = hcOn() ? 1 : 0; if (gmGen !== kit.gen || gmHc !== hc) { GM.clear(); gmGen = kit.gen; gmHc = hc; }
    let a = GM.get(rim); if (!a) GM.set(rim, a = new Map());
    let b = a.get(tint); if (!b) a.set(tint, b = new Map());
    const k = (w * 4096 + h) * 64 + r;
    let v = b.get(k); if (v === undefined) { v = kit.bake(`glass|${w}|${h}|${r}|${rim}|${tint}|${hc}`, w + 8, h + 8, c => glassPaint(c, -w / 2, -h / 2, w, h, r, rim, tint)); if (Number.isInteger(w) && Number.isInteger(h) && Number.isInteger(r) && b.size < 200) b.set(k, v); }
    return v;
  }
  function glass(x, y, w, h, r, rim = 'rgba(255,255,255,.32)', tint = 'rgba(14,9,48,.52)') {
    const spr = kit && kit.bake ? glassSpr(w, h, r, rim, tint) : null;
    if (spr) ctx.drawImage(spr.c, x - 4, y - 4, w + 8, h + 8); else glassPaint(ctx, x, y, w, h, r, rim, tint);
  }
  function glassCirclePaint(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = hcOn() ? 'rgba(6,4,24,.93)' : 'rgba(14,9,48,.52)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r * 0.28, r * 0.72, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
  }
  // 06-hud: the static chrome (upgrade chip, title plate, coin plate, progress track, pause and stats buttons) is
  // painted once into one layer per boss/hard variant and blitted in a single drawImage per frame
  const CH_W = 720, CH_H = 150, PLATE_BOSS_TINT = 'rgba(70,8,36,.58)';
  function chromePaint(c, boss, hard) {
    c.translate(-CH_W / 2, -CH_H / 2);
    const gp = (x, y, w, h, r, rim, tint = 'rgba(14,9,48,.52)') => glassPaint(c, x, y, w, h, r, rim, tint);
    gp(16, 14, 124, 52, 26, 'rgba(255,216,77,.55)');
    gp(W / 2 - 110, 8, 220, 68, 22, boss ? 'rgba(255,90,130,.8)' : 'rgba(255,255,255,.4)', boss ? PLATE_BOSS_TINT : 'rgba(14,9,48,.56)');
    if (hard) gp(W / 2 - 110 + 168, -2, 66, 26, 13, 'rgba(201,160,255,.8)', 'rgba(60,20,110,.85)');
    gp(484, 14, 142, 52, 26, 'rgba(255,210,74,.55)');
    gp(22, 86, 582, 32, 16, 'rgba(255,255,255,.4)', 'rgba(8,5,30,.62)');
    const bx = W - 38;
    glassCirclePaint(c, bx, 40, 26); paintPauseGlyph(c, bx, 40);
    glassCirclePaint(c, bx, 112, 26); paintStatsGlyph(c, bx, 112);
  }
  function chrome(boss, hard) {
    const spr = kit && kit.bake ? kit.bake(`chrome06|${boss ? 1 : 0}|${hard ? 1 : 0}|${hcOn() ? 1 : 0}`, CH_W, CH_H, c => chromePaint(c, boss, hard)) : null;
    if (spr) ctx.drawImage(spr.c, 0, 0, CH_W, CH_H); else { ctx.save(); ctx.translate(CH_W / 2, CH_H / 2); chromePaint(ctx, boss, hard); ctx.restore(); }
  }
  // static, so baked once per radius: 3 paths per round button per frame become one drawImage
  function glassCircle(x, y, r) {
    const spr = kit && kit.bake ? kit.bake('gcirc|' + r + '|' + (hcOn() ? 1 : 0), r * 2 + 8, r * 2 + 8, c => glassCirclePaint(c, 0, 0, r)) : null;
    if (spr) ctx.drawImage(spr.c, x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8); else glassCirclePaint(ctx, x, y, r);
  }
  // a value that bounces for a moment when it changes
  function pop(key, v) {
    const o = T.pop[key] || (T.pop[key] = { v, at: -9 });
    if (o.v !== v) { if (v > o.v) o.at = S.t; o.v = v; }
    const k = Math.max(0, 1 - (S.t - o.at) / 0.38);
    return 1 + 0.45 * k * k * (k > 0.5 ? 1 : 0.6) + (k > 0 ? Math.sin(k * 3) * 0.05 : 0);
  }
  function scaled(x, y, s, fn) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); fn(); ctx.restore(); }

  function bolt(x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath();
    ctx.moveTo(3, -11); ctx.lineTo(-7, 2); ctx.lineTo(-1, 2); ctx.lineTo(-4, 11); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function star(x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5 : 12; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function burstIcon(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#6fe3ff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    for (const [dx, dy] of [[-9, 6], [0, -8], [9, 6]]) { ctx.beginPath(); ctx.arc(dx, dy, 5, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  function top(g) {
    const boss = isBossStage(g.stage), cy = 40;
    // upgrade cells left on the snake
    const uvl = g.upgradeLeft || 0;
    chrome(boss, !!g.hard);
    ctx.beginPath(); ctx.arc(42, cy, 17, 0, TAU); ctx.fillStyle = '#ffd84d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    sparkleAt(42, cy, 13);
    const su = Math.max(pop('up', uvl), landBounce(S, 'up')); scaled(66, cy + 2, su, () => text('x ' + uvl, 0, 0, 26, '#ffd84d', '#0b1020', 'left'));
    // chests carried by the snake
    let ch = 0; for (const sn of g.snakes) for (const q of sn.segs) if (q.carry === 'chest' && q.hp > 0) ch++;
    B8.ch = ch;
    if (ch) {
      glass(146, 14, 92, 52, 26, 'rgba(255,233,168,.5)');
      blit(kit && kit.SPR.pickup('chest'), 176, cy, 44);
      const sc = pop('chest', ch); scaled(200, cy + 2, sc, () => text('x ' + ch, 0, 0, 22, '#ffe9a8', '#0b1020', 'left'));
    }
    // title plate
    const px = W / 2 - 110, rim = boss ? 'rgba(255,90,130,.8)' : 'rgba(255,255,255,.4)';
    text(boss ? 'BOSS ' + g.stage : 'STAGE ' + g.stage, W / 2, 30, 28, boss ? '#ff7a9a' : '#ffffff');
    const nm = g.mode === 'pig' ? 'Piggy Bank Parade' : virusName(g.stage), fs = nm.length > 15 ? fzp(16) : fzp(20);
    text(nm, W / 2, 58, fs, '#ffd0e6');
    if (g.hard) { text('HARD', px + 201, 11, 16, '#e2caff', '#0b1020'); }
    // coins, bouncing when they grow
    const coins = Math.floor(g.coins), sc = Math.max(pop('coin', coins), landBounce(S, 'coin'));
    // 06-hud b7: the number rolls up to the real total, the coin spins on a pickup and the plate catches a gold glint
    const cdt = Math.max(0, Math.min(0.1, S.t - T.coinT)); T.coinT = S.t;
    if (coins > T.coinPrev && T.coinPrev >= 0 && S.t - T.coinAt > 0.2) T.coinAt = S.t;   // a fresh spin only once the last one is mostly done
    T.coinPrev = coins;
    if (T.coinV < 0 || coins < T.coinV || reduce()) T.coinV = coins;
    else if (coins > T.coinV) T.coinV = Math.min(coins, T.coinV + Math.max(1, (coins - T.coinV) * Math.min(1, cdt * 9)));
    const shown = Math.floor(T.coinV), rolling = shown < coins, ck = Math.max(0, 1 - (S.t - T.coinAt) / 0.5);
    const spin = ck > 0 && !reduce() ? Math.cos((1 - ck) * TAU * 1.5) : 1;
    ctx.save(); ctx.translate(514, cy); ctx.scale(sc * (Math.abs(spin) < 0.12 ? 0.12 : Math.abs(spin)), sc); blit(kit && kit.SPR.pickup('coin'), 0, 0, 52); ctx.restore();
    if (ck > 0 && !reduce()) { glow(514, cy, 40 + 14 * ck, '#ffd84d', 0.38 * ck); sparkleAt(514 + 16, cy - 16, 7 * ck + 3); }
    scaled(542, cy + 2, sc, () => text(String(shown), 0, 0, 26, rolling ? '#fff3b0' : '#ffd24a', '#0b1020', 'left'));
    // pause and stats: round glass buttons (hit zones live in main.js at the same spots)
    const bx = W - 38;
    for (const [id, by2] of [['pause', cy], ['stats', 112]]) {   // press feedback: a squeeze flash and a ring that opens
      const k = Math.max(0, 1 - (S.t - (T.pressAt[id] === undefined ? -9 : T.pressAt[id])) / 0.32);
      if (k <= 0) continue;
      ctx.save(); ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by2, 26 * (0.82 + 0.18 * (1 - k)), 0, TAU); ctx.fill();
      if (!reduce()) { ctx.globalAlpha = k; ctx.strokeStyle = '#ffe0f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by2, 26 + 16 * (1 - k), 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }

  function progress(g) {
    const boss = isBossStage(g.stage), pr = Math.max(0, Math.min(1, g.progress || 0));
    const bx = 26, bw = 574, by = 90, bh = 24, cy = by + bh / 2;
    // light each chest the moment its mark is crossed
    if (pr < T.lastProg) T.chestAt = {};
    for (const th of [0.25, 0.5, 1]) if (pr >= th - 1e-6 && T.lastProg < th - 1e-6) T.chestAt[th] = S.t;
    T.lastProg = pr; if (pr < T.gv) T.gv = pr;
    if (pr > 0) {
      ctx.save(); rr(bx, by, bw, bh, bh / 2); ctx.clip();
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, boss ? '#ff8a5a' : '#ff9ac6'); gr.addColorStop(1, boss ? '#ff2f6a' : '#ff5aa0');
      ctx.fillStyle = gr; ctx.fillRect(bx, by, Math.max(bh, bw * pr), bh);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(bx, by, bw * pr, bh * 0.42);
      if (!reduce()) {   // a soft band of light travels along the fill
        const fw = Math.max(bh, bw * pr), sx = bx + ((S.t * 90) % (fw + 120)) - 60;
        const sh = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.38)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sh; ctx.fillRect(Math.max(bx, sx - 30), by, Math.min(60, bx + fw - Math.max(bx, sx - 30)), bh);
      }
      ctx.restore();
      if (!reduce()) {   // ghost trail: a pale comet tail that lags behind the tip while the bar is moving
        T.gv += (pr - T.gv) * 0.06;
        const lag = (pr - T.gv) * bw;
        if (lag > 1.5) {
          const tx = bx + Math.max(bh, bw * pr) - 2, len = Math.min(90, lag * 3 + 10);
          ctx.save(); rr(bx, by, bw, bh, bh / 2); ctx.clip();
          const tg = ctx.createLinearGradient(tx - len, 0, tx, 0); tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(255,255,255,.55)');
          ctx.fillStyle = tg; ctx.fillRect(tx - len, by + 3, len, bh - 6); ctx.restore();
        }
      } else T.gv = pr;
      if (pr < 1) {   // glowing tip at the front of the fill
        const tx = bx + Math.max(bh, bw * pr) - 2;
        glow(tx, cy, 20, boss ? '#ff8a8a' : '#ffc2dc', 0.35 + (reduce() ? 0 : 0.15 * Math.sin(S.t * 6)));
        ctx.beginPath(); ctx.arc(tx, cy, 5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    text(Math.floor(pr * 100) + '%', bx + 30, cy + 1, 20, '#ffffff', '#5a1038', 'center');
    // 06-hud b7: the track rim throbs red on the same lub-dub as the screen edge when the face nears the line
    const dg = g.phase === 'play' ? Math.max(0, Math.min(1, ((g.danger || 0) - 0.12) / 0.88)) : 0;
    if (dg > 0.1) {
      const hb = reduce() ? 0.6 : heartbeat(S.t, 1.3 + dg * 1.9);
      ctx.save(); rr(22, 86, 582, 32, 16); ctx.strokeStyle = '#ff3d66'; ctx.globalAlpha = Math.min(1, dg * (0.3 + 0.7 * hb) + 0.1); ctx.lineWidth = 2 + 2.5 * hb * dg; ctx.stroke(); ctx.restore();
    }
    for (const th of [0.25, 0.5, 1]) {
      const x = bx + bw * th, done = pr >= th - 1e-6, big = th === 1, size = big ? 54 : 40;
      const since = S.t - (T.chestAt[th] === undefined ? -9 : T.chestAt[th]), k = Math.max(0, 1 - since / 0.7);
      if (!big) { ctx.fillStyle = done ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)'; ctx.fillRect(x - 1.5, by - 2, 3, bh + 4); }
      if (done) glow(x, cy, size * (1.0 + 0.5 * k), '#ffd84d', 0.55 + 0.3 * Math.sin(S.t * 5));
      if (done) { const db = kit && kit.bake ? kit.bake('chestdisc07|' + size, size + 8, size + 8, c => { c.beginPath(); c.arc(0, 0, size * 0.5, 0, TAU); c.fillStyle = 'rgba(70,40,0,.62)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd84d'; c.stroke(); }) : null; if (db) ctx.drawImage(db.c, x - size / 2 - 4, cy - size / 2 - 4, size + 8, size + 8); }
      ctx.save();
      if (!done) ctx.globalAlpha = 0.5;
      scaled(x, cy - (done ? 3 * Math.abs(Math.sin(S.t * 3)) : 0), 1 + 0.5 * k * k, () => blit(kit && kit.SPR.pickup('chest'), 0, 0, size));
      ctx.restore();
      if (k > 0) { ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, cy, size * (0.4 + 0.8 * (1 - k)), 0, TAU); ctx.stroke(); ctx.restore(); }
      // 06-hud b7: a CHEST caption rises off the mark and stars fly out of it
      const ck = Math.max(0, 1 - since / 1.2);
      if (ck > 0) {
        const lab = big ? 'FINAL CHEST!' : 'CHEST ' + (th === 0.25 ? 1 : 2) + '/3', rise = reduce() ? 0 : 9 * (1 - ck * ck), cx2 = Math.max(70, Math.min(W - 70, x));
        ctx.save(); ctx.globalAlpha = Math.min(1, ck * 2.5);
        scaled(cx2, by - 3 - rise, reduce() ? 1 : 1 + 0.3 * Math.max(0, ck - 0.8) * 5, () => text(lab, 0, 0, fz(18), '#ffe27a', '#3a2200'));
        ctx.restore();
        if (!reduce() && since < 0.5) { const e = since / 0.5; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; star(x + Math.cos(a) * (14 + 40 * e), cy + Math.sin(a) * (10 + 30 * e), 0.5 * (1 - e) + 0.1, i % 2 ? '#fff3a0' : '#ffd84d'); } }
      }
    }
  }

  // 06-hud b5: both stats plates (speed, capsule stats) baked into one layer per hot/normal rim, one drawImage per frame
  function statsPlates(cy, hot) {
    const SW = 480, SH = 44, spr = kit && kit.bake ? kit.bake('stats06|' + (hot ? 1 : 0), SW, SH, c => {
      c.translate(-SW / 2, -SH / 2);
      glassPaint(c, 24, 5, 120, 34, 17, hot ? 'rgba(255,100,100,.7)' : 'rgba(255,255,255,.3)', 'rgba(14,9,48,.52)');
      glassPaint(c, 148, 5, 316, 34, 17, 'rgba(255,255,255,.32)', 'rgba(14,9,48,.52)');
    }) : null;
    if (spr) ctx.drawImage(spr.c, 0, cy - 22, SW, SH);
    else { glass(24, cy - 17, 120, 34, 17, hot ? 'rgba(255,100,100,.7)' : 'rgba(255,255,255,.3)'); glass(148, cy - 17, 316, 34, 17); }
  }
  // speed + the capsule stats as small icons
  function stats(g) {
    const sn = g.snakes[0], mult = sn ? (sn.surge === 'go' ? 2.6 : sn.slow > 0 ? 0.6 : 1) : 1, cy = 146 + (isBossStage(g.stage) ? BOSS_DY : 0), up = id => Math.round(uv(g, id));
    const hot = mult > 1, col = hot ? '#ff8a8a' : mult < 1 ? '#8ff0ff' : '#d9f7e6';
    statsPlates(cy, hot);
    blit(kit && kit.SPR.body(g.skin, false, ''), 46, cy, 40, 0);
    text('x' + mult.toFixed(1), 100, cy + 1, fzp(22), col, '#0b1020');
    const items = [['n', '' + (1 + up('notes'))], ['b', '' + (1 + up('burst'))], ['s', '+' + up('aspd') + '%'], ['d', '+' + up('cdmg') + '%']];
    const wid = [66, 66, 92, 92];
    let x = 154;
    items.forEach(([k, v], i) => {
      const ix = x + 14;
      if (k === 'n') blit(kit && kit.SPR.note(false), ix, cy, 36, 0); else if (k === 'b') burstIcon(ix, cy, 0.85); else if (k === 's') bolt(ix, cy, 0.95, '#6fe3ff'); else star(ix, cy, 0.85, '#ffd84d');
      text(v, ix + 20, cy + 1, fzp(v.length > 3 ? 18 : 21), '#e6f6ff', '#0b1020', 'left');
      x += wid[i];
    });
  }

  // groove: a 20 bar equalizer that lights from the left and dances with the beat
  function groove(g) {
    const gv = Math.max(0, g.groove || 0), x = 18, y = H - 78 - T.ins.b, w = 226, h = 64, fire = gv >= 20;
    const rim = fire ? 'rgba(255,216,77,.9)' : gv >= 15 ? 'rgba(255,216,77,.5)' : 'rgba(255,255,255,.3)';
    // change flash: gold when the groove grows a whole bar, red when it breaks
    const gi = Math.floor(gv);
    if (T.gLast === undefined) T.gLast = gi;
    if (gi > T.gLast) { T.gUp = S.t; } else if (gi < T.gLast) { T.gDn = S.t; }
    T.gLast = gi;
    const ku = Math.max(0, 1 - (S.t - (T.gUp === undefined ? -9 : T.gUp)) / 0.35), kd = Math.max(0, 1 - (S.t - (T.gDn === undefined ? -9 : T.gDn)) / 0.5);
    const tier = fire ? 2 : gv >= 15 ? 1 : 0, fl = kd > 0 ? 2 : ku > 0 ? 1 : 0;
    const fspr = kit && kit.bake ? kit.bake(`groove06|${tier}|${fl}`, w + 8, h + 8, c => {   // plate, 20 dim backing bars and the two tier ticks, one layer
      glassPaint(c, -w / 2, -h / 2, w, h, 18, fl === 2 ? 'rgba(255,90,110,.95)' : fl === 1 ? 'rgba(255,255,255,.95)' : rim, 'rgba(14,9,48,.52)');
      c.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 0; i < 20; i++) { c.beginPath(); if (c.roundRect) c.roundRect(14 - w / 2 + i * 10.4, h / 2 - 18 - i * 0.95, 7.2, 8 + i * 0.95, 3); else c.rect(14 - w / 2 + i * 10.4, h / 2 - 18 - i * 0.95, 7.2, 8 + i * 0.95); c.fill(); }
      for (const t of [15, 20]) { const tx = 14 - w / 2 + (t - 1) * 10.4 + 3.6, on = (t === 15 && tier >= 1) || (t === 20 && tier >= 2); c.fillStyle = on ? '#ffd84d' : 'rgba(255,216,77,.45)'; c.beginPath(); c.moveTo(tx - 3.5, h / 2 - 3); c.lineTo(tx + 3.5, h / 2 - 3); c.lineTo(tx, h / 2 - 8.5); c.closePath(); c.fill(); }
    }) : null;
    if (fspr) ctx.drawImage(fspr.c, x - 4, y - 4, w + 8, h + 8); else glass(x, y, w, h, 18, kd > 0 ? 'rgba(255,90,110,.95)' : ku > 0 ? 'rgba(255,255,255,.95)' : rim);
    if (kd > 0) { ctx.save(); ctx.globalAlpha = 0.3 * kd; rr(x, y, w, h, 18); ctx.fillStyle = '#ff3d5a'; ctx.fill(); ctx.restore(); }
    if (fire) glow(x + w / 2, y + h / 2, 150, '#ffd84d', 0.18 + 0.1 * Math.sin(S.t * 10));
    text(fire ? (bigT() ? 'ON FIRE' : 'GROOVE ON FIRE') : 'GROOVE', x + 14, y + 14, fzp(18), fire ? '#ffd84d' : '#ffc2dc', '#0b1020', 'left');
    if (gv >= 1) text('+' + Math.floor(gv * 1.5) + '% dmg', x + w - 12, y + 14, fzp(17), gv >= 15 ? '#ffd84d' : '#bfe9ff', '#0b1020', 'right');
    const base = y + h - 10, bw = 7.2, step = 10.4, x0 = x + 14;
    // tier ticks: bar 15 starts the gold glow, bar 20 is the fire
    if (!fspr) for (const t of [15, 20]) { const tx = x0 + (t - 1) * step + bw / 2; ctx.fillStyle = gv >= t ? '#ffd84d' : 'rgba(255,216,77,.45)'; ctx.beginPath(); ctx.moveTo(tx - 3.5, y + h - 3); ctx.lineTo(tx + 3.5, y + h - 3); ctx.lineTo(tx, y + h - 8.5); ctx.closePath(); ctx.fill(); }
    const pu = (S.t - (T.gUp === undefined ? -9 : T.gUp)) / 0.8;   // +1 bar popup rises off the new bar
    if (pu >= 0 && pu < 1 && gi > 0 && !(env.OPT && env.OPT.reduceMotion)) {
      ctx.save(); ctx.globalAlpha = 1 - pu * pu; text('+1', x0 + (Math.min(20, gi) - 1) * step + bw / 2, y - 4 - 14 * pu, 20 + 6 * (1 - pu), gi >= 15 ? '#ffd84d' : BAR_COL[Math.min(19, gi - 1)], '#0b1020'); ctx.restore();
    }
    // the 20 dim backing bars are static: one baked strip instead of 20 round rects per frame
    const trk = !fspr && kit && kit.bake ? kit.bake('groove-track', 226, 64, c => { c.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 20; i++) { c.beginPath(); if (c.roundRect) c.roundRect(14 - 113 + i * step, 64 - 10 - 8 - i * 0.95 - 32, bw, 8 + i * 0.95, 3); else c.rect(14 - 113 + i * step, 64 - 10 - 8 - i * 0.95 - 32, bw, 8 + i * 0.95); c.fill(); } }) : null;
    if (trk) ctx.drawImage(trk.c, x, y, trk.w, trk.h);
    for (let i = 0; i < 20; i++) {
      const lit = Math.max(0, Math.min(1, gv - i));
      const bob = lit > 0 ? Math.sin(S.t * (fire ? 14 : 8) + i * 0.9) * (fire ? 4 : 2.5) * lit : 0;
      const hh = 8 + i * 0.95 + bob;
      if (!trk && !fspr) { ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(x0 + i * step, base - (8 + i * 0.95), bw, 8 + i * 0.95, 3); ctx.fill(); }
      if (lit > 0) {
        ctx.globalAlpha = 0.45 + 0.55 * lit; ctx.fillStyle = fire ? '#ffd84d' : BAR_COL[i]; rr(x0 + i * step, base - hh, bw, hh, 3); ctx.fill(); ctx.globalAlpha = 1;
        if (ku > 0 && i === gi - 1) { ctx.fillStyle = `rgba(255,255,255,${0.9 * ku})`; rr(x0 + i * step - 1, base - hh - 1, bw + 2, hh + 2, 3); ctx.fill(); }
      }
    }
  }

  // beat streak: consecutive shots landed on the beat (audio.beatStreak), a chip beside the groove meter
  function beatStreak(g) {
    const f = env.OPT && env.OPT.beatStreak, n = typeof f === 'function' ? f() | 0 : 0;
    if (n > T.bsLast) {
      T.bsAt = S.t;
      for (const m of [10, 20, 30]) if (T.bsLast < m && n >= m) { T.msAt = S.t; T.msN = m; if (env.onMilestone) env.onMilestone(m); }
    }
    if (n > T.bsHi) T.bsHi = n;
    if (n < 3) { if (n === 0) T.bsHi = 0; T.bsLast = n; return; }
    T.bsLast = n;
    const ms = Math.floor(n / 10); if (ms > (T.bsMs | 0)) { T.bsMs = ms; T.bsB = S.t; }   // milestone 10 / 20 / 30: ring burst (the sound is audio.js streakburst)
    const bk = T.bsB === undefined ? 0 : Math.max(0, 1 - (S.t - T.bsB) / 0.6);
    const k = Math.max(bk, Math.max(0, 1 - (S.t - T.bsAt) / 0.3)), hot = n >= 10, leg = n >= 30, col = leg ? '#ffffff' : n >= 20 ? '#ff7ad9' : hot ? '#ffd84d' : '#6fe3ff';
    let nSk = 0; for (const id in g.weap) nSk++;
    const LY = skillLayout(nSk), x = 256, y = H - (LY.chipUp ? 132 : 70) - T.ins.b, w = LY.chipUp ? 150 : Math.min(150, Math.max(132, LY.left - 8 - 256)), h = 40;
    scaled(x + w / 2, y + h / 2, 1 + 0.18 * k * k, () => {
      glass(-w / 2, -h / 2, w, h, 20, leg ? 'rgba(255,255,255,.95)' : col + 'cc', leg ? 'rgba(60,24,90,.78)' : 'rgba(14,9,48,.62)');
      if (leg) {   // 06-hud b6: legend frame at 30+, a gold and pink double rim with travelling glints
        const ph = reduce() ? 0 : S.t * 1.4;
        ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd84d'; rr(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 24); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff7ad9'; ctx.globalAlpha = 0.8; rr(-w / 2 - 7.5, -h / 2 - 7.5, w + 15, h + 15, 27); ctx.stroke(); ctx.restore();
        for (let i = 0; i < 2; i++) { const u = (ph + i * 0.5) % 1, gx = -w / 2 + 10 + u * (w - 20); star(gx, -h / 2 - 4, 0.45 + 0.2 * Math.sin(u * Math.PI), '#ffffff'); }
        star(-w / 2 - 6, 0, 0.6, '#ffd84d'); star(w / 2 + 6, 0, 0.6, '#ff7ad9');
      }
      blit(kit && kit.SPR.note(false), -w / 2 + 22, 0, 34, 0);
      text('x' + n, -w / 2 + 44, 1, 24, col, '#0b1020', 'left');
      text('BEAT', w / 2 - 12, 2, 16, '#ffffff', '#0b1020', 'right');
    });
    milestone(x + w / 2, y + h / 2);
  }
  // a streak of 10, 20 or 30 on the beat: rings and stars burst off the chip and a banner rises (still banner when reduced motion)
  function milestone(cx, cy) {
    const k = (S.t - T.msAt) / 1.1;
    if (k < 0 || k >= 1) return;
    const col = T.msN >= 30 ? '#ffffff' : T.msN >= 20 ? '#ff7ad9' : '#ffd84d', e = 1 - (1 - k) * (1 - k), fade = k < 0.7 ? 1 : (1 - k) / 0.3;
    ctx.save();
    if (!reduce()) {
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, 30 + 120 * e, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.6; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 20 + 80 * e, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1 - k * k; const ns = 6 + (T.msN / 10 | 0) * 2;
      for (let i = 0; i < ns; i++) { const a = i / ns * TAU + 0.3, d = 40 + 90 * e; star(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.5 * (1 - k) + 0.2, i % 2 ? col : '#6fe3ff'); }
    }
    ctx.globalAlpha = fade; const rise = reduce() ? 0 : 34 * e, sc = 1 + (reduce() ? 0 : 0.25 * Math.max(0, 1 - k * 5));
    scaled(cx, cy - 46 - rise, sc, () => {
      glass(-118, -20, 236, 40, 20, col + 'dd', 'rgba(14,9,48,.72)');
      text(T.msN >= 30 ? 'BEAT LEGEND  x30' : T.msN >= 20 ? 'BEAT MACHINE  x20' : 'ON THE BEAT  x10', 0, 1, 20, col, '#0b1020');
    });
    ctx.restore();
  }

  // 06-hud b7: a freshly gained skill shows a NEW SKILL tag with its name above the tile for about 1.4 seconds
  function newCaption(id, x, cy, r, col, lift) {
    const age = S.t - T.newAt[id], DUR = 1.5;
    if (age > DUR) { delete T.newAt[id]; return; }
    const inK = reduce() ? 1 : Math.min(1, age / 0.28), back = 1 + 2.2 * Math.pow(inK - 1, 3) + 1.2 * Math.pow(inK - 1, 2), out = Math.max(0, Math.min(1, (DUR - age) / 0.3));
    const pw = 168, ph = 52, cx = Math.max(pw / 2 + 10, Math.min(W - pw / 2 - 10, x)), py = cy - r - 54 - (lift || 0) - (reduce() ? 0 : 8 * Math.min(1, age / 0.5));
    ctx.save(); ctx.globalAlpha = out; ctx.translate(cx, py); ctx.scale(back, back);
    glass(-pw / 2, -ph / 2, pw, ph, 18, col + 'cc', 'rgba(14,9,48,.82)');
    const tx = Math.max(-pw / 2 + 14, Math.min(pw / 2 - 14, x - cx));   // pointer toward the tile
    ctx.beginPath(); ctx.moveTo(tx - 8, ph / 2 - 1); ctx.lineTo(tx + 8, ph / 2 - 1); ctx.lineTo(tx, ph / 2 + 9); ctx.closePath(); ctx.fillStyle = 'rgba(14,9,48,.9)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    text('NEW SKILL', 0, -10, fz(18), '#ffd84d', '#0b1020');
    text(WNAME[id] || id, 0, 12, 16, '#ffffff', '#0b1020');
    ctx.restore();
    if (!reduce() && age < 0.4) sparkleAt(cx + (age * 40 - 20) % 60 - 30, py - 20, 8 * (1 - age / 0.4) + 3);
  }

  // 06-hud b11: the tile disc is memoised on (colour, radius, contrast): no key string per tile per frame
  let TMO = null, BCH = null;
  const tileMemo = () => TMO || (TMO = createTileMemo(kit && kit.bake, (c, col, r, hc) => {   // dark glass disc, a colour wash lit from the top, a gloss arc and a thin coloured rim
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = hc ? 'rgba(6,4,24,.97)' : 'rgba(14,9,48,.78)'; c.fill();
        const rg = c.createRadialGradient(0, -r * 0.5, 2, 0, 0, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.5; c.fillStyle = rg; c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(0, -r * 0.2, r * 0.78, Math.PI * 1.12, Math.PI * 1.88); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 3; c.lineCap = 'round'; c.stroke();
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = hc ? '#ffffff' : col; c.globalAlpha = hc ? 1 : 0.7; c.lineWidth = hc ? 2.5 : 1.5; c.stroke();
  }));
  const HB = () => ({ ctx, text, blit, kit, S, glass, rr, reduce, fz, star, W, H });

  function skills(g) {
    let nSk = 0; for (const id in g.weap) nSk++;
    const LY = skillLayout(nSk), r = LY.r, pitch = LY.pitch, cy = H - 60 - T.ins.b, hc = hcOn() ? 1 : 0;
    let x = SKILL_RIGHT - r, nCap = 0;
    for (const id in g.weap) {
      const w = g.weap[id], col = env.WCOL[id] || '#fff', max = WMAX[id] || 5;
      // remember the longest cooldown seen so the ring can show progress
      const last = T.cdLast[id] === undefined ? 0 : T.cdLast[id];
      if (w.cd > last + 0.01 || !T.cdMax[id]) T.cdMax[id] = Math.max(0.3, w.cd);
      // a long cooldown just finished: flash the tile, and tick once (short cooldowns stay quiet)
      if (last > 0 && w.cd <= 0 && T.cdMax[id] >= 1.2) {
        T.readyAt[id] = S.t;
        if (T.cdMax[id] >= 2.5 && S.t - T.lastSnd > 0.35) { T.lastSnd = S.t; if (env.onReady) env.onReady(id); }
      }
      T.cdLast[id] = w.cd;
      const frac = w.cd > 0 ? Math.max(0, Math.min(1, 1 - w.cd / T.cdMax[id])) : 1, ready = frac >= 0.999;
      // 06-hud b6: a new skill or a level up pops the tile (spring scale, an opening ring) and its numeral badge
      const ll = T.lvLast[id]; if (w.lv > (ll === undefined ? (S.t - T.t0 > 1 ? 0 : w.lv) : ll)) { T.lvAt[id] = S.t; if (!ll && S.t - T.t0 > 1) T.newAt[id] = S.t; } T.lvLast[id] = w.lv;
      const lk = Math.max(0, 1 - (S.t - (T.lvAt[id] === undefined ? -9 : T.lvAt[id])) / 0.7), lsc = lk > 0 && !reduce() ? 1 + 0.32 * Math.sin(lk * Math.PI) * lk : 1;
      ctx.save(); if (lsc !== 1) { ctx.translate(x, cy); ctx.scale(lsc, lsc); ctx.translate(-x, -cy); }
      const tb = tileMemo().get(col, r, hc);
      if (tb) ctx.drawImage(tb.c, x - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8);
      else { ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fillStyle = 'rgba(14,9,48,.62)'; ctx.fill();
        ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, cy, r - 2, 0, TAU); ctx.fill(); ctx.restore(); }
      blit(kit && kit.SPR.weapon(env.WSPR[id] || id), x, cy - 1, 78 * r / 26);
      if (frac < 0.999) { ctx.save(); ctx.beginPath(); ctx.moveTo(x, cy); ctx.arc(x, cy, r - 1, -Math.PI / 2 + TAU * frac, Math.PI * 1.5); ctx.closePath(); ctx.fillStyle = 'rgba(8,5,30,.55)'; ctx.fill(); ctx.restore(); }
      ctx.lineCap = 'round';
      // 06-hud b7: the resting ring (track, or the full ready ring in the skill colour) is one baked blit; only the filling arc is drawn live
      const RS = (r + 6) * 2, rb = kit && kit.bake ? kit.bake('ring07|' + (ready ? col : 'trk') + '|' + r + '|' + hc, RS, RS, c => { c.beginPath(); c.arc(0, 0, r + 1.5, 0, TAU); c.strokeStyle = ready ? col : hc ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.22)'; c.lineWidth = 4; c.stroke(); }) : null;
      if (rb) { ctx.drawImage(rb.c, x - RS / 2, cy - RS / 2, RS, RS); if (!ready && frac > 0.01) { ctx.beginPath(); ctx.arc(x, cy, r + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); } }
      else {
        ctx.beginPath(); ctx.arc(x, cy, r + 1.5, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 4; ctx.stroke();
        if (frac > 0.01) { ctx.beginPath(); ctx.arc(x, cy, r + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.strokeStyle = ready ? col : '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); }
      }
      if (ready) glow(x, cy, r * 2.1, col, 0.18 + 0.1 * Math.sin(S.t * 6 + x));
      ctx.lineCap = 'butt';
      if (w.cd > 0.95 && frac < 0.999) text(Math.ceil(w.cd) + '', x, cy + 1, 24, '#ffffff', '#0b1020');
      else if (w.cd > 0.04 && frac < 0.999 && T.cdMax[id] >= 1.2) {   // 06-hud b8: the last second counts in tenths, the sweep has a bright leading edge and the tile throbs just before it is ready
        text(w.cd.toFixed(1), x, cy + 1, 19, '#ffe9a8', '#0b1020');
        if (!reduce()) glow(x, cy, r * 1.7, col, 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(S.t * 22)));
      }
      if (frac > 0.02 && frac < 0.999) { const ea = -Math.PI / 2 + TAU * frac; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + Math.cos(ea) * (r * 0.4), cy + Math.sin(ea) * (r * 0.4)); ctx.lineTo(x + Math.cos(ea) * (r - 2), cy + Math.sin(ea) * (r - 2)); ctx.stroke(); ctx.restore(); }
      const fk = Math.max(0, 1 - (S.t - (T.readyAt[id] === undefined ? -9 : T.readyAt[id])) / 0.55);
      if (fk > 0) {   // ready flash: white wash, a ring that opens, and a little star
        ctx.save(); ctx.globalAlpha = fk * 0.7; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, cy, r + 1 + (reduce() ? 0 : 4 * fk), 0, TAU); ctx.fill();
        if (!reduce()) { ctx.globalAlpha = fk; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, cy, r + 4 + 20 * (1 - fk), 0, TAU); ctx.stroke(); sparkleAt(x + 14, cy - 18, 10 * fk + 4); }
        ctx.restore();
      }
      // level pips
      const pw = 9, px0 = x - ((max - 1) * pw) / 2, py = cy + r + 10;
      if (w.lv > 0) {   // level numeral badge, top right of the tile (b9: bigger, MAX is a gold pill)
        const maxed = w.lv >= max, bw2 = maxed ? 46 : 28, bx = maxed ? x + 6 : x + r - 1, by = cy - r + 1, bb = kit && kit.bake ? kit.bake('lvb09|' + col + '|' + (maxed ? 1 : 0), bw2 + 8, 36, c => {
          c.beginPath(); if (c.roundRect) c.roundRect(-bw2 / 2, -14, bw2, 28, 14); else c.rect(-bw2 / 2, -14, bw2, 28); c.fillStyle = maxed ? '#ffd84d' : 'rgba(14,9,48,.96)'; c.fill();
          c.lineWidth = 2.5; c.strokeStyle = maxed ? '#fff3a0' : col; c.stroke();
        }) : null;
        if (bb) ctx.drawImage(bb.c, bx - (bw2 + 8) / 2, by - 18, bw2 + 8, 36);
        text(maxed ? 'MAX' : w.lv + '', bx, by + 1, maxed ? 18 : 21, maxed ? '#4a3600' : '#ffffff', maxed ? '#fff3a0' : '#0b1020');
      }
      if (lk > 0 && !reduce()) levelSparkle(HB(), x, cy, r, col, lk);
      if (lk > 0 && !reduce()) { ctx.save(); ctx.globalAlpha = lk * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * lk + 1; ctx.beginPath(); ctx.arc(x, cy, r + 4 + 24 * (1 - lk), 0, TAU); ctx.stroke(); ctx.restore(); }
      const PW = pw * (max - 1) + 14, lvc = Math.min(w.lv, max), pb = kit && kit.bake ? kit.bake('pips07|' + lvc + '|' + max, PW, 12, c => {   // one baked row per level: lit pips white (gold when maxed), empty ones faint
        c.translate(-((max - 1) * pw) / 2, 0);
        c.beginPath(); for (let i = lvc; i < max; i++) { c.moveTo(i * pw + 3.4, 0); c.arc(i * pw, 0, 3.4, 0, TAU); } c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
        if (lvc > 0) { c.beginPath(); for (let i = 0; i < lvc; i++) { c.moveTo(i * pw + 3.4, 0); c.arc(i * pw, 0, 3.4, 0, TAU); } c.fillStyle = lvc >= max ? '#ffd84d' : '#ffffff'; c.fill(); }
      }) : null;
      if (pb) ctx.drawImage(pb.c, x - PW / 2, py - 6, PW, 12);
      else {
        ctx.beginPath(); for (let i = w.lv; i < max; i++) { ctx.moveTo(px0 + i * pw + 3.4, py); ctx.arc(px0 + i * pw, py, 3.4, 0, TAU); } ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
        if (w.lv > 0) { ctx.beginPath(); for (let i = 0; i < w.lv && i < max; i++) { ctx.moveTo(px0 + i * pw + 3.4, py); ctx.arc(px0 + i * pw, py, 3.4, 0, TAU); } ctx.fillStyle = w.lv >= max ? '#ffd84d' : '#ffffff'; ctx.fill(); }
      }
      ctx.restore();
      if (T.newAt[id] !== undefined) newCaption(id, x, cy, r, col, 60 * (nCap++));   // b9: several fresh skills stack their tags instead of printing over each other
      x -= pitch;
    }
  }

  // boss HP-style bar: what is left of the whole serpent (the face has no HP and does not count)
  function bossBar(g) {
    let cur = 0, tot = 0;
    for (const sn of g.snakes) for (const q of sn.segs) if (q.i > 0 && q.hp > 0) { cur += q.hp; tot += q.max || q.hp; }
    if (!T.bossTot) T.bossTot = Math.max(1, tot);
    const v = Math.max(0, Math.min(1, cur / T.bossTot));
    if (v < T.bossV - 0.0005) T.bossHitAt = S.t;
    T.bossV += (v - T.bossV) * 0.25;
    T.bossGhost = Math.max(T.bossV, T.bossGhost - 0.004);   // pale chunk that lingers where the last hit took the bar from
    const x = 26, w = 508, y = 128, h = 18, hit = Math.max(0, 1 - (S.t - T.bossHitAt) / 0.25), low = v > 0 && v < 0.25, lp = low && !reduce() ? 0.5 + 0.5 * Math.sin(S.t * 9) : 0;
    glass(x - 4, y - 4, w + 8, h + 8, (h + 8) / 2, low ? `rgba(255,${70 + Math.round(lp * 60)},${90 + Math.round(lp * 40)},.95)` : 'rgba(255,90,130,.75)', 'rgba(50,6,26,.7)');
    ctx.save(); rr(x, y, w, h, h / 2); ctx.clip();
    const fw = Math.max(h, w * T.bossV), gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#ff3d6e'); gr.addColorStop(1, '#ffb347');
    if (T.bossGhost > T.bossV + 0.004) { ctx.fillStyle = 'rgba(255,235,240,.55)'; ctx.fillRect(x, y, w * T.bossGhost, h); }
    ctx.fillStyle = gr; ctx.fillRect(x, y, v > 0 ? fw : 0, h);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, v > 0 ? fw : 0, h * 0.4);
    if (hit > 0) { ctx.fillStyle = `rgba(255,255,255,${0.55 * hit})`; ctx.fillRect(x, y, fw, h); }
    if (low) { ctx.fillStyle = `rgba(255,255,255,${0.18 * lp})`; ctx.fillRect(x, y, fw, h); }
    if (v > 0.02) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x + fw - 2, y, 2, h); }   // bright leading edge
    ctx.restore();
    // b11: cleaner plate: the name sits in the bar, the percent gets its own pill at the right end (no ticks, no crowded centred text)
    text('SERPENT', x + 14, y + h / 2 + 1, 16, '#ffffff', '#4a0a24', 'left');
    const px = x + w + 10, pw = 92;
    glass(px, y - 4, pw, h + 8, (h + 8) / 2, low ? `rgba(255,${100 + Math.round(lp * 60)},110,.95)` : 'rgba(255,90,130,.75)', 'rgba(50,6,26,.7)');
    text(Math.ceil(T.bossV * 100) + '%', px + pw / 2, y + h / 2 + 1, 18, low ? '#fff3a0' : '#ffffff', '#4a0a24');
  }

  // gold cell countdown: the soonest-to-fade live gold cell, in seconds, with a draining bar
  function goldPill(g, cy) {
    let left = 0;
    for (const sn of g.snakes) for (const q of sn.segs) if (q.gold && q.goldT > 0 && q.hp > 0 && (!left || q.goldT < left)) left = q.goldT;
    if (!left) return;
    const x = 494, w = 150, urgent = left < 3, fr = Math.min(1, left / GOLD_TIME), pul = urgent ? 0.5 + 0.5 * Math.sin(S.t * 14) : 0;
    glass(x, cy - 19, w, 38, 19, urgent ? `rgba(255,${90 + Math.round(pul * 60)},90,.9)` : 'rgba(255,210,74,.75)', urgent ? 'rgba(70,10,20,.7)' : 'rgba(60,40,6,.6)');
    glow(x + 20, cy, 26, '#ffd24a', 0.35 + 0.2 * Math.sin(S.t * 8));
    blit(kit && kit.SPR.pickup('coin'), x + 20, cy - 1, 36);
    text('GOLD', x + 42, cy - 8, 16, urgent ? '#ffb0b0' : '#ffe9a8', '#0b1020', 'left');
    text(left.toFixed(1) + 's', x + w - 12, cy - 5, 20, urgent ? '#ff8a8a' : '#ffd24a', '#0b1020', 'right');
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(x + 42, cy + 7, w - 56, 6, 3); ctx.fill();
    ctx.fillStyle = urgent ? '#ff6a6a' : '#ffd24a'; rr(x + 42, cy + 7, Math.max(6, (w - 56) * fr), 6, 3); ctx.fill();
  }

  // 06-hud b8: a chest opened in the field flies up to the chest chip, the chip pulses, three coins hop to the coin plate and a +N chip
  // reports what the chest paid. Pooled (max 4 in flight): no allocation after the first few chests.
  const FT = 0.6, CHX = 176;
  function reward8start(e, g) {
    const n = B8.raw >= 0 ? Math.max(0, Math.round(g.coins - B8.raw)) : 0;
    if (reduce()) { B8.landAt = S.t; if (n > 0) { B8.gainN = (S.t - B8.gainAt < 1.2 ? B8.gainN : 0) + n; B8.gainAt = S.t; } return; }
    let f = null; for (let i = 0; i < B8.fl.length; i++) if (!B8.fl[i].on) { f = B8.fl[i]; break; }
    if (!f) { if (B8.fl.length >= 4) return; B8.fl.push(f = { on: false, x: 0, y: 0, t0: 0, n: 0 }); }
    f.on = true; f.x = e.x; f.y = e.y; f.t0 = S.t; f.n = n;
  }
  function reward8(g) {
    B8.raw = g.coins;
    const ty = 40 + T.ins.t, lk = Math.max(0, 1 - (S.t - B8.landAt) / 0.5);
    let fly = false; for (let i = 0; i < B8.fl.length; i++) if (B8.fl[i].on) { fly = true; break; }
    if (B8.ch === 0 && (fly || lk > 0)) {   // no chest is riding the snake: show the chip as an opened tally while the reward arrives
      glass(146, ty - 26, 92, 52, 26, 'rgba(255,233,168,.5)'); blit(kit && kit.SPR.pickup('chest'), CHX, ty, 44);
      text('x ' + (g.chestsOpened || 0), 200, ty - 5, 22, '#ffe9a8', '#0b1020', 'left'); text('OPENED', 200, ty + 14, 16, '#ffd0e6', '#0b1020', 'left');
    }
    for (let i = 0; i < B8.fl.length; i++) {
      const f = B8.fl[i]; if (!f.on) continue;
      const u = Math.min(1, (S.t - f.t0) / FT), e = u * u * (3 - 2 * u);
      for (let k = 3; k >= 0; k--) {   // a short comet trail of fading chests
        const uu = Math.max(0, u - k * 0.05), ee = uu * uu * (3 - 2 * uu);
        const px = f.x + (CHX - f.x) * ee, py = f.y + (ty - f.y) * ee - 110 * Math.sin(Math.PI * ee);
        ctx.save(); ctx.globalAlpha = k ? 0.22 : 1; if (!k) glow(px, py, 42, '#ffd84d', 0.5); blit(kit && kit.SPR.pickup('chest'), px, py, (k ? 40 : 54) * (1.25 - 0.45 * ee), k ? 0 : Math.sin(u * 14) * 0.2); ctx.restore();
      }
      if (u >= 1) {
        f.on = false; B8.landAt = S.t; sparkleAt(CHX + 12, ty - 14, 12);
        if (f.n > 0) { B8.gainN = (S.t - B8.gainAt < 1.2 ? B8.gainN : 0) + f.n; B8.gainAt = S.t; }
        if (env.onChestLand) env.onChestLand(f.n);
      }
    }
    if (lk > 0) {   // the chip is hit: a ring and a glow
      glow(CHX, ty, 40 + 20 * lk, '#ffd84d', 0.45 * lk);
      ctx.save(); ctx.globalAlpha = lk; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(CHX, ty, 16 + 26 * (1 - lk), 0, TAU); ctx.stroke(); ctx.restore();
    }
    const sinceL = S.t - B8.landAt;
    if (sinceL < 0.8 && !reduce() && B8.gainN > 0) for (let i = 0; i < 3; i++) {   // three coins hop from the chip to the coin plate
      const v = (sinceL - i * 0.08) / 0.4; if (v <= 0 || v >= 1) continue;
      const ev = v * v * (3 - 2 * v), px = CHX + (514 - CHX) * ev, py = ty - 38 * Math.sin(Math.PI * ev);
      blit(kit && kit.SPR.pickup('coin'), px, py, 30);
    }
    const gs = S.t - B8.gainAt;
    if (B8.gainN > 0 && gs < 1.7) {   // +N chip under the coin plate: pops in, hangs, fades
      const a = gs > 1.3 ? Math.max(0, 1 - (gs - 1.3) / 0.4) : 1, pk = Math.max(0, 1 - gs / 0.25), sc = 1 + 0.35 * pk;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(556, ty + 37); ctx.scale(sc, sc);
      glass(-40, -9, 80, 18, 9, 'rgba(255,210,74,.85)', 'rgba(60,40,6,.82)');
      text('+' + B8.gainN, 0, 1, 16, '#ffe36b', '#0b1020');
      ctx.restore();
    }
  }

  // Encore meter by the duo: capsule with quarter marks, brightens and calls for a tap when full
  function encore(g) {
    const e = Math.max(0, Math.min(1, g.encore || 0));
    if (g.phase !== 'play' || e <= 0) { T.encV = 0; return; }
    T.encV += (e - T.encV) * 0.3;
    if (e > B8.encPrev + 0.004 && S.t - B8.encGainAt > 0.12) B8.encGainAt = S.t;
    B8.encPrev = e;
    const full = e >= 1;
    if (full && T.encFull < 0) T.encFull = S.t; else if (!full) T.encFull = -9;
    const k = full ? Math.max(0, 1 - (S.t - T.encFull) / 0.5) : 0, pul = 0.5 + 0.5 * Math.sin(S.t * 10);
    const w = 196, h = 24, ex = 18 + 30 + w / 2, ey = H - 124 - T.ins.b;   // docked above the groove meter
    if (full) {   // ring around the tap zone and a glow under the capsule
      glow(g.p.x, g.p.y, 130 + 30 * k, '#ffe36b', 0.16 + 0.08 * pul);
      ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * pul; ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 4; ctx.setLineDash([16, 12]); ctx.lineDashOffset = -S.t * 50;
      ctx.beginPath(); ctx.arc(g.p.x, g.p.y, 96, 0, TAU); ctx.stroke(); ctx.restore();
    }
    glass(ex - w / 2 - 3, ey - 3, w + 6, h + 6, (h + 6) / 2, full ? 'rgba(255,227,107,.95)' : 'rgba(255,154,214,.7)', 'rgba(14,9,48,.7)');
    ctx.save(); rr(ex - w / 2, ey, w, h, h / 2); ctx.clip();
    const fw = Math.max(h * 0.6, w * T.encV);
    const fb = kit && kit.bake ? kit.bake('encfill08|' + (full ? 1 : 0), w, h, c => {   // 06-hud b8: the gradient is baked once (a live gradient per frame was the only one left in the meter)
      const gr = c.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, full ? '#ffd84d' : '#ff7eb6'); gr.addColorStop(1, full ? '#fff3a0' : '#ffc2dc'); c.fillStyle = gr; c.fillRect(-w / 2, -h / 2, w, h);
    }) : null;
    if (fb) { ctx.save(); ctx.beginPath(); ctx.rect(ex - w / 2, ey, fw, h); ctx.clip(); ctx.drawImage(fb.c, ex - w / 2, ey, w, h); ctx.restore(); }
    else { ctx.fillStyle = full ? '#ffe36b' : '#ff9ad6'; ctx.fillRect(ex - w / 2, ey, fw, h); }
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(ex - w / 2, ey, w * T.encV, h * 0.4);
    for (let i = 1; i < 4; i++) { ctx.fillStyle = T.encV >= i / 4 ? 'rgba(255,255,255,.7)' : 'rgba(11,16,32,.45)'; ctx.fillRect(ex - w / 2 + (w * i) / 4 - 1, ey, 2, h); }   // a quarter mark lights once the fill passes it
    { const gk = Math.max(0, 1 - (S.t - B8.encGainAt) / 0.35); if (gk > 0 && !full) { ctx.fillStyle = `rgba(255,255,255,${0.35 * gk})`; ctx.fillRect(ex - w / 2, ey, fw, h); } }   // the fill flashes on every gain
    if (full) { ctx.fillStyle = `rgba(255,255,255,${0.5 * k + 0.12 * pul})`; ctx.fillRect(ex - w / 2, ey, w, h); }
    ctx.restore();
    if (!full && T.encV > 0.02) { const gk = Math.max(0, 1 - (S.t - B8.encGainAt) / 0.35); glow(ex - w / 2 + fw, ey + h / 2, 16 + 14 * gk, '#ffffff', 0.25 + 0.4 * gk); if (gk > 0.4 && !reduce()) sparkleAt(ex - w / 2 + fw, ey + h / 2 - 8, 8 * gk + 2); }   // a bright cap rides the fill edge
    star(ex - w / 2 - 10, ey + h / 2, 1.15 + 0.25 * k, full ? '#ffe36b' : '#ff9ad6');
    if (full) {
      ctx.save(); const sc = 1 + 0.08 * pul + 0.3 * k; ctx.translate(Math.max(110, Math.min(W - 110, g.p.x)), g.p.y - 118); ctx.scale(sc, sc); text('TAP THE DUO!', 0, 0, 20, '#ffe36b', '#0b1020'); ctx.restore();
      text('ENCORE READY', ex, ey + h / 2 + 1, 16, '#4a3600', '#fff3a0');
    } else { text('ENCORE', ex, ey + h / 2 + 1, 16, '#ffffff', '#4a1038'); text(Math.floor(T.encV * 100) + '%', ex + w / 2 + 12, ey + h / 2 + 1, 16, '#ffc2dc', '#0b1020', 'left'); }
  }

  function combo(g) {
    if (!(g.combo > 2 && g.t - g.lastKill < 2.2)) return;
    const y = 183 + T.ins.t + (isBossStage(g.stage) ? BOSS_DY : 0) + 24, sc = pop('combo', g.combo), left = Math.max(0, Math.min(1, 1 - (g.t - g.lastKill) / 2.2));
    const col = g.combo >= 20 ? '#ff7ad9' : g.combo >= 10 ? '#ff9a4a' : '#ffe14a', n = g.combo >= 20 ? 3 : g.combo >= 10 ? 2 : 1;
    ctx.save(); ctx.globalAlpha = left < 0.25 ? 0.4 + left * 2.4 : 1;
    const hp = reduce() ? 0 : Math.max(0, 1 - (S.t - (S.hitPulse || -9)) / 0.16);   // 04-hit-juice b11: every landed hit makes the plate tick and the timer flash
    scaled(W / 2, y, sc * (1 + 0.045 * hp), () => {
      glass(-112, -26, 224, 52, 26, col + 'aa', 'rgba(14,9,48,.5)');
      text('COMBO x' + g.combo, 0, -4, 24 + Math.min(10, g.combo * 0.3), col, '#0b1020');
      ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(-84, 14, 168, 7, 3.5); ctx.fill();
      ctx.fillStyle = left < 0.3 && !reduce() && Math.sin(S.t * 24) > 0 ? '#ff6a7a' : col; rr(-84, 14, Math.max(5, 168 * left), 7, 3.5); ctx.fill();   // b9: a thicker timer that flashes red when the combo is about to drop
      if (hp > 0) { ctx.fillStyle = `rgba(255,255,255,${0.75 * hp})`; rr(-84, 14, Math.max(5, 168 * left), 7, 3.5); ctx.fill(); glow(-84 + Math.max(5, 168 * left), 17.5, 16 + 10 * hp, '#ffffff', 0.55 * hp); }
      const tn = comboTier(g.combo);
      if (tn) {   // 06-hud b10: a small tier tag riding the top rim of the plate (NICE, GROOVY, SUPER, MEGA); it hops when the tier changes
        const tk = pop('ctier', g.combo >= 40 ? 4 : g.combo >= 20 ? 3 : g.combo >= 10 ? 2 : 1), tw = tn.length * 11 + 26;
        scaled(0, -27, reduce() ? 1 : 1 + (tk - 1) * 0.6, () => {
          glass(-tw / 2, -12, tw, 24, 12, hcOn() ? '#ffffff' : col, hcOn() ? 'rgba(6,4,24,.97)' : 'rgba(14,9,48,.88)');
          text(tn, 0, 1, 16, col, '#0b1020');
        });
      }
      for (let i = 1; i < n; i++) for (const sg of [-1, 1]) star(sg * (112 + 4 + i * 20), 0, 0.55 + 0.1 * i, col);
    });
    ctx.restore();
  }

  // 06-hud b5: soft dark bands behind the top rows and the bottom row so white text stays readable on pale or busy worlds
  function scrim() {
    const tb = kit && kit.bake ? kit.bake('scrim06|top', W, 210, c => { const gr = c.createLinearGradient(0, -105, 0, 105); gr.addColorStop(0, 'rgba(8,4,30,.42)'); gr.addColorStop(0.6, 'rgba(8,4,30,.18)'); gr.addColorStop(1, 'rgba(8,4,30,0)'); c.fillStyle = gr; c.fillRect(-W / 2, -105, W, 210); }) : null;
    const bb = kit && kit.bake ? kit.bake('scrim06|bot', W, 190, c => { const gr = c.createLinearGradient(0, -95, 0, 95); gr.addColorStop(0, 'rgba(8,4,30,0)'); gr.addColorStop(0.5, 'rgba(8,4,30,.22)'); gr.addColorStop(1, 'rgba(8,4,30,.4)'); c.fillStyle = gr; c.fillRect(-W / 2, -95, W, 190); }) : null;
    if (tb) ctx.drawImage(tb.c, 0, 0, W, 210);
    if (bb) ctx.drawImage(bb.c, 0, H - 190 - T.ins.b, W, 190);
  }

  // y offset that everything below the HUD rows should add (notch plus the boss bar)
  function dy(g) { return T.ins.t + (g && isBossStage(g.stage) ? BOSS_DY : 0); }

  function draw(g, L) {
    if (T.g !== g) { T.g = g; T.pop = {}; T.cdMax = {}; T.cdLast = {}; T.chestAt = {}; T.lastProg = g.progress || 0; T.gv = g.progress || 0; T.bsLast = 0; T.bsAt = -9; T.bsHi = 0; T.readyAt = {}; T.bossTot = 0; T.bossV = 1; T.encV = 0; T.encFull = -9; T.lvLast = {}; T.lvAt = {}; T.t0 = S.t; T.bossGhost = 1; T.newAt = {}; T.coinV = -1; T.coinPrev = -1; T.coinAt = -9; T.flashAt = -9; B8.fl.length = 0; B8.landAt = -9; B8.gainAt = -9; B8.raw = g.coins; B8.encPrev = g.encore || 0; B8.encGainAt = -9; }
    T.ins = safeUnits(L);
    const boss = isBossStage(g.stage);
    scrim();
    ctx.save(); ctx.translate(0, T.ins.t);
    top(g); progress(g); if (boss) bossBar(g); stats(g);
    goldPill(g, 146 + (boss ? BOSS_DY : 0));
    ctx.restore();
    reward8(g);
    groove(g); beatStreak(g); skills(g);
    const p = g.p, b = T.ins.b;
    S.chipB = b;   // hitjuice: where the power-up icons fly to
    (BCH || (BCH = createBuffChips(HB()))).draw(g, b, landBounce);   // b11: Shield, Rage and Snack chips with a draining timer bar
  }
  return { press: id => { T.pressAt[id] = S.t; }, reward: (e, g) => reward8start(e, g), draw, encore, combo, dy, top: () => T.ins.t };
}
