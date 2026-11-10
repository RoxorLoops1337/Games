// PREVIEW SWITCHES: art that is built in but is not the default look yet (painted card frames and UI parts: 'art'; character rigs: 'rig').
// Off for every player unless the page URL asks (?art=1, ?rig=1, or ?preview=1 for both; =0 forces off) or the Settings toggle "Painted art (preview)"
// is on (settings.previewArt). One place, so making a look the default later is a one-line change in PREVIEW_DEFAULT.
export const PREVIEW_DEFAULT = { art: false, rig: false };
function previewQuery(name, search) {
  let p;
  try { p = new URLSearchParams(search === undefined ? (typeof location !== 'undefined' && location ? location.search : '') : search); } catch (e) { return null; }
  const v = p.has(name) ? p.get(name) : p.has('preview') ? p.get('preview') : null;
  return v === null ? null : v !== '0' && v !== 'false' && v !== 'off';
}
export function previewOn(name, settings, search) {
  const q = previewQuery(name, search);
  if (q !== null) return q;
  return !!(settings && settings.previewArt) || !!PREVIEW_DEFAULT[name];
}
