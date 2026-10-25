// Act III: The Gilt Theatre. 11 normals, 3 elites, The Impresario, and the final boss The Grafter.
// Data files cannot import the engine, so card/graft lookups read the (import-free) content lists directly.
import { CARDS_MARROW } from './cards_marrow.js';
import { CARDS_WICK } from './cards_wick.js';
import { CARDS_ODILE } from './cards_odile.js';
import { CARDS_ANY } from './cards_any.js';
import { CARDS_JUNK } from './cards_junk.js';
import { GRAFTS_SAFE } from './grafts_safe.js';
import { GRAFTS_GREEDY } from './grafts_greedy.js';
import { GRAFTS_WEIRD } from './grafts_weird.js';

let _cards = null, _grafts = null;
const cardDef = (id) => {
  if (!_cards) { _cards = {}; for (const c of [...CARDS_MARROW, ...CARDS_WICK, ...CARDS_ODILE, ...CARDS_ANY, ...CARDS_JUNK]) _cards[c.id] = c; }
  return _cards[id];
};
const graftDef = (id) => {
  if (!_grafts) { _grafts = {}; for (const g of [...GRAFTS_SAFE, ...GRAFTS_GREEDY, ...GRAFTS_WEIRD]) _grafts[g.id] = g; }
  return _grafts[id];
};

// ---------- disruption helpers (they edit combat zones directly; enemies act after the hand was discarded) ----------
const costOf = (card) => {
  const d = cardDef(card.inst.id);
  if (!d || d.type === 'junk') return -1;
  const c = card.inst.up && d.up && d.up.cost !== undefined ? d.up.cost : d.cost;
  return c === 'X' ? 2 : c;
};
// cards the player is about to see: retained hand + top of the draw pile (+ discard when the pile will run dry)
function nextCards(A) {
  const c = A.c;
  const top = c.drawPile.slice(-c.handSize);
  return [...c.hand, ...top, ...(c.drawPile.length < c.handSize ? c.discard : [])];
}
function jamBest(A, n) {
  const pool = nextCards(A).filter((k) => !k.jam && costOf(k) >= 0).sort((a, b) => costOf(b) - costOf(a));
  for (const k of pool.slice(0, n)) { k.jam = true; A.ev({ t: 'jam', card: k.uid }); }
}
function silenceMostPlayed(A) {
  const c = A.c;
  const all = [...c.hand, ...c.drawPile, ...c.discard].filter((k) => costOf(k) >= 0 && k.plays > 0).sort((a, b) => b.plays - a.plays);
  const k = all[0];
  if (k) { k.jam = true; k.costMod = (k.costMod || 0) + 1; A.ev({ t: 'jam', card: k.uid }); }
}
function exhaustTop(A, n) {
  const c = A.c;
  for (let i = 0; i < n; i++) {
    const k = c.drawPile.length ? c.drawPile.pop() : c.discard.pop();
    if (!k) return;
    c.exhaust.push(k); A.ev({ t: 'exhaust', card: k.uid });
  }
}
function cutDraw(A, n) {
  const c = A.c;
  for (let i = 0; i < n && c.drawPile.length; i++) { const k = c.drawPile.pop(); c.discard.push(k); A.ev({ t: 'discard', card: k.uid, why: 'effect' }); }
}
const D = (n, extra) => ({ op: 'dmg', n, ...extra });
const ST = (s, n, to) => ({ op: 'status', s, n, to: to || 'player' });
const SELF = (s, n) => ({ op: 'status', s, n, to: 'self' });
const CUSTOM = (intent, text, fn) => ({ op: 'custom', intent, text, fn });
const stepAfter = (A, e) => { e.data.step = (e.data.step || 0) + 1; };

// ---------- NORMALS ----------
const usher = {
  id: 'usher', name: 'Usher', act: 3, kind: 'normal', hp: [92, 100],
  pattern: ['spot', 'strike', 'lead'],
  moves: {
    spot: { name: 'Pick Your Seat', fx: [D(12), ST('marked', 2)] },
    strike: { name: 'Torch Swing', fx: [D(24)] },
    lead: { name: 'This Way', fx: [D(14), { op: 'block', n: 12 }] },
  },
  art: { body: 'torch', color: '#c9a24b', notes: 'tall rectangle holding a torch, pointing at one seat' },
};

