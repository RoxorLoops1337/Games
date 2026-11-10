// RIGS: the lazy loader of the painted character rigs (assets/rigs/manifest.json and one packed atlas per character, built by
// tools/graftwork_rig_build.py; the runtime is ui/rig.js). NOTHING is requested until a rig is first asked for: the Ward asks only while the rig
// preview is on (ui/preview.js), the animation lab always. So with the preview off no file under assets/rigs is ever touched.
//
//   rigs.get(id, app, all?)   { rig, img } once the manifest is in and the atlas of THIS character is decoded, else null: the caller draws what it
//                             drew before (the puppet). all: also the rigs that do not ship (ship: false; the lab shows them, the game never asks)
//   rigs.entry(id)            the manifest entry of a character, or null (also while the manifest is on its way)
//   rigs.ids()                every rig of the manifest, in its order
// The atlas is @2x unless the Ward art would be @1x when it is first asked for (assets.use2x: lite tier, data saver, a small backing store); rects
// are in @2x px either way. Atlases are small (about 20 KB, 200 KB decoded), are never evicted and never swapped for the other size, so a figure
// that has turned into its rig never turns back.
// Headless (node: no fetch, no Image) it answers null and asks for nothing. Tests inject fetchJson and makeImage, like ui/assets.js.
import { assets } from './assets.js';
import { makeRig } from './rig.js';

export function createRigs(opts = {}) {
  const R = { base: opts.base || 'assets/rigs/', state: 'idle', manifest: null, imgs: new Map(), made: new Map(), fetchJson: opts.fetchJson || null, makeImage: opts.makeImage || null };
  const live = () => !!R.fetchJson || assets.available();
  R.setBase = (b) => { R.base = b.endsWith('/') ? b : b + '/'; };
  R.reset = () => { R.state = 'idle'; R.manifest = null; R.imgs.clear(); R.made.clear(); };
  function ensure() {
    if (R.state !== 'idle') return;
    if (!live()) { R.state = 'none'; return; }
    R.state = 'loading';
    const url = R.base + 'manifest.json';
    const go = R.fetchJson ? R.fetchJson(url) : fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('rig manifest ' + r.status))));
    Promise.resolve(go).then((m) => {
      if (!m || typeof m !== 'object' || !m.rigs || typeof m.rigs !== 'object') throw new Error('bad rig manifest');
      R.manifest = m; R.state = 'ready';
    }).catch(() => { R.state = 'none'; });
  }
  function load(file) {
    let e = R.imgs.get(file); if (e) return e;
    e = { img: null, ok: false, bad: false }; R.imgs.set(file, e);
    try {
      const img = R.makeImage ? R.makeImage() : new Image(), good = () => { if (!e.bad) e.ok = true; }, fail = () => { if (!e.ok) e.bad = true; };
      img.onerror = fail; try { img.decoding = 'async'; } catch (err) { /* read-only in fakes */ }
      img.src = R.base + file; e.img = img;
      if (!R.makeImage && typeof img.decode === 'function') img.decode().then(good, () => { if (img.complete && img.naturalWidth > 0) good(); else fail(); }); else img.onload = good;
    } catch (err) { e.bad = true; }
    return e;
  }
  R.entry = (id) => (R.manifest && R.manifest.rigs[id]) || null;
  R.ids = () => (R.manifest ? Object.keys(R.manifest.rigs) : []);
  R.get = (id, app, all) => {
    ensure();
    const d = R.entry(id); if (!d || (!d.ship && !all)) return null;
    // one atlas per character, ever: the size asked for first is the one that is drawn, so a change of quality tier (which swaps @2x and @1x for the
    // big Ward art) never sends a rig back to the puppet while another file loads. The other size is asked for only when the first one failed.
    const want = assets.use2x(app) ? [d.file2x, d.file1x] : [d.file1x, d.file2x], have = R.imgs.get(want[1]);
    if (have && !have.bad && want[1]) want.reverse();
    for (const f of want) {
      if (!f) continue;
      const e = load(f);
      if (e.ok) { let rig = R.made.get(id); if (!rig) { try { rig = makeRig(id, d); } catch (err) { rig = null; } R.made.set(id, rig || false); } return rig ? { rig, img: e.img } : null; }
      if (!e.bad) return null; // still loading: do not start the other size
    }
    return null;
  };
  return R;
}
export const rigs = createRigs();
