// Act III: The Gilt Theatre. 11 normals, 3 elites, The Impresario, and the final boss The Grafter.
// Card and graft lookups go through the one registry (data/index.js). That module imports this one, so CARDS and GRAFTS are
// live bindings that are only read inside functions, at combat time, long after both modules have loaded (never at module scope).
import { CARDS, GRAFTS } from './index.js';
import { schoolsOf } from '../engine/cards.js';
import { ST, CUSTOM } from './helpers.js';

const cardDef = (id) => CARDS[id];
const graftDef = (id) => GRAFTS[id];

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
export { cardDef, graftDef, costOf, nextCards };
const D = (n, extra) => ({ op: 'dmg', n, ...extra });
const SELF = (s, n) => ({ op: 'status', s, n, to: 'self' });
const stepAfter = (A, e) => { e.data.step = (e.data.step || 0) + 1; };

// ---------- NORMALS ----------
const usher = {
  id: 'usher', name: 'Usher', act: 3, kind: 'normal', start: { strength: 1 }, hp: [81, 89],
  pattern: ['spot', 'strike', 'lead'],
  moves: {
    spot: { name: 'Pick Your Seat', fx: [D(12), ST('marked', 2), ST('cadencelock', 1)] },
    strike: { name: 'Torch Swing', fx: [D(24)] },
    lead: { name: 'This Way', fx: [D(14), { op: 'block', n: 12 }] },
  },
  art: { body: 'torch', color: '#c9a24b', notes: 'tall rectangle holding a torch, pointing at one seat' },
};

const maskChorus = {
  id: 'mask_chorus', name: 'Mask Chorus', act: 3, kind: 'normal', start: { strength: 1 }, hp: [94, 102],
  pick(A, e) { const opts = ['sob', 'laugh', 'swap'].filter((m) => m !== e.data.last); const m = A.rng.pick(opts); e.data.last = m; return m; },
  moves: {
    sob: { name: 'Three Small Sobs', fx: [D(6, { hits: 3 })] },
    laugh: { name: 'Hollow Laugh', fx: [D(9, { hits: 2 }), ST('weak', 1)] },
    swap: { name: 'Swap Masks', fx: [D(8), { op: 'block', n: 12 }, ST('costup', 1), ST('stagefright', 2)] },
  },
  art: { body: 'masks', color: '#d8c8f0', notes: 'three ellipses side by side, one grinning, one weeping, one blank' },
};

const gildedCherub = {
  id: 'gilded_cherub', name: 'Gilded Cherub', act: 3, kind: 'normal', hp: [94, 105],
  start: { strength: 1, fragile: 1 },
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
  id: 'puppet', name: 'Puppet', act: 3, kind: 'normal', hp: [81, 91],
  start: { strength: 1, strings: 2 },
  pattern: ['yank', 'dance', 'tangle', 'reknit'],
  moves: {
    yank: { name: 'Yank', fx: [D(20)] },
    dance: { name: 'Jerky Dance', fx: [D(9, { hits: 2 })] },
    tangle: { name: 'Tangle', fx: [D(12), ST('drawdown', 1), ST('numb', 1)] },
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
  id: 'spotlight', name: 'Spotlight', act: 3, kind: 'normal', start: { strength: 1 }, hp: [80, 88],
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
  id: 'prompter', name: 'Prompter', act: 3, kind: 'normal', start: { strength: 1 }, hp: [96, 105],
  pattern: ['cue', 'cue', 'recite'],
  moves: {
    // The damage bonuses ride on the Primed status (+10 after an Attack, +6 after a Power, +8 for the same school twice in a row),
    // so the intent number always includes them.
    cue: { name: 'Cue What You Did', fx: [
      D(10),
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'attack', ifText: 'your last card was an Attack (+10 damage)', then: [ST('vulnerable', 1)] },
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'skill', ifText: 'your last card was a Skill', then: [ST('frail', 2), { op: 'addCard', card: 'j_paperwork', n: 1, to: 'discard' }] },
      { op: 'if', cond: (c, ctx) => ctx.srcEnt.data.last === 'power', ifText: 'your last card was a Power (+6 damage)', then: [ST('weak', 2)] },
      { op: 'if', cond: (c, ctx) => !!ctx.srcEnt.data.same, ifText: 'your last two cards shared a school (+8 damage)', then: [] },
    ] },
    recite: { name: 'Recite', fx: [D(14), { op: 'block', n: 14 }] },
  },
  on: {
    playerCard(A, e, p) {
      const t = p.spec.type, s = p.spec.school || null;
      e.data.same = !!s && s === e.data.school; e.data.school = s; e.data.last = t;
      if (e.move === 'cue') A.setStatus(e, 'primed', (t === 'attack' ? 10 : t === 'power' ? 6 : 0) + (e.data.same ? 8 : 0));
    },
    afterMove(A, e) { e.data.last = null; e.data.same = false; e.data.school = null; A.setStatus(e, 'primed', 0); },
  },
  art: { body: 'eyebox', color: '#6e5a88', notes: 'square prompt box with a single eye slit glowing at the front' },
};

