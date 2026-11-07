// Recording canvas for the card identity guard (tests/graftwork_templates.test.mjs): logs every Canvas2D call, property set and
// offscreen canvas into one list, so two renders can be compared call for call (hash). Not a test file.
import { createHash } from 'node:crypto';

export function makeRecorder() {
  const log = []; let nid = 0;
  const fmt = (v) => {
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    if (v && typeof v === 'object') return v.__id ? v.__id : Array.isArray(v) ? '[' + v.map(fmt).join(',') + ']' : '{}';
    return String(v);
  };
  const mkCtx = (owner) => {
    const store = {};
    const grad = (kind) => { const o = { __id: kind + '#' + (nid++) }; o.addColorStop = (p, c) => log.push(o.__id + '.stop(' + fmt(p) + ',' + c + ')'); return o; };
    return new Proxy(store, {
      has: (t, k) => k === 'letterSpacing' || k in t,
      get(t, k) {
        if (typeof k === 'symbol') return undefined;
        if (k === 'canvas') return owner;
        if (k in t) return t[k];
        if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { const g = grad('grad'); log.push(k + '(' + a.map(fmt).join(',') + ')=' + g.__id); return g; };
        if (k === 'createPattern') return (img, rep) => { const p = { __id: 'pat#' + (nid++) }; log.push('createPattern(' + fmt(img) + ',' + rep + ')=' + p.__id); return p; };
        if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return (...a) => { log.push(owner.__id + ':' + k + '(' + a.map(fmt).join(',') + ')'); };
      },
      set(t, k, v) { t[k] = v; log.push(owner.__id + ':.' + String(k) + '=' + fmt(v)); return true; },
    });
  };
  const newCanvas = () => { const c = { __id: 'cv#' + (nid++), width: 0, height: 0, style: {} }; c.getContext = () => (c.__g || (c.__g = mkCtx(c))); return c; };
  const root = newCanvas(); root.__id = 'root';
  return {
    log, root, ctx: root.getContext(),
    install() {
      globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
      globalThis.performance = globalThis.performance || { now: () => Date.now() };
      globalThis.document = { createElement: () => { const c = newCanvas(); log.push('new ' + c.__id); return c; } };
      globalThis.Path2D = globalThis.Path2D || class {};
    },
    hash() { return createHash('sha1').update(log.join('\n')).digest('hex'); },
  };
}

// Draws a fixed set of cards (all types, rarities, states) and card backs; returns { hash, calls }.
export async function renderHash() {
  const R = makeRecorder(); R.install();
  const { CARD_LIST, GRAFT_LIST } = await import('../graftwork/data/index.js');
  const { cardSpec } = await import('../graftwork/engine/cards.js');
  const C = await import('../graftwork/art/cards.js');
  const pick = (f) => CARD_LIST.find(f);
  const base = [
    pick((c) => c.type === 'attack' && c.rarity === 'common'), pick((c) => c.type === 'attack' && c.rarity === 'rare'),
    pick((c) => c.type === 'skill' && c.rarity === 'uncommon'), pick((c) => c.type === 'power' && c.rarity === 'rare'),
    pick((c) => c.type === 'junk'), pick((c) => c.type === 'skill' && c.rarity === 'starter'),
  ].filter(Boolean);
  const gids = GRAFT_LIST.slice(0, 3).map((g) => g.id);
  let uid = 0;
  for (const c of base) {
    for (const [up, ng] of [[0, 0], [1, 2], [0, 3]]) {
      const spec = cardSpec({ uid: ++uid, id: c.id, grafts: gids.slice(0, ng), up });
      C.drawCard(R.ctx, spec, 100, 100, { t: 1.25 });
      C.drawCard(R.ctx, spec, 100, 100, { t: 2, compact: true, tithed: ng === 2, jam: ng === 3, hover: true, glow: 0.6 });
      C.drawCard(R.ctx, spec, 100, 100, { t: 3, tilt: { x: 0.4, y: -0.3 }, mark: 'numb', cost: 2, scale: 1.2, rot: 0.1, selected: ng === 0 });
    }
  }
  for (const id of C.BACK_IDS) C.drawCardBack(R.ctx, 50, 50, { t: 0.5, back: id });
  C.drawCardBack(R.ctx, 50, 50, { t: 1, back: 'plain', hero: 'marrow', act: 2, hover: true, dim: 0.3 });
  for (const g of GRAFT_LIST.slice(0, 4)) C.drawGraftPatch(R.ctx, g, 10, 10, 200, 240, { hover: true });
  return { hash: R.hash(), calls: R.log.length };
}
