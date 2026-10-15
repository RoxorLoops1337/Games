// Hocus Vocus: the effects audit. "Does every effect the game TELLS the player actually happen, with the numbers it states?"
//
// The game generates card, hook and gem text from the effect data (data_text.js), and hand writes Charm, status, Spell and event
// text. This suite closes the loop from both ends:
//   1. TEXT <-> DATA: every number, status, keyword and target an op list carries is in the sentence the player reads (cards base and
//      upgraded, card hooks, gems, Charms, statuses, passives and rows, event costs and outcome prose that names a number).
//   2. DATA <-> ENGINE: an independent reference interpreter of the effect DSL (the ORACLE below, written from DESIGN.md 4.2 to 4.6,
//      sharing no code with combat.js) predicts what an op list should do from a snapshot of a real combat; the real engine then plays
//      it and every observable must agree: HP, max HP, Block, every status stack on every unit, rows, Breath, the five piles, upgraded
//      and held cards, gold and Vox, Fanbase and Remix counters.
//      * Cards: every card, base and upgraded, in both spots, in three set ups (bare; rich: resources, Block, debuffs on the enemy,
//        damage taken; after a card: one card played first, low HP) and a kill set up (lastKill and Fanbase).
//      * Hooks (powers, once hooks, Charms): an A/B pair of identical fights, one with the hook and one without, is driven through the
//        hook's trigger (turn start, turn end, a play, a swap, a hit, a kill, a reshuffle, a Fade, combat start and end). The difference
//        of the two event streams is the hook's effect, and it must equal the oracle's prediction, fire by fire, honouring limit, once
//        and every, and the "you" versus "either hero" wording.
//      * Gems: the gem's DESIGN 4.6 rule is applied by hand to the card's ops, the oracle plays that, and the engine plays the gemmed card.
//      * Statuses, passives, rows, Spells, run hooks, Charm mods and every event outcome have direct checks against their text.
//   3. MAX HP: every source of max HP (Charms on pickup and in combat, event outcomes and fight wins, the act end) raises current and
//      max HP at once, in COMBAT and in the run state the HUD reads, and the reward ledger shows the gain.
//
// RB_AUDIT=1 prints the coverage table.
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus effects audit');
const g = boot({ only: ['data_text', 'combat', 'run'] });
const { DATA: D, COMBAT, RUN, MAP, U } = g;
const VERBOSE = !!process.env.RB_AUDIT;
const J = (x) => JSON.stringify(x);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const fl = (x) => Math.floor(x + 1e-9);
const inRange = (v, c) => (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte);
const HEROES = D.LISTS.heroIds;
const resOf = (h) => Object.keys(D.statuses).find((s) => D.statuses[s].kind === 'resource' && D.statuses[s].hero === h);
const coverage = {};
const cover = (k) => { coverage[k] = (coverage[k] || 0) + 1; };

// ------------------------------------------------------------------------------------------------ test enemies
const idle = { idle: { name: 'Idle', kind: 'none', fx: [] } };
const base = { chapter: 1, size: 'm', ai: { seq: ['idle'] }, lore: 'A test creature for the effects audit.', tags: ['spirit'] };
const enemy = (id, o) => Object.assign({ name: id, tier: 'normal', hp: [999, 999], moves: idle, art: { id } }, base, o);
D.add('enemies', {
  ea_dummy: enemy('ea_dummy'),
  ea_dummy2: enemy('ea_dummy2'),
  ea_weak: enemy('ea_weak', { hp: [1, 1] }),
  ea_weak_elite: enemy('ea_weak_elite', { hp: [1, 1], tier: 'elite', size: 'l' }),
  ea_weak_minion: enemy('ea_weak_minion', { hp: [1, 1], tier: 'minion', size: 's' }),
  ea_zero: enemy('ea_zero', { moves: { tap: { name: 'Tap', kind: 'multi', fx: [{ op: 'dmg', n: 0, hits: 3, tgt: 'front' }] } }, ai: { seq: ['tap'] } }),
  ea_hitter: enemy('ea_hitter', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] } }, ai: { seq: ['hit'] } }),
  ea_big: enemy('ea_big', { moves: { hit: { name: 'Crush', kind: 'heavy', fx: [{ op: 'dmg', n: 400, tgt: 'front' }] } }, ai: { seq: ['hit'] } }),
});

// ------------------------------------------------------------------------------------------------ engine helpers
const partnerOf = (h, k) => HEROES.filter((x) => x !== h)[k % 3];
const starterOf = (h, type) => D.heroes[h].starter.find((id) => D.cards[id] && D.cards[id].type === type && D.cards[id].cost === 1);
let uidSeq = 1;
const inst = (id, up, gems) => ({ uid: uidSeq++, id, up: up ? 1 : 0, gems: gems || (D.cards[id].slots || []).map(() => null) });
function fight(o) {
  const owner = o.owner, partner = o.partner;
  const fill = [];
  for (let i = 0; i < 6; i++) fill.push(D.heroes[owner].starter[i % D.heroes[owner].starter.length]);
  for (let i = 0; i < 4; i++) fill.push(D.heroes[partner].starter[i % D.heroes[partner].starter.length]);
  const deck = (o.deck || []).map((x) => (typeof x === 'string' ? inst(x) : x)).concat((o.fill === false ? [] : fill).map((id) => inst(id)));
  const C = COMBAT.create({
    heroes: [{ id: owner, hp: D.heroes[owner].maxHp, maxHp: D.heroes[owner].maxHp }, { id: partner, hp: D.heroes[partner].maxHp, maxHp: D.heroes[partner].maxHp }],
    frontIdx: o.back ? 1 : 0, deck, enemies: o.enemies || ['ea_dummy', 'ea_dummy2'], tier: o.tier || 'normal', chapter: 1, seed: o.seed || 7,
    mods: D.modsFor(o.relics || [], 0), relics: o.relics || [], gold: 100,
  });
  if (o.beforeStart) o.beforeStart(C);
  C.startSnap = snapPre(C);
  C.startEv = C.start();
  return C;
}
// the state before C.start(): what combatStart hooks see
function snapPre(C) {
  return {
    heroes: C.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp, block: h.block, st: Object.assign({}, h.st), row: h.row, down: h.down, dmgTaken: 0, hitsTaken: 0, rowSt: Object.assign({}, h.rowSt) })),
    enemies: C.enemies.map((e) => ({ id: e.id, hp: e.hp, maxHp: e.maxHp, block: e.block, st: Object.assign({}, e.st), down: e.down, lane: e.lane, tier: e.tier })),
    energy: 0, hand: [], draw: C.draw.map((c) => ({ uid: c.uid, id: c.id, up: c.up, gems: c.gems.slice() })), discard: [], exhaust: [], powers: [],
    counters: { cards: 0, attacks: 0, skills: 0 }, passive: {}, lastPlayed: null, turn: 0, kills: 0, gold: 0, ink: 0, drawn: 0, added: 0, exhausted: 0, unordered: false, hooks: [], relics: C.relics.slice(), nondet: '',
  };
}
const heroU = (C, id) => C.heroes.find((h) => h.id === id);
function toHand(C, uidOrId) {
  const m = (c) => c.uid === uidOrId || c.id === uidOrId;
  const inHand = C.hand.find(m);
  if (inHand) return inHand;
  for (const p of [C.draw, C.discard, C.exhaust]) { const i = p.findIndex(m); if (i >= 0) { const c = p.splice(i, 1)[0]; C.hand.push(c); return c; } }
  return null;
}
const firstTarget = (C) => { const l = C.enemies.filter((e) => !e.down).sort((a, b) => a.lane - b.lane); return l.length ? l[0].id : undefined; };
function playUid(C, uid) {
  const tgt = C.needsTarget(uid) ? firstTarget(C) : undefined;
  const ev = C.play(uid, tgt).slice();
  let guard = 0;
  while (C.pending && guard++ < 5) ev.push(...C.resolvePick(C.pending.uids.slice(0, C.pending.n)));
  return ev;
}

// ------------------------------------------------------------------------------------------------ snapshots
const cardSnap = (c) => { const o = { uid: c.uid, id: c.id, up: c.up ? 1 : 0, gems: c.gems.slice() }; if (c.tmp) o.tmp = true; if (c.keep) o.keep = true; if (c.enc > 0) o.enc = c.enc; if (c.rmx > 0) o.rmx = c.rmx; if (c.fade) o.fade = true; return o; };
function snap(C) {
  const sm = C.summary();
  return {
    heroes: C.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp, block: h.block, st: Object.assign({}, h.st), row: h.row, down: h.down, dmgTaken: h._dmgTaken || 0, hitsTaken: h._hitsTaken || 0, rowSt: Object.assign({}, h.rowSt) })),
    enemies: C.enemies.map((e) => ({ id: e.id, hp: e.hp, maxHp: e.maxHp, block: e.block, st: Object.assign({}, e.st), down: e.down, lane: e.lane, tier: e.tier })),
    energy: C.energy, hand: C.hand.map(cardSnap), draw: C.draw.map(cardSnap), discard: C.discard.map(cardSnap), exhaust: C.exhaust.map(cardSnap), powers: C.powers.map(cardSnap),
    counters: { cards: C.played, attacks: 0, skills: 0 }, passive: {}, lastPlayed: C.lastPlayed ? cardSnap(C.lastPlayed) : null,
    turn: C.turn, kills: C.stats.kills.length, gold: sm.gold, ink: sm.ink, drawn: 0, added: 0, exhausted: 0, unordered: false, hooks: [], relics: C.relics.slice(), nondet: '',
  };
}
const clean = (st) => { const o = {}; Object.keys(st).sort().forEach((k) => { if (st[k]) o[k] = st[k]; }); return o; };
// the observable state two worlds are compared on
function view(S) {
  return {
    heroes: S.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp, block: h.block, st: clean(h.st), row: h.row, down: !!h.down })),
    enemies: S.enemies.map((e) => ({ id: e.id, hp: e.hp, block: e.block, st: clean(e.st), down: !!e.down })),
    energy: S.energy, piles: [S.hand.length, S.draw.length, S.discard.length, S.exhaust.length, S.powers.length],
    upInHand: S.hand.filter((c) => c.up).length, held: S.hand.filter((c) => c.keep).length, gold: S.gold, ink: S.ink,
  };
}
// a readable list of what differs between two views
function diffs(a, b, path, out) {
  out = out || [];
  path = path || '';
  if (isObj(a) && isObj(b) || Array.isArray(a) && Array.isArray(b)) {
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach((k) => diffs(a[k], b[k], path + '.' + k, out));
  } else if (J(a) !== J(b)) out.push(`${path}: engine ${J(a)} vs text ${J(b)}`);
  return out;
}

