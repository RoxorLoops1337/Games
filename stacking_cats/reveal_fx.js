// Stacking Cats: the item card reveal. The card is flung face up out of the chest as a tiny speck, twirls toward the
// player (3 or 4 turns around its Y axis), lands oversized and pops into place, then idles with a float, a foil
// shine and a tilt toward the pointer. Pure DOM: transforms and opacity only, one small canvas for the sparkles.
// main.js builds the screen (showBoxReveal) and calls playReveal on it; with motion off it shows the end state at once.

export const RARITY_IDX = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
// per rarity: turns while flying, spiral radius and loops (stage px), sparkles per frame, comet tail
const FLIGHT = {
  common: { turns: 3, rad: 26, loops: 0.45, spark: 1, comet: 0, ghost: 3 },
  rare: { turns: 3, rad: 44, loops: 0.6, spark: 1.5, comet: 0, ghost: 4 },
  epic: { turns: 3, rad: 70, loops: 0.8, spark: 2, comet: 0, ghost: 4 },
  legendary: { turns: 4, rad: 120, loops: 1.15, spark: 3, comet: 1, ghost: 5 },
  mythic: { turns: 4, rad: 150, loops: 1.4, spark: 3.5, comet: 1, ghost: 5 },
};
const COLS = {
  common: ['#fff3d6', '#ffd99a', '#ffffff'],
  rare: ['#8ec6ff', '#d4ecff', '#ffffff'],
  epic: ['#e7a0ff', '#c46bff', '#ffffff', '#ffd6ff'],
  legendary: ['#ffd23f', '#fff1a8', '#ff9a3a', '#ffffff'],
  mythic: ['#ff8ac8', '#9a7aff', '#7fe8ff', '#fff38a', '#ffffff'],
};
export const POP_MS = 460;   // the landing pop and settle after the flight

