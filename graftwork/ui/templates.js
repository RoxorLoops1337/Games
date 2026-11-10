// TEMPLATES: the modular art system (design/ART_MODULAR.md). Assets are PARTS (frames, icons, gems, plates); code composes them.
// Everything here is optional: with no manifest, no network or no image yet, every function answers null / false and the caller
// draws its procedural look (art/cards.js, ui/chrome.js). Headless (node) it is a no-op.
//
//   assets/ui/manifest.json  { version, frames:{id:{file,file2x?,w,h,slice:[l,t,r,b],content:{x,y,w,h},atlas?,rect?,baked?,under?,slots?,tile?,scale?}},
//                              icons:{id:{file,file2x?,w,h,atlas?,rect?}}, atlases:{id:{file,file2x?,w,h}},
//                              templates:{card_front:{slots:{...}}, card_back:{slots:{...}}} }
//   All numbers are LOGICAL (@1x) pixels: w x h is the size the part has at 1x, the @2x file is simply twice as many pixels.
//   slice [l,t,r,b] = 9-slice margins in logical px; content = the rect inside the frame where children go (default: inside the slice).
//   atlas + rect: the part lives inside a packed sheet (rect is in the atlas' logical px), so many parts cost one request.
//   under: slot names painted BEFORE the frame image (the frame has a transparent window there); baked: slot names whose plate is in the image.
//   tile: the edges of a sliced part repeat instead of stretching (a rope, a row of rivets); scale 'height': a pill, its caps follow the height.
//   Written by tools/graftwork_ui_build.py from the artist's raw files; never edited by hand.
//
//   templates.ensure(app?)          start the manifest load once (no-op headless)
//   templates.frameImg(id, app?)    { img, def, id, ... } once decoded, else null (starts loading it)
//   templates.pickFrame(ids, app?)  first id of the list whose image is decoded
//   templates.iconImg / drawIcon    icons from the same manifest
//   drawNineSlice(ctx, fr, x, y, w, h)   slot-based 9-slice draw;  contentRect(def, x, y, w, h)
//   CARD_TEMPLATE / CARD_BACK_TEMPLATE   the data-driven slot definitions; resolveSlots(); composeCardFront(); cardFrameIds(); cardBackIds()
//   templates.sync(app)             follow the preview switch (ui/preview.js); templates.ver counts every change of what can be drawn
import { previewOn } from './preview.js';
const BASE_DEFAULT = 'assets/ui/';
// THE SWITCH for the painted art is the 'art' preview (ui/preview.js: PREVIEW_DEFAULT.art, the page URL ?art=1, the Settings toggle "Painted art (preview)").
// While it is off the loader requests NOTHING, not the manifest and no image, and every caller keeps its procedural look; on the minimal graphics tier
// (ui/quality.js) it stays off whatever the setting says. Tests and tools that feed the loader themselves pass { art: true } and are not asked.
const previewSettings = (app) => (app && app.shared && app.shared.meta && app.shared.meta.settings) || null;
const tierOf = (app) => (app && app.perf && app.perf.q && app.perf.q.tier) || 'full';
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- manifest parsing
const cleanRect = (r) => (isObj(r) && fin(r.x) && fin(r.y) && fin(r.w) && fin(r.h) && r.w > 0 && r.h > 0 ? { x: r.x, y: r.y, w: r.w, h: r.h } : null);
const cleanSlice = (s) => (Array.isArray(s) && s.length === 4 && s.every((v) => fin(v) && v >= 0) ? s.slice() : null);
const cleanArr4 = (r) => (Array.isArray(r) && r.length === 4 && r.every(fin) && r[2] > 0 && r[3] > 0 ? { x: r[0], y: r[1], w: r[2], h: r[3] } : cleanRect(r));
const str = (v) => (typeof v === 'string' && v && !/\.\.|^\/|:/.test(v) ? v : null); // relative paths only
function cleanPart(d, atlases) {
  if (!isObj(d)) return null;
  const out = { file: str(d.file), file1x: str(d.file1x), file2x: str(d.file2x), w: fin(d.w) && d.w > 0 ? d.w : 0, h: fin(d.h) && d.h > 0 ? d.h : 0 };
  if (d.atlas !== undefined) { // the part is a rect inside an atlas
    const rect = cleanArr4(d.rect);
    if (typeof d.atlas !== 'string' || !atlases[d.atlas] || !rect) return null;
    out.atlas = d.atlas; out.rect = rect; out.w = out.w || rect.w; out.h = out.h || rect.h;
  } else if (!out.file && !out.file1x && !out.file2x) return null;
  const slice = cleanSlice(d.slice); if (slice) out.slice = slice;
  const content = cleanRect(d.content); if (content) out.content = content;
  if (Array.isArray(d.baked)) out.baked = d.baked.filter((s) => typeof s === 'string');
  if (Array.isArray(d.under)) out.under = d.under.filter((s) => typeof s === 'string');
  if (isObj(d.slots)) out.slots = cleanSlots(d.slots);
  if (d.fill === false) out.fill = false; // 9-slice without its centre (the frame is a border only)
  if (d.tile === true) out.tile = true;   // the edges repeat, they do not stretch
  if (d.scale === 'height') out.scale = 'height'; // a pill: the caps scale with the height, only the middle stretches
  if (fin(d.socket) && d.socket > 0) out.socket = d.socket; // gauge cells: the diameter of the hole
  if (typeof d.tint === 'string') out.tint = d.tint;
  return out;
}
function cleanSlots(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (!isObj(v)) continue;
    const o = {};
    for (const key of ['x', 'y', 'w', 'h', 'r', 'dx', 'dy', 'n']) if (fin(v[key])) o[key] = v[key];
    if (Array.isArray(v.anchor) && v.anchor.length === 2 && v.anchor.every(fin)) o.anchor = v.anchor.slice();
    if (Array.isArray(v.pivot) && v.pivot.length === 2 && v.pivot.every(fin)) o.pivot = v.pivot.slice();
    if (isObj(v.step) && fin(v.step.x) && fin(v.step.y)) o.step = { x: v.step.x, y: v.step.y };
    if (isObj(v.fit)) o.fit = { max: fin(v.fit.max) ? v.fit.max : undefined, min: fin(v.fit.min) ? v.fit.min : undefined, lines: fin(v.fit.lines) ? v.fit.lines : undefined, grow: !!v.fit.grow };
    if (fin(o.w) || fin(o.h) || o.anchor || o.step) out[k] = o;
  }
  return out;
}
// raw JSON -> normalised manifest, or null when it is not a manifest at all. Bad entries are dropped one by one; the rest stays usable.
export function parseManifest(m) {
  if (!isObj(m)) return null;
  const atlases = {};
  if (isObj(m.atlases)) for (const [id, d] of Object.entries(m.atlases)) { const p = cleanPart(d, {}); if (p && p.w && p.h) atlases[id] = p; }
  const frames = {}, icons = {}, templates = {};
  if (isObj(m.frames)) for (const [id, d] of Object.entries(m.frames)) { const p = cleanPart(d, atlases); if (p) frames[id] = p; }
  if (isObj(m.icons)) for (const [id, d] of Object.entries(m.icons)) { const p = cleanPart(d, atlases); if (p) icons[id] = p; }
  if (isObj(m.templates)) for (const [id, d] of Object.entries(m.templates)) if (isObj(d) && isObj(d.slots)) templates[id] = { slots: cleanSlots(d.slots) };
  return { version: fin(m.version) ? m.version : 1, frames, icons, atlases, templates };
}

