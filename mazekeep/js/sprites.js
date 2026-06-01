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

  // Tower families: [tier1, tier2, tier3] sprite files (Ice has only 2 → repeat).
  const FAM = {
    archer: ['towers/towers_01.png', 'towers/towers_02.png', 'towers/towers_03.png'],
    cannon: ['towers/towers_04.png', 'towers/towers_05.png', 'towers/towers_06.png'],
    magic:  ['towers/towers_07.png', 'towers/towers_08.png', 'towers/towers_09.png'],
    fire:   ['towers/towers_10.png', 'towers/towers_11.png', 'towers/towers_12.png'],
    poison: ['towers/towers_13.png', 'towers/towers_14.png', 'towers/towers_15.png'],
    ice:    ['towers/towers_16.png', 'towers/towers_17.png', 'towers/towers_17.png'],
  };
  // Mazekeep tower id → family (towers without a clean match stay on vector art).
  const TOWER_FAMILY = {
    arrow: 'archer', sniper: 'archer',
    cannon: 'cannon',
    frost: 'ice',
    tesla: 'magic',
    venom: 'poison',
    flame: 'fire',
    // wall, pylon, mint → no sprite (rendered as styled blocks)
  };
  // Attacking turrets rotate toward their target; utility/blocker art stays upright.
  const TOWER_ROTATES = { arrow: 1, sniper: 1, cannon: 1, frost: 0, tesla: 0, venom: 1, flame: 1 };

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
      const all = new Set();
      for (const k in FAM) FAM[k].forEach((p) => all.add(p));
      for (const k in ENEMY_SPRITE) all.add(ENEMY_SPRITE[k]);
      for (const k in PROJECTILE_SPRITE) all.add(PROJECTILE_SPRITE[k]);
      all.forEach(loadOne);
    } catch (e) {}
  }

  // Return a ready <img> for a path, or null if not loaded/failed.
  function ready(path) { const r = path && images[path]; return r && r.ok ? r.img : null; }

  function towerImg(id, tier) {
    const fam = TOWER_FAMILY[id]; if (!fam) return null;
    const files = FAM[fam]; if (!files) return null;
    return ready(files[Math.max(0, Math.min(2, tier | 0))]);
  }
  function towerRotates(id) { return !!TOWER_ROTATES[id]; }
  function enemyImg(idOrDef) {
    const id = typeof idOrDef === 'string' ? idOrDef : (idOrDef && idOrDef.id);
    return ready(ENEMY_SPRITE[id]);
  }
  function projectileImg(id) { return ready(PROJECTILE_SPRITE[id]); }

  TD.sprites = { load, ready, towerImg, towerRotates, enemyImg, projectileImg, TOWER_FAMILY };
})();
