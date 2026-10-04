// Echowake: Suzu, the Moon Miko: her complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Tokens: none. No card here uses the `add` op, so none is defined.
//
// THE FANTASY. A shrine maiden who keeps the tale from fraying. She is the best partner anyone can have and, given
// time, a fortress that walks. Her hero passive Moonlit Rite gives 1 Ward at the start of every turn; her rows give the
// FRONT +1 Block on her cards and Thorns 2, the BACK Regen 2 (DATA.heroes.suzu.rows). She has no damage bonus in either row, so
// her damage comes from scaling: debuffs on the target, Thorns, Block, Ward. Ward is the resource: a slow, steady bank
// (one a turn for free, more from her prayers) that big rites spend. The design promise is "patient": every Ward spender that
// wants a full bank is a `retain` card, so she can wait for the right turn, and the strongest cards (Shrine Grounds, Waxing
// Moon, Lunar Domain) get better the longer a fight runs.
//
// THREE PLANS, each with engines and finishers, and bridges between them:
//   SANCTUARY       Block for both heroes, healing, Ward cashed in for big protection, a revive net. A slow fortress.
//     engines   Barrier, Moon Veil, Waxing Moon (the front hero's Block grows with the turn number), Omamori, Prayer Wall (Ward
//               to Block), Renewal Rite (Ward to healing), Sacred Stream (Block left at the end of your turn becomes healing),
//               Shrine Grounds (a Block for both every turn, from banked Ward)
//     safety    Purifying Foxfire (burns an enemy, cleanses both heroes), Guardian Kami (revives the first hero to fall)
//     finisher  Komainu Roar: all the Block you built becomes damage to every enemy (the Block stays)
//     bridge    Guardian's Reply turns the FRONT hero's Block into damage (Suzu's own, or her partner's from the back row)
//   THORNS & TAUNT  make Suzu the wall the enemy breaks itself on. Thorns hit even when the blow is fully Blocked.
//     engines   Tolling Bell and Stone Lion (Block plus Taunt plus Thorns), Ring of Thorns (a Thorn a turn), Kagura Step (an extra swap
//               into the front row, where the Thorns are), Swaying Bells (every turn's first swap pays Ward and Block)
//     payoffs   Briar Lash (damage per Thorns), Yata Mirror (doubles the Thorns you have)
//   TALISMANS       control and debuff-scaled damage: Weak, Vulnerable, Frail, Mark, and the rare Stun.
//     engines   Ofuda (every strike Marks), Paper Seal (two debuffs for free), Binding Seal, Silencing Seal (Ward buys a Stun),
//               Moonbeam and Gohei Sweep (chip damage that also Marks or weakens), Trailing Charms (any Attack, from either
//               hero, leaves a Mark), Lunar Domain (the moon phase: every 2nd turn Weak and Vulnerable on every enemy)
//     finishers Banishing Seal and Moonlit Verdict (damage per debuff on the target), Ofuda Barrage (X hits), Thousand Ofuda
//     Mark counts as a debuff for the "per debuff" cards, so the starter strike already feeds the plan.
//   Ward itself has makers (Moon Prayer, Saisen, Prayer Vigil, Omamori+, Hamaya Shot from the back row, a Verdict kill, Swaying
//   Bells) and spenders (Prayer Wall, Renewal Rite, Silencing Seal, Hamaya Shot) so it never sits dead in the bank for long.
//
// TWO ROWS. The back row is home (Regen 2, safe), the front row is where the wall stands (Thorns 2, +1 Block on her cards).
// Kagura Step swaps rows with the `swap` op (it does NOT spend the free swap) and pays out for the row she lands in.
// Tolling Bell, Hamaya Shot and Guardian's Reply also read her row; Moon Veil and Waxing Moon Block whoever stands in front.
//
// THE PARTNER. Nobody knows who stands beside Suzu, so every ally effect works with anyone: Block and healing for both
// heroes, Might for the ally (Blessed Blade), Mark and Vulnerable on the enemy (a hit from either hero cashes them in), and
// three hooks that use `filter.hero: 'any'` (Trailing Charms, Guardian Kami, Swaying Bells) so a partner's plays, falls and
// swaps feed her. Kagura Blessing upgrades cards of either hero. NOTE FOR data_text.js: it prints Trailing Charms as "whenever
// you play an Attack", which understates it (it also fires for the ally); the effect is what is designed. Nothing here reads or
// grants a resource only one partner owns, except Suzu's own Ward.
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * A Ward spender reads its Ward BEFORE consuming it (`consume` runs after `n` and `hits` are evaluated), and `V.upTo`
//    caps what is counted while `consume.upTo` caps what is spent. Every spender here uses the same number for both.
//  * Taunt is a duration: Taunt 1 lasts this enemy phase, Taunt 2 two. It only redirects attacks aimed at the back, at a random
//    or at the lowest hero, never `front` or `both` attacks (4.2).
//  * Thorns are an intensity and permanent for the combat. Row Thorns are tracked separately (`rowSt`), so gaining Thorns from
//    a card and then swapping to the back row removes only the 2 the row gave.
//  * `turnEnd` hooks run BEFORE the enemy phase, so the "this turn only" idiom (CONTENT_SPEC 3.1) is right for Might but
//    would cancel Thorns before they were ever hit (no card here gives temporary Thorns), and Sacred Stream heals while
//    the Block it reads is still standing guard.
//  * Vulnerable and Weak that Suzu applies in the player phase decrement at the end of that round: Vulnerable 1 covers this
//    turn's hits and Weak 1 the next enemy action; 2 lasts one round longer.
//  * `every: 2` counts triggers from the moment the power was played, so Lunar Domain first fires on the 2nd turn after it is played.
//  * Hook damage and hook Block have no row bonus, so nothing here puts a red or blue slot on a card whose only effect is a hook
//    (a gem's flat damage, Block and heal never reach hook ops): powers carry gold and green slots.
//  * Statuses are cleared when a combat ends, so a kill that ends the fight pays out nothing that lives in a status.
//
// Numbers are checked by tests/rogue_book_cards_suzu.test.mjs (value per Energy bands, documented there).
(() => {
  // small builders keep the card table readable
  const st = (s, n, tgt) => (tgt ? { op: 'status', s, n, tgt } : { op: 'status', s, n });
  const ward = (n) => st('ward', n, 'self');
  const thorns = (n) => st('thorns', n, 'self');
  const taunt = (n) => st('taunt', n, 'self');
  const mark = (n, tgt) => st('mark', n, tgt);
  const weak = (n, tgt) => st('weak', n, tgt);
  const vuln = (n, tgt) => st('vulnerable', n, tgt);
  const frail = (n, tgt) => st('frail', n, tgt);
  const block = (n, tgt, extra) => Object.assign({ op: 'block', n }, tgt ? { tgt } : null, extra);
  const heal = (n, tgt, extra) => Object.assign({ op: 'heal', n, tgt }, extra);
  const dmg = (n, extra) => Object.assign({ op: 'dmg', n }, extra);
  const holy = (n, extra) => dmg(n, Object.assign({ el: 'holy' }, extra));                // moonlight and paper: presentation only
  const hook = (on, fx, extra) => Object.assign({ op: 'hook', on, fx }, extra);
  const when = (cond, then, other) => (other ? { op: 'cond', if: cond, then, else: other } : { op: 'cond', if: cond, then });
  const spend = (upTo) => ({ s: 'ward', upTo });
  const perWard = (base, mul, upTo) => ({ base, per: 'status', s: 'ward', mul, upTo });

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    suzu_ofuda: {
      name: 'Ofuda', hero: 'suzu', type: 'attack', rarity: 'starter', cost: 1,
      // every talisman that lands leaves a Mark: the next hit on that enemy, from EITHER hero, deals 3 more
      fx: [holy(5), mark(1)],
      up: { fx: [holy(7), mark(1)] },
      kw: [], slots: ['red'], art: { m: 'talisman', c: 'moon', hero: true },
      flavor: 'A paper prayer, thrown with conviction.',
    },
    suzu_barrier: {
      name: 'Barrier', hero: 'suzu', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(3, 'both')],
      up: { fx: [block(5, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'azure' },
      flavor: 'Thin as paper. Stronger than it has any right to be.',
    },
    suzu_moon_prayer: {
      name: 'Moon Prayer', hero: 'suzu', type: 'skill', rarity: 'starter', cost: 1,
      fx: [ward(2), heal(2, 'both')],
      up: { fx: [ward(3), heal(2, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'moon', c: 'moon' },
      flavor: 'Every night she asks the moon to watch over them. It always says yes.',
    },

    // ------------------------------------------------------------------ commons: attacks
    suzu_banishing_seal: {
      name: 'Banishing Seal', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // the Talisman payoff: every debuff on the target (Mark counts) is worth 3 damage
      fx: [holy({ base: 2, per: 'debuffs', mul: 3 })],
      up: { fx: [holy({ base: 3, per: 'debuffs', mul: 4 })] },
      kw: [], slots: ['red'], art: { m: 'sigil', c: 'violet', hero: true },
      flavor: 'Names have power. So does taking one away.',
    },
    suzu_briar_lash: {
      name: 'Briar Lash', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // the Thorns payoff: front row (Thorns 2) it hits for 9, and every Thorns card makes it worse for the enemy
      fx: [dmg({ base: 3, per: 'status', s: 'thorns', mul: 3, upTo: 6 })],
      up: { fx: [dmg({ base: 4, per: 'status', s: 'thorns', mul: 4, upTo: 6 })] },
      kw: [], slots: ['red'], art: { m: 'thorns', c: 'jade' },
      flavor: 'The shrine grounds keep thorns for those who forget to bow.',
    },
    suzu_hamaya_shot: {
      name: 'Hamaya Shot', hero: 'suzu', type: 'attack', rarity: 'common', cost: 2,
      // Ward to damage, and a home-row discount: from the back row the shot hands one Ward back
      fx: [holy(perWard(10, 2, 3), { consume: spend(3) }), when({ row: 'back' }, [ward(1)])],
      up: { fx: [holy(perWard(12, 2, 3), { consume: spend(3) }), when({ row: 'back' }, [ward(1)])] },
      kw: [], slots: ['red'], art: { m: 'arrow', c: 'crimson', hero: true },
    },
    suzu_moonbeam: {
      name: 'Moonbeam', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // chip damage on the whole line, and the light settles on the weakest one: the follow-up hit that kills it lands +3
      fx: [holy(3, { tgt: 'all' }), mark(1, 'lowest')],
      up: { fx: [holy(4, { tgt: 'all' }), mark(1, 'lowest')] },
      kw: [], slots: ['red'], art: { m: 'crescent', c: 'moon' },
      flavor: 'The moon does not choose sides. It only shows you where to look.',
    },

    // ------------------------------------------------------------------ commons: skills
    suzu_moon_veil: {
      name: 'Moon Veil', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // whoever stands in front gets the Block, so it is right in either row
      fx: [block(7, 'front')],
      up: { fx: [block(10, 'front')] },
      kw: [], slots: ['blue'], art: { m: 'lotus', c: 'indigo' },
      flavor: 'A veil of moonlight, thin as breath. Blades hesitate.',
    },
    suzu_omamori: {
      name: 'Omamori', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      fx: [heal(4, 'both')],
      up: { fx: [heal(5, 'both'), ward(1)] },
      kw: [], slots: ['blue'], art: { m: 'heal_light', c: 'jade' },
      flavor: 'A little charm, sewn with a big wish.',
    },
    suzu_prayer_wall: {
      name: 'Prayer Wall', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Ward to Block for both heroes. Retain: hold it until the bank is full
      fx: [block(perWard(2, 2, 3), 'both', { consume: spend(3) })],
      up: { fx: [block(perWard(3, 2, 4), 'both', { consume: spend(4) })] },
      kw: ['retain'], slots: ['blue'], art: { m: 'shield', c: 'azure' },
    },
    suzu_tolling_bell: {
      name: 'Tolling Bell', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Block, and the enemy's back-row, random and weakest-target attacks come to her. Front row also plants a Thorn
      fx: [block(5), taunt(1), when({ row: 'front' }, [thorns(1)])],
      up: { fx: [block(7), taunt(2), when({ row: 'front' }, [thorns(1)])] },
      kw: [], slots: ['blue'], art: { m: 'bell', c: 'gold' },
      flavor: 'One ring, and every eye in the room turns toward her.',
    },
    suzu_paper_seal: {
      name: 'Paper Seal', hero: 'suzu', type: 'skill', rarity: 'common', cost: 0,
      // two debuffs for nothing: a cheap opener for every Talisman payoff (Frail is one more debuff to count)
      fx: [weak(1), frail(1)],
      up: { fx: [weak(2), frail(1)] },
      kw: [], slots: ['green'], art: { m: 'scroll', c: 'ash' },
    },
    suzu_binding_seal: {
      name: 'Binding Seal', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Vulnerable 2 lasts this turn and the next: her partner's best friend
      fx: [vuln(2)],
      up: { fx: [vuln(2), weak(1)] },
      kw: [], slots: ['green'], art: { m: 'web', c: 'violet' },
      flavor: 'Once tied with paper, always tied with paper.',
    },
    suzu_kagura_step: {
      name: 'Kagura Step', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // an extra swap (the swap op leaves the free swap alone) that pays for the row she lands in
      fx: [{ op: 'swap' }, when({ row: 'front' }, [block(6), taunt(1)], [heal(4, 'both')])],
      up: { cost: 0 },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'rose' },
      flavor: 'A sacred dance, and every step is a decision.',
    },
    suzu_blessed_blade: {
      name: 'Blessed Blade', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Might is per hit, so it loves a partner with many hits, and it is good with everyone
      fx: [st('might', 3, 'ally'), hook('turnEnd', [st('might', -3, 'ally')], { once: true })],
      up: { fx: [st('might', 4, 'ally'), hook('turnEnd', [st('might', -4, 'ally')], { once: true })] },
      kw: [], slots: ['gold'], art: { m: 'star', c: 'amber' },
    },
    suzu_saisen: {
      name: 'Saisen', hero: 'suzu', type: 'skill', rarity: 'common', cost: 0,
      fx: [ward(1), { op: 'draw', n: 1 }],
      up: { fx: [ward(2), { op: 'draw', n: 1 }] },
      kw: [], slots: ['green'], art: { m: 'coin', c: 'gold' },
      flavor: 'A coin in the box. The gods notice small things.',
    },
    suzu_waxing_moon: {
      name: 'Waxing Moon', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // the moon phase card: 2 Block per turn number for the front hero, a nudge on turn one and a wall by turn five
      fx: [block({ per: 'turn', mul: 2, cap: 12 }, 'front')],
      up: { fx: [block({ base: 2, per: 'turn', mul: 2, cap: 14 }, 'front')] },
      kw: [], slots: ['blue'], art: { m: 'moon', c: 'indigo' },
      flavor: 'Patience is a kind of power. The moon has plenty.',
    },

    // ------------------------------------------------------------------ uncommons: attacks
    suzu_ofuda_barrage: {
      name: 'Ofuda Barrage', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 'X',
      // X talismans, each a hit, then X Marks for whoever strikes next. The first hit cashes in any Mark already there
      fx: [holy(5, { hits: { per: 'X' } }), mark({ per: 'X' })],
      up: { fx: [holy(6, { hits: { per: 'X' } }), mark({ per: 'X' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'talisman', c: 'indigo' },
    },
    suzu_gohei_sweep: {
      name: 'Gohei Sweep', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 2,
      fx: [holy(5, { tgt: 'all' }), weak(1, 'all')],
      up: { fx: [holy(7, { tgt: 'all' }), weak(1, 'all')] },
      kw: [], slots: ['red'], art: { m: 'wind', c: 'teal', hero: true },
    },
    suzu_guardians_reply: {
      name: 'Guardian\'s Reply', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 1,
      // the front hero's Block becomes damage, whoever that is: her own from the front row, her partner's from the back
      fx: [when({ row: 'front' }, [dmg({ base: 3, per: 'block' })], [dmg({ base: 3, per: 'block', who: 'ally' })])],
      up: { fx: [when({ row: 'front' }, [dmg({ base: 5, per: 'block' })], [dmg({ base: 5, per: 'block', who: 'ally' })])] },
      kw: [], slots: ['red', 'gold'], art: { m: 'quake', c: 'amber' },
    },
    suzu_purifying_foxfire: {
      name: 'Purifying Foxfire', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 2,
      // burns the enemy and the curse off both heroes
      fx: [dmg(8, { el: 'fire' }), { op: 'removeStatus', s: 'debuffs', tgt: 'both' }],
      up: { fx: [dmg(11, { el: 'fire' }), { op: 'removeStatus', s: 'debuffs', tgt: 'both' }] },
      kw: [], slots: ['red', 'gold'], art: { m: 'fox', c: 'crimson' }, locked: true,
      flavor: 'The fox lends a flame. It asks only that you not look too closely.',
    },

    // ------------------------------------------------------------------ uncommons: skills
    suzu_renewal_rite: {
      name: 'Renewal Rite', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 1,
      // Ward to healing for both heroes: the big rite of the Sanctuary plan
      fx: [heal(perWard(0, 2, 3), 'both', { consume: spend(3) })],
      up: { fx: [heal(perWard(2, 2, 3), 'both', { consume: spend(3) })] },
      kw: ['retain'], slots: ['blue', 'green'], art: { m: 'lotus', c: 'jade' },
    },
    suzu_silencing_seal: {
      name: 'Silencing Seal', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 1,
      // Ward buys a Stun (bosses shrug it off, elites resist a second one), otherwise it is a plain Weak
      fx: [when({ status: { s: 'ward', gte: 2 } }, [{ op: 'removeStatus', s: 'ward', n: 2, tgt: 'self' }, st('stun', 1)], [weak(1)])],
      up: { fx: [when({ status: { s: 'ward', gte: 1 } }, [{ op: 'removeStatus', s: 'ward', n: 1, tgt: 'self' }, st('stun', 1)], [weak(1)])] },
      kw: ['retain'], slots: ['gold', 'green'], art: { m: 'mask', c: 'ash' },
      flavor: 'Some things are best left unsaid. Permanently.',
    },
    suzu_prayer_vigil: {
      name: 'Prayer Vigil', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 0,
      // choose what to keep: hold the Ward spenders and the finisher for next turn
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'retain', optional: true }, ward(1)],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'retain', optional: true }, ward(2)] },
      kw: [], slots: ['green'], art: { m: 'lantern', c: 'amber' }, locked: true,
      flavor: 'She keeps the lamp lit. Someone always comes back for it.',
    },
    suzu_stone_lion: {
      name: 'Stone Lion', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 2,
      // the Thorns and Taunt plan in one card: a big wall that draws the hits and bites back
      fx: [block(10), taunt(2), thorns(1)],
      up: { fx: [block(13), taunt(2), thorns(2)] },
      kw: [], slots: ['blue', 'gold'], art: { m: 'tiger', c: 'ash' },
      flavor: 'The komainu never sleep. They only pretend, to be polite.',
    },

    // ------------------------------------------------------------------ uncommons: powers
    suzu_ring_of_thorns: {
      name: 'Ring of Thorns', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // play it early: the upgrade is Innate for exactly that reason
      fx: [hook('turnStart', [thorns(1)])],
      up: { kw: ['innate'] },
      kw: [], slots: ['gold', 'green'], art: { m: 'thorns', c: 'crimson' },
      flavor: 'Rope, paper, and one very sharp intention.',
    },
    suzu_sacred_stream: {
      name: 'Sacred Stream', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // Block into healing: turnEnd runs BEFORE the enemy phase, so the Block still stands guard while it mends both heroes
      fx: [hook('turnEnd', [heal({ per: 'block', cap: 3 }, 'both')])],
      up: { fx: [hook('turnEnd', [heal({ per: 'block', cap: 5 }, 'both')])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'koi', c: 'azure' },
      flavor: 'The water blesses whatever the shield could not carry.',
    },
    suzu_swaying_bells: {
      name: 'Swaying Bells', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // the row dance pays: the first swap each turn (free or paid, a card's too) gives Ward and Block. `hero: 'any'` because the
      // engine reports the hero who stepped FORWARD, so without it the bells would ring only when Suzu steps to the front
      fx: [hook('onSwap', [ward(1), block(2, 'both')], { filter: { hero: 'any' }, limit: 1 })],
      up: { fx: [hook('onSwap', [ward(2), block(2, 'both')], { filter: { hero: 'any' }, limit: 1 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'bell', c: 'violet' },
      flavor: 'Every step she takes rings, and every ring means she is where she should be.',
    },
    suzu_trailing_charms: {
      name: 'Trailing Charms', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // the partner engine: an Attack from EITHER hero leaves a Mark on the same target, so the next hit lands +3
      fx: [hook('onPlay', [mark(1)], { filter: { type: 'attack', hero: 'any' } })],
      up: { kw: ['innate'] },
      kw: [], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'moon' }, locked: true,
      flavor: 'Her charms cling to every blade, not just her own.',
    },

    // ------------------------------------------------------------------ rares
    suzu_moonlit_verdict: {
      name: 'Moonlit Verdict', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 2,
      // the Talisman finisher: six per debuff (five counted), and a kill pays back a Ward for the next rite
      fx: [holy({ per: 'debuffs', mul: 6, upTo: 5 }), when({ lastKill: true }, [ward(1)])],
      up: { fx: [holy({ per: 'debuffs', mul: 8, upTo: 5 }), when({ lastKill: true }, [ward(1)])] },
      kw: [], slots: ['red', 'any'], art: { m: 'eye', c: 'moon', hero: true },
      flavor: 'Guilty, said the moon, and the moon does not lie.',
    },
    suzu_komainu_roar: {
      name: 'Komainu Roar', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 2,
      // the Sanctuary finisher: the fortress you built becomes damage to everyone, and the Block stays where it is
      fx: [dmg({ per: 'block', cap: 16 }, { tgt: 'all' })],
      // the upgrade also drops Exhaust: a built fortress can roar again next turn
      up: { fx: [dmg({ per: 'block', cap: 20 }, { tgt: 'all' })], kw: [] },
      kw: ['exhaust'], slots: ['red', 'green'], art: { m: 'quake', c: 'crimson' },
      flavor: 'The stone lions were only ever waiting for permission.',
    },
    suzu_thousand_ofuda: {
      name: 'Thousand Ofuda', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 3,
      // a storm of paper: damage and Mark on every enemy, so the whole party's next hits land harder
      fx: [holy(9, { tgt: 'all' }), mark(2, 'all')],
      up: { fx: [holy(12, { tgt: 'all' }), mark(3, 'all')] },
      kw: [], slots: ['red', 'any'], art: { m: 'sword_rain', c: 'moon', hero: true }, locked: true,
      flavor: 'She threw a thousand prayers. Not one landed wrong.',
    },
    suzu_kagura_blessing: {
      name: 'Kagura Blessing', hero: 'suzu', type: 'skill', rarity: 'rare', cost: 1,
      // upgrades cards of EITHER hero until the combat ends
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'upgrade' }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'upgrade' }] },
      kw: ['exhaust'], slots: ['green', 'gold'], art: { m: 'crane', c: 'moon' }, locked: true,
      flavor: 'The sacred dance has no wrong steps, only unfinished ones.',
    },
    suzu_yata_mirror: {
      name: 'Yata Mirror', hero: 'suzu', type: 'skill', rarity: 'rare', cost: 2,
      // doubles the Thorns she has (row Thorns included) and draws the enemy to her: the Thorns plan's finisher
      fx: [st('thorns', { per: 'status', s: 'thorns', cap: 8 }, 'self'), taunt(2)],
      up: { fx: [st('thorns', { per: 'status', s: 'thorns', cap: 12 }, 'self'), taunt(3)] },
      kw: ['exhaust'], slots: ['green', 'gold'], art: { m: 'mirror', c: 'gold' },
      flavor: 'It shows you what you are. The enemy rarely enjoys it.',
    },
    suzu_guardian_kami: {
      name: 'Guardian Kami', hero: 'suzu', type: 'power', rarity: 'rare', cost: 2,
      // the net that lets you play boldly: the first hero to fall (either one) stands back up
      fx: [hook('onHeroDown', [{ op: 'revive', pct: 0.5 }, block(10, 'both')], { filter: { hero: 'any' }, once: true })],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'indigo' }, locked: true,
      flavor: 'Something old watches the shrine. It owes her a favour.',
    },
    suzu_shrine_grounds: {
      name: 'Shrine Grounds', hero: 'suzu', type: 'power', rarity: 'rare', cost: 2,
      // Ward becomes a standing wall: bank it, or spend it, but never waste it. The passive keeps the bank growing
      fx: [hook('turnStart', [block({ per: 'status', s: 'ward', upTo: 5 }, 'both')])],
      up: { fx: [hook('turnStart', [block({ per: 'status', s: 'ward', upTo: 7 }, 'both')])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'torii', c: 'gold' },
      flavor: 'Where she stands, the ground remembers to be holy.',
    },
    suzu_lunar_domain: {
      name: 'Lunar Domain', hero: 'suzu', type: 'power', rarity: 'rare', cost: 3,
      // the moon phase power: every second turn (the full moon) every enemy is Weak for two rounds, so Weak never lapses,
      // and Vulnerable for this one. It lands on the 2nd turn after it is played, then the 4th, and so on
      fx: [hook('turnStart', [weak(2, 'all'), vuln(1, 'all')], { every: 2 })],
      up: { cost: 2 },
      kw: [], slots: ['gold', 'green'], art: { m: 'moon', c: 'ink' },
      flavor: 'Under a full moon, nobody is quite sure of themselves.',
    },
  });
})();
