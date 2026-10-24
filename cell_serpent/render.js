// Canvas renderer. Reads the sim state, never changes it. Uses sprites from art.js
// where they exist and draws procedural stand-ins otherwise.
import { W, H, isBossStage } from './sim.js';
import { INK } from './art_draw.js';

const TAU = Math.PI * 2;
const num = v => { v = Math.ceil(v); return v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v); };

export function createRenderer(canvas, art, kit) {
  const ctx = canvas.getContext('2d');
  const S = { particles: [], floats: [], rings: [], trauma: 0, flash: 0, flashCol: '#fff', banner: null, t: 0, specks: [], hurtT: 0, popped: 0, lastShot: -9 };
  for (let i = 0; i < 26; i++) S.specks.push({ i, x: Math.random() * W, y: Math.random() * H, r: 26 + Math.random() * 70, v: 4 + Math.random() * 10, a: Math.random() * TAU });
  S.petals = [];
  for (let i = 0; i < 22; i++) S.petals.push({ x: Math.random() * W, y: Math.random() * H, s: 6 + Math.random() * 7, v: 18 + Math.random() * 26, a: Math.random() * TAU, rot: 0.4 + Math.random(), c: i % 3 ? '#ff9ac6' : '#ffe0ee' });
  const layout = () => {
    const cw = canvas.width, ch = canvas.height, s = Math.min(cw / W, ch / H);
    return { cw, ch, s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
  };

  // duo images only come from art (PNG); everything else is the drawing kit
  function img(key, x, y, w, h, rot = 0, alpha = 1) {
    const im = art && art.get(key);
    if (!im) return false;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); return true;
  }
  const blit = (spr, x, y, size, rot, flip, a) => kit && kit.blit(ctx, spr, x, y, size, rot, flip, a);
  function flashBlit(spr, x, y, size, rot, a) {
    if (!spr || a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; blit(spr, x, y, size, rot, false, Math.min(0.8, a)); ctx.restore();
  }
  function glow(x, y, r, col, a = 0.6) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  function text(str, x, y, size, fill = '#fff', stroke = '#10131c', align = 'center') {
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.2); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  // -------------------------------------------------- events -> particles
  function burst(x, y, n, cols, sp = 220, life = 0.6, size = 5) {
    for (let i = 0; i < n && S.particles.length < 420; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.8);
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.5 + Math.random()), col: cols[(Math.random() * cols.length) | 0] });
    }
  }
  const ring = (x, y, r, col, life = 0.4) => S.rings.push({ x, y, r, life, max: life, col });
  const addFloat = (x, y, str, col, size, vy = -70) => { if (S.floats.length < 60) S.floats.push({ x, y, str, col, size, vy, life: 0.7, max: 0.7 }); };

  function onEvent(e, g) {
    switch (e.t) {
      case 'hit':
        S.popped++;
        if (e.crit || S.popped % 2 === 0) addFloat(e.x + (Math.random() - 0.5) * 20, e.y - 10, num(e.d), e.crit ? '#ffe14a' : '#ffffff', e.crit ? 26 : 17);
        burst(e.x, e.y, e.crit ? 5 : 2, e.crit ? ['#ffe14a', '#fff'] : ['#fff', '#b9f3ff'], 160, 0.3, 3);
        break;
      case 'kill': {
        const sk = e.skin === 'purple' ? ['#b7a2ff', '#6a4cd6', '#fff'] : ['#ff9ad6', '#e0489d', '#fff'];
        burst(e.x, e.y, e.head ? 40 : 14, e.kind === 'minion' ? ['#9dff6d', '#fff', '#39f0ff'] : sk, e.head ? 360 : 240, 0.7, 6);
        ring(e.x, e.y, e.r * 2.4, '#fff', 0.35);
        if (e.head) { S.trauma = Math.min(1, S.trauma + 0.5); }
        break;
      }
      case 'boom': ring(e.x, e.y, e.r, '#ff6a3d', 0.5); ring(e.x, e.y, e.r * 0.6, '#ffd24a', 0.35); burst(e.x, e.y, 30, ['#ff6a3d', '#ffd24a', '#fff'], 420, 0.6, 7); S.trauma = Math.min(1, S.trauma + 0.55); break;
      case 'splash': ring(e.x, e.y, e.r, '#7dff5e', 0.25); break;
      case 'hurt': S.trauma = Math.min(1, S.trauma + 0.6); S.flash = 0.35; S.flashCol = '#ff2a4d'; burst(e.x, e.y, 16, ['#ff2a4d', '#ff8aa0'], 300, 0.5, 5); addFloat(e.x, e.y - 30, '-' + Math.ceil(e.d), '#ff5a78', 28, -90); break;
      case 'block': ring(e.x, e.y, 46, '#39d0ff', 0.3); break;
      case 'power': ring(e.x, e.y, 60, e.kind === 'heal' ? '#ff6a8a' : e.kind === 'shield' ? '#39d0ff' : '#ffd24a', 0.5); addFloat(g.p.x, g.p.y - 60, e.kind === 'heal' ? 'HEAL' : e.kind === 'shield' ? 'SHIELD' : 'RAGE', '#fff', 26, -60); break;
      case 'coin': if (S.floats.length < 40) addFloat(g.p.x + 20, g.p.y - 40, '+' + Math.max(1, Math.round(e.v * g.p.coinMul)), '#ffd24a', 15, -50); break;
      case 'levelup': S.flash = 0.4; S.flashCol = '#9dff6d'; ring(g.p.x, g.p.y, 220, '#9dff6d', 0.6); break;
      case 'stage': S.banner = { text: e.boss ? 'BOSS' : 'STAGE ' + e.n, sub: e.boss ? 'Stage ' + e.n : '', t: 0, dur: 1.8, boss: e.boss }; if (e.boss) S.trauma = 0.6; break;
      case 'clear': S.banner = { text: 'STAGE CLEAR', sub: '+' + e.bonus + ' coins', t: 0, dur: 2.2, clear: true }; break;
      case 'roar': S.trauma = Math.min(1, S.trauma + 0.35); break;
      case 'revive': S.flash = 0.6; S.flashCol = '#fff'; ring(g.p.x, g.p.y, 300, '#fff', 0.8); break;
      case 'shoot': S.lastShot = S.t; break;
      case 'dead': S.trauma = 1; burst(g.p.x, g.p.y, 50, ['#fff', '#ff6a8a', '#39f0ff'], 420, 1, 7); break;
    }
  }

  // -------------------------------------------------- world pieces
  function drawBg(g, L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0924'; ctx.fillRect(0, 0, L.cw, L.ch);
    ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
    const gr = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, H * 0.78);
    gr.addColorStop(0, '#2b2260'); gr.addColorStop(0.55, '#1a1445'); gr.addColorStop(1, '#0d0924');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // bokeh stage lights
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const sp of S.specks) {
      const y = (sp.y + S.t * sp.v) % (H + 120) - 60, x = sp.x + Math.sin(S.t * 0.3 + sp.a) * 16, hue = sp.i % 3;
      ctx.globalAlpha = 0.07 + 0.03 * Math.sin(S.t + sp.a); ctx.fillStyle = hue === 0 ? '#ff7eb6' : hue === 1 ? '#6fe3ff' : '#ffd84d';
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // drifting cherry petals and notes
    for (const p of S.petals) {
      const y = (p.y + S.t * p.v) % (H + 80) - 40, x = p.x + Math.sin(S.t * 0.8 + p.a) * 30;
      ctx.save(); ctx.translate(x, y); ctx.rotate(S.t * p.rot + p.a); ctx.globalAlpha = 0.5;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    const v = ctx.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(0.2, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,126,182,.55)'; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(111,227,255,.6)'; ctx.strokeRect(10, 10, W - 20, H - 20);
  }

  function drawSnake(g, sn) {
    const segs = sn.segs, p = g.p;
    for (let i = segs.length - 1; i >= 0; i--) {   // tail first so the head sits on top
      const s = segs[i], prev = segs[i - 1], r = s.r;
      const ang = i === 0 ? sn.ang : Math.atan2(prev.y - s.y, prev.x - s.x);
      if (i === 0) {
        if (kit) { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1; kit.drawHead(ctx, s.x, s.y, r * 1.14, ang, { skin: sn.skin, boss: sn.boss, t: S.t + sn.id, look: [dx / d, dy / d], flash: s.flash }); }
        else { ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
        text(num(s.hp), s.x, s.y - r * 1.55, 24, '#fff', INK);
        continue;
      }
      const bob = 1 + Math.sin(S.t * 6 - i * 0.5) * 0.03;
      const upright = s.kind === 'armor' || s.kind === 'bomb' || s.kind === 'spitter';
      if (s.kind === 'bomb') { const pulse = 0.5 + Math.sin(S.t * 9 + i) * 0.5; glow(s.x, s.y, r * 1.8, '#ff3b5c', 0.15 + pulse * 0.25); }
      if (s.kind === 'gold') glow(s.x, s.y, r * 1.9, '#ffd24a', 0.35);
      const spr = kit && kit.SPR.body(sn.skin, sn.boss, s.kind === 'normal' ? '' : s.kind);
      if (spr) {
        const size = r * 3.9 * bob;
        blit(spr, s.x, s.y, size, upright ? 0 : ang);
        if (s.flash > 0) flashBlit(spr, s.x, s.y, size, upright ? 0 : ang, s.flash * 5);
        if (s.kind === 'bomb') { const f = 0.6 + Math.sin(S.t * 18 + i) * 0.4; sparkleAt(s.x + r * 0.1, s.y - r * 1.2, r * 0.3 * f); }
        if (s.kind === 'gold') sparkleAt(s.x + r * 0.5 + Math.sin(S.t * 4 + i) * 4, s.y - r * 0.5, r * 0.28);
      } else { ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
      text(num(s.hp), s.x, s.y + r * 0.05, Math.max(12, r * 0.64), '#fff', INK);
    }
    if (sn.slow > 0) { const h = segs[0]; glow(h.x, h.y, h.r * 2, '#7fe8ff', 0.3); }
  }
  function sparkleAt(x, y, r) { if (kit) { ctx.save(); ctx.translate(x, y); ctx.scale(r / 20, r / 20); kit.sparkle(ctx, 0, 0, 20); ctx.restore(); } }

  function drawMinion(m) {
    const bob = Math.sin(S.t * 8 + m.ph) * 3, size = m.r * 6.4;
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(m.x, m.y + m.r * 1.1, m.r * 0.9, m.r * 0.3, 0, 0, TAU); ctx.fill(); ctx.restore();
    const spr = kit && kit.SPR.minion(m.type.art), rot = Math.sin(S.t * 5 + m.ph) * 0.08;
    if (spr) { blit(spr, m.x, m.y + bob, size, rot, m.vx < -5); if (m.flash > 0) flashBlit(spr, m.x, m.y + bob, size, rot, m.flash * 5); }
    else { ctx.fillStyle = '#9dff6d'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); ctx.stroke(); }
    text(num(m.hp), m.x, m.y + m.r * 1.25, 14, '#fff', INK);
  }

  function drawPickup(pk) {
    const k = pk.kind, bob = Math.sin(S.t * 6 + pk.x) * 2;
    if (k === 'gem') { glow(pk.x, pk.y, 22, '#39f0ff', 0.5); blit(kit && kit.SPR.pickup('gem'), pk.x, pk.y + bob, 64, Math.sin(S.t * 3 + pk.x) * 0.25); }
    else if (k === 'coin') { const sq = Math.max(0.3, Math.abs(Math.cos(S.t * 7 + pk.x))); ctx.save(); ctx.translate(pk.x, pk.y + bob); ctx.scale(sq, 1); blit(kit && kit.SPR.pickup('coin'), 0, 0, 58); ctx.restore(); }
    else { const col = k === 'heal' ? '#ff6a8a' : k === 'shield' ? '#39d0ff' : '#ffb020'; glow(pk.x, pk.y, 38, col, 0.6); blit(kit && kit.SPR.pickup(k), pk.x, pk.y + bob * 2, 92, Math.sin(S.t * 4) * 0.12); }
  }

  function drawPlayer(g) {
    const p = g.p;
    if (p.iframes > 0 && Math.floor(S.t * 20) % 2 === 0 && !(p.shield > 0)) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 40, 56, 14, 0, 0, TAU); ctx.fill(); ctx.restore();
    // orbiting spores
    for (let i = 0; i < p.orbit; i++) {
      const a = p.orbAng + (i / p.orbit) * TAU, x = p.x + Math.cos(a) * 74, y = p.y + Math.sin(a) * 74;
      glow(x, y, 26, '#7dff5e', 0.7); ctx.fillStyle = '#c8ff9e'; ctx.strokeStyle = '#2f7a1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // aim tick
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim); ctx.globalAlpha *= 0.55; ctx.fillStyle = '#6fe3ff';
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(22, -6); ctx.lineTo(22, 6); ctx.fill(); ctx.restore();
    const singing = S.t - S.lastShot < 0.22;
    const key = singing ? 'duo_sing' : 'duo_idle';
    const sq = 1 + Math.sin(S.t * 9) * 0.025 * (Math.hypot(p.mx, p.my) > 0.1 ? 2 : 1);
    const im = art && art.get(key);
    if (im) { const h = 170, w = h * im.width / im.height; img(key, p.x, p.y - 26, w / sq, h * sq, p.mx * 0.05); }
    else { glow(p.x, p.y, 40, '#39f0ff', 0.7); ctx.fillStyle = '#39f0ff'; ctx.strokeStyle = '#06323f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill(); ctx.stroke(); }
    // hitbox core: the part that actually gets hurt
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff5a78'; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 3.5, 0, TAU); ctx.fill();
    if (p.shield > 0) { ctx.strokeStyle = `rgba(80,210,255,${0.5 + Math.sin(S.t * 10) * 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 54, 0, TAU); ctx.stroke(); glow(p.x, p.y, 60, '#39d0ff', 0.25); }
    if (p.rage > 0) glow(p.x, p.y, 70, '#ffb020', 0.3 + Math.sin(S.t * 14) * 0.1);
    ctx.globalAlpha = 1;
  }

  function drawBullets(g) {
    for (const b of g.bullets) {
      const col = b.crit ? '#ffd84d' : '#6fe3ff';
      glow(b.x, b.y, b.crit ? 30 : 20, col, 0.55);
      const spr = kit && kit.SPR.note(b.crit);
      if (spr) blit(spr, b.x, b.y, b.crit ? 104 : 84, S.t * 6 + b.x * 0.05);
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, TAU); ctx.fill(); }
    }
    for (const b of g.ebullets) {
      glow(b.x, b.y, b.r * 2.6, '#7dff5e', 0.5);
      const spr = kit && kit.SPR.acid();
      if (spr) blit(spr, b.x, b.y, b.r * 4.6, Math.sin(S.t * 8 + b.x) * 0.3);
      else { ctx.fillStyle = '#7dff5e'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
    }
  }

  function drawFx(dt) {
    for (let i = S.rings.length - 1; i >= 0; i--) {
      const r = S.rings[i]; r.life -= dt; if (r.life <= 0) { S.rings.splice(i, 1); continue; }
      const k = 1 - r.life / r.max; ctx.save(); ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = r.col; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * k), 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const q = S.particles[i]; q.life -= dt; if (q.life <= 0) { S.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94;
      ctx.globalAlpha = q.life / q.max; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + 0.6 * q.life / q.max), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = S.floats.length - 1; i >= 0; i--) {
      const f = S.floats[i]; f.life -= dt; if (f.life <= 0) { S.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; ctx.globalAlpha = Math.min(1, f.life / 0.3); text(f.str, f.x, f.y, f.size, f.col);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(g, ui) {
    const p = g.p, pad = 22;
    // XP bar
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, 14);
    const gx = ctx.createLinearGradient(0, 0, W, 0); gx.addColorStop(0, '#1ad9ff'); gx.addColorStop(1, '#9dff6d');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, W * Math.min(1, g.xp / g.xpNeed), 14);
    text('LV ' + g.level, pad, 38, 22, '#fff', '#0b1020', 'left');
    // stage + snake health
    text(isBossStage(g.stage) ? 'BOSS  ' + g.stage : 'STAGE ' + g.stage, W / 2, 38, 28, isBossStage(g.stage) ? '#ff7a9a' : '#fff');
    const bw = 360, bx = W / 2 - bw / 2, by = 62, frac = g.stageHpMax ? Math.max(0, g.stageHp / g.stageHpMax) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 20);
    ctx.fillStyle = isBossStage(g.stage) ? '#ff3d6e' : '#e0489d'; ctx.fillRect(bx, by, bw * frac, 14);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx - 3, by - 3, bw + 6, 20);
    // coins
    blit(kit && kit.SPR.pickup('coin'), W - pad - 172, 38, 52); text(String(Math.floor(g.coins)), W - pad - 152, 38, 24, '#ffd24a', '#0b1020', 'left');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(W - 40, 38, 24, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(W - 48, 28, 6, 20); ctx.fillRect(W - 36, 28, 6, 20);
    // player hp
    const hx = pad, hy = H - 46, hw = 250;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(hx - 3, hy - 3, hw + 6, 26);
    const hf = Math.max(0, p.hp / p.maxHp); ctx.fillStyle = hf > 0.35 ? '#5df08a' : '#ff4d6d'; ctx.fillRect(hx, hy, hw * hf, 20);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.strokeRect(hx - 3, hy - 3, hw + 6, 26);
    text(`${Math.ceil(p.hp)} / ${p.maxHp}`, hx + hw / 2, hy + 10, 16);
    blit(kit && kit.SPR.pickup('heal'), hx + 6, hy - 26, 56);
    if (p.shield > 0) text('SHIELD ' + p.shield.toFixed(0), W - pad, H - 78, 18, '#7fe8ff', '#0b1020', 'right');
    if (p.rage > 0) text('RAGE ' + p.rage.toFixed(0), W - pad, H - 50, 18, '#ffd24a', '#0b1020', 'right');
    if (g.combo > 2 && g.t - g.lastKill < 2.2) text('COMBO x' + g.combo, W / 2, 112, 24 + Math.min(10, g.combo * 0.3), '#ffe14a');
    // joystick
    if (ui && ui.joy && ui.joy.on) {
      const j = ui.joy; ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(j.x, j.y, 70, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(j.x + j.dx * 70, j.y + j.dy * 70, 28, 0, TAU); ctx.fill(); ctx.restore();
    }
    // banner
    const b = S.banner;
    if (b) {
      const k = b.t / b.dur, a = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1, sc = 0.8 + Math.min(1, k * 5) * 0.2;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.36); ctx.scale(sc, sc);
      text(b.text, 0, 0, b.boss ? 96 : 76, b.boss ? '#ff4d7a' : b.clear ? '#9dff6d' : '#fff');
      if (b.sub) text(b.sub, 0, 70, 34, '#ffd24a'); ctx.restore();
    }
  }

  function draw(g, ui, dt) {
    const L = layout();
    S.t += dt; if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.dur) S.banner = null; }
    S.trauma = Math.max(0, S.trauma - dt * 1.6); S.flash = Math.max(0, S.flash - dt * 1.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBg(g, L);
    const sh = S.trauma * S.trauma * 22;
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    for (const pk of g.pickups) drawPickup(pk);
    for (const sn of g.snakes) drawSnake(g, sn);
    for (const m of g.minions) drawMinion(m);
    if (g.phase !== 'dead') drawPlayer(g);
    drawBullets(g);
    drawFx(dt);
    ctx.restore();
    if (S.flash > 0) { ctx.save(); ctx.globalAlpha = S.flash * 0.5; ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    // low-hp vignette
    if (g.p.hp / g.p.maxHp < 0.3 && g.phase !== 'dead') { const a = 0.18 + Math.sin(S.t * 6) * 0.08; const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7); gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, `rgba(255,0,40,${a})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
    if (ui) drawHud(g, ui);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { draw, onEvent, layout, state: S, toGame(px, py) { const L = layout(); return { x: (px - L.ox) / L.s, y: (py - L.oy) / L.s }; } };
}
