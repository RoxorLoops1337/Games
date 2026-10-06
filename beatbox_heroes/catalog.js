// BEATBOX HEROES -- catalog.js
// Pure DATA: every cosmetic the character creator offers, and how each one is unlocked.
// chars.js must be able to draw EVERY id listed here. core.js decides what is unlocked.
//
// unlock: { t:'free' }                      available from the start
//         { t:'level', n }                  reach player level n
//         { t:'fans', n }                   reach n fans
//         { t:'day', n }                    reach day n
//         { t:'ach', id }                   earn that achievement
//         { t:'beat', id }                  beat that opponent (see core OPPONENTS)
//         { t:'shop', price }               buy it in the Thrift Shop (cash). May also carry `lvl` (shop stock gate)
//         { t:'stat', k, n }                reach stat k (mus|tech|ori|show) >= n
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});

  const F = { t: 'free' };
  const lvl = (n) => ({ t: 'level', n });
  const fans = (n) => ({ t: 'fans', n });
  const ach = (id) => ({ t: 'ach', id });
  const beat = (id) => ({ t: 'beat', id });
  const shop = (price, l) => ({ t: 'shop', price, lvl: l || 1 });
  const stat = (k, n) => ({ t: 'stat', k, n });
  const day = (n) => ({ t: 'day', n });

  /* ------------------------------------------------------------------ body */
  const BODIES = [
    { id: 'boy', name: 'Boy', unlock: F },
    { id: 'girl', name: 'Girl', unlock: F },
    { id: 'neutral', name: 'Neutral', unlock: F },
  ];

  /* ------------------------------------------------------------------ skin */
  // 40 natural presets, light to deep, cool to warm undertones. The creator also has a free
  // picker (lightness / warmth / richness sliders + any colour) so every skin tone is possible.
  const SKINS = [
    ['Porcelain', '#fde7d9'], ['Ivory', '#f9dcc4'], ['Alabaster', '#f4d3bd'], ['Rose Fair', '#f2c4ae'], ['Peach', '#f0be9b'],
    ['Cream', '#eec9a3'], ['Sand', '#e6bb8a'], ['Beige', '#dfb185'], ['Honey', '#d9a46e'], ['Wheat', '#d2a06f'],
    ['Golden', '#cf9456'], ['Almond', '#c68b5e'], ['Olive', '#b98a52'], ['Tan', '#b87f4e'], ['Sienna', '#ad7343'],
    ['Caramel', '#a56c3f'], ['Amber', '#9c6236'], ['Copper', '#a15f3d'], ['Bronze', '#8f5632'], ['Chestnut', '#85502f'],
    ['Cinnamon', '#8a4a2f'], ['Rosewood', '#7d4638'], ['Mahogany', '#6f3d2b'], ['Walnut', '#684026'], ['Mocha', '#5e3823'],
    ['Cocoa', '#573220'], ['Umber', '#4e2e1e'], ['Coffee', '#4a2b1c'], ['Espresso', '#412618'], ['Cacao', '#3b2216'],
    ['Ebony', '#33201a'], ['Onyx', '#2b1b16'], ['Plum Deep', '#4a2a2e'], ['Garnet', '#5a2f2c'], ['Maple', '#8d5a36'],
    ['Hazel', '#9a6b43'], ['Fawn', '#cb9c78'], ['Blush', '#efb9a6'], ['Mist', '#e8cdbb'], ['Cool Taupe', '#b58f78'],
  ].map(([name, color]) => ({ id: name.toLowerCase().replace(/ /g, '_'), name, color, unlock: F }));
  // fantasy skin tones, unlockable (the creator's free colour wheel is also gated behind the first one)
  const SKINS_FANTASY = [
    { id: 'neon_cyan', name: 'Neon Cyan', color: '#4ee0ff', unlock: lvl(8) },
    { id: 'neon_pink', name: 'Neon Pink', color: '#ff7bd0', unlock: lvl(10) },
    { id: 'toxic', name: 'Toxic Lime', color: '#a8f04d', unlock: lvl(12) },
    { id: 'ultraviolet', name: 'Ultraviolet', color: '#9b6bff', unlock: lvl(14) },
    { id: 'chrome', name: 'Chrome', color: '#c9d3e6', unlock: ach('worldcup') },
    { id: 'gold_leaf', name: 'Gold Leaf', color: '#e8b923', unlock: ach('worldcup') },
  ];

  /* ------------------------------------------------------------------ hair */
  const HAIR_STYLES = [
    { id: 'bald', name: 'Bald', unlock: F },
    { id: 'buzz', name: 'Buzz Cut', unlock: F },
    { id: 'crop', name: 'Crop', unlock: F },
    { id: 'sidepart', name: 'Side Part', unlock: F },
    { id: 'quiff', name: 'Quiff', unlock: F },
    { id: 'undercut', name: 'Undercut', unlock: F },
    { id: 'waves', name: 'Waves', unlock: F },
    { id: 'curly', name: 'Curls', unlock: F },
    { id: 'afro', name: 'Afro', unlock: F },
    { id: 'bob', name: 'Bob', unlock: F },
    { id: 'long', name: 'Long', unlock: F },
    { id: 'ponytail', name: 'Ponytail', unlock: F },
    { id: 'pigtails', name: 'Pigtails', unlock: F },
    { id: 'buns', name: 'Space Buns', unlock: F },
    { id: 'topknot', name: 'Top Knot', unlock: F },
    { id: 'braids', name: 'Braids', unlock: lvl(2) },
    { id: 'locs', name: 'Locs', unlock: lvl(3) },
    { id: 'mohawk', name: 'Mohawk', unlock: lvl(4) },
    { id: 'mullet', name: 'Mullet', unlock: lvl(5) },
    { id: 'fade', name: 'High Fade', unlock: lvl(2) },
    { id: 'spiky', name: 'Spikes', unlock: lvl(6) },
    { id: 'flame', name: 'Flame Hair', unlock: ach('firstbattle') },
    { id: 'cornrows', name: 'Cornrows', unlock: F }, { id: 'hightop', name: 'High-Top Fade', unlock: F }, { id: 'twists', name: 'Short Twists', unlock: F },
    { id: 'dreadbun', name: 'Dread Bun', unlock: shop(45, 3) }, { id: 'fadewave', name: 'Wave Fade', unlock: shop(40, 2) },
  ];
  // natural + dyed colours. Dyes unlock gradually (the picker also allows any colour once `rainbow` is earned).
  const HAIR_COLORS = [
    ['Jet', '#1a1420', F], ['Soft Black', '#2a2024', F], ['Dark Brown', '#3b2418', F], ['Chestnut', '#5a3520', F], ['Auburn', '#7b3a22', F],
    ['Copper', '#a5502a', F], ['Ginger', '#c4642a', F], ['Chocolate', '#4a2c1c', F], ['Honey', '#a8773a', F], ['Dirty Blonde', '#b89558', F],
    ['Blonde', '#dcbc6a', F], ['Platinum', '#ece0b8', F], ['Silver', '#b9b9c8', F], ['White', '#f2f0ee', F],
    ['Hot Pink', '#ff3ea5', lvl(2)], ['Cherry', '#d6203f', lvl(2)], ['Orange', '#ff8a2a', lvl(3)], ['Sunshine', '#ffd23f', lvl(3)],
    ['Lime', '#8dff4a', lvl(4)], ['Teal', '#16b8a6', lvl(4)], ['Cyan', '#2ee6ff', lvl(5)], ['Sky', '#4f9bff', lvl(5)],
    ['Indigo', '#4b3bd6', lvl(6)], ['Violet', '#9b5cff', lvl(6)], ['Magenta', '#e03cc8', lvl(7)], ['Lavender', '#c7a6ff', lvl(7)],
    ['Mint', '#9af0cf', lvl(8)], ['Peach Fuzz', '#ffb08a', lvl(8)],
  ].map(([name, color, unlock]) => ({ id: name.toLowerCase().replace(/ /g, '_'), name, color, unlock }));

  /* -------------------------------------------------------------- face bits */
  const EYE_STYLES = [
    { id: 'round', name: 'Round', unlock: F }, { id: 'sharp', name: 'Sharp', unlock: F }, { id: 'sleepy', name: 'Sleepy', unlock: F },
    { id: 'wide', name: 'Wide', unlock: F }, { id: 'lashes', name: 'Lashes', unlock: F }, { id: 'cat', name: 'Cat', unlock: F },
    { id: 'happy', name: 'Happy', unlock: F }, { id: 'star', name: 'Star Eyes', unlock: lvl(9) },
  ];
  const EYE_COLORS = [
    ['Brown', '#4a2c1a'], ['Dark', '#1c1620'], ['Hazel', '#8a6a2a'], ['Green', '#2f8a4a'], ['Blue', '#2f6fd0'], ['Grey', '#7a8aa0'],
    ['Amber', '#d98a1a'], ['Violet', '#8a4fd6'], ['Pink', '#e0509a'], ['Cyan', '#1ec8e0'],
  ].map(([name, color]) => ({ id: name.toLowerCase(), name, color, unlock: F }));
  const BROWS = [
    { id: 'soft', name: 'Soft', unlock: F }, { id: 'straight', name: 'Straight', unlock: F }, { id: 'arched', name: 'Arched', unlock: F },
    { id: 'thick', name: 'Thick', unlock: F }, { id: 'thin', name: 'Thin', unlock: F }, { id: 'none', name: 'None', unlock: F },
  ];
  const FACIAL = [
    { id: 'none', name: 'Clean', unlock: F }, { id: 'stubble', name: 'Stubble', unlock: F }, { id: 'mustache', name: 'Mustache', unlock: F },
    { id: 'goatee', name: 'Goatee', unlock: F }, { id: 'beard', name: 'Full Beard', unlock: F }, { id: 'longbeard', name: 'Long Beard', unlock: lvl(6) },
  ];
  const MARKS = [                                       // multi-select face marks
    { id: 'freckles', name: 'Freckles', unlock: F }, { id: 'blush', name: 'Blush', unlock: F }, { id: 'beauty', name: 'Beauty Mark', unlock: F },
    { id: 'scar', name: 'Scar', unlock: lvl(2) }, { id: 'bandaid', name: 'Band-Aid', unlock: lvl(3) }, { id: 'starpaint', name: 'Star Paint', unlock: lvl(4) },
    { id: 'tear', name: 'Tear Tattoo', unlock: lvl(5) }, { id: 'warpaint', name: 'War Paint', unlock: fans(150) },
    { id: 'goldgrill', name: 'Gold Grill', unlock: fans(400) }, { id: 'eyebrowslit', name: 'Brow Slit', unlock: lvl(3) },
  ];

  /* --------------------------------------------------------------- clothes */
  // `color` options come from OUTFIT_COLORS (+ the free picker). Items with two-tone details use color2 (accent).
  const TOPS = [
    { id: 'tee', name: 'T-Shirt', unlock: F }, { id: 'tank', name: 'Tank Top', unlock: F }, { id: 'hoodie', name: 'Hoodie', unlock: F },
    { id: 'croptop', name: 'Crop Top', unlock: F }, { id: 'sweater', name: 'Sweater', unlock: F }, { id: 'flannel', name: 'Flannel', unlock: F },
    { id: 'dress', name: 'Sundress', unlock: F },
    { id: 'jacket', name: 'Leather Jacket', unlock: shop(60, 1) }, { id: 'varsity', name: 'Varsity Jacket', unlock: shop(70, 2) },
    { id: 'tracktop', name: 'Track Jacket', unlock: shop(55, 1) }, { id: 'puffer', name: 'Puffer Coat', unlock: shop(85, 3) },
    { id: 'hawaiian', name: 'Hawaiian Shirt', unlock: shop(45, 2) }, { id: 'overalls', name: 'Overalls', unlock: shop(65, 2) },
    { id: 'turtleneck', name: 'Turtleneck', unlock: shop(50, 2) }, { id: 'kimono', name: 'Kimono Jacket', unlock: shop(95, 4) },
    { id: 'tux', name: 'Tux Jacket', unlock: shop(140, 6) }, { id: 'poncho', name: 'Poncho', unlock: shop(75, 3) },
    { id: 'bbhtee', name: 'Heroes Tee', unlock: ach('firstbusk') }, { id: 'stagesuit', name: 'Stage Suit', unlock: ach('showcase') },
    { id: 'champ', name: 'Champion Robe', unlock: ach('worldcup') },
    { id: 'oversized', name: 'Oversized Tee', unlock: F }, { id: 'hoodiebig', name: 'Big Hoodie', unlock: F }, { id: 'jersey', name: 'Hoops Jersey', unlock: ach('firstbattle') },
    { id: 'bomber', name: 'Satin Bomber', unlock: fans(100) }, { id: 'denimjacket', name: 'Denim Jacket', unlock: shop(70, 3) },
    { id: 'windbreaker', name: 'Windbreaker', unlock: shop(55, 2) }, { id: 'puffvest', name: 'Puffer Vest', unlock: shop(80, 4) },
  ];
  const BOTTOMS = [
    { id: 'jeans', name: 'Jeans', unlock: F }, { id: 'cargo', name: 'Cargo Pants', unlock: F }, { id: 'shorts', name: 'Shorts', unlock: F },
    { id: 'skirt', name: 'Skirt', unlock: F }, { id: 'joggers', name: 'Joggers', unlock: F }, { id: 'baggy', name: 'Baggy Jeans', unlock: F },
    { id: 'leggings', name: 'Leggings', unlock: shop(30, 1) }, { id: 'trackpants', name: 'Track Pants', unlock: shop(40, 1) },
    { id: 'kilt', name: 'Plaid Kilt', unlock: shop(45, 3) }, { id: 'slacks', name: 'Slacks', unlock: shop(55, 4) },
    { id: 'flares', name: 'Flares', unlock: shop(50, 5) }, { id: 'goldpants', name: 'Gold Pants', unlock: ach('worldcup') },
    { id: 'sweatpants', name: 'Sweatpants', unlock: F }, { id: 'camo', name: 'Camo Cargos', unlock: F },
    { id: 'ripped', name: 'Ripped Baggies', unlock: shop(45, 2) }, { id: 'techpants', name: 'Tech Pants', unlock: shop(60, 3) },
  ];
  const SHOES = [
    { id: 'sneakers', name: 'Sneakers', unlock: F }, { id: 'hightops', name: 'High Tops', unlock: F }, { id: 'boots', name: 'Boots', unlock: F },
    { id: 'sandals', name: 'Sandals', unlock: F }, { id: 'skate', name: 'Skate Shoes', unlock: shop(35, 1) }, { id: 'platform', name: 'Platforms', unlock: shop(60, 3) },
    { id: 'loafers', name: 'Loafers', unlock: shop(45, 4) }, { id: 'combat', name: 'Combat Boots', unlock: shop(55, 2) },
    { id: 'goldkicks', name: 'Golden Kicks', unlock: ach('rhythmking') },
    { id: 'retro', name: 'Retro Hi-Tops', unlock: F }, { id: 'slides', name: 'Slides + Socks', unlock: F },
    { id: 'fatlaces', name: 'Fat Laces', unlock: shop(40, 2) }, { id: 'timbs', name: 'Work Boots', unlock: shop(75, 3) },
  ];

  /* -------------------------------------------------------------- headwear */
  const HATS = [
    { id: 'none', name: 'No Hat', unlock: F },
    { id: 'cap', name: 'Baseball Cap', unlock: F }, { id: 'capback', name: 'Cap Backwards', unlock: F }, { id: 'beanie', name: 'Beanie', unlock: F },
    { id: 'bandana', name: 'Bandana', unlock: F }, { id: 'headband', name: 'Headband', unlock: F },
    { id: 'snapback', name: 'Snapback', unlock: shop(25, 1) }, { id: 'bucket', name: 'Bucket Hat', unlock: shop(30, 1) },
    { id: 'beret', name: 'Beret', unlock: shop(35, 2) }, { id: 'fedora', name: 'Fedora', unlock: shop(50, 3) },
    { id: 'cowboy', name: 'Cowboy Hat', unlock: shop(60, 4) }, { id: 'catears', name: 'Cat Ears', unlock: shop(40, 2) },
    { id: 'tophat', name: 'Top Hat', unlock: ach('showcase') }, { id: 'crown', name: 'Golden Crown', unlock: ach('worldcup') },
    { id: 'halo', name: 'Halo', unlock: ach('allsounds') }, { id: 'visor', name: 'Neon Visor Cap', unlock: fans(300) },
    { id: 'chef', name: 'Chef Hat', unlock: ach('cooked') }, { id: 'wizard', name: 'Wizard Hat', unlock: lvl(12) },
    { id: 'pirate', name: 'Pirate Hat', unlock: beat('hexx') }, { id: 'headphonehat', name: 'Fluffy Earmuffs', unlock: shop(30, 2) },
    { id: 'durag', name: 'Durag', unlock: F }, { id: 'fitted', name: 'Fitted Cap', unlock: F }, { id: 'trucker', name: 'Trucker Cap', unlock: shop(30, 1) },
    { id: 'hood', name: 'Hood Up', unlock: shop(40, 2) }, { id: 'bucketfur', name: 'Fuzzy Bucket', unlock: shop(60, 4) },
  ];
  const GLASSES = [
    { id: 'none', name: 'None', unlock: F },
    { id: 'round', name: 'Round Frames', unlock: F }, { id: 'nerd', name: 'Square Frames', unlock: F },
    { id: 'shades', name: 'Classic Shades', unlock: shop(20, 1) }, { id: 'aviator', name: 'Aviators', unlock: shop(35, 2) },
    { id: 'wayfarer', name: 'Wayfarers', unlock: shop(30, 2) }, { id: 'sport', name: 'Sport Wrap', unlock: shop(40, 3) },
    { id: 'heart', name: 'Heart Shades', unlock: ach('firstdate') }, { id: 'star', name: 'Star Shades', unlock: fans(120) },
    { id: 'pixel', name: 'Deal With It', unlock: ach('firstbattle') }, { id: 'monocle', name: 'Monocle', unlock: shop(70, 5) },
    { id: 'goggles', name: 'Steam Goggles', unlock: lvl(7) }, { id: 'vr', name: 'VR Visor', unlock: fans(500) },
    { id: 'neonbar', name: 'Neon Bar Shades', unlock: ach('streak10') }, { id: 'eyepatch', name: 'Eyepatch', unlock: lvl(5) },
    { id: 'chromeshield', name: 'Chrome Shield', unlock: ach('streak10') }, { id: 'oversized', name: 'Oversized Shades', unlock: shop(30, 1) },
    { id: 'gold_round', name: 'Gold Rounds', unlock: shop(55, 3) },
  ];
  const ACCESSORIES = [                                 // each has a `slot`; one accessory per slot
    { id: 'none_neck', slot: 'neck', name: 'No Neckwear', unlock: F }, { id: 'chain', slot: 'neck', name: 'Gold Chain', unlock: shop(40, 2) },
    { id: 'scarf', slot: 'neck', name: 'Scarf', unlock: F }, { id: 'bowtie', slot: 'neck', name: 'Bow Tie', unlock: shop(25, 2) },
    { id: 'hpneck', slot: 'neck', name: 'Headphones (Neck)', unlock: F }, { id: 'lanyard', slot: 'neck', name: 'Lanyard Pass', unlock: ach('firstopenmic') },
    { id: 'medal', slot: 'neck', name: 'Champion Medal', unlock: ach('worldcup') },
    { id: 'none_ears', slot: 'ears', name: 'No Earwear', unlock: F }, { id: 'studs', slot: 'ears', name: 'Studs', unlock: F },
    { id: 'hoops', slot: 'ears', name: 'Hoops', unlock: F }, { id: 'hpears', slot: 'ears', name: 'Big Headphones', unlock: shop(45, 2) },
    { id: 'dangles', slot: 'ears', name: 'Star Dangles', unlock: fans(80) },
    { id: 'none_back', slot: 'back', name: 'Nothing', unlock: F }, { id: 'backpack', slot: 'back', name: 'Backpack', unlock: F },
    { id: 'cape', slot: 'back', name: 'Hero Cape', unlock: lvl(10) }, { id: 'wings', slot: 'back', name: 'Neon Wings', unlock: ach('rhythmking') },
    { id: 'guitar', slot: 'back', name: 'Guitar', unlock: shop(80, 4) },
    { id: 'none_hand', slot: 'hand', name: 'Bare Hand', unlock: F }, { id: 'mic', slot: 'hand', name: 'Classic Mic', unlock: F },
    { id: 'goldmic', slot: 'hand', name: 'Golden Mic', unlock: ach('showcase') }, { id: 'neonmic', slot: 'hand', name: 'Neon Mic', unlock: fans(200) },
    { id: 'boombox', slot: 'hand', name: 'Boombox', unlock: shop(90, 3) },
    { id: 'none_wrist', slot: 'wrist', name: 'No Wristwear', unlock: F }, { id: 'wristband', slot: 'wrist', name: 'Wristbands', unlock: F },
    { id: 'watch', slot: 'wrist', name: 'Watch', unlock: shop(30, 2) }, { id: 'bracelets', slot: 'wrist', name: 'Bracelets', unlock: shop(25, 1) },
    { id: 'cubanchain', slot: 'neck', name: 'Cuban Chain', unlock: shop(80, 3) }, { id: 'dogtags', slot: 'neck', name: 'Dog Tags', unlock: F },
    { id: 'iced', slot: 'ears', name: 'Iced Studs', unlock: shop(90, 4) }, { id: 'crossbody', slot: 'back', name: 'Crossbody Bag', unlock: shop(50, 2) },
    { id: 'icedwatch', slot: 'wrist', name: 'Iced Watch', unlock: shop(100, 5) }, { id: 'stackedbands', slot: 'wrist', name: 'Stacked Bands', unlock: F },
  ];
  const ACC_SLOTS = ['neck', 'ears', 'back', 'hand', 'wrist'];

  // Swatches offered for clothing/hat/glasses colours (the free picker also works).
  const OUTFIT_COLORS = [
    '#e63946', '#ff6b35', '#ffb703', '#f4e04d', '#8ac926', '#2a9d8f', '#1d9bd1', '#3a5fcd', '#7b4fe0', '#c13fcf', '#ff4fa3', '#f7f2e8',
    '#b8b8c8', '#6b6b80', '#34303f', '#17141f', '#7a4a2a', '#b98b5e', '#2f5d3a', '#0f3b57', '#7d1f3f', '#d4a017', '#2ee6ff', '#ff3ea5',
  ];

  /* ---------------------------------------------------------------- default */
  const DEFAULT_LOOK = {
    name: 'Hero', body: 'neutral', skin: '#c68b5e',
    hair: { style: 'twists', color: '#2a2024', tip: null },
    eyes: { style: 'round', color: '#4a2c1a' }, brows: 'soft', facial: 'none', marks: [],
    top: { id: 'oversized', color: '#f4e04d', color2: '#17141f' },
    bottom: { id: 'camo', color: '#2f5d3a' }, shoes: { id: 'retro', color: '#f7f2e8' },
    hat: { id: 'fitted', color: '#17141f' }, glasses: { id: 'none', color: '#17141f' },
    acc: { neck: { id: 'dogtags', color: '#c9d3e6' }, ears: { id: 'none_ears', color: '#d4a017' }, back: { id: 'none_back', color: '#6b6b80' },
      hand: { id: 'mic', color: '#6b6b80' }, wrist: { id: 'none_wrist', color: '#2ee6ff' } },
  };

  // Everything the unlock system and the tests need to enumerate: [group key, array]
  const GROUPS = {
    body: BODIES, skin: SKINS.concat(SKINS_FANTASY), hairStyle: HAIR_STYLES, hairColor: HAIR_COLORS, eyeStyle: EYE_STYLES, eyeColor: EYE_COLORS,
    brows: BROWS, facial: FACIAL, marks: MARKS, top: TOPS, bottom: BOTTOMS, shoes: SHOES, hat: HATS, glasses: GLASSES, acc: ACCESSORIES,
  };
  // Items whose unlock is not `free` are tracked in the save as owned[`${group}:${id}`] = true once unlocked.
  const key = (group, id) => group + ':' + id;

  Object.assign(BBH, {
    CATALOG: { BODIES, SKINS, SKINS_FANTASY, HAIR_STYLES, HAIR_COLORS, EYE_STYLES, EYE_COLORS, BROWS, FACIAL, MARKS, TOPS, BOTTOMS, SHOES, HATS, GLASSES, ACCESSORIES, ACC_SLOTS, OUTFIT_COLORS, GROUPS, DEFAULT_LOOK, key },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CATALOG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