// ---------------------------------------------------------------- 9-slice (pure)
// natural logical size of a part and the source rectangle (in image pixels) it occupies, given the decoded image
export function partSource(def, atlasDef, img) {
  const iw = img.naturalWidth || img.width || 0, ih = img.naturalHeight || img.height || 0;
  if (def.atlas && atlasDef) {
    const k = iw / (atlasDef.w || iw || 1), r = def.rect;
    return { sx: r.x * k, sy: r.y * k, sw: r.w * k, sh: r.h * k, k, lw: r.w, lh: r.h };
  }
  const lw = def.w || iw, lh = def.h || ih, k = lw ? iw / lw : 1;
  return { sx: 0, sy: 0, sw: iw, sh: ih, k, lw, lh };
}
// The 9 drawImage argument sets [sx,sy,sw,sh,dx,dy,dw,dh] for a sliced part drawn into (x,y,w,h). Margins keep their logical size;
// when the target is smaller than the margins they shrink together. centre: false leaves the middle empty.
export function sliceRects(src, slice, x, y, w, h, centre = true) {
  const [l, t, r, b] = slice, k = src.k;
  let sc = 1; if (l + r > w) sc = Math.min(sc, w / (l + r)); if (t + b > h) sc = Math.min(sc, h / (t + b));
  const dl = l * sc, dt = t * sc, dr = r * sc, db = b * sc;
  const sl = l * k, st = t * k, sr = r * k, sb = b * k;
  const xs = [[src.sx, sl, x, dl], [src.sx + sl, src.sw - sl - sr, x + dl, w - dl - dr], [src.sx + src.sw - sr, sr, x + w - dr, dr]];
  const ys = [[src.sy, st, y, dt], [src.sy + st, src.sh - st - sb, y + dt, h - dt - db], [src.sy + src.sh - sb, sb, y + h - db, db]];
  const out = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (!centre && i === 1 && j === 1) continue;
    const X = xs[i], Y = ys[j];
    if (X[1] <= 0 || Y[1] <= 0 || X[3] <= 0 || Y[3] <= 0) continue;
    out.push([X[0], Y[0], X[1], Y[1], X[2], Y[2], X[3], Y[3]]);
  }
  return out;
}
// where children go inside a frame drawn into (x,y,w,h): the native insets (frame size minus content rect) are kept, the middle stretches
export function contentRect(def, x, y, w, h) {
  const nw = def.w || w, nh = def.h || h;
  const c = def.content || (def.slice ? { x: def.slice[0], y: def.slice[1], w: nw - def.slice[0] - def.slice[2], h: nh - def.slice[1] - def.slice[3] } : { x: 0, y: 0, w: nw, h: nh });
  const il = c.x, it = c.y, ir = Math.max(0, nw - c.x - c.w), ib = Math.max(0, nh - c.y - c.h);
  return { x: x + il, y: y + it, w: Math.max(0, w - il - ir), h: Math.max(0, h - it - ib) };
}
// draw a decoded part (from frameImg) into (x,y,w,h): 9-slice when it has a slice, one stretched drawImage otherwise
export function drawNineSlice(ctx, fr, x, y, w, h) {
  const { img, def, src } = fr;
  if (!(w > 0 && h > 0)) return false;
  if (!def.slice) { ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, x, y, w, h); return true; }
  for (const a of sliceRects(src, def.slice, x, y, w, h, def.fill !== false)) ctx.drawImage(img, a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
  return true;
}

