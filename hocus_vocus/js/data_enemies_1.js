// Hocus Vocus: Act I roster (`chapter` 1): Blossom Bay, a sunny harbour town and its Snack Pier, where the Gloss is only starting (the
// teaching act). Content only: one IIFE that registers 10 Creatures (normal), 3 Rivals (elite), 3 Sidekicks (minion) and the Headliner
// (boss) into DATA.enemies, then the act's encounter pools into DATA.encounters[1]. No functions in the data, no random calls, no dashes.
// Every name, title, move name, bark, phase line, lore line and tag is copied from hocus_vocus/plan/HV_ENEMIES.md section 2; ids, numbers,
// ops and AI never change for the re-theme. Tags are display only (the Who's Who chips).
//
// HOW THE ROSTER TEACHES. Fights with a real deck last 2 to 6 turns, so an enemy's FIRST one or two actions carry its identity and
// the rest of its cycle is what a slow player meets. Each Creature owns one lesson, the Rivals combine two, the Headliner examines all.
//   kappa          Fussy Foghorn. Exposed and Block: Prim Honk leaves the lead hero Exposed, so the Brass Bump after it lands x1.5; then
//                  a guard turn (Close the Bell), and Puff Back Up, a heal it uses once at half HP.
//   tanuki_bandit  Coin Crab. Priorities: it OPENS with Hat Grab (20 gold, telegraphed from turn 1), thumps, then scuttles off. Winning
//                  it over first returns the gold as a gold event; letting it run loses it. In company it escapes far more often.
//   kodama         Tuning Forkling. Win over the caller: it opens by ringing for a Kazoo Imp, rings at BOTH heroes lightly, and rings
//                  again once its imp is gone.
//   karakasa       Squeezebox. Wobbly and Block: two polka hops, squeezes shut (Block 8, a wall on your next turn), a wheeze that leaves
//                  Wobbly, hops again.
//   hitodama       Hot Chilli. Cheap hits: starts with Shimmy 1, Sizzles (unblockable), showers status_scorch cards into the draw pile,
//                  immune to Sizzle.
//   oni_cub        Jitterbug. Tempo: Crescendo gives it +1 Volume every round, so a slow win costs more with every turn.
//   crow_tengu     Pitch-Perfect Gull. The two spots: pecks anyone, swoops at the backing spot, and swaps your heroes out of position.
//                  Weighted, never repeats twice.
//   bamboo_sprite  Pea Pod. Many small hits: three 2-damage pea volleys at random heroes, and Load Up after two volleys. Comes in packs.
//   mushroom_folk  Jingle Machine. Earworm and Feedback: the Bubble Wrap goes up FIRST (Feedback 2, again every 4th turn), the Earworm
//                  jingle after; immune to Earworm.
//   bamboo_boar    Runaway Melon. Reading the heavy: Sequins, a Toughen Up, then a telegraphed 14 damage Downhill Roll, then a bump.
//   oni_brute      One-Hit Jukebox. Muffled and rage: Record Slap with Muffled, Double A-Side, Greatest Hit; below half HP Turn It Up
//                  (Block 8, Muffled on both heroes) and Volume 2 for the rest of the fight.
//   tengu_duelist  Dance-Off Heron. The backing spot, Shimmy and the riposte: a lunge at the backing hero, a Heel Click that raises
//                  Shimmy 2, a Triple Tap; a hook returns 3 damage the first time it loses HP each round; at half HP the Showstopper
//                  (Shimmy 3, Volume 1).
//   moss_guardian  Old Bandstand. A wall: opens by shaking 2 Kazoo Imps out of its rafters, Sequins 3 and Feedback 2 from the start, a
//                  slow punch and stomp, and every 4th turn More Bunting (+1 Sequins, +1 Feedback). Earworm and non-flurry hits are
//                  the answer.
//
// NUMBERS (CONTENT_SPEC 4.2, no encore), before Volume and Exposed. Creature hits 4 to 9 (heavy 12 to 14; multi hits and the
// both-heroes Ring Out are lighter per hit), Rival single hits 8 to 14, Sidekick hits 2 to 5, Headliner hits 9 to 13 (heavy 16 to 20;
// the biggest round is 24 in the first form and 30 in the second). A group's summed average round damage (DATA.audit's metric: the seq
// or weighted average of dmg n * hits per enemy, Sidekicks free) stays under 16 for normal groups and 22 for Rivals. Pairs and swarms
// carry 8 or more; solos with a guard turn cannot (a solo kappa is 4.3) and are the gentle openers. Summoners keep at most 2 living
// summons. Reference results with the real engine and the greedy bot (Jasmin and RoxorLoops, `hanae` and `kuro`, 40 seeds), starter deck / a developed deck:
//   normal groups 1.9 to 4.6 turns, HP lost 2 to 26 (pooled 3.2 turns and about 11 HP with the developed deck, solos about 2.1 turns)
//   Rivals 6.3 / 5.1 (bandstand), 6.4 / 5.1 (jukebox), 7.6 / 6.1 (heron) turns; 50 / 33, 44 / 28, 58 / 38 HP lost
//   Headliner 16 / 10.8 turns, 107 / 63 HP lost, won 84 percent / 100 percent
// BALANCE PASS 1 (balance bot report 1, about 22,000 runs; measured here with refights of the bot's own fights, solo probes and a paired
// greedy run set). What the numbers said, enemy by enemy, for the greedy party: kodama was the one truly soft normal (a lone kodama
// cost 0.4 percent of party HP: it is won over before it acts), and the hard end was karakasa, bamboo_boar, mushroom_folk, hitodama and
// oni_cub. Earworm and Sizzle (status ids poison and burn) are booked by the bot under their own names, not under the enemy that applied
// them, so hitodama and mushroom_folk are NOT soft; the "per turn" tables that suggested it were reading only direct hits, and
// crow_tengu is not twice its peers either. Changes: kodama Ring Out 3 to 4 and Prong Poke 6 to 7; tanuki_bandit Pincer Thump 7 to 8
// and Hat Grab 4 to 5 (the gold stays its real cost); karakasa Polka Hop 6x2 to 5x2; bamboo_boar Downhill Roll 14 to 13 and Melon Bump
// 7 to 6; mushroom_folk Can Drop 7 to 6, Earworm 3 to 2, HP 28 to 34 down to 26 to 32; crow_tengu Swoop Behind 8 to 7; oni_cub HP 32 to
// 38 down to 28 to 34; hitodama HP 20 to 24 down to 18 to 22; bamboo_sprite HP 20 to 24 up to 22 to 26.
// Net effect on normal fights: about 8 to 10 percent less party HP lost. What each enemy adds to a group fight, relative to the act
// mean, went from 0.26x to 1.54x down to 0.34x to 1.40x (the crab leaves after three turns and pea pods come in packs, so those two
// stay low by design; hitodama stays on top because of its Sizzle). Rivals, Sidekicks and the Headliner are untouched.
// Enemy Block and Sequins gained in the enemy phase last through the hero's next turn: a `defend` intent is a free window THIS turn
// and a wall NEXT turn. A `dur` status an enemy puts on itself needs n 2 to survive the end-of-round tick (heroes get the fresh flag).
//
// Kraki, the Karaoke Kraken (boss_kuzunoha), the Headliner. Turn 1 her Mic Check calls two Mic Squeals (paper_kodama) out of the
// speakers (open), then she cycles Mic Slam, Drown Them Out (2 status_blot cards into the draw pile), the telegraphed Power Anthem
// (heavy 20), Tentacle Twirl (4 random hits) and Arm Sweep (both heroes). Rules: a Glossy Smile (Muffled and Wobbly on both) every 5th
// turn (every 6th in the second form), a Too-High Note at the weakest hero whenever one is below 30 percent HP, a re-call if the squeals
// are all gone by turn 8, and Hoarse but Louder (Volume 2 and Crescendo 1) from turn 14, so stalling is punished.
// Below half HP (the one phases entry) the mask cracks: debuffs wash off, +1 Volume, she is Exposed for two rounds (n 2 so it outlasts
// the tick) and up to two more Mic Squeals pop out (never more than 2 alive). Her second form opens with Eight Mics Up (Block 5, a
// breather for the party) and cycles Every Voice at Once, Mic Slam, Arm Sweep, Drown Them Out, Eight Mics Up: Every Voice at Once is
// nine random hits of 2 plus Volume (eight mics and her own voice), 27 in all, every fifth turn. It is answerable: Block on BOTH heroes,
// Muffled on her (each 3 becomes 2, so 27 becomes 18), Shimmy, or Spotlight (random hits go to the hero in the Spotlight) plus Feedback
// to punish all nine.
(() => {
  DATA.add('enemies', {
    // ================================================================== Creatures (normal)
    kappa: {
      id: 'kappa', name: 'Fussy Foghorn', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        mud_slap: { name: 'Prim Honk', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }] },
        river_claw: { name: 'Brass Bump', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }] },
        shell_guard: { name: 'Close the Bell', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }], say: 'Ahem. Manners first.' },
        refill_dish: { name: 'Puff Back Up', kind: 'heal', fx: [{ op: 'heal', n: 6, tgt: 'self' }], say: 'Hhhaaah. Much better.' },
      },
      ai: { seq: ['mud_slap', 'river_claw', 'shell_guard'], rules: [{ if: { hpLt: 0.5 }, do: 'refill_dish', once: true }] },
      art: { id: 'kappa' },
      lore: 'A harbour foghorn the Gloss tuned to one perfect note, and now it will not honk any other. It fights fair and honks hard, right up until it runs out of puff.',
      tags: ['aquatic', 'construct'],
    },

    tanuki_bandit: {
      id: 'tanuki_bandit', name: 'Coin Crab', chapter: 1, tier: 'normal', size: 'm', hp: [30, 34],
      moves: {
        club_thump: { name: 'Pincer Thump', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }] },
        snatch_and_grab: { name: 'Hat Grab', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }, { op: 'stealGold', n: 20 }], say: 'Nice hat. Mine now!' },
        dash_off: { name: 'Scuttle Off', kind: 'flee', fx: [{ op: 'flee' }], say: 'Catch me if you can!' },
      },
      ai: { seq: ['snatch_and_grab', 'club_thump', 'dash_off'] },
      art: { id: 'tanuki_bandit' },
      lore: 'A crab who has decided that every open busking hat on the pier belongs to it. Catch it before it scuttles back into the sea and the coins come tumbling out.',
      tags: ['beast', 'aquatic'],
    },

    kodama: {
      id: 'kodama', name: 'Tuning Forkling', chapter: 1, tier: 'normal', size: 's', hp: [20, 24],
      moves: {
        rattle: { name: 'Ring Out', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'both' }], say: 'Ting ting ting!' },
        branch_poke: { name: 'Prong Poke', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
        call_leaf_imp: { name: 'Ring for a Friend', kind: 'summon', fx: [{ op: 'summon', enemy: 'leaf_imp', n: 1 }], say: 'Ting! Anyone out there?' },
      },
      ai: { open: ['call_leaf_imp'], seq: ['rattle', 'branch_poke'], rules: [{ if: { turnGte: 4, minions: { lt: 1 } }, do: 'call_leaf_imp' }] },
      art: { id: 'kodama' },
      lore: 'A tuning fork no taller than a teacup, humming the one note it knows. It hears every wobble in the bay, and when it gets lonely it rings for a friend.',
      tags: ['construct', 'spirit'],
    },

    karakasa: {
      id: 'karakasa', name: 'Squeezebox', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        tongue_lick: { name: 'Wheezy Blast', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'status', s: 'frail', n: 1, tgt: 'front' }], say: 'Hwheeeee!' },
        hop_hop: { name: 'Polka Hop', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 2, tgt: 'front' }] },
        snap_shut: { name: 'Squeeze Shut', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
      },
      ai: { seq: ['hop_hop', 'snap_shut', 'tongue_lick', 'hop_hop'] },
      art: { id: 'karakasa' },
      lore: 'An old accordion that always wanted to dance and, one windy night, simply started. It hops, it snaps shut, and it will absolutely wheeze on you, for reasons nobody has explained.',
      tags: ['construct', 'folk'],
    },

    hitodama: {
      id: 'hitodama', name: 'Hot Chilli', chapter: 1, tier: 'normal', size: 's', hp: [18, 22],
      start: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }],
      immune: ['burn'],
      moves: {
        ember_touch: { name: 'Spicy Hug', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        scorch_scatter: { name: 'Chilli Shower', kind: 'debuff', fx: [{ op: 'add', card: 'status_scorch', n: 1, to: 'draw' }] },
      },
      ai: { weighted: [['ember_touch', 3], ['scorch_scatter', 2]], noRepeat: 2 },
      art: { id: 'hitodama' },
      lore: 'A chilli from the noodle cart who got so excited about the music that it started to sizzle. It hops towards anyone warm, so please do not be warm near it.',
      tags: ['spirit'],
    },

    oni_cub: {
      id: 'oni_cub', name: 'Jitterbug', chapter: 1, tier: 'normal', size: 'm', hp: [28, 34],
      start: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }],
      moves: {
        horn_butt: { name: 'Butterfly Bump', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
        tantrum: { name: 'The Jitters', kind: 'multi', fx: [{ op: 'dmg', n: 3, hits: 2, tgt: 'front' }], say: 'Eep! EEEP!' },
      },
      ai: { seq: ['horn_butt', 'tantrum'] },
      art: { id: 'oni_cub' },
      lore: 'A very small bug made of pre-show nerves, whose very large knees knock. It grows louder every minute you put off going on, and it has a great many minutes.',
      tags: ['insect', 'spirit'],
    },

    crow_tengu: {
      id: 'crow_tengu', name: 'Pitch-Perfect Gull', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        peck_flurry: { name: 'Perfect Pecks', kind: 'multi', fx: [{ op: 'dmg', n: 3, hits: 3, tgt: 'random' }] },
        dive_bomb: { name: 'Swoop Behind', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'back' }], say: 'Behind you!' },
        switcheroo: { name: 'Shuffle Swoop', kind: 'special', fx: [{ op: 'swap' }, { op: 'dmg', n: 4, tgt: 'front' }], say: 'Shuffle, shuffle!' },
      },
      ai: { weighted: [['peck_flurry', 3], ['dive_bomb', 2], ['switcheroo', 1]], noRepeat: 2 },
      art: { id: 'crow_tengu' },
      lore: 'A harbour gull the Gloss gave perfect pitch, and it will not stop showing off. It dives at whoever is standing at the back, then shuffles the whole band out of place.',
      tags: ['avian', 'beast'],
    },

    bamboo_sprite: {
      id: 'bamboo_sprite', name: 'Pea Pod', chapter: 1, tier: 'normal', size: 's', hp: [22, 26],
      moves: {
        leaf_flurry: { name: 'Pea Volley', kind: 'multi', fx: [{ op: 'dmg', n: 2, hits: 3, tgt: 'random' }] },
        whet_blades: { name: 'Load Up', kind: 'buff', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['leaf_flurry', 'leaf_flurry', 'whet_blades'] },
      art: { id: 'bamboo_sprite' },
      lore: 'Three peas in a pod who harmonise beautifully and aim terribly. One pod is a small nuisance, and the trouble is that pods never come alone.',
      tags: ['spirit'],
    },

    mushroom_folk: {
      id: 'mushroom_folk', name: 'Jingle Machine', chapter: 1, tier: 'normal', size: 'm', hp: [26, 32],
      immune: ['poison'],
      moves: {
        spore_puff: { name: 'Catchy Jingle', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'status', s: 'poison', n: 2, tgt: 'front' }] },
        thicken_cap: { name: 'Bubble Wrap', kind: 'buff', fx: [{ op: 'status', s: 'thorns', n: 2, tgt: 'self' }] },
        cap_bonk: { name: 'Can Drop', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'front' }] },
      },
      ai: { open: ['thicken_cap'], seq: ['spore_puff', 'cap_bonk'], rules: [{ if: { turnEvery: [4, 3] }, do: 'thicken_cap' }] },
      art: { id: 'mushroom_folk' },
      lore: 'A seaside vending machine that sings its jingle every time you walk past, and every time you do not. Bump it and it squeals back; leave it and the tune follows you home.',
      tags: ['construct'],
    },

    bamboo_boar: {
      id: 'bamboo_boar', name: 'Runaway Melon', chapter: 1, tier: 'normal', size: 'l', hp: [36, 38],
      start: [{ op: 'status', s: 'plating', n: 3, tgt: 'self' }],
      moves: {
        shoulder_barge: { name: 'Melon Bump', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'front' }] },
        bristle: { name: 'Toughen Up', kind: 'buff', fx: [{ op: 'status', s: 'plating', n: 2, tgt: 'self' }], say: 'Thunk.' },
        gore: { name: 'Downhill Roll', kind: 'heavy', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
      },
      ai: { seq: ['bristle', 'gore', 'shoulder_barge'] },
      art: { id: 'bamboo_boar' },
      lore: 'A prize watermelon that rolled off the Snack Pier and has been gathering speed and rind ever since. It wobbles at the top of the hill once, thinks about it, and rolls.',
      tags: ['beast'],
    },

    // ================================================================== Rivals (elite)
    oni_brute: {
      id: 'oni_brute', name: 'One-Hit Jukebox', chapter: 1, tier: 'elite', size: 'l', hp: [82, 85],
      moves: {
        backhand: { name: 'Record Slap', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front' }, { op: 'status', s: 'weak', n: 1, tgt: 'front' }] },
        twin_swing: { name: 'Double A-Side', kind: 'multi', fx: [{ op: 'dmg', n: 8, hits: 2, tgt: 'front' }] },
        club_smash: { name: 'Greatest Hit', kind: 'heavy', fx: [{ op: 'dmg', n: 14, tgt: 'front' }], say: 'NUMBER ONE!' },
        enraged_bellow: { name: 'Turn It Up', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'status', s: 'weak', n: 1, tgt: 'both' }], say: 'EVERYBODY PICK MY RECORD!' },
      },
      ai: { seq: ['backhand', 'twin_swing', 'club_smash'] },
      phases: [{
        at: 0.5, say: 'You dare skip my big hit?!',
        fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }],
        ai: { open: ['enraged_bellow'], seq: ['club_smash', 'twin_swing', 'backhand'] },
      }],
      art: { id: 'oni_brute' },
      lore: 'A hulking old jukebox that played the bay\'s favourite song every night until the Gloss brought newer, shinier ones. It was famous once, and it is furious that nobody picks its record.',
      tags: ['construct', 'folk'],
    },

    tengu_duelist: {
      id: 'tengu_duelist', name: 'Dance-Off Heron', chapter: 1, tier: 'elite', size: 'l', hp: [72, 80],
      moves: {
        lunge: { name: 'Long-Leg Lunge', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'back' }], say: 'Mind the back, if you can.' },
        riposte_step: { name: 'Heel Click', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }, { op: 'status', s: 'dodge', n: 2, tgt: 'self' }] },
        triple_thrust: { name: 'Triple Tap', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 3, tgt: 'front' }] },
        blade_dance: { name: 'Showstopper', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 3, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }], say: 'Now we dance properly.' },
      },
      ai: { seq: ['lunge', 'riposte_step', 'triple_thrust'], rules: [{ if: { hpLt: 0.5 }, do: 'blade_dance', once: true }] },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'dmg', n: 3, tgt: 'front' }] }],
      art: { id: 'tengu_duelist' },
      lore: 'A heron who took up tap at ninety and has not lost a dance-off since. He bows before every step, and he does not bow after.',
      tags: ['avian', 'folk'],
    },

    moss_guardian: {
      id: 'moss_guardian', name: 'Old Bandstand', chapter: 1, tier: 'elite', size: 'l', hp: [74, 80],
      start: [{ op: 'status', s: 'plating', n: 3, tgt: 'self' }, { op: 'status', s: 'thorns', n: 2, tgt: 'self' }],
      moves: {
        moss_fist: { name: 'Railing Punch', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }] },
        mountain_slam: { name: 'Bandstand Stomp', kind: 'heavy', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        shake_leaves: { name: 'Shake the Rafters', kind: 'summon', fx: [{ op: 'summon', enemy: 'leaf_imp', n: 2 }], say: 'Everybody out of the rafters!' },
        moss_thicken: { name: 'More Bunting', kind: 'buff', fx: [{ op: 'status', s: 'plating', n: 1, tgt: 'self' }, { op: 'status', s: 'thorns', n: 1, tgt: 'self' }] },
      },
      ai: {
        open: ['shake_leaves'],
        seq: ['moss_fist', 'mountain_slam'],
        rules: [
          { if: { minions: { lt: 1 }, turnEvery: [5, 1] }, do: 'shake_leaves' },
          { if: { turnEvery: [4, 3] }, do: 'moss_thicken' },
        ],
      },
      art: { id: 'moss_guardian' },
      lore: 'The harbour\'s oldest bandstand, so overgrown with bunting and ivy that one day it got up and walked. It was built to keep the bay\'s music safe, and nobody ever told it to stop.',
      tags: ['construct', 'aquatic'],
    },

    // ================================================================== Sidekicks (minion)
    ember_wisp: {
      id: 'ember_wisp', name: 'Chilli Flake', chapter: 1, tier: 'minion', size: 's', hp: [6, 8],
      immune: ['burn'],
      moves: {
        flare: { name: 'Spice Flare', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        fizzle: { name: 'Fizzle Out', kind: 'flee', fx: [{ op: 'flee' }] },
      },
      ai: { seq: ['flare', 'fizzle'] },
      art: { id: 'ember_wisp' },
      lore: 'A flake that jumped off a hot chilli to see the show. It sizzles exactly once, brilliantly, and then goes out with a small polite pop.',
      tags: ['spirit'],
    },

    leaf_imp: {
      id: 'leaf_imp', name: 'Kazoo Imp', chapter: 1, tier: 'minion', size: 's', hp: [6, 8],
      moves: {
        leaf_poke: { name: 'Kazoo Poke', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front' }] },
      },
      ai: { seq: ['leaf_poke'] },
      art: { id: 'leaf_imp' },
      lore: 'A kazoo with legs and one bad idea. Tuning forks and old bandstands call them, and they always come running.',
      tags: ['construct'],
    },

    paper_kodama: {
      id: 'paper_kodama', name: 'Mic Squeal', chapter: 1, tier: 'minion', size: 's', hp: [6, 6],
      moves: {
        ink_smudge: { name: 'High Squeal', kind: 'debuff', fx: [{ op: 'add', card: 'status_blot', n: 1, to: 'draw' }] },
        paper_slap: { name: 'Cable Flick', kind: 'attack', fx: [{ op: 'dmg', n: 2, tgt: 'front' }] },
      },
      ai: { seq: ['ink_smudge', 'paper_slap'] },
      art: { id: 'paper_kodama' },
      lore: 'A tiny shrieking creature born where Kraki\'s stolen mics touch the speakers. It carries a little of the Gloss inside, and it spills.',
      tags: ['construct', 'void'],
    },

    // ================================================================== the Headliner (boss)
    boss_kuzunoha: {
      id: 'boss_kuzunoha', name: 'Kraki', title: 'The Karaoke Kraken', chapter: 1, tier: 'boss', size: 'xl', hp: [170, 178],
      immune: ['stun'],
      moves: {
        paper_fold: { name: 'Mic Check', kind: 'summon', fx: [{ op: 'summon', enemy: 'paper_kodama', n: 2 }], say: 'Mic check, one, two. Out you come, little squeals!' },
        ink_strike: { name: 'Mic Slam', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front', el: 'ink' }], say: 'Every song is mine to sing!' },
        brush_flurry: { name: 'Tentacle Twirl', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 4, tgt: 'random', el: 'ink' }], say: 'Let me sing it for you!' },
        ink_bleed: { name: 'Drown Them Out', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_blot', n: 2, to: 'draw' }], say: 'Nobody else needs a mic!' },
        tail_sweep: { name: 'Arm Sweep', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'both', el: 'ink' }], say: 'Louder!' },
        great_stroke: { name: 'Power Anthem', kind: 'heavy', fx: [{ op: 'dmg', n: 20, tgt: 'front', el: 'ink' }], say: 'One big note!' },
        mask_gaze: { name: 'Glossy Smile', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'frail', n: 1, tgt: 'both' }], say: 'Smile! Nobody gets embarrassed tonight.' },
        ink_needle: { name: 'Too-High Note', kind: 'attack', fx: [{ op: 'dmg', n: 11, tgt: 'lowest', el: 'ink' }], say: 'Oh, a wobbly one. Let me sing that for you.' },
        tails_rise: { name: 'Eight Mics Up', kind: 'defend', fx: [{ op: 'block', n: 5, tgt: 'self' }], say: 'Eight mics... one song.' },
        nine_tails: { name: 'Every Voice at Once', kind: 'multi', fx: [{ op: 'dmg', n: 2, hits: 9, tgt: 'random', el: 'ink' }], say: 'EIGHT MICS AND ME. ALL TOGETHER!' },
        frayed_ink: { name: 'Hoarse but Louder', kind: 'buff', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }, { op: 'status', s: 'ritual', n: 1, tgt: 'self' }], say: 'My voice is going. LOUDER, then!' },
      },
      ai: {
        open: ['paper_fold'],
        seq: ['ink_strike', 'ink_bleed', 'great_stroke', 'brush_flurry', 'tail_sweep'],
        rules: [
          { if: { turnGte: 14 }, do: 'frayed_ink', once: true },
          { if: { minions: { lt: 1 }, turnEvery: [8, 7] }, do: 'paper_fold' },
          { if: { heroHpLt: 0.3 }, do: 'ink_needle' },
          { if: { turnEvery: [5, 4] }, do: 'mask_gaze' },
        ],
      },
      phases: [{
        at: 0.5, say: 'You cracked my mask! Fine. Hear my REAL voices!',
        fx: [
          { op: 'removeStatus', s: 'debuffs', tgt: 'self' },
          { op: 'status', s: 'might', n: 1, tgt: 'self' },
          { op: 'status', s: 'vulnerable', n: 2, tgt: 'self' },
          { op: 'cond', if: { enemies: { lte: 1 } }, then: [{ op: 'summon', enemy: 'paper_kodama', n: 2 }], else: [{ op: 'cond', if: { enemies: { lte: 2 } }, then: [{ op: 'summon', enemy: 'paper_kodama', n: 1 }] }] },
        ],
        ai: {
          open: ['tails_rise'],
          seq: ['nine_tails', 'ink_strike', 'tail_sweep', 'ink_bleed', 'tails_rise'],
          rules: [
            { if: { turnGte: 14 }, do: 'frayed_ink', once: true },
            { if: { minions: { lt: 1 }, turnEvery: [6, 5] }, do: 'paper_fold' },
            { if: { heroHpLt: 0.3 }, do: 'ink_needle' },
            { if: { turnEvery: [6, 2] }, do: 'mask_gaze' },
          ],
        },
      }],
      art: { id: 'boss_kuzunoha' },
      lore: 'A huge, friendly kraken who has run Blossom Bay\'s open mic from the harbour for as long as anyone remembers. When the Gloss arrived she grabbed every mic so nobody would be embarrassed, and now she sings every song herself, perfectly.',
      tags: ['aquatic', 'beast', 'folk'],
    },
  });

  // ====================================================================== encounters
  // Early groups (min <= 0.1) are the tutorials: a lone Fussy Foghorn (kappa), a lone Coin Crab (tanuki_bandit), a lone Tuning Forkling
  // (kodama), a lone Squeezebox (karakasa). (The kodama and kappa pair moved to min 0.12 when the kodama was strengthened: at min 0 a
  // group must stay under 9 average damage.) `min` only gates a group IN (nothing phases the easy ones out), so the late groups carry
  // weight 2 and the gentle solos 1 or 2: at tile diff 1 about half the pool is the second half of the list. Summoners never share a
  // group (two kodama would both roll "call_leaf_imp" against the same Sidekick count and overshoot the cap of 2).
  DATA.addEncounters(1, {
    normal: [
      { id: 'ch1_kappa_solo', enemies: ['kappa'], w: 2, min: 0 },
      { id: 'ch1_bandit_solo', enemies: ['tanuki_bandit'], w: 2, min: 0 },
      { id: 'ch1_kodama_solo', enemies: ['kodama'], w: 1, min: 0 },
      { id: 'ch1_kodama_kappa', enemies: ['kodama', 'kappa'], w: 2, min: 0.12 },
      { id: 'ch1_karakasa_solo', enemies: ['karakasa'], w: 1, min: 0.1 },
      { id: 'ch1_sprite_pair', enemies: ['bamboo_sprite', 'bamboo_sprite'], w: 2, min: 0.15 },
      { id: 'ch1_cub_solo', enemies: ['oni_cub'], w: 1, min: 0.2 },
      { id: 'ch1_bandit_kodama', enemies: ['tanuki_bandit', 'kodama'], w: 2, min: 0.2 },
      { id: 'ch1_crow_solo', enemies: ['crow_tengu'], w: 1, min: 0.25 },
      { id: 'ch1_mushroom_kappa', enemies: ['mushroom_folk', 'kappa'], w: 2, min: 0.3 },
      { id: 'ch1_boar_solo', enemies: ['bamboo_boar'], w: 1, min: 0.3 },
      { id: 'ch1_wisp_cluster', enemies: ['hitodama', 'ember_wisp', 'ember_wisp'], w: 2, min: 0.35 },
      { id: 'ch1_hitodama_cub', enemies: ['hitodama', 'oni_cub'], w: 2, min: 0.4 },
      { id: 'ch1_karakasa_kappa', enemies: ['karakasa', 'kappa'], w: 2, min: 0.45 },
      { id: 'ch1_hitodama_crow', enemies: ['hitodama', 'crow_tengu'], w: 2, min: 0.5 },
      { id: 'ch1_crow_sprite', enemies: ['crow_tengu', 'bamboo_sprite'], w: 2, min: 0.5 },
      { id: 'ch1_karakasa_mushroom', enemies: ['karakasa', 'mushroom_folk'], w: 2, min: 0.55 },
      { id: 'ch1_boar_sprite', enemies: ['bamboo_boar', 'bamboo_sprite'], w: 2, min: 0.6 },
      { id: 'ch1_sprite_swarm', enemies: ['bamboo_sprite', 'bamboo_sprite', 'kodama'], w: 2, min: 0.65 },
      { id: 'ch1_cub_pack', enemies: ['oni_cub', 'oni_cub'], w: 2, min: 0.75 },
      { id: 'ch1_tengu_pair', enemies: ['crow_tengu', 'crow_tengu'], w: 2, min: 0.8 },
    ],
    elite: [
      { id: 'ch1_moss_guardian', enemies: ['moss_guardian'], w: 2, min: 0.25 },
      { id: 'ch1_oni_brute', enemies: ['oni_brute'], w: 2, min: 0.3 },
      { id: 'ch1_tengu_duelist', enemies: ['tengu_duelist'], w: 2, min: 0.4 },
    ],
    boss: 'boss_kuzunoha',
  });
})();
