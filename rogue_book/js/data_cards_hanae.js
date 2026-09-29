// Inkwoven -- Hanae, the Blossom Blade: her complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Tokens: none. No card here uses the `add` op, so none is defined.
//
// THE FANTASY. A poised duelist who stands in the front row (+2 damage on EVERY hit, DATA.heroes.hanae.rows) and leaves
// petals behind every cut. Her resource is Bloom: the passive Blade Flow grants 1 Bloom for the first Attack each turn,
// and her cards build it faster and spend it harder. Because the row bonus and Might both apply per hit, the number of
// hits is her real multiplier. Three plans, each with an engine and a finisher, and cards that bridge two of them:
//
//   BLOOM BURST  bank Bloom with cheap tricks, cash it in with `consume: 'bloom'`.
//     builders  Petal Step, Petal Flick, Twin Petals (front), Folding Screen (back), Petal Veil, Whetstone, Spring Vow
//     sinks     Blossom Burst, Full Bloom, Bloom Tide, Thousand Petals (one big flat blow), Sakura Blizzard (every enemy, X cost)
//     or hold it: Blossom Field turns banked Bloom into a slow bleed on every enemy, and its upgrade grows the bank itself.
//   FLURRY       many small hits, Might, Mark. Row bonus, Might and Mark all land on each hit.
//     enablers  Flurry Stance, Keen Edge, Petal Mark (Mark pays +3 per hit, for either hero), Blade Dance (Ritual), Petal Flick
//     payoffs   Rising Gale (a hit per card played, so play it late), Whirling Petals (X), Cyclone Cut, Hundred Cuts (eight hits)
//     Thorns and Plating punish many small hits: a flat finisher such as Thousand Petals is the answer to those enemies.
//   RIPOSTE      Block and Dodge turned into damage, and punishment for being hit.
//     engines   Parry, Sway (Dodge), Riposte (hits for its own Block), Bending Willow (damage back when hit), Swallow Reversal
//     payoffs   Flowing Counter (damage per Dodge), Mirror Edge (all Block becomes damage to every enemy)
//
// TWO ROWS. The back row is where Hanae charges (Folding Screen, Hit and Vanish, +1 Block on her cards), the front row is where
// she cuts. Petal Step and Crescent Step step forward, Hit and Vanish steps back out, and Waltz of Steps pays for every swap. The `swap`
// op does not use the free swap, so a free swap out, Folding Screen in the back and Petal Step forward again costs 1 Energy.
//
// THE PARTNER. Nobody knows who stands beside Hanae, so every ally effect works with anyone: Block gifts (Petal Veil, Full Bloom,
// Hit and Vanish), a Block mirror (Borrowed Shield reads the ally's Block), Blade Duet (Might and Dodge for both heroes), and Petal
// Trail, which pays for either hero's Attacks through `filter.hero: 'any'`. No card reads or grants a resource only one hero owns.
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * Blade Flow (the hero passive) fires AFTER the card resolves, so a Bloom finisher never counts its own Bloom.
//  * Hook damage has no attacker: no Might, no row bonus, no Thorns, and gem damage bonuses never reach it. Petal Trail, Bending
//    Willow and Blossom Field therefore use flat numbers and carry no red slot. `enemy` in an onDamaged hook is the attacker.
//  * Temporary Might is the idiom from CONTENT_SPEC 3.1: gain it, then a `once` turnEnd hook takes it back. Temporary Dodge is the same
//    trick on a `once` turnStart hook, so it survives exactly one enemy phase.
//  * `cardsPlayed` reads the count BEFORE the card being played, so "first card of the turn" is `cardsPlayed lte 0`.
//  * Text honesty (data_text.js): a `hits` value prints only as a plain number, X, or "for each ..." (base and caps are not printed),
//    so Rising Gale and Sakura Blizzard use hits with no base and no cap, and Hundred Cuts uses a plain number.
//
// Numbers are checked by tests/rogue_book_cards_hanae.test.mjs (value per Energy bands, documented there).
(() => {
  // small builders keep the card table readable
  const bloom = (n) => ({ op: 'status', s: 'bloom', n, tgt: 'self' });
  const block = (n, tgt, extra) => Object.assign({ op: 'block', n }, tgt ? { tgt } : null, extra);
  const dmg = (n, extra) => Object.assign({ op: 'dmg', n }, extra);
  const hook = (on, fx, extra) => Object.assign({ op: 'hook', on, fx }, extra);
  // "+N Might this turn": gain it now, give it back at the end of the turn
  const mightUp = (n, tgt) => ({ op: 'status', s: 'might', n, tgt });
  const takeMightBack = (n, tgt) => hook('turnEnd', [{ op: 'status', s: 'might', n: -n, tgt }], { once: true });
  const mightThisTurn = (n, tgt) => [mightUp(n, tgt), takeMightBack(n, tgt)];
  // "+N Dodge until your next turn". Dodge is a permanent stack by nature and a stockpile of it made the Riposte plan nearly
  // untouchable in simulation (two Sways halved the damage taken over a fight), so her commons lend it for one enemy phase only.
  const dodge = (n) => ({ op: 'status', s: 'dodge', n, tgt: 'self' });
  const takeDodgeBack = (n) => hook('turnStart', [dodge(-n)], { once: true });
  const perBloom = (mul, extra) => Object.assign({ per: 'status', s: 'bloom', mul }, extra);

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    hanae_slash: {
      name: 'Petal Slash', hero: 'hanae', type: 'attack', rarity: 'starter', cost: 1,
      fx: [dmg(6)],
      up: { fx: [dmg(8)] },
      kw: [], slots: ['red'], art: { m: 'slash', c: 'rose', hero: true },
      flavor: 'The blossoms arrive a moment after the blade.',
    },
    hanae_parry: {
      name: 'Parry', hero: 'hanae', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(5)],
      up: { fx: [block(6), bloom(1)] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'azure', hero: true },
      flavor: 'She never blocks a strike. She just gets there first.',
    },
    hanae_petal_step: {
      name: 'Petal Step', hero: 'hanae', type: 'skill', rarity: 'starter', cost: 0,
      // a step FORWARD: from the back it swaps her into the front, from the front it never pushes her (and her partner) out of place.
      // The swap comes first so everything after it reads the row she lands in
      fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, bloom(1), block(3)],
      up: { fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, bloom(2), block(3)] },
      kw: [], slots: ['green'], art: { m: 'petals', c: 'rose' },
      flavor: 'Where she stood, only petals are left.',
    },

    // ------------------------------------------------------------------ commons: attacks
    hanae_petal_flick: {
      name: 'Petal Flick', hero: 'hanae', type: 'attack', rarity: 'common', cost: 0,
      fx: [dmg(2), bloom(1)],
      up: { fx: [dmg(4), bloom(1)] },
      kw: [], slots: ['red'], art: { m: 'petals', c: 'amber', hero: true },
    },
    hanae_twin_petals: {
      name: 'Twin Petals', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      fx: [dmg(2, { hits: 2 }), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }],
      up: { fx: [dmg(3, { hits: 2 }), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }] },
      kw: [], slots: ['red'], art: { m: 'cross_slash', c: 'rose', hero: true },
    },
    hanae_rising_gale: {
      name: 'Rising Gale', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // play it late: one hit for every card already played this turn, so it is a dud as the first card and a storm as the fifth
      fx: [dmg(2, { hits: { per: 'cardsPlayed' } })],
      up: { fx: [dmg(3, { hits: { per: 'cardsPlayed' } })] },
      kw: [], slots: ['green'], art: { m: 'wind', c: 'jade' },
      flavor: 'It starts as a breeze. Ask the bamboo how it ends.',
    },
    hanae_blossom_burst: {
      name: 'Blossom Burst', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      fx: [dmg({ base: 3, per: 'status', s: 'bloom', mul: 3, upTo: 3 }, { consume: { s: 'bloom', upTo: 3 } })],
      up: { fx: [dmg({ base: 5, per: 'status', s: 'bloom', mul: 3, upTo: 4 }, { consume: { s: 'bloom', upTo: 4 } })] },
      kw: [], slots: ['red'], art: { m: 'bloom', c: 'rose', hero: true },
    },
    hanae_riposte: {
      name: 'Riposte', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // Block first, then hit for all the Block she is holding: stack Parry first and this becomes a real threat.
      // Blue slot on purpose: a Block gem raises the Block and, through it, the damage
      fx: [block(3), dmg({ per: 'block' })],
      up: { fx: [block(4), dmg({ per: 'block' })] },
      kw: [], slots: ['blue'], art: { m: 'crescent', c: 'crimson', hero: true },
      flavor: 'Rude of them to leave that opening.',
    },
    hanae_crescent_step: {
      name: 'Crescent Step', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1,
      // Petal Step with a blade: from the back it swaps first, so she cuts from the front with the +2, and either way the front row blooms.
      // (Hit and Vanish is the retreating twin: it cuts first and then swaps out)
      fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, dmg(5), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }],
      up: { fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'swap' }] }, dmg(7), { op: 'cond', if: { row: 'front' }, then: [bloom(1)] }] },
      kw: [], slots: ['green'], art: { m: 'crescent', c: 'moon' },
    },
    hanae_whirling_petals: {
      name: 'Whirling Petals', hero: 'hanae', type: 'attack', rarity: 'common', cost: 'X',
      // random targets: a lone enemy takes every hit, a crowd shares them, and no target needs choosing
      fx: [dmg(4, { hits: { per: 'X' }, tgt: 'random' })],
      up: { fx: [dmg(5, { hits: { per: 'X' }, tgt: 'random' })] },
      kw: [], slots: ['red'], art: { m: 'tornado', c: 'rose' },
    },

    // ------------------------------------------------------------------ commons: skills
    hanae_folding_screen: {
      name: 'Folding Screen', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(5), { op: 'cond', if: { row: 'back' }, then: [bloom(2)] }],
      up: { fx: [block(7), { op: 'cond', if: { row: 'back' }, then: [bloom(2)] }] },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'amber' },
      flavor: 'Behind the screen, someone is calmly counting petals.',
    },
    hanae_sway: {
      name: 'Sway', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(4), dodge(1), takeDodgeBack(1)],
      up: { fx: [block(6), dodge(1), takeDodgeBack(1)] },
      kw: [], slots: ['blue'], art: { m: 'crane', c: 'azure', hero: true },
      flavor: 'The wind never aims. It never has to.',
    },
    hanae_petal_veil: {
      name: 'Petal Veil', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(3, 'both'), bloom(1)],
      up: { fx: [block(5, 'both'), bloom(1)] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'rose' },
      flavor: 'A curtain of petals, wide enough for two.',
    },
    hanae_sakura_sort: {
      name: 'Sakura Sort', hero: 'hanae', type: 'skill', rarity: 'common', cost: 0,
      // a free filter that pays a petal: a pure cycler is a dead card, so it blooms too, and it counts as a card played for Rising Gale
      fx: [{ op: 'draw', n: 1 }, { op: 'pick', from: 'hand', n: 1, then: 'discard' }, bloom(1)],
      up: { fx: [{ op: 'draw', n: 1 }, { op: 'pick', from: 'hand', n: 1, then: 'discard' }, bloom(2)] },
      kw: [], slots: ['green'], art: { m: 'scroll', c: 'amber' },
    },
    hanae_flurry_stance: {
      name: 'Flurry Stance', hero: 'hanae', type: 'skill', rarity: 'common', cost: 0,
      fx: mightThisTurn(2, 'self'),
      up: { fx: mightThisTurn(3, 'self') },
      kw: [], slots: ['gold'], art: { m: 'eye', c: 'crimson' },
    },
    hanae_petal_mark: {
      name: 'Petal Mark', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      // Mark is spent one stack per hit by ANY hero's attacks, so it pays best under a Flurry
      fx: [{ op: 'status', s: 'mark', n: 3, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: [], slots: ['gold'], art: { m: 'sigil', c: 'rose' },
    },
    hanae_borrowed_shield: {
      name: 'Borrowed Shield', hero: 'hanae', type: 'skill', rarity: 'common', cost: 1,
      fx: [block({ base: 3, per: 'block', who: 'ally' })],
      up: { fx: [block({ base: 5, per: 'block', who: 'ally' })] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'ash' },
    },

    // ------------------------------------------------------------------ uncommons: attacks
    hanae_cyclone_cut: {
      name: 'Cyclone Cut', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 2,
      fx: [dmg(2, { hits: 2, tgt: 'all' })],
      up: { fx: [dmg(2, { hits: 3, tgt: 'all' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'tornado', c: 'violet' },
    },
    hanae_hit_and_vanish: {
      name: 'Hit and Vanish', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 2,
      // cut from where she stands, then step out; if that puts her in the back row the partner is now the one in front, so both get Block
      fx: [dmg(6), { op: 'swap' }, { op: 'cond', if: { row: 'back' }, then: [block(3, 'both')] }],
      up: { fx: [dmg(8), { op: 'swap' }, { op: 'cond', if: { row: 'back' }, then: [block(4, 'both')] }] },
      kw: [], slots: ['red', 'blue'], art: { m: 'crescent', c: 'indigo', hero: true },
      flavor: 'By the time they turn, she has already left.',
    },
    hanae_flowing_counter: {
      name: 'Flowing Counter', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 1,
      // Dodge is not spent by the counter: every Sway, Waltz or Duet played first makes it bigger
      fx: [dodge(1), dmg({ per: 'status', s: 'dodge', mul: 3 }), takeDodgeBack(1)],
      up: { fx: [dodge(1), dmg({ per: 'status', s: 'dodge', mul: 4 }), takeDodgeBack(1)] },
      kw: [], slots: ['red', 'gold'], art: { m: 'wave', c: 'azure' },
    },
    hanae_iai_draw: {
      name: 'Iai Draw', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 0,
      // retain: hold it until the first card of a turn. Exhaust: one perfect draw per fight
      fx: [{ op: 'cond', if: { cardsPlayed: { lte: 0 } }, then: [dmg(12)], else: [dmg(4)] }],
      up: { fx: [{ op: 'cond', if: { cardsPlayed: { lte: 0 } }, then: [dmg(16)], else: [dmg(4)] }] },
      kw: ['retain', 'exhaust'], slots: ['red'], art: { m: 'iai', c: 'ink', hero: true }, locked: true,
      flavor: 'Blink, and the duel was over.',
    },
    hanae_swallow_reversal: {
      name: 'Swallow Reversal', hero: 'hanae', type: 'attack', rarity: 'uncommon', cost: 1,
      // pays for the hits she could not avoid: clunky beside Block, brutal after a bad round
      fx: [dmg({ base: 2, per: 'damageTaken', cap: 15 })],
      up: { fx: [dmg({ base: 4, per: 'damageTaken', cap: 18 })] },
      kw: [], slots: ['red'], art: { m: 'crane', c: 'crimson' }, locked: true,
    },

    // ------------------------------------------------------------------ uncommons: skills
    hanae_full_bloom: {
      name: 'Full Bloom', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [block({ per: 'status', s: 'bloom', mul: 2 }, 'both', { consume: 'bloom' })],
      up: { fx: [block({ per: 'status', s: 'bloom', mul: 3 }, 'both', { consume: 'bloom' })] },
      kw: ['retain'], slots: ['blue', 'green'], art: { m: 'bloom', c: 'gold' },
    },
    hanae_bloom_tide: {
      name: 'Bloom Tide', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 0,
      fx: [{ op: 'cond', if: { status: { s: 'bloom', gte: 3 } }, then: [{ op: 'removeStatus', s: 'bloom', n: 3, tgt: 'self' }, { op: 'energy', n: 2 }] }],
      up: { fx: [{ op: 'cond', if: { status: { s: 'bloom', gte: 2 } }, then: [{ op: 'removeStatus', s: 'bloom', n: 2, tgt: 'self' }, { op: 'energy', n: 2 }] }] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'koi', c: 'rose' }, locked: true,
      flavor: 'Petals on the water go wherever the current wants.',
    },
    hanae_keen_edge: {
      name: 'Keen Edge', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }],
      up: { fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }] },
      kw: ['exhaust'], slots: ['gold'], art: { m: 'thrust', c: 'amber' },
    },
    hanae_whetstone: {
      name: 'Whetstone', hero: 'hanae', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'pick', from: 'hand', n: 1, then: 'upgrade' }, bloom(2)],
      up: { fx: [{ op: 'pick', from: 'hand', n: 2, then: 'upgrade' }, bloom(2)] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'star', c: 'teal' },
    },

    // ------------------------------------------------------------------ uncommons: powers
    hanae_spring_vow: {
      name: 'Spring Vow', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 1,
      // innate: it is in the opening hand, so the engine starts on turn 1
      fx: [hook('turnStart', [bloom(1)])],
      up: { cost: 0 },
      kw: ['innate'], slots: ['gold'], art: { m: 'lotus', c: 'rose' },
    },
    hanae_petal_trail: {
      name: 'Petal Trail', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 2,
      // every Attack, hers or her partner's, sheds petals on the whole line (hook damage: flat, no Might, no row bonus).
      // hero:'any' is how a card rewards a partner nobody can name in advance
      fx: [hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack', hero: 'any' }, limit: 2 })],
      up: { fx: [hook('onPlay', [dmg(2, { tgt: 'all' })], { filter: { type: 'attack', hero: 'any' }, limit: 3 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'petals', c: 'violet' },
    },
    hanae_bending_willow: {
      name: 'Bending Willow', hero: 'hanae', type: 'power', rarity: 'uncommon', cost: 2,
      // blocked hits count too (onDamaged), dodged hits do not
      fx: [hook('onDamaged', [dmg(2, { tgt: 'enemy' }), bloom(1)], { limit: 2 })],
      up: { fx: [hook('onDamaged', [dmg(3, { tgt: 'enemy' }), bloom(1)], { limit: 2 })] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'thorns', c: 'jade' },
      flavor: 'The willow bends. It does not forget.',
    },

    // ------------------------------------------------------------------ rares
    hanae_thousand_petals: {
      name: 'Thousand Petals', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 2,
      // one flat blow, so Thorns cannot punish it. Bank Bloom for turns, spend it all at once
      fx: [dmg(perBloom(4), { consume: 'bloom' })],
      up: { fx: [dmg(perBloom(5), { consume: 'bloom' })] },
      kw: ['retain'], slots: ['red', 'any'], art: { m: 'petal_storm', c: 'rose', hero: true },
      flavor: 'The tree does not count its petals. It simply lets go.',
    },
    hanae_sakura_blizzard: {
      name: 'Sakura Blizzard', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 'X',
      // every Energy is a volley to the whole line and every Bloom sharpens each petal
      fx: [dmg(perBloom(1), { hits: { per: 'X' }, tgt: 'all', consume: 'bloom' })],
      up: { fx: [dmg({ base: 2, per: 'status', s: 'bloom', mul: 1 }, { hits: { per: 'X' }, tgt: 'all', consume: 'bloom' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'petal_storm', c: 'azure' }, locked: true,
      flavor: 'Spring, delivered all at once.',
    },
    hanae_hundred_cuts: {
      name: 'Hundred Cuts', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 3,
      // clunky on purpose: a whole turn for eight tiny hits. Every Might and every Mark you stacked lands on each one
      fx: [dmg(1, { hits: 8 })],
      up: { fx: [dmg(1, { hits: 10 })] },
      kw: [], slots: ['red', 'gold'], art: { m: 'sword_rain', c: 'crimson', hero: true },
      flavor: 'She swears it was only one swing.',
    },
    hanae_mirror_edge: {
      name: 'Mirror Edge', hero: 'hanae', type: 'attack', rarity: 'rare', cost: 2,
      // a defensive turn becomes an offensive one: all her Block leaves as damage to every enemy
      fx: [dmg({ per: 'block' }, { tgt: 'all', consume: 'block' })],
      up: { cost: 1 },
      kw: [], slots: ['red', 'gold'], art: { m: 'mirror', c: 'moon' },
      flavor: 'Every blow you throw comes back wearing a different face.',
    },
    hanae_blade_duet: {
      name: 'Blade Duet', hero: 'hanae', type: 'skill', rarity: 'rare', cost: 2,
      // a team turn: both heroes hit harder, and the cards to use it come with the deal
      fx: [mightUp(2, 'both'), { op: 'draw', n: 2 }, takeMightBack(2, 'both')],
      up: { fx: [mightUp(3, 'both'), { op: 'draw', n: 2 }, takeMightBack(3, 'both')] },
      kw: [], slots: ['blue', 'any'], art: { m: 'torii', c: 'gold' }, locked: true,
      flavor: 'Two heartbeats. One rhythm.',
    },
    hanae_blossom_field: {
      name: 'Blossom Field', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // the opposite plan to Thousand Petals: keep the Bloom, and let it bleed the whole line every turn
      fx: [hook('turnEnd', [dmg(perBloom(1, { upTo: 6 }), { tgt: 'all' })])],
      up: { fx: [hook('turnEnd', [dmg(perBloom(1, { upTo: 6 }), { tgt: 'all' }), bloom(1)])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'bloom', c: 'teal' }, locked: true,
      flavor: 'Stand still long enough, and the meadow starts to cut back.',
    },
    hanae_blade_dance: {
      name: 'Blade Dance', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // Ritual: +1 Might at the start of every turn, so every hit she throws gets sharper each round
      fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }],
      up: { fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'fan', c: 'crimson' },
      flavor: 'Every step sharpens the blade a little more.',
    },
    hanae_waltz_of_steps: {
      name: 'Waltz of Steps', hero: 'hanae', type: 'power', rarity: 'rare', cost: 2,
      // pays for the free swap, the paid swap and every Petal Step (once a turn). hero:'any' so it fires for a swap whoever asked for it.
      // Bloom and Block: it links the Bloom plan to the Riposte plan (Block feeds Riposte and Mirror Edge). Hook Block has no row bonus
      fx: [hook('onSwap', [bloom(1), block(4)], { filter: { hero: 'any' }, limit: 1 })],
      up: { fx: [hook('onSwap', [bloom(2), block(4)], { filter: { hero: 'any' }, limit: 1 })] },
      kw: [], slots: ['gold', 'any'], art: { m: 'wind', c: 'violet' }, locked: true,
      flavor: 'One, two, three, and the floor changes hands.',
    },
  });
})();
