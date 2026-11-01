/*
 * SUNBEAM SIEGE: HOUSEHOLD HORRORS (B10). 18 regular pests, Acts 1 to 3.
 * Things cats hate. All ids prefixed pest_. Classic script, no modules.
 *
 * Conventions (A02 section 17 shapes, A03 effect DSL, A04 status ids):
 *  - size: pest Room units (Small 1, Medium 2, Large 3). sizeClass is the label.
 *  - hp / hide: base before the per-night hpScale (A07). hide = starting Hide (armor, persists).
 *  - threat: cost for the encounter budget builder (A07 section 10).
 *  - acts: [firstAct, lastAct] the pest may appear in.
 *  - pattern: { type:'cycle'|'weighted'|'conditional'|'countdown', ... } with exact action specs.
 *    Attack action: { kind:'attack', dmg, hits, floors, pick, splash?, effects? }.
 *    "splash": true means every cat in the same Cuddle Pile as the picked target is also hit
 *    for full damage and gets the effects (A05 Pile rules).
 *    Effect objects use A03 types. Targets on the pest side: self, frontCat, backCat, weakestCat,
 *    randomCat, allCatsOnFloor, allCats, allPestsOnFloor, thisFloor, floorBelow, sunbeam.
 *  - countdown pattern: the pest shows a number N. In Phase 5, in place of its action, N drops by 1.
 *    The Phase 5 on which it would drop to 0 it performs onZero instead and N = reset.
 *    Yarn, Frozen and Scared skip the action and so do not tick. (Dizzy does not skip; it misdirects.) "pausedBy" lists extra statuses that stop it.
 *  - solve: how the player is meant to beat a pest that is awkward to hit.
 *
 * NEEDS (engine additions, none are silent):
 *  Statuses:   shamed (D, cat: cannot join a Pile, cannot gain Purr or Cozy; Cleanse removes),
 *              frazzled (A02/RULES Frazzled, -2 Attack next round, used here as a cat debuff, D),
 *              dull and spooked (A02 table, x0.75 / x1.5 damage; absent from A04 ids), hide (pest armor as an applyStatus target),
 *              dizzy (A04, used here as self-applied; RULES: Dazed is Dizzy).
 *  Effect types: wipe {what: purr|hairball|box|fluff|claws|hidden|rested|yarn|wet|tape, target, amount|'all'}
 *              (box wipe flattens the Box into a Flat Pack card per A05), shove {target:'frontCat'}
 *              (front cat goes to the back of its floor), trapCat {target, holder:'self'},
 *              releaseCat, gainCounter {name, amount, max}, setCounter, floorStatus (puddle, foil),
 *              strip-by-amount via wipe plus storeAs:'stripped' so a follow-up effect can read it.
 *  More types: killSelf {silent}, chase {target, frazzled, staminaCost}, floors:"sunbeam" in an attack spec,
 *              amount expr {fromStored}, targets splashTargets, attackTarget, nappingCats, chasers, trapped.
 *  Pest hooks: onDeath, onHit (non-lethal damage), onKnocked, onCatChase, onCatAmbush.
 *  Traits:     Light, Heavy, Anchored, Slippery, Climber, Sneaky as in A02 and A05.
 *              New: Untargetable (immune to all damage and ignored by target picks, still counts for
 *              the win check), Cleaner (tag only, used by Box and Tape rules in A05).
 *  Pattern:    type 'countdown' (above); conditional checks holdingCat, hpBelowHalf, counterAtLeast.
 *  Intent UI:  hiddenIntent flag (A02 eye with question mark), counter badge on the pest token.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

SB.data.enemiesHousehold = [

  /* ================= ACT 1 POOL ================= */

  {
    id: 'pest_cucumber',
    name: 'The Cucumber',
    acts: [1, 2],
    size: 1, sizeClass: 'Small',
    hp: 20, hide: 0, threat: 3,
    traits: ['Light'],
    tags: ['household', 'scare_all', 'ambush'],
    spawnFloor: 1,
    hiddenIntent: true, // shows "?" until a cat damages it ("peek")
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'lurk', label: 'Lurk', kind: 'wait', text: 'Sits very still behind the cats. Suspicious.' },
        { id: 'surprise', label: 'Surprise!', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'back',
          text: 'Scared 1 to every cat on this floor, 1 damage to the back cat.',
          effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCatsOnFloor' } ] },
        { id: 'sit', label: 'Sit There', kind: 'wait', text: 'Has made its point. Takes double damage this round.',
          effects: [ { type: 'applyStatus', status: 'spooked', amount: 1, target: 'self' } ] }
      ]
    },
    passives: [
      { text: 'Hidden cats and cats in Piles of 3 or more are not startled (Scared does not apply to them).',
        rule: { immuneToScared: ['hidden', 'pile>=3'] } }
    ],
    onDeath: [],
    solve: 'Hit it while the intent is still a question mark, or hide the cats in a Box.',
    flavor: 'It was a cucumber. It was always a cucumber.',
    art: { kind: 'cucumber', size: 32, palette: ['#4f8a3c', '#8bc34a', '#d8e8b0'],
           features: ['green capsule', 'bumpy skin dots', 'tiny smug face', 'one drop of water'], idle: 'does not move at all' }
  },

  {
    id: 'pest_tinfoil',
    name: 'Tinfoil Sheet',
    acts: [1, 3],
    size: 1, sizeClass: 'Small',
    hp: 27, hide: 0, threat: 3,
    traits: ['Slippery'],
    tags: ['household', 'floor_hazard', 'scare'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'glare', label: 'Glare', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          text: '2 damage to the front cat and Dull 1 (blinded by the shine).',
          effects: [ { type: 'applyStatus', status: 'dull', amount: 1, target: 'frontCat' } ] },
        { id: 'crinkle', label: 'Crinkle', kind: 'debuff', floors: 'own', pick: 'random',
          text: 'Scared 1 to a random cat on this floor. Crinkly noises.',
          effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'randomCat' } ] }
      ]
    },
    passives: [
      { text: 'Foil Floor: while it lives, cats on this floor cannot gain Rested and a cat deployed here gains Scared 1.',
        rule: { floorStatus: 'foil', noRested: true, onCatDeployed: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'triggerSource' } ] } }
    ],
    onDeath: [ { type: 'floorStatus', status: 'foil', amount: -1, target: 'thisFloor', note: 'removes Foil Floor' } ],
    solve: 'Slippery: it takes double Shatter, so Knock It Off clears it fast.',
    flavor: 'Nobody has ever wanted to stand on it. The foil knows.',
    art: { kind: 'foil', size: 32, palette: ['#b8c2cc', '#eef3f7', '#6c7a89'],
           features: ['crumpled silver sheet', 'sharp highlight pixels', 'two tiny eyes in the creases'], idle: 'glints every few seconds' }
  },

  {
    id: 'pest_nail_clippers',
    name: 'Nail Clippers',
    acts: [1, 2],
    size: 1, sizeClass: 'Small',
    hp: 27, hide: 0, threat: 3,
    traits: [],
    tags: ['household', 'countdown', 'claw_wipe'],
    spawnFloor: 1,
    countdownLabel: 'Snip in',
    pattern: {
      type: 'countdown', start: 3, reset: 3, pausedBy: [],
      between: { id: 'nip', label: 'Nip', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'front',
                 text: '1 damage to the front cat while the clippers line things up.' },
      onZero: { id: 'snip', label: 'Snip', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'strongest',
                text: '3 damage to the cat with the most Attack, and it loses ALL Claws.',
                effects: [ { type: 'wipe', what: 'claws', amount: 'all', target: 'attackTarget' } ] }
    },
    onDeath: [],
    solve: 'Kill it before the number hits 1, or Yarn it: a Yarned pest does not tick.',
    flavor: 'Only ever appears in the one second you are relaxed.',
    art: { kind: 'clippers', size: 32, palette: ['#9aa5b1', '#cfd8e0', '#d35a5a'],
           features: ['steel jaws open wide', 'red handle', 'small cartoon eyes on the pivot'], idle: 'jaws chatter' }
  },

  {
    id: 'pest_balloon',
    name: 'Party Balloon',
    acts: [1, 3],
    size: 1, sizeClass: 'Small',
    hp: 10, hide: 0, threat: 3,
    traits: ['Light', 'Climber'],
    tags: ['household', 'countdown', 'scare_all'],
    spawnFloor: 1,
    countdownLabel: 'Pops in',
    pattern: {
      type: 'countdown', start: 3, reset: 3, pausedBy: [],
      between: { id: 'inflate', label: 'Inflate', kind: 'wait', text: 'Swells. Squeaks. Everybody stares.' },
      onZero: { id: 'pop', label: 'POP', kind: 'debuff', floors: 'each', pick: 'all',
                text: 'Scared 1 to EVERY cat on EVERY floor. The balloon is gone.',
                effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCats' },
                           { type: 'killSelf', silent: true } ] }
    },
    onDeath: [
      { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCatsOnFloor',
        note: 'Killed by damage it still pops, but only on its own floor.' }
    ],
    onKnocked: [
      { type: 'killSelf', silent: true, note: 'Knock It Off lets the air out gently. No Scared, no reward drama.' }
    ],
    solve: 'Knock It Off deflates it for free. Anything else makes a smaller bang.',
    flavor: 'Floats up the stairs. Everyone knows how this ends.',
    art: { kind: 'balloon', size: 32, palette: ['#e0405a', '#ff8a9c', '#f5f5f5'],
           features: ['glossy red oval', 'knotted tail with string', 'worried little face'], idle: 'bobs gently, string swaying' }
  },

  {
    id: 'pest_closed_door',
    name: 'The Closed Door',
    acts: [1, 3],
    size: 2, sizeClass: 'Medium',
    hp: 48, hide: 4, threat: 5,
    traits: ['Anchored'],
    tags: ['household', 'wall', 'shove'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'latch', label: 'Latch', kind: 'buff', text: 'Gains Hide 3. Stays shut on principle.',
          effects: [ { type: 'applyStatus', status: 'hide', amount: 3, target: 'self', cap: 12 } ] },
        { id: 'slam', label: 'Slam', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front',
          text: '3 damage to the front cat and it is bumped to the back of the floor.',
          effects: [ { type: 'shove', target: 'attackTarget' } ] }
      ]
    },
    passives: [
      { text: 'Anchored: cannot be moved by Knock It Off. Cats on the other side of the cat flap are very interested in it.',
        rule: { anchored: true } }
    ],
    onDeath: [
      { type: 'zoomies', amount: 1, target: 'player', note: 'The cats rush through, delighted.' },
      { type: 'draw', amount: 1, target: 'player' }
    ],
    solve: 'It wants to be a wall. Burst it down or Shatter through the Hide; opening it pays out.',
    flavor: 'Closed for exactly as long as a cat is on the wrong side.',
    art: { kind: 'door', size: 32, palette: ['#7a5230', '#b07a45', '#e0c070'],
           features: ['tall wooden door', 'brass knob like a nose', 'narrow dark gap under it with glowing eyes'], idle: 'creaks open a crack and shuts' }
  },

  /* ================= ACT 2 POOL (some start in Act 1 above) ================= */

  {
    id: 'pest_cone_of_shame',
    name: 'Cone of Shame',
    acts: [2, 3],
    size: 1, sizeClass: 'Small',
    hp: 23, hide: 0, threat: 3,
    traits: [],
    tags: ['household', 'debuffer', 'anti_pile'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'fit', label: 'Fit', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'strongest',
          text: 'Dull 2 and Shamed 2 on the cat with the most Attack. Shamed cats leave the Pile and cannot Purr.',
          effects: [ { type: 'applyStatus', status: 'dull', amount: 2, target: 'attackTarget' },
                     { type: 'applyStatus', status: 'shamed', amount: 2, target: 'attackTarget' } ] },
        { id: 'stare', label: 'Disappointed Stare', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          text: '2 damage to the front cat.' }
      ]
    },
    onDeath: [ { type: 'wipe', what: 'shamed', amount: 'all', target: 'allCats', note: 'Everybody gets their dignity back.' } ],
    solve: 'Kill it and every Shamed cat is freed at once.',
    flavor: 'The head is fine. The pride is not.',
    art: { kind: 'cone', size: 32, palette: ['#e8e2d0', '#c9c1a8', '#8f8a78'],
           features: ['clear plastic funnel', 'wide ring rim', 'pinched-lip frown'], idle: 'wobbles like it is thinking of rolling away' }
  },

  {
    id: 'pest_carrier_crate',
    name: 'Carrier Crate',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 42, hide: 2, threat: 6,
    traits: [],
    tags: ['household', 'hostage', 'vet'],
    spawnFloor: 1,
    pattern: {
      type: 'conditional',
      rules: [
        { if: 'holdingCat',
          action: { id: 'rattle', label: 'Rattle', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front',
                    text: '3 damage to the front cat. The trapped cat is not helping.' } },
        { if: 'cycleIndexEven',
          action: { id: 'open', label: 'Door Opens', kind: 'wait', text: 'Door swings wide. The grille looks hungry. Next: Scoop.' } },
        { if: 'always',
          action: { id: 'scoop', label: 'Scoop', kind: 'trap', floors: 'own', pick: 'weakest',
                    text: 'Traps the weakest non-Large cat on this floor inside. It cannot act or be hit.',
                    effects: [ { type: 'trapCat', target: 'weakestCat', holder: 'self', excludeSize: 2 } ] } }
      ]
    },
    onDeath: [ { type: 'releaseCat', target: 'trapped', note: 'Returns to the same floor, back slot, no life lost.' } ],
    passives: [ { text: 'Holds at most 1 cat. If it is Knocked, the cat goes along. At battle end the cat is released.', rule: { capacity: 1 } } ],
    solve: 'Break the crate to free the cat. Large cats do not fit, so they are the safe tanks.',
    flavor: 'It sits by the front door for two weeks first, just to be sure.',
    art: { kind: 'carrier', size: 32, palette: ['#6f7b8a', '#a9b4c2', '#e0b040'],
           features: ['grey plastic box', 'grid door ajar', 'yellow latch', 'two worried eyes behind bars when full'], idle: 'door creaks, hinge squeaks' }
  },

  {
    id: 'pest_vet_scale',
    name: 'Vet Scale',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 47, hide: 0, threat: 5,
    traits: ['Heavy'],
    tags: ['household', 'anti_pile', 'vet'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'step_on', label: 'Step On', kind: 'wait', text: 'Readout flickers. Next Verdict is already calculated.' },
        { id: 'verdict', label: 'Verdict', kind: 'attack',
          dmg: 2, hits: 1, floors: 'own', pick: 'front',
          text: 'Damage is 2 plus 2 per cat on this floor. Crowds are weighed in full.' }
      ]
    },
    // Verdict: 2 plus 2 per cat on the floor. The verdict passive adds the per-cat part to the intent number.
    passives: [ { text: 'Heavy: Knock It Off pushes it 1 floor less.', rule: { heavy: true } },
                { id: 'verdict', name: 'Verdict', per: 2, text: 'Verdict deals 2 plus 2 per cat on this floor.' } ],
    onDeath: [],
    solve: 'The readout shows the damage. Spread cats across floors or kill it during Step On.',
    flavor: 'Everyone weighs exactly 4.2 kilos. Nobody believes the scale.',
    art: { kind: 'scale', size: 32, palette: ['#c8ced6', '#6e7a88', '#d94a4a'],
           features: ['flat steel platform', 'red digital readout showing a rising number', 'cold judgemental eyes'], idle: 'readout counts up and flashes' }
  },

  {
    id: 'pest_robot_vacuum',
    name: 'Robot Vacuum',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 20, hide: 0, threat: 6,
    traits: ['Heavy'],
    tags: ['household', 'cleaner', 'box_wipe', 'hairball_wipe', 'purr_wipe'],
    spawnFloor: 1,
    pattern: {
      type: 'conditional',
      rules: [
        { if: { hpBelowHalf: true, onceUnused: 'dock' },
          action: { id: 'dock', label: 'Return to Dock', kind: 'buff',
                    text: 'Heals 6 and is Dizzy 1 while it charges. Once.',
                    effects: [ { type: 'markOnce', key: 'dock' },
                               { type: 'heal', amount: 6, target: 'self' },
                               { type: 'applyStatus', status: 'dizzy', amount: 1, target: 'self' } ] } },
        { if: 'cycleIndexEven',
          action: { id: 'bumble', label: 'Bumble', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front',
                    text: '3 damage to the front cat. Wipes ALL Purr on this floor.',
                    effects: [ { type: 'wipe', what: 'purr', amount: 'all', target: 'allCatsOnFloor' } ] } },
        { if: 'always',
          action: { id: 'suck_up', label: 'Suck Up', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'back',
                    text: '2 damage to the back cat. Flattens 1 Box and clears Hairballs and Tape Squares on this floor.',
                    effects: [ { type: 'wipe', what: 'box', amount: 1, target: 'thisFloor' },
                               { type: 'wipe', what: 'hairball', amount: 'all', target: 'allPestsOnFloor' },
                               { type: 'wipe', what: 'tape', amount: 'all', target: 'thisFloor' } ] } }
      ]
    },
    onDeath: [],
    solve: 'Heavy, so push is useless. Burn it before the Dock heal, or keep Boxes on other floors.',
    flavor: 'Has mapped your house. Has opinions about your rug.',
    art: { kind: 'vacuum_robot', size: 32, palette: ['#3c4452', '#6e7a8c', '#4fd1c5'],
           features: ['flat black disc', 'teal ring light', 'whirling side brush', 'single bumper eye'], idle: 'spins slowly, bumps edge' }
  },

  {
    id: 'pest_mop',
    name: 'The Mop',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 39, hide: 0, threat: 5,
    traits: [],
    tags: ['household', 'cleaner', 'wet_applicator', 'purr_wipe', 'hairball_wipe', 'splash'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'slop', label: 'Slop', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', splash: true,
          text: '2 damage and Wet 2 to the front cat and every cat in its Pile.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 2, target: 'splashTargets' } ] },
        { id: 'swab', label: 'Swab', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'all',
          text: '3 damage to every cat on this floor. Wipes half their Purr and every Hairball.',
          effects: [ { type: 'wipe', what: 'purr', amount: 'half', target: 'allCatsOnFloor' },
                     { type: 'wipe', what: 'hairball', amount: 'all', target: 'allPestsOnFloor' } ] },
        { id: 'wring', label: 'Wring Out', kind: 'buff', text: 'Heals 4. Wet cats make it feel useful.',
          effects: [ { type: 'heal', amount: 4, target: 'self' },
                     { type: 'heal', amount: 2, target: 'self', if: [ { check: 'anyCatWetOnFloor', op: '==', value: true } ] } ] }
      ]
    },
    onDeath: [],
    solve: 'Wet halves Claws, so kill it before the second Slop, or keep cats spread so Splash hits one.',
    flavor: 'Smells like lemon and regret. Pushes it all one direction.',
    art: { kind: 'mop', size: 32, palette: ['#d8d2b8', '#8a6a3a', '#5aa0d8'],
           features: ['stringy grey head', 'wooden handle', 'blue bucket at its feet', 'dripping'], idle: 'drips, sways' }
  },

  {
    id: 'pest_spray_bottle',
    name: 'Spray Bottle',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 31, hide: 0, threat: 5,
    traits: ['Sneaky'],
    tags: ['household', 'wet_applicator', 'ammo', 'multi_floor'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'spritz1', label: 'Spritz', kind: 'attack', dmg: 1, hits: 1, floors: 'each', pick: 'front',
          text: '1 damage and Wet 1 to the front cat of EVERY floor.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 1, target: 'attackTarget' } ] },
        { id: 'spritz2', label: 'Spritz', kind: 'attack', dmg: 1, hits: 1, floors: 'each', pick: 'front',
          text: '1 damage and Wet 1 to the front cat of EVERY floor.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 1, target: 'attackTarget' } ] },
        { id: 'spritz3', label: 'Last Squirt', kind: 'attack', dmg: 3, hits: 1, floors: 'each', pick: 'front',
          text: '2 damage and Wet 2 to the front cat of EVERY floor. Then it is empty.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 2, target: 'attackTarget' } ] },
        { id: 'pump', label: 'Pump the Trigger', kind: 'wait', text: 'Pumps for a full round. Takes double damage, Hiss 0.',
          effects: [ { type: 'applyStatus', status: 'spooked', amount: 1, target: 'self' } ] }
      ]
    },
    passives: [ { text: 'Sneaky: also reaches the Sunbeam with a dribble of 1 damage if it stands in the Attic.', rule: { sneakySunbeamDmg: 1 } } ],
    onDeath: [],
    solve: 'It telegraphs 3 squirts and one gap. Burst it on the pump turn.',
    flavor: 'No, you did not do anything. Yes, you are still getting sprayed.',
    art: { kind: 'spray_bottle', size: 32, palette: ['#6ab7e8', '#e8f4fb', '#c94b4b'],
           features: ['clear bottle with blue liquid', 'white trigger head', 'red nozzle pointing at you'], idle: 'trigger clicks' }
  },

  {
    id: 'pest_hair_dryer',
    name: 'Hair Dryer',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 39, hide: 0, threat: 5,
    traits: [],
    tags: ['household', 'noise', 'anti_hidden', 'anti_yarn', 'dry'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'warm_up', label: 'Warm Up', kind: 'wait', text: 'Whirrs louder. Everybody flattens their ears.' },
        { id: 'blast', label: 'Blast', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          text: '2 damage and Scared 1 to the front cat. Blows every cat out of Hidden, every Yarn off the pests and dries all Wet on this floor.',
          effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'attackTarget' },
                     { type: 'wipe', what: 'hidden', amount: 'all', target: 'allCatsOnFloor' },
                     { type: 'wipe', what: 'yarn', amount: 'all', target: 'allPestsOnFloor' },
                     { type: 'wipe', what: 'wet', amount: 'all', target: 'thisFloor' } ] }
      ]
    },
    onKnocked: [ { type: 'applyStatus', status: 'dizzy', amount: 1, target: 'self', note: 'Unplugged: Dizzy 2 in total with the landing Dizzy 1.' } ],
    onDeath: [],
    solve: 'Do not stack Yarn or Boxes under it. Knock it away and it unplugs for an extra beat.',
    flavor: 'Hot wind and a noise like a jet. Why would anyone invent this.',
    art: { kind: 'hair_dryer', size: 32, palette: ['#e86aa0', '#f3a6c6', '#3c3c4c'],
           features: ['pink pistol-shaped body', 'dark nozzle', 'coiled cord tail', 'heat wobble lines'], idle: 'cord whips, nozzle glows' }
  },

  {
    id: 'pest_lint_roller',
    name: 'Lint Roller',
    acts: [2, 3],
    size: 1, sizeClass: 'Small',
    hp: 29, hide: 0, threat: 4,
    traits: [],
    tags: ['household', 'cleaner', 'fluff_wipe'],
    spawnFloor: 1,
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'roll', label: 'Roll', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          text: '2 damage. Strips ALL Fluff from the front cat and adds it to its own Hide (cap 10).',
          effects: [ { type: 'wipe', what: 'fluff', amount: 'all', target: 'attackTarget', storeAs: 'stripped' },
                     { type: 'applyStatus', status: 'hide', amount: { fromStored: 'stripped' }, target: 'self', cap: 10 } ] },
        { id: 'peel', label: 'Peel', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'all',
          text: '1 damage to every cat on this floor. Strips half of each cat\'s Fluff.',
          effects: [ { type: 'wipe', what: 'fluff', amount: 'half', target: 'allCatsOnFloor' } ] }
      ]
    },
    passives: [ { text: 'Sticky: a cat that attacks it loses 1 Fluff.', rule: { onHitBy: [ { type: 'wipe', what: 'fluff', amount: 1, target: 'attacker' } ] } } ],
    onDeath: [ { type: 'fluff', amount: 3, target: 'allCatsOnFloor', note: 'Fur everywhere. Returned with interest.' } ],
    solve: 'Kill it fast; its Hide only grows from cats that stacked Fluff.',
    flavor: 'Rolls over you all day and takes you home in sheets.',
    art: { kind: 'lint_roller', size: 32, palette: ['#d9d9d9', '#6b8fd4', '#f3e8c8'],
           features: ['blue handle', 'sticky yellow-white sheet roll covered in cat fur', 'sly grin'], idle: 'rolls an inch back and forth' }
  },

  /* ================= ACT 3 POOL ================= */

  {
    id: 'pest_bath_tide',
    name: 'Bath Tub Tide',
    acts: [3, 3],
    size: 3, sizeClass: 'Large',
    hp: 79, hide: 0, threat: 9,
    traits: ['Heavy'],
    tags: ['household', 'wet_applicator', 'splash', 'rising', 'floor_hazard'],
    spawnFloor: 1,
    counterName: 'Water',
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'fill', label: 'Fill', kind: 'debuff', floors: 'own', pick: 'all',
          text: 'Water +2. Wet 1 to every cat on this floor.',
          effects: [ { type: 'gainCounter', name: 'water', amount: 2, max: 8 },
                     { type: 'applyStatus', status: 'wet', amount: 1, target: 'allCatsOnFloor' } ] },
        { id: 'splash', label: 'Splash', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', splash: true,
          text: 'Damage is 2 plus Water. Hits the front cat and everyone in its Pile, Wet 2.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 2, target: 'splashTargets' } ] },
        { id: 'fill2', label: 'Fill', kind: 'debuff', floors: 'own', pick: 'all',
          text: 'Water +2. Wet 1 to every cat on this floor.',
          effects: [ { type: 'gainCounter', name: 'water', amount: 2, max: 8 },
                     { type: 'applyStatus', status: 'wet', amount: 1, target: 'allCatsOnFloor' } ] },
        { id: 'overflow', label: 'Overflow', kind: 'attack', dmg: 6, hits: 1, floors: [1, 2], pick: 'all',
          text: 'Damage is 4 plus Water to every cat on this floor and the one below. Puddle on both, Wet 3. Water resets.',
          effects: [ { type: 'applyStatus', status: 'wet', amount: 3, target: 'attackTarget' },
                     { type: 'floorStatus', status: 'puddle', amount: 2, target: 'thisFloor' },
                     { type: 'floorStatus', status: 'puddle', amount: 2, target: 'floorBelow' },
                     { type: 'setCounter', name: 'water', amount: 0 } ] }
      ]
    },
    // Splash and Overflow add the Water counter to their damage (the tide passive reads it when the intent is built).
    passives: [ { id: 'tide', name: 'Rising Water', text: 'Splash and Overflow deal their base damage plus the Water counter.' } ],
    onDeath: [ { type: 'floorStatus', status: 'puddle', amount: 2, target: 'floorBelow', note: 'Pulls the plug. It all goes downstairs.' } ],
    solve: 'Water is shown on the token. Kill it before Overflow, or split cats so Splash and Overflow hit few.',
    flavor: 'It fills very slowly. This is how it gets you.',
    art: { kind: 'bath', size: 40, palette: ['#e8eef2', '#5aa0d8', '#9ad0f0'],
           features: ['white clawfoot tub', 'rising blue water line', 'bubbles', 'two eyes peering over the rim'], idle: 'water slosh, rim drips' }
  },

  {
    id: 'pest_thunderstorm',
    name: 'Thunderstorm',
    acts: [3, 3],
    size: 3, sizeClass: 'Large',
    hp: 53, hide: 0, threat: 9,
    traits: ['Climber', 'Light'],
    tags: ['household', 'weather', 'scare_all', 'countdown', 'wet_applicator'],
    spawnFloor: 3,
    countdownLabel: 'Thunder in',
    pattern: {
      type: 'countdown', start: 3, reset: 3, pausedBy: [],
      between: { id: 'drizzle', label: 'Drizzle', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'front',
                 text: '1 damage and Wet 1 to the front cat.',
                 effects: [ { type: 'applyStatus', status: 'wet', amount: 1, target: 'attackTarget' } ] },
      onZero: { id: 'thunderclap', label: 'Thunderclap', kind: 'attack', dmg: 7, hits: 1, floors: 'each', pick: 'strongest',
                text: 'Scared 1 to EVERY cat on EVERY floor, and 5 damage to the strongest cat on each floor.',
                effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCats' } ] }
    },
    passives: [
      { text: 'Cats in a Pile of 3 or more, Hidden cats and Catnip Peak cats ignore Scared. Cuddling through a storm is canon.',
        rule: { immuneToScared: ['pile>=3', 'hidden', 'catnipPeak'] } }
    ],
    onDeath: [ { type: 'applyStatus', status: 'purr', amount: 2, target: 'allCats', note: 'The air clears. Everyone relaxes a little.' } ],
    solve: 'Build a Pile of 3 on the right floor and the storm is just rain.',
    flavor: 'The sky is angry and so is the dog. Everybody under the bed.',
    art: { kind: 'storm', size: 40, palette: ['#4a5470', '#8a94b8', '#ffd95a'],
           features: ['dark rain cloud with angry brow', 'yellow zig zag bolt', 'streaks of rain', 'rumbling shadow below'], idle: 'flickers white, bolt flashes' }
  },

  {
    id: 'pest_fireworks',
    name: 'Firework Crate',
    acts: [3, 3],
    size: 2, sizeClass: 'Medium',
    hp: 22, hide: 0, threat: 6,
    traits: [],
    tags: ['household', 'countdown', 'scare_all', 'explosive', 'sunbeam_hit'],
    spawnFloor: 1,
    countdownLabel: 'Fuse',
    pattern: {
      type: 'countdown', start: 3, reset: 3, pausedBy: ['wet'],
      between: { id: 'sizzle', label: 'Sizzle', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'front',
                 text: '1 damage to the front cat. The fuse is getting shorter.' },
      onZero: { id: 'launch', label: 'Launch', kind: 'attack', dmg: 4, hits: 1, floors: 'sunbeam', pick: 'all',
                text: 'Scared 1 to EVERY cat and 3 damage straight to the Sunbeam. The crate is gone.',
                effects: [ { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCats' },
                           { type: 'killSelf', silent: true } ] }
    },
    onDeath: [
      { type: 'damage', amount: 4, kind: 'shatter', target: 'allPestsOnFloor', note: 'Pops early in the pile. The other pests get the bang.' },
      { type: 'applyStatus', status: 'scared', amount: 1, target: 'allCatsOnFloor' }
    ],
    passives: [ { text: 'Wet puts the fuse out: a Wet crate does not tick.', rule: { pausedByWet: true } } ],
    solve: 'Kill it into a crowded floor for a free bomb, or wet it down to stop the fuse.',
    flavor: 'Somebody lit it and left. Typical.',
    art: { kind: 'fireworks', size: 32, palette: ['#c93b3b', '#f2c94c', '#3c3c4c'],
           features: ['stack of red rockets in a box', 'sparking fuse', 'wide round eyes'], idle: 'fuse sparks, bobs' }
  },

  {
    id: 'pest_alarm_clock',
    name: 'Alarm Clock',
    acts: [3, 3],
    size: 1, sizeClass: 'Small',
    hp: 20, hide: 0, threat: 4,
    traits: ['Nocturnal'],
    tags: ['household', 'countdown', 'anti_nap', 'noise'],
    spawnFloor: 1,
    countdownLabel: 'Rings in',
    pattern: {
      type: 'countdown', start: 3, reset: 4, pausedBy: [],
      between: { id: 'tick', label: 'Tick', kind: 'wait', text: 'Tick. Tick. Tick.' },
      onZero: { id: 'ring', label: 'RING', kind: 'debuff', floors: 'each', pick: 'all',
                text: 'Frazzled 1 to EVERY cat. Napping cats also lose ALL Rested and take 3 damage.',
                effects: [ { type: 'applyStatus', status: 'frazzled', amount: 1, target: 'allCats' },
                           { type: 'wipe', what: 'rested', amount: 'all', target: 'nappingCats' },
                           { type: 'damage', amount: 3, kind: 'hit', target: 'nappingCats' } ] }
    },
    onHit: [ { type: 'delayCountdown', amount: 1, max: 5,
               note: 'Snooze: a hit that does not kill it delays the next ring by 1.' } ],
    passives: [ { text: 'Nocturnal: +2 Attack during Witching Hour (its Ring is also +1 Frazzled then).', rule: { nocturnal: true } } ],
    onDeath: [],
    solve: 'Each non-lethal hit snoozes it. Burst it in one go, or time Naps just after it rings.',
    flavor: 'Set for 6 AM. The cats have been awake since 3.',
    art: { kind: 'alarm_clock', size: 32, palette: ['#c9ccd4', '#d94a4a', '#2c3040'],
           features: ['round twin-bell clock', 'red bells on top', 'angry digital face', 'little legs'], idle: 'bells vibrate' }
  },

  {
    id: 'pest_laser_dot',
    name: 'The Red Dot',
    acts: [3, 3],
    size: 1, sizeClass: 'Small',
    hp: 2, hide: 0, threat: 7,
    traits: ['Untargetable', 'Anchored'],
    tags: ['household', 'puzzle', 'distraction', 'cannot_be_attacked'],
    spawnFloor: 1,
    untargetable: true,
    stamina: 8,
    timeout: { rounds: 8, note: 'Gets bored and clicks off after 8 rounds on the board, so a hidden-cat deck cannot soft lock.' },
    pattern: {
      type: 'cycle',
      actions: [
        { id: 'tease', label: 'Tease', kind: 'debuff', floors: 'own', pick: 'all',
          text: 'Every awake, un-Hidden cat on this floor with Attack chases it instead of attacking. Chasers are Frazzled 1.',
          effects: [ { type: 'chase', target: 'allCatsOnFloor', frazzled: 1, staminaCost: 1 } ] }
      ]
    },
    passives: [
      { text: 'Cannot be targeted or damaged. At Phase 6 it jumps to the floor with the most cats that have Attack.',
        rule: { untargetable: true, onPhase6: 'moveToBusiestFloor' } },
      { text: 'Each cat that chases costs it 1 Stamina. At 0 it blinks out.', rule: { staminaDrain: 'perChaser' } },
      { text: 'A Hidden cat that attacks on its floor catches it: Stamina -4. Napping cats ignore it.', rule: { onCatAmbush: { staminaCost: 4 } } }
    ],
    onDeath: [
      { type: 'applyStatus', status: 'rested', amount: 1, target: 'chasers', note: 'Everyone is worn out and extremely pleased.' },
      { type: 'heal', amount: 2, target: 'chasers' }
    ],
    solve: 'Tire it out with chasers, or let a boxed cat pounce from Hidden. Do not ignore it: the win needs it gone.',
    flavor: 'You cannot catch it. You will try anyway.',
    art: { kind: 'laser_dot', size: 32, palette: ['#ff2d4a', '#ff8a96', '#ffffff'],
           features: ['glowing red circle, no outline', 'expanding ring ripples', 'bright white center'], idle: 'jitters one pixel at random, ring pulses' }
  }

];
