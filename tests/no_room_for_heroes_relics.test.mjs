// Regression guard: every No Room For Heroes relic bonus must actually land in the
// run. Loads the game's inline <script> in a stubbed DOM, applies each relic
// via addRelic(), and asserts that every rb key shows up in RB (live bonuses)
// and every one-time boon (hp / manaFlat / manaRegen / bossAtk) hits the boss.
//
//   node tests/no_room_for_heroes_relics.test.mjs   (or: npm run test:relics)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'no_room_for_heroes', 'index.html'), 'utf8');
let code = html.match(/<script>([\s\S]*)<\/script>/)[1];

// --- minimal DOM / browser stubs so the game script can evaluate headlessly ---
const noop = () => {};
const ctx = new Proxy({}, { get(_t, k) {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'canvas') return { width: 800, height: 480 };
  if (k === 'measureText') return () => ({ width: 10 });
  return noop;
} });
const mkEl = () => new Proxy({
  style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }), setPointerCapture: noop,
  querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '',
  width: 800, height: 480, children: [], dataset: {},
}, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
global.requestAnimationFrame = noop; global.cancelAnimationFrame = noop;
global.AudioContext = function () { return new Proxy({}, { get() { return () => new Proxy({}, { get() { return noop; } }); } }); };
global.webkitAudioContext = global.AudioContext;
// navigator/performance are read-only built-ins in modern Node — define, don't assign
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
if (typeof globalThis.performance?.now !== 'function') def('performance', { now: () => 0 });
def('navigator', { userAgent: 'node', maxTouchPoints: 0, vibrate: noop });
global.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
global.devicePixelRatio = 1;
global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
  querySelectorAll: () => [], addEventListener: noop, body: mkEl(), documentElement: mkEl(), hidden: false, visibilityState: 'visible' },
  { get(t, k) { return (k in t) ? t[k] : noop; } });
global.window = new Proxy(global, { get(t, k) { return (k in t) ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
global.window.addEventListener = noop;
global.setTimeout = () => 0; global.setInterval = () => 0; global.clearTimeout = noop; global.clearInterval = noop;

// the game uses top-level const/let; rebind to var so they land on the shared scope
code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
eval('(function(){' + code + '\nglobalThis.__api={freshGame,addRelic,recomputeRB,RELICS,BOSSES,get RB(){return RB;},get G(){return G;},set G(v){G=v;}};})()');

const A = globalThis.__api;
A.freshGame();
const G = A.G;

// rb keys read live from RB during gameplay — these take effect via recomputeRB
const liveKeys = new Set(['trapDmg', 'monDmg', 'monHp', 'abilDmg', 'abilCost', 'bossDR', 'bossRegen', 'goldKill', 'loot', 'dreadKill']);
const fails = [];
let tested = 0;

for (const id in A.RELICS) {
  const r = A.RELICS[id];
  G.relics = []; A.recomputeRB();
  const bb = A.BOSSES.dragon;
  G.boss = { key: 'dragon', ...bb, atk: bb.atk, hp: bb.maxHp, maxHp: bb.maxHp, mana: 60, maxMana: 100, manaRegen: 6, abil: [] };
  const beforeRB = { ...A.RB };
  const bs = { maxHp: G.boss.maxHp, atk: G.boss.atk, maxMana: G.boss.maxMana, manaRegen: G.boss.manaRegen };
  A.addRelic(id);
  const rb = r.rb || {};
  for (const k in rb) {
    if (liveKeys.has(k)) {
      const got = (A.RB[k] || 0) - (beforeRB[k] || 0);
      if (Math.abs(got - rb[k]) > 1e-9) fails.push(`${id}: RB.${k} expected +${rb[k]} got +${got.toFixed(3)}`);
    }
  }
  if (r.hp && (G.boss.maxHp - bs.maxHp) !== r.hp) fails.push(`${id}: hp +${r.hp} but maxHp Δ=${G.boss.maxHp - bs.maxHp}`);
  if (rb.manaFlat && (G.boss.maxMana - bs.maxMana) !== rb.manaFlat) fails.push(`${id}: manaFlat +${rb.manaFlat} but maxMana Δ=${G.boss.maxMana - bs.maxMana}`);
  if (rb.manaRegen && (G.boss.manaRegen - bs.manaRegen) !== rb.manaRegen) fails.push(`${id}: manaRegen +${rb.manaRegen} but Δ=${G.boss.manaRegen - bs.manaRegen}`);
  if (rb.bossAtk) { const exp = Math.round(bb.atk * rb.bossAtk); if ((G.boss.atk - bs.atk) !== exp) fails.push(`${id}: bossAtk ${rb.bossAtk} expected +${exp} got +${G.boss.atk - bs.atk}`); }
  if (rb.bossAtkFlat && (G.boss.atk - bs.atk) < rb.bossAtkFlat) fails.push(`${id}: bossAtkFlat not applied`);
  tested++;
}

if (fails.length) {
  console.error(`✗ ${fails.length} relic bonus(es) NOT applied:\n  ` + fails.join('\n  '));
  process.exit(1);
}
console.log(`✓ all ${tested} relic bonuses land in gameplay (every rb key + one-time boon).`);
