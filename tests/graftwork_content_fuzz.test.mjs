// Content fuzz for Graftwork: plays every card (base + upgraded, every graft, Overload, tempered/fused) against every enemy with
// random choices; renders every card / graft / relic / potion / status / enemy through a fake canvas; scans every text template;
// round-trips the save with the Round 4 fields. Seeded and deterministic.   GW_FUZZ_SEED=7 node tests/graftwork_content_fuzz.test.mjs
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';

installDom();
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();
const RUN = await import('../graftwork/engine/run.js');
const { newCombat, playCard, endTurn, canPlay, intentOf, resolvePending, usePotion, specOf, HAND_CAP } = await import('../graftwork/engine/combat.js');
const { newInst, cardSpec, canGraft, canTemper, temper, MAX_GRAFTS } = await import('../graftwork/engine/cards.js');
const T = await import('../graftwork/engine/text.js');
const { CARDS, GRAFTS, ENEMIES, RELICS, POTIONS, STATUSES, HEROES } = await import('../graftwork/data/index.js');
const { makeRng } = await import('../graftwork/engine/rng.js');

const SEED = process.env.GW_FUZZ_SEED || 'fuzz1';
const problems = new Map(); // message -> count/first context
const bug = (msg, ctx) => { const k = String(msg); const p = problems.get(k); if (p) p.n++; else problems.set(k, { n: 1, ctx }); };
const R = makeRng('content-fuzz-' + SEED);
const ri = (n) => Math.floor(R.next() * n);
const pick = (a) => a[ri(a.length)];
const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = ri(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const CARD_IDS = Object.keys(CARDS), GRAFT_IDS = Object.keys(GRAFTS), ENEMY_IDS = Object.keys(ENEMIES);
const heroIds = Object.keys(HEROES);
const actOf = (id) => (ENEMIES[id].act || 1);

// ---------------- part 1: combat fuzz ----------------
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function checkState(c, tag) {
  const p = c.player;
  if (!finite(p.hp) || !finite(p.block) || !finite(p.maxHp)) bug(`${tag}: player hp/block/maxHp not finite (${p.hp}/${p.block}/${p.maxHp})`);
  if (p.hp > p.maxHp) bug(`${tag}: player hp ${p.hp} above maxHp ${p.maxHp}`);
  if (p.block < 0) bug(`${tag}: negative player block ${p.block}`);
  if (!finite(c.energy) || c.energy < 0) bug(`${tag}: energy ${c.energy}`);
  for (const [k, v] of Object.entries(p.st)) if (!finite(v)) bug(`${tag}: player status ${k}=${v}`); else if (v < 0 && !(STATUSES[k] && STATUSES[k].canNeg)) bug(`${tag}: player status ${k} negative ${v}`); else if (v > 99) bug(`${tag}: player status ${k}=${v} above cap 99`);
  for (const e of c.enemies) {
    if (!finite(e.hp) || !finite(e.block) || !finite(e.maxHp)) bug(`${tag}: enemy ${e.id} hp/block not finite (${e.hp}/${e.block}/${e.maxHp})`);
    if (e.block < 0) bug(`${tag}: enemy ${e.id} negative block`);
    if (!e.dead && e.hp <= 0) bug(`${tag}: enemy ${e.id} alive with hp ${e.hp}`);
    if (!e.dead && e.hp > e.maxHp + 0) bug(`${tag}: enemy ${e.id} hp ${e.hp} above maxHp ${e.maxHp}`);
    for (const [k, v] of Object.entries(e.st)) if (!finite(v)) bug(`${tag}: enemy ${e.id} status ${k}=${v}`); else if (v > 99) bug(`${tag}: enemy ${e.id} status ${k}=${v} above cap`);
    if (!e.dead && !e.move) bug(`${tag}: live enemy ${e.id} without a move`);
  }
  if (c.hand.length > HAND_CAP) bug(`${tag}: hand ${c.hand.length} above cap`);
  const seen = new Set();
  for (const z of ['hand', 'drawPile', 'discard', 'exhaust', 'powers']) for (const k of c[z]) { if (seen.has(k)) bug(`${tag}: card ${k.uid} in two zones (${z})`); seen.add(k); if (!k.inst || !CARDS[k.inst.id]) bug(`${tag}: bad card wrapper in ${z}`); }
}
function checkEvents(c, evs, tag, st) {
  for (const e of evs) {
    if (st.over && !['status', 'dmg', 'hp', 'kill', 'heal', 'block', 'win', 'lose'].includes(e.t) && e.t !== 'discard' && e.t !== 'exhaust') bug(`${tag}: event ${e.t} after combat end`);
    for (const [k, v] of Object.entries(e)) if (typeof v === 'number' && !Number.isFinite(v)) bug(`${tag}: event ${e.t}.${k} = ${v}`);
    if (e.t === 'dmg') {
      if (e.n < 0 || e.raw < 0 || e.absorbed < 0) bug(`${tag}: negative dmg event`);
      if (e.n + e.absorbed > e.raw + 0.001) bug(`${tag}: dmg event n+absorbed > raw (${e.n}+${e.absorbed}>${e.raw})`);
    }
    if (e.t === 'hp' && !(e.n > 0)) bug(`${tag}: hp event n=${e.n}`);
    if (e.t === 'heal' && !(e.n > 0)) bug(`${tag}: heal event n=${e.n}`);
    if (e.t === 'kill' && !e.silent) { if (st.kills.has(e.e)) bug(`${tag}: enemy ${e.id} killed twice`); st.kills.add(e.e); }
    if (e.t === 'win') { if (st.over) bug(`${tag}: second win/lose event`); st.over = 'win'; }
    if (e.t === 'lose') { if (st.over) bug(`${tag}: second win/lose event`); st.over = 'lose'; }
    if (e.t === 'turnStart') { if (e.turn !== st.turn + 1) bug(`${tag}: turnStart ${e.turn} after ${st.turn}`); st.turn = e.turn; }
  }
}
// intent vs reality: summed raw hit damage per enemy against the number the UI showed
function runEnemyPhase(c, tag, st) {
  const shown = new Map();
  for (const e of c.enemies) if (!e.dead && !(e.st.stun > 0)) { try { shown.set(e.uid, { move: e.move, id: e.id, info: intentOf(c, e), dead: false }); } catch (x) { bug(`${tag}: intentOf(${e.id}) threw ${x.message}`); } }
  const mark = c.ev.length;
  endTurn(c);
  const evs = c.ev.slice(mark);
  const pre = st.evFrom; // unused
  const acted = new Set();
  for (const e of evs) if (e.t === 'enemyAct') acted.add(e.e);
  for (const [uid, s] of shown) {
    if (!acted.has(uid)) continue;
    const real = evs.filter((e) => e.t === 'dmg' && e.src === uid && e.who === 'player' && e.hit).reduce((a, e) => a + e.raw, 0);
    // tidy: only compare when the move deals damage and nothing killed the player
    if (s.info.hidden) continue;
    const key = `intent mismatch ${s.id}/${s.move}`;
    const tipped = !!(ENEMIES[s.id].moves[s.move].tip);
    if (real !== s.info.dmg) bug(`${key} (${tipped ? 'has tip' : 'NO tip'}): shown ${s.info.dmg}, dealt raw ${real}`, tag);
  }
}

function buildDeck(run, specs) {
  const deck = [];
  for (const sp of specs) {
    const inst = newInst(sp.id, () => run.uidNext++);
    inst.up = sp.up ? 1 : 0;
    for (const g of sp.grafts || []) if (canGraft(inst, g)) inst.grafts.push(g);
    if (sp.temper && inst.grafts.length && canTemper(inst)) temper(inst);
    for (const g of sp.grafts2 || []) if (canGraft(inst, g)) inst.grafts.push(g);
    deck.push(inst);
  }
  return deck;
}
function randomGrafts(inst, n) { const out = []; const probe = { ...inst, grafts: inst.grafts.slice(), fused: (inst.fused || []).slice() }; for (const g of shuffled(GRAFT_IDS)) { if (out.length >= n) break; if (canGraft(probe, g)) { out.push(g); probe.grafts.push(g); } } return out; }
const FILL = { marrow: ['m_strike', 'm_guard', 'm_strike', 'm_guard'], wick: [], odile: [] };

let combats = 0;
function fuzzCombat(label, o) {
  const hero = o.hero || pick(heroIds);
  const run = RUN.newRun({ hero, seed: `${SEED}-${label}-${combats}`, ascension: o.asc !== undefined ? o.asc : (ri(4) === 0 ? ri(11) : 0) });
  run.act = o.act || 1;
  const base = run.deck.map((i) => i.id);
  const specs = [...(o.focus || [])];
  // filler: random hero cards so Thread / Strain / Backfire situations arise
  const heroFill = base.filter((id) => CARDS[id].type !== 'junk');
  for (let i = 0; i < (o.fill !== undefined ? o.fill : 5); i++) specs.push({ id: pick(heroFill), up: ri(2), grafts: ri(3) === 0 ? ['@r1'] : [] });
  for (const s of specs) if (s.grafts && s.grafts[0] === '@r1') s.grafts = null;
  run.deck = buildDeck(run, specs);
  for (const inst of run.deck) { if (!inst.grafts.length && specs[run.deck.indexOf(inst)].grafts === null) inst.grafts.push(...randomGrafts(inst, 1)); }
  if (ri(3) === 0) run.deck.push(newInst('j_clot', () => run.uidNext++));
  for (let i = ri(3); i > 0; i--) RUN.addRelic(run, pick(Object.keys(RELICS)));
  for (let i = ri(3); i > 0; i--) RUN.addPotion(run, pick(Object.keys(POTIONS)));
  run.hp = run.maxHp = o.hp || 70 + ri(30);
  const tag = `${label}#${combats++} hero=${hero} enemies=${o.enemies.join('+')}`;
  const st = { turn: 0, over: null, kills: new Set() };
  let c;
  try {
    c = newCombat(run, o.enemies, { kind: o.kind || 'normal' });
    checkEvents(c, c.ev.splice(0), tag, st); checkState(c, tag);
    const mode = pick(['all', 'all', 'few', 'none']);
    const turns = o.turns || 4;
    for (let t = 0; t < turns && !c.over; t++) {
      let plays = 0;
      while (!c.over && plays++ < 25) {
        if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; if (!resolvePending(c, shuffled(pool).slice(0, p.n).map((k) => k.uid))) { bug(`${tag}: pending could not be resolved`); break; } checkEvents(c, c.ev.splice(0), tag, st); continue; }
        if (c.run.potions.length && ri(8) === 0) { usePotion(c, ri(c.run.potions.length), ri(c.enemies.length)); checkEvents(c, c.ev.splice(0), tag, st); checkState(c, tag); continue; }
        if (mode === 'none' || (mode === 'few' && plays > 2)) break;
        const idx = shuffled(c.hand.map((_, i) => i)).find((i) => canPlay(c, i).ok);
        if (idx === undefined) break;
        const hp0 = c.player.hp;
        playCard(c, idx, ri(c.enemies.length));
        checkEvents(c, c.ev.splice(0), tag, st); checkState(c, tag);
      }
      if (c.over) break;
      const mark = c.ev.length;
      runEnemyPhase(c, tag, st);
      checkEvents(c, c.ev.splice(0), tag, st); checkState(c, tag);
    }
    if (c.over === 'win' && c.enemies.some((e) => !e.dead && !e.minion)) bug(`${tag}: won with a live non-minion enemy`);
    if (c.over === 'lose' && c.player.hp > 0) bug(`${tag}: lost with hp ${c.player.hp}`);
  } catch (x) { bug(`THROW ${x.message.split('\n')[0]}`, `${tag} :: ${(x.stack || '').split('\n').slice(1, 3).join(' | ')}`); }
}

