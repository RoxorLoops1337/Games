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
      mul: { hp: 1.25, atk: 0.95, def: 1.35, spd: 0.85, crit: 0.9, eva: 0.7 },
      base: { str: 11, agi: 7, end: 14, skl: 9, wil: 11 }, beats: ['thraex', 'dimachaerus'],
    },
    retiarius: {
      id: 'retiarius', n: 'Retiarius', role: 'Trapper', c: '#22a58f', sig: 'netthrow',
      d: 'Net and trident. Tangles slow Bulwarks and out-reaches Lancers.',
      mul: { hp: 0.95, atk: 0.9, def: 0.8, spd: 1.1, crit: 1, eva: 1.15 },
      base: { str: 8, agi: 12, end: 9, skl: 13, wil: 10 }, beats: ['murmillo', 'hoplomachus'],
    },
    thraex: {
      id: 'thraex', n: 'Thraex', role: 'Raider', c: '#e0742a', sig: 'flurry',
      d: 'Quick curved blade. Dodges nets and slips inside spears.',
      mul: { hp: 0.95, atk: 1, def: 0.85, spd: 1.2, crit: 1.2, eva: 1.1 },
      base: { str: 10, agi: 14, end: 8, skl: 12, wil: 9 }, beats: ['retiarius', 'hoplomachus'],
    },
    hoplomachus: {
      id: 'hoplomachus', n: 'Hoplomachus', role: 'Lancer', c: '#b8892a', sig: 'lunge',
      d: 'Long spear, round shield. Keeps Duelists at bay and cracks Bulwarks.',
      mul: { hp: 1.05, atk: 1.1, def: 1, spd: 0.95, crit: 1, eva: 0.9 },
      base: { str: 13, agi: 9, end: 11, skl: 11, wil: 9 }, beats: ['dimachaerus', 'murmillo'],
    },
    dimachaerus: {
      id: 'dimachaerus', n: 'Dimachaerus', role: 'Duelist', c: '#c2395f', sig: 'crossslash',
      d: 'Two blades, no shield. Shreds nets and Raiders, bounces off armor.',
      mul: { hp: 0.9, atk: 1.2, def: 0.7, spd: 1.1, crit: 1.15, eva: 1 },
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
  };
  D.AFFIX_IDS = Object.keys(D.AFFIX);

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

  G.LM_D = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
