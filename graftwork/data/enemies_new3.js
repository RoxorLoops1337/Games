// Brand-new Act 3 enemies from the depth pass (design/ENEMY_DEPTH.md and design/THREAD.md). Same schema as enemies_3.js.
import { cardDef, graftDef, nextCards, costOf } from './enemies_3.js';

const D = (n, extra) => ({ op: 'dmg', n, ...extra });
const ST = (s, n, to) => ({ op: 'status', s, n, to: to || 'player' });
const CUSTOM = (intent, text, fn) => ({ op: 'custom', intent, text, fn });
const SCHOOL_ORDER = ['ember', 'blood', 'echo', 'hoard', 'rust', 'static', 'gilded'];

// every school a deck card belongs to: its own plus those of its grafts (live and fused)
function schoolsOfInst(inst) {
  const d = cardDef(inst.id), out = [];
  if (d && d.school) out.push(d.school);
  for (const gid of [...(inst.grafts || []), ...(inst.fused || [])]) { const g = graftDef(gid); if (g && g.school) out.push(g.school); }
  return out;
}

// ---------- STAGE MANAGER ----------
// Guard role: Cue hands every ally Stitched Up (itself when alone). Call Time is a two-turn telegraphed big that only lands in
// full when you played fewer than 3 cards; the 18 extra rides on Primed, so the intent number drops the moment you play your 3rd card.
const stageManager = {
  id: 'stage_manager', name: 'Stage Manager', act: 3, kind: 'normal', start: { strength: 1 }, hp: [92, 98],
  pattern: ['cue', 'prompt_book', 'call_time'],
  moves: {
    cue: { name: 'Cue the Crew', intent: ['defend', 'buff', 'attack'], fx: [D(8), ST('stitchedup', 8, 'allies'),
      CUSTOM('buff', 'Gives itself Stitched Up 8 when it stands alone', (A, ctx) => { if (!A.alive().some((x) => x !== ctx.srcEnt)) A.status(ctx.srcEnt, 'stitchedup', 8); })] },
    prompt_book: { name: 'Consult the Prompt Book', fx: [D(16), { op: 'block', n: 8 }] },
    call_time: { name: 'Call Time', fx: [D(12), { op: 'if', cond: () => false, ifText: 'you played fewer than 3 cards this turn (+18 damage)', then: [] }] },
  },
  pick(A, e) {
    const m = ['cue', 'prompt_book', 'call_time'][e.turn % 3];
    A.setStatus(e, 'primed', m === 'call_time' ? 18 : 0);
    return m;
  },
  on: {
    playerCard(A, e) { if (e.move === 'call_time' && A.c.cardsThisTurn.length >= 3) A.setStatus(e, 'primed', 0); },
    afterMove(A, e) { A.setStatus(e, 'primed', 0); },
  },
  art: { body: 'eyebox', color: '#8a7a4a', notes: 'tall clipboard body with one eye slit; a headset and a ring of keys at the belt' },
};

// ---------- UNDERSTUDY'S SHADOW ----------
// Copies the school of the last card you played; +2 damage per card of that school in your deck (max +10, carried on Shadowing, live in the intent)
// and a small rider of that school.
const RIDERS = {
  ember: ['burn', 2], blood: ['bleed', 2], echo: ['weak', 1], static: ['marked', 1], gilded: ['frail', 1],
};
const understudysShadow = {
  id: 'understudys_shadow', name: "Understudy's Shadow", act: 3, kind: 'normal', start: { strength: 1 }, hp: [90, 96],
  pattern: ['mimic', 'curtsey', 'mimic'],
  moves: {
    mimic: { name: 'Mimic Your Last Line', intent: ['attack', 'debuff'], fx: [D(8), CUSTOM('debuff', 'Copies the school of your last card: Ember burn 2, Blood bleed 2, Echo weak 1, Static marked 1, Gilded frail 1, Hoard 10 block for itself, Rust a Flake in your discard', (A, ctx) => {
      const e = ctx.srcEnt, s = e.data.school;
      if (!s) return;
      if (RIDERS[s]) A.status(A.player, RIDERS[s][0], RIDERS[s][1]);
      else if (s === 'hoard') A.block(e, 10);
      else if (s === 'rust') A.addCard('j_flake', 1, 'discard');
    })] },
    curtsey: { name: 'Curtsey', fx: [D(8), { op: 'block', n: 14 }] },
  },
  on: {
    playerCard(A, e, p) {
      const s = p.spec.school || (p.spec.grafts && p.spec.grafts.length ? schoolsOfInst(p.card.inst)[0] : null) || null;
      e.data.school = s;
      if (e.move !== 'mimic') return;
      const n = s ? A.c.run.deck.filter((i) => schoolsOfInst(i).includes(s)).length : 0;
      A.setStatus(e, 'shadowing', Math.min(5, n));
    },
    afterMove(A, e) { e.data.school = null; A.setStatus(e, 'shadowing', 0); },
  },
  art: { body: 'outline', color: '#5a5470', notes: 'dark chalk silhouette of a performer that lags half a beat behind you; a small spotlight ring clipped to the collar' },
};

// ---------- LOCKSMITH ----------
// Seals your biggest school (cards plus grafts): each turn the first card of it you are about to draw is Frayed.
// Also takes a hook on the Thread: cutting a Line of the sealed school only hardens the lock (+4 block).
function biggestSchool(run) {
  const n = {};
  for (const inst of run.deck || []) for (const s of schoolsOfInst(inst)) n[s] = (n[s] || 0) + 1;
  let best = null, top = 0;
  for (const s of SCHOOL_ORDER) if ((n[s] || 0) > top) { top = n[s]; best = s; }
  return best;
}
function fray(A, e) {
  const s = e.data.seal; if (!s) return;
  const k = nextCards(A).find((x) => !x.jam && costOf(x) >= 0 && schoolsOfInst(x.inst).includes(s));
  if (k) { k.jam = true; A.ev({ t: 'jam', card: k.uid }); }
}
const locksmith = {
  id: 'locksmith', name: 'Locksmith', act: 3, kind: 'normal', start: { strength: 1 }, hp: [92, 100],
  pattern: ['tumbler', 'bolt', 'rake'],
  moves: {
    tumbler: { name: 'Turn the Tumbler', fx: [D(14), { op: 'block', n: 8 }] },
    bolt: { name: 'Shoot the Bolt', fx: [D(26)] },
    rake: { name: 'Rake the Pins', fx: [D(11, { hits: 2 }), ST('weak', 1)] },
  },
  on: {
    combatStart(A, e) {
      e.data.seal = biggestSchool(A.c.run);
      const i = SCHOOL_ORDER.indexOf(e.data.seal);
      if (i >= 0) A.setStatus(e, 'sealed', i + 1);
      fray(A, e);
    },
    afterMove(A, e) { fray(A, e); },
    seamCut(A, e, p) { if (p && p.school && p.school === e.data.seal) A.block(e, 4); },
  },
  art: { body: 'torch', color: '#9aa0a8', notes: 'narrow keyhole-shaped figure with a heavy iron key for one arm; a ring of keys hangs at the hip' },
};

export const ENEMIES_NEW3 = [stageManager, understudysShadow, locksmith];
