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

export const HERE = dirname(fileURLToPath(import.meta.url));
export const GAME = process.env.FF_GAME || join(HERE, '..', 'frostfell', 'index.html');

const noop = () => {};

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
  let bb = null;
  const stack = [];
  const mul = (n) => [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5]];
  const at = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const zoom = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
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
      if (k === 'measureText') return (s) => ({ width: String(s).length * st.size * 0.5 });
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
          log.push(['fillText', s, p[0], p[1], st.size * zoom(), st.align, st.fill, st.alpha]);
        };
      }
      /* The colour a shape was painted in AND WHERE, so something can ask
         whether the text over it is readable. Pairing ink to ground by draw
         order alone is wrong — a panel is drawn, then labels somewhere else —
         so the stub keeps a bounding box for the current path and reports it
         when the path is filled. */
      if (k === 'beginPath') return () => { bb = null; };
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => grow(x, y);
      if (k === 'rect') return (x, y, w, h) => { grow(x, y); grow(x + w, y + h); };
      if (k === 'arc') return (x, y, r) => { grow(x - r, y - r); grow(x + r, y + r); };
      if (k === 'ellipse') return (x, y, rx, ry) => { grow(x - rx, y - ry); grow(x + rx, y + ry); };
      if (k === 'quadraticCurveTo') return (_a, _b, x, y) => grow(x, y);
      if (k === 'bezierCurveTo') return (_a, _b, _c, _d, x, y) => grow(x, y);
      if (log && k === 'fill') {
        return () => { log.push(['fill', st.fill, st.alpha, bb && bb.slice()]); };
      }
      if (log && k === 'fillRect') {
        return (x, y, w, h) => {
          const p0 = at(x, y), p1 = at(x + w, y + h);
          log.push(['fillRect', st.fill, st.alpha,
            [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])]]);
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
  if (fails.length) {
    console.error(`\n${name}: ${fails.length} FAILED, ${pass} passed`);
    process.exit(1);
  }
  console.log(`${name}: ${pass} checks passed`);
}
export const section = (s) => console.log('  · ' + s);
