/* SUNBEAM SIEGE: Elites and Bosses (agent B12)
 *
 * Exports: SB.data.enemiesElites (12), SB.data.enemiesBosses (6 pool bosses + 1 final, 7 total),
 *          SB.data.enemiesBossAdds (summoned pests, reruns), SB.data.dawnPhaseTemplate,
 *          SB.data.bossRules (selection and reward constants).
 *
 * SHAPE (extends A02 section 17 pest shape):
 *  { id, name, tier:'elite'|'boss'|'final', act, family, hp, size, hide, traits[], threat,
 *    mechanic:{name,text}, answers[] (build tags for UI hints and the design doc),
 *    passives[] ({id,name,text,on,effects}), pattern:{type:'cycle'|'conditional',...},
 *    phases[] (bosses), hazards[], meters{}, encounter{waves,impatienceRound,winIf},
 *    rewards{}, intro, defeat, flavor, art }
 *  HP is BASE HP. A07 hpScale (1 + 0.05 * (night - 1)) is applied on top by the encounter builder.
 *  Bosses: traits always include Heavy or Anchored. Yarn duration is halved (round up) and they are
 *  immune to Scared (A04 1.4). Knock obeys A02 13 (Anchored never moves, Heavy ignores pushes).
 *
 * ACTION KINDS (pattern.actions[]): attack {dmg,hits,floors,pick,status?}, hide {amount},
 *  buff {status,amount,target}, debuff {status,amount,floors,pick}, summon {id,count,floors,at},
 *  sunbeam {dmg}, special {op,...}, wait {}. Every action has label and an optional `intent` UI string.
 * EFFECT OPS (passives, onEnter, onDeath): damage, status, hide, heal, summon, shove, trap, inhale,
 *  spit, flatten, floorHazard, setMeter, addMeter, clearStatus, stagger, extraMove, log.
 *  Targets use A03 names plus: frontCat, allCatsOnFloor, allCats, strongestCat, mostLivesCat,
 *  napingCats, self, sunbeam, allPests, floor.
 * PHASES: { id, name, hpPctBelow, onEnter[], clears[], stagger (skip next action), traitsAdd[],
 *  traitsRemove[], passivesAdd[], pattern, hazards, announce }. A phase triggers once, when HP
 *  falls to or below the threshold after damage resolves. Overkill past the threshold is lost.
 *  Only one phase change per damage resolution; if a hit crosses two thresholds, the next
 *  phase begins at the start of the following Cat Attacks phase.
 *
 * NEEDS (engine agent, nothing here is silent):
 *  1. Pest passive hooks: onRoundStart, onPestPhaseStart, onDusk, onDamaged, onDeath, onCatPhaseEnd,
 *     onAnyPestDeath, onHitBy:{hit}.
 *  2. New ops: shove (move a cat to the back of its floor, breaks Piles), trap (remove a cat into a
 *     Carrier slot), inhale/spit (Dustbag), flatten (destroy a Box), extraMove, stagger.
 *  3. New cat statuses: coned (cannot attack, Nap, Box, or join a Pile; Cleanse or a voluntary Spend
 *     a Life removes it), soaked is NOT new (Wet 3 on a cat becomes Scared 1 once per round, rule below).
 *  4. New pick values: strongest (A02), mostLives, highestAttack, napingCats.
 *  5. New pest traits: Stoic (damage cap per hit, field `hitCap`), Untargetable (field `untargetable`
 *     with `exceptions`), Court (reduction per ally), Sneaky (A02), Flying (cosmetic, no rule).
 *  6. Meters shown on the boss card: pressure, heat, waterLevel, fuse, bag, stance.
 *  7. Floor hazards: puddle (A04), rat_tide, gnaw, suds, draft, sterile_lights, static (see hazards[]).
 *  8. winIf types: bossDead, any[], dawnRounds:n (A02 15 allows winIf to replace the standard test).
 *  9. rewards flags consumed by the reward builder (see SB.data.bossRules.rewardDefaults).
 * 10. Zoom hits (Witching Hour, RULES section 6) must be allowed to target a pest flagged Untargetable
 *     when its exceptions list contains 'zoom' (A05 line 366 says bosses cannot be Zoomed, this is the
 *     one deliberate exception, Red Dot only).
 * 11. runHistory: the run state exposes defeatedBosses[] so the Great Bath can summon Reruns.
 */
window.SB = window.SB || {};
SB.data = SB.data || {};

