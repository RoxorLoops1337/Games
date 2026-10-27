/*
 * SUNBEAM SIEGE: starter basics and engine-side gap fillers (agent C1, per API.md rulings).
 * Contents:
 *   4 clan basic kittens (the 4 main-clan basics and 1 side-clan basic of the 11-card starting deck)
 *   alley_off_the_shelf (A03 sample referenced by events.js)
 *   neutral_goblin_kitten, neutral_goblin_cat, neutral_goblin_king (events.js NEEDS)
 *   relicsExtra: relic_pigeon_feather, relic_roomba_bumper, relic_elder_spectacles (events.js NEEDS)
 * No em dashes. Schema follows A03 section 9.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.cardsStarters = [
  { id: "alley_basic_kitten", name: "Alley Kitten", type: "unit", clan: "alley", rarity: "basic", cost: 1, targeting: "floor",
    stats: { power: 1, health: 4, lives: 2, size: 1 }, keywords: { pounce: 1 }, tags: ["kitten", "starter", "pounce"],
    text: "Pounce 1.", flavor: "Still learning which fights are optional. None, so far.",
    upgrade: { stats: { power: 2, health: 5 }, text: "Pounce 1." },
    art: { sprite: "kitten_scrappy", palette: "orange", hint: "small orange tabby kitten with a torn ear and a bottle cap" }, unlock: "start" },
  { id: "hearth_basic_kitten", name: "Hearth Kitten", type: "unit", clan: "hearth", rarity: "basic", cost: 1, targeting: "floor",
    stats: { power: 1, health: 6, lives: 2, size: 1 }, keywords: { purr: 1 }, tags: ["kitten", "starter", "purr"],
    text: "Purr 1.", flavor: "Rated for warmth. Not rated for stairs.",
    upgrade: { stats: { power: 2, health: 7 }, keywords: { purr: 2 }, text: "Purr 2." },
    art: { sprite: "kitten_loaf", palette: "cream", hint: "round cream kitten on a knitted square" }, unlock: "start" },
  { id: "moon_basic_kitten", name: "Moon Kitten", type: "unit", clan: "moon", rarity: "basic", cost: 1, targeting: "floor",
    stats: { power: 3, health: 4, lives: 3, size: 1 }, keywords: {}, tags: ["kitten", "starter", "lives"],
    text: "Deploy: Bank 1 Life.", flavor: "Stares at corners. The corners stare back, politely.",
    effects: { onPlay: [{ type: "bank", amount: 1 }] },
    upgrade: { effects: { onPlay: [{ type: "bank", amount: 2 }] }, stats: { health: 5 }, text: "Deploy: Bank 2 Lives." },
    art: { sprite: "kitten_moon", palette: "indigo", hint: "small indigo kitten with a crescent mark on the forehead" }, unlock: "start" },
  { id: "mischief_basic_kitten", name: "Mischief Kitten", type: "unit", clan: "mischief", rarity: "basic", cost: 1, targeting: "floor",
    stats: { power: 2, health: 4, lives: 3, size: 1 }, keywords: {}, tags: ["kitten", "starter", "nip"],
    text: "Deploy: gain 1 Nip.", flavor: "Has already knocked something over. You will find it later.",
    effects: { onPlay: [{ type: "catnip", amount: 1 }] },
    upgrade: { effects: { onPlay: [{ type: "catnip", amount: 2 }] }, stats: { health: 5 }, text: "Deploy: gain 2 Nip." },
    art: { sprite: "kitten_chaos", palette: "teal", hint: "teal and cream kitten wearing a yarn scarf, one paw on a cup" }, unlock: "start" },

  { id: "alley_off_the_shelf", name: "Off the Shelf", type: "spell", clan: "alley", rarity: "uncommon", cost: 1, targeting: "enemy",
    keywords: {}, tags: ["knock", "shatter"], text: "Knock 2. If it ends in the Cellar, deal 4 damage.",
    flavor: "It was fragile. That was the appeal.",
    effects: { onPlay: [{ type: "knock", amount: 2, target: "chosenEnemy" },
      { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy", if: [{ check: "targetFloor", op: "==", value: 1 }] }] },
    upgrade: { effects: { onPlay: [{ type: "knock", amount: 2, target: "chosenEnemy" },
      { type: "damage", amount: 7, kind: "hit", target: "chosenEnemy", if: [{ check: "targetFloor", op: "==", value: 1 }] }] },
      text: "Knock 2. If it ends in the Cellar, deal 7 damage." },
    unlock: "start" },

  { id: "neutral_goblin_kitten", name: "Goblin Kitten", type: "unit", clan: "neutral", rarity: "common", cost: 1, targeting: "floor",
    stats: { power: 2, health: 3, lives: 2, size: 1 }, keywords: { pounce: 1 }, tags: ["kitten", "goblin"],
    text: "Pounce 1.", flavor: "Small, green-eyed, and legally a cat.",
    upgrade: { stats: { power: 3, health: 4 }, text: "Pounce 1." }, unlock: "start" },
  { id: "neutral_goblin_cat", name: "Goblin Cat", type: "unit", clan: "neutral", rarity: "uncommon", cost: 1, targeting: "floor",
    stats: { power: 4, health: 5, lives: 3, size: 1 }, keywords: { pounce: 2 }, tags: ["goblin"],
    text: "Pounce 2. Deploy: gain 1 Fish.", flavor: "Pockets are a lifestyle.",
    effects: { onPlay: [{ type: "fish", amount: 1 }] },
    upgrade: { stats: { power: 5, health: 6 }, text: "Pounce 2. Deploy: gain 1 Fish." }, unlock: "start" },
  { id: "neutral_goblin_king", name: "Goblin King", type: "unit", clan: "neutral", rarity: "rare", cost: 2, targeting: "floor",
    stats: { power: 6, health: 8, lives: 4, size: 1 }, keywords: {}, tags: ["goblin"],
    text: "Deploy: summon a Stray Kitten on each other floor.", flavor: "The crown is a bottle cap. The court is loyal anyway.",
    effects: { onPlay: [{ type: "summon", card: "token_stray_kitten", target: "otherFloors" }] },
    upgrade: { stats: { power: 7, health: 10 }, text: "Deploy: summon a Stray Kitten on each other floor." }, unlock: "start" }
];

SB.data.relicsExtra = [
  { id: "relic_pigeon_feather", name: "Pigeon Feather", rarity: "common", clan: null, tags: ["event"],
    text: "The first card you play each battle costs 1 less.", flavor: "Gifted by a pigeon. Clearly a bribe.", art: "grey feather with a price tag", price: null,
    hooks: [{ on: "onHandReady", limit: { per: "battle", n: 1 }, effects: [{ type: "reduceCost", amount: 1, duration: "played", target: "firstCardInHand" }] }] },
  { id: "relic_roomba_bumper", name: "Roomba Bumper", rarity: "uncommon", clan: null, tags: ["event"],
    text: "The first pest to climb each battle is Knocked 1.", flavor: "Salvaged. The roomba does not want it back. The roomba wants revenge.", art: "scuffed rubber bumper strip", price: null,
    hooks: [{ on: "onPestClimb", limit: { per: "battle", n: 1 }, effects: [{ type: "knock", amount: 1, target: "triggerSource" }] }] },
  { id: "relic_elder_spectacles", name: "Elder's Spectacles", rarity: "rare", clan: null, tags: ["event"],
    text: "See pest intents two rounds ahead. Kneading cap +1.", flavor: "Prescription: wise. Slightly smudged.", art: "round half-moon glasses on a ribbon", price: null,
    mods: { intentLookahead: 2, kneadCapBonus: 1 }, hooks: [] }
];

/* ------------------------------------------------------------------------------------------------
 * Added by agent C2 (run layer): starter decks and Collar Charms.
 *
 * SB.data.starterDecks: the 11 card starting deck (RULES section 4): Champion, 4 main clan basics, 2 Swat, 2 Catnap,
 *   1 Cardboard Box, 1 side clan basic. byChampion lists the literal ids for every champion and every side clan.
 * SB.data.charms: 24 Collar Charms (clan reward, Gerald's charm slot). One charm per card. Effects use the A06
 *   upgrade op vocabulary (addStat, grantKeyword, addTrigger, setFlag, addLives, grantMasteryRank) so the same
 *   card-inst code that applies scratches applies charms (inst.charm = charm id).
 * ---------------------------------------------------------------------------------------------- */
