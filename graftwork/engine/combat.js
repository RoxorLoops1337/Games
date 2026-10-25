// Combat. Synchronous and DOM-free: every action mutates `c` and pushes events onto c.ev.
// The renderer drains c.ev (c.ev.splice(0)) and animates them; tests just read the state.
//
//   const c = newCombat(run, ['bedpan_slime', 'orderly'])
//   playCard(c, handIndex, targetIndex)   endTurn(c)   usePotion(c, i, targetIndex)   resolvePending(c, [uids])
//   intentOf(c, enemy) -> display info for the enemy's next move
import { CARDS, ENEMIES, RELICS, POTIONS, STATUSES, HEROES } from '../data/index.js';
import { cardSpec, strainInfo, relicMod, newInst, OVERLOAD_MULT, OVERLOAD_SHATTER, TITHE_MULT } from './cards.js';
import { resonanceOf, RES_HOOKS } from './resonance.js';

export const HAND_CAP = 10;
export const MAX_PLAYS_TURN = 20;
export const MAX_ENEMIES = 6;
export const LIFESTEAL_CAP = 6;
export const STATUS_CAP = 99;
export const MAX_INNATE = 3;
const RESOURCE_OPS = new Set(['draw', 'energy', 'gold', 'addCard', 'heal']);

let _eid = 1;
export function resetIds() { _eid = 1; }

// ---------- setup ----------
export function newCombat(run, enemyIds, opts = {}) {
  const hero = HEROES[run.hero];
  const c = {
    run, rng: run.rng, turn: 0, over: null, pending: null, ev: [], log: [],
    player: { kind: 'player', hp: run.hp, maxHp: run.maxHp, block: 0, st: {} },
    enemies: [], hand: [], drawPile: [], discard: [], exhaust: [], powers: [],
    energy: 0, maxEnergy: 3 + relicMod(run, 'energy') + ((hero && hero.energy) || 0),
    handSize: 5 + relicMod(run, 'hand'), playsTurn: 0, cardsThisTurn: [], goldGained: 0, kind: opts.kind || 'normal',
    ascension: run.ascension || 0, killsThisTurn: 0, damageTakenThisCombat: 0, nextId: 1,
  };
  c.A = makeApi(c);
  c.strain = strainInfo(run);
  c.res = resonanceOf(run).tiers;
  const tithed = new Set(c.strain.tithed);
  const brand = relicMod(run, 'brandingIron') || run.relics.some((r) => RELICS[r] && RELICS[r].perk === 'brandingIron');
  for (const inst of run.deck) { const w = wrap(c, inst, tithed.has(inst.uid)); if (brand && inst.grafts.length === 2) w.brand = true; c.drawPile.push(w); }
  c.rng.shuffle(c.drawPile);
  // innate cards to the top of the draw pile (max MAX_INNATE)
  let innate = 0;
  const inn = [], rest = [];
  for (const card of c.drawPile) {
    if (specOf(c, card).flags.innate && innate < MAX_INNATE) { inn.push(card); innate++; } else rest.push(card);
  }
  c.drawPile = [...rest, ...inn];
  enemyIds.forEach((id, i) => spawn(c, id, { silent: true, slot: i }));
  if (hero && hero.start) for (const s of Object.keys(hero.start)) addStatus(c, c.player, s, hero.start[s], { silent: true });
  // combat-start price: junk entering the draw pile or discard, and graft custom hooks
  for (const card of c.drawPile.slice()) {
    const sp = specOf(c, card);
    for (const j of sp.price.junk) if (j.when === 'combatStart') addCard(c, j.card, j.n, j.to);
  }
  if (run.dailyMod && run.dailyMod.echo) addStatus(c, c.player, 'echo', run.dailyMod.echo, { silent: true });
  fire(c, 'combatStart', {});
  for (const e of c.enemies) { const d = ENEMIES[e.id]; if (d.on && d.on.combatStart) d.on.combatStart(c.A, e); }
  for (const e of c.enemies) pickMove(c, e);
  c.ev.push({ t: 'start' });
  startPlayerTurn(c);
  return c;
}

function wrap(c, inst, tithed = false) {
  return { inst, uid: inst.uid, tithed, jam: false, costMod: 0, plays: 0, rolled: false, temp: false };
}
export function specOf(c, card) {
  const s = cardSpec(card.inst);
  s.tithed = !!card.tithed;
  return s;
}
export function mult(spec, tithed) {
  let m = 1 + spec.pct / 100;
  if (spec.overload) m *= OVERLOAD_MULT;
  if (tithed) m *= TITHE_MULT;
  return m;
}
export function scaleNum(n, m) { return n > 0 ? Math.max(1, Math.round(n * m)) : n; }

export function effCost(c, card) {
  const sp = specOf(c, card);
  if (sp.cost === 'X') return 'X';
  let k = sp.cost + card.costMod + (card.jam ? 1 : 0) + (c.player.st.costup || 0);
  if (card.costSet !== undefined) k = card.costSet;
  return Math.max(0, k);
}

