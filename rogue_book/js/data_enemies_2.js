// Echowake: chapter 2 roster: the Sunken Lantern City (a haunted canal town at night).
// Owner: the chapter 2 enemy designer. Pure data: DATA.add('enemies', ...) and DATA.addEncounters(2, ...).
// Schema and AI rules: DESIGN.md 4.5. Numbers: CONTENT_SPEC.md 4.2 (Trial 0, chapter 2). No functions, no dashes,
// no randomness of its own. Ids, names, tiers and sizes are the fixed roster (DATA.ROSTER). Nothing here reads a clock or the DOM.
//
// THEME. The city's answer to "the front hero eats everything" is silk and water. Bind pins the party in its rows, Stun takes a hero's
// whole turn, and half the cast reaches past the front hero to the back row or hits both heroes at once. Every answer is a ROW decision:
// swap the debuffed hero out of the front (Nopperabo), put the hero you can afford to lose in front before a Stun lands (Karakuri,
// Puppet Master, Umibozu), aim your block at the back hero (Nure-onna, Rokurokubi), or cut the silk with status_tangle before the
// finisher arrives (Jorogumo). Intent numbers are live: the Grasp, the Embrace, the Web and the Slam re-read the board, so the answer
// is visible on the intent bubble the moment you play it.
//
// THE ROSTER (pattern the player learns, and the answer). "Beat" = one intent; turn counts are the enemy's own turns.
//   chochin          scorch (Burn), Light the Wicks (Ritual to EVERY enemy) on its second beat, cinders on both heroes. Two turns to kill it
//                    before anyone is lit. Burn proof; spills Burn 2 when it dies.
//   karakuri_puppet  fixed combo jab, flurry, SMASH (heavy, Stun the front hero). Kill it in two turns or choose who is stunned.
//                    Overwinds once (Might 3) when cracked below half HP, which delays the smash a turn.
//   nopperabo        Blank Stare (Weak 2, Frail 1 on the front hero) then two Faceless Grasps that hit harder per debuff on the FRONT hero.
//                    Swap the debuffed hero out and the Grasp falls back to its base. A binder beside it takes that answer away.
//   drowned_samurai  Plating 4 every turn, Sodden Cut, Iai Stance (Block: do not pour damage into it), then a telegraphed Iai. Draws early once
//                    if cornered below 40 percent.
//   koi_spirit       weighted: Tidal Splash on BOTH heroes, Tail Slap. Every other turn it heals the weakest enemy if an ally is hurt, and it heals
//                    its friends once more when it dies. The priority target of any group it stands in.
//   tsukumogami      Discordant Din first (2 blot cards into the draw pile), clatter, Angry Strum (a blot on TOP of the draw pile), and a heavy
//                    Crescendo on turns 3, 6, 9. Clogs the hand, then crushes.
//   silk_weaver      Silk Snare first (Bind 1 and a tangle card on top of the draw pile), Hatch Spiderling on turns 2, 5, 8 while fewer than
//                    2 minions live, Venom Fang. Kill it before the brood grows.
//   nure_onna        Venom Bite (BACK row, Poison), Drowning Coil (heavy on the FRONT hero), Tail Lash (back). Block the back hero or Taunt.
//   rokurokubi       Reaching Neck (two hits on the BACK row), Neck Lunge (heavy, back), Reaching Neck, Coil Up. Never touches the front hero.
//                    Pairs cruelly with any binder.
//   ittan_momen      weighted: Wrap Tight (a hit and Bind 1), Smothering Squeeze, Billow (Block and Dodge 1: open with a cheap poke).
//   drowned_general  Muster (a Lantern Wisp and Ritual 1), then saber, sweep (both heroes), saber; one more wisp on turns 3, 6, 9 when none is
//                    left. The moment he drops below half HP the phase gives Might and Block and re-rolls his intent to the Flood Crest (heavy,
//                    Weak on both). The build-around threat: Ritual snowballs, so kill him fast.
//   puppet_master    Pull the Strings (2 Paper Puppets), Thread Lash (3 random hits), Tighten (Might to a puppet), Marionette (heavy, STUN the
//                    front hero). Mends a puppet below half HP (pokes are wasted: kill them outright) and restocks one on turns 3, 6, 9.
//   umibozu          Tidal Slam on BOTH heroes that grows with its own turn count (6 + turn, cap 12): stalling is punished. Brine Spray (Weak and
//                    Frail on both), the Drowning Bell (heavy, STUN) on turns 3 and 7, and one Maelstrom below 40 percent HP.
//   spiderling       Poison Nip twice, then skitter (Dodge). Weak alone, poisonous in a swarm.
//   paper_puppet     Paper Flail, Paper Clap on the back row. Ten HP: gone in a hit.
//   lantern_wisp     Singe (Burn 2), then Warm Glow (Block for an ally). A lone wisp just singes. Burn proof.
//   boss_jorogumo    Form 1, the Courtesan (Plating 4, kimono): Honoured Guests (2 spiderlings), Silk Snare (Bind 1 on both heroes and a tangle
//                    card on top of the draw pile), then Silken Embrace (heavy, front) which reads the Bind on its victim: 12 unbound, 20 bound.
//                    Fan and Kiss (back row Poison) between, the snare again on turns 6 and 10, one more spiderling when the brood is dead.
//                    Below half HP she drops the kimono (Plating gone, Might 2, say line) and re-rolls at once to Form 2, the Spider: Spin the
//                    Threads (Bind 2 on both, another tangle card), the Thousand-Thread Web (heavy on BOTH heroes, 7 unbound, 12 with Bind 2),
//                    Eight Legs, Kiss, and a once-only Eight-Legged Frenzy below 20 percent.
//                    The lesson never changes: silk is the setup, the finisher scales with it, and status_tangle (1 Energy) cuts it.
//
// GROUPS. Smallest enemy first and tallest last, so tall sprites stand in the back lanes. Pairs are built on purpose: chochin lights a samurai,
// Bind pins a back-row target (momen and roku), Bind takes away the swap that answers the Grasp (nopperabo and momen), the koi heals behind a
// back-row poisoner. Big groups are gated to the late page; the four-enemy group is a spider den (2 seeded spiderlings and a weaver).
//
// SUMMON CAP. A summoner never has more than 2 living minions: every summon that is not an opener is gated by minions:{lt:3-n}, and a group
// never holds two summoners or seeds a minion next to an opener that would pass 2.
//
// BALANCE. HP sits in the upper half of each CONTENT_SPEC band so an enemy usually acts three times before it dies, which is what lets a
// signature show. tests/rogue_book_enemies_2.test.mjs measures the rest with REAL combats (COMBAT.simulate, synthetic hero decks): turns per
// group, HP lost, the win rate, how often each signature move lands, and that the counter-play above really pays. RB_ENEMIES2_REPORT=1 prints
// the tables; RB_ENEMIES2_TRACE=boss_jorogumo prints one fight turn by turn. Numbers are a first tuning for the balance wave, not gospel.
//
// BALANCE PASS 1 (balance bot report 1, about 22,000 runs, greedy party). Chapter 2 was the soft chapter: its elites cost 8 percent of party HP
// per fight (chapter 1: 14, chapter 3: 12) and its boss 14 percent (chapter 1 boss: 22), and the greedy party cleared 82 percent of
// chapters 1 to 2 where the spec asks for 60 to 80. The pass is shaped, not flat: normals about x1.2 in threat (HP and hits about x1.1
// each), elites about x1.55 (HP to the top of the band, hits about x1.25 to x1.3), the boss HP 240 to 246 up to 258 to 264 with its big
// hits (embrace, kiss, web) about x1.1. The boss is the one knob that moves the chapter clear rate: with its HP at the band top (274 to
// 280) and the same hits it cost the greedy party 22 percent of attempts (7 before the pass) and chapter 2 sat at 65 percent clear; the
// setting here (HP 258 to 264, same hits) is estimated at about 18 percent of attempts and about 67 percent
// clear (refights at the recorded entry HP; not run end to end). The knob: one point of boss loss rate is about 0.8 points of chapter 2 clear.
// Inside the normals the spread was evened out by measurement, enemy by enemy and group by group: the soft ones were raised (ittan_momen,
// tsukumogami, silk_weaver, karakuri_puppet, nopperabo, chochin) and the hard ones trimmed (drowned_samurai HP 46 to 54 down to 40 to 46,
// nure_onna HP 50 to 58 down to 46 to 54 and Coil 15 to 14, Lash 7 to 6; rokurokubi only +1 on the Lunge). The enemies that never stand
// alone in a group (silk_weaver, tsukumogami, koi_spirit, ittan_momen, rokurokubi) are judged by what they add to their groups, not by a
// solo fight: their openers (snare, din, brood) are slow burns that a lone fight ends before they land. flooded_bridge (the two trimmed
// hard enemies) moved from min 0.6 to 0.5 so the late page keeps its level.
// ART NOTES for art_enemies_2.js (the lore lines carry the look too). chochin: one-eyed paper lantern, warm candle glow, ribbon tassel.
// karakuri_puppet: painted wooden doll with a wind-up key and visible gears. nopperabo: smooth blank face under a hood, pale. drowned_samurai:
// sodden armour hung with seaweed, dripping. koi_spirit: pale carp glowing like a coin. tsukumogami: an old shamisen grown legs, strings
// buzzing. silk_weaver: spider-bodied woman in an apron, many hands. nure_onna: snake-tailed woman with long wet hair. rokurokubi: a long neck
// coiled over the shoulder. ittan_momen: a flying bolt of white cotton. drowned_general: armoured admiral trailing lanterns and water.
// puppet_master: a gaunt figure on a stool, strings from every finger. umibozu: a monk-shaped black giant rising out of calm water.
// spiderling: coin-sized spider. paper_puppet: folded paper doll. lantern_wisp: small pale flame. boss_jorogumo: phase 0 a spider-woman in a
// layered kimono, phase 1 the kimono torn open on a spider's body.
(() => {
  DATA.add('enemies', {
    // ==================================================================================================================
    // NORMALS
    // ==================================================================================================================
    chochin: {
      id: 'chochin', name: 'Chochin Lantern', chapter: 2, tier: 'normal', size: 'm',
      hp: [33, 39],
      moves: {
        kindle: { name: 'Light the Wicks', kind: 'buff', say: 'Burn bright, little ones.', fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'allEnemies' }] },
        scorch: { name: 'Scorching Gaze', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'front' }] },
        cinders: { name: 'Falling Cinders', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'both', el: 'fire' }, { op: 'status', s: 'burn', n: 3, tgt: 'both' }] },
      },
      ai: { seq: ['scorch', 'kindle', 'cinders'] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'status', s: 'burn', n: 2, tgt: 'front' }] }],
      immune: ['burn'],
      art: { id: 'chochin' },
      lore: 'A paper lantern that woke up curious and never learned to stop staring. It carries a flame for everyone it likes, and likes everyone the way a fire likes a curtain.',
      tags: ['spirit'],
    },

    karakuri_puppet: {
      id: 'karakuri_puppet', name: 'Karakuri Puppet', chapter: 2, tier: 'normal', size: 'm',
      hp: [47, 55],
      moves: {
        jab: { name: 'Clockwork Jab', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        flurry: { name: 'Gear Flurry', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 2, tgt: 'front' }] },
        smash: { name: 'Mainspring Smash', kind: 'heavy', say: 'CLANG.', fx: [{ op: 'dmg', n: 10, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        overwind: { name: 'Overwound', kind: 'buff', say: 'Ticktickticktick...', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'self' }] },
      },
      ai: { seq: ['jab', 'flurry', 'smash'], rules: [{ if: { hpLt: 0.5 }, do: 'overwind', once: true }] },
      art: { id: 'karakuri_puppet' },
      lore: 'A wind-up puppet from a long-shuttered theatre. Its act has three beats and it has never once missed the last.',
      tags: ['construct'],
    },

    nopperabo: {
      id: 'nopperabo', name: 'Nopperabo', chapter: 2, tier: 'normal', size: 'm',
      hp: [43, 51],
      moves: {
        stare: { name: 'Blank Stare', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 2, tgt: 'front' }, { op: 'status', s: 'frail', n: 1, tgt: 'front' }] },
        grasp: { name: 'Faceless Grasp', kind: 'attack', fx: [{ op: 'dmg', n: { base: 6, per: 'debuffs', who: 'target', mul: 3, cap: 14 }, tgt: 'front' }] },
      },
      ai: { seq: ['stare', 'grasp', 'grasp'] },
      art: { id: 'nopperabo' },
      lore: 'It wears no face at all, which is how it learned that everyone else\'s are borrowed. The more you flinch, the harder it stares.',
      tags: ['spirit', 'undead'],
    },

    drowned_samurai: {
      id: 'drowned_samurai', name: 'Drowned Samurai', chapter: 2, tier: 'normal', size: 'l',
      hp: [40, 46],
      start: [{ op: 'status', s: 'plating', n: 4, tgt: 'self' }],
      moves: {
        cut: { name: 'Sodden Cut', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }] },
        stance: { name: 'Iai Stance', kind: 'defend', say: '...Breathe in.', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
        iai: { name: 'Tide-Edge Iai', kind: 'heavy', say: 'IAI!', fx: [{ op: 'dmg', n: 14, tgt: 'front' }] },
      },
      ai: { seq: ['cut', 'stance', 'iai'], rules: [{ if: { hpLt: 0.4 }, do: 'iai', once: true }] },
      art: { id: 'drowned_samurai' },
      lore: 'He was told to hold the bridge until the water rose. The water rose. He is still holding the bridge, and the river is still politely asking him to let go.',
      tags: ['undead', 'folk', 'aquatic'],
    },

    koi_spirit: {
      id: 'koi_spirit', name: 'Koi Spirit', chapter: 2, tier: 'normal', size: 'm',
      hp: [35, 41],
      moves: {
        splash: { name: 'Tidal Splash', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'both' }] },
        slap: { name: 'Tail Slap', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        mend: { name: 'Healing Tide', kind: 'heal', say: 'Blub. (Be well.)', fx: [{ op: 'heal', n: 12, tgt: 'lowestEnemy' }] },
      },
      ai: { weighted: [['splash', 3], ['slap', 2]], noRepeat: 2, rules: [{ if: { allyHpLt: 0.7, turnEvery: [2, 1] }, do: 'mend' }] },
      hooks: [{ on: 'onDeath', fx: [{ op: 'heal', n: 6, tgt: 'allEnemies' }] }],
      art: { id: 'koi_spirit' },
      lore: 'The canal\'s oldest carp, glowing like a coin at the bottom of a wishing well. It heals the ones it likes and splashes the ones it does not.',
      tags: ['spirit', 'aquatic'],
    },

    tsukumogami: {
      id: 'tsukumogami', name: 'Tsukumogami', chapter: 2, tier: 'normal', size: 'm',
      hp: [35, 42],
      moves: {
        discord: { name: 'Discordant Din', kind: 'debuff', say: 'TWANG!', fx: [{ op: 'add', card: 'status_blot', n: 2, to: 'draw' }] },
        clatter: { name: 'Clatter', kind: 'attack', fx: [{ op: 'dmg', n: 9, tgt: 'front' }] },
        strum: { name: 'Angry Strum', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw', top: true }] },
        crescendo: { name: 'Crescendo', kind: 'heavy', say: 'TWANG! TWANG! TWANG!', fx: [{ op: 'dmg', n: 12, tgt: 'front' }, { op: 'add', card: 'status_blot', n: 1, to: 'draw', top: true }] },
      },
      ai: { open: ['discord'], seq: ['clatter', 'strum'], rules: [{ if: { turnEvery: [3, 2] }, do: 'crescendo' }] },
      art: { id: 'tsukumogami' },
      lore: 'A shamisen that turned a hundred and started keeping score. Every wrong note ever played in the house lives in its strings now.',
      tags: ['spirit', 'construct'],
    },

    silk_weaver: {
      id: 'silk_weaver', name: 'Silk Weaver', chapter: 2, tier: 'normal', size: 'm',
      hp: [33, 40],
      moves: {
        snare: { name: 'Silk Snare', kind: 'debuff', say: 'Stay put, dear.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'front' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        fang: { name: 'Venom Fang', kind: 'attack', fx: [{ op: 'dmg', n: 10, tgt: 'front', el: 'poison' }] },
        hatch: { name: 'Hatch Spiderling', kind: 'summon', fx: [{ op: 'summon', enemy: 'spiderling', n: 1 }] },
      },
      ai: { open: ['snare'], seq: ['fang', 'fang', 'snare'], rules: [{ if: { minions: { lt: 2 }, turnEvery: [3, 1] }, do: 'hatch' }] },
      art: { id: 'silk_weaver' },
      lore: 'The mistress of the house keeps servants who never sleep. This one spins bindings by the yard and hatches her children on request.',
      tags: ['insect', 'folk'],
    },

    nure_onna: {
      id: 'nure_onna', name: 'Nure-onna', chapter: 2, tier: 'normal', size: 'l',
      hp: [46, 54],
      moves: {
        fang: { name: 'Venom Bite', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'back', el: 'poison' }, { op: 'status', s: 'poison', n: 2, tgt: 'back' }] },
        lash: { name: 'Tail Lash', kind: 'attack', fx: [{ op: 'dmg', n: 6, tgt: 'back' }] },
        coil: { name: 'Drowning Coil', kind: 'heavy', say: 'Come closer, dear.', fx: [{ op: 'dmg', n: 14, tgt: 'front' }] },
      },
      ai: { seq: ['fang', 'coil', 'lash'] },
      art: { id: 'nure_onna' },
      lore: 'A woman above the waist and a river snake below it, combing her hair on the canal bank. She waves, and that is not a greeting. It is the first strike.',
      tags: ['beast', 'aquatic', 'folk'],
    },

    rokurokubi: {
      id: 'rokurokubi', name: 'Rokurokubi', chapter: 2, tier: 'normal', size: 'm',
      hp: [34, 41],
      moves: {
        reach: { name: 'Reaching Neck', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 2, tgt: 'back' }] },
        lunge: { name: 'Neck Lunge', kind: 'heavy', fx: [{ op: 'dmg', n: 12, tgt: 'back' }] },
        coil: { name: 'Coil Up', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }] },
      },
      ai: { seq: ['reach', 'lunge', 'reach', 'coil'] },
      art: { id: 'rokurokubi' },
      lore: 'By day, a quiet lady at the tea house. By night, a very long neck. She never leaves her seat; the neck simply goes over your shoulder.',
      tags: ['spirit', 'folk'],
    },

    ittan_momen: {
      id: 'ittan_momen', name: 'Ittan-momen', chapter: 2, tier: 'normal', size: 'm',
      hp: [34, 41],
      moves: {
        wrap: { name: 'Wrap Tight', kind: 'attack', fx: [{ op: 'dmg', n: 7, tgt: 'front' }, { op: 'status', s: 'bind', n: 1, tgt: 'front' }] },
        squeeze: { name: 'Smothering Squeeze', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        billow: { name: 'Billow', kind: 'defend', fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'status', s: 'dodge', n: 1, tgt: 'self' }] },
      },
      ai: { weighted: [['wrap', 2], ['squeeze', 2], ['billow', 1]], noRepeat: 1 },
      art: { id: 'ittan_momen' },
      lore: 'A bolt of white cotton loose in the night wind. It wraps around whatever is warm, and it only stops when the warmth does.',
      tags: ['spirit'],
    },

    // ==================================================================================================================
    // ELITES
    // ==================================================================================================================
    drowned_general: {
      id: 'drowned_general', name: 'Drowned General', chapter: 2, tier: 'elite', size: 'l',
      hp: [102, 114],
      moves: {
        muster: { name: 'Muster the Drowned', kind: 'summon', say: 'The flood remembers. Rise.', fx: [{ op: 'summon', enemy: 'lantern_wisp', n: 1 }, { op: 'status', s: 'ritual', n: 1, tgt: 'self' }] },
        saber: { name: 'Waterlogged Saber', kind: 'attack', fx: [{ op: 'dmg', n: 13, tgt: 'front' }] },
        sweep: { name: 'Undertow Sweep', kind: 'attack', fx: [{ op: 'dmg', n: 8, tgt: 'both' }] },
        call: { name: 'Call the Lanterns', kind: 'summon', fx: [{ op: 'summon', enemy: 'lantern_wisp', n: 1 }] },
        crest: { name: 'Flood Crest', kind: 'heavy', say: 'DROWN.', fx: [{ op: 'dmg', n: 21, tgt: 'front' }, { op: 'status', s: 'weak', n: 1, tgt: 'both' }] },
      },
      ai: {
        open: ['muster'],
        seq: ['saber', 'sweep', 'saber'],
        rules: [{ if: { minions: { lt: 1 }, turnEvery: [3, 2] }, do: 'call' }],
      },
      phases: [{
        at: 0.5,
        say: 'The tide will not be turned!',
        fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }, { op: 'block', n: 8, tgt: 'self' }],
        ai: {
          open: ['crest'],
          seq: ['saber', 'sweep', 'saber'],
          rules: [{ if: { minions: { lt: 1 }, turnEvery: [3, 2] }, do: 'call' }],
        },
      }],
      art: { id: 'drowned_general' },
      lore: 'Commander of a fleet that sank with all hands, and who refuses to believe it. He calls the lanterns his lookouts and the flood his reserves.',
      tags: ['undead', 'folk', 'aquatic'],
    },

    puppet_master: {
      id: 'puppet_master', name: 'Puppet Master', chapter: 2, tier: 'elite', size: 'l',
      hp: [110, 120],
      moves: {
        strings: { name: 'Pull the Strings', kind: 'summon', say: 'Dance, my darlings. Dance.', fx: [{ op: 'summon', enemy: 'paper_puppet', n: 2 }] },
        restock: { name: 'Fresh Strings', kind: 'summon', say: 'One more for the chorus.', fx: [{ op: 'summon', enemy: 'paper_puppet', n: 1 }] },
        lash: { name: 'Thread Lash', kind: 'multi', fx: [{ op: 'dmg', n: 10, hits: 3, tgt: 'random' }] },
        tighten: { name: 'Tighten the Strings', kind: 'attack', fx: [{ op: 'dmg', n: 14, tgt: 'front' }, { op: 'status', s: 'might', n: 2, tgt: 'otherEnemy' }] },
        marionette: { name: 'Marionette Strike', kind: 'heavy', say: 'Not you. YOU.', fx: [{ op: 'dmg', n: 16, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        mend: { name: 'Mend the Seams', kind: 'heal', fx: [{ op: 'heal', n: 12, tgt: 'lowestEnemy' }] },
      },
      ai: {
        open: ['strings'],
        seq: ['lash', 'tighten', 'marionette'],
        rules: [
          { if: { allyHpLt: 0.5 }, do: 'mend' },
          { if: { minions: { lt: 2 }, turnEvery: [3, 2] }, do: 'restock' },
        ],
      },
      art: { id: 'puppet_master' },
      lore: 'The theatre\'s last puppeteer, who never got up from his stool. His hands are long gone. The strings work fine without them.',
      tags: ['folk', 'construct'],
    },

    umibozu: {
      id: 'umibozu', name: 'Umibozu', chapter: 2, tier: 'elite', size: 'l',
      hp: [112, 124],
      moves: {
        slam: { name: 'Tidal Slam', kind: 'attack', fx: [{ op: 'dmg', n: { base: 8, per: 'turn', mul: 1, cap: 14 }, tgt: 'both' }] },
        brine: { name: 'Brine Spray', kind: 'debuff', say: 'Hush.', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'both' }, { op: 'status', s: 'frail', n: 1, tgt: 'both' }] },
        toll: { name: 'Drowning Bell', kind: 'heavy', say: 'BOOOONG.', fx: [{ op: 'dmg', n: 15, tgt: 'front' }, { op: 'status', s: 'stun', n: 1, tgt: 'front' }] },
        maelstrom: { name: 'Maelstrom', kind: 'heavy', say: 'The sea takes everything.', fx: [{ op: 'dmg', n: 16, tgt: 'both' }] },
      },
      ai: {
        seq: ['slam', 'brine', 'slam'],
        rules: [
          { if: { hpLt: 0.4 }, do: 'maelstrom', once: true },
          { if: { turnEvery: [4, 2] }, do: 'toll' },
        ],
      },
      art: { id: 'umibozu' },
      lore: 'A monk-shaped shadow taller than the bridge, rising out of calm water. It wants nothing but silence, and the tide brings the silence with it.',
      tags: ['spirit', 'aquatic'],
    },

    // ==================================================================================================================
    // MINIONS (size s, simple, one accent each)
    // ==================================================================================================================
    spiderling: {
      id: 'spiderling', name: 'Spiderling', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 12],
      moves: {
        nip: { name: 'Poison Nip', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'poison' }, { op: 'status', s: 'poison', n: 1, tgt: 'front' }] },
        skitter: { name: 'Skitter', kind: 'buff', fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }] },
      },
      ai: { seq: ['nip', 'nip', 'skitter'] },
      art: { id: 'spiderling' },
      lore: 'A hatchling no bigger than a coin, quick as a stray thought. It nips first and apologises never.',
      tags: ['insect'],
    },

    paper_puppet: {
      id: 'paper_puppet', name: 'Paper Puppet', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 12],
      moves: {
        flail: { name: 'Paper Flail', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] },
        clap: { name: 'Paper Clap', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'back' }] },
      },
      ai: { seq: ['flail', 'clap'] },
      art: { id: 'paper_puppet' },
      lore: 'Folded from last season\'s playbills and hung on someone else\'s strings. It has one move, and the strings do the moving.',
      tags: ['construct'],
    },

    lantern_wisp: {
      id: 'lantern_wisp', name: 'Lantern Wisp', chapter: 2, tier: 'minion', size: 's',
      hp: [10, 13],
      moves: {
        singe: { name: 'Singe', kind: 'attack', fx: [{ op: 'dmg', n: 3, tgt: 'front', el: 'fire' }, { op: 'status', s: 'burn', n: 2, tgt: 'front' }] },
        warm: { name: 'Warm Glow', kind: 'defend', fx: [{ op: 'block', n: 5, tgt: 'otherEnemy' }] },
      },
      ai: { seq: ['singe', 'warm'], rules: [{ if: { alone: true }, do: 'singe' }] },
      immune: ['burn'],
      art: { id: 'lantern_wisp' },
      lore: 'A stray flame that slipped out of a lantern and never went back. It warms whatever is nearby, and burns whatever is closer.',
      tags: ['spirit'],
    },

    // ==================================================================================================================
    // BOSS: Jorogumo, the Silk Courtesan. Form 1 = the Courtesan (control, Plating). Form 2 = the Spider (offence, no Plating).
    // ==================================================================================================================
    boss_jorogumo: {
      id: 'boss_jorogumo', name: 'Jorogumo', title: 'The Silk Courtesan', chapter: 2, tier: 'boss', size: 'xl',
      hp: [258, 264],
      start: [{ op: 'status', s: 'plating', n: 4, tgt: 'self' }],
      moves: {
        // form 1
        brood: { name: 'Honoured Guests', kind: 'summon', say: 'Welcome, welcome. Do stay for supper.', fx: [{ op: 'summon', enemy: 'spiderling', n: 2 }] },
        hatch: { name: 'Another Guest', kind: 'summon', say: 'One more place at the table.', fx: [{ op: 'summon', enemy: 'spiderling', n: 1 }] },
        snare: { name: 'Silk Snare', kind: 'debuff', say: 'Hold still, darling. Threads are delicate.', fx: [{ op: 'status', s: 'bind', n: 1, tgt: 'both' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        embrace: { name: 'Silken Embrace', kind: 'heavy', say: 'Closer. Closer.', fx: [{ op: 'dmg', n: { base: 13, per: 'status', s: 'bind', who: 'target', mul: 9, cap: 22 }, tgt: 'front' }] },
        kiss: { name: 'Venom Kiss', kind: 'attack', fx: [{ op: 'dmg', n: 12, tgt: 'back', el: 'poison' }, { op: 'status', s: 'poison', n: 3, tgt: 'back' }] },
        fan: { name: 'Iron Fan Dance', kind: 'multi', fx: [{ op: 'dmg', n: 5, hits: 3, tgt: 'random' }] },
        // form 2
        legs: { name: 'Eight Legs', kind: 'multi', say: 'Sit. Sit. SIT.', fx: [{ op: 'dmg', n: 4, hits: 4, tgt: 'random' }] },
        spin: { name: 'Spin the Threads', kind: 'debuff', say: 'One thread. A thousand. Hold still.', fx: [{ op: 'status', s: 'bind', n: 2, tgt: 'both' }, { op: 'add', card: 'status_tangle', n: 1, to: 'draw', top: true }] },
        web: { name: 'Thousand-Thread Web', kind: 'heavy', say: 'A thousand threads, one supper.', fx: [{ op: 'dmg', n: { base: 8, per: 'status', s: 'bind', who: 'target', mul: 4, cap: 14 }, tgt: 'both' }] },
        frenzy: { name: 'Eight-Legged Frenzy', kind: 'multi', say: 'I will unpick every last one of you!', fx: [{ op: 'dmg', n: 3, hits: 6, tgt: 'random' }] },
      },
      ai: {
        open: ['brood', 'snare'],
        seq: ['fan', 'kiss'],
        rules: [
          { if: { heroStatus: { s: 'bind' } }, do: 'embrace' },
          { if: { minions: { lt: 1 }, turnEvery: [4, 3] }, do: 'hatch' },
          { if: { turnEvery: [4, 1] }, do: 'snare' },
        ],
      },
      phases: [{
        at: 0.5,
        say: 'Enough of this costume. Look at me properly!',
        fx: [{ op: 'removeStatus', s: 'plating', tgt: 'self' }, { op: 'status', s: 'might', n: 2, tgt: 'self' }],
        ai: {
          open: ['spin'],
          seq: ['legs', 'kiss', 'spin'],
          rules: [
            { if: { hpLt: 0.2 }, do: 'frenzy', once: true },
            { if: { heroStatus: { s: 'bind', gte: 2 } }, do: 'web' },
          ],
        },
      }],
      immune: ['stun'],
      art: { id: 'boss_jorogumo' },
      lore: 'The mistress of the Sunken Lantern City receives every guest in her finest kimono, and every guest stays for supper. Beneath the silk she is all legs, and her patience is thinner than her thread.',
      tags: ['insect', 'folk'],
    },
  });

  // ====================================================================================================================
  // ENCOUNTERS. id, enemies (smallest first, tallest last: lanes fill from the right), w = weight, min = lowest tile.diff.
  // Pairs are built on purpose: chochin lights a samurai, Bind pins a back-row target, nopperabo punishes a stuck front hero.
  // ====================================================================================================================
  DATA.addEncounters(2, {
    normal: [
      { id: 'ch2_lone_lantern', enemies: ['chochin'], w: 3, min: 0 },
      { id: 'ch2_wind_up_toy', enemies: ['karakuri_puppet'], w: 3, min: 0 },
      { id: 'ch2_faceless_wanderer', enemies: ['nopperabo'], w: 3, min: 0 },
      { id: 'ch2_pond_and_cloth', enemies: ['koi_spirit', 'ittan_momen'], w: 3, min: 0.1 },
      { id: 'ch2_old_shamisen', enemies: ['chochin', 'tsukumogami'], w: 3, min: 0.1 },
      { id: 'ch2_river_lady', enemies: ['nure_onna'], w: 2, min: 0.15 },
      { id: 'ch2_weavers_corner', enemies: ['ittan_momen', 'silk_weaver'], w: 3, min: 0.25 },
      { id: 'ch2_shroud_and_cloth', enemies: ['nopperabo', 'ittan_momen'], w: 2, min: 0.3 },
      { id: 'ch2_river_song', enemies: ['koi_spirit', 'nure_onna'], w: 3, min: 0.3 },
      { id: 'ch2_long_necks', enemies: ['ittan_momen', 'rokurokubi'], w: 2, min: 0.35 },
      { id: 'ch2_theatre_troupe', enemies: ['tsukumogami', 'karakuri_puppet'], w: 3, min: 0.35 },
      { id: 'ch2_clockwork_neck', enemies: ['karakuri_puppet', 'rokurokubi'], w: 2, min: 0.4 },
      { id: 'ch2_bridge_guard', enemies: ['chochin', 'drowned_samurai'], w: 3, min: 0.4 },
      { id: 'ch2_faceless_choir', enemies: ['nopperabo', 'nopperabo'], w: 2, min: 0.5 },
      { id: 'ch2_night_market', enemies: ['chochin', 'koi_spirit', 'tsukumogami'], w: 3, min: 0.5 },
      { id: 'ch2_flooded_bridge', enemies: ['nure_onna', 'drowned_samurai'], w: 2, min: 0.5 },
      { id: 'ch2_lantern_parade', enemies: ['chochin', 'rokurokubi', 'silk_weaver'], w: 2, min: 0.65 },
      { id: 'ch2_drowned_procession', enemies: ['koi_spirit', 'rokurokubi', 'drowned_samurai'], w: 2, min: 0.7 },
      { id: 'ch2_mistress_court', enemies: ['spiderling', 'spiderling', 'silk_weaver', 'nure_onna'], w: 2, min: 0.8 },
    ],
    elite: [
      { id: 'ch2_sunken_fleet', enemies: ['lantern_wisp', 'drowned_general'], w: 3, min: 0 },
      { id: 'ch2_last_show', enemies: ['puppet_master'], w: 3, min: 0.15 },
      { id: 'ch2_bridge_monk', enemies: ['umibozu'], w: 3, min: 0.3 },
    ],
    boss: 'boss_jorogumo',
  });
})();
