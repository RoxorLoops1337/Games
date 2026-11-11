// THE WARD drawing kit (design/WARD.md section 6, ART_BIBLE "Anatomical Plate"): engraved room glyphs, resource icons,
// building cards, the building deck viewer, the reward building pick and the Dispensary counter.
// Pure canvas drawing plus small immediate-mode widgets; the run is only changed through engine/ward.js and engine/run.js.
//
//   roomGlyph(g, art, x, y, s, ink, spot)        engraved glyph for a room / card art key, centred, s = size in px
//   drawRes(g, kind, x, y, s, on)                'wood' | 'stone' | 'gold' | 'bulb' (on: lit)
//   drawBuildCard(app, card, x, y, w, h, o)      a building card, top-left at (x, y); o: {full, afford, dim, glow, sel, alpha, run}
//   costParts(card) / KIND_INFO / ROOM_TINT / roomShort(type)
//   plansModal(app, run, st)                     the building deck viewer (st.plans = true opens it); returns true while open
//   buildPickRow(app, run, rw, x, y, w, h, st)   reward screen: pick 1 of 3 building cards or skip (engine takeBuildChoice)
//   dispensary(app, run, shop, st)               shop screen: building cards for sale and the remove-a-plan service
import { COL, clamp, rgba } from './core.js';
import { lnw } from '../art/linework.js';
import { drawCoin } from '../art/icons.js';
import { WARD_GLOSSARY } from './tooltips.js';
import { BUILD_CARDS, ROOMS, PHASES, WARD_TUNE } from '../data/ward.js';
import * as WARD from '../engine/ward.js';
import * as RUN from '../engine/run.js';
import { assets } from './assets.js';
import { TAU } from './util.js';

export const INK = '#2B1E1A';

export const ROOM_TINT = {
  rm_entrance: '#7a6a4a', rm_theatre: '#8e1f2c', rm_corridor: '#8a7a5c', rm_ward: '#B3263A', rm_isolation: '#C9A227', rm_chapel: '#3E7C74',
  rm_dispensary: '#5a8fd8', rm_workshop: '#E8571F', rm_sawmill: '#8F4A2A', rm_quarry: '#6f6a60', rm_counting: '#B8922A', rm_generator: '#b8c23a', rm_linen: '#6a9a6a',
};
const SHORT = { rm_entrance: 'Entrance', rm_theatre: 'Theatre', rm_counting: 'Counting', rm_dispensary: 'Dispensary' };
export const roomShort = (type) => SHORT[type] || (ROOMS[type] ? ROOMS[type].name : type);
const KIND_INFO = {
  room: { label: 'ROOM', color: '#8e1f2c' },
  upgrade: { label: 'UPGRADE', color: '#7A5F12' },
  effect: { label: 'EFFECT', color: '#2f5f6b' },
  expand: { label: 'EXPAND', color: '#5a3a7a' },
};
const RARE = { common: '#8a7a5c', uncommon: '#3E7C74', rare: '#C9A227' };

