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
// o.maxW (fit to width) works in both styles: the doodle HUD does it itself, the classic one is fitted here with the same helper
export const text = (ctx, s, x, y, size, color, align, weight, o) => {
  if (o && o.maxW && !isDoodle()) {
    const f = D.fitText(ctx, s, size, o.maxW, o.minScale, (c, str, sz) => { c.save(); c.font = '900 ' + sz + 'px ' + FONT; const w = c.measureText ? c.measureText(str).width : str.length * sz * 0.55; c.restore(); return w; });
    return C.text(ctx, f.s, x, y, f.size, color, align, weight, o);
  }
  return H().text(ctx, s, x, y, size, color, align, weight, o);
};
export const fitText = (...a) => D.fitText(...a);
export const wrapText = (...a) => H().wrapText(...a);
