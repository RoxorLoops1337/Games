'use strict';
// ===================== CORE: utils, input, audio, ui, fx =====================
const W = 1280, H = 720;
const C = {
  ink: '#150f1d', paper: '#eadcb6', paper2: '#d9c796', cream: '#f6edd2', teal: '#1f9aa8', teal2: '#14707c',
  orange: '#f27a1a', mustard: '#f2b21c', red: '#d23a32', plum: '#7a45b0', green: '#6fb04a', sky: '#7fd0e0',
  blue: '#3a66b8', pink: '#d98a8a', grey: '#7d756a', metal: '#9fb0b4', brown: '#7a4b2a', white: '#fff6dc'
};
const FD = '"Baloo 2","Bangers","Impact","Arial Black",sans-serif'; // bubbly display (matches the RoxorLoops bubble lettering)
const FM = '"Permanent Marker","Segoe Print","Comic Sans MS",cursive'; // hand marker captions
const FB = '"Patrick Hand","Segoe Print","Comic Sans MS",cursive';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

const G = {
  time: 0, boil: 0, shake: 0, shakeT: 0, hitstop: 0, scene: null, modal: null, run: null,
  particles: [], floaters: [], trans: null, tip: null, flash: 0, zoomPunch: 0,
  settings: Object.assign({ sfx: 0.7, music: 0.4, shake: 1, boil: 0, fast: 0 }, store.get('rg_settings', {})),
  meta: Object.assign({ wins: 0, runs: 0, best: 0, unlocked: ['strike', 'guard'], seen: {} }, store.get('rg_meta', {}))
};
function saveSettings() { store.set('rg_settings', G.settings); }
function saveMeta() { store.set('rg_meta', G.meta); }

// ---------- canvas ----------
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let renderScale = 1;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  renderScale = clamp(s * (window.devicePixelRatio || 1), 0.7, 2);
  cv.width = Math.round(W * renderScale); cv.height = Math.round(H * renderScale);
}
addEventListener('resize', fit); fit();

// ---------- input ----------
const In = { x: 0, y: 0, down: false, click: null, dx: 0, dy: 0, wheel: 0 };
function route(name, a, b) {
  const t = G.modal || G.scene;
  if (t && t[name]) t[name](a, b);
}
function toLocal(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
cv.addEventListener('pointermove', e => { [In.x, In.y] = toLocal(e); route('onMove', In.x, In.y); });
cv.addEventListener('pointerdown', e => {
  Snd.init(); [In.x, In.y] = toLocal(e); In.down = true; In.dx = In.x; In.dy = In.y;
  if (e.button === 2) route('onRight', In.x, In.y); else route('onDown', In.x, In.y);
});
addEventListener('pointerup', e => {
  [In.x, In.y] = toLocal(e); const was = In.down; In.down = false;
  if (e.button === 2) return;
  if (was) { In.click = { x: In.x, y: In.y }; route('onUp', In.x, In.y); }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); In.wheel += e.deltaY; route('onWheel', e.deltaY); }, { passive: false });
addEventListener('keydown', e => {
  Snd.init();
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  route('onKey', e.key, e);
});

