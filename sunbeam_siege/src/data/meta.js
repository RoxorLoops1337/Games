/*
 * meta.js : META PROGRESSION (agent B16)
 * SB.data.meta: Whisker XP levels 1 to 30 and the unlock tree, Mischief Rank ladder 0 to 10,
 * Night Omens (10), achievements (40), daily challenge modifiers (12), seed rules,
 * cosmetics (30 coats, 20 collars and hats), profile save schema `sb_profile_v1`,
 * statistics catalog, and pure helper functions (no DOM, no engine calls).
 *
 * Single source of truth: every unlockable carries its own `unlock` field. The level tree
 * (SB.data.meta.levels) is generated from those fields at load, so the two cannot drift.
 *
 * Rulings applied (RULES.md overrides A07): Sunbeam Warmth starts at 40 (+5 per boss), the Last Life is
 * NOT default (it is the rare relic Spare Whisker), Witching Hour replaces the Night Clock, Lives are cat pips.
 *
 * NEEDS (for the engine agent and other content agents):
 *  1. Champion ids: champions are not authored yet. This file uses placeholder ids
 *     champion_<clan>_1 (unlocked with the clan or at start) and champion_<clan>_2 (unlocked by level).
 *     The champion agent must use these ids, or fill SB.data.meta.championIdMap = { champion_alley_1: "real_id" }.
 *  2. Relic ids proposed in relicGates (prefix relic_). Any relic id NOT listed there is available from the start,
 *     so the relic agent may rename freely; gated ids that do not exist are ignored by isRelicAvailable.
 *  3. New card id neutral_stray_kitten (a Kitten, neutral, Common) for the Cradle Gift kitten_friend.
 *  4. Effect keys used in omen / daily / rank / gift `effects` and `mods` are data tags the engine must read:
 *     see the lists in design/B16-meta.md. None invent new statuses. Shade, Purr, Rested, Fluff, Hidden,
 *     Yarn, Knock, Shatter, Witching Hour, Hairball, Spare Whisker are all existing rules.
 *  5. The run summary object passed to SB.data.meta.recordRun must follow SB.data.meta.runSummaryFields.
 *  6. Optional engine hook: call SB.data.meta.checkAchievements(profile, runSoFar) after each battle for
 *     mid-run achievement popups; recordRun does the final pass.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.meta = (function () {
  "use strict";

  var SAVE_KEY = "sb_profile_v1";
  var CLANS = ["alley", "hearth", "moon", "mischief"];

  /* ------------------------------------------------------------------ */
  /* 1. WHISKER XP CURVE                                                 */
  /* ------------------------------------------------------------------ */
  var MAX_LEVEL = 30;
  function xpForNext(level) { return level >= MAX_LEVEL ? 0 : 60 + 25 * (level - 1); }
  function xpTotalForLevel(level) { var t = 0; for (var l = 1; l < level; l++) t += xpForNext(l); return t; }
  function levelFromXp(xp) {
    var lvl = 1, left = Math.max(0, Math.floor(xp || 0));
    while (lvl < MAX_LEVEL && left >= xpForNext(lvl)) { left -= xpForNext(lvl); lvl++; }
    return { level: lvl, into: left, need: xpForNext(lvl), pct: lvl >= MAX_LEVEL ? 1 : left / xpForNext(lvl) };
  }

  var LEVEL_TITLES = ["Kitten at the Door", "Floor Inspector", "Box Tester", "Sofa Scout", "Window Watcher",
    "Shelf Surveyor", "Dish Dropper", "Hall Patrol", "Curtain Climber", "Night Shift",
    "Cushion Captain", "Sunbeam Steward", "Pantry Warden", "Stair Strategist", "Clowder Clerk",
    "Draft Detector", "Hearth Keeper", "Moon Monitor", "Wall Walker", "Pest Negotiator",
    "Attic Regular", "Rooftop Philosopher", "Acquaintance of Gerald", "Senior Napper", "Archivist of Warm Spots",
    "Keeper of the Good Chair", "Nine Lives, Minor", "Dawn Marshal", "Sunbeam Elder", "Holder of the House"];

  /* ------------------------------------------------------------------ */
  /* 2. UNLOCKABLES (each carries its own unlock rule)                   */
  /* unlock: {type:"start"} | {type:"level", level:N} | {type:"achievement", id}  |  {type:"rankWin", rank:N} */
  /* ------------------------------------------------------------------ */
  function L(n) { return { type: "level", level: n }; }
  var START = { type: "start" };
  function ACH(id) { return { type: "achievement", id: id }; }
  function RW(r) { return { type: "rankWin", rank: r }; }

  var clans = [
    { id: "alley", name: "Alley Tabbies", unlock: START },
    { id: "hearth", name: "Hearthpaws", unlock: START },
    { id: "mischief", name: "Mischief", unlock: L(3) },
    { id: "moon", name: "Moonwhiskers", unlock: L(7) }
  ];

  /* Placeholder champion ids, see NEEDS 1. Two per clan at launch (RULES section 2). */
  var champions = [
    { id: "champion_alley_1", clan: "alley", slot: 1, unlock: START },
    { id: "champion_hearth_1", clan: "hearth", slot: 1, unlock: START },
    { id: "champion_mischief_1", clan: "mischief", slot: 1, unlock: L(3) },
    { id: "champion_moon_1", clan: "moon", slot: 1, unlock: L(7) },
    { id: "champion_alley_2", clan: "alley", slot: 2, unlock: L(5) },
    { id: "champion_hearth_2", clan: "hearth", slot: 2, unlock: L(9) },
    { id: "champion_mischief_2", clan: "mischief", slot: 2, unlock: L(12) },
    { id: "champion_moon_2", clan: "moon", slot: 2, unlock: L(15) }
  ];

  /* Gated relics. Relics not listed here are available from run one. Ids are proposals, see NEEDS 2. */
  var relicGates = [
    { id: "relic_tuna_tin", name: "Tuna Tin", hint: "A tin that is never quite empty. Heals a cat's last life.", unlock: L(3) },
    { id: "relic_hot_water_bottle", name: "Hot Water Bottle", hint: "Purr above 10 on any floor warms the Sunbeam.", unlock: L(4) },
    { id: "relic_fur_collar", name: "Fur Collar", hint: "Hairballs hit harder after the third one thrown in a turn.", unlock: L(8) },
    { id: "relic_wanderlust_collar", name: "Wanderlust Collar", hint: "One champion tier may come from another path.", unlock: L(11) },
    { id: "relic_graveyard_shift", name: "Graveyard Shift", hint: "A cat spending its last life pays you 1 Zoomies.", unlock: L(13) },
    { id: "relic_legendary_collar", name: "Legendary Collar", hint: "Legend Ceremony costs nothing.", unlock: L(16) },
    { id: "relic_catnip_sock", name: "Catnip Sock", hint: "Starts every battle with 3 Nip. Handle with respect.", unlock: L(17) },
    { id: "relic_warm_brick", name: "Warm Brick", hint: "The first Nap each battle also gives a Purr to its floor.", unlock: L(19) },
    { id: "relic_sunbeam_lens", name: "Sunbeam Lens", hint: "Shade carries 2 over from the last battle.", unlock: L(22) },
    { id: "relic_squeaky_mouse", name: "Squeaky Mouse", hint: "Ignoring it is not an option for anyone.", unlock: L(25) },
    { id: "relic_spare_whisker", name: "Spare Whisker", hint: "Rare. The Last Life: Warmth reaches 0 once, you stay at 12.", unlock: L(28) },
    { id: "relic_cardboard_crown", name: "Cardboard Crown", hint: "Your Champion counts as boxed. It does not fit. It sits anyway.", unlock: L(30) }
  ];

  /* Cradle Gifts. A07 pool of 6 plus 4 new. Rank 8 and up skips the gift screen. */
  var cradleGifts = [
    { id: "plump_wallet", name: "Plump Wallet", text: "+60 Fish. Found behind the radiator. Do not ask.", effects: [{ type: "gainFish", value: 60 }], unlock: START },
    { id: "hearthrug", name: "Hearthrug", text: "+8 max Warmth, heal 8. Thick pile. Thicker cat.", effects: [{ type: "maxWarmth", value: 8 }, { type: "healWarmth", value: 8 }], unlock: START },
    { id: "fresh_claws", name: "Fresh Claws", text: "Upgrade one starter card of your choice.", effects: [{ type: "upgradeStarterCard", count: 1 }], unlock: L(2) },
    { id: "lucky_bell", name: "Lucky Bell", text: "Gain a random Common relic.", effects: [{ type: "gainRelic", rarity: "common", count: 1 }], unlock: L(6) },
    { id: "cat_tax", name: "Cat Tax", text: "Remove 2 starter cards, gain 25 Fish per card removed. A leaner clowder is a meaner clowder.", effects: [{ type: "removeStarterCards", count: 2, fishEach: 25 }], unlock: L(10) },
    { id: "spare_life", name: "Spare Life", text: "Every non-Champion cat in your starting deck gets +1 Life (hard cap 9).", effects: [{ type: "startDeckLives", value: 1, excludeChampion: true }], unlock: L(14) },
    { id: "gerald_coupon", name: "Gerald's Coupon", text: "Every price in your first Shop is 30% lower. He accepts it with visible pain.", effects: [{ type: "firstShopDiscountPct", value: 30 }], unlock: L(18) },
    { id: "kitten_friend", name: "Stray Kitten", text: "Add a Stray Kitten to your deck. It followed you home and has opinions.", effects: [{ type: "addCard", cardId: "neutral_stray_kitten", count: 1 }], unlock: L(21) },
    { id: "old_bell", name: "Old Brass Bell", text: "Gain a random Uncommon relic.", effects: [{ type: "gainRelic", rarity: "uncommon", count: 1 }], unlock: L(24) },
    { id: "sunbeam_sliver", name: "Sunbeam Sliver", text: "The Sunbeam starts every battle with 4 Shade. A small, loyal piece of afternoon.", effects: [{ type: "startShade", value: 4 }], unlock: L(27) }
  ];

  /* ------------------------------------------------------------------ */
  /* 3. COSMETICS for the Pawprint genome (A08 section 8.1)              */
  /* coat: patch applied over fur, pattern, patternColor, eyeColor        */
  /* collar: patch applied over accessory, accessoryColor                 */
  /* ------------------------------------------------------------------ */
  function coat(id, name, flavor, fur, pattern, patternColor, eyeColor, unlock) {
    return { id: id, name: name, flavor: flavor, genome: { fur: fur, pattern: pattern, patternColor: patternColor, eyeColor: eyeColor }, unlock: unlock };
  }
  var coats = [
    coat("coat_classic_tabby", "Classic Tabby", "The default cat. The default cat knows.", "orange", "stripes", null, "green", START),
    coat("coat_soot_sprite", "Soot Sprite", "Collects dust bunnies and, reportedly, grudges.", "black", "solid", null, "amber", START),
    coat("coat_snowdrift", "Snowdrift", "Shows every footprint. Does not care.", "white", "solid", null, "blue", START),
    coat("coat_smoke_grey", "Smoke Grey", "Matches the sofa. Matches the mood.", "grey", "solid", null, "green", START),
    coat("coat_biscuit", "Biscuit", "Smells faintly of toast. Nobody has checked.", "cream", "solid", null, "amber", START),
    coat("coat_cocoa", "Cocoa", "Warm, round, impossible to find in a dark room.", "chocolate", "solid", null, "copper", ACH("ach_still_here")),
    coat("coat_slate_gentleman", "Slate Gentleman", "Disapproves quietly and in a good coat.", "blue", "solid", null, "amber", RW(6)),
    coat("coat_marmalade", "Marmalade", "Spreads easily. Sticks to the best chair.", "ginger", "stripes", null, "copper", ACH("ach_dawn_technically")),
    coat("coat_tuxedo_night", "Tuxedo Night", "Dressed for an event that is, in fact, dinner.", "black", "tuxedo", null, "green", L(2)),
    coat("coat_grey_tux", "Grey Tux", "The formal wear of someone who wins on Rank 3.", "grey", "tuxedo", null, "amber", RW(3)),
    coat("coat_calico_classic", "Calico Classic", "Three colors, one plan, zero explanations.", "white", "calico", null, "amber", L(4)),
    coat("coat_calico_orchard", "Calico Orchard", "Peach, plum and a rumour of cream.", "cream", "calico", null, "green", ACH("ach_diplomatic_immunity")),
    coat("coat_tortie_toast", "Tortie Toast", "Burnt at the edges on purpose.", "black", "tortie", null, "copper", L(9)),
    coat("coat_siamese_sunset", "Siamese Sunset", "Loud about it. Beautifully loud.", "cream", "siamese", null, "blue", L(6)),
    coat("coat_chocolate_point", "Chocolate Point", "Dark mask, pale manners.", "cream", "siamese", "#3a2014", "blue", L(29)),
    coat("coat_blue_point", "Blue Point", "A cold-weather cat in a warm house.", "cream", "siamese", "#44506c", "blue", L(27)),
    coat("coat_spotted_leopard", "Spotted Leopard", "Domestic in the way a lion is a large cat.", "ginger", "spots", null, "green", L(5)),
    coat("coat_cloud_spots", "Cloud Spots", "Looks like weather. Acts like weather.", "grey", "spots", "#d9deea", "amber", L(21)),
    coat("coat_cow_cat", "Cow Cat", "Has never said moo. Has considered it.", "white", "bicolor", "#1a1a22", "green", L(10)),
    coat("coat_ginger_bicolor", "Ginger Bicolor", "Half sunrise, half dinner napkin.", "orange", "bicolor", null, "amber", L(13)),
    coat("coat_silver_stripes", "Silver Stripes", "Polished by years of sliding off furniture.", "grey", "stripes", null, "green", L(11)),
    coat("coat_midnight_stripes", "Midnight Stripes", "Stripes you only see if you are being watched.", "black", "stripes", "#5a5a6c", "amber", L(17)),
    coat("coat_cocoa_stripes", "Cocoa Stripes", "A tabby that went to a very nice cafe.", "chocolate", "stripes", null, "copper", L(19)),
    coat("coat_blue_tabby", "Blue Tabby", "Thinks blue is a personality. It is.", "blue", "stripes", null, "amber", L(15)),
    coat("coat_creamsicle", "Creamsicle", "Orange on the outside, vanilla on the schedule.", "cream", "stripes", "#ffa94d", "green", L(26)),
    coat("coat_moonbeam", "Moonbeam", "Silver freckles. Arrives when the lights go out.", "white", "spots", "#9aa0ff", "amber", L(7)),
    coat("coat_ember", "Ember", "Black fur, orange stripes. A small fire with a grudge.", "black", "stripes", "#f09040", "amber", L(20)),
    coat("coat_hearthglow", "Hearthglow", "Cream and ginger, like a lamp left on for you.", "cream", "tortie", "#ffa94d", "green", L(23)),
    coat("coat_bubblegum_chaos", "Bubblegum Chaos", "Pink, white, and one eye on your drink.", "white", "tortie", "#ff5da8", "odd", L(25)),
    coat("coat_sunbeam_saint", "Sunbeam Saint", "Cream with a patch of gold exactly where the light lands.", "cream", "bicolor", "#ffd54a", "amber", L(30))
  ];

  function collar(id, name, flavor, accessory, color, unlock) {
    return { id: id, name: name, flavor: flavor, genome: { accessory: accessory, accessoryColor: color }, unlock: unlock };
  }
  var collars = [
    collar("collar_red_bow", "Red Bow", "Tied by someone who is now missing a finger.", "bow", "#ff5d6c", START),
    collar("collar_brass_bell", "Brass Bell", "Defeats the purpose of a cat. Worn proudly.", "bell", "#ffc83a", START),
    collar("collar_wool_scarf", "Wool Scarf", "Knitted by a person who was never thanked.", "scarf", "#e0525c", L(2)),
    collar("collar_bandana", "Bandana", "For cats who have seen a few fences.", "bandana", "#c0392b", L(3)),
    collar("collar_party_hat", "Party Hat", "Nobody invited the cat. The cat is the party.", "hat_party", "#ff5da8", L(5)),
    collar("collar_wizard_hat", "Pointed Hat", "A hat, not a career. The cat insists.", "hat_wizard", "#5b4bd6", L(7)),
    collar("collar_headphones", "Headphones", "Listening to something you cannot hear. Mostly the fridge.", "headphones", "#26262f", L(8)),
    collar("collar_top_hat", "Top Hat", "Has never lifted it. Never will.", "hat_top", "#26262f", L(10)),
    collar("collar_hero_cape", "Hero Cape", "Flaps heroically on the way to the food bowl.", "cape", "#3b82f6", L(12)),
    collar("collar_monocle", "Monocle", "Examines your decisions at close range.", "monocle", "#ffd54a", L(14)),
    collar("collar_chef_hat", "Chef Hat", "Qualified. The kitchen counter has no opinion.", "chef_hat", "#ffffff", L(16)),
    collar("collar_pirate_hat", "Pirate Hat", "Raids the bin on a strict schedule.", "pirate_hat", "#2a2a35", L(18)),
    collar("collar_tiny_crown", "Tiny Crown", "Technically a ring pull. The cat rules anyway.", "hat_crown", "#ffd54a", L(20)),
    collar("collar_cool_shades", "Cool Shades", "For a cat who has seen the Red Dot and was unmoved.", "sunglasses", "#111118", L(22)),
    collar("collar_dented_helmet", "Dented Helmet", "Won an argument with a door.", "armor_helm", "#9aa0b0", L(24)),
    collar("collar_moon_bell", "Moon Bell", "Rings only when you are not looking.", "bell", "#aab4ff", L(26)),
    collar("collar_daisy", "Daisy", "Stolen from a pot. Worn with total confidence.", "flower", "#fff2a8", L(28)),
    collar("collar_reading_glasses", "Reading Glasses", "For close inspection of the lean clowder.", "glasses", "#2e3242", ACH("ach_lean_clowder")),
    collar("collar_eyepatch", "Eyepatch", "Cornered once. Never again.", "eyepatch", "#1a1a22", ACH("ach_cornered_not_beaten")),
    collar("collar_cardboard_box", "Cardboard Box", "Not a collar. A lifestyle with a front panel.", "cardboard_box", "#c89a5b", ACH("ach_box_hotel"))
  ];

  /* ------------------------------------------------------------------ */
  /* 4. MISCHIEF RANK LADDER 0 to 10 (cumulative)                         */
  /* mods are data tags the run builder reads; merge with cumulativeMods  */
  /* ------------------------------------------------------------------ */
  var ranks = [
    { rank: 0, name: "Lap Cat", text: "The house is unusually calm. Enjoy it.", mods: {} },
    { rank: 1, name: "Mildly Curious", text: "Prowl battles pay 10% less Fish.", mods: { prowlFishMult: 0.9 } },
    { rank: 2, name: "Knocked a Glass Over", text: "Wave 1 of every Prowl battle gets +1 pest.", mods: { prowlWave1ExtraPests: 1 } },
    { rank: 3, name: "Third Warning", text: "Elites gain 1 extra affix. The Keyword Primer can be removed freely.", mods: { eliteExtraAffixes: 1, tutorialGuardOff: true } },
    { rank: 4, name: "Cold Draft", text: "Starting max Warmth is 35 instead of 40 (boss bonuses stay +5, +5).", mods: { maxWarmthDelta: -5 } },
    { rank: 5, name: "Boss Energy", text: "Bosses gain a second Phase move.", mods: { bossSecondPhaseMove: true } },
    { rank: 6, name: "Stingy Nook", text: "Curl Up at a Nap Nook heals 20% of max Warmth instead of 30%.", mods: { nookCurlUpPct: 0.20 } },
    { rank: 7, name: "Gerald Smells Blood", text: "Shop prices +15%.", mods: { shopPriceMult: 1.15 } },
    { rank: 8, name: "No Welcome Basket", text: "No Cradle Gift at run start.", mods: { noCradleGift: true } },
    { rank: 9, name: "Early Riser", text: "No Dawn Rest healing after Night A fights.", mods: { noDawnRest: true } },
    { rank: 10, name: "Maximum Trouble", text: "Spare Whisker leaves the relic pools. Every Night Omen applies double.", mods: { omenDouble: true, removeRelics: ["relic_spare_whisker"] } }
  ];
  function cumulativeMods(rank) {
    var out = {}, r, k, v;
    for (r = 0; r <= Math.min(10, Math.max(0, rank | 0)); r++) {
      for (k in ranks[r].mods) {
        v = ranks[r].mods[k];
        if (k === "removeRelics") out[k] = (out[k] || []).concat(v);
        else out[k] = v;
      }
    }
    return out;
  }
  var rankRules = {
    unlockOn: "Win a non-daily run at your highest unlocked rank to unlock the next. Lower ranks stay selectable.",
    xpPerRank: 10,
    header: "How Much Trouble Do You Want?",
    crownAtRank: 10
  };

  /* ------------------------------------------------------------------ */
  /* 5. NIGHT OMENS (10). Night Battles pick one, never repeating in an act. */
  /* Each effect has value and doubled (used at Mischief 10).             */
  /* ------------------------------------------------------------------ */
  var omens = [
    { id: "omen_full_moon", name: "Full Moon", kinds: ["night"], minAct: 1, weight: 10,
      text: "Cats start the first round with +1 Zoomies. All pests have +10% HP.",
      flavor: "Bright enough to see the problem. Bright enough to cause it.",
      effects: [{ type: "firstRoundZoomies", value: 1, doubled: 2 }, { type: "pestHpMult", value: 1.10, doubled: 1.20 }] },
    { id: "omen_thunder", name: "Thunder", kinds: ["night"], minAct: 1, weight: 10,
      text: "On rounds 2, 5, 8 and so on, 1 random pest skips its action and its climb.",
      flavor: "Everyone flinches. Some of us flinch professionally.",
      effects: [{ type: "pestSkipEveryNthRound", every: 3, offset: 2, count: 1, doubledCount: 2 }] },
    { id: "omen_cold_floor", name: "Cold Floor", kinds: ["night"], minAct: 1, weight: 10,
      text: "Cats and pests on the Cellar have -1 Attack. Cats and pests on the Attic have +1 Attack.",
      flavor: "Stone below, rafters above. Warmth rises. So does opinion.",
      effects: [{ type: "floorAttackMod", floor: 1, value: -1, doubled: -2 }, { type: "floorAttackMod", floor: 3, value: 1, doubled: 2 }] },
    { id: "omen_quiet_house", name: "Quiet House", kinds: ["night"], minAct: 1, weight: 8,
      text: "No Witching Hour this fight (no bonus, no Night Visitors). The fight has 1 extra wave.",
      flavor: "Too quiet. The cats find this unacceptable and the mice find it useful.",
      effects: [{ type: "noWitchingHour" }, { type: "extraWaves", value: 1, doubled: 2 }] },
    { id: "omen_draft", name: "Draft Under the Door", kinds: ["night"], minAct: 1, weight: 10,
      text: "At the start of each round one random floor is chosen: every cat and pest on it takes 2 damage (Fluff absorbs first).",
      flavor: "Someone left a door open. Everyone knows who. Nobody says.",
      effects: [{ type: "randomFloorDamageEachRound", floors: 1, damage: 2, doubledDamage: 4 }] },
    { id: "omen_hunters_moon", name: "Hunter's Moon", kinds: ["elite", "boss"], minAct: 1, weight: 10,
      text: "Elites and Bosses arrive with 1 extra Medium escort of their family in wave 1.",
      flavor: "It brought a friend. The friend brought a snack.",
      effects: [{ type: "extraEscort", count: 1, size: "medium", doubledCount: 2 }] },
    { id: "omen_waxed_floors", name: "Waxed Floors", kinds: ["night"], minAct: 1, weight: 8,
      text: "Knock pushes 1 floor further than printed. Anchored pests still do not move.",
      flavor: "Freshly polished by a person who has since left the room.",
      effects: [{ type: "knockBonusFloors", value: 1, doubled: 2 }] },
    { id: "omen_midnight_snack", name: "Midnight Snack", kinds: ["night"], minAct: 1, weight: 8,
      text: "All pests have +1 Attack. Each pest defeated drops 1 Fish (max 12 Fish per fight).",
      flavor: "They brought lunch in their pockets. It is yours if you win.",
      effects: [{ type: "pestAttackMod", value: 1, doubled: 2 }, { type: "fishPerPestDefeated", value: 1, cap: 12, doubledValue: 2, doubledCap: 24 }] },
    { id: "omen_rowdy_hour", name: "Rowdy Hour", kinds: ["night"], minAct: 2, weight: 7,
      text: "Witching Hour Night Visitors are 50% of a wave's threat instead of 25%. Zooms hit for full damage instead of half.",
      flavor: "The party upstairs has found the party downstairs.",
      effects: [{ type: "nightVisitorThreatPct", value: 50, doubled: 75 }, { type: "zoomHitPct", value: 100, doubled: 150 }] },
    { id: "omen_cold_snap", name: "Cold Snap", kinds: ["night"], minAct: 2, weight: 7,
      text: "Purr decays 2 per round instead of 1. Rested caps at 3 instead of 4.",
      flavor: "The radiator has gone quiet. The cats take it personally.",
      effects: [{ type: "purrDecayPerRound", value: 2, doubled: 3 }, { type: "restedMax", value: 3, doubled: 2 }] }
  ];
  var omenRules = {
    selection: "Seeded by rngFor(seed, 'omen', nodeIndex). Weighted from omens whose kinds include the node type and minAct <= act.",
    noRepeatWithinAct: true,
    revealRule: "Shown on the node tooltip once the player has visited a node in the previous row (A07).",
    doubleAtRank: 10
  };

  /* ------------------------------------------------------------------ */
  /* 6. ACHIEVEMENTS (40). cond paths: life.* best.* run.* derived.*      */
  /* cond forms: {path, gte|lte|eq: n} or {all: [cond, ...]}              */
  /* ------------------------------------------------------------------ */
  function A(id, name, desc, cond, opts) {
    var o = { id: id, name: name, desc: desc, cond: cond, group: (opts && opts.group) || "run", hidden: !!(opts && opts.hidden) };
    if (opts && opts.reward) o.reward = opts.reward;
    return o;
  }
  function G(path, n) { return { path: path, gte: n }; }
  function LE(path, n) { return { path: path, lte: n }; }
  function EQ(path, n) { return { path: path, eq: n }; }
  function ALL() { return { all: Array.prototype.slice.call(arguments) }; }
  var WON = EQ("run.won", true);

  var achievements = [
    /* Progress (8) */
    A("ach_dawn_technically", "Dawn, Technically", "Win a run. The sun came up. You were nearby.", WON, { group: "progress" }),
    A("ach_still_here", "Still Here", "Survive 3 Nights in one run.", G("run.nightsSurvived", 3), { group: "progress" }),
    A("ach_ten_dawns", "Ten Dawns", "Win 10 runs. The neighbours have noticed the glow.", G("life.runsWon", 10), { group: "progress" }),
    A("ach_nine_lives_well_spent", "Nine Lives, Well Spent", "Win a run after spending 9 or more cat Lives.", ALL(WON, G("run.livesSpent", 9)), { group: "progress" }),
    A("ach_three_dawns_running", "Three in a Row, Allegedly", "Win 3 runs in a row.", G("best.winStreak", 3), { group: "progress" }),
    A("ach_went_for_a_nap", "Went for a Nap", "Retire a run. Nobody can prove you did not need the rest.", G("life.runsRetired", 1), { group: "progress" }),
    A("ach_trouble_moderate", "Trouble, Moderate", "Win a run at Mischief Rank 3 or higher.", ALL(WON, G("run.rank", 3)), { group: "progress" }),
    A("ach_maximum_trouble", "Maximum Trouble", "Win a run at Mischief Rank 10. The house is rather proud.", ALL(WON, G("run.rank", 10)), { group: "progress", reward: "crown" }),

    /* Loops (6). A loop turn is defined in loopTurnRule below. */
    A("ach_found_a_loop", "Found a Loop", "Trigger your first loop turn. You cannot explain it. Your deck can.", G("life.loopTurns", 1), { group: "loop" }),
    A("ach_wait_that_works", "Wait, That Actually Works", "Have 5 loop turns in a single run.", G("run.loopTurns", 5), { group: "loop" }),
    A("ach_loop_versus_boss", "Loop Versus Boss", "Have a loop turn during a Boss fight.", G("run.bossLoopTurns", 1), { group: "loop" }),
    A("ach_loop_enthusiast", "Loop Enthusiast", "Have 50 loop turns across all runs.", G("life.loopTurns", 50), { group: "loop" }),
    A("ach_technically_not_infinite", "Technically Not Infinite", "Play 30 cards in a single turn. Your paws filed a complaint.", G("best.longestTurnCards", 30), { group: "loop" }),
    A("ach_please_dont_tell_designers", "Please Do Not Tell the Designers", "Win at Rank 5 or higher with 10 or more loop turns in the run.", ALL(WON, G("run.rank", 5), G("run.loopTurns", 10)), { group: "loop", hidden: true }),

    /* Named loops from the vision (6) */
    A("ach_the_eternal_nap", "The Eternal Nap", "Reach Purr 40 on one floor. Do nothing, very hard.", G("best.maxPurr", 40), { group: "combo" }),
    A("ach_shelf_cascade", "Shelf Cascade", "Deal 100 Shatter damage in a single fight. The vase had it coming.", G("best.shatterInBattle", 100), { group: "combo" }),
    A("ach_box_hotel", "Box Hotel", "Have 4 Hidden cats at once.", G("best.maxHiddenCats", 4), { group: "combo", reward: "collar_cardboard_box" }),
    A("ach_lives_banking", "Lives Banking", "Revive 3 cats in a single fight. Technically dead. Practically punctual.", G("best.revivesInBattle", 3), { group: "combo" }),
    A("ach_it_is_a_statement", "It Is a Statement", "Throw 8 Hairballs in a single turn.", G("best.hairballsThrownInTurn", 8), { group: "combo" }),
    A("ach_nothing_was_knitted", "Nothing Was Knitted", "Put 6 Yarn on a single pest.", G("best.maxYarnOnPest", 6), { group: "combo" }),

    /* Cat behaviour (10) */
    A("ach_heap_of_cats", "Heap of Cats", "Form a Heap: 4 cats in a Pile on one floor.", G("best.maxPile", 4), { group: "cat" }),
    A("ach_very_long_stretch", "A Very Long Stretch", "Wake a cat with a Stretch attack of 12 or more.", G("best.biggestStretch", 12), { group: "cat" }),
    A("ach_rude_awakening_again", "Rude Awakening, Again", "Wake 25 napping cats the hard way.", G("life.rudeAwakenings", 25), { group: "cat" }),
    A("ach_cornered_not_beaten", "Cornered, Not Beaten", "Defeat 20 pests with Cornered cats (exactly 1 life).", G("life.cornerKills", 20), { group: "cat" }),
    A("ach_diplomatic_immunity", "Diplomatic Immunity", "Win a run with each of the four main clans.", G("derived.clansWon", 4), { group: "cat" }),
    A("ach_zoomies_at_3am", "Zoomies at 3 AM", "Survive 50 Witching Hours.", G("life.witchingHours", 50), { group: "cat" }),
    A("ach_gravity_is_a_suggestion", "Gravity Is a Suggestion", "Knock 200 pests down a floor. Eye contact was maintained throughout.", G("life.knocksDone", 200), { group: "cat" }),
    A("ach_through_the_cat_flap", "Through the Cat Flap", "Knock 25 pests out of the Cellar.", G("life.pestsKnockedOutCellar", 25), { group: "cat" }),
    A("ach_if_it_fits_it_hits", "If It Fits, It Hits", "Attack 100 times from inside a Box.", G("life.attacksFromBoxes", 100), { group: "cat" }),
    A("ach_sunbeam_spa", "Sunbeam Spa", "Heal 60 Warmth in a single run.", G("run.warmthHealed", 60), { group: "cat" }),

    /* Economy, deck and style (10) */
    A("ach_gerald_favourite", "Gerald's Favourite Customer", "Spend 2000 Fish in total. He has named a shelf after you.", G("life.fishSpent", 2000), { group: "style" }),
    A("ach_fridge_rule", "Gerald's Cousin Sends Regards", "Lose Fish to the Fridge Rule. The fish made themselves known.", G("life.fridgeLosses", 1), { group: "style" }),
    A("ach_lean_clowder", "Lean Clowder", "Win a run with 14 or fewer cards.", ALL(WON, LE("run.deckSize", 14)), { group: "style", reward: "collar_reading_glasses" }),
    A("ach_clowder_overflow", "Clowder Overflow", "Hold 40 or more cards in your deck at once. Somebody has to say it is too many.", G("best.maxDeckSize", 40), { group: "style" }),
    A("ach_nothing_touched_the_sunbeam", "Nothing Touched the Sunbeam", "Finish 5 Clean Nights in one run.", G("run.cleanNights", 5), { group: "style" }),
    A("ach_flickered_did_not_go_out", "Flickered, Did Not Go Out", "Win a run after Warmth dropped to 2 or lower.", ALL(WON, LE("run.lowestWarmth", 2)), { group: "style" }),
    A("ach_never_spoke_to_raccoon", "Never Spoke to the Raccoon", "Win a run without visiting a single Shop.", ALL(WON, EQ("run.shopVisits", 0)), { group: "style" }),
    A("ach_short_nap", "Short Nap", "Win a run in under 30 minutes.", ALL(WON, LE("run.seconds", 1800)), { group: "style" }),
    A("ach_fashion_cat", "Fashion Cat", "Own 15 cosmetics. The Sunbeam has requested a lookbook.", G("derived.cosmeticsOwned", 15), { group: "style" }),
    A("ach_daily_mischief", "Daily Mischief", "Finish a Daily Challenge, win or lose.", G("life.dailiesPlayed", 1), { group: "style" })
  ];

  var loopTurnRule = {
    text: "A turn counts as a loop turn (once per turn) if any of: 15 or more cards played, the draw pile reshuffled 2 or more times, or the same card played 5 or more times.",
    anyOf: [{ stat: "cardsPlayedInTurn", gte: 15 }, { stat: "drawPileReshufflesInTurn", gte: 2 }, { stat: "sameCardPlaysInTurn", gte: 5 }],
    countsInBoss: "Loop turns inside a Boss fight also add to bossLoopTurns."
  };

  /* ------------------------------------------------------------------ */
  /* 7. DAILY CHALLENGE MODIFIERS (12)                                    */
  /* ------------------------------------------------------------------ */
  var dailyModifiers = [
    { id: "daily_caffeinated", name: "Caffeinated", text: "4 Zoomies per turn instead of 3. All pests have +20% HP.", effects: [{ type: "zoomiesPerTurn", value: 4 }, { type: "pestHpMult", value: 1.2 }] },
    { id: "daily_paper_paws", name: "Paper Paws", text: "Every cat has 1 fewer Life (minimum 1) and +2 Attack.", effects: [{ type: "catLivesDelta", value: -1, min: 1 }, { type: "catAttackDelta", value: 2 }] },
    { id: "daily_pest_parade", name: "Pest Parade", text: "Every battle has 25% more threat. Every battle pays 25% more Fish.", effects: [{ type: "threatMult", value: 1.25 }, { type: "fishRewardMult", value: 1.25 }] },
    { id: "daily_box_day", name: "Box Day", text: "Every battle starts with a Box on each floor. Boxes have 1 durability less.", effects: [{ type: "startBoxPerFloor", value: 1 }, { type: "boxDurabilityDelta", value: -1 }] },
    { id: "daily_hairball_season", name: "Hairball Season", text: "Gain a Hairball at the start of each round (max 6 in hand). Hairballs deal +2.", effects: [{ type: "addHairballEachRound", value: 1 }, { type: "hairballDamageDelta", value: 2 }] },
    { id: "daily_permanent_midnight", name: "Permanent Midnight", text: "Witching Hour happens every 2nd round. Night Visitors still arrive.", effects: [{ type: "witchingHourEvery", value: 2 }] },
    { id: "daily_fish_famine", name: "Fish Famine", text: "Start with 0 Fish. Fish rewards are halved. Shop prices are 40% lower.", effects: [{ type: "startFish", value: 0 }, { type: "fishRewardMult", value: 0.5 }, { type: "shopPriceMult", value: 0.6 }] },
    { id: "daily_spoiled_for_choice", name: "Spoiled for Choice", text: "Card drafts show 5 cards, but Skip pays no Fish.", effects: [{ type: "draftSize", value: 5 }, { type: "skipFish", value: 0 }] },
    { id: "daily_heavy_sleepers", name: "Heavy Sleepers", text: "Cats start every battle asleep with Rested 1. Stretch gives +4 per Rested instead of +3.", effects: [{ type: "startAsleep", rested: 1 }, { type: "stretchPerRested", value: 4 }] },
    { id: "daily_gravity_day", name: "Gravity Day", text: "Knock pushes 1 floor further and Shatter is doubled. Dizzy lasts 1 round longer.", effects: [{ type: "knockBonusFloors", value: 1 }, { type: "shatterMult", value: 2 }, { type: "dizzyDurationDelta", value: 1 }] },
    { id: "daily_mono_clan", name: "One Clan Household", text: "No side clan. Drafts are 100% main clan and neutral. Start with a random main clan relic.", effects: [{ type: "noSideClan" }, { type: "startClanRelic", value: 1 }] },
    { id: "daily_nine_lives_sale", name: "Nine Lives Sale", text: "Every cat gets +2 Lives. Max Warmth is 30 for the whole run.", effects: [{ type: "catLivesDelta", value: 2 }, { type: "maxWarmthSet", value: 30 }] }
  ];
  var dailyRules = {
    dateBasis: "UTC calendar date, format YYYY-MM-DD. Everyone in the world gets the same daily.",
    seed: "dailySeed(date): 8 chars from mulberry32(fnv1a('sb-daily-' + date)).",
    modifierPick: "Epoch day d, cycle = floor(d / 12). Each cycle is a seeded shuffle of the 12 modifiers, so every modifier appears once per 12 days.",
    clanPick: "Main clan and side clan from mulberry32(fnv1a('sb-daily-clans-' + date)). Champion slot 1 of the main clan is used even if still locked. Cradle Gift is none.",
    rankByWeekday: [4, 2, 3, 3, 4, 5, 6],
    rankByWeekdayNote: "Index is UTC getUTCDay(), Sunday = 0. Monday is gentle, Saturday is not.",
    scoring: "score = nightsSurvived * 100 + (won ? 500 : 0) + max(0, 3600 - seconds) / 10 + loopTurns * 5, rounded. Local best only.",
    unlocksRank: false,
    xp: "Normal Whisker XP plus 25 for the first finished daily of each date.",
    oneAttemptRule: "Retries allowed. Only the best score per date is kept."
  };

  /* ------------------------------------------------------------------ */
  /* 8. RUN SEEDS                                                         */
  /* ------------------------------------------------------------------ */
  var SEED_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; /* Crockford base32 */
  var seedRules = {
    format: "8 characters from the Crockford alphabet (no I, L, O, U).",
    alphabet: SEED_ALPHABET,
    normalize: "Uppercase; O becomes 0; I and L become 1; U becomes V; strip spaces and dashes; must be exactly 8 valid chars.",
    streams: ["map", "loot", "shop", "event", "battle", "omen", "gift", "mystery"],
    streamRule: "Each stream is mulberry32(fnv1a(seed + ':' + stream + ':' + index)). Choices never advance another stream, so reloading cannot reroll rewards.",
    combatRule: "Battle RNG = rngFor(seed, 'battle', nodeId). Combat never calls Math.random.",
    sources: { random: "Fresh random seed (Math.random is allowed in menus only).", typed: "Player typed a seed.", daily: "Daily Challenge seed.", replay: "Run Again or Replay Seed from the summary screen." },
    loadoutRule: "A seed fixes the maps, rewards, shops, events and battles, not the loadout. Same seed with another clan is a different run on the same house.",
    xpRule: "Random seeds: 100% XP. Typed or replayed seed: 50% XP the first time it is finished, 25% from then on. Daily seeds: 100% plus the daily bonus.",
    achievementRule: "Achievements and cosmetics unlock on any seed. Mischief Rank unlock requires a non-daily win.",
    shareText: "Nine Lives | {Victory|Defeat} | Rank {r} | {main} + {side} | {mm:ss} | Night {n}/9 | seed {seed}",
    seedLogCap: 200
  };
  function fnv1a(str) {
    var h = 0x811c9dc5 >>> 0, i;
    str = String(str);
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(seed, stream, idx) { return mulberry32(fnv1a(seed + ":" + stream + ":" + (idx == null ? 0 : idx))); }
  function seedFromRng(rnd) { var s = "", i; for (i = 0; i < 8; i++) s += SEED_ALPHABET.charAt(Math.floor(rnd() * 32)); return s; }
  function randomSeed(rndFn) { return seedFromRng(rndFn || Math.random); }
  function normalizeSeed(input) {
    var s = String(input == null ? "" : input).toUpperCase().replace(/[\s\-]/g, "");
    s = s.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
    return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(s) ? s : null;
  }
  function epochDay(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
    if (!m) return null;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }
  function todayUtc(now) { var d = new Date(now == null ? Date.now() : now); return d.toISOString().slice(0, 10); }
  function dailySeed(dateStr) { return seedFromRng(mulberry32(fnv1a("sb-daily-" + dateStr))); }
  function dailyChallenge(dateStr) {
    var day = epochDay(dateStr);
    if (day == null) return null;
    var cycle = Math.floor(day / 12), rnd = mulberry32(fnv1a("sb-daily-cycle-" + cycle)), perm = [], i, j, t;
    for (i = 0; i < 12; i++) perm.push(i);
    for (i = 11; i > 0; i--) { j = Math.floor(rnd() * (i + 1)); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    var mod = dailyModifiers[perm[((day % 12) + 12) % 12]];
    var cr = mulberry32(fnv1a("sb-daily-clans-" + dateStr));
    var main = CLANS[Math.floor(cr() * 4)], others = CLANS.filter(function (c) { return c !== main; });
    var side = mod.id === "daily_mono_clan" ? null : others[Math.floor(cr() * 3)];
    var wd = new Date(day * 86400000).getUTCDay();
    return { date: dateStr, seed: dailySeed(dateStr), modifier: mod, rank: dailyRules.rankByWeekday[wd],
      main: main, side: side, champion: "champion_" + main + "_1", gift: null, daily: true };
  }
  function dailyScore(run) {
    return Math.round((run.nightsSurvived || 0) * 100 + (run.won ? 500 : 0) + Math.max(0, 3600 - (run.seconds || 0)) / 10 + (run.loopTurns || 0) * 5);
  }

  /* ------------------------------------------------------------------ */
  /* 9. STATISTICS CATALOG                                                */
  /* kind: sum  = lifetime counter, run value added at run end            */
  /*       max  = best ever, run.best[key] compared at run end            */
  /* ------------------------------------------------------------------ */
  function S(key, label) { return { key: key, kind: "sum", label: label }; }
  function M(key, label) { return { key: key, kind: "max", label: label }; }
  var statsCatalog = [
    S("runsStarted", "Runs finished"), S("runsWon", "Runs won"), S("runsLost", "Runs lost"), S("runsRetired", "Runs retired"),
    S("dailiesPlayed", "Dailies finished"), S("dailiesWon", "Dailies won"),
    S("nightsSurvived", "Nights survived"), S("battlesWon", "Battles won"), S("elitesBeaten", "Elites beaten"), S("bossesBeaten", "Bosses beaten"),
    S("cardsPlayed", "Cards played"), S("damageDealt", "Damage dealt"), S("pestsDefeated", "Pests defeated"), S("shatterDamage", "Shatter damage dealt"),
    S("knocksDone", "Pests knocked down"), S("pestsKnockedOutCellar", "Pests knocked out of the Cellar"),
    S("livesSpent", "Cat Lives spent"), S("catsLostForGood", "Cats lost for good"), S("revives", "Cats revived"),
    S("napsTaken", "Naps taken"), S("stretchAttacks", "Stretch attacks"), S("rudeAwakenings", "Rude Awakenings"), S("cornerKills", "Cornered kills"),
    S("hairballsCoughed", "Hairballs coughed"), S("hairballsThrown", "Hairballs thrown"),
    S("boxEntries", "Cats put in Boxes"), S("attacksFromBoxes", "Attacks from Boxes"),
    S("witchingHours", "Witching Hours survived"), S("nipSurges", "Catnip Surges"), S("nipCrashes", "Crashes"),
    S("loopTurns", "Loop turns"), S("bossLoopTurns", "Loop turns against Bosses"),
    S("fishEarned", "Fish earned"), S("fishSpent", "Fish spent"), S("fridgeLosses", "Fish lost to the Fridge Rule"),
    S("warmthLost", "Warmth lost"), S("warmthHealed", "Warmth healed"), S("cleanNights", "Clean Nights"),
    S("upgrades", "Cards upgraded"), S("shopVisits", "Shop visits"), S("eventsSeen", "Events seen"), S("treasuresOpened", "Boxes opened"), S("boxSits", "Boxes sat in"),
    S("cradleGifts", "Cradle Gifts taken"), S("cardsSkipped", "Drafts skipped"), S("secondsPlayed", "Seconds played"),
    M("biggestHit", "Biggest single hit"), M("longestTurnCards", "Most cards in one turn"), M("maxPurr", "Highest Purr on a floor"),
    M("maxRested", "Highest Rested"), M("biggestStretch", "Biggest Stretch attack"), M("maxYarnOnPest", "Most Yarn on one pest"),
    M("maxPile", "Biggest Pile"), M("maxHiddenCats", "Most Hidden cats at once"), M("shatterInBattle", "Most Shatter in one fight"),
    M("hairballsThrownInTurn", "Most Hairballs thrown in a turn"), M("revivesInBattle", "Most revives in one fight"),
    M("maxFluff", "Highest Fluff"), M("maxZoomiesInTurn", "Most Zoomies in a turn"), M("maxDeckSize", "Biggest deck"), M("maxRelics", "Most relics held"), M("maxKnead", "Highest Knead")
  ];
  var runSummaryFields = {
    note: "Pass this to SB.data.meta.recordRun(profile, run, now). Missing numbers count as 0.",
    identity: ["result ('won'|'lost'|'retired')", "seed", "seedSource ('random'|'typed'|'daily'|'replay')", "daily (bool)", "dailyDate (YYYY-MM-DD)",
      "rank", "mainClan", "sideClan", "championId", "giftId", "killedBy"],
    run: ["nightsSurvived (0 to 9)", "elitesBeaten", "bossesBeaten", "seconds", "deckSize", "relicCount", "lowestWarmth", "livesSpent"],
    counters: "every 'sum' key in statsCatalog (e.g. cardsPlayed, loopTurns, bossLoopTurns, fishSpent)",
    best: "object {key: value} for every 'max' key in statsCatalog",
    omens: "array of {id, survived (bool)} for each Night Omen met"
  };

  /* ------------------------------------------------------------------ */
  /* 10. PROFILE SAVE SCHEMA sb_profile_v1                                */
  /* ------------------------------------------------------------------ */
  var profileSchema = {
    key: SAVE_KEY, backupKey: SAVE_KEY + "_bak", version: 1,
    shape: {
      v: 1, createdAt: "ms epoch", updatedAt: "ms epoch", name: "string, default 'Unnamed Cat'",
      xp: "total Whisker XP", level: "1 to 30 (derived from xp, stored for quick reads)",
      unlocked: { clans: "[id]", champions: "[id]", relics: "[gated relic ids unlocked]", gifts: "[id]", coats: "[id]", collars: "[id]" },
      equipped: { "default": { coat: "id", collar: "id" }, byChampion: "{ championId: { coat, collar } }" },
      mischief: { unlocked: "highest selectable rank 0 to 10", highestWon: "-1 to 10", selected: "last used rank", crowned: "bool, won at rank 10" },
      loadoutLast: { main: "id", side: "id", championId: "id", giftId: "id|null", rank: "n" },
      achievements: "{ achId: { at: ms, seed } }",
      stats: { life: "{ key: n } sums", best: "{ key: n } maxes", fastestWinSeconds: "n|null", bestWinStreak: "n", winStreak: "n",
        dailyStreak: "n", bestDailyStreak: "n", byClan: "{ clan: { runs, wins, xp } }", byChampion: "{ id: { runs, wins } }",
        byRank: "{ '0'..'10': { runs, wins, bestSeconds } }", byOmen: "{ omenId: { seen, survived } }" },
      daily: { lastFinishedDate: "YYYY-MM-DD|null", history: "{ date: { bestScore, won, attempts } } last 60 dates" },
      seedLog: "{ seed: finishedCount } last 200",
      recentRuns: "last 20 compact runs: { at, result, rank, main, side, champion, nights, seconds, seed, xp }",
      tutorial: { handbookSeen: "[ids]", firstFightDone: "bool", tipsOff: "bool" },
      settings: "{ hush, fast, leftHanded, reducedMotion, textScale } owned by the UI agent, kept here so one key holds the profile"
    }
  };
  function zeroStats() {
    var life = {}, best = {};
    statsCatalog.forEach(function (s) { (s.kind === "sum" ? life : best)[s.key] = 0; });
    return { life: life, best: best, fastestWinSeconds: null, bestWinStreak: 0, winStreak: 0, dailyStreak: 0, bestDailyStreak: 0,
      byClan: {}, byChampion: {}, byRank: {}, byOmen: {} };
  }
  var unlockables = [];
  function register(kind, list) { list.forEach(function (it) { unlockables.push({ kind: kind, id: it.id, name: it.name || it.id, unlock: it.unlock }); }); }
  register("clan", clans); register("champion", champions); register("relic", relicGates); register("gift", cradleGifts);
  register("coat", coats); register("collar", collars);
  var KIND_BUCKET = { clan: "clans", champion: "champions", relic: "relics", gift: "gifts", coat: "coats", collar: "collars" };

  function newProfile(now) {
    var p = {
      v: 1, createdAt: now || 0, updatedAt: now || 0, name: "Unnamed Cat", xp: 0, level: 1,
      unlocked: { clans: [], champions: [], relics: [], gifts: [], coats: [], collars: [] },
      equipped: { "default": { coat: "coat_classic_tabby", collar: "collar_red_bow" }, byChampion: {} },
      mischief: { unlocked: 0, highestWon: -1, selected: 0, crowned: false },
      loadoutLast: { main: "alley", side: "hearth", championId: "champion_alley_1", giftId: null, rank: 0 },
      achievements: {}, stats: zeroStats(), daily: { lastFinishedDate: null, history: {} },
      seedLog: {}, recentRuns: [],
      tutorial: { handbookSeen: [], firstFightDone: false, tipsOff: false },
      settings: { hush: false, fast: false, leftHanded: false, reducedMotion: false, textScale: 1 }
    };
    syncUnlocks(p);
    return p;
  }
  function unlockMet(u, p) {
    if (u.type === "start") return true;
    if (u.type === "level") return p.level >= u.level;
    if (u.type === "achievement") return !!p.achievements[u.id];
    if (u.type === "rankWin") return p.mischief.highestWon >= u.rank;
    return false;
  }
  /* Adds every newly satisfied unlock to the profile, returns [{kind,id,name}] */
  function syncUnlocks(p) {
    var fresh = [];
    unlockables.forEach(function (it) {
      var bucket = p.unlocked[KIND_BUCKET[it.kind]];
      if (bucket.indexOf(it.id) < 0 && unlockMet(it.unlock, p)) { bucket.push(it.id); fresh.push({ kind: it.kind, id: it.id, name: it.name }); }
    });
    return fresh;
  }
  function isRelicAvailable(p, relicId) {
    var gated = relicGates.some(function (r) { return r.id === relicId; });
    return !gated || p.unlocked.relics.indexOf(relicId) >= 0;
  }
  function deepFill(target, defaults) {
    var k;
    for (k in defaults) {
      if (!Object.prototype.hasOwnProperty.call(defaults, k)) continue;
      if (target[k] === undefined || target[k] === null && defaults[k] !== null) target[k] = defaults[k];
      else if (defaults[k] && typeof defaults[k] === "object" && !Array.isArray(defaults[k]) && typeof target[k] === "object") deepFill(target[k], defaults[k]);
    }
    return target;
  }
  function migrate(raw, now) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var p = deepFill(raw, newProfile(now || raw.createdAt || 0));
    p.level = levelFromXp(p.xp).level;
    syncUnlocks(p);
    return p;
  }
  /* Storage: every access wrapped in try/catch. Returns { profile, status } */
  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return { profile: newProfile(Date.now()), status: "new" };
      var p = migrate(JSON.parse(raw));
      if (!p) return { profile: newProfile(Date.now()), status: "corrupt", raw: raw };
      return { profile: p, status: (p.v > 1 ? "newer" : "ok") };
    } catch (e) {
      return { profile: newProfile(Date.now()), status: raw ? "corrupt" : "unavailable", raw: raw };
    }
  }
  function save(p, now) {
    try {
      p.updatedAt = now || Date.now();
      var prev = window.localStorage.getItem(SAVE_KEY);
      if (prev) window.localStorage.setItem(SAVE_KEY + "_bak", prev);
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(p));
      return true;
    } catch (e) { return false; }
  }
  function exportProfile(p) {
    try { return "SB1:" + btoa(unescape(encodeURIComponent(JSON.stringify(p)))); } catch (e) { return null; }
  }
  function importProfile(text) {
    try {
      var s = String(text || "").trim();
      if (s.indexOf("SB1:") !== 0) return null;
      return migrate(JSON.parse(decodeURIComponent(escape(atob(s.slice(4))))));
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* 11. XP, ACHIEVEMENT CHECKS, RUN RECORDING                            */
  /* ------------------------------------------------------------------ */
  function normalizeRun(r, final) {
    var run = {}, k;
    r = r || {};
    for (k in r) if (Object.prototype.hasOwnProperty.call(r, k)) run[k] = r[k];
    statsCatalog.forEach(function (s) { if (s.kind === "sum" && typeof run[s.key] !== "number") run[s.key] = 0; });
    run.best = run.best || {};
    ["nightsSurvived", "elitesBeaten", "bossesBeaten", "seconds", "deckSize", "rank", "livesSpent", "shopVisits"].forEach(function (key) { if (typeof run[key] !== "number") run[key] = 0; });
    if (typeof run.lowestWarmth !== "number") run.lowestWarmth = 999;
    run.won = run.result === "won";
    run.final = !!final;
    run.seedSource = run.seedSource || (run.daily ? "daily" : "random");
    if (final) {
      run.runsStarted = 1; run.runsWon = run.won ? 1 : 0; run.runsLost = run.result === "lost" ? 1 : 0; run.runsRetired = run.result === "retired" ? 1 : 0;
      run.dailiesPlayed = run.daily ? 1 : 0; run.dailiesWon = run.daily && run.won ? 1 : 0;
    } else { run.runsStarted = run.runsWon = run.runsLost = run.runsRetired = run.dailiesPlayed = run.dailiesWon = 0; }
    return run;
  }
  function runXp(run, profile) {
    var r = (run.result ? run : normalizeRun(run, true));
    var base = (r.nightsSurvived || 0) * 10 + (r.elitesBeaten || 0) * 5 + (r.bossesBeaten || 0) * 20 + (r.won ? 50 : 0) + (r.rank || 0) * 10;
    var played = profile && profile.seedLog && profile.seedLog[r.seed] ? profile.seedLog[r.seed] : 0;
    var factor = 1;
    if (r.seedSource === "typed" || r.seedSource === "replay") factor = played > 0 ? 0.25 : 0.5;
    var bonus = 0;
    if (r.daily && profile && r.dailyDate && !(profile.daily.history[r.dailyDate])) bonus = 25;
    return { base: base, factor: factor, bonus: bonus, total: Math.round(base * factor) + bonus };
  }
  function resolvePath(ctx, path) {
    var parts = path.split("."), v = ctx, i;
    for (i = 0; i < parts.length; i++) { if (v == null) return 0; v = v[parts[i]]; }
    return v == null ? 0 : v;
  }
  function evalCond(c, ctx) {
    if (c.all) return c.all.every(function (x) { return evalCond(x, ctx); });
    var v = resolvePath(ctx, c.path);
    if ("gte" in c) return v >= c.gte;
    if ("lte" in c) return v <= c.lte;
    if ("eq" in c) return v === c.eq;
    return false;
  }
  function buildCtx(profile, run) {
    var ctx = { life: {}, best: {}, run: run, derived: {} }, st = profile.stats;
    statsCatalog.forEach(function (s) {
      if (s.kind === "sum") ctx.life[s.key] = (st.life[s.key] || 0) + (run[s.key] || 0);
      else ctx.best[s.key] = Math.max(st.best[s.key] || 0, (run.best && run.best[s.key]) || 0);
    });
    var streak = st.winStreak || 0;
    if (run.final) streak = run.won ? streak + 1 : (run.result === "lost" || run.result === "retired" ? 0 : streak);
    ctx.best.winStreak = Math.max(st.bestWinStreak || 0, streak);
    var won = {}, c;
    for (c in st.byClan) if (st.byClan[c].wins > 0) won[c] = true;
    if (run.final && run.won && run.mainClan) won[run.mainClan] = true;
    ctx.derived.clansWon = Object.keys(won).length;
    ctx.derived.cosmeticsOwned = profile.unlocked.coats.length + profile.unlocked.collars.length;
    return ctx;
  }
  /* Mutates profile.achievements. Safe to call repeatedly with a partial run. Returns newly earned achievements. */
  function checkAchievements(profile, runIn, now) {
    var run = runIn && runIn.best && "final" in runIn ? runIn : normalizeRun(runIn, false);
    var ctx = buildCtx(profile, run), fresh = [];
    achievements.forEach(function (a) {
      if (profile.achievements[a.id]) return;
      if (evalCond(a.cond, ctx)) { profile.achievements[a.id] = { at: now || 0, seed: run.seed || null }; fresh.push(a); }
    });
    return fresh;
  }
  function bump(obj, key, init) { if (!obj[key]) obj[key] = init; return obj[key]; }
  function recordRun(profile, runIn, now) {
    var run = normalizeRun(runIn, true), st = profile.stats, report, xp, before = profile.level, k;
    xp = runXp(run, profile);
    report = { xp: xp, levelsGained: [], achievements: [], unlocks: [], rankUnlocked: null, crowned: false };
    report.achievements = checkAchievements(profile, run, now);

    statsCatalog.forEach(function (s) {
      if (s.kind === "sum") st.life[s.key] = (st.life[s.key] || 0) + (run[s.key] || 0);
      else st.best[s.key] = Math.max(st.best[s.key] || 0, (run.best && run.best[s.key]) || 0);
    });
    st.winStreak = run.won ? (st.winStreak || 0) + 1 : 0;
    st.bestWinStreak = Math.max(st.bestWinStreak || 0, st.winStreak);
    if (run.daily) {
      var last = profile.daily.lastFinishedDate, today = run.dailyDate;
      if (today && last !== today) {
        var gap = (epochDay(today) != null && last && epochDay(last) != null) ? epochDay(today) - epochDay(last) : null;
        st.dailyStreak = gap === 1 ? (st.dailyStreak || 0) + 1 : 1;
        st.bestDailyStreak = Math.max(st.bestDailyStreak || 0, st.dailyStreak);
        profile.daily.lastFinishedDate = today;
      }
      if (today) {
        var h = bump(profile.daily.history, today, { bestScore: 0, won: false, attempts: 0 });
        h.attempts++; h.bestScore = Math.max(h.bestScore, dailyScore(run)); h.won = h.won || run.won;
        var keys = Object.keys(profile.daily.history).sort();
        while (keys.length > 60) delete profile.daily.history[keys.shift()];
      }
    }
    if (run.won && run.seconds > 0 && (st.fastestWinSeconds == null || run.seconds < st.fastestWinSeconds)) st.fastestWinSeconds = run.seconds;
    if (run.mainClan) {
      var bc = bump(st.byClan, run.mainClan, { runs: 0, wins: 0, xp: 0 }); bc.runs++; bc.wins += run.won ? 1 : 0; bc.xp += xp.total;
    }
    if (run.championId) { var bh = bump(st.byChampion, run.championId, { runs: 0, wins: 0 }); bh.runs++; bh.wins += run.won ? 1 : 0; }
    var br = bump(st.byRank, String(run.rank), { runs: 0, wins: 0, bestSeconds: null });
    br.runs++; if (run.won) { br.wins++; if (run.seconds > 0 && (br.bestSeconds == null || run.seconds < br.bestSeconds)) br.bestSeconds = run.seconds; }
    (run.omens || []).forEach(function (o) { var bo = bump(st.byOmen, o.id, { seen: 0, survived: 0 }); bo.seen++; bo.survived += o.survived ? 1 : 0; });

    if (run.won) {
      profile.mischief.highestWon = Math.max(profile.mischief.highestWon, run.rank);
      if (!run.daily && run.rank === profile.mischief.unlocked && run.rank < 10) { profile.mischief.unlocked = run.rank + 1; report.rankUnlocked = run.rank + 1; }
      if (run.rank >= 10 && !profile.mischief.crowned) { profile.mischief.crowned = true; report.crowned = true; }
    }
    if (run.seed) {
      profile.seedLog[run.seed] = (profile.seedLog[run.seed] || 0) + 1;
      var sk = Object.keys(profile.seedLog);
      while (sk.length > seedRules.seedLogCap) delete profile.seedLog[sk.shift()];
    }
    profile.recentRuns.push({ at: now || 0, result: run.result, rank: run.rank, main: run.mainClan || null, side: run.sideClan || null,
      champion: run.championId || null, nights: run.nightsSurvived, seconds: run.seconds, seed: run.seed || null, xp: xp.total, daily: !!run.daily });
    while (profile.recentRuns.length > 20) profile.recentRuns.shift();

    profile.xp += xp.total;
    profile.level = levelFromXp(profile.xp).level;
    for (k = before + 1; k <= profile.level; k++) report.levelsGained.push(k);
    report.unlocks = syncUnlocks(profile);
    profile.mischief.selected = Math.min(profile.mischief.selected, profile.mischief.unlocked);
    profile.updatedAt = now || profile.updatedAt;
    report.level = levelFromXp(profile.xp);
    return report;
  }

  /* ------------------------------------------------------------------ */
  /* 12. LEVEL TREE (generated from unlockables, so it cannot drift)      */
  /* ------------------------------------------------------------------ */
  var levels = [];
  (function () {
    var n;
    for (n = 1; n <= MAX_LEVEL; n++) levels.push({ level: n, title: LEVEL_TITLES[n - 1], xpToNext: xpForNext(n), xpTotal: xpTotalForLevel(n), unlocks: [] });
    unlockables.forEach(function (it) {
      if (it.unlock.type === "start") levels[0].unlocks.push({ kind: it.kind, id: it.id, name: it.name, note: "starting kit" });
      else if (it.unlock.type === "level") levels[it.unlock.level - 1].unlocks.push({ kind: it.kind, id: it.id, name: it.name });
    });
  })();
  var otherUnlocks = unlockables.filter(function (u) { return u.unlock.type === "achievement" || u.unlock.type === "rankWin"; })
    .map(function (u) { return { kind: u.kind, id: u.id, name: u.name, unlock: u.unlock }; });

  return {
    saveKey: SAVE_KEY, maxLevel: MAX_LEVEL, clanIds: CLANS,
    xp: { forNext: xpForNext, totalForLevel: xpTotalForLevel, fromXp: levelFromXp, formula: "Per run: nights*10 + elites*5 + bosses*20 + (won ? 50 : 0) + rank*10, then seed factor, then daily bonus. Level n to n+1 costs 60 + 25*(n-1)." },
    levels: levels, otherUnlocks: otherUnlocks, unlockables: unlockables,
    clans: clans, champions: champions, relicGates: relicGates, cradleGifts: cradleGifts,
    coats: coats, collars: collars,
    ranks: ranks, rankRules: rankRules, cumulativeMods: cumulativeMods,
    omens: omens, omenRules: omenRules,
    achievements: achievements, loopTurnRule: loopTurnRule,
    dailyModifiers: dailyModifiers, dailyRules: dailyRules,
    seedRules: seedRules, seed: { fnv1a: fnv1a, mulberry32: mulberry32, rngFor: rngFor, randomSeed: randomSeed, normalize: normalizeSeed, daily: dailySeed, todayUtc: todayUtc },
    statsCatalog: statsCatalog, runSummaryFields: runSummaryFields, profileSchema: profileSchema,
    championIdMap: { champion_alley_1: "alley_shadow", champion_alley_2: "alley_mad_maxine", champion_hearth_1: "hearth_duchess_marmalade", champion_hearth_2: "hearth_brother_crumpet", champion_moon_1: "moon_oswin_ledgerpaw", champion_moon_2: "moon_tuppence_mistfur", champion_mischief_1: "mischief_tumble_ledgeworth", champion_mischief_2: "mischief_parcel_pennywhistle" },
    newProfile: newProfile, migrate: migrate, load: load, save: save, exportProfile: exportProfile, importProfile: importProfile,
    syncUnlocks: syncUnlocks, isRelicAvailable: isRelicAvailable,
    runXp: runXp, checkAchievements: checkAchievements, recordRun: recordRun,
    dailyChallenge: dailyChallenge, dailyScore: dailyScore
  };
})();
