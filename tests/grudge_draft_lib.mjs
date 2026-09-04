// Shared loader for the Grudge Draft suites.
//
// grudge_draft/index.html is one self-contained file: markup, CSS and a single
// inline <script>.  This pulls the script out, stubs a DOM (a no-op 2d context
// and a queued setTimeout the caller flushes by hand), injects a test-only
// expose hook that never ships, and evals it, so the suites drive the game's
// own code rather than a copy of it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'grudge_draft', 'index.html');

const BOOT_TAIL = `loadSave();
buildCrowd();
bindUI();
fit();
toTitle();
requestAnimationFrame(loop);`;

const EXPOSE = `__out.api = {
  G, B, ROSTER, POOL, BY_ID, CLIQUES, CLIQUE_KEYS, FOES, RAR_W, DOWN_LINES,
  SAVE_KEY, STEP, FW, FH, ROUND_CAP, SUDDEN, OT_RATE, DMG_GLOBAL, NERVES, PANICS, PICKS,
  VIEW, RSCALE, CROWD, overtime,
  get SAVE(){ return SAVE; },
  reseed, rnd, pick,
  cliqueCount, cliqueTier, cliqueFx, mkUnit, abOf, deploy, startBattle, simStep,
  dmgOf, rateOf, spdOf, chooseTarget, blindOn, biggestFoe, hurt, killUnit, splash,
  attack, abilityTick, checkOver, sideStanding, sideHealth, bestUnit, dist2,
  rollOne, rollOffers, newOffers, foeScore, foeDraft, takePick, panicReroll,
  loadSave, writeSave, bookOf, show, toTitle, toLadder, toBook, toHelp,
  startMatch, beginDraft, beginFight, endRound, showRoundEnd, nextRound, showMatchEnd,
  banner, syncHud, renderTray, renderCards, renderSquad, chipRow, syncTug, renderSyn, renderLadder, renderBook,
  sfx, fit, draw, drawConfetti, depth, shade, drawPerson, drawPortrait, drawStreet, drawCrowd,
  drawProp, drawHair, drawHat, buildCrowd, loop, bindUI,
};
`;

/* ------------------------------ sandbox ---------------------------------- */
function makeSandbox(opts){
  opts = opts || {};
  const counts = {};
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, {
    get(t, p){
      if (p === 'measureText') return () => ({ width: 40 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      if (p === 'canvas') return { width: 640, height: 360 };
      if (typeof p === 'string' && p !== 'then' && !(p in t))
        return () => { counts[p] = (counts[p] || 0) + 1; };
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
  const mkEl = () => {
    const e = {
      style: {}, textContent: '', innerHTML: '', width: 150, height: 150,
      className: '', dataset: {}, disabled: false,
      clientWidth: 380, clientHeight: 260,
      getContext: () => ctxStub,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 380, height: 260 }),
      addEventListener(t, fn){ (this._h || (this._h = {}))[t] = fn; },
      removeEventListener(){}, removeAttribute(){}, setAttribute(){},
      querySelector: () => mkEl(),
      querySelectorAll: () => [],
      appendChild(){}, remove(){},
      classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    };
    return e;
  };
  const nodes = {};
  const store = Object.assign({}, opts.store || {});
  const timers = [];
  const sandbox = {
    document: {
      documentElement: mkEl(),
      getElementById: (id) => (nodes[id] || (nodes[id] = mkEl())),
      createElement: () => mkEl(),
      querySelectorAll: () => [],
      addEventListener(){},
    },
    window: { innerWidth: 400, innerHeight: 780, devicePixelRatio: 2, addEventListener(){} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    requestAnimationFrame: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    __out: {},
  };
  return { sandbox, store, counts, nodes, timers, mkEl };
}

let SRC = null;
function source(){
  if (SRC) return SRC;
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error('no inline script found in the game');
  const src = blocks.join('\n');
  if (!src.includes(BOOT_TAIL)) throw new Error('boot tail anchor missing from game script');
  SRC = src.replace(BOOT_TAIL, EXPOSE + BOOT_TAIL);
  return SRC;
}
function boot(opts){
  const { sandbox, store, counts, nodes, timers } = makeSandbox(opts);
  new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'setTimeout', '__out', source())(
    sandbox.window, sandbox.document, sandbox.localStorage,
    sandbox.requestAnimationFrame, sandbox.setTimeout, sandbox.__out);
  const api = sandbox.__out.api;
  api._store = store; api._counts = counts; api._nodes = nodes; api._timers = timers;
  api._flush = () => { const q = timers.splice(0); q.forEach(fn => fn()); };
  api._resetCounts = () => { for (const k in counts) delete counts[k]; };
  return api;
}


export { boot, makeSandbox, source, HTML };
