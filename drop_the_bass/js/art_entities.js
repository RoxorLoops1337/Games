// art_entities.js: facade. Dispatches every call to the doodle_* or the classic art_* implementation, whichever style is active (style.js).
import { isDoodle } from './style.js';
import * as CT from './art_turrets.js';
import * as CE from './art_enemies.js';
import * as CU from './art_ui.js';
import * as DT from './doodle_turrets.js';
import * as DE from './doodle_enemies.js';
import * as DU from './doodle_ui.js';
const T = () => (isDoodle() ? DT : CT), E = () => (isDoodle() ? DE : CE), U = () => (isDoodle() ? DU : CU);
export const drawTurret = (...a) => T().drawTurret(...a);
export const drawTurretIconFlat = (...a) => T().drawTurretIconFlat(...a);
export const drawProjectile = (...a) => T().drawProjectile(...a);
export const drawEnemy = (...a) => E().drawEnemy(...a);
export const drawBoss = (...a) => E().drawBoss(...a);
export const drawGlyph = (...a) => U().drawGlyph(...a);
export const drawIcon = drawGlyph;
export const drawGear = (...a) => U().drawGear(...a);
export const drawCrate = (...a) => U().drawCrate(...a);
export const drawRarityFrame = (...a) => U().drawRarityFrame(...a);
export const GLYPH_NAMES = CU.GLYPH_NAMES;
export const makeCanvas = CU.makeCanvas;
export function setArtScale(n) { for (const m of [CT, CE, CU, DT, DE, DU]) if (m.setArtScale) m.setArtScale(n); }
