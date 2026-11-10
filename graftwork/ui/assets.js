// Image assets for the Ward (design/WARD.md "Isometric view and art pipeline"): a lazy loader and cache for assets/ward/manifest.json.
// NOTHING is loaded ahead: an image is asked for by the code that is about to draw it, and that request starts its download.
//
//   manifest: { version, tile:{w,h}, rooms:{id:{file1x,file2x,w,h,floorCx,floorCy,floorW,floorH}},
//               actors:{id:{file1x,file2x,w,h,anchorX,anchorY,kind,scale,walk1x,walk2x}}, icons:{id:{file1x,file2x,w,h}}, cards:{artId:{...}}, cardsById:{b_x:{room}} }
//   Optional animation frames (design/WARD.md 12c): actors[id].frames = { walk:[stem...], atk:[stem...], hit:stem, die:stem, hi3x?:bool }. A stem is the file name
//   without size tag, e.g. 'marrow_walk1' -> actors/marrow_walk1@1x|@2x.webp (and @3x for combat frames when hi3x). Every frame shares the standing frame's canvas, w x h and
//   feet anchor, so it is drawn with the STANDING def. assets.frames(id) normalises the entry, assets.frame(id, stem, app) answers { img, def } or null.
//   Actor ids are hero ids (marrow), enemy ids (bedpan_slime, the_resident, the_resident_l2) and npc_*; walk1x / walk2x is the second step frame.
//   All numbers are in sprite pixels (w x h is the frame both files are drawn into, so @1x and @2x are interchangeable).
//
//   assets.ensure(app)          starts the manifest load once (no-op in node / headless, or when fetch or Image is missing)
//   assets.ready()              true once the manifest is in
//   assets.room(id, app)        { img, def } or null while loading / missing   (also actor, icon, card, cardArt for a building card)
//   assets.kitReady() / kitImg(kind, id, app) / kitRecipeSettled(rc, app) / kitRecipeProgress(rc, app): the modular room kit (assets/ward_kit/manifest.json),
//                               loaded one recipe at a time (data/ward_kit.js, ui/ward_kit_iso.js recipeFor)
// @2x is used unless the backing store is under 0.8 device px per logical px (app.px), then @1x. Every failure is swallowed: callers draw their procedural fallback on null.
const BASE_DEFAULT = 'assets/ward/';
const GROUPS = ['rooms', 'actors', 'icons', 'cards'];

// ---- animation frames: pure helpers (no DOM), shared by the map and the battle ----
const stemList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
const stemOf = (v) => (typeof v === 'string' && v ? v : null);
// a manifest `frames` entry (`walkOk: false` = the painted walk cycle does not read as steps: the walk list is ignored and the procedural walk stays) -> { walk:[stems], atk:[stems], atkBy:{1,2,3}, hit, die, hi3x } or null when it holds nothing usable
export function normalizeFrames(f) {
  if (!f || typeof f !== 'object') return null;
  const walkOk = f.walkOk !== false, walk = walkOk ? stemList(f.walk) : [], atk = stemList(f.atk), hit = stemOf(f.hit), die = stemOf(f.die), atkBy = {};
  for (const st of atk) { const m = /atk([123])$/.exec(st); if (m) atkBy[m[1]] = st; }
  if (!walk.length && !atk.length && !hit && !die) return null;
  return { walk, walkOk, atk, atkBy, hit, die, hi3x: !!f.hi3x };
}
// walk frame for a stride phase ph (counted in steps, a plant at every integer): with n frames the cycle is two steps, a frame per half step, frame 0 at contact.
// n = 4: walk1 (contact), walk2 (passing), walk3 (contact, other foot), walk4 (passing). n = 2 behaves like the old step swap.
export function walkIndex(ph, n) { if (!(n >= 2)) return 0; const i = Math.floor(Math.max(0, ph) * n / 2); return i % n; }
// attack frame for a phase: tell (anticipation, atk1), act and hold (strike, atk2), rec (recovery, atk3; k 0..1 through the recovery). null = no frame, draw the standing pose.
// Missing frames degrade: a strike falls back to atk3 then atk1; a recovery without atk3 holds the strike for its first third.
export function pickAtkFrame(by, phase, k = 0) {
  if (!by) return null;
  if (phase === 'tell') return by[1] || null;
  if (phase === 'act' || phase === 'hold') return by[2] || by[3] || by[1] || null;
  if (phase === 'rec') return by[3] || (k < 0.35 ? (by[2] || by[1] || null) : null);
  return null;
}

