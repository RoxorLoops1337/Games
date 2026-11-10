// TITLE SCENE: the live backdrop of the title screen (ui/title.js). A small cutaway cluster of five hospital rooms drawn with the modular kit
// renderer (ui/ward_kit_iso.js, called only), the painted Ward actors idling and wandering in it (grounded with the same contact shadow as the Ward;
// the monsters ARE Ward figures: ui/ward_iso.js gait and drawActor, so they walk with the puppet, or the hop when a sprite cannot be read),
// candle and window light, dust, and a slow camera drift. Three modes, chosen every frame by what is loaded:
//   'keyart'   graftwork/assets/title/manifest.json has a `keyart` entry whose image decoded: it is the backdrop (parallax, light, motes on top)
//   'kit'      the kit manifest and its images settled: the live cluster
//   'fallback' anything else (headless tests, a failed download): the old procedural lamp room, a procedural hero standing in its light pool
// Cost: the room layers are cached by the kit renderer, the grade is one cached low-res canvas, so a frame is a few dozen drawImage calls. `lite`
// (slow device) halves the scene's update rate through an offscreen copy and drops the motes. Reduced motion: no drift, no wander, no breathing,
// no flicker, no motes. Tests: tests/graftwork_ui_title.test.mjs.
import { W, H, COL, clamp } from './core.js';
import { assets } from './assets.js';
import * as KR from './ward_kit_iso.js';
import { wallPlan } from '../data/ward_kit.js';
import { contactOf, gait, drawActor as drawWardActor } from './ward_iso.js';
import { drawHero } from '../art/heroes.js';
import { drawBackground } from '../art/backgrounds.js';
import { lnw } from '../art/linework.js';

const TAU = Math.PI * 2;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const mkCanvas = (w, h) => {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); return x ? { c, x } : null; } catch (e) { return null; }
};

// ---- the cluster: grid cells, connections, who stands where ----
export const CLUSTER = [
  { id: 'disp', type: 'rm_dispensary', x: 0, y: 0 }, { id: 'morg', type: 'rm_morgue', x: 1, y: 0 }, { id: 'gen', type: 'rm_generator', x: 2, y: 0 },
  { id: 'ward', type: 'rm_ward', x: 0, y: 1 }, { id: 'corr', type: 'rm_corridor', x: 1, y: 1 },
];
const LINKS = [['disp', 'morg'], ['morg', 'gen'], ['disp', 'ward'], ['morg', 'corr'], ['ward', 'corr']];
const NB = {}; for (const [a, b] of LINKS) { (NB[a] = NB[a] || []).push(b); (NB[b] = NB[b] || []).push(a); }
// kind: hero | npc | monster. `at` is a preferred sub-tile; monsters wander (and walk like they do on the Ward), the hero and the nurse stay on their feet (the hero breathes, the nurse sways)
export const CAST = [
  { id: 'marrow', kind: 'hero', room: 'ward', at: [1.5, 2.5], h: 50, face: 1 },
  { id: 'npc_nurse', kind: 'npc', room: 'ward', at: [3.5, 2.5], h: 42, face: -1 },
  { id: 'gauze_mummy', kind: 'monster', room: 'morg', h: 33, speed: 0.55 },
  { id: 'bedpan_slime', kind: 'monster', room: 'disp', h: 28, speed: 0.5 },
  { id: 'crutchling', kind: 'monster', room: 'corr', h: 31, speed: 0.5 },
  { id: 'night_nurse', kind: 'monster', room: 'gen', h: 36, speed: 0.4 },
];
const CAM = { z: 3.1, cx: 23, cy: 29, sx: 596, sy: 440 }; // world point (cx, cy) sits at stage point (sx, sy)
const topOf = (r) => ({ x: (r.x - r.y) * KR.HW, y: (r.x + r.y) * KR.HH });
const ORDER = CLUSTER.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);