// ---------- audio ----------
const Snd = {
  ac: null, master: null, sfxG: null, musG: null, mood: 'menu', step: 0, timer: null,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain(); this.master.connect(this.ac.destination);
      this.sfxG = this.ac.createGain(); this.sfxG.connect(this.master);
      this.musG = this.ac.createGain(); this.musG.connect(this.master);
      this.updateVol();
      const len = this.ac.sampleRate; this.nbuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
    } catch (e) { this.ac = null; }
  },
  updateVol() { if (!this.ac) return; this.sfxG.gain.value = G.settings.sfx; this.musG.gain.value = G.settings.music * 0.55; },
  tone(f, d, type = 'square', v = 0.2, slide = null, delay = 0, bus = null) {
    if (!this.ac) return; const a = this.ac, t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(bus || this.sfxG); o.start(t); o.stop(t + d + 0.05);
  },
  noise(d, v = 0.2, fc = 2000, type = 'lowpass', delay = 0, sweep = null, bus = null) {
    if (!this.ac) return; const a = this.ac, t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = this.nbuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(fc, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + d);
    const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxG); s.start(t); s.stop(t + d + 0.05);
  },
  play(n, p = 1) {
    if (!this.ac) return;
    switch (n) {
      case 'click': this.tone(520, .07, 'square', .12); this.tone(780, .06, 'square', .08, null, .04); break;
      case 'hover': this.tone(900, .03, 'triangle', .04); break;
      case 'card': this.noise(.09, .18, 3500, 'bandpass'); this.tone(260, .08, 'triangle', .12, 180); break;
      case 'draw': this.noise(.06, .09, 6000, 'highpass'); break;
      case 'hit': this.noise(.16, .4, 1400, 'lowpass', 0, 300); this.tone(130 * p, .14, 'sawtooth', .22, 50); break;
      case 'bighit': this.noise(.3, .55, 1800, 'lowpass', 0, 200); this.tone(90, .3, 'sawtooth', .3, 35); this.tone(200, .1, 'square', .15, 60); break;
      case 'slash': this.noise(.14, .25, 3000, 'bandpass', 0, 8000); this.tone(700, .1, 'sawtooth', .08, 200); break;
      case 'block': this.tone(900, .12, 'square', .13, 450); this.noise(.06, .22, 4500, 'highpass'); break;
      case 'coin': this.tone(1250, .07, 'square', .1); this.tone(1650, .16, 'square', .1, null, .06); break;
      case 'heal': [520, 660, 780, 1040].forEach((f, i) => this.tone(f, .16, 'sine', .14, null, i * .07)); break;
      case 'buff': this.tone(380, .22, 'triangle', .2, 900); this.tone(570, .25, 'triangle', .1, 1200, .05); break;
      case 'debuff': this.tone(520, .28, 'sawtooth', .13, 140); break;
      case 'endturn': this.tone(240, .16, 'square', .12, 140); this.noise(.1, .1, 800); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .24, 'square', .12, null, i * .1)); break;
      case 'lose': [392, 349, 311, 262, 196].forEach((f, i) => this.tone(f, .34, 'sawtooth', .13, null, i * .17)); break;
      case 'die': this.noise(.45, .45, 1200, 'lowpass', 0, 120); this.tone(160, .4, 'sawtooth', .22, 40); break;
      case 'talk': for (let i = 0; i < 3; i++) this.tone(rnd(190, 320) * p, .07, 'triangle', .1, null, i * .06); break;
      case 'whoosh': this.noise(.3, .25, 400, 'bandpass', 0, 4000); break;
      case 'error': this.tone(160, .18, 'square', .15, 100); break;
      case 'drum': this.noise(.12, .3, 300, 'lowpass'); this.tone(80, .16, 'sine', .3, 40); break;
      case 'stamp': this.noise(.2, .5, 600, 'lowpass'); this.tone(70, .22, 'sine', .4, 35); break;
      case 'ding': this.tone(1400, .4, 'sine', .15); this.tone(2100, .5, 'sine', .07); break;
      case 'summon': this.tone(150, .5, 'sawtooth', .15, 600); this.noise(.5, .2, 500, 'bandpass', 0, 3000); break;
    }
  },
  setMood(m) { this.mood = m; },
  startMusic() {
    if (this.timer) return;
    const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 49];
    const arp = [220, 262, 330, 262, 294, 349, 440, 349, 247, 294, 392, 294];
    let n = 0;
    const tick = () => {
      if (!this.ac || G.settings.music <= 0.001) return;
      const m = this.mood, bus = this.musG;
      const tempo = m === 'battle' ? 1 : m === 'talk' ? 0.8 : 0.6;
      const s = n++;
      const b = bass[Math.floor(s / 4) % bass.length];
      if (s % 4 === 0) this.tone(b, .5, 'triangle', m === 'menu' ? .35 : .45, null, 0, bus);
      if (m === 'battle') {
        if (s % 4 === 0) { this.noise(.1, .35, 250, 'lowpass', 0, null, bus); this.tone(70, .12, 'sine', .4, 40, 0, bus); }
        if (s % 4 === 2) this.noise(.06, .12, 7000, 'highpass', 0, null, bus);
        if (s % 2 === 1) this.noise(.03, .06, 9000, 'highpass', 0, null, bus);
        this.tone(arp[s % arp.length] * (s % 24 > 11 ? 1.5 : 1), .14, 'square', .06, null, 0, bus);
      } else if (m === 'talk') {
        if (s % 4 === 0) this.noise(.05, .1, 5000, 'highpass', 0, null, bus);
        if (s % 2 === 0) this.tone(arp[(s / 2) % arp.length] * 2, .3, 'triangle', .07, null, 0, bus);
      } else {
        if (s % 2 === 0) this.tone(arp[(s / 2 | 0) % arp.length], .5, 'triangle', .08, null, 0, bus);
        if (s % 8 === 4) this.tone(arp[(s / 2 | 0) % arp.length] * 2, .8, 'sine', .06, null, 0, bus);
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(tick, (m === 'battle' ? 165 : m === 'talk' ? 210 : 260));
    };
    this.timer = setTimeout(tick, 100);
    this._tickFn = tick;
  }
};

