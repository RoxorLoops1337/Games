// Whiskerton Walk: the renderer. A layered parallax world (sky, far mountains, hills, mid tree line, play strips) built from the lazy
// cached strips in kingdom_strips.js, with everything that moves or depends on the save drawn live on top, y sorted:
// the nine buildings (from the cached 240x240 sprites of kingdom_scene.js; a plot with a sign at level 0), builder cats and
// scaffolding, wonders on cloud islands with a Wind Lift pad, the Stackstone and Statue Walk, the gate, the lookout, NPCs, the avatar.
//
//   const world = createWorld(canvas, layout, () => save.kingdom, { getSave: () => save });
//   world.draw(ctx, snap, alpha, tSeconds, { gfx: 3 });   // ctx is in STAGE coordinates (960x540); the world clears it first
//   world.setReduced(true); world.setQuality(2); world.setNow(new Date()); world.free();
//
// Day palette only is baked into the strips. Night is a tint over the finished world (source-atop), lantern and window glows
// (additive), then stars, moon and sky drawn BEHIND everything (destination-over), so the sky never gets darkened twice.
// Not thread safe. Draw is allocation light: particles are stateless formulas of (index, t), no arrays per frame.
import { tr, getLang } from './i18n.js';
import { BUILDINGS, WONDERS, CATS, CAT_BY_ID, BUILDING_BY_ID, WONDER_BY_ID, buildingLevel, kingdomLevel } from './cats.js';
import { TAU, mulberry, hash, outlineCanvas } from './art_util.js';
import { buildingSprite, dropBuildingSprite, propSprite, PROP_BOX } from './kingdom_scene.js';
import { drawCat } from './art_cats.js';
import { iconCanvas } from './art_icons.js';
import { drawWalkCat } from './kingdom_cat.js';
import { stackstoneView } from './kingdom_life.js';
import {
  VIEW_W, VIEW_H, LAYERS, createStrips, makeEnv, withEnv, factorOf, tileRange, tileCount, singleWidth, levelBand, lampPoints, LAMP_TOP, buildCloud, buildGlow, districtAt, playScale,
} from './kingdom_strips.js';

export { estimateMemMB } from './kingdom_strips.js';
export const WORLD_TEXTS = ['Go on a trip', 'Stackstone', 'Wave #'];   // English canvas texts this file passes through tr() (plus building names)
const BS = 1.5, BUMP_DUR = 4.2;
const MB = 1048576;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, u) => a + (b - a) * u;
const sm = (u) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------- calendar, light, weather (pure, exported for tests)
// Phase of the moon 0..1 (0 new, 0.5 full) from the real date.
export function moonPhase(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return ((((jd - 2451550.1) / 29.530588853) % 1) + 1) % 1;
}
export const seasonIndex = (date) => { const m = date.getMonth(); return m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3; };   // spring summer autumn winter
// dark 0..1 (1 = full night), warm 0..1 (dawn and dusk glow) for an hour of the day 0..24
export function lightAt(h) {
  const ramp = (a, b) => sm(clamp((h - a) / (b - a), 0, 1));
  const dark = h < 5.5 ? 1 : h < 7.5 ? 1 - ramp(5.5, 7.5) : h < 18 ? 0 : h < 20.5 ? ramp(18, 20.5) : 1;
  return { dark, warm: dark > 0 && dark < 1 ? clamp(1 - Math.abs(dark - 0.5) * 2, 0, 1) : 0 };
}
// the weather of a day: the season's own, with a rainy day now and then (never in winter, when it snows)
export function weatherFor(date, season) {
  if (season === 3) return 'snow';
  const key = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
  if (hash('rain' + key) % 6 === 0) return 'rain';
  return season === 0 ? 'petals' : season === 2 ? 'leaves' : 'clear';
}
// particle caps per gfx level (0 off, 1 light, 2 weather, 3 bloom)
export function caps(gfx) {
  const g = clamp(gfx | 0, 0, 3);
  return { weather: [0, 0, 36, 60][g], fireflies: [0, 0, 6, 12][g], stars: [0, 24, 60, 80][g], clouds: [0, 3, 5, 5][g] };
}

const RND = (() => { const r = mulberry(0xc47), a = new Float32Array(4 * 128); for (let i = 0; i < a.length; i++) a[i] = r(); return a; })();

// ---------------------------------------------------------------- statues
function marbleStatue(cats) {
  const n = Math.min(cats.length, 6), S = 0.46, box = 120 * S, step = 30, w = 64, h = Math.ceil(box + Math.max(0, n - 1) * step + 8);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {   // the first id is the bottom cat, each next one stands on it
    const d = CAT_BY_ID[cats[i]]; if (!d) continue;
    g.save(); g.translate((w - box) / 2, h - 4 - box - i * step); g.scale(S, S); drawCat(g, d, 'open'); g.restore();
  }
  g.globalCompositeOperation = 'source-atop';
  const m = g.createLinearGradient(0, 0, w, h); m.addColorStop(0, 'rgba(244,244,250,.84)'); m.addColorStop(0.5, 'rgba(214,218,232,.84)'); m.addColorStop(1, 'rgba(184,190,210,.84)');
  g.fillStyle = m; g.fillRect(0, 0, w, h);
  const r = mulberry(hash(cats.join(',')) + 3);
  g.strokeStyle = 'rgba(120,130,160,.35)'; g.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(r() * w, 0); g.bezierCurveTo(r() * w, h * 0.3, r() * w, h * 0.6, r() * w, h); g.stroke(); }
  const o = outlineCanvas(c, 1, '#6c708a', 0.9);
  c.width = c.height = 0;
  return o;
}

