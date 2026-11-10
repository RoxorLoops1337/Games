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
const advisories = new Map();
const advisory = (k, ctx) => { if (!advisories.has(k)) advisories.set(k, { n: 0, ctx }); advisories.get(k).n++; };
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
    if (st.over && ['enemyAct', 'play', 'turnStart', 'intent', 'turnEnd'].includes(e.t)) bug(`${tag}: event ${e.t} after combat end`);
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
  const single = c.enemies.filter((e) => !e.dead).length === 1;
  const shown = new Map();
  for (const e of c.enemies) if (!e.dead && !(e.st.stun > 0)) { try { shown.set(e.uid, { move: e.move, id: e.id, str: e.st.strength || 0, snap: JSON.stringify({ e: e.st, p: c.player.st, en: c.energy, blk: c.player.block, relics: c.run.relics, strain: c.strain && c.strain.strain }), info: intentOf(c, e), tip: !!(e.def.moves[e.move] && e.def.moves[e.move].tip) }); } catch (x) { bug(`${tag}: intentOf(${e.id}) threw ${x.message}`); } }
  const mark = c.ev.length;
  endTurn(c);
  const evs = c.ev.slice(mark);
  const pre = st.evFrom; // unused
  const acted = new Set();
  for (const e of evs) if (e.t === 'enemyAct') acted.add(e.e);
  for (const [uid, s] of shown) {
    if (c.over === 'lose') continue; // the player died mid-phase: later hits never land
    if (c.enemies.some((x) => x.uid === uid && x.dead)) continue; // killed by its own thorns / burn mid-move
    if (!acted.has(uid) || shown.size > 1 || !single) continue; // several enemies buff, debuff and kill each other mid-phase: only lone enemies compare cleanly
    const from = evs.findIndex((e) => e.t === 'enemyAct' && e.e === uid); // start-of-turn status hits (the Broker's Offer) land before the move and are not part of it
    const act = evs[from];
    if (act && act.move !== s.move) continue; // a phase change (burn tick at its turn start) swapped the move after the intent was shown
    if (evs.slice(0, from).some((x) => x.t === 'dmg' && x.who === uid && x.hit)) continue; // end-of-turn payouts hit it first (Seam, relics): reactive moves (Weigh) change before they act
    if (evs.slice(0, from).some((x) => x.t === 'block' && x.who === 'player')) continue; // end-of-turn Block (Seam payout, relic) lands before the enemy reads it: conditions on Block (Fine) move
    const now = c.enemies.find((x) => x.uid === uid);
    if (now && (now.st.strength || 0) !== s.str) continue; // it gained or lost Strength during the phase (phase change, ritual): the shown number was right when shown
    const real = evs.slice(from).filter((e) => e.t === 'dmg' && e.src === uid && e.who === 'player' && e.hit).reduce((a, e) => a + e.raw, 0);
    // tidy: only compare when the move deals damage and nothing killed the player
    if (s.info.hidden) continue;
    const key = `intent mismatch ${s.id}/${s.move}`;
    const tipped = s.tip;
    if (real !== s.info.dmg) bug(`${key} (${tipped ? 'has tip' : 'NO tip'})`, `shown ${s.info.dmg}, dealt raw ${real} blocks ${JSON.stringify(evs.filter((x) => x.t === "block").map((x) => x.n))} hits ${JSON.stringify(evs.filter((x) => x.t === 'dmg' && x.src === uid && x.who === 'player').map((x) => x.raw))} ${s.snap}`);
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

// ---------------- part 2: render every spec through the fake canvas ----------------
const ART = { cards: await import('../graftwork/art/cards.js'), icons: await import('../graftwork/art/icons.js'), enemies: await import('../graftwork/art/enemies.js') };
const ctx = fakeCtx();
const tryDo = (what, f) => { try { f(); } catch (x) { bug(`RENDER ${what} threw ${String(x.message).split('\n')[0]}`, (x.stack || '').split('\n')[1]); } };
const wrapCount = (t, cols) => { let n = 1, w = 0; for (const word of String(t).split(' ')) { if (w + word.length + 1 > cols && w) { n++; w = 0; } w += word.length + 1; } return n; };
for (const id of CARD_IDS) for (const up of [0, 1]) for (const gs of [0, 1, 3]) {
  const inst = newInst(id, () => 1); inst.up = up;
  if (gs) inst.grafts.push(...randomGrafts(inst, gs));
  tryDo(`card ${id}`, () => ART.cards.drawCard(ctx, cardSpec(inst), 100, 100, {}));
  if (gs === 3 && inst.grafts.length === 3) { // Overload faces: estimated wrapped text lines against the ~8 line text box
    const sp = cardSpec(inst); const lines = [...T.cardLines(sp), ...T.priceLines(sp)];
    const n = lines.reduce((a, l) => a + wrapCount(l, 26), 0);
    if (n > 9) advisory(`overload face text long (${n} lines)`, `${id}${up ? '+' : ''} ${inst.grafts.join(',')}`);
  }
}
for (const g of GRAFT_IDS) tryDo(`graft ${g}`, () => ART.cards.drawGraftPatch(ctx, GRAFTS[g], 50, 50, 160, 60, {}));
for (const r of Object.keys(RELICS)) tryDo(`relic ${r}`, () => ART.icons.drawRelic(ctx, r, 50, 50, 40, RELICS[r].rarity));
for (const p of Object.keys(POTIONS)) tryDo(`potion ${p}`, () => ART.icons.drawPotion(ctx, p, 50, 50, 40));
for (const s of Object.keys(STATUSES)) { tryDo(`status ${s}`, () => ART.icons.drawStatus(ctx, s, 50, 50, 24, STATUSES[s].good)); if (!ART.icons.STATUS_IDS_DRAWN.includes(s)) advisory('status without a dedicated icon', s); }
for (const e of ENEMY_IDS) for (const t of [0, 1.3]) tryDo(`enemy ${e}`, () => ART.enemies.drawEnemy(ctx, ENEMIES[e], 300, 400, { t }));

// ---------------- part 3: text templates ----------------
const badText = (t) => (/undefined|\[object|NaN|null/.test(t) ? 'bad token' : / {2,}/.test(t) ? 'double space' : /\s$|^\s/.test(t) ? 'edge space' : '');
const scan = (what, t) => { if (typeof t !== 'string') return; const w = badText(t); if (w) bug(`TEXT ${what}: ${w}`, JSON.stringify(t).slice(0, 140)); };
for (const id of CARD_IDS) for (const up of [0, 1]) for (const gs of [0, 2, 3]) {
  const inst = newInst(id, () => 1); inst.up = up; if (gs) inst.grafts.push(...randomGrafts(inst, gs));
  tryDo(`text ${id}`, () => { const sp = cardSpec(inst); for (const l of [...T.cardLines(sp), ...T.cardLines(sp, true), ...T.priceLines(sp)]) scan(`card ${id}${up ? '+' : ''}${gs ? ' g' + gs : ''}`, l); scan('name ' + id, sp.name); scan('flavor ' + id, sp.flavor); });
}
for (const g of Object.values(GRAFTS)) { scan('graft boon ' + g.id, g.boon); scan('graft price ' + g.id, g.price); scan('graft name ' + g.id, g.name); }
for (const r of Object.values(RELICS)) { scan('relic ' + r.id, r.text); scan('relic name ' + r.id, r.name); }
for (const p of Object.values(POTIONS)) { scan('potion ' + p.id, p.text || p.desc); }
for (const s of Object.values(STATUSES)) for (const n of [1, 2, 5, 99]) tryDo(`status desc ${s.id}`, () => scan(`status ${s.id}(${n})`, T.statusText(s.id, n)));
for (const e of Object.values(ENEMIES)) for (const [mid, mv] of Object.entries(e.moves)) { scan(`move ${e.id}/${mid} name`, mv.name); scan(`move ${e.id}/${mid} tip`, mv.tip); scan(`move ${e.id}/${mid} note`, mv.note); }

// ---------------- part 4: save / load round trip ----------------
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'rt' });
  const a = run.deck.find((i) => CARDS[i.id].type === 'attack');
  a.grafts.push(...randomGrafts(a, 2)); temper(a); a.grafts.push(...randomGrafts(a, 1));
  const c = newCombat(run, ['suture_wasp']);
  for (const s of ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden']) c.player.st[s] = 1;
  c.seam.len = 3; c.seam.counts = { ember: 2 };
  run.combatSnapshot = undefined;
  run.flags.seam = JSON.parse(JSON.stringify(c.seam));
  const back = RUN.deserializeRun(RUN.serializeRun(run));
  const same = (x, y, w) => { try { assert.deepEqual(x, y); } catch { bug(`SAVE round trip lost ${w}`); } };
  const b = back.deck.find((i) => i.uid === a.uid);
  same(b.fused, a.fused, 'inst.fused'); same(b.grafts, a.grafts, 'inst.grafts'); same(back.flags.seam, run.flags.seam, 'c.seam');
  same(cardSpec(b).fx.length, cardSpec(a).fx.length, 'spec after reload'); if (back.rng.next() !== run.rng.next()) bug('SAVE rng state lost');
  const meta = (await import('../graftwork/engine/meta.js'));
  const m = meta.defaultMeta(); meta.markTip(m, 'seam'); meta.markTip(m, 'poison');
  const store = new Map(); meta.setStorage({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }); meta.saveMeta(m);
  const m2 = meta.loadMeta(); same(m2.tips, m.tips, 'meta.tips');
  store.set(meta.KEY, JSON.stringify({ v: 1, stats: {}, tips: undefined })); // older save without tips / seen
  tryDo('meta migrate of an old save', () => { const o = meta.loadMeta(); if (!o.tips || !o.seen || !o.settings) bug('SAVE old meta not migrated (tips/seen/settings missing)'); });
  store.set(meta.KEY, '{not json'); tryDo('corrupt meta', () => { const o = meta.loadMeta(); if (!o || !o.tips) bug('SAVE corrupt meta not replaced by defaults'); });
  meta.setStorage(null);
}

