// GRAFTWORK animation lab: a standalone page to LOOK at the actor animations without playing the game. No build step, plain ES modules.
// It does not re-implement the game: every pose is drawn by the game's own code.
//   map poses   ui/ward_iso.js  gait() (distance driven stride, hop, squash, lean) + drawActor() (grounding, contact shadow, the puppet walk of ui/puppet.js)
//   battle      ui/combat_art.js drawHeroSprite / drawEnemySprite / drawBackdrop (lunge, hit, block, death, auras, statuses) + ui/juice.js timing
//   rooms       ui/ward_kit_iso.js (the modular kit floor) + data/ward_kit.js recipes
//   rig         ui/rig.js + ui/rigs.js (the painted character rigs of assets/rigs: idle and the two-step walk; and the capsule placeholder)
//   frames      ui/assets.js (frames, frame, pickAtkFrame, normalizeFrames): the battle frames atk, hit, die
// The map walk has two sources, the game's two paths: `puppet` (what the game draws) and `procedural` (the hop the game falls back to when a sprite cannot be
// cut into a puppet; in the battle scenes it hides the painted frames).
// URL params: ?scene=viewer|map|battle|rig|compare &actor=marrow &anim=idle|walk|attack|hit|die &source=puppet|procedural
//   &t=1.2 (freeze at a time) &frame=2 (jump to a frame) &speed=0.5 &grid=1 &feet=1 &contact=1 &onion=1 &flip=1 &calm=1 &scale=1.5
//   map: &pace=normal|fast|wander &tod=morning|midday|evening|night   battle: &hero=marrow &enemies=a,b,c &act=1..3 &do=attack|eattack|hit|block|die|heal|status
//   compare: &actor2=wick &source2=procedural
//   rig: &who=marrow|...|placeholder &anim=idle|walk &pace=slow|game|fast &heading=flat|down|up &bones=1 &onion=1 &flip=1 &cmp=0 (the rig alone)
//   The Rig lab shows every rig of the manifest whatever the preview switch says; add ?rig=1 to see the rigs in the other scenes as the game would draw them.
import { assets } from '../ui/assets.js';
import * as CA from '../ui/combat_art.js';
import * as ISO from '../ui/ward_iso.js';
import * as KR from '../ui/ward_kit_iso.js';
import * as RIG from '../ui/rig.js';
// The figures are seen from the front: the character's own RIGHT side is on the screen's LEFT. Internal ids stay by screen side (L, R); everything shown goes through these.
const SN = RIG.sideName, SNs = (s) => String(s === undefined || s === null ? '' : s).replace(/[LR]/g, (c) => SN(c));
import * as PUP from '../ui/puppet.js';
import { rigs } from '../ui/rigs.js';
import { gaitEntry } from '../data/gaits.js';
import * as J from '../ui/juice.js';
import * as L from '../ui/combat_layout.js';
import { Fx } from '../ui/fx.js';
import { wallPlan } from '../data/ward_kit.js';
import { ENEMIES, HEROES } from '../data/index.js';
import { clamp, lerp } from '../ui/util.js';

const $ = (id) => document.getElementById(id);
const DPR = Math.min(2, window.devicePixelRatio || 1);
const Q = new URLSearchParams(location.search);
const qn = (k, d) => { const v = parseFloat(Q.get(k)); return Number.isFinite(v) ? v : d; };
const qb = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
const reducedOS = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

// ---------------- the app stub the game code expects (px, scale, frame, text) ----------------
const cv = $('cv'), g = cv.getContext('2d');
const APP = {
  px: DPR, scale: 1, frame: 0, perf: null, ctx: g,
  text(s, x, y, o = {}) { g.save(); g.font = `${o.bold ? 'bold ' : ''}${o.size || 12}px Georgia, serif`; g.textAlign = o.align || 'left'; g.fillStyle = o.color || '#fff'; g.fillText(String(s), x, y); g.restore(); },
};
assets.setBase('../assets/ward/');
assets.ensure(APP);
rigs.setBase('../assets/rigs/');
let PACE = { normal: { step: 1.1, dwell: 0.35 }, fast: { step: 0.65, dwell: 0.15 }, reduced: { step: 0.12, dwell: 0 } }; // the game's PACE (ui/ward.js), replaced below when it loads
import('../ui/ward.js').then((m) => { if (m && m.PACE) PACE = m.PACE; }).catch(() => { /* keep the copy above */ });
let ART_META = {}; // tools/graftwork_art_meta.json: the framesOk flag lives there (the build drops rejected frames from the manifest)
fetch('../../tools/graftwork_art_meta.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => { ART_META = j || {}; }).catch(() => {});

// ---------------- state ----------------
const SCENES = ['viewer', 'map', 'battle', 'rig', 'compare'];
const SCENE_LABEL = { viewer: 'Actor viewer', map: 'Map walk', battle: 'Battle', rig: 'Rig lab', compare: 'Compare' };
const ANIMS = ['idle', 'walk', 'attack', 'hit', 'die'];
const srcOf = (v, d) => (v === 'procedural' || v === 'hop' ? 'procedural' : v ? 'puppet' : d); // older links (auto, frames, swap) open the puppet walk
const ST = {
  scene: SCENES.includes(Q.get('scene')) ? Q.get('scene') : (Q.get('scene') === 'actor' ? 'viewer' : 'viewer'),
  actor: Q.get('actor') || 'marrow', anim: ANIMS.includes(Q.get('anim')) ? Q.get('anim') : 'walk', source: srcOf(Q.get('source'), 'puppet'),
  scale: qn('scale', 1), flip: qb('flip', false), grid: qb('grid', false), feet: qb('feet', true), contact: qb('contact', true), onion: qb('onion', false), calm: qb('calm', reducedOS),
  actor2: Q.get('actor2') || Q.get('actor') || 'marrow', source2: srcOf(Q.get('source2'), 'procedural'), split: qb('split', true),
  map: { actor: Q.get('actor') || 'marrow', pace: Q.get('pace') || 'normal', tod: Q.get('tod') || 'midday', zoom: qn('zoom', 1), trail: true },
  battle: { hero: Q.get('hero') || 'marrow', enemies: (Q.get('enemies') || 'gauze_mummy,bedpan_slime').split(',').filter(Boolean).slice(0, 3), act: clamp(qn('act', 1), 1, 3), status: false, aura: true, frames: true, target: 'enemies' },
  rig: { stride: 26, cadence: 2.2, knee: 0.9, bob: 2, arms: 0.5, lean: 1, joints: true, trail: true, dirty: true,
    who: Q.get('who') || 'marrow', anim: Q.get('anim') === 'idle' ? 'idle' : 'walk', pace: ['slow', 'game', 'fast'].includes(Q.get('pace')) ? Q.get('pace') : 'game', heading: ['flat', 'down', 'up'].includes(Q.get('heading')) ? Q.get('heading') : 'flat', bones: qb('bones', false), marks: qb('marks', true), cmp: qb('cmp', true) },
};
const CLK = { t: 0, abs: 0, playing: !((Q.has('t') || Q.has('frame')) && ['viewer', 'compare', 'rig'].includes(ST.scene)) && qb('play', true), speed: qn('speed', 1), loop: qb('loop', true) };
if (Q.has('t')) CLK.t = qn('t', 0);
let DT = 1 / 60;
const SPS = 3.6; // walk steps (plants) per second at speed 1x: the hero at the game's normal pace

// ---------------- UI builder (the sidebar) ----------------
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const UI = (() => {
  const root = $('ctl'); let syncs = [];
  const api = {
    reset() { root.textContent = ''; syncs = []; },
    sync() { for (const f of syncs) f(); },
    note(title, text, judge) { const d = mk('details'); d.open = innerHeight > 560; d.append(mk('summary', null, title), mk('p', null, text), mk('p', 'judge', 'What to judge: ' + judge)); root.append(d); },
    group(label) { const gg = mk('div', 'grp'); if (label) gg.append(mk('span', 'lbl', label)); const r = mk('div', 'row'); gg.append(r); root.append(gg); return r; },
    button(row, label, fn, isOn, title) { const b = mk('button', null, label); if (title) b.title = title; b.onclick = () => { fn(); api.sync(); }; if (isOn) syncs.push(() => b.classList.toggle('on', !!isOn())); row.append(b); return b; },
    toggle(row, label, get, set, title) { return api.button(row, label, () => set(!get()), get, title); },
    select(row, groups, get, set) { // groups: [{label, items:[{v,t}]}] or [{v,t}]
      const s = mk('select'), add = (parent, it) => { const o = mk('option', null, it.t); o.value = it.v; parent.append(o); };
      for (const gp of groups) { if (gp.items) { const og = mk('optgroup'); og.label = gp.label; for (const it of gp.items) add(og, it); s.append(og); } else add(s, gp); }
      s.onchange = () => { set(s.value); api.sync(); }; syncs.push(() => { s.value = get(); }); row.append(s); s.value = get(); return s;
    },
    range(parent, label, min, max, step, get, set, fmt = (v) => String(v)) {
      const w = mk('div', 'rng'), i = mk('input'), o = mk('output'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
      i.oninput = () => { set(parseFloat(i.value)); o.textContent = fmt(get()); };
      syncs.push(() => { i.value = get(); o.textContent = fmt(get()); }); o.textContent = fmt(get());
      w.append(mk('span', null, label), i, o); parent.append(w); return i;
    },
  };
  return api;
})();

// ---------------- loading, failures ----------------
const banner = $('banner');
function failures() {
  const bad = [];
  for (const [k, e] of assets.imgs) if (e.bad) bad.push(k);
  return bad;
}
let bannerExtra = '';
function updateBanner() {
  const msgs = [];
  if (assets.state === 'none') msgs.push('The Ward art manifest did not load (assets/ward/manifest.json). Actors cannot be drawn; run this page from a web server, not from a file.');
  const bad = failures();
  if (bad.length) msgs.push(bad.length + ' image file(s) failed to load, the game falls back to the standing or procedural look: ' + bad.slice(0, 4).join(', ') + (bad.length > 4 ? ' ...' : ''));
  if (assets.kitState === 'none') msgs.push('The room kit manifest did not load, rooms are drawn flat.');
  if (bannerExtra) msgs.push(bannerExtra);
  banner.style.display = msgs.length ? 'block' : 'none'; banner.textContent = msgs.join(' | ');
}
const pendingImgs = () => { let n = 0; for (const e of assets.imgs.values()) if (!e.ok && !e.bad) n++; return n; };

// ---------------- actors: manifest driven ----------------
const nameOf = (id) => (ENEMIES[id] && ENEMIES[id].name) || (HEROES[id] && HEROES[id].name) || (id.startsWith('npc_') ? id.slice(4).replace(/^./, (c) => c.toUpperCase()) : id.replace(/_/g, ' '));
function enemyDef(id, d) {
  if (ENEMIES[id]) return ENEMIES[id];
  const base = id.replace(/_l2$/, '');
  if (ENEMIES[base]) return { ...ENEMIES[base], id };
  return { id, name: nameOf(id), kind: d && d.kind === 'boss' ? 'boss' : d && d.kind === 'elite' ? 'elite' : 'normal', art: {} };
}
const metaCache = new Map();
function metaOf(id) {
  const d = assets.ready() ? assets.def('actors', id) : null;
  if (!d) return null;
  const key = id + '|' + (d.frames ? JSON.stringify(d.frames) : '');
  let m = metaCache.get(key); if (m) return m;
  const kind = d.kind || (id.startsWith('npc_') ? 'npc' : 'normal'), hero = kind === 'hero';
  const def = hero ? null : enemyDef(id, d), dk = hero ? 'hero' : def.kind || kind;
  const base = id.replace(/_l2$/, ''), lvl = /_l2$/.test(id) ? 2 : 1;
  const mapKind = hero ? 'hero' : kind === 'npc' ? 'npc' : dk === 'elite' ? 'elite' : 'monster';
  const h = hero ? 44 : kind === 'npc' ? 42 : dk === 'elite' ? (lvl >= 2 ? 46 : 42) : dk === 'boss' ? 52 : 30;
  const raw = d.frames || null, F = assets.frames(id);
  m = { id, d, kind: dk, hero, def, base, lvl, mapKind, h, raw, F, name: nameOf(id), meta: ART_META[id] || {}, tm: hero ? null : safeTiming(def) };
  metaCache.set(key, m); return m;
}
function safeTiming(def) { try { return J.atkTiming(def); } catch (e) { return null; } }
function actorGroups(filter) {
  const man = assets.ready() ? assets.manifest.actors : {}, bins = { hero: [], normal: [], elite: [], boss: [], npc: [] };
  for (const id of Object.keys(man)) {
    const m = metaOf(id); if (!m || (filter && !filter(m))) continue;
    const tags = (m.F ? (m.F.atk.length ? 'A' : '') + (m.F.hit ? 'H' : '') + (m.F.die ? 'D' : '') : '');
    (bins[m.kind] || bins.normal).push({ v: id, t: m.name + (id.endsWith('_l2') ? ' L2' : '') + (tags ? '  [' + tags.split('').join(' ') + ']' : '') });
  }
  const lab = { hero: 'Heroes', normal: 'Act 1 monsters', elite: 'Elites', boss: 'Boss', npc: 'NPCs' };
  return Object.keys(bins).filter((k) => bins[k].length).map((k) => ({ label: lab[k], items: bins[k].sort((a, b) => a.t.localeCompare(b.t)) }));
}
function warm(m) { assets.actor(m.id, APP); CA.warm(APP, [m.id]); }
function withFramesHidden(hide, fn) {
  if (!hide) return fn();
  const f = assets.frames; assets.frames = () => null;
  try { return fn(); } finally { assets.frames = f; }
}

// ---------------- image measuring (scale drift, feet offset) ----------------
const MEAS = new WeakMap();
function measure(img, def) {
  if (!img) return null;
  let v = MEAS.get(img); if (v !== undefined) return v;
  v = null;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (iw && ih) {
    try {
      const k = Math.min(1, 192 / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k)), c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); const px = x.getImageData(0, 0, w, h).data;
      let t = h, b = -1, l = w, r = -1;
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (px[(y * h * 0 + y * w + xx) * 4 + 3] > 40) { if (y < t) t = y; if (y > b) b = y; if (xx < l) l = xx; if (xx > r) r = xx; }
      if (b >= t) { const sx = def.w / w, sy = def.h / h; v = { top: t * sy, bot: (b + 1) * sy, left: l * sx, right: (r + 1) * sx, h: (b + 1 - t) * sy, w: (r + 1 - l) * sx }; }
    } catch (e) { v = null; }
  }
  MEAS.set(img, v); return v;
}

