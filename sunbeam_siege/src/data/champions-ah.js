/*
 * SUNBEAM SIEGE: Champions for the ALLEY and HEARTH clans (agent B05)
 * Four champions: Shadow and Mad Maxine (alley), Duchess Marmalade and Brother Crumpet (hearth).
 *
 * TREE MODEL
 *  - Each champion has 3 upgradeSlots (tiers) unlocking at Nights 2, 5 and 8 (RULES 7).
 *  - Each tier offers 3 options (path A, B, C). treeRule "free": the player may pick any path at
 *    any tier. Every option is self contained and additive (no "becomes" rewrites), so any mix works.
 *    If the lead prefers A06's path lock, set treeRule to "lock" and the engine only offers the path
 *    chosen at tier I (Wanderlust Collar relic lifts the lock once).
 *  - FINAL FORM: picking the same path at all 3 tiers unlocks that path's finalForm bonus
 *    (extra ops applied after tier III). Hybrids get no bonus but are intentionally viable.
 *  - Ops are A06 ops (addStat, mulStat, grantKeyword, addTrigger, setFlag, addLives) plus addAura.
 *    Trigger payloads (do: [...]) use the A03 effect DSL exactly. Stat names follow the A03 card
 *    schema: power and health (A06 "attack" is accepted as alias).
 *
 * NEEDS: (new engine pieces, nothing else was invented)
 *  Triggers (addTrigger.when): onFightStart, onFightEnd, onWake (this cat wakes from Nap, after
 *    Stretch is resolved), onShatter (any pest takes Shatter), onKnock (this cat's Knock landed),
 *    onBoxFlattened (a Box on this cat's floor is Flattened), onAllyDeath (another cat on this floor
 *    dies), onNap fires for any cat on this floor when written on a champion (A03 says toys only).
 *  Trigger modifier: limit: { per: "turn" | "fight", n: 1 } on an addTrigger op.
 *  Targets: strongestEnemy (highest current HP pest), frontEnemyEachFloor (one front pest per floor,
 *    effect repeats per floor), frontEnemyAboveFloor (front pest of the floor above this cat),
 *    knockedEnemy (the pest the current onKnock moved), boxedCatsOnFloor (aura target), champion.
 *  Effect types: resetKeyword { keyword, target } (re-arms Ambush), enterBox { target } (cat sits in
 *    the Box on its floor), wake { target } (wake Napping cats, Rested kept, each Stretches).
 *  AmountExpr counters: selfClaws, selfFluff, selfPower, restedOnFloor, pileSize.
 *  AmountExpr field max (upper clamp, used by Dream Bread). setFlag decoy (grants the A02 Decoy flag).
 *  Conditions (if.check): selfClaws, pileSize, playedCardId, selfHasStatus:rested (already in A03).
 *  Stats for addStat: knockShatter (extra Shatter on this cat's Knocks), restedCap (cap of Rested
 *    on cats on this floor), stretchPerRested (extra Stretch damage per Rested stack).
 *  Flags (setFlag): ignoreGrip (this cat's Knocks ignore the once per round Grip rule),
 *    pounceSweep (Pounce hits every pest on the floor, Ambush bonus only on the front one),
 *    boxesPermanentOnFloor (Boxes on this floor never lose durability),
 *    frenzyNoSelfDamage, frenzyAnyFloor (extra Frenzy hits pick pests on any floor),
 *    pileWeight2 (counts as 2 cats for Pile size), pileBonusDouble (Pile Attack bonus on its floor
 *    is P instead of floor(P/2)), heapAt3 (a Pile of 3 already counts as a Heap), cheatDeathOnce
 *    (once per fight a cat on this floor that would die stays at 1 Health), overhealToFluff,
 *    fluffGainDouble, napNoSkip (Nap without skipping its attack), napOnDeploy (may Nap the turn
 *    it was played), kneadDouble (permanent buffs it makes are doubled), immuneFrazzled,
 *    zoomTwice (Zooms twice on the Witching Hour; replaces A05 "Zoom").
 *  Card keyword used as written in RULES: Decoy flag (A02), Ambush (A06), Pounce N (A03), Multistrike (A06).
 *  Tokens: two token cards are defined at the bottom (SB.data.championsAHTokens): alley_recruit
 *    and hearth_fresh_biscuit. Register them with the card loader.
 *  upgradeSlots validator in A03 12 expects a/b and nights 3,6,9: change to options[3], nights 2,5,8.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  "use strict";

  // Small helpers keep the data readable. They return plain objects.
  function stat(s, v) { return { op: "addStat", stat: s, value: v }; }
  function kw(k, n) { return n === undefined ? { op: "grantKeyword", keyword: k } : { op: "grantKeyword", keyword: k, n: n }; }
  function flag(f) { return { op: "setFlag", flag: f }; }
  function aura(s, amount, target, cond) {
    var o = { op: "addAura", stat: s, amount: amount, target: target };
    if (cond) o.if = cond;
    return o;
  }
  function trig(when, doList, extra) {
    var o = { op: "addTrigger", when: when, do: doList };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k]; } }
    return o;
  }
  var ONCE_TURN = { limit: { per: "turn", n: 1 } };
  function opt(id, tier, path, pathName, name, text, flavor, art, ops) {
    return { id: id, tier: tier, path: path, pathName: pathName, name: name, text: text, flavor: flavor, art: art, ops: ops };
  }
  function fin(id, path, name, text, flavor, art, ops) {
    return { id: id, path: path, name: name, text: text, flavor: flavor, art: art, ops: ops };
  }
  function slot(n, night, options) { return { slot: n, tier: n, unlockNight: night, options: options }; }

  // ======================================================================
  // 1. ALLEY: SHADOW, MOUSER OF THE THIRD STAIR
  // ======================================================================
  var shadow = {
    id: "alley_shadow",
    name: "Shadow, Mouser of the Third Stair",
    shortName: "Shadow",
    type: "champion",
    clan: "alley",
    rarity: "legendary",
    cost: 1,
    targeting: "floor",
    stats: { power: 4, health: 15, lives: 9, size: 1 },
    keywords: { innate: true, pounce: 1, ambush: 2 },
    text: "Innate. Pounce 1. Ambush: her first hit each fight deals double damage.",
    flavor: "Present throughout. Seen by nobody. The mice have filed complaints.",
    catchphrase: "I was never here.",
    backstory: "The third stair creaks on purpose. Shadow taught it to. Mice now use the other staircase, which is longer and also has Shadow.",
    effects: {},
    art: {
      sprite: "cat_champion_shadow",
      palette: "black_gold",
      hint: "slim black cat crouched on a wooden stair, only the yellow eyes fully lit, tiny bell wrapped in tape"
    },
    tags: ["pounce", "ambush", "champion"],
    unlock: "start",
    treeRule: "free",
    paths: [
      { id: "A", name: "Pounce Protocol", blurb: "One perfect strike, then the next. Burst and Marked prey." },
      { id: "B", name: "Knock It Off", blurb: "Gravity is her sidekick. Control and Shatter." },
      { id: "C", name: "Box Collector", blurb: "If it fits, she sits. Hidden, then catastrophic." }
    ],
    upgradeSlots: [
      slot(1, 2, [
        opt("alley_shadow_a1", 1, "A", "Pounce Protocol", "Coiled Spring",
          "+3 Power. Ambush deals triple damage.",
          "Patience is just violence on a delay.",
          "tail curled tight, hind legs loaded, a small spring-shaped scratch on her collar",
          [stat("power", 3), kw("ambush", 1)]),
        opt("alley_shadow_b1", 1, "B", "Knock It Off", "Paw on the Edge",
          "+2 Power. Her first attack each turn Knocks its target 1 floor.",
          "Eye contact. Slow push. Gravity does the rest.",
          "one paw hovering over a teacup at a shelf edge, collar gains a small brass bell",
          [stat("power", 2), trig("onAttack", [{ type: "knock", amount: 1, target: "attackTarget" }], ONCE_TURN)]),
        opt("alley_shadow_c1", 1, "C", "Box Collector", "Cardboard Lover",
          "+2 Power. Starts each fight sitting in a Box on her floor (Hidden).",
          "If it fits, she sits. If it does not fit, she sits anyway.",
          "two yellow eyes over the rim of a cardboard box with a tiny cut out window",
          [stat("power", 2), trig("onFightStart", [{ type: "box", target: "thisFloor" }, { type: "enterBox", target: "self" }])])
      ]),
      slot(2, 5, [
        opt("alley_shadow_a2", 2, "A", "Pounce Protocol", "Mark the Prey",
          "Start of each turn: Mark the strongest pest (Marked 2).",
          "She chose you before you chose the stairs.",
          "red paw print crosshair glowing on the target, scar across her left ear",
          [trig("onTurnStart", [{ type: "applyStatus", status: "marked", amount: 2, target: "strongestEnemy" }])]),
        opt("alley_shadow_b2", 2, "B", "Knock It Off", "Gravity Believer",
          "Her Knocks deal 2 extra Shatter. Whenever any pest takes Shatter, she gains +1 Power for the fight.",
          "The floor was not asking for that mug.",
          "a small apple floating mid fall beside her, her pupils tracking it, dust puff at her feet",
          [stat("knockShatter", 2), trig("onShatter", [{ type: "buff", stat: "power", amount: 1, duration: "fight", target: "self" }])]),
        opt("alley_shadow_c2", 2, "C", "Box Collector", "Box Within a Box",
          "Cats in Boxes on her floor have +3 Power. When a Box on her floor is Flattened, place a new one.",
          "Nested, like Russian dolls but disappointed.",
          "a small box inside a bigger box inside a bigger box, one eye in each",
          [aura("power", 3, "boxedCatsOnFloor"), trig("onBoxFlattened", [{ type: "box", target: "thisFloor" }])])
      ]),
      slot(3, 8, [
        opt("alley_shadow_a3", 3, "A", "Pounce Protocol", "Perfect Pounce",
          "Once per turn, a kill by her re-arms Ambush and draws 1 card.",
          "One more mouse. Always one more mouse.",
          "tally marks of mice scratched along the stair banister, a faint silver glow around her whiskers",
          [trig("onKill", [{ type: "resetKeyword", keyword: "ambush", target: "self" }, { type: "draw", amount: 1, target: "player" }], ONCE_TURN)]),
        opt("alley_shadow_b3", 3, "B", "Knock It Off", "Rearranger of Worlds",
          "End of turn: Knock 1 the front pest on every floor. Her Knocks ignore the Grip rule.",
          "She pushes. They fall. Nobody grows.",
          "a tidy row of furniture tipped over behind her, one paw extended like a conductor",
          [trig("onTurnEnd", [{ type: "knock", amount: 1, target: "frontEnemyEachFloor" }]), flag("ignoreGrip")]),
        opt("alley_shadow_c3", 3, "C", "Box Collector", "Pandora's Box",
          "Start of turn: if her floor has no Box, place one. Once per turn, when she attacks from a Box, deal 10 damage to all pests on her floor.",
          "She was never in the box. The box was in her.",
          "box flaps bursting open with a halo of torn cardboard and yellow light, eyes wide",
          [trig("onTurnStart", [{ type: "box", target: "thisFloor" }, { type: "enterBox", target: "self" }], { if: [{ check: "hasBox", op: "==", value: false }] }),
           trig("onAttack", [{ type: "damage", amount: 10, kind: "hit", target: "allEnemiesOnFloor" }], { limit: { per: "turn", n: 1 }, if: [{ check: "selfInBox", op: "==", value: true }] })])
      ])
    ],
    finalForms: {
      A: fin("alley_shadow_final_a", "A", "Apex Mouser",
        "Final form: +2 Power. Her Pounce hits every pest on her floor. Only the front one takes the Ambush bonus.",
        "The stairs were never the only way down.",
        "full black silhouette with two glowing eyes and a ring of tiny mouse shaped holes in the air",
        [stat("power", 2), flag("pounceSweep")]),
      B: fin("alley_shadow_final_b", "B", "Gravity Tabby Supreme",
        "Final form: pests she Knocks land Dizzy 2 and take Shatter equal to half her Power.",
        "Newton sends his regards. She sent the apple.",
        "a swirl of falling objects orbiting her like moons, her eyes calm",
        [trig("onKnock", [{ type: "damage", amount: { base: 0, per: "selfPower", mult: 0.5 }, kind: "shatter", target: "knockedEnemy" }, { type: "applyStatus", status: "dizzy", amount: 2, target: "knockedEnemy" }], { if: [{ check: "subjectIsSelf", op: "==", value: true }] })]),
      C: fin("alley_shadow_final_c", "C", "Mistress of the Warehouse",
        "Final form: Boxes on her floor never wear out. Her Box attack deals 5 more damage to all pests on her floor.",
        "Delivered. Unsigned. Devastating.",
        "a stack of shipping boxes forming a throne, Shadow peeking from the top one",
        [flag("boxesPermanentOnFloor"),
         trig("onAttack", [{ type: "damage", amount: 5, kind: "hit", target: "allEnemiesOnFloor" }], { limit: { per: "turn", n: 1 }, if: [{ check: "selfInBox", op: "==", value: true }] })])
    }
  };

  // ======================================================================
  // 2. ALLEY: MAD MAXINE, QUEEN OF THE BIN LIDS
  // ======================================================================
  var maxine = {
    id: "alley_mad_maxine",
    name: "Mad Maxine, Queen of the Bin Lids",
    shortName: "Maxine",
    type: "champion",
    clan: "alley",
    rarity: "legendary",
    cost: 2,
    targeting: "floor",
    stats: { power: 4, health: 18, lives: 9, size: 1 },
    keywords: { innate: true, decoy: true, ragebait: 1 },
    text: "Innate. Decoy: pests on her floor must attack her. Rage-bait: each time she is hit, gain 1 Claws.",
    flavor: "Lost an ear to a seagull and won the argument.",
    catchphrase: "You and what sofa?",
    backstory: "Ruled the back alley for six winters. Joined the house when a raccoon mentioned a Sunbeam with no security.",
    effects: {},
    art: {
      sprite: "cat_champion_maxine",
      palette: "grey_rust",
      hint: "scarred grey tabby with one ear, dented bin lid strapped to her back, bottle cap crown"
    },
    tags: ["decoy", "claws", "champion"],
    unlock: "meta:clear_act1_alley",
    treeRule: "free",
    paths: [
      { id: "A", name: "Bin Lid Bulwark", blurb: "Get hit on purpose. Hit back harder." },
      { id: "B", name: "Frenzy Fury", blurb: "Many attacks, little patience, big Claws." },
      { id: "C", name: "Gang Boss", blurb: "She does not fight alone. She fights with Recruits." }
    ],
    upgradeSlots: [
      slot(1, 2, [
        opt("alley_mad_maxine_a1", 1, "A", "Bin Lid Bulwark", "Dented Lid",
          "+8 Health. Starts each fight with Fluff 8.",
          "Previously a bin lid. Now a lifestyle.",
          "a dented metal bin lid strapped to her front like a breastplate, rivets showing",
          [stat("health", 8), trig("onFightStart", [{ type: "fluff", amount: 8, target: "self" }])]),
        opt("alley_mad_maxine_b1", 1, "B", "Frenzy Fury", "Bin Dive Brawl",
          "+3 Power. Start of turn: gain Frenzy 1 (she attacks twice).",
          "Went in for a sandwich. Came out with opinions.",
          "fur sticking up in every direction, banana peel stuck to one paw, wild eyes",
          [stat("power", 3), trig("onTurnStart", [{ type: "applyStatus", status: "frenzy", amount: 1, target: "self" }])]),
        opt("alley_mad_maxine_c1", 1, "C", "Gang Boss", "Recruiting Drive",
          "Starts each fight with an Alley Recruit on her floor. Other cats on her floor have +1 Power.",
          "Two kittens and a dream. Mostly the kittens.",
          "a small kitten in a bottle cap hat standing proudly at her side, tiny scarf",
          [aura("power", 1, "otherCatsOnFloor"), trig("onFightStart", [{ type: "summon", card: "alley_recruit", target: "thisFloor" }])])
      ]),
      slot(2, 5, [
        opt("alley_mad_maxine_a2", 2, "A", "Bin Lid Bulwark", "Lid Slam",
          "When she is hit, deal 2 plus her Claws damage to the attacker.",
          "She does not block. She returns to sender.",
          "claw marks and dents spiraling across the lid, sparks at the edges",
          [trig("onDamaged", [{ type: "damage", amount: { base: 2, per: "selfClaws", mult: 1 }, kind: "hit", target: "attacker" }])]),
        opt("alley_mad_maxine_b2", 2, "B", "Frenzy Fury", "Hat Trick of Scratches",
          "Each kill gives her Frenzy 1 and Claws 1.",
          "The third scratch is the polite one.",
          "three glowing claw trails behind her, a stripe of orange across her cheek",
          [trig("onKill", [{ type: "applyStatus", status: "frenzy", amount: 1, target: "self" }, { type: "applyStatus", status: "claws", amount: 1, target: "self" }])]),
        opt("alley_mad_maxine_c2", 2, "C", "Gang Boss", "Protection Racket",
          "Once per turn, when she kills a pest, a new Alley Recruit joins her floor (if there is room).",
          "Nice floor. Shame if something happened to it.",
          "a small crowd of kittens wearing matching bottle cap pins behind her",
          [trig("onKill", [{ type: "summon", card: "alley_recruit", target: "thisFloor" }], ONCE_TURN)])
      ]),
      slot(3, 8, [
        opt("alley_mad_maxine_a3", 3, "A", "Bin Lid Bulwark", "Crown of Caps",
          "Start of turn: gain Fluff equal to her Claws.",
          "Six hundred bottle caps. Zero apologies.",
          "a towering crown of bottle caps glinting on her head, lid now polished",
          [trig("onTurnStart", [{ type: "fluff", amount: { base: 0, per: "selfClaws", mult: 1 }, target: "self" }])]),
        opt("alley_mad_maxine_b3", 3, "B", "Frenzy Fury", "Unhinged",
          "Frenzy costs her no Health. Start of turn: gain 1 more Frenzy.",
          "Calm down? Never heard of it.",
          "pupils spinning, tail frizzed to double its width, a blur of scratch lines around her",
          [flag("frenzyNoSelfDamage"), trig("onTurnStart", [{ type: "applyStatus", status: "frenzy", amount: 1, target: "self" }])]),
        opt("alley_mad_maxine_c3", 3, "C", "Gang Boss", "Boss of the Block",
          "Other cats on her floor have +1 more Power. When another cat dies on her floor, she gains 2 Claws and heals 4.",
          "Loyalty is a two way street. Mostly one way. Toward her.",
          "a bottle cap throne made of crushed cans, kittens saluting with tiny paws",
          [aura("power", 1, "otherCatsOnFloor"), trig("onAllyDeath", [{ type: "applyStatus", status: "claws", amount: 2, target: "self" }, { type: "heal", amount: 4, target: "self" }])])
      ])
    ],
    finalForms: {
      A: fin("alley_mad_maxine_final_a", "A", "Queen of the Bin",
        "Final form: +10 Health. When she is hit, every pest on her floor also takes damage equal to her Claws.",
        "The crown is heavy. So is the lid. So is she.",
        "armored in stacked bin lids, bottle cap crown aglow, a circle of dented metal around her",
        [stat("health", 10), trig("onDamaged", [{ type: "damage", amount: { base: 0, per: "selfClaws", mult: 1 }, kind: "hit", target: "allEnemiesOnFloor" }])]),
      B: fin("alley_mad_maxine_final_b", "B", "Whirling Dustbin",
        "Final form: +4 Power. Her extra Frenzy hits pick pests on any floor.",
        "Now in all rooms simultaneously, and cross about it.",
        "a spinning blur of fur and bin lid with claw trails shooting to every floor",
        [stat("power", 4), flag("frenzyAnyFloor")]),
      C: fin("alley_mad_maxine_final_c", "C", "The Whole Gang",
        "Final form: starts each fight with 2 more Recruits. On every Witching Hour, a new Recruit joins her floor.",
        "They all have the same haircut. It is a gang thing.",
        "a full gang photo of cats in matching bottle cap scarves, Maxine in the center, lid on her back",
        [trig("onFightStart", [{ type: "summon", card: "alley_recruit", target: "thisFloor" }, { type: "summon", card: "alley_recruit", target: "thisFloor" }]),
         trig("onTurnStart", [{ type: "summon", card: "alley_recruit", target: "thisFloor" }], { if: [{ check: "isZoomiesTurn", op: "==", value: true }] })])
    }
  };

  // ======================================================================
  // 3. HEARTH: DUCHESS MARMALADE (from A06, rewritten as additive, free pick tiers)
  // ======================================================================
  var duchess = {
    id: "hearth_duchess_marmalade",
    name: "Duchess Marmalade",
    shortName: "Duchess",
    type: "champion",
    clan: "hearth",
    rarity: "legendary",
    cost: 2,
    targeting: "floor",
    stats: { power: 6, health: 30, lives: 9, size: 1 },
    keywords: { innate: true, retain: true, purr: 2 },
    text: "Innate. Retain. Purr 2. Whenever she Naps, heal all cats on her floor for 3.",
    flavor: "Sits. Stays. Be healed. In that order.",
    catchphrase: "Sit. Stay. Be healed.",
    backstory: "Once ruled a bakery window for eleven years. Retired to this house for the sun. Has not been informed there is a war.",
    effects: { onNap: [{ type: "heal", amount: 3, target: "allCatsOnFloor" }] },
    art: {
      sprite: "cat_champion_duchess",
      palette: "orange_cream",
      hint: "plump orange tabby on a velvet cushion, pearl collar, half closed regal eyes"
    },
    tags: ["purr", "nap", "champion"],
    unlock: "start",
    treeRule: "free",
    paths: [
      { id: "A", name: "Lap Warden", blurb: "Heal everyone, forever. Grows between fights." },
      { id: "B", name: "Loaf Fortress", blurb: "Stack Fluff until she is a wall, then Stretch it out as damage." },
      { id: "C", name: "Zoomie Menace", blurb: "The Duchess at 3AM. Do not ask." }
    ],
    upgradeSlots: [
      slot(1, 2, [
        opt("hearth_duchess_marmalade_a1", 1, "A", "Lap Warden", "Warm Lap",
          "+10 Health. Purr +2.",
          "Sit. Stay. Be healed.",
          "a fresh knitted blanket draped over her, steam rising from a small tea cup beside her",
          [stat("health", 10), kw("purr", 2)]),
        opt("hearth_duchess_marmalade_b1", 1, "B", "Loaf Fortress", "Loaf Mode",
          "+14 Health. Whenever she Naps, gain Fluff 8.",
          "Legs tucked. Doors closed.",
          "a perfect loaf shape, all paws hidden, round and unshakable",
          [stat("health", 14), trig("onNap", [{ type: "fluff", amount: 8, target: "self" }])]),
        opt("hearth_duchess_marmalade_c1", 1, "C", "Zoomie Menace", "3AM Energy",
          "+4 Power. She attacks twice.",
          "Why? Because. It is 3AM.",
          "eyes wide and glowing, fur on end, a tiny pearl collar bouncing mid sprint",
          [stat("power", 4), kw("multistrike", 2)])
      ]),
      slot(2, 5, [
        opt("hearth_duchess_marmalade_a2", 2, "A", "Lap Warden", "Biscuit Maker",
          "After every fight she permanently gains +1 Health. End of turn: heal the Sunbeam for 1.",
          "She is making biscuits on the Sunbeam. Nobody asked.",
          "flour dusted paws, a small biscuit tin on the Sunbeam sill",
          [trig("onFightEnd", [{ type: "buff", stat: "health", amount: 1, duration: "run", target: "self" }]),
           trig("onTurnEnd", [{ type: "warmth", amount: 1 }])]),
        opt("hearth_duchess_marmalade_b2", 2, "B", "Loaf Fortress", "Immovable Object",
          "Decoy. Bristle 4. Starts each fight with Fluff 6.",
          "She will not be moved. Not for you, not for dinner.",
          "grey stone-like stillness, tiny spikes of fur bristling along her loaf",
          [flag("decoy"), trig("onFightStart", [{ type: "applyStatus", status: "bristle", amount: 4, target: "self" }, { type: "fluff", amount: 6, target: "self" }])]),
        opt("hearth_duchess_marmalade_c2", 2, "C", "Zoomie Menace", "Wall Runner",
          "Her attacks also hit the front pest on the floor above for half her Power. Each kill gives her +1 Claws.",
          "The shortest path between two floors is a wall.",
          "claws on wallpaper, motion blur trailing up a wall, torn paper strips fluttering",
          [trig("onAttack", [{ type: "damage", amount: { base: 0, per: "selfPower", mult: 0.5 }, kind: "hit", target: "frontEnemyAboveFloor" }]),
           trig("onKill", [{ type: "applyStatus", status: "claws", amount: 1, target: "self" }])])
      ]),
      slot(3, 8, [
        opt("hearth_duchess_marmalade_a3", 3, "A", "Lap Warden", "Queen of the Cushion",
          "End of turn: heal all cats on all floors for 3. Once per fight, a cat on her floor that would die stays at 1 Health.",
          "Everyone gets a turn on the throne. She decides who.",
          "a golden cushion throne with a velvet cape, a faint halo of warm light",
          [trig("onTurnEnd", [{ type: "heal", amount: 3, target: "allCats" }]), flag("cheatDeathOnce")]),
        opt("hearth_duchess_marmalade_b3", 3, "B", "Loaf Fortress", "The Sunbeam Is Mine",
          "She Naps without skipping her attack. Wake: every pest on her floor takes damage equal to half her Fluff.",
          "A sunbeam is a lease, and she has read the terms.",
          "a single beam of gold light on her loaf, scorch like glow, smug half smile",
          [flag("napNoSkip"), trig("onWake", [{ type: "damage", amount: { base: 0, per: "selfFluff", mult: 0.5 }, kind: "hit", target: "allEnemiesOnFloor" }])]),
        opt("hearth_duchess_marmalade_c3", 3, "C", "Zoomie Menace", "Furniture Destroyer",
          "Each kill gives her 2 more Claws. At 14 or more Claws, her attacks Knock every pest on her floor 1 floor.",
          "Nobody asked who needed that vase.",
          "a toppled vase and torn curtains behind her, a faint tornado of shredded fabric",
          [trig("onKill", [{ type: "applyStatus", status: "claws", amount: 2, target: "self" }]),
           trig("onAttack", [{ type: "knock", amount: 1, target: "allEnemiesOnFloor" }], { if: [{ check: "selfClaws", op: ">=", value: 14 }] })])
      ])
    ],
    finalForms: {
      A: fin("hearth_duchess_marmalade_final_a", "A", "Sunbeam Sovereign",
        "Final form: healing beyond full Health becomes Fluff on that cat. Start of turn: the Sunbeam gains 2 Warmth.",
        "Her lap has never been empty. Her lap has never been small.",
        "radiant gold crown of light, cushions orbiting her, a sunbeam aimed straight at her",
        [flag("overhealToFluff"), trig("onTurnStart", [{ type: "warmth", amount: 2 }])]),
      B: fin("hearth_duchess_marmalade_final_b", "B", "Loaf Fortress Unbreakable",
        "Final form: Fluff she gains is doubled. Wake: her Stretch damage equals her full Fluff, not half.",
        "She has not moved in an hour. The enemy has not recovered.",
        "a stone cut loaf with gold light seams, hairline cracks leaking sunshine",
        [flag("fluffGainDouble"), trig("onWake", [{ type: "damage", amount: { base: 0, per: "selfFluff", mult: 0.5 }, kind: "hit", target: "allEnemiesOnFloor" }])]),
      C: fin("hearth_duchess_marmalade_final_c", "C", "Witching Hour Duchess",
        "Final form: she Zooms twice on the Witching Hour and is never Frazzled. Witching Hour start of turn: +3 Claws.",
        "Do not look her in the eye. She is already at the door.",
        "glowing moon sigil on her brow, afterimages of her running up three walls at once",
        [flag("zoomTwice"), flag("immuneFrazzled"),
         trig("onTurnStart", [{ type: "applyStatus", status: "claws", amount: 3, target: "self" }], { if: [{ check: "isZoomiesTurn", op: "==", value: true }] })])
    }
  };

  // ======================================================================
  // 4. HEARTH: BROTHER CRUMPET, ABBOT OF THE WARM OVEN
  // ======================================================================
  var crumpet = {
    id: "hearth_brother_crumpet",
    name: "Brother Crumpet, Abbot of the Warm Oven",
    shortName: "Crumpet",
    type: "champion",
    clan: "hearth",
    rarity: "legendary",
    cost: 2,
    targeting: "floor",
    stats: { power: 3, health: 22, lives: 9, size: 1 },
    keywords: { innate: true },
    text: "Innate. Counts as 2 cats for Pile size. Adjacent cats have +1 Power and heal 1 at end of turn.",
    flavor: "Bakes bread nobody asked for. Everybody eats it.",
    catchphrase: "There is always room on the loaf.",
    backstory: "Left a monastery of very strict nappers after being caught kneading on a Tuesday. Rises at 4 AM to proof dough, which is the Zoomies with a dignified excuse.",
    effects: { onTurnEnd: [{ type: "heal", amount: 1, target: "adjacentCats" }] },
    aura: [{ stat: "power", amount: 1, target: "adjacentCats" }],
    flags: ["pileWeight2"],
    art: {
      sprite: "cat_champion_crumpet",
      palette: "blue_grey_cream",
      hint: "round blue grey British shorthair in a flour dusted apron and a tiny paper baker hat, rolling pin under one arm"
    },
    tags: ["cuddle", "knead", "nap", "champion"],
    unlock: "meta:clear_act1_hearth",
    treeRule: "free",
    paths: [
      { id: "A", name: "Heap Master", blurb: "A bigger Pile than the house has room for." },
      { id: "B", name: "Master Baker", blurb: "Kneads himself and the whole deck into a feast." },
      { id: "C", name: "Sleeper Agent", blurb: "Everyone naps. Then everyone Stretches. At once." }
    ],
    upgradeSlots: [
      slot(1, 2, [
        opt("hearth_brother_crumpet_a1", 1, "A", "Heap Master", "Room on the Loaf",
          "+8 Health. All other cats on his floor have +1 Power, not just adjacent ones.",
          "He says this every time. Somehow it is always true.",
          "a wide round crust of bread with five tiny cat noses poking out of the top",
          [stat("health", 8), aura("power", 1, "otherCatsOnFloor")]),
        opt("hearth_brother_crumpet_b1", 1, "B", "Master Baker", "Kneading Hands",
          "End of turn: he permanently gains +1 Power and +2 Health (Knead).",
          "Pushes. Folds. Pushes. Folds. Comes out bigger.",
          "both paws deep in a mound of dough, flour clouds around him",
          [trig("onTurnEnd", [{ type: "buff", stat: "power", amount: 1, duration: "run", target: "self" }, { type: "buff", stat: "health", amount: 2, duration: "run", target: "self" }])]),
        opt("hearth_brother_crumpet_c1", 1, "C", "Sleeper Agent", "Dozing Off",
          "+6 Health. Cats on his floor may Nap the turn they are played. Cats that Nap here gain Rested 1 extra.",
          "He closes his eyes. The whole floor follows. Nobody is sure who blinked first.",
          "closed eyes with tiny z letters rising, nightcap on the baker hat",
          [stat("health", 6), flag("napOnDeploy"), trig("onAnyNap", [{ type: "applyStatus", status: "rested", amount: 1, target: "triggerSource" }])])
      ]),
      slot(2, 5, [
        opt("hearth_brother_crumpet_a2", 2, "A", "Heap Master", "Warm Bread Smell",
          "End of turn: if his Pile has 3 or more cats, all cats on his floor gain Fluff 2 and the floor gains Purr 2.",
          "Nobody leaves. It smells too good.",
          "wafts of golden steam curling around the cats, a loaf glowing in a nearby oven",
          [trig("onTurnEnd", [{ type: "fluff", amount: 2, target: "allCatsOnFloor" }, { type: "floorStatus", status: "purr", amount: 2, target: "thisFloor" }], { if: [{ check: "pileSize", op: ">=", value: 3 }] })]),
        opt("hearth_brother_crumpet_b2", 2, "B", "Master Baker", "Proofing Drawer",
          "Start of turn: add a Fresh Biscuit to your hand. Playing a Biscuit gives him +1 Power for the run.",
          "Left to rise overnight. Not left alone.",
          "a wooden drawer of rising dough with paw prints pressed in the top",
          [trig("onTurnStart", [{ type: "createCard", card: "hearth_fresh_biscuit", amount: 1, to: "hand" }]),
           trig("onCardPlayed", [{ type: "buff", stat: "power", amount: 1, duration: "run", target: "self" }], { if: [{ check: "playedCardId", op: "==", value: "hearth_fresh_biscuit" }] })]),
        opt("hearth_brother_crumpet_c2", 2, "C", "Sleeper Agent", "Alarm Bell",
          "Wake: every Napping cat on his floor wakes too, keeps its Rested and Stretches at once.",
          "He rings it gently. It is still a bell.",
          "a tiny brass handbell clutched in one paw, ripples of sound across the floor",
          [trig("onWake", [{ type: "wake", target: "allCatsOnFloor" }])])
      ]),
      slot(3, 8, [
        opt("hearth_brother_crumpet_a3", 3, "A", "Heap Master", "The Great Heap",
          "A Pile of 3 on his floor already counts as a Heap. Cats in a Pile of 3 or more have +1 Power.",
          "There is a technical limit to cats. He has not read it.",
          "a mountain of cats sprawled across the floor, ears and tails sticking out like a hill",
          [flag("heapAt3"), aura("power", 1, "allCatsOnFloor", [{ check: "pileSize", op: ">=", value: 3 }])]),
        opt("hearth_brother_crumpet_b3", 3, "B", "Master Baker", "Sourdough Starter",
          "Permanent buffs he makes are doubled. Start of turn: add a second Fresh Biscuit.",
          "It is older than the house and has opinions.",
          "a bubbling glass jar of starter wearing a small hat, bread aroma lines rising",
          [flag("kneadDouble"), trig("onTurnStart", [{ type: "createCard", card: "hearth_fresh_biscuit", amount: 1, to: "hand" }])]),
        opt("hearth_brother_crumpet_c3", 3, "C", "Sleeper Agent", "Dream Bread",
          "Cats on his floor have Rested cap +2. End of turn: draw 1 card per 3 Rested on his floor (max 3).",
          "He bakes in his sleep. It is the good bread.",
          "a dream bubble above him showing a loaf with wings, sleeping cats below",
          [stat("restedCap", 2), trig("onTurnEnd", [{ type: "draw", amount: { base: 0, per: "restedOnFloor", mult: 0.34, max: 3 }, target: "player" }])])
      ])
    ],
    finalForms: {
      A: fin("hearth_brother_crumpet_final_a", "A", "Abbot of the Heap",
        "Final form: the Pile Attack bonus on his floor is the Pile size, not half of it.",
        "Abbot of nothing in particular. Warmest room in the house.",
        "huge golden loaf of cats with a small crown balanced on the top cat",
        [flag("pileBonusDouble")]),
      B: fin("hearth_brother_crumpet_final_b", "B", "Michelin Cat",
        "Final form: starts each fight with 3 Fresh Biscuits in hand. Playing a Biscuit heals the Sunbeam for 2.",
        "Three stars. One complaint, from the dog, about the portions.",
        "chef whites, a tall white hat, a tray of glowing biscuits",
        [trig("onFightStart", [{ type: "createCard", card: "hearth_fresh_biscuit", amount: 3, to: "hand" }]),
         trig("onCardPlayed", [{ type: "warmth", amount: 2 }], { if: [{ check: "playedCardId", op: "==", value: "hearth_fresh_biscuit" }] })]),
      C: fin("hearth_brother_crumpet_final_c", "C", "Dreaming Abbot",
        "Final form: cats deployed to his floor arrive with Rested 2. Stretch deals +1 more damage per Rested stack.",
        "Everyone woke at once. Nobody was grumpy. That is the frightening part.",
        "starry night robe over the apron, a glowing moon pillow, floating dream clouds",
        [stat("stretchPerRested", 1), trig("onCatDeployed", [{ type: "applyStatus", status: "rested", amount: 2, target: "triggerSource" }], { if: [{ check: "triggerOnThisFloor", op: "==", value: true }] })])
    }
  };

  SB.data.championsAH = [shadow, maxine, duchess, crumpet];

  // Tokens used by the champion options above. Register with the card loader.
  SB.data.championsAHTokens = [
    {
      id: "alley_recruit",
      name: "Alley Recruit",
      type: "unit",
      clan: "alley",
      rarity: "token",
      cost: 0,
      targeting: "floor",
      stats: { power: 2, health: 4, lives: 2, size: 1 },
      keywords: { pounce: 1 },
      text: "Pounce 1.",
      flavor: "Joined for the snacks. Stayed for the scrapping.",
      art: { sprite: "cat_kitten_scrappy", palette: "grey", hint: "small grey kitten with a bottle cap pinned to its ear" },
      tags: ["token", "recruit"]
    },
    {
      id: "hearth_fresh_biscuit",
      name: "Fresh Biscuit",
      type: "spell",
      clan: "hearth",
      rarity: "token",
      cost: 0,
      targeting: "cat",
      keywords: { exhaust: true, fleeting: true },
      text: "Heal a cat for 5 and give it +1 Power for the fight. Fleeting. Exhaust.",
      flavor: "Still warm. The oven denies everything.",
      effects: { onPlay: [{ type: "heal", amount: 5, target: "chosenCat" }, { type: "buff", stat: "power", amount: 1, duration: "fight", target: "chosenCat" }] },
      art: { sprite: "item_biscuit", palette: "cream", hint: "a golden round biscuit with a paw print stamped on top" },
      tags: ["token", "biscuit"]
    }
  ];
})();
