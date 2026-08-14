// Headless loader for FROSTFELL.
//
// The game is one self-contained file (frostfell/index.html): markup, CSS and
// a single inline <script>. This stubs enough of a browser — including a no-op
// 2d context that records what it was asked to draw — to eval that script with
// __FF_HEADLESS__ set, so the suites drive the real functions through
// window.FF rather than a re-implementation of the rules.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFace } from '../tools/frostfont/alphabet.mjs';
import { FROSTWORK_BOLD, FROSTCUT } from '../tools/frostfont/build.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const GAME = process.env.FF_GAME || join(HERE, '..', 'frostfell', 'index.html');

const noop = () => {};

/* WHAT A GLYPH IS ACTUALLY WIDE, WHICH THE STUB USED TO GUESS AT.

   `measureText` returned `length * size * 0.5` — one constant for every
   character in both faces — and that guess has a measurable error, because this
   game's typeface is GENERATED and every glyph carries an exact advance in font
   units. Averaged over the alphabet:

     Frostwork Bold   UPPERCASE 0.667   lowercase 0.594   space 0.331
     Frostwork        UPPERCASE 0.655   lowercase 0.585   space 0.332
     Frostcut         UPPERCASE 0.578   lowercase 0.512   space 0.284

   **The stub understated uppercase text in the body face by a third.** That is
   not a rounding error, it is the difference between a comfortable gutter and
   none — the victory screen's `FIGHTS WON` / `FOES FELLED` had a 30-unit gap by
   the stub's arithmetic and zero by Chromium's, which is exactly how a visible
   collision passed an overlap assertion built to catch collisions.

   So it stops guessing. The advances come out of `tools/frostfont/alphabet.mjs`
   — the same source the shipped .woff2 is cut from, so this cannot drift from
   what a browser renders without the font itself changing. Per character, not
   per face average: an `I` and a `W` are not the same width and averaging them
   is how you get a check that is right about paragraphs and wrong about labels.

   The remaining error is real and worth stating rather than hiding: no kerning
   pairs, and `letterSpacing` (which the game uses on display type) is not
   modelled. Both make the stub read NARROWER than the truth, so it stays the
   conservative direction — it will miss a marginal collision before it invents
   one. */
const ADV = (() => {
  const of = (M) => Object.fromEntries(
    Object.entries(buildFace(M)).map(([ch, v]) => [ch, v.adv / 1000]));
  return { t: of(FROSTWORK_BOLD), d: of(FROSTCUT) };
})();
const FALLBACK = 0.5;
/** The width of `s` at `size`, in the face the context has set. */
export function advance(s, size, face) {
  const t = ADV[face === 'd' ? 'd' : 't'];
  const str = String(s);
  if (!t) return str.length * size * FALLBACK;
  let n = 0;
  for (const ch of str) n += t[ch] !== undefined ? t[ch] : FALLBACK;
  return n * size;
}

/** A 2d context that answers every call. `log` collects the calls worth
 *  asserting on — a render suite needs to know that something was drawn, and
 *  where, without a canvas anywhere near it. */
