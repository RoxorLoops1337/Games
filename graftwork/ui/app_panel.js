// "App and offline" modal (Settings row, screen 'app_panel') and the one-time offline offer ('offline_prompt'): Install app, the offline copy
// (status, download, check for updates, remove) and nothing automatic: a download only starts from a tap. No promise beyond what the status says.
import { COL } from './core.js';
import * as I from './install.js';
import * as O from './offline.js';

const X = 330, Y = 96, W = 620, H = 528;
export const APP_ROWS = { install: { x: X + W - 32 - 190, y: Y + 78, w: 190, h: 44 }, dl: { x: X + W - 32 - 250, y: Y + 214, w: 250, h: 44 }, check: { x: X + 32, y: Y + 312, w: 250, h: 44 }, remove: { x: X + W - 32 - 250, y: Y + 312, w: 250, h: 44 }, restart: { x: X + 32, y: Y + 372, w: 250, h: 44 }, close: { x: X + W / 2 - 80, y: Y + H - 62, w: 160, h: 44 } };

export const appPanel = {
  enter() { this.fresh = true; },
  leave() {},
  draw(app) {
    const g = app.ctx, R = APP_ROWS;
    if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    g.save(); g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 0, 1280, 720); g.restore();
    app.panel(X, Y, W, H, { r: 16, fill: 'rgba(22,18,16,.98)', stroke: 'rgba(232,220,196,.5)', lw: 2.5 });
    app.text('App and offline', X + 32, Y + 20, { size: 30, bold: true, fit: { w: W - 64, lines: 1 } });
    const nav0 = app.navButtons; app.navButtons = true;
    const sub = (t, y, c) => app.text(t, X + 32, y, { size: 14, ui: true, color: c || '#9b8f7a', fit: { w: W - 300, lines: 2 }, maxW: W - 300 });
    // install
    app.text('Install app', X + 32, Y + 80, { size: 22 });
    const mode = I.installMode();
    sub('Plays fullscreen, works like an app', Y + 110);
    if (mode === 'prompt' || mode === 'ios') { if (app.button('Install app', R.install.x, R.install.y, R.install.w, R.install.h, { size: 19, fill: '#3a2f1a', stroke: COL.lamp })) I.install(app); }
    else app.text(mode === 'installed' ? 'Installed' : 'Not available in this browser', R.install.x + R.install.w, Y + 90, { size: 17, ui: true, align: 'right', color: mode === 'installed' ? COL.good : '#8c8372', fixed: true });
    // offline
    const sup = O.offlineSupported();
    app.text('Offline play', X + 32, Y + 180, { size: 22 });
    if (!sup) { sub('Not available in this browser (it needs https and a service worker).', Y + 212); }
    else {
      const st = O.S.state;
      app.text(O.offlineLabel(), X + W - 32, Y + 182, { size: 17, ui: true, align: 'right', color: O.offlineReady() ? COL.good : st === 'error' ? '#ff9a9a' : COL.vellum, fixed: true, fit: { w: 300, lines: 1 } });
      if (st === 'downloading') { // progress bar
        app.panel(X + 32, Y + 226, W - 64, 18, { r: 9, fill: '#2a2420', stroke: 'rgba(232,220,196,.35)' });
        if (O.S.pct > 0) app.panel(X + 32, Y + 226, Math.max(18, (W - 64) * O.S.pct / 100), 18, { r: 9, fill: '#6a8f4e', stroke: '#b6e08f' });
      } else if (st === 'none' || st === 'error') {
        sub(O.sizeNote() + '. Lets you play without a connection.', Y + 214);
        if (app.button('Download for offline play', R.dl.x, R.dl.y, R.dl.w, R.dl.h, { size: 17, fit: true, fill: '#3a2f1a', stroke: COL.lamp })) O.downloadOffline();
      } else sub('The game works without a connection. Leaderboards and cloud saves need one.', Y + 214);
      if (O.offlineReady() || st === 'checking') {
        if (app.button('Check for updates', R.check.x, R.check.y, R.check.w, R.check.h, { size: 17, fit: true })) O.checkUpdates();
        if (app.button('Remove offline copy', R.remove.x, R.remove.y, R.remove.w, R.remove.h, { size: 17, fit: true, fill: '#3a2020', stroke: 'rgba(179,38,58,.7)' })) O.removeOffline();
      }
      if (st === 'update-ready') {
        sub('An update is downloaded. It starts the next time you open Graftwork.', Y + 360, COL.vellum);
        if (app.button('Restart now', R.restart.x, R.restart.y + 20, R.restart.w, R.restart.h, { size: 17, fit: true, fill: '#4a3a1d', stroke: COL.lamp })) { try { globalThis.location.reload(); } catch { /* headless */ } }
      } else if (st === 'update-available') sub('A newer version exists. Tap Check for updates on wifi to download it.', Y + 360);
      if (O.S.message && st === 'error') sub(O.S.message, Y + 262, '#ff9a9a');
    }
    if (app.button('Close', R.close.x, R.close.y, R.close.w, R.close.h, { size: 18 }) || app.pressedKeys.some((e) => e.key === 'Escape')) app.pop();
    app.navButtons = nav0;
  },
  key(app, e) { return app.top() === this && ['Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key); },
};

export const offlinePrompt = {
  enter() { this.fresh = true; O.clearOffer(); },
  leave() {},
  draw(app) {
    const g = app.ctx; if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    g.save(); g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 1280, 720); g.restore();
    const x = 340, y = 200, w = 600, h = 280;
    app.panel(x, y, w, h, { r: 14, fill: 'rgba(20,16,14,.98)', stroke: COL.lamp });
    app.text('Download for offline play?', 640, y + 22, { size: 26, bold: true, align: 'center', fit: { w: w - 40, lines: 1 } });
    app.text(`${O.sizeNote()}. Then Graftwork also runs without a connection.`, 640, y + 76, { size: 18, ui: true, align: 'center', maxW: w - 80 });
    app.text('You can also do this later in Settings, App and offline.', 640, y + 140, { size: 14, ui: true, italic: true, align: 'center', maxW: w - 80, color: 'rgba(232,220,196,.65)' });
    const nav0 = app.navButtons; app.navButtons = true;
    if (app.button('Download', x + 40, y + h - 74, 250, 46, { size: 19, fill: '#3a2f1a', stroke: COL.lamp })) { O.downloadOffline(); app.pop(); }
    else if (app.button('Not now', x + w - 40 - 200, y + h - 74, 200, 46, { size: 19 }) || app.pressedKeys.some((e) => e.key === 'Escape')) app.pop();
    app.navButtons = nav0;
  },
  key(app, e) { return app.top() === this && ['Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key); },
};
