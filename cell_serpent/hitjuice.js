// 04-hit-juice (round 2): golden upgrade orbs that fly to the upgrade counter, bomb debris and smoke,
// capsule muzzle flash and note trails. Own small pools with hard caps. Render-only: never touches the sim.
import { pointAt } from './sim.js';
const TAU = Math.PI * 2;
export const UP_X = 42, UP_Y = 40;   // the upgrade counter in the HUD (hud.js)

export function createHitJuice({ ctx, S, OPT, glow, ring, burst, shaped }) {
  const orbs = [], smoke = [], trail = [], flashes = [], marks = [];
  const lastSrc = {};   // per weapon: time of its last impact mark, so a busy fight does not drown in them
  const TINT = { swab: '#ffd0ea', daggers: '#e8f4ff', tower: '#ffc98a', stick: '#fff08a', needles: '#a8f0ff', satellite: '#b6c8ff', maw: '#d9b2ff', puppy: '#ffe0b0', encore: '#fff2a0' };
  const tint = src => TINT[src] || null;
  function mark(m) { if (marks.length < cap(28)) marks.push(m); }
  S.land = S.land || { coin: -9, up: -9 };
  const calm = () => OPT.reduceMotion;
  const cap = n => (OPT.lowQuality ? n >> 1 : n);

  function event(e, g) {
    if (calm()) return;
    switch (e.t) {
      case 'hit': impact(e); break;
      case 'kill': {
        // a white flash disc and a starburst of rays where the cell was; heads get a bigger one
        const R = (e.r || 26) * (e.head ? 2.6 : 1.7);
        mark({ k: 'flash', x: e.x, y: e.y, r: R, t: 0, dur: e.head ? 0.3 : 0.2 });
        mark({ k: 'rays', x: e.x, y: e.y, r: R * 1.5, n: e.head ? 10 : 6, rot: Math.random() * TAU, t: 0, dur: e.head ? 0.34 : 0.24 });
        break;
      }
    }
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

  // a small mark per weapon where it lands: cotton puffs, slash lines, zaps, pings, rings
  function impact(e) {
    const src = e.src || 'capsule';
    if (S.t - (lastSrc[src] || -9) < (src === 'capsule' ? 0.05 : 0.09) && !e.crit) return;
    lastSrc[src] = S.t;
    const x = e.x, y = e.y, big = e.crit ? 1.5 : 1;
    switch (src) {
      case 'swab': for (let i = 0; i < 4; i++) mark({ k: 'puff', x: x + (Math.random() - 0.5) * 26, y: y + (Math.random() - 0.5) * 20, r: 9 * big, t: 0, dur: 0.38, col: i & 1 ? '#fff' : '#ffc4e4', vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 30 }); break;
      case 'daggers': mark({ k: 'slash', x, y, r: 40 * big, rot: -0.9 + (Math.random() - 0.5) * 0.5, t: 0, dur: 0.17, col: '#eaf6ff' }); break;
      case 'tower': mark({ k: 'ring', x, y, r: 54 * big, t: 0, dur: 0.26, col: '#ffb15a' }); mark({ k: 'flash', x, y, r: 26 * big, t: 0, dur: 0.14 }); break;
      case 'stick': mark({ k: 'zap', x, y, r: 34 * big, rot: Math.random() * TAU, t: 0, dur: 0.16, col: '#fff08a', seed: Math.random() * 9 }); break;
      case 'needles': for (let i = 0; i < 3; i++) mark({ k: 'ping', x, y, r: 22 * big, rot: -Math.PI / 2 + (i - 1) * 0.7, t: 0, dur: 0.18, col: '#a8f0ff' }); break;
      case 'satellite': mark({ k: 'ring', x, y, r: 38 * big, t: 0, dur: 0.24, col: '#9db4ff' }); break;
      case 'maw': mark({ k: 'ring', x, y, r: 46 * big, t: 0, dur: 0.3, col: '#c79bff' }); break;
      default: mark({ k: 'pow', x, y, r: (e.crit ? 34 : 20), n: e.crit ? 8 : 4, rot: Math.random() * TAU, t: 0, dur: e.crit ? 0.22 : 0.14, col: e.crit ? '#ffe14a' : '#ffffff' });
    }
  }

  function drawMarks(dt) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]; m.t += dt; if (m.t >= m.dur) { marks.splice(i, 1); continue; }
      const k = m.t / m.dur, a = 1 - k;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(m.x, m.y);
      switch (m.k) {
        case 'flash': glow(0, 0, m.r * (0.7 + k * 0.6), '#fff', 0.9 * a); ctx.fillStyle = '#fff'; ctx.globalAlpha = a * a; ctx.beginPath(); ctx.arc(0, 0, m.r * 0.35 * (1 - k * 0.5), 0, TAU); ctx.fill(); break;
        case 'rays': { ctx.rotate(m.rot); ctx.fillStyle = '#fff6c8'; const r0 = m.r * 0.25 + k * m.r * 0.35, r1 = m.r * (0.55 + k * 0.45);
          for (let j = 0; j < m.n; j++) { ctx.rotate(TAU / m.n); ctx.beginPath(); ctx.moveTo(r0, -2.4 * a - 0.6); ctx.lineTo(r1, 0); ctx.lineTo(r0, 2.4 * a + 0.6); ctx.closePath(); ctx.fill(); } break; }
        case 'pow': { ctx.rotate(m.rot); ctx.fillStyle = m.col; const r1 = m.r * (0.5 + k * 0.6), r0 = r1 * 0.3;
          ctx.beginPath(); for (let j = 0; j < m.n * 2; j++) { const rr = j & 1 ? r0 : r1, aa = (j / (m.n * 2)) * TAU; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.closePath(); ctx.fill(); break; }
        case 'puff': ctx.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); ctx.fillStyle = m.col; ctx.beginPath(); ctx.arc(0, 0, m.r * (0.8 + k * 0.9), 0, TAU); ctx.fill(); break;
        case 'slash': { ctx.rotate(m.rot); const L = m.r * (0.6 + k * 0.6); ctx.strokeStyle = m.col; ctx.lineCap = 'round'; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke(); ctx.lineWidth = 1.5; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.moveTo(-L * 0.6, 7); ctx.lineTo(L * 0.7, 7); ctx.stroke(); break; }
        case 'ring': ctx.strokeStyle = m.col; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(0, 0, m.r * (0.3 + k * 0.7), 0, TAU); ctx.stroke(); break;
        case 'zap': { ctx.rotate(m.rot); ctx.strokeStyle = m.col; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.beginPath(); const n = 5; for (let j = 0; j <= n; j++) { const xx = -m.r + (j / n) * m.r * 2, yy = j === 0 || j === n ? 0 : Math.sin(m.seed * 3 + j * 2.1 + Math.floor(m.t * 40)) * 9; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); break; }
        case 'ping': { ctx.rotate(m.rot); ctx.strokeStyle = m.col; ctx.lineWidth = 2; ctx.lineCap = 'round'; const a0 = m.r * (0.3 + k * 0.9); ctx.beginPath(); ctx.moveTo(0, -a0); ctx.lineTo(0, -a0 - m.r * 0.7 * a); ctx.stroke(); break; }
      }
      ctx.restore();
    }
  }

  // the dash telegraph: while a snake winds up (0.6s) red chevrons flow along the path in front of its head and a ring
  // closes in on it; during the dash it leaves streaks behind it. Reduce motion: steady, no flicker.
  function drawSurge(g) {
    if (!g || !g.snakes) return;
    for (let si = 0; si < g.snakes.length; si++) {
      const sn = g.snakes[si]; if (sn.surge !== 'warn' && sn.surge !== 'go') continue;
      const h = sn.segs[0]; if (!h || h.y < -30 || !sn.path) continue;
      const warn = sn.surge === 'warn', k = warn ? 1 - Math.max(0, sn.surgeT) / 0.6 : 1, still = calm();
      const pulse = still ? 0.8 : 0.65 + 0.35 * Math.sin(S.t * (warn ? 26 : 18));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (warn) {
        glow(h.x, h.y, h.r * (3.2 - k * 1.2), '#ff2a4d', 0.35 + 0.4 * k * pulse);
        ctx.globalAlpha = 0.3 + 0.6 * k; ctx.strokeStyle = '#ff5a78'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (2.6 - 1.4 * k), 0, TAU); ctx.stroke();
        const flow = still ? 0 : (S.t * 3) % 1;
        for (let i = 0; i < 6; i++) {
          const d = 40 + (i + flow) * 44, p = pointAt(sn.path, h.ps + d), q = pointAt(sn.path, h.ps + d + 10);
          if (p.y < -20 || p.y > 900) continue;
          const ang = Math.atan2(q.y - p.y, q.x - p.x), fade = (1 - i / 7) * (0.7 + 0.3 * k);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.globalAlpha = fade * pulse;
          ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-8, -15); ctx.lineTo(8, 0); ctx.lineTo(-8, 15);
          ctx.strokeStyle = 'rgba(40,4,16,.55)'; ctx.lineWidth = 12; ctx.stroke();
          ctx.strokeStyle = i & 1 ? '#ff3d5a' : '#ff8aa0'; ctx.lineWidth = 7; ctx.stroke(); ctx.restore();
        }
      } else {
        glow(h.x, h.y, h.r * 2.8, '#ff2a4d', 0.3 * pulse);
        ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const d = 26 + i * 30, p = pointAt(sn.path, h.ps - d), q = pointAt(sn.path, h.ps - d - 18);
          if (p.y < -20) continue;
          ctx.globalAlpha = (1 - i / 5) * 0.7; ctx.strokeStyle = i < 2 ? '#fff2f5' : '#ff5a78'; ctx.lineWidth = Math.max(2, h.r * 0.5 * (1 - i / 6));
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.restore();
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

  function draw(dt, g) {
    drawSurge(g);
    drawMarks(dt);
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

  return { event, bullets, draw, tint, pools: { orbs, smoke, trail, flashes, marks } };
}

// 1 at rest; right after a landing it pops and settles over 0.38s: the HUD takes the max with its own bounce
export function landBounce(S, key) {
  const k = Math.max(0, 1 - (S.t - (S.land ? S.land[key] : -9)) / 0.38);
  return k > 0 ? 1 + 0.5 * k * k + Math.sin(k * 3) * 0.05 : 1;
}
