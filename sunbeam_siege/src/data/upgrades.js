/* SUNBEAM SIEGE: upgrades.js (agent B15)
 * Upgrade catalog, forks, evolution chains and Gerald's shop config.
 *
 * Exposes: SB.data.upgrades (array), SB.data.upgradeGroups (object), SB.data.upgradeFits(cardDef, up),
 *          SB.data.forks (array), SB.data.evolutions (array), SB.data.shop (object).
 *
 * Conventions: A06 schema for upgrades (ops addStat, mulStat, grantKeyword, addTrigger, setFlag, addLives, addSlot).
 * Trigger payloads (`do`) and fork patches use the A03 effect DSL. Terms follow RULES.md (Fluff, Yarn, Dizzy, Claws).
 * A06 "treat" is `toy` here (A03 card type). A06 "Armor" is Fluff. A06 "Tangled" is Yarn. A06 "Hobble" is Yarn or Dizzy.
 *
 * NEEDS (engine agent, new names this file uses beyond A03/A06):
 *  - upgrade op "grantMasteryRank" {n}: instantly raise Mastery rank by n (max 3).
 *  - upgrade setFlag flags: "fastLearner" (Mastery thresholds -1 for this card, min 2),
 *    "doubleTrigger" (toy turn triggers fire twice), "witchingMaster" (Zoom hit full damage, no Frazzled),
 *    "survive1" (once per fight a lethal hit leaves 1 Health and spends no life).
 *  - addTrigger "when" values: "fightEnd", "onWake" (a Nap ends), "onNap", "onDamaged", "onDeath", "onKill", "onHit".
 *  - A03 effect type "fish" {amount, capPerFight}: gain Fish (Pocket Change, Fish Finder).
 *  - A03 effect "box" accepts {size:2} (Big Box) and {durability:n}.
 *  - Effect target "yarnedEnemiesOnFloor" and "frontEnemyEachFloor".
 *  - Fork patch may carry "targeting" and "cost" (A03 9.4 only lists cost/stats/keywords/text/effects/aura).
 *  - Keyword "ambush" (A06 champions use it), keyword "knead" as {n, stat, trigger}.
 *  - Event hooks: "onWitching" (Witching Hour starts), "onYarnBreak", "onKneadTriggered".
 *  - Targets: "strongestEnemy", "secondStrongestEnemy", "otherEnemiesOnFloor", "hairballsInHand".
 *  - Checks/fields: "napsThisTurn", "playedThisFight"; trigger options oncePerFight, oncePerTurn, capPerFight, when2:"knocked".
 *  - Shop: consumables with effects nextFightNip, nextFightYarnCellar, actFluff, championTierNow, shopDiscount, grantRelic.
 *  - Condition checks: "selfInBox", "pileSize", "handSize", "cardsPlayedThisTurn" (A03 list covers most).
 * Forks are keyed by guessed card ids. The engine maps them via card.id, then `aliases`, then `match` (type, clan, tags).
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  "use strict";

  // ---- effect helpers (A03 DSL) ----
  var dmg = function (n, t, x) { return Object.assign({ type: "damage", amount: n, kind: "hit", target: t || "chosenEnemy" }, x || {}); };
  var shat = function (n, t) { return { type: "damage", amount: n, kind: "shatter", target: t || "chosenEnemy" }; };
  var heal = function (n, t) { return { type: "heal", amount: n, target: t || "self" }; };
  var fluff = function (n, t) { return { type: "fluff", amount: n, target: t || "self" }; };
  var st = function (s, n, t) { return { type: "applyStatus", status: s, amount: n, target: t || "self" }; };
  var buff = function (stat, n, dur, t) { return { type: "buff", stat: stat, amount: n, duration: dur || "fight", target: t || "self" }; };
  var draw = function (n) { return { type: "draw", amount: n }; };
  var knock = function (n, t) { return { type: "knock", amount: n, target: t || "chosenEnemy" }; };
  var mk = function (card, n, to) { return { type: "createCard", card: card, amount: n || 1, to: to || "hand" }; };
  var life = function (n, t) { return { type: "lives", amount: n, target: t || "self" }; };
  var floorSt = function (s, n, t) { return { type: "floorStatus", status: s, amount: n, target: t || "thisFloor" }; };

  // ---- upgrade helper ----
  var BASE = { 1: 40, 2: 75, 3: 120 };
  function up(id, name, tier, fits, fish, text, flavor, effects, o) {
    return Object.assign({
      id: id, name: name, tier: tier, rarity: "common", fits: fits, costFish: fish || BASE[tier],
      slots: 1, group: null, requires: null, effects: effects, text: text, flavor: flavor
    }, o || {});
  }
  var U = ["unit"], S = ["spell"], T = ["toy"], A = ["any"];
  var kw = function (k, n) { return { op: "grantKeyword", keyword: k, n: n }; };
  var add = function (stat, v) { return { op: "addStat", stat: stat, value: v }; };
  var trig = function (when, d, extra) { return Object.assign({ op: "addTrigger", when: when, do: d }, extra || {}); };

  var upgrades = [
    // ===================== TIER 1 (A06 originals) =====================
    up("up_sharp_claws", "Sharp Claws", 1, U, 40, "+2 Attack.", "Honed on the good sofa.", [add("attack", 2)]),
    up("up_thick_fur", "Thick Fur", 1, U, 40, "+6 Health.", "Shedding is a lifestyle.", [add("health", 6)]),
    up("up_louder_hiss", "Louder Hiss", 1, S, 40, "+3 to the spell's main number.", "Volume is a form of argument.", [add("value", 3)]),
    up("up_warm_spot", "Warm Spot", 1, T, 40, "Its effect is 1 stronger.", "Still warm from someone else.", [add("value", 1)]),
    up("up_cheap_thrills", "Cheap Thrills", 1, A, 40, "Costs 1 less. Only on cards costing 3 or more.", "Bargain bin, top shelf.", [add("cost", -1)], { group: "g_cost", requires: { minCost: 3 } }),
    up("up_hungry_hunter", "Hungry Hunter", 1, U, 40, "Each kill gives +1 Attack for the fight.", "Dinner is a verb.", [trig("onKill", [buff("power", 1, "fight")])]),
    up("up_gentle_purr", "Gentle Purr", 1, U, 40, "Purr 2.", "A low hum with no invoice.", [kw("purr", 2)], { group: "g_purr" }),
    up("up_keen_nose", "Keen Nose", 1, S, 40, "Draw 1 card.", "Smells a good card from two rooms away.", [trig("onPlay", [draw(1)])]),
    up("up_padded_paws", "Padded Paws", 1, A, 45, "Retain.", "Quiet. Patient. Held for later.", [{ op: "setFlag", flag: "retain" }], { group: "g_retain" }),
    up("up_groomed", "Groomed", 1, U, 40, "Starts each fight with Fluff 3.", "Spotless, smug and fully fluffed.", [kw("fluff", 3)], { group: "g_fluff" }),
    up("up_whisker_twitch", "Whisker Twitch", 1, U, 45, "Pounce 1 (attacks first when it arrives).", "Senses trouble. Welcomes it.", [kw("pounce", 1)], { group: "g_pounce", requires: { lacksKeyword: "pounce" } }),
    up("up_hairball_habit", "Hairball Habit", 1, U, 40, "Coughs up 1 Hairball at the end of its first turn each fight.", "Always on the good rug.", [trig("turnEnd", [mk("hairball", 1, "hand")], { oncePerFight: true })], { requires: { clanOrTag: ["mischief", "hairball"] } }),

    // ===================== TIER 1 (new) =====================
    up("up_sturdy_bones", "Sturdy Bones", 1, U, 45, "+1 Attack and +4 Health.", "Big boned, as stated on the form.", [add("attack", 1), add("health", 4)]),
    up("up_dewclaw_polish", "Dewclaw Polish", 1, U, 40, "Pounce +1.", "The fifth claw nobody mentions.", [kw("pounce", 1)], { group: "g_pounce", requires: { hasKeyword: "pounce" } }),
    up("up_loud_meow", "Loud Meow", 1, S, 40, "Also give Fluff 3 to every cat on the target floor.", "Wakes the neighbours and the armor.", [trig("onPlay", [fluff(3, "allCatsOnFloor")])]),
    up("up_puffed_tail", "Puffed Tail", 1, U, 40, "Deploy: gain Fluff 4.", "Looks larger. Is not larger.", [trig("onPlay", [fluff(4, "self")])], { group: "g_fluff" }),
    up("up_early_riser", "Early Riser", 1, A, 45, "Innate.", "First at the bowl every single time.", [{ op: "setFlag", flag: "innate" }], { group: "g_innate", requires: { lacksKeyword: "innate" } }),
    up("up_pocket_change", "Pocket Change", 1, U, 40, "Each kill gives 1 Fish (max 3 per fight).", "Found under a pest. Do not ask.", [trig("onKill", [{ type: "fish", amount: 1, capPerFight: 3 }])]),
    up("up_drowsy_start", "Drowsy Start", 1, U, 40, "Starts each fight with Rested 1.", "Already half asleep at the door.", [trig("fightStart", [st("rested", 1)])], { group: "g_rested" }),
    up("up_loose_thread", "Loose Thread", 1, S, 40, "Also apply Yarn 1 to the front pest on the floor.", "One pull and the whole day unravels.", [trig("onPlay", [st("yarn", 1, "frontEnemy")])]),
    up("up_gentle_shove", "Gentle Shove", 1, U, 45, "Its first hit each fight Knocks 1.", "Not violence. Rearranging.", [trig("onAfterAttack", [knock(1, "attackTarget")], { oncePerFight: true })], { group: "g_knock" }),
    up("up_nip_nibble", "Nip Nibble", 1, A, 40, "On play, gain 1 Nip.", "Just a nibble. The jar says so.", [trig("onPlay", [{ type: "catnip", amount: 1 }])], { group: "g_nip" }),
    up("up_snug_fit", "Snug Fit", 1, U, 40, "While in a Box: +1 Attack and +2 Health.", "Tailored by cardboard.", [{ op: "addAura", stat: "power", amount: 1, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }, { op: "addAura", stat: "health", amount: 2, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }], { group: "g_boxbonus" }),
    up("up_padded_frame", "Padded Frame", 1, T, 40, "On play, give Fluff 3 to every cat on this floor.", "Gets in the way, but kindly.", [trig("onPlay", [fluff(3, "allCatsOnFloor")])]),
    up("up_fast_learner", "Fast Learner", 1, A, 45, "Mastery thresholds are 1 lower for this card (min 2).", "Reads the manual. Eats the manual.", [{ op: "setFlag", flag: "fastLearner" }], { rarity: "uncommon", group: "g_mastery" }),
    up("up_hissy_fit", "Hissy Fit", 1, U, 40, "Deploy: apply Hiss 1 to the front pest on this floor.", "Spits first, asks never.", [trig("onPlay", [st("hiss", 1, "frontEnemy")])]),
    up("up_lick_wounds", "Lick Wounds", 1, U, 40, "End of turn: heal 2.", "Nature's cheapest bandage.", [trig("turnEnd", [heal(2, "self")])]),
    up("up_grudge_holder", "Grudge Holder", 1, U, 40, "Gain 1 Claws when damaged (max 3 per fight).", "Remembers everything. Forgives nothing.", [trig("onDamaged", [st("claws", 1, "self")], { capPerFight: 3 })]),
    up("up_hand_me_down", "Hand-Me-Down Hairball", 1, S, 35, "+3 to the main number. Add a Hairball to your hand.", "Cheap. Slightly damp.", [add("value", 3), trig("onPlay", [mk("hairball", 1, "hand")])], { requires: { clanOrTag: ["mischief", "hairball"] } }),
    up("up_warm_paws", "Warm Paws", 1, T, 40, "Start of turn: heal every cat on this floor for 1.", "Heated by an unknown source.", [trig("turnStart", [heal(1, "allCatsOnFloor")])]),

    // ===================== TIER 2 (A06 originals) =====================
    up("up_light_paws", "Light Paws", 2, A, 75, "Costs 1 less (not below 1).", "Tiptoes past the bill.", [add("cost", -1)], { group: "g_cost", requires: { minCost: 2 } }),
    up("up_patient_predator", "Patient Predator", 2, U, 75, "Ambush: its first hit each fight deals double.", "Waits. Waits. Waits. Hits.", [kw("ambush", 1)], { requires: { lacksKeyword: "ambush" } }),
    up("up_deep_purr", "Deep Purr", 2, U, 75, "Purr 3, stacks with existing Purr.", "Felt in the floorboards.", [kw("purr", 3)], { group: "g_purr" }),
    up("up_cuddle_magnet", "Cuddle Magnet", 2, U, 80, "+1 Attack per adjacent cat.", "Friends are a weapon.", [{ op: "addAura", stat: "power", amount: { base: 0, per: "adjacentCats", mult: 1 }, target: "self" }], { rarity: "uncommon" }),
    up("up_kneader", "Kneader", 2, U, 80, "Knead 1: +1 Attack permanently each time it is played.", "Biscuits, with intent.", [kw("knead", 1)], { rarity: "uncommon", requires: { lacksKeyword: "knead" } }),
    up("up_double_swat", "Double Swat", 2, U, 85, "Strikes twice.", "One for the pest, one for luck.", [kw("multistrike", 2)], { rarity: "uncommon", group: "g_multi" }),
    up("up_knock_knock", "Knock Knock", 2, U, 75, "First hit each turn knocks the pest down 1 floor.", "Who is there? Gravity.", [trig("onAfterAttack", [knock(1, "attackTarget")], { oncePerTurn: true })], { group: "g_knock" }),
    up("up_reusable", "Reusable", 2, A, 70, "Removes Exhaust.", "Washed, dried, played again.", [{ op: "setFlag", flag: "noExhaust" }], { requires: { hasKeyword: "exhaust" } }),
    up("up_sprint", "Sprint", 2, A, 70, "Gain 1 extra Zoomies next turn.", "Starts running before the turn does.", [trig("onPlay", [{ type: "zoomies", amount: 1, next: true }])]),
    up("up_second_helping", "Second Helping", 2, S, 80, "Echo: the first time each fight it is played, play it again free.", "Seconds are always allowed.", [kw("echo", 1)], { rarity: "uncommon", group: "g_echo" }),
    up("up_nap_ready", "Nap Ready", 2, U, 70, "When Rested at turn start: heal 4 and +2 Attack that turn.", "Wakes up swinging.", [trig("turnStart", [heal(4, "self"), buff("power", 2, "turn")], { if: [{ check: "selfHasStatus:rested", op: ">=", value: 1 }] })]),
    up("up_bigger_box", "Bigger Box", 2, U, 75, "While in a Box: +2 Attack and +4 Health.", "Always sizes up the packaging.", [{ op: "addAura", stat: "power", amount: 2, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }, { op: "addAura", stat: "health", amount: 4, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }], { group: "g_boxbonus" }),

    // ===================== TIER 2 (new) =====================
    up("up_pounce_plus", "Pounce Plus", 2, U, 75, "Pounce +2.", "Lands with feeling.", [kw("pounce", 2)], { group: "g_pounce", requires: { hasKeyword: "pounce" } }),
    up("up_frenzy_fuel", "Frenzy Fuel", 2, U, 80, "Each kill gives Frenzy 1.", "The taste of victory is mostly bird.", [trig("onKill", [st("frenzy", 1, "self")])], { rarity: "uncommon", requires: { clanOrTag: ["alley", "frenzy"] } }),
    up("up_lap_warden", "Lap Warden", 2, U, 75, "End of turn: add 1 Purr to this floor.", "Sits where it is needed. That is everywhere.", [trig("turnEnd", [floorSt("purr", 1)])], { group: "g_purr" }),
    up("up_cuddle_core", "Cuddle Core", 2, U, 80, "While in a Pile of 3 or more: +2 Attack.", "Warm in the middle. Dangerous too.", [{ op: "addAura", stat: "power", amount: 2, target: "self", if: [{ check: "pileSize", op: ">=", value: 3 }] }], { rarity: "uncommon", requires: { clanOrTag: ["hearth", "cuddle"] } }),
    up("up_deep_stretch", "Deep Stretch", 2, U, 80, "When it wakes from a Nap: +4 damage on the Stretch.", "A yawn with a payload.", [add("stretchOwnFlat", 4)], { rarity: "uncommon", requires: { clanOrTag: ["hearth", "nap"] } }),
    up("up_extra_blanket", "Extra Blanket", 2, S, 75, "Also give the target cat Rested 2.", "Three blankets, one cat, zero regrets.", [trig("onPlay", [st("rested", 2, "chosenCat")])], { requires: { clanOrTag: ["hearth", "nap"] } }),
    up("up_hairball_heirloom", "Hairball Heirloom", 2, A, 75, "Hairballs it creates deal +2 damage.", "Passed down through generations.", [kw("hairball", 2)], { requires: { hasKeyword: "hairball" } }),
    up("up_knock_plus", "Knock Plus", 2, A, 75, "Knock +1.", "A bigger shelf, a longer fall.", [kw("knock", 1)], { group: "g_knock", requires: { hasKeyword: "knock" } }),
    up("up_shatter_ready", "Shatter Ready", 2, A, 80, "Its Knocks deal 2 more Shatter per floor.", "Fragile things everywhere.", [kw("knockShatter", 2)], { rarity: "uncommon", requires: { hasKeyword: "knock" } }),
    up("up_yarn_binder", "Yarn Binder", 2, A, 75, "Yarn it applies lasts 1 longer.", "Knots with commitment.", [kw("yarn", 1)], { requires: { hasKeyword: "yarn" } }),
    up("up_box_lover", "Box Lover", 2, U, 75, "While in a Box: +3 Attack.", "If it fits, it hits.", [{ op: "addAura", stat: "power", amount: 3, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }], { group: "g_boxbonus" }),
    up("up_nip_hound", "Nip Hound", 2, U, 75, "Deploy: gain 2 Nip.", "Knows a guy. The guy is a plant.", [trig("onPlay", [{ type: "catnip", amount: 2 }])], { group: "g_nip", requires: { clanOrTag: ["mischief", "nip"] } }),
    up("up_iron_stomach", "Iron Stomach", 2, U, 75, "+10 Health.", "Has eaten worse and then slept on it.", [add("health", 10)]),
    up("up_tooth_and_nail", "Tooth and Nail", 2, U, 80, "+3 Attack and +3 Health.", "Both, enthusiastically.", [add("attack", 3), add("health", 3)], { rarity: "uncommon" }),
    up("up_ricochet", "Ricochet", 2, S, 80, "Also deal 3 damage to a random other pest.", "Off the wall, off the pest, off the cat.", [trig("onPlay", [dmg(3, "randomEnemy")])], { rarity: "uncommon" }),
    up("up_aftertaste", "Aftertaste", 2, S, 75, "Next turn start: deal 3 damage to a random pest.", "Lingers. Like a rumor.", [trig("onPlay", [{ type: "passive", trigger: "onTurnStart", once: true, effects: [dmg(3, "randomEnemy")] }])]),
    up("up_big_sister", "Big Sister", 2, U, 75, "Deploy: heal every cat on this floor for 4. +1 Health.", "Has opinions on your posture.", [trig("onPlay", [heal(4, "allCatsOnFloor")]), add("health", 1)]),
    up("up_longer_string", "Longer String", 2, T, 80, "Its effect is 2 stronger.", "Reaches the next room. Alarmingly.", [add("value", 2)], { rarity: "uncommon" }),
    up("up_lucky_draw", "Lucky Draw", 2, A, 75, "On play, if you hold 3 or fewer cards, draw 1.", "Pulls a card from an empty hat.", [trig("onPlay", [draw(1)], { if: [{ check: "handSize", op: "<=", value: 3 }] })]),
    up("up_fish_finder", "Fish Finder", 2, U, 70, "If played this fight, gain 3 Fish after it.", "Employed by a very small fishing fleet.", [trig("fightEnd", [{ type: "fish", amount: 3 }], { if: [{ check: "playedThisFight", op: "==", value: true }] })]),

    // ===================== TIER 3 (A06 originals) =====================
    up("up_weightless", "Weightless", 3, A, 120, "Costs 1 less, can reach 0.", "Floats. Judges you from above.", [add("cost", -1)], { rarity: "uncommon", group: "g_cost", requires: { minCost: 1 } }),
    up("up_apex_predator", "Apex Predator", 3, U, 120, "+4 Attack and Pounce.", "Top of the food chain, on a bookshelf.", [add("attack", 4), kw("pounce", 1)], { group: "g_pounce" }),
    up("up_legend_of_the_alley", "Legend of the Alley", 3, U, 130, "+50% Attack and Health.", "Stories are told. Most are true.", [{ op: "mulStat", stat: "attack", factor: 1.5 }, { op: "mulStat", stat: "health", factor: 1.5 }], { rarity: "rare", group: "g_hpmult" }),
    up("up_lucky_life", "Lucky Life", 3, U, 120, "+2 lives.", "Eight is for amateurs.", [{ op: "addLives", n: 2 }], { rarity: "rare", group: "g_lives" }),
    up("up_echo_meow", "Echo Meow", 3, S, 120, "The first play each fight is duplicated.", "Said it twice, for emphasis.", [trig("onPlay", [{ type: "replay", free: true }], { oncePerFight: true })], { rarity: "rare", group: "g_echo" }),
    up("up_nine_tail_whip", "Nine Tail Whip", 3, U, 110, "Each hit splashes 3 to every other pest on the floor.", "Nine tails is a fib. It feels like nine.", [trig("onAfterAttack", [dmg(3, "otherEnemiesOnFloor")])], { rarity: "uncommon" }),

    // ===================== TIER 3 (new) =====================
    up("up_second_wind", "Second Wind", 3, U, 125, "Once per fight, a lethal hit leaves it on 1 Health and spends no life.", "Not today. Possibly tomorrow.", [{ op: "setFlag", flag: "survive1" }], { rarity: "rare" }),
    up("up_stubborn_soul", "Stubborn Soul", 3, U, 110, "+1 life.", "Declined to leave. Twice.", [{ op: "addLives", n: 1 }], { rarity: "uncommon", group: "g_lives" }),
    up("up_ambush_artist", "Ambush Artist", 3, U, 120, "Ambush deals triple damage instead of double.", "Leaps out of nowhere, the long way round.", [kw("ambush", 2)], { rarity: "uncommon", requires: { hasKeyword: "ambush" } }),
    up("up_frenzy_engine", "Frenzy Engine", 3, U, 125, "Starts each fight with Frenzy 2.", "Idle speed: chaos.", [trig("fightStart", [st("frenzy", 2)])], { rarity: "rare", requires: { clanOrTag: ["alley", "frenzy"] } }),
    up("up_purr_engine", "Purr Engine", 3, U, 125, "Purr +3. End of turn: heal the Sunbeam 1.", "Idles at a pleasant rumble.", [kw("purr", 3), trig("turnEnd", [{ type: "warmth", amount: 1 }])], { rarity: "rare", group: "g_purr", requires: { clanOrTag: ["hearth", "purr"] } }),
    up("up_pile_driver", "Pile Driver", 3, U, 120, "+1 Attack per other cat on the floor. In a Heap: Fluff 2 each round.", "A cuddle, applied at speed.", [{ op: "addAura", stat: "power", amount: { base: 0, per: "otherCatsOnFloor", mult: 1 }, target: "self" }, trig("turnEnd", [fluff(2, "self")], { if: [{ check: "pileSize", op: ">=", value: 4 }] })], { rarity: "uncommon", requires: { clanOrTag: ["hearth", "cuddle"] } }),
    up("up_deep_sleeper", "Deep Sleeper", 3, U, 120, "Its Stretch deals an extra +3 per Rested stack.", "Dreams of a very large mouse.", [add("stretchOwnPerRested", 3)], { rarity: "rare", requires: { clanOrTag: ["hearth", "nap"] } }),
    up("up_dropkick", "Dropkick", 3, A, 125, "Knock +1. Its Knocks deal 3 more Shatter per floor.", "Wasn't a push. Was a lesson.", [kw("knock", 1), kw("knockShatter", 3)], { rarity: "rare", group: "g_knock", requires: { hasKeyword: "knock" } }),
    up("up_cardboard_castle", "Cardboard Castle", 3, T, 120, "Its Box holds 1 more cat and has +3 durability.", "Moat sold separately.", [{ op: "setFlag", flag: "boxCapacity+1" }, { op: "setFlag", flag: "boxDurability+3" }], { rarity: "uncommon", requires: { hasTag: "box" } }),
    up("up_yarn_storm", "Yarn Storm", 3, S, 120, "Also apply Yarn 2 to every pest on the target floor.", "The cat did this. The cat is proud.", [trig("onPlay", [st("yarn", 2, "allEnemiesOnFloor")])], { rarity: "uncommon" }),
    up("up_nip_overdrive", "Nip Overdrive", 3, A, 115, "On play: gain 3 Nip. Surging cats get +1 more Attack.", "Do not operate the furniture.", [trig("onPlay", [{ type: "catnip", amount: 3 }])], { rarity: "uncommon", group: "g_nip", requires: { clanOrTag: ["mischief", "nip"] } }),
    up("up_hairball_volley", "Hairball Volley", 3, S, 115, "Also add 2 Hairballs to your hand.", "Rapid fire, grudging aim.", [trig("onPlay", [mk("hairball", 2, "hand")])], { rarity: "uncommon", requires: { clanOrTag: ["mischief", "hairball"] } }),
    up("up_double_duty", "Double Duty", 3, T, 125, "Its start and end of turn effects trigger twice.", "Works two shifts. Napping counts.", [{ op: "setFlag", flag: "doubleTrigger" }], { rarity: "rare" }),
    up("up_cosmic_cat", "Cosmic Cat", 3, U, 120, "Witching Hour: its Zoom hits for full damage and it is never Frazzled.", "Stars are a rumor it started.", [{ op: "setFlag", flag: "witchingMaster" }], { rarity: "rare" }),
    up("up_big_boned", "Big Boned", 3, U, 120, "Double Health.", "Gravity applies to this cat, politely.", [{ op: "mulStat", stat: "health", factor: 2 }], { group: "g_hpmult" }),
    up("up_glass_cannon", "Glass Cannon", 3, U, 100, "Double Attack, Health x0.6 (round up).", "Handle with extreme care and fear.", [{ op: "mulStat", stat: "attack", factor: 2 }, { op: "mulStat", stat: "health", factor: 0.6 }], { rarity: "uncommon", group: "g_hpmult" }),
    up("up_crash_course", "Crash Course", 3, A, 120, "Instantly gain 1 Mastery rank.", "Skipped the lecture. Aced the exam.", [{ op: "grantMasteryRank", n: 1 }], { rarity: "rare", group: "g_mastery" })
  ];

  // exclusivity groups: one scratch per group per card
  var upgradeGroups = {
    g_cost: "Cost reducers", g_retain: "Retain", g_lives: "Extra lives", g_multi: "Multistrike", g_innate: "Innate",
    g_pounce: "Pounce boosters", g_fluff: "Starting Fluff", g_purr: "Purr boosters", g_knock: "Knock boosters",
    g_nip: "Nip gain", g_boxbonus: "Box bonuses", g_mastery: "Mastery boosts", g_echo: "Echo / replay",
    g_hpmult: "Stat multipliers", g_rested: "Starting Rested"
  };

  /* Fit check. cardDef follows A03 (type, cost, keywords, tags, clan, stats). `up.fits` uses unit | spell | toy | any.
   * `requires`: minCost, hasKeyword, lacksKeyword, hasTag, clanOrTag (clan id OR tag matches any), size. */
  // Knock, Yarn and Hairball are effect families more than printed keywords: a card "has" them when its text does something with them.
  function hasKw(c, name) {
    if ((c.keywords || {})[name]) return true;
    var s = JSON.stringify(c.effects || {});
    if (name === "knock") return /"type":"knock"/.test(s);
    if (name === "yarn") return /"status":"yarn"/.test(s);
    if (name === "hairball") return /hairball/.test(s);
    return false;
  }
  function upgradeFits(c, u) {
    var t = c.type === "champion" ? "unit" : c.type;
    if (c.type === "curse") return false;
    if (u.fits.indexOf("any") < 0 && u.fits.indexOf(t) < 0) return false;
    var r = u.requires || {}, k = c.keywords || {}, tags = c.tags || [];
    if (r.minCost != null && (typeof c.cost !== "number" || c.cost < r.minCost)) return false;
    if (r.hasKeyword && !hasKw(c, r.hasKeyword)) return false;
    if (r.lacksKeyword && k[r.lacksKeyword]) return false;
    if (r.hasTag && tags.indexOf(r.hasTag) < 0) return false;
    if (r.clanOrTag && r.clanOrTag.indexOf(c.clan) < 0 && !r.clanOrTag.some(function (x) { return tags.indexOf(x) >= 0; })) return false;
    return true;
  }

  // ===================== FORKS =====================
  // Each fork set: card (guessed id), aliases, clan, match, base (printed text), options (2 or 3) with A03 patches.
  function F(id, name, text, flavor, patch) { return { id: id, name: name, cost: 90, text: text, flavor: flavor, patch: patch }; }
  function set(card, clan, type, base, options, aliases, match) {
    return { id: "forks_" + card, card: card, aliases: aliases || [], clan: clan, type: type, base: base, match: match || { type: type, clan: clan }, options: options };
  }

  var forks = [
    set("swat", "neutral", "spell", "Deal 4 damage.", [
      F("fork_swat_haymaker", "Haymaker", "Costs 2. Deal 11 damage.", "Wound up since Tuesday.", { cost: 2, effects: { onPlay: [dmg(11)] }, text: "Costs 2. Deal 11 damage." }),
      F("fork_swat_flurry", "Flurry", "Deal 3 damage, then 2 damage to a random pest twice.", "Four paws, no plan.", { effects: { onPlay: [dmg(3), dmg(2, "randomEnemy", { times: 2 })] }, text: "Deal 3 damage, then 2 damage to a random pest twice." }),
      F("fork_swat_bat_down", "Bat Down", "Deal 3 damage. Knock 1.", "Edge of the table, edge of the law.", { effects: { onPlay: [dmg(3), knock(1)] }, text: "Deal 3 damage. Knock 1." })
    ], ["neutral_swat"]),
    set("catnap", "neutral", "spell", "A cat Naps, heals 3 and gains Rested 1 extra.", [
      F("fork_catnap_power_nap", "Power Nap", "A cat Naps, heals 6 and gains Rested 1 extra. Exhaust.", "Efficiency, horizontally.", { keywords: { exhaust: true }, effects: { onPlay: [{ type: "nap", target: "chosenCat" }, heal(6, "chosenCat"), st("rested", 1, "chosenCat")] }, text: "Nap, heal 6, Rested 1 extra. Exhaust." }),
      F("fork_catnap_nap_pile", "Nap Pile", "Every cat on the floor Naps and heals 2.", "Nobody sleeps alone. Nobody sleeps quietly.", { targeting: "floor", effects: { onPlay: [{ type: "nap", target: "allCatsOnFloor" }, heal(2, "allCatsOnFloor")] }, text: "Every cat on a floor Naps and heals 2." }),
      F("fork_catnap_dream", "Dream Sequence", "A cat Naps, gains Rested 1 extra. Draw 1.", "Dreamt of a better hand.", { effects: { onPlay: [{ type: "nap", target: "chosenCat" }, st("rested", 1, "chosenCat"), draw(1)] }, text: "A cat Naps, gains Rested 1 extra. Draw 1." })
    ], ["neutral_catnap"]),
    set("cardboard_box", "neutral", "toy", "Place a Box on a floor. A Box holds 1 cat.", [
      F("fork_box_big", "Big Box", "Costs 2. Place a Box that holds 2 cats.", "Dishwasher size. Very respectable.", { cost: 2, effects: { onPlay: [{ type: "box", target: "chosenFloor", size: 2 }] }, text: "Costs 2. Place a Box that holds 2 cats." }),
      F("fork_box_fort", "Box Fort", "Place a Box. A cat that enters it gains Fluff 5.", "Reinforced with a second box.", { effects: { onPlay: [{ type: "box", target: "chosenFloor" }, { type: "passive", trigger: "onCatDeployed", effects: [fluff(5, "triggerSource")] }] }, text: "Place a Box. A cat that enters it gains Fluff 5." }),
      F("fork_box_flat", "Flat Pack Promise", "Costs 0. Exhaust. Place a fragile Box (durability 1).", "Assembly required. Never assembled.", { cost: 0, keywords: { exhaust: true }, effects: { onPlay: [{ type: "box", target: "chosenFloor", durability: 1 }] }, text: "Costs 0. Exhaust. Place a Box (durability 1)." })
    ], ["neutral_cardboard_box"]),

    // ---- alley ----
    set("alley_scrapper", "alley", "unit", "2/4. Pounce 1.", [
      F("fork_scrapper_brawler", "Brawler", "3/5. Pounce 1. Kills give Claws 1.", "Won an argument with a dumpster.", { stats: { power: 3, health: 5 }, effects: { onKill: [st("claws", 1)] }, text: "Pounce 1. Kills give Claws 1." }),
      F("fork_scrapper_chorus", "Alley Chorus", "Pounce 1. Deploy: Hiss 1 on every pest on this floor.", "Sings at 3AM. For free.", { effects: { onPlay: [st("hiss", 1, "allEnemiesOnFloor")] }, text: "Pounce 1. Deploy: Hiss 1 on every pest on this floor." }),
      F("fork_scrapper_diver", "Bin Diver", "Pounce 1. Deploy: draw 1.", "Found a card in the trash. Kept it.", { effects: { onPlay: [draw(1)] }, text: "Pounce 1. Deploy: draw 1." })
    ], ["alley_basic_unit"]),
    set("zoomie_kitten", "alley", "unit", "Fleeting. Pounce 2. Deploy: draw 1.", [
      F("fork_zoomie_double", "Double Zoom", "Fleeting. Pounce 4. No draw.", "Faster than the thought of it.", { keywords: { pounce: 4 }, effects: { onPlay: [] }, text: "Fleeting. Pounce 4." }),
      F("fork_zoomie_brigade", "Zoomie Brigade", "Fleeting. Pounce 2. If first card this turn: add a Zoomie Kitten to your hand.", "They breed in the walls.", { effects: { onPlay: [mk("alley_gutter_kitten", 1, "hand")].map(function (e) { return Object.assign(e, { if: [{ check: "cardsPlayedThisTurn", op: "==", value: 1 }] }); }) }, text: "Fleeting. Pounce 2. First card this turn: add a Zoomie Kitten to hand." }),
      F("fork_zoomie_cannon", "Kitten Cannon", "Fleeting. Pounce 2. Deploy: Knock 1 the front pest.", "Aimed with confidence, fired in error.", { effects: { onPlay: [knock(1, "frontEnemy")] }, text: "Fleeting. Pounce 2. Deploy: Knock 1 the front pest." })
    ]),
    set("knock_off_tabby", "alley", "unit", "3/5. Attacks Knock 1.", [
      F("fork_tabby_edge_lord", "Edge Lord", "Attacks Knock 2.", "Eye contact. Slow push. Gravity does the rest.", { effects: { onAttack: [knock(2, "attackTarget")] }, text: "Attacks Knock 2." }),
      F("fork_tabby_gravity", "Gravity Enthusiast", "Attacks Knock 1 and deal 2 Shatter.", "The floor was not asking for that mug.", { effects: { onAttack: [knock(1, "attackTarget"), shat(2, "attackTarget")] }, text: "Attacks Knock 1 and deal 2 Shatter." }),
      F("fork_tabby_vase", "Paw on the Vase", "Deploy: Dizzy 1 on every pest on this floor. Attacks Knock 1.", "Slow blink. Then the vase.", { effects: { onPlay: [st("dizzy", 1, "allEnemiesOnFloor")] }, text: "Deploy: Dizzy 1 on every pest on this floor. Attacks Knock 1." })
    ]),
    set("cinder_tom", "alley", "unit", "4/5. Reborn. Death: 4 damage to all pests on this floor.", [
      F("fork_tom_phoenix", "Phoenix Tom", "Death: 8 damage to all pests on this floor. Exhaust, no Reborn.", "Goes out like a firework.", { keywords: { reborn: false, exhaust: true }, effects: { onDeath: [dmg(8, "allEnemiesOnFloor")] }, text: "Death: 8 damage to all pests on this floor. Exhaust." }),
      F("fork_tom_ember_eight", "Ember Eight", "Reborn. Death: 4 damage to every pest in the house.", "Eight lives, one grudge, whole house.", { effects: { onDeath: [dmg(4, "allEnemies")] }, text: "Reborn. Death: 4 damage to every pest in the house." }),
      F("fork_tom_ashes", "Ashes to Ashes", "Reborn. Death: give every cat on this floor Claws 2.", "Leaves a mark. Several, actually.", { effects: { onDeath: [st("claws", 2, "allCatsOnFloor")] }, text: "Reborn. Death: every cat on this floor gains Claws 2." })
    ]),
    set("off_the_shelf", "alley", "spell", "Knock 2. If it ends in the Cellar, deal 4 damage.", [
      F("fork_shelf_whole", "Whole Shelf", "Knock 1 every pest on a floor.", "Took the whole shelf. Took the books.", { targeting: "floor", effects: { onPlay: [knock(1, "allEnemiesOnFloor")] }, text: "Knock 1 every pest on a floor." }),
      F("fork_shelf_flip", "Table Flip", "Costs 2. Knock 3. If it ends in the Cellar, deal 8 damage.", "(Gently, gently, then not.)", { cost: 2, effects: { onPlay: [knock(3), dmg(8, "chosenEnemy", { if: [{ check: "targetFloor", op: "==", value: 1 }] })] }, text: "Costs 2. Knock 3. If it ends in the Cellar, deal 8 damage." }),
      F("fork_shelf_wobble", "Wobble", "Costs 0. Exhaust. Knock 1. Dizzy 1.", "Teeters. Then everything falls.", { cost: 0, keywords: { exhaust: true }, effects: { onPlay: [knock(1), st("dizzy", 1, "chosenEnemy")] }, text: "Costs 0. Exhaust. Knock 1. Dizzy 1." })
    ]),
    set("midnight_zoomies", "alley", "spell", "X cost. Deal 3 damage to a random pest X times. Exhaust.", [
      F("fork_zoomies_longer", "Longer Night", "Deal 3 damage to a random pest X+1 times. Exhaust.", "The night kept going. Nobody objected.", { effects: { onPlay: [dmg(3, "randomEnemy", { times: { base: 1, per: "x", mult: 1 } })] }, text: "Deal 3 to a random pest X+1 times. Exhaust." }),
      F("fork_zoomies_moonlit", "Moonlit Run", "Deal 3 X times. Every cat gains Claws equal to X/2 (round down).", "Ran on the moon's good side.", { effects: { onPlay: [dmg(3, "randomEnemy", { times: { base: 0, per: "x", mult: 1 } }), st("claws", { base: 0, per: "x", mult: 0.5 }, "allCats")] }, text: "Deal 3 X times. Every cat gains Claws equal to half X." }),
      F("fork_zoomies_pocket", "Pocket Zoomies", "Deal 2 damage to a random pest X times. No Exhaust.", "Small, reusable, extremely loud.", { keywords: { exhaust: false }, effects: { onPlay: [dmg(2, "randomEnemy", { times: { base: 0, per: "x", mult: 1 } })] }, text: "Deal 2 to a random pest X times." })
    ]),
    set("scratching_tower", "alley", "toy", "Cats here have +1 Power. Cats deployed here gain Pounce 1.", [
      F("fork_tower_condo", "Cat Condo", "Cats here have +2 Power. No Pounce.", "Granite countertops. Zero tenants paying.", { aura: [{ stat: "power", amount: 2, target: "allCatsOnFloor" }], effects: { onCatDeployed: [] }, text: "Cats here have +2 Power." }),
      F("fork_tower_spire", "Sisal Spire", "Cats deployed here gain Pounce 2.", "Tall, tough, eventually shredded.", { aura: [], effects: { onCatDeployed: [{ type: "grantKeyword", keyword: "pounce", amount: 2, target: "triggerSource" }] }, text: "Cats deployed here gain Pounce 2." }),
      F("fork_tower_frame", "Climbing Frame", "Cats here have +1 Power. End of turn: each cat here gains Claws 1.", "Where claws go to improve.", { effects: { onTurnEnd: [st("claws", 1, "allCatsOnFloor")] }, text: "Cats here have +1 Power. End of turn: each cat here gains Claws 1." })
    ]),

    // ---- hearth ----
    set("loaf_of_cat", "hearth", "unit", "1/7. Purr 1.", [
      F("fork_loaf_meat", "Meatloaf", "Purr 1. Deploy and on Nap: gain Fluff 4.", "Dense, warm, loyal.", { effects: { onPlay: [fluff(4)], onNap: [fluff(4)] }, text: "Purr 1. Deploy and on Nap: gain Fluff 4." }),
      F("fork_loaf_sourdough", "Sourdough", "Purr 1. Knead 1 (Health) each time it is played.", "Rises with the sun.", { keywords: { purr: 1, knead: { n: 1, stat: "health", trigger: "onPlay", cap: 12 } }, text: "Purr 1. Knead 1 (Health)." }),
      F("fork_loaf_bin", "Bread Bin", "0/5. Purr 3.", "Contains one cat and some crumbs.", { stats: { power: 0, health: 5 }, keywords: { purr: 3 }, text: "Purr 3." })
    ], ["hearth_loaf_of_cat", "lap_loaf_of_cat"]),
    set("cuddle_puddle", "hearth", "unit", "1/4. +1 Power and Health per other cat on this floor.", [
      F("fork_puddle_heap", "Heap Hero", "+2 Power per other cat on this floor, no Health bonus.", "Not a pile. A promotion.", { aura: [{ stat: "power", amount: { base: 0, per: "otherCatsOnFloor", mult: 2 }, target: "self" }], text: "+2 Power per other cat on this floor." }),
      F("fork_puddle_warm", "Warm Pile", "Same bonus. End of turn: heal every cat here for 2.", "Wet nose, warm heart.", { effects: { onTurnEnd: [heal(2, "allCatsOnFloor")] }, text: "Same bonus. End of turn: heal every cat here for 2." }),
      F("fork_puddle_anchor", "Cuddle Anchor", "Same bonus. End of turn, with 3 or more cats here: Fluff 4 for each.", "Holds the pile together with warmth.", { effects: { onTurnEnd: [fluff(4, "allCatsOnFloor")].map(function (e) { return Object.assign(e, { if: [{ check: "catsOnFloor", op: ">=", value: 3 }] }); }) }, text: "Same bonus. End of turn, with 3+ cats here: Fluff 4 for each." })
    ]),
    set("sunbeam_sprawler", "hearth", "unit", "2/10. Naps: add 2 Purr to floor, gain Fluff 3.", [
      F("fork_sprawler_panel", "Solar Panel", "Naps: heal the Sunbeam 2 and gain Fluff 3.", "Charges in the light. Bills in the dark.", { effects: { onNap: [{ type: "warmth", amount: 2 }, fluff(3)] }, text: "Naps: heal the Sunbeam 2 and gain Fluff 3." }),
      F("fork_sprawler_sprawl", "Full Sprawl", "Naps: add 4 Purr to this floor.", "Occupies four slots in spirit.", { effects: { onNap: [floorSt("purr", 4)] }, text: "Naps: add 4 Purr to this floor." }),
      F("fork_sprawler_chaser", "Sun Chaser", "Naps: add 2 Purr and Nap an adjacent cat too.", "Brought a friend. The friend is also asleep.", { effects: { onNap: [floorSt("purr", 2), { type: "nap", target: "adjacentCats" }] }, text: "Naps: add 2 Purr and Nap adjacent cats too." })
    ]),
    set("kneading_routine", "hearth", "spell", "Rest of fight: end of turn, add 1 Purr to every floor. Exhaust.", [
      F("fork_knead_marathon", "Marathon", "Costs 3. Rest of fight: end of turn, add 2 Purr to every floor. Exhaust.", "Kneaded until sunrise.", { cost: 3, effects: { onPlay: [{ type: "passive", trigger: "onTurnEnd", effects: [floorSt("purr", 2, "allFloors")] }] }, text: "Costs 3. Rest of fight: end of turn, 2 Purr on every floor. Exhaust." }),
      F("fork_knead_factory", "Biscuit Factory", "Also: end of turn, a random cat gains +1 Power for the run.", "Output: biscuits and rising expectations.", { effects: { onPlay: [{ type: "passive", trigger: "onTurnEnd", effects: [floorSt("purr", 1, "allFloors"), buff("power", 1, "run", "randomCat")] }] }, text: "Also: end of turn, a random cat gains +1 Power for the run." }),
      F("fork_knead_starter", "Sourdough Starter", "Costs 3. No Exhaust. Retain.", "It lives in the fridge. It has a name.", { cost: 3, keywords: { exhaust: false, retain: true }, text: "Costs 3. Retain. No Exhaust." })
    ]),
    set("heated_cushion", "hearth", "toy", "End of turn: add 2 Purr here. Cats that Nap here gain Rested 1 extra.", [
      F("fork_cushion_electric", "Electric Blanket", "End of turn: add 5 Purr here.", "Warm enough to be suspicious.", { effects: { onTurnEnd: [floorSt("purr", 5)] }, text: "End of turn: add 5 Purr here." }),
      F("fork_cushion_bottle", "Hot Water Bottle", "Start of turn: heal every cat here for 3.", "Slightly leaky, entirely beloved.", { effects: { onTurnStart: [heal(3, "allCatsOnFloor")] }, text: "Start of turn: heal every cat here for 3. End of turn: add 3 Purr here." }),
      F("fork_cushion_bed", "Bed for Two", "Cats deployed here Nap at once and gain Rested 2.", "A discount on bedtime.", { effects: { onCatDeployed: [{ type: "nap", target: "triggerSource" }, st("rested", 2, "triggerSource")] }, text: "Cats deployed here Nap at once and gain Rested 2." })
    ]),
    set("loaf_stance", "hearth", "toy", "Cats here that skip acting become Rested.", [
      F("fork_stance_meatloaf", "Meatloaf", "Rested cats here also gain Fluff 3.", "Dense and dependable.", { effects: { onNap: [fluff(3, "triggerSource")] }, text: "Rested cats here also gain Fluff 3." }),
      F("fork_stance_bread", "Bread Loaf", "Rested bonus doubles, for the first cat each turn only.", "Plain, but it rises.", { effects: { onNap: [Object.assign(st("rested", 1, "triggerSource"), { if: [{ check: "napsThisTurn", op: "==", value: 1 }] })] }, text: "The first cat to become Rested each turn gains Rested 1 extra." }),
      F("fork_stance_cake", "Cat Loaf Cake", "Costs 0. Exhaust. Every cat here is Rested next turn.", "Happy birthday, now be still.", { cost: 0, keywords: { exhaust: true }, effects: { onPlay: [{ type: "passive", trigger: "onTurnStart", once: true, effects: [st("rested", 1, "allCatsOnFloor")] }] }, text: "Costs 0. Exhaust. Every cat here is Rested next turn." })
    ]),

    // ---- moon (card ids guessed) ----
    set("moon_ghost_kitten", "moon", "unit", "1/3. Reborn.", [
      F("fork_ghost_poltergeist", "Poltergeist", "Reborn. Death: 3 damage to a random pest.", "Moves objects. Mostly breakable ones.", { effects: { onDeath: [dmg(3, "randomEnemy")] }, text: "Reborn. Death: 3 damage to a random pest." }),
      F("fork_ghost_lingering", "Lingering", "Reborn. Returns to hand costing 1 less.", "Won't take the hint.", { effects: { onDeath: [{ type: "reduceCost", amount: 1, duration: "played", target: "self" }] }, text: "Reborn. Returns to hand costing 1 less." }),
      F("fork_ghost_wisp", "Wisp Form", "Reborn. Hidden for the first round each fight.", "Cannot be seen. Cannot be blamed.", { effects: { onPlay: [st("hidden", 1)] }, text: "Reborn. Hidden for the first round each fight." })
    ], ["moon_ghost_cat"], { type: "unit", clan: "moon", tags: ["reborn"] }),
    set("moon_star_gazer", "moon", "unit", "2/6. Witching Hour: gain 2 Power for the fight.", [
      F("fork_gazer_eclipse", "Eclipse", "Witching Hour: gain 4 Power for the fight.", "Blocks the light on purpose.", { effects: { onWitching: [buff("power", 4, "fight")] }, text: "Witching Hour: gain 4 Power for the fight." }),
      F("fork_gazer_comet", "Comet Watcher", "Witching Hour: draw 2 cards.", "Stays up for a very slow comet.", { effects: { onWitching: [draw(2)] }, text: "Witching Hour: draw 2 cards." }),
      F("fork_gazer_constellation", "Constellation", "Witching Hour: Mark the strongest pest.", "Connects the dots. Then the pest.", { effects: { onWitching: [st("marked", 1, "strongestEnemy")] }, text: "Witching Hour: Mark the strongest pest." })
    ], ["moon_stargazer"], { type: "unit", clan: "moon", tags: ["witching"] }),
    set("moon_life_bank", "moon", "spell", "Spend a Life on a cat: draw 2 and gain 2 Zoomies.", [
      F("fork_bank_loan", "Interest-Free Loan", "Spend a Life: draw 3 and gain 2 Zoomies.", "The lender is a lantern. Do not ask.", { effects: { onPlay: [life(-1, "chosenCat"), draw(3), { type: "zoomies", amount: 2 }] }, text: "Spend a Life: draw 3 and gain 2 Zoomies." }),
      F("fork_bank_deposit", "Deposit", "Spend a Life. Heal that cat fully and give it Fluff 6.", "Banked, then immediately withdrawn.", { effects: { onPlay: [life(-1, "chosenCat"), heal(99, "chosenCat"), fluff(6, "chosenCat")] }, text: "Spend a Life. Heal that cat fully, Fluff 6." }),
      F("fork_bank_refund", "Refund Policy", "Spend a Life. Gain it back if the cat survives the round.", "Terms apply. The terms are claws.", { effects: { onPlay: [life(-1, "chosenCat"), { type: "passive", trigger: "onTurnEnd", once: true, effects: [life(1, "chosenCat")] }, draw(2), { type: "zoomies", amount: 2 }] }, text: "Spend a Life, draw 2, gain 2 Zoomies. Regain the Life at end of turn." })
    ], ["moon_nine_lives_bank"], { type: "spell", clan: "moon", tags: ["lives"] }),
    set("moon_witching_ritual", "moon", "spell", "Costs 2. Next Witching Hour arrives this round.", [
      F("fork_ritual_early", "Early Bell", "Costs 0. The next Witching Hour comes next round. Exhaust.", "The clock is a suggestion.", { cost: 0, keywords: { exhaust: true }, text: "Costs 0. The next Witching Hour comes next round. Exhaust." }),
      F("fork_ritual_double", "Double Midnight", "The next Witching Hour comes next round, and the round after that too.", "Midnight twice. Nobody checked.", { effects: { onPlay: [{ type: "witching", mode: "next" }, { type: "passive", trigger: "onWitchingHour", effects: [{ type: "witching", mode: "chain", limit: { per: "fight", n: 1 } }] }] }, text: "The next Witching Hour comes next round, and the round after that too." }),
      F("fork_ritual_comfy", "Comfy Midnight", "The next Witching Hour comes next round. Cats are not Frazzled after it.", "Pyjamas included.", { effects: { onPlay: [{ type: "witching", mode: "next" }, { type: "passive", trigger: "onWitchingHour", effects: [{ type: "spareFrazzle", target: "allCats", limit: { per: "fight", n: 1 } }] }] }, text: "The next Witching Hour comes next round. Cats are not Frazzled after it." })
    ], ["moon_ritual"], { type: "spell", clan: "moon", tags: ["witching"] }),
    set("moon_spirit_pounce", "moon", "spell", "Spend a Life: deal 12 damage to a pest.", [
      F("fork_spirit_lunar", "Lunar Lunge", "Spend a Life: deal 18 damage. Exhaust.", "A cat leaps from a different century.", { keywords: { exhaust: true }, effects: { onPlay: [life(-1, "chosenCat"), dmg(18, "frontEnemy")] }, text: "Spend a Life: deal 18 damage. Exhaust." }),
      F("fork_spirit_echo", "Echo Pounce", "Spend a Life: deal 8 damage to two pests on the floor.", "Pounces, and the echo pounces too.", { effects: { onPlay: [life(-1, "chosenCat"), dmg(8, "frontEnemy"), dmg(8, "randomEnemyOnFloor")] }, text: "Spend a Life: deal 8 damage to two pests on a floor." }),
      F("fork_spirit_cheap", "Free Spirit", "Costs 0. Spend a Life: deal 9 damage.", "Cheaper when it's closer to the end.", { cost: 0, effects: { onPlay: [life(-1, "chosenCat"), dmg(9, "frontEnemy")] }, text: "Costs 0. Spend a Life: deal 9 damage." })
    ], ["moon_pounce"], { type: "spell", clan: "moon", tags: ["lives"] }),
    set("moon_lantern", "moon", "toy", "Start of turn: Mark the strongest pest on this floor.", [
      F("fork_lantern_bright", "Bright Lantern", "Start of turn: Mark the two strongest pests on this floor.", "Brighter than necessary.", { effects: { onTurnStart: [st("marked", 1, "strongestEnemy"), st("marked", 1, "secondStrongestEnemy")] }, text: "Start of turn: Mark the two strongest pests." }),
      F("fork_lantern_haunt", "Haunted Lantern", "Start of turn: Mark the strongest pest and give a cat here Claws 1.", "Flickers. Judges.", { effects: { onTurnStart: [st("marked", 1, "strongestEnemy"), st("claws", 1, "randomCat")] }, text: "Start of turn: Mark the strongest pest, give a cat here Claws 1." }),
      F("fork_lantern_guide", "Guiding Light", "Start of turn: Mark the strongest pest. Cats here gain +1 life at Dusk if Marked pest dies.", "Leads them home.", { effects: { onTurnStart: [st("marked", 1, "strongestEnemy")], onKill: [life(1, "allCatsOnFloor")] }, text: "Mark the strongest pest. If it dies, every cat here gains 1 life." })
    ], ["moon_spirit_lantern"], { type: "toy", clan: "moon" }),

    // ---- mischief ----
    set("box_goblin", "mischief", "unit", "2/3. Deploy: in a Box, +2 Power for the fight.", [
      F("fork_goblin_baron", "Box Baron", "Deploy: in a Box, +4 Power for the fight.", "Cardboard royalty. Taxes in tape.", { effects: { onPlay: [buff("power", 4, "fight")].map(function (e) { return Object.assign(e, { if: [{ check: "selfInBox", op: "==", value: true }] }); }) }, text: "Deploy: in a Box, +4 Power for the fight." }),
      F("fork_goblin_mover", "Box Mover", "Deploy: place a Box here if none, and move in.", "Brings its own housing.", { effects: { onPlay: [{ type: "box", target: "thisFloor" }] }, text: "Deploy: place a Box here if none, and move in." }),
      F("fork_goblin_heist", "Box Heist", "First attack each fight from a Box: 6 damage to every pest on the floor.", "Pop out. Pop off.", { effects: { onAttack: [dmg(6, "allEnemiesOnFloor", { oncePerFight: true, if: [{ check: "selfInBox", op: "==", value: true }] })] }, text: "First attack each fight from a Box: 6 damage to every pest on the floor." })
    ]),
    set("yarn_spinner", "mischief", "unit", "1/5. Deploy: Yarn 2 front pest. End of turn: Yarn 1 random pest here.", [
      F("fork_spinner_weaver", "Master Weaver", "Deploy: Yarn 3 front pest. End of turn: Yarn 1 random pest here.", "Doilies for everyone.", { effects: { onPlay: [st("yarn", 3, "frontEnemy")] }, text: "Deploy: Yarn 3 front pest." }),
      F("fork_spinner_web", "Spider Spinner", "End of turn: Yarn 1 on EVERY pest on this floor.", "A web by any other name.", { effects: { onPlay: [], onTurnEnd: [st("yarn", 1, "allEnemiesOnFloor")] }, text: "End of turn: Yarn 1 on every pest on this floor." }),
      F("fork_spinner_knit", "Knit One", "End of turn: 2 damage to each Yarned pest on this floor.", "Purl two. Hurt several.", { effects: { onTurnEnd: [dmg(2, "yarnedEnemiesOnFloor")] }, text: "Deploy: Yarn 2. End of turn: 2 damage to each Yarned pest on this floor." })
    ]),
    set("laser_dot", "mischief", "toy", "Start of turn: Yarn 1 on the front pest on this floor.", [
      F("fork_dot_twin", "Twin Dots", "Start of turn: Yarn 1 on the front two pests on this floor.", "Now with an unreasonable second dot.", { effects: { onTurnStart: [st("yarn", 1, "frontEnemy"), st("yarn", 1, "randomEnemyOnFloor")] }, text: "Start of turn: Yarn 1 on two pests on this floor." }),
      F("fork_dot_obsession", "Red Dot Obsession", "Start of turn: Yarn 1 on the front pest, which also takes 2 damage.", "It must be caught. It cannot be caught.", { effects: { onTurnStart: [st("yarn", 1, "frontEnemy"), dmg(2, "frontEnemy")] }, text: "Start of turn: Yarn 1 and 2 damage on the front pest." }),
      F("fork_dot_wave", "Pointer Wave", "Costs 3. Start of turn: Yarn 1 on the front pest of every floor.", "Sweeps the whole house in one wrist flick.", { cost: 3, effects: { onTurnStart: [st("yarn", 1, "frontEnemyEachFloor")] }, text: "Costs 3. Start of turn: Yarn 1 on the front pest of every floor." })
    ]),
    set("cough_it_up", "mischief", "spell", "Deal 3 damage. Add a Hairball to your hand.", [
      F("fork_cough_hack", "Hack", "Deal 5 damage. Add 2 Hairballs to your hand.", "Dramatic, wet, effective.", { targeting: "enemy", effects: { onPlay: [dmg(5), mk("hairball", 2, "hand")] }, text: "Deal 5 damage. Add 2 Hairballs to your hand." }),
      F("fork_cough_cannon", "Furball Cannon", "Deal 3 damage. Add a Hairball. Hairballs cost 1 less this turn.", "Muzzle velocity: embarrassing.", { targeting: "enemy", effects: { onPlay: [dmg(3), mk("hairball", 1, "hand"), { type: "reduceCost", amount: 1, duration: "turn", target: "hairballsInHand" }] }, text: "Deal 3 damage. Add a Hairball. Hairballs cost 1 less this turn." }),
      F("fork_cough_clean", "Clean Cough", "Deal 4 damage. No Hairball.", "Used a tissue. Growth.", { targeting: "enemy", effects: { onPlay: [dmg(4)] }, text: "Deal 4 damage." })
    ]),
    set("catnip_stash", "mischief", "spell", "Costs 0. Gain 3 Nip. Exhaust.", [
      F("fork_stash_kilo", "A Kilo", "Costs 1. Gain 6 Nip. Exhaust.", "The jar was bigger on the inside.", { cost: 1, effects: { onPlay: [{ type: "catnip", amount: 6 }] }, text: "Costs 1. Gain 6 Nip. Exhaust." }),
      F("fork_stash_slow", "Slow Release", "Costs 0. Gain 2 Nip. Retain. No Exhaust.", "Dissolves over a long afternoon.", { keywords: { exhaust: false, retain: true }, effects: { onPlay: [{ type: "catnip", amount: 2 }] }, text: "Costs 0. Gain 2 Nip. Retain." }),
      F("fork_stash_decoy", "Decoy Stash", "Costs 0. Gain 2 Nip. Draw 2. Exhaust.", "Mostly oregano. Convincing.", { effects: { onPlay: [{ type: "catnip", amount: 2 }, draw(2)] }, text: "Costs 0. Gain 2 Nip. Draw 2. Exhaust." })
    ]),
    set("hairball_cough", "mischief", "spell", "Create a Hairball on the target floor. It hits the first pest that enters for 3.", [
      F("fork_hb_projectile", "Projectile", "Deal 7 damage to the front pest immediately. No Hairball.", "Aimed. Mostly.", { targeting: "floor", effects: { onPlay: [dmg(7, "frontEnemy")] }, text: "Deal 7 damage to the front pest. No Hairball." }),
      F("fork_hb_minefield", "Minefield", "Create 2 Hairballs on the target floor, each hitting for 3.", "Do not step. Do not look.", { targeting: "floor", effects: { onPlay: [{ type: "floorStatus", status: "hairball", amount: 2, target: "chosenFloor" }] }, text: "Create 2 Hairballs on the target floor, each hitting for 3." }),
      F("fork_hb_heirloom", "Heirloom", "Create a Hairball that is not consumed. It hits for 3, then 1 every turn.", "Family tradition.", { targeting: "floor", effects: { onPlay: [{ type: "floorStatus", status: "hairball", amount: 1, target: "chosenFloor", persistent: true }] }, text: "A Hairball that stays. It hits for 3, then 1 each turn." })
    ], ["mischief_hairball_cough"], { type: "spell", clan: "mischief", tags: ["hairball"] }),
    set("claw_swipe", "alley", "spell", "Deal 6 damage to the front pest on a floor.", [
      F("fork_swipe_rake", "Rake", "Deal 4 damage to EVERY pest on a floor.", "Sofa 1, curtains 0.", { effects: { onPlay: [dmg(4, "allEnemiesOnFloor")] }, text: "Deal 4 damage to every pest on a floor." }),
      F("fork_swipe_hamstring", "Hamstring", "Deal 8 damage to the front pest. Yarn 1.", "Slow them down, speed yourself up.", { effects: { onPlay: [dmg(8, "frontEnemy"), st("yarn", 1, "frontEnemy")] }, text: "Deal 8 damage to the front pest. Yarn 1." }),
      F("fork_swipe_scoot", "Swipe and Scoot", "Deal 5 damage to the front pest. Draw 1.", "Hit and run is a lifestyle.", { effects: { onPlay: [dmg(5, "frontEnemy"), draw(1)] }, text: "Deal 5 damage to the front pest. Draw 1." })
    ], ["alley_claw_swipe"], { type: "spell", clan: "alley", tags: ["claws"] })
  ];

  // Real card ids for the families whose guessed ids do not exist. post.js looks forks up by the exact card id,
  // so every family needs at least one real id here. Each is a card of the same type and clan close to the base text.
  var REAL_IDS = {
    alley_scrapper: ["alley_basic_kitten"], zoomie_kitten: ["alley_gutter_kitten"], knock_off_tabby: ["alley_sharpening_sally"],
    cinder_tom: ["alley_last_gasp_gus"], midnight_zoomies: ["alley_midnight_sprint"], scratching_tower: ["alley_gutter_gym"],
    claw_swipe: ["alley_dirty_fighting"],
    loaf_of_cat: ["hearth_porch_tabby"], cuddle_puddle: ["hearth_lap_squatter"], sunbeam_sprawler: ["hearth_dozing_tom"],
    kneading_routine: ["hearth_nap_economy"], heated_cushion: ["hearth_sunny_cushion"], loaf_stance: ["hearth_hammock"],
    moon_ghost_kitten: ["moon_pennyfeather"], moon_star_gazer: ["moon_lantern_tom"], moon_life_bank: ["moon_borrowed_time"],
    moon_witching_ritual: ["moon_wind_the_clock"], moon_spirit_pounce: ["moon_cornering_rite"], moon_lantern: ["moon_fishbowl_oracle"],
    box_goblin: ["mischief_box_inspector"], yarn_spinner: ["mischief_skein_gremlin"], laser_dot: ["mischief_yarn_basket"],
    catnip_stash: ["mischief_a_sniff"], hairball_cough: ["mischief_spit_take"]
  };
  forks.forEach(function (fs) { if (REAL_IDS[fs.card]) fs.aliases = (fs.aliases || []).concat(REAL_IDS[fs.card]); });

  // Safety: strip any falsy entries from fork effect arrays.
  forks.forEach(function (fs) {
    fs.options.forEach(function (o) {
      var ef = o.patch && o.patch.effects;
      if (ef) Object.keys(ef).forEach(function (k) { ef[k] = ef[k].filter(Boolean); });
    });
  });

  // ===================== EVOLUTIONS =====================
  // Growth: +1 per fight played (cap 3 per stage). At 3, Growth Spurt at next Post or Nap Nook (free) takes Kitten to Cat.
  // Cat to Legend needs the stage quest plus Legend Ceremony (90 Fish, Act 2+ Post). Keeps scratches, fork, Knead, Mastery.
  // Lives: Kitten 2, Cat 3, Legend 4. +1 slot per stage (1, 2, 3).
  function stage(o) { return Object.assign({ type: "unit", rarity: "uncommon", targeting: "floor", tags: ["evolution"] }, o); }
  var evolutions = [
    { id: "evo_biscuit", name: "Biscuit", clan: "hearth", theme: "Knead and Purr engine", growthNeeded: 3, ceremonyFish: 90, stages: [
      stage({ id: "hearth_biscuit_kitten", name: "Biscuit Kitten", clan: "hearth", cost: 1, stats: { power: 2, health: 6, lives: 2, size: 1 }, keywords: { knead: { n: 1, stat: "attack", trigger: "onPlay", cap: 12 } }, text: "Knead 1: +1 Attack each time played.", flavor: "Makes biscuits on everything, including you.", art: "tiny cream kitten, flour paws, orange sock", evolvesTo: "hearth_biscuit_cat", slots: 1 }),
      stage({ id: "hearth_biscuit_cat", name: "Biscuit Cat", clan: "hearth", cost: 2, stats: { power: 4, health: 12, lives: 3, size: 1 }, keywords: { knead: { n: 2, stat: "attack", trigger: "onPlay", cap: 12 }, purr: 1 }, text: "Knead 2. Purr 1.", flavor: "Has opinions on dough and on you.", art: "round cream cat, apron, rolling pin", evolvesTo: "hearth_biscuit_the_great", slots: 2, quest: { id: "q_biscuit", text: "Knead +6 total.", check: { counter: "kneadTotal", n: 6 } } }),
      stage({ id: "hearth_biscuit_the_great", name: "Biscuit the Great", clan: "hearth", rarity: "rare", cost: 2, stats: { power: 7, health: 20, lives: 4, size: 1 }, keywords: { knead: { n: 3, stat: "attack", trigger: "onPlay", cap: 12 }, purr: 2 }, text: "Knead 3. Purr 2. Whenever any Knead triggers, heal the Sunbeam 1.", flavor: "Bakes the sunrise. Burns nothing.", effects: { onKneadTriggered: [{ type: "warmth", amount: 1 }] }, art: "golden loaf-shaped cat, chef hat, glowing paws", slots: 3 })
    ] },
    { id: "evo_dumpling", name: "Dumpling", clan: "hearth", theme: "Cuddle Pile anchor", growthNeeded: 3, ceremonyFish: 90, stages: [
      stage({ id: "hearth_dumpling_kitten", name: "Dumpling Kitten", clan: "hearth", cost: 1, stats: { power: 1, health: 7, lives: 2, size: 1 }, keywords: {}, text: "+1 Attack per other cat on this floor.", flavor: "Round, soft, deployed first in every hug.", aura: [{ stat: "power", amount: { base: 0, per: "otherCatsOnFloor", mult: 1 }, target: "self" }], art: "fat white kitten, pink ears, bean shape", evolvesTo: "hearth_dumpling_cat", slots: 1 }),
      stage({ id: "hearth_dumpling_cat", name: "Dumpling Cat", clan: "hearth", cost: 2, stats: { power: 2, health: 14, lives: 3, size: 1 }, keywords: {}, text: "+1 Attack per other cat here. End of turn: heal adjacent cats 2.", flavor: "Fills any gap in your life or lineup.", aura: [{ stat: "power", amount: { base: 0, per: "otherCatsOnFloor", mult: 1 }, target: "self" }], effects: { onTurnEnd: [heal(2, "adjacentCats")] }, art: "large white cat, cheeks like buns", evolvesTo: "hearth_dumpling_legend", slots: 2, quest: { id: "q_dumpling", text: "End 3 turns in a Pile of 3 or more.", check: { counter: "turnsInPile3", n: 3 } } }),
      stage({ id: "hearth_dumpling_legend", name: "Grand Dumpling", clan: "hearth", rarity: "rare", cost: 3, stats: { power: 4, health: 26, lives: 4, size: 2 }, keywords: {}, text: "Large. +1 Attack per other cat on the floor. End of turn: heal every cat here 3 and give it Fluff 2.", flavor: "One bun, many tenants.", aura: [{ stat: "power", amount: { base: 0, per: "otherCatsOnFloor", mult: 1 }, target: "self" }], effects: { onTurnEnd: [heal(3, "allCatsOnFloor"), fluff(2, "allCatsOnFloor")] }, art: "huge fluffy white cat, three kittens on its back", slots: 3 })
    ] },
    { id: "evo_pip", name: "Pip", clan: "alley", theme: "Hunter, Pounce and Ambush", growthNeeded: 3, ceremonyFish: 90, stages: [
      stage({ id: "alley_pip", name: "Pip", clan: "alley", cost: 1, stats: { power: 3, health: 4, lives: 2, size: 1 }, keywords: { pounce: 1 }, text: "Pounce 1.", flavor: "Small. Loud. Has a list of targets.", art: "tiny grey kitten, big ears, torn bandana", evolvesTo: "alley_pippin_the_mouser", slots: 1 }),
      stage({ id: "alley_pippin_the_mouser", name: "Pippin the Mouser", clan: "alley", cost: 2, stats: { power: 6, health: 8, lives: 3, size: 1 }, keywords: { pounce: 1, ambush: 1 }, text: "Pounce 1. Ambush: first hit each fight deals double.", flavor: "Reputation: mice avoid the entire block.", art: "slender grey cat, scar over eye, tool belt", evolvesTo: "alley_pip_terror_of_the_pantry", slots: 2, quest: { id: "q_pip", text: "Kill 6 pests with Ambush.", check: { counter: "ambushKills", n: 6 } } }),
      stage({ id: "alley_pip_terror_of_the_pantry", name: "Pip, Terror of the Pantry", clan: "alley", rarity: "rare", cost: 2, stats: { power: 10, health: 12, lives: 4, size: 1 }, keywords: { pounce: 2, ambush: 3 }, text: "Pounce 2. Ambush: the first hit each fight deals triple. Kills draw 1.", flavor: "The pantry has a shrine to this cat.", effects: { onKill: [draw(1)] }, art: "large grey cat, tiny crown made of cutlery", slots: 3 })
    ] },
    { id: "evo_wisp", name: "Wisp", clan: "moon", theme: "Nine Lives and Witching Hour", growthNeeded: 3, ceremonyFish: 90, stages: [
      stage({ id: "moon_wisp_kitten", name: "Wisp Kitten", clan: "moon", cost: 1, stats: { power: 2, health: 5, lives: 2, size: 1 }, keywords: { reborn: true }, text: "Reborn.", flavor: "Appears at the foot of the bed at 3AM. Sorry.", art: "translucent violet kitten, star-speck eyes", evolvesTo: "moon_wisp_cat", slots: 1 }),
      stage({ id: "moon_wisp_cat", name: "Lantern Cat", clan: "moon", cost: 2, stats: { power: 4, health: 9, lives: 3, size: 1 }, keywords: { reborn: true }, text: "Reborn. Witching Hour: gain 2 Power for the fight.", flavor: "Carries a small light and a large secret.", effects: { onWitching: [buff("power", 2, "fight")] }, art: "indigo cat holding paper lantern, stars on fur", evolvesTo: "moon_wisp_legend", slots: 2, quest: { id: "q_wisp", text: "Be reborn 3 times in one run.", check: { counter: "rebornCount", n: 3 } } }),
      stage({ id: "moon_wisp_legend", name: "Will-o-the-Whisker", clan: "moon", rarity: "rare", cost: 2, stats: { power: 7, health: 14, lives: 4, size: 1 }, keywords: { reborn: true }, text: "Reborn. Witching Hour: gain 3 Power and gain 1 life (max 9).", flavor: "Nine lives is just the number it admits to.", effects: { onWitching: [buff("power", 3, "fight"), life(1)] }, art: "tall violet cat, flame-tipped tail, moon halo", slots: 3 })
    ] },
    { id: "evo_gus", name: "Gus", clan: "mischief", theme: "Boxes and Knock It Off", growthNeeded: 3, ceremonyFish: 90, stages: [
      stage({ id: "mischief_gus_kitten", name: "Box Kitten Gus", clan: "mischief", cost: 1, stats: { power: 2, health: 5, lives: 2, size: 1 }, keywords: {}, text: "In a Box: +2 Power. Deploy: place a Box here if none and move in.", flavor: "Smaller than the box. Larger than the plan.", aura: [{ stat: "power", amount: 2, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }], effects: { onPlay: [{ type: "box", kind: "cardboard", sit: true, target: "thisFloor", if: [{ check: "hasBox", op: "==", value: false }] }] }, art: "tiny tuxedo kitten in oversized box, teal tape", evolvesTo: "mischief_gus_cat", slots: 1 }),
      stage({ id: "mischief_gus_cat", name: "Gus the Box Cat", clan: "mischief", cost: 2, stats: { power: 4, health: 9, lives: 3, size: 1 }, keywords: {}, text: "In a Box: +3 Power. Attacks Knock 1.", flavor: "Throws things out of boxes for a living.", aura: [{ stat: "power", amount: 3, target: "self", if: [{ check: "selfInBox", op: "==", value: true }] }], effects: { onAttack: [knock(1, "attackTarget")] }, art: "tuxedo cat, box helmet, magenta scarf", evolvesTo: "mischief_gus_legend", slots: 2, quest: { id: "q_gus", text: "Win a fight with Gus ending in a Box.", check: { counter: "wonInBox", n: 1 } } }),
      stage({ id: "mischief_gus_legend", name: "Gus, Master of the Warehouse", clan: "mischief", rarity: "rare", cost: 3, stats: { power: 7, health: 18, lives: 4, size: 2 }, keywords: { boxFitsPlus: true }, text: "Large. Knock 2 on attack. Boxes on this floor hold 1 more cat.", flavor: "Largest box in the house. It is a house.", effects: { onAttack: [knock(2, "attackTarget")] }, art: "giant tuxedo cat on stack of boxes, hard hat", slots: 3 })
    ] },
    { id: "evo_yarn_ball", name: "Yarn Ball", clan: "mischief", theme: "Yarn toy chain", growthNeeded: 3, ceremonyFish: 90, stages: [
      { id: "mischief_yarn_ball", name: "Yarn Ball", type: "toy", rarity: "uncommon", clan: "mischief", cost: 1, targeting: "floor", stats: null, durability: 3, keywords: {}, text: "Start of turn: Yarn 1 on the front pest on this floor.", flavor: "Rolls under the sofa and into legend.", effects: { onTurnStart: [st("yarn", 1, "frontEnemy")] }, art: "red yarn ball, loose thread", evolvesTo: "mischief_tangled_skein", slots: 1, tags: ["evolution", "yarn"] },
      { id: "mischief_tangled_skein", name: "Tangled Skein", type: "toy", rarity: "uncommon", clan: "mischief", cost: 1, targeting: "floor", stats: null, durability: 4, keywords: {}, text: "Start of turn: Yarn 1 on the front pest and Yarn 1 on a random pest on this floor.", flavor: "Nobody wound this. It happened.", effects: { onTurnStart: [st("yarn", 1, "frontEnemy"), st("yarn", 1, "randomEnemyOnFloor")] }, art: "tangle of red and teal yarn", evolvesTo: "mischief_whole_sweater", slots: 2, quest: { id: "q_skein", text: "Play 4 Yarn cards in one fight.", check: { counter: "yarnCardsInFight", n: 4 } }, tags: ["evolution", "yarn"] },
      { id: "mischief_whole_sweater", name: "The Whole Sweater", type: "toy", rarity: "rare", clan: "mischief", cost: 2, targeting: "floor", stats: null, durability: 6, keywords: {}, text: "Start of turn: Yarn 2 on every pest on this floor. When a pest breaks free of Yarn, it takes 3 damage.", flavor: "It fits everyone. Nobody asked it to.", effects: { onTurnStart: [st("yarn", 2, "allEnemiesOnFloor")], onYarnBreak: [dmg(3, "triggerSource")] }, art: "giant knitted sweater, many sleeves", slots: 3, tags: ["evolution", "yarn"] }
    ] }
  ];

  // ===================== SHOP: GERALD'S BACK ALLEY BAZAAR =====================
  var shop = {
    id: "shop_gerald",
    keeper: { id: "gerald", name: "Gerald", species: "raccoon", claim: "tall cat", art: "raccoon in a trench coat two sizes too big, ear-flap hat, fake whiskers drawn in marker", ambient: "Garbage can lids, hushed haggling, a faint smell of fish" },

    // Inventory generation per visit (seeded: rngFor(runSeed, "shop", nodeId))
    stock: {
      cards: { count: 5, split: { main: 3, side: 1, neutral: 1 }, saleCount: 1, saleDiscount: 0.5, rarityWeights: { common: 55, uncommon: 35, rare: 10 }, guaranteeUncommonPlus: 1, noDuplicatesWithinShop: true, noBasics: true, preBossExtraRare: 1 },
      relics: { count: 2, slots: [["common", "uncommon"], ["uncommon", "rare"]], discountChance: 0.3, discountAmount: 0.2, preferShopPool: true, noDuplicatesInRun: true },
      collarCharm: { count: 1, pools: ["main", "side"] },
      postStall: { scratches: 4, maxTierByAct: [2, 3, 3], keywordBias: 0.6, forkVoucher: 1 },
      consumables: { count: 3, pool: ["shop_tuna_tin", "shop_whole_salmon", "shop_catnip_sachet", "shop_milk_saucer", "shop_laser_pointer", "shop_lucky_collar"] },
      services: ["shoo", "warm_milk", "reroll", "box_swap", "litter", "whittle", "knead", "sell"]
    },

    prices: {
      card: { common: 45, uncommon: 75, rare: 140, variance: 0.1 },
      relic: { common: 110, uncommon: 160, rare: 230, variance: 0.1 },
      collarCharm: 90,
      scratch: { 1: 40, 2: 75, 3: 120 },
      forkVoucher: 90,
      sell: { common: 15, other: 25, champion: null },
      mischiefRank7Surcharge: 0.15,
      rounding: "nearest 5",
      actCreep: [1.0, 1.05, 1.1]
    },

    consumables: [
      { id: "shop_tuna_tin", name: "Tuna Tin", cost: 55, text: "Give one cat +1 life.", effect: { type: "lives", amount: 1, target: "chosenCatInDeck" }, flavor: "Opens with a sound that summons the entire household." },
      { id: "shop_whole_salmon", name: "Whole Salmon", cost: 150, text: "Give every cat +1 life.", effect: { type: "lives", amount: 1, target: "allCatsInDeck" }, flavor: "Technically a fish. Spiritually a feast." },
      { id: "shop_catnip_sachet", name: "Catnip Sachet", cost: 40, text: "Start your next fight with 3 Nip.", effect: { type: "nextFightNip", amount: 3 }, flavor: "Labeled 'potpourri' to avoid questions." },
      { id: "shop_milk_saucer", name: "Milk Saucer", cost: 45, text: "Heal 10 Warmth. (Gerald's Warm Milk is the same, but cheaper.)", effect: { type: "warmth", amount: 10 }, flavor: "Lukewarm. Judgemental." },
      { id: "shop_laser_pointer", name: "Laser Pointer", cost: 50, text: "Your next fight starts with Yarn 1 on every pest on the Cellar.", effect: { type: "nextFightYarnCellar", amount: 1 }, flavor: "Property of a very distracted human." },
      { id: "shop_lucky_collar", name: "Lucky Collar", cost: 65, text: "One cat gains Fluff 3 at the start of every fight this Act.", effect: { type: "actFluff", amount: 3, target: "chosenCatInDeck" }, flavor: "Lucky at least once." }
    ],

    services: {
      shoo: { id: "shoo", name: "Shoo (Adopt Out)", base: 75, step: 25, scope: "run", maxCost: 300, refusesChampions: true, refusesCurses: true, strayCost: 0, postcards: { fishPerBattle: 2, capPerFight: 12 }, scratchRefundFish: 10, flavor: "They will be loved. The sofa has been warned." },
      warm_milk: { id: "warm_milk", name: "Warm Milk", cost: 40, heal: 10, oncePerShop: true, flavor: "Technically dairy. Emotionally medicine." },
      reroll: { id: "reroll", name: "Reroll cards", base: 20, step: 10, scope: "shop", flavor: "Gerald shuffles the box. Some of it falls out." },
      box_swap: { id: "box_swap", name: "Box Swap", cost: 40, choices: 3, relicChoices: 4, rules: "same rarity from main or side clan; Fork lost unless family matches; Mastery resets; Knead halves" },
      litter: { id: "litter", name: "Litter", base: 80, step: 40, scope: "run", limits: { rare: 2, other: 3 }, refuses: ["champion", "legend", "curse"] },
      whittle: { id: "whittle", name: "Whittle (+1 slot)", cost: 120, oncePerCard: true, capSlots: 3 },
      knead: { id: "knead", name: "Knead (Post)", cost: 15, maxPerCardFromPost: 2 },
      sell: { id: "sell", name: "Sell a card", common: 15, other: 25, refuses: ["champion"] }
    },

    sale: {
      cardSale: { slots: 1, discount: 0.5, tagText: "SALE", note: "One card per shop at half price, chosen by shop RNG, never a Rare unless no other exists." },
      relicDiscount: { chance: 0.3, discount: 0.2 },
      bulk: { trigger: "buy 3 items in one visit", reward: "next purchase 10% off, once per shop", cap: 1 },
      haggle: { cost: 10, oncePerShop: true, successChance: 0.45, successDiscount: 0.2, failSurcharge: 0.1, note: "Seeded and deterministic. Failed haggle raises that item by 10%." },
      loyalty: { visits: 3, reward: "Gerald gives a free Tuna Tin on the third shop visit of a run.", flavor: "He says it fell off a truck." },
      relicHooks: { rl_catnip_whetstone: { stallPrices: -0.25 }, rl_adoption_papers: { shooCost: 0 }, rl_milk_mirror: { firstLitterPerActFree: true }, rl_box_permit: { boxSwapChoices: 4 } },
      pityRules: { guaranteeUncommonPlus: 1, rareChanceWithoutSale: "none; Rare appears only through weights, or pre-boss slot" },
      fridgeRule: "At start of Act 2 and Act 3, Fish above 120 lose 15 percent of the excess (rounded up). Gerald's cousin collects it."
    },

    blackMarket: {
      slot: "rare_black_market",
      chance: { act1: 0.1, act2: 0.2, act3: 0.25 },
      requires: { notInShopBeforeRow: 3, mischiefRank: 0 },
      max: 1,
      trigger: "psst",
      intro: "Psst. You. Cat. Come closer. No, not the lid. The OTHER lid.",
      payment: "Fish or a trade-in card (any non-Champion, value equal to its sell price x3).",
      gate: "none; any player with the Fish or a trade-in card can buy.",
      items: [
        { id: "bm_spare_whisker", name: "Spare Whisker", kind: "relic", relic: "relic_spare_whisker", cost: 320, text: "Once per run: if the Sunbeam hits 0, restore 15 Warmth.", flavor: "Slightly damp. Excellent condition." },
        { id: "bm_forbidden_tuna", name: "Forbidden Tuna", kind: "consumable", cost: 260, text: "Give one cat +3 lives (max 9). Add a Vet Appointment to your deck.", effect: { type: "lives", amount: 3, target: "chosenCatInDeck", sideEffect: { addCurse: "vet_appointment" } }, flavor: "Do not ask what the tuna did." },
        { id: "bm_sealed_box", name: "Sealed Box", kind: "mystery", cost: 240, text: "Contains 1 random relic (any rarity, weighted rare).", effect: { type: "grantRelic", weights: { common: 20, uncommon: 45, rare: 35 } }, flavor: "Rattles. Smells of toast." },
        { id: "bm_used_collar", name: "Used Collar", kind: "voucher", cost: 280, text: "Take the next Champion Tier now (Perch rules waived).", effect: { type: "championTierNow" }, flavor: "Previous owner: a very important cat." },
        { id: "bm_fake_gold_whisker", name: "Gilded Whisker (Replica)", kind: "relic", relic: "relic_gilded_whisker", cost: 340, text: "Boss relic effect, but breaks after 3 fights.", flavor: "Authentic in spirit." },
        { id: "bm_counterfeit_nip", name: "Counterfeit Catnip", kind: "consumable", cost: 200, text: "Next fight: Nip meter starts at 8. The Crash lasts 2 turns.", effect: { type: "nextFightNip", amount: 8, crashTurns: 2 }, flavor: "It's mostly parsley. It's working anyway." },
        { id: "bm_gerald_coupon", name: "Gerald's Cousin's Coupon", kind: "coupon", cost: 180, text: "This shop and the next: everything is 25 percent off.", effect: { type: "shopDiscount", amount: 0.25, shops: 2 }, flavor: "The cousin has a cousin." },
        { id: "bm_extra_slot", name: "Whittle Kit (Used)", kind: "relic", relic: "rl_whittle_kit", cost: 300, text: "All cards gain +1 Scratch Slot at the start of each Act (max 3).", flavor: "Bits missing. Still good." }
      ]
    },

    dialogue: {
      greeting: {
        act1: ["Welcome to Gerald's Back Alley Bazaar. I am a tall cat, in case you were wondering.", "Ah, a customer. Please ignore the bin. It is a fixture.", "You look like someone who needs a deal. I look like someone who needs a coat. We both win."],
        act2: ["Back again! The coat got longer. So did my prices. I mean specials.", "A cat of taste. Or a cat of fish. Possibly both.", "Careful with the vacuum rumor. It is not a rumor. Buy something."],
        act3: ["The last stretch! Everything's half price if you believe in yourself. It is not half price.", "Up here the stock is rarer and the lid is heavier. Take a look.", "You made it this far. I'd say that's thanks to me. Please do not check."]
      },
      onBuy: ["Excellent choice. You'll be back for the matching one.", "Sold, and no refunds, not even emotional ones.", "A bargain. For me, I mean. For you, a bargain also.", "Smart. Gerald's items are only slightly haunted."],
      onSell: ["I will take that off your paws.", "Hm. Used, but not too used.", "That's a nice card. I'll pretend I don't see the claw marks."],
      onBuyRelic: ["Oh, you got the good one. I am visibly shaking.", "Careful, it bites. Not really. A little."],
      onShoo: ["Another one adopted out. They'll write.", "Don't look back. Gerald will look back for you."],
      onWarmMilk: ["Warm milk, fresh from the cat flap. Don't ask whose.", "For the Sunbeam, and for you."],
      onReroll: ["New stock! Same box, different mess.", "Reshuffled. Some of it tried to leave."],
      onHaggleWin: ["Fine, fine. Twenty off. My cousin will weep.", "You drive a hard bargain. I respect that. I resent it too."],
      onHaggleFail: ["Nice try. Ten more for the audacity.", "Haggling is a sport. You lost. Politely."],
      poor: ["Oh. A browsing cat. Window shopping is free, mostly.", "I'd offer you a loan but my cousin has the contacts. And the claws."],
      rich: ["Look at you, Mister Moneybags. Do you want a coat? I have one on sale. It is this one.", "That is a lot of fish. The smell is incredible. Please spend some."],
      nothingLeft: ["That's all I've got. Or at least what I'll admit to.", "Shelves bare. Come back when I've lost more things."],
      leave: ["Leave the lid how you found it.", "Come back anytime! I will be here! I live here!", "Mind the step. And the other step. And the raccoon."],
      blackMarketOpen: ["Psst. You. Cat. Come closer. No, not the lid. The OTHER lid.", "Special customers only. You qualify because you are here."],
      blackMarketBuy: ["You never saw me. I never saw you. We both saw a bargain.", "The item is great, the receipt is imaginary."]
    },

    banter: [
      "I'm a cat. Tall one. Don't look at the tail.",
      "The coat is vintage. By which I mean I found it behind the dryer.",
      "Have you tried fish? Not for sale. I just wondered.",
      "A prior customer wanted a refund. I gave him a smaller refund.",
      "I know the vacuum. We have an arrangement. It involves silence.",
      "My cousin sells cheaper, but he's a raccoon.",
      "Everything here is lightly used by someone who's no longer a problem.",
      "This lid? It's not a lid. It's a feature.",
      "People ask where I get my stock. Honestly I don't ask either.",
      "Ten out of ten cats recommend my prices. Zero of ten cats read the labels.",
      "I'd offer a loyalty card, but they eat them.",
      "That's a rare card. Rare like a good nap. Rare like me.",
      "I once sold a cat a box. Then I sold him the box's box.",
      "Ask me about my sofa. No, don't. It's a long story with a sofa in it.",
      "The sunbeam does not stay forever. Neither does my patience for window shoppers.",
      "Between us, the crow knows a guy. The guy is also a crow.",
      "Shh. The mice have good prices and bad intentions.",
      "I've never lost an argument. I've left a few early.",
      "You have the look of someone who has defended a house. It suits you. Buy something to match.",
      "No hairballs on the merchandise. That's how I got the last discount."
    ],

    art: { background: "alley shop, crates and tin lids, string lights", stall: "overturned dumpster with a striped awning", gerald: "raccoon in oversize trench coat, hat, fake whiskers" },

    // Post stall / services live in the node UI; Gerald's lines for them are in dialogue above.
    reactions: { fishThresholds: { poor: 30, rich: 250 } }
  };

  SB.data.upgrades = upgrades;
  SB.data.upgradeGroups = upgradeGroups;
  SB.data.upgradeFits = upgradeFits;
  SB.data.forks = forks;
  SB.data.evolutions = evolutions;
  SB.data.shop = shop;
})();
