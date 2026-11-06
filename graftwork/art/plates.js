import { lnw } from './linework.js';
// GRAFTWORK plates: baked, cached engraved surfaces. Nothing here costs more than one drawImage per frame once warm.
//  drawEventPlate(ctx, id, act, x, y, w, h)  the event illustration: sepia wash, light pool, floor, a procedural motif keyed by the event id
//                                            (EVENT_MOTIFS, generic fallback), hatch veil, vignette, deckled paper edge. Static: no animation to freeze.
//  drawVellum(ctx, x, y, w, h, o)             dark vellum behind the codex and deck view: fibre, foxing, edge darkening. o: { r (corner radius), alpha, seed }
//  drawEmptyMark(ctx, x, y, w)                small engraved ornament (rule, diamond, stitch) above an empty-state message
// Without a document (headless) the same drawing runs straight onto the given context.
const TAU = Math.PI * 2, INK = '#2b1e1a';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const cache = new Map(); let bytes = 0; const MAX_BYTES = 40 * 1024 * 1024;
function baked(key, w, h, fn) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) return null;
    fn(g); cache.set(key, c); bytes += w * h * 4;
    while (bytes > MAX_BYTES && cache.size > 1) { const k = cache.keys().next().value, v = cache.get(k); bytes -= (v.width || 1) * (v.height || 1) * 4; cache.delete(k); }
  } else { cache.delete(key); cache.set(key, c); }
  return c;
}
export const plateStats = { get entries() { return cache.size; } };

// ---- engraving helpers (plate space 520 x 560, light from the upper left) ----
const W0 = 520, H0 = 560, FY = 466;
const rrect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
const poly = (g, p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); };
let _hp = null;
const hatchPath = () => { if (!_hp) { _hp = new Path2D(); for (let s = -H0; s < W0 + 40; s += 4) { _hp.moveTo(s, H0); _hp.lineTo(s + H0, 0); } } return _hp; };
// fill the current path, ink outline, highlight on the lit edge, 1px hatch that grows toward the lower right
function shape(g, col, hatch = 0.34) {
  g.fillStyle = col; g.fill();
  g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, W0, H0); gr.addColorStop(0, 'rgba(10,6,4,0)'); gr.addColorStop(0.35, `rgba(10,6,4,${hatch * 0.5})`); gr.addColorStop(1, `rgba(10,6,4,${hatch})`);
  g.strokeStyle = gr; g.lineWidth = lnw(1); g.stroke(hatchPath()); // Path2D: the shape's own path stays current for the highlight and the ink
  g.translate(-1.2, -1.2); g.lineWidth = lnw(2); g.strokeStyle = 'rgba(255,247,224,.38)'; g.stroke(); g.restore();
  g.lineWidth = lnw(2.2); g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
}
const line = (g, x1, y1, x2, y2, w = 2, k = INK) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = lnw(w); g.strokeStyle = k; g.lineCap = 'round'; g.stroke(); };
const disc = (g, x, y, r, col, hatch) => { g.beginPath(); g.arc(x, y, r, 0, TAU); shape(g, col, hatch); };

