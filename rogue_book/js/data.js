// Echowake data core: registries, closed vocabularies, statuses, keywords,
// economy, heroes, brushes, tiles, the fixed roster, quotas, and the validator.
//
// This file is the machine-readable half of the contract (DESIGN.md is the human
// half, CONTENT_SPEC.md says how much and how strong). Content files
// (data_cards_*.js, data_enemies_*.js, ...) are IIFEs that register into the
// registries below with DATA.add(kind, defs). Nothing here touches the DOM, the
// clock or Math.random. No em or en dashes.
//
// PUBLIC API
//   Registries   DATA.cards gems relics enemies events achievements trials tips lore
//                DATA.encounters {1|2|3: {normal:[group], elite:[group], boss:'id'}}
//                DATA.heroes brushes tiles statuses keywords ECONOMY SETTINGS LISTS
//                DATA.ROSTER {1|2|3: [{id,name,title?,tier,size,role,chapter}]}, DATA.rosterById
//                DATA.FIXED (ids other modules depend on), DATA.QUOTA, DATA.GUIDE
//   Writing      DATA.add(kind, defs)              defs is an OBJECT KEYED BY ID (an array throws), except
//                                                  kind 'tips' which takes a string or an array of strings
//                DATA.addEncounters(ch, {normal, elite, boss})
//   Lookups      hero(id) card(id) cardsBy({hero,rarity,type}) enemyIds(ch, tier) groupById(id)
//                isStatus(id) isDebuff(id) isBuff(id) isUnlocked(kind, id, unlocked)
//                rewardPool(heroId, rarity, unlocked) relicPool(rarity, unlocked, heroIds)
//                gemPool({tier,color}, unlocked) eligibleGroups(ch, 'normal'|'elite', diff)
//                walkOps(ops, fn)                  visits every op, through cond/repeat/hook nesting
//   Mods         foldMods([deltaObj...]) -> final flat mods     trialDeltas(level) -> summed deltas
//                modsFor(relicIds, trialLevelOrDeltas) -> final flat mods (what RUN.mods(R) returns: modsFor(R.relics, R.mods))
//                rowFor(heroId, row, relicIds) -> merged row bonuses (hero row plus relic `rows`)
//   Misc         tileCount(type, nonBlock)   cleanSetting(key, value)   ratio helpers for tests
//   Checking     validate(only?, opt?) -> {errors, warnings, counts}
//                  opt.strict  also check every cross-file reference and that fixed content exists
//                  opt.hero    limit the card check to one hero id (or 'shared' for curse/status cards)
//                  opt.chapter limit the enemy check to one chapter
//                audit(kind?, opt?) -> [string]   quota and guideline breaks ('audit ...' hard, 'guide ...' soft)
//
// RUN OPS (events and run hooks). Unknown fields are validator errors. `who` (heal hurt maxHp) is
// 'both' (default) | 'front' | 'lowest' | 'random' | a hero id of the party.
//   gold {n | pct}            n may be negative (a cost, floors at 0); pct is a fraction of current gold, floored
//   ink {n | pct}             result clamped to 0..inkMax; pct is a fraction of inkMax
//   heal {n | pct, who?}      pct is a fraction of that hero's maxHp; scaled by mods.healMul
//   hurt {n | pct, who?}      never kills: leaves at least 1 HP
//   maxHp {n, who?}           raises max and current HP by n; negative n lowers max, never below 1
//   addCard {card | pool, rarity?, n?=1, up?}   pool 'party' or a hero id: random unlocked non-token card
//   removeCard upgradeCard transformCard duplicateCard {n?=1, random?, filter?:{type,hero}}
//                             default: the player picks in the deck overlay (a `pending` entry); random:true uses the RNG.
//                             transformCard yields a random card of the same hero and rarity
//   addRelic {id | rarity}    rarity draws an unowned, unlocked relic     addGem {id | color?, tier?}
//   addBrush {id}             a brush id or 'random'                      addCurse {id?, n?=1} a curse_* id, omitted = random
//   fight {enc | enemies:[ids], tier?='normal'|'elite', rewards?=true, win?:[run ops]}   LAST op of its outcome
//   flag {k, v?=1}            R.flags[k] = v            paint {n}   paints n hexes free along the cheapest chain to the boss
//   cardReward {rarity?, hero?, n?=3}   a skippable card pick like a combat reward
// Event choice `req` keys: gold hpPct hpBelow relic flag hero chapter. Event `when` keys: flag relic hero.
const DATA = (() => {
  // ------------------------------------------------------------------
  // Closed vocabularies. Content may only use ids from these lists.
  // ------------------------------------------------------------------
  const LISTS = {
    heroIds: ['hanae', 'kuro', 'suzu', 'raiga'],
    cardTypes: ['attack', 'skill', 'power', 'curse', 'status'],
    rarities: ['starter', 'common', 'uncommon', 'rare', 'token'],   // token: generated in combat, never a reward
    cardKw: ['exhaust', 'retain', 'innate', 'ethereal', 'unplayable'],
    slotColors: ['red', 'blue', 'green', 'gold', 'any'],
    gemColors: ['red', 'blue', 'green', 'gold'],
    gemCuts: ['round', 'oval', 'square', 'drop', 'star'],
    relicRarities: ['common', 'uncommon', 'rare', 'boss', 'shop'],
    chapters: [1, 2, 3],
    tiers: ['minion', 'normal', 'elite', 'boss'],
    sizes: ['s', 'm', 'l', 'xl'],
    enemyTags: ['spirit', 'beast', 'folk', 'undead', 'construct', 'insect', 'avian', 'aquatic', 'void'],
    elements: ['slash', 'fire', 'ice', 'lightning', 'ink', 'poison', 'holy'],

    // ops usable in each context (DESIGN 4.4)
    cardOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'pick', 'add', 'swap', 'hurt', 'cond', 'repeat', 'gold', 'ink', 'maxHp', 'revive', 'hook'],
    hookOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'add', 'hurt', 'cond', 'gold', 'ink', 'maxHp', 'revive'],
    enemyOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'add', 'summon', 'swap', 'cond', 'stealGold', 'flee'],
    runOps: ['gold', 'ink', 'heal', 'hurt', 'maxHp', 'addCard', 'removeCard', 'upgradeCard', 'transformCard', 'duplicateCard', 'addRelic', 'addGem', 'addBrush', 'addCurse', 'fight', 'flag', 'paint', 'cardReward'],

    // target vocabularies
    cardTgt: ['enemy', 'all', 'random', 'lowest', 'others', 'self', 'ally', 'both', 'front', 'back'],
    enemyCardTgt: ['enemy', 'all', 'random', 'lowest', 'others'],         // card and hook ops aimed at enemies
    heroTgt: ['self', 'ally', 'both', 'front', 'back'],                   // card and hook ops aimed at heroes
    enemyHeroTgt: ['front', 'back', 'both', 'random', 'lowest'],          // enemy ops aimed at heroes
    enemySelfTgt: ['self', 'allEnemies', 'otherEnemy', 'lowestEnemy'],    // enemy ops aimed at enemies

    // value expression: number, or {base, per, mul, s, who, cap, min, upTo}
    per: ['X', 'handSize', 'drawPile', 'discardPile', 'exhaustPile', 'cardsPlayed', 'attacksPlayed', 'skillsPlayed',
      'energy', 'block', 'missingHp', 'hp', 'status', 'debuffs', 'enemies', 'kills', 'turn', 'gems', 'front',
      'damageTaken', 'hitsTaken', 'targetBlock', 'picked'],
    perEnemy: ['turn', 'enemies', 'status', 'hp', 'missingHp', 'block', 'debuffs', 'handSize', 'drawPile', 'discardPile'],
    perWho: ['self', 'ally', 'target', 'enemy'],
    perWhoEnemy: ['self', 'target'],
    perWhoPer: ['status', 'block', 'hp', 'missingHp', 'debuffs'],         // the only counters that take `who`
    // conditions for the `cond` op and enemy AI rules
    cond: ['row', 'status', 'hpPct', 'handEmpty', 'cardsPlayed', 'attacksPlayed', 'turn', 'lastKill', 'targetStatus',
      'allyDown', 'block', 'energy', 'handSize', 'enemies'],
    condEnemy: ['status', 'hpPct', 'block', 'turn', 'enemies'],
    aiCond: ['hpLt', 'hpGt', 'turnGte', 'turnEvery', 'alone', 'minions', 'heroStatus', 'heroDown', 'allyHpLt', 'heroHpLt'],
    intents: ['attack', 'multi', 'heavy', 'defend', 'buff', 'debuff', 'summon', 'heal', 'special', 'flee', 'none'],

    // hooks
    combatHooks: ['combatStart', 'combatEnd', 'turnStart', 'turnEnd', 'onPlay', 'onDamaged', 'onKill', 'onSwap', 'onHeroDown', 'onShuffle', 'onExhaust'],
    runHooks: ['onPickup', 'onChapterStart', 'onRest', 'onPaint', 'onFightWon', 'onShopEnter'],
    enemyHooks: ['onDeath', 'onHurt', 'onAllyDeath', 'onHeroPlay'],
    hookFilter: ['type', 'hero', 'cost', 'kw', 'tier', 'gems'],
    cardPickFrom: ['hand', 'draw', 'discard', 'exhaust'],
    cardPickThen: ['discard', 'exhaust', 'retain', 'upgrade', 'toHand', 'toDrawTop', 'copy'],
    pickPairs: { hand: ['discard', 'exhaust', 'retain', 'upgrade', 'copy'], draw: ['toHand', 'discard', 'exhaust', 'toDrawTop'], discard: ['toHand', 'toDrawTop', 'exhaust', 'upgrade'], exhaust: ['toHand', 'toDrawTop'] },
    addTo: ['hand', 'draw', 'discard', 'exhaust'],                        // card and hook `add`
    addToEnemy: ['draw', 'discard'],                                      // enemy `add`

    // Mods (DESIGN 4.7). Every key is an ADDITIVE DELTA. 'int' keys add whole numbers to a base,
    // 'frac' keys are fractions (0.25 = x1.25, -0.25 = x0.75) folded as max(0.1, 1 + sum).
    mods: ['energy', 'hand', 'startBlock', 'inkMax', 'startInk', 'wellInk', 'cardChoices', 'freeSwaps', 'campActions', 'rareBoost', 'goldMul', 'priceMul', 'healMul'],
    modKind: { energy: 'int', hand: 'int', startBlock: 'int', inkMax: 'int', startInk: 'int', wellInk: 'int', cardChoices: 'int', freeSwaps: 'int', campActions: 'int', rareBoost: 'int', goldMul: 'frac', priceMul: 'frac', healMul: 'frac' },
    trialMods: ['enemyHp', 'eliteHp', 'bossHp', 'enemyDmg', 'goldMul', 'priceMul', 'healMul', 'reviveFrac', 'startInk', 'startGold', 'wellInk', 'cardChoices', 'curses'],
    trialModKind: { enemyHp: 'frac', eliteHp: 'frac', bossHp: 'frac', enemyDmg: 'frac', goldMul: 'frac', priceMul: 'frac', healMul: 'frac', reviveFrac: 'frac', startInk: 'int', startGold: 'int', wellInk: 'int', cardChoices: 'int', curses: 'int' },
    rowFields: ['dmgAdd', 'blockAdd', 'startBlock', 'regen', 'thorns', 'drawAdd'],
    gemModKeys: ['dmg', 'block', 'heal', 'hits', 'cost', 'draw', 'energy', 'poison', 'status', 'fx', 'kw', 'kwRemove', 'cond'],

    // Stat counters tracked per run in R.stats and per profile in META (definitions: DESIGN 4.10).
    // statMax keys merge with max(), every other key adds. Achievements read these.
    statKeys: ['runs', 'wins', 'deaths', 'kills', 'elites', 'bossKills', 'boss1Kills', 'boss2Kills', 'boss3Kills',
      'cardsPlayed', 'attacksPlayed', 'damageDealt', 'damageTaken', 'blockGained', 'maxHit', 'maxTurnDamage', 'turns',
      'hexesPainted', 'brushesUsed', 'wellsDrunk', 'chestsOpened', 'shopsVisited', 'goldEarned', 'goldSpent', 'purchases',
      'campRests', 'upgrades', 'gemsSocketed', 'relicsFound', 'eventsSeen', 'curseCards', 'swaps', 'heroDowns', 'revives',
      'flawlessBosses', 'maxDeck', 'smallDeckWins', 'trialBest', 'dailyRuns', 'winsHanae', 'winsKuro', 'winsSuzu', 'winsRaiga',
      'poisonKills', 'burnKills', 'thornKills', 'multiHitTurns', 'zeroCostTurns', 'mercy'],
    statMax: ['maxHit', 'maxTurnDamage', 'maxDeck', 'trialBest'],

    // events
    reqKeys: ['gold', 'hpPct', 'hpBelow', 'relic', 'flag', 'hero', 'chapter'],
    whenKeys: ['flag', 'relic', 'hero'],
    runWho: ['both', 'front', 'lowest', 'random', 'hanae', 'kuro', 'suzu', 'raiga'],

    // map
    tiles: ['start', 'empty', 'block', 'enemy', 'elite', 'boss', 'chest', 'shop', 'camp', 'event', 'well', 'brush', 'gemcache', 'forge'],
    landmarks: ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'],       // visible as dim silhouettes in the fog
    brushKinds: ['line', 'fan', 'blob', 'ring', 'dot'],

    // combat events COMBAT emits (payloads: DESIGN 5.2) and the UI bus (DESIGN 5.8)
    combatEvents: ['combat_start', 'turn_start', 'turn_end', 'draw', 'shuffle', 'discard', 'exhaust', 'add_card', 'card_move',
      'card_upgrade', 'retain', 'energy', 'play', 'hit', 'dodge', 'thorns', 'block', 'block_lost', 'heal', 'hurt', 'status',
      'immune', 'swap', 'intent', 'enemy_act', 'skip', 'summon', 'enemy_phase', 'death', 'flee', 'hero_down', 'hero_revive',
      'pick_needed', 'relic', 'gold', 'ink', 'max_hp', 'end'],
    busEvents: ['screen', 'overlay', 'combat:turn', 'combat:select', 'combat:play', 'combat:endturn', 'combat:swap', 'combat:pick',
      'combat:end', 'map:paint', 'map:brush', 'map:walk'],
    tutAnchors: ['hand', 'energy', 'endturn', 'swap', 'intent', 'enemy', 'ink', 'hex', 'brushes', 'deck', 'relics'],

    // screens and overlays (closed; DESIGN 5.11)
    screens: ['title', 'heroSelect', 'library', 'settings', 'howto', 'story', 'map', 'combat', 'reward', 'shop', 'event', 'camp', 'forge', 'chest',
      'gemcache', 'chapterClear', 'gameOver', 'victory'],
    overlays: ['deck', 'pause', 'settings', 'relics', 'legend', 'cardPick', 'confirm', 'modal'],
    libraryTabs: ['unlocks', 'achievements', 'story', 'bestiary', 'history'],

    // presentation vocab (art and audio agents implement exactly these)
    scenes: ['title', 'ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3', 'camp', 'shop', 'event', 'treasure', 'victory', 'defeat', 'paper'],
    palettes: ['rose', 'crimson', 'amber', 'gold', 'jade', 'teal', 'azure', 'indigo', 'violet', 'ink', 'moon', 'ash'],
    poses: ['idle', 'attack', 'cast', 'hurt', 'block', 'down', 'cheer', 'walk'],
    enemyPoses: ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'],
    expressions: ['neutral', 'smile', 'angry', 'hurt', 'determined'],
    motifs: ['slash', 'cross_slash', 'thrust', 'crescent', 'iai', 'petals', 'bloom', 'petal_storm', 'wind', 'shield', 'barrier',
      'talisman', 'lotus', 'moon', 'sun', 'star', 'lightning', 'thunder_fist', 'chain_lightning', 'fire', 'flame_orb', 'ice',
      'ink_splash', 'ink_wave', 'brush_stroke', 'calligraphy', 'scroll', 'eye', 'mask', 'fan', 'bell', 'lantern', 'koi',
      'dragon', 'tiger', 'crane', 'fox', 'web', 'thorns', 'poison_bloom', 'skull', 'heal_light', 'spirit_orb', 'torii',
      'mirror', 'sword_rain', 'meteor', 'wave', 'tornado', 'quake', 'fist', 'kick', 'arrow', 'coin', 'key', 'book', 'quill',
      'void', 'sigil'],
    relicIcons: ['lantern', 'mask', 'fan', 'bell', 'key', 'scroll', 'coin', 'jar', 'geta', 'kasa', 'incense', 'mirror', 'comb',
      'dice', 'drum', 'flute', 'brush', 'inkstone', 'seal', 'umbrella', 'charm', 'riceball', 'teacup', 'koi', 'feather', 'crown',
      'hourglass', 'compass', 'candle', 'ribbon', 'sword', 'katana_guard', 'bow', 'beads', 'gourd', 'lotus', 'moon', 'sun', 'star',
      'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye', 'heart', 'tooth', 'shell', 'bamboo', 'plum', 'maple', 'shrine', 'bridge',
      'petal', 'flame', 'snowflake', 'bolt', 'ink_drop'],
    // ART.fx.NAME(ctx, o, t): exactly these 24 (DESIGN 5.6)
    fx: ['slash', 'cross', 'thrust', 'burst', 'ring', 'inkSplash', 'petals', 'lightning', 'chain', 'flame', 'frost', 'poison', 'shield',
      'heal', 'buff', 'debuff', 'sparkle', 'speedLines', 'impactFrame', 'sfxText', 'vignette', 'chromatic', 'brushDrag', 'numberPop'],
    iconKinds: ['status', 'relic', 'gem', 'tile', 'intent', 'stat', 'brush', 'type', 'row', 'motif'],
    statIcons: ['gold', 'ink', 'hp', 'energy', 'brush', 'inkstone', 'block'],
    mapKinds: ['fog', 'known', 'ground', 'block', 'painted', 'edge', 'path', 'hover', 'target'],
    sizeHeight: { s: 110, m: 170, l: 250, xl: 340 },                      // nominal enemy height at s=1 (px)
    cardSizes: { mini: [72, 100], deck: [168, 235], hand: [190, 266], reward: [240, 336], big: [300, 420] },   // UI.card sizes, stage px, all 5:7
    sfx: ['ui_click', 'ui_hover', 'ui_back', 'ui_error', 'ui_open', 'ui_close', 'ui_toggle',
      'card_draw', 'card_hover', 'card_pick', 'card_play_attack', 'card_play_skill', 'card_play_power', 'card_discard', 'card_exhaust', 'shuffle',
      'swap', 'energy_gain', 'turn_start', 'turn_end', 'enemy_turn',
      'hit_light', 'hit_heavy', 'hit_crit', 'hit_multi', 'slash', 'thud', 'zap', 'flame', 'ice', 'poison_tick', 'thorn', 'dodge',
      'block_gain', 'block_hit', 'block_break', 'heal', 'buff', 'debuff', 'stun',
      'enemy_die', 'hero_down', 'hero_revive', 'boss_die', 'boss_intro', 'phase_change',
      'paint', 'ink_splash', 'brush_pick', 'brush_use', 'step', 'reveal_landmark', 'ink_gain', 'well',
      'gold', 'buy', 'chest_open', 'relic_get', 'gem_socket', 'gem_get', 'forge_hit', 'upgrade', 'camp_fire', 'rest', 'event_open', 'choice',
      'page_turn', 'level_up', 'victory', 'defeat', 'achievement', 'unlock', 'save'],
    music: ['title', 'hero_select', 'map1', 'map2', 'map3', 'combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final',
      'shop', 'camp', 'event', 'reward', 'victory', 'defeat'],
  };

  // ------------------------------------------------------------------
  // Statuses. Semantics are implemented by COMBAT (DESIGN 4.2); text is what the UI shows.
  // stack: 'int' = intensity (numbers add), 'dur' = duration in rounds (numbers add).
  // resource statuses are inert: cards, passives and relics read and spend them.
  // ------------------------------------------------------------------
  const statuses = {
    might:      { id: 'might', name: 'Might', kind: 'buff', stack: 'int', text: 'Attacks deal +N damage per hit.' },
    bulwark:    { id: 'bulwark', name: 'Bulwark', kind: 'buff', stack: 'int', text: 'Gain +N extra Block whenever you gain Block from a card.' },
    regen:      { id: 'regen', name: 'Regen', kind: 'buff', stack: 'int', text: 'At the start of its turn, heal N, then Regen falls by 1.' },
    thorns:     { id: 'thorns', name: 'Thorns', kind: 'buff', stack: 'int', text: 'Whenever it is hit by an attack, the attacker takes N damage.' },
    dodge:      { id: 'dodge', name: 'Dodge', kind: 'buff', stack: 'int', text: 'Negates the next N attack hits completely.' },
    taunt:      { id: 'taunt', name: 'Taunt', kind: 'buff', stack: 'dur', text: 'Enemy attacks that would strike the back row, or a random or lowest hero, hit this hero instead.' },
    ritual:     { id: 'ritual', name: 'Ritual', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Might.' },
    plating:    { id: 'plating', name: 'Plating', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Block.' },
    bloom:      { id: 'bloom', name: 'Bloom', kind: 'resource', stack: 'int', hero: 'hanae', text: 'Hanae\'s petals. Built by her attacks, spent by her finishers.' },
    sumi:       { id: 'sumi', name: 'Breath', kind: 'resource', stack: 'int', hero: 'kuro', text: 'Kuro\'s breath. Built by his skills, released through his flute.' },
    ward:       { id: 'ward', name: 'Ward', kind: 'resource', stack: 'int', hero: 'suzu', text: 'Suzu\'s talisman charges. Built by her prayers, spent by her rites.' },
    charge:     { id: 'charge', name: 'Charge', kind: 'resource', stack: 'int', hero: 'raiga', text: 'Raiga\'s static. Built by taking hits and striking, released in storms.' },
    vulnerable: { id: 'vulnerable', name: 'Vulnerable', kind: 'debuff', stack: 'dur', text: 'Takes 50% more attack damage.' },
    weak:       { id: 'weak', name: 'Weak', kind: 'debuff', stack: 'dur', text: 'Deals 25% less attack damage.' },
    frail:      { id: 'frail', name: 'Frail', kind: 'debuff', stack: 'dur', text: 'Gains 25% less Block from cards.' },
    poison:     { id: 'poison', name: 'Poison', kind: 'debuff', stack: 'int', text: 'At the start of its turn, lose N HP (ignores Block), then Poison falls by 1.' },
    burn:       { id: 'burn', name: 'Burn', kind: 'debuff', stack: 'int', text: 'At the end of the round, take N damage (ignores Block), then Burn halves.' },
    stun:       { id: 'stun', name: 'Stun', kind: 'debuff', stack: 'dur', text: 'Skips its next action. A stunned hero cannot play cards on their next turn.' },
    bind:       { id: 'bind', name: 'Bind', kind: 'debuff', stack: 'dur', text: 'While either hero has Bind, neither hero can swap rows.' },
    mark:       { id: 'mark', name: 'Mark', kind: 'debuff', stack: 'int', text: 'The next N attack hits against it deal +3 damage each (one stack per hit).' },
  };

  // Glossary shown in tooltips. Keys are the words the UI highlights in card text.
  const keywords = {
    block: { name: 'Block', text: 'Absorbs damage this turn. Wears off at the start of the owner\'s next turn.' },
    exhaust: { name: 'Exhaust', text: 'Removed from the fight after it is played. It returns next combat.' },
    retain: { name: 'Retain', text: 'Stays in your hand at the end of the turn.' },
    innate: { name: 'Innate', text: 'Always in your opening hand.' },
    ethereal: { name: 'Ethereal', text: 'Exhausted if still in your hand at the end of the turn.' },
    unplayable: { name: 'Unplayable', text: 'Cannot be played.' },
    front: { name: 'Front row', text: 'The hero in front takes most enemy attacks. A card line starting Front: only works while its hero stands here.' },
    back: { name: 'Back row', text: 'The hero in back is safe from most enemy attacks. A card line starting Back: only works while its hero stands here.' },
    swap: { name: 'Swap', text: 'Trade rows. One swap per turn is free, more cost 1 Energy.' },
    ink: { name: 'Echo', text: 'Spend Echo on the map to wake a silent hex and reveal it.' },
    brush: { name: 'Song', text: 'A one-use Song that wakes a shape of hexes for free.' },
    gem: { name: 'Gem', text: 'Socket gems into card slots. A slot only accepts its own colour, prism slots accept any.' },
    slot: { name: 'Gem slot', text: 'Colour-matched socket. Gems change how the card plays.' },
    prism: { name: 'Prism slot', text: 'A prism slot accepts a gem of any colour.' },
    xcost: { name: 'X cost', text: 'Spends all your remaining Energy. The card reads X as the Energy spent.' },
    down: { name: 'Downed', text: 'A hero at 0 HP is downed: their cards are dead and they cannot be targeted. If both fall, the journey ends.' },
  };

  // ------------------------------------------------------------------
  // Economy: every tunable number in one place. RUN, MAP and COMBAT read these.
  // ------------------------------------------------------------------
  const ECONOMY = {
    energy: 3, handSize: 5, maxHand: 10, freeSwaps: 1, swapCost: 1,
    startGold: 60, startInk: 10, inkMax: 14, paintCost: 1,
    wellInk: 4, campInk: 4,
    killInk: { minion: 0, normal: 1, elite: 2, boss: 0 },
    gold: { normal: [14, 22], elite: [30, 44], boss: [70, 90], chest: [45, 75] },
    cardChoices: 3,
    // rarity weights (percent) for card rewards. rare weight = base.rare + min(rareOffset, rareOffsetCap) + mods.rareBoost,
    // moved from common. rareOffset rises by 1 after each normal or elite reward that offered no rare, resets when a rare is taken.
    rarity: {
      normal: { common: 62, uncommon: 33, rare: 5 },
      elite: { common: 45, uncommon: 40, rare: 15 },
      boss: { common: 0, uncommon: 0, rare: 100 },
      shop: { common: 55, uncommon: 35, rare: 10 },
    },
    rareOffsetCap: 40,
    relicWeights: { elite: { common: 50, uncommon: 40, rare: 10 }, chest: { common: 45, uncommon: 40, rare: 15 }, shop: { common: 40, uncommon: 40, rare: 20 } },
    price: { card: { common: 50, uncommon: 80, rare: 150 }, relic: { common: 140, uncommon: 190, rare: 260, shop: 160 }, gem: { 1: 60, 2: 110, 3: 180 }, remove: 75, removeStep: 25, brush: 45, saleFrac: 0.5 },
    shop: { cards: 5, gems: 2, relics: 3, brushes: 1 },
    camp: { restPct: 0.35 },
    chapterEnd: { healPct: 0.30, maxHp: 8 },
    reviveFrac: 0.25,                 // downed heroes revive at this fraction of max HP when a fight is won
    // Map generation. Layout: pointy-top odd-r offset, column = q + floor(r / 2). Start sits in column startCol and the
    // boss in column bossCol, so MAP.solve(M).minInk (paints from the edge of the start ring to the boss, boss hex
    // included) has the floor bossCol - startCol - startRing = 16. solve.min/max are what the map tests assert.
    map: { cols: 21, rows: 13, hexSize: 46, blockFrac: 0.12, startRing: 2, startCol: 1, bossCol: 19, solve: { min: 16, max: 22 }, wells: { count: 3, within: 3 } },
    // dist = target fraction of non-block hexes; the final count is clamp(round(fraction * nonBlock), countMin, countMax).
    dist: { enemy: 0.22, elite: 0.022, chest: 0.03, shop: 0.02, camp: 0.025, event: 0.09, well: 0.05, brush: 0.025, gemcache: 0.02, forge: 0.015 },
    countMin: { elite: 3, chest: 3, shop: 2, camp: 3, event: 8, well: 6, brush: 2, gemcache: 2, forge: 2 },
    countMax: { elite: 7, chest: 10, shop: 6, camp: 8, event: 26, well: 16, brush: 8, gemcache: 6, forge: 6 },
    // Library (Inkstone prices) and Inkstone payout per run (META.recordRun, DESIGN 4.10).
    library: { card: { uncommon: 60, rare: 120 }, relic: { common: 40, uncommon: 70, rare: 110, boss: 110, shop: 90 }, gem: { 2: 80, 3: 140 } },
    inkstones: { perChapter: 4, win: 15, perTrial: 3, scoreDiv: 60, dailyMul: 0.5, abandonMul: 0.5 },
    // RUN.score(R) = max(0, chapter*chaptersCleared + boss*bossKills + elite*elites + floor(gold/goldDiv) + maxHp*sum(maxHp)
    //   + upgraded*upgradedCards + gemSlot*filledGemSlots + curse*curseCards - floor(turns/turnDiv))   (curse is negative)
    score: { chapter: 100, boss: 60, elite: 15, goldDiv: 10, maxHp: 2, upgraded: 2, gemSlot: 3, curse: -5, turnDiv: 2 },
  };

  // Settings domains and defaults (META stores them, UI.applySettings reads them, DESIGN 5.5).
  const SETTINGS = {
    musicVol: { def: 0.7, min: 0, max: 1 },
    sfxVol: { def: 0.8, min: 0, max: 1 },
    shake: { def: 1, min: 0, max: 1 },
    reduceMotion: { def: null, values: [null, true, false] },       // null = follow prefers-reduced-motion
    textScale: { def: 1, values: [1, 1.15, 1.3] },
    fastAnim: { def: 0, values: [0, 1, 2] },                         // 0 normal, 1 = x1.6, 2 = x2.5
    damageNumbers: { def: true, values: [true, false] },
    colorblind: { def: false, values: [false, true] },
    quality: { def: 'auto', values: ['auto', 'high', 'low'] },
    hints: { def: true, values: [true, false] },
  };

  // ------------------------------------------------------------------
  // Brushes: one-use map tools. MAP.brushCells implements the geometry (DESIGN 4.8).
  // ------------------------------------------------------------------
  const brushes = {
    stroke: { id: 'stroke', name: 'Drum Line', kind: 'line', len: 3, text: 'Wake 3 hexes in a straight line, starting next to any woken hex.' },
    wave:   { id: 'wave', name: 'Ripple', kind: 'line', len: 5, text: 'Wake 5 hexes in a straight line, starting next to any woken hex.' },
    fan:    { id: 'fan', name: 'Shout', kind: 'fan', text: 'Wake a wedge of 3 hexes next to a woken hex.' },
    splash: { id: 'splash', name: 'Beat Drop', kind: 'blob', text: 'Wake a hex next to the woken land and the 6 hexes around it.' },
    halo:   { id: 'halo', name: 'Chorus', kind: 'ring', text: 'Wake all 6 hexes around any woken hex.' },
    blot:   { id: 'blot', name: 'Hum', kind: 'dot', text: 'Wake any one hex within 4 of the party.' },
  };

  // Map tile presentation names (icons come from ART.icon 'tile').
  const tiles = {
    start: { name: 'Downbeat', text: 'Where the journey begins.' },
    empty: { name: 'Path', text: 'Open ground.' },
    block: { name: 'Dead Silence', text: 'A hole in the land. Nothing can cross it.' },
    enemy: { name: 'Ambush', text: 'A creature of the Hush blocks the way.' },
    elite: { name: 'Champion', text: 'A dangerous foe guarding a treasure.' },
    boss: { name: 'Keeper', text: 'The keeper of this verse.' },
    chest: { name: 'Treasure', text: 'A chest. Relics, gold, or gems.' },
    shop: { name: 'Peddler', text: 'A travelling merchant of odd things.' },
    camp: { name: 'Campfire', text: 'Rest, mend, or sharpen.' },
    event: { name: 'Fable', text: 'Something strange is happening.' },
    well: { name: 'Temple Bell', text: 'Ring it to refill your Echo.' },
    brush: { name: 'Songbird', text: 'Learn a one-use Song.' },
    gemcache: { name: 'Gem Cache', text: 'Choose a gem.' },
    forge: { name: 'Tuning Forge', text: 'Upgrade one card, or cut gems.' },
  };

  // ------------------------------------------------------------------
  // Heroes. Rows: the bonus a hero gets while standing in that row.
  // passives use the hook DSL (same shape as relic hooks) and are OWNED by the hero:
  // they fire only for that hero's own events. Starter card ids are a promise: the
  // hero's card file MUST define each of them.
  // ------------------------------------------------------------------
  const heroes = {
    hanae: {
      id: 'hanae', name: 'Hanae', title: 'The Blossom Blade', prefer: 'front', res: 'bloom',
      color: '#ff7eb6', accent: '#fff4f8', dark: '#b0245c', maxHp: 84,
      blurb: 'A duelist who never loses her composure. She cuts fast and cuts often, and blooms brighter with every strike.',
      rows: { front: { dmgAdd: 2 }, back: { blockAdd: 1 } },
      passives: [{ id: 'blade_flow', name: 'Blade Flow', on: 'onPlay', filter: { type: 'attack' }, limit: 1, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
      starter: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry', 'hanae_petal_step'],
      unlock: null,
    },
    kuro: {
      id: 'kuro', name: 'Kuro', title: 'The Songweaver', prefer: 'back', res: 'sumi',
      color: '#7a6bff', accent: '#5ff5ff', dark: '#1a1740', maxHp: 68,
      blurb: 'A flautist who plays spells into the air. Fragile up close, devastating when the melody is his to carry.',
      rows: { back: { dmgAdd: 2 }, front: { blockAdd: 0 } },
      passives: [{ id: 'steady_hand', name: 'Steady Breath', on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      starter: ['kuro_ink_bolt', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_first_stroke'],
      unlock: null,
    },
    suzu: {
      id: 'suzu', name: 'Suzu', title: 'The Moon Miko', prefer: 'back', res: 'ward',
      color: '#a9c4ff', accent: '#e8424f', dark: '#4a5c9c', maxHp: 68,
      blurb: 'A shrine maiden who keeps the land in tune. Her talismans turn the tide of any fight.',
      rows: { front: { blockAdd: 1, thorns: 2 }, back: { regen: 2 } },
      passives: [{ id: 'moonlit_rite', name: 'Moonlit Rite', on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }],
      starter: ['suzu_ofuda', 'suzu_ofuda', 'suzu_barrier', 'suzu_barrier', 'suzu_moon_prayer'],
      unlock: { ach: 'ch1_clear' },
    },
    raiga: {
      id: 'raiga', name: 'Raiga', title: 'The Thunder Monk', prefer: 'front', res: 'charge',
      color: '#ff9a2e', accent: '#ffe45e', dark: '#5a2a0a', maxHp: 88,
      blurb: 'A wandering monk who trades blows with storms. Every hit he takes is one he gives back, louder.',
      rows: { front: { thorns: 2, startBlock: 3 }, back: { dmgAdd: 1 } },
      passives: [{ id: 'storm_born', name: 'Storm Born', on: 'onDamaged', limit: 2, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      starter: ['raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace', 'raiga_static_fist'],
      unlock: { ach: 'ch2_clear' },
    },
  };

  // ------------------------------------------------------------------
  // The fixed roster (CONTENT_SPEC 4 is the human copy). Ids, tiers, sizes and chapters are LAW:
  // data_enemies_N.js defines exactly its chapter's ids and art_enemies_N.js draws exactly them.
  // Entry: [id, name, size, role]. Bosses also carry a title.
  // ------------------------------------------------------------------
  const ROSTER_SRC = {
    1: {
      normal: [
        ['kappa', 'Kappa', 'm', 'River imp with a water dish on its head. Steady hits, then guards; teaches Vulnerable and Block.'],
        ['tanuki_bandit', 'Tanuki Bandit', 'm', 'Raccoon-dog thief. Hits, steals gold, then flees with it; kill it first to get the gold back.'],
        ['kodama', 'Kodama', 's', 'Tree spirit. Rattles both heroes lightly and calls a Leaf Imp to its side.'],
        ['karakasa', 'Karakasa', 'm', 'One-legged umbrella yokai. Hops in for two quick hits, then snaps shut for Block.'],
        ['hitodama', 'Hitodama', 's', 'Drifting soul-flame. Frail and fast, burns the front hero and leaves scorch cards in the deck.'],
        ['oni_cub', 'Oni Cub', 'm', 'Small horned brawler that gains Might every turn. Punish it early or it snowballs.'],
        ['crow_tengu', 'Crow Tengu', 'm', 'Winged trickster. Dives on the back row and pecks in flurries.'],
        ['bamboo_sprite', 'Bamboo Sprite', 's', 'Leaf-blade skirmisher that arrives in packs. Three tiny hits per turn.'],
        ['mushroom_folk', 'Mushroom Folk', 'm', 'Spore-cap wanderer. Poisons the front hero and grows Thorns on its cap.'],
        ['bamboo_boar', 'Bamboo Boar', 'l', 'Armoured charger. Gains Plating, winds up (telegraph), then one heavy gore.'],
      ],
      elite: [
        ['oni_brute', 'Oni Brute', 'l', 'Club-swinging champion. Heavy hits and Weak, and it enrages below half HP.'],
        ['tengu_duelist', 'Tengu Duelist', 'l', 'Fencing master. Strikes the back row, gains Dodge, and ripostes.'],
        ['moss_guardian', 'Moss Guardian', 'l', 'Stone guardian overgrown with moss. Plating and Thorns, slow slams, calls Leaf Imps.'],
      ],
      minion: [
        ['ember_wisp', 'Ember Wisp', 's', 'Tiny fire wisp. Burns a hero once, then fizzles.'],
        ['leaf_imp', 'Leaf Imp', 's', 'Fast leaf sprite called by kodama and guardians. One weak poke.'],
        ['paper_kodama', 'Hollow Kodama', 's', 'Hollow tree spirit. Clogs the deck with silence cards.'],
      ],
      boss: ['boss_kuzunoha', 'Kuzunoha', 'xl', 'White fox whose nine tails each ring a bell. Bell strikes and hollow kodama, then all nine voices at once.', 'The Nine-Voiced Fox'],
    },
    2: {
      normal: [
        ['chochin', 'Chochin Lantern', 'm', 'One-eyed paper lantern. Scorches with Burn and lights its allies with Ritual.'],
        ['karakuri_puppet', 'Karakuri Puppet', 'm', 'Wind-up puppet with a fixed combo; its last strike Stuns the front hero.'],
        ['nopperabo', 'Nopperabo', 'm', 'Faceless ghost. Applies Weak and Frail, then strikes harder while they stick.'],
        ['drowned_samurai', 'Drowned Samurai', 'l', 'Waterlogged blade-master. Heavy cuts and Plating from sodden armour.'],
        ['koi_spirit', 'Koi Spirit', 'm', 'Spectral carp. Heals its allies and splashes both heroes.'],
        ['tsukumogami', 'Tsukumogami', 'm', 'Haunted household object. Hits and shuffles silence cards into your draw pile.'],
        ['silk_weaver', 'Silk Weaver', 'm', 'Spider servant. Binds a hero and calls a Spiderling.'],
        ['nure_onna', 'Nure-onna', 'l', 'Snake-bodied river woman. Strikes the back row and poisons.'],
        ['rokurokubi', 'Rokurokubi', 'm', 'Long-necked ghost that reaches over the front hero to hit the back row twice.'],
        ['ittan_momen', 'Ittan-momen', 'm', 'Flying cloth. Wraps a hero in Bind and gains Block.'],
      ],
      elite: [
        ['drowned_general', 'Drowned General', 'l', 'Commands the flood. Ritual Might, calls Lantern Wisps, one heavy blow below half HP.'],
        ['puppet_master', 'Puppet Master', 'l', 'Pulls the strings. Calls Paper Puppets, heals them, and Stuns a hero.'],
        ['umibozu', 'Umibozu', 'l', 'Sea-monk giant. Whole-party tidal slams and a Stun.'],
      ],
      minion: [
        ['spiderling', 'Spiderling', 's', 'Quick spider hatchling with a poison nip.'],
        ['paper_puppet', 'Paper Puppet', 's', 'Flimsy puppet. One weak strike, gone in a hit.'],
        ['lantern_wisp', 'Lantern Wisp', 's', 'Small ghostly flame. Burns a hero and warms its neighbours.'],
      ],
      boss: ['boss_jorogumo', 'Jorogumo', 'xl', 'Spider-woman in a layered kimono. Binds heroes in silk and calls spiderlings, then drops her disguise.', 'The Silk Courtesan'],
    },
    3: {
      normal: [
        ['storm_drone', 'Storm Drone', 'm', 'Hovering shock drone. Rapid lightning jabs in threes.'],
        ['komainu_guardian', 'Komainu Guardian', 'l', 'Stone lion-dog. Plating and Thorns, then a crushing pounce.'],
        ['redaction_knight', 'Muffled Knight', 'm', 'Felt-stuffed helm. Hits hard and adds muted cards.'],
        ['void_scribe', 'Grey Cantor', 'm', 'Chants silence. Strips your buffs and adds silence cards.'],
        ['blank_soldier', 'Silent Soldier', 'm', 'Grey soldier that marches in step. Steady hits, weak alone.'],
        ['sky_serpent', 'Sky Serpent', 'l', 'Coiling wind serpent. Multi-hit strikes across the back row.'],
        ['eraser_wraith', 'Muffle Wraith', 'm', 'Smothers your Block and your hero resource stacks.'],
        ['thunder_crow', 'Thunder Crow', 'm', 'Storm crow. Dives for a Stun and pecks the back row.'],
        ['paper_golem', 'Felt Golem', 'l', 'Padded felt giant. Slow, heavy hits and Plating.'],
        ['margin_imp', 'Off-Key Imp', 'm', 'Off-key imp. Calls Sour Notes and adds wilt cards.'],
      ],
      elite: [
        ['censor_golem', 'Censor Golem', 'l', 'Stamps things silent. Muted cards, Plating, and one huge stamp.'],
        ['storm_whelp', 'Storm Dragon Whelp', 'l', 'Young storm dragon. Lightning across the whole party and multi-strikes.'],
        ['black_bar_inquisitor', 'Hush Inquisitor', 'l', 'Hunts the weak. Stun, Bind, and a finisher against a low hero.'],
      ],
      minion: [
        ['blank_page', 'Hush Moth', 's', 'Drifting grey moth. Gains Block, then wraps a hero in Frail.'],
        ['spark_mote', 'Spark Mote', 's', 'Tiny storm spark. One zap and it bursts.'],
        ['typo_sprite', 'Sour Note', 's', 'Mischievous sour note. Adds a wilt card.'],
      ],
      boss: ['boss_editor', 'The Conductor', 'xl', 'Pale conductor with a red baton. Becomes a felt-armed giant, then a colossal hole of silence.', 'Keeper of the Last Note'],
    },
  };

  const ROSTER = { 1: [], 2: [], 3: [] };
  const rosterById = {};
  [1, 2, 3].forEach((ch) => {
    const src = ROSTER_SRC[ch];
    ['normal', 'elite', 'minion'].forEach((tier) => src[tier].forEach((r) => {
      ROSTER[ch].push({ id: r[0], name: r[1], tier, size: r[2], role: r[3], chapter: ch });
    }));
    const b = src.boss;
    ROSTER[ch].push({ id: b[0], name: b[1], tier: 'boss', size: b[2], role: b[3], title: b[4], chapter: ch });
    ROSTER[ch].forEach((r) => { rosterById[r.id] = r; });
  });

  // Ids other modules and authors depend on (CONTENT_SPEC 2). Strict validation checks they exist.
  const FIXED = {
    bosses: { 1: 'boss_kuzunoha', 2: 'boss_jorogumo', 3: 'boss_editor' },
    curses: ['curse_regret', 'curse_smudge', 'curse_doubt', 'curse_burden', 'curse_hex', 'curse_decay'],
    statusCards: ['status_blot', 'status_tangle', 'status_scorch', 'status_redacted', 'status_static', 'status_wilt'],
    relics: { brass_lantern: 'common', fox_mask: 'uncommon', silver_bell: 'uncommon', jade_key: 'rare' },
    achievements: ['ch1_clear', 'ch2_clear', 'ch3_clear'],
    lore: ['intro', 'ch1_intro', 'ch2_intro', 'ch3_intro', 'ch1_clear', 'ch2_clear', 'victory', 'defeat',
      'hero_hanae', 'hero_kuro', 'hero_suzu', 'hero_raiga', 'barks_hanae', 'barks_kuro', 'barks_suzu', 'barks_raiga'],
    barkKeys: ['start', 'hurt', 'kill', 'down', 'win', 'swap'],
  };

  // How much content (CONTENT_SPEC 3 to 6). DATA.audit checks these.
  const QUOTA = {
    cards: { starter: 3, common: 14, uncommon: 12, rare: 8, powers: 4, lockedUncommon: 4, lockedRare: 4, slots: { red: 10, blue: 10, green: 8, gold: 8 } },
    enemies: { normal: 10, elite: 3, minion: 3, boss: 1, normalGroups: 12, eliteGroups: 3, bossPhases: { 1: 1, 2: 1, 3: 2 } },
    relics: { common: 22, uncommon: 22, rare: 12, boss: 6, shop: 4, perHero: 3, lockedFrac: 0.3, textMax: 90 },
    gems: { perColor: 6, tiers: [1, 1, 2, 2, 3, 3] },
    events: { perChapter: 10, any: 10, onceFrac: 0.6 },
    achievements: 32, trials: 10, tips: 30,
  };

  // Enemy numbers at Trial 0 (CONTENT_SPEC 4 table; the data test asserts the markdown table equals this).
  // hp: [min,max] per tier. hit: per-hit range for the tier's ordinary attacks. heavy: telegraphed hit.
  // round: boss per-round total [normal phase max, last phase max]. budget: a group's summed average
  // per-round damage before Block (minions never count).
  const GUIDE = {
    hp: { 1: { minion: [6, 14], normal: [16, 38], elite: [55, 85], boss: [170, 200] }, 2: { minion: [10, 22], normal: [28, 58], elite: [85, 125], boss: [240, 280] }, 3: { minion: [14, 30], normal: [42, 80], elite: [120, 165], boss: [420, 480] } },
    hit: { 1: { minion: [2, 5], normal: [4, 9], elite: [8, 14], boss: [9, 13] }, 2: { minion: [3, 7], normal: [7, 14], elite: [12, 18], boss: [12, 16] }, 3: { minion: [4, 9], normal: [10, 18], elite: [15, 22], boss: [15, 22] } },
    heavy: { 1: { normal: [12, 14], boss: [16, 20] }, 2: { normal: [16, 20], boss: [20, 26] }, 3: { normal: [22, 26], boss: [26, 34] } },
    round: { 1: [24, 30], 2: [30, 36], 3: [40, 46] },
    budget: { 1: { normal: [8, 16], elite: [14, 22] }, 2: { normal: [14, 26], elite: [22, 32] }, 3: { normal: [20, 34], elite: [30, 42] } },
  };

  // ------------------------------------------------------------------
  // Registries filled by content files. DATA.add throws on a duplicate id so two
  // agents can never silently shadow each other.
  // ------------------------------------------------------------------
  const REG = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
  const D = { LISTS, statuses, keywords, ECONOMY, SETTINGS, brushes, tiles, heroes, ROSTER, rosterById, FIXED, QUOTA, GUIDE, encounters: { 1: { normal: [], elite: [] }, 2: { normal: [], elite: [] }, 3: { normal: [], elite: [] } } };
  REG.forEach((k) => { D[k] = k === 'tips' ? [] : {}; });

  D.add = (kind, defs) => {
    if (!D[kind] || REG.indexOf(kind) < 0) throw new Error('DATA.add: unknown registry ' + kind);
    if (kind === 'tips') { (Array.isArray(defs) ? defs : [defs]).forEach((t) => D.tips.push(t)); return; }
    if (!defs || typeof defs !== 'object' || Array.isArray(defs)) throw new Error(`DATA.add(${kind}): defs must be an object keyed by id, {my_id: {...}} (an array is only legal for tips)`);
    Object.keys(defs).forEach((id) => {
      if (D[kind][id]) throw new Error(`DATA.add: duplicate ${kind} id "${id}"`);
      const d = defs[id];
      if (d && typeof d === 'object' && !d.id) d.id = id;
      if (d && d.id !== id) throw new Error(`DATA.add: ${kind} key "${id}" != def id "${d.id}"`);
      D[kind][id] = d;
    });
  };

  // Encounter pools: DATA.addEncounters(chapter, {normal:[{id, enemies:[ids], w, min}], elite:[...], boss:'id'})
  // min = lowest tile.diff (0..1) the group may appear at; w = weight. Group ids are 'ch<N>_...' and globally unique.
  D.addEncounters = (chapter, pools) => {
    const e = D.encounters[chapter];
    if (!e) throw new Error('DATA.addEncounters: bad chapter ' + chapter);
    ['normal', 'elite'].forEach((k) => {
      (pools[k] || []).forEach((g) => {
        if (D.groupById(g.id)) throw new Error(`DATA.addEncounters: duplicate group id "${g.id}"`);
        e[k].push(g);
      });
    });
    if (pools.boss) { if (e.boss) throw new Error('DATA.addEncounters: boss already set for chapter ' + chapter); e.boss = pools.boss; }
  };

  // ---- lookups ----
  const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  D.hero = (id) => heroes[id] || null;
  D.card = (id) => D.cards[id] || null;
  D.cardsBy = (f) => Object.values(D.cards).filter((c) => (!f.hero || c.hero === f.hero) && (!f.rarity || c.rarity === f.rarity) && (!f.type || c.type === f.type));
  D.enemyIds = (chapter, tier) => Object.values(D.enemies).filter((e) => (!chapter || e.chapter === chapter) && (!tier || e.tier === tier)).map((e) => e.id);
  D.groupById = (id) => { for (const ch of [1, 2, 3]) { const p = D.encounters[ch]; const g = p.normal.concat(p.elite).find((x) => x && x.id === id); if (g) return g; } return null; };
  D.eligibleGroups = (chapter, kind, diff) => (D.encounters[chapter][kind] || []).filter((g) => g.min <= diff);
  D.isStatus = (id) => !!statuses[id];
  D.isDebuff = (id) => !!statuses[id] && statuses[id].kind === 'debuff';
  D.isBuff = (id) => !!statuses[id] && statuses[id].kind === 'buff';
  // unlocked = {card:[ids], relic:[ids], gem:[ids]} (the locked defs the player owns); undefined means "everything".
  D.isUnlocked = (kind, id, unlocked) => {
    const reg = { card: D.cards, relic: D.relics, gem: D.gems }[kind];   // heroes and trials are META's business: no registry here means nothing to lock
    const def = reg && reg[id];
    if (!def || !def.locked || !unlocked) return true;
    return (unlocked[kind] || []).indexOf(id) >= 0;
  };
  // Reward pool for one hero at one rarity (starters and tokens never reward)
  D.rewardPool = (heroId, rarity, unlocked) => (rarity === 'starter' || rarity === 'token' ? [] : D.cardsBy({ hero: heroId, rarity }).filter((c) => D.isUnlocked('card', c.id, unlocked)));
  D.relicPool = (rarity, unlocked, heroIds) => Object.values(D.relics).filter((r) => r.rarity === rarity && D.isUnlocked('relic', r.id, unlocked) && (!r.hero || !heroIds || heroIds.indexOf(r.hero) >= 0));
  D.gemPool = (f, unlocked) => Object.values(D.gems).filter((g) => (!f || !f.tier || g.tier === f.tier) && (!f || !f.color || g.color === f.color) && D.isUnlocked('gem', g.id, unlocked));
  // Visit every op in a list, through cond (then/else), repeat (do) and hook (fx) nesting.
  D.walkOps = (ops, fn, depth) => {
    depth = depth || 0;
    if (!Array.isArray(ops) || depth > 8) return;
    ops.forEach((o) => {
      if (!o || typeof o !== 'object') return;
      fn(o);
      D.walkOps(o.then, fn, depth + 1); D.walkOps(o.else, fn, depth + 1); D.walkOps(o.do, fn, depth + 1);
      if (o.op === 'hook') D.walkOps(o.fx, fn, depth + 1);
    });
  };

  // ---- mods (DESIGN 4.7) ----
  // count keys: [base, min, max]. frac keys fold to max(0.1, 1 + sum). reviveFrac is a delta on ECONOMY.reviveFrac.
  const COUNT_BASE = {
    energy: [ECONOMY.energy, 1, 10], hand: [ECONOMY.handSize, 1, ECONOMY.maxHand], startBlock: [0, 0, 99], inkMax: [ECONOMY.inkMax, 6, 20],
    startInk: [ECONOMY.startInk, 1, 20], wellInk: [ECONOMY.wellInk, 1, 12], cardChoices: [ECONOMY.cardChoices, 1, 6], freeSwaps: [ECONOMY.freeSwaps, 0, 5],
    campActions: [1, 1, 3], rareBoost: [0, 0, 50], startGold: [ECONOMY.startGold, 0, 999], curses: [0, 0, 10],
  };
  const FRAC_KEYS = ['goldMul', 'priceMul', 'healMul', 'enemyHp', 'eliteHp', 'bossHp', 'enemyDmg'];
  D.foldMods = (list) => {
    const sum = {};
    (list || []).forEach((m) => { if (m) Object.keys(m).forEach((k) => { if (typeof m[k] === 'number') sum[k] = (sum[k] || 0) + m[k]; }); });
    const out = {};
    Object.keys(COUNT_BASE).forEach((k) => { const c = COUNT_BASE[k]; out[k] = Math.min(c[2], Math.max(c[1], c[0] + Math.round(sum[k] || 0))); });
    out.startInk = Math.min(out.startInk, out.inkMax);
    FRAC_KEYS.forEach((k) => { out[k] = Math.max(0.1, 1 + (sum[k] || 0)); });
    out.reviveFrac = Math.min(1, Math.max(0.05, ECONOMY.reviveFrac + (sum.reviveFrac || 0)));
    return out;
  };
  // Trial N's deltas are the sum of trial levels 1..N (each level's mods are its own increment).
  D.trialDeltas = (level) => {
    const sum = {};
    Object.values(D.trials).filter((t) => t.level <= level).forEach((t) => Object.keys(t.mods || {}).forEach((k) => { sum[k] = (sum[k] || 0) + t.mods[k]; }));
    return sum;
  };
  // trial: a level number, or the deltas object a run stored at newRun (R.mods), so a saved run does not drift if trial data is retuned
  D.modsFor = (relicIds, trial) => D.foldMods((relicIds || []).map((id) => D.relics[id] && D.relics[id].mods).concat([trial && typeof trial === 'object' ? trial : D.trialDeltas(trial || 0)]));
  D.rowFor = (heroId, row, relicIds) => {
    const out = {};
    const add = (r) => { if (r) Object.keys(r).forEach((k) => { out[k] = (out[k] || 0) + r[k]; }); };
    add(heroes[heroId] && heroes[heroId].rows[row]);
    (relicIds || []).forEach((id) => add(D.relics[id] && D.relics[id].rows && D.relics[id].rows[row]));
    return out;
  };

  // final tile count for one tile type on a map with `nonBlock` non-void hexes
  D.tileCount = (type, nonBlock) => {
    const lo = ECONOMY.countMin[type] || 0, hi = ECONOMY.countMax[type] === undefined ? Infinity : ECONOMY.countMax[type];
    return Math.min(hi, Math.max(lo, Math.round(ECONOMY.dist[type] * nonBlock)));
  };
  // clamp a stored setting to its domain, or fall back to the default
  D.cleanSetting = (key, v) => {
    const s = SETTINGS[key];
    if (!s) return undefined;
    if (s.values) return s.values.indexOf(v) >= 0 ? v : s.def;
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.def;
  };

  // ------------------------------------------------------------------
  // Validator. Structural: shapes, closed lists, per-op field schemas, op and target
  // vocabularies per context. It never simulates. Returns {errors:[], warnings:[], counts:{}}.
  // Lenient by default: references to content that other files may not have written yet
  // (enemy ids, card ids, relic ids, fixed ids) are NOT checked. opt.strict checks them all.
  // ------------------------------------------------------------------
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInt = (v) => Number.isInteger(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isBool = (v) => typeof v === 'boolean';
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isArr = Array.isArray;
  const vals = (reg) => Object.keys(reg).map((k) => reg[k]).filter(isObj);   // registry entries that are objects (junk entries get their own error)
  const A = (v) => (Array.isArray(v) ? v : []);      // junk-proof accessors: a validator must never throw on bad content
  const O = (v) => (isObj(v) ? v : {});
  const isArr2 = (a) => Array.isArray(a) && a.length === 2 && isNum(a[0]) && isNum(a[1]);
  const has = (list, v) => LISTS[list].indexOf(v) >= 0;
  const ID_RE = /^[a-z][a-z0-9_]*$/;
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  const V_KEYS = ['base', 'per', 'mul', 's', 'who', 'cap', 'min', 'upTo'];

  // op field schemas per context kind (card | hook | enemy). 'hand' ops validate as hook, gem fx as card.
  const OPSPEC = {
    dmg: { card: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'consume', 'el'], hook: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'consume', 'el'], enemy: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'el'] },
    block: { card: ['n', 'tgt', 'consume'], hook: ['n', 'tgt', 'consume'], enemy: ['n', 'tgt'] },
    heal: { card: ['n', 'tgt', 'consume'], hook: ['n', 'tgt', 'consume'], enemy: ['n', 'tgt'] },
    hurt: { card: ['n', 'tgt', 'lethal', 'consume'], hook: ['n', 'tgt', 'lethal', 'consume'] },
    status: { card: ['s', 'n', 'tgt', 'consume'], hook: ['s', 'n', 'tgt', 'consume'], enemy: ['s', 'n', 'tgt'] },
    removeStatus: { card: ['s', 'n', 'tgt'], hook: ['s', 'n', 'tgt'], enemy: ['s', 'n', 'tgt'] },
    draw: { card: ['n', 'consume'], hook: ['n', 'consume'] },
    energy: { card: ['n', 'consume'], hook: ['n', 'consume'] },
    gold: { card: ['n'], hook: ['n'] },
    ink: { card: ['n'], hook: ['n'] },
    maxHp: { card: ['n', 'tgt'], hook: ['n', 'tgt'] },
    revive: { card: ['n', 'pct'], hook: ['n', 'pct'] },
    pick: { card: ['from', 'n', 'then', 'top', 'filter', 'random', 'optional'] },
    add: { card: ['card', 'n', 'to', 'up'], hook: ['card', 'n', 'to', 'up'], enemy: ['card', 'n', 'to', 'top'] },
    swap: { card: [], enemy: [] },
    cond: { card: ['if', 'then', 'else'], hook: ['if', 'then', 'else'], enemy: ['if', 'then', 'else'] },
    repeat: { card: ['n', 'do'] },
    hook: { card: ['on', 'fx', 'filter', 'limit', 'once', 'every'] },
    summon: { enemy: ['enemy', 'n'] },
    stealGold: { enemy: ['n'] },
    flee: { enemy: [] },
  };
  // which target lists each op may use, per context kind
  const TGT = {
    dmg: { card: 'enemyCardTgt', hook: 'enemyCardTgt', enemy: 'enemyHeroTgt' },
    block: { card: 'heroTgt', hook: 'heroTgt', enemy: 'enemySelfTgt' },
    heal: { card: 'heroTgt', hook: 'heroTgt', enemy: 'enemySelfTgt' },
    hurt: { card: 'heroTgt', hook: 'heroTgt' },
    maxHp: { card: 'heroTgt', hook: 'heroTgt' },
    status: { card: ['heroTgt', 'enemyCardTgt'], hook: ['heroTgt', 'enemyCardTgt'], enemy: ['enemyHeroTgt', 'enemySelfTgt'] },
    removeStatus: { card: ['heroTgt', 'enemyCardTgt'], hook: ['heroTgt', 'enemyCardTgt'], enemy: ['enemyHeroTgt', 'enemySelfTgt'] },
  };
  // an intent icon must be honest about what the move does
  const INTENT_NEEDS = { attack: ['dmg'], multi: ['dmg'], heavy: ['dmg'], defend: ['block'], heal: ['heal'], summon: ['summon'], flee: ['flee'], buff: ['status', 'removeStatus'], debuff: ['status', 'removeStatus', 'add', 'swap', 'stealGold'] };
  const ATTACKISH = ['attack', 'multi', 'heavy', 'special'];
  const RUN_FIELDS = {
    gold: ['n', 'pct'], ink: ['n', 'pct'], heal: ['n', 'pct', 'who'], hurt: ['n', 'pct', 'who'], maxHp: ['n', 'who'],
    addCard: ['card', 'pool', 'rarity', 'n', 'up'], removeCard: ['n', 'random', 'filter'], upgradeCard: ['n', 'random', 'filter'],
    transformCard: ['n', 'random', 'filter'], duplicateCard: ['n', 'random', 'filter'], addRelic: ['id', 'rarity'], addGem: ['id', 'color', 'tier'],
    addBrush: ['id'], addCurse: ['id', 'n'], fight: ['enc', 'enemies', 'tier', 'rewards', 'win'], flag: ['k', 'v'], paint: ['n'], cardReward: ['rarity', 'hero', 'n'],
  };

  D.validate = (only, opt) => {
    opt = opt || {};
    const strict = !!opt.strict;
    const errors = [], warnings = [];
    const err = (where, msg) => errors.push(`${where}: ${msg}`);
    const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
    const want = (k) => !only || only === k || (Array.isArray(only) && only.indexOf(k) >= 0);
    const KINDS = ['heroes', 'cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
    if (only !== undefined) (Array.isArray(only) ? only : [only]).forEach((k) => { if (KINDS.indexOf(k) < 0) err('validate', `unknown registry "${k}" (one of ${KINDS.join(', ')})`); });
    ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore'].forEach((k) => {
      if (want(k)) Object.keys(D[k]).forEach((id) => { if (!isObj(D[k][id])) err(k + ' ' + id, 'must be an object'); });
    });
    const noDash = (w, o) => { if (DASH.test(JSON.stringify(o))) err(w, 'contains an em or en dash'); };
    // top-level fields a def may carry: a typo'd or invented field is an error, not silently ignored
    const FIELDS = {
      card: ['id', 'name', 'hero', 'type', 'rarity', 'cost', 'fx', 'up', 'kw', 'slots', 'art', 'flavor', 'hand', 'locked'],
      gem: ['id', 'name', 'color', 'tier', 'mod', 'art', 'text', 'locked'],
      relic: ['id', 'name', 'rarity', 'text', 'mods', 'rows', 'hooks', 'art', 'hero', 'locked'],
      enemy: ['id', 'name', 'title', 'chapter', 'tier', 'size', 'hp', 'moves', 'ai', 'start', 'phases', 'hooks', 'immune', 'art', 'lore', 'tags'],
      event: ['id', 'title', 'text', 'art', 'once', 'chapters', 'when', 'w', 'choices'],
      choice: ['label', 'req', 'cost', 'out'],
      achievement: ['id', 'name', 'text', 'stat', 'reward'],
      trial: ['id', 'level', 'name', 'text', 'mods'],
    };
    const fields = (w, o, kind) => Object.keys(o).forEach((k) => { if (FIELDS[kind].indexOf(k) < 0) err(w, `unknown field "${k}" on a ${kind}`); });
    // object of numeric comparators: keys outside `keys` are errors, keys in `skip` are checked by the caller
    const cmp = (w, o, path, keys, ints, skip) => {
      if (!isObj(o)) return err(w, `${path} must be an object`);
      Object.keys(o).forEach((k) => {
        if (keys.indexOf(k) < 0) err(w, `${path}: unknown key "${k}"`);
        else if (A(skip).indexOf(k) < 0 && (!isNum(o[k]) || (ints && !isInt(o[k])))) err(w, `${path}.${k} must be a ${ints ? 'whole ' : ''}number`);
      });
    };

    // ---- value expressions ----
    // env: {ctx:'card'|'hook'|'hand'|'gem'|'enemy', cost}
    const vVal = (w, v, path, env) => {
      if (isNum(v)) return;
      if (!isObj(v)) return err(w, `${path}: value must be a number or {base,per,mul,...}`);
      Object.keys(v).forEach((k) => { if (V_KEYS.indexOf(k) < 0) err(w, `${path}: unknown value key "${k}"`); });
      ['base', 'mul', 'cap', 'min', 'upTo'].forEach((k) => { if (v[k] !== undefined && !isNum(v[k])) err(w, `${path}.${k} must be a number`); });
      if (v.min !== undefined && v.cap !== undefined && isNum(v.min) && isNum(v.cap) && v.min > v.cap) err(w, `${path}: min above cap`);
      if (v.per === undefined) {
        if (v.base === undefined) err(w, `${path}: value object needs base or per`);
        ['mul', 's', 'who', 'upTo'].forEach((k) => { if (v[k] !== undefined) err(w, `${path}.${k} needs per`); });
        return;
      }
      const enemy = env.ctx === 'enemy';
      if (!has(enemy ? 'perEnemy' : 'per', v.per)) err(w, `${path}: per "${v.per}" is not legal in ${env.ctx} context`);
      if (v.per === 'X' && env.ctx === 'card' && env.cost !== 'X') err(w, `${path}: per X needs a card with cost 'X'`);
      if (v.per === 'X' && env.ctx !== 'card') err(w, `${path}: per X is only legal on a card with cost 'X'`);
      if (v.per === 'status') { if (!D.isStatus(v.s)) err(w, `${path}: per status needs a known s`); } else if (v.s !== undefined) err(w, `${path}: s only applies to per status`);
      if (v.who !== undefined) {
        if (!has(enemy ? 'perWhoEnemy' : 'perWho', v.who)) err(w, `${path}: who "${v.who}" is not legal in ${env.ctx} context`);
        if (!has('perWhoPer', v.per)) err(w, `${path}: who only applies to status, block, hp, missingHp and debuffs`);
      }
    };

    // ---- conditions. kind: 'card' (also hooks) | 'enemy' | 'ai' ----
    const vCond = (w, c, path, kind) => {
      if (!isObj(c)) return err(w, `${path}: condition must be an object`);
      const list = kind === 'ai' ? 'aiCond' : kind === 'enemy' ? 'condEnemy' : 'cond';
      const whoList = kind === 'enemy' ? 'perWhoEnemy' : 'perWho';
      Object.keys(c).forEach((k) => { if (!has(list, k)) err(w, `${path}: unknown condition "${k}" for ${kind}`); });
      if (Object.keys(c).length === 0) err(w, `${path}: empty condition`);
      if (kind === 'ai') {
        ['hpLt', 'hpGt', 'allyHpLt', 'heroHpLt'].forEach((k) => { if (c[k] !== undefined && !(isNum(c[k]) && c[k] > 0 && c[k] <= 1)) err(w, `${path}.${k} must be a fraction in (0,1]`); });
        if (c.turnGte !== undefined && !(isInt(c.turnGte) && c.turnGte >= 1)) err(w, `${path}.turnGte must be an integer >= 1`);
        if (c.turnEvery !== undefined && !(Array.isArray(c.turnEvery) && c.turnEvery.length === 2 && isInt(c.turnEvery[0]) && c.turnEvery[0] >= 2 && isInt(c.turnEvery[1]) && c.turnEvery[1] >= 0 && c.turnEvery[1] < c.turnEvery[0])) err(w, `${path}.turnEvery must be [period >= 2, offset < period]`);
        ['alone', 'heroDown'].forEach((k) => { if (c[k] !== undefined && c[k] !== true) err(w, `${path}.${k} must be true`); });
        if (c.minions !== undefined) cmp(w, c.minions, path + '.minions', ['lt'], true);
        if (c.heroStatus !== undefined) { if (!isObj(c.heroStatus) || !D.isStatus(c.heroStatus.s)) err(w, `${path}.heroStatus.s must be a known status`); else cmp(w, c.heroStatus, path + '.heroStatus', ['s', 'gte'], true, ['s']); }
        return;
      }
      if (c.row !== undefined && ['front', 'back'].indexOf(c.row) < 0) err(w, `${path}.row must be front or back`);
      ['handEmpty', 'lastKill', 'allyDown'].forEach((k) => { if (c[k] !== undefined && c[k] !== true) err(w, `${path}.${k} must be true`); });
      ['cardsPlayed', 'attacksPlayed', 'turn', 'block', 'energy', 'handSize', 'enemies'].forEach((k) => { if (c[k] !== undefined) cmp(w, c[k], `${path}.${k}`, ['gte', 'lte'], false); });
      if (c.status !== undefined) {
        if (!isObj(c.status) || !D.isStatus(c.status.s)) err(w, `${path}.status.s must be a known status`);
        else { cmp(w, c.status, path + '.status', ['s', 'who', 'gte', 'lte'], false, ['s', 'who']); if (c.status.who !== undefined && !has(whoList, c.status.who)) err(w, `${path}.status.who "${c.status.who}" not legal for ${kind}`); }
      }
      if (c.hpPct !== undefined) {
        if (!isObj(c.hpPct)) err(w, `${path}.hpPct must be an object`);
        else { cmp(w, c.hpPct, path + '.hpPct', ['who', 'lt', 'gt'], false, ['who']); if (c.hpPct.who !== undefined && !has(whoList, c.hpPct.who)) err(w, `${path}.hpPct.who "${c.hpPct.who}" not legal for ${kind}`); if (c.hpPct.lt === undefined && c.hpPct.gt === undefined) err(w, `${path}.hpPct needs lt or gt`); }
      }
      if (c.targetStatus !== undefined) {
        if (!isObj(c.targetStatus) || !D.isStatus(c.targetStatus.s)) err(w, `${path}.targetStatus.s must be a known status`);
        else cmp(w, c.targetStatus, path + '.targetStatus', ['s', 'gte', 'lte'], false, ['s']);
      }
    };

    // ---- hook meta: on, filter, limit, once, every ----
    const vFilter = (w, f, path, on, enemyHook) => {
      if (!isObj(f)) return err(w, `${path} must be an object`);
      const ON = { type: ['onPlay', 'onExhaust', 'onHeroPlay'], cost: ['onPlay', 'onExhaust'], kw: ['onPlay', 'onExhaust'], gems: ['onPlay', 'onExhaust'], tier: ['onKill', 'onFightWon'] };
      Object.keys(f).forEach((k) => {
        if (!has('hookFilter', k)) return err(w, `${path}: unknown key "${k}"`);
        if (enemyHook && k !== 'type') return err(w, `${path}: enemy hooks only filter on type`);
        if (ON[k] && ON[k].indexOf(on) < 0) err(w, `${path}.${k} is meaningless on ${on} (legal on ${ON[k].join(', ')})`);
        const vals = asList(f[k]);
        if (k === 'type') vals.forEach((x) => { if (!has('cardTypes', x)) err(w, `${path}.type "${x}"`); });
        if (k === 'hero') vals.forEach((x) => { if (x !== 'any' && !has('heroIds', x)) err(w, `${path}.hero "${x}"`); });
        if (k === 'kw') vals.forEach((x) => { if (!has('cardKw', x)) err(w, `${path}.kw "${x}"`); });
        if (k === 'tier') vals.forEach((x) => { if (!has('tiers', x)) err(w, `${path}.tier "${x}"`); });
        if (k === 'cost') cmp(w, f.cost, path + '.cost', ['gte', 'lte'], true);
        if (k === 'gems') cmp(w, f.gems, path + '.gems', ['gte'], true);
      });
    };
    const vHookMeta = (w, h, p, onList, enemyHook) => {
      if (!isStr(h.on) || !has(onList, h.on)) err(w, `${p}: hook.on "${h.on}" must be one of LISTS.${onList}`);
      if (h.filter !== undefined) vFilter(w, h.filter, p + '.filter', h.on, enemyHook);
      if (h.limit !== undefined && !(isInt(h.limit) && h.limit >= 1)) err(w, `${p}.limit must be an integer >= 1`);
      if (h.once !== undefined && !isBool(h.once)) err(w, `${p}.once must be a boolean`);
      if (h.every !== undefined && !(isInt(h.every) && h.every >= 2)) err(w, `${p}.every must be an integer >= 2`);
      if (h.once && h.every !== undefined) err(w, `${p}: once and every cannot combine`);
      if (enemyHook && h.every !== undefined) err(w, `${p}: enemy hooks have no every`);
    };

    // ---- ops. ctx: card | hook | hand | gem | enemy ----
    const vOps = (w, ops, ctx, path, env, depth) => {
      env = env || {}; depth = depth || 0;
      if (!Array.isArray(ops)) return err(w, `${path}: fx must be an array`);
      if (depth > 6) return err(w, `${path}: ops nested too deep`);
      const kind = ctx === 'hand' ? 'hook' : ctx === 'gem' ? 'card' : ctx;
      const allowed = kind === 'card' ? LISTS.cardOps : kind === 'hook' ? LISTS.hookOps : LISTS.enemyOps;
      const venv = { ctx: ctx === 'gem' ? 'gem' : ctx, cost: env.cost };
      if (ctx === 'gem') venv.ctx = 'card';
      const sub = (list, p2) => vOps(w, list, ctx, p2, env, depth + 1);
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(o) || !isStr(o.op)) return err(w, `${p}: op object with "op" required`);
        if (allowed.indexOf(o.op) < 0) return err(w, `${p}: op "${o.op}" not allowed in ${ctx} context`);
        const spec = OPSPEC[o.op] && OPSPEC[o.op][kind];
        if (!spec) return err(w, `${p}: op "${o.op}" has no schema for ${kind}`);
        Object.keys(o).forEach((k) => { if (k !== 'op' && spec.indexOf(k) < 0) err(w, `${p}: unknown field "${k}" on ${o.op}`); });
        if (o.tgt !== undefined) {
          const lists = asList(TGT[o.op] && TGT[o.op][kind]);
          if (!lists.some((l) => has(l, o.tgt))) err(w, `${p}: tgt "${o.tgt}" not legal for ${o.op} in ${ctx} context`);
        }
        const val = (k) => vVal(w, o[k], `${p}.${k}`, venv);
        if (o.consume !== undefined) {
          const cs = isObj(o.consume) ? o.consume.s : o.consume;
          if (cs !== 'block' && !D.isStatus(cs)) err(w, `${p}.consume must be a status id, 'block' or {s, upTo}`);
          if (isObj(o.consume)) { Object.keys(o.consume).forEach((k) => { if (['s', 'upTo'].indexOf(k) < 0) err(w, `${p}.consume: unknown key "${k}"`); }); if (o.consume.upTo !== undefined) vVal(w, o.consume.upTo, `${p}.consume.upTo`, venv); }
        }
        switch (o.op) {
          case 'dmg':
            val('n'); if (o.hits !== undefined) val('hits');
            if (o.el !== undefined && !has('elements', o.el)) err(w, `${p}.el "${o.el}" not in LISTS.elements`);
            ['pierce', 'lifesteal'].forEach((k) => { if (o[k] !== undefined && !isBool(o[k])) err(w, `${p}.${k} must be a boolean`); });
            break;
          case 'block': case 'heal': case 'draw': case 'energy': case 'gold': case 'ink': case 'maxHp': case 'hurt': case 'stealGold': val('n'); if (o.op === 'hurt' && o.lethal !== undefined && !isBool(o.lethal)) err(w, `${p}.lethal must be a boolean`); break;
          case 'status':
            if (!D.isStatus(o.s)) err(w, `${p}: unknown status "${o.s}"`);
            val('n');
            if (ctx === 'hand' && D.isDebuff(o.s) && o.tgt === undefined) err(w, `${p}: a debuff in a hand op needs an explicit tgt`);
            break;
          case 'removeStatus':
            if (['debuffs', 'buffs'].indexOf(o.s) < 0 && !D.isStatus(o.s)) err(w, `${p}: removeStatus s must be a status id, 'debuffs' or 'buffs'`);
            if (o.n !== undefined) val('n');
            break;
          case 'revive':
            if ((o.n === undefined) === (o.pct === undefined)) err(w, `${p}: revive needs exactly one of n or pct`);
            if (o.n !== undefined) val('n');
            if (o.pct !== undefined && !(isNum(o.pct) && o.pct > 0 && o.pct <= 1)) err(w, `${p}.pct must be a fraction in (0,1]`);
            break;
          case 'pick':
            if (!has('cardPickFrom', o.from)) err(w, `${p}: bad pick.from "${o.from}"`);
            if (!has('cardPickThen', o.then)) err(w, `${p}: bad pick.then "${o.then}"`);
            else if (has('cardPickFrom', o.from) && LISTS.pickPairs[o.from].indexOf(o.then) < 0) err(w, `${p}: pick from ${o.from} cannot then ${o.then} (legal: ${LISTS.pickPairs[o.from].join(', ')})`);
            val('n');
            if (o.top !== undefined) { if (!(isInt(o.top) && o.top >= 1)) err(w, `${p}.top must be an integer >= 1`); if (o.from !== 'draw') err(w, `${p}.top only applies to from 'draw'`); }
            if (o.filter !== undefined) { if (!isObj(o.filter)) err(w, `${p}.filter must be an object`); else { Object.keys(o.filter).forEach((k) => { if (['type', 'hero'].indexOf(k) < 0) err(w, `${p}.filter: unknown key "${k}"`); }); if (o.filter.type !== undefined && !has('cardTypes', o.filter.type)) err(w, `${p}.filter.type`); if (o.filter.hero !== undefined && !has('heroIds', o.filter.hero)) err(w, `${p}.filter.hero`); } }
            ['random', 'optional'].forEach((k) => { if (o[k] !== undefined && !isBool(o[k])) err(w, `${p}.${k} must be a boolean`); });
            break;
          case 'add':
            if (!isStr(o.card)) err(w, `${p}: add needs a card id`);
            if (o.to !== undefined && !has(kind === 'enemy' ? 'addToEnemy' : 'addTo', o.to)) err(w, `${p}: bad add.to "${o.to}" in ${ctx} context`);
            if (o.n !== undefined) val('n');
            if (o.up !== undefined && !isBool(o.up)) err(w, `${p}.up must be a boolean`);
            if (o.top !== undefined && (!isBool(o.top) || o.to !== 'draw')) err(w, `${p}.top must be true and needs to:'draw'`);
            break;
          case 'summon': if (!isStr(o.enemy)) err(w, `${p}: summon needs an enemy id`); if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 4)) err(w, `${p}.n must be an integer 1..4`); break;
          case 'cond':
            vCond(w, o.if, p + '.if', kind === 'enemy' ? 'enemy' : 'card');
            if (!Array.isArray(o.then) || !o.then.length) err(w, `${p}.then must be a non-empty array`); else sub(o.then, p + '.then');
            if (o.else !== undefined) { if (!Array.isArray(o.else) || !o.else.length) err(w, `${p}.else must be a non-empty array`); else sub(o.else, p + '.else'); }
            break;
          case 'repeat':
            val('n');
            if (!Array.isArray(o.do) || !o.do.length) err(w, `${p}.do must be a non-empty array`); else sub(o.do, p + '.do');
            break;
          case 'hook':
            vHookMeta(w, o, p, 'combatHooks', false);
            if (!Array.isArray(o.fx) || !o.fx.length) err(w, `${p}.fx must be a non-empty array`); else vOps(w, o.fx, 'hook', p + '.fx', env, depth + 1);
            break;
          default: break;
        }
      });
    };

    // ---- run ops (events, run hooks). ctx: event | hook | win ----
    const vRun = (w, ops, ctx, path) => {
      if (!Array.isArray(ops)) return err(w, `${path}: run fx must be an array`);
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(o) || !has('runOps', o.op)) return err(w, `${p}: unknown run op "${o && o.op}"`);
        Object.keys(o).forEach((k) => { if (k !== 'op' && RUN_FIELDS[o.op].indexOf(k) < 0) err(w, `${p}: unknown field "${k}" for ${o.op}`); });
        const pctOk = (v) => isNum(v) && v > 0 && v <= 1;
        const npct = (neg) => {
          if ((o.n === undefined) === (o.pct === undefined)) return err(w, `${p}: ${o.op} needs exactly one of n or pct`);
          if (o.n !== undefined && !(isInt(o.n) && (neg || o.n > 0))) err(w, `${p}.n must be a${neg ? ' whole' : ' positive whole'} number`);
          if (o.pct !== undefined && !(neg ? isNum(o.pct) && o.pct >= -1 && o.pct <= 1 && o.pct !== 0 : pctOk(o.pct))) err(w, `${p}.pct must be a fraction`);
        };
        if (o.who !== undefined && !has('runWho', o.who)) err(w, `${p}: bad who "${o.who}"`);
        switch (o.op) {
          case 'gold': case 'ink': npct(true); break;
          case 'heal': case 'hurt': npct(false); break;
          case 'maxHp': if (!isInt(o.n) || o.n === 0) err(w, `${p}: maxHp needs a non-zero whole n`); break;
          case 'addCard':
            if ((o.card === undefined) === (o.pool === undefined)) err(w, `${p}: addCard needs exactly one of card or pool`);
            if (o.card !== undefined && !isStr(o.card)) err(w, `${p}.card`);
            if (o.pool !== undefined && o.pool !== 'party' && !has('heroIds', o.pool)) err(w, `${p}: bad pool "${o.pool}"`);
            if (o.rarity !== undefined && ['common', 'uncommon', 'rare'].indexOf(o.rarity) < 0) err(w, `${p}: bad rarity "${o.rarity}"`);
            if (o.card !== undefined && o.rarity !== undefined) err(w, `${p}: rarity only applies with pool`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            if (o.up !== undefined && !isBool(o.up)) err(w, `${p}.up must be a boolean`);
            break;
          case 'removeCard': case 'upgradeCard': case 'transformCard': case 'duplicateCard':
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            if (o.random !== undefined && !isBool(o.random)) err(w, `${p}.random must be a boolean`);
            if (o.filter !== undefined) { if (!isObj(o.filter)) err(w, `${p}.filter must be an object`); else { Object.keys(o.filter).forEach((k) => { if (['type', 'hero'].indexOf(k) < 0) err(w, `${p}.filter: unknown key "${k}"`); }); if (o.filter.type !== undefined && !has('cardTypes', o.filter.type)) err(w, `${p}.filter.type`); if (o.filter.hero !== undefined && !has('heroIds', o.filter.hero)) err(w, `${p}.filter.hero`); } }
            break;
          case 'addRelic':
            if ((o.id === undefined) === (o.rarity === undefined)) err(w, `${p}: addRelic needs exactly one of id or rarity`);
            if (o.id !== undefined && !isStr(o.id)) err(w, `${p}.id`);
            if (o.rarity !== undefined && !has('relicRarities', o.rarity)) err(w, `${p}: bad rarity "${o.rarity}"`);
            break;
          case 'addGem':
            if (o.id !== undefined && (o.color !== undefined || o.tier !== undefined)) err(w, `${p}: addGem takes an id or color/tier, not both`);
            if (o.id !== undefined && !isStr(o.id)) err(w, `${p}.id`);
            if (o.color !== undefined && !has('gemColors', o.color)) err(w, `${p}: bad color "${o.color}"`);
            if (o.tier !== undefined && [1, 2, 3].indexOf(o.tier) < 0) err(w, `${p}: bad tier`);
            break;
          case 'addBrush': if (!isStr(o.id)) err(w, `${p}: addBrush needs an id or 'random'`); else if (o.id !== 'random' && !brushes[o.id]) err(w, `${p}: unknown brush "${o.id}"`); break;
          case 'addCurse':
            if (o.id !== undefined && !(isStr(o.id) && /^curse_/.test(o.id))) err(w, `${p}: addCurse id must be a curse_* id`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            break;
          case 'fight':
            if (ctx !== 'event') err(w, `${p}: fight is only legal in an event outcome`);
            else if (i !== ops.length - 1) err(w, `${p}: fight must be the last op of its outcome`);
            if ((o.enc === undefined) === (o.enemies === undefined)) err(w, `${p}: fight needs exactly one of enc or enemies`);
            if (o.enc !== undefined && !isStr(o.enc)) err(w, `${p}.enc`);
            if (o.enemies !== undefined && !(Array.isArray(o.enemies) && o.enemies.length >= 1 && o.enemies.length <= 4 && o.enemies.every(isStr))) err(w, `${p}.enemies must list 1..4 enemy ids`);
            if (o.tier !== undefined && ['normal', 'elite'].indexOf(o.tier) < 0) err(w, `${p}: fight tier must be normal or elite`);
            if (o.rewards !== undefined && !isBool(o.rewards)) err(w, `${p}.rewards must be a boolean`);
            if (o.win !== undefined) vRun(w, o.win, 'win', p + '.win');
            break;
          case 'flag': if (!isStr(o.k)) err(w, `${p}: flag needs k`); if (o.v !== undefined && !isNum(o.v)) err(w, `${p}.v must be a number`); break;
          case 'paint': if (!(isInt(o.n) && o.n >= 1 && o.n <= 12)) err(w, `${p}: paint needs n 1..12`); break;
          case 'cardReward':
            if (o.rarity !== undefined && ['common', 'uncommon', 'rare'].indexOf(o.rarity) < 0) err(w, `${p}: bad rarity`);
            if (o.hero !== undefined && o.hero !== 'party' && !has('heroIds', o.hero)) err(w, `${p}: bad hero`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            break;
          default: break;
        }
      });
    };

    // ---- hook lists: relic hooks, hero passives, enemy hooks ----
    const vHooks = (w, list, path, kind) => {
      if (!Array.isArray(list)) return err(w, `${path} must be an array`);
      list.forEach((h, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(h) || !isStr(h.on)) return err(w, `${p}: hook needs "on"`);
        Object.keys(h).forEach((k) => { if (['id', 'name', 'on', 'filter', 'limit', 'once', 'every', 'fx'].indexOf(k) < 0) err(w, `${p}: unknown field "${k}"`); });
        if (kind === 'enemy') { vHookMeta(w, h, p, 'enemyHooks', true); vOps(w, h.fx, 'enemy', p + '.fx'); return; }
        const run = has('runHooks', h.on);
        if (!run && !has('combatHooks', h.on)) return err(w, `${p}: unknown hook "${h.on}"`);
        if (kind === 'passive' && run) err(w, `${p}: a hero passive must use a combat hook`);
        vHookMeta(w, h, p, run ? 'runHooks' : 'combatHooks', false);
        if (run) vRun(w, h.fx, 'hook', p + '.fx'); else vOps(w, h.fx, 'hook', p + '.fx');
      });
    };
    const vMods = (w, mods, list, kindList, path) => {
      if (!isObj(mods)) return err(w, `${path} must be an object`);
      if (!Object.keys(mods).length) err(w, `${path} is empty`);
      Object.keys(mods).forEach((k) => {
        if (LISTS[list].indexOf(k) < 0) return err(w, `${path}: unknown mod "${k}"`);
        if (!isNum(mods[k]) || mods[k] === 0) return err(w, `${path}.${k} must be a non-zero number`);
        const kind = LISTS[kindList][k];
        if (kind === 'int' && !isInt(mods[k])) err(w, `${path}.${k} is a count and must be a whole number`);
        if (kind === 'frac' && (mods[k] < -0.9 || mods[k] > 2)) err(w, `${path}.${k} is a fraction and must be within -0.9..2`);
      });
    };

    // ---- heroes ----
    if (want('heroes')) {
      LISTS.heroIds.forEach((id) => {
        const h = heroes[id]; const w = 'hero ' + id;
        if (!h) return err(w, 'missing');
        if (!isNum(h.maxHp) || h.maxHp < 30) err(w, 'maxHp');
        if (!statuses[h.res] || statuses[h.res].kind !== 'resource') err(w, 'res must be a resource status');
        Object.keys(h.rows).forEach((r) => { if (['front', 'back'].indexOf(r) < 0) err(w, `rows.${r}`); Object.keys(h.rows[r]).forEach((f) => { if (!has('rowFields', f)) err(w, `rows.${r}.${f} unknown`); }); });
        vHooks(w, h.passives, 'passives', 'passive');
        if (!Array.isArray(h.starter) || h.starter.length !== 5) err(w, 'starter must list exactly 5 card ids');
      });
    }

    // ---- cards ----
    if (want('cards')) {
      const shared = (c) => c.hero === 'curse' || c.hero === 'status';
      const inScope = (c) => !opt.hero || c.hero === opt.hero || (opt.hero === 'shared' && shared(c));
      vals(D.cards).filter(inScope).forEach((c) => {
        const w = 'card ' + c.id;
        const playable = c.type !== 'curse' && c.type !== 'status' && c.rarity !== 'token';
        fields(w, c, 'card');
        if (!ID_RE.test(c.id)) err(w, 'id must be snake_case');
        if (!isStr(c.name)) err(w, 'name');
        if (!has('cardTypes', c.type)) err(w, 'type');
        if (!has('rarities', c.rarity)) err(w, 'rarity');
        if (c.hero !== 'curse' && c.hero !== 'status' && !has('heroIds', c.hero)) err(w, `hero "${c.hero}" (use a hero id, or curse or status)`);
        else if (c.rarity === 'token' && !shared(c)) { if (c.id.indexOf(c.hero + '_tok_') !== 0) err(w, `token ids look like ${c.hero}_tok_<name>`); } else if (c.id.indexOf(c.hero + '_') !== 0) err(w, `id must start with "${c.hero}_"`);
        if (c.hero === 'curse' && (c.type !== 'curse' || c.rarity !== 'token')) err(w, 'curse cards are type curse and rarity token');
        if (c.hero === 'status' && (c.type !== 'status' || c.rarity !== 'token')) err(w, 'status cards are type status and rarity token');
        if (c.type === 'curse' && A(c.kw).indexOf('unplayable') < 0) err(w, 'curses are unplayable');
        if (c.cost !== undefined && !(c.cost === 'X' || (isInt(c.cost) && c.cost >= 0 && c.cost <= 5))) err(w, 'cost must be 0..5 or "X"');
        if (c.cost === undefined && playable) err(w, 'cost is required');
        if (c.text !== undefined) err(w, 'card text is generated from fx: remove `text`');
        const env = { cost: c.cost };
        vOps(w, isArr(c.fx) || c.fx === undefined ? A(c.fx) : c.fx, 'card', 'fx', env);
        if (playable && !A(c.fx).length) err(w, 'a playable card needs fx');
        if (c.up !== undefined) {
          if (!isObj(c.up)) err(w, 'up must be an object');
          else {
            Object.keys(c.up).forEach((k) => { if (['fx', 'cost', 'kw'].indexOf(k) < 0) err(w, `up.${k} unknown (up may change fx, cost, kw)`); });
            const upEnv = { cost: c.up.cost !== undefined ? c.up.cost : c.cost };
            if (c.up.fx) vOps(w, c.up.fx, 'card', 'up.fx', upEnv);
            if (c.up.cost !== undefined && !(c.up.cost === 'X' || (isInt(c.up.cost) && c.up.cost >= 0 && c.up.cost <= 5))) err(w, 'up.cost must be 0..5 or "X"');
            if (c.up.kw !== undefined) { if (!Array.isArray(c.up.kw)) err(w, 'up.kw must be an array (it REPLACES kw)'); else c.up.kw.forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}" in up.kw`); }); }
            if (playable && !c.up.fx && c.up.cost === undefined && c.up.kw === undefined) err(w, 'up must change fx, cost or kw');
            if (c.cost === 'X' && c.up.cost !== undefined && c.up.cost !== 'X' && !c.up.fx) err(w, 'up.cost turns an X card into a fixed cost: up.fx is required (per X is illegal there)');
          }
        } else if (playable) err(w, 'missing up (every playable non-token card needs an upgrade)');
        A(c.kw).forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}"`); });
        A(c.slots).forEach((s) => { if (!has('slotColors', s)) err(w, `bad slot colour "${s}"`); });
        if (A(c.slots).length > 3) err(w, 'at most 3 slots');
        if (!isObj(c.art) || !has('motifs', c.art.m)) err(w, `art.m "${c.art && c.art.m}" not in LISTS.motifs`);
        else {
          if (c.rarity !== 'token' && !c.art.c) err(w, 'art.c is required (the unique art pair rule needs it)');
          if (c.art.c && !has('palettes', c.art.c)) err(w, `art.c "${c.art.c}" not in LISTS.palettes`);
          if (c.art.hero !== undefined && !isBool(c.art.hero)) err(w, 'art.hero must be a boolean');
        }
        if (c.hand !== undefined) {
          if (!isObj(c.hand)) err(w, 'hand must be an object');
          else Object.keys(c.hand).forEach((k) => { if (['turnEnd', 'drawn'].indexOf(k) < 0) err(w, `hand.${k} unknown`); else vOps(w, c.hand[k], 'hand', 'hand.' + k); });
        }
        if (c.locked !== undefined && !isBool(c.locked)) err(w, 'locked must be a boolean');
        if (c.locked && (c.rarity === 'starter' || c.rarity === 'common')) err(w, 'starters and commons are never locked');
        if (c.flavor !== undefined && !isStr(c.flavor)) err(w, 'flavor must be a string');
        const flat = [];
        D.walkOps(c.fx, (o) => flat.push(o));
        if (c.type === 'attack' && !flat.some((o) => o.op === 'dmg')) warn(w, 'attack card has no dmg op');
        if (c.type === 'power' && !flat.some((o) => o.op === 'hook' || o.op === 'status')) warn(w, 'power has no hook or status op');
        A(c.slots).forEach((s) => {
          if (s === 'red' && !flat.some((o) => o.op === 'dmg')) warn(w, 'red slot but no dmg op');
          if (s === 'blue' && !flat.some((o) => ['block', 'heal', 'status'].indexOf(o.op) >= 0)) warn(w, 'blue slot but no block, heal or status op');
        });
        noDash(w, c);
      });
      // a hero owner checks their own starters; the integration wave (strict) checks everyone's
      LISTS.heroIds.forEach((id) => {
        if (!strict && opt.hero !== id) return;
        new Set(heroes[id].starter).forEach((cid) => { if (!D.cards[cid]) err('hero ' + id, `starter card "${cid}" is not defined`); });
      });
      if (strict) {
        FIXED.curses.forEach((id) => { const c = D.cards[id]; if (!c) err('fixed', `curse card "${id}" is not defined`); else if (c.hero !== 'curse') err('card ' + id, 'must have hero curse'); });
        FIXED.statusCards.forEach((id) => { const c = D.cards[id]; if (!c) err('fixed', `status card "${id}" is not defined`); else if (c.hero !== 'status') err('card ' + id, 'must have hero status'); });
      }
    }

    // ---- gems ----
    if (want('gems')) {
      vals(D.gems).forEach((g) => {
        const w = 'gem ' + g.id;
        fields(w, g, 'gem');
        if (!ID_RE.test(g.id)) err(w, 'id must be snake_case');
        if (!isStr(g.name)) err(w, 'name');
        if (!has('gemColors', g.color)) err(w, 'color');
        if ([1, 2, 3].indexOf(g.tier) < 0) err(w, 'tier must be 1..3');
        if (!isObj(g.art) || !has('gemCuts', g.art.cut)) err(w, 'art.cut');
        if (g.text !== undefined && !isStr(g.text)) err(w, 'text must be a string when given (it is generated by default)');
        if (g.locked !== undefined && !isBool(g.locked)) err(w, 'locked must be a boolean');
        if (!isObj(g.mod) || !Object.keys(g.mod).length) return err(w, 'mod must be a non-empty object');
        const m = g.mod;
        Object.keys(m).forEach((k) => { if (!has('gemModKeys', k)) err(w, `mod.${k} unknown`); });
        ['dmg', 'block', 'heal', 'hits', 'draw', 'energy', 'poison'].forEach((k) => { if (m[k] !== undefined && !(isInt(m[k]) && m[k] > 0)) err(w, `mod.${k} must be a positive whole number`); });
        if (m.cost !== undefined && !(isInt(m.cost) && m.cost < 0 && g.tier === 3)) err(w, 'mod.cost must be a negative whole number and tier 3 only');
        if (m.status !== undefined) {
          if (!isObj(m.status) || !D.isStatus(m.status.s)) err(w, 'mod.status.s unknown status');
          else {
            Object.keys(m.status).forEach((k) => { if (['s', 'n', 'tgt'].indexOf(k) < 0) err(w, `mod.status.${k} unknown`); });
            if (!isInt(m.status.n) || m.status.n === 0) err(w, 'mod.status.n must be a non-zero whole number');
            if (m.status.tgt !== undefined && !['heroTgt', 'enemyCardTgt'].some((l) => has(l, m.status.tgt))) err(w, 'mod.status.tgt');
          }
        }
        if (m.fx !== undefined) vOps(w, m.fx, 'gem', 'mod.fx');
        ['kw', 'kwRemove'].forEach((k) => { if (m[k] !== undefined) { if (!Array.isArray(m[k])) err(w, `mod.${k} must be an array`); else m[k].forEach((x) => { if (!has('cardKw', x)) err(w, `mod.${k} unknown keyword "${x}"`); }); } });
        if (m.cond !== undefined && ['front', 'back'].indexOf(m.cond) < 0) err(w, 'mod.cond must be front or back');
        noDash(w, g);
      });
    }

    // ---- relics ----
    if (want('relics')) {
      vals(D.relics).forEach((r) => {
        const w = 'relic ' + r.id;
        fields(w, r, 'relic');
        if (!ID_RE.test(r.id)) err(w, 'id must be snake_case');
        if (!isStr(r.name)) err(w, 'name');
        if (!isStr(r.text)) err(w, 'text'); else if (r.text.length > QUOTA.relics.textMax) err(w, `text over ${QUOTA.relics.textMax} characters`);
        if (!has('relicRarities', r.rarity)) err(w, 'rarity');
        if (!isObj(r.art) || !has('relicIcons', r.art.m)) err(w, `art.m "${r.art && r.art.m}" not in LISTS.relicIcons`);
        else if (r.art.c && !has('palettes', r.art.c)) err(w, 'art.c not in LISTS.palettes');
        if (r.mods !== undefined) vMods(w, r.mods, 'mods', 'modKind', 'mods');
        if (r.hooks !== undefined) vHooks(w, r.hooks, 'hooks', 'relic');
        if (r.rows !== undefined) {
          if (!isObj(r.rows)) err(w, 'rows must be an object');
          else Object.keys(r.rows).forEach((row) => { if (['front', 'back'].indexOf(row) < 0) err(w, `rows.${row}`); else cmp(w, r.rows[row], `rows.${row}`, LISTS.rowFields, true); });
        }
        if (r.hero !== undefined && !has('heroIds', r.hero)) err(w, 'hero');
        if (r.locked !== undefined && !isBool(r.locked)) err(w, 'locked must be a boolean');
        if (!r.mods && !r.hooks && !r.rows) err(w, 'needs mods, hooks or rows');
        noDash(w, r);
      });
      if (strict) Object.keys(FIXED.relics).forEach((id) => { const r = D.relics[id]; if (!r) err('fixed', `relic "${id}" is not defined`); else if (r.rarity !== FIXED.relics[id]) err('relic ' + id, `must be rarity ${FIXED.relics[id]}`); });
    }

    // ---- enemies and encounters ----
    if (want('enemies')) {
      const chOk = (ch) => !opt.chapter || ch === opt.chapter;
      const ckAi = (w, e, ai, where) => {
        if (!isObj(ai)) return err(w, `${where} must be an object`);
        Object.keys(ai).forEach((k) => { if (['open', 'seq', 'weighted', 'noRepeat', 'rules'].indexOf(k) < 0) err(w, `${where}: unknown key "${k}"`); });
        if (Array.isArray(ai.seq) === Array.isArray(ai.weighted)) err(w, `${where} needs exactly one of seq or weighted`);
        if (Array.isArray(ai.seq) && !ai.seq.length) err(w, `${where}.seq is empty`);
        if (Array.isArray(ai.weighted)) {
          if (!ai.weighted.length) err(w, `${where}.weighted is empty`);
          ai.weighted.forEach((x, i) => { if (!Array.isArray(x) || x.length !== 2 || !isNum(x[1]) || x[1] <= 0) err(w, `${where}.weighted[${i}] must be [move, weight > 0]`); });
        }
        if (ai.noRepeat !== undefined && !(isInt(ai.noRepeat) && ai.noRepeat >= 1)) err(w, `${where}.noRepeat must be an integer >= 1`);
        if (ai.noRepeat !== undefined && !ai.weighted) err(w, `${where}.noRepeat only applies to weighted`);
        if (ai.open !== undefined && !Array.isArray(ai.open)) err(w, `${where}.open must be an array`);
        if (ai.rules !== undefined && !Array.isArray(ai.rules)) err(w, `${where}.rules must be an array`);
        const refs = [].concat(A(ai.open), A(ai.seq), A(ai.weighted).map((x) => x && x[0]), A(ai.rules).map((r) => r && r.do));
        refs.forEach((m) => { if (!isStr(m) || !e.moves[m]) err(w, `${where} references unknown move "${m}"`); });
        A(ai.rules).forEach((r, i) => {
          if (!isObj(r)) return err(w, `${where}.rules[${i}] must be an object`);
          Object.keys(r).forEach((k) => { if (['if', 'do', 'once'].indexOf(k) < 0) err(w, `${where}.rules[${i}]: unknown key "${k}"`); });
          vCond(w, r.if, `${where}.rules[${i}].if`, 'ai');
          if (r.once !== undefined && !isBool(r.once)) err(w, `${where}.rules[${i}].once must be a boolean`);
        });
      };
      vals(D.enemies).filter((e) => chOk(e.chapter)).forEach((e) => {
        const w = 'enemy ' + e.id;
        const r = rosterById[e.id];
        fields(w, e, 'enemy');
        if (!ID_RE.test(e.id)) err(w, 'id must be snake_case');
        if (!r) err(w, 'id is not in the fixed roster (CONTENT_SPEC 4)');
        else {
          if (e.chapter !== r.chapter) err(w, `chapter must be ${r.chapter}`);
          if (e.tier !== r.tier) err(w, `tier must be ${r.tier}`);
          if (e.size !== r.size) err(w, `size must be ${r.size}`);
          if (e.name !== r.name) warn(w, `name should be "${r.name}"`);
        }
        if (!isStr(e.name)) err(w, 'name');
        if (e.title !== undefined && !isStr(e.title)) err(w, 'title must be a string');
        if (e.tier === 'boss' && !isStr(e.title)) warn(w, 'a boss should have a title');
        if (!has('chapters', e.chapter)) err(w, 'chapter');
        if (!has('tiers', e.tier)) err(w, 'tier');
        if (!has('sizes', e.size)) err(w, 'size');
        if (!Array.isArray(e.hp) || e.hp.length !== 2 || !isInt(e.hp[0]) || !isInt(e.hp[1]) || e.hp[0] < 1 || e.hp[1] < e.hp[0]) err(w, 'hp must be [min,max] whole numbers');
        if (!isObj(e.moves) || !Object.keys(e.moves).length) return err(w, 'moves');
        Object.keys(e.moves).forEach((mid) => {
          const m = e.moves[mid]; const mw = `${w} move ${mid}`;
          if (!ID_RE.test(mid)) err(mw, 'move id must be snake_case');
          if (!isObj(m)) return err(mw, 'move must be an object');
          Object.keys(m).forEach((k) => { if (['name', 'kind', 'fx', 'say'].indexOf(k) < 0) err(mw, `unknown field "${k}"`); });
          if (!isStr(m.name)) err(mw, 'name');
          if (!has('intents', m.kind)) return err(mw, `kind "${m.kind}"`);
          if (m.say !== undefined && !isStr(m.say)) err(mw, 'say must be a string');
          vOps(mw, isArr(m.fx) || m.fx === undefined ? A(m.fx) : m.fx, 'enemy', 'fx');
          const flat = [];
          D.walkOps(m.fx, (o) => flat.push(o.op));
          if (INTENT_NEEDS[m.kind] && !INTENT_NEEDS[m.kind].some((op) => flat.indexOf(op) >= 0)) err(mw, `kind "${m.kind}" needs a ${INTENT_NEEDS[m.kind].join(' or ')} op (the intent icon must be honest)`);
          if (m.kind === 'none' && flat.length) err(mw, 'kind "none" has no fx');
          if (flat.indexOf('dmg') >= 0 && ATTACKISH.indexOf(m.kind) < 0) warn(mw, 'a move that deals damage should use kind attack, multi or heavy');
        });
        ckAi(w, e, e.ai, 'ai');
        if (e.phases !== undefined) {
          if (!Array.isArray(e.phases)) err(w, 'phases must be an array');
          else e.phases.forEach((p, i) => {
            if (!isObj(p)) return err(w, `phases[${i}] must be an object`);
            Object.keys(p).forEach((k) => { if (['at', 'say', 'fx', 'ai'].indexOf(k) < 0) err(w, `phases[${i}]: unknown key "${k}"`); });
            if (!isNum(p.at) || p.at <= 0 || p.at >= 1) err(w, `phases[${i}].at must be in (0,1)`);
            if (i > 0 && isNum(p.at) && isNum(O(e.phases[i - 1]).at) && p.at >= e.phases[i - 1].at) err(w, 'phases must be sorted by descending at');
            if (p.say !== undefined && !isStr(p.say)) err(w, `phases[${i}].say`);
            if (p.fx !== undefined) vOps(w, p.fx, 'enemy', `phases[${i}].fx`);
            if (p.ai !== undefined) ckAi(w, e, p.ai, `phases[${i}].ai`);
          });
        }
        if (e.start !== undefined) vOps(w, e.start, 'enemy', 'start');
        if (e.hooks !== undefined) vHooks(w, e.hooks, 'hooks', 'enemy');
        if (e.immune !== undefined) { if (!Array.isArray(e.immune)) err(w, 'immune must be an array'); else e.immune.forEach((s) => { if (!D.isStatus(s)) err(w, `immune: unknown status "${s}"`); }); }
        if (!isObj(e.art) || !isStr(e.art.id)) err(w, 'art.id'); else if (e.art.id !== e.id) err(w, 'art.id must equal the enemy id');
        if (!isStr(e.lore)) err(w, 'lore is required (1 to 2 sentences for the bestiary)'); else if (e.lore.length > 260) err(w, 'lore over 260 characters');
        if (!Array.isArray(e.tags) || !e.tags.length) err(w, 'tags needs at least one of LISTS.enemyTags');
        else e.tags.forEach((t) => { if (!has('enemyTags', t)) err(w, `tag "${t}" not in LISTS.enemyTags`); });
        noDash(w, e);
      });
      [1, 2, 3].filter(chOk).forEach((ch) => {
        const p = D.encounters[ch];
        const lim = ch === 1 ? 3 : 4;
        [['normal', p.normal], ['elite', p.elite]].forEach(([kind, groups]) => groups.forEach((g) => {
          if (!isObj(g)) return err('encounter ch' + ch, 'a group must be an object');
          const w = `encounter ch${ch} ${g.id}`;
          if (!isStr(g.id) || g.id.indexOf('ch' + ch + '_') !== 0) err(w, `group id must start with "ch${ch}_"`);
          if (!isNum(g.w) || g.w <= 0) err(w, 'w must be > 0');
          if (!isNum(g.min) || g.min < 0 || g.min > 1) err(w, 'min must be in 0..1');
          if (!Array.isArray(g.enemies) || g.enemies.length < 1 || g.enemies.length > lim) return err(w, `enemies must list 1..${lim} ids`);
          const defs = g.enemies.map((id) => D.enemies[id]);
          g.enemies.forEach((id, i) => {
            if (!defs[i]) { if (strict) err(w, `unknown enemy "${id}"`); return; }
            if (defs[i].chapter !== ch) err(w, `enemy "${id}" belongs to chapter ${defs[i].chapter}`);
            if (defs[i].tier === 'boss') err(w, `enemy "${id}" is a boss`);
            if (kind === 'normal' && defs[i].tier === 'elite') err(w, `enemy "${id}" is an elite in a normal group`);
          });
          if (defs.every(Boolean)) {
            if (kind === 'normal' && !defs.some((d) => d.tier === 'normal')) err(w, 'a normal group needs at least one normal enemy');
            if (kind === 'elite' && defs.filter((d) => d.tier === 'elite').length !== 1) err(w, 'an elite group has exactly one elite');
          }
        }));
        if (p.boss !== undefined) {
          if (p.boss !== FIXED.bosses[ch]) err('encounter ch' + ch, `boss must be "${FIXED.bosses[ch]}"`);
          else if (strict && !D.enemies[p.boss]) err('encounter ch' + ch, `unknown boss "${p.boss}"`);
        } else if (strict) err('encounter ch' + ch, 'boss encounter missing');
      });
      if (strict) [1, 2, 3].filter(chOk).forEach((ch) => ROSTER[ch].forEach((r) => { if (!D.enemies[r.id]) err('roster', `enemy "${r.id}" (chapter ${ch}, ${r.tier}) is not defined`); }));
    }

    // ---- events ----
    if (want('events')) {
      vals(D.events).forEach((ev) => {
        const w = 'event ' + ev.id;
        fields(w, ev, 'event');
        if (!ID_RE.test(ev.id)) err(w, 'id must be snake_case');
        if (!isStr(ev.title) || ev.title.length > 40) err(w, 'title must be 1 to 40 characters');
        if (!isStr(ev.text) || ev.text.length < 60 || ev.text.length > 220) err(w, 'text must be 60 to 220 characters');
        if (!isObj(ev.art) || !has('scenes', ev.art.scene)) err(w, 'art.scene must be in LISTS.scenes');
        if (ev.chapters !== undefined) { if (!Array.isArray(ev.chapters) || !ev.chapters.length) err(w, 'chapters must be a non-empty array (omit it for any chapter)'); else ev.chapters.forEach((n) => { if (!has('chapters', n)) err(w, `chapters has bad value ${n}`); }); }
        if (ev.once !== undefined && !isBool(ev.once)) err(w, 'once must be a boolean');
        if (ev.w !== undefined && !(isNum(ev.w) && ev.w > 0)) err(w, 'w must be a number > 0');
        if (ev.when !== undefined) {
          if (!isObj(ev.when)) err(w, 'when must be an object');
          else {
            Object.keys(ev.when).forEach((k) => { if (!has('whenKeys', k)) err(w, `when: unknown key "${k}"`); });
            if (ev.when.hero !== undefined && !has('heroIds', ev.when.hero)) err(w, 'when.hero');
            if (ev.when.flag !== undefined && !isStr(ev.when.flag)) err(w, 'when.flag');
            if (ev.when.relic !== undefined && !isStr(ev.when.relic)) err(w, 'when.relic');
          }
        }
        if (!Array.isArray(ev.choices) || ev.choices.length < 2 || ev.choices.length > 4) return err(w, 'choices must be 2..4');
        ev.choices.forEach((c, i) => {
          const cp = `choices[${i}]`;
          if (!isObj(c)) return err(w, `${cp} must be an object`);
          Object.keys(c).forEach((k) => { if (FIELDS.choice.indexOf(k) < 0) err(w, `${cp}: unknown field "${k}"`); });
          if (!isStr(c.label)) err(w, `${cp}.label`);
          if (c.cost !== undefined && !isStr(c.cost)) err(w, `${cp}.cost must be a display string`);
          if (c.req !== undefined) {
            if (!isObj(c.req)) err(w, `${cp}.req must be an object`);
            else {
              Object.keys(c.req).forEach((k) => { if (!has('reqKeys', k)) err(w, `${cp}.req: unknown key "${k}"`); });
              ['hpPct', 'hpBelow'].forEach((k) => { if (c.req[k] !== undefined && !(isNum(c.req[k]) && c.req[k] > 0 && c.req[k] <= 1)) err(w, `${cp}.req.${k} must be a fraction in (0,1]`); });
              if (c.req.gold !== undefined && !(isInt(c.req.gold) && c.req.gold > 0)) err(w, `${cp}.req.gold`);
              if (c.req.chapter !== undefined && !has('chapters', c.req.chapter)) err(w, `${cp}.req.chapter`);
              if (c.req.hero !== undefined && !has('heroIds', c.req.hero)) err(w, `${cp}.req.hero`);
              ['relic', 'flag'].forEach((k) => { if (c.req[k] !== undefined && !isStr(c.req[k])) err(w, `${cp}.req.${k}`); });
            }
          }
          if (!Array.isArray(c.out) || !c.out.length) return err(w, `${cp}.out`);
          c.out.forEach((o, j) => {
            const op = `${cp}.out[${j}]`;
            if (!isObj(o)) return err(w, `${op} must be an object`);
            if (!isNum(o.w) || o.w <= 0) err(w, `${op}.w must be a number > 0`);
            if (!isStr(o.text)) err(w, `${op}.text`);
            Object.keys(o).forEach((k) => { if (['w', 'text', 'ops'].indexOf(k) < 0) err(w, `${op}: unknown key "${k}"`); });
            vRun(w, isArr(o.ops) || o.ops === undefined ? A(o.ops) : o.ops, 'event', op + '.ops');
          });
          if (c.cost && !c.out.some((o) => A(o && o.ops).some((x) => x && ['gold', 'hurt', 'maxHp', 'removeCard', 'addCurse', 'heal', 'ink'].indexOf(x.op) >= 0))) warn(w, `${cp} shows a cost but no outcome pays it`);
        });
        noDash(w, ev);
      });
    }

    // ---- achievements, trials, tips, lore ----
    if (want('achievements')) {
      vals(D.achievements).forEach((a) => {
        const w = 'achievement ' + a.id;
        fields(w, a, 'achievement');
        if (!ID_RE.test(a.id)) err(w, 'id must be snake_case');
        if (!isStr(a.name) || !isStr(a.text)) err(w, 'name and text');
        if (!isObj(a.stat) || !has('statKeys', a.stat.k) || !isNum(a.stat.gte) || a.stat.gte <= 0) err(w, 'stat {k in LISTS.statKeys, gte > 0}');
        if (a.reward !== undefined && !(isObj(a.reward) && isInt(a.reward.inkstones) && a.reward.inkstones > 0)) err(w, 'reward must be {inkstones: whole number > 0}');
        noDash(w, a);
      });
      if (strict) {
        LISTS.heroIds.forEach((id) => { const u = heroes[id].unlock; if (u && !D.achievements[u.ach]) err('hero ' + id, `unlock achievement "${u.ach}" not defined`); });
        FIXED.achievements.forEach((id) => { if (!D.achievements[id]) err('fixed', `achievement "${id}" is not defined`); });
      }
    }
    if (want('trials')) {
      const seen = {};
      vals(D.trials).forEach((t) => {
        const w = 'trial ' + t.id;
        fields(w, t, 'trial');
        if (!isInt(t.level) || t.level < 1 || t.level > 10) err(w, 'level must be 1..10'); else { if (seen[t.level]) err(w, `level ${t.level} defined twice`); seen[t.level] = true; if (t.id !== 'trial_' + t.level) err(w, `id must be trial_${t.level}`); }
        if (!isStr(t.name) || !isStr(t.text)) err(w, 'name and text');
        vMods(w, t.mods, 'trialMods', 'trialModKind', 'mods');
        noDash(w, t);
      });
    }
    if (want('tips')) {
      D.tips.forEach((t, i) => {
        const w = 'tips[' + i + ']';
        if (!isStr(t)) err(w, 'must be a string'); else if (t.length > 110) err(w, 'over 110 characters'); else if (DASH.test(t)) err(w, 'contains an em or en dash');
      });
    }
    if (want('lore')) {
      vals(D.lore).forEach((l) => {
        const w = 'lore ' + l.id;
        if (!ID_RE.test(l.id)) err(w, 'id must be snake_case');
        if (/^barks_/.test(l.id)) {
          if (!has('heroIds', l.id.slice(6))) err(w, 'barks_<heroId>');
          Object.keys(O(l.lines)).forEach((k) => { if (FIXED.barkKeys.indexOf(k) < 0) err(w, `lines.${k} unknown`); });
          FIXED.barkKeys.forEach((k) => {
            const a = l.lines && l.lines[k];
            if (!Array.isArray(a) || a.length !== 5) err(w, `lines.${k} needs exactly 5 strings`);
            else a.forEach((s) => { if (!isStr(s) || s.length > 64) err(w, `lines.${k}: each line is a string of at most 64 characters`); });
          });
        } else if (!isStr(l.title) || !isStr(l.text) || l.title.length > 40) err(w, 'title (at most 40 characters) and text');
        if (l.text !== undefined && isStr(l.text) && l.text.length > 700) err(w, 'text over 700 characters');
        noDash(w, l);
      });
      if (strict) FIXED.lore.forEach((id) => { if (!D.lore[id]) err('fixed', `lore "${id}" is not defined`); });
    }

    // ---- cross-file references (strict only) ----
    if (strict && !only) {
      const groupIds = {};
      [1, 2, 3].forEach((ch) => D.encounters[ch].normal.concat(D.encounters[ch].elite).forEach((g) => { groupIds[O(g).id] = true; }));
      const chk = (w, ops, ctx) => D.walkOps(ops, (o) => {
        if (o.op === 'add') {
          const c = D.cards[o.card];
          if (!c) err(w, `add: unknown card "${o.card}"`);
          else if (ctx === 'enemy' && c.hero !== 'curse' && c.hero !== 'status') err(w, `add: enemy ops may only add curse or status cards ("${o.card}")`);
        }
        if (o.op === 'summon') { const s = D.enemies[o.enemy]; if (!s) err(w, `summon: unknown enemy "${o.enemy}"`); else if (s.tier !== 'minion') err(w, `summon: "${o.enemy}" is not a minion`); }
      });
      const chkRun = (w, ops) => A(ops).forEach((o) => {
        if (!isObj(o)) return;
        if (o.op === 'addRelic' && o.id && !D.relics[o.id]) err(w, `addRelic: unknown relic "${o.id}"`);
        if (o.op === 'addCard' && o.card) { const c = D.cards[o.card]; if (!c) err(w, `addCard: unknown card "${o.card}"`); else if (c.hero === 'curse') err(w, 'addCard: use addCurse for curse cards'); }
        if (o.op === 'addGem' && o.id && !D.gems[o.id]) err(w, `addGem: unknown gem "${o.id}"`);
        if (o.op === 'addCurse' && o.id && !(D.cards[o.id] && D.cards[o.id].hero === 'curse')) err(w, `addCurse: unknown curse "${o.id}"`);
        if (o.op === 'fight') {
          A(o.enemies).forEach((id) => { if (!D.enemies[id]) err(w, `fight: unknown enemy "${id}"`); });
          if (o.enc && !groupIds[o.enc]) err(w, `fight: unknown enc "${o.enc}"`);
          chkRun(w, o.win);
        }
      });
      vals(D.cards).forEach((c) => { const w = 'card ' + c.id; chk(w, c.fx, 'card'); chk(w, c.up && c.up.fx, 'card'); Object.keys(O(c.hand)).forEach((k) => chk(w, c.hand[k], 'card')); });
      vals(D.gems).forEach((g) => chk('gem ' + g.id, g.mod && g.mod.fx, 'card'));
      vals(D.enemies).forEach((e) => {
        const w = 'enemy ' + e.id;
        Object.keys(O(e.moves)).forEach((m) => chk(w, O(e.moves[m]).fx, 'enemy'));
        chk(w, e.start, 'enemy'); A(e.phases).forEach((p) => chk(w, O(p).fx, 'enemy')); A(e.hooks).forEach((h) => chk(w, O(h).fx, 'enemy'));
      });
      vals(D.relics).forEach((r) => A(r.hooks).forEach((h) => { if (!isObj(h)) return; if (has('runHooks', h.on)) chkRun('relic ' + r.id, h.fx); else chk('relic ' + r.id, h.fx, 'card'); }));
      LISTS.heroIds.forEach((id) => A(heroes[id].passives).forEach((h) => chk('hero ' + id, O(h).fx, 'card')));
      vals(D.events).forEach((ev) => {
        const w = 'event ' + ev.id;
        if (ev.when && ev.when.relic && !D.relics[ev.when.relic]) err(w, `when.relic unknown "${ev.when.relic}"`);
        A(ev.choices).forEach((c) => { if (!isObj(c)) return; if (c.req && c.req.relic && !D.relics[c.req.relic]) err(w, `req.relic unknown "${c.req.relic}"`); A(c.out).forEach((o) => chkRun(w, O(o).ops)); });
      });
      vals(D.trials).forEach((t) => { const need = t.mods && t.mods.curses; if (need && !FIXED.curses.every((id) => D.cards[id])) err('trial ' + t.id, 'curses mod needs the curse_* cards'); });
    }

    const counts = {};
    REG.forEach((k) => { counts[k] = Array.isArray(D[k]) ? D[k].length : Object.keys(D[k]).length; });
    counts.groups = [1, 2, 3].reduce((n, ch) => n + D.encounters[ch].normal.length + D.encounters[ch].elite.length, 0);
    return { errors, warnings, counts };
  };

  // ------------------------------------------------------------------
  // Audit: quotas (CONTENT_SPEC 3 to 6) and guidelines (the enemy number tables). Returns strings.
  // 'audit ...' lines are hard quota breaks the integration wave fails on; 'guide ...' lines are
  // soft numeric guidance the balance wave tunes. DATA.audit(kind, {hero, chapter}) scopes it.
  // ------------------------------------------------------------------
  D.audit = (kind, opt) => {
    opt = opt || {};
    const out = [];
    const want = (k) => !kind || kind === k;
    const need = (who, ok, msg) => { if (!ok) out.push(`audit ${who}: ${msg}`); };
    const soft = (who, ok, msg) => { if (!ok) out.push(`guide ${who}: ${msg}`); };
    const flatOf = (fx) => { const f = []; D.walkOps(fx, (o) => f.push(o)); return f; };
    const n1 = (v) => (isNum(v) ? v : isObj(v) && isNum(v.base) ? v.base : 0);
    const count = (list, f) => list.filter(f).length;

    if (want('cards')) {
      LISTS.heroIds.filter((id) => !opt.hero || id === opt.hero).forEach((id) => {
        const q = QUOTA.cards;
        const cs = vals(D.cards).filter((c) => c.hero === id && c.rarity !== 'token');
        const nr = (r) => count(cs, (c) => c.rarity === r);
        const nt = (t) => count(cs, (c) => c.type === t);
        need(id, nr('starter') === q.starter && nr('common') === q.common && nr('uncommon') === q.uncommon && nr('rare') === q.rare,
          `need ${q.starter}/${q.common}/${q.uncommon}/${q.rare} starter/common/uncommon/rare, have ${nr('starter')}/${nr('common')}/${nr('uncommon')}/${nr('rare')}`);
        need(id, nt('attack') >= cs.length * 0.3 && nt('skill') >= cs.length * 0.3, 'attack or skill share under 30 percent');
        need(id, nt('power') >= q.powers, `fewer than ${q.powers} powers`);
        need(id, cs.some((c) => c.cost === 'X'), 'no X cost card');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.op === 'cond' && o.if && o.if.row)) >= 3, 'fewer than 3 cards using cond on row');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.tgt === 'ally' || o.tgt === 'both' || (isObj(o.n) && o.n.who === 'ally'))) >= 4, 'fewer than 4 cards touching the ally hero');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.op === 'pick')) >= 2, 'fewer than 2 pick cards');
        need(id, count(cs, (c) => A(c.kw).length > 0) >= 5, 'fewer than 5 cards with keywords');
        need(id, !cs.some((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')), 'a starter or common is locked');
        need(id, count(cs, (c) => c.locked && c.rarity === 'uncommon') <= q.lockedUncommon && count(cs, (c) => c.locked && c.rarity === 'rare') <= q.lockedRare, 'too many locked cards');
        const pairs = cs.map((c) => (c.art ? c.art.m + '/' + c.art.c : '?'));
        need(id, new Set(pairs).size === pairs.length, 'two cards share the same art.m plus art.c pair');
        Object.keys(q.slots).forEach((col) => need(id, count(cs, (c) => A(c.slots).indexOf(col) >= 0) >= q.slots[col], `fewer than ${q.slots[col]} cards with a ${col} slot`));
        need(id, cs.every((c) => { const n = A(c.slots).length; return c.rarity === 'uncommon' ? n >= 1 && n <= 2 : c.rarity === 'rare' ? n === 2 : n === 1; }), 'slot counts: starters and commons 1, uncommons 1 to 2, rares 2');
        need(id, count(cs, (c) => c.rarity === 'rare' && A(c.slots).indexOf('any') >= 0) <= 4, 'more than 4 rares with a prism slot');
        need(id, cs.filter((c) => c.type === 'power').every((c) => A(c.slots).indexOf('gold') >= 0), 'every power needs a gold slot');
        need(id, cs.filter((c) => c.rarity === 'rare').every((c) => isStr(c.flavor)), 'every rare needs a flavor line');
        need(id, count(cs, (c) => c.type === 'attack' && c.art && c.art.hero) >= nt('attack') * 0.3, 'art.hero on too few attacks (use it on about half of them)');
        if (D.cardPlain) cs.forEach((c) => { if (D.cardPlain(c.id).length > 110) out.push(`audit ${id}: ${c.id} rules text over 110 characters`); });
      });
    }

    if (want('enemies')) {
      [1, 2, 3].filter((ch) => !opt.chapter || ch === opt.chapter).forEach((ch) => {
        const q = QUOTA.enemies, w = 'ch' + ch;
        const es = vals(D.enemies).filter((e) => e.chapter === ch);
        ['normal', 'elite', 'minion', 'boss'].forEach((t) => need(w, count(es, (e) => e.tier === t) === q[t], `need exactly ${q[t]} ${t} enemies`));
        const p = D.encounters[ch];
        need(w, p.normal.length >= q.normalGroups, `need at least ${q.normalGroups} normal groups, have ${p.normal.length}`);
        need(w, p.elite.length === q.eliteGroups, `need exactly ${q.eliteGroups} elite groups, have ${p.elite.length}`);
        need(w, count(p.normal, (g) => O(g).min <= 0.1) >= 3 && count(p.normal, (g) => O(g).min >= 0.6) >= 2, 'group min values must spread from 0 to 0.8 (3 at <= 0.1, 2 at >= 0.6)');
        need(w, p.boss === FIXED.bosses[ch], 'boss encounter');
        const moves = (e) => Object.keys(O(e.moves)).map((k) => e.moves[k]).filter(isObj);
        const ops = (e) => [].concat(...moves(e).map((m) => flatOf(m.fx)), flatOf(e.start), ...A(e.phases).filter(isObj).map((ph) => flatOf(ph.fx)));   // filter first: spreading a holey array yields undefined
        const field = es.filter((e) => e.tier !== 'minion');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'dmg' && (o.tgt === 'back' || o.tgt === 'both'))) >= 2, 'fewer than 2 enemies striking the back row or all heroes');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'status' && D.isDebuff(o.s) && (o.tgt === undefined || LISTS.enemyHeroTgt.indexOf(o.tgt) >= 0))) >= 2, 'fewer than 2 enemies that debuff heroes');
        need(w, count(es, (e) => ops(e).some((o) => o.op === 'summon')) >= 1, 'no summoner');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'status' && (o.s === 'thorns' || o.s === 'plating') && (o.tgt === undefined || o.tgt === 'self'))) >= 1, 'no enemy with Thorns or Plating');
        need(w, count(field, (e) => moves(e).some((m) => m.kind === 'multi' || flatOf(m.fx).some((o) => o.op === 'dmg' && n1(o.hits) >= 2))) >= 2, 'fewer than 2 multi-hitters');
        need(w, count(es, (e) => ops(e).some((o) => o.op === 'add')) >= 1, 'no enemy that adds junk cards');
        es.filter((e) => e.tier === 'elite').forEach((e) => need(w, ((e.ai && e.ai.rules && e.ai.rules.length) || (e.phases && e.phases.length)), `${e.id}: an elite needs a rules entry or a phase`));
        es.filter((e) => e.tier === 'boss').forEach((e) => {
          need(w, e.ai && e.ai.open && e.ai.open.length && e.ai.rules && e.ai.rules.length, `${e.id}: a boss uses open and rules`);
          need(w, A(e.phases).length === q.bossPhases[ch], `${e.id}: needs exactly ${q.bossPhases[ch]} phases entries`);
          need(w, A(e.phases).every((ph) => isStr(O(ph).say)), `${e.id}: every phase needs a say line`);
          need(w, ops(e).some((o) => o.op === 'summon'), `${e.id}: a boss summons minions`);
        });
        // guidelines
        const avgDmg = (e) => {
          const dmg = (m) => flatOf(m.fx).filter((o) => o.op === 'dmg').reduce((s, o) => s + n1(o.n) * Math.max(1, n1(o.hits)), 0);
          const ai = e.ai || {};
          if (Array.isArray(ai.weighted) && ai.weighted.length) { const ws = ai.weighted.filter(isArr2), tot = ws.reduce((s, x) => s + x[1], 0); return tot > 0 ? ws.reduce((s, x) => s + (isObj(O(e.moves)[x[0]]) ? dmg(e.moves[x[0]]) : 0) * x[1] / tot, 0) : 0; }
          const seq = A(ai.seq); return seq.length ? seq.reduce((s, m) => s + (isObj(O(e.moves)[m]) ? dmg(e.moves[m]) : 0), 0) / seq.length : 0;
        };
        es.forEach((e) => {
          const g = GUIDE.hp[ch][e.tier];
          if (g && isArr2(e.hp)) soft(e.id, e.hp[0] >= g[0] && e.hp[1] <= g[1], `hp ${e.hp[0]} to ${e.hp[1]} outside ${g[0]} to ${g[1]}`);
          const cap = e.tier === 'minion' ? GUIDE.hit[ch].minion[1] : e.tier === 'normal' ? GUIDE.heavy[ch].normal[1] : e.tier === 'boss' ? GUIDE.heavy[ch].boss[1] : null;
          if (cap !== null) soft(e.id, moves(e).every((m) => flatOf(m.fx).every((o) => o.op !== 'dmg' || n1(o.n) <= cap)), `a hit above ${cap}`);
          if (e.tier === 'boss') soft(e.id, avgDmg(e) <= GUIDE.round[ch][1], `average round damage ${Math.round(avgDmg(e))} above ${GUIDE.round[ch][1]}`);
        });
        [['normal', p.normal], ['elite', p.elite]].forEach(([k, groups]) => groups.forEach((g) => {
          const members = A(O(g).enemies).map((id) => D.enemies[id]).filter(Boolean).filter((e) => e.tier !== 'minion');
          const sum = members.reduce((s, e) => s + avgDmg(e), 0), b = GUIDE.budget[ch][k];
          soft(g.id, sum <= b[1], `group average round damage ${Math.round(sum)} above budget ${b[1]}`);
        }));
      });
    }

    if (want('relics')) {
      const q = QUOTA.relics, rs = vals(D.relics);
      ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => need('relics', count(rs, (x) => x.rarity === r) === q[r], `need exactly ${q[r]} ${r} relics, have ${count(rs, (x) => x.rarity === r)}`));
      LISTS.heroIds.forEach((id) => need('relics', count(rs, (x) => x.hero === id) === q.perHero, `need exactly ${q.perHero} relics for ${id}`));
      need('relics', count(rs, (x) => x.locked) <= Math.floor(rs.length * q.lockedFrac), 'more than 30 percent locked');
      need('relics', new Set(rs.map((x) => x.art && x.art.m)).size >= 40, 'art.m must spread over at least 40 different icons');
      const hooksUsed = {}, modsUsed = {};
      rs.forEach((r) => { A(r.hooks).forEach((h) => { const on = O(h).on; hooksUsed[on] = (hooksUsed[on] || 0) + 1; }); Object.keys(O(r.mods)).forEach((k) => { modsUsed[k] = true; }); });
      LISTS.combatHooks.concat(LISTS.runHooks).filter((h) => h !== 'combatEnd').forEach((h) => need('relics', hooksUsed[h] >= 1, `no relic uses the ${h} hook`));
      LISTS.mods.forEach((k) => need('relics', modsUsed[k], `no relic uses the ${k} mod`));
      need('relics', count(rs, (x) => x.rows) >= 2, 'fewer than 2 relics with rows');
      need('relics', count(rs, (x) => A(x.hooks).some((h) => h && h.filter && h.filter.gems)) >= 2, 'fewer than 2 gem-aware relics');
    }

    if (want('gems')) {
      const q = QUOTA.gems, gs = vals(D.gems);
      need('gems', gs.length === q.perColor * 4, `need exactly ${q.perColor * 4} gems, have ${gs.length}`);
      LISTS.gemColors.forEach((c) => need('gems', JSON.stringify(gs.filter((g) => g.color === c).map((g) => g.tier).sort()) === JSON.stringify(q.tiers), `${c} gems need tiers ${q.tiers.join(',')}`));
      need('gems', !gs.some((g) => g.tier === 1 && g.locked), 'tier 1 gems are never locked');
      need('gems', count(gs, (g) => g.locked) >= 4, 'lock some tier 2 and 3 gems (at least 4)');
    }

    if (want('events')) {
      const q = QUOTA.events, evs = vals(D.events);
      [1, 2, 3].forEach((ch) => need('events', count(evs, (e) => e.chapters && e.chapters.length === 1 && e.chapters[0] === ch) >= q.perChapter, `need at least ${q.perChapter} events for chapter ${ch}`));
      need('events', count(evs, (e) => !e.chapters) >= q.any, `need at least ${q.any} events for any chapter`);
      need('events', count(evs, (e) => e.once) <= Math.floor(evs.length * q.onceFrac), 'more than 60 percent of events are once');
      need('events', evs.some((e) => A(e.choices).some((c) => c && c.req && c.req.relic === 'silver_bell')), 'no choice gated by req.relic silver_bell');
      need('events', evs.some((e) => e.when && e.when.flag === 'fox_spared') && evs.some((e) => A(e.choices).some((c) => A(c && c.out).some((o) => A(o && o.ops).some((x) => x && x.op === 'flag' && x.k === 'fox_spared')))), 'the fox_spared flag path is not exercised (a flag op plus an event with when.flag)');
      evs.forEach((e) => {
        const risky = (o) => A(o && o.ops).some((x) => x && (['hurt', 'addCurse', 'fight'].indexOf(x.op) >= 0 || ((x.op === 'gold' || x.op === 'maxHp') && x.n < 0)));
        need('events', A(e.choices).some((c) => c && !c.cost && !A(c.out).some(risky)), `${e.id}: needs at least one safe choice`);
      });
    }

    if (want('meta')) {
      const q = QUOTA;
      need('meta', Object.keys(D.achievements).length === q.achievements, `need exactly ${q.achievements} achievements, have ${Object.keys(D.achievements).length}`);
      need('meta', Object.keys(D.trials).length === q.trials, `need exactly ${q.trials} trials`);
      need('meta', D.tips.length >= q.tips, `need at least ${q.tips} tips, have ${D.tips.length}`);
      FIXED.lore.forEach((id) => need('meta', !!D.lore[id], `lore "${id}" missing`));
    }
    return out;
  };

  return D;
})();