// ---------------- the clock ----------------
function tickClock(dt, m, anim) {
  if (CLK.playing) {
    const d = dt * CLK.speed; CLK.abs += d; CLK.t += d;
    const dur = durOf(m, anim);
    if (isFinite(dur) && CLK.t >= dur) { if (CLK.loop) CLK.t = CLK.t % dur; else { CLK.t = dur - 0.001; CLK.playing = false; UI.sync(); } }
  }
}
function durOf(m, anim) {
  if (!m) return Infinity;
  if (anim === 'attack') return (m.hero ? 0.5 : m.tm ? J.atkTotal(m.tm) / 1000 : 0.5) + 0.45;
  if (anim === 'hit') return (m.hero ? 0.3 : 0.4) + 0.4;
  if (anim === 'die') return (m.hero ? 1.8 : 0.85) + 0.8;
  return Infinity;
}
const E = 0.004;
// the frame boundaries of a timed animation: [{t, stem}] (stem = the painted frame that shows from t on, null = the procedural pose / standing)
function keysOf(m, anim) {
  const by = (m.F && m.F.atkBy) || {};
  if (anim === 'attack') {
    if (m.hero) return [{ t: 0, stem: by[1] || null }, { t: 0.14 + E, stem: by[2] || by[3] || by[1] || null }, { t: 0.23 + E, stem: by[3] || null }, { t: 0.5 + E, stem: null }];
    const tm = m.tm || { tell: 0, act: 200, hold: 100, rec: 200 }, a = tm.tell / 1000, b = (tm.tell + tm.act) / 1000, c = (tm.tell + tm.act + tm.hold) / 1000, d = (tm.tell + tm.act + tm.hold + tm.rec) / 1000;
    const k = [{ t: 0, stem: by[1] || null }, { t: a + E, stem: by[2] || by[3] || by[1] || null }, { t: b + E, stem: by[2] || by[3] || by[1] || null }, { t: c + E, stem: by[3] || null }, { t: d + E, stem: null }];
    return k.filter((x, i) => i === 0 || x.t > k[i - 1].t + 0.001);
  }
  if (anim === 'hit') return m.hero ? [{ t: 0, stem: m.F && m.F.hit }, { t: 0.2 + E, stem: null }] : [{ t: 0, stem: m.F && m.F.hit }, { t: 0.32 + E, stem: null }];
  if (anim === 'die') return m.hero ? [{ t: 0.02, stem: m.F && m.F.hit }, { t: 0.54 + E, stem: m.F && m.F.die }, { t: 1.7, stem: m.F && m.F.die }] : [{ t: 0.02, stem: m.F && m.F.hit }, { t: 0.289 + E, stem: m.F && m.F.die }, { t: 0.8, stem: m.F && m.F.die }];
  return [];
}
const WALK_N = 4; // the walk is stepped and onion-skinned in quarters of the two-step cycle (contact, passing, contact, passing)
function stepFrame(m, anim, dir) {
  CLK.playing = false;
  if (anim === 'walk') {
    const n = WALK_N, ph = CLK.t * SPS, k = Math.floor(ph * n / 2), nk = ((k + dir) % (n * 50) + n * 50) % (n * 50);
    CLK.t = ((nk + 0.5) * 2 / n) / SPS; return;
  }
  const ks = keysOf(m, anim); if (!ks.length) return;
  let i = ks.length - 1; for (let j = 0; j < ks.length; j++) if (ks[j].t > CLK.t + 1e-4) { i = j - 1; break; }
  const ni = (i + dir + ks.length) % ks.length; CLK.t = ks[ni].t;
}

// ---------------- sources: what the game would draw, and the override ----------------
const walkSrc = (source) => (source === 'procedural' ? 'procedural' : 'puppet');
function puppetOf(m) { const a = assets.actor(m.id, APP); return a ? PUP.infoOf(a.img, m.id) : null; }
function walkLabel(m, source) {
  if (walkSrc(source) === 'puppet') { const pe = puppetOf(m); return 'PUPPET walk (the game): ' + (pe ? pe.kind + (pe.kind === 'legged' ? ', legs split at the hip, one foot then the other' : ' gait, body only') : 'analysing the sprite'); }
  return 'procedural walk, the hop: standing frame with hop, squash and lean (what the game draws when a sprite cannot be cut into a puppet)';
}
function combatLabel(m, anim, source) {
  if (source === 'procedural') return 'procedural only (frames hidden)';
  const F = m.F, by = (F && F.atkBy) || {};
  if (anim === 'attack') { const n = [1, 2, 3].filter((i) => by[i]).length; return n === 3 ? 'painted atk1, atk2, atk3 on the attack timing' : n >= 1 ? `painted ${[1, 2, 3].filter((i) => by[i]).map((i) => 'atk' + i).join(', ')} + procedural ${by[1] ? '' : 'wind-up'}` : 'procedural lunge only (attack rig, no atk frames)'; }
  if (anim === 'hit') return F && F.hit ? 'painted hit frame during the flinch' : 'procedural flinch (flash and shake)';
  if (anim === 'die') return F && F.die ? 'painted hit, then die frame after the collapse' : 'procedural collapse';
  return '';
}

// ---------------- one actor, one pose (map space or battle space), drawn at the current origin = the feet ----------------
function newRec() { return { kind: '', id: '', x: 0, y: 0, d: 0, h: 0, flip: 1, bob: 0, sq: 1, ph: 0, lvl: 1, alpha: 1, tilt: 0, dark: 0, ring: 0, data: null, kitDrawn: false, room: null, shadow: null, stride: 0, cycle: false }; }
let SLOT_N = 0;
const newSlot = () => ({ key: 'lab' + (SLOT_N++), rec: newRec(), nx: 0, g: null, primed: false, hs: {}, ed: null });
const newPanel = (actor, source) => ({ actor, source, slots: [newSlot(), newSlot(), newSlot()] });
let GST = { t: 0, fx: { burst() {} } };
function runGait(slot, rec, anim, ph, calm, dt) {
  GST.t = CLK.abs; const sz = rec.h, S = GST;
  if (!slot.g) slot.g = ISO.gait(slot.key, rec, slot.nx, 0, 1 / 60, calm, sz, S, 0);
  if (anim === 'walk' && !calm) {
    const n = slot.primed ? 1 : 40; slot.primed = true;
    for (let i = 0; i < n; i++) { slot.g.dist = ph * sz * (slot.g.sl || ISO.STRIDE) - 0.5; slot.nx += 0.5; slot.g = ISO.gait(slot.key, rec, slot.nx, 0, 1 / 60, calm, sz, S, 0); }
  } else { slot.primed = false; slot.g = ISO.gait(slot.key, rec, slot.nx, 0, Math.max(0.001, dt), calm, sz, S, 0); }
}
function setupRec(rec, m) { rec.kind = m.mapKind; rec.id = m.base; rec.lvl = m.lvl; rec.h = m.h; rec.alpha = 1; rec.ring = 0; rec.ph = 0; }
function renderMap(gg, slot, m, anim, t, source, o) {
  const rec = slot.rec; setupRec(rec, m); rec.x = 0; rec.y = 0; rec.flip = o.flip ? -1 : 1;
  const ph = anim === 'walk' ? t * SPS : 0;
  runGait(slot, rec, anim, ph, o.calm, o.dt === undefined ? DT : o.dt);
  rec.pm = walkSrc(source) === 'puppet' ? '' : 'off'; // 'off': the game's actor draw skips the puppet, so the hop under it shows
  ISO.drawActor(APP, gg, rec, { hero: m.id });
  return { key: '_stand', space: 'map', ph, rec };
}
function stateBattle(slot, m, anim, t, calm) {
  if (m.hero) {
    const hs = slot.hs; hs.attack = 0; hs.kick = 0; hs.hit = 0; hs.dying = 0; hs.block = 0; hs.bpulse = 0; hs.t = CLK.abs; hs.reduced = calm; hs.st = {};
    if (anim === 'attack') { const u = t / 0.5; hs.attack = u < 1 ? Math.max(0.0001, u * 2) : 0; }
    else if (anim === 'hit') { hs.hit = clamp(1 - t / 0.25, 0, 1); hs.kick = clamp(1.5 * (1 - t / 0.3), 0, 1.5); }
    else if (anim === 'die') hs.dying = clamp(t / 1.8, 0, 1);
    return hs;
  }
  if (!slot.ed || slot.ed.id !== m.id) {
    const b = L.enemySlots([m.def], (d) => CA.spriteBounds(d, APP))[0];
    slot.ed = { id: m.id, scale: b.scale, w: b.w, h: b.h, st: {}, block: 0, bpulse: 0, hurt: 0, anim: { sq: 0, sqv: 0, hold: 0, hit: 0, seamLit: 0 }, atk: { phase: 'idle', k: 0 }, lunge: 0, atkTm: null, atkT: -1, atkKind: 'attack', dying: 0, phase: 0, stunT: 0 };
  }
  const ed = slot.ed; ed.anim.hit = 0; ed.dying = 0; ed.atkT = -1; ed.atk = { phase: 'idle', k: 0 }; ed.lunge = 0; ed.atkTm = null;
  if (anim === 'attack') {
    const total = m.tm ? J.atkTotal(m.tm) / 1000 : 0.5; ed.atkKind = 'attack';
    if (t < total) {
      ed.atkT = t; ed.atkTm = m.tm;
      if (m.tm) { const r = J.atkPhase(m.tm, t * 1000); ed.atk = { phase: r.phase, k: r.k }; ed.lunge = r.lunge; }
      else { const k = t / 0.5; ed.atk = { phase: k < 0.4 ? 'act' : 'rec', k: k < 0.4 ? k / 0.4 : (k - 0.4) / 0.6 }; }
    }
  } else if (anim === 'hit') ed.anim.hit = clamp(1 - t / 0.4, 0, 1);
  else if (anim === 'die') ed.dying = t > 0 ? clamp(t / 0.85, 0.0001, 1) : 0;
  return ed;
}
function renderBattle(gg, slot, m, anim, t, source, o) {
  const st = stateBattle(slot, m, anim, t, o.calm), hide = source === 'procedural';
  let key = '_stand', loading = false, sp = null, s = 1, px = 0;
  withFramesHidden(hide, () => {
    sp = CA.spriteOf(m.id, APP);
    if (!sp) { loading = true; return; }
    gg.save(); if (o.flip) gg.scale(-1, 1);
    if (m.hero) { CA.drawHeroSprite(gg, sp, 0, 0, st); key = CA.heroFrameStem(sp.frames, st) || '_stand'; s = CA.HERO_S; }
    else { const P = CA.drawEnemySprite(gg, sp, m.def, st, 0, 0, CLK.abs, { reduced: o.calm, aura: o.aura !== false }); key = CA.enemyFrameStem(sp.frames, P, st) || '_stand'; s = st.scale * CA.U * CA.kindK(m.def); px = P.dx || 0; }
    gg.restore();
  });
  return { key, space: 'battle', loading, sp, s, px, st };
}
function renderPose(gg, slot, m, anim, t, source, o) {
  return anim === 'idle' || anim === 'walk' ? renderMap(gg, slot, m, anim, t, source, o) : renderBattle(gg, slot, m, anim, t, source, o);
}

// onion skin: the same pose drawn at another time, tinted, into an offscreen copy of the canvas
let GH = null;
function ghost(gg, color, alpha, fn) {
  if (!GH || GH.width !== cv.width || GH.height !== cv.height) { GH = document.createElement('canvas'); GH.width = cv.width; GH.height = cv.height; }
  const x = GH.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, GH.width, GH.height); x.setTransform(gg.getTransform());
  fn(x);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, GH.width, GH.height); x.restore();
  gg.save(); gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalAlpha = alpha; gg.drawImage(GH, 0, 0); gg.restore();
}

