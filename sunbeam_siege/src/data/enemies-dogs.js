/* SUNBEAM SIEGE: dog and canine pests (B09)
 *
 * Loaded as a classic script. Defines SB.data.enemiesDogs (16 regular pests).
 *
 * SCHEMA (pest object)
 *   id, name, family:'dog', acts:[firstAct,lastAct], size (1 Small, 2 Medium, 3 Large, per RULES s3),
 *   sizeClass, hp (base, before hpScale), threat (A07 budget cost), traits[], tags[],
 *   immune[] (status ids the pest ignores), passives[], onSpawn[], onDeath[],
 *   pattern: A02 s9 pattern. 'cycle' has actions[], 'conditional' has rules[{if, action}] and a final {else}.
 *   action: { label, kind:'attack'|'buff'|'debuff'|'shield'|'summon'|'idle', dmg, hits, floors, pick,
 *             effects[] (run on use, for non-attacks), onHit[] (run per hit, target attackTarget), note }
 *   Effects use the A03 DSL (type, amount, status, target, dir, keyword).
 *   flavor (under 90 chars), art { sprite, palette, accessory, notes }.
 *
 * Damage numbers are final base values at hpScale 1.0 and Rage 0 (Rage adds +1 per stack, A04).
 * Scared note: on a cat, Scared ticks -1 at Dusk, which is after the pest phase of the same round,
 * so Scared 2 is the value that costs a cat exactly one Cat Attacks phase. Scared 1 only strips Purr.
 *
 * NEEDS: (engine agent, please add; everything else here uses existing A02/A03/A04 pieces)
 *   1. floors:'ownAndUp'  attack spec: hits own floor, then the floor above (Dachshund). Same pick on both.
 *   2. effect type 'shove'  move target cat to the back of its own floor (A02 s12 mentions Shove for cards).
 *      'move' effect gains optional onBlocked:'shove' (if the floor below is full or the cat is on the Cellar).
 *   3. effect type 'boxDamage' { amount, target:'thisFloor' }  reduces Box durability on that floor (99 = flatten).
 *   4. pest-side targets: 'otherDogsOnFloor', 'allDogs', 'leashedDogs', 'frontCat', 'attackTarget' (pest attacks).
 *   5. trait 'Tracker': pest attacks ignore Hidden (picks treat Hidden cats as present). Counter to Boxes (A01).
 *   6. pest field 'immune': ['scared', ...] ignores that status. Terrier ignores Scared, Bulldog caps Dizzy at 1.
 *   7. status 'leashed' (pest): pushes (Knock) do nothing while a pest with id pest_dog_walker is on the board.
 *   8. triggers: onSpawn, onHit, onDeath (pest), onAnyDogDeath (fires for pests with tag 'dog', source excluded),
 *      onStatusApplied:<id> (the pest itself receives that status).
 *   9. conditions for pest patterns: hpBelowHalf, isWitchingHour, floorIndex, roundAtLeast (A02 names).
 *  10. effect fluff with a negative amount strips Fluff from a cat (Poodle). Fluff cannot go below 0.
 *  11. floorStatus 'puddle' on thisFloor from a pest effect (A04 s3.3).
 *  12. status 'groomed_ruined' (Poodle): blocks Hide gain. Condition 'hpBelowHalfOnce' (true once per fight).
 *  13. status 'leashed' with a negative amount removes it. Pest field rageFloor { min }: Rage cannot drop below min (Pack Alpha).
 */
window.SB = window.SB || {};
SB.data = SB.data || {};

