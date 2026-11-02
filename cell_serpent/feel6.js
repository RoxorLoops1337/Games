// Screen feel, round 6 (canvas, drawn under the HUD by screenfx.js):
//  - danger: a heartbeat that gets faster and redder as the snake face nears the line (edge pulse + a hot line + tunnel vignette)
//  - revive return: the duo is lifted back by a golden light pillar, shock rings and an ENCORE! banner
//  - boss defeat: a staggered chain of blasts around the last face before the DOWN! card
// Reads events and sim state only. Never changes the sim.
import { LINE_Y } from './sim.js';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const backOut = t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// lub-dub: two soft beats per cycle, 0..1
export function heartbeat(t, rate) {
  const ph = (t * rate) % 1, a = Math.exp(-Math.pow((ph - 0.08) / 0.07, 2)), b = 0.6 * Math.exp(-Math.pow((ph - 0.3) / 0.08, 2));
  return clamp(a + b, 0, 1);
}

// heartbeats per second at a danger strength d (0..1); the danger tick sound in audio.js follows the same pulse
export const dangerRate = d => 1.3 + d * 1.9;

export function createFeel6({ ctx, W, H, kit, S, OPT, ring, burst, text, glow, edges, vignette, slow, confetti, sounds }) {
  const calm = () => OPT.reduceMotion;
  const st = { rev: null, blasts: [], bossT: 0, lastBeat: 0, lastTick: 0 };

  function lineBand() {
    return kit && kit.bake ? kit.bake('d6line', W, 300, g => {
      const gr = g.createLinearGradient(0, -150, 0, 150); gr.addColorStop(0, 'rgba(255,40,80,0)'); gr.addColorStop(0.5, 'rgba(255,60,90,1)'); gr.addColorStop(1, 'rgba(255,40,80,0)');
      g.fillStyle = gr; g.fillRect(-W / 2, -150, W, 300);
    }, 0.25) : null;
  }
  function pillar() {
    return kit && kit.bake ? kit.bake('d6pillar', 360, H, g => {
      const gr = g.createLinearGradient(-180, 0, 180, 0); gr.addColorStop(0, 'rgba(255,230,150,0)'); gr.addColorStop(0.5, 'rgba(255,240,190,1)'); gr.addColorStop(1, 'rgba(255,230,150,0)');
      g.fillStyle = gr; g.fillRect(-180, -H / 2, 360, H);
    }, 0.3) : null;
  }

  function onEvent(e, g) {
    switch (e.t) {
      case 'revive': {
        st.rev = { t: 0, dur: 1.7, x: g.p.x, y: g.p.y };
        sounds.push('star3');
        if (calm()) break;
        S.flash = Math.max(S.flash, 0.6); S.flashCol = '#fff3b8'; S.trauma = Math.min(1, S.trauma + 0.55);
        ring(g.p.x, g.p.y - 30, 300, '#ffd84d', 0.6); ring(g.p.x, g.p.y - 30, 190, '#fff', 0.5); ring(g.p.x, LINE_Y, 520, '#ff9ad6', 0.7);
        burst(g.p.x, g.p.y - 40, 26, ['#ffd84d', '#fff', '#ff9ad6', '#9ff0ff'], 560, 0.9, 7);
        slow(0.4, 0.45);
        break;
      }
      case 'kill':
        if (e.head && e.boss && !calm()) {
          st.bossT = 0.0001; st.blasts.length = 0;
          const cols = ['#ffd84d', '#ff4d7a', '#fff', '#9ff0ff'];
          for (let i = 0; i < 7; i++) st.blasts.push({ at: 0.14 + i * 0.13, x: e.x + (Math.random() - 0.5) * 340, y: e.y + (Math.random() - 0.5) * 260, c: cols[i % 4], r: 140 + Math.random() * 120, done: false });
          st.blasts.push({ at: 1.05, x: e.x, y: e.y, c: '#fff', r: 560, big: true, done: false });
          slow(0.22, 1.0);
        }
        break;
    }
  }

  function update(dt, g) {
    if (st.rev) { st.rev.t += dt; if (st.rev.t > st.rev.dur) st.rev = null; }
    if (st.bossT > 0) {
      st.bossT += dt;
      for (const b of st.blasts) {
        if (b.done || st.bossT < b.at) continue;
        b.done = true;
        ring(b.x, b.y, b.r, b.c, b.big ? 0.8 : 0.5); burst(b.x, b.y, b.big ? 34 : 12, ['#ffd84d', '#ff4d7a', '#fff'], b.big ? 760 : 460, 0.8, b.big ? 9 : 6);
        S.trauma = Math.min(1, S.trauma + (b.big ? 0.8 : 0.22));
        if (b.big) { S.flash = Math.max(S.flash, 0.85); S.flashCol = '#fffbe8'; confetti(90); }
        sounds.push(b.big ? 'star3' : 'boom');
      }
      if (st.bossT > 1.4) { st.bossT = 0; st.blasts.length = 0; }
    }
    void g;
  }

  // 0..1 how strongly the danger feel is on right now
  function dangerK(g) { return g && g.phase === 'play' ? clamp(((g.danger || 0) - 0.12) / 0.88, 0, 1) : 0; }

  function drawDanger(g) {
    const d = dangerK(g); if (d <= 0) return;
    const rate = dangerRate(d), raw = heartbeat(S.t, rate), hb = calm() ? 0.55 : raw;
    if (raw > 0.65 && st.hbHot !== true) { st.hbHot = true; if (sounds) sounds.push('dangerbeat'); } else if (raw < 0.4) st.hbHot = false;   // the lub of the heartbeat is also a sound
    edges('#ff2850', (0.06 + 0.5 * d) * (0.35 + 0.65 * hb));
    if (d > 0.45) vignette((d - 0.45) * 0.9 * (0.5 + 0.5 * hb), '90,0,20');
    if (!g.ring) {   // the line itself runs hot
      const spr = lineBand();
      if (spr) { ctx.save(); ctx.globalAlpha = clamp(d * (0.22 + 0.5 * hb), 0, 0.8); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(spr.c, 0, LINE_Y - 150, W, 300); ctx.restore(); }
    }
    if (d > 0.3 && sounds && heartbeat(S.t, rate) > 0.85 && S.t - st.lastTick > 0.28) { st.lastTick = S.t; sounds.push('dangertick'); }   // a dry tick on every lub, so the ear follows the screen pulse
    if (!calm() && hb > 0.85 && S.t - st.lastBeat > 0.25) { st.lastBeat = S.t; S.trauma = Math.min(1, S.trauma + 0.04 + 0.06 * d); }
  }

  function drawRevive() {
    const r = st.rev; if (!r) return;
    const t = r.t, k = t / r.dur, out = clamp((r.dur - t) / 0.5, 0, 1);
    const spr = pillar();
    if (spr && !calm()) {
      const w = (1 - easeOut(clamp(t / 1.1, 0, 1)) * 0.55);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * out * clamp(t / 0.12, 0, 1);
      ctx.translate(r.x, 0); ctx.scale(w, 1); ctx.drawImage(spr.c, -180, 0, 360, H); ctx.restore();
    }
    const inn = calm() ? 1 : backOut(clamp(t / 0.35, 0, 1)), cy = H * 0.4 - 40 * easeOut(clamp(k, 0, 1));
    ctx.save(); ctx.globalAlpha = out; ctx.translate(W / 2, cy); ctx.scale(inn, inn); ctx.rotate(calm() ? 0 : -0.05);
    glow(0, 0, 300, '#ffd84d', 0.34);
    text('ENCORE!', 0, 0, 120, '#fff6c9', '#7a3a00');
    text('one more song', 0, 70, 38, '#ffc2dc', '#2a0a20');
    ctx.restore();
    if (!calm() && t < 0.9) {   // sparkle motes rising off the duo
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = (i * 2.399 + 1) % TAU, u = clamp(t / 0.9 + i * 0.02, 0, 1), x = r.x + Math.cos(a) * (40 + 110 * u) * (i % 2 ? 1 : 0.6), y = r.y - 30 - u * (160 + (i % 4) * 60);
        ctx.globalAlpha = (1 - u) * 0.9; ctx.fillStyle = i % 3 ? '#ffe27a' : '#ffb0dc'; ctx.beginPath(); ctx.arc(x, y, 7 * (1 - u * 0.6), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBoss() {
    if (st.bossT <= 0) return;
    const t = st.bossT, a = clamp((t - 0.9) / 0.15, 0, 1) * clamp((1.4 - t) / 0.4, 0, 1);
    if (a > 0) { ctx.save(); ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#fffbe8'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  function draw(g) { drawDanger(g); drawRevive(); drawBoss(); }
  return { onEvent, update, draw, state: st };
}