// the premium trading card. notes: relicNotes(id) html from main.js (set line and "Best on" line), back: the chest picture
export function revealCardHtml(it, notes = '', back = '') {
  return `<div class="tcard r-${it.rarity}" data-id="${it.id}"><div class="tc-face tc-front"><div class="tc-bevel"></div>
<div class="tc-ribbon"><span>${it.rarity}</span></div>
<div class="tc-art"><i class="tc-arays"></i><i class="tc-prism"></i><div class="tc-medal"><div class="ic">${it.icon}</div></div></div>
<h3 class="tc-name${it.name.length > 15 ? ' long' : ''}">${it.name}</h3><p class="tc-desc">${it.desc}</p>
<div class="tc-tags">${notes}<div class="impact">${it.tag || 'Equip it on any cat'}</div></div>
<i class="tc-holo"></i><i class="tc-foil"></i></div>
<div class="tc-face tc-back">${back ? `<img src="${back}" alt="">` : ''}<i class="tc-glint"></i></div></div>`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// stage coordinates (960x540, the #app box, also when the phone turns it sideways) of a viewport point
function toStage(app, cx, cy) {
  const r = app.getBoundingClientRect(), W = app.offsetWidth || 960, H = app.offsetHeight || 540;
  if (r.height > r.width * 1.05 && W > H) return { x: ((cy - r.top) / r.height) * W, y: ((r.right - cx) / r.width) * H };
  return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
}

// where the flying card is at time t (ms) of a flight of T ms: offset from its resting place, scale, turn and tilt
export function flightAt(t, T, from, rarity) {
  const f = FLIGHT[rarity] || FLIGHT.common, p = clamp(t / T, 0, 1);
  const u = 1 - Math.pow(1 - p, 2.1);   // fast out of the chest, easing into the player
  const len = Math.hypot(from.x, from.y) || 1, ang0 = Math.atan2(from.y, from.x);
  const a = ang0 + f.loops * Math.PI * 2 * u, r = f.rad * Math.sin(Math.PI * Math.min(1, u * 1.08)) * (1 - u * 0.4);
  const x = from.x * (1 - u) + Math.cos(a + Math.PI / 2) * r * (len > 30 ? 1 : 0.6);
  const y = from.y * (1 - u) + Math.sin(a + Math.PI / 2) * r * 0.62;
  const s = 0.05 + 1.2 * (0.32 * p + 0.68 * p * p);   // from a speck far away to oversized
  const ry = f.turns * 360 * (1 - Math.pow(1 - p, 2.4));
  const rz = Math.sin(p * Math.PI * 2.2) * 16 * (1 - p);
  const rx = 18 * (1 - p) * (1 - p);
  return { x, y, s, sx: s, sy: s, ry, rz, rx, o: clamp(p * 9, 0, 1) };
}
// the pop: 1.25 down through a squash to 1, with a little stretch on the way back
export function popAt(q) {
  q = clamp(q, 0, 1);
  const s = 1 + 0.25 * Math.exp(-5.2 * q) * Math.cos(q * Math.PI * 2.6);
  const k = 0.16 * Math.exp(-5 * q) * Math.cos(q * Math.PI * 3.4);   // + squash (wide), - stretch (tall)
  return { x: 0, y: 0, s, sx: s * (1 + k), sy: s * (1 - k), ry: 0, rz: 0, rx: 0, o: 1 };
}
const tf = (st) => `translate3d(${st.x.toFixed(1)}px,${st.y.toFixed(1)}px,0) scale(${st.sx.toFixed(3)},${st.sy.toFixed(3)})`;
// the twirl is 2D on purpose (no preserve-3d or backface-visibility: some phone browsers lose the card's faces with them):
// a turn around the Y axis is the card squeezed sideways, and the back is shown while it faces away
const spinC = (st) => { const c = Math.cos(st.ry * Math.PI / 180); return Math.abs(c) < 0.04 ? (c < 0 ? -0.04 : 0.04) : c; };
const spinTf = (st) => `rotate(${st.rz.toFixed(1)}deg) scaleX(${spinC(st).toFixed(3)})`;

// the sparkle canvas: stars along the flight, a comet tail for legendary and mythic, the landing burst, embers after
function sparkLayer(root, rarity) {
  const cv = document.createElement('canvas'), cols = COLS[rarity] || COLS.common, ps = [];
  const k = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 0.5 : 1;   // phones: a quarter of the pixels
  cv.className = 'rv-sparks'; cv.width = Math.round(960 * k); cv.height = Math.round(540 * k); cv.setAttribute('aria-hidden', 'true');
  let ctx = null;
  try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
  if (!ctx) {   // no canvas memory left: the card still lands, just without sparkles
    return { cv, star() {}, comet() {}, burst() {}, ember() {}, get count() { return 0; }, step() {}, free() {} };
  }
  root.appendChild(cv);
  ctx.scale(k, k);
  const add = (p) => { if (ps.length < (k < 1 ? 90 : 220)) ps.push(p); };
  return {
    cv,
    star(x, y, sc, vx = 0, vy = 0) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60;
      add({ x: x + (Math.random() - 0.5) * (20 + 250 * sc), y: y + (Math.random() - 0.5) * (20 + 320 * sc), vx: Math.cos(a) * v + vx, vy: Math.sin(a) * v + vy, life: 0.45 + Math.random() * 0.5, age: 0, r: 2.5 + Math.random() * 4 * Math.max(0.5, sc), c: cols[(Math.random() * cols.length) | 0], k: 's', g: 40 });
    },
    comet(x, y, sc) { add({ x, y, vx: 0, vy: 0, life: 0.42, age: 0, r: 22 + 40 * sc, c: cols[0], k: 'g', g: 0 }); },
    burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, v = 180 + Math.random() * 420;
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: 0.6 + Math.random() * 0.6, age: 0, r: 2.5 + Math.random() * 4, c: cols[i % cols.length], k: i % 3 ? 's' : 'd', g: 220, drag: 2.2 });
      }
    },
    ember(x, y, w) { add({ x: x + (Math.random() - 0.5) * w, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, life: 1.4 + Math.random(), age: 0, r: 1.5 + Math.random() * 2.5, c: cols[(Math.random() * cols.length) | 0], k: 'e', g: -10 }); },
    get count() { return ps.length; },
    step(dt) {
      ctx.clearRect(0, 0, 960, 540);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        if (p.age >= p.life) { ps.splice(i, 1); continue; }
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const a = 1 - p.age / p.life;
        ctx.globalAlpha = a;
        if (p.k === 'g') {   // comet glow
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (0.6 + a * 0.4));
          gr.addColorStop(0, p.c); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = a * 0.55; ctx.fillStyle = gr; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        } else if (p.k === 'd') {   // a confetti chip that tumbles
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * 9 + p.r); ctx.scale(1, Math.cos(p.age * 12 + p.r));
          ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); ctx.restore();
        } else {   // a four point star with a soft core
          const r = p.r * (p.k === 'e' ? 1 : 0.6 + a * 0.6);
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 2.2); ctx.lineTo(p.x + r * 0.45, p.y - r * 0.45); ctx.lineTo(p.x + r * 2.2, p.y); ctx.lineTo(p.x + r * 0.45, p.y + r * 0.45);
          ctx.lineTo(p.x, p.y + r * 2.2); ctx.lineTo(p.x - r * 0.45, p.y + r * 0.45); ctx.lineTo(p.x - r * 2.2, p.y); ctx.lineTo(p.x - r * 0.45, p.y - r * 0.45); ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    free() { ps.length = 0; cv.width = 0; cv.height = 0; cv.remove(); },   // canvas memory on phones is scarce
  };
}

