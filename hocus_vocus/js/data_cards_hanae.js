// Hocus Vocus: Jasmin (id `hanae`), The Blossom Voice: her complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Card ids keep their old internal names (hanae_slash and so on): only `name` and `flavor` speak Hocus Vocus (bible 4, HV_HEROES 2.1).
// Tokens: none. No card here uses the `add` op, so none is defined.
//
// THE FANTASY. A soft, smooth singer who stands in the lead (+2 damage on EVERY hit, DATA.heroes.hanae.rows) and leaves petals
// hanging in the air after every note. She never belts and never shouts: her power is many small, precise sung notes (runs, trills,
// arpeggios). Her resource is Bloom: the passive Every Note Blooms (id `blade_flow`) grants 1 Bloom for the first Attack each turn,
// and her cards build it faster and spend it harder. Because the lead bonus and Volume both apply per hit, the number of hits is her
// real multiplier. Three archetypes, each with an engine and a finisher, and cards that bridge two of them:
//
//   BLOSSOM      bank Bloom with cheap tricks, cash it in with `consume: 'bloom'`.
//     builders  Take the Lead, Little Trill, Sweet Thirds (lead), Oohs and Aahs (backing), Petal Curtain, Run It Again, Bud by Bud
//     sinks     Blossom Pop, Blossom Blanket, Blossom Breath, The High Note (one big flat blow), Blossom Blizzard (every enemy, X cost)
//     or hold it: Cherry Lane shields her at once and turns banked Bloom into a slow bleed on every enemy (its upgrade raises the cap).
//   RUNS         many small hits, Volume, Tag. The lead bonus, Volume and Tag all land on each hit.
//     enablers  Lean In, Find Your Voice, Corsage (Tag pays +3 per hit, for either hero), Slow Swell (Crescendo), Little Trill
//     payoffs   Climbing Scale (a hit per card played, so play it late), Arabic Impro (X), Petal Twirl, Melisma (nine hits)
//     Feedback and Sequins punish many small hits: a flat finisher such as The High Note is the answer to those enemies.
//   ANSWER BACK  Block and Shimmy turned into damage, and punishment for being hit.
//     engines   Soft Shield, Gentle Sway (Shimmy), Sing It Back (hits for its own Block), Bend the Note (damage back when hit), Answer Phrase
//     payoffs   Slippery Riff (damage per Shimmy), Mirror Ball (all Block becomes damage to every enemy)
//
// TWO SPOTS. The backing spot is where Jasmin charges (Oohs and Aahs, Curtsy and Go, +1 Block on her cards), the lead spot is where
// she sings out. Take the Lead and Centre Stage step forward, Curtsy and Go steps back out, and Stage Waltz pays for every swap. The `swap`
// op does not use the free swap, so a free swap out, Oohs and Aahs in the backing spot and Take the Lead forward again costs 1 Breath.
//
// THE PARTNER. Nobody knows who stands beside Jasmin, so every ally effect works with anyone: Block gifts (Petal Curtain, Blossom
// Blanket, Curtsy and Go), a Block mirror (Sing Along reads the ally's Block), Calling of the Moon (Volume for both heroes, and a card),
// and Shimmer Trail, which pays for either hero's Attacks through `filter.hero: 'any'`. No card reads or grants a resource only one
// hero owns.
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * Every Note Blooms (the hero passive) fires AFTER the card resolves, so a Bloom finisher never counts its own Bloom.
//  * Hook damage has no attacker: no Volume, no lead bonus, no Feedback, and gem damage bonuses never reach it. Shimmer Trail, Bend
//    the Note and Cherry Lane therefore use flat numbers and carry no red slot. `enemy` in an onDamaged hook is the attacker.
//  * Temporary Volume (status id `might`) is the idiom from CONTENT_SPEC 3.1: gain it, then a `once` turnEnd hook takes it back.
//    Temporary Shimmy (status id `dodge`) is the same trick on a `once` turnStart hook, so it survives exactly one enemy phase.
//  * `cardsPlayed` reads the count BEFORE the card being played, so "first card of the turn" is `cardsPlayed lte 0`.
//  * Text honesty (data_text.js): a `hits` value prints only as a plain number, X, or "for each ..." (base and caps are not printed),
//    so Climbing Scale and Blossom Blizzard use hits with no base and no cap, and Melisma uses a plain number.
//
// Numbers are checked by tests/hocus_vocus_cards_hanae.test.mjs (value per Breath bands, documented there).
(() => {
  // small builders keep the card table readable
  const bloom = (n) => ({ op: 'status', s: 'bloom', n, tgt: 'self' });
  const block = (n, tgt, extra) => Object.assign({ op: 'block', n }, tgt ? { tgt } : null, extra);
  const dmg = (n, extra) => Object.assign({ op: 'dmg', n }, extra);
  const hook = (on, fx, extra) => Object.assign({ op: 'hook', on, fx }, extra);
  // "+N Volume this turn" (status id `might`): gain it now, give it back at the end of the turn
  const mightUp = (n, tgt) => ({ op: 'status', s: 'might', n, tgt });
  const takeMightBack = (n, tgt) => hook('turnEnd', [{ op: 'status', s: 'might', n: -n, tgt }], { once: true });
  const mightThisTurn = (n, tgt) => [mightUp(n, tgt), takeMightBack(n, tgt)];
  // "+N Shimmy until your next turn" (status id `dodge`). Shimmy is a permanent stack by nature and a stockpile of it made the Answer
  // Back plan nearly untouchable in simulation (two Gentle Sways halved the damage taken over a fight), so her commons lend it for one
  // enemy phase only.
  const dodge = (n) => ({ op: 'status', s: 'dodge', n, tgt: 'self' });
  const takeDodgeBack = (n) => hook('turnStart', [dodge(-n)], { once: true });
  const perBloom = (mul, extra) => Object.assign({ per: 'status', s: 'bloom', mul }, extra);

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    hanae_slash: {
      name: 'Petal Note', hero: 'hanae', type: 'attack', rarity: 'starter', cost: 1,
      fx: [dmg(6)],
      up: { fx: [dmg(8)] },
      kw: [], slots: ['red'], art: { m: 'slash', c: 'rose', hero: true },
      flavor: 'She sang it softly. The whole street leaned in to listen.',
    },
    hanae_parry: {
      name: 'Soft Shield', hero: 'hanae', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(5)],
      up: { fx: [block(6), bloom(1)] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'azure', hero: true },
      flavor: 'She does not block a hit. She sings right over it.',
    },
    hanae_petal_step: {
      name: 'Take the Lead', hero: 'hanae', type: 'skill', rarity: 'starter', cost: 0,
      // a step FORWARD: from the backing spot it swaps her into the lead, from the lead it never pushes her (and her partner) out of place.
      // The swap comes first so everything after it reads the spot she lands in
      fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, bloom(1), block(3)],
      up: { fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, bloom(2), block(3)] },
      kw: [], slots: ['green'], art: { m: 'petals', c: 'rose' },
      flavor: 'One step forward, and the spotlight finds her by itself.',
    },

    // ------------------------------------------------------------------ commons: attacks
    hanae_petal_flick: {
      name: 'Little Trill', hero: 'hanae', type: 'attack', rarity: 'common', cost: 0,
      fx: [dmg(2), bloom(1)],
      up: { fx: [dmg(4), bloom(1)] },
      kw: [], slots: ['red'], art: { m: 'petals', c: 'amber', hero: true },
    },
    hanae_twin_petals: {
      name: 'Sweet Thirds', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      fx: [dmg(2, { hits: 2 }), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }],
      up: { fx: [dmg(3, { hits: 2 }), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }] },
      kw: [], slots: ['red'], art: { m: 'cross_slash', c: 'rose', hero: true },
    },
    hanae_rising_gale: {
      name: 'Climbing Scale', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // play it late: one hit for every card already played this turn, so it is a dud as the first card and a storm as the fifth
      fx: [dmg(2, { hits: { per: 'cardsPlayed' } })],
      up: { fx: [dmg(3, { hits: { per: 'cardsPlayed' } })] },
      kw: [], slots: ['green'], art: { m: 'wind', c: 'jade' },
      flavor: 'It starts as a whisper. Ask the top note how it ends.',
    },
    hanae_blossom_burst: {
      name: 'Blossom Pop', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      fx: [dmg({ base: 3, per: 'status', s: 'bloom', mul: 3, upTo: 3 }, { consume: { s: 'bloom', upTo: 3 } })],
      up: { fx: [dmg({ base: 5, per: 'status', s: 'bloom', mul: 3, upTo: 4 }, { consume: { s: 'bloom', upTo: 4 } })] },
      kw: [], slots: ['red'], art: { m: 'bloom', c: 'rose', hero: true },
    },
    hanae_riposte: {
      name: 'Sing It Back', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // Block first, then hit for all the Block she is holding: stack Soft Shield first and this becomes a real threat.
      // Blue slot on purpose: a Block gem raises the Block and, through it, the damage
      fx: [block(3), dmg({ per: 'block' })],
      up: { fx: [block(4), dmg({ per: 'block' })] },
      kw: [], slots: ['blue'], art: { m: 'crescent', c: 'crimson', hero: true },
      flavor: 'They sang it wrong. She sang it back, right.',
    },
    hanae_crescent_step: {
      name: 'Centre Stage', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // Take the Lead with a sting: from the backing spot it swaps first, so she sings from the lead with the +2, and either way the lead blooms.
      // (Curtsy and Go is the retreating twin: it sings first and then swaps out)
      fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, dmg(5), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }],
      up: { fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, dmg(7), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }] },
      kw: [], slots: ['green'], art: { m: 'crescent', c: 'moon' },
    },
    hanae_whirling_petals: {
      name: 'Arabic Impro', hero: 'hanae', type: 'attack', rarity: 'common', cost: 'X',
      // random targets: a lone enemy takes every hit, a crowd shares them, and no target needs choosing
      fx: [dmg(4, { hits: { per: 'X' }, tgt: 'random' })],
      up: { fx: [dmg(5, { hits: { per: 'X' }, tgt: 'random' })] },
      kw: [], slots: ['red'], art: { m: 'tornado', c: 'rose' },
      flavor: 'Never the same twice. Not even this time.',
    },

    // ------------------------------------------------------------------ commons: skills
    hanae_folding_screen: {
      name: 'Oohs and Aahs', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(5), { op: 'cond', if: { row: 'back' }, then: [bloom(2)] }],
      up: { fx: [block(7), { op: 'cond', if: { row: 'back' }, then: [bloom(2)] }] },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'amber' },
      flavor: 'Every great song has someone at the back going ooh.',
    },
    hanae_sway: {
      name: 'Gentle Sway', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(4), dodge(1), takeDodgeBack(1)],
      up: { fx: [block(6), dodge(1), takeDodgeBack(1)] },
      kw: [], slots: ['blue'], art: { m: 'crane', c: 'azure', hero: true },
      flavor: 'The scrunchie did not move. It never moves.',
    },
    hanae_petal_veil: {
      name: 'Petal Curtain', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(3, 'both'), bloom(1)],
      up: { fx: [block(5, 'both'), bloom(1)] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'rose' },
      flavor: 'Wide enough for two, and it smells of spring.',
    },
    hanae_sakura_sort: {
      name: 'La La La', hero: 'hanae', type: 'skill', rarity: 'common', cost: 0,
      // a free filter that pays a petal: a pure cycler is a dud card, so it blooms too, and it counts as a card played for Climbing Scale
      fx: [{ op: 'draw', n: 1 }, { op: 'pick', from: 'hand', n: 1, then: 'discard' }, bloom(1)],
      up: { fx: [{ op: 'draw', n: 1 }, { op: 'pick', from: 'hand', n: 1, then: 'discard' }, bloom(2)] },
      kw: [], slots: ['green'], art: { m: 'scroll', c: 'amber' },
    },
    hanae_flurry_stance: {
      name: 'Lean In', hero: 'hanae', type: 'skill', rarity: 'common', cost: 0,
      fx: mightThisTurn(2, 'self'),
      up: { fx: mightThisTurn(3, 'self') },
      kw: [], slots: ['gold'], art: { m: 'eye', c: 'crimson' },
      flavor: 'She did not sing louder. She just leaned in.',
    },
    hanae_petal_mark: {
      name: 'Corsage', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      // Tag is spent one stack per hit by ANY hero's attacks, so it pays best under Runs
      fx: [{ op: 'status', s: 'mark', n: 3, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: [], slots: ['gold'], art: { m: 'sigil', c: 'rose' },
      flavor: 'Jordan already sells a pin of it. Of course he does.',
    },
    hanae_borrowed_shield: {
      name: 'Sing Along', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block({ base: 3, per: 'block', who: 'ally' })],
      up: { fx: [block({ base: 5, per: 'block', who: 'ally' })] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'ash' },
      flavor: 'If you know the words, you are in the band.',
    },

    // ------------------------------------------------------------------ uncommons: attacks
    hanae_cyclone_cut: {
      name: 'Petal Twirl', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 2,
      fx: [dmg(2, { hits: 2, tgt: 'all' })],
      up: { fx: [dmg(2, { hits: 3, tgt: 'all' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'tornado', c: 'violet' },
    },
    hanae_hit_and_vanish: {
      name: 'Curtsy and Go', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 2,
      // sing from where she stands, then step out; if that puts her in the backing spot the partner is now in the lead, so both get Block
      fx: [dmg(6), { op: 'swap' }, { op: 'cond', if: { row: 'back' }, then: [block(3, 'both')] }],
      up: { fx: [dmg(8), { op: 'swap' }, { op: 'cond', if: { row: 'back' }, then: [block(4, 'both')] }] },
      kw: [], slots: ['red', 'blue'], art: { m: 'crescent', c: 'indigo', hero: true },
      flavor: 'By the time they turn round, she is already curtsying.',
    },
    hanae_flowing_counter: {
      name: 'Slippery Riff', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 1,
      // Shimmy is not spent by the riff: every Gentle Sway, Stage Waltz or Calling of the Moon played first makes it bigger
      fx: [dodge(1), dmg({ per: 'status', s: 'dodge', mul: 3 }), takeDodgeBack(1)],
      up: { fx: [dodge(1), dmg({ per: 'status', s: 'dodge', mul: 4 }), takeDodgeBack(1)] },
      kw: [], slots: ['red', 'gold'], art: { m: 'wave', c: 'azure' },
    },
    hanae_iai_draw: {
      name: 'Out of Nowhere', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 0,
      // Hold: keep it until the first card of a turn. Fade: one perfect note per fight
      fx: [{ op: 'cond', if: { cardsPlayed: { lte: 0 } }, then: [dmg(12)], else: [dmg(4)] }],
      up: { fx: [{ op: 'cond', if: { cardsPlayed: { lte: 0 } }, then: [dmg(16)], else: [dmg(4)] }] },
      kw: ['retain', 'exhaust'], slots: ['red'], art: { m: 'iai', c: 'ink', hero: true }, locked: true,
      flavor: 'First note of the night, and the whole room forgets to breathe.',
    },
    hanae_swallow_reversal: {
      name: 'Answer Phrase', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 1,
      // pays for the hits she could not avoid: clunky beside Block, brutal after a bad round
      fx: [dmg({ base: 2, per: 'damageTaken', cap: 15 })],
      up: { fx: [dmg({ base: 4, per: 'damageTaken', cap: 18 })] },
      kw: [], slots: ['red'], art: { m: 'crane', c: 'crimson' }, locked: true,
    },

    // ------------------------------------------------------------------ uncommons: skills
    hanae_full_bloom: {
      name: 'Blossom Blanket', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [block({ per: 'status', s: 'bloom', mul: 2 }, 'both', { consume: 'bloom' })],
      up: { fx: [block({ per: 'status', s: 'bloom', mul: 3 }, 'both', { consume: 'bloom' })] },
      kw: ['retain'], slots: ['blue', 'green'], art: { m: 'bloom', c: 'gold' },
    },
    hanae_bloom_tide: {
      name: 'Blossom Breath', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 0,
      // never a dud card: it always draws one, and with the Bloom banked it pays two Breath for it
      fx: [{ op: 'draw', n: 1 }, { op: 'cond', if: { status: { s: 'bloom', gte: 3 } }, then: [{ op: 'removeStatus', s: 'bloom', n: 3, tgt: 'self' }, { op: 'energy', n: 2 }] }],
      up: { fx: [{ op: 'draw', n: 1 }, { op: 'cond', if: { status: { s: 'bloom', gte: 2 } }, then: [{ op: 'removeStatus', s: 'bloom', n: 2, tgt: 'self' }, { op: 'energy', n: 2 }] }] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'koi', c: 'rose' }, locked: true,
      flavor: 'Cherry blossom, deep breath, and back to the chorus.',
    },
    hanae_keen_edge: {
      name: 'Find Your Voice', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }],
      up: { fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }] },
      kw: ['exhaust'], slots: ['gold'], art: { m: 'thrust', c: 'amber' },
      flavor: 'Not louder. Clearer.',
    },
    hanae_whetstone: {
      name: 'Run It Again', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'pick', from: 'hand', n: 1, then: 'upgrade' }, bloom(2)],
      up: { fx: [{ op: 'pick', from: 'hand', n: 2, then: 'upgrade' }, bloom(2)] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'star', c: 'teal' },
    },

    // ------------------------------------------------------------------ uncommons: powers
    hanae_spring_vow: {
      name: 'Bud by Bud', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 1,
      // Opener: it is in the opening hand, so the engine starts on turn 1
      fx: [hook('turnStart', [bloom(1)])],
      up: { cost: 0 },
      kw: ['innate'], slots: ['gold'], art: { m: 'lotus', c: 'rose' },
      flavor: 'One more blossom every morning. She has never missed one.',
    },
    hanae_petal_trail: {
      name: 'Shimmer Trail', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 2,
      // every Attack, hers or her partner's, sheds petals on the whole line (hook damage: flat, no Volume, no lead bonus).
      // hero:'any' is how a card rewards a partner nobody can name in advance
      fx: [hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack', hero: 'any' }, limit: 2 })],
      up: { fx: [hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack', hero: 'any' }, limit: 3 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'petals', c: 'violet' },
    },
    hanae_bending_willow: {
      name: 'Bend the Note', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 2,
      // blocked hits count too (onDamaged), shimmied hits do not
      // a power that did nothing the turn it was played lost to every cheap card in simulation, so it braces her at once
      fx: [block(4), hook('onDamaged', [dmg(2, { tgt: 'enemy' }), bloom(1)], { limit: 2 })],
      up: { fx: [block(6), hook('onDamaged', [dmg(3, { tgt: 'enemy' }), bloom(1)], { limit: 2 })] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'thorns', c: 'jade' },
      flavor: 'The note bends. It does not break.',
    },

    // ------------------------------------------------------------------ rares
    hanae_thousand_petals: {
      name: 'The High Note', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 2,
      // one flat blow, so Feedback cannot punish it. Bank Bloom for turns, spend it all at once
      fx: [dmg(perBloom(5), { consume: 'bloom' })],
      up: { fx: [dmg(perBloom(6), { consume: 'bloom' })] },
      kw: ['retain'], slots: ['red', 'any'], art: { m: 'petal_storm', c: 'rose', hero: true },
      flavor: 'Everyone braced for a belt. It came out as a whisper, and it hit harder.',
    },
    hanae_sakura_blizzard: {
      name: 'Blossom Blizzard', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 'X',
      // every Breath is a volley to the whole line and every Bloom sharpens each petal
      fx: [dmg(perBloom(1, { base: 1 }), { hits: { per: 'X' }, tgt: 'all', consume: 'bloom' })],
      up: { fx: [dmg(perBloom(1, { base: 3 }), { hits: { per: 'X' }, tgt: 'all', consume: 'bloom' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'petal_storm', c: 'azure' }, locked: true,
      flavor: 'A whole spring in one breath. Bring an umbrella.',
    },
    hanae_hundred_cuts: {
      name: 'Melisma', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 3,
      // clunky on purpose: a whole turn for eight tiny hits. Every Volume and every Tag you stacked lands on each one
      fx: [dmg(1, { hits: 9 })],
      up: { cost: 2 },
      kw: [], slots: ['red', 'gold'], art: { m: 'sword_rain', c: 'crimson', hero: true },
      flavor: 'She swears it was only one syllable.',
    },
    hanae_mirror_edge: {
      name: 'Mirror Ball', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 1,
      // a defensive turn becomes an offensive one: all her Block leaves as damage to every enemy
      // one Breath now (two left no room to stack the Block it cashes in: Soft Shield, Gentle Sway and this make a turn), and capped so a wall of Block from a partner stays sane
      fx: [dmg({ per: 'block', cap: 20 }, { tgt: 'all', consume: 'block' })],
      up: { fx: [dmg({ base: 2, per: 'block', cap: 24 }, { tgt: 'all', consume: 'block' })] },
      kw: [], slots: ['red', 'gold'], art: { m: 'mirror', c: 'moon' },
      flavor: 'Every blow you throw comes back wearing glitter.',
    },
    hanae_blade_duet: {
      name: 'Calling of the Moon', hero: 'hanae', type: 'skill', rarity: 'rare', cost: 1,
      // a team turn: both heroes hit harder, and a card comes with the deal. It cost 2 and drew 2, which left one Breath to use either
      // (the weakest card in the game in simulation), so it is a one Breath cantrip now and the upgrade makes the whole thing free
      fx: [mightUp(2, 'both'), { op: 'draw', n: 1 }, takeMightBack(2, 'both')],
      up: { cost: 0 },
      kw: [], slots: ['blue', 'any'], art: { m: 'torii', c: 'gold' }, locked: true,
      flavor: 'She calls. The moon answers. So does everyone on the rooftop.',
    },
    hanae_blossom_field: {
      name: 'Cherry Lane', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // the opposite plan to The High Note: keep the Bloom, and let it bleed the whole line every turn
      // a power that does nothing on the turn it is played loses to every cheap card in a three round fight, so the cherry trees shield her at once
      fx: [block(5), hook('turnEnd', [dmg(perBloom(1, { upTo: 6 }), { tgt: 'all' })])],
      up: { fx: [block(8), hook('turnEnd', [dmg(perBloom(1, { upTo: 8 }), { tgt: 'all' })])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'bloom', c: 'teal' }, locked: true,
      flavor: 'Stand still long enough, and the whole street starts to bloom.',
    },
    hanae_blade_dance: {
      name: 'Slow Swell', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // Crescendo (status id `ritual`): +1 Volume at the start of every turn, so every note she sings gets bigger each round
      fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }],
      up: { fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'fan', c: 'crimson' },
      flavor: 'Every bar, a little more. She never once raised her voice.',
    },
    hanae_waltz_of_steps: {
      name: 'Stage Waltz', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // pays for the free swap, the paid swap and every Take the Lead (once a turn). hero:'any' so it fires for a swap whoever asked for it.
      // Bloom and Block: it links the Blossom plan to the Answer Back plan (Block feeds Sing It Back and Mirror Ball). Hook Block has no lead bonus
      // the base text is pinned by tests/hocus_vocus_content.test.mjs ("shares one gain sentence"), so only the upgrade braces her at once
      fx: [hook('onSwap', [bloom(1), block(4)], { filter: { hero: 'any' }, limit: 1 })],
      up: { fx: [block(6), hook('onSwap', [bloom(2), block(4)], { filter: { hero: 'any' }, limit: 1 })] },
      kw: [], slots: ['gold', 'any'], art: { m: 'wind', c: 'violet' }, locked: true,
      flavor: 'One, two, three, swap. One, two, three, swap. Nobody trips.',
    },
  });
})();
