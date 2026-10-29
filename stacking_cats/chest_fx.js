// The chest opening choreography for the lootbox screen (showBox in main.js keeps the game logic and calls this).
// One rAF loop drives the chest as a little spring body (squash, stretch, wobble, tremble), the lid, the glow and a small particle
// canvas (sparks, dust puffs, suction streaks, confetti, debris, the lid trail). Only transform and opacity change per frame.
// Beats: idle (float, breathe, glow pulse, drifting motes), hit (press flat and wide, spring back with overshoot, harder rattle,
// light leaking from the seam), upgrade (colour flash, ring, sparks), inhale (about 0.56 s: compress, stretch tall, tremble,
// light blazing, a freeze frame) and burst (lid blasts off spinning, shockwave, rays, confetti, debris, camera punch and a
// full-screen flash, #chestflash on <body>, that peaks just before the reveal screen takes over and fades out over it).
// Without motion every beat jumps to its end state at once and there is no flash.
import * as ART from './art_boxes.js';

const TAU = Math.PI * 2;
// the timeline (ms). inhale: the held breath after the last tap; swap: when showBox hands over to the reveal, counted from burst.
// The flash rises from the burst, peaks at flashPeak and holds until swap, then fades over flashFade on top of the reveal screen.
export const CHEST_T = { inhale: 560, squash: 110, freeze: 470, swap: 480, flashPeak: 360, flashFade: 450 };
const FLASH_RGB = { common: '255,230,140', rare: '120,190,255', epic: '205,130,255', legendary: '255,190,60', mythic: '255,110,190' };
const DEBRIS = { cardboard: ['#d9a869', '#b8874f', '#f2dfae'], basket: ['#e0b068', '#b4803e', '#8fb8e8'], silver: ['#e4edf8', '#9fb0c8', '#5ab4f0'], golden: ['#ffd860', '#d9961a', '#c0304a'] };
const MYTHIC = ['255,110,190', '160,120,255', '120,200,255', '255,220,90', '255,255,255'];
// the stage layout (CSS px of the 960 x 540 game stage): the chest picture is S x S, the particle canvas FW x FH centred on it
const S = 200, FW = 900, FH = 520, CX = FW / 2, CY = FH / 2;

const reducedPref = () => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const parts = (tier) => { try { return typeof ART.boxParts === 'function' ? ART.boxParts(tier, 320) : null; } catch (e) { return null; } };
const crackArt = (tier, lv) => { try { return typeof ART.boxCrackOverlay === 'function' ? ART.boxCrackOverlay(tier, lv, 320) : null; } catch (e) { return null; } };

// the markup of the stage, placed by setScreen (the layer names are what index.html styles). hero: a data URL of boxHero, the
// fallback picture until the layered art is swapped in by createChestScene.
export function chestHtml({ tier, rgb, hero, name }) {
  return `<div class="boxstage cx t-${tier}" style="--bg:${rgb}"><div class="boxvig"></div><div class="boxglow"></div><div class="boxbeams"></div><div class="cxshadow"></div>`
    + `<div class="boxic t-${tier}" data-act="crack" aria-label="${name}"><div class="cxbody"><img class="boxhero lo" src="${hero}" alt="${name}"><div class="cxcracks"></div><div class="cxpour"></div><div class="cxseam"></div><div class="cxlid"><img class="boxhero hi" src="${hero}" alt="" aria-hidden="true"><div class="cxcracks up"></div></div></div></div>`
    + `<div class="cxleak"></div><canvas class="cxfx" aria-hidden="true"></canvas><div class="boxring"></div><div class="boxring b"></div><div class="boxflash"></div></div>`;
}

