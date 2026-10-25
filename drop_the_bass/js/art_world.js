// art_world.js: facade. Everything the game and the tests import from here is implemented in the art_* modules.
import * as H from './art_heroes.js';
import * as V from './art_env.js';
import * as S from './art_scenes.js';
export { drawHero, drawBust, drawLoopy, drawLogo } from './art_heroes.js';
export { drawBackdrop, drawBoard, drawStageBase } from './art_env.js';
export { drawScene, drawTitle, SCENE_IDS } from './art_scenes.js';
export { makeCanvas } from './art_env.js';
export function setArtScale(n) { for (const m of [H, V, S]) if (m.setArtScale) m.setArtScale(n); }