// ---------- API handed to every hook ----------
function makeApi(c) {
  const A = {
    c, rng: c.rng,
    alive: () => c.enemies.filter((e) => !e.dead),
    dmg: (src, tgt, n, o) => dealDamage(c, src, tgt, n, o),
    block: (tgt, n, o) => gainBlock(c, tgt, n, o),
    status: (tgt, s, n, o) => addStatus(c, tgt, s, n, o),
    setStatus: (tgt, s, n) => setStatus(c, tgt, s, n),
    heal: (tgt, n) => heal(c, tgt, n),
    loseHp: (tgt, n, o) => loseHp(c, tgt, n, o),
    draw: (n, o) => drawCards(c, n, o),
    energy: (n) => { c.energy = Math.max(0, c.energy + n); c.ev.push({ t: 'energy', n }); },
    gold: (n) => { c.goldGained += n; c.run.gold = Math.max(0, (c.run.gold || 0) + n); c.ev.push({ t: 'gold', n }); },
    addCard: (id, n, to, o) => addCard(c, id, n, to, o),
    summon: (id, n, o) => { const out = []; for (let i = 0; i < (n || 1); i++) { const e = spawn(c, id, o); if (e) out.push(e); } return out; },
    kill: (e) => kill(c, e),
    ev: (e) => c.ev.push(e),
    st: (ent, s) => (ent.st[s] || 0),
    player: c.player,
    hero: () => HEROES[c.run.hero],
  };
  return A;
}

// ---------- entities ----------
export function spawn(c, id, o = {}) {
  const d = ENEMIES[id];
  if (!d) throw new Error('unknown enemy ' + id);
  if (c.enemies.filter((e) => !e.dead).length >= MAX_ENEMIES) return null;
  const asc = c.ascension;
  let hp = Array.isArray(d.hp) ? c.rng.range(d.hp[0], d.hp[1]) : d.hp;
  let k = 1;
  if (asc >= 2) k *= 1.1;
  if (c.run.dailyMod && c.run.dailyMod.hpMul) k *= c.run.dailyMod.hpMul;
  if (asc >= 7 && d.kind === 'boss') k *= 1.2;
  k *= 1 + (c.run.loop || 0) * 0.25;
  hp = Math.round(hp * k);
  const e = { kind: 'enemy', uid: c.nextId++, id, def: d, name: d.name, hp, maxHp: hp, block: 0, st: {}, turn: 0, move: null, dead: false, minion: !!d.minion, data: {} };
  if (o.slot !== undefined && o.slot < c.enemies.length) c.enemies.splice(o.slot, 0, e); else c.enemies.push(e);
  e.dmgMul = (asc >= 10 ? 1.1 : 1) * (asc >= 7 && d.kind === 'elite' ? 1.15 : 1) * (1 + (c.run.loop || 0) * 0.15);
  if (d.start) for (const s of Object.keys(d.start)) e.st[s] = d.start[s];
  c.ev.push({ t: 'spawn', e: e.uid, id, silent: !!o.silent });
  if (!o.silent) pickMove(c, e);
  return e;
}

function stDef(s) { const d = STATUSES[s]; if (!d) throw new Error('unknown status ' + s); return d; }

export function setStatus(c, tgt, s, n) {
  if (n === 0 || (n < 0 && !stDef(s).canNeg)) delete tgt.st[s]; else tgt.st[s] = Math.min(STATUS_CAP, n);
  c.ev.push({ t: 'status', who: tgt.uid || 'player', s, n: tgt.st[s] || 0 });
}
export function addStatus(c, tgt, s, n, o = {}) {
  if (!n || (tgt.dead)) return;
  const d = stDef(s);
  if (!d.good && tgt.kind === 'enemy' && tgt.def.immune && tgt.def.immune.includes(s)) { c.ev.push({ t: 'immune', who: tgt.uid, s }); return; }
  if (!d.good && tgt.st.artifact > 0) { tgt.st.artifact--; return; }
  const cur = tgt.st[s] || 0;
  let v = cur + n;
  if (!d.canNeg && v < 0) v = 0;
  if (v === 0) delete tgt.st[s]; else tgt.st[s] = Math.min(STATUS_CAP, v);
  if (!o.silent) c.ev.push({ t: 'status', who: tgt.uid || 'player', s, n: tgt.st[s] || 0, d: n });
}
function eachStatus(ent, f) { for (const s of Object.keys(ent.st)) { const d = STATUSES[s]; if (d && ent.st[s]) f(d, ent.st[s], s); } }

export function heal(c, tgt, n) {
  if (n <= 0 || tgt.dead) return 0;
  const h = Math.min(n, tgt.maxHp - tgt.hp);
  tgt.hp += h;
  if (h > 0) c.ev.push({ t: 'heal', who: tgt.uid || 'player', n: h });
  return h;
}

export function gainBlock(c, tgt, n, o = {}) {
  if (tgt.dead) return 0;
  if (!o.raw) {
    eachStatus(tgt, (d, v) => { if (d.mod && d.mod.blockAdd) n += d.mod.blockAdd(v); });
    eachStatus(tgt, (d, v) => { if (d.mod && d.mod.blockMul) n = Math.floor(n * d.mod.blockMul(v)); });
  }
  n = Math.max(0, Math.floor(n));
  if (n <= 0) return 0;
  tgt.block += n;
  c.ev.push({ t: 'block', who: tgt.uid || 'player', n });
  return n;
}