const maskChorus = {
  id: 'mask_chorus', name: 'Mask Chorus', act: 3, kind: 'normal', hp: [90, 98],
  pick(A, e) { const opts = ['sob', 'laugh', 'swap'].filter((m) => m !== e.data.last); const m = A.rng.pick(opts); e.data.last = m; return m; },
  moves: {
    sob: { name: 'Three Small Sobs', fx: [D(6, { hits: 3 })] },
    laugh: { name: 'Hollow Laugh', fx: [D(9, { hits: 2 }), ST('weak', 1)] },
    swap: { name: 'Swap Masks', fx: [D(8), { op: 'block', n: 12 }, ST('costup', 1)] },
  },
  art: { body: 'masks', color: '#d8c8f0', notes: 'three ellipses side by side, one grinning, one weeping, one blank' },
};

const gildedCherub = {
  id: 'gilded_cherub', name: 'Gilded Cherub', act: 3, kind: 'normal', hp: [90, 100],
  start: { fragile: 1 },
  pick(A, e) {
    const hurt = A.alive().some((x) => x.hp < x.maxHp * 0.85);
    if (hurt && e.data.last !== 'mend') return 'mend';
    return 'dart';
  },
  moves: {
    dart: { name: 'Gold Dart', fx: [D(16)] },
    mend: { name: 'Gilt Mending', intent: ['buff', 'attack'], fx: [D(8), CUSTOM('buff', 'Heals every enemy for 22', (A) => { for (const x of A.alive()) A.heal(x, 22); })] },
  },
  on: { afterMove(A, e, m) { e.data.last = m; } },
  art: { body: 'cherub', color: '#f0d890', notes: 'small gilded circle with stubby wings and a halo ring' },
};

const puppet = {
  id: 'puppet', name: 'Puppet', act: 3, kind: 'normal', hp: [92, 102],
  start: { strings: 2 },
  pattern: ['yank', 'dance', 'tangle', 'reknit'],
  moves: {
    yank: { name: 'Yank', fx: [D(20)] },
    dance: { name: 'Jerky Dance', fx: [D(9, { hits: 2 })] },
    tangle: { name: 'Tangle', fx: [D(12), ST('drawdown', 1)] },
    reknit: { name: 'Reknit Strings', intent: ['buff', 'attack'], fx: [D(10), CUSTOM('buff', 'Restores strings to 2', (A, ctx) => A.setStatus(ctx.srcEnt, 'strings', 2))] },
  },
  on: {
    modDamage(A, e, n, o) {
      if (o && (o.status || o.thorns) || n <= 0) return n;
      if (e.st.strings > 0) { A.setStatus(e, 'strings', e.st.strings - 1); return 0; }
      return n;
    },
  },
  art: { body: 'puppet', color: '#b89868', notes: 'stick figure hung from thin lines, one line per string left' },
};

const spotlight = {
  id: 'spotlight', name: 'Spotlight', act: 3, kind: 'normal', hp: [90, 98],
  pattern: ['glare', 'focus', 'glare'],
  moves: {
    glare: { name: 'Glare', fx: [D(18), ST('costup', 1)] },
    focus: { name: 'Pick Out a Star', intent: ['buff', 'attack'], fx: [D(12), { op: 'block', n: 8 }, CUSTOM('buff', 'Gives one ally 4 Strength (itself if alone)', (A, ctx) => {
      const me = ctx.srcEnt; const allies = A.alive().filter((x) => x !== me).sort((a, b) => b.hp - a.hp);
      A.status(allies[0] || me, 'strength', 4);
    })] },
  },
  art: { body: 'cone', color: '#fff3b0', notes: 'a cone of pale light falling from a small lamp, a bright circle at its base' },
};