(function () {
  'use strict';

  var atk = function (label, dmg, o) {
    return Object.assign({ kind: 'attack', label: label, dmg: dmg, hits: 1, floors: 'own', pick: 'front' }, o || {});
  };

  var rewardDefaults = {
    // A07 table: boss Fish 70 / 90 / bonus score, big draft 1 of 3 with at least 1 Rare, Boss Relic 1 of 3,
    // Collar Charm 1 of 3, heal 40 percent max Warmth, +5 max Warmth in Acts 1 and 2 only.
    fish: 'boss', bigDraft: true, rareGuaranteed: true, bossRelicChoice: 3, collarCharmChoice: 3,
    healPct: 0.4, maxWarmthBonus: 5, championUpgrade: false, growthReportMin: 3
  };
  var rw = function (o) { return Object.assign({}, rewardDefaults, o || {}); };

  /* ------------------------------------------------------------------ ELITES */
  SB.data.enemiesElites = [

    /* ---------- ACT 1: THE CELLAR AND GARDEN ---------- */
    {
      id: 'pest_elite_duchess_of_drains', name: 'The Duchess of Drains', tier: 'elite', act: 1, family: 'rats',
      hp: 32, size: 2, hide: 0, traits: [], threat: 14,
      mechanic: { name: 'Royal Court', text: 'Takes 20% less damage per other pest on her floor (max 3 courtiers, 60%). Decrees summon more.' },
      answers: ['aoe', 'knock', 'sweep'],
      passives: [{ id: 'court', name: 'Royal Court', on: 'onDamaged', text: 'Incoming damage reduced 20 percent per other pest on this floor, max 60 percent, rounded down.',
        effects: [{ op: 'reduceIncoming', pctPer: 20, per: 'otherPestsOnFloor', maxPct: 60 }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'summon', label: 'Decree', id: 'pest_add_court_rat', count: 2, floors: [1], at: 'back', intent: 'Summons 2' },
        atk('Scepter Rap', 5),
        atk('Scepter Rap', 5),
        { kind: 'summon', label: 'Decree', id: 'pest_add_court_rat', count: 1, floors: [1], at: 'back', intent: 'Summons 1' }
      ] },
      rewards: { fish: 'elite', relic: true, extra: 'Ermine Collar chance' },
      intro: 'Please wipe your paws. The drain has standards.',
      defeat: 'The court disperses. One rat keeps the crown. For later.',
      flavor: 'Rules the drains. Has never once been asked about it.',
      art: 'Fat grey rat in a moth-eaten ermine collar, tiny tarnished tiara, scepter made of a fork'
    },
    {
      id: 'pest_elite_lawn_gnome_sergeant', name: 'Lawn Gnome Sergeant', tier: 'elite', act: 1, family: 'garden',
      hp: 26, size: 2, hide: 6, traits: [], hitCap: 5, threat: 15,
      mechanic: { name: 'Stoic', text: 'No single hit deals more than 5 damage to it. Status damage, Shatter, Hairball and Dizzy ignore the cap.' },
      answers: ['multiHit', 'dot', 'shatter', 'claws'],
      passives: [{ id: 'stoic', name: 'Stoic', on: 'onDamaged', text: 'Each hit is capped at 5 after Hide. Statuses and Shatter are not hits.',
        effects: [{ op: 'capHit', amount: 5, ignores: ['status', 'shatter', 'dot'] }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'hide', label: 'Parade Rest', amount: 4, intent: 'Hide 4' },
        atk('Pitchfork', 6),
        atk('Pitchfork', 6),
        { kind: 'buff', label: 'Chin Up', status: 'rage', amount: 1, target: 'self', intent: 'Rage 1' }
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Halt. State your business, and your breed.',
      defeat: 'Chipped, not broken. Mostly broken.',
      flavor: 'Has stood in one place for eleven years and is proud of it.',
      art: 'Ceramic garden gnome, red pointed hat, white beard, holding a pitchfork, chipped nose'
    },
    {
      id: 'pest_elite_magpie_fence', name: 'Magpie the Fence', tier: 'elite', act: 1, family: 'birds',
      hp: 21, size: 1, hide: 0, traits: ['Sneaky', 'Flying'], threat: 12, spawnFloor: 3,
      mechanic: { name: 'Pilfer', text: 'Arrives on the Attic. Each round steals one Room item or Box from a floor (kept in her nest, returned when she dies) and pecks the Sunbeam directly.' },
      answers: ['attic', 'reach', 'shade', 'burst'],
      passives: [{ id: 'nest', name: 'Nest', on: 'onDeath', text: 'Returns every stolen item and drops 20 Fish.',
        effects: [{ op: 'returnStolen' }, { op: 'grantFish', amount: 20 }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'steal', label: 'Pilfer', floors: 'each', pick: 'random', what: 'roomItem', intent: 'Steals an item' },
        { kind: 'sunbeam', label: 'Peck', dmg: 4, intent: 'Sunbeam 4' },
        { kind: 'sunbeam', label: 'Peck', dmg: 4, intent: 'Sunbeam 4' }
      ] },
      rewards: { fish: 'elite', relic: true, bountyFish: 20 },
      intro: 'Oh, that is shiny. That is mine now.',
      defeat: 'Drops everything, including a spoon nobody had missed.',
      flavor: 'Fenced a whole Toy room before breakfast.',
      art: 'Glossy black and white magpie, blue-green sheen, wearing three stolen rings on one leg'
    },
    {
      id: 'pest_elite_duke_good_boy', name: 'Duke, a Good Boy', tier: 'elite', act: 1, family: 'dogs',
      hp: 38, size: 2, hide: 0, traits: ['Climber'], threat: 16,
      mechanic: { name: 'Ravenous', text: 'Gains 1 Rage every round. At 5 Rage he gains Hide equal to his Rage each round. A race against the clock.' },
      answers: ['burst', 'hiss', 'yarn', 'fluff'],
      passives: [{ id: 'ravenous', name: 'Ravenous', on: 'onRoundStart', text: '+1 Rage. At Rage 5+, +Rage Hide.',
        effects: [{ op: 'status', status: 'rage', amount: 1, target: 'self' }, { op: 'hide', amountFrom: 'rage', minRage: 5, target: 'self' }] }],
      pattern: { type: 'cycle', actions: [
        atk('Bark', 4),
        atk('Chomp', 6),
        { kind: 'attack', label: 'Mailman Sense', dmg: 3, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 3' },
        atk('Chomp', 6)
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'HELLO. HELLO. YOU ARE NEW. HELLO.',
      defeat: 'Sits. Is, in fact, a good boy. The cats are not sure how they feel.',
      flavor: 'Not angry. Enthusiastic in a way that hurts.',
      art: 'Big yellow Labrador, mud to the knees, tennis ball in jaw, tail a blur'
    },

    /* ---------- ACT 2: THE PARLOR ---------- */
    {
      id: 'pest_elite_count_cucumber', name: 'Count Cucumber', tier: 'elite', act: 2, family: 'produce',
      hp: 70, size: 1, hide: 0, traits: ['Slippery'], threat: 22,
      mechanic: { name: 'Startle', text: 'Each round Scares the strongest cat (Scared 1). He gains 5 Hide for every Scared cat. Scared cats cannot attack.' },
      answers: ['cleanse', 'purrAura', 'cheapBodies', 'burst'],
      passives: [{ id: 'chill', name: 'Cold Cuts', on: 'onDusk', text: '+5 Hide per Scared cat on the board.',
        effects: [{ op: 'hide', amountPer: 5, per: 'scaredCats', target: 'self' }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'debuff', label: 'Startle', status: 'scared', amount: 1, floors: 'each', pick: 'strongest', dmg: 2, intent: 'Scares strongest' },
        atk('Cold Slice', 8),
        { kind: 'debuff', label: 'Startle', status: 'scared', amount: 1, floors: 'each', pick: 'strongest', dmg: 2, intent: 'Scares strongest' },
        atk('Cold Slice', 8, { floors: 'reach' })
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Good evening. You will want to jump now.',
      defeat: 'Rolls under the fridge. Is, technically, a vegetable.',
      flavor: 'It was a cucumber. It was ALWAYS a cucumber.',
      art: 'Tall green cucumber in a velvet opera cape, one monocle, menacing grin carved in the skin'
    },
    {
      id: 'pest_elite_mop_and_bucket', name: 'Mop and Bucket', tier: 'elite', act: 2, family: 'cleaning',
      hp: 87, size: 3, hide: 0, traits: [], threat: 24,
      mechanic: { name: 'Mop Up', text: 'Floods a floor every round (Puddle). Soaks the front 3 cats with Wet 2. It slips in its own Puddle: Knock It Off sends it two floors.' },
      answers: ['cleanse', 'heatLamp', 'noClawsPurr', 'knock'],
      passives: [{ id: 'puddle_self', name: 'Slippery When Wet', on: 'onRoundStart', text: 'While its floor is a Puddle it counts as Wet and Slippery (A04).',
        effects: [{ op: 'conditionalStatus', if: 'floorIsPuddle', status: 'wet', amount: 1, target: 'self' }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'floorHazard', hazard: 'puddle', floors: 'own', label: 'Mop Up', intent: 'Floods floor' },
        { kind: 'debuff', label: 'Soak', status: 'wet', amount: 2, floors: 'own', pick: 'front3', dmg: 4, intent: 'Wet 2 x3, 4' },
        atk('Wring Out', 9),
        { kind: 'special', op: 'floorHazard', hazard: 'puddle', floors: 'reach', label: 'Mop Up', intent: 'Floods floor' }
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Mind the wet floor. Actually do not.',
      defeat: 'Falls over in a clatter. Nobody goes near it. It is still wet.',
      flavor: 'The bucket was only ever there for support.',
      art: 'Grey string mop head on a pole, steel bucket on wheels, soap suds down its side'
    },
    {
      id: 'pest_elite_static_duster', name: 'Static Duster', tier: 'elite', act: 2, family: 'cleaning',
      hp: 70, size: 2, hide: 0, traits: [], threat: 22,
      mechanic: { name: 'Static Cling', text: 'Its attack strips all Fluff from the target and both neighbors, and it takes that Fluff as Hide (cap 20). Anchors a Dull cloud.' },
      answers: ['noFluffReliance', 'pierce', 'shatter', 'hidden', 'burst'],
      passives: [{ id: 'cling', name: 'Static Cling', on: 'onPestAttack', text: 'Strips Fluff from target and neighbors; self Hide +stripped (cap 20).',
        effects: [{ op: 'stripFluff', targets: 'targetAndNeighbors', toSelfHide: true, cap: 20 }] }],
      pattern: { type: 'cycle', actions: [
        atk('Feather Flick', 7),
        { kind: 'debuff', label: 'Dust Cloud', status: 'dull', amount: 1, floors: 'own', pick: 'all', dmg: 0, intent: 'Dull 1 floor' },
        atk('Feather Flick', 7),
        atk('Static Zap', 10, { pick: 'strongest' })
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Do not mind me. I will be on you for hours.',
      defeat: 'Goes limp. All the fluff comes back. Everyone is a bit embarrassed.',
      flavor: 'Collects things. Mostly your armor.',
      art: 'Pink and purple ostrich-feather duster with a long handle, sparks arcing at the tips'
    },
    {
      id: 'pest_elite_wheelie_bin_warden', name: 'Wheelie Bin Warden', tier: 'elite', act: 2, family: 'outdoor',
      hp: 86, size: 2, hide: 0, traits: ['Heavy'], threat: 24,
      mechanic: { name: 'Bin Day', text: 'Heavy, ignores Knock. Each round it flattens one Box on its floor or the floor above, and hits Hidden cats for double. Sniffs out Hidden targets.' },
      answers: ['noBoxes', 'burst', 'attic', 'pierce'],
      passives: [{ id: 'sniff', name: 'Sniffs Out', on: 'onPestAttack', text: 'Ignores Hidden when picking targets. Double damage to Hidden cats.',
        effects: [{ op: 'ignoreHidden' }, { op: 'doubleVs', status: 'hidden' }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'flatten', label: 'Bin Day', floors: 'ownOrAbove', what: 'box', intent: 'Flattens a Box' },
        atk('Lid Slam', 9),
        atk('Lid Slam', 9),
        { kind: 'special', op: 'flatten', label: 'Bin Day', floors: 'ownOrAbove', what: 'box', intent: 'Flattens a Box' }
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Collection is Thursday. It is not Thursday. I am here anyway.',
      defeat: 'Tips over. The boxes tumble out, flat, but accounted for.',
      flavor: 'Eats cardboard and holds a grudge.',
      art: 'Green wheelie bin with a lid like a jaw, stinking cloud, hand-painted house number 14'
    },

    /* ---------- ACT 3: THE ATTIC AND ROOF ---------- */
    {
      id: 'pest_elite_snooze_alarm', name: 'Snooze Alarm', tier: 'elite', act: 3, family: 'clocks',
      hp: 87, size: 1, hide: 8, traits: [], threat: 30,
      mechanic: { name: 'Reveille', text: 'Rings every 2nd round: every napping cat takes 3 damage, loses all Rested, and has a Rude Awakening. At half HP it hits Snooze: Dizzy 2, heals 20, once.' },
      answers: ['noNap', 'timeStretch', 'burst', 'cleansePurge'],
      passives: [
        { id: 'ring', name: 'Reveille', on: 'onRoundStart', text: 'Even rounds: wake all napping cats (3 damage, lose Rested).',
          effects: [{ op: 'ifRoundEven', then: [{ op: 'damage', amount: 3, target: 'napingCats' }, { op: 'clearStatus', status: 'rested', target: 'napingCats' }, { op: 'wake', target: 'napingCats' }] }] },
        { id: 'snooze', name: 'Snooze', on: 'onDamaged', text: 'Once, at 50 percent HP: Dizzy 2, heal 20.',
          effects: [{ op: 'once', key: 'snooze', if: { hpPctBelow: 50 }, then: [{ op: 'status', status: 'dizzy', amount: 2, target: 'self' }, { op: 'heal', amount: 20, target: 'self' }] }] }
      ],
      pattern: { type: 'cycle', actions: [
        atk('Beep', 8), atk('BEEP', 11),
        { kind: 'attack', label: 'Alarm Blast', dmg: 5, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 5' },
        atk('BEEP', 11)
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'It is 6 AM. It is always 6 AM. Up.',
      defeat: 'Winds down. Somewhere a cat sighs in relief and rolls over.',
      flavor: 'Has never once been the one who needed to wake up.',
      art: 'Twin-bell wind-up alarm clock, red hands, angry eyebrows, tiny legs, hammer swinging'
    },
    {
      id: 'pest_elite_thunderhead', name: 'The Thunderhead', tier: 'elite', act: 3, family: 'weather',
      hp: 79, size: 2, hide: 0, traits: ['Flying'], threat: 32,
      mechanic: { name: 'Lightning Rod', text: 'Every round a bolt hits the cat with the highest Attack for 9, ignoring Fluff, Hidden and Decoy. Every 3rd round a Thunderclap hits everyone for 3 and Scares the front cats.' },
      answers: ['spreadPower', 'decoyBait', 'lives', 'cleanse'],
      passives: [{ id: 'bolt', name: 'Lightning Rod', on: 'onPestPhaseStart', text: '9 damage to highest Attack cat, ignores Fluff, Hidden, Decoy.',
        effects: [{ op: 'damage', amount: 9, target: 'highestAttackCat', ignores: ['fluff', 'hidden', 'decoy'] }] }],
      pattern: { type: 'cycle', actions: [
        atk('Drizzle', 5),
        atk('Hail', 6, { hits: 2 }),
        { kind: 'attack', label: 'Thunderclap', dmg: 4, hits: 1, floors: 'each', pick: 'all', status: { scared: 1, pick: 'front' }, intent: 'All cats 3, Scares' }
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Indoor weather. Do not ask. It is not a leak.',
      defeat: 'Rains out. The cats sit in the puddle, deeply offended.',
      flavor: 'The ceiling stain has opinions.',
      art: 'Grey storm cloud with a scowling face crackling yellow, stuck against the attic rafters'
    },
    {
      id: 'pest_elite_grand_finale_crate', name: 'Grand Finale Crate', tier: 'elite', act: 3, family: 'fireworks',
      hp: 53, size: 2, hide: 0, traits: [], threat: 30,
      meters: { fuse: { start: 3, max: 3, label: 'Fuse' } },
      mechanic: { name: 'Fuse', text: 'A 3 round fuse. At 0 it detonates: 14 to every cat on every floor and 10 to the Sunbeam, then relights. Wet 1 on it adds a round. Launches a Rocket each round.' },
      answers: ['burst', 'fluffStock', 'wet', 'reachSunbeamShade'],
      passives: [
        { id: 'fuse', name: 'Fuse', on: 'onDusk', text: 'Fuse -1. At 0: detonate, then Fuse 4.',
          effects: [{ op: 'addMeter', meter: 'fuse', amount: -1 }, { op: 'ifMeter', meter: 'fuse', eq: 0, then: [
            { op: 'damage', amount: 14, target: 'allCats' }, { op: 'damage', amount: 10, target: 'sunbeam' }, { op: 'setMeter', meter: 'fuse', value: 4 }] }] },
        { id: 'fizzle', name: 'Fizzle', on: 'onStatusApplied', text: 'Wet applied to it: Fuse +1 (max 5).',
          effects: [{ op: 'ifStatus', status: 'wet', then: [{ op: 'addMeter', meter: 'fuse', amount: 1, max: 5 }] }] }
      ],
      pattern: { type: 'cycle', actions: [
        { kind: 'summon', label: 'Light a Rocket', id: 'pest_add_rocket', count: 1, floors: [3], at: 'back', intent: 'Rocket' },
        atk('Sparkler', 6),
        { kind: 'summon', label: 'Light a Rocket', id: 'pest_add_rocket', count: 1, floors: [3], at: 'back', intent: 'Rocket' },
        atk('Bottle Rocket', 7, { floors: 'reach' })
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'Light the blue touch paper. Stand back. Further back.',
      defeat: 'Goes out with a very small pop. A disappointment to all fireworks.',
      flavor: 'Rated four stars by someone who was not in the room.',
      art: 'Wooden crate stamped GRAND FINALE, fat fuse sparking, rockets poking out like teeth'
    },
    {
      id: 'pest_elite_cone_warden', name: 'Cone of Shame Warden', tier: 'elite', act: 3, family: 'vet',
      hp: 101, size: 2, hide: 4, traits: [], threat: 30,
      mechanic: { name: 'Coning', text: 'Cones the cat with the most Lives each round (max 2 Coned). A Coned cat cannot attack, Nap, hide in a Box or join a Pile. It gains +2 Attack per Coned cat. Cleanse or Spend a Life frees one.' },
      answers: ['cleanse', 'spendLife', 'cheapBodies', 'burst'],
      passives: [{ id: 'cone_power', name: 'Smug', on: 'onPestPhaseStart', text: '+2 Attack per Coned cat.',
        effects: [{ op: 'attackBonusPer', per: 'conedCats', amount: 2 }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'debuff', label: 'Cone', status: 'coned', amount: 1, floors: 'each', pick: 'mostLives', dmg: 0, maxActive: 2, intent: 'Cones a cat' },
        atk('Scold', 7),
        { kind: 'debuff', label: 'Cone', status: 'coned', amount: 1, floors: 'each', pick: 'mostLives', dmg: 0, maxActive: 2, intent: 'Cones a cat' },
        atk('Lecture', 6, { hits: 2 })
      ] },
      rewards: { fish: 'elite', relic: true },
      intro: 'This hurts me more than it hurts you. Hold still.',
      defeat: 'The cones fall off. Every one of them lands on its head.',
      flavor: 'Says it is for your own good. It is not.',
      art: 'Tall vet tech in a white coat with a rolled-up plastic cone for a hat, clipboard, stern eyebrows'
    }
  ];

  /* ------------------------------------------------------------------ BOSSES */
  var DAWN_TEMPLATE = {
    id: 'dawn', name: 'Dawn', hpPctBelow: 25, stagger: true, dawn: true,
    announce: '6:00 AM. The alarm goes off, and every pest in the house hears it.',
    onEnter: [
      { op: 'log', text: 'The window turns gold. Everything with a pulse speeds up.' },
      { op: 'extraMove', target: 'allPests', rule: 'each pest repeats its current intent once more per Pest Attacks phase' },
      { op: 'status', status: 'claws', amount: 1, target: 'allCats' },
      { op: 'heal', amount: 6, target: 'sunbeam' },
      { op: 'addShade', amount: 6 }
    ],
    passivesAdd: [{ id: 'sunrise', name: 'Sunrise', on: 'onDusk', text: 'Sunbeam +2 Warmth and +3 Shade each Dusk. Dawn lasts until the boss falls.',
      effects: [{ op: 'dawnTick' }, { op: 'heal', amount: 2, target: 'sunbeam' }, { op: 'addShade', amount: 3 }] }],
    clears: ['yarn', 'dull', 'hiss']
  };
  SB.data.dawnPhaseTemplate = DAWN_TEMPLATE;

  SB.data.enemiesBosses = [

    /* ============ ACT 1 ============ */
    {
      id: 'pest_boss_rat_king', name: 'The Rat King', tier: 'boss', act: 1, family: 'rats',
      hp: 54, size: 5, hide: 0, traits: ['Anchored'], threat: 45, spawnFloor: 1,
      mechanic: { name: 'Tribute', text: 'Rats pour in from the drains on the Parlor and Attic. Whenever any pest dies he heals 5 (max 10 a round). In the last phase he abandons the throne and rushes the Sunbeam.' },
      answers: ['burstWindows', 'yarnAdds', 'dot', 'holdTheAttic'],
      passives: [{ id: 'tribute', name: 'Tribute', on: 'onAnyPestDeath', text: 'Heals 5 per pest death, max 10 per round.',
        effects: [{ op: 'heal', amount: 5, target: 'self', capPerRound: 10 }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'summon', label: 'Decree', id: 'pest_add_court_rat', count: 2, floors: [2, 3], at: 'back', intent: 'Summons 2' },
        atk('Royal Scratch', 6),
        { kind: 'summon', label: 'Decree', id: 'pest_add_court_rat', count: 2, floors: [2, 3], at: 'back', intent: 'Summons 2' },
        atk('Tail Whip', 3, { hits: 2 })
      ] },
      phases: [
        { id: 'p2_pied_panic', name: 'Pied Panic', hpPctBelow: 60, stagger: true,
          announce: 'The crown slips. Every drain in the house starts to sing.',
          onEnter: [
            { op: 'summon', id: 'pest_add_court_rat', count: 3, floors: [2, 3], at: 'back' },
            { op: 'floorHazard', hazard: 'rat_tide', floors: [2, 3] }
          ],
          pattern: { type: 'cycle', actions: [
            { kind: 'summon', label: 'Rat Tide', id: 'pest_add_court_rat', count: 3, floors: [2, 3], at: 'back', intent: 'Summons 3' },
            atk('Royal Scratch', 8),
            { kind: 'attack', label: 'Throne Quake', dmg: 3, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 3' },
            atk('Tail Whip', 4, { hits: 2 })
          ] } },
        { id: 'p3_abdication', name: 'Abdication', hpPctBelow: 25, stagger: false,
          announce: 'The king stands up. He is smaller than you thought. He is also fast.',
          traitsRemove: ['Anchored'], traitsAdd: ['Heavy', 'Climber'], clears: ['yarn'],
          onEnter: [{ op: 'removePassive', id: 'tribute' }, { op: 'clearHazard', hazard: 'rat_tide' }, { op: 'status', status: 'rage', amount: 3, target: 'self' }],
          pattern: { type: 'cycle', actions: [
            atk('Royal Scratch', 9, { floors: 'reach' }),
            { kind: 'attack', label: 'Scurry', dmg: 5, hits: 2, floors: 'own', pick: 'front', intent: '5 x2, climbs' },
            { kind: 'sunbeam', label: 'Crown Toss', dmg: 9, intent: 'Sunbeam 10 (Attic)' }
          ] } }
      ],
      hazards: [{ id: 'rat_tide', name: 'Rat Tide', text: 'At Dusk each cat on the floor takes 1 damage (ignores Fluff) per rat on its floor, max 4.', floors: [2, 3], tick: 'onDusk' }],
      encounter: { id: 'boss_rat_king', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_rat_king', floor: 1 }] },
          { round: 4, spawns: [{ id: 'pest_add_court_rat', floor: 2 }, { id: 'pest_add_court_rat', floor: 3 }] }
        ], onWinRemainingPests: 'vanish' },
      rewards: rw({ maxWarmthBonus: 5, relicFlavor: 'Gnawed Crown' }),
      intro: 'Kneel. Or do not. The rats will kneel for you.',
      defeat: 'The crown rolls into a drain. Nobody follows it.',
      flavor: 'It has been a long night. The rat has been wearing a crown.',
      art: 'Huge grey rat on a throne of old cheese rinds, gnawed gold crown, tails knotted into a cape'
    },
    {
      id: 'pest_boss_garden_hose', name: 'Garden Hose, Serpent of the Lawn', tier: 'boss', act: 1, family: 'garden',
      hp: 70, size: 3, hide: 0, traits: ['Anchored'], threat: 45, spawnFloor: 1,
      meters: { pressure: { start: 0, max: 4, label: 'Pressure' } },
      mechanic: { name: 'Water Pressure', text: 'Pressure rises 1 a round. At 4 it Blasts: every cat shoved to the back of its floor (Piles break), Wet 2 on all, Boxes washed away. Each Coil you destroy cuts Pressure by 2.' },
      answers: ['killCoils', 'noPile', 'noBoxes', 'cleanse', 'burst'],
      passives: [{ id: 'pressure', name: 'Pressure', on: 'onDusk', text: 'Pressure +1. At 4: Blast, then Pressure 0.',
        effects: [{ op: 'addMeter', meter: 'pressure', amount: 1 }, { op: 'ifMeter', meter: 'pressure', gte: 4, then: [
          { op: 'shove', target: 'allCats', to: 'back' }, { op: 'status', status: 'wet', amount: 2, target: 'allCats' },
          { op: 'flatten', what: 'box', floors: 'all' }, { op: 'setMeter', meter: 'pressure', value: 0 }] }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'summon', label: 'Uncoil', id: 'pest_add_hose_coil', count: 1, floors: [2, 3], at: 'back', intent: 'A Coil appears' },
        { kind: 'debuff', label: 'Soak', status: 'wet', amount: 1, floors: 'own', pick: 'front', dmg: 5, shove: true, intent: '5, Wet, shoved' },
        atk('Whip Crack', 7),
        { kind: 'debuff', label: 'Soak', status: 'wet', amount: 1, floors: 'reach', pick: 'front', dmg: 5, shove: true, intent: '5, Wet, shoved' }
      ] },
      phases: [
        { id: 'p2_sprinkler', name: 'Sprinkler Season', hpPctBelow: 55, stagger: true,
          announce: 'A tap turns somewhere. The whole lawn starts hissing.',
          onEnter: [{ op: 'floorHazard', hazard: 'puddle', floors: [1, 2, 3] }, { op: 'summon', id: 'pest_add_hose_coil', count: 2, floors: [2, 3], at: 'back' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'attack', label: 'Sprinkler', dmg: 3, hits: 1, floors: 'each', pick: 'all', effects: [{ op: 'status', status: 'wet', amount: 1, target: 'allCats' }], intent: 'All cats 3, Wet' },
            atk('Whip Crack', 9),
            { kind: 'debuff', label: 'Power Wash', status: 'wet', amount: 2, floors: 'own', pick: 'front', dmg: 7, shove: true, intent: '7, Wet 2, shoved' }
          ] } },
        { id: 'p3_burst_pipe', name: 'Burst Pipe', hpPctBelow: 25, stagger: false,
          announce: 'Something in the wall goes bang. The hose is angry now.',
          onEnter: [{ op: 'setMeter', meter: 'pressure', value: 3 }, { op: 'status', status: 'rage', amount: 3, target: 'self' }],
          passivesAdd: [{ id: 'burst_pipe', name: 'Burst Pipe', on: 'onDusk', text: 'Pressure rises by 2 instead of 1.', effects: [{ op: 'addMeter', meter: 'pressure', amount: 1 }] }],
          pattern: { type: 'cycle', actions: [
            { kind: 'attack', label: 'Thrash', dmg: 6, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 6' },
            { kind: 'debuff', label: 'Power Wash', status: 'wet', amount: 2, floors: 'own', pick: 'all', dmg: 3, shove: true, intent: 'All 4, Wet, shoved' }
          ] } }
      ],
      hazards: [{ id: 'puddle', name: 'Puddle', text: 'A04 floor status: cats gain 1 Wet each Dusk, pests on it are Slippery.', floors: [1, 2, 3], tick: 'onDusk' }],
      encounter: { id: 'boss_garden_hose', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_garden_hose', floor: 1 }, { id: 'pest_add_hose_coil', floor: 2 }] },
          { round: 5, spawns: [{ id: 'pest_add_hose_coil', floor: 3 }] }
        ], onWinRemainingPests: 'vanish' },
      rewards: rw({ maxWarmthBonus: 5, relicFlavor: 'Brass Nozzle' }),
      intro: 'It has been left out all summer. It has had time to think.',
      defeat: 'Goes flat. Water trickles to the drain. Someone should coil it. Nobody will.',
      flavor: 'Always found twisted. Never touched by anyone.',
      art: 'Green garden hose coiled like a serpent, brass nozzle head with angry eyes, mist and rainbows'
    },

    /* ============ ACT 2 ============ */
    {
      id: 'pest_boss_vacuum_mk9', name: 'The Vacuum Mk IX', tier: 'boss', act: 2, family: 'appliance',
      hp: 165, size: 5, hide: 6, traits: ['Heavy'], threat: 70, spawnFloor: 1,
      meters: { bag: { start: 0, max: 10, label: 'Dustbag' } },
      mechanic: { name: 'Suction', text: 'Inhales the top cards of your draw pile into the Dustbag and swallows cats whole (lives untouched). When the bag hits 10 it jams: Yarn 2, takes +50% damage, and spits everything back.' },
      answers: ['burstAtJam', 'lowDeckDependency', 'exhaustCards', 'keep', 'hidden'],
      onDeath: [{ op: 'spit', what: 'all' }],
      passives: [{ id: 'bag', name: 'Dustbag', on: 'onDusk', text: 'At 10 in the bag: Jam. Yarn 2 and Spooked (x1.5 damage taken) for 2 rounds. Spits back all cards and cats; swallowed cats return at their current HP, in order, to their old slots if room.',
        effects: [{ op: 'jamCheck' }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'inhale', label: 'Inhale', cards: 2, bag: 2, intent: 'Sucks next 2 cards' },
        atk('Beater Bar', 10),
        { kind: 'special', op: 'swallow', label: 'Swallow', pick: 'front', floors: 'own', bag: 3, intent: 'Swallows front cat' },
        { kind: 'special', op: 'inhale', label: 'Inhale', cards: 3, bag: 3, intent: 'Sucks next 3 cards' }
      ] },
      phases: [
        { id: 'p2_turbo', name: 'Turbo Mode', hpPctBelow: 60, stagger: true,
          announce: 'A button clicks. The motor note climbs and does not stop.',
          onEnter: [{ op: 'floorHazard', hazard: 'draft', floors: [1, 2, 3] }, { op: 'summon', id: 'pest_add_dust_bunny', count: 3, floors: [1, 2], at: 'back' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'special', op: 'inhale', label: 'Inhale', cards: 3, bag: 3, intent: 'Sucks next 3 cards' },
            { kind: 'special', op: 'swallow', label: 'Swallow', pick: 'front', floors: 'own', bag: 3, intent: 'Swallows front cat' },
            atk('Beater Bar', 12),
            { kind: 'summon', label: 'Shake Out', id: 'pest_add_dust_bunny', count: 2, floors: [1, 2], at: 'back', intent: 'Summons 2' }
          ] } },
        { id: 'p3_warranty_void', name: 'Warranty Void', hpPctBelow: 25, stagger: false,
          announce: 'Smoke. Sparks. A smell like a toaster that has seen things.',
          onEnter: [{ op: 'spit', what: 'all' }, { op: 'setMeter', meter: 'bag', value: 0 }, { op: 'status', status: 'rage', amount: 3, target: 'self' }],
          passivesAdd: [{ id: 'overheat', name: 'Overheat', on: 'onDusk', text: 'It burns 4 of its own HP each Dusk (ignores Hide). The motor is dying and taking you with it.',
            effects: [{ op: 'damage', amount: 4, target: 'self', ignores: ['hide'] }] }],
          pattern: { type: 'cycle', actions: [
            { kind: 'attack', label: 'Exhaust Port', dmg: 7, hits: 1, floors: 'each', pick: 'all', intent: 'Everyone 6' },
            { kind: 'special', op: 'swallow', label: 'Swallow', pick: 'front', floors: 'each', bag: 4, intent: 'Swallows a cat per floor' },
            atk('Beater Bar', 14)
          ] } }
      ],
      hazards: [{ id: 'draft', name: 'Draft', text: 'The suction pulls: at the start of each Cat Attacks phase the last cat on each floor swaps with the front cat. Piles are scrambled.', floors: [1, 2, 3], tick: 'onCatPhaseStart' }],
      encounter: { id: 'boss_vacuum_mk9', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_vacuum_mk9', floor: 1 }] },
          { round: 4, spawns: [{ id: 'pest_add_dust_bunny', floor: 2 }, { id: 'pest_add_dust_bunny', floor: 3 }] }
        ], onWinRemainingPests: 'vanish', onWinReturnSwallowed: true },
      rewards: rw({ maxWarmthBonus: 5, relicFlavor: 'Spare Filter' }),
      intro: 'WARRANTY VOID IF LICKED. Please do not lick.',
      defeat: 'Whines down to a sigh. The cord goes limp. The bag opens like a treasure chest.',
      flavor: 'Warranty void if licked.',
      art: 'Hulking upright vacuum, chrome IX plate, glowing orange headlamp eye, long black hose arm, bag full of lost socks'
    },
    {
      id: 'pest_boss_spray_duelist', name: 'The Spray Bottle Duelist', tier: 'boss', act: 2, family: 'cleaning',
      hp: 149, size: 3, hide: 0, traits: ['Anchored'], threat: 70, spawnFloor: 2,
      meters: { stance: { start: 0, values: ['Mist', 'Parry'], label: 'Stance' } },
      mechanic: { name: 'En Garde', text: 'Alternates Mist and Parry each round, shown on the intent. In Parry, the first hit on it each round is turned back at the attacker (Wet 2) and does no damage. In Mist it sprays Wet over every floor. Wet 3 on a cat becomes Scared 1.' },
      answers: ['cleanse', 'burstOnMist', 'multiHit', 'aoe', 'noFluff'],
      passives: [
        { id: 'parry', name: 'Parry', on: 'onHitBy', text: 'In Parry stance: the first hit each round deals 0 and the attacker gains Wet 2.', effects: [] },
        { id: 'soaked', name: 'Soaked Through', on: 'onStatusApplied', text: 'A cat at Wet 3 or more becomes Scared 1 (once per round).', effects: [] }
      ],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'setStance', stance: 'Mist', label: 'Mist', intent: 'Mist stance' , then: { kind: 'debuff', status: 'wet', amount: 1, floors: 'each', pick: 'all', dmg: 2 } },
        { kind: 'special', op: 'setStance', stance: 'Parry', label: 'Parry', intent: 'Parry stance', then: atk('Riposte', 10) }
      ] },
      phases: [
        { id: 'p2_seconds', name: 'The Seconds Arrive', hpPctBelow: 60, stagger: true,
          announce: 'He claps twice. Two cucumbers step out of the pantry holding cloths.',
          onEnter: [{ op: 'summon', id: 'pest_add_cucumber_second', count: 2, floors: [1, 3], at: 'back' }, { op: 'floorHazard', hazard: 'puddle', floors: [2] }],
          pattern: { type: 'cycle', actions: [
            { kind: 'special', op: 'setStance', stance: 'Mist', label: 'Mist', intent: 'Mist stance', then: { kind: 'debuff', status: 'wet', amount: 2, floors: 'each', pick: 'all', dmg: 3 } },
            { kind: 'special', op: 'setStance', stance: 'Parry', label: 'Parry', intent: 'Parry stance', then: atk('Riposte', 12, { pick: 'strongest' }) }
          ] } },
        { id: 'p3_stream', name: 'Single Stream', hpPctBelow: 25, stagger: false,
          announce: 'He switches the nozzle to Stream. This is personal.',
          onEnter: [{ op: 'status', status: 'rage', amount: 2, target: 'self' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'debuff', label: 'Stream', status: 'wet', amount: 3, floors: 'each', pick: 'strongest', dmg: 11, intent: 'Strongest cat, Wet 3' },
            { kind: 'special', op: 'setStance', stance: 'Parry', label: 'Parry', intent: 'Parry stance', then: atk('Riposte', 13, { pick: 'strongest' }) }
          ] } }
      ],
      hazards: [{ id: 'puddle', name: 'Puddle', text: 'A04 floor status.', floors: [2], tick: 'onDusk' }],
      encounter: { id: 'boss_spray_duelist', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_spray_duelist', floor: 2 }] },
          { round: 4, spawns: [{ id: 'pest_add_cucumber_second', floor: 1 }] }
        ], onWinRemainingPests: 'vanish' },
      rewards: rw({ maxWarmthBonus: 5, relicFlavor: 'Fencing Mask' }),
      intro: 'Pistols at dawn. Actually, squirts. Pick your cat.',
      defeat: 'Drops the bottle. It is empty. It was always empty. It was the sound.',
      flavor: 'Wins by threat alone. Today that is not enough.',
      art: 'Clear spray bottle with a trigger-hand glove, fencing mask, tiny moustache, white cravat, mist halo'
    },

    /* ============ ACT 3 ============ */
    {
      id: 'pest_boss_vet_carrier', name: 'The Vet Carrier', tier: 'boss', act: 3, family: 'vet',
      hp: 228, size: 5, hide: 8, traits: ['Heavy'], threat: 100, spawnFloor: 3,
      nightNineAppend: 'dawnPhaseTemplate',
      meters: { slots: { start: 0, max: 3, label: 'Passengers' } },
      mechanic: { name: 'Check In', text: 'Traps a cat each turn in a Latch (HP 12, Hide 4 on its own bar). A trapped cat is out of play. Get 3 rounds of waiting and it gets its shots: spends a life and returns to your discard. Hits harder per passenger. Hidden cats cannot be trapped.' },
      answers: ['breakLatches', 'hiddenBoxes', 'cheapBodies', 'lives', 'burst'],
      passives: [
        { id: 'weight', name: 'Passenger Weight', on: 'onPestPhaseStart', text: '+2 Attack per trapped cat.', effects: [] },
        { id: 'appointment', name: 'Appointment', on: 'onDusk', text: 'Each trapped cat has a 3 round timer. At 0 it is vaccinated: spend 1 life, card to discard, Latch gone. Breaking its Latch frees it at once, in its old slot, with 3 Fluff and Rested 1.',
          effects: [{ op: 'tickTrapTimers' }] }
      ],
      pattern: { type: 'cycle', actions: [
        { kind: 'special', op: 'trap', label: 'Check In', pick: 'strongest', floors: 'each', latchHp: 12, latchHide: 4, timer: 3, ignoresHidden: false, intent: 'Traps a cat' },
        atk('Slam Shut', 11),
        { kind: 'special', op: 'trap', label: 'Check In', pick: 'random', floors: 'each', latchHp: 12, latchHide: 4, timer: 3, intent: 'Traps a cat' },
        atk('Rattle', 8, { hits: 2 })
      ] },
      phases: [
        { id: 'p2_waiting_room', name: 'The Waiting Room', hpPctBelow: 60, stagger: true,
          announce: 'Fluorescent lights. A plastic chair. A poster of a cat who is not coping.',
          onEnter: [{ op: 'floorHazard', hazard: 'sterile_lights', floors: [1, 2, 3] }, { op: 'summon', id: 'pest_add_nurse_pest', count: 1, floors: [2], at: 'back' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'special', op: 'trap', label: 'Check In', pick: 'strongest', floors: 'each', latchHp: 12, latchHide: 4, timer: 3, intent: 'Traps a cat' },
            { kind: 'attack', label: 'Cold Stethoscope', dmg: 4, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 4' },
            atk('Slam Shut', 13)
          ] } },
        { id: 'p3_emergency', name: 'Emergency Appointment', hpPctBelow: 30, stagger: false,
          announce: 'The carrier door swings both ways. It is going to be a long afternoon.',
          onEnter: [{ op: 'status', status: 'rage', amount: 2, target: 'self' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'special', op: 'trap', label: 'Check In x2', pick: 'strongest', floors: 'each', count: 2, latchHp: 8, latchHide: 0, timer: 2, intent: 'Traps 2 cats' },
            atk('Slam Shut', 15),
            atk('Rattle', 9, { hits: 2 })
          ] } }
      ],
      hazards: [{ id: 'sterile_lights', name: 'Sterile Lights', text: 'Cats cannot gain Rested or Hidden on lit floors. Naps still heal.', floors: [1, 2, 3], tick: 'onApply' }],
      encounter: { id: 'boss_vet_carrier', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_vet_carrier', floor: 3 }] },
          { round: 4, spawns: [{ id: 'pest_add_nurse_pest', floor: 1 }] }
        ], onWinRemainingPests: 'vanish', onWinFreeTrapped: true },
      rewards: rw({ maxWarmthBonus: 0, relicFlavor: 'Torn Appointment Card' }),
      intro: 'It is just a check up. Nobody has ever said that and meant it.',
      defeat: 'The door falls open. Empty. Everyone it took comes back with an opinion.',
      flavor: 'You cannot be mad at it. It is a box with a handle. You will try.',
      art: 'Hard plastic grey pet carrier with a grille door like clenched teeth, hospital tag, blue towel inside'
    },
    {
      id: 'pest_boss_red_dot', name: 'The Red Dot', tier: 'boss', act: 3, family: 'light',
      hp: 180, size: 1, hide: 0, traits: ['Anchored', 'Sneaky'], threat: 100, spawnFloor: 3,
      nightNineAppend: 'dawnPhaseTemplate',
      untargetable: true, untargetableExceptions: ['floorEffects', 'aoe', 'zoom', 'tangled', 'overheated', 'dot'],
      meters: { heat: { start: 0, max: 4, label: 'Heat' } },
      mechanic: { name: 'Uncatchable', text: 'Cannot be targeted by cat attacks or spells. Floor-wide attacks, Zoom hits, Dizzy, Hairball and other status damage always reach it. Yarn pins it (Tangled 1) so it can be hit. Each teleport adds 1 Heat. At 4 it Overheats for a round: targetable and takes +50%.' },
      answers: ['aoe', 'witchingHourZoom', 'yarnPin', 'dot', 'shadeSunbeam'],
      passives: [
        { id: 'skitter', name: 'Skitter', on: 'onPestPhaseEnd', text: 'Teleports to the floor shown on its intent. Heat +1.', effects: [{ op: 'skitter' }] },
        { id: 'redot_overheat', name: 'Overheat', on: 'onPestPhaseEnd', text: 'At Heat 4: Overheated for 1 round (targetable, takes +50 percent). Heat resets to 0.',
          effects: [{ op: 'ifMeter', meter: 'heat', gte: 4, then: [{ op: 'status', status: 'overheated', amount: 2, target: 'self' }, { op: 'setMeter', meter: 'heat', value: 0 }] }] },
        { id: 'fixate', name: 'Fixate', on: 'onPestPhaseEnd', text: 'Cats on the floor it lands on cannot Nap next round.', effects: [{ op: 'status', status: 'fixated', amount: 2, target: 'allCatsOnFloor' }] }
      ],
      pattern: { type: 'cycle', actions: [
        { kind: 'sunbeam', label: 'Burn', dmg: 4, intent: 'Sunbeam 4, moves to Parlor', moveTo: 2 },
        { kind: 'sunbeam', label: 'Burn', dmg: 5, intent: 'Sunbeam 5, moves to Attic', moveTo: 3 },
        { kind: 'attack', label: 'Dazzle', dmg: 7, hits: 1, floors: 'own', pick: 'all', intent: 'Floor cats 6, moves to Cellar', moveTo: 1 }
      ] },
      phases: [
        { id: 'p2_double_dot', name: 'Which One Is Real', hpPctBelow: 60, stagger: true,
          announce: 'There are three of them now. Eight eyes are following all three.',
          onEnter: [{ op: 'summon', id: 'pest_add_decoy_dot', count: 2, floors: [1, 2], at: 'back' }, { op: 'hideIntent', target: 'self', until: 'decoysDead' }],
          pattern: { type: 'cycle', actions: [
            { kind: 'sunbeam', label: 'Burn', dmg: 5, intent: '?', moveTo: 2 },
            { kind: 'attack', label: 'Dazzle', dmg: 8, hits: 1, floors: 'own', pick: 'all', intent: '?', moveTo: 3 },
            { kind: 'sunbeam', label: 'Burn', dmg: 7, intent: '?', moveTo: 1 }
          ] } },
        { id: 'p3_frenzy', name: 'Laser Pointer Frenzy', hpPctBelow: 30, stagger: false,
          announce: 'Something snaps in the whole room. Every cat is chasing it. Even you.',
          onEnter: [{ op: 'forceWitchingHour', everyRound: true, duration: 3 }, { op: 'status', status: 'rage', amount: 2, target: 'self' }],
          passivesAdd: [{ id: 'frenzy_clock', name: 'Laser Pointer Frenzy', on: 'onDusk', text: 'Forces a Witching Hour every round for 3 rounds.', effects: [{ op: 'witchChain' }] }],
          pattern: { type: 'cycle', actions: [
            { kind: 'sunbeam', label: 'Burn', dmg: 8, intent: 'Sunbeam 7', moveTo: 2 },
            { kind: 'attack', label: 'Dazzle', dmg: 9, hits: 1, floors: 'each', pick: 'all', intent: 'Everyone 8', moveTo: 3 }
          ] } }
      ],
      hazards: [{ id: 'laser_zone', name: 'Laser Zone', text: 'The floor it stands on glows red. Cats on it must attack the floor, not each other: Frazzled cats take 2 extra.', floors: [1, 2, 3], tick: 'onApply' }],
      encounter: { id: 'boss_red_dot', impatienceRound: 16, winIf: { type: 'bossDead' },
        waves: [{ round: 1, spawns: [{ id: 'pest_boss_red_dot', floor: 3 }] }], onWinRemainingPests: 'vanish' },
      rewards: rw({ maxWarmthBonus: 0, relicFlavor: 'Dead Battery' }),
      intro: 'You cannot catch it. You will try anyway.',
      defeat: 'It goes out. A tiny red circle on the wall. Then just a wall.',
      flavor: 'You cannot catch it. You will try anyway.',
      art: 'A glowing red dot with tiny smug eyes projected on a wooden wall, trails of afterimage'
    },

    /* ============ FINAL (7th): chosen at Night 9 ============ */
    {
      id: 'pest_boss_great_bath', name: 'The Great Bath', tier: 'final', act: 3, night: 9, family: 'water',
      hp: 288, size: 5, hide: 0, traits: ['Anchored'], threat: 110, spawnFloor: 3, final: true,
      meters: { waterLevel: { start: 0, max: 4, label: 'Water' } },
      mechanic: { name: 'Bath Night', text: 'The tub fills each round and floods the house from the Attic down. At level 4 it Overflows. The Plug is a pest: kill it to drain. At 25% HP the 6 AM alarm rings, the Sunbeam rises, and the bath starts to dry. Survive Dawn or finish it.' },
      answers: ['killPlug', 'cleanse', 'fluff', 'noBoxes', 'sunbeamHold', 'burstDawn'],
      passives: [{ id: 'tap', name: 'Running the Tap', on: 'onDusk', text: 'Water +1. L1 Attic Puddle, L2 Parlor, L3 Cellar. L4 Overflow: 6 damage and Wet 2 to every cat, Boxes washed away, then Water 1.',
        effects: [{ op: 'addMeter', meter: 'waterLevel', amount: 1 }, { op: 'floodByLevel' }, { op: 'ifMeter', meter: 'waterLevel', gte: 4, then: [
          { op: 'damage', amount: 6, target: 'allCats' }, { op: 'status', status: 'wet', amount: 2, target: 'allCats' }, { op: 'flatten', what: 'box', floors: 'all' }, { op: 'setMeter', meter: 'waterLevel', value: 1 }, { op: 'floodByLevel' }] }, { op: 'respawnTick' }] }],
      pattern: { type: 'cycle', actions: [
        { kind: 'summon', label: 'Pull the Plug Chain', id: 'pest_add_plug_chain', count: 1, floors: [2], at: 'back', onlyIfAbsent: true, intent: 'Plug appears' },
        atk('Steam Burst', 11),
        { kind: 'debuff', label: 'Splash', status: 'wet', amount: 2, floors: 'each', pick: 'front', dmg: 6, intent: 'All floors 6, Wet 2' },
        atk('Steam Burst', 12, { floors: 'reach' })
      ] },
      phases: [
        { id: 'p2_bubble_bath', name: 'Bubble Bath', hpPctBelow: 66, stagger: true,
          announce: 'Suds rise on every floor. Familiar shapes move in them. You have fought these before.',
          onEnter: [
            { op: 'floorHazard', hazard: 'suds', floors: [1, 2, 3] },
            { op: 'summonReruns', fromRun: 'defeatedBosses', perRound: 1, rounds: 4, floors: [1, 2, 3], fallback: 'pest_add_rubber_duck' }
          ],
          pattern: { type: 'cycle', actions: [
            { kind: 'special', op: 'summonReruns', label: 'Reruns', intent: 'An old friend arrives' },
            atk('Steam Burst', 13),
            { kind: 'debuff', label: 'Splash', status: 'wet', amount: 2, floors: 'each', pick: 'all', dmg: 4, intent: 'Everyone 4, Wet 2' },
            { kind: 'summon', label: 'Rubber Armada', id: 'pest_add_rubber_duck', count: 2, floors: [1, 2], at: 'back', intent: 'Summons 2' }
          ] } },
        { id: 'p3_dawn', name: 'Dawn', hpPctBelow: 25, stagger: true, dawn: true,
          announce: '6:00 AM. The alarm goes. The window turns gold. The water starts to steam off the tub.',
          onEnter: [
            { op: 'clearHazard', hazard: 'suds' }, { op: 'clearHazard', hazard: 'puddle' },
            { op: 'setMeter', meter: 'waterLevel', value: 0 },
            { op: 'removePassive', id: 'tap' },
            { op: 'extraMove', target: 'allPests', rule: 'each pest repeats its current intent once more per Pest Attacks phase' },
            { op: 'status', status: 'claws', amount: 1, target: 'allCats' },
            { op: 'heal', amount: 8, target: 'sunbeam' }, { op: 'addShade', amount: 8 },
            { op: 'setMeter', meter: 'dawnRounds', value: 0 }
          ],
          passivesAdd: [
            { id: 'evaporate', name: 'Evaporate', on: 'onDusk', text: 'The sun dries the bath: it loses 4 percent of max HP each Dusk (ignores Hide).',
              effects: [{ op: 'damagePctMax', pct: 4, target: 'self', ignores: ['hide'] }] },
            { id: 'sunrise', name: 'Sunrise', on: 'onDusk', text: 'Sunbeam +2 Warmth and +3 Shade each Dusk. Cats Rested 1.',
              effects: [{ op: 'dawnTick' }, { op: 'heal', amount: 2, target: 'sunbeam' }, { op: 'addShade', amount: 3 }, { op: 'status', status: 'rested', amount: 1, target: 'allCats' }] },
            { id: 'final_flush', name: 'The Final Flush', on: 'onDusk', text: 'On Dawn round 3: 8 to every cat and 15 to the Sunbeam. Yarn or Dizzy cancels it. After that the tub is spent.',
              effects: [{ op: 'ifMeter', meter: 'dawnRounds', eq: 3, then: [{ op: 'unlessStatus', status: ['yarn', 'dizzy'], then: [{ op: 'damage', amount: 8, target: 'allCats' }, { op: 'damage', amount: 15, target: 'sunbeam' }] }] }] }
          ],
          clears: ['yarn', 'dull', 'hiss'],
          pattern: { type: 'cycle', actions: [
            atk('Steam Burst', 13),
            { kind: 'attack', label: 'Drain Swirl', dmg: 6, hits: 1, floors: 'each', pick: 'front', intent: 'All floors 6' },
            { kind: 'sunbeam', label: 'Slosh', dmg: 6, intent: 'Sunbeam 6' }
          ] } }
      ],
      hazards: [
        { id: 'puddle', name: 'Puddle', text: 'A04 floor status, spread by water level.', floors: [1, 2, 3], tick: 'onDusk' },
        { id: 'suds', name: 'Suds', text: 'Slippery floor: at the start of Cat Attacks cats on it shuffle (A02 Draft rule). Pests standing in suds are Hidden until they act. AoE reveals them.', floors: [1, 2, 3], tick: 'onCatPhaseStart' }
      ],
      encounter: { id: 'boss_great_bath', impatienceRound: 18,
        winIf: { type: 'any', conds: [{ type: 'bossDead' }, { type: 'dawnRounds', atLeast: 5 }] },
        waves: [
          { round: 1, spawns: [{ id: 'pest_boss_great_bath', floor: 3 }, { id: 'pest_add_plug_chain', floor: 2 }] },
          { round: 4, spawns: [{ id: 'pest_add_rubber_duck', floor: 1 }, { id: 'pest_add_rubber_duck', floor: 2 }] }
        ], onWinRemainingPests: 'vanish' },
      selection: { pool: ['pest_boss_vet_carrier', 'pest_boss_red_dot', 'pest_boss_great_bath'], rule: 'replace Act 3 pick at map generation if mischiefRank >= 5 or rng < 1/3', night: 9 },
      rewards: rw({ maxWarmthBonus: 0, fish: 'final', relicFlavor: 'Dry Towel', endingCutscene: 'dawn_towel', victory: true, bonusScore: true, championUpgrade: false }),
      intro: 'Saturday. The tap runs. Everything you ever hid from is in the water.',
      defeat: 'The last drain gurgles. Sunlight reaches the cushion. A towel, warm from the dryer, lands on it. Nobody planned that. Everybody takes it.',
      payoff: 'The Sunbeam Holds. The cats sleep in a pile on the warm towel. Biscuit is dry. For nine nights, the house belonged to them.',
      flavor: 'Not a pest. A weekly appointment with consequences.',
      art: 'Huge cast-iron clawfoot tub, rising steam face, rubber duck crown, taps for eyes, plug chain tail'
    }
  ];

  /* ------------------------------------------------------------------ ADDS AND RERUNS */
  var add = function (o) { return Object.assign({ tier: 'add', size: 1, hide: 0, traits: [], threat: 2 }, o); };

  SB.data.enemiesBossAdds = [
    add({ id: 'pest_add_court_rat', name: 'Court Rat', hp: 24, family: 'rats', threat: 2,
      pattern: { type: 'cycle', actions: [atk('Bite', 3), atk('Gnaw', 4)] },
      flavor: 'Speaks only when spoken to by a larger rat.', art: 'Small grey rat in a tiny paper crown' }),
    add({ id: 'pest_add_hose_coil', name: 'Hose Coil', hp: 16, size: 2, hide: 4, traits: ['Anchored'], family: 'garden', threat: 4,
      pattern: { type: 'cycle', actions: [{ kind: 'debuff', label: 'Soak', status: 'wet', amount: 1, floors: 'own', pick: 'front', dmg: 4, shove: true, intent: '4, Wet, shoved' }, { kind: 'wait', label: 'Kink' }] },
      onDeath: [{ op: 'ownerMeter', owner: 'pest_boss_garden_hose', meter: 'pressure', amount: -2 }, { op: 'ownerDamage', owner: 'pest_boss_garden_hose', amount: 6 }],
      flavor: 'Gets a kink. Takes it personally.', art: 'Loop of green hose, kinked, spitting water' }),
    add({ id: 'pest_add_dust_bunny', name: 'Dust Bunny', hp: 27, family: 'appliance', threat: 2, traits: ['Climber'],
      pattern: { type: 'cycle', actions: [atk('Nibble', 3)] },
      flavor: 'Appears out of nowhere. Mostly sock.', art: 'Grey fluff ball with two black eyes' }),
    add({ id: 'pest_add_cucumber_second', name: 'Cucumber Second', hp: 41, family: 'produce', threat: 3,
      pattern: { type: 'cycle', actions: [{ kind: 'debuff', label: 'Startle', status: 'scared', amount: 1, floors: 'own', pick: 'front', dmg: 1, intent: 'Scares front' }, atk('Cold Slice', 4)] },
      flavor: 'Assists. With menace.', art: 'Smaller cucumber holding a cloth, wearing a bow tie' }),
    add({ id: 'pest_add_nurse_pest', name: 'Waiting Room Nurse', hp: 61, family: 'vet', threat: 4, hide: 3,
      pattern: { type: 'cycle', actions: [{ kind: 'special', op: 'healBoss', amount: 6, label: 'Chart', intent: 'Heals boss 6' }, atk('Thermometer', 6)] },
      flavor: 'You will feel a small pinch. This is a lie.', art: 'Rodent in scrubs holding a clipboard and a very large thermometer' }),
    add({ id: 'pest_add_decoy_dot', name: 'Fake Dot', hp: 3, family: 'light', threat: 1,
      passives: [{ id: 'fake_dot', name: 'Fake Dot', text: 'Its presence hides the real dot\'s intent.', on: 'onSpawn', effects: [] }],
      pattern: { type: 'cycle', actions: [{ kind: 'sunbeam', label: 'Flicker', dmg: 1, intent: '?' }] },
      flavor: 'Not it. Very good at being not it.', art: 'Pale red dot, slightly off center' }),
    add({ id: 'pest_add_plug_chain', name: 'The Plug', hp: 68, size: 1, hide: 4, traits: ['Anchored'], family: 'water', threat: 5,
      pattern: { type: 'cycle', actions: [{ kind: 'wait', label: 'Hold' }] },
      onDeath: [{ op: 'ownerMeter', owner: 'pest_boss_great_bath', meter: 'waterLevel', amount: -3 }, { op: 'ownerDamage', owner: 'pest_boss_great_bath', amount: 12 }, { op: 'respawnIn', rounds: 3, floor: 2 }],
      flavor: 'Holds it all in. For now.', art: 'Rubber plug on a short ball chain, tiny angry face' }),
    add({ id: 'pest_add_latch', name: 'Carrier Latch', hp: 41, hide: 4, traits: ['Anchored'], family: 'vet', threat: 1,
      pattern: { type: 'cycle', actions: [{ kind: 'wait', label: 'Hold', intent: 'Holds a cat' }] },
      onDeath: [{ op: 'freeTrapped' }],
      flavor: 'Click. That is the whole personality.', art: 'Small grey plastic carrier latch with a tiny padlock grin' }),
    add({ id: 'pest_add_rubber_duck', name: 'Rubber Duck', hp: 34, traits: ['Slippery'], family: 'water', threat: 2,
      pattern: { type: 'cycle', actions: [{ kind: 'debuff', label: 'Squeak', status: 'dull', amount: 1, floors: 'own', pick: 'front', dmg: 3, intent: 'Dull 1' }] },
      flavor: 'Smiles at everyone. Smiles at all of it.', art: 'Yellow rubber duck, painted eyebrows' }),
    add({ id: 'pest_add_rocket', name: 'Bottle Rocket', hp: 17, traits: ['Sneaky', 'Climber'], family: 'fireworks', threat: 2,
      pattern: { type: 'cycle', actions: [{ kind: 'sunbeam', label: 'Whoosh', dmg: 3, intent: 'Sunbeam 3' }] },
      flavor: 'Single use. Full commitment.', art: 'Glass bottle with a rocket stick, fizzing' }),

    /* Reruns: miniature echoes of bosses defeated this run (Great Bath Phase 2) */
    add({ id: 'pest_rerun_rat_king', name: 'Rerun: Little Rat King', hp: 48, family: 'rerun', threat: 3,
      pattern: { type: 'cycle', actions: [{ kind: 'summon', label: 'Decree', id: 'pest_add_court_rat', count: 1, floors: [1], at: 'back', intent: 'Summons 1' }, atk('Scratch', 6)] },
      flavor: 'Sudden, soggy, and sure of its rights.', art: 'Rat with a wet paper crown, fur slicked down' }),
    add({ id: 'pest_rerun_hoselet', name: 'Rerun: Hoselet', hp: 41, hide: 2, family: 'rerun', threat: 3,
      pattern: { type: 'cycle', actions: [{ kind: 'debuff', label: 'Dribble', status: 'wet', amount: 1, floors: 'own', pick: 'front', dmg: 4, shove: true, intent: '4, Wet, shoved' }] },
      flavor: 'Shorter. Just as spiteful.', art: 'Stubby green hose with a pout' }),
    add({ id: 'pest_rerun_micro_vac', name: 'Rerun: Micro Vac', hp: 54, family: 'rerun', threat: 4,
      pattern: { type: 'cycle', actions: [{ kind: 'special', op: 'inhale', label: 'Sip', cards: 1, bag: 0, intent: 'Sucks next card' }, atk('Beater', 7)] },
      flavor: 'Handheld. Holds a grudge.', art: 'Small cordless vacuum with angry headlamp' }),
    add({ id: 'pest_rerun_spritz', name: 'Rerun: Spritz', hp: 41, family: 'rerun', threat: 3,
      pattern: { type: 'cycle', actions: [{ kind: 'debuff', label: 'Spritz', status: 'wet', amount: 2, floors: 'own', pick: 'front', dmg: 3, intent: 'Wet 2' }] },
      flavor: 'Travel size. Same attitude.', art: 'Tiny spray bottle with fencing mask' }),
    add({ id: 'pest_rerun_carrier_cub', name: 'Rerun: Carrier Cub', hp: 68, hide: 3, family: 'rerun', threat: 4,
      pattern: { type: 'cycle', actions: [{ kind: 'special', op: 'trap', label: 'Pop In', pick: 'random', floors: 'own', latchHp: 6, latchHide: 0, timer: 3, intent: 'Traps a cat' }, atk('Rattle', 7)] },
      flavor: 'A foldable one. It folds. It folds you.', art: 'Collapsible fabric carrier, zip-teeth' }),
    add({ id: 'pest_rerun_pocket_dot', name: 'Rerun: Pocket Dot', hp: 27, family: 'rerun', threat: 3, traits: ['Sneaky'],
      pattern: { type: 'cycle', actions: [{ kind: 'sunbeam', label: 'Flick', dmg: 3, intent: 'Sunbeam 3' }] },
      flavor: 'Fits in a hand. Slips out of every one.', art: 'Small red dot with a tiny halo' })
  ];

  /* Map from boss id to its rerun (Great Bath Phase 2). Fallback is the Rubber Duck. */
  SB.data.bossRules = {
    rewardDefaults: rewardDefaults,
    rerunFor: {
      pest_boss_rat_king: 'pest_rerun_rat_king',
      pest_boss_garden_hose: 'pest_rerun_hoselet',
      pest_boss_vacuum_mk9: 'pest_rerun_micro_vac',
      pest_boss_spray_duelist: 'pest_rerun_spritz',
      pest_boss_vet_carrier: 'pest_rerun_carrier_cub',
      pest_boss_red_dot: 'pest_rerun_pocket_dot'
    },
    pools: { 1: ['pest_boss_rat_king', 'pest_boss_garden_hose'], 2: ['pest_boss_vacuum_mk9', 'pest_boss_spray_duelist'], 3: ['pest_boss_vet_carrier', 'pest_boss_red_dot', 'pest_boss_great_bath'] },
    night9: { appendDawnTo: ['pest_boss_vet_carrier', 'pest_boss_red_dot'], finalId: 'pest_boss_great_bath' },
    bossYarnHalf: true, bossScaredImmune: true
  };
})();