// ---------------------------------------------------------------- slots (pure)
// A slot is { x, y, w, h } in card space (origin = card centre), or anchored: { anchor:[ax,ay], pivot?:[px,py], dx?, dy?, w, h } where anchor is a
// fraction of the card (0,0 = top left) and pivot a fraction of the slot itself. A repeated slot adds step:{x,y} and n.
export function resolveSlot(slot, cw, ch) {
  if (!slot) return null;
  let x = slot.x, y = slot.y;
  if (slot.anchor) {
    const pv = slot.pivot || slot.anchor;
    x = -cw / 2 + slot.anchor[0] * cw - pv[0] * (slot.w || 0) + (slot.dx || 0);
    y = -ch / 2 + slot.anchor[1] * ch - pv[1] * (slot.h || 0) + (slot.dy || 0);
  }
  if (!fin(x) || !fin(y)) return null;
  const r = { x, y, w: slot.w || 0, h: slot.h || 0 };
  if (slot.r !== undefined) r.r = slot.r;
  if (slot.fit) r.fit = slot.fit;
  if (slot.step) { r.items = []; for (let i = 0; i < (slot.n || 1); i++) r.items.push({ x: x + slot.step.x * i, y: y + slot.step.y * i, w: r.w, h: r.h }); }
  return r;
}
export const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// The default card template. These numbers ARE the procedural card's layout (art/cards.js draws from them too), so a frame drawn into
// them lines up with the fallback. A manifest `templates.card_front.slots` or a frame's own `slots` overrides single slots.
export const CARD_TEMPLATE = {
  id: 'card_front', w: 220, h: 310,
  slots: {
    window: { x: -90, y: -112, w: 180, h: 90, r: 5 },
    windowCompact: { x: -90, y: -102, w: 180, h: 118, r: 5 },
    windowCompactGrafts: { x: -90, y: -102, w: 180, h: 70, r: 5 },
    namePlate: { x: -58, y: -142, w: 150, h: 27, fit: { max: 17, min: 9.5, lines: 1 } },
    namePlateCompact: { x: -56, y: -150, w: 160, h: 44, fit: { max: 26, min: 20, lines: 2 } },
    typeBand: { x: -43, y: -30, w: 86, h: 18, fit: { max: 11, min: 11, grow: true } },
    textBox: { x: -88, y: 2, w: 176, h: 141, fit: { max: 15, min: 8 } },
    costGem: { x: -118, y: -161, w: 40, h: 40 },
    costGemCompact: { x: -121, y: -164, w: 50, h: 50 },
    graftSlots: { x: 97, y: 13, w: 34, h: 30, step: { x: 0, y: 44 }, n: 3 },
    fusedSlots: { x: -116, y: 21, w: 18, h: 18, step: { x: 0, y: 24 }, n: 4 },
    fusedSlotsCompact: { x: -116, y: -1, w: 18, h: 18, step: { x: 0, y: 24 }, n: 4 },
    graftBand: { x: -86, y: 46, w: 172, h: 38 },
    typeGlyph: { x: -87, y: 119, w: 22, h: 22 },
    schoolGlyph: { x: 63, y: 117, w: 26, h: 26 },
    pips: { x: -30, y: 134, w: 60, h: 10 },
  },
};
export const CARD_BACK_TEMPLATE = { id: 'card_back', w: 220, h: 310, slots: { title: { x: -80, y: 114, w: 160, h: 20 } } };