// ---------------------------------------------------------------- the world
export function createWorld(canvas, layout, getKingdom, { getSave } = {}) {
  const W = layout.width || 3600, GY = layout.groundY || 440, platforms = layout.platforms || [];
  const zones = layout.zones || [];
  const zb = zones.filter((z) => z.type === 'building' && BUILDING_BY_ID[z.id]);
  const zw = zones.filter((z) => z.type === 'wonder' && WONDER_BY_ID[z.id]);
  const zl = zones.filter((z) => z.type === 'lift');
  const zs = zones.filter((z) => z.type === 'statue');
  const zbench = zones.filter((z) => z.type === 'bench');
  const zgate = zones.find((z) => z.type === 'gate'), zlook = zones.find((z) => z.type === 'lookout');
  const npcInfo = new Map((layout.npcs || []).map((n) => [n.id, n]));

  let G = 3, R = false, pinned = null, palette = null, clockAt = -1e9, clock = null;
  let env = makeEnv(layout, { level: 0, season: 0, gfx: G, reduced: R });
  let envSig = '';
  const strips = createStrips(env);
  const glow = buildGlow(), cloudSpr = [0, 1, 2].map(buildCloud);
  const ready = new Set(), usedAt = new Map(), want = [];   // building sprites we created: key -> last frame used
  const statues = new Map();   // record key -> canvas
  const textCache = new Map();
  let frame = 0, needWarm = true, lastCx = 0, dir = 0, freed = false;
  const stats = { particles: 0, lights: 0, builders: 0, statues: 0, built: 0, sprites: 0, entities: 0 };
  const pool = [], items = [];
  let poolN = 0;
  const LX = new Float32Array(40), LY = new Float32Array(40), LR = new Float32Array(40), LA = new Float32Array(40);
  let ln = 0;

  // ---- clock: real time unless pinned (setNow) or overridden (setPalette / opts)
  function readClock(o) {
    const ms = Date.now();
    if (!clock || (!pinned && ms - clockAt > 20000) || (pinned && clock.pinnedTo !== pinned.getTime())) {
      const d = pinned || new Date(ms);
      clock = { date: d, hour: d.getHours() + d.getMinutes() / 60, season: seasonIndex(d), moon: moonPhase(d), weather: weatherFor(d, seasonIndex(d)), pinnedTo: pinned ? pinned.getTime() : 0 };
      clockAt = ms;
    }
    const p = palette || {}, q = o || {};
    const hour = fin(q.hour, fin(p.hour, clock.hour)), season = q.season != null ? q.season : p.season != null ? p.season : clock.season;
    const weather = q.weather || p.weather || (season === clock.season ? clock.weather : weatherFor(clock.date, season));
    return { hour, season: clamp(season | 0, 0, 3), weather, moon: q.moon != null ? q.moon : p.moon != null ? p.moon : clock.moon, date: clock.date };
  }

  // ---- building sprite residency (max a handful resident; created at most one per frame unless warming)
  function sprite(id, lvl, force) {
    const key = id + ':' + lvl;
    if (ready.has(key)) { usedAt.set(key, frame); return buildingSprite(id, lvl); }
    if (force) { ready.add(key); usedAt.set(key, frame); return buildingSprite(id, lvl); }
    if (want.indexOf(key) < 0) want.push(key);
    return null;
  }
  function dropSprites(all) {
    for (const key of ready) {
      if (all || frame - (usedAt.get(key) || 0) > 40) { const i = key.indexOf(':'); dropBuildingSprite(key.slice(0, i), +key.slice(i + 1)); ready.delete(key); usedAt.delete(key); }
    }
  }
  function statueFor(rec, make) {
    const key = rec.wave + '|' + rec.date + '|' + rec.cats.join(',');
    let c = statues.get(key);
    if (c) { c._u = frame; return c; }
    if (!make) return null;
    c = marbleStatue(rec.cats); c._u = frame; statues.set(key, c);
    if (statues.size > 5) for (const [k, v] of statues) if (v._u < frame - 20) { v.width = v.height = 0; statues.delete(k); }
    return c;
  }

  // ---- little shared drawing helpers
  const ell = (ctx, x, y, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); };
  function textOf(key, fn) { const k = key + getLang(); let v = textCache.get(k); if (v === undefined) { v = fn(); textCache.set(k, v); if (textCache.size > 80) textCache.clear(); } return v; }
  function floorUnder(x, y) { let best = GY; for (let i = 0; i < platforms.length; i++) { const p = platforms[i]; if (x >= p.x && x <= p.x + p.w && p.y >= y - 3 && p.y < best) best = p.y; } return best; }
  function addLight(x, y, r, a) { if (ln < 14) { LX[ln] = x; LY[ln] = y; LR[ln] = r; LA[ln] = a; ln++; } }
  function item(y, k, a, b, x) {
    let o = pool[poolN]; if (!o) o = pool[poolN] = { y: 0, k: '', a: null, b: null, x: 0 };
    poolN++; o.y = y; o.k = k; o.a = a; o.b = b; o.x = x; items.push(o);
  }

  // per frame context shared by the entity drawers
  let T = 0, reduced = false, gfx = 3, snap = null, kingdom = null, dark = 0, season = 0, view0 = 0, view1 = 0, saveObj = null;

  function mouse(ctx, x, y, face, pose, crier, phase) {
    const run = pose === 'run', bob = reduced ? 0 : (run ? Math.abs(Math.sin(T * 12 + phase)) * 3 : Math.sin(T * 2 + phase) * 0.8);
    ctx.save(); ctx.translate(x, y - bob); ctx.scale(face < 0 ? -1 : 1, 1); ctx.lineWidth = 1; ctx.strokeStyle = '#4a4058';
    ctx.strokeStyle = '#8a6a78'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-11, -9); ctx.quadraticCurveTo(-24, -6, -22, -20); ctx.stroke();
    ctx.strokeStyle = '#4a4058'; ctx.lineWidth = 1;
    ell(ctx, -3, 0, 6, 2.4, '#8a8498'); ell(ctx, 7, 0, 6, 2.4, '#8a8498');
    ctx.fillStyle = '#b9b2c4'; ctx.beginPath(); ctx.ellipse(0, -13, 12, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9d2e0'; ctx.beginPath(); ctx.ellipse(2, -10, 7, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b9b2c4'; ctx.beginPath(); ctx.ellipse(9, -22, 9, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0a8c0'; for (const ex of [4, 12]) { ctx.beginPath(); ctx.arc(ex, -30, 4.2, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#271c33'; ctx.beginPath(); ctx.arc(12, -23, 1.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#e07a98'; ctx.beginPath(); ctx.arc(17.5, -21, 1.5, 0, TAU); ctx.fill();
    if (crier) {
      ctx.fillStyle = '#8a2a3a'; ctx.beginPath(); ctx.moveTo(1, -29); ctx.lineTo(9, -39); ctx.lineTo(18, -29); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(16, -14); ctx.rotate(reduced ? -0.3 : -0.3 + Math.sin(T * 3 + phase) * 0.25);
      ctx.fillStyle = '#f4ecd0'; ctx.fillRect(-1, -16, 13, 18); ctx.strokeRect(-1, -16, 13, 18); ctx.fillStyle = 'rgba(70,50,40,.55)'; for (let i = 0; i < 4; i++) ctx.fillRect(1, -13 + i * 4, 9, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  function builderCats(z, s, ids, n, prog, hammer, ctx) {
    // positions around the plot; prog < 0 means a standing crew (level 0), else the upgrade timeline
    const h = 120 * s;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, off = (0.5 + (i >> 1) * 0.16) * h * (i === 2 ? 0.3 : 1) * (i === 2 ? 1 : 1), tx = z.x + (i === 2 ? 0.1 * h : side * off), y = z.y + (i === 2 ? 4 : 0);
      let x = tx, pose = hammer ? 'idle' : 'sit';
      if (prog >= 0) {
        const a = clamp(prog / 0.14, 0, 1), b = clamp((prog - 0.8) / 0.2, 0, 1);
        if (b >= 1) continue;
        x = tx + (i === 2 ? 1 : side) * (1 - a) * 150 + (i === 2 ? 1 : side) * b * 150;
        if (a < 1 || b > 0) pose = 'run';
      }
      const face = x < z.x ? 1 : -1, cid = ids[i % ids.length];
      drawWalkCat(ctx, cid, pose, x, y, pose === 'run' ? (prog >= 0 && prog > 0.5 ? -(side) : face) : face, T, reduced, 'b' + z.id + i);
      stats.builders++;
      if (pose === 'idle' && hammer) {   // a hammer swinging at the wall
        const ph = T * 9 + i * 1.7, a = -1.1 + Math.abs(Math.sin(ph)) * 1.5, hx = x + face * 16, hy = y - 30;
        ctx.save(); ctx.translate(hx, hy); ctx.scale(face, 1); ctx.rotate(a);
        ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
        ctx.fillStyle = '#6a6a7a'; ctx.fillRect(-5, -19, 10, 6); ctx.restore();
        if (Math.sin(ph) > 0.93) { ctx.fillStyle = '#fff3a0'; ctx.fillRect(x + face * 26 - 1, y - 38, 2, 5); ctx.fillRect(x + face * 26 - 3, y - 36, 6, 1.5); }
      }
    }
  }

  const TOP_Y = { dojo: 24, beds: 36, yarn: 24, spa: 44, tower: 14, shrine: 36, vault: 8, tent: 16, stall: 34 };
  function drawBuilding(ctx, z) {
    const b = BUILDING_BY_ID[z.id], l = buildingLevel(kingdom, z.id), x = z.x, y = z.y == null ? GY : z.y, h = 120 * BS;
    const bt = snap.bumps && snap.bumps[z.id], BT = fin(snap.t, T);
    let prog = -1;
    if (!reduced && Number.isFinite(bt) && BT >= bt && (BT - bt) / BUMP_DUR < 1.15) prog = (BT - bt) / BUMP_DUR;
    const constructing = prog >= 0 && prog < 0.8 && l >= 1, shown = constructing ? Math.max(0, l - 1) : l;
    if (gfx >= 1) ell(ctx, x + 6, y, h * 0.4, 8, 'rgba(40,70,40,.28)');
    const spr = sprite(z.id, shown, false);
    let pop = 1;
    if (prog > 0.8 && prog < 1) pop = 1 + 0.1 * Math.sin(((prog - 0.8) / 0.2) * Math.PI);
    if (spr) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, pop); ctx.drawImage(spr, -h / 2, -h * (112 / 120), h, h); ctx.restore();
    }
    if (constructing) {   // scaffolding over the old look
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 3; ctx.beginPath();
      for (const sx of [-0.36, 0.36]) { ctx.moveTo(x + sx * h, y + 2); ctx.lineTo(x + sx * h, y - h * 0.7); }
      ctx.stroke();
      ctx.fillStyle = '#b58b5a'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1;
      for (const py of [0.2, 0.42, 0.64]) { ctx.fillRect(x - 0.4 * h, y - py * h, 0.8 * h, 5); ctx.strokeRect(x - 0.4 * h, y - py * h, 0.8 * h, 5); }
      ctx.strokeStyle = 'rgba(138,106,74,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 0.36 * h, y - 0.2 * h); ctx.lineTo(x + 0.36 * h, y - 0.64 * h); ctx.stroke();
    }
    const ids = [CATS[(hash(z.id) + 1) % CATS.length].id, CATS[(hash(z.id) + 8) % CATS.length].id, CATS[(hash(z.id) + 15) % CATS.length].id];
    if (prog >= 0 && l >= 1) builderCats(z, BS, ids, 3, prog, !reduced, ctx);
    else if (l === 0) builderCats(z, BS, ids, 2, -1, !reduced, ctx);
    if (prog >= 0.8 && prog < 1.15 && gfx >= 1) {   // dust ring when the new level pops in
      const u = (prog - 0.8) / 0.35;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = 20 + u * 70; ctx.fillStyle = `rgba(245,240,225,${0.6 * (1 - u)})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y - 6 + Math.sin(a) * r * 0.18, 5 + u * 7, 0, TAU); ctx.fill(); }
    }
    if (l === 0) {   // plot sign
      const label = textOf('b' + z.id, () => tr(b.name)), sx = x - h * 0.42, sy = y + 6;
      ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center';
      const tw = Math.min(104, ctx.measureText(label).width + 14);
      ctx.fillStyle = '#7a5232'; ctx.fillRect(sx - 2, sy - 30, 4, 32);
      ctx.fillStyle = '#d9b27a'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy - 52, tw, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2416'; ctx.fillText(label, sx, sy - 37, tw - 8);
    } else {
      if (l >= b.max && !reduced) {   // maxed: a small flag on the roof
        const fy = y - h * ((112 - (TOP_Y[z.id] || 30)) / 120) - 6, w = Math.sin(T * 3 + x) * 2;
        ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, fy - 22); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x, fy - 22); ctx.quadraticCurveTo(x + 8, fy - 22 + w, x + 16, fy - 18); ctx.quadraticCurveTo(x + 8, fy - 16 + w, x, fy - 13); ctx.fill();
      } else if (l >= b.max) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y - h * ((112 - (TOP_Y[z.id] || 30)) / 120) - 28, 14, 8); }
      if (!reduced && gfx >= 2 && l >= 1 && (z.id === 'beds' || z.id === 'spa' || z.id === 'yarn')) {   // chimney smoke and spa steam
        for (let i = 0; i < 5; i++) { const u = (T * 0.32 + i / 5) % 1; ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - u)})`; ctx.beginPath(); ctx.arc(x + h * 0.14 + u * 14 + Math.sin(T + i) * 2, y - h * 0.62 - u * 36, 2.5 + u * 5, 0, TAU); ctx.fill(); }
      }
    }
    if (l >= 1 && dark > 0.2 && gfx >= 2) addLight(x, y - h * 0.38, 62, 0.4);
  }

  function drawWonder(ctx, z, idx) {
    const w = WONDER_BY_ID[z.id], owned = !!(kingdom.wonders && kingdom.wonders[z.id]), x = z.x, y = z.y;
    let pw = 230; for (const p of platforms) if (p.y === y && x >= p.x && x <= p.x + p.w) { pw = p.w; break; }
    const sc = pw / 104;
    ctx.drawImage(cloudSpr[idx % 3], x - 75 * sc, y - 24 * sc, 150 * sc, 56 * sc);
    ctx.globalAlpha = 0.95; ctx.drawImage(cloudSpr[(idx + 1) % 3], x - 75 * sc * 0.72 + 40, y - 18 * sc * 0.72 + 10, 150 * sc * 0.72, 56 * sc * 0.72); ctx.globalAlpha = 1;
    ctx.fillStyle = '#c9c4d6'; ctx.strokeStyle = '#6a6080'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(x - 22, y - 12, 44, 12, 3); ctx.fill(); ctx.stroke();
    const oy = y - 70 + (reduced ? 0 : Math.sin(T * 1.8 + idx) * 4);
    if (gfx >= 1) { ctx.globalAlpha = owned ? 0.9 : 0.4; ctx.drawImage(glow, x - 46, oy - 46, 92, 92); ctx.globalAlpha = 1; }
    ctx.fillStyle = owned ? '#fff6d0' : 'rgba(255,255,255,.7)'; ctx.strokeStyle = owned ? '#d9a600' : '#9a8ac0'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(x, oy, 25, 0, TAU); ctx.fill();
    if (!owned) ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = owned ? 1 : 0.55; ctx.drawImage(iconCanvas(w.icon), x - 17, oy - 18, 34, 34); ctx.globalAlpha = 1;
    if (owned) {
      ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, oy, 31 + (reduced ? 0 : Math.sin(T * 2.4 + idx) * 1.5), 0, TAU); ctx.stroke();
      if (!reduced) for (let i = 0; i < 4; i++) { const a = T * 0.9 + i * (TAU / 4) + idx, tw = 0.5 + 0.5 * Math.sin(T * 3 + i * 1.7); ctx.fillStyle = `rgba(255,240,170,${0.35 + 0.55 * tw})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 36, oy + Math.sin(a) * 36, 1.6 + tw * 1.4, 0, TAU); ctx.fill(); }
      if (z.id === 'cafe' && !reduced && gfx >= 2) for (let i = 0; i < 4; i++) { const u = (T * 0.4 + i / 4) % 1; ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - u)})`; ctx.beginPath(); ctx.arc(x + 10 + Math.sin(T + i) * 3, oy - 28 - u * 30, 3 + u * 5, 0, TAU); ctx.fill(); }
      addLight(x, oy, 70, 0.55);
    } else {   // gem price tag
      const label = String(w.cost), tw = 40;
      ctx.fillStyle = '#2a1d4a'; ctx.beginPath(); ctx.roundRect(x - tw / 2, oy - 56, tw, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x + 7, oy - 44);
      ctx.drawImage(iconCanvas('\u{1F48E}'), x - tw / 2 + 3, oy - 56, 15, 15);
    }
  }

  function drawLift(ctx, z) {
    if (gfx < 1) return;
    const x = z.x, y = z.y == null ? GY : z.y, top = fin(z.toY, y - 170), active = snap.lift ? 2 : 1;
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(T * 3 + x);
    const bm = ctx.createLinearGradient(0, top, 0, y); bm.addColorStop(0, 'rgba(160,230,255,0)'); bm.addColorStop(1, `rgba(160,230,255,${0.16 * active})`);
    ctx.fillStyle = bm; ctx.fillRect(x - 26, top, 52, y - top);
    ell(ctx, x, y + 1, 36, 8, 'rgba(60,80,120,.35)'); ell(ctx, x, y - 1, 30, 6.5, `rgba(143,227,255,${0.55 + 0.3 * pulse})`);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y - 1, 30, 6.5, 0, 0, TAU); ctx.stroke();
    if (!reduced) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * active})`; ctx.lineWidth = 2; ctx.beginPath();
      const span = y - top;
      for (let i = 0; i < 4; i++) { const u = (T * 0.35 + i / 4) % 1, yy = y - u * span, dx = Math.sin(T * 2 + i * 2) * 8; ctx.moveTo(x + dx - 8, yy + 6); ctx.lineTo(x + dx, yy); ctx.lineTo(x + dx + 8, yy + 6); }
      ctx.stroke();
    }
  }

  function drawGate(ctx, z) {
    const x = z.x, y = z.y == null ? GY : z.y, glowA = reduced ? 0.8 : 0.7 + 0.2 * Math.sin(T * 2);
    ell(ctx, x, y, 70, 8, 'rgba(30,60,30,.25)');
    ctx.fillStyle = '#6fae58'; ctx.beginPath(); ctx.ellipse(x - 62, y - 14, 24, 18, 0, 0, TAU); ctx.ellipse(x + 62, y - 14, 24, 18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d6d0dc'; ctx.strokeStyle = '#6a6080'; ctx.lineWidth = 1.4;
    ctx.fillRect(x - 46, y - 112, 18, 112); ctx.strokeRect(x - 46, y - 112, 18, 112); ctx.fillRect(x + 28, y - 112, 18, 112); ctx.strokeRect(x + 28, y - 112, 18, 112);
    ctx.beginPath(); ctx.arc(x, y - 112, 46, Math.PI, 0); ctx.arc(x, y - 112, 28, 0, Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    const gr = ctx.createRadialGradient(x, y - 70, 4, x, y - 70, 52); gr.addColorStop(0, `rgba(255,236,160,${glowA})`); gr.addColorStop(1, 'rgba(255,200,100,.25)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 28, y); ctx.lineTo(x - 28, y - 112); ctx.arc(x, y - 112, 28, Math.PI, 0); ctx.lineTo(x + 28, y); ctx.closePath(); ctx.fill();
    const label = textOf('gate', () => tr('Go on a trip'));
    ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center';
    const tw = Math.min(150, ctx.measureText(label).width + 20);
    ctx.fillStyle = '#7a5232'; ctx.strokeStyle = '#3a2416'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 176, tw, 22, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe9a0'; ctx.fillText(label, x, y - 161, tw - 10);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 20, y - 154); ctx.lineTo(x - 20, y - 146); ctx.moveTo(x + 20, y - 154); ctx.lineTo(x + 20, y - 146); ctx.stroke();
    addLight(x, y - 66, 80, 0.7);
  }

  function drawLookout(ctx, z) {
    const x = z.x, y = z.y == null ? GY : z.y, bk = fin(saveObj && saveObj.stats && saveObj.stats.bossKills, 0);
    ell(ctx, x, y + 2, 90, 12, 'rgba(60,110,50,.5)');
    ctx.fillStyle = '#9a6a3a'; ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 1.2;
    ctx.fillRect(x - 38, y - 24, 76, 8); ctx.strokeRect(x - 38, y - 24, 76, 8);
    for (const lx of [-34, 30]) { ctx.fillRect(x + lx, y - 16, 5, 16); }
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x - 30, y - 24); ctx.lineTo(x - 30, y - 150); ctx.stroke();
    const w = reduced ? 0 : Math.sin(T * 3) * 3;
    ctx.fillStyle = '#c0304a'; ctx.beginPath(); ctx.moveTo(x - 30, y - 150); ctx.quadraticCurveTo(x - 14, y - 150 + w, x + 2, y - 142); ctx.quadraticCurveTo(x - 14, y - 136 + w, x - 30, y - 128); ctx.fill();
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 24); ctx.lineTo(x + 2, y - 54); ctx.moveTo(x + 14, y - 24); ctx.lineTo(x + 20, y - 54); ctx.moveTo(x + 12, y - 24); ctx.lineTo(x + 12, y - 56); ctx.stroke();
    ctx.save(); ctx.translate(x + 12, y - 58); ctx.rotate(-0.5); ctx.fillStyle = '#c9962e'; ctx.strokeStyle = '#5a3a0a'; ctx.lineWidth = 1; ctx.fillRect(-4, -26, 9, 30); ctx.strokeRect(-4, -26, 9, 30);
    ctx.fillStyle = '#e8c860'; ctx.fillRect(-5, -30, 11, 6); ctx.fillStyle = '#9ad8f0'; ctx.beginPath(); ctx.arc(0.5, -30, 3, 0, TAU); ctx.fill(); ctx.restore();
    // a broken mouse flag for every destroyed nest, up to 12
    const n = Math.min(12, bk | 0);
    for (let i = 0; i < n; i++) {
      const fx = x - 130 + i * 22 + (i % 2) * 5, fy = y + 14 + (i % 3) * 3;
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + (i % 2 ? 2 : -2), fy - 22); ctx.stroke();
      ctx.fillStyle = '#a8a0b4'; ctx.beginPath(); ctx.moveTo(fx + (i % 2 ? 2 : -2), fy - 22); ctx.lineTo(fx + 11, fy - 17); ctx.lineTo(fx + 5, fy - 14); ctx.lineTo(fx + 8, fy - 10); ctx.lineTo(fx + (i % 2 ? 2 : -2), fy - 13); ctx.fill();
    }
    addLight(x - 30, y - 150, 50, 0.4);
  }

  function drawStatue(ctx, z, view) {
    const main = z.id === 'stackstone', i = main ? -1 : +String(z.id).replace('walk', ''), x = z.x, y = z.y == null ? GY : z.y;
    const rec = main ? view.top : view.walk[i];
    const ph = main ? 46 : 18, pw = main ? 74 : 32;
    ctx.fillStyle = '#b9b6c6'; ctx.strokeStyle = '#5e5a76'; ctx.lineWidth = 1.3;
    ctx.fillRect(x - pw / 2 - 6, y - 10, pw + 12, 10); ctx.strokeRect(x - pw / 2 - 6, y - 10, pw + 12, 10);
    ctx.fillStyle = '#d6d4e0'; ctx.fillRect(x - pw / 2, y - ph, pw, ph - 10); ctx.strokeRect(x - pw / 2, y - ph, pw, ph - 10);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - pw / 2 + 2, y - ph + 2, 5, ph - 14);
    if (!rec) {   // empty plinth: a dashed cat shaped outline and the plinth's name
      if (main) {
        ctx.strokeStyle = 'rgba(120,120,150,.8)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, y - ph - 26, 24, 26, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#4a4468'; ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(textOf('stone', () => tr('Stackstone')), x, y - 22, pw - 6);
      }
      return;
    }
    const sc = main ? 1.25 : 0.62, spr = statueFor({ wave: rec.wave, date: rec.date, cats: rec.cats }, false);
    const unveil = main && Number.isFinite(snap.unveil) && snap.unveil < 1 ? clamp(snap.unveil, 0, 1) : 1;
    if (spr && spr.width > 0) { stats.statues++; ctx.drawImage(spr, x - (spr.width * sc) / 2, y - ph - spr.height * sc + 4, spr.width * sc, spr.height * sc); }
    else if (!statueFor({ wave: rec.wave, date: rec.date, cats: rec.cats }, false)) wantStatue.push(rec);
    if (main) {
      const txt = textOf('p' + rec.wave + rec.date, () => ({ a: tr('Wave ' + rec.wave), d: dateLine(rec) }));
      ctx.fillStyle = '#efe2b0'; ctx.strokeStyle = '#7a5a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x - 31, y - ph + 7, 62, 26, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a3410'; ctx.textAlign = 'center'; ctx.font = '800 10px sans-serif'; ctx.fillText(txt.a, x, y - ph + 18, 56); ctx.font = '700 8px sans-serif'; ctx.fillText(txt.d, x, y - ph + 28, 56);
      addLight(x, y - ph - 60, 70, 0.35);
    } else { ctx.fillStyle = '#4a3410'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(rec.wave), x, y - 4 - 0, pw); }
    if (unveil < 1) {   // the red cloth over the plinth, then it flies off in a gust of petals
      const u = clamp((unveil - 0.3) / 0.7, 0, 1), cy2 = y - ph - 80 - u * 160;
      ctx.globalAlpha = 1 - u * 0.9; ctx.fillStyle = '#c0304a'; ctx.strokeStyle = '#7a1a2a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 40 + u * 60, y - ph + 4 - u * 150); ctx.quadraticCurveTo(x - 36 + u * 70, cy2, x - 26 + u * 90, cy2 - 90 * (1 - u)); ctx.lineTo(x + 26 + u * 90, cy2 - 90 * (1 - u)); ctx.quadraticCurveTo(x + 36 + u * 70, cy2, x + 40 + u * 60, y - ph + 4 - u * 150); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      if (u > 0 && u < 1 && !reduced) for (let p = 0; p < 20; p++) { const a = RND[p] * TAU, d = u * (60 + RND[p + 20] * 120); ctx.fillStyle = p % 2 ? '#ffc6e0' : '#fff'; ctx.globalAlpha = 1 - u; ctx.fillRect(x + Math.cos(a) * d, y - ph - 70 + Math.sin(a) * d * 0.7 - u * 40, 3, 3); }
      ctx.globalAlpha = 1;
    }
  }
  const wantStatue = [];
  function dateLine(rec) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rec.date || '');
    if (!m) return '';
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(getLang() === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return rec.date; }
  }

  function drawBench(ctx, z) {
    const b = PROP_BOX.bench, s = 1.6, c = propSprite('bench', 0);
    ctx.drawImage(c, z.x - b[2] * s, z.y - b[3] * s, b[0] * s, b[1] * s);
  }

  // ---- weather and ambience (stateless: position = f(index, t))
  function drawWeather(ctx, kind, cx, n) {
    if (!n || kind === 'clear') return 0;
    const wrap = (v, m) => ((v % m) + m) % m;
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(200,218,255,.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = wrap(RND[i * 4] * 1100 - T * 90 - cx * 0.3, 1100) - 70, y = wrap(RND[i * 4 + 1] * 600 + T * (640 + RND[i * 4 + 2] * 200), 600) - 40; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); }
      ctx.stroke(); return n;
    }
    if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const r = 1.2 + RND[i * 4 + 2] * 1.8, x = wrap(RND[i * 4] * 1100 + Math.sin(T * 0.8 + RND[i * 4 + 3] * 6) * 24 - cx * 0.4 - T * 8, 1100) - 70, y = wrap(RND[i * 4 + 1] * 620 + T * (36 + RND[i * 4 + 2] * 44), 620) - 40; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fill(); return n;
    }
    const cols = kind === 'leaves' ? ['#d6762a', '#f0b040', '#b8502a'] : ['#ffc6e0', '#ffffff', '#f6a0c4'];
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = cols[b]; ctx.beginPath();
      for (let i = b; i < n; i += 3) {
        const x = wrap(RND[i * 4] * 1100 + Math.sin(T * 0.9 + RND[i * 4 + 3] * 6) * 34 - cx * 0.4 - T * (18 + RND[i * 4 + 2] * 24), 1100) - 70, y = wrap(RND[i * 4 + 1] * 620 + T * (34 + RND[i * 4 + 2] * 40), 620) - 40;
        const rot = T * (1 + RND[i * 4 + 2]) + i, rx = kind === 'leaves' ? 4.2 : 3.2, ry = kind === 'leaves' ? 2.4 : 1.8;
        ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      }
      ctx.fill();
    }
    return n;
  }

  function tufts(ctx, cx) {
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    const cols = ['#4f9a44', '#d98a2e', '#3f8a40', '#cfe0ee'];
    ctx.strokeStyle = cols[season]; ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.5) * (W / 8) * 1.3 - cx * 1.3 + RND[i] * 60;
      if (x < -40 || x > VIEW_W + 40) continue;
      const sw = reduced ? 0 : Math.sin(T * 1.6 + i) * 3;
      for (let b = -2; b <= 2; b++) { ctx.moveTo(x + b * 4, VIEW_H + 2); ctx.quadraticCurveTo(x + b * 5, VIEW_H - 14, x + b * 7 + sw, VIEW_H - 26 - Math.abs(b) * -3); }
    }
    ctx.stroke();
  }

  // ---- the main draw
  function draw(ctx, sn, alpha, t, opts) {
    if (freed) return;
    const o = opts || {};
    frame++;
    snap = sn || {}; T = fin(t, 0); reduced = o.reduced != null ? !!o.reduced : R; gfx = clamp(o.gfx != null ? o.gfx : G, 0, 3);
    const clk = readClock(o);
    kingdom = getKingdom() || {}; saveObj = getSave ? getSave() : null;
    dark = lightAt(clk.hour).dark; const warm = lightAt(clk.hour).warm; season = clk.season;
    const A = clamp(fin(alpha, 1), 0, 1);
    stats.particles = 0; stats.lights = 0; stats.builders = 0; stats.statues = 0; stats.built = 0; stats.entities = 0; ln = 0; poolN = 0; items.length = 0; wantStatue.length = 0;

    // env sync: band, season, quality, reduced
    const level = kingdomLevel(kingdom), sig = levelBand(level) + '|' + season + '|' + gfx + '|' + reduced;
    if (sig !== envSig) { envSig = sig; env = withEnv(env, { level, season, gfx, reduced }); strips.setEnv(env); }

    // camera (interpolated by alpha, snapped to whole pixels)
    const cam = snap.cam || { x: 0, y: 0 }, pc = snap.pcam || cam;
    let cx = reduced ? fin(cam.x) : lerp(fin(pc.x, fin(cam.x)), fin(cam.x), A), cy = reduced ? fin(cam.y) : lerp(fin(pc.y, fin(cam.y)), fin(cam.y), A);
    cx = Math.round(clamp(cx, 0, Math.max(0, W - VIEW_W))); cy = Math.round(clamp(cy, -140, 40));
    if (Math.abs(cx - lastCx) > 0.5) dir = cx > lastCx ? 1 : -1;
    const warmNow = needWarm || o.warm || Math.abs(cx - lastCx) > 1400;
    lastCx = cx; view0 = cx - 180; view1 = cx + VIEW_W + 180;
    const ax = fin(A < 1 && snap.px != null && !reduced ? lerp(snap.px, snap.x, A) : snap.x, 0), ay = fin(A < 1 && snap.py != null && !reduced ? lerp(snap.py, snap.y, A) : snap.y, GY);

    // ask for strips, build (sliced, or all at once on the first frame), then draw
    strips.beginFrame();
    strips.get('sky', 0); strips.get('far', 0); strips.get('hills', 0);
    const ranges = [];
    for (const layer of gfx > 0 ? ['mid', 'play'] : ['play']) {
      let [i0, i1] = tileRange(layer, cx, reduced); const n = tileCount(layer, W, reduced);
      if (dir > 0) i1++; else if (dir < 0) i0--;
      i0 = Math.max(0, i0); i1 = Math.min(n - 1, i1); ranges.push(layer, i0, i1);
      for (let i = i0; i <= i1; i++) strips.get(layer, i);
    }
    const before = strips.pending();
    if (warmNow) { strips.pump(Infinity); needWarm = false; } else if (!o.noPump) strips.pump(fin(o.budgetMs, 3));
    stats.built = before - strips.pending();

    // sprites needed near the view: the first missing one on screen right away, the rest one per frame
    want.length = 0;
    let forced = 0;
    for (const z of zb) {
      if (z.x < view0 - 260 || z.x > view1 + 260) continue;
      const l = buildingLevel(kingdom, z.id), bt = snap.bumps && snap.bumps[z.id];
      const onScreen = z.x > view0 && z.x < view1;
      const need = [l]; if (Number.isFinite(bt) && l >= 1) need.push(l - 1);
      for (const lv of need) {
        const key = z.id + ':' + lv;
        if (ready.has(key)) { usedAt.set(key, frame); continue; }
        if (onScreen && (warmNow || forced < 1)) { sprite(z.id, lv, true); forced++; } else if (want.indexOf(key) < 0) want.push(key);
      }
    }
    if (want.length && forced < 1) { const key = want[0], i = key.indexOf(':'); sprite(key.slice(0, i), +key.slice(i + 1), true); }
    dropSprites(false);
    stats.sprites = ready.size;

    ctx.save();
    if (!o.noClear) ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const fFar = factorOf('far', reduced), fHill = factorOf('hills', reduced), fMid = factorOf('mid', reduced);
    const far = strips.get('far', 0), hills = strips.get('hills', 0);
    if (far && gfx >= 1) ctx.drawImage(far, Math.round(-fFar * cx), Math.round(GY + LAYERS.far.top - fFar * cy), singleWidth('far', W, reduced), LAYERS.far.h);
    if (hills) ctx.drawImage(hills, Math.round(-fHill * cx), Math.round(GY + LAYERS.hills.top - fHill * cy), singleWidth('hills', W, reduced), LAYERS.hills.h);
    for (let r = 0; r < ranges.length; r += 3) {
      const layer = ranges[r], L = LAYERS[layer], T0 = L.tile;
      const f = layer === 'play' ? 1 : fMid, ox = Math.round(f * cx), oy = Math.round(GY + L.top - f * cy);
      for (let i = ranges[r + 1]; i <= ranges[r + 2]; i++) {
        const c = strips.get(layer, i);
        if (layer === 'mid') { if (c) ctx.drawImage(c, i * T0 - ox, oy, T0 + 1, L.h); continue; }
        if (layer === 'play') {
          if (c) ctx.drawImage(c, i * T0 - ox, oy, T0 + 1, L.h);
          else { const th = require_theme(env, i * T0 + 256); ctx.fillStyle = th; ctx.fillRect(i * T0 - ox, GY - 46 - cy, T0 + 1, 400); }
        }
      }
      if (layer === 'mid') drawWondersLayer(ctx, cx, cy);   // islands sit in front of the tree line, behind the street
    }
    if (gfx === 0 || !ranges.includes('mid')) drawWondersLayer(ctx, cx, cy);

    // everything standing on the street, y sorted
    ctx.save(); ctx.translate(-cx, -cy);
    ctx.textBaseline = 'alphabetic';
    for (const z of zl) if (z.x > view0 - 60 && z.x < view1 + 60) drawLift(ctx, z);
    const view = stackstoneView(saveObj && saveObj.records);
    for (const z of zb) if (z.x > view0 - 120 && z.x < view1 + 120) item((z.y == null ? GY : z.y) - 2, 'b', z, null, z.x);
    for (const z of zs) if (z.x > view0 && z.x < view1) item(GY - 1, 's', z, null, z.x);
    for (const z of zbench) if (z.x > view0 && z.x < view1) item((z.y == null ? GY : z.y) - 1, 'bench', z, null, z.x);
    if (zgate && zgate.x > view0 - 80 && zgate.x < view1 + 80) item(GY - 3, 'gate', zgate, null, zgate.x);
    if (zlook && zlook.x > view0 - 80 && zlook.x < view1 + 80) item(GY - 3, 'look', zlook, null, zlook.x);
    const npcs = snap.npcs || [];
    for (let i = 0; i < npcs.length; i++) { const n = npcs[i]; if (n && n.x > view0 && n.x < view1) item(GY + 0.1 * i / 10, 'n', n, npcInfo.get(n.id), n.x); }
    if (!o.hideAvatar) item(GY + 0.9, 'a', null, null, ax);
    items.sort((a, b) => a.y - b.y);
    stats.entities = items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      switch (it.k) {
        case 'b': drawBuilding(ctx, it.a); break;
        case 's': drawStatue(ctx, it.a, view); break;
        case 'bench': drawBench(ctx, it.a); break;
        case 'gate': drawGate(ctx, it.a); break;
        case 'look': drawLookout(ctx, it.a); break;
        case 'n': {
          const n = it.a, info = it.b || {};
          if (info.kind === 'cat' && info.catId) drawWalkCat(ctx, info.catId, n.pose || 'idle', n.x, GY, n.face, T, reduced, n.id);
          else mouse(ctx, n.x, GY, n.face, n.pose, info.kind === 'crier' || n.kind === 'crier', hash(String(n.id)) % 7);
          break;
        }
        case 'a': {
          const pose = snap.pose || 'idle', fl = floorUnder(ax, ay);
          if (gfx >= 1 && (pose === 'jump' || pose === 'fall')) ell(ctx, ax, fl, 18 * (1 - clamp((fl - ay) / 200, 0, 0.6)), 4, 'rgba(20,40,30,.28)');
          drawWalkCat(ctx, snap.avatarId || 'tabby', pose, ax, ay, snap.face, T, reduced, 'avatar');
          break;
        }
      }
    }
    // lamp lights
    if (gfx >= 1 && dark > 0.08) { const lp = lampPoints(env); for (let i = 0; i < lp.length && ln < 14; i++) if (lp[i].x > view0 && lp[i].x < view1) addLight(lp[i].x, lp[i].y - LAMP_TOP + 6, 28 + 52 * dark, 0.4 + 0.55 * dark); }
    ctx.restore();
    // statues build one per frame (they draw 1 to 6 cats each)
    if (wantStatue.length) { const rec = wantStatue[0]; statueFor(rec, true); }
    if (statues.size > 0) for (const [k, v] of statues) if (v._u < frame - 60) { v.width = v.height = 0; statues.delete(k); }

    // weather, foreground tufts
    const cp = caps(gfx);
    stats.particles = drawWeather(ctx, reduced ? 'clear' : clk.weather, cx, cp.weather);
    if (gfx >= 2) tufts(ctx, cx);

    // light: dark tint, dusk glow, rain dim, then additive glows
    if (gfx >= 1) {
      ctx.globalCompositeOperation = 'source-atop';
      if (dark > 0.01) { ctx.fillStyle = `rgba(18,28,96,${0.54 * dark})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      if (warm > 0.01) { ctx.fillStyle = `rgba(255,130,70,${0.2 * warm})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      if (clk.weather === 'rain' && !reduced) { ctx.fillStyle = 'rgba(60,72,104,.16)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ln; i++) {
        const r = LR[i]; ctx.globalAlpha = LA[i] * (reduced ? 1 : 0.9 + 0.1 * Math.sin(T * 9 + LX[i]));
        ctx.drawImage(glow, LX[i] - cx - r, LY[i] - cy - r, r * 2, r * 2);
      }
      stats.lights = ln;
      if (dark > 0.4 && cp.fireflies && (season === 1 || level >= 12)) {
        for (let i = 0; i < cp.fireflies; i++) {
          const x = (((RND[i * 4] * 1100 - cx * 0.9 + Math.sin(T * 0.4 + RND[i * 4 + 3] * 6) * 24) % 1100) + 1100) % 1100 - 70, y = GY - cy - 30 - RND[i * 4 + 1] * 100 + (reduced ? 0 : Math.sin(T * 0.7 + RND[i * 4 + 2] * 6) * 10);
          ctx.globalAlpha = dark * (0.2 + 0.6 * (reduced ? 0.6 : Math.max(0, Math.sin(T * 1.7 + i * 1.3)))); ctx.drawImage(glow, x - 8, y - 8, 16, 16); stats.particles++;
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // the sky goes BEHIND the finished world
    ctx.globalCompositeOperation = 'destination-over';
    const nc = cp.clouds;
    if (nc) { ctx.globalAlpha = 1 - 0.6 * dark; for (let i = 0; i < nc; i++) { const sc = 0.7 + (i % 3) * 0.12, x = (((i * 230 + (reduced ? 0 : T * (4 + i * 2.2))) % (VIEW_W + 260)) - 130) - cx * 0.04, y = 12 + ((i * 23) % 62); ctx.drawImage(cloudSpr[i % 3], x - 75 * sc, y - 20, 150 * sc, 56 * sc); } ctx.globalAlpha = 1; }
    const hr = clk.hour;
    if (dark < 0.97 && gfx >= 1) {   // sun
      const u = clamp((hr - 6) / 12, 0, 1), sx = VIEW_W * (0.08 + 0.84 * u), sy = 300 - 250 * Math.sin(Math.PI * u) - cy * 0.05;
      ctx.globalAlpha = (1 - dark) * (clk.weather === 'rain' ? 0.4 : 1); ctx.drawImage(glow, sx - 90, sy - 90, 180, 180); ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (dark > 0.05 && gfx >= 1) {   // moon with its real phase
      const u = (((hr - 18) % 24) + 24) % 24 / 12, mx = VIEW_W * (0.12 + 0.76 * clamp(u, 0, 1)), my = 320 - 250 * Math.sin(Math.PI * clamp(u, 0, 1)), r = 24;
      ctx.globalAlpha = dark; ctx.drawImage(glow, mx - 80, my - 80, 160, 160);
      ctx.fillStyle = '#4a5388'; ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
      const ph = clk.moon, k = Math.cos(ph * TAU), waxing = ph < 0.5;
      ctx.save(); ctx.translate(mx, my); if (!waxing) ctx.scale(-1, 1);
      ctx.fillStyle = '#fff4cc'; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (dark > 0.1 && cp.stars) {
      for (let i = 0; i < cp.stars; i++) {
        const x = RND[i * 4] * VIEW_W, y = RND[i * 4 + 1] * 330 - cy * 0.03, s = 0.7 + RND[i * 4 + 2] * 1.1, tw = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(T * (1.5 + RND[i * 4 + 3] * 2) + i * 2.3);
        ctx.fillStyle = `rgba(255,255,235,${dark * (0.25 + 0.7 * tw)})`; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    if (warm > 0.01 && gfx >= 1) { const g = ctx.createLinearGradient(0, 0, 0, 380); g.addColorStop(0, `rgba(90,70,160,${0.45 * warm})`); g.addColorStop(1, `rgba(255,150,90,${0.55 * warm})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (dark > 0.01) { const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, '#060a2a'); g.addColorStop(1, '#2c367c'); ctx.globalAlpha = dark; ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
    const sky = strips.get('sky', 0);
    if (sky) ctx.drawImage(sky, 0, 0, VIEW_W, VIEW_H); else { ctx.fillStyle = '#8fd3ff'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    strips.sweep();
  }

  function drawWondersLayer(ctx, cx, cy) {
    ctx.save(); ctx.translate(-cx, -cy);
    for (let i = 0; i < zw.length; i++) { const z = zw[i]; if (z.x > view0 - 140 && z.x < view1 + 140) drawWonder(ctx, z, i); }
    ctx.restore();
  }
  function require_theme(e, x) {
    const d = e.districts[districtAt(e, x)];
    return ['#8fd36e', '#d9a24a', '#5a6ab0', '#f2c94c', '#e8f4ff', '#a8e08a'][d.theme] || '#8fd36e';
  }

  const onVis = () => { if (typeof document !== 'undefined' && !document.hidden) { strips.free(); dropSprites(true); for (const v of statues.values()) v.width = v.height = 0; statues.clear(); needWarm = true; } };
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', onVis);

  return {
    draw,
    setReduced(b) { R = !!b; },
    setQuality(g) { G = clamp(g | 0, 0, 3); },
    setNow(d) { pinned = d == null ? null : new Date(d); clock = null; },
    // override the look: { season: 0..3, hour: 0..24, weather: 'clear'|'rain'|'snow'|'petals'|'leaves', moon: 0..1 }, or null to follow the clock
    setPalette(p) { palette = p || null; },
    // build everything queued, right now (call when entering the walk or after a teleport)
    warm() { needWarm = true; },
    pump(ms) { return strips.pump(ms); },
    stats() { return stats; },
    strips,
    memMB() {
      let b = strips.memMB() * MB + ready.size * 240 * 240 * 4 + glow.width * glow.height * 4;
      for (const c of cloudSpr) b += c.width * c.height * 4;
      for (const c of statues.values()) b += c.width * c.height * 4;
      return b / MB;
    },
    free() {
      freed = true; strips.free(); dropSprites(true);
      for (const v of statues.values()) v.width = v.height = 0; statues.clear();
      glow.width = glow.height = 0; for (const c of cloudSpr) c.width = c.height = 0;
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', onVis);
    },
  };
}
