// Canvas renderer. Reads the sim state, never changes it. Uses sprites from art.js
// where they exist and draws procedural stand-ins otherwise.
import { W, H, isBossStage, LINE_Y, virusName, daggerPos, stickSeg, uv } from './sim.js';
import { INK, mix } from './art_draw.js';

const TAU = Math.PI * 2;
const num = v => { v = Math.ceil(v); return v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v); };

export function createRenderer(canvas, art, kit) {
  const ctx = canvas.getContext('2d');
  const S = { particles: [], floats: [], rings: [], trauma: 0, flash: 0, flashCol: '#fff', banner: null, t: 0, specks: [], hurtT: 0, popped: 0, lastShot: -9, bolts: [], warn: 0 };
  for (let i = 0; i < 12; i++) S.specks.push({ i, x: Math.random() * W, y: Math.random() * H, r: 26 + Math.random() * 70, v: 4 + Math.random() * 10, a: Math.random() * TAU });
  S.petals = [];
  for (let i = 0; i < 16; i++) S.petals.push({ x: Math.random() * W, y: Math.random() * H, s: 6 + Math.random() * 7, v: 18 + Math.random() * 26, a: Math.random() * TAU, rot: 0.4 + Math.random(), k: i % 3 === 0 });
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
  // glows and text are baked once and blitted: gradients and stroked text are the expensive part of a frame
  function glow(x, y, r, col, a = 0.6) {
    const spr = kit && kit.bake('glow|' + col, 64, 64, g => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); });
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
    if (spr) ctx.drawImage(spr.c, x - r, y - r, r * 2, r * 2);
    else { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  const tcache = new Map();
  function text(str, x, y, size, fill = '#fff', stroke = '#10131c', align = 'center') {
    str = String(str);
    const font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    if (kit && kit.makeCanvas) {
      const key = str + '|' + size + '|' + fill + '|' + stroke;
      let t = tcache.get(key);
      if (!t) {
        ctx.font = font; const pad = Math.ceil(size * 0.3), w = Math.ceil(ctx.measureText(str).width) + pad * 2, h = Math.ceil(size * 1.5), d = kit.dpr;
        const c = kit.makeCanvas(w * d, h * d);
        if (c) { const g = c.getContext('2d'); g.scale(d, d); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.2); g.strokeStyle = stroke; g.strokeText(str, w / 2, h / 2); g.fillStyle = fill; g.fillText(str, w / 2, h / 2); }
        t = { c, w, h, pad }; if (tcache.size > 500) tcache.clear(); tcache.set(key, t);
      }
      if (t.c) { ctx.drawImage(t.c, align === 'left' ? x - t.pad : align === 'right' ? x - t.w + t.pad : x - t.w / 2, y - t.h / 2, t.w, t.h); return; }
    }
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.2); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  // -------------------------------------------------- events -> particles
  const OPT = { reduceMotion: false, lowQuality: false, bigNumbers: false, colorBlind: false, highContrast: false };
  function burst(x, y, n, cols, sp = 220, life = 0.6, size = 5) {
    if (OPT.lowQuality) n = Math.ceil(n * 0.4);
    for (let i = 0; i < n && S.particles.length < (OPT.lowQuality ? 140 : 420); i++) {
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
        addFloat(e.x + (Math.random() - 0.5) * 20, e.y - 10, num(e.d), e.crit ? '#ffe14a' : '#ffffff', e.crit ? 26 : 17);
        burst(e.x, e.y, e.crit ? 5 : 2, e.crit ? ['#ffe14a', '#fff'] : ['#fff', '#b9f3ff'], 160, 0.3, 3);
        break;
      case 'kill': {
        const sp = kit && kit.SPECIES[e.skin];
        const sk = e.kind === 'upgrade' ? ['#ffd84d', '#fff1a8', '#fff'] : sp ? [sp.lite, sp.base, '#fff'] : ['#ff9ad6', '#e0489d', '#fff'];
        burst(e.x, e.y, e.head ? 40 : 14, sk, e.head ? 360 : 240, 0.7, 6);
        ring(e.x, e.y, e.r * 2.4, '#fff', 0.35);
        if (e.head) { S.trauma = Math.min(1, S.trauma + 0.5); }
        break;
      }
      case 'boom': ring(e.x, e.y, e.r, '#ff6a3d', 0.5); ring(e.x, e.y, e.r * 0.6, '#ffd24a', 0.35); burst(e.x, e.y, 30, ['#ff6a3d', '#ffd24a', '#fff'], 420, 0.6, 7); S.trauma = Math.min(1, S.trauma + 0.55); break;
      case 'splash': ring(e.x, e.y, e.r, '#7dff5e', 0.25); break;
      case 'burst': ring(e.x, e.y, e.r, '#bfe9ff', 0.4); burst(e.x, e.y, 16, ['#bfe9ff', '#fff'], 260, 0.5, 5); break;
      case 'leak': S.trauma = Math.min(1, S.trauma + 0.55); S.flash = 0.4; S.flashCol = '#ff2a4d'; ring(e.x, LINE_Y, 120, '#ff2a4d', 0.5); burst(e.x, LINE_Y - 10, 22, ['#ff2a4d', '#ffd0e6', '#fff'], 360, 0.6, 6); addFloat(e.x, LINE_Y - 70, 'LEAK -' + Math.ceil(e.d), '#ff5a78', 26, -60); break;
      case 'pulse': ring(e.x, e.y, e.r, '#7fe8ff', 0.5); break;
      case 'strike': S.bolts.push({ x: e.x, y: e.y, life: 0.28, seed: Math.random() * 9 }); burst(e.x, e.y, 12, ['#d8c4ff', '#fff'], 280, 0.4, 5); ring(e.x, e.y, 70, '#b69cf0', 0.35); break;
      case 'maw': ring(e.x, e.y, 130, '#8a4fe0', 0.7); break;
      case 'groove': ring(g.p.x, g.p.y, 110 + e.n * 4, '#ff7eb6', 0.5); addFloat(g.p.x, g.p.y - 90, e.n >= 20 ? 'ON FIRE!' : 'GROOVE ' + e.n, '#ff9ad6', 26, -70); break;
      case 'chestdrop': S.banner = { text: 'CHEST!', sub: 'Nice aim', t: 0, dur: 1.2, clear: true }; ring(e.x, e.y, 90, '#ffd84d', 0.5); break;
      case 'chest': ring(e.x, e.y, 100, '#ffd84d', 0.6); burst(e.x, e.y, 28, ['#ffd84d', '#fff', '#ff7eb6'], 380, 0.8, 6); break;
      case 'hurt': S.trauma = Math.min(1, S.trauma + 0.6); S.flash = 0.35; S.flashCol = '#ff2a4d'; burst(e.x, e.y, 16, ['#ff2a4d', '#ff8aa0'], 300, 0.5, 5); addFloat(e.x, e.y - 30, '-' + Math.ceil(e.d), '#ff5a78', 28, -90); break;
      case 'block': ring(e.x, e.y, 46, '#39d0ff', 0.3); break;
      case 'power': ring(e.x, e.y, 60, e.kind === 'heal' ? '#ff6a8a' : e.kind === 'shield' ? '#39d0ff' : '#ffd24a', 0.5); addFloat(g.p.x, g.p.y - 60, e.kind === 'heal' ? 'HEAL' : e.kind === 'shield' ? 'SHIELD' : 'RAGE', '#fff', 26, -60); break;
      case 'coin': if (S.floats.length < 40) addFloat(g.p.x + 20, g.p.y - 40, '+' + Math.max(1, Math.round(e.v * g.p.coinMul)), '#ffd24a', 15, -50); break;
      case 'levelup': S.flash = 0.4; S.flashCol = '#9dff6d'; ring(g.p.x, g.p.y, 220, '#9dff6d', 0.6); break;
      case 'pet': addFloat(g.p.x, g.p.y - 150, ({ kitten: 'Meow!', puppy: 'Woof!', lamb: 'Baa!', turtle: 'Slow down!', piglet: 'Oink!', hamster: 'Squeak!' })[e.id] || '!', '#ffe14a', 22, -40); break;
      case 'skip': addFloat(g.p.x, g.p.y - 120, 'Beats!', '#ffd24a', 20, -50); break;
      case 'mend': ring(e.x, e.y, 46, '#6fe08a', 0.3); break;
      case 'stage': S.banner = { text: e.boss ? 'BOSS' : 'STAGE ' + e.n, sub: (e.name || '') + (e.mod ? '  ·  ' + e.mod : ''), t: 0, dur: 2.0, boss: e.boss }; if (e.boss) S.trauma = 0.6; break;
      case 'clear': S.banner = { text: 'STAGE CLEAR', sub: '+' + e.bonus + ' Beats', t: 0, dur: 2.2, clear: true }; break;
      case 'surgewarn': S.warn = 0.7; break;
      case 'surge': S.warn = 0; S.trauma = Math.min(1, S.trauma + 0.3); break;
      case 'revive': S.flash = 0.6; S.flashCol = '#fff'; ring(g.p.x, g.p.y, 300, '#fff', 0.8); break;
      case 'shoot': S.lastShot = S.t; break;
      case 'dead': S.trauma = 1; burst(g.p.x, g.p.y, 50, ['#fff', '#ff6a8a', '#39f0ff'], 420, 1, 7); break;
    }
  }

  // -------------------------------------------------- world pieces
  // the static background (gradient tinted by the species, vignette, lane, borders) is drawn once per stage
  function themeOf(g) { return (kit && kit.SPECIES[g.skin]) || { base: '#ff7eb6', lite: '#ffc2dc', cell: 'round' }; }
  function bgLayer(g, L) {
    const th = themeOf(g), k = Math.max(0.5, Math.min(1.5, L.s));
    return kit && kit.layer(`${g.skin}|${g.stage}|${k.toFixed(1)}`, W, H, k, c => {
      const gr = c.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, H * 0.78);
      gr.addColorStop(0, mix(th.base, '#0d0924', 0.72)); gr.addColorStop(0.55, mix(th.base, '#0d0924', 0.86)); gr.addColorStop(1, '#0d0924');
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      const v = c.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(0.2, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
      c.fillStyle = v; c.fillRect(0, 0, W, H);
      // no lane is drawn: you cannot see where the snake is going to go
      c.lineWidth = 8; c.strokeStyle = mix(th.base, '#ffffff', 0.15) + '8c'; c.strokeRect(4, 4, W - 8, H - 8);
      c.lineWidth = 2; c.strokeStyle = 'rgba(111,227,255,.6)'; c.strokeRect(10, 10, W - 20, H - 20);
    });
  }
  function drawBg(g, L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0924'; ctx.fillRect(0, 0, L.cw, L.ch);
    ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
    const lay = bgLayer(g, L), th = themeOf(g);
    if (lay) ctx.drawImage(lay.c, 0, 0, W, H);
    else { ctx.fillStyle = '#1a1445'; ctx.fillRect(0, 0, W, H); }
    // drifting bokeh lights and themed motes (petals, snow, droplets, sparkles)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const sp of S.specks) {
      const y = (sp.y + S.t * sp.v) % (H + 120) - 60, x = sp.x + Math.sin(S.t * 0.3 + sp.a) * 16, hue = sp.i % 3;
      ctx.globalAlpha = 0.07 + 0.03 * Math.sin(S.t + sp.a); ctx.fillStyle = hue === 0 ? th.base : hue === 1 ? '#6fe3ff' : th.lite;
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 0.5;
    for (const p of S.petals) {
      const y = (p.y + S.t * p.v) % (H + 80) - 40, x = p.x + Math.sin(S.t * 0.8 + p.a) * 30;
      ctx.fillStyle = p.k ? th.lite : th.base;
      if (th.cell === 'snow' || th.cell === 'fuzzy') { ctx.beginPath(); ctx.arc(x, y, p.s * 0.5, 0, TAU); ctx.fill(); }
      else if (th.cell === 'disco' || th.cell === 'hex' || th.cell === 'stone') { ctx.save(); ctx.translate(x, y); ctx.rotate(S.t * p.rot + p.a); ctx.fillRect(-p.s * 0.4, -p.s * 0.4, p.s * 0.8, p.s * 0.8); ctx.restore(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(S.t * p.rot + p.a); ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    // the stage floor below the line, where the duo stands; if the snake touches the line it is over
    if (g.ring) {   // a circle around the duo in the middle: if the snake reaches it, it is over
      const { cx, cy, R } = g.ring, fl = ctx.createRadialGradient(cx, cy, 20, cx, cy, R); fl.addColorStop(0, 'rgba(255,90,140,.12)'); fl.addColorStop(1, 'rgba(255,90,140,.34)');
      ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,90,140,.18)'; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,150,190,.8)'; ctx.setLineDash([22, 12]); ctx.lineDashOffset = -S.t * 20; ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    { const fl = ctx.createLinearGradient(0, LINE_Y, 0, H); fl.addColorStop(0, 'rgba(255,90,140,.22)'); fl.addColorStop(1, 'rgba(10,6,30,.75)'); ctx.fillStyle = fl; ctx.fillRect(0, LINE_Y, W, H - LINE_Y); }
    ctx.save(); ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { const y = LINE_Y + Math.sin(x * 0.05 + S.t * 2.2) * 5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,90,140,.18)'; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,150,190,.75)'; ctx.stroke(); ctx.restore();
  }

  function drawSnake(g, sn) {
    const segs = sn.segs, p = g.p;
    for (let i = segs.length - 1; i >= 0; i--) {   // tail first so the head sits on top
      const s = segs[i], r = s.r;
      if (s.y < -r * 3 || s.y > H + r * 3) continue;   // not on screen: skip the drawing
      const ang = s.ang;
      if (i === 0) {
        if (kit) { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1; kit.drawHead(ctx, s.x, s.y, r * 1.14, ang, { skin: sn.skin, boss: sn.boss, t: S.t + sn.id, look: [dx / d, dy / d], flash: s.flash }); }
        else { ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
        if (s.shield) {   // the face cannot be hit until it is alone
          ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(S.t * 5) * 0.15; ctx.strokeStyle = '#bfe9ff'; ctx.fillStyle = 'rgba(190,235,255,.16)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.28, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        }
        continue;
      }
      const bob = 1 + Math.sin(S.t * 6 - i * 0.5) * 0.03;
      const upright = s.kind === 'armor' || s.kind === 'bomb' || s.kind === 'upgrade';
      if (s.wave) {   // boss shield wave: this cell cannot be hit right now
        ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(S.t * 14 + i) * 0.15; ctx.fillStyle = 'rgba(190,235,255,.2)'; ctx.strokeStyle = '#e6f6ff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.3, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (s.kind === 'bomb') { const pulse = 0.5 + Math.sin(S.t * 9 + i) * 0.5; glow(s.x, s.y, r * 1.8, '#ff3b5c', 0.15 + pulse * 0.25); }
      if (s.kind === 'upgrade') glow(s.x, s.y, r * 2.1, '#ffd24a', 0.45 + Math.sin(S.t * 6 + i) * 0.15);
      const spr = kit && kit.SPR.body(sn.skin, sn.boss, s.kind === 'normal' ? '' : s.kind);
      if (spr) {
        const size = r * 3.9 * bob * (1 + Math.min(0.16, s.flash * 1.3));
        blit(spr, s.x, s.y, size, upright ? 0 : ang);
        if (s.flash > 0) flashBlit(spr, s.x, s.y, size, upright ? 0 : ang, s.flash * 5);
        if (s.kind === 'bomb') { const f = 0.6 + Math.sin(S.t * 18 + i) * 0.4; sparkleAt(s.x + r * 0.1, s.y - r * 1.2, r * 0.3 * f); }
        if (s.kind === 'upgrade') sparkleAt(s.x + r * 0.55 + Math.sin(S.t * 4 + i) * 4, s.y - r * 0.55, r * 0.3);
      } else { ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
      if (s.carry === 'chest') { glow(s.x, s.y, r * 1.8, '#ffd84d', 0.5 + Math.sin(S.t * 6 + i) * 0.2); blit(kit && kit.SPR.pickup('chest'), s.x, s.y - r * 0.9, r * 2.2, Math.sin(S.t * 4 + i) * 0.1); }
      if (OPT.highContrast) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.arc(s.x, s.y + r * 0.05, r * 0.62 * (OPT.bigNumbers ? 1.15 : 1), 0, TAU); ctx.fill(); ctx.restore(); }
      text(num(s.hp), s.x, s.y + r * 0.05, Math.max(20, r * 0.85) * (OPT.bigNumbers ? 1.2 : 1), '#fff', OPT.highContrast ? '#000' : INK);
      if (OPT.colorBlind && (s.kind !== 'normal' || s.carry === 'chest')) kindMark(s.carry === 'chest' && s.kind === 'normal' ? 'chest' : s.kind, s.x, s.y - r * 1.02, r * 0.36);
      if (s.kind === 'mender') { glow(s.x, s.y, r * 1.7, '#6fe08a', 0.35 + Math.sin(S.t * 5 + i) * 0.12); ctx.save(); ctx.fillStyle = '#6fe08a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; const q = r * 0.34; for (const [px, py, w2, h2] of [[-q * 0.35, -q, q * 0.7, q * 2], [-q, -q * 0.35, q * 2, q * 0.7]]) { ctx.fillRect(s.x + px, s.y - r * 0.95 + py + q, w2, h2); ctx.strokeRect(s.x + px, s.y - r * 0.95 + py + q, w2, h2); } ctx.restore(); }
    }
    if (sn.slow > 0) { const h = segs[0]; glow(h.x, h.y, h.r * 2, '#7fe8ff', 0.3); }
  }
  // colour-blind mode: every special cell kind gets its own white badge shape (star, square, triangle, plus, diamond)
  function kindMark(kind, x, y, q) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    if (kind === 'upgrade') { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? q * 0.5 : q * 1.15; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
    else if (kind === 'armor') ctx.rect(-q * 0.85, -q * 0.85, q * 1.7, q * 1.7);
    else if (kind === 'bomb') { ctx.moveTo(0, -q * 1.1); ctx.lineTo(q * 1.1, q * 0.85); ctx.lineTo(-q * 1.1, q * 0.85); ctx.closePath(); }
    else if (kind === 'mender') { const w = q * 0.38; ctx.rect(-w, -q, w * 2, q * 2); ctx.rect(-q, -w, q * 2, w * 2); }
    else { ctx.moveTo(0, -q * 1.1); ctx.lineTo(q * 0.9, 0); ctx.lineTo(0, q * 1.1); ctx.lineTo(-q * 0.9, 0); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function sparkleAt(x, y, r) { if (kit) { ctx.save(); ctx.translate(x, y); ctx.scale(r / 20, r / 20); kit.sparkle(ctx, 0, 0, 20); ctx.restore(); } }

  function drawPickup(pk) {
    const k = pk.kind, bob = Math.sin(S.t * 6 + pk.x) * 2;
    if (k === 'gem') { glow(pk.x, pk.y, 22, '#39f0ff', 0.5); blit(kit && kit.SPR.pickup('gem'), pk.x, pk.y + bob, 64, Math.sin(S.t * 3 + pk.x) * 0.25); }
    else if (k === 'coin') { const sq = Math.max(0.3, Math.abs(Math.cos(S.t * 7 + pk.x))); ctx.save(); ctx.translate(pk.x, pk.y + bob); ctx.scale(sq, 1); blit(kit && kit.SPR.pickup('coin'), 0, 0, 58); ctx.restore(); }
    else if (k === 'chest') { glow(pk.x, pk.y, 60, '#ffd84d', 0.55 + Math.sin(S.t * 5) * 0.2); blit(kit && kit.SPR.pickup('chest'), pk.x, pk.y + bob * 2, 104, Math.sin(S.t * 4) * 0.1); }
    else { const col = k === 'heal' ? '#ff6a8a' : k === 'shield' ? '#39d0ff' : '#ffb020'; glow(pk.x, pk.y, 38, col, 0.6); blit(kit && kit.SPR.pickup(k), pk.x, pk.y + bob * 2, 92, Math.sin(S.t * 4) * 0.12); }
  }

  function drawPlayer(g) {
    const p = g.p;
    if (p.iframes > 0 && Math.floor(S.t * 20) % 2 === 0 && !(p.shield > 0)) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 40, 56, 14, 0, 0, TAU); ctx.fill(); ctx.restore();
    if ((g.groove || 0) >= 10) glow(p.x, p.y - 20, 100 + (g.groove - 10) * 3, '#ff7eb6', 0.18 + 0.1 * Math.sin(S.t * 8));
    // aim tick
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim); ctx.globalAlpha *= 0.55; ctx.fillStyle = '#6fe3ff';
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(22, -6); ctx.lineTo(22, 6); ctx.fill(); ctx.restore();
    const singing = S.t - S.lastShot < 0.22;
    const key = singing ? 'duo_sing' : 'duo_idle';
    const sq = 1 + Math.sin(S.t * 9) * 0.025 * (Math.hypot(p.mx, p.my) > 0.1 ? 2 : 1);
    const im = art && art.get(key);
    if (im) { const h = 170, w = h * im.width / im.height; img(key, p.x, p.y - 26, w / sq, h * sq, p.mx * 0.05); }
    else { glow(p.x, p.y, 40, '#39f0ff', 0.7); ctx.fillStyle = '#39f0ff'; ctx.strokeStyle = '#06323f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill(); ctx.stroke(); }
    (g.pets || []).forEach((id, i) => { const s2 = i ? 1 : -1, bob = Math.abs(Math.sin(S.t * 6 + i * 2)) * 8, px = p.x + s2 * 92 + Math.sin(S.t * 1.7 + i) * 6; ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, p.y + 40, 22, 7, 0, 0, TAU); ctx.fill(); ctx.restore(); blit(kit && kit.SPR.pet(id), px, p.y + 8 - bob, 92, s2 * Math.sin(S.t * 6 + i * 2) * 0.08); });
    if (g.outfit) { glow(p.x, p.y - 20, 70, g.outfit.color, 0.22); ctx.save(); ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.outfit.hat, p.x - 4, p.y - 124 + Math.sin(S.t * 4) * 3); ctx.restore(); }
    // hitbox core: the part that actually gets hurt
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff5a78'; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 3.5, 0, TAU); ctx.fill();
    if (p.shield > 0) { ctx.strokeStyle = `rgba(80,210,255,${0.5 + Math.sin(S.t * 10) * 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 54, 0, TAU); ctx.stroke(); glow(p.x, p.y, 60, '#39d0ff', 0.25); }
    if (p.rage > 0) glow(p.x, p.y, 70, '#ffb020', 0.3 + Math.sin(S.t * 14) * 0.1);
    ctx.globalAlpha = 1;
  }

  function drawBullets(g) {
    for (const b of g.bullets) {
      if (b.kind === 'needle') { blit(kit && kit.SPR.weapon('needle'), b.x, b.y, 112, Math.atan2(b.vy, b.vx)); continue; }
      if (b.kind === 'snot') { blit(kit && kit.SPR.weapon('dragon'), b.x, b.y, 118, Math.sin(S.t * 10 + b.x) * 0.25); continue; }
      if (b.kind === 'bubble') { blit(kit && kit.SPR.weapon('bubble'), b.x, b.y, b.r * 4.84, Math.sin(S.t * 3 + b.x) * 0.2); continue; }
      const col = b.crit ? '#ffd84d' : '#6fe3ff';
      if (b.crit) glow(b.x, b.y, 30, col, 0.55);
      const spr = kit && kit.SPR.note(b.crit);
      if (spr) blit(spr, b.x, b.y, b.crit ? 100 : 66, S.t * 6 + b.x * 0.05);
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, TAU); ctx.fill(); }
    }
  }

  const WCOL = { swab: '#ff7eb6', daggers: '#c9d3ee', tower: '#6fe3ff', dragon: '#8dff6a', needles: '#f2f6ff', stick: '#e0a468', bubble: '#bfe9ff', satellite: '#ffe14a', maw: '#8a4fe0' };
  const WSPR = { daggers: 'dagger', needles: 'needle' };
  const WAB = { swab: 'BP', daggers: 'SV', tower: 'SS', dragon: 'AN', needles: 'TP', stick: 'DS', bubble: 'HB', satellite: 'SL', maw: 'BD' };
  // Beat Pads sit under the snake and pulse on every tick
  function drawZones(g) {
    const pad = kit && kit.SPR.weapon('swab');
    for (const z of g.zones) {
      const fade = Math.min(1, z.life * 2), ph = 1 - Math.max(0, Math.min(1, z.tick / 0.3));
      ctx.save(); ctx.globalAlpha = 0.9 * fade; blit(pad, z.x, z.y, z.r * 3.4 * (1 + 0.05 * (1 - ph)), 0); ctx.restore();
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.8 * fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.45 + 0.55 * ph), 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
  function drawWeapons(g) {
    for (const t of g.towers) {   // Speaker Stacks thump
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 38, 32, 9, 0, 0, TAU); ctx.fill(); ctx.restore();
      blit(kit && kit.SPR.weapon('tower'), t.x, t.y, 160 * (1 + 0.14 * Math.max(0, t.pulse)), Math.sin(S.t * 3 + t.x) * 0.03);
    }
    const dl = g.weap.daggers ? g.weap.daggers.lv : 0;   // Spinning Vinyl
    for (let i = 0; i < (dl ? 1 + dl : 0); i++) { const d = daggerPos(g, i); blit(kit && kit.SPR.weapon('dagger'), d.x, d.y + Math.sin(S.t * 8 + i) * 4, 150, Math.sin(S.t * 7 + i) * 0.2); }
    if (g.weap.stick) for (let k = 0; k < (g.weap.stick.lv >= 4 ? 2 : 1); k++) {   // Drumsticks
      const sg = stickSeg(g, k), sc = sg.len / 144, mid = 80 * sc;
      blit(kit && kit.SPR.weapon('stick'), sg.x0 + Math.cos(sg.a) * mid, sg.y0 + Math.sin(sg.a) * mid, 184 * sc, sg.a);
    }
    for (const m of g.maws) {   // Bass Drop: a sub-bass vortex with a thump
      const k = Math.min(1, m.life * 3, (m.max - m.life) * 4) || 0, ph = (S.t * 2) % 1;
      ctx.save(); ctx.globalAlpha = 0.92 * k; blit(kit && kit.SPR.weapon('maw'), m.x, m.y, m.r * 3.4 * (1 + 0.06 * Math.sin(S.t * 14)), Math.sin(S.t * 9) * 0.1); ctx.restore();
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.8 * k; ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.2 + 0.8 * ph), 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (let i = S.bolts.length - 1; i >= 0; i--) {   // Spotlight Storm: a beam from the rig above
      const b = S.bolts[i]; b.life -= 0.016; if (b.life <= 0) { S.bolts.splice(i, 1); continue; }
      const a = Math.min(1, b.life * 5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * a; ctx.fillStyle = '#fff1a8';
      ctx.beginPath(); ctx.moveTo(b.x - 12, -20); ctx.lineTo(b.x + 12, -20); ctx.lineTo(b.x + 62, b.y); ctx.lineTo(b.x - 62, b.y); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8 * a; ctx.beginPath(); ctx.ellipse(b.x, b.y, 58, 22, 0, 0, TAU); ctx.fill(); ctx.restore();
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
    // yellow upgrade cells still on the snake
    ctx.save(); ctx.translate(pad + 14, 44); ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    sparkleAt(pad + 14, 44, 13);
    text('x ' + (g.upgradeLeft || 0), pad + 40, 46, 24, '#ffd84d', '#0b1020', 'left');
    text('UPGRADE CELLS', pad, 78, 12, '#fff1a8', '#0b1020', 'left');
    { let ch = 0; for (const sn of g.snakes) for (const q of sn.segs) if (q.carry === 'chest' && q.hp > 0) ch++; if (ch) { blit(kit && kit.SPR.pickup('chest'), pad + 98, 44, 40); text('x ' + ch, pad + 122, 46, 20, '#ffe9a8', '#0b1020', 'left'); } }
    if ((g.danger || 0) > 0.05 && g.phase === 'play') { const a = Math.min(0.5, g.danger * 0.45) * (0.65 + 0.35 * Math.sin(S.t * 14)); const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); rg.addColorStop(0, 'rgba(255,40,80,0)'); rg.addColorStop(1, `rgba(255,40,80,${a})`); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
    for (const sn of g.snakes) if (sn.surge === 'warn') { const h = sn.segs[0]; text('!', h.x, h.y - h.r - 34 + Math.sin(S.t * 20) * 4, 40, '#ff3d5a', '#0b1020'); }
    // what the capsule does right now
    const up = id => Math.round(uv(g, id));
    const gv = g.groove || 0, gw = 230, gx = pad + 4, gy = H - 30;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(gx - 3, gy - 3, gw + 6, 18);
    const gg = ctx.createLinearGradient(gx, 0, gx + gw, 0); gg.addColorStop(0, '#ff7eb6'); gg.addColorStop(1, gv >= 15 ? '#ffd84d' : '#6fe3ff');
    ctx.fillStyle = gg; ctx.fillRect(gx, gy, gw * Math.min(1, gv / 20), 12);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.strokeRect(gx - 3, gy - 3, gw + 6, 18);
    text(gv >= 20 ? 'GROOVE: ON FIRE' : 'GROOVE ' + Math.floor(gv) + '  (+' + Math.floor(gv * 1.5) + '% dmg)', gx + gw / 2, gy - 14, 14, gv >= 15 ? '#ffd84d' : '#ffc2dc', '#0b1020');
    if (ui && ui.hints) {   // short hints for the first runs
      const sn = g.snakes[0], alone = sn && sn.segs.length <= 3 && sn.segs[0].shield;
      const hint = g.t < 7 ? 'SLIDE LEFT AND RIGHT: YOUR NOTES FLY STRAIGHT UP' : (g.upgradeLeft > 0 && g.pending === 0 && g.kills < 4) ? 'POP THE YELLOW CELLS FOR UPGRADES' : alone ? 'THE FACE POPS WHEN IT IS ALONE' : '';
      if (hint) { ctx.save(); ctx.globalAlpha = 0.75 + Math.sin(S.t * 4) * 0.2; text(hint, W / 2, H * 0.5, 24, '#ffffff', '#0b1020'); ctx.restore(); }
    }
    text(`NOTES ${1 + up('notes')}  BURSTS ${1 + up('burst')}  SPEED +${up('aspd')}%  DMG +${up('cdmg')}%`, W / 2, 166, 13, '#bfe9ff', '#0b1020');
    // chapter, virus name, and progress with chests at 25% / 50% / 100%
    const boss = isBossStage(g.stage);
    text(boss ? 'BOSS  ' + g.stage : 'STAGE ' + g.stage, W / 2, 34, 26, boss ? '#ff7a9a' : '#fff');
    text(g.mode === 'pig' ? 'Piggy Bank Parade' : virusName(g.stage), W / 2, 62, 17, '#ffd0e6');
    const bw = 400, bx = W / 2 - bw / 2, by = 84;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 20);
    ctx.fillStyle = boss ? '#ff3d6e' : '#ff7eb6'; ctx.fillRect(bx, by, bw * (g.progress || 0), 14);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.strokeRect(bx - 3, by - 3, bw + 6, 20);
    for (const th of [0.25, 0.5, 1]) { const done = (g.progress || 0) >= th - 1e-6; ctx.save(); ctx.globalAlpha = done ? 0.45 : 1; blit(kit && kit.SPR.pickup('chest'), bx + bw * th - (th === 1 ? 4 : 0), by + 7, th === 1 ? 46 : 34); ctx.restore(); }
    text('Progress: ' + Math.floor((g.progress || 0) * 100) + '%', W / 2, 116, 15, '#ffd0e6', '#0b1020');
    if (g.hard) text('HARD', W / 2 + 104, 62, 15, '#c9a0ff', '#0b1020');
    { const sn = g.snakes[0], mult = sn ? (sn.surge === 'go' ? 2.6 : sn.slow > 0 ? 0.6 : 1) : 1;   // how fast the snake is going right now
      blit(kit && kit.SPR.body(g.skin, false, ''), pad + 28, 140, 64, 0); text('SPEED x' + mult.toFixed(1), pad, 178, 13, mult > 1 ? '#ff8a8a' : '#cfe', '#0b1020', 'left'); }
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(W - 40, 112, 24, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; for (const [i, hgt] of [[0, 12], [1, 20], [2, 28]]) ctx.fillRect(W - 54 + i * 10, 124 - hgt, 7, hgt);
    // coins
    blit(kit && kit.SPR.pickup('coin'), W - pad - 172, 38, 52); text(String(Math.floor(g.coins)), W - pad - 152, 38, 24, '#ffd24a', '#0b1020', 'left');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(W - 40, 38, 24, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(W - 48, 28, 6, 20); ctx.fillRect(W - 36, 28, 6, 20);
    if (p.shield > 0) text('SHIELD ' + p.shield.toFixed(0), W - pad, H - 78, 18, '#7fe8ff', '#0b1020', 'right');
    if (p.rage > 0) text('RAGE ' + p.rage.toFixed(0), W - pad, H - 50, 18, '#ffd24a', '#0b1020', 'right');
    if (g.combo > 2 && g.t - g.lastKill < 2.2) text('COMBO x' + g.combo, W / 2, 136, 24 + Math.min(10, g.combo * 0.3), '#ffe14a');
    // owned weapons
    let wx = W - pad - 24; const wy = H - 36;
    for (const id of Object.keys(g.weap)) {
      ctx.save(); ctx.translate(wx, wy); ctx.fillStyle = WCOL[id] || '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-22, -22, 44, 44, 10) : ctx.rect(-22, -22, 44, 44); ctx.fill(); ctx.stroke(); ctx.restore();
      blit(kit && kit.SPR.weapon(WSPR[id] || id), wx, wy - 6, 100); text('Lv' + g.weap[id].lv, wx, wy + 14, 11, '#fff', INK);
      wx -= 52;
    }
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
    if (OPT.reduceMotion) { S.trauma = 0; S.flash = 0; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBg(g, L);
    const sh = S.trauma * S.trauma * 22;
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    for (const pk of g.pickups) drawPickup(pk);
    drawZones(g);
    for (const sn of g.snakes) drawSnake(g, sn);
    drawWeapons(g);
    if (g.phase !== 'dead') drawPlayer(g);
    drawBullets(g);
    drawFx(dt);
    ctx.restore();
    if (S.warn > 0) {   // the virus is about to surge
      S.warn -= dt; const a = 0.25 + 0.2 * Math.sin(S.t * 30);
      const gr = ctx.createLinearGradient(0, 0, 0, 260); gr.addColorStop(0, `rgba(255,40,80,${a})`); gr.addColorStop(1, 'rgba(255,40,80,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 260); text('SURGE!', W / 2, 170, 54, '#ff5a78');
    }
    if (S.flash > 0) { ctx.save(); ctx.globalAlpha = S.flash * 0.5; ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (ui) drawHud(g, ui);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { setOptions(o) { Object.assign(OPT, o); }, draw, onEvent, layout, state: S, toGame(px, py) { const L = layout(); return { x: (px - L.ox) / L.s, y: (py - L.oy) / L.s }; } };
}