// ---- motifs: g, tone = { m (material), l (spot colour of the act) } ----
const M = {
  chair(g, t) { // dentist / surgeon chair with a swing lamp and a tray
    rrect(g, 190, 410, 150, 24, 5); shape(g, t.m); rrect(g, 196, 290, 26, 130, 8); shape(g, t.m); rrect(g, 186, 270, 46, 28, 8); shape(g, t.m);
    rrect(g, 316, 404, 60, 12, 4); shape(g, t.m); line(g, 222, 434, 222, FY, 7); line(g, 330, 434, 330, FY, 7); line(g, 210, FY, 345, FY, 5);
    line(g, 214, 280, 214, 170, 5); line(g, 214, 172, 330, 150, 5); poly(g, [310, 150, 352, 150, 340, 176, 322, 176]); shape(g, t.m); disc(g, 331, 186, 10, t.l, 0.2);
    rrect(g, 396, 372, 70, 8, 2); shape(g, t.m); line(g, 408, 380, 408, FY, 5); line(g, 454, 380, 454, FY, 5); line(g, 412, 366, 450, 352, 3, t.l);
  },
  scales(g, t) { // balance scales: cards on one pan, a coin on the other
    poly(g, [220, FY, 300, FY, 286, 440, 234, 440]); shape(g, t.m); rrect(g, 252, 200, 16, 246, 4); shape(g, t.m);
    rrect(g, 120, 192, 280, 12, 5); shape(g, t.m); disc(g, 260, 190, 12, t.l, 0.2);
    for (const [cx, hy] of [[134, 330], [386, 354]]) { line(g, 134 + (cx - 134) * 0, 204, cx - 54, hy, 1.6); line(g, cx, 204, cx, hy, 1.6); line(g, cx, 204, cx + 54, hy, 1.6); g.beginPath(); g.ellipse(cx, hy + 6, 62, 14, 0, 0, Math.PI); g.closePath(); shape(g, t.m); }
    for (let i = 0; i < 3; i++) { rrect(g, 108 + i * 3, 306 - i * 10, 52, 8, 2); shape(g, '#d8c9a4'); }
    disc(g, 386, 336, 18, t.l, 0.25); line(g, 386, 326, 386, 346, 2); line(g, 376, 336, 396, 336, 2);
  },
  hooded(g, t) { // hooded stranger holding a lantern
    g.beginPath(); g.moveTo(190, FY); g.quadraticCurveTo(196, 330, 236, 270); g.quadraticCurveTo(260, 232, 284, 270); g.quadraticCurveTo(326, 330, 332, FY); g.closePath(); shape(g, t.m, 0.42);
    g.beginPath(); g.moveTo(236, 282); g.quadraticCurveTo(260, 250, 284, 282); g.quadraticCurveTo(260, 322, 236, 282); g.closePath(); shape(g, '#0d0907', 0.1);
    line(g, 300, 340, 372, 330, 8); rrect(g, 366, 334, 34, 46, 5); shape(g, t.m); disc(g, 383, 360, 11, t.l, 0.15); line(g, 383, 330, 383, 300, 2); g.beginPath(); g.arc(383, 296, 8, Math.PI, 0); g.lineWidth = lnw(2); g.strokeStyle = INK; g.stroke();
    for (let i = 0; i < 7; i++) line(g, 383, 360, 383 + Math.cos(i * 0.9) * 46, 360 + Math.sin(i * 0.9) * 46, 1, 'rgba(255,240,190,.32)');
  },
  ledger(g, t) { // open ledger, quill, stamp
    poly(g, [110, 330, 260, 350, 260, 440, 110, 420]); shape(g, '#d9ccae', 0.3); poly(g, [410, 330, 260, 350, 260, 440, 410, 420]); shape(g, '#cdbf9c', 0.36);
    for (let i = 0; i < 5; i++) { line(g, 128, 352 + i * 14, 244, 366 + i * 14, 1.2, 'rgba(43,30,26,.6)'); line(g, 276, 366 + i * 14, 392, 352 + i * 14, 1.2, 'rgba(43,30,26,.6)'); }
    line(g, 260, 350, 260, 440, 3); poly(g, [104, 420, 260, 444, 416, 420, 416, 432, 260, 458, 104, 432]); shape(g, '#5a3d28');
    g.beginPath(); g.moveTo(330, 330); g.quadraticCurveTo(420, 250, 470, 190); g.quadraticCurveTo(440, 270, 340, 340); g.closePath(); shape(g, '#e8dcc4', 0.3); line(g, 330, 332, 470, 190, 1.4);
    rrect(g, 138, 264, 62, 24, 4); shape(g, t.m); rrect(g, 152, 238, 34, 28, 6); shape(g, t.m); disc(g, 169, 300, 14, t.l, 0.2);
  },
  twins(g, t) { // two identical cards and a mirror seam
    for (const [cx, rot] of [[165, -0.06], [355, 0.06]]) { g.save(); g.translate(cx, 330); g.rotate(rot); rrect(g, -62, -110, 124, 180, 8); shape(g, '#e4d6b4', 0.3); rrect(g, -48, -94, 96, 80, 5); shape(g, '#b79d70', 0.3); disc(g, 0, -54, 16, t.l, 0.2); line(g, -40, 10, 40, 10, 1.4); line(g, -40, 26, 20, 26, 1.4); line(g, -40, 42, 30, 42, 1.4); g.restore(); }
    g.setLineDash([7, 7]); line(g, 260, 190, 260, FY, 1.6); g.setLineDash([]);
    g.beginPath(); g.moveTo(236, 330); g.lineTo(284, 330); g.moveTo(272, 320); g.lineTo(284, 330); g.lineTo(272, 340); g.lineWidth = lnw(2); g.strokeStyle = t.l; g.stroke();
  },
  shelf(g, t) { // shelves of bottles, one glowing
    for (const y of [330, 450]) { rrect(g, 90, y, 340, 10, 2); shape(g, '#6b4a2e'); }
    const B = [[120, 270, 36, 60], [170, 254, 30, 76], [214, 282, 40, 48], [270, 262, 34, 68], [320, 276, 44, 54], [378, 258, 30, 72]];
    B.forEach(([x, y, w, h], i) => { const yy = y; rrect(g, x, yy, w, h, 8); shape(g, i === 3 ? t.l : 'rgba(180,200,196,.35)', 0.28); rrect(g, x + w * 0.3, yy - 12, w * 0.4, 14, 3); shape(g, '#b98a50'); });
    [[110, 384, 50, 66], [180, 396, 36, 54], [236, 376, 44, 74], [300, 392, 40, 58], [356, 380, 50, 70]].forEach(([x, y, w, h]) => { rrect(g, x, y, w, h, 8); shape(g, 'rgba(180,200,196,.3)', 0.28); rrect(g, x + w * 0.3, y - 12, w * 0.4, 14, 3); shape(g, '#b98a50'); });
  },
  coin(g, t) { // a coin on its edge, teeth on the rim
    g.beginPath(); g.ellipse(260, FY - 6, 150, 18, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; g.beginPath(); g.arc(260 + Math.cos(a) * 112, 330 + Math.sin(a) * 112, 7, 0, TAU); shape(g, '#d8c9a4', 0.2); }
    disc(g, 260, 330, 112, t.l, 0.36); disc(g, 260, 330, 84, 'rgba(0,0,0,0)', 0.2); line(g, 260, 280, 260, 380, 5); line(g, 210, 330, 310, 330, 5);
    g.beginPath(); g.arc(260, 330, 98, Math.PI * 1.08, Math.PI * 1.6); g.lineWidth = lnw(2); g.strokeStyle = 'rgba(255,247,224,.7)'; g.stroke();
  },
  machine(g, t) { // vending machine
    rrect(g, 170, 180, 180, 286, 8); shape(g, t.m); rrect(g, 186, 200, 148, 150, 4); shape(g, '#10100e', 0.2);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { rrect(g, 196 + c * 46, 210 + r * 46, 36, 34, 3); shape(g, (r + c) % 4 === 0 ? t.l : '#463726', 0.28); }
    rrect(g, 186, 366, 90, 38, 4); shape(g, '#10100e', 0.15); rrect(g, 290, 366, 44, 20, 3); shape(g, '#7a5d2a'); line(g, 306, 394, 320, 394, 3); rrect(g, 190, 420, 140, 30, 4); shape(g, '#0b0a08', 0.1);
    line(g, 190, FY, 190, FY + 14, 5); line(g, 330, FY, 330, FY + 14, 5);
  },
  drawers(g, t) { // morgue wall of drawers, one pulled out
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = 120 + c * 94, y = 200 + r * 86, open = r === 1 && c === 1;
      if (open) { poly(g, [x, y + 6, x + 88, y + 6, x + 98, y + 66, x - 6, y + 66]); shape(g, '#8f8a7c', 0.4); poly(g, [x + 10, y + 12, x + 78, y + 12, x + 88, y + 50, x + 2, y + 50]); shape(g, '#d9ccae', 0.3); continue; }
      rrect(g, x, y, 88, 76, 4); shape(g, t.m); rrect(g, x + 28, y + 10, 32, 14, 2); shape(g, '#d8c9a4', 0.2); line(g, x + 26, y + 50, x + 62, y + 50, 4); if ((r + c) % 3 === 0) disc(g, x + 74, y + 14, 4, t.l, 0.1);
    }
    rrect(g, 108, 458, 306, 10, 3); shape(g, '#2f2a24');
  },
  gurney(g, t) { // gurney with a covered shape
    g.beginPath(); g.ellipse(260, FY + 4, 160, 12, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
    rrect(g, 90, 372, 340, 12, 4); shape(g, t.m); line(g, 118, 384, 118, 446, 5); line(g, 402, 384, 402, 446, 5); line(g, 118, 420, 402, 420, 3);
    disc(g, 118, 452, 14, '#3a352e', 0.3); disc(g, 402, 452, 14, '#3a352e', 0.3);
    g.beginPath(); g.moveTo(112, 372); g.quadraticCurveTo(116, 330, 150, 330); g.quadraticCurveTo(190, 316, 240, 340); g.quadraticCurveTo(300, 330, 340, 346); g.quadraticCurveTo(390, 340, 408, 372); g.closePath(); shape(g, '#d9ccae', 0.36);
    line(g, 200, 372, 214, 344, 1.4, 'rgba(43,30,26,.6)'); line(g, 300, 372, 296, 346, 1.4, 'rgba(43,30,26,.6)'); rrect(g, 380, 340, 18, 32, 3); shape(g, t.l, 0.2);
  },
  jars(g, t) { // three jars of preserved things
    [[130, 360, 90, 120, 0], [260, 330, 110, 150, 1], [390, 372, 84, 108, 2]].forEach(([cx, top, w, h, k]) => {
      rrect(g, cx - w / 2, top, w, h, 14); shape(g, 'rgba(176,208,200,.30)', 0.22); rrect(g, cx - w / 2 + 6, top + h * 0.3, w - 12, h * 0.7 - 6, 10); shape(g, k === 1 ? t.l : 'rgba(120,150,130,.35)', 0.28);
      rrect(g, cx - w * 0.36, top - 14, w * 0.72, 16, 4); shape(g, '#9b7a4a');
      if (k === 0) { g.beginPath(); g.moveTo(cx - 14, top + h * 0.5); g.quadraticCurveTo(cx, top + h * 0.3, cx + 14, top + h * 0.5); g.quadraticCurveTo(cx + 10, top + h * 0.8, cx, top + h * 0.78); g.quadraticCurveTo(cx - 10, top + h * 0.8, cx - 14, top + h * 0.5); shape(g, '#a3586a', 0.2); }
      if (k === 1) { disc(g, cx, top + h * 0.6, 18, '#d8c9a4', 0.2); disc(g, cx - 5, top + h * 0.58, 3, INK); disc(g, cx + 6, top + h * 0.58, 3, INK); }
      if (k === 2) { rrect(g, cx - 24, top + h * 0.4, 48, 34, 4); shape(g, '#d9ccae', 0.2); line(g, cx - 16, top + h * 0.4 + 12, cx + 16, top + h * 0.4 + 12, 1.2); }
    });
    rrect(g, 70, 482, 380, 10, 3); shape(g, '#5a3d28');
  },
  curtain(g, t) { // proscenium: curtains, stage boards, spotlight
    for (const s of [0, 1]) for (let i = 0; i < 4; i++) { const x = s ? 520 - 8 - i * 34 : 8 + i * 34, dir = s ? -1 : 1; g.beginPath(); g.moveTo(x, 40); g.quadraticCurveTo(x + dir * 22, 250, x + dir * 6 + dir * (i * 3), FY); g.lineTo(x + dir * 40, FY); g.quadraticCurveTo(x + dir * 54, 250, x + dir * 34, 40); g.closePath(); shape(g, i % 2 ? '#5a2430' : '#6d2b38', 0.36); }
    g.beginPath(); g.moveTo(150, 60); g.lineTo(370, 60); g.lineTo(520 - 180, FY); g.lineTo(180, FY); g.closePath(); g.fillStyle = 'rgba(255,240,190,.10)'; g.fill();
    for (let i = 0; i < 7; i++) line(g, 130 + i * 43, FY, 260 + (i - 3) * 14, 330, 1.2, 'rgba(43,30,26,.7)');
    line(g, 150, 60, 150, 100, 2); rrect(g, 128, 98, 44, 22, 4); shape(g, '#2f2a24'); disc(g, 260, 360, 30, t.l, 0.2);
  },
  spool(g, t) { // spool with a loose thread
    rrect(g, 190, 250, 140, 22, 6); shape(g, '#b9955e'); rrect(g, 190, 420, 140, 22, 6); shape(g, '#b9955e'); rrect(g, 210, 270, 100, 150, 4); shape(g, t.l, 0.4);
    for (let i = 0; i < 12; i++) line(g, 210, 280 + i * 12, 310, 286 + i * 12, 1, 'rgba(43,30,26,.55)');
    g.beginPath(); g.moveTo(310, 410); g.bezierCurveTo(400, 400, 360, 470, 440, 454); g.bezierCurveTo(470, 450, 480, 470, 450, 478); g.lineWidth = lnw(6); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(3); g.strokeStyle = t.l; g.stroke();
    line(g, 372, 200, 330, 262, 4); line(g, 372, 200, 396, 172, 4, '#d8d3c6'); ci(g, 398, 168, 6);
  },
  anvil(g, t) { // anvil, hammer, spark
    poly(g, [120, 380, 190, 360, 370, 360, 370, 384, 316, 402, 300, 436, 340, 466, 180, 466, 220, 436, 204, 402, 190, 394]); shape(g, '#9a958a', 0.4);
    rrect(g, 210, 466, 100, 12, 3); shape(g, '#5a3d28');
    g.save(); g.translate(360, 280); g.rotate(0.5); rrect(g, -8, -10, 16, 160, 4); shape(g, '#8a6038'); rrect(g, -44, -50, 88, 42, 6); shape(g, '#b9b4a6'); g.restore();
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 8 : 20; g.lineTo(230 + Math.cos(a) * r, 340 + Math.sin(a) * r); } g.closePath(); shape(g, t.l, 0.1);
  },
};
function ci(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = lnw(2); g.strokeStyle = INK; g.stroke(); }
M.generic = (g, t) => { // doorway and a figure
  rrect(g, 170, 220, 130, 246, 6); shape(g, t.m); g.beginPath(); g.moveTo(186, FY); g.lineTo(186, 300); g.quadraticCurveTo(235, 250, 284, 300); g.lineTo(284, FY); g.closePath(); shape(g, t.l, 0.3);
  g.beginPath(); g.moveTo(330, FY); g.quadraticCurveTo(334, 380, 360, 350); g.quadraticCurveTo(376, 336, 392, 350); g.quadraticCurveTo(418, 380, 422, FY); g.closePath(); shape(g, '#14100d', 0.4); disc(g, 376, 330, 14, '#14100d', 0.4);
};
export const EVENT_MOTIFS = Object.keys(M).filter((k) => k !== 'generic');
const BY_ID = {
  chair: ['e_second_hand_surgeon', 'e_dentist_chair', 'e_black_market_clinic', 'e_stray_patient', 'e_scar_reader'],
  scales: ['e_back_alley_swap', 'e_relic_trade', 'e_haggler', 'e_loan_shark', 'e_debt_collector', 'e_borrowed_graft', 'e_repossession', 'e_load_balancer'],
  hooded: ['e_overload_stranger', 'e_patient_returns', 'e_memory_returns', 'e_understudy', 'e_cult_pamphlet', 'e_cult_recruiter'],
  ledger: ['e_budget_loan', 'e_tithe_collector', 'e_filing_clerk', 'e_actuary', 'e_ward_ledger', 'e_ledger_audit', 'e_compound_interest', 'e_budget_pharmacy', 'e_weigh_in', 'e_proof_house'],
  twins: ['e_second_copy', 'e_graft_clone', 'e_cross_loom', 'e_school_mirror'],
  shelf: ['e_free_polish', 'e_gift_basket', 'e_cure_shelf'],
  coin: ['e_coin_flip', 'e_lamp_lottery', 'e_lottery_ward'],
  machine: ['e_vending_machine'],
  drawers: ['e_morgue_drawer', 'e_night_shift', 'e_orderly_challenge'],
  gurney: ['e_gurney_race'],
  jars: ['e_pickled_graft', 'e_jarred_twin', 'e_glassblower'],
  curtain: ['e_costume_rack', 'e_rehearsal', 'e_balcony_seat', 'e_standing_ovation', 'e_cloakroom'],
  spool: ['e_seamstress_move', 'e_cursed_spool'],
  anvil: ['e_tailor_temper'],
};
const MOTIF_OF = {}; for (const [k, ids] of Object.entries(BY_ID)) for (const id of ids) MOTIF_OF[id] = k;
export const eventMotif = (id) => MOTIF_OF[id] || 'generic';

