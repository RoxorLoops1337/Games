/* B08 RODENTS AND GARDEN CRITTERS: SB.data.enemiesRodents (18 regular pests, Acts 1 to early 2)
 *
 * Schema (per pest):
 *   id, name, acts:[first,last], size:'small'|'medium'|'large', room:1|2|3 (pest Size units),
 *   hp (base, before the A07 hpScale per Night), fluff (starting Hide/Armor, persists), traits[] (A02:
 *   Climber, Heavy, Slippery, Sneaky), tags[] (A05: Light, Heavy, Anchored, Costly, Nocturnal, plus
 *   family tags like Rat, Gerbil), threat (encounter budget cost, A07 section 10), role (one line),
 *   pattern ({type:'cycle', actions[]} | {type:'conditional', rules:[{if, action}]}; the last rule
 *   uses if:'always'), passives[], onDeath[], onHit[], flavor, art.
 *   Attack actions use the A02 spec: {kind:'attack', label, dmg, hits, floors, pick, flags[]}.
 *   flags: 'ranged' (does not trigger Thorns or Bristle), 'sunbeamToo' (Sneaky ping).
 *   Effects use { op:'...' } objects. Targets: 'self', 'allPestsOnFloor', 'otherPestsOnFloor'.
 *
 * Existing pieces used: pattern types cycle and conditional, floors/pick specs, traits, tags,
 * Fluff on pests, Rage and Dizzy statuses (A04, A02), summons arrive with Yarn 1 (RULES section 10, ruling 4).
 *
 * NEEDS (for the engine agent; nothing here is silently invented):
 *   Effect ops:
 *     stealFish {n}            take min(n, Fish) from the player, store on the pest as carriedFish.
 *     returnCarriedFish {bonus}  give carriedFish (plus bonus) back to the player on death.
 *     flee                     pest leaves the board for good (carries its loot). It counts as removed for
 *                              the win check, gives no kill triggers, and is announced by a toast.
 *     gainFluff {n, max}       pest gains Fluff, optional cap on total Fluff.
 *     addStatus {target, status, n, max, source}  generic status grant. 'source' lets onDeath strip it.
 *     removeStatusBySource {source}   removes stacks that a given source id granted.
 *     removeStatus {status}    on a cat target, clears a status (used for Rested).
 *     destroyRoom {kind:'box'|'toy'|'any'}  Box is Flattened (normal Flat Pack rule), Toy is disabled for the battle.
 *     shoveCat {to:'back'}     move the target cat to the back of its floor row (breaks Cuddle Piles).
 *     tunnel {floors:1}        pest moves up N floors immediately, ignoring the Hold rule, if Room allows.
 *     summon {id,count,floor,at,yarn,cap:{id,max}}   cap limits how many of an id may be alive.
 *     grantFish {n}            player gains Fish.
 *   Pick values: 'napping' (a random napping, non-Hidden cat on the floor; falls back to the intent's
 *     fallback pick if none; Hidden napping cats are excluded per A02 Hidden rule).
 *   Conditions (for conditional patterns): floorHasNappingCat, floorHasRoomItem, carryingFish.
 *   Passive: packTactics {tag, perOther, cap}  +Attack per other living pest with that tag on the same floor.
 *   Trait: Glider  (Climber that moves up to 2 floors per Phase 6 if Room allows).
 *   Action kinds beyond A02 icons: steal (hand icon), flee (door icon), tunnel (stairs with shovel icon),
 *     sabotage (crossed-out box icon), shove (arrow icon). Use Up arrow, Shield, Egg and Claw as in A02.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.enemiesRodents = (function () {
  // Helper builders keep the table readable. Output is plain data.
  function atk(label, dmg, o) {
    o = o || {};
    return { kind: 'attack', icon: 'claw', label: label, dmg: dmg, hits: o.hits || 1,
      floors: o.floors || 'own', pick: o.pick || 'front', flags: o.flags || [], effects: o.effects || [] };
  }
  function act(kind, icon, label, effects, extra) {
    var a = { kind: kind, icon: icon, label: label, effects: effects || [] };
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }

  return [
    // 1 -------------------------------------------------------------------
    { id: 'pest_field_mouse', name: 'Field Mouse', acts: [1, 2], size: 'small', room: 1,
      hp: 14, fluff: 0, traits: [], tags: ['Light'], threat: 1,
      role: 'Filler swarm. Soaks a cat attack and dies to anything.',
      pattern: { type: 'cycle', actions: [ atk('Nibble', 3) ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Came for the crumbs. Stayed for the drama.',
      art: 'Tiny brown field mouse, big round ears, pink nose, mid-scurry, tail curled' },

    // 2 -------------------------------------------------------------------
    { id: 'pest_pantry_mouse', name: 'Pantry Mouse', acts: [1, 2], size: 'small', room: 1,
      hp: 17, fluff: 0, traits: [], tags: ['Light'], threat: 2,
      role: 'Fish thief. Steals on its second action, then bolts. Kill it in time to get the Fish back.',
      pattern: { type: 'conditional', rules: [
        { if: 'carryingFish', action: act('flee', 'door', 'Bolt', [ { op: 'flee' } ]) },
        { if: { roundAtLeast: 2 }, action: act('steal', 'hand', 'Snatch', [ { op: 'stealFish', n: 8 } ],
            { dmg: 1, hits: 1, floors: 'own', pick: 'front' }) },
        { if: 'always', action: atk('Scurry', 1) }
      ] },
      passives: [],
      onDeath: [ { op: 'returnCarriedFish', bonus: 3 } ],
      onHit: [],
      flavor: 'Has never paid for anything. Considers this a lifestyle.',
      art: 'Small grey mouse in a striped burglar mask, tiny sack over shoulder with a fish tail poking out' },

    // 3 -------------------------------------------------------------------
    { id: 'pest_alley_rat', name: 'Alley Rat', acts: [1, 2], size: 'small', room: 1,
      hp: 24, fluff: 0, traits: [], tags: ['Rat'], threat: 2,
      role: 'Pack bonus. Gets stronger when stacked, so mass Knock It Off backfires without area damage.',
      pattern: { type: 'cycle', actions: [ atk('Bite', 4), atk('Gnaw', 6) ] },
      passives: [ { id: 'packTactics', tag: 'Rat', perOther: 1, cap: 3 } ],
      onDeath: [], onHit: [],
      flavor: 'Rats are only dangerous in groups. So, always.',
      art: 'Wiry dark grey rat, torn ear, scarred snout, long bald tail, hunched like it owes someone money' },

    // 4 -------------------------------------------------------------------
    { id: 'pest_thimble_mouse', name: 'Thimble Mouse', acts: [1, 2], size: 'small', room: 1,
      hp: 10, fluff: 4, traits: [], tags: [], threat: 2,
      role: 'Armor swarm. Low HP behind Fluff. Shatter, Pierce and multi-hit shine; single big hits waste overkill.',
      pattern: { type: 'cycle', actions: [
        atk('Poke', 3),
        atk('Poke', 3),
        act('shield', 'shield', 'Re-thimble', [ { op: 'gainFluff', n: 2, max: 6, target: 'self' } ])
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Sewing kit casualty. The thimble is a hat now.',
      art: 'Beige mouse wearing a silver sewing thimble as a helmet, holding a pin as a sword' },

    // 5 -------------------------------------------------------------------
    { id: 'pest_garden_squirrel', name: 'Garden Squirrel', acts: [1, 2], size: 'small', room: 1,
      hp: 20, fluff: 0, traits: ['Climber'], tags: [], threat: 3,
      role: 'Climber with a ranged pick. Ignores the Hold rule and lobs acorns at the back cat.',
      pattern: { type: 'cycle', actions: [
        atk('Scratch', 4),
        atk('Acorn Lob', 3, { pick: 'back', flags: ['ranged'] }),
        atk('Scratch', 4)
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Throws acorns at cats. Has no plan for what happens next.',
      art: 'Red-grey squirrel, huge fluffy tail, acorn clutched in one paw, wild eyes' },

    // 6 -------------------------------------------------------------------
    { id: 'pest_stripe_chipmunk', name: 'Stripe Chipmunk', acts: [1, 2], size: 'small', room: 1,
      hp: 14, fluff: 0, traits: ['Climber', 'Sneaky'], tags: ['Light'], threat: 2,
      role: 'Racer. Climbs every round and pings the Sunbeam on the Attic even past cats. Kill it on the way up.',
      pattern: { type: 'cycle', actions: [
        atk('Dart', 3, { flags: ['sunbeamToo'] })
      ] },
      passives: [],
      onDeath: [ { op: 'grantFish', n: 3 } ],
      onHit: [],
      flavor: 'Cheeks full of seeds and ambition.',
      art: 'Tiny chipmunk with two dark back stripes, bulging cheeks, mid-sprint, seeds spilling' },

    // 7 -------------------------------------------------------------------
    { id: 'pest_alarm_vole', name: 'Alarm Vole', acts: [1, 2], size: 'medium', room: 2,
      hp: 34, fluff: 0, traits: [], tags: [], threat: 3,
      role: 'Punishes sleeping cats. Hits a Napping cat for a Rude Awakening. Boxed or Hidden nappers are safe.',
      pattern: { type: 'conditional', rules: [
        { if: 'floorHasNappingCat',
          action: atk('Rude Chomp', 6, { pick: 'napping', effects: [] }) },
        { if: 'always', action: atk('Nibble', 3) }
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Wakes cats up. Considers this a public service.',
      art: 'Stocky brown vole, tiny ears, huge front teeth, small brass alarm clock strapped to its back' },

    // 8 -------------------------------------------------------------------
    { id: 'pest_midnight_hamster', name: 'Midnight Hamster', acts: [1, 2], size: 'medium', room: 2,
      hp: 41, fluff: 0, traits: [], tags: ['Nocturnal'], threat: 4,
      role: 'Snowballer. Spins up Rage, +2 Attack on Witching Hour rounds. Purr floors and fast kills answer it.',
      pattern: { type: 'cycle', actions: [
        act('buff', 'up', 'Wheel Spin', [ { op: 'addStatus', target: 'self', status: 'rage', n: 2, max: 6 } ]),
        atk('Slap', 4),
        atk('Slap', 4),
        atk('Slap', 4)
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Runs eleven kilometers a night. Arrives nowhere. Angry about it.',
      art: 'Round golden hamster, wild eyes, tiny exercise wheel worn like a collar, faint night sweat' },

    // 9 -------------------------------------------------------------------
    { id: 'pest_gerbil_don', name: 'Gerbil Don', acts: [1, 2], size: 'medium', room: 2,
      hp: 37, fluff: 0, traits: [], tags: ['Gerbil'], threat: 4,
      role: 'Summoner. Whistles up Goons, up to 4 alive. Killing him scatters the gang (Dizzy 1).',
      pattern: { type: 'cycle', actions: [
        act('summon', 'egg', 'Whistle', [
          { op: 'summon', id: 'pest_gerbil_goon', count: 2, floor: 'own', at: 'back', yarn: 1,
            cap: { id: 'pest_gerbil_goon', max: 4 } } ]),
        atk('Slap', 3),
        atk('Slap', 3)
      ] },
      passives: [],
      onDeath: [ { op: 'addStatus', target: 'allPestsOnFloor', status: 'dizzy', n: 1, tagFilter: 'Gerbil' } ],
      onHit: [],
      flavor: 'Never touches anything himself. Knows a guy, who knows a gerbil.',
      art: 'Sandy gerbil in a tiny fedora and pinstripe vest, toothpick in mouth, long tufted tail' },

    // 10 ------------------------------------------------------------------
    { id: 'pest_gerbil_goon', name: 'Gerbil Goon', acts: [1, 2], size: 'small', room: 1,
      hp: 10, fluff: 0, traits: [], tags: ['Gerbil', 'Light'], threat: 1,
      role: 'Gang member. +1 Attack per other Gerbil on the floor (cap +2). Rarely spawned alone.',
      pattern: { type: 'cycle', actions: [ atk('Shank', 3) ] },
      passives: [ { id: 'packTactics', tag: 'Gerbil', perOther: 1, cap: 2 } ],
      onDeath: [], onHit: [],
      flavor: 'Hired for the matching hats.',
      art: 'Small sandy gerbil in a flat cap, sewing needle held like a switchblade, smirking' },

    // 11 ------------------------------------------------------------------
    { id: 'pest_toy_tank_mouse', name: 'Tank Commander Mouse', acts: [1, 2], size: 'large', room: 3,
      hp: 88, fluff: 6, traits: ['Heavy'], tags: ['Heavy'], threat: 7,
      role: 'Armored siege piece. Ignores Knock, fires at the weakest cat, pilot escapes on death.',
      pattern: { type: 'cycle', actions: [
        act('shield', 'shield', 'Rev Engine', [ { op: 'gainFluff', n: 4, max: 14, target: 'self' } ]),
        atk('Foam Dart', 7, { pick: 'weakest', flags: ['ranged'] }),
        atk('Foam Dart', 7, { pick: 'weakest', flags: ['ranged'] }),
        atk('Tread Over', 11)
      ] },
      passives: [],
      onDeath: [ { op: 'summon', id: 'pest_field_mouse', count: 1, floor: 'own', at: 'front', yarn: 1 } ],
      onHit: [],
      flavor: 'Plastic tank, real grudge. The pilot is wearing a tiny helmet.',
      art: 'Battered green plastic toy tank with a mouse in the hatch wearing a thimble helmet, foam darts loaded' },

    // 12 ------------------------------------------------------------------
    { id: 'pest_brute_rat', name: 'Basement Brute', acts: [1, 2], size: 'large', room: 3,
      hp: 75, fluff: 0, traits: ['Heavy'], tags: ['Heavy', 'Rat'], threat: 6,
      role: 'Wall of meat. Blocks three slots of room, slow windup into a heavy hit. Squeals when it dies.',
      pattern: { type: 'cycle', actions: [ atk('Gnaw', 7), atk('Gnaw', 7), atk('Thump', 13) ] },
      passives: [ { id: 'packTactics', tag: 'Rat', perOther: 1, cap: 2 } ],
      onDeath: [ { op: 'addStatus', target: 'otherPestsOnFloor', status: 'rage', n: 1, tagFilter: 'Rat' } ],
      onHit: [],
      flavor: 'Fed on the cellar for years. The cellar has opinions.',
      art: 'Huge hunched brown rat, scarred shoulders, one broken whisker, pipe wrench gripped in a paw' },

    // 13 ------------------------------------------------------------------
    { id: 'pest_tunnel_vole', name: 'Tunnel Vole', acts: [1, 2], size: 'small', room: 1,
      hp: 20, fluff: 0, traits: ['Slippery'], tags: [], threat: 3,
      role: 'Bypasses the Hold rule by tunneling up a floor on every third action. Not a Climber.',
      pattern: { type: 'cycle', actions: [
        atk('Nibble', 3),
        atk('Nibble', 3),
        act('tunnel', 'tunnel', 'Tunnel', [ { op: 'tunnel', floors: 1 } ])
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Does not use stairs. Stairs are for people with rules.',
      art: 'Muddy dark vole poking out of a dirt mound, tiny shovel claws, soil on whiskers' },

    // 14 ------------------------------------------------------------------
    { id: 'pest_nightcap_mouse', name: 'Nightcap Mouse', acts: [1, 2], size: 'small', room: 1,
      hp: 17, fluff: 0, traits: [], tags: ['Nocturnal', 'Light'], threat: 3,
      role: 'Dream thief. Whispers away a napper\'s Rested stacks (no damage) and grows angrier for each.',
      pattern: { type: 'conditional', rules: [
        { if: 'floorHasNappingCat',
          action: act('debuff', 'down', 'Whisper', [
            { op: 'removeStatus', target: 'napping', status: 'rested', stealToSelf: 'rage' } ],
            { pick: 'napping', floors: 'own' }) },
        { if: 'always', action: atk('Nibble', 3) }
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Tucks you in. Takes the good dreams. Leaves a note.',
      art: 'Pale mouse in a striped nightcap and long nightshirt, candle in one paw, sleepy menace' },

    // 15 ------------------------------------------------------------------
    { id: 'pest_flying_squirrel', name: 'Glider Squirrel', acts: [2, 2], size: 'small', room: 1,
      hp: 18, fluff: 0, traits: ['Climber', 'Glider'], tags: ['Light'], threat: 4,
      role: 'Fast climber. Moves up two floors per advance. Hold the Attic or lose Warmth quickly.',
      pattern: { type: 'cycle', actions: [
        atk('Swoop', 4, { floors: 'reach' }),
        atk('Swoop', 4, { floors: 'reach' })
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Falls with style. Rises with spite.',
      art: 'Silky grey flying squirrel mid-glide, cape-like skin flaps spread wide, huge dark eyes' },

    // 16 ------------------------------------------------------------------
    { id: 'pest_pack_rat', name: 'Pack Rat', acts: [2, 2], size: 'medium', room: 2,
      hp: 34, fluff: 0, traits: [], tags: ['Rat'], threat: 4,
      role: 'Box and toy wrecker. Chews up a Room item on its floor and pads itself with the scraps.',
      pattern: { type: 'conditional', rules: [
        { if: 'floorHasRoomItem',
          action: act('sabotage', 'sabotage', 'Raid', [
            { op: 'destroyRoom', kind: 'any' },
            { op: 'gainFluff', n: 5, max: 10, target: 'self' } ]) },
        { if: 'always', action: atk('Bite', 6) }
      ] },
      passives: [ { id: 'packTactics', tag: 'Rat', perOther: 1, cap: 2 } ],
      onDeath: [], onHit: [],
      flavor: 'Collects. Never returns. Has a nest made of your best things.',
      art: 'Big-eyed brown rat with a backpack of cardboard scraps, yarn and buttons, chewed box corner in mouth' },

    // 17 ------------------------------------------------------------------
    { id: 'pest_hamster_ball', name: 'Hamster in a Ball', acts: [1, 2], size: 'medium', room: 2,
      hp: 34, fluff: 0, traits: ['Slippery'], tags: [], threat: 3,
      role: 'Pile breaker. Rolls through the line, shoving the front cat to the back.',
      pattern: { type: 'cycle', actions: [
        atk('Roll Over', 1, { pick: 'all', effects: [ { op: 'shoveCat', target: 'front', to: 'back' } ] }),
        atk('Bonk', 4),
        atk('Roll Over', 1, { pick: 'all', effects: [ { op: 'shoveCat', target: 'front', to: 'back' } ] })
      ] },
      passives: [], onDeath: [], onHit: [],
      flavor: 'Does not steer. Has never needed to.',
      art: 'Chubby hamster running inside a translucent pink plastic ball, ball scuffed, determined face' },

    // 18 ------------------------------------------------------------------
    { id: 'pest_piper_rat', name: 'Piper Rat', acts: [1, 2], size: 'small', room: 1,
      hp: 20, fluff: 0, traits: [], tags: ['Rat'], threat: 3,
      role: 'Support. Pipes Rage into the floor. A priority target; its Rage fades when it dies.',
      pattern: { type: 'cycle', actions: [
        act('buff', 'up', 'Pipe', [
          { op: 'addStatus', target: 'otherPestsOnFloor', status: 'rage', n: 1, max: 3, source: 'pest_piper_rat' } ]),
        act('buff', 'up', 'Pipe', [
          { op: 'addStatus', target: 'otherPestsOnFloor', status: 'rage', n: 1, max: 3, source: 'pest_piper_rat' } ]),
        atk('Squeak', 1)
      ] },
      passives: [],
      onDeath: [ { op: 'removeStatusBySource', source: 'pest_piper_rat' } ],
      onHit: [],
      flavor: 'Plays a very persuasive tin whistle. Nobody asked what the tune is.',
      art: 'Thin black rat in a patched green coat and feathered cap, playing a tin whistle' }
  ];
})();