// slot name for a variant: compact cards read '<name>Compact' (and window '...CompactGrafts' when grafts ride in the card)
export function slotName(name, compact, grafts) {
  if (!compact) return name;
  return name === 'window' && grafts ? 'windowCompactGrafts' : name + 'Compact';
}
// merge a template with overrides (manifest template, then the frame's own slots); never mutates its inputs
export function mergeTemplate(base, ...over) {
  const slots = { ...base.slots };
  for (const o of over) if (o && o.slots) for (const [k, v] of Object.entries(o.slots)) slots[k] = { ...(slots[k] || {}), ...v };
  return { ...base, slots };
}
// every slot of a variant resolved into card space: { window, namePlate, typeBand, textBox, costGem, graftSlots, fusedSlots, ... }
// Full faces own typeBand, textBox, graftSlots and pips; compact (hand) faces own graftBand, typeGlyph, schoolGlyph and a derived keyNumber
// rect (the strip under the window). window, namePlate, costGem and fusedSlots exist in both ('<name>Compact' wins on a compact face).
const FULL_ONLY = ['typeBand', 'textBox', 'graftSlots', 'pips'], COMPACT_ONLY = ['graftBand', 'typeGlyph', 'schoolGlyph'];
const SLOT_NAMES = ['window', 'textHole', 'namePlate', 'typeBand', 'textBox', 'costGem', 'graftSlots', 'fusedSlots', 'graftBand', 'typeGlyph', 'schoolGlyph', 'pips', 'title'];
export function resolveSlots(tpl, { compact = false, grafts = false } = {}) {
  const out = {};
  for (const n of SLOT_NAMES) {
    // a full-face slot shows on a compact face only when the template names it for that face ('typeBandCompact'); a slot of no size is a slot switched off
    if (compact ? FULL_ONLY.includes(n) && !tpl.slots[n + 'Compact'] : COMPACT_ONLY.includes(n)) continue;
    const s = (compact && tpl.slots[slotName(n, true, grafts)]) || (compact && tpl.slots[n + 'Compact']) || tpl.slots[n];
    const r = s ? resolveSlot(s, tpl.w, tpl.h) : null;
    if (r && (r.w > 0 || r.h > 0)) out[n] = r;
  }
  // the big number of a compact face: the template's own keyNumber slot (a painted frame puts it on the picture), else the strip under the window
  if (compact) { const own = tpl.slots.keyNumber ? resolveSlot(tpl.slots.keyNumber, tpl.w, tpl.h) : null; if (own) { own.own = true; out.keyNumber = own; } else if (out.window) out.keyNumber = { x: out.window.x, y: out.window.y + out.window.h, w: out.window.w, h: 80 }; }
  return out;
}