// ================================================================================================ THE ORACLE
// A reference interpreter of the effect DSL, written from DESIGN.md 4.2 to 4.6. It mutates a plain state S (see snap) and shares no code
// with combat.js. Picks resolve with the first candidates in pile order (the tests answer engine picks the same way). Anything it cannot
// predict (a random target among several enemies, a pick from a reshuffled pile) is recorded in S.nondet so the caller can skip it.
const O = {
  hero: (S, id) => S.heroes.find((h) => h.id === id),
  living: (S) => S.heroes.filter((h) => !h.down),
  front: (S) => S.heroes.find((h) => h.row === 'front'),
  back: (S) => S.heroes.find((h) => h.row === 'back'),
  other: (S, h) => S.heroes.find((x) => x.id !== h.id),
  liveEnemies: (S) => S.enemies.filter((e) => !e.down).sort((a, b) => a.lane - b.lane),
  row: (S, h) => D.rowFor(h.id, h.row, S.relics),
};
function oAddStatus(S, u, s, n) {
  if (!n || !D.statuses[s] || u.down) return;
  if (n > 0 && u.tier !== undefined) {
    if (s === 'bind') return;
    const def = D.enemies[u.id.split('#')[0]];
    if (def && def.immune && def.immune.indexOf(s) >= 0) return;
    if (s === 'stun' && u.tier === 'boss') return;
  }
  let v = (u.st[s] || 0) + n;
  if (s !== 'might') v = Math.max(0, v);
  if (v === 0) delete u.st[s]; else u.st[s] = v;
}
function oRowStatuses(S, h) {
  if (h.down) return;
  const b = O.row(S, h);
  ['thorns', 'regen'].forEach((s) => {
    const oldG = h.rowSt[s] || 0, newG = b[s] || 0;
    h.rowSt[s] = newG;
    const cur = h.st[s] || 0;
    const v = Math.max(0, cur - oldG) + newG;
    if (v) h.st[s] = v; else delete h.st[s];
  });
}
function oWho(S, w, env, victim) {
  if (w === undefined || w === 'self') return env.actor;
  if (w === 'ally') return env.actor ? O.other(S, env.actor) : null;
  return victim || env.target || null;
}
function oCount(S, v, env, victim) {
  const a = env.actor;
  switch (v.per) {
    case 'X': return env.X || 0;
    case 'handSize': return S.hand.length;
    case 'drawPile': return S.draw.length;
    case 'discardPile': return S.discard.length;
    case 'exhaustPile': return S.exhaust.length;
    case 'cardsPlayed': return S.counters.cards;
    case 'attacksPlayed': return S.counters.attacks;
    case 'skillsPlayed': return S.counters.skills;
    case 'energy': return S.energy;
    case 'block': { const u = oWho(S, v.who, env, victim); return u ? u.block : 0; }
    case 'hp': { const u = oWho(S, v.who, env, victim); return u ? u.hp : 0; }
    case 'missingHp': { const u = oWho(S, v.who, env, victim); return u ? u.maxHp - u.hp : 0; }
    case 'status': { const u = oWho(S, v.who, env, victim); return u ? (u.st[v.s] || 0) : 0; }
    case 'debuffs': { const u = oWho(S, v.who === undefined ? 'target' : v.who, env, victim); return u ? Object.keys(u.st).filter((s) => D.isDebuff(s) && u.st[s]).length : 0; }
    case 'enemies': return O.liveEnemies(S).length;
    case 'kills': return S.kills;
    case 'turn': return S.turn;
    case 'gems': return env.card ? env.card.gems.filter(Boolean).length : 0;
    case 'front': return a && a.row === 'front' ? 1 : 0;
    case 'damageTaken': return a ? a.dmgTaken : 0;
    case 'hitsTaken': return a ? a.hitsTaken : 0;
    case 'targetBlock': { const tt = victim || env.target; return tt ? tt.block : 0; }
    case 'picked': return env.picked || 0;
    default: throw new Error('oracle: unknown per ' + v.per);
  }
}
function oV(S, v, env, victim) {
  if (isNum(v)) return v;
  if (!isObj(v)) return 0;
  let c = v.per !== undefined ? oCount(S, v, env, victim) : 0;
  if (v.upTo !== undefined) c = Math.min(c, v.upTo);
  let x = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * c;
  if (v.min !== undefined) x = Math.max(x, v.min);
  if (v.cap !== undefined) x = Math.min(x, v.cap);
  return fl(x);
}
function oCond(S, c, env) {
  const a = env.actor;
  for (const k of Object.keys(c)) {
    const x = c[k];
    switch (k) {
      case 'row': if (!a || a.row !== x) return false; break;
      case 'status': { const u = oWho(S, x.who, env, null); const have = u ? (u.st[x.s] || 0) : 0; if (!(x.gte === undefined && x.lte === undefined ? have >= 1 : inRange(have, x))) return false; break; }
      case 'hpPct': { const u = oWho(S, x.who, env, null); if (!u) return false; const f = u.hp / u.maxHp; if (x.lt !== undefined && !(f < x.lt)) return false; if (x.gt !== undefined && !(f > x.gt)) return false; break; }
      case 'handEmpty': if (x && S.hand.length) return false; break;
      case 'cardsPlayed': if (!inRange(S.counters.cards, x)) return false; break;
      case 'attacksPlayed': if (!inRange(S.counters.attacks, x)) return false; break;
      case 'turn': if (!inRange(S.turn, x)) return false; break;
      case 'lastKill': if (x && !env.lastKill) return false; break;
      case 'targetStatus': { const tt = env.target; if (!tt) return false; const have = tt.st[x.s] || 0; if (!(x.gte === undefined && x.lte === undefined ? have >= 1 : inRange(have, x))) return false; break; }
      case 'allyDown': { const o = a ? O.other(S, a) : null; if (x && !(o && o.down)) return false; break; }
      case 'block': if (!a || !inRange(a.block, x)) return false; break;
      case 'energy': if (!inRange(S.energy, x)) return false; break;
      case 'handSize': if (!inRange(S.hand.length, x)) return false; break;
      case 'enemies': if (!inRange(O.liveEnemies(S).length, x)) return false; break;
      default: throw new Error('oracle: unknown cond ' + k);
    }
  }
  return true;
}
function oHeroTargets(S, t, env) {
  const a = env.actor, alive = O.living(S);
  switch (t) {
    case 'self': return a && !a.down ? [a] : [];
    case 'ally': { const o = a ? O.other(S, a) : null; return o && !o.down && a && !a.down ? [o] : []; }
    case 'both': return alive;
    case 'front': return alive.length === 1 ? alive : [O.front(S)].filter((h) => h && !h.down);
    case 'back': return alive.length === 1 ? alive : [O.back(S)].filter((h) => h && !h.down);
    default: return [];
  }
}
function oRandom(S) {
  const l = O.liveEnemies(S);
  if (l.length > 1) S.nondet = S.nondet || 'a random enemy among several';
  return l[0] || null;
}
function oEnemyTargets(S, t, env) {
  const live = O.liveEnemies(S);
  switch (t) {
    case 'enemy': return env.target && !env.target.down ? [env.target] : [oRandom(S)].filter(Boolean);
    case 'all': return live;
    case 'random': return [oRandom(S)].filter(Boolean);
    case 'lowest': return live.length ? [live.slice().sort((x, y) => (x.hp - y.hp) || (x.lane - y.lane))[0]] : [];
    case 'others': { const ex = env.target || env.lastSingle || null; return live.filter((e) => e !== ex); }
    default: return [];
  }
}
const ENEMY_SIDE = ['enemy', 'all', 'random', 'lowest', 'others'];
function oConsume(S, op, env) {
  if (op.consume === undefined) return;
  const a = env.actor;
  if (!a || a.down) return;
  const c = isObj(op.consume) ? op.consume : { s: op.consume };
  const cap = c.upTo === undefined ? Infinity : Math.max(0, oV(S, c.upTo, env));
  if (c.s === 'block') a.block -= Math.min(a.block, cap);
  else { const take = Math.min(a.st[c.s] || 0, cap); if (take > 0) oAddStatus(S, a, c.s, -take); }
}
function oLoseHp(S, u, n, min1) {
  n = Math.floor(n);
  if (u.down || n <= 0) return 0;
  let loss = Math.min(n, u.hp);
  if (min1) loss = Math.min(loss, Math.max(0, u.hp - 1));
  u.hp -= loss;
  if (u.hp <= 0) oDown(S, u);
  return loss;
}
function oDown(S, u) {
  u.hp = 0; u.down = true; u.block = 0;
  if (u.tier !== undefined) { S.kills += 1; oFire(S, 'onKill', { enemy: u, hero: S.killer || O.front(S), tier: u.tier }); }
  else { u.st = {}; const o = O.other(S, u); if (o && !o.down && o.row === 'back') { o.row = 'front'; u.row = 'back'; } }
}
function oStrike(S, att, v, n, op, env) {
  let raw = n;
  if (att) {
    raw += O.row(S, att).dmgAdd || 0;
    raw += att.st.might || 0;
    if ((v.st.mark || 0) > 0) { raw += 3; oAddStatus(S, v, 'mark', -1); }
    if ((att.st.weak || 0) > 0) raw = fl(raw * 0.75);
  }
  if ((v.st.vulnerable || 0) > 0) raw = fl(raw * 1.5);
  raw = Math.max(0, raw);
  if ((v.st.dodge || 0) > 0) { oAddStatus(S, v, 'dodge', -1); return { killed: false }; }
  const absorbed = op.pierce ? 0 : Math.min(v.block, raw);
  v.block -= absorbed;
  const loss = Math.min(raw - absorbed, v.hp);
  v.hp -= loss;
  const killed = v.hp <= 0;
  if (att && (v.st.thorns || 0) > 0) oLoseHp(S, att, v.st.thorns, false);
  if (op.lifesteal && att && loss > 0 && !att.down) att.hp = Math.min(att.maxHp, att.hp + loss);
  if (killed) { S.killer = env.actor; oDown(S, v); S.killer = null; }
  return { killed };
}
function oDmg(S, op, env) {
  const att = env.kind === 'card' ? env.actor : null;
  const tgt = op.tgt || 'enemy';
  let victims = tgt === 'random' ? [] : oEnemyTargets(S, tgt, env);
  const first = victims[0] || null;
  const hits = Math.min(100, Math.max(0, op.hits === undefined ? 1 : oV(S, op.hits, env, first)) + (op.hitsPlus || 0));
  const nOf = (v) => Math.max(0, oV(S, op.n, env, v)) + (op.plus || 0);
  const cache = new Map();
  const nFor = (v) => { if (!cache.has(v)) cache.set(v, nOf(v)); return cache.get(v); };
  let fixed = null;
  if (op.consume !== undefined) { if (tgt === 'random') fixed = nOf(null); else victims.forEach(nFor); oConsume(S, op, env); }
  let killedAny = false, cur = victims[0] || null;
  for (let i = 0; i < hits; i++) {
    let vs;
    if (tgt === 'random') { const v = oRandom(S); vs = v ? [v] : []; if (v) env.lastSingle = v; }
    else if (tgt === 'enemy') { if (!cur || cur.down) cur = oEnemyTargets(S, 'enemy', env)[0] || null; vs = cur ? [cur] : []; }
    else vs = victims.filter((v) => !v.down);
    if (!vs.length) break;
    for (const v of vs) {
      const r = oStrike(S, att, v, fixed !== null ? fixed : nFor(v), op, env);
      if (r.killed) { killedAny = true; if (env.src && env.mech && env.mech.fanbase) env.src.enc = (env.src.enc || 0) + env.mech.fanbase; }
    }
  }
  if (tgt === 'lowest' && victims[0]) env.lastSingle = victims[0];
  env.lastKill = killedAny;
}
function oDraw(S, n) {
  for (let i = 0; i < n; i++) {
    if (S.hand.length >= 10) break;
    if (!S.draw.length) { if (!S.discard.length) break; S.draw = S.discard.splice(0); S.unordered = true; }
    S.hand.push(S.draw.shift());
    S.drawn += 1;
  }
}
function oPlace(S, cards, to) {
  S.added += cards.length;
  cards.forEach((c) => {
    if (to === 'hand') { if (S.hand.length < 10) S.hand.push(c); else S.discard.push(c); }
    else if (to === 'draw') { S.draw.push(c); S.unordered = true; }
    else if (to === 'exhaust') S.exhaust.push(c);
    else S.discard.push(c);
  });
}
let tmpUid = 1e6;
function oPick(S, op, env) {
  const pile = op.from === 'hand' ? S.hand : op.from === 'draw' ? S.draw : op.from === 'discard' ? S.discard : S.exhaust;
  let cands = pile.slice();
  if (op.from === 'draw' && op.top) cands = cands.slice(0, op.top);
  if (op.from === 'draw' && S.unordered) S.nondet = S.nondet || 'a pick from a reshuffled pile';
  const f = op.filter;
  if (f) cands = cands.filter((c) => { const d = D.cards[c.id]; return d && (f.type === undefined || d.type === f.type) && (f.hero === undefined || d.hero === f.hero); });
  if (op.then === 'upgrade') cands = cands.filter((c) => D.cards[c.id].up && !c.up);
  const n = Math.max(0, oV(S, op.n, env));
  if (op.random && cands.length > n) S.nondet = S.nondet || 'a random pick';
  const chosen = cands.slice(0, Math.min(n, cands.length));
  env.picked = chosen.length;
  const take = (c) => { const p = op.from === 'hand' ? S.hand : op.from === 'draw' ? S.draw : op.from === 'discard' ? S.discard : S.exhaust; const i = p.indexOf(c); if (i >= 0) p.splice(i, 1); };
  chosen.forEach((c) => {
    switch (op.then) {
      case 'discard': take(c); S.discard.push(c); break;
      case 'exhaust': take(c); S.exhaust.push(c); S.exhausted += 1; oFire(S, 'onExhaust', { hero: env.actor, card: c }); break;
      case 'retain': c.keep = true; break;
      case 'upgrade': c.up = 1; break;
      case 'toHand': if (S.hand.length >= 10) { if (op.from !== 'discard') { take(c); S.discard.push(c); } } else { take(c); S.hand.push(c); } break;
      case 'toDrawTop': take(c); S.draw.unshift(c); break;
      case 'copy': oPlace(S, [Object.assign({}, c, { uid: tmpUid++, tmp: true, keep: undefined, rmx: undefined })], 'hand'); break;
      default: throw new Error('oracle: pick then ' + op.then);
    }
  });
}
function oRun(S, ops, env) {
  for (const op of list(ops)) {
    if (!op) continue;
    cover('op:' + op.op);
    if (O.living(S).length === 0) return;
    switch (op.op) {
      case 'cond': oRun(S, oCond(S, op.if, env) ? op.then : op.else, env); break;
      case 'repeat': for (let i = 0; i < 100; i++) { if (i >= Math.max(0, oV(S, op.n, env))) break; oRun(S, op.do, env); } break;
      case 'dmg': oDmg(S, op, env); break;
      case 'block': {
        const ts = oHeroTargets(S, op.tgt || 'self', env);
        const n = Math.max(0, oV(S, op.n, env, null)) + (op.plus || 0);
        oConsume(S, op, env);
        const rowAdd = env.kind === 'card' ? (O.row(S, env.actor).blockAdd || 0) : 0;
        ts.forEach((h) => { if (!h.down) h.block += Math.max(0, fl((n + (h.st.bulwark || 0) + rowAdd) * ((h.st.frail || 0) > 0 ? 0.75 : 1))); });
        break;
      }
      case 'heal': {
        const ts = oHeroTargets(S, op.tgt || 'self', env);
        const n = Math.max(0, oV(S, op.n, env, null)) + (op.plus || 0);
        oConsume(S, op, env);
        ts.forEach((h) => { if (!h.down && n > 0) h.hp = Math.min(h.maxHp, h.hp + Math.floor(n)); });
        break;
      }
      case 'hurt': {
        const ts = oHeroTargets(S, op.tgt || 'self', env);
        const n = Math.max(0, oV(S, op.n, env, null)) + (op.plus || 0);
        oConsume(S, op, env);
        ts.forEach((h) => oLoseHp(S, h, n, !op.lethal));
        break;
      }
      case 'status': {
        const t0 = op.tgt || (D.isDebuff(op.s) ? 'enemy' : 'self');
        const units = ENEMY_SIDE.indexOf(t0) >= 0 ? oEnemyTargets(S, t0, env) : oHeroTargets(S, t0, env);
        const ns = units.map((u) => oV(S, op.n, env, u.tier !== undefined ? u : null));
        oConsume(S, op, env);
        units.forEach((u, i) => oAddStatus(S, u, op.s, ns[i]));
        if (t0 === 'random' && units[0]) env.lastSingle = units[0];
        break;
      }
      case 'removeStatus': {
        const s = op.s;
        const t0 = op.tgt || ((s === 'debuffs' || D.isDebuff(s)) ? 'self' : (s === 'buffs' || D.isBuff(s)) ? 'enemy' : 'self');
        const units = ENEMY_SIDE.indexOf(t0) >= 0 ? oEnemyTargets(S, t0, env) : oHeroTargets(S, t0, env);
        units.forEach((u) => {
          if (s === 'debuffs' || s === 'buffs') Object.keys(u.st).forEach((k) => { if (D.statuses[k] && D.statuses[k].kind === (s === 'debuffs' ? 'debuff' : 'buff')) delete u.st[k]; });
          else { const have = u.st[s] || 0; const take = op.n === undefined ? have : Math.min(have, Math.max(0, oV(S, op.n, env, null))); if (take > 0) oAddStatus(S, u, s, -take); }
        });
        break;
      }
      case 'draw': { const n = Math.max(0, oV(S, op.n, env)) + (op.plus || 0); oConsume(S, op, env); oDraw(S, n); break; }
      case 'energy': { const n = oV(S, op.n, env); oConsume(S, op, env); S.energy = Math.max(0, S.energy + n); break; }
      case 'add': {
        const n = Math.max(0, oV(S, op.n === undefined ? 1 : op.n, env));
        const def = D.cards[op.card];
        const to = op.to || (def.hero === 'curse' || def.hero === 'status' ? 'discard' : 'hand');
        const cards = [];
        for (let i = 0; i < n; i++) cards.push({ uid: tmpUid++, id: op.card, up: op.up ? 1 : 0, gems: (def.slots || []).map(() => null), tmp: true });
        oPlace(S, cards, to);
        break;
      }
      case 'swap': {
        const bound = S.heroes.some((h) => !h.down && (h.st.bind || 0) > 0);
        if (!bound && O.living(S).length === 2) {
          S.heroes.forEach((h) => { h.row = h.row === 'front' ? 'back' : 'front'; });
          S.heroes.forEach((h) => oRowStatuses(S, h));
          oFire(S, 'onSwap', { hero: O.front(S) });
        }
        break;
      }
      case 'gold': { const n = Math.floor(oV(S, op.n, env)); S.gold += n; break; }
      case 'ink': { const n = Math.floor(oV(S, op.n, env)); S.ink += n; break; }
      case 'maxHp': {
        const n = Math.floor(oV(S, op.n, env));
        // max HP is a lasting stat: "both heroes gain 2 max HP" reaches a voiceless hero too (who stays voiceless at 0 HP)
        const t0 = op.tgt || 'self';
        const a = env.actor;
        const ts = t0 === 'self' ? [a] : t0 === 'ally' ? [O.other(S, a)] : t0 === 'both' ? S.heroes.slice() : t0 === 'front' ? [O.front(S)] : [O.back(S)];
        ts.filter(Boolean).forEach((h) => { const before = h.maxHp; h.maxHp = Math.max(1, h.maxHp + n); const d = h.maxHp - before; if (h.down) return; if (d > 0) h.hp = Math.min(h.maxHp, h.hp + d); else h.hp = Math.min(h.hp, h.maxHp); });
        break;
      }
      case 'revive': {
        let h = env.hookOn === 'onHeroDown' && env.downed && env.downed.down ? env.downed : S.heroes.find((x) => x.down);
        if (!h) break;
        const hp = op.pct !== undefined ? Math.round(op.pct * h.maxHp) : Math.floor(oV(S, op.n, env));
        h.down = false; h.hp = Math.max(1, Math.min(h.maxHp, hp));
        const o = O.other(S, h);
        if (h.row === 'front' && o) { o.row = 'front'; h.row = 'back'; }
        oRowStatuses(S, h);
        break;
      }
      case 'hook': S.hooks.push({ def: op, owner: env.actor ? env.actor.id : null, count: 0, fired: 0, turn: 0, active: true, born: env.serial }); break;
      case 'pick': oPick(S, op, env); break;
      default: throw new Error('oracle: unknown op ' + op.op);
    }
  }
}
// hooks the oracle registered itself (a card's own hook reacting to a later op of the same card, Charms in the A/B worlds are measured, not simulated)
function oFire(S, on, ev) {
  S.hooks.filter((h) => h.def.on === on && h.active).forEach((h) => {
    const owner = h.owner ? O.hero(S, h.owner) : null;
    if (owner && owner.down) return;
    if (h.born !== undefined && ev.serial !== undefined && h.born === ev.serial) return;
    const f = h.def.filter || {};
    if (owner && ev.hero && f.hero !== 'any' && ev.hero !== owner) return;
    h.count += 1;
    if (h.def.every && h.count % h.def.every) return;
    if (h.def.limit !== undefined && h.turn >= h.def.limit) return;
    if (h.def.once && h.fired) return;
    h.turn += 1; h.fired += 1;
    if (h.def.once) h.active = false;
    oRun(S, h.def.fx, { kind: 'hook', actor: owner || ev.hero || O.front(S), target: null, X: 0, hookOn: on });
  });
}
// the card's own ops as DESIGN 4.3 resolves them, independently of data_text: upgrade, keywords, cost, mechanics (as plus on dmg ops)
function defOf(id, up) {
  const c = D.cards[id];
  const u = up && c.up ? c.up : {};
  return { fx: u.fx || c.fx || [], cost: u.cost !== undefined ? u.cost : c.cost, kw: (u.kw !== undefined ? u.kw : (c.kw || [])).slice(), mech: (up && c.up && c.up.mech !== undefined ? c.up.mech : c.mech) || null, type: c.type, hero: c.hero };
}
function addPlusToDmg(fx, n) {
  const out = JSON.parse(JSON.stringify(fx));
  const walk = (ops) => list(ops).forEach((o) => { if (!o) return; if (o.op === 'dmg') o.plus = (o.plus || 0) + n; if (o.op === 'cond') { walk(o.then); walk(o.else); } if (o.op === 'repeat') walk(o.do); });
  walk(out);
  return out;
}
// play a card in the oracle: S is a snapshot taken with the card in hand; d is {fx, cost, kw, mech, type, hero} (defOf or a gemmed variant)
function oPlay(S, uid, d, targetId) {
  const i = S.hand.findIndex((c) => c.uid === uid);
  const card = S.hand.splice(i, 1)[0];
  const actor = D.heroes[d.hero] ? O.hero(S, d.hero) : O.front(S);
  const X = d.cost === 'X' ? S.energy : 0;
  S.energy -= d.cost === 'X' ? X : d.cost;
  let fx = d.fx;
  const m = d.mech || {};
  const bonus = (m.fanbase ? (card.enc || 0) : 0) + (m.remix ? m.remix * (card.rmx || 0) : 0) + (m.hype ? m.hype * S.counters.cards : 0);
  if (bonus) fx = addPlusToDmg(fx, bonus);
  const target = targetId ? S.enemies.find((e) => e.id === targetId) : null;
  const env = { kind: 'card', actor, card, X, target, lastKill: false, picked: 0, src: card, mech: m, serial: 'play' };
  oRun(S, fx, env);
  if (m.loop && S.lastPlayed && O.living(S).length) for (let k = 0; k < m.loop; k++) oPlace(S, [Object.assign({}, S.lastPlayed, { uid: tmpUid++, tmp: true, fade: true, keep: undefined, rmx: undefined })], 'hand');
  if (m.remix) card.rmx = (card.rmx || 0) + 1;
  const kw = d.kw.slice();
  if (card.fade && kw.indexOf('exhaust') < 0) kw.push('exhaust');
  if (d.type === 'power') S.powers.push(card);
  else if (kw.indexOf('exhaust') >= 0) { S.exhaust.push(card); S.exhausted += 1; oFire(S, 'onExhaust', { hero: actor, card }); }
  else S.discard.push(card);
  // hero passives (DESIGN 4.4: hero passives fire first) and hooks registered before this play
  if (actor && !actor.down) {
    const pas = D.heroes[actor.id].passives || [];
    pas.forEach((p) => {
      if (p.on !== 'onPlay') return;
      if (p.filter && p.filter.type && list(p.filter.type).indexOf(d.type) < 0) return;
      const key = actor.id + ':' + p.id;
      if (p.limit !== undefined && (S.passive[key] || 0) >= p.limit) return;
      S.passive[key] = (S.passive[key] || 0) + 1;
      oRun(S, p.fx, { kind: 'hook', actor, target, X: 0, hookOn: 'onPlay' });
    });
  }
  oFire(S, 'onPlay', { hero: actor, card, serial: 'play' });
  S.counters.cards += 1;
  if (d.type === 'attack') S.counters.attacks += 1;
  if (d.type === 'skill') S.counters.skills += 1;
  if ((d.type === 'attack' || d.type === 'skill') && !m.loop) S.lastPlayed = Object.assign({}, card);
  return card;
}

