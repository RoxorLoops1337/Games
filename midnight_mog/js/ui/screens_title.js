// Midnight Mog title screen: animated neon skyline, the logo in the style bible display type, TAP TO START, then Continue / New game.
// Screen id 'title'. Owner: integrator.
//
// App needs: hasSave (bool), saveInfo ({stage, ago}) optional, startGame('continue'|'new'), audio (optional), bootNotice (string|null).
import { PAL, rgba, glow, mix } from '../palette.js';
import { drawText, formatTime } from '../render/text.js';
import * as WORLD from '../render/world.js';
import * as CATART from '../render/catart.js';
import { clamp, hash01, outBack, outCubic } from './shell.js';

const TAU = Math.PI * 2;

function moon(ctx, x, y, r, t) {
  ctx.save();
  glow(ctx, x, y, r * 3.4, PAL.magenta, 0.22);
  glow(ctx, x, y, r * 2.2, PAL.cyan, 0.16);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, PAL.bone); g.addColorStop(1, mix(PAL.bone, PAL.violetHi, 0.55));
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = rgba(PAL.violet, 0.22);
  for (const [dx, dy, rr] of [[-0.35, -0.2, 0.2], [0.25, 0.15, 0.28], [-0.1, 0.45, 0.14], [0.4, -0.35, 0.12]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function stars(ctx, w, h, t) {
  for (let i = 0; i < 64; i++) {
    const x = hash01('sx' + i) * w, y = hash01('sy' + i) * h * 0.5;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + hash01('sf' + i) * 1.6) + i));
    ctx.fillStyle = rgba(i % 5 === 0 ? PAL.cyan : PAL.bone, 0.25 + 0.55 * tw * (0.4 + hash01('sa' + i)));
    const s = hash01('ss' + i) > 0.85 ? 2.2 : 1.3;
    ctx.fillRect(x, y, s, s);
  }
  // a shooting star every ~7 seconds
  const cyc = (t % 7) / 7;
  if (cyc < 0.09) {
    const k = cyc / 0.09, sx = w * (0.15 + 0.5 * hash01('shoot' + Math.floor(t / 7))), sy = h * 0.06 + k * h * 0.12;
    const x = sx + k * w * 0.25;
    const g = ctx.createLinearGradient(x, sy, x - 70, sy - 26); g.addColorStop(0, rgba(PAL.bone, 0.9 * (1 - k))); g.addColorStop(1, rgba(PAL.cyan, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x - 70, sy - 26); ctx.stroke();
  }
}

