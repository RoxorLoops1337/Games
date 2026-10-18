// Hocus Vocus data core: registries, closed vocabularies, statuses, keywords,
// economy, heroes, Spells (`brushes`), tiles, the fixed roster, quotas, and the validator.
//
// This file is the machine-readable half of the contract (DESIGN.md is the human
// half, CONTENT_SPEC.md says how much and how strong). Content files
// (data_cards_*.js, data_enemies_*.js, ...) are IIFEs that register into the
// registries below with DATA.add(kind, defs). Nothing here touches the DOM, the
// clock or the banned random call. No em or en dashes.
//
// PUBLIC API
//   Registries   DATA.cards gems relics enemies events achievements trials tips lore
//                DATA.encounters {1|2|3: {normal:[group], elite:[group], boss:'id'}}
//                DATA.heroes brushes tiles statuses keywords ECONOMY SETTINGS LISTS
//                DATA.LINKS (frozen: handle website youtube facebook tiktok instagram support game; empty URL = no button, HV_STORY 5.2)
//                DATA.ROSTER {1|2|3: [{id,name,title?,tier,size,role,chapter}]}, DATA.rosterById
//                DATA.FIXED (ids other modules depend on), DATA.QUOTA, DATA.GUIDE
//                DATA.COLOUR_NAME {colour id: display word} (red reads pink, any reads rainbow)
//   Writing      DATA.add(kind, defs)              defs is an OBJECT KEYED BY ID (an array throws), except
//                                                  kind 'tips' which takes a string or an array of strings
//                DATA.addEncounters(ch, {normal, elite, boss})
//   Lookups      hero(id) card(id) cardsBy({hero,rarity,type}) enemyIds(ch, tier) groupById(id)
//                isStatus(id) isDebuff(id) isBuff(id) isUnlocked(kind, id, unlocked)
//                rewardPool(heroId, rarity, unlocked) relicPool(rarity, unlocked, heroIds)
//                gemPool({tier,color}, unlocked) eligibleGroups(ch, 'normal'|'elite', diff)
//                walkOps(ops, fn)                  visits every op, through cond/repeat/hook nesting
//   Mechanics    mechOf(def, up) -> {fanbase, remix, hype, loop} | null   mechNow(inst, mech, ctx) -> live bonuses   mechKey(inst, ctx)
//                (card mechanics: see "Card mechanics" below the lookups; they also wrap resolveCard, cardHtml and cardPlain)
//   Systems      cardDef(inst | id) isMedley(inst) canMedley(a, b) medleyDef(parts) signatureOf(heroId)   (see "The Crowd and Medleys" at the end)
//   Mods         foldMods([deltaObj...]) -> final flat mods     trialDeltas(level) -> summed deltas
//                modsFor(relicIds, trialLevelOrDeltas, mascot?) -> final flat mods (what RUN.mods(R) returns: modsFor(R.relics, R.mods, R.mascot); active set tiers and mascot levels fold in)
//                rowFor(heroId, row, relicIds, mascot?) -> merged row bonuses (hero row plus relic `rows` plus active set tier `rows` plus mascot level `rows`)
//   Charm sets   DATA.relicSets[id] (registry, DESIGN 4.7)   setCounts(relicIds) -> {setId: owned}   setMembers(setId) -> [relic ids]
//                setMax(setId) -> top tier   activeSetTiers(relicIds) -> [{set, tier, name, def}] (the virtual Charms in force)
//   Mascot       DATA.mascots[id] (registry, DESIGN 4.7 "The Mascot"; data_mascots.js)   mascotLevel(xp) -> 1..mascotMax()   mascotNext(xp) -> XP to the next level
//                activeMascotTiers(mascotOrNull) -> [{mascot, level, name, def}] (levels 1..current, each a virtual Charm)   mascotProgress(mascot) (overlay)   mascotLabel(id, level) (toast)
//                setProgress(setId, relicIds) -> {id, name, text, n, max, total, tiers:[{tier, text, active}]}   setTierLabel(setId, tier) -> toast line
//   Misc         tileCount(type, nonBlock)   cleanSetting(key, value)   ratio helpers for tests
//   Checking     validate(only?, opt?) -> {errors, warnings, counts}
//                  opt.strict  also check every cross-file reference and that fixed content exists
//                  opt.hero    limit the card check to one hero id (or 'shared' for curse/status cards)
//                  opt.chapter limit the enemy check to one Act
//                audit(kind?, opt?) -> [string]   quota and guideline breaks ('audit ...' hard, 'guide ...' soft)
//
// RUN OPS (events and run hooks). Unknown fields are validator errors. `who` (heal hurt maxHp) is
// 'both' (default) | 'front' | 'lowest' | 'random' | a hero id of the party.
//   gold {n | pct}            n may be negative (a cost, floors at 0); pct is a fraction of current gold, floored
//   ink {n | pct}             Vox: result clamped to 0..inkMax; pct is a fraction of inkMax
//   heal {n | pct, who?}      pct is a fraction of that hero's maxHp; scaled by mods.healMul
//   hurt {n | pct, who?}      never kills: leaves at least 1 HP
//   maxHp {n, who?}           raises max and current HP by n; negative n lowers max, never below 1
//   addCard {card | pool, rarity?, n?=1, up?}   pool 'party' or a hero id: random unlocked non-token card
//   removeCard upgradeCard transformCard duplicateCard {n?=1, random?, filter?:{type,hero}}
//                             default: the player picks in the deck overlay (a `pending` entry); random:true uses the RNG.
//                             transformCard yields a random card of the same hero and rarity
//   addRelic {id | rarity}    rarity draws an unowned, unlocked relic     addGem {id | color?, tier?}
//   addBrush {id}             a Spell id or 'random'                      addCurse {id?, n?=1} a curse_* id, omitted = random
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
    // card mechanics a def carries in `mech: {id: N}` (see "Card mechanics" below the lookups): printed as a keyword with a number
    mechs: ['fanbase', 'remix', 'hype', 'loop', 'duet', 'soundcheck', 'reprise', 'finale'],
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
    runOps: ['gold', 'ink', 'heal', 'hurt', 'maxHp', 'addCard', 'removeCard', 'upgradeCard', 'transformCard', 'duplicateCard', 'addRelic', 'addGem', 'addBrush', 'addCurse', 'fight', 'flag', 'paint', 'cardReward', 'adoptMascot', 'mascotXp'],

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
    trialMods: ['enemyHp', 'eliteHp', 'bossHp', 'enemyDmg', 'goldMul', 'priceMul', 'healMul', 'reviveFrac', 'startInk', 'startGold', 'wellInk', 'cardChoices', 'curses', 'crowd'],
    trialModKind: { enemyHp: 'frac', eliteHp: 'frac', bossHp: 'frac', enemyDmg: 'frac', goldMul: 'frac', priceMul: 'frac', healMul: 'frac', reviveFrac: 'frac', startInk: 'int', startGold: 'int', wellInk: 'int', cardChoices: 'int', curses: 'int', crowd: 'int' },
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
    reqKeys: ['gold', 'hpPct', 'hpBelow', 'relic', 'flag', 'hero', 'chapter', 'mascot'],   // mascot: false = "no mascot yet", true = "needs one" (hidden either way, like hero)
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
    tutAnchors: ['hand', 'energy', 'endturn', 'swap', 'intent', 'enemy', 'ink', 'hex', 'brushes', 'deck', 'relics', 'party', 'fight'],

    // screens and overlays (closed; DESIGN 5.11)
    screens: ['title', 'heroSelect', 'library', 'settings', 'howto', 'story', 'map', 'combat', 'reward', 'shop', 'event', 'camp', 'forge', 'chest',
      'gemcache', 'chapterClear', 'gameOver', 'victory'],
    overlays: ['deck', 'pause', 'settings', 'relics', 'legend', 'cardPick', 'confirm', 'modal'],
    libraryTabs: ['unlocks', 'achievements', 'story', 'bestiary', 'history', 'follow'],   // follow (the sixth Tour Bus tab, key 6) is appended LAST (HV_STORY 5.3)

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
  // The duo's links (HV_STORY 5.2, bible 7.2). It lives here because DATA loads first, so every screen and ui.js can read it.
  // The owners fill in the URLs; an empty string hides that button. Opened only on a tap, in a new tab; never fetched.
  // When a URL is filled in, its line needs the pragma, for example:
  //   website: 'https://example.org/',  // hygiene-allow(network): owner link, opened only on a tap, never fetched
  // The keys are exactly handle website youtube facebook tiktok instagram support game (the hygiene suite pins them).
  // ------------------------------------------------------------------
  const LINKS = Object.freeze({
    handle: '@roxorloopsandjasmin',
    website: 'https://roxorloopsandjasmin.com',  // hygiene-allow(network): owner link, opened only on a tap
    youtube: 'https://www.youtube.com/@RoxorLoops',  // hygiene-allow(network): owner link, opened only on a tap
    facebook: 'https://web.facebook.com/RoxorLoopsAndJasmin/',  // hygiene-allow(network): owner link, opened only on a tap
    tiktok: 'https://www.tiktok.com/@roxorloopsandjasmin',  // hygiene-allow(network): owner link, opened only on a tap
    instagram: 'https://www.instagram.com/roxorloopsandjasmin',  // hygiene-allow(network): owner link, opened only on a tap
    support: '',
    game: '',   // the public game address used by Share; empty means the current page address without query or hash
  });

  // ------------------------------------------------------------------
  // Statuses. Semantics are implemented by COMBAT (DESIGN 4.2); text is what the UI shows.
  // stack: 'int' = intensity (numbers add), 'dur' = duration in rounds (numbers add).
  // resource statuses are inert: cards, passives and relics read and spend them.
  // ------------------------------------------------------------------
  const statuses = {
    might:      { id: 'might', name: 'Volume', kind: 'buff', stack: 'int', text: 'Attacks deal +N damage per hit.' },
    bulwark:    { id: 'bulwark', name: 'Soundproof', kind: 'buff', stack: 'int', text: 'Gain +N extra Block whenever you gain Block from a card or Charm.' },
    regen:      { id: 'regen', name: 'Warm Tea', kind: 'buff', stack: 'int', text: 'At the start of its turn, heal N, then Warm Tea falls by 1.' },
    thorns:     { id: 'thorns', name: 'Feedback', kind: 'buff', stack: 'int', text: 'Whenever it is hit by an attack, the attacker takes N damage.' },
    dodge:      { id: 'dodge', name: 'Shimmy', kind: 'buff', stack: 'int', text: 'Shimmies out of the next N attack hits completely.' },
    taunt:      { id: 'taunt', name: 'Spotlight', kind: 'buff', stack: 'dur', text: 'Enemy attacks that would strike the backing hero, or a random or lowest hero, hit this hero instead.' },
    ritual:     { id: 'ritual', name: 'Crescendo', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Volume.' },
    plating:    { id: 'plating', name: 'Sequins', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Block.' },
    bloom:      { id: 'bloom', name: 'Bloom', kind: 'resource', stack: 'int', hero: 'hanae', text: 'Jasmin\'s blossoms. Built by her sung attacks, spent by her finishers.' },
    sumi:       { id: 'sumi', name: 'Groove', kind: 'resource', stack: 'int', hero: 'kuro', text: 'RoxorLoops\'s groove. Built layer by layer with his skills, dropped in his big beats.' },
    ward:       { id: 'ward', name: 'Reverb', kind: 'resource', stack: 'int', hero: 'suzu', text: 'RawClaw\'s reverb. It builds every turn, and he spends it to wrap the band in sound.' },
    charge:     { id: 'charge', name: 'Rumble', kind: 'resource', stack: 'int', hero: 'raiga', text: 'Andy\'s low end. Built by taking hits and striking, released as thunder from below.' },
    vulnerable: { id: 'vulnerable', name: 'Exposed', kind: 'debuff', stack: 'dur', text: 'Takes 50% more attack damage.' },
    weak:       { id: 'weak', name: 'Muffled', kind: 'debuff', stack: 'dur', text: 'Deals 25% less attack damage.' },
    frail:      { id: 'frail', name: 'Wobbly', kind: 'debuff', stack: 'dur', text: 'Gains 25% less Block from cards and Charms.' },
    poison:     { id: 'poison', name: 'Earworm', kind: 'debuff', stack: 'int', text: 'At the start of its turn, lose N HP (ignores Block), then Earworm falls by 1.' },
    burn:       { id: 'burn', name: 'Sizzle', kind: 'debuff', stack: 'int', text: 'At the end of the round, take N damage (ignores Block), then Sizzle halves.' },
    stun:       { id: 'stun', name: 'Starstruck', kind: 'debuff', stack: 'dur', text: 'Skips its next action. A starstruck hero cannot play cards on their next turn.' },
    bind:       { id: 'bind', name: 'Tangled', kind: 'debuff', stack: 'dur', text: 'While either hero is Tangled, neither hero can swap spots.' },
    mark:       { id: 'mark', name: 'Tag', kind: 'debuff', stack: 'int', text: 'The next N attack hits against it deal +3 damage each (one stack per hit).' },
  };

  // Glossary shown in tooltips. Keys are the words the UI highlights in card text.
  const keywords = {
    block: { name: 'Block', text: 'Absorbs damage this turn. Wears off at the start of the owner\'s next turn.' },
    exhaust: { name: 'Fade', text: 'Fades out of the fight after it is played. It returns next combat.' },
    retain: { name: 'Hold', text: 'Stays in your hand at the end of the turn.' },
    innate: { name: 'Opener', text: 'Always in your opening hand.' },
    ethereal: { name: 'One Take', text: 'Fades if it is still in your hand at the end of the turn.' },
    unplayable: { name: 'Unplayable', text: 'Cannot be played.' },
    front: { name: 'Lead', text: 'The lead hero takes most enemy attacks. A card line starting Lead: only works while its hero stands here.' },
    back: { name: 'Backing', text: 'The backing hero is safe from most enemy attacks. A card line starting Backing: only works while its hero stands here.' },
    swap: { name: 'Swap', text: 'Trade spots. One swap per turn is free, more cost 1 Breath.' },
    ink: { name: 'Vox', text: 'Spend Vox on the map to unmute a hex and reveal it.' },
    brush: { name: 'Spell', text: 'A one-use Spell that unmutes a shape of hexes for free.' },
    gem: { name: 'Gem', text: 'Socket gems into card slots. A slot only accepts its own colour, rainbow slots accept any.' },
    slot: { name: 'Gem slot', text: 'Colour-matched socket. Gems change how the card plays.' },
    prism: { name: 'Rainbow slot', text: 'A rainbow slot accepts a gem of any colour.' },
    xcost: { name: 'X cost', text: 'Spends all your remaining Breath. The card reads X as the Breath spent.' },
    down: { name: 'Voiceless', text: 'A hero at 0 HP loses their voice: their cards clog your hand and they cannot be targeted. If both heroes lose their voice, the tour ends.' },
    // the two run systems (data.js "The Crowd and Medleys"): the fight HUD meter and the fused cards of an elite reward
    crowd: { name: 'Crowd', text: 'Every card you play fills the Crowd meter, a defeated enemy fills it by two. When it is full the crowd goes wild: a free Fading copy of a Signature card joins your hand, the two heroes taking turns.' },
    signature: { name: 'Signature', text: 'Each hero has one Signature card. When the crowd goes wild, a free Fading copy of it joins your hand.' },
    medley: { name: 'Medley', text: 'A Medley is two cards sung as one: it plays both of their effects. After a rival fight you may fuse two Attack or Skill cards of one hero into a Medley.' },
    // the tour bus pet (DESIGN 4.7 "The Mascot"): one per run, adopted at a Detour, levels up with fights won and Merch Stall Snacks
    mascot: { name: 'Mascot', text: 'A stray the tour bus adopts. It sits beside the duo and gives a small bonus that grows: level 2 at 5 XP, level 3 at 12 XP. Fights won give XP (rivals 2, headliners 3) and a Snack at the merch stall gives 2.' },
    // card mechanics (LISTS.mechs): one sentence each, N is the number printed after the word
    fanbase: { name: 'Fanbase', text: 'Fanbase N: whenever this card defeats an enemy, it deals N more damage for the rest of the tour.' },
    remix: { name: 'Remix', text: 'Remix N: each time you play this card, it deals N more damage for the rest of the fight.' },
    hype: { name: 'Hype', text: 'Hype N: deals N more damage for each card you played earlier this turn.' },
    loop: { name: 'Loop', text: 'Loop: add a Fading copy of the last other Attack or Skill you played this turn to your hand (Loop 2: two copies).' },
    // the duo (Duet) and the setlist (Soundcheck, Reprise, Finale)
    duet: { name: 'Duet', text: 'Duet N: deals N more damage (or gives N more Block) if the other hero played the previous card this turn.' },
    soundcheck: { name: 'Soundcheck', text: 'Soundcheck N: deals N more damage (or gives N more Block) if it is the first card you play this turn.' },
    reprise: { name: 'Reprise', text: 'Reprise: if you played 3 or more cards this turn, a Fading copy of this card is played again for free at the end of your turn.' },
    finale: { name: 'Finale', text: 'Finale N: deals N more damage for each card you played earlier this turn, and no card can be played after it this turn.' },
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
    crowd: 7,                         // the Crowd meter: cards played until the crowd goes wild (a kill counts 2); Encore 5+ adds 1 (trial_5 mods.crowd)
    // The Mascot (DESIGN 4.7 "The Mascot"): XP thresholds per level (index = level - 1: level 1 at 0, level 2 at 5, level 3 at 12),
    // XP per fight won by tier (minions never count on their own), and the Merch Stall Snack (price.snack gold for snackXp XP, one per stall)
    mascotXp: [0, 5, 12],
    mascotFightXp: { normal: 1, elite: 2, boss: 3 },
    snackXp: 2,
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
    price: { card: { common: 50, uncommon: 80, rare: 150 }, relic: { common: 140, uncommon: 190, rare: 260, shop: 160 }, gem: { 1: 60, 2: 110, 3: 180 }, remove: 75, removeStep: 25, brush: 45, snack: 35, saleFrac: 0.5 },
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
    // The Tour Bus (`library`: Cheers prices) and the Cheers payout per run (`inkstones`; META.recordRun, DESIGN 4.10).
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
  // Spells (`brushes`): one-use map tools. MAP.brushCells implements the geometry (DESIGN 4.8).
  // ------------------------------------------------------------------
  const brushes = {
    stroke: { id: 'stroke', name: 'Boots and Cats', kind: 'line', len: 3, text: 'Unmute 3 hexes in a straight line, starting next to any live hex.' },
    wave:   { id: 'wave', name: 'Vocal Run', kind: 'line', len: 5, text: 'Unmute 5 hexes in a straight line, starting next to any live hex.' },
    fan:    { id: 'fan', name: 'Air Horn', kind: 'fan', text: 'Unmute a wedge of 3 hexes next to a live hex.' },
    splash: { id: 'splash', name: 'Abracadabass', kind: 'blob', text: 'Unmute a hex next to the live ground and the 6 hexes around it.' },
    halo:   { id: 'halo', name: 'Surround Sound', kind: 'ring', text: 'Unmute all 6 hexes around any live hex.' },
    blot:   { id: 'blot', name: 'Hocus Focus', kind: 'dot', text: 'Unmute any one hex within 4 of the party.' },
  };

  // Map tile presentation names (icons come from ART.icon 'tile').
  const tiles = {
    start: { name: 'Soundcheck', text: 'Where the tour begins.' },
    empty: { name: 'Path', text: 'Open ground.' },
    block: { name: 'Blur', text: 'A patch the Gloss smoothed away. Nothing can cross it.' },
    enemy: { name: 'Face-Off', text: 'A creature of the Gloss blocks the way.' },
    elite: { name: 'Rival', text: 'A rival act guarding a Charm.' },
    boss: { name: 'Headliner', text: 'The headliner of this act.' },
    chest: { name: 'Gift Box', text: 'A gift from a fan. Charms, gold or gems.' },
    shop: { name: 'Merch Stall', text: 'Jordan sells cards, Charms, gems and a Spell.' },
    camp: { name: 'Green Room', text: 'Rest, rehearse or warm up.' },
    event: { name: 'Detour', text: 'Something unexpected is happening.' },
    well: { name: 'Tea Stall', text: 'Sip a warm ginger tea to refill your Vox.' },
    brush: { name: 'Busker', text: 'A street busker teaches you a one-use Spell.' },
    gemcache: { name: 'Sparkle Booth', text: 'Choose a gem.' },
    forge: { name: 'Studio', text: 'Rehearse one card, or set gems.' },
  };

  // ------------------------------------------------------------------
  // Heroes. Rows: the bonus a hero gets while standing in that row.
  // passives use the hook DSL (same shape as relic hooks) and are OWNED by the hero:
  // they fire only for that hero's own events. Starter card ids are a promise: the
  // hero's card file MUST define each of them.
  // ------------------------------------------------------------------
  const heroes = {
    hanae: {
      id: 'hanae', name: 'Jasmin', title: 'The Blossom Voice', prefer: 'front', res: 'bloom',
      color: '#ff7eb6', accent: '#fff4f8', dark: '#b0245c', maxHp: 84,
      blurb: 'A soft, smooth singer whose vocal runs land like falling petals. She never shouts, and every note she sings blooms a little brighter.',
      rows: { front: { dmgAdd: 2 }, back: { blockAdd: 1 } },
      passives: [{ id: 'blade_flow', name: 'Every Note Blooms', on: 'onPlay', filter: { type: 'attack' }, limit: 1, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
      starter: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry', 'hanae_petal_step'],
      signature: 'hanae_thousand_petals',      // The High Note: the Crowd's free copy (data.js "The Crowd and Medleys")
      unlock: null,
    },
    kuro: {
      id: 'kuro', name: 'RoxorLoops', title: 'The Beatbox Wizard', prefer: 'back', res: 'sumi',
      color: '#3fcf6a', accent: '#c6ff3d', dark: '#0f3a1e', maxHp: 68,
      blurb: 'A beatboxer who plays a whole band with one mouth. He keeps the groove from the back, and his beats get stuck in every enemy\'s head.',
      rows: { back: { dmgAdd: 2 }, front: { blockAdd: 0 } },
      passives: [{ id: 'steady_hand', name: 'In the Pocket', on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      starter: ['kuro_ink_bolt', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_first_stroke'],
      signature: 'kuro_grand_flourish',         // Wait For It
      unlock: null,
    },
    suzu: {
      id: 'suzu', name: 'RawClaw', title: 'The Sound Alchemist', prefer: 'back', res: 'ward',
      color: '#a77bff', accent: '#e9ddff', dark: '#3b2470', maxHp: 68,
      blurb: 'The duo\'s producer, a good friend and a beatboxer too. A little reverb, a little delay, a filter here and there, and the whole fight sounds better.',
      rows: { front: { blockAdd: 1, thorns: 2 }, back: { regen: 2 } },
      passives: [{ id: 'moonlit_rite', name: 'Always Rolling', on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }],
      starter: ['suzu_ofuda', 'suzu_ofuda', 'suzu_barrier', 'suzu_barrier', 'suzu_moon_prayer'],
      signature: 'suzu_moonlit_verdict',        // Final Mixdown
      unlock: { ach: 'ch1_clear' },
    },
    raiga: {
      id: 'raiga', name: 'Andy', title: 'The Thunder Bass', prefer: 'front', res: 'charge',
      color: '#ff9a2e', accent: '#ffe45e', dark: '#5a2a0a', maxHp: 88,
      blurb: 'A bass player who sometimes joins the duo, and whose low end you feel before you hear it. Every hit he takes comes back as a bass line, louder.',
      rows: { front: { thorns: 2, startBlock: 3 }, back: { dmgAdd: 1 } },
      passives: [{ id: 'storm_born', name: 'Bass Face', on: 'onDamaged', limit: 2, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      starter: ['raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace', 'raiga_static_fist'],
      signature: 'raiga_thousand_thunders',     // Thunder From Below
      unlock: { ach: 'ch2_clear' },
    },
  };

  // ------------------------------------------------------------------
  // The fixed roster (CONTENT_SPEC 4 is the human copy). Ids, tiers, sizes and Acts are LAW:
  // data_enemies_N.js defines exactly its Act's ids and art_enemies_N.js draws exactly them.
  // Entry: [id, name, size, role]. Bosses also carry a title.
  // ------------------------------------------------------------------
  const ROSTER_SRC = {
    1: {
      normal: [
        ['kappa', 'Fussy Foghorn', 'm', 'Proud harbour foghorn. A honk that leaves the lead Exposed, a bump, then a guard; teaches Exposed and Block.'],
        ['tanuki_bandit', 'Coin Crab', 'm', 'Coin crab. Grabs gold from your hat, thumps, then scuttles off with it; win it over first to get the gold back.'],
        ['kodama', 'Tuning Forkling', 's', 'Tiny tuning fork. Rings at both heroes lightly and calls a Kazoo Imp to its side.'],
        ['karakasa', 'Squeezebox', 'm', 'Hopping accordion. Two quick polka hops, then squeezes shut for Block; its wheeze leaves a hero Wobbly.'],
        ['hitodama', 'Hot Chilli', 's', 'Hopping hot chilli. Hard to hit at first, Sizzles the lead and tips spicy junk cards into your deck.'],
        ['oni_cub', 'Jitterbug', 'm', 'Small bug of pre-show nerves that gains Volume every turn. Win it over early or it only gets louder.'],
        ['crow_tengu', 'Pitch-Perfect Gull', 'm', 'Pitch-perfect gull. Dives on the backing hero, pecks in flurries, and swaps your heroes\' spots.'],
        ['bamboo_sprite', 'Pea Pod', 's', 'Pod of three singing peas that arrive in packs. Three tiny shots at random heroes every turn.'],
        ['mushroom_folk', 'Jingle Machine', 'm', 'Jingle-singing vending machine. Earworms the lead and grows Feedback in bubble wrap.'],
        ['bamboo_boar', 'Runaway Melon', 'l', 'Rolling prize melon. Gains Sequins, winds up (telegraph), then one heavy downhill roll.'],
      ],
      elite: [
        ['oni_brute', 'One-Hit Jukebox', 'l', 'Washed-up jukebox. Heavy hits and Muffled, and it sulks into a rage below half HP.'],
        ['tengu_duelist', 'Dance-Off Heron', 'l', 'Tap-dancing heron. Lunges at the backing hero, gains Shimmy, and answers hits with a quick step.'],
        ['moss_guardian', 'Old Bandstand', 'l', 'Walking harbour bandstand. Sequins and Feedback, slow stomps, calls Kazoo Imps from its rafters.'],
      ],
      minion: [
        ['ember_wisp', 'Chilli Flake', 's', 'Tiny chilli flake. Sizzles a hero once, then fizzles out.'],
        ['leaf_imp', 'Kazoo Imp', 's', 'Fast little kazoo called by tuning forks and bandstands. One weak poke.'],
        ['paper_kodama', 'Mic Squeal', 's', 'Shrieking little mic creature. Clogs your deck with junk cards.'],
      ],
      boss: ['boss_kuzunoha', 'Kraki', 'xl', 'Karaoke kraken with eight stolen mics. Mic slams and mic squeals, then every voice at once.', 'The Karaoke Kraken'],
    },
    2: {
      normal: [
        ['chochin', 'Flamebait', 'm', 'Flaming matchstick. Sizzles the lead, gives every enemy Crescendo, then a flame war on both heroes.'],
        ['karakuri_puppet', 'Clickbait Goblin', 'm', 'Wind-up clickbait goblin with a fixed combo; its third trick leaves the lead Starstruck.'],
        ['nopperabo', 'Filter Fairy', 'm', 'Faceless filter fairy. Leaves the lead Muffled and Wobbly, then pokes harder while they stick.'],
        ['drowned_samurai', 'Unskippable Ad', 'l', 'Walking advert. Steady jabs and Sequins from its frame; holds still, then a big final offer.'],
        ['koi_spirit', 'Hug Emoji', 'm', 'Huggy emoji. Heals its allies and splashes both heroes with hearts.'],
        ['tsukumogami', 'Notification Imp', 'm', 'Red-dot imp. Hits and shuffles junk cards into your draw pile, then a big pile of pings.'],
        ['silk_weaver', 'Algo Rhythm', 'm', 'Clicking algorithm on cable legs. Tangles a hero and calls a Botling.'],
        ['nure_onna', 'Autoplay Snake', 'l', 'Endless-feed snake. Bites the backing hero with Earworm and coils the lead hard.'],
        ['rokurokubi', 'Selfie Stick', 'm', 'Telescoping selfie stick that reaches past the lead to hit the backing hero twice.'],
        ['ittan_momen', 'Phone Charger', 'm', 'Loose charging cable. Wraps a hero Tangled and gains Block and Shimmy.'],
      ],
      elite: [
        ['drowned_general', 'Comment Troll', 'l', 'Grumbling comment cloud. Crescendo, calls Grumble Clouds, one heavy ratio below half HP.'],
        ['puppet_master', 'Trendsetter', 'l', 'Pulls the strings of every trend. Calls Copycat Cutouts, mends them, and leaves the lead Starstruck.'],
        ['umibozu', 'Doomscroll Moth', 'l', 'Giant sleepy moth. Slams both heroes harder every turn, Muffled and Wobbly on both, and a Starstruck glare.'],
      ],
      minion: [
        ['spiderling', 'Botling', 's', 'Tiny spider-shaped bot that likes everything. Earworms with a quick nip.'],
        ['paper_puppet', 'Copycat Cutout', 's', 'Flimsy cut-out dancer on strings. One weak strike, gone in a hit.'],
        ['lantern_wisp', 'Grumble Cloud', 's', 'Small grumbling cloud. Sizzles a hero and backs up its neighbours with Block.'],
      ],
      boss: ['boss_jorogumo', 'Scrollspinner', 'xl', 'Glam spider who spins the endless feed. Tangles heroes and hatches botlings, then drops her filter.', 'Queen of the Feed'],
    },
    3: {
      normal: [
        ['storm_drone', 'Tuner Drone', 'm', 'Hovering pitch drone. Rapid jabs in threes and a correction on both heroes.'],
        ['komainu_guardian', 'VIP Bouncer', 'l', 'Brass rope-post bouncer. Sequins and Feedback, then a crushing bounce.'],
        ['redaction_knight', 'Clapperboard Knight', 'm', 'Clapperboard knight. Hits hard and adds junk cards with every retake.'],
        ['void_scribe', 'Chrome Siren', 'm', 'Chrome siren. Strips your buffs and adds junk cards.'],
        ['blank_soldier', 'Synchro Dancer', 'm', 'Mannequin dancer in perfect step. Steady hits that grow in a crowd, weak alone.'],
        ['sky_serpent', 'Streamer Dragon', 'l', 'Coiling streamer dragon. Multi-hit confetti blasts at the backing hero.'],
        ['eraser_wraith', 'Airbrush Wraith', 'm', 'Smooths away your Block and your hero resource stacks.'],
        ['thunder_crow', 'Ring Light Sentinel', 'm', 'Flying ring light. Dives to leave the lead Starstruck and flashes the backing hero.'],
        ['paper_golem', 'Sequin Golem', 'l', 'Sequinned costume giant. Slow, heavy hits and Sequins.'],
        ['margin_imp', 'Glitch Gremlin', 'm', 'Tuning-box gremlin. Calls Pitch Glitches and adds junk cards that cost you Breath.'],
      ],
      elite: [
        ['censor_golem', 'Big Mute Button', 'l', 'Giant mute button. Junk cards, Sequins, and one huge press.'],
        ['storm_whelp', 'Applause Sign', 'l', 'Lit-up applause sign. Roaring applause on both heroes, slow claps, calls Confetti Poppers.'],
        ['black_bar_inquisitor', 'Mannequin Judge', 'l', 'Talent-show mannequin judge. Starstruck, Tangled, and a finisher against a low hero.'],
      ],
      minion: [
        ['blank_page', 'Lip-Sync Clone', 's', 'Lip-syncing clone. Gains Block, then leaves a hero Wobbly.'],
        ['spark_mote', 'Confetti Popper', 's', 'Tiny party popper. One bang and it bursts.'],
        ['typo_sprite', 'Pitch Glitch', 's', 'Glitchy pixel sprite. Adds a junk card that costs you Breath.'],
      ],
      boss: ['boss_editor', 'Flawless', 'xl', 'Perfect pop idol who never sang a real note. Becomes the Filter, then the Gloss itself.', 'Star of the Perfect Stage'],
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
    cards: { starter: 3, common: 17, uncommon: 15, rare: 11, powers: 4, lockedUncommon: 4, lockedRare: 4, slots: { red: 10, blue: 10, green: 8, gold: 8 } },
    enemies: { normal: 10, elite: 3, minion: 3, boss: 1, normalGroups: 12, eliteGroups: 3, bossPhases: { 1: 1, 2: 1, 3: 2 } },
    relics: { common: 44, uncommon: 30, rare: 12, boss: 6, shop: 4, perHero: 3, lockedFrac: 0.3, textMax: 90, flavorMax: 80 },
    gems: { perColor: 6, tiers: [1, 1, 2, 2, 3, 3] },
    events: { perChapter: 10, any: 10, onceFrac: 0.6 },
    achievements: 32, trials: 10, tips: 30,
    mascots: 6,                       // the strays the tour bus can adopt (DATA.mascots), each with ECONOMY.mascotXp.length levels
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
  const REG = ['cards', 'gems', 'relics', 'relicSets', 'mascots', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
  const D = { LISTS, LINKS, statuses, keywords, ECONOMY, SETTINGS, brushes, tiles, heroes, ROSTER, rosterById, FIXED, QUOTA, GUIDE, encounters: { 1: { normal: [], elite: [] }, 2: { normal: [], elite: [] }, 3: { normal: [], elite: [] } } };
  REG.forEach((k) => { D[k] = k === 'tips' ? [] : {}; });
  // Display names of the gem and slot colour ids (the ids stay; every screen that prints a colour reads this).
  D.COLOUR_NAME = { red: 'pink', blue: 'blue', green: 'green', gold: 'gold', any: 'rainbow' };

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

  // ---- card mechanics (LISTS.mechs) ----
  // A card def may carry `mech: {fanbase?, remix?, hype?, loop?, duet?, soundcheck?, reprise?, finale?}`, each a whole number 1..9;
  // `up.mech` REPLACES it (like up.kw).
  //   fanbase N  whenever a hit of this card defeats an enemy, the card deals N more damage for the rest of the tour. COMBAT adds N to
  //              `enc` on its copy of the card and reports the gains in C.summary().fanbase {uid: total}; RUN adds them to `enc` on the
  //              deck instance (a whole number, saved with the run; an instance without it simply has no bonus yet).
  //   remix N    each play adds N damage for the rest of the fight: COMBAT counts the plays on its copy as `rmx`.
  //   hype N     N more damage for each card played earlier this turn: ctx.played (COMBAT passes it), else ctx.C.played.
  //   loop N     after its own fx, add N temp copies of the last Attack or Skill played earlier this turn (never a card with Loop) to the
  //              hand. A copy carries `fade: true`, which resolves with the Fade keyword.
  //   duet N     (the duo) N more damage, or N more Block on a card without a dmg op, if the OTHER hero played the previous card this
  //              turn: ctx.lastHero (COMBAT passes the hero id of the last card played this turn, null at the start of a turn).
  //   soundcheck N  (the setlist) N more damage, or Block, if this is the first card played this turn (ctx.played is 0).
  //   reprise     (always 1) at the end of the turn, if 3 or more cards were played, COMBAT plays a Fading temp copy of the card again
  //              for free (same target when it is still standing). A copy never Reprise-es again, so there is no chain.
  //   finale N   N more damage for each card played earlier this turn (like Hype), and the turn is closed: C.canPlay refuses every
  //              card after it with reason 'finale' until the next turn.
  // The damage bonuses are added to `plus` on every dmg op of the card (through cond and repeat, never into hook fx), exactly like
  // a gem's +N damage, so C.preview, the bots and the printed number all see them; Duet and Soundcheck ride on every block op instead
  // when the card has no dmg op. data_text.js owns DATA.resolveCard, cardHtml and cardPlain; the accessors at the end of this IIFE wrap
  // whatever it installs: resolveCard adds the bonuses (and Fade on a `fade` copy) plus `mech` (the def's numbers, upgrade applied) and
  // `mechNow` ({fanbase, remix, hype, duet, soundcheck, finale, total (on damage), block (on Block)} live bonuses) on the result, and
  // cardHtml prints one sentence per mechanic before a closing Fade: "Fanbase 2 (now +4)." Pure, deterministic, no DOM.
  D.mechOf = (def, up) => {
    if (!def) return null;
    const m = up && def.up && def.up.mech !== undefined ? def.up.mech : def.mech;
    return m && typeof m === 'object' && Object.keys(m).length ? m : null;
  };
  // live bonuses of one instance: {fanbase, remix, hype, duet, soundcheck, finale, total, block}. `fx` (the resolved ops) decides where
  // Duet and Soundcheck land: on the damage (total) when the card has a dmg op outside hooks, on the Block (block) otherwise.
  D.mechNow = (inst, mech, ctx, fx) => {
    const i = inst && typeof inst === 'object' ? inst : {};
    const whole = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const played = whole(ctx ? (ctx.played !== undefined ? ctx.played : ctx.C && ctx.C.played) : 0);
    const lastHero = ctx ? (ctx.lastHero !== undefined ? ctx.lastHero : ctx.C && ctx.C.lastHero) : null;
    const inTurn = !!ctx && (ctx.played !== undefined || !!ctx.C);   // a deck or reward view has no turn: no first card, no Soundcheck
    const def = D.cards[i.id];
    const other = !!lastHero && !!def && lastHero !== def.hero;
    const m = mech || {};
    const out = {
      fanbase: m.fanbase ? whole(i.enc) : 0, remix: m.remix ? m.remix * whole(i.rmx) : 0, hype: m.hype ? m.hype * played : 0,
      duet: m.duet && other ? m.duet : 0, soundcheck: m.soundcheck && inTurn && played === 0 ? m.soundcheck : 0, finale: m.finale ? m.finale * played : 0,
    };
    const onBlock = fx !== undefined && !hasMechOp(fx, 'dmg');
    out.total = out.fanbase + out.remix + out.hype + out.finale + (onBlock ? 0 : out.duet + out.soundcheck);
    out.block = onBlock ? out.duet + out.soundcheck : 0;
    return out;
  };
  // a cache key piece for engines that memoise resolutions ('' for a card the mechanics never change)
  D.mechKey = (inst, ctx) => {
    if (!inst || typeof inst !== 'object') return '';
    const mech = D.mechOf(D.cards[inst.id], inst.up);
    if (!mech && !inst.fade) return '';
    const n = D.mechNow(inst, mech, ctx);
    return 'm' + n.fanbase + ',' + n.remix + ',' + n.hype + ',' + n.duet + ',' + n.soundcheck + ',' + n.finale + (inst.fade ? 'f' : '');
  };
  // the card's own ops of one kind (through cond and repeat, never into hook fx)
  const mechOps = (ops, kind, fn) => (Array.isArray(ops) ? ops : []).forEach((o) => {
    if (!o || typeof o !== 'object') return;
    if (o.op === kind) fn(o);
    if (o.op === 'cond') { mechOps(o.then, kind, fn); mechOps(o.else, kind, fn); }
    if (o.op === 'repeat') mechOps(o.do, kind, fn);
  });
  const hasMechOp = (ops, kind) => { let r = false; mechOps(ops, kind, () => { r = true; }); return r; };
  const mechDmg = (ops, fn) => mechOps(ops, 'dmg', fn);
  const wrapResolve = (raw) => function resolveCard(x, ctx) {
    const res = raw(x, ctx);
    if (!res || !res.def) return res;
    const inst = res.inst && typeof res.inst === 'object' ? res.inst : {};
    const mech = D.mechOf(res.def, res.up);
    if (!mech && !inst.fade) return res;
    const out = Object.assign({}, res);
    if (inst.fade && out.kw.indexOf('exhaust') < 0) out.kw = out.kw.concat(['exhaust']);
    if (mech) {
      out.mech = Object.assign({}, mech);
      out.mechNow = D.mechNow(inst, mech, ctx, out.fx);
      if (out.mechNow.total > 0 || out.mechNow.block > 0) {
        out.fx = JSON.parse(JSON.stringify(out.fx));
        if (out.mechNow.total > 0) mechDmg(out.fx, (o) => { o.plus = (o.plus || 0) + out.mechNow.total; });
        if (out.mechNow.block > 0) mechOps(out.fx, 'block', (o) => { o.plus = (o.plus || 0) + out.mechNow.block; });
      }
    }
    return out;
  };
  const isResolvedCard = (x) => !!x && typeof x === 'object' && !!x.inst && Array.isArray(x.fx) && 'gemActive' in x;
  const mechHtml = (res) => {
    const m = res.mech;
    if (!m) return [];
    const base = (res.def && res.def.mech) || {};
    const now = res.mechNow || {};
    return LISTS.mechs.filter((k) => m[k]).map((k) => {
      const word = `<span class="kw" data-kw="${k}">${keywords[k].name}</span>`;
      const cls = m[k] > (base[k] || 0) ? ' up' : m[k] < (base[k] || 0) ? ' down' : '';
      const num = (k === 'loop' || k === 'reprise') && m[k] === 1 ? '' : ` <span class="num${cls}">${m[k]}</span>`;
      const live = now[k] > 0 ? ` (now <span class="num up">+${now[k]}</span>)` : '';
      return word + num + live + '.';
    });
  };
  const wrapHtml = (raw) => function cardHtml(x, ctx) {
    const res = isResolvedCard(x) ? x : D.resolveCard(x, ctx);
    const html = raw(res, ctx);
    const extra = mechHtml(res);
    if (!extra.length) return html;
    const fade = `<span class="kw" data-kw="exhaust">${keywords.exhaust.name}</span>.`;
    const add = extra.join(' ');
    if (html.slice(-fade.length) === fade) { const head = html.slice(0, -fade.length).trim(); return (head ? head + ' ' : '') + add + ' ' + fade; }
    return html ? html + ' ' + add : add;
  };
  const plainHtml = (h) => String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const wrapPlain = () => function cardPlain(x, ctx) { return plainHtml(D.cardHtml(x, ctx)); };

  // ---- mods (DESIGN 4.7) ----
  // count keys: [base, min, max]. frac keys fold to max(0.1, 1 + sum). reviveFrac is a delta on ECONOMY.reviveFrac.
  const COUNT_BASE = {
    energy: [ECONOMY.energy, 1, 10], hand: [ECONOMY.handSize, 1, ECONOMY.maxHand], startBlock: [0, 0, 99], inkMax: [ECONOMY.inkMax, 6, 20],
    startInk: [ECONOMY.startInk, 1, 20], wellInk: [ECONOMY.wellInk, 1, 12], cardChoices: [ECONOMY.cardChoices, 1, 6], freeSwaps: [ECONOMY.freeSwaps, 0, 5],
    campActions: [1, 1, 3], rareBoost: [0, 0, 50], startGold: [ECONOMY.startGold, 0, 999], curses: [0, 0, 10],
    crowd: [ECONOMY.crowd, 0, 12],                                        // the Crowd meter size (data.js "The Crowd and Medleys"); 0 is off (a mod never folds below 4 in play, the sims pass 0 directly)
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
  // Set bonuses fold in like virtual Charms: every active tier's mods (and rows below) count once, whatever the owned count beyond it.
  // The Mascot's active levels (below) fold in the same way; `mascot` is R.mascot ({id, xp}) or null/undefined for none.
  D.modsFor = (relicIds, trial, mascot) => D.foldMods((relicIds || []).map((id) => D.relics[id] && D.relics[id].mods).concat(D.activeSetTiers(relicIds).map((t) => t.def.mods)).concat(D.activeMascotTiers(mascot).map((t) => t.def.mods)).concat([trial && typeof trial === 'object' ? trial : D.trialDeltas(trial || 0)]));
  D.rowFor = (heroId, row, relicIds, mascot) => {
    const out = {};
    const add = (r) => { if (r) Object.keys(r).forEach((k) => { out[k] = (out[k] || 0) + r[k]; }); };
    add(heroes[heroId] && heroes[heroId].rows[row]);
    (relicIds || []).forEach((id) => add(D.relics[id] && D.relics[id].rows && D.relics[id].rows[row]));
    D.activeSetTiers(relicIds).forEach((t) => add(t.def.rows && t.def.rows[row]));
    D.activeMascotTiers(mascot).forEach((t) => add(t.def.rows && t.def.rows[row]));
    return out;
  };

  // ---- relicSets (DESIGN 4.7): Charm sets. A Charm def may carry `set: id`; DATA.relicSets[id] = {id, name, text, tiers: {N: {text, mods?,
  // hooks?, rows?}}}. A tier is ACTIVE while the party owns at least N Charms of the set, and tiers stack (3 owned gives the 2 and 3 bonuses).
  // Every active tier behaves as one virtual Charm: modsFor and rowFor fold its mods and rows (above), COMBAT registers its combat hooks next
  // to the relic hooks and RUN.hook runs its run hooks. Nothing is saved: everything is derived from the owned ids. ----
  D.setCounts = (relicIds) => {
    const seen = {}, out = {};
    (relicIds || []).forEach((id) => { const r = D.relics[id]; if (!r || !r.set || seen[id]) return; seen[id] = true; out[r.set] = (out[r.set] || 0) + 1; });
    return out;
  };
  D.setMembers = (setId) => Object.keys(D.relics).filter((id) => D.relics[id] && D.relics[id].set === setId);
  const tierNs = (s) => (s && s.tiers ? Object.keys(s.tiers).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b) : []);
  D.setMax = (setId) => { const ns = tierNs(D.relicSets[setId]); return ns.length ? ns[ns.length - 1] : 0; };
  // [{set, tier, name, def}] for every tier the owned ids switch on, in set id then tier order (stable, so hook order is stable)
  D.activeSetTiers = (relicIds) => {
    const counts = D.setCounts(relicIds), out = [];
    Object.keys(counts).sort().forEach((sid) => {
      const s = D.relicSets[sid];
      if (!s) return;
      tierNs(s).forEach((n) => { if (counts[sid] >= n) out.push({ set: sid, tier: n, name: s.name, def: s.tiers[n] }); });
    });
    return out;
  };
  // what a Charms panel shows for one set: {id, name, text, n (owned), max (top tier), total (members), tiers: [{tier, text, active}]}
  D.setProgress = (setId, relicIds) => {
    const s = D.relicSets[setId];
    if (!s) return null;
    const n = D.setCounts(relicIds)[setId] || 0;
    return { id: setId, name: s.name, text: s.text, n, max: D.setMax(setId), total: D.setMembers(setId).length, tiers: tierNs(s).map((t) => ({ tier: t, text: s.tiers[t].text, active: n >= t })) };
  };
  // the toast line when a tier switches on: "Stage Crew 3 of 4: On the first turn of each fight, both heroes gain 4 Block."
  D.setTierLabel = (setId, tier) => { const s = D.relicSets[setId]; const tr = s && s.tiers && s.tiers[tier]; return s && tr ? `${s.name} ${tier} of ${D.setMax(setId)}: ${tr.text}` : ''; };

  // ---- mascots (DESIGN 4.7 "The Mascot"): the tour bus pet. DATA.mascots[id] = {id, name, blurb, art:{m, c}, levels: {1: {text, mods?, hooks?,
  // rows?}, 2: {...}, 3: {...}}}. A run adopts ONE (R.mascot = {id, xp}); its level is read from the XP thresholds ECONOMY.mascotXp (level 1 at
  // 0 XP, 2 at 5, 3 at 12) and the levels STACK like Charm set tiers: every level up to the current one is a virtual Charm, folded by modsFor
  // and rowFor (above), its combat hooks registered by COMBAT (src 'mascot') and its run hooks run by RUN.hook. Nothing beyond {id, xp} is saved. ----
  D.mascotMax = () => ECONOMY.mascotXp.length;
  D.mascotLevel = (xp) => {
    const n = typeof xp === 'number' && Number.isFinite(xp) ? xp : 0;
    let lv = 1;
    ECONOMY.mascotXp.forEach((need, i) => { if (n >= need) lv = i + 1; });
    return lv;
  };
  // XP still needed for the next level, or 0 at the top level
  D.mascotNext = (xp) => { const lv = D.mascotLevel(xp); return lv >= D.mascotMax() ? 0 : ECONOMY.mascotXp[lv] - (xp || 0); };
  // [{mascot: id, level, name, def}] for levels 1..current (empty for no mascot or an unknown id), in level order so hook order is stable
  D.activeMascotTiers = (mascot) => {
    const m = mascot && typeof mascot === 'object' ? D.mascots[mascot.id] : null;
    if (!m || !m.levels) return [];
    const lv = D.mascotLevel(mascot.xp), out = [];
    for (let n = 1; n <= lv; n++) if (m.levels[n]) out.push({ mascot: m.id, level: n, name: m.name, def: m.levels[n] });
    return out;
  };
  // what the Charms overlay shows: {id, name, blurb, art, xp, level, max, next (XP to the next level, 0 at the top), levels: [{level, text, active, at (XP needed)}]}
  D.mascotProgress = (mascot) => {
    const m = mascot && typeof mascot === 'object' ? D.mascots[mascot.id] : null;
    if (!m) return null;
    const xp = typeof mascot.xp === 'number' ? mascot.xp : 0, lv = D.mascotLevel(xp);
    return { id: m.id, name: m.name, blurb: m.blurb, art: m.art, xp, level: lv, max: D.mascotMax(), next: D.mascotNext(xp), levels: ECONOMY.mascotXp.map((at, i) => ({ level: i + 1, text: m.levels && m.levels[i + 1] ? m.levels[i + 1].text : '', active: lv >= i + 1, at })) };
  };
  // the toast line when a level switches on: "Beatbox Pug 2 of 3: The lead hero deals 1 more damage."
  D.mascotLabel = (id, level) => { const m = D.mascots[id]; const lv = m && m.levels && m.levels[level]; return m && lv ? `${m.name} ${level} of ${D.mascotMax()}: ${lv.text}` : ''; };

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
    adoptMascot: ['id'], mascotXp: ['n'],
  };

  D.validate = (only, opt) => {
    opt = opt || {};
    const strict = !!opt.strict;
    const errors = [], warnings = [];
    const err = (where, msg) => errors.push(`${where}: ${msg}`);
    const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
    const want = (k) => !only || only === k || (Array.isArray(only) && only.indexOf(k) >= 0);
    const KINDS = ['heroes', 'cards', 'gems', 'relics', 'mascots', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
    if (only !== undefined) (Array.isArray(only) ? only : [only]).forEach((k) => { if (KINDS.indexOf(k) < 0) err('validate', `unknown registry "${k}" (one of ${KINDS.join(', ')})`); });
    ['cards', 'gems', 'relics', 'mascots', 'enemies', 'events', 'achievements', 'trials', 'lore'].forEach((k) => {
      if (want(k)) Object.keys(D[k]).forEach((id) => { if (!isObj(D[k][id])) err(k + ' ' + id, 'must be an object'); });
    });
    const noDash = (w, o) => { if (DASH.test(JSON.stringify(o))) err(w, 'contains an em or en dash'); };
    // top-level fields a def may carry: a typo'd or invented field is an error, not silently ignored
    const FIELDS = {
      card: ['id', 'name', 'hero', 'type', 'rarity', 'cost', 'fx', 'up', 'kw', 'slots', 'art', 'flavor', 'hand', 'locked', 'mech'],
      gem: ['id', 'name', 'color', 'tier', 'mod', 'art', 'text', 'locked'],
      relic: ['id', 'name', 'rarity', 'text', 'mods', 'rows', 'hooks', 'art', 'hero', 'locked', 'flavor', 'set'],
      mascot: ['id', 'name', 'blurb', 'art', 'levels'],
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
          case 'adoptMascot': if (!isStr(o.id)) err(w, `${p}: adoptMascot needs a mascot id`); break;
          case 'mascotXp': if (!(isInt(o.n) && o.n >= 1 && o.n <= 12)) err(w, `${p}: mascotXp needs n 1..12`); break;
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
        if (typeof h.signature !== 'string') err(w, 'signature must name a card id (the Crowd\'s free copy)');
        else if (D.cards[h.signature] && (D.cards[h.signature].hero !== id || ['attack', 'skill'].indexOf(D.cards[h.signature].type) < 0)) err(w, `signature "${h.signature}" must be an Attack or Skill of this hero`);
        else if (strict && !D.cards[h.signature]) warn(w, `signature "${h.signature}" is not defined: the Crowd has nothing to sing for this hero`);
      });
    }

    // ---- card mechanics: {fanbase, remix, hype, loop, duet, soundcheck, reprise, finale}, whole numbers 1..9 ----
    // the damage ones need a dmg op to grow; Duet and Soundcheck need a dmg or a block op; Reprise is always 1, on an Attack or Skill
    // with a fixed cost and no pick (the replay is automatic, nobody is there to choose), and never together with Finale
    const vMech = (w, m, path, fx, type, cost) => {
      if (!isObj(m) || !Object.keys(m).length) return err(w, `${path} must be a non-empty object`);
      Object.keys(m).forEach((k) => {
        if (!has('mechs', k)) return err(w, `${path}: unknown mechanic "${k}" (one of ${LISTS.mechs.join(', ')})`);
        if (!(isInt(m[k]) && m[k] >= 1 && m[k] <= 9)) err(w, `${path}.${k} must be a whole number 1..9`);
      });
      const flat = [];
      D.walkOps(A(fx).filter((o) => isObj(o) && o.op !== 'hook'), (o) => { if (o.op !== 'hook') flat.push(o); });
      const hasDmg = flat.some((o) => o.op === 'dmg'), hasBlock = flat.some((o) => o.op === 'block');
      if (['fanbase', 'remix', 'hype', 'finale'].some((k) => m[k] !== undefined) && !hasDmg) err(w, `${path}: fanbase, remix, hype and finale need a dmg op (outside hooks)`);
      if (['duet', 'soundcheck'].some((k) => m[k] !== undefined) && !hasDmg && !hasBlock) err(w, `${path}: duet and soundcheck need a dmg or a block op (outside hooks)`);
      if (m.loop !== undefined && type === 'power') err(w, `${path}: a power cannot Loop`);
      if (m.reprise !== undefined) {
        if (m.reprise !== 1) err(w, `${path}.reprise is always 1`);
        if (type !== 'attack' && type !== 'skill') err(w, `${path}: only an Attack or a Skill can Reprise`);
        if (cost === 'X') err(w, `${path}: an X cost card cannot Reprise (the replay is free)`);
        if (flat.some((o) => o.op === 'pick')) err(w, `${path}: a Reprise card cannot pick (the replay has nobody to choose)`);
        if (m.finale !== undefined) err(w, `${path}: Reprise and Finale do not mix`);
      }
    };

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
            Object.keys(c.up).forEach((k) => { if (['fx', 'cost', 'kw', 'mech'].indexOf(k) < 0) err(w, `up.${k} unknown (up may change fx, cost, kw, mech)`); });
            if (c.up.mech !== undefined) vMech(w, c.up.mech, 'up.mech', c.up.fx || c.fx, c.type, c.up.cost !== undefined ? c.up.cost : c.cost);
            else if (c.mech !== undefined && (c.up.fx || c.up.cost !== undefined)) vMech(w, c.mech, 'mech (upgraded card)', c.up.fx || c.fx, c.type, c.up.cost !== undefined ? c.up.cost : c.cost);
            const upEnv = { cost: c.up.cost !== undefined ? c.up.cost : c.cost };
            if (c.up.fx) vOps(w, c.up.fx, 'card', 'up.fx', upEnv);
            if (c.up.cost !== undefined && !(c.up.cost === 'X' || (isInt(c.up.cost) && c.up.cost >= 0 && c.up.cost <= 5))) err(w, 'up.cost must be 0..5 or "X"');
            if (c.up.kw !== undefined) { if (!Array.isArray(c.up.kw)) err(w, 'up.kw must be an array (it REPLACES kw)'); else c.up.kw.forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}" in up.kw`); }); }
            if (playable && !c.up.fx && c.up.cost === undefined && c.up.kw === undefined && c.up.mech === undefined) err(w, 'up must change fx, cost, kw or mech');
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
        if (c.mech !== undefined) vMech(w, c.mech, 'mech', c.fx, c.type, c.cost);
        if (c.mech !== undefined && !playable) err(w, 'only playable hero cards carry a mech');
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
        // optional flavour line (display only): printable ASCII, at most flavorMax characters, ends with . ! or ?
        if (r.flavor !== undefined) {
          if (!isStr(r.flavor)) err(w, 'flavor must be a non-empty string');
          else {
            if (r.flavor.length > QUOTA.relics.flavorMax) err(w, `flavor over ${QUOTA.relics.flavorMax} characters`);
            if (!/^[\x20-\x7e]+$/.test(r.flavor)) err(w, 'flavor must be printable ASCII');
            if (!/[.!?]$/.test(r.flavor)) err(w, 'flavor must end with . ! or ?');
          }
        }
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
        if (r.set !== undefined && (!isStr(r.set) || !D.relicSets[r.set])) err(w, `set "${r.set}" is not in DATA.relicSets`);
        if (!r.mods && !r.hooks && !r.rows) err(w, 'needs mods, hooks or rows');
        noDash(w, r);
      });
      if (strict) Object.keys(FIXED.relics).forEach((id) => { const r = D.relics[id]; if (!r) err('fixed', `relic "${id}" is not defined`); else if (r.rarity !== FIXED.relics[id]) err('relic ' + id, `must be rarity ${FIXED.relics[id]}`); });
      // ---- relic sets (4.7): {id, name, text, tiers: {2: {text, mods?, hooks?, rows?}, 3: {...}}}; a tier is a virtual Charm, so it takes the Charm checks
      vals(D.relicSets).forEach((s) => {
        const w = 'relicSet ' + s.id;
        Object.keys(s).forEach((k) => { if (['id', 'name', 'text', 'tiers'].indexOf(k) < 0) err(w, `unknown field "${k}" on a relic set`); });
        if (!ID_RE.test(s.id)) err(w, 'id must be snake_case');
        if (!isStr(s.name)) err(w, 'name');
        if (!isStr(s.text)) err(w, 'text'); else if (s.text.length > QUOTA.relics.textMax) err(w, `text over ${QUOTA.relics.textMax} characters`);
        if (!isObj(s.tiers) || !Object.keys(s.tiers).length) return err(w, 'tiers must be an object keyed by the Charm count, {2: {...}, 3: {...}}');
        const ns = Object.keys(s.tiers).map(Number);
        if (!ns.every((n) => isInt(n) && n >= 2 && n <= 8)) err(w, 'tier keys are whole numbers from 2 to 8');
        ns.forEach((n) => {
          const tr = s.tiers[n], p = `tiers.${n}`;
          if (!isObj(tr)) return err(w, `${p} must be an object`);
          Object.keys(tr).forEach((k) => { if (['text', 'mods', 'hooks', 'rows'].indexOf(k) < 0) err(w, `${p}: unknown field "${k}"`); });
          if (!isStr(tr.text)) err(w, `${p}.text`); else if (tr.text.length > QUOTA.relics.textMax) err(w, `${p}.text over ${QUOTA.relics.textMax} characters`);
          if (tr.mods !== undefined) vMods(w, tr.mods, 'mods', 'modKind', p + '.mods');
          if (tr.hooks !== undefined) vHooks(w, tr.hooks, p + '.hooks', 'relic');
          if (tr.rows !== undefined) {
            if (!isObj(tr.rows)) err(w, `${p}.rows must be an object`);
            else Object.keys(tr.rows).forEach((row) => { if (['front', 'back'].indexOf(row) < 0) err(w, `${p}.rows.${row}`); else cmp(w, tr.rows[row], `${p}.rows.${row}`, LISTS.rowFields, true); });
          }
          if (!tr.mods && !tr.hooks && !tr.rows) err(w, `${p} needs mods, hooks or rows`);
        });
        noDash(w, s);
      });
    }

    // ---- mascots (4.7 "The Mascot"): {id, name, blurb, art:{m, c}, levels: {1: {text, mods?, hooks?, rows?}, 2: {...}, 3: {...}}}; a level is a virtual Charm ----
    if (want('mascots')) {
      const LV = ECONOMY.mascotXp.length;
      vals(D.mascots).forEach((m) => {
        const w = 'mascot ' + m.id;
        fields(w, m, 'mascot');
        if (!ID_RE.test(m.id)) err(w, 'id must be snake_case');
        if (!isStr(m.name) || m.name.length > 24) err(w, 'name must be 1 to 24 characters');
        if (!isStr(m.blurb)) err(w, 'blurb must be a non-empty string');
        else {
          if (m.blurb.length > QUOTA.relics.flavorMax) err(w, `blurb over ${QUOTA.relics.flavorMax} characters`);
          if (!/^[\x20-\x7e]+$/.test(m.blurb)) err(w, 'blurb must be printable ASCII');
          if (!/[.!?]$/.test(m.blurb)) err(w, 'blurb must end with . ! or ?');
        }
        if (!isObj(m.art) || !has('motifs', m.art.m)) err(w, `art.m "${m.art && m.art.m}" not in LISTS.motifs`);
        else if (m.art.c && !has('palettes', m.art.c)) err(w, 'art.c not in LISTS.palettes');
        if (!isObj(m.levels)) return err(w, `levels must be an object keyed by level, {1: {...}, 2: {...}, 3: {...}}`);
        const ns = Object.keys(m.levels).map(Number).sort((a, b) => a - b);
        if (ns.length !== LV || !ns.every((n, i) => n === i + 1)) err(w, `levels must be exactly 1..${LV} (ECONOMY.mascotXp has ${LV} thresholds)`);
        ns.forEach((n) => {
          const lv = m.levels[n], p = `levels.${n}`;
          if (!isObj(lv)) return err(w, `${p} must be an object`);
          Object.keys(lv).forEach((k) => { if (['text', 'mods', 'hooks', 'rows'].indexOf(k) < 0) err(w, `${p}: unknown field "${k}"`); });
          if (!isStr(lv.text)) err(w, `${p}.text`); else if (lv.text.length > QUOTA.relics.textMax) err(w, `${p}.text over ${QUOTA.relics.textMax} characters`);
          if (lv.mods !== undefined) vMods(w, lv.mods, 'mods', 'modKind', p + '.mods');
          if (lv.hooks !== undefined) vHooks(w, lv.hooks, p + '.hooks', 'relic');
          if (lv.rows !== undefined) {
            if (!isObj(lv.rows)) err(w, `${p}.rows must be an object`);
            else Object.keys(lv.rows).forEach((row) => { if (['front', 'back'].indexOf(row) < 0) err(w, `${p}.rows.${row}`); else cmp(w, lv.rows[row], `${p}.rows.${row}`, LISTS.rowFields, true); });
          }
          if (!lv.mods && !lv.hooks && !lv.rows) err(w, `${p} needs mods, hooks or rows`);
        });
        noDash(w, m);
      });
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
              if (c.req.mascot !== undefined && !isBool(c.req.mascot)) err(w, `${cp}.req.mascot must be a boolean (false: no mascot yet, true: needs one)`);
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
        if (o.op === 'adoptMascot' && o.id && !D.mascots[o.id]) err(w, `adoptMascot: unknown mascot "${o.id}"`);
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
      // every set is completable by any party from a fresh profile: at least as many unlocked, hero-free members as its top tier asks for
      vals(D.relicSets).forEach((s) => {
        const top = D.setMax(s.id), free = count(rs, (x) => x.set === s.id && !x.locked && !x.hero);
        need('relics', free >= top, `set ${s.id} asks for ${top} Charms but only ${free} unlocked party-wide Charms belong to it`);
      });
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

    if (want('mascots')) {
      const ms = vals(D.mascots);
      need('mascots', ms.length === QUOTA.mascots, `need exactly ${QUOTA.mascots} mascots, have ${ms.length}`);
      // Breath and hand size stay Headliner trades: no level gives either, and every mascot is a different animal
      ms.forEach((m) => Object.keys(O(m.levels)).forEach((n) => {
        const lv = O(m.levels[n]);
        need('mascots', !(lv.mods && (lv.mods.energy || lv.mods.hand)), `${m.id} level ${n}: no mascot level may change Breath or hand size`);
        A(lv.hooks).forEach((h) => D.walkOps(O(h).fx, (o) => need('mascots', o.op !== 'energy' && o.op !== 'draw' || (h.every >= 3 || h.limit === 1), `${m.id} level ${n}: a Breath or draw hook must be gated (every 3+ or limit 1)`)));
      }));
      need('mascots', new Set(ms.map((m) => m.name)).size === ms.length, 'mascot names are unique');
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

  // Card mechanics: data_text.js installs resolveCard, cardHtml and cardPlain with Object.assign, which goes through these setters,
  // so every caller of DATA.resolveCard / cardHtml / cardPlain sees the mechanics (see "Card mechanics" above). Until data_text.js has
  // loaded the getters return undefined, exactly as before.
  const MECH_WRAP = { resolveCard: wrapResolve, cardHtml: wrapHtml, cardPlain: wrapPlain };
  Object.keys(MECH_WRAP).forEach((k) => {
    let fn;
    Object.defineProperty(D, k, { enumerable: true, configurable: true, get: () => fn, set: (v) => { fn = typeof v === 'function' ? MECH_WRAP[k](v) : v; } });
  });

  // ==================================================================================================================
  // The Crowd and Medleys: the two run systems (DESIGN 4.3 "Medleys", 4.2 "The Crowd"). A separate block: it touches none of the
  // card mechanics above, it only wraps whatever resolveCard they install.
  //
  // THE CROWD (COMBAT owns the meter): every card played adds 1, a defeated enemy adds 2, and at mods.crowd (ECONOMY.crowd, 7; Encore 5+
  //   adds 1 through trial_5) the crowd goes wild: a temp copy of a hero's SIGNATURE card (DATA.heroes[id].signature, an Attack or Skill)
  //   joins the hand with `crowd: true`, which resolves as cost 0 with Fade (below). The lead hero's signature comes first, then the
  //   other hero's, and so on. D.signatureOf(heroId) -> card id | null.
  //
  // MEDLEY (RUN makes them, after an elite fight): a deck instance {uid, id: 'medley', parts: [idA, idB], up, gems, enc?}. Both parts are
  //   Attack or Skill cards of ONE hero, never a Medley themselves. The merged definition (D.medleyDef(parts)) is what every reader of a
  //   card definition gets from D.cardDef(inst): name "A and B", hero, type attack when either part is one (else skill), rarity rare,
  //   cost max(costA, costB) clamped to 1..3 (an X part makes the Medley cost X), fx A then B, kw the union, slots the union capped at 3
  //   (A's first), mech merged by max; `up` (when either part has one) does the same with the upgraded parts, so one upgrade lifts both
  //   songs. Resolving a Medley instance resolves each part with its own share of the gems (slot i belongs to A while i < A.slots.length)
  //   and merges the results the same way; the card mechanics wrapper above then adds the merged mech bonuses on top.
  //   D.isMedley(inst)   D.canMedley(instA, instB) -> {ok, reason?: card|same|medley|type|hero}   D.cardDef(inst | id) -> def | undefined
  // ==================================================================================================================
  const MEDLEY_ID = 'medley';
  const MEDLEY_TYPES = ['attack', 'skill'];
  const medleyCache = new Map();
  const isPartId = (id) => typeof id === 'string' && !!D.cards[id] && MEDLEY_TYPES.indexOf(D.cards[id].type) >= 0 && LISTS.heroIds.indexOf(D.cards[id].hero) >= 0;
  D.MEDLEY_ID = MEDLEY_ID;
  D.isMedley = (inst) => !!inst && typeof inst === 'object' && inst.id === MEDLEY_ID && Array.isArray(inst.parts) && inst.parts.length === 2;
  D.medleyPartsOk = (parts) => Array.isArray(parts) && parts.length === 2 && parts.every(isPartId) && D.cards[parts[0]].hero === D.cards[parts[1]].hero;
  D.signatureOf = (heroId) => { const h = heroes[heroId]; const id = h && h.signature; return id && D.cards[id] ? id : null; };
  // whether two deck instances may be fused: the same hero, Attack or Skill, two different cards of the deck, neither a Medley
  D.canMedley = (a, b) => {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return { ok: false, reason: 'card' };
    if (a === b || (a.uid !== undefined && a.uid === b.uid)) return { ok: false, reason: 'same' };
    if (D.isMedley(a) || D.isMedley(b) || a.id === MEDLEY_ID || b.id === MEDLEY_ID) return { ok: false, reason: 'medley' };
    if (!isPartId(a.id) || !isPartId(b.id)) return { ok: false, reason: 'type' };
    if (D.cards[a.id].hero !== D.cards[b.id].hero) return { ok: false, reason: 'hero' };
    return { ok: true };
  };
  const medleyCost = (ca, cb) => (ca === 'X' || cb === 'X' ? 'X' : Math.min(3, Math.max(1, isNum(ca) ? ca : 0, isNum(cb) ? cb : 0)));
  const medleyKw = (ka, kb) => (ka || []).concat((kb || []).filter((k) => (ka || []).indexOf(k) < 0));
  const medleyMech = (ma, mb) => {
    const out = {};
    [ma, mb].forEach((m) => { if (m && typeof m === 'object') Object.keys(m).forEach((k) => { if (isNum(m[k])) out[k] = Math.max(out[k] || 0, m[k]); }); });
    return Object.keys(out).length ? out : undefined;
  };
  // the parts' definitions at one upgrade state: {fx, cost, kw, mech}
  const partView = (def, up) => {
    const u = up && def.up ? def.up : null;
    return { fx: u && u.fx ? u.fx : (def.fx || []), cost: u && u.cost !== undefined ? u.cost : def.cost, kw: u && u.kw !== undefined ? u.kw : (def.kw || []), mech: u && u.mech !== undefined ? u.mech : def.mech };
  };
  D.medleyDef = (parts) => {
    if (!D.medleyPartsOk(parts)) return undefined;
    const key = parts[0] + '+' + parts[1];
    let def = medleyCache.get(key);
    const A = D.cards[parts[0]], B = D.cards[parts[1]];
    if (def && def._a === A && def._b === B) return def;
    const a = partView(A, false), b = partView(B, false);
    const slots = (A.slots || []).concat(B.slots || []).slice(0, 3);
    def = {
      id: MEDLEY_ID, medley: true, parts: parts.slice(), name: A.name + ' and ' + B.name, hero: A.hero,
      type: A.type === 'attack' || B.type === 'attack' ? 'attack' : 'skill', rarity: 'rare',
      cost: medleyCost(a.cost, b.cost), fx: a.fx.concat(b.fx), kw: medleyKw(a.kw, b.kw), slots, art: A.art,
      flavor: 'Two songs, one breath.',
    };
    const mech = medleyMech(a.mech, b.mech);
    if (mech) def.mech = mech;
    if (A.up || B.up) {
      const ua = partView(A, true), ub = partView(B, true);
      def.up = { fx: ua.fx.concat(ub.fx), cost: medleyCost(ua.cost, ub.cost), kw: medleyKw(ua.kw, ub.kw) };
      const um = medleyMech(ua.mech, ub.mech);
      if (um) def.up.mech = um;
    }
    Object.defineProperty(def, '_a', { value: A, enumerable: false });
    Object.defineProperty(def, '_b', { value: B, enumerable: false });
    medleyCache.set(key, def);
    return def;
  };
  // the definition behind an instance or an id: D.cards[id], or the merged definition of a Medley instance
  D.cardDef = (x) => {
    if (typeof x === 'string') return D.cards[x];
    if (!x || typeof x !== 'object') return undefined;
    if (x.id === MEDLEY_ID) return D.medleyDef(x.parts);
    return D.cards[x.id];
  };
  // resolve a Medley: each part with its own gems, then the merge above on the results. raw is data_text's resolveCard.
  function resolveMedley(raw, inst, ctx) {
    const def = D.medleyDef(inst.parts);
    if (!def) return raw({ id: inst.id, up: inst.up, gems: [] }, ctx);
    const A = D.cards[inst.parts[0]], na = (A.slots || []).length;
    const gems = def.slots.map((_, i) => (inst.gems && inst.gems[i]) || null);
    const up = !!inst.up && !!def.up;
    const ra = raw({ id: inst.parts[0], up: up ? 1 : 0, gems: gems.slice(0, na) }, ctx);
    const rb = raw({ id: inst.parts[1], up: up ? 1 : 0, gems: gems.slice(na) }, ctx);
    const kw = medleyKw(ra.kw, rb.kw);
    const cost = medleyCost(ra.cost, rb.cost);
    return {
      inst, def, id: MEDLEY_ID, name: def.name + (up ? '+' : ''), cost, costX: cost === 'X', type: def.type, rarity: def.rarity, kw, slots: def.slots.slice(),
      gems, fx: ra.fx.concat(rb.fx), hero: def.hero, up, playableType: def.type, art: def.art, medley: true,
      gemActive: ra.gemActive.concat(rb.gemActive).slice(0, def.slots.length), gemNotes: ra.gemNotes.concat(rb.gemNotes.map((n) => Object.assign({}, n, { slot: n.slot + na }))),
      base: { fx: def.fx, cost: def.cost, kw: def.kw },
    };
  }
  // a Crowd copy (inst.crowd) is free and Fades
  const wrapSystems = (raw) => function resolveCard(x, ctx) {
    const inst = x && typeof x === 'object' ? x : null;
    let res = inst && D.isMedley(inst) ? resolveMedley(raw, inst, ctx) : raw(x, ctx);
    if (inst && inst.crowd && res && res.def) {
      res = Object.assign({}, res, { crowd: true });
      if (res.cost !== null) { res.cost = 0; res.costX = false; }
      if (res.kw.indexOf('exhaust') < 0) res.kw = res.kw.concat(['exhaust']);
    }
    return res;
  };
  {
    const d = Object.getOwnPropertyDescriptor(D, 'resolveCard');          // the card mechanics accessor above: its setter wraps what it is given
    Object.defineProperty(D, 'resolveCard', { enumerable: true, configurable: true, get: d.get, set: (v) => d.set(typeof v === 'function' ? wrapSystems(v) : v) });
    // targetMode and cardOps (data_text.js) resolve a plain instance themselves; a Medley or Crowd instance goes through D.resolveCard first
    const viaResolve = (raw) => function (x) { const inst = x && typeof x === 'object' && !x.inst && (D.isMedley(x) || x.crowd) ? D.resolveCard(x) : x; return raw.apply(this, [inst].concat(Array.prototype.slice.call(arguments, 1))); };
    ['targetMode', 'cardOps'].forEach((k) => {
      let fn;
      Object.defineProperty(D, k, { enumerable: true, configurable: true, get: () => fn, set: (v) => { fn = typeof v === 'function' ? viaResolve(v) : v; } });
    });
  }

  return D;
})();
