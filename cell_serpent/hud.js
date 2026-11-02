// In-run HUD (canvas, 720x1280 game units). Glass chips, a title plate, a progress bar with
// chest markers, an equalizer groove meter and round skill tiles with cooldown rings.
// The renderer hands in its helpers; this file never touches the sim state.
import { landBounce } from './hitjuice.js';
import { W, H, WEAPONS, uv, isBossStage, virusName, GOLD_TIME } from './sim.js';

const TAU = Math.PI * 2;
const WMAX = Object.fromEntries(WEAPONS.map(w => [w.id, w.max]));
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
const BOSS_DY = 24;   // the boss HP bar pushes the stat row down

export function createHud(env) {
  const { ctx, text, blit, kit, S, INK, glow, sparkleAt } = env;
  const T = { g: null, pop: {}, cdMax: {}, cdLast: {}, chestAt: {}, lastProg: 0, readyAt: {}, lastSnd: -9, bossTot: 0, bossV: 1, bossHitAt: -9, encV: 0, encFull: -9, ins: { t: 0, b: 0 } };
  const reduce = () => !!(env.OPT && env.OPT.reduceMotion);
  // menu text size slider also lifts the small in-run labels (capped so the fixed glass plates still fit)
  const fz = n => Math.round(n * Math.min(1.3, (env.OPT && env.OPT.textScale) || 1));
  const bigT = () => ((env.OPT && env.OPT.textScale) || 1) > 1.1;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  // frosted glass: dark tint, hairline rim and a soft top gloss
  function glassPaint(c, x, y, w, h, r, rim, tint) {
    const path = () => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    path(); c.fillStyle = tint; c.fill();
    c.save(); path(); c.clip(); c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(x, y, w, h * 0.45); c.restore();
    path(); c.strokeStyle = rim; c.lineWidth = 2; c.stroke();
  }
  // panels are static, so each size/colour is baked once and blitted (a clip + 3 paths per panel per frame otherwise)
  function glass(x, y, w, h, r, rim = 'rgba(255,255,255,.32)', tint = 'rgba(14,9,48,.52)') {
    const spr = kit && kit.bake ? kit.bake(`glass|${w}|${h}|${r}|${rim}|${tint}`, w + 8, h + 8, c => glassPaint(c, -w / 2, -h / 2, w, h, r, rim, tint)) : null;
    if (spr) ctx.drawImage(spr.c, x - 4, y - 4, w + 8, h + 8); else glassPaint(ctx, x, y, w, h, r, rim, tint);
  }
  function glassCircle(x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = 'rgba(14,9,48,.52)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r * 0.28, r * 0.72, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
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
    glass(16, 14, 124, 52, 26, 'rgba(255,216,77,.55)');
    ctx.beginPath(); ctx.arc(42, cy, 17, 0, TAU); ctx.fillStyle = '#ffd84d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    sparkleAt(42, cy, 13);
    const su = Math.max(pop('up', uvl), landBounce(S, 'up')); scaled(66, cy + 2, su, () => text('x ' + uvl, 0, 0, 26, '#ffd84d', '#0b1020', 'left'));
    // chests carried by the snake
    let ch = 0; for (const sn of g.snakes) for (const q of sn.segs) if (q.carry === 'chest' && q.hp > 0) ch++;
    if (ch) {
      glass(146, 14, 92, 52, 26, 'rgba(255,233,168,.5)');
      blit(kit && kit.SPR.pickup('chest'), 176, cy, 44);
      const sc = pop('chest', ch); scaled(200, cy + 2, sc, () => text('x ' + ch, 0, 0, 22, '#ffe9a8', '#0b1020', 'left'));
    }
    // title plate
    const px = W / 2 - 110, rim = boss ? 'rgba(255,90,130,.8)' : 'rgba(255,255,255,.4)';
    glass(px, 8, 220, 68, 22, rim, boss ? 'rgba(70,8,36,.58)' : 'rgba(14,9,48,.56)');
    text(boss ? 'BOSS ' + g.stage : 'STAGE ' + g.stage, W / 2, 30, 28, boss ? '#ff7a9a' : '#ffffff');
    const nm = g.mode === 'pig' ? 'Piggy Bank Parade' : virusName(g.stage), fs = nm.length > 15 ? 14 : fz(17);
    text(nm, W / 2, 58, fs, '#ffd0e6');
    if (g.hard) { glass(px + 168, -2, 66, 26, 13, 'rgba(201,160,255,.8)', 'rgba(60,20,110,.85)'); text('HARD', px + 201, 11, fz(14), '#e2caff', '#0b1020'); }
    // coins, bouncing when they grow
    const coins = Math.floor(g.coins), sc = Math.max(pop('coin', coins), landBounce(S, 'coin'));
    glass(484, 14, 142, 52, 26, 'rgba(255,210,74,.55)');
    scaled(514, cy, sc, () => blit(kit && kit.SPR.pickup('coin'), 0, 0, 52));
    scaled(542, cy + 2, sc, () => text(String(coins), 0, 0, 26, '#ffd24a', '#0b1020', 'left'));
    // pause and stats: round glass buttons (hit zones live in main.js at the same spots)
    const bx = W - 38;
    glassCircle(bx, cy, 26); ctx.fillStyle = '#fff';
    rr(bx - 11, cy - 11, 7, 22, 3); ctx.fill(); rr(bx + 4, cy - 11, 7, 22, 3); ctx.fill();
    glassCircle(bx, 112, 26); ctx.fillStyle = '#fff';
    for (const [i, hgt] of [[0, 12], [1, 20], [2, 28]]) { rr(bx - 15 + i * 11, 112 + 14 - hgt, 8, hgt, 3); ctx.fill(); }
  }

  function progress(g) {
    const boss = isBossStage(g.stage), pr = Math.max(0, Math.min(1, g.progress || 0));
    const bx = 26, bw = 574, by = 90, bh = 24, cy = by + bh / 2;
    // light each chest the moment its mark is crossed
    if (pr < T.lastProg) T.chestAt = {};
    for (const th of [0.25, 0.5, 1]) if (pr >= th - 1e-6 && T.lastProg < th - 1e-6) T.chestAt[th] = S.t;
    T.lastProg = pr;
    glass(bx - 4, by - 4, bw + 8, bh + 8, (bh + 8) / 2, 'rgba(255,255,255,.4)', 'rgba(8,5,30,.62)');
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
      if (pr < 1) {   // glowing tip at the front of the fill
        const tx = bx + Math.max(bh, bw * pr) - 2;
        glow(tx, cy, 20, boss ? '#ff8a8a' : '#ffc2dc', 0.35 + (reduce() ? 0 : 0.15 * Math.sin(S.t * 6)));
        ctx.beginPath(); ctx.arc(tx, cy, 5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    text(Math.floor(pr * 100) + '%', bx + 30, cy + 1, 17, '#ffffff', '#5a1038', 'center');
    for (const th of [0.25, 0.5, 1]) {
      const x = bx + bw * th, done = pr >= th - 1e-6, big = th === 1, size = big ? 54 : 40;
      const since = S.t - (T.chestAt[th] === undefined ? -9 : T.chestAt[th]), k = Math.max(0, 1 - since / 0.7);
      if (!big) { ctx.fillStyle = done ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)'; ctx.fillRect(x - 1.5, by - 2, 3, bh + 4); }
      if (done) glow(x, cy, size * (1.0 + 0.5 * k), '#ffd84d', 0.55 + 0.3 * Math.sin(S.t * 5));
      ctx.save();
      if (!done) ctx.globalAlpha = 0.5;
      scaled(x, cy - (done ? 3 * Math.abs(Math.sin(S.t * 3)) : 0), 1 + 0.5 * k * k, () => blit(kit && kit.SPR.pickup('chest'), 0, 0, size));
      ctx.restore();
      if (k > 0) { ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, cy, size * (0.4 + 0.8 * (1 - k)), 0, TAU); ctx.stroke(); ctx.restore(); }
    }
  }

  // speed + the capsule stats as small icons
  function stats(g) {
    const sn = g.snakes[0], mult = sn ? (sn.surge === 'go' ? 2.6 : sn.slow > 0 ? 0.6 : 1) : 1, cy = 146 + (isBossStage(g.stage) ? BOSS_DY : 0), up = id => Math.round(uv(g, id));
    const hot = mult > 1, col = hot ? '#ff8a8a' : mult < 1 ? '#8ff0ff' : '#d9f7e6';
    glass(24, cy - 17, 120, 34, 17, hot ? 'rgba(255,100,100,.7)' : 'rgba(255,255,255,.3)');
    blit(kit && kit.SPR.body(g.skin, false, ''), 46, cy, 40, 0);
    text('x' + mult.toFixed(1), 100, cy + 1, fz(19), col, '#0b1020');
    const items = [['n', '' + (1 + up('notes'))], ['b', '' + (1 + up('burst'))], ['s', '+' + up('aspd') + '%'], ['d', '+' + up('cdmg') + '%']];
    const wid = [66, 66, 92, 92];
    let x = 154;
    glass(x - 6, cy - 17, wid[0] + wid[1] + wid[2] + wid[3] + 6, 34, 17);
    items.forEach(([k, v], i) => {
      const ix = x + 14;
      if (k === 'n') blit(kit && kit.SPR.note(false), ix, cy, 36, 0); else if (k === 'b') burstIcon(ix, cy, 0.85); else if (k === 's') bolt(ix, cy, 0.95, '#6fe3ff'); else star(ix, cy, 0.85, '#ffd84d');
      text(v, ix + 20, cy + 1, fz(17), '#e6f6ff', '#0b1020', 'left');
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
    glass(x, y, w, h, 18, kd > 0 ? 'rgba(255,90,110,.95)' : ku > 0 ? 'rgba(255,255,255,.95)' : rim);
    if (kd > 0) { ctx.save(); ctx.globalAlpha = 0.3 * kd; rr(x, y, w, h, 18); ctx.fillStyle = '#ff3d5a'; ctx.fill(); ctx.restore(); }
    if (fire) glow(x + w / 2, y + h / 2, 150, '#ffd84d', 0.18 + 0.1 * Math.sin(S.t * 10));
    text(fire ? (bigT() ? 'ON FIRE' : 'GROOVE ON FIRE') : 'GROOVE', x + 14, y + 14, fz(15), fire ? '#ffd84d' : '#ffc2dc', '#0b1020', 'left');
    if (gv >= 1) text('+' + Math.floor(gv * 1.5) + '% dmg', x + w - 12, y + 14, fz(14), gv >= 15 ? '#ffd84d' : '#bfe9ff', '#0b1020', 'right');
    const base = y + h - 10, bw = 7.2, step = 10.4, x0 = x + 14;
    // tier ticks: bar 15 starts the gold glow, bar 20 is the fire
    for (const t of [15, 20]) { const tx = x0 + (t - 1) * step + bw / 2; ctx.fillStyle = gv >= t ? '#ffd84d' : 'rgba(255,216,77,.45)'; ctx.beginPath(); ctx.moveTo(tx - 3.5, y + h - 3); ctx.lineTo(tx + 3.5, y + h - 3); ctx.lineTo(tx, y + h - 8.5); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 20; i++) {
      const lit = Math.max(0, Math.min(1, gv - i));
      const bob = lit > 0 ? Math.sin(S.t * (fire ? 14 : 8) + i * 0.9) * (fire ? 4 : 2.5) * lit : 0;
      const hh = 8 + i * 0.95 + bob;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(x0 + i * step, base - (8 + i * 0.95), bw, 8 + i * 0.95, 3); ctx.fill();
      if (lit > 0) {
        ctx.globalAlpha = 0.45 + 0.55 * lit; ctx.fillStyle = fire ? '#ffd84d' : BAR_COL[i]; rr(x0 + i * step, base - hh, bw, hh, 3); ctx.fill(); ctx.globalAlpha = 1;
        if (ku > 0 && i === gi - 1) { ctx.fillStyle = `rgba(255,255,255,${0.9 * ku})`; rr(x0 + i * step - 1, base - hh - 1, bw + 2, hh + 2, 3); ctx.fill(); }
      }
    }
  }

  function skills(g) {
    const r = 25, pitch = 58, cy = H - 60 - T.ins.b;
    let x = W - 22 - r;
    for (const id of Object.keys(g.weap)) {
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
      ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fillStyle = 'rgba(14,9,48,.62)'; ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, cy, r - 2, 0, TAU); ctx.fill(); ctx.restore();
      blit(kit && kit.SPR.weapon(env.WSPR[id] || id), x, cy - 1, 78);
      if (frac < 0.999) { ctx.save(); ctx.beginPath(); ctx.moveTo(x, cy); ctx.arc(x, cy, r - 1, -Math.PI / 2 + TAU * frac, Math.PI * 1.5); ctx.closePath(); ctx.fillStyle = 'rgba(8,5,30,.55)'; ctx.fill(); ctx.restore(); }
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, cy, r + 1.5, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 4; ctx.stroke();
      if (frac > 0.01) { ctx.beginPath(); ctx.arc(x, cy, r + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.strokeStyle = ready ? col : '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); }
      if (ready) glow(x, cy, r * 2.1, col, 0.18 + 0.1 * Math.sin(S.t * 6 + x));
      ctx.lineCap = 'butt';
      if (w.cd > 0.95 && frac < 0.999) text(Math.ceil(w.cd) + '', x, cy + 1, 22, '#ffffff', '#0b1020');
      const fk = Math.max(0, 1 - (S.t - (T.readyAt[id] === undefined ? -9 : T.readyAt[id])) / 0.55);
      if (fk > 0) {   // ready flash: white wash, a ring that opens, and a little star
        ctx.save(); ctx.globalAlpha = fk * 0.7; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, cy, r + 1 + (reduce() ? 0 : 4 * fk), 0, TAU); ctx.fill();
        if (!reduce()) { ctx.globalAlpha = fk; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, cy, r + 4 + 20 * (1 - fk), 0, TAU); ctx.stroke(); sparkleAt(x + 14, cy - 18, 10 * fk + 4); }
        ctx.restore();
      }
      // level pips
      const pw = 7, px0 = x - ((max - 1) * pw) / 2, py = cy + r + 10;
      for (let i = 0; i < max; i++) { ctx.beginPath(); ctx.arc(px0 + i * pw, py, 2.6, 0, TAU); ctx.fillStyle = i < w.lv ? (w.lv >= max ? '#ffd84d' : '#ffffff') : 'rgba(255,255,255,.22)'; ctx.fill(); }
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
    const x = 26, w = 574, y = 128, h = 16, hit = Math.max(0, 1 - (S.t - T.bossHitAt) / 0.25);
    glass(x - 4, y - 4, w + 8, h + 8, (h + 8) / 2, 'rgba(255,90,130,.75)', 'rgba(50,6,26,.7)');
    ctx.save(); rr(x, y, w, h, h / 2); ctx.clip();
    const fw = Math.max(h, w * T.bossV), gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#ff3d6e'); gr.addColorStop(1, '#ffb347');
    ctx.fillStyle = gr; ctx.fillRect(x, y, v > 0 ? fw : 0, h);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, v > 0 ? fw : 0, h * 0.4);
    if (hit > 0) { ctx.fillStyle = `rgba(255,255,255,${0.55 * hit})`; ctx.fillRect(x, y, fw, h); }
    ctx.restore();
    text('SERPENT ' + Math.ceil(T.bossV * 100) + '%', x + w / 2, y + h / 2 + 1, 13, '#ffffff', '#4a0a24');
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
    text('GOLD', x + 42, cy - 8, 12, urgent ? '#ffb0b0' : '#ffe9a8', '#0b1020', 'left');
    text(left.toFixed(1) + 's', x + w - 12, cy - 5, 20, urgent ? '#ff8a8a' : '#ffd24a', '#0b1020', 'right');
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(x + 42, cy + 7, w - 56, 6, 3); ctx.fill();
    ctx.fillStyle = urgent ? '#ff6a6a' : '#ffd24a'; rr(x + 42, cy + 7, Math.max(6, (w - 56) * fr), 6, 3); ctx.fill();
  }

  // Encore meter by the duo: capsule with quarter marks, brightens and calls for a tap when full
  function encore(g) {
    const e = Math.max(0, Math.min(1, g.encore || 0));
    if (g.phase !== 'play' || e <= 0) { T.encV = 0; return; }
    T.encV += (e - T.encV) * 0.3;
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
    const gr = ctx.createLinearGradient(ex - w / 2, 0, ex + w / 2, 0); gr.addColorStop(0, full ? '#ffd84d' : '#ff7eb6'); gr.addColorStop(1, full ? '#fff3a0' : '#ffc2dc');
    ctx.fillStyle = gr; ctx.fillRect(ex - w / 2, ey, Math.max(h * 0.6, w * T.encV), h);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(ex - w / 2, ey, w * T.encV, h * 0.4);
    ctx.fillStyle = 'rgba(11,16,32,.45)'; for (let i = 1; i < 4; i++) ctx.fillRect(ex - w / 2 + (w * i) / 4 - 1, ey, 2, h);
    if (full) { ctx.fillStyle = `rgba(255,255,255,${0.5 * k + 0.12 * pul})`; ctx.fillRect(ex - w / 2, ey, w, h); }
    ctx.restore();
    star(ex - w / 2 - 10, ey + h / 2, 1.15 + 0.25 * k, full ? '#ffe36b' : '#ff9ad6');
    if (full) {
      ctx.save(); const sc = 1 + 0.08 * pul + 0.3 * k; ctx.translate(Math.max(110, Math.min(W - 110, g.p.x)), g.p.y - 118); ctx.scale(sc, sc); text('TAP THE DUO!', 0, 0, 20, '#ffe36b', '#0b1020'); ctx.restore();
      text('ENCORE READY', ex, ey + h / 2 + 1, 15, '#4a3600', '#fff3a0');
    } else { text('ENCORE', ex, ey + h / 2 + 1, 15, '#ffffff', '#4a1038'); text(Math.floor(T.encV * 100) + '%', ex + w / 2 + 12, ey + h / 2 + 1, 13, '#ffc2dc', '#0b1020', 'left'); }
  }

  function combo(g) {
    if (!(g.combo > 2 && g.t - g.lastKill < 2.2)) return;
    const y = 183 + T.ins.t + (isBossStage(g.stage) ? BOSS_DY : 0) + 24, sc = pop('combo', g.combo), left = Math.max(0, Math.min(1, 1 - (g.t - g.lastKill) / 2.2));
    const col = g.combo >= 20 ? '#ff7ad9' : g.combo >= 10 ? '#ff9a4a' : '#ffe14a', n = g.combo >= 20 ? 3 : g.combo >= 10 ? 2 : 1;
    ctx.save(); ctx.globalAlpha = left < 0.25 ? 0.4 + left * 2.4 : 1;
    scaled(W / 2, y, sc, () => {
      glass(-112, -26, 224, 52, 26, col + 'aa', 'rgba(14,9,48,.5)');
      text('COMBO x' + g.combo, 0, -4, 24 + Math.min(10, g.combo * 0.3), col, '#0b1020');
      ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(-84, 15, 168, 5, 2.5); ctx.fill();
      ctx.fillStyle = col; rr(-84, 15, Math.max(5, 168 * left), 5, 2.5); ctx.fill();
      for (let i = 1; i < n; i++) for (const sg of [-1, 1]) star(sg * (112 + 4 + i * 20), 0, 0.55 + 0.1 * i, col);
    });
    ctx.restore();
  }

  // y offset that everything below the HUD rows should add (notch plus the boss bar)
  function dy(g) { return T.ins.t + (g && isBossStage(g.stage) ? BOSS_DY : 0); }

  function draw(g, L) {
    if (T.g !== g) { T.g = g; T.pop = {}; T.cdMax = {}; T.cdLast = {}; T.chestAt = {}; T.lastProg = g.progress || 0; T.readyAt = {}; T.bossTot = 0; T.bossV = 1; T.encV = 0; T.encFull = -9; }
    T.ins = safeUnits(L);
    const boss = isBossStage(g.stage);
    ctx.save(); ctx.translate(0, T.ins.t);
    top(g); progress(g); if (boss) bossBar(g); stats(g);
    goldPill(g, 146 + (boss ? BOSS_DY : 0));
    ctx.restore();
    groove(g); skills(g);
    const p = g.p, b = T.ins.b;
    if (p.shield > 0) { glass(W - 180, H - 130 - b, 160, 34, 17, 'rgba(127,232,255,.7)'); text('SHIELD ' + p.shield.toFixed(0), W - 100, H - 112 - b, fz(18), '#7fe8ff'); }
    if (p.rage > 0) { glass(W - 180, H - 170 - b, 160, 34, 17, 'rgba(255,210,74,.7)'); text('RAGE ' + p.rage.toFixed(0), W - 100, H - 152 - b, fz(18), '#ffd24a'); }
  }
  return { draw, encore, combo, dy, top: () => T.ins.t };
}
