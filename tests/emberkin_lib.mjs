// Headless loader for EMBERKIN.
//
// The game is one self-contained file (emberkin/index.html) that draws to a
// canvas and hangs its UI off DOM overlays. This stubs enough of a browser —
// including a no-op 2d context — to eval the inline <script> with
// __EK_HEADLESS__ set, so the suites drive the real functions through window.EK
// rather than a re-implementation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));
// EK_GAME points the loader at a copy — mutation sweeps need to load a mutant
// without editing the file in the working tree.
export const GAME = process.env.EK_GAME || join(HERE, '..', 'emberkin', 'index.html');

const noop = () => {};

export function mkCtx(log) {
  return new Proxy({}, {
    get(_t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'canvas') return { width: 256, height: 208 };
      // Transforms are logged too: a mirrored sprite is a scale(-1,1), and
      // that is the only way a suite can see which way somebody is facing.
      if (log && (k === 'drawImage' || k === 'fillRect' || k === 'scale' || k === 'translate'))
        return (...a) => { log.push([k, ...a]); };
      return noop;
    },
    set() { return true; },
  });
}

/** Fresh game instance. `store` is the localStorage backing object. */
export function loadGame(store = {}, patch = null) {
  const html = readFileSync(GAME, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline <script> found in emberkin/index.html');
  // `patch` rewrites the source before it is evalled, which is how the
  // playthrough probe runs a baseline and a variant of a tuning constant in one
  // sitting. Comparing a new build against a number from a previous pass is
  // worth about +/-.05 on the danger line; comparing two arms measured together
  // is not.
  const code = patch ? patch(m[1]) : m[1];

  const ctx = mkCtx();
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [], className: '', innerHTML: '', textContent: '',
    width: 256, height: 208,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 208 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: (k) => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.setInterval = () => 0;
  global.clearInterval = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 800; global.innerHeight = 600;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k) { return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__EK_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.EK;
}

/**
 * Play the current battle to its end the way a player would: spend every card
 * you can afford, then end the turn. Returns false if it never resolved.
 */
/**
 * Fight to the end, greedily but not stupidly.
 *
 * A kin may swing once a turn, so a bot that plays whatever is leftmost burns
 * its energy on the move and then has nothing to sharpen it with — which
 * measures the bot, not the game. Support first, then the swing: still greedy
 * (it spends an Edge whether or not the swing lands), but it no longer beats
 * itself.
 */
export function autoFight(EK, limit = 300) {
  let guard = 0;
  while (EK.G.battle && !EK.B().over && guard++ < limit) {
    const b = EK.B();
    const kinCost = () => {
      let c = Infinity;
      for (const h of b.hand) if (h.src === 'kin') c = Math.min(c, EK.cardCost(h));
      return c === Infinity ? 0 : c;
    };
    const spend = (reserve) => {
      for (let spun = 0; spun < 10; spun++) {
        if (b.over) break;
        const i = b.hand.findIndex((c) => c.src !== 'kin' && EK.cardCost(c) <= b.energy - reserve);
        if (i < 0) break;
        EK.playCard(i);
      }
    };
    spend(kinCost());
    if (!b.over) {
      const i = b.hand.findIndex((c) => c.src === 'kin' && EK.cardCost(c) <= b.energy);
      if (i >= 0) EK.playCard(i);
    }
    spend(0);
    if (b.over) break;
    EK.endTurn();
  }
  return guard < limit;
}

/** A fresh game with the starting deck dealt out, ready to fight. */
export function withDeck(EK) {
  EK.G.cards = []; EK.G.deck = []; EK.G.nextUid = 0;
  EK.STARTER_DECK.forEach(EK.grantCard);
  return EK;
}

// ---- tiny assert kit ---------------------------------------------------
let pass = 0;
const fails = [];
// EK_TRACE prints EVERY check, passing ones included.
//
// A suite that only prints its failures cannot tell you which of its checks are
// incapable of failing — five passes running produced one that was. The sweep
// in tools/emberkin/tautology.mjs runs the suite against mutants and asks which
// checks never once died; that question needs the whole roll call, not the
// exceptions to it.
const TRACE = !!process.env.EK_TRACE;
let ordinal = 0;
export function ok(cond, label) {
  if (TRACE) console.log(`@CHECK\t${ordinal++}\t${cond ? 'pass' : 'FAIL'}\t${sectionNow}\t${label}`);
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
let sectionNow = '(none)';
export const section = (s) => { sectionNow = s; console.log('  · ' + s); };