// ================================================================================================ 1. CARDS: text carries the data
const heroCards = Object.values(D.cards).filter((c) => HEROES.indexOf(c.hero) >= 0);
const junkCards = Object.values(D.cards).filter((c) => c.hero === 'curse' || c.hero === 'status');
// the numbers an op list prints (DESIGN 5.1 wording: "a card" for 1, a hit count of 1 is not printed, "Lead:" and "Backing:" carry rows)
function printedNumbers(fx, mech) {
  const nums = [];
  const v = (x) => {
    if (isNum(x)) { nums.push(Math.abs(x)); return; }
    if (!isObj(x)) return;
    if (x.base) nums.push(x.base);
    if (x.mul !== undefined && Number.isInteger(x.mul) && x.mul !== 1) nums.push(x.mul);
    if (x.upTo !== undefined) nums.push(x.upTo);
    if (x.cap !== undefined) nums.push(x.cap);
  };
  const temp = new Set();
  // a status taken back by a once turn hook prints once ("until the end of this turn"): the negative copy is not a separate number
  list(fx).forEach((o, i) => { if (o && o.op === 'hook' && o.once && list(o.fx).length === 1 && o.fx[0].op === 'status' && isNum(o.fx[0].n) && o.fx[0].n < 0) temp.add(o.fx[0]); });
  D.walkOps(fx, (o) => {
    if (temp.has(o)) return;
    if (o.op === 'pick') { if (isNum(o.n) && o.n !== 1) nums.push(o.n); if (o.top && o.top !== 1) nums.push(o.top); return; }
    if (o.op === 'add') { if (isNum(o.n) && o.n !== 1) nums.push(o.n); return; }
    if (o.op === 'hook') { if (o.limit && o.limit > 1) nums.push(o.limit); if (o.every) nums.push(o.every); return; }
    if (o.op === 'cond') {
      const c = o.if;
      ['status', 'targetStatus', 'cardsPlayed', 'attacksPlayed', 'turn', 'block', 'energy', 'handSize', 'enemies'].forEach((k) => {
        if (!c[k]) return;
        if (c[k].gte !== undefined && c[k].gte > 1) nums.push(c[k].gte);
        if (c[k].lte !== undefined && c[k].lte > 0) nums.push(c[k].lte);
      });
      if (c.hpPct) { if (c.hpPct.lt !== undefined) nums.push(Math.round(c.hpPct.lt * 100)); if (c.hpPct.gt !== undefined) nums.push(Math.round(c.hpPct.gt * 100)); }
      return;
    }
    if (o.op === 'revive') { if (o.pct !== undefined) nums.push(Math.round(o.pct * 100)); else v(o.n); return; }
    if (o.op === 'swap') return;
    if (o.n !== undefined && !(o.op === 'status' && isObj(o.n) && o.n.per === 'status' && o.n.s === o.s && !o.n.base && o.n.mul === undefined)) v(o.n);
    else if (o.op === 'status' && isObj(o.n) && o.n.cap !== undefined) nums.push(o.n.cap);
    if (o.hits !== undefined && !(isNum(o.hits) && o.hits === 1)) v(o.hits);
    if (isObj(o.consume) && isNum(o.consume.upTo)) nums.push(o.consume.upTo);
  });
  if (mech) Object.keys(mech).forEach((k) => { if (!(k === 'loop' && mech[k] === 1)) nums.push(mech[k]); });
  return nums;
}
const hasNum = (text, n) => new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(text);
const KW_WORD = { exhaust: 'Fade', retain: 'Hold', innate: 'Opener', ethereal: 'One Take', unplayable: 'Unplayable' };
const TGT_WORD = { all: /all (other )?enemies/, ally: /ally/, both: /both heroes/i, random: /random/, lowest: /lowest HP/, others: /other enemies/ };

t.test('cards: every number, status, keyword and target of every card (base and upgraded) is in its text', () => {
  let n = 0;
  heroCards.concat(junkCards).forEach((c) => [0, 1].forEach((up) => {
    if (up && !c.up) return;
    const d = defOf(c.id, up);
    const text = D.cardPlain({ id: c.id, up, gems: [] });
    const tag = `${c.id}${up ? '+' : ''} "${text}"`;
    n++;
    printedNumbers(d.fx, d.mech).forEach((x) => t.ok(hasNum(text, x), `${tag} prints ${x}`));
    D.walkOps(d.fx, (o) => {
      if ((o.op === 'status' || o.op === 'removeStatus') && D.statuses[o.s]) {
        const nm = D.statuses[o.s].name;
        const alt = o.s === 'plating' ? 'Sequin' : nm;
        t.ok(text.indexOf(nm) >= 0 || text.indexOf(alt) >= 0 || (D.statuses[o.s].kind === 'resource' && D.statuses[o.s].hero !== c.hero), `${tag} names ${nm}`);
      }
      if (o.tgt && TGT_WORD[o.tgt] && !(o.op === 'status' && isNum(o.n) && o.n < 0)) t.ok(TGT_WORD[o.tgt].test(text), `${tag} says who (${o.tgt})`);
      if (o.op === 'cond' && o.if.row) t.ok(/Lead|Backing|lead|backing/.test(text), `${tag} names the spot`);
    });
    d.kw.forEach((k) => t.ok(text.indexOf(KW_WORD[k]) >= 0, `${tag} shows ${KW_WORD[k]}`));
    ['Fade', 'Hold', 'Opener', 'One Take', 'Unplayable'].forEach((w) => {
      const k = Object.keys(KW_WORD).find((x) => KW_WORD[x] === w);
      if (d.kw.indexOf(k) < 0 && w !== 'Fade') t.ok(!new RegExp('(^|\\. )' + w + '\\.').test(text), `${tag} does not claim ${w}`);
    });
    if (d.mech) Object.keys(d.mech).forEach((k) => t.ok(text.indexOf(D.keywords[k].name) >= 0, `${tag} names ${D.keywords[k].name}`));
  }));
  t.eq(n, heroCards.length * 2 + junkCards.filter((c) => c.up).length + junkCards.length, 'every card text was read');
});

// ================================================================================================ 2. CARDS: the engine does what the text says
// set ups. bare: nothing. rich: the owner holds 5 of their resource, Block, Volume, Feedback, is hurt and took damage last enemy turn;
// the target is poisoned, sizzling, muffled, starstruck, exposed and tagged. after: an owner skill was played first and the owner is
// below 50% HP. kill: the target has 1 HP (lastKill, Fanbase, onKill).
function setUp(C, owner, kind) {
  const h = heroU(C, owner), a = C.heroes.find((x) => x.id !== owner);
  if (kind === 'rich') {
    h.st[resOf(owner)] = 5; h.block = 6; a.block = 4; h.st.might = 1; h.st.thorns = (h.st.thorns || 0) + 1;
    h.hp = h.maxHp - 12; a.hp = a.maxHp - 8; h._dmgTaken = 9; h._hitsTaken = 2;
    const e = C.enemies[0];
    Object.assign(e.st, { poison: 3, burn: 4, weak: 1, stun: 1, vulnerable: 1, mark: 2 });
    if (C.enemies[1]) C.enemies[1].st.poison = 1;
  }
  if (kind === 'after') {
    h.hp = Math.floor(h.maxHp * 0.4);
    const sk = starterOf(owner, 'skill');
    const c = toHand(C, sk);
    C.energy = 9;
    playUid(C, c.uid);
  }
  C.energy = 4;
}
function auditCard(c, up, back, kind, k) {
  const owner = c.hero;
  const partner = partnerOf(owner, k);
  const d = defOf(c.id, up);
  const one = (() => { let r = false; D.walkOps(d.fx, (o) => { if (o.tgt === 'random' || (o.op === 'pick' && o.random)) r = true; }); return r; })();
  if (kind === 'kill' && one) return null;
  const enemies = kind === 'kill' ? ['ea_weak', 'ea_dummy'] : one ? ['ea_dummy'] : ['ea_dummy', 'ea_dummy2'];
  const card = inst(c.id, up);
  const C = fight({ owner, partner, back, enemies, deck: [card], seed: 3 + k });
  toHand(C, card.uid);
  setUp(C, owner, kind);
  if (!C.canPlay(card.uid, C.needsTarget(card.uid) ? firstTarget(C) : undefined).ok) return { skipped: 'cannot play' };
  const S = snap(C);
  // counters the snapshot cannot see: what was played this turn (the after set up played one owner skill)
  S.counters = kind === 'after' ? { cards: 1, attacks: 0, skills: 1 } : { cards: 0, attacks: 0, skills: 0 };
  if (kind === 'after' && D.heroes[owner].passives.some((p) => p.on === 'onPlay' && p.filter && p.filter.type === 'skill')) S.passive[owner + ':' + D.heroes[owner].passives[0].id] = 1;
  const tgt = C.needsTarget(card.uid) ? firstTarget(C) : undefined;
  oPlay(S, card.uid, d, tgt);
  playUid(C, card.uid);
  if (S.nondet) return { skipped: S.nondet };
  const got = snap(C);
  const played = [got.hand, got.discard, got.exhaust, got.powers].flat().find((x) => x.uid === card.uid);
  const want = [S.hand, S.discard, S.exhaust, S.powers].flat().find((x) => x.uid === card.uid);
  const dv = diffs(view(got), view(S));
  if (played && want) { if ((played.enc || 0) !== (want.enc || 0)) dv.push(`Fanbase enc: engine ${played.enc} vs text ${want.enc}`); if ((played.rmx || 0) !== (want.rmx || 0)) dv.push(`Remix plays: engine ${played.rmx} vs text ${want.rmx}`); }
  return { dv };
}
t.test('cards: every card, base and upgraded, in both spots and four set ups, does exactly what its ops say in a real combat', () => {
  let played = 0;
  const skipped = {};
  heroCards.forEach((c, k) => [0, 1].forEach((up) => {
    if (up && !c.up) return;
    ['bare', 'rich', 'after', 'kill'].forEach((kind) => [false, true].forEach((back) => {
      if (kind === 'kill' && back) return;
      const r = auditCard(c, up, back, kind, k);
      if (!r) return;
      if (r.skipped) { skipped[r.skipped] = (skipped[r.skipped] || 0) + 1; return; }
      played++;
      t.ok(r.dv.length === 0, `${c.id}${up ? '+' : ''} (${kind}, ${back ? 'backing' : 'lead'}) "${D.cardPlain({ id: c.id, up, gems: [] })}": ${r.dv.join('; ')}`);
    }));
  }));
  if (VERBOSE) console.log('  card plays audited:', played, 'skipped:', J(skipped));
  t.ok(played > 2000, 'card plays audited: ' + played);
});

t.test('cards: the number printed on a card in hand (live Volume, spot and Block bonuses) is the number the play deals or gives', () => {
  let n = 0;
  heroCards.forEach((c, k) => [0, 1].forEach((up) => ['bare', 'rich'].forEach((kind) => [false, true].forEach((back) => {
    const d = defOf(c.id, up);
    const first = d.fx[0];
    if (!first || d.mech) return;
    const plainDmg = first.op === 'dmg' && isNum(first.n) && !first.consume;
    const plainBlock = first.op === 'block' && isNum(first.n) && (first.tgt || 'self') === 'self' && !first.consume;
    if (!plainDmg && !plainBlock) return;
    const card = inst(c.id, up);
    const C = fight({ owner: c.hero, partner: partnerOf(c.hero, k), back, enemies: ['ea_dummy'], deck: [card], seed: 5 });
    toHand(C, card.uid);
    setUp(C, c.hero, kind);
    C.enemies[0].st = {};                                                     // the text never knows the target: Exposed and Tag are the preview's job
    const owner = heroU(C, c.hero);
    const text = D.cardPlain(card, { unit: owner, C });
    const m = plainDmg ? /[Dd]eal (\d+) damage/.exec(text) : /[Gg]ain (\d+) Block/.exec(text);
    if (!m) return t.ok(false, `${c.id}: no leading number in "${text}"`);
    const ev = playUid(C, card.uid);
    const e = plainDmg ? ev.find((x) => x.type === 'hit') : ev.find((x) => x.type === 'block' && x.dst.id === c.hero);
    if (!e && !isNum(first.hits === undefined ? 1 : first.hits)) return;      // a hit count that reads a counter (0 right now)
    n++;
    t.eq(Number(m[1]), plainDmg ? e && e.raw : e && e.amount, `${c.id}${up ? '+' : ''} (${kind}, ${back ? 'backing' : 'lead'}) prints "${m[0]}" and the play ${plainDmg ? 'hits for' : 'gives'}`);
  }))));
  t.ok(n > 300, 'live numbers checked: ' + n);
});