// ---------------- a panel: one actor drawn in a box, with the overlays ----------------
function fitZoom(m, anim, box, slot) {
  if (anim === 'idle' || anim === 'walk') return 0.6 * box.h / (m.h * (m.d.scale || 1));
  if (m.hero) { const sp = CA.spriteOf(m.id, APP); const b = sp ? sp.bbox : [0, 20, 256, 243]; return 0.62 * box.h / ((b[3] - b[1]) * CA.HERO_S); }
  const ed = slot.ed || { h: 200 }; return 0.66 * box.h / Math.max(100, ed.h);
}
function drawPanel(P, box, o) {
  const m = metaOf(P.actor);
  if (!m) { g.fillStyle = '#a8977a'; g.font = '14px Georgia'; g.textAlign = 'center'; g.fillText(assets.state === 'none' ? 'The art manifest did not load.' : 'Loading art...', box.x + box.w / 2, box.y + box.h / 2); return null; }
  warm(m);
  const anim = o.anim, t = CLK.t, map = anim === 'idle' || anim === 'walk', slot = P.slots[0], cx = box.x + box.w / 2, fy = box.y + box.h * (map ? 0.8 : 0.84);
  if (!map) stateBattle(slot, m, anim, t, o.calm);
  const z = fitZoom(m, anim, box, slot) * ST.scale;
  g.save(); g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip();
  g.translate(cx, fy); g.scale(z, z);
  const ro = { flip: ST.flip, calm: o.calm, aura: ST.battle.aura };
  if (o.onion) {
    const n = anim === 'walk' ? WALK_N : 0, step = anim === 'walk' ? (2 / n) / SPS : 0;
    let ts = [null, null];
    if (anim === 'walk') ts = [t - step, t + step];
    else if (!map) { const ks = keysOf(m, anim); let i = 0; for (let j = 0; j < ks.length; j++) if (ks[j].t <= t + 1e-4) i = j; ts = [ks[i - 1] ? ks[i - 1].t : null, ks[i + 1] ? ks[i + 1].t : null]; }
    if (anim !== 'idle') {
      if (ts[0] !== null) ghost(g, '#4aa0ff', 0.4, (x) => renderPose(x, P.slots[1], m, anim, ts[0], P.source, ro));
      if (ts[1] !== null) ghost(g, '#ff6a4a', 0.4, (x) => renderPose(x, P.slots[2], m, anim, ts[1], P.source, ro));
    }
  }
  const info = renderPose(g, slot, m, anim, t, P.source, ro);
  g.restore();
  info.m = m; info.z = z; info.anim = anim; info.slot = slot;
  if (o.overlays !== false) overlays(info, cx, fy, z);
  return info;
}
function curImg(m, key) {
  if (key === '_stand') { const a = assets.actor(m.id, APP); return a && a.img; }
  const f = assets.frame(m.id, key, APP); return f && f.img;
}
function overlays(info, cx, fy, z) {
  const m = info.m, st = assets.actor(m.id, APP); if (!st) return;
  const d = st.def, c0 = ISO.contactOf(st) || { fx: d.anchorX || d.w / 2, fy: d.anchorY || d.h, fw: d.w * 0.4 };
  const im = curImg(m, info.key), cm = (im && ISO.contactOf({ img: im, def: d })) || c0;
  // origin = the point the game puts on the floor: the measured contact on the map, the manifest anchor in battle (enemies are mirrored there)
  const battle = info.space === 'battle', s = battle ? info.s : info.rec.h * (d.scale || 1) / d.h;
  const ax = battle ? (d.anchorX || d.w / 2) : c0.fx, ay = battle ? (d.anchorY || d.h * 0.95) : c0.fy;
  const fl = (battle && !m.hero ? -1 : 1) * (ST.flip ? -1 : 1), k = s * z;
  const W = d.w * k, H = d.h * k, gx = (c0.fx - ax) * k, gy = (c0.fy - ay) * k, fxx = (cm.fx - ax) * k, fyy = (cm.fy - ay) * k;
  g.save(); g.translate(cx, fy); g.scale(fl, 1);
  if (ST.grid) {
    g.lineWidth = 1;
    for (let i = 0; i <= d.w; i += 16) { g.strokeStyle = i % 64 === 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo((i - ax) * k, -ay * k); g.lineTo((i - ax) * k, (d.h - ay) * k); g.stroke(); }
    for (let j = 0; j <= d.h; j += 16) { g.strokeStyle = j % 64 === 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(-ax * k, (j - ay) * k); g.lineTo((d.w - ax) * k, (j - ay) * k); g.stroke(); }
  }
  if (ST.feet) {
    g.lineWidth = 1.2; g.setLineDash([6, 4]);
    g.strokeStyle = 'rgba(224,100,80,.9)'; g.beginPath(); g.moveTo(-W * 0.6, gy); g.lineTo(W * 0.6, gy); g.stroke();
    g.strokeStyle = 'rgba(90,200,230,.95)'; g.beginPath(); g.moveTo(-W * 0.6, fyy); g.lineTo(W * 0.6, fyy); g.stroke(); g.setLineDash([]);
  }
  if (ST.split && info.space === 'map' && im) {
    const pe = PUP.infoOf(st.img, m.id), an = pe && pe.an;
    if (an && an.ok && an.legs) {
      const X = (u) => (u * d.w - ax) * k, Y = (v) => (v * d.h - ay) * k, pv = an.hip - PUP.tuneFor(m.id).tuck * (an.bot - an.top);
      g.lineWidth = 1.4; g.strokeStyle = '#ffe94a'; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(X(an.left), Y(an.hip)); g.lineTo(X(an.right), Y(an.hip)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#4af0ff'; g.beginPath(); g.moveTo(X(an.valley), Y(an.hip)); g.lineTo(X(an.valley), Y(an.bot)); g.stroke();
      g.fillStyle = '#ff5ad0'; for (const px of [an.legTopL, an.legTopR]) { g.beginPath(); g.arc(X(px), Y(pv), 3, 0, 7); g.fill(); g.beginPath(); g.moveTo(X(px), Y(pv)); g.lineTo(X(px), Y(an.hip)); g.strokeStyle = '#ff5ad0'; g.stroke(); }
    }
  }
  if (ST.contact) {
    g.strokeStyle = '#ffd24a'; g.lineWidth = 1.6; const rx = Math.max(4, cm.fw * k * 0.5); g.beginPath(); g.ellipse(fxx, fyy, rx, rx * 0.35, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(fxx - 7, fyy); g.lineTo(fxx + 7, fyy); g.moveTo(fxx, fyy - 7); g.lineTo(fxx, fyy + 7); g.stroke();
  }
  g.restore();
  if (ST.feet) { g.save(); g.font = '10px Georgia'; g.textAlign = 'left'; const x0 = cx - W * 0.6 * Math.abs(fl); g.fillStyle = 'rgba(224,100,80,.95)'; g.fillText('feet line (standing contact)', x0, fy + gy - 3); g.fillStyle = 'rgba(90,200,230,.95)'; g.fillText('this frame lowest row', x0, fy + fyy + 11); g.restore(); }
  void gx;
  info.c0 = c0; info.cm = cm; info.img = im;
}

// ---------------- the filmstrip ----------------
const STRIP = { el: $('strip'), key: '', items: [], els: [], dirty: 0 };
function stripSet(key, items, onPick) {
  if (STRIP.key === key) return;
  STRIP.key = key; STRIP.items = items; STRIP.els = []; STRIP.el.textContent = ''; STRIP.el.classList.toggle('none', !items.length);
  items.forEach((it, i) => {
    const th = mk('div', 'th' + (it.wide ? ' wide' : '')), c = mk('canvas'), n = mk('div', 'n', it.name), dd = mk('div', 'd', it.sub || ' ');
    c.width = 128; c.height = 128; th.append(c, n, dd); th.onclick = () => onPick && onPick(it, i); th.title = it.title || it.name; STRIP.el.append(th); STRIP.els.push({ th, c, dd, done: false, it });
    if (it.gone) th.classList.add('gone');
  });
}
function stripPaint(m0) {
  for (const e of STRIP.els) {
    if (e.done) continue;
    const it = e.it, x = e.c.getContext('2d'); x.clearRect(0, 0, 128, 128);
    if (it.draw) { it.draw(x, 128, 128); e.done = true; continue; }
    if (!m0) continue;
    const im = it.img && it.img(); if (!im) continue;
    x.drawImage(im, 0, 0, 128, 128);
    const m = m0, st = m && assets.actor(m.id, APP), d = st && st.def, c = d && ISO.contactOf({ img: im, def: d });
    if (c) { x.strokeStyle = 'rgba(224,100,80,.9)'; x.beginPath(); x.moveTo(0, c.fy / d.h * 128); x.lineTo(128, c.fy / d.h * 128); x.stroke(); }
    const ms = d && measure(im, d), m0s = st && measure(st.img, d);
    if (ms && m0s) { const dr = (ms.h / m0s.h - 1) * 100; e.dd.textContent = (dr >= 0 ? '+' : '') + dr.toFixed(1) + '% h'; e.dd.style.color = Math.abs(dr) > 8 ? '#e0a050' : ''; }
    e.done = true;
  }
}
function stripHighlight(key) { STRIP.els.forEach((e) => e.th.classList.toggle('cur', e.it.key === key)); }
function stripItemsFor(m, anim, source) {
  const it = (name, key, img, extra) => ({ name, key, img, ...extra });
  const stand = it('standing', '_stand', () => curImg(m, '_stand'));
  if (anim === 'idle' || anim === 'walk') return [stand]; // the walk moves the standing image: the puppet cuts it, the hop bounces it
  const out = [stand];
  if (source === 'procedural') return out;
  if (anim === 'attack' && m.F) for (const st of m.F.atk) out.push(it(st.replace(m.id + '_', ''), st, () => curImg(m, st), { title: st }));
  if (anim === 'hit' && m.F && m.F.hit) out.push(it('hit', m.F.hit, () => curImg(m, m.F.hit)));
  if (anim === 'die' && m.F) { if (m.F.hit) out.push(it('hit', m.F.hit, () => curImg(m, m.F.hit))); if (m.F.die) out.push(it('die', m.F.die, () => curImg(m, m.F.die))); }
  return out;
}
function pickItem(m, anim, source, it) {
  CLK.playing = false;
  if (anim === 'walk') { const idx = Math.max(0, STRIP.items.indexOf(it)); CLK.t = ((idx + 0.5) * 2 / WALK_N) / SPS; return; }
  const ks = keysOf(m, anim), hit = ks.find((k) => k.stem && k.stem === it.key) || ks.find((k) => !k.stem);
  if (hit) CLK.t = hit.t;
}

// ---------------- readout ----------------
const READ = $('read');
let readT = 0;
const SMALLV = () => innerHeight < 560;
const SKIP_SMALL = new Set(['actor', 'image', 'contact', 'pace', 'shadow', 'clock', 'rig', 'reach', 'body']);
function setRead(rows) {
  READ.textContent = '';
  if (SMALLV()) rows = rows.filter((r) => typeof r === 'string' || !SKIP_SMALL.has(r[0]));
  for (const r of rows) { const d = mk('div'); if (typeof r === 'string') d.textContent = r; else { const k = mk('span', 'k', r[0] + ' '); const v = mk('span', r[2] || null, r[1]); d.append(k, v); } READ.append(d); }
}
function flagRows(m) {
  const metaFO = m.meta.framesOk;
  return [['flags', `framesOk ${metaFO === false ? 'false (battle frames rejected)' : m.raw ? 'true' : 'n/a'}`, metaFO === false ? 'warn' : null]];
}
function gaitRows(m, info) {
  const a = assets.actor(m.id, APP), pe = a && PUP.infoOf(a.img, m.id), rows = [];
  if (!pe) return [['gait', 'not analysed yet (or no readable pixels)', 'warn']];
  const e = gaitEntry(m.id), how = e && e.gait ? 'table' : 'auto';
  rows.push(['gait', `${pe.kind} (${how})`, 'good']);
  if (pe.kind === 'legged' && pe.an) { const an = pe.an; rows.push(['split', `hip ${(an.hip * 100).toFixed(0)}% valley ${(an.valley * 100).toFixed(0)}% legs ${(an.legH * 100).toFixed(0)}% of height${an.manual ? ' (set by hand)' : ''}`, an.manual ? 'warn' : null]); }
  else if (pe.an && !pe.an.legs) rows.push(['split', 'no legs: ' + (pe.an.reason || 'none'), null]);
  const pp = info.rec && info.rec.pp; if (pp) rows.push(['pose', `bob ${(pp.down * 100).toFixed(1)}%  sway ${(pp.sway * 100).toFixed(1)}%  lean ${pp.lean.toFixed(3)}  squash ${pp.sq.toFixed(3)}  lift L ${(pp.footLy * 100).toFixed(1)}% R ${(pp.footRy * 100).toFixed(1)}%`]);
  return rows;
}
function viewerRead(info, P, anim) {
  const m = info.m, rows = [];
  rows.push(['actor', `${m.name} (${m.id}), ${m.kind}`]);
  rows.push(['source', anim === 'walk' ? walkLabel(m, P.source) : anim === 'idle' ? 'standing frame, breathing from the gait (idle)' : combatLabel(m, anim, P.source), P.source === 'puppet' ? 'good' : 'warn']);
  rows.push(...flagRows(m));
  if (anim === 'walk' || anim === 'idle') rows.push(...gaitRows(m, info));
  const key = info.key, im = info.img, d = m.d;
  rows.push(['frame', key === '_stand' ? 'standing (' + m.id + ')' : key]);
  if (im && d) {
    rows.push(['image', `${im.naturalWidth || im.width}x${im.naturalHeight || im.height} px, canvas ${d.w}x${d.h}`]);
    const st = assets.actor(m.id, APP), ms = measure(im, d), m0 = st && measure(st.img, d);
    if (ms && m0) {
      const dr = (ms.h / m0.h - 1) * 100, dw = (ms.w / m0.w - 1) * 100;
      rows.push(['scale drift', `height ${dr >= 0 ? '+' : ''}${dr.toFixed(1)}%, width ${dw >= 0 ? '+' : ''}${dw.toFixed(1)}% vs standing`, Math.abs(dr) > 8 ? 'warn' : 'good']);
    }
    if (info.cm && info.c0) {
      const fx = info.cm.fx - info.c0.fx, fy = info.cm.fy - info.c0.fy;
      rows.push(['feet offset', `dx ${fx >= 0 ? '+' : ''}${fx.toFixed(1)}  dy ${fy >= 0 ? '+' : ''}${fy.toFixed(1)} sprite px`, Math.abs(fy) > 6 || Math.abs(fx) > 10 ? 'warn' : 'good']);
      rows.push(['contact', `(${info.cm.fx.toFixed(1)}, ${info.cm.fy.toFixed(1)}) width ${info.cm.fw.toFixed(0)}, anchor (${d.anchorX}, ${d.anchorY})`]);
    }
  } else rows.push(['image', 'not decoded yet', 'warn']);
  if (anim === 'walk' && info.space === 'map') {
    const ph = info.ph, pp = info.rec && info.rec.pp;
    if (walkSrc(P.source) === 'puppet') rows.push(['stride', pp ? `${info.rec.stride.toFixed(2)} steps, plant ${pp.plant || '-'} (read from the pose), step length ${(pp.stride * 100).toFixed(0)}% of height` : `${info.rec.stride.toFixed(2)} steps, no puppet pose`]);
    else rows.push(['stride', `${ph.toFixed(2)} plants, foot ${SN(Math.floor(ph) % 2 === 0 ? 'L' : 'R')} planted (the hop has no feet: it lands on every plant)`]);
  } else if (anim !== 'idle') rows.push(['time', `${CLK.t.toFixed(2)} s of ${durOf(m, anim).toFixed(2)} s`]);
  setRead(rows);
}

// ---------------- scene: Actor viewer ----------------
function actorSelect(row, get, set, filter) { return UI.select(row, actorGroups(filter), get, set); }
function transport(row, getM) {
  UI.button(row, '◀', () => { const m = getM(); if (m) stepFrame(m, ST.anim, -1); }, null, 'Previous frame (,)');
  UI.button(row, 'Play', () => { CLK.playing = !CLK.playing; }, () => CLK.playing, 'Play or pause (space)');
  UI.button(row, '▶', () => { const m = getM(); if (m) stepFrame(m, ST.anim, 1); }, null, 'Next frame (.)');
}
function animButtons(row) { for (const a of ANIMS) UI.button(row, a[0].toUpperCase() + a.slice(1), () => { ST.anim = a; CLK.t = 0; }, () => ST.anim === a); }
function sourceSelect(row, get, set) { return UI.select(row, [{ v: 'puppet', t: 'Source: Puppet walk (the game)' }, { v: 'procedural', t: 'Source: hop, procedural only' }], get, set); }
function commonControls() {
  const r = UI.group('Playback'); transport(r, () => metaOf(ST.scene === 'viewer' ? ST.actor : ST.actor));
  const r2 = UI.group(); UI.toggle(r2, 'Loop', () => CLK.loop, (v) => { CLK.loop = v; });
  UI.range(UI.group(), 'Speed', 0.1, 2, 0.05, () => CLK.speed, (v) => { CLK.speed = v; }, (v) => v.toFixed(2) + 'x');
  const o = UI.group('Overlays');
  UI.toggle(o, 'Grid', () => ST.grid, (v) => { ST.grid = v; }); UI.toggle(o, 'Feet line', () => ST.feet, (v) => { ST.feet = v; }); UI.toggle(o, 'Contact', () => ST.contact, (v) => { ST.contact = v; });
  UI.toggle(o, 'Leg split', () => ST.split, (v) => { ST.split = v; }, 'Yellow: hip line, cyan: split column, pink: leg pivots (virtual hips)'); UI.toggle(o, 'Onion skin', () => ST.onion, (v) => { ST.onion = v; }, 'Blue = previous frame, orange = next frame'); UI.toggle(o, 'Flip', () => ST.flip, (v) => { ST.flip = v; }); UI.toggle(o, 'Reduced motion', () => ST.calm, (v) => { ST.calm = v; });
  puppetControls();
  UI.range(UI.group(), 'Scale', 0.5, 2.5, 0.05, () => ST.scale, (v) => { ST.scale = v; }, (v) => v.toFixed(2) + 'x');
}
function puppetControls() {
  const T = PUP.TUNE, D = PUP.TUNE_DEFAULT, r = UI.group('Puppet walk');
  UI.range(r, 'Leg swing', 5, 40, 1, () => T.swing, (v) => { T.swing = v; }, (v) => v.toFixed(0) + '\u00b0');
  UI.range(r, 'Tuck/overlap', 0, 0.3, 0.01, () => T.tuck, (v) => { T.tuck = v; }, (v) => (v * 100).toFixed(0) + '%'); // how far the leg runs up under the garment (figure heights); parts are rebuilt per value
  UI.range(r, 'Garment sway', 0, 2, 0.05, () => T.garment, (v) => { T.garment = v; }, (v) => v.toFixed(2) + 'x'); // the hem band: shear, lift and lag behind the legs
  UI.range(r, 'Stride cap', 0.2, 0.6, 0.01, () => T.strideMax, (v) => { T.strideMax = v; }, (v) => (v * 100).toFixed(0) + '%');
  UI.toggle(r, 'Leg outlines', () => PUP.DEBUG.outlines, (v) => { PUP.DEBUG.outlines = v; }, 'Cyan: the hidden extension under the garment, yellow: the shin, orange: the boot (never scaled), magenta: the hem band and the hip pivot');
  UI.range(r, 'Lift', 0.02, 0.2, 0.005, () => T.lift, (v) => { T.lift = v; }, (v) => (v * 100).toFixed(1) + '%');
  UI.range(r, 'Bob', 0, 0.08, 0.002, () => T.bob, (v) => { T.bob = v; }, (v) => (v * 100).toFixed(1) + '%');
  UI.range(r, 'Sway', 0, 0.05, 0.002, () => T.sway, (v) => { T.sway = v; }, (v) => (v * 100).toFixed(1) + '%');
  UI.range(r, 'Lean', 0, 0.15, 0.005, () => T.lean, (v) => { T.lean = v; }, (v) => v.toFixed(3));
  UI.range(r, 'Twist', 0, 0.12, 0.005, () => T.twist, (v) => { T.twist = v; }, (v) => v.toFixed(3));
  UI.button(r, 'Reset puppet', () => { Object.assign(T, D); });
}
// the L / R planted-foot panel and the foot-slide meter, driven by the REAL pose the game code just computed (rec.pp), never by a timer
const SLIDE = { x: { L: 0, R: 0 }, t: 0, key: '', max: 0, cur: 0, walk: 0, d0: 0, hold: 0 };
function plantPanel(rec, label) {
  const pl = $('plant'); pl.style.display = 'flex';
  if (!pl.firstChild) { pl.append(mk('div', 'pad', SN('L')), mk('div', 'pad', SN('R')), mk('div', 'txt')); }
  const pads = pl.children, pp = rec && rec.pp, Hw = rec && rec.pHw;
  pads[0].classList.toggle('lit', !!(pp && pp.plantL)); pads[1].classList.toggle('lit', !!(pp && pp.plantR));
  pads[2].style.whiteSpace = 'pre';
  if (!pp || !Hw) { pads[2].textContent = (label || '') + '\nno puppet pose (the hop, or idle)'; SLIDE.key = ''; return null; }
  // the foot position along the path in world px: distance walked + the foot offset; speed of the planted foot = its change per simulated second
  const dt = Math.max(1e-4, CLK.playing ? DT * CLK.speed : 0), key = rec.gk, dist = rec.dist;
  const fxL = dist + pp.footLx * Hw, fxR = dist + pp.footRx * Hw;
  if (SLIDE.key === key && CLK.playing && pp.w >= 0.97 && (dist - SLIDE.d0) / dt > 20) { // steady walking only: the start and the stop blend the feet to the idle pose
    const wk = (dist - SLIDE.d0) / dt; let sl = 0; if (pp.plantL && !pp.plantR) sl = Math.abs((fxL - SLIDE.x.L) / dt); else if (pp.plantR && !pp.plantL) sl = Math.abs((fxR - SLIDE.x.R) / dt); else if (pp.plantL && pp.plantR) sl = Math.max(0, Math.min(Math.abs((fxL - SLIDE.x.L) / dt), Math.abs((fxR - SLIDE.x.R) / dt)));
    SLIDE.cur = sl; SLIDE.walk = wk; SLIDE.max = Math.max(SLIDE.max * 0.985, sl);
  }
  SLIDE.key = key; SLIDE.x.L = fxL; SLIDE.x.R = fxR; SLIDE.d0 = dist;
  pads[2].textContent = `${label || 'puppet'}  plant ${SNs(pp.plant) || '-'}  lead ${SN(pp.lead)}\nfoot slide ${SLIDE.cur.toFixed(1)} px/s (peak ${SLIDE.max.toFixed(1)})\nwalking speed ${SLIDE.walk.toFixed(0)} px/s${pp.w < 0.97 ? ' (starting or stopping)' : ''}`;
  return SLIDE;
}
const viewerP = { P: null };
const getP = (id, src) => { if (!viewerP.P || viewerP.P.actor !== id) viewerP.P = newPanel(id, src); viewerP.P.source = src; return viewerP.P; };
const SC = {};
SC.viewer = {
  build() {
    UI.reset();
    UI.note('Actor viewer', 'One actor, one animation, drawn by the same code paths as the game. Idle and Walk use the map actor draw and gait (stride tied to distance). Attack, Hit and Die use the battle sprite draw and the battle timings.',
      'Does each frame stand on the same feet line? Does the walk read as one foot forward, then the other? Is the scale steady from frame to frame (scale drift near 0)? Does the attack wind up, strike, recover?');
    actorSelect(UI.group('Actor'), () => ST.actor, (v) => { ST.actor = v; viewerP.P = null; CLK.t = 0; });
    animButtons(UI.group('Animation'));
    sourceSelect(UI.group(), () => ST.source, (v) => { ST.source = v; });
    commonControls();
  },
  draw(w, h) {
    const P = getP(ST.actor, ST.source), box = { x: 0, y: 0, w, h }, m = metaOf(ST.actor);
    if (m) tickClock(DT, m, ST.anim);
    const info = drawPanel(P, box, { anim: ST.anim, calm: ST.calm, onion: ST.onion });
    if (!info) { setRead([]); return; }
    stripSet(`${m.id}|${ST.anim}|${ST.source}`, stripItemsFor(m, ST.anim, ST.source), (it) => pickItem(m, ST.anim, ST.source, it));
    stripHighlight(info.key);
    if (ST.anim === 'walk' && info.space === 'map') plantPanel(info.slot.rec, 'viewer'); else { $('plant').style.display = 'none'; SLIDE.key = ''; }
    if (performance.now() - readT > 90) { readT = performance.now(); viewerRead(info, P, ST.anim); }
    if (info.loading) { g.fillStyle = '#a8977a'; g.font = '14px Georgia'; g.textAlign = 'center'; g.fillText('Decoding the battle sprite...', w / 2, h / 2); }
  },
};

// ---------------- scene: Compare ----------------
const cmpP = { A: null, B: null };
SC.compare = {
  build() {
    UI.reset();
    UI.note('Compare', 'Two actors, or one actor with its two walks, drawn side by side on the same clock. Left defaults to the puppet walk the game draws, right to the hop it falls back to for the same actor.',
      'Do the puppet steps land on the same beat as the hop? Which side reads as walking? Does the painted attack feel longer or shorter than the procedural lunge?');
    const pr = UI.group('Presets');
    UI.button(pr, 'Puppet vs hop', () => { ST.actor2 = ST.actor; ST.source = 'puppet'; ST.source2 = 'procedural'; cmpP.A = cmpP.B = null; });
    UI.button(pr, 'Hero vs hero', () => { ST.actor = 'marrow'; ST.actor2 = 'wick'; ST.source = 'puppet'; ST.source2 = 'puppet'; cmpP.A = cmpP.B = null; });
    animButtons(UI.group('Animation'));
    const a = UI.group('Left'); actorSelect(a, () => ST.actor, (v) => { ST.actor = v; cmpP.A = null; }); sourceSelect(a, () => ST.source, (v) => { ST.source = v; });
    const b = UI.group('Right'); actorSelect(b, () => ST.actor2, (v) => { ST.actor2 = v; cmpP.B = null; }); sourceSelect(b, () => ST.source2, (v) => { ST.source2 = v; });
    commonControls();
  },
  draw(w, h) {
    if (!cmpP.A || cmpP.A.actor !== ST.actor) cmpP.A = newPanel(ST.actor, ST.source); if (!cmpP.B || cmpP.B.actor !== ST.actor2) cmpP.B = newPanel(ST.actor2, ST.source2);
    cmpP.A.source = ST.source; cmpP.B.source = ST.source2;
    const mA = metaOf(ST.actor), mB = metaOf(ST.actor2); if (mA) tickClock(DT, mA, ST.anim);
    const hw = w / 2, rows = [], col = ['#4aa0ff', '#ff6a4a'];
    [[cmpP.A, 0, mA], [cmpP.B, 1, mB]].forEach(([P, i, m]) => {
      const info = drawPanel(P, { x: i * hw, y: 26, w: hw, h: h - 26 }, { anim: ST.anim, calm: ST.calm, onion: ST.onion });
      g.fillStyle = 'rgba(18,13,10,.8)'; g.fillRect(i * hw, 0, hw, 24); g.fillStyle = '#eadfc6'; g.font = '12px Georgia'; g.textAlign = 'left';
      if (m && info) {
        const src = ST.anim === 'walk' ? walkLabel(m, P.source) : ST.anim === 'idle' ? 'standing' : combatLabel(m, ST.anim, P.source);
        g.fillText(`${i ? 'Right' : 'Left'}: ${m.name}, ${src}`.slice(0, Math.floor(hw / 6.4)), i * hw + 8, 16);
        rows.push([i ? 'right' : 'left', `${info.key === '_stand' ? 'standing' : info.key}` + (info.ph !== undefined ? `, stride ${info.ph.toFixed(2)}` : ''), null]);
      }
    });
    g.strokeStyle = '#4a3624'; g.beginPath(); g.moveTo(hw, 0); g.lineTo(hw, h); g.stroke();
    if (ST.anim === 'walk') plantPanel(cmpP.A.slots[0].rec, 'left'); else { $('plant').style.display = 'none'; }
    void col;
    if (performance.now() - readT > 90) { readT = performance.now(); setRead([['clock', `${CLK.t.toFixed(2)} s, ${CLK.speed.toFixed(2)}x, ${ST.anim}`], ...rows]); }
    STRIP.key = ''; STRIP.el.classList.add('none');
  },
};

// ---------------- scene: Map walk ----------------
const MAPR = [{ id: 'a', type: 'rm_ward', x: 0, y: 0 }, { id: 'b', type: 'rm_corridor', x: 1, y: 0 }, { id: 'c', type: 'rm_dispensary', x: 1, y: 1 }];
const MAPLINK = [['a', 'b'], ['b', 'c']];
const MAPNB = {}; for (const [a, b] of MAPLINK) { (MAPNB[a] = MAPNB[a] || []).push(b); (MAPNB[b] = MAPNB[b] || []).push(a); }
const MP = { rcs: null, plan: null, poly: null, k: 0, dir: 1, wait: 0.5, slot: null, actor: '', plants: { n: 0, L: 0, R: 0, last: -1, skips: 0, lit: 0 }, prints: [], tries: 0, flat: false };
const topOf = (r) => ({ x: (r.x - r.y) * KR.HW, y: (r.x + r.y) * KR.HH });
function mapInit() {
  if (MP.rcs) return true;
  if (!assets.kitReady()) return false;
  if (MP.tries++ % 10 !== 0 && MP.tries > 1) return false;
  const rcs = {}; let n = 0;
  for (const r of MAPR) { const rc = KR.recipeFor(r.type, APP); if (rc) { rcs[r.id] = rc; n++; } }
  if (n < MAPR.length) return false;
  MP.rcs = rcs;
  MP.plan = wallPlan(MAPR, (id) => MAPNB[id] || [], (x, y) => { const f = MAPR.find((r) => r.x === x && r.y === y); return f ? f.id : null; });
  const info = (gx, gy) => { const r = MAPR.find((q) => q.x === Math.floor(gx / 4) && q.y === Math.floor(gy / 4)); if (!r) return null; return { room: true, solid: !!rcs[r.id].occ[gx - r.x * 4][gy - r.y * 4], rid: r.id }; };
  const st = (r) => [r.x * 4 + rcs[r.id].stand[0], r.y * 4 + rcs[r.id].stand[1]], ex = (r) => [r.x * 4 + rcs[r.id].stand[0] + 0.5, r.y * 4 + rcs[r.id].stand[1] + 0.5];
  let poly = [ex(MAPR[0])];
  for (let i = 0; i < MAPR.length - 1; i++) {
    const A = MAPR[i], B = MAPR[i + 1], cells = KR.heroPolyline('animlab:' + A.id + '>' + B.id, st(A), st(B), info);
    if (cells) poly = poly.concat(cells.slice(1)); else poly.push(ex(B));
    poly.push(ex(B));
  }
  MP.poly = poly; return true;
}
const mapSpeed = () => { const p = ST.calm ? 'reduced' : ST.map.pace; if (p === 'wander') return 16; const pc = PACE[p] || PACE.normal; return KR.worldLen(4, 0) / pc.step; };
const mapLayoutBounds = () => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of MAPR) { const T = topOf(r), rc = MP.rcs && MP.rcs[r.id], EX = rc ? KR.extentOf(rc) : { x0: -KR.HW - 5, y0: -62, x1: KR.HW + 5, y1: KR.TH + 12 }; x0 = Math.min(x0, T.x + EX.x0); y0 = Math.min(y0, T.y + EX.y0); x1 = Math.max(x1, T.x + EX.x1); y1 = Math.max(y1, T.y + EX.y1); }
  return { x0, y0, x1, y1 };
};
SC.map = {
  build() {
    UI.reset();
    UI.note('Map walk', 'A small isometric kit floor (ward, corridor, dispensary, joined by doors). The chosen actor walks the room to room route with the Ward\'s own stride logic: stride tied to distance, the puppet walk (or the hop, squash and lean under it) and the grounding shadow.',
      'Does each foot plant read as one foot forward, then the other? Does the shadow stay flat on the floor? Does the figure slide or float? Does the pace feel right for the room size?');
    actorSelect(UI.group('Actor'), () => ST.map.actor, (v) => { ST.map.actor = v; MP.slot = null; });
    const p = UI.group('Pace (the game\'s PACE)');
    for (const k of ['normal', 'fast', 'wander']) UI.button(p, k[0].toUpperCase() + k.slice(1), () => { ST.map.pace = k; }, () => ST.map.pace === k, k === 'wander' ? 'Monster wander speed' : 'Hero walk pace');
    const t = UI.group('Time of day'); for (const k of ['morning', 'midday', 'evening', 'night']) UI.button(t, k[0].toUpperCase() + k.slice(1), () => { ST.map.tod = k; }, () => ST.map.tod === k);
    sourceSelect(UI.group(), () => ST.source, (v) => { ST.source = v; });
    const o = UI.group('View'); UI.toggle(o, 'Reduced motion', () => ST.calm, (v) => { ST.calm = v; }); UI.toggle(o, 'Footprints', () => ST.map.trail, (v) => { ST.map.trail = v; });
    UI.button(o, 'Restart', () => { MP.k = 0; MP.dir = 1; MP.wait = 0.4; MP.plants.n = MP.plants.L = MP.plants.R = MP.plants.skips = 0; MP.prints.length = 0; });
    UI.range(UI.group(), 'Zoom', 0.6, 2.2, 0.05, () => ST.map.zoom, (v) => { ST.map.zoom = v; }, (v) => v.toFixed(2) + 'x');
    UI.range(UI.group(), 'Speed', 0.1, 2, 0.05, () => CLK.speed, (v) => { CLK.speed = v; }, (v) => v.toFixed(2) + 'x');
    UI.toggle(UI.group(), 'Play', () => CLK.playing, (v) => { CLK.playing = v; });
  },
  draw(w, h) {
    g.fillStyle = '#17110c'; g.fillRect(0, 0, w, h);
    const m = metaOf(ST.map.actor); if (!m) { setRead([]); return; }
    warm(m);
    const ok = mapInit();
    if (!ok && assets.kitState === 'none') bannerExtra = 'The room kit could not load, so the floor is drawn flat.'; else bannerExtra = '';
    const dt = CLK.playing ? DT * CLK.speed : 0; if (CLK.playing) CLK.abs += dt;
    // camera
    const b = mapLayoutBounds(), bw = b.x1 - b.x0, bh = b.y1 - b.y0, z = Math.min(w / bw, h / bh) * 0.9 * ST.map.zoom, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    g.save(); g.translate(w / 2, h / 2); g.scale(z, z); g.translate(-cx, -cy);
    const mode = KR.wallModeFor(MAPR.length);
    for (const r of MAPR.slice().sort((p, q) => (p.x + p.y) - (q.x + q.y) || p.x - q.x)) {
      const T = topOf(r), rc = MP.rcs && MP.rcs[r.id];
      if (!rc) { g.fillStyle = '#3a2c20'; g.beginPath(); g.moveTo(T.x, T.y); g.lineTo(T.x + KR.HW, T.y + KR.HH); g.lineTo(T.x, T.y + KR.TH); g.lineTo(T.x - KR.HW, T.y + KR.HH); g.closePath(); g.fill(); g.strokeStyle = '#6a4a2a'; g.stroke(); continue; }
      const pl = MP.plan.get(r.id), hs = KR.wallHeights('animlab:' + r.id, pl, mode, 0, dt, true);
      const info = { key: rc.key, HL: hs.HL, HR: hs.HR, doorL: pl.L, doorR: pl.R, slabL: pl.slabL, slabR: pl.slabR, dark: false };
      KR.drawStatic(APP, g, 'animlab:' + r.id, rc, T.x, T.y, info, z * DPR);
      KR.drawItems(APP, g, rc, T.x, T.y, 0, [], { dark: false, calm: ST.calm, t: CLK.abs, glow: [], actor: () => {} });
    }
    // the walker
    if (!MP.slot || MP.actor !== m.id) { MP.slot = newSlot(); MP.actor = m.id; MP.prints.length = 0; MP.plants.n = MP.plants.L = MP.plants.R = MP.plants.skips = 0; MP.plants.last = -1; }
    const slot = MP.slot, rec = slot.rec; setupRec(rec, m);
    let moving = false;
    if (MP.poly) {
      const L = KR.alongPolyline(MP.poly, 1).length || 1;
      if (MP.wait > 0) MP.wait -= dt; else { MP.k += MP.dir * mapSpeed() * dt / L; moving = !ST.calm || true; if (MP.k >= 1 || MP.k <= 0) { MP.k = clamp(MP.k, 0, 1); MP.dir *= -1; MP.wait = 0.9; moving = false; } }
      const q = KR.alongPolyline(MP.poly, MP.k), p = KR.subPt(q.gu, q.gv); rec.x = p.x; rec.y = p.y;
      const dx = (q.du - q.dv) * MP.dir; if (Math.abs(dx) > 0.02) slot.face = dx > 0 ? 1 : -1;
    } else { const T = topOf(MAPR[0]); rec.x = T.x; rec.y = T.y + KR.HH; }
    slot.fv = slot.fv === undefined ? 1 : slot.fv; const face = slot.face || 1; slot.fv += (face - slot.fv) * (ST.calm ? 1 : Math.min(1, dt * 18)); if (Math.abs(slot.fv - face) < 0.02) slot.fv = face; rec.flip = ST.flip ? -slot.fv : slot.fv;
    GST.t = CLK.abs;
    slot.g = ISO.gait(slot.key, rec, rec.x, rec.y, Math.max(0.0001, dt), ST.calm, rec.h, GST, 0);
    if (!moving) { /* gait decides rest by speed */ }
    // footprints: one per plant
    const P = MP.plants;
    if (rec.cycle && !ST.calm) {
      const s = Math.floor(rec.stride + 1e-9);
      if (s !== P.last) { if (P.last >= 0 && s - P.last !== 1 && s > P.last) P.skips++; P.last = s; P.n++; const foot = s % 2 === 0 ? 'L' : 'R'; P[foot]++; P.lit = foot; P.litT = CLK.abs; MP.prints.push({ x: rec.x + (foot === 'L' ? -2.2 : 2.2), y: rec.y, t: CLK.abs, foot }); if (MP.prints.length > 24) MP.prints.shift(); }
    } else if (!rec.cycle) P.last = Math.floor(rec.stride + 1e-9) - 0;
    if (ST.map.trail) for (const f of MP.prints) { const a = clamp(1 - (CLK.abs - f.t) / 3, 0, 1) * 0.65; if (a <= 0) continue; g.fillStyle = f.foot === 'L' ? `rgba(90,170,255,${a})` : `rgba(255,150,70,${a})`; g.beginPath(); g.ellipse(f.x, f.y, 2.4, 1.2, 0, 0, 7); g.fill(); }
    rec.pm = walkSrc(ST.source) === 'puppet' ? '' : 'off';
    ISO.drawActor(APP, g, rec, { hero: m.id });
    g.restore();
    // time of day: a multiply tint like the Ward's light pass
    const ls = ISO.lightState(ST.map.tod);
    if (ls.a > 0.01) { g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = ls.a; g.fillStyle = `rgb(${Math.round(ls.r)},${Math.round(ls.g)},${Math.round(ls.b)})`; g.fillRect(0, 0, w, h); g.restore(); }
    // indicators
    if (rec.pp) plantPanel(rec, 'map');
    else {
      const pl = $('plant'); pl.style.display = 'flex'; if (!pl.firstChild) { pl.append(mk('div', 'pad', SN('L')), mk('div', 'pad', SN('R')), mk('div', 'txt')); }
      const pads = pl.children; pads[0].classList.toggle('lit', P.lit === 'L' && CLK.abs - (P.litT || 0) < 0.18); pads[1].classList.toggle('lit', P.lit === 'R' && CLK.abs - (P.litT || 0) < 0.18);
      pads[2].textContent = `plants ${P.n}  (L ${P.L} / R ${P.R})\nalternation breaks ${P.skips}\n${rec.cycle ? 'hopping' : 'standing'}`; pads[2].style.whiteSpace = 'pre';
    }
    if (performance.now() - readT > 90) {
      readT = performance.now();
      setRead([['actor', `${m.name} (${m.id}), h ${rec.h} world px`], ['walk source', walkLabel(m, ST.source), ST.source === 'puppet' ? 'good' : 'warn'], ...flagRows(m),
        ['pace', `${ST.calm ? 'reduced' : ST.map.pace}, ${mapSpeed().toFixed(0)} world px/s, stride ${(rec.h * ISO.STRIDE).toFixed(0)} px`], ...gaitRows(m, { rec }),
        ['gait', `stride ${rec.stride.toFixed(2)}  bob ${rec.bob.toFixed(2)}  squash ${rec.sq.toFixed(3)}  lean ${rec.tilt.toFixed(3)}`], ['shadow', rec.shadow ? `rx ${rec.shadow.rx.toFixed(1)} alpha ${rec.shadow.a.toFixed(2)}, flat on the floor` : '-']]);
    }
    STRIP.key = ''; STRIP.el.classList.add('none');
  },
  leave() { $('plant').style.display = 'none'; },
};

