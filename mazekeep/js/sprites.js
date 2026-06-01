// MAZEKEEP sprite loader + entity→art mapping. Loads the PNG sprite atlas
// (hand-made tower-defense art) and exposes ready Image objects keyed by a
// logical name. The renderer asks for a sprite and, if it isn't loaded (or the
// file failed), falls back to the existing emoji/vector drawing — so the game
// always renders even with no images.
//
// NOTE: the bundled art under assets/sprites/ is a generic 6-family tower set
// reused across Mazekeep's 10 towers as a placeholder. A future custom
// 10-tower sheet can replace the TOWER_FAMILY / per-id mapping below without
// touching the renderer.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const BASE = 'assets/sprites/';

  // Custom 10-tower sheet: 10 columns (one per tower, in this id order) × 3 rows
  // (tier 1/2/3). Cells are sliced by fractional size so it survives the sheet
  // not being an exact multiple of the grid.
  const TOWER_SHEET = 'towers_sheet.png';
  const TOWER_COLS = ['wall', 'arrow', 'cannon', 'frost', 'tesla', 'venom', 'sniper', 'flame', 'pylon', 'mint'];
  const SHEET_COLS = 10, SHEET_ROWS = 3;
  const TOWER_COL = {}; TOWER_COLS.forEach((id, i) => { TOWER_COL[id] = i; });

  // Front-view illustrated towers: instead of spinning the whole sprite (which
  // would tip it over), attacking turrets just mirror horizontally to "face"
  // whichever side the target is on.
  const TOWER_FLIPS = { arrow: 1, sniper: 1, cannon: 1, venom: 1, flame: 1, frost: 1, tesla: 1 };

  // Enemy id → sprite file (chosen by vibe; emoji fallback otherwise).
  const ENEMY_SPRITE = {
    grunt: 'enemies/enemies_03.png',
    runner: 'enemies/enemies_04.png',
    swarm: 'enemies/enemies_30.png',
    armored: 'enemies/enemies_10.png',
    brute: 'enemies/enemies_13.png',
    shield: 'enemies/enemies_05.png',
    flyer: 'enemies/enemies_25.png',
    healer: 'enemies/enemies_29.png',
    splitter: 'enemies/enemies_33.png',
    regen: 'enemies/enemies_26.png',
    juggernaut: 'enemies/enemies_22.png',
    dasher: 'enemies/enemies_06.png',
    bulwark: 'enemies/enemies_14.png',
    spore: 'enemies/enemies_27.png',
    phantom: 'enemies/enemies_28.png',
    // bosses
    colossus: 'enemies/enemies_22.png',
    overmind: 'enemies/enemies_29.png',
    wraithlord: 'enemies/enemies_31.png',
    thefall: 'enemies/enemies_34.png',
  };

  // Projectile look by tower effect/id.
  const PROJECTILE_SPRITE = {
    arrow: 'projectiles/projectiles_01.png',
    sniper: 'projectiles/projectiles_02.png',
    cannon: 'projectiles/projectiles_15.png', // dark bomb
    venom: 'projectiles/projectiles_21.png',
    flame: 'projectiles/projectiles_06.png',
    frost: 'projectiles/projectiles_24.png',
  };

  const images = {};       // path -> {img, ok}
  let started = false;

  function loadOne(path) {
    if (images[path]) return;
    const rec = { img: new Image(), ok: false };
    images[path] = rec;
    rec.img.onload = function () { rec.ok = true; };
    rec.img.onerror = function () { rec.ok = false; };
    rec.img.src = BASE + path;
  }

  // Kick off loading every referenced sprite once.
  function load() {
    if (started) return; started = true;
    try {
      loadOne(TOWER_SHEET);
      for (const k in ENEMY_SPRITE) loadOne(ENEMY_SPRITE[k]);
      for (const k in PROJECTILE_SPRITE) loadOne(PROJECTILE_SPRITE[k]);
    } catch (e) {}
  }

  // Return a ready <img> for a path, or null if not loaded/failed.
  function ready(path) { const r = path && images[path]; return r && r.ok ? r.img : null; }

  // Source rect (in sheet pixels) for a tower's [column,tier] cell, or null.
  function towerCell(id, tier) {
    const sheet = ready(TOWER_SHEET);
    const col = TOWER_COL[id];
    if (!sheet || col == null) return null;
    const cw = sheet.naturalWidth / SHEET_COLS;
    const ch = sheet.naturalHeight / SHEET_ROWS;
    const row = Math.max(0, Math.min(SHEET_ROWS - 1, tier | 0));
    return { img: sheet, sx: col * cw, sy: row * ch, sw: cw, sh: ch };
  }
  function towerFlips(id) { return !!TOWER_FLIPS[id]; }
  function enemyImg(idOrDef) {
    const id = typeof idOrDef === 'string' ? idOrDef : (idOrDef && idOrDef.id);
    return ready(ENEMY_SPRITE[id]);
  }
  function projectileImg(id) { return ready(PROJECTILE_SPRITE[id]); }

  TD.sprites = { load, ready, towerCell, towerFlips, enemyImg, projectileImg };
})();