const velvetCurtain = {
  id: 'velvet_curtain', name: 'Velvet Curtain', act: 3, kind: 'normal', start: { strength: 1 }, hp: [101, 110],
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
  id: 'applause', name: 'Applause', act: 3, kind: 'normal', start: { strength: 1 }, hp: [80, 89],
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
  id: 'understudy', name: 'Understudy', act: 3, kind: 'normal', start: { strength: 1 }, hp: [94, 105],
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
  id: 'critic', name: 'Critic', act: 3, kind: 'normal', start: { strength: 1 }, hp: [84, 92],
  pattern: ['review', 'scathe'],
  moves: {
    review: { name: 'Review', fx: [D(16), { op: 'if', cond: (c, ctx) => criticLow(c, ctx.srcEnt), ifText: 'you dealt under 25 damage last turn', then: [CUSTOM('debuff', 'Frays your highest-cost card (jam)', (A) => jamBest(A, 1)), ST('dread', 2)] }] },
    scathe: { name: 'Scathing Notice', fx: [D(22), ST('frail', 1), { op: 'if', cond: (c, ctx) => criticLow(c, ctx.srcEnt), ifText: 'you dealt under 25 damage last turn', then: [CUSTOM('debuff', 'Frays your highest-cost card (jam)', (A) => jamBest(A, 1)), ST('dread', 2)] }] },
  },
  on: {
    combatStart(A, e) { e.data.snap = hpTotal(A.c); },
    afterMove(A, e) { e.data.snap = hpTotal(A.c); },
  },
  art: { body: 'hat', color: '#2f2a3a', notes: 'very tall top hat on a thin coat, a pencil for one arm' },
};
function hpTotal(c) { return c.enemies.reduce((a, x) => a + Math.max(0, x.hp) + Math.max(0, x.block || 0), 0); }
function criticLow(c, e) { return Math.max(0, (e.data.snap || 0) - hpTotal(c)) < 25; }