const prompter = {
  id: 'prompter', name: 'Prompter', act: 3, kind: 'normal', hp: [92, 100],
  pattern: ['cue', 'cue', 'recite'],
  moves: {
    cue: { name: 'Cue What You Did', fx: [
      D(10),
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'attack', ifText: 'your last card was an Attack', then: [D(10), ST('vulnerable', 1)] },
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'skill', ifText: 'your last card was a Skill', then: [ST('frail', 2), { op: 'addCard', card: 'j_paperwork', n: 1, to: 'discard' }] },
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'power', ifText: 'your last card was a Power', then: [ST('weak', 2), D(6)] },
    ] },
    recite: { name: 'Recite', fx: [D(14), { op: 'block', n: 14 }] },
  },
  on: {
    playerCard(A, e, p) { e.data.last = p.spec.type; },
    afterMove(A, e) { e.data.last = null; },
  },
  art: { body: 'eyebox', color: '#6e5a88', notes: 'square prompt box with a single eye slit glowing at the front' },
};

const velvetCurtain = {
  id: 'velvet_curtain', name: 'Velvet Curtain', act: 3, kind: 'normal', hp: [96, 105],
  pattern: ['drape', 'smother'],
  moves: {
    drape: { name: 'Draw Across', intent: ['buff', 'attack'], fx: [D(12), ST('veiled', 2, 'allies')] },
    smother: { name: 'Smother', fx: [D(22), ST('frail', 2)] },
  },
  on: {
    combatStart(A, e) { for (const x of A.alive()) if (x !== e) A.status(x, 'veiled', 2); },
    death(A, e) { for (const x of A.alive()) A.setStatus(x, 'veiled', 0); },
  },
  art: { body: 'curtain', color: '#7a2f4d', notes: 'wavy-edged rectangle of velvet with a gold fringe, hiding the row behind it' },
};

const applause = {
  id: 'applause', name: 'Applause', act: 3, kind: 'normal', hp: [90, 100],
  pattern: ['clap', 'clap', 'roar'],
  moves: {
    clap: { name: 'Polite Clapping', fx: [D(5, { hits: 3 })] },
    roar: { name: 'Standing Ovation', fx: [D(22), { op: 'block', n: 8 }] },
  },
  on: {
    playerCard(A, e) {
      e.data.cards = (e.data.cards || 0) + 1;
      if (e.data.cards % 2 === 0 && (e.st.strength || 0) < 8) A.status(e, 'strength', 1);
    },
  },
  art: { body: 'clappers', color: '#e8b8a0', notes: 'a cluster of pairs of angular palms meeting; more of them each time you play a card' },
};

const understudy = {
  id: 'understudy', name: 'Understudy', act: 3, kind: 'normal', hp: [90, 100],
  pattern: ['rehearse', 'rehearse', 'bow'],
  moves: {
    rehearse: { name: 'Rehearse', fx: [D(15)] },
    bow: { name: 'Take a Bow', fx: [D(8), { op: 'block', n: 14 }] },
  },
  // When an ally dies, the Understudy learns its moves (kept on e.data; its definition is cloned per enemy).
  pick(A, e) {
    if (!e.data.copy) {
      const gone = A.c.enemies.find((x) => x.dead && x !== e && x.id !== 'understudy' && x.def.kind !== 'boss' && !x.minion && x.def.moves);
      if (gone) {
        const src = gone.def;
        const moves = { ...e.def.moves };
        for (const [k, v] of Object.entries(src.moves)) moves['copy_' + k] = v;
        const pat = (src.pattern || Object.keys(src.moves)).slice();
        e.data.copy = gone.id; e.data.pat = pat; e.data.i = 0;
        e.def = { ...e.def, moves };
        e.name = 'Understudy as ' + gone.name;
      }
    }
    if (e.data.copy) { const m = 'copy_' + e.data.pat[e.data.i++ % e.data.pat.length]; if (e.def.moves[m]) return m; }
    const own = understudy.pattern; return own[(e.turn) % own.length];
  },
  art: { body: 'outline', color: '#c9c0d8', notes: 'blank chalk outline of a performer, filled in with the colors of whoever fell' },
};