// play the reveal on a screen built by showBoxReveal. opts: { rarity, motion, flight (ms), chest: { x, y } viewport
// fractions, play(id, arg) for sounds, onLand(skipped) for the fanfare/haptics/jolt, app (the #app box) }.
// Returns { skip(), leave(), done }: skip jumps a flight to the landing and a landing to the end state,
// leave() flies the card into the backpack (a Promise), done resolves at landing.
export function playReveal(root, opts) {
  const rarity = opts.rarity || 'common', fl = FLIGHT[rarity] || FLIGHT.common;
  const stage = root.querySelector('.revealstage'), fly = root.querySelector('.rv-fly'), spin = root.querySelector('.rv-spin'), card = root.querySelector('.tcard');
  const play = (id, arg) => { try { if (opts.play) opts.play(id, arg); } catch (e) { /* a missing sound never stops the reveal */ } };
  let landed = false, finished = false, alive = true, raf = 0, t0 = 0, sp = null, ghosts = [], resolve;
  const done = new Promise((r) => { resolve = r; });
  const T = Math.max(300, opts.flight || 850);
  root.classList.add('rvx', 'r-' + rarity);
  const cleanupTimers = [];
  const later = (fn, ms) => { cleanupTimers.push(setTimeout(() => { if (alive && root.isConnected) fn(); }, ms)); };

  const land = (skipped) => {
    if (landed) return;
    landed = true;
    const front = card && card.querySelector('.tc-front');   // a long name or text (or a longer translation) gets the compact layout
    if (front && front.scrollHeight > front.clientHeight + 2) card.classList.add('tight');
    fly.style.transform = ''; spin.style.transform = ''; fly.style.opacity = ''; if (card) card.classList.remove('showback');
    for (const g of ghosts) g.remove();
    ghosts = [];
    root.classList.remove('flying'); root.classList.add('landed');
    stage.classList.remove('pending'); stage.classList.add('landed');
    if (opts.motion) {
      play('cardpop'); play('cardland', RARITY_IDX[rarity] || 0);
      if (sp) { const c = center(); sp.burst(c.x, c.y, 26 + RARITY_IDX[rarity] * 14); }
      later(() => play('cardshine'), 900);   // the first foil sweep (CSS runs it .9 s after landing)
    }
    if (opts.onLand) opts.onLand(skipped);
    resolve();
  };
  const finish = () => {   // every entrance animation jumps to its end
    if (finished) return;
    finished = true;
    land(true);
    root.classList.add('rvdone');
  };
  let home = { x: 480, y: 270 };
  const center = () => home;

  if (!opts.motion) {   // reduced motion: the end state, no flight, no sparkles
    root.classList.add('rvcalm');
    finish();
    return { skip() {}, leave: () => Promise.resolve(), done };
  }

  // where the card rests and where the chest was, in stage px
  const app = opts.app || root.parentElement;
  const fr = fly.getBoundingClientRect();
  home = toStage(app, fr.left + fr.width / 2, fr.top + fr.height / 2);
  const cx = clamp(+opts.chest?.x || 0.5, 0, 1), cy = clamp(+opts.chest?.y || 0.42, 0, 1);
  const ch = toStage(app, cx * innerWidth, cy * innerHeight);
  let from = { x: ch.x - home.x, y: ch.y - home.y };
  if (Math.hypot(from.x, from.y) < 40) from = { x: from.x * 0.5, y: from.y * 0.5 - 30 };   // the chest stood right here: still rise out of it a little

  // echo copies that trail the card
  for (let i = 0; i < fl.ghost; i++) {
    const gh = document.createElement('div');
    gh.className = 'rv-ghost'; gh.setAttribute('aria-hidden', 'true');
    gh.style.opacity = '0';
    fly.parentElement.insertBefore(gh, fly);
    ghosts.push(gh);
  }
  sp = sparkLayer(root, rarity);
  root.classList.add('flying');
  play('cardwhoosh');
  const apply = (st) => { fly.style.transform = tf(st); spin.style.transform = spinTf(st); fly.style.opacity = st.o.toFixed(2); if (card) card.classList.toggle('showback', spinC(st) < 0); };
  apply(flightAt(0, T, from, rarity));

  let last = 0, embT = 0;
  const frame = (now) => {
    if (!alive || !root.isConnected) { stop(); return; }
    try {
    if (!t0) { t0 = now; last = now; }
    const t = now - t0, dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!landed) {
      if (t >= T) land(false);
      else {
        const st = flightAt(t, T, from, rarity);
        apply(st);
        const X = home.x + st.x, Y = home.y + st.y;
        for (let i = 0; i < ghosts.length; i++) {   // each echo is the card a few frames ago
          const gs = flightAt(t - (i + 1) * 48, T, from, rarity);
          ghosts[i].style.transform = tf(gs) + ' ' + spinTf(gs);
          ghosts[i].style.opacity = (gs.o * (0.6 - i * 0.1) * Math.min(1, t / 120)).toFixed(2);
        }
        const n = fl.spark * (1.4 + st.s * 1.6);
        for (let i = 0; i < n; i++) if (Math.random() < n - i) sp.star(X, Y, st.s);
        if (fl.comet) { sp.comet(X, Y, st.s); if (Math.random() < 0.5) sp.comet(X, Y, st.s * 0.8); }
        else if (st.s < 0.6) sp.comet(X, Y, 0.25 + st.s * 0.4);   // the speck glows while it is far away
      }
    }
    if (landed) {
      const q = (t - T) / POP_MS;
      if (!finished && q >= 0 && q < 1) { const st = popAt(q); fly.style.transform = tf(st); }
      else if (q >= 1 && fly.style.transform) fly.style.transform = '';
      if (rarity === 'legendary' || rarity === 'mythic' || rarity === 'epic') {   // embers keep rising behind the card
        embT += dt;
        const every = rarity === 'epic' ? 0.16 : 0.07;
        while (embT > every) { embT -= every; sp.ember(home.x, home.y + 150, 300); }
      }
    }
    sp.step(dt);
    if (landed && !['legendary', 'mythic', 'epic'].includes(rarity) && sp.count === 0 && t > T + POP_MS) { stop(); return; }
    } catch (e) { stop(); finish(); return; }   // whatever goes wrong, the card lands and Collect shows
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  later(() => { if (!landed) finish(); }, T + 1500);   // never rely on animation frames alone: a stalled browser still lands the card
  const stop = () => { cancelAnimationFrame(raf); raf = 0; if (sp && (!root.isConnected || !alive)) { sp.free(); sp = null; } };

  // tilt toward the pointer once it rests
  let tiltRaf = 0, tx = 0, ty = 0;
  const onMove = (e) => {
    if (!landed || !card) return;
    const p = toStage(app, e.clientX, e.clientY);
    tx = clamp((p.x - home.x) / 260, -1, 1); ty = clamp((p.y - home.y) / 200, -1, 1);
    if (!tiltRaf) tiltRaf = requestAnimationFrame(() => { tiltRaf = 0; card.style.setProperty('--tx', (tx * 9).toFixed(1) + 'deg'); card.style.setProperty('--ty', (-ty * 7).toFixed(1) + 'deg'); card.style.setProperty('--mx', (50 + tx * 40).toFixed(0) + '%'); });
  };
  root.addEventListener('pointermove', onMove);
  // stop everything when the screen goes away
  const watch = setInterval(() => { if (!root.isConnected) { alive = false; clearInterval(watch); for (const id of cleanupTimers) clearTimeout(id); root.removeEventListener('pointermove', onMove); stop(); if (sp) { sp.free(); sp = null; } } }, 500);

  return {
    skip() { if (!landed) { t0 = performance.now() - T; land(true); } else finish(); },
    leave() {   // into the backpack: a quick dip, then down and away
      if (!fly.animate) return Promise.resolve();
      root.classList.add('leaving');
      const a = fly.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0,-14px,0) scale(1.06)', opacity: 1, offset: 0.3 }, { transform: 'translate3d(-260px,300px,0) scale(.12) rotate(-30deg)', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
      return a.finished.catch(() => {});
    },
    done,
  };
}
