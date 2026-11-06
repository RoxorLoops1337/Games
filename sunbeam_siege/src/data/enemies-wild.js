/*
 * SUNBEAM SIEGE enemies-wild.js (agent B11): the WILD and NIGHT pests, Acts 1 to 3.
 * 16 regular enemies. Elites and bosses live elsewhere.
 *
 * SCHEMA (extends the A02 section 17 pest shape):
 *   id, name, act:[min,max], size (1 Small, 2 Medium, 3 Large), sizeName, hp, fluff (starting armor, default 0),
 *   threat (encounter budget cost, A07 section 10), traits (A02: Climber, Sneaky, Slippery, plus Spectral),
 *   tags (RULES: Light, Heavy, Anchored, Costly, Nocturnal), nightVisitor (true = eligible for Witching Hour waves),
 *   habitat (spawn floor hint for the encounter builder, default 1), passives, pattern, onDeath, flavor, art.
 *   Weight classes are tags only (Light, Heavy, Anchored). Heavy is NOT duplicated in traits.
 *   Nocturnal pests get +2 Attack during a Witching Hour round (A05 section 8).
 *   Pattern actions use A02 kinds: attack, shield, buff, debuff, summon, plus the new kinds below.
 *   Attack spec: {kind:'attack', dmg, hits, floors, pick, label, effects:[...]} (effects fire when a hit lands).
 *   HP is the base value. The engine applies hpScale = 1 + 0.05 * (night - 1) on top (A07).
 *
 * NEEDS (engine additions, none are silently assumed to exist):
 *   Action kinds:
 *     'attach'  : the pest leaves the floor list and latches onto a cat (a Parasite). See each parasite's
 *                 `parasite` block: dmgPerRound, growth, maxDmg, ignoreFluff, removeCost (Zoomies to
 *                 tap the host and Scratch it off), removeBy list, onHostLifeLost. An attached parasite
 *                 counts as alive for the win check, is not targetable by cat attacks or Sweeps, and ticks
 *                 in Pest Attacks (after upkeep). While attached, tag Anchored applies if listed.
 *     'snatch'  : exile the top card of the draw pile under this pest. On this pest's death the card goes to hand.
 *     'steal'   : take up to N Fluff from a cat and give it to this pest as Fluff. `{what:'fluff', n}`.
 *   Effect ops inside `effects` or `onDeath`:
 *     {op:'status', who:'hitCat'|'allCatsOnFloor'|'randomCat', id, n}   existing A04 ids: dizzy, scared, frazzled
 *     {op:'gainFluff', n} {op:'gainDmg', n} (permanent +Attack on the pest) {op:'returnSnatched'}
 *   Dynamic damage: an attack with mirror:true (dmg 0) takes its number from the mirror passive. The pest reads the Attack of the cat chosen by
 *     `mirror` ('strongest' on its floor, else strongest on any floor) at the moment it picks that intent.
 *     The Mirror passive also copies that cat's attack spec (floors and pick) and re-reads every round.
 *   Conditions for pattern 'conditional': catHpAtMost:N, witchingHour, hpBelowHalf, floorHasNoCats, roundAtLeast
 *     (last three are already in A02).
 *   Passives: murder (+dmg per other pest of the same id on the board), alarm (+dmg when an ally of same id
 *     dies), spectral (halves damage from cat attacks outside a Witching Hour round, min 1, Shatter ignores),
 *     playDead (once: lethal damage instead leaves 1 HP, untargetable, Dizzy 2, then Fluff), mirror,
 *     curl (after Curl, gains tag Anchored until its next action), silentWings (first intent shows the Eye icon),
 *     spawnPair (encounter builder spawns this id in pairs).
 *   Status 'frazzled' on a normal turn (A05 defines it for the Witching Hour; here it is applied by pests, -2 Attack
 *     next round, min 1).
 */
window.SB = window.SB || {};
SB.data = SB.data || {};