// ---------- text helpers ----------
function txt(c, s, x, y, o = {}) {
  const size = o.size || 20, font = o.font || FB;
  c.save();
  c.font = `${o.weight || ''} ${size}px ${font}`.trim();
  c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'alphabetic';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (o.rot || o.scale || o.skew) { c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.skew) c.transform(1, 0, o.skew, 1, 0, 0); if (o.scale) c.scale(o.scale, o.scale); x = 0; y = 0; }
  c.lineJoin = 'round';
  if (o.stroke) { c.lineWidth = o.sw || 5; c.strokeStyle = o.stroke; c.strokeText(s, x, y + (o.dy || 0)); }
  if (o.shadow) { c.fillStyle = o.shadow; c.fillText(s, x + 2, y + 2); }
  let fill = o.color || C.ink;
  if (o.grad && typeof fill === 'string' && fill[0] === '#') { const g = c.createLinearGradient(0, y - size * .8, 0, y + size * .15); g.addColorStop(0, shade(fill, .45)); g.addColorStop(.55, fill); g.addColorStop(1, shade(fill, -.2)); fill = g; }
  c.fillStyle = fill; c.fillText(s, x, y);
  c.restore();
}
function disp(c, s, x, y, size, color = C.cream, o = {}) {
  txt(c, s, x, y, Object.assign({ size, color, font: FD, stroke: C.ink, sw: Math.max(4, size * 0.2), align: 'center', base: 'middle', skew: -.12, grad: size >= 30 }, o));
}
function wrapLines(c, s, maxW) {
  const out = [];
  for (const para of String(s).split('\n')) {
    const words = para.split(' '); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
const KEYW = /^(Bleed|Weak|Vulnerable|Strength|Block|Composure|Influence|Plating|Thorns|Resolve|Exhaust|AP|Damage|damage|Argument|Doubt|Unplayable|ALL|Innate)[.,:]?$/;
function richText(c, s, x, y, maxW, lh, size, align = 'center', col = C.ink) {
  c.save(); c.font = `${size}px ${FB}`; c.textBaseline = 'alphabetic';
  const lines = wrapLines(c, s, maxW);
  lines.forEach((ln, i) => {
    const words = ln.split(' ');
    const full = c.measureText(ln).width;
    let cx = align === 'center' ? x - full / 2 : x;
    words.forEach(w => {
      const isNum = /^[+×x\-]?\d/.test(w);
      c.fillStyle = KEYW.test(w) ? C.red : isNum ? C.orange : col;
      c.textAlign = 'left'; c.fillText(w, cx, y + i * lh);
      cx += c.measureText(w + ' ').width;
    });
  });
  c.restore();
  return lines.length;
}

// ---------- ui ----------
const UI = {
  enabled: true, hotPrev: null, hotCur: null, cursor: 'default',
  hit(x, y, w, h) { return UI.enabled && In.x >= x && In.x <= x + w && In.y >= y && In.y <= y + h; },
  btn(x, y, w, h, label, o = {}) {
    const dis = !!o.disabled, hov = !dis && UI.hit(x, y, w, h);
    const id = label + '|' + x + '|' + y;
    if (hov) { UI.hotCur = id; UI.cursor = 'pointer'; if (UI.hotPrev !== id) Snd.play('hover'); }
    const press = hov && In.down;
    const sc = hov ? (press ? 0.97 : 1.05) : 1;
    const c = ctx; c.save(); c.translate(x + w / 2, y + h / 2); c.scale(sc, sc);
    const hw = w / 2, hh = h / 2, seed = (x * 7 + y * 3) | 0;
    const col = dis ? C.grey : (o.col || C.mustard);
    if (o.slant) {
      const g = c.createLinearGradient(0, -hh, 0, hh); g.addColorStop(0, shade(col, .3)); g.addColorStop(1, shade(col, -.2));
      c.beginPath(); c.moveTo(-hw + 14, -hh); c.lineTo(hw, -hh); c.lineTo(hw - 14, hh); c.lineTo(-hw, hh); c.closePath(); c.fillStyle = g; c.fill(); c.lineWidth = 3.5; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,230,170,.7)'; c.beginPath(); c.moveTo(-hw + 17, -hh + 4); c.lineTo(hw - 3, -hh + 4); c.stroke();
    } else {
      inkRect(c, -hw, -hh, w, h, col, seed, { lw: 4, r: 8 }); glossRect(c, -hw + 2, -hh + 2, w - 4, h - 4, 7);
    }
    if (hov) { c.globalAlpha = .2; c.fillStyle = '#fff'; c.fillRect(-hw + 6, -hh + 6, w - 12, h - 12); c.globalAlpha = 1; }
    disp(c, label, 0, 2, o.size || Math.min(30, h * 0.55), dis ? '#ccc' : (o.tc || C.cream));
    c.restore();
    if (hov && In.click) { In.click = null; Snd.play('click'); return true; }
    return false;
  },
  endFrame() { UI.hotPrev = UI.hotCur; UI.hotCur = null; cv.style.cursor = UI.cursor; UI.cursor = 'default'; }
};

// ---------- fx ----------
function burst(x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = o.a != null ? o.a + rnd(-(o.spread || .6), o.spread || .6) : rnd(0, Math.PI * 2);
    const sp = rnd(o.min || 80, o.max || 320);
    G.particles.push({
      x: x + rnd(-(o.jit || 0), o.jit || 0), y: y + rnd(-(o.jit || 0), o.jit || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
      life: 0, max: rnd(o.life || .4, (o.life || .4) * 1.8), size: rnd(o.s0 || 4, o.s1 || 9), col: Array.isArray(o.col) ? pick(o.col) : (o.col || C.ink),
      grav: o.grav != null ? o.grav : 500, rot: rnd(0, 6), vr: rnd(-10, 10), shape: o.shape || 'rect', drag: o.drag || 0.5
    });
  }
}
function floatText(x, y, text, col = C.cream, size = 36, o = {}) {
  G.floaters.push({ x, y, text: String(text), col, size, life: 0, max: o.life || 1.1, vy: o.vy || -70, vx: o.vx != null ? o.vx : rnd(-20, 20) });
}
function shake(a, t = 0.3) { if (!G.settings.shake) return; G.shake = Math.max(G.shake, a * G.settings.shake); G.shakeT = Math.max(G.shakeT, t); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }
function tip(title, body) { G.tip = { title, body, x: In.x, y: In.y }; }

function updateFx(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i]; p.life += dt;
    if (p.life >= p.max) { G.particles.splice(i, 1); continue; }
    p.vy += p.grav * dt; const d = Math.pow(1 - p.drag * 0.5, dt * 6); p.vx *= d;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i]; f.life += dt;
    if (f.life >= f.max) { G.floaters.splice(i, 1); continue; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.vy *= Math.pow(.2, dt);
  }
  if (G.shakeT > 0) { G.shakeT -= dt; if (G.shakeT <= 0) G.shake = 0; else G.shake *= Math.pow(.04, dt); }
  G.zoomPunch *= Math.pow(.001, dt); G.flash *= Math.pow(.0001, dt);
}
function drawFx(c) {
  for (const p of G.particles) {
    const k = 1 - p.life / p.max; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = clamp(k * 2, 0, 1);
    const s = p.size * (p.shape === 'ring' ? 1 + (1 - k) * 4 : (0.4 + k * 0.6));
    c.fillStyle = p.col; c.strokeStyle = C.ink; c.lineWidth = 1.5;
    if (p.shape === 'circle') { c.beginPath(); c.arc(0, 0, s, 0, 6.3); c.fill(); c.stroke(); }
    else if (p.shape === 'ring') { c.lineWidth = 3 * k; c.strokeStyle = p.col; c.beginPath(); c.arc(0, 0, s, 0, 6.3); c.stroke(); }
    else if (p.shape === 'line') { c.lineWidth = 3; c.strokeStyle = p.col; c.beginPath(); c.moveTo(-s * 2, 0); c.lineTo(s * 2, 0); c.stroke(); }
    else if (p.shape === 'star') { c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .4 : s; c.lineTo(Math.cos(i * .785) * r, Math.sin(i * .785) * r); } c.closePath(); c.fill(); c.stroke(); }
    else { c.fillRect(-s / 2, -s / 2, s, s * .7); c.strokeRect(-s / 2, -s / 2, s, s * .7); }
    c.restore();
  }
  for (const f of G.floaters) {
    const k = f.life / f.max; const pop = k < .15 ? ease.back(k / .15) : 1; const a = k > .7 ? 1 - (k - .7) / .3 : 1;
    disp(c, f.text, f.x, f.y, f.size * pop, f.col, { alpha: a });
  }
}

