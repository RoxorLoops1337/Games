// Pause menu (app.push('pause')) plus the GLOBAL in-run overlay (Pause + Fullscreen buttons, Esc to pause).
// Pausing sets app.timeScale = 0 (logical timers and screen update dt freeze) and restores it on leave.
// The pause UI animates from app.rawDt (unscaled) so it still moves; tweens owned by screens stacked above it are stepped too.
// Esc contract: a run screen that is busy with its own Esc (dragging, modal, selection) sets `app.escBusy = true`
// during its update/draw; the overlay clears it at the end of every frame. Only the single-screen state (stack length 1) pauses.
import { COL, W, H, EASE, clamp } from './core.js';
import { canFullscreen, isFullscreen, isIPhone, fsButton, fsRegisterRect, requestFs, toggleFullscreen } from './fullscreen.js';
import { saveRun } from '../engine/save.js';
import { lnw } from '../art/linework.js';

export const IN_RUN = new Set(['map', 'combat', 'reward', 'graft', 'shop', 'forge', 'event']);
export const PAUSE_BTN = { x: 1136, y: 9, w: 44, h: 38 };
export const FS_BTN = { x: 1188, y: 9, w: 44, h: 38 };
// Chrome buttons stay inside the safe corner (notch, home bar, cropped strip): shifted by app.safe, unchanged when it is zero.
function chromeRect(app, B) { const sf = app.safe || { t: 0, r: 0 }; return { x: B.x - Math.max(0, sf.r - 48), y: Math.max(B.y, sf.t + 4), w: B.w, h: B.h }; }
const BRASS = '#b08d3c';

const calm = (app) => !!(app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion);
const sc = (app) => Math.min(1.2, app.textScale || 1);
// text that scales with the user's text size but stays inside the fixed panels
const T = (app, str, x, y, o = {}) => app.text(str, x, y, { ...o, size: Math.round((o.size || 16) * sc(app)), fixed: true });

export const CONTROLS = [
  ['MOUSE', [
    'Click a card to select it. Click it again, or click an enemy, to play it.',
    'Drag a card up past the play line and release to play it. Drop it low to cancel.',
    'Right click cancels a selection. Hover any icon, status or intent for its tip.',
    'The wheel scrolls lists.']],
  ['KEYBOARD', [
    '1 to 9, 0: pick that card in your hand. Press again to play it.',
    'Left / Right: step through the hand. Tab: change the target.',
    'Enter or Space: play the selected card, or end the turn.',
    'Q: draw, discard and exhaust piles.',
    'Esc: cancel, or open this menu. F: fullscreen.',
    'In menus: Up / Down / Tab move, Enter picks, Esc goes back.']],
  ['TOUCH', [
    'Tap a card to select it, tap an enemy or the card again to play it.',
    'Drag a card up to play it. Tap icons and statuses to read their tips.',
    'Tap the pause button, top right, for this menu.']],
];
export const GLOSSARY = [
  ['Block', 'Absorbs damage this turn, then disappears.'],
  ['Weight / Budget', 'Each graft has Weight 1 to 3. Your deck Budget is 6 plus bonuses.'],
  ['Strain', 'Total Weight over Budget. Each point Tithes a plain card.'],
  ['Tithe', 'A card with no grafts fights at -25% numbers that combat.'],
  ['Backfire', 'Strain with no plain card left to take it: grafted cards in your opening hand get jammed (+1 cost).'],
  ['Overload', 'The 3rd graft on a card: numbers x1.5, but a 25% Shatter chance on its first play.'],
  ['Shatter', 'The card resolves, then is destroyed for the run.'],
  ['Temper', 'A Forge option: fuses a card\'s patches into it for good, lighter and out of the slots.'],
  ['Thread', 'Chain cards of one school, then cut the thread to cash the stitches.'],
  ['Vulnerable', 'Takes 50% more attack damage.'],
  ['Weak', 'Deals 25% less attack damage.'],
  ['Frail', 'Gains 25% less block.'],
  ['Burn', 'Damage at turn start, then halves.'],
  ['Bleed', 'HP loss at turn start, drops by 1.'],
  ['Poison', 'HP loss at turn start, ignores Block, rises by 1 (max 6).'],
  ['Brittle', 'Block shatters: when an attack empties your Block you take 25% of the broken amount.'],
  ['Rejection', 'Prices trigger twice this turn.'],
  ['Infection', 'Strain counts extra this combat. Only a potion, Rest or Forge clears it.'],
  ['Numb', 'The grafts on your top grafted card stop working this turn. Prices still bite.'],
  ['Exhaust / Retain', 'Exhausted cards leave the fight. Retained cards stay in hand at turn end.'],
];

