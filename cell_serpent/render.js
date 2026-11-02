// Canvas renderer. Reads the sim state, never changes it. Uses sprites from art.js
// where they exist and draws procedural stand-ins otherwise.
import { W, H, isBossStage, LINE_Y, virusName, daggerPos, stickSeg, uv, beatPhase, pointAt } from './sim.js';
import { INK, mix } from './art_draw.js';
import { createHud, hudZone } from './hud.js';
import { createHitJuice } from './hitjuice.js';
import { createDigitAtlas } from './digits.js';
import { createScreenFx } from './screenfx.js';
import { drawFar } from './bg_far.js';
import { ringDanger } from './bg_mist.js';
import { bakeWorld, makeMotes, drawMotes, drawBeams, drawRing, createBgFx } from './bg_world.js';
import { drawHints } from './hints.js';
import { drawCellFlags, drawCellBadge, drawQuartetLinks, drawDashLane, drawStreak, drawChoirLinks } from './cellfx.js';
import { bakeHat } from './hats.js';
import { createCheer, HAT_FX, hatPose, EMOTE, heart, drawEmote } from './cheer.js';
import { cheerFrame } from './duo_cheer.js';
import { drawDuoLife } from './duo_idle.js';
import { createBoltLayer, boltPose, paintBolt } from './bolts_fx.js';

