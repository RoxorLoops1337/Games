/* SUNBEAM SIEGE relics. Agent B13. SB.data.relics (classic script, no modules).
 *
 * SCHEMA
 *   id        relic_<snake>, unique
 *   name, text (rules text, no em dashes), flavor (dry, under 90 chars), art (sprite hint)
 *   rarity    starter | common | uncommon | rare | boss | shop
 *   clan      alley | hearth | moon | mischief | null (neutral). Clan relics weigh x2 for main/side clan, x0 otherwise (A07).
 *   tags      "synergy" (bends a run toward a clan loop), "rule" (changes a core rule via mods),
 *             "stack" (grows over the run), "heirloom", "boss", "shop", "revive", "economy", "upgrade"
 *   price     Fish base (A07 +-10% rolled by shop). null if never sold.
 *   hooks     [ { on, if?, limit?, effects[] } ]
 *               on      engine event name (list below)
 *               if      A03 condition list (AND)
 *               limit   { per: "turn"|"battle"|"act"|"run", n } max firings in that scope
 *               effects A03 effect DSL, resolved in order on the FIFO queue (relics first, A02 section 4)
 *   mods      static rule modifiers read by the engine every time it computes the value (see MODS)
 *   counter   { start, cap, reset } growth store, reset: "never" | "act" | "battle". Effects use
 *             { type:"counter", op:"add"|"set", amount } and AmountExpr { base, per:"counter", mult }.
 *   pickup    effects run once when the relic is acquired (onPickup shorthand)
 *
 * HOOK NAMES USED (all must be emitted by the engine)
 *   From A02: onBattleStart onTurnStart onTurnEnd onDeath onDamaged onArmorBroken onLifeSpent onFinalDeath
 *             onSunbeamHit onSpawn onSummon onPush onZoomies
 *   From A03: onCardPlayed onAttack onKill onDeathOfPest onCatDeployed onDrawn onShuffle onExhaust onDiscard
 *   From A05: onLifeLost onKnock onShatter onBoxPlaced onBoxEnter onBoxFlattened onUnbox onNapStart onNapTick
 *             onWake onPounce onRudeAwakening onPileChange onNipGain onSurgeStart onSurgeEnd onCrashStart
 *             onNightPhase(phase) onZoom onFrazzled
 *   New (see NEEDS): onFightEnd onActStart onPickup onShopEnter onLoss onStatusApplied onReborn
 *
 * MODS USED (numbers are deltas unless stated)
 *   baseZoomies drawPerTurn handLimit maxWarmth catMaxHealth catPower catLivesCap(none) retainSlots
 *   maxRested pileBonus pileHealMinSize pileIgnoreGaps purrDecayEvery napOnPlay surgeAt surgeZoomies crashTurns
 *   witchingEvery witchingZoomies nightVisitorThreatPct firstBoxFree boxCapacity largeCatsFitBoxes roomSlots
 *   corneredAt corneredBonus frenzyNoSelfDamage flapDelay attackOrder(string) noPounce noZoom
 *   shopPricePct sellPricePct removalNoEscalate fishGainPct shopExtraRelic shopExtraRare freeShopReroll
 *   postExtraOffers postStallPct masteryThresholdDelta masteryExtraPlay birthThreshold legendCeremonyFree
 *   adoptOutFree postcardFish freeLitterPerAct boxSwapChoices boxSwapKeepsMastery champTierCrossPath
 *   champStartTier whittleSlotsPerAct emeryDoublePost kneadFirstDouble
 *
 * NEEDS (engine agent, new things this file relies on):
 *   Effect types: counter (op add/set), shade (amount, Sunbeam armor), fish (amount, may be negative),
 *     addCard (pool:{rarity,clan}|card id, to:"deck"), consumeRelic, setWarmth, preventWake (target cat),
 *     zoomies with nextTurn:true, applyStatus on "floorsWithMostCats" style targets, scry (look at top N draw cards),
 *     rerollShop.
 *   Targets: fullestFloor (floor with most cats), allCatsOnFloor with floor:N param, topFloorEnemies,
 *     cardPlayed (the card that fired onCardPlayed), napperCats, attackingPest.
 *   Conditions: counter (this relic's counter), selfAsleep, cardTag, cardKeyword, cardCost, cardId, warmth,
 *     fightType (prowl|night|elite|boss), targetHasStatus:<id>, round, isWitchingHour, nappingCats, extraAttack.
 *   AmountExpr counters: counter (this relic), napping, cardsPlayedThisFight, nipExcess.
 *   Hook payload fields: onKnock {enemy, from, to, shatter}, onPounce {cat, bonus}, onFinalDeath {cat}, onLoss {}.
 *   More effect types: cleanse (status, target), clearFloorEnemies (floor), setWarmth, shopDiscountFirst (percent).
 *   More targets: triggerSourceKiller (the cat that made the kill), champion, firstToyInHand, randomCat, allCats.
 *   More checks: counterMod8 (counter % 8), pileSize, statusId (on onStatusApplied), cardType, cardKeyword:<id>.
 *   mods atticCatDamageReduction (flat damage cut for cats on floor 3). AmountExpr mult may be fractional; result floors.
 *   mods catPower/catMaxHealth/maxWarmth/handLimit etc. are summed over all owned relics.
 *   Limits system: per turn/battle/act/run counters stored on the relic instance, reset by the engine.
 *   Status ids used: claws purr fluff yarn catnip rested marked hidden bristle dizzy rage frenzy wet scared hairball.
 *   Loader should validate relic ids unique and every hook name above exists.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  var R = [];
  function add(o) { R.push(o); }

  /* ================= STARTER: clan heirlooms (2 per clan, 8) ================= */
  add({ id: "relic_torn_ear_tag", name: "Torn Ear Tag", rarity: "starter", clan: "alley", tags: ["heirloom"],
    text: "The first cat you deploy each battle gains Claws 2.",
    flavor: "Awarded for services to the neighbourhood. Nobody ordered it.",
    art: "ragged orange ear tag on a bent safety pin", price: null,
    hooks: [{ on: "onCatDeployed", limit: { per: "battle", n: 1 }, effects: [{ type: "applyStatus", status: "claws", amount: 2, target: "triggerSource" }] }] });
  add({ id: "relic_notched_collar", name: "Notched Collar", rarity: "starter", clan: "alley", tags: ["heirloom"],
    text: "The first kill each round gives the killer Claws 1.",
    flavor: "One notch per argument. The collar is nearly out of room.",
    art: "scuffed leather collar with tally notches", price: null,
    hooks: [{ on: "onKill", limit: { per: "turn", n: 1 }, effects: [{ type: "applyStatus", status: "claws", amount: 1, target: "triggerSourceKiller" }] }] });

  add({ id: "relic_well_loved_blanket", name: "Well-Loved Blanket", rarity: "starter", clan: "hearth", tags: ["heirloom"],
    text: "End of your turn: add 1 Purr to the floor with the most cats.",
    flavor: "Holes in all the right places. Do not wash it.",
    art: "patchwork cream blanket with a paw-shaped dent", price: null,
    hooks: [{ on: "onTurnEnd", effects: [{ type: "floorStatus", status: "purr", amount: 1, target: "fullestFloor" }] }] });
  add({ id: "relic_warm_brick", name: "Warm Brick", rarity: "starter", clan: "hearth", tags: ["heirloom"],
    text: "Every cat starts the battle with Fluff 3, including cats deployed later.",
    flavor: "Wrapped in a tea towel. Heated by optimism.",
    art: "red brick in a gingham tea towel, faint steam", price: null,
    hooks: [{ on: "onBattleStart", effects: [{ type: "fluff", amount: 3, target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "fluff", amount: 3, target: "triggerSource" }] }] });

  add({ id: "relic_silver_bell", name: "Silver Bell", rarity: "starter", clan: "moon", tags: ["heirloom"],
    text: "Whenever a cat loses a Life, draw 1 card (once per turn).",
    flavor: "Rings softly when it matters. Rings louder when it really matters.",
    art: "tarnished silver bell on a violet ribbon", price: null,
    hooks: [{ on: "onLifeLost", limit: { per: "turn", n: 1 }, effects: [{ type: "draw", amount: 1, target: "player" }] }] });
  add({ id: "relic_dusty_star_chart", name: "Dusty Star Chart", rarity: "starter", clan: "moon", tags: ["heirloom"],
    text: "When a Witching Hour begins, every pest gains Marked 1.",
    flavor: "The constellations are mostly a cat, a bowl and a worried moth.",
    art: "folded indigo star map with a tea ring", price: null,
    hooks: [{ on: "onNightPhase", if: [{ check: "isWitchingHour", op: "==", value: true }], effects: [{ type: "applyStatus", status: "marked", amount: 1, target: "allEnemies" }] }] });

  add({ id: "relic_dusty_mouse_toy", name: "Dusty Mouse Toy", rarity: "starter", clan: "mischief", tags: ["heirloom"],
    text: "Start of battle: gain 2 Nip.",
    flavor: "Found under the fridge. Smells of ambition.",
    art: "grey felt mouse with one eye and a faded tail", price: null,
    hooks: [{ on: "onBattleStart", effects: [{ type: "catnip", amount: 2 }] }] });
  add({ id: "relic_frayed_yarn_ball", name: "Frayed Yarn Ball", rarity: "starter", clan: "mischief", tags: ["heirloom"],
    text: "The first pest to spawn each battle gains Yarn 2.",
    flavor: "Unravelled by professionals.",
    art: "magenta yarn ball trailing a long loose thread", price: null,
    hooks: [{ on: "onSpawn", limit: { per: "battle", n: 1 }, effects: [{ type: "applyStatus", status: "yarn", amount: 2, target: "triggerSource" }] }] });

  /* ================= COMMON (26) ================= */
  add({ id: "relic_collar_of_bells", name: "Collar of Bells", rarity: "common", clan: null, tags: [],
    text: "Whenever a cat is deployed, it gains Fluff 2.",
    flavor: "Announces every cat. Pests are not scared. They are mildly annoyed.",
    art: "red collar with three brass bells", price: 110,
    hooks: [{ on: "onCatDeployed", effects: [{ type: "fluff", amount: 2, target: "triggerSource" }] }] });
  add({ id: "relic_sunbeam_sticker", name: "Sunbeam Sticker", rarity: "common", clan: null, tags: [],
    text: "Start of battle: gain 4 Shade.",
    flavor: "Peel and stick. The Sunbeam pretends not to notice.",
    art: "yellow sun decal on a window pane", price: 110,
    hooks: [{ on: "onBattleStart", effects: [{ type: "shade", amount: 4 }] }] });
  add({ id: "relic_cracked_bell", name: "Cracked Bell", rarity: "common", clan: "moon", tags: [],
    text: "Whenever a cat loses a Life, gain 1 Zoomies next turn (max 2 per turn).",
    flavor: "It rings when something goes wrong. Which is often.",
    art: "small brass bell with a diagonal crack", price: 110,
    hooks: [{ on: "onLifeLost", limit: { per: "turn", n: 2 }, effects: [{ type: "zoomies", amount: 1, nextTurn: true }] }] });
  add({ id: "relic_glass_of_water", name: "Glass of Water", rarity: "common", clan: "mischief", tags: ["synergy"],
    text: "The first pest you Knock each battle takes 4 extra Shatter.",
    flavor: "Placed at the exact edge. On purpose.",
    art: "half full tumbler balanced on a shelf edge", price: 110,
    hooks: [{ on: "onKnock", limit: { per: "battle", n: 1 }, effects: [{ type: "damage", kind: "shatter", amount: 4, target: "attackTarget" }] }] });
  add({ id: "relic_sun_patch_cushion", name: "Sun Patch Cushion", rarity: "common", clan: "hearth", tags: ["synergy"],
    text: "Max Rested +2. Napping cats heal 1 more each round.",
    flavor: "Always the right temperature. Always taken.",
    art: "gold cushion with a square of light on it", price: 110,
    mods: { maxRested: 2 },
    hooks: [{ on: "onNapTick", effects: [{ type: "heal", amount: 1, target: "triggerSource" }] }] });
  add({ id: "relic_the_good_cushion", name: "The Good Cushion", rarity: "common", clan: "hearth", tags: ["synergy"],
    text: "Whenever a cat starts a Nap, it gains Fluff 3 and the floor gains 1 Purr.",
    flavor: "Nobody may sit on it. Everybody does.",
    art: "plump velvet cushion with a cat-shaped dent", price: 110,
    hooks: [{ on: "onNapStart", effects: [{ type: "fluff", amount: 3, target: "triggerSource" }, { type: "floorStatus", status: "purr", amount: 1, target: "thisFloor" }] }] });
  add({ id: "relic_family_portrait", name: "Family Portrait", rarity: "common", clan: "hearth", tags: ["synergy"],
    text: "Piles count as 1 cat larger than their real size.",
    flavor: "Everyone is looking in a slightly different direction.",
    art: "framed photo of five cats facing five ways", price: 110,
    mods: { pileBonus: 1 } });
  add({ id: "relic_night_owl_goggles", name: "Night Owl Goggles", rarity: "common", clan: "moon", tags: ["synergy"],
    text: "Witching Hour gives +1 more Zoomies.",
    flavor: "Not an owl. Does not care.",
    art: "oversized round goggles with amber lenses", price: 110,
    mods: { witchingZoomies: 1 } });
  add({ id: "relic_next_day_delivery", name: "Next Day Delivery", rarity: "common", clan: "mischief", tags: ["synergy"],
    text: "The first Box you play each battle costs 0 and draws 1 card.",
    flavor: "Arrived early. Nobody ordered it.",
    art: "taped parcel with a smug smile drawn on it", price: 110,
    mods: { firstBoxFree: true },
    hooks: [{ on: "onBoxPlaced", limit: { per: "battle", n: 1 }, effects: [{ type: "markFirstBox" }, { type: "draw", amount: 1, target: "player" }] }] });
  add({ id: "relic_catnip_plant_pot", name: "Catnip Plant Pot", rarity: "common", clan: "mischief", tags: ["synergy"],
    text: "Start of battle: gain 3 Nip. Surge gives +1 Zoomies, but Crash lasts 1 turn longer.",
    flavor: "Technically a flowerpot.",
    art: "terracotta pot with chewed green leaves", price: 110,
    mods: { surgeZoomies: 1, crashTurns: 1 },
    hooks: [{ on: "onBattleStart", effects: [{ type: "catnip", amount: 3 }] }] });
  add({ id: "relic_stripped_mat", name: "Stripped Scratching Mat", rarity: "common", clan: "alley", tags: ["synergy"],
    text: "Whenever a cat Pounces, it gains Claws 1 (2 times per round).",
    flavor: "Not a mat any more. A statement.",
    art: "shredded sisal mat with long pale threads", price: 110,
    hooks: [{ on: "onPounce", limit: { per: "turn", n: 2 }, effects: [{ type: "applyStatus", status: "claws", amount: 1, target: "triggerSource" }] }] });
  add({ id: "relic_dented_bin_lid", name: "Dented Bin Lid", rarity: "common", clan: "alley", tags: [],
    text: "Cats on the Cellar start the battle with Fluff 5, including cats deployed there later.",
    flavor: "Rings like a gong. The Cellar considers this a feature.",
    art: "dented steel bin lid used as a shield", price: 110,
    hooks: [{ on: "onBattleStart", effects: [{ type: "fluff", amount: 5, target: "allCatsOnFloor", floor: 1 }] },
            { on: "onCatDeployed", if: [{ check: "targetFloor", op: "==", value: 1 }], effects: [{ type: "fluff", amount: 5, target: "triggerSource" }] }] });
  add({ id: "relic_hair_tie", name: "Hair Tie", rarity: "common", clan: null, tags: ["rule"],
    text: "Hand limit +2.",
    flavor: "Found on the stairs. Always on the stairs.",
    art: "stretched purple hair elastic", price: 110,
    mods: { handLimit: 2 } });
  add({ id: "relic_water_bowl", name: "Water Bowl", rarity: "common", clan: null, tags: [],
    text: "After each battle, restore 3 Warmth.",
    flavor: "Filled daily. Ignored until it is not the right bowl.",
    art: "blue ceramic bowl with a fish painted inside", price: 110,
    hooks: [{ on: "onFightEnd", effects: [{ type: "warmth", amount: 3 }] }] });
  add({ id: "relic_fish_bone_toothpick", name: "Fish Bone Toothpick", rarity: "common", clan: null, tags: ["economy"],
    text: "After each Prowl or Night battle, gain 6 Fish.",
    flavor: "Evidence of a good evening.",
    art: "pale fish bone with a tiny bite mark", price: 110,
    hooks: [{ on: "onFightEnd", if: [{ check: "fightType", op: "!=", value: "boss" }, { check: "fightType", op: "!=", value: "elite" }], effects: [{ type: "fish", amount: 6 }] }] });
  add({ id: "relic_paw_print_in_flour", name: "Paw Print in Flour", rarity: "common", clan: "moon", tags: ["synergy"],
    text: "Whenever a cat spends a Life, that cat gains +1 Power for the rest of the battle.",
    flavor: "Nobody saw who did it. Everybody saw who did it.",
    art: "paw print pressed into white flour on a counter", price: 110,
    hooks: [{ on: "onLifeSpent", effects: [{ type: "cardFightBuff", stat: "power", amount: 1, target: "triggerSource" }] }] });
  add({ id: "relic_chewed_pen_cap", name: "Chewed Pen Cap", rarity: "common", clan: null, tags: [],
    text: "The first 0-cost card you play each turn draws 1 card.",
    flavor: "Evidence of a long meeting.",
    art: "blue pen cap with deep tooth marks", price: 110,
    hooks: [{ on: "onCardPlayed", limit: { per: "turn", n: 1 }, if: [{ check: "cardCost", op: "==", value: 0 }], effects: [{ type: "draw", amount: 1, target: "player" }] }] });
  add({ id: "relic_kibble_scoop", name: "Kibble Scoop", rarity: "common", clan: null, tags: [],
    text: "Round 1 of each battle: gain 1 extra Zoomies.",
    flavor: "A level scoop. Nobody believes it is level.",
    art: "yellow plastic scoop heaped with brown kibble", price: 110,
    hooks: [{ on: "onTurnStart", if: [{ check: "round", op: "==", value: 1 }], effects: [{ type: "zoomies", amount: 1 }] }] });
  add({ id: "relic_growing_twine", name: "Growing Ball of Twine", rarity: "common", clan: null, tags: ["stack"],
    text: "Grows 1 after each battle (max 12). Start of battle: gain Shade equal to its size.",
    flavor: "It was a ball of twine. It is now a household.",
    art: "enormous hairy twine ball, wider each time", price: 110,
    counter: { start: 0, cap: 12, reset: "never" },
    hooks: [{ on: "onBattleStart", effects: [{ type: "shade", amount: { base: 0, per: "counter", mult: 1 } }] },
            { on: "onFightEnd", effects: [{ type: "counter", op: "add", amount: 1 }] }] });
  add({ id: "relic_growing_sweater", name: "Growing Sweater", rarity: "common", clan: "hearth", tags: ["stack"],
    text: "Grows 1 after each battle (max 5). Every cat gains that much max Health for the battle, including cats deployed later.",
    flavor: "Knitted for a kitten. Now fits the dog. There is no dog.",
    art: "oversized cream knit sweater with a stretched neck", price: 110,
    counter: { start: 0, cap: 5, reset: "never" },
    hooks: [{ on: "onBattleStart", effects: [{ type: "buff", stat: "health", amount: { base: 0, per: "counter", mult: 1 }, duration: "fight", target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "buff", stat: "health", amount: { base: 0, per: "counter", mult: 1 }, duration: "fight", target: "triggerSource" }] },
            { on: "onFightEnd", effects: [{ type: "counter", op: "add", amount: 1 }] }] });
  add({ id: "relic_jar_of_moths", name: "Jar of Moths", rarity: "common", clan: "moon", tags: ["stack"],
    text: "Each Witching Hour adds a moth (max 6, kept all run). At a Witching Hour, every cat gains Fluff equal to the moths.",
    flavor: "Do not open the jar. Do not ask who is in the jar.",
    art: "glass jar of pale moths glowing faintly", price: 110,
    counter: { start: 0, cap: 6, reset: "never" },
    hooks: [{ on: "onNightPhase", if: [{ check: "isWitchingHour", op: "==", value: true }], effects: [{ type: "counter", op: "add", amount: 1 }, { type: "fluff", amount: { base: 0, per: "counter", mult: 1 }, target: "allCats" }] }] });
  add({ id: "relic_sisal_sweater", name: "Sisal Sweater", rarity: "common", clan: null, tags: ["upgrade"],
    text: "Scratching Post offers show 1 extra scratch.",
    flavor: "Rough, itchy and loved.",
    art: "woven sisal jumper with sleeves for four", price: 110,
    mods: { postExtraOffers: 1 } });
  add({ id: "relic_practice_mat", name: "Practice Mat", rarity: "common", clan: null, tags: ["upgrade"],
    text: "A card played at least once in a battle counts 1 extra play toward Mastery.",
    flavor: "Repetition builds character. Mostly in the cat.",
    art: "foam yoga mat with claw marks in neat rows", price: 110,
    mods: { masteryExtraPlay: 1 } });
  add({ id: "relic_tally_stick", name: "Tally Stick", rarity: "common", clan: null, tags: ["upgrade"],
    text: "Mastery thresholds are 1 lower (minimum 2).",
    flavor: "Notches for every victory. Also several defeats, in smaller print.",
    art: "wooden stick with neat chisel notches", price: 110,
    mods: { masteryThresholdDelta: -1 } });
  add({ id: "relic_adoption_papers", name: "Adoption Papers", rarity: "common", clan: null, tags: ["upgrade"],
    text: "Adopt Out always costs 0, and each Postcard gives 3 Fish.",
    flavor: "Signed in triplicate. The cat signed the dotted line with a pawprint.",
    art: "stamped form with a pawprint signature", price: 110,
    mods: { adoptOutFree: true, postcardFish: 3 } });
  add({ id: "relic_milk_mirror", name: "Milk Mirror", rarity: "common", clan: null, tags: ["upgrade"],
    text: "The first Litter each Act is free.",
    flavor: "A saucer of milk. You see two of yourself. Both of you want it.",
    art: "white saucer of milk showing a double reflection", price: 110,
    mods: { freeLitterPerAct: 1 } });

  /* ================= UNCOMMON (28) ================= */
  add({ id: "relic_dawn_chorus", name: "Dawn Chorus", rarity: "uncommon", clan: "moon", tags: ["synergy"],
    text: "At the end of a Witching Hour round, every awake cat heals 2 and loses Frazzled.",
    flavor: "The birds have no idea what they started.",
    art: "tiny sparrow on a windowsill at first light", price: 160,
    hooks: [{ on: "onDusk", if: [{ check: "isWitchingHour", op: "==", value: true }], effects: [{ type: "heal", amount: 2, target: "allCats" }, { type: "cleanseFrazzle" }] }] });
  add({ id: "relic_do_not_disturb_sign", name: "Do Not Disturb Sign", rarity: "uncommon", clan: "hearth", tags: [],
    text: "The first time each battle a napping cat takes damage, it does not wake.",
    flavor: "Written in a language only pests read.",
    art: "door hanger sign with a drawn sleeping cat", price: 160,
    mods: { doNotDisturb: true }, hooks: [] });
  add({ id: "relic_rage_bait_treats", name: "Rage-Bait Treats", rarity: "uncommon", clan: "alley", tags: ["synergy"],
    text: "Pests spawn with Rage 1. Cats deal 2 extra damage to Raging pests.",
    flavor: "Held just out of reach. Delivered just out of reach.",
    art: "paper bag of fish treats with a smug paw on it", price: 160,
    hooks: [{ on: "onSpawn", effects: [{ type: "applyStatus", status: "rage", amount: 1, target: "triggerSource" }] },
            { on: "onHit", if: [{ check: "selfHasStatus:rage", op: "==", value: true }], effects: [{ type: "damage", amount: 2, kind: "direct", target: "triggerSource" }] }] });
  add({ id: "relic_zoomie_fuel", name: "Zoomie Fuel", rarity: "uncommon", clan: "alley", tags: ["synergy"],
    text: "The first kill each round gives the killer Frenzy 1.",
    flavor: "Contains colouring, flavouring and regret.",
    art: "small orange canister with a lightning bolt", price: 160,
    hooks: [{ on: "onKill", limit: { per: "turn", n: 1 }, effects: [{ type: "applyStatus", status: "frenzy", amount: 1, target: "triggerSourceKiller" }] }] });
  add({ id: "relic_shredded_curtain", name: "Shredded Curtain", rarity: "uncommon", clan: "alley", tags: ["synergy", "rule"],
    text: "Frenzy extra hits no longer cost the cat Health.",
    flavor: "It was an expensive curtain. It is now an expensive gesture.",
    art: "ribboned velvet curtain hanging in strips", price: 160,
    mods: { frenzyNoSelfDamage: true } });
  add({ id: "relic_pile_permit", name: "Pile Permit", rarity: "uncommon", clan: "hearth", tags: ["synergy"],
    text: "Piles of 2 or more heal each member 1 per round (Piles of 3 or more heal 2).",
    flavor: "Approved by the cushion committee. Two signatures, both fluffy.",
    art: "stamped permit with a heap of sleeping cats", price: 160,
    mods: { pileHealMinSize: 2 },
    hooks: [{ on: "onDusk", effects: [{ type: "pileHeal", minSize: 3, amount: 1 }] }] });
  add({ id: "relic_hot_water_bottle", name: "Hot Water Bottle", rarity: "uncommon", clan: "hearth", tags: [],
    text: "End of your turn: restore 1 Warmth for each napping cat (max 4).",
    flavor: "Leaks very slightly into the Sunbeam. Nobody minds.",
    art: "pink rubber bottle with a knitted cover", price: 160,
    hooks: [{ on: "onTurnEnd", if: [{ check: "nappingCats", op: ">=", value: 1 }], effects: [{ type: "warmth", amount: { base: 0, per: "napping", mult: 1, cap: 4 } }] }] });
  add({ id: "relic_moth_lantern", name: "Moth Lantern", rarity: "uncommon", clan: "moon", tags: ["synergy"],
    text: "Whenever a cat Zooms at a Witching Hour, its target gains Marked 1.",
    flavor: "The moths are not here for the light. They are here for you.",
    art: "paper lantern with silhouettes of moths", price: 160,
    hooks: [{ on: "onZoom", effects: [{ type: "applyStatus", status: "marked", amount: 1, target: "attackTarget" }] }] });
  add({ id: "relic_nip_jar_lid", name: "Nip Jar Lid", rarity: "uncommon", clan: "mischief", tags: ["synergy", "rule"],
    text: "Surge triggers at 8 Nip instead of 10.",
    flavor: "Screwed on tight. Unscrewed on purpose.",
    art: "green metal jar lid with a leaf stamped on it", price: 160,
    mods: { surgeAt: -2 } });
  add({ id: "relic_kept_receipt", name: "Kept Receipt", rarity: "uncommon", clan: null, tags: ["rule"],
    text: "Retain 1 card of your choice at the end of each turn.",
    flavor: "For a purchase nobody remembers. Might need it.",
    art: "curled paper receipt tucked under a paperweight", price: 160,
    mods: { retainSlots: 1 } });
  add({ id: "relic_rubber_cat_flap", name: "Rubber Cat Flap", rarity: "uncommon", clan: "mischief", tags: ["rule"],
    text: "Pests Knocked out through the cat flap take 2 more rounds to come back.",
    flavor: "The flap is on a slow spring. Please do not ask the pest.",
    art: "black rubber flap hung in a small door", price: 160,
    mods: { flapDelay: 2 } });
  add({ id: "relic_insomnia_mask", name: "Insomnia Mask", rarity: "uncommon", clan: "hearth", tags: ["rule"],
    text: "Cats may Nap the turn they are played.",
    flavor: "A sleep mask for cats who were never awake.",
    art: "satin eye mask with painted open eyes", price: 160,
    mods: { napOnPlay: true } });
  add({ id: "relic_notched_doorframe", name: "Notched Doorframe", rarity: "uncommon", clan: "alley", tags: ["stack"],
    text: "Counts cat kills all run (max 40). Every cat gains +1 Power per 10 kills for the battle, including cats deployed later.",
    flavor: "Height chart of the neighbourhood's worst enemies.",
    art: "painted door jamb with claw-height lines", price: 160,
    counter: { start: 0, cap: 40, reset: "never" },
    hooks: [{ on: "onKill", effects: [{ type: "counter", op: "add", amount: 1 }] },
            { on: "onBattleStart", effects: [{ type: "buff", stat: "power", amount: { base: 0, per: "counter", mult: 0.1 }, duration: "fight", target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "buff", stat: "power", amount: { base: 0, per: "counter", mult: 0.1 }, duration: "fight", target: "triggerSource" }] }] });
  add({ id: "relic_ledger_of_lives", name: "Ledger of Lives", rarity: "uncommon", clan: "moon", tags: ["stack"],
    text: "Each Life a cat loses adds a tally (max 18, kept all run). Every cat starts the battle with Fluff equal to tallies divided by 3, including cats deployed later.",
    flavor: "Kept in beautiful handwriting. The numbers are not beautiful.",
    art: "leather ledger with a ribbon bookmark and tally marks", price: 160,
    counter: { start: 0, cap: 18, reset: "never" },
    hooks: [{ on: "onLifeLost", effects: [{ type: "counter", op: "add", amount: 1 }] },
            { on: "onBattleStart", effects: [{ type: "fluff", amount: { base: 0, per: "counter", mult: 0.34 }, target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "fluff", amount: { base: 0, per: "counter", mult: 0.34 }, target: "triggerSource" }] }] });
  add({ id: "relic_catnip_stain", name: "Catnip Stain", rarity: "uncommon", clan: "mischief", tags: ["stack"],
    text: "Each Surge this battle adds +1 to every Nip gain after it (resets each battle).",
    flavor: "Does not wash out. Does not want to.",
    art: "green stain spreading across a rug", price: 160,
    counter: { start: 0, cap: 5, reset: "battle" },
    hooks: [{ on: "onBattleStart", effects: [{ type: "counter", op: "set", amount: 0 }] },
            { on: "onSurgeStart", effects: [{ type: "counter", op: "add", amount: 1 }] },
            { on: "onNipGain", if: [{ check: "counter", op: ">=", value: 1 }], limit: { per: "turn", n: 3 }, effects: [{ type: "catnip", amount: { base: 0, per: "counter", mult: 1 } }] }] });
  add({ id: "relic_pedometer", name: "Cat Pedometer", rarity: "uncommon", clan: null, tags: ["stack"],
    text: "Counts cards played this battle. Every 8th card gives 1 Zoomies and 3 Fluff to a random cat.",
    flavor: "Mostly measures stairs. Most of the cat's steps are stairs.",
    art: "tiny clip-on step counter on a collar", price: 160,
    counter: { start: 0, cap: 99, reset: "battle" },
    hooks: [{ on: "onBattleStart", effects: [{ type: "counter", op: "set", amount: 0 }] },
            { on: "onCardPlayed", effects: [{ type: "counter", op: "add", amount: 1 },
      { type: "zoomies", amount: 1, if: [{ check: "counterMod8", op: "==", value: 0 }] },
      { type: "fluff", amount: 3, target: "randomCat", if: [{ check: "counterMod8", op: "==", value: 0 }] }] }] });
  add({ id: "relic_catnip_whetstone", name: "Catnip Whetstone", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "Post Stall prices are 25 percent lower.",
    flavor: "Sharpens claws. Also smells wonderful, which is not the point.",
    art: "grey sharpening stone dusted with dried leaves", price: 160,
    mods: { postStallPct: -25 } });
  add({ id: "relic_biscuit_blanket", name: "Biscuit Blanket", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "The first Knead trigger each battle counts double.",
    flavor: "Kneaded until fluffy. The blanket has stopped objecting.",
    art: "crumpled fleece with paw-shaped dimples", price: 160,
    mods: { kneadFirstDouble: true } });
  add({ id: "relic_birth_certificate", name: "Birth Certificate", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "Kitten Growth thresholds are 2 instead of 3.",
    flavor: "Issued retroactively. The kitten did not wait.",
    art: "tiny certificate with a milk-drop seal", price: 160,
    mods: { birthThreshold: 2 } });
  add({ id: "relic_box_permit", name: "Box Permit", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "Box Swap shows 4 choices and keeps Mastery.",
    flavor: "Valid for one box. Several boxes are expected.",
    art: "laminated permit clipped to a cardboard flap", price: 160,
    mods: { boxSwapChoices: 4, boxSwapKeepsMastery: true } });
  add({ id: "relic_emery_board", name: "Emery Board", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "The first scratch at each Post node is also applied to a second card of your choice.",
    flavor: "Filed with great care and zero supervision.",
    art: "pink nail file with scuffs", price: 160,
    mods: { emeryDoublePost: true } });
  add({ id: "relic_whittle_kit", name: "Whittle Kit", rarity: "uncommon", clan: null, tags: ["upgrade"],
    text: "At each Act start, every card gains +1 scratch slot (max 3).",
    flavor: "Includes one knife. Cats are not supposed to be given the knife.",
    art: "folded leather kit with tiny carving tools", price: 160,
    mods: { whittleSlotsPerAct: 1 } });
  add({ id: "relic_cardboard_fort", name: "Cardboard Fort", rarity: "uncommon", clan: "mischief", tags: [],
    text: "Whenever a Box is placed, give its floor's cats Hidden 1 for the round.",
    flavor: "Moat sold separately. Moat is a Tupperware.",
    art: "taped cardboard turret with a drawn flag", price: 160,
    hooks: [{ on: "onBoxPlaced", effects: [{ type: "applyStatus", status: "hidden", amount: 1, target: "allCatsOnFloor" }] }] });
  add({ id: "relic_nip_bag", name: "Nip Bag", rarity: "uncommon", clan: "mischief", tags: [],
    text: "Start of each round: gain 1 Nip.",
    flavor: "A small cloth bag. A large effect on everyone around it.",
    art: "green drawstring bag with a leaf stitched on", price: 160,
    hooks: [{ on: "onTurnStart", effects: [{ type: "catnip", amount: 1 }] }] });
  add({ id: "relic_dizzy_mousetrap", name: "Dizzy Mousetrap", rarity: "uncommon", clan: "mischief", tags: [],
    text: "The first time each round a pest is Knocked, it gains Dizzy 2.",
    flavor: "Triggered by a cat. The mouse was not involved.",
    art: "wooden snap trap with a spiral painted on it", price: 160,
    hooks: [{ on: "onKnock", limit: { per: "turn", n: 1 }, effects: [{ type: "applyStatus", status: "dizzy", amount: 2, target: "attackTarget" }] }] });
  add({ id: "relic_bath_towel", name: "Bath Survivor's Towel", rarity: "uncommon", clan: "alley", tags: [],
    text: "Whenever a cat is made Wet, it gains Bristle 2.",
    flavor: "Survived the bath. Holds a grudge. Holds it dry.",
    art: "damp striped towel draped over a furious cat", price: 160,
    hooks: [{ on: "onStatusApplied", if: [{ check: "statusId", op: "==", value: "wet" }], effects: [{ type: "applyStatus", status: "bristle", amount: 2, target: "triggerSource" }] }] });
  add({ id: "relic_emergency_tuna_tin", name: "Emergency Tuna Tin", rarity: "uncommon", clan: null, tags: [],
    text: "The first time Warmth drops to 15 or less each battle, restore 8 Warmth.",
    flavor: "Break seal in case of everything.",
    art: "red-labelled tuna tin with a glass-break tab", price: 160,
    hooks: [{ on: "onSunbeamHit", limit: { per: "battle", n: 1 }, if: [{ check: "warmth", op: "<=", value: 15 }], effects: [{ type: "warmth", amount: 8 }] }] });
  add({ id: "relic_spare_collar_tag", name: "Spare Collar Tag", rarity: "uncommon", clan: null, tags: [],
    text: "When a cat is lost for good, draw 2 cards and restore 3 Warmth.",
    flavor: "Engraved: IF FOUND, PLEASE ASSUME IT WAS INTENTIONAL.",
    art: "brass tag in the shape of a fish, engraved", price: 160,
    hooks: [{ on: "onFinalDeath", effects: [{ type: "draw", amount: 2, target: "player" }, { type: "warmth", amount: 3 }] }] });

  /* ================= RARE (20) + SPARE WHISKER ================= */
  add({ id: "relic_hole_in_the_fence", name: "Hole in the Fence", rarity: "rare", clan: "alley", tags: ["synergy"],
    text: "The first cat with Pounce you deploy each turn refunds 1 Zoomies.",
    flavor: "The fence has been repaired eleven times. The hole has been repaired twelve.",
    art: "cat-shaped gap in a weathered wooden fence", price: 230,
    hooks: [{ on: "onCatDeployed", limit: { per: "turn", n: 1 }, if: [{ check: "cardKeyword:pounce", op: "==", value: true }], effects: [{ type: "zoomies", amount: 1 }] }] });
  add({ id: "relic_black_cat_crossing", name: "Black Cat Crossing", rarity: "rare", clan: "moon", tags: ["synergy"],
    text: "Reborn cats return to hand costing 1 less and with Fluff 5.",
    flavor: "Bad luck for whoever is on the other side of the street.",
    art: "road sign with a black cat silhouette, violet moon", price: 230,
    hooks: [{ on: "onReborn", effects: [{ type: "reduceCost", amount: 1, duration: "played", target: "triggerSource" }, { type: "rebornFluff", amount: 5 }] }] });
  add({ id: "relic_cornered_collar", name: "Cornered Collar", rarity: "rare", clan: "moon", tags: ["rule"],
    text: "Cats are Cornered at 2 Lives or fewer, and Cornered gives +3 Attack instead of +2.",
    flavor: "Fits snugly. Fits snugger the worse it gets.",
    art: "tight violet collar with a worn buckle", price: 230,
    mods: { corneredAt: 2, corneredBonus: 3 } });
  add({ id: "relic_group_photo_frame", name: "Group Photo Frame", rarity: "rare", clan: "hearth", tags: ["synergy", "rule"],
    text: "Piles ignore gaps: all cats on a floor count as one Pile.",
    flavor: "Everyone squeezed in. Somebody is a blur.",
    art: "wide frame holding a crowd of cats mid-shuffle", price: 230,
    mods: { pileIgnoreGaps: true } });
  add({ id: "relic_big_box_voucher", name: "Big Box Voucher", rarity: "rare", clan: "mischief", tags: ["synergy", "rule"],
    text: "Boxes hold 1 more cat, and Large cats fit in Boxes.",
    flavor: "Redeemable against any box. Sofa-sized boxes accepted.",
    art: "coupon stapled to an oversized flattened box", price: 230,
    mods: { boxCapacity: 1, largeCatsFitBoxes: true } });
  add({ id: "relic_spare_bedroom_key", name: "Spare Bedroom Key", rarity: "rare", clan: null, tags: ["rule"],
    text: "Every floor gains 1 extra room slot.",
    flavor: "There was always a third room. It was just full of boxes.",
    art: "brass key on a fish-shaped fob", price: 230,
    mods: { roomSlots: 1 } });
  add({ id: "relic_sourdough_starter", name: "Sourdough Starter", rarity: "rare", clan: "hearth", tags: ["stack"],
    text: "Grows 1 after each battle (max 6). End of your turn: the fullest floor gains Purr equal to its size.",
    flavor: "Fed daily. Bubbles ominously. Smells of home.",
    art: "glass crock of bubbling dough with a cloth lid", price: 230,
    counter: { start: 0, cap: 6, reset: "never" },
    hooks: [{ on: "onTurnEnd", effects: [{ type: "floorStatus", status: "purr", amount: { base: 0, per: "counter", mult: 1 }, target: "fullestFloor" }] },
            { on: "onFightEnd", effects: [{ type: "counter", op: "add", amount: 1 }] }] });
  add({ id: "relic_grudge_notebook", name: "Grudge Notebook", rarity: "rare", clan: "alley", tags: ["stack"],
    text: "Each Elite or boss killed adds a grudge (max 6, kept all run). Every cat starts the battle with Claws equal to the grudges, including cats deployed later.",
    flavor: "A fine ledger. Every entry is a sulk.",
    art: "scruffy notebook with a cover scratched to ribbons", price: 230,
    counter: { start: 0, cap: 6, reset: "never" },
    hooks: [{ on: "onKill", if: [{ check: "targetIsEliteOrBoss", op: "==", value: true }], effects: [{ type: "counter", op: "add", amount: 1 }] },
            { on: "onBattleStart", effects: [{ type: "applyStatus", status: "claws", amount: { base: 0, per: "counter", mult: 1 }, target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "applyStatus", status: "claws", amount: { base: 0, per: "counter", mult: 1 }, target: "triggerSource" }] }] });
  add({ id: "relic_hairball_hoard", name: "Hairball Hoard", rarity: "rare", clan: "mischief", tags: ["stack"],
    text: "Each Hairball you play adds to the Hoard (max 20, kept all run). Playing a Hairball also hits a random pest for half the Hoard.",
    flavor: "A shrine. A threat. A health and safety matter.",
    art: "heap of grey hairballs under a tiny golden crown", price: 230,
    counter: { start: 0, cap: 20, reset: "never" },
    hooks: [{ on: "onCardPlayed", if: [{ check: "cardId", op: "==", value: "curse_hairball" }], effects: [{ type: "counter", op: "add", amount: 1 }, { type: "damage", kind: "shatter", amount: { base: 0, per: "counter", mult: 0.5 }, target: "randomEnemy" }] }] });
  add({ id: "relic_wanderlust_collar", name: "Wanderlust Collar", rarity: "rare", clan: null, tags: ["upgrade"],
    text: "Once, take a Champion tier from another path.",
    flavor: "The tag says HOME. The cat says maybe.",
    art: "leather collar with a compass charm", price: 230,
    mods: { champTierCrossPath: 1 } });
  add({ id: "relic_pedigree_papers", name: "Pedigree Papers", rarity: "rare", clan: null, tags: ["upgrade"],
    text: "Your Champion starts with Tier I already chosen.",
    flavor: "Forged by the cat. Accepted by everyone, out of respect.",
    art: "gilded scroll with a wax paw seal", price: 230,
    mods: { champStartTier: 1 } });
  add({ id: "relic_legendary_collar", name: "Legendary Collar", rarity: "rare", clan: null, tags: ["upgrade"],
    text: "Legend Ceremony costs 0.",
    flavor: "Studded with the finest plastic gems.",
    art: "gold collar with chunky plastic gems", price: 230,
    mods: { legendCeremonyFree: true } });
  add({ id: "relic_second_sunbeam_lamp", name: "Second Sunbeam Lamp", rarity: "rare", clan: null, tags: [],
    text: "Max Warmth +10. Start of battle: restore 4 Warmth.",
    flavor: "A desk lamp, angled at the Sunbeam. Rivalry is healthy.",
    art: "brass desk lamp pointed at a sunny window", price: 230,
    mods: { maxWarmth: 10 },
    hooks: [{ on: "onBattleStart", effects: [{ type: "warmth", amount: 4 }] }] });
  add({ id: "relic_clean_bill_of_health", name: "Clean Bill of Health", rarity: "rare", clan: null, tags: [],
    text: "Curse cards you draw are exhausted and replaced with a draw.",
    flavor: "Stamped by a vet who has never met the cat.",
    art: "folded vet certificate with a green tick", price: 230,
    mods: { curseDrawExhaust: true }, hooks: [] });
  add({ id: "relic_full_height_cat_tree", name: "Full-Height Cat Tree", rarity: "rare", clan: null, tags: [],
    text: "Cats on the Attic have +2 Attack and take 1 less damage from each hit, including cats deployed there later.",
    flavor: "Carpeted to the ceiling. The ceiling has complaints.",
    art: "six-tier carpeted cat tree reaching a ceiling", price: 230,
    hooks: [{ on: "onBattleStart", effects: [{ type: "buff", stat: "power", amount: 2, duration: "fight", target: "allCatsOnFloor", floor: 3 }] },
            { on: "onCatDeployed", if: [{ check: "targetFloor", op: "==", value: 3 }], effects: [{ type: "buff", stat: "power", amount: 2, duration: "fight", target: "triggerSource" }] }],
    mods: { atticCatDamageReduction: 1 } });
  add({ id: "relic_midnight_snack", name: "Midnight Snack", rarity: "rare", clan: "moon", tags: [],
    text: "Witching Hour: draw 1 extra card and restore 4 Warmth.",
    flavor: "A saucer on the counter at 3am. Someone is going to be in trouble.",
    art: "saucer of cold cuts under a pale kitchen light", price: 230,
    hooks: [{ on: "onNightPhase", if: [{ check: "isWitchingHour", op: "==", value: true }], effects: [{ type: "draw", amount: 1, target: "player" }, { type: "warmth", amount: 4 }] }] });
  add({ id: "relic_toy_chest", name: "Toy Chest", rarity: "rare", clan: null, tags: [],
    text: "The first Toy or Room card you play each turn costs 0.",
    flavor: "Overflowing. Everything inside is somehow the wrong toy.",
    art: "wooden chest spilling mice, bells and feathers", price: 230,
    hooks: [{ on: "onHandReady", effects: [{ type: "reduceCost", amount: 99, duration: "turn", target: "firstToyInHand" }] }] });
  add({ id: "relic_purr_box", name: "Purr Box", rarity: "rare", clan: "hearth", tags: ["rule"],
    text: "Floor Purr decays every 2nd round instead of every round.",
    flavor: "Wooden. Old. Still going. Nobody can find the off switch.",
    art: "old wooden radio-like box glowing warm gold", price: 230,
    mods: { purrDecayEvery: 2 } });
  add({ id: "relic_lantern_of_last_words", name: "Lantern of Last Words", rarity: "rare", clan: "moon", tags: [],
    text: "When a cat is lost for good, it deals 8 damage to all pests on its floor.",
    flavor: "It said something. It was mostly rude.",
    art: "violet paper lantern with a cat silhouette", price: 230,
    hooks: [{ on: "onFinalDeath", effects: [{ type: "damage", amount: 8, kind: "hit", target: "allEnemiesOnFloor" }] }] });
  add({ id: "relic_old_collar", name: "Mother's Old Collar", rarity: "rare", clan: null, tags: ["stack"],
    text: "At each Act start your Champion gains 2 Lives (max 9) and +1 Power for the run.",
    flavor: "It still smells like her. She still smells like she is right.",
    art: "faded blue collar with a bell and a chewed tag", price: 230,
    hooks: [{ on: "onActStart", effects: [{ type: "lives", amount: 2, target: "champion" }, { type: "buff", stat: "power", amount: 1, duration: "run", target: "champion" }] }] });
  add({ id: "relic_spare_whisker", name: "Spare Whisker", rarity: "rare", clan: null, tags: ["revive"],
    text: "Once per run, when Warmth would reach 0: set Warmth to 12, clear the top floor of pests, and lose this relic.",
    flavor: "A cat has nine lives. The Sunbeam gets one whisker.",
    art: "single long white whisker in a tiny glass tube", price: 230,
    hooks: [{ on: "onLoss", limit: { per: "run", n: 1 }, effects: [{ type: "setWarmth", amount: 12 }, { type: "clearFloorEnemies", floor: 3 }, { type: "consumeRelic" }] }] });

  /* ================= BOSS (8): strong, with a real drawback ================= */
  add({ id: "relic_gilded_whisker", name: "Gilded Whisker", rarity: "boss", clan: null, tags: ["boss"],
    text: "On pickup, add a Legendary card of your clans to the deck. Shop prices +25 percent.",
    flavor: "Gold-plated. Unbelievably smug. Worth every Fish.",
    art: "gold-dipped whisker on a velvet cushion", price: null,
    pickup: [{ type: "addCard", pool: { rarity: "legendary", clan: "run" }, to: "deck" }],
    mods: { shopPricePct: 25 } });
  add({ id: "relic_espresso_saucer", name: "Espresso Saucer", rarity: "boss", clan: null, tags: ["boss"],
    text: "Base Zoomies +1. Start of battle: shuffle 2 Hairballs into your draw pile.",
    flavor: "Technically not for cats. Technically.",
    art: "tiny cup and saucer with a ring of foam", price: null,
    mods: { baseZoomies: 1 },
    hooks: [{ on: "onBattleStart", effects: [{ type: "createCard", card: "hairball", amount: 2, to: "draw" }] }] });
  add({ id: "relic_stopped_clock", name: "Stopped Clock", rarity: "boss", clan: "moon", tags: ["boss", "rule"],
    text: "Witching Hour comes every 2nd round, and Night Visitors are 50 percent bigger.",
    flavor: "Right twice a day. Wrong in the exciting way the other twenty-two.",
    art: "cracked mantel clock with both hands at three", price: null,
    mods: { witchingEvery: 2, nightVisitorThreatPct: 50 } });
  add({ id: "relic_cast_iron_post", name: "Cast-Iron Scratching Post", rarity: "boss", clan: "alley", tags: ["boss"],
    text: "Every cat has +2 Attack. Max Warmth -10.",
    flavor: "Heavy. Hostile. Superb. The Sunbeam has opinions about the weight.",
    art: "black iron post with deep bright scratch marks", price: null,
    mods: { catPower: 2, maxWarmth: -10 } });
  add({ id: "relic_weighted_blanket", name: "Weighted Blanket", rarity: "boss", clan: "hearth", tags: ["boss"],
    text: "Every cat starts the battle Napping with Rested 3 and Fluff 4, including cats deployed later. Every cat has -1 Attack.",
    flavor: "Twelve kilos of comfort. Nobody has stood up since.",
    art: "heavy cream quilt with a paw-shaped bulge", price: null,
    mods: { catPower: -1 },
    hooks: [{ on: "onBattleStart", effects: [{ type: "nap", target: "allCats" }, { type: "applyStatus", status: "rested", amount: 3, target: "allCats" }, { type: "fluff", amount: 4, target: "allCats" }] },
            { on: "onCatDeployed", effects: [{ type: "nap", target: "triggerSource" }, { type: "applyStatus", status: "rested", amount: 3, target: "triggerSource" }, { type: "fluff", amount: 4, target: "triggerSource" }] }] });
  add({ id: "relic_red_laser_pointer", name: "Red Laser Pointer", rarity: "boss", clan: "mischief", tags: ["boss"],
    text: "Start of each round: every pest gains Dizzy 1. Dusk: a random cat gains Dizzy 1.",
    flavor: "A dot. Eight cats. No survivors.",
    art: "red pen laser with a glowing dot on a wall", price: null,
    hooks: [{ on: "onTurnStart", effects: [{ type: "applyStatus", status: "dizzy", amount: 1, target: "allEnemies" }] },
            { on: "onDusk", effects: [{ type: "applyStatus", status: "dizzy", amount: 1, target: "randomCat" }] }] });
  add({ id: "relic_nine_tailed_collar", name: "Nine-Tailed Collar", rarity: "boss", clan: "moon", tags: ["boss"],
    text: "On pickup, every cat gains 2 Lives (max 9). Every cat has -3 max Health.",
    flavor: "Plenty of lives. Slightly fewer organs.",
    art: "indigo collar with nine tiny silver tails", price: null,
    pickup: [{ type: "lives", amount: 2, target: "allCats" }],
    mods: { catMaxHealth: -3 } });
  add({ id: "relic_bottomless_bag", name: "Bottomless Bag", rarity: "boss", clan: null, tags: ["boss"],
    text: "Draw 2 extra cards each turn. At end of turn, exhaust a random card from your hand.",
    flavor: "It goes down a long way. Do not look for the bottom.",
    art: "patchwork tote with no visible bottom", price: null,
    mods: { drawPerTurn: 2 },
    hooks: [{ on: "onTurnEnd", effects: [{ type: "exhaustCard", amount: 1, mode: "random", from: "hand" }] }] });

  /* ================= SHOP ONLY (6) ================= */
  add({ id: "relic_loyalty_card", name: "Gerald's Loyalty Card", rarity: "shop", clan: null, tags: ["shop", "economy"],
    text: "Shop prices are 15 percent lower. Selling cards pays double.",
    flavor: "Nine stamps and a free dumpster dive.",
    art: "punched card with a raccoon stamp", price: 180,
    mods: { shopPricePct: -15, sellPricePct: 100 } });
  add({ id: "relic_hagglers_bell", name: "Haggler's Bell", rarity: "shop", clan: null, tags: ["shop"],
    text: "Reroll each shop's stock once for free.",
    flavor: "Ring it and Gerald pretends to remember a better offer.",
    art: "counter bell with a raccoon paw on top", price: 140,
    mods: { freeShopReroll: 1 } });
  add({ id: "relic_coupon_clipper", name: "Coupon Clipper", rarity: "shop", clan: null, tags: ["shop", "economy"],
    text: "The first purchase in each shop is half price.",
    flavor: "Expired in March. Gerald honours it out of fear.",
    art: "tiny scissors with a fish coupon between the blades", price: 150,
    hooks: [{ on: "onShopEnter", effects: [{ type: "shopDiscountFirst", amount: 50 }] }] });
  add({ id: "relic_bulk_fish_sack", name: "Bulk Fish Sack", rarity: "shop", clan: null, tags: ["shop", "economy"],
    text: "Gain 25 percent more Fish from battles.",
    flavor: "Nothing in the sack is dated. Everything in the sack is mostly fish.",
    art: "burlap sack with a tail sticking out of the top", price: 200,
    mods: { fishGainPct: 25 } });
  add({ id: "relic_blind_eye", name: "Gerald's Blind Eye", rarity: "shop", clan: null, tags: ["shop", "economy"],
    text: "Card removal never gets more expensive.",
    flavor: "Gerald has not seen anything. Gerald has been looking at the ceiling.",
    art: "small eye patch hung on a hook", price: 170,
    mods: { removalNoEscalate: true } });
  add({ id: "relic_back_room_key", name: "Back Room Key", rarity: "shop", clan: null, tags: ["shop"],
    text: "Shops stock 1 extra relic and 1 extra Rare card.",
    flavor: "Opens the cupboard behind the cupboard. Smells of cardboard and secrets.",
    art: "rusty iron key tied to a raccoon tail ring", price: 250,
    mods: { shopExtraRelic: 1, shopExtraRare: 1 } });

  /* defaults and export */
  R.forEach(function (r) {
    if (!r.tags) r.tags = [];
    if (r.hooks === undefined) r.hooks = [];
    if (r.clan === undefined) r.clan = null;
  });
  SB.data.relics = R;
})();