const critic = {
  id: 'critic', name: 'Critic', act: 3, kind: 'normal', hp: [94, 104],
  pattern: ['review', 'scathe'],
  moves: {
    review: { name: 'Review', fx: [D(16), { op: 'if', cond: (c, ctx) => criticLow(c, ctx.srcEnt), ifText: 'you dealt under 20 damage last turn', then: [CUSTOM('debuff', 'Frays your highest-cost card (jam)', (A) => jamBest(A, 1))] }] },
    scathe: { name: 'Scathing Notice', fx: [D(22), ST('frail', 1), { op: 'if', cond: (c, ctx) => criticLow(c, ctx.srcEnt), ifText: 'you dealt under 20 damage last turn', then: [CUSTOM('debuff', 'Frays your highest-cost card (jam)', (A) => jamBest(A, 1))] }] },
  },
  on: {
    combatStart(A, e) { e.data.snap = hpTotal(A.c); },
    afterMove(A, e) { e.data.snap = hpTotal(A.c); },
  },
  art: { body: 'hat', color: '#2f2a3a', notes: 'very tall top hat on a thin coat, a pencil for one arm' },
};
function hpTotal(c) { return c.enemies.reduce((a, x) => a + Math.max(0, x.hp) + Math.max(0, x.block || 0), 0); }
function criticLow(c, e) { return Math.max(0, (e.data.snap || 0) - hpTotal(c)) < 20; }