(function () {
  var CLANS = ['alley', 'hearth', 'moon', 'mischief'];
  function deck(champion, main, side) {
    var d = [champion];
    for (var i = 0; i < 4; i++) d.push(main + '_basic_kitten');
    d.push('neutral_swat', 'neutral_swat', 'neutral_catnap', 'neutral_catnap', 'neutral_cardboard_box');
    d.push(side + '_basic_kitten');
    return d;
  }
  var champs = {
    alley_shadow: 'alley', alley_mad_maxine: 'alley', hearth_duchess_marmalade: 'hearth', hearth_brother_crumpet: 'hearth',
    moon_oswin_ledgerpaw: 'moon', moon_tuppence_mistfur: 'moon', mischief_tumble_ledgeworth: 'mischief', mischief_parcel_pennywhistle: 'mischief'
  };
  var by = {};
  Object.keys(champs).forEach(function (cid) {
    by[cid] = {};
    CLANS.forEach(function (side) { if (side !== champs[cid]) by[cid][side] = deck(cid, champs[cid], side); });
  });
  SB.data.starterDecks = {
    rule: 'Champion + 4 main basics + 2 Swat + 2 Catnap + 1 Cardboard Box + 1 side basic = 11 cards',
    size: 11,
    byChampion: by,
    clanBasic: { alley: 'alley_basic_kitten', hearth: 'hearth_basic_kitten', moon: 'moon_basic_kitten', mischief: 'mischief_basic_kitten' },
    // championId may be a real id or a meta placeholder id; falls back to the clan id for unknown champions
    build: function (championId, main, side) { return deck(championId, main, side); }
  };

  var T = function (when, doEffects, extra) { return Object.assign({ op: 'addTrigger', when: when, 'do': doEffects }, extra || {}); };
  function ch(id, name, clan, fits, text, flavor, effects, requires) {
    return { id: id, name: name, clan: clan, fits: fits, text: text, flavor: flavor, effects: effects, requires: requires || null, price: 90 };
  }
  SB.data.charms = [
    /* neutral (8) */
    ch('charm_brass_bell', 'Brass Bell', 'neutral', ['unit'], '+1 Life.', 'Announces the cat. Also the snack.', [{ op: 'addLives', n: 1 }]),
    ch('charm_thick_collar', 'Thick Collar', 'neutral', ['unit'], '+4 Health.', 'Padded by someone who worries.', [{ op: 'addStat', stat: 'health', value: 4 }]),
    ch('charm_sharp_tag', 'Sharp Tag', 'neutral', ['unit'], '+1 Attack.', 'Engraved: IF FOUND, DO NOT ENGAGE.', [{ op: 'addStat', stat: 'attack', value: 1 }]),
    ch('charm_quiet_ribbon', 'Quiet Ribbon', 'neutral', ['any'], 'Retain.', 'Tied in a bow it will not explain.', [{ op: 'setFlag', flag: 'retain' }]),
    ch('charm_lucky_tag', 'Lucky Tag', 'neutral', ['any'], 'Costs 1 less (cards costing 2 or more).', 'Lucky once. That was enough.', [{ op: 'addStat', stat: 'cost', value: -1 }], { minCost: 2 }),
    ch('charm_whisker_tin', 'Whisker Tin', 'neutral', ['spell'], '+2 to the spell\'s main number.', 'Contains whiskers. Do not ask whose.', [{ op: 'addStat', stat: 'value', value: 2 }]),
    ch('charm_fluff_ruff', 'Fluff Ruff', 'neutral', ['unit'], 'Starts each fight with Fluff 2.', 'A collar made entirely of other collars.', [T('fightStart', [{ type: 'fluff', amount: 2, target: 'self' }])]),
    ch('charm_paw_stamp', 'Paw Stamp', 'neutral', ['any'], 'Gain 1 Mastery rank now.', 'Certified by a committee of one.', [{ op: 'grantMasteryRank', n: 1 }]),
    /* alley (4) */
    ch('charm_torn_ear', 'Torn Ear Pin', 'alley', ['unit'], '+1 Attack and Pounce 1.', 'Earned. The other ear is still negotiating.', [{ op: 'addStat', stat: 'attack', value: 1 }, { op: 'grantKeyword', keyword: 'pounce', n: 1 }], { lacksKeyword: 'pounce' }),
    ch('charm_scrap_tag', 'Scrap Tag', 'alley', ['unit'], 'Each kill gives +1 Attack for the fight.', 'One notch per argument.', [T('onKill', [{ type: 'buff', stat: 'power', amount: 1, duration: 'fight', target: 'self' }])]),
    ch('charm_claw_cap', 'Claw Cap', 'alley', ['unit'], 'Starts each fight with Claws 2.', 'Fits like a glove. Gloves are a lie.', [T('fightStart', [{ type: 'applyStatus', status: 'claws', amount: 2, target: 'self' }])]),
    ch('charm_alley_pin', 'Alley Pin', 'alley', ['spell'], '+2 to the spell\'s main number.', 'Stolen from a better alley.', [{ op: 'addStat', stat: 'value', value: 2 }]),
    /* hearth (4) */
    ch('charm_knit_square', 'Knit Square', 'hearth', ['unit'], 'Purr 1.', 'Eleven rows. Twelve holes. Perfect.', [{ op: 'grantKeyword', keyword: 'purr', n: 1 }]),
    ch('charm_warm_pad', 'Warm Pad', 'hearth', ['unit'], '+5 Health.', 'Plugged in. Please do not ask where.', [{ op: 'addStat', stat: 'health', value: 5 }]),
    ch('charm_biscuit_tin', 'Biscuit Tin', 'hearth', ['unit'], 'Knead 1.', 'Rattles with ambition.', [{ op: 'grantKeyword', keyword: 'knead', n: 1 }], { lacksKeyword: 'knead' }),
    ch('charm_cosy_stitch', 'Cosy Stitch', 'hearth', ['unit'], 'End of turn: heal adjacent cats 1.', 'Holds the whole clowder together, badly.', [T('turnEnd', [{ type: 'heal', amount: 1, target: 'adjacentCats' }])]),
    /* moon (4) */
    ch('charm_crescent', 'Crescent Charm', 'moon', ['unit'], '+1 Life.', 'Cut from a moon nobody was using.', [{ op: 'addLives', n: 1 }]),
    ch('charm_silver_thread', 'Silver Thread', 'moon', ['unit'], 'When this dies, draw 1 card.', 'Pulled from a dream. Slightly frayed.', [T('onDeath', [{ type: 'draw', amount: 1 }])]),
    ch('charm_star_bead', 'Star Bead', 'moon', ['unit'], 'Start of fight: Bank 1 Life.', 'Counted. Counted again. Counted fondly.', [T('fightStart', [{ type: 'bank', amount: 1 }])]),
    ch('charm_moth_wing', 'Moth Wing', 'moon', ['unit'], 'Reborn.', 'Dust, mostly. The good kind.', [{ op: 'grantKeyword', keyword: 'reborn' }], { lacksKeyword: 'exhaust' }),
    /* mischief (4) */
    ch('charm_yarn_scrap', 'Yarn Scrap', 'mischief', ['unit'], 'Deploy: gain 1 Nip.', 'Unravelled on purpose.', [T('onPlay', [{ type: 'catnip', amount: 1 }])]),
    ch('charm_cup_ring', 'Cup Ring', 'mischief', ['unit'], 'First hit each turn Knocks the pest 1 floor.', 'A stain with intent.', [T('onAttack', [{ type: 'knock', amount: 1, target: 'attackTarget' }], { limit: { per: 'turn', n: 1 } })]),
    ch('charm_card_tab', 'Cardboard Tab', 'mischief', ['any'], 'Costs 1 less (cards costing 2 or more).', 'Folded, flattened, forgiven.', [{ op: 'addStat', stat: 'cost', value: -1 }], { minCost: 2 }),
    ch('charm_hairball_pin', 'Hairball Pin', 'mischief', ['unit'], 'End of its first turn each fight: shuffle a Hairball into your draw pile.', 'Fashion is pain.', [T('turnEnd', [{ type: 'createCard', card: 'curse_hairball', amount: 1, to: 'draw' }], { limit: { per: 'fight', n: 1 } })])
  ];
})();
