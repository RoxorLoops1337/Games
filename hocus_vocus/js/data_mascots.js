// Hocus Vocus: data_mascots.js: the 6 Mascots, the strays the tour bus can adopt (DESIGN 4.7 "The Mascot").
//
// One IIFE that registers into DATA.mascots with DATA.add('mascots', defs). Data only: no functions, no clock, no randomness,
// no em or en dashes. Validated by DATA.validate('mascots') and DATA.audit('mascots'); tests/hocus_vocus_mascot.test.mjs.
//
// SHAPE  { id, name, blurb, art: {m: motif, c: palette}, levels: {1: {text, mods?, hooks?, rows?}, 2: {...}, 3: {...}} }
//   A run adopts ONE mascot (the Detour `stray_at_the_bus_stop`); it starts at level 1 and grows with XP: level 2 at 5 XP, level 3 at
//   12 XP (ECONOMY.mascotXp). XP: +1 per fight won, +2 for a rival, +3 for a headliner (ECONOMY.mascotFightXp), +2 for a Snack at the
//   Merch Stall (ECONOMY.snackXp, ECONOMY.price.snack gold, one per stall). Levels STACK: at level 3 all three bonuses are in force.
//   Each level is a virtual Charm built only from existing mod keys, row fields, hook triggers and hook ops (no new engine ops), folded
//   exactly like a Charm set tier (DATA.modsFor, DATA.rowFor, COMBAT hooks with src 'mascot', RUN.hook for the run hooks).
//   `text` is one sentence of at most 90 characters and carries every number, status and trigger of its data (the mascot test checks
//   it like a Charm text). `blurb` is the one joke line (printable ASCII, at most 80 characters, ends with . ! or ?), display only.
//   Breath and hand size stay Headliner trades: no level touches them.
//
// THE SIX, BY ANGLE (level 1 small, level 3 worth the walk)
//   mascot_pug      Beatbox Pug        damage: heal on a kill, lead spot damage, Volume at the start of a fight
//   mascot_cat      Loop Pedal Cat     cards: a draw every 4th turn, Block when a card Fades, Block on the first Skill
//   mascot_hamster  Tour Bus Hamster   the road: heal and gold on a Green Room rest, Vox and gold at each act
//   mascot_goose    Stage Goose        defence: lead spot Feedback, backing spot Block, a bite back when hit
//   mascot_fox      Merch Fox          money: cheaper stalls, gold on entering one, more fight gold
//   mascot_parrot   Karaoke Parrot     openers: Muffled on all enemies, Volume on a reshuffle, Tag on all enemies
(() => {
  DATA.add('mascots', {
    mascot_pug: {
      name: 'Beatbox Pug', art: { m: 'fist', c: 'amber' },
      blurb: 'Snores in 4/4. Drops a beat every time it drops a toy. Never gives it back.',
      levels: {
        1: { text: 'Whenever you defeat an enemy, that hero heals 2 HP.', hooks: [{ on: 'onKill', fx: [{ op: 'heal', n: 2, tgt: 'self' }] }] },
        2: { text: 'The lead hero deals 1 more damage.', rows: { front: { dmgAdd: 1 } } },
        3: { text: 'At the start of each fight, the lead hero gains 2 Volume.', hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'front' }] }] },
      },
    },
    mascot_cat: {
      name: 'Loop Pedal Cat', art: { m: 'moon', c: 'indigo' },
      blurb: 'Sits on the loop pedal. Every song now has a second verse. The cat is not sorry.',
      levels: {
        1: { text: 'At the start of every 4th turn, draw 1 card.', hooks: [{ on: 'turnStart', every: 4, fx: [{ op: 'draw', n: 1 }] }] },
        2: { text: 'Whenever a card Fades, that hero gains 1 Block (up to twice a turn).', hooks: [{ on: 'onExhaust', limit: 2, fx: [{ op: 'block', n: 1, tgt: 'self' }] }] },
        3: { text: 'The first Skill you play each turn gives that hero 2 Block.', hooks: [{ on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'block', n: 2, tgt: 'self' }] }] },
      },
    },
    mascot_hamster: {
      name: 'Tour Bus Hamster', art: { m: 'coin', c: 'gold' },
      blurb: 'Runs the wheel that runs the bus. Nobody checked this. Please do not check this.',
      levels: {
        1: { text: 'After each Green Room rest, both heroes heal 3 HP.', hooks: [{ on: 'onRest', fx: [{ op: 'heal', n: 3, who: 'both' }] }] },
        2: { text: 'After each Green Room rest, find 15 gold in the seat cushions.', hooks: [{ on: 'onRest', fx: [{ op: 'gold', n: 15 }] }] },
        3: { text: 'At the start of each act, gain 2 Vox and 20 gold.', hooks: [{ on: 'onChapterStart', fx: [{ op: 'ink', n: 2 }, { op: 'gold', n: 20 }] }] },
      },
    },
    mascot_goose: {
      name: 'Stage Goose', art: { m: 'crane', c: 'moon' },
      blurb: 'Security. Has never been asked to be security. Honks at the Gloss on principle.',
      levels: {
        1: { text: 'The lead hero carries 1 Feedback.', rows: { front: { thorns: 1 } } },
        2: { text: 'The backing hero gains 2 Block at the start of each turn.', rows: { back: { startBlock: 2 } } },
        3: { text: 'Once per turn, when a hero is hit, the attacker takes 3 damage.', hooks: [{ on: 'onDamaged', limit: 1, fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }] }] },
      },
    },
    mascot_fox: {
      name: 'Merch Fox', art: { m: 'fox', c: 'crimson' },
      blurb: 'Haggles with Jordan in squeaks. Wins. Leaves with a tee it cannot wear.',
      levels: {
        1: { text: 'All merch stall prices are 10% lower.', mods: { priceMul: -0.1 } },
        2: { text: 'Whenever you enter a merch stall, gain 15 gold.', hooks: [{ on: 'onShopEnter', fx: [{ op: 'gold', n: 15 }] }] },
        3: { text: 'Combat and gift box gold is 20% higher.', mods: { goldMul: 0.2 } },
      },
    },
    mascot_parrot: {
      name: 'Karaoke Parrot', art: { m: 'bell', c: 'jade' },
      blurb: 'Knows every chorus and none of the verses. Sings them anyway, at the enemy.',
      levels: {
        1: { text: 'At the start of each fight, all enemies are Muffled for 1 turn.', hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'all' }] }] },
        2: { text: 'Whenever you reshuffle, both heroes gain 1 Volume.', hooks: [{ on: 'onShuffle', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'both' }] }] },
        3: { text: 'At the start of each fight, all enemies get 1 Tag.', hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'mark', n: 1, tgt: 'all' }] }] },
      },
    },
  });
})();