export function loseHp(c, tgt, n, o = {}) {
  n = Math.max(0, Math.floor(n));
  if (n <= 0 || tgt.dead) return 0;
  if (o.floor1 && tgt.hp - n < 1) n = Math.max(0, tgt.hp - 1);
  tgt.hp -= n;
  if (tgt.kind === 'player') c.damageTakenThisCombat += n;
  c.ev.push({ t: 'hp', who: tgt.uid || 'player', n, src: o.src || 'cost' });
  if (tgt.hp <= 0) kill(c, tgt);
  else if (tgt.kind === 'player' && (o.src === 'card' || o.src === 'graft')) fire(c, 'selfHurt', { n });
  return n;
}

// src may be null (statuses). o: pierce (ignore block), noMods, thorns, card, status
export function dealDamage(c, src, tgt, base, o = {}) {
  if (tgt.dead || c.over === 'lose' && tgt.kind === 'player') return 0;
  let n = base;
  if (!o.noMods) {
    if (src) eachStatus(src, (d, v) => { if (d.mod && d.mod.outAdd) n += d.mod.outAdd(v); });
    if (src) eachStatus(src, (d, v) => { if (d.mod && d.mod.outMul) n *= d.mod.outMul(v); });
    if (src && src.dmgMul) n *= src.dmgMul;
    eachStatus(tgt, (d, v) => { if (d.mod && d.mod.inMul) n *= d.mod.inMul(v); });
  }
  n = Math.max(0, Math.floor(n));
  eachStatus(tgt, (d, v) => { if (d.mod && d.mod.inCap && n > d.mod.inCap(v)) n = d.mod.inCap(v); });
  if (tgt.kind === 'enemy' && tgt.def.on && tgt.def.on.modDamage) n = tgt.def.on.modDamage(c.A, tgt, n, o) ?? n;
  const raw = n;
  let absorbed = 0;
  if (!o.pierce && tgt.block > 0) { absorbed = Math.min(tgt.block, n); tgt.block -= absorbed; n -= absorbed; }
  if (n > 0) tgt.hp -= n;
  if (tgt.kind === 'player') { c.damageTakenThisCombat += n; if (src && src.kind === 'enemy') c.lastHitBy = src.name; }
  c.ev.push({ t: 'dmg', src: src ? (src.uid || 'player') : null, who: tgt.uid || 'player', raw, n, absorbed, hit: !o.status, thorns: !!o.thorns, broke: absorbed > 0 && tgt.block === 0 });
  if (src && o.card && c.currentCard) c.currentCard.dealt = (c.currentCard.dealt || 0) + n;
  if (raw > 0 && !o.status && !o.thorns) {
    eachStatus(tgt, (d, v) => { if (d.hooks && d.hooks.attacked) d.hooks.attacked(c.A, tgt, v, { attacker: src, dmg: n, raw }); });
  }
  if (n > 0) {
    eachStatus(tgt, (d, v) => { if (d.hooks && d.hooks.damaged) d.hooks.damaged(c.A, tgt, v, { dmg: n, src }); });
    if (tgt.kind === 'enemy' && tgt.def.on && tgt.def.on.damaged && !tgt.dead) tgt.def.on.damaged(c.A, tgt, n, { src, hit: !o.status });
    if (tgt.kind === 'player') fire(c, 'damaged', { dmg: n, src });
  }
  if (tgt.hp <= 0 && !tgt.dead) kill(c, tgt, src);
  return n;
}

export function kill(c, e, src) {
  if (e.kind === 'player') {
    if (c.over) return;
    // relics may save the player (e.g. a once-per-run revive)
    fire(c, 'wouldDie', {});
    if (c.player.hp > 0) return;
    c.over = 'lose'; c.ev.push({ t: 'lose' });
    return;
  }
  if (e.dead) return;
  e.hp = Math.min(e.hp, 0);
  e.dead = true;
  c.killsThisTurn++;
  c.ev.push({ t: 'kill', e: e.uid, id: e.id });
  if (e.def.on && e.def.on.death) e.def.on.death(c.A, e, src);
  fire(c, 'kill', { enemy: e });
  eachStatus(c.player, (d, v) => { if (d.hooks && d.hooks.kill) d.hooks.kill(c.A, c.player, v, { enemy: e }); });
  checkEnd(c);
}

function checkEnd(c) {
  if (c.over) return;
  const live = c.enemies.filter((e) => !e.dead);
  if (live.every((e) => e.minion)) {
    for (const e of live) { e.dead = true; c.ev.push({ t: 'kill', e: e.uid, id: e.id, silent: true }); }
    c.over = 'win'; c.ev.push({ t: 'win' });
  }
}

// ---------- zones ----------
export function addCard(c, id, n = 1, to = 'discard', o = {}) {
  if (!CARDS[id]) throw new Error('unknown card ' + id);
  const out = [];
  for (let i = 0; i < n; i++) {
    const inst = newInst(id, () => 'tmp' + (c.nextId++));
    if (o.up) inst.up = 1;
    const card = wrap(c, inst); card.temp = true; card.uid = inst.uid;
    if (to === 'hand') { if (c.hand.length >= HAND_CAP) { c.discard.push(card); c.ev.push({ t: 'burnCard', card: card.uid, id }); continue; } c.hand.push(card); }
    else if (to === 'draw') c.drawPile.splice(c.rng.int(c.drawPile.length + 1), 0, card);
    else if (to === 'drawTop') c.drawPile.push(card);
    else c.discard.push(card);
    c.ev.push({ t: 'addCard', card: card.uid, id, to });
    out.push(card);
  }
  return out;
}