// ---------------- merged card text: same-effect lines add up, nothing repeats (every card x graft x upgrade) ----------------
{
  const lines = T.cardLines(cardSpec({ id: 'm_incision', up: false, grafts: ['g_nicked_vein'] }));
  assert.equal(lines.filter((l) => /Bleed/.test(l)).length, 1, JSON.stringify(lines));
  assert.ok(lines.some((l) => /Apply 5 Bleed/.test(l)), JSON.stringify(lines));
  const bad = [];
  for (const c of Object.values(CARDS)) for (const up of [false, true]) for (const g of [null, ...Object.keys(GRAFTS)]) {
    let ls; try { ls = T.cardLines(cardSpec({ id: c.id, up, grafts: g ? [g] : [] })); } catch (e) { continue; }
    const ss = ls.join(' ').split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean), seen = new Set();
    for (const s of ss) { if (seen.has(s)) { bad.push(`${c.id}${up ? '+' : ''} [${g}] ${s}`); break; } seen.add(s); }
  }
  assert.deepEqual(bad.slice(0, 5), [], 'repeated sentences');
  const liq = T.cardLines(cardSpec({ id: 'o_liquidate', up: false, grafts: [] })).join(' ');
  assert.match(liq, /Pay 15 gold/); assert.match(liq, /Deal 12 damage again/); assert.doesNotMatch(liq, /Gain -/);
}

// ---------------- report ----------------
const FILE_PROBLEMS = [...problems.entries()];
for (const [m, p] of FILE_PROBLEMS.sort()) console.log(`  FAIL [${p.n}x] ${m}${p.ctx ? '\n        ' + p.ctx : ''}`);
if (process.env.GW_FUZZ_VERBOSE !== undefined) for (const [m, p] of [...advisories].sort()) console.log(`  advisory [${p.n}x] ${m} :: ${p.ctx}`);
console.log(`content fuzz: ${combats} combats, ${FILE_PROBLEMS.length} failures, ${advisories.size} advisories (GW_FUZZ_VERBOSE=1 lists them: conditional-intent mismatches etc.)`);
process.exit(FILE_PROBLEMS.length ? 1 : 0);
