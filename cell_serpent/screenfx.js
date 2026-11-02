// Whole-screen feedback for the run: stage title card, boss intro, surge warning, groove edge glow,
// duo aura, slow-motion + zoom punch, victory confetti and the game over fade.
// Reads events and the sim state, never changes the sim. render.js owns the canvas and passes helpers in.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const backOut = t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const CONFETTI = ['#ff7eb6', '#ffd84d', '#6fe3ff', '#9dff6d', '#c9a0ff', '#ffffff'];

export function createScreenFx({ ctx, W, H, kit, text, glow, S, OPT, ring, burst }) {
  const F = {
    card: null,                       // the stage title card
    slow: { t: 0, dur: 0, k: 1 },     // slow motion: real seconds left, length, sim speed at the deepest point
    zoom: { t: 0, dur: 0.4, amp: 0, x: W / 2, y: H / 2 },
    conf: [],
    deadT: 0, warnT: 0,
  };
  const calm = () => OPT.reduceMotion;

  // a baked frame-shaped glow: transparent in the middle, the colour at the screen edges
  function edge(col) {
    return kit && kit.bake ? kit.bake('edgeglow|' + col, W, H, g => {
      const d = 150, hw = W / 2, hh = H / 2;
      const side = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
      side(-hw, 0, -hw + d, 0, -hw, -hh, d, H); side(hw, 0, hw - d, 0, hw - d, -hh, d, H);
      side(0, -hh, 0, -hh + d, -hw, -hh, W, d); side(0, hh, 0, hh - d, -hw, hh - d, W, d);
    }, 0.3) : null;
  }
  function edges(col, a) {
    const spr = edge(col); if (!spr || a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(spr.c, 0, 0, W, H); ctx.restore();
  }
  function vignette(a, col = '0,0,0') {
    if (a <= 0.01) return;
    const spr = kit && kit.bake ? kit.bake('vig|' + col, W, H, g => { const gr = g.createRadialGradient(0, 0, H * 0.18, 0, 0, H * 0.72); gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(1, `rgba(${col},1)`); g.fillStyle = gr; g.fillRect(-W / 2, -H / 2, W, H); }, 0.25) : null;
    ctx.save(); ctx.globalAlpha = Math.min(1, a); if (spr) ctx.drawImage(spr.c, 0, 0, W, H); else { ctx.fillStyle = `rgba(${col},${a * 0.5})`; ctx.fillRect(0, 0, W, H); } ctx.restore();
  }

  function punch(x, y, amp, slowK, slowDur) {
    if (calm()) return;
    F.zoom.x = x; F.zoom.y = y; F.zoom.amp = Math.max(F.zoom.amp, amp); F.zoom.t = F.zoom.dur = 0.42;
    if (slowK) F.slow = { t: slowDur, dur: slowDur, k: slowK };
  }
  function confetti(n) {
    const cap = OPT.lowQuality ? 40 : 110; n = Math.min(n, cap);
    if (calm()) return;
    for (let i = 0; i < n && F.conf.length < cap + 20; i++) {
      const left = i % 2 === 0, a = -Math.PI / 2 + (left ? 1 : -1) * (0.25 + Math.random() * 0.5), v = 800 + Math.random() * 700;
      F.conf.push({ x: left ? -10 : W + 10, y: H * 0.8, vx: Math.cos(a) * v * (left ? 1 : -1) * (left ? 1 : -1), vy: Math.sin(a) * v, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, w: 10 + Math.random() * 10, h: 6 + Math.random() * 6, col: CONFETTI[(Math.random() * CONFETTI.length) | 0], life: 2.4 + Math.random() * 0.8 });
    }
  }

  function onEvent(e, g) {
    switch (e.t) {
      case 'stage': {
        const boss = !!e.boss;
        F.card = { n: e.n, boss, name: e.name || '', mod: e.mod || '', skin: g.skin, t: 0, dur: boss ? 2.9 : 2.3, slammed: false };
        F.deadT = 0;
        break;
      }
      case 'kill':
        if (e.head) punch(e.x, e.y, e.boss ? 0.09 : 0.05, e.boss ? 0.28 : 0.4, e.boss ? 0.55 : 0.32);
        break;
      case 'clear': confetti(e.boss ? 110 : 70); S.flash = Math.max(S.flash, 0.25); S.flashCol = '#ffe9a8'; break;
      case 'dead': punch(g.p.x, g.p.y, 0.07, 0.3, 0.6); F.deadT = 0.0001; break;
      case 'revive': F.deadT = 0; break;
      case 'surgewarn': F.warnT = 0.7; break;
    }
  }

  // sim speed multiplier (1 = normal). main.js multiplies the fixed step clock by this.
  function timeScale() {
    if (calm() || F.slow.t <= 0) return 1;
    const k = F.slow.t / F.slow.dur;   // 1 -> 0, hold the low point then ease back out
    return 1 - (1 - F.slow.k) * Math.min(1, k * 3);
  }

  function update(dt, g) {
    if (F.slow.t > 0) F.slow.t = Math.max(0, F.slow.t - dt);
    if (F.zoom.t > 0) F.zoom.t = Math.max(0, F.zoom.t - dt); else F.zoom.amp = 0;
    if (F.warnT > 0) F.warnT -= dt;
    if (g && g.phase === 'dead' && F.deadT > 0) F.deadT += dt; else if (!g || g.phase !== 'dead') F.deadT = 0;
    const c = F.card;
    if (c) {
      c.t += dt;
      if (c.boss && !c.slammed && c.t > 0.5) {   // the crown lands
        c.slammed = true;
        if (!calm()) { S.trauma = Math.min(1, S.trauma + 0.85); ring(W / 2, H * 0.36, 280, '#ffd84d', 0.6); ring(W / 2, H * 0.36, 170, '#ff4d7a', 0.45); burst(W / 2, H * 0.36, 26, ['#ffd84d', '#ff4d7a', '#fff'], 520, 0.7, 7); }
      }
      if (c.t > c.dur) F.card = null;
    }
    for (let i = F.conf.length - 1; i >= 0; i--) {
      const p = F.conf[i]; p.life -= dt;
      if (p.life <= 0) { F.conf[i] = F.conf[F.conf.length - 1]; F.conf.pop(); continue; }
      p.vy += 1100 * dt; p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }

  // extra screen shake in game units: a low rumble while a surge is coming
  function rumble() { return !calm() && F.warnT > 0 ? 7 + 5 * Math.sin(S.t * 60) : 0; }

  // applied inside the world transform: punch zoom around the point of interest
  function zoomIn() {
    if (calm() || F.zoom.amp <= 0 || F.zoom.t <= 0) return false;
    const k = F.zoom.t / F.zoom.dur, z = 1 + F.zoom.amp * k * k;
    ctx.translate(F.zoom.x, F.zoom.y); ctx.scale(z, z); ctx.translate(-F.zoom.x, -F.zoom.y);
    return true;
  }

  // under the HUD: groove glow, surge edges, confetti, boss vignette, game over fade
  function drawScreen(g) {
    const gv = g.groove || 0;
    if (gv >= 10 && g.phase !== 'dead') {
      const hot = clamp((gv - 10) / 10, 0, 1), pulse = calm() ? 0.8 : 0.75 + 0.25 * Math.sin(S.t * (5 + hot * 4));
      edges(hot > 0.6 ? '#ffd84d' : '#ff7eb6', (0.16 + 0.24 * hot) * pulse);
      if (hot > 0.6) edges('#ff7eb6', 0.12 * pulse);
    }
    const c = F.card;
    if (c && c.boss) vignette(Math.min(1, c.t / 0.35, (c.dur - c.t) / 0.5) * 0.85, '20,0,12');
    if (F.warnT > 0) {   // surge coming: red edges pulse, a hard flicker on the beat
      const a = calm() ? 0.5 : 0.45 + 0.4 * Math.sin(S.t * 26);
      edges('#ff2850', a * clamp(F.warnT / 0.25, 0, 1) + 0.15);
    }
    if (F.conf.length) {
      for (const p of F.conf) {
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.9 + 0.1);
        ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
    }
    if (F.deadT > 0) {   // game over: the room goes dark and red
      const k = clamp(F.deadT / 1.0, 0, 1), e = easeOut(k);
      ctx.save(); ctx.globalAlpha = 0.72 * e; ctx.fillStyle = '#0a0414'; ctx.fillRect(0, 0, W, H); ctx.restore();
      vignette(0.9 * e, '60,0,16');
    }
  }

  // duo aura at high groove: a pulsing halo with little notes orbiting the pair
  function aura(g) {
    const gv = g.groove || 0; if (gv < 12) return;
    const p = g.p, hot = clamp((gv - 12) / 8, 0, 1), col = hot > 0.7 ? '#ffd84d' : '#ff9ad6';
    const pulse = calm() ? 1 : 1 + 0.08 * Math.sin(S.t * 9);
    glow(p.x, p.y - 20, (150 + hot * 60) * pulse, col, 0.16 + 0.14 * hot);
    const n = 3 + Math.round(hot * 3);
    ctx.save(); ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = (calm() ? 0 : S.t * 2.2) + i * TAU / n, x = p.x + Math.cos(a) * 92, y = p.y - 20 + Math.sin(a) * 52;
      ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(x, y, 6 + hot * 2, 0, TAU); ctx.fill();
      ctx.fillRect(x + 4, y - 22, 3, 22);
    }
    ctx.restore();
  }

  // the title card, drawn on top of the HUD
  function drawCard(g) {
    const c = F.card; if (!c) return;
    const t = c.t, k = t / c.dur, out = clamp((c.dur - t) / 0.4, 0, 1), inn = clamp(t / 0.32, 0, 1);
    const ease = calm() ? 1 : easeOut(inn), cy = H * 0.34;
    ctx.save(); ctx.globalAlpha = out;
    if (c.boss) {
      // dark stripe, red edges, giant crown word slammed in
      const bandH = 300, hh = bandH * (calm() ? 1 : ease);
      ctx.fillStyle = 'rgba(24,2,16,.82)'; ctx.fillRect(0, cy - hh / 2, W, hh);
      ctx.fillStyle = '#ff4d7a'; ctx.fillRect(0, cy - hh / 2 - 6, W, 6); ctx.fillRect(0, cy + hh / 2, W, 6);
      const slam = clamp((t - 0.15) / 0.35, 0, 1), sc = calm() ? 1 : 3 - 2 * easeOut(slam);
      ctx.save(); ctx.globalAlpha *= calm() ? 1 : slam; ctx.translate(W / 2, cy - 18); ctx.scale(sc, sc);
      if (c.slammed || calm()) glow(0, 0, 340, '#ff2850', 0.35);
      if (kit && kit.drawHead) { const bob = calm() ? 0 : Math.sin(t * 6) * 4; kit.drawHead(ctx, 0, -116 + bob - (calm() ? 0 : (1 - slam) * 160), 56, Math.PI / 2, { skin: c.skin, boss: true, t: S.t }); }
      text('BOSS', 0, 28, 150, '#ff4d7a', '#1a0210');
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= clamp((t - 0.45) / 0.3, 0, 1); text(c.name, W / 2, cy + 112, 44, '#ffd84d'); if (c.mod) text(c.mod, W / 2, cy + 156, 28, '#ffc2dc'); ctx.restore();
    } else {
      // a band sweeps in from the left, the species portrait pops, name and twist slide in
      const bandH = 230, sx = calm() ? 0 : (1 - ease) * -W;
      ctx.save(); ctx.translate(sx, 0);
      const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(8,6,24,.0)'); gr.addColorStop(0.12, 'rgba(8,6,24,.82)'); gr.addColorStop(0.88, 'rgba(8,6,24,.82)'); gr.addColorStop(1, 'rgba(8,6,24,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, cy - bandH / 2, W, bandH);
      const sp = kit && kit.SPECIES && kit.SPECIES[c.skin], col = sp ? sp.base : '#ff7eb6';
      ctx.fillStyle = col; ctx.globalAlpha *= 0.9; ctx.fillRect(40, cy - bandH / 2, W - 80, 4); ctx.fillRect(40, cy + bandH / 2 - 4, W - 80, 4); ctx.restore();
      // portrait
      const pk = calm() ? 1 : clamp((t - 0.12) / 0.4, 0, 1), ps = calm() ? 1 : backOut(pk);
      if (pk > 0 && kit && kit.drawHead) { ctx.save(); ctx.globalAlpha *= pk; glow(132, cy, 190, col, 0.5); kit.drawHead(ctx, 132, cy + (calm() ? 0 : Math.sin(t * 5) * 3), 78 * ps, Math.PI / 2, { skin: c.skin, boss: false, t: S.t }); ctx.restore(); }
      // words
      const tk = calm() ? 1 : easeOut(clamp((t - 0.22) / 0.4, 0, 1)), tx = 250 + (calm() ? 0 : (1 - tk) * 90);
      ctx.save(); ctx.globalAlpha *= tk;
      text('STAGE ' + c.n, tx, cy - 62, 36, '#9fb4ff', '#0b1020', 'left');
      { let fs = c.name.length > 11 ? 56 : 68; ctx.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; const room = W - 24 - 250, wide = ctx.measureText(c.name).width; if (wide > room) fs = Math.max(30, Math.floor(fs * room / wide));   // long serpent names shrink to fit the band
        text(c.name, tx, cy - 8, fs, '#ffffff', '#0b1020', 'left'); }
      if (c.mod) { const mk = calm() ? 1 : clamp((t - 0.5) / 0.3, 0, 1); ctx.globalAlpha *= mk; text(c.mod, tx, cy + 64, 30, '#ffd24a', '#0b1020', 'left'); }
      ctx.restore();
    }
    ctx.restore();
    void k; void g;
  }

  return { onEvent, update, timeScale, rumble, zoomIn, aura, drawScreen, drawCard, state: F };
}