// ---------------- scene: Battle ----------------
const BT = { fx: new Fx(), hs: null, eds: [], key: '', t: 0, hitDone: false, bdFail: 0, pend: [] };
const VIEW = { x: 30, y: 60, w: 1220, h: 450 };
const stNames = { poison: 3, burn: 2, vulnerable: 2, weak: 1 };
function btBuild() {
  const B = ST.battle, key = B.hero + '|' + B.enemies.join(',') + '|' + B.act;
  if (BT.key === key && BT.hs) return;
  BT.key = key; BT.hs = { attack: 0, kick: 0, hit: 0, block: 0, bpulse: 0, dying: 0, dyingOn: false, st: {}, reduced: false, t: 0 };
  const defs = B.enemies.map((id) => { const d = assets.def('actors', id); return enemyDef(id, d); });
  const slots = L.enemySlots(defs, (d) => CA.spriteBounds(d, APP));
  BT.eds = defs.map((def, i) => ({ id: def.id, def, x: slots[i].x, scale: slots[i].scale, w: slots[i].w, h: slots[i].h, st: {}, block: 0, bpulse: 0, hurt: 0, anim: { sq: 0, sqv: 0, hold: 0, hit: 0, seamLit: 0 }, atk: { phase: 'idle', k: 0 }, lunge: 0, atkTm: null, atkT: -1, atkKind: 'attack', dying: 0, dyingOn: false, phase: i * 1.7, stunT: 0, pendingAtk: -1, melee: false, impact: false }));
  if (B.status) btStatus(true);
}
function btStatus(on) { BT.hs.st = on ? { poison: 2, burn: 2 } : {}; BT.eds.forEach((e, i) => { e.st = on ? { ...stNames } : {}; e.stunT = on && i === 0 ? 99 : 0; }); }
const btTargets = () => (ST.battle.target === 'hero' ? 'hero' : 'enemies');
function btAct(what) {
  btBuild();
  const hs = BT.hs, fx = BT.fx, F = ST.battle;
  if (what === 'attack') { if (hs.dyingOn) return; hs.attack = 0.0001; BT.hitDone = false; }
  else if (what === 'eattack') BT.eds.forEach((e, i) => { if (!e.dyingOn) e.pendingAtk = i * 0.35; });
  else if (what === 'hit') { if (btTargets() === 'hero') { hs.hit = 1; hs.kick = 1.5; fx.burst(L.HERO_X, L.FOOT_Y - 110, 'spark', { n: 10 }); } else BT.eds.forEach((e) => { if (!e.dyingOn) { e.anim.hit = 1; e.hurt = 0.6; fx.burst(e.x, L.ENEMY_FOOT - e.h * 0.5, 'spark', { n: 10 }); } }); }
  else if (what === 'block') { if (btTargets() === 'hero') { hs.block = hs.block > 0 ? 0 : 12; hs.bpulse = 1; } else BT.eds.forEach((e) => { e.block = e.block > 0 ? 0 : 10; e.bpulse = 1; }); }
  else if (what === 'die') { if (btTargets() === 'hero') { hs.dyingOn = true; if (!(hs.dying > 0)) hs.dying = 0.0001; } else BT.eds.forEach((e) => { e.dyingOn = true; if (!(e.dying > 0)) e.dying = 0.0001; }); }
  else if (what === 'heal') { fx.burst(L.HERO_X, L.FOOT_Y - 100, 'heal', { n: 18, colors: ['#7fcf8a', '#e8f2a0'], gravity: -90, speed: 70 }); fx.ring(L.HERO_X, L.FOOT_Y - 20, '#7fcf8a', 110, 0.6); }
  else if (what === 'reset') { BT.key = ''; btBuild(); }
  else if (what === 'status') { F.status = !F.status; btStatus(F.status); }
  UI.sync();
}
function btUpdate(dt) {
  const hs = BT.hs, fx = BT.fx; BT.t += dt; hs.t = BT.t; hs.reduced = ST.calm;
  if (hs.attack > 0) { hs.attack += dt * 4; if (hs.attack >= 2) hs.attack = 0; if (!BT.hitDone && hs.attack > 0.7) { BT.hitDone = true; const e = BT.eds.find((q) => !q.dyingOn); if (e) { e.anim.hit = 1; e.hurt = 0.6; fx.burst(e.x, L.ENEMY_FOOT - e.h * 0.5, 'spark', { n: 12 }); } } }
  hs.kick = Math.max(0, hs.kick - dt * 5); hs.hit = Math.max(0, hs.hit - dt * 4); hs.bpulse = Math.max(0, hs.bpulse - dt * 3);
  if (hs.dyingOn) hs.dying = Math.min(1, hs.dying + dt / 1.8);
  for (const e of BT.eds) {
    if (e.pendingAtk >= 0) { e.pendingAtk -= dt; if (e.pendingAtk <= 0) { e.pendingAtk = -1; e.atkT = 0; e.atkKind = 'attack'; e.atkTm = safeTiming(e.def); e.melee = !!(e.atkTm && J.isMelee(e.def)); e.impact = false; } }
    if (e.atkT >= 0) {
      e.atkT += dt; const tm = e.atkTm, dur = tm ? J.atkTotal(tm) / 1000 : 0.5;
      if (tm) { const r = J.atkPhase(tm, e.atkT * 1000); e.atk = { phase: r.phase, k: r.k }; e.lunge = r.lunge; if (!e.impact && e.atkT * 1000 >= tm.impactMs) { e.impact = true; hs.hit = 1; hs.kick = 1; fx.burst(L.HERO_X, L.FOOT_Y - 110, 'spark', { n: 8 }); } }
      else { const k = e.atkT / 0.5; e.atk = { phase: k < 0.4 ? 'act' : 'rec', k: k < 0.4 ? k / 0.4 : (k - 0.4) / 0.6 }; e.lunge = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; if (!e.impact && k > 0.4) { e.impact = true; hs.hit = 1; hs.kick = 1; } }
      if (e.atkT >= dur) { e.atkT = -1; e.atk = { phase: 'idle', k: 0 }; e.lunge = 0; }
    }
    e.anim.hit = Math.max(0, e.anim.hit - dt * 2.5); e.hurt = Math.max(0, e.hurt - dt * 16); e.bpulse = Math.max(0, e.bpulse - dt * 3);
    if (e.dyingOn && e.dying < 1) e.dying = Math.min(1, e.dying + dt / 0.85);
  }
  fx.update(dt);
}
SC.battle = {
  build() {
    UI.reset();
    UI.note('Battle', 'The combat backdrop with the hero on the left and one to three enemies on the right, drawn through combat_art.js exactly like the fight screen: grounding shadows, lunge, hit, block, death, statuses and elite or boss auras. The buttons trigger the same timings the fight uses.',
      'Does the attack wind up, strike and recover with the painted frames? Does the enemy close the distance and the hero flinch on impact? Does the shadow stay put while the body moves? Do auras and statuses read without hiding the pose?');
    const B = ST.battle;
    const heroes = actorGroups((m) => m.hero), mons = actorGroups((m) => !m.hero && m.kind !== 'npc');
    UI.select(UI.group('Hero'), heroes, () => B.hero, (v) => { B.hero = v; });
    const eg = UI.group('Enemies (1 to 3)');
    for (let i = 0; i < 3; i++) UI.select(eg, (i ? [{ v: '', t: '(none)' }] : []).concat(mons), () => B.enemies[i] || '', (v) => { const l = B.enemies.slice(); if (v) l[i] = v; else l.splice(i, 1); B.enemies = l.filter(Boolean).slice(0, 3); if (!B.enemies.length) B.enemies = ['bedpan_slime']; });
    UI.select(UI.group('Act (backdrop)'), [{ v: 1, t: 'Act 1' }, { v: 2, t: 'Act 2' }, { v: 3, t: 'Act 3' }], () => B.act, (v) => { B.act = parseInt(v, 10); });
    const a = UI.group('Actions');
    UI.button(a, 'Hero attack', () => btAct('attack')); UI.button(a, 'Enemy attack', () => btAct('eattack'));
    const tg = UI.group('Target for Hit, Block, Die'); UI.button(tg, 'Hero', () => { B.target = 'hero'; }, () => B.target === 'hero'); UI.button(tg, 'Enemies', () => { B.target = 'enemies'; }, () => B.target === 'enemies');
    const b = UI.group();
    UI.button(b, 'Hit', () => btAct('hit')); UI.button(b, 'Block', () => btAct('block')); UI.button(b, 'Die', () => btAct('die')); UI.button(b, 'Heal', () => btAct('heal'), null, 'Hero heal particles only, the HP bar is not part of this lab'); UI.button(b, 'Reset', () => btAct('reset'));
    const v = UI.group('Look');
    UI.toggle(v, 'Statuses', () => B.status, () => btAct('status')); UI.toggle(v, 'Elite and boss aura', () => B.aura, (x) => { B.aura = x; }); UI.toggle(v, 'Painted frames', () => B.frames, (x) => { B.frames = x; }, 'Off hides the frames: the procedural lunge, flinch and collapse only'); UI.toggle(v, 'Reduced motion', () => ST.calm, (x) => { ST.calm = x; });
    UI.range(UI.group(), 'Speed', 0.1, 2, 0.05, () => CLK.speed, (x) => { CLK.speed = x; }, (x) => x.toFixed(2) + 'x');
    UI.toggle(UI.group(), 'Play', () => CLK.playing, (x) => { CLK.playing = x; });
  },
  draw(w, h) {
    const B = ST.battle; btBuild();
    const sc = Math.min(w / VIEW.w, h / VIEW.h), ox = (w - VIEW.w * sc) / 2 - VIEW.x * sc, oy = (h - VIEW.h * sc) / 2 - VIEW.y * sc;
    const dt = CLK.playing ? DT * CLK.speed : 0; if (CLK.playing) CLK.abs += dt;
    for (const id of [B.hero, ...B.enemies]) { const m = metaOf(id); if (m) warm(m); }
    btUpdate(dt);
    g.save(); g.beginPath(); g.rect((w - VIEW.w * sc) / 2, (h - VIEW.h * sc) / 2, VIEW.w * sc, VIEW.h * sc); g.clip(); g.translate(ox, oy); g.scale(sc, sc);
    const mons = B.enemies.map((id) => metaOf(id)).filter(Boolean), kind = mons.some((m) => m.def.kind === 'boss') ? 'boss' : mons.some((m) => m.def.kind === 'elite') ? 'elite' : 'normal';
    const ok = CA.drawBackdrop(APP, g, { act: B.act, kind, t: BT.t, reduced: ST.calm });
    if (!ok) { BT.bdFail++; const gr = g.createLinearGradient(0, VIEW.y, 0, VIEW.y + VIEW.h); gr.addColorStop(0, '#1c1511'); gr.addColorStop(0.6, '#2a2018'); gr.addColorStop(1, '#3a2c20'); g.fillStyle = gr; g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); bannerExtra = BT.bdFail > 240 ? 'The kit backdrop is not available, so a plain stand-in is drawn (the game would draw its older backdrop).' : ''; } else { bannerExtra = ''; BT.bdFail = 0; }
    withFramesHidden(!B.frames, () => {
      for (const e of BT.eds) {
        if (e.dying >= 1) continue;
        const sp = CA.spriteOf(e.id, APP); if (!sp) continue;
        let x = e.x; if (e.melee && e.atkT >= 0 && e.atkTm && !ST.calm) x -= Math.max(0, e.x - (L.HERO_X + 90)) * J.REACH_FRAC * J.reachK(e.atkTm, e.atkT * 1000);
        CA.drawEnemySprite(g, sp, e.def, e, x, L.ENEMY_FOOT, BT.t + e.phase, { reduced: ST.calm, aura: B.aura });
      }
      const hsp = CA.spriteOf(B.hero, APP); if (hsp) CA.drawHeroSprite(g, hsp, L.HERO_X, L.FOOT_Y, BT.hs);
    });
    BT.fx.draw(g);
    g.restore();
    if (performance.now() - readT > 120) {
      readT = performance.now();
      const hm = metaOf(B.hero), rows = [['hero', `${hm ? hm.name : B.hero}: ${BT.hs.attack > 0 ? 'attack u ' + (BT.hs.attack / 2).toFixed(2) : BT.hs.dyingOn ? 'dying ' + BT.hs.dying.toFixed(2) : BT.hs.hit > 0 ? 'hit' : 'idle'}`]];
      for (const e of BT.eds) { const m = metaOf(e.id); rows.push([m ? m.name : e.id, `${e.atkT >= 0 ? 'attack ' + e.atk.phase : e.dyingOn ? 'dying ' + e.dying.toFixed(2) : e.anim.hit > 0 ? 'hit' : 'idle'}, ${m ? (m.F ? 'frames ' + [m.F.atk.length ? 'atk' : '', m.F.hit ? 'hit' : '', m.F.die ? 'die' : ''].filter(Boolean).join('+') : 'no frames, procedural pose') : ''}`]); }
      setRead(rows);
    }
    STRIP.key = ''; STRIP.el.classList.add('none');
  },
};