export function drawCards(c, n, o = {}) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (c.hand.length >= HAND_CAP) { c.ev.push({ t: 'handFull' }); break; }
    if (!c.drawPile.length) {
      if (!c.discard.length) break;
      c.drawPile = c.rng.shuffle(c.discard.splice(0));
      c.ev.push({ t: 'shuffle' });
    }
    const card = c.drawPile.pop();
    c.hand.push(card);
    drawn++;
    c.ev.push({ t: 'draw', card: card.uid, id: card.inst.id, silent: !!o.silent });
    const sp = specOf(c, card);
    if (CARDS[card.inst.id].type === 'junk') fire(c, 'junkDrawn', { card });
    if (sp.price.jam > 0 && c.rng.chance(sp.price.jam)) { card.jam = true; c.ev.push({ t: 'jam', card: card.uid }); }
    for (const h of sp.custom) if (h.onDraw) h.onDraw(c.A, { card, spec: sp });
    if (sp.flags.onDrawAddEnergy) c.A.energy(sp.flags.onDrawAddEnergy);
  }
  return drawn;
}

function discardCard(c, card, why = 'discard') {
  const i = c.hand.indexOf(card);
  if (i >= 0) c.hand.splice(i, 1);
  const sp = specOf(c, card);
  card.jam = false; card.costMod = 0; delete card.costSet;
  if (sp.flags.ethereal && why === 'turnEnd') { exhaustCard(c, card, true); return; }
  c.discard.push(card);
  c.ev.push({ t: 'discard', card: card.uid, why });
  for (const h of sp.custom) if (h.onDiscard) h.onDiscard(c.A, { card, spec: sp });
}

export function exhaustCard(c, card, fromZoneAlready) {
  if (!fromZoneAlready) { for (const z of [c.hand, c.drawPile, c.discard]) { const i = z.indexOf(card); if (i >= 0) z.splice(i, 1); } }
  else { for (const z of [c.hand, c.drawPile, c.discard]) { const i = z.indexOf(card); if (i >= 0) z.splice(i, 1); } }
  c.exhaust.push(card);
  card.jam = false; card.costMod = 0;
  c.ev.push({ t: 'exhaust', card: card.uid });
  const sp = specOf(c, card);
  for (const h of sp.custom) if (h.onExhaust) h.onExhaust(c.A, { card, spec: sp });
  fire(c, 'exhaust', { card });
}

// ---------- fire relic / hero / graft-in-hand hooks ----------
export function fire(c, hook, payload) {
  for (const rid of c.run.relics || []) {
    const r = RELICS[rid];
    if (r && r.on && r.on[hook]) r.on[hook](c.A, payload, c.run);
  }
  const h = HEROES[c.run.hero];
  if (h && h.on && h.on[hook]) h.on[hook](c.A, payload, c.run);
  if (RES_HOOKS[hook]) RES_HOOKS[hook](c.A, payload, c.run);
}

// ---------- reading values ----------
function entOf(c, ctx, w) {
  if (w === 'target') return ctx.target || null;
  if (w === 'self') return ctx.srcEnt || c.player;
  if (w === 'player') return c.player;
  return null;
}
export function readSrc(c, ctx, src) {
  switch (src) {
    case 'x': return ctx.x || 0;
    case 'hand': return c.hand.length;
    case 'energy': return c.energy;
    case 'block': return (ctx.srcEnt || c.player).block;
    case 'hp': return (ctx.srcEnt || c.player).hp;
    case 'missingHp': { const e = ctx.srcEnt || c.player; return e.maxHp - e.hp; }
    case 'drawPile': return c.drawPile.length;
    case 'discard': return c.discard.length;
    case 'exhaust': return c.exhaust.length;
    case 'plays': return c.playsTurn;
    case 'turn': return c.turn;
    case 'deck': return c.run.deck.length;
    case 'grafts': return c.run.deck.reduce((a, i) => a + i.grafts.length, 0);
    case 'cardGrafts': return ctx.spec ? ctx.spec.grafts.length : 0;
    case 'strain': return c.strain.strain;
    case 'enemies': return c.enemies.filter((e) => !e.dead).length;
    case 'kills': return c.killsThisTurn;
    case 'dealt': return ctx.dealt || 0;
    case 'gold': return c.run.gold || 0;
    case 'junk': return [...c.hand, ...c.drawPile, ...c.discard].filter((k) => CARDS[k.inst.id].type === 'junk').length;
    case 'attacksInHand': return c.hand.filter((k) => CARDS[k.inst.id].type === 'attack').length;
    default:
      if (src && src.startsWith('st:')) { const [s, w] = src.slice(3).split('@'); const ent = entOf(c, ctx, w || 'self'); return ent ? (ent.st[s] || 0) : 0; }
      throw new Error('unknown value source ' + src);
  }
}
export function val(c, ctx, x) {
  if (typeof x === 'number') return x;
  if (x === undefined || x === null) return 0;
  let v = x.base || 0;
  if (x.per) v += Math.floor(readSrc(c, ctx, x.per) * (x.mul === undefined ? 1 : x.mul));
  if (x.max !== undefined) v = Math.min(v, x.max);
  if (x.min !== undefined) v = Math.max(v, x.min);
  return v;
}
export function cond(c, ctx, k) {
  if (!k) return true;
  if (typeof k === 'function') return !!k(c, ctx);
  const v = k.src === 'hp%' ? ((ctx.srcEnt || c.player).hp / (ctx.srcEnt || c.player).maxHp) : readSrc(c, ctx, k.src);
  if (k.lt !== undefined && !(v < k.lt)) return false;
  if (k.lte !== undefined && !(v <= k.lte)) return false;
  if (k.gt !== undefined && !(v > k.gt)) return false;
  if (k.gte !== undefined && !(v >= k.gte)) return false;
  if (k.eq !== undefined && !(v === k.eq)) return false;
  return true;
}