const TAU = Math.PI * 2;
const NUMS = [];
const num = v => { v = Math.ceil(v); if (v >= 0 && v < 1000) return NUMS[v] || (NUMS[v] = String(v)); return v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v); };

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
  const glowMemo = new Map(); let glowKit = null;
  function glow(x, y, r, col, a = 0.6) {
    if (glowKit !== kit) { glowKit = kit; glowMemo.clear(); }   // one Map lookup per glow instead of a new 'glow|' string and a cache lookup
    let spr = glowMemo.get(col);
    if (spr === undefined) { spr = kit && kit.bake('glow|' + col, 64, 64, g => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); }); if (spr) glowMemo.set(col, spr); }
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
    if (spr) ctx.drawImage(spr.c, x - r, y - r, r * 2, r * 2);
    else { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // text strips are looked up through nested maps (fill, stroke, size, string) so a hit allocates nothing: no key string, no font string
  const tcache = new Map(), tq = []; let tn = 0;
  function textSprite(str, size, fill, stroke) {
    let a = tcache.get(fill); if (!a) tcache.set(fill, a = new Map());
    let b = a.get(stroke); if (!b) a.set(stroke, b = new Map());
    let c = b.get(size); if (!c) b.set(size, c = new Map());
    let t = c.get(str);
    if (t === undefined) {
      const font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.font = font; const pad = Math.ceil(size * 0.3), w = Math.ceil(ctx.measureText(str).width) + pad * 2, h = Math.ceil(size * 1.5), d = kit.dpr;
      const cv = kit.makeCanvas(w * d, h * d);
      if (cv) { const g = cv.getContext('2d'); g.scale(d, d); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.2); g.strokeStyle = stroke; g.strokeText(str, w / 2, h / 2); g.fillStyle = fill; g.fillText(str, w / 2, h / 2); }
      t = { c: cv, w, h, pad };
      if (tn >= 500) { for (let n = 0; n < 160 && tq.length; n++) { const o = tq.shift(); o[0].delete(o[1]); tn--; } }
      c.set(str, t); tq.push([c, str]); tn++;
    }
    return t;
  }
  function text(str, x, y, size, fill = '#fff', stroke = '#10131c', align = 'center') {
    if (typeof str !== 'string') str = String(str);
    size = size >= 20 ? Math.round(size) : Math.round(size * 2) / 2;   // 17-perf: pulsing sizes share a few baked strips instead of baking one per frame
    if (kit && kit.makeCanvas) {
      const t = textSprite(str, size, fill, stroke);
      if (t.c) { ctx.drawImage(t.c, align === 'left' ? x - t.pad : align === 'right' ? x - t.w + t.pad : x - t.w / 2, y - t.h / 2, t.w, t.h); return; }
    }
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.2); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  // -------------------------------------------------- events -> particles
  const OPT = { reduceFlash: false, reduceMotion: false, lowQuality: false, bigNumbers: false, colorBlind: false, highContrast: false };
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
    if (f) { f.acc += e.d; f.str = num(f.acc); f.life = f.max = crit ? 0.9 : 0.72; f.pop = 1; f.vy = -60; if (crit) { f.col = '#ffe14a'; f.size = Math.max(f.size, 32); if (HJ) f.tier = Math.max(f.tier | 0, HJ.critTier()); } return; }
    let dn = 0; for (let i = 0; i < S.floats.length; i++) if (S.floats[i].key) dn++;
    if (dn >= (OPT.lowQuality ? 8 : 14) && !crit) return;   // cap: busy fights show fewer numbers, crits always show
    if (S.floats.length >= 60) return;
    const size = crit ? 34 : Math.min(32, 21 + Math.log2(e.d + 1) * 1.2);   // r6: never tiny on a phone (canvas is 720 wide)
    S.floats.push({ x: e.x + (Math.random() - 0.5) * 34, y: e.y - 14, str: num(e.d), acc: e.d, key, crit: !!crit, tier: crit && HJ ? HJ.critTier() : 0, src: e.src, col: crit ? '#ffe14a' : (HJ && HJ.tint(e.src)) || '#ffffff', size, vy: crit ? -85 : -60, life: crit ? 0.9 : 0.72, max: crit ? 0.9 : 0.72, pop: 1 });
  }
  let DG = null;   // digit atlas for the HP numbers (digits.js)
  let HJ = null;   // 04-hit-juice: orbs, smoke, muzzle flash, note trails (hitjuice.js)
  let lastDt = 0.016;
  let FX = null;   // whole-screen feedback (screenfx.js), created after the helpers below exist
  function onEvent(e, g) {
    if (FX) FX.onEvent(e, g);
    if (HJ) HJ.event(e, g);
    switch (e.t) {
      case 'hit':
        S.popped++;
        dmgFloat(e);
        if (e.crit) { ring(e.x, e.y, 70, '#ffe14a', 0.3); shaped(e.x, e.y, OPT.lowQuality ? 4 : 8, 's', ['#ffe14a', '#fff'], 300, 0.45, 9); }
        burst(e.x, e.y, e.crit ? 5 : 2, e.crit ? ['#ffe14a', '#fff'] : ['#fff', '#b9f3ff'], 160, 0.3, 3);
        break;
      case 'kill': {
        S.killT = S.t;
        const sp = kit && kit.SPECIES[e.skin];
        const sk = e.kind === 'upgrade' ? ['#ffd84d', '#fff1a8', '#fff'] : sp ? [sp.lite, sp.base, '#fff'] : ['#ff9ad6', '#e0489d', '#fff'];
        burst(e.x, e.y, e.head ? 40 : 14, sk, e.head ? 360 : 240, 0.7, 6);
        { const sh = POPSHAPE[e.skin] || 'c';
          shaped(e.x, e.y, e.head ? 14 : 7, sh, sp ? [sp.lite, sp.base, '#fff', sp.acc] : ['#ff9ad6', '#fff'], e.head ? 340 : 250, 0.9, e.head ? 11 : 8, 380); }
        { const ch = S.chain; ch.n = S.t - ch.t < 0.9 ? ch.n + 1 : 1; ch.t = S.t;
          const col = CHAIN_COL[Math.min(5, ch.n >> 1)];
          if (ch.n === 10 || ch.n === 25) { FX.onEvent({ t: 'chain', n: ch.n }, g); FX.confetti(ch.n === 25 ? 60 : 30); }
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
        if (e.head) { S.trauma = Math.min(1, S.trauma + 0.5); if (kit && !OPT.reduceMotion && S.props.length < 8) S.props.push({ k: 'dazed', skin: e.skin, boss: !!e.boss, x: e.x, y: e.y, vx: 0, vy: -90, rot: 0, life: 1.15, max: 1.15, size: e.r * 3.9 }); }   // 01-enemy-art r7: a dazed face floats up with its halo
        break;
      }
      case 'boom': ring(e.x, e.y, e.r, '#ff6a3d', 0.5); ring(e.x, e.y, e.r * 0.6, '#ffd24a', 0.35); burst(e.x, e.y, 30, ['#ff6a3d', '#ffd24a', '#fff'], 420, 0.6, 7); S.trauma = Math.min(1, S.trauma + 0.55); break;
      case 'splash': ring(e.x, e.y, e.r, '#7dff5e', 0.25); break;
      case 'encoreready': addFloat(g.p.x, g.p.y - 110, 'ENCORE READY: TAP!', '#ffe36b', 26, -50); ring(g.p.x, g.p.y, 120, '#ffe36b', 0.5); break;
      case 'encore': S.trauma = Math.min(1, S.trauma + 0.6); S.flash = 0.25; S.flashCol = '#fff6c2'; ring(e.x, g.p.y, 130, '#ffe36b', 0.5); burst(e.x, g.p.y - 40, 26, ['#ffe36b', '#fff', '#ff9ad6'], 520, 0.7, 6); break;
      case 'goldpop': ring(e.x, e.y, 110, '#ffd24a', 0.6); burst(e.x, e.y, 30, ['#ffd24a', '#fff6c2', '#fff'], 460, 0.8, 6); addFloat(e.x, e.y - 40, 'GOLD +' + e.v, '#ffe36b', 30, -80); break;
      case 'quartet': ring(e.x, e.y, 150, '#6fffd2', 0.6); burst(e.x, e.y, 28, ['#6fffd2', '#fff', '#fff6a8'], 440, 0.8, 6); addFloat(e.x, e.y - 40, (e.n >= 4 ? 'QUARTET ' + (e.streak >= 2 ? 'x' + e.streak + ' ' : '') + '+' : 'DUET +') + e.v, '#9bffe0', 30, -80); S.trauma = Math.min(1, S.trauma + 0.25); break;
      case 'quartetstart': addFloat(e.x, e.y - 30, 'HARMONY! ' + e.n + ' to go', '#fff6a8', 24, -50); break;
      case 'quartetfail': ring(e.x, e.y, 70, '#ff6a8a', 0.4); if (e.lost >= 2) addFloat(e.x, e.y - 30, 'STREAK LOST', '#ff9aae', 22, -50); break;
      case 'nap': addFloat(e.x, e.y - 40, 'Zzz...', '#b9c8ff', 30, -60); ring(e.x, e.y, 90, '#b9c8ff', 0.5); break;
      case 'trait': { const T = { love: ['HEART PULSE', '#ff8fb8'], rust: ['CREAK', '#e0a060'], sneezy: [e.warn ? 'a-a-a...' : 'ACHOO!', '#9dffc0'], frosty: ['FROST', '#bfe9ff'] }[e.k]; if (T) { addFloat(e.x, e.y - 40, T[0], T[1], e.warn ? 22 : 26, -50); if (!e.warn) ring(e.x, e.y, 100, T[1], 0.5); if (e.k === 'sneezy' && !e.warn) S.trauma = Math.min(1, S.trauma + 0.3); } break; }
      case 'bell': ring(e.x, e.y, 150, '#ffd9a0', 0.55); ring(e.x, e.y, 90, '#fff', 0.35); burst(e.x, e.y, 18, ['#ffd9a0', '#fff', '#ffb05a'], 380, 0.7, 5); addFloat(e.x, e.y - 36, 'DING!', '#ffe0a8', 28, -60); S.trauma = Math.min(1, S.trauma + 0.25); break;
      case 'gloom': addFloat(e.x, e.y - 40, 'GLOOM', '#b79bff', 26, -50); ring(e.x, e.y, 110, '#6a3fd0', 0.6); break;
      case 'soundcheck': ring(e.x, e.y, 80, '#ffd24a', 0.4); addFloat(e.x, e.y - 30, 'SOUNDCHECK', '#ffe36b', 20, -50); break;
      case 'goldfade': addFloat(e.x, e.y, 'gold lost', '#c9b36a', 18, -40); burst(e.x, e.y, 12, ['#c9b36a', '#8a7f5a', '#fff1a8'], 150, 0.8, 4); break;
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
      case 'lull': ring(e.x, e.y, 160, '#b79bff', 0.6); burst(e.x, e.y, 14, ['#d9c8ff', '#fff', '#b79bff'], 220, 0.7, 5); addFloat(e.x, e.y - 40, 'Lullaby', '#d9c8ff', 22, -40); break;
      case 'phase2': S.banner = { text: 'FINAL CHORUS', sub: 'The boss picks up the pace', t: 0, dur: 1.8 }; S.trauma = Math.min(1, S.trauma + 0.7); S.flash = 0.35; S.flashCol = '#ff9a4a'; ring(g.p.x, g.p.y, 360, '#ff9a4a', 0.8); break;
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
  // the layer key only changes with the stage, the scale or the colour-blind palette: build the string when one of those moves, not every frame
  const LK = { skin: '', stage: -1, s: -1, cb: -1, key: '' };
  function layerKey(g, k) {
    const cb = OPT.colorBlind ? 1 : 0;
    if (LK.skin !== g.skin || LK.stage !== g.stage || LK.s !== k || LK.cb !== cb) { LK.skin = g.skin; LK.stage = g.stage; LK.s = k; LK.cb = cb; LK.key = `${g.skin}|${g.stage}|${k.toFixed(1)}|${cb}`; }
    return LK.key;
  }
  function bgLayer(g, L) {
    const th = themeOf(g), k = Math.max(0.5, Math.min(1.5, L.s));
    return kit && kit.layer(layerKey(g, k), W, H, k, c => bakeWorld(c, g.skin, isBossStage(g.stage), !!g.ring, th, g.stage, 1));
  }
  function fgLayer(g, L) {   // everything in front of the far skyline
    const th = themeOf(g), k = Math.max(0.5, Math.min(1.5, L.s));
    return kit && kit.layer2 && kit.layer2(layerKey(g, k), W, H, k, c => bakeWorld(c, g.skin, isBossStage(g.stage), !!g.ring, th, g.stage, 2));
  }
  // boss phase 2: under 40% of the serpent left the arena heats up (bg_world.js drawBossPhase); eases in, one flash and shake when it starts
  function bossPhase(g) {
    if (!isBossStage(g.stage)) return 0;
    if (S.bpG !== g) { S.bpG = g; S.bpTot = 0; S.bph = 0; S.bpFlash = -9; S.bpOn = false; }
    let cur = 0, tot = 0;
    for (const sn of g.snakes) for (const q of sn.segs) if (q.i > 0 && q.hp > 0) { cur += q.hp; tot += q.max || q.hp; }
    if (!S.bpTot) S.bpTot = Math.max(1, tot);
    const on = cur > 0 && cur / S.bpTot < 0.4;
    if (on && !S.bpOn) { S.bpOn = true; S.bpFlash = S.t; if (!OPT.reduceMotion) S.trauma = Math.max(S.trauma || 0, 0.55); }
    S.bph += ((on ? 1 : 0) - S.bph) * 0.05;
    return S.bph;
  }
  // the stage world never paints on the letterbox bars of a tall phone (skyline, clouds, motes are clipped to the 720x1280 frame)
  function drawBg(g, L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0924'; ctx.fillRect(0, 0, L.cw, L.ch);
    ctx.save();
    if (L.ox > 0.5 || L.oy > 0.5) { ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); }
    drawBg0(g, L);
    ctx.restore(); ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
  }
  function drawBg0(g, L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0924'; ctx.fillRect(0, 0, L.cw, L.ch);
    ctx.setTransform(L.s, 0, 0, L.s, L.ox, L.oy);
    const lay = bgLayer(g, L), th = themeOf(g);
    if (lay) {   // sky, then the far skyline sliding against the duo (bg_far.js), then the hills, floor and frame
      ctx.drawImage(lay.c, 0, 0, W, H);
      drawFar(ctx, kit, { skin: g.skin, boss: isBossStage(g.stage), stage: g.stage, t: S.t, px: g.p.x, reduce: OPT.reduceMotion, low: OPT.lowQuality, lit: Math.min(1, g.progress || 0), pop: S.t - (S.killT === undefined ? -9 : S.killT) });
      const fg = fgLayer(g, L); if (fg) ctx.drawImage(fg.c, 0, 0, W, H);
    }
    else { ctx.fillStyle = '#1a1445'; ctx.fillRect(0, 0, W, H); }
    // drifting bokeh lights and themed motes (petals, snow, droplets, notes, stars, bubbles)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0, nb = OPT.lowQuality ? 3 : 6; i < nb; i++) {   // low quality: fewer big translucent discs
      const sp = S.specks[i], y = (sp.y + S.t * sp.v) % (H + 120) - 60, x = sp.x + Math.sin(S.t * 0.3 + sp.a) * 16, hue = sp.i % 3;
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(S.t + sp.a); ctx.fillStyle = hue === 0 ? th.base : hue === 1 ? '#6fe3ff' : th.lite;
      ctx.beginPath(); ctx.arc(x, y, sp.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (!OPT.reduceMotion) { if (!S.motes) S.motes = makeMotes(); if (!OPT.lowQuality) drawBeams(ctx, S.t, isBossStage(g.stage), th, kit); drawMotes(ctx, g.skin, th, OPT.lowQuality ? (S.motesLow || (S.motesLow = S.motes.filter((m, i) => i % 2 === 0))) : S.motes, S.t, S.bgfx ? S.bgfx.wx || 0 : 0); }
    // weather, speaker thump, crowd and lightning (bg_world.js)
    const bph = bossPhase(g);
    const bgp = (S.bgfx || (S.bgfx = createBgFx())).draw(ctx, { kit, skin: g.skin, phase: bph, flash: OPT.reduceFlash ? 0 : Math.max(0, 1 - (S.t - S.bpFlash) / 0.55), noFlash: OPT.reduceFlash, stage: g.stage, boss: isBossStage(g.stage), th, t: S.t, reduce: OPT.reduceMotion, low: OPT.lowQuality, kick: S.t - (S.killT === undefined ? -9 : S.killT), snakes: g.snakes });
    // the stage floor below the line, where the duo stands; if the snake touches the line it is over
    if (g.ring) { drawRing(ctx, g.ring, S.t, isBossStage(g.stage), OPT.reduceMotion ? 0.4 : bgp, kit, g.skin, OPT.reduceMotion ? 0 : ringDanger(g.snakes, g.ring)); if (OPT.highContrast) hcLine(g.ring); return; }   // a circle around the duo in the middle
    ctx.save(); ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { const y = LINE_Y + Math.sin(x * 0.05 + S.t * 2.2) * 5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,90,140,.18)'; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,150,190,.75)'; ctx.stroke(); ctx.restore();
    if (OPT.highContrast) hcLine(null);
  }
  // high contrast: the line (or the circle) is a solid white stroke with a black edge, readable on any background
  function hcLine(ring) {
    ctx.save(); ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); if (ring) ctx.arc(ring.cx, ring.cy, ring.R, 0, TAU); else for (let x = 0; x <= W; x += 20) { const y = LINE_Y + Math.sin(x * 0.05 + S.t * 2.2) * 5; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
    path(); ctx.lineWidth = 11; ctx.strokeStyle = '#000'; ctx.stroke(); path(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }

  function drawSnake(g, sn) {
    const segs = sn.segs, p = g.p;
    if (sn.lane) drawDashLane(ctx, sn.path || g.path, pointAt, sn, S.t);
    drawChoirLinks(ctx, sn, S.t);
    for (let i = segs.length - 1; i >= 0; i--) {   // tail first so the head sits on top
      const s = segs[i], r = s.r;
      if (s.y < -r * 3 || s.y > H + r * 3) continue;   // not on screen: skip the drawing
      const ang = s.ang;
      if (i === 0) {
        if (kit) { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1; kit.drawHead(ctx, s.x, s.y, r * 1.14, ang, { skin: sn.skin, boss: sn.boss, t: S.t + sn.id, look: [dx / d, dy / d], flash: s.flash, sg: OPT.reduceMotion ? '' : sn.surge, slow: sn.slow, p2: sn.p2, alone: !s.shield, panic: !sn.boss && sn.surge === 'idle' && g.danger > 0.55 && sn.segs[0].y > H * 0.5 && !g.ring ? Math.min(1, (g.danger - 0.55) / 0.3) : 0, fury: sn.surge !== 'idle' ? 1 : (g.danger > 0.5 && sn.segs[0].y > H * 0.5 ? 0.6 : 0) }); }
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
        ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(S.t * 14 + i) * 0.15; ctx.fillStyle = sn.p2 ? 'rgba(255,190,140,.22)' : 'rgba(190,235,255,.2)'; ctx.strokeStyle = sn.p2 ? '#ffd9b8' : '#e6f6ff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.3, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (s.gold) { const live = s.goldT > 0; glow(s.x, s.y, r * (live ? 2.3 : 1.5), '#ffd24a', live ? 0.55 + Math.sin(S.t * 9 + i) * 0.2 : 0.15); if (live) { ctx.save(); ctx.strokeStyle = s.goldT > 2.5 ? '#fff1a8' : (Math.sin(S.t * 22) > 0 ? '#ff9a6a' : '#fff1a8'); ctx.lineWidth = s.goldT > 2.5 ? 5 : 5 + (2.5 - s.goldT) * 1.2; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.18, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, s.goldT / 9)); ctx.stroke(); ctx.restore(); } }
      if (s.ward || s.warded || s.lull || s.drum || s.choir || s.quartet || s.bell || s.frost) drawCellFlags(ctx, s, r, S.t, i, glow);
      if (s.kind === 'bomb') { const pulse = 0.5 + Math.sin(S.t * 9 + i) * 0.5; glow(s.x, s.y, r * 1.8, '#ff3b5c', 0.15 + pulse * 0.25); }
      if (s.kind === 'mender') glow(s.x, s.y, r * 1.7, '#6fe08a', 0.35 + Math.sin(S.t * 5 + i) * 0.12);
      if (s.kind === 'upgrade') glow(s.x, s.y, r * 2.1, '#ffd24a', 0.45 + Math.sin(S.t * 6 + i) * 0.15);
      if (i === segs.length - 1 && i > 1 && kit) { const ts = kit.SPR.tail(sn.skin); if (ts) kit.blit(ctx, ts, s.x, s.y, ts.w * r * 1.22 / kit.B, ang + Math.PI + Math.sin(S.t * 5 - i * 0.5) * 0.18); }   // 01-enemy-art r7: the tail tip wags
      const spr = kit && kit.SPR.body(sn.skin, sn.boss, s.kind === 'normal' ? (s.gold && s.goldT > 0 ? (s.goldT > 2.5 ? 'gold' : Math.sin(S.t * (30 - s.goldT * 8) + i) > 0 ? 'gold2' : 'gold') : '') : s.kind);   // the last 2.5s the leaf flickers off and on, faster and faster
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
        if (sn.slow > 0) blit(kit.SPR.frost(), s.x, s.y, r * 2.7, 0, false, Math.min(1, sn.slow * 2));
        if (s.kind === 'bomb') { const f = 0.6 + Math.sin(S.t * 18 + i) * 0.4; sparkleAt(s.x + r * 0.1, s.y - r * 1.2, r * 0.3 * f); }
        if (s.kind === 'upgrade') sparkleAt(s.x + r * 0.55 + Math.sin(S.t * 4 + i) * 4, s.y - r * 0.55, r * 0.3);
      } else { ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke(); }
      if (s.carry === 'chest') { glow(s.x, s.y, r * 1.8, '#ffd84d', 0.5 + Math.sin(S.t * 6 + i) * 0.2); blit(kit && kit.SPR.pickup('chest'), s.x, s.y - r * 0.9, r * 2.2, Math.sin(S.t * 4 + i) * 0.1); }
      if (OPT.highContrast) { ctx.save(); ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.02, 0, TAU); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore(); }
      if (OPT.highContrast) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.beginPath(); ctx.arc(s.x, s.y + r * 0.05, r * 0.62 * (OPT.bigNumbers ? 1.15 : 1), 0, TAU); ctx.fill(); ctx.restore(); }
      if (s.gold && kit) { const live = s.goldT > 0; blit(kit.SPR.badge(live ? 'coin' : 'coinx'), s.x - r * 0.62 + (live && s.goldT < 2.5 ? Math.sin(S.t * 50 + i) * r * 0.06 : 0), s.y - r * 0.7 + Math.sin(S.t * 3 + i) * 2, r * 1.0, live && s.goldT < 2.5 ? Math.sin(S.t * 30 + i) * 0.22 : Math.sin(S.t * 2 + i) * 0.12, false, live ? 1 : 0.75); if (live && Math.sin(S.t * 4 + i * 2) > 0.8) sparkleAt(s.x + r * 0.5, s.y + r * 0.5, r * 0.26); }
      if (s.ward || s.lull || s.drum || s.choir || s.quartet || s.bell) drawCellBadge(ctx, s, r, S.t, i, kit);
      { const hs = Math.max(20, r * 0.85) * (OPT.bigNumbers ? 1.2 : 1), hc = OPT.highContrast ? '#000' : INK; if (!DG || !DG.draw(ctx, num(s.hp), s.x, s.y + r * 0.05, hs, '#fff', hc)) text(num(s.hp), s.x, s.y + r * 0.05, hs, '#fff', hc); }
      if (OPT.colorBlind && (s.kind !== 'normal' || s.carry === 'chest')) kindMark(s.carry === 'chest' && s.kind === 'normal' ? 'chest' : s.kind, s.x, s.y - r * 1.02, r * 0.36);
      if (s.kind === 'mender') { glow(s.x, s.y, r * 1.7, '#6fe08a', 0.35 + Math.sin(S.t * 5 + i) * 0.12); ctx.save(); ctx.fillStyle = '#6fe08a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; const q = r * 0.34; for (const [px, py, w2, h2] of [[-q * 0.35, -q, q * 0.7, q * 2], [-q, -q * 0.35, q * 2, q * 0.7]]) { ctx.fillRect(s.x + px, s.y - r * 0.95 + py + q, w2, h2); ctx.strokeRect(s.x + px, s.y - r * 0.95 + py + q, w2, h2); } ctx.restore(); }
    }
    drawQuartetLinks(ctx, sn, S.t);
    if (sn.slow > 0) { const h = segs[0]; glow(h.x, h.y, h.r * 2, '#7fe8ff', 0.3); }
  }
  // colour-blind mode: every special cell kind gets its own white badge shape (star, square, triangle, plus, diamond)
  function kindMark(kind, x, y, q) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    if (kind === 'upgrade') { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? q * 0.5 : q * 1.15; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
    else if (kind === 'armor') ctx.rect(-q * 0.85, -q * 0.85, q * 1.7, q * 1.7);
    else if (kind === 'bomb') { ctx.moveTo(0, -q * 1.1); ctx.lineTo(q * 1.1, q * 0.85); ctx.lineTo(-q * 1.1, q * 0.85); ctx.closePath(); }
    else if (kind === 'mender') { const w = q * 0.38; ctx.moveTo(-w, -q); ctx.lineTo(w, -q); ctx.lineTo(w, -w); ctx.lineTo(q, -w); ctx.lineTo(q, w); ctx.lineTo(w, w); ctx.lineTo(w, q); ctx.lineTo(-w, q); ctx.lineTo(-w, w); ctx.lineTo(-q, w); ctx.lineTo(-q, -w); ctx.lineTo(-w, -w); ctx.closePath(); }
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
  const CH = createCheer(); let cheerHit = false;   // 02-animal-art r4: pets cheer on kill streaks
  // 02-animal-art: fire reactions (kitten swats a paw, puppy wags its tail) and idle emotes (turtle Zzz, lamb hums, piglet hearts)
  function petExtras(id, st, px, py, s2, i) {
    const h = st.hop;
    if (id === 'puppy') {   // tail behind the pet, wags fast after a shot
      const sk = slumpK(), w = Math.sin(S.t * (h > 0.05 ? 40 : 5)) * (h > 0.05 ? 0.7 : 0.25) * (1 - sk), bx = px + s2 * 28, by = py + 30;   // r7: the tail drops limp when the streak breaks
      ctx.save(); ctx.translate(bx, by); ctx.rotate(s2 * (0.45 + sk * 2.2) + w + sk * Math.sin(S.t * 3) * 0.05); ctx.lineCap = 'round'; ctx.strokeStyle = '#2d1a14'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s2 * 14, -14, s2 * 8, -30); ctx.stroke(); ctx.strokeStyle = '#d9a066'; ctx.lineWidth = 6.5; ctx.stroke(); ctx.restore();
    } else if (id === 'kitten' && h > 0.1) {   // a paw swats up and out
      const u = 1 - h, a = -1.9 + u * 1.5 * s2 * 0 - s2 * u * 1.1; ctx.save(); ctx.globalAlpha = Math.min(1, h * 2.2); blit(kit && kit.SPR.paw(), px + s2 * (30 + u * 26), py - 8 - u * 38, 34 + h * 12, a + (s2 > 0 ? 0.6 : -0.6)); ctx.restore();
      ctx.save(); ctx.globalAlpha = h * 0.7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(px + s2 * 30, py - 4, 32 + u * 12, s2 > 0 ? -1.4 : Math.PI + 0.2, s2 > 0 ? -0.3 : Math.PI + 1.3); ctx.stroke(); ctx.restore();
    } else {
      const ph = (S.t * 0.35 + i * 0.5 + (id.length * 0.13)) % 1;
      if (id === 'turtle') { if (slumpK() < 0.1) for (let j = 0; j < 2; j++) { const f = (ph + j * 0.5) % 1; ctx.save(); ctx.globalAlpha = Math.sin(f * Math.PI) * 0.8; ctx.fillStyle = '#e8f4ff'; ctx.strokeStyle = '#3a4a6a'; ctx.lineWidth = 3; ctx.font = `bold ${14 + j * 6}px sans-serif`; ctx.textAlign = 'center'; ctx.strokeText('z', px + s2 * (26 + f * 16), py - 40 - f * 30); ctx.fillText('z', px + s2 * (26 + f * 16), py - 40 - f * 30); ctx.restore(); } }
      else if (id === 'lamb' && ph < 0.6) { const f = ph / 0.6; ctx.save(); ctx.globalAlpha = Math.sin(f * Math.PI); ctx.translate(px + s2 * (-20 + Math.sin(f * 6) * 8), py - 46 - f * 34); ctx.scale(0.45, 0.45); blit(kit && kit.SPR.note(false), 0, 0, 66, Math.sin(f * 5) * 0.3); ctx.restore(); }
      else if (id === 'piglet' && ph < 0.5) { const f = ph / 0.5; ctx.save(); ctx.globalAlpha = Math.sin(f * Math.PI); ctx.fillStyle = '#ff5a7e'; ctx.translate(px + s2 * 30, py - 46 - f * 28); const k = 5 + f * 3; ctx.beginPath(); ctx.moveTo(0, k); ctx.bezierCurveTo(-k * 2, -k * 0.6, -k * 0.8, -k * 1.8, 0, -k * 0.6); ctx.bezierCurveTo(k * 0.8, -k * 1.8, k * 2, -k * 0.6, 0, k); ctx.fill(); ctx.restore(); }
      else if (id === 'hamster' && ph < 0.4) { const f = ph / 0.4; sparkleAt(px + s2 * 14, py + 10 + f * 14, 4 * Math.sin(f * Math.PI)); }
    }
  }
  // 09-skills-pets r6: a pet at full happiness glows pink at its feet and puffs a heart or its own emote every few seconds
  function joyEmote(px, py, gy, s2, i, id) {
    const T = 3.4, ph = ((S.t + i * 1.7) % T) / T;
    ctx.save(); ctx.globalAlpha *= 0.22 + 0.1 * Math.sin(S.t * 4 + i); ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.ellipse(px, gy, 30, 9, 0, 0, TAU); ctx.fill(); ctx.restore();
    if (ph < 0.34) {
      const f = ph / 0.34, a = Math.sin(f * Math.PI), sig = EMOTE[id], x = px + s2 * 4 + Math.sin(f * 7) * 7, y = py - 58 - f * 36;
      ctx.save(); ctx.globalAlpha *= a; const r = 6 + a * 3;
      if (sig && (((S.t + i * 1.7) / T) | 0) % 2) drawEmote(ctx, x, y, r * 1.1, S.t * 3, sig); else heart(ctx, x, y, r, '#ff7eb6');
      ctx.restore();
    }
  }
  // the streak broke (hitjuice sets S.slump): the pets sink, squash and tilt for a second, eyes shut, with a blue sweat drop
  function slumpK() { const u = S.slump ? (S.t - S.slump.t) / 1.1 : 1; return OPT.reduceMotion || u < 0 || u >= 1 ? 0 : (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85); }
  function slumpDrop(x, y, k) { ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(x, y + (1 - k) * 16); ctx.fillStyle = '#7fd8ff'; ctx.strokeStyle = '#1b4a72'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -11); ctx.bezierCurveTo(9, 0, 8, 9, 0, 9); ctx.bezierCurveTo(-8, 9, -9, 0, 0, -11); ctx.fill(); ctx.stroke(); ctx.restore(); }
  function petsDraw(g, p, singing) {
    const ps = g.pets || [];
    let near = 1e9; for (const sn of g.snakes) { const h = sn.segs[0]; if (h) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < near) near = d; } }
    const scared = near < 330;
    ps.forEach((id, i) => {
      const st = petState[i] || (petState[i] = { hop: 0, last: 0 });
      if (S.lastShot !== st.last) { st.last = S.lastShot; st.hop = 1; }
      if (kit && st.warm !== id) { st.warm = id; kit.SPR.pet(id, 7); }   // r7: bake the slump face ahead of time so the sigh never hitches
      st.hop = Math.max(0, st.hop - 0.016 * 4.5);
      const bop = !OPT.reduceMotion && g.phase === 'play' && (g.groove || 0) >= 6 ? Math.pow(1 - beatPhase(g), 4) * (g.groove >= 10 ? 9 : 5) : 0;   // groove: the pets bop on the beat
      const ch = OPT.reduceMotion ? null : CH.pet(i, i ? 1 : -1, id);
      const s2 = i ? 1 : -1, ph = S.t * 6 + i * 2, idle = Math.abs(Math.sin(ph)) * (scared ? 3 : 8) * (ch ? 0.3 : 1), hopY = Math.sin(st.hop * Math.PI) * 14 + (ch ? ch.y : 0) + bop - slumpK() * 9;
      const px = p.x + s2 * 92 + Math.sin(S.t * 1.7 + i) * 6, base = p.y + 8;
      const blink = (S.t * 0.8 + i * 1.7) % 3.1 < 0.13;
      const sl = slumpK(), mood = sl > 0.2 ? 7 : st.hop > 0.35 || ch ? 3 : scared ? 2 : blink ? 1 : 0;   // slump: eyes shut
      const k = Math.abs(Math.sin(ph));
      ctx.save(); ctx.globalAlpha *= 0.3 * (1 - (idle + hopY) / 40); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, p.y + 40, 24 - (idle + hopY) * 0.3, 7, 0, 0, TAU); ctx.fill(); ctx.restore();
      const spr = kit && kit.SPR.pet(id, mood), sz = 92, sx = 1 + (1 - k) * 0.05 + st.hop * 0.05 + sl * 0.1, sy = 1 - (1 - k) * 0.05 - st.hop * 0.03 - sl * 0.12;
      if (cheerHit && !OPT.reduceMotion) CH.burst(px, base - 40, Math.max(0, CH.tier), id);
      if (spr) { ctx.save(); ctx.translate(px, base - idle - hopY + 30); ctx.scale(sx * (ch ? ch.sq * ch.sx : 1), sy / (ch ? ch.sq : 1)); ctx.translate(-px, -(base - idle - hopY + 30)); blit(spr, px, base - idle - hopY, sz, s2 * Math.sin(ph) * 0.08 + (scared ? Math.sin(S.t * 30) * 0.04 : 0) + (ch ? ch.flip : 0) - s2 * sl * 0.2); ctx.restore(); }
      if (st.hop > 0.6) sparkleAt(px + s2 * 28, base - idle - hopY - 36, 7 + st.hop * 3);
      petExtras(id, st, px, base - idle - hopY, s2, i);
      if (g.petJoy && g.petJoy[i] && !OPT.reduceMotion) joyEmote(px, base - idle - hopY, p.y + 40, s2, i, id);
      if (sl > 0.15) slumpDrop(px + s2 * 30, base - idle - hopY - 34, sl);
    });
    cheerHit = false;
    if (!OPT.reduceMotion) CH.draw(ctx, lastDt, kit, sparkleAt, blit);
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
    FX.aura(g); drawStreak(ctx, g, S.t);
    // aim tick
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim); ctx.globalAlpha *= 0.55; ctx.fillStyle = '#6fe3ff';
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(22, -6); ctx.lineTo(22, 6); ctx.fill(); ctx.restore();
    const singing = S.t - S.lastShot < 0.22;
    const key = singing ? 'duo_sing' : 'duo_idle';
    const moving = Math.hypot(p.mx, p.my) > 0.1, hop = S.t - S.lastShot < 0.12 ? 1 - (S.t - S.lastShot) / 0.12 : 0;
    const sq = 1 + Math.sin(S.t * (moving ? 9 : 2.6)) * (moving ? 0.05 : 0.018) + hop * 0.03;
    const im = art && art.get(key), dch = OPT.reduceMotion ? null : CH.duo(S.t), dY = dch ? dch.y : 0;   // 02-animal-art r5: the duo hops on a streak
    const cf = dch && im ? cheerFrame(art.get('duo_idle')) : null;   // r7: arms up while the cheer lasts
    if (cf) { const h = 170, w = h * im.width / im.height, dq = dch.sq; ctx.save(); ctx.translate(p.x, p.y - 26 - hop * 4 - dY); ctx.rotate(p.mx * 0.05 + dch.rot); const ww = w / sq / dq, hh = h * sq * dq; ctx.drawImage(cf, -ww / 2, -hh / 2, ww, hh); ctx.restore(); idleSparkles(p, singing); }
    else if (im && !OPT.reduceMotion && im.width === 520) {   // r7: R and J sway on their own phases, heads nod on the beat
      const h = 170, w = h * im.width / im.height, dq = dch ? dch.sq : 1, ww = w / sq / dq, hh = h * sq * dq, nod = g.phase === 'play' ? Math.pow(1 - beatPhase(g), 5) * ((g.groove || 0) >= 6 ? 1 : 0.5) : 0.3;
      ctx.save(); ctx.translate(p.x, p.y - 26 - hop * 4 - dY); ctx.rotate(p.mx * 0.05 + (dch ? dch.rot : 0)); drawDuoLife(ctx, im, ww, hh, S.t, nod, moving ? 0.35 : 1); ctx.restore(); idleSparkles(p, singing);
    }
    else if (im) { const h = 170, w = h * im.width / im.height, dq = dch ? dch.sq : 1; img(key, p.x, p.y - 26 - hop * 4 - dY, w / sq / dq, h * sq * dq, p.mx * 0.05 + (moving ? 0 : Math.sin(S.t * 1.3) * 0.012) + (dch ? dch.rot : 0)); idleSparkles(p, singing); }
    else { glow(p.x, p.y, 40, '#39f0ff', 0.7); ctx.fillStyle = '#39f0ff'; ctx.strokeStyle = '#06323f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill(); ctx.stroke(); }
    petsDraw(g, p, singing);
    drawHog(g);
    if (g.outfit) { glow(p.x, p.y - 20, 70, g.outfit.color, 0.22); const hs = bakeHat(kit, g.outfit.hat), hb = Math.sin(S.t * 4) * 3;
      if (hs) { const hp = hatPose(g.outfit.hat, OPT.reduceMotion ? 0 : CH.t, S.t), fxk = OPT.reduceMotion ? null : HAT_FX[g.outfit.hat]; ctx.save(); ctx.translate(p.x - 4, p.y - 108 + hb + hp.dy - dY); ctx.rotate(Math.sin(S.t * 2.4) * 0.05 + p.mx * 0.08 + hp.rot); ctx.scale(hp.sx, hp.sx); ctx.drawImage(hs.c, -48, -48, 96, 96); if (fxk) fxk(ctx, S.t, CH.t); ctx.restore(); if (!OPT.reduceMotion) { const f = (S.t * 0.9) % 1; sparkleAt(p.x - 4 + Math.cos(S.t * 3) * 30, p.y - 122 + hb - f * 22, 5 * Math.sin(f * Math.PI)); } }
      else { ctx.save(); ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.outfit.hat, p.x - 4, p.y - 124 + hb); ctx.restore(); } }
    // hitbox core: the part that actually gets hurt
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff5a78'; ctx.beginPath(); ctx.arc(p.x, p.y + 10, 3.5, 0, TAU); ctx.fill();
    if (p.shield > 0) { ctx.strokeStyle = `rgba(80,210,255,${0.5 + Math.sin(S.t * 10) * 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 54, 0, TAU); ctx.stroke(); glow(p.x, p.y, 60, '#39d0ff', 0.25); }
    if (p.rage > 0) glow(p.x, p.y, 70, '#ffb020', 0.3 + Math.sin(S.t * 14) * 0.1);
    ctx.globalAlpha = 1;
  }

  function noteTrail(b, col) {
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, L = b.crit ? 66 : 46, w = b.crit ? 8 : 5.5;
    ctx.save(); ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) { ctx.globalAlpha *= 0.5; ctx.strokeStyle = j === 2 ? '#fff' : col; ctx.lineWidth = w * (1 - j * 0.3); ctx.beginPath(); ctx.moveTo(b.x - ux * 12, b.y - uy * 12); ctx.lineTo(b.x - ux * L * (1 - j * 0.28), b.y - uy * L * (1 - j * 0.28)); ctx.stroke(); }
    ctx.restore();
    if (b.crit) { const f = (S.t * 5 + b.x * 0.03) % 1; ctx.save(); ctx.globalAlpha *= 1 - f; sparkleAt(b.x - ux * (20 + f * 44) + Math.sin(S.t * 9 + b.x) * 8, b.y - uy * (20 + f * 44), 7 * (1 - f * 0.5)); ctx.restore(); }
  }
  function drawBullets(g) {
    if (HJ) HJ.bullets(g.bullets, lastDt);
    for (const b of g.bullets) {
      if (b.kind === 'needle') { const na = Math.atan2(b.vy, b.vx); ctx.save(); ctx.globalAlpha *= 0.28; ctx.strokeStyle = '#ff9ac6'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.x - Math.cos(na) * 34, b.y - Math.sin(na) * 34); ctx.lineTo(b.x - Math.cos(na) * 96, b.y - Math.sin(na) * 96); ctx.stroke(); ctx.restore(); blit(kit && kit.SPR.weapon('needle'), b.x, b.y, 140, na); continue; }
      if (b.kind === 'snot') {   // doves leave drifting feathers and flap
        const fe = kit && kit.SPR.feather(), sp = Math.hypot(b.vx, b.vy) || 1;
        for (let j = 1; j <= 3; j++) { const f = (S.t * 3 + j * 0.33 + b.x * 0.01) % 1, d = 20 + f * 60; ctx.save(); ctx.globalAlpha *= (1 - f) * 0.8; blit(fe, b.x - b.vx / sp * d + Math.sin(S.t * 5 + j) * 14 * f * (j % 2 ? 1 : -1), b.y - b.vy / sp * d + f * 14, 30 * (1 - f * 0.4), S.t * 3 + j * 2); ctx.restore(); }
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1 + Math.sin(S.t * 22 + b.x) * 0.04, 1 - Math.sin(S.t * 22 + b.x) * 0.04); blit(kit && kit.SPR.weapon('dragon', Math.sin(S.t * 22 + b.x) > 0 ? 5 : 6), 0, 0, 132, Math.sin(S.t * 10 + b.x) * 0.25); ctx.restore(); continue;
      }
      if (b.kind === 'bubble') { blit(kit && kit.SPR.weapon('bubble'), b.x, b.y, b.r * 4.84, Math.sin(S.t * 3 + b.x) * 0.2); continue; }
      const col = b.crit ? '#ffd84d' : '#6fe3ff';
      if (b.crit) glow(b.x, b.y, 30, col, 0.55);
      if (!OPT.lowQuality) noteTrail(b, col);   // 02-animal-art r4: notes leave a short comet tail, crits add glints
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
  // 02-animal-art: weapon animals share the pet moods: 1 blink, 2 alert when a head is close, 0 calm
  let wScared = false;
  function wMood(seed) { return wScared ? 2 : (S.t * 0.8 + seed * 0.37) % 3.3 < 0.13 ? 1 : 0; }
  const hog = { n: 0, puff: 0 };
  function drawHog(g) {   // the hedgehog sits at the duo's feet and puffs its quills on every volley
    if (!g.weap.needles) return;
    let n = 0; for (const b of g.bullets) if (b.kind === 'needle') n++;
    if (n > hog.n) hog.puff = 1; hog.n = n; hog.puff = Math.max(0, hog.puff - 0.016 * 4);
    const p = g.p, pf = hog.puff, tx = p.x < W / 2 ? p.x + 150 : p.x - 150; hog.x = hog.x == null ? tx : hog.x + (tx - hog.x) * 0.08; const x = hog.x, y = p.y + 8 - Math.sin(pf * Math.PI) * 8;
    ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, p.y + 44, 26, 6, 0, 0, TAU); ctx.fill(); ctx.restore();
    if (pf > 0.5) glow(x, y, 46, '#ffd9a0', (pf - 0.5) * 0.6);
    blit(kit && kit.SPR.weapon('hog', pf > 0.25 ? 4 : wMood(7)), x, y, 96 * (1 + pf * 0.3), Math.sin(S.t * 3) * 0.04 + (pf > 0.25 ? Math.sin(S.t * 60) * 0.06 : 0));
  }
  function drawWeapons(g) {
    { wScared = false; for (const sn of g.snakes) { const h = sn.segs[0]; if (h && Math.hypot(h.x - g.p.x, h.y - g.p.y) < 330) { wScared = true; break; } } }
    for (const t of g.towers) {   // Speaker Stacks thump
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 38, 32, 9, 0, 0, TAU); ctx.fill(); ctx.restore();
      const mk = Math.max(0, t.pulse) / 0.5;   // 02-animal-art: the cow moos on every pulse, speaker rings roll out
      if (mk > 0) { for (let j = 0; j < 3; j++) { const u = Math.min(1, (1 - mk) + j * 0.0); const rr = 40 + (1 - mk) * 50 + j * 16; ctx.save(); ctx.globalAlpha = Math.max(0, mk - j * 0.18) * 0.7; ctx.strokeStyle = j ? '#6fe3ff' : '#fff'; ctx.lineWidth = 4 - j; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(t.x, t.y - 4, rr, sd > 0 ? -0.7 : Math.PI - 0.7 + 0.0, sd > 0 ? 0.7 : Math.PI + 0.7); ctx.stroke(); } ctx.restore(); } }
      blit(kit && kit.SPR.weapon('tower', mk > 0.1 ? 4 : wMood(t.x)), t.x, t.y, 160 * (1 + 0.14 * Math.max(0, t.pulse)), Math.sin(S.t * 3 + t.x) * 0.03 + (mk > 0.1 ? Math.sin(S.t * 50) * 0.05 : 0));
    }
    const dl = g.weap.daggers ? g.weap.daggers.lv : 0;   // Spinning Vinyl
    for (let i = 0; i < (dl ? 1 + dl : 0); i++) { const d = daggerPos(g, i); const dy = d.y + Math.sin(S.t * 8 + i) * 4; for (let j = 1; j <= 3; j++) { const q = daggerPos(g, i), a = S.t * 7 + i * 2 - j * 0.28; ctx.save(); ctx.globalAlpha = 0.22 / j; ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(d.x - Math.cos(a + 1.57) * j * 9, dy - Math.sin(a + 1.57) * j * 9 + 6, 22 - j * 4, 0, TAU); ctx.fill(); ctx.restore(); }   // chick circle: a yellow trail
      blit(kit && kit.SPR.weapon('dagger', wMood(i * 53)), d.x, dy, 150, Math.sin(S.t * 7 + i) * 0.2); }
    if (g.weap.stick) for (let k = 0; k < (g.weap.stick.lv >= 4 ? 2 : 1); k++) {   // Drumsticks
      const sg = stickSeg(g, k), sc = sg.len / 144, mid = 80 * sc;
      blit(kit && kit.SPR.weapon('stick'), sg.x0 + Math.cos(sg.a) * mid, sg.y0 + Math.sin(sg.a) * mid, 184 * sc, sg.a);
    }
    for (const m of g.maws) {   // Bass Drop: a sub-bass vortex with a thump
      const k = Math.min(1, m.life * 3, (m.max - m.life) * 4) || 0, ph = (S.t * 2) % 1;
      ctx.save(); ctx.globalAlpha = 0.92 * k; const ch = Math.sin(S.t * 13 + m.x) > 0;   // the bulldog chomps: jaw open and shut with teeth
      for (let j = 0; j < 3; j++) { const a = S.t * 4 + j * 2.09; ctx.strokeStyle = 'rgba(255,126,182,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.9, a, a + 0.8); ctx.stroke(); }
      blit(kit && kit.SPR.weapon('maw', ch ? 4 : wMood(m.x)), m.x, m.y + (ch ? 3 : 0), m.r * 3.4 * (ch ? 1.05 : 1 + 0.06 * Math.sin(S.t * 14)), Math.sin(S.t * 9) * 0.1); ctx.restore();
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.8 * k; ctx.strokeStyle = '#ff7eb6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.2 + 0.8 * ph), 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (let i = S.bolts.length - 1; i >= 0; i--) { const b = S.bolts[i]; b.life -= 0.016; if (b.life <= 0) S.bolts.splice(i, 1); }   // Spotlight Storm: a beam from the rig above
    if (S.bolts.length) {
      const layered = S.bolts.length >= 2 && (S.boltLayer || (S.boltLayer = createBoltLayer(kit))).draw(ctx, S.bolts);   // 2+ beams: one half-res additive layer
      for (let i = 0; i < S.bolts.length; i++) {
        const b = S.bolts[i], p = boltPose(b, S.boltPose || (S.boltPose = {}));
        if (!layered) {   // owl perches up top, its beam sweeps onto the target
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff1a8'; paintBolt(ctx, b, p); ctx.restore();
        }
        blit(kit && kit.SPR.weapon('perch', p.age > 0.8 ? 1 : p.age < 0.3 ? 2 : 0), p.ox, p.oy, 96, Math.sin(p.age * 9 + b.seed) * 0.12, false, Math.min(1, p.a * 2.2));
      }
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
      if (p.k === 'dazed') { const u = 1 - p.life / p.max, sp = kit && kit.SPR.dazed(p.skin, p.boss); p.y += p.vy * dt; p.vy *= 1 - Math.min(1, dt * 2.2); if (sp) { ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 0.4); const sc = 0.7 + Math.min(1, u * 5) * 0.3 + Math.sin(u * 9) * 0.04; kit.blit(ctx, sp, p.x, p.y, p.size * sc, Math.sin(u * 7) * 0.22); for (let q = 0; q < 3; q++) { const a = S.t * 5 + q * 2.094; sparkleAt(p.x + Math.cos(a) * p.size * 0.5, p.y - p.size * 0.46 + Math.sin(a) * p.size * 0.1, p.size * 0.16); } ctx.restore(); } continue; }
      p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 9;
      const cs = Math.cos(p.rot);
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 0.25); ctx.translate(p.x, p.y); ctx.scale(1, cs * 0.8 + (cs < 0 ? -0.2 : 0.2));
      blit(kit && kit.SPR.pickup('chest'), 0, 0, p.size); ctx.restore();
    }
    for (let i = S.coins.length - 1; i >= 0; i--) {   // coins arc to the coin counter
      const c = S.coins[i]; c.t += dt; const k = Math.min(1, c.t / c.dur);
      if (k >= 1) { S.coins.splice(i, 1); S.land.coin = S.t; if (S.coins.length < 12) glow(CX, CY, 38, '#ffd24a', 0.5); HJ.coinLand(CX, CY); continue; }
      const u = k * k * (3 - 2 * k), m = 1 - u;
      const x = m * m * c.x0 + 2 * m * u * c.cx + u * u * CX, y = m * m * c.y0 + 2 * m * u * c.cy + u * u * CY;
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.3, Math.abs(Math.cos(c.t * 14))), 1); blit(kit && kit.SPR.pickup('coin'), 0, 0, 40 - 14 * k); ctx.restore(); HJ.coinSpark(x, y, k);
    }
  }
  function drawFx(dt, g) {
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
    HJ.draw(dt, g);
    for (let i = S.floats.length - 1; i >= 0; i--) {
      const f = S.floats[i]; f.life -= dt; if (f.life <= 0) { S.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; ctx.globalAlpha = Math.min(1, f.life / 0.3);
      if (HJ.float(f)) { if (f.pop > 0) f.pop = Math.max(0, f.pop - dt * 8); continue; }
      if (f.pop > 0) { f.pop = Math.max(0, f.pop - dt * 8); text(f.str, f.x, f.y, Math.round(f.size * (1 + 0.3 * f.pop) / 2) * 2, f.col); }
      else text(f.str, f.x, f.y, f.size, f.col);
    }
    ctx.globalAlpha = 1;
  }

  let hud = null;   // the widgets live in hud.js
  function getHud() { return hud || (hud = createHud({ ctx, text, blit, kit, S, INK, glow, sparkleAt, WCOL, WSPR, OPT, onReady: id => { if (OPT.onReady) OPT.onReady(id); }, onMilestone: n => { if (OPT.onMilestone) OPT.onMilestone(n); } })); }
  function drawHud(g, ui) {
    const p = g.p, pad = 22;
    getHud().draw(g, layout());

    for (const sn of g.snakes) if (sn.surge === 'warn') { const h = sn.segs[0]; text('!', h.x, h.y - h.r - 34 + Math.sin(S.t * 20) * 4, 40, '#ff3d5a', '#0b1020'); }
    // Encore blast: the beam, the meter by the duo, and the tap hint
    if (g.beam) {   // 17-perf: the beam profile is baked once (a 1-row strip), stretched to the beam: no gradient per frame
      const bw = (g.beam.w || 36), a = Math.min(1, g.beam.t * 3), x = g.beam.x, ww = bw * 3.4;
      const spr = kit && kit.bake('beam|strip', 96, 4, q => {
        q.globalCompositeOperation = 'lighter'; const bg = q.createLinearGradient(-48, 0, 48, 0);
        bg.addColorStop(0, 'rgba(255,200,60,0)'); bg.addColorStop(0.35, 'rgba(255,210,90,.55)'); bg.addColorStop(0.5, 'rgba(255,255,230,1)'); bg.addColorStop(0.65, 'rgba(255,210,90,.55)'); bg.addColorStop(1, 'rgba(255,200,60,0)');
        q.fillStyle = bg; q.fillRect(-48, -2, 96, 4); q.fillStyle = '#fff'; q.fillRect(-48 * 0.106, -2, 96 * 0.106, 4);
      });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
      if (spr) ctx.drawImage(spr.c, x - ww / 2, 0, ww, g.p.y);
      else { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x - bw * 0.6, 0, bw * 1.2, g.p.y); }
      ctx.restore();
    }
    hud.encore(g);   // the meter lives in hud.js
    if (ui && ui.hints) drawHints(ctx, g, S, { glow, text });   // first-run guide (hints.js)
    hud.combo(g);
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
    lastDt = dt; S.t += dt; if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.dur) S.banner = null; }
    if (FX) FX.update(dt, g);
    if (g && g.phase === 'play' && CH.step(g, dt)) { cheerHit = true; if (!OPT.reduceMotion) S.flash = Math.max(S.flash, 0.12), S.flashCol = '#ffe9a8'; }
    S.trauma = Math.max(0, S.trauma - dt * 1.6); S.flash = Math.max(0, S.flash - dt * 1.5);
    if (OPT.reduceMotion) { S.trauma = 0; S.flash = 0; } else if (OPT.reduceFlash) S.flash = 0;   // reduce flashing alone keeps the shake and the motion
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBg(g, L);
    const sh = S.trauma * S.trauma * 22 + FX.rumble(), boxed = L.ox > 0.5 || L.oy > 0.5;
    if (boxed) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); }   // letterbox: snakes entering from above or the sides never draw on the bars
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh); FX.zoomIn();
    for (const pk of g.pickups) drawPickup(pk);
    drawZones(g);
    HJ.under(g);
    for (const sn of g.snakes) drawSnake(g, sn);
    drawWeapons(g);
    if (g.phase !== 'dead') drawPlayer(g);
    drawBullets(g);
    drawFx(dt, g);
    ctx.restore();
    if (boxed) ctx.restore();
    if (S.warn > 0) { S.warn -= dt; text('SURGE!', W / 2, 170 + (hud ? hud.dy(g) : 0) + (OPT.reduceMotion ? 0 : Math.sin(S.t * 40) * 4), 54 + (OPT.reduceMotion ? 0 : Math.sin(S.t * 30) * 4), '#ff5a78'); }
    FX.drawScreen(g);
    if (S.flash > 0) { ctx.save(); ctx.globalAlpha = S.flash * 0.5; ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (ui) drawHud(g, ui);
    if (ui) FX.drawCard(g);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  DG = kit && kit.bake ? createDigitAtlas(kit) : null;
  HJ = createHitJuice({ ctx, S, OPT, glow, ring, burst, shaped, text, blit, sprite: k => kit && kit.SPR.pickup(k), sound: n => { if (FX) FX.state.sounds.push(n); } });
  FX = createScreenFx({ ctx, W, H, kit, art, text, glow, S, OPT, ring, burst });

  return { hj: HJ, timeScale: () => (FX ? FX.timeScale() : 1), setBeat: fn => FX.setBeat(fn), clearBusy: () => FX.clearBusy(), resumeFx: g => FX.resumeFx(g), takeSounds: () => FX.takeSounds(), setOptions(o) { Object.assign(OPT, o); }, draw, onEvent, layout, state: S, hudPress: z => getHud().press(z), safeTop: () => (hud ? hud.top() : 0), hudZone: gp => hudZone(gp, hud ? hud.top() : 0), toGame(px, py) { const L = layout(); return { x: (px - L.ox) / L.s, y: (py - L.oy) / L.s }; } };
}