const heckler = {
  id: 'heckler', name: 'Heckler', act: 3, kind: 'normal', hp: [90, 98],
  pattern: ['boo', 'hiss', 'pelt'],
  moves: {
    boo: { name: 'Boo', fx: [D(13), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    hiss: { name: 'Hiss', fx: [D(22)] },
    pelt: { name: 'Pelt with Fruit', fx: [D(12), { op: 'addCard', card: 'j_static', n: 1, to: 'draw' }] },
  },
  art: { body: 'masks', color: '#9a4f4f', notes: 'one sneering mask on a stick, thrown tomatoes drawn as red circles' },
};

// ---------- ELITES ----------
const diva = {
  id: 'the_diva', name: 'The Diva', act: 3, kind: 'elite', hp: [176, 184],
  pattern: ['vibrato', 'high_c', 'aria', 'encore'],
  moves: {
    vibrato: { name: 'Vibrato', fx: [D(9, { hits: 3 }), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    high_c: { name: 'High C', fx: [D(14), ST('weak', 1), CUSTOM('debuff', 'Silences the card you played most (jam, +1 cost)', (A) => silenceMostPlayed(A))] },
    aria: { name: 'Aria (hold the note)', fx: [D(36)] },
    encore: { name: 'Encore', intent: ['buff', 'attack'], fx: [D(10), { op: 'block', n: 16 }, SELF('strength', 3)] },
  },
  art: { body: 'masks', color: '#e8c25a', notes: 'wide gold gown ellipse with a tiny head, mouth open as a dark circle' },
};

const stagehands = {
  id: 'stagehands', name: 'Stagehands', act: 3, kind: 'elite', hp: [178, 186],
  pattern: ['sandbag', 'winch', 'rig', 'strike_set'],
  moves: {
    sandbag: { name: 'Drop the Sandbag', fx: [D(28), ST('frail', 1)] },
    winch: { name: 'Winch', fx: [D(16), CUSTOM('debuff', 'Cuts 2 cards from your next draw into the discard', (A) => cutDraw(A, 2))] },
    rig: { name: 'Rig the Trap', fx: [D(14), ST('costup', 1), { op: 'addCard', card: 'j_clot', n: 1, to: 'discard' }] },
    strike_set: { name: 'Strike the Set', intent: ['defend', 'buff', 'attack'], fx: [D(14), { op: 'block', n: 20 }, SELF('strength', 2)] },
  },
  art: { body: 'puppet', color: '#4a4658', notes: 'two dark stick figures hauling ropes, a sandbag circle hung above you' },
};

const goldLeafGolem = {
  id: 'gold_leaf_golem', name: 'Gold Leaf Golem', act: 3, kind: 'elite', hp: [180, 188],
  pattern: ['gild', 'slam', 'flake'],
  moves: {
    gild: { name: 'Gild Itself', intent: ['defend', 'buff', 'attack'], fx: [{ op: 'block', n: { base: 8, per: 'gold', mul: 0.1, max: 36 } }, D(12), SELF('strength', 2)] },
    slam: { name: 'Gilt Slam', fx: [D(32)] },
    flake: { name: 'Peel Off Your Gold', fx: [D(20), CUSTOM('debuff', 'Steals up to 12 gold and plates itself with it', (A, ctx) => {
      const take = Math.min(12, A.c.run.gold || 0);
      if (take > 0) { A.gold(-take); A.block(ctx.srcEnt, take); }
    })] },
  },
  art: { body: 'outline', color: '#d9b440', notes: 'heavy rectangular figure of beaten gold leaf, flaking in small polygons' },
};

// ---------- BOSS: THE IMPRESARIO ----------
const PHASES = [
  ['downbeat', 'crescendo', 'fermata'],
  ['staccato', 'cut_time', 'conduct'],
  ['fortissimo', 'da_capo', 'finale'],
];
const actOf = (e) => (e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3);
function impresarioPick(A, e) {
  const ph = e.data.phase || actOf(e);
  return PHASES[ph - 1][(e.data.step || 0) % 3];
}
const impresario = {
  id: 'the_impresario', name: 'The Impresario', act: 3, kind: 'boss', hp: 340,
  pick: impresarioPick,
  moves: {
    downbeat: { name: 'Downbeat', fx: [D(22), { op: 'block', n: 10 }] },
    crescendo: { name: 'Crescendo', fx: [D(9, { hits: 3 })] },
    fermata: { name: 'Fermata', fx: [D(14), ST('costup', 1), ST('marked', 2)] },
    staccato: { name: 'Staccato', fx: [D(6, { hits: 5 })] },
    cut_time: { name: 'Cut Time', fx: [D(20), ST('drawdown', 1), CUSTOM('debuff', 'Cuts 2 cards from your next draw into the discard', (A) => cutDraw(A, 2))] },
    conduct: { name: 'Conduct the Pit', fx: [D(14), SELF('strength', 3), { op: 'addCard', card: 'j_ringing', n: 2, to: 'discard' }] },
    fortissimo: { name: 'Fortissimo', fx: [D(34), ST('weak', 1)] },
    da_capo: { name: 'Da Capo', fx: [D(9, { hits: 4 }), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    finale: { name: 'Finale', fx: [D(22), ST('vulnerable', 2), ST('costup', 1), ST('drawdown', 1)] },
  },
  on: {
    combatStart(A, e) { e.data.phase = 1; e.data.step = 0; A.setStatus(e, 'baton', 1); },
    afterMove(A, e) { stepAfter(A, e); },
    damaged(A, e) {
      const ph = actOf(e);
      if (ph > (e.data.phase || 1)) {
        e.data.phase = ph; e.data.step = 0;
        A.setStatus(e, 'baton', ph);
        A.block(e, 14);
        e.move = impresarioPick(A, e);
        A.ev({ t: 'intent', e: e.uid, move: e.move });
      }
    },
  },
  art: { body: 'conductor', color: '#e8d8a8', notes: 'tailcoat figure, polyline baton that sits high, level or low for act one, two, three' },
};

// ---------- FINAL BOSS: THE GRAFTER ----------
const SCHOOL_ORDER = ['ember', 'blood', 'echo', 'hoard', 'rust', 'static', 'gilded'];
function tallyDeck(run) {
  const schools = {}, weights = {}; let count = 0, weight = 0, best = 0, bestName = '';
  for (const inst of run.deck || []) {
    for (const gid of inst.grafts || []) {
      const g = graftDef(gid); count++;
      if (g) { schools[g.school] = (schools[g.school] || 0) + 1; weights[g.school] = (weights[g.school] || 0) + g.weight; weight += g.weight; }
    }
    const d = cardDef(inst.id);
    if (d && d.type !== 'junk') {
      const fx = inst.up && d.up && d.up.fx ? d.up.fx : d.fx;
      const v = bestDmg(fx || []);
      if (v > best) { best = v; bestName = d.name; }
    }
  }
  let school = 'none', top = 0;
  for (const s of SCHOOL_ORDER) if ((schools[s] || 0) > top) { top = schools[s]; school = s; }
  return { schools, weights, count, weight, school, best, bestName };
}
function bestDmg(fx) {
  let b = 0;
  for (const o of fx) {
    if (o.op === 'dmg') { const n = typeof o.n === 'number' ? o.n : (o.n && o.n.base) || 0; const h = typeof o.hits === 'number' ? o.hits : 1; b = Math.max(b, n * h); }
    else if (o.op === 'if') b = Math.max(b, bestDmg(o.then || []));
    else if (o.op === 'repeat') b = Math.max(b, bestDmg(o.fx || []) * (typeof o.n === 'number' ? o.n : 1));
  }
  return b;
}
const grafterDmg = (e) => 12 + Math.min(40, (e.data.count || 0));
const schoolN = (e) => Math.min(8, 2 + Math.floor((e.data.count || 0) / 3));

function spliceEffect(A, ctx) {
  const e = ctx.srcEnt, n = schoolN(e), P = A.player;
  switch (e.data.school) {
    case 'ember': A.status(P, 'burn', n + 1); break;
    case 'blood': A.status(P, 'bleed', n); break;
    case 'echo': A.dmg(e, P, 6 + Math.floor((e.data.count || 0) / 2)); break;
    case 'hoard': A.status(e, 'barricade', 1); A.block(e, 8 + (e.data.weight || 0)); break;
    case 'rust': A.addCard('j_flake', 2, 'discard'); A.addCard('j_paperwork', 1, 'discard'); break;
    case 'static': A.status(P, 'marked', 2); A.status(P, 'vulnerable', 1); break;
    case 'gilded': { const t = Math.min(5 + (e.data.count || 0), A.c.run.gold || 0); if (t > 0) { A.gold(-t); A.heal(e, t); } A.status(P, 'weak', 1); break; }
    default: A.status(P, 'weak', 1); A.block(e, 10);
  }
}
const SPLICE_TEXT = 'Applies the effect of your most grafted school: Ember burn, Blood bleed, Echo a second hit, Hoard block it keeps, Rust junk, Static marks, Gilded steals gold. No grafts: Weak and block';

const grafter = {
  id: 'the_grafter', name: 'The Grafter', act: 3, kind: 'boss', final: true, hp: 420,
  pattern: ['stitch', 'splice', 'mirror'],
  moves: {
    stitch: { name: 'Stitch', fx: [{ op: 'dmg', n: { base: 12, per: 'grafts', max: 52 } }] },
    splice: { name: 'Splice', intent: ['attack', 'debuff'], fx: [{ op: 'dmg', n: { base: 8, per: 'grafts', mul: 0.5, max: 28 } }, CUSTOM('debuff', SPLICE_TEXT, spliceEffect)] },
    mirror: { name: 'Your Best Card', fx: [D(14)] }, // replaced per fight in combatStart
  },
  on: {
    combatStart(A, e) {
      const t = tallyDeck(A.c.run);
      Object.assign(e.data, { count: t.count, weight: t.weight, school: t.school, schools: t.schools, weights: t.weights, best: t.best, bestName: t.bestName });
      const dmg = Math.max(14, Math.min(34, t.best || 14));
      const mirror = { name: t.bestName ? 'Your ' + t.bestName : 'Your Best Card', fx: [D(dmg)] };
      e.def = { ...e.def, moves: { ...e.def.moves, mirror } }; // per-enemy clone, the shared definition is untouched
    },
    damaged(A, e) {
      if (!e.data.rage && e.hp < e.maxHp / 2) { e.data.rage = true; A.status(e, 'strength', 3); }
    },
  },
  art: { body: 'patchwork', color: '#b8a070', notes: 'a human figure stitched from mismatched patches in the colors of your own grafts, dark seams, no face' },
};

export const ENEMIES_3 = [
  usher, maskChorus, gildedCherub, puppet, spotlight, prompter, velvetCurtain, applause, understudy, critic, heckler,
  diva, stagehands, goldLeafGolem,
  impresario, grafter,
];
