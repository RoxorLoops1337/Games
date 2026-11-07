// Image assets for the Ward (design/WARD.md "Isometric view and art pipeline"): a lazy loader and cache for assets/ward/manifest.json.
//
//   manifest: { version, tile:{w,h}, rooms:{id:{file1x,file2x,w,h,floorCx,floorCy,floorW,floorH}},
//               actors:{id:{file1x,file2x,w,h,anchorX,anchorY,kind,scale,walk1x,walk2x}}, icons:{id:{file1x,file2x,w,h}}, cards:{artId:{...}}, cardsById:{b_x:{room}} }
//   Actor ids are hero ids (marrow), enemy ids (bedpan_slime, the_resident, the_resident_l2) and npc_*; walk1x / walk2x is the second step frame.
//   All numbers are in sprite pixels (w x h is the frame both files are drawn into, so @1x and @2x are interchangeable).
//
//   assets.ensure(app)          starts the manifest load once (no-op in node / headless, or when fetch or Image is missing)
//   assets.ready()              true once the manifest is in
//   assets.room(id, app)        { img, def } or null while loading / missing   (also actor, icon, card)
//   assets.preload(app, kinds)  queue every image of the given groups (rooms, actors by default); progress() says how far it is
//   assets.progress()           { loaded, total, failed, state }  state: 'idle' | 'loading' | 'ready' | 'none'
//   assets.kitReady() / kitImg(kind, id, app) / kitSettled(app): the modular room kit (assets/ward_kit/manifest.json), see data/ward_kit.js
// @1x is used on phone scales (app.scale < 0.8), @2x on desktop. Every failure is swallowed: callers draw their procedural fallback on null.
const BASE_DEFAULT = 'assets/ward/';
const GROUPS = ['rooms', 'actors', 'icons', 'cards'];