const ACT_TONE = { 1: ['#1c2b24', '#bfe3c8'], 2: ['#2b1d12', '#ffd596'], 3: ['#1c1230', '#f5e6a8'] };
function bakePlate(g, id, act) {
  const h = hash(id), [dark, light] = ACT_TONE[act] || ACT_TONE[1];
  // sepia ink wash: warm paper-black with only a hint of the act hue
  g.fillStyle = 'rgba(40,30,20,.72)'; g.fillRect(0, 0, W0, H0);
  g.globalAlpha = 0.18; g.fillStyle = dark; g.fillRect(0, 0, W0, H0); g.globalAlpha = 1;
  const lx = W0 * (0.3 + ((h >> 3) % 40) / 100), ly = 150;
  const lg = g.createRadialGradient(lx, ly, 6, lx, ly, 300); lg.addColorStop(0, 'rgba(232,214,168,.4)'); lg.addColorStop(0.5, 'rgba(232,214,168,.16)'); lg.addColorStop(1, 'rgba(232,214,168,0)'); g.fillStyle = lg; g.fillRect(0, 0, W0, H0);
  // floor: dark slab with perspective seams, engraved
  const fg = g.createLinearGradient(0, FY, 0, H0); fg.addColorStop(0, 'rgba(8,6,4,.55)'); fg.addColorStop(1, 'rgba(4,3,2,.92)'); g.fillStyle = fg; g.fillRect(0, FY, W0, H0 - FY);
  g.strokeStyle = 'rgba(232,214,168,.22)'; g.lineWidth = lnw(1); g.beginPath(); g.moveTo(0, FY); g.lineTo(W0, FY); for (let i = 1; i < 6; i++) { g.moveTo(W0 / 2 + (i - 3) * 16, FY); g.lineTo(W0 / 2 + (i - 3) * 150, H0); } g.stroke();
  // motif with a soft shadow grounding it
  const name = eventMotif(id), tone = { m: '#85735a', l: light };
  g.save(); (M[name] || M.generic)(g, tone); g.restore();
  // hatch veil: 45 degree lines everywhere, double cross hatch in the corners
  g.strokeStyle = 'rgba(8,6,4,.1)'; g.lineWidth = lnw(1); g.beginPath(); for (let s = -H0; s < W0; s += 5) { g.moveTo(s, H0); g.lineTo(s + H0, 0); } g.stroke();
  g.save(); g.beginPath(); g.rect(0, 0, W0, H0); g.ellipse(W0 / 2, H0 / 2, 250, 270, 0, 0, TAU, true); g.clip('evenodd');
  g.strokeStyle = 'rgba(8,6,4,.18)'; g.beginPath(); for (let s = 0; s < W0 + H0; s += 5) { g.moveTo(s, 0); g.lineTo(s - H0, H0); } g.stroke(); g.restore();
  const vg = g.createRadialGradient(W0 / 2, H0 / 2, 150, W0 / 2, H0 / 2, 400); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W0, H0);
  // paper edge: deckled margin, plate mark inside
  const r = rng(h ^ 0x9e37), M0 = 9; g.beginPath(); g.rect(0, 0, W0, H0);
  const edge = []; const steps = 70;
  for (let i = 0; i <= steps; i++) edge.push([M0 + (W0 - 2 * M0) * i / steps, M0 + r() * 3]);
  for (let i = 1; i <= steps; i++) edge.push([W0 - M0 - r() * 3, M0 + (H0 - 2 * M0) * i / steps]);
  for (let i = 1; i <= steps; i++) edge.push([W0 - M0 - (W0 - 2 * M0) * i / steps, H0 - M0 - r() * 3]);
  for (let i = 1; i < steps; i++) edge.push([M0 + r() * 3, H0 - M0 - (H0 - 2 * M0) * i / steps]);
  g.moveTo(edge[0][0], edge[0][1]); for (let i = 1; i < edge.length; i++) g.lineTo(edge[i][0], edge[i][1]); g.closePath();
  const pg = g.createLinearGradient(0, 0, W0, H0); pg.addColorStop(0, '#e4d7b8'); pg.addColorStop(1, '#bfae88'); g.fillStyle = pg; g.fill('evenodd');
  g.save(); g.clip('evenodd'); g.fillStyle = 'rgba(120,90,40,.12)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(r() * W0, r() * H0, 1 + r() * 2, 0, TAU); g.fill(); } g.restore();
  g.beginPath(); g.moveTo(edge[0][0], edge[0][1]); for (let i = 1; i < edge.length; i++) g.lineTo(edge[i][0], edge[i][1]); g.closePath(); g.lineWidth = lnw(1.6); g.strokeStyle = INK; g.stroke();
  g.lineWidth = lnw(1); g.strokeStyle = 'rgba(255,247,224,.35)'; g.strokeRect(M0 + 3.5, M0 + 3.5, W0 - 2 * M0 - 7, H0 - 2 * M0 - 7);
  g.strokeStyle = 'rgba(43,30,26,.55)'; g.strokeRect(M0 + 6.5, M0 + 6.5, W0 - 2 * M0 - 13, H0 - 2 * M0 - 13);
}
export function drawEventPlate(ctx, id, act, x, y, w, h) {
  const key = `ev|${id}|${act}`;
  const c = baked(key, W0, H0, (g) => bakePlate(g, id, act));
  ctx.save(); ctx.translate(x, y); ctx.scale(w / W0, h / H0);
  if (c) ctx.drawImage(c, 0, 0); else bakePlate(ctx, id, act);
  ctx.restore();
}