// ---- cached sprites ----
let GLOW = null, SHADOW = null;
function glowSprite() { // warm radial glow, white core, used additive
  if (GLOW !== null) return GLOW;
  const o = mkCanvas(128, 128); if (!o) return (GLOW = false);
  const gr = o.x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,226,170,.85)'); gr.addColorStop(0.18, 'rgba(255,196,104,.5)'); gr.addColorStop(0.5, 'rgba(255,150,60,.2)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  o.x.fillStyle = gr; o.x.fillRect(0, 0, 128, 128); return (GLOW = o.c);
}
function shadowSprite() {
  if (SHADOW !== null) return SHADOW;
  const o = mkCanvas(64, 32); if (!o) return (SHADOW = false);
  o.x.translate(32, 16); o.x.scale(1, 0.5);
  const gr = o.x.createRadialGradient(0, 0, 0, 0, 0, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,.72)'); gr.addColorStop(0.8, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  o.x.fillStyle = gr; o.x.fillRect(-32, -32, 64, 64); return (SHADOW = o.c);
}
// the grade: a low-res canvas multiplied over the scene: neutral warm round the hero, cold dark at the edges, darker bands behind the logo and the menu
let GRADE = null;
function gradeSprite() {
  if (GRADE !== null) return GRADE;
  const o = mkCanvas(320, 180); if (!o) return (GRADE = false);
  const g = o.x, k = 320 / W;
  const r = g.createRadialGradient(330 * k, 470 * k, 40 * k, 560 * k, 400 * k, 780 * k);
  r.addColorStop(0, 'rgb(236,212,184)'); r.addColorStop(0.3, 'rgb(170,144,130)'); r.addColorStop(0.62, 'rgb(86,74,86)'); r.addColorStop(1, 'rgb(22,19,30)');
  g.fillStyle = r; g.fillRect(0, 0, 320, 180);
  const top = g.createLinearGradient(0, 0, 0, 180 * 0.46); top.addColorStop(0, 'rgba(10,8,14,.92)'); top.addColorStop(0.6, 'rgba(10,8,14,.6)'); top.addColorStop(1, 'rgba(10,8,14,0)');
  g.fillStyle = top; g.fillRect(0, 0, 320, 180 * 0.46);
  const bot = g.createLinearGradient(0, 180, 0, 180 * 0.72); bot.addColorStop(0, 'rgba(10,8,14,.75)'); bot.addColorStop(1, 'rgba(10,8,14,0)');
  g.fillStyle = bot; g.fillRect(0, 180 * 0.72, 320, 180 * 0.28);
  return (GRADE = o.c);
}
export function resetTitleSprites() { GLOW = null; SHADOW = null; GRADE = null; }

// ---- the key art hook ----
// assets/ward/manifest.json may carry  "title": { "keyart": { "file1x": "title/keyart@1x.webp", "file2x": "title/keyart@2x.webp", "w": 2560, "h": 1440,
//   "lights": [{ "x": 0.5, "y": 0.2, "k": 1 }], "focus": { "x": 0.5, "y": 0.5 } } }   (files relative to graftwork/assets/, lights and focus normalised 0..1).
// ui/assets.js passes the `title` block through; while it has no keyart entry (today) the live kit scene is used. No fake art is shipped.
const assetRoot = () => String(assets.base || 'assets/ward/').replace(/ward\/?$/, '');