// soft round particle sprites, one per colour, drawn once
const spriteCache = new Map();
function dotSprite(rgb) {
  if (spriteCache.has(rgb)) return spriteCache.get(rgb);
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, `rgba(${rgb},.95)`); gr.addColorStop(0.55, `rgba(${rgb},.28)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  spriteCache.set(rgb, c);
  return c;
}

// the body-level flash that outlives the screen swap (one element, reused)
function flashEl() {
  let f = document.getElementById('chestflash');
  if (!f) { f = document.createElement('div'); f.id = 'chestflash'; f.setAttribute('aria-hidden', 'true'); document.body.appendChild(f); }
  return f;
}

export function createChestScene(el, o = {}) {
  const tier = o.tier || 'cardboard';
  const motion = o.motion !== false && !reducedPref() && !document.body.classList.contains('nomotion');
  const shake = o.shake == null ? 1 : +o.shake;
  const q = (s) => el.querySelector(s);
  const ic = q('.boxic'), body = q('.cxbody'), lid = q('.cxlid'), seam = q('.cxseam'), cracksEl = q('.cxcracks'), cracksUp = q('.cxcracks.up'), glow = q('.boxglow'), beams = q('.boxbeams'), leak = q('.cxleak'), pour = q('.cxpour'), shadow = q('.cxshadow'), vig = q('.boxvig'), cv = q('.cxfx');
  let rgb = o.rgb || '255,230,140';
  // the layered art: body and lid canvases that overlay exactly, crack overlays per level, the glow layer behind the opening
  let seamY = 0.57, hingeY = 0.46, seamW = 0.76;
  const P = parts(tier), cracks = [];
  if (P) {
    const k = 1 / P.w;
    seamY = P.seam.y * k; seamW = P.seam.w * k; hingeY = P.hinge.y * k;
    el.classList.add('parts');
    const lo = q('.boxhero.lo'), hi = q('.boxhero.hi');
    const put = (img, src) => { if (img && src) img.src = src.toDataURL(); };
    put(lo, P.body); put(hi, P.lid);
    if (P.glow) { const g = document.createElement('img'); g.className = 'cxglowart'; g.alt = ''; g.src = P.glow.toDataURL(); pour.appendChild(g); }
    for (let lv = 1; lv <= 3; lv++) {
      const c = crackArt(tier, lv); if (!c) break;
      const src = c.toDataURL(), pair = [cracksEl, cracksUp].map((box) => { const im = document.createElement('img'); im.alt = ''; im.src = src; box.appendChild(im); return im; });
      cracks.push(pair);
    }
  }
  el.style.setProperty('--seam', (seamY * 100).toFixed(1) + '%');
  el.style.setProperty('--seamw', (seamW * 100).toFixed(1) + '%');
  el.style.setProperty('--hinge', (hingeY * 100).toFixed(1) + '%');
  const SEAM = CY - S / 2 + seamY * S;   // the seam line in canvas px

  // ---- state
  const st = {
    t: 0, q: 0, qv: 0, r: 0, rv: 0, y: 0, press: 0, pressQ: 0,   // squash (q > 0 flat and wide, q < 0 tall), wobble r (deg), press timer
    trem: 0, heat: 0, heatT: 0, pulse: 0,                    // rattle amplitude (px), how hot the chest is (0..1), a short glow pulse
    lidY: 0, lidV: 0, flying: false, lx: 0, ly: 0, lvx: 0, lvy: 0, lr: 0, lvr: 0, ls: 1,
    phase: 'idle', pt: 0, freeze: 0, burstAt: 0, alive: true, mote: 0,
  };
  const ps = [];
  const MAXP = 320;
  const add = (p) => { if (ps.length < MAXP) ps.push(p); };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- canvas sizing (backing store follows the on-screen scale, capped)
  let ctx = null, kpx = 1;
  const fitCanvas = () => {
    if (!cv || !motion) return;
    const r = cv.getBoundingClientRect(), scr = r.width ? r.width / FW : 1;
    kpx = Math.max(0.5, Math.min(2, scr * (window.devicePixelRatio || 1)));
    cv.width = Math.round(FW * kpx); cv.height = Math.round(FH * kpx);
    ctx = cv.getContext('2d');
  };

  // ---- particles
  const sparks = (x, y, n, sp, col, o2 = {}) => {
    for (let i = 0; i < n; i++) {
      const a = o2.a != null ? o2.a + rnd(-o2.spread, o2.spread) : rnd(0, TAU), v = rnd(sp * 0.35, sp);
      add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o2.g == null ? 500 : o2.g, drag: o2.drag || 2.4, life: rnd(0.35, o2.life || 0.8), age: 0, s: rnd(o2.s0 || 5, o2.s1 || 12), c: Array.isArray(col) ? col[i % col.length] : col });
    }
  };
  const puffs = (n, big) => {   // dust squeezed out from under the chest
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      add({ k: 'puff', x: CX + side * rnd(50, 70), y: CY + S * 0.38 + rnd(-4, 4), vx: side * rnd(90, 190) * (big ? 1.6 : 1), vy: rnd(-40, -10), g: -20, drag: 3.2, life: rnd(0.4, 0.7), age: 0, s: rnd(10, 18) * (big ? 1.5 : 1) });
    }
  };
  const motes = () => add({ k: 'mote', x: CX + rnd(-110, 110), y: CY + rnd(-20, 70), vx: rnd(-8, 8), vy: rnd(-36, -18), g: 0, drag: 0, life: rnd(1.4, 2.4), age: 0, s: rnd(5, 9), tw: rnd(0, TAU) });
  const streaks = (n) => {   // light and dust sucked into the chest
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), d = rnd(230, 430);
      add({ k: 'suck', x: CX + Math.cos(a) * d, y: SEAM + Math.sin(a) * d * 0.62, life: 1, age: 0, sp: rnd(380, 620), s: rnd(1.6, 3.4), c: Math.random() < 0.4 ? '255,255,255' : rgb });
    }
  };
  const ringP = (r0, r1, life, w, c) => add({ k: 'ring', x: CX, y: SEAM, r0, r1, life, age: 0, w, c });

  const step = (dt) => {
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { ps.splice(i, 1); continue; }
      if (p.k === 'suck') {
        const dx = CX - p.x, dy = SEAM - p.y, d = Math.hypot(dx, dy) || 1;
        p.sp += 1800 * dt;
        const mv = Math.min(d, p.sp * dt);
        p.px = p.x; p.py = p.y; p.x += (dx / d) * mv; p.y += (dy / d) * mv;
        if (d < 26) { ps.splice(i, 1); continue; }
        continue;
      }
      if (p.k === 'ring') continue;
      p.vy += (p.g || 0) * dt;
      const dr = Math.exp(-(p.drag || 0) * dt); p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
  };
  const draw = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(kpx, 0, 0, kpx, 0, 0);
    for (const p of ps) {
      const f = p.age / p.life;
      if (p.k === 'puff') {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.45 * (1 - f);
        const s = p.s * (1 + f * 1.6); ctx.drawImage(dotSprite('235,225,255'), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.k === 'suck') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, p.age * 6);
        ctx.strokeStyle = `rgba(${p.c},.95)`; ctx.lineWidth = p.s; ctx.lineCap = 'round';
        const tl = Math.min(0.06, p.sp / 9000);
        const dx = CX - p.x, dy = SEAM - p.y, d = Math.hypot(dx, dy) || 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (dx / d) * p.sp * tl, p.y - (dy / d) * p.sp * tl); ctx.stroke();
      } else if (p.k === 'ring') {
        const e = 1 - Math.pow(1 - f, 3), r = p.r0 + (p.r1 - p.r0) * e;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - f) * 0.9;
        ctx.strokeStyle = `rgba(${p.c},1)`; ctx.lineWidth = p.w * (1 - f * 0.7);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.8, 0, 0, TAU); ctx.stroke();
      } else if (p.k === 'conf' || p.k === 'deb') {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = f > 0.75 ? (1 - f) * 4 : 1;
        const c = Math.cos(p.rot), s = Math.sin(p.rot), flip = p.k === 'conf' ? Math.abs(Math.cos(p.rot * 1.7)) * 0.85 + 0.15 : 1;
        ctx.setTransform(kpx * c, kpx * s, -kpx * s * flip, kpx * c * flip, p.x * kpx, p.y * kpx);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        if (p.k === 'deb') { ctx.strokeStyle = 'rgba(42,29,74,.9)'; ctx.lineWidth = 1.4; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.setTransform(kpx, 0, 0, kpx, 0, 0);
      } else {   // spark, mote, trail: a soft glowing dot with a white core, motes twinkle
        ctx.globalCompositeOperation = 'lighter';
        let a = p.k === 'mote' ? Math.sin(f * Math.PI) * (0.55 + 0.45 * Math.sin(p.tw + p.age * 9)) : (1 - f) * (1 - f * 0.3);
        if (p.k === 'trail') a = (1 - f) * 0.8;
        ctx.globalAlpha = Math.max(0, a);
        const s = p.s * (p.k === 'trail' ? 1 + f : 1 - f * 0.5);
        ctx.drawImage(dotSprite(p.c || rgb), p.x - s, p.y - s, s * 2, s * 2);
        if (p.k !== 'trail' && s > 4) {   // a little four point twinkle
          ctx.fillStyle = 'rgba(255,255,255,.9)'; const w = s * 0.12, l = s * 0.9;
          ctx.fillRect(p.x - l, p.y - w, l * 2, w * 2); ctx.fillRect(p.x - w, p.y - l, w * 2, l * 2);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  // ---- the frame: spring physics, then write transforms
  const K = 520, C = 15, KR = 300, CR = 11;
  let raf = 0, last = 0;
  const frame = (now) => {
    raf = 0;
    if (!st.alive) return;
    if (!el.isConnected) { destroy(); return; }
    let dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const frozen = st.freeze > 0;
    if (frozen) { st.freeze -= dt; dt = 0; }   // the freeze frame: hold everything, draw again
    st.t += dt; st.pt += dt;
    const t = st.t;
    // squash spring; a press pulls q toward its target first (being pressed), then the spring lets go with overshoot
    if (st.press > 0) { st.press -= dt; st.q += (st.pressQ - st.q) * Math.min(1, dt * 34); st.qv = 0; }
    else { st.qv += (-K * st.q - C * st.qv) * dt; st.q += st.qv * dt; }
    st.rv += (-KR * st.r - CR * st.rv) * dt; st.r += st.rv * dt;
    st.trem = Math.max(st.heat * 1.4, st.trem - dt * 9);
    st.pulse = Math.max(0, st.pulse - dt * 2.6);
    // lid: hops on a hit and falls back with a little bounce
    if (!st.flying) {
      st.lidV += 2600 * dt; st.lidY += st.lidV * dt;
      if (st.lidY > 0) { st.lidY = 0; st.lidV = st.lidV > 120 ? -st.lidV * 0.32 : 0; }
    } else {
      st.lvy += 2500 * dt; st.lx += st.lvx * dt; st.ly += st.lvy * dt; st.lr += st.lvr * dt; st.ls += dt * 0.9;
      if (dt > 0) add({ k: 'trail', x: CX + st.lx, y: CY - S * 0.14 + st.ly, vx: 0, vy: 0, g: 0, drag: 0, life: 0.32, age: 0, s: 26 * st.ls });
    }
    // phase scripts
    let bob = 0, br = 0, hot = st.heat, sx, sy, extraY = 0, jit = st.trem;
    if (st.phase === 'idle') {
      bob = Math.sin(t * 3.4) * 4.5; br = Math.sin(t * 1.7 + 0.6) * 1.2;
      st.mote -= dt; if (st.mote <= 0) { motes(); st.mote = 0.28 - st.heat * 0.12; }
    } else if (st.phase === 'inhale') {
      const tt = st.pt * 1000;
      if (tt < CHEST_T.squash) { st.q += (0.26 - st.q) * Math.min(1, dt * 26); st.qv = 0; jit = 1.5; }
      else if (tt < CHEST_T.freeze) {
        const u = (tt - CHEST_T.squash) / (CHEST_T.freeze - CHEST_T.squash);
        st.q += (-0.16 - 0.06 * u - st.q) * Math.min(1, dt * 18); st.qv = 0;
        jit = 2 + u * 7; extraY = -u * 8;
        if (dt > 0) streaks(Math.round(2 + u * 4));
        if (Math.random() < 0.4) st.lidV = Math.min(st.lidV, -rnd(80, 200) * (0.5 + u));
      } else { jit = 0; extraY = -8; st.q = -0.23; st.qv = 0; }
      if (frozen) { jit = 0; extraY = -8; st.q = -0.23; }
      hot = Math.min(1, 0.55 + st.pt * 1.3);
    } else if (st.phase === 'burst') {
      jit = 0; hot = Math.max(0.35, 1 - st.pt * 2.5);   // the glow eases so the open chest shows under the light
    }
    sy = 1 - st.q; sx = 1 + st.q * 0.9;
    if (st.phase === 'idle') { const br2 = Math.sin(t * 3.4 + 1.2) * 0.022; sy += br2; sx -= br2 * 0.8; }
    const jx = jit ? (Math.random() - 0.5) * 2 * jit : 0, jy = jit ? (Math.random() - 0.5) * jit : 0;
    {
      body.style.transform = `translate(${(jx).toFixed(2)}px,${(jy - bob + extraY).toFixed(2)}px) rotate(${(st.r + br).toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
      if (st.flying) lid.style.transform = `translate(${st.lx.toFixed(1)}px,${st.ly.toFixed(1)}px) rotate(${st.lr.toFixed(1)}deg) scale(${st.ls.toFixed(3)})`;
      else lid.style.transform = `translateY(${(st.lidY).toFixed(2)}px) rotate(${(st.lidY * 0.12).toFixed(2)}deg)`;
      const gl = Math.min(0.85, 0.36 + Math.sin(t * 2.6) * 0.12 + hot * 0.4 + st.pulse * 0.4);
      glow.style.opacity = gl.toFixed(3);
      glow.style.transform = `scale(${(0.9 + Math.sin(t * 2.6) * 0.05 + hot * 0.3 + st.pulse * 0.15).toFixed(3)})`;
      const lift = Math.max(0, -st.lidY);
      seam.style.opacity = Math.min(1, hot * 0.85 + lift * 0.08 + (st.phase === 'inhale' ? 0.3 : 0) + (Math.random() - 0.5) * 0.12 * hot).toFixed(3);
      seam.style.transform = `scale(${(0.8 + hot * 0.25).toFixed(3)},${(1 + Math.min(lift, 12) * 0.06 + hot * 0.45).toFixed(3)})`;
      leak.style.opacity = Math.min(1, hot * hot * 0.7 + lift * 0.04 + (st.phase === 'inhale' ? st.pt * 1.4 : 0)).toFixed(3);
      leak.style.transform = `translate(${jx.toFixed(1)}px,${(jy - bob + extraY).toFixed(1)}px) scale(${(0.7 + hot * 0.5).toFixed(3)},${(0.6 + hot * 0.7).toFixed(3)})`;
      shadow.style.transform = `scale(${(sx * (1 - bob * 0.018)).toFixed(3)},1)`;
      shadow.style.opacity = (0.55 - bob * 0.02).toFixed(3);
    }
    step(dt);
    draw();
    if (st.alive && (st.phase !== 'done' || ps.length)) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (motion && !raf && st.alive) { last = 0; raf = requestAnimationFrame(frame); } };

  // camera: individual transform properties so they stack on top of the jolt class (which animates transform)
  const root = el.closest('.screen');
  const camera = (peak, ms) => {
    if (!root || !root.animate || !motion) return;
    try { root.animate([{ scale: '1' }, { scale: String(peak), offset: 0.18 }, { scale: String(1 - (peak - 1) * 0.25), offset: 0.55 }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)' }); } catch (e) { /* older engines: no punch */ }
  };
  const anim = (node, kf, opt) => { try { return node && node.animate ? node.animate(kf, opt) : null; } catch (e) { return null; } };

  // ---- the beats
  const setHeat = (h) => {
    st.heat = h;
    const lv = Math.max(0, Math.min(cracks.length, Math.round(h * 3)));
    cracks.forEach((pair, i) => { for (const im of pair) im.style.opacity = i === lv - 1 ? '1' : '0'; });
    el.style.setProperty('--heat', h.toFixed(3));
  };
  const markCentre = () => {   // where the chest is, for the reveal card to fly out of (viewport fractions)
    try {
      const r = ic.getBoundingClientRect(), W = window.innerWidth || 1, H = window.innerHeight || 1;
      document.body.dataset.chestX = ((r.left + r.width / 2) / W).toFixed(4);
      document.body.dataset.chestY = ((r.top + r.height * seamY) / H).toFixed(4);
    } catch (e) { /* only a hint for the reveal */ }
  };

  // i: the tap (0 based), total: taps it takes to open; the last tap calls inhale instead
  const hit = (i, total) => {
    const k = i + 1, n = Math.max(2, total || 3), h = k / n;
    setHeat(h);
    if (!motion) return;
    st.press = 0.055; st.pressQ = 0.18 + 0.05 * k;
    st.rv += (i % 2 ? 1 : -1) * (90 + 40 * k);
    st.trem = 3 + 2.4 * k; st.pulse = 1;
    st.lidV = -(260 + 120 * k);
    puffs(4 + k, false);
    sparks(CX, SEAM, 6 + 4 * k, 260 + 60 * k, [rgb, '255,255,255'], { a: -Math.PI / 2, spread: 1.3, g: 700, life: 0.6 });
    camera(1.012 + 0.004 * k, 260);
    kick();
  };
  const upgrade = (newRgb) => {
    rgb = newRgb || rgb;
    el.style.setProperty('--bg', rgb);
    if (!motion) return;
    st.pulse = 1.6; st.rv += 160; st.press = 0.04; st.pressQ = 0.3;
    anim(q('.boxflash'), [{ opacity: 0.7 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    anim(q('.boxring'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(13)' }], { duration: 600, easing: 'cubic-bezier(.1,.7,.3,1)' });
    ringP(20, 260, 0.55, 10, rgb);
    sparks(CX, SEAM, 30, 520, [rgb, '255,255,255', '255,210,63'], { g: 300, life: 0.9, s1: 14 });
    kick();
  };
  // the held breath: returns how long it lasts (ms); burst follows (showBox schedules it, a tap can bring it forward)
  const inhale = () => {
    setHeat(1);
    markCentre();
    if (!motion) return 0;
    st.phase = 'inhale'; st.pt = 0;
    el.classList.add('inhaling');
    anim(vig, [{ opacity: 0 }, { opacity: 1 }], { duration: CHEST_T.inhale, easing: 'ease-in', fill: 'forwards' });
    anim(beams, [{ opacity: 0, transform: 'scale(.5) rotate(0deg)' }, { opacity: 0.55, transform: 'scale(.9) rotate(-20deg)' }], { duration: CHEST_T.inhale, easing: 'ease-in', fill: 'forwards' });
    if (root && root.animate) { try { root.animate([{ scale: '1' }, { scale: '1.035' }], { duration: CHEST_T.freeze, easing: 'ease-in', fill: 'forwards' }); } catch (e) { /* no push in */ } }
    setTimeout(() => { if (st.phase === 'inhale' && st.alive) st.freeze = (CHEST_T.inhale - CHEST_T.freeze) / 1000; }, CHEST_T.freeze);
    kick();
    return CHEST_T.inhale;
  };
  // the explosion. rar: the item's rarity (colours the flash). Returns a Promise that resolves at the swap moment (CHEST_T.swap).
  const burst = (rar = 'common') => {
    markCentre();
    const ri = Math.max(0, ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(rar));
    const frgb = FLASH_RGB[rar] || rgb;
    rgb = frgb; el.style.setProperty('--bg', frgb);
    if (!motion) { st.phase = 'done'; el.classList.add('opened'); return Promise.resolve(); }
    st.phase = 'burst'; st.freeze = 0; st.pt = 0;
    el.classList.remove('inhaling'); el.classList.add('opened');
    // chest: recoil flat, the lid blasts off with a spin to one side
    st.press = 0; st.q = 0.32; st.qv = -4; st.trem = 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    st.flying = true; st.lx = 0; st.ly = st.lidY; st.lvx = side * rnd(240, 340); st.lvy = -rnd(1050, 1250); st.lr = 0; st.lvr = side * rnd(700, 980); st.ls = 1;
    // light: shockwave rings, rays, the glow art, the stage flash
    ringP(16, 340, 0.6, 16, '255,255,255'); ringP(10, 250, 0.5, 9, frgb);
    anim(q('.boxring'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(16)' }], { duration: 560, easing: 'cubic-bezier(.1,.7,.3,1)' });
    anim(q('.boxring.b'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(10)' }], { duration: 480, delay: 60, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'backwards' });
    anim(q('.boxflash'), [{ opacity: 0.9 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
    anim(beams, [{ opacity: 0.6, transform: 'scale(.8) rotate(-20deg)' }, { opacity: 1, transform: 'scale(1.9) rotate(30deg)' }], { duration: 700, easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' });
    anim(pour, [{ opacity: 0.4, transform: 'scale(.8,.6)' }, { opacity: 0.7, transform: 'scale(1.2,1.45)' }], { duration: 380, easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' });
    anim(vig, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    // pieces: sparks scale with rarity, confetti, debris from the chest, a puff of dust
    const cols = rar === 'mythic' ? MYTHIC : [frgb, '255,255,255', '255,214,90'];
    sparks(CX, SEAM, 40 + ri * 14, 820 + ri * 90, cols, { g: 520, life: 0.95, s1: 16 });
    sparks(CX, SEAM, 16 + ri * 4, 1100, ['255,255,255'], { a: -Math.PI / 2, spread: 0.55, g: 900, life: 0.7 });
    const conf = rar === 'mythic' ? ['#ff6ebe', '#a078ff', '#78c8ff', '#ffdc5a', '#ffffff'] : [`rgb(${frgb})`, '#ffffff', '#ffd23f', `rgb(${frgb})`];
    for (let i = 0; i < 30 + ri * 10; i++) { const a = -Math.PI / 2 + rnd(-1.4, 1.4), v = rnd(380, 900); add({ k: 'conf', x: CX + rnd(-30, 30), y: SEAM, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1100, drag: 1.6, life: rnd(0.8, 1.3), age: 0, rot: rnd(0, TAU), vr: rnd(-14, 14), w: rnd(6, 10), h: rnd(9, 15), c: conf[i % conf.length] }); }
    const deb = DEBRIS[tier] || DEBRIS.cardboard;
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rnd(-1.6, 1.6), v = rnd(300, 700); add({ k: 'deb', x: CX + rnd(-50, 50), y: SEAM + rnd(-6, 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1700, drag: 0.8, life: rnd(0.7, 1.0), age: 0, rot: rnd(0, TAU), vr: rnd(-18, 18), w: rnd(5, 11), h: rnd(4, 8), c: deb[i % deb.length] }); }
    puffs(8, true);
    camera(1.06, 520);
    // the full-screen flash in the item's colour: it rises, peaks, holds through the swap and fades over the reveal screen
    const f = flashEl(), r = ic.getBoundingClientRect(), fx = ((r.left + r.width / 2) / (window.innerWidth || 1) * 100).toFixed(1), fy = ((r.top + r.height * seamY) / (window.innerHeight || 1) * 100).toFixed(1);
    f.style.background = rar === 'mythic'
      ? `radial-gradient(circle at ${fx}% ${fy}%,#fff 0,rgba(255,240,250,.97) 18%,rgba(${frgb},.9) 48%,rgba(150,110,255,.88) 100%)`
      : `radial-gradient(circle at ${fx}% ${fy}%,#fff 0,rgba(255,252,240,.97) 16%,rgba(${frgb},.9) 50%,rgba(${frgb},.82) 100%)`;
    const total = CHEST_T.swap + CHEST_T.flashFade, pk = CHEST_T.flashPeak / total, hold = CHEST_T.swap / total;
    if (f._a) { try { f._a.cancel(); } catch (e) { /* gone */ } }
    f._a = anim(f, [{ opacity: 0, offset: 0, easing: 'ease-in' }, { opacity: 0.22, offset: 0.12 * pk, easing: 'ease-in' }, { opacity: 0.12, offset: 0.4 * pk, easing: 'cubic-bezier(.5,0,.9,.6)' }, { opacity: 1, offset: pk }, { opacity: 1, offset: hold, easing: 'cubic-bezier(.3,.1,.4,1)' }, { opacity: 0, offset: 1 }], { duration: total, fill: 'forwards' });
    if (f._a) f._a.onfinish = () => { if (f.isConnected && f._a && f._a.playState === 'finished') f.remove(); };
    else f.remove();
    kick();
    return new Promise((res) => setTimeout(res, CHEST_T.swap));
  };
  const destroy = () => {
    if (!st.alive) return;
    st.alive = false; st.phase = 'done';
    if (raf) cancelAnimationFrame(raf); raf = 0;
    ps.length = 0;
    if (cv) { cv.width = cv.height = 0; }   // free the canvas memory (phones cap it)
    ctx = null;
  };
  const idle = () => { st.phase = 'idle'; kick(); };

  if (motion) { fitCanvas(); for (let i = 0; i < 5; i++) { motes(); ps[ps.length - 1].age = rnd(0, 1); } }
  else { el.classList.add('still'); if (cv) cv.width = cv.height = 0; }
  markCentre();
  idle();
  return { el, motion, idle, hit, upgrade, inhale, burst, destroy, get heat() { return st.heat; } };
}