export default {
  enter(app) {
    this.k = calm(app) ? 1 : 0; this.clock = 0; this.mode = 'menu'; this.confirm = null; this.sel = 0; this.scroll = 0; this.fresh = true;
    this.lastMx = -1; this.lastMy = -1;
    if (!app.paused) { app.prevTimeScale = app.timeScale === undefined ? 1 : app.timeScale; app.timeScale = 0; app.paused = true; }
    const a = app.shared.audio; if (a && a.sfx) a.sfx('uiClick');
  },
  leave(app) { this.resume(app); },
  resume(app) { if (app.paused) { app.timeScale = app.prevTimeScale === undefined ? 1 : app.prevTimeScale; app.paused = false; } },
  close(app) { const a = app.shared.audio; if (a && a.sfx) a.sfx('uiBack'); this.resume(app); const i = app.stack.indexOf(this); if (i === app.stack.length - 1) app.pop(); else if (i >= 0) app.stack.splice(i); },
  key(app, e) {
    if (app.top() !== this) return false;
    if (this.mode === 'menu' && !this.confirm && (e.key === 'Enter' || e.key === ' ')) {
      const it = this.items && this.items[this.sel];
      if (it && it.id === 'fullscreen' && canFullscreen()) { app.fsHandledFrame = app.frame; toggleFullscreen(); }
    }
    return ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ', 'Enter'].includes(e.key);
  },
  buildItems(app) {
    const inFight = app.shared.run && app.shared.run.phase === 'combat';
    const items = [{ id: 'resume', label: 'Resume' }, { id: 'settings', label: 'Settings' }];
    if (canFullscreen()) items.push({ id: 'fullscreen', label: 'Fullscreen: ' + (isFullscreen() ? 'On' : 'Off'), hint: 'F' });
    items.push({ id: 'deck', label: 'Deck' }, { id: 'help', label: 'Controls and Glossary' },
      { id: 'abandon', label: 'Abandon run', danger: true }, { id: 'quit', label: 'Quit to title', fight: !!inFight });
    return items;
  },
  activate(app, id) {
    const flow = app.shared.flow, a = app.shared.audio;
    if (id === 'resume') return this.close(app);
    if (id === 'settings') return flow.openSettings();
    if (id === 'fullscreen') return requestFs(app);
    if (id === 'deck') return flow.openDeck();
    if (id === 'help') { this.mode = 'help'; this.scroll = 0; return; }
    if (id === 'abandon') { this.confirm = { kind: 'abandon', title: 'Lose this run?', body: 'Progress counts as defeat.', yes: 'Abandon run' }; this.sel = 1; return; }
    if (id === 'quit') {
      const run = app.shared.run;
      if (run && run.phase === 'combat') { this.confirm = { kind: 'quit', title: 'Leave this fight?', body: 'The run is saved, but this fight restarts when you continue.', yes: 'Quit to title' }; this.sel = 1; return; }
      return this.doQuit(app);
    }
    if (id === 'yes') {
      const k = this.confirm.kind; this.confirm = null;
      if (k === 'abandon') { this.resume(app); flow.abandon(); } else this.doQuit(app);
    }
    if (id === 'no') { this.confirm = null; this.sel = 0; if (a && a.sfx) a.sfx('uiBack'); }
  },
  doQuit(app) {
    const run = app.shared.run;
    if (run && run.phase !== 'dead' && run.phase !== 'won') { try { saveRun(run); } catch { /* storage blocked: still leave */ } }
    this.resume(app); app.shared.flow.toTitle();
  },
  draw(app) {
    const g = app.ctx, live = app.top() === this;
    const rd = Math.max(app.rawDt || 0, app.dt || 0);
    this.clock += rd; if (this.k < 1) this.k = clamp(this.k + rd / 0.18, 0, 1);
    if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    const k = EASE.out(this.k);
    g.save(); g.fillStyle = `rgba(6,4,3,${0.74 * k})`; g.fillRect(0, 0, W, H); g.restore();
    const keys = live ? app.pressedKeys.slice() : [];
    if (this.mode === 'help') { this.drawHelp(app, g, k, keys, live); return; }
    const pw = 420, ph = 560, px = 640 - pw / 2, py = 80 + (1 - k) * 16;
    g.save(); g.globalAlpha = k;
    this.frame(app, g, px, py, pw, ph);
    T(app, 'PAUSED', 640, py + 22, { size: 30, bold: true, align: 'center', color: '#f1dfae', shadow: true });
    this.stitchLine(g, px + 40, py + 66, px + pw - 40);
    this.items = this.confirm ? [{ id: 'yes' }, { id: 'no' }] : this.buildItems(app);
    const items = this.items; this.sel = clamp(this.sel, 0, items.length - 1);
    // keyboard
    for (const e of keys) {
      const kk = e.key, n = items.length;
      if (kk === 'Escape') { if (this.confirm) { this.confirm = null; this.sel = 0; } else { g.restore(); return this.close(app); } }
      else if (kk === 'ArrowDown' || (kk === 'Tab' && !e.shiftKey) || (this.confirm && kk === 'ArrowRight')) this.sel = (this.sel + 1) % n;
      else if (kk === 'ArrowUp' || (kk === 'Tab' && e.shiftKey) || (this.confirm && kk === 'ArrowLeft')) this.sel = (this.sel + n - 1) % n;
      else if (kk === 'Enter' || kk === ' ') { const it = items[this.sel]; if (it) this.activate(app, it.id); break; }
    }
    const m = app.mouse, moved = m.x !== this.lastMx || m.y !== this.lastMy; this.lastMx = m.x; this.lastMy = m.y;
    if (this.confirm) this.drawConfirm(app, g, px, py, pw, ph, moved, live);
    else this.drawRows(app, g, px, py, pw, ph, moved, live);
    const hint = this.confirm ? 'Left / Right choose   Enter confirm   Esc back' : 'Up / Down move   Enter select   Esc resume';
    T(app, hint, 640, py + ph - 34, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.5)' });
    g.restore();
  },
  frame(app, g, px, py, pw, ph) {
    app.panel(px, py, pw, ph, { r: 16, fill: 'rgba(22,18,16,.985)', stroke: BRASS, lw: 3 });
    g.save(); app.rr(px + 7, py + 7, pw - 14, ph - 14, 11); g.strokeStyle = 'rgba(232,220,196,.16)'; g.lineWidth = lnw(1.5); g.stroke();
    g.fillStyle = BRASS;
    for (const [rx, ry] of [[px + 16, py + 16], [px + pw - 16, py + 16], [px + 16, py + ph - 16], [px + pw - 16, py + ph - 16]]) { g.beginPath(); g.arc(rx, ry, 3.5, 0, 6.283); g.fill(); }
    g.restore();
  },
  stitchLine(g, x1, y, x2) {
    g.save(); g.strokeStyle = 'rgba(176,141,60,.7)'; g.lineWidth = lnw(1.5); g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y);
    for (let x = x1; x < x2; x += 12) { g.moveTo(x, y - 3); g.lineTo(x, y + 3); }
    g.stroke(); g.restore();
  },
  row(app, g, x, y, w, h, label, o) {
    const pulse = o.focus && !calm(app) ? 0.5 + 0.5 * Math.sin(this.clock * 4) * 0.35 : 0.8;
    g.save(); app.rr(x, y, w, h, 9);
    g.fillStyle = o.focus ? '#3d311b' : o.danger ? '#2c1a1a' : COL.slab2; g.fill();
    g.lineWidth = lnw(o.focus ? 2.8 : 1.6); g.strokeStyle = o.focus ? `rgba(242,193,78,${pulse + 0.2})` : o.danger ? 'rgba(179,38,58,.55)' : 'rgba(232,220,196,.35)'; g.stroke();
    if (o.focus) { g.fillStyle = COL.lamp; g.beginPath(); g.moveTo(x + 12, y + h / 2 - 7); g.lineTo(x + 22, y + h / 2); g.lineTo(x + 12, y + h / 2 + 7); g.closePath(); g.fill(); }
    g.restore();
    T(app, label, x + w / 2, y + h / 2 - 13 * sc(app), { size: o.size || 22, bold: true, align: 'center', color: o.focus ? '#fff1c4' : o.danger ? '#e9a3a3' : COL.vellum });
    if (o.hint) T(app, o.hint, x + w - 16, y + h / 2 - 8 * sc(app), { size: 13, ui: true, bold: true, align: 'right', color: 'rgba(242,193,78,.8)' });
  },
  drawRows(app, g, px, py, pw, ph, moved, live) {
    const items = this.items, x = px + 30, w = pw - 60, h = 50, step = 58;
    let y = py + 84;
    items.forEach((it, i) => {
      const over = live && app.inRect(x, y, w, h);
      if (over) { app.cursor = 'pointer'; if (moved && this.sel !== i) this.sel = i; }
      if (it.id === 'fullscreen') fsRegisterRect(app, x, y, w, h);
      if (it.id === 'abandon') this.stitchLine(g, x, y - 4, x + w);
      this.row(app, g, x, y, w, h, it.label, { focus: this.sel === i, danger: it.danger, hint: it.hint });
      if (live && app.clicked(x, y, w, h)) { this.sel = i; if (app.onClick) app.onClick(); this.activate(app, it.id); }
      y += step + (it.id === 'help' ? 8 : 0);
    });
    if (!canFullscreen() && isIPhone()) T(app, 'Add to Home Screen for fullscreen', 640, y - 2, { size: 13, ui: true, italic: true, align: 'center', color: 'rgba(232,220,196,.6)' });
  },
  drawConfirm(app, g, px, py, pw, ph, moved, live) {
    const c = this.confirm, x = px + 30, w = pw - 60;
    T(app, c.title, 640, py + 120, { size: 28, bold: true, align: 'center', color: '#f4b0b0' });
    const lines = app.wrap(c.body, w - 20, Math.round(18 * sc(app)), { ui: true });
    lines.forEach((ln, i) => T(app, ln, 640, py + 170 + i * 26, { size: 18, ui: true, align: 'center', color: COL.vellum }));
    const by = py + 290, bw = (w - 16) / 2;
    [['yes', c.yes, x, true], ['no', 'Cancel', x + bw + 16, false]].forEach(([id, label, bx, danger], i) => {
      const over = live && app.inRect(bx, by, bw, 54);
      if (over) { app.cursor = 'pointer'; if (moved) this.sel = i; }
      this.row(app, g, bx, by, bw, 54, label, { focus: this.sel === i, danger, size: 18 });
      if (live && app.clicked(bx, by, bw, 54)) { if (app.onClick) app.onClick(); this.activate(app, id); }
    });
  },
  drawHelp(app, g, k, keys, live) {
    const pw = 860, ph = 620, px = 640 - pw / 2, py = 50 + (1 - k) * 16, colW = (pw - 100) / 2;
    g.save(); g.globalAlpha = k;
    this.frame(app, g, px, py, pw, ph);
    T(app, 'CONTROLS AND GLOSSARY', px + 36, py + 22, { size: 26, bold: true, color: '#f1dfae', shadow: true });
    const bx = px + pw - 130, by = py + 18;
    if (app.button('Back', bx, by, 94, 38, { size: 17 }) && live) { this.mode = 'menu'; this.sel = 0; }
    this.stitchLine(g, px + 36, py + 68, px + pw - 36);
    // content
    const size = Math.round(14 * sc(app)), lh = Math.round(size * 1.3), top = py + 84, vh = ph - 84 - 40;
    const left = [], right = [];
    for (const [head, lines] of CONTROLS) {
      left.push({ head }); for (const ln of lines) for (const w of app.wrap(ln, colW - 14, size, { ui: true })) left.push({ t: w });
      left.push({ gap: 1 });
    }
    if (isIPhone()) { left.push({ head: 'FULLSCREEN' }); left.push({ t: 'Add to Home Screen for fullscreen.' }); }
    right.push({ head: 'GLOSSARY' });
    for (const [name, desc] of GLOSSARY) {
      const ls = app.wrap(desc, colW - 14, size, { ui: true });
      right.push({ name, t: ls[0] }); for (let i = 1; i < ls.length; i++) right.push({ t: ls[i] });
    }
    const hOf = (a) => a.reduce((s, r) => s + (r.gap ? 10 : r.head ? lh + 8 : lh), 0);
    const total = Math.max(hOf(left), hOf(right)), maxS = Math.max(0, total - vh);
    for (const e of keys) {
      if (e.key === 'Escape') { this.mode = 'menu'; this.sel = 0; g.restore(); return; }
      if (e.key === 'ArrowDown') this.scroll += lh * 2; else if (e.key === 'ArrowUp') this.scroll -= lh * 2;
      else if (e.key === 'PageDown' || e.key === ' ') this.scroll += vh * 0.8; else if (e.key === 'PageUp') this.scroll -= vh * 0.8;
    }
    const m = app.mouse;
    if (m.wheel) this.scroll += clamp(m.wheel, -300, 300) * 0.6;
    if (live && m.down && m.y > top && m.y < top + vh && m.x > px && m.x < px + pw) {
      if (this.dragY !== undefined) this.scroll -= m.y - this.dragY; this.dragY = m.y;
    } else this.dragY = undefined;
    this.scroll = clamp(this.scroll, 0, maxS);
    app.reg('scroll-help', px + 20, top, pw - 40, vh, { overlay: true }); // the glossary scrolls and is clipped inside this box
    g.save(); g.beginPath(); g.rect(px + 20, top, pw - 40, vh); g.clip();
    const draw = (rows, x0) => {
      let y = top - this.scroll;
      for (const r of rows) {
        if (r.gap) { y += 10; continue; }
        if (r.head) { T(app, r.head, x0, y, { size: 14, ui: true, bold: true, color: COL.lamp }); y += lh + 8; continue; }
        if (y > top - lh && y < top + vh) {
          if (r.name) { T(app, r.name, x0, y, { size: 14, ui: true, bold: true, color: '#f1dfae' }); const nw = app.measure(r.name + '  ', size, { ui: true, bold: true }); T(app, r.t, x0 + nw, y, { size: 14, ui: true, color: COL.vellum }); }
          else T(app, r.t, x0 + (right.includes(r) ? 12 : 0), y, { size: 14, ui: true, color: COL.vellum });
        }
        y += lh;
      }
    };
    draw(left, px + 40); draw(right, px + 60 + colW);
    g.restore();
    if (maxS > 0) { const bh = Math.max(30, vh * vh / total); g.fillStyle = 'rgba(176,141,60,.55)'; app.rr(px + pw - 22, top + (vh - bh) * (this.scroll / maxS), 6, bh, 3); g.fill(); }
    T(app, maxS > 0 ? 'Scroll with the wheel, Up / Down, or drag. Esc goes back.' : 'Esc goes back.', 640, py + ph - 30, { size: 12, ui: true, align: 'center', color: 'rgba(232,220,196,.5)' });
    g.restore();
  },
};

