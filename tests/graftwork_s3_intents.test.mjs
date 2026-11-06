// S3 late-game fixes: intent icons per move effect, the lethal warning maths, merged card text, the +cost badge, the new move tips.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, intentOf, lethalIncoming, addStatus } from '../graftwork/engine/combat.js';
import { intentIcons } from '../graftwork/engine/intent_icons.js';
import { ENEMIES, CARDS, GRAFTS } from '../graftwork/data/index.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { cardLines } from '../graftwork/engine/text.js';
import { fakeCtx, installDom } from './graftwork_lib.mjs';

installDom();
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const ks = (mv, info, o) => intentIcons(mv, info, o).map((i) => i.k + (i.hits > 1 ? 'x' + i.hits : ''));
const D = (n, extra = {}) => ({ op: 'dmg', n, ...extra });

// ---------- icon mapping (pure) ----------
await t('intent icons follow the move effect, not a bare sword', () => {
  const one = { kinds: ['attack'], dmg: 8, hits: 1, per: 8 };
  assert.deepEqual(ks({ fx: [D(8)] }, one, { maxHp: 80 }), ['attack']);
  assert.deepEqual(ks({ fx: [D(3, { hits: 3 })] }, { kinds: ['attack'], dmg: 9, hits: 3, per: 3 }, { maxHp: 80 }), ['multix3']);
  assert.deepEqual(ks({ fx: [D(6, { to: 'all' })] }, { kinds: ['attack'], dmg: 6, hits: 1, per: 6 }, { maxHp: 80 }), ['sweep']);
  assert.deepEqual(ks({ fx: [D(28)] }, { kinds: ['attack'], dmg: 28, hits: 1, per: 28 }, { maxHp: 80 }), ['heavy']);
  assert.deepEqual(ks({ fx: [D(14)] }, { kinds: ['attack'], dmg: 14, hits: 1, per: 14 }, { maxHp: 80 }), ['attack'], '14 of 80 is not heavy');
  assert.deepEqual(ks({ fx: [D(8), { op: 'status', s: 'weak', n: 1, to: 'player' }] }, { kinds: ['attack', 'debuff'], dmg: 8, hits: 1, per: 8 }), ['attack', 'debuff']);
  assert.deepEqual(ks({ fx: [{ op: 'block', n: 8, to: 'self' }, { op: 'status', s: 'strength', n: 2, to: 'self' }] }, { kinds: ['defend', 'buff'], dmg: 0, hits: 0 }), ['defend', 'buff']);
  assert.deepEqual(ks({ fx: [{ op: 'heal', n: 8 }] }, { kinds: ['unknown'], dmg: 0, hits: 0 }), ['heal']);
  assert.deepEqual(ks({ fx: [{ op: 'summon', id: 'x' }, D(4)] }, { kinds: ['attack', 'summon'], dmg: 4, hits: 1, per: 4 }), ['attack', 'summon']);
  assert.deepEqual(ks({ fx: [{ op: 'addCard', card: 'j_clot', n: 2 }] }, { kinds: ['junk'], dmg: 0, hits: 0 }), ['junk']);
  assert.deepEqual(ks({ fx: [{ op: 'status', s: 'poison', n: 3, to: 'player' }] }, { kinds: ['debuff'], dmg: 0, hits: 0 }), ['poison']);
  assert.deepEqual(ks({ fx: [{ op: 'custom', fn() {}, text: 'x' }] }, { kinds: ['unknown'], dmg: 0, hits: 0 }), ['special']);
  assert.deepEqual(ks({ hidden: true, fx: [D(8)] }, { kinds: ['attack'], dmg: 8, hits: 1, hidden: true }), ['unknown']);
  assert.equal(intentIcons({ fx: [D(5), { op: 'block', n: 5 }, { op: 'status', s: 'weak', n: 1 }, { op: 'heal', n: 1 }] }, { kinds: ['attack', 'defend', 'debuff'], dmg: 5, hits: 1 }).length, 3, 'at most three icons');
});