// ---------------- glyphs (engraved: ink contour, spot tint fill, hatch on the shadow side) ----------------
function hatch(g, x, y, w, h, a = 0.35, step = 3) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = rgba(INK, a); g.lineWidth = lnw('hatch'); g.beginPath();
  for (let i = -h; i < w; i += step) { g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); }
  g.stroke(); g.restore();
}
const GL = {};
GL.ward_entrance = (g, s) => { // arched door
  g.beginPath(); g.moveTo(-0.3, 0.42); g.lineTo(-0.3, -0.08); g.arc(0, -0.08, 0.3, Math.PI, 0); g.lineTo(0.3, 0.42); g.closePath();
  return () => { g.beginPath(); g.moveTo(0, -0.38); g.lineTo(0, 0.42); g.moveTo(-0.42, 0.42); g.lineTo(0.42, 0.42); g.stroke(); g.beginPath(); g.arc(0.1, 0.1, 0.035, 0, TAU); g.arc(-0.1, 0.1, 0.035, 0, TAU); g.fill(); };
};
GL.ward_theatre = (g) => { // operating lamp over the table
  g.beginPath(); g.moveTo(-0.34, -0.06); g.quadraticCurveTo(0, -0.5, 0.34, -0.06); g.closePath();
  return () => { g.beginPath(); g.moveTo(0, -0.5); g.lineTo(0, -0.28); g.moveTo(-0.44, 0.38); g.lineTo(0.44, 0.38); g.moveTo(-0.3, 0.38); g.lineTo(-0.3, 0.46); g.moveTo(0.3, 0.38); g.lineTo(0.3, 0.46); for (const dx of [-0.2, 0, 0.2]) { g.moveTo(dx * 0.8, -0.02); g.lineTo(dx * 1.6, 0.26); } g.stroke(); };
};
GL.ward_corridor = (g) => {
  g.beginPath(); g.rect(-0.46, -0.16, 0.92, 0.32);
  return () => { g.save(); g.setLineDash([0.12, 0.08]); g.beginPath(); g.moveTo(-0.36, 0); g.lineTo(0.3, 0); g.stroke(); g.restore(); g.beginPath(); g.moveTo(0.22, -0.08); g.lineTo(0.34, 0); g.lineTo(0.22, 0.08); g.stroke(); };
};
GL.ward_beds = (g) => { // hospital bed
  g.beginPath(); g.rect(-0.42, -0.02, 0.84, 0.18);
  return () => { g.beginPath(); g.moveTo(-0.42, -0.3); g.lineTo(-0.42, 0.36); g.moveTo(0.42, 0.04); g.lineTo(0.42, 0.36); g.moveTo(-0.42, -0.22); g.lineTo(-0.3, -0.22); g.stroke(); g.beginPath(); g.ellipse(-0.24, -0.1, 0.12, 0.07, 0, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(-0.08, -0.02); g.quadraticCurveTo(0.12, -0.2, 0.36, -0.02); g.stroke(); };
};
GL.ward_isolation = (g) => { // barred window and padlock
  g.beginPath(); g.rect(-0.36, -0.4, 0.72, 0.62);
  return () => { g.beginPath(); for (const dx of [-0.18, 0, 0.18]) { g.moveTo(dx, -0.4); g.lineTo(dx, 0.22); } g.stroke(); g.beginPath(); g.rect(-0.12, 0.2, 0.24, 0.2); g.fillStyle = INK; g.fill(); g.beginPath(); g.arc(0, 0.2, 0.08, Math.PI, 0); g.stroke(); };
};
GL.ward_chapel = (g) => { // gothic arch with a cross
  g.beginPath(); g.moveTo(-0.32, 0.44); g.lineTo(-0.32, -0.04); g.quadraticCurveTo(-0.3, -0.36, 0, -0.48); g.quadraticCurveTo(0.3, -0.36, 0.32, -0.04); g.lineTo(0.32, 0.44); g.closePath();
  return () => { g.beginPath(); g.moveTo(0, -0.26); g.lineTo(0, 0.24); g.moveTo(-0.13, -0.1); g.lineTo(0.13, -0.1); g.stroke(); };
};
GL.ward_dispensary = (g) => { // bottle with a cross label
  g.beginPath(); g.moveTo(-0.08, -0.46); g.lineTo(0.08, -0.46); g.lineTo(0.08, -0.26); g.quadraticCurveTo(0.3, -0.18, 0.3, 0.06); g.lineTo(0.3, 0.42); g.lineTo(-0.3, 0.42); g.lineTo(-0.3, 0.06); g.quadraticCurveTo(-0.3, -0.18, -0.08, -0.26); g.closePath();
  return () => { g.beginPath(); g.rect(-0.18, 0.02, 0.36, 0.28); g.stroke(); g.beginPath(); g.moveTo(0, 0.06); g.lineTo(0, 0.26); g.moveTo(-0.1, 0.16); g.lineTo(0.1, 0.16); g.stroke(); };
};
GL.ward_workshop = (g) => { // anvil and hammer
  g.beginPath(); g.moveTo(-0.44, -0.04); g.lineTo(0.3, -0.04); g.quadraticCurveTo(0.44, -0.02, 0.46, 0.08); g.lineTo(0.14, 0.12); g.lineTo(0.18, 0.3); g.lineTo(0.28, 0.4); g.lineTo(-0.28, 0.4); g.lineTo(-0.18, 0.3); g.lineTo(-0.14, 0.12); g.lineTo(-0.36, 0.08); g.closePath();
  return () => { g.beginPath(); g.moveTo(-0.3, -0.48); g.lineTo(0.06, -0.14); g.stroke(); g.beginPath(); g.rect(-0.42, -0.5, 0.2, 0.12); g.fillStyle = INK; g.fill(); };
};
GL.ward_sawmill = (g) => { // circular saw
  g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? 0.34 : 0.44; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  return () => { g.beginPath(); g.arc(0, 0, 0.1, 0, TAU); g.stroke(); };
};
GL.ward_quarry = (g) => { // stone block and pick
  g.beginPath(); g.moveTo(-0.42, 0.42); g.lineTo(-0.3, 0.06); g.lineTo(0.08, 0.0); g.lineTo(0.3, 0.2); g.lineTo(0.22, 0.42); g.closePath();
  return () => { g.beginPath(); g.moveTo(-0.1, -0.44); g.quadraticCurveTo(0.2, -0.46, 0.42, -0.26); g.moveTo(0.16, -0.42); g.lineTo(-0.06, 0.0); g.stroke(); };
};
GL.ward_counting = (g) => { // coin stack
  g.beginPath(); for (let i = 0; i < 4; i++) g.ellipse(-0.08, 0.3 - i * 0.16, 0.3, 0.1, 0, 0, TAU);
  return () => { g.beginPath(); g.ellipse(0.28, 0.32, 0.16, 0.1, 0, 0, TAU); g.stroke(); };
};
GL.ward_generator = (g) => { // coil with a bolt
  g.beginPath(); g.rect(-0.34, -0.36, 0.68, 0.72);
  return () => { g.beginPath(); for (let i = 0; i < 5; i++) { const y = -0.26 + i * 0.13; g.moveTo(-0.34, y); g.lineTo(-0.22, y + 0.05); } g.stroke(); g.beginPath(); g.moveTo(0.08, -0.3); g.lineTo(-0.06, 0.02); g.lineTo(0.08, 0.02); g.lineTo(-0.04, 0.3); g.stroke(); };
};
GL.ward_linen = (g) => { // folded sheets
  g.beginPath(); g.rect(-0.4, 0.06, 0.8, 0.16); g.rect(-0.36, -0.12, 0.72, 0.16); g.rect(-0.32, -0.3, 0.64, 0.16);
  return () => { g.beginPath(); g.moveTo(-0.44, 0.34); g.lineTo(0.44, 0.34); g.stroke(); };
};
GL.ward_overtime = (g) => { g.beginPath(); g.arc(0, 0, 0.38, 0, TAU); return () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -0.26); g.moveTo(0, 0); g.lineTo(0.18, 0.06); g.stroke(); g.beginPath(); g.arc(0, 0, 0.5, -0.6, 0.6); g.stroke(); g.beginPath(); g.arc(0, 0, 0.5, Math.PI - 0.6, Math.PI + 0.6); g.stroke(); }; };
GL.ward_doors = (g) => { g.beginPath(); g.rect(-0.3, -0.42, 0.6, 0.84); return () => { g.beginPath(); for (const y of [-0.26, 0, 0.26]) { g.moveTo(-0.3, y); g.lineTo(0.3, y); } g.stroke(); g.beginPath(); for (const [x, y] of [[-0.2, -0.34], [0.2, -0.34], [-0.2, 0.34], [0.2, 0.34]]) g.arc(x, y, 0.035, 0, TAU); g.fill(); }; };
GL.ward_moon = (g) => { g.beginPath(); g.arc(0, 0, 0.4, 0.5, TAU - 0.5); g.arc(0.18, -0.06, 0.3, TAU - 0.9, 0.9, true); g.closePath(); return () => { g.beginPath(); g.arc(0.3, -0.3, 0.04, 0, TAU); g.fill(); }; };
GL.ward_sun = (g) => { g.beginPath(); g.arc(0, 0, 0.22, 0, TAU); return () => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); g.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); } g.stroke(); }; };
GL.ward_bowl = (g) => { g.beginPath(); g.moveTo(-0.42, -0.02); g.quadraticCurveTo(0, 0.6, 0.42, -0.02); g.closePath(); return () => { g.beginPath(); g.moveTo(-0.1, -0.12); g.quadraticCurveTo(-0.16, -0.26, -0.08, -0.38); g.moveTo(0.1, -0.12); g.quadraticCurveTo(0.04, -0.26, 0.12, -0.38); g.stroke(); }; };
GL.ward_lamp = (g) => { g.beginPath(); g.moveTo(-0.24, 0.3); g.quadraticCurveTo(-0.3, -0.1, 0, -0.18); g.quadraticCurveTo(0.3, -0.1, 0.24, 0.3); g.closePath(); return () => { g.beginPath(); g.moveTo(-0.3, 0.38); g.lineTo(0.3, 0.38); g.moveTo(0, -0.18); g.lineTo(0, -0.3); g.stroke(); g.beginPath(); g.moveTo(0, -0.46); g.quadraticCurveTo(0.08, -0.36, 0, -0.3); g.quadraticCurveTo(-0.08, -0.36, 0, -0.46); g.fillStyle = '#E8571F'; g.fill(); }; };
GL.ward_cross = (g) => { g.beginPath(); g.rect(-0.12, -0.4, 0.24, 0.8); g.rect(-0.4, -0.12, 0.8, 0.24); return null; };
GL.ward_crate = (g) => { g.beginPath(); g.rect(-0.38, -0.3, 0.76, 0.66); return () => { g.beginPath(); g.moveTo(-0.38, -0.3); g.lineTo(0.38, 0.36); g.moveTo(0.38, -0.3); g.lineTo(-0.38, 0.36); g.moveTo(-0.38, 0.03); g.lineTo(0.38, 0.03); g.stroke(); }; };
GL.ward_coin = (g) => { g.beginPath(); g.arc(0, 0, 0.36, 0, TAU); return () => { g.beginPath(); g.arc(0, 0, 0.26, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(0, -0.16); g.lineTo(0, 0.16); g.stroke(); }; };
GL.ward_clock = (g) => { g.beginPath(); g.arc(0, 0.04, 0.38, 0, TAU); return () => { g.beginPath(); g.moveTo(0, 0.04); g.lineTo(0, -0.2); g.moveTo(0, 0.04); g.lineTo(0.16, 0.14); g.moveTo(-0.3, -0.38); g.lineTo(-0.16, -0.3); g.moveTo(0.3, -0.38); g.lineTo(0.16, -0.3); g.stroke(); }; };
GL.ward_hammer = (g) => { g.beginPath(); g.rect(-0.36, -0.4, 0.5, 0.2); return () => { g.beginPath(); g.moveTo(-0.08, -0.2); g.lineTo(0.3, 0.42); g.stroke(); g.beginPath(); g.moveTo(0.2, -0.1); g.lineTo(0.34, 0.0); g.lineTo(0.42, -0.14); g.stroke(); }; };
GL.ward_moonsun = GL.ward_sun;
GL.ward_highsun = (g) => { g.beginPath(); g.arc(0, 0, 0.26, 0, TAU); return () => { g.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r1 = 0.32, r2 = i % 2 ? 0.42 : 0.5; g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } g.stroke(); }; };
const ROOM_ART = { rm_entrance: 'ward_entrance', rm_theatre: 'ward_theatre', rm_corridor: 'ward_corridor', rm_ward: 'ward_beds', rm_isolation: 'ward_isolation', rm_chapel: 'ward_chapel', rm_dispensary: 'ward_dispensary', rm_workshop: 'ward_workshop', rm_sawmill: 'ward_sawmill', rm_quarry: 'ward_quarry', rm_counting: 'ward_counting', rm_generator: 'ward_generator', rm_linen: 'ward_linen' };
const artOfRoom = (type) => ROOM_ART[type] || (ROOMS[type] && ROOMS[type].art) || 'ward_corridor';