export function createAssets(opts = {}) {
  const A = {
    base: opts.base || BASE_DEFAULT, manifest: null, state: 'idle', imgs: new Map(), failed: 0, hits: 0, ver: 0,
    // test / tool hooks: a fetch and an image factory can be injected
    fetchJson: opts.fetchJson || null, makeImage: opts.makeImage || null,
    // the modular room kit (assets/ward_kit/manifest.json): floors, walls, pieces, props. Optional: no kit means every room is a procedural block.
    kit: null, kitState: 'idle', kitBase: opts.kitBase || '',
    clock: 0, budget: opts.budget || 192 * 1048576, evicted: 0, // clock: ms of the last maintain() call, the LRU stamp; budget: decoded bytes kept
  };
  const kitBaseOf = () => A.kitBase || (A.base.endsWith('ward/') ? A.base.slice(0, -5) + 'ward_kit/' : A.base + 'kit/');
  const live = () => !!(A.fetchJson || (typeof fetch === 'function' && typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof window !== 'undefined' && window.location));
  A.available = live;
  A.app = null;
  // Data saver, 2G/3G or a 2 GB device: @1x files (a quarter of the bytes and of the decoded memory). Read once; no navigator.connection (Safari, node) means no opinion.
  A.lowData = (() => { try { const n = typeof navigator !== 'undefined' ? navigator : null, c = n && n.connection; return !!((c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || ''))) || (n && n.deviceMemory && n.deviceMemory <= 2)); } catch (e) { return false; } })();
  A.use2x = (app) => { const a = app || A.app; if (A.lowData || (a && a.perf && a.perf.q.tier !== 'full')) return false; /* lite and minimal: a quarter of the decoded memory */ return !(a && a.px > 0 && a.px < 0.8); }; // by device pixels per logical px, not by CSS scale: a phone draws sprites at 1.2 to 2.5 device px per logical px and @1x there was the pixelated look
  A.setBase = (b) => { A.base = b.endsWith('/') ? b : b + '/'; };
  A.reset = () => { A.manifest = null; A.state = 'idle'; A.imgs.clear(); A.failed = 0; A.kit = null; A.kitState = 'idle'; };
  A.ensure = (app) => {
    if (app) A.app = app;
    ensureKit();
    if (A.state !== 'idle') return;
    if (!live()) { A.state = 'none'; return; }
    A.state = 'loading';
    const go = A.fetchJson ? A.fetchJson(A.base + 'manifest.json') : fetch(A.base + 'manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('manifest ' + r.status))));
    Promise.resolve(go).then((m) => {
      if (!m || typeof m !== 'object' || !m.rooms) throw new Error('bad manifest');
      A.manifest = { version: m.version || 1, tile: m.tile || { w: 128, h: 64 }, rooms: m.rooms || {}, actors: m.actors || {}, icons: m.icons || {}, cards: m.cards || {}, title: m.title && typeof m.title === 'object' ? m.title : {} };
      A.state = 'ready';
    }).catch(() => { A.state = 'none'; });
  };
  function ensureKit() {
    if (A.kitState !== 'idle') return;
    if (!live()) { A.kitState = 'none'; return; }
    A.kitState = 'loading';
    const url = kitBaseOf() + 'manifest.json';
    const go = A.fetchJson ? A.fetchJson(url) : fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('kit manifest ' + r.status))));
    Promise.resolve(go).then((m) => {
      const ok = (o) => o && typeof o === 'object' && !Array.isArray(o);
      if (!ok(m) || !ok(m.floors) || !ok(m.walls) || !ok(m.pieces) || !ok(m.props)) throw new Error('bad kit manifest');
      A.kit = { version: m.version || 1, world: m.world || {}, floors: m.floors, walls: m.walls, pieces: m.pieces, props: m.props };
      A.kitState = 'ready';
    }).catch(() => { A.kitState = 'none'; });
  }
  A.kitReady = () => A.kitState === 'ready' && !!A.kit;
  A.ready = () => A.state === 'ready' && !!A.manifest;
  const defOf = (group, id) => (A.manifest && A.manifest[group] && A.manifest[group][id]) || null;
  A.def = (group, id) => defOf(group, id);
  A.has = (group, id) => !!defOf(group, id);
  // Start one image. Real browsers: img.decode() resolves once the bitmap is decoded OFF the main thread, so the first drawImage never pays a synchronous
  // decode (the long task on the first frame of a screen). Injected image factories (tests) and old browsers keep the plain onload path.
  function begin(e, url) {
    const img = A.makeImage ? A.makeImage() : new Image();
    const good = () => { if (e.ok || e.bad) return; e.ok = true; e.bytes = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0) * 4; e.used = A.clock; A.hits++; A.ver++; };
    const fail = () => { if (e.ok || e.bad) return; e.bad = true; A.failed++; A.ver++; };
    img.onerror = fail;
    try { img.decoding = 'async'; } catch (err) { /* read-only in fakes */ }
    img.src = url;
    e.img = img;
    if (!A.makeImage && typeof img.decode === 'function') img.decode().then(good, () => { if (img.complete && img.naturalWidth > 0) good(); else fail(); });
    else img.onload = good;
  }
  function load(file) {
    let e = A.imgs.get(file);
    if (e) return e;
    e = { img: null, ok: false, bad: false, bytes: 0, used: A.clock };
    A.imgs.set(file, e);
    try { begin(e, A.base + file); } catch (err) { e.bad = true; A.failed++; }
    return e;
  }
  function get(group, id, app, alt) {
    if (!A.ready()) return null;
    const d = defOf(group, id); if (!d) return null;
    const f1 = alt ? (d.walk1x || d.file1x) : d.file1x, fx = alt ? (d.walk2x || d.file2x) : d.file2x;
    const want = A.use2x(app) ? [fx, f1] : [f1, fx];
    for (const f of want) {
      if (!f) continue;
      const e = load(f);
      if (e.ok) { e.used = A.clock; return { img: e.img, def: d }; }
      if (!e.bad) return null; // still loading: do not start the other size
    }
    return null;
  }
  // ---- the kit: images are keyed 'kit:<file>'; pieces, props, floors and walls come back as { img, def } | null ----
  // A kit image is asked for by the recipe that needs it (kitRecipeProgress), never as a whole kit. Two rules keep a room that has shown the kit on the kit:
  // a kit image is never evicted (maintain below; the whole kit is about 25 MB decoded at @2x), and when the wanted size changes (the quality tier, a resize)
  // the size that is already decoded is drawn until the new one is in.
  function kitLoad(file) {
    const key = 'kit:' + file; let e = A.imgs.get(key); if (e) return e;
    e = { img: null, ok: false, bad: false, bytes: 0, used: A.clock }; A.imgs.set(key, e);
    try { begin(e, kitBaseOf() + file); } catch (err) { e.bad = true; A.failed++; }
    return e;
  }
  const kitFile = (d, app) => (A.use2x(app) ? d.file2x || d.file1x || d.file : d.file1x || d.file2x || d.file);
  // the entry to draw for one kit def: the wanted size (its load starts here), else the other size when that one is already decoded
  function kitEntry(d, app) {
    const f = kitFile(d, app); if (!f) return null;
    const e = kitLoad(f); if (e.ok) return e;
    const alt = f === d.file1x ? d.file2x || d.file : d.file1x, o = alt && alt !== f ? A.imgs.get('kit:' + alt) : null;
    return o && o.ok ? o : e;
  }
  A.kitDef = (kind, id) => (A.kit && A.kit[kind] && A.kit[kind][id]) || null;
  A.kitImg = (kind, id, app) => { const d = A.kitDef(kind, id), e = d && kitEntry(d, app); if (!e || !e.ok) return null; e.used = A.clock; return { img: e.img, def: d }; };
  // How far ONE recipe is (floor, wall, its pieces, props, door): the images that have loaded or failed, of all it needs. Asking starts them, so a screen
  // that draws a few rooms downloads those rooms only. out: { loaded, total }
  A.kitRecipeProgress = (rc, app, out = { loaded: 0, total: 0 }) => {
    out.loaded = 0; out.total = 0;
    const one = (kind, id) => { const d = A.kitDef(kind, id); if (!d || !kitFile(d, app)) return; out.total++; const e = kitEntry(d, app); if (e.ok || e.bad) out.loaded++; };
    if (!rc) return out;
    one('floors', rc.floor); one('walls', rc.wall);
    for (const p of rc.pieces || []) one('pieces', p.id);
    for (const p of rc.props || []) one('props', p.id);
    if (rc.doorPiece) one('pieces', rc.doorPiece);
    return out;
  };
  const KP = { loaded: 0, total: 0 };
  // true once every image of this recipe has loaded or failed (starts them)
  A.kitRecipeSettled = (rc, app) => { A.kitRecipeProgress(rc, app, KP); return KP.loaded >= KP.total; };
  // ---- decoded memory: LRU eviction ----
  A.decodedBytes = () => { let n = 0; for (const e of A.imgs.values()) if (e.ok) n += e.bytes || 0; return n; };
  // Drop the least recently drawn images until the decoded total is under 85% of the budget. Never touches an image drawn in the last `keepMs`
  // (so nothing on screen goes away), one still loading, or a kit image (a room never falls back from the kit to its block). A dropped image
  // simply loads again (HTTP cache) if a screen asks for it later.
  A.maintain = (nowMs, budget = A.budget, keepMs = 6000) => {
    A.clock = nowMs;
    let total = A.decodedBytes(); if (total <= budget) return 0;
    const list = []; for (const [k, e] of A.imgs) if (e.ok && !k.startsWith('kit:') && nowMs - (e.used || 0) > keepMs) list.push([k, e]);
    list.sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
    let n = 0; const goal = budget * 0.85;
    for (const [k, e] of list) { if (total <= goal) break; total -= e.bytes || 0; A.imgs.delete(k); n++; }
    A.evicted += n; return n;
  };
  A.room = (id, app) => get('rooms', id, app);
  // ---- animation frames (optional per actor) ----
  A.frames = (id) => { const d = defOf('actors', id); return d ? normalizeFrames(d.frames) : null; };
  // { img, def, stem } for a frame once decoded (the def is the STANDING one: same canvas and feet), else null. hi: prefer the 512 px @3x file (combat frames with hi3x).
  A.frame = (id, stem, app, hi) => {
    if (!A.ready() || !stem) return null;
    const d = defOf('actors', id); if (!d || !normalizeFrames(d.frames)) return null;
    const f2 = `actors/${stem}@2x.webp`, f1 = `actors/${stem}@1x.webp`, f3 = `actors/${stem}@3x.webp`;
    const want = hi && d.frames.hi3x ? [f3, f2, f1] : A.use2x(app) ? [f2, f1] : [f1, f2];
    for (const f of want) { const e = load(f); if (e.ok) { e.used = A.clock; return { img: e.img, def: d, stem }; } if (!e.bad) return null; }
    return null;
  };
  // true once every walk frame of an actor has decoded (a cycle never starts half loaded)
  A.walkReady = (id, app) => { const F = A.frames(id); if (!F || F.walk.length < 2) return false; let ok = true; for (const st of F.walk) if (!A.frame(id, st, app)) ok = false; return ok; };
  A.actor = (id, app, alt) => get('actors', id, app, alt); // alt: the second walk frame (falls back to the first)
  A.icon = (id, app) => get('icons', id, app);
  A.card = (id, app) => get('cards', id, app);
  // the first of several candidate ids that the manifest knows (actor id guessing: 'hero_marrow' then 'hero')
  A.firstOf = (group, ids) => { for (const id of ids) if (defOf(group, id)) return id; return null; };
  A.ids = (group, prefix) => (A.manifest ? Object.keys(A.manifest[group] || {}).filter((k) => k === prefix || k.startsWith(prefix + '_')) : []);
  // actor ids of one kind ('hero' | 'normal' | 'elite' | 'npc'), for enemies the art set does not paint yet
  A.kindIds = (kind) => { const out = []; if (A.manifest) for (const [k, d] of Object.entries(A.manifest.actors || {})) if ((d.kind || (k.startsWith('npc_') ? 'npc' : '')) === kind && !k.endsWith('_l2')) out.push(k); return out; };
  // the illustration of a building card: its own art id (data/ward.js `art`; a room card's art is a room painting, cards[art].fromRoom)
  A.cardArt = (card, app) => (card && card.art ? A.card(card.art, app) : null);
  return A;
}

export const assets = createAssets();
export { GROUPS };