await t('every real move gets 1 to 3 icons and a wide spread of kinds', () => {
  const kinds = new Set(); let moves = 0;
  const run = RUN.newRun({ hero: 'marrow', seed: 's3i' }); run.relics = [];
  for (const def of Object.values(ENEMIES)) {
    let c; try { c = newCombat(run, [def.id]); } catch (e) { continue; }
    const e = c.enemies[0];
    for (const id of Object.keys(e.def.moves || {})) {
      e.move = id; let info; try { info = intentOf(c, e); } catch (x) { continue; }
      moves++; assert.ok(info.icons && info.icons.length >= 1 && info.icons.length <= 3, def.id + ':' + id);
      for (const i of info.icons) kinds.add(i.k + (i.k === 'unknown' ? '' : ''));
    }
  }
  assert.ok(moves > 150, 'moves scanned ' + moves);
  for (const k of ['attack', 'multi', 'heavy', 'defend', 'debuff', 'buff']) assert.ok(kinds.has(k), 'kind used by real data: ' + k + ' in ' + [...kinds]);
});

// ---------- lethal warning maths ----------
const mkEnemy = (id, fx, extra = {}) => { ENEMIES[id] = { id, name: id, act: 1, kind: 'normal', hp: 400, pattern: ['m'], moves: { m: { name: 'M', fx, ...extra } }, art: { body: 'figure', color: '#888' } }; return id; };
function fight(ids, hp, block = 0) {
  const run = RUN.newRun({ hero: 'marrow', seed: 's3l' }); run.relics = [];
  const c = newCombat(run, ids); c.run.hero = '';
  c.player.hp = hp; c.player.block = block; return c;
}
await t('lethal: sum of visible intents after Block against current HP', () => {
  const a = mkEnemy('s3_a', [D(10)]), b = mkEnemy('s3_b', [D(5, { hits: 2 })]);
  let c = fight([a, b], 20);
  let r = lethalIncoming(c); assert.equal(r.total, 20); assert.equal(r.net, 20); assert.equal(r.lethal, true, '20 incoming vs 20 HP');
  c = fight([a, b], 21); assert.equal(lethalIncoming(c).lethal, false);
  c = fight([a, b], 20, 1); r = lethalIncoming(c); assert.equal(r.net, 19); assert.equal(r.lethal, false, 'Block counts');
  c = fight([a, b], 20, 30); assert.equal(lethalIncoming(c).lethal, false);
});
await t('lethal: Vulnerable and Weak are applied, pierce ignores Block, hidden and dead intents are not counted', () => {
  const a = mkEnemy('s3_c', [D(10)]), p = mkEnemy('s3_p', [D(10, { pierce: true })]), h = mkEnemy('s3_h', [D(50)], { hidden: true });
  let c = fight([a], 15); addStatus(c, c.player, 'vulnerable', 3);
  let r = lethalIncoming(c); assert.equal(r.total, 15, 'x1.5 Vulnerable'); assert.equal(r.lethal, true);
  c = fight([a], 15); addStatus(c, c.enemies[0], 'weak', 2); r = lethalIncoming(c); assert.equal(r.total, 7, 'x0.75 Weak (floor)'); assert.equal(r.lethal, false);
  c = fight([p], 10, 40); r = lethalIncoming(c); assert.equal(r.net, 10); assert.equal(r.lethal, true, 'pierce ignores Block');
  c = fight([h], 10); assert.equal(lethalIncoming(c).total, 0, 'hidden intent not counted'); assert.equal(lethalIncoming(c).lethal, false);
  c = fight([a, a], 15); c.enemies[1].dead = true; assert.equal(lethalIncoming(c).total, 10, 'dead enemies do not count');
  c = fight([a], 0); assert.equal(lethalIncoming(c).lethal, false, 'no HP no warning');
});