// ---------------------------------------------------------------- fit (pure)
// largest font size in [min,max] (step 0.5) for which `text` measures within maxW; measure(sizePx, text) -> width. Returns min when none fits.
export function fitFontSize(measure, text, maxW, max, min, step = 0.5) {
  let s = max;
  while (s > min && measure(s, text) > maxW) s -= step;
  return Math.max(min, s);
}

// ---------------------------------------------------------------- card frame ids
// candidate frame ids, most specific first: card_front.<type>.<rarity>.<school> ... card_front
export function cardFrameIds(spec, rarity) {
  const type = (spec && spec.type) || 'skill', rar = rarity || (spec && spec.rarity) || 'common', school = spec && spec.school;
  const ids = [];
  if (school) ids.push(`card_front.${type}.${rar}.${school}`);
  ids.push(`card_front.${type}.${rar}`, `card_front.${type}`, `card_front.${rar}`, 'card_front');
  return ids;
}
// card backs: per back id and hero, per back id and act, per back id, the generic one
export function cardBackIds(back, hero, act) {
  const b = back || 'plain', ids = [];
  if (hero) ids.push(`card_back.${b}.${hero}`);
  if (act) ids.push(`card_back.${b}.act${act}`);
  ids.push(`card_back.${b}`);
  if (hero) ids.push(`card_back.${hero}`);
  if (act) ids.push(`card_back.act${act}`);
  ids.push('card_back');
  return ids;
}

// Draw one card face from a template: the painters of the slots the frame lists as `under` (its transparent windows), the frame image, then every
// other slot's painter in order. painters = { window(g, rect, info), textHole, namePlate, typeBand, textBox, keyNumber, graftBand, graftSlots, fusedSlots,
// typeGlyph, schoolGlyph, pips } (all optional, called only when the slot exists); info = { baked, under }.
// Returns the resolved slots. Pure of any game rule: art/cards.js supplies the painters.
export const FRONT_ORDER = ['window', 'textHole', 'namePlate', 'typeBand', 'textBox', 'keyNumber', 'graftBand', 'graftSlots', 'fusedSlots', 'typeGlyph', 'schoolGlyph', 'pips'];
export function composeCardFront(g, tpl, fr, variant, painters, info = {}) {
  const res = resolveSlots(tpl, variant);
  const def = (fr && fr.def) || null, baked = new Set((def && def.baked) || []), under = new Set((def && def.under) || []);
  const run = (name) => { const p = painters[name], r = res[name]; if (p && r) p(g, r, { ...info, baked: baked.has(name), under: under.has(name) }); };
  if (under.size) for (const name of FRONT_ORDER) if (under.has(name)) run(name); // what shows through the frame's windows goes first
  if (fr) drawNineSlice(g, fr, -tpl.w / 2, -tpl.h / 2, tpl.w, tpl.h);
  for (const name of FRONT_ORDER) if (!under.has(name)) run(name);
  return res;
}