// ================================================================================================ 3. HOOKS: A/B worlds
// effect of an event slice as a flat map: u:<unit>:hp|block|maxHp|st:<s>, energy, drawn, added, gold, ink, exhausted
function effect(evs) {
  const m = {};
  const add = (k, v) => { if (v) m[k] = (m[k] || 0) + v; };
  const down = new Set();
  evs.forEach((e) => {
    switch (e.type) {
      case 'hit': add('u:' + e.dst.id + ':hp', -e.amount); add('u:' + e.dst.id + ':block', -e.blocked); break;
      case 'hurt': case 'thorns': add('u:' + e.dst.id + ':hp', -e.amount); break;
      case 'heal': add('u:' + e.dst.id + ':hp', e.amount); break;
      case 'block': add('u:' + e.dst.id + ':block', e.amount); break;
      // the turn start clear only wipes earlier Block (from earlier steps), never part of what a hook just did
      case 'block_lost': if (e.cause !== 'hit' && e.cause !== 'turn') add('u:' + e.dst.id + ':block', -e.amount); break;
      case 'status': add('u:' + e.dst.id + ':st:' + e.s, e.delta); break;
      case 'max_hp': add('u:' + e.hero + ':maxHp', e.n); if (e.n > 0 && !down.has(e.hero)) add('u:' + e.hero + ':hp', e.n); break;
      case 'hero_down': down.add(e.hero); break;
      case 'hero_revive': down.delete(e.hero); add('u:' + e.hero + ':hp', e.hp); break;
      case 'energy': add('energy', e.delta); break;
      case 'draw': add('drawn', e.cards.length); break;
      case 'add_card': add('added', e.cards.length); break;
      case 'discard': if (e.reason === 'overflow') add('added', e.cards.length); break;
      case 'gold': add('gold', e.n); break;
      case 'ink': add('ink', e.n); break;
      case 'exhaust': add('exhausted', 1); break;
      default: break;
    }
  });
  return m;
}
function sub(a, b) { const m = Object.assign({}, a); Object.keys(b).forEach((k) => { m[k] = (m[k] || 0) - b[k]; if (!m[k]) delete m[k]; }); return m; }
// what the oracle says changed between two of its states, in the same flat map
function oEffect(S0, S1) {
  const m = {};
  const add = (k, v) => { if (v) m[k] = (m[k] || 0) + v; };
  S1.heroes.concat(S1.enemies).forEach((u1) => {
    const u0 = S0.heroes.concat(S0.enemies).find((x) => x.id === u1.id);
    add('u:' + u1.id + ':hp', u1.hp - u0.hp); add('u:' + u1.id + ':block', u1.block - u0.block); add('u:' + u1.id + ':maxHp', u1.maxHp - u0.maxHp);
    new Set(Object.keys(u0.st).concat(Object.keys(u1.st))).forEach((s) => add('u:' + u1.id + ':st:' + s, (u1.st[s] || 0) - (u0.st[s] || 0)));
  });
  ['energy', 'drawn', 'added', 'gold', 'ink', 'exhausted'].forEach((k) => add(k, S1[k] - S0[k]));
  return m;
}
const sortM = (m) => { const o = {}; Object.keys(m).sort().forEach((k) => { if (m[k]) o[k] = m[k]; }); return J(o); };
// the hook's own bookkeeping, as DESIGN 4.4 says: owner, hero filter, card filters, then count, every, limit, once
function hookFires(def, owner, hs, trig) {
  const f = def.filter || {};
  if (!hs.active) return false;
  if (owner && trig.hero && f.hero !== 'any' && trig.hero !== owner) return false;
  if (!owner && f.hero && f.hero !== 'any' && (trig.hero || trig.front) !== f.hero) return false;
  if (f.type !== undefined && list(f.type).indexOf(trig.type) < 0) return false;
  if (f.cost !== undefined && !inRange(trig.cost, f.cost)) return false;
  if (f.tier !== undefined && list(f.tier).indexOf(trig.tier) < 0) return false;
  if (f.gems !== undefined && (trig.gems || 0) < (f.gems.gte || 0)) return false;
  if (f.kw !== undefined && !list(f.kw).some((k) => (trig.kw || []).indexOf(k) >= 0)) return false;
  hs.count += 1;
  if (def.every && hs.count % def.every !== 0) return false;
  if (def.limit !== undefined && hs.turn >= def.limit) return false;
  if (def.once && hs.fired) return false;
  hs.turn += 1; hs.fired += 1;
  if (def.once) hs.active = false;
  return true;
}
// add what A gained over B before a step (earlier fires) to B's state after the step; Block only survives inside one turn
function diverge(post, preA, preB, keepBlock) {
  const S = JSON.parse(JSON.stringify(post));
  S.heroes.concat(S.enemies).forEach((u) => {
    const a = preA.heroes.concat(preA.enemies).find((x) => x.id === u.id), b = preB.heroes.concat(preB.enemies).find((x) => x.id === u.id);
    if (!a || !b) return;
    u.hp = Math.max(0, Math.min(u.maxHp + a.maxHp - b.maxHp, u.hp + a.hp - b.hp)); u.maxHp += a.maxHp - b.maxHp;
    if (keepBlock) u.block = Math.max(0, u.block + a.block - b.block);
    new Set(Object.keys(a.st).concat(Object.keys(b.st))).forEach((k) => { let v = (u.st[k] || 0) + (a.st[k] || 0) - (b.st[k] || 0); if (k !== 'might') v = Math.max(0, v); if (v) u.st[k] = v; else delete u.st[k]; });
  });
  S.energy += preA.energy - preB.energy;
  return S;
}
const ACTOR_TRIG = ['onPlay', 'onDamaged', 'onKill', 'onSwap', 'onHeroDown', 'onExhaust'];
// One A/B audit. spec: { label, def (the hook), src, srcId, owner (hero id or null), make() -> C (a fresh, identical world each call),
//   steps: [{ act(C) -> events, slice(events) -> events, pre (true: the hook reads the state before the step), trig: [{hero, type, cost, gems, tier, kw}],
//   target(C) -> enemy unit id for 'enemy' ops (onPlay: the card's target, onDamaged: the attacker), newTurn }] }
function auditHook(spec) {
  const pred = (h) => h.src === spec.src && h.srcId === spec.srcId && h.on === spec.def.on && J(h.fx) === J(spec.def.fx);
  const unhook = (C) => { for (let i = C._hooks.length - 1; i >= 0; i--) if (pred(C._hooks[i])) { C._hooks.splice(i, 1); return true; } return false; };
  // spec.preStart: the hook is taken out of B before C.start() (combatStart and turn 1 hooks)
  const A = spec.make(null), B = spec.make(spec.preStart ? unhook : null);
  const hasA = A._hooks.some(pred) || (spec.def.once && A.events.some((e) => e.type === 'relic' && e.id === spec.srcId));
  if (!hasA) return [`${spec.label}: the hook was never registered`];
  if (!spec.preStart) unhook(B);
  const hs = { count: 0, turn: 0, fired: 0, active: true };
  const out = [];
  let fires = 0;
  spec.steps.forEach((st, si) => {
    if (st.newTurn) hs.turn = 0;
    const preB = st.preState ? st.preState(B) : snap(B), preA = st.preState ? st.preState(A) : snap(A);
    const evA = st.act(A, true), evB = st.act(B, false);
    const got = sub(effect(st.slice(evA)), effect(st.slice(evB)));
    // the state the hook reads: A before the step, or B after the step plus whatever earlier fires already changed in A (B never had them)
    const S0 = JSON.parse(JSON.stringify(st.pre ? preA : diverge(st.postState ? st.postState(B) : snap(B), preA, preB, !st.newTurn)));
    const S = JSON.parse(JSON.stringify(S0));
    st.trig.forEach((tr) => {
      if (!hookFires(spec.def, spec.owner, hs, tr)) return;
      fires++;
      const actorId = spec.owner || (ACTOR_TRIG.indexOf(spec.def.on) >= 0 && tr.hero ? tr.hero : O.front(S).id);
      const actor = O.hero(S, actorId);
      if (!actor || actor.down && spec.def.on !== 'onHeroDown') return;
      const tid = st.target ? st.target(B) : null;
      oRun(S, spec.def.fx, { kind: 'hook', actor, target: tid ? S.enemies.find((e) => e.id === tid) : null, X: 0, hookOn: spec.def.on, card: tr.card || null, downed: tr.downed ? O.hero(S, tr.downed) : null });
    });
    if (S.nondet) { out.push(`${spec.label} step ${si + 1}: cannot be predicted (${S.nondet})`); return; }
    const want = oEffect(S0, S);
    if (sortM(got) !== sortM(want)) out.push(`${spec.label} step ${si + 1}: engine ${sortM(got)} vs text ${sortM(want)}`);
  });
  spec.fires = fires;
  return out;
}
// step builders
const sliceFrom = (type, who) => (ev) => { let i = -1; ev.forEach((e, k) => { if (e.type === type && (!who || e.who === who)) i = k; }); return i < 0 ? [] : ev.slice(i); };
const sliceUntil = (type, who) => (ev) => { const i = ev.findIndex((e) => e.type === type && (!who || e.who === who)); return i < 0 ? ev : ev.slice(0, i); };
const sliceEnemyAct = (ev) => { const i = ev.findIndex((e) => e.type === 'enemy_act'); const j = ev.findIndex((e, k) => k > i && e.type === 'turn_end' && e.who === 'enemy'); return i < 0 ? [] : ev.slice(i, j < 0 ? ev.length : j); };
const all = (ev) => ev;
// the onPlay trigger card plays from a fresh instance, so it is added to the hand directly
function playFresh(C, cardId, gems) { const c = inst(cardId, 0, gems); C.hand.push(c); C.energy = 9; return playUid(C, c.uid); }
function playStepFresh(cardId, gems, hero) {
  const d = D.cards[cardId];
  return { act: (C) => playFresh(C, cardId, gems), slice: all, pre: false, target: (C) => firstTarget(C), trig: [{ hero: hero || d.hero, type: d.type, cost: d.cost, gems: (gems || []).filter(Boolean).length, kw: d.kw || [] }] };
}
const endTurnStart = () => ({ act: (C) => C.endTurn(), slice: sliceFrom('turn_start', 'player'), pre: false, trig: [{}], newTurn: true });
const endTurnEnd = () => ({ act: (C) => C.endTurn(), slice: sliceUntil('turn_end', 'player'), pre: true, trig: [{}], resetAfter: true });
const swapStep = (hero) => ({ act: (C) => { C.energy = 9; return C.swap(); }, slice: all, pre: false, trig: [{ hero }] });
const hitStep = (hero, n) => ({ act: (C) => C.endTurn(), slice: sliceEnemyAct, pre: true, trig: Array.from({ length: n || 3 }, () => ({ hero })), target: (C) => C.enemies.find((e) => e.def === 'ea_zero').id, resetAfter: true });
// a hook that only says plain numbers can be triggered several times and checked fire by fire
const constantFx = (fx) => { let ok = true; D.walkOps(fx, (o) => { if (isObj(o.n) || isObj(o.hits) || o.op === 'cond') ok = false; }); return ok; };
const needsOneEnemy = (fx, on) => { let r = false; D.walkOps(fx, (o) => { if (o.tgt === 'random' || (o.tgt === 'enemy' && on !== 'onPlay' && on !== 'onDamaged') || (o.op === 'dmg' && !o.tgt && on !== 'onPlay' && on !== 'onDamaged')) r = true; }); return r; };
const repeatN = (def) => (def.every ? def.every : def.limit !== undefined ? def.limit + 1 : def.once ? 2 : constantFx(def.fx) ? 2 : 1);
// fix the per step bookkeeping of auditHook for the step kinds above (limit resets at the start of each player turn)
const withTurns = (steps) => { const out = []; steps.forEach((s, i) => { const prev = steps[i - 1]; out.push(Object.assign({}, s, { newTurn: s.newTurn || !!(prev && prev.resetAfter) })); }); return out; };
function triggerSpecs(def, owner, partner, mk) {
  const specs = [];
  const n = repeatN(def);
  const f = def.filter || {};
  const any = f.hero === 'any';
  const typeFor = (want) => (list(f.type).length ? list(f.type)[0] : want);
  switch (def.on) {
    case 'turnStart': specs.push({ tag: 'turn starts', steps: Array.from({ length: n }, endTurnStart), enemies: needsOneEnemy(def.fx, def.on) ? ['ea_dummy'] : null, expectFire: true }); break;
    case 'turnEnd': specs.push({ tag: 'turn ends', steps: Array.from({ length: n }, endTurnEnd), enemies: needsOneEnemy(def.fx, def.on) ? ['ea_dummy'] : null, expectFire: true }); break;
    case 'onPlay': {
      const own = starterOf(owner, typeFor('attack'));
      specs.push({ tag: 'its hero plays a ' + typeFor('attack'), steps: Array.from({ length: n }, () => playStepFresh(own)), expectFire: true });
      const pc = starterOf(partner, typeFor('attack'));
      specs.push({ tag: 'the ally plays a ' + typeFor('attack') + (any ? ' (either hero)' : ' (you only)'), steps: [playStepFresh(pc)], expectFire: any });
      if (f.type) { const other = starterOf(owner, list(f.type)[0] === 'attack' ? 'skill' : 'attack'); specs.push({ tag: 'a card of the wrong type', steps: [playStepFresh(other)], expectFire: false }); }
      break;
    }
    case 'onSwap': specs.push({ tag: 'swaps', steps: Array.from({ length: n }, (_, i) => swapStep(i % 2 === 0 ? partner : owner)), expectFire: any || n > 1 }); break;
    case 'onDamaged':
      specs.push({ tag: 'its hero is hit 3 times', steps: [hitStep(owner, 3)], enemies: ['ea_zero'], expectFire: true });
      specs.push({ tag: 'the ally is hit' + (any ? ' (either hero)' : ' (you only)'), back: true, steps: [hitStep(partner, 3)], enemies: ['ea_zero'], expectFire: any });
      break;
    case 'onKill': {
      specs.push({ tag: 'its hero defeats an enemy', steps: [playStepFresh(starterOf(owner, 'attack'))].map((s) => Object.assign(s, { trig: [Object.assign({}, s.trig[0], { tier: 'normal' })] })), enemies: ['ea_weak', 'ea_dummy'], expectFire: true });
      specs.push({ tag: 'the ally defeats an enemy' + (any ? ' (either hero)' : ' (you only)'), steps: [playStepFresh(starterOf(partner, 'attack'))].map((s) => Object.assign(s, { trig: [Object.assign({}, s.trig[0], { tier: 'normal' })] })), enemies: ['ea_weak', 'ea_dummy'], expectFire: any });
      break;
    }
    default: break;
  }
  const one = needsOneEnemy(def.fx, def.on) ? ['ea_dummy'] : null;
  specs.forEach((x) => { if (!x.enemies) x.enemies = one; });
  return specs;
}
// every hook op inside a card (top level or inside a branch), with the card set up so the branch is taken
function cardHooks(fx) { const out = []; D.walkOps(fx, (o) => { if (o.op === 'hook') out.push(o); }); return out; }
t.test('card hooks: every power and once hook, base and upgraded, fires on its trigger with the effect, limit, once and every its text states', () => {
  let n = 0, fired = 0;
  heroCards.forEach((c, k) => [0, 1].forEach((up) => {
    if (up && !c.up) return;
    const d = defOf(c.id, up);
    const hooks = cardHooks(d.fx);
    hooks.forEach((def) => {
      if (def.on === 'onHeroDown') return;                                                 // checked by its own test below
      const owner = c.hero, partner = partnerOf(owner, k);
      triggerSpecs(def, owner, partner).forEach((ts) => {
        const make = () => {
          uidSeq = 5000;
          const card = inst(c.id, up);
          const C = fight({ owner, partner, back: !!ts.back, enemies: ts.enemies || ['ea_dummy', 'ea_dummy2'], deck: [card], seed: 11 });
          const h = heroU(C, owner);
          h.st[resOf(owner)] = 4; h.block = 12; C.heroes.forEach((x) => { x.hp = x.maxHp - 10; });
          toHand(C, card.uid);
          C.energy = 9;
          playUid(C, card.uid);
          return C;
        };
        const spec = { label: `${c.id}${up ? '+' : ''} "${D.cardPlain({ id: c.id, up, gems: [] })}" when ${ts.tag}`, def, src: 'card', srcId: c.id, owner, make, steps: withTurns(ts.steps) };
        const errs = auditHook(spec);
        n++;
        t.ok(errs.length === 0, errs.join(' | '));
        if (ts.expectFire) { t.ok(spec.fires > 0, `${spec.label}: the hook fired`); fired++; } else t.eq(spec.fires, 0, `${spec.label}: the hook stays quiet`);
      });
    });
  }));
  if (VERBOSE) console.log('  card hook scenarios:', n, 'expected to fire:', fired);
  t.ok(n >= 80, 'card hook scenarios: ' + n);
});

// ================================================================================================ 4. CHARMS in combat
const GEM_FOR = { red: 'ember_ruby', blue: 'tidewatch_sapphire', green: 'keepsake_peridot', gold: 'sunwake_topaz', any: 'ember_ruby' };
const simpleCard = (c) => {
  if (c.type === 'power' || c.cost === 'X' || c.mech || c.hand || !isNum(c.cost)) return false;
  let ok = true;
  D.walkOps(c.fx, (o) => { if (['pick', 'hook', 'swap', 'cond', 'repeat', 'hurt', 'add'].indexOf(o.op) >= 0 || o.tgt === 'random' || o.consume || isObj(o.n) || isObj(o.hits)) ok = false; });
  return ok;
};
// a card of this hero that matches a Charm's onPlay filter, with gems socketed when the filter asks for them
function triggerCard(heroId, f) {
  f = f || {};
  const cands = Object.values(D.cards).filter((c) => c.hero === heroId && simpleCard(c) && (!f.type || list(f.type).indexOf(c.type) >= 0) && (f.cost === undefined || inRange(c.cost, f.cost))
    && (!f.gems || (c.slots || []).length >= f.gems.gte) && (!f.kw || list(f.kw).some((k) => (c.kw || []).indexOf(k) >= 0)));
  cands.sort((a, b) => (a.rarity === 'starter' ? 0 : 1) - (b.rarity === 'starter' ? 0 : 1) || (a.id < b.id ? -1 : 1));
  const c = cands[0];
  if (!c) return null;
  const gems = (c.slots || []).map((sl, i) => (f.gems && i < f.gems.gte ? GEM_FOR[sl] : null));
  return { id: c.id, gems };
}
const exhaustCard = (heroId) => Object.values(D.cards).filter((c) => c.hero === heroId && (c.kw || []).indexOf('exhaust') >= 0 && c.type === 'skill' && isNum(c.cost) && !c.mech && !(() => { let p = false; D.walkOps(c.fx, (o) => { if (o.op === 'pick' || o.op === 'hook' || o.tgt === 'random' || o.op === 'swap') p = true; }); return p; })()).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
const startStep = (slice) => ({ act: (C) => C.startEv, slice, pre: false, preState: (C) => C.startSnap, postState: (C) => snap(C), trig: [{}], newTurn: true });
function relicSpecs(r, def, h0, h1) {
  const specs = [];
  const f = def.filter || {};
  const n = repeatN(def);
  const party = !r.hero;
  const one = needsOneEnemy(def.fx, def.on) ? ['ea_dummy'] : null;
  switch (def.on) {
    case 'combatStart': specs.push({ tag: 'the fight starts', steps: [{ act: (C) => C.startEv, slice: sliceUntil('intent'), pre: true, preState: (C) => C.startSnap, trig: [{}] }], enemies: one, expectFire: true }); break;
    case 'turnStart': specs.push({ tag: 'turns start', steps: [startStep(sliceFrom('turn_start', 'player'))].concat(Array.from({ length: def.every ? def.every : 2 }, endTurnStart)), enemies: one, expectFire: true }); break;
    case 'turnEnd': specs.push({ tag: 'turns end', steps: [endTurnEnd(), endTurnEnd()], enemies: one, expectFire: true }); break;
    case 'onPlay': {
      const tc = triggerCard(h0, f);
      if (!tc) { specs.push({ missing: `no card of ${h0} matches ${J(f)}` }); break; }
      [false, true].forEach((back) => specs.push({ tag: `${h0} plays ${tc.id}${back ? ' from the backing spot' : ''}`, back, steps: Array.from({ length: n }, () => playStepFresh(tc.id, tc.gems)), enemies: one, expectFire: true }));
      const tp = triggerCard(h1, f);
      if (tp) specs.push({ tag: `${h1} plays ${tp.id}` + (party ? ' (either hero)' : ' (its hero only)'), steps: [playStepFresh(tp.id, tp.gems)], enemies: one, expectFire: party });
      if (f.type) { const other = triggerCard(h0, { type: list(f.type)[0] === 'attack' ? 'skill' : 'attack' }); if (other) specs.push({ tag: 'a card of the wrong type', steps: [playStepFresh(other.id, other.gems)], enemies: one, expectFire: false }); }
      if (f.gems || f.cost) { const plain = triggerCard(h0, { type: f.type }); if (plain && (!f.cost || !inRange(D.cards[plain.id].cost, f.cost))) specs.push({ tag: 'a card the filter refuses', steps: [playStepFresh(plain.id, plain.gems.map(() => null))], enemies: one, expectFire: false }); }
      break;
    }
    case 'onSwap': specs.push({ tag: 'swaps', steps: Array.from({ length: Math.max(3, n) }, (_, i) => swapStep(i % 2 === 0 ? h1 : h0)), enemies: one, expectFire: true }); break;
    case 'onDamaged': specs.push({ tag: `${h0} is hit 3 times`, steps: [hitStep(h0, 3)], enemies: ['ea_zero'], expectFire: true }); break;
    case 'onKill': ['ea_weak', 'ea_weak_elite', 'ea_weak_minion'].forEach((foe) => {
      const tier = D.enemies[foe].tier;
      const st = playStepFresh(starterOf(h0, 'attack'));
      st.trig = [Object.assign({}, st.trig[0], { tier })];
      specs.push({ tag: `${h0} defeats a ${tier}`, steps: [st], enemies: [foe, 'ea_dummy'], expectFire: !f.tier || list(f.tier).indexOf(tier) >= 0 });
    });
      { const st = playStepFresh(starterOf(h1, 'attack')); st.trig = [Object.assign({}, st.trig[0], { tier: 'elite' })]; specs.push({ tag: `${h1} defeats a Rival` + (party ? '' : ' (its hero only)'), steps: [st], enemies: ['ea_weak_elite', 'ea_dummy'], expectFire: party && (!f.tier || list(f.tier).indexOf('elite') >= 0) }); }
      break;
    case 'onExhaust': { const ec = exhaustCard(h0); specs.push({ tag: `${h0} plays ${ec.id}, which fades`, steps: [playStepFresh(ec.id)], enemies: one, expectFire: true }); break; }
    case 'onShuffle': specs.push({ tag: 'the draw pile is reshuffled', small: true, steps: [endTurnStart()], enemies: one, expectFire: true }); break;
    case 'combatEnd': { const st = playStepFresh(starterOf(h0, 'attack')); specs.push({ tag: 'the fight is won', steps: [st], enemies: ['ea_weak'], expectFire: true }); break; }
    default: break;
  }
  return specs;
}
t.test('charms: every combat hook of every Charm fires on its trigger, for the right hero, with the numbers its effect states', () => {
  let n = 0;
  const done = new Set();
  Object.values(D.relics).forEach((r) => list(r.hooks).forEach((def) => {
    if (D.LISTS.combatHooks.indexOf(def.on) < 0 || def.on === 'onHeroDown') return;
    const h0 = r.hero || 'hanae', h1 = r.hero ? partnerOf(r.hero, 0) : 'kuro';
    relicSpecs(r, def, h0, h1).forEach((ts) => {
      if (ts.missing) return t.ok(false, `${r.id}: ${ts.missing}`);
      const make = (beforeStart) => {
        uidSeq = 7000;
        const deck = ts.small ? D.heroes[h0].starter.slice(0, 5).map((id) => inst(id)) : [];
        return fight({
          owner: h0, partner: h1, back: !!ts.back, enemies: ts.enemies || ['ea_dummy', 'ea_dummy2'], relics: [r.id], deck, fill: ts.small ? false : undefined, seed: 13,
          beforeStart: (C) => {
            C.heroes.forEach((x) => { x.hp = x.maxHp - 10; x.st.weak = 2; });
            const res = resOf(h0); heroU(C, h0).st[res] = res === 'charge' ? 7 : 2;
            if (beforeStart) beforeStart(C);
          },
        });
      };
      const spec = { label: `${r.id} (${r.name}) "${r.text}" when ${ts.tag}`, def, src: 'relic', srcId: r.id, owner: r.hero || null, make, preStart: true, steps: withTurns(ts.steps) };
      const errs = auditHook(spec);
      n++;
      done.add(r.id);
      t.ok(errs.length === 0, errs.join(' | '));
      if (ts.expectFire) t.ok(spec.fires > 0, `${spec.label}: the Charm fired`); else t.eq(spec.fires, 0, `${spec.label}: the Charm stays quiet`);
    });
  }));
  if (VERBOSE) console.log('  charm combat scenarios:', n, 'charms:', done.size);
  t.ok(done.size >= 35, 'Charms with combat hooks audited: ' + done.size);
});

