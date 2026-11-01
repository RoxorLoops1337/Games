// art_world.js: facade. Dispatches every call to the doodle_* or the classic art_* implementation, whichever style is active (style.js).
import { isDoodle } from './style.js';
import * as CH from './art_heroes.js';
import * as CV from './art_env.js';
import * as CS from './art_scenes.js';
import * as DH from './doodle_heroes.js';
import * as DV from './doodle_env.js';
import * as DS from './doodle_scenes.js';
const H = () => (isDoodle() ? DH : CH), V = () => (isDoodle() ? DV : CV), S = () => (isDoodle() ? DS : CS);
export const drawHero = (...a) => H().drawHero(...a);
export const drawBust = (...a) => H().drawBust(...a);
export const drawLoopy = (...a) => H().drawLoopy(...a);
export const drawLogo = (...a) => H().drawLogo(...a);
export const drawBackdrop = (...a) => V().drawBackdrop(...a);
export const drawBoard = (...a) => V().drawBoard(...a);
export const drawStageBase = (...a) => V().drawStageBase(...a);
export const drawScene = (...a) => S().drawScene(...a);
export const drawTitle = (...a) => S().drawTitle(...a);
export const SCENE_IDS = CS.SCENE_IDS;
export const makeCanvas = CV.makeCanvas;
export function setArtScale(n) { for (const m of [CH, CV, CS, DH, DV, DS]) if (m.setArtScale) m.setArtScale(n); }
