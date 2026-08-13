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
  return new Proxy({}, {
    get(_t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (log && (k === 'fillText' || k === 'strokeText' || k === 'fill' || k === 'stroke' || k === 'arc' || k === 'fillRect')) {
        return (...a) => { log.push([k, ...a]); };
      }
      return noop;
    },
    set() { return true; },
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