SB.data.enemiesWild = [

  // ---------------------------------------------------------------- 1
  {
    id: 'pest_crow', name: 'Garden Crow', act: [1, 2], size: 1, sizeName: 'Small', hp: 17, fluff: 0, threat: 2,
    traits: ['Climber'], tags: ['Light'], nightVisitor: false, habitat: 1,
    passives: [ { id: 'murder', dmg: 1, note: '+1 damage for each other Garden Crow on the board' } ],
    pattern: { type: 'cycle', actions: [
      { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', label: 'Peck' },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'reach', pick: 'weakest', label: 'Dive' }
    ] },
    onDeath: [],
    flavor: 'Holds a grudge. Also holds a bottle cap.',
    art: 'glossy black crow, wings half open, one beady eye, bottle cap in beak'
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'pest_magpie', name: 'Magpie Pilferer', act: [1, 2], size: 1, sizeName: 'Small', hp: 20, fluff: 0, threat: 2,
    traits: ['Climber'], tags: ['Light'], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'steal', what: 'fluff', n: 4, floors: 'own', pick: 'front', label: 'Pilfer' },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'weakest', label: 'Jab' }
    ] },
    onDeath: [ { op: 'note', text: 'Drops nothing. Everything it stole was already its own, it says.' } ],
    flavor: 'Takes the shiny. Your Fluff counts as shiny.',
    art: 'black and white magpie, blue green tail sheen, wearing a stolen foil gum wrapper like a cape'
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'pest_raccoon', name: 'Bin Raider', act: [1, 3], size: 2, sizeName: 'Medium', hp: 37, fluff: 0, threat: 4,
    traits: [], tags: [], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'snatch', label: 'Rummage' },
      { kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'front', label: 'Scrap' },
      { kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'front', label: 'Scrap' }
    ] },
    onDeath: [ { op: 'returnSnatched' } ],
    flavor: 'Gerald\'s cousin. They do not speak at weddings.',
    art: 'chunky raccoon, bandit mask, lid of a bin as a shield, banana peel on one ear'
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'pest_fox', name: 'Back Garden Fox', act: [2, 3], size: 2, sizeName: 'Medium', hp: 23, fluff: 0, threat: 4,
    traits: ['Sneaky'], tags: ['Light'], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'conditional', rules: [
      { if: { catHpAtMost: 3 }, action: { kind: 'attack', dmg: 10, hits: 1, floors: 'own', pick: 'weakest', label: 'Snap' } },
      { if: 'always', action: { kind: 'attack', dmg: 4, hits: 2, floors: 'own', pick: 'weakest', label: 'Nip Nip' } }
    ] },
    onDeath: [],
    flavor: 'Charming, lean, and exactly as honest as you would guess.',
    art: 'russet fox, white sock paws, thin smile, one ear notched, slight swagger'
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'pest_owl', name: 'Barn Owl', act: [2, 3], size: 2, sizeName: 'Medium', hp: 23, fluff: 0, threat: 5,
    traits: ['Climber'], tags: ['Nocturnal', 'Costly'], nightVisitor: true, habitat: 3,
    passives: [ { id: 'silentWings', note: 'Its first intent after spawning shows the Eye icon' } ],
    pattern: { type: 'cycle', actions: [
      { kind: 'attack', dmg: 4, hits: 1, floors: 'reach', pick: 'weakest', label: 'Talons' },
      { kind: 'attack', dmg: 8, hits: 1, floors: 'reach', pick: 'weakest', label: 'Silent Swoop' }
    ] },
    onDeath: [],
    flavor: 'Does not hoot. Has never needed to.',
    art: 'pale heart faced barn owl, wide dark eyes, moonlit wings, tiny scarf of cobweb'
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'pest_snake', name: 'Grass Snake', act: [1, 2], size: 2, sizeName: 'Medium', hp: 27, fluff: 0, threat: 3,
    traits: ['Slippery'], tags: [], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'shield', amount: 3, label: 'Coil' },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front', label: 'Bite',
        effects: [ { op: 'status', who: 'hitCat', id: 'dizzy', n: 2 } ] }
    ] },
    onDeath: [],
    flavor: 'Not venomous. Says the snake. Check the dizzy.',
    art: 'olive green grass snake, yellow collar, forked tongue, coiled like a garden hose'
  },

  // ---------------------------------------------------------------- 7
  {
    id: 'pest_flea', name: 'Flea Scout', act: [1, 3], size: 1, sizeName: 'Small', hp: 10, fluff: 0, threat: 1,
    traits: ['Climber'], tags: ['Light'], nightVisitor: false, habitat: 1,
    passives: [ { id: 'spawnPair', note: 'Encounters place Flea Scouts in pairs or threes' } ],
    pattern: { type: 'cycle', actions: [
      { kind: 'attach', floors: 'own', pick: 'weakest', label: 'Hop On' }
    ] },
    parasite: {
      dmgPerRound: 1, growth: 0, maxDmg: 1, ignoreFluff: true,
      removeCost: 1, removeBy: ['scratch', 'cleanse', 'purrAura10'],
      onHostLifeLost: 'hopToNextWeakestOnFloor',
      note: 'Latched flea bites for 1 each Pest Attacks, ignoring Fluff. Tap the host and pay 1 Zoomies to Scratch it off.'
    },
    onDeath: [],
    flavor: 'Small, ruthless, and already in your fur.',
    art: 'tiny brown flea, huge back legs, dot eyes, shown mid hop with a speed line'
  },

  // ---------------------------------------------------------------- 8
  {
    id: 'pest_tick', name: 'Fat Tick', act: [2, 3], size: 1, sizeName: 'Small', hp: 16, fluff: 0, threat: 3,
    traits: ['Climber'], tags: [], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'attach', floors: 'own', pick: 'strongest', label: 'Dig In' }
    ] },
    parasite: {
      dmgPerRound: 1, growth: 1, maxDmg: 3, ignoreFluff: true, attachedTags: ['Anchored'],
      removeCost: 2, removeBy: ['scratch', 'cleanse'],
      onHostLifeLost: 'returnToCellarBack',
      note: 'Bites for 1, then 2, then 3 per round as it swells (it prefers the hardest hitter). Embedded: Scratch costs 2 Zoomies.'
    },
    onDeath: [],
    flavor: 'Quiet, patient, and rounder every day. Be quick.',
    art: 'grey brown tick, bloated round body, red head, tiny legs, clinging to a pink ear'
  },

  // ---------------------------------------------------------------- 9
  {
    id: 'pest_spider', name: 'Rafter Spider', act: [2, 3], size: 2, sizeName: 'Medium', hp: 18, fluff: 0, threat: 3,
    traits: ['Climber'], tags: ['Light', 'Nocturnal'], nightVisitor: true, habitat: 3,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'debuff', label: 'Spin Web', floors: 'own', pick: 'strongest',
        effects: [ { op: 'status', who: 'hitCat', id: 'frazzled', n: 1 } ] },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'weakest', label: 'Fang' },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'weakest', label: 'Fang' }
    ] },
    onDeath: [],
    flavor: 'Eight legs, one plan, no rent.',
    art: 'long legged house spider hanging from a thread, dusty silver web, tiny pearl eyes'
  },

  // ---------------------------------------------------------------- 10
  {
    id: 'pest_hornet', name: 'Hornet', act: [1, 3], size: 1, sizeName: 'Small', hp: 14, fluff: 0, threat: 2,
    traits: ['Climber'], tags: ['Light'], nightVisitor: false, habitat: 1,
    passives: [
      { id: 'spawnPair', note: 'Comes in pairs' },
      { id: 'alarm', dmg: 1, note: 'When another Hornet dies, this one gains +1 Attack for the battle' }
    ],
    pattern: { type: 'cycle', actions: [
      { kind: 'attack', dmg: 3, hits: 3, floors: 'own', pick: 'random', label: 'Buzz Sting' },
      { kind: 'attack', dmg: 6, hits: 1, floors: 'reach', pick: 'weakest', label: 'Dive Sting' }
    ] },
    onDeath: [],
    flavor: 'Zero chill, full commitment, extremely hard to hug.',
    art: 'yellow black striped hornet, orange face, angry brow, vibrating wing blur'
  },

  // ---------------------------------------------------------------- 11
  {
    id: 'pest_goose', name: 'Goose of Doom', act: [1, 2], size: 2, sizeName: 'Medium', hp: 41, fluff: 0, threat: 4,
    traits: [], tags: ['Heavy'], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'debuff', label: 'Honk', floors: 'own', pick: 'front',
        effects: [ { op: 'status', who: 'hitCat', id: 'scared', n: 1 }, { op: 'gainDmg', n: 1 } ] },
      { kind: 'attack', dmg: 4, hits: 2, floors: 'own', pick: 'front', label: 'Peck Peck' }
    ] },
    onDeath: [],
    flavor: 'Has never lost a fight. Has never won a negotiation.',
    art: 'big white goose, orange beak open mid honk, neck stretched forward, tiny angry eyebrow'
  },

  // ---------------------------------------------------------------- 12
  {
    id: 'pest_swan', name: 'Angry Swan', act: [2, 3], size: 3, sizeName: 'Large', hp: 57, fluff: 4, threat: 7,
    traits: [], tags: ['Heavy'], nightVisitor: false, habitat: 1,
    passives: [],
    pattern: { type: 'cycle', actions: [
      { kind: 'buff', label: 'Hiss and Fluff Up', effects: [ { op: 'gainFluff', n: 4 }, { op: 'gainDmg', n: 1 } ] },
      { kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'all', label: 'Wing Buffet' },
      { kind: 'attack', dmg: 11, hits: 1, floors: 'own', pick: 'front', label: 'Neck Strike' }
    ] },
    onDeath: [],
    flavor: 'Graceful above the water. Below it, a fury of webbed feet.',
    art: 'enormous white swan, orange beak, black face mask, neck coiled like a spring, wings flared'
  },

  // ---------------------------------------------------------------- 13
  {
    id: 'pest_hedgehog', name: 'Prickle Hog', act: [1, 3], size: 2, sizeName: 'Medium', hp: 34, fluff: 0, threat: 3,
    traits: [], tags: ['Heavy'], nightVisitor: false, habitat: 1,
    passives: [
      { id: 'bristle', n: 2, note: 'Bristle 2: any cat that hits it in melee takes 2 (A04 Bristle, ignores Fluff)' },
      { id: 'curl', note: 'After Curl it counts as Anchored until its next action' }
    ],
    pattern: { type: 'cycle', actions: [
      { kind: 'shield', amount: 5, label: 'Curl Up', effects: [ { op: 'curlAnchor' } ] },
      { kind: 'attack', dmg: 4, hits: 1, floors: 'own', pick: 'front', label: 'Roll Over' }
    ] },
    onDeath: [],
    flavor: 'Wants to be left alone. Is covered in reasons.',
    art: 'round brown hedgehog, cream snout, thousands of spines, leaf stuck on its back'
  },

  // ---------------------------------------------------------------- 14
  {
    id: 'pest_tomcat', name: 'Rival Tomcat', act: [2, 3], size: 2, sizeName: 'Medium', hp: 31, fluff: 0, threat: 6,
    traits: [], tags: ['Costly'], nightVisitor: false, habitat: 1,
    passives: [
      { id: 'mirror', of: 'strongest', add: 1,
        note: 'Copies the Attack and attack spec (floors and pick) of the strongest cat on its floor, plus 1. Re-reads each round.' }
    ],
    pattern: { type: 'cycle', actions: [
      { kind: 'buff', label: 'Stare Down', effects: [ { op: 'gainFluff', n: 3 } ] },
      { kind: 'attack', dmg: 0, mirror: true, hits: 1, floors: 'own', pick: 'front', label: 'Mirror Claws' },
      { kind: 'attack', dmg: 0, mirror: true, hits: 1, floors: 'own', pick: 'front', label: 'Mirror Claws' }
    ] },
    onDeath: [],
    flavor: 'Same walk. Same face. Worse manners.',
    art: 'scruffy ginger tomcat, torn ear, scar over one eye, spiked collar, matching pose to your cat'
  },

  // ---------------------------------------------------------------- 15
  {
    id: 'pest_possum', name: 'Moonlit Possum', act: [2, 3], size: 2, sizeName: 'Medium', hp: 26, fluff: 0, threat: 4,
    traits: [], tags: ['Nocturnal'], nightVisitor: true, habitat: 1,
    passives: [
      { id: 'playDead', once: true, fluff: 4,
        note: 'First lethal hit leaves 1 HP. It tips over, cannot be targeted for 1 round, is Dizzy 2, and wakes with 4 Fluff.' }
    ],
    pattern: { type: 'cycle', actions: [
      { kind: 'debuff', label: 'Eerie Grin', floors: 'own', pick: 'random',
        effects: [ { op: 'status', who: 'hitCat', id: 'scared', n: 1 } ] },
      { kind: 'attack', dmg: 6, hits: 1, floors: 'own', pick: 'front', label: 'Gnash' }
    ] },
    onDeath: [],
    flavor: 'Dead. Definitely. Please stop checking.',
    art: 'pale grey possum, pink nose, too many small teeth in a grin, glowing eyes, hanging limp by its tail'
  },

  // ---------------------------------------------------------------- 16
  {
    id: 'pest_ghost_mouse', name: 'Ghost Mouse', act: [1, 3], size: 1, sizeName: 'Small', hp: 10, fluff: 0, threat: 1,
    traits: ['Climber', 'Sneaky', 'Spectral'], tags: ['Light', 'Nocturnal'], nightVisitor: true, habitat: 1,
    passives: [
      { id: 'spectral', note: 'Takes half damage (min 1) from cat attacks outside a Witching Hour round. Shatter ignores this.' },
      { id: 'spawnPair', note: 'Night Visitor waves bring them in pairs' }
    ],
    pattern: { type: 'cycle', actions: [
      { kind: 'attack', dmg: 1, hits: 1, floors: 'own', pick: 'front', label: 'Chill' },
      { kind: 'attack', dmg: 3, hits: 1, floors: 'own', pick: 'front', label: 'Moan' }
    ] },
    onDeath: [],
    flavor: 'Died in the walls in 1987. Still chasing the cheese.',
    art: 'translucent pale blue mouse, wispy tail trailing into mist, hollow black eyes, faint glow'
  }

];