// ---------- card text: no repeated sentences ----------
await t('merged text: same-effect lines add up, nothing repeats (every card x graft x upgrade)', () => {
  const lines = cardLines(cardSpec({ id: 'm_incision', up: false, grafts: ['g_nicked_vein'] }));
  assert.equal(lines.filter((l) => /Bleed/.test(l)).length, 1, JSON.stringify(lines));
  assert.ok(lines.some((l) => /Apply 5 Bleed/.test(l)), JSON.stringify(lines));
  const bad = [];
  for (const c of Object.values(CARDS)) for (const up of [false, true]) for (const g of [null, ...Object.keys(GRAFTS)]) {
    let ls; try { ls = cardLines(cardSpec({ id: c.id, up, grafts: g ? [g] : [] })); } catch (e) { continue; }
    const ss = ls.join(' ').split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean), seen = new Set();
    for (const s of ss) { if (seen.has(s)) { bad.push(`${c.id}${up ? '+' : ''} [${g}] ${s}`); break; } seen.add(s); }
  }
  assert.deepEqual(bad.slice(0, 5), [], 'repeated sentences');
  const liq = cardLines(cardSpec({ id: 'o_liquidate', up: false, grafts: [] })).join(' ');
  assert.match(liq, /Pay 15 gold/); assert.match(liq, /Deal 12 damage again/); assert.doesNotMatch(liq, /Gain -/);
});

// ---------- cost badge ----------
await t('a card whose cost is above its printed cost draws the red +cost badge, an even cost does not', async () => {
  const { drawCard } = await import('../graftwork/art/cards.js');
  const spec = cardSpec({ id: 'm_incision', up: false, grafts: [] });
  const run = (cost) => { const g = fakeCtx(); const seen = []; let fs = ''; Object.defineProperty(g, 'fillStyle', { get: () => fs, set: (v) => { fs = v; seen.push(String(v)); } }); drawCard(g, spec, 0, 0, { cost }); return seen; };
  assert.ok(run(spec.cost + 1).includes('#e0453a'), 'badge when cost is up');
  assert.ok(!run(spec.cost).includes('#e0453a'), 'no badge at the printed cost');
  assert.ok(!run(Math.max(0, spec.cost - 1)).includes('#e0453a') || spec.cost === 0, 'no badge when cost is down');
});

// ---------- move tips ----------
await t('Lid Crush has a tip, the Grafter mirror says it copies your card', async () => {
  assert.ok(ENEMIES.pickled_king.moves.crush.tip && /Brined/.test(ENEMIES.pickled_king.moves.crush.tip));
  assert.ok(!/—/.test(ENEMIES.pickled_king.moves.crush.tip));
  assert.match(ENEMIES.the_grafter.moves.mirror.tip, /copies your own card/);
  const run = RUN.newRun({ hero: 'marrow', seed: 'gm' }); run.relics = [];
  const c = newCombat(run, ['the_grafter']);
  assert.match(c.enemies[0].def.moves.mirror.tip, /copies your own card/, 'the per-fight mirror keeps the tip');
});

// ---------- tutorial bubble never covers a telegraph ----------
await t('a first-run tip slides clear of the enemy name, move and intent plates', async () => {
  const { makeApp, frames } = await import('./graftwork_lib.mjs');
  const { maybeTip } = await import('../graftwork/ui/tutorial.js');
  const app = await makeApp({ meta: { settings: {}, tips: {} } });
  frames(app, 2);
  const plate = { x: 480, y: 68, w: 200, h: 92 };
  maybeTip(app, 'energy', 100, 400, 'Energy pays for cards. You get 3 each turn.', { pos: { x: 470, y: 80 }, w: 250, maxBottom: 460, avoid: [plate] });
  const b = app._tipBox;
  assert.ok(b, 'tip drawn');
  assert.ok(b.x + b.w <= plate.x || b.x >= plate.x + plate.w || b.y + b.h <= plate.y || b.y >= plate.y + plate.h, `tip ${JSON.stringify(b)} overlaps the plate`);
});

console.log(`graftwork_s3_intents ok (${n})`);
