// Clawspire -- ART. Optional illustrated art on top of the canvas code.
//
// Every picture in the game is drawn with code in render.js. This module lets
// a PNG dropped into clawspire/art/ replace any of those drawings with no code
// change: ART.load() (called once from GAME.boot) asks the browser for every
// known path, and render.js asks ART.get(kind, key) before drawing. A file
// that is missing simply 404s, get() keeps returning null and the drawn art
// stays. Headless (no Image) load() does nothing and get() is always null.
//
// Kinds -> paths (relative to clawspire/):
//   item     art/items/<artKey>.png        itemId  art/items/id/<itemId>.png
//   enemy    art/enemies/<artKey|enemyId>.png   (boss / elite are aliases)
//   portrait art/portraits/<charId>.png    relic   art/relics/<relicId>.png
//   hex      art/hex/<tileType>.png        status  art/status/<statusId>.png
//   bg       art/bg/act<1..3>.png          mapbg   art/bg/map<1..3>.png
//   title    art/title.png                 logo    art/logo.png
//   cabinet  art/cabinet.png               claw    art/claw/<palm|prong|carriage>.png
//   event    art/events/<eventId>.png      ui      art/ui/<coin|ink|brush>.png
const ART = (() => {
  const ROOT = 'art/';
  const ALIAS = { boss: 'enemy', elite: 'enemy' };
  // Fallback key lists so the manifest is complete even if a sibling module
  // is missing (the real lists come from RENDER / DATA / MAP when present).
  const ITEM_KEYS0 = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask', 'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread', 'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star', 'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice'];
  const ENEMY_KEYS0 = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp', 'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic', 'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist'];
  const HEX_TYPES0 = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event', 'shop', 'rest', 'boss', 'start', 'forge'];
  const CHARS0 = ['knight', 'alchemist', 'rogue'];
  const CLAW_PARTS = { palm: [56, 14, 256, 128], prong: [10, 46, 128, 256], carriage: [46, 14, 256, 128] };
  const UI_KEYS = ['coin', 'ink', 'brush'];

  // kind -> key -> {path, img, ok, done}. Nested plain objects so a lookup
  // in the draw loop never builds a string.
  const recs = Object.create(null);
  let started = false;
  let manifest = null;

  const tbl = (name) => (typeof DATA !== 'undefined' && DATA && DATA[name]) || {};
  const itemKeys = () => (typeof RENDER !== 'undefined' && RENDER && RENDER.ITEM_KEYS) || ITEM_KEYS0;
  const enemyKeys = () => (typeof RENDER !== 'undefined' && RENDER && RENDER.ENEMY_KEYS) || ENEMY_KEYS0;
  const hexTypes = () => (typeof MAP !== 'undefined' && MAP && MAP.TYPES) || HEX_TYPES0;

  // Relative path for (kind, key), or null for an unknown kind.
  function pathOf(kind, key) {
    kind = ALIAS[kind] || kind;
    switch (kind) {
      case 'item': return ROOT + 'items/' + key + '.png';
      case 'itemId': return ROOT + 'items/id/' + key + '.png';
      case 'enemy': return ROOT + 'enemies/' + key + '.png';
      case 'portrait': return ROOT + 'portraits/' + key + '.png';
      case 'relic': return ROOT + 'relics/' + key + '.png';
      case 'hex': return ROOT + 'hex/' + key + '.png';
      case 'bg': return ROOT + 'bg/act' + key + '.png';
      case 'mapbg': return ROOT + 'bg/map' + key + '.png';
      case 'title': return ROOT + 'title.png';
      case 'logo': return ROOT + 'logo.png';
      case 'cabinet': return ROOT + 'cabinet.png';
      case 'claw': return ROOT + 'claw/' + key + '.png';
      case 'status': return ROOT + 'status/' + key + '.png';
      case 'event': return ROOT + 'events/' + key + '.png';
      case 'ui': return ROOT + 'ui/' + key + '.png';
      default: return null;
    }
  }

  // Physics bounds {w, h} of an item shape (poly -> bbox).
  function shapeBox(sh) {
    if (!sh) return [32, 32];
    if (sh.kind === 'circle') return [sh.r * 2, sh.r * 2];
    if (sh.kind === 'box') return [sh.w, sh.h];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const v of sh.verts || []) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return x1 > x0 ? [Math.round((x1 - x0) * 10) / 10, Math.round((y1 - y0) * 10) / 10] : [32, 32];
  }
  // Generation size: long side L, short side by aspect, rounded to 8 px.
  function genFor(w, h, L) {
    const r8 = (v) => Math.max(8, Math.round(v / 8) * 8);
    return w >= h ? [L, r8(L * h / w)] : [r8(L * w / h), L];
  }
  function enemySize(def, art) {
    if (typeof RENDER !== 'undefined' && RENDER && RENDER.enemyBox) {
      const b = RENDER.enemyBox(def || { art }, 1);
      return [Math.round(b.w), Math.round(b.h)];
    }
    return [60, 60];
  }

  /* ART.paths() -> [{kind, key, path, size:[w,h] (px the game draws at, scale 1),
     gen:[w,h] (recommended PNG size, see ART_PROMPTS.md)}], one per path. */
  function paths() {
    if (manifest && started) return manifest;
    const out = [], seen = new Set();
    const add = (kind, key, size, gen) => {
      const path = pathOf(kind, key);
      if (!path || seen.has(path)) return;
      seen.add(path);
      out.push({ kind, key, path, size, gen });
    };
    const items = tbl('ITEMS');
    for (const k of itemKeys()) {
      const first = Object.values(items).find(d => d && d.art === k);
      const sz = shapeBox(first && first.shape);
      add('item', k, sz, genFor(sz[0], sz[1], 512));
    }
    for (const id in items) { const sz = shapeBox(items[id].shape); add('itemId', id, sz, genFor(sz[0], sz[1], 512)); }
    const enemies = tbl('ENEMIES');
    for (const k of enemyKeys()) {
      const first = Object.values(enemies).find(d => d && d.art === k);
      const sz = enemySize(first ? { art: k, size: first.size, tier: first.tier } : { art: k }, k);
      add('enemy', k, sz, genFor(sz[0], sz[1], first && first.tier === 'boss' ? 768 : 512));
    }
    for (const id in enemies) {
      const d = enemies[id], sz = enemySize(d, d.art);
      add('enemy', id, sz, genFor(sz[0], sz[1], d.tier === 'boss' ? 768 : 512));
    }
    const chars = Object.keys(tbl('CHARACTERS'));
    for (const id of chars.length ? chars : CHARS0) add('portrait', id, [96, 96], [512, 512]);
    for (const id in tbl('RELICS')) add('relic', id, [32, 32], [256, 256]);
    for (const id in tbl('STATUS')) add('status', id, [16, 16], [128, 128]);
    for (const tp of hexTypes()) add('hex', tp, [36, 36], [256, 256]);
    for (const a of [1, 2, 3]) add('bg', a, [540, 270], [1080, 540]);
    for (const a of [1, 2, 3]) add('mapbg', a, [540, 960], [1080, 1920]);
    add('title', 'title', [540, 960], [1080, 1920]);
    add('logo', 'logo', [480, 180], [1024, 384]);
    add('cabinet', 'cabinet', [540, 450], [1080, 900]);
    for (const k in CLAW_PARTS) { const c = CLAW_PARTS[k]; add('claw', k, [c[0], c[1]], [c[2], c[3]]); }
    for (const id in tbl('EVENTS')) add('event', id, [240, 160], [768, 512]);
    for (const k of UI_KEYS) add('ui', k, [16, 16], [128, 128]);
    manifest = out;
    return out;
  }

  // Tell the page a UI icon exists so index.html CSS can swap it in.
  function flagUi(key) {
    try { if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) document.documentElement.classList.add('art-ui-' + key); } catch (e) { /* optional */ }
  }

  /* ART.load() -- request every manifest path once. No-op without Image
     (headless) and on repeat calls. Failures are silent: onerror marks the
     record missing and the drawn art stays. */
  function load() {
    if (started || typeof Image === 'undefined') return false;
    started = true;
    manifest = null;
    // The build writes art/manifest.json (the list of PNGs that exist), so a
    // deployed page requests only real files. Without it (a file:// preview,
    // a dev server) every path is probed and the 404s are harmless.
    if (typeof fetch === 'function') {
      fetch(ROOT + 'manifest.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(list => request(Array.isArray(list) ? new Set(list) : null))
        .catch(() => request(null));
    } else request(null);
    return true;
  }
  /* Request the manifest paths, or only those the given set lists. */
  function request(present) {
    for (const m of paths()) {
      if (present && !present.has(m.path.slice(ROOT.length))) {
        const bucket = recs[m.kind] || (recs[m.kind] = Object.create(null));
        bucket[m.key] = { path: m.path, img: null, ok: false, done: true };
        continue;
      }
      const bucket = recs[m.kind] || (recs[m.kind] = Object.create(null));
      const rec = { path: m.path, img: null, ok: false, done: false };
      bucket[m.key] = rec;
      try {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          rec.done = true;
          rec.ok = !!(img.naturalWidth > 0 && img.naturalHeight > 0);
          if (rec.ok && m.kind === 'ui') flagUi(m.key);
        };
        img.onerror = () => { rec.done = true; rec.ok = false; };
        rec.img = img;
        img.src = m.path;
      } catch (e) { rec.done = true; }
    }
  }

  /* ART.get(kind, key) -> a fully loaded, non-broken HTMLImageElement, else null. */
  function get(kind, key) {
    const b = recs[ALIAS[kind] || kind];
    if (!b) return null;
    const r = b[key == null ? kind : key];
    if (!r || !r.ok) return null;
    const img = r.img;
    return img && img.complete !== false && img.naturalWidth > 0 ? img : null;
  }
  const has = (kind, key) => get(kind, key) !== null;
  // Loading progress for debugging: {total, done, found}.
  function status() {
    let total = 0, done = 0, found = 0;
    for (const k in recs) for (const key in recs[k]) { total++; if (recs[k][key].done) done++; if (recs[k][key].ok) found++; }
    return { total, done, found };
  }

  return { load, get, has, paths, pathOf, status, ROOT, _request: request };
})();