// ---------- transitions ----------
function go(fn, o = {}) {
  if (G.trans) return;
  G.trans = { t: 0, phase: 0, fn, color: o.color || C.ink };
  Snd.play('whoosh');
}
function updateTrans(dt) {
  const t = G.trans; if (!t) return;
  t.t += dt * (G.settings.fast ? 4 : 2.6);
  if (t.phase === 0 && t.t >= 1) { t.phase = 1; t.t = 0; t.fn(); }
  else if (t.phase === 1 && t.t >= 1) G.trans = null;
}
function drawTrans(c) {
  const t = G.trans; if (!t) return;
  const k = ease.inOut(clamp(t.t, 0, 1));
  c.save(); c.fillStyle = t.color; c.strokeStyle = C.ink;
  const edge = lerp(-200, W + 100, k);
  c.beginPath();
  if (t.phase === 0) {
    c.moveTo(-10, -10);
    for (let y = -10; y <= H + 30; y += 30) c.lineTo(edge + Math.sin(y * .05 + G.time * 6) * 40 + (y % 60 ? 25 : -25), y);
    c.lineTo(-10, H + 30);
  } else {
    c.moveTo(W + 10, -10);
    for (let y = -10; y <= H + 30; y += 30) c.lineTo(edge + Math.sin(y * .05 + G.time * 6) * 40 + (y % 60 ? 25 : -25), y);
    c.lineTo(W + 10, H + 30);
  }
  c.closePath(); c.fill();
  c.restore();
}
