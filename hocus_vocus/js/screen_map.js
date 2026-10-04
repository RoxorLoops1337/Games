// Echowake: the map screen (owner: map screen engineer). One IIFE that registers UI.screens.map and the overlays `relics` (replacing the
// basic version of ui.js) and `legend` (the page legend, tiles, brushes, controls and the glossary of words). Styles live in css/map.css
// (classes mp-* for the screen, .o-relics and .o-legend overlays). This header is the contract of record for screen_map.js.
//
// THE PAGE (DESIGN 4.8, 5.3, 5.4, 5.11, 6; ART_BIBLE 6 and 8). Params {R}: R falls back to UI.run. The world is R.map, drawn on #view by
// screen.draw through ART.map (paper, hex kinds, fog edge, route, brush preview, bloom, token, frame; every call is guarded and has a plain
// fallback, so a missing or throwing art file never breaks the page). All logic goes through RUN and MAP: RUN.paint, RUN.paintPreview,
// RUN.useBrush, RUN.step, MAP.walkPath, MAP.brushAnchors, MAP.brushCells, MAP.dirOf, MAP.progress. The screen never marks a tile itself.
//
// INTERACTIONS (pointer events only, mouse, touch and pen share one path)
//   pan       drag (more than 9 px) with inertia; wheel zooms around the pointer; two fingers pinch and pan; keyboard arrows pan (Shift x3),
//             + and - zoom, F fits the whole page (again: back to following the party). The camera clamps to the page (zoom aware, and it knows
//             where the HUD is, see THE HUD AND THE CAMERA) and follows the party token while it walks. The buttons on the right do the same for
//             touch: Deck, Legend, Fit, Zoom in, Zoom out.
//   fog       tap a fogged hex next to the painted page: RUN.paint for 1 Ink (bloom, ink sound, content pop). Tap a far fogged hex: the cheapest
//             chain is previewed (RUN.paintPreview) with its Ink cost pill, a second tap on the same hex paints the whole chain in sequence.
//             Not enough Ink: the meter shakes, a toast says how much is missing and nothing changes. The Void and blank edges say so.
//   walk      tap a painted hex: MAP.walkPath, the token walks it step by step (RUN.step at each arrival), footsteps, camera follows, and it
//             stops on the first unresolved tile: a fight, shop, fable... goes to GAME.enterNode after a short beat (the boss gets a long one);
//             a well pours its Ink into the meter, a brush rack drops the brush into the tray, both are instant and the walk ends there.
//   brushes   the tray (bottom centre) holds one chip per brush kind. A chip (or B, or the keys 1 to 9) enters brush mode: the legal anchors
//             glow, hovering (or moving the keyboard cursor) shows the hexes the brush would paint as a wet shape. Line and fan brushes lock an
//             anchor first and then aim: the direction follows the pointer (MAP.dirOf) or the neighbour hex you tap; tap the aimed direction,
//             press Enter or the Paint button to apply (RUN.useBrush). Touch always needs the extra confirming tap. Esc or right click backs out.
//   keyboard  Q E A D Z C move the hex cursor (NW NE W E SW SE), Enter or Space activates it like a tap, Esc cancels a chain preview or
//             a brush, B opens the brush tray, everything on the HUD is a real button. The cursor and every action are announced with UI.announce.
//
// HUD (DOM over the canvas): hero badges with HP (top left), the Ink meter of drops (below them), the chapter banner and a progress meter
// (MAP.progress) at the top, gold and the menu button (top right), the tool column (Deck, Legend, Fit, Zoom), the treasure strip (bottom left,
// opens the `relics` overlay), the brush tray, a hex info chip (bottom right) that names what the pointer or cursor is on and what a
// tap would cost, and, while a brush is armed, the brush mode bar (top centre, in the chapter banner's slot: the brush, a line of help, Paint and Cancel). The chapter intro flourish (title, brush stroke, a swoop from the whole page down to the party) plays once per chapter.
//
// THE HUD AND THE CAMERA. The HUD lies over the page, so the camera never works with the whole window but with what the HUD leaves free. It measures the
//           real rectangle of every piece (party, Ink, banner, gold, menu button, the five tools, tray, info chip, treasure strip, and the brush mode bar while a
//           brush is armed) in stage px, so the compact phone layout, the text size and the number of brushes and treasures are all accounted for, re-measures
//           when any of them moves (a rectangle is taken at rest: the slide-in of the entrance and a hover lift are measured out, ancestors included), and falls
//           back to a fixed table (FALLBACK_HUD) for a piece it cannot measure (headless pages). From the rectangles it derives
//             free  the biggest box clear of every piece: the party, a cursor or a fresh tile is centred on its middle (not the window's), the zoom buttons
//                   turn about it;
//             fit   the largest zoom, and the placement, at which no hex (boss ring included) touches a piece (6 px of air) or leaves the window: a search
//                   over zoom and offset (solveFit), about a millisecond, run when the HUD changes and never per frame. zMin IS this zoom, so Fit, the opening
//                   swoop and the minimum zoom (wheel, pinch, Zoom out) all show the whole page with nothing under the HUD, and at the minimum the camera
//                   sits on the fit;
//             box   where the edges of the padded page may travel (the clamp): the free box, so at every zoom above the minimum any tile can be dragged into
//                   ground the HUD leaves free and the page cannot be lost. The page edge may rest inside the box by the gap the fit itself has at its sides
//                   (s.slack, fading out between 1.6 and 2 x zMin, so the default zoom has none), which keeps a wheel zoom about a pointer over the page anchored when it starts on the fit.
//           The info chip and the mode bar have a fixed size (clamped text) so their footprint does not change with the hex under the pointer or what the bar
//           says. The bar hangs from the top in the chapter banner's slot (the banner fades while it is up); arming or putting away a brush measures the HUD
//           again, and a camera on the fit glides to the new fit (it glides to any fit that moved: it is never clamped onto it first).
//
// OVERLAYS  relics {relics?: [ids]}: every treasure of the run sorted by rarity, with art, text, rarity and where it came from (the chapter of
//           RUN's "Found X" log line, or its source by rarity). legend: tabs Map (every tile), Brushes (each shape drawn on hexes), Controls,
//           Words (the glossary of statuses and keywords that the basic legend of ui.js showed).
//
// UI.bus: map:paint {q, r, cost} once per paint action (q, r is the tapped target, cost the whole Ink), map:brush {id} when a brush is applied,
// map:walk {q, r} when a walk starts (the real destination: the walk may stop short on unresolved content). Anchors (data-tut): ink, hex (an
// invisible box: the first hex of the cheapest chain toward the boss, which is what the `paint` hint points at; right after a paint or a brush it
// moves to the hex that was just painted, which is what the `walk` hint points at, and goes back to the chain once a walk starts), brushes, deck, relics.
//
// TIME. Animation runs on update(dt) (the frame clock), so GAME.debug.tick is exact. With window.__HEADLESS every animation is skipped and
// every walk, bloom and beat completes at once, so suites read final states. reduceMotion: no intro swoop, no petals, no particles, walks
// at 140 ms a step, flights are plain fades. quality low: no petals and no fog edge shimmer is asked of ART.
//
// PUBLIC API beyond DESIGN: UI.screens.map.mapDebug {state(), cam(), screenOf(q, r), hexAt(x, y), hud(measure?), clamp(x, y, z)}, a read-only window onto the live
// visit for suites and the screenshot tool (the camera, where a hex is on the stage, which hex is under a stage point, the HUD footprint {rects, free, box, fit},
// and where the camera may really be). Everything else is reached through the DOM, RUN and the bus
// (tests/hocus_vocus_screen_map.test.mjs). CSS classes: mp-* the screen, mr-* the relics overlay, lg-* the legend (rl-* belongs to node.css).
//
// CLOSED LIST IDS USED. Sounds: ui_click ui_back ui_error ui_open ui_hover paint ink_splash ink_gain brush_use step reveal_landmark boss_intro page_turn.
// AUDIO.wake (one note per woken hex, with a rising note mark), AUDIO.wakeDegree (the mark's height and the bloom's note), AUDIO.awake (the Hush), each optional at call time.
// Overlays opened: deck (mode view), relics, legend. Bus: map:paint map:brush map:walk. Art: ART.map paper hex fogEdge edgeMasks route brushPreview
// paintBloom token frame frameInner warm, ART.fx inkSplash ring sparkle, ART.icon tile, ART.tk glow petal. Each is optional at call time.
//
// DEVIATIONS AND NOTES (also in the final report)
//   * GAME.enterNode(instant) toasts "The well refills your Ink" and plays the pickup sound itself; the screen adds the pour and the tray pop.
//     For a fable with nothing left to tell RUN says so in instant.toast, which the screen shows as a second toast.
//   * Anything RUN leaves in R.pending after a paint or brush hook (no relic does that today) is answered with a safe default so the page can
//     never soft lock: optional ops are skipped, deck ops take the first cards, a card reward the first offer.
(() => {
  'use strict';
  const mk = UI.el;
  const clamp = U.clamp;
  const isFn = (f) => typeof f === 'function';
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const headless = () => !!window.__HEADLESS;
  const reduced = () => !!(UI.opt && UI.opt.reduceMotion);
  const lowQ = () => !!(UI.opt && UI.opt.quality === 'low');
  const snd = (id) => { safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.sfx)) AUDIO.sfx(id); }); };
  // Echo: one woken hex sings its note (AUDIO.wake), panned with its place on the stage. Every call leaves a rising note mark (also with sound off).
  const echoInfo = (s) => ({ chapter: s.M.chapter, seed: s.M.seed, cols: s.M.cols, rows: s.M.rows });
  const wakeDeg = (s, q, r, o) => safe(() => (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.wakeDegree) ? AUDIO.wakeDegree(q, r, Object.assign(echoInfo(s), o || {})) | 0 : 0), 0);
  const noteOf = (deg) => ((deg % 7) + 7) % 7;
  function wakeNote(s, q, r, o) {
    safe(() => {
      if (!s.heard) s.heard = new Map();
      s.heard.set(keyOf(q, r), s.t);
      if (s.heard.size > 64) { const old = []; s.heard.forEach((t, k) => { if (s.t - t >= 4) old.push(k); }); old.forEach((k) => s.heard.delete(k)); }
      if (!headless()) {
        const w = worldOf(q, r);
        if (!s.noteMarks) s.noteMarks = [];
        s.noteMarks.push({ wx: w.x, wy: w.y, t0: s.t, deg: wakeDeg(s, q, r, o), soft: !!(o && o.soft) });
        if (s.noteMarks.length > 24) s.noteMarks.splice(0, s.noteMarks.length - 24);
      }
      if (typeof AUDIO === 'undefined' || !AUDIO || !isFn(AUDIO.wake)) return;
      const p = screenOf(s, q, r);
      AUDIO.wake(q, r, Object.assign(echoInfo(s), { pan: clamp((p.x - 640) / 900, -0.5, 0.5) }, o || {}));
    });
  }
  const heardRecently = (s, q, r) => { const t = s.heard && s.heard.get(keyOf(q, r)); return t !== undefined && s.t - t < 4; };
  const warned = {};
  const warnOnce = (key, e) => {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[screen_map] ' + key + (e ? ': ' + (e.message || e) : ''));
  };
  const cap = U.cap;
  const esc = U.esc;
  const tut = (el, name) => { el.setAttribute('data-tut', name); return el; };

  // ==================================================================================================================
  // constants
  // ==================================================================================================================
  const HEX = (DATA.ECONOMY.map && DATA.ECONOMY.map.hexSize) || 46;      // world hex size: MAP.toPixel(q, r, HEX), ART.map sizes are HEX * zoom
  const SQ3 = Math.sqrt(3);
  const DEF_WIN = { x: 44, y: 36, w: 1192, h: 648 };                    // the page window inside the book frame (ART.map.frameInner)
  const CX = 640, CY = 360;                                              // the window is centred on the stage
  const PAD = 80;                                                        // world padding around the page the camera may show
  const SLACK_FULL = 1.6, SLACK_END = 2;                                 // the fit's side gaps stay allowed up to 1.6 x zMin and are gone by 2 x zMin (about the default zoom)
  const ZMAX = 2.4;
  const HUD_MARGIN = 6;                                                  // stage px kept clear around every HUD rectangle at the fit
  const FIT_WIN_MARGIN = 10;                                             // and inside the page window
  const HEX_PAD = 1.03, BOSS_PAD = 1.2;                                  // the hex outline, and the boss ring, as a multiple of HEX
  const Z_LO = 0.2;                                                      // the smallest fit zoom the search tries
  const FIT_STEP = 0.97;                                                 // the search walks down from the largest zoom in 3 percent steps, then bisects
  const FIT_GLIDE_S = 0.4;                                               // seconds a camera on the fit takes to move to a fit that moved
  const HUD_POLL = 0.25;                                                 // seconds between looks at the HUD rectangles
  const HUD_EPS = 2.5;                                                   // an edge that moved by more than this many stage px re-fits the camera
  const DRAG_PX = 9;
  const TAP_MS = 700;
  const STEP_S = 0.23;                                                   // seconds per hex of a walk
  const REVEAL_S = 0.62;                                                 // a bloom
  const REVEAL_GAP = 0.13;                                               // between the cells of a chain
  const POP_S = 0.5;
  const DIR_KEYS = { d: 0, e: 1, q: 2, a: 3, z: 4, c: 5 };               // E NE NW W SW SE (MAP.DIRS order)
  const DIR_NAMES = ['east', 'north east', 'north west', 'west', 'south west', 'south east'];
  const RARITY_ORDER = ['boss', 'rare', 'shop', 'uncommon', 'common'];
  const RARITY_NAME = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', boss: 'Headliner', shop: 'Merch' };   // display words for the rarity ids (never print the id)
  const MEMO = { id: '', runId: '', chapter: 0, mercy: 0 };                         // what the last visit already showed
  // Where each HUD piece sits when its rectangle cannot be measured (a headless page, a piece not built yet): [x0, y0, x1, y1] in stage px, taken from the
  // real layout at 1280x720 and at the compact phone layout. The measured rectangle always wins; this only keeps the fit and the clamp sensible.
  // `mode` is the brush mode bar: transient, it only counts while a brush is armed (it hangs from the top, in the slot of the chapter banner, which fades while it is up)
  const HUD_KEYS = ['party', 'ink', 'banner', 'gold', 'menu', 'deck', 'legend', 'fit', 'zin', 'zout', 'tray', 'info', 'relics', 'mode'];
  const FALLBACK_HUD = {
    wide: { party: [14, 9, 312, 75], ink: [14, 84, 374, 138], banner: [419, 2, 861, 86], gold: [1134, 14, 1196, 48], menu: [1211, 0, 1269, 57],
      deck: [1208, 74, 1268, 134], legend: [1205, 143, 1268, 203], fit: [1208, 212, 1268, 272], zin: [1202, 281, 1268, 341], zout: [1191, 350, 1268, 410],
      tray: [477, 596, 803, 712], info: [946, 589, 1268, 708], relics: [14, 640, 400, 708], mode: [340, 2, 940, 82] },
    compact: { party: [14, 9, 312, 75], ink: [14, 82, 374, 136], banner: [460, 2, 820, 90], gold: [1113, 14, 1175, 48], menu: [1185, 0, 1269, 83],
      deck: [1187, 89, 1268, 170], legend: [1187, 178, 1268, 260], fit: [1187, 268, 1268, 349], zin: [1187, 357, 1268, 438], zout: [1187, 446, 1268, 527],
      tray: [520, 590, 760, 712], info: [988, 625, 1268, 708], relics: [14, 611, 280, 708], mode: [447, 2, 833, 90] },
  };

  let S = null;                                                          // the live visit, null between visits

  // ==================================================================================================================
  // data helpers
  // ==================================================================================================================
  const tileInfo = (type) => DATA.tiles[type] || { name: cap(String(type)), text: '' };
  const brushDef = (id) => DATA.brushes[id] || { id, name: cap(String(id)), text: '', kind: 'dot' };
  const heroName = (id) => (DATA.heroes[id] && DATA.heroes[id].name) || String(id);
  const keyOf = (q, r) => MAP.key(q, r);
  const tileAt = (M, q, r) => (M && M.tiles ? M.tiles[keyOf(q, r)] || null : null);
  const chapterTitle = (n) => (DATA.lore && DATA.lore['ch' + n + '_intro'] && DATA.lore['ch' + n + '_intro'].title) || ('Act ' + n);
  const relicLine = (id) => safe(() => DATA.relicText(id), '') || (DATA.relics[id] && DATA.relics[id].text) || '';

  function stageRect(el) {
    const r = el.getBoundingClientRect();
    const a = UI.toStage(r.left, r.top), b = UI.toStage(r.right, r.bottom);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  function clearKids(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // ==================================================================================================================
  // per-visit state. Everything the page owns hangs off S, and S.live() is false as soon as the player leaves
  // ==================================================================================================================
  function begin(params, root) {
    const R = (params && params.R) || UI.run || null;
    const M = R && R.map && R.map.tiles ? R.map : null;
    return {
      R, M, root, params: params || {}, live: UI.live(), empty: !M,
      t: 0, frame: 0,
      win: DEF_WIN, world: { x0: 0, y0: 0, x1: 1, y1: 1 }, rows: [], fitZ: 0.6, zMin: 0.5,
      hudRects: null, free: { x0: DEF_WIN.x, y0: DEF_WIN.y, x1: DEF_WIN.x + DEF_WIN.w, y1: DEF_WIN.y + DEF_WIN.h }, box: null, slack: { x: 0, y: 0 }, fit: { x: 0, y: 0, z: 0.5 }, fg: null, hudT: 0, hudDirty: false, hudSig: {}, hudVer: 0,
      cam: { x: 0, y: 0, z: 1 }, goal: null, tz: 1, zp: { x: CX, y: CY }, follow: true, fitted: false, vel: { x: 0, y: 0 }, inertia: false, panRate: 7, zoomRate: 12,
      ptrs: new Map(), pinch: null, mode: 'mouse', hover: null, hoverPt: null, cursor: null,
      chain: null, brush: null, walk: null, busy: false, beat: null,
      tiles: [], byKey: null, touch: new Set(), edge: [], edgePool: [], ver: 0,
      reveals: new Map(), pops: [], parts: [], petals: [], noteMarks: [], heard: new Map(), walkK: 0,
      tok: { x: 0, y: 0, dir: 1, moving: false }, tokTo: null,
      hud: {}, last: {}, info: null, anchorKey: '', artBad: {},
      intro: null, pendingTimer: 0,
    };
  }

  // ==================================================================================================================
  // geometry and camera. World px at HEX 46 (MAP.toPixel); screen = centre + (world - cam) * zoom
  //
  // The lacquer HUD lies over the page, so the camera works with the part of the stage the HUD leaves free, not with the whole window:
  //   * relayout measures the REAL rectangle of every HUD piece (stage px, so the compact phone layout, the text size and the number of brushes or
  //     treasures are all accounted for) and keeps them in s.hudRects; a piece that cannot be measured (a headless page) falls back to FALLBACK_HUD.
  //   * s.free is the biggest box the window keeps clear of every piece (each piece counted against the window side it hangs from): the middle of it is
  //     where the camera centres the party, a keyboard cursor or a tile that just popped, and it is the pivot of the zoom buttons.
  //   * s.fit is the fit view: solveFit finds the largest zoom, and the place for the page, at which no hex (boss ring included) touches any piece.
  //     zMin is that zoom, so the page can never be zoomed out into the HUD, and the Fit button, the opening swoop and the minimum zoom all show it.
  //   * s.box is where the edges of the padded page may travel (the camera clamp): the free box, widened by s.slack (the gap the fit has at its sides) so a zoom
  //     about a pointer that starts on the fit stays anchored. Any tile can be dragged into it, so any tile can be brought clear of the HUD at every zoom level
  //     above the minimum; at the minimum zoom the camera is pinned on the fit.
  // ==================================================================================================================
  const wx2sx = (c, wx) => CX + (wx - c.x) * c.z;
  const wy2sy = (c, wy) => CY + (wy - c.y) * c.z;
  const worldOf = (q, r) => MAP.toPixel(q, r, HEX);
  const isCompact = () => { const st = document.getElementById('stage'); return !!(st && st.classList.contains('compact')); };

  function frameWin() {
    const f = typeof ART !== 'undefined' && ART && ART.map && isFn(ART.map.frameInner) ? safe(() => ART.map.frameInner(1280, 720), null) : null;
    return f && f.w > 0 && f.h > 0 ? f : DEF_WIN;
  }

  // ---- the footprint of the HUD: measured rectangles, in stage px
  function hudEls(s) {
    const H = s.hud;
    return { party: H.party, ink: H.inkMeter && H.inkMeter.root, banner: H.banner, gold: H.gold, menu: H.menu, deck: H.deckBtn, legend: H.legendBtn, fit: H.fitBtn, zin: H.zoomIn, zout: H.zoomOut, tray: H.tray, info: H.info, relics: H.relics, mode: H.mode };
  }

  // the rectangle of one piece where it rests: the entrance animation and a hover lift move it with a `translate`, which is taken out, and so is the translate of every
  // ancestor up to the screen root (the five tools sit in a column that slides in as one, so they are measured at rest too). null: hidden or not measurable
  const translateOf = (el) => {
    const m = /^(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(String(safe(() => getComputedStyle(el).translate, '')));
    return m ? { x: parseFloat(m[1]) || 0, y: m[2] ? parseFloat(m[2]) || 0 : 0 } : { x: 0, y: 0 };
  };
  function restRect(el, stop) {
    if (!el || !isFn(el.getBoundingClientRect)) return null;
    const b = safe(() => stageRect(el), null);
    if (!b || !Number.isFinite(b.x + b.y + b.w + b.h)) return null;
    if (b.w > UI.W * 0.9 && b.h > UI.H * 0.9) return null;           // a headless element is as big as the page: nothing was measured
    let tx = 0, ty = 0;
    for (let p = el, n = 0; p && p !== stop && n < 8; p = p.parentElement, n++) { const t = translateOf(p); tx += t.x; ty += t.y; }
    return { x0: b.x - tx, y0: b.y - ty, x1: b.x + b.w - tx, y1: b.y + b.h - ty };
  }

  function measureHud(s) {
    const els = hudEls(s), fb = isCompact() ? FALLBACK_HUD.compact : FALLBACK_HUD.wide, out = [];
    HUD_KEYS.forEach((k) => {
      if (k === 'mode' && !(els.mode && !els.mode.hidden)) return;       // the brush mode bar covers something only while a brush is armed
      const el = els[k], r = restRect(el, s.root);
      if (r) { if (r.x1 - r.x0 > 0.5 && r.y1 - r.y0 > 0.5) out.push({ k, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, live: true }); }   // a zero box (display none) covers nothing
      else out.push({ k, x0: fb[k][0], y0: fb[k][1], x1: fb[k][2], y1: fb[k][3], live: false });
    });
    return out;
  }

  function sameHud(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].k !== b[i].k || Math.abs(a[i].x0 - b[i].x0) > HUD_EPS || Math.abs(a[i].y0 - b[i].y0) > HUD_EPS || Math.abs(a[i].x1 - b[i].x1) > HUD_EPS || Math.abs(a[i].y1 - b[i].y1) > HUD_EPS) return false;
    }
    return true;
  }

  // the box the window keeps clear: every piece counts against the window side it is nearest to (the Ink plate hangs from the top, the tool column from the right)
  function freeBoxOf(win, rects) {
    const ins = { t: 0, b: 0, l: 0, r: 0 };
    rects.forEach((q) => {
      const d = { t: q.y1 - win.y, b: win.y + win.h - q.y0, l: q.x1 - win.x, r: win.x + win.w - q.x0 };
      let side = 't';
      ['b', 'l', 'r'].forEach((k) => { if (d[k] < d[side]) side = k; });
      if (d[side] > 0) ins[side] = Math.max(ins[side], d[side] + HUD_MARGIN);
    });
    const f = { x0: win.x + ins.l, y0: win.y + ins.t, x1: win.x + win.w - ins.r, y1: win.y + win.h - ins.b };
    return f.x1 - f.x0 < 160 || f.y1 - f.y0 < 120 ? { x0: win.x, y0: win.y, x1: win.x + win.w, y1: win.y + win.h } : f;
  }

  const freeMid = (s) => ({ x: (s.free.x0 + s.free.x1) / 2, y: (s.free.y0 + s.free.y1) / 2 });

  // the camera that puts a world point on the middle of the free box at zoom z
  function camFor(s, wx, wy, z) {
    const m = freeMid(s);
    return { x: wx - (m.x - CX) / z, y: wy - (m.y - CY) / z, z };
  }

  // The fit: the largest zoom at which no hex touches a HUD rectangle (each grown by HUD_MARGIN) or leaves the window, and where the page goes.
  // With the screen position of a world point (x, y) at zoom z being O + (x, y) * z, a hex at world (x, y) is in the way of a rectangle exactly when O lies in
  // the rectangle grown by the hex and moved by -(x, y) * z. The hexes of one world row give copies of the same rectangle that overlap each other, so a row
  // merges into one; what is left (about 13 rows x 13 pieces) is a short list of forbidden boxes, and a free O, when there is one, has its x on the right edge
  // of a forbidden box (or the left edge of the allowed range) and a free gap in y at that x. So each zoom costs one sweep over a few hundred boxes, the zoom
  // is found by stepping down from the largest one and bisecting the last step, and the search runs when the HUD changes, never per frame.
  function solveFit(s, rects) {
    const win = s.win, G = s.rows, W = s.world, wm = FIT_WIN_MARGIN;
    if (!G.length) return null;
    const wx0 = win.x + wm, wy0 = win.y + wm, wx1 = win.x + win.w - wm, wy1 = win.y + win.h - wm;
    const R = rects.map((r) => ({ x0: r.x0 - HUD_MARGIN, y0: r.y0 - HUD_MARGIN, x1: r.x1 + HUD_MARGIN, y1: r.y1 + HUD_MARGIN }));
    const mid = freeMid(s), wcx = (W.x0 + W.x1) / 2, wcy = (W.y0 + W.y1) / 2;
    // place(z): O for the page at zoom z (null: none). ideal: pick the free spot nearest to the page centred in the free box instead of any
    const place = (z, ideal) => {
      let bx0 = -Infinity, bx1 = Infinity, by0 = -Infinity, by1 = Infinity;
      for (let i = 0; i < G.length; i++) {                         // O keeping every hex inside the window
        const g = G[i], hw = SQ3 / 2 * HEX * z * g.rad, hh = HEX * z * g.rad;
        bx0 = Math.max(bx0, wx0 + hw - g.xs[0] * z); bx1 = Math.min(bx1, wx1 - hw - g.xs[g.xs.length - 1] * z);
        by0 = Math.max(by0, wy0 + hh - g.y * z); by1 = Math.min(by1, wy1 - hh - g.y * z);
      }
      if (bx0 > bx1 || by0 > by1) return null;
      const F = [];                                                // the forbidden boxes (open) that reach into that range
      for (let i = 0; i < G.length; i++) {
        const g = G[i], hw = SQ3 / 2 * HEX * z * g.rad, hh = HEX * z * g.rad, n = g.xs.length;
        for (let j = 0; j < R.length; j++) {
          const r = R[j], y0 = r.y0 - hh - g.y * z, y1 = r.y1 + hh - g.y * z;
          if (y1 <= by0 || y0 >= by1) continue;
          let a = r.x0 - hw - g.xs[0] * z, b = r.x1 + hw - g.xs[0] * z;
          for (let k = 1; k < n; k++) {                            // hexes go right, their boxes go left: merge the ones that overlap
            const na = r.x0 - hw - g.xs[k] * z, nb = r.x1 + hw - g.xs[k] * z;
            if (nb >= a) a = na; else { if (b > bx0 && a < bx1) F.push({ x0: a, x1: b, y0, y1 }); a = na; b = nb; }
          }
          if (b > bx0 && a < bx1) F.push({ x0: a, x1: b, y0, y1 });
        }
      }
      F.sort((p, q) => p.y0 - q.y0);
      const runs = (x) => {                                        // the free runs of y at this x
        const out = [];
        let cur = by0;
        for (let i = 0; i < F.length; i++) {
          const f = F[i];
          if (!(f.x0 < x && x < f.x1)) continue;
          if (f.y0 > cur) { out.push([cur, Math.min(f.y0, by1)]); if (f.y0 >= by1) return out; }
          if (f.y1 > cur) cur = f.y1;
          if (cur > by1) return out;
        }
        out.push([cur, by1]);
        return out;
      };
      const xs = [bx0];
      for (let i = 0; i < F.length; i++) if (F[i].x1 > bx0 && F[i].x1 <= bx1) xs.push(F[i].x1);
      const want = { x: mid.x - wcx * z, y: mid.y - wcy * z };
      let best = null;
      for (let i = 0; i < xs.length; i++) {
        const rs = runs(xs[i]);
        if (!rs.length) continue;
        if (!ideal) return { x: xs[i], y: rs[0][0] };
        rs.forEach((q) => {
          const y = clamp(want.y, q[0], q[1]), d = Math.hypot(xs[i] - want.x, y - want.y);
          if (!best || d < best.d) best = { x: xs[i], y, d };
        });
      }
      if (!best || !ideal) return best;
      // slide along the free gaps toward the centred spot: first in x at this y, then in y at the new x
      let a = bx0, b = bx1;
      for (let i = 0; i < F.length; i++) { const f = F[i]; if (!(f.y0 < best.y && best.y < f.y1)) continue; if (f.x1 <= best.x) a = Math.max(a, f.x1); else if (f.x0 >= best.x) b = Math.min(b, f.x0); }
      best.x = clamp(want.x, Math.min(a, best.x), Math.max(b, best.x));
      let c = by0, d = by1;
      for (let i = 0; i < F.length; i++) { const f = F[i]; if (!(f.x0 < best.x && best.x < f.x1)) continue; if (f.y1 <= best.y) c = Math.max(c, f.y1); else if (f.y0 >= best.y) d = Math.min(d, f.y0); }
      best.y = clamp(want.y, Math.min(c, best.y), Math.max(d, best.y));
      return best;
    };
    const top = clamp(Math.min((wx1 - wx0) / (W.x1 - W.x0), (wy1 - wy0) / (W.y1 - W.y0)), Z_LO, 1);
    let z = top, above = 0, hit = -1;
    for (; z >= Z_LO; z *= FIT_STEP) { if (place(z, false)) { hit = z; break; } above = z; }
    if (hit < 0) return null;
    let lo = hit, hi = above || hit;
    for (let i = 0; i < 7 && hi > lo; i++) { const m = (lo + hi) / 2; if (place(m, false)) lo = m; else hi = m; }
    const o = place(lo, true);
    return o ? { z: lo, x: (CX - o.x) / lo, y: (CY - o.y) / lo } : null;
  }

  // when no zoom clears the HUD (a HUD bigger than any page could fit beside): the page centred in the free box at the zoom that fits it
  function fallbackFit(s) {
    const f = s.free, w = s.world, m = freeMid(s);
    const z = clamp(Math.min((f.x1 - f.x0) / (w.x1 - w.x0), (f.y1 - f.y0) / (w.y1 - w.y0)), Z_LO, 1);
    return { z, x: (w.x0 + w.x1) / 2 - (m.x - CX) / z, y: (w.y0 + w.y1) / 2 - (m.y - CY) / z };
  }

  // measure the HUD and, when it moved, redo the free box, the fit and the clamp box. true when anything changed.
  function relayout(s, force) {
    const rects = measureHud(s);
    if (!force && sameHud(s.hudRects, rects)) return false;
    s.hudRects = rects;
    s.free = freeBoxOf(s.win, rects);
    s.fit = solveFit(s, rects) || fallbackFit(s);
    s.fitZ = s.zMin = s.fit.z;
    const f = s.free, w = s.world, c = s.fit;
    s.box = { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 };
    // slack: how far the padded page edge sits INSIDE the free box on the fit (a page narrower than the free box has gaps at its sides). The camera may keep the page
    // edge that far in at every zoom, which is exactly what keeps a zoom about the pointer anchored when it starts on the fit (see clampAxis). It only ever widens the range.
    const gap = (l0, l1, b0, b1) => Math.max(0, l0 - b0, b1 - l1) + 0.5;
    const px0 = CX + (w.x0 - PAD - c.x) * c.z, px1 = CX + (w.x1 + PAD - c.x) * c.z, py0 = CY + (w.y0 - PAD - c.y) * c.z, py1 = CY + (w.y1 + PAD - c.y) * c.z;
    s.slack = { x: gap(px0, px1, f.x0, f.x1), y: gap(py0, py1, f.y0, f.y1) };
    s.hudVer++;
    return true;
  }

  function setupCamera(s) {
    s.win = frameWin();
    const b = MAP.bounds(s.M, HEX);
    s.world = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    relayout(s, true);                                             // the fallback rectangles until the HUD exists
  }

  // the HUD moved (a resize, a new text size, a brush or a treasure gained, a brush armed or put away, gold with another digit): keep the camera valid and, on the fit,
  // on the new fit. A camera on the fit glides to it whichever way the fit moved: the camera is not clamped first, so a fit that grew (the HUD shrank) does not pop.
  function applyLayout(s) {
    const c = s.cam, f = s.fit;
    if (s.fitted) {
      s.goal = null; s.vel.x = s.vel.y = 0; s.inertia = false;
      if (headless() || (Math.abs(Math.log(f.z / c.z)) < 1e-4 && Math.hypot(f.x - c.x, f.y - c.y) < 0.4)) { s.fg = null; c.z = s.tz = f.z; c.x = f.x; c.y = f.y; return; }
      s.fg = { z0: c.z, x0: c.x, y0: c.y, t: 0 };
      s.tz = f.z;
      return;
    }
    if (c.z < s.zMin) c.z = s.zMin;
    if (s.tz < s.zMin) s.tz = s.zMin;
    clampCam(s, c);
  }

  // look at the HUD a few times a second (and at once when something known to move it changed)
  function watchHud(s, dt) {
    const g = s.hudSig, ts = UI.opt && UI.opt.textScale;
    if (g.scale !== UI.scale || g.ox !== UI.ox || g.oy !== UI.oy || g.ts !== ts) {                  // the window or the text size changed (the chip's copy follows the text size)
      if (g.ts !== ts) { s.infoKey = ''; s.infoDirty = true; }
      g.scale = UI.scale; g.ox = UI.ox; g.oy = UI.oy; g.ts = ts; s.hudDirty = true;
    }
    s.hudT -= dt;
    if (!s.hudDirty && s.hudT > 0) return;
    s.hudDirty = false; s.hudT = HUD_POLL;
    if (relayout(s, false)) applyLayout(s);
  }

  // The clamp on one axis, in terms of the padded page [lo, hi] (world) and the free box [b0, b1] (screen). The page edges may sit up to v inside the box:
  //   a page bigger than the box covers it (v 0), a smaller one roams inside it (v = box - page), and slack widens both (the gap the fit itself has, see relayout).
  // v is a floor, so the range only ever grows with slack: every tile can always be brought into the box (the page edge may rest on its edge), and a zoom about a
  // pointer over the page that starts on the fit stays inside the range (the page grows about the pointer, so its edges only move away from it), which is what keeps
  // the point under the pointer fixed.
  function clampAxis(v, lo, hi, b0, b1, mid, z, slack) {
    const vv = Math.max(0, (b1 - b0) - (hi - lo) * z, slack);
    const a = lo + (mid - b0 - vv) / z, b = hi + (mid - b1 + vv) / z;
    return clamp(v, Math.min(a, b), Math.max(a, b));
  }

  // the slack fades out as the page grows well past the fit (it is for the first notches of a zoom from the fit, not for a page that is already big)
  const slackAt = (s, z) => clamp((SLACK_END - z / s.zMin) / (SLACK_END - SLACK_FULL), 0, 1);

  function clampCam(s, c) {
    if (!s.box) return c;
    if (c.z <= s.zMin + 1e-9) { c.x = s.fit.x; c.y = s.fit.y; return c; }       // fully zoomed out: the page sits on the fit
    const w = s.world, b = s.box, k = slackAt(s, c.z);
    c.x = clampAxis(c.x, w.x0 - PAD, w.x1 + PAD, b.x0, b.x1, CX, c.z, s.slack.x * k);
    c.y = clampAxis(c.y, w.y0 - PAD, w.y1 + PAD, b.y0, b.y1, CY, c.z, s.slack.y * k);
    return c;
  }

  // zoom to nz keeping the world point under the screen point (px, py) fixed
  function zoomAt(s, nz, px, py) {
    nz = clamp(nz, s.zMin, ZMAX);
    const c = s.cam;
    const wx = c.x + (px - CX) / c.z, wy = c.y + (py - CY) / c.z;
    c.z = nz;
    c.x = wx - (px - CX) / nz;
    c.y = wy - (py - CY) / nz;
    clampCam(s, c);
    return nz;
  }

  const defaultZoom = () => (isCompact() ? 1.2 : 1);

  function tokenWorld(s) { return { x: s.tok.x, y: s.tok.y }; }

  function userMoved(s) { s.follow = false; s.goal = null; s.fitted = false; s.fg = null; }

  // glide the camera: {x, y} camera centre (optional), z zoom (optional)
  function glideTo(s, g, rates) {
    if (headless()) {
      if (g.z !== undefined) { s.cam.z = clamp(g.z, s.zMin, ZMAX); s.tz = s.cam.z; }
      if (g.x !== undefined) s.cam.x = g.x;
      if (g.y !== undefined) s.cam.y = g.y;
      clampCam(s, s.cam);
      return;
    }
    s.goal = g.x === undefined ? null : { x: g.x, y: g.y };
    if (g.z !== undefined) { s.tz = clamp(g.z, s.zMin, ZMAX); s.zp = freeMid(s); }
    if (rates) { s.panRate = rates[0]; s.zoomRate = rates[1]; } else { s.panRate = 7; s.zoomRate = 12; }
  }

  function followParty(s, on) {
    s.follow = !!on;
    if (on) { s.goal = null; s.fitted = false; s.fg = null; }
  }

  // the camera is on the fit view: asked to be (Fit), or zoomed all the way out by any means (wheel, pinch, the buttons, the keys), where it sits on the fit
  const onFit = (s) => s.fitted || (s.cam.z <= s.zMin + 1e-9 && s.tz <= s.zMin + 1e-9);

  function toggleFit(s) {
    if (s.empty) return;
    s.fg = null;
    if (onFit(s)) {
      s.fitted = false;
      followParty(s, true);
      glideTo(s, { z: defaultZoom() });
      if (headless()) { const p = tokenWorld(s), c = camFor(s, p.x, p.y, s.cam.z); s.cam.x = c.x; s.cam.y = c.y; clampCam(s, s.cam); }
    } else {
      s.fitted = true; s.follow = false;
      glideTo(s, { x: s.fit.x, y: s.fit.y, z: s.fit.z });
    }
    snd('ui_click');
  }

  function zoomStep(s, f) {
    if (s.empty) return;
    s.fitted = false; s.fg = null;
    const z = clamp(s.tz * f, s.zMin, ZMAX), m = freeMid(s);
    if (headless()) { zoomAt(s, z, m.x, m.y); s.tz = s.cam.z; s.fitted = s.cam.z <= s.zMin + 1e-9; if (s.fitted) { s.follow = false; s.goal = null; } return; }
    s.tz = z; s.zp = m; s.zoomRate = 12;
  }

  function panBy(s, dx, dy) {                                   // screen px
    if (s.cam.z <= s.zMin + 1e-9) return;                       // fully zoomed out the camera is pinned on the fit: nothing to pan
    userMoved(s);
    s.cam.x += dx / s.cam.z; s.cam.y += dy / s.cam.z;
    clampCam(s, s.cam);
  }

  function frameCamera(s, dt) {
    const c = s.cam;
    if (s.fg) {                                                   // gliding to a fit that moved: straight from where the camera is to where the fit now is (the fit may move again)
      const g = s.fg, f = s.fit;
      g.t += dt;
      const k = clamp(g.t / FIT_GLIDE_S, 0, 1), e = U.ease.inOutQuad(k);
      c.z = g.z0 * Math.pow(f.z / g.z0, e); c.x = g.x0 + (f.x - g.x0) * e; c.y = g.y0 + (f.y - g.y0) * e;
      s.tz = c.z;
      if (k >= 1) { c.z = s.tz = f.z; c.x = f.x; c.y = f.y; s.fg = null; }
      return;
    }
    // zoom first (pivot kept), then pan, so a glide to a point lands where it says
    if (Math.abs(c.z - s.tz) > 1e-4) {
      const k = 1 - Math.exp(-s.zoomRate * dt);
      zoomAt(s, c.z + (s.tz - c.z) * k, s.zp.x, s.zp.y);
      if (Math.abs(c.z - s.tz) < 1e-3) { zoomAt(s, s.tz, s.zp.x, s.zp.y); }
    }
    let tx = null, ty = null;
    if (s.follow) { const p = tokenWorld(s), g = camFor(s, p.x, p.y, c.z); tx = g.x; ty = g.y; }
    else if (s.goal) { tx = s.goal.x; ty = s.goal.y; }
    if (tx !== null) {
      const g = clampCam(s, { x: tx, y: ty, z: c.z });
      const k = 1 - Math.exp(-s.panRate * dt);
      c.x += (g.x - c.x) * k; c.y += (g.y - c.y) * k;
      if (s.goal && Math.abs(g.x - c.x) < 0.4 && Math.abs(g.y - c.y) < 0.4) { c.x = g.x; c.y = g.y; s.goal = null; }
    } else if (s.inertia) {
      c.x += s.vel.x * dt; c.y += s.vel.y * dt;
      const f = Math.exp(-4.2 * dt);
      s.vel.x *= f; s.vel.y *= f;
      if (Math.hypot(s.vel.x, s.vel.y) < 6) s.inertia = false;
    }
    clampCam(s, c);
    if (c.z <= s.zMin + 1e-9 && s.tz <= s.zMin + 1e-9 && !s.goal) { s.fitted = true; s.follow = false; }      // zoomed all the way out (a button, the keys, a glide) is the fit view, whether the camera was following or not
  }

  // which hex is under a stage point, or null when the point is on the frame or off the page
  function hexAt(s, px, py) {
    const w = s.win;
    if (px < w.x || px > w.x + w.w || py < w.y || py > w.y + w.h) return null;
    const c = s.cam;
    const h = MAP.fromPixel(c.x + (px - CX) / c.z, c.y + (py - CY) / c.z, HEX);
    const T = tileAt(s.M, h.q, h.r);
    return T ? { q: T.q, r: T.r } : null;
  }

  // keep a world point where the HUD leaves it visible (keyboard cursor, a tile that just popped): glide, to the middle of the free box, only when it
  // is outside the middle part of that box
  function revealOnScreen(s, wx, wy) {
    const c = s.cam, f = s.free, sx = wx2sx(c, wx), sy = wy2sy(c, wy), m = Math.min(110 + c.z * 30, (f.y1 - f.y0) * 0.22);
    if (c.z <= s.zMin + 1e-9) return;                           // on the fit the whole page is already on free ground
    if (sx > f.x0 + m && sx < f.x1 - m && sy > f.y0 + m && sy < f.y1 - m) return;
    userMoved(s);
    const g = camFor(s, wx, wy, c.z);
    glideTo(s, { x: g.x, y: g.y });
  }

  // ==================================================================================================================
  // tiles: a sorted list of {T, k, x, y, seed} built once per visit, and the derived fog picture (touch, edge masks) rebuilt on change
  // ==================================================================================================================
  function buildTiles(s) {
    const list = [];
    Object.keys(s.M.tiles).forEach((k) => {
      const T = s.M.tiles[k];
      const p = worldOf(T.q, T.r);
      list.push({ T, k, x: p.x, y: p.y, seed: U.hash(T.q, T.r) });
    });
    list.sort((a, b) => a.T.r - b.T.r || a.T.q - b.T.q);
    s.tiles = list;
    s.byKey = new Map(list.map((e) => [e.k, e]));
    // the hexes of one world row (the boss on its own, its ring is wider): what the fit search works on
    const rows = new Map();
    list.forEach((e) => {
      const rad = e.T.type === 'boss' ? BOSS_PAD : HEX_PAD, k = e.y.toFixed(2) + ':' + rad;
      let g = rows.get(k);
      if (!g) { g = { y: e.y, rad, xs: [] }; rows.set(k, g); }
      g.xs.push(e.x);
    });
    s.rows = Array.from(rows.values());
    s.rows.forEach((g) => g.xs.sort((a, b) => a - b));
  }

  const hasMasks = () => typeof ART !== 'undefined' && ART && ART.map && isFn(ART.map.edgeMasks);
  function masksOf(q, r, kindAt) {
    if (hasMasks()) return ART.map.edgeMasks(q, r, kindAt);
    let mask = 0, vm = 0;
    for (let d = 0; d < 6; d++) { const kd = kindAt(q + MAP.DIRS[d][0], r + MAP.DIRS[d][1]); if (kd === 'fog') mask |= 1 << d; else if (kd === 'void') vm |= 1 << d; }
    return { mask, voidMask: vm };
  }

  // what is drawn as painted ground: painted and not still waiting for its bloom
  function shown(s, T) { return !!(T && T.painted && !s.reveals.has(keyOf(T.q, T.r))); }

  function rebuildVisual(s) {
    const M = s.M;
    const kindAt = (q, r) => {
      const T = tileAt(M, q, r);
      if (!T) return 'off';
      if (shown(s, T)) return 'painted';
      return T.type === 'block' ? 'void' : 'fog';
    };
    s.touch = new Set();
    s.edge = [];
    s.tiles.forEach((e) => {
      const T = e.T;
      if (!shown(s, T)) return;
      const m = masksOf(T.q, T.r, kindAt);
      if (m.mask | m.voidMask) s.edge.push({ ex: e.x, ey: e.y, mask: m.mask, voidMask: m.voidMask });
      for (let d = 0; d < 6; d++) s.touch.add(keyOf(T.q + MAP.DIRS[d][0], T.r + MAP.DIRS[d][1]));
    });
    s.ver++;
  }

  // ==================================================================================================================
  // drawing (screen.draw). Everything below paints in stage px; ART.map does the pretty parts and a plain fallback stands in for any piece
  // that is missing or throws, so the page always shows something and always works.
  // ==================================================================================================================
  const AM = () => (typeof ART !== 'undefined' && ART && ART.map ? ART.map : null);
  const amHas = (name) => { const a = AM(); return !!a && isFn(a[name]); };
  function guard(s, label, fn) {
    if (s.artBad[label]) return false;
    try { fn(); return true; } catch (e) { s.artBad[label] = true; warnOnce('ART.map ' + label, e); return false; }
  }

  const FALLBACK = { fog: '#efe3c4', edge: '#dccca0', known: '#ddcba0', block: '#2a1f44', painted: '#cfdcaa', hover: 'rgba(255,233,168,0.4)', target: 'rgba(255,126,182,0.35)', path: 'rgba(255,184,64,0.35)' };
  const TILE_COL = { start: '#f6cf7c', enemy: '#e8605a', elite: '#a3204c', boss: '#2c1c58', chest: '#f2bc45', shop: '#e9a13a', camp: '#ff8a55', event: '#9b6be4', well: '#4aa4ee', brush: '#2fbdb5', gemcache: '#4bcf78', forge: '#c9452b' };

  function hexPath(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (60 * i - 30) * Math.PI / 180;
      const px = x + Math.cos(a) * size, py = y + Math.sin(a) * size;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function fallbackHex(ctx, kind, x, y, size, tile) {
    hexPath(ctx, x, y, size * 0.97);
    ctx.fillStyle = kind === 'painted' ? (TILE_COL[tile] || FALLBACK.painted) : (FALLBACK[kind] || FALLBACK.fog);
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(20,15,46,0.55)'; ctx.stroke();
  }

  const HOPT = { tile: 'empty', seed: 0, done: false, t: 0, near: false };
  function drawHex(s, ctx, kind, x, y, size, tile, seed, done, t, near) {
    if (amHas('hex') && !s.artBad.hex) {
      HOPT.tile = tile || 'empty'; HOPT.seed = seed || 0; HOPT.done = !!done; HOPT.t = t; HOPT.near = !!near;
      try { ART.map.hex(ctx, kind, x, y, size, HOPT); return; } catch (e) { s.artBad.hex = true; warnOnce('ART.map.hex', e); }
    }
    fallbackHex(ctx, kind, x, y, size, tile);
  }

  function heroIds(s) {
    const hs = s.R.heroes.map((h) => h.id);
    const lead = s.R.frontIdx | 0;
    return lead > 0 && lead < hs.length ? [hs[lead]].concat(hs.filter((_, i) => i !== lead)) : hs;
  }

  function drawToken(s, ctx, x, y, size, t) {
    if (amHas('token') && !s.artBad.token && guard(s, 'token', () => ART.map.token(ctx, heroIds(s), x, y, t, s.tok.moving, { size, dir: s.tok.dir }))) return;
    heroIds(s).forEach((id, i) => {
      ctx.beginPath(); ctx.arc(x + (i ? -14 : 8) * size / HEX, y + 6, 12 * size / HEX, 0, Math.PI * 2);
      ctx.fillStyle = (DATA.heroes[id] && DATA.heroes[id].color) || '#a9c4ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#140f2e'; ctx.stroke();
    });
  }

  function ringHex(ctx, x, y, size, color, width, dash, off) {
    hexPath(ctx, x, y, size * 0.98);
    ctx.lineJoin = 'round';
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = off || 0; }
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  // the foreboding of the boss hex: a dark halo that breathes, a vermilion ring, ink motes rising off the page
  function drawBossGlow(s, ctx, sx, sy, size, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6), mo = (ART && ART.tk && isFn(ART.tk.motion)) ? ART.tk.motion() : 1;
    guard(s, 'bossglow', () => {
      ART.tk.glow(ctx, sx, sy, size * (2.9 + 0.4 * pulse * mo), '#1c0f3c', 0.6 + 0.14 * pulse, false);
      ART.tk.glow(ctx, sx, sy, size * (1.15 + 0.2 * pulse * mo), '#e8383d', 0.16 + 0.1 * pulse, false);
    });
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.35 * pulse;
    ringHex(ctx, sx, sy, size * (1.12 + 0.05 * pulse * mo), '#b0245c', Math.max(1.5, size * 0.05), [size * 0.3, size * 0.16], -t * size * 0.2 * mo);
    ctx.restore();
    if (!lowQ()) {                                                // slow tendrils of ink reaching out from the hex
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9 + t * 0.1 * mo + Math.sin(t * 0.5 + i) * 0.1 * mo, len = size * (1.9 + 0.5 * Math.sin(t * 0.9 + i * 1.7) * mo);
        const x0 = sx + Math.cos(a) * size * 1.0, y0 = sy + Math.sin(a) * size * 1.0, x1 = sx + Math.cos(a + 0.35) * len, y1 = sy + Math.sin(a + 0.35) * len;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(sx + Math.cos(a - 0.25) * len * 0.62, sy + Math.sin(a - 0.25) * len * 0.62, x1, y1);
        ctx.lineWidth = Math.max(1.2, size * 0.075); ctx.strokeStyle = 'rgba(28,15,60,' + (0.34 + 0.14 * pulse).toFixed(3) + ')'; ctx.stroke();
      }
      ctx.restore();
    }
    if (mo >= 1 && !lowQ()) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.22 + i * 0.25) % 1, a = Math.sin(Math.PI * ph);
        ctx.beginPath(); ctx.arc(sx + Math.sin(t * 0.8 + i * 2.1) * size * 0.5, sy + size * 0.5 - ph * size * 1.8, Math.max(1, size * 0.07 * (1 - ph * 0.5)), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(28,15,60,' + (0.55 * a).toFixed(3) + ')'; ctx.fill();
      }
    }
  }

  const PETAL_COLS = ['#ffc2dc', '#ff9cc6', '#ffd8e8'];
  function initPetals(s) {
    const r = U.rng(U.hash(s.R.seed, 'mappetals', s.R.chapter));
    for (let i = 0; i < 9; i++) s.petals.push({ x: 40 + r() * 1200, y: 20 + r() * 680, vx: -14 - r() * 12, vy: 16 + r() * 16, rot: r() * 6.28, vr: (r() - 0.5) * 1.6, size: 5 + r() * 4, ph: r() * 6.28, col: PETAL_COLS[i % 3] });
  }
  function stepPetals(s, dt) {
    s.petals.forEach((p) => {
      p.x += (p.vx + Math.sin(s.t * 0.7 + p.ph) * 14) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > 740) { p.y = -20; p.x = 100 + ((p.x * 7.3 + 311) % 1180); }
      if (p.x < -30) p.x = 1310;
    });
  }
  function drawPetals(s, ctx) {
    if (reduced() || lowQ() || !ART || !ART.tk || !isFn(ART.tk.petal)) return;
    guard(s, 'petals', () => s.petals.forEach((p) => ART.tk.petal(ctx, p.x, p.y, p.size, p.rot, 0.55, p.col)));
  }

  // the short-lived effects: ART.fx pieces keyed by name (inkSplash, ring, sparkle), anchored to a world point
  function addFx(s, name, wx, wy, dur, o) {
    if (headless() || (reduced() && name !== 'ring')) return;
    s.parts.push(Object.assign({ name, wx, wy, t0: s.t, dur, seed: U.hash(Math.round(wx), Math.round(wy), s.parts.length), sc: 1 }, o || {}));
    if (s.parts.length > 60) s.parts.shift();
  }
  function drawParts(s, ctx) {
    if (!s.parts.length || !ART || !ART.fx) return;
    const c = s.cam;
    s.parts = s.parts.filter((p) => s.t - p.t0 < p.dur);
    s.parts.forEach((p) => {
      const fn = ART.fx[p.name];
      if (!isFn(fn)) return;
      const e = (s.t - p.t0) / p.dur;
      if (e < 0.03) return;                                       // some effects divide by the progress near zero
      guard(s, 'fx' + p.name, () => fn(ctx, { x: wx2sx(c, p.wx), y: wy2sy(c, p.wy), s: p.sc * c.z, seed: p.seed, color: p.color }, clamp(e, 0, 1)));
    });
  }

  // an arrow chevron beside the anchor of a directional brush: the chosen direction is bigger and gold, the others wait as white arrows
  function drawHandles(s, ctx, sx, sy, size, t) {
    const b = s.brush;
    for (let d = 0; d < 6; d++) {
      const a = -[0, 60, 120, 180, 240, 300][d] * Math.PI / 180;           // directions run counter-clockwise on screen, y grows downward
      const dist = size * SQ3 * 0.86;
      const hx = sx + Math.cos(a) * dist, hy = sy + Math.sin(a) * dist, on = d === b.dir;
      const k = Math.max(0.8, size / HEX) * (on ? 1.75 : 1.3);
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-8 * k, -9 * k); ctx.lineTo(9 * k, 0); ctx.lineTo(-8 * k, 9 * k); ctx.lineTo(-3 * k, 0); ctx.closePath();
      ctx.shadowColor = on ? 'rgba(245,201,106,0.9)' : 'rgba(255,255,255,0.7)'; ctx.shadowBlur = on ? 12 : 6;
      ctx.globalAlpha = on ? 1 : 0.8 + 0.12 * Math.sin(t * 3 + d);
      ctx.fillStyle = on ? '#f5c96a' : '#fffaf0'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.4 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = '#140f2e'; ctx.stroke();
      ctx.restore();
    }
  }

  function drawPops(s, ctx, size) {
    if (!s.pops.length) return;
    const c = s.cam;
    s.pops = s.pops.filter((p) => s.t - p.t0 < POP_S);
    s.pops.forEach((p) => {
      const e = clamp((s.t - p.t0) / POP_S, 0, 1), sx = wx2sx(c, p.wx), sy = wy2sy(c, p.wy);
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - e);
      ringHex(ctx, sx, sy, size * (0.9 + 0.5 * U.ease.outCubic(e)), p.color || '#fff6dc', Math.max(2, size * 0.09) * (1 - e * 0.6));
      ctx.restore();
      if (ART && ART.icon && isFn(ART.icon.draw) && p.tile && !s.artBad.pop) {
        const sc = 1 + 0.45 * Math.sin(Math.PI * Math.min(1, e * 1.4));
        guard(s, 'pop', () => { ctx.save(); ctx.globalAlpha = 0.9 * (1 - e * e); ART.icon.draw(ctx, 'tile', p.tile, sx, sy, size * 0.95 * sc, { glow: true }); ctx.restore(); });
      }
    });
  }

  // the melody made visible: each wake note rises from its hex as a small note and fades (static under reduced motion)
  function drawNoteMarks(s, ctx, size) {
    if (!s.noteMarks || !s.noteMarks.length) return;
    s.noteMarks = s.noteMarks.filter((m) => s.t - m.t0 < 1.2);
    const c = s.cam, calm = reduced();
    s.noteMarks.forEach((m) => {
      const age = s.t - m.t0, sx = wx2sx(c, m.wx), top = size * (0.55 + 0.06 * (Math.max(-4, Math.min(12, m.deg)) + 4));
      const sy = wy2sy(c, m.wy) - (calm ? top : top * U.ease.outCubic(clamp(age / 0.6, 0, 1)));
      const a = (m.soft ? 0.5 : 1) * (1 - clamp(age / 1.2, 0, 1));
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      const drawn = ART && ART.tk && isFn(ART.tk.note) && !s.artBad.note && guard(s, 'note', () => { ART.tk.note(ctx, sx, sy, size * 0.42, { kind: 'quarter', color: '#fff6dc', outline: '#140f2e', alpha: 1 }); return true; });
      if (!drawn) {
        const rw = size * 0.14, rh = size * 0.1;
        ctx.fillStyle = '#fff6dc'; ctx.strokeStyle = '#140f2e'; ctx.lineWidth = Math.max(1.5, size * 0.04);
        ctx.beginPath(); ctx.ellipse(sx, sy, rw, rh, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + rw * 0.9, sy - rh * 0.2); ctx.lineTo(sx + rw * 0.9, sy - size * 0.42); ctx.lineTo(sx + rw * 2, sy - size * 0.3); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawWorld(s, ctx, t) {
    const c = s.cam, z = c.z, size = HEX * z, w = s.win;
    // the paper
    if (!(amHas('paper') && guard(s, 'paper', () => ART.map.paper(ctx, 1280, 720, c.x, c.y, z, { t })))) {
      ctx.fillStyle = '#f3e6c8'; ctx.fillRect(0, 0, 1280, 720);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
    // the hexes, back to front, culled to the window
    const m = size * 1.3, ax = w.x - m, bx = w.x + w.w + m, ay = w.y - m, by = w.y + w.h + m;
    let boss = null;
    const tiles = s.tiles;
    // the awake signal: woken, not-done hexes within 3 of the party move (at most the 19 nearest)
    const nearSet = new Set();
    if (s.M && s.M.pos) {
      const cand = [];
      for (let i = 0; i < tiles.length; i++) {
        const T0 = tiles[i].T;
        if (!T0.painted || T0.done) continue;
        const d = MAP.dist(s.M.pos.q, s.M.pos.r, T0.q, T0.r);
        if (d <= 3) cand.push([d, tiles[i].k]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < cand.length && i < 19; i++) nearSet.add(cand[i][1]);
    }
    for (let i = 0; i < tiles.length; i++) {
      const e = tiles[i], sx = wx2sx(c, e.x), sy = wy2sy(c, e.y);
      if (sx < ax || sx > bx || sy < ay || sy > by) continue;
      const T = e.T, rv = s.reveals.get(e.k);
      if (rv) {
        drawHex(s, ctx, s.touch.has(e.k) ? 'edge' : 'fog', sx, sy, size, null, e.seed, false, t);
        const p = (s.t - rv.t0) / REVEAL_S;
        if (p > 0 && p < 1) {
          const fx = wx2sx(c, rv.fx), fy = wy2sy(c, rv.fy);
          if (!(amHas('paintBloom') && !s.artBad.bloom && guard(s, 'bloom', () => ART.map.paintBloom(ctx, sx, sy, size, Math.min(p, 0.999), { tile: T.type, seed: e.seed, fromX: fx, fromY: fy, note: rv.note | 0 })))) {
            ctx.save(); ctx.globalAlpha = p; fallbackHex(ctx, 'painted', sx, sy, size * (0.4 + 0.6 * p), T.type); ctx.restore();
          }
        }
        continue;
      }
      if (T.painted) { drawHex(s, ctx, 'painted', sx, sy, size, T.type, e.seed, T.done, t, nearSet.has(e.k)); if (T.type === 'boss' && !T.done) boss = { sx, sy }; continue; }
      if (T.type === 'block') { drawHex(s, ctx, s.touch.has(e.k) ? 'block' : 'fog', sx, sy, size, null, e.seed, false, t); continue; }
      if (T.known) { drawHex(s, ctx, 'known', sx, sy, size, T.type, e.seed, false, t); if (T.type === 'boss') boss = { sx, sy }; continue; }
      drawHex(s, ctx, s.touch.has(e.k) ? 'edge' : 'fog', sx, sy, size, null, e.seed, false, t);
    }
    // the soft rim where painted ground meets blank paper or Void
    if (s.edge.length && amHas('fogEdge')) {
      const cells = s.edgeDraw || (s.edgeDraw = []);
      let n = 0;
      for (let i = 0; i < s.edge.length; i++) {
        const ed = s.edge[i], sx = wx2sx(c, ed.ex), sy = wy2sy(c, ed.ey);
        if (sx < ax || sx > bx || sy < ay || sy > by) continue;
        const o = s.edgePool[n] || (s.edgePool[n] = { x: 0, y: 0, mask: 0, voidMask: 0 });
        o.x = sx; o.y = sy; o.mask = ed.mask; o.voidMask = ed.voidMask;
        cells[n++] = o;
      }
      cells.length = n;
      guard(s, 'fogEdge', () => ART.map.fogEdge(ctx, cells, size, t));
    }
    if (boss) drawBossGlow(s, ctx, boss.sx, boss.sy, size, t);
    drawOverlays(s, ctx, size, t);
    // the party
    const tx = wx2sx(c, s.tok.x), ty = wy2sy(c, s.tok.y);
    drawToken(s, ctx, tx, ty, size, t);
    drawPops(s, ctx, size);
    drawNoteMarks(s, ctx, size);
    drawParts(s, ctx);
    ctx.restore();
    drawPetals(s, ctx);
    if (!(amHas('frame') && guard(s, 'frame', () => ART.map.frame(ctx, 1280, 720, t)))) {
      ctx.lineWidth = 36; ctx.strokeStyle = '#2c1734'; ctx.strokeRect(0, 0, 1280, 720);
    }
  }

  // hover, cursor, chain, walk preview, brush anchors and preview
  function drawOverlays(s, ctx, size, t) {
    const c = s.cam, M = s.M;
    const scr = (q, r) => { const p = worldOf(q, r); return { x: wx2sx(c, p.x), y: wy2sy(c, p.y) }; };
    const onScreen = (p) => p.x > s.win.x - size && p.x < s.win.x + s.win.w + size && p.y > s.win.y - size && p.y < s.win.y + s.win.h + size;
    // legal brush anchors
    if (s.brush && s.brush.anchors) {
      const b = s.brush, pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      b.anchors.forEach((a) => {
        const p = scr(a.q, a.r);
        if (!onScreen(p)) return;
        const locked = b.anchor && b.anchor.q === a.q && b.anchor.r === a.r;
        if (locked) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * (0.15 + 0.04 * pulse), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(47,189,181,' + (b.anchor ? 0.18 : 0.42 + 0.2 * pulse).toFixed(3) + ')'; ctx.fill();
        ctx.lineWidth = Math.max(1.4, size * 0.04); ctx.strokeStyle = 'rgba(12,80,88,' + (b.anchor ? 0.25 : 0.8).toFixed(3) + ')'; ctx.stroke();
      });
    }
    // the chosen chain of a far paint
    if (s.chain && s.chain.path.length) {
      const ch = s.chain;
      guard(s, 'chain', () => {
        ch.path.forEach((cell, i) => { const p = scr(cell[0], cell[1]); if (i < ch.path.length - 1 && onScreen(p)) drawHex(s, ctx, 'path', p.x, p.y, size, null, 0, false, t); });
        const last = ch.path[ch.path.length - 1], lp = scr(last[0], last[1]);
        drawHex(s, ctx, 'target', lp.x, lp.y, size, null, 0, false, t);
        const pts = (ch.from ? [scr(ch.from.q, ch.from.r)] : []).concat(ch.path.map((cell) => scr(cell[0], cell[1])));
        if (amHas('route')) ART.map.route(ctx, pts, t, { size, cost: ch.cost, affordable: ch.affordable });
      });
    }
    // where a walk would go
    if (s.hoverPath && s.hoverPath.length && !s.walk && !s.brush) {
      guard(s, 'walkpreview', () => {
        const pts = [scr(M.pos.q, M.pos.r)].concat(s.hoverPath.map((cell) => scr(cell[0], cell[1])));
        if (amHas('route')) ART.map.route(ctx, pts, t, { size, pill: false, alpha: 0.75, affordable: true });
      });
    }
    // the hovered or cursor hex
    const fh = focusHex(s);
    if (fh && !s.walk) {
      const T = tileAt(M, fh.q, fh.r);
      if (T && T.type !== 'block' && !(s.brush && !s.brush.anchor)) {
        const p = scr(fh.q, fh.r);
        if (onScreen(p)) {
          drawHex(s, ctx, 'hover', p.x, p.y, size, null, 0, false, t);
          // one hex of fog next to the page: the pill with its price
          if (!T.painted && !s.chain && !s.brush && MAP.canPaint(M, fh.q, fh.r).ok && amHas('route')) {
            guard(s, 'pill', () => ART.map.route(ctx, [p], t, { size, cost: DATA.ECONOMY.paintCost, affordable: s.R.ink >= DATA.ECONOMY.paintCost }));
          }
        }
      }
    }
    // the brush
    if (s.brush) {
      const b = s.brush;
      if (b.anchor) {
        const p = scr(b.anchor.q, b.anchor.r);
        drawHex(s, ctx, 'target', p.x, p.y, size, null, 0, false, t);
        if (b.dirKind) drawHandles(s, ctx, p.x, p.y, size, t);
      }
      if (b.preview && b.preview.length) {
        const centers = b.preview.map((cell) => scr(cell[0], cell[1]));
        if (amHas('brushPreview')) guard(s, 'brushpreview', () => ART.map.brushPreview(ctx, centers, size, b.valid, t));
        else centers.forEach((p) => { ctx.save(); ctx.globalAlpha = 0.45; fallbackHex(ctx, 'path', p.x, p.y, size); ctx.restore(); });
      }
    }
    // the keyboard cursor
    if (s.cursor && s.mode === 'key') {
      const p = scr(s.cursor.q, s.cursor.r);
      if (onScreen(p)) { ringHex(ctx, p.x, p.y, size * 1.02, 'rgba(20,15,46,0.9)', Math.max(3, size * 0.1)); ringHex(ctx, p.x, p.y, size * 1.02, '#f5c96a', Math.max(2, size * 0.06), [size * 0.28, size * 0.14], -t * size * 0.3); }
    }
  }

  function focusHex(s) { return s.mode === 'key' ? s.cursor : s.hover; }

  // ==================================================================================================================
  // the HUD: DOM over the canvas
  // ==================================================================================================================
  function tipNode(title, kindLabel, text, extra) {
    const head = mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: title }));
    if (kindLabel) head.appendChild(mk('span', { class: 'tk-kind k-keyword', text: kindLabel }));
    const n = mk('div', { class: 'tk' }, head, mk('p', { class: 'tk-text', text: text || '' }));
    if (extra) n.appendChild(mk('p', { class: 'tk-text tk-extra', text: extra }));
    return n;
  }

  // ---- the Ink meter: a row of drops that fill with a pour and spill with a drip
  function makeInk(s) {
    const row = mk('span', { class: 'mp-drops', 'aria-hidden': 'true' });
    const num = mk('b', { class: 'mp-ink-n' });
    const root = mk('div', { class: 'mp-ink', role: 'img', tabindex: '0' }, UI.icon('stat', 'ink', 34, {}, 'mp-ink-ico'), mk('div', { class: 'mp-ink-body' }, mk('span', { class: 'mp-ink-l', text: 'Vox' }), row), num);
    tut(root, 'ink');
    const m = { root, row, num, drops: [], shown: -1, max: -1, disp: 0 };
    m.build = (max) => {
      clearKids(row); m.drops = [];
      for (let i = 0; i < max; i++) { const d = mk('i', { class: 'mp-drop' }); row.appendChild(d); m.drops.push(d); }
      m.max = max; m.shown = -1;
    };
    m.set = (n, max, animate) => {
      max = Math.max(1, max | 0); n = clamp(n | 0, 0, max);
      if (max !== m.max) { m.build(max); if (m.onbuild) m.onbuild(); }
      const old = m.shown < 0 ? n : m.shown;
      const anim = animate && !headless() && !reduced() && old !== n;
      m.drops.forEach((d, i) => {
        d.classList.toggle('full', i < n);
        d.classList.remove('gain', 'spend');
        if (anim && n > old && i >= old && i < n) { UI.vars(d, { '--d': ((i - old) * 70) + 'ms' }); void d.offsetWidth; d.classList.add('gain'); }
        else if (anim && n < old && i >= n && i < old) { UI.vars(d, { '--d': ((old - 1 - i) * 55) + 'ms' }); void d.offsetWidth; d.classList.add('spend'); }
      });
      if (anim) UI.after(900 + Math.abs(n - old) * 70, () => m.drops.forEach((d) => d.classList.remove('gain', 'spend')));
      const from = m.disp;
      m.disp = n; m.shown = n;
      const proxy = { n: from };
      if (old !== n && !reduced()) { UI.tween(proxy, { n }, 520, 'outCubic', () => { num.textContent = Math.round(proxy.n) + '/' + max; }); } else num.textContent = n + '/' + max;
      if (headless()) num.textContent = n + '/' + max;
      root.setAttribute('aria-label', 'Vox ' + n + ' of ' + max);
      if (old !== n) UI.pulse(root);
    };
    UI.tip.attach(root, () => tipNode('Vox', 'Resource', 'Spend ' + DATA.ECONOMY.paintCost + ' Vox to unmute a hex next to live ground. Tea stalls, won fights, green rooms and kind passers-by refill it.'), { side: 'bottom' });
    return m;
  }

  // ---- the brush tray: one chip per brush kind
  function brushCounts(R) {
    const counts = {}, order = [];
    R.brushes.forEach((id) => { if (!counts[id]) { counts[id] = 0; order.push(id); } counts[id]++; });
    return { counts, order };
  }

  function renderTray(s) {
    const H = s.hud, R = s.R;
    clearKids(H.chips);
    H.chipEls = {};
    const bc = brushCounts(R);
    bc.order.forEach((id, i) => {
      const d = brushDef(id), n = bc.counts[id];
      const chip = mk('button', { type: 'button', class: 'mp-chip' + (s.brush && s.brush.id === id ? ' on' : ''), 'aria-pressed': s.brush && s.brush.id === id ? 'true' : 'false', 'aria-label': d.name + (n > 1 ? ', ' + n + ' left' : ', one use') + '. ' + d.text, dataset: { id } },
        UI.icon('brush', id, 40, {}, 'mp-chip-ico'), mk('span', { class: 'mp-chip-n', text: d.name }), n > 1 ? mk('i', { class: 'mp-chip-c', text: 'x' + n }) : null, i < 9 ? mk('kbd', { class: 'mp-chip-k', 'aria-hidden': 'true', text: String(i + 1) }) : null);
      chip.addEventListener('click', () => toggleBrush(s, id));
      UI.tip.attach(chip, () => tipNode(d.name, 'Spell', d.text, n > 1 ? 'You hold ' + n + '.' : 'Cast once, then it is gone.'), { side: 'top' });
      H.chips.appendChild(chip); H.chipEls[id] = chip;
    });
    if (!bc.order.length) H.chips.appendChild(mk('span', { class: 'mp-tray-empty', text: 'No Spells. Buskers and rivals teach them.' }));
    H.tray.classList.toggle('empty', !bc.order.length);
    s.last.brushes = R.brushes.join(',');
    s.hudDirty = true;
  }

  // ---- the treasure strip
  const RELIC_SHOWN = 6;
  // On a phone every icon is a 44 px touch target and the brush tray (centred, one chip per brush kind) leaves less room on the left: fewer icons, and the "+N" chip
  // carries the rest to the full list, so the strip never slides under the tray.
  // On a desktop the strip is six icons wide (x 14 to 394 with its "+N") and a tray holding all six brush kinds starts at x 372: five icons then (L2).
  function relicShown(R) {
    const st = document.getElementById('stage');
    const six = brushCounts(R).order.length >= 6;
    if (!st || !st.classList.contains('compact')) return six ? RELIC_SHOWN - 1 : RELIC_SHOWN;
    return six ? 2 : 3;
  }
  const relicKey = (R) => R.relics.join(',') + '|' + relicShown(R);
  function renderRelics(s) {
    const H = s.hud, R = s.R;
    clearKids(H.relics);
    const open = () => UI.overlay.open('relics', {});
    const shown = relicShown(R);
    R.relics.slice(-shown).forEach((id) => H.relics.appendChild(UI.relic(id, { size: 'sm', onclick: open, side: 'top' })));
    if (R.relics.length > shown) H.relics.appendChild(mk('button', { type: 'button', class: 'mp-relic-more', 'aria-label': (R.relics.length - shown) + ' more charms', text: '+' + (R.relics.length - shown), onclick: open }));
    if (!R.relics.length) H.relics.appendChild(mk('button', { type: 'button', class: 'mp-relic-none', 'aria-label': 'Charms: none yet', onclick: open }, UI.icon('relic', 'lantern', 24, { dim: true }, 'mp-relic-none-ico'), mk('span', { text: 'Charms' })));
    H.relics.classList.toggle('empty', !R.relics.length);
    s.last.relics = relicKey(R);
    s.hudDirty = true;
  }

  function tool(label, glyph, onclick, tip, key) {
    const b = mk('button', { type: 'button', class: 'mp-tool mp-t-' + glyph, 'aria-label': label, dataset: { sfx: 'ui_click' } }, mk('i', { class: 'mp-glyph', 'aria-hidden': 'true' }), mk('span', { class: 'mp-tool-l', text: label }));
    b.addEventListener('click', (e) => onclick(e, b));
    UI.tip.attach(b, () => tipNode(label, key ? 'Key ' + key : '', tip), { side: 'left' });
    return b;
  }

  function buildHud(s, root) {
    const R = s.R, H = s.hud;
    const hud = mk('div', { class: 'mp-hud' });
    // party and Ink
    H.badges = R.heroes.map((h) => UI.heroBadge(h.id, { size: 'sm', hp: h.hp, maxHp: h.maxHp, class: 'mp-hero' }));
    H.party = mk('div', { class: 'mp-party' }, ...H.badges);
    H.inkMeter = makeInk(s);
    H.inkMeter.onbuild = () => { s.hudDirty = true; };
    // banner: chapter, title written with a brush, and how much of the page is painted
    H.chapterN = mk('span', { class: 'mp-ch', text: 'Act ' + U.roman(R.chapter || 1) });
    H.title = mk('h1', { class: 'mp-title', text: chapterTitle(R.chapter || 1) });
    H.progFill = mk('i', { class: 'mp-prog-fill' });
    H.progText = mk('span', { class: 'mp-prog-t' });
    H.prog = mk('div', { class: 'mp-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Live ground' }, H.progFill, H.progText);
    H.banner = mk('div', { class: 'mp-banner' }, H.chapterN, H.title, H.prog);
    // gold
    H.gold = UI.stat('gold', R.gold, { size: 'md', class: 'mp-gold' });
    // tools
    H.deckN = UI.hanko(String(R.deck.length), { size: 'sm', class: 'mp-deck-n' });
    H.deckBtn = tool('Deck', 'deck', () => UI.overlay.open('deck', { mode: 'view' }), 'Look through every card of your deck.', 'Shift D');
    H.deckBtn.appendChild(H.deckN);
    tut(H.deckBtn, 'deck');
    H.legendBtn = tool('Legend', 'legend', () => UI.overlay.open('legend', {}), 'What every hex, Spell and control means.', 'L');
    H.fitBtn = tool('Fit', 'fit', () => toggleFit(s), 'See the whole map, or go back to following the party.', 'F');
    H.zoomIn = tool('Zoom in', 'zin', () => zoomStep(s, 1.3), 'Zoom in. The wheel and two fingers work too.', '+');
    H.zoomOut = tool('Zoom out', 'zout', () => zoomStep(s, 1 / 1.3), 'Zoom out.', '-');
    H.tools = mk('div', { class: 'mp-tools' }, H.deckBtn, H.legendBtn, H.fitBtn, H.zoomIn, H.zoomOut);
    // treasures and brushes
    H.relics = mk('div', { class: 'mp-relics' });
    tut(H.relics, 'relics');
    H.chips = mk('div', { class: 'mp-chips' });
    H.tray = mk('div', { class: 'mp-tray' }, mk('span', { class: 'mp-tray-l', text: 'Spells' }), H.chips);
    tut(H.tray, 'brushes');
    // what is under the pointer
    H.infoIco = mk('span', { class: 'mp-info-ico', 'aria-hidden': 'true' });
    H.infoName = mk('b', { class: 'mp-info-name' });
    H.infoText = mk('p', { class: 'mp-info-text' });
    H.infoAct = mk('p', { class: 'mp-info-act' });
    H.info = mk('div', { class: 'mp-info', 'aria-hidden': 'true' }, H.infoIco, mk('div', { class: 'mp-info-txt' }, H.infoName, H.infoText, H.infoAct));
    // brush mode bar
    H.modeName = mk('b', { class: 'mp-mode-name' });
    H.modeText = mk('span', { class: 'mp-mode-text' });
    H.modeIco = mk('span', { class: 'mp-mode-ico', 'aria-hidden': 'true' });
    H.apply = UI.btn('Cast', { kind: 'primary', size: 'sm', onclick: () => applyBrushNow(s), sfx: 'ui_click' });
    H.cancel = UI.btn('Cancel', { kind: 'ghost', size: 'sm', onclick: () => exitBrush(s, true), sfx: 'ui_back' });
    H.mode = mk('div', { class: 'mp-mode', hidden: true, role: 'group', 'aria-label': 'Spell mode' }, H.modeIco, mk('p', { class: 'mp-mode-txt' }, H.modeName, ' ', H.modeText), H.apply, H.cancel);
    // the box the tutorial points at, and the layer the flying drops live in
    H.hexAnchor = tut(mk('div', { class: 'mp-hexanchor', 'aria-hidden': 'true' }), 'hex');
    H.fly = mk('div', { class: 'mp-fly-layer', 'aria-hidden': 'true' });
    hud.append(H.party, H.inkMeter.root, H.banner, H.gold, H.tools, H.relics, H.tray, H.info, H.mode, H.hexAnchor, H.fly);
    root.appendChild(hud);
    H.menu = UI.menuButton();
    root.appendChild(H.menu);
    H.root = hud;
    renderTray(s); renderRelics(s);
    s.last.deck = R.deck.length;
    H.inkMeter.set(R.ink, R.inkMax, false); s.last.ink = R.ink; s.last.inkMax = R.inkMax;
    s.last.gold = R.gold;
    R.heroes.forEach((h, i) => { s.last['hp' + i] = h.hp + '/' + h.maxHp; });
    paintProgress(s, false);
  }

  function paintProgress(s, animate) {
    const H = s.hud, p = MAP.progress(s.M);
    s.last.prog = p.painted;
    const pct = clamp(p.pct, 0, 100);
    H.progFill.style.width = pct + '%';
    H.progText.textContent = pct + '% live';
    H.prog.setAttribute('aria-valuenow', String(pct));
    H.prog.setAttribute('aria-valuetext', p.painted + ' of ' + p.total + ' hexes live');
    safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.awake)) AUDIO.awake(p.frac); });
    if (animate) UI.pulse(H.prog);
  }

  // poll the run once a frame: cheap comparisons, DOM writes only on change (a relic, a deck change, an event or the mercy rule can all move these)
  function syncHud(s, animate) {
    const R = s.R, H = s.hud, L = s.last;
    if (!H.inkMeter) return;
    if (L.ink !== R.ink || L.inkMax !== R.inkMax) { H.inkMeter.set(R.ink, R.inkMax, animate !== false); L.ink = R.ink; L.inkMax = R.inkMax; }
    if (L.gold !== R.gold) { H.gold.rbSet(R.gold, { animate: true }); L.gold = R.gold; s.hudDirty = true; }
    R.heroes.forEach((h, i) => {
      const k = h.hp + '/' + h.maxHp;
      if (L['hp' + i] !== k) { H.badges[i].rbSet({ hp: h.hp, maxHp: h.maxHp }); L['hp' + i] = k; }
    });
    if (L.brushes !== R.brushes.join(',')) {
      renderTray(s);
      if (s.brush && !R.brushes.some((id) => id === s.brush.id)) exitBrush(s, false);
    }
    if (L.relics !== relicKey(R)) renderRelics(s);
    if (L.deck !== R.deck.length) { H.deckN.textContent = String(R.deck.length); L.deck = R.deck.length; }
    const p = MAP.progress(s.M);
    if (L.prog !== p.painted) paintProgress(s, true);
  }

  // ---- the hex info chip
  // The chip and the mode bar are a fixed size (two clamped lines of text, two of action), so a sentence that has to stay readable comes in shorter versions for the
  // places that have less room: tier 0 the normal layout, 1 a larger text size, 2 a phone (its chip is narrower, at any text size). say(full, short, shortest) picks one.
  const copyTier = () => (isCompact() ? 2 : (UI.opt && UI.opt.textScale > 1.01) ? 1 : 0);
  const say = (...v) => v[Math.min(copyTier(), v.length - 1)];

  function foesOf(T) {
    const g = T.content && T.content.enc ? safe(() => DATA.groupById(T.content.enc), null) : null;
    if (!g || !g.enemies) return '';
    const names = g.enemies.map((id) => (DATA.enemies[id] && DATA.enemies[id].name) || id);
    return 'Foes: ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' and more' : '');
  }
  function contentLine(T) {
    const c = T.content || {};
    switch (T.type) {
      case 'enemy': case 'elite': return foesOf(T);
      case 'brush': return c.id && c.id !== 'random' && DATA.brushes[c.id] ? 'Teaches ' + DATA.brushes[c.id].name + '.' : '';
      case 'well': return 'A warm tea worth ' + (c.ink || DATA.ECONOMY.wellInk) + ' Vox.';
      case 'chest': return c.relic ? 'Holds a charm and gold.' : 'Holds gems and gold.';
      default: return '';
    }
  }

  function describeHex(s, q, r) {
    const T = tileAt(s.M, q, r);
    if (!T) return null;
    const M = s.M, R = s.R, cost = DATA.ECONOMY.paintCost;
    const o = { q, r, tile: null, name: '', text: '', action: '', tone: '' };
    if (T.type === 'block') {
      const ti = tileInfo('block');
      Object.assign(o, { tile: 'block', name: ti.name, text: ti.text, action: 'Nothing can cross it.', tone: 'bad' });
      return o;
    }
    if (T.painted) {
      const ti = tileInfo(T.type);
      o.tile = T.type; o.name = ti.name; o.text = contentLine(T) && !T.done ? contentLine(T) : ti.text;
      const here = M.pos.q === q && M.pos.r === r;
      if (here) { o.action = 'The party stands here.'; o.tone = 'info'; }
      else if (T.done && T.type !== 'empty' && T.type !== 'start') { o.action = 'Done. Walk over it freely.'; o.tone = 'info'; }
      else {
        const path = MAP.walkPath(M, q, r);
        if (!path) { o.action = 'No live path leads there.'; o.tone = 'bad'; }
        else if (path.length && (path[path.length - 1][0] !== q || path[path.length - 1][1] !== r)) { const n = U.plural(path.length, 'step'); o.action = say('Walk toward it: ' + n + ', stopping at the first thing in the way.', 'Walk: ' + n + ', stops at the first thing in the way.', 'Walk ' + n + ', stops early.'); o.tone = 'go'; }
        else o.action = (T.type === 'empty' || T.type === 'start' || T.done ? 'Walk there: ' : 'Walk there and begin: ') + U.plural(path.length, 'step') + '.', o.tone = 'go';
      }
      return o;
    }
    if (T.known) { const ti = tileInfo(T.type); o.tile = T.type; o.name = ti.name + (copyTier() === 2 && UI.opt && UI.opt.textScale > 1.01 ? ', spotted' : ', spotted'); o.text = ti.text; }   // a phone at the Larger size has no room for the longer word
    else { o.name = 'Muted ground'; o.text = 'Glossy and quiet. Unmute it to hear what it holds.'; }
    if (MAP.canPaint(M, q, r).ok) {
      o.action = (R.ink >= cost ? 'Tap to unmute: ' : 'Not enough Vox to unmute: ') + cost + ' Vox.';
      o.tone = R.ink >= cost ? 'paint' : 'bad';
    } else {
      const pre = RUN.paintPreview(R, q, r);
      if (pre.ok) { o.action = (pre.affordable ? say('Tap twice to unmute a chain of ', 'Tap twice: a chain of ') : say('Too far for your Vox: a chain of ', 'Too far: a chain of ')) + U.plural(pre.path.length, 'hex', 'hexes') + ' costs ' + pre.cost + '.'; o.tone = pre.affordable ? 'paint' : 'bad'; }
      else { o.action = 'No way to reach it.'; o.tone = 'bad'; }
    }
    return o;
  }

  function showInfo(s, o) {
    const H = s.hud;
    s.info = o;
    H.info.classList.toggle('on', !!o);
    if (!o) { H.info.setAttribute('data-tone', ''); return; }
    H.infoName.textContent = o.name;
    H.infoText.textContent = o.text;
    H.infoAct.textContent = o.action;
    H.info.setAttribute('data-tone', o.tone || '');
    clearKids(H.infoIco);
    if (o.tile) H.infoIco.appendChild(UI.icon('tile', o.tile, 44, {}, 'mp-info-canvas'));
  }

  // the line that stands in for the info chip while nothing is pointed at
  function restingInfo(s) {
    const p = MAP.progress(s.M), R = s.R, c = DATA.ECONOMY.paintCost, can = R.ink >= c;
    const txt = can ? say('Unmute nearby fog for ' + c + ' Vox, or tap live ground to walk.', 'Tap fog to unmute it (' + c + ' Vox), tap live ground to walk.')
      : say('No Vox left. Walk to a tea stall, fight, or cast a Spell.', 'No Vox left. Walk to a tea stall, or cast a Spell.');
    // a phone has no room for the description line, so the primary hint goes in the action line there
    const act = isCompact() ? (can ? 'Tap fog to unmute, ground to walk.' : 'No Vox: walk, or cast a Spell.') : R.brushes.length ? 'Spells: ' + R.brushes.length + ' ready.' : '';
    return { q: -1, r: -1, tile: null, name: p.painted + ' of ' + p.total + ' hexes live', text: txt, action: act, tone: 'rest' };
  }

  function refreshInfo(s, announce) {
    if (s.empty) return;
    const fh = focusHex(s);
    let o = null;
    if (s.chain) o = describeHex(s, s.chain.q, s.chain.r);
    else if (s.brush) o = brushInfo(s, fh);
    else if (fh) o = describeHex(s, fh.q, fh.r);
    if (!o) o = restingInfo(s);
    const key = o.name + '|' + o.action;
    if (s.infoKey !== key) {
      s.infoKey = key;
      showInfo(s, o);
      if (announce) UI.announce(o.name + '. ' + o.action);
    }
    // the Paint button of the mode bar and the walk preview follow the hover
    if (!s.brush && fh && !s.chain) {
      const T = tileAt(s.M, fh.q, fh.r);
      s.hoverPath = T && T.painted && !(s.M.pos.q === fh.q && s.M.pos.r === fh.r) ? MAP.walkPath(s.M, fh.q, fh.r) : null;
    } else s.hoverPath = null;
  }

  // run the pending info refresh now (input handlers call it, so the chip is right even before the next frame)
  function flushInfo(s) {
    if (!s.infoDirty) return;
    s.infoDirty = false;
    refreshInfo(s, s.announceNext);
    s.announceNext = false;
  }

  // ==================================================================================================================
  // feedback helpers: refusals, mercy, flights of drops, pops
  // ==================================================================================================================
  function refuse(s, text, kind) {
    UI.toast(text, kind || 'warn');
    snd('ui_error');
  }

  function shakeInk(s) { if (s.hud.inkMeter) UI.shake(s.hud.inkMeter.root); }

  // the Book lends a drop when the party is stranded (RUN.checkStranded): compare R.stats.mercy before and after any RUN call that can trigger it
  function checkMercy(s, before) {
    const n = s.R.stats.mercy | 0;
    if (n > before) {
      MEMO.mercy = n;
      UI.toast('A passer-by hums along: 1 Vox.', 'good');
      snd('ink_gain');
      UI.announce('A passer-by hums along: 1 Vox.');
      return true;
    }
    return false;
  }
  const mercyOf = (s) => s.R.stats.mercy | 0;

  function drainPending(s) {
    const R = s.R;
    let n = 0;
    while (R.pending && R.pending.length && n++ < 8) {
      const p = R.pending[0];
      let choice = null;
      if (p.op === 'cardReward') choice = (p.offers && p.offers[0]) || null;
      else if (['removeCard', 'upgradeCard', 'transformCard', 'duplicateCard'].indexOf(p.op) >= 0) choice = R.deck.slice(0, p.n || 1).map((c) => c.uid);
      const res = safe(() => RUN.resolvePending(R, p.id, choice), null);
      if (!res || !res.ok) R.pending.shift();
    }
  }

  // a drop (or any small element) that arcs from a stage point to a HUD element
  function flyTo(s, kind, x0, y0, target, delay, html) {
    if (!target || headless()) return 0;
    const r = stageRect(target);
    const dur = reduced() ? 260 : 760;
    const el = mk('span', { class: 'mp-fly mp-fly-' + kind }, html || mk('i', { class: 'mp-fly-in' }));
    UI.vars(el, { '--x0': Math.round(x0) + 'px', '--y0': Math.round(y0) + 'px', '--dx': Math.round(r.cx - x0) + 'px', '--dy': Math.round(r.cy - y0) + 'px', '--dl': Math.round(delay) + 'ms', '--du': dur + 'ms' });
    s.hud.fly.appendChild(el);
    UI.after(dur + delay + 80, () => { if (el.parentNode) el.parentNode.removeChild(el); });
    return (dur + delay) / 1000;
  }

  function screenOf(s, q, r) {
    const p = worldOf(q, r);
    return { x: wx2sx(s.cam, p.x), y: wy2sy(s.cam, p.y), wx: p.x, wy: p.y };
  }

  function addPop(s, q, r, color, tile) {
    if (headless()) return;
    const p = worldOf(q, r);
    s.pops.push({ wx: p.x, wy: p.y, t0: s.t, color, tile });
  }

  // ==================================================================================================================
  // painting: RUN.paint is all or nothing and instant; the screen then shows the cells blooming one after another
  // ==================================================================================================================
  function paintedNeighbor(s, q, r) {
    for (let d = 0; d < 6; d++) {
      const T = tileAt(s.M, q + MAP.DIRS[d][0], r + MAP.DIRS[d][1]);
      if (T && shown(s, T) && T.type !== 'block') return T;
    }
    return null;
  }

  // tiles: the T objects RUN just painted, in painting order. from: the world point the first drop of ink comes from
  function startReveals(s, tiles, from, gap, song, anchor) {
    if (!tiles.length) return;
    if (headless()) { rebuildVisual(s); s.infoKey = ''; return; }
    const g = gap === undefined ? REVEAL_GAP : gap;
    tiles.forEach((T, i) => {
      const prev = i && g > 0.1 ? tiles[i - 1] : null;
      const f = prev ? worldOf(prev.q, prev.r) : from;
      const rec = { t0: s.t + 0.04 + i * g, fx: f.x, fy: f.y, started: false, T, i, n: tiles.length, song: song || null, aq: anchor ? anchor.q : null, ar: anchor ? anchor.r : null, note: 0 };
      rec.note = noteOf(wakeDeg(s, T.q, T.r, { song: rec.song, i, n: rec.n, aq: rec.aq, ar: rec.ar }));
      s.reveals.set(keyOf(T.q, T.r), rec);
    });
    rebuildVisual(s);
  }

  function stepReveals(s) {
    if (!s.reveals.size) return;
    let finished = false;
    s.reveals.forEach((rv, k) => {
      if (!rv.started && s.t >= rv.t0) {
        rv.started = true;
        const p = worldOf(rv.T.q, rv.T.r);
        wakeNote(s, rv.T.q, rv.T.r, { song: rv.song, i: rv.i, n: rv.n, aq: rv.aq, ar: rv.ar, last: rv.i === rv.n - 1 });
        addFx(s, 'inkSplash', p.x, p.y, 700, { sc: 0.9 });
      }
      if (s.t >= rv.t0 + REVEAL_S) {
        s.reveals.delete(k);
        finished = true;
        const T = rv.T;
        addPop(s, T.q, T.r, '#fff6dc', T.type !== 'empty' ? T.type : null);
        const p = worldOf(T.q, T.r);
        addFx(s, 'sparkle', p.x, p.y, 600, { sc: 0.8 });
        if (T.type !== 'empty' && T.type !== 'start') snd(DATA.LISTS.landmarks.indexOf(T.type) >= 0 ? 'reveal_landmark' : 'ink_splash');
        if (T.type !== 'empty' && T.type !== 'start') UI.announce('Revealed: ' + tileInfo(T.type).name + '.');
      }
    });
    if (finished) { rebuildVisual(s); s.infoKey = ''; s.infoDirty = true; }
  }

  function chainFrom(s, path) {
    const f = paintedNeighbor(s, path[0][0], path[0][1]);
    return f ? { q: f.q, r: f.r } : null;
  }

  const REASON_TEXT = {
    busy: 'Finish what is in front of you first.', done: 'This tour has ended.', get void() { return DATA.tiles.block.name + ' cannot be unmuted.'; }, painted: 'That hex is already live.',
    unreachable: 'No way to reach it through the fog.', off: 'That is off the map.', nomap: 'There is no map.', ink: 'Not enough Vox.', nobrush: 'You do not know that Spell.', nothing: 'That would unmute nothing new.',
    brush: 'That Spell is unknown.', dir: 'Aim the Spell first.', origin: 'This Spell cannot start from here.', far: 'Too far from the live ground.',
  };
  const reasonText = (r) => REASON_TEXT[r] || 'That does not work here.';

  function paintAction(s, q, r) {
    if (s.busy || s.walk) return false;
    const R = s.R;
    const pre = RUN.paintPreview(R, q, r);
    if (!pre.ok) { refuse(s, reasonText(pre.reason)); return false; }
    if (!pre.affordable) {
      shakeInk(s);
      refuse(s, 'That needs ' + pre.cost + ' Vox and you hold ' + R.ink + '.', 'warn');
      return false;
    }
    const from = chainFrom(s, pre.path);
    const fromW = from ? worldOf(from.q, from.r) : worldOf(q, r);
    const mercy0 = mercyOf(s);
    const res = RUN.paint(R, q, r);
    if (!res || !res.ok) { refuse(s, reasonText(res && res.reason)); return false; }
    s.chain = null; s.hoverPath = null;
    snd('paint');
    startReveals(s, res.tiles, fromW);
    const lastT = res.tiles[res.tiles.length - 1];
    if (lastT) { const lw = worldOf(lastT.q, lastT.r); revealOnScreen(s, lw.x, lw.y); }
    s.walkCell = [q, r];                                       // the tutorial's `hex` anchor now points at what was just painted: that is the hex to walk onto
    s.anchorKey = '';
    UI.bus.emit('map:paint', { q, r, cost: res.cost });
    UI.announce('Unmuted ' + U.plural(res.tiles.length, 'hex', 'hexes') + ' for ' + res.cost + ' Vox. ' + R.ink + ' Vox left.');
    drainPending(s);
    syncHud(s, true);
    checkMercy(s, mercy0);
    s.infoKey = ''; s.infoDirty = true;
    return true;
  }

  // ==================================================================================================================
  // brushes
  // ==================================================================================================================
  const ORIGIN_HINT = { painted: () => 'Start from a live hex.', 'hidden-adjacent': () => say('Start from a muted hex beside the live ground.', 'Start beside the live ground.'), 'hidden-near': () => say('Start from a muted hex within 4 hexes of the party.', 'Start within 4 hexes of the party.') };
  const originHint = (can) => (can && can.need && ORIGIN_HINT[can.need] ? ORIGIN_HINT[can.need]() : '');

  function bestDir(s, a) {
    const M = s.M, b = s.brush;
    const toBoss = MAP.dirOf(M, a.q, a.r, M.boss.q, M.boss.r);
    let best = a.dirs[0], bestN = -1, bestAngle = 9;
    a.dirs.forEach((d) => {
      const n = MAP.brushCells(M, b.id, a.q, a.r, d).length;
      const ang = Math.min((d - toBoss + 6) % 6, (toBoss - d + 6) % 6);
      if (n > bestN || (n === bestN && ang < bestAngle)) { best = d; bestN = n; bestAngle = ang; }
    });
    return best;
  }

  function enterBrush(s, id) {
    if (s.empty || s.busy || s.walk) return false;
    const R = s.R;
    if (R.brushes.indexOf(id) < 0) { refuse(s, 'You do not know that Spell.'); return false; }
    const def = brushDef(id);
    const list = safe(() => MAP.brushAnchors(s.M, id), []) || [];
    if (!list.length) { refuse(s, def.name + ' has nowhere to unmute right now.'); return false; }
    s.chain = null; s.hoverPath = null;
    const anchors = new Map();
    list.forEach((a) => anchors.set(keyOf(a.q, a.r), a));
    s.brush = { id, def, kind: def.kind, dirKind: def.kind === 'line' || def.kind === 'fan', anchors, anchor: null, dir: 0, preview: [], valid: false, hoverDir: 0 };
    snd('ui_open');
    paintBrushBar(s);
    updateBrushPreview(s);
    markChips(s);
    s.hud.root.classList.add('brushing');                       // the mode bar takes the chapter banner's slot at the top
    s.hudDirty = true;                                          // and it is part of the HUD footprint while it is up: the fit is solved again (the camera on the fit glides to it)
    refreshInfo(s, true);
    UI.announce(def.name + ' ready. ' + def.text);
    return true;
  }

  function exitBrush(s, announce) {
    if (!s.brush) return;
    s.brush = null;
    s.hud.mode.hidden = true;
    s.hud.root.classList.remove('brushing');
    s.hudDirty = true;                                          // the bar is gone from the footprint: back to the normal fit
    markChips(s);
    s.infoKey = ''; s.infoDirty = true;
    if (announce) { snd('ui_back'); UI.announce('Spell set aside.'); }
  }

  function toggleBrush(s, id) {
    if (s.brush && s.brush.id === id) { exitBrush(s, true); return; }
    enterBrush(s, id);
  }

  function markChips(s) {
    const ch = s.hud.chipEls || {};
    Object.keys(ch).forEach((id) => { const on = !!(s.brush && s.brush.id === id); ch[id].classList.toggle('on', on); ch[id].setAttribute('aria-pressed', on ? 'true' : 'false'); });
    s.hud.tray.classList.toggle('busy', !!s.brush);
  }

  function paintBrushBar(s) {
    const b = s.brush, H = s.hud;
    if (!b) { H.mode.hidden = true; return; }
    H.mode.hidden = false;
    H.modeName.textContent = b.def.name;
    clearKids(H.modeIco);
    H.modeIco.appendChild(UI.icon('brush', b.id, 40, {}, 'mp-mode-canvas'));
    let txt, ok = false;
    if (b.anchor) {
      ok = b.valid;
      const n = U.plural(b.preview.length, 'hex', 'hexes');
      txt = b.dirKind ? (b.valid ? say('Aim, then tap the arrow again to unmute ' + n + '.', 'Tap the arrow again to unmute ' + n + '.') : say('Nothing would unmute that way. Aim elsewhere.', 'Nothing unmutes that way. Aim elsewhere.')) : say('Tap again or press Cast to unmute ' + n + '.', 'Tap again to unmute ' + n + '.');
    } else {
      const fh = focusHex(s), a = fh ? b.anchors.get(keyOf(fh.q, fh.r)) : null;
      ok = !!a && b.preview.length > 0 && !b.dirKind;
      txt = b.dirKind ? say('Glowing hexes are places to start. Pick one, then aim.', 'Pick a glowing hex, then aim.') : say('Glowing hexes are places to start. Hover for the shape, tap to cast.', 'Tap a glowing hex to cast.');
    }
    H.modeText.textContent = txt;
    H.apply.rbSet({ disabled: !ok, reason: b.anchor ? 'Aim the Spell at hexes it can unmute' : 'Pick a glowing hex first' });
    H.apply.rbSet({ label: b.anchor && b.valid ? 'Cast ' + b.preview.length : 'Cast' });
  }

  // a locked directional brush faces the pointer (or the keyboard cursor): MAP.dirOf from the anchor to the hex it is on
  function aimBrush(s) {
    const b = s.brush;
    if (!b || !b.anchor || !b.dirKind || s.mode === 'touch') return;
    const fh = focusHex(s);
    if (fh && (fh.q !== b.anchor.q || fh.r !== b.anchor.r)) b.dir = MAP.dirOf(s.M, b.anchor.q, b.anchor.r, fh.q, fh.r);
  }

  function updateBrushPreview(s) {
    const b = s.brush;
    if (!b) return;
    const M = s.M;
    aimBrush(s);
    if (b.anchor) {
      const cells = MAP.brushCells(M, b.id, b.anchor.q, b.anchor.r, b.dirKind ? b.dir : 0);
      b.preview = cells; b.valid = cells.length > 0;
    } else {
      const fh = focusHex(s);
      const a = fh ? b.anchors.get(keyOf(fh.q, fh.r)) : null;
      if (a) {
        const dir = b.dirKind ? bestDir(s, a) : 0;
        b.hoverDir = dir;
        b.preview = MAP.brushCells(M, b.id, a.q, a.r, dir); b.valid = b.preview.length > 0;
      } else if (fh && tileAt(M, fh.q, fh.r)) { b.preview = [[fh.q, fh.r]]; b.valid = false; }
      else { b.preview = []; b.valid = false; }
    }
    paintBrushBar(s);
  }

  function brushInfo(s, fh) {
    const b = s.brush, d = b.def;
    const o = { q: -1, r: -1, tile: null, name: d.name, text: d.text, action: '', tone: 'paint' };
    if (b.anchor) { o.action = b.dirKind ? (b.valid ? 'Unmuting ' + U.plural(b.preview.length, 'hex', 'hexes') + say('. Tap the aimed direction to apply.', '. Tap the arrow again.') : 'Nothing to unmute that way.') : 'Unmuting ' + U.plural(b.preview.length, 'hex', 'hexes') + '. Tap again to apply.'; if (!b.valid) o.tone = 'bad'; return o; }
    if (!fh) { o.action = 'Glowing hexes are places to start.'; return o; }
    if (b.anchors.has(keyOf(fh.q, fh.r))) { o.action = (b.dirKind ? 'Tap to start here, then aim.' : s.mode === 'touch' ? 'Tap to see the shape.' : 'Tap to unmute ' + U.plural(b.preview.length, 'hex', 'hexes') + '.'); return o; }
    const can = MAP.canBrush(s.M, b.id, fh.q, fh.r, 0);
    o.action = originHint(can) || reasonText(can && can.reason);
    o.tone = 'bad';
    return o;
  }

  function brushTap(s, q, r, touch) {
    const b = s.brush, key = keyOf(q, r);
    if (b.dirKind) {
      if (!b.anchor) {
        const a = b.anchors.get(key);
        if (!a) { const can = MAP.canBrush(s.M, b.id, q, r, 0); refuse(s, originHint(can) || reasonText(can && can.reason)); return; }
        b.anchor = { q, r }; b.dir = bestDir(s, a);
        snd('ui_click');
        updateBrushPreview(s); s.infoKey = ''; s.infoDirty = true;
        UI.announce('Spell anchored. Aim it, then tap to cast. Facing ' + DIR_NAMES[b.dir] + '.');
        return;
      }
      if (q === b.anchor.q && r === b.anchor.r) { if (b.valid) applyBrushNow(s); else refuse(s, 'Aim the Spell at hexes it can unmute.'); return; }
      const d = MAP.dirOf(s.M, b.anchor.q, b.anchor.r, q, r);
      if (d !== b.dir) {
        b.dir = d; snd('ui_click'); updateBrushPreview(s); s.infoKey = ''; s.infoDirty = true;
        UI.announce('Facing ' + DIR_NAMES[d] + '. ' + (b.valid ? U.plural(b.preview.length, 'hex', 'hexes') + ' would unmute.' : 'Nothing would unmute.'));
        return;
      }
      if (b.valid) applyBrushNow(s); else refuse(s, 'Nothing would unmute that way.');
      return;
    }
    // the shapes that need no aim: a mouse has already seen the preview on hover, a finger confirms with a second tap
    const a = b.anchors.get(key);
    if (!a) { const can = MAP.canBrush(s.M, b.id, q, r, 0); refuse(s, originHint(can) || reasonText(can && can.reason)); return; }
    if (touch && !(b.anchor && b.anchor.q === q && b.anchor.r === r)) {
      b.anchor = { q, r }; snd('ui_click'); updateBrushPreview(s); s.infoKey = ''; s.infoDirty = true;
      UI.announce(U.plural(b.preview.length, 'hex', 'hexes') + ' would unmute. Tap again to apply.');
      return;
    }
    b.anchor = { q, r };
    updateBrushPreview(s);
    applyBrushNow(s);
  }

  function applyBrushNow(s) {
    const b = s.brush;
    if (!b || s.busy) return;
    let a = b.anchor, dir = b.dir;
    if (!a) {
      const fh = focusHex(s);
      const cand = fh ? b.anchors.get(keyOf(fh.q, fh.r)) : null;
      if (!cand || b.dirKind) { refuse(s, 'Pick a glowing hex for the Spell to start from.'); return; }
      a = { q: cand.q, r: cand.r }; dir = 0;
    }
    const R = s.R, id = b.id, mercy0 = mercyOf(s);
    const res = RUN.useBrush(R, id, a.q, a.r, b.dirKind ? dir : 0);
    if (!res || !res.ok) { refuse(s, reasonText(res && res.reason)); return; }
    const origin = worldOf(a.q, a.r);
    const tiles = res.tiles.slice().sort((p, q2) => MAP.dist(a.q, a.r, p.q, p.r) - MAP.dist(a.q, a.r, q2.q, q2.r));
    exitBrush(s, false);
    snd('brush_use');
    startReveals(s, tiles, origin, 0.07, id, a);
    { const lt = tiles[tiles.length - 1]; s.walkCell = lt ? [lt.q, lt.r] : null; s.anchorKey = ''; }
    UI.bus.emit('map:brush', { id });
    UI.announce(brushDef(id).name + ' unmutes ' + U.plural(tiles.length, 'hex', 'hexes') + '.');
    drainPending(s);
    s.hud.chips.classList.add('used');
    UI.after(400, () => s.hud.chips.classList.remove('used'));
    syncHud(s, true);
    checkMercy(s, mercy0);
    s.infoKey = ''; s.infoDirty = true;
  }

  // Esc and the right button: back out one level (a locked anchor, then the brush, then a chain preview)
  function cancelModes(s, sound) {
    if (s.brush) {
      if (s.brush.anchor) { s.brush.anchor = null; updateBrushPreview(s); s.infoKey = ''; s.infoDirty = true; if (sound) snd('ui_back'); return true; }
      exitBrush(s, true);
      return true;
    }
    if (s.chain) { s.chain = null; s.infoKey = ''; s.infoDirty = true; if (sound) snd('ui_back'); return true; }
    return false;
  }

  // ==================================================================================================================
  // walking
  // ==================================================================================================================
  const stepDur = () => (reduced() ? 0.14 : STEP_S) / Math.max(1, (UI.opt && UI.opt.speed) || 1);

  function walkTo(s, q, r) {
    if (s.busy || s.walk) return false;
    const R = s.R;
    if (R.node) { refuse(s, reasonText('busy')); return false; }
    const path = MAP.walkPath(s.M, q, r);
    if (path === null || path === undefined) { refuse(s, 'No live path leads there.'); return false; }
    if (!path.length) { followParty(s, true); return false; }
    s.chain = null; s.hoverPath = null;
    s.walk = { path, i: 0, t: 0, from: { x: s.tok.x, y: s.tok.y } };
    s.walkK = 0;
    followParty(s, true);
    const dest = path[path.length - 1];
    s.walkCell = null; s.anchorKey = '';
    UI.bus.emit('map:walk', { q: dest[0], r: dest[1] });
    UI.announce('Walking ' + U.plural(path.length, 'step') + '.');
    if (headless()) { let guardN = 0; while (s.walk && guardN++ < 400) stepWalk(s, STEP_S); }
    return true;
  }

  function endWalk(s) {
    s.walk = null;
    s.tok.moving = false;
    s.infoKey = ''; s.infoDirty = true;
    syncHud(s, true);
  }

  function stepWalk(s, dt) {
    const W = s.walk;
    if (!W) return;
    W.t += dt;
    const dur = stepDur();
    while (s.walk && W.t >= dur) { W.t -= dur; arrive(s); }
    if (!s.walk) return;
    const cell = W.path[W.i], to = worldOf(cell[0], cell[1]), e = U.ease.inOutQuad(clamp(W.t / dur, 0, 1));
    s.tok.x = W.from.x + (to.x - W.from.x) * e;
    s.tok.y = W.from.y + (to.y - W.from.y) * e;
    s.tok.moving = true;
    if (Math.abs(to.x - W.from.x) > 1) s.tok.dir = to.x > W.from.x ? 1 : -1;
  }

  function arrive(s) {
    const W = s.walk, R = s.R, cell = W.path[W.i], q = cell[0], r = cell[1], to = worldOf(q, r);
    const mercy0 = mercyOf(s);
    const res = RUN.step(R, q, r);
    if (Math.abs(to.x - W.from.x) > 1) s.tok.dir = to.x > W.from.x ? 1 : -1;
    s.tok.x = to.x; s.tok.y = to.y; W.from = { x: to.x, y: to.y }; W.i++;
    snd('step');
    if (s.M.pos.q !== q || s.M.pos.r !== r) { endWalk(s); return; }          // RUN refused the step: stop where the party really is
    s.walkK = (s.walkK | 0) + 1;
    if ((s.walkK <= 6 || (s.walkK - 6) % 2 === 0) && !heardRecently(s, q, r)) wakeNote(s, q, r, { soft: true });
    checkMercy(s, mercy0);
    if (res && res.kind) { endWalk(s); onArrive(s, res, q, r); return; }
    if (W.i >= W.path.length) endWalk(s);
  }

  // GAME loads after the screens: reached at call time only (DESIGN 2), and a missing GAME (a bare test page) just means nobody takes the node
  const enterNode = (node) => safe(() => GAME.enterNode(node), null);

  function onArrive(s, res, q, r) {
    drainPending(s);
    if (res.done) instantArrive(s, res, q, r); else nodeArrive(s, res, q, r);
  }

  // a well or a brush rack: already applied by RUN.step, so the screen only shows it and lets GAME save and toast
  function instantArrive(s, res, q, r) {
    const p = screenOf(s, q, r), H = s.hud;
    if (res.kind === 'well') {
      addFx(s, 'ring', p.wx, p.wy, 420, { color: '#5fb4ff', sc: 1.2 });
      addFx(s, 'sparkle', p.wx, p.wy, 600);
      addPop(s, q, r, '#5fb4ff', 'well');
      const gained = res.gained | 0;
      if (gained > 0) {
        UI.floatText(p.x, p.y - 28, '+' + gained + ' Vox', 'block');
        let land = 0;
        for (let i = 0; i < Math.min(gained, 8); i++) land = Math.max(land, flyTo(s, 'drop', p.x + (i - 3.5) * 5, p.y - 10, H.inkMeter.root, 120 + i * 90));
        s.inkHold = s.t + land;
        UI.after(Math.round(land * 1000), () => { if (s.live()) snd('ink_gain'); });
      }
      if (res.fallback && res.toast) UI.toast(res.toast, 'info');
    } else if (res.kind === 'brush') {
      addFx(s, 'sparkle', p.wx, p.wy, 700, { sc: 1.2 });
      addPop(s, q, r, '#2fbdb5', 'brush');
      UI.floatText(p.x, p.y - 28, brushDef(res.id).name, 'heal');
      syncHud(s, true);                                             // the tray now holds the new chip: the brush flies to it and the chip waits for it
      const chipEl = H.chipEls && H.chipEls[res.id];
      if (chipEl && !headless()) {
        const land = flyTo(s, 'brush', p.x, p.y - 10, chipEl, 160, UI.icon('brush', res.id, 40, {}, 'mp-fly-ico'));
        chipEl.style.visibility = 'hidden';
        UI.after(Math.round(land * 1000), () => { chipEl.style.visibility = ''; UI.pulse(chipEl); });
      }
    }
    syncHud(s, true);
    UI.announce(res.kind === 'well' ? 'The tea is warm: ' + (res.gained | 0) + ' Vox.' : 'You learn ' + brushDef(res.id).name + '.');
    enterNode(res);
  }

  // anything with a page of its own: a beat to show the tile, then GAME routes there. The boss gets a long, dark one.
  function nodeArrive(s, res, q, r) {
    s.busy = true;
    const boss = res.kind === 'combat' && res.tier === 'boss', elite = res.kind === 'combat' && res.tier === 'elite';
    addPop(s, q, r, boss ? '#b0245c' : elite ? '#f5c96a' : '#fff6dc', null);
    addFx(s, 'ring', worldOf(q, r).x, worldOf(q, r).y, 420, { color: boss ? '#b0245c' : '#f5c96a', sc: boss ? 1.6 : 1.1 });
    snd(boss ? 'boss_intro' : res.kind === 'combat' ? 'reveal_landmark' : 'page_turn');
    UI.announce(boss ? 'The headliner of this act.' : (tileInfo(s.M.tiles[keyOf(q, r)].type).name) + '.');
    const wait = headless() ? 0 : boss ? 1100 : reduced() ? 150 : 420;
    s.busyRetry = s.t + 3.5 + wait / 1000;
    UI.after(wait, () => { if (!s.live()) return; enterNode(res); });
  }

  // ==================================================================================================================
  // input: one pointer path for mouse, touch and pen
  // ==================================================================================================================
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);
  const dragThreshold = () => DRAG_PX / Math.max(0.35, UI.scale || 1);

  function setHover(s, h) {
    const same = (!h && !s.hover) || (h && s.hover && h.q === s.hover.q && h.r === s.hover.r);
    s.hover = h;
    if (same) return;
    if (s.brush) updateBrushPreview(s);
    s.infoDirty = true;
  }

  function startPinch(s) {
    const pts = Array.from(s.ptrs.values());
    if (pts.length < 2) return;
    const a = pts[0], b = pts[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    s.pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: s.cam.z, wx: s.cam.x + (mid.x - CX) / s.cam.z, wy: s.cam.y + (mid.y - CY) / s.cam.z };
    pts.forEach((p) => { p.drag = true; p.pinched = true; });
    userMoved(s);
    s.inertia = false;
  }

  function updatePinch(s) {
    const pts = Array.from(s.ptrs.values());
    if (pts.length < 2 || !s.pinch) return;
    const a = pts[0], b = pts[1], P = s.pinch;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const z = clamp(P.z0 * Math.hypot(a.x - b.x, a.y - b.y) / P.d0, s.zMin, ZMAX);
    s.cam.z = z; s.tz = z;
    s.cam.x = P.wx - (mid.x - CX) / z;
    s.cam.y = P.wy - (mid.y - CY) / z;
    clampCam(s, s.cam);
    s.fitted = z <= s.zMin + 1e-9;
  }

  function onDown(e, p) {
    const s = S;
    if (!s || s.empty) return;
    s.mode = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse';
    if (e.button === 2) { cancelModes(s, true); return; }
    if (e.button > 0) return;
    const id = e.pointerId == null ? 0 : e.pointerId;
    s.ptrs.set(id, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: nowMs(), drag: false, pinched: false, type: s.mode, samples: [{ t: nowMs(), x: p.x, y: p.y }] });
    safe(() => UI.layers.view.setPointerCapture(id));
    s.inertia = false;
    if (s.ptrs.size === 2) startPinch(s);
  }

  function onMove(e, p) {
    const s = S;
    if (!s || s.empty) return;
    const id = e.pointerId == null ? 0 : e.pointerId;
    const pt = s.ptrs.get(id);
    if (!pt) {
      if (e.pointerType === 'mouse' || !e.pointerType) { s.mode = 'mouse'; s.hoverPt = p; setHover(s, hexAt(s, p.x, p.y)); flushInfo(s); }
      return;
    }
    if (s.ptrs.size >= 2) { pt.x = p.x; pt.y = p.y; updatePinch(s); return; }
    const dx = p.x - pt.x, dy = p.y - pt.y;
    pt.x = p.x; pt.y = p.y;
    if (!pt.drag && Math.hypot(p.x - pt.sx, p.y - pt.sy) > dragThreshold()) pt.drag = true;
    if (pt.drag) {
      panBy(s, -dx, -dy);
      pt.samples.push({ t: nowMs(), x: p.x, y: p.y });
      if (pt.samples.length > 6) pt.samples.shift();
    }
  }

  function onUp(e, p) {
    const s = S;
    if (!s || s.empty) return;
    const id = e.pointerId == null ? 0 : e.pointerId;
    const pt = s.ptrs.get(id);
    s.ptrs.delete(id);
    if (!pt) return;
    if (s.pinch && s.ptrs.size < 2) { s.pinch = null; s.ptrs.forEach((o) => { o.drag = true; o.pinched = true; o.sx = o.x; o.sy = o.y; }); }
    if (UI.overlay.count() > 0) return;
    const dt = nowMs() - pt.t0;
    if (!pt.drag && !pt.pinched && dt < TAP_MS) { onTap(s, p, pt.type); return; }
    if (pt.drag && !pt.pinched && s.ptrs.size === 0 && pt.samples.length >= 2) {
      const a = pt.samples[0], b = pt.samples[pt.samples.length - 1], span = Math.max(16, b.t - a.t);
      if (nowMs() - b.t < 120) {
        s.vel.x = -(b.x - a.x) / span * 1000 / s.cam.z; s.vel.y = -(b.y - a.y) / span * 1000 / s.cam.z;
        const sp = Math.hypot(s.vel.x, s.vel.y);
        if (sp > 1600) { s.vel.x *= 1600 / sp; s.vel.y *= 1600 / sp; }
        s.inertia = sp > 40;
      }
    }
  }

  function onCancel(e) {
    const s = S;
    if (!s) return;
    const id = e.pointerId == null ? 0 : e.pointerId;
    s.ptrs.delete(id);
    if (s.pinch && s.ptrs.size < 2) s.pinch = null;
  }

  function onWheel(e, p) {
    const s = S;
    if (!s || s.empty) return;
    if (e.preventDefault) e.preventDefault();
    const dy = (e.deltaY || 0) * (e.deltaMode === 1 ? 18 : 1);
    if (!dy) return;
    userMoved(s);
    s.inertia = false;
    zoomAt(s, s.cam.z * Math.exp(-dy * 0.0016), p.x, p.y);
    s.tz = s.cam.z;
    s.fitted = s.cam.z <= s.zMin + 1e-9;                          // zoomed all the way out is the fit view
    if (s.mode === 'mouse') { setHover(s, hexAt(s, p.x, p.y)); flushInfo(s); }
  }

  function onTap(s, p, type) {
    s.mode = type === 'touch' ? 'touch' : 'mouse';
    const h = hexAt(s, p.x, p.y);
    if (!h) {
      if (s.chain) { s.chain = null; s.infoDirty = true; }
      return;
    }
    s.hover = h;
    s.hoverUntil = s.mode === 'touch' ? s.t + 3 : 0;               // a finger leaves no hover: the last tapped hex is shown for a moment
    if (s.mode === 'touch' && s.brush && !s.brush.anchor) updateBrushPreview(s);
    activateHex(s, h.q, h.r, { touch: s.mode === 'touch' });
    s.infoDirty = true;
    flushInfo(s);
  }

  // what a tap (or Enter on the cursor) does to the hex at (q, r)
  function activateHex(s, q, r, o) {
    if (s.busy || s.walk) return;
    const T = tileAt(s.M, q, r);
    if (!T) return;
    if (s.brush) { brushTap(s, q, r, !!o.touch); return; }
    if (T.type === 'block') {
      s.chain = null;
      refuse(s, tileInfo('block').name + ': nothing can cross it.', 'info');
      addPop(s, q, r, '#e8383d', null);
      return;
    }
    if (T.painted) {
      s.chain = null;
      if (s.M.pos.q === q && s.M.pos.r === r) { followParty(s, true); snd('ui_click'); return; }
      walkTo(s, q, r);
      return;
    }
    if (MAP.canPaint(s.M, q, r).ok) { s.chain = null; paintAction(s, q, r); return; }
    const pre = RUN.paintPreview(s.R, q, r);
    if (!pre.ok) { s.chain = null; refuse(s, reasonText(pre.reason), 'info'); return; }
    if (s.chain && s.chain.q === q && s.chain.r === r) { paintAction(s, q, r); return; }
    s.chain = { q, r, path: pre.path, cost: pre.cost, affordable: pre.affordable, from: chainFrom(s, pre.path) };
    snd('ui_click');
    if (!pre.affordable) shakeInk(s);
    UI.announce('A chain of ' + U.plural(pre.path.length, 'hex', 'hexes') + ' costs ' + pre.cost + ' Vox. ' + (pre.affordable ? 'Tap it again to unmute.' : 'You hold ' + s.R.ink + '.'));
  }

  // ==================================================================================================================
  // keyboard
  // ==================================================================================================================
  function moveCursor(s, d) {
    if (s.busy || s.walk) return;
    s.mode = 'key';
    const from = s.cursor || { q: s.M.pos.q, r: s.M.pos.r };
    if (!s.cursor) { s.cursor = from; }
    else {
      const T = tileAt(s.M, from.q + MAP.DIRS[d][0], from.r + MAP.DIRS[d][1]);
      if (!T) { snd('ui_error'); return; }
      s.cursor = { q: T.q, r: T.r };
    }
    const w = worldOf(s.cursor.q, s.cursor.r);
    revealOnScreen(s, w.x, w.y);
    if (s.brush) updateBrushPreview(s);
    s.infoDirty = true;
    s.announceNext = true;
    snd('ui_hover');
  }

  function nextBrush(s) {
    const ids = brushCounts(s.R).order;
    if (!ids.length) { refuse(s, 'You know no Spells. Buskers and rivals teach them.', 'info'); return; }
    if (!s.brush) { enterBrush(s, ids[0]); return; }
    const i = ids.indexOf(s.brush.id);
    if (ids.length === 1) { exitBrush(s, true); return; }
    enterBrush(s, ids[(i + 1) % ids.length]);
  }

  function onKey(e) {
    const s = S;
    if (!s || s.empty || e.ctrlKey || e.metaKey || e.altKey) return false;
    const handled = onKeyInner(s, e);
    if (handled) flushInfo(s);
    return handled;
  }

  function onKeyInner(s, e) {
    const k = e.key;
    const lk = typeof k === 'string' && k.length === 1 ? k.toLowerCase() : k;
    const t = e.target, onControl = !!(t && t.closest && t.closest('button, [role=button], input, select'));
    if (lk === 'Escape') return cancelModes(s, true);
    if (lk === 'ArrowLeft' || lk === 'ArrowRight' || lk === 'ArrowUp' || lk === 'ArrowDown') {
      if (onControl && safe(() => t.matches(':focus-visible'), true)) return false;   // a keyboard user on a button: the arrows move focus between buttons
      const step = e.shiftKey ? 240 : 80;
      panBy(s, lk === 'ArrowLeft' ? -step : lk === 'ArrowRight' ? step : 0, lk === 'ArrowUp' ? -step : lk === 'ArrowDown' ? step : 0);
      return true;
    }
    if (lk === '+' || lk === '=') { zoomStep(s, 1.25); return true; }
    if (lk === '-' || lk === '_') { zoomStep(s, 0.8); return true; }
    if (lk === 'f') { toggleFit(s); return true; }
    if (lk === 'b') { nextBrush(s); return true; }
    if (lk === 'l') { UI.overlay.open('legend', {}); return true; }
    if (lk === 'd' && e.shiftKey) { UI.overlay.open('deck', { mode: 'view' }); return true; }
    if (Object.prototype.hasOwnProperty.call(DIR_KEYS, lk) && !e.shiftKey) { moveCursor(s, DIR_KEYS[lk]); return true; }
    if (/^[1-9]$/.test(lk)) {
      const ids = brushCounts(s.R).order, id = ids[Number(lk) - 1];
      if (id) { toggleBrush(s, id); return true; }
      return false;
    }
    if ((lk === 'Enter' || lk === ' ') && !onControl) {
      if (!s.cursor) { s.mode = 'key'; s.cursor = { q: s.M.pos.q, r: s.M.pos.r }; s.infoDirty = true; s.announceNext = true; return true; }
      s.mode = 'key';
      if (s.brush && s.brush.anchor && s.cursor.q === s.brush.anchor.q && s.cursor.r === s.brush.anchor.r) { applyBrushNow(s); return true; }
      activateHex(s, s.cursor.q, s.cursor.r, { touch: false });
      s.infoDirty = true;
      return true;
    }
    return false;
  }

  // ==================================================================================================================
  // the frame
  // ==================================================================================================================
  function placeHexAnchor(s) {
    const H = s.hud;
    if (!H.hexAnchor) return;
    const key = s.ver + ':' + s.M.pos.q + ',' + s.M.pos.r;
    if (s.anchorKey !== key) {
      s.anchorKey = key;
      // after a paint or a brush the anchor marks the painted hex to walk onto; before that, and again after the first walk, the next hex of the cheapest chain to paint
      const wt = s.walkCell && s.M.tiles[MAP.key(s.walkCell[0], s.walkCell[1])];
      const sol = wt && wt.painted ? null : safe(() => MAP.solve(s.M), null);
      const cell = wt && wt.painted ? s.walkCell : sol && sol.path && sol.path.length ? sol.path[0] : [s.M.boss.q, s.M.boss.r];
      s.anchorCell = cell;
    }
    const c = s.cam, size = HEX * c.z, p = worldOf(s.anchorCell[0], s.anchorCell[1]);
    const x = wx2sx(c, p.x), y = wy2sy(c, p.y);
    const st = H.hexAnchor.style;
    st.left = Math.round(x - size * 0.9) + 'px'; st.top = Math.round(y - size) + 'px';
    st.width = Math.round(size * 1.8) + 'px'; st.height = Math.round(size * 2) + 'px';
  }

  function update(dt) {
    const s = S;
    if (!s || s.empty) return;
    s.t += dt; s.frame++;
    stepReveals(s);
    if (s.walk) stepWalk(s, dt);
    else if (!s.tokTo) {                                          // idle: the token sits on the party's hex
      const p = worldOf(s.M.pos.q, s.M.pos.r);
      s.tok.x = p.x; s.tok.y = p.y; s.tok.moving = false;
    }
    frameCamera(s, dt);
    stepPetals(s, dt);
    if (s.intro) { s.intro.t += dt; if (s.intro.t > s.intro.dur) s.intro = null; }
    if (s.hoverUntil && s.t > s.hoverUntil && s.mode === 'touch') { s.hoverUntil = 0; s.hover = null; if (s.brush) updateBrushPreview(s); s.infoDirty = true; }
    if (s.busyRetry && s.t > s.busyRetry) {                          // GAME did not take us to the node page: try once more, then free the page
      s.busyRetry = 0;
      if (s.R.node && !s.retried) { s.retried = true; s.busyRetry = s.t + 3; enterNode(s.R.node); }
      else s.busy = false;
    }
    if (!(s.inkHold && s.t < s.inkHold)) { s.inkHold = 0; syncHud(s, true); }
    watchHud(s, dt);                                              // after syncHud: a tray or a strip it just rebuilt is measured in the same frame
    flushInfo(s);
    if ((s.frame & 3) === 0) placeHexAnchor(s);
  }

  function draw(ctx, t) {
    const s = S;
    if (!s) return;
    if (s.empty) { ctx.fillStyle = '#f3e6c8'; ctx.fillRect(0, 0, 1280, 720); return; }
    drawWorld(s, ctx, t);
  }

  // ==================================================================================================================
  // enter and leave
  // ==================================================================================================================
  function enterEmpty(s, root) {
    const back = UI.btn('Back to Title', { kind: 'primary', size: 'lg', onclick: () => UI.toTitle() });
    root.appendChild(mk('div', { class: 'mp-empty' }, UI.panel({ kind: 'paper', torn: true, title: 'No map yet' },
      mk('p', { class: 'm-text', text: 'There is no map to show. The tour has not started, or it is over.' }), mk('div', { class: 'row center' }, back))));
    root.appendChild(UI.menuButton());
  }

  function startIntro(s, root) {
    const R = s.R;
    s.intro = { t: 0, dur: 3.4 };
    const el = mk('div', { class: 'mp-intro', 'aria-hidden': 'true' },
      mk('span', { class: 'mp-intro-n', text: 'Act ' + U.roman(R.chapter || 1) }),
      mk('h2', { class: 'mp-intro-t', text: chapterTitle(R.chapter || 1) }),
      mk('i', { class: 'mp-intro-brush' }));
    s.hud.root.appendChild(el);
    s.hud.root.classList.add('intro');
    UI.after(3500, () => { if (el.parentNode) el.parentNode.removeChild(el); s.hud.root.classList.remove('intro'); });
    snd('page_turn');
  }

  function enter(params, root) {
    const s = S = begin(params, root);
    if (s.empty) { enterEmpty(s, root); return; }
    const R = s.R, M = s.M;
    buildTiles(s);
    setupCamera(s);
    const p0 = worldOf(M.pos.q, M.pos.r);
    s.tok = { x: p0.x, y: p0.y, dir: 1, moving: false };
    buildHud(s, root);
    s.infoDirty = true; flushInfo(s);                              // the info chip has its text before it is measured (an empty chip is a line shorter)
    relayout(s, true);                                             // the HUD is in the page now: its real rectangles decide the fit
    rebuildVisual(s);
    initPetals(s);
    // the camera: a swoop from the whole page down to the party on the first visit to a chapter, else straight to the party
    const first = MEMO.id !== R.id || MEMO.chapter !== R.chapter;
    MEMO.id = R.id; MEMO.chapter = R.chapter;
    s.cam.z = clamp(defaultZoom(), s.zMin, ZMAX); s.tz = s.cam.z;
    { const c0 = camFor(s, p0.x, p0.y, s.cam.z); s.cam.x = c0.x; s.cam.y = c0.y; }
    clampCam(s, s.cam);
    if (first && !headless()) {
      startIntro(s, root);
      if (!reduced()) {
        s.cam.z = s.zMin; s.cam.x = s.fit.x; s.cam.y = s.fit.y; clampCam(s, s.cam);
        s.follow = true; s.panRate = 1.6; s.zoomRate = 1.7;
        s.tz = clamp(defaultZoom(), s.zMin, ZMAX);
      }
    }
    // input, registered through UI so it is gone at leave
    UI.canvasOn('pointerdown', onDown);
    UI.canvasOn('pointermove', onMove);
    UI.canvasOn('pointerup', onUp, { always: true });
    UI.canvasOn('pointercancel', onCancel, { always: true });
    UI.canvasOn('wheel', onWheel, { passive: false });
    UI.canvasOn('contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); if (S) cancelModes(S, true); }, { passive: false });
    UI.canvasOn('pointerleave', (e) => { if (S && (e.pointerType === 'mouse' || !e.pointerType)) { setHover(S, null); flushInfo(S); } });
    // the mercy rule can fire while a node closes (finishNode, claim): say so once
    if (MEMO.runId === R.id && (R.stats.mercy | 0) > MEMO.mercy) UI.toast('A passer-by hums along: 1 Vox.', 'good');
    MEMO.runId = R.id; MEMO.mercy = R.stats.mercy | 0;
    drainPending(s);
    safe(() => { if (AM() && isFn(AM().warm) && !headless()) AM().warm(HEX * s.cam.z, { ms: 24 }); });
    s.infoDirty = true;
    flushInfo(s);
    UI.announce('Act ' + (R.chapter || 1) + ', ' + chapterTitle(R.chapter || 1) + '. ' + R.ink + ' Vox. ' + MAP.progress(M).pct + ' percent live.');
  }

  function leave() {
    const s = S;
    S = null;
    if (!s) return;
    s.live = () => false;
    s.ptrs.clear();
    safe(() => UI.tip.hide());
  }

  // read-only helpers for suites and the screenshot tool: the camera, where a hex is on the stage, and the live visit
  const mapDebug = {
    state: () => S,
    cam: () => (S && !S.empty ? { x: S.cam.x, y: S.cam.y, z: S.cam.z, follow: S.follow, fitted: S.fitted, zMin: S.zMin, zMax: ZMAX } : null),
    // the HUD footprint the camera works with: its rectangles (live: measured, else the fallback), the free box, the clamp box and its slack, and the fit camera.
    // hud(true) measures the HUD again first, and when it moved that re-fits (so it can move the camera, as the next frame would have)
    hud: (measure) => {
      if (!S || S.empty) return null;
      if (measure && relayout(S, false)) applyLayout(S);
      const cp = (o) => Object.assign({}, o);
      return { rects: S.hudRects.map(cp), free: cp(S.free), box: cp(S.box), slack: cp(S.slack), fit: cp(S.fit), margin: HUD_MARGIN, ver: S.hudVer };
    },
    screenOf: (q, r) => { if (!S || S.empty) return null; const p = screenOf(S, q, r); return { x: p.x, y: p.y }; },
    hexAt: (x, y) => (S && !S.empty ? hexAt(S, x, y) : null),
    clamp: (x, y, z) => (S && !S.empty ? clampCam(S, { x, y, z: clamp(z, S.zMin, ZMAX) }) : null),         // where the camera may really be
  };

  UI.screens.map = {
    music: (p) => 'map' + clamp((p && p.R && p.R.chapter) || (UI.run && UI.run.chapter) || 1, 1, 3),
    enter, leave, update, draw, onKey, mapDebug,
  };

  // ==================================================================================================================
  // overlay: relics (every treasure of the run)
  // ==================================================================================================================
  function relicSource(R, id) {
    const d = DATA.relics[id] || {};
    let ch = 0;
    if (R && Array.isArray(R.log)) R.log.forEach((e) => { if (e && e.msg === 'Found ' + d.name + '.') ch = e.ch | 0; });
    const how = d.hero ? 'A keepsake of ' + heroName(d.hero) + '.'
      : d.rarity === 'boss' ? 'Dropped by an act\'s headliner.'
        : d.rarity === 'shop' ? 'Sold only at merch stalls.'
          : 'Found with rivals, in gift boxes and at merch stalls.';
    const where = ch ? 'Found in Act ' + U.roman(ch) + ', ' + chapterTitle(ch) + '.' : 'Carried since the tour began.';
    return where + ' ' + how;
  }

  UI.overlays.relics = {
    open(p, root, close) {
      p = p || {};
      const R = UI.run;
      const ids = (p.relics || (R && R.relics) || []).filter((id) => DATA.relics[id]);
      const sorted = ids.slice().sort((a, b) => {
        const ra = RARITY_ORDER.indexOf(DATA.relics[a].rarity), rb = RARITY_ORDER.indexOf(DATA.relics[b].rarity);
        return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb) || String(DATA.relics[a].name).localeCompare(String(DATA.relics[b].name));
      });
      const grid = mk('div', { class: 'mr-grid' + (sorted.length === 1 ? ' one' : '') });
      sorted.forEach((id, i) => {
        const d = DATA.relics[id];
        const row = mk('div', { class: 'mr-row rar-' + d.rarity, role: 'group', tabindex: '0', 'aria-label': d.name + ', ' + (RARITY_NAME[d.rarity] || String(d.rarity)).toLowerCase() + '. ' + relicLine(id) + ' ' + relicSource(R, id), dataset: { id } },
          UI.relic(id, { size: 'lg', tip: false }),
          mk('div', { class: 'mr-txt' },
            mk('div', { class: 'mr-head' }, mk('b', { class: 'mr-name', text: d.name }), mk('span', { class: 'mr-tag mr-' + d.rarity, text: RARITY_NAME[d.rarity] || cap(d.rarity) })),
            mk('p', { class: 'mr-text', text: relicLine(id) }),
            mk('p', { class: 'mr-from', text: relicSource(R, id) })));
        UI.vars(row, { '--i': i });
        grid.appendChild(row);
      });
      if (!sorted.length) {
        grid.appendChild(mk('div', { class: 'mr-empty' }, UI.icon('relic', 'lantern', 64, { dim: true }), mk('p', { class: 'empty', text: 'No charms yet. Rivals, gift boxes and merch stalls hold them.' })));
      }
      const counts = {};
      sorted.forEach((id) => { const r = DATA.relics[id].rarity; counts[r] = (counts[r] || 0) + 1; });
      const sum = mk('p', { class: 'mr-sum', text: sorted.length ? U.plural(sorted.length, 'charm') + ': ' + RARITY_ORDER.filter((r) => counts[r]).map((r) => counts[r] + ' ' + (RARITY_NAME[r] || r).toLowerCase()).join(', ') + '.' : 'Your pack is light.' });
      const closeBtn = UI.btn('Close', { kind: 'secondary', size: 'lg', onclick: () => close() });
      closeBtn.setAttribute('data-autofocus', '');
      root.appendChild(UI.panel({ kind: 'dark', gold: true, title: 'Charms', class: 'relics-panel mp-relics-panel' }, sum, grid, mk('div', { class: 'row center' }, closeBtn)));
    },
  };

  // ==================================================================================================================
  // overlay: legend (tiles, brushes, controls, words)
  // ==================================================================================================================
  function miniHex(kind, tile, done, size, px) {
    const w = Math.round(size * 2.1), h = Math.round(size * 2.2);
    const c = mk('canvas', { class: 'lg-hex', width: Math.round(w * px), height: Math.round(h * px), style: { width: w + 'px', height: h + 'px' }, 'aria-hidden': 'true' });
    const g = safe(() => c.getContext('2d'), null);
    if (!g) return c;
    g.setTransform(px, 0, 0, px, 0, 0);
    HOPT.t = 0; HOPT.near = false;
    const draw = () => { if (amHas('hex')) ART.map.hex(g, kind, w / 2, h / 2, size, { tile, seed: 3, done, t: 0 }); else fallbackHex(g, kind, w / 2, h / 2, size, tile); };
    try { draw(); } catch (e) { warnOnce('legend hex', e); safe(() => fallbackHex(g, kind, w / 2, h / 2, size, tile)); }
    return c;
  }

  // the cells a brush paints, relative to its anchor, for a fresh direction 0 (east)
  function brushShape(def) {
    switch (def.kind) {
      case 'line': { const cells = []; for (let k = 1; k <= (def.len || 3); k++) cells.push([k, 0]); return { anchor: [0, 0], painted: true, cells }; }
      case 'fan': return { anchor: [0, 0], painted: true, cells: [5, 0, 1].map((d) => [MAP.DIRS[d][0], MAP.DIRS[d][1]]) };
      case 'blob': return { anchor: [0, 0], painted: false, cells: [[0, 0]].concat(MAP.DIRS.map((d) => [d[0], d[1]])) };
      case 'ring': return { anchor: [0, 0], painted: true, cells: MAP.DIRS.map((d) => [d[0], d[1]]) };
      default: return { anchor: [0, 0], painted: false, party: [-2, 1], cells: [[0, 0]] };
    }
  }

  function brushDiagram(def, px) {
    const sh = brushShape(def), size = 15;
    const pts = [sh.anchor].concat(sh.cells, sh.party ? [sh.party] : []);
    const base = pts.map((c) => MAP.toPixel(c[0], c[1], size));
    // a faint patch of page around the shape so it reads as hexes on a page
    const patch = [];
    MAP.hexRange(sh.anchor[0], sh.anchor[1], def.kind === 'line' && (def.len || 3) > 3 ? 4 : 2).forEach((c) => patch.push(c));
    const allP = patch.map((c) => MAP.toPixel(c[0], c[1], size));
    const minX = Math.min(...allP.map((p) => p.x), ...base.map((p) => p.x)) - size, maxX = Math.max(...allP.map((p) => p.x), ...base.map((p) => p.x)) + size;
    const minY = Math.min(...allP.map((p) => p.y), ...base.map((p) => p.y)) - size, maxY = Math.max(...allP.map((p) => p.y), ...base.map((p) => p.y)) + size;
    const w = Math.round(maxX - minX + 8), h = Math.round(maxY - minY + 8);
    const c = mk('canvas', { class: 'lg-dia', width: Math.round(w * px), height: Math.round(h * px), style: { width: w + 'px', height: h + 'px' }, 'aria-hidden': 'true' });
    const g = safe(() => c.getContext('2d'), null);
    if (!g) return c;
    g.setTransform(px, 0, 0, px, 0, 0);
    const at = (q, r) => { const p = MAP.toPixel(q, r, size); return { x: p.x - minX + 4, y: p.y - minY + 4 }; };
    patch.forEach((cell) => {
      const p = at(cell[0], cell[1]);
      hexPath(g, p.x, p.y, size * 0.94);
      const isAnchor = cell[0] === sh.anchor[0] && cell[1] === sh.anchor[1];
      g.fillStyle = (sh.painted && (isAnchor || cell[0] < 0)) ? 'rgba(207,220,170,0.9)' : 'rgba(255,248,230,0.55)';
      g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(90,70,40,0.4)'; g.stroke();
    });
    sh.cells.forEach((cell) => {
      const p = at(cell[0], cell[1]);
      hexPath(g, p.x, p.y, size * 0.94);
      g.fillStyle = 'rgba(47,189,181,0.62)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0c5058'; g.stroke();
    });
    const a = at(sh.anchor[0], sh.anchor[1]);
    g.beginPath(); g.arc(a.x, a.y, size * 0.34, 0, Math.PI * 2); g.lineWidth = 2.4; g.strokeStyle = '#140f2e'; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = '#f5c96a'; g.stroke();
    if (sh.party) {
      const pp = at(sh.party[0], sh.party[1]);
      g.beginPath(); g.arc(pp.x, pp.y, size * 0.3, 0, Math.PI * 2); g.fillStyle = '#7a6bff'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#140f2e'; g.stroke();
    }
    return c;
  }

  const CONTROLS = [
    ['Mouse', [['Drag', 'slide the map, with a little glide'], ['Wheel', 'zoom toward the pointer'], ['Click fog beside live ground', 'unmute it for 1 Vox'], ['Click far fog', 'preview the cheapest chain, click again to unmute all of it'], ['Click live ground', 'walk there, stopping at the first thing in the way'], ['Right click or Esc', 'back out of a Spell or a preview']]],
    ['Touch', [['Drag', 'slide the map'], ['Pinch', 'zoom'], ['Tap fog beside live ground', 'unmute it for 1 Vox'], ['Tap far fog twice', 'preview the chain, then unmute it'], ['Tap live ground', 'walk there'], ['Spell chip, glowing hex, aim, tap again', 'cast a Spell']]],
    ['Keyboard', [['Arrow keys', 'pan (hold Shift to go faster)'], ['+ and -', 'zoom'], ['F', 'fit the whole map, again to follow the party'], ['Q E A D Z C', 'move the hex cursor: NW NE W E SW SE'], ['Enter or Space', 'unmute or walk to the cursor hex'], ['B or 1 to 9', 'pick a Spell, Esc to set it aside'], ['L and Shift D', 'this legend and your deck']]],
  ];

  function legendMap(px) {
    const wrap = mk('div', { class: 'lg-map' });
    const reading = mk('div', { class: 'lg-read' });
    [['fog', null, false, 'Muted ground', 'A hex the Gloss has muted. Unmute it next to live ground for ' + DATA.ECONOMY.paintCost + ' Vox to hear what it holds.'],
      ['known', 'boss', false, 'Spotted from afar', 'Landmarks show through the fog as silhouettes: ' + DATA.LISTS.landmarks.map((t) => tileInfo(t).name).join(', ') + '.'],
      ['painted', 'enemy', true, 'Done', 'A tile that has been dealt with fades back into plain ground. Walk over it freely.'],
      ['block', null, false, DATA.tiles.block.name, 'Patches the Gloss smoothed away. Nothing can cross them and no Spell unmutes them.']].forEach((e) => {
      reading.appendChild(mk('div', { class: 'lg-read-i' }, miniHex(e[0], e[1], e[2], 22, px), mk('div', {}, mk('b', { text: e[3] }), mk('p', { text: e[4] }))));
    });
    wrap.appendChild(reading);
    const grid = mk('div', { class: 'lg-tiles' });
    DATA.LISTS.tiles.filter((t) => t !== 'block').forEach((id) => {
      const ti = tileInfo(id);
      grid.appendChild(mk('div', { class: 'lg-tile', role: 'group', 'aria-label': ti.name + '. ' + ti.text },
        UI.icon('tile', id, 46, {}, 'lg-tile-ico'),
        mk('div', {}, mk('b', { text: ti.name }), DATA.LISTS.landmarks.indexOf(id) >= 0 ? mk('span', { class: 'lg-lm', text: 'spotted from afar' }) : null, mk('p', { text: ti.text }))));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function legendBrushes(px) {
    const R = UI.run, held = {};
    ((R && R.brushes) || []).forEach((id) => { held[id] = (held[id] || 0) + 1; });
    const wrap = mk('div', { class: 'lg-brushes' });
    wrap.appendChild(mk('p', { class: 'lg-note', text: 'Spells are free and cast once. The gold ring is where the Spell starts, teal is what it unmutes. Lines and wedges can face any of the six directions.' }));
    Object.keys(DATA.brushes).forEach((id) => {
      const d = DATA.brushes[id];
      wrap.appendChild(mk('div', { class: 'lg-brush', role: 'group', 'aria-label': d.name + '. ' + d.text },
        brushDiagram(d, px),
        mk('div', { class: 'lg-brush-t' }, mk('div', { class: 'lg-brush-h' }, UI.icon('brush', id, 34, {}, 'lg-brush-ico'), mk('b', { text: d.name }), held[id] ? mk('span', { class: 'lg-held', text: 'You hold ' + held[id] }) : null), mk('p', { text: d.text }))));
    });
    return wrap;
  }

  function legendControls() {
    const wrap = mk('div', { class: 'lg-controls' });
    CONTROLS.forEach((c) => {
      const col = mk('div', { class: 'lg-ctl' }, mk('h3', { text: c[0] }));
      c[1].forEach((row) => col.appendChild(mk('div', { class: 'lg-ctl-r' }, mk('kbd', { text: row[0] }), mk('span', { text: row[1] }))));
      wrap.appendChild(col);
    });
    return wrap;
  }

  function legendWords() {
    const col = (title, ids, src) => {
      const c = mk('div', { class: 'legend-col' }, mk('h3', { text: title }));
      ids.forEach((id) => {
        const d = src[id];
        const r = mk('div', { class: 'legend-row' });
        if (src === DATA.statuses) r.appendChild(UI.icon('status', id, 30, {}));
        r.appendChild(mk('div', {}, mk('b', { text: d.name }), mk('p', { text: d.text })));
        c.appendChild(r);
      });
      return c;
    };
    return mk('div', { class: 'legend-grid' },
      col('Buffs', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'buff'), DATA.statuses),
      col('Debuffs', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'debuff'), DATA.statuses),
      col('Resources', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'resource'), DATA.statuses),
      col('Words', Object.keys(DATA.keywords), DATA.keywords));
  }

  UI.overlays.legend = {
    open(p, root, close) {
      p = p || {};
      const px = UI.px || 1;
      const body = mk('div', { class: 'lg-body' });
      const TABS = [{ id: 'map', label: 'The Soundlands' }, { id: 'brushes', label: 'Spells' }, { id: 'controls', label: 'Controls' }, { id: 'words', label: 'Words' }];
      const make = { map: () => legendMap(px), brushes: () => legendBrushes(px), controls: legendControls, words: legendWords };
      const show = (id) => { clearKids(body); body.appendChild((make[id] || make.map)()); body.scrollTop = 0; body.setAttribute('data-tab', id); };
      const start = TABS.some((t) => t.id === p.tab) ? p.tab : 'map';
      const tabs = UI.tabs(TABS, { value: start, onchange: show });
      show(start);
      const closeBtn = UI.btn('Close', { kind: 'secondary', size: 'lg', onclick: () => close() });
      closeBtn.setAttribute('data-autofocus', '');
      root.appendChild(UI.panel({ kind: 'dark', gold: true, title: 'The Legend', class: 'legend-panel mp-legend-panel' }, tabs, body, mk('div', { class: 'row center' }, closeBtn)));
    },
  };
})();
