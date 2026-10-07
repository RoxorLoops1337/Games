'use strict';
// Encore Island — drawing toolkit: canvas helpers, sprite cache, baked Hocus Vocus atlas, UI kit (plaques, pills, discs, bars), ground tiles.
let ctx = null, fillRaw = null;
function setupCtx(c) {
  ctx = c;
  const ft = ctx.fillText, szc = new Map(), lumc = new Map(); fillRaw = ft; // every label gets the warm Hocus Vocus outline unless it is dark text
  if (ft && ctx.strokeText) ctx.fillText = function (t, x, y, mw) {
    const f = this.font; let sz = szc.get(f); if (sz === undefined) { const m = /(\d+(?:\.\d+)?)px/.exec(f || ''); sz = m ? +m[1] : 14; szc.set(f, sz); }
    const fs = this.fillStyle; let dark = lumc.get(fs);
    if (dark === undefined && typeof fs === 'string') {
      const m = /^#([0-9a-f]{6})$/i.exec(fs), r = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(fs);
      const v = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)] : r ? [+r[1], +r[2], +r[3]] : null;
      dark = v ? (v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11) < 105 : false; lumc.set(fs, dark);
    }
    if (dark) return ft.call(this, t, x, y, mw);
    this.save(); this.lineJoin = 'round'; this.strokeStyle = 'rgba(45,23,15,0.88)'; this.lineWidth = Math.max(2, sz * 0.22); this.strokeText(t, x, y); this.restore();
    ft.call(this, t, x, y, mw);
  };
}
const FONT = '"Arial Rounded MT Bold","Nunito","Trebuchet MS",sans-serif';
const font = (px, bold) => (bold === false ? '' : 'bold ') + px + 'px ' + FONT;
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shadow(x, y, w, a) { ctx.fillStyle = 'rgba(40,20,80,' + (a === undefined ? 0.2 : a) + ')'; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.38, 0, 0, TAU); ctx.fill(); }
// offscreen sprite cache: paint once centred on (0,0), blit forever. Falls back to direct painting (returns null) headless.
const SPR = new Map();
let sprOK = typeof document !== 'undefined' && typeof document.createElement === 'function';
function sprite(key, size, paint) {
  if (!sprOK) return null;
  let c = SPR.get(key);
  if (c === undefined) {
    try {
      c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); if (!g || !g.beginPath) throw new Error('no 2d');
      const old = ctx; ctx = g;
      try { g.translate(size / 2, size / 2); paint(); } finally { ctx = old; }
    } catch (e) { console.warn("sprite fail " + key + ": " + e.message); c = null; }
    SPR.set(key, c);
  }
  return c;
}
// ---- baked Hocus Vocus atlas (tools/encore/bake_art.mjs). Missing art never breaks the game: callers fall back to drawn shapes. ----
const ART = { spr: null, sheets: {}, ready: false };
function loadArt(done) {
  if (typeof fetch !== 'function' || typeof Image !== 'function') return;
  fetch('art/atlas.json').then(r => r.json()).then(a => {
    let left = Object.keys(a.sheets).length;
    for (const n in a.sheets) { const im = new Image(); im.onload = () => { ART.sheets[n] = im; if (--left === 0) { ART.spr = a.spr; ART.ready = true; if (done) done(); } }; im.src = 'art/' + n + '.webp'; }
  }).catch(() => {});
}
function artFrame(name, anim, fr) { const s = ART.spr && ART.spr[name]; if (!s) return null; const a = s.anims && s.anims[anim] || [0, s.n]; return a[0] + ((fr % a[1]) + a[1]) % a[1]; }
function artDraw(name, anim, fr, x, y, k, flip, alpha) {
  if (!ART.ready) return false;
  const s = ART.spr[name]; if (!s) return false;
  const f = artFrame(name, anim, fr), im = ART.sheets[s.sheet], w = s.w * k, h = s.h * k;
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(im, s.x + f * s.w, s.y, s.w, s.h, -s.ax * k, -s.ay * k, w, h); ctx.restore(); }
  else ctx.drawImage(im, s.x + f * s.w, s.y, s.w, s.h, x - s.ax * k, y - s.ay * k, w, h);
  if (alpha !== undefined) ctx.globalAlpha = 1;
  return true;
}
// round avatar cropped from a baked hero frame
function artHead(name, x, y, r) {
  const sp = ART.ready && ART.spr[name];
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x, y + 1.5, r + 3, 0, TAU); ctx.fill();
  const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#ffd9ea'); g.addColorStop(1, '#a77bff'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (sp) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip(); const a = sp.anims && sp.anims.idle || [0, 1], k = (r * 2.5) / 110; ctx.drawImage(ART.sheets[sp.sheet], sp.x + a[0] * sp.w + 24, sp.y + 6, 112, 112, x - r * 1.25, y - r * 1.12, 112 * k, 112 * k); ctx.restore(); }
  ctx.strokeStyle = HV.cream; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
}
// ---- UI kit ----
function plaque(x, y, w, h, r) { // indigo stage plaque: warm outline, cream hairline
  ctx.fillStyle = HV.line; rr(x - 2, y - 2, w + 4, h + 4, r + 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a3394'); g.addColorStop(1, '#241857'); ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,230,0.55)'; ctx.lineWidth = 1.2; rr(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, r - 1.5)); ctx.stroke();
}
function card(x, y, w, h, r) { // cream paper card
  ctx.fillStyle = 'rgba(40,20,80,0.25)'; rr(x + 2, y + 5, w, h, r); ctx.fill();
  ctx.fillStyle = HV.line; rr(x - 2.5, y - 2.5, w + 5, h + 5, r + 2.5); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#fffaf1'); g.addColorStop(1, '#ffe8d2'); ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
}
function pill(x, y, w, h, c1, c2) {
  const r = Math.min(h / 2, 16);
  ctx.fillStyle = HV.line; rr(x - 2, y - 1, w + 4, h + 5, r + 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.38)'; rr(x + 3, y + 2, w - 6, h * 0.38, r * 0.7); ctx.fill();
}
function disc(x, y, r, c1, c2) {
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x, y + 1.5, r + 2.5, 0, TAU); ctx.fill();
  const g = ctx.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.5, r * 0.62, r * 0.34, 0, 0, TAU); ctx.fill();
}
const CBTN = { go: ['#7cf09a', '#25a84f'], gold: ['#ffe98a', '#f0b422'], pink: ['#ff9ac8', '#f0599a'], violet: ['#c6a8ff', '#8a5cf0'], off: ['#6a5aa0', '#3e3076'], red: ['#ff9a8a', '#e8384f'] };
function cbtn(x, y, w, h, on, kind) { const c = on ? CBTN[kind || 'go'] : CBTN.off; pill(x, y, w, h, c[0], c[1]); }
function gbar(x, y, w, h, f, c1, c2) {
  ctx.fillStyle = HV.line; rr(x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2); ctx.fill(); ctx.fillStyle = 'rgba(20,10,50,0.85)'; rr(x, y, w, h, h / 2); ctx.fill();
  if (f > 0.005) { const bw = Math.max(h, w * Math.min(1, f)), g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; rr(x, y, bw, h, h / 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; rr(x + 2, y + 1.5, bw - 4, h * 0.34, h * 0.17); ctx.fill(); }
}
function labelPill(txt, x, y, c1, c2, px) {
  ctx.font = font(px || 12); ctx.textAlign = 'center'; const w = ctx.measureText(txt).width + 22;
  pill(x - w / 2, y - 13, w, 20, c1, c2); ctx.fillStyle = '#3a2410'; ctx.fillText(txt, x, y + 2);
}
// glossy "sticker" text for titles
function stickerText(txt, x, y, px, c1, c2, rot) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = font(px); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.strokeStyle = HV.line; ctx.lineWidth = px * 0.34; ctx.strokeText(txt, 0, 0); ctx.strokeStyle = HV.cream; ctx.lineWidth = px * 0.16; ctx.strokeText(txt, 0, 0);
  const g = ctx.createLinearGradient(0, -px, 0, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; (fillRaw || ctx.fillText).call(ctx, txt, 0, 0); ctx.restore();
}
// seamless 256px ground tiles (grass tufts + flowers, cobbles, sand) baked once and used as canvas patterns
const PAT = new Map();
function groundPat(key, base, tuft, flowers, kind) {
  let pt = PAT.get(key); if (pt !== undefined) return pt; pt = null;
  const c = sprite('gt_' + key, 256, () => {
    ctx.translate(-128, -128); ctx.fillStyle = base[0]; ctx.fillRect(0, 0, 256, 256); ctx.fillStyle = base[1]; for (let i = 0; i < 256; i += 64) ctx.fillRect(i, 0, 32, 256);
    const rng = mkRng(key.length * 977 + base[0].charCodeAt(2) * 31), wrap = (f) => { for (const dx of [0, -256, 256]) for (const dy of [0, -256, 256]) f(dx, dy); };
    if (kind === 'grass') {
      for (let i = 0; i < 46; i++) { const x = rng() * 256, y = rng() * 256, h = 5 + rng() * 5; wrap((dx, dy) => { ctx.strokeStyle = tuft; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + dx - 3, y + dy); ctx.lineTo(x + dx - 4, y + dy - h); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx, y + dy - h - 3); ctx.moveTo(x + dx + 3, y + dy); ctx.lineTo(x + dx + 5, y + dy - h); ctx.stroke(); }); }
      for (let i = 0; i < 16; i++) { const x = rng() * 256, y = rng() * 256, col = flowers[i % flowers.length], r = 2.4 + rng() * 1.4; wrap((dx, dy) => { ctx.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.beginPath(); ctx.arc(x + dx + Math.cos(a) * r, y + dy + Math.sin(a) * r, r * 0.75, 0, TAU); ctx.fill(); } ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x + dx, y + dy, r * 0.6, 0, TAU); ctx.fill(); }); }
    } else if (kind === 'cobble') {
      ctx.strokeStyle = tuft; ctx.lineWidth = 3;
      for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) { const x = q * 64 + (r % 2) * 32, y = r * 64; wrap((dx, dy) => { rr(x + dx + 3, y + dy + 3, 58, 58, 14); ctx.stroke(); }); if ((q + r) % 2) { ctx.fillStyle = 'rgba(255,126,182,0.10)'; rr(x + 3, y + 3, 58, 58, 14); ctx.fill(); } }
    } else {
      for (let i = 0; i < 40; i++) { const x = rng() * 256, y = rng() * 256, r = 2 + rng() * 3.5; wrap((dx, dy) => { ctx.fillStyle = tuft; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * 1.5, r, 0, 0, TAU); ctx.fill(); }); }
    }
  });
  if (c && ctx.createPattern) { try { pt = ctx.createPattern(c, 'repeat'); } catch (e) { pt = null; } }
  PAT.set(key, pt); return pt;
}
