/* SUNBEAM SIEGE champions-mm.js (agent B06)
 * Four champions: 2 Moonwhiskers (moon), 2 Mischief (mischief).
 * Schema: A03 champion card, with A03 9.5 upgradeSlots extended from a/b to a/b/c per RULES.md section 7.
 * Slots unlock at Nights 2, 5, 8. Each slot offers 3 options (a, b, c). Each option is also a PATH:
 * the player's slot 1 pick fixes the path, slots 2 and 3 should offer the same letter (A06 rule, engine may
 * enforce it or let Wanderlust Collar override). The letters always mean the same path within one champion.
 *
 * PATCH FORMAT (all tier patches are ADDITIVE so tiers stack safely; see NEEDS):
 *   statsAdd {power,health}        delta to the champion stats
 *   addEffects {trigger:[effects]} APPENDED to that trigger's list (A03 9.4 "replace" is not used here)
 *   addAura [aura]                 appended to aura list
 *   addActivated [ability]         new free/paid activated ability
 *   setActivated {id:{...}}        shallow merge into an existing activated ability (for example limit)
 *   rules {key:value}              battle rule modifiers, active while this champion is on the board
 *   statusCapAdd {status:n}        raises a status cap for this champion
 *
 * NEEDS (engine agent: these are new, everything else is plain A03 DSL):
 *  Triggers (all fire for ANY cat or pest, triggerSource is the subject; floor-relative targets such as
 *   frontEnemy, allEnemiesOnFloor, otherEnemiesOnFloor resolve on the triggerSource's floor):
 *   onAnyLifeLost (cat lost a Life, fires after the Life is spent so targetLives is the NEW count),
 *   onAnyLifeWouldBeLost (replacement window, effects may `prevent` or `redirectLife`),
 *   onAnyDeath (a cat died, after Life accounting; targetLives is the NEW count, 0 means it is gone),
 *   onAnyEnemyLanded (a pest landed from a Knock, triggerSource is that pest),
 *   onAnyFlapExit (a pest was Knocked out of the Cellar through the cat flap),
 *   onAnyBoxFlattened (a Box was flattened, floor is that Box's floor),
 *   onAnyPestDeath, onEtherealPrevent (damage was prevented by Ethereal; triggerSource is the attacker,
 *   counter preventedDamage is the amount that was prevented).
 *  Effects: spendLives {amount:"all"|n, keep, target} (sets counter livesSpentNow),
 *   moveCard {target, to}, knead {stat, amount, target} (permanent), prevent, redirectLife {to},
 *   attack {target, mult, stayHidden} (free strike), banish (defeat a pest, no Fish),
 *   evict (remove a pest from the battle for good, counts as defeated, bosses and Anchored exempt),
 *   spreadStatus {status, from, to}, fish {amount}, box gets optional `seat:"self"` (cat sits in it).
 *  Status: ethereal (cat status, "the next N hits against this cat deal 0, each hit uses one stack",
 *   default cap 3, persists through the battle, not at Dusk).
 *  Fields: `limit {per:"turn"|"round"|"fight", n, keyed?:"triggerSource"}` on any effect; `filter [checks]`
 *   on any multi-target effect or aura (checked per target); `floorOf:"triggerSource"`.
 *  Activated abilities: `activated:[{id,name,free,limit,targeting,requires,effects}]`.
 *  Aura on enemies: stat "power" with target allEnemiesOnFloor, and stat "damageTaken" (flat bonus at damage
 *   order step 1) with target allEnemies.
 *  Counters: livesSpentFight, livesSpentNow, targetYarn, yarnOnTargetFloor, preventedDamage, selfPower,
 *   boxesOnFloor (A03 AmountExpr, mult may be fractional and the result is floored).
 *  Checks: targetLives, targetPower, targetIsBoss, targetInBox, targetHasStatus:<id>, selfPower, selfLives
 *   (exists), boxesOnFloor.
 *  Effect param floor:"eachFloor" (apply the effect once per floor, for example front pest on every floor).
 *  Targets: allCats, otherEnemiesOnFloor, randomOtherEnemyOnFloor (exclude triggerSource).
 *  Rules keys: crashZoomiesPenalty, crashDrawPenalty, surgeThreshold, surgeZoomies, nipKeptDuringSurge,
 *   crashTurns, maxBoxesPerFloor.
 * BALANCE FLAGS: moon_oswin T3a Cash Out (cap total damage at 150), moon_tuppence T3b (cap at 40 per hit),
 *  mischief_parcel T3a (strike twice, check Hidden spam on all floors).
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  // Small local helper so every option has the same shape.
  function opt(id, path, pathName, name, text, flavor, art, patch) {
    return { id: id, path: path, pathName: pathName, name: name, text: text, flavor: flavor, art: art, patch: patch };
  }
  var L1 = [{ check: 'targetLives', op: '==', value: 1 }];

  /* ============================================================ MOON 1: OSWIN, the lives engine */
  var oswin = {
    id: 'moon_oswin_ledgerpaw',
    name: 'Oswin Ledgerpaw',
    title: 'Auditor of the Ninth Hour',
    type: 'champion', clan: 'moon', rarity: 'legendary', cost: 2, targeting: 'floor',
    stats: { power: 4, health: 18, lives: 9, size: 1 },
    keywords: { innate: true },
    text: 'Innate. Overdraft (free, once per turn): a cat with 2 or more Lives spends a Life. It gains Fluff 3 and you gain 1 Zoomies.',
    catchphrase: 'Let us go over the books.',
    backstory: 'Oswin kept the books at a moonlit pawn shop where the currency was lives. He was let go for being honest about the exchange rate. He is now the only cat in the house who knows exactly how many lives everyone has left, and he will tell you, unprompted, at dinner.',
    flavor: 'Has audited all nine lives. Found irregularities in six.',
    activated: [{
      id: 'overdraft', name: 'Overdraft', free: true, limit: { per: 'turn', n: 1 }, targeting: 'cat',
      requires: [{ check: 'targetLives', op: '>=', value: 2 }],
      effects: [
        { type: 'lives', amount: -1, target: 'chosenCat' },
        { type: 'fluff', amount: 3, target: 'chosenCat' },
        { type: 'zoomies', amount: 1 }
      ]
    }],
    art: { sprite: 'cat_champion_longhair', palette: 'indigo', hint: 'Slate-violet longhair with half-moon spectacles, a tiny brass ledger under one paw, a quill tucked behind one ear.' },
    tags: ['lives', 'spend', 'champion'],
    unlock: 'start',
    upgradeSlots: [
      { slot: 1, unlockNight: 2,
        a: opt('moon_oswin_1a', 'a', 'The Liquidator', 'Liquidation Sale',
          'Whenever any cat spends a Life, deal 3 damage to the front pest on that cat\'s floor.',
          'Everything must go. Starting with the lives.',
          'Red SALE tag tied to the ledger; spectacles gain a gold glint.',
          { addEffects: { onAnyLifeLost: [{ type: 'damage', amount: 3, kind: 'hit', target: 'frontEnemy', floorOf: 'triggerSource' }] } }),
        b: opt('moon_oswin_1b', 'b', 'The Broker', 'Pawn Ticket',
          'Once per turn, a cat that dies and keeps a Life goes to your hand and costs 1 less.',
          'Redeemable at any time. Interest is considerable.',
          'A numbered pawn ticket pinned to his collar.',
          { addEffects: { onAnyDeath: [
            { type: 'moveCard', target: 'triggerSource', to: 'hand', limit: { per: 'turn', n: 1 }, if: [{ check: 'targetLives', op: '>=', value: 1 }] },
            { type: 'reduceCost', amount: 1, duration: 'played', target: 'triggerSource', limit: { per: 'turn', n: 1 }, if: [{ check: 'targetLives', op: '>=', value: 1 }] }
          ] } }),
        c: opt('moon_oswin_1c', 'c', 'The Brinkman', 'Brinkmanship',
          'Cats on exactly 1 Life get +2 more Attack (Cornered becomes +4) and Fluff 2 each turn.',
          'Lives are for spending. He keeps exactly one in reserve.',
          'A single lit candle stub on his ledger; a thin red ring around his moon pendant.',
          { addAura: [{ stat: 'power', amount: 2, target: 'allCats', filter: L1 }],
            addEffects: { onTurnStart: [{ type: 'fluff', amount: 2, target: 'allCats', filter: L1 }] } })
      },
      { slot: 2, unlockNight: 5,
        a: opt('moon_oswin_2a', 'a', 'The Liquidator', 'Going Out of Business',
          'Overdraft can be used twice per turn. Oswin has +1 Power per 2 Lives spent this fight.',
          'Final week. Everything marked down. Nothing refundable.',
          'Ledger overflows with loose receipts; a paper banner reading CLOSING reaches over his shoulder.',
          { setActivated: { overdraft: { limit: { per: 'turn', n: 2 } } },
            addAura: [{ stat: 'power', amount: { base: 0, per: 'livesSpentFight', mult: 0.5 }, target: 'self' }] }),
        b: opt('moon_oswin_2b', 'b', 'The Broker', 'Seance Saucer',
          'Whenever a cat dies and returns to your hand, draw 1 and gain 1 Zoomies (up to twice per turn).',
          'The cat comes back. The saucer stays warm.',
          'A small blue saucer of milk glowing beside him, a faint cat shape in the steam.',
          { addEffects: { onAnyDeath: [
            { type: 'draw', amount: 1, limit: { per: 'turn', n: 2 }, if: [{ check: 'targetLives', op: '>=', value: 1 }] },
            { type: 'zoomies', amount: 1, limit: { per: 'turn', n: 2 }, if: [{ check: 'targetLives', op: '>=', value: 1 }] }
          ] } }),
        c: opt('moon_oswin_2c', 'c', 'The Brinkman', 'Dare to Live',
          'Whenever a cat drops to exactly 1 Life, it gains Frenzy 2 and you draw 1 (up to twice per turn).',
          'Nobody is braver than a cat with an exact count.',
          'His eyes narrow to slits; the candle on the ledger becomes a small steady flame.',
          { addEffects: { onAnyLifeLost: [
            { type: 'applyStatus', status: 'frenzy', amount: 2, target: 'triggerSource', limit: { per: 'turn', n: 2 }, if: L1 },
            { type: 'draw', amount: 1, limit: { per: 'turn', n: 2 }, if: L1 }
          ] } })
      },
      { slot: 3, unlockNight: 8,
        a: opt('moon_oswin_3a', 'a', 'The Liquidator', 'The Final Tally',
          'Cash Out (free, once per fight): every cat on the board spends all its Lives but 1. Deal 5 damage to every pest per Life spent.',
          'He closes the books. The books close back, loudly.',
          'Ledger swollen to a tome, bound in moonlight; a ring of nine spent pawprints glows around him.',
          { addActivated: [{
            id: 'cash_out', name: 'Cash Out', free: true, limit: { per: 'fight', n: 1 }, targeting: 'none',
            effects: [
              { type: 'spendLives', amount: 'all', keep: 1, target: 'allCats' },
              { type: 'damage', amount: { base: 0, per: 'livesSpentNow', mult: 5, max: 150 }, kind: 'hit', target: 'allEnemies' }
            ] }] }),
        b: opt('moon_oswin_3b', 'b', 'The Broker', 'Ledger of Returns',
          'The first cat death each turn costs no Life. Cats that return to your hand cost 0 this turn and gain +1 Power for the run.',
          'Nothing is lost. It is merely carried forward.',
          'A revolving brass door stands behind him with paw prints going in and out; spectral cats queue in the margin.',
          { addEffects: { onAnyDeath: [
            { type: 'lives', amount: 1, target: 'triggerSource', limit: { per: 'turn', n: 1 }, if: [{ check: 'targetLives', op: '>=', value: 1 }] },
            { type: 'reduceCost', amount: 9, duration: 'turn', target: 'triggerSource', if: [{ check: 'targetLives', op: '>=', value: 1 }] },
            { type: 'knead', stat: 'power', amount: 1, target: 'triggerSource', if: [{ check: 'targetLives', op: '>=', value: 1 }] }
          ] } }),
        c: opt('moon_oswin_3c', 'c', 'The Brinkman', 'Bargain at the Brink',
          'Once per cat per fight, a cat that would lose its LAST Life stays with 1 Life and Fluff 10, and Oswin spends a Life instead. Cats at 1 Life gain Claws 2 each turn.',
          'A debt of one life, paid on behalf of someone else, with a receipt.',
          'Oswin stands in front of a cat with one paw raised like a crossing guard; ghostly receipts flutter down.',
          { addEffects: {
            onAnyLifeWouldBeLost: [
              { type: 'saveCat', health: 1, fluff: 10, pay: 1, if: [{ check: 'targetLives', op: '==', value: 1 }, { check: 'selfLives', op: '>=', value: 2 }] }
            ],
            onTurnStart: [{ type: 'applyStatus', status: 'claws', amount: 2, target: 'allCats', filter: L1 }] } })
      }
    ],
    finalForms: {
      A: { id: 'moon_oswin_final_a', path: 'A', name: 'Chief Liquidator', text: 'Final form: +4 Power. Cash Out can be used twice per fight.', patch: { statsAdd: { power: 4 }, setActivated: { cash_out: { limit: { per: 'fight', n: 2 } } } } },
      B: { id: 'moon_oswin_final_b', path: 'B', name: 'Master of Returns', text: 'Final form: whenever a cat returns to your hand, the Sunbeam warms 3.', patch: { addEffects: { onAnyDeath: [{ type: 'warmth', amount: 3, if: [{ check: 'targetLives', op: '>=', value: 1 }] }] } } },
      C: { id: 'moon_oswin_final_c', path: 'C', name: 'Grand Brinkman', text: 'Final form: +10 Health. Cats on 1 Life gain Frenzy 1 each turn.', patch: { statsAdd: { health: 10 }, addEffects: { onTurnStart: [{ type: 'applyStatus', status: 'frenzy', amount: 1, target: 'allCats', filter: L1 }] } } }
    }
  };

  /* ============================================================ MOON 2: TUPPENCE, the ghostly tank */
  var tuppence = {
    id: 'moon_tuppence_mistfur',
    name: 'Lord Tuppence Mistfur',
    title: 'Resident Ghost',
    type: 'champion', clan: 'moon', rarity: 'legendary', cost: 2, targeting: 'floor',
    stats: { power: 3, health: 18, lives: 9, size: 1 },
    keywords: { innate: true },
    text: 'Innate. At the start of each turn, gain Ethereal 1 (max 3). Ethereal: the next hits against this cat deal 0 damage, one stack per hit.',
    catchphrase: 'I am dead, not unavailable.',
    backstory: 'Lord Tuppence has lived in the house since 1887, mostly after the part where he died. He considers himself a long-term resident and the family a short-term tenant. He is polite about the haunting, but firm, and has opinions about the new curtains.',
    flavor: 'Was here first. Technically, was here last as well.',
    effects: { onTurnStart: [{ type: 'applyStatus', status: 'ethereal', amount: 1, target: 'self' }] },
    art: { sprite: 'cat_champion_ghost', palette: 'violet_translucent', hint: 'Pale tuxedo cat in a ruffled Victorian collar, see-through from the hips down, trailing wisps of mist instead of a tail.' },
    tags: ['ethereal', 'tank', 'champion'],
    unlock: 'start',
    upgradeSlots: [
      { slot: 1, unlockNight: 2,
        a: opt('moon_tuppence_1a', 'a', 'The Cold Spot', 'Cold Snap',
          'At the end of each turn, every pest on his floor gains Hiss 2.',
          'The room did not get colder. The pests simply became aware of it.',
          'Frost creeping across the floorboards around his paws; breath visible.',
          { addEffects: { onTurnEnd: [{ type: 'applyStatus', status: 'hiss', amount: 2, target: 'allEnemiesOnFloor' }] } }),
        b: opt('moon_tuppence_1b', 'b', 'The Poltergeist', 'Rattle the Chains',
          'Whenever Ethereal prevents a hit, the attacker takes 3 Shatter.',
          'The chains are decorative. The rattling is a choice.',
          'Rusted chain draped over one shoulder, floating a little above him.',
          { addEffects: { onEtherealPrevent: [{ type: 'damage', amount: 3, kind: 'shatter', target: 'triggerSource' }] } }),
        c: opt('moon_tuppence_1c', 'c', 'The Haunted House', 'Haunted Hall',
          'At the start of each turn, the other cats on his floor gain Ethereal 1.',
          'He lets them borrow the walls. It is a generous haunting.',
          'A faint ring of mist reaching toward neighboring cats.',
          { addEffects: { onTurnStart: [{ type: 'applyStatus', status: 'ethereal', amount: 1, target: 'otherCatsOnFloor' }] } })
      },
      { slot: 2, unlockNight: 5,
        a: opt('moon_tuppence_2a', 'a', 'The Cold Spot', 'Dread Draught',
          'At the end of each turn, the front pest on his floor gains Yarn 1 and Marked 1.',
          'It cannot say why it stopped. It only knows it will not be going further.',
          'Pale blue eyes brighten; a thin cone of cold air points at the front pest.',
          { addEffects: { onTurnEnd: [
            { type: 'applyStatus', status: 'yarn', amount: 1, target: 'frontEnemy' },
            { type: 'applyStatus', status: 'marked', amount: 1, target: 'frontEnemy' }
          ] } }),
        b: opt('moon_tuppence_2b', 'b', 'The Poltergeist', 'Spectral Slam',
          'Whenever Ethereal prevents a hit, the attacker also gains Marked 1 and takes 3 more Shatter.',
          'A teapot crosses the room at head height. Nobody saw who threw it.',
          'A ring of floating crockery orbiting him: teapot, candlestick, one unhappy shoe.',
          { addEffects: { onEtherealPrevent: [
            { type: 'damage', amount: 3, kind: 'shatter', target: 'triggerSource' },
            { type: 'applyStatus', status: 'marked', amount: 1, target: 'triggerSource' }
          ] } }),
        c: opt('moon_tuppence_2c', 'c', 'The Haunted House', 'Draught Excluder',
          '+4 Health. Ethereal can stack to 5. Cats on his floor gain Fluff 3 each turn.',
          'He is a cold draught that keeps other cold draughts out.',
          'Mist thickens into a long velvet curtain draped behind him.',
          { statsAdd: { health: 4 }, statusCapAdd: { ethereal: 2 },
            addEffects: { onTurnStart: [{ type: 'fluff', amount: 3, target: 'allCatsOnFloor' }] } })
      },
      { slot: 3, unlockNight: 8,
        a: opt('moon_tuppence_3a', 'a', 'The Cold Spot', 'Dead Calm',
          'Pests on his floor have -2 Attack and lose 1 more Attack each turn for the fight. A pest reduced to 0 Attack is Banished.',
          'Nothing happens here. Nothing is allowed to. It is extremely tidy.',
          'The whole floor frosted white; icicles on the furniture; pests breathing visible puffs.',
          { addAura: [{ stat: 'power', amount: -2, target: 'allEnemiesOnFloor' }],
            addEffects: { onTurnEnd: [
              { type: 'buff', stat: 'power', amount: -1, duration: 'fight', target: 'allEnemiesOnFloor' },
              { type: 'banish', target: 'allEnemiesOnFloor', filter: [{ check: 'targetPower', op: '<=', value: 0 }, { check: 'targetIsBoss', op: '==', value: false }] }
            ] } }),
        b: opt('moon_tuppence_3b', 'b', 'The Poltergeist', 'The House Remembers',
          'Gain Ethereal 2 per turn. Whenever Ethereal prevents a hit, deal that much damage to every pest.',
          'Every blow lands somewhere. The house simply chooses where.',
          'Tuppence glowing white with the whole room floating around him; windows crack outward.',
          { addEffects: {
            onTurnStart: [{ type: 'applyStatus', status: 'ethereal', amount: 1, target: 'self' }],
            onEtherealPrevent: [{ type: 'damage', amount: { base: 0, per: 'preventedDamage', mult: 1 }, kind: 'hit', target: 'allEnemies' }] } }),
        c: opt('moon_tuppence_3c', 'c', 'The Haunted House', 'Open House',
          'All your cats gain Ethereal 1 each turn. Once per round, when another cat would spend a Life, Tuppence spends one instead.',
          'Every cat in the house is under his protection. Rent is paid in lives. His.',
          'A gothic mansion silhouette rising faintly behind the whole team, lit windows, Tuppence in the door.',
          { addEffects: {
            onTurnStart: [{ type: 'applyStatus', status: 'ethereal', amount: 1, target: 'allCats' }],
            onAnyLifeWouldBeLost: [
              { type: 'redirectLife', to: 'self', limit: { per: 'round', n: 1 }, if: [{ check: 'selfLives', op: '>=', value: 2 }] }
            ] } })
      }
    ],
    finalForms: {
      A: { id: 'moon_tuppence_final_a', path: 'A', name: 'Winter Resident', text: 'Final form: +2 Power. Every pest starts the turn with Hiss 2.', patch: { statsAdd: { power: 2 }, addEffects: { onTurnStart: [{ type: 'applyStatus', status: 'hiss', amount: 2, target: 'allEnemiesOnFloor' }] } } },
      B: { id: 'moon_tuppence_final_b', path: 'B', name: 'Master of the House', text: 'Final form: whenever Ethereal prevents a hit, Tuppence gains Fluff 4.', patch: { addEffects: { onEtherealPrevent: [{ type: 'fluff', amount: 4, target: 'self' }] } } },
      C: { id: 'moon_tuppence_final_c', path: 'C', name: 'Lord of the Manor', text: 'Final form: all your cats heal 3 at the start of each turn.', patch: { addEffects: { onTurnStart: [{ type: 'heal', amount: 3, target: 'allCats' }] } } }
    }
  };

  /* ============================================================ MISCHIEF 1: TUMBLE, Knock It Off */
  var tumble = {
    id: 'mischief_tumble_ledgeworth',
    name: 'Professor Tumble Ledgeworth',
    title: 'Doctor of Gravity (Unaccredited)',
    type: 'champion', clan: 'mischief', rarity: 'legendary', cost: 2, targeting: 'floor',
    stats: { power: 4, health: 16, lives: 9, size: 1 },
    keywords: { innate: true },
    text: 'Innate. Whenever Tumble attacks, Knock 1 the target. Whenever a pest lands from any Knock, Tumble gains 1 Power for the fight (up to 3 per round).',
    catchphrase: 'It was already falling.',
    backstory: 'Tumble taught Introduction to Gravity until the university ran out of mugs. He ran 40,213 trials with a sample size of one cat and a consistent result. His funding was declined. His methods were not, because nobody could stop him.',
    flavor: 'Hypothesis: it will fall. Result: it fell. Funding: denied.',
    effects: {
      onAttack: [{ type: 'knock', amount: 1, target: 'attackTarget' }],
      onAnyEnemyLanded: [{ type: 'buff', stat: 'power', amount: 1, duration: 'fight', target: 'self', limit: { per: 'round', n: 3 } }]
    },
    art: { sprite: 'cat_champion_tuxedo', palette: 'teal_cream', hint: 'Orange and white tuxedo cat in a tweed waistcoat, round glasses, a chalk-stained paw and a mug balanced on the edge of a shelf behind him.' },
    tags: ['knock', 'shatter', 'champion'],
    unlock: 'start',
    upgradeSlots: [
      { slot: 1, unlockNight: 2,
        a: opt('mischief_tumble_1a', 'a', 'The Avalanche', 'Avalanche Theory',
          'Whenever a pest lands from a Knock, the other pests on that floor take 3 more Shatter.',
          'The pile-up is not a side effect. It is the thesis.',
          'Chalkboard behind him now shows a stack of boxes with arrows pointing downward.',
          { addEffects: { onAnyEnemyLanded: [{ type: 'damage', amount: 3, kind: 'shatter', target: 'otherEnemiesOnFloor' }] } }),
        b: opt('mischief_tumble_1b', 'b', 'The Landlord', 'Cat Flap Policy',
          'Pests Knocked out through the cat flap take 6 Shatter and re-enter with Yarn 2.',
          'Please use the flap. It is smaller than it looks and it is closing.',
          'A tiny brass nameplate reading MANAGEMENT hung beside a swinging flap.',
          { addEffects: { onAnyFlapExit: [
            { type: 'damage', amount: 6, kind: 'shatter', target: 'triggerSource' },
            { type: 'applyStatus', status: 'yarn', amount: 2, target: 'triggerSource' }
          ] } }),
        c: opt('mischief_tumble_1c', 'c', 'The Anvil', 'Weighty Matters',
          '+2 Power. When a pest lands from a Knock, Tumble gains 2 Power instead of 1.',
          'He has been eating well. This is a physics matter.',
          'Visibly rounder; waistcoat button straining.',
          { statsAdd: { power: 2 }, addEffects: { onAnyEnemyLanded: [{ type: 'buff', stat: 'power', amount: 1, duration: 'fight', target: 'self', limit: { per: 'round', n: 3 } }] } })
      },
      { slot: 2, unlockNight: 5,
        a: opt('mischief_tumble_2a', 'a', 'The Avalanche', 'Domino Cascade',
          'Whenever a pest lands from a Knock, Knock 1 another random pest on that floor (up to twice per round).',
          'One mug. Then, inevitably, the whole cupboard.',
          'A chain of falling objects trailing behind him: mug, plate, picture frame, vase.',
          { addEffects: { onAnyEnemyLanded: [{ type: 'knock', amount: 1, target: 'randomOtherEnemyOnFloor', limit: { per: 'round', n: 2 } }] } }),
        b: opt('mischief_tumble_2b', 'b', 'The Landlord', 'Open Door Policy',
          'Whenever a pest goes out the cat flap, gain 1 Zoomies, draw 1 and heal the Sunbeam 2 (up to twice per turn).',
          'Each departure is documented, filed and quietly celebrated.',
          'Small brass bell above the flap; a clipboard with a tally of tiny paw marks.',
          { addEffects: { onAnyFlapExit: [
            { type: 'zoomies', amount: 1, limit: { per: 'turn', n: 2 } },
            { type: 'draw', amount: 1, limit: { per: 'turn', n: 2 } },
            { type: 'warmth', amount: 2, limit: { per: 'turn', n: 2 } }
          ] } }),
        c: opt('mischief_tumble_2c', 'c', 'The Anvil', 'Terminal Velocity',
          'Whenever a pest lands from a Knock, Tumble gains Claws 1 (up to 3 per round).',
          'The longer the drop, the sharper the paper he publishes.',
          'Claw marks across the chalkboard; a fresh set of white scratch lines along his front paws.',
          { addEffects: { onAnyEnemyLanded: [{ type: 'applyStatus', status: 'claws', amount: 1, target: 'self', limit: { per: 'round', n: 3 } }] } })
      },
      { slot: 3, unlockNight: 8,
        a: opt('mischief_tumble_3a', 'a', 'The Avalanche', 'The Great Shelf Sweep',
          'Sweep (free, once per turn): Knock 1 every pest on a chosen floor. Pile-ups deal 4 more Shatter.',
          'One paw. Every shelf. The house has never been more honest.',
          'A giant paw swiping across a whole bookcase in the background; books and bric-a-brac mid-air.',
          { addActivated: [{ id: 'sweep', name: 'Sweep the Shelf', free: true, limit: { per: 'turn', n: 1 }, targeting: 'floor',
            effects: [{ type: 'knock', amount: 1, target: 'allEnemiesOnFloor', floor: 'chosenFloor' }] }],
            addEffects: { onAnyEnemyLanded: [{ type: 'damage', amount: 4, kind: 'shatter', target: 'otherEnemiesOnFloor' }] } }),
        b: opt('mischief_tumble_3b', 'b', 'The Landlord', 'Eviction Notice',
          'Pests that exit through the cat flap are Evicted: removed for good and counted as defeated. Gain 2 Fish each. Bosses are exempt.',
          'Final warning, then final notice, then the flap.',
          'A stamped notice pinned to a door, a mortarboard cap on his head, a single suitcase by the flap.',
          { addEffects: { onAnyFlapExit: [
            { type: 'fish', amount: 2, if: [{ check: 'targetIsBoss', op: '==', value: false }] },
            { type: 'evict', target: 'triggerSource', filter: [{ check: 'targetIsBoss', op: '==', value: false }] }
          ] } }),
        c: opt('mischief_tumble_3c', 'c', 'The Anvil', 'Mass Times Acceleration',
          'Whenever a pest lands from a Knock, it takes Shatter equal to Tumble\'s Power. Tumble\'s Knock is +1 at 6 Power and +2 at 12.',
          'His final paper is two words long: Look out.',
          'Enormous and dense, hanging from a thread; shadow on the floor shaped like an anvil.',
          { addEffects: {
            onAnyEnemyLanded: [{ type: 'damage', amount: { base: 0, per: 'selfPower', mult: 1 }, kind: 'shatter', target: 'triggerSource' }],
            onAttack: [
              { type: 'knock', amount: 1, ignoreGrip: true, target: 'attackTarget', if: [{ check: 'selfPower', op: '>=', value: 6 }] },
              { type: 'knock', amount: 1, ignoreGrip: true, target: 'attackTarget', if: [{ check: 'selfPower', op: '>=', value: 12 }] }
            ] } })
      }
    ],
    finalForms: {
      A: { id: 'mischief_tumble_final_a', path: 'A', name: 'Dean of Avalanches', text: 'Final form: +3 Power. Sweep can be used twice per turn.', patch: { statsAdd: { power: 3 }, setActivated: { sweep: { limit: { per: 'turn', n: 2 } } } } },
      B: { id: 'mischief_tumble_final_b', path: 'B', name: 'Landlord Emeritus', text: 'Final form: whenever a pest goes out the cat flap, the Sunbeam warms 3.', patch: { addEffects: { onAnyFlapExit: [{ type: 'warmth', amount: 3 }] } } },
      C: { id: 'mischief_tumble_final_c', path: 'C', name: 'Professor of Mass', text: 'Final form: +4 Power. Landing pests are Dizzy 2.', patch: { statsAdd: { power: 4 }, addEffects: { onAnyEnemyLanded: [{ type: 'applyStatus', status: 'dizzy', amount: 2, target: 'triggerSource' }] } } }
    }
  };

  /* ============================================================ MISCHIEF 2: PARCEL, Boxes / Yarn / Nip */
  var parcel = {
    id: 'mischief_parcel_pennywhistle',
    name: 'Parcel Pennywhistle',
    title: 'Out for Delivery',
    type: 'champion', clan: 'mischief', rarity: 'legendary', cost: 2, targeting: 'floor',
    stats: { power: 3, health: 15, lives: 9, size: 1 },
    keywords: { innate: true },
    text: 'Innate. Deploy: place a Box on this floor and sit in it. Her attacks from a Box give 1 Nip and Yarn 1 to the target.',
    catchphrase: 'It is a box if I am in it.',
    backstory: 'Parcel ordered one cardboard box online in 2021. Nine arrived, then nine more, then a subscription nobody remembers starting. She has stopped asking where they come from and started asking what else fits.',
    flavor: 'Ordered nine boxes. Nothing to put in them. Not the point.',
    effects: {
      onPlay: [{ type: 'box', target: 'thisFloor', seat: 'self' }],
      onAttack: [
        { type: 'catnip', amount: 1, if: [{ check: 'selfInBox', op: '==', value: true }] },
        { type: 'applyStatus', status: 'yarn', amount: 1, target: 'attackTarget', if: [{ check: 'selfInBox', op: '==', value: true }] }
      ]
    },
    art: { sprite: 'cat_champion_tortie', palette: 'cardboard_magenta', hint: 'Wild-haired tortoiseshell peeking over a cardboard rim, packing tape across one ear, a trailing thread of magenta yarn.' },
    tags: ['box', 'yarn', 'nip', 'champion'],
    unlock: 'start',
    upgradeSlots: [
      { slot: 1, unlockNight: 2,
        a: opt('mischief_parcel_1a', 'a', 'The Box Hotel', 'Box Hotel',
          'At the start of each turn, place a free Box on her floor if there is room. Boxed cats on her floor have +1 Power.',
          'No vacancy. Every room is a box. The reviews are glowing.',
          'A tiny hotel sign (VACANCY) taped to the box; a doorbell and a brass key hanging off it.',
          { addEffects: { onTurnStart: [{ type: 'box', target: 'thisFloor', if: [{ check: 'boxesOnFloor', op: '<', value: 2 }] }] },
            addAura: [{ stat: 'power', amount: 1, target: 'allCatsOnFloor', filter: [{ check: 'targetInBox', op: '==', value: true }] }] }),
        b: opt('mischief_parcel_1b', 'b', 'The Yarn Spinner', 'Yarn Bomb',
          'Her attacks from a Box give Yarn 2. At the end of each turn, every pest takes 1 damage per Yarn stack it holds.',
          'It was one loose thread. It was always going to end like this.',
          'A heavy yarn ball tucked under one arm; threads spiraling from her paws.',
          { addEffects: {
            onAttack: [{ type: 'applyStatus', status: 'yarn', amount: 1, target: 'attackTarget', if: [{ check: 'selfInBox', op: '==', value: true }] }],
            onTurnEnd: [{ type: 'damage', amount: { base: 0, per: 'targetYarn', mult: 1 }, kind: 'hit', target: 'allEnemies' }] } }),
        c: opt('mischief_parcel_1c', 'c', 'The Nip Dealer', 'Fresh Sprig',
          'At the start of each turn, gain 2 Nip.',
          'Grown in a pot nobody was allowed to touch. Harvested by someone who was.',
          'A sprig of catnip tucked behind her ear; eyes already slightly wide.',
          { addEffects: { onTurnStart: [{ type: 'catnip', amount: 2 }] } })
      },
      { slot: 2, unlockNight: 5,
        a: opt('mischief_parcel_2a', 'a', 'The Box Hotel', 'Flat Pack Fury',
          'Whenever a Box is flattened, deal 6 damage to every pest on that floor and place a free new Box there.',
          'Assembly required. Disassembly also required. Both are violent.',
          'Her box splits open into four flaps like a pop-up greeting card, cat inside, mid-pounce.',
          { addEffects: { onAnyBoxFlattened: [
            { type: 'damage', amount: 6, kind: 'hit', target: 'allEnemiesOnFloor', floorOf: 'triggerSource' },
            { type: 'box', target: 'thisFloor', floorOf: 'triggerSource' }
          ] } }),
        b: opt('mischief_parcel_2b', 'b', 'The Yarn Spinner', 'Tangle Tax',
          'Pests with Yarn take 3 extra damage from every hit. When a Yarned pest is defeated, its Yarn spreads to all other pests.',
          'Every knot is billed. The invoice arrives immediately.',
          'Yarn strands now tied to the box rim; a tiny price tag dangling from the thread.',
          { addAura: [{ stat: 'damageTaken', amount: 3, target: 'allEnemies', filter: [{ check: 'targetHasStatus:yarn', op: '==', value: true }] }],
            addEffects: { onAnyPestDeath: [{ type: 'spreadStatus', status: 'yarn', from: 'triggerSource', to: 'allEnemies', if: [{ check: 'targetHasStatus:yarn', op: '==', value: true }] }] } }),
        c: opt('mischief_parcel_2c', 'c', 'The Nip Dealer', 'Soft Landing',
          'Crash no longer costs Zoomies or cards (you still Nap). Surge gives 1 more Zoomies.',
          'She has read the fine print. There is no fine print. That was the fine print.',
          'A pillow strapped to her back like a parachute; glow of green around her eyes.',
          { rules: { crashZoomiesPenalty: 0, crashDrawPenalty: 0 },
            addEffects: { onSurgeStart: [{ type: 'zoomies', amount: 1 }] } })
      },
      { slot: 3, unlockNight: 8,
        a: opt('mischief_parcel_3a', 'a', 'The Box Hotel', 'Fulfilment Centre',
          'Up to 3 Boxes per floor. Boxed cats have +3 Power and strike a second time at the end of each turn, staying Hidden.',
          'Everything ships same night. Everything is a box. The cats are the contents.',
          'A warehouse of stacked boxes, each with a pair of eyes peeking out and a small conveyor belt of cardboard.',
          { rules: { maxBoxesPerFloor: 3 },
            addAura: [{ stat: 'power', amount: 3, target: 'allCats', filter: [{ check: 'targetInBox', op: '==', value: true }] }],
            addEffects: { onTurnEnd: [{ type: 'attack', target: 'allCats', mult: 1, stayHidden: true, filter: [{ check: 'targetInBox', op: '==', value: true }] }] } }),
        b: opt('mischief_parcel_3b', 'b', 'The Yarn Spinner', 'The Whole Sweater',
          'Each turn the front pest on every floor gains Yarn 1. At turn end, every pest takes Shatter equal to the total Yarn on its floor (bosses take half).',
          'Nobody asked for a sweater. It is going to fit, regardless.',
          'Giant knitted sweater half-stitched across the whole room, needles clicking, Parcel in the sleeve.',
          { addEffects: {
            onTurnStart: [{ type: 'applyStatus', status: 'yarn', amount: 1, target: 'frontEnemy', floor: 'eachFloor' }],
            onTurnEnd: [{ type: 'damage', amount: { base: 0, per: 'yarnOnTargetFloor', mult: 1 }, kind: 'shatter', target: 'allEnemies' }] } }),
        c: opt('mischief_parcel_3c', 'c', 'The Nip Dealer', 'Wired for Sound',
          'Surge needs 7 Nip, gives 3 Zoomies, and Nip keeps filling during Surge. Crash lasts only 1 turn.',
          'The party never ends. Someone has quietly turned the lights down.',
          'Eyes glowing lime; whiskers vibrating; a disco light made from a bottle cap above her box.',
          { rules: { surgeThreshold: 7, surgeZoomies: 3, nipKeptDuringSurge: true, crashTurns: 1 } })
      }
    ],
    finalForms: {
      A: { id: 'mischief_parcel_final_a', path: 'A', name: 'Fulfilment Director', text: 'Final form: +3 Power. Whenever a Box is flattened, every pest on that floor takes 6 more.', patch: { statsAdd: { power: 3 }, addEffects: { onAnyBoxFlattened: [{ type: 'damage', amount: 6, kind: 'hit', target: 'allEnemiesOnFloor', floorOf: 'triggerSource' }] } } },
      B: { id: 'mischief_parcel_final_b', path: 'B', name: 'Master Knitter', text: 'Final form: at the start of each turn every pest gains Yarn 1.', patch: { addEffects: { onTurnStart: [{ type: 'applyStatus', status: 'yarn', amount: 1, target: 'allEnemies' }] } } },
      C: { id: 'mischief_parcel_final_c', path: 'C', name: 'Party Animal', text: 'Final form: Surge needs 5 Nip and draws 2 cards.', patch: { rules: { surgeThreshold: 5 }, addEffects: { onSurgeStart: [{ type: 'draw', amount: 2 }] } } }
    }
  };

  SB.data.championsMM = [oswin, tuppence, tumble, parcel];
})();
