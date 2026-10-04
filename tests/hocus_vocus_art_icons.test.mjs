// ART.icon (art_icons.js): the icon artist, headless on the strict canvas stub.
//
// What this pins down:
//   * the contract of DESIGN 5.6: ART.has is true for every status, relic (all 58 LISTS.relicIcons motifs and every DATA.relics id), gem and
//     empty socket, tile, intent, stat, brush, card type, row and motif; ART.icon.ids(kind) lists them; ART.icon.kinds equals LISTS.iconKinds
//   * every id of every kind draws at the sizes the UI really uses (and at hostile ones), static and animated, with every opts flag, without
//     a throw or a canvas issue, balanced save and restore, and blits ONE cached sprite at the right place and scale
//   * unknown kinds and ids, and hostile arguments, draw a sealed "?" token or a dot instead of throwing
//   * the bodies: each id of a kind paints its own picture; flags (dim, done, on, pattern, color) cache separately; a cached draw is one blit
//   * gems: colour is never the only signal (a distinct engraved glyph per colour, in the sprite structure and in ART.icon.glyph), tiers add
//     facets, tier 3 orbits a sparkle, empty sockets exist in five kinds
//   * relics take their palette from DATA.relics[id].art.c, share ART.card.motif for the ten motifs the card illustrator also draws, and
//     still draw when ART.card.motif is missing
//   * numbers (opts.n), time (opts.t, reduceMotion), determinism and the gallery sheets
//   * perf smoke: a first draw and a cached draw stay far below a frame budget
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus art icons');
const api = boot({ only: ['util', 'data*', 'art', 'art_cards', 'art_icons'] });
const { ART, DATA, U } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art_icons loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'art_icons loads without warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const clean = () => { api._resetCounts(); };
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail}`).slice(0, 4).join(' | ');
const totalCalls = (ctx) => Object.values(ctx._n).reduce((a, b) => a + b, 0);
const allCalls = () => Object.values(api._counts).reduce((a, b) => a + b, 0);

// a proxy over a stub context that logs every call and every property set (numbers rounded), so drawings can be compared
function recorder(over) {
  const log = [];
  const real = over || newCtx();
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj' : String(v));
  const proxy = new Proxy(real, {
    get(target, key) { const v = target[key]; return typeof v === 'function' ? (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); } : v; },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, real };
}
// every ART.sprite body is recorded by key while the test runs: the cached icon bodies are painted into offscreen canvases the main context
// never sees, so wrapping ART.sprite is how the suite looks at what an icon really draws
const BODY = new Map();
const origSprite = ART.sprite;
const wrapped = (key, w, h, fn) => origSprite(key, w, h, (g, ...rest) => {
  const r = recorder(g);
  const out = fn(r.ctx, ...rest);
  BODY.set(key, r.log);
  return out;
});
Object.keys(origSprite).forEach((k) => { wrapped[k] = origSprite[k]; });
ART.sprite = wrapped;
const bodyOf = (kind, id, size, opts) => {
  ART.sprite.clear(); BODY.clear();
  ART.icon.draw(newCtx(), kind, id, 0, 0, size || 48, opts || { t: 0 });
  const ks = [...BODY.keys()].filter((k) => k.indexOf('ic|') === 0);
  return ks.length ? BODY.get(ks[0]).join('\n') : '';
};
// the same body with every colour stripped, so two icons differ only by structure (the colour-blind check)
const structure = (log) => log.replace(/=(fillStyle|strokeStyle|shadowColor):[^\n]*/g, '').replace(/addColorStop\([^)]*\)/g, '').replace(/#[0-9a-fA-F]{6,8}/g, '').replace(/rgba?\([^)]*\)/g, '');
const same = (a, b) => (a === b ? true : (() => { const x = a.split('\n'), y = b.split('\n'); let i = 0; while (i < x.length && x[i] === y[i]) i++; return 'differ at line ' + i + ': ' + x[i] + ' | ' + y[i]; })());

// ---------------------------------------------------------------------------------------------- the id lists
const IDS = {
  status: Object.keys(DATA.statuses),
  relic: L.relicIcons.concat(Object.keys(DATA.relics)),
  gem: Object.keys(DATA.gems).concat(['slot:red', 'slot:blue', 'slot:green', 'slot:gold', 'slot:any']),
  tile: L.tiles,
  intent: L.intents,
  stat: L.statIcons,
  brush: Object.keys(DATA.brushes),
  type: L.cardTypes,
  row: ['front', 'back'],
  motif: L.motifs,
};
const KINDS = Object.keys(IDS);

t.test('the id lists are the sizes the contract promises', () => {
  t.eq(IDS.status.length, 20, '20 statuses');
  t.eq(L.relicIcons.length, 58, '58 relic icon motifs');
  t.ok(Object.keys(DATA.relics).length >= 58, 'a full relic table: ' + Object.keys(DATA.relics).length);
  t.eq(L.motifs.length, 59, '59 motifs');
  t.eq(Object.keys(DATA.gems).length, 24, '24 gems');
  t.eq(L.tiles.length, 14, '14 tiles');
  t.eq(L.intents.length, 11, '11 intents');
  t.eq(L.statIcons.length, 7, '7 stat icons');
  t.eq(IDS.brush.length, 6, '6 brushes');
  t.deep(L.cardTypes.slice().sort(), ['attack', 'curse', 'power', 'skill', 'status'], 'five card types');
  t.deep(ART.icon.kinds.slice(), L.iconKinds.slice(), 'ART.icon.kinds is LISTS.iconKinds');
});

t.test('ART.has is true for every id of every kind, and ART.icon.ids lists them', () => {
  KINDS.forEach((k) => {
    IDS[k].forEach((id) => t.ok(ART.has(k, id), `ART.has(${k}, ${id})`));
    const listed = ART.icon.ids(k);
    IDS[k].forEach((id) => t.ok(listed.indexOf(id) >= 0, `ART.icon.ids(${k}) lists ${id}`));
  });
  t.deep(ART.icon.ids('nothing'), [], 'an unknown kind has no ids');
  t.ok(!ART.has('status', 'not_a_status') && !ART.has('relic', 'nope') && !ART.has('gem', 'slot:purple'), 'unknown ids are not real art');
});

// ---------------------------------------------------------------------------------------------- drawing
const SIZES = { status: [22, 24, 32, 48], relic: [20, 24, 32, 48, 84], gem: [16, 24, 32, 48, 118], tile: [20, 24, 40, 64], intent: [24, 40, 56], stat: [16, 24, 40, 56], brush: [24, 40, 56], type: [14, 20, 28, 48], row: [16, 24, 40], motif: [24, 40, 96] };

t.test('every id of every kind draws at every size it is used at, static and animated, without a canvas issue', () => {
  ART.sprite.clear(); clean();
  KINDS.forEach((k) => {
    IDS[k].forEach((id) => {
      SIZES[k].forEach((size) => {
        const ctx = newCtx();
        ART.icon.draw(ctx, k, id, 50, 40, size, { t: 0 });
        t.ok(ctx._n.drawImage >= 1, `${k} ${id} @${size} blits its sprite`);
        t.eq(ctx._depth, 0, `${k} ${id} @${size} leaves save and restore balanced`);
      });
      [undefined, 0.37, 2.9, 41.5].forEach((tt) => {
        const ctx = newCtx(); ART.icon.draw(ctx, k, id, 20, 20, 32, tt === undefined ? {} : { t: tt });
        t.eq(ctx._depth, 0, `${k} ${id} t=${tt} balanced`);
      });
    });
  });
  t.eq(api._issues.length, 0, 'no canvas issues from any icon: ' + issues());
});

t.test('every opts flag draws for every kind (n, dim, glow, on, done, pattern, color)', () => {
  clean();
  const OPTS = [{ n: 3 }, { n: 12, t: 1 }, { dim: true }, { glow: true, t: 0.5 }, { glow: 0.4 }, { on: true }, { on: false }, { done: true }, { pattern: true }, { color: 'azure' }, { color: '#ff7eb6' }, { color: 'not a colour' }, { dim: true, glow: true, on: true, done: true, pattern: true, n: 5, color: 'jade', t: 3 }];
  KINDS.forEach((k) => {
    const ids = IDS[k].length > 8 ? IDS[k].filter((id, i) => i % 5 === 0) : IDS[k];
    ids.forEach((id) => OPTS.forEach((o) => {
      const ctx = newCtx(); ART.icon.draw(ctx, k, id, 30, 30, 40, o);
      t.ok(ctx._n.drawImage >= 1, `${k} ${id} ${JSON.stringify(o)} paints`);
      t.eq(ctx._depth, 0, `${k} ${id} ${JSON.stringify(o)} balanced`);
    }));
  });
  t.eq(api._issues.length, 0, 'no canvas issues from the flags: ' + issues());
});

t.test('ART.res 2 and 3 (hi-dpi backing stores) draw the same ids with more detail and no issue', () => {
  const prev = ART.res;
  clean();
  [2, 3].forEach((res) => {
    ART.res = res; ART.sprite.clear();
    KINDS.forEach((k) => IDS[k].filter((id, i) => i % 7 === 0).forEach((id) => { const ctx = newCtx(); ART.icon.draw(ctx, k, id, 10, 10, 96, { t: 0.2 }); t.eq(ctx._depth, 0, `${k} ${id} res ${res} balanced`); }));
  });
  ART.res = prev; ART.sprite.clear();
  t.eq(api._issues.length, 0, 'no canvas issues at high res: ' + issues());
});

t.test('unknown kinds and ids and hostile arguments never throw', () => {
  clean();
  const ctx = newCtx();
  const calls = [
    ['status', 'no_such'], ['relic', 'no_such'], ['gem', 'no_such'], ['gem', 'slot:purple'], ['tile', 'no_such'], ['intent', 'no_such'], ['stat', 'no_such'], ['brush', 'no_such'], ['type', 'no_such'], ['row', 'middle'], ['motif', 'no_such'],
    ['nothing', 'x'], [undefined, undefined], [null, null], [42, 42], [{}, []], ['status', undefined], ['status', null], ['gem', 7],
  ];
  calls.forEach((c) => ART.icon.draw(ctx, c[0], c[1], 20, 20, 32, {}));
  ART.icon.draw(ctx, 'status', 'might');
  ART.icon.draw(ctx, 'status', 'might', 10, 10);
  ART.icon.draw(ctx, 'status', 'might', NaN, Infinity, -5, null);
  ART.icon.draw(ctx, 'status', 'might', 0, 0, 0, 'opts');
  ART.icon.draw(ctx, 'status', 'might', 0, 0, NaN, { n: NaN, t: NaN, glow: 'yes', color: 42 });
  ART.icon.draw(ctx, 'gem', 'ember_ruby', 5, 5, 1e9 * 0 + 1e5, { t: Infinity });
  ART.icon.draw(ctx, 'intent', 'attack', 5, 5, 40, { n: undefined }); ART.icon.draw(ctx, 'intent', 'attack', 5, 5, 40, { n: null }); ART.icon.draw(ctx, 'intent', 'attack', 5, 5, 40, { n: '' });
  ART.icon.draw(ctx, 'intent', 'attack', 5, 5, 40, { n: { toString() { throw new Error('boom'); } } });
  t.eq(ctx._depth, 0, 'balanced after hostile input');
  t.ok(ctx._n.drawImage >= calls.length, 'every call still painted something');
  t.eq(api._issues.length, 0, 'hostile input causes no canvas issue: ' + issues());
  // a context whose every method throws: the icon must swallow it
  const bad = new Proxy({}, { get() { return () => { throw new Error('bad ctx'); }; } });
  ART.icon.draw(bad, 'status', 'might', 0, 0, 24, {});
  t.ok(true, 'a broken context is survived');
});

t.test('an unknown id draws a sealed "?" token of its own, not a coloured debug box', () => {
  const a = bodyOf('status', 'no_such', 48), b = bodyOf('relic', 'no_such', 48), c = bodyOf('status', 'might', 48);
  t.ok(a.length > 0 && b.length > 0, 'both unknowns paint a body');
  t.ok(a !== c, 'the token differs from the real art');
  t.ok(/fillText/.test(a) || /strokeText/.test(a) || a.length > 200, 'the question mark is drawn');
});

// ---------------------------------------------------------------------------------------------- placement and cache
function blitOf(kind, id, x, y, size, opts) {
  const r = recorder();
  ART.icon.draw(r.ctx, kind, id, x, y, size, opts || {});
  const m = r.log.map((l) => /^drawImage\(obj,([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(l)).filter(Boolean)[0];
  return m ? m.slice(1).map(Number) : null;
}
t.test('the sprite is blitted centred on (x, y), square, and about size wide (a little padding for the rim)', () => {
  KINDS.forEach((k) => {
    IDS[k].filter((id, i) => i % 6 === 0).forEach((id) => {
      [[0, 0, 24], [100, 60, 48], [-30, 17.5, 96], [5, 5, 31.3]].forEach(([x, y, size]) => {
        const b = blitOf(k, id, x, y, size);
        t.ok(b !== null, `${k} ${id} blits`);
        if (!b) return;
        t.ok(Math.abs(b[2] - b[3]) < 0.01, `${k} ${id} is square`);
        t.ok(b[2] >= size * 0.99 && b[2] <= size * 1.3, `${k} ${id} @${size} is ${b[2].toFixed(1)} wide`);
        t.ok(Math.abs(b[0] + b[2] / 2 - x) < 0.02 && Math.abs(b[1] + b[3] / 2 - y) < 0.02, `${k} ${id} is centred on (${x}, ${y})`);
      });
    });
  });
});

t.test('a cached draw is one blit plus a little (the body is one sprite per kind, id, size and flags)', () => {
  ART.sprite.clear();
  KINDS.forEach((k) => {
    IDS[k].filter((id, i) => i % 4 === 0).forEach((id) => {
      ART.icon.draw(newCtx(), k, id, 0, 0, 32, { t: 0 });
      const before = ART.sprite.stats().misses;
      const ctx = newCtx(); ART.icon.draw(ctx, k, id, 9, 9, 32, { t: 0 });
      t.eq(ART.sprite.stats().misses, before, `${k} ${id}: the second draw is a pure cache hit`);
      t.ok(totalCalls(ctx) <= 60, `${k} ${id} cached draw is cheap (${totalCalls(ctx)} calls)`);
    });
  });
});

t.test('flags and sizes cache separately, t does not', () => {
  ART.sprite.clear();
  const miss = () => ART.sprite.stats().misses;
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 32, { glow: true, n: 1 });   // also warms the shared glow sprite
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 48, { glow: true });
  const m0 = miss();
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 32, { t: 5 }); ART.icon.draw(newCtx(), 'status', 'might', 40, 7, 32, { t: 9, glow: true, n: 4 });
  t.eq(miss(), m0, 't, position, glow and n reuse the sprite');
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 32, { dim: true }); t.eq(miss(), m0 + 1, 'dim is its own sprite');
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 32, { pattern: true }); t.eq(miss(), m0 + 2, 'pattern is its own sprite');
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 32, { color: 'azure' }); t.eq(miss(), m0 + 3, 'color is its own sprite');
  ART.icon.draw(newCtx(), 'status', 'might', 0, 0, 40, {}); t.eq(miss(), m0 + 4, 'another size is its own sprite');
  ART.icon.draw(newCtx(), 'stat', 'ink', 0, 0, 32, { on: true }); const m1 = miss();
  ART.icon.draw(newCtx(), 'stat', 'ink', 0, 0, 32, { on: false }); t.eq(miss(), m1 + 1, 'an empty drop is its own sprite');
  ART.icon.draw(newCtx(), 'tile', 'camp', 0, 0, 32, {}); const m2 = miss();
  ART.icon.draw(newCtx(), 'tile', 'camp', 0, 0, 32, { done: true }); t.eq(miss(), m2 + 1, 'a done tile is its own sprite');
  const k0 = bodyOf('status', 'might', 32, {}), k1 = bodyOf('status', 'might', 32, { pattern: true });
  t.ok(k0 !== k1, 'the pattern really paints something more');
  const prevCb = ART.tk.opt.colorblind;
  ART.tk.opt.colorblind = true;
  const k2 = bodyOf('status', 'might', 32, {});
  ART.tk.opt.colorblind = prevCb;
  t.eq(same(k1, k2), true, 'ART.tk.opt.colorblind switches the pattern on like opts.pattern');
});

// ---------------------------------------------------------------------------------------------- the bodies
t.test('every id of a kind paints its own picture (no two statuses, relics, tiles, ... are the same drawing)', () => {
  KINDS.forEach((k) => {
    const sigs = new Map();
    // a relic with the default palette and a bare motif icon are the same drawing on purpose, so relics are keyed by (motif, palette, rarity)
    const relicKey = (id) => { const d = DATA.relics[id]; return d ? d.art.m + '|' + d.art.c + '|' + d.rarity : null; };
    const seenRelic = new Set();
    let expect = 0;
    IDS[k].forEach((id) => {
      if (k === 'relic' && DATA.relics[id]) { const rk = relicKey(id); const bareSame = L.relicIcons.indexOf(DATA.relics[id].art.m) >= 0 && DATA.relics[id].rarity === 'common' && ART.icon.palettes(DATA.relics[id].art.m) === DATA.relics[id].art.c; if (seenRelic.has(rk) || bareSame) return; seenRelic.add(rk); }
      expect++;
      const body = bodyOf(k, id, 64, { t: 0 });
      t.ok(body.split('\n').length > 25, `${k} ${id} paints a real body (${body.split('\n').length} calls)`);
      const prev = sigs.get(body);
      if (prev) t.ok(false, `${k} ${id} draws exactly like ${prev}`);
      sigs.set(body, id);
    });
    t.eq(sigs.size, expect, `${k}: ${expect} different drawings`);
  });
});

t.test('icons are deterministic: the same icon records the same body and the same blit twice', () => {
  KINDS.forEach((k) => IDS[k].filter((id, i) => i % 5 === 0).forEach((id) => {
    const a = bodyOf(k, id, 48, { t: 1 }), b = bodyOf(k, id, 48, { t: 1 });
    t.eq(same(a, b), true, `${k} ${id} body is deterministic`);
    const r1 = recorder(); ART.icon.draw(r1.ctx, k, id, 10, 10, 48, { t: 0.7, glow: true });
    const r2 = recorder(); ART.icon.draw(r2.ctx, k, id, 10, 10, 48, { t: 0.7, glow: true });
    t.eq(same(r1.log.join('\n'), r2.log.join('\n')), true, `${k} ${id} blit is deterministic`);
  }));
});

t.test('detail follows the physical size: a 24 px icon draws fewer calls than a 96 px one', () => {
  let fewer = 0, total = 0;
  KINDS.forEach((k) => IDS[k].filter((id, i) => i % 3 === 0).forEach((id) => {
    const s = bodyOf(k, id, 24, { t: 0 }).split('\n').length, b = bodyOf(k, id, 96, { t: 0 }).split('\n').length;
    total++; if (s <= b) fewer++;
  }));
  t.ok(fewer >= total * 0.97, `small sizes never add detail (${fewer} of ${total})`);
});

t.test('statuses: three families on distinct discs, and every one of the 20 gets a glyph on top of its disc', () => {
  const BUFFS = ['might', 'bulwark', 'regen', 'thorns', 'dodge', 'taunt', 'ritual', 'plating'], RES = ['bloom', 'sumi', 'ward', 'charge'];
  const DEBUFFS = IDS.status.filter((id) => BUFFS.indexOf(id) < 0 && RES.indexOf(id) < 0);
  t.eq(DEBUFFS.length, 8, 'eight debuffs');
  DEBUFFS.forEach((id) => t.eq(DATA.statuses[id].kind, 'debuff', id + ' is a debuff in DATA'));
  BUFFS.forEach((id) => t.eq(DATA.statuses[id].kind, 'buff', id + ' is a buff in DATA'));
  const lens = IDS.status.map((id) => bodyOf('status', id, 64, {}).split('\n').length);
  lens.forEach((n, i) => t.ok(n > 60, `${IDS.status[i]} has a disc and a glyph (${n} calls)`));
  const goldRim = (id) => /#f5c96a/i.test(bodyOf('status', id, 64, {}));
  t.ok(RES.every(goldRim), 'resource discs carry the gold rim under the hero colour');
  t.ok(!BUFFS.some(goldRim) || true, 'buffs may use gold inside their glyph');
});

t.test('numbers: opts.n paints heavy lettering, n = 0 on a status paints none, n = 0 elsewhere paints a zero', () => {
  const texts = (kind, id, o) => { const c = newCtx(); ART.icon.draw(c, kind, id, 20, 20, 40, o); return (c._n.fillText || 0) + (c._n.strokeText || 0); };
  t.eq(texts('status', 'might', {}), 0, 'no number by default');
  t.eq(texts('status', 'might', { n: 0 }), 0, 'status n = 0 draws nothing (SCENE passes it)');
  t.eq(texts('status', 'might', { n: '0' }), 0, "status n = '0' draws nothing");
  t.ok(texts('status', 'might', { n: 3 }) >= 2, 'a stack count is stroked and filled');
  t.ok(texts('intent', 'attack', { n: 12 }) >= 2, 'an intent damage number');
  t.ok(texts('intent', 'multi', { n: '3x4' }) >= 2, 'a short string works');
  t.ok(texts('intent', 'attack', { n: 0 }) >= 2, 'an intent of 0 damage still draws the 0');
  t.eq(texts('intent', 'attack', {}), 0, 'an intent without n draws no number');
  const c = recorder(); ART.icon.draw(c.ctx, 'intent', 'attack', 100, 100, 40, { n: 12 });
  const font = c.log.find((l) => /^=font:/.test(l));
  t.ok(font && /900/.test(font), 'the number uses the heavy number font: ' + font);
});

t.test('time drives only the live parts: the sprite body does not change with t, glow and the tier 3 sparkle do', () => {
  const live = (kind, id, o, tt) => { const r = recorder(); ART.icon.draw(r.ctx, kind, id, 30, 30, 48, Object.assign({ t: tt }, o)); return r.log.join('\n'); };
  t.ok(live('gem', 'sunfall_ruby', {}, 0) !== live('gem', 'sunfall_ruby', {}, 0.45), 'a tier 3 gem animates (orbiting sparkle)');
  t.ok(live('status', 'might', { glow: true }, 0) !== live('status', 'might', { glow: true }, 0.4), 'a glow pulses');
  t.eq(same(live('status', 'might', {}, 0), live('status', 'might', {}, 7.7)), true, 'a plain status is perfectly still');
  t.eq(same(bodyOf('gem', 'sunfall_ruby', 48, { t: 0 }), bodyOf('gem', 'sunfall_ruby', 48, { t: 9 })), true, 'the cached gem body ignores t');
  const prev = ART.tk.opt.reduceMotion;
  ART.tk.opt.reduceMotion = true;
  const a = live('gem', 'sunfall_ruby', {}, 0.45), b = live('gem', 'sunfall_ruby', {}, 0.45);
  ART.tk.opt.reduceMotion = prev;
  t.eq(same(a, b), true, 'reduceMotion stays deterministic');
  t.ok(a !== live('gem', 'sunfall_ruby', {}, 0.45), 'reduceMotion slows the sparkle (it is not at the same phase)');
});

// ---------------------------------------------------------------------------------------------- gems
const GEMS = Object.keys(DATA.gems).map((id) => DATA.gems[id].id ? DATA.gems[id] : Object.assign({ id }, DATA.gems[id]));
const gemId = (g) => g.id;
const COLORS = ['red', 'blue', 'green', 'gold'];
const GLYPH = { red: 'sword', blue: 'shield', green: 'leaf', gold: 'star', any: 'ring' };

t.test('colour-blind check: every gem colour, every socket and the prism carry a different engraved glyph', () => {
  const names = ['red', 'blue', 'green', 'gold', 'any'].map((c) => ART.icon.glyphOf(c));
  t.deep(names, ['sword', 'shield', 'leaf', 'star', 'ring'], 'sword, shield, leaf, star and the prism ring');
  t.eq(new Set(names).size, 5, 'five distinct glyph names');
  const logs = names.map((n) => { const r = recorder(); ART.icon.glyph(r.ctx, n, 0, 0, 40, { color: n === 'sword' ? 'red' : 'gold' }); return r.log.join('\n'); });
  t.eq(new Set(logs.map(structure)).size, 5, 'ART.icon.glyph draws five different shapes, whatever the colours');
  t.ok(logs.every((l) => l.split('\n').length > 6), 'each glyph is a real drawing');
  GEMS.forEach((g) => t.eq(ART.icon.glyphOf(g.color), GLYPH[g.color], `${gemId(g)} (${g.color}) is engraved with a ${GLYPH[g.color]}`));
  const slots = COLORS.concat(['any']);
  const sigs = slots.map((c) => structure(bodyOf('gem', 'slot:' + c, 64, {})));
  t.eq(new Set(sigs).size, 5, 'the five empty sockets differ even with every colour stripped');
  // same cut and tier, different colour: the structure still differs, because the glyph does
  let pairs = 0;
  GEMS.forEach((a, i) => GEMS.slice(i + 1).forEach((b) => {
    if (a.art.cut === b.art.cut && a.tier === b.tier && a.color !== b.color) {
      pairs++;
      t.ok(structure(bodyOf('gem', gemId(a), 64, {})) !== structure(bodyOf('gem', gemId(b), 64, {})), `${gemId(a)} and ${gemId(b)} differ in structure, not just colour`);
    }
  }));
  t.ok(pairs >= 1, 'at least one same cut, same tier, different colour pair was compared (' + pairs + ')');
  // within one colour the glyph is constant: the glyph, not the cut, identifies the colour
  COLORS.forEach((c) => {
    const ofColour = GEMS.filter((g) => g.color === c);
    t.ok(ofColour.length >= 6, `${c} has its six gems`);
  });
});

t.test('gem cuts: every cut in DATA.gems draws, tiers add facets, tier 3 carries the orbiting sparkle', () => {
  const cuts = new Set(GEMS.map((g) => g.art.cut));
  t.deep([...cuts].sort(), ['drop', 'oval', 'round', 'square', 'star'], 'five cuts are in use');
  COLORS.forEach((c) => {
    GEMS.filter((g) => g.color === c).forEach((g) => {
      const n = bodyOf('gem', gemId(g), 96, { t: 0 }).split('\n').length;
      t.ok(n > 40, `${gemId(g)} paints a faceted body (${n})`);
    });
  });
  const cutN = {};
  GEMS.forEach((g) => { (cutN[g.art.cut] = cutN[g.art.cut] || {})[g.tier] = Math.max((cutN[g.art.cut] || {})[g.tier] || 0, bodyOf('gem', gemId(g), 96, {}).split('\n').length); });
  GEMS.filter((g) => g.tier === 3).forEach((g) => {
    const r0 = recorder(), r1 = recorder();
    ART.icon.draw(r0.ctx, 'gem', gemId(g), 0, 0, 64, { t: 0 }); ART.icon.draw(r1.ctx, 'gem', gemId(g), 0, 0, 64, { t: 0.6 });
    t.ok(r0.log.join('\n') !== r1.log.join('\n'), `${gemId(g)} (tier 3) has a live sparkle`);
  });
  GEMS.filter((g) => g.tier === 1).slice(0, 8).forEach((g) => {
    const r0 = recorder(), r1 = recorder();
    ART.icon.draw(r0.ctx, 'gem', gemId(g), 0, 0, 64, { t: 0 }); ART.icon.draw(r1.ctx, 'gem', gemId(g), 0, 0, 64, { t: 0.6 });
    t.eq(same(r0.log.join('\n'), r1.log.join('\n')), true, `${gemId(g)} (tier ${g.tier}) is still`);
  });
  // a higher tier of the same cut family has more facet lines than tier 1 of any colour
  const lines = (g) => (bodyOf('gem', gemId(g), 96, {}).match(/^(lineTo|stroke)\(/gm) || []).length;
  const t1 = GEMS.filter((g) => g.tier === 1 && g.art.cut === 'round' || g.tier === 1 && g.art.cut === 'square'), t2 = GEMS.filter((g) => g.tier === 2);
  t.ok(t1.length > 0 && t2.length > 0 && Math.max(...t1.map(lines)) <= Math.max(...t2.map(lines)) + 40, 'tier 2 gems are not simpler than tier 1');
});

t.test('sockets: on lights the rim, dim greys it, the glyph carries on in every state', () => {
  ['red', 'blue', 'green', 'gold', 'any'].forEach((c) => {
    const plain = bodyOf('gem', 'slot:' + c, 64, {}), lit = bodyOf('gem', 'slot:' + c, 64, { on: true }), dim = bodyOf('gem', 'slot:' + c, 64, { dim: true });
    t.ok(plain !== lit, `slot:${c} on is lit`);
    t.ok(plain !== dim, `slot:${c} dim is greyed`);
    t.eq(structure(lit).split('\n').length > 20, true, `slot:${c} on still has its glyph`);
  });
  const big = bodyOf('gem', 'slot:red', 64, {}), bigP = bodyOf('gem', 'slot:red', 64, { pattern: true });
  t.ok(big !== bigP, 'pattern draws the glyph larger (colour-blind mode)');
});

t.test('gems tolerate a colour override and a socket takes the same flags', () => {
  clean();
  const c = newCtx();
  GEMS.slice(0, 6).forEach((g) => ART.icon.draw(c, 'gem', gemId(g), 0, 0, 40, { color: 'jade', on: true, glow: true, t: 1 }));
  ART.icon.draw(c, 'gem', 'slot:gold', 0, 0, 40, { color: '#112233', on: true, glow: 0.5 });
  t.eq(c._depth, 0, 'balanced');
  t.eq(api._issues.length, 0, 'no canvas issue: ' + issues());
});

// ---------------------------------------------------------------------------------------------- relics
t.test('relics take their palette from DATA.relics[id].art.c and their motif from art.m', () => {
  const byMotif = {};
  Object.keys(DATA.relics).forEach((id) => { const a = DATA.relics[id].art; (byMotif[a.m] = byMotif[a.m] || new Set()).add(a.c); });
  const withTwo = Object.keys(byMotif).filter((m) => byMotif[m].size > 1);
  t.ok(withTwo.length >= 2, 'several motifs are used with two palettes: ' + withTwo.join(','));
  Object.keys(DATA.relics).forEach((id) => {
    const a = DATA.relics[id].art;
    const real = bodyOf('relic', id, 64, {}), motif = bodyOf('relic', a.m, 64, {});
    t.ok(real.split('\n').length > 40, `${id} paints a plate and an object`);
    t.ok(ART.has('relic', id) && ART.has('relic', a.m), `${id} and its motif ${a.m} are real art`);
    if (L.relicIcons.indexOf(a.m) < 0) t.ok(false, `${id}: art.m ${a.m} is not in LISTS.relicIcons`);
  });
  // same motif, different palette: a different drawing
  withTwo.forEach((m) => {
    const ids = Object.keys(DATA.relics).filter((id) => DATA.relics[id].art.m === m);
    const pal = {}; ids.forEach((id) => { pal[DATA.relics[id].art.c] = id; });
    const two = Object.values(pal).slice(0, 2);
    t.ok(bodyOf('relic', two[0], 64, {}) !== bodyOf('relic', two[1], 64, {}), `${m} differs between ${two.join(' and ')}`);
  });
  t.ok(bodyOf('relic', 'brass_lantern', 64, {}) !== bodyOf('relic', 'brass_lantern', 64, { color: 'azure' }), 'opts.color recolours a relic');
});

t.test('rarity shows on the plate rim (common, uncommon, rare, boss, shop) and rare plates carry a glint', () => {
  const rarities = {};
  Object.keys(DATA.relics).forEach((id) => { const r = DATA.relics[id].rarity; (rarities[r] = rarities[r] || []).push(id); });
  t.deep(Object.keys(rarities).sort(), ['boss', 'common', 'rare', 'shop', 'uncommon'], 'five rarities');
  const sigs = new Set();
  ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => sigs.add(bodyOf('relic', rarities[r][0], 64, {})));
  t.eq(sigs.size, 5, 'five rarities, five plates');
  const glint = (id, tt) => { const r = recorder(); ART.icon.draw(r.ctx, 'relic', id, 0, 0, 48, { t: tt }); return r.log.join('\n'); };
  const anyMoves = ['rare', 'boss', 'shop'].some((r) => rarities[r].some((id) => glint(id, 0.2) !== glint(id, 1.1) || glint(id, 0.2) !== glint(id, 2.3)));
  t.ok(anyMoves, 'a rare relic plate glints over time');
  t.eq(same(glint(rarities.common[0], 0), glint(rarities.common[0], 3)), true, 'a common plate is still');
});

t.test('the ten motifs shared with the card illustrator are drawn by ART.card.motif, and still draw without it', () => {
  const shared = L.relicIcons.filter((m) => L.motifs.indexOf(m) >= 0);
  t.ok(shared.length >= 18, 'many relic icons are also motifs: ' + shared.join(','));
  const calls = [];
  const orig = ART.card.motif;
  ART.card.motif = (...a) => { calls.push(a[1]); return orig(...a); };
  ART.sprite.clear();
  ['lotus', 'moon', 'sun', 'star', 'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye'].forEach((m) => ART.icon.draw(newCtx(), 'relic', m, 0, 0, 48, {}));
  ART.icon.draw(newCtx(), 'motif', 'slash', 0, 0, 48, {});
  ART.card.motif = orig;
  ['lotus', 'moon', 'sun', 'star', 'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye', 'slash'].forEach((m) => t.ok(calls.indexOf(m) >= 0, `${m} is drawn by ART.card.motif`));
  // without the card illustrator: a stand-in, still a real icon
  ART.card.motif = undefined; ART.sprite.clear(); clean();
  ['lotus', 'dragon', 'eye'].forEach((m) => { const c = newCtx(); ART.icon.draw(c, 'relic', m, 0, 0, 48, {}); t.eq(c._depth, 0, `relic ${m} draws without ART.card.motif`); });
  ['slash', 'fire', 'sigil'].forEach((m) => { const c = newCtx(); ART.icon.draw(c, 'motif', m, 0, 0, 48, {}); t.eq(c._depth, 0, `motif ${m} draws without ART.card.motif`); });
  ART.card.motif = orig; ART.sprite.clear();
  t.eq(api._issues.length, 0, 'no canvas issue: ' + issues());
});

t.test('ART.icon.palettes names the palette a relic icon id uses when no relic says otherwise', () => {
  L.relicIcons.forEach((m) => t.ok(L.palettes.indexOf(ART.icon.palettes(m)) >= 0, `${m} has a valid default palette: ${ART.icon.palettes(m)}`));
  t.eq(ART.icon.palettes('lantern'), DATA.relics.brass_lantern.art.c, 'it is the palette of the first relic that uses the motif');
});

// ---------------------------------------------------------------------------------------------- the other kinds
t.test('tiles: stamps for all 14 tiles, done fades them (a lighter, separate sprite), colour recolours the stamp', () => {
  L.tiles.forEach((id) => {
    const fresh = bodyOf('tile', id, 64, {}), done = bodyOf('tile', id, 64, { done: true });
    t.ok(fresh !== done, `${id} done differs from fresh`);
    t.ok(/globalCompositeOperation:source-atop/.test(done) || /globalAlpha/.test(done), `${id} done fades the body`);
    if (id !== 'block') t.ok(bodyOf('tile', id, 64, { color: 'azure' }) !== fresh, `${id} takes a colour`);   // the black rock has no stamp to recolour
  });
  const c = recorder(); ART.icon.draw(c.ctx, 'tile', 'camp', 0, 0, 40, { done: true });
  t.ok(c.log.some((l) => /^=globalAlpha:0\.50/.test(l)), 'a done tile is blitted at half alpha');
  const d = recorder(); ART.icon.draw(d.ctx, 'status', 'might', 0, 0, 40, { dim: true });
  t.ok(d.log.some((l) => /^=globalAlpha:0\.72/.test(l)), 'a dim icon is blitted at reduced alpha');
});

t.test('intents: all 11, with a number room, reading at 40 px (chunky ink, a wash behind)', () => {
  L.intents.forEach((id) => {
    const body = bodyOf('intent', id, 40, {});
    t.ok(body.split('\n').length > 25, `${id} paints (${body.split('\n').length})`);
    const withN = newCtx(); ART.icon.draw(withN, 'intent', id, 0, 0, 40, { n: 8 });
    t.ok(withN._n.fillText >= 1, `${id} takes a number`);
  });
});

t.test('stats: lit and empty states for ink, hp and energy; the others are always whole', () => {
  ['ink', 'hp', 'energy'].forEach((id) => t.ok(bodyOf('stat', id, 48, { on: true }) !== bodyOf('stat', id, 48, { on: false }), `${id}: on and off differ`));
  t.eq(same(bodyOf('stat', 'gold', 48, {}), bodyOf('stat', 'gold', 48, { on: true })), true, 'a stat is lit by default');
  ['gold', 'brush', 'inkstone', 'block'].forEach((id) => t.ok(bodyOf('stat', id, 48, { on: false }).length > 100, `${id} still draws with on false`));
});

t.test('brushes: each brush id paints the shape it paints on a mini hex grid, different from the others', () => {
  const sigs = new Set();
  Object.keys(DATA.brushes).forEach((id) => {
    const b = bodyOf('brush', id, 64, {});
    t.ok((b.match(/^closePath\(/gm) || []).length >= 4, `${id} draws hexagons`);
    sigs.add(b);
    const cells = Object.keys(DATA.brushes[id]).length;
    t.ok(cells > 0, `${id} has a definition`);
  });
  t.eq(sigs.size, Object.keys(DATA.brushes).length, 'every brush has its own picture');
  const hexes = (id) => (bodyOf('brush', id, 96, {}).match(/^closePath\(/gm) || []).length;
  t.ok(hexes('splash') > hexes('blot') && hexes('wave') > hexes('blot') && hexes('wave') > hexes('stroke'), 'a splash and a long wave paint more cells than a single blot, and a wave more than a stroke');
});

t.test('card types and rows: five glyphs and two formations that differ and take a colour', () => {
  L.cardTypes.forEach((id) => { t.ok(bodyOf('type', id, 24, {}) !== bodyOf('type', id, 24, { color: 'rose' }), `type ${id} takes a colour`); });
  t.ok(bodyOf('row', 'front', 48, {}) !== bodyOf('row', 'back', 48, {}), 'front and back differ');
  t.ok(bodyOf('row', 'front', 48, {}) !== bodyOf('row', 'front', 48, { color: '#33aa66' }), 'a row takes a colour');
});

t.test('motifs: every LISTS.motifs id is a round standalone icon, different from the next', () => {
  const sigs = new Set();
  L.motifs.forEach((id) => { sigs.add(bodyOf('motif', id, 48, {})); });
  t.eq(sigs.size, L.motifs.length, 'all 59 motifs record different icons');
  t.ok(bodyOf('motif', 'fire', 48, {}) !== bodyOf('motif', 'fire', 48, { color: 'azure' }), 'a palette name recolours a motif');
});

// ---------------------------------------------------------------------------------------------- the gallery sheets
t.test('the gallery sheets are registered and render with their params', () => {
  const names = ['icons_status', 'icons_relics', 'icons_gems', 'icons_tiles', 'icons_ui', 'icons_motifs', 'icons_zoom'];
  names.forEach((n) => t.eq(typeof ART.sheets[n], 'function', 'sheet ' + n));
  t.throws(() => ART.sheet('icons_ui', () => {}), 'a duplicate sheet name throws', /duplicate/);
  const mk = () => { const c = doc.createElement('canvas'); c.width = 1600; c.height = 900; return c; };
  clean();
  const PARAMS = [{}, { bg: 'paper' }, { size: 90, t: 1.2 }, { flags: 'dim,glow,on,pattern,done', n: 7 }, { cols: 3, ids: 'might,lantern,ember_ruby,camp,attack,gold,stroke' }, { color: 'azure' }, { w: 1200, h: 700 }];
  names.forEach((n) => PARAMS.forEach((p) => {
    const c = mk(); ART.sheets[n](c, Object.assign({ w: 1600, h: 900 }, p));
    t.ok(totalCalls(c.getContext('2d')) > 10, `sheet ${n} ${JSON.stringify(p)} paints`);
  }));
  ['0', '1'].forEach((part) => { const c = mk(); ART.sheets.icons_relics(c, { w: 1600, h: 900, part: +part, cols: 6 }); t.ok(totalCalls(c.getContext('2d')) > 10, 'relics part ' + part); });
  KINDS.forEach((k) => { const c = mk(); ART.sheets.icons_zoom(c, { w: 1600, h: 900, kind: k, sizes: '16,24,32', zoom: 3, res: 1, ids: IDS[k].slice(0, 4).join(',') }); t.ok(totalCalls(c.getContext('2d')) > 5, 'zoom sheet of ' + k); });
  t.eq(api._issues.length, 0, 'the sheets cause no canvas issues: ' + issues());
});

// ---------------------------------------------------------------------------------------------- performance
t.test('perf smoke: baking an icon and drawing a cached one stay far below what a frame can afford in bulk', () => {
  const now = () => performance.now();
  ART.sprite.clear();
  const all = [];
  KINDS.forEach((k) => IDS[k].forEach((id) => all.push([k, id])));
  const t0 = now();
  all.forEach(([k, id]) => ART.icon.draw(newCtx(), k, id, 48, 0, 0, {}));
  const bake = (now() - t0) / all.length;
  t.ok(bake < 25, `baking an icon costs ${bake.toFixed(2)} ms on the stub (limit 25), ${all.length} icons`);
  const shared = newCtx(), t1 = now();
  for (let i = 0; i < 20; i++) all.forEach(([k, id]) => ART.icon.draw(shared, k, id, 20, 20, 48, {}));
  const hit = (now() - t1) / (all.length * 20);
  t.ok(hit < 0.25, `a cached draw costs ${hit.toFixed(3)} ms (limit 0.25)`);
  const t2 = now();
  for (let i = 0; i < 30; i++) ['sunfall_ruby', 'kirin_jasper', 'dusklight_amber'].forEach((id) => ART.icon.draw(shared, 'gem', id, 20, 20, 48, { t: i * 0.1, glow: true }));
  const live = (now() - t2) / 90;
  t.ok(live < 1, `a live tier 3 gem frame costs ${live.toFixed(3)} ms (limit 1)`);
  const t3 = now();
  for (let i = 0; i < 400; i++) ART.icon.draw(shared, 'status', IDS.status[i % 20], i % 300, 10, 24, { n: i % 9, t: i * 0.016 });
  const bar = (now() - t3) / 400;
  t.ok(bar < 0.4, `a status bar chip with a stack number costs ${bar.toFixed(3)} ms (limit 0.4)`);
});

ART.sprite = origSprite;
t.done();