// ---------- effects ----------
function targetsFor(c, ctx, to, dflt) {
  to = to || dflt;
  const live = c.enemies.filter((e) => !e.dead);
  const mine = ctx.srcEnt && ctx.srcEnt.kind === 'enemy';
  switch (to) {
    case 'enemy': return ctx.target && !ctx.target.dead ? [ctx.target] : (live.length ? [live[0]] : []);
    case 'all': return mine ? [c.player] : live;
    case 'allEnemies': return live;
    case 'random': return live.length ? [c.rng.pick(live)] : [];
    case 'self': return [ctx.srcEnt || c.player];
    case 'player': return [c.player];
    case 'allies': return live.filter((e) => e !== ctx.srcEnt);
    case 'target': return ctx.target && !ctx.target.dead ? [ctx.target] : [];
    default: throw new Error('bad target ' + to);
  }
}

export function runFx(c, fx, ctx) {
  for (const op of fx) {
    if (c.over && op.op !== 'custom') return;
    if (ctx.replay && RESOURCE_OPS.has(op.op)) continue;
    runOp(c, op, ctx);
  }
}

function runOp(c, op, ctx) {
  const m = ctx.mult || 1;
  const isEnemy = ctx.srcEnt && ctx.srcEnt.kind === 'enemy';
  switch (op.op) {
    case 'dmg': {
      let n = val(c, ctx, op.n);
      if (ctx.mult && op.scale !== false) n = scaleNum(n, m);
      const hits = val(c, ctx, op.hits) || 1;
      const tg = targetsFor(c, ctx, op.to, isEnemy ? 'player' : 'enemy');
      for (let h = 0; h < hits; h++) {
        for (const t of (op.to === 'random' ? targetsFor(c, ctx, 'random') : tg)) {
          if (t.dead) continue;
          const d = dealDamage(c, isEnemy ? ctx.srcEnt : c.player, t, n, { pierce: op.pierce, card: !isEnemy });
          ctx.dealt = (ctx.dealt || 0) + d;
          if (!isEnemy && ctx.card) ctx.card.lastHit = t;
        }
      }
      break;
    }
    case 'block': {
      let n = val(c, ctx, op.n);
      if (ctx.mult && op.scale !== false) n = scaleNum(n, m);
      for (const t of targetsFor(c, ctx, op.to, 'self')) gainBlock(c, t, n);
      break;
    }
    case 'status': {
      const n = val(c, ctx, op.n);
      for (const t of targetsFor(c, ctx, op.to, 'enemy')) addStatus(c, t, op.s, n);
      break;
    }
    case 'setStatus': for (const t of targetsFor(c, ctx, op.to, 'self')) setStatus(c, t, op.s, val(c, ctx, op.n)); break;
    case 'double': for (const t of targetsFor(c, ctx, op.to, 'enemy')) if (t.st[op.s]) addStatus(c, t, op.s, Math.min(t.st[op.s] * (op.mul || 1), op.cap || 99)); break;
    case 'detonate': for (const t of targetsFor(c, ctx, op.to, 'enemy')) { const n = t.st[op.s] || 0; if (n) { delete t.st[op.s]; c.ev.push({ t: 'status', who: t.uid || 'player', s: op.s, n: 0 }); dealDamage(c, c.player, t, Math.floor(n * (op.mul || 1)), { pierce: true, noMods: true, status: op.s }); } } break;
    case 'cleanse': { const e = targetsFor(c, ctx, op.to, 'self')[0]; for (const s of Object.keys(e.st)) if (!STATUSES[s].good) setStatus(c, e, s, 0); break; }
    case 'draw': drawCards(c, Math.min(val(c, ctx, op.n), 4)); break;
    case 'energy': c.A.energy(Math.min(val(c, ctx, op.n), 3)); break;
    case 'heal': heal(c, ctx.srcEnt || c.player, val(c, ctx, op.n)); break;
    case 'hp': { const t = targetsFor(c, ctx, op.to, 'self')[0]; loseHp(c, t, val(c, ctx, op.n), { floor1: t.kind === 'player', src: 'card' }); break; }
    case 'maxhp': c.player.maxHp += val(c, ctx, op.n); c.run.maxHp = c.player.maxHp; if (op.heal !== false) c.player.hp += val(c, ctx, op.n); break;
    case 'gold': c.A.gold(val(c, ctx, op.n)); break;
    case 'addCard': addCard(c, op.card, val(c, ctx, op.n) || 1, op.to || 'discard', { up: op.up }); break;
    case 'summon': for (let i = 0; i < (op.n || 1); i++) spawn(c, op.id); break;
    case 'discard': startPending(c, { kind: 'discard', n: val(c, ctx, op.n), choose: op.choose !== false, then: 'discard' }); break;
    case 'exhaustHand': startPending(c, { kind: 'exhaust', n: op.n === 'all' ? 99 : val(c, ctx, op.n), choose: op.choose !== false && op.n !== 'all', then: 'exhaust', draw: op.draw }); break;
    case 'fetch': startPending(c, { kind: 'fetch', zone: op.from || 'discard', n: val(c, ctx, op.n) || 1, choose: true, then: 'hand' }); break;
    case 'retarget': break;
    case 'if': runFx(c, cond(c, ctx, op.cond) ? (op.then || []) : (op.else || []), ctx); break;
    case 'repeat': for (let i = 0; i < val(c, ctx, op.n); i++) runFx(c, op.fx, ctx); break;
    case 'custom': op.fn(c.A, ctx); break;
    case 'move': { // enemy move-flow helper: intent shown but no effect (telegraph only)
      break;
    }
    default: throw new Error('unknown op ' + op.op);
  }
}