const heckler = {
  id: 'heckler', name: 'Heckler', act: 3, kind: 'normal', start: { strength: 1 }, hp: [94, 102],
  pattern: ['boo', 'hiss', 'pelt'],
  moves: {
    boo: { name: 'Boo', fx: [D(13), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    hiss: { name: 'Hiss', fx: [D(22)] },
    pelt: { name: 'Pelt with Fruit', fx: [D(12), ST('poison', 3), { op: 'addCard', card: 'j_static', n: 1, to: 'draw' }] },
  },
  art: { body: 'masks', color: '#9a4f4f', notes: 'one sneering mask on a stick, thrown tomatoes drawn as red circles' },
};

// ---------- ELITES ----------
const diva = {
  id: 'the_diva', name: 'The Diva', act: 3, kind: 'elite', start: { strength: 1 }, hp: [155, 162],
  pick: (A, e) => { A.setStatus(e, 'applause', 0); return ['vibrato', 'high_c', 'aria', 'encore'][e.turn % 4]; },
  on: { playerCard: (A, e) => { A.setStatus(e, 'applause', Math.max(0, Math.min(4, A.c.playsTurn - 5))); } },
  moves: {
    vibrato: { name: 'Vibrato', fx: [D(9, { hits: 3 }), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    high_c: { name: 'High C', fx: [D(14), ST('weak', 1), CUSTOM('debuff', 'Silences the card you played most (jam, +1 cost)', (A) => silenceMostPlayed(A))] },
    aria: { name: 'Aria', tip: 'Hold the note: 36 damage, +3 for each card you play past your 5th this turn (max +12). Fewer, bigger plays keep it low.', fx: [D({ base: 36, per: 'st:applause@self', mul: 3 }), ST('brittle', 2)] },
    encore: { name: 'Encore', intent: ['buff', 'attack'], fx: [D(10), { op: 'block', n: 16 }, SELF('strength', 3)] },
  },
  art: { body: 'masks', color: '#e8c25a', notes: 'wide gold gown ellipse with a tiny head, mouth open as a dark circle' },
};

const stagehands = {
  id: 'stagehands', name: 'Stagehands', act: 3, kind: 'elite', start: { strength: 1 }, hp: [185, 193],
  pattern: ['sandbag', 'winch', 'rig', 'strike_set'],
  moves: {
    sandbag: { name: 'Drop the Sandbag', fx: [D(28), ST('frail', 1)] },
    winch: { name: 'Hoist the Heavy', tip: 'Jams your most expensive card in the next hand (+1 cost). Cheap hands and 0-cost cards blunt it.', fx: [D(16), CUSTOM('debuff', 'Jams your most expensive card in your next hand (+1 cost)', (A) => jamBest(A, 1))] },
    rig: { name: 'Rig the Trap', fx: [D(14), ST('costup', 1), ST('infection', 1), { op: 'addCard', card: 'j_clot', n: 1, to: 'discard' }] },
    strike_set: { name: 'Strike the Set', intent: ['defend', 'buff', 'attack'], fx: [D(14), { op: 'block', n: 20 }, SELF('strength', 2)] },
  },
  art: { body: 'puppet', color: '#4a4658', notes: 'two dark stick figures hauling ropes, a sandbag circle hung above you' },
};

const goldLeafGolem = {
  id: 'gold_leaf_golem', name: 'Gold Leaf Golem', act: 3, kind: 'elite', start: { strength: 1, leafarmor: 14 }, hp: [158, 165],
  pattern: ['gild', 'slam', 'flake'],
  // Leaf Armor: a single card hit deals at most 14. Status damage, Thorns and Thread arcs are not card hits and ignore it.
  on: { modDamage: (A, e, n, o) => { const cap = e.st.leafarmor || 0; return o && o.card && cap > 0 && n > cap ? cap : n; } },
  moves: {
    gild: { name: 'Gild Itself', intent: ['defend', 'buff', 'attack'], fx: [{ op: 'block', n: { base: 8, per: 'gold', mul: 0.1, max: 36 } }, D(12), SELF('strength', 1)] },
    slam: { name: 'Gilt Slam', tip: 'Leaf Armor: no single card hit deals more than 14 to it. Multi-hit, Burn and Bleed go through.', fx: [D({ base: 24, per: 'gold', mul: 1 / 15, max: 32 })] },
    flake: { name: 'Peel Your Gold', fx: [D(20), CUSTOM('debuff', 'Steals up to 12 gold and plates itself with it', (A, ctx) => {
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
  id: 'the_impresario', name: 'The Impresario', act: 3, kind: 'boss', start: { strength: 1 }, hp: 128,
  pick: (A, e) => { A.setStatus(e, 'ensemble', 0); e.data.sch = {}; return impresarioPick(A, e); },
  moves: {
    downbeat: { name: 'Downbeat', tip: 'Ensemble: every hit deals +1 once you play three or more schools in a turn. Two schools or fewer keep the score quiet.', fx: [D(19), { op: 'block', n: 10 }] },
    crescendo: { name: 'Crescendo', fx: [D(9, { hits: 3 })] },
    fermata: { name: 'Fermata', fx: [D(14), ST('costup', 1), ST('marked', 2)] },
    staccato: { name: 'Staccato', fx: [D(6, { hits: 5 })] },
    cut_time: { name: 'Cut Time', fx: [D(17), ST('drawdown', 1), CUSTOM('debuff', 'Cuts 2 cards from your next draw into the discard', (A) => cutDraw(A, 2))] },
    conduct: { name: 'Conduct the Pit', fx: [D(14), ST('rejection', 1), SELF('strength', 3), { op: 'addCard', card: 'j_ringing', n: 2, to: 'discard' }] },
    fortissimo: { name: 'Fortissimo', fx: [D(24), ST('weak', 1)] },
    da_capo: { name: 'Da Capo', fx: [D(9, { hits: 4 }), CUSTOM('debuff', 'Exhausts a card you were about to draw', (A) => exhaustTop(A, 1))] },
    finale: { name: 'Finale', fx: [D(19), ST('vulnerable', 2), ST('costup', 1), ST('drawdown', 1)] },
  },
  on: {
    combatStart(A, e) { e.data.phase = 1; e.data.step = 0; A.setStatus(e, 'baton', 1); },
    playerCard(A, e, { spec }) {
      const sch = schoolsOf(spec);
      if (!sch.length) return;
      if (e.data.turnSeen !== A.c.turn) { e.data.turnSeen = A.c.turn; e.data.sch = {}; }
      e.data.sch = e.data.sch || {};
      for (const s of sch) e.data.sch[s] = true;
      A.setStatus(e, 'ensemble', Math.min(1, Math.max(0, Object.keys(e.data.sch).length - 2)));
    },
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
const schoolN = (e) => Math.min(8, 2 + Math.floor((e.data.count || 0) / 3));

function spliceEffect(A, ctx) {
  const e = ctx.srcEnt, n = schoolN(e), P = A.player;
  if (A.c.strain && A.c.strain.strain >= 2 && (P.st.infection || 0) < 3) A.status(P, 'infection', 1);
  const sch = e.data.mirror || e.data.school;
  switch (sch) {
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
// Reknit: at half HP every Overload card (3 grafts) in the deck is marked. Marked cards deal x1.0 and roll Shatter at 40% on first play
// (needs the two playCard lines in the report). Tempering a card first removes it from the Overloads.
function reknit(A, e) {
  const c = A.c, uids = [];
  for (const z of [c.hand, c.drawPile, c.discard, c.exhaust, c.powers]) for (const k of z) if (!k.temp && k.inst.grafts.length > 2 && !k.reknit) { k.reknit = true; uids.push(k.uid); }
  e.data.reknit = uids.length;
  if (uids.length) { A.status(e, 'reknit', uids.length); A.ev({ t: 'reknit', cards: uids, e: e.uid }); }
}
const SPLICE_TEXT = 'Applies the effect of your most grafted school: Ember burn, Blood bleed, Echo a second hit, Hoard block it keeps, Rust junk, Static marks, Gilded steals gold. No grafts: Weak and block. With Strain 2+ it also adds Infection 1. It copies the school of your last Thread cut (the Line cashed when your turn ends comes too late to count)';

const MIRROR_TIP = 'It copies your own card: the hardest-hitting attack in your deck (name above), and it hits you for that card\'s damage, at least 14 and at most 34.';

const grafter = {
  id: 'the_grafter', name: 'The Grafter', act: 3, kind: 'boss', start: { strength: 1 }, final: true, hp: 220,
  pattern: ['stitch', 'splice', 'mirror'],
  moves: {
    stitch: { name: 'Stitch', fx: [{ op: 'dmg', n: { base: 12, per: 'grafts', max: 36 } }] },
    splice: { name: 'Splice', intent: ['attack', 'debuff'], tip: 'If your most grafted school is Echo (or it copies an Echo payout), it hits a second time for 6 plus half your graft count. The number shown includes that second hit.',
      fx: [{ op: 'dmg', n: { base: 8, per: 'grafts', mul: 0.5, max: 28 } }, { ...CUSTOM('debuff', SPLICE_TEXT, spliceEffect), intentDmg: (c, e) => ((e.data.mirror || e.data.school) === 'echo' ? 6 + Math.floor((e.data.count || 0) / 2) : 0) }] },
    mirror: { name: 'Your Best Card', tip: MIRROR_TIP, fx: [D(14)] }, // replaced per fight in combatStart
  },
  on: {
    combatStart(A, e) {
      const t = tallyDeck(A.c.run);
      Object.assign(e.data, { count: t.count, weight: t.weight, school: t.school, schools: t.schools, weights: t.weights, best: t.best, bestName: t.bestName });
      const dmg = Math.max(14, Math.min(34, t.best || 14));
      const mirror = { name: t.bestName ? 'Your ' + t.bestName : 'Your Best Card', tip: MIRROR_TIP, fx: [D(dmg)] };
      e.def = { ...e.def, moves: { ...e.def.moves, mirror } }; // per-enemy clone, the shared definition is untouched
    },
    damaged(A, e) {
      if (!e.data.rage && e.hp < e.maxHp / 2) { e.data.rage = true; A.status(e, 'strength', 3); reknit(A, e); }
    },
    // Boss mirror (THREAD.md): the school of your last cut payout (not the end-of-turn cash, which lands after the intent was shown) becomes the school of its next Splice.
    seamPay(A, e, p) {
      const i = p && p.school ? SCHOOL_ORDER.indexOf(p.school) : -1;
      if (i >= 0 && p.kind !== 'end') { e.data.mirror = p.school; A.setStatus(e, 'mirrorsch', i + 1); }
    },
    afterMove(A, e, m) { if (m === 'splice' && e.data.mirror) { e.data.mirror = null; A.setStatus(e, 'mirrorsch', 0); } },
  },
  art: { body: 'patchwork', color: '#b8a070', notes: 'a human figure stitched from mismatched patches in the colors of your own grafts, dark seams, no face' },
};

export const ENEMIES_3 = [
  usher, maskChorus, gildedCherub, puppet, spotlight, prompter, velvetCurtain, applause, understudy, critic, heckler,
  diva, stagehands, goldLeafGolem,
  impresario, grafter,
];