export function mkCtx(log) {
  const grad = { addColorStop: noop };
  /* The state a text check needs. `font` and `textAlign` are plain assignments
     the old stub threw away, so nothing downstream could tell 9px text from
     26px text — which is why nothing ever caught the phone. Width scales with
     the size for the same reason: a wrap computed against a constant 7px a
     character cannot notice that the text floor made every line wider. */
  const st = { size: 14, face: 't', align: 'center', fill: '#000', stroke: '#000', alpha: 1 };
  /* Cards, creatures and half the juice draw inside a translated, scaled
     context, so the coordinates a naive stub records are card-local: four cards
     in a row all report their rules text at the same x. Anything reasoning
     about WHERE something landed on the stage needs the transform, so the stub
     keeps one — a 2x3 matrix and a save/restore stack, same as the real thing. */
  let m = [1, 0, 0, 1, 0, 0];
  let bb = null, circ = null, nSeg = 0, roundRect = 0;
  const stack = [];
  const mul = (n) => [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5]];
  const at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const zoom = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  /* A COARSE RASTER, WHICH IS WHAT GROUND ATTRIBUTION ACTUALLY NEEDED.

     The contrast check pairs each glyph with the shape under it, and for two
     rounds it did that by asking which filled path's BOUNDING BOX contained the
     point. That is wrong for the shapes this game is made of: a creature is a
     multi-segment blob whose box reaches well past its ink, so a label drawn
     under its feet was attributed to the creature and read as 1.2:1 against a
     colour that is not behind it.

     So the stub keeps a grid — one cell every eight stage units — and every
     fill stamps its own colour into the cells it covers, in draw order. Reading
     the cell under a glyph gives the last colour actually written there, which
     is what a screen would show. Circles stamp as circles; everything else
     stamps as its box, which for panels and bands is exact. It is about forty
     lines and it makes every attribution right rather than most of them. */
  /* THREE TUNABLE CONSTANTS, ALL THREE NOW SWEPT — AND FROZEN HERE.

     The cell size, the share a ground must cover to count (in the render
     suite), and the vertical extent of the measurement band are numbers
     somebody picked, and for a round only one of them had been swept. A clean
     bill of health from three unswept numbers is a coincidence until it is
     shown not to be. All three take an override so the sweep can be repeated:

       FF_CELL       clean 6–16, shipped 8   · 16 failures at 2 and 4, 2 at 24
       FF_SHARE      clean 0.15–0.60+, 0.25  · 16 at 0.05, 7 at 0.10
       FF_BAND_UP/DN clean ±0.15–±0.55, 0.35 · no failure anywhere in range

     The band does not matter at all, the share has a floor, and the cell has a
     WINDOW with the shipped value in the middle of it. Outside that window the
     same three strings surface every time — warden and leader names whose band
     overlaps the creature drawn above them — and which colour wins is decided by
     resolution, which is the honest limit of a raster this coarse. */
  const CELL = Number(process.env.FF_CELL || 8);
  /* The band is SYMMETRIC because `txt` sets textBaseline = 'middle' for every
     string in the game — a fact that was worth checking and had not been. The
     first version used −0.38/+0.28, guessing at an alphabetic baseline, so it
     looked a tenth of a line too high on every label in the file. Cap height is
     about 0.7em, so ±0.35 is the glyph box. */
  const BAND_UP = Number(process.env.FF_BAND_UP || 0.35);
  const BAND_DN = Number(process.env.FF_BAND_DN || 0.35);
  const GW = Math.ceil(1920 / CELL), GH = Math.ceil(800 / CELL);
  const grid = new Array(GW * GH).fill(null);
  /* ONLY WHAT THE GRID CAN REPRESENT EXACTLY.

     A rectangle and a circle stamp truthfully. A multi-segment blob does not —
     its box reaches well past its ink, and stamping the box is the same lie the
     bounding-box lookup told, just at cell resolution. So a path that is not a
     single arc does not stamp at all: the ground under a glyph is then whatever
     rectangle or circle was painted there, and a creature never claims a label
     drawn below its feet. The cost is that text drawn ON a blob has no ground
     and falls back to its outline, which is the conservative direction. */
  /* A WASH IS NOT A GROUND. `globalAlpha` was honoured and the alpha inside an
     `rgba()` string was not, so a 16%-opacity tint stamped as though it were
     solid and the text over it was measured against a colour no screen ever
     shows. Same rule for both: below 0.9 it tints what is under it rather than
     replacing it. */
  const solid = (col) => {
    const m2 = /^rgba?\(([^)]+)\)/.exec(col);
    if (!m2) return true;
    const parts = m2[1].split(',');
    return parts.length < 4 || parseFloat(parts[3]) > 0.9;
  };
  const stamp = (box, cc, col, alpha, exact) => {
    if (!exact || !box || alpha <= 0.9 || typeof col !== 'string' || !solid(col)) return;
    const x0 = Math.max(0, Math.floor(box[0] / CELL)), x1 = Math.min(GW - 1, Math.ceil(box[2] / CELL));
    const y0 = Math.max(0, Math.floor(box[1] / CELL)), y1 = Math.min(GH - 1, Math.ceil(box[3] / CELL));
    if ((x1 - x0) * (y1 - y0) > 40000) return;          // a full-screen wash, not a ground
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        if (cc) {
          const dx = (gx + 0.5) * CELL - cc[0], dy = (gy + 0.5) * CELL - cc[1];
          if (dx * dx + dy * dy > cc[2] * cc[2]) continue;
        }
        grid[gy * GW + gx] = col;
      }
    }
  };
  const groundAt = (x, y) => {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return null;
    return grid[gy * GW + gx];
  };
  /* WHAT AN EIGHT-UNIT CELL COSTS, AND THE ANSWER TO IT.

     A cell is 8 stage units and a line of body type is about 13 tall and tens
     wide, so almost every string covers several cells and a great many straddle
     a boundary. Reading only the cell under the anchor is therefore a guess
     wherever a glyph crosses two grounds — a caption half on a panel and half
     off reports whichever half its anchor landed in, and it reports it with the
     same confidence as a string sitting in the middle of one colour.

     So the lookup returns every ground the string covers WITH HOW MUCH OF IT
     each one covers, and the check takes the worst of the ones that actually
     carry the text. A share is needed because the box is approximate in both
     directions: the stub does not track textBaseline, so the vertical extent is
     a band around the anchor rather than a true glyph box, and a band that
     wide clips the pip on the row above. Taking the worst of everything the
     band touches turned seventeen legible labels into failures on the first
     run — the ground under a caption is what most of the caption sits on, not
     whatever grazed one corner of it. */
  const groundsUnder = (x, y, w, size) => {
    const x0 = Math.max(0, Math.floor(x / CELL)), x1 = Math.min(GW - 1, Math.floor((x + w) / CELL));
    const y0 = Math.max(0, Math.floor((y - size * BAND_UP) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + size * BAND_DN) / CELL));
    const seen = new Map();
    let cells = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        cells++;
        const c = grid[gy * GW + gx];
        if (c) seen.set(c, (seen.get(c) || 0) + 1);
      }
    }
    return { cells, cols: [...seen].map(([col, n]) => ({ col, share: n / Math.max(1, cells) })) };
  };
  const grow = (x, y) => {
    const p = at(x, y);
    if (!bb) bb = [p[0], p[1], p[0], p[1]];
    else {
      bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]);
      bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]);
    }
  };
  return new Proxy({}, {
    get(_t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return (s) => ({ width: advance(s, st.size, st.face) });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'canvas') return { width: 1280, height: 720 };
      /* save/restore has to carry the STYLE as well as the transform. It did
         not, and the consequence was invisible and total: one `globalAlpha =
         0.35` anywhere in a frame stayed 0.35 for every draw after it, so the
         contrast check — which skips deliberately faded text — skipped almost
         everything. Thirteen of fifteen strings on the title screen were never
         looked at. */
      if (k === 'save') return () => { stack.push([m.slice(), st.fill, st.alpha, st.size, st.align, st.face]); };
      if (k === 'restore') return () => {
        if (!stack.length) return;
        const p = stack.pop();
        m = p[0]; st.fill = p[1]; st.alpha = p[2]; st.size = p[3]; st.align = p[4]; st.face = p[5];
      };
      if (k === 'translate') return (x, y) => { m = mul([1, 0, 0, 1, x, y]); };
      if (k === 'scale') return (x, y) => { m = mul([x, 0, 0, y, 0, 0]); };
      if (k === 'rotate') return (a) => { m = mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); };
      if (k === 'setTransform') return (...a) => { m = a.length === 6 ? a.slice() : [1, 0, 0, 1, 0, 0]; };
      if (k === 'resetTransform') return () => { m = [1, 0, 0, 1, 0, 0]; };
      if (log && k === 'fillText') {
        return (s, x, y) => {
          const p = at(x, y);
          const size = st.size * zoom();
          const w = advance(String(s), size, st.face);  // the same advance measureText reports
          const left = st.align === 'center' ? p[0] - w / 2 : st.align === 'right' ? p[0] - w : p[0];
          log.push(['fillText', s, p[0], p[1], size, st.align, st.fill, st.alpha,
            groundAt(p[0], p[1]), groundsUnder(left, p[1], w, size)]);
        };
      }
      /* The colour a shape was painted in AND WHERE, so something can ask
         whether the text over it is readable. Pairing ink to ground by draw
         order alone is wrong — a panel is drawn, then labels somewhere else —
         so the stub keeps a bounding box for the current path and reports it
         when the path is filled. */
      /* A bounding box is not a shape, and for this game's art the difference
         matters: a creature's body is one big arc, and the label drawn under
         its feet falls inside that arc's BOX while sitting on the panel behind
         it. Three "failures" in the contrast check were exactly that. So a path
         that is a single arc and nothing else records its centre and radius, and
         the ground lookup tests the circle rather than the box. */
      if (k === 'clearRect') return () => { grid.fill(null); };
      if (k === 'beginPath') return () => { bb = null; circ = null; nSeg = 0; roundRect = 0; };
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => { nSeg++; grow(x, y); };
      if (k === 'rect') return (x, y, w, h) => { nSeg++; grow(x, y); grow(x + w, y + h); };
      if (k === 'arc') return (x, y, r) => {
        nSeg++;
        const p0 = at(x, y);
        circ = nSeg === 1 ? [p0[0], p0[1], r * zoom()] : null;
        grow(x - r, y - r); grow(x + r, y + r);
      };
      if (k === 'ellipse') return (x, y, rx, ry) => { nSeg++; circ = null; grow(x - rx, y - ry); grow(x + rx, y + ry); };
      /* `arcTo` was untracked, so every rounded rectangle in the game — which is
         every panel, plate and slab — had a null bounding box and stamped
         NOTHING into the raster. The contrast check could see fillRects and
         circles and was blind to the one shape the UI is actually made of. It
         surfaced the moment a bright backdrop went behind a panel: pale text on
         a dark plate still read against the sky, at 1.0:1. */
      if (k === 'arcTo') return (x1, y1, x2, y2) => { nSeg++; roundRect++; circ = null; grow(x1, y1); grow(x2, y2); };
      if (k === 'quadraticCurveTo') return (_a, _b, x, y) => { nSeg++; circ = null; grow(x, y); };
      if (k === 'bezierCurveTo') return (_a, _b, _c, _d, x, y) => { nSeg++; circ = null; grow(x, y); };
      if (log && k === 'fill') {
        return () => {
          /* ROUNDED RECTS DELIBERATELY DO NOT STAMP, and it was tried.

             `rr` is what every panel, plate and slab is made of, so letting it
             stamp looks like an obvious widening. It made attribution WORSE:
             53 failures, nearly all of them wrong. A slab is a rounded rect and
             the badges drawn ON it are hand-built paths that do not stamp, so
             the slab won every lookup — a health number on a green shield was
             reported against the slab body at 1.2:1. The rule holds only while
             the shapes that do not stamp are also not the ones text sits on,
             and stamping the big shapes breaks exactly that. Reverted; the
             experiment is in DESIGN.md under DEAD ENDS. */
          stamp(bb, circ, st.fill, st.alpha, !!circ);
          log.push(['fill', st.fill, st.alpha, bb && bb.slice(), circ && circ.slice()]);
        };
      }
      if (log && k === 'fillRect') {
        return (x, y, w, h) => {
          const p0 = at(x, y), p1 = at(x + w, y + h);
          const box = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]),
            Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
          stamp(box, null, st.fill, st.alpha, true);
          log.push(['fillRect', st.fill, st.alpha, box]);
        };
      }
      if (log && k === 'strokeText') {
        return (s2, x, y) => { log.push(['strokeText', s2, x, y, st.stroke]); };
      }
      if (log && k === 'stroke') {
        return (...a) => { log.push(['stroke', ...a]); };
      }
      return noop;
    },
    set(_t, k, v) {
      if (k === 'font') {
        const m = /([\d.]+)px/.exec(String(v));
        if (m) st.size = parseFloat(m[1]);
        st.face = /Frostcut/.test(String(v)) ? 'd' : 't';
      } else if (k === 'textAlign') st.align = v;
      else if (k === 'fillStyle') st.fill = typeof v === 'string' ? v : '#888';
      else if (k === 'strokeStyle') st.stroke = typeof v === 'string' ? v : '#000';
      else if (k === 'globalAlpha') st.alpha = v;
      return true;
    },
  });
}

