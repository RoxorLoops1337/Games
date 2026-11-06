import { instWeight } from '../engine/cards.js';
// ACT I: THE WARD. Enemies for act 1: 11 normals, 3 elites, 1 boss, plus summon-only helpers.
// Summon-only helpers carry `summonOnly: true` (kind 'normal' so the content gate accepts them): the run owner must skip them when drawing encounters.
// Enemy ops default to hitting the player; use to:'self'|'allies' for buffs. Every enemy has art:{ body, color, notes }.
const dmg = (n, extra = {}) => ({ op: 'dmg', n, ...extra });
const blk = (n) => ({ op: 'block', n, to: 'self' });
const debuff = (s, n) => ({ op: 'status', s, n, to: 'player' });
const buff = (s, n) => ({ op: 'status', s, n, to: 'self' });
const paperwork = (n) => ({ op: 'addCard', card: 'j_paperwork', n, to: 'discard' });

// ---- Bedpan Slime: splits when hit past half HP or on death (no overkill trick, AoE and burst get punished) ----
function split(A, e) {
  if (e.data.split) return;
  e.data.split = true;
  A.summon('slime_bit', 2);
}

// ---- Stitch Rat: temporary graft theft ----
// Steal: pick a random card INSTANCE (not a temp card) that has grafts and sits in hand, draw pile or discard.
// Stored as e.data.stolen = [{ inst, grafts: <the original array> }] and inst.grafts is set to [] (a fresh empty array)
// so the card plays bare this combat. On the Rat's death every entry is restored: inst.grafts = entry.grafts.
// Max 2 steals per rat. The Rat is never a minion, so combat cannot end with it alive and the grafts always return.
function stealGraft(A, ctx) {
  const e = ctx.srcEnt, c = A.c;
  e.data.stolen = e.data.stolen || [];
  if (e.data.stolen.length >= 2) return;
  const pool = [...c.hand, ...c.drawPile, ...c.discard].filter((k) => !k.temp && k.inst.grafts.length > 0);
  if (!pool.length) return;
  const k = A.rng.pick(pool);
  e.data.stolen.push({ inst: k.inst, grafts: k.inst.grafts });
  k.inst.grafts = [];
  A.setStatus(e, 'sutured', e.data.stolen.length);
  A.ev({ t: 'steal', e: e.uid, card: k.uid });
}
function returnGrafts(A, e) {
  for (const s of e.data.stolen || []) s.inst.grafts = s.grafts;
  e.data.stolen = [];
}

// ---- Leech Jar: drain block ----
function drainBlock(A, ctx) {
  const e = ctx.srcEnt, p = A.player;
  const n = Math.min(p.block, 10);
  if (n <= 0) return;
  p.block -= n;
  A.ev({ t: 'block', who: 'player', n: -n });
  A.heal(e, n);
}

// ---- The Matron: scar = jam the highest-weight grafted card ----
// During the enemy phase the player's hand is already discarded (which would clear any jam), so we jam from the
// hand if it is somehow non-empty, otherwise one of the cards on top of the draw pile (the next hand).
function scarOne(A) {
  const c = A.c;
  let pool = c.hand.filter((k) => !k.jam);
  if (!pool.length) pool = c.drawPile.slice(-c.handSize).filter((k) => !k.jam);
  if (!pool.length) return;
  // The Matron goes for your best stitching: the highest-weight grafted card in the next hand (ties at random).
  const w = (k) => instWeight(k.inst);
  const top = Math.max(...pool.map(w));
  const best = top > 0 ? pool.filter((k) => w(k) === top) : pool;
  const k = A.rng.pick(best);
  k.jam = true;
  A.ev({ t: 'jam', card: k.uid });
}
const scar = { op: 'custom', fn: (A) => scarOne(A), text: 'Jams your highest-weight grafted card (+1 cost) in your next hand.', intent: 'debuff' };

const MATRON_P1 = ['scar', 'rap', 'smother'];

