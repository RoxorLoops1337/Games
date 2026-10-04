// Hocus Vocus: Act III roster (chapter 3): The Perfect Stage, the biggest talent show in the world, floating above a sea of phone
// lights, where every act is perfect and nobody sings.
// Owner: the Act III enemy designer. Pure data: DATA.add('enemies', ...) and DATA.addEncounters(3, ...).
// Schema and AI rules: DESIGN.md 4.5. Numbers: CONTENT_SPEC.md 4.2 (no encore, chapter 3). No functions, no dashes,
// no randomness of its own (never the banned random call). Ids, names, tiers and sizes are the fixed roster (DATA.ROSTER).
// Every name, title, move name, bark, phase line, lore line and tag is copied from hocus_vocus/plan/HV_ENEMIES.md section 4; ids, numbers,
// ops and AI never change for the re-theme. Tags are display only (the Who's Who chips).
//
// THEME OF THE ACT. Act I taught the spots, Act II pinned them in place. Act III goes after the player's HAND and the player's
// SETUP. The Gloss never hurts anyone on purpose, it polishes: cards are airbrushed (status_redacted), glossed over (status_blot),
// left one Breath short (status_wilt), Block and buffs and hero resource stacks are smoothed away, and the applause and the confetti
// hit both heroes at once. Almost every enemy asks one question of the player, and the answer is always a decision about tempo: spend
// it before it is smoothed away, win over the caller before the junk piles up, swap the wrong hero out of the way of the Starstruck,
// stop stacking Block against a move that smooths right through it.
//
// THE ROSTER, one line each (the pattern the player learns, and the answer). Signature moves are front-loaded: a fight against a good
// deck lasts two to four enemy actions, so the thing an enemy is known for must show in its first two.
//   storm_drone       Tuner Drone. Triple Beep in threes, Autocorrect on both heroes (and a status_static card), Retunes once at half
//                     HP. Win it over before the Retune.
//   komainu_guardian  VIP Bouncer. Arms Crossed (Feedback 6 and Block for one turn), Big Bounce (telegraphed, drops the Feedback),
//                     Rope Swat. Hit it the turn after the bounce. A VIP Glare at 40 percent.
//   redaction_knight  Clapperboard Knight. Take Two then two big Clapper Cleaves. Every Take Two adds a status_redacted card; That's a
//                     Wrap closes the set (Sequins) at half HP; one last junk card when it is won over.
//   void_scribe       Chrome Siren. Pitch Correction (strips every buff, adds status_blot cards), Smooth Croon, Robo Wail. Corrects
//                     again early whenever it sees Volume 2 or more.
//   blank_soldier     Synchro Dancer. In Formation grows with every living enemy (8 alone, 14 in a crowd), Close Ranks covers the
//                     whole line. Break the formation.
//   sky_serpent       Streamer Dragon. Confetti Blast: three hits on the BACKING spot, Streamer Lash, Ribbon Twirl (Shimmy 2). Pop
//                     the Shimmy cheaply; protect or swap the backing hero.
//   eraser_wraith     Airbrush Wraith. Smooth Over first: a piercing hit that GROWS with the lead hero's Block, then Soft Focus.
//                     Wipe the Wobbles (every hero resource stack) when a hero hoards 3 or more.
//   thunder_crow      Ring Light Sentinel. A telegraphed Blinding Dive that leaves the lead hero Starstruck right away, then Strobe
//                     Flash on the backing spot twice, then it dims down. Choose who takes the Starstruck.
//   paper_golem       Sequin Golem. Sequin Up adds Sequins, Sparkle Slam reads those Sequins, and every round you hurt it one stack
//                     of Sequins flicks off. Keep hurting it, never let it sequin up twice.
//   margin_imp        Glitch Gremlin. Glitch Out calls a Pitch Glitch, Robot Voice (a status_wilt card), Glitch Loop, and it calls
//                     once more at half HP. The glitches and the junk cards are the real threat.
//   censor_golem      Big Mute Button. Button Smash, Mute All, Hover Over (the quiet turn), then MUTED: 28 and Exposed. A
//                     Starstruck on the hover turn cancels it. At half HP it presses at once.
//   storm_whelp       Applause Sign. Light the Bulbs (Rumble, status id charge), Slow Clap, then Roaring Applause on BOTH heroes
//                     reads the Rumble and spends it. Every round you hurt it adds Rumble (a clock). Pop the Confetti calls
//                     Confetti Poppers.
//   black_bar_inquisitor  Mannequin Judge. Strings Attached (Tangled, plus a status_tangle card to cut it), Dazzling Smile
//                     (Starstruck), Big Red Buzzer, Pick Apart (lowest hero). Final Score on even turns while a hero is below 40
//                     percent.
//   boss_editor       Flawless, Star of the Perfect Stage. Form 1, Flawless: Just a Tiny Note leaves the lead hero Exposed, the
//                     Lip-Sync Flurry follows (swap the exposed hero out), Perfect Cut airbrushes the next draw. Form 2, the Filter
//                     (66 percent): Smooth Everything wipes buffs and resources, Smooth Over pierces Block, Selfie Arm Swipe, Beauty
//                     Mode on both. Form 3, the Gloss (33 percent): the mirror opens with junk cards and Mute the World, a hit on BOTH
//                     heroes that GROWS with every living enemy, so win over the clones and poppers before it lands; Perfect Copy,
//                     Mirror Gaze, Mute the World again, and The Final Polish. Each transition sheds Muffled and Exposed but leaves
//                     Earworm and Sizzle alone. The lesson is the same in every form: the Headliner telegraphs what it will take,
//                     and the answer is to stop leaving it there.
//
// FIGHT LENGTH. Balance is measured in tests/hocus_vocus_enemies_3.test.mjs against synthetic decks (early, mid, late, and a Headliner
// deck with a +1 Breath Charm and a curse). If the balance wave retunes HP, the knobs are `hp` (Headliner 440 to 460 and Rivals 136 to
// 152 of the 420 to 480 and 120 to 165 bands), the Smooth Over and Mute the World caps, and the Rumble (charge) and Sequins (plating)
// steps; every number is a plain constant in the move it belongs to.
//
// SUMMON CAP. A summoner never has more than 2 living Sidekicks: every summon that is not an opener is gated by minions:{lt:2}
// (or lt:1 for a two-summon move). Encounter groups never pair two summoners and never pre-seed a Sidekick next to an opener that
// summons past 2.
// LANES. Groups list the smallest enemy first (lane 0 side) and the largest last, so tall sprites sit at the back. Enemies act in
// lane order, so a group lists a support caster first when it should act before the bruiser.
// MIXED INTENTS. Every roster line mixes at least two intent kinds; kinds are honest (the validator checks the ops behind each icon).
//
// BALANCE PASS 1 (balance bot report 1). Flawless is untouched. Fights lost to Act III normals were concentrated in the encounters
// that hold a komainu_guardian (a lone VIP Bouncer cost 2.6 times its peers: Feedback, Block, a 4.6 turn fight and a 24 bounce) and in
// the formation groups (In Formation read 14 per dancer in a crowd, 42 a round for three). Changes: komainu_guardian HP 74 to 80 down to
// 58 to 64, Feedback 6 to 5, Big Bounce 24 to 19, Rope Swat 11 to 10, VIP Glare Volume 2 to 1 (ch3_stone_gate and ch3_rubbed_out cost a
// third and a quarter less); blank_soldier In Formation 5 + 3 per enemy (cap 14) is now 4 + 3 per enemy (cap 12): 7 alone, 10 in a
// pair, 12 in a line, so a three dancer group peaks at 36 instead of 42 a round and the readable answer (break the formation) is
// unchanged; thunder_crow HP 46 to 52 down to 42 to 48; paper_golem Glitter Swing 14 to 13 and Sparkle Slam 15 + Sequins (cap 26) to
// 14 (cap 25); censor_golem HP 140 to 152 down to 126 to 138, MUTED 28 to 26 and Hover Over 18 to 16 Block. The soft end was raised a
// step: storm_drone Triple Beep 5x3 to 6x3 and Autocorrect 5 to 6, void_scribe Smooth Croon 11 to 12 (HP 50 to 54), margin_imp Robot
// Voice 12 to 13 (HP 46 to 50), black_bar_inquisitor Big Red Buzzer 18 to 19 and Pick Apart 8x2 to 9x2.
// Balance checks live in tests/hocus_vocus_enemies_3.test.mjs (bands, coverage, AI reachability, real engine fights).
(() => {
  DATA.add('enemies', {
    // ==================================================================================================================
    // CREATURES (normal)
    // ==================================================================================================================
    storm_drone: {
      id: 'storm_drone', name: 'Tuner Drone', chapter: 3, tier: 'normal', size: 'm',
      hp: [52, 58],
      moves: {
        jab: { name: 'Triple Beep', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'front', el: 'lightning' }] },
        arc: { name: 'Autocorrect', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'both', el: 'lightning' }, { op: 'add', card: 'status_static', n: 1, to: 'discard' }] },
        overclock: { name: 'Retune', kind: 'buff', say: 'BEEP. BEEP. BEEEEP.', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { weighted: [['jab', 3], ['arc', 2]], noRepeat: 2, rules: [{ if: { hpLt: 0.5 }, do: 'overclock', once: true }] },
      art: { id: 'storm_drone' },
      lore: 'A tiny chrome drone that hums one perfectly tuned note and corrects anybody who hums another. It jabs three times because it can count that far, and it has never once tried four.',
      tags: ['construct', 'void'],
    },

    komainu_guardian: {
      id: 'komainu_guardian', name: 'VIP Bouncer', chapter: 3, tier: 'normal', size: 'l',
      hp: [58, 64],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        // arms crossed: Feedback and Block up for exactly one player turn. The bounce leaps out of the stance and drops the
        // Feedback, so the free window to hit it is the turn AFTER the bounce.
        stance: { name: 'Arms Crossed', kind: 'defend', say: 'Name?', fx: [{ op: 'block', n: 12, tgt: 'self' }, { op: 'status', s: 'thorns', n: 5, tgt: 'self' }] },
        pounce: { name: 'Big Bounce', kind: 'heavy', say: 'NOT ON THE LIST.', fx: [{ op: 'dmg', n: 19, tgt: 'front' }, { op: 'removeStatus', s: 'thorns', tgt: 'self' }] },
        claw: { name: 'Rope Swat', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front' }] },
        roar: { name: 'VIP Glare', kind: 'debuff', say: 'NOPE. NOPE. NOPE.', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['stance', 'pounce', 'claw'], rules: [{ if: { hpLt: 0.4 }, do: 'roar', once: true }] },
      art: { id: 'komainu_guardian' },
      lore: 'One of a pair of bouncers who guarded the rope line of the Perfect Stage. Its partner is gone and the rope is gone, but nobody told the bouncer, and it will not be the one to say so.',
      tags: ['construct', 'folk'],
    },

    redaction_knight: {
      id: 'redaction_knight', name: 'Clapperboard Knight', chapter: 3, tier: 'normal', size: 'm',
      hp: [58, 64],
      moves: {
        cleave: { name: 'Clapper Cleave', kind: 'attack', fx: [{ op: 'dmg', n: 15, tgt: 'front' }] },
        strike: { name: 'Take Two', kind: 'attack', fx: [{ op: 'dmg', n: 11, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        blackout: { name: 'That\'s a Wrap', kind: 'defend', say: 'Quiet on set.', fx: [{ op: 'block', n: 14, tgt: 'self' }, { op: 'status', s: 'plating', n: 3, tgt: 'self' }] },
      },
      ai: { seq: ['strike', 'cleave', 'cleave'], rules: [{ if: { hpLt: 0.5 }, do: 'blackout', once: true }] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'add', card: 'status_redacted', n: 1, to: 'discard' }] }],
      art: { id: 'redaction_knight' },
      lore: 'A knight in clapperboard armour who stops every song after one line to start it again, properly. Somewhere inside is a knight who used to love the first take best.',
      tags: ['construct', 'folk'],
    },

    void_scribe: {
      id: 'void_scribe', name: 'Chrome Siren', chapter: 3, tier: 'normal', size: 'm',
      hp: [50, 54],
      moves: {
        ink: { name: 'Smooth Croon', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw' }] },
        erase: { name: 'Pitch Correction', kind: 'debuff', say: 'Let me fix that for you.', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'both' }, { op: 'add', card: 'status_blot', n: 2, to: 'draw' }] },
        blot: { name: 'Robo Wail', kind: 'attack', fx: [{ op: 'dmg', n: 14, tgt: 'front', el: 'ink' }] },
      },
      ai: { seq: ['erase', 'ink', 'blot'], rules: [{ if: { heroStatus: { s: 'might', gte: 2 } }, do: 'erase' }] },
      art: { id: 'void_scribe' },
      lore: 'It sings in a voice tuned so perfectly that there is no voice left in it at all. Its favourite hobby is correcting everyone else, starting with their power-ups.',
      tags: ['void', 'folk'],
    },

    blank_soldier: {
      id: 'blank_soldier', name: 'Synchro Dancer', chapter: 3, tier: 'normal', size: 'm',
      hp: [42, 48],
      moves: {
        march: { name: 'In Formation', kind: 'attack', fx: [{ op: 'dmg', n: { base: 4, per: 'enemies', mul: 3, cap: 12 }, tgt: 'front' }] },
        wall: { name: 'Close Ranks', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'allEnemies' }] },
      },
      ai: { seq: ['march', 'march', 'wall'] },
      art: { id: 'blank_soldier' },
      lore: 'Identical, smiling and dancing in perfect step without a sound: a choreographer\'s dream. Alone, it is a very quiet mannequin with jazz hands.',
      tags: ['void', 'folk'],
    },

    sky_serpent: {
      id: 'sky_serpent', name: 'Streamer Dragon', chapter: 3, tier: 'normal', size: 'l',
      hp: [70, 76],
      moves: {
        fang: { name: 'Confetti Blast', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'back' }] },
        tailwind: { name: 'Ribbon Twirl', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 2, tgt: 'self' }, { op: 'block', n: 8, tgt: 'self' }] },
        lash: { name: 'Streamer Lash', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
      },
      ai: { weighted: [['fang', 4], ['tailwind', 2], ['lash', 3]], noRepeat: 1 },
      art: { id: 'sky_serpent' },
      lore: 'A long ribbon of perfect pastel streamers that learned to hold a shape. It curls through the rafters looking for the softest hero at the back of the line, which is rude, and very festive.',
      tags: ['beast', 'void'],
    },

    eraser_wraith: {
      id: 'eraser_wraith', name: 'Airbrush Wraith', chapter: 3, tier: 'normal', size: 'm',
      hp: [48, 54],
      moves: {
        smudge: { name: 'Soft Focus', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        rub: { name: 'Smooth Over', kind: 'attack', say: 'Smooth. So smooth.', fx: [{ op: 'dmg', n: { base: 9, per: 'block', who: 'target', mul: 0.5, cap: 18 }, tgt: 'front', pierce: true }] },
        wipe: {
          name: 'Wipe the Wobbles',
          kind: 'debuff',
          fx: [
            { op: 'removeStatus', s: 'bloom', tgt: 'both' }, { op: 'removeStatus', s: 'sumi', tgt: 'both' },
            { op: 'removeStatus', s: 'ward', tgt: 'both' }, { op: 'removeStatus', s: 'charge', tgt: 'both' },
          ],
        },
      },
      ai: {
        seq: ['rub', 'smudge'],
        rules: [
          { if: { heroStatus: { s: 'bloom', gte: 3 } }, do: 'wipe' },
          { if: { heroStatus: { s: 'sumi', gte: 3 } }, do: 'wipe' },
          { if: { heroStatus: { s: 'ward', gte: 3 } }, do: 'wipe' },
          { if: { heroStatus: { s: 'charge', gte: 3 } }, do: 'wipe' },
        ],
      },
      art: { id: 'eraser_wraith' },
      lore: 'It drifts across the stage with one soft pastel hand held out, smoothing. Block, wobbles and hard-won stacks go glossy under it, like a photo with all the life airbrushed out.',
      tags: ['void', 'spirit'],
    },

    thunder_crow: {
      id: 'thunder_crow', name: 'Ring Light Sentinel', chapter: 3, tier: 'normal', size: 'm',
      hp: [42, 48],
      moves: {
        peck: { name: 'Strobe Flash', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 3, tgt: 'back', el: 'lightning' }] },
        dive: { name: 'Blinding Dive', kind: 'heavy', say: 'SMILE!', fx: [{ op: 'dmg', n: 18, tgt: 'front', el: 'lightning' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        perch: { name: 'Dim Down', kind: 'defend', fx: [{ op: 'block', n: 12, tgt: 'self' }] },
      },
      ai: { seq: ['dive', 'peck', 'peck', 'perch'] },
      art: { id: 'thunder_crow' },
      lore: 'A ring light that flew too close to the stage lights and came back brighter. It drops like a hammer made of glitter, then flashes the backing hero twice.',
      tags: ['construct', 'avian'],
    },

    paper_golem: {
      id: 'paper_golem', name: 'Sequin Golem', chapter: 3, tier: 'normal', size: 'l',
      hp: [76, 80],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        lumber: { name: 'Glitter Swing', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        fold: { name: 'Sequin Up', kind: 'defend', fx: [{ op: 'block', n: 12, tgt: 'self' }, { op: 'status', s: 'plating', n: 3, tgt: 'self' }] },
        slam: { name: 'Sparkle Slam', kind: 'heavy', say: 'FWOOSH.', fx: [{ op: 'dmg', n: { base: 14, per: 'status', s: 'plating', who: 'self', mul: 1, cap: 25 }, tgt: 'front' }] },
      },
      ai: { seq: ['fold', 'lumber', 'slam'] },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'status', s: 'plating', n: -1, tgt: 'self' }] }],
      art: { id: 'paper_golem' },
      lore: 'A giant stitched from a thousand stage costumes, every sequin perfectly in line. It is slow and it is big, and every layer it adds makes the next slam worse for you.',
      tags: ['construct', 'void'],
    },

    margin_imp: {
      id: 'margin_imp', name: 'Glitch Gremlin', chapter: 3, tier: 'normal', size: 'm',
      hp: [46, 50],
      moves: {
        call: { name: 'Glitch Out', kind: 'summon', say: 'Ooh, a new glitch!', fx: [{ op: 'summon', enemy: 'typo_sprite', n: 1 }] },
        doodle: { name: 'Robot Voice', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_wilt', n: 1, to: 'draw' }] },
        scribble: { name: 'Glitch Loop', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 3, tgt: 'front', el: 'ink' }] },
      },
      ai: { open: ['call'], seq: ['doodle', 'scribble'], rules: [{ if: { hpLt: 0.5, minions: { lt: 2 } }, do: 'call', once: true }] },
      art: { id: 'margin_imp' },
      lore: 'A gremlin that lives inside the Perfect Stage\'s tuning box and snaps every note to the grid. It keeps a very long list of your wobbles and plays it back, slowly.',
      tags: ['spirit', 'construct'],
    },

    // ==================================================================================================================
    // RIVALS (elite)
    // ==================================================================================================================
    censor_golem: {
      id: 'censor_golem', name: 'Big Mute Button', chapter: 3, tier: 'elite', size: 'l',
      hp: [126, 138],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        smack: { name: 'Button Smash', kind: 'attack', fx: [{ op: 'dmg', n: 16, tgt: 'front' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        censor: { name: 'Mute All', kind: 'attack', say: 'Nothing to hear here.', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 2, to: 'draw' }] },
        raise: { name: 'Hover Over', kind: 'defend', say: 'This will only take a moment.', fx: [{ op: 'block', n: 16, tgt: 'self' }, { op: 'status', s: 'plating', n: 2, tgt: 'self' }] },
        stamp: { name: 'MUTED', kind: 'heavy', say: 'MUTED.', fx: [{ op: 'dmg', n: 26, tgt: 'front' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }] },
      },
      ai: { seq: ['smack', 'censor', 'raise', 'stamp'] },
      phases: [{
        at: 0.5,
        say: 'THIS TRACK HAS BEEN MUTED FOR YOUR COMFORT.',
        fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 12, tgt: 'self' }],
        ai: { open: ['stamp'], seq: ['censor', 'smack', 'stamp'] },
      }],
      art: { id: 'censor_golem' },
      lore: 'Built by the Gloss to keep the Perfect Stage comfortable, it presses itself on anything too loud. Its face is one big button with a crossed-out speaker, and it only knows one word.',
      tags: ['construct', 'void'],
    },

    storm_whelp: {
      id: 'storm_whelp', name: 'Applause Sign', chapter: 3, tier: 'elite', size: 'l',
      hp: [136, 148],
      moves: {
        gather: { name: 'Light the Bulbs', kind: 'buff', say: 'Bzzzzzzzz...', fx: [{ op: 'status', s: 'charge', n: 3, tgt: 'self' }, { op: 'block', n: 10, tgt: 'self' }] },
        claws: { name: 'Slow Clap', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'front', el: 'lightning' }] },
        breath: { name: 'Neon Blaze', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'both', el: 'lightning' }, { op: 'add', card: 'status_scorch', n: 1, to: 'draw' }] },
        clap: {
          name: 'Roaring Applause',
          kind: 'heavy',
          say: 'APPLAUSE! APPLAUSE!',
          fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'charge', who: 'self', mul: 3, cap: 18 }, tgt: 'both', el: 'lightning' }, { op: 'removeStatus', s: 'charge', tgt: 'self' }],
        },
        call: { name: 'Pop the Confetti', kind: 'summon', fx: [{ op: 'summon', enemy: 'spark_mote', n: 1 }] },
      },
      ai: {
        open: ['gather'],
        seq: ['claws', 'clap', 'breath'],
        rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'call' }],
      },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      phases: [{
        at: 0.5,
        say: 'Every bulb on the sign blazes white.',
        fx: [{ op: 'status', s: 'charge', n: 3, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }],
        ai: {
          open: ['clap'],
          seq: ['claws', 'breath', 'clap'],
          rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'call' }],
        },
      }],
      art: { id: 'storm_whelp' },
      lore: 'A huge lit-up APPLAUSE sign that has not been switched off since the Perfect Stage opened. It soaks up every clap in the arena, and it gets a little more excited every time you hit it.',
      tags: ['construct', 'folk'],
    },

    black_bar_inquisitor: {
      id: 'black_bar_inquisitor', name: 'Mannequin Judge', chapter: 3, tier: 'elite', size: 'l',
      hp: [136, 148],
      moves: {
        chains: { name: 'Strings Attached', kind: 'debuff', say: 'Hold still. The score is not in yet.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'front' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        gavel: { name: 'Big Red Buzzer', kind: 'attack', fx: [{ op: 'dmg', n: 19, tgt: 'front' }] },
        hunt: { name: 'Pick Apart', kind: 'multi', fx: [{ op: 'dmg', n: 9, hits: 2, tgt: 'lowest' }] },
        gag: { name: 'Dazzling Smile', kind: 'attack', say: 'Silence, please. Smile.', fx: [{ op: 'dmg', n: 12, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        verdict: { name: 'Final Score', kind: 'heavy', say: 'Next!', fx: [{ op: 'dmg', n: { base: 14, per: 'missingHp', who: 'target', mul: 0.25, cap: 30 }, tgt: 'lowest' }] },
      },
      ai: {
        open: ['chains'],
        seq: ['gag', 'gavel', 'hunt'],
        rules: [{ if: { heroHpLt: 0.4, turnEvery: [2, 1] }, do: 'verdict' }],
      },
      art: { id: 'black_bar_inquisitor' },
      lore: 'A smiling mannequin in a judge\'s chair who decides the score before the song begins. It has never once been surprised by a singer, and it would very much like to keep it that way.',
      tags: ['folk', 'void'],
    },

    // ==================================================================================================================
    // SIDEKICKS (minion: size s, simple, one accent each)
    // ==================================================================================================================
    blank_page: {
      id: 'blank_page', name: 'Lip-Sync Clone', chapter: 3, tier: 'minion', size: 's',
      hp: [16, 20],
      moves: {
        drift: { name: 'Strike a Pose', kind: 'defend', fx: [{ op: 'block', n: 9, tgt: 'self' }] },
        wrap: { name: 'Copy Your Moves', kind: 'debuff', fx: [{ op: 'status', s: 'frail', n: 1, tgt: 'front' }] },
        cut: { name: 'Mirror Slap', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
      },
      ai: { seq: ['drift', 'wrap', 'cut'] },
      art: { id: 'blank_page' },
      lore: 'A smiling copy of a pop star, lip-syncing to a track nobody is singing. It strikes a pose, copies your moves, and wobbles anyone who tries to sing near it.',
      tags: ['void', 'folk'],
    },

    spark_mote: {
      id: 'spark_mote', name: 'Confetti Popper', chapter: 3, tier: 'minion', size: 's',
      hp: [14, 16],
      moves: {
        zap: { name: 'Big Pop', kind: 'attack', say: 'POP!', fx: [{ op: 'dmg', n: 9, tgt: 'front', el: 'lightning' }, { op: 'flee' }] },
      },
      ai: { seq: ['zap'] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front', el: 'lightning' }] }],
      art: { id: 'spark_mote' },
      lore: 'A party popper no bigger than a fist. It has exactly one thing to say, and it says it with a bang and a great deal of confetti.',
      tags: ['construct'],
    },

    typo_sprite: {
      id: 'typo_sprite', name: 'Pitch Glitch', chapter: 3, tier: 'minion', size: 's',
      hp: [15, 18],
      moves: {
        misspell: { name: 'Robo Hiccup', kind: 'debuff', say: 'Bzt! Oops.', fx: [{ op: 'add', card: 'status_wilt', n: 1, to: 'discard' }] },
        poke: { name: 'Pixel Poke', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
      },
      ai: { seq: ['misspell', 'poke'] },
      art: { id: 'typo_sprite' },
      lore: 'It lives where the pitch correction slips. Where it lands a note goes robotic, a beat snaps to the grid, and somebody\'s careful turn arrives one Breath short.',
      tags: ['spirit', 'void'],
    },

    // ==================================================================================================================
    // HEADLINER (boss): Flawless, Star of the Perfect Stage. Form 1 Flawless (the idol, Exposed), form 2 the Filter (Sequins, wipes),
    // form 3 the Gloss.
    // ==================================================================================================================
    boss_editor: {
      id: 'boss_editor', name: 'Flawless', title: 'Star of the Perfect Stage', chapter: 3, tier: 'boss', size: 'xl',
      hp: [440, 460],
      moves: {
        // form 1: Flawless, the idol
        handout: { name: 'Places, Please', kind: 'summon', say: 'Places, everyone. And smile.', fx: [{ op: 'summon', enemy: 'blank_page', n: 2 }] },
        margin: { name: 'One More Clone', kind: 'summon', say: 'One more smile for the cameras.', fx: [{ op: 'summon', enemy: 'blank_page', n: 1 }] },
        proofread: { name: 'Just a Tiny Note', kind: 'attack', say: 'Lovely! Just one tiny note.', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        pen: { name: 'Lip-Sync Flurry', kind: 'multi', say: 'Flawless. Flawless. Flawless.', fx: [{ op: 'dmg', n: 9, hits: 3, tgt: 'front', el: 'ink' }] },
        strike: { name: 'Perfect Cut', kind: 'attack', say: 'So clean!', fx: [{ op: 'dmg', n: 22, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw', top: true }] },
        footnote: { name: 'Freeze Frame', kind: 'defend', say: 'Hold that pose. Forever.', fx: [{ op: 'block', n: 16, tgt: 'self' }] },
        // form 2: the Filter
        clean: { name: 'Smooth Everything', kind: 'debuff', say: 'There. Smooth. Love that for you.', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'both' }, { op: 'removeStatus', s: 'bloom', tgt: 'both' }, { op: 'removeStatus', s: 'sumi', tgt: 'both' }, { op: 'removeStatus', s: 'ward', tgt: 'both' }, { op: 'removeStatus', s: 'charge', tgt: 'both' }] },
        swipe: { name: 'Selfie Arm Swipe', kind: 'attack', fx: [{ op: 'dmg', n: 22, tgt: 'front' }] },
        smudge: { name: 'Beauty Mode', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'both' }, { op: 'removeStatus', s: 'buffs', tgt: 'both' }] },
        rub: { name: 'Smooth Over', kind: 'heavy', say: 'There. Not a flaw left.', fx: [{ op: 'dmg', n: { base: 15, per: 'block', who: 'target', mul: 0.75, cap: 32 }, tgt: 'front', pierce: true }] },
        typos: { name: 'Glitches Creep In', kind: 'summon', fx: [{ op: 'summon', enemy: 'typo_sprite', n: 1 }] },
        // form 3: the Gloss
        gape: { name: 'Mirror Gaze', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'both' }] },
        tear: { name: 'Perfect Copy', kind: 'heavy', fx: [{ op: 'dmg', n: 28, tgt: 'front' }] },
        unwrite: { name: 'Mute the World', kind: 'heavy', say: 'Shh. Perfect. Nobody needs to sing.', fx: [{ op: 'dmg', n: { base: 8, per: 'enemies', mul: 3, cap: 17 }, tgt: 'both' }] },
        seep: { name: 'Confetti Falls', kind: 'summon', fx: [{ op: 'summon', enemy: 'spark_mote', n: 1 }] },
        last: { name: 'The Final Polish', kind: 'multi', say: '...perfect. And silent.', fx: [{ op: 'dmg', n: 8, hits: 2, tgt: 'both' }] },
      },
      ai: {
        open: ['handout'],
        seq: ['proofread', 'pen', 'strike'],
        rules: [
          { if: { hpLt: 0.72 }, do: 'footnote', once: true },
          { if: { minions: { lt: 1 }, turnEvery: [5, 4] }, do: 'margin' },
        ],
      },
      phases: [
        {
          at: 0.66,
          say: 'Hmm. A little rough around the edges. Let me smooth that for you.',
          fx: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 12, tgt: 'self' }, { op: 'removeStatus', s: 'weak', tgt: 'self' }, { op: 'removeStatus', s: 'vulnerable', tgt: 'self' }],
          ai: {
            open: ['clean'],
            seq: ['rub', 'swipe', 'smudge'],
            rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'typos' }],
          },
        },
        {
          at: 0.33,
          say: 'There. Perfect. Now nobody ever has to sing a wrong note again.',
          fx: [{ op: 'removeStatus', s: 'plating', tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'removeStatus', s: 'weak', tgt: 'self' }, { op: 'removeStatus', s: 'vulnerable', tgt: 'self' }, { op: 'add', card: 'status_blot', n: 2, to: 'draw' }, { op: 'add', card: 'status_wilt', n: 1, to: 'draw' }],
          ai: {
            open: ['unwrite'],
            seq: ['tear', 'gape', 'unwrite'],
            rules: [
              { if: { hpLt: 0.12 }, do: 'last', once: true },
              { if: { minions: { lt: 2 }, turnEvery: [3, 1] }, do: 'seep' },
            ],
          },
        },
      ],
      immune: ['stun'],
      art: { id: 'boss_editor' },
      lore: 'The Gloss\'s own star: a perfect pop idol who has never sung a wrong note, because it has never sung a real one. Under all that chrome and shine is something small and nervous that only ever wanted to help.',
      tags: ['void', 'folk'],
    },
  });

  // ====================================================================================================================
  // ENCOUNTERS. id, enemies (smallest first, tallest last: lanes fill from the right), w = weight, min = lowest tile.diff.
  // Pairs are built on purpose: the siren strips the buffs the knight's cleave then punishes, the ring light dazzles while the
  // dragon pelts the backing spot, the wraith smooths over the Block that the golem's slam ignores, the gremlin and the siren bury
  // the deck in junk.
  // ====================================================================================================================
  DATA.addEncounters(3, {
    normal: [
      { id: 'ch3_lone_drone', enemies: ['storm_drone'], w: 3, min: 0 },
      { id: 'ch3_black_bar_patrol', enemies: ['redaction_knight'], w: 3, min: 0.05 },
      { id: 'ch3_paper_guard', enemies: ['blank_soldier', 'blank_soldier'], w: 3, min: 0.1 },
      { id: 'ch3_dry_ink', enemies: ['void_scribe', 'storm_drone'], w: 3, min: 0.15 },
      { id: 'ch3_stone_gate', enemies: ['komainu_guardian'], w: 3, min: 0.2 },
      { id: 'ch3_windbound', enemies: ['sky_serpent'], w: 2, min: 0.25 },
      { id: 'ch3_storm_flock', enemies: ['storm_drone', 'thunder_crow'], w: 3, min: 0.3 },
      { id: 'ch3_margin_notes', enemies: ['margin_imp', 'blank_soldier'], w: 3, min: 0.3 },
      { id: 'ch3_censors_desk', enemies: ['void_scribe', 'redaction_knight'], w: 3, min: 0.35 },
      { id: 'ch3_rubbed_out', enemies: ['eraser_wraith', 'komainu_guardian'], w: 2, min: 0.4 },
      { id: 'ch3_paper_wall', enemies: ['blank_soldier', 'paper_golem'], w: 3, min: 0.45 },
      { id: 'ch3_hunting_party', enemies: ['thunder_crow', 'sky_serpent'], w: 2, min: 0.5 },
      { id: 'ch3_fold_and_erase', enemies: ['eraser_wraith', 'paper_golem'], w: 2, min: 0.55 },
      { id: 'ch3_ranks', enemies: ['blank_soldier', 'blank_soldier', 'blank_soldier'], w: 2, min: 0.6 },
      { id: 'ch3_storm_choir', enemies: ['spark_mote', 'storm_drone', 'thunder_crow'], w: 2, min: 0.65 },
      { id: 'ch3_black_bar_platoon', enemies: ['blank_soldier', 'blank_soldier', 'redaction_knight'], w: 2, min: 0.7 },
      { id: 'ch3_erasure_squad', enemies: ['blank_page', 'blank_page', 'eraser_wraith', 'redaction_knight'], w: 2, min: 0.7 },
      { id: 'ch3_scriptorium', enemies: ['blank_soldier', 'margin_imp', 'void_scribe'], w: 2, min: 0.75 },
      { id: 'ch3_thunderhead', enemies: ['spark_mote', 'spark_mote', 'storm_drone', 'sky_serpent'], w: 1, min: 0.8 },
      { id: 'ch3_stormwall', enemies: ['blank_page', 'spark_mote', 'thunder_crow', 'sky_serpent'], w: 1, min: 0.8 },
    ],
    elite: [
      { id: 'ch3_censors_office', enemies: ['censor_golem'], w: 3, min: 0 },
      { id: 'ch3_stormcallers_roost', enemies: ['spark_mote', 'storm_whelp'], w: 3, min: 0.15 },
      { id: 'ch3_court_of_bars', enemies: ['blank_page', 'black_bar_inquisitor'], w: 3, min: 0.3 },
    ],
    boss: 'boss_editor',
  });
})();
