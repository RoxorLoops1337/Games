// Hocus Vocus: the 12 Guests (DATA.guests), the guest artists the Guest cards bring on stage (DESIGN 4.3 "Guests").
//
// One IIFE that registers into DATA.guests with DATA.add('guests', {...}) (no top-level names). Data only: every number is an op
// field and the card text is generated from it by DATA.cardHtml ("Guest DJ Scratchy for 3 turns: at the end of your turn, deal 4
// damage to a random enemy."). Nothing here uses a function, a clock or randomness. Tests: tests/hocus_vocus_guests.test.mjs.
//
// A GUEST (the shape DATA.validate checks)
//   { id: 'guest_dj_scratchy', name, hero,     // the hero whose Guest card calls it (3 per hero, QUOTA.cards.guests)
//     stay: 3,                                 // player turns on stage, 1..6; counts down after each act
//     act: [hook ops],                         // runs at the end of each of the owner's turns (actor: the owner hero; `enemy` = a random living enemy)
//     enter?: [hook ops], exit?: [hook ops],   // when it steps on stage / leaves because its stay ran out or a third guest replaced it
//     hooks?: [{on, fx, filter?, limit?}],     // combat hooks that live while it is on stage (owned by the owner hero; no once, no every)
//     up?: { stay?, act?, enter?, exit?, hooks? },   // the upgraded guest (an upgraded Guest card calls it); each field REPLACES the base one
//     art: { m, c }, blurb }                   // motif and palette from DATA.LISTS, and one funny line for the stand
//
// ENGINE FACTS THE NUMBERS LEAN ON (combat.js "Guests")
//   * A guest's ops run as HOOK ops with the owner as the acting hero and no attacker: no spot damage bonus, no Volume, no Muffled, no
//     Feedback back; Block gets Soundproof and Wobbly only. So every number here is the number the player reads.
//   * `enemy` in a guest op is a random living enemy (rolled per op); `lowest` is the enemy with the lowest HP; `all` is everyone.
//   * A guest is silent while its owner is voiceless (no act, still counts down). The end of the turn runs the guests after the
//     Reprise replays and the turnEnd hooks and BEFORE the hand is discarded, so an end-of-turn draw would be thrown away: guests
//     that want cards or Breath use a turnStart hook instead, and no guest gives more than 1 Breath per turn (a Headliner trade).
//   * A `guests` counter (per:'guests') and cond (guests:{gte,lte}) count the guests on stage; a guest counts itself in its own act.
//
// THE TWELVE (two uncommon Guest cards and one rare per hero; the card files hold the cards, ids <hero>_guest_*)
//   Jasmin (bloom, petals, singing)   Backing Choir (Block for both), Harp Grandma (healing, a parting gift of Block), Hype Parrot (Bloom, random strikes)
//   RoxorLoops (sumi ink, beats)      DJ Scratchy (random strikes), Loop Pedal Bot (Block and Groove), Metro Gnome (a Breath a turn, a beat on everyone)
//   RawClaw (ward, mixing)            Sound Tech (Block for the lead), Cable Gremlin (trips the smallest enemy), Reverb Ghost (Reverb, damage to all)
//   Andy (charge, bass, thorns)       Flight Case Roadie (Block for the lead), Rolling Bass Amp (Rumble, random strikes), Mosh Pit Uncle (damage per guest)
(() => {
  const dmg = (n, tgt) => Object.assign({ op: 'dmg', n }, tgt ? { tgt } : null);
  const block = (n, tgt) => ({ op: 'block', n, tgt: tgt || 'self' });
  const status = (s, n, tgt) => Object.assign({ op: 'status', s, n }, tgt ? { tgt } : null);

  const guests = {
    // ------------------------------------------------------------------ Jasmin (hanae)
    guest_backing_choir: {
      name: 'Backing Choir', hero: 'hanae', stay: 3,
      act: [block(2, 'both')],
      up: { act: [block(3, 'both')] },
      art: { m: 'heal_light', c: 'rose' },
      blurb: 'Four singers, one breath, and they all know the words better than you do.',
    },
    guest_harp_grandma: {
      name: 'Harp Grandma', hero: 'hanae', stay: 2,
      act: [{ op: 'heal', n: 2, tgt: 'both' }],
      exit: [block(3, 'both')],
      up: { act: [{ op: 'heal', n: 3, tgt: 'both' }] },
      art: { m: 'book', c: 'gold' },
      blurb: 'She brought the harp, a thermos and a cardigan for everyone. Nobody argues with Grandma.',
    },
    guest_hype_parrot: {
      name: 'Hype Parrot', hero: 'hanae', stay: 2,
      enter: [status('bloom', 2, 'self')],
      act: [dmg(4, 'enemy')],
      up: { stay: 3 },
      art: { m: 'spirit_orb', c: 'amber' },
      blurb: 'It learned every chorus in one listen and screams them at whoever is closest.',
    },

    // ------------------------------------------------------------------ RoxorLoops (kuro)
    guest_dj_scratchy: {
      name: 'DJ Scratchy', hero: 'kuro', stay: 3,
      act: [dmg(4, 'enemy')],
      up: { act: [dmg(6, 'enemy')] },
      art: { m: 'star', c: 'teal' },
      blurb: 'Two turntables and no manners. The scratch lands on whoever looked at him funny.',
    },
    guest_loop_bot: {
      name: 'Loop Pedal Bot', hero: 'kuro', stay: 3,
      act: [block(3, 'self'), status('sumi', 1, 'self')],
      up: { act: [block(5, 'self'), status('sumi', 1, 'self')] },
      art: { m: 'key', c: 'jade' },
      blurb: 'A little robot that records four bars and plays them back forever, politely.',
    },
    guest_drum_machine: {
      name: 'Metro Gnome', hero: 'kuro', stay: 2,
      act: [dmg(2, 'all')],
      hooks: [{ on: 'turnStart', fx: [{ op: 'energy', n: 1 }] }],
      up: { stay: 3 },
      art: { m: 'fist', c: 'indigo' },
      blurb: 'A tiny gnome with a metronome and no mercy. Tick, tick, tick. Everybody keeps up anyway.',
    },

    // ------------------------------------------------------------------ RawClaw (suzu)
    guest_sound_tech: {
      name: 'Sound Tech', hero: 'suzu', stay: 3,
      act: [block(4, 'front')],
      up: { act: [block(6, 'front')] },
      art: { m: 'book', c: 'violet' },
      blurb: 'Black t-shirt, gaffer tape, a torch in her teeth. The lead has never sounded safer.',
    },
    guest_cable_gremlin: {
      name: 'Cable Gremlin', hero: 'suzu', stay: 3,
      act: [dmg(3, 'lowest')],
      up: { act: [dmg(4, 'lowest')] },
      art: { m: 'skull', c: 'jade' },
      blurb: 'Lives behind the desk, eats adaptors, trips the smallest thing on stage every night.',
    },
    guest_reverb_ghost: {
      name: 'Reverb Ghost', hero: 'suzu', stay: 3,
      enter: [status('ward', 1, 'self')],
      act: [dmg(3, 'all')],
      up: { act: [dmg(4, 'all')] },
      art: { m: 'void', c: 'moon' },
      blurb: 'It haunts the long tail of every note. Very spooky, very wet, very on time.',
    },

    // ------------------------------------------------------------------ Andy (raiga)
    guest_roadie: {
      name: 'Flight Case Roadie', hero: 'raiga', stay: 3,
      act: [block(4, 'front')],
      up: { act: [block(6, 'front')] },
      art: { m: 'key', c: 'ash' },
      blurb: 'Pushes a flight case the size of a van in front of whoever is in the lead. Asks no questions.',
    },
    guest_bass_amp: {
      name: 'Rolling Bass Amp', hero: 'raiga', stay: 2,
      enter: [status('charge', 2, 'self')],
      act: [dmg(5, 'enemy')],
      up: { act: [dmg(7, 'enemy')] },
      art: { m: 'sigil', c: 'amber' },
      blurb: 'An amp on four wheels and no brakes. You feel it in your fillings before you hear it.',
    },
    guest_mosh_uncle: {
      name: 'Mosh Pit Uncle', hero: 'raiga', stay: 2,
      act: [dmg({ per: 'guests', mul: 2 }, 'all')],   // "2 damage to all enemies for each guest on stage": he counts himself, so 2 at least
      up: { stay: 3 },
      art: { m: 'star', c: 'gold' },
      blurb: 'Nobody invited him and nobody can stop him. The more people on stage, the harder he bounces.',
    },
  };

  DATA.add('guests', guests);
})();