// ---------------- scene: Rig lab ----------------
const RG = { ph: 0, lastFoot: null, slide: 0, trail: [], prevGround: null };
const LEG = 28; // upper + lower leg length of the placeholder humanoid
function rigOpts() { const R = ST.rig; return { swing: Math.asin(clamp(R.stride / (2 * LEG), 0.05, 0.98)), knee: R.knee, bob: R.bob, arms: R.arms, lean: R.lean }; }
function footPt(b, s) { return { x: b.x - Math.sin(b.rot) * b.len * s, y: b.y + Math.cos(b.rot) * b.len * s }; }
function rigStrip() {
  const R = ST.rig, key = [R.stride, R.knee, R.bob, R.arms, R.lean].join('|');
  const items = Array.from({ length: 8 }, (_, k) => {
    const ph = k * 0.25;
    return { key: k, name: 'ph ' + ph.toFixed(2), sub: SN(RIG.leadFoot(ph)) + ' lead', draw(x, W, H) { x.fillStyle = '#0d0907'; x.fillRect(0, 0, W, H); x.strokeStyle = '#4a3624'; x.beginPath(); x.moveTo(0, H - 14); x.lineTo(W, H - 14); x.stroke(); RIG.drawRig(x, RIG.HUMANOID, RIG.walkPose(ph, rigOpts()), W / 2, H - 14, { scale: 1.45, color: '#8a7a60' }); } };
  });
  stripSet('rig|' + key, items, (it) => { CLK.playing = false; RG.ph = it.key * 0.25 + 2 * Math.floor(RG.ph / 2); });
}
const RIGPH = { // the capsule placeholder (no art): the first proof of the step cycle, kept as one entry of the Rig lab's picker
  build() {
    UI.note('Placeholder', 'The procedural placeholder humanoid from ui/rig.js walking with its real step cycle (walkPose over a distance driven phase). It is not art: it was the proof of the walk before the painted parts existed. Feet alternate by construction.',
      'Does one foot plant, then the other, with the body lowest at contact and highest at passing? Does the planted foot slide (slide readout near 0)? Do arms swing against the legs?');
    const R = ST.rig;
    UI.range(UI.group('Cycle'), 'Stride', 10, 52, 1, () => R.stride, (v) => { R.stride = v; }, (v) => v + ' u');
    UI.range(UI.group(), 'Cadence', 0.4, 5, 0.1, () => R.cadence, (v) => { R.cadence = v; }, (v) => v.toFixed(1) + '/s');
    UI.range(UI.group(), 'Step height', 0, 1.6, 0.05, () => R.knee, (v) => { R.knee = v; }, (v) => v.toFixed(2));
    UI.range(UI.group(), 'Body bob', 0, 6, 0.1, () => R.bob, (v) => { R.bob = v; }, (v) => v.toFixed(1));
    UI.range(UI.group(), 'Arm swing', 0, 1.2, 0.05, () => R.arms, (v) => { R.arms = v; }, (v) => v.toFixed(2));
    UI.range(UI.group(), 'Lean', 0, 3, 0.1, () => R.lean, (v) => { R.lean = v; }, (v) => v.toFixed(1));
    const o = UI.group('View'); UI.toggle(o, 'Joints', () => R.joints, (v) => { R.joints = v; }); UI.toggle(o, 'Foot trail', () => R.trail, (v) => { R.trail = v; });
    UI.button(o, 'Defaults', () => { Object.assign(R, { stride: 26, cadence: 2.2, knee: 0.9, bob: 2, arms: 0.5, lean: 1 }); });
    const t = UI.group('Playback'); transport2(t);
    UI.range(UI.group(), 'Speed', 0.1, 2, 0.05, () => CLK.speed, (v) => { CLK.speed = v; }, (v) => v.toFixed(2) + 'x');
  },
  draw(w, h) {
    const R = ST.rig, dt = CLK.playing ? DT * CLK.speed : 0;
    RG.ph += dt * R.cadence; if (Q.has('t') && !CLK.playing && RG.ph === 0) RG.ph = CLK.t * R.cadence; CLK.abs += dt;
    const s = Math.min(h * 0.62 / 64, w / 150) * 1, gy = h * 0.82, cx = w / 2;
    g.fillStyle = '#17110c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke();
    const dist = RG.ph * R.stride; // rig units walked
    g.fillStyle = 'rgba(234,223,198,.35)'; g.font = '10px Georgia'; g.textAlign = 'center';
    const sp = 16; for (let x = -((dist % sp) + sp) % sp; x * s < w + 60; x += sp) { const px = cx - 6 * sp * s + x * s; g.fillRect(px, gy, 1.5, 7); }
    const P = RIG.walkPose(RG.ph, rigOpts());
    const bones = RIG.solveRig(RIG.HUMANOID, P, cx, gy, s, false);
    RIG.drawRig(g, RIG.HUMANOID, P, cx, gy, { scale: s, color: '#8a7a60' });
    const byName = {}; for (const b of bones) byName[b.name] = b;
    const fl = footPt(byName.footL, s), fr = footPt(byName.footR, s), low = fl.y > fr.y ? 'L' : 'R', lp = low === 'L' ? fl : fr;
    if (R.joints) {
      g.lineWidth = 1.4;
      for (const b of bones) { const e = { x: b.x - Math.sin(b.rot) * b.len * s, y: b.y + Math.cos(b.rot) * b.len * s }; if (b.len) { g.strokeStyle = 'rgba(120,220,255,.85)'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(e.x, e.y); g.stroke(); } }
      for (const b of bones) { g.fillStyle = b.name.startsWith('foot') ? (b.name === 'footL' ? '#5aa0ff' : '#ff9a4a') : '#ffd24a'; g.beginPath(); g.arc(b.x, b.y, 3, 0, 7); g.fill(); }
    }
    // foot markers on the ground and slide of the planted foot (ground fixed point moves left by dist * s)
    for (const [f, nm, col] of [[fl, SN('L'), '#5aa0ff'], [fr, SN('R'), '#ff9a4a']]) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(f.x - 7, f.y); g.lineTo(f.x + 7, f.y); g.stroke(); g.fillStyle = col; g.font = 'bold 12px Georgia'; g.textAlign = 'center'; g.fillText(nm, f.x, f.y + 20); }
    const gx = lp.x + dist * s;
    if (RG.prevGround && RG.prevGround.foot === low && dt > 0) { const sl = ((gx - RG.prevGround.x) / s) / dt; RG.slide = lerp(RG.slide, Math.abs(sl), 0.1); } else if (dt > 0) RG.slide = RG.slide * 0.9;
    RG.prevGround = { foot: low, x: gx };
    if (R.trail && dt > 0 && RG.lastFoot !== low) { RG.lastFoot = low; RG.trail.push({ x: lp.x + dist * s, foot: low }); if (RG.trail.length > 10) RG.trail.shift(); }
    if (R.trail) for (const f of RG.trail) { const x = f.x - dist * s; g.fillStyle = f.foot === 'L' ? 'rgba(90,160,255,.7)' : 'rgba(255,150,70,.7)'; g.beginPath(); g.ellipse(x, gy + 3, 7, 2.4, 0, 0, 7); g.fill(); }
    rigStrip(); stripHighlight(Math.floor((((RG.ph % 2) + 2) % 2) / 0.25 + 1e-6));
    const lead = RIG.leadFoot(RG.ph), pl = $('plant'); pl.style.display = 'flex';
    if (!pl.firstChild) { pl.append(mk('div', 'pad', SN('L')), mk('div', 'pad', SN('R')), mk('div', 'txt')); }
    pl.children[0].classList.toggle('lit', lead === 'L'); pl.children[1].classList.toggle('lit', lead === 'R');
    pl.children[2].textContent = `lead foot ${SN(lead)}\nlowest foot ${SN(low)}\nsteps ${Math.floor(RG.ph)}`; pl.children[2].style.whiteSpace = 'pre';
    if (performance.now() - readT > 90) {
      readT = performance.now();
      const sl = Math.abs(RG.slide), speed = R.stride * R.cadence;
      setRead([['phase', `${(RG.ph % 2).toFixed(2)} of 2 steps`], ['stride', `${R.stride} units (leg swing ${(rigOpts().swing * 57.3).toFixed(0)} deg)`], ['speed', `${speed.toFixed(1)} units/s, rig height 64`],
        ['planted foot slide', `${RG.slide.toFixed(1)} units/s (${(sl / Math.max(1, speed) * 100).toFixed(0)}% of speed)`, sl / Math.max(1, speed) < 0.25 ? 'good' : 'warn'], ['body bob', `${P.bob.toFixed(2)}  lean ${P.lean.toFixed(3)}`]]);
    }
  },
};
function transport2(row) {
  UI.button(row, '◀', () => { CLK.playing = false; RG.ph = Math.max(0, Math.floor(RG.ph / 0.25 + 1e-6) * 0.25 - 0.25); });
  UI.button(row, 'Play', () => { CLK.playing = !CLK.playing; }, () => CLK.playing);
  UI.button(row, '▶', () => { CLK.playing = false; RG.ph = (Math.floor(RG.ph / 0.25 + 1e-6) + 1) * 0.25; });
}

