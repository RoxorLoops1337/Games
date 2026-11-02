// 04-hit-juice (round 2): golden upgrade orbs that fly to the upgrade counter, bomb debris and smoke,
// capsule muzzle flash and note trails. Own small pools with hard caps. Render-only: never touches the sim.
import { pointAt } from './sim.js';
const TAU = Math.PI * 2;
export const UP_X = 42, UP_Y = 40, CHIP_X = 620;   // CHIP_X: the RAGE and SHIELD chips (hud.js) sit at the right edge
const H = 1280;   // the upgrade counter in the HUD (hud.js)

export function createHitJuice({ ctx, S, OPT, glow, ring, burst, shaped, text, blit, sprite, sound }) {
  const powers = [], chipfly = [], orbs = [], smoke = [], trail = [], flashes = [], marks = [];
  const lastKill = { x: 0, y: 0, t: -9, n: 0 };   // for the chain links
  const lastHit = { x: 0, y: 0, t: -9, src: '' };   // the latest hit, so a kill can pop in the style of the weapon that landed it
  const lastSrc = {};   // per weapon: time of its last impact mark, so a busy fight does not drown in them
  const CHAIN_COL = ['#ffffff', '#9dff6d', '#6fe3ff', '#ffd84d', '#ff9ad6', '#ff6a3d'];
  const POW_COL = { heal: '#ff6a8a', shield: '#39d0ff', rage: '#ffb020' };
  const DARK = { swab: '#8a2a62', daggers: '#2a4f78', tower: '#7a3a0c', stick: '#6a5a00', needles: '#0e5a6a', satellite: '#2a3a8a', maw: '#4a2a8a', puppy: '#7a4a10', encore: '#7a6a00' };
  const TINT = { swab: '#ffd0ea', daggers: '#e8f4ff', tower: '#ffc98a', stick: '#fff08a', needles: '#a8f0ff', satellite: '#b6c8ff', maw: '#d9b2ff', puppy: '#ffe0b0', encore: '#fff2a0' };
  const tint = src => TINT[src] || null;
  function mark(m) { if (marks.length < cap(28)) marks.push(m); }
  S.land = S.land || { coin: -9, up: -9 }; S.land.rage = S.land.rage || -9; S.land.shield = S.land.shield || -9;
  const calm = () => OPT.reduceMotion;
  const cap = n => (OPT.lowQuality ? n >> 1 : n);

  function event(e, g) {
    if (calm()) return;
    switch (e.t) {
      case 'hit': lastHit.x = e.x; lastHit.y = e.y; lastHit.t = S.t; lastHit.src = e.src || ''; impact(e); break;
      case 'kill': {
        // a white flash disc and a starburst of rays where the cell was; heads get a bigger one
        const R = (e.r || 26) * (e.head ? 2.6 : 1.7);
        mark({ k: 'flash', x: e.x, y: e.y, r: R, t: 0, dur: e.head ? 0.3 : 0.2 });
        mark({ k: 'rays', x: e.x, y: e.y, r: R * 1.5, n: e.head ? 10 : 6, rot: Math.random() * TAU, t: 0, dur: e.head ? 0.34 : 0.24 });
        if (S.t - lastHit.t < 0.12 && Math.abs(lastHit.x - e.x) < 90 && Math.abs(lastHit.y - e.y) < 90) killPop(lastHit.src, e.x, e.y, R);
        // kill chain: a glowing link from the previous kill and a note that climbs with the pitch ladder
        { const n = S.t - lastKill.t < 0.9 ? lastKill.n + 1 : 1, col = CHAIN_COL[Math.min(5, n >> 1)];
          if (n >= 2) { mark({ k: 'link', x: lastKill.x, y: lastKill.y, x1: e.x, y1: e.y, t: 0, dur: 0.3, col, w: 3 + Math.min(n, 12) * 0.4 });
            mark({ k: 'note', x: e.x + 20, y: e.y - 6, r: 11 + Math.min(n, 14), t: 0, dur: 0.55, col, vy: -70 - Math.min(n, 14) * 6, vx: (n & 1 ? 1 : -1) * 18 }); }
          lastKill.x = e.x; lastKill.y = e.y; lastKill.t = S.t; lastKill.n = n; }
        if (e.kind === 'upgrade') {   // the yellow cell pops hard: gold rays, a fat ring and a UP badge that rises
          mark({ k: 'rays', x: e.x, y: e.y, r: 170, n: 12, rot: 0.2, t: 0, dur: 0.5, gold: 1 });
          if (S.floats.length < 56) S.floats.push({ x: e.x, y: e.y - 36, str: 'UPGRADE!', acc: 0, key: 'badge', col: '#ffe14a', size: 26, vy: -46, life: 1.0, max: 1.0, pop: 1 });
        }
        break;
      }
    }
    switch (e.t) {
      case 'kill':
        if (e.kind === 'upgrade' && orbs.length < 6)
          orbs.push({ x0: e.x, y0: e.y, cx: e.x + (e.x < 360 ? 90 : -90), cy: Math.max(e.y, 260) + 60, t: 0, dur: 0.75, lastTrail: 0 });
        break;
      case 'power':   // the power-up hops up out of the pile and flies into the duo
        if (powers.length < 4 && sprite) powers.push({ x0: e.x, y0: e.y, kind: e.kind, p: g.p, t: 0, dur: 0.42, lastTrail: 0 });
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

  // kill pop variety: the weapon that landed the last hit also decides how the cell bursts
  function killPop(src, x, y, R) {
    switch (src) {
      case 'swab': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.random(); mark({ k: 'puff', x, y, r: 13, t: 0, dur: 0.5, col: i & 1 ? '#fff' : '#ffc4e4', vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 20 }); } break;
      case 'daggers': { const a = -0.8 + (Math.random() - 0.5) * 0.4; mark({ k: 'slash', x, y, r: R * 1.3, rot: a, t: 0, dur: 0.22, col: '#eaf6ff' }); mark({ k: 'slash', x, y, r: R * 1.3, rot: a + 1.6, t: 0, dur: 0.22, col: '#eaf6ff' }); break; }
      case 'tower': mark({ k: 'ring', x, y, r: R * 1.5, t: 0, dur: 0.34, col: '#ffb15a' }); mark({ k: 'ring', x, y, r: R * 0.95, t: 0, dur: 0.26, col: '#fff2c8' }); break;
      case 'stick': for (let i = 0; i < 3; i++) mark({ k: 'zap', x, y, r: R * 0.9, rot: i * 1.05 + Math.random() * 0.5, t: 0, dur: 0.2, col: i & 1 ? '#fff' : '#fff08a', seed: Math.random() * 9 }); break;
      case 'needles': for (let i = 0; i < 8; i++) mark({ k: 'ping', x, y, r: 30, rot: i / 8 * TAU, t: 0, dur: 0.24, col: '#a8f0ff' }); break;
      case 'satellite': mark({ k: 'ring', x, y, r: R * 1.4, t: 0, dur: 0.3, col: '#9db4ff' }); mark({ k: 'ring', x, y, r: R * 0.8, t: 0, dur: 0.38, col: '#fff' }); break;
      case 'maw': mark({ k: 'ring', x, y, r: R * 1.7, t: 0, dur: 0.38, col: '#c79bff', inv: 1 }); mark({ k: 'ring', x, y, r: R * 1.1, t: 0, dur: 0.3, col: '#e8d4ff', inv: 1 }); break;
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
        case 'link': { ctx.translate(-m.x, -m.y); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = m.col; ctx.lineWidth = m.w * (0.5 + a); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x1, m.y1); ctx.stroke(); ctx.globalAlpha = a * a; ctx.strokeStyle = '#fff'; ctx.lineWidth = m.w * 0.35; ctx.stroke(); break; }
        case 'note': { ctx.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); ctx.rotate(Math.sin(m.t * 9) * 0.25); const s = m.r; ctx.fillStyle = '#10131c'; ctx.strokeStyle = '#10131c'; ctx.lineWidth = 3;
          for (let pass = 0; pass < 2; pass++) { if (pass) { ctx.fillStyle = m.col; } ctx.beginPath(); ctx.ellipse(0, s * 0.5, s * 0.5, s * 0.36, -0.4, 0, TAU); if (!pass) ctx.stroke(); ctx.fill(); ctx.beginPath(); ctx.rect(s * 0.26, -s * 0.9, s * 0.2, s * 1.4); ctx.rect(s * 0.26, -s * 0.9, s * 0.7, s * 0.3); if (!pass) ctx.stroke(); ctx.fill(); }
          break; }
        case 'rays': { ctx.rotate(m.rot); ctx.fillStyle = m.gold ? '#ffe27a' : '#fff6c8'; const r0 = m.r * 0.25 + k * m.r * 0.35, r1 = m.r * (0.55 + k * 0.45);
          for (let j = 0; j < m.n; j++) { ctx.rotate(TAU / m.n); ctx.beginPath(); ctx.moveTo(r0, -2.4 * a - 0.6); ctx.lineTo(r1, 0); ctx.lineTo(r0, 2.4 * a + 0.6); ctx.closePath(); ctx.fill(); } break; }
        case 'pow': { ctx.rotate(m.rot); ctx.fillStyle = m.col; const r1 = m.r * (0.5 + k * 0.6), r0 = r1 * 0.3;
          ctx.beginPath(); for (let j = 0; j < m.n * 2; j++) { const rr = j & 1 ? r0 : r1, aa = (j / (m.n * 2)) * TAU; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.closePath(); ctx.fill(); break; }
        case 'puff': ctx.translate((m.vx || 0) * m.t, (m.vy || 0) * m.t); ctx.fillStyle = m.col; ctx.beginPath(); ctx.arc(0, 0, m.r * (0.8 + k * 0.9), 0, TAU); ctx.fill(); break;
        case 'slash': { ctx.rotate(m.rot); const L = m.r * (0.6 + k * 0.6); ctx.strokeStyle = m.col; ctx.lineCap = 'round'; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke(); ctx.lineWidth = 1.5; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.moveTo(-L * 0.6, 7); ctx.lineTo(L * 0.7, 7); ctx.stroke(); break; }
        case 'ring': ctx.strokeStyle = m.col; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(0, 0, m.r * (m.inv ? 1 - k * 0.75 : 0.3 + k * 0.7), 0, TAU); ctx.stroke(); break;
        case 'zap': { ctx.rotate(m.rot); ctx.strokeStyle = m.col; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.beginPath(); const n = 5; for (let j = 0; j <= n; j++) { const xx = -m.r + (j / n) * m.r * 2, yy = j === 0 || j === n ? 0 : Math.sin(m.seed * 3 + j * 2.1 + Math.floor(m.t * 40)) * 9; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); break; }
        case 'sigh': { // a broken chain: two links part and sink, a grey "x7" droops under them
          ctx.translate(-m.x, -m.y); ctx.lineCap = 'round'; ctx.strokeStyle = '#10131c'; const d = 10 + k * 30, fall = k * k * 56, tw = k * 0.5;
          for (let side = -1; side <= 1; side += 2) { ctx.save(); ctx.translate(m.x + side * d, m.y + fall * (side > 0 ? 1.25 : 0.8)); ctx.rotate(side * (0.3 + tw));
            ctx.lineWidth = 10; ctx.strokeStyle = '#10131c'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 13, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = side < 0 ? '#c4cbd8' : '#9aa3b4'; ctx.stroke(); ctx.restore(); }
          ctx.globalAlpha = Math.min(1, a * 1.6); text('x' + m.n, m.x, m.y + 38 + k * 26, 28, '#aab2c4', '#10131c');
          ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#c4cbd8'; for (let j = 0; j < 3; j++) { const q = Math.min(1, k * 2.2 - j * 0.3); if (q > 0) { ctx.beginPath(); ctx.arc(m.x + 26 + j * 9, m.y - 14 - j * 7 - k * 14, 3.2 - j * 0.7, 0, TAU); ctx.fill(); } }
          break; }
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

  // the dash telegraph dims the field under the cells and lights the lane the snake is about to take
  function under(g) {
    if (!g || !g.snakes) return;
    let k = 0, lead = null;
    for (let si = 0; si < g.snakes.length; si++) { const sn = g.snakes[si]; if (sn.surge === 'warn') { const w = 1 - Math.max(0, sn.surgeT) / 0.6; if (w >= k) { k = w; lead = sn; } } else if (sn.surge === 'go' && k < 0.9) { k = 0.9; lead = sn; } }
    if (!lead || !lead.path) return;
    const h = lead.segs[0]; if (!h) return;
    ctx.save(); ctx.globalAlpha = 0.34 * Math.min(1, k * 1.6); ctx.fillStyle = '#0a0414'; ctx.fillRect(-200, -200, 1400, 1900); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const w = h.r * 2 + 18; ctx.beginPath(); let n = 0;
    for (let d = 0; d < 720 && n < 26; d += 30, n++) { const p = pointAt(lead.path, h.ps + d); if (n === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    ctx.globalAlpha = 0.16 * Math.min(1, k * 1.5); ctx.strokeStyle = '#ff2a4d'; ctx.lineWidth = w; ctx.stroke();
    ctx.globalAlpha = 0.2 * Math.min(1, k * 1.5); ctx.strokeStyle = '#ff8aa0'; ctx.lineWidth = 3; ctx.setLineDash([14, 14]); ctx.lineDashOffset = calm() ? 0 : -S.t * 120; ctx.stroke();
    ctx.restore();
  }

  // coins on their way to the counter leave a few sparkles (called by the renderer per flying coin)
  function coinSpark(x, y, k) {
    if (calm() || trail.length >= cap(56) || Math.random() > 0.5) return;
    trail.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: 0, vy: 0, life: 0.28, max: 0.28, s: 5 - 2 * k, n: false, col: '#ffe27a' });
  }
  function coinLand(x, y) { if (calm()) return; ring(x, y, 34, '#ffd24a', 0.25); }


  // crit badge outlines, one silhouette per weapon so a crit reads as "whose" before you read the number
  const CRIT_COL = { capsule: ['#ff8a1a', '#ffd23a'], swab: ['#ff6fae', '#ffd0ea'], daggers: ['#3a7ac8', '#e8f4ff'], tower: ['#d9640c', '#ffc98a'], stick: ['#d6b400', '#fff08a'], needles: ['#14a0b8', '#b8f6ff'], satellite: ['#4a5ee0', '#c6d2ff'], maw: ['#7a3ad8', '#e0c6ff'], puppy: ['#c8741c', '#ffe0b0'], encore: ['#d8b400', '#fff2a0'] };
  function critPath(src, R, sy) {
    ctx.beginPath();
    switch (src) {
      case 'swab': for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.arc(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.62, R * 0.3, 0, TAU); } break;
      case 'daggers': { const L = R * 1.25, w = R * 0.26; ctx.moveTo(0, -L); ctx.lineTo(w, -w); ctx.lineTo(L, 0); ctx.lineTo(w, w); ctx.lineTo(0, L); ctx.lineTo(-w, w); ctx.lineTo(-L, 0); ctx.lineTo(-w, -w); ctx.closePath(); break; }
      case 'tower': for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.52; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.86); } ctx.closePath(); break;
      case 'stick': { const pts = [[0.2, -1.1], [0.45, -0.25], [1.1, -0.45], [0.5, 0.15], [0.75, 1], [-0.1, 0.35], [-0.95, 0.6], [-0.4, -0.1], [-0.8, -0.8], [-0.1, -0.35]]; for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0] * R, pts[i][1] * R * 0.85); ctx.closePath(); break; }
      case 'needles': for (let i = 0; i < 16; i++) { const rr = i & 1 ? R * 0.34 : R * 1.05, a = (i / 16) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9); } ctx.closePath(); break;
      case 'satellite': ctx.ellipse(0, 0, R * 0.95, R * 0.76, 0, 0, TAU); break;
      case 'maw': for (let i = 0; i < 24; i++) { const rr = i & 1 ? R * 0.74 : R * 1.0, a = (i / 24) * TAU; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); } ctx.closePath(); break;
      default: for (let i = 0; i < 16; i++) { const rr = i & 1 ? R * 0.62 : R, a = (i / 16) * TAU; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); } ctx.closePath();
    }
  }

  // styled floating numbers: crit = starburst badge and tilt, heavy hits = weapon coloured outline, chain = pill, badge = upgrade ribbon
  function float(f) {
    if (!text) return false;
    const k = f.pop > 0 ? 1 + 0.3 * f.pop : 1;
    if (f.crit) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.src === 'daggers' ? -0.5 : f.src === 'stick' ? 0.1 : -0.1);
      const R = f.size * 1.5 * k, fade = Math.min(1, f.life / 0.3), cs = CRIT_COL[f.src] || CRIT_COL.capsule;
      ctx.globalAlpha = 0.92 * fade; ctx.fillStyle = cs[0]; critPath(f.src, R, 1); ctx.fill();
      ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = cs[1]; critPath(f.src, R * 0.8, 1); ctx.fill();
      if (f.src === 'satellite' || f.src === 'tower') { ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; critPath(f.src, R * 0.9, 1); ctx.stroke(); }
      if (f.src === 'daggers') ctx.rotate(0.5);
      ctx.globalAlpha = fade; text(f.str, 0, 0, Math.round(f.size * k / 2) * 2, '#fff', '#a8330a'); ctx.restore(); return true;
    }
    if (f.key === 'chain') {
      const sz = Math.round(f.size * k / 2) * 2, w = sz * (String(f.str).length * 0.62 + 1.3), h = sz * 1.15;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.sin(f.life * 12) * 0.05);
      ctx.fillStyle = 'rgba(16,19,28,.82)'; ctx.strokeStyle = f.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, h / 2) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      text(f.str, 0, 1, sz, f.col); ctx.restore(); return true;
    }
    if (f.key === 'badge') {
      const sz = Math.round(f.size * k / 2) * 2;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(-0.06); text(f.str, 0, 0, sz, '#fff3a0', '#8a5a00'); ctx.restore(); return true;
    }
    if (f.key && f.size >= 20) { text(f.str, f.x, f.y, Math.round(f.size * k / 2) * 2, f.col, DARK[f.src] || '#10131c'); return true; }
    return false;
  }

  // the streak ends: a run of 5+ kills that stops for a beat leaves a sad broken chain where the last cell fell
  let sighFor = -1;
  function sighCheck() {
    const ch = S.chain; if (!ch || ch.n < 5 || ch.t === sighFor || S.t - ch.t < 0.95 || S.t - ch.t > 2) return;
    sighFor = ch.t; if (sound) sound('sigh');
    if (calm()) return;
    mark({ k: 'sigh', x: lastKill.x, y: lastKill.y, n: ch.n, t: 0, dur: 0.95 });
    S.slump = { t: S.t, n: ch.n };   // the pets droop and a small sad trombone answers
  }

  function draw(dt, g) {
    sighCheck();
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
    for (let i = powers.length - 1; i >= 0; i--) {
      const o = powers[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), tx = o.p.x, ty = o.p.y - 52;
      const col = POW_COL[o.kind] || '#ffd24a';
      if (k >= 1) {
        powers.splice(i, 1); ring(tx, ty, 80, col, 0.4); ring(tx, ty, 120, '#fff', 0.25);
        if (o.kind === 'heal') shaped(tx, ty, 6, 'h', ['#ff6a8a', '#ffc4d2', '#fff'], 230, 0.8, 9, -120);
        else if (o.kind === 'rage') { burst(tx, ty, 14, ['#ffb020', '#ff6a3d', '#fff2a0'], 320, 0.5, 5); S.flash = Math.max(S.flash, 0.12); S.flashCol = '#ffb020'; }
        else burst(tx, ty, 12, ['#39d0ff', '#bff6ff', '#fff'], 260, 0.5, 4);
        if ((o.kind === 'rage' || o.kind === 'shield') && chipfly.length < 3) chipfly.push({ x0: tx, y0: ty, kind: o.kind, t: 0, dur: 0.55, lastTrail: 0 });   // the power-up's icon then flies on to its timer chip
        continue;
      }
      const x = o.x0 + (tx - o.x0) * e, y = o.y0 + (ty - o.y0) * e - Math.sin(k * Math.PI) * 70;
      o.lastTrail += dt;
      if (o.lastTrail > 0.025 && trail.length < cap(56)) { o.lastTrail = 0; trail.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: 0, vy: 0, life: 0.32, max: 0.32, s: 8, n: false, col }); }
      glow(x, y, 54 * (1 - k * 0.3), col, 0.8); ctx.globalAlpha = 1;
      blit(sprite(o.kind), x, y, 92 * (1 + 0.35 * Math.sin(k * Math.PI)) * (1 - k * 0.55), k * 6.28 * 0.5);
    }
    for (let i = chipfly.length - 1; i >= 0; i--) {
      const o = chipfly[i]; o.t += dt; const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k), col = POW_COL[o.kind];
      const tx = CHIP_X, ty = H - (o.kind === 'rage' ? 153 : 113) - (S.chipB || 0);
      if (k >= 1) { chipfly.splice(i, 1); S.land[o.kind] = S.t; ring(tx, ty, 70, col, 0.4); burst(tx, ty, 10, [col, '#fff2a0', '#fff'], 200, 0.4, 4); continue; }
      const x = o.x0 + (tx - o.x0) * e + Math.sin(k * Math.PI) * -50, y = o.y0 + (ty - o.y0) * e - Math.sin(k * Math.PI) * 60;
      o.lastTrail += dt;
      if (o.lastTrail > 0.03 && trail.length < cap(56)) { o.lastTrail = 0; trail.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, s: 7, n: false, col }); }
      glow(x, y, 40, col, 0.8); ctx.globalAlpha = 1;
      if (sprite) blit(sprite(o.kind), x, y, 64 * (1 - k * 0.45), k * 6.28);
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

  return { event, bullets, draw, tint, under, float, coinSpark, coinLand, pools: { chipfly, powers, orbs, smoke, trail, flashes, marks } };
}

// 1 at rest; right after a landing it pops and settles over 0.38s: the HUD takes the max with its own bounce
export function landBounce(S, key) {
  const k = Math.max(0, 1 - (S.t - (S.land ? S.land[key] : -9)) / 0.38);
  return k > 0 ? 1 + 0.5 * k * k + Math.sin(k * 3) * 0.05 : 1;
}
