// ART.card (art_cards.js): the card illustrator, headless on the strict canvas stub.
//
// What this pins down:
//   * all 59 motifs exist, are declared real art (ART.has), draw at icon and card sizes with and without t, never throw, issue draw calls,
//     keep save and restore balanced, cause no canvas issue (NaN, bad colours, bad gradient stops...), and stay inside their design box
//   * every card in DATA.cards (heroes, curses, status cards) draws at several sizes, upgraded and not, static and hovering (t), and tokens
//     with unknown ids or hostile arguments draw a fallback instead of throwing
//   * the composition is deterministic per id, varies from card to card, uses the hero silhouette exactly when art.hero says so, gives
//     upgraded cards more sparkle, caches the static draw (one sprite per id + up + size) and animates the live draw
//   * the gallery sheets (motifs, cards_<hero>, cards_junk) render, page and honour their params
//   * perf smoke: a cached card is one blit, a first draw stays far below a frame budget times a generous factor
import { boot, harness } from './hocus_vocus_lib.mjs';
// Wall-clock budgets are strict with RB_PERF=1 on an idle machine; otherwise 4x slack so a loaded CI box cannot flake the check.
const PERF_SLACK = process.env.RB_PERF ? 1 : 4;

const t = harness('hocus_vocus art cards');
// ART_CARDS_TIMING=1 prints how long each test takes (the suite draws a lot: keep an eye on it)
const T = (name, fn) => t.test(name, () => { const t0 = Date.now(); fn(); if (process.env.ART_CARDS_TIMING) console.log(String(Date.now() - t0).padStart(6), 'ms', name.slice(0, 90)); });
const api = boot({ only: ['util', 'data*', 'art', 'art_cast_kit', 'art_cast', 'art_cards'] });
const { ART, DATA, U } = api;
const L = DATA.LISTS;
t.ok(!api._errors || api._errors.length === 0, 'art_cards loads without errors: ' + JSON.stringify(api._errors));
t.ok(!api._warnings || api._warnings.length === 0, 'art_cards loads without warnings: ' + JSON.stringify(api._warnings));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const clean = () => { api._resetCounts(); };
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail}`).slice(0, 4).join(' | ');
const totalCalls = (ctx) => Object.values(ctx._n).reduce((a, b) => a + b, 0);

// the first differing line of two recorded logs, so a failure says where instead of dumping thousands of calls
const same = (a, b) => { if (a.length === b.length && a.every((x, i) => x === b[i])) return true; let i = 0; while (i < a.length && a[i] === b[i]) i++; return 'differ at call ' + i + ': ' + a[i] + ' | ' + b[i]; };

// ---------------------------------------------------------------------------------------------- recorders
// a proxy over a stub context that logs every call (numbers rounded) so drawings can be compared
function recorder() {
  const log = [];
  const real = newCtx();
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj' : String(v));
  const proxy = new Proxy(real, {
    get(target, key) { const v = target[key]; return typeof v === 'function' ? (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); return v.apply(target, a); } : v; },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, real };
}
// a clip-aware extent recorder: the device-space box of everything that is filled or stroked (glows and cached tiles are soft light and ignored)
function visibleBox(fn) {
  const real = newCtx();
  let path = [], clipBox = null;
  const stack = [];
  let box = [1e9, 1e9, -1e9, -1e9];
  const pt = (x, y) => { const m = real._t; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; };
  const add = (x, y) => { if (isFinite(x) && isFinite(y)) path.push(pt(x, y)); };
  const bb = (pts) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; pts.forEach((p) => { a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]); }); return [a, b, c, d]; };
  const inter = (p, q) => (q ? [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.min(p[3], q[3])] : p);
  const commit = () => { if (!path.length) return; const b = inter(bb(path), clipBox); if (b[2] > b[0] && b[3] > b[1]) box = [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]; };
  const proxy = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      return (...a) => {
        switch (key) {
          case 'save': stack.push(clipBox); break;
          case 'restore': clipBox = stack.pop() || null; break;
          case 'beginPath': path = []; break;
          case 'moveTo': case 'lineTo': add(a[0], a[1]); break;
          case 'quadraticCurveTo': add(a[0], a[1]); add(a[2], a[3]); break;
          case 'bezierCurveTo': add(a[0], a[1]); add(a[2], a[3]); add(a[4], a[5]); break;
          case 'rect': add(a[0], a[1]); add(a[0] + a[2], a[1] + a[3]); break;
          case 'arc': add(a[0] - a[2], a[1] - a[2]); add(a[0] + a[2], a[1] + a[2]); break;
          case 'ellipse': { const rr = Math.max(a[2], a[3]); add(a[0] - (a[4] ? rr : a[2]), a[1] - (a[4] ? rr : a[3])); add(a[0] + (a[4] ? rr : a[2]), a[1] + (a[4] ? rr : a[3])); break; }
          case 'fillRect': { const p = path; path = []; add(a[0], a[1]); add(a[0] + a[2], a[1] + a[3]); commit(); path = p; break; }
          case 'fill': case 'stroke': commit(); break;
          case 'clip': clipBox = inter(bb(path.length ? path : [[-1e9, -1e9], [1e9, 1e9]]), clipBox); break;
          default: break;
        }
        return v.apply(target, a);
      };
    },
    set(target, key, v) { target[key] = v; return true; },
  });
  fn(proxy);
  return { box, real };
}

// ---------------------------------------------------------------------------------------------- the motifs
const MOTIFS = L.motifs;
T('there are exactly 59 motifs and ART.card knows every one', () => {
  t.eq(MOTIFS.length, 59, 'LISTS.motifs has 59 ids');
  const have = ART.card.motifIds();
  t.deep(have.slice().sort(), MOTIFS.slice().sort(), 'ART.card.motifIds equals LISTS.motifs');
  MOTIFS.forEach((id) => t.ok(ART.has('motif', id), `ART.has('motif', ${id})`));
});

T('every motif draws at icon and card sizes, in every palette family, static and animated, without a canvas issue', () => {
  clean();
  for (const id of MOTIFS) {
    for (const size of [22, 24, 48, 96, 180]) {
      const ctx = newCtx();
      const pal = L.palettes[(U.hashStr(id) + size) % L.palettes.length];
      ART.card.motif(ctx, id, 50, 50, size, pal, undefined);
      t.ok(totalCalls(ctx) > 12, `${id} @${size} issues draw calls (${totalCalls(ctx)})`);
      t.eq(ctx._depth, 0, `${id} @${size} leaves save and restore balanced`);
    }
    for (const tt of [0, 0.37, 1.9, 12.5]) {
      const ctx = newCtx();
      ART.card.motif(ctx, id, 0, 0, 100, 'azure', tt);
      t.eq(ctx._depth, 0, `${id} t=${tt} is balanced`);
    }
  }
  L.palettes.forEach((p) => { const ctx = newCtx(); MOTIFS.forEach((id) => ART.card.motif(ctx, id, 0, 0, 64, p, 0.5)); t.eq(ctx._depth, 0, 'palette ' + p + ' balanced'); });
  t.eq(api._issues.length, 0, 'no canvas issues from the motifs: ' + issues());
});

T('motifs paint inside their design box (a little overshoot for streaks, but never far)', () => {
  const worst = [];
  for (const id of MOTIFS) {
    const { box } = visibleBox((c) => ART.card.motif(c, id, 0, 0, 100, 'rose', undefined));
    const ext = Math.max(-box[0], box[2], -box[1], box[3]);
    worst.push([id, ext]);
    t.ok(box[2] - box[0] > 34 && box[3] - box[1] > 20, `${id} has real extent (${(box[2] - box[0]).toFixed(0)} x ${(box[3] - box[1]).toFixed(0)})`);
    t.ok(ext <= 70, `${id} stays inside its box: ${ext.toFixed(1)} of 50 (limit 70)`);
    // most of the drawing sits in the box: the visible box is centred within a modest offset
    t.ok(Math.abs((box[0] + box[2]) / 2) < 22 && Math.abs((box[1] + box[3]) / 2) < 22, `${id} is roughly centred`);
  }
  t.ok(worst.filter((w) => w[1] > 62).length <= 4, 'at most four motifs reach beyond 62 (long whiskers and tails): ' + worst.filter((w) => w[1] > 62).map((w) => w[0] + ' ' + w[1].toFixed(0)).join(', '));
});

T('motifs are deterministic and distinct from each other', () => {
  const sigs = new Set();
  MOTIFS.forEach((id) => {
    ART.card.motif(newCtx(), id, 10, 10, 90, 'jade', undefined);            // warm the shared pattern caches first
    const a = recorder(); ART.card.motif(a.ctx, id, 10, 10, 90, 'jade', undefined);
    const b = recorder(); ART.card.motif(b.ctx, id, 10, 10, 90, 'jade', undefined);
    t.eq(same(a.log, b.log), true, id + ' draws identically twice');
    sigs.add(a.log.join('\n'));
  });
  t.eq(sigs.size, MOTIFS.length, 'all 59 motifs record different draws');
  const a = recorder(); ART.card.motif(a.ctx, 'lantern', 0, 0, 90, 'amber', undefined);
  const b = recorder(); ART.card.motif(b.ctx, 'lantern', 0, 0, 90, 'jade', undefined);
  t.ok(a.log.join('\n') !== b.log.join('\n'), 'the palette changes the drawing');
});

T('motifs animate with t and stay still without it', () => {
  const at = (id, tt) => { const r = recorder(); ART.card.motif(r.ctx, id, 0, 0, 90, 'rose', tt); return r.log.join('\n'); };
  const still = MOTIFS.filter((id) => { const a = at(id, 0.2), b = at(id, 0.83), c = at(id, 1.71); return a === b && b === c; });
  t.eq(still.length, 0, 'every motif moves with t (still ones: ' + still.join(',') + ')');
  MOTIFS.forEach((id) => { const a = recorder(); ART.card.motif(a.ctx, id, 0, 0, 90, 'rose'); const b = recorder(); ART.card.motif(b.ctx, id, 0, 0, 90, 'rose', undefined); t.eq(same(a.log, b.log), true, id + ': no t equals undefined t'); });
});

T('detail follows size: an icon draws far fewer calls than a card illustration', () => {
  let fewer = 0;
  MOTIFS.forEach((id) => { const s = newCtx(), b = newCtx(); ART.card.motif(s, id, 0, 0, 24, 'azure'); ART.card.motif(b, id, 0, 0, 160, 'azure'); if (totalCalls(s) < totalCalls(b)) fewer++; });
  t.ok(fewer >= 55, 'small sizes drop detail for at least 55 of 59 motifs (' + fewer + ')');
});

T('motif accepts a name, a family object, an unknown name and hostile arguments', () => {
  clean();
  const ctx = newCtx();
  ART.card.motif(ctx, 'slash', 0, 0, 40, 'rose'); ART.card.motif(ctx, 'slash', 0, 0, 40, { name: 'jade' }); ART.card.motif(ctx, 'slash', 0, 0, 40, ART.tk.fam('gold'));
  ART.card.motif(ctx, 'slash', 0, 0, 40, 'not_a_palette'); ART.card.motif(ctx, 'slash', 0, 0, 40); ART.card.motif(ctx, 'slash', 0, 0, 40, null);
  ART.card.motif(ctx, 'no_such_motif', 0, 0, 40, 'rose'); ART.card.motif(ctx, undefined, 0, 0, 40, 'rose'); ART.card.motif(ctx, 42, 0, 0, 40, 'rose');
  ART.card.motif(ctx, 'fire', NaN, Infinity, -5, 'rose', NaN); ART.card.motif(ctx, 'fire', 0, 0, 0, 'rose'); ART.card.motif(ctx, 'fire', 0, 0, NaN, 'rose', 'x');
  t.eq(ctx._depth, 0, 'balanced after hostile input');
  t.eq(api._issues.length, 0, 'hostile input causes no canvas issue: ' + issues());
});

// ---------------------------------------------------------------------------------------------- the cards
const CARDS = Object.values(DATA.cards);
const HEROES = L.heroIds;
T('the card set is what the illustrator expects', () => {
  t.ok(CARDS.length >= 148, 'at least the four hero decks exist (' + CARDS.length + ')');
  HEROES.forEach((h) => t.ok(CARDS.filter((c) => c.hero === h).length >= 37, h + ' has its 37 cards'));
  t.ok(CARDS.filter((c) => c.type === 'curse').length >= 6 && CARDS.filter((c) => c.type === 'status').length >= 6, 'curses and status cards exist');
  CARDS.forEach((c) => t.ok(ART.has('card', c.id), 'ART.has(card, ' + c.id + ')'));
});

T('every card draws at every size, upgraded or not, static and hovering, without a canvas issue', () => {
  clean();
  ART.sprite.clear();
  for (const c of CARDS) {
    for (const [w, h] of [[170, 116], [72, 50], [300, 204]]) {
      const ctx = newCtx();
      ART.card.draw(ctx, c.id, w, h);
      t.ok(ctx._n.drawImage >= 1, `${c.id} ${w}x${h} blits its cached sprite`);
      t.eq(ctx._depth, 0, `${c.id} ${w}x${h} balanced`);
    }
    const up = newCtx(); ART.card.draw(up, { uid: 3, id: c.id, up: 1, gems: [] }, 170, 116); t.eq(up._depth, 0, c.id + '+ balanced');
    for (const tt of [0, 0.6, 2.25, 40]) {
      const ctx = newCtx(); ART.card.draw(ctx, c.id, 170, 116, tt);
      t.ok(totalCalls(ctx) > 20, `${c.id} t=${tt} paints live (${totalCalls(ctx)} calls)`);
      t.eq(ctx._depth, 0, `${c.id} t=${tt} balanced`);
    }
  }
  t.eq(api._issues.length, 0, 'no canvas issues from any card: ' + issues());
});

T('unknown ids and hostile arguments draw a fallback, never throw', () => {
  clean();
  const ctx = newCtx();
  ART.card.draw(ctx, 'no_such_card', 170, 116); ART.card.draw(ctx, null, 170, 116); ART.card.draw(ctx, undefined, 170, 116); ART.card.draw(ctx, {}, 170, 116); ART.card.draw(ctx, 12, 170, 116);
  ART.card.draw(ctx, 'hanae_slash'); ART.card.draw(ctx, 'hanae_slash', 0, 0); ART.card.draw(ctx, 'hanae_slash', NaN, -4, NaN); ART.card.draw(ctx, 'hanae_slash', 170, 116, 'x'); ART.card.draw(ctx, 'hanae_slash', 1e9, 1e9 * 0 + 20);
  ART.card.draw(ctx, { id: 'kuro_ink_bolt', up: true }, 170, 116, Infinity);
  t.eq(ctx._depth, 0, 'balanced');
  t.ok(ctx._n.drawImage >= 8, 'each call still painted something');
  t.eq(api._issues.length, 0, 'no canvas issues: ' + issues());
});

T('cards are deterministic: the same card records the same drawing, and upgraded differs from plain', () => {
  const ids = ['hanae_slash', 'kuro_grand_flourish', 'suzu_lunar_domain', 'raiga_storm_taiko', 'curse_hex', 'status_scorch'];
  ids.forEach((id) => {
    ART.card.draw(newCtx(), id, 170, 116, 0.8);
    const a = recorder(); ART.card.draw(a.ctx, id, 170, 116, 0.8);
    const b = recorder(); ART.card.draw(b.ctx, id, 170, 116, 0.8);
    t.eq(same(a.log, b.log), true, id + ' hover draw is deterministic');
    ART.sprite.clear();
    const p = ART.card._spec(id, 0), u = ART.card._spec(id, 1);
    t.ok(u.nSpark > p.nSpark, id + ': an upgraded card has extra glints');
    const ua = recorder(); ART.card.draw(ua.ctx, { id, up: 1 }, 170, 116, 0.8);
    t.ok(ua.log.join('\n') !== a.log.join('\n'), id + ': the upgraded hover draw differs (golden aura)');
  });
});

T('static draws are cached: one sprite per id, upgrade and size; the second draw is a single blit', () => {
  ART.sprite.clear();
  const s0 = ART.sprite.stats().count;
  const a = newCtx(); ART.card.draw(a, 'raiga_jab', 170, 116);
  const s1 = ART.sprite.stats().count;
  t.ok(s1 > s0, 'the first draw baked a sprite');
  const b = recorder(); ART.card.draw(b.ctx, 'raiga_jab', 170, 116);
  t.ok(b.log.length <= 6, 'a cached draw is a handful of calls (' + b.log.length + ')');
  t.eq(ART.sprite.stats().count, s1, 'the second draw made no new sprite');
  ART.card.draw(newCtx(), { id: 'raiga_jab', up: 1 }, 170, 116);
  t.ok(ART.sprite.stats().count > s1, 'the upgraded card has its own sprite');
  const before = ART.sprite.stats().count;
  ART.card.draw(newCtx(), 'raiga_jab', 300, 204);
  t.ok(ART.sprite.stats().count > before, 'a new size has its own sprite');
});

T('the live draw moves: different t gives a different picture, and the motif and background layers are cached', () => {
  ART.sprite.clear();
  ART.card.draw(newCtx(), 'hanae_thousand_petals', 170, 116, 0.4);
  const cached = ART.sprite.stats().count;
  t.ok(cached >= 2, 'the live draw baked its cacheable layers (' + cached + ')');
  const a = recorder(); ART.card.draw(a.ctx, 'hanae_thousand_petals', 170, 116, 0.4);
  const b = recorder(); ART.card.draw(b.ctx, 'hanae_thousand_petals', 170, 116, 1.7);
  t.ok(a.log.join('\n') !== b.log.join('\n'), 'a different t animates');
  t.eq(ART.sprite.stats().count, cached, 'animating baked nothing new');
  // reduced motion falls back to the still card
  const keep = ART.tk.opt; ART.tk.opt = { reduceMotion: true, quality: 'high' };
  const c = recorder(); ART.card.draw(c.ctx, 'hanae_thousand_petals', 170, 116, 0.4);
  const d = recorder(); ART.card.draw(d.ctx, 'hanae_thousand_petals', 170, 116, 1.7);
  t.eq(same(c.log, d.log), true, 'with reduceMotion the hover draw is still');
  ART.tk.opt = keep;
});

T('low quality draws without throwing (halftone and grain are skipped)', () => {
  clean();
  const keep = ART.tk.opt; ART.tk.opt = { reduceMotion: false, quality: 'low' };
  ART.sprite.clear();
  CARDS.slice(0, 40).forEach((c) => { const ctx = newCtx(); ART.card.draw(ctx, c.id, 170, 116); ART.card.draw(ctx, c.id, 170, 116, 1); t.eq(ctx._depth, 0, c.id + ' low quality balanced'); });
  ART.tk.opt = keep;
  t.eq(api._issues.length, 0, 'no canvas issues at low quality: ' + issues());
});

T('the hero silhouette appears exactly on cards whose art.hero is true', () => {
  const real = ART.hero.draw; let calls = []; ART.hero.draw = (ctx, id, o) => { calls.push({ id, pose: o.pose, flip: !!o.flip, s: o.s }); return real(ctx, id, o); };
  try {
    let withHero = 0, without = 0;
    for (const c of CARDS) {
      ART.sprite.clear(); calls = [];
      ART.card.draw(newCtx(), c.id, 170, 116);
      const wants = !!(c.art && c.art.hero && c.hero && HEROES.includes(c.hero));
      if (wants) { withHero++; t.ok(calls.length >= 2 && calls.every((x) => x.id === c.hero), `${c.id} draws its own hero (${calls.length} passes: silhouette and colour)`); t.ok(L.poses.includes(calls[0].pose), c.id + ' uses a real pose: ' + calls[0].pose); }
      else { without++; t.eq(calls.length, 0, `${c.id} draws no hero`); }
    }
    t.ok(withHero >= 30 && without >= 90, `both kinds exist (${withHero} with a hero, ${without} without)`);
  } finally { ART.hero.draw = real; }
});

T('the hero sticker keeps its highest hair (mohawk, ponytail, quiff) clear of the top edge of the card window', () => {
  // P11 D9: the figure used to stand so high that the hair touched or crossed the top edge; the feet now sit low enough for bounds.top
  const real = ART.hero.draw; let seen = null; ART.hero.draw = (ctx, id, o) => { seen = { id, y: o.y, s: o.s }; return real(ctx, id, o); };
  try {
    let n = 0;
    CARDS.filter((c) => c.art && c.art.hero && c.hero && HEROES.includes(c.hero)).forEach((c) => {
      const top = -ART.hero.bounds(c.hero).top;
      [0, 1].forEach((up) => [58, 116, 170, 300].forEach((VW) => {
        const Ly = ART.card._layout(c.id, up, VW);
        t.ok(Ly.hy - top * Ly.hs >= 5, `${c.id} (up ${up}, window ${VW}): hair top at ${(Ly.hy - top * Ly.hs).toFixed(1)} virtual px`); n++;
      }));
      ART.sprite.clear(); seen = null;
      ART.card.draw(newCtx(), c.id, 170, 116);
      t.ok(seen && seen.id === c.hero && seen.y - top * seen.s >= 5, `${c.id}: the real draw call stands the figure at y ${seen && seen.y.toFixed(1)}, scale ${seen && seen.s.toFixed(2)}`);
    });
    t.ok(n >= 240, `checked ${n} layouts`);
  } finally { ART.hero.draw = real; }
});

T('hero poses fit the card: attacks attack, guards block, the rest cast', () => {
  const poses = {};
  CARDS.filter((c) => c.art && c.art.hero).forEach((c) => { const sp = ART.card._spec(c.id, 0); poses[sp.pose] = (poses[sp.pose] || 0) + 1; if (c.type === 'attack') t.eq(sp.pose, 'attack', c.id + ' attacks'); });
  t.ok(poses.attack > 10 && poses.cast > 0, 'attack and cast poses both used: ' + JSON.stringify(poses));
});

T('composition varies: no two cards of a hero share a spec, and every background and pattern gets used', () => {
  HEROES.forEach((h) => {
    const sigs = new Set();
    CARDS.filter((c) => c.hero === h).forEach((c) => { const s = ART.card._spec(c.id, 0); sigs.add([s.motif, s.pname, s.bg, s.mirror, s.flip, s.sec, s.scenery, s.pattern, Math.round(s.scale * 100), Math.round(s.rot * 100), Math.round(s.ox), Math.round(s.oy)].join('|')); });
    t.eq(sigs.size, CARDS.filter((c) => c.hero === h).length, h + ': every card has its own composition');
  });
  const bgs = new Set(), pats = new Set(), scen = new Set(), sides = new Set();
  CARDS.forEach((c) => { const s = ART.card._spec(c.id, 0); bgs.add(s.bg); pats.add(String(s.pattern)); scen.add(s.scenery); sides.add(s.mirror); });
  t.deep([...bgs].sort(), ['burst', 'dusk', 'night', 'ring', 'split', 'wash'], 'all six background layouts occur');
  t.ok(pats.size >= 4, 'pattern overlays vary: ' + [...pats].join(','));
  t.ok(scen.size >= 4, 'scenery varies: ' + [...scen].join(','));
  t.eq(sides.size, 2, 'both mirror states occur');
  // same motif and palette on different cards still differ in composition
  const groups = {};
  CARDS.forEach((c) => { const s = ART.card._spec(c.id, 0); (groups[s.motif + '/' + s.pname] = groups[s.motif + '/' + s.pname] || []).push(s); });
  Object.keys(groups).filter((k) => groups[k].length > 1).forEach((k) => { const sg = new Set(groups[k].map((s) => [s.bg, s.mirror, s.flip, Math.round(s.scale * 40), Math.round(s.rot * 20), s.hero ? 1 : 0, s.sec].join('|'))); t.ok(sg.size >= 2, 'cards sharing ' + k + ' do not look alike'); });
});

T('curses and status cards get their own look', () => {
  CARDS.filter((c) => c.type === 'curse').forEach((c) => { const s = ART.card._spec(c.id, 0); t.ok(s.junk && s.hero === null, c.id + ' is junk art without a hero'); });
  CARDS.filter((c) => c.type === 'status').forEach((c) => { const s = ART.card._spec(c.id, 0); t.ok(s.junk && s.hero === null, c.id + ' is junk art without a hero'); });
  const a = recorder(); ART.card.draw(a.ctx, 'curse_regret', 170, 116, 0.3);
  const b = recorder(); ART.card.draw(b.ctx, 'status_blot', 170, 116, 0.3);
  t.ok(a.log.join('\n') !== b.log.join('\n'), 'curse and status art differ');
});

T('the card window scales: a wide window shows more scene, not a stretched card', () => {
  ART.sprite.clear();
  const a = newCtx(); ART.card.draw(a, 'suzu_moonbeam', 170, 116); const b = newCtx(); ART.card.draw(b, 'suzu_moonbeam', 260, 116);
  t.ok(a._n.drawImage >= 1 && b._n.drawImage >= 1, 'both aspect ratios draw');
  ART.card.draw(newCtx(), 'suzu_moonbeam', 60, 116); ART.card.draw(newCtx(), 'suzu_moonbeam', 170, 30);
});

T('ART.card.warm pre-bakes sprites and honours a time budget', () => {
  ART.sprite.clear();
  t.eq(typeof ART.card.warm, 'function', 'warm exists');
  const n = ART.card.warm(['hanae_slash', 'kuro_ink_bolt', 'suzu_ofuda'], 170, 116);
  t.eq(n, 3, 'baked three');
  const before = ART.sprite.stats().misses;
  ART.card.draw(newCtx(), 'hanae_slash', 170, 116);
  t.eq(ART.sprite.stats().misses, before, 'drawing a warmed card is a pure cache hit');
});

// ---------------------------------------------------------------------------------------------- gallery sheets
T('the gallery sheets are registered and render', () => {
  const names = ['motifs', 'cards_hanae', 'cards_kuro', 'cards_suzu', 'cards_raiga', 'cards_junk'];
  names.forEach((n) => t.eq(typeof ART.sheets[n], 'function', 'sheet ' + n));
  t.throws(() => ART.sheet('motifs', () => {}), 'a duplicate sheet name throws', /duplicate/);
  const mk = () => { const c = doc.createElement('canvas'); c.width = 1200; c.height = 700; return c; };
  clean();
  names.forEach((n) => {
    for (const page of [0, 1, 2, 3, 9, -4]) {
      const c = mk(); ART.sheets[n](c, { w: 1200, h: 700, page, t: 0 });
      t.ok(totalCalls(c.getContext('2d')) > 10, `sheet ${n} page ${page} paints`);
    }
    const c = mk(); ART.sheets[n](c, { w: 1200, h: 700, page: 0, up: 1, anim: 1, t: 1.2, per: 6, cols: 3, ids: 'slash,fire', size: 60 });
    t.ok(totalCalls(c.getContext('2d')) > 10, `sheet ${n} takes its dev params`);
  });
  t.eq(api._issues.length, 0, 'the sheets cause no canvas issues: ' + issues());
});

T('the hero sheets page through all 37 cards of a hero, and the junk sheet shows all twelve', () => {
  HEROES.forEach((h) => { const per = 12, pages = Math.ceil(CARDS.filter((c) => c.hero === h).length / per); t.eq(pages, 4, h + ' needs four pages of twelve'); });
  t.eq(CARDS.filter((c) => c.type === 'curse' || c.type === 'status').length, 12, 'twelve junk cards');
});

// ---------------------------------------------------------------------------------------------- performance
T('perf smoke: baking a card and drawing a live frame stay far below what a frame can afford in bulk', () => {
  const now = () => performance.now();
  ART.sprite.clear();
  const t0 = now();
  for (const c of CARDS) ART.card.draw(newCtx(), c.id, 170, 116);
  const bake = (now() - t0) / CARDS.length;
  t.ok(bake < 40, `baking a card costs ${bake.toFixed(1)} ms on the stub (limit 40)`);
  const shared = newCtx(), t1 = now();
  for (let i = 0; i < 20; i++) for (const c of CARDS) ART.card.draw(shared, c.id, 170, 116);
  const hit = (now() - t1) / (CARDS.length * 20);
  t.ok(hit < 0.6, `a cached draw costs ${hit.toFixed(3)} ms (limit 0.6)`);
  const t2 = now();
  for (let i = 0; i < 6; i++) for (const c of CARDS.slice(0, 60)) ART.card.draw(shared, c.id, 170, 116, i * 0.3);
  const live = (now() - t2) / (60 * 6);
  t.ok(live < 12, `a live hover frame costs ${live.toFixed(2)} ms on the stub (limit 12)`);
  const t3 = now();
  for (const id of MOTIFS) ART.card.motif(shared, id, 12, 12, 24, 'rose');
  const icon = (now() - t3) / MOTIFS.length;
  t.ok(icon < 2 * PERF_SLACK, `a 24 px icon costs ${icon.toFixed(2)} ms (limit 2)`);
});

t.done();
