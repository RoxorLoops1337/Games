// 04-hit-juice (round 2): golden upgrade orbs that fly to the upgrade counter, bomb debris and smoke,
// capsule muzzle flash and note trails. Own small pools with hard caps. Render-only: never touches the sim.
const TAU = Math.PI * 2;
export const UP_X = 42, UP_Y = 40;   // the upgrade counter in the HUD (hud.js)

export function createHitJuice({ ctx, S, OPT, glow, ring, burst, shaped }) {
  const orbs = [], smoke = [], trail = [], flashes = [];
  S.land = S.land || { coin: -9, up: -9 };
  const calm = () => OPT.reduceMotion;
  const cap = n => (OPT.lowQuality ? n >> 1 : n);

  function event(e, g) {
    if (calm()) return;
    switch (e.t) {
      case 'kill':
        if (e.kind === 'upgrade' && orbs.length < 6)
          orbs.push({ x0: e.x, y0: e.y, cx: e.x + (e.x < 360 ? 90 : -90), cy: Math.max(e.y, 260) + 60, t: 0, dur: 0.75, lastTrail: 0 });
        break;
      case 'boom': {
        const x = e.x, y = e.y, R = e.r || 150;
        ring(x, y, R * 1.15, '#fff2c8', 0.35);
        ring(x, y, R * 0.8, '#ff9a3d', 0.55);
        shaped(x, y, 12, 'c', ['#3a2a2a', '#6b4a3a', '#ff9a3d', '#ffd24a'], 520, 1.0, 9, 900);
        for (let i = 0; i < 7 && smoke.length < cap(14); i++) {
          const a = Math.random() * TAU, d = Math.random() * R * 0.45;
          smoke.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 30, vy: -40 - Math.random() * 50, r: 34 + Math.random() * 24, life: 1.0 + Math.random() * 0.5, max: 1.5, dark: Math.random() < 0.5 });
        }
        S.rings.push({ x, y, r: R * 1.3, life: 0.4, max: 0.4, col: '#ffb347', glow: true });
        break;
      }
      case 'shoot': {
        const p = g.p;
        if (flashes.length < 4) flashes.push({ x: p.x, y: p.y - 40, t: 0, dur: 0.12 });
        for (let i = 0; i < 3 && trail.length < cap(56); i++) trail.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y - 44, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, life: 0.35, max: 0.35, s: 3 + Math.random() * 2, n: false });
        break;
      }
    }
  }

  // note trails behind the flying capsules (called from drawBullets with the live bullet list)
  function bullets(list, dt) {
    if (calm()) return;
    for (let i = 0; i < list.length && trail.length < cap(56); i++) {
      const b = list[i]; if (b.kind && b.kind !== 'pill') continue;
      if (Math.random() < dt * (b.crit ? 26 : 12)) trail.push({ x: b.x + (Math.random() - 0.5) * 10, y: b.y + 18, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 30, life: b.crit ? 0.55 : 0.4, max: b.crit ? 0.55 : 0.4, s: b.crit ? 7 : 5, n: Math.random() < 0.35, col: b.crit ? '#ffe14a' : '#9fefff' });
    }
  }

  function draw(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const q = smoke[i]; q.life -= dt; if (q.life <= 0) { smoke.splice(i, 1); continue; }
      const k = 1 - q.life / q.max; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96;
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.4) * 0.6; ctx.fillStyle = q.dark ? '#6e6478' : '#b9aebf';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + k), 0, TAU); ctx.fill();
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const q = trail[i]; q.life -= dt; if (q.life <= 0) { trail.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; const a = q.life / q.max;
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = q.col || '#9fefff';
      if (q.n) { const s = q.s; ctx.beginPath(); ctx.ellipse(q.x, q.y, s * 0.7, s * 0.5, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(q.x + s * 0.4, q.y - s * 1.6, 1.8, s * 1.7); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.s * a, 0, TAU); ctx.fill(); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.t += dt; if (f.t >= f.dur) { flashes.splice(i, 1); continue; }
      const k = f.t / f.dur; glow(f.x, f.y, 62 * (1 - k * 0.4), '#bff6ff', 0.85 * (1 - k));
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff'; ctx.translate(f.x, f.y); ctx.beginPath(); ctx.moveTo(0, -34 * (1 - k)); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), m = 1 - e;
      const x = m * m * o.x0 + 2 * m * e * o.cx + e * e * UP_X, y = m * m * o.y0 + 2 * m * e * o.cy + e * e * UP_Y;
      if (k >= 1) { orbs.splice(i, 1); S.land.up = S.t; ring(UP_X, UP_Y, 70, '#ffd84d', 0.4); burst(UP_X, UP_Y, 10, ['#ffd84d', '#fff1a8', '#fff'], 200, 0.4, 4); continue; }
      o.lastTrail += dt;
      if (o.lastTrail > 0.03 && trail.length < 56) { o.lastTrail = 0; trail.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, s: 9, n: false, col: '#ffd84d' }); }
      glow(x, y, 46, '#ffd84d', 0.8);
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(x, y, 9 * (1 - k * 0.3), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { event, bullets, draw, pools: { orbs, smoke, trail, flashes } };
}

// 1 at rest; right after a landing it pops and settles over 0.38s: the HUD takes the max with its own bounce
export function landBounce(S, key) {
  const k = Math.max(0, 1 - (S.t - (S.land ? S.land[key] : -9)) / 0.38);
  return k > 0 ? 1 + 0.5 * k * k + Math.sin(k * 3) * 0.05 : 1;
}