// ---------- pending choices (discard N, exhaust N, fetch) ----------
function startPending(c, p) {
  const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand;
  const take = Math.min(p.n, pool.length);
  if (take <= 0) return;
  if (!p.choose || take >= pool.length && p.kind !== 'fetch') { // no choice to make: do it all
    for (const card of pool.slice(0, take).slice()) applyPending(c, p, card);
    return;
  }
  p.n = take; c.pending = p; c.ev.push({ t: 'pending', kind: p.kind, n: take });
}
function applyPending(c, p, card) {
  if (p.then === 'discard') discardCard(c, card, 'effect');
  else if (p.then === 'exhaust') { exhaustCard(c, card); if (p.draw) drawCards(c, p.draw); }
  else if (p.then === 'hand') { for (const z of [c.discard, c.exhaust, c.drawPile]) { const i = z.indexOf(card); if (i >= 0) z.splice(i, 1); } if (c.hand.length < HAND_CAP) { c.hand.push(card); c.ev.push({ t: 'draw', card: card.uid, id: card.inst.id }); } else c.discard.push(card); }
}
export function resolvePending(c, uids) {
  const p = c.pending;
  if (!p) return false;
  const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand;
  const picks = uids.map((u) => pool.find((k) => k.uid === u)).filter(Boolean).slice(0, p.n);
  if (picks.length < Math.min(p.n, pool.length)) return false;
  c.pending = null;
  for (const card of picks) applyPending(c, p, card);
  return true;
}

// ---------- playing cards ----------
export function canPlay(c, hi) {
  const card = c.hand[hi];
  if (!card || c.over || c.pending) return { ok: false, why: 'blocked' };
  const sp = specOf(c, card);
  if (sp.unplayable) return { ok: false, why: 'unplayable' };
  if (c.playsTurn >= MAX_PLAYS_TURN) return { ok: false, why: 'limit' };
  const cost = effCost(c, card);
  if (cost !== 'X' && cost > c.energy) return { ok: false, why: 'energy' };
  if (sp.price.gold && (c.run.gold || 0) < sp.price.gold) return { ok: false, why: 'gold' };
  if (sp.flags.needsAttackPlayed && !c.cardsThisTurn.some((k) => k.type === 'attack')) return { ok: false, why: 'needsAttack' };
  return { ok: true, spec: sp, cost };
}

export function needsTarget(c, hi) {
  const card = c.hand[hi]; if (!card) return false;
  const sp = specOf(c, card);
  return sp.target === 'enemy' && c.enemies.filter((e) => !e.dead).length > 1;
}

