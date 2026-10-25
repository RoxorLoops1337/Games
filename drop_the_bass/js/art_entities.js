// art_entities.js: facade. Everything the game and the tests import from here is implemented in the art_* modules.
import * as T from './art_turrets.js';
import * as E from './art_enemies.js';
import * as U from './art_ui.js';
export { drawTurret, drawTurretIconFlat, drawProjectile } from './art_turrets.js';
export { drawEnemy, drawBoss } from './art_enemies.js';
export { drawGlyph, drawIcon, drawGear, drawCrate, drawRarityFrame, GLYPH_NAMES } from './art_ui.js';
export { makeCanvas } from './art_ui.js';
export function setArtScale(n) { for (const m of [T, E, U]) if (m.setArtScale) m.setArtScale(n); }