export function createScene(opts = {}) {
  const S = {
    mode: 'fallback', t: 0, lite: false, frame: 0, stats: { ms: 0, draws: 0, frames: 0, liteFrames: 0 },
    rcs: null, kitTry: 0, cast: [], motes: [], glows: [], keyart: null, keyartState: 'idle', cam: { x: 0, y: 0, z: 1 }, mx: 0, my: 0,
    makeImage: opts.makeImage || null, off: null, slow: 0, ghosts: null, dust: null,
  };
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  S.motes = Array.from({ length: 56 }, () => ({ x: rnd() * W, y: rnd() * H, vy: 3 + rnd() * 7, fx: 0.2 + rnd() * 0.5, amp: 5 + rnd() * 16, ph: rnd() * TAU, r: 0.7 + rnd() * 1.4, a: 0.25 + rnd() * 0.6 }));
  S.ghosts = [{ p0: 0.15, sp: 0.012, y: 210, s: 1, rot: -0.2, ph: 0, a: 0.16 }, { p0: 0.7, sp: 0.008, y: 520, s: 0.75, rot: 0.25, ph: 2, a: 0.12 }, { p0: 0.4, sp: 0.016, y: 110, s: 0.55, rot: 0.1, ph: 4, a: 0.1 }];
  S.dust = Array.from({ length: 70 }, () => ({ x0: rnd() * W, y0: rnd() * 760, vy: 4 + rnd() * 10, fx: 0.2 + rnd() * 0.6, amp: 6 + rnd() * 22, ph: rnd() * 6, r: 0.8 + rnd() * 1.8 }));

  // ---------- loading ----------
  S.ensure = (app) => {
    assets.ensure(app);
    if (S.keyartState === 'idle' && assets.ready()) loadKeyart(app);
  };
  function loadKeyart(app) {
    const k = assets.manifest && assets.manifest.title && assets.manifest.title.keyart;
    if (!k || typeof k !== 'object' || !(k.file2x || k.file1x)) { S.keyartState = 'none'; return; }
    if (!S.makeImage && (typeof Image === 'undefined' || typeof document === 'undefined')) { S.keyartState = 'none'; return; }
    const phone = app && app.scale > 0 && app.scale < 0.8, file = phone ? (k.file1x || k.file2x) : (k.file2x || k.file1x);
    try {
      const img = S.makeImage ? S.makeImage() : new Image();
      S.keyart = { img, ok: false, def: k };
      img.onload = () => { if (S.keyart) S.keyart.ok = true; };
      img.onerror = () => { S.keyart = null; S.keyartState = 'none'; };
      img.src = assetRoot() + file; S.keyartState = 'ready';
    } catch (e) { S.keyartState = 'none'; }
  }
  S.setKeyart = (img, def = {}) => { S.keyart = img ? { img, ok: true, def } : null; S.keyartState = img ? 'ready' : 'none'; }; // tests and tools
  S.reset = () => { S.rcs = null; S.cast.length = 0; S.kitTry = 0; S.t = 0; };

  // ---------- the cluster ----------
  function resolveKit(app) { // once the kit is settled: the recipes of the five rooms (at least three, or the old scene stays)
    if (S.rcs) return true;
    if (!assets.kitReady()) return false;
    if (S.kitTry++ % 12 !== 0 && S.kitTry > 1) return false;
    const rcs = {}; let n = 0;
    for (const r of CLUSTER) { const rc = KR.recipeFor(r.type, app); if (rc) { rcs[r.id] = rc; n++; } }
    if (n < 3) return false;
    S.rcs = rcs;
    const byId = new Map(CLUSTER.map((r) => [r.id, r])), have = (x, y) => { const f = CLUSTER.find((r) => r.x === x && r.y === y); return f && rcs[f.id] ? f.id : null; };
    const list = CLUSTER.filter((r) => rcs[r.id]);
    S.plan = wallPlan(list, (id) => (NB[id] || []).filter((i) => rcs[i]), have);
    S.cast = CAST.filter((a) => rcs[a.room]).map((a, i) => {
      const rc = rcs[a.room]; let cell = null, bd = 1e9;
      if (a.at) for (const f of rc.free) { const d = Math.hypot(f[0] + 0.5 - a.at[0], f[1] + 0.5 - a.at[1]); if (d < bd) { bd = d; cell = f; } }
      // lvl ... cycle: what the Ward's gait and actor draw keep on a figure (monsters only)
      const rec = { ...a, key: 'title:' + a.id, gu: cell ? cell[0] + 0.5 : 2, gv: cell ? cell[1] + 0.5 : 2, x: 0, y: 0, flip: a.face || (i % 2 ? -1 : 1), ph: hash(a.id) * TAU, mv: false, alpha: 0, lvl: 0, ring: 0, bob: 0, sq: 1, tilt: 0, stride: 0, cycle: false };
      void byId; return rec;
    });
    return true;
  }
  const sub = (T, gu, gv) => { const p = KR.subPt(gu, gv); return { x: T.x + p.x, y: T.y + p.y }; };

  // ---------- drawing ----------
  function groundShadow(g, x, y, rx, a) {
    const s = shadowSprite();
    if (s) { g.save(); g.globalAlpha *= a; g.drawImage(s, x - rx, y - rx * 0.5, rx * 2, rx); g.restore(); }
    else { g.save(); g.fillStyle = `rgba(0,0,0,${(a * 0.8).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, rx, rx * 0.5, 0, 0, TAU); g.fill(); g.restore(); }
  }
  const WARD_RUN = { hero: 'marrow' }; // the Ward's actor draw takes the run for a hero without art: never the case for a monster
  function drawActor(app, g, a, t, calm) {
    const spr = assets.ready() ? assets.actor(a.id, app) : null;
    if (!spr || a.alpha <= 0.01) return;
    if (a.kind === 'monster') { // a Ward figure, drawn by the Ward: grounding, the idle, and the walk (the puppet, else the hop); the fade-in is applied from outside
      const al = a.alpha; g.save(); g.globalAlpha *= al; a.alpha = 1; drawWardActor(app, g, a, WARD_RUN); a.alpha = al; g.restore(); return;
    }
    const d = spr.def, c = contactOf(spr), s = a.h * (d.scale || 1) / (d.h || 1);
    const fx = c ? c.fx : (d.anchorX === undefined ? d.w / 2 : d.anchorX), fy = c ? c.fy : (d.anchorY === undefined ? d.h : d.anchorY), fw = (c ? c.fw : d.w * 0.45) * s;
    const rx = clamp(fw * 0.8, a.h * 0.24, a.h * 0.62);
    groundShadow(g, a.x, a.y, rx, 0.5 * a.alpha);
    const br = calm ? 0 : Math.sin(t * 1.7 + a.ph), sq = 1 + 0.016 * br, sw = 1 - 0.007 * br, lean = calm || a.kind !== 'npc' ? 0 : Math.sin(t * 0.7 + a.ph) * 0.012;
    const fl = Math.abs(a.flip) < 0.14 ? (a.flip < 0 ? -0.14 : 0.14) : a.flip;
    g.save(); g.translate(a.x, a.y); g.globalAlpha *= a.alpha; g.scale(fl * sw, sq); if (lean) g.rotate(lean);
    g.drawImage(spr.img, -fx * s, -fy * s, d.w * s, d.h * s);
    g.restore();
  }

  function worldPass(app, g, o) { // rooms back to front, props and actors depth sorted inside each room
    const { calm, t, dt } = o, glows = S.glows; glows.length = 0;
    const mode = KR.wallModeFor(CLUSTER.length);
    for (const r of ORDER) {
      const rc = S.rcs[r.id]; if (!rc) continue;
      const T = topOf(r), pl = S.plan.get(r.id), hs = KR.wallHeights('title:' + r.id, pl, mode, 0, dt, true);
      const info = { key: rc.key, HL: hs.HL, HR: hs.HR, doorL: pl.L, doorR: pl.R, slabL: pl.slabL, slabR: pl.slabR, dark: false };
      KR.drawStatic(app, g, 'title:' + r.id, rc, T.x, T.y, info, CAM.z * (app.px || app.scale || 1));
      const gp = KR.glowPoints(rc, info, app, []);
      for (let i = 0; i < gp.length; i += 3) glows.push(T.x + gp[i], T.y + gp[i + 1], gp[i + 2], hash(r.id + i) * TAU);
      // the floor lamp pool: a flat warm ellipse on the floor, brighter where the room has a lit sconce
      glows.push(T.x, T.y + KR.HH, -1, hash(r.id) * TAU);
      const items = [];
      for (const a of S.cast) if (a.room === r.id) {
        const p = sub(T, a.gu, a.gv); a.x = p.x; a.y = p.y; items.push({ y: a.y, rec: a });
        if (a.kind === 'monster') gait(a.key, a, a.x, a.y, dt, calm, a.h, S, 0); // the Ward's gait: stride by the distance moved, hop, squash, lean (no dust here)
      }
      const pg = [];
      KR.drawItems(app, g, rc, T.x, T.y, 0, items, { dark: false, calm, t, glow: pg, actor: (rec) => drawActor(app, g, rec, t, calm) });
      for (let i = 0; i < pg.length; i += 3) glows.push(pg[i], pg[i + 1], pg[i + 2], hash(r.id + 'p' + i) * TAU);
    }
  }
  function stepCast(app, dt, calm) {
    for (const a of S.cast) {
      a.alpha = calm ? 1 : Math.min(1, a.alpha + dt * 0.8);
      if (a.kind !== 'monster') continue;
      const rc = S.rcs[a.room], st = KR.monsterAt(a.key, 0, rc, calm, dt, a.speed || 0.5);
      a.gu = st.gu; a.gv = st.gv; a.flip = st.fv; a.mv = st.mv;
    }
  }

  function lightPass(app, g, o) { // additive glows, floor pools, window shafts, then the motes; stage coordinates
    const { calm, t, ox, oy, z } = o, spr = glowSprite(), gl = S.glows;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < gl.length; i += 4) {
      const k = gl[i + 2], ph = gl[i + 3], fl = calm ? 1 : 0.88 + 0.12 * Math.sin(t * 7.3 + ph) * Math.sin(t * 3.1 + ph * 1.7) + 0.04 * Math.sin(t * 17 + ph);
      const x = ox + gl[i] * z, y = oy + gl[i + 1] * z;
      if (k < 0) { // floor pool (flat, 2:1)
        const rx = 60 * z, ry = 30 * z; g.globalAlpha = 0.15 * fl;
        if (spr) g.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2); continue;
      }
      const cool = k < 0.6, r = (cool ? 40 : 34) * z * (0.5 + k) * (0.96 + 0.06 * fl);
      g.globalAlpha = (cool ? 0.05 : 0.3) * fl * clamp(k + 0.3, 0.3, 1);
      if (spr) g.drawImage(spr, x - r, y - r, r * 2, r * 2); // cool window glow is the same sprite, dimmer, tinted by the multiply grade
    }
    g.restore();
  }
  function motePass(app, g, t, calm) {
    if (calm || S.lite) return;
    g.save(); g.fillStyle = '#ffe3a8';
    for (let pass = 0; pass < 2; pass++) {
      g.globalAlpha = pass ? 0.3 : 0.7; g.beginPath();
      for (const m of S.motes) {
        if ((m.a > 0.55) !== !!pass) continue;
        const y = ((m.y - t * m.vy) % (H + 40) + H + 40) % (H + 40) - 20, x = m.x + Math.sin(t * m.fx + m.ph) * m.amp, tw = 0.6 + 0.4 * Math.sin(t * 1.7 + m.ph);
        const rr = m.r * (0.6 + tw * 0.6); g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
      }
      g.fill();
    }
    g.restore();
  }

  // the old procedural room (no kit, no art): lamp cone, drifting stitched card ghosts, dust in the light, a hero standing in the pool
  function fallbackPass(app, g, t, calm) {
    drawBackground(g, 'title', t);
    const sway = calm ? 0 : Math.sin(t * 0.55) * 0.07;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(640, -20); g.rotate(sway);
    const gr = g.createLinearGradient(0, 0, 0, 760); gr.addColorStop(0, 'rgba(255,214,120,.30)'); gr.addColorStop(0.6, 'rgba(255,190,90,.08)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-34, 0); g.lineTo(34, 0); g.lineTo(430, 760); g.lineTo(-430, 760); g.closePath(); g.fill(); g.restore();
    g.save(); g.translate(640, -20); g.rotate(sway);
    g.strokeStyle = '#0c0a09'; g.lineWidth = lnw(3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 30); g.stroke();
    g.fillStyle = '#2b2622'; g.beginPath(); g.moveTo(-40, 62); g.quadraticCurveTo(-34, 30, 0, 28); g.quadraticCurveTo(34, 30, 40, 62); g.closePath(); g.fill();
    g.fillStyle = '#fbe39a'; g.shadowColor = '#ffd36a'; g.shadowBlur = 30; g.beginPath(); g.ellipse(0, 62, 40, 7, 0, 0, TAU); g.fill(); g.restore();
    const vg = g.createRadialGradient(640, 330, 220, 640, 360, 780); vg.addColorStop(0, 'rgba(8,6,5,0)'); vg.addColorStop(1, 'rgba(8,6,5,.78)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    for (const c of S.ghosts) {
      const p = calm ? c.p0 : ((c.p0 + t * c.sp) % 1), x = -120 + p * (W + 240), y = c.y + Math.sin(t * 0.4 + c.ph) * (calm ? 0 : 18);
      g.save(); g.translate(x, y); g.rotate(c.rot + (calm ? 0 : Math.sin(t * 0.3 + c.ph) * 0.08)); g.globalAlpha = c.a * Math.sin(p * Math.PI);
      g.strokeStyle = '#e8dcc4'; g.lineWidth = lnw(2); g.setLineDash([7, 6]); g.beginPath(); g.rect(-45 * c.s, -63 * c.s, 90 * c.s, 126 * c.s); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(-30 * c.s, 0); g.lineTo(30 * c.s, 0); g.stroke(); g.restore();
    }
    g.save();
    for (const d of S.dust) {
      const y = ((d.y0 - (calm ? 0 : t * d.vy)) % 760 + 760) % 760 - 20, x = d.x0 + (calm ? 0 : Math.sin(t * d.fx + d.ph) * d.amp), rel = (x - 640 - sway * y) / (30 + y * 0.52), inCone = clamp(1 - Math.abs(rel), 0, 1);
      g.globalAlpha = 0.06 + inCone * 0.55 * (0.6 + 0.4 * Math.sin(t * 2 + d.ph)); g.fillStyle = inCone > 0.3 ? '#ffe9ae' : '#9d927c'; g.beginPath(); g.arc(x, y, d.r, 0, TAU); g.fill();
    }
    g.restore();
    // a flat lit floor and the hero in the pool
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.fillStyle = 'rgba(255,200,120,.12)'; g.beginPath(); g.ellipse(1090, 650, 190, 44, 0, 0, TAU); g.fill(); g.restore();
    groundShadow(g, 1090, 650, 52, 0.55);
    const br = calm ? 0 : Math.sin(t * 1.7), hc = heroCanvas();
    g.save(); g.translate(1090, 650); g.scale(1 - 0.006 * br, 1 + 0.014 * br);
    if (hc) g.drawImage(hc, -150, -340, 300, 360); else { try { drawHero(g, 'marrow', 0, 0, { scale: 1.0, t: calm ? 0.2 : t }); } catch (e) { /* art is optional here */ } }
    g.restore();
  }
  // the procedural hero baked once (feet at the middle bottom), so the fallback scene costs a blit
  let HERO = null;
  function heroCanvas() {
    if (HERO !== null) return HERO;
    const o = mkCanvas(300, 360); if (!o) return (HERO = false);
    try { drawHero(o.x, 'marrow', 150, 340, { scale: 1.0, t: 0.2 }); } catch (e) { return (HERO = false); }
    return (HERO = o.c);
  }

  function keyartPass(app, g, o) {
    const ka = S.keyart, img = ka.img, iw = img.naturalWidth || img.width || ka.def.w || 2560, ih = img.naturalHeight || img.height || ka.def.h || 1440;
    const sc = Math.max(W / iw, H / ih) * 1.06, dw = iw * sc, dh = ih * sc, f = ka.def.focus || { x: 0.5, y: 0.5 };
    const x = (W - dw) / 2 + o.ox0 * 1.4 - (f.x - 0.5) * 20, y = (H - dh) / 2 + o.oy0 * 1.4 - (f.y - 0.5) * 12;
    g.drawImage(img, x, y, dw, dh);
    S.glows.length = 0;
    for (const L of ka.def.lights || []) { const gx = (x + L.x * dw - 0) / 1, gy = y + L.y * dh; S.glows.push((gx - (o.ox)) / o.z, (gy - o.oy) / o.z, L.k === undefined ? 1 : L.k, hash('ka' + L.x + L.y) * TAU); }
  }

  // ---------- the frame ----------
  S.draw = (app, o = {}) => {
    const g = app.ctx, dt = Math.min(0.05, app.dt || 0.016), calm = !!o.calm, t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    S.frame++; if (!calm) S.t += dt; const t = S.t;
    S.ensure(app);
    // slow device: three frames of dt over 30 ms in a row for 90 frames flips `lite`; it never flips back
    // the quality tier (ui/quality.js, measured from real frame deltas) drives lite both ways; without a controller (tests) the old JS-time detector decides, sticky
    if (app.perf && app.perf.q) { const tl = app.perf.q.tier; if (tl !== S.lastTier) { S.lastTier = tl; S.lite = tl !== 'full'; } } // on a tier change only
    else if (t0) { S.slow = S.slow * 0.97 + (S.stats.ms > 7 ? 1 : 0) * 0.03; if (!S.lite && S.frame > 90 && S.slow > 0.6) S.lite = true; }
    const useKeyart = !!(S.keyart && S.keyart.ok), useKit = !useKeyart && resolveKit(app);
    // images still on their way (a real browser, first seconds): a dark room instead of the fallback, so the scene fades in once instead of flashing the old one first
    const waiting = !useKeyart && !useKit && S.frame < 420 && (assets.kitState === 'loading' || assets.state === 'loading' || (assets.kitReady() && !KR.recipesSettled(CLUSTER.map((r) => r.type), app)));
    S.mode = useKeyart ? 'keyart' : useKit ? 'kit' : waiting ? 'loading' : 'fallback';
    S.age = S.mode === 'kit' || S.mode === 'keyart' ? (calm ? 1 : Math.min(1, (S.age || 0) + dt / 0.9)) : 0;
    const mx = app.mouse && app.mouse.x > -900 ? clamp((app.mouse.x - 640) / 640, -1, 1) : 0, my = app.mouse && app.mouse.y > -900 ? clamp((app.mouse.y - 360) / 360, -1, 1) : 0;
    S.mx += (mx - S.mx) * Math.min(1, dt * 2.5); S.my += (my - S.my) * Math.min(1, dt * 2.5);
    const drift = calm ? 0 : 1, ox0 = (Math.sin(t * 0.09) * 16 - S.mx * 9) * drift, oy0 = (Math.sin(t * 0.063 + 1) * 6 - S.my * 5) * drift, zk = 1 + (calm ? 0 : 0.012 * Math.sin(t * 0.05));
    if (S.mode === 'loading') { tg0(g); const gs0 = gradeSprite(); if (gs0) { g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(gs0, 0, 0, W, H); g.restore(); } return S.mode; }
    if (S.mode === 'fallback') { fallbackPass(app, g, t, calm); if (o.fade !== undefined && o.fade < 1) { g.save(); g.fillStyle = `rgba(5,4,7,${clamp(1 - o.fade, 0, 1).toFixed(3)})`; g.fillRect(0, 0, W, H); g.restore(); } S.stats.draws++; S.stats.ms += (((t0 ? performance.now() - t0 : 0)) - S.stats.ms) * 0.1; return S.mode; }
    // lite: update the scene into an offscreen copy every third frame, blit it in between
    let tg = g, blit = false;
    if (S.lite && typeof document !== 'undefined') {
      if (!S.off || S.off.w !== Math.round(W * (app.px || 1)) ) { const px = Math.min(2, app.px || 1), c = mkCanvas(W * px, H * px); S.off = c ? { ...c, w: Math.round(W * (app.px || 1)), px } : null; }
      if (S.off) { if (S.frame % 3 !== 0 && S.off.ready) { g.drawImage(S.off.c, 0, 0, W, H); S.stats.liteFrames++; return S.mode; } tg = S.off.x; tg.setTransform(S.off.px, 0, 0, S.off.px, 0, 0); tg.clearRect(0, 0, W, H); blit = true; }
    }
    const z = CAM.z * zk, ox = CAM.sx - CAM.cx * z + ox0, oy = CAM.sy - CAM.cy * z + oy0;
    tg.save(); tg.fillStyle = '#07060a'; tg.fillRect(0, 0, W, H);
    if (useKeyart) keyartPass(app, tg, { ox0, oy0, ox, oy, z });
    else {
      backdrop(tg, t, ox0 * 0.35, oy0 * 0.35, calm);
      tg.save(); tg.translate(ox, oy); tg.scale(z, z);
      if (!calm) stepCast(app, dt, calm); else stepCast(app, 1 / 60, true);
      worldPass(app, tg, { calm, t, dt });
      tg.restore();
    }
    // the grade (multiply), then the light on top of it
    const gs = gradeSprite();
    if (gs) { tg.save(); tg.globalCompositeOperation = 'multiply'; tg.drawImage(gs, 0, 0, W, H); tg.restore(); }
    lightPass(app, tg, { calm, t, ox, oy, z });
    motePass(app, tg, t, calm);
    tg.restore();
    if (blit) { S.off.ready = true; g.drawImage(S.off.c, 0, 0, W, H); }
    const fadeK = Math.min(o.fade === undefined ? 1 : o.fade, S.age);
    if (fadeK < 1) { g.save(); g.fillStyle = `rgba(5,4,7,${clamp(1 - fadeK, 0, 1).toFixed(3)})`; g.fillRect(0, 0, W, H); g.restore(); }
    S.stats.frames++; if (t0) { const ms = performance.now() - t0; S.stats.ms += (ms - S.stats.ms) * 0.1; S.stats.last = ms; }
    return S.mode;
  };

  const tg0 = (g) => { g.save(); g.fillStyle = '#07060a'; g.fillRect(0, 0, W, H); backdrop(g, S.t, 0, 0); g.restore(); };
  // far wall: dark arched moonlit windows, cached once (it is the only layer behind the rooms; parallax 0.35)
  let BACK = null;
  function backdrop(g, t, px, py) {
    if (BACK === null) {
      const o = mkCanvas(640, 360); BACK = o ? o.c : false;
      if (o) {
        const q = o.x, k = 0.5, bg = q.createLinearGradient(0, 0, 0, 360); bg.addColorStop(0, '#0b0910'); bg.addColorStop(0.6, '#16121a'); bg.addColorStop(1, '#0c0a0e'); q.fillStyle = bg; q.fillRect(0, 0, 640, 360);
        for (const wx of [150, 360, 570, 770, 40]) { // tall arched windows, pale glass, cross mullions
          const x = wx * k * 0.8 + 10, y0 = 40, w = 52, h = 150, gr = q.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, 'rgba(120,150,205,.5)'); gr.addColorStop(1, 'rgba(70,90,140,.18)');
          q.fillStyle = gr; q.beginPath(); q.moveTo(x, y0 + h); q.lineTo(x, y0 + w / 2); q.arc(x + w / 2, y0 + w / 2, w / 2, Math.PI, 0); q.lineTo(x + w, y0 + h); q.closePath(); q.fill();
          q.strokeStyle = 'rgba(8,6,10,.9)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x + w / 2, y0); q.lineTo(x + w / 2, y0 + h); q.moveTo(x, y0 + 70); q.lineTo(x + w, y0 + 70); q.stroke(); q.stroke();
        }
      }
    }
    if (BACK) { g.save(); g.globalAlpha = 0.9; g.drawImage(BACK, -30 + px, -16 + py, W + 60, H + 32); g.restore(); }
  }
  return S;
}
void COL;