export function playCard(c, hi, ti) {
  const chk = canPlay(c, hi);
  if (!chk.ok) return chk;
  const card = c.hand[hi];
  const sp = chk.spec;
  let target = null;
  const live = c.enemies.filter((e) => !e.dead);
  if (sp.target === 'enemy') {
    target = ti !== undefined && ti !== null ? c.enemies[ti] : null;
    if (!target || target.dead) { if (live.length === 1 || ti === undefined || ti === null) target = live[0]; else return { ok: false, why: 'target' }; }
  }
  let x = 0;
  if (chk.cost === 'X') { x = c.energy; c.energy = 0; } else c.energy -= chk.cost;
  c.hand.splice(hi, 1);
  c.playsTurn++;
  c.currentCard = card;
  card.dealt = 0;
  c.ev.push({ t: 'play', card: card.uid, id: sp.id, target: target ? target.uid : null, cost: chk.cost });
  // local prices
  const pr = sp.price;
  if (pr.selfHurt) loseHp(c, c.player, Math.ceil(pr.selfHurt * (card.brand ? 1.5 : 1)), { floor1: true, src: 'graft' });
  for (const s of pr.selfStatus) addStatus(c, c.player, s.s, s.n);
  if (pr.gold) c.A.gold(-pr.gold);
  if (pr.drawdown) addStatus(c, c.player, 'drawdown', pr.drawdown);
  for (const j of pr.junk) if (j.when === 'onPlay') addCard(c, j.card, j.n, j.to);
  // repeats
  let times = 1 + sp.repeat;
  if (c.player.st.echo > 0 && sp.type !== 'power') { times++; addStatus(c, c.player, 'echo', -1); }
  let m = mult(sp, card.tithed);
  if (card.brand) m *= 1.5;
  let shatter = false;
  if (sp.overload && !card.rolled) {
    card.rolled = true;
    const p = Math.max(0, OVERLOAD_SHATTER + relicMod(c.run, 'shatter') + (c.ascension >= 8 ? 0.1 : 0) + ((c.run.dailyMod && c.run.dailyMod.shatter) || 0));
    if (c.rng.chance(p)) shatter = true;
  }
  for (let r = 0; r < times; r++) {
    const ctx = { card, spec: sp, target, srcEnt: null, mult: m, x, replay: r > 0, dealt: 0 };
    if (r > 0 && target && target.dead) { const alt = c.enemies.filter((e) => !e.dead); if (!alt.length) break; if (sp.target === 'enemy') ctx.target = target = c.rng.pick(alt); }
    if (r > 0) c.ev.push({ t: 'replay', card: card.uid });
    runFx(c, sp.fx, ctx);
    for (const h of sp.custom) if (h.onPlay) h.onPlay(c.A, ctx);
    if (sp.lifesteal && ctx.dealt) heal(c, c.player, Math.min(ctx.dealt, sp.lifesteal || LIFESTEAL_CAP));
    if (c.over) break;
  }
  card.plays++; card.inst.plays = (card.inst.plays || 0) + 1;
  c.cardsThisTurn.push({ id: sp.id, type: sp.type, uid: card.uid });
  const payload = { card, spec: sp, target };
  fire(c, 'cardPlayed', payload);
  eachStatus(c.player, (d, v) => { if (d.hooks && d.hooks.cardPlayed) d.hooks.cardPlayed(c.A, c.player, v, payload); });
  for (const e of c.enemies) if (!e.dead && e.def.on && e.def.on.playerCard) e.def.on.playerCard(c.A, e, payload);
  c.currentCard = null;
  card.jam = false; card.costMod = 0; delete card.costSet;
  // destination
  if (shatter) {
    card.inst.shattered = true; c.ev.push({ t: 'shatter', card: card.uid, id: sp.id });
    fire(c, 'shatter', { card });
  } else if (sp.type === 'power') { c.powers.push(card); c.ev.push({ t: 'power', card: card.uid }); }
  else if (sp.flags.exhaust) exhaustCard(c, card, true);
  else { c.discard.push(card); c.ev.push({ t: 'discard', card: card.uid, why: 'played' }); }
  checkEnd(c);
  return { ok: true };
}

// ---------- enemy moves ----------
export function pickMove(c, e) {
  const d = e.def;
  let id;
  if (d.pick) id = d.pick(c.A, e);
  else if (d.opening && e.turn < d.opening.length) id = d.opening[e.turn];
  else if (d.pattern) id = d.pattern[(e.turn - (d.opening ? d.opening.length : 0)) % d.pattern.length];
  else id = Object.keys(d.moves)[0];
  if (!d.moves[id]) throw new Error(`enemy ${e.id} has no move ${id}`);
  e.move = id;
  c.ev.push({ t: 'intent', e: e.uid, move: id });
}

export function intentOf(c, e) {
  if (!e.move) return { kinds: ['unknown'], dmg: 0, hits: 0 };
  const mv = e.def.moves[e.move];
  const kinds = new Set();
  let dmg = 0, hits = 0;
  const ctx = { srcEnt: e, target: c.player };
  for (const op of mv.fx || []) {
    const walk = (o) => {
      if (o.op === 'dmg') {
        kinds.add('attack');
        let n = val(c, ctx, o.n);
        eachStatus(e, (d, v) => { if (d.mod && d.mod.outAdd) n += d.mod.outAdd(v); });
        eachStatus(e, (d, v) => { if (d.mod && d.mod.outMul) n *= d.mod.outMul(v); });
        eachStatus(c.player, (d, v) => { if (d.mod && d.mod.inMul) n *= d.mod.inMul(v); });
        n = Math.max(0, Math.floor(n));
        const h = val(c, ctx, o.hits) || 1;
        dmg += n * h; hits += h; ctx.per = n;
      } else if (o.op === 'block') kinds.add('defend');
      else if (o.op === 'status') kinds.add(['self', 'allies'].includes(o.to) ? 'buff' : 'debuff');
      else if (o.op === 'addCard') kinds.add('junk');
      else if (o.op === 'summon') kinds.add('summon');
      else if (o.op === 'if') { (o.then || []).forEach(walk); }
      else if (o.op === 'custom' && o.intent) kinds.add(o.intent);
    };
    walk(op);
  }
  if (mv.intent) { kinds.clear(); for (const k of [].concat(mv.intent)) kinds.add(k); }
  if (!kinds.size) kinds.add('unknown');
  const hidden = !!mv.hidden || (e.st.hidden > 0);
  return { kinds: [...kinds], dmg, hits, per: ctx.per || 0, hidden, name: mv.name || e.move, move: e.move };
}

