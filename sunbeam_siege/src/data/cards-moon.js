/*
 * cards-moon.js : MOONWHISKERS clan (clan id "moon"), 42 non-champion cards. Agent B03.
 * 20 Cat units, 14 spells, 8 toys (rooms). Rarity: 18 common, 16 uncommon, 8 rare.
 * Follows A03 schema and effect DSL, RULES.md sections 5 and 6 (Nine Lives, Witching Hour).
 * No em dashes or en dashes anywhere.
 *
 * NEEDS: (new engine pieces, everything else is existing A03/A04 DSL)
 *  1. effect "lives" gains two optional params. voluntary:true = "Spend a Life": cat STAYS on board,
 *     cannot take the last life (fizzles on a 1-life cat), fires onLifeSpent, no Last Gasp, no death.
 *     upTo:true = spend as many as possible up to |amount|, always leaving the cat on 1 life at minimum.
 *     After a voluntary "lives" effect the engine sets counter "livesSpent" for the rest of that effects array.
 *  2. Banked Lives: battle-only player counter 0..9 (UI chip next to Zoomies). effect {type:"bank", amount:n}
 *     (negative spends, clamps at 0). check "bank". AmountExpr counter "bank".
 *  3. effect {type:"bankConvert", per:3}: at call time, every "per" Banked Lives turns into +1 Life to the
 *     most hurt cat (lowest lives/maxLives, ties by deck order). Used by trigger onBattleEnd (new trigger).
 *  4. Triggers: onLifeLost (self, exists in A05 as onLifeLost), onLifeSpent (self), onCornered (self reaches
 *     exactly 1 life), onWitchingHour (units and toys on board, fires at the start of a Witching Hour round,
 *     after the built-in +2 Zoomies and +1 draw), onBattleEnd (units on board or in deck, after victory).
 *     Global family: onAnyLifeLost, onAnyLifeSpent, onAnyCornered, onAnyZoom. On a unit they fire for any cat on
 *     any floor, on a toy only for cats on that floor. triggerSource = that cat. For Zoom, "attackTarget" = Zoom target.
 *  5. Checks: "bank", "targetMarked" (chosenEnemy or attackTarget has Marked), "triggerOnThisFloor" (bool),
 *     "selfLives" (exists). Counters: "livesSpent", "catsInDiscard" (cat units only), "corneredOnFloor", "bank".
 *  6. AmountExpr and "times" gain optional "max" (clamp after multiply). Effect objects gain optional
 *     "limit": {"per":"turn","n":1} (max firings of that effect per turn).
 *  6b. Convention: in an effects array, a failed "if" skips only that effect, so cost-gated cards put the
 *     gated payoff first and the "bank" spend after it, both checking bank >= n.
 *  7. effect {type:"returnFromDiscard", card:"cat", amount:1, to:"hand", lives:+n, costDelta:-n}.
 *     Player picks a cat from the discard pile (random if the phone UI skips the prompt). Cat keeps its lives.
 *  8. effect {type:"witching", mode:"next"|"chain"}. "next": the next Witching Hour is the very next round
 *     (still obeys no-twice-in-a-row, so if this round is a Witching Hour it does nothing). "chain": the next round
 *     is a Witching Hour even straight after one, once per battle; the clock UI shows a second moon.
 *  9. Keywords: "witchingEcho" (while on board, built-in Witching Hour effects of +2 Zoomies, +1 draw and the free
 *     Zoom all happen twice; Frazzled still only applies once; several echo sources do not stack),
 *     "unfrazzled" (this cat never gets Frazzled; also grantable through grantKeyword with duration "turn").
 * 10. Existing statuses used: marked, hiss, hidden, fluff, frenzy. Existing keywords: reborn, exhaust, kitten tag.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};
(function () {
  var ART = function (sprite, palette) { return { sprite: sprite, palette: palette }; };

  function unit(o) {
    var c = {
      id: o.id, name: o.name, type: "unit", clan: "moon", rarity: o.rarity, cost: o.cost, targeting: "floor",
      stats: { power: o.p, health: o.h, lives: o.lives, size: o.size || 1 },
      keywords: o.kw || {}, text: o.text, flavor: o.flavor, art: o.art, tags: o.tags || [], unlock: "start"
    };
    if (o.effects) c.effects = o.effects;
    if (o.upgrade) c.upgrade = o.upgrade;
    return c;
  }
  function spell(o) {
    var c = {
      id: o.id, name: o.name, type: "spell", clan: "moon", rarity: o.rarity, cost: o.cost,
      targeting: o.targeting || "none", keywords: o.kw || {}, text: o.text, flavor: o.flavor,
      effects: o.effects, art: o.art, tags: o.tags || [], unlock: "start"
    };
    if (o.upgrade) c.upgrade = o.upgrade;
    return c;
  }
  function toy(o) {
    var c = {
      id: o.id, name: o.name, type: "toy", clan: "moon", rarity: o.rarity, cost: o.cost, targeting: "floor",
      keywords: o.kw || {}, text: o.text, flavor: o.flavor, effects: o.effects, art: o.art,
      tags: (o.tags || []).concat(["room"]), unlock: "start"
    };
    if (o.upgrade) c.upgrade = o.upgrade;
    return c;
  }

  SB.data.cardsMoon = [
    /* ================= CAT UNITS: COMMON (9) ================= */
    unit({
      id: "moon_candle_kitten", name: "Candle Kitten", rarity: "common", cost: 1, p: 3, h: 6, lives: 3,
      text: "Deploy: Mark the front pest on this floor.",
      flavor: "Carries a tiny candle. The fire brigade has been informed.",
      effects: { onPlay: [{ type: "applyStatus", status: "marked", amount: 1, target: "frontEnemy" }] },
      upgrade: { stats: { health: 7 }, text: "Deploy: Mark the front pest on this floor twice.",
        effects: { onPlay: [{ type: "applyStatus", status: "marked", amount: 2, target: "frontEnemy" }] } },
      art: ART("kitten_candle", "indigo"), tags: ["kitten", "marked"]
    }),
    unit({
      id: "moon_dusk_mouser", name: "Dusk Mouser", rarity: "common", cost: 1, p: 3, h: 5, lives: 4,
      text: "When this loses a Life, draw 1.",
      flavor: "Dies the way other cats nap: often, and with total commitment.",
      effects: { onLifeLost: [{ type: "draw", amount: 1, target: "player" }] },
      upgrade: { stats: { power: 4 } },
      art: ART("cat_slim_dusk", "violet"), tags: ["cornered", "lives"]
    }),
    unit({
      id: "moon_graveyard_loafer", name: "Graveyard Loafer", rarity: "common", cost: 2, p: 3, h: 9, lives: 4,
      text: "Start of your turn, if Cornered: gain Fluff 5.",
      flavor: "Has napped on every headstone in the district. Kept the good ones.",
      effects: { onTurnStart: [{ type: "fluff", amount: 5, target: "self", if: [{ check: "selfLives", op: "==", value: 1 }] }] },
      upgrade: { effects: { onTurnStart: [{ type: "fluff", amount: 8, target: "self", if: [{ check: "selfLives", op: "==", value: 1 }] }] },
        text: "Start of your turn, if Cornered: gain Fluff 8." },
      art: ART("cat_loaf_grey", "silver"), tags: ["cornered", "fluff"]
    }),
    unit({
      id: "moon_pennyfeather", name: "Pennyfeather", rarity: "common", cost: 1, p: 2, h: 5, lives: 4,
      kw: { reborn: true }, text: "Reborn.",
      flavor: "Keeps coming back, like a hiccup, or a bill.",
      upgrade: { stats: { power: 3, health: 6 } },
      art: ART("cat_ghost_small", "silver"), tags: ["reborn"]
    }),
    unit({
      id: "moon_borrowed_paws", name: "Borrowed Paws", rarity: "common", cost: 1, p: 3, h: 6, lives: 4,
      text: "Deploy: Spend a Life. Gain +2 Attack for the fight and draw 1.",
      flavor: "Took a life on credit. The interest is mostly vibes.",
      effects: { onPlay: [
        { type: "lives", amount: -1, voluntary: true, target: "self", if: [{ check: "selfLives", op: ">=", value: 2 }] },
        { type: "buff", stat: "power", amount: 2, duration: "fight", target: "self", if: [{ check: "livesSpent", op: ">=", value: 1 }] },
        { type: "draw", amount: 1, target: "player", if: [{ check: "livesSpent", op: ">=", value: 1 }] }] },
      upgrade: { stats: { health: 7 } },
      art: ART("cat_patchwork", "violet"), tags: ["spend", "cornered"]
    }),
    unit({
      id: "moon_lantern_tom", name: "Lantern Tom", rarity: "common", cost: 2, p: 3, h: 8, lives: 4,
      text: "Witching Hour: gain +2 Attack for the fight.",
      flavor: "Wakes at the same hour as the plumbing, and for the same reasons.",
      effects: { onWitchingHour: [{ type: "buff", stat: "power", amount: 2, duration: "fight", target: "self" }] },
      upgrade: { effects: { onWitchingHour: [{ type: "buff", stat: "power", amount: 3, duration: "fight", target: "self" }] },
        text: "Witching Hour: gain +3 Attack for the fight." },
      art: ART("cat_lantern", "indigo"), tags: ["witching"]
    }),
    unit({
      id: "moon_hollow_tabby", name: "Hollow Tabby", rarity: "common", cost: 2, p: 4, h: 7, lives: 4,
      text: "When this loses a Life, Mark a random pest twice (1 each).",
      flavor: "Leaves a hollow in the sofa and, lately, in the enemy's plans.",
      effects: { onLifeLost: [{ type: "applyStatus", status: "marked", amount: 1, target: "randomEnemy", times: 2 }] },
      upgrade: { stats: { power: 5 } },
      art: ART("cat_tabby_hollow", "grey_violet"), tags: ["marked", "lives"]
    }),
    unit({
      id: "moon_sleepwalker", name: "Sleepwalker", rarity: "common", cost: 1, p: 3, h: 5, lives: 4,
      kw: { unfrazzled: true }, text: "Never Frazzled.",
      flavor: "Zooms with eyes closed. Lands better than you would think.",
      upgrade: { stats: { power: 4, health: 6 } },
      art: ART("cat_sleepy_float", "indigo"), tags: ["witching"]
    }),
    unit({
      id: "moon_stray_medium", name: "Stray Medium", rarity: "common", cost: 1, p: 2, h: 6, lives: 4,
      text: "Deploy: bank 1 Life.",
      flavor: "Charges by the seance. Accepts tuna.",
      effects: { onPlay: [{ type: "bank", amount: 1 }] },
      upgrade: { text: "Deploy: bank 2 Lives.", effects: { onPlay: [{ type: "bank", amount: 2 }] } },
      art: ART("cat_medium_shawl", "violet"), tags: ["bank"]
    }),

    /* ================= CAT UNITS: UNCOMMON (7) ================= */
    unit({
      id: "moon_ninth_sibling", name: "Ninth Sibling", rarity: "uncommon", cost: 2, p: 3, h: 7, lives: 4,
      text: "Whenever any cat spends or loses a Life, bank 1 Life (twice a turn).",
      flavor: "Eight siblings are very proud. Several are not speaking to her.",
      effects: {
        onAnyLifeLost: [{ type: "bank", amount: 1, limit: { per: "turn", n: 2 } }] },
      upgrade: { text: "Whenever any cat spends or loses a Life, bank 1 Life (three times a turn).",
        effects: {
          onAnyLifeLost: [{ type: "bank", amount: 1, limit: { per: "turn", n: 3 } }] } },
      art: ART("cat_ninth_small", "silver"), tags: ["bank", "engine"]
    }),
    unit({
      id: "moon_vigil_keeper", name: "Vigil Keeper", rarity: "uncommon", cost: 2, p: 4, h: 7, lives: 4,
      text: "Whenever a cat on this floor becomes Cornered, it gains Fluff 5 and Hidden.",
      flavor: "Sits up all night so the others can almost die in peace.",
      effects: { onAnyCornered: [
        { type: "fluff", amount: 5, target: "triggerSource", if: [{ check: "triggerOnThisFloor", op: "==", value: true }] },
        { type: "applyStatus", status: "hidden", amount: 1, target: "triggerSource", if: [{ check: "triggerOnThisFloor", op: "==", value: true }] }] },
      upgrade: { stats: { health: 9 } },
      art: ART("cat_vigil_hood", "indigo"), tags: ["cornered"]
    }),
    unit({
      id: "moon_lamplit_gambler", name: "Lamplit Gambler", rarity: "uncommon", cost: 2, p: 4, h: 6, lives: 4,
      text: "Deploy: Spend up to 2 Lives. Draw 1 per Life spent.",
      flavor: "Went all in on a single nap and got an excellent price.",
      effects: { onPlay: [
        { type: "lives", amount: -2, voluntary: true, upTo: true, target: "self" },
        { type: "draw", amount: { base: 0, per: "livesSpent", mult: 1 }, target: "player" }] },
      upgrade: { cost: 1 },
      art: ART("cat_gambler_visor", "violet"), tags: ["spend", "cornered", "engine"]
    }),
    unit({
      id: "moon_wick_witch", name: "Wick Witch", rarity: "uncommon", cost: 2, p: 3, h: 7, lives: 4,
      text: "Witching Hour: Mark every pest.",
      flavor: "Her broom is a Swiffer. The coven has questions.",
      effects: { onWitchingHour: [{ type: "applyStatus", status: "marked", amount: 1, target: "allEnemies" }] },
      upgrade: { stats: { power: 4, health: 8 } },
      art: ART("cat_witch_hat", "indigo"), tags: ["witching", "marked"]
    }),
    unit({
      id: "moon_pallbearer_tom", name: "Pallbearer Tom", rarity: "uncommon", cost: 3, p: 5, h: 8, lives: 4,
      text: "Deploy: return a cat from your discard pile to your hand.",
      flavor: "Carries the departed back in. Complains about the stairs.",
      effects: { onPlay: [{ type: "returnFromDiscard", card: "cat", amount: 1, to: "hand" }] },
      upgrade: { stats: { power: 6, health: 10 } },
      art: ART("cat_black_suit", "grey_violet"), tags: ["recursion"]
    }),
    unit({
      id: "moon_boomerang_bernard", name: "Boomerang Bernard", rarity: "uncommon", cost: 2, p: 4, h: 6, lives: 4,
      kw: { reborn: true }, text: "Reborn. When this loses a Life, bank 1 Life.",
      flavor: "Dies, considers it, returns. Politely, but with notes.",
      effects: { onLifeLost: [{ type: "bank", amount: 1 }] },
      upgrade: { text: "Reborn. When this loses a Life, bank 2 Lives.", effects: { onLifeLost: [{ type: "bank", amount: 2 }] } },
      art: ART("cat_boomerang", "silver"), tags: ["reborn", "bank"]
    }),
    unit({
      id: "moon_siamese_seer", name: "Siamese Seer", rarity: "uncommon", cost: 2, p: 3, h: 7, lives: 4,
      text: "Whenever this attacks, Mark its target.",
      flavor: "Foresees your future. It features a pest, and then slightly fewer pests.",
      effects: { onAttack: [{ type: "applyStatus", status: "marked", amount: 1, target: "attackTarget" }] },
      upgrade: { stats: { power: 4 } },
      art: ART("cat_siamese_third_eye", "indigo"), tags: ["marked"]
    }),

    /* ================= CAT UNITS: RARE (4) ================= */
    unit({
      id: "moon_mrs_midnight", name: "Mrs. Midnight", rarity: "rare", cost: 3, p: 4, h: 9, lives: 4,
      kw: { witchingEcho: true }, text: "Witching Hour: the extra Zoomies, the extra card and your free Zooms happen twice.",
      effects: { onWitchingHour: [{ type: "witchingEcho" }] },
      flavor: "The clock strikes twelve and then, out of professional pride, again.",
      upgrade: { stats: { power: 5, health: 11 } },
      art: ART("cat_clock_dress", "indigo_gold"), tags: ["witching", "engine"]
    }),
    unit({
      id: "moon_pallid_empress", name: "The Pallid Empress", rarity: "rare", cost: 4, p: 6, h: 11, lives: 5, size: 2,
      text: "Large. Any cat spending or losing a Life: +1 Attack. Cornered: Frenzy 1 each turn.",
      flavor: "Rules from a cushion. Has outlived four dynasties and a sofa.",
      effects: {
        onAnyLifeLost: [{ type: "buff", stat: "power", amount: 1, duration: "fight", target: "self" }],
        onTurnStart: [{ type: "applyStatus", status: "frenzy", amount: 1, target: "self", if: [{ check: "selfLives", op: "==", value: 1 }] }] },
      upgrade: { stats: { health: 14 } },
      art: ART("cat_empress_large", "silver_violet"), tags: ["cornered", "engine", "large"]
    }),
    unit({
      id: "moon_probate_persian", name: "Probate Persian", rarity: "rare", cost: 2, p: 3, h: 10, lives: 4,
      text: "Deploy: bank 1 Life. End of battle: every 3 Banked Lives gives your most hurt cat a Life.",
      flavor: "Settles estates by sitting on them until everyone agrees.",
      effects: { onPlay: [{ type: "bank", amount: 1 }], onBattleEnd: [{ type: "bankConvert", per: 3 }] },
      upgrade: { text: "Deploy: bank 2 Lives. End of battle: every 2 Banked Lives gives your most hurt cat a Life.",
        effects: { onPlay: [{ type: "bank", amount: 2 }], onBattleEnd: [{ type: "bankConvert", per: 2 }] } },
      art: ART("cat_persian_wig", "cream_violet"), tags: ["bank", "engine"]
    }),
    unit({
      id: "moon_the_undertaker", name: "Mr. Tuppence, Undertaker", rarity: "rare", cost: 3, p: 5, h: 8, lives: 4,
      kw: { reborn: true }, text: "Reborn. When this loses a Life, spend 2 Banked Lives to gain that Life back.",
      flavor: "Attended every funeral, including his own. Excellent turnout.",
      effects: { onLifeWouldBeLost: [
        { type: "preventLifeLoss", if: [{ check: "bank", op: ">=", value: 2 }] },
        { type: "bank", amount: -2, if: [{ check: "bank", op: ">=", value: 2 }] }] },
      upgrade: { stats: { power: 6, health: 10 } },
      art: ART("cat_top_hat_black", "black_violet"), tags: ["reborn", "bank", "engine"]
    }),

    /* ================= SPELLS: COMMON (7) ================= */
    spell({
      id: "moon_borrowed_time", name: "Borrowed Time", rarity: "common", cost: 0, targeting: "cat", kw: { exhaust: true },
      text: "Spend a Life of a cat. Draw 2, gain 1 Zoomies. Exhaust.",
      flavor: "Interest accrues in naps.",
      effects: { onPlay: [
        { type: "lives", amount: -1, voluntary: true, target: "chosenCat" },
        { type: "draw", amount: 2, target: "player", if: [{ check: "livesSpent", op: ">=", value: 1 }] },
        { type: "zoomies", amount: 1, if: [{ check: "livesSpent", op: ">=", value: 1 }] }] },
      upgrade: { text: "Spend a Life of a cat. Draw 3, gain 1 Zoomies. Exhaust.",
        effects: { onPlay: [
          { type: "lives", amount: -1, voluntary: true, target: "chosenCat" },
          { type: "draw", amount: 3, target: "player" }, { type: "zoomies", amount: 1 }] } },
      art: ART("spell_hourglass", "violet"), tags: ["spend"]
    }),
    spell({
      id: "moon_land_on_feet", name: "Land on Feet", rarity: "common", cost: 1, targeting: "cat",
      text: "A cat gains Reborn for the fight. Draw 1.",
      flavor: "Physics is a suggestion. The cat has not read it.",
      effects: { onPlay: [{ type: "rebornFight", target: "chosenCat" }, { type: "draw", amount: 1, target: "player" }] },
      upgrade: { cost: 0 },
      art: ART("spell_paws_down", "indigo"), tags: ["reborn"]
    }),
    spell({
      id: "moon_mark_for_dusk", name: "Mark for Dusk", rarity: "common", cost: 1, targeting: "enemy",
      text: "Deal 3 damage. Mark the pest twice.",
      flavor: "Nothing personal. Alright, a bit personal.",
      effects: { onPlay: [{ type: "damage", amount: 3, kind: "hit", target: "chosenEnemy" }, { type: "applyStatus", status: "marked", amount: 2, target: "chosenEnemy" }] },
      upgrade: { text: "Deal 5 damage. Mark the pest twice.",
        effects: { onPlay: [{ type: "damage", amount: 5, kind: "hit", target: "chosenEnemy" }, { type: "applyStatus", status: "marked", amount: 2, target: "chosenEnemy" }] } },
      art: ART("spell_crosshair_moon", "violet"), tags: ["marked"]
    }),
    spell({
      id: "moon_candlelit_hiss", name: "Candlelit Hiss", rarity: "common", cost: 1, targeting: "floor",
      text: "Mark every pest on a floor. They get Hiss 1.",
      flavor: "Delivered in a whisper, which is somehow worse.",
      effects: { onPlay: [{ type: "applyStatus", status: "marked", amount: 1, target: "allEnemiesOnFloor" }, { type: "applyStatus", status: "hiss", amount: 1, target: "allEnemiesOnFloor" }] },
      upgrade: { text: "Mark every pest on a floor. They get Hiss 2.",
        effects: { onPlay: [{ type: "applyStatus", status: "marked", amount: 1, target: "allEnemiesOnFloor" }, { type: "applyStatus", status: "hiss", amount: 2, target: "allEnemiesOnFloor" }] } },
      art: ART("spell_candle_ring", "indigo"), tags: ["marked"]
    }),
    spell({
      id: "moon_tuna_dream", name: "Tuna Dream", rarity: "common", cost: 2, targeting: "cat",
      text: "A cat gains a Life and heals 4.",
      flavor: "In the dream the tin never ends. Neither does the cat.",
      effects: { onPlay: [{ type: "lives", amount: 1, target: "chosenCat" }, { type: "heal", amount: 4, target: "chosenCat" }] },
      upgrade: { cost: 1 },
      art: ART("spell_tuna_moon", "silver"), tags: ["lives"]
    }),
    spell({
      id: "moon_pennies_from_heaven", name: "Pennies from Heaven", rarity: "common", cost: 1,
      text: "Bank 2 Lives. Draw 1.",
      flavor: "They fall from above. Do not ask who they used to belong to.",
      effects: { onPlay: [{ type: "bank", amount: 2 }, { type: "draw", amount: 1, target: "player" }] },
      upgrade: { text: "Bank 3 Lives. Draw 1.", effects: { onPlay: [{ type: "bank", amount: 3 }, { type: "draw", amount: 1, target: "player" }] } },
      art: ART("spell_coins_rain", "silver"), tags: ["bank"]
    }),
    spell({
      id: "moon_chill_in_the_hall", name: "Chill in the Hall", rarity: "common", cost: 1, targeting: "enemy",
      text: "Deal 3 damage. Deal 3 more if the pest is Marked.",
      flavor: "A draft with intent.",
      effects: { onPlay: [{ type: "damage", amount: 3, kind: "hit", target: "chosenEnemy" },
        { type: "damage", amount: 3, kind: "hit", target: "chosenEnemy", if: [{ check: "targetMarked", op: "==", value: true }] }] },
      upgrade: { text: "Deal 4 damage. Deal 4 more if the pest is Marked.",
        effects: { onPlay: [{ type: "damage", amount: 4, kind: "hit", target: "chosenEnemy" },
          { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy", if: [{ check: "targetMarked", op: "==", value: true }] }] } },
      art: ART("spell_cold_draft", "indigo"), tags: ["marked"]
    }),

    /* ================= SPELLS: UNCOMMON (5) ================= */
    spell({
      id: "moon_seance_saucer", name: "Seance Saucer", rarity: "uncommon", cost: 1,
      text: "Spend 2 Banked Lives: return a cat from your discard to your hand. It gains a Life.",
      flavor: "A saucer, a candle, and a cat who really should have said something.",
      effects: { onPlay: [
        { type: "returnFromDiscard", card: "cat", amount: 1, to: "hand", lives: 1, if: [{ check: "bank", op: ">=", value: 2 }, { check: "catsInDiscard", op: ">=", value: 1 }] },
        { type: "bank", amount: -2, if: [{ check: "returnedFromDiscard", op: ">=", value: 1 }] }] },
      upgrade: { text: "Spend 2 Banked Lives: return a cat from your discard to your hand. It gains a Life and costs 1 less.",
        effects: { onPlay: [
          { type: "returnFromDiscard", card: "cat", amount: 1, to: "hand", lives: 1, costDelta: -1, if: [{ check: "bank", op: ">=", value: 2 }, { check: "catsInDiscard", op: ">=", value: 1 }] },
          { type: "bank", amount: -2, if: [{ check: "returnedFromDiscard", op: ">=", value: 1 }] }] } },
      art: ART("spell_saucer_candle", "violet"), tags: ["bank", "recursion"]
    }),
    spell({
      id: "moon_cornering_rite", name: "Cornering Rite", rarity: "uncommon", cost: 1, targeting: "cat",
      text: "Spend up to 2 Lives of a cat. Draw 1 per Life spent.",
      flavor: "The cat insists it is in control. It is under a table.",
      effects: { onPlay: [
        { type: "lives", amount: -2, voluntary: true, upTo: true, target: "chosenCat" },
        { type: "draw", amount: { base: 0, per: "livesSpent", mult: 1 }, target: "player" }] },
      upgrade: { text: "Spend up to 2 Lives of a cat. Draw 1 per Life spent. Gain 1 Zoomies.",
        effects: { onPlay: [
          { type: "lives", amount: -2, voluntary: true, upTo: true, target: "chosenCat" },
          { type: "draw", amount: { base: 0, per: "livesSpent", mult: 1 }, target: "player" },
          { type: "zoomies", amount: 1 }] } },
      art: ART("spell_ritual_circle", "violet"), tags: ["spend", "cornered"]
    }),
    spell({
      id: "moon_wind_the_clock", name: "Wind the Clock", rarity: "uncommon", cost: 1, kw: { exhaust: true },
      text: "The next Witching Hour comes next round, if allowed. Exhaust.",
      flavor: "Gently, so as not to wake the grandfather.",
      effects: { onPlay: [{ type: "witching", mode: "next" }] },
      upgrade: { text: "The next Witching Hour comes next round, if allowed. Draw 1. Exhaust.",
        effects: { onPlay: [{ type: "witching", mode: "next" }, { type: "draw", amount: 1, target: "player" }] } },
      art: ART("spell_clock_key", "indigo_gold"), tags: ["witching"]
    }),
    spell({
      id: "moon_haunting_rights", name: "Haunting Rights", rarity: "uncommon", cost: 2, targeting: "floor",
      text: "Deal 1 damage to every pest on a floor per cat in your discard pile (max 8).",
      flavor: "The dead hold the lease. The landlord is, inexplicably, also a cat.",
      effects: { onPlay: [{ type: "damage", amount: { base: 0, per: "catsInDiscard", mult: 1, max: 8 }, kind: "hit", target: "allEnemiesOnFloor" }] },
      upgrade: { text: "Deal 2 damage to every pest on a floor per cat in your discard pile (max 12).",
        effects: { onPlay: [{ type: "damage", amount: { base: 0, per: "catsInDiscard", mult: 2, max: 12 }, kind: "hit", target: "allEnemiesOnFloor" }] } },
      art: ART("spell_ghost_paws", "silver_violet"), tags: ["ghost", "recursion"]
    }),
    spell({
      id: "moon_fade_out", name: "Fade Out", rarity: "uncommon", cost: 1, targeting: "cat",
      text: "A cat gains Hidden and Fluff 6.",
      flavor: "Not gone. Just elsewhere, with better lighting.",
      effects: { onPlay: [{ type: "applyStatus", status: "hidden", amount: 1, target: "chosenCat" }, { type: "fluff", amount: 6, target: "chosenCat" }] },
      upgrade: { text: "A cat gains Hidden and Fluff 10.",
        effects: { onPlay: [{ type: "applyStatus", status: "hidden", amount: 1, target: "chosenCat" }, { type: "fluff", amount: 10, target: "chosenCat" }] } },
      art: ART("spell_fading_cat", "silver"), tags: ["ghost"]
    }),

    /* ================= SPELLS: RARE (2) ================= */
    spell({
      id: "moon_thirteenth_chime", name: "Thirteenth Chime", rarity: "rare", cost: 2, kw: { exhaust: true },
      text: "The next round is also a Witching Hour, even right after one. Once a battle. Exhaust.",
      flavor: "The clock has a thirteenth hour. Management wishes you had not found it.",
      effects: { onPlay: [{ type: "witching", mode: "chain" }] },
      upgrade: { cost: 1 },
      art: ART("spell_clock_thirteen", "indigo_gold"), tags: ["witching", "engine"]
    }),
    spell({
      id: "moon_everything_must_go", name: "Everything Must Go", rarity: "rare", cost: 2, kw: { exhaust: true },
      text: "Every cat spends 1 Life. Per Life spent: 4 damage to a random pest, bank 1 Life. Exhaust.",
      flavor: "Closing down sale. All lives reduced. The cats are on the premises and fine.",
      effects: { onPlay: [
        { type: "lives", amount: -1, voluntary: true, target: "allCats" },
        { type: "damage", amount: 4, kind: "hit", target: "randomEnemy", times: { base: 0, per: "livesSpent", mult: 1 } },
        { type: "bank", amount: { base: 0, per: "livesSpent", mult: 1 } }] },
      upgrade: { cost: 1 },
      art: ART("spell_sale_sign", "violet_gold"), tags: ["spend", "bank", "engine"]
    }),

    /* ================= TOYS / ROOMS: COMMON (2) ================= */
    toy({
      id: "moon_candle_stub", name: "Candle Stub", rarity: "common", cost: 1,
      text: "End of your turn: Mark a random pest on this floor.",
      flavor: "Burns slowly. The cat says that is the whole point.",
      effects: { onTurnEnd: [{ type: "applyStatus", status: "marked", amount: 1, target: "randomEnemyOnFloor" }] },
      upgrade: { text: "End of your turn: Mark every pest on this floor.",
        effects: { onTurnEnd: [{ type: "applyStatus", status: "marked", amount: 1, target: "allEnemiesOnFloor" }] } },
      art: ART("room_candle", "indigo"), tags: ["marked"]
    }),
    toy({
      id: "moon_sock_shrine", name: "Sock Shrine", rarity: "common", cost: 1,
      text: "Whenever a cat here spends or loses a Life, bank 1 Life.",
      flavor: "A single sock, venerated. Nobody remembers whose.",
      effects: { onAnyLifeLost: [{ type: "bank", amount: 1 }] },
      upgrade: { cost: 0 },
      art: ART("room_sock_altar", "violet"), tags: ["bank", "engine"]
    }),

    /* ================= TOYS / ROOMS: UNCOMMON (4) ================= */
    toy({
      id: "moon_ouija_rug", name: "Ouija Rug", rarity: "uncommon", cost: 2,
      text: "Whenever a cat here becomes Cornered, draw 1 and gain 1 Zoomies (once a turn).",
      flavor: "The cats spell out HELP. Then, for variety, FISH.",
      effects: { onAnyCornered: [
        { type: "draw", amount: 1, target: "player", limit: { per: "turn", n: 1 } },
        { type: "zoomies", amount: 1, limit: { per: "turn", n: 1 } }] },
      upgrade: { text: "Whenever a cat here becomes Cornered, draw 1 and gain 1 Zoomies (twice a turn).",
        effects: { onAnyCornered: [
          { type: "draw", amount: 1, target: "player", limit: { per: "turn", n: 2 } },
          { type: "zoomies", amount: 1, limit: { per: "turn", n: 2 } }] } },
      art: ART("room_ouija_rug", "violet"), tags: ["cornered", "engine"]
    }),
    toy({
      id: "moon_stopped_clock", name: "Stopped Grandfather Clock", rarity: "uncommon", cost: 2,
      text: "Witching Hour: cats here are not Frazzled and gain +2 Attack that turn.",
      flavor: "Stuck at 3:00. Never late for the cats.",
      effects: { onWitchingHour: [
        { type: "spareFrazzle", target: "allCatsOnFloor" },
        { type: "buff", stat: "power", amount: 2, duration: "turn", target: "allCatsOnFloor" }] },
      upgrade: { text: "Witching Hour: cats here are not Frazzled and gain +3 Attack that turn.",
        effects: { onWitchingHour: [
          { type: "spareFrazzle", target: "allCatsOnFloor" },
          { type: "buff", stat: "power", amount: 3, duration: "turn", target: "allCatsOnFloor" }] } },
      art: ART("room_grandfather_clock", "indigo_gold"), tags: ["witching"]
    }),
    toy({
      id: "moon_haunted_mirror", name: "Haunted Mirror", rarity: "uncommon", cost: 2,
      text: "Whenever a cat here Zooms, Mark its target.",
      flavor: "Shows a cat. Not the one standing in front of it.",
      effects: { onAnyZoom: [{ type: "applyStatus", status: "marked", amount: 1, target: "attackTarget" }] },
      upgrade: { text: "Whenever a cat here Zooms, Mark its target twice.",
        effects: { onAnyZoom: [{ type: "applyStatus", status: "marked", amount: 2, target: "attackTarget" }] } },
      art: ART("room_mirror_oval", "silver_violet"), tags: ["witching", "marked"]
    }),
    toy({
      id: "moon_fishbowl_oracle", name: "Fishbowl Oracle", rarity: "uncommon", cost: 2,
      text: "Start of your turn: draw 1 per Cornered cat here (max 2).",
      flavor: "The fish predicts doom daily. It is right about half the time and smug about all of it.",
      effects: { onTurnStart: [{ type: "draw", amount: { base: 0, per: "corneredOnFloor", mult: 1, max: 2 }, target: "player" }] },
      upgrade: { text: "Start of your turn: draw 1 per Cornered cat here (max 3).",
        effects: { onTurnStart: [{ type: "draw", amount: { base: 0, per: "corneredOnFloor", mult: 1, max: 3 }, target: "player" }] } },
      art: ART("room_fishbowl", "indigo"), tags: ["cornered"]
    }),

    /* ================= TOYS / ROOMS: RARE (2) ================= */
    toy({
      id: "moon_cat_flap_beyond", name: "Cat Flap to the Beyond", rarity: "rare", cost: 3,
      text: "Cats here have Reborn. Whenever a cat here loses a Life, bank 1 Life.",
      flavor: "Leads somewhere. The cats will not say where, but they are home for dinner.",
      effects: {
        onPlay: [{ type: "grantKeyword", keyword: "reborn", amount: 1, duration: "fight", target: "allCatsOnFloor" }],
        onCatDeployed: [{ type: "grantKeyword", keyword: "reborn", amount: 1, duration: "fight", target: "triggerSource" }],
        onAnyLifeLost: [{ type: "bank", amount: 1 }] },
      upgrade: { text: "Cats here have Reborn. Whenever a cat here loses a Life, bank 2 Lives.",
        effects: {
          onPlay: [{ type: "grantKeyword", keyword: "reborn", amount: 1, duration: "fight", target: "allCatsOnFloor" }],
          onCatDeployed: [{ type: "grantKeyword", keyword: "reborn", amount: 1, duration: "fight", target: "triggerSource" }],
          onAnyLifeLost: [{ type: "bank", amount: 2 }] } },
      art: ART("room_cat_flap_glow", "violet_gold"), tags: ["reborn", "bank", "engine"]
    }),
    toy({
      id: "moon_moon_pool", name: "The Moon Pool", rarity: "rare", cost: 3,
      text: "Witching Hour: per Banked Life (max 5), 2 damage to a random pest and Mark it. Bank stays.",
      flavor: "A saucer of milk with ambitions. Do not lean over it.",
      effects: { onWitchingHour: [
        { type: "damage", amount: 2, kind: "hit", target: "randomEnemy", times: { base: 0, per: "bank", mult: 1, max: 5 } },
        { type: "applyStatus", status: "marked", amount: 1, target: "randomEnemy", times: { base: 0, per: "bank", mult: 1, max: 5 } }] },
      upgrade: { text: "Witching Hour: per Banked Life (max 7), 2 damage to a random pest and Mark it. Bank stays.",
        effects: { onWitchingHour: [
          { type: "damage", amount: 2, kind: "hit", target: "randomEnemy", times: { base: 0, per: "bank", mult: 1, max: 7 } },
          { type: "applyStatus", status: "marked", amount: 1, target: "randomEnemy", times: { base: 0, per: "bank", mult: 1, max: 7 } }] } },
      art: ART("room_moon_pool", "indigo_silver"), tags: ["witching", "bank", "engine"]
    })
  ];
})();