// ------------------------------------------------------------------------------------------------ losing a voice: the revive hooks
t.test('revive hooks: Guardian Kami brings back whichever hero falls, once, with 50% HP and 10 Block for both; Spare Mic once per fight with 25%', () => {
  [0, 1].forEach((up) => ['suzu', 'hanae'].forEach((victim) => {
    const owner = 'suzu', partner = 'hanae';
    const card = inst('suzu_guardian_kami', up);
    const C = fight({ owner, partner, back: victim !== owner, enemies: ['ea_big'], deck: [card], seed: 4 });
    toHand(C, card.uid); C.energy = 9; playUid(C, card.uid);
    const v = heroU(C, victim);
    t.eq(v.row, 'front', `${victim} stands in the lead to take the blow`);
    const ev = C.endTurn();
    const rev = ev.find((e) => e.type === 'hero_revive');
    const tag = `suzu_guardian_kami${up ? '+' : ''} "${D.cardPlain({ id: 'suzu_guardian_kami', up, gems: [] })}" (${victim} falls)`;
    t.ok(ev.some((e) => e.type === 'hero_down' && e.hero === victim), `${tag}: the hero lost their voice`);
    t.ok(rev && rev.hero === victim && rev.hp === Math.round(0.5 * v.maxHp), `${tag}: back with 50% HP (${rev && rev.hp} of ${v.maxHp})`);
    const blocks = ev.filter((e) => e.type === 'block' && e.amount === 10).map((e) => e.dst.id).sort();
    t.deep(blocks, [owner, partner].sort(), `${tag}: both heroes gain 10 Block`);
    t.eq(C.result, null, `${tag}: the fight goes on`);
    t.eq(v.row, 'back', `${tag}: the revived hero stands in the backing spot`);
    // once: the next fall is final
    C.heroes.forEach((h) => { h.hp = 1; });
    const ev2 = C.endTurn();
    t.ok(!ev2.some((e) => e.type === 'hero_revive'), `${tag}: only the next time`);
  }));
  const C = fight({ owner: 'hanae', partner: 'kuro', enemies: ['ea_big'], relics: ['phoenix_feather'], seed: 4 });
  const ev = C.endTurn();
  const h = heroU(C, 'hanae');
  const rev = ev.find((e) => e.type === 'hero_revive');
  t.ok(rev && rev.hero === 'hanae' && rev.hp === Math.round(0.25 * h.maxHp), `phoenix_feather "${D.relics.phoenix_feather.text}": back with 25% HP (${rev && rev.hp})`);
  heroU(C, 'kuro').hp = 1;
  const ev2 = C.endTurn();
  t.ok(ev2.some((e) => e.type === 'hero_down' && e.hero === 'kuro') && !ev2.some((e) => e.type === 'hero_revive'), 'phoenix_feather: the first time each fight only');
});

// ================================================================================================ 5. STATUSES do what their text says
t.test('statuses: the text of every status (with N filled in) describes exactly what the engine does', () => {
  const ST = D.statuses;
  Object.keys(ST).forEach((s) => {
    const txt = D.statusText(s, 3);
    t.ok(/\b3\b/.test(txt) || !/\bN\b/.test(ST[s].text), `${s}: "${txt}" carries the number`);
    if (ST[s].stack === 'dur' && s !== 'stun') t.ok(/Lasts 3 more rounds/.test(txt), `${s}: a duration says how long it lasts`);
  });
  const W = (o) => fight(Object.assign({ owner: 'hanae', partner: 'kuro', enemies: ['ea_dummy'], seed: 9 }, o));
  const hit = (C, cardId) => { const c = inst(cardId); C.hand.push(c); C.energy = 9; return playUid(C, c.uid).filter((e) => e.type === 'hit'); };
  // Volume: +N per hit
  { const C = W({}); heroU(C, 'hanae').st.might = 3; const hs = hit(C, 'hanae_twin_petals'); t.deep(hs.map((e) => e.raw), [2 + 2 + 3, 2 + 2 + 3], 'Volume 3: every hit of an attack deals 3 more'); }
  // Soundproof: +N on Block from a card and from a Charm, never on Sequins or a spot's start Block
  { const C = W({}); heroU(C, 'kuro').st.bulwark = 2; const c = inst('kuro_ink_ward'); C.hand.push(c); C.energy = 9; const b = playUid(C, c.uid).find((e) => e.type === 'block'); t.eq(b.amount, 5 + 2, 'Soundproof 2: a card gives 2 more Block'); }
  { const C = W({ relics: ['wooden_comb'], fill: false, deck: D.heroes.hanae.starter.slice(0, 5) }); C.heroes.forEach((h) => { h.st.bulwark = 2; }); const ev = C.endTurn(); const b = ev.filter((e) => e.type === 'block' && e.amount >= 5).map((e) => e.amount); t.deep(b, [7, 7], 'Soundproof 2: a Charm\'s Block (Mixtape) gets 2 more too, as the text says'); }
  { const C = W({}); const h = heroU(C, 'hanae'); h.st.bulwark = 2; h.st.plating = 3; const ev = C.endTurn(); t.ok(ev.some((e) => e.type === 'block' && e.dst.id === 'hanae' && e.amount === 3), 'Sequins stay raw (not a card or a Charm)'); }
  // Warm Tea: start of its turn heal N, then falls by 1 (hero and enemy)
  { const C = W({}); const h = heroU(C, 'hanae'); h.hp = 50; h.st.regen = 3; C.endTurn(); t.eq(h.hp, 53, 'Warm Tea 3: heals 3 at the start of the hero\'s turn'); t.eq(h.st.regen, 2, 'then falls by 1'); }
  { const C = W({}); const e = C.enemies[0]; e.hp = 900; e.st.regen = 3; const ev = C.endTurn(); t.ok(ev.findIndex((x) => x.type === 'heal' && x.dst.id === e.id) < ev.findIndex((x) => x.type === 'enemy_act'), 'an enemy heals at the start of its own turn'); t.eq(e.hp, 903, 'enemy Warm Tea 3 heals 3'); t.eq(e.st.regen, 2, 'and falls by 1'); }
  // Feedback: the attacker takes N, even when fully blocked; hook damage does not trigger it
  { const C = W({ enemies: ['ea_hitter'] }); const h = heroU(C, 'hanae'); h.st.thorns = 4; const e = C.enemies[0]; const hp0 = e.hp; const ev = C.endTurn(); t.eq(hp0 - e.hp, 4, 'Feedback 4: the attacker takes 4'); t.ok(ev.some((x) => x.type === 'thorns' && x.amount === 4), 'as a Feedback event'); }
  { const C = W({ enemies: ['ea_hitter'] }); const h = heroU(C, 'hanae'); h.st.thorns = 4; h.block = 50; const e = C.enemies[0]; const hp0 = e.hp, hh = h.hp; C.endTurn(); t.eq(h.hp, hh, 'a fully blocked hit'); t.eq(hp0 - e.hp, 4, 'still pays Feedback'); }
  { const C = W({}); const e = C.enemies[0]; e.st.thorns = 5; const hp0 = e.hp; const c = inst('hanae_blossom_field'); C.hand.push(c); C.energy = 9; heroU(C, 'hanae').st.bloom = 3; playUid(C, c.uid); const h = heroU(C, 'hanae'); const hh = h.hp; C.endTurn(); t.ok(e.hp < hp0 && h.hp === hh, 'hook damage (a power) never triggers Feedback'); }
  { const C = W({}); const e = C.enemies[0]; e.st.thorns = 5; const h = heroU(C, 'hanae'); const hp0 = h.hp; hit(C, 'hanae_slash'); t.eq(hp0 - h.hp, 5, 'an enemy with Feedback 5 hurts the hero who hits it by 5'); }
  // Shimmy: the next N hits are dodged completely: no damage, no Block lost, no onDamaged
  { const C = W({ enemies: ['ea_hitter'], relics: ['sturdy_shell'] }); const h = heroU(C, 'hanae'); h.st.dodge = 1; const hp0 = h.hp; const ev = C.endTurn(); t.eq(h.hp, hp0, 'Shimmy 1: the hit is dodged'); t.ok(ev.some((x) => x.type === 'dodge'), 'a dodge event'); t.ok(!ev.some((x) => x.type === 'relic' && x.id === 'sturdy_shell'), 'and nothing that answers a hit fires'); t.eq(h.st.dodge || 0, 0, 'Shimmy falls by 1 per dodged hit'); }
  // Spotlight: attacks aimed at the backing hero (or random / lowest) hit the Spotlight hero
  { const id = 'ea_backhit'; if (!D.enemies[id]) D.add('enemies', { [id]: enemy(id, { moves: { hit: { name: 'Back Hit', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'back' }] } }, ai: { seq: ['hit'] } }) });
    const C = W({ enemies: [id] }); const f = heroU(C, 'hanae'), b = heroU(C, 'kuro'); f.st.taunt = 1; const fb = f.hp, bb = b.hp; C.endTurn(); t.eq(fb - f.hp, 5, 'Spotlight: the lead hero takes the hit meant for the backing hero'); t.eq(b.hp, bb, 'the backing hero is spared'); }
  // Crescendo: start of its turn gain N Volume
  { const C = W({}); const h = heroU(C, 'hanae'); h.st.ritual = 2; C.endTurn(); t.eq(h.st.might, 2, 'Crescendo 2: 2 Volume at the start of the turn'); C.endTurn(); t.eq(h.st.might, 4, 'every turn'); }
  // Sequins: start of its turn gain N Block
  { const C = W({}); const h = heroU(C, 'hanae'); h.st.plating = 4; C.endTurn(); t.eq(h.block, 4, 'Sequins 4: 4 Block at the start of the turn'); }
  // Exposed and Muffled: 50% more / 25% less attack damage; Exposed 2 lasts 2 rounds
  { const C = W({}); const e = C.enemies[0]; e.st.vulnerable = 2; t.deep(hit(C, 'hanae_slash').map((x) => x.raw), [Math.floor((6 + 2) * 1.5)], 'Exposed: 50% more attack damage'); C.endTurn(); t.eq(e.st.vulnerable, 1, 'Exposed 2: 1 round later 1 is left'); C.endTurn(); t.eq(e.st.vulnerable || 0, 0, 'gone after 2 rounds'); }
  { const C = W({}); heroU(C, 'hanae').st.weak = 1; t.deep(hit(C, 'hanae_slash').map((x) => x.raw), [Math.floor((6 + 2) * 0.75)], 'Muffled: 25% less attack damage'); }
  // Wobbly: 25% less Block from cards (and Charms)
  { const C = W({}); heroU(C, 'kuro').st.frail = 1; const c = inst('kuro_ink_cloak'); C.hand.push(c); C.energy = 9; const b = playUid(C, c.uid).filter((e) => e.type === 'block').map((e) => e.amount); t.deep(b, [Math.floor(6 * 0.75), Math.floor(6 * 0.75)].slice(0, b.length), 'Wobbly: 25% less Block from a card'); }
  // Earworm: start of its turn lose N HP ignoring Block, then falls by 1 (enemy and hero)
  { const C = W({}); const e = C.enemies[0]; e.st.poison = 4; e.block = 0; const hp0 = e.hp; C.endTurn(); t.eq(hp0 - e.hp, 4, 'Earworm 4: the enemy loses 4 at the start of its turn'); t.eq(e.st.poison, 3, 'then Earworm falls by 1'); }
  { const C = W({}); const h = heroU(C, 'hanae'); h.st.poison = 4; h.block = 20; const hp0 = h.hp; const ev = C.endTurn(); t.eq(hp0 - h.hp, 4, 'a hero loses 4 at the start of their turn'); t.eq(h.st.poison, 3, 'then 3'); t.ok(ev.findIndex((x) => x.type === 'hurt' && x.dst.id === 'hanae') > ev.findIndex((x) => x.type === 'turn_start' && x.who === 'player'), 'at the start of the hero\'s own turn'); }
  { const C = W({}); const e = C.enemies[0]; e.st.poison = 2; e.block = 50; const hp0 = e.hp; C.endTurn(); t.eq(hp0 - e.hp, 2, 'Earworm ignores Block'); }
  // Sizzle: end of round N damage ignoring Block, then halves
  { const C = W({}); const e = C.enemies[0]; e.st.burn = 7; const hp0 = e.hp; const ev = C.endTurn(); t.eq(hp0 - e.hp, 7, 'Sizzle 7: 7 damage at the end of the round'); t.eq(e.st.burn, 3, 'then halves (7 to 3)'); t.ok(ev.findIndex((x) => x.type === 'hurt' && x.cause === 'burn') > ev.findIndex((x) => x.type === 'enemy_act' || x.type === 'turn_start' && x.who === 'enemy'), 'after the enemies act'); }
  { const C = W({}); const h = heroU(C, 'hanae'); h.st.burn = 5; const hp0 = h.hp; C.endTurn(); t.eq(hp0 - h.hp, 5, 'a hero sizzles too'); t.eq(h.st.burn, 2, 'and halves'); }
  // Starstruck: an enemy skips its next action; a starstruck hero cannot play cards on their next turn
  { const C = W({ enemies: ['ea_hitter'] }); const e = C.enemies[0]; e.st.stun = 1; const hp0 = heroU(C, 'hanae').hp; const ev = C.endTurn(); t.ok(ev.some((x) => x.type === 'skip'), 'Starstruck: the enemy skips'); t.eq(heroU(C, 'hanae').hp, hp0, 'and does not hit'); t.eq(e.st.stun || 0, 0, 'Starstruck is used up'); const ev2 = C.endTurn(); t.ok(ev2.some((x) => x.type === 'enemy_act'), 'only its next action'); }
  { const id = 'ea_stunner'; if (!D.enemies[id]) D.add('enemies', { [id]: enemy(id, { moves: { s: { name: 'Dazzle', kind: 'debuff', fx: [{ op: 'status', s: 'stun', n: 1, tgt: 'front' }] } }, ai: { seq: ['s'] } }) });
    const C = W({ enemies: [id] }); C.endTurn(); const c = C.hand.find((x) => D.cards[x.id].hero === 'hanae'); t.eq(c ? C.canPlay(c.uid, firstTarget(C)).reason : 'stunned', 'stunned', 'a starstruck hero cannot play cards on their next turn'); C.endTurn(); const c2 = C.hand.find((x) => D.cards[x.id].hero === 'hanae' && D.cards[x.id].type === 'skill'); t.ok(!c2 || C.canPlay(c2.uid).ok || heroU(C, 'hanae').st.stun > 0, 'and plays again after (unless starstruck again)'); }
  // Tangled: neither hero can swap
  { const C = W({}); heroU(C, 'kuro').st.bind = 1; t.eq(C.canSwap().reason, 'bind', 'Tangled on either hero: no swap'); const c = inst('kuro_flip_the_page'); C.hand.push(c); C.energy = 9; playUid(C, c.uid); t.eq(heroU(C, 'hanae').row, 'front', 'not even a card swap'); }
  // Tag: the next N attack hits deal +3 each, one stack per hit
  { const C = W({}); const e = C.enemies[0]; e.st.mark = 2; t.deep(hit(C, 'hanae_hundred_cuts').map((x) => x.raw).slice(0, 4), [1 + 2 + 3, 1 + 2 + 3, 1 + 2, 1 + 2], 'Tag 2: the next 2 hits deal 3 more'); t.eq(e.st.mark || 0, 0, 'one stack per hit'); }
});

// ------------------------------------------------------------------------------------------------ hero passives and spots
t.test('hero passives: each passive, as its text reads, through an A/B fight', () => {
  HEROES.forEach((hid) => (D.heroes[hid].passives || []).forEach((p) => {
    const partner = partnerOf(hid, 1);
    const text = D.hookText(p);
    const specs = triggerSpecs(p, hid, partner);
    if (p.on === 'turnStart') specs.unshift({ tag: 'turn 1', steps: [startStep(sliceFrom('turn_start', 'player'))], expectFire: true, pre: true });
    specs.forEach((ts) => {
      const make = (beforeStart) => { uidSeq = 9000; return fight({ owner: hid, partner, back: !!ts.back, enemies: ts.enemies || ['ea_dummy', 'ea_dummy2'], seed: 21, beforeStart }); };
      const spec = { label: `${hid} passive ${p.name} "${text}" when ${ts.tag}`, def: p, src: 'passive', srcId: p.id, owner: hid, make, preStart: true, steps: withTurns(ts.steps) };
      const errs = auditHook(spec);
      t.ok(errs.length === 0, errs.join(' | '));
      if (ts.expectFire) t.ok(spec.fires > 0, `${spec.label}: it fired`); else t.eq(spec.fires, 0, `${spec.label}: it stays quiet`);
    });
  }));
});
// ================================================================================================ 6. GEMS
// DESIGN 4.6, applied by hand: appended ops in slot order (draw, energy, status, poison, fx), keywords, cost (a numeric cost above 0 only),
// then the flat +dmg/+block/+heal on every matching op (through cond and repeat, appended ones included) and +hits on the first dmg op.
function gemmed(d, gemIds, slots, row) {
  const out = { fx: JSON.parse(JSON.stringify(d.fx)), cost: d.cost, kw: d.kw.slice(), mech: d.mech, type: d.type, hero: d.hero };
  const use = [];
  gemIds.forEach((gid, i) => {
    const gm = gid && D.gems[gid];
    if (!gm) return;
    if (slots[i] !== 'any' && slots[i] !== gm.color) return;
    if (gm.mod.cond && gm.mod.cond !== row) return;
    use.push(gm.mod);
  });
  const enemyTgt = () => { let f = null; D.walkOps(out.fx, (o) => { if (f) return; const tt = o.op === 'dmg' ? (o.tgt || 'enemy') : o.op === 'status' ? (o.tgt || (D.isDebuff(o.s) ? 'enemy' : 'self')) : null; if (tt && ENEMY_SIDE.indexOf(tt) >= 0) f = tt === 'others' ? 'enemy' : tt; }); return f; };
  use.forEach((m) => {
    if (m.draw) out.fx.push({ op: 'draw', n: m.draw });
    if (m.energy) out.fx.push({ op: 'energy', n: m.energy });
    if (m.status) out.fx.push(Object.assign({ op: 'status' }, m.status));
    if (m.poison) { const tg = enemyTgt(); if (tg) out.fx.push({ op: 'status', s: 'poison', n: m.poison, tgt: tg }); }
    list(m.fx).forEach((o) => out.fx.push(JSON.parse(JSON.stringify(o))));
    list(m.kw).forEach((k) => { if (out.kw.indexOf(k) < 0) out.kw.push(k); });
    list(m.kwRemove).forEach((k) => { const j = out.kw.indexOf(k); if (j >= 0) out.kw.splice(j, 1); });
    if (m.cost && isNum(out.cost) && out.cost > 0) out.cost = Math.max(0, out.cost + m.cost);
  });
  const walk = (ops, fn) => list(ops).forEach((o) => { if (!o) return; fn(o); if (o.op === 'cond') { walk(o.then, fn); walk(o.else, fn); } if (o.op === 'repeat') walk(o.do, fn); });
  ['dmg', 'block', 'heal'].forEach((k) => { const n = use.reduce((s, m) => s + (m[k] || 0), 0); if (n) walk(out.fx, (o) => { if (o.op === k) o.plus = (o.plus || 0) + n; }); });
  const hits = use.reduce((s, m) => s + (m.hits || 0), 0);
  if (hits) { const f = out.fx.find((o) => o && o.op === 'dmg'); if (f) f.hitsPlus = (f.hitsPlus || 0) + hits; }
  return out;
}
const gemProbe = (c) => simpleCard(c) || (c.type === 'power' && !c.mech);
t.test('gems: the text of every gem carries its numbers, and socketed on real cards in both spots the engine does exactly that', () => {
  let n = 0;
  Object.values(D.gems).forEach((gm) => {
    const text = D.gemText(gm.id);
    const nums = [];
    const m = gm.mod;
    ['dmg', 'block', 'heal', 'hits', 'draw', 'energy', 'poison'].forEach((k) => { if (m[k]) nums.push(Math.abs(m[k])); });
    if (m.cost) nums.push(Math.abs(m.cost));
    if (m.status) nums.push(m.status.n);
    if (m.fx) nums.push(...printedNumbers(m.fx));
    nums.forEach((x) => t.ok(hasNum(text, x), `gem ${gm.id} "${text}" prints ${x}`));
    if (m.status) t.ok(text.indexOf(D.statuses[m.status.s].name) >= 0, `gem ${gm.id} "${text}" names ${D.statuses[m.status.s].name}`);
    if (m.cond) t.ok(new RegExp(m.cond === 'front' ? 'Lead' : 'Backing').test(text), `gem ${gm.id} "${text}" names its spot`);
    // probes: real cards whose slot takes this gem, one of each type where possible
    const probes = [];
    ['attack', 'skill', 'power'].forEach((ty) => {
      const c = heroCards.filter((x) => x.type === ty && gemProbe(x) && (x.slots || []).some((sl) => sl === 'any' || sl === gm.color)).sort((a, b) => (a.id < b.id ? -1 : 1))
        .find((x) => { const gi = (x.slots || []).findIndex((sl) => sl === 'any' || sl === gm.color); const gems = x.slots.map((_, i) => (i === gi ? gm.id : null)); return D.resolveCard({ id: x.id, up: 0, gems }, { unit: { row: m.cond || 'front' } }).gemActive[gi]; });
      if (c) probes.push(c);
    });
    t.ok(probes.length > 0, `gem ${gm.id}: a real card it works on`);
    probes.forEach((c, k) => ['front', 'back'].forEach((row) => ['bare', 'rich'].forEach((kind) => {
      const gi = c.slots.findIndex((sl) => sl === 'any' || sl === gm.color);
      const gems = c.slots.map((_, i) => (i === gi ? gm.id : null));
      const d = gemmed(defOf(c.id, 0), gems, c.slots, row);
      const card = inst(c.id, 0, gems);
      const owner = c.hero;
      const C = fight({ owner, partner: partnerOf(owner, k), back: row === 'back', enemies: ['ea_dummy'], deck: [card], seed: 17 });
      toHand(C, card.uid);
      setUp(C, owner, kind);
      C.discard.push(inst(starterOf(owner, 'attack')));                       // something for a "from your discard pile" gem to fetch
      const S = snap(C);
      const tgt = C.needsTarget(card.uid) ? firstTarget(C) : undefined;
      if (!C.canPlay(card.uid, tgt).ok) return;
      oPlay(S, card.uid, d, tgt);
      playUid(C, card.uid);
      const dv = diffs(view(snap(C)), view(S));
      n++;
      t.ok(dv.length === 0, `gem ${gm.id} "${text}" on ${c.id} (${row}, ${kind}): ${dv.join('; ')}`);
    })));
  });
  t.ok(n > 200, 'gem plays audited: ' + n);
});