// ---------------- scene: Rig lab, the painted rigs ----------------
// The rig of one character (assets/rigs, posed by ui/rig.js exactly as the Ward poses it) next to the same character as the game's puppet and as the painted
// standing sprite, all three on one clock and one distance walked, so drift and quality show at a glance.
const RL = { dist: 0, w: 1, slotP: null, who: '', st: { ph: 0, w: 0, t: 0, ux: 1, uy: 0, calm: false }, seen: {}, slide: 0, deep: 0, peak: 0, key: '' };
const HEADINGS = { flat: [1, 0], down: [0.886, 0.463], up: [0.886, -0.463] }; // the Ward's floor is a 2:1 diamond: its rooms lie down-right and up-right of each other
const rigIds = () => rigs.ids();
function rigSpeed() { const base = KR.worldLen(4, 0) / PACE.normal.step; return ST.rig.pace === 'slow' ? base * 0.5 : ST.rig.pace === 'fast' ? KR.worldLen(4, 0) / PACE.fast.step : base; }
function rigBones(gg, rig, c) {
  gg.lineWidth = 1.2; gg.strokeStyle = 'rgba(120,220,255,.9)';
  for (const b of rig.bones) { if (!b.p) continue; const q = rig.B[b.p]; gg.beginPath(); gg.moveTo(q.m[4], q.m[5]); gg.lineTo(b.m[4], b.m[5]); gg.stroke(); }
  for (const b of rig.bones) { gg.fillStyle = b.empty ? '#ff5ad0' : b.n.endsWith('L') || b.n.includes('L_') ? '#5aa0ff' : b.n.endsWith('R') || b.n.includes('R_') ? '#ff9a4a' : '#ffd24a'; gg.beginPath(); gg.arc(b.m[4], b.m[5], 2.2, 0, 7); gg.fill(); }
  for (const s of ['L', 'R']) { RIG.footContact(rig, s, c); gg.strokeStyle = s === 'L' ? '#5aa0ff' : '#ff9a4a'; gg.beginPath(); gg.moveTo(c.x - 5, c.y); gg.lineTo(c.x + 5, c.y); gg.stroke(); }
}
// one posed rig at the origin (= the floor point), in world px; s0 = world px per rig unit
function rigFigure(gg, R, s0, st, o = {}) {
  RIG.poseRig(R.rig, st);
  if (o.shadow !== false) ISO.groundShadow(gg, 0, 0, clamp(R.rig.foot[2] * s0 * 0.8, R.rig.H * s0 * 0.27, R.rig.H * s0 * 0.7), 0.5);
  const m6 = RIG.rigPlace(R.rig, 0, 0, s0, false);
  gg.save(); gg.transform(m6[0], m6[1], m6[2], m6[3], m6[4], m6[5]); RIG.drawRigged(gg, R.rig, R.img); if (o.bones) rigBones(gg, R.rig, { x: 0, y: 0, bx: 0, by: 0 }); gg.restore();
}
function rigStripReal(R, s0world) {
  const u = HEADINGS[ST.rig.heading], key = 'rigreal|' + R.rig.id + '|' + ST.rig.heading;
  const items = [];
  const thumb = (st) => (x, W, H) => { x.fillStyle = '#0d0907'; x.fillRect(0, 0, W, H); const k = (H - 26) / R.rig.H; x.strokeStyle = '#6a4a2a'; x.beginPath(); x.moveTo(0, H - 12 - (u[1] / u[0]) * W / 2); x.lineTo(W, H - 12 + (u[1] / u[0]) * W / 2); x.stroke(); x.save(); x.translate(W / 2, H - 12); rigFigure(x, R, k, st, { shadow: false }); x.restore(); };
  for (let i = 0; i < 8; i++) { const ph = i * 0.25; items.push({ key: 'w' + i, ph, name: ['contact', 'down', 'passing', 'up'][i % 4], sub: SN(RIG.leadFoot(ph)) + ' leads', draw: thumb({ ph, w: 1, t: 0, ux: u[0], uy: u[1], calm: false }) }); }
  for (let i = 0; i < 4; i++) items.push({ key: 'i' + i, idle: i * 0.75, name: 'idle', sub: (i * 0.75).toFixed(2) + ' s', draw: thumb({ ph: 0, w: 0, t: i * 0.75, ux: 1, uy: 0, calm: false }) });
  stripSet(key, items, (it) => { CLK.playing = false; if (it.ph !== undefined) { ST.rig.anim = 'walk'; RL.w = 1; RL.dist = (it.ph + 2 * Math.floor(RL.dist / s0world / 2)) * s0world; } else { ST.rig.anim = 'idle'; RL.w = 0; CLK.abs = it.idle; } UI.sync(); });
}
SC.rig = {
  build() {
    UI.reset();
    const R = ST.rig, ids = rigIds();
    const who = UI.group('Character');
    UI.select(who, [{ label: 'Painted rigs', items: ids.map((id) => { const e = rigs.entry(id); return { v: id, t: nameOf(id) + (e && e.ship ? '' : '  (lab only)') }; }) }, { label: 'No art', items: [{ v: 'placeholder', t: 'Placeholder (capsules)' }] }], () => R.who, (v) => { R.who = v; RL.who = ''; SC.rig.build(); });
    if (R.who === 'placeholder') { RIGPH.build(); return; }
    UI.note('Rig lab', 'A character as a skeleton with painted parts (ui/rig.js, assets/rigs): idle and a two-step walk, posed by the same code the Ward uses with the rig preview on. Beside it the same character as the puppet the game draws today and as its painted standing sprite, on one clock.',
      'Do the feet alternate, one forward step then the other? Does a planted sole stay on its floor mark (slide near 0)? Do the legs come out from UNDER the hem, with no gap and no dark wedge beside the cloth? Does the head sit on the neck, is the prop in the right hand and in front? Is it the same person as the standing sprite?');
    const an = UI.group('Animation'); UI.button(an, 'Idle', () => { R.anim = 'idle'; }, () => R.anim === 'idle'); UI.button(an, 'Walk', () => { R.anim = 'walk'; }, () => R.anim === 'walk');
    const pc = UI.group('Walk speed'); for (const k of ['slow', 'game', 'fast']) UI.button(pc, k[0].toUpperCase() + k.slice(1), () => { R.pace = k; }, () => R.pace === k, k === 'game' ? 'The hero at the Normal pace: one room in ' + PACE.normal.step + ' s' : k === 'fast' ? 'The Fast walk setting' : 'Half the game speed');
    const hd = UI.group('Heading on the floor'); for (const [k, lab] of [['flat', 'Level'], ['down', 'Down-right'], ['up', 'Up-right']]) UI.button(hd, lab, () => { R.heading = k; }, () => R.heading === k, 'The Ward walks along its diamond floor: down the screen the reaching leg is longer, up the screen shorter');
    const t = UI.group('Playback'); UI.button(t, '◀', () => rigStep(-1), null, 'Back a quarter step'); UI.button(t, 'Play', () => { CLK.playing = !CLK.playing; }, () => CLK.playing); UI.button(t, '▶', () => rigStep(1), null, 'On a quarter step');
    UI.range(UI.group(), 'Speed', 0.1, 2, 0.05, () => CLK.speed, (v) => { CLK.speed = v; }, (v) => v.toFixed(2) + 'x');
    const o = UI.group('View');
    UI.toggle(o, 'Bones', () => R.bones, (v) => { R.bones = v; }, 'Joints and bones; pink = a bone that is empty on purpose, the short bars = where each sole meets the floor'); UI.toggle(o, 'Floor marks', () => R.marks, (v) => { R.marks = v; }, 'Marks fixed to the floor: a planted foot must travel with them');
    UI.toggle(o, 'Onion skin', () => ST.onion, (v) => { ST.onion = v; }, 'Blue = a quarter step back, orange = a quarter step on'); UI.toggle(o, 'Flip', () => ST.flip, (v) => { ST.flip = v; }); UI.toggle(o, 'Puppet + sprite', () => R.cmp, (v) => { R.cmp = v; }, 'The same character as the game\'s puppet and as the standing sprite');
    UI.toggle(o, 'Reduced motion', () => ST.calm, (v) => { ST.calm = v; });
    UI.range(UI.group('Rig tune (ui/rig.js RIG_TUNE)'), 'Depth', 0, 1, 0.05, () => RIG.RIG_TUNE.depth, (v) => { RIG.RIG_TUNE.depth = v; }, (v) => (v * 100).toFixed(0) + '%'); // how much of the floor's screen-y travel the feet follow on a diagonal: 100% = no slide at all, but the legs grow and fold
    UI.range(UI.group(), 'Boot roll', 0, 1, 0.02, () => RIG.RIG_TUNE.roll, (v) => { RIG.RIG_TUNE.roll = v; }, (v) => (v * 57.3).toFixed(0) + '\u00b0');
    UI.range(UI.group(), 'Scale', 0.5, 2.5, 0.05, () => ST.scale, (v) => { ST.scale = v; }, (v) => v.toFixed(2) + 'x');
  },
  draw(w, h) {
    const R = ST.rig;
    if (!rigs.ids().length) rigs.get(R.who, APP, true); // the first ask starts the manifest
    else if (RL.key !== 'built') { RL.key = 'built'; if (R.who !== 'placeholder' && !rigs.entry(R.who)) R.who = rigs.ids()[0]; SC.rig.build(); UI.sync(); }
    if (R.who === 'placeholder') { RIGPH.draw(w, h); return; }
    if (!rigs.ids().length) { g.fillStyle = '#a8977a'; g.font = '14px Georgia'; g.textAlign = 'center'; g.fillText(rigs.state === 'none' ? 'The rig manifest did not load (assets/rigs/manifest.json).' : 'Loading the rigs...', w / 2, h / 2); setRead([]); RL.key = ''; return; }
    const m = metaOf(R.who), RG2 = rigs.get(R.who, APP, true), e = rigs.entry(R.who);
    if (!m || !RG2) { g.fillStyle = '#a8977a'; g.font = '14px Georgia'; g.textAlign = 'center'; g.fillText('Loading ' + R.who + '...', w / 2, h / 2); setRead([]); return; }
    warm(m);
    const rig = RG2.rig, s0 = m.h * (m.d.scale || 1) / m.d.h, stepW = rig.stride * rig.H * s0, u = HEADINGS[R.heading], walk = R.anim === 'walk' && !ST.calm;
    const dt = CLK.playing ? DT * CLK.speed : 0; CLK.abs += dt;
    if (RL.who !== R.who) { RL.who = R.who; RL.slotP = newSlot(); RL.seen = {}; RL.peak = 0; }
    RL.w += ((walk ? 1 : 0) - RL.w) * Math.min(1, (CLK.playing ? DT : 1) * 9); if (Math.abs(RL.w - (walk ? 1 : 0)) < 0.01) RL.w = walk ? 1 : 0;
    const speed = rigSpeed(); if (walk) RL.dist += speed * dt;
    const ph = RL.dist / stepW, st = RL.st; st.ph = ph; st.w = RL.w; st.t = CLK.abs; st.ux = u[0]; st.uy = u[1]; st.calm = ST.calm;
    // layout: the rig large, the puppet and the standing sprite beside it
    const cmp = R.cmp, pw = cmp ? w * 0.44 : w, sw = cmp ? (w - pw) / 2 : 0, top = 22, gy = (h - top) * 0.84, fl = ST.flip ? -1 : 1;
    const z = Math.min((h - top) * 0.62, (cmp ? sw : pw * 0.5) * 1.15) / (rig.H * s0) * ST.scale, slope = u[1] / u[0] * fl;
    const floor = (cx, half) => { g.strokeStyle = '#6a4a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - half, gy - slope * half); g.lineTo(cx + half, gy + slope * half); g.stroke(); };
    g.fillStyle = '#17110c'; g.fillRect(0, 0, w, h);
    // ---- the rig
    const cx = pw / 2; floor(cx, pw * 0.46);
    if (R.marks) { // marks that are fixed to the floor: they travel back as the figure walks, and a planted foot travels with them
      const gap = stepW * z, off = ((RL.dist * z) % gap + gap) % gap;
      g.fillStyle = 'rgba(234,223,198,.4)'; for (let x = -Math.ceil(pw / gap) * gap - off; x < pw * 0.46; x += gap) { if (x < -pw * 0.46) continue; g.fillRect(cx + x * fl - 1, gy + slope * x * fl, 2, 7); }
    }
    g.save(); g.beginPath(); g.rect(0, 0, pw, h - top); g.clip(); g.translate(cx, gy); g.scale(z * fl, z);
    if (ST.onion && walk) { const q = { ...st }; q.ph = ph - 0.25; ghost(g, '#4aa0ff', 0.38, (x) => rigFigure(x, RG2, s0, q, { shadow: false })); q.ph = ph + 0.25; ghost(g, '#ff6a4a', 0.38, (x) => rigFigure(x, RG2, s0, q, { shadow: false })); }
    rigFigure(g, RG2, s0, st, { bones: R.bones });
    g.restore();
    // where each sole meets the floor, and how still a planted sole stands in the world (units of the rig per second)
    const I = rig.info, c = { x: 0, y: 0, bx: 0, by: 0 }; let slide = 0, deep = 0;
    for (const s of ['L', 'R']) {
      const L = rig.legs[s]; RIG.footContact(rig, s, c);
      const sx = cx + (c.x - rig.foot[0]) * s0 * z * fl, sy = gy + (c.y - rig.foot[1]) * s0 * z;
      g.strokeStyle = s === 'L' ? '#5aa0ff' : '#ff9a4a'; g.fillStyle = g.strokeStyle; g.lineWidth = 2;
      if (L.plant && RL.w > 0.5) { g.fillRect(sx - 7, sy + 2, 14, 3); g.font = 'bold 11px Georgia'; g.textAlign = 'center'; g.fillText(SN(s), sx, sy + 17); } else { g.strokeRect(sx - 6, sy + 2, 12, 3); }
      const wx = c.x + ph * rig.stride * rig.H * u[0], wy = c.y + ph * rig.stride * rig.H * u[1], k = s + (L.phi > 0 ? 't' : 'h'), p = RL.seen[k], nth = Math.floor(ph / 2 + (s === 'L' ? 0 : 0.5));
      if (L.plant && RL.w === 1 && p && dt > 0 && p.n === nth) { slide = Math.max(slide, Math.abs(wx - p.x) / dt); deep = Math.max(deep, Math.abs(wy - p.y) / dt); }
      RL.seen[k] = { x: wx, y: wy, n: nth };
    }
    if (dt > 0 && walk) { RL.slide = slide; RL.deep = deep; RL.peak = Math.max(RL.peak * 0.99, slide); }
    const label = (x0, ww, txt, col) => { g.fillStyle = 'rgba(18,13,10,.85)'; g.fillRect(x0, h - top, ww, top); g.fillStyle = col || '#eadfc6'; g.font = '12px Georgia'; g.textAlign = 'left'; g.fillText(txt.slice(0, Math.max(8, Math.floor(ww / 6.3))), x0 + 8, h - 7); };
    label(0, pw, 'RIG: ' + m.name + (e.ship ? ' (ships in the preview)' : ' (lab only, the game keeps the puppet)'), e.ship ? '#9fd89a' : '#e0a050');
    if (cmp) {
      // ---- the puppet: the game's own actor draw, forced to the puppet, walking the same distance
      const sl = RL.slotP, rec = sl.rec; setupRec(rec, m); rec.x = 0; rec.y = 0; rec.flip = fl; rec.pm = 'puppet';
      runGait(sl, rec, walk ? 'walk' : 'idle', sl.g ? RL.dist / (rec.h * (sl.g.sl || ISO.STRIDE)) : 0, ST.calm, dt || 1 / 60);
      floor(pw + sw / 2, sw * 0.44);
      g.save(); g.beginPath(); g.rect(pw, 0, sw, h - top); g.clip(); g.translate(pw + sw / 2, gy); g.scale(z, z); ISO.drawActor(APP, g, rec, { hero: m.id }); g.restore();
      label(pw, sw, 'PUPPET (the game today)');
      // ---- the standing sprite
      const sp = assets.actor(m.id, APP); floor(pw + sw * 1.5, sw * 0.44);
      if (sp) { const d = sp.def, cc = ISO.contactOf(sp), fx = cc ? cc.fx : d.anchorX, fy = cc ? cc.fy : d.anchorY; g.save(); g.beginPath(); g.rect(pw + sw, 0, sw, h - top); g.clip(); g.translate(pw + sw * 1.5, gy); g.scale(z * fl, z); ISO.groundShadow(g, 0, 0, clamp((cc ? cc.fw : d.w * 0.45) * s0 * 0.8, rec.h * 0.24, rec.h * 0.62), 0.5); g.drawImage(sp.img, -fx * s0, -fy * s0, d.w * s0, d.h * s0); g.restore(); }
      label(pw + sw, sw, 'STANDING sprite');
      g.strokeStyle = '#4a3624'; g.lineWidth = 1; g.beginPath(); g.moveTo(pw, 0); g.lineTo(pw, h); g.moveTo(pw + sw, 0); g.lineTo(pw + sw, h); g.stroke();
    }
    rigStripReal(RG2, stepW); stripHighlight(walk || R.anim === 'walk' ? 'w' + (Math.floor((((ph % 2) + 2) % 2) / 0.25 + 1e-6) % 8) : '');
    const pl = $('plant'); pl.style.display = 'flex'; if (!pl.firstChild) pl.append(mk('div', 'pad', SN('L')), mk('div', 'pad', SN('R')), mk('div', 'txt'));
    pl.children[0].classList.toggle('lit', I.plantL && RL.w > 0.5); pl.children[1].classList.toggle('lit', I.plantR && RL.w > 0.5); pl.children[2].style.whiteSpace = 'pre';
    pl.children[2].textContent = RL.w > 0.5 ? `planted ${SNs(I.plant) || '-'}  lead ${SN(I.lead)}\nsole slide ${RL.slide.toFixed(2)} u/s across (peak ${RL.peak.toFixed(2)})${u[1] ? `\nin depth ${(RL.deep || 0).toFixed(0)} u/s (Depth ${(RIG.RIG_TUNE.depth * 100).toFixed(0)}%)` : ''}` : 'idle: both feet planted';
    if (performance.now() - readT > 90) {
      readT = performance.now();
      const cad = speed / stepW;
      setRead([['rig', `${m.name}: ${e.parts.length} parts, atlas ${e.w} x ${e.h}${e.borrowed ? ', borrowed from the standing sprite: ' + e.borrowed.join(', ') : ''}`], ['ships', e.ship ? 'yes, in the rig preview' : 'no: ' + (e.note || 'lab only'), e.ship ? 'good' : 'warn'],
        ['step', `${(rig.stride * 100).toFixed(0)}% of the height, planted ${(rig.duty * 100).toFixed(0)}% of the cycle`], ['pace', `${R.pace}: ${speed.toFixed(0)} world px/s, ${cad.toFixed(1)} steps/s`, cad > 3.6 ? 'warn' : 'good'],
        ['reach', `thigh x${I.thigh.toFixed(2)} (hidden)  shin x${I.stretch.toFixed(2)}  hip slip ${I.slip.toFixed(1)}`, I.slip > 0.04 * rig.H ? 'warn' : null], ['body', `drop ${I.down.toFixed(1)}  lean ${I.lean.toFixed(3)}  hem ${(rig.parts.find((p) => p.hem !== undefined) || { hx: 0 }).hx.toFixed(3)}`]]);
    }
  },
  leave() { $('plant').style.display = 'none'; RL.key = ''; },
};
function rigStep(dir) {
  if (ST.rig.who === 'placeholder') return;
  const R2 = rigs.get(ST.rig.who, APP, true), m = metaOf(ST.rig.who); if (!R2 || !m) return;
  const stepW = R2.rig.stride * R2.rig.H * m.h * (m.d.scale || 1) / m.d.h; CLK.playing = false; ST.rig.anim = 'walk'; RL.w = 1;
  RL.dist = Math.max(0, (Math.round(RL.dist / stepW * 4) + dir) / 4) * stepW;
}

// ---------------- shell: nav, resize, loop ----------------
let curScene = null;
function mountScene(id) {
  if (curScene && SC[curScene].leave) SC[curScene].leave();
  curScene = ST.scene = id; $('plant').style.display = 'none'; STRIP.key = ''; STRIP.el.classList.add('none'); bannerExtra = '';
  SC[id].build(); UI.sync();
  READ.style.top = id === 'compare' ? '32px' : '8px';
  document.querySelectorAll('#scenes button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  const url = new URL(location.href); url.searchParams.set('scene', id); history.replaceState(null, '', url);
  $('hint').textContent = id === 'rig' ? '' : id === 'map' ? 'space: play or pause' : 'space: play or pause, comma and period: step';
}
for (const id of SCENES) { const b = mk('button', null, SCENE_LABEL[id]); b.dataset.id = id; b.onclick = () => mountScene(id); $('scenes').append(b); }
$('ctlBtn').onclick = () => { $('ctl').classList.toggle('hidden'); resize(); };
if (innerHeight < 480 && !Q.has('controls')) { /* keep the controls: they are the point of the page */ }
if (Q.get('controls') === '0') $('ctl').classList.add('hidden');
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
  if (e.key === ' ') { CLK.playing = !CLK.playing; UI.sync(); e.preventDefault(); }
  const m = metaOf(ST.actor);
  if (e.key === ',' && m) { stepFrame(m, ST.anim, -1); } if (e.key === '.' && m) { stepFrame(m, ST.anim, 1); }
  if (e.key >= '1' && e.key <= '5') mountScene(SCENES[parseInt(e.key, 10) - 1]);
});
let CW = 0, CH = 0;
function resize() { const r = cv.getBoundingClientRect(); CW = Math.max(100, Math.floor(r.width)); CH = Math.max(100, Math.floor(r.height)); const pw = Math.round(CW * DPR), ph = Math.round(CH * DPR); if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; } }
new ResizeObserver(resize).observe($('stage')); addEventListener('resize', resize); resize();

