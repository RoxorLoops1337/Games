// Hocus Vocus: Andy (id `raiga`), The Thunder Bass: his complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Tokens: none. No card here uses the `add` op, so none is defined. Card ids keep their old internal names (raiga_jab and so on);
// only the display names and flavours speak Hocus Vocus (bible 4, HV_HEROES 2.4).
//
// THE FANTASY. A relaxed bass player whose low end you feel before you hear it: the bigger the hit he takes, the louder the bass line
// he plays back. He stands in the lead (Feedback 2 and 3 starting Block, DATA.heroes.raiga.rows) and his passive Bass Face (id
// `storm_born`) gives him 1 Rumble for each of the first two enemy hits he takes per round. In the backing spot he swings +1 damage
// on every hit, which is why his multi-hit cards like it there. Rumble is a banked resource that never decays: sinks read it, spend
// it, or refund Breath for it. The cards are written so that HP is a resource too: he pays HP for power (`hurt`) and cashes pain in.
//
//   LOW-END THUNDER  Rumble into multi-hit and area thunder.
//     builders   Thunder Thumb (the signature, doubly so in the backing spot), String Pop, Crank It, Over Here, Shuffle Step (the
//                backing-spot Rumble trick), Lock In (either hero's Attacks), Unbothered (a big pile of Block becomes Rumble),
//                Triplet Feel (every 3rd card), Calm Centre
//     sinks      Walking Bass (a random hit per Rumble), Rolling Low End (scales with Rumble, keeps it), The Lowest Note (a 3 cost
//                note that refunds Breath for Rumble), Thunder From Below (every enemy, spends the bank)
//   HIT ME HARDER  Feedback, damage when hit, and hurting himself for power. RawClaw owns plain Block plus Spotlight and Jasmin owns
//                  Block into damage, so Andy's version is PAIN: the damage he took is what his cards spend.
//     engines    Fret Buzz and Twin Amps (Feedback), Bass Trap (Starstruck whoever hits him next), Got Your Number (Tag the
//                attacker), Sweat and Thunder and Over Here (HP for Volume and Rumble), Big Shoulders (his wounds shield the ally)
//     payoffs    Play It Back (per hit taken), Octave Down (the damage he took, up to 26), Dig Deep (double damage under half HP),
//                Bedrock (Block for every missing HP), Speaker Quake (Feedback fires at the whole line every turn)
//   BASS BRAWLER   Starstruck, Sizzle, Tag and big single hits, with real combos.
//     setup      Jaw Dropper and Bass Trap (Starstruck), Fuzz Pedal and Overdrive (Sizzle, and Overdrive doubles it), Floor Shaker
//                (Tag on the whole line)
//     payoffs    Drop D (26 damage to a Starstruck target, so play a Starstruck first), Loop Pedal (a flurry that also shields), The
//                Lowest Note, Bass Drop (Starstruck everything that can be Starstruck)
//   Bridges: Tag makes every multi-hit Low-End Thunder card hit harder (each hit spends one Tag for +3); a Bass Trap Starstruck lasts
//   until the enemy tries to act again, so the Starstruck attacker is still Starstruck on Andy's own turn for Drop D; hurt cards feed
//   every pain payoff at once; Floor Shaker into Walking Bass or Rolling Low End.
//
// TWO SPOTS. Lead: Feedback 2, start Block 3, no damage bonus. Backing: +1 damage on every hit and nobody hits him, so his Rumble
// must come from cards. Cards that read the spot: Thunder Thumb and Crank It (one more Rumble in the backing spot, where Bass Face is
// silent), Rolling Low End (backing: more damage to all), Palm Mute (lead: more Block), and Shuffle Step, which swaps and pays by the
// spot he lands in. The `swap` op does not use the free swap, so lead -> Shuffle Step (backing: Rumble and a card, +1 damage on the
// next hits) -> the free swap home costs no Breath at all.
//
// THE PARTNER. Nobody knows who stands beside Andy, so every ally effect works with anyone: Block for both (Hold That Note), Feedback
// for both (Twin Amps), Volume for both (Bass Boost), his missing HP turned into the ally's Block (Big Shoulders), Unbothered (Block
// for the ally), and Lock In, which pays Andy a Rumble when EITHER hero plays an Attack, once a turn (`filter.hero: 'any'`).
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * `hurt` cannot take him below 1 HP, and it does NOT fire Bass Face (only enemy hits do), so every hurt card also says what it
//    grants. It does count as HP lost for `damageTaken`, so hurt then Octave Down is a real combo. `hitsTaken` counts only hits that
//    removed HP.
//  * Bass Face (`onDamaged`, limit 2) is per round: the limit resets when his turn begins, and the enemy phase that follows counts as
//    the same turn. Card hooks that also use `onDamaged` have their own limits.
//  * Hook damage has no attacker: no Volume, no spot bonus, no Feedback, and gem damage bonuses never reach it. Triplet Feel, Bass Trap
//    and Speaker Quake therefore use flat numbers. `enemy` in an onDamaged hook is the attacker. Status ops in hooks land on that enemy too.
//  * A Starstruck on an enemy is not decremented at round end, only consumed when it skips: Starstruck applied to an attacker in the
//    enemy phase is still there in the player phase. Headliners are always immune and a Rival is immune for 2 rounds after being
//    starstruck (an `immune` event).
//  * Text honesty (data_text.js): a `hits` value prints only as a plain number, X, or "for each ...", so Walking Bass uses hits with
//    no base, no mul and no cap. Caps live on `dmg` values, whose text prints "(up to N)" and "(max N)".
//  * Temporary Volume is the CONTENT_SPEC 3.1 idiom: gain it, then a `once` turnEnd hook takes it back.
//  * `cardsPlayed` reads the count BEFORE the card being played; a card's own hook never fires for its own play.
//
// Numbers are checked by tests/hocus_vocus_cards_raiga.test.mjs (value per Breath bands, documented there).
(() => {
  // small builders keep the card table readable
  const dmg = (n, extra) => Object.assign({ op: 'dmg', n }, extra);
  const zap = (n, extra) => dmg(n, Object.assign({ el: 'lightning' }, extra));     // presentation: thunder VFX (the lightning element) on any motif
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
  // "+N Volume this turn": gain it now, give it back at the end of the turn
  const mightThisTurn = (n, tgt) => [
    { op: 'status', s: 'might', n, tgt },
    hook('turnEnd', [{ op: 'status', s: 'might', n: -n, tgt }], { once: true }),
  ];

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    raiga_jab: {
      name: 'Slap Bass', hero: 'raiga', type: 'attack', rarity: 'starter', cost: 1,
      fx: [zap(6)],
      up: { fx: [zap(8)] },
      kw: [], slots: ['red'], art: { m: 'thunder_fist', c: 'amber', hero: true },
      flavor: 'Just a knock at the door. The low end answers later.',
    },
    raiga_brace: {
      name: 'Amp Stack', hero: 'raiga', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(5)],
      up: { fx: [block(8)] },
      kw: [], slots: ['blue'], art: { m: 'shield', c: 'ash' },
      flavor: 'Three amps high and humming. He leans on it like a sofa.',
    },
    raiga_static_fist: {
      name: 'Thunder Thumb', hero: 'raiga', type: 'attack', rarity: 'starter', cost: 1,
      // the signature: it scales with the Rumble he holds (and keeps it), then adds one. In the backing spot, where nobody hits him and Bass Face is
      // silent, it builds twice as hard, so a backing-spot Andy is never starved
      fx: [zap(perCharge(2, { base: 3, upTo: 3 })), charge(1), when({ row: 'back' }, [charge(1)])],
      up: { fx: [zap(perCharge(2, { base: 4, upTo: 4 })), charge(1), when({ row: 'back' }, [charge(1)])] },
      kw: [], slots: ['red'], art: { m: 'lightning', c: 'gold', hero: true },
    },

    // ------------------------------------------------------------------ commons: attacks
    raiga_hard_knock: {
      name: 'String Pop', hero: 'raiga', type: 'attack', rarity: 'common', cost: 0,
      // the cheap trick: free damage and a Rumble, paid in HP. The HP also feeds every pain payoff
      fx: [dmg(4), hurt(1), charge(1)],
      up: { fx: [dmg(6), hurt(1), charge(1)] },
      kw: [], slots: ['red'], art: { m: 'fist', c: 'crimson', hero: true },
      flavor: 'Ow. Worth it.',
    },
    raiga_chain_lightning: {
      name: 'Walking Bass', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // a sink that does nothing without Rumble and a lot with a bank. Random targets, one hit per Rumble, so Tag, Volume and the backing-spot
      // bonus land on every hit. It empties the bank, so it is a burst, not a habit. 3 per hit on purpose: the 0 cost builders feed it at
      // about 1 HP per Rumble, and the rare finisher (Thunder From Below, 3 plus 4 per Rumble to EVERY enemy) must stay the efficient way to cash a bank
      fx: [zap(3, { hits: { per: 'status', s: 'charge' }, tgt: 'random' }), spendCharge()],
      up: { fx: [zap(4, { hits: { per: 'status', s: 'charge' }, tgt: 'random' }), spendCharge()] },
      kw: [], slots: ['red'], art: { m: 'chain_lightning', c: 'azure' },
      flavor: 'It never picks a favourite. It just walks over to everyone.',
    },
    raiga_rolling_thunder: {
      name: 'Rolling Low End', hero: 'raiga', type: 'attack', rarity: 'common', cost: 2,
      // the area attack that grows with the bank without spending it. Backing spot: two more to every enemy on top of the +1 per hit
      fx: [zap(perCharge(1, { base: 5, upTo: 3 }), { tgt: 'all' }), when({ row: 'back' }, [zap(2, { tgt: 'all' })])],
      up: { fx: [zap(perCharge(1, { base: 7, upTo: 3 }), { tgt: 'all' }), when({ row: 'back' }, [zap(2, { tgt: 'all' })])] },
      kw: [], slots: ['red'], art: { m: 'tornado', c: 'indigo' },
      flavor: 'You feel it long before you hear it.',
    },
    raiga_iron_palm: {
      name: 'Palm Mute', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // the attack that guards: a solid building block for the whole game. It shields more in the lead, where the blows land
      fx: [dmg(6), block(2), when({ row: 'front' }, [block(2)])],
      up: { fx: [dmg(8), block(3), when({ row: 'front' }, [block(2)])] },
      kw: [], slots: ['blue'], art: { m: 'thrust', c: 'moon' },
    },
    raiga_stilling_palm: {
      name: 'Jaw Dropper', hero: 'raiga', type: 'attack', rarity: 'common', cost: 2,
      // the Starstruck that opens the Bass Brawler plan: whatever it hits skips its next action, and is still Starstruck for a Drop D
      fx: [dmg(7), stun(1)],
      up: { fx: [dmg(10), stun(1)] },
      kw: [], slots: ['red'], art: { m: 'fist', c: 'jade', hero: true },
      flavor: 'It is not the loudest note. It is just the right one.',
    },
    raiga_repay_in_kind: {
      name: 'Play It Back', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // pays three for every blow that got through last enemy phase. A blow that Block swallowed does not count: be brave, not reckless
      fx: [zap({ base: 2, per: 'hitsTaken', mul: 3, cap: 11 })],
      up: { fx: [zap({ base: 3, per: 'hitsTaken', mul: 4, cap: 15 })] },
      kw: [], slots: ['red'], art: { m: 'mirror', c: 'violet' },
      flavor: 'He remembers every kindness, and every bump.',
    },
    raiga_ember_fist: {
      name: 'Fuzz Pedal', hero: 'raiga', type: 'attack', rarity: 'common', cost: 1,
      // the Sizzle opener: a little damage now and a heat that keeps working. Overdrive doubles what is sizzling
      fx: [dmg(3), burn(4)],
      up: { fx: [dmg(4), burn(6)] },
      kw: [], slots: ['gold'], art: { m: 'flame_orb', c: 'amber' },
    },

    // ------------------------------------------------------------------ commons: skills
    raiga_bramble_stance: {
      name: 'Fret Buzz', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      fx: [block(5), thorns(1)],
      up: { fx: [block(6), thorns(2)] },
      kw: [], slots: ['blue'], art: { m: 'thorns', c: 'jade' },
    },
    raiga_draw_lightning: {
      name: 'Crank It', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // free Rumble for a little HP. In the backing spot nothing hits him, so Bass Face is silent there and the card gives one more
      fx: [hurt(2), charge(2), when({ row: 'back' }, [charge(1)])],
      up: { fx: [hurt(2), charge(3), when({ row: 'back' }, [charge(1)])] },
      kw: [], slots: ['green'], art: { m: 'lightning', c: 'violet' },
      flavor: 'A little ringing in the ears is a fair price for a lot of low end.',
    },
    raiga_temple_gong: {
      name: 'Hold That Note', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // Block for both heroes, whoever the partner is, and a deep breath: one card stays in hand for next turn
      fx: [block(4, 'both'), { op: 'pick', from: 'hand', n: 1, then: 'retain' }],
      up: { fx: [block(6, 'both'), { op: 'pick', from: 'hand', n: 1, then: 'retain' }] },
      kw: [], slots: ['blue'], art: { m: 'bell', c: 'gold' },
      flavor: 'One long low note. Somehow everyone feels a bit braver.',
    },
    raiga_static_field: {
      name: 'Floor Shaker', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // Tag on the whole line: every hit, from either hero, spends one Tag for +3, so multi-hit and area cards love it. It cost 1 for
      // Tag 2 and was a dead draw for a hero without many hits to spend it on (-0.9 in simulation): free, it is a rider on any turn
      fx: [mark(1, 'all')],
      up: { fx: [mark(2, 'all')] },
      kw: [], slots: ['gold'], art: { m: 'eye', c: 'crimson' },
    },
    raiga_still_water: {
      name: 'Change Strings', hero: 'raiga', type: 'skill', rarity: 'common', cost: 0,
      // a free filter: throw away what you cannot use and draw the same number back
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'discard', optional: true }, { op: 'draw', n: { per: 'picked' } }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'discard', optional: true }, { op: 'draw', n: { per: 'picked' } }] },
      kw: [], slots: ['green'], art: { m: 'wave', c: 'teal' },
      flavor: 'Old strings out, new strings in, and the tea is still warm.',
    },
    raiga_rousing_roar: {
      name: 'Bass Boost', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // a team turn for one Breath: both heroes hit harder, and Volume works for any partner's Attacks
      fx: mightThisTurn(2, 'both'),
      up: { cost: 0 },
      kw: [], slots: ['gold'], art: { m: 'dragon', c: 'amber' },
      flavor: 'Not a roar. A big, warm invitation to turn it up.',
    },
    raiga_shared_burden: {
      name: 'Big Shoulders', hero: 'raiga', type: 'skill', rarity: 'common', cost: 1,
      // the more hurt he is, the more he shields his partner: the wounds he chose to take become the ally's armour
      fx: [block({ per: 'missingHp', cap: 8 }, 'ally')],
      up: { fx: [block({ per: 'missingHp', cap: 12 }, 'ally')] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'ash' },
      flavor: 'Heavy? He did not notice. He was busy carrying it.',
    },

    // ------------------------------------------------------------------ uncommons: attacks
    raiga_sundering_blow: {
      name: 'Drop D', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 2,
      // clunky and enormous: the smash for a Starstruck target. Hold lets it wait in hand until a Starstruck lands (Jaw Dropper, Bass Trap)
      fx: [when({ targetStatus: { s: 'stun' } }, [dmg(26)], [dmg(10)])],
      up: { fx: [when({ targetStatus: { s: 'stun' } }, [dmg(32)], [dmg(12)])] },
      kw: ['retain'], slots: ['red', 'green'], art: { m: 'quake', c: 'crimson' },
      flavor: 'Tune down. Breathe out. Let the floor do the rest.',
    },
    raiga_cornered_tiger: {
      name: 'Dig Deep', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 1,
      // hurt cards, a bad round and Sweat and Thunder all push him under half HP, where this hits twice as hard
      fx: [dmg(7), when({ hpPct: { lt: 0.5 } }, [dmg(8)])],
      up: { fx: [dmg(9), when({ hpPct: { lt: 0.5 } }, [dmg(9)])] },
      kw: [], slots: ['red'], art: { m: 'tiger', c: 'amber', hero: true },
      flavor: 'He is calmest just before he is loudest.',
    },
    raiga_drumroll: {
      name: 'Loop Pedal', hero: 'raiga', type: 'attack', rarity: 'uncommon', cost: 'X',
      // the flurry on ONE target that also guards him: every pass of the riff lands a hit and raises a little wall. Tag, Volume and Starstruck-bonus friendly
      fx: [{ op: 'repeat', n: { per: 'X' }, do: [dmg(4), block(2)] }],
      up: { fx: [{ op: 'repeat', n: { per: 'X' }, do: [dmg(5), block(3)] }] },
      kw: [], slots: ['red', 'blue'], art: { m: 'thunder_fist', c: 'violet', hero: true },
      flavor: 'Record, play, repeat. He keeps the groove, the pedal keeps count.',
    },

    // ------------------------------------------------------------------ uncommons: skills
    raiga_lightning_rod: {
      name: 'Twin Amps', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // permanent Feedback for BOTH heroes: the partner stops being a soft target, whoever the partner is
      fx: [thorns(2, 'both')],
      up: { fx: [thorns(3, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'lightning', c: 'azure' },
    },
    raiga_blood_and_thunder: {
      name: 'Sweat and Thunder', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // the deal: HP for permanent Volume and a Rumble. One shot per fight, and the HP feeds every pain payoff
      fx: [hurt(6), { op: 'status', s: 'might', n: 2, tgt: 'self' }, charge(1)],
      up: { fx: [hurt(4), { op: 'status', s: 'might', n: 2, tgt: 'self' }, charge(2)] },
      kw: ['exhaust'], slots: ['blue'], art: { m: 'fire', c: 'crimson' },
      flavor: 'Some grooves are paid for in blisters.',
    },
    raiga_waiting_storm: {
      name: 'Bass Trap', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1, locked: true,
      // a trap that fires on the next blow, even a fully Blocked one: the attacker is Starstruck, and a Starstruck on an enemy survives until it tries to
      // act again, so it is still Starstruck on Andy's own turn: Drop D's dream
      fx: [block(4), hook('onDamaged', [stun(1)], { once: true })],
      up: { fx: [block(6), hook('onDamaged', [stun(1)], { once: true })] },
      kw: [], slots: ['blue', 'green'], art: { m: 'wind', c: 'ash' },
      flavor: 'The trap is patient. So is the bass.',
    },
    raiga_flashpoint: {
      name: 'Overdrive', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1, locked: true,
      // doubles the Sizzle on the target (up to 12): Fuzz Pedal, then this, then this again is a real heat. Nothing to double, nothing happens
      fx: [{ op: 'status', s: 'burn', n: { per: 'status', s: 'burn', who: 'target', cap: 12 }, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: [], slots: ['green', 'gold'], art: { m: 'fire', c: 'amber' },
      flavor: 'If it is sizzling, he can make it sizzle twice.',
    },
    raiga_tiger_and_crane: {
      name: 'Shuffle Step', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 0,
      // a free swap that pays by the spot he lands in: in the lead he plants his feet, at the back he noodles a little riff and builds Rumble.
      // The swap op does not use the free swap: lead -> backing spot -> free swap home costs no Breath, and the hits in between get the backing-spot +1
      fx: [{ op: 'swap' }, when({ row: 'front' }, [block(5)], [charge(1), { op: 'draw', n: 1 }])],
      up: { fx: [{ op: 'swap' }, when({ row: 'front' }, [block(7)], [charge(2), { op: 'draw', n: 1 }])] },
      kw: [], slots: ['green'], art: { m: 'crane', c: 'moon' },
      flavor: 'Two moods, one bass.',
    },
    raiga_bring_it_on: {
      name: 'Over Here', hero: 'raiga', type: 'skill', rarity: 'uncommon', cost: 1,
      // the ally-protecting Spotlight, paid in HP: the blows aimed at the backing spot, at a random hero or at the weakest hero find him instead,
      // a few of them will build Rumble, and the ally gets a little Block for the trouble
      fx: [hurt(3), charge(3), { op: 'status', s: 'taunt', n: 2, tgt: 'self' }, block(3, 'ally')],
      up: { fx: [hurt(2), charge(3), { op: 'status', s: 'taunt', n: 3, tgt: 'self' }, block(4, 'ally')] },
      kw: [], slots: ['blue'], art: { m: 'mask', c: 'crimson' },
      flavor: 'He says it so kindly that they all fall for it.',
    },

    // ------------------------------------------------------------------ uncommons: powers
    raiga_living_conduit: {
      name: 'Lock In', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 1,
      // an Opener: it should be running from turn one. hero:'any' is how a card rewards a partner nobody can name in advance
      fx: [hook('onPlay', [charge(1)], { filter: { type: 'attack', hero: 'any' }, limit: 1 })],
      up: { fx: [hook('onPlay', [charge(1)], { filter: { type: 'attack', hero: 'any' }, limit: 2 })] },
      kw: ['innate'], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'teal' },
      flavor: 'Bass rule number one: listen to the beat.',
    },
    raiga_long_memory: {
      name: 'Got Your Number', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 2,
      // every blow he takes Tags the one who threw it, so his next hits (and the partner's) land +3 harder. Blocked blows count
      fx: [hook('onDamaged', [mark(1)], { limit: 2 })],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'green'], art: { m: 'eye', c: 'ink' },
      flavor: 'He forgives everyone. He also never forgets a bass line.',
    },
    raiga_unshaken_mind: {
      name: 'Unbothered', hero: 'raiga', type: 'power', rarity: 'uncommon', cost: 1, locked: true,
      // the Block plan pays out: a wall at the end of the turn becomes Rumble, and a little of it goes to the partner. Lead start Block 3
      // plus Amp Stack already gets close
      fx: [hook('turnEnd', [when({ block: { gte: 10 } }, [charge(2), block(3, 'ally')])])],
      up: { fx: [hook('turnEnd', [when({ block: { gte: 8 } }, [charge(2), block(3, 'ally')])])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'lotus', c: 'moon' },
      flavor: 'The fight can knock all it likes. He is busy with the groove.',
    },

    // ------------------------------------------------------------------ rares
    raiga_raijin_hammer: {
      name: 'The Lowest Note', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 3,
      // the 3 cost note that costs less per Rumble: with the bank it refunds two of its three Breath, so it is really a 1 cost card
      // every other turn. Hold: wait in hand until the bank is ready
      fx: [zap(22), when({ status: { s: 'charge', gte: 4 } }, [spendCharge(4), { op: 'energy', n: 2 }])],
      up: { fx: [zap(26), when({ status: { s: 'charge', gte: 3 } }, [spendCharge(3), { op: 'energy', n: 2 }])] },
      kw: ['retain'], slots: ['red', 'gold'], art: { m: 'quake', c: 'gold' },
      flavor: 'So low that only the floor can hear it. The floor is impressed.',
    },
    raiga_thousand_thunders: {
      name: 'Thunder From Below', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 3,
      // the Low-End Thunder finisher: bank Rumble for a few turns, then every enemy takes the whole bank. It paid 4 a Rumble up to 6 Rumble, a bank a four round fight
      // never reached (-1.0 in simulation), so it pays 3 flat and 4 a Rumble up to 5 (4 flat and 5 a Rumble upgraded) and a bigger bank stays for the next time
      fx: [zap(perCharge(4, { base: 3, upTo: 5 }), { tgt: 'all', consume: { s: 'charge', upTo: 5 } })],
      up: { fx: [zap(perCharge(5, { base: 4, upTo: 5 }), { tgt: 'all', consume: { s: 'charge', upTo: 5 } })] },
      kw: ['retain'], slots: ['red', 'green'], art: { m: 'meteor', c: 'violet' },
      flavor: 'The floor has been saving this up for a while.',
    },
    raiga_heavens_answer: {
      name: 'Octave Down', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 2,
      // the pain converter: the HP he lost last enemy phase, plus anything he has paid since, becomes damage. Hurt cards played first count,
      // so Sweat and Thunder into this is a plan. Block wins fights but starves it: let a hit through on purpose
      fx: [zap({ base: 10, per: 'damageTaken', cap: 26 })],
      up: { fx: [zap({ base: 12, per: 'damageTaken', cap: 30 })] },
      kw: [], slots: ['red', 'any'], art: { m: 'thunder_fist', c: 'moon', hero: true },
      flavor: 'Whatever you throw at him comes back an octave lower.',
    },
    raiga_mountain_vow: {
      name: 'Bedrock', hero: 'raiga', type: 'skill', rarity: 'rare', cost: 2,
      // the lower he is, the sturdier: Block for every missing HP. A wall exactly when he needs one, and a reason to pay HP first
      fx: [block({ base: 4, per: 'missingHp', cap: 18 })],
      up: { fx: [block({ base: 6, per: 'missingHp', cap: 22 })] },
      kw: [], slots: ['blue', 'any'], art: { m: 'torii', c: 'ink' },
      flavor: 'The bass is the floor everyone else dances on.',
    },
    raiga_deafening_thunderclap: {
      name: 'Bass Drop', hero: 'raiga', type: 'skill', rarity: 'rare', cost: 3, locked: true,
      // the turn stops: everything that can be Starstruck skips its next action (Headliners cannot, and a Rival only once). One per fight
      fx: [zap(5, { tgt: 'all' }), stun(1, 'all')],
      up: { cost: 2 },
      kw: ['exhaust'], slots: ['red', 'any'], art: { m: 'bell', c: 'violet' },
      flavor: 'For one moment, all of the Soundlands forget what they were doing.',
    },
    raiga_storms_eye: {
      name: 'Calm Centre', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2,
      // the Rumble engine: three now, and every blow he takes pays double (Bass Face and this each give one, twice a turn)
      fx: [charge(3), { op: 'draw', n: 1 }, hook('onDamaged', [charge(1)], { limit: 2 })],
      up: { fx: [charge(4), { op: 'draw', n: 1 }, hook('onDamaged', [charge(2)], { limit: 2 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'eye', c: 'azure' },
      flavor: 'In the loud middle of everything, someone is smiling.',
    },
    raiga_thornstorm: {
      name: 'Speaker Quake', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2,
      // Feedback stops being a passive: every turn it fires at the whole line. Spot Feedback counts, so the lead starts it at 3. It braces him at once too: a power
      // that does nothing on the turn it is played lost to every cheap card in a three round fight
      fx: [block(5), thorns(1), hook('turnStart', [dmg({ per: 'status', s: 'thorns', cap: 8 }, { tgt: 'all' })])],
      up: { fx: [block(7), thorns(2), hook('turnStart', [dmg({ per: 'status', s: 'thorns', cap: 9 }, { tgt: 'all' })])] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'thorns', c: 'violet' },
      flavor: 'The speakers were a gift. The shaking was a bonus.',
    },
    raiga_storm_taiko: {
      name: 'Triplet Feel', hero: 'raiga', type: 'power', rarity: 'rare', cost: 2, locked: true,
      // a rhythm engine: every third card he plays, of any kind, thunder hits the line and he builds Rumble. Cheap cards keep the beat
      fx: [hook('onPlay', [dmg(2, { tgt: 'all' }), charge(1)], { every: 3 })],
      up: { fx: [hook('onPlay', [dmg(3, { tgt: 'all' }), charge(1)], { every: 3 })] },
      kw: [], slots: ['gold', 'any'], art: { m: 'sun', c: 'crimson' },
      flavor: 'One for courage, one for fun, and one for the floor.',
    },
  });
})();
