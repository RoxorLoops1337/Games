// Ludus Maximus: static game data (styles, techniques, traits, buildings, items). No logic here.
(function (G) {
  const D = {};

  D.STATS = ['str', 'agi', 'end', 'skl', 'wil'];
  D.SN = { str: 'Strength', agi: 'Agility', end: 'Endurance', skl: 'Skill', wil: 'Heart' };
  D.SA = { str: 'STR', agi: 'AGI', end: 'END', skl: 'SKL', wil: 'HRT' };
  D.SC = { str: '#e0432b', agi: '#22b5a0', end: '#3f7fd6', skl: '#f1b72b', wil: '#a463d8' };
  D.SLOTS = ['weapon', 'shield', 'armor', 'helm', 'charm'];
  D.SLOT_NAME = { weapon: 'Weapon', shield: 'Shield', armor: 'Armor', helm: 'Helm', charm: 'Charm' };

  D.RAR = [
    { n: 'Common', c: '#b9b2a3', m: 1, af: 0 },
    { n: 'Fine', c: '#58c765', m: 1.25, af: 0 },
    { n: 'Rare', c: '#4aa3f0', m: 1.55, af: 1 },
    { n: 'Epic', c: '#b06cf0', m: 1.9, af: 2 },
    { n: 'Legendary', c: '#f6b82d', m: 2.4, af: 2 },
  ];

  D.COLORS = [
    { n: 'Crimson', c: '#d2412b' }, { n: 'Azure', c: '#2f78c4' }, { n: 'Emerald', c: '#2a9d6f' },
    { n: 'Violet', c: '#7b4fb8' }, { n: 'Saffron', c: '#e0a41b' }, { n: 'Onyx', c: '#3d3b46' },
  ];
  D.SKIN = ['#f6d3b0', '#e8b583', '#c98a52', '#9a6234', '#6b4224', '#f0c9a0'];
  D.HAIR = ['#1b1210', '#4a2c17', '#8a5a2b', '#d9a21b', '#b5472b', '#6b6b73'];
  D.PLUME = ['#d2412b', '#f6b82d', '#2f78c4', '#2a9d6f', '#7b4fb8', '#f5ead2', '#e8742a'];

  // Five styles. Each beats two and loses to two (the pentagon).
  D.STYLES = {
    murmillo: {
      id: 'murmillo', n: 'Murmillo', role: 'Bulwark', c: '#2f78c4', sig: 'shieldbash',
      d: 'Tower shield, steady sword. Walls off Raiders and Duelists.',
      mul: { hp: 1.02, atk: 0.95, def: 1.02, spd: 0.9, crit: 0.9, eva: 0.7 },
      base: { str: 11, agi: 7, end: 14, skl: 9, wil: 11 }, beats: ['thraex', 'dimachaerus'],
    },
    retiarius: {
      id: 'retiarius', n: 'Retiarius', role: 'Trapper', c: '#22a58f', sig: 'netthrow',
      d: 'Net and trident. Tangles slow Bulwarks and out-reaches Lancers.',
      mul: { hp: 1.08, atk: 1.1, def: 0.95, spd: 1.1, crit: 1, eva: 1.15 },
      base: { str: 8, agi: 12, end: 9, skl: 13, wil: 10 }, beats: ['murmillo', 'hoplomachus'],
    },
    thraex: {
      id: 'thraex', n: 'Thraex', role: 'Raider', c: '#e0742a', sig: 'flurry',
      d: 'Quick curved blade. Dodges nets and slips inside spears.',
      mul: { hp: 1.06, atk: 1.15, def: 0.95, spd: 1.12, crit: 1.22, eva: 1.1 },
      base: { str: 10, agi: 14, end: 8, skl: 12, wil: 9 }, beats: ['retiarius', 'hoplomachus'],
    },
    hoplomachus: {
      id: 'hoplomachus', n: 'Hoplomachus', role: 'Lancer', c: '#b8892a', sig: 'lunge',
      d: 'Long spear, round shield. Keeps Duelists at bay and cracks Bulwarks.',
      mul: { hp: 1.08, atk: 1.14, def: 1.02, spd: 1, crit: 1, eva: 0.9 },
      base: { str: 13, agi: 9, end: 11, skl: 11, wil: 9 }, beats: ['dimachaerus', 'murmillo'],
    },
    dimachaerus: {
      id: 'dimachaerus', n: 'Dimachaerus', role: 'Duelist', c: '#c2395f', sig: 'crossslash',
      d: 'Two blades, no shield. Shreds nets and Raiders, bounces off armor.',
      mul: { hp: 0.97, atk: 1.07, def: 0.82, spd: 1.05, crit: 1.15, eva: 1 },
      base: { str: 13, agi: 12, end: 7, skl: 11, wil: 9 }, beats: ['retiarius', 'thraex'],
    },
  };
  D.STYLE_IDS = Object.keys(D.STYLES);

  // tg: enemy | enemies | self | team
  D.TECHS = {
    shieldbash: { n: 'Shield Bash', cd: 9, tg: 'enemy', mult: 0.9, stun: 1.6, d: 'Slam them: 90% damage and stun for 1.6s.' },
    netthrow: { n: 'Net Throw', cd: 10, tg: 'enemy', mult: 0.5, slow: { f: 0.5, t: 5 }, netted: 5, d: 'Tangle: target is slowed and easier to hit for 5s.' },
    flurry: { n: 'Flurry', cd: 8, tg: 'enemy', mult: 0.55, hits: 3, d: 'Three quick cuts at 55% each.' },
    lunge: { n: 'Spear Lunge', cd: 9, tg: 'enemy', mult: 1.7, ignore: 0.5, d: 'Piercing thrust: 170% damage, ignores half the armor.' },
    crossslash: { n: 'Cross Slash', cd: 8, tg: 'enemy', mult: 0.85, hits: 2, crit: 0.3, d: 'Two blades, +30% crit chance.' },
    secondwind: { n: 'Second Wind', cd: 22, tg: 'self', heal: 0.28, d: 'Catch your breath: heal 28% HP.' },
    taunt: { n: 'Taunt', cd: 14, tg: 'self', taunt: 4, guard: { f: 0.3, t: 4 }, d: 'Draw every attack for 4s and take 30% less.' },
    dirtkick: { n: 'Dirt Kick', cd: 9, tg: 'enemy', mult: 0.2, blind: 4, d: 'Blind the target for 4s: 40% of their swings miss.' },
    frenzy: { n: 'Blood Frenzy', cd: 16, tg: 'self', frenzy: { atk: 0.4, def: -0.2, t: 6 }, d: '+40% damage, -20% armor for 6s.' },
    guardup: { n: 'Guard Up', cd: 11, tg: 'self', guard: { f: 0.6, t: 3 }, d: 'Block 60% of all damage for 3s.' },
    rally: { n: 'Rally Cry', cd: 16, tg: 'team', rally: { spd: 0.2, t: 6 }, d: 'The whole team acts 20% faster for 6s.' },
    whirl: { n: 'Whirlwind', cd: 13, tg: 'enemies', mult: 0.65, d: 'Hit every enemy for 65% damage.' },
    finisher: { n: 'Finisher', cd: 11, tg: 'enemy', mult: 1.1, exec: { th: 0.4, m: 2.2 }, d: '110% damage, 220% when the target is under 40% HP.' },
  };
  D.TECH_POOL = ['secondwind', 'taunt', 'dirtkick', 'frenzy', 'guardup', 'rally', 'whirl', 'finisher'];

  D.TRAITS = {
    showman: { n: 'Showman', d: '+25% fame from fights', fame: 0.25 },
    quick: { n: 'Quick Learner', d: '+25% training gains', train: 0.25 },
    ironjaw: { n: 'Iron Jaw', d: '+10% HP', hp: 0.1 },
    hothead: { n: 'Hothead', d: '+10% damage, -5% armor', atk: 0.1, def: -0.05 },
    coolhead: { n: 'Cool Head', d: '+8% crit chance', crit: 0.08 },
    frugal: { n: 'Frugal', d: 'Half the weekly upkeep', upkeep: -0.5 },
    bloodlust: { n: 'Bloodlust', d: 'Crits cause bleeding', bleedcrit: 1 },
    lucky: { n: 'Lucky', d: 'Better loot from wins', luck: 0.08 },
    hordearius: { n: 'Hordearius', d: 'Barley-fed: +15 energy back every week', regen: 15 },
    underdog: { n: 'Underdog', d: '+15% damage vs. styles that beat them', underdog: 0.15 },
    grudge: { n: 'Grudge', d: '+20% damage vs. rivals who beat you before', grudge: 0.2 },
    tireless: { n: 'Tireless', d: 'Training costs 20% less energy', tire: 0.2 },
  };
  D.TRAIT_IDS = Object.keys(D.TRAITS);

  D.AFFIX = {
    bleed: { n: 'Serrated', slots: ['weapon', 'charm'], d: v => `${v * 15}% chance to cause bleeding` },
    vamp: { n: 'Vampiric', slots: ['weapon', 'charm', 'armor'], d: v => `Heal ${v * 4}% of damage dealt` },
    exec: { n: 'Executioner', slots: ['weapon', 'helm'], d: v => `+${v * 8}% damage to targets under 35% HP` },
    fury: { n: 'Furious', slots: ['weapon', 'armor'], d: v => `Up to +${v * 10}% damage as HP drops` },
    riposte: { n: 'Riposte', slots: ['shield', 'weapon'], d: v => `${v * 8}% chance to counter-strike` },
    thorns: { n: 'Thorned', slots: ['shield', 'armor'], d: v => `Reflect ${v * 5}% of damage taken` },
    plated: { n: 'Plated', slots: ['shield', 'armor', 'helm'], d: v => `+${v * 4}% armor` },
    stalwart: { n: 'Stalwart', slots: ['shield', 'armor', 'charm'], d: () => 'Survive one killing blow per fight' },
    fleet: { n: 'Fleet', slots: ['helm', 'charm', 'armor'], d: v => `+${v * 4}% speed` },
    lucky: { n: 'Keen', slots: ['helm', 'charm', 'weapon'], d: v => `+${v * 3}% crit chance` },
    showy: { n: 'Showy', slots: ['helm', 'charm', 'armor'], d: v => `+${v * 10}% fame` },
    frenzy: { n: "Berserker's", slots: ['weapon', 'charm', 'helm'], d: v => `Each hit gives +${v * 3}% attack speed (stacks 8x)` },
    sear: { n: 'Sunfire', slots: ['armor', 'shield', 'charm'], d: v => `Burn enemies within reach for ${v * 5}% damage/s` },
    shield: { n: 'Aegis', slots: ['shield', 'armor', 'helm'], d: v => `Start fights with a ${v * 8}% HP shield` },
    regen: { n: "Troll's", slots: ['armor', 'charm', 'helm'], d: v => `Regenerate ${(v * 0.25).toFixed(2)}% HP per second` },
    haste: { n: 'Chrono', slots: ['helm', 'charm', 'weapon'], d: v => `Skills and ultimates ${v * 6}% faster` },
    pen: { n: 'Piercing', slots: ['weapon', 'helm'], d: v => `Ignore ${v * 8}% of enemy armor` },
    sprint: { n: 'Phantom', slots: ['armor', 'charm', 'helm'], d: v => `Hits give +${v * 12}% move speed briefly` },
    thunder: { n: 'Stormcaller', slots: ['weapon', 'charm'], d: v => `Every 3rd hit calls lightning (${v * 30}% damage)` },
    grow: { n: 'Hungering', slots: ['weapon', 'armor'], d: v => `Each hit permanently adds +${(v * 0.6).toFixed(1)}% damage this fight` },
  };
  D.AFFIX_IDS = Object.keys(D.AFFIX);
  D.RANGE = { murmillo: 1.5, retiarius: 2.7, thraex: 1.4, hoplomachus: 2.9, dimachaerus: 1.3 };
  D.STYLE_ULT = { murmillo: 'pulverize', retiarius: 'hookshot', thraex: 'bladedance', hoplomachus: 'skewer', dimachaerus: 'tornado' };

  // Set bonuses use the same keys as affixes plus hp/atk/def/spd/crit/eva fractions.
  D.SETS = {
    mars: { n: 'Mars', c: '#d2412b', two: { atk: 0.08 }, four: { atk: 0.1, crit: 0.05 }, d2: '+8% damage', d4: '+10% damage, +5% crit' },
    minerva: { n: 'Minerva', c: '#4aa3f0', two: { crit: 0.06 }, four: { crit: 0.08, eva: 0.05 }, d2: '+6% crit', d4: '+8% crit, +5% evasion' },
    neptune: { n: 'Neptune', c: '#22b5a0', two: { spd: 0.08 }, four: { spd: 0.08, eva: 0.06 }, d2: '+8% speed', d4: '+8% speed, +6% evasion' },
    vulcan: { n: 'Vulcan', c: '#e0742a', two: { bleed: 1 }, four: { bleed: 1, atk: 0.06 }, d2: 'Bleed chance', d4: 'More bleeding, +6% damage' },
    pluto: { n: 'Pluto', c: '#8c5cc8', two: { vamp: 1 }, four: { vamp: 1, hp: 0.1 }, d2: 'Lifesteal', d4: 'More lifesteal, +10% HP' },
    titan: { n: 'Titan', c: '#b8892a', two: { hp: 0.1 }, four: { def: 0.1, hp: 0.1 }, d2: '+10% HP', d4: '+10% armor, +10% HP' },
  };
  D.SET_IDS = Object.keys(D.SETS);

  D.BASES = {
    weapon: ['Gladius', 'Falchion', 'Mace', 'Hand Axe', 'Short Pike', 'Sica'],
    shield: ['Buckler', 'Scutum', 'Aspis', 'Targe', 'Kite Guard'],
    armor: ['Leathers', 'Cuirass', 'Scale Mail', 'Manica Wrap', 'Bronze Plate'],
    helm: ['Cap', 'Galea', 'Visor', 'Crested Helm', 'Skullcap'],
    charm: ['Amulet', 'Laurel Ring', 'Totem', 'Talisman', 'Lucky Bean'],
  };
  D.ADJ = [
    ['Worn', 'Plain', 'Scuffed', 'Sandy'], ['Sturdy', 'Honed', 'Polished', 'Trusty'],
    ['Veteran\'s', 'Gleaming', 'Arena', 'Provincial'], ['Champion\'s', 'Roaring', 'Blessed', 'Imperial'],
    ['Godslayer\'s', 'Eternal', 'Legend\'s', 'Sunforged'],
  ];

  // Roman-ish names, gladiatrices included.
  D.FIRST = ['Marcus', 'Titus', 'Lucius', 'Gaius', 'Brutus', 'Cassius', 'Decimus', 'Felix', 'Gnaeus', 'Horatius', 'Julian', 'Livius', 'Maximus', 'Nero', 'Octavian', 'Publius', 'Quintus', 'Remus', 'Sextus', 'Tiberius', 'Valens', 'Varro', 'Zeno', 'Atticus', 'Cato', 'Draco', 'Fabian', 'Rufus', 'Aurelia', 'Camilla', 'Dolabella', 'Flavia', 'Julia', 'Livia', 'Lucilla', 'Marcia', 'Nyx', 'Octavia', 'Portia', 'Sabina', 'Tullia', 'Valeria', 'Xanthe', 'Zenobia'];
  D.NICK = ['the Hammer', 'Ironjaw', 'the Wolf', 'Quickblade', 'the Bull', 'Stonewall', 'the Viper', 'Sandstorm', 'the Heron', 'the Chickpea', 'Lentil Lion', 'Barley Bear', 'the Ghost', 'Redhand', 'the Anvil', 'Swiftfoot', 'the Fig', 'Thunder', 'the Mule', 'Goldtooth'];
  D.LUDI = ['Ludus Rubrum', 'House of Cassian', 'The Iron Pit', 'Capua Cats', 'Vesuvian Burners', 'Ostia Eels', 'Ludus Magnus', 'Black Lion School', 'Gate of Mars', 'The Golden Net', 'Tarentum Tigers', 'Ravenna Rams', 'Pompeii Pride', 'The Salt Road', 'Syracuse Sun', 'Thracian Hawks', 'Ludus Aureus', 'Brundisium Bulls', 'Mount Aetna Crew', 'Lugdunum Lynxes', 'Carthage Corsairs', 'Alexandria Asps', 'Delphi Drakes', 'Ephesus Eagles', 'Cirta Cobras', 'Athens Owls', 'Mediolanum Mules', 'Londinium Ravens', 'Palmyra Pillars', 'Antioch Anvils', 'Corinth Crows', 'Rome Royal Guard'];

  D.LEAGUES = [
    { id: 0, n: 'The Pit', c: '#c98a52', fame: 0, lvl: 1, purse: 40, fameWin: 6, maxB: 2, d: 'Sand, sweat, and local crowds.' },
    { id: 1, n: 'Provincial Games', c: '#4aa3f0', fame: 120, lvl: 6, purse: 120, fameWin: 18, maxB: 3, d: 'Governors watch from the shade.' },
    { id: 2, n: 'The Colosseum', c: '#d2412b', fame: 500, lvl: 13, purse: 340, fameWin: 50, maxB: 4, d: 'Fifty thousand voices.' },
    { id: 3, n: 'Imperial Games', c: '#f6b82d', fame: 1800, lvl: 22, purse: 1000, fameWin: 140, maxB: 5, d: 'The Emperor himself is watching.' },
  ];
  D.DIFF = [{ n: 'Easy', m: 0.7, l: -1, p: 0.85 }, { n: 'Even', m: 1, l: 1, p: 1 }, { n: 'Hard', m: 1.7, l: 3, p: 1.2 }];

  D.MENUS = [
    { id: 'barley', n: 'Barley Porridge', c: 0, k: 0, d: 'Plain hordearii fuel (gladiators were nicknamed "barley men"). No bonus.', bon: {} },
    { id: 'chickpea', n: 'Chickpea Stew', c: 6, k: 1, d: '+20% STR and END training.', bon: { str: 0.2, end: 0.2 } },
    { id: 'fig', n: 'Fig & Date Bowl', c: 9, k: 2, d: '+20% AGI and SKL training, +morale.', bon: { agi: 0.2, skl: 0.2 }, mo: 6 },
    { id: 'lentil', n: 'Lentil Feast', c: 14, k: 3, d: '+15% all training, +energy.', bon: { all: 0.15 }, en: 8 },
    { id: 'hero', n: "Hero's Banquet", c: 24, k: 4, d: '+30% all training, +energy, +morale.', bon: { all: 0.3 }, en: 12, mo: 8 },
  ];

  // v: effect value per level (index = level). like: neighbours that give a +synergy.
  D.BUILD = {
    barracks: { n: 'Barracks', c0: 90, fame: 0, like: ['kitchen', 'bath'], syn: false, v: [0, 3, 5, 7, 9, 12], f: v => `${v} beds for gladiators` },
    palaestra: { n: 'Palaestra', c0: 80, fame: 0, like: ['infirmary', 'kitchen'], syn: true, v: [0, 0.15, 0.3, 0.45, 0.6, 0.8], f: v => `+${Math.round(v * 100)}% training gains` },
    kitchen: { n: 'Kitchen', c0: 70, fame: 0, like: ['market', 'barracks'], syn: false, v: [0, 1, 2, 3, 4, 4], f: v => `Plant-based menu tier ${v}` },
    bath: { n: 'Bath House', c0: 110, fame: 15, like: ['infirmary', 'shrine'], syn: true, v: [0, 12, 22, 32, 42, 55], f: v => `Resting restores +${Math.round(v)} energy` },
    infirmary: { n: 'Infirmary', c0: 130, fame: 25, like: ['bath', 'barracks'], syn: true, v: [0, 1, 1, 2, 2, 3], f: v => `Heals ${1 + Math.floor(v)} injury weeks/week, fewer injuries` },
    forge: { n: 'Forge', c0: 150, fame: 40, like: ['market', 'stands'], syn: false, v: [0, 2, 3, 4, 5, 6], f: v => `Upgrade gear to +${v}, armory +${v * 4} slots` },
    market: { n: 'Market', c0: 140, fame: 55, like: ['kitchen', 'stands'], syn: true, v: [0, 15, 35, 60, 95, 150], f: v => `+${Math.round(v)} gold/week, cheaper shop` },
    scout: { n: 'Scout Tower', c0: 160, fame: 70, like: ['stands', 'market'], syn: false, v: [0, 1, 2, 3, 3, 3], f: (v, l) => `Scouting level ${v}, see ${D.look(l)} weeks ahead` },
    sparring: { n: 'Sparring Ring', c0: 170, fame: 100, like: ['palaestra', 'stands'], syn: true, v: [0, 8, 14, 22, 32, 45], f: v => `Spar activity: ${Math.round(v)} XP/week and team bonds` },
    stands: { n: 'Stands', c0: 220, fame: 160, like: ['market', 'scout'], syn: true, v: [0, 0.1, 0.2, 0.3, 0.42, 0.6], f: v => `+${Math.round(v * 100)}% prize gold and fame` },
    shrine: { n: 'Shrine', c0: 260, fame: 240, like: ['hall', 'bath'], syn: true, v: [0, 0.05, 0.1, 0.15, 0.2, 0.3], f: v => `+${Math.round(v * 100)}% loot luck, weekly fame` },
    hall: { n: 'Hall of Legends', c0: 320, fame: 400, like: ['shrine', 'stands'], syn: false, v: [0, 1, 2, 3, 4, 6], f: v => `${v} legend statue slots` },
  };
  D.BUILD_IDS = Object.keys(D.BUILD);
  D.BMULT = [0, 1, 2.4, 5.5, 12, 26];
  D.look = l => [1, 2, 2, 3, 4, 5, 6][l] || 2;
  D.RLEVELCAP = [2, 3, 4, 5]; // building level cap by league

  // MOVE: rearranging the ludus (rules in core/ext.js, section MOVE). Nothing here is a counter mechanic: moving costs gold and a short downtime, nothing else.
  D.MOVE = {
    pinned: { hall: 'The Hall of Legends is built around consecrated statues and the memorial. It cannot be moved.' },   // buildings that stay where they are
    big: ['stands', 'sparring'],        // crowd-facing, arena-side buildings: heavy timber and stone, x1.4 price
    bigMult: 1.4, lv5Mult: 1.5,         // level 5 buildings: marble and masons, x1.5
    rate: 0.07,                         // of the gold invested in the building (all levels), per step of distance factor
    swapRate: 0.4,                      // a swap costs 40% of both moves together and one week less downtime for each
    undoRefund: 0.75,                   // undo in the same week returns 75% of the price
    minGold: 20,
  };

  D.ACTS = [
    { id: 'str', n: 'Train STR', t: 'train', s: 'str' }, { id: 'agi', n: 'Train AGI', t: 'train', s: 'agi' },
    { id: 'end', n: 'Train END', t: 'train', s: 'end' }, { id: 'skl', n: 'Train SKL', t: 'train', s: 'skl' },
    { id: 'wil', n: 'Train HRT', t: 'train', s: 'wil' },
    { id: 'rest', n: 'Rest', t: 'rest' }, { id: 'spar', n: 'Spar', t: 'spar' }, { id: 'work', n: 'Odd Jobs', t: 'work' },
    { id: 'spy', n: 'Spy', t: 'spy' },
  ];

  // pair/tri synergies for team fights
  D.SYN = [
    { need: ['murmillo', 'hoplomachus'], n: 'Phalanx', d: '+12% armor', fx: { def: 0.12 } },
    { need: ['retiarius', 'dimachaerus'], n: 'Snare & Slash', d: '+10% crit', fx: { crit: 0.1 } },
    { need: ['thraex', 'thraex'], n: 'Twin Hawks', d: '+12% speed', fx: { spd: 0.12 } },
    { need: ['murmillo', 'retiarius'], n: 'Gatekeepers', d: '+10% HP', fx: { hp: 0.1 } },
    { need: ['thraex', 'dimachaerus'], n: 'Blade Storm', d: '+10% damage', fx: { atk: 0.1 } },
    { need: ['hoplomachus', 'retiarius'], n: 'Reach & Ruin', d: '+8% damage, +5% evasion', fx: { atk: 0.08, eva: 0.05 } },
    { need: ['murmillo', 'thraex'], n: 'Shield & Shadow', d: '+8% HP, +6% speed', fx: { hp: 0.08, spd: 0.06 } },
    { need: ['hoplomachus', 'dimachaerus'], n: 'Spear & Fang', d: '+12% damage', fx: { atk: 0.12 } },
    { need: ['retiarius', 'thraex'], n: 'Hunters', d: '+8% crit, +4% evasion', fx: { crit: 0.08, eva: 0.04 } },
  ];

  D.CONTRACT = [
    { id: 'win', t: (n) => `Win ${n} fights`, n: [3, 5, 8] },
    { id: 'winstyle', t: (n, s) => `Win ${n} fights with a ${D.STYLES[s].n}`, n: [2, 3] },
    { id: 'tourney', t: () => 'Win a tournament', n: [1] },
    { id: 'upset', t: (n) => `Win ${n} fight${n > 1 ? 's' : ''} as the underdog (odds under 40%)`, n: [1, 2] },
    { id: 'mercy', t: (n) => `Show mercy to ${n} beaten foes`, n: [2, 3] },
    { id: 'level', t: (n) => `Get a gladiator to level ${n}`, n: [0] },
    { id: 'merge', t: (n) => `Forge ${n} item${n > 1 ? 's' : ''} at the Forge tab`, n: [1, 2] },
    { id: 'epic', t: () => 'Own an Epic or better item', n: [1] },
    { id: 'team', t: (n) => `Win ${n} team clash${n > 1 ? 'es' : ''}`, n: [1] },
  ];

  D.PERKS = [
    { id: 'gold', n: "Patricians' Purse", d: '+10% gold from fights', max: 10 },
    { id: 'train', n: 'Master Trainers', d: '+8% training gains', max: 10 },
    { id: 'eye', n: 'Keen Eye', d: 'Better recruits', max: 5 },
    { id: 'luck', n: 'Fortune', d: '+5% loot luck', max: 5 },
    { id: 'start', n: 'Head Start', d: '+150 starting gold, +1 free level on Barracks', max: 5 },
  ];


  D.TRICKS = [
    { id: 'bribe', n: 'Bribe their physician', d: 'Rival has 12% less max HP.', cost: (l) => 40 + l * 4, risk: 0.25, foe: { hp: -0.12 } },
    { id: 'straps', n: 'Loosen their straps', d: 'Rival armor -10%.', cost: (l) => 30 + l * 3, risk: 0.15, foe: { def: -0.1 } },
    { id: 'rally', n: 'Pep rally', d: 'You: +6% damage and armor. Safe.', cost: (l) => 20 + l * 2, risk: 0, me: { atk: 0.06, def: 0.06 } },
  ];


  // Ultimates: fired by the player (tap the big buttons). rng = max cast range in meters.
  D.ULTS = {
    pulverize: { n: 'Pulverize', cd: 16, d: 'Slam the sand: every enemy nearby is knocked up for 1.1s and takes 100% damage.', c: '#2f78c4' },
    hookshot: { n: 'Hookshot', cd: 14, rng: 10, d: 'Hurl the chain: yank the target to you and stun them for 1s.', c: '#22a58f' },
    bladedance: { n: 'Blade Dance', cd: 14, rng: 8, d: 'Dash through the target, untouchable, slashing everything near the landing.', c: '#e0742a' },
    skewer: { n: 'Skewer', cd: 14, rng: 11, d: 'Hurl your spear through a line of enemies: 180% damage and slows them.', c: '#b8892a' },
    tornado: { n: 'Blade Tornado', cd: 20, d: 'Spin for 3s, shredding everything around you. Immune to crowd control.', c: '#c2395f' },
    unbreakable: { n: 'Unbreakable Will', cd: 24, d: 'For 6s take 70% less damage and shake off all crowd control. Castable while stunned.', c: '#7b4fb8' },
    bloodrage: { n: 'Bloodrage', cd: 20, d: 'For 6s: +60% attack speed, +15% lifesteal, immune to crowd control.', c: '#d2412b' },
    meteor: { n: 'Meteor Strike', cd: 20, rng: 12, d: 'Call a meteor on the target spot: 300% damage and a 1s stun after a short delay.', c: '#e8742a' },
    duststorm: { n: 'Dust Storm', cd: 22, d: 'Blind and slow every enemy for 4s.', c: '#c98a52' },
  };
  D.ULT2 = ['unbreakable', 'bloodrage', 'meteor', 'duststorm'];

  // Runes: one keystone + two minors per gladiator. Dynamic effects live in arena.js; fx = static bonuses.
  D.KEYSTONES = {
    lethal: { n: 'Lethal Tempo', d: 'Each hit grants +6% attack speed (6 stacks). At full stacks you also run 12% faster.', c: '#e0742a' },
    conq: { n: 'Conqueror', d: 'Each hit grants +2.5% damage (8 stacks). At full stacks heal 6% of damage dealt.', c: '#d2412b' },
    electro: { n: 'Electrocute', d: '3 hits within 3s trigger a lightning burst worth 120% damage (every 7s).', c: '#4aa3f0' },
    grasp: { n: 'Grasp of the Undying', d: 'Every 5s your next hit deals 2% of their max HP, heals you 1.5% and grows your max HP.', c: '#2a9d6f' },
    phase: { n: 'Phase Rush', d: '3 hits within 3s give +35% move speed and +40% attack speed for 3s (every 4s).', c: '#22b5a0' },
    first: { n: 'First Strike', d: 'Your first hit on each enemy deals +120% damage, all hits +5%. Win bonus: +10% gold.', c: '#f6b82d' },
  };
  D.MINORS = {
    coup: { n: 'Coup de Grace', d: '+8% damage to enemies under 40% HP.' },
    laststand: { n: 'Last Stand', d: 'Up to +12% damage as your own HP drops.' },
    celerity: { n: 'Celerity', d: '+4% attack speed and move speed.' },
    overgrowth: { n: 'Overgrowth', d: '+3% max HP.', fx: { hp: 0.03 } },
    gather: { n: 'Gathering Storm', d: '+1% damage every 5s of the fight (max 6%).' },
    cosmic: { n: 'Cosmic Insight', d: 'Ultimates and skills cool down 8% faster.' },
    nimbus: { n: 'Nimbus Cloak', d: 'Casting an ultimate gives +25% move speed for 3s.' },
    bone: { n: 'Bone Plating', d: 'After 3s without taking damage, the next hit is reduced by 25%.' },
  };
  D.RUNE_START = { k: ['lethal', 'conq'], m: ['coup', 'laststand', 'celerity', 'overgrowth'] };

  // Masteries: permanent passives picked at levels 5, 10, 15 and 20.
  D.MASTS = {
    brute: { n: 'Brute Force', d: '+6% damage', fx: { atk: 0.06 } },
    tough: { n: 'Tough Hide', d: '+8% max HP', fx: { hp: 0.08 } },
    swift: { n: 'Swift Hands', d: '+5% speed', fx: { spd: 0.05 } },
    keen: { n: 'Keen Eye', d: '+4% crit chance', fx: { crit: 0.04 } },
    plate: { n: 'Plated Training', d: '+6% armor', fx: { def: 0.06 } },
    leech: { n: 'Leech', d: 'Heal 4% of damage dealt', fx: { vamp: 1 } },
    tactician: { n: 'Tactician', d: 'Skills and ultimates 6% faster', fx: { haste: 1 } },
    thorny: { n: 'Thorn Mail', d: 'Reflect 6% of damage taken', fx: { thorns: 1 } },
    fencer: { n: 'Fencer', d: '8% chance to counter-strike', fx: { riposte: 1 } },
    oath: { n: 'Iron Oath', d: 'Survive one killing blow per fight', fx: { stalwart: 1 } },
    sprinter: { n: 'Sprinter', d: 'Hits give +12% move speed briefly', fx: { sprint: 1 } },
    reaper: { n: 'Reaper', d: '+8% damage to targets under 35% HP', fx: { exec: 1 } },
  };

  // Augments (ARAM Mayhem style): pick 1 of 3 before fights. tier 0 silver, 1 gold, 2 prismatic.
  D.TIERS = [{ n: 'Silver', c: '#b9c4cf' }, { n: 'Gold', c: '#f6b82d' }, { n: 'Prismatic', c: '#d070ff' }];
  D.AUGMENTS = [
    { id: 'iron', t: 0, n: 'Iron Skin', d: '+12% armor', syn: { def: 0.12 } },
    { id: 'edge', t: 0, n: 'Sharpened Edge', d: '+12% damage', syn: { atk: 0.12 } },
    { id: 'bull', t: 0, n: "Bull's Heart", d: '+10% max HP', syn: { hp: 0.1 } },
    { id: 'sandals', t: 0, n: 'Swift Sandals', d: '+10% speed', syn: { spd: 0.1 } },
    { id: 'hawk', t: 0, n: 'Hawk Eye', d: '+8% crit chance', syn: { crit: 0.08 } },
    { id: 'shadow', t: 0, n: 'Shadow Step', d: '+8% evasion', syn: { eva: 0.08 } },
    { id: 'regen', t: 0, n: 'Regeneration', d: 'Heal 0.5% HP per second', xfx: { regen: 2 } },
    { id: 'thirst', t: 0, n: 'Bloodthirst', d: 'Heal 8% of damage dealt', xfx: { vamp: 2 } },
    { id: 'spikes', t: 0, n: 'Spiked Armor', d: 'Reflect 10% of damage taken', xfx: { thorns: 2 } },
    { id: 'rip', t: 0, n: 'Riposte Training', d: '16% chance to counter-strike', xfx: { riposte: 2 } },
    { id: 'serr', t: 0, n: 'Serrated Edge', d: '30% chance to cause bleeding', xfx: { bleed: 2 } },
    { id: 'oath', t: 0, n: 'Stalwart Oath', d: 'Survive one killing blow', xfx: { stalwart: 1 } },
    { id: 'study', t: 0, n: 'Quick Study', d: 'Skills and ultimates 12% faster', xfx: { haste: 2 } },
    { id: 'aegis', t: 0, n: 'Aegis', d: 'Start with a 16% HP shield', xfx: { shield: 2 } },
    { id: 'warm', t: 0, n: 'Warm-up', d: 'Hits give +3% attack speed (stacks)', xfx: { frenzy: 1 } },
    { id: 'berserk', t: 1, n: 'Berserker Training', d: 'Hits give +6% attack speed (stacks 8x)', xfx: { frenzy: 2 } },
    { id: 'exec', t: 1, n: 'Executioner', d: '+24% damage to targets under 35% HP', xfx: { exec: 3 } },
    { id: 'glass', t: 1, n: 'Glass Cannon', d: '+40% damage, -15% max HP', syn: { atk: 0.4, hp: -0.15 } },
    { id: 'jugg', t: 1, n: 'Juggernaut', d: '+20% max HP, +10% armor, -10% speed', syn: { hp: 0.2, def: 0.1, spd: -0.1 } },
    { id: 'fire', t: 1, n: 'Firebrand', d: 'Burn nearby enemies for 10% damage/s', xfx: { sear: 2 } },
    { id: 'giant', t: 1, n: 'Giant Slayer', d: '+20% damage to enemies with more max HP', xfx: { giant: 2 } },
    { id: 'thunder', t: 1, n: 'Thunderlord', d: 'Every 3rd hit calls lightning (70%)', xfx: { thunder: 2 } },
    { id: 'pen', t: 1, n: 'Armor Piercer', d: 'Ignore 24% of enemy armor', xfx: { pen: 3 } },
    { id: 'phantom', t: 1, n: 'Phantom Dance', d: 'Hits give +36% move speed, +10% speed', syn: { spd: 0.1 }, xfx: { sprint: 3 } },
    { id: 'breath', t: 1, n: 'Last Breath', d: 'Under 30% HP: +40% attack speed, heal 10%', xfx: { lastbreath: 1 } },
    { id: 'hunger', t: 1, n: 'Hungering', d: 'Each hit permanently adds +1.2% damage (this fight)', xfx: { grow: 2 } },
    { id: 'aim', t: 1, n: 'Deadly Aim', d: '+5% crit chance, crits hit 30% harder', syn: { crit: 0.05 }, xfx: { critdmg: 2 } },
    { id: 'urf', t: 2, n: 'Urf Mode', d: 'Skills and ultimates cool down 70% faster', xfx: { haste: 5, ultcd: 3 } },
    { id: 'phoenix', t: 2, n: 'Phoenix', d: 'Rise once from death with 20% HP.', xfx: { revive: 1 } },
    { id: 'ascend', t: 2, n: 'Ascension', d: '+12% damage, +12% HP, +7% speed', syn: { atk: 0.12, hp: 0.12, spd: 0.07 } },
    { id: 'invinc', t: 2, n: 'Invincible', d: 'Shield, regeneration and a second life', xfx: { stalwart: 1, shield: 2, regen: 2 } },
    { id: 'titan', t: 2, n: 'Titanic Hunger', d: '+20% HP and heal 8% of damage dealt', syn: { hp: 0.2 }, xfx: { vamp: 2 } },
    { id: 'storm', t: 2, n: 'Storm Lord', d: 'Frenzy stacks and thunder on every 3rd hit', xfx: { thunder: 2, frenzy: 2 } },
    { id: 'final', t: 2, n: 'Final Form', d: 'Deal +9% more damage every 5s of the fight', xfx: { ramp: 3 } },
  ];

  // Relics: ludus-wide artifacts, equipped on every fighter. Slots come from the Shrine.
  D.RELICS = [
    { id: 'laurel', n: 'Laurel of Sol', d: '+6% damage for everyone', syn: { atk: 0.06 }, c: '#f6b82d' },
    { id: 'aegis', n: 'Aegis of Minerva', d: '+8% armor and a 8% HP shield', syn: { def: 0.08 }, xfx: { shield: 1 }, c: '#4aa3f0' },
    { id: 'chrono', n: 'Hourglass of Chronos', d: 'Skills and ultimates 12% faster', xfx: { haste: 2 }, c: '#b06cf0' },
    { id: 'mercury', n: 'Sandals of Mercury', d: '+8% speed', syn: { spd: 0.08 }, c: '#22b5a0' },
    { id: 'fortune', n: 'Coin of Fortuna', d: '+12% gold from fights', gold: 0.12, c: '#c98a1a' },
    { id: 'hydra', n: "Vulcan's Brand", d: 'Burn nearby enemies', xfx: { sear: 1 }, c: '#e8742a' },
    { id: 'fang', n: 'Fang of Lupa', d: 'Heal 4% of damage dealt', xfx: { vamp: 1 }, c: '#c2395f' },
    { id: 'feather', n: 'Phoenix Feather', d: 'Rise once per fight with 10% HP', xfx: { revive: 0.5 }, c: '#ff8a3d' },
    { id: 'crown', n: 'Crown of Thorns', d: 'Reflect 12% of damage taken', xfx: { thorns: 2 }, c: '#2a9d6f' },
    { id: 'ember', n: 'Ember of Mars', d: 'Hits give +3% attack speed (stacks)', xfx: { frenzy: 1 }, c: '#d2412b' },
    { id: 'storm', n: "Jupiter's Bolt", d: 'Every 3rd hit calls lightning', xfx: { thunder: 1 }, c: '#7fc4ff' },
    { id: 'titan', n: 'Heart of the Titan', d: '+8% max HP, regenerate HP', syn: { hp: 0.08 }, xfx: { regen: 1 }, c: '#8c5cc8' },
  ];


  // Factions: reputation 0..100 each, perks at 25/50/75/100. Gains come from how you win.
  D.FACTIONS = {
    sen: { n: 'The Senate', c: '#7b4fb8', want: 'Show mercy, win tournaments, play fair (no caught tricks).', perks: ['+5% fame', 'One more relic slot', '+10% fame', '+40 gold per week'] },
    mer: { n: 'The Merchants', c: '#c98a1a', want: 'Showboat, win your bets, keep the coin flowing.', perks: ['Shop prices -5%', '+10% fight gold', 'Better bookmaker payouts', '+60 gold per week'] },
    ple: { n: 'The Plebs', c: '#d2412b', want: 'Upsets, big crits and spectacular fights.', perks: ['Crowd hype builds 15% faster', 'Ultimates start 3s charged', 'Two free augment rerolls', '+8% damage while the crowd roars'] },
  };

  D.FESTIVALS = [
    { id: 'mars', n: 'Festival of Mars', d: '+25% fame from fights this week.', c: '#d2412b' },
    { id: 'saturn', n: 'Saturnalia', d: 'Shop prices -20% and no upkeep this week.', c: '#2a9d6f' },
    { id: 'ceres', n: 'Harvest Feast', d: 'Free menu this week and everyone recovers +10 energy.', c: '#c98a1a' },
    { id: 'jupiter', n: 'Imperial Visit', d: '+30% prize gold from fights this week.', c: '#f6b82d' },
    { id: 'minerva', n: 'Rites of Minerva', d: 'Training gains +15% this week.', c: '#3b7dd8' },
    { id: 'bacchus', n: 'Games of Bacchus', d: 'The crowd roars 30% sooner this week.', c: '#7b4fb8' },
  ];
  D.BARKS = {
    murmillo: ['FOR ROME!', 'HOLD THE LINE!', 'SHIELDS UP!'], retiarius: ['CAUGHT YOU!', 'INTO THE NET!', 'NOWHERE TO RUN!'],
    thraex: ['TOO SLOW!', 'CATCH ME!', 'BLINK AND DIE!'], hoplomachus: ['KEEP BACK!', 'THE SPEAR FINDS YOU!', 'HAH!'], dimachaerus: ['NO MERCY!', 'CUT THEM DOWN!', 'TWO BLADES!'],
  };
  // Trophies: earned once, paid once. r = reward.
  D.TROPHIES = [
    { id: 'first', n: 'First Blood', d: 'Win a fight.', r: { gold: 30 } },
    { id: 'wins10', n: 'Crowd Pleaser', d: 'Win 10 fights.', r: { gold: 120 } },
    { id: 'wins50', n: 'Fifty Fights', d: 'Win 50 fights.', r: { gold: 500, laurels: 1 } },
    { id: 'champ', n: 'Champion', d: 'Win a tournament.', r: { gold: 150, fame: 20 } },
    { id: 'champ5', n: 'Dynasty', d: 'Win 5 tournaments.', r: { gold: 600, laurels: 2 } },
    { id: 'imperial', n: 'Emperor\'s Favorite', d: 'Win the Imperial Games.', r: { gold: 2000, laurels: 3 } },
    { id: 'mercy5', n: 'Merciful', d: 'Show mercy 5 times.', r: { fame: 30 } },
    { id: 'upset', n: 'Giant Killer', d: 'Win as the underdog (odds under 40%).', r: { gold: 100 } },
    { id: 'upset5', n: 'Against All Odds', d: 'Win 5 times as the underdog.', r: { gold: 400, laurels: 1 } },
    { id: 'team', n: 'Brothers in Arms', d: 'Win a team clash.', r: { gold: 120 } },
    { id: 'pit5', n: 'Pit Delver', d: 'Reach Pit floor 5.', r: { gold: 150 } },
    { id: 'pit10', n: 'Pit Lord', d: 'Reach Pit floor 10.', r: { gold: 500, laurels: 1 } },
    { id: 'daily5', n: 'Daily Grind', d: 'Reach floor 5 in a Daily Descent.', r: { gold: 150 } },
    { id: 'legendary', n: 'Legendary Find', d: 'Own a Legendary item.', r: { gold: 300 } },
    { id: 'fullset', n: 'Matching Set', d: 'Wear a 4-piece set.', r: { gold: 200 } },
    { id: 'forge5', n: 'Master Smith', d: 'Forge 5 items.', r: { gold: 200 } },
    { id: 'rich', n: 'Denarii Dragon', d: 'Hold 5000 gold.', r: { fame: 40 } },
    { id: 'lvl20', n: 'Veteran', d: 'Get a gladiator to level 20.', r: { gold: 400, laurels: 1 } },
    { id: 'legend1', n: 'Hall of Fame', d: 'Retire a gladiator as a legend.', r: { gold: 150 } },
    { id: 'runes', n: 'Rune Scholar', d: 'Unlock every keystone rune.', r: { gold: 300 } },
    { id: 'relics6', n: 'Relic Hoarder', d: 'Own 6 relics.', r: { gold: 300, laurels: 1 } },
    { id: 'faction', n: 'Beloved', d: 'Max out any faction.', r: { gold: 400, laurels: 1 } },
    { id: 'festwin', n: 'Festive Fighter', d: 'Win during a festival week.', r: { gold: 100 } },
    { id: 'bouts', n: 'Settled It In The Sand', d: 'Settle a rivalry with a friendly bout.', r: { gold: 80, fame: 10 } },
    { id: 'ascended', n: 'New Dynasty', d: 'Found a new ludus.', r: { laurels: 2 } },
  ];

  // Pit mutators: both sides get the same twist (no counters, just a different fight).
  D.MUTATORS = [
    { id: 'glass', n: 'Glass Cannons', d: 'Everyone deals +40% damage and has 30% less HP.', syn: { atk: 0.4, hp: -0.3 } },
    { id: 'giants', n: 'Giants', d: 'Everyone has 50% more HP but moves 15% slower.', syn: { hp: 0.5, spd: -0.15 } },
    { id: 'bloodrush', n: 'Bloodrush', d: 'Everyone gains attack speed with every hit.', xfx: { frenzy: 3 } },
    { id: 'overclock', n: 'Overclocked', d: 'Skills and ultimates recharge 3x as fast.', xfx: { haste: 8, ultcd: 4 } },
    { id: 'thornfield', n: 'Thornfield', d: 'Everyone reflects 18% of damage taken.', xfx: { thorns: 3 } },
    { id: 'ironclad', n: 'Ironclad', d: 'Everyone has +40% armor and a 16% HP shield.', syn: { def: 0.4 }, xfx: { shield: 2 } },
  ];

  D.WEATHER = {
    clear: { n: 'Clear skies', d: 'No effect.' },
    rain: { n: 'Rain', d: 'Slippery sand: everyone is 10% slower.', syn: { spd: -0.1 } },
    dust: { n: 'Dust storm', d: 'Squinting fighters dodge and miss more (+10% evasion).', syn: { eva: 0.1 } },
    heat: { n: 'Scorching heat', d: 'Tempers flare: everyone deals +10% damage.', syn: { atk: 0.1 } },
    night: { n: 'Torchlit night', d: 'Dramatic shadows: +6% crit chance for everyone.', syn: { crit: 0.06 } },
  };
  D.STORIES = [
    { id: 'freed', n: 'Freedman', text: 'Born in chains, this fighter wants freedom.', goal: { k: 'wins', n: 8 }, rew: { title: 'the Freedman', stat: 'wil', v: 6, fame: 20 } },
    { id: 'deserter', n: 'Deserter', text: 'A deserter proving courage to the crowd.', goal: { k: 'wins', n: 6 }, rew: { title: 'the Steadfast', stat: 'end', v: 6, fame: 15 } },
    { id: 'noble', n: 'Fallen Noble', text: 'Wants the family name back through fame.', goal: { k: 'fame', n: 60 }, rew: { title: 'the Patrician', stat: 'skl', v: 6, fame: 30 } },
    { id: 'farmhand', n: 'Farmhand', text: 'Strong from the fields, hungry to master the blade.', goal: { k: 'lvl', n: 6 }, rew: { title: 'the Ploughman', stat: 'str', v: 6, fame: 10 } },
    { id: 'thief', n: 'Street Thief', text: 'Quick hands, quicker feet, looking for a big score.', goal: { k: 'wins', n: 5 }, rew: { title: 'the Shadow', stat: 'agi', v: 6, fame: 10 } },
    { id: 'priest', n: 'Lapsed Priest', text: "Seeks glory worth the gods' attention.", goal: { k: 'lvl', n: 8 }, rew: { title: 'the Devout', stat: 'wil', v: 7, fame: 25 } },
    { id: 'orphan', n: 'Orphan', text: 'Fights to be remembered.', goal: { k: 'fame', n: 40 }, rew: { title: 'the Remembered', stat: 'agi', v: 5, fame: 20 } },
    { id: 'veteran', n: 'Old Veteran', text: 'One last great season.', goal: { k: 'wins', n: 10 }, rew: { title: 'the Unbroken', stat: 'str', v: 7, fame: 25 } },
  ];
  D.DUOS = {
    pincer: { n: 'Pincer Strike', d: 'Both dash onto the target: 140% damage each and a 1s stun.', c: '#22a58f', cd: 28 },
    wall: { n: 'Phalanx Wall', d: 'Both take 50% less damage for 5s and shrug off crowd control. One taunts.', c: '#2f78c4', cd: 28 },
    storm: { n: 'Twin Storm', d: 'Both enter a 5s frenzy (+60% attack speed, lifesteal) and shred everything nearby.', c: '#c2395f', cd: 28 },
  };
  D.CHANTS = ['MAX-I-MUS!', 'BLOOD! BLOOD!', 'AVE! AVE!', 'FIGHT! FIGHT!', 'HAIL THE VICTOR!', 'ROAR! ROAR!'];
  D.DEEDS = [
    { id: 'w10', n: 'Crowd Pleaser', st: 'wil', ok: (g) => g.rec.w >= 10 }, { id: 'w25', n: 'the Unbroken', st: 'end', ok: (g) => g.rec.w >= 25 && g.rec.l <= 3 },
    { id: 'f300', n: 'Arena Darling', st: 'agi', ok: (g) => g.fame >= 300 }, { id: 'l15', n: 'Old Iron', st: 'str', ok: (g) => g.lvl >= 15 }, { id: 'w50', n: 'the Legend', st: 'str', ok: (g) => g.rec.w >= 50 },
  ];
  D.CHAMP_TAUNT = { murmillo: 'Break against my shield!', retiarius: 'Tangled before you even start!', thraex: 'Quick blades, quick graves.', hoplomachus: 'My spear finds every gap.', dimachaerus: 'Two swords and no mercy.' };
  D.DIFF_N = ['Relaxed', 'Standard', 'Brutal'];
  // ===================================================================== WAVE 2: wounds, scars, patrons, the event deck
  // Wounds: a fighter can carry several (g.wounds). g.inj stays the longest remaining wound in weeks, so every old screen keeps working.
  // k = weeks multiplier on the fight's base injury (1 to 3 weeks); sc = scar chance before treatment and Infirmary; weak = lingering penalty after it closes.
  // Mods use derived-stat keys: hp atk def spd are multipliers (+0.05 = +5%), crit and eva are additive.
  D.WOUNDS = {
    gash: { n: 'Deep gash', where: 'flesh', k: 0.7, sc: 0.1, w: 3.0, weak: {}, scar: 'gash_scar', d: 'A long cut that bleeds a good deal and means little.' },
    ribs: { n: 'Cracked ribs', where: 'torso', k: 1.0, sc: 0.12, w: 2.0, weak: { hp: -0.08 }, scar: 'old_ribs', d: 'Every breath is a negotiation. Takes the wind out of a man for a while after.' },
    arm: { n: 'Broken arm', where: 'arm', k: 1.6, sc: 0.22, w: 1.3, weak: { atk: -0.08 }, scar: 'stiff_arm', d: 'The sword arm. Heals slowly and never entirely forgets.' },
    knee: { n: 'Torn knee', where: 'leg', k: 1.8, sc: 0.25, w: 1.2, weak: { spd: -0.08, eva: -0.02 }, scar: 'bad_knee', d: 'A bad twist in the sand. Footwork suffers long after the swelling goes.' },
    head: { n: 'Concussion', where: 'head', k: 1.0, sc: 0.18, w: 1.0, weak: { crit: -0.03, eva: -0.03 }, scar: 'ringing', d: 'The world rings and tilts. Ears and balance come back slowly.' },
    eye: { n: 'Eye gouged', where: 'eye', k: 2.2, sc: 0.55, w: 0.35, weak: { crit: -0.04 }, scar: 'lost_eye', d: 'A trident, a thumb, a bad angle. The eye may not return.' },
  };
  D.WOUND_IDS = Object.keys(D.WOUNDS);
  // Scars are permanent and always cost something. g.scars is a list of these ids (max 5). Rendering hints for rig.js/gladiator.js are in look.
  D.SCARS = {
    gash_scar: { n: 'Fearsome gash', part: 'face', mods: { eva: -0.02 }, fame: 0.06, look: { where: 'face', kind: 'slash', side: 'left' }, d: 'A white line across the face. The crowd loves it. Blood gets in the eyes.' },
    old_ribs: { n: 'Old ribs', part: 'torso', mods: { hp: -0.05, atk: 0.03 }, fame: 0, look: { where: 'torso', kind: 'welt' }, d: 'Breathes shallow, hits hard. Cannot take as much.' },
    stiff_arm: { n: 'Stiff arm', part: 'arm', mods: { atk: -0.05, def: 0.04 }, fame: 0, look: { where: 'arm', kind: 'wrap', side: 'right' }, d: 'The swing is shorter. The guard is better.' },
    bad_knee: { n: 'Bad knee', part: 'leg', mods: { spd: -0.06, def: 0.03 }, fame: 0, look: { where: 'leg', kind: 'brace', side: 'left' }, d: 'A limp that settles in. Plants his feet and does not give ground.' },
    ringing: { n: 'Ringing skull', part: 'head', mods: { hp: 0.05, eva: -0.03 }, fame: 0, look: { where: 'head', kind: 'dent' }, d: 'Hard head, soft balance.' },
    lost_eye: { n: 'Lost eye', part: 'eye', mods: { atk: 0.04, eva: -0.05, crit: -0.02 }, fame: 0.04, look: { where: 'eye', kind: 'patch', side: 'left' }, d: 'Fights wilder because he must. Misjudges distance. The crowd remembers him.' },
    burn: { n: 'Burn scars', part: 'skin', mods: { def: -0.03 }, fame: 0.04, look: { where: 'arm', kind: 'burn', side: 'right' }, d: 'Tight shiny skin that tears easily. People stare.' },
    whip: { n: 'Whip marks', part: 'back', mods: { spd: -0.02, atk: 0.03 }, fame: 0, look: { where: 'back', kind: 'lash' }, d: 'Old lashes. He fights as if he owes the world a debt.' },
  };
  // Treatment plans. mult scales the scar chance, wk is the immediate change in weeks (negative heals), cost = base + per league.
  D.TREATS = {
    ease: { n: 'Light duty', c: [0, 0], d: 'The default. Heals at the Infirmary rate; the fighter potters about the yard.' },
    rest: { n: 'Strict bed rest', c: [0, 0], d: 'Heals one extra week every week, but boredom costs 3 morale a week. Scar risk x0.8.' },
    pou: { n: 'Poultice', c: [20, 10], d: '60% to save a week. Scar risk x0.85.' },
    doc: { n: 'Physician', c: [60, 25], d: 'Saves two weeks. Scar risk x0.45.' },
    surg: { n: 'Surgeon', c: [120, 45], d: 'Only for long wounds (4+ weeks). Saves a week and cuts scar risk to x0.12, but one time in four it goes wrong: +2 weeks, -10 morale and scar risk x1.5.' },
  };

  // ---------- patrons ----------
  // Each patron wants different things. sid keys S.spons.rel / done. demand kinds: wins, appear, style, nodeath, winrate, spare.
  D.SPONSORS = {
    wine: { n: 'Vinarius & Sons', who: 'Marcus Vinarius', role: 'Wine merchant', col: '#8a2a52', fame: 0, perk: 'Free wine: +2 morale to every fighter each week.', pers: 'Genial and loud. He pays on the nail and expects the crowd to roar his name.',
      kinds: ['appear', 'wins'], pay: 1.0, pen: 'fame', ending: 'The amphora painter has your fighters on every stopper in the district.' },
    senator: { n: 'House of Valerius', who: 'Senator Gaius Valerius Corvus', role: 'Senator', col: '#5a4a9a', fame: 60, perk: 'The Senate\'s ear: +2 Senate standing each week.', pers: 'Cold, exact, never raises his voice. Wants a clean arena and a winning one.',
      kinds: ['winrate', 'nodeath'], pay: 1.35, pen: 'sen', ending: 'He lists your school among the "respectable houses" in his speeches.' },
    temple: { n: 'Temple of Mars', who: 'Livia, Priestess of Mars', role: 'Temple', col: '#b8863a', fame: 30, perk: 'Temple healers: every wound heals one extra week each week.', pers: 'Calm, watchful, hard to impress. Asks for mercy and measures you by how you give it.',
      kinds: ['spare', 'nodeath'], pay: 0.8, pen: 'rel', ending: 'The temple lamps burn for your fallen.' },
    smith: { n: 'Guild of Smiths', who: 'Brennus Ironhand', role: 'Smith guild', col: '#3a7a8a', fame: 90, perk: 'Guild steel: every successful contract also pays a piece of gear.', pers: 'Blunt, proud of his iron. Wants his steel seen in the hands of a particular kind of fighter.',
      kinds: ['style', 'wins'], pay: 0.9, pen: 'gold', ending: 'Your sword hands never lack for steel.' },
    veil: { n: 'The Veiled Partner', who: 'A veiled voice', role: 'Silent partner of a rival', col: '#4a4a52', fame: 160, perk: 'Rival ledgers: scouting +1 level while the contract lasts.', pers: 'No name, no face, good coin. Partner of one of your rival lanistae, and plays both sides of the sand.',
      kinds: ['appear', 'winrate'], pay: 1.6, pen: 'ludi', ending: 'Nobody can say who paid, and nobody asks.' },
  };
  D.SPONSOR_IDS = Object.keys(D.SPONSORS);
  // Story beats, shown one per contract, in order. Choices use the event ops (see LM.applyFx).
  D.SPBEATS = {
    wine: [
      { tx: 'Vinarius sends a cart of his second-best amphorae to the barracks with a note: "For the men\'s courage. Drink the third one first." The cook has already started.',
        c: [{ l: 'Share it round', fx: [['mo', 8], ['en', -5], ['sp', 4]] }, { l: 'Lock it up for feast days', fx: [['mo', 2], ['sp', -2]] }] },
      { tx: 'Vinarius wants {who} painted on his stoppers, mid-lunge. He will pay for the likeness. {who} has opinions about the painter\'s idea of his nose.',
        c: [{ l: 'Agree to the portrait', fx: [['gold', 30, 40], ['fame', 4, 4], ['sp', 4]] }, { l: 'Refuse politely', fx: [['moW', 6], ['sp', -4]] }] },
      { tx: 'Over a cup of his best, Vinarius confides that a senator\'s wife is his silent investor and would enjoy a private demonstration. He says it as a man mentions the weather.',
        c: [{ l: 'Provide the demonstration', fx: [['gold', 50, 60], ['enW', -20], ['sp', 5]] }, { l: 'Keep clear of it', fx: [['fame', 3, 3], ['sp', -3]] }] },
    ],
    senator: [
      { tx: 'The Senator\'s litter stops at your gate. He does not step out. His secretary reads from a tablet: the Senator hopes for clean games and quiet streets.',
        c: [{ l: 'Assure him', fx: [['fac', 'sen', 3], ['sp', 3]] }, { l: 'Remind him of the price', fx: [['gold', 20, 30], ['sp', -2]] }] },
      { tx: 'A rival senator has insulted Corvus at the baths. He would like a gladiator seen at his side tomorrow, looking dangerous. {who} would do.',
        c: [{ l: 'Lend {who} for the day', fx: [['enW', -15], ['fame', 8, 8], ['sp', 6]] }, { l: 'Refuse. They are fighters, not footmen', fx: [['moW', 5], ['sp', -5]] }] },
      { tx: 'Corvus stands for aedile this year. He needs the next games to be spectacular and says so without saying how much he expects you to spend on it.',
        c: [{ l: 'Promise a spectacle (spend)', cost: [50, 60], fx: [['fame', 14, 12], ['sp', 6], ['fac', 'sen', 4]] }, { l: 'Promise only your best effort', fx: [['sp', -1]] }] },
    ],
    temple: [
      { tx: 'Livia walks the yard with a sprig of laurel, touching nothing. She asks, quietly, whether any man here has made his peace.',
        c: [{ l: 'Let her bless the men', fx: [['mo', 8], ['sp', 3]] }, { l: 'Decline. They have work to do', fx: [['sp', -3]] }] },
      { tx: 'Livia asks that the next beaten foe be spared, for reasons she keeps in her sleeve. The crowd is fond of the other answer.',
        c: [{ l: 'Agree to show mercy', fx: [['flag', 'mercy_pledge'], ['sp', 5], ['fame', 5, 6]] }, { l: 'Promise nothing', fx: [['sp', -4]] }] },
      { tx: 'The temple roof leaks and the god is not pleased. Livia suggests, with enormous tact, that a share of the sand\'s winnings would please him.',
        c: [{ l: 'Donate', cost: [40, 60], fx: [['fame', 12, 10], ['mo', 4], ['sp', 6]] }, { l: 'Offer prayers instead', fx: [['sp', -2]] }] },
    ],
    smith: [
      { tx: 'Brennus drops a crate of rejected blades at your gate. "Seconds," he says. "Better than most schools\' firsts." He does not smile, which you take to be a joke.',
        c: [{ l: 'Take the crate', fx: [['item', 0], ['sp', 3]] }, { l: 'Send them back with thanks', fx: [['sp', -1]] }] },
      { tx: 'Brennus has a new alloy and wants it tested in a real yard. Hand {who} the sword and watch. If it breaks, he says, you owe nothing. He does not say what happens to the man holding it.',
        c: [{ l: 'Test it on {who}', fx: [['chance', 0.7, [['gold', 40, 50], ['sp', 5]], [['hurt', 'arm', 1], ['sp', 1]]]] }, { l: 'Decline the test', fx: [['sp', -2]] }] },
      { tx: 'The Guild offers to forge your best man a set to his measure. Every plate will bear the Guild\'s mark. Brennus says it is a compliment. It is also an advertisement.',
        c: [{ l: 'Accept the mark', fx: [['item', 1], ['mo', 3], ['sp', 6]] }, { l: 'Refuse the mark', fx: [['sp', -4]] }] },
    ],
    veil: [
      { tx: 'A sealed tablet arrives: "You do well. Do better. A friend." It smells of the same perfume as a letter you once saw in a rival\'s yard.',
        c: [{ l: 'Burn it unread', fx: [['sp', -4]] }, { l: 'Keep it', fx: [['sp', 2], ['flag', 'veil_read']] }] },
      { tx: 'The Veiled Partner asks you to keep {who} out of the sand for a week. No reason is given. The purse for resting him is excellent and your conscience would be quiet for most of it.',
        c: [{ l: 'Take the purse', fx: [['gold', 60, 80], ['fame', -6, -3], ['sp', 5], ['flag', 'veil_dirty']] }, { l: 'Refuse', fx: [['sp', -8], ['fame', 4, 4]] }] },
      { tx: 'A boy in livery delivers a last tablet. The Veiled Partner is a partner of {rival} and has been reading both ledgers. "No hard feelings," it reads. There are, naturally, hard feelings.',
        c: [{ l: 'Expose them in the forum', fx: [['fame', 20, 20], ['ludi', -15], ['sp', -100]] }, { l: 'Use what you learned', fx: [['gold', 60, 80], ['sp', -6]] }] },
    ],
  };

  // ---------- the event deck ----------
  // Declarative so tests can walk every outcome. An event: {id, n, tag, wk (earliest week), cd (cooldown in weeks), w (weight), if (condition ids), who (picker), t (text), c: choices}
  // A choice: {l (label), h (risk hint), cost: [base, perLeague], if, o: [outcomes]}; an outcome: {p (probability or probability fn id), r (result text), fx: [ops]}; the last one has no p.
  // Ops are listed in LM.applyFx (ext.js). Text tokens: {who} {rival} {champ} {pat} {fallen}. Gold amounts are [base, perLeague].
  // `follow` events never roll on their own, they are queued by a ['q', id, weeks] op, and their text says nothing about luck so a chain reads as consequences.
  const E = (e) => e;
  D.EVDECK = [
    // ---- chain: plague rumour
    E({ id: 'plague_rumour', n: 'A plague rumour', tag: 'omen', wk: 5, cd: 24, w: 0.9, if: ['nf:plague'], t: 'A carter swears the sickness is loose in the port quarter. Half the street is already boiling vinegar and the other half is selling it.',
      c: [{ l: 'Shut the gates for a week', h: 'Costs gold. The men grumble, nobody coughs.', cost: [20, 20], o: [{ r: 'The gates stay shut. The fighters sulk in the yard, but the rumour has to go and bother someone else.', fx: [['mo', -4], ['flag', 'quarantine'], ['q', 'plague_passes', 2]] }] },
        { l: 'Burn herbs and pray', h: 'Cheap. About three times in four it calms the street.', cost: [10, 10], o: [{ p: 0.7, r: 'The smoke drifts over the wall and the neighbours decide you are devout. Nobody falls ill.', fx: [['fame', 5, 3], ['q', 'plague_passes', 2]] }, { r: 'The smoke stings the eyes and calms no one.', fx: [['mo', -2], ['q', 'plague_strikes', 2]] }] },
        { l: 'Ignore the gossip', h: 'Free. Even odds it goes away.', o: [{ p: 0.5, r: 'Nothing comes of it. The carter sells his vinegar elsewhere.', fx: [['q', 'plague_passes', 2]] }, { r: 'You shrug. The shrug will be remembered.', fx: [['q', 'plague_strikes', 2]] }] }] }),
    E({ id: 'plague_strikes', n: 'The cough arrives', tag: 'omen', follow: true, who: 'any', t: 'The cough has reached the barracks. {who} and two others are sweating through their blankets, and the cook has gone very quiet.',
      c: [{ l: 'Call the physician', h: 'Costs gold. The fever breaks in a few days.', cost: [40, 35], o: [{ r: 'The physician burns the straw, opens the shutters and bills you. The fever breaks in three days.', fx: [['mo', -3]] }] },
        { l: 'Shut the sick away', h: 'Free, but the barracks runs thin for two weeks.', o: [{ r: 'The sick are shut in the east cell. Two weeks of coughing through the wall.', fx: [['status', 'plague', 2], ['hurt', 'ribs', 1]] }] },
        { l: 'Pray and carry on', h: 'Free. Even odds it spreads for three weeks.', o: [{ p: 0.5, r: 'The sickness sweeps the barracks and takes three weeks to leave. {who} is worst hit.', fx: [['status', 'plague', 3], ['hurt', 'ribs', 2]] }, { r: 'The fever passes by itself, as fevers sometimes do. The men look at you strangely.', fx: [['mo', -3]] }] }] }),
    E({ id: 'plague_passes', n: 'The rumour dies', tag: 'omen', follow: true, t: 'The rumour burns itself out. The port quarter buries its dead and goes back to haggling. Your ludus stayed clean, and the neighbours noticed.',
      c: [{ l: 'Take the credit', o: [{ r: 'The street tells the story kindly. Your school becomes the one that kept its head.', fx: [['fame', 8, 6], ['mo', 2]] }] }] }),
    // ---- chain: the runaway plot
    E({ id: 'runaway_whisper', n: 'A rope on the east wall', tag: 'plot', wk: 6, cd: 20, w: 1.0, if: ['unhappy', 'two', 'nf:plot'], who: 'worst', t: '{who} was seen at night near the east wall with two men from another school. The talk, says the cook, is of a rope and a dark moon.',
      c: [{ l: 'Speak to {who} kindly', h: 'Free. More often than not it works.', o: [{ p: 0.6, r: '{who} admits the plan and drops it. Loyalty is a thing you earn, not a thing you own.', fx: [['moW', 15], ['bond', 6]] }, { r: '{who} says nothing. You do not believe the silence.', fx: [['moW', 4], ['flag', 'plot'], ['q', 'runaway_night', 1]] }] },
        { l: 'Double the guard', h: 'Costs gold. The men notice they are watched.', cost: [20, 15], o: [{ r: 'The wall is watched. {who} notices. So does everyone.', fx: [['moW', -10], ['flag', 'guarded'], ['flag', 'plot'], ['q', 'runaway_night', 1]] }] },
        { l: 'Pretend not to see', h: 'Free. Something will happen next week.', o: [{ r: 'You choose not to see it. The moon will be dark in a week.', fx: [['flag', 'plot'], ['q', 'runaway_night', 1]] }] }] }),
    E({ id: 'runaway_night', n: 'Over the wall', tag: 'plot', follow: true, who: 'plot', t: 'The rope comes down the east wall at the third hour. {who} is standing under it, with a sack and the look of a man who has already decided.',
      c: [{ l: 'Stand in the way', h: 'Better odds if you posted a guard.', o: [{ p: 'pguard', r: 'You hold the lamp and the silence. {who} comes back inside, ashamed, and nobody says a word about it.', fx: [['moW', 4], ['fame', 3, 2], ['clear', 'guarded']] }, { r: 'A scuffle in the dark. {who} gets over the wall and is gone. Someone is bleeding.', fx: [['hurt', 'any', 1], ['desert', 'run'], ['clear', 'guarded']] }] },
        { l: 'Open the gate for {who}', h: 'A free man leaves. The others watch what you do.', o: [{ r: 'You walk {who} to the gate yourself. A man leaves with his name, which is more than most do. The yard says nothing, and thinks about it for weeks.', fx: [['desert', 'free'], ['fame', 8, 6], ['mo', 4], ['clear', 'guarded']] }] },
        { l: 'Raise the alarm', h: 'The ludus closes ranks. Someone may be hurt.', o: [{ p: 0.6, r: 'The yard turns out with torches. {who} sits down in the dust and weeps with fury. It ends without blood.', fx: [['moW', -8], ['bond', 4], ['clear', 'guarded']] }, { r: 'The yard turns out with torches and clubs. {who} is dragged back, bruised and silent.', fx: [['hurt', 'any', 1, 1], ['moW', -14], ['clear', 'guarded']] }] }] }),
    E({ id: 'runaway_return', n: 'A free man at the gate', tag: 'plot', follow: true, t: '{who} stands at the gate in a clean tunic with a small purse and a larger smile. He has a stall in the forum, a wife, and a debt he has not forgotten.',
      c: [{ l: 'Welcome him', o: [{ r: '{who} leaves the purse on the table and teaches the novices a trick or two in the yard. The yard notes that a man can leave and come back with his head up.', fx: [['gold', 40, 70], ['xp', 25], ['fame', 4, 3]] }] }] }),
    // ---- chain: the visiting champion
    E({ id: 'champion_arrives', n: 'A visiting champion', tag: 'rival', wk: 8, cd: 30, w: 0.9, if: ['lvl4'], who: 'best', t: '{champ}, a champion of the provinces with a laurel and a limp, is touring the schools. He will test any man you name, for the price of a polite bow.',
      c: [{ l: 'Name {who}', h: 'Your best. The odds follow his level.', o: [{ p: 'pchamp', r: '{who} holds the sand and the champion salutes him first. A fine afternoon.', fx: [['xp', 40], ['fame', 12, 10], ['moW', 10], ['q', 'champion_praise', 3]] }, { r: '{who} is put down in the third exchange. The champion helps him to his feet, which stings more.', fx: [['xp', 25], ['moW', -10], ['hurt', 'any', 1, 0.5], ['q', 'champion_rematch', 4]] }] },
        { l: 'Name your youngest', h: 'Poor odds. Plenty to learn.', o: [{ p: 0.2, r: 'The boy lands one clean blow and the yard erupts. {champ} bows to him with a straight face.', fx: [['xpYoung', 60], ['fame', 8, 6]] }, { r: 'The youngster is knocked flat twice and learns more than in a month.', fx: [['xpYoung', 50]] }] },
        { l: 'Decline with thanks', h: 'Safe. The crowd is a little disappointed.', o: [{ r: 'The champion shrugs and goes on to the next yard. By evening he is already a story told by someone else.', fx: [['fame', -3, 0]] }] }] }),
    E({ id: 'champion_rematch', n: 'The champion returns', tag: 'rival', follow: true, who: 'best', t: '{champ} is back and wants a second look at {who}. Pride is a tax on the foolish, but a rematch is a ticket the crowd will pay for.',
      c: [{ l: 'Accept the rematch', h: 'Better odds than last time.', o: [{ p: 'pchamp2', r: '{who} gives the champion all he can carry. The crowd chants his name.', fx: [['fame', 14, 12], ['gold', 30, 50], ['moW', 12]] }, { r: '{who} loses again, less badly. The champion writes his name on a tablet and says it is a reminder.', fx: [['xp', 30], ['moW', -4]] }] }, { l: 'Wave the challenge away', o: [{ r: 'Some questions you let stand.', fx: [['fame', -2, 0]] }] }] }),
    E({ id: 'champion_praise', n: 'Praise from the baths', tag: 'rival', follow: true, who: 'best', t: 'The champion has been talking about {who} in the baths of three cities. Nothing he says is false. That is rather the point.',
      c: [{ l: 'Enjoy it', o: [{ r: 'A few more spectators than usual turn up at your gate asking for {who} by name.', fx: [['fame', 10, 12], ['gold', 20, 40]] }] }] }),
    // ---- chain: the patron's banquet
    E({ id: 'banquet_invite', n: 'A banquet at the villa', tag: 'patron', wk: 6, cd: 20, w: 1.0, if: ['fame:60'], who: 'best', t: 'Senator {pat} gives a banquet and wants a gladiator at the foot of the couches, for the guests to admire and not touch.',
      c: [{ l: 'Send {who}', h: 'Good odds. A bad evening costs standing.', o: [{ p: 0.65, r: '{who} stands motionless for five hours and is toasted by name. The Senator sends you a purse and his regards.', fx: [['gold', 60, 80], ['fame', 8, 6], ['enW', -25], ['q', 'banquet_favor', 2]] }, { r: '{who} is asked to demonstrate a thrust on a slave. He refuses. The Senator takes it badly.', fx: [['fame', -6, 0], ['fac', 'sen', -4], ['moW', -8]] }] },
        { l: 'Send wine and regrets', h: 'Costs gold. Politeness has a price.', cost: [30, 20], o: [{ r: 'The Senator\'s steward accepts the wine with the faint air of a man receiving a dead bird.', fx: [['fac', 'sen', 3]] }] },
        { l: 'Decline', o: [{ r: 'The invitation goes to another school. Rome notes it.', fx: [['fac', 'sen', -2]] }] }] }),
    E({ id: 'banquet_favor', n: 'The Senator remembers', tag: 'patron', follow: true, who: 'best', t: 'The Senator\'s steward arrives with a sealed tablet: his master remembers {who} fondly and thinks there may be an arrangement to discuss.',
      c: [{ l: 'Read the tablet', o: [{ r: 'It is a polite offer, in a firm hand. The Senator wants his name beside yours.', fx: [['gold', 20, 30], ['offer', 'senator']] }] }] }),
    // ---- chain: the rival's sabotage
    E({ id: 'sabotage_signs', n: 'The dogs stopped barking', tag: 'rival', wk: 9, cd: 18, w: 0.9, if: ['hostile'], t: 'Someone has been feeding the dogs near the armoury gate. The dogs are not barking. {rival} has friends in this street.',
      c: [{ l: 'Post a night watch', h: 'Costs gold. Stops what is coming.', cost: [20, 15], o: [{ r: 'Two men with clubs and a lamp sit up by the gate.', fx: [['flag', 'guarded2'], ['q', 'sabotage_strikes', 2]] }] },
        { l: 'Search the premises', h: 'Free. Even odds you find it first.', o: [{ p: 0.5, r: 'You find a flask of something green in the well-house and pour it into a ditch. The plan has to start again.', fx: [['fame', 3, 2], ['ludi', -6]] }, { r: 'You find nothing but a fat cat and a dislike of the cat.', fx: [['q', 'sabotage_strikes', 2]] }] },
        { l: 'Say nothing', o: [{ r: 'You say nothing. Something is going to happen.', fx: [['q', 'sabotage_strikes', 2]] }] }] }),
    E({ id: 'sabotage_strikes', n: 'Smoke at dawn', tag: 'rival', follow: true, swap: ['guarded2', 'sabotage_caught'], who: 'any', t: 'At dawn, the smell of smoke. The east storehouse is burning, and nobody is quite sure whose men were seen leaving.',
      c: [{ l: 'Save the stores', h: 'Keeps the gold. Risk of burns.', o: [{ p: 0.5, r: 'The grain and the spare gear come out singed but safe. {who} carries the last sack out with his tunic on fire.', fx: [['hurt', 'any', 2], ['scar', 'burn', 0.3], ['clear', 'guarded2']] }, { r: 'The stores are saved, the men smell of roast and nobody is badly hurt.', fx: [['mo', 2], ['clear', 'guarded2']] }] },
        { l: 'Save the men', h: 'No one is hurt. The stores are lost.', o: [{ r: 'The men are out and safe. The stores are not. The yard is grateful and the cook is quietly furious.', fx: [['gold', -50, -60], ['mo', 4], ['clear', 'guarded2']] }] }] }),
    E({ id: 'sabotage_caught', n: 'Caught in the act', tag: 'rival', follow: true, t: 'Two men with torches walk into two men with clubs. The rest of the story is shouting. The torches are of a distinctive pitch.',
      c: [{ l: 'Hand them to the magistrate', o: [{ r: 'The magistrate takes a dim view and a modest fee. Your reputation for order grows.', fx: [['fame', 8, 6], ['fac', 'sen', 2], ['ludi', -10], ['clear', 'guarded2']] }] },
        { l: 'Send them home with a message', o: [{ r: 'Two sets of broken knuckles and a clear message. The hired men do not come back.', fx: [['gold', 20, 40], ['ludi', -4], ['mo', 3], ['clear', 'guarded2']] }] }] }),
    // ---- chain: the festival bet
    E({ id: 'bet_offer', n: 'A bookmaker at the gate', tag: 'luck', wk: 4, cd: 10, w: 1.1, if: ['nf:bet'], t: 'A bookmaker with ink-black fingers sets his stool at your gate. The odds on the next games, he says, are "a gift from the gods", and he has the manner of someone who has never given a gift.',
      c: [{ l: 'A small bet', h: 'Costs gold. Even odds, pays a bit less than double.', cost: [30, 15], o: [{ r: 'He writes it in a tiny hand and takes your coin.', fx: [['bet', 1.9], ['flag', 'bet'], ['q', 'bet_result', 1]] }] },
        { l: 'A big bet', h: 'Costs a lot. Slightly worse than even odds, pays more than double.', cost: [90, 100], o: [{ r: 'The stool creaks. He writes your name twice.', fx: [['bet', 2.4], ['flag', 'bet'], ['q', 'bet_result', 1]] }] },
        { l: 'Report him to the aedile', o: [{ r: 'The aedile sends two lictors. The stool is gone by sundown and you are, briefly, respectable.', fx: [['fame', 2, 2]] }] },
        { l: 'Wave him away', o: [{ r: 'He sells his gift to another school.', fx: [] }] }] }),
    E({ id: 'bet_result', n: 'The bookmaker settles', tag: 'luck', follow: true, t: 'The bookmaker is back at your gate with his stool and his ledger. His face tells you nothing.',
      c: [{ l: 'See how it fell', o: [{ p: 0.06, r: 'The stool is empty. The bookmaker left the city at dawn with half the district\'s coin. You are not the only one.', fx: [['clear', 'bet']] }, { p: 'pbet', r: 'The ink-stained fingers count out your winnings with visible pain.', fx: [['payBet'], ['clear', 'bet']] }, { r: 'The gods were not generous. He tips his hat and takes your coin down the road.', fx: [['clear', 'bet']] }] }] }),
    // ---- one-off scenes
    E({ id: 'stray_dog', n: 'A stray in the barracks', tag: 'barracks', cd: 24, w: 0.8, who: 'any', t: 'A one-eared dog has adopted the barracks and refuses to leave. The cook says it eats more than {who}.',
      c: [{ l: 'Keep the dog', o: [{ r: 'It is named Caesar within an hour. The yard has never been so cheerful.', fx: [['mo', 5]] }] }, { l: 'Chase it off', o: [{ r: 'The dog leaves with dignity. {who} watches it go for a long while.', fx: [['moW', -3]] }] }] }),
    E({ id: 'roof_leak', n: 'The roof lets in the rain', tag: 'barracks', cd: 16, w: 0.8, t: 'Rain finds the gap in the barracks roof and sleeps in three beds.',
      c: [{ l: 'Pay a tiler', h: 'Costs gold.', cost: [30, 25], o: [{ r: 'A tiler spends a day on the roof and an hour describing the damage.', fx: [['mo', 2]] }] }, { l: 'Stuff it with rags', h: 'Free. A cold week.', o: [{ r: 'The rags hold for a night. The wind removes them by dawn.', fx: [['en', -10], ['mo', -3]] }] }] }),
    E({ id: 'graffiti', n: 'Writing on the wall', tag: 'rival', cd: 14, w: 0.9, if: ['ml:1'], t: 'Someone has painted a crude lion on your gate with {rival}\'s initials under it, and a rude word about your fighters\' mothers.',
      c: [{ l: 'Paint over it', o: [{ r: 'A quiet morning with a bucket of lime. Everyone pretends it was never there.', fx: [] }] }, { l: 'Reply in kind', h: 'Costs a little. Funny, or dangerous.', cost: [10, 5], o: [{ p: 0.5, r: 'The street laughs with you for a week. {rival} does not.', fx: [['fame', 6, 4], ['ludi', -3]] }, { r: 'Your joke is not as good as theirs. The street says so.', fx: [['fame', -3, 0], ['ludi', -6]] }] }, { l: 'Hire a poet', h: 'Costs gold. Reliable.', cost: [25, 25], o: [{ r: 'The poet writes eight lines in your favour on the same wall, in better paint.', fx: [['fame', 10, 8]] }] }] }),
    E({ id: 'widow_petition', n: 'The grey shawl', tag: 'memory', cd: 20, w: 1.0, if: ['fallen'], t: 'A woman in a grey shawl asks for the sword of {fallen}, who was her husband, her brother or her cousin, depending on how you ask.',
      c: [{ l: 'Give her the blade', o: [{ r: 'She weeps, thanks you, and leaves it at the temple of Mars. The yard hears of it and stands taller.', fx: [['fame', 6, 4], ['mo', 3]] }] },
        { l: 'Give her a purse instead', cost: [20, 20], o: [{ r: 'She counts it, nods and leaves. You feel strangely uneasy.', fx: [['fame', 2, 2]] }] },
        { l: 'Send her away', o: [{ r: 'She goes without a word. The yard remembers.', fx: [['mo', -3]] }] }] }),
    E({ id: 'tax_collector', n: 'The tax-farmer\'s clerk', tag: 'coin', wk: 6, cd: 14, w: 1.0, t: 'The tax-farmer\'s clerk arrives with a ledger and an air of apology. Your ludus has been assessed. The sum is not small.',
      c: [{ l: 'Pay in full', o: [{ r: 'The clerk bows and takes the coin. Order costs money.', fx: [['gold', -40, -60]] }] },
        { l: 'Argue the rate', h: 'Even odds of halving it. Failure is rude and costs standing.', o: [{ p: 0.45, r: 'A long afternoon and a clever phrase later, the sum is halved.', fx: [['gold', -20, -30]] }, { r: 'The clerk is unmoved, a little insulted, and takes the full sum.', fx: [['gold', -40, -60], ['fame', -2, 0]] }] },
        { l: 'Slip him a gift', h: 'Costs a little. Usually works.', cost: [15, 15], o: [{ p: 0.7, r: 'The ledger loses a page. These things happen.', fx: [] }, { r: 'The clerk is honest. This is deeply inconvenient.', fx: [['gold', -80, -100], ['fame', -4, 0]] }] }] }),
    E({ id: 'slave_trader', n: 'A trader from Capua', tag: 'coin', wk: 3, cd: 14, w: 1.0, if: ['room'], t: 'A trader from Capua has a stout young man he swears is a natural. His price drops each time he hears himself say it.',
      c: [{ l: 'Buy him', h: 'Costs gold. A fair prospect.', cost: [50, 70], o: [{ r: 'He signs the tablet, grins, and is already carrying water for the cook.', fx: [['recruit', 0, 0.6]] }] },
        { l: 'Inspect his teeth', h: 'Cheaper. Even odds of a real find.', cost: [25, 35], o: [{ p: 0.5, r: 'His teeth are good, his hands are good, and the trader is on the edge of tears.', fx: [['recruit', 1, 0.85]] }, { r: 'His teeth are fine. His left knee is not. You pass.', fx: [] }] },
        { l: 'Walk away', o: [{ r: 'The trader shrugs, and offers the same man to the next yard.', fx: [] }] }] }),
    E({ id: 'physician_visit', n: 'A Greek physician', tag: 'infirmary', cd: 10, w: 1.2, if: ['wounded'], t: 'A Greek physician in a frayed tunic offers to look at your wounded, with a bow and an unusual interest in the fees.',
      c: [{ l: 'Hire him for the week', h: 'Costs gold. Heals every wound two weeks.', cost: [30, 30], o: [{ r: 'He lances, binds and talks without stopping. By nightfall the wounded are sitting up.', fx: [['heal', 2]] }] },
        { l: 'Ask for references', h: 'Free. Even odds he is good.', o: [{ p: 0.5, r: 'His references are real. He does a quick round for the pleasure of showing off.', fx: [['heal', 1]] }, { r: 'The references are all in his own handwriting. He takes offence and leaves.', fx: [] }] },
        { l: 'Decline', o: [{ r: 'He takes the refusal with Greek courtesy.', fx: [] }] }] }),
    E({ id: 'scar_tales', n: 'Tales of old scars', tag: 'barracks', cd: 16, w: 1.0, if: ['scarred'], who: 'scarred', t: '{who} shows the novices a scar and tells a story about it. The story improves every time he tells it, and so does the scar.',
      c: [{ l: 'Let the novices listen', o: [{ r: 'The novices listen with open mouths. They learn something, though not what he thinks.', fx: [['xpYoung', 20], ['moW', 6]] }] }, { l: 'Cut it short', o: [{ r: 'The tale ends. The scar will be there tomorrow.', fx: [] }] }] }),
    E({ id: 'lanista_exchange', n: 'An exchange of yards', tag: 'rival', wk: 5, cd: 14, w: 0.9, if: ['ml:1'], who: 'healthy', t: '{rival}\'s lanista proposes an exchange: {who} in his yard for a week, one of his in yours. Both sides are suspicious of both sides.',
      c: [{ l: 'Exchange', h: 'Most of the time it goes well.', o: [{ p: 0.7, r: '{who} comes back full of ideas and ink-stained from the lanista\'s secret book of drills.', fx: [['xp', 35], ['ludi', 10]] }, { r: 'The visiting man spends a week insulting your cook. {who} returns with a black eye.', fx: [['ludi', -8], ['hurt', 'any', 1], ['xp', 15]] }] }, { l: 'Politely refuse', o: [{ r: 'Suspicion on both sides is a kind of respect.', fx: [] }] }] }),
    E({ id: 'crowd_gift', n: 'Garlands at the gate', tag: 'fame', wk: 4, cd: 12, w: 1.0, if: ['fame:40'], who: 'best', t: 'A crowd waits at the gate with garlands for {who}, who is embarrassed, and lamps for the rest of the ludus, who are not.',
      c: [{ l: 'Accept graciously', o: [{ r: '{who} wears the garland as though it were a net. The crowd cheers anyway.', fx: [['fame', 8, 10], ['moW', 8]] }] }, { l: 'Hand out bread to the crowd', h: 'Costs a little gold.', cost: [15, 15], o: [{ r: 'The bread disappears faster than the garlands. The crowd goes home happy and talking.', fx: [['fame', 14, 14], ['mo', 4]] }] }] }),
    E({ id: 'snake_barley', n: 'Adder in the sack', tag: 'barracks', cd: 20, w: 0.7, t: 'The cook finds an adder in the barley sack and a second one in his sandal. He is unwell about it.',
      c: [{ l: 'Burn the sack', h: 'Costs gold. No risk.', cost: [20, 15], o: [{ r: 'The sack burns. The cook watches in tragic silence. New barley arrives by noon.', fx: [] }] }, { l: 'Sift it carefully', h: 'Free. Some risk of a bite.', o: [{ p: 0.65, r: 'Three hours of sifting, six pieces of adder, no bites. The cook sings.', fx: [['mo', 2]] }, { r: 'The seventh adder gets {who} on the ankle. He survives, indignant.', fx: [['hurt', 'knee', 1]] }] }] }),
    E({ id: 'omen_sky', n: 'A hawk at noon', tag: 'omen', cd: 18, w: 0.9, t: 'A hawk drops a dead snake at the gate at noon. The priests argue for two hours about what this means, and the argument is more interesting than the omen.',
      c: [{ l: 'Call it good fortune', h: 'Even odds the men believe you.', o: [{ p: 0.5, r: 'The yard decides it is good fortune and acts accordingly. Spirits soar.', fx: [['fame', 8, 6], ['mo', 4]] }, { r: 'The yard decides it is bad fortune and does not much care what you say.', fx: [['mo', -4]] }] },
        { l: 'Consult a seer', h: 'Costs gold. Reliable comfort.', cost: [30, 25], o: [{ r: 'The seer reads the snake\'s entrails and finds that something good will happen soon. He says this every time.', fx: [['mo', 5], ['fame', 3, 2]] }] },
        { l: 'Ignore it', o: [{ r: 'A hawk is a hawk. The snake is removed by the cook, who finds a use for it.', fx: [] }] }] }),
    E({ id: 'armourer_offer', n: 'Seconds from Pompeii', tag: 'coin', cd: 12, w: 1.0, t: 'An armorer from Pompeii has a crate of seconds and a face that says he knows it. He has an oath for every dent.',
      c: [{ l: 'Buy the crate', h: 'Costs gold. A good chance of a decent piece.', cost: [60, 90], o: [{ r: 'There is a good piece under the rest. He does not mention it, and neither do you.', fx: [['item', 0]] }] },
        { l: 'Haggle', h: 'Free. Even odds of half price.', cost: [30, 45], o: [{ p: 0.5, r: 'He sighs, swears by three gods and halves the price. The piece is real.', fx: [['item', 0]] }, { r: 'He is wounded by the offer and leaves with his crate.', fx: [['gold', 30, 45]] }] },
        { l: 'Pass', o: [{ r: 'He wraps the crate and moves on with his dignity almost intact.', fx: [] }] }] }),
    E({ id: 'bard_ballad', n: 'A ballad about {who}', tag: 'fame', cd: 14, w: 0.9, who: 'best', t: 'A bard has composed a ballad about {who}. It is long. It rhymes "blood" with "mud" fourteen times.',
      c: [{ l: 'Pay him to sing it widely', h: 'Costs gold.', cost: [20, 20], o: [{ r: 'The ballad is sung in three taverns by Friday. {who} cannot walk down the street without being recited at.', fx: [['fame', 10, 12], ['moW', 4]] }] },
        { l: 'Let him sing for his supper', o: [{ r: 'He sings, eats, burps and leaves. The yard sings it back for a week.', fx: [['fame', 3, 3], ['mo', 3]] }] },
        { l: 'Send him off', o: [{ r: 'He leaves with dignity. The ballad grows by a verse on the way out.', fx: [] }] }] }),
    E({ id: 'captive_soldier', n: 'A captive Thracian', tag: 'coin', wk: 8, cd: 16, w: 0.8, if: ['room', 'ml:1'], t: 'A legion captain offers you a captured Thracian with an interesting temper and no prospects. He is not unkind about it.',
      c: [{ l: 'Take him on', h: 'Costs gold. A fine fighter, an awkward man.', cost: [40, 60], o: [{ r: 'He looks at the sand, at you, and at the cook, in that order, and shrugs. He is yours.', fx: [['recruit', 1, 0.7]] }] }, { l: 'Decline', o: [{ r: 'The captain leaves with his prisoner and a faint reproach.', fx: [] }] }] }),
    E({ id: 'debt_collector', n: 'A debt you forgot', tag: 'coin', wk: 5, cd: 18, w: 0.9, if: ['poor'], t: 'A man you do not remember lending you money demands it, politely at first, then the other way.',
      c: [{ l: 'Pay what you can', o: [{ r: 'He counts it twice, glares, and leaves. The debt shrinks, but your pockets feel the lighter.', fx: [['gold', -25, -30]] }] }, { l: 'Send him away', h: 'Free. He will tell the neighbours.', o: [{ p: 0.5, r: 'He leaves muttering. Nobody listens.', fx: [] }, { r: 'He tells the whole street. The street remembers.', fx: [['fame', -5, -3]] }] }] }),
    E({ id: 'young_hero', n: 'A boy at the fence', tag: 'barracks', cd: 16, w: 0.9, who: 'any', t: 'A boy of twelve has been sneaking in to watch {who}. He copies every move. Badly.',
      c: [{ l: 'Let him fetch the water', o: [{ r: 'He fetches water, copies stances and falls over. {who} starts correcting his feet without realising.', fx: [['xp', 12], ['moW', 4]] }] }, { l: 'Send him home', o: [{ r: 'He goes, looking back often. The gate is quiet.', fx: [] }] }] }),
    E({ id: 'sibling_reunion', n: 'The same village', tag: 'barracks', cd: 14, w: 0.9, if: ['two'], t: 'Two of your men have discovered they come from the same village. By evening they have discovered they come from the same grudge.',
      c: [{ l: 'Let them talk it out', h: 'It usually goes well.', o: [{ p: 0.65, r: 'A long night, a jug of wine, an embrace. The yard hears them singing in dialect.', fx: [['bond', 15]] }, { r: 'The talking turns to shoving. Nobody wins, and one limps home.', fx: [['bond', -8], ['hurt', 'any', 1]] }] }, { l: 'Keep them apart', o: [{ r: 'You put them in opposite cells. The yard knows why.', fx: [['mo', -2]] }] }] }),
    E({ id: 'freedom_petition', n: 'The price of a cap', tag: 'plot', wk: 10, cd: 30, w: 0.9, if: ['vet'], who: 'vet', t: '{who} has won more for you than he cost, and he knows it. He asks, with great care, about the price of a freedman\'s cap.',
      c: [{ l: 'Promise it at the season\'s end', h: 'He works harder. You will have to keep your word.', o: [{ r: '{who} bows lower than he has in years. He trains like a man with something to lose.', fx: [['moW', 20], ['stat', 2], ['q', 'freedom_due', 6]] }] },
        { l: 'Offer a bonus instead', h: 'Costs gold.', cost: [60, 80], o: [{ r: '{who} takes the purse and says nothing, which says it all.', fx: [['moW', 8]] }] },
        { l: 'Refuse', o: [{ r: '"The price is more than a man can pay," you say. {who} nods and walks away slowly.', fx: [['moW', -15], ['fame', -2, 0]] }] }] }),
    E({ id: 'freedom_due', n: 'The season is over', tag: 'plot', follow: true, who: 'vet', t: 'The season is over. {who} stands at your door with his cap in his hands and the same careful face.',
      c: [{ l: 'Honour the promise', o: [{ r: 'You hand over the tablet. The yard falls silent, then roars. A free man walks out of the gate to a chorus of his name.', fx: [['desert', 'free'], ['fame', 25, 15], ['mo', 6], ['q', 'runaway_return', 5]] }] },
        { l: 'Offer him a paid post as trainer', h: 'Costs gold. He stays, on better terms.', cost: [50, 70], o: [{ r: '{who} hesitates, then smiles. A wage and a title are not freedom, but they are a start.', fx: [['moW', 10], ['stat', 2], ['xpYoung', 30]] }] },
        { l: 'Find a reason to delay', o: [{ r: 'The word is out. The yard watches you and says nothing. {who} says nothing too, which is worse.', fx: [['moW', -30], ['mo', -8], ['fame', -4, 0]] }] }] }),
    E({ id: 'grain_price', n: 'Grain at the port', tag: 'coin', wk: 4, cd: 14, w: 1.0, t: 'Grain prices have doubled at the port. The cook has a tragic face and a plan, and the plan involves your money.',
      c: [{ l: 'Buy in bulk', h: 'Costs gold. The men eat well.', cost: [40, 40], o: [{ r: 'Sacks pile up in the storehouse. For once the cook is happy, which is alarming.', fx: [['mo', 3], ['en', 5]] }] }, { l: 'Short rations', h: 'Free. They will notice.', o: [{ r: 'The portions shrink. The men do not complain aloud, which is worse.', fx: [['en', -8], ['mo', -4]] }] }] }),
    E({ id: 'tremor', n: 'The ground shivers', tag: 'omen', cd: 24, w: 0.6, t: 'The ground shivers for the length of a prayer. Wine jumps off the table. The cook blames the pigeons.',
      c: [{ l: 'Gather the men in the yard', o: [{ r: 'Everyone stands out in the open, looking at the sky. Nothing happens, and it feels like a sermon.', fx: [['mo', 3]] }] }, { l: 'Sacrifice to Vulcan', h: 'Costs gold.', cost: [20, 20], o: [{ r: 'A white cockerel is offered. The god accepts with obvious indifference. The neighbours are impressed.', fx: [['fame', 6, 4], ['mo', 2]] }] }] }),
    E({ id: 'rival_poacher', n: 'Whispers at the well', tag: 'rival', wk: 6, cd: 16, w: 1.0, if: ['two', 'ml:1'], who: 'any', t: 'A well-dressed freedman is whispering to your men at the well about warmer beds and better wine. {who} is listening more than he should.',
      c: [{ l: 'Throw him out', h: 'Usually works.', o: [{ p: 0.7, r: 'The freedman leaves faster than he arrived. The yard cheers.', fx: [['mo', 2], ['fame', 2, 2]] }, { r: 'He goes, but {who} follows him with his eyes.', fx: [['moW', -8]] }] },
        { l: 'Make {who} a counter-offer', h: 'Costs gold.', cost: [30, 40], o: [{ r: '{who} counts the coin twice and decides to stay out of principle.', fx: [['moW', 12], ['bond', 3]] }] },
        { l: 'Ignore him', o: [{ p: 0.5, r: 'Nothing comes of it.', fx: [] }, { r: 'The next morning {who}\'s cot is empty and the freedman is nowhere.', fx: [['desert', 'run']] }] }] }),
    E({ id: 'merchant_cargo', n: 'A wine barge on the bank', tag: 'patron', wk: 4, cd: 24, w: 0.9, if: ['nsp:wine'], t: 'A wine barge has run aground below the Tiber bridge. Its master, a loud and likeable man, will sell cheap to anyone who can carry it before the tide turns.',
      c: [{ l: 'Send the men to carry', h: 'Some risk of a strain. Good chance of a friend.', o: [{ p: 0.7, r: 'Two hours of haul, a great deal of swearing and not one amphora lost. The master says he will remember your face.', fx: [['en', -10], ['mo', 4], ['offer', 'wine']] }, { r: 'A basket slips and {who} takes the weight on his back. Wine is saved. The back is not.', fx: [['hurt', 'ribs', 1], ['offer', 'wine']] }] },
        { l: 'Buy a few jars', cost: [15, 15], o: [{ r: 'He swears you are the only honest man on the bank. He swears the same to everyone.', fx: [['mo', 3]] }] },
        { l: 'Leave him to the tide', o: [{ r: 'The tide turns. The barge floats off, in need of a more generous tavern.', fx: [] }] }] }),
    E({ id: 'temple_dawn', n: 'A priestess at dawn', tag: 'patron', wk: 5, cd: 26, w: 0.8, if: ['nsp:temple'], t: 'A priestess of Mars arrives at dawn to bless the sand, and stays to look at your men as one appraises horses.',
      c: [{ l: 'Offer a donation', h: 'Costs gold. She remembers.', cost: [30, 30], o: [{ r: 'She accepts with a thin smile and leaves a sprig of laurel on the gate. The temple has taken notice.', fx: [['fame', 6, 4], ['offer', 'temple']] }] },
        { l: 'Let her bless the sand', o: [{ r: 'A quiet half-hour of incense and murmuring. The men stand straighter afterwards.', fx: [['mo', 4]] }] }] }),
    E({ id: 'smith_foundry', n: 'Iron in the street', tag: 'patron', wk: 6, cd: 26, w: 0.8, if: ['nsp:smith', 'fame:90'], t: 'The Guild of Smiths is hiring hands for the foundries and has noticed that your men break more swords than any school in the city. Brennus is, apparently, flattered.',
      c: [{ l: 'Talk terms', o: [{ r: 'Brennus listens for exactly as long as it takes to say a price. He has strong opinions on what hits hard.', fx: [['offer', 'smith']] }] }, { l: 'Ignore him', o: [{ r: 'He mutters at the door and goes. The sword-breaking continues.', fx: [] }] }] }),
    E({ id: 'veiled_visitor', n: 'A woman in a veil', tag: 'patron', wk: 8, cd: 30, w: 0.7, if: ['nsp:veil', 'fame:160'], t: 'A woman in a veil, with the manners of a senator\'s wife and the eyes of a bookkeeper, asks to see your ledgers. She does not give a name, and you are not asked to offer yours.',
      c: [{ l: 'Hear her out', h: 'Good coin, strange strings.', o: [{ r: 'She speaks for ten minutes and does not once say whom she works for.', fx: [['offer', 'veil']] }] }, { l: 'Show her the door', o: [{ r: 'She leaves a small coin for the doorman. It is gold.', fx: [['gold', 10, 20]] }] }] }),
    E({ id: 'mime_forum', n: 'Tales from the road', tag: 'fame', cd: 20, w: 0.7, t: 'A travelling actor does a three-minute mime of your school\'s last victory in the forum. He gets a few details wrong and the crowd likes them better.',
      c: [{ l: 'Let it spread', o: [{ r: 'By evening everyone in the street knows the new version. It is more flattering than the truth.', fx: [['fame', 6, 6]] }] }, { l: 'Correct the record', o: [{ r: 'You hunt down the actor and correct him. He is wounded. The mime stops.', fx: [] }] }] }),
    E({ id: 'wrestling_match', n: 'A wager in the yard', tag: 'barracks', cd: 12, w: 1.0, if: ['two'], who: 'healthy', t: '{who} has bet a sausage that he can outwrestle the cook\'s nephew, a boy of nineteen with the neck of a bull.',
      c: [{ l: 'Let them wrestle', h: 'Even odds, plus a sausage.', o: [{ p: 0.55, r: '{who} wins, and eats the sausage on the nephew\'s back. The yard roars.', fx: [['mo', 5], ['xp', 8]] }, { r: '{who} loses. The sausage goes to the nephew, who is gracious about it for exactly one breath.', fx: [['moW', -6], ['hurt', 'any', 1, 0.3]] }] }, { l: 'Forbid it', o: [{ r: 'You forbid it. The wager is paid in secret by the next morning.', fx: [] }] }] }),
    E({ id: 'old_enemy', n: 'An old enemy in the forum', tag: 'rival', wk: 7, cd: 20, w: 0.8, if: ['ml:1'], who: 'best', t: 'A man who lost to {who} two seasons ago is telling a story in the forum, and in his story he did not lose.',
      c: [{ l: 'Send {who} to correct the record', h: 'Poor odds of a brawl; good odds of a laugh.', o: [{ p: 0.7, r: '{who} stands in the forum and says four words. The crowd laughs, the storyteller goes pale.', fx: [['fame', 8, 6], ['moW', 6]] }, { r: 'The story ends in a shove, then a punch, then the aedile.', fx: [['fame', -4, 0], ['hurt', 'any', 1, 0.5]] }] }, { l: 'Let him talk', o: [{ r: 'The tale goes round and around and finally dies, as tales do.', fx: [] }] }] }),
  ];

  G.LM_D = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
