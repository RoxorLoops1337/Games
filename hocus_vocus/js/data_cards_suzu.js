// Hocus Vocus: RawClaw (id `suzu`), The Sound Alchemist: his complete card set (3 starters, 14 commons, 12 uncommons, 8 rares).
//
// One IIFE, no top-level names; it only calls DATA.add('cards', {...}). Card text is generated from `fx`, never typed.
// Tokens: none. No card here uses the `add` op, so none is defined. Card ids keep their old internal names (suzu_ofuda and so on);
// only the display names and flavours speak Hocus Vocus (bible 4, HV_HEROES 2.3).
//
// THE FANTASY. The duo's producer: calm, always at the mixing desk, a good friend and a beatboxer too. He is the best partner anyone
// can have and, given time, a fortress of sound that walks. His hero passive Always Rolling (id `moonlit_rite`) gives 1 Reverb at the
// start of every turn; his spots give the LEAD +1 Block on his cards and Feedback 2, the BACKING Warm Tea 2 (DATA.heroes.suzu.rows).
// He has no damage bonus in either spot, so his damage comes from scaling: effects on the target, Feedback, Block, Reverb. Reverb is
// the resource: a slow, steady bank (one a turn for free, more from his effects) that big mixes spend. The design promise is
// "patient": every Reverb spender that wants a full bank is a Hold card, so he can wait for the right turn, and the strongest cards
// (Acoustic Foam, Long Sustain, Mixing Desk) get better the longer a fight runs.
//
// THREE PLANS (HV_HEROES 1.3), each with engines and finishers, and bridges between them:
//   THE ROOM        Block for both heroes, healing, Reverb cashed in for big protection, a voice net. A slow fortress of sound.
//     engines   Reverb Wall, Noise Gate, Long Sustain (the lead hero's Block grows with the turn number), Chill Mix, Stadium Reverb
//               (Reverb to Block), Tape Warmth (Reverb to healing), Comfort Noise (Block left at the end of your turn becomes
//               healing), Acoustic Foam (a Block for both every turn, from banked Reverb)
//     safety    Undo (hits the enemy, cleanses both heroes), Voice Memo (brings back the first hero to lose their voice)
//     finisher  Wall of Sound: all the Block you built becomes damage to every enemy (the Block stays)
//     bridge    Bounce Back turns the LEAD hero's Block into damage (RawClaw's own, or his partner's from the backing spot)
//   SQUEAL BACK     make RawClaw the wall the enemy breaks itself on. Feedback hits even when the blow is fully Blocked.
//     engines   Solo Button and Stage Monitors (Block plus Spotlight plus Feedback), Howlround (a Feedback a turn), Crossfade (an extra
//               swap into the lead, where the Feedback is), Ping Pong Delay (every turn's first swap pays Reverb and Block)
//     payoffs   Distortion (damage per Feedback), Double Tracking (doubles the Feedback you have)
//   EFFECTS RACK    control and debuff-scaled damage: Muffled, Exposed, Wobbly, Tag, and the rare Starstruck.
//     engines   Synth Zap (every zap leaves a Tag), Low Pass (two effects for free), Dry Signal, Tape Stop (Reverb buys a Starstruck),
//               Filter Sweep and Phaser (chip damage that also tags or muffles), Slapback (any Attack, from either hero, leaves a
//               Tag), Mixing Desk (the long mix: every 2nd turn Muffled and Exposed on every enemy)
//     finishers Sidechain Pump and Final Mixdown (damage per debuff on the target), Finger Drumming (X hits), Arpeggiator
//     Tag counts as a debuff for the "per debuff" cards, so the starter strike already feeds the plan.
//   Reverb itself has makers (Warm Pad, Preset, Save the Session, Chill Mix+, Laser Synth from the backing spot, a Final Mixdown that
//   wins the enemy over, Ping Pong Delay) and spenders (Stadium Reverb, Tape Warmth, Tape Stop, Laser Synth) so it never sits dead in
//   the bank for long.
//
// TWO SPOTS. The backing spot is home (Warm Tea 2, safe), the lead spot is where the wall stands (Feedback 2, +1 Block on his cards).
// Crossfade swaps spots with the `swap` op (it does NOT spend the free swap) and pays out for the spot he lands in. Solo Button, Laser
// Synth and Bounce Back also read his spot; Noise Gate and Long Sustain Block whoever stands in the lead.
//
// THE PARTNER. Nobody knows who stands beside RawClaw, so every ally effect works with anyone: Block and healing for both heroes,
// Volume for the ally (Push the Fader), Tag and Exposed on the enemy (a hit from either hero cashes them in), and three hooks that
// use `filter.hero: 'any'` (Slapback, Voice Memo, Ping Pong Delay) so a partner's plays, lost voices and swaps feed him. Mastering
// upgrades cards of either hero. NOTE FOR data_text.js: it prints Slapback as "whenever you play an Attack", which understates it
// (it also fires for the ally); the effect is what is designed. Nothing here reads or grants a resource only one partner owns,
// except RawClaw's own Reverb.
//
// ENGINE NOTES (DESIGN 4.2 to 4.4), the rules these cards lean on:
//  * A Reverb spender reads its Reverb BEFORE consuming it (`consume` runs after `n` and `hits` are evaluated), and `V.upTo`
//    caps what is counted while `consume.upTo` caps what is spent. Every spender here uses the same number for both.
//  * Spotlight is a duration: Spotlight 1 lasts this enemy phase, Spotlight 2 two. It only redirects attacks aimed at the backing
//    spot, at a random or at the lowest hero, never `front` or `both` attacks (4.2).
//  * Feedback is an intensity and permanent for the combat. Spot Feedback is tracked separately (`rowSt`), so gaining Feedback from
//    a card and then swapping to the backing spot removes only the 2 the spot gave.
//  * `turnEnd` hooks run BEFORE the enemy phase, so the "this turn only" idiom (CONTENT_SPEC 3.1) is right for Volume but
//    would cancel Feedback before it was ever hit (no card here gives temporary Feedback), and Comfort Noise heals while
//    the Block it reads is still standing guard.
//  * Exposed and Muffled that RawClaw applies in the player phase decrement at the end of that round: Exposed 1 covers this
//    turn's hits and Muffled 1 the next enemy action; 2 lasts one round longer.
//  * `every: 2` counts triggers from the moment the power was played, so Mixing Desk first fires on the 2nd turn after it is played.
//  * Hook damage and hook Block have no spot bonus, so nothing here puts a pink or blue slot on a card whose only effect is a hook
//    (a gem's flat damage, Block and heal never reach hook ops): powers carry gold and green slots.
//  * Statuses are cleared when a combat ends, so a win that ends the fight pays out nothing that lives in a status.
//
// Numbers are checked by tests/hocus_vocus_cards_suzu.test.mjs (value per Breath bands, documented there).
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
  const holy = (n, extra) => dmg(n, Object.assign({ el: 'holy' }, extra));                // a bright synth glow (the holy element): presentation only
  const hook = (on, fx, extra) => Object.assign({ op: 'hook', on, fx }, extra);
  const when = (cond, then, other) => (other ? { op: 'cond', if: cond, then, else: other } : { op: 'cond', if: cond, then });
  const spend = (upTo) => ({ s: 'ward', upTo });
  const perWard = (base, mul, upTo) => ({ base, per: 'status', s: 'ward', mul, upTo });

  DATA.add('cards', {
    // ------------------------------------------------------------------ starters
    suzu_ofuda: {
      name: 'Synth Zap', hero: 'suzu', type: 'attack', rarity: 'starter', cost: 1,
      // every zap that lands leaves a Tag: the next hit on that enemy, from EITHER hero, deals 3 more
      fx: [holy(5), mark(1)],
      up: { fx: [holy(7), mark(1)] },
      kw: [], slots: ['red'], art: { m: 'talisman', c: 'moon', hero: true },
      flavor: 'Pew. Not his fanciest patch. Still his favourite.',
    },
    suzu_barrier: {
      name: 'Reverb Wall', hero: 'suzu', type: 'skill', rarity: 'starter', cost: 1,
      fx: [block(3, 'both')],
      up: { fx: [block(5, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'azure' },
      flavor: 'Mostly air. Very well arranged air.',
    },
    suzu_moon_prayer: {
      name: 'Warm Pad', hero: 'suzu', type: 'skill', rarity: 'starter', cost: 1,
      fx: [ward(2), heal(2, 'both')],
      up: { fx: [ward(3), heal(2, 'both')] },
      kw: [], slots: ['blue'], art: { m: 'moon', c: 'moon' },
      flavor: 'The sound of a warm hug, played on a synth.',
    },

    // ------------------------------------------------------------------ commons: attacks
    suzu_banishing_seal: {
      name: 'Sidechain Pump', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // the Effects Rack payoff: every debuff on the target (Tag counts) is worth 3 damage
      fx: [holy({ base: 2, per: 'debuffs', mul: 3 })],
      up: { fx: [holy({ base: 3, per: 'debuffs', mul: 4 })] },
      kw: [], slots: ['red'], art: { m: 'sigil', c: 'violet', hero: true },
    },
    suzu_briar_lash: {
      name: 'Distortion', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // the Feedback payoff: in the lead (Feedback 2) it hits for 9, and every Feedback card makes it worse for the enemy
      fx: [dmg({ base: 3, per: 'status', s: 'thorns', mul: 3, upTo: 6 })],
      up: { fx: [dmg({ base: 4, per: 'status', s: 'thorns', mul: 4, upTo: 6 })] },
      kw: [], slots: ['red'], art: { m: 'thorns', c: 'jade' },
      flavor: 'He saves the crunchy setting for special occasions.',
    },
    suzu_hamaya_shot: {
      name: 'Laser Synth', hero: 'suzu', type: 'attack', rarity: 'common', cost: 2,
      // Reverb to damage, and a home-spot discount: from the backing spot the shot hands one Reverb back
      fx: [holy(perWard(10, 2, 3), { consume: spend(3) }), when({ row: 'back' }, [ward(1)])],
      up: { fx: [holy(perWard(12, 2, 3), { consume: spend(3) }), when({ row: 'back' }, [ward(1)])] },
      kw: [], slots: ['red'], art: { m: 'arrow', c: 'crimson', hero: true },
    },
    suzu_moonbeam: {
      name: 'Filter Sweep', hero: 'suzu', type: 'attack', rarity: 'common', cost: 1,
      // chip damage on the whole line, and the sweep tags the weakest one: the follow-up hit that wins it over lands +3
      fx: [holy(3, { tgt: 'all' }), mark(1, 'lowest')],
      up: { fx: [holy(4, { tgt: 'all' }), mark(1, 'lowest')] },
      kw: [], slots: ['red'], art: { m: 'crescent', c: 'moon' },
    },

    // ------------------------------------------------------------------ commons: skills
    suzu_moon_veil: {
      name: 'Noise Gate', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // whoever stands in the lead gets the Block, so it is right in either spot
      fx: [block(7, 'front')],
      up: { fx: [block(10, 'front')] },
      kw: [], slots: ['blue'], art: { m: 'lotus', c: 'indigo' },
      flavor: 'Only the good sounds get through. Everything else waits outside.',
    },
    suzu_omamori: {
      name: 'Chill Mix', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      fx: [heal(4, 'both')],
      up: { fx: [heal(5, 'both'), ward(1)] },
      kw: [], slots: ['blue'], art: { m: 'heal_light', c: 'jade' },
      flavor: 'Beats to rest and recover to. Goat optional.',
    },
    suzu_prayer_wall: {
      name: 'Stadium Reverb', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Reverb to Block for both heroes. Hold: keep it until the bank is full
      fx: [block(perWard(2, 2, 3), 'both', { consume: spend(3) })],
      up: { fx: [block(perWard(3, 2, 4), 'both', { consume: spend(4) })] },
      kw: ['retain'], slots: ['blue'], art: { m: 'shield', c: 'azure' },
    },
    suzu_tolling_bell: {
      name: 'Solo Button', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Block, and the enemy's backing-spot, random and weakest-target attacks come to him. In the lead it also plants a Feedback
      fx: [block(5), taunt(1), when({ row: 'front' }, [thorns(1)])],
      up: { fx: [block(7), taunt(2), when({ row: 'front' }, [thorns(1)])] },
      kw: [], slots: ['blue'], art: { m: 'bell', c: 'gold' },
      flavor: 'One click, and every eye in the room turns to him.',
    },
    suzu_paper_seal: {
      name: 'Low Pass', hero: 'suzu', type: 'skill', rarity: 'common', cost: 0,
      // two debuffs for nothing: a cheap opener for every Effects Rack payoff (Wobbly is one more debuff to count)
      fx: [weak(1), frail(1)],
      up: { fx: [weak(2), frail(1)] },
      kw: [], slots: ['green'], art: { m: 'scroll', c: 'ash' },
      flavor: 'Like singing from inside a wardrobe.',
    },
    suzu_binding_seal: {
      name: 'Dry Signal', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Exposed 2 lasts this turn and the next: his partner's best friend
      fx: [vuln(2)],
      up: { fx: [vuln(2), weak(1)] },
      kw: [], slots: ['green'], art: { m: 'web', c: 'violet' },
      flavor: 'No reverb, no filter, no hiding. Just you.',
    },
    suzu_kagura_step: {
      name: 'Crossfade', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // an extra swap (the swap op leaves the free swap alone) that pays for the spot he lands in
      fx: [{ op: 'swap' }, when({ row: 'front' }, [block(6), taunt(1)], [heal(4, 'both')])],
      up: { cost: 0 },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'rose' },
      flavor: 'Smooth in, smooth out. Nobody hears the join.',
    },
    suzu_blessed_blade: {
      name: 'Push the Fader', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // Volume is per hit, so it loves a partner with many hits, and it is good with everyone
      fx: [st('might', 3, 'ally'), hook('turnEnd', [st('might', -3, 'ally')], { once: true })],
      up: { fx: [st('might', 4, 'ally'), hook('turnEnd', [st('might', -4, 'ally')], { once: true })] },
      kw: [], slots: ['gold'], art: { m: 'star', c: 'amber' },
    },
    suzu_saisen: {
      name: 'Preset', hero: 'suzu', type: 'skill', rarity: 'common', cost: 0,
      fx: [ward(1), { op: 'draw', n: 1 }],
      up: { fx: [ward(2), { op: 'draw', n: 1 }] },
      kw: [], slots: ['green'], art: { m: 'coin', c: 'gold' },
      flavor: 'Preset forty two. It is always preset forty two.',
    },
    suzu_waxing_moon: {
      name: 'Long Sustain', hero: 'suzu', type: 'skill', rarity: 'common', cost: 1,
      // the card that grows with the fight: 2 Block per turn number for the lead hero, a nudge on turn one and a wall by turn five
      fx: [block({ per: 'turn', mul: 2, cap: 12 }, 'front')],
      up: { fx: [block({ base: 2, per: 'turn', mul: 2, cap: 14 }, 'front')] },
      kw: [], slots: ['blue'], art: { m: 'moon', c: 'indigo' },
      flavor: 'Patience is a kind of power. So is a really long sustain.',
    },

    // ------------------------------------------------------------------ uncommons: attacks
    suzu_ofuda_barrage: {
      name: 'Finger Drumming', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 'X',
      // X taps, each a hit, then X Tags for whoever strikes next. The first hit cashes in any Tag already there
      fx: [holy(5, { hits: { per: 'X' } }), mark({ per: 'X' })],
      up: { fx: [holy(6, { hits: { per: 'X' } }), mark({ per: 'X' })] },
      kw: [], slots: ['red', 'green'], art: { m: 'talisman', c: 'indigo' },
    },
    suzu_gohei_sweep: {
      name: 'Phaser', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 2,
      fx: [holy(5, { tgt: 'all' }), weak(1, 'all')],
      up: { fx: [holy(7, { tgt: 'all' }), weak(1, 'all')] },
      kw: [], slots: ['red'], art: { m: 'wind', c: 'teal', hero: true },
    },
    suzu_guardians_reply: {
      name: 'Bounce Back', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 1,
      // the lead hero's Block becomes damage, whoever that is: his own from the lead, his partner's from the backing spot
      fx: [when({ row: 'front' }, [dmg({ base: 3, per: 'block' })], [dmg({ base: 3, per: 'block', who: 'ally' })])],
      up: { fx: [when({ row: 'front' }, [dmg({ base: 5, per: 'block' })], [dmg({ base: 5, per: 'block', who: 'ally' })])] },
      kw: [], slots: ['red', 'gold'], art: { m: 'quake', c: 'amber' },
    },
    suzu_purifying_foxfire: {
      name: 'Undo', hero: 'suzu', type: 'attack', rarity: 'uncommon', cost: 2,
      // hits the enemy and wipes every debuff off both heroes
      fx: [dmg(8, { el: 'fire' }), { op: 'removeStatus', s: 'debuffs', tgt: 'both' }],
      up: { fx: [dmg(11, { el: 'fire' }), { op: 'removeStatus', s: 'debuffs', tgt: 'both' }] },
      kw: [], slots: ['red', 'gold'], art: { m: 'fox', c: 'crimson' }, locked: true,
      flavor: 'If only life had an undo button. In the studio, it does.',
    },

    // ------------------------------------------------------------------ uncommons: skills
    suzu_renewal_rite: {
      name: 'Tape Warmth', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 1,
      // Reverb to healing for both heroes: the big mix of The Room plan
      fx: [heal(perWard(0, 2, 3), 'both', { consume: spend(3) })],
      up: { fx: [heal(perWard(2, 2, 3), 'both', { consume: spend(3) })] },
      kw: ['retain'], slots: ['blue', 'green'], art: { m: 'lotus', c: 'jade' },
    },
    suzu_silencing_seal: {
      name: 'Tape Stop', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 1,
      // Reverb buys a Starstruck (Headliners shrug it off, Rivals resist a second one), otherwise it is a plain Muffled
      fx: [when({ status: { s: 'ward', gte: 2 } }, [{ op: 'removeStatus', s: 'ward', n: 2, tgt: 'self' }, st('stun', 1)], [weak(1)])],
      up: { fx: [when({ status: { s: 'ward', gte: 1 } }, [{ op: 'removeStatus', s: 'ward', n: 1, tgt: 'self' }, st('stun', 1)], [weak(1)])] },
      kw: ['retain'], slots: ['gold', 'green'], art: { m: 'mask', c: 'ash' },
      flavor: 'Some things are best slowed down. All the way down.',
    },
    suzu_prayer_vigil: {
      name: 'Save the Session', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 0,
      // choose what to keep: hold the Reverb spenders and the finisher for next turn
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'retain', optional: true }, ward(1)],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'retain', optional: true }, ward(2)] },
      kw: [], slots: ['green'], art: { m: 'lantern', c: 'amber' }, locked: true,
      flavor: 'He saves every ten seconds. Nobody has ever asked why.',
    },
    suzu_stone_lion: {
      name: 'Stage Monitors', hero: 'suzu', type: 'skill', rarity: 'uncommon', cost: 2,
      // the Squeal Back plan in one card: a big wall that draws the hits and squeals back
      fx: [block(10), taunt(2), thorns(1)],
      up: { fx: [block(13), taunt(2), thorns(2)] },
      kw: [], slots: ['blue', 'gold'], art: { m: 'tiger', c: 'ash' },
      flavor: 'Point the monitors at the problem. That usually helps.',
    },

    // ------------------------------------------------------------------ uncommons: powers
    suzu_ring_of_thorns: {
      name: 'Howlround', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // play it early: the upgrade is an Opener for exactly that reason
      fx: [hook('turnStart', [thorns(1)])],
      up: { kw: ['innate'] },
      kw: [], slots: ['gold', 'green'], art: { m: 'thorns', c: 'crimson' },
      flavor: 'The British word for feedback. It sounds exactly how it sounds.',
    },
    suzu_sacred_stream: {
      name: 'Comfort Noise', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // Block into healing: turnEnd runs BEFORE the enemy phase, so the Block still stands guard while it mends both heroes
      fx: [hook('turnEnd', [heal({ per: 'block', cap: 3 }, 'both')])],
      up: { fx: [hook('turnEnd', [heal({ per: 'block', cap: 5 }, 'both')])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'koi', c: 'azure' },
      flavor: 'Even the hiss between songs can be kind.',
    },
    suzu_swaying_bells: {
      name: 'Ping Pong Delay', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // the spot dance pays: the first swap each turn (free or paid, a card's too) gives Reverb and Block. `hero: 'any'` because the
      // engine reports the hero who stepped FORWARD, so without it the delay would bounce only when RawClaw steps into the lead
      fx: [hook('onSwap', [ward(1), block(2, 'both')], { filter: { hero: 'any' }, limit: 1 })],
      up: { fx: [hook('onSwap', [ward(2), block(2, 'both')], { filter: { hero: 'any' }, limit: 1 })] },
      kw: [], slots: ['gold', 'green'], art: { m: 'bell', c: 'violet' },
      flavor: 'Left, right, left, right. The delay always knows where you are.',
    },
    suzu_trailing_charms: {
      name: 'Slapback', hero: 'suzu', type: 'power', rarity: 'uncommon', cost: 2,
      // the partner engine: an Attack from EITHER hero leaves a Tag on the same target, so the next hit lands +3
      fx: [hook('onPlay', [mark(1)], { filter: { type: 'attack', hero: 'any' } })],
      up: { kw: ['innate'] },
      kw: [], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'moon' }, locked: true,
      flavor: 'Every hit, then the same hit again, a little quieter, a little later.',
    },

    // ------------------------------------------------------------------ rares
    suzu_moonlit_verdict: {
      name: 'Final Mixdown', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 2,
      // the Effects Rack finisher: six per debuff (five counted), and a win pays back a Reverb for the next mix
      fx: [holy({ per: 'debuffs', mul: 6, upTo: 5 }), when({ lastKill: true }, [ward(1)])],
      up: { fx: [holy({ per: 'debuffs', mul: 8, upTo: 5 }), when({ lastKill: true }, [ward(1)])] },
      kw: [], slots: ['red', 'any'], art: { m: 'eye', c: 'moon', hero: true },
      flavor: 'Every effect on you, bounced into one track. Enjoy the playback.',
    },
    suzu_komainu_roar: {
      name: 'Wall of Sound', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 2,
      // The Room finisher: the wall of sound you built becomes damage to everyone, and the Block stays where it is
      fx: [dmg({ per: 'block', cap: 16 }, { tgt: 'all' })],
      // the upgrade also drops Fade: a built wall can fall on the room again next turn
      up: { fx: [dmg({ per: 'block', cap: 20 }, { tgt: 'all' })], kw: [] },
      kw: ['exhaust'], slots: ['red', 'green'], art: { m: 'quake', c: 'crimson' },
      flavor: 'He built it to protect his friends. It also falls over very well.',
    },
    suzu_thousand_ofuda: {
      name: 'Arpeggiator', hero: 'suzu', type: 'attack', rarity: 'rare', cost: 3,
      // a rain of synth notes: damage and Tag on every enemy, so the whole party's next hits land harder
      fx: [holy(9, { tgt: 'all' }), mark(2, 'all')],
      up: { fx: [holy(12, { tgt: 'all' }), mark(3, 'all')] },
      kw: [], slots: ['red', 'any'], art: { m: 'sword_rain', c: 'moon', hero: true }, locked: true,
      flavor: 'He pressed one key. The machine played the other thousand.',
    },
    suzu_kagura_blessing: {
      name: 'Mastering', hero: 'suzu', type: 'skill', rarity: 'rare', cost: 1,
      // upgrades cards of EITHER hero until the combat ends
      fx: [{ op: 'pick', from: 'hand', n: 2, then: 'upgrade' }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, then: 'upgrade' }] },
      kw: ['exhaust'], slots: ['green', 'gold'], art: { m: 'crane', c: 'moon' }, locked: true,
      flavor: 'A little warmer, a little clearer. Not shinier. Never shinier.',
    },
    suzu_yata_mirror: {
      name: 'Double Tracking', hero: 'suzu', type: 'skill', rarity: 'rare', cost: 2,
      // doubles the Feedback he has (spot Feedback included) and draws the enemy to him: the Squeal Back finisher
      fx: [st('thorns', { per: 'status', s: 'thorns', cap: 8 }, 'self'), taunt(2)],
      up: { fx: [st('thorns', { per: 'status', s: 'thorns', cap: 12 }, 'self'), taunt(3)] },
      kw: ['exhaust'], slots: ['green', 'gold'], art: { m: 'mirror', c: 'gold' },
      flavor: 'Twice the squeal, and somehow even more charming.',
    },
    suzu_guardian_kami: {
      name: 'Voice Memo', hero: 'suzu', type: 'power', rarity: 'rare', cost: 2,
      // the net that lets you play boldly: the first hero to lose their voice (either one) gets it back
      fx: [hook('onHeroDown', [{ op: 'revive', pct: 0.5 }, block(10, 'both')], { filter: { hero: 'any' }, once: true })],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'green'], art: { m: 'spirit_orb', c: 'indigo' }, locked: true,
      flavor: 'He kept a voice memo of you laughing. Just in case.',
    },
    suzu_shrine_grounds: {
      name: 'Acoustic Foam', hero: 'suzu', type: 'power', rarity: 'rare', cost: 2,
      // Reverb becomes a standing wall: bank it, or spend it, but never waste it. The passive keeps the bank growing
      fx: [hook('turnStart', [block({ per: 'status', s: 'ward', upTo: 5 }, 'both')])],
      up: { fx: [hook('turnStart', [block({ per: 'status', s: 'ward', upTo: 7 }, 'both')])] },
      kw: [], slots: ['gold', 'green'], art: { m: 'torii', c: 'gold' },
      flavor: 'Where he stands, the room starts to sound better.',
    },
    suzu_lunar_domain: {
      name: 'Mixing Desk', hero: 'suzu', type: 'power', rarity: 'rare', cost: 3,
      // the long mix: every second turn every enemy is Muffled for two rounds, so Muffled never lapses,
      // and Exposed for this one. It lands on the 2nd turn after it is played, then the 4th, and so on
      fx: [hook('turnStart', [weak(2, 'all'), vuln(1, 'all')], { every: 2 })],
      up: { cost: 2 },
      kw: [], slots: ['gold', 'green'], art: { m: 'moon', c: 'ink' },
      flavor: 'He controls the mix. Everyone else just thinks they do.',
    },
  });
})();
