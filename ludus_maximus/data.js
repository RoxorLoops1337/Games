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
    thorns: { n: 'Thorned', slots: ['shield', 'armor'], d: v => `Reflect ${v * 6}% of damage taken` },
    plated: { n: 'Plated', slots: ['shield', 'armor', 'helm'], d: v => `+${v * 4}% armor` },
    stalwart: { n: 'Stalwart', slots: ['shield', 'armor', 'charm'], d: () => 'Survive one killing blow per fight' },
    fleet: { n: 'Fleet', slots: ['helm', 'charm', 'armor'], d: v => `+${v * 4}% speed` },
    lucky: { n: 'Keen', slots: ['helm', 'charm', 'weapon'], d: v => `+${v * 3}% crit chance` },
    showy: { n: 'Showy', slots: ['helm', 'charm', 'armor'], d: v => `+${v * 10}% fame` },
    frenzy: { n: "Berserker's", slots: ['weapon', 'charm', 'helm'], d: v => `Each hit gives +${v * 3}% attack speed (stacks 8x)` },
    sear: { n: 'Sunfire', slots: ['armor', 'shield', 'charm'], d: v => `Burn enemies within reach for ${v * 10}% damage/s` },
    shield: { n: 'Aegis', slots: ['shield', 'armor', 'helm'], d: v => `Start fights with a ${v * 8}% HP shield` },
    regen: { n: "Troll's", slots: ['armor', 'charm', 'helm'], d: v => `Regenerate ${(v * 0.6).toFixed(1)}% HP per second` },
    haste: { n: 'Chrono', slots: ['helm', 'charm', 'weapon'], d: v => `Skills and ultimates ${v * 6}% faster` },
    pen: { n: 'Piercing', slots: ['weapon', 'helm'], d: v => `Ignore ${v * 8}% of enemy armor` },
    sprint: { n: 'Phantom', slots: ['armor', 'charm', 'helm'], d: v => `Hits give +${v * 12}% move speed briefly` },
    thunder: { n: 'Stormcaller', slots: ['weapon', 'charm'], d: v => `Every 3rd hit calls lightning (${v * 35}% damage)` },
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
    grasp: { n: 'Grasp of the Undying', d: 'Every 4s your next hit deals 3.5% of their max HP, heals you 2% and grows your max HP.', c: '#2a9d6f' },
    phase: { n: 'Phase Rush', d: '3 hits within 3s give +35% move speed and +15% attack speed for 3s (every 8s).', c: '#22b5a0' },
    first: { n: 'First Strike', d: 'Your first hit on each enemy deals +35% damage. Win bonus: +10% gold.', c: '#f6b82d' },
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
    { id: 'bull', t: 0, n: "Bull's Heart", d: '+15% max HP', syn: { hp: 0.15 } },
    { id: 'sandals', t: 0, n: 'Swift Sandals', d: '+10% speed', syn: { spd: 0.1 } },
    { id: 'hawk', t: 0, n: 'Hawk Eye', d: '+8% crit chance', syn: { crit: 0.08 } },
    { id: 'shadow', t: 0, n: 'Shadow Step', d: '+8% evasion', syn: { eva: 0.08 } },
    { id: 'regen', t: 0, n: 'Regeneration', d: 'Heal 1.2% HP per second', xfx: { regen: 2 } },
    { id: 'thirst', t: 0, n: 'Bloodthirst', d: 'Heal 8% of damage dealt', xfx: { vamp: 2 } },
    { id: 'spikes', t: 0, n: 'Spiked Armor', d: 'Reflect 12% of damage taken', xfx: { thorns: 2 } },
    { id: 'rip', t: 0, n: 'Riposte Training', d: '16% chance to counter-strike', xfx: { riposte: 2 } },
    { id: 'serr', t: 0, n: 'Serrated Edge', d: '30% chance to cause bleeding', xfx: { bleed: 2 } },
    { id: 'oath', t: 0, n: 'Stalwart Oath', d: 'Survive one killing blow', xfx: { stalwart: 1 } },
    { id: 'study', t: 0, n: 'Quick Study', d: 'Skills and ultimates 12% faster', xfx: { haste: 2 } },
    { id: 'aegis', t: 0, n: 'Aegis', d: 'Start with a 16% HP shield', xfx: { shield: 2 } },
    { id: 'warm', t: 0, n: 'Warm-up', d: 'Hits give +3% attack speed (stacks)', xfx: { frenzy: 1 } },
    { id: 'berserk', t: 1, n: 'Berserker Training', d: 'Hits give +9% attack speed (stacks 8x)', xfx: { frenzy: 3 } },
    { id: 'exec', t: 1, n: 'Executioner', d: '+24% damage to targets under 35% HP', xfx: { exec: 3 } },
    { id: 'glass', t: 1, n: 'Glass Cannon', d: '+30% damage, -20% max HP', syn: { atk: 0.3, hp: -0.2 } },
    { id: 'jugg', t: 1, n: 'Juggernaut', d: '+30% max HP, +15% armor, -10% speed', syn: { hp: 0.3, def: 0.15, spd: -0.1 } },
    { id: 'fire', t: 1, n: 'Firebrand', d: 'Burn nearby enemies for 20% damage/s', xfx: { sear: 2 } },
    { id: 'giant', t: 1, n: 'Giant Slayer', d: '+20% damage to enemies with more max HP', xfx: { giant: 2 } },
    { id: 'thunder', t: 1, n: 'Thunderlord', d: 'Every 3rd hit calls lightning (70%)', xfx: { thunder: 2 } },
    { id: 'pen', t: 1, n: 'Armor Piercer', d: 'Ignore 24% of enemy armor', xfx: { pen: 3 } },
    { id: 'phantom', t: 1, n: 'Phantom Dance', d: 'Hits give +24% move speed, +5% speed', syn: { spd: 0.05 }, xfx: { sprint: 2 } },
    { id: 'breath', t: 1, n: 'Last Breath', d: 'Under 30% HP: +40% attack speed, heal 10%', xfx: { lastbreath: 1 } },
    { id: 'hunger', t: 1, n: 'Hungering', d: 'Each hit permanently adds +1.2% damage (this fight)', xfx: { grow: 2 } },
    { id: 'aim', t: 1, n: 'Deadly Aim', d: '+5% crit chance, crits hit 30% harder', syn: { crit: 0.05 }, xfx: { critdmg: 2 } },
    { id: 'urf', t: 2, n: 'Urf Mode', d: 'Skills and ultimates cool down 70% faster', xfx: { haste: 6, ultcd: 3 } },
    { id: 'phoenix', t: 2, n: 'Phoenix', d: 'Rise once from death with 35% HP. +10% HP', syn: { hp: 0.1 }, xfx: { revive: 1 } },
    { id: 'ascend', t: 2, n: 'Ascension', d: '+25% damage, +25% HP, +15% speed', syn: { atk: 0.25, hp: 0.25, spd: 0.15 } },
    { id: 'invinc', t: 2, n: 'Invincible', d: 'Shield, regeneration and a second life', xfx: { stalwart: 1, shield: 4, regen: 3 } },
    { id: 'titan', t: 2, n: 'Titanic Hunger', d: '+20% HP and heal 16% of damage dealt', syn: { hp: 0.2 }, xfx: { vamp: 4 } },
    { id: 'storm', t: 2, n: 'Storm Lord', d: 'Frenzy stacks and thunder on every 3rd hit', xfx: { thunder: 4, frenzy: 3 } },
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
    { id: 'feather', n: 'Phoenix Feather', d: 'Rise once per fight with 35% HP', xfx: { revive: 1 }, c: '#ff8a3d' },
    { id: 'crown', n: 'Crown of Thorns', d: 'Reflect 12% of damage taken', xfx: { thorns: 2 }, c: '#2a9d6f' },
    { id: 'ember', n: 'Ember of Mars', d: 'Hits give +3% attack speed (stacks)', xfx: { frenzy: 1 }, c: '#d2412b' },
    { id: 'storm', n: "Jupiter's Bolt", d: 'Every 3rd hit calls lightning', xfx: { thunder: 1 }, c: '#7fc4ff' },
    { id: 'titan', n: 'Heart of the Titan', d: '+12% max HP, regenerate HP', syn: { hp: 0.12 }, xfx: { regen: 1 }, c: '#8c5cc8' },
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
    { id: 'w10', n: 'Crowd Pleaser', ok: (g) => g.rec.w >= 10 }, { id: 'w25', n: 'the Unbroken', ok: (g) => g.rec.w >= 25 && g.rec.l <= 3 },
    { id: 'f300', n: 'Arena Darling', ok: (g) => g.fame >= 300 }, { id: 'l15', n: 'Old Iron', ok: (g) => g.lvl >= 15 }, { id: 'w50', n: 'the Legend', ok: (g) => g.rec.w >= 50 },
  ];
  D.DIFF_N = ['Relaxed', 'Standard', 'Brutal'];
  G.LM_D = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
