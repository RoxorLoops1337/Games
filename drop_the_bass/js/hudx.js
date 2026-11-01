// hudx.js: HUD drawing toolkit dispatcher (classic hud.js or doodle_hud.js, per style.js). battle.js imports its HUD helpers from here.
import { isDoodle } from './style.js';
import * as C from './hud.js';
import * as D from './doodle_hud.js';
const H = () => (isDoodle() ? D : C);
export const FONT = C.FONT;
export const setHudScale = (n) => { C.setHudScale(n); if (D.setHudScale) D.setHudScale(n); };
export const rrectPath = (...a) => H().rrectPath(...a);
export const rrect = (...a) => H().rrect(...a);
export const mix = (...a) => H().mix(...a);
export const lighten = (...a) => H().lighten(...a);
export const darken = (...a) => H().darken(...a);
export const rgba = (...a) => H().rgba(...a);
export const glass = (...a) => H().glass(...a);
export const button = (...a) => H().button(...a);
export const liquidBar = (...a) => H().liquidBar(...a);
export const bezel = (...a) => H().bezel(...a);
export const text = (...a) => H().text(...a);
export const wrapText = (...a) => H().wrapText(...a);