export function createTitleScreen() {
  const S = { t: 0, phase: 'tap', menuT: 0, noticeShown: false, askNew: false };
  const screen = {
    id: 'title',
    state: S,
    enter(app) {
      S.t = 0; S.phase = 'tap'; S.menuT = 0; S.noticeShown = false; S.askNew = false;
    },
    update(app, dt) { S.t += dt; if (S.phase === 'menu') S.menuT += dt; },
    draw(ctx, app, ui) {
      const t = S.t, w = ui.w, h = ui.h, c = ui.content;
      ui.clear(PAL.void);
      const baseY = h * 0.66;
      try { WORLD.drawSkyline(ctx, w, h, t, 'laser_lights', { baseY, topY: h * 0.24, vignette: false }); } catch (e) { ctx.fillStyle = PAL.ink2; ctx.fillRect(0, 0, w, h); }
      stars(ctx, w, h, t);
      moon(ctx, w * 0.8, h * 0.075, clamp(Math.min(w, h) * 0.05, 22, 40), t);
      // foreground ledge with three cats watching the city
      const ledgeY = h * 0.77;
      ctx.save();
      const g = ctx.createLinearGradient(0, ledgeY, 0, h); g.addColorStop(0, PAL.ink3); g.addColorStop(1, PAL.void);
      ctx.fillStyle = g; ctx.fillRect(0, ledgeY, w, h - ledgeY);
      ctx.fillStyle = rgba(PAL.cyan, 0.7); ctx.fillRect(0, ledgeY, w, 2);
      ctx.fillStyle = rgba(PAL.magenta, 0.35); ctx.fillRect(0, ledgeY + 2, w, 3);
      ctx.restore();
      const cs = clamp(Math.min(w * 0.3, h * 0.17), 70, 130);
      const cats = [['spark_kit', -0.30, 0.85], ['scrap_tabby', 0, 1.15], ['whisker_scout', 0.30, 0.9]];
      for (let i = 0; i < cats.length; i++) {
        const [id, off, sc] = cats[i];
        try { CATART.drawCat(ctx, id, w / 2 + off * Math.min(w, 520) * 0.9, ledgeY + 6, cs * sc, { t: t + i * 1.3, anim: 'idle', animT: (t * 0.35 + i * 0.3) % 1, facing: i === 0 ? 1 : -1 }); } catch (e) { /* art is optional */ }
      }
      // ---- logo
      const lw = Math.min(c.w - 24, 480);
      const lx = w / 2;
      const intro = ui.reduceMotion ? 1 : outBack(clamp(t / 0.9, 0, 1));
      const ly = h * 0.19;
      const size1 = clamp(lw * 0.2, 34, 84);
      ctx.save();
      ctx.translate(lx, ly); ctx.scale(intro, intro); ctx.translate(-lx, -ly);
      drawText(ctx, 'MIDNIGHT', lx, ly, { size: size1, kind: 'display', align: 'center', gradient: [PAL.bone, PAL.cyan], glow: 16, glowColor: PAL.cyan, maxWidth: lw, track: 0.08, stroke: Math.max(5, size1 * 0.14) });
      const flick = 0.85 + 0.15 * Math.sin(t * 9) * (Math.sin(t * 1.3) > 0.9 ? 1 : 0.2);
      ctx.globalAlpha = clamp(flick, 0.6, 1);
      drawText(ctx, 'MOG', lx, ly + size1 * 1.05, { size: size1 * 1.25, kind: 'display', align: 'center', gradient: ['#ff8fc4', PAL.magenta], glow: 22, glowColor: PAL.magenta, maxWidth: lw * 0.8, track: 0.1, stroke: Math.max(6, size1 * 0.17) });
      ctx.restore();
      drawText(ctx, 'cats vs the neon night', lx, ly + size1 * 1.05 + 30, { size: 15, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, maxWidth: lw, alpha: clamp((t - 0.6) / 0.6, 0, 1) });
      // ---- interaction
      const bw = Math.min(c.w - 56, 340);
      if (S.phase === 'tap') {
        const full = ui.region('title:tap', { x: 0, y: 0, w, h }, { focus: true, label: 'Tap to start' });
        const a = 0.55 + 0.45 * Math.sin(t * 3.2);
        drawText(ctx, 'TAP TO START', lx, h * 0.9, { size: 24, kind: 'display', align: 'center', color: PAL.bone, glow: 12, glowColor: PAL.lime, alpha: a, track: 0.1 });
        if (full.tap || ui.keyHit('enter') || ui.keyHit('space')) {
          ui.eatKey('enter'); ui.eatKey('space');
          S.phase = 'menu'; S.menuT = 0;
          if (app.audio) { try { app.audio.resume(); app.audio.music('title'); app.audio.sfx('ui_tap'); } catch (e) { /* optional */ } }
        }
      } else {
        const k = outCubic(clamp(S.menuT / 0.35, 0, 1));
        const by = h * 0.43;
        const rows = app.hasSave ? 2 : 1;
        ctx.save(); ctx.globalAlpha = k;
        let y = by + (1 - k) * 18;
        if (app.hasSave) {
          const si = app.saveInfo || {};
          const sub = si.stage ? 'Stage ' + si.stage + (si.ago > 90 ? '   away ' + formatTime(si.ago) : '') : '';
          if (ui.button('title:continue', { x: lx - bw / 2, y, w: bw, h: 64 }, 'CONTINUE', { kind: 'primary', size: 26, sub, pulse: true })) app.startGame('continue');
          y += 76;
          if (ui.button('title:new', { x: lx - bw / 2, y, w: bw, h: 48 }, 'NEW GAME', { kind: 'secondary', size: 18 })) {
            ui.confirm('Start over?', 'Your current save will be replaced by a fresh one. Export a backup in Settings first if you want to keep it.', () => app.startGame('new'), { danger: true, yesLabel: 'Start over', noLabel: 'Keep playing', id: 'newgame' });
          }
        } else if (ui.button('title:new', { x: lx - bw / 2, y, w: bw, h: 68 }, 'PLAY', { kind: 'primary', size: 30, sub: 'A new cat adventure', pulse: true })) app.startGame('new');
        void rows;
        ctx.restore();
      }
      if (app.bootNotice && !S.noticeShown && !ui.transitioning) {
        S.noticeShown = true;
        const msg = app.bootNotice; app.bootNotice = null;
        ui.dialog({ id: 'bootnotice', title: 'Heads up', text: msg, buttons: [{ id: 'ok', label: 'OK', kind: 'primary' }] });
      }
      drawText(ctx, 'v1.0', w - 12, h - 12 - ui.safe.bottom, { size: 12, kind: 'body', weight: 700, align: 'right', color: rgba(PAL.boneDim, 0.7), stroke: 2 });
      ui.vignette(0.45);
      ui.scanlines(0.05);
    },
  };
  return screen;
}

export const titleScreen = createTitleScreen();
export default titleScreen;