// roomGlyph(g, art, x, y, s, ink, spot): art is a room type (rm_*) or an art key (ward_*)
export function roomGlyph(g, art, x, y, s, ink = INK, spot) {
  const key = art && art.startsWith('rm_') ? artOfRoom(art) : art;
  const fn = GL[key] || GL.ward_corridor;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const detail = fn(g, s);
  if (spot) { g.fillStyle = rgba(spot, 0.32); g.fill(); }
  g.strokeStyle = ink; g.lineWidth = lnw('ink') / s; g.stroke();
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = lnw('fine') / s;
  if (detail) detail();
  g.restore();
}

// ---------------- resource icons ----------------
// icon art from assets/ward/manifest.json (icons: wood stone gold power morning midday evening night);
// any id the manifest lacks falls back to the engraved procedural drawing below
function drawIcon(g, ids, x, y, s, alpha = 1) {
  for (const id of ids) {
    const ic = assets.icon(id);
    if (ic) { const d = ic.def, k = s / Math.max(d.w || 1, d.h || 1); g.save(); if (alpha < 1) g.globalAlpha *= alpha; g.drawImage(ic.img, x - (d.w || s) * k / 2, y - (d.h || s) * k / 2, (d.w || s) * k, (d.h || s) * k); g.restore(); return true; }
  }
  return false;
}
export function phaseIcon(g, ph, glyph, x, y, s, ink, spot) { if (!drawIcon(g, [ph], x, y, s * 1.15)) roomGlyph(g, glyph, x, y, s, ink, spot); }
export function drawRes(g, kind, x, y, s, on = true) {
  if (kind === 'bulb') { if (drawIcon(g, ['power'], x, y, s * 1.25, on ? 1 : 0.28)) return; }
  else if (drawIcon(g, [kind], x, y, s * 1.1)) return;
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round';
  if (kind === 'gold') { g.restore(); drawCoin(g, x, y, s); return; }
  const r = s / 2;
  if (kind === 'wood') { // two logs with ring ends
    g.fillStyle = '#9a6a3a'; g.strokeStyle = '#3a2412'; g.lineWidth = lnw('fine');
    for (const [dy, dx] of [[r * 0.28, -r * 0.1], [-r * 0.28, r * 0.12]]) {
      g.beginPath(); g.rect(-r * 0.8 + dx, dy - r * 0.26, r * 1.4, r * 0.52); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(r * 0.6 + dx, dy, r * 0.18, r * 0.26, 0, 0, TAU); g.fillStyle = '#e0b880'; g.fill(); g.stroke(); g.fillStyle = '#9a6a3a';
    }
  } else if (kind === 'stone') { // a cut block
    g.beginPath(); g.moveTo(-r * 0.8, -r * 0.2); g.lineTo(-r * 0.2, -r * 0.62); g.lineTo(r * 0.82, -r * 0.36); g.lineTo(r * 0.8, r * 0.4); g.lineTo(0, r * 0.72); g.lineTo(-r * 0.82, r * 0.42); g.closePath();
    g.fillStyle = '#a8a198'; g.fill(); g.strokeStyle = '#2f2b26'; g.lineWidth = lnw('fine'); g.stroke();
    g.beginPath(); g.moveTo(-r * 0.8, -r * 0.2); g.lineTo(0, r * 0.06); g.lineTo(r * 0.82, -r * 0.36); g.moveTo(0, r * 0.06); g.lineTo(0, r * 0.72); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(0, r * 0.06); g.lineTo(r * 0.82, -r * 0.36); g.lineTo(r * 0.8, r * 0.4); g.lineTo(0, r * 0.72); g.closePath(); g.fill();
  } else if (kind === 'bulb') { // glass bulb, lit or dark
    if (on) { const gr = g.createRadialGradient(0, -r * 0.2, 1, 0, -r * 0.2, r * 1.2); gr.addColorStop(0, 'rgba(255,236,160,.85)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, -r * 0.2, r * 1.2, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(0, -r * 0.22, r * 0.56, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(r * 0.24, r * 0.34); g.lineTo(-r * 0.24, r * 0.34); g.closePath();
    g.fillStyle = on ? '#FFE9A0' : 'rgba(60,52,44,.55)'; g.fill(); g.strokeStyle = on ? '#7A5F12' : 'rgba(30,24,20,.8)'; g.lineWidth = lnw('fine'); g.stroke();
    g.fillStyle = '#7A5F12'; g.fillRect(-r * 0.26, r * 0.36, r * 0.52, r * 0.26);
    if (on) { g.strokeStyle = '#E8571F'; g.lineWidth = lnw('hair'); g.beginPath(); g.moveTo(-r * 0.14, r * 0.2); g.lineTo(-r * 0.06, -r * 0.2); g.lineTo(r * 0.06, r * 0.0); g.lineTo(r * 0.14, -r * 0.24); g.stroke(); }
  }
  g.restore();
}

// ---------------- building cards ----------------
function costParts(card) {
  const c = card.cost || {}, out = [];
  for (const k of ['wood', 'stone', 'gold']) if (c[k]) out.push([k, c[k]]);
  return out;
}
function affords(run, card) {
  const c = card.cost || {}, w = run.ward;
  return { wood: !c.wood || (w && w.res.wood >= c.wood), stone: !c.stone || (w && w.res.stone >= c.stone), gold: !c.gold || run.gold >= c.gold };
}
function cardTip(card) {
  const k = KIND_INFO[card.kind];
  const cost = costParts(card).map(([r, n]) => `${n} ${r}`).join(', ') || 'free';
  const room = card.kind === 'room' ? ROOMS[card.room] : null;
  const cells = card.size ? card.size[0] * card.size[1] : 1, big = room && cells > 1 && room.big ? room.big : {};
  const pw = room ? (room.power ? ` Uses ${room.power * cells} power while lit.` : (big.powerAdd || room.powerAdd) ? ` Adds ${big.powerAdd || room.powerAdd} power.` : ' Uses no power.') : '';
  return `${k.label}, ${card.rarity}. ` + (card.kind === 'expand' ? 'Costs what the room\'s Expand costs (shown when you aim it).' : `Costs ${cost}.`) + (cells > 1 ? ` Covers ${cells} cells.` : '') + pw + `\n${card.text}`;
}
// drawBuildCard(app, card, x, y, w, h, o): o.full shows the rules text (enlarged card); o.run greys unaffordable costs
export function drawBuildCard(app, card, x, y, w, h, o = {}) {
  const g = app.ctx, k = w / 124, kind = KIND_INFO[card.kind] || KIND_INFO.effect;
  const room = card.kind === 'room' ? ROOMS[card.room] : null;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  // shadow + glow
  g.fillStyle = 'rgba(0,0,0,.45)'; app.rr(x + 3 * k, y + 5 * k, w, h, 8 * k); g.fill();
  if (o.glow || o.sel) { g.shadowColor = o.sel ? COL.lamp : rgba(COL.lamp, 0.7); g.shadowBlur = 18; }
  app.rr(x, y, w, h, 8 * k);
  const vg = g.createLinearGradient(x, y, x + w * 0.4, y + h); vg.addColorStop(0, '#efe4cc'); vg.addColorStop(1, '#d8c8a4'); g.fillStyle = vg; g.fill(); g.shadowBlur = 0;
  g.strokeStyle = o.sel ? COL.lamp : INK; g.lineWidth = lnw(o.sel ? 'bold' : 'ink'); g.stroke();
  app.rr(x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k, 5 * k); g.strokeStyle = rgba(INK, 0.45); g.lineWidth = lnw('hair'); g.stroke();
  // rarity pip
  g.fillStyle = RARE[card.rarity] || RARE.common; g.beginPath(); g.arc(x + w - 11 * k, y + 11 * k, 4 * k, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = lnw('hair'); g.stroke();
  g.restore();
  const A = o.alpha === undefined ? 1 : o.alpha;
  // name
  app.text(card.name, x + w / 2, y + 8 * k, { size: Math.round(14 * k), bold: true, align: 'center', color: INK, alpha: A, fit: { w: w - 24 * k, lines: 1, soft: true } }); // the tooltip carries the full name
  // cost row
  const parts = costParts(card), ok = o.run ? affords(o.run, card) : null;
  let cx = x + 9 * k; const cy = y + 33 * k, isz = 15 * k;
  if (card.kind === 'expand') app.text('VARIES', cx, cy - 7 * k, { size: Math.round(12 * k), ui: true, bold: true, color: '#5a3a7a', alpha: A, fit: { w: 80 * k, lines: 1 } });
  else if (!parts.length) app.text('FREE', cx, cy - 7 * k, { size: Math.round(11 * k), ui: true, bold: true, color: '#3E7C74', alpha: A, fit: { w: 48 * k, lines: 1 } });
  for (const [r, n] of parts) {
    g.save(); g.globalAlpha *= A; drawRes(g, r, cx + isz / 2, cy, isz); g.restore();
    const bad = ok && !ok[r];
    app.text(String(n), cx + isz + 1, cy - 8 * k, { size: Math.round(14 * k), bold: true, color: bad ? '#a3142f' : INK, alpha: A, fixed: true });
    cx += isz + 8 * k + app.measure(String(n), Math.round(14 * k), { bold: true, fixed: true });
  }
  // power at the right of the cost row
  const cells = card.size ? card.size[0] * card.size[1] : 1, big = room && cells > 1 && room.big ? room.big : {};
  if (room && (room.power || room.powerAdd)) {
    const px = x + w - 14 * k;
    g.save(); g.globalAlpha *= A; drawRes(g, 'bulb', px, cy, 14 * k, true); g.restore();
    app.text(room.powerAdd ? '+' + (big.powerAdd || room.powerAdd) : String(room.power * cells), px - 9 * k, cy - 8 * k, { size: Math.round(13 * k), bold: true, align: 'right', color: room.powerAdd ? '#3E7C74' : INK, alpha: A, fixed: true });
  }
  // engraved illustration
  const iy = y + 46 * k, ih = o.full ? 50 * k : 78 * k;
  g.save(); g.globalAlpha *= A;
  const cardArt = assets.cardArt(card); // the card's illustration, else the diorama of its room
  if (cardArt) { const d = cardArt.def, bw = w * 0.84, bh = ih * 1.06, k = Math.min(bw / (d.w || 1), bh / (d.h || 1)); g.drawImage(cardArt.img, x + w / 2 - d.w * k / 2, iy + ih / 2 - d.h * k / 2, d.w * k, d.h * k); }
  else {
  g.beginPath(); g.ellipse(x + w / 2, iy + ih / 2, w * 0.36, ih * 0.46, 0, 0, TAU); g.fillStyle = 'rgba(255,248,230,.55)'; g.fill(); g.strokeStyle = rgba(INK, 0.55); g.lineWidth = lnw('hair'); g.stroke();
  hatch(g, x + w / 2, iy + 2, w * 0.36, ih - 4, 0.12, 4);
  roomGlyph(g, card.kind === 'room' ? card.room : card.art, x + w / 2, iy + ih / 2, Math.min(w * 0.5, ih * 0.82), INK, room ? ROOM_TINT[card.room] : kind.color);
  }
  g.restore();
  // rules text (enlarged card only)
  const ry = iy + ih + 4 * k, rb = y + h - 24 * k;
  if (o.full && rb - ry > 10) app.text(card.text, x + w / 2, ry, { size: Math.round(11.5 * k), ui: true, align: 'center', color: INK, alpha: A, fit: { w: w - 16 * k, h: rb - ry, soft: true } });
  // kind ribbon
  const rh = 17 * k, ryy = y + h - rh - 5 * k;
  g.save(); g.globalAlpha *= A;
  g.fillStyle = kind.color; g.beginPath(); g.moveTo(x + 6 * k, ryy); g.lineTo(x + w - 6 * k, ryy); g.lineTo(x + w - 12 * k, ryy + rh / 2); g.lineTo(x + w - 6 * k, ryy + rh); g.lineTo(x + 6 * k, ryy + rh); g.lineTo(x + 12 * k, ryy + rh / 2); g.closePath(); g.fill();
  g.restore();
  app.text(kind.label, x + w / 2, ryy + 2 * k, { size: Math.round(11 * k), ui: true, bold: true, align: 'center', color: '#f6ecd4', alpha: A, fit: { w: w - 30 * k, h: rh, lines: 1 } });
  if (o.dim) { g.save(); app.rr(x, y, w, h, 8 * k); g.fillStyle = 'rgba(20,16,14,.42)'; g.fill(); g.restore(); }
  if (o.dark) { // no spare power: the room would be built dark (the bulb is struck out)
    const bx = x + w - 14 * k, by = y + 33 * k;
    g.save(); g.strokeStyle = '#a3142f'; g.lineWidth = lnw('bold'); g.beginPath(); g.moveTo(bx - 9 * k, by + 9 * k); g.lineTo(bx + 9 * k, by - 9 * k); g.stroke(); g.restore();
    app.text('DARK', x + w / 2, y + h - 40 * k, { size: Math.round(11 * k), ui: true, bold: true, align: 'center', color: '#a3142f', stroke: '#efe4cc', strokeW: 3, fit: { w: w - 20 * k, lines: 1 } });
  }
}

// would this plan build its room dark? (a powered room, and the spare power is less than it draws)
export function wouldBuildDark(run, card) {
  const room = card && card.kind === 'room' ? ROOMS[card.room] : null;
  if (!room || !(room.power > 0)) return false;
  const pw = WARD.wardPower(run);
  return pw.free < room.power * (card.size ? card.size[0] * card.size[1] : 1);
}
// the building plans in hand that a morning could still play (not blocked by cost): used by the End Morning warning
export function playablePlans(run) {
  const w = run.ward, out = [];
  for (const c of w.deck.hand) { const card = BUILD_CARDS[c.id]; if (card && WARD.canPlayBuild(run, c.uid, card.kind === 'room' ? { x: -1, y: -1 } : null).why !== 'cost' && !(card.kind === 'expand' && !Object.keys(w.rooms).some((id) => WARD.expandOptions(run, id).ok))) out.push(c); }
  return out;
}
// the reward header's gold note: what the fight pays and why ("1 monster pays 75%, midday +10%")
export function goldNote(wd, phase, kind) {
  if (!wd || !wd.goldMul || Math.abs(wd.goldMul - 1) <= 0.01) return '';
  const n = wd.count || 0, single = (!kind || kind === 'normal') && n >= 1;
  const cf = single ? (n >= 2 ? 1 + WARD_TUNE.goldPerExtra * (n - 2) : 0.75) : 1; // data/ward.js goldPerExtra
  const ph = wd.goldMul / cf, pct = Math.round((ph - 1) * 100), parts = [];
  if (single && Math.abs(cf - 1) > 0.01) parts.push(`${plural0(n, 'monster')} pay${n === 1 ? 's' : ''} ${Math.round(cf * 100)}%`);
  if (Math.abs(pct) >= 1) parts.push(`${phase ? PHASE_NAME[phase] || phase : 'the hour'} ${pct > 0 ? '+' : ''}${pct}%`);
  return parts.length ? 'Gold: ' + parts.join(', ') + '.' : '';
}
const plural0 = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
const PHASE_NAME = { midday: 'midday', evening: 'evening', night: 'night' };
// where an event came from: "Chapel event, midday" plus how that hour leans (the event screen's heading)
export function eventSource(pending) {
  const ph = pending && pending.phase;
  if (!ph || !PHASES[ph]) return null;
  const lean = ph === 'midday' ? 'leans to gold and healing' : ph === 'night' ? 'leans strange and risky' : 'no lean';
  return { head: `CHAPEL EVENT, ${PHASES[ph].name.toUpperCase()}`, lean };
}

// ---------------- the building deck viewer (Plans) ----------------
export function plansModal(app, run, st) {
  if (!st.plans) return false;
  const g = app.ctx, w = run.ward; if (!w) { st.plans = false; return false; }
  g.save(); g.fillStyle = 'rgba(8,6,5,.82)'; g.fillRect(0, 0, 1280, 720); g.restore();
  const X = 60, Y = 70, PW = 1160, PH = 600;
  app.reg('ward-plans', X, Y, PW, PH, { overlay: true });
  app.panel(X, Y, PW, PH, { fill: 'rgba(22,18,16,.97)', r: 14 });
  const d = w.deck, list = [...d.hand.map((c) => [c, 'hand']), ...d.draw.map((c) => [c, 'draw']), ...d.discard.map((c) => [c, 'discard'])];
  app.text('Building plans', X + 24, Y + 16, { size: 28, bold: true, color: COL.lamp, fit: { w: 500, lines: 1 } });
  app.text(`${list.length} plans: ${d.hand.length} in hand, ${d.draw.length} to draw, ${d.discard.length} used. Draw 5 each morning; reshuffle when the pile is empty.`, X + 24, Y + 54, { size: 15, ui: true, color: 'rgba(232,220,196,.75)', fit: { w: PW - 48, lines: 2 } });
  const cols = 8, cw = 120, ch = 160, gx = 18, gy = 14, x0 = X + (PW - (cols * cw + (cols - 1) * gx)) / 2, y0 = Y + 104;
  const rows = Math.max(1, Math.ceil(list.length / cols)), avail = PH - 104 - 74, step = ch + gy, maxS = Math.max(0, rows * step - avail);
  st.plansScroll = clamp((st.plansScroll || 0) + (app.inRect(X, y0, PW, avail) ? app.mouse.wheel * 0.6 : 0), 0, maxS);
  app.reg('scroll-ward-plans', X + 10, y0 - 4, PW - 20, avail + 4, { overlay: true });
  g.save(); g.beginPath(); g.rect(X + 10, y0 - 4, PW - 20, avail + 4); g.clip();
  let hov = null;
  list.forEach(([c, where], i) => {
    const card = BUILD_CARDS[c.id]; if (!card) return;
    const cx = x0 + (i % cols) * (cw + gx), cy = y0 + Math.floor(i / cols) * step - st.plansScroll;
    if (cy > y0 + avail || cy + ch < y0 - 4) return;
    drawBuildCard(app, card, cx, cy, cw, ch, { dim: where === 'discard', run });
    app.text(where === 'hand' ? 'IN HAND' : where === 'draw' ? 'TO DRAW' : 'USED', cx + cw / 2, cy + ch - 40, { size: 11, ui: true, bold: true, align: 'center', color: where === 'hand' ? '#3E7C74' : INK, fit: { w: cw - 20, lines: 1 } });
    if (app.inRect(cx, Math.max(cy, y0), cw, Math.min(ch, y0 + avail - cy))) hov = card;
  });
  g.restore();
  if (hov) app.tooltip(hov.name, cardTip(hov), { color: COL.lamp, terms: termsForCard(hov) });
  if (app.button('Close', X + PW / 2 - 90, Y + PH - 62, 180, 48, { size: 20 }) || app.pressedKeys.some((e) => e.key === 'Escape')) { st.plans = false; app.escBusy = true; }
  return true;
}
function termsForCard(card) {
  const t = [];
  if (card.kind === 'room') { const r = ROOMS[card.room]; if (r && GLOSS_ROOM[card.room]) t.push(GLOSS_ROOM[card.room]); if (r && (r.power || r.powerAdd)) t.push('Power'); }
  if (card.id === 'b_reinforced_beds' || card.id === 'b_night_shift') t.push('Ward');
  if (card.id === 'b_night_shift') t.push('Night');
  if (card.id === 'b_lamp_oil') t.push('Dark room');
  if (card.id === 'b_scrub_in') t.push('Level 2 elite');
  for (const r of ['Wood', 'Stone']) if (card.cost && card.cost[r.toLowerCase()]) t.push(r);
  for (const n of Object.keys(WARD_GLOSSARY)) if (!t.includes(n) && new RegExp('\\b' + n + '\\b').test(card.text || '')) t.push(n); // every Ward word the card's own text names
  return t;
}
const GLOSS_ROOM = { rm_ward: 'Ward', rm_isolation: 'Isolation', rm_chapel: 'Chapel', rm_dispensary: 'Dispensary', rm_workshop: 'Workshop', rm_linen: 'Linen Room', rm_sawmill: 'Sawmill', rm_quarry: 'Quarry', rm_counting: 'Counting House', rm_generator: 'Generator', rm_corridor: 'Corridor' };

// ---------------- reward: pick 1 of 3 building cards ----------------
// st: the reward screen's state (st.build: chosen id | 'skip'). Returns the row height used.
export function buildPickRow(app, run, rw, x, y, w, h, st) {
  const ids = st.buildInit || []; if (!ids.length) return 0;
  const g = app.ctx, done = st.build !== undefined;
  app.reg('reward-build', x, y, w, h, { group: 'build' });
  app.panel(x, y, w, h, { fill: '#2b231e', r: 12, stroke: done ? 'rgba(232,220,196,.2)' : rgba(COL.lamp, 0.6) });
  const lw0 = Math.min(190, w * 0.28);
  app.text('BUILDING PLAN', x + 14, y + 10, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.6)', fit: { w: lw0 - 14, lines: 1 } });
  const msg = done ? (st.build === 'skip' ? 'Passed. No plan taken.' : `${BUILD_CARDS[st.build].name} joins your plans.`) : 'Pick 1 for your building deck, or pass.';
  app.text(msg, x + 14, y + 30, { size: 15, ui: true, color: done ? COL.good : COL.vellum, fit: { w: lw0 - 14, h: h - 80, lines: 3 } });
  const skipW = lw0 - 28, skipH = 40, sy = y + h - skipH - 10;
  if (!done) { app.reg('reward-build-skip', x + 14, sy, skipW, skipH, { group: 'build' }); if (app.button('Pass', x + 14, sy, skipW, skipH, { size: 17 })) { WARD.takeBuildChoice(run, null); st.build = 'skip'; } }
  const cw = Math.min(110, (h - 12) * 0.72), ch = cw / 0.72, gap = 14, n = ids.length, cx0 = x + lw0 + Math.max(0, (w - lw0 - (n * cw + (n - 1) * gap)) / 2);
  let hov = null;
  ids.forEach((id, i) => {
    const card = BUILD_CARDS[id]; if (!card) return;
    const cx = cx0 + i * (cw + gap), cy = y + (h - ch) / 2, mine = st.build === id, over = !done && !app.blocked && app.inRect(cx, cy, cw, ch);
    app.reg('reward-build' + i, cx, cy, cw, ch, { group: 'build' });
    drawBuildCard(app, card, cx, cy - (over ? 4 : 0), cw, ch, { sel: mine, glow: over, dim: done && !mine, run });
    if (app.inRect(cx, cy, cw, ch)) hov = card;
    if (over && app.clicked(cx, cy, cw, ch)) {
      WARD.takeBuildChoice(run, id); st.build = id;
      const a = app.shared.audio; if (a && a.sfx) a.sfx('upgrade');
      if (st.fx) { st.fx.burst(cx + cw / 2, cy + ch / 2, 'gilded', { n: 18 }); st.fx.ring(cx + cw / 2, cy + ch / 2, COL.lamp, 90, 0.5); }
    }
  });
  if (hov) app.tooltip(hov.name, cardTip(hov), { color: COL.lamp, terms: termsForCard(hov), anchor: { x: x, y, w, h } });
  return h;
}

// ---------------- Dispensary counter (shop) ----------------
// st.disp: null | { tab: 'buy' | 'remove', scroll } ; returns true while the counter is open (the shop blocks its own input)
export function dispensary(app, run, shop, st) {
  if (!st.disp || !shop.builds) return false;
  const g = app.ctx, D = st.disp;
  g.save(); g.fillStyle = 'rgba(8,6,5,.82)'; g.fillRect(0, 0, 1280, 720); g.restore();
  const X = 120, Y = 80, PW = 1040, PH = 560;
  app.reg('shop-dispensary', X, Y, PW, PH, { overlay: true });
  app.panel(X, Y, PW, PH, { fill: 'rgba(22,18,16,.97)', r: 14 });
  app.text('Dispensary: building plans', X + 24, Y + 16, { size: 26, bold: true, color: COL.lamp, fit: { w: 620, lines: 1 } });
  drawCoin(g, X + PW - 130, Y + 34, 24);
  app.text(String(run.gold), X + PW - 112, Y + 20, { size: 24, bold: true, color: COL.gold, fit: { w: 90, lines: 1 } });
  if (D.tab === 'remove') {
    app.text(`Strike one plan from your building deck for ${shop.buildRemovePrice} gold. Once per visit.`, X + 24, Y + 56, { size: 15, ui: true, color: 'rgba(232,220,196,.75)', fit: { w: PW - 48, lines: 2 } });
    const list = WARD.buildDeckList(run), cols = 7, cw = 120, ch = 160, gx = 18, x0 = X + (PW - (cols * cw + (cols - 1) * gx)) / 2, y0 = Y + 96, avail = PH - 96 - 74;
    const rows = Math.ceil(list.length / cols), maxS = Math.max(0, rows * (ch + 14) - avail);
    D.scroll = clamp((D.scroll || 0) + (app.inRect(X, y0, PW, avail) ? app.mouse.wheel * 0.6 : 0), 0, maxS);
    app.reg('scroll-dispensary', X + 10, y0 - 4, PW - 20, avail + 4, { overlay: true });
    g.save(); g.beginPath(); g.rect(X + 10, y0 - 4, PW - 20, avail + 4); g.clip();
    let hov = null;
    list.forEach((c, i) => {
      const card = BUILD_CARDS[c.id], cx = x0 + (i % cols) * (cw + gx), cy = y0 + Math.floor(i / cols) * (ch + 14) - D.scroll;
      if (!card || cy > y0 + avail || cy + ch < y0) return;
      const vis = app.inRect(cx, Math.max(cy, y0), cw, Math.max(0, Math.min(ch, y0 + avail - cy)));
      drawBuildCard(app, card, cx, cy - (vis ? 3 : 0), cw, ch, { glow: vis, run });
      if (vis) { hov = card; if (app.clicked(cx, Math.max(cy, y0), cw, Math.min(ch, y0 + avail - cy))) { const r = RUN.shopBuy(run, 'buildRemove', 0, c.uid); D.tab = 'buy'; D.msg = r.ok ? `${card.name} is struck from your plans.` : r.why === 'gold' ? 'Not enough gold.' : 'Already done this visit.'; const a = app.shared.audio; if (a && a.sfx) a.sfx(r.ok ? 'shopBuy' : 'error'); } }
    });
    g.restore();
    if (hov) app.tooltip(hov.name, cardTip(hov) + `\nClick to strike it for ${shop.buildRemovePrice} gold.`, { color: COL.bad, terms: termsForCard(hov) });
    if (app.button('Back', X + PW / 2 - 90, Y + PH - 62, 180, 48, { size: 20 }) || app.pressedKeys.some((e) => e.key === 'Escape')) { D.tab = 'buy'; app.escBusy = true; }
    return true;
  }
  app.text(D.msg || 'Plans for your building deck. They arrive in your discard pile.', X + 24, Y + 56, { size: 15, ui: true, color: D.msg ? COL.good : 'rgba(232,220,196,.75)', fit: { w: PW - 48, lines: 2 } });
  const n = shop.builds.length, cw = 170, ch = 236, gap = 40, x0 = X + (PW - (n * cw + (n - 1) * gap)) / 2, cy = Y + 104;
  let hov = null;
  shop.builds.forEach((it, i) => {
    const card = BUILD_CARDS[it.id], cx = x0 + i * (cw + gap), can = !it.sold && run.gold >= it.price, over = !it.sold && app.inRect(cx, cy, cw, ch);
    app.reg('shop-build' + i, cx, cy, cw, ch + 44, { overlay: true });
    drawBuildCard(app, card, cx, cy - (over ? 4 : 0), cw, ch, { full: true, glow: over && can, dim: it.sold, run });
    if (it.sold) app.text('SOLD', cx + cw / 2, cy + ch / 2 - 18, { size: 34, bold: true, align: 'center', color: COL.scar, stroke: '#1a1614', strokeW: 4 });
    else {
      drawCoin(g, cx + cw / 2 - 30, cy + ch + 22, 20);
      app.text(String(it.price), cx + cw / 2 - 16, cy + ch + 10, { size: 22, bold: true, color: can ? COL.gold : COL.bad, fit: { w: 80, lines: 1 } });
    }
    if (over) { hov = card; if (app.clicked(cx, cy, cw, ch)) { const r = RUN.shopBuy(run, 'build', i); D.msg = r.ok ? `${card.name} added to your plans.` : r.why === 'gold' ? 'Not enough gold.' : 'Sold out.'; const a = app.shared.audio; if (a && a.sfx) a.sfx(r.ok ? 'shopBuy' : 'error'); } }
  });
  if (hov) app.tooltip(hov.name, cardTip(hov), { color: COL.lamp, terms: termsForCard(hov) });
  const by = Y + PH - 62;
  const rmDis = shop.buildRemoved || run.gold < shop.buildRemovePrice;
  if (app.button(shop.buildRemoved ? 'Plan struck' : 'Strike a plan', X + 40, by, 260, 48, { size: 18, disabled: rmDis, sub: shop.buildRemoved ? null : `${shop.buildRemovePrice} gold`, fit: true })) { D.tab = 'remove'; D.scroll = 0; }
  if (app.button('Done', X + PW - 220, by, 180, 48, { size: 20 }) || app.pressedKeys.some((e) => e.key === 'Escape')) { st.disp = null; app.escBusy = true; }
  return true;
}