export const ENEMIES_1 = [
  // ================= NORMALS =================
  { id: 'bedpan_slime', name: 'Bedpan Slime', act: 1, kind: 'normal', start: { strength: 1 }, hp: [38, 42],
    pattern: ['slap', 'slap', 'goo'],
    moves: { slap: { name: 'Slap', fx: [dmg(8)] }, goo: { name: 'Goo', fx: [debuff('weak', 1), debuff('poison', 1), blk(6)] } },
    on: { damaged: (A, e) => { if (e.hp > 0 && e.hp <= e.maxHp / 2) split(A, e); }, death: (A, e) => split(A, e) },
    art: { body: 'dome', color: '#8fbf6a', notes: 'Wide green half dome with a flat base and two dot eyes. Splits into two small domes at half HP or on death.' } },
  { id: 'slime_bit', name: 'Slime Bit', act: 1, kind: 'normal', summonOnly: true, hp: [10, 14],
    pattern: ['nip', 'nip', 'dribble'],
    moves: { nip: { name: 'Nip', fx: [dmg(4)] }, dribble: { name: 'Dribble', fx: [blk(4), dmg(2)] } },
    art: { body: 'dome', color: '#a8d27f', scale: 0.55, notes: 'Small pale green dome, half the size of the parent.' } },

  { id: 'orderly', name: 'Orderly', act: 1, kind: 'normal', start: { strength: 1 }, hp: [40, 44],
    pattern: ['clipboard', 'stamp', 'stamp'],
    moves: { clipboard: { name: 'Clipboard', fx: [paperwork(2), blk(5)] }, stamp: { name: 'Stamp (+4 if 3+ junk)', note: 'Hits for 15 instead of 11 while you hold 3 or more junk cards in your deck.', fx: [dmg({ base: 3, per: 'junk', mul: 4, min: 11, max: 15 })] } },
    art: { body: 'tall', color: '#9fb8c9', notes: 'Tall narrow rect in scrubs, small round head, a rect clipboard held in one polyline arm.' } },

  { id: 'leech_jar', name: 'Leech Jar', act: 1, kind: 'normal', start: { strength: 1 }, hp: [40, 44],
    pattern: ['siphon', 'pulse', 'siphon'],
    moves: {
      siphon: { name: 'Siphon', fx: [{ op: 'custom', fn: drainBlock, text: 'Drains up to 10 of your Block and heals by that much.', intent: 'debuff' }, dmg(6)] },
      pulse: { name: 'Pulse', fx: [dmg(9)] },
    },
    art: { body: 'cylinder', color: '#7fc4b0', notes: 'Glass cylinder with a metal lid and base, a fat red-brown leech curled inside as a wavy polyline.' } },

  { id: 'crutchling', name: 'Crutchling', act: 1, kind: 'normal', hp: [38, 42], start: { strength: 1, dodge: 1 },
    pattern: ['jab', 'skitter', 'jab'],
    moves: { jab: { name: 'Jab', fx: [dmg(9)] }, skitter: { name: 'Skitter', fx: [blk(6), dmg(5)] } },
    on: {
      // Dodge: the first CARD hit each turn is avoided entirely. Status damage and Thorns are not cards, so they land.
      modDamage: (A, e, n, o) => { if (o && o.card && e.st.dodge > 0) { A.setStatus(e, 'dodge', 0); return 0; } return n; },
      turnStart: (A, e) => { A.setStatus(e, 'dodge', 1); },
    },
    art: { body: 'stilts', color: '#c9b48a', notes: 'Triangle torso balanced on two long thin polyline crutch legs, ending in small round feet. Leans forward.' } },

  { id: 'fever_moth', name: 'Fever Moth', act: 1, kind: 'normal', start: { strength: 1 }, hp: [38, 40],
    pattern: ['flutter', 'flutter', 'dive'],
    moves: { flutter: { name: 'Flutter', fx: [dmg(5), debuff('burn', 2)] }, dive: { name: 'Dive', fx: [dmg(10), debuff('brittle', 1)] } },
    art: { body: 'wings', color: '#e8a24a', notes: 'Small oval body, two large oval wings with glowing orange spots, short feeler polylines. Hovers.' } },

  { id: 'gauze_mummy', name: 'Gauze Mummy', act: 1, kind: 'normal', hp: [40, 44], start: { strength: 1, plated: 3 },
    pattern: ['lash', 'wrap', 'lash'],
    moves: { lash: { name: 'Lash', fx: [dmg(9)] }, wrap: { name: 'Rewrap', fx: [blk(15), dmg(4)] } },
    art: { body: 'striped', color: '#e8e0cc', notes: 'Upright rect with horizontal off-white stripes of bandage, loose trailing strips as polylines, two dark eye dots.' } },

  { id: 'pill_swarm', name: 'Pill Swarm', act: 1, kind: 'normal', start: { strength: 2 }, hp: [38, 42],
    pattern: ['rattle', 'rattle', 'overdose'],
    moves: {
      rattle: { name: 'Rattle', fx: [dmg(1, { hits: { base: 5, per: 'turn', mul: 0.34, max: 10 } })] },
      overdose: { name: 'Overdose', fx: [buff('strength', 1), blk(6)] },
    },
    art: { body: 'capsules', color: '#d96a8a', count: 5, notes: 'Five two-tone capsule shapes (rounded rects) orbiting each other in a loose cluster, tiny dot eyes on each.' } },

  { id: 'iron_lung', name: 'Iron Lung', act: 1, kind: 'normal', start: { strength: 1 }, hp: [40, 44],
    pattern: ['wheeze', 'inhale', 'blow'],
    moves: {
      wheeze: { name: 'Wheeze', fx: [dmg(8)] },
      inhale: { name: 'Inhale', fx: [blk(8), dmg(3), buff('charging', 1)] },
      blow: { name: 'Blow (+2 per Charging)', note: '12 damage, +2 for each turn of Charging it has held.', fx: [dmg({ base: 12, per: 'st:charging@self', mul: 2 }), debuff('frail', 1)] },
    },
    on: { afterMove: (A, e, m) => { if (m === 'blow') A.setStatus(e, 'charging', 0); } },
    art: { body: 'bellows', color: '#8da0a8', notes: 'Large circle with ribbed ring lines like a bellows, a hose polyline looping out, expands and contracts when charging.' } },

  { id: 'stitch_rat', name: 'Stitch Rat', act: 1, kind: 'normal', start: { strength: 1 }, hp: [36, 40],
    opening: ['snip'], pattern: ['bite', 'bite', 'snip'],
    moves: {
      snip: { name: 'Snip', fx: [dmg(5), debuff('unpicked', 1), { op: 'custom', fn: stealGraft, text: 'Steals the grafts of one card until it dies.', intent: 'debuff' }] },
      bite: { name: 'Bite', fx: [dmg(9)] },
    },
    on: { death: returnGrafts },
    art: { body: 'tail', color: '#b08a8a', notes: 'Low oval rat body with pointed snout, ears as small triangles, a long suture-thread tail as a zigzag polyline with X stitches.' } },

  { id: 'night_nurse', name: 'Night Nurse', act: 1, kind: 'normal', start: { strength: 2 }, hp: [38, 42],
    pattern: ['checkup', 'injection', 'tuck'],
    moves: {
      checkup: { name: 'Checkup', fx: [dmg(8), blk(4)] },
      injection: { name: 'Injection', fx: [dmg(10), debuff('poison', 2)] },
      tuck: { name: 'Tuck In', hidden: true, fx: [{ op: 'heal', n: 8 }, blk(6)] },
    },
    art: { body: 'lamp', color: '#3a4a5a', glow: '#f2e6a0', notes: 'Dark slim robe silhouette with a round lamp for a head, a pale glowing circle, thin polyline arm holding a syringe rect.' } },

  { id: 'candy_striper', name: 'Candy Striper', act: 1, kind: 'normal', start: { strength: 2 }, hp: [38, 42],
    pattern: ['treat', 'pinwheel', 'pinwheel'],
    moves: {
      treat: { name: 'Free Treat', fx: [dmg(4), debuff('weak', 2), debuff('frail', 2)] },
      pinwheel: { name: 'Pinwheel', fx: [dmg(9)] },
    },
    art: { body: 'figure', color: '#e86a7a', stripes: true, notes: 'Cheerful figure with a red and white striped pinafore (alternating rects), round smiling head, a swirl candy circle in one hand.' } },
  { id: 'candy_volunteer', name: 'Candy Volunteer', act: 1, kind: 'normal', summonOnly: true, minion: true, hp: [16, 20],
    pattern: ['treat', 'pinwheel'],
    moves: {
      treat: { name: 'Free Treat', fx: [dmg(3), debuff('weak', 1), debuff('frail', 1)] },
      pinwheel: { name: 'Pinwheel', fx: [dmg(6)] },
    },
    art: { body: 'figure', color: '#f08a98', stripes: true, scale: 0.75, notes: 'Smaller Candy Striper figure, same stripes, a paler tone.' } },

  // ================= ELITES =================
  { id: 'the_resident', name: 'The Resident', act: 1, kind: 'elite', start: { strength: 1 }, hp: [70, 74],
    pattern: ['examine', 'chart', 'mimic'],
    moves: {
      examine: { name: 'Examine', fx: [dmg(10), blk(6)] },
      chart: { name: 'Chart', fx: [dmg(8), paperwork(1)] },
      // Mimic hits for the Recall status: your last card that dealt 8 or more (10 to 22), plus 4 for each card you played past your 4th
      // on the turn before it swings (max +12). Recall is kept equal to that total so the intent number is always true.
      mimic: { name: 'Mimic (+4 per card past 4)', note: 'Copies your last big hit (10 to 22), +4 for every card you play past your 4th in a turn (max +12).', fx: [dmg({ base: 0, per: 'st:recall@self', min: 10, max: 26 })] },
    },
    on: {
      playerCard: (A, e, { card }) => {
        if (card && card.dealt >= 8) e.data.big = Math.min(22, card.dealt);
        const bonus = Math.min(12, 4 * Math.max(0, A.c.playsTurn - 4));
        A.setStatus(e, 'recall', Math.max(e.data.big || 0, bonus ? 10 : 0) + bonus);
      },
      afterMove: (A, e, m) => { if (m === 'mimic') e.data.big = 0; A.setStatus(e, 'recall', e.data.big || 0); },
    },
    art: { body: 'tall', color: '#6d8fb0', glasses: true, notes: 'Tall narrow figure in a white coat with a stethoscope polyline, round head with rect glasses, mouth mirrors the player silhouette in the hand.' } },

  { id: 'two_gurneys', name: 'Gurney, Head', act: 1, kind: 'elite', start: { strength: 1 }, hp: [38, 38],
    pattern: ['ram', 'brace'],
    moves: {
      ram: { name: 'Ram', fx: [dmg(9)] },
      brace: { name: 'Brace', fx: [dmg(4), { op: 'block', n: 7, to: 'allies' }] },
    },
    on: { combatStart: (A, e) => { if (!e.data.paired) { e.data.paired = true; A.summon('gurney_foot', 1, { silent: true }); } } },
    art: { body: 'box', color: '#b8c4c8', wheels: 4, notes: 'Long low rect gurney on four circle wheels with a raised head end, a sheet-covered lump on top. Pair stands side by side. This is the Head end.' } },
  { id: 'gurney_foot', name: 'Gurney, Foot', act: 1, kind: 'elite', summonOnly: true, hp: [34, 34],
    pattern: ['roll', 'rattle'],
    moves: { roll: { name: 'Roll (5 Block to Head)', note: 'Also gives the Head 5 Block.', fx: [dmg(7), { op: 'block', n: 5, to: 'allies' }] }, rattle: { name: 'Rattle', fx: [dmg(3, { hits: 2 })] } },
    // Kill the Head first. If the Foot dies first, the Head enrages (+4 Strength, +1 Ritual).
    on: { death: (A) => { const head = A.alive().find((x) => x.id === 'two_gurneys'); if (head) { A.status(head, 'strength', 4); A.status(head, 'ritual', 1); } } },
    art: { body: 'box', color: '#a4b0b4', wheels: 4, notes: 'Matching gurney with the lump facing the other way, one wheel squeaking, slightly dented. The Foot end.' } },

  { id: 'defibrillator', name: 'Defibrillator', act: 1, kind: 'elite', hp: [70, 74], start: { strength: 1, countdown: 4 },
    pick: (A, e) => ((e.st.countdown || 0) <= 1 ? 'discharge' : (e.turn % 2 === 0 ? 'paddle' : 'shock')),
    moves: {
      paddle: { name: 'Paddle', fx: [dmg(11), blk(8)] },
      shock: { name: 'Shock', fx: [dmg(7, { hits: 2 })] },
      discharge: { name: 'Clear (-3 per 8 dealt)', note: '27 damage, 3 less for every 8 damage you dealt to it since its last Clear (min 14).', fx: [dmg({ base: 27, per: 'st:grounded@self', mul: -3, min: 14 })] },
    },
    // Countdown drops by 1 after every move; at 1 it discharges, then resets to 4 and gains 2 Strength. Stun delays it.
    on: {
      afterMove: (A, e, m) => {
        if (m === 'discharge') { A.setStatus(e, 'countdown', 4); A.status(e, 'strength', 2); e.data.dealt = 0; A.setStatus(e, 'grounded', 0); }
        else A.status(e, 'countdown', -1);
      },
      // Damage taken while the Countdown shows is bled off: each 8 shaves 3 from the next Clear (shown on the Grounded status).
      damaged: (A, e, n, o) => { if (!o || !o.hit) return; e.data.dealt = (e.data.dealt || 0) + n; A.setStatus(e, 'grounded', Math.min(6, Math.floor(e.data.dealt / 8))); },
    },
    art: { body: 'box', color: '#d8d070', notes: 'Wheeled cart box with a screen rect showing a flat polyline pulse, two round paddles on coiled cable polylines. Screen brightens as the countdown falls.' } },

  // ================= BOSS =================
  { id: 'the_matron', name: 'The Matron', act: 1, kind: 'boss', start: { strength: 1 }, hp: 80,
    pick: (A, e) => {
      const t = e.data.t || 0;
      if (e.data.phase === 2) return e.data.rang ? ['scar', 'rap', 'smother'][t % 3] : 'ring';
      return MATRON_P1[t % 3];
    },
    moves: {
      scar: { name: 'Scar', fx: [dmg(11), scar, paperwork(1)] },
      rap: { name: 'Rap', fx: [dmg(15), scar] },
      smother: { name: 'Smother', fx: [dmg(9), blk(14), scar, paperwork(1)] },
      ring: { name: 'The Bell Tolls', note: 'Summons two volunteers and Rejection: your card prices trigger twice next turn.', fx: [buff('ritual', 1), debuff('rejection', 1), { op: 'summon', id: 'candy_volunteer', n: 2 }] },
    },
    on: {
      // Phase 2 at half HP: her queued move is swapped for Ring immediately so the player sees it coming.
      damaged: (A, e) => {
        if (e.data.phase !== 2 && e.hp > 0 && e.hp <= e.maxHp / 2) { e.data.phase = 2; e.move = 'ring'; A.ev({ t: 'intent', e: e.uid, move: 'ring' }); }
      },
      afterMove: (A, e, m) => { if (m === 'ring') e.data.rang = true; e.data.t = (e.data.t || 0) + (m === 'ring' ? 0 : 1); },
    },
    art: { body: 'bell', color: '#c9b9a0', crown: 'candles', candles: 5, notes: 'Giant bell-shaped dome silhouette with a flared hem, a wide dark mouth slit, a crown of five tall candle rects with flame ovals on top. Phase 2 the flames flare and the bell swings.' } },
];