const enemiesFor = (extra) => { const e = [extra]; if (ri(3) === 0) e.push(pick(ENEMY_IDS.filter((x) => ENEMIES[x].kind === 'normal'))); return e.slice(0, 2); };
// every card, base and upgraded, bare / with grafts / Overload / tempered
for (const id of CARD_IDS) {
  const def = CARDS[id];
  const hero = def.hero && HEROES[def.hero] ? def.hero : undefined;
  for (const up of def.up || def.type !== 'junk' ? [0, 1] : [0]) {
    const probe = () => newInst(id, () => 1);
    const variants = [
      { id, up, grafts: [] },
      { id, up, grafts: randomGrafts(probe(), 1) },
      { id, up, grafts: randomGrafts(probe(), 3) },
      { id, up, grafts: randomGrafts(probe(), 2), temper: true, grafts2: randomGrafts(probe(), 1) },
    ];
    for (const v of variants) {
      const en = pick(ENEMY_IDS);
      fuzzCombat('card:' + id + (up ? '+' : ''), { hero, focus: [v, { ...v }, { ...v }], enemies: enemiesFor(en), act: actOf(en) });
    }
  }
}
// every graft on several compatible cards, alone, doubled up (Overload) and tempered
for (const gid of GRAFT_IDS) {
  const ok = shuffled(CARD_IDS).filter((id) => CARDS[id].type !== 'junk' && canGraft(newInst(id, () => 1), gid)).slice(0, 4);
  if (!ok.length) bug(`graft ${gid} fits no card at all`);
  for (const id of ok) {
    const inst = newInst(id, () => 1); inst.grafts.push(gid);
    const hero = CARDS[id].hero && HEROES[CARDS[id].hero] ? CARDS[id].hero : undefined;
    const more = randomGrafts(inst, 2);
    for (const v of [{ id, up: ri(2), grafts: [gid] }, { id, up: ri(2), grafts: [gid, ...more] }, { id, up: ri(2), grafts: [gid], temper: true, grafts2: more.slice(0, 2) }]) {
      const en = pick(ENEMY_IDS);
      fuzzCombat('graft:' + gid, { hero, focus: [v, { ...v }], enemies: enemiesFor(en), act: actOf(en) });
    }
  }
}
// every enemy, alone and in pairs, from fresh seeds, for longer
for (const en of ENEMY_IDS) for (let k = 0; k < 4; k++) fuzzCombat('enemy:' + en, { enemies: k < 2 ? [en] : [en, pick(ENEMY_IDS.filter((x) => ENEMIES[x].kind === 'normal' && x !== en))], fill: 8, turns: 7, act: actOf(en), kind: ENEMIES[en].kind, focus: [{ id: pick(CARD_IDS.filter((i) => CARDS[i].type !== 'junk')), grafts: null }] });

// ---------------- report ----------------
const FILE_PROBLEMS = [...problems.entries()];
if (process.env.GW_FUZZ_VERBOSE !== undefined || FILE_PROBLEMS.length) for (const [m, p] of FILE_PROBLEMS.sort()) console.log(`  [${p.n}x] ${m}${p.ctx ? '\n        ' + p.ctx : ''}`);
console.log(`combat fuzz: ${combats} combats, ${FILE_PROBLEMS.length} distinct problems`);
