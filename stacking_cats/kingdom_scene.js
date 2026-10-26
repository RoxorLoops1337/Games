// The Cat Kingdom panorama: a little village with the nine buildings and the wonders floating above it.
import { BUILDINGS, WONDERS, buildingLevel, upgradeCost } from './cats.js';
import { drawBuilding } from './art_kingdom.js';
import { TAU, mulberry, texturize, hash } from './art_util.js';
import { iconCanvas } from './art_icons.js';

export const KW = 920, KH = 256;
// feet position and size of each building (back row smaller)
const SPOTS = {
  dojo: { x: 92, y: 152, s: 0.86 }, beds: { x: 282, y: 152, s: 0.86 }, yarn: { x: 472, y: 152, s: 0.86 }, spa: { x: 662, y: 152, s: 0.86 }, tower: { x: 836, y: 152, s: 0.86 },
  shrine: { x: 182, y: 222, s: 1 }, vault: { x: 372, y: 222, s: 1 }, tent: { x: 562, y: 222, s: 1 }, stall: { x: 752, y: 222, s: 1 },
};
const WONDER_X = (i) => 110 + i * 140;
const WONDER_Y = 46;

export function hitTest(x, y) {
  for (const w of WONDERS.map((w, i) => ({ w, i })).reverse()) if (Math.hypot(x - WONDER_X(w.i), y - WONDER_Y) < 26) return { type: 'wonder', id: w.w.id };
  const order = BUILDINGS.slice().sort((a, b) => SPOTS[b.id].y - SPOTS[a.id].y);
  for (const b of order) {
    const p = SPOTS[b.id], h = 120 * p.s;
    if (x > p.x - h * 0.52 && x < p.x + h * 0.52 && y > p.y - h * 0.95 && y < p.y + 8) return { type: 'building', id: b.id };
  }
  return null;
}

const sprites = new Map();
function sprite(id, lvl) {
  const key = id + ':' + lvl;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.scale(2, 2); drawBuilding(x, id, lvl);
    texturize(c, { seed: hash(key), len: 8, lw: 1.3, count: 2600, dir: 0.04, spread: 0.6, alpha: 0.4, amp: 0.11, minLum: 60 });   // planks, shingles and plaster grain
    sprites.set(key, c);
  }
  return c;
}