// ---- vellum ----
function bakeVellum(g, w, h, seed) {
  const r = rng(seed);
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#31281c'); bg.addColorStop(0.55, '#2a2118'); bg.addColorStop(1, '#241c14'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // foxing: soft brown blots and fine specks
  for (let i = 0; i < Math.max(14, w * h / 26000); i++) { const x = r() * w, y = r() * h, rad = 14 + r() * 46, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(120,78,32,${0.1 + r() * 0.1})`); gr.addColorStop(1, 'rgba(120,78,32,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.fillStyle = 'rgba(150,100,45,.35)'; for (let i = 0; i < w * h / 4200; i++) g.fillRect(r() * w, r() * h, 1 + (r() < 0.2 ? 1 : 0), 1);
  // fibres: short curved hairs, light and dark
  g.lineWidth = lnw(1); g.lineCap = 'round';
  for (let i = 0; i < w * h / 900; i++) { const x = r() * w, y = r() * h, a = r() * TAU, l = 5 + r() * 20; g.strokeStyle = r() < 0.6 ? `rgba(232,220,196,${0.04 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.08})`; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.8) * l * 0.5, y + Math.sin(a + 0.8) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  // edge darkening
  const eg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = eg; g.fillRect(0, 0, w, h);
  for (const [x0, y0, x1, y1] of [[0, 0, 0, 26], [0, h, 0, h - 26], [0, 0, 26, 0], [w, 0, w - 26, 0]]) { const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(0,0,0,.4)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(0, 0, w, h); }
}
export function drawVellum(ctx, x, y, w, h, o = {}) {
  w = Math.round(w); h = Math.round(h); const seed = o.seed || 7;
  const c = baked(`vl|${w}|${h}|${seed}`, w, h, (g) => bakeVellum(g, w, h, seed));
  ctx.save();
  if (o.r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, o.r); else ctx.rect(x, y, w, h); ctx.clip(); }
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  if (c) ctx.drawImage(c, x, y); else { ctx.fillStyle = '#2a2118'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
export function drawEmptyMark(ctx, x, y, w = 160) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(232,220,196,.35)'; ctx.lineWidth = lnw(1);
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-10, 0); ctx.moveTo(10, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fillStyle = 'rgba(179,38,58,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,30,26,.9)'; ctx.stroke();
  ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(-w / 2 + 14, 7); ctx.lineTo(w / 2 - 14, 7); ctx.strokeStyle = 'rgba(232,220,196,.22)'; ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