let last = 0, lastErr = '', frameN = 0, ready = false, jumped = false;
function loop(ts) {
  requestAnimationFrame(loop);
  DT = clamp((ts - last) / 1000 || 0.016, 0.001, 0.05); last = ts; APP.frame++; frameN++;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#17110c'; g.fillRect(0, 0, CW, CH);
  try {
    if (assets.ready()) {
      if (!jumped) { jumped = true; SC[curScene].build(); UI.sync(); initJump(); }
      SC[curScene].draw(CW, CH);
      const m = ST.scene === 'viewer' || ST.scene === 'compare' ? metaOf(ST.actor) : null;
      if (STRIP.els.length) stripPaint(m);
      lastErr = '';
    } else { g.fillStyle = '#a8977a'; g.font = '14px Georgia'; g.textAlign = 'center'; g.fillText(assets.state === 'none' ? 'The art manifest could not be loaded.' : 'Loading the art manifest...', CW / 2, CH / 2); }
  } catch (e) { lastErr = String(e && e.message || e); bannerExtra = 'Drawing error: ' + lastErr; window.__lab.err = (e && e.stack) || lastErr; }
  if (frameN % 30 === 0) updateBanner();
  if (frameN % 10 === 0 && assets.ready()) window.__lab.ready = pendingImgs() === 0 && frameN > 20;
  window.__lab.frame = frameN;
}
function initJump() {
  // &frame=N: stop on the Nth frame of the chosen animation (1 based)
  if (!Q.has('frame')) { if (Q.get('do') && curScene === 'battle') for (const a of Q.get('do').split(',')) btAct(a === 'eattack' ? 'eattack' : a); return; }
  const m = metaOf(ST.actor), n = qn('frame', 1) - 1; if (!m) return;
  CLK.playing = false;
  if (ST.anim === 'walk') CLK.t = ((n % WALK_N + 0.5) * 2 / WALK_N) / SPS;
  else { const ks = keysOf(m, ST.anim); if (ks.length) CLK.t = ks[clamp(n, 0, ks.length - 1)].t; }
}
window.__lab = { SLIDE, PUP, BT, RL, rigs, ready: false, ST, CLK, SCENES, frame: 0, err: '', mount: mountScene, act: btAct, metaOf, assets };
mountScene(ST.scene);
requestAnimationFrame(loop);
setInterval(() => { UI.sync(); }, 1500);