export function createAssets(opts = {}) {
  const A = {
    base: opts.base || BASE_DEFAULT, manifest: null, state: 'idle', imgs: new Map(), failed: 0, hits: 0,
    // test / tool hooks: a fetch and an image factory can be injected
    fetchJson: opts.fetchJson || null, makeImage: opts.makeImage || null,
    // the modular room kit (assets/ward_kit/manifest.json): floors, walls, pieces, props. Optional: no kit means every room is painted.
    kit: null, kitState: 'idle', kitBase: opts.kitBase || '',
  };
  const kitBaseOf = () => A.kitBase || (A.base.endsWith('ward/') ? A.base.slice(0, -5) + 'ward_kit/' : A.base + 'kit/');
  const live = () => !!(A.fetchJson || (typeof fetch === 'function' && typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof window !== 'undefined' && window.location));
  A.available = live;
  A.app = null;
  A.use2x = (app) => { const a = app || A.app; return !(a && a.scale > 0 && a.scale < 0.8); };
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
      A.manifest = { version: m.version || 1, tile: m.tile || { w: 128, h: 64 }, rooms: m.rooms || {}, actors: m.actors || {}, icons: m.icons || {}, cards: m.cards || {} };
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
  function load(file) {
    let e = A.imgs.get(file);
    if (e) return e;
    e = { img: null, ok: false, bad: false };
    A.imgs.set(file, e);
    try {
      const img = A.makeImage ? A.makeImage() : new Image();
      img.onload = () => { e.ok = true; A.hits++; };
      img.onerror = () => { e.bad = true; A.failed++; };
      img.src = A.base + file;
      e.img = img;
    } catch (err) { e.bad = true; A.failed++; }
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
      if (e.ok) return { img: e.img, def: d };
      if (!e.bad) return null; // still loading: do not start the other size
    }
    return null;
  }
  // ---- the kit: images are keyed 'kit:<file>'; pieces, props, floors and walls come back as { img, def } | null ----
  const KIT_GROUPS = ['floors', 'walls', 'pieces', 'props'];
  function kitLoad(file) {
    const key = 'kit:' + file; let e = A.imgs.get(key); if (e) return e;
    e = { img: null, ok: false, bad: false }; A.imgs.set(key, e);
    try { const img = A.makeImage ? A.makeImage() : new Image(); img.onload = () => { e.ok = true; A.hits++; }; img.onerror = () => { e.bad = true; A.failed++; }; img.src = kitBaseOf() + file; e.img = img; } catch (err) { e.bad = true; A.failed++; }
    return e;
  }
  const kitFile = (d, app) => (A.use2x(app) ? d.file2x || d.file1x || d.file : d.file1x || d.file2x || d.file);
  A.kitDef = (kind, id) => (A.kit && A.kit[kind] && A.kit[kind][id]) || null;
  A.kitImg = (kind, id, app) => { const d = A.kitDef(kind, id); if (!d) return null; const f = kitFile(d, app); if (!f) return null; const e = kitLoad(f); return e.ok ? { img: e.img, def: d } : null; };
  A.kitPreload = (app) => { if (!A.kitReady()) return; for (const k of KIT_GROUPS) for (const d of Object.values(A.kit[k])) { const f = kitFile(d, app); if (f) kitLoad(f); } };
  // true once every kit image of this scale has loaded or failed (the renderer waits for it so a room never flips from painted to modular piece by piece)
  A.kitSettled = (app) => { if (!A.kitReady()) return false; A.kitPreload(app); for (const k of KIT_GROUPS) for (const d of Object.values(A.kit[k])) { const f = kitFile(d, app); if (!f) continue; const e = A.imgs.get('kit:' + f); if (!e || (!e.ok && !e.bad)) return false; } return true; };
  A.kitProgress = (app) => { let total = 0, loaded = 0; if (A.kitReady()) for (const k of KIT_GROUPS) for (const d of Object.values(A.kit[k])) { const f = kitFile(d, app); if (!f) continue; total++; const e = A.imgs.get('kit:' + f); if (e && (e.ok || e.bad)) loaded++; } return { loaded, total, state: A.kitState }; };
  A.room = (id, app) => get('rooms', id, app);
  A.actor = (id, app, alt) => get('actors', id, app, alt); // alt: the second walk frame (falls back to the first)
  A.icon = (id, app) => get('icons', id, app);
  A.card = (id, app) => get('cards', id, app);
  A.preload = (app, kinds = ['rooms', 'actors']) => {
    A.ensure(app);
    if (!A.ready()) return;
    for (const g of kinds) for (const id of Object.keys(A.manifest[g] || {})) { get(g, id, app); if (g === 'actors') get(g, id, app, true); }
  };
  A.progress = (kinds = ['rooms', 'actors']) => {
    let total = 0, loaded = 0;
    if (A.ready()) for (const g of kinds) for (const d of Object.values(A.manifest[g] || {})) {
      total++;
      const e1 = d.file1x && A.imgs.get(d.file1x), e2 = d.file2x && A.imgs.get(d.file2x);
      if ((e1 && e1.ok) || (e2 && e2.ok)) loaded++;
    }
    return { loaded, total, failed: A.failed, state: A.state };
  };
  // the first of several candidate ids that the manifest knows (actor id guessing: 'hero_marrow' then 'hero')
  A.firstOf = (group, ids) => { for (const id of ids) if (defOf(group, id)) return id; return null; };
  A.ids = (group, prefix) => (A.manifest ? Object.keys(A.manifest[group] || {}).filter((k) => k === prefix || k.startsWith(prefix + '_')) : []);
  // actor ids of one kind ('hero' | 'normal' | 'elite' | 'npc'), for enemies the art set does not paint yet
  A.kindIds = (kind) => { const out = []; if (A.manifest) for (const [k, d] of Object.entries(A.manifest.actors || {})) if ((d.kind || (k.startsWith('npc_') ? 'npc' : '')) === kind && !k.endsWith('_l2')) out.push(k); return out; };
  // the card illustration for a building card: its own art id, else the diorama of the room it builds
  A.cardArt = (card, app) => { const a = card && card.art && A.card(card.art, app); if (a) return { ...a, kind: 'card' }; const m = A.ready() && A.manifest.cardsById && A.manifest.cardsById[card && card.id]; const ca = m && m.card && A.card(m.card, app); if (ca) return { ...ca, kind: 'card' }; const rm = m && m.room ? A.room(m.room, app) : (card && card.kind === 'room' ? A.room(card.room, app) : null); return rm ? { ...rm, kind: 'room' } : null; };
  return A;
}

export const assets = createAssets();
export { GROUPS };
