// Inkwoven -- chapter 1 roster: the Whispering Bamboo Grove (forest spirits and folk monsters, the teaching chapter).
// Content only: one IIFE that registers 10 normals, 3 elites, 3 minions and the boss into DATA.enemies, then the
// chapter's encounter pools into DATA.encounters[1]. No functions in the data, no random calls, no dashes.
//
// HOW THE ROSTER TEACHES. Fights with a real deck last 2 to 6 turns, so an enemy's FIRST one or two actions carry its identity and
// the rest of its cycle is what a slow player meets. Each normal owns one lesson, the elites combine two, the boss examines all.
//   kappa          Vulnerable and Block: Muddy Slap leaves the front hero Vulnerable, so the River Claw after it lands x1.5; then a
//                  guard turn, and a dish it refills once at half HP.
//   tanuki_bandit  Priorities: it OPENS with Snatch and Grab (20 gold, telegraphed from turn 1), thumps, then dashes off. Killing it
//                  first returns the gold as a gold event; letting it run loses it. In company it escapes far more often.
//   kodama         Kill the caller: it opens by calling a Leaf Imp, rattles BOTH heroes lightly, and calls again once its imp is gone.
//   karakasa       Frail and Block: two hops, snaps shut (Block 8, a wall on your next turn), a lick that leaves Frail, hops again.
//   hitodama       Cheap hits: starts with Dodge 1, burns (unblockable), scatters scorch cards into the draw pile, immune to Burn.
//   oni_cub        Tempo: Ritual gives it +1 Might every round, so a slow kill costs more with every turn.
//   crow_tengu     The two rows: pecks anyone, dives at the back row, and swaps your heroes out of position. Weighted, never repeats twice.
//   bamboo_sprite  Many small hits: three 2-damage cuts at random heroes, and a whetted blade after two flurries. Comes in packs.
//   mushroom_folk  Poison and Thorns: grows its cap FIRST (Thorns 2, again every 4th turn), Poison spores after; immune to Poison.
//   bamboo_boar    Reading the heavy: Plating, a bristle, then a telegraphed 14 damage gore, then a barge.
//   oni_brute      Weak and rage: backhand with Weak, twin swing, mountain smash; below half HP a bellow (Block 8, Weak on both heroes)
//                  and Might 2 for the rest of the fight.
//   tengu_duelist  Back row, Dodge and the riposte: lunge at the back hero, a step that raises Dodge 2, three thrusts; a hook returns 3
//                  damage the first time it loses HP each round; at half HP the blade dance (Dodge 3, Might 1).
//   moss_guardian  A wall: opens by shaking out 2 Leaf Imps, Plating 3 and Thorns 2 from the start, a slow fist and slam, and every 4th
//                  turn the moss thickens (+1 Plating, +1 Thorns). Poison and non-flurry hits are the answer.
//
// NUMBERS (CONTENT_SPEC 4.2, Trial 0), before Might and Vulnerable. Normal hits 4 to 9 (heavy 12 to 14; multi hits and the
// both-heroes rattle are lighter per hit), elite single hits 8 to 14, minion hits 2 to 5, boss hits 9 to 13 (heavy 16 to 20; the
// biggest round is 24 in the first form and 30 in the second). A group's summed average round damage (DATA.audit's metric: the seq or
// weighted average of dmg n * hits per enemy, minions free) stays under 16 for normal groups and 22 for elites. Pairs and swarms carry
// 8 or more; solos with a guard turn cannot (a solo kappa is 4.3) and are the gentle openers. Summoners keep at most 2 living summons.
// Reference results with the real engine and the greedy bot (Hanae and Kuro, 40 seeds), starter deck / a developed deck:
//   normal groups 1.9 to 4.6 turns, HP lost 2 to 26 (pooled 3.2 turns and about 11 HP with the developed deck, solos about 2.1 turns)
//   elites 6.3 / 5.1 (guardian), 6.4 / 5.1 (brute), 7.6 / 6.1 (duelist) turns; 50 / 33, 44 / 28, 58 / 38 HP lost
//   boss 16 / 10.8 turns, 107 / 63 HP lost, won 84 percent / 100 percent
// Enemy Block and Plating gained in the enemy phase last through the hero's next turn: a `defend` intent is a free window THIS turn
// and a wall NEXT turn. A `dur` status an enemy puts on itself needs n 2 to survive the end-of-round tick (heroes get the fresh flag).
//
// Kuzunoha, the boss. Turn 1 she folds two paper kodama out of her tails (open), then cycles Ink Strike, Bleed the Page (2 blots into
// the draw pile), the telegraphed Great Brush Stroke (heavy 20), Brush Flurry (4 random hits) and Tail Sweep (both heroes). Rules:
// a Mask Gaze (Weak and Frail on both) every 5th turn (every 6th in the second form), Ink Needle at the weakest hero whenever one is below 30 percent HP, a
// re-fold if the kodama are all gone by turn 8, and Frayed Ink (Might 2 and Ritual 1) from turn 14, so stalling is punished.
// Below half HP (the one phases entry) the mask splits: debuffs wash off, +1 Might, she is Vulnerable for two rounds (n 2 so it outlasts
// the tick) and the two halves of the mask become paper kodama (never more than 2 alive). Her second form opens with Nine Tails Rise
// (Block 5, a breath for the party) and cycles Nine-Tail Storm, Ink Strike, Tail Sweep, Bleed the Page, Rise: the storm is nine random
// hits of 2 plus Might, 27 in all, every fifth turn. It is answerable: Block on BOTH heroes, Weak on her (each 3 becomes 2, so 27
// becomes 18), Dodge, or Taunt (random hits go to the taunter) plus Thorns to punish all nine.
(() => {
  DATA.add('enemies', {
    // ------------------------------------------------------------------ normals
    kappa: {
      id: 'kappa', name: 'Kappa', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        mud_slap: { name: 'Muddy Slap', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }] },
        river_claw: { name: 'River Claw', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }] },
        shell_guard: { name: 'Shell Guard', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }], say: 'Manners first!' },
        refill_dish: { name: 'Refill Dish', kind: 'heal', fx: [{ op: 'heal', n: 6, tgt: 'self' }], say: 'Ahh. Much better.' },
      },
      ai: { seq: ['mud_slap', 'river_claw', 'shell_guard'], rules: [{ if: { hpLt: 0.5 }, do: 'refill_dish', once: true }] },
      art: { id: 'kappa' },
      lore: 'A river imp who keeps a small pond on his head and a large amount of pride. He fights fair and fights hard, right up until the water spills.',
      tags: ['aquatic', 'spirit'],
    },

    tanuki_bandit: {
      id: 'tanuki_bandit', name: 'Tanuki Bandit', chapter: 1, tier: 'normal', size: 'm', hp: [30, 34],
      moves: {
        club_thump: { name: 'Club Thump', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
        snatch_and_grab: { name: 'Snatch and Grab', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'stealGold', n: 20 }], say: 'Nice purse. Mine now!' },
        dash_off: { name: 'Dash Off', kind: 'flee', fx: [{ op: 'flee' }], say: 'Catch me if you can!' },
      },
      ai: { seq: ['snatch_and_grab', 'club_thump', 'dash_off'] },
      art: { id: 'tanuki_bandit' },
      lore: 'The tanuki of the bamboo road will lighten your purse and swear the gold was only leaves. Catch him before the last bend and the leaves turn back into gold.',
      tags: ['beast', 'folk'],
    },

    kodama: {
      id: 'kodama', name: 'Kodama', chapter: 1, tier: 'normal', size: 's', hp: [20, 24],
      moves: {
        rattle: { name: 'Rattle', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'both' }], say: 'Kata kata kata!' },
        branch_poke: { name: 'Branch Poke', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'front' }] },
        call_leaf_imp: { name: 'Call Leaf Imp', kind: 'summon', fx: [{ op: 'summon', enemy: 'leaf_imp', n: 1 }], say: 'Come out, come out!' },
      },
      ai: { open: ['call_leaf_imp'], seq: ['rattle', 'branch_poke'], rules: [{ if: { turnGte: 4, minions: { lt: 1 } }, do: 'call_leaf_imp' }] },
      art: { id: 'kodama' },
      lore: 'A tree spirit no bigger than a lantern, rattling its head like a gourd. It hears everything the grove hears, and when it gets lonely it calls for friends.',
      tags: ['spirit'],
    },

    karakasa: {
      id: 'karakasa', name: 'Karakasa', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        tongue_lick: { name: 'Long Lick', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'status', s: 'frail', n: 1, tgt: 'front' }], say: 'Blegh!' },
        hop_hop: { name: 'Hop, Hop!', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 2, tgt: 'front' }] },
        snap_shut: { name: 'Snap Shut', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
      },
      ai: { seq: ['hop_hop', 'snap_shut', 'tongue_lick', 'hop_hop'] },
      art: { id: 'karakasa' },
      lore: 'An old umbrella that dreamed of walking and, one rainy night, got its wish. It hops, it snaps, and it will absolutely lick you, for reasons nobody has explained.',
      tags: ['spirit', 'construct'],
    },

    hitodama: {
      id: 'hitodama', name: 'Hitodama', chapter: 1, tier: 'normal', size: 's', hp: [20, 24],
      start: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }],
      immune: ['burn'],
      moves: {
        ember_touch: { name: 'Ember Touch', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        scorch_scatter: { name: 'Scatter Sparks', kind: 'debuff', fx: [{ op: 'add', card: 'status_scorch', n: 1, to: 'draw' }] },
      },
      ai: { weighted: [['ember_touch', 3], ['scorch_scatter', 2]], noRepeat: 2 },
      art: { id: 'hitodama' },
      lore: 'A soul-flame that never learned which way the road home was, so it drifts toward warm things. Please do not be warm near it.',
      tags: ['spirit'],
    },

    oni_cub: {
      id: 'oni_cub', name: 'Oni Cub', chapter: 1, tier: 'normal', size: 'm', hp: [32, 38],
      start: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }],
      moves: {
        horn_butt: { name: 'Horn Butt', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
        tantrum: { name: 'Tantrum', kind: 'multi', fx: [{ op: 'dmg', n: 3, hits: 2, tgt: 'front' }], say: 'WAAAH!' },
      },
      ai: { seq: ['horn_butt', 'tantrum'] },
      art: { id: 'oni_cub' },
      lore: 'A very small oni with very large opinions. It gets angrier every minute it is ignored, and it has a great many minutes.',
      tags: ['spirit', 'folk'],
    },

    crow_tengu: {
      id: 'crow_tengu', name: 'Crow Tengu', chapter: 1, tier: 'normal', size: 'm', hp: [30, 36],
      moves: {
        peck_flurry: { name: 'Peck Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 3, hits: 3, tgt: 'random' }] },
        dive_bomb: { name: 'Dive Bomb', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'back' }], say: 'Behind you!' },
        switcheroo: { name: 'Switcheroo', kind: 'special', fx: [{ op: 'swap' }, { op: 'dmg', n: 4, tgt: 'front' }], say: 'Shuffle, shuffle!' },
      },
      ai: { weighted: [['peck_flurry', 3], ['dive_bomb', 2], ['switcheroo', 1]], noRepeat: 2 },
      art: { id: 'crow_tengu' },
      lore: 'A lesser tengu, all feathers and mischief, who believes the best game is swapping places. It dives at whoever is standing behind you.',
      tags: ['avian', 'folk'],
    },

    bamboo_sprite: {
      id: 'bamboo_sprite', name: 'Bamboo Sprite', chapter: 1, tier: 'normal', size: 's', hp: [20, 24],
      moves: {
        leaf_flurry: { name: 'Leaf Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 2, hits: 3, tgt: 'random' }] },
        whet_blades: { name: 'Whet Blades', kind: 'buff', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['leaf_flurry', 'leaf_flurry', 'whet_blades'] },
      art: { id: 'bamboo_sprite' },
      lore: 'Leaf-bladed sprites born where the bamboo grows thickest. Each is a small nuisance, and the trouble is that they never come alone.',
      tags: ['spirit'],
    },

    mushroom_folk: {
      id: 'mushroom_folk', name: 'Mushroom Folk', chapter: 1, tier: 'normal', size: 'm', hp: [28, 34],
      immune: ['poison'],
      moves: {
        spore_puff: { name: 'Spore Puff', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'status', s: 'poison', n: 3, tgt: 'front' }] },
        thicken_cap: { name: 'Thicken Cap', kind: 'buff', fx: [{ op: 'status', s: 'thorns', n: 2, tgt: 'self' }] },
        cap_bonk: { name: 'Cap Bonk', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
      },
      ai: { open: ['thicken_cap'], seq: ['spore_puff', 'cap_bonk'], rules: [{ if: { turnEvery: [4, 3] }, do: 'thicken_cap' }] },
      art: { id: 'mushroom_folk' },
      lore: 'A wandering spore-cap, gentle until you swing at it. Its cap grows thorny in the damp, and its breath is best left unbreathed.',
      tags: ['folk'],
    },

    bamboo_boar: {
      id: 'bamboo_boar', name: 'Bamboo Boar', chapter: 1, tier: 'normal', size: 'l', hp: [36, 38],
      start: [{ op: 'status', s: 'plating', n: 3, tgt: 'self' }],
      moves: {
        shoulder_barge: { name: 'Shoulder Barge', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
        bristle: { name: 'Bristle Up', kind: 'buff', fx: [{ op: 'status', s: 'plating', n: 2, tgt: 'self' }], say: 'Snort.' },
        gore: { name: 'Bamboo Gore', kind: 'heavy', fx: [{ op: 'dmg', n: 14, tgt: 'front' }] },
      },
      ai: { seq: ['bristle', 'gore', 'shoulder_barge'] },
      art: { id: 'bamboo_boar' },
      lore: 'A boar that has eaten so much bamboo its hide has turned to green armour. It paws the earth once, thinks about it, and charges.',
      tags: ['beast'],
    },

    // ------------------------------------------------------------------ elites
    oni_brute: {
      id: 'oni_brute', name: 'Oni Brute', chapter: 1, tier: 'elite', size: 'l', hp: [82, 85],
      moves: {
        backhand: { name: 'Bruising Backhand', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front' }, { op: 'status', s: 'weak', n: 1, tgt: 'front' }] },
        twin_swing: { name: 'Twin Swing', kind: 'multi', fx: [{ op: 'dmg', n: 8, hits: 2, tgt: 'front' }] },
        club_smash: { name: 'Mountain Smash', kind: 'heavy', fx: [{ op: 'dmg', n: 14, tgt: 'front' }], say: 'SMAAASH!' },
        enraged_bellow: { name: 'Enraged Bellow', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'status', s: 'weak', n: 1, tgt: 'both' }], say: 'KNEEL, LITTLE HEROES!' },
      },
      ai: { seq: ['backhand', 'twin_swing', 'club_smash'] },
      phases: [{
        at: 0.5, say: 'You dare laugh at a champion?!',
        fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }],
        ai: { open: ['enraged_bellow'], seq: ['club_smash', 'twin_swing', 'backhand'] },
      }],
      art: { id: 'oni_brute' },
      lore: 'A champion of the mountain oni, sent down to test whether the grove\'s heroes are as brave as the songs say. He was famous once, and he is furious that the songs stopped.',
      tags: ['spirit', 'folk'],
    },

    tengu_duelist: {
      id: 'tengu_duelist', name: 'Tengu Duelist', chapter: 1, tier: 'elite', size: 'l', hp: [72, 80],
      moves: {
        lunge: { name: 'Piercing Lunge', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'back' }], say: 'Guard your rear, if you can.' },
        riposte_step: { name: 'Riposte Step', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }, { op: 'status', s: 'dodge', n: 2, tgt: 'self' }] },
        triple_thrust: { name: 'Triple Thrust', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 3, tgt: 'front' }] },
        blade_dance: { name: 'Blade Dance', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 3, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }], say: 'Now we begin properly.' },
      },
      ai: { seq: ['lunge', 'riposte_step', 'triple_thrust'], rules: [{ if: { hpLt: 0.5 }, do: 'blade_dance', once: true }] },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'dmg', n: 3, tgt: 'front' }] }],
      art: { id: 'tengu_duelist' },
      lore: 'A tengu who took up the blade at nine hundred and has not lost since. He bows before every strike, and he does not bow after.',
      tags: ['avian', 'folk'],
    },

    moss_guardian: {
      id: 'moss_guardian', name: 'Moss Guardian', chapter: 1, tier: 'elite', size: 'l', hp: [74, 80],
      start: [{ op: 'status', s: 'plating', n: 3, tgt: 'self' }, { op: 'status', s: 'thorns', n: 2, tgt: 'self' }],
      moves: {
        moss_fist: { name: 'Mossy Fist', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'front' }] },
        mountain_slam: { name: 'Mountain Slam', kind: 'heavy', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        shake_leaves: { name: 'Shake Loose Leaves', kind: 'summon', fx: [{ op: 'summon', enemy: 'leaf_imp', n: 2 }], say: 'The grove wakes.' },
        moss_thicken: { name: 'Moss Thickens', kind: 'buff', fx: [{ op: 'status', s: 'plating', n: 1, tgt: 'self' }, { op: 'status', s: 'thorns', n: 1, tgt: 'self' }] },
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
      lore: 'A shrine guardian so old the moss has grown into its bones. It was told to keep the grove safe, and nobody ever told it to stop.',
      tags: ['construct', 'spirit'],
    },

    // ------------------------------------------------------------------ minions
    ember_wisp: {
      id: 'ember_wisp', name: 'Ember Wisp', chapter: 1, tier: 'minion', size: 's', hp: [6, 8],
      immune: ['burn'],
      moves: {
        flare: { name: 'Flare', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        fizzle: { name: 'Fizzle Out', kind: 'flee', fx: [{ op: 'flee' }] },
      },
      ai: { seq: ['flare', 'fizzle'] },
      art: { id: 'ember_wisp' },
      lore: 'A spark that broke off a hitodama. It burns exactly once, brilliantly, and then goes out with a small polite pop.',
      tags: ['spirit'],
    },

    leaf_imp: {
      id: 'leaf_imp', name: 'Leaf Imp', chapter: 1, tier: 'minion', size: 's', hp: [6, 8],
      moves: {
        leaf_poke: { name: 'Leaf Poke', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front' }] },
      },
      ai: { seq: ['leaf_poke'] },
      art: { id: 'leaf_imp' },
      lore: 'A sprite made of one leaf and one bad idea. Kodama and old guardians call them, and they always come running.',
      tags: ['spirit'],
    },

    paper_kodama: {
      id: 'paper_kodama', name: 'Paper Kodama', chapter: 1, tier: 'minion', size: 's', hp: [6, 6],
      moves: {
        ink_smudge: { name: 'Ink Smudge', kind: 'debuff', fx: [{ op: 'add', card: 'status_blot', n: 1, to: 'draw' }] },
        paper_slap: { name: 'Paper Slap', kind: 'attack', fx: [{ op: 'dmg', n: 2, tgt: 'front' }] },
      },
      ai: { seq: ['ink_smudge', 'paper_slap'] },
      art: { id: 'paper_kodama' },
      lore: 'A hollow doll folded from a torn page and given a face by the fox\'s brush. It carries a little of the Blank inside, and it spills.',
      tags: ['construct', 'void'],
    },

    // ------------------------------------------------------------------ boss
    boss_kuzunoha: {
      id: 'boss_kuzunoha', name: 'Kuzunoha', title: 'The Nine-Tail Ink Fox', chapter: 1, tier: 'boss', size: 'xl', hp: [170, 178],
      immune: ['stun'],
      moves: {
        paper_fold: { name: 'Paper Fold', kind: 'summon', fx: [{ op: 'summon', enemy: 'paper_kodama', n: 2 }], say: 'Fold, little pages. Fold, and live.' },
        ink_strike: { name: 'Ink Strike', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front', el: 'ink' }], say: 'Every stroke is a sentence.' },
        brush_flurry: { name: 'Brush Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 4, tgt: 'random', el: 'ink' }], say: 'Let me write you smaller.' },
        ink_bleed: { name: 'Bleed the Page', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_blot', n: 2, to: 'draw' }], say: 'Words run. So does ink.' },
        tail_sweep: { name: 'Tail Sweep', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'both', el: 'ink' }], say: 'Turn the page!' },
        great_stroke: { name: 'Great Brush Stroke', kind: 'heavy', fx: [{ op: 'dmg', n: 20, tgt: 'front', el: 'ink' }], say: 'One great stroke.' },
        mask_gaze: { name: 'Mask Gaze', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'frail', n: 1, tgt: 'both' }], say: 'Look at me. Look, and forget.' },
        ink_needle: { name: 'Ink Needle', kind: 'attack', fx: [{ op: 'dmg', n: 11, tgt: 'lowest', el: 'ink' }], say: 'Ah. There you are, little one.' },
        tails_rise: { name: 'Nine Tails Rise', kind: 'defend', fx: [{ op: 'block', n: 5, tgt: 'self' }], say: 'Nine tails... one stroke.' },
        nine_tails: { name: 'Nine-Tail Storm', kind: 'multi', fx: [{ op: 'dmg', n: 2, hits: 9, tgt: 'random', el: 'ink' }], say: 'NINE TAILS. ONE STROKE!' },
        frayed_ink: { name: 'Frayed Ink', kind: 'buff', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }, { op: 'status', s: 'ritual', n: 1, tgt: 'self' }], say: 'The page is running out.' },
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
        at: 0.5, say: 'You broke the mask. Very well, little storybook. Read my TRUE tails!',
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
      lore: 'A white fox who learned to write and never stopped. Each of her nine tails ends in a brush, and every stroke rewrites a little more of the grove.',
      tags: ['spirit', 'beast'],
    },
  });

  // ---------------------------------------------------------------------- encounters
  // Early groups (min <= 0.1) are the tutorials: a lone kappa, a lone bandit, kodama with a kappa, a lone karakasa. `min` only gates a
  // group IN (nothing phases the easy ones out), so the late groups carry weight 2 and the gentle solos 1 or 2: at tile diff 1 about
  // half the pool is the second half of the list. Summoners never share a group (two kodama would both roll "call" against the same
  // minion count and overshoot the cap of 2).
  DATA.addEncounters(1, {
    normal: [
      { id: 'ch1_kappa_solo', enemies: ['kappa'], w: 2, min: 0 },
      { id: 'ch1_bandit_solo', enemies: ['tanuki_bandit'], w: 2, min: 0 },
      { id: 'ch1_kodama_kappa', enemies: ['kodama', 'kappa'], w: 2, min: 0 },
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