// ---------------------------------------------------------------- the loader
export function createTemplates(opts = {}) {
  const A = {
    base: opts.base || BASE_DEFAULT, manifest: null, state: 'idle', imgs: new Map(), failed: 0, app: null, res: new Map(), ver: 0,
    // art: null follows the preview switch (the game), true / false is a test or a tool saying so itself
    fetchJson: opts.fetchJson || null, makeImage: opts.makeImage || null, forceLive: !!opts.live, art: opts.art === undefined ? null : !!opts.art, on: false,
  };
  const live = () => !!(A.forceLive || A.fetchJson || (typeof fetch === 'function' && typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof window !== 'undefined' && window.location));
  A.available = () => A.on && live();
  // which file size: @2x when a logical pixel covers more than about one device pixel (desktop, and phones with a dense screen), @1x otherwise
  // and on the lighter graphics tiers
  A.use2x = (app) => { const a = app || A.app; if (!a) return true; if (tierOf(a) !== 'full') return false; return a.px > 0 ? a.px >= 1.2 : !(a.scale > 0 && a.scale < 0.8); };
  // the switch, asked once per change of its inputs (the Settings toggle, the graphics tier, the page URL)
  let swKey = null, swVal = false;
  A.wanted = () => {
    if (A.art !== null) return A.art;
    const st = previewSettings(A.app), tier = tierOf(A.app), search = typeof location !== 'undefined' && location ? String(location.search || '') : '';
    const key = (st && st.previewArt ? '1' : '0') + tier + search;
    if (key !== swKey) { swKey = key; swVal = tier !== 'minimal' && previewOn('art', st); }
    return swVal;
  };
  // Bring the loader in line with the switch (main.js calls it every frame and after every settings save; ensure(app) does too, once per frame).
  // Turning it off keeps what was downloaded, so turning it on again is instant. Returns true when the look changed.
  A.sync = (app) => {
    if (app) { A.app = app; A.syncFrame = app.frame; }
    const on = A.wanted();
    if (on === A.on) return false;
    A.on = on; A.res.clear(); A.ver++;
    return true;
  };
  // test and tool hook: inject fetch / image factories / base, force the live path off a DOM, or set the art switch (art: null hands it back to the preview)
  A.configure = (o = {}) => {
    if (o.fetchJson !== undefined) A.fetchJson = o.fetchJson;
    if (o.makeImage !== undefined) A.makeImage = o.makeImage;
    if (o.base) A.base = o.base.endsWith('/') ? o.base : o.base + '/';
    if (o.live !== undefined) A.forceLive = !!o.live;
    if (o.art !== undefined) A.art = o.art === null ? null : !!o.art;
    A.reset();
  };
  // a lab page or a test shows the painted and the procedural look side by side: force(true | false) sets the switch without dropping what is loaded, force(null) hands it back
  A.force = (v) => { A.art = v === null || v === undefined ? null : !!v; return A.sync(); };
  A.reset = () => { A.manifest = null; A.state = 'idle'; A.imgs.clear(); A.res.clear(); A.failed = 0; A.gen = (A.gen || 0) + 1; swKey = null; A.on = A.wanted(); A.ver++; };
  A.ensure = (app) => {
    if (app && (app !== A.app || app.frame !== A.syncFrame)) A.sync(app);
    if (!A.on || A.state !== 'idle') return;
    if (!live()) { A.state = 'none'; return; }
    A.state = 'loading';
    const gen = A.gen;
    let go;
    try { go = A.fetchJson ? A.fetchJson(A.base + 'manifest.json') : fetch(A.base + 'manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('manifest ' + r.status)))); } catch (e) { go = Promise.reject(e); }
    Promise.resolve(go).then((m) => {
      if (gen !== A.gen) return;
      const p = parseManifest(m); if (!p) throw new Error('bad manifest');
      A.manifest = p; A.state = 'ready'; A.ver++;
    }).catch(() => { if (gen === A.gen) A.state = 'none'; });
  };
  A.ready = () => A.on && A.state === 'ready' && !!A.manifest;
  A.setManifest = (m) => { const p = parseManifest(m); if (!p) return false; A.manifest = p; A.state = 'ready'; A.res.clear(); return true; }; // tools / tests
  A.def = (id) => (A.manifest && A.manifest.frames[id]) || null;
  A.has = (id) => !!A.def(id);
  A.template = (id) => (A.manifest && A.manifest.templates[id]) || null;
  function load(file) {
    let e = A.imgs.get(file); if (e) return e;
    e = { img: null, ok: false, bad: false }; A.imgs.set(file, e);
    try {
      const img = A.makeImage ? A.makeImage() : new Image();
      img.onload = () => { e.ok = true; A.res.clear(); A.ver++; }; img.onerror = () => { e.bad = true; A.failed++; };
      img.src = A.base + file; e.img = img;
      if (e.img && (e.img.complete === true && (e.img.naturalWidth || e.img.width))) e.ok = true;
    } catch (err) { e.bad = true; A.failed++; }
    return e;
  }
  const pick = (d, use2x) => (use2x ? d.file2x || d.file || d.file1x : d.file1x || d.file || d.file2x);
  function get(group, id, app) {
    if (!A.ready()) return null;
    const d = A.manifest[group] && A.manifest[group][id]; if (!d) return null;
    const use2x = A.use2x(app), key = group + ':' + id + (use2x ? '@2' : '@1');
    const hit = A.res.get(key); if (hit) return hit;
    const atlas = d.atlas ? A.manifest.atlases[d.atlas] : null;
    const host = atlas || d;
    const want = use2x ? [host.file2x, host.file, host.file1x] : [host.file1x, host.file, host.file2x];
    for (const f of want) {
      if (!f) continue;
      const e = load(f);
      if (e.ok) { const out = { img: e.img, def: d, id, src: partSource(d, atlas, e.img) }; A.res.set(key, out); return out; }
      if (!e.bad) return null; // still loading: do not start another size
    }
    return null;
  }
  A.frameImg = (id, app) => get('frames', id, app);
  A.iconImg = (id, app) => get('icons', id, app);
  A.pickFrame = (ids, app) => { for (const id of ids) { const f = get('frames', id, app); if (f) return f; } return null; };
  // draw an icon centred in (x,y,w,h), fitted (contain). false when there is none yet.
  A.drawIcon = (ctx, id, x, y, w, h, app) => {
    const ic = get('icons', id, app); if (!ic) return false;
    const s = Math.min(w / ic.src.lw, h / ic.src.lh), dw = ic.src.lw * s, dh = ic.src.lh * s;
    ctx.drawImage(ic.img, ic.src.sx, ic.src.sy, ic.src.sw, ic.src.sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  };
  // queue every image of a group so frames are there before they are needed ('frames' | 'icons')
  A.preload = (app, groups = ['frames', 'icons']) => { A.ensure(app); if (!A.ready()) return; for (const g of groups) for (const id of Object.keys(A.manifest[g] || {})) get(g, id, app); };
  A.progress = () => { let total = 0, loaded = 0; for (const e of A.imgs.values()) { total++; if (e.ok || e.bad) loaded++; } return { loaded, total, failed: A.failed, state: A.state }; };
  // the card template for a frame: default slots, then the manifest's template, then the frame's own slots
  A.cardTemplate = (fr) => mergeTemplate(CARD_TEMPLATE, A.template('card_front'), fr && fr.def);
  A.cardBackTemplate = (fr) => mergeTemplate(CARD_BACK_TEMPLATE, A.template('card_back'), fr && fr.def);
  A.gen = 0; A.on = A.wanted();
  return A;
}

export const templates = createTemplates();
