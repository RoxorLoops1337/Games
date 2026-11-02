// Canvas renderer. Reads the sim state, never changes it. Uses sprites from art.js
// where they exist and draws procedural stand-ins otherwise.
import { W, H, isBossStage, LINE_Y, virusName, daggerPos, stickSeg, uv, beatPhase } from './sim.js';
import { INK, mix } from './art_draw.js';
import { createHud } from './hud.js';
import { createScreenFx } from './screenfx.js';
import { bakeWorld, makeMotes, drawMotes, drawBeams, drawRing } from './bg_world.js';
import { drawHints } from './hints.js';

const TAU = Math.PI * 2;
const num = v => { v = Math.ceil(v); return v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v); };

export function createRenderer(canvas, art, kit) {
  const ctx = canvas.getContext('2d');
  const S = { particles: [], floats: [], rings: [], trauma: 0, flash: 0, flashCol: '#fff', banner: null, t: 0, specks: [], hurtT: 0, popped: 0, lastShot: -9, bolts: [], warn: 0, props: [], coins: [], chain: { n: 0, t: -9 } };
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
  const ring = (x, y, r, col, life = 0.4) => S.rings.length < 24 && S.rings.push({ x, y, r, life, max: life, col });
  const addFloat = (x, y, str, col, size, vy = -70) => { if (S.floats.length < 60) S.floats.push({ x, y, str, col, size, vy, life: 0.7, max: 0.7 }); };

  // ---- hit juice: shaped pop particles, merged damage numbers, kill chains, flying coins ----
  const POPSHAPE = { love: 'h', piggy: 'h', frosty: 'f', grumpy: 'f', sneezy: 'd', sour: 'd', disco: 'n', sleepy: 'n', rust: 'c', mighty: 'c', gloomy: 'c' };
  const CHAIN_COL = ['#ffffff', '#9dff6d', '#6fe3ff', '#ffd84d', '#ff9ad6', '#ff6a3d'];
  function shaped(x, y, n, sh, cols, sp, life, size, grav = 0) {
    if (OPT.lowQuality) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n && S.particles.length < (OPT.lowQuality ? 140 : 420); i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.8);
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.25, life, max: life, size: size * (0.7 + Math.random() * 0.6), col: cols[(Math.random() * cols.length) | 0], sh, g: grav, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8 });
    }
  }
  function dmgFloat(e) {
    const crit = e.crit, key = e.s;
    let f = null;
    for (let i = 0; i < S.floats.length; i++) if (S.floats[i].key === key && S.floats[i].life > 0.3) { f = S.floats[i]; break; }
    if (f) { f.acc += e.d; f.str = num(f.acc); f.life = f.max = crit ? 0.8 : 0.6; f.pop = 1; f.vy = -60; if (crit) { f.col = '#ffe14a'; f.size = Math.max(f.size, 28); } return; }
    let dn = 0; for (let i = 0; i < S.floats.length; i++) if (S.floats[i].key) dn++;
    if (dn >= (OPT.lowQuality ? 8 : 14) && !crit) return;   // cap: busy fights show fewer numbers, crits always show
    if (S.floats.length >= 60) return;
    const size = crit ? 30 : Math.min(24, 14 + Math.log2(e.d + 1) * 1.6);
    S.floats.push({ x: e.x + (Math.random() - 0.5) * 24, y: e.y - 14, str: num(e.d), acc: e.d, key, col: crit ? '#ffe14a' : '#ffffff', size, vy: crit ? -85 : -60, life: crit ? 0.8 : 0.6, max: crit ? 0.8 : 0.6, pop: 1 });
  }
  let FX = null;   // whole-screen feedback (screenfx.js), created after the helpers below exist
  function onEvent(e, g) {
    if (FX) FX.onEvent(e, g);
    switch (e.t) {
      case 'hit':
        S.popped++;
        dmgFloat(e);
        if (e.crit) { ring(e.x, e.y, 70, '#ffe14a', 0.3); shaped(e.x, e.y, OPT.lowQuality ? 4 : 8, 's', ['#ffe14a', '#fff'], 300, 0.45, 9); }
        burst(e.x, e.y, e.crit ? 5 : 2, e.crit ? ['#ffe14a', '#fff'] : ['#fff', '#b9f3ff'], 160, 0.3, 3);
        break;
      case 'kill': {
        const sp = kit && kit.SPECIES[e.skin];
        const sk = e.kind === 'upgrade' ? ['#ffd84d', '#fff1a8', '#fff'] : sp ? [sp.lite, sp.base, '#fff'] : ['#ff9ad6', '#e0489d', '#fff'];
        burst(e.x, e.y, e.head ? 40 : 14, sk, e.head ? 360 : 240, 0.7, 6);
        { const sh = POPSHAPE[e.skin] || 'c';
          shaped(e.x, e.y, e.head ? 14 : 7, sh, sp ? [sp.lite, sp.base, '#fff', sp.acc] : ['#ff9ad6', '#fff'], e.head ? 340 : 250, 0.9, e.head ? 11 : 8, 380); }
        { const ch = S.chain; ch.n = S.t - ch.t < 0.9 ? ch.n + 1 : 1; ch.t = S.t;
          const col = CHAIN_COL[Math.min(5, ch.n >> 1)];
          ring(e.x, e.y, e.r * (2.4 + Math.min(ch.n, 10) * 0.12), col, 0.35);
          if (ch.n >= 3) { for (let i = 0; i < S.floats.length; i++) if (S.floats[i].key === 'chain') { S.floats.splice(i, 1); break; }
            S.floats.push({ x: e.x, y: e.y - e.r - 14, str: 'x' + ch.n, acc: 0, key: 'chain', col, size: Math.min(34, 18 + ch.n), vy: -50, life: 0.7, max: 0.7, pop: 1 });
            if (ch.n % 5 === 0) shaped(e.x, e.y, 6, 's', [col, '#fff'], 280, 0.5, 9); } }
        if (e.kind === 'upgrade') {   // golden shockwave
          ring(e.x, e.y, 260, '#ffd84d', 0.6); ring(e.x, e.y, 170, '#fff1a8', 0.45); ring(e.x, e.y, 120, '#ffffff', 0.3);
          S.rings.push({ x: e.x, y: e.y, r: 200, life: 0.5, max: 0.5, col: '#ffd24a', glow: true });
          shaped(e.x, e.y, 10, 's', ['#ffd84d', '#fff1a8', '#fff'], 380, 0.8, 12); S.flash = Math.max(S.flash, 0.22); S.flashCol = '#ffe9a0'; S.trauma = Math.min(1, S.trauma + 0.25);
        }
        if (e.carry === 'chest' && !OPT.reduceMotion) S.props.push({ k: 'chest', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 80, vy: -300, rot: 0, life: 0.9, max: 0.9, size: e.r * 2.6 });
        if (e.carry === 'chest') { ring(e.x, e.y, 150, '#ffd84d', 0.5); shaped(e.x, e.y, 8, 's', ['#ffd84d', '#fff', '#ff7eb6'], 330, 0.7, 10, 200); }
        if (e.head) { S.trauma = Math.min(1, S.trauma + 0.5); }
        break;
      }
      case 'boom': ring(e.x, e.y, e.r, '#ff6a3d', 0.5); ring(e.x, e.y, e.r * 0.6, '#ffd24a', 0.35); burst(e.x, e.y, 30, ['#ff6a3d', '#ffd24a', '#fff'], 420, 0.6, 7); S.trauma = Math.min(1, S.trauma + 0.55); break;
      case 'splash': ring(e.x, e.y, e.r, '#7dff5e', 0.25); break;
      case 'encoreready': addFloat(g.p.x, g.p.y - 110, 'ENCORE READY: TAP!', '#ffe36b', 26, -50); ring(g.p.x, g.p.y, 120, '#ffe36b', 0.5); break;
      case 'encore': S.trauma = Math.min(1, S.trauma + 0.6); S.flash = 0.25; S.flashCol = '#fff6c2'; ring(e.x, g.p.y, 130, '#ffe36b', 0.5); burst(e.x, g.p.y - 40, 26, ['#ffe36b', '#fff', '#ff9ad6'], 520, 0.7, 6); break;
      case 'goldpop': ring(e.x, e.y, 110, '#ffd24a', 0.6); burst(e.x, e.y, 30, ['#ffd24a', '#fff6c2', '#fff'], 460, 0.8, 6); addFloat(e.x, e.y - 40, 'GOLD +' + e.v, '#ffe36b', 30, -80); break;
      case 'goldfade': addFloat(e.x, e.y, 'gold lost', '#c9b36a', 18, -40); break;
      case 'clutch': addFloat(e.x, e.y - 30, 'CLOSE CALL!', '#ff9ad6', 30, -70); ring(e.x, e.y, 80, '#ff9ad6', 0.4); break;
      case 'burst': ring(e.x, e.y, e.r, '#bfe9ff', 0.4); burst(e.x, e.y, 16, ['#bfe9ff', '#fff'], 260, 0.5, 5); break;
      case 'leak': S.trauma = Math.min(1, S.trauma + 0.55); S.flash = 0.4; S.flashCol = '#ff2a4d'; ring(e.x, LINE_Y, 120, '#ff2a4d', 0.5); burst(e.x, LINE_Y - 10, 22, ['#ff2a4d', '#ffd0e6', '#fff'], 360, 0.6, 6); addFloat(e.x, LINE_Y - 70, 'LEAK -' + Math.ceil(e.d), '#ff5a78', 26, -60); break;
      case 'pulse': ring(e.x, e.y, e.r, '#7fe8ff', 0.5); break;
      case 'strike': if (S.bolts.length < 12) S.bolts.push({ x: e.x, y: e.y, life: 0.28, seed: Math.random() * 9 }); burst(e.x, e.y, 12, ['#d8c4ff', '#fff'], 280, 0.4, 5); ring(e.x, e.y, 70, '#b69cf0', 0.35); break;
      case 'maw': ring(e.x, e.y, 130, '#8a4fe0', 0.7); break;
      case 'groove': ring(g.p.x, g.p.y, 110 + e.n * 4, '#ff7eb6', 0.5); addFloat(g.p.x, g.p.y - 90, e.n >= 20 ? 'ON FIRE!' : 'GROOVE ' + e.n, '#ff9ad6', 26, -70); break;
      case 'chestdrop': S.banner = { text: 'CHEST!', sub: 'Nice aim', t: 0, dur: 1.2, clear: true }; ring(e.x, e.y, 90, '#ffd84d', 0.5); break;
      case 'chest': ring(e.x, e.y, 100, '#ffd84d', 0.6); burst(e.x, e.y, 28, ['#ffd84d', '#fff', '#ff7eb6'], 380, 0.8, 6); break;
      case 'hurt': S.trauma = Math.min(1, S.trauma + 0.6); S.flash = 0.35; S.flashCol = '#ff2a4d'; burst(e.x, e.y, 16, ['#ff2a4d', '#ff8aa0'], 300, 0.5, 5); addFloat(e.x, e.y - 30, '-' + Math.ceil(e.d), '#ff5a78', 28, -90); break;
      case 'block': ring(e.x, e.y, 46, '#39d0ff', 0.3); break;
      case 'power': ring(e.x, e.y, 60, e.kind === 'heal' ? '#ff6a8a' : e.kind === 'shield' ? '#39d0ff' : '#ffd24a', 0.5); addFloat(g.p.x, g.p.y - 60, e.kind === 'heal' ? 'HEAL' : e.kind === 'shield' ? 'SHIELD' : 'RAGE', '#fff', 26, -60); break;
      case 'coin':
        if (S.floats.length < 40) addFloat(g.p.x + 20, g.p.y - 40, '+' + Math.max(1, Math.round(e.v * g.p.coinMul)), '#ffd24a', 15, -50);
        if (S.coins.length < (OPT.lowQuality ? 8 : 20)) S.coins.push({ x0: e.x, y0: e.y, t: 0, dur: 0.55 + Math.random() * 0.2, cx: e.x + (Math.random() - 0.5) * 160, cy: Math.min(e.y, 300) - 80 });
        break;
      case 'levelup': S.flash = 0.4; S.flashCol = '#9dff6d'; ring(g.p.x, g.p.y, 220, '#9dff6d', 0.6); break;
      case 'pet': addFloat(g.p.x, g.p.y - 150, ({ kitten: 'Meow!', puppy: 'Woof!', lamb: 'Baa!', turtle: 'Slow down!', piglet: 'Oink!', hamster: 'Squeak!' })[e.id] || '!', '#ffe14a', 22, -40); break;
      case 'skip': addFloat(g.p.x, g.p.y - 120, 'Beats!', '#ffd24a', 20, -50); break;
      case 'mend': ring(e.x, e.y, 46, '#6fe08a', 0.3); break;
      case 'stage': if (e.boss) S.trauma = 0.6; break;   // the title card is drawn by screenfx.js
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
    return kit && kit.layer(`${g.skin}|${g.stage}|${k.toFixed(1)}`, W, H, k, c => bakeWorld(c, g.skin, isBossStage(g.stage), !!g.ring, th));
  }
  function drawBg(g, L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0924'; ctx.fillRect(0, 0, L.cw, L.ch);
    ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
    const lay = bgLayer(g, L), th = themeOf(g);
    if (lay) ctx.drawImage(lay.c, 0, 0, W, H);
    else { ctx.fillStyle = '#1a1445'; ctx.fillRect(0, 0, W, H); }
    // drifting bokeh lights and themed motes (petals, snow, droplets, notes, stars, bubbles)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const sp = S.specks[i], y = (sp.y + S.t * sp.v) % (H + 120) - 60, x = sp.x + Math.sin(S.t * 0.3 + sp.a) * 16, hue = sp.i % 3;
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(S.t + sp.a); ctx.fillStyle = hue === 0 ? th.base : hue === 1 ? '#6fe3ff' : th.lite;
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (!OPT.reduceMotion) { if (!S.motes) S.motes = makeMotes(); drawBeams(ctx, S.t, isBossStage(g.stage), th, kit); drawMotes(ctx, g.skin, th, S.motes, S.t); }
    // the stage floor below the line, where the duo stands; if the snake touches the line it is over
    if (g.ring) { drawRing(ctx, g.ring, S.t, isBossStage(g.stage)); return; }   // a circle around the duo in the middle
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
      if (s.gold) { const live = s.goldT > 0; glow(s.x, s.y, r * (live ? 2.3 : 1.5), '#ffd24a', live ? 0.55 + Math.sin(S.t * 9 + i) * 0.2 : 0.15); if (live) { ctx.save(); ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.18, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, s.goldT / 9)); ctx.stroke(); ctx.restore(); } }
      if (s.kind === 'bomb') { const pulse = 0.5 + Math.sin(S.t * 9 + i) * 0.5; glow(s.x, s.y, r * 1.8, '#ff3b5c', 0.15 + pulse * 0.25); }
      if (s.kind === 'mender') glow(s.x, s.y, r * 1.7, '#6fe08a', 0.35 + Math.sin(S.t * 5 + i) * 0.12);
      if (s.kind === 'upgrade') glow(s.x, s.y, r * 2.1, '#ffd24a', 0.45 + Math.sin(S.t * 6 + i) * 0.15);
      const spr = kit && kit.SPR.body(sn.skin, sn.boss, s.kind === 'normal' ? '' : s.kind);
      if (spr) {
        const size = r * 3.9 * bob * (1 + Math.min(0.16, s.flash * 1.3));
        if (s.flash > 0 && !OPT.reduceMotion) {   // squash and recoil on hit
          const k = Math.min(1, s.flash / 0.12);
          ctx.save(); ctx.translate(s.x, s.y - k * 5); ctx.scale(1 + k * 0.13, 1 - k * 0.13);
          blit(spr, 0, 0, size, upright ? 0 : ang); flashBlit(spr, 0, 0, size, upright ? 0 : ang, s.flash * 5); ctx.restore();
        } else {
          blit(spr, s.x, s.y, size, upright ? 0 : ang);
          if (s.flash > 0) flashBlit(spr, s.x, s.y, size, upright ? 0 : ang, s.flash * 5);
        }
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
    else if (k === 'coin') { if ((S.t * 1.6 + pk.x * 0.1) % 1 < 0.4) sparkleAt(pk.x + 10, pk.y - 12, 8 * Math.sin(((S.t * 1.6 + pk.x * 0.1) % 1) * 2.5 * Math.PI / 1)); const sq = Math.max(0.3, Math.abs(Math.cos(S.t * 7 + pk.x))); ctx.save(); ctx.translate(pk.x, pk.y + bob); ctx.scale(sq, 1); blit(kit && kit.SPR.pickup('coin'), 0, 0, 58); ctx.restore(); }
    else if (k === 'chest') { if ((S.t * 1.3 + pk.x) % 1 < 0.5) sparkleAt(pk.x + 30, pk.y - 34, 11 * Math.sin(((S.t * 1.3 + pk.x) % 1) * 2 * Math.PI)); glow(pk.x, pk.y, 60, '#ffd84d', 0.55 + Math.sin(S.t * 5) * 0.2); blit(kit && kit.SPR.pickup('chest'), pk.x, pk.y + bob * 2, 104, Math.sin(S.t * 4) * 0.1); }
    else { if (k === 'heal' && (S.t * 1.2 + pk.x) % 1 < 0.4) sparkleAt(pk.x + 22, pk.y - 26, 9 * Math.sin(((S.t * 1.2 + pk.x) % 1) * 2.5 * Math.PI)); const col = k === 'heal' ? '#ff6a8a' : k === 'shield' ? '#39d0ff' : '#ffb020'; glow(pk.x, pk.y, 38, col, 0.6); blit(kit && kit.SPR.pickup(k), pk.x, pk.y + bob * 2, 92, Math.sin(S.t * 4) * 0.12); }
  }

  // 02-animal-art: pets bob, blink, hop when the duo sings and look alert when a snake head is near
  const petState = [{ hop: 0, last: 0 }, { hop: 0, last: 0 }];
  function petsDraw(g, p, singing) {
    const ps = g.pets || [];
    let near = 1e9; for (const sn of g.snakes) { const h = sn.segs[0]; if (h) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < near) near = d; } }
    const scared = near < 330;
    ps.forEach((id, i) => {
      const st = petState[i] || (petState[i] = { hop: 0, last: 0 });
      if (S.lastShot !== st.last) { st.last = S.lastShot; st.hop = 1; }
      st.hop = Math.max(0, st.hop - 0.016 * 4.5);
      const s2 = i ? 1 : -1, ph = S.t * 6 + i * 2, idle = Math.abs(Math.sin(ph)) * (scared ? 3 : 8), hopY = Math.sin(st.hop * Math.PI) * 14;
      const px = p.x + s2 * 92 + Math.sin(S.t * 1.7 + i) * 6, base = p.y + 8;
      const blink = (S.t * 0.8 + i * 1.7) % 3.1 < 0.13;
      const mood = st.hop > 0.35 ? 3 : scared ? 2 : blink ? 1 : 0;
      const k = Math.abs(Math.sin(ph));
      ctx.save(); ctx.globalAlpha *= 0.3 * (1 - (idle + hopY) / 40); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, p.y + 40, 24 - (idle + hopY) * 0.3, 7, 0, 0, TAU); ctx.fill(); ctx.restore();
      const spr = kit && kit.SPR.pet(id, mood), sz = 92, sx = 1 + (1 - k) * 0.05 + st.hop * 0.05, sy = 1 - (1 - k) * 0.05 - st.hop * 0.03;
      if (spr) { ctx.save(); ctx.translate(px, base - idle - hopY + 30); ctx.scale(sx, sy); ctx.translate(-px, -(base - idle - hopY + 30)); blit(spr, px, base - idle - hopY, sz, s2 * Math.sin(ph) * 0.08 + (scared ? Math.sin(S.t * 30) * 0.04 : 0)); ctx.restore(); }
      if (st.hop > 0.6) sparkleAt(px + s2 * 28, base - idle - hopY - 36, 7 + st.hop * 3);
    });
  }
  function idleSparkles(p, singing) {
    const n = singing ? 3 : 1;
    for (let i = 0; i < n; i++) { const a = S.t * 1.4 + i * 2.1, f = (S.t * 0.7 + i * 0.37) % 1; sparkleAt(p.x + Math.cos(a) * 60, p.y - 70 + Math.sin(a * 1.3) * 30 - f * 20, 5 * Math.sin(f * Math.PI)); }
  }

  function drawPlayer(g) {
    const p = g.p;
    if (p.iframes > 0 && Math.floor(S.t * 20) % 2 === 0 && !(p.shield > 0)) ctx.globalAlpha = 0.45;
    { const br = 1 + Math.sin(S.t * 2.2) * 0.04;   // 02-animal-art: soft two-layer shadow that breathes with the duo
      ctx.save(); ctx.globalAlpha *= 0.22; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 40, 66 * br, 17, 0, 0, TAU); ctx.fill(); ctx.globalAlpha *= 1.1; ctx.beginPath(); ctx.ellipse(p.x, p.y + 40, 44 * br, 10, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    if ((g.groove || 0) >= 10) glow(p.x, p.y - 20, 100 + (g.groove - 10) * 3, '#ff7eb6', 0.18 + 0.1 * Math.sin(S.t * 8));
    if (g.phase === 'play' && !OPT.reduceMotion) { const ph = beatPhase(g), a = Math.pow(1 - ph, 3) * 0.28; if (a > 0.02) { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#9ff3ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 46 + ph * 26, 0, TAU); ctx.stroke(); ctx.restore(); } }
    FX.aura(g);
    // aim tick
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim); ctx.globalAlpha *= 0.55; ctx.fillStyle = '#6fe3ff';
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(22, -6); ctx.lineTo(22, 6); ctx.fill(); ctx.restore();
    const singing = S.t - S.lastShot < 0.22;
    const key = singing ? 'duo_sing' : 'duo_idle';
    const moving = Math.hypot(p.mx, p.my) > 0.1, hop = S.t - S.lastShot < 0.12 ? 1 - (S.t - S.lastShot) / 0.12 : 0;
    const sq = 1 + Math.sin(S.t * (moving ? 9 : 2.6)) * (moving ? 0.05 : 0.018) + hop * 0.03;
    const im = art && art.get(key);
    if (im) { const h = 170, w = h * im.width / im.height; img(key, p.x, p.y - 26 - hop * 4, w / sq, h * sq, p.mx * 0.05 + (moving ? 0 : Math.sin(S.t * 1.3) * 0.012)); idleSparkles(p, singing); }
    else { glow(p.x, p.y, 40, '#39f0ff', 0.7); ctx.fillStyle = '#39f0ff'; ctx.strokeStyle = '#06323f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill(); ctx.stroke(); }
    petsDraw(g, p, singing);
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
      if (b.kind === 'snot') {   // doves leave drifting feathers and flap
        const fe = kit && kit.SPR.feather(), sp = Math.hypot(b.vx, b.vy) || 1;
        for (let j = 1; j <= 3; j++) { const f = (S.t * 3 + j * 0.33 + b.x * 0.01) % 1, d = 20 + f * 60; ctx.save(); ctx.globalAlpha *= (1 - f) * 0.8; blit(fe, b.x - b.vx / sp * d + Math.sin(S.t * 5 + j) * 14 * f * (j % 2 ? 1 : -1), b.y - b.vy / sp * d + f * 14, 30 * (1 - f * 0.4), S.t * 3 + j * 2); ctx.restore(); }
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1 + Math.sin(S.t * 22 + b.x) * 0.1, 1 - Math.sin(S.t * 22 + b.x) * 0.06); blit(kit && kit.SPR.weapon('dragon'), 0, 0, 118, Math.sin(S.t * 10 + b.x) * 0.25); ctx.restore(); continue;
      }
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
      { const pw = kit && kit.SPR.paw(), z0 = (z.x * 0.013) % 1;   // a paw print trail walks round the pad
        for (let j = 0; j < 6; j++) { const u = (S.t * 0.55 + j / 6 + z0) % 1, a = u * TAU, rr = z.r * 0.62, side = j % 2 ? 1 : -1;
          ctx.save(); ctx.globalAlpha = Math.min(1, Math.sin(u * Math.PI) * 1.6) * fade; blit(pw, z.x + Math.cos(a) * rr + Math.cos(a + 1.57) * side * 5, z.y + Math.sin(a) * rr * 0.8 + Math.sin(a + 1.57) * side * 5, 34, a + 1.57); ctx.restore(); } }
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
  const CX = W - 22 - 172, CY = 38;   // the coin counter in the HUD
  function drawShape(q) {
    const a = q.life / q.max, s = q.size * (0.5 + 0.5 * a);
    ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = q.col; ctx.strokeStyle = q.col;
    ctx.save(); ctx.translate(q.x, q.y);
    switch (q.sh) {
      case 'h': ctx.rotate(Math.sin(q.rot) * 0.4); ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.8, -s * 1.1, 0, -s * 0.4); ctx.bezierCurveTo(s * 0.8, -s * 1.1, s * 1.5, -s * 0.1, 0, s * 0.9); ctx.fill(); break;
      case 'f': ctx.rotate(q.rot); ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = i * Math.PI / 3; ctx.moveTo(Math.cos(an) * s, Math.sin(an) * s); ctx.lineTo(-Math.cos(an) * s, -Math.sin(an) * s); } ctx.stroke(); break;
      case 'd': ctx.beginPath(); ctx.moveTo(0, -s * 1.2); ctx.quadraticCurveTo(s * 0.9, s * 0.2, 0, s * 0.8); ctx.quadraticCurveTo(-s * 0.9, s * 0.2, 0, -s * 1.2); ctx.fill(); break;
      case 'n': ctx.rotate(Math.sin(q.rot) * 0.3); ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.6, s * 0.55, s * 0.4, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(s * 0.1, -s * 1.0, s * 0.2, s * 1.6); ctx.fillRect(s * 0.1, -s * 1.0, s * 0.7, s * 0.3); break;
      case 's': ctx.rotate(q.rot); ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i & 1 ? s * 0.35 : s * 1.1, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); break;
      default: ctx.rotate(q.rot); ctx.fillRect(-s * 0.6, -s * 0.3, s * 1.2, s * 0.6);   // confetti
    }
    ctx.restore();
  }
  function drawProps(dt) {
    for (let i = S.props.length - 1; i >= 0; i--) {   // chest cell pop: the chest hops out and flips its lid
      const p = S.props[i]; p.life -= dt; if (p.life <= 0) { S.props.splice(i, 1); continue; }
      p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 9;
      const cs = Math.cos(p.rot);
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 0.25); ctx.translate(p.x, p.y); ctx.scale(1, cs * 0.8 + (cs < 0 ? -0.2 : 0.2));
      blit(kit && kit.SPR.pickup('chest'), 0, 0, p.size); ctx.restore();
    }
    for (let i = S.coins.length - 1; i >= 0; i--) {   // coins arc to the coin counter
      const c = S.coins[i]; c.t += dt; const k = Math.min(1, c.t / c.dur);
      if (k >= 1) { S.coins.splice(i, 1); if (S.coins.length < 12) glow(CX, CY, 38, '#ffd24a', 0.5); continue; }
      const u = k * k * (3 - 2 * k), m = 1 - u;
      const x = m * m * c.x0 + 2 * m * u * c.cx + u * u * CX, y = m * m * c.y0 + 2 * m * u * c.cy + u * u * CY;
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.3, Math.abs(Math.cos(c.t * 14))), 1); blit(kit && kit.SPR.pickup('coin'), 0, 0, 40 - 14 * k); ctx.restore();
    }
  }
  function drawFx(dt) {
    for (let i = S.rings.length - 1; i >= 0; i--) {
      const r = S.rings[i]; r.life -= dt; if (r.life <= 0) { S.rings.splice(i, 1); continue; }
      const k = 1 - r.life / r.max;
      if (r.glow) { glow(r.x, r.y, r.r * (0.3 + 0.7 * k), '#ffd24a', (1 - k) * 0.7); continue; }
      ctx.save(); ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = r.col; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * k), 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const q = S.particles[i]; q.life -= dt; if (q.life <= 0) { S.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94;
      if (q.sh) { q.vy += q.g * dt; q.rot += q.vr * dt; drawShape(q); continue; }
      ctx.globalAlpha = q.life / q.max; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + 0.6 * q.life / q.max), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawProps(dt);
    for (let i = S.floats.length - 1; i >= 0; i--) {
      const f = S.floats[i]; f.life -= dt; if (f.life <= 0) { S.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; ctx.globalAlpha = Math.min(1, f.life / 0.3);
      if (f.pop > 0) { f.pop = Math.max(0, f.pop - dt * 8); text(f.str, f.x, f.y, Math.round(f.size * (1 + 0.3 * f.pop) / 2) * 2, f.col); }
      else text(f.str, f.x, f.y, f.size, f.col);
    }
    ctx.globalAlpha = 1;
  }

  let hud = null;   // the widgets live in hud.js
  function drawHud(g, ui) {
    const p = g.p, pad = 22;
    if (!hud) hud = createHud({ ctx, text, blit, kit, S, INK, glow, sparkleAt, WCOL, WSPR });
    hud.draw(g);
    if ((g.danger || 0) > 0.05 && g.phase === 'play') { const a = Math.min(0.5, g.danger * 0.45) * (0.65 + 0.35 * Math.sin(S.t * 14)); const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); rg.addColorStop(0, 'rgba(255,40,80,0)'); rg.addColorStop(1, `rgba(255,40,80,${a})`); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
    for (const sn of g.snakes) if (sn.surge === 'warn') { const h = sn.segs[0]; text('!', h.x, h.y - h.r - 34 + Math.sin(S.t * 20) * 4, 40, '#ff3d5a', '#0b1020'); }
    // Encore blast: the beam, the meter by the duo, and the tap hint
    if (g.beam) { const bw = (g.beam.w || 36), a = Math.min(1, g.beam.t * 3), x = g.beam.x; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const bg = ctx.createLinearGradient(x - bw * 1.7, 0, x + bw * 1.7, 0); bg.addColorStop(0, 'rgba(255,200,60,0)'); bg.addColorStop(0.35, `rgba(255,210,90,${0.55 * a})`); bg.addColorStop(0.5, `rgba(255,255,230,${a})`); bg.addColorStop(0.65, `rgba(255,210,90,${0.55 * a})`); bg.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = bg; ctx.fillRect(x - bw * 1.7, 0, bw * 3.4, g.p.y); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x - bw * 0.18, 0, bw * 0.36, g.p.y); ctx.restore(); }
    if (g.phase === 'play' && (g.encore || 0) > 0) { const ex = g.p.x, ey = g.p.y + 56, ew = 110, full = g.encore >= 1; ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(ex - ew / 2 - 3, ey - 3, ew + 6, 15); ctx.fillStyle = full ? '#ffe36b' : '#ff9ad6'; ctx.fillRect(ex - ew / 2, ey, ew * g.encore, 9); ctx.strokeStyle = full ? '#fff6c2' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(ex - ew / 2 - 3, ey - 3, ew + 6, 15); ctx.restore(); if (full) { ctx.save(); ctx.globalAlpha = 0.7 + 0.3 * Math.sin(S.t * 10); text('TAP = ENCORE', ex, ey + 32, 20, '#ffe36b', '#0b1020'); ctx.restore(); } }
    if (ui && ui.hints) drawHints(ctx, g, S, { glow, text });   // first-run guide (hints.js)
    if (g.combo > 2 && g.t - g.lastKill < 2.2) text('COMBO x' + g.combo, W / 2, 196, 24 + Math.min(10, g.combo * 0.3), '#ffe14a');
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
    if (FX) FX.update(dt, g);
    S.trauma = Math.max(0, S.trauma - dt * 1.6); S.flash = Math.max(0, S.flash - dt * 1.5);
    if (OPT.reduceMotion) { S.trauma = 0; S.flash = 0; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBg(g, L);
    const sh = S.trauma * S.trauma * 22 + FX.rumble();
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh); FX.zoomIn();
    for (const pk of g.pickups) drawPickup(pk);
    drawZones(g);
    for (const sn of g.snakes) drawSnake(g, sn);
    drawWeapons(g);
    if (g.phase !== 'dead') drawPlayer(g);
    drawBullets(g);
    drawFx(dt);
    ctx.restore();
    if (S.warn > 0) { S.warn -= dt; text('SURGE!', W / 2, 170 + (OPT.reduceMotion ? 0 : Math.sin(S.t * 40) * 4), 54 + (OPT.reduceMotion ? 0 : Math.sin(S.t * 30) * 4), '#ff5a78'); }
    FX.drawScreen(g);
    if (S.flash > 0) { ctx.save(); ctx.globalAlpha = S.flash * 0.5; ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (ui) drawHud(g, ui);
    if (ui) FX.drawCard(g);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  FX = createScreenFx({ ctx, W, H, kit, text, glow, S, OPT, ring, burst });

  return { timeScale: () => (FX ? FX.timeScale() : 1), setOptions(o) { Object.assign(OPT, o); }, draw, onEvent, layout, state: S, toGame(px, py) { const L = layout(); return { x: (px - L.ox) / L.s, y: (py - L.oy) / L.s }; } };
}