// ---------------------------------------------------------------- global overlay
export function pauseIcon(g, x, y, w, h) {
  g.save(); g.fillStyle = COL.vellum;
  app_rr(g, x + w / 2 - 9, y + h / 2 - 9, 6, 18); app_rr(g, x + w / 2 + 3, y + h / 2 - 9, 6, 18);
  g.restore();
}
function app_rr(g, x, y, w, h) { g.fillRect(x, y, w, h); }

export function openPause(app) {
  if (app.stack.some((s) => s.name === 'pause')) return;
  app.push('pause', {});
}
// Install the tick wrapper that tracks unscaled dt and the stack size at frame start. Idempotent.
export function installPause(app) {
  if (app.pauseInstalled) return; app.pauseInstalled = true;
  const tick0 = app.tick;
  app.tick = (raw) => { app.rawDt = raw; app.stackAtStart = app.stack.length; tick0(raw); };
}
// Draw + handle the global buttons. Call from app.overlay every frame.
export function drawPauseOverlay(app) {
  if (app.paused) {
    const ui = new Set(app.stack.slice(Math.max(0, app.stack.indexOf(app.screens.pause))));
    const d = (app.rawDt || 0) * 1000;
    for (const tw of app.tweens.slice()) {
      if (!ui.has(tw.obj)) continue;
      tw.t += d; const kk = clamp(tw.t / tw.ms, 0, 1), e = tw.ease(kk);
      for (const p of Object.keys(tw.to)) tw.obj[p] = tw.from[p] + (tw.to[p] - tw.from[p]) * e;
      if (kk >= 1 && tw.done) { const f = tw.done; tw.done = null; f(); }
    }
  }
  const inRun = app.stack.length === 1 && IN_RUN.has(app.current);
  const busy = !!app.escBusy;
  if (inRun) {
    const P = chromeRect(app, PAUSE_BTN), F = chromeRect(app, FS_BTN);
    app.reg('pause_btn', P.x, P.y, P.w, P.h, { layer: 'hud' });
    if (app.inRect(P.x, P.y, P.w, P.h)) app.tooltip('Pause', 'Esc');
    if (app.button('', P.x, P.y, P.w, P.h, { icon: pauseIcon, disabled: busy })) openPause(app);
    fsButton(app, F.x, F.y, F.w, F.h, { id: 'fs_btn' });
    if (!busy && app.stackAtStart === 1 && app.pressedKeys.some((e) => e.key === 'Pause' || e.key === 'Escape')) openPause(app);
  }
  app.escBusy = false;
}
