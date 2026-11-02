// Whole-screen feedback for the run: stage title card, boss intro, surge warning, groove edge glow,
// duo aura, slow-motion + zoom punch, victory confetti and the game over fade.
// Reads events and the sim state, never changes the sim. render.js owns the canvas and passes helpers in.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const backOut = t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const CONFETTI = ['#ff7eb6', '#ffd84d', '#6fe3ff', '#9dff6d', '#c9a0ff', '#ffffff'];

export function createScreenFx({ ctx, W, H, kit, art, text, glow, S, OPT, ring, burst }) {
  const F = {
    card: null,                       // the stage title card
    slow: { t: 0, dur: 0, k: 1 },     // slow motion: real seconds left, length, sim speed at the deepest point
    zoom: { t: 0, dur: 0.4, amp: 0, x: W / 2, y: H / 2 },
    conf: [],
    stop: 0, stopAt: -9,
    flour: null,
    deadT: 0, warnT: 0, clutchT: 0,
    clear: null,
    sounds: [],
    beatFn: null,
    mile: null, go: null, mileDone: 0, lastBoss: false, ph: '', cc: null, p2: null, p2Done: false, perf: 0,   // milestone ribbon, GO! pop, stage progress milestones already shown
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
        F.mileDone = 0; F.mile = null; F.go = null; F.lastBoss = boss; F.p2 = null; F.p2Done = false; F.cc = null; F.perf = 0;
        F.card = { n: e.n, boss, name: e.name || '', mod: e.mod || '', skin: g.skin, t: 0, dur: boss ? 2.9 : 2.3, slammed: false };
        F.deadT = 0;
        break;
      }
      case 'hit':   // boss face taken a hit: a tiny freeze, at most 4 times a second
        if (!calm() && e.s && e.s.isHead && g.snakes.some(sn => sn.boss) && S.t - F.stopAt > 0.25) { F.stop = Math.max(F.stop, 0.03); F.stopAt = S.t; }
        break;
      case 'chain':
        if (!calm() && (e.n === 10 || e.n === 25)) F.flour = { n: e.n, t: 0, dur: e.n === 25 ? 1.5 : 1.2 };
        break;
      case 'kill':
        if (e.head && !calm()) { F.stop = Math.max(F.stop, e.boss ? 0.09 : 0.055); F.stopAt = S.t; }
        if (e.head) punch(e.x, e.y, e.boss ? 0.09 : 0.05, e.boss ? 0.28 : 0.4, e.boss ? 0.55 : 0.32);
        break;
      case 'clutch': F.clutchT = 0.55; if (!calm()) { S.trauma = Math.min(1, S.trauma + 0.3); if (!F.cc || F.cc.t > 0.35) { punch(e.x, e.y, 0.06, 0.45, 0.4); F.cc = { t: 0, dur: 1, x: clamp(e.x, 380, W - 380) }; } } break;   // close call: a cell died right at the line
      case 'won': startClear(g); break;
      case 'clear': confetti(e.boss ? 110 : 70); S.flash = Math.max(S.flash, 0.25); S.flashCol = '#ffe9a8'; break;
      case 'dead': punch(g.p.x, g.p.y, 0.07, 0.3, 0.6); F.deadT = 0.0001; break;
      case 'revive': F.deadT = 0; break;
      case 'checkpoint': showMile(e.k === 2 ? 50 : 25, g); break;
      case 'levelup': if (!calm()) { S.flash = Math.max(S.flash, 0.35); S.flashCol = '#fff3b8'; ring(g.p.x, g.p.y - 20, 260, '#ffd84d', 0.5); ring(g.p.x, g.p.y - 20, 150, '#fff', 0.4); } break;   // the song pauses for the cards: a gold flash
      case 'surgewarn': F.warnT = 0.7; break;
    }
  }

  // sim speed multiplier (1 = normal). main.js multiplies the fixed step clock by this.
  function timeScale() {
    if (calm()) return 1;
    if (F.stop > 0) return 0.02;   // hit-stop: the sim holds still for a few frames
    if (F.slow.t <= 0) return 1;
    const k = F.slow.t / F.slow.dur;   // 1 -> 0, hold the low point then ease back out
    return 1 - (1 - F.slow.k) * Math.min(1, k * 3);
  }

  // ---- stage clear card: STAGE CLEAR under the confetti, the earned stars pop in one by one before the result screen
  const STAR_T = [0.55, 1.0, 1.45];
  function starsOf(g) { return !g.mode && !g.hard ? 1 + (g.revivesUsed === 0 && !g.revived ? 1 : 0) + (g.faceMax < 0.8 ? 1 : 0) : 0; }
  function startClear(g) {
    const stars = starsOf(g); if (!stars) return;
    F.clear = { boss: F.lastBoss, n: g.stage, stars, t: 0, shown: 0, dur: calm() ? 1.3 : STAR_T[2] + 0.95 };
  }
  function starPath(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function updateClear(dt) {
    const c = F.clear; if (!c) return;
    c.t += dt;
    for (let i = c.shown; i < 3; i++) {
      if (!(calm() ? c.t > 0.2 : c.t >= STAR_T[i])) break;
      c.shown = i + 1;
      if (i < c.stars) {
        F.sounds.push('star' + (i + 1));
        if (!calm()) { const x = W / 2 + (i - 1) * 190, y = H * 0.47; ring(x, y, 150 + i * 30, '#ffd84d', 0.5); burst(x, y, 14 + i * 6, ['#ffd84d', '#fff', '#ff9ad6'], 420, 0.7, 6); if (i === 2 && c.stars === 3) { confetti(80); S.trauma = Math.min(1, S.trauma + 0.45); F.perf = 0.0001; S.flash = Math.max(S.flash, 0.4); S.flashCol = '#fff3b8'; ring(W / 2, H * 0.47, 420, '#fff', 0.6); } }
      }
    }
    if (c.t > c.dur) F.clear = null;
  }
  function drawClear() {
    const c = F.clear; if (!c) return;
    const t = c.t, out = clamp((c.dur - t) / 0.35, 0, 1), inn = calm() ? 1 : easeOut(clamp(t / 0.3, 0, 1)), cy = H * 0.4;
    ctx.save(); ctx.globalAlpha = out;
    if (F.perf > 0) perfectBehind(cy + 80);
    const bh = 420 * inn;
    const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(8,6,24,0)'); gr.addColorStop(0.1, 'rgba(8,6,24,.8)'); gr.addColorStop(0.9, 'rgba(8,6,24,.8)'); gr.addColorStop(1, 'rgba(8,6,24,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, cy - bh / 2, W, bh);
    ctx.fillStyle = '#ffd84d'; ctx.fillRect(60, cy - bh / 2, W - 120, 4); ctx.fillRect(60, cy + bh / 2 - 4, W - 120, 4);
    const sc = calm() ? 1 : 1.5 - 0.5 * backOut(clamp(t / 0.4, 0, 1));
    ctx.save(); ctx.globalAlpha *= calm() ? 1 : clamp(t / 0.2, 0, 1); ctx.translate(W / 2, cy - 120); ctx.scale(sc, sc);
    if (c.boss) { glow(0, 20, 380, '#ff4d7a', 0.3); text('BOSS ' + c.n, 0, -40, 40, '#ff9ab8', '#1a0210'); text('DOWN!', 0, 40, 112, '#ffd84d', '#3a1c00'); }
    else { text('STAGE ' + c.n, 0, -40, 40, '#9fb4ff', '#0b1020'); text('CLEAR!', 0, 40, 112, '#ffd84d', '#3a1c00'); }
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const x = W / 2 + (i - 1) * 190, y = cy + 80 - (i === 1 ? 18 : 0), big = i === 1 ? 1.2 : 1, got = i < c.stars;
      const age = t - (calm() ? 0.2 : STAR_T[i]);
      if (c.shown <= i || age < 0) { ctx.save(); ctx.globalAlpha *= 0.35; starPath(x, y, 66 * big); ctx.lineWidth = 6; ctx.strokeStyle = '#8a8fb0'; ctx.setLineDash([10, 10]); ctx.stroke(); ctx.restore(); continue; }
      if (!got) { ctx.save(); ctx.globalAlpha *= 0.5; starPath(x, y, 66 * big); ctx.fillStyle = '#2a2d44'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#59607f'; ctx.stroke(); ctx.restore(); continue; }
      const pk = calm() ? 1 : backOut(clamp(age / 0.35, 0, 1)), rot = calm() ? 0 : (1 - clamp(age / 0.4, 0, 1)) * -0.9;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(pk, pk);
      glow(0, 0, 150 * big, '#ffd84d', 0.45 * (calm() ? 0.6 : 1));
      starPath(0, 0, 70 * big); ctx.fillStyle = '#ffd84d'; ctx.fill(); ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.strokeStyle = '#9a5a00'; ctx.stroke();
      starPath(0, -4, 36 * big); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.restore();
    }
    if (F.perf > 0) perfectBanner(cy + 300);
    ctx.restore();
  }
  // 3 stars: a slow gold sunburst behind the stars and a PERFECT! ribbon under them
  function perfectBehind(y) {
    const k = clamp(F.perf / 0.5, 0, 1), spin = calm() ? 0 : F.perf * 0.35;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(W / 2, y); ctx.rotate(spin);
    ctx.fillStyle = '#ffd84d'; ctx.globalAlpha *= 0.16 * k;
    for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.9, -52); ctx.lineTo(W * 0.9, 52); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function perfectBanner(y) {
    const a = F.perf, inn = calm() ? 1 : backOut(clamp(a / 0.4, 0, 1)), sh = calm() ? 0 : clamp(1 - (a - 0.35) / 0.9, 0, 1);
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(inn, inn); ctx.rotate(-0.04);
    glow(0, 0, 280, '#ffd84d', 0.3);
    text('PERFECT!', 0, 0, 96, '#fff6c9', '#7a3a00');
    if (sh > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sh * 0.5; text('PERFECT!', 0, 0, 96 + 10 * sh, '#ffd84d'); }
    ctx.restore();
  }

  // ---- boss second verse: halfway down the boss, the music changes and the boss gets a spotlight moment
  function startP2(g) {
    if (F.p2Done) return; F.p2Done = true; F.p2 = { t: 0, dur: 2.1 };
    F.sounds.push('bossintro');
    if (calm()) return;
    S.flash = Math.max(S.flash, 0.5); S.flashCol = '#ffb0c8'; S.trauma = Math.min(1, S.trauma + 0.7);
    let head = null; for (const sn of g.snakes) if (sn.boss) for (const q of sn.segs) if (q.isHead && (!head || q.y > head.y)) head = q;
    const hx = head ? head.x : W / 2, hy = head ? head.y : H * 0.3;
    punch(hx, hy, 0.08, 0.35, 0.7);
    ring(hx, hy, 300, '#ff4d7a', 0.6); ring(hx, hy, 180, '#ffd84d', 0.5); burst(hx, hy, 20, ['#ff4d7a', '#ffd84d', '#fff'], 480, 0.7, 7);
  }
  function drawP2() {
    const o = F.p2; if (!o) return;
    const t = o.t, inn = calm() ? 1 : backOut(clamp(t / 0.35, 0, 1)), out = clamp((o.dur - t) / 0.4, 0, 1), cy = H * 0.27;
    ctx.save(); ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(24,2,16,.8)'; ctx.fillRect(0, cy - 90 * Math.min(1, inn), W, 180 * Math.min(1, inn));
    ctx.fillStyle = '#ff4d7a'; ctx.fillRect(0, cy - 94 * Math.min(1, inn), W, 5); ctx.fillRect(0, cy + 89 * Math.min(1, inn), W, 5);
    ctx.translate(W / 2, cy - 10); ctx.scale(inn, inn); ctx.rotate(-0.03);
    glow(0, 0, 300, '#ff2850', 0.3);
    text('SECOND VERSE!', 0, 0, 76, '#ffd84d', '#2a0310');
    text('the boss means it now', 0, 62, 32, '#ffc2dc', '#2a0310');
    ctx.restore();
  }

  // ---- milestone ribbon: 25% / 50% / 75% of the serpent popped, a gold ribbon slides across the upper lane
  const MILE = { 25: ['QUARTER DOWN!', 'keep the beat going'], 50: ['HALFWAY!', 'chest incoming'], 75: ['ALMOST THERE!', 'finish the song'] };
  function showMile(pct, g) {
    if (F.mileDone >= pct) return;
    if (F.lastBoss && pct === 50) { F.mileDone = 50; startP2(g); return; }
    F.mileDone = pct; const m = MILE[pct];
    F.mile = { pct, txt: m[0], sub: m[1], t: 0, dur: 1.7 };
    F.sounds.push(pct === 75 ? 'star3' : 'star2');
    if (!calm()) { ring(W / 2, H * 0.27, 240, '#ffd84d', 0.5); burst(W / 2, H * 0.27, 14, ['#ffd84d', '#fff', '#ff9ad6'], 420, 0.7, 6); if (pct === 75) confetti(24); }
    void g;
  }
  // a small pie that fills to the milestone, drawn left of the words
  function piePath(x, y, r, frac) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.closePath(); }
  function drawMile() {
    const m = F.mile; if (!m) return;
    const t = m.t, inn = calm() ? 1 : easeOut(clamp(t / 0.3, 0, 1)), out = clamp((m.dur - t) / 0.35, 0, 1), cy = H * 0.27;
    ctx.save(); ctx.globalAlpha = out;
    const sx = calm() ? 0 : (1 - inn) * W, bh = 150;
    ctx.translate(sx, 0);
    const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(40,24,0,0)'); gr.addColorStop(0.14, 'rgba(40,24,6,.86)'); gr.addColorStop(0.86, 'rgba(40,24,6,.86)'); gr.addColorStop(1, 'rgba(40,24,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, cy - bh / 2, W, bh);
    ctx.fillStyle = '#ffd84d'; ctx.fillRect(50, cy - bh / 2, W - 100, 4); ctx.fillRect(50, cy + bh / 2 - 4, W - 100, 4);
    const fill = calm() ? m.pct / 100 : m.pct / 100 * easeOut(clamp((t - 0.15) / 0.6, 0, 1)), px = 150, pr = 46;
    glow(px, cy, 120, '#ffd84d', 0.35);
    ctx.beginPath(); ctx.arc(px, cy, pr, 0, TAU); ctx.fillStyle = '#2a1d3e'; ctx.fill();
    piePath(px, cy, pr - 6, fill); ctx.fillStyle = '#ffd84d'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, cy, pr, 0, TAU); ctx.lineWidth = 7; ctx.strokeStyle = '#fff3b8'; ctx.stroke();
    const pop = calm() ? 1 : 1 + 0.12 * Math.max(0, 1 - (t - 0.2) * 4);
    ctx.save(); ctx.translate(250, cy - 14); ctx.scale(pop, pop);
    text(m.txt, 0, 0, m.txt.length > 12 ? 62 : 74, '#fff6c9', '#3a1c00', 'left'); ctx.restore();
    text(m.sub, 250, cy + 44, 30, '#ffc2dc', '#1a0a2e', 'left');
    ctx.restore();
  }

  function update(dt, g) {
    if (F.clutchT > 0) F.clutchT = Math.max(0, F.clutchT - dt);
    updateClear(dt);
    if (F.stop > 0) F.stop = Math.max(0, F.stop - dt);   // the slow-mo clock waits while frozen
    else if (F.slow.t > 0) F.slow.t = Math.max(0, F.slow.t - dt);
    if (F.flour) { F.flour.t += dt; if (F.flour.t > F.flour.dur) F.flour = null; }
    if (F.zoom.t > 0) F.zoom.t = Math.max(0, F.zoom.t - dt); else F.zoom.amp = 0;
    if (F.warnT > 0) F.warnT -= dt;
    if (F.mile) { F.mile.t += dt; if (F.mile.t > F.mile.dur) F.mile = null; }
    if (F.go) { const o = F.go; o.t += dt; if (o.ready && !o.fired && o.t >= o.ready) { o.fired = true; if (!calm()) { ring(W / 2, H * 0.4, 260, '#9dff6d', 0.5); burst(W / 2, H * 0.4, 16, ['#9dff6d', '#fff', '#ffd84d'], 460, 0.6, 6); } F.sounds.push('star2'); } if (o.t > o.dur) F.go = null; }
    if (g) {   // back from the cards: the song eases back in instead of snapping to full speed
      if (F.ph === 'levelup' && g.phase !== 'levelup' && g.phase !== 'dead' && !calm()) { F.slow = { t: 0.55, dur: 0.55, k: 0.3 }; ring(g.p.x, g.p.y - 20, 200, '#9dff6d', 0.45); }
      F.ph = g.phase;
    }
    if (F.cc) { F.cc.t += dt; if (F.cc.t > F.cc.dur) F.cc = null; }
    if (F.p2) { F.p2.t += dt; if (F.p2.t > F.p2.dur) F.p2 = null; }
    if (F.perf > 0) F.perf += dt;
    if (g && g.phase === 'play' && g.progress >= 0.75 && F.mileDone < 75 && !g.mode) showMile(75, g);
    if (g && g.phase === 'dead' && F.deadT > 0) F.deadT += dt; else if (!g || g.phase !== 'dead') F.deadT = 0;
    const c = F.card;
    if (c) {
      c.t += dt;
      if (c.boss && !c.slammed && c.t > 0.5) {   // the crown lands
        c.slammed = true;
        if (!calm()) { S.flash = Math.max(S.flash, 0.55); S.flashCol = '#ffd0e0'; S.trauma = Math.min(1, S.trauma + 0.85); ring(W / 2, H * 0.36, 280, '#ffd84d', 0.6); ring(W / 2, H * 0.36, 170, '#ff4d7a', 0.45); burst(W / 2, H * 0.36, 26, ['#ffd84d', '#ff4d7a', '#fff'], 520, 0.7, 7); }
      }
      if (c.t > c.dur) { F.card = null; if (!calm() && g && g.phase === 'play') F.go = c.n === 1 && !c.boss ? { t: 0, dur: 1.35, ready: 0.6, boss: false } : { t: 0, dur: 0.7, boss: c.boss }; }
    }
    for (let i = F.conf.length - 1; i >= 0; i--) {
      const p = F.conf[i]; p.life -= dt;
      if (p.life <= 0) { F.conf[i] = F.conf[F.conf.length - 1]; F.conf.pop(); continue; }
      p.vy += 1100 * dt; p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }

  // extra screen shake in game units: a low rumble while a surge is coming
  function rumble() { return calm() ? 0 : (F.warnT > 0 ? 7 + 5 * Math.sin(S.t * 60) : 0) + (F.clutchT > 0 ? 9 * (F.clutchT / 0.55) : 0); }

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
    if (g.phase === 'play') {
      // the screen edges breathe with the music: a soft kick on every beat, redder when the snake is close
      const b = !calm() && F.beatFn ? F.beatFn() : null;
      if (b) { const k = Math.pow(1 - b.phase, 3), dg = g.danger || 0; edges(dg > 0.5 ? '#ff4d7a' : '#6f8cff', (0.05 + 0.08 * Math.min(1, gv / 10) + 0.1 * dg) * k); }
      if (F.clutchT > 0) { const k = clamp(F.clutchT / 0.55, 0, 1) * (calm() ? 0.3 : 1); edges('#ff9a3d', k); edges('#ff4d7a', k * 0.8); }   // close call
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
    if (F.flour) {   // kill chain flourish: a banner slams in over the lane, gold edges, confetti already fired
      const f = F.flour, big = f.n >= 25, k = f.t / f.dur, inn = easeOut(clamp(f.t / 0.22, 0, 1)), out = clamp((1 - k) / 0.3, 0, 1);
      edges(big ? '#ffd84d' : '#6fe3ff', 0.5 * out);
      const sc = calm() ? 1 : (1.9 - 0.9 * inn) * (1 + 0.05 * Math.sin(f.t * 14)), cy = H * 0.5;
      ctx.save(); ctx.globalAlpha = out * inn; ctx.translate(W / 2, cy); ctx.rotate(-0.06); ctx.scale(sc, sc);
      glow(0, 0, big ? 330 : 260, big ? '#ffd84d' : '#6fe3ff', 0.4);
      text(big ? 'BEAT STORM!' : 'NICE GROOVE!', 0, 0, big ? 84 : 70, big ? '#ffd84d' : '#9ff0ff', '#1a0a2e');
      text('x' + f.n + ' CHAIN', 0, 62, 36, '#fff', '#1a0a2e');
      ctx.restore();
    }
    if (F.deadT > 0) {   // game over: the room goes dark and red
      const k = clamp(F.deadT / 1.0, 0, 1), e = easeOut(k);
      ctx.save(); ctx.globalAlpha = 0.72 * e; ctx.fillStyle = '#0a0414'; ctx.fillRect(0, 0, W, H); ctx.restore();
      vignette(0.9 * e, '60,0,16');
      deadScene(g, e);
      deadBanner(g, e);
    }
  }

  // game over: a spotlight finds the slumped duo and a banner says how far the song got
  function spot(x, e) {
    const spr = kit && kit.bake ? kit.bake('deadspot', W, H, g => {
      const gr = g.createLinearGradient(0, -H / 2, 0, H / 2); gr.addColorStop(0, 'rgba(255,240,220,.0)'); gr.addColorStop(0.5, 'rgba(255,240,220,.16)'); gr.addColorStop(1, 'rgba(255,240,220,.32)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-60, -H / 2); g.lineTo(60, -H / 2); g.lineTo(230, H * 0.42); g.lineTo(-230, H * 0.42); g.closePath(); g.fill();
    }, 0.25) : null;
    if (spr) { ctx.save(); ctx.globalAlpha = e; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(spr.c, x - W / 2, 0, W, H); ctx.restore(); }
  }
  function deadBanner(g, e) {
    const t = F.deadT; if (t < 0.35) return;
    const k = calm() ? 1 : backOut(clamp((t - 0.35) / 0.4, 0, 1)), pct = Math.round(clamp(g.progress || 0, 0, 1) * 100), cy = H * 0.3;
    ctx.save(); ctx.globalAlpha = e; ctx.translate(W / 2, cy); ctx.scale(k, k); ctx.rotate(calm() ? 0 : -0.04);
    text('WIPEOUT!', 0, 0, 110, '#ff6a86', '#1a0210');
    ctx.rotate(calm() ? 0 : 0.04);
    text(pct > 0 ? pct + '% of the serpent popped' : 'the serpent got through', 0, 78, 36, '#ffd9e6', '#1a0210');
    ctx.restore();
  }

  // game over: the face that got through grins in the spotlight, the duo slumps and sees stars
  function deadScene(g, e) {
    spot(g.p.x, e);
    let head = null;
    for (const sn of g.snakes) for (const q of sn.segs) if (q.isHead && (!head || q.y > head.y)) head = q;
    if (head && kit && kit.drawHead) {
      const sk = (g.snakes.find(sn => sn.segs.includes(head)) || {}), r = (head.r || 40) * 1.14 * (1 + 0.18 * e);
      glow(head.x, head.y, r * 2.2, '#ff2850', 0.35 * e);
      kit.drawHead(ctx, head.x, head.y, r, Math.PI / 2, { skin: sk.skin, boss: sk.boss, t: S.t, look: [0, 1] });
      const gw = r * 0.5, gy = head.y + r * 0.3, gd = r * 0.4 * (calm() ? 1 : 0.7 + 0.3 * Math.sin(F.deadT * 6));
      ctx.save(); ctx.globalAlpha = e;
      ctx.beginPath(); ctx.moveTo(head.x - gw, gy); ctx.quadraticCurveTo(head.x, gy + gd * 2, head.x + gw, gy); ctx.quadraticCurveTo(head.x, gy + gd * 0.25, head.x - gw, gy); ctx.closePath();
      ctx.fillStyle = '#5a0f2a'; ctx.fill(); ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a0210'; ctx.stroke();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) { const x0 = head.x - gw + (i + 0.15) * gw * 2 / 5, w = gw * 2 / 5 * 0.7; ctx.beginPath(); ctx.moveTo(x0, gy + gd * 0.06); ctx.lineTo(x0 + w, gy + gd * 0.06); ctx.lineTo(x0 + w / 2, gy + gd * 0.5); ctx.fill(); }
      ctx.restore();
    }
    const p = g.p, im = art && art.get && art.get('duo_idle');
    if (im) {
      const h = 170 * (1 - 0.12 * e), w = h * im.width / im.height;
      ctx.save(); ctx.translate(p.x, p.y - 26 + 26 * e); ctx.rotate(0.34 * e); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    }
    // dizzy stars over the slumped duo
    ctx.save(); ctx.globalAlpha = e; ctx.fillStyle = '#ffd84d';
    for (let i = 0; i < 3; i++) { const a = (calm() ? 0 : F.deadT * 3) + i * TAU / 3; starPath(p.x + Math.cos(a) * 52, p.y - 100 + 22 * e + Math.sin(a) * 14, 11); ctx.fill(); }
    ctx.restore();
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

  // a strip of yellow and dark warning stripes that crawls sideways
  function hazard(y, h, t) {
    const step = 44, off = ((calm() ? 0 : t * 90) % (step * 2) + step * 2) % (step * 2);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
    ctx.fillStyle = '#1a0210'; ctx.fillRect(0, y, W, h); ctx.fillStyle = '#ffd84d'; ctx.beginPath();
    for (let x = -step * 2 + off; x < W + step; x += step * 2) { ctx.moveTo(x, y + h); ctx.lineTo(x + step, y + h); ctx.lineTo(x + step + h, y); ctx.lineTo(x + h, y); ctx.closePath(); }
    ctx.fill(); ctx.restore();
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
      hazard(cy - hh / 2 - 22, 16, t); hazard(cy + hh / 2 + 6, 16, -t);
      const slam = clamp((t - 0.15) / 0.35, 0, 1), sc = calm() ? 1 : 3 - 2 * easeOut(slam);
      ctx.save(); ctx.globalAlpha *= calm() ? 1 : slam; ctx.translate(W / 2, cy - 18); ctx.scale(sc, sc);
      if (c.slammed || calm()) glow(0, 0, 340, '#ff2850', 0.35);
      if (kit && kit.drawHead) { const bob = calm() ? 0 : Math.sin(t * 6) * 4; kit.drawHead(ctx, 0, -116 + bob - (calm() ? 0 : (1 - slam) * 160), 56, Math.PI / 2, { skin: c.skin, boss: true, t: S.t }); }
      if (!calm() && c.t < 1.1) { const gx = 9 * Math.max(0, 1 - (t - 0.4) * 1.6) * (c.slammed ? 1 : 0); if (gx > 0.4) { ctx.save(); ctx.globalAlpha *= 0.55; ctx.globalCompositeOperation = 'lighter'; text('BOSS', -gx, 28, 150, '#00e5ff'); text('BOSS', gx, 28, 150, '#ff2850'); ctx.restore(); } }
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
      if (!calm() && t > 0.3 && t < 1.1) {   // a soft light streak sweeps across the band
        const sk = clamp((t - 0.3) / 0.8, 0, 1), x = -120 + (W + 240) * easeOut(sk);
        ctx.save(); ctx.globalAlpha *= 0.16 * Math.sin(sk * Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.moveTo(x, cy - bandH / 2); ctx.lineTo(x + 70, cy - bandH / 2); ctx.lineTo(x - 10, cy + bandH / 2); ctx.lineTo(x - 80, cy + bandH / 2); ctx.closePath(); ctx.fill(); ctx.restore();
      }
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

  function drawGo() {
    const o = F.go; if (!o) return;
    if (o.ready && o.t < o.ready) {   // first stage only: READY? holds for a beat, then GO! pops
      const pop = easeOut(clamp(o.t / 0.18, 0, 1)), a = pop * clamp((o.ready - o.t) / 0.12, 0, 1), sc = 1.5 - 0.5 * pop + (calm() ? 0 : 0.04 * Math.sin(o.t * 22));
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.4); ctx.scale(sc, sc); ctx.rotate(0.04);
      glow(0, 0, 240, '#ffd84d', 0.3); text('READY?', 0, 0, 110, '#ffe27a', '#3a1c00'); ctx.restore(); return;
    }
    const k = (o.t - (o.ready || 0)) / (o.dur - (o.ready || 0)), pop = easeOut(clamp((o.t - (o.ready || 0)) / 0.16, 0, 1)), sc = 1.9 - 0.9 * pop + 0.1 * k, a = clamp((1 - k) / 0.4, 0, 1) * pop;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.4); ctx.scale(sc, sc); ctx.rotate(-0.05);
    glow(0, 0, 260, o.boss ? '#ff2850' : '#9dff6d', 0.35);
    text(o.boss ? 'FIGHT!' : 'GO!', 0, 0, 130, o.boss ? '#ff4d7a' : '#9dff6d', o.boss ? '#1a0210' : '#0b2a10');
    ctx.restore();
  }
  function drawCC() {
    const o = F.cc; if (!o) return;
    const inn = backOut(clamp(o.t / 0.2, 0, 1)), out = clamp((o.dur - o.t) / 0.3, 0, 1), y = H * 0.62 - 30 * easeOut(clamp(o.t / o.dur, 0, 1));
    ctx.save(); ctx.globalAlpha = out; ctx.translate(o.x, y); ctx.scale(inn, inn); ctx.rotate(-0.07);
    glow(0, 0, 200, '#ff9a3d', 0.3); text('CLOSE CALL!', 0, 0, 74, '#ffb454', '#2a0a00');
    ctx.restore();
  }
  function drawCardAll(g) { drawCard(g); drawMile(); drawGo(); drawClear(); drawCC(); drawP2(); }
  return { confetti, onEvent, update, timeScale, rumble, zoomIn, aura, drawScreen, drawCard: drawCardAll, state: F, setBeat(fn) { F.beatFn = fn; }, clearBusy: () => !!F.clear, takeSounds() { return F.sounds.splice(0); } };
}
