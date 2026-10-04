// Echowake -- chapter 3 roster: the Crimson Sky Citadel (a storm fortress above the clouds, where the Hush silences songs).
// Owner: the chapter 3 enemy designer. Pure data: DATA.add('enemies', ...) and DATA.addEncounters(3, ...).
// Schema and AI rules: DESIGN.md 4.5. Numbers: CONTENT_SPEC.md 4.2 (Trial 0, chapter 3). No functions, no dashes,
// no Math.random. Ids, names, tiers and sizes are the fixed roster (DATA.ROSTER).
//
// THEME OF THE CHAPTER. Chapter 1 taught the rows, chapter 2 pinned them in place. Chapter 3 goes after the player's
// HAND and the player's SETUP. The Hush does not kill, it muffles: cards are muted (status_redacted), smothered
// (status_blot), left one Energy short (status_wilt), Block and buffs and hero resource stacks are damped out, and the
// storm above the citadel hits both heroes at once. Almost every enemy asks one question of the player, and the answer
// is always a decision about tempo: spend it before it is silenced, kill the caster before the junk piles up, swap the
// wrong hero out of the way of the stun, stop stacking Block against a baton that cuts through it.
//
// THE ROSTER, one line each (the pattern the player learns, and the answer). Signature moves are front-loaded: a fight against a good deck
// lasts two to four enemy actions, so the thing an enemy is known for must show in its first two.
//   storm_drone       Shock Jabs in threes, Arc Flash on both heroes (and a Static card), overclocks once at half HP. Kill it before Overclock.
//   komainu_guardian  Stone Stance (Thorns 6 and Block for one turn), Crushing Pounce (telegraphed, drops the Thorns), Claw. Hit it the turn after the pounce. Roars at 40 percent.
//   redaction_knight  Cut Short then two big cleaves. Every Cut Short adds a muted card; the felt closes (Plating) at half HP; a last muffle when it dies.
//   void_scribe       Unsing the Air (strips every buff, adds Blots), Hollow Chant, Drone Out. Unsings again early whenever it sees Might 2 or more.
//   blank_soldier     Rank Strike grows with every living enemy (8 alone, 14 in a crowd), Shield Wall covers the whole line. Break the rank.
//   sky_serpent       Gale Fangs: three hits on the BACK row, Tail Lash, Tailwind (Dodge 2). Pop the Dodge cheaply; protect or swap the back hero.
//   eraser_wraith     Smother first: a piercing hit that GROWS with the front hero's Block, then Muffle. Wipes the Tally (every resource stack) when a hero hoards 3 or more.
//   thunder_crow      A telegraphed Thunderhead Dive that Stuns the front hero right away, then Storm Pecks on the back row twice, then it perches. Choose who eats the Stun.
//   paper_golem       Pad Up adds Plating, Padded Slam reads that Plating, and every round you hurt it one Plating tears off. Keep hurting it, never let it pad up twice.
//   margin_imp        Calls a Sour Note, Nasty Jingle (a Wilt card), Frantic Warble, and calls once more at half HP. The notes and wilts are the real threat.
//   censor_golem      Felt-Pad Smash, Silence Stamp, Raise the Stamp (the quiet turn), then DENIED: 28 and Vulnerable. A Stun on the stamp turn cancels it. At half HP it stamps at once.
//   storm_whelp       Gathers Charge, Tempest Claws, then Thunderclap on BOTH heroes reads the Charge and spends it. Every round you hurt it adds Charge (a clock). Calls Spark Motes.
//   black_bar_inquisitor  Grey Chains (Bind, plus a tangle card to cut it), Gag Order (Stun), Gavel, Hunt the Weak (lowest hero). Final Verdict on even turns while a hero is below 40 percent.
//   boss_editor       The Conductor: Rehearsal Note makes the front hero Vulnerable, the Red Baton follows (swap the marked hero out), Cut Off mutes the next draw.
//                     The Damper (66 percent): Tacet wipes buffs and resources, Smother pierces Block, Damper Swipe, Muffle Everything on both. The Hush
//                     (33 percent): the tear opens with junk cards and Unsing, a hit on BOTH heroes that GROWS with every living enemy, so kill the moths and
//                     sparks before it lands; Swallow Whole, Gaping Silence, Unsing again, and a last note. Each transition sheds Weak and Vulnerable but leaves
//                     Poison and Burn alone. The lesson is the same in every form: the boss telegraphs what it will take, and the answer is to stop leaving it there.
//
// FIGHT LENGTH. Balance is measured in tests/hocus_vocus_enemies_3.test.mjs against synthetic decks (early, mid, late, and a boss deck with a +1 Energy
// relic and a curse). If the balance wave retunes HP, the knobs are `hp` (boss 440 to 460 and elites 136 to 152 of the 420 to 480 and 120 to 165 bands), Smother and Unsing caps, and the
// Charge and Plating steps; every number is a plain constant in the move it belongs to.
//
// SUMMON CAP. A summoner never has more than 2 living minions: every summon that is not an opener is gated by minions:{lt:2}
// (or lt:1 for a two-summon move). Encounter groups never pair two summoners and never pre-seed a minion next to an opener that summons past 2.
// LANES. Groups list the smallest enemy first (lane 0 side) and the largest last, so tall sprites sit at the back. Enemies act in lane order,
// so a group lists a support caster first when it should act before the bruiser.
// MIXED INTENTS. Every roster line mixes at least two intent kinds; kinds are honest (the validator checks the ops behind each icon).
//
// BALANCE PASS 1 (balance bot report 1). The Conductor is untouched. Fights lost to chapter 3 normals were concentrated in the encounters that
// hold a komainu_guardian (a lone komainu cost 2.6 times its peers: Thorns, Block, a 4.6 turn fight and a 24 pounce) and in the rank
// groups (Rank Strike read 14 per soldier in a crowd, 42 a round for three). Changes: komainu_guardian HP 74 to 80 down to 58 to 64,
// Thorns 6 to 5, pounce 24 to 19, claw 11 to 10, roar Might 2 to 1 (stone_gate and rubbed_out cost a third and a quarter less);
// blank_soldier Rank Strike 5 + 3 per enemy (cap 14) is now 4 + 3 per enemy (cap 12): 7 alone, 10 in a pair, 12 in a rank, so a three
// soldier group peaks at 36 instead of 42 a round and the readable answer (break the rank) is unchanged; thunder_crow HP 46 to 52 down to
// 42 to 48; paper_golem Swing 14 to 13 and Slam 15 + Plating (cap 26) to 14 (cap 25); censor_golem HP 140 to 152 down to 126 to 138, DENIED
// 28 to 26 and Raise the Stamp 18 to 16 Block. The soft end was raised a step: storm_drone Jabs 5x3 to 6x3 and Arc 5 to 6, void_scribe Chant
// 11 to 12 (HP 50 to 54), margin_imp Doodle 12 to 13 (HP 46 to 50), black_bar_inquisitor Gavel 18 to 19 and Hunt 8x2 to 9x2.
// Balance checks live in tests/hocus_vocus_enemies_3.test.mjs (bands, coverage, AI reachability, real engine fights).
(() => {
  DATA.add('enemies', {
    // ==================================================================================================================
    // NORMALS
    // ==================================================================================================================
    storm_drone: {
      id: 'storm_drone', name: 'Storm Drone', chapter: 3, tier: 'normal', size: 'm',
      hp: [52, 58],
      moves: {
        jab: { name: 'Shock Jabs', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'front', el: 'lightning' }] },
        arc: { name: 'Arc Flash', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'both', el: 'lightning' }, { op: 'add', card: 'status_static', n: 1, to: 'discard' }] },
        overclock: { name: 'Overclock', kind: 'buff', say: 'BZZZT!', fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { weighted: [['jab', 3], ['arc', 2]], noRepeat: 2, rules: [{ if: { hpLt: 0.5 }, do: 'overclock', once: true }] },
      art: { id: 'storm_drone' },
      lore: 'A brass lamp that flew into a thundercloud and came out humming. It jabs three times because it can count that far, and it has never once tried four.',
      tags: ['construct'],
    },

    komainu_guardian: {
      id: 'komainu_guardian', name: 'Komainu Guardian', chapter: 3, tier: 'normal', size: 'l',
      hp: [58, 64],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        // braced: Thorns and Block up for exactly one player turn. The pounce lunges out of the stance and drops the Thorns,
        // so the free window to hit it is the turn AFTER the pounce.
        stance: { name: 'Stone Stance', kind: 'defend', say: 'Brace.', fx: [{ op: 'block', n: 12, tgt: 'self' }, { op: 'status', s: 'thorns', n: 5, tgt: 'self' }] },
        pounce: { name: 'Crushing Pounce', kind: 'heavy', say: 'GRRRAAAWR.', fx: [{ op: 'dmg', n: 19, tgt: 'front' }, { op: 'removeStatus', s: 'thorns', tgt: 'self' }] },
        claw: { name: 'Stone Claw', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front' }] },
        roar: { name: 'Shrine Roar', kind: 'debuff', say: 'HALT. HALT. HALT.', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['stance', 'pounce', 'claw'], rules: [{ if: { hpLt: 0.4 }, do: 'roar', once: true }] },
      art: { id: 'komainu_guardian' },
      lore: 'One of a pair that guarded a shrine gate. Its partner is gone and the gate is gone, but nobody told the lion-dog, and it will not be the one to say so.',
      tags: ['beast', 'construct'],
    },

    redaction_knight: {
      id: 'redaction_knight', name: 'Muffled Knight', chapter: 3, tier: 'normal', size: 'm',
      hp: [58, 64],
      moves: {
        cleave: { name: 'Felt-Bar Cleave', kind: 'attack', fx: [{ op: 'dmg', n: 15, tgt: 'front' }] },
        strike: { name: 'Cut Short', kind: 'attack', fx: [{ op: 'dmg', n: 11, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        blackout: { name: 'Muffle Up', kind: 'defend', say: 'SHHH.', fx: [{ op: 'block', n: 14, tgt: 'self' }, { op: 'status', s: 'plating', n: 3, tgt: 'self' }] },
      },
      ai: { seq: ['strike', 'cleave', 'cleave'], rules: [{ if: { hpLt: 0.5 }, do: 'blackout', once: true }] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'add', card: 'status_redacted', n: 1, to: 'discard' }] }],
      art: { id: 'redaction_knight' },
      lore: 'Its helm is stuffed with grey felt and so is its opinion of you. Somewhere under the armour was a knight with a battle cry, and the cry has been smothered.',
      tags: ['void', 'folk'],
    },

    void_scribe: {
      id: 'void_scribe', name: 'Grey Cantor', chapter: 3, tier: 'normal', size: 'm',
      hp: [50, 54],
      moves: {
        ink: { name: 'Hollow Chant', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw' }] },
        erase: { name: 'Unsing the Air', kind: 'debuff', say: 'Songs are so temporary.', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'both' }, { op: 'add', card: 'status_blot', n: 2, to: 'draw' }] },
        blot: { name: 'Drone Out', kind: 'attack', fx: [{ op: 'dmg', n: 14, tgt: 'front', el: 'ink' }] },
      },
      ai: { seq: ['erase', 'ink', 'blot'], rules: [{ if: { heroStatus: { s: 'might', gte: 2 } }, do: 'erase' }] },
      art: { id: 'void_scribe' },
      lore: 'It chants in a voice the colour of nothing, and everything it sings stays silent. Its favourite hobby is shushing other people\'s power.',
      tags: ['void', 'folk'],
    },

    blank_soldier: {
      id: 'blank_soldier', name: 'Silent Soldier', chapter: 3, tier: 'normal', size: 'm',
      hp: [42, 48],
      moves: {
        march: { name: 'Rank Strike', kind: 'attack', fx: [{ op: 'dmg', n: { base: 4, per: 'enemies', mul: 3, cap: 12 }, tgt: 'front' }] },
        wall: { name: 'Shield Wall', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'allEnemies' }] },
      },
      ai: { seq: ['march', 'march', 'wall'] },
      art: { id: 'blank_soldier' },
      lore: 'Grey, faceless and marching in perfect step without a sound: a drill sergeant\'s dream. Alone, it is a very quiet man with a spear.',
      tags: ['void', 'folk'],
    },

    sky_serpent: {
      id: 'sky_serpent', name: 'Sky Serpent', chapter: 3, tier: 'normal', size: 'l',
      hp: [70, 76],
      moves: {
        fang: { name: 'Gale Fangs', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'back' }] },
        tailwind: { name: 'Tailwind', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 2, tgt: 'self' }, { op: 'block', n: 8, tgt: 'self' }] },
        lash: { name: 'Tail Lash', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
      },
      ai: { weighted: [['fang', 4], ['tailwind', 2], ['lash', 3]], noRepeat: 1 },
      art: { id: 'sky_serpent' },
      lore: 'A long white wind that learned to hold a shape. It coils through the arches looking for the softest hero at the back of the line, which is rude, and effective.',
      tags: ['beast'],
    },

    eraser_wraith: {
      id: 'eraser_wraith', name: 'Muffle Wraith', chapter: 3, tier: 'normal', size: 'm',
      hp: [48, 54],
      moves: {
        smudge: { name: 'Muffle', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        rub: { name: 'Smother', kind: 'attack', say: 'Nothing left to hold.', fx: [{ op: 'dmg', n: { base: 9, per: 'block', who: 'target', mul: 0.5, cap: 18 }, tgt: 'front', pierce: true }] },
        wipe: {
          name: 'Wipe the Tally',
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
      lore: 'It drifts through the citadel with one soft grey hand held out, pressing. Block, momentum and hard-won stacks go quiet under it like a damped string.',
      tags: ['void', 'undead'],
    },

    thunder_crow: {
      id: 'thunder_crow', name: 'Thunder Crow', chapter: 3, tier: 'normal', size: 'm',
      hp: [42, 48],
      moves: {
        peck: { name: 'Storm Pecks', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 3, tgt: 'back', el: 'lightning' }] },
        dive: { name: 'Thunderhead Dive', kind: 'heavy', say: 'KRAAA!', fx: [{ op: 'dmg', n: 18, tgt: 'front', el: 'lightning' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        perch: { name: 'Perch', kind: 'defend', fx: [{ op: 'block', n: 12, tgt: 'self' }] },
      },
      ai: { seq: ['dive', 'peck', 'peck', 'perch'] },
      art: { id: 'thunder_crow' },
      lore: 'A crow that flew too close to the storm and came back louder. It bullies the back row with its beak, then folds its wings and drops like a hammer made of feathers.',
      tags: ['avian', 'spirit'],
    },

    paper_golem: {
      id: 'paper_golem', name: 'Felt Golem', chapter: 3, tier: 'normal', size: 'l',
      hp: [76, 80],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        lumber: { name: 'Lumbering Swing', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        fold: { name: 'Pad Up', kind: 'defend', fx: [{ op: 'block', n: 12, tgt: 'self' }, { op: 'status', s: 'plating', n: 3, tgt: 'self' }] },
        slam: { name: 'Padded Slam', kind: 'heavy', say: 'FWUMP.', fx: [{ op: 'dmg', n: { base: 14, per: 'status', s: 'plating', who: 'self', mul: 1, cap: 25 }, tgt: 'front' }] },
      },
      ai: { seq: ['fold', 'lumber', 'slam'] },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'status', s: 'plating', n: -1, tgt: 'self' }] }],
      art: { id: 'paper_golem' },
      lore: 'A giant stitched by patient hands from the felt of a thousand muffled drums. It is slow and it is big, and every layer it adds makes the next slam worse for you.',
      tags: ['construct'],
    },

    margin_imp: {
      id: 'margin_imp', name: 'Off-Key Imp', chapter: 3, tier: 'normal', size: 'm',
      hp: [46, 50],
      moves: {
        call: { name: 'Hum a Friend', kind: 'summon', say: 'Ooh, a new note!', fx: [{ op: 'summon', enemy: 'typo_sprite', n: 1 }] },
        doodle: { name: 'Nasty Jingle', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_wilt', n: 1, to: 'draw' }] },
        scribble: { name: 'Frantic Warble', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 3, tgt: 'front', el: 'ink' }] },
      },
      ai: { open: ['call'], seq: ['doodle', 'scribble'], rules: [{ if: { hpLt: 0.5, minions: { lt: 2 } }, do: 'call', once: true }] },
      art: { id: 'margin_imp' },
      lore: 'A tuneless imp that lives under old stages and sings flat at everyone. It keeps a very long list of your mistakes and hums it back, slowly.',
      tags: ['spirit'],
    },

    // ==================================================================================================================
    // ELITES
    // ==================================================================================================================
    censor_golem: {
      id: 'censor_golem', name: 'Censor Golem', chapter: 3, tier: 'elite', size: 'l',
      hp: [126, 138],
      start: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }],
      moves: {
        smack: { name: 'Felt-Pad Smash', kind: 'attack', fx: [{ op: 'dmg', n: 16, tgt: 'front' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        censor: { name: 'Silence Stamp', kind: 'attack', say: 'Nothing to hear here.', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 2, to: 'draw' }] },
        raise: { name: 'Raise the Stamp', kind: 'defend', say: 'This will only take a moment.', fx: [{ op: 'block', n: 16, tgt: 'self' }, { op: 'status', s: 'plating', n: 2, tgt: 'self' }] },
        stamp: { name: 'DENIED', kind: 'heavy', say: 'DENIED.', fx: [{ op: 'dmg', n: 26, tgt: 'front' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }] },
      },
      ai: { seq: ['smack', 'censor', 'raise', 'stamp'] },
      phases: [{
        at: 0.5,
        say: 'THIS SONG IS NOW UNDER REVIEW.',
        fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 12, tgt: 'self' }],
        ai: { open: ['stamp'], seq: ['censor', 'smack', 'stamp'] },
      }],
      art: { id: 'censor_golem' },
      lore: 'Built by the Hush to approve nothing. One arm is a rubber stamp the size of a door, its chest is a grey gag, and its only word is a very final one.',
      tags: ['construct', 'void'],
    },

    storm_whelp: {
      id: 'storm_whelp', name: 'Storm Dragon Whelp', chapter: 3, tier: 'elite', size: 'l',
      hp: [136, 148],
      moves: {
        gather: { name: 'Gather the Storm', kind: 'buff', say: 'Krrrrrrr...', fx: [{ op: 'status', s: 'charge', n: 3, tgt: 'self' }, { op: 'block', n: 10, tgt: 'self' }] },
        claws: { name: 'Tempest Claws', kind: 'multi', fx: [{ op: 'dmg', n: 6, hits: 3, tgt: 'front', el: 'lightning' }] },
        breath: { name: 'Storm Breath', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'both', el: 'lightning' }, { op: 'add', card: 'status_scorch', n: 1, to: 'draw' }] },
        clap: {
          name: 'Thunderclap',
          kind: 'heavy',
          say: 'KRAKA-DOOM!',
          fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'charge', who: 'self', mul: 3, cap: 18 }, tgt: 'both', el: 'lightning' }, { op: 'removeStatus', s: 'charge', tgt: 'self' }],
        },
        call: { name: 'Call the Sparks', kind: 'summon', fx: [{ op: 'summon', enemy: 'spark_mote', n: 1 }] },
      },
      ai: {
        open: ['gather'],
        seq: ['claws', 'clap', 'breath'],
        rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'call' }],
      },
      hooks: [{ on: 'onHurt', limit: 1, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      phases: [{
        at: 0.5,
        say: 'The sky goes white around it.',
        fx: [{ op: 'status', s: 'charge', n: 3, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }],
        ai: {
          open: ['clap'],
          seq: ['claws', 'breath', 'clap'],
          rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'call' }],
        },
      }],
      art: { id: 'storm_whelp' },
      lore: 'A young storm dragon still growing into its thunder. It hoards static the way a magpie hoards spoons, and it gets a little more excited every time you hit it.',
      tags: ['beast'],
    },

    black_bar_inquisitor: {
      id: 'black_bar_inquisitor', name: 'Hush Inquisitor', chapter: 3, tier: 'elite', size: 'l',
      hp: [136, 148],
      moves: {
        chains: { name: 'Grey Chains', kind: 'debuff', say: 'Hold still. The verdict is not yet sung.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'front' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        gavel: { name: 'Gavel', kind: 'attack', fx: [{ op: 'dmg', n: 19, tgt: 'front' }] },
        hunt: { name: 'Hunt the Weak', kind: 'multi', fx: [{ op: 'dmg', n: 9, hits: 2, tgt: 'lowest' }] },
        gag: { name: 'Gag Order', kind: 'attack', say: 'Silence in the court.', fx: [{ op: 'dmg', n: 12, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        verdict: { name: 'Final Verdict', kind: 'heavy', say: 'GUILTY.', fx: [{ op: 'dmg', n: { base: 14, per: 'missingHp', who: 'target', mul: 0.25, cap: 30 }, tgt: 'lowest' }] },
      },
      ai: {
        open: ['chains'],
        seq: ['gag', 'gavel', 'hunt'],
        rules: [{ if: { heroHpLt: 0.4, turnEvery: [2, 1] }, do: 'verdict' }],
      },
      art: { id: 'black_bar_inquisitor' },
      lore: 'The Hush\'s inquisitor keeps a court where the verdict is decided in advance. It has a soft spot for the weakest hero in the room, mostly because that is the quickest way to close the session.',
      tags: ['folk', 'void'],
    },

    // ==================================================================================================================
    // MINIONS (size s, simple, one accent each)
    // ==================================================================================================================
    blank_page: {
      id: 'blank_page', name: 'Hush Moth', chapter: 3, tier: 'minion', size: 's',
      hp: [16, 20],
      moves: {
        drift: { name: 'Drift', kind: 'defend', fx: [{ op: 'block', n: 9, tgt: 'self' }] },
        wrap: { name: 'Wrap Around', kind: 'debuff', fx: [{ op: 'status', s: 'frail', n: 1, tgt: 'front' }] },
        cut: { name: 'Wing Cut', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
      },
      ai: { seq: ['drift', 'wrap', 'cut'] },
      art: { id: 'blank_page' },
      lore: 'A grey moth whose wings make no sound at all. It drifts about looking innocent, and wraps itself around anyone who tries to sing near it.',
      tags: ['void'],
    },

    spark_mote: {
      id: 'spark_mote', name: 'Spark Mote', chapter: 3, tier: 'minion', size: 's',
      hp: [14, 16],
      moves: {
        zap: { name: 'Zap', kind: 'attack', say: 'ZIP!', fx: [{ op: 'dmg', n: 9, tgt: 'front', el: 'lightning' }, { op: 'flee' }] },
      },
      ai: { seq: ['zap'] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front', el: 'lightning' }] }],
      art: { id: 'spark_mote' },
      lore: 'A crumb of storm no bigger than a seed. It has exactly one thing to say, and it says it with a bang.',
      tags: ['spirit'],
    },

    typo_sprite: {
      id: 'typo_sprite', name: 'Sour Note', chapter: 3, tier: 'minion', size: 's',
      hp: [15, 18],
      moves: {
        misspell: { name: 'Go Flat', kind: 'debuff', say: 'Oops!', fx: [{ op: 'add', card: 'status_wilt', n: 1, to: 'discard' }] },
        poke: { name: 'Glitch Poke', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
      },
      ai: { seq: ['misspell', 'poke'] },
      art: { id: 'typo_sprite' },
      lore: 'It lives where songs go wrong. Where it lands a note slides, a beat drifts, and somebody\'s careful turn arrives one Energy short.',
      tags: ['spirit', 'void'],
    },

    // ==================================================================================================================
    // BOSS: The Conductor, Keeper of the Last Note. Form 1 the Conductor (baton, Vulnerable), form 2 the Damper (plating, wipes), form 3 the Hush.
    // ==================================================================================================================
    boss_editor: {
      id: 'boss_editor', name: 'The Conductor', title: 'Keeper of the Last Note', chapter: 3, tier: 'boss', size: 'xl',
      hp: [440, 460],
      moves: {
        // form 1: the Conductor
        handout: { name: 'Places, Please', kind: 'summon', say: 'Quiet, please. Take your seats.', fx: [{ op: 'summon', enemy: 'blank_page', n: 2 }] },
        margin: { name: 'Late Seating', kind: 'summon', say: 'One more for the quiet seats.', fx: [{ op: 'summon', enemy: 'blank_page', n: 1 }] },
        proofread: { name: 'Rehearsal Note', kind: 'attack', say: 'Let us hear what needs correcting.', fx: [{ op: 'dmg', n: 12, tgt: 'front', el: 'ink' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'front' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw' }] },
        pen: { name: 'Red Baton', kind: 'multi', say: 'Cut. Cut. Cut.', fx: [{ op: 'dmg', n: 9, hits: 3, tgt: 'front', el: 'ink' }] },
        strike: { name: 'Cut Off', kind: 'attack', say: 'Redundant.', fx: [{ op: 'dmg', n: 22, tgt: 'front', el: 'ink' }, { op: 'add', card: 'status_redacted', n: 1, to: 'draw', top: true }] },
        footnote: { name: 'Fermata', kind: 'defend', say: 'Rest for two hundred and four bars.', fx: [{ op: 'block', n: 16, tgt: 'self' }] },
        // form 2: the Damper
        clean: { name: 'Tacet', kind: 'debuff', say: 'A clean silence. How lovely.', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'both' }, { op: 'removeStatus', s: 'bloom', tgt: 'both' }, { op: 'removeStatus', s: 'sumi', tgt: 'both' }, { op: 'removeStatus', s: 'ward', tgt: 'both' }, { op: 'removeStatus', s: 'charge', tgt: 'both' }] },
        swipe: { name: 'Damper Swipe', kind: 'attack', fx: [{ op: 'dmg', n: 22, tgt: 'front' }] },
        smudge: { name: 'Muffle Everything', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'both' }, { op: 'removeStatus', s: 'buffs', tgt: 'both' }] },
        rub: { name: 'Smother', kind: 'heavy', say: 'Nothing here worth keeping.', fx: [{ op: 'dmg', n: { base: 15, per: 'block', who: 'target', mul: 0.75, cap: 32 }, tgt: 'front', pierce: true }] },
        typos: { name: 'Wrong Notes Creep In', kind: 'summon', fx: [{ op: 'summon', enemy: 'typo_sprite', n: 1 }] },
        // form 3: the Hush
        gape: { name: 'Gaping Silence', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'both' }] },
        tear: { name: 'Swallow Whole', kind: 'heavy', fx: [{ op: 'dmg', n: 28, tgt: 'front' }] },
        unwrite: { name: 'Unsing', kind: 'heavy', say: 'Never sung. Never was.', fx: [{ op: 'dmg', n: { base: 8, per: 'enemies', mul: 3, cap: 17 }, tgt: 'both' }] },
        seep: { name: 'Storm Seeps In', kind: 'summon', fx: [{ op: 'summon', enemy: 'spark_mote', n: 1 }] },
        last: { name: 'The Last Note', kind: 'multi', say: '...and silence.', fx: [{ op: 'dmg', n: 8, hits: 2, tgt: 'both' }] },
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
          say: 'Too many notes. Far too many notes. Let me damp some down.',
          fx: [{ op: 'status', s: 'plating', n: 6, tgt: 'self' }, { op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 12, tgt: 'self' }, { op: 'removeStatus', s: 'weak', tgt: 'self' }, { op: 'removeStatus', s: 'vulnerable', tgt: 'self' }],
          ai: {
            open: ['clean'],
            seq: ['rub', 'swipe', 'smudge'],
            rules: [{ if: { minions: { lt: 2 }, turnEvery: [4, 3] }, do: 'typos' }],
          },
        },
        {
          at: 0.33,
          say: 'You cannot correct what has no sound left.',
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
      lore: 'The Singer\'s most careful listener loved the song so much he could not bear a wrong note. He cut off every note he could, damped down what was left, and now he conducts the Hush, holding the Singer\'s breath.',
      tags: ['folk', 'void'],
    },
  });

  // ====================================================================================================================
  // ENCOUNTERS. id, enemies (smallest first, tallest last: lanes fill from the right), w = weight, min = lowest tile.diff.
  // Pairs are built on purpose: the cantor strips the buffs the knight's cleave then punishes, the crow stuns while the serpent
  // shreds the back row, the wraith smothers the Block that the golem's slam ignores, the imp and the cantor bury the deck in junk.
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