/** Fresh game instance. `store` is the localStorage backing object. */
export function loadGame(store = {}, ctxLog = null) {
  const html = readFileSync(GAME, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline <script> found in frostfell/index.html');
  const code = m[1];

  const ctx = mkCtx(ctxLog);
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [], className: '', innerHTML: '', textContent: '',
    width: 1280, height: 720,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: (k) => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.setTimeout = global.setTimeout || ((f) => { f(); return 0; });
  global.devicePixelRatio = 1;
  global.innerWidth = 1280; global.innerHeight = 720;
  global.screen = { orientation: { lock: () => ({ catch: noop }) } };
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(), readyState: 'complete',
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop,
    body: mkEl(), documentElement: mkEl(),
  }, { get(t, k) { return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__FF_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  const FF = globalThis.FF;
  FF.ctx = ctx;
  return FF;
}

/** A run that has skipped the menus: seeded, tribe chosen, ready to fight. */
export function withRun(FF, tribe = 'hearth', seed = 12345) {
  FF.newRun(FF.G, tribe, seed);
  return FF.G.run;
}

/** Put a specific unit on the board without going through the hand. */
export function place(FF, side, defId, lane, col, patch) {
  const card = side === 'p' ? FF.mkCard(defId) : FF.mkFoeCard(defId, 1);
  Object.assign(card, patch && patch.card ? patch.card : {});
  const u = FF.mkUnit(card, side, lane, col);
  Object.assign(u, patch && patch.unit ? patch.unit : {});
  // A suite that hands a unit more health than it can hold is describing a
  // state the game never produces — and anything that heals will clamp it
  // straight back down, which reads as mystery damage. Raise the ceiling to
  // match whatever the fixture asked for.
  if (u.hp > u.maxHp) u.maxHp = u.hp;
  FF.G.battle.units.push(u);
  return u;
}

/** An empty battle with just the leader, for hand-built board states. */
export function bareBattle(FF, tribe = 'hearth', seed = 7) {
  withRun(FF, tribe, seed);
  const b = FF.startBattle(FF.G, 'fight');
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  b.over = false; b.won = false; b.busy = false;
  return b;
}

/** A foe that exists only so the battle does not end the moment a suite
 *  clears the board: no attack, a counter that never lands, health to spare.
 *  Parked at the back of the bottom lane, out of most targeting's way. */
export function dummy(FF, lane = 1, col = 2) {
  return place(FF, 'e', 'snapfrost', lane, col, { unit: { hp: 9999, maxHp: 9999, atk: 0, cnt: 999, cntMax: 999 } });
}

// ---- tiny assert kit ---------------------------------------------------
let pass = 0;
const fails = [];
export function ok(cond, label) {
  if (cond) { pass++; return; }
  fails.push(label);
  console.error('  ✗ ' + label);
}
export const eq = (a, b, label) => ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
export const near = (a, b, tol, label) => ok(Math.abs(a - b) <= tol, `${label} (got ${a}, want ${b}±${tol})`);
export function done(name) {
  for (const [nm, ms] of sectionTimes().sort((a, b) => b[1] - a[1])) {
    if (ms >= 100) console.log(`    ${String((ms / 1000).toFixed(1) + 's').padStart(7)}  ${nm}`);
  }
  if (fails.length) {
    console.error(`\n${name}: ${fails.length} FAILED, ${pass} passed`);
    process.exit(1);
  }
  console.log(`${name}: ${pass} checks passed`);
}
/* SECTIONS TIME THEMSELVES WHEN ASKED. `FF_TIME=1` prints how long each one
   took, which is the only way to answer "where does the probe's minute go" —
   guessing at it produced a confidently wrong answer one round ago (three
   sweeps were blamed and all three are off by default). Silent otherwise, so
   the normal output is unchanged and diffable. */
const TIMING = !!process.env.FF_TIME;
let secT = 0, secName = null;
const secs = [];
export const section = (s) => {
  if (TIMING) {
    const now = Date.now();
    if (secName) secs.push([secName, now - secT]);
    secName = s; secT = now;
  }
  console.log('  · ' + s);
};
export function sectionTimes() {
  if (!TIMING) return [];
  if (secName) { secs.push([secName, Date.now() - secT]); secName = null; }
  return secs;
}