SB.data.enemiesDogs = [

  // ---------------------------------------------------------------- ACT 1
  {
    id: 'pest_yap_pup',
    name: 'Yappy Pup',
    family: 'dog',
    acts: [1, 2],
    size: 1, sizeClass: 'Small',
    hp: 17,
    threat: 2,
    traits: [],
    tags: ['dog', 'pack', 'loud', 'puppy'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [
      { type: 'applyStatus', status: 'rage', amount: 1, target: 'otherDogsOnFloor' }
    ],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Nip', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Yap', kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'front',
          effects: [ { type: 'applyStatus', status: 'rage', amount: 1, target: 'otherDogsOnFloor' } ],
          note: 'Every other dog on this floor gets Rage 1.' }
      ]
    },
    flavor: 'Has never met a silence it could not improve by being wrong about it.',
    art: { sprite: 'dog_pup', palette: 'cream_tan', accessory: 'oversized red collar, one ear flopped',
           notes: 'Tiny, all ears and tail. Open mouth with a visible yap line in the intent icon.' }
  },

  {
    id: 'pest_scrap_terrier',
    name: 'Scrappy Terrier',
    family: 'dog',
    acts: [1, 3],
    size: 1, sizeClass: 'Small',
    hp: 24,
    threat: 3,
    traits: ['Climber'],
    tags: ['dog', 'pack', 'chaser'],
    immune: ['scared'],
    passives: [
      { id: 'fearless', name: 'Fearless', text: 'Fearless. Ignores Scared.' }
    ],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Worry', kind: 'attack', dmg: 3, hits: 2, floors: 'own', pick: 'front' },
        { label: 'Dig In', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'back',
          note: 'Goes round the front line and bites the back cat.' }
      ]
    },
    flavor: 'Chases anything that runs. Chases most things that do not.',
    art: { sprite: 'dog_terrier', palette: 'wiry_brown_white', accessory: 'muddy paws, a stolen sock in the jaw',
           notes: 'Compact, forward-leaning pose, always mid-lunge. Whiskery eyebrows.' }
  },

  {
    id: 'pest_pug_snort',
    name: 'Drooling Pug',
    family: 'dog',
    acts: [1, 2],
    size: 1, sizeClass: 'Small',
    hp: 31,
    threat: 3,
    traits: [],
    tags: ['dog', 'wet', 'slow'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [
      { type: 'floorStatus', status: 'puddle', amount: 1, target: 'thisFloor' }
    ],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Snort', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'applyStatus', status: 'wet', amount: 1, target: 'attackTarget' } ],
          note: 'Hit cat gets Wet 1.' },
        { label: 'Wheeze', kind: 'shield', effects: [ { type: 'fluff', amount: 4, target: 'self' } ],
          note: 'Gains 4 Hide while catching its breath.' }
      ]
    },
    flavor: 'Breathes like a kettle and attacks like a wet flannel. Both are somehow your problem.',
    art: { sprite: 'dog_pug', palette: 'fawn_black_mask', accessory: 'tongue permanently out, tiny bowtie',
           notes: 'Squashed face, curly tail. Drool drip particle. Puddle sprite on death.' }
  },

  {
    id: 'pest_corgi_herder',
    name: 'Corgi, Herding',
    family: 'dog',
    acts: [1, 3],
    size: 1, sizeClass: 'Small',
    hp: 31,
    threat: 3,
    traits: [],
    tags: ['dog', 'pack', 'fetch', 'shover'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Nip Heels', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'shove', target: 'attackTarget' } ],
          note: 'Hit cat is herded to the back of its floor. Piles break up.' },
        { label: 'Circle', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front' }
      ]
    },
    flavor: 'Bred to move cattle. Has decided you are cattle. Has decided cattle is a rank.',
    art: { sprite: 'dog_corgi', palette: 'orange_white', accessory: 'tiny shepherd crook it found',
           notes: 'Loaf-shaped, stubby legs, fluffy rear. Ears at full radar.' }
  },

  {
    id: 'pest_dachshund_dash',
    name: 'Dachshund Express',
    family: 'dog',
    acts: [1, 3],
    size: 2, sizeClass: 'Medium',
    hp: 41,
    threat: 4,
    traits: [],
    tags: ['dog', 'long', 'multifloor'],
    immune: [],
    passives: [
      { id: 'long_boy', name: 'Long Boy', text: 'Long boy. Its bite reaches the floor above as well.' }
    ],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Stretch', kind: 'attack', dmg: 4, hits: 1, floors: 'ownAndUp', pick: 'front',
          note: 'One bite on this floor, one on the floor above.' },
        { label: 'Wiggle', kind: 'shield', effects: [ { type: 'fluff', amount: 3, target: 'self' } ],
          note: 'Wriggles into a tight sausage. +3 Hide.' }
      ]
    },
    flavor: 'Technically one dog, spread across two floors and several opinions.',
    art: { sprite: 'dog_dachshund', palette: 'chestnut_tan', accessory: 'sausage-roll scarf',
           notes: 'Very long body drawn across two pest slots (size 2). Tiny legs, huge ego.' }
  },

  {
    id: 'pest_retriever_fetch',
    name: 'Retriever, Enthusiastic',
    family: 'dog',
    acts: [1, 3],
    size: 2, sizeClass: 'Medium',
    hp: 51,
    threat: 5,
    traits: [],
    tags: ['dog', 'fetch', 'dragger', 'garden'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Fetch', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'weakest',
          onHit: [
            { type: 'move', dir: 'down', amount: 1, target: 'attackTarget', onBlocked: 'shove' },
            { type: 'applyStatus', status: 'wet', amount: 1, target: 'attackTarget' }
          ],
          note: 'Carries the weakest cat down one floor (back of that floor), slobbered. On the Cellar or a full floor the cat is shoved to the back instead.' },
        { label: 'Zoomies', kind: 'buff', effects: [ { type: 'applyStatus', status: 'rage', amount: 1, target: 'self' } ],
          note: 'Runs a lap of honour. Gains Rage 1.' }
      ]
    },
    flavor: 'Fetching things is a personality. Returning them is not.',
    art: { sprite: 'dog_retriever', palette: 'golden', accessory: 'a cat-shaped tennis ball held in the mouth, tail a blur',
           notes: 'Big grin, feathered tail. Drag animation: cat dangles gently by the scruff, unharmed and offended.' }
  },

  // ---------------------------------------------------------------- ACT 2
  {
    id: 'pest_beagle_bayer',
    name: 'Baying Beagle',
    family: 'dog',
    acts: [2, 3],
    size: 1, sizeClass: 'Small',
    hp: 26,
    threat: 4,
    traits: [],
    tags: ['dog', 'pack', 'loud', 'support', 'rage-caller'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [
      { type: 'applyStatus', status: 'rage', amount: 1, target: 'allDogs' }
    ],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Sniff', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Bay', kind: 'buff',
          effects: [
            { type: 'applyStatus', status: 'rage', amount: 1, target: 'allDogs' },
            { type: 'applyStatus', status: 'scared', amount: 1, target: 'frontCat' }
          ],
          note: 'Every dog on every floor gets Rage 1. The front cat on this floor is rattled (Purr stripped).' }
      ]
    },
    flavor: 'Its song carries across three floors and no one has asked for an encore.',
    art: { sprite: 'dog_beagle', palette: 'tricolor', accessory: 'tiny brass hunting horn on a string',
           notes: 'Head thrown back mid-bay, sound-wave arcs drawn up through the floor ceiling.' }
  },

  {
    id: 'pest_husky_howler',
    name: 'Husky, Operatic',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 47,
    threat: 7,
    traits: [],
    tags: ['dog', 'loud', 'yowl', 'multifloor'],
    immune: [],
    passives: [],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Snap', kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Yowl', kind: 'attack', dmg: 3, hits: 1, floors: 'each', pick: 'random',
          onHit: [ { type: 'applyStatus', status: 'scared', amount: 2, target: 'attackTarget' } ],
          note: 'One random cat on EVERY floor takes 2 and is Scared 2 (skips its next attack). Hidden cats are spared.' },
        { label: 'Snap', kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'front' }
      ]
    },
    flavor: 'Has a lot to say, none of it in a key. The neighbours have been informed.',
    art: { sprite: 'dog_husky', palette: 'grey_white_ice_eyes', accessory: 'sled harness with one bell',
           notes: 'Pale eyes, mask markings. Yowl frame: snout skyward, three ring-shaped sound waves.' }
  },

  {
    id: 'pest_bulldog_bruiser',
    name: 'Bulldog, Immovable',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 62,
    threat: 7,
    traits: ['Heavy'],
    tags: ['dog', 'tank', 'heavy', 'box-breaker'],
    immune: [],
    passives: [
      { id: 'heavy', name: 'Heavy', text: 'Heavy. Knock moves it 1 floor less (Knock 1 does nothing but Shatter).' },
      { id: 'stubborn', name: 'Stubborn', cap: 1, text: 'Stubborn. Dizzy on it never goes above 1.' }
    ],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Headbutt', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'boxDamage', amount: 2, target: 'thisFloor' } ],
          note: 'The Box on this floor loses 2 durability.' },
        { label: 'Snore', kind: 'shield', effects: [ { type: 'fluff', amount: 8, target: 'self' } ],
          note: 'Falls asleep standing up. +8 Hide.' },
        { label: 'Headbutt', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'boxDamage', amount: 2, target: 'thisFloor' } ] }
      ]
    },
    flavor: 'Not moving. Not for you, not for the stairs, not for the concept of dinner.',
    art: { sprite: 'dog_bulldog', palette: 'brindle_white', accessory: 'spiked collar two sizes too small, dignified drool',
           notes: 'Wide, low, square. Takes up the slot like furniture. Shield icon shows a flat cap of Hide.' }
  },

  {
    id: 'pest_poodle_attitude',
    name: 'Poodle with Attitude',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 42,
    threat: 5,
    traits: [],
    tags: ['dog', 'armored', 'snob', 'wet-averse'],
    immune: [],
    passives: [
      { id: 'groomed', name: 'Groomed', text: 'Groomed. Starts with 10 Hide.' },
      { id: 'wet_ruin', name: 'Wet Ruins the Cut', text: 'Wet ruins the cut: if it becomes Wet it loses all Hide and cannot regain Hide for the fight.' }
    ],
    onSpawn: [
      { type: 'fluff', amount: 10, target: 'self' }
    ],
    // Wet ruins the cut: the wet_ruin passive (src/engine/ops-pests.js) strips all Hide and sets groomed_ruined.
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Disdain', kind: 'attack', dmg: 3, hits: 2, floors: 'own', pick: 'strongest',
          onHit: [ { type: 'fluff', amount: -3, target: 'attackTarget' } ],
          note: 'Goes for the best cat in the row. Each hit strips 3 Fluff.' },
        { label: 'Primp', kind: 'shield', effects: [ { type: 'fluff', amount: 6, target: 'self' } ],
          note: 'Blow-dry. +6 Hide (not if ruined).' }
      ]
    },
    flavor: 'Looks at your cats the way you look at a stain. Has a ribbon. Has standards.',
    art: { sprite: 'dog_poodle', palette: 'apricot_pompoms', accessory: 'pink ribbon, tiny jewelled sunglasses',
           notes: 'Topiary silhouette with a haughty tilt. Ruined state: soggy, pompoms collapsed, pure shame.' }
  },

  {
    id: 'pest_guard_dog',
    name: 'Guard Dog, On Duty',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 52,
    threat: 6,
    traits: [],
    tags: ['dog', 'pack', 'support', 'guard'],
    immune: [],
    passives: [
      { id: 'guard_duty', name: 'Guard Duty', amount: 3, text: 'Guard Duty. Dogs on its floor start with Hide 3 on spawn.' }
    ],
    onSpawn: [
      { type: 'fluff', amount: 3, target: 'otherDogsOnFloor' }
    ],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Warning Bark', kind: 'buff',
          effects: [
            { type: 'fluff', amount: 4, target: 'otherDogsOnFloor' },
            { type: 'applyStatus', status: 'rage', amount: 1, target: 'otherDogsOnFloor' },
            { type: 'applyStatus', status: 'rage', amount: 1, target: 'self' }
          ],
          note: 'Other dogs on this floor get 4 Hide and Rage 1. Itself Rage 1.' },
        { label: 'Bite', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Bite', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'weakest' }
      ]
    },
    flavor: 'Takes the night shift personally. Takes everything else personally too.',
    art: { sprite: 'dog_guard', palette: 'black_tan_dobermann', accessory: 'security vest, tiny torch strapped to the collar',
           notes: 'Sharp, upright, ears clipped to points. Stands one slot in front of its buddies.' }
  },

  {
    id: 'pest_dog_walker',
    name: 'Dog Walker, Overbooked',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 52,
    threat: 12,
    traits: [],
    tags: ['dog', 'human', 'pack', 'fetch', 'dragger', 'summoner', 'elite-candidate'],
    immune: [],
    passives: [
      { id: 'leashed', name: 'Leashed', text: 'Leashed. The three dogs cannot be Knocked while the Walker stands.' },
      { id: 'floor_budget', name: 'Floor Budget', text: 'Floor budget: Walker 2 + three Small dogs = a full floor of 5.' }
    ],
    onSpawn: [
      { type: 'summon', card: 'pest_yap_pup', target: 'thisFloor', at: 'front' },
      { type: 'summon', card: 'pest_scrap_terrier', target: 'thisFloor', at: 'front' },
      { type: 'summon', card: 'pest_corgi_herder', target: 'thisFloor', at: 'front' },
      { type: 'applyStatus', status: 'leashed', amount: 1, target: 'summonedByMe' }
    ],
    onDeath: [
      { type: 'applyStatus', status: 'rage', amount: 3, target: 'leashedDogs' },
      { type: 'grantKeyword', keyword: 'climber', target: 'leashedDogs' },
      { type: 'removeStatus', status: 'leashed', target: 'leashedDogs' }
    ],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Heel!', kind: 'buff',
          effects: [ { type: 'applyStatus', status: 'rage', amount: 1, target: 'leashedDogs' } ],
          note: 'All leashed dogs get Rage 1.' },
        { label: 'Tug', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'move', dir: 'down', amount: 1, target: 'attackTarget', onBlocked: 'shove' } ],
          note: 'Yanks the front cat down a floor on the lead (or to the back of the Cellar row).' },
        { label: 'Tug', kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'move', dir: 'down', amount: 1, target: 'attackTarget', onBlocked: 'shove' } ] }
      ]
    },
    flavor: 'Walking eleven dogs, apparently. Has brought three. The other eight are on their way.',
    art: { sprite: 'human_dogwalker', palette: 'hi_vis_green_wellies', accessory: 'triple leash fan, poop bags on belt, thermos',
           notes: 'Human silhouette shown from the knees up, three leashes fanned out to the pup, terrier and corgi. Walker is kept comic, never menacing.' }
  },

  {
    id: 'pest_bloodhound_sniffer',
    name: 'Bloodhound, Nosy',
    family: 'dog',
    acts: [2, 3],
    size: 2, sizeClass: 'Medium',
    hp: 42,
    threat: 5,
    traits: ['Tracker'],
    tags: ['dog', 'tracker', 'box-breaker', 'anti-hidden'],
    immune: [],
    passives: [
      { id: 'tracker', name: 'Tracker', text: 'Tracker. Can find Hidden cats; its attacks do not skip them.' }
    ],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Sniff Out', kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front',
          effects: [ { type: 'boxDamage', amount: 99, target: 'thisFloor' } ],
          note: 'Flattens the Box on this floor. Cats pop out into the open.' },
        { label: 'Maul', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Maul', kind: 'attack', dmg: 7, hits: 1, floors: 'own', pick: 'weakest' }
      ]
    },
    flavor: 'Found the cardboard box in 0.4 seconds. Found it again out of sheer pride.',
    art: { sprite: 'dog_bloodhound', palette: 'liver_tan', accessory: 'deerstalker hat, magnifying glass on a string',
           notes: 'Droopy jowls, ears dragging on the floor. Nose-to-the-ground pose; scent trail line leading to a cat.' }
  },

  // ---------------------------------------------------------------- ACT 3
  {
    id: 'pest_great_dane',
    name: 'Great Dane, Lap Dog',
    family: 'dog',
    acts: [3, 3],
    size: 3, sizeClass: 'Large',
    hp: 44,
    threat: 11,
    traits: ['Heavy'],
    tags: ['dog', 'tank', 'heavy', 'loud', 'box-breaker', 'elite-candidate'],
    immune: [],
    passives: [
      { id: 'heavy', name: 'Heavy', text: 'Heavy. Knock moves it 1 floor less.' },
      { id: 'excited', name: 'Excited', rage: 3, text: 'Gets Excited under half HP: Rage 3 once.' }
    ],
    onSpawn: [],
    onDeath: [],
    // Excited (Rage 3 once under half HP) is the excited passive, so the pattern is a plain cycle.
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Lumber', kind: 'attack', dmg: 10, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'shove', target: 'attackTarget' } ],
          note: 'Hit cat is shoved to the back of the floor.' },
        { label: 'Sit On It', kind: 'attack', dmg: 8, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'boxDamage', amount: 99, target: 'thisFloor' } ],
          note: 'Flattens the Box on this floor.' },
        { label: 'Boom', kind: 'attack', dmg: 4, hits: 1, floors: 'each', pick: 'front',
          onHit: [ { type: 'applyStatus', status: 'scared', amount: 2, target: 'attackTarget' } ],
          note: 'One bark. The front cat of every floor takes 3 and is Scared 2.' }
      ]
    },
    flavor: 'Believes it is a lap dog. The lap, regrettably, has agreed.',
    art: { sprite: 'dog_dane', palette: 'harlequin', accessory: 'a bandana and a single, enormous sock',
           notes: 'Fills a Large slot head to tail. Gentle eyes, catastrophic feet. Barks in a visibly lower pitch.' }
  },

  {
    id: 'pest_wolf_prowler',
    name: 'Wolf at the Cat Flap',
    family: 'dog',
    acts: [3, 3],
    size: 2, sizeClass: 'Medium',
    hp: 48,
    threat: 9,
    traits: ['Climber', 'Sneaky', 'Nocturnal'],
    tags: ['dog', 'wolf', 'chaser', 'sunbeam-threat'],
    immune: [],
    passives: [
      { id: 'climber_sneaky', name: 'Climber and Sneaky', text: 'Climber and Sneaky: climbs every round and bites the Sunbeam even when cats are in the way.' },
      { id: 'nocturnal', name: 'Nocturnal', text: 'Nocturnal: +2 Attack on the Witching Hour.' }
    ],
    onSpawn: [],
    onDeath: [],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Stalk', kind: 'buff',
          effects: [ { type: 'applyStatus', status: 'rage', amount: 1, target: 'self' } ],
          note: 'Circles. Gains Rage 1.' },
        { label: 'Lunge', kind: 'attack', dmg: 8, hits: 1, floors: 'own', pick: 'weakest' },
        { label: 'Lunge', kind: 'attack', dmg: 8, hits: 1, floors: 'own', pick: 'weakest' }
      ]
    },
    flavor: 'Technically a dog. Has never once agreed to be told so.',
    art: { sprite: 'canine_wolf', palette: 'storm_grey_amber_eyes', accessory: 'a cat-flap flap draped over one shoulder',
           notes: 'Lean, long-legged, low to the ground. Moonlight rim. Eyes glow on the Witching Hour.' }
  },

  {
    id: 'pest_pack_alpha',
    name: 'Pack Alpha, Barkley',
    family: 'dog',
    acts: [3, 3],
    size: 3, sizeClass: 'Large',
    hp: 84,
    threat: 12,
    traits: ['Heavy'],
    tags: ['dog', 'wolf', 'pack', 'loud', 'yowl', 'rage-caller', 'elite-candidate'],
    immune: [],
    passives: [
      { id: 'pack_leader', name: 'Pack Leader', amount: 1, text: 'Pack Leader. Whenever another dog dies, Barkley gains Rage 1.' },
      { id: 'heavy', name: 'Heavy', text: 'Heavy. Knock moves it 1 floor less.' },
      { id: 'rage_floor', name: 'Riled Up', min: 1, text: 'Rage on Barkley cannot drop below 1.' }
    ],
    rageFloor: { min: 1 },
    // Pack Leader: the pack_leader passive (src/engine/ops-pests.js) adds Rage 1 whenever another dog dies.
    onSpawn: [
      { type: 'applyStatus', status: 'rage', amount: 1, target: 'self' }
    ],
    onDeath: [
      { type: 'removeStatus', status: 'rage', target: 'allDogs' }
    ],
    pattern: {
      type: 'cycle',
      actions: [
        { label: 'Rally Howl', kind: 'attack', dmg: 1, hits: 1, floors: 'each', pick: 'front',
          onHit: [ { type: 'applyStatus', status: 'scared', amount: 2, target: 'attackTarget' } ],
          effects: [ { type: 'applyStatus', status: 'rage', amount: 2, target: 'allDogs' } ],
          note: 'Every dog gets Rage 2. The front cat of every floor takes 1 and is Scared 2.' },
        { label: 'Maul', kind: 'attack', dmg: 10, hits: 1, floors: 'own', pick: 'front' },
        { label: 'Maul', kind: 'attack', dmg: 10, hits: 1, floors: 'own', pick: 'front',
          onHit: [ { type: 'shove', target: 'attackTarget' } ] }
      ]
    },
    flavor: 'Leads the pack from the front, mainly so everyone can hear it better.',
    art: { sprite: 'canine_alpha', palette: 'silver_black_saddle', accessory: 'scarred ear, a single tin dog tag reading BARKLEY',
           notes: 'Husky-wolf mix, huge ruff. Rage aura: red steam ticks on every dog on the board while he lives. Aura clears on death.' }
  }

];