// state: { kingdom, selected: {type,id}|null, bumps: {id: startTime} }
export function drawKingdom(ctx, st, t) {
  const k = st.kingdom;
  const sky = ctx.createLinearGradient(0, 0, 0, KH);
  sky.addColorStop(0, '#7fd0ff'); sky.addColorStop(0.6, '#d9f3ff'); sky.addColorStop(1, '#fff4d6');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, KW, KH);
  const sun = ctx.createRadialGradient(840, 40, 4, 840, 40, 90);
  sun.addColorStop(0, 'rgba(255,255,220,.95)'); sun.addColorStop(1, 'rgba(255,255,220,0)');
  ctx.fillStyle = sun; ctx.fillRect(700, 0, 220, 140);
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 260 + t * (10 + i * 3)) % (KW + 200)) - 100, y = 26 + (i % 3) * 22;
    ctx.beginPath(); ctx.ellipse(x, y, 34, 9, 0, 0, TAU); ctx.ellipse(x - 18, y + 3, 20, 7, 0, 0, TAU); ctx.ellipse(x + 20, y + 3, 22, 7, 0, 0, TAU); ctx.fill();
  }
  // hills
  for (const [col, base, amp, ph] of [['#b7e3b0', 128, 16, 0.5], ['#8fd68f', 150, 14, 2.1]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, KH);
    for (let x = 0; x <= KW; x += 10) ctx.lineTo(x, base + Math.sin(x / 140 + ph) * amp + Math.sin(x / 57 + ph) * 4);
    ctx.lineTo(KW, KH); ctx.fill();
  }
  const gr = ctx.createLinearGradient(0, 150, 0, KH); gr.addColorStop(0, '#7fcf6f'); gr.addColorStop(1, '#5ea856');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 168);
  for (let x = 0; x <= KW; x += 10) ctx.lineTo(x, 166 + Math.sin(x / 90 + 1) * 5);
  ctx.lineTo(KW, KH); ctx.lineTo(0, KH); ctx.fill();
  // path
  ctx.strokeStyle = '#e8cf9a'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 190); ctx.bezierCurveTo(250, 176, 420, 200, 640, 184); ctx.bezierCurveTo(780, 176, 860, 190, KW, 182); ctx.stroke();
  // flowers (fixed scatter)
  const r = mulberry(7);
  for (let i = 0; i < 26; i++) { const x = r() * KW, y = 170 + r() * 60; ctx.fillStyle = ['#fff', '#ffd23f', '#ff9ac6'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
  // birds
  ctx.strokeStyle = '#4a4a6a'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const x = ((t * 40 + i * 330) % (KW + 100)) - 50, y = 70 + i * 14 + Math.sin(t * 2 + i) * 4, f = Math.sin(t * 12 + i) * 3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - f); ctx.quadraticCurveTo(x - 3, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y - f); ctx.stroke();
  }
  // buildings, back row first
  const order = BUILDINGS.slice().sort((a, b) => SPOTS[a.id].y - SPOTS[b.id].y);
  for (const b of order) {
    const p = SPOTS[b.id], l = buildingLevel(k, b.id), sel = st.selected && st.selected.type === 'building' && st.selected.id === b.id;
    const bump = st.bumps && st.bumps[b.id] != null ? Math.max(0, 1 - (t - st.bumps[b.id]) / 0.6) : 0;
    const hop = sel ? Math.abs(Math.sin(t * 4)) * 5 : 0, pop = 1 + bump * 0.22 * Math.sin(bump * 3.14);
    const h = 120 * p.s * pop;
    ctx.fillStyle = 'rgba(40,70,40,.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 52 * p.s, 8 * p.s, 0, 0, TAU); ctx.fill();
    if (sel) { const g2 = ctx.createRadialGradient(p.x, p.y - 36 * p.s, 6, p.x, p.y - 36 * p.s, 78 * p.s); g2.addColorStop(0, 'rgba(255,246,176,.8)'); g2.addColorStop(1, 'rgba(255,246,176,0)'); ctx.fillStyle = g2; ctx.fillRect(p.x - 90, p.y - 120, 180, 140); }
    ctx.drawImage(sprite(b.id, l), p.x - h / 2, p.y - h * (112 / 120) - hop, h, h);
    // level pips
    for (let i = 0; i < b.max; i++) { ctx.fillStyle = i < l ? '#ffd23f' : 'rgba(80,60,110,.35)'; ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x + (i - (b.max - 1) / 2) * 9, p.y + 11, 3, 0, TAU); ctx.fill(); if (i < l) ctx.stroke(); }
    const afford = l < b.max && k.coins >= upgradeCost(b.id, l);
    if (afford) { const y = p.y - h * 0.62 + Math.sin(t * 5 + p.x) * 3; ctx.fillStyle = '#ff4a6a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + h * 0.36, y, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', p.x + h * 0.36, y + 4.5); }
    if (l < b.max && !sel) {
      // price tag: the next upgrade cost, bright when affordable
      const cost = upgradeCost(b.id, l), label = cost >= 10000 ? Math.round(cost / 1000) + 'k' : String(cost);
      ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 26, ty = p.y + 17;
      ctx.fillStyle = afford ? '#2f8a4a' : 'rgba(42,29,74,.78)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, ty, tw, 15, 7); ctx.fill();
      ctx.fillStyle = afford ? '#fff' : '#cfc4ee'; ctx.fillText(label, p.x + 7, ty + 11.5);
      ctx.drawImage(iconCanvas('\u{1FA99}'), p.x - tw / 2 + 2, ty - 1, 17, 17);
    }
    if (sel) { ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(b.name).width + 16; ctx.fillStyle = '#2a1d4a'; ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y + 16, w, 20, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(b.name, p.x, p.y + 30); }
  }
  // wonders float above the village
  WONDERS.forEach((w, i) => {
    const owned = !!(k.wonders && k.wonders[w.id]), x = WONDER_X(i), y = WONDER_Y + Math.sin(t * 1.8 + i) * 4;
    const sel = st.selected && st.selected.type === 'wonder' && st.selected.id === w.id;
    const gl = ctx.createRadialGradient(x, y, 2, x, y, 36);
    gl.addColorStop(0, owned ? 'rgba(255,225,120,.95)' : sel ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - 40, y - 40, 80, 80);
    ctx.fillStyle = owned ? '#fff6d0' : 'rgba(255,255,255,.7)'; ctx.strokeStyle = owned ? '#d9a600' : sel ? '#ff8fb7' : '#9a8ac0'; ctx.lineWidth = sel ? 3.5 : 2.2;
    ctx.beginPath(); ctx.arc(x, y, 21, 0, TAU); ctx.fill(); ctx.stroke();
    if (owned) {
      // a bought wonder wears a gold halo with a few twinkling sparks, so it reads as "yours" at a glance
      ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 27 + Math.sin(t * 2.4 + i) * 1.5, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = t * 0.9 + k * (TAU / 4) + i, tw = 0.5 + 0.5 * Math.sin(t * 3 + k * 1.7 + i);
        ctx.fillStyle = `rgba(255,240,170,${0.35 + 0.55 * tw})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 30, y + Math.sin(a) * 30, 1.6 + tw * 1.4, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = owned ? 1 : 0.55; ctx.drawImage(iconCanvas(w.icon), x - 15, y - 16, 30, 30); ctx.globalAlpha = 1;
    if (!owned) { ctx.fillStyle = '#2a1d4a'; ctx.font = '800 11px sans-serif'; const label = String(w.cost); const tw = ctx.measureText(label).width + 26; ctx.beginPath(); ctx.roundRect(x - tw / 2, y + 23, tw, 15, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 7, y + 34); ctx.drawImage(iconCanvas('💎'), x - tw / 2 + 2, y + 22, 17, 17); }
  });
}

// wires a canvas to the scene. Returns { select, bump, stop }.
export function createKingdomScene(canvas, getKingdom, onSelect) {
  const ctx = canvas.getContext('2d');
  const st = { kingdom: getKingdom(), selected: null, bumps: {} };
  let raf = 0, t0 = performance.now();
  const frame = (ts) => {
    if (!canvas.isConnected) return;
    st.kingdom = getKingdom();
    const t = (ts - t0) / 1000;
    ctx.setTransform(canvas.width / KW, 0, 0, canvas.width / KW, 0, 0);
    drawKingdom(ctx, st, t);
    st.now = t;
    raf = requestAnimationFrame(frame);
  };
  const onDown = (e) => {
    // offsetX is in the element's own coordinates, so it stays right when the page is scaled or rotated
    const x = (e.offsetX / canvas.clientWidth) * KW, y = (e.offsetY / canvas.clientHeight) * KH;
    const hit = hitTest(x, y);
    if (hit) { st.selected = hit; onSelect(hit); }
  };
  canvas.addEventListener('pointerdown', onDown);
  raf = requestAnimationFrame(frame);
  return {
    select(h) { st.selected = h; },
    bump(id) { st.bumps[id] = st.now || 0; },
    stop() { cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', onDown); },
  };
}