function enemyAct(c, e) {
  if (e.dead || c.over) return;
  if (e.st.stun > 0) { c.ev.push({ t: 'stunned', e: e.uid }); return; }
  const mv = e.def.moves[e.move];
  c.ev.push({ t: 'enemyAct', e: e.uid, move: e.move });
  const ctx = { srcEnt: e, target: c.player, mult: 1, replay: false };
  runFx(c, mv.fx || [], ctx);
  if (mv.after) mv.after(c.A, e);
  if (e.def.on && e.def.on.afterMove) e.def.on.afterMove(c.A, e, e.move);
}

// ---------- turn flow ----------
export function startPlayerTurn(c) {
  if (c.over) return;
  c.turn++;
  c.playsTurn = 0; c.cardsThisTurn = []; c.killsThisTurn = 0;
  const keepBlock = c.player.st.barricade > 0 || relicMod(c.run, 'keepBlock') > 0;
  if (!keepBlock) c.player.block = 0;
  c.energy = c.maxEnergy;
  c.ev.push({ t: 'turnStart', turn: c.turn });
  eachStatus(c.player, (d, v) => { if (d.hooks && d.hooks.turnStart) d.hooks.turnStart(c.A, c.player, v); });
  if (c.over) return;
  const slow = c.player.st.drawdown || 0;
  if (slow) setStatus(c, c.player, 'drawdown', 0);
  drawCards(c, Math.max(0, c.handSize - slow));
  // Backfire: Strain that found no Bare card to tithe jams grafted cards in hand
  let bf = c.strain.backfire;
  if (bf > 0) {
    const grafted = c.hand.filter((k) => k.inst.grafts.length && !k.jam);
    for (let i = 0; i < bf && grafted.length; i++) { const k = grafted.splice(c.rng.int(grafted.length), 1)[0]; k.jam = true; c.ev.push({ t: 'jam', card: k.uid, backfire: true }); }
  }
  for (const card of c.hand) { const sp = specOf(c, card); for (const h of sp.custom) if (h.onTurnStart) h.onTurnStart(c.A, { card, spec: sp }); }
  fire(c, 'turnStart', {});
  checkEnd(c);
}

export function endTurn(c) {
  if (c.over || c.pending) return;
  c.ev.push({ t: 'turnEnd' });
  fire(c, 'turnEnd', {});
  eachStatus(c.player, (d, v, s) => {
    if (d.hooks && d.hooks.turnEnd) d.hooks.turnEnd(c.A, c.player, v);
  });
  // hand: retain stays, the rest is discarded (ethereal exhausts)
  for (const card of c.hand.slice()) {
    const sp = specOf(c, card);
    if (sp.flags.retain) { card.jam = false; continue; }
    discardCard(c, card, 'turnEnd');
  }
  tickDurations(c, c.player);
  // enemies
  for (const e of c.enemies.slice()) {
    if (e.dead || c.over) continue;
    if (!(e.st.barricade > 0)) e.block = 0;
    eachStatus(e, (d, v) => { if (d.hooks && d.hooks.turnStart) d.hooks.turnStart(c.A, e, v); });
    if (e.def.on && e.def.on.turnStart && !e.dead) e.def.on.turnStart(c.A, e);
    if (e.dead || c.over) continue;
    enemyAct(c, e);
    if (e.dead || c.over) continue;
    eachStatus(e, (d, v) => { if (d.hooks && d.hooks.turnEnd) d.hooks.turnEnd(c.A, e, v); });
    tickDurations(c, e);
    e.turn++;
  }
  if (c.over) return;
  for (const e of c.enemies) if (!e.dead) pickMove(c, e);
  checkEnd(c);
  if (!c.over) startPlayerTurn(c);
}

function tickDurations(c, ent) {
  for (const s of Object.keys(ent.st)) {
    const d = STATUSES[s];
    if (d && d.stack === 'dur') { ent.st[s]--; if (ent.st[s] <= 0) delete ent.st[s]; c.ev.push({ t: 'status', who: ent.uid || 'player', s, n: ent.st[s] || 0 }); }
  }
}

// ---------- potions ----------
export function usePotion(c, i, ti) {
  const id = c.run.potions[i];
  if (!id || c.over || c.pending) return { ok: false };
  const p = POTIONS[id];
  let target = null;
  if (p.target === 'enemy') { target = c.enemies[ti] && !c.enemies[ti].dead ? c.enemies[ti] : c.enemies.find((e) => !e.dead); }
  c.run.potions.splice(i, 1);
  c.ev.push({ t: 'potion', id, target: target ? target.uid : null });
  runFx(c, p.fx, { card: null, spec: { type: 'potion', grafts: [] }, target, srcEnt: null, mult: 1, x: 0 });
  checkEnd(c);
  return { ok: true };
}

// ---------- end of combat ----------
// Applies results back to the run: HP, shattered cards leave the deck. Returns a summary.
export function finishCombat(c) {
  const run = c.run;
  run.hp = Math.max(0, Math.min(c.player.hp, c.player.maxHp));
  run.maxHp = c.player.maxHp;
  const shattered = run.deck.filter((i) => i.shattered);
  run.deck = run.deck.filter((i) => !i.shattered);
  const g = c.player.st.gilt || 0;
  if (g) run.gold = (run.gold || 0) + g;
  fire(c, 'combatEnd', {});
  return { win: c.over === 'win', killedBy: c.lastHitBy || null, shattered: shattered.map((i) => i.id), turns: c.turn, damageTaken: c.damageTakenThisCombat };
}