// ================================================================================================ 7. THE RUN: Spells, run hooks, Charm mods
const newRun = (o) => RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 31 }, o || {}));
const winSummary = (R, gains) => ({ result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp + ((gains || {})[x.id] || 0), down: false })), maxHpGain: gains || {}, stats: { kills: [] }, kills: [], gold: 0, ink: 0, fanbase: {} });
function stepOnto(R, type) {
  const M = R.map;
  const t0 = Object.values(M.tiles).find((x) => x.type === type && !x.done);
  if (!t0) return null;
  const near = MAP.neighbors(M, t0.q, t0.r).map((c) => MAP.tile(M, c[0], c[1])).find((x) => x && x.type !== 'block');
  MAP.paint(M, near.q, near.r); MAP.paint(M, t0.q, t0.r);
  near.done = true;
  M.pos = { q: near.q, r: near.r };
  R.node = null;
  return RUN.step(R, t0.q, t0.r);
}
t.test('spells: every Spell unmutes exactly the shape its text states (never more hexes than it names), and RUN.useBrush spends it', () => {
  Object.values(D.brushes).forEach((b) => {
    const R = newRun({ seed: 41 });
    const M = R.map;
    const m = /(\d+) hexes/.exec(b.text);
    const stated = m ? Number(m[1]) : /\bone hex\b/.test(b.text) ? 1 : null;
    t.ok(stated !== null, `${b.id} "${b.text}": the text says how many hexes`);
    const anchors = MAP.brushAnchors(M, b.id);
    t.ok(anchors.length > 0, `${b.id}: usable on a fresh map`);
    // the hexes the text names, from an anchor (and a direction): every one of them is live afterwards
    const named = (a, d) => {
      const D6 = MAP.DIRS;
      if (b.kind === 'line') return Array.from({ length: b.len }, (_, k) => [a.q + D6[d][0] * (k + 1), a.r + D6[d][1] * (k + 1)]);
      if (b.kind === 'fan') return [-1, 0, 1].map((k) => D6[(d + k + 6) % 6]).map((x) => [a.q + x[0], a.r + x[1]]);
      if (b.kind === 'ring') return D6.map((x) => [a.q + x[0], a.r + x[1]]);
      if (b.kind === 'blob') return [[a.q, a.r]].concat(D6.map((x) => [a.q + x[0], a.r + x[1]]));
      return [[a.q, a.r]];
    };
    let most = 0;
    anchors.forEach((a) => a.dirs.forEach((d) => { most = Math.max(most, MAP.brushCells(M, b.id, a.q, a.r, d).length); }));
    t.ok(most <= (b.kind === 'blob' ? stated + 1 : stated), `${b.id}: never more hexes than the text names (${most})`);
    const a = anchors.find((x) => x.dirs.some((d) => MAP.brushCells(M, b.id, x.q, x.r, d).length === most));
    const d = a.dirs.find((dd) => MAP.brushCells(M, b.id, a.q, a.r, dd).length === most);
    const origin = MAP.tile(M, a.q, a.r);
    if (/live hex/.test(b.text)) t.ok(origin.painted, `${b.id}: starts from a live hex`);
    if (/next to the live ground/.test(b.text)) t.ok(!origin.painted && MAP.neighbors(M, a.q, a.r).some((c) => MAP.tile(M, c[0], c[1]).painted), `${b.id}: aimed at a muted hex next to the live ground`);
    if (/within 4/.test(b.text)) t.ok(MAP.dist(M.pos.q, M.pos.r, a.q, a.r) <= 4, `${b.id}: within 4 of the party`);
    const was = new Set(MAP.painted(M).map((x) => MAP.key(x.q, x.r)));
    if (R.brushes.indexOf(b.id) < 0) R.brushes.push(b.id);
    const n0 = R.brushes.filter((x) => x === b.id).length;
    const res = RUN.useBrush(R, b.id, a.q, a.r, d);
    t.ok(res.ok, `${b.id}: RUN.useBrush works`);
    const want = named(a, d).filter((c) => { const x = MAP.tile(M, c[0], c[1]); return x && x.type !== 'block'; });
    want.forEach((c) => t.ok(MAP.tile(M, c[0], c[1]).painted, `${b.id} "${b.text}": hex ${c} is live afterwards`));
    const fresh = MAP.painted(M).filter((x) => !was.has(MAP.key(x.q, x.r)));
    t.ok(fresh.every((x) => want.some((c) => c[0] === x.q && c[1] === x.r)), `${b.id}: nothing outside the shape is unmuted`);
    t.eq(fresh.length, res.tiles.length, `${b.id}: the result lists every hex it unmuted`);
    t.eq(R.brushes.filter((x) => x === b.id).length, n0 - 1, `${b.id}: and the Spell is used up`);
  });
});

