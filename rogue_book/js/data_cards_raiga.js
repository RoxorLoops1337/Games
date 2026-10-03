// Inkwoven -- Raiga, the Thunder Monk: his complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Tokens: none. No card here uses the `add` op, so none is defined.
//
// THE FANTASY. A booming, kind wandering monk who trades blows with storms: the bigger the hit he survives, the louder the
// thunder. He stands in the front row (Thorns 2 and 3 starting Block, DATA.heroes.raiga.rows) and his passive Storm Born gives
// him 1 Charge for each of the first two enemy hits he takes per round. In the back row he swings +1 damage on every hit, which
// is why his multi-hit cards like it there. Charge is a banked resource that never decays: sinks read it, spend it, or refund
// Energy for it. The cards are written so that HP is a resource too: he pays HP for power (`hurt`) and cashes pain in.
//
//   STORM        Charge into multi-hit and area lightning.
//     builders   Static Fist (the signature, doubly so in the back), Hard Knock, Draw Lightning, Bring It On, Tiger and Crane (the
//                Back-row Charge trick), Living Conduit (either hero's Attacks), Unshaken Mind (a big pile of Block becomes Charge),
//                Storm Taiko (every 3rd card), Storm's Eye
//     sinks      Chain Lightning (a random hit per Charge), Rolling Thunder (scales with Charge, keeps it), Raijin's Hammer (a
//                3 cost hammer that refunds Energy for Charge), Thousand Thunders (every enemy, spends the bank)
//   RETALIATION  Thorns, damage when hit, and hurting himself for power. Suzu owns plain Block plus Taunt and Hanae owns Block into
//                damage, so Raiga's version is PAIN: the damage he took is what his cards spend.
//     engines    Bramble Stance and Lightning Rod (Thorns), Waiting Storm (Stun whoever hits him next), Long Memory (Mark the
//                attacker), Blood and Thunder and Bring It On (HP for Might and Charge), Shared Burden (his wounds shield the ally)
//     payoffs    Repay in Kind (per hit taken), Heaven's Answer (the damage he took, up to 24), Cornered Tiger (double damage under
//                half HP), Mountain Vow (Block for every missing HP), Thornstorm (Thorns fire at the whole line every turn)
//   BRAWLER      Stun, Burn, Mark and big single hits, with real combos.
//     setup      Stilling Palm and Waiting Storm (Stun), Ember Fist and Flashpoint (Burn, and Flashpoint doubles it), Static Field
//                (Mark on the whole line)
//     payoffs    Sundering Blow (26 damage to a Stunned target, so play a Stun first), Drumroll (a flurry that also shields), Raijin's
//                Hammer, Deafening Thunderclap (Stun everything that can be Stunned)
//   Bridges: Mark makes every multi-hit Storm card hit harder (each hit spends one Mark for +3); a Waiting Storm Stun lasts until the
//   enemy tries to act again, so the Stunned attacker is still Stunned on Raiga's own turn for Sundering Blow; hurt cards feed every
//   pain payoff at once; Static Field into Chain Lightning or Rolling Thunder.
//
// TWO ROWS. Front: Thorns 2, start Block 3, no damage bonus. Back: +1 damage on every hit and nobody hits him, so his Charge must come from
// cards. Cards that read the row: Static Fist and Draw Lightning (one more Charge in the back, where Storm Born is silent), Rolling
// Thunder (back: more damage to all), Iron Palm (front: more Block), and Tiger and Crane, which swaps and pays by the row he lands in.
// The `swap` op does not use the free swap, so front -> Tiger and Crane (back: Charge and a card, +1 damage on the next hits) ->
// the free swap home costs no Energy at all.
//
// THE PARTNER. Nobody knows who stands beside Raiga, so every ally effect works with anyone: Block for both (Temple Gong), Thorns for both
// (Lightning Rod), Might for both (Rousing Roar), his missing HP turned into the ally's Block (Shared Burden), Unshaken Mind (Block for
// the ally), and Living Conduit, which pays Raiga a Charge when EITHER hero plays an Attack, once a turn (`filter.hero: 'any'`).
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * `hurt` cannot take him below 1 HP, and it does NOT fire Storm Born (only enemy hits do), so every hurt card also says what it grants.
//    It does count as HP lost for `damageTaken`, so hurt then Heaven's Answer is a real combo. `hitsTaken` counts only hits that removed HP.
//  * Storm Born (`onDamaged`, limit 2) is per round: the limit resets when his turn begins, and the enemy phase that follows counts as
//    the same turn. Card hooks that also use `onDamaged` have their own limits.
//  * Hook damage has no attacker: no Might, no row bonus, no Thorns, and gem damage bonuses never reach it. Storm Taiko, Waiting Storm and
//    Thornstorm therefore use flat numbers. `enemy` in an onDamaged hook is the attacker. Status ops in hooks land on that enemy too.
//  * A Stun on an enemy is not decremented at round end, only consumed when it skips: Stun applied to an attacker in the enemy phase is
//    still there in the player phase. Bosses are always immune and an elite is immune for 2 rounds after being stunned (an `immune` event).
//  * Text honesty (data_text.js): a `hits` value prints only as a plain number, X, or "for each ...", so Chain Lightning uses hits with no
//    base, no mul and no cap. Caps live on `dmg` values, whose text prints "(up to N)" and "(max N)".
//  * Temporary Might is the CONTENT_SPEC 3.1 idiom: gain it, then a `once` turnEnd hook takes it back.
//  * `cardsPlayed` reads the count BEFORE the card being played; a card's own hook never fires for its own play.
//
// Numbers are checked by tests/rogue_book_cards_raiga.test.mjs (value per Energy bands, documented there).
(() => {
  // small builders keep the card table readable
  const dmg = (n, extra) => Object.assign({ op: 'dmg', n }, extra);
  const zap = (n, extra) => dmg(n, Object.assign({ el: 'lightning' }, extra));     // presentation: lightning VFX on a non-lightning motif
  const block = (n, tgt, extra) => Object.assign({ op: 'block', n }, tgt ? { tgt } : null, extra);
  const charge = (n) => ({ op: 'status', s: 'charge', n, tgt: 'self' });
  const spendCharge = (n) => ({ op: 'removeStatus', s: 'charge', n, tgt: 'self' });
  const hurt = (n) => ({ op: 'hurt', n, tgt: 'self' });
  const thorns = (n, tgt) => ({ op: 'status', s: 'thorns', n, tgt: tgt || 'self' });
  const stun = (n, tgt) => ({ op: 'status', s: 'stun', n, tgt: tgt || 'enemy' });
  const mark = (n, tgt) => ({ op: 'status', s: 'mark', n, tgt: tgt || 'enemy' });
  const burn = (n) => ({ op: 'status', s: 'burn', n, tgt: 'enemy' });
  const hook = (on, fx, extra) => Object.assign({ op: 'hook', on, fx }, extra);
  const when = (cond, then, otherwise) => Object.assign({ op: 'cond', if: cond, then }, otherwise ? { else: otherwise } : null);
  const perCharge = (mul, extra) => Object.assign({ per: 'status', s: 'charge', mul }, extra);
  // "+N Might this turn": gain it now, give it back at the end of the turn
  const mightThisTurn = (n, tgt) => [
    { op: 'status', s: 'might', n, tgt },
    hook('turnEnd', [{ op: 'status', s: 'might', n: -n, tgt }], { once: true }),
  ];

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    raiga_jab: {
      name: 'Thunder Jab', hero: 'raiga', type: 'attack', rarity: 'starter', cost: 1,
      fx: [zap(6)],
      up: { fx: [zap(8)] },
      kw: [], slots: ['red'], art: { m: 'thunder_fist', c: 'amber', hero: true },
      flavor: 'Just a knock at the door. The sky answers later.',
    },
    raiga_brace: {
      name: 'Stone Brace', hero: 'raiga', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(5)],
      up: { fx: [block(8)] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'ash' },
      flavor: 'He plants his feet the way a mountain plants its roots.',
    },
    raiga_static_fist: {
      name: 'Static Fist', hero: 'raiga', type: 'attack', rarity: 'starter', cost: 1,
      // the signature: it scales with the Charge he holds (and keeps it), then adds one. In the back, where nobody hits him and Storm Born is
      // silent, it charges twice as hard, so a back-row Raiga is never starved
      fx: [zap(perCharge(2, { base: 3, upTo: 3 })), charge(1), when({ row: 'back' }, [charge(1)])],
      up: { fx: [zap(perCharge(2, { base: 4, upTo: 4 })), charge(1), when({ row: 'back' }, [charge(1)])] },
      kw: [], slots: ['red'], art: { m: 'lightning', c: 'gold', hero: true },
    },

    // ------------------------------------------------------------------ commons: attacks
    raiga_hard_knock: {
      name: 'Hard Knock', hero: 'raiga', type: 'attack', rarity: 'common', cost: 0,
      // the cheap trick: free damage and a Charge, paid in HP. The HP also feeds every pain payoff
      fx: [dmg(4), hurt(1), charge(1)],
      up: { fx: [dmg(6), hurt(1), charge(1)] },
      kw: [], slots: ['red'], art: { m: 'fist', c: 'crimson', hero: true },
      flavor: 'Raiga\'s forehead has opinions, and it shares them.',
    },
    raiga_chain_lightning: {
      name: 'Chain Lightning', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // a sink that does nothing without Charge and a lot with a bank. Random targets, one hit per Charge, so Mark, Might and the back-row
      // bonus land on every hit. It empties the bank, so it is a burst, not a habit. 3 per hit on purpose: the 0 cost builders feed it at
      // about 1 HP per Charge, and the rare finisher (Thousand Thunders, 3 plus 4 per Charge to EVERY enemy) must stay the efficient way to cash a bank
      fx: [zap(3, { hits: { per: 'status', s: 'charge' }, tgt: 'random' }), spendCharge()],
      up: { fx: [zap(4, { hits: { per: 'status', s: 'charge' }, tgt: 'random' }), spendCharge()] },
      kw: [], slots: ['red'], art: { m: 'chain_lightning', c: 'azure' },
      flavor: 'It never picks a favourite. It just visits everyone.',
    },
    raiga_rolling_thunder: {
      name: 'Rolling Thunder', hero: 'raiga', type: 'attack', rarity: 'common', cost: 2,
      // the area attack that grows with the bank without spending it. Back row: two more to every enemy on top of the +1 per hit
      fx: [zap(perCharge(1, { base: 5, upTo: 3 }), { tgt: 'all' }), when({ row: 'back' }, [zap(2, { tgt: 'all' })])],
      up: { fx: [zap(perCharge(1, { base: 7, upTo: 3 }), { tgt: 'all' }), when({ row: 'back' }, [zap(2, { tgt: 'all' })])] },
      kw: [], slots: ['red'], art: { m: 'tornado', c: 'indigo' },
      flavor: 'You hear it long before you feel it.',
    },
    raiga_iron_palm: {
      name: 'Iron Palm', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // the attack that guards: a solid building block for the whole game. It shields more in the front, where the blows land
      fx: [dmg(6), block(2), when({ row: 'front' }, [block(2)])],
      up: { fx: [dmg(8), block(3), when({ row: 'front' }, [block(2)])] },
      kw: [], slots: ['blue'], art: { m: 'thrust', c: 'moon' },
    },
    raiga_stilling_palm: {
      name: 'Stilling Palm', hero: 'raiga', type: 'attack', rarity: 'common', cost: 2,
      // the Stun that opens the Brawler plan: whatever it hits skips its next action, and is still Stunned for a Sundering Blow
      fx: [dmg(7), stun(1)],
      up: { fx: [dmg(10), stun(1)] },
      kw: [], slots: ['red'], art: { m: 'fist', c: 'jade', hero: true },
      flavor: 'Even the wind holds still for a moment.',
    },
    raiga_repay_in_kind: {
      name: 'Repay in Kind', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // pays three for every blow that got through last enemy phase. A blow that Block swallowed does not count: be brave, not reckless
      fx: [zap({ base: 2, per: 'hitsTaken', mul: 3, cap: 11 })],
      up: { fx: [zap({ base: 3, per: 'hitsTaken', mul: 4, cap: 15 })] },
      kw: [], slots: ['red'], art: { m: 'mirror', c: 'violet' },
      flavor: 'He remembers every kindness, and every bruise.',
    },
    raiga_ember_fist: {
      name: 'Ember Fist', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // the Burn opener: a little damage now and a fire that keeps working. Flashpoint doubles what is burning
      fx: [dmg(3), burn(4)],
      up: { fx: [dmg(4), burn(6)] },
      kw: [], slots: ['gold'], art: { m: 'flame_orb', c: 'amber' },
    },

    // ------------------------------------------------------------------ commons: skills
    raiga_bramble_stance: {
      name: 'Bramble Stance', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(5), thorns(1)],
      up: { fx: [block(6), thorns(2)] },
      kw: [], slots: ['blue'], art: { m: 'thorns', c: 'jade' },
    },
    raiga_draw_lightning: {
      name: 'Draw Lightning', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // free Charge for a little HP. In the back row nothing hits him, so Storm Born is silent there and the card gives one more
      fx: [hurt(2), charge(2), when({ row: 'back' }, [charge(1)])],
      up: { fx: [hurt(2), charge(3), when({ row: 'back' }, [charge(1)])] },
      kw: [], slots: ['green'], art: { m: 'lightning', c: 'violet' },
      flavor: 'A little pain is a fair price for a lot of sky.',
    },
    raiga_temple_gong: {
      name: 'Temple Gong', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // Block for both heroes, whoever the partner is, and a deep breath: one card stays in hand for next turn
      fx: [block(4, 'both'), { op: 'pick', from: 'hand', n: 1, then: 'retain' }],
      up: { fx: [block(6, 'both'), { op: 'pick', from: 'hand', n: 1, then: 'retain' }] },
      kw: [], slots: ['blue'], art: { m: 'bell', c: 'gold' },
      flavor: 'It rings once. Everyone remembers they are not alone.',
    },
    raiga_static_field: {
      name: 'Static Field', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // Mark on the whole line: every hit, from either hero, spends one Mark for +3, so multi-hit and area cards love it. It cost 1 for
      // Mark 2 and was a dead draw for a hero without many hits to spend it on (-0.9 in simulation): free, it is a rider on any turn
      fx: [mark(1, 'all')],
      up: { fx: [mark(2, 'all')] },
      kw: [], slots: ['gold'], art: { m: 'eye', c: 'crimson' },
    },
    raiga_still_water: {
      name: 'Still Water', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // a free filter: throw away what you cannot use and draw the same number back
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'discard', optional: true }, { op: 'draw', n: { per: 'picked' } }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'discard', optional: true }, { op: 'draw', n: { per: 'picked' } }] },
      kw: [], slots: ['green'], art: { m: 'wave', c: 'teal' },
      flavor: 'Empty the cup, and the tea tastes better.',
    },
    raiga_rousing_roar: {
      name: 'Rousing Roar', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // a team turn for one Energy: both heroes hit harder, and Might works for any partner's Attacks
      fx: mightThisTurn(2, 'both'),
      up: { cost: 0 },
      kw: [], slots: ['gold'], art: { m: 'dragon', c: 'amber' },
      flavor: 'It is not a war cry. It is an invitation.',
    },
    raiga_shared_burden: {
      name: 'Shared Burden', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // the more hurt he is, the more he shields his partner: the wounds he chose to take become the ally's armour
      fx: [block({ per: 'missingHp', cap: 8 }, 'ally')],
      up: { fx: [block({ per: 'missingHp', cap: 12 }, 'ally')] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'ash' },
      flavor: 'He carries it lightly, so nobody else has to.',
    },

    // ------------------------------------------------------------------ uncommons: attacks
    raiga_sundering_blow: {
      name: 'Sundering Blow', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 2,
      // clunky and enormous: the smash for a Stunned target. Retain lets it wait in hand until a Stun lands (Stilling Palm, Waiting Storm)
      fx: [when({ targetStatus: { s: 'stun' } }, [dmg(26)], [dmg(10)])],
      up: { fx: [when({ targetStatus: { s: 'stun' } }, [dmg(32)], [dmg(12)])] },
      kw: ['retain'], slots: ['red', 'green'], art: { m: 'quake', c: 'crimson' },
      flavor: 'Even mountains flinch first.',
    },
    raiga_cornered_tiger: {
      name: 'Cornered Tiger', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 1,
      // hurt cards, a bad round and Blood and Thunder all push him under half HP, where this hits twice as hard
      fx: [dmg(7), when({ hpPct: { lt: 0.5 } }, [dmg(8)])],
      up: { fx: [dmg(9), when({ hpPct: { lt: 0.5 } }, [dmg(9)])] },
      kw: [], slots: ['red'], art: { m: 'tiger', c: 'amber', hero: true },
      flavor: 'He is calmest just before he is angriest.',
    },
    raiga_drumroll: {
      name: 'Drumroll', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 'X',
      // the flurry on ONE target that also guards him: every beat lands a hit and raises a little wall. Mark, Might and Stun-bonus friendly
      fx: [{ op: 'repeat', n: { per: 'X' }, do: [dmg(4), block(2)] }],
      up: { fx: [{ op: 'repeat', n: { per: 'X' }, do: [dmg(5), block(3)] }] },
      kw: [], slots: ['red', 'blue'], art: { m: 'thunder_fist', c: 'violet', hero: true },
      flavor: 'Fifty fists, and he keeps the beat.',
    },

    // ------------------------------------------------------------------ uncommons: skills
    raiga_lightning_rod: {
      name: 'Lightning Rod', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // permanent Thorns for BOTH heroes: the partner stops being a soft target, whoever the partner is
      fx: [thorns(2, 'both')],
      up: { fx: [thorns(3, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'lightning', c: 'azure' },
      flavor: 'Stand tall. Be generous with the storm.',
    },
    raiga_blood_and_thunder: {
      name: 'Blood and Thunder', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // the deal: HP for permanent Might and a Charge. One shot per fight, and the HP feeds every pain payoff
      fx: [hurt(6), { op: 'status', s: 'might', n: 2, tgt: 'self' }, charge(1)],
      up: { fx: [hurt(4), { op: 'status', s: 'might', n: 2, tgt: 'self' }, charge(2)] },
      kw: ['exhaust'], slots: ['blue'], art: { m: 'fire', c: 'crimson' },
      flavor: 'Some vows are paid in bruises.',
    },
    raiga_waiting_storm: {
      name: 'Waiting Storm', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1, locked: true,
      // a trap that fires on the next blow, even a fully Blocked one: the attacker is Stunned, and a Stun on an enemy survives until it tries to
      // act again, so it is still Stunned on Raiga's own turn: Sundering Blow's dream
      fx: [block(4), hook('onDamaged', [stun(1)], { once: true })],
      up: { fx: [block(6), hook('onDamaged', [stun(1)], { once: true })] },
      kw: [], slots: ['blue', 'green'], art: { m: 'wind', c: 'ash' },
      flavor: 'The trap is patient. So is the sky.',
    },
    raiga_flashpoint: {
      name: 'Flashpoint', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1, locked: true,
      // doubles the Burn on the target (up to 12): Ember Fist, then this, then this again is a real fire. Nothing to double, nothing happens
      fx: [{ op: 'status', s: 'burn', n: { per: 'status', s: 'burn', who: 'target', cap: 12 }, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: [], slots: ['green', 'gold'], art: { m: 'fire', c: 'amber' },
      flavor: 'Everything is fire, if you are patient enough.',
    },
    raiga_tiger_and_crane: {
      name: 'Tiger and Crane', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 0,
      // a free swap that pays by the row he lands in: the Tiger steps forward and braces, the Crane steps back, charges and thinks.
      // The swap op does not use the free swap: front -> back (Crane) -> free swap home costs no Energy, and the hits in between get the back-row +1
      fx: [{ op: 'swap' }, when({ row: 'front' }, [block(5)], [charge(1), { op: 'draw', n: 1 }])],
      up: { fx: [{ op: 'swap' }, when({ row: 'front' }, [block(7)], [charge(2), { op: 'draw', n: 1 }])] },
      kw: [], slots: ['green'], art: { m: 'crane', c: 'moon' },
      flavor: 'Two stances, one breath.',
    },
    raiga_bring_it_on: {
      name: 'Bring It On', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // the ally-protecting Taunt, paid in HP: the blows aimed at the back, at a random hero or at the weakest hero find him instead,
      // a few of them will be thunder, and the ally gets a little Block for the trouble
      fx: [hurt(3), charge(3), { op: 'status', s: 'taunt', n: 2, tgt: 'self' }, block(3, 'ally')],
      up: { fx: [hurt(2), charge(3), { op: 'status', s: 'taunt', n: 3, tgt: 'self' }, block(4, 'ally')] },
      kw: [], slots: ['blue'], art: { m: 'mask', c: 'crimson' },
      flavor: 'He says it warmly. That is the worrying part.',
    },

    // ------------------------------------------------------------------ uncommons: powers
    raiga_living_conduit: {
      name: 'Living Conduit', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 1,
      // innate: it should be running from turn one. hero:'any' is how a card rewards a partner nobody can name in advance
      fx: [hook('onPlay', [charge(1)], { filter: { type: 'attack', hero: 'any' }, limit: 1 })],
      up: { fx: [hook('onPlay', [charge(1)], { filter: { type: 'attack', hero: 'any' }, limit: 2 })] },
      kw: ['innate'], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'teal' },
    },
    raiga_long_memory: {
      name: 'Long Memory', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 2,
      // every blow he takes Marks the one who threw it, so his next hits (and the partner's) land +3 harder. Blocked blows count
      fx: [hook('onDamaged', [mark(1)], { limit: 2 })],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'green'], art: { m: 'eye', c: 'ink' },
      flavor: 'He forgives everyone. He also remembers everyone.',
    },
    raiga_unshaken_mind: {
      name: 'Unshaken Mind', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 1, locked: true,
      // the Block plan pays out: a wall at the end of the turn becomes Charge, and a little of it goes to the partner. Front row start Block 3
      // plus Stone Brace already gets close
      fx: [hook('turnEnd', [when({ block: { gte: 10 } }, [charge(2), block(3, 'ally')])])],
      up: { fx: [hook('turnEnd', [when({ block: { gte: 8 } }, [charge(2), block(3, 'ally')])])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'lotus', c: 'moon' },
      flavor: 'The storm may knock. The temple does not answer.',
    },

    // ------------------------------------------------------------------ rares
    raiga_raijin_hammer: {
      name: 'Raijin\'s Hammer', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 3,
      // the 3 cost hammer that costs less per Charge: with the bank it refunds two of its three Energy, so it is really a 1 cost card
      // every other turn. Retain: wait in hand until the bank is ready
      fx: [zap(22), when({ status: { s: 'charge', gte: 4 } }, [spendCharge(4), { op: 'energy', n: 2 }])],
      up: { fx: [zap(26), when({ status: { s: 'charge', gte: 3 } }, [spendCharge(3), { op: 'energy', n: 2 }])] },
      kw: ['retain'], slots: ['red', 'gold'], art: { m: 'quake', c: 'gold' },
      flavor: 'The thunder god does not swing it. He lets it fall.',
    },
    raiga_thousand_thunders: {
      name: 'Thousand Thunders', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 3,
      // the Storm finisher: bank Charge for a few turns, then every enemy takes the whole bank. It paid 4 a Charge up to 6 Charge, a bank a four round fight
      // never reached (-1.0 in simulation), so it pays 3 flat and 4 a Charge up to 5 (4 flat and 5 a Charge upgraded) and a bigger bank stays for the next time
      fx: [zap(perCharge(4, { base: 3, upTo: 5 }), { tgt: 'all', consume: { s: 'charge', upTo: 5 } })],
      up: { fx: [zap(perCharge(5, { base: 4, upTo: 5 }), { tgt: 'all', consume: { s: 'charge', upTo: 5 } })] },
      kw: ['retain'], slots: ['red', 'green'], art: { m: 'meteor', c: 'violet' },
      flavor: 'Every cloud he ever walked under, all at once.',
    },
    raiga_heavens_answer: {
      name: 'Heaven\'s Answer', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 2,
      // the pain converter: the HP he lost last enemy phase, plus anything he has paid since, becomes damage. Hurt cards played first count,
      // so Blood and Thunder into this is a plan. Block wins fights but starves it: let a hit through on purpose
      fx: [zap({ base: 10, per: 'damageTaken', cap: 26 })],
      up: { fx: [zap({ base: 12, per: 'damageTaken', cap: 30 })] },
      kw: [], slots: ['red', 'any'], art: { m: 'thunder_fist', c: 'moon', hero: true },
      flavor: 'Whatever you throw at him, the sky returns to sender.',
    },
    raiga_mountain_vow: {
      name: 'Mountain Vow', hero: 'raiga', type: 'skill', rarity: 'rare', cost: 2,
      // the lower he is, the sturdier: Block for every missing HP. A wall exactly when he needs one, and a reason to pay HP first
      fx: [block({ base: 4, per: 'missingHp', cap: 18 })],
      up: { fx: [block({ base: 6, per: 'missingHp', cap: 22 })] },
      kw: [], slots: ['blue', 'any'], art: { m: 'torii', c: 'ink' },
      flavor: 'A mountain does not count its storms. It only stands.',
    },
    raiga_deafening_thunderclap: {
      name: 'Deafening Thunderclap', hero: 'raiga', type: 'skill', rarity: 'rare', cost: 3, locked: true,
      // the turn stops: everything that can be Stunned skips its next action (bosses cannot, and an elite only once). One per fight
      fx: [zap(5, { tgt: 'all' }), stun(1, 'all')],
      up: { cost: 2 },
      kw: ['exhaust'], slots: ['red', 'any'], art: { m: 'bell', c: 'violet' },
      flavor: 'For one breath, the whole world forgets what it was doing.',
    },
    raiga_storms_eye: {
      name: 'Storm\'s Eye', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2,
      // the Charge engine: three now, and every blow he takes pays double (Storm Born and this each give one, twice a turn)
      fx: [charge(3), { op: 'draw', n: 1 }, hook('onDamaged', [charge(1)], { limit: 2 })],
      up: { fx: [charge(4), { op: 'draw', n: 1 }, hook('onDamaged', [charge(2)], { limit: 2 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'eye', c: 'azure' },
      flavor: 'In the quiet centre of the tempest, someone is smiling.',
    },
    raiga_thornstorm: {
      name: 'Thornstorm', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2,
      // Thorns stop being a passive: every turn they fire at the whole line. Row Thorns count, so the front row starts it at 3. It braces him at once too: a power
      // that does nothing on the turn it is played lost to every cheap card in a three round fight
      fx: [block(5), thorns(1), hook('turnStart', [dmg({ per: 'status', s: 'thorns', cap: 8 }, { tgt: 'all' })])],
      up: { fx: [block(7), thorns(2), hook('turnStart', [dmg({ per: 'status', s: 'thorns', cap: 9 }, { tgt: 'all' })])] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'thorns', c: 'violet' },
      flavor: 'The thorns were a gift. The storm was a bonus.',
    },
    raiga_storm_taiko: {
      name: 'Storm Taiko', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2, locked: true,
      // a rhythm engine: every third card he plays, of any kind, thunder hits the line and he charges. Cheap cards keep the beat
      fx: [hook('onPlay', [dmg(2, { tgt: 'all' }), charge(1)], { every: 3 })],
      up: { fx: [hook('onPlay', [dmg(3, { tgt: 'all' }), charge(1)], { every: 3 })] },
      kw: [], slots: ['gold', 'any'], art: { m: 'sun', c: 'crimson' },
      flavor: 'One beat for courage, one for fear, one for the sky.',
    },
  });
})();
