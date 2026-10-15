// Interface styles ("skins"). A style is a CSS file (ui/themes/<id>.css, every rule scoped under html[data-ui="<id>"]) and optionally
// a JS module (ui/themes/<id>.js with `export default function init(api)`; may return a dispose function) that generates assets at runtime
// (canvas textures, rendered sprites, SVG filters). 'classic' is the base style.css with no overrides; the default is DEFAULT_THEME (gel).
export const THEMES = [
  { id: 'classic', name: 'Classic Cozy', tech: 'Layered CSS, paper and candy', swatch: ['#fff8e6', '#78cf55', '#ffd95e'] },
  { id: 'gel', name: 'Candy Gel', tech: 'Glossy gradient gel, thick bevels', swatch: ['#9be877', '#3fae2a', '#ffe88a'], css: true },
  { id: 'render3d', name: 'Rendered 3D', tech: 'WebGL-rendered PBR button sprites', swatch: ['#ff8a5c', '#5cc8ff', '#ffe066'], css: true, js: true },
  { id: 'leather', name: 'Tavern Leather', tech: 'Procedural wood, leather, stitching', swatch: ['#8a5a36', '#c9a36b', '#e8c872'], css: true, js: true },
  { id: 'clay', name: 'Squishy Clay', tech: 'Soft-body claymorphism, spring physics', swatch: ['#ffc2d4', '#bfe8ff', '#fff0b0'], css: true, js: true },
  { id: 'jewel', name: 'Glass Jewel', tech: 'SVG lighting filters, gem facets', swatch: ['#ff5c8a', '#4fd0ff', '#ffd54a'], css: true, js: true },
  { id: 'sticker', name: 'Paper Sticker', tech: 'Die-cut outlines, peel highlights', swatch: ['#ffffff', '#ff9ec7', '#ffe14d'], css: true },
  { id: 'gold', name: 'Gilded Fantasy', tech: 'SVG filigree frames, brushed metal', swatch: ['#f6d877', '#8a5cd0', '#2d2250'], css: true, js: true },
  { id: 'comic', name: 'Comic Cel', tech: 'Heavy outlines, halftone, hard shadows', swatch: ['#ffeb3b', '#ff5252', '#222222'], css: true },
  { id: 'keycap', name: 'Keycap 3D', tech: 'True CSS 3D extruded blocks, tilt', swatch: ['#7be0a8', '#f7f2e8', '#ff9f6e'], css: true, js: true },
  { id: 'aurora', name: 'Dreamy Aurora', tech: 'Animated mesh gradients, frosted glass', swatch: ['#a5b4ff', '#ffb3e6', '#9ff0e0'], css: true, js: true },
];
const KEY = 'hearthvale.ui';
// index.html ships the default style inline (html[data-ui] + a link[data-ui-theme]) so the first paint already wears it.
let cur = document.documentElement.dataset.ui || 'classic', link = document.querySelector('link[data-ui-theme]'), dispose = null;
export const DEFAULT_THEME = 'gel';
export const currentTheme = () => cur;
export function themeFromEnv() {
  try { const q = new URLSearchParams(location.search).get('ui'); if (q && THEMES.some((t) => t.id === q)) return q; } catch { /* ignore */ }
  try { const v = localStorage.getItem(KEY); if (v && THEMES.some((t) => t.id === v)) return v; } catch { /* ignore */ }
  return DEFAULT_THEME;
}
/** Switch style: loads its CSS (and JS), sets html[data-ui], remembers the choice. Safe to call repeatedly. */
export async function setTheme(id, { persist = true } = {}) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0]; id = t.id;
  if (persist) { try { localStorage.setItem(KEY, id); } catch { /* ignore */ } }
  if (typeof dispose === 'function') { try { dispose(); } catch { /* ignore */ } } dispose = null;
  const base = new URL('../../ui/themes/', import.meta.url);
  let next = null;
  if (t.css && link && link.dataset.uiTheme === id && !t.js) { next = link; link = null; }
  else if (t.css) {
    next = document.createElement('link'); next.rel = 'stylesheet'; next.href = new URL(id + '.css', base).href; next.dataset.uiTheme = id;
    await new Promise((res) => { next.onload = next.onerror = res; document.head.appendChild(next); setTimeout(res, 1500); });
  }
  if (link) link.remove(); link = next;
  document.documentElement.dataset.ui = id; cur = id;
  if (t.js) { try { const m = await import(new URL(id + '.js', base).href); if (m.default) dispose = await m.default({ root: document.documentElement, id }); } catch (e) { console.warn('[ui theme] ' + id + ' script failed', e); } }
  document.dispatchEvent(new CustomEvent('hv:theme', { detail: id }));
  return id;
}
export function initTheme() { return setTheme(themeFromEnv(), { persist: false }); }