// run ops as DESIGN 4.9 states them, checked one op at a time against what RUN does to R (also the run hooks of Charms)
const sumHp = (R) => R.heroes.map((h) => h.hp + '/' + h.maxHp).join(' ');
const deckCount = (R, id) => R.deck.filter((c) => c.id === id).length;
function checkRunOp(R, op, ctx, tag) {
  const errs = [];
  const healMul = RUN.mods(R).healMul;
  const who = (w) => (!w || w === 'both' ? R.heroes.slice() : w === 'front' ? [R.heroes[R.frontIdx]] : w === 'lowest' ? null : w === 'random' ? null : R.heroes.filter((h) => h.id === w));
  const before = JSON.parse(JSON.stringify({ gold: R.gold, ink: R.ink, inkMax: R.inkMax, heroes: R.heroes, deck: R.deck.length, gems: R.gems.slice(), brushes: R.brushes.slice(), relics: R.relics.slice(), pending: R.pending.length, painted: MAP.progress(R.map).painted, upgraded: R.deck.filter((c) => c.up).length }));
  const out = RUN.applyOps(R, [op], ctx);
  const ex = (cond, msg) => { if (!cond) errs.push(`${tag} ${J(op)}: ${msg}`); };
  const ws = who(op.who);
  switch (op.op) {
    case 'gold': { const want = Math.max(0, before.gold + (op.n !== undefined ? op.n : Math.trunc(before.gold * op.pct))); ex(R.gold === want, `gold ${before.gold} -> ${R.gold}, text says ${want}`); break; }
    case 'ink': { const want = Math.min(before.inkMax, Math.max(0, before.ink + (op.n !== undefined ? op.n : Math.trunc(before.inkMax * op.pct)))); ex(R.ink === want, `Vox ${before.ink} -> ${R.ink}, text says ${want}`); break; }
    case 'heal': case 'hurt': case 'maxHp': {
      if (!ws) { const tot = (hs) => hs.reduce((s, h) => s + h.hp + h.maxHp, 0); ex(tot(R.heroes) !== tot(before.heroes) || op.op === 'heal', `${op.op} ${op.who}: someone changed`); break; }
      R.heroes.forEach((h, i) => {
        const b = before.heroes[i];
        const hit = ws.some((x) => x.id === h.id);
        let hp = b.hp, mx = b.maxHp;
        if (hit && op.op === 'heal') hp = Math.min(mx, hp + Math.max(0, Math.round((op.n !== undefined ? op.n : Math.round(mx * op.pct)) * healMul)));
        if (hit && op.op === 'hurt') hp = Math.max(1, hp - (op.n !== undefined ? op.n : Math.max(1, Math.round(mx * op.pct))));
        if (hit && op.op === 'maxHp') { mx = Math.max(1, mx + op.n); hp = Math.max(1, op.n > 0 ? hp + op.n : Math.min(hp, mx)); }
        ex(h.hp === hp && h.maxHp === mx, `${h.id} ${b.hp}/${b.maxHp} -> ${h.hp}/${h.maxHp}, the text says ${hp}/${mx} at once`);
      });
      break;
    }
    case 'addCard': ex(R.deck.length === before.deck + (op.n || 1), `deck ${before.deck} -> ${R.deck.length}`); if (op.card) ex(deckCount(R, op.card) >= 1, 'the named card'); if (op.rarity) ex(R.deck.slice(before.deck).every((c) => D.cards[c.id].rarity === op.rarity), 'of rarity ' + op.rarity); if (op.up) ex(R.deck.slice(before.deck).every((c) => c.up), 'upgraded'); break;
    case 'addCurse': ex(R.deck.length === before.deck + (op.n || 1) && R.deck.slice(before.deck).every((c) => (op.id ? c.id === op.id : D.cards[c.id].hero === 'curse')), `curses ${before.deck} -> ${R.deck.length}`); break;
    case 'addGem': { const g2 = R.gems.slice(before.gems.length); ex(g2.length === 1, 'one gem'); if (g2[0] && op.tier) ex(D.gems[g2[0]].tier === op.tier || !D.gemPool({ tier: op.tier, color: op.color }).length, 'of tier ' + op.tier); if (g2[0] && op.color) ex(D.gems[g2[0]].color === op.color, 'of colour ' + op.color); if (g2[0] && op.id) ex(g2[0] === op.id, 'the named gem'); break; }
    case 'addBrush': { const b2 = R.brushes.slice(before.brushes.length); ex(b2.length === 1 && (op.id === 'random' || b2[0] === op.id), `Spells ${J(before.brushes)} -> ${J(R.brushes)}`); break; }
    case 'addRelic': {
      const gained = R.relics.filter((r) => before.relics.indexOf(r) < 0);
      if (op.id && before.relics.indexOf(op.id) >= 0) ex(gained.length === 1 ? D.relics[gained[0]].rarity === D.relics[op.id].rarity : R.gold > before.gold, 'an owned Charm becomes another of its rarity or gold');
      else { ex(gained.length >= 1, 'a Charm'); if (op.id) ex(gained[0] === op.id, 'the named Charm'); if (op.rarity && gained[0]) ex(D.relics[gained[0]].rarity === op.rarity, 'of rarity ' + op.rarity); }
      break;
    }
    case 'removeCard': case 'upgradeCard': case 'transformCard': case 'duplicateCard': {
      const n = op.n || 1;
      if (op.random) { if (op.op === 'upgradeCard') ex(R.deck.filter((c) => c.up).length === Math.min(before.upgraded + n, before.upgraded + RUN.upgradable(R).length + n), 'random upgrades'); break; }
      if (!out.pending.length) { ex(!R.deck.some((c) => op.op !== 'removeCard' || !op.filter || D.cards[c.id].type !== op.filter.type), 'a choice when a card fits'); break; }
      const p = out.pending[0];
      const cands = R.deck.filter((c) => (!op.filter || ((!op.filter.type || D.cards[c.id].type === op.filter.type) && (!op.filter.hero || D.cards[c.id].hero === op.filter.hero))) && (op.op !== 'upgradeCard' || (D.cards[c.id].up && !c.up)) && (op.op === 'removeCard' || HEROES.indexOf(D.cards[c.id].hero) >= 0));
      const pick = cands.slice(0, Math.min(n, cands.length)).map((c) => c.uid);
      const ids = pick.map((u) => R.deck.find((c) => c.uid === u).id);
      const r = RUN.resolvePending(R, p.id, pick);
      ex(r.ok, 'the choice resolves');
      if (op.op === 'removeCard') ex(R.deck.length === before.deck - pick.length && pick.every((u) => !R.deck.some((c) => c.uid === u)), 'the chosen card is gone');
      if (op.op === 'upgradeCard') ex(R.deck.filter((c) => c.up).length === before.upgraded + pick.length, 'upgraded');
      if (op.op === 'duplicateCard') ex(R.deck.length === before.deck + pick.length && ids.every((id) => deckCount(R, id) >= 2), 'copied');
      if (op.op === 'transformCard') ex(R.deck.length === before.deck, 'same deck size after a transform');
      break;
    }
    case 'cardReward': {
      const p = out.pending[0];
      ex(p && p.offers.length === Math.min(op.n || 3, p.offers.length) && p.offers.length > 0, 'a card reward is offered');
      if (p) { if (op.rarity) ex(p.offers.every((id) => D.cards[id].rarity === op.rarity), 'of rarity ' + op.rarity); RUN.resolvePending(R, p.id, p.offers[0]); ex(R.deck.length === before.deck + 1, 'the pick joins the deck'); }
      break;
    }
    case 'paint': { const got = MAP.progress(R.map).painted - before.painted; ex(got === op.n, `unmuted ${got}, text says ${op.n}`); break; }
    case 'flag': ex(R.flags[op.k] === (op.v === undefined ? 1 : op.v), 'flag set'); break;
    case 'fight': ex(!!out.fight && J(out.fight.enemies) === J(op.enemies || []) && J(out.fight.onWin || null) === J(op.win && op.win.length ? op.win : null), 'a fight with the stated enemies and win ops'); break;
    default: errs.push(`${tag}: unknown run op ${op.op}`);
  }
  return { errs, out };
}
t.test('run hooks: every Charm run hook (pickup, act start, rest, unmute, fight won, merch stall) does what it states, when it states', () => {
  Object.values(D.relics).forEach((r) => list(r.hooks).forEach((h) => {
    if (D.LISTS.runHooks.indexOf(h.on) < 0) return;
    const party = r.hero ? [r.hero, partnerOf(r.hero, 0)] : ['hanae', 'kuro'];
    const A = newRun({ heroes: party, seed: 51 }), B = newRun({ heroes: party, seed: 51 });
    [A, B].forEach((R) => { R.heroes.forEach((x) => { x.hp = x.maxHp - 15; }); R.gold = 300; R.ink = 4; });
    const tag = `${r.id} (${r.name}) "${r.text}"`;
    const trig = {
      onPickup: (R, has) => { if (has) RUN.addRelic(R, r.id); },
      onChapterStart: (R) => RUN.startChapter(R, 2),
      onRest: (R) => { R.heroes.forEach((x) => { x.hp = 5; }); R.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] }; return RUN.campAction(R, 'rest'); },
      onPaint: (R) => { R.ink = 14; for (let i = 0; i < 6; i++) { const f = MAP.frontier(R.map)[0]; RUN.paint(R, f.q, f.r); } },
      onFightWon: (R) => { R.node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: h.filter && h.filter.tier ? list(h.filter.tier)[0] : 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' }; return RUN.combatDone(R, { result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp, down: false })), maxHpGain: {}, stats: { kills: [] }, kills: [], gold: 0, ink: 0, fanbase: {} }); },
      onShopEnter: (R) => stepOnto(R, 'shop'),
    }[h.on];
    if (h.on !== 'onPickup') { A.relics.push(r.id); B.relics.push(r.id); }
    // B owns the Charm too, but it is dropped for the trigger only, so its hook never runs there (no Charm with a run hook has a mod
    // that changes these triggers, so the two runs differ by the hook alone)
    const savedB = B.relics.slice();
    if (h.on !== 'onPickup') B.relics = B.relics.filter((x) => x !== r.id);
    trig(A, true); trig(B, false);
    B.relics = savedB;
    // what the hook's ops add up to (random picks, such as which gem or which card, are checked by kind and count)
    const dGold = A.gold - B.gold, dInk = A.ink - B.ink, dGems = A.gems.length - B.gems.length, dBr = A.brushes.length - B.brushes.length;
    const dMax = A.heroes.map((x, i) => x.maxHp - B.heroes[i].maxHp), dHp = A.heroes.map((x, i) => x.hp - B.heroes[i].hp);
    const dPaint = MAP.progress(A.map).painted - MAP.progress(B.map).painted, dDeck = A.deck.length - B.deck.length, dUp = A.deck.filter((c) => c.up).length - B.deck.filter((c) => c.up).length;
    const want = { gold: 0, ink: 0, gems: 0, brushes: 0, maxHp: [0, 0], hp: [0, 0], paint: 0, deck: 0, up: 0 };
    const times = h.on === 'onPaint' ? Math.floor(6 / (h.every || 1)) : 1;
    const healMul = RUN.mods(A).healMul;
    for (let k = 0; k < times; k++) list(h.fx).forEach((o) => {
      if (o.op === 'gold') want.gold += o.n;
      if (o.op === 'ink') want.ink += o.n;
      if (o.op === 'addGem') want.gems += 1;
      if (o.op === 'addBrush') want.brushes += 1;
      if (o.op === 'paint') want.paint += o.n;
      if (o.op === 'upgradeCard') want.up += Math.min(o.n || 1, B.deck.filter((c) => D.cards[c.id].up && !c.up).length);
      if (o.op === 'addCurse') want.deck += o.n || 1;
      if (o.op === 'maxHp') A.heroes.forEach((x, i) => { if (!o.who || o.who === 'both' || o.who === x.id) { want.maxHp[i] += o.n; want.hp[i] += o.n; } });
      if (o.op === 'heal') { const lowest = B.heroes.reduce((a2, b2) => (b2.hp < a2.hp ? b2 : a2)); B.heroes.forEach((x, i) => { if (!o.who || o.who === 'both' || o.who === x.id || (o.who === 'lowest' && x === lowest)) want.hp[i] += Math.round(o.n * healMul); }); }
    });
    t.eq(dGold, want.gold, `${tag}: gold`);
    t.eq(dInk, Math.min(want.ink, A.inkMax - B.ink), `${tag}: Vox`);
    t.eq(dGems, want.gems, `${tag}: gems`);
    t.eq(dBr, want.brushes, `${tag}: Spells`);
    t.eq(dPaint, want.paint, `${tag}: hexes unmuted`);
    t.eq(dDeck, want.deck, `${tag}: cards added`);
    t.eq(dUp, want.up, `${tag}: cards upgraded`);
    t.deep(dMax, want.maxHp, `${tag}: max HP, at once`);
    t.deep(dHp, want.hp, `${tag}: HP, at once`);
    if (h.filter && h.filter.tier) {
      const C2 = newRun({ heroes: party, seed: 51 }), C3 = newRun({ heroes: party, seed: 51 });
      C2.relics.push(r.id);
      const other = list(h.filter.tier).indexOf('normal') >= 0 ? 'elite' : 'normal';
      [C2, C3].forEach((R) => { R.node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: other, enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' }; RUN.combatDone(R, { result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp, down: false })), maxHpGain: {}, stats: { kills: [] }, kills: [], gold: 0, ink: 0, fanbase: {} }); });
      t.eq(C2.gold, C3.gold, `${tag}: nothing after a ${other} fight`);
    }
  }));
});
t.test('charm mods: every Charm mod and spot bonus changes the number its text names, by the amount it names', () => {
  const withR = (id, o) => { const R = newRun(o); RUN.addRelic(R, id); return R; };
  Object.values(D.relics).forEach((r) => {
    const tag = `${r.id} (${r.name}) "${r.text}"`;
    const m = r.mods || {};
    Object.keys(m).forEach((k) => {
      const v = m[k];
      const pct = Math.round(Math.abs(v) * 100);
      if (D.LISTS.modKind[k] === 'frac') t.ok(hasNum(r.text, pct), `${tag}: text prints ${pct}% for ${k}`);
      else if (k !== 'curses') t.ok(hasNum(r.text, Math.abs(v)) || (Math.abs(v) === 1 && /\b(1|one|a|an)\b/i.test(r.text)), `${tag}: text prints ${Math.abs(v)} for ${k}`);
      const A = withR(r.id), B = newRun();
      const mA = RUN.mods(A), mB = RUN.mods(B);
      if (D.LISTS.modKind[k] === 'frac') t.near(mA[k], mB[k] * (1 + v) / 1, 1e-9, `${tag}: ${k} x${1 + v}`);
      else t.eq(mA[k] - mB[k], v, `${tag}: ${k} ${v > 0 ? '+' : ''}${v}`);
      // and where the number lands
      if (k === 'energy') { const C = fight({ owner: 'hanae', partner: 'kuro', relics: [r.id] }); t.eq(C.maxEnergy, 3 + v, `${tag}: Breath each turn`); t.eq(C.energy, 3 + v, `${tag}: Breath on turn 1`); }
      if (k === 'hand') { const C = fight({ owner: 'hanae', partner: 'kuro', relics: [r.id] }); t.eq(C.hand.length, 5 + v, `${tag}: cards drawn`); }
      if (k === 'startBlock') { const C = fight({ owner: 'hanae', partner: 'kuro', relics: [r.id] }); C.heroes.forEach((h) => t.eq(h.block, (D.rowFor(h.id, h.row, [r.id]).startBlock || 0) + v, `${tag}: ${h.id} starts the turn with ${v} more Block`)); }
      if (k === 'freeSwaps') { const C = fight({ owner: 'hanae', partner: 'kuro', relics: [r.id] }); for (let i = 0; i < 1 + v; i++) { t.eq(C.canSwap().cost, 0, `${tag}: swap ${i + 1} is free`); C.swap(); } t.eq(C.canSwap().cost, 1, `${tag}: then they cost Breath`); }
      if (k === 'inkMax') t.eq(A.inkMax, B.inkMax + v, `${tag}: the Vox pool holds ${v} more`);
      if (k === 'startInk') { A.ink = 0; B.ink = 0; RUN.startChapter(A, 2); RUN.startChapter(B, 2); t.eq(A.ink - B.ink, v, `${tag}: an act starts with ${v} more Vox`); }
      if (k === 'healMul') { [A, B].forEach((R) => { R.heroes.forEach((h) => { h.hp = 1; }); R.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] }; RUN.campAction(R, 'rest'); }); A.heroes.forEach((h, i) => t.eq(h.hp - 1, Math.round(h.maxHp * D.ECONOMY.camp.restPct * (1 + v)), `${tag}: a rest heals ${pct}% ${v > 0 ? 'more' : 'less'}`)); }
      if (k === 'goldMul') { const g = [A, B].map((R) => { R.node = { kind: 'combat', tile: { q: 2, r: 2 }, tier: 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' }; return RUN.combatDone(R, { result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp, down: false })), maxHpGain: {}, stats: { kills: [] }, kills: [], gold: 0, ink: 0, fanbase: {} }).goldBase; }); t.eq(g[0], Math.round(g[1] * (1 + v)), `${tag}: combat gold x${1 + v}`); }
      if (k === 'priceMul') { const sa = stepOnto(A, 'shop'), sb = stepOnto(B, 'shop'); sa.stock.items.forEach((it) => { const ib = sb.stock.items.find((x) => x.key === it.key && x.id === it.id); if (ib && it.kind !== 'relic') t.near(it.price, ib.price * (1 + v), 1, `${tag}: ${it.id} costs ${pct}% ${v > 0 ? 'more' : 'less'} (rounded)`); }); }
      if (k === 'cardChoices') { const g = [A, B].map((R) => { R.node = { kind: 'combat', tile: { q: 2, r: 2 }, tier: 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' }; return RUN.combatDone(R, { result: 'win', heroes: R.heroes.map((x) => ({ id: x.id, hp: x.hp, maxHp: x.maxHp, down: false })), maxHpGain: {}, stats: { kills: [] }, kills: [], gold: 0, ink: 0, fanbase: {} }).cards.length; }); t.eq(g[0], g[1] + v, `${tag}: ${v} more cards per reward`); }
      if (k === 'rareBoost') {
        const share = (R) => { let rare = 0, all = 0; for (let i = 0; i < 600; i++) { R.rareOffset = 0; R.node = { kind: 'combat', tile: { q: i % 25, r: Math.floor(i / 25) }, tier: 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' }; const rw = RUN.combatDone(R, winSummary(R)); rw.cards.forEach((id) => { all++; if (D.cards[id].rarity === 'rare') rare++; }); } return 100 * rare / all; };
        const d2 = share(A) - share(B);
        t.ok(Math.abs(d2 - v) < 3, `${tag}: rare cards come ${v} points more often (measured ${d2.toFixed(1)})`);
      }
      if (k === 'campActions') { A.node = { kind: 'camp', tile: { q: 0, r: 0 }, used: [] }; RUN.campAction(A, 'rest'); t.ok(RUN.campAction(A, 'meditate').ok, `${tag}: a second green room action`); }
      if (k === 'wellInk') { A.ink = 0; B.ink = 0; const wa = stepOnto(A, 'well'), wb = stepOnto(B, 'well'); t.eq(wa.gained - wb.gained, v, `${tag}: a tea stall gives ${v} more Vox`); }
    });
    if (r.rows) ['front', 'back'].forEach((row) => Object.keys(r.rows[row] || {}).forEach((k) => {
      const v = r.rows[row][k];
      t.ok(hasNum(r.text, v), `${tag}: text prints ${v} for the ${row} ${k}`);
      const A = fight({ owner: 'hanae', partner: 'kuro', relics: [r.id] }), B = fight({ owner: 'hanae', partner: 'kuro' });
      const ha = row === 'front' ? A.front() : A.back(), hb = row === 'front' ? B.front() : B.back();
      if (k === 'startBlock') t.eq(ha.block - hb.block, v, `${tag}: the ${row} hero starts turns with ${v} more Block`);
      if (k === 'dmgAdd') { const c = inst(starterOf(ha.id, 'attack')); A.hand.push(c); A.energy = 9; const c2 = inst(starterOf(hb.id, 'attack')); B.hand.push(c2); B.energy = 9; t.eq(playUid(A, c.uid).find((e) => e.type === 'hit').raw - playUid(B, c2.uid).find((e) => e.type === 'hit').raw, v, `${tag}: the ${row} hero deals ${v} more per hit`); }
      if (k === 'blockAdd') { const c = inst(starterOf(ha.id, 'skill')); A.hand.push(c); A.energy = 9; const c2 = inst(starterOf(hb.id, 'skill')); B.hand.push(c2); B.energy = 9; t.eq(playUid(A, c.uid).find((e) => e.type === 'block' && e.dst.id === ha.id).amount - playUid(B, c2.uid).find((e) => e.type === 'block' && e.dst.id === hb.id).amount, v, `${tag}: the ${row} hero gains ${v} more Block from a card`); }
    }));
  });
});

// ================================================================================================ 8. EVENTS
function eventRun(ev, ch, seed) {
  const need = ch.req && ch.req.hero;
  const heroes = need ? [need, need === 'hanae' ? 'kuro' : 'hanae'] : ['hanae', 'kuro'];
  const R = newRun({ heroes, seed });
  if (ev.chapters && ev.chapters[0] !== 1) RUN.startChapter(R, ev.chapters[0]);
  R.gold = 200; R.ink = 6;
  R.heroes.forEach((h) => { h.hp = Math.floor(h.maxHp * 0.55); });
  if (ch.req && ch.req.relic) R.relics.push(ch.req.relic);
  if (ch.req && ch.req.flag) R.flags[ch.req.flag] = 1;
  if (ch.req && ch.req.hpPct) R.heroes.forEach((h) => { h.hp = h.maxHp; });
  RUN.addCard(R, 'curse_smudge');
  return R;
}
t.test('events: every outcome of every choice applies each of its ops exactly as stated (gold, Vox, HP, max HP at once, cards, Charms, gems, Spells, curses, unmuting, fights)', () => {
  let outcomes = 0, opsN = 0;
  Object.values(D.events).forEach((ev) => ev.choices.forEach((ch, ci) => ch.out.forEach((o, oi) => {
    const R = eventRun(ev, ch, 60 + ci * 7 + oi);
    const tag = `${ev.id} "${ch.label}" outcome ${oi + 1}`;
    const ctx = { rng: U.rng(U.hash(77, ev.id, ci, oi)), tile: R.map.pos, key: 'audit' };
    let fight = null;
    list(o.ops).forEach((op) => {
      const r = checkRunOp(R, op, ctx, tag);
      r.errs.forEach((e) => t.ok(false, e));
      opsN++;
      R.pending = [];
      if (r.out.fight) fight = r.out.fight;
    });
    outcomes++;
    if (fight) {
      // the fight is won: its win ops land at once, and the reward ledger shows any max HP and gold they add
      const before = { max: R.heroes.map((h) => h.maxHp), hp: R.heroes.map((h) => h.hp), gold: R.gold };
      R.node = fight;
      const rw = RUN.combatDone(R, winSummary(R));
      const win = list(fight.onWin);
      const dMax = win.filter((x) => x.op === 'maxHp').reduce((s, x) => s + x.n, 0);
      R.heroes.forEach((h, i) => t.eq(h.maxHp - before.max[i], dMax, `${tag}: winning the fight raises ${h.id}'s max HP by ${dMax} at once`));
      R.heroes.forEach((h, i) => t.ok(h.hp >= before.hp[i] + dMax, `${tag}: and current HP with it`));
      t.eq(rw.maxHp, dMax * R.heroes.length, `${tag}: the reward ledger shows the max HP`);
      const dGold = win.filter((x) => x.op === 'gold').reduce((s, x) => s + x.n, 0);
      t.eq(rw.gold, rw.goldBase + dGold, `${tag}: the reward ledger counts the win gold`);
      t.eq(R.gold - before.gold, rw.gold, `${tag}: and that is what was added`);
    }
  })));
  t.ok(outcomes > 150 && opsN > 250, `event outcomes audited: ${outcomes}, ops: ${opsN}`);
});
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, eighty: 80 };
const numIn = (w) => (/^\d+$/.test(w) ? Number(w) : NUMW[w.toLowerCase()]);
t.test('events: the price shown on a choice is what every outcome charges, and numbers in a label or the outcome prose are the numbers applied', () => {
  const COSTLY = (x) => x && (x.op === 'hurt' || x.op === 'addCurse' || x.op === 'fight' || x.op === 'removeCard' || x.op === 'transformCard' || ((x.op === 'gold' || x.op === 'ink' || x.op === 'maxHp') && (x.n < 0 || x.pct < 0)));
  Object.values(D.events).forEach((ev) => ev.choices.forEach((ch) => {
    const tag = `${ev.id} "${ch.label}"${ch.cost ? ' [' + ch.cost + ']' : ''}`;
    const outs = ch.out.map((o) => list(o.ops));
    const every = (f) => outs.every((ops) => ops.some(f)), some = (f) => outs.some((ops) => ops.some(f));
    const c = ch.cost || '';
    let m;
    if ((m = /^(\d+) gold$/.exec(c))) { const n = +m[1]; t.ok(every((x) => x.op === 'gold' && x.n === -n), `${tag}: every outcome charges ${n} gold`); t.ok(ch.req && ch.req.gold >= n, `${tag}: and needs ${n} gold`); }
    if ((m = /^(\d+) Vox/.exec(c))) { const n = +m[1]; t.ok(every((x) => x.op === 'ink' && x.n === -n), `${tag}: every outcome costs ${n} Vox`); }
    if ((m = /^Maybe (\d+) gold$/.exec(c))) t.ok(some((x) => x.op === 'gold' && x.n === -m[1]), `${tag}: an outcome charges ${m[1]} gold`);
    if ((m = /^Up to (\d+) gold$/.exec(c))) { t.ok(some((x) => x.op === 'gold' && x.n === -m[1]), `${tag}: an outcome loses ${m[1]} gold`); t.ok(!some((x) => x.op === 'gold' && x.n < -m[1]), `${tag}: and none loses more`); }
    if ((m = /^Lose a card(?:, (\d+) gold| and (\d+) HP)?$/.exec(c))) { t.ok(every((x) => x.op === 'removeCard'), `${tag}: every outcome takes a card`); if (m[1]) t.ok(every((x) => x.op === 'gold' && x.n === -m[1]), `${tag}: and ${m[1]} gold`); if (m[2]) t.ok(every((x) => x.op === 'hurt' && x.n === +m[2]), `${tag}: and ${m[2]} HP`); }
    if ((m = /^A curse: (.+)$/.exec(c))) t.ok(every((x) => x.op === 'addCurse' && D.cards[x.id] && D.cards[x.id].name === m[1]), `${tag}: every outcome adds ${m[1]}`);
    if ((m = /^Maybe a curse: (.+)$/.exec(c))) t.ok(some((x) => x.op === 'addCurse' && D.cards[x.id] && D.cards[x.id].name === m[1]), `${tag}: an outcome adds ${m[1]}`);
    if (/maybe a curse$/i.test(c)) t.ok(some((x) => x.op === 'addCurse'), `${tag}: an outcome adds a curse`);
    if (c === 'Hurts the lead hero') t.ok(every((x) => x.op === 'hurt' && x.who === 'front'), `${tag}: every outcome hurts the lead hero`);
    if (c === 'Jasmin will be hurt') t.ok(every((x) => x.op === 'hurt' && x.who === 'hanae'), `${tag}: every outcome hurts Jasmin`);
    if (/for both$|Both heroes/.test(c)) t.ok(some((x) => x.op === 'hurt' && (!x.who || x.who === 'both')), `${tag}: both heroes are hurt`);
    if (c) t.ok(some(COSTLY) || /card/i.test(c), `${tag}: a shown price is paid by some outcome`);
    // numbers in the label ("Pay the twenty gold", "Guess even for fifty gold")
    if ((m = /\b(\w+) gold\b/.exec(ch.label)) && numIn(m[1])) t.ok(every((x) => x.op === 'gold' && Math.abs(x.n) === numIn(m[1])), `${tag}: the label's ${m[1]} gold is what changes hands`);
    // numbers in the outcome prose: "pays you fifteen gold", "six hexes light up"
    ch.out.forEach((o, oi) => {
      const ops = list(o.ops).concat(list((list(o.ops).find((x) => x.op === 'fight') || {}).win));
      const re = /\b(\w+) (gold|hexes)\b/g;
      let mm;
      while ((mm = re.exec(o.text))) {
        const n = numIn(mm[1]);
        if (!n) continue;
        const ok = mm[2] === 'gold' ? ops.some((x) => x.op === 'gold' && Math.abs(x.n) === n) : ops.some((x) => x.op === 'paint' && x.n === n) || ops.some((x) => x.op === 'addBrush' && D.brushes[x.id] && D.brushes[x.id].len === n);
        t.ok(ok, `${ev.id} "${ch.label}" outcome ${oi + 1}: the text says "${mm[0]}"`);
      }
    });
  }));
});

// ================================================================================================ 9. MAX HP: every source, at once, everywhere the HUD reads it
t.test('max HP: Charms on pickup raise current and max HP at once, however the Charm is gained (reward, merch stall, gift box, event)', () => {
  ['heart_charm', 'inkstone_weight'].forEach((id) => {
    const n = D.relics[id].hooks.find((h) => h.on === 'onPickup').fx[0].n;
    const ways = {
      reward: (R) => RUN.claim(R, { gold: 0, ink: 0, cards: [], relics: [id], gems: [], brush: null, maxHp: 0, claimed: false, pending: [], log: [] }, { relic: id }),
      shop: (R) => { const sh = stepOnto(R, 'shop'); const it = sh.stock.items.find((x) => x.kind === 'relic') || {}; it.id = id; it.price = 1; return RUN.shopBuy(R, sh.stock, it.key); },
      chest: (R) => { const node = stepOnto(R, 'chest'); node.loot.relic = id; return RUN.take(R, node, { relic: true }); },
      event: (R) => RUN.applyOps(R, [{ op: 'addRelic', id }]),
      api: (R) => RUN.addRelic(R, id),
    };
    Object.keys(ways).forEach((w) => {
      const R = newRun({ seed: 70 });
      R.gold = 500;
      R.heroes.forEach((h) => { h.hp = h.maxHp - 20; });
      const before = R.heroes.map((h) => [h.hp, h.maxHp]);
      ways[w](R);
      t.ok(R.relics.indexOf(id) >= 0, `${id} via ${w}: gained`);
      R.heroes.forEach((h, i) => t.deep([h.hp, h.maxHp], [before[i][0] + n, before[i][1] + n], `${id} "${D.relics[id].text}" via ${w}: ${h.id} +${n} max HP and +${n} HP straight away`));
    });
  });
});
t.test('max HP: Gold Record in combat raises both heroes at once (a voiceless hero too), and the run and the reward ledger keep it', () => {
  [false, true].forEach((downAlly) => {
    const R = newRun({ seed: 71 });
    RUN.addRelic(R, 'dragon_pearl');
    if (downAlly) R.heroes[1].hp = 0;
    R.node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: 'elite', enemies: ['ea_weak_elite', 'ea_dummy'], seed: 5, rewards: true, onWin: null, source: 'combat' };
    const opts = RUN.combatInit(R);
    const C = COMBAT.create(opts);
    C.start();
    const before = C.heroes.map((h) => [h.hp, h.maxHp, h.down]);
    const c = inst('hanae_slash'); C.hand.push(c); C.energy = 9;
    const ev = playUid(C, c.uid);
    const tag = `dragon_pearl "${D.relics.dragon_pearl.text}"${downAlly ? ' with the ally voiceless' : ''}`;
    t.deep(ev.filter((e) => e.type === 'max_hp').map((e) => e.hero + ':' + e.n).sort(), ['hanae:2', 'kuro:2'], `${tag}: both heroes`);
    C.heroes.forEach((h, i) => t.eq(h.maxHp, before[i][1] + 2, `${tag}: ${h.id} max HP +2 in the fight at once`));
    C.heroes.forEach((h, i) => t.eq(h.hp, before[i][2] ? 0 : before[i][0] + 2, `${tag}: ${h.id} HP ${before[i][2] ? 'stays 0 while voiceless' : '+2 at once'}`));
    C.enemies[1].hp = 0; C.enemies[1].down = true;
    C.endTurn();
    const sum = C.summary();
    t.deep(sum.maxHpGain, { hanae: 2, kuro: 2 }, `${tag}: reported to the run`);
    const maxBefore = R.heroes.map((h) => h.maxHp);
    const rw = RUN.combatDone(R, C.result ? C : Object.assign(sum, { result: 'win' }));
    R.heroes.forEach((h, i) => t.eq(h.maxHp, maxBefore[i] + 2, `${tag}: the run (and so the HUD) has ${h.id} at +2 max HP`));
    if (downAlly) t.eq(R.heroes[1].hp, Math.round(R.heroes[1].maxHp * D.ECONOMY.reviveFrac), `${tag}: the voiceless hero comes back from the raised maximum`);
    t.eq(rw.maxHp, 4, `${tag}: the reward ledger shows the max HP`);
  });
});
t.test('max HP: an act end gives both heroes 8 max HP and 8 HP before the heal, at once', () => {
  const R = newRun({ seed: 72 });
  R.heroes.forEach((h) => { h.hp = 10; });
  const max = R.heroes.map((h) => h.maxHp);
  const res = RUN.chapterEnd(R);
  R.heroes.forEach((h, i) => { t.eq(h.maxHp, max[i] + 8, `${h.id}: +8 max HP`); t.eq(h.hp, Math.min(h.maxHp, 18 + Math.round(h.maxHp * D.ECONOMY.chapterEnd.healPct)), `${h.id}: +8 HP, then 30% of the new maximum`); });
  t.eq(res.maxHp, 8, 'the act clear page is told 8');
});
t.test('max HP: the combat screen view model keeps a voiceless hero at 0 HP when their maximum grows', () => {
  const g2 = boot({ only: ['screen_combat'], skip: ['scene'] });
  const { snapshot, applyEvent } = g2.UI.screens.combat._t;
  const C = g2.COMBAT.create({ heroes: [{ id: 'hanae', hp: 50, maxHp: 84 }, { id: 'kuro', hp: 0, maxHp: 68 }], frontIdx: 0, deck: [], enemies: ['kappa'], seed: 1 });
  C.start();
  const vm = snapshot(C);
  applyEvent(vm, { type: 'max_hp', hero: 'kuro', n: 2 });
  applyEvent(vm, { type: 'max_hp', hero: 'hanae', n: 2 });
  const k = vm.heroes.find((h) => h.id === 'kuro'), h = vm.heroes.find((x) => x.id === 'hanae');
  t.deep([k.hp, k.maxHp, k.down], [0, 70, true], 'the voiceless hero: maximum 70, still 0 HP');
  t.deep([h.hp, h.maxHp], [52, 86], 'the living hero: +2 and +2');
});

// ================================================================================================ 10. KEYWORDS, JUNK CARDS, MECHANICS ACROSS FIGHTS
t.test('keywords: Opener cards open the fight in hand, Hold cards stay, One Take cards fade at the end of the turn, Unplayable cards cannot be played', () => {
  heroCards.concat(junkCards).forEach((c) => [0, 1].forEach((up) => {
    if (up && !c.up) return;
    const d = defOf(c.id, up);
    const owner = HEROES.indexOf(c.hero) >= 0 ? c.hero : 'hanae';
    const tag = `${c.id}${up ? '+' : ''} "${D.cardPlain({ id: c.id, up, gems: [] })}"`;
    if (d.kw.indexOf('innate') >= 0) [1, 2, 3, 4].forEach((seed) => { const card = inst(c.id, up); const C = fight({ owner, partner: partnerOf(owner, 0), deck: [card], seed }); t.ok(C.hand.some((x) => x.uid === card.uid), `${tag}: Opener, in the opening hand (seed ${seed})`); });
    if (d.kw.indexOf('retain') >= 0) { const card = inst(c.id, up); const C = fight({ owner, partner: partnerOf(owner, 0), deck: [card], seed: 3 }); toHand(C, card.uid); C.endTurn(); t.ok(C.hand.some((x) => x.uid === card.uid), `${tag}: Hold, still in hand next turn`); }
    if (d.kw.indexOf('ethereal') >= 0) { const card = inst(c.id, up); const C = fight({ owner, partner: partnerOf(owner, 0), deck: [card], seed: 3 }); toHand(C, card.uid); const ev = C.endTurn(); t.ok(ev.some((e) => e.type === 'exhaust' && e.card.uid === card.uid && e.reason === 'ethereal'), `${tag}: One Take, it fades at the end of the turn`); }
    if (d.fx.some((o) => o.op === 'pick' && o.then === 'retain')) {
      const card = inst(c.id, up); const C = fight({ owner, partner: partnerOf(owner, 0), deck: [card], seed: 3, enemies: ['ea_dummy'] }); toHand(C, card.uid); C.energy = 9;
      playUid(C, card.uid);
      const held = C.hand.filter((x) => x.keep).map((x) => x.uid);
      t.ok(held.length > 0, `${tag}: cards are held`);
      C.endTurn();
      t.ok(held.every((u) => C.hand.some((x) => x.uid === u)), `${tag}: the held cards are still in hand next turn`);
    }
    if (d.fx.some((o) => o.op === 'pick' && o.then === 'upgrade')) {
      t.ok(/for this fight/.test(D.cardPlain({ id: c.id, up, gems: [] })), `${tag}: says the upgrade lasts for this fight`);
      const card = inst(c.id, up); const R = newRun({ heroes: [owner, partnerOf(owner, 0)], seed: 90 }); R.deck.push(card);
      R.node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' };
      const C = COMBAT.create(RUN.combatInit(R)); C.start(); toHand(C, card.uid); C.energy = 9; playUid(C, card.uid);
      t.ok(C.hand.some((x) => x.up) && R.deck.filter((x) => x.up && x.uid !== card.uid).length === 0, `${tag}: upgraded in the fight, not in the deck`);
    }
    if (d.kw.indexOf('unplayable') >= 0 || d.cost === undefined) { const card = inst(c.id, up); const C = fight({ owner, partner: partnerOf(owner, 0), deck: [card], seed: 3 }); toHand(C, card.uid); t.eq(C.canPlay(card.uid, firstTarget(C)).reason, 'unplayable', `${tag}: Unplayable`); }
  }));
});
t.test('junk cards: what a Curse or Status card says it does at the end of the turn or when drawn, it does, to the lead hero or both', () => {
  junkCards.forEach((c) => {
    const tag = `${c.id} "${D.cardPlain(c.id)}"`;
    const h = c.hand || {};
    if (h.turnEnd) {
      const card = inst(c.id);
      const C = fight({ owner: 'hanae', partner: 'kuro', deck: [card], seed: 3, enemies: ['ea_dummy'] });
      toHand(C, card.uid);
      const S0 = snap(C), S = JSON.parse(JSON.stringify(S0));
      oRun(S, h.turnEnd, { kind: 'hand', actor: O.front(S), target: null, X: 0 });
      const ev = C.endTurn();
      const got = effect(sliceUntil('turn_end', 'player')(ev).filter((e) => e.type !== 'discard' && e.type !== 'exhaust'));
      t.eq(sortM(got), sortM(oEffect(S0, S)), `${tag}: at the end of the turn`);
    }
    if (h.drawn) {
      const card = inst(c.id);
      const C = fight({ owner: 'hanae', partner: 'kuro', deck: [card], seed: 3, enemies: ['ea_dummy'] });
      [C.hand, C.draw, C.discard].forEach((p) => { const i = p.findIndex((x) => x.uid === card.uid); if (i >= 0) p.splice(i, 1); });
      C.draw.unshift(card);
      const S0 = snap(C), S = JSON.parse(JSON.stringify(S0));
      oRun(S, [{ op: 'draw', n: 1 }].concat(h.drawn), { kind: 'hand', actor: O.front(S), target: null, X: 0 });
      const dr = inst('hanae_sakura_sort'); C.hand.push(dr); C.energy = 9;
      const ev = playUid(C, dr.uid);
      const at = ev.findIndex((e) => e.type === 'draw' && e.cards.some((x) => x.uid === card.uid));
      t.ok(at >= 0, `${tag}: drawn`);
      const after = ev.slice(at + 1, ev.findIndex((e, k) => k > at && (e.type === 'pick_needed' || e.type === 'discard' || e.type === 'card_move')) >>> 0);
      const want = oEffect(S0, S); delete want.drawn;
      t.eq(sortM(effect(after)), sortM(want), `${tag}: when drawn`);
    }
    if (isNum(c.cost) && (c.kw || []).indexOf('unplayable') < 0) {
      const card = inst(c.id);
      const C = fight({ owner: 'hanae', partner: 'kuro', deck: [card], seed: 3, enemies: ['ea_dummy'] });
      toHand(C, card.uid);
      C.heroes.forEach((x) => { x.st.bind = 1; });
      const S = snap(C);
      oPlay(S, card.uid, defOf(c.id, 0), undefined);
      playUid(C, card.uid);
      t.deep(diffs(view(snap(C)), view(S)), [], `${tag}: played`);
    }
  });
});
t.test('mechanics: a Loop copy is a Fading card, and Fanbase damage gained in a fight stays on the deck card for the next fight', () => {
  ['kuro_overdub', 'kuro_live_looping', 'suzu_delay_throw'].forEach((id) => {
    const hero = D.cards[id].hero;
    const loop = inst(id), atk = inst(starterOf(hero, 'attack'));
    const C = fight({ owner: hero, partner: partnerOf(hero, 0), deck: [loop, atk], seed: 3, enemies: ['ea_dummy'] });
    toHand(C, atk.uid); toHand(C, loop.uid); C.energy = 9;
    playUid(C, atk.uid); playUid(C, loop.uid);
    const copies = C.hand.filter((x) => x.id === atk.id && x.tmp);
    t.eq(copies.length, (D.cards[id].mech || {}).loop, `${id} "${D.cardPlain(id)}": ${(D.cards[id].mech || {}).loop} copy of the last other card`);
    t.ok(copies.every((x) => x.fade) && /Fade/.test(D.cardPlain(copies[0])), `${id}: the copy reads and is a Fading card`);
    if (copies[0]) { playUid(C, copies[0].uid); t.ok(C.exhaust.some((x) => x.uid === copies[0].uid), `${id}: and it fades once played`); }
  });
  ['hanae_signature_song', 'suzu_platinum_record', 'raiga_deep_cut'].forEach((id) => {
    const R = newRun({ heroes: [D.cards[id].hero, partnerOf(D.cards[id].hero, 0)], seed: 80 });
    const card = RUN.addCard(R, id);
    R.node = { kind: 'combat', tile: { q: 1, r: 1 }, tier: 'normal', enemies: ['ea_weak'], seed: 3, rewards: true, onWin: null, source: 'combat' };
    const C = COMBAT.create(RUN.combatInit(R));
    C.start();
    const c = toHand(C, card.uid); C.energy = 9;
    const first = playUid(C, c.uid).find((e) => e.type === 'hit');
    RUN.combatDone(R, C);
    const fb = D.cards[id].mech.fanbase;
    t.eq(R.deck.find((x) => x.uid === card.uid).enc, fb, `${id} "${D.cardPlain(id)}": the deck card keeps +${fb}`);
    t.ok(new RegExp('now \\+' + fb).test(D.cardPlain(R.deck.find((x) => x.uid === card.uid))), `${id}: and its text says so`);
    R.node = { kind: 'combat', tile: { q: 2, r: 2 }, tier: 'normal', enemies: ['ea_dummy'], seed: 3, rewards: true, onWin: null, source: 'combat' };
    const C2 = COMBAT.create(RUN.combatInit(R));
    C2.start();
    const c2 = toHand(C2, card.uid); C2.energy = 9;
    const second = playUid(C2, c2.uid).find((e) => e.type === 'hit');
    t.eq(second.raw - first.raw, fb, `${id}: the next fight's hit is ${fb} bigger`);
  });
});

t.test('spots: every spot bonus as D.rowText words it (damage, Block on cards, start Block, Feedback, Warm Tea, extra draw)', () => {
  HEROES.forEach((hid) => ['front', 'back'].forEach((row) => {
    const r = D.heroes[hid].rows[row] || {};
    const text = D.rowText(hid, row);
    Object.keys(r).forEach((k) => { if (r[k]) t.ok(hasNum(text, Math.abs(r[k])), `${hid} ${row}: "${text}" prints ${k} ${r[k]}`); });
    const partner = partnerOf(hid, 2);
    const C = fight({ owner: hid, partner, back: row === 'back', enemies: ['ea_dummy'], seed: 2 });
    const h = heroU(C, hid);
    t.eq(h.block, r.startBlock || 0, `${hid} ${row}: starts the turn with ${r.startBlock || 0} Block`);
    t.eq(h.st.thorns || 0, r.thorns || 0, `${hid} ${row}: Feedback ${r.thorns || 0} while standing there`);
    const atk = inst(starterOf(hid, 'attack')); C.hand.push(atk); C.energy = 9;
    const hitE = playUid(C, atk.uid).find((e) => e.type === 'hit');
    t.eq(hitE.raw, D.cards[atk.id].fx[0].n + (r.dmgAdd || 0), `${hid} ${row}: attacks deal ${r.dmgAdd || 0} more`);
    const sk = inst(starterOf(hid, 'skill')); C.hand.push(sk);
    const bE = playUid(C, sk.uid).find((e) => e.type === 'block' && e.dst.id === hid);
    const skN = D.cards[sk.id].fx.find((o) => o.op === 'block').n;
    t.eq(bE.amount, skN + (r.blockAdd || 0), `${hid} ${row}: cards give ${r.blockAdd || 0} more Block`);
    if (r.regen) { h.hp = h.maxHp - 20; C.endTurn(); t.eq(h.hp, h.maxHp - 20 + r.regen, `${hid} ${row}: Warm Tea ${r.regen} heals ${r.regen} every turn`); C.endTurn(); t.eq(h.hp, h.maxHp - 20 + 2 * r.regen, `${hid} ${row}: and again the next turn (the spot keeps it topped up)`); }
    if (r.drawAdd) t.ok(C.hand.length >= 5 + r.drawAdd, `${hid} ${row}: draws ${r.drawAdd} more`);
  }));
});

t.test('coverage: every op kind of the DSL was exercised by the oracle, and the audit reached every card, Charm, gem, status, Spell and Detour', () => {
  D.LISTS.cardOps.forEach((op) => t.ok(coverage['op:' + op] > 0 || ['add', 'gold', 'ink', 'maxHp', 'revive'].indexOf(op) >= 0, `op ${op} exercised (${coverage['op:' + op] || 0})`));
  const relicsWithEffects = Object.values(D.relics).filter((r) => r.hooks || r.mods || r.rows).length;
  const outcomes = Object.values(D.events).reduce((s, e) => s + e.choices.reduce((a, c) => a + c.out.length, 0), 0);
  const line = `cards ${heroCards.length} hero + ${junkCards.length} junk (base and upgraded), Charms ${relicsWithEffects}, gems ${Object.keys(D.gems).length}, statuses ${Object.keys(D.statuses).length}, Spells ${Object.keys(D.brushes).length}, Detours ${Object.keys(D.events).length} (${outcomes} outcomes), passives ${HEROES.length}`;
  if (VERBOSE) console.log('  audited: ' + line + '\n  op coverage: ' + J(coverage));
  t.eq(relicsWithEffects, Object.keys(D.relics).length, 'every Charm has an effect to audit');
});

t.done();
