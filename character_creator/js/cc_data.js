// Character Studio: the parts catalog, the palettes, the default character, the presets and the random roller.
// Everything the creator can change is one plain object (a "character"): every key below has a default and a list or range it is
// checked against (CC.clean), so an imported file or a share link can never break a draw. The ids are saved in people's files and share
// links: add new ones at the end, never rename or reuse one.
(function () {
  'use strict';
  const CC = (window.CC = window.CC || {});
  const L = (...pairs) => pairs.map((p) => ({ id: p[0], label: p[1] }));

  // ---- palettes (the game's candy tokens first, then the natural tones) ----
  CC.SKIN = ['#ffe3d2', '#fdd3b6', '#f7c19b', '#eeb086', '#dc9a6e', '#c98558', '#a96a42', '#8a5233', '#6b3e26', '#4f2b1b', '#ffb0cf', '#d9c2ff', '#9fd5ff', '#a8f0cf', '#9be07a', '#cfd3e0'];
  CC.HAIR = ['#2a1a1f', '#3a1d0f', '#5c321b', '#6b3a22', '#8a5a2e', '#a2432a', '#e0742c', '#e8b44a', '#f2c75c', '#f4ecd0', '#b9bcc9', '#f4f1fb', '#ff7eb6', '#e8383d', '#ff9a2e', '#c6ff3d', '#3fcf6a', '#2ec4b6', '#4aa3ff', '#a77bff'];
  CC.EYE = ['#4c2b14', '#7a4a1c', '#8a6a2a', '#4f7a3a', '#3f9a7a', '#4c5d7e', '#4aa3ff', '#7a8fd8', '#a77bff', '#ff7eb6', '#e8383d', '#e8b44a', '#2a2a36', '#9aa0b4'];
  CC.CLOTH = ['#fffaf1', '#2a2a36', '#463a32', '#8a86a8', '#e8383d', '#ff9a2e', '#ffd84d', '#c6ff3d', '#78bd35', '#3fcf6a', '#2ec4b6', '#4aa3ff', '#3b5bd8', '#a77bff', '#8b4dff', '#ff7eb6', '#fd9bb4', '#c93f78', '#7fa631', '#d9b48a', '#8a5a2e', '#ffc9de', '#d9fff4', '#1a1340'];
  CC.METAL = ['#f4c64e', '#cfd5de', '#ff9bc0', '#b58cff', '#3fd6b0', '#2d170f'];
  CC.BLUSH = ['#ff8d98', '#ff7eb6', '#ffa66b', '#c93f78'];
  CC.LIP = ['', '#e8505f', '#c93f78', '#ff7eb6', '#a0243c', '#8b4dff', '#2a2a36'];

  // ---- catalogs ----
  CC.CAT = {
    jaw: L(['soft', 'Soft'], ['lean', 'Lean'], ['square', 'Square'], ['pointed', 'Pointed']),
    ear: L(['round', 'Round'], ['small', 'Tiny'], ['pointy', 'Elf'], ['big', 'Big'], ['cat', 'Cat'], ['hidden', 'Hidden']),
    eyes: L(['round', 'Big round'], ['almond', 'Almond'], ['sleepy', 'Sleepy'], ['cat', 'Cat'], ['sharp', 'Sharp'], ['wide', 'Wide open'], ['dot', 'Dots'], ['happy', 'Smiling arcs'], ['star', 'Starry']),
    sparkle: L(['none', 'None'], ['flower', 'Flower'], ['star', 'Star'], ['heart', 'Heart'], ['note', 'Note'], ['ring', 'Ring']),
    brow: L(['soft', 'Soft arch'], ['thick', 'Thick'], ['thin', 'Thin'], ['flat', 'Flat'], ['angry', 'Bold slant'], ['none', 'None']),
    nose: L(['tick', 'Tick'], ['button', 'Button'], ['dot', 'Dot'], ['pointy', 'Pointy'], ['wide', 'Wide'], ['none', 'None']),
    mouth: L(['smile', 'Smile'], ['smirk', 'Smirk'], ['smirkTeeth', 'Cheeky'], ['grin', 'Grin'], ['happyOpen', 'Happy open'], ['tiny', 'Tiny'], ['flat', 'Flat'], ['sing', 'Singing']),
    freckles: L(['none', 'None'], ['light', 'Light'], ['heavy', 'Many'], ['nose', 'Nose bridge']),
    mark: L(['none', 'None'], ['mole', 'Beauty mark'], ['scar', 'Scar'], ['bandaid', 'Plaster'], ['starPaint', 'Star paint'], ['heartPaint', 'Heart paint'], ['glitter', 'Glitter tears'], ['stripe', 'Stripe paint'], ['bolt', 'Lightning paint'], ['noteMark', 'Note paint']),
    facial: L(['none', 'None'], ['stubble', 'Stubble'], ['moustache', 'Moustache'], ['curly', 'Curly moustache'], ['goatee', 'Goatee'], ['soul', 'Soul patch'], ['beard', 'Full beard'], ['long', 'Long beard'], ['chops', 'Mutton chops']),
    hair: L(['bald', 'Bald'], ['buzz', 'Buzz cut'], ['crop', 'Messy crop'], ['sidepart', 'Side part'], ['quiff', 'Swoop quiff'], ['mohawk', 'Mohawk + mullet'], ['spiky', 'Anime spikes'], ['pixie', 'Pixie'], ['bob', 'Bob'], ['long', 'Long straight'], ['wavy', 'Long wavy'], ['emo', 'Side fringe'], ['pony_high', 'High ponytail'], ['pony_low', 'Low ponytail'], ['twin', 'Twin tails'], ['buns', 'Space buns'], ['topknot', 'Top knot'], ['braids', 'Twin braids'], ['curls', 'Curly cloud'], ['afro', 'Big puff'], ['mullet', 'Mullet'], ['undercut', 'Undercut'], ['slick', 'Slicked back'], ['flattop', 'Flat top'], ['curtains', 'Curtains'], ['locs', 'Locs'], ['manbun', 'Man bun'], ['rows', 'Cornrows'], ['fauxhawk', 'Faux hawk'], ['shaggy', 'Shaggy']),
    hairline: L(['auto', 'Match style'], ['part', 'Soft part'], ['bangs', 'Blunt bangs'], ['sweep', 'Side sweep'], ['high', 'High forehead'], ['center', 'Curtains']),
    dye: L(['solid', 'Solid'], ['ombre', 'Ombre tips'], ['streaks', 'Streaks'], ['roots', 'Dark roots'], ['split', 'Split dye']),
    hairAcc: L(['auto', 'Matching scrunchie'], ['none', 'None'], ['ribbon', 'Ribbon'], ['band', 'Plain band']),
    top: L(['tee', 'T-shirt'], ['vneck', 'V-neck tee'], ['tank', 'Tank top'], ['crop', 'Crop top'], ['long', 'Long sleeve'], ['hoodie', 'Hoodie'], ['jacket', 'Open jacket'], ['bomber', 'Bomber'], ['jumper', 'Knit jumper'], ['turtle', 'Turtleneck'], ['blazer', 'Stage blazer'], ['vest', 'Vest'], ['baseball', 'Baseball tee'], ['shirt', 'Collar shirt'], ['track', 'Track jacket'], ['jersey', 'Jersey'], ['cardigan', 'Cardigan'], ['polo', 'Polo']),
    pattern: L(['none', 'Plain'], ['stripes', 'Stripes'], ['polka', 'Polka dots'], ['checks', 'Checks'], ['stars', 'Stars'], ['hearts', 'Hearts'], ['smiley', 'Smiley'], ['noteP', 'Music note'], ['bolt', 'Lightning'], ['fade', 'Fade'], ['vstripe', 'Side stripe'], ['sakura', 'Blossoms']),
    sleeve: L(['auto', 'Match top'], ['none', 'Sleeveless'], ['short', 'Short'], ['three', 'Three quarter'], ['long', 'Long']),
    bottom: L(['jeans', 'Straight pants'], ['skinny', 'Skinny pants'], ['baggy', 'Baggy pants'], ['flared', 'Flared pants'], ['joggers', 'Joggers'], ['cargo', 'Cargo pants'], ['shorts', 'Shorts'], ['bermuda', 'Long shorts'], ['pleat', 'Pleated skirt'], ['aline', 'A-line skirt'], ['mini', 'Mini skirt'], ['tutu', 'Tutu'], ['maxi', 'Long skirt'], ['leggings', 'Leggings']),
    onepiece: L(['none', 'Separates'], ['dress', 'Dress'], ['sundress', 'Sundress'], ['jumpsuit', 'Jumpsuit'], ['overalls', 'Dungarees'], ['onesie', 'Animal onesie']),
    animal: L(['bear', 'Bear'], ['cat', 'Cat'], ['bunny', 'Bunny'], ['unicorn', 'Unicorn'], ['monster', 'Monster'], ['dino', 'Dino']),
    shoe: L(['sneaker', 'Sneakers'], ['chunky', 'Chunky trainers'], ['hightop', 'High-tops'], ['boot', 'Boots'], ['slipon', 'Slip-ons'], ['sandal', 'Sandals'], ['heel', 'Heels'], ['socks', 'Just socks'], ['paws', 'Paws']),
    sock: L(['none', 'None'], ['ankle', 'Ankle'], ['crew', 'Crew'], ['knee', 'Knee-high'], ['striped', 'Striped knee-high']),
    headwear: L(['none', 'None'], ['beanie', 'Beanie'], ['cap', 'Cap'], ['capback', 'Cap, backwards'], ['bucket', 'Bucket hat'], ['beret', 'Beret'], ['headband', 'Sweatband'], ['bow', 'Big bow'], ['flowers', 'Flower crown'], ['catears', 'Cat ears'], ['bunny', 'Bunny ears'], ['horns', 'Little horns'], ['halo', 'Halo'], ['crown', 'Crown'], ['tiara', 'Tiara'], ['wizard', 'Wizard hat'], ['tophat', 'Top hat'], ['headphones', 'Headphones'], ['headset', 'Headset mic'], ['bandana', 'Bandana'], ['partyhat', 'Party hat'], ['hood', 'Animal hood'], ['star', 'Star clips'], ['heartclip', 'Heart clip'], ['flower', 'Hair flower']),
    glasses: L(['none', 'None'], ['round', 'Round'], ['square', 'Square'], ['cateye', 'Cat-eye'], ['aviator', 'Aviator shades'], ['starShade', 'Star shades'], ['heartShade', 'Heart shades'], ['visor', 'Visor'], ['monocle', 'Monocle'], ['patch', 'Eye patch']),
    earring: L(['none', 'None'], ['stud', 'Studs'], ['hoop', 'Hoop'], ['bighoop', 'Big hoops'], ['drop', 'Star drops'], ['cuff', 'Ear cuffs'], ['heart', 'Hearts']),
    neck: L(['none', 'None'], ['beads', 'Bead necklace'], ['heart', 'Heart pendant'], ['choker', 'Choker'], ['chain', 'Chain'], ['scarf', 'Scarf'], ['bowtie', 'Bow tie'], ['tie', 'Tie'], ['bandana', 'Neckerchief'], ['phones', 'Headphones round neck'], ['lei', 'Flower garland'], ['bell', 'Bell collar']),
    wrist: L(['none', 'None'], ['bands', 'Wristbands'], ['bangles', 'Bangles'], ['watch', 'Watch'], ['friend', 'Friendship bracelet'], ['both', 'Both wrists, bands']),
    gloves: L(['none', 'None'], ['fingerless', 'Fingerless'], ['full', 'Gloves']),
    back: L(['none', 'None'], ['backpack', 'Backpack'], ['cape', 'Cape'], ['angel', 'Angel wings'], ['fairy', 'Fairy wings'], ['bat', 'Bat wings'], ['butterfly', 'Butterfly wings'], ['cattail', 'Cat tail'], ['bunnytail', 'Bunny tail'], ['devil', 'Devil tail'], ['dinotail', 'Dino tail']),
    mic: L(['classic', 'Classic mic'], ['none', 'Empty hands']),
    pose: L(['idle', 'Idle'], ['cool', 'Cool'], ['sweet', 'Sweet'], ['hips', 'Hands on hips'], ['wave', 'Wave'], ['sing', 'Sing'], ['attack', 'Power note'], ['cheer', 'Cheer'], ['hurt', 'Ouch'], ['block', 'Guard'], ['windup', 'Wind-up'], ['walk', 'Walk'], ['down', 'Sit down']),
    expr: L(['auto', 'Auto'], ['neutral', 'Calm'], ['happy', 'Happy'], ['smirk', 'Smirk'], ['sing', 'Sing'], ['wow', 'Wow'], ['shy', 'Shy'], ['angry', 'Grr'], ['sleepy', 'Sleepy'], ['hurt', 'Ow']),
  };

  // ---- ranges for the sliders: [min, max, step, default] ----
  CC.RANGE = {
    headW: [0.88, 1.14, 0.01, 1], headH: [0.9, 1.12, 0.01, 1], chin: [-8, 10, 1, 0], earSize: [0.7, 1.5, 0.05, 1], neckW: [0.8, 1.4, 0.05, 1],
    height: [0.8, 1.15, 0.01, 1], build: [0.82, 1.25, 0.01, 1], torsoLen: [0.9, 1.22, 0.01, 1], legLen: [-10, 16, 1, 0], legT: [0.8, 1.3, 0.01, 1], armLen: [0.9, 1.15, 0.01, 1],
    hairVol: [0.85, 1.35, 0.01, 1],
    eyeSize: [0.78, 1.3, 0.01, 1], eyeGap: [-6, 9, 1, 0], eyeY: [-6, 7, 1, 0], eyeTilt: [-0.45, 0.55, 0.01, 0], lashes: [0, 3, 1, 2],
    browThick: [0.6, 1.8, 0.05, 1], browY: [-5, 5, 1, 0], browTilt: [-0.5, 0.6, 0.01, 0],
    noseY: [-6, 6, 1, 0], mouthW: [0.7, 1.4, 0.01, 1], mouthY: [-5, 6, 1, 0], blush: [0, 1.8, 0.05, 1],
    micLen: [0.8, 1.4, 0.01, 1],
  };

  // ---- the default character (a fresh, friendly cast member) ----
  CC.DEFAULT = {
    v: 1, name: 'New Character',
    skin: '#fdd3b6', headW: 1, headH: 1, chin: 0, jaw: 'soft', ear: 'round', earSize: 1, neckW: 1,
    height: 1, build: 1, torsoLen: 1, legLen: 0, legT: 1, armLen: 1,
    hair: 'pony_high', hairColor: '#5c321b', hairColor2: '#ff7eb6', dye: 'solid', hairline: 'auto', hairVol: 1, hairAcc: 'auto', hairAccC: '#ff9bc0',
    eyes: 'round', eyeSize: 1, eyeGap: 0, eyeY: 0, eyeTilt: 0, iris: '#6a3d1c', sparkle: 'flower', sparkleC: '#ff8fb9', lashes: 2,
    brow: 'soft', browColor: '', browThick: 1, browY: 0, browTilt: 0,
    nose: 'tick', noseY: 0, mouth: 'happyOpen', mouthW: 1, mouthY: 0, lip: '', blush: 1, blushC: '#ff8d98',
    freckles: 'none', mark: 'none', markC: '#ff7eb6', facial: 'none', facialC: '',
    onepiece: 'dress', animal: 'bear', opC1: '#fd9bb4', opC2: '#ffc9de',
    top: 'tee', topC1: '#463a32', topC2: '#ffb44d', topPattern: 'none', sleeve: 'auto',
    bottom: 'jeans', botC1: '#7fa631', botC2: '#5a7f20', botPattern: 'none',
    shoe: 'sneaker', shoeC1: '#fffaf1', shoeC2: '#ff9bc0', sock: 'ankle', sockC: '#fffaf1',
    headwear: 'none', hwC1: '#ff7eb6', hwC2: '#fff4e6', glasses: 'none', glC1: '#2d170f', glC2: '#9fd5ff',
    earring: 'hoop', earC: '#f4c64e', neck: 'heart', neckC: '#ff7fb2', wrist: 'none', wristC: '#ff7eb6', gloves: 'none', gloveC: '#2a2a36',
    back: 'none', backC: '#a77bff', mic: 'classic', micC: '#ff7fb2', micLen: 1,
  };
  CC.KEYS = Object.keys(CC.DEFAULT);
  // keys whose options live in a catalog of another name
  CC.CATKEY = { topPattern: 'pattern', botPattern: 'pattern' };
  CC.catOf = (k) => CC.CAT[CC.CATKEY[k] || k];

  const hexOk = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  // Check a character against the catalogs and ranges. Unknown keys are dropped, bad values fall back to the default (or the given base).
  CC.clean = function (c, base) {
    const D = base || CC.DEFAULT, out = {};
    c = c && typeof c === 'object' ? c : {};
    for (const k of CC.KEYS) {
      const dv = D[k], v = c[k];
      if (k === 'v') out[k] = 1;
      else if (k === 'name') out[k] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 28) : dv;
      else if (CC.RANGE[k]) { const r = CC.RANGE[k]; out[k] = Math.min(r[1], Math.max(r[0], num(v, dv))); }
      else if (CC.catOf(k)) out[k] = CC.catOf(k).some((o) => o.id === v) ? v : dv;
      else if (typeof dv === 'string' && dv.charAt(0) === '#') out[k] = hexOk(v) ? v : dv;
      else if (k === 'browColor' || k === 'facialC' || k === 'lip') out[k] = v === '' || hexOk(v) ? v : dv;
      else out[k] = dv;
    }
    return out;
  };

  // ---- presets: the owners' two and a few more to start from (every value is a real option, nothing is special-cased) ----
  const P = (o) => CC.clean(o);
  CC.PRESETS = [
    { id: 'rox', name: 'Loopy Rox', c: P({ name: 'Loopy Rox', skin: '#fdd3b6', jaw: 'lean', hair: 'mohawk', hairColor: '#6b3a22', eyes: 'almond', eyeSize: 0.96, eyeTilt: 0.2, iris: '#4c5d7e', sparkle: 'none', lashes: 0, brow: 'thick', browColor: '#5a2c18', browThick: 1, nose: 'tick', mouth: 'smirkTeeth', blush: 0.8, ear: 'round', earring: 'none', neck: 'none', onepiece: 'none', top: 'tee', topC1: '#463a32', topC2: '#ffb44d', topPattern: 'smiley', bottom: 'jeans', botC1: '#7fa631', botC2: '#5a7f20', shoe: 'sneaker', shoeC1: '#d6ed6b', shoeC2: '#f2f9b4', sock: 'none', mic: 'classic', micC: '#78bd35', build: 1.1, torsoLen: 1.17, legLen: 2, neckW: 1.1 }) },
    { id: 'jas', name: 'Jas', c: P({ name: 'Jas' }) },
    { id: 'unicorn', name: 'Unicorn kid', c: P({ name: 'Unicorn kid', skin: '#ffe3d2', hair: 'pony_low', hairColor: '#ffb9d6', hairColor2: '#c9a8f4', dye: 'ombre', eyes: 'round', iris: '#a77bff', sparkle: 'star', sparkleC: '#fff1b8', onepiece: 'onesie', animal: 'unicorn', opC1: '#ffb9d6', opC2: '#fffafd', headwear: 'hood', hwC1: '#ffb9d6', hwC2: '#fffafd', shoe: 'paws', shoeC1: '#d9c2ff', earring: 'none', neck: 'none', back: 'none', micC: '#ffd45c' }) },
    { id: 'monster', name: 'Monster Roxor', c: P({ name: 'Monster Roxor', hair: 'mohawk', hairColor: '#2f6a1c', eyes: 'almond', eyeTilt: 0.2, iris: '#4c5d7e', sparkle: 'none', lashes: 0, brow: 'thick', mouth: 'smirkTeeth', ear: 'round', earring: 'none', neck: 'none', onepiece: 'onesie', animal: 'monster', opC1: '#41741f', opC2: '#f6d5a2', headwear: 'hood', hwC1: '#41741f', hwC2: '#f6d5a2', shoe: 'paws', shoeC1: '#41741f', micC: '#78bd35' }) },
    { id: 'diva', name: 'Stage diva', c: P({ name: 'Stage diva', skin: '#a96a42', hair: 'wavy', hairColor: '#2a1a1f', hairColor2: '#ff7eb6', dye: 'streaks', eyes: 'cat', eyeTilt: 0.2, iris: '#7a4a1c', sparkle: 'star', sparkleC: '#ffd84d', lashes: 3, brow: 'thin', mouth: 'smile', lip: '#c93f78', blush: 0.6, onepiece: 'dress', opC1: '#8b4dff', opC2: '#ffd84d', neck: 'choker', neckC: '#ffd84d', earring: 'bighoop', shoe: 'heel', shoeC1: '#ffd84d', sock: 'none', micC: '#ffd84d' }) },
    { id: 'ben', name: 'Beatbox Ben', c: P({ name: 'Beatbox Ben', skin: '#dc9a6e', jaw: 'square', hair: 'undercut', hairColor: '#2a1a1f', eyes: 'sharp', iris: '#4c2b14', sparkle: 'none', lashes: 0, brow: 'thick', mouth: 'smirk', facial: 'stubble', blush: 0.5, onepiece: 'none', top: 'hoodie', topC1: '#2a2a36', topC2: '#c6ff3d', bottom: 'joggers', botC1: '#8a86a8', botC2: '#c6ff3d', shoe: 'hightop', shoeC1: '#fffaf1', shoeC2: '#c6ff3d', sock: 'none', earring: 'none', neck: 'phones', neckC: '#c6ff3d', headwear: 'capback', hwC1: '#2a2a36', hwC2: '#c6ff3d', micC: '#c6ff3d', build: 1.16, torsoLen: 1.12, neckW: 1.2 }) },
    { id: 'rocker', name: 'Rocker', c: P({ name: 'Rocker', skin: '#f7c19b', jaw: 'lean', hair: 'slick', hairColor: '#2a1a1f', eyes: 'almond', eyeTilt: 0.25, iris: '#3f9a7a', sparkle: 'none', lashes: 0, brow: 'angry', mouth: 'smirkTeeth', facial: 'goatee', blush: 0.4, onepiece: 'none', top: 'jacket', topC1: '#2a2a36', topC2: '#e8383d', bottom: 'skinny', botC1: '#1a1340', shoe: 'boot', shoeC1: '#2a2a36', shoeC2: '#8a86a8', sock: 'none', earring: 'stud', earC: '#cfd5de', neck: 'chain', neckC: '#cfd5de', wrist: 'bands', wristC: '#2a2a36', mark: 'bolt', markC: '#e8383d', micC: '#e8383d', build: 1.1, torsoLen: 1.14 }) },
    { id: 'dj', name: 'DJ Nova', c: P({ name: 'DJ Nova', skin: '#8a5233', jaw: 'square', hair: 'locs', hairColor: '#2a1a1f', hairColor2: '#ffd84d', dye: 'ombre', eyes: 'sleepy', iris: '#4c2b14', sparkle: 'none', lashes: 0, brow: 'flat', mouth: 'grin', onepiece: 'none', top: 'bomber', topC1: '#a77bff', topC2: '#ffd84d', bottom: 'cargo', botC1: '#d9b48a', shoe: 'chunky', shoeC1: '#fffaf1', shoeC2: '#a77bff', sock: 'none', glasses: 'aviator', glC1: '#ffd84d', glC2: '#a77bff', headwear: 'headphones', hwC1: '#ffd84d', hwC2: '#a77bff', earring: 'none', neck: 'none', mic: 'none', build: 1.14, torsoLen: 1.12, neckW: 1.15 }) },
    { id: 'coach', name: 'Coach', c: P({ name: 'Coach', skin: '#c98558', jaw: 'square', hair: 'flattop', hairColor: '#3a1d0f', eyes: 'almond', iris: '#4c2b14', sparkle: 'none', lashes: 0, brow: 'thick', mouth: 'grin', facial: 'moustache', onepiece: 'none', top: 'track', topC1: '#3b5bd8', topC2: '#fffaf1', bottom: 'shorts', botC1: '#3b5bd8', botC2: '#fffaf1', shoe: 'sneaker', shoeC1: '#fffaf1', shoeC2: '#3b5bd8', sock: 'crew', sockC: '#fffaf1', headwear: 'cap', hwC1: '#3b5bd8', hwC2: '#fffaf1', earring: 'none', neck: 'none', mic: 'none', build: 1.2, torsoLen: 1.1, neckW: 1.3, legT: 1.1 }) },
    { id: 'skater', name: 'Skater', c: P({ name: 'Skater', skin: '#c98558', jaw: 'lean', hair: 'shaggy', hairColor: '#3a1d0f', eyes: 'sleepy', iris: '#4c2b14', sparkle: 'none', lashes: 0, brow: 'flat', mouth: 'smirk', freckles: 'light', onepiece: 'none', top: 'hoodie', topC1: '#3b5bd8', topC2: '#fffaf1', bottom: 'baggy', botC1: '#8a86a8', shoe: 'chunky', shoeC1: '#fffaf1', shoeC2: '#e8383d', sock: 'none', headwear: 'beanie', hwC1: '#ffd84d', earring: 'stud', neck: 'none', mic: 'none' }) },
    { id: 'wizard', name: 'Vox wizard', c: P({ name: 'Vox wizard', skin: '#eeb086', hair: 'long', hairColor: '#f4f1fb', eyes: 'round', iris: '#4aa3ff', sparkle: 'star', brow: 'thick', browColor: '#b9bcc9', mouth: 'smile', facial: 'long', facialC: '#f4f1fb', onepiece: 'none', top: 'jumper', topC1: '#a77bff', topC2: '#ffd84d', topPattern: 'stars', bottom: 'jeans', botC1: '#3b5bd8', shoe: 'boot', shoeC1: '#8a5a2e', sock: 'none', headwear: 'wizard', hwC1: '#8b4dff', hwC2: '#ffd84d', earring: 'none', neck: 'none', back: 'cape', backC: '#8b4dff', mic: 'none' }) },
    { id: 'baker', name: 'Sweet baker', c: P({ name: 'Sweet baker', skin: '#f7c19b', hair: 'buns', hairColor: '#e0742c', eyes: 'round', iris: '#4f7a3a', sparkle: 'heart', sparkleC: '#ff7eb6', freckles: 'heavy', mouth: 'grin', onepiece: 'overalls', opC1: '#4aa3ff', opC2: '#ffd84d', topC1: '#fffaf1', topC2: '#ffd84d', shoe: 'sneaker', shoeC1: '#ffd84d', sock: 'crew', earring: 'stud', neck: 'none', headwear: 'none', mic: 'none' }) },
  ];

  // ---- the random roller (a seeded stream so "roll" and "mutate" are repeatable in tests) ----
  CC.roll = function (rng, base, how) {
    const r = rng, pick = (a) => a[Math.floor(r() * a.length)], id = (k) => pick(CC.CAT[k]).id, range = (k) => { const x = CC.RANGE[k]; return Math.round((x[0] + r() * (x[1] - x[0])) / x[2]) * x[2]; };
    const mild = (k) => { const x = CC.RANGE[k], mid = x[3]; return Math.round((mid + (r() - 0.5) * (x[1] - x[0]) * 0.5) / x[2]) * x[2]; };
    const c = Object.assign({}, base || CC.DEFAULT);
    const all = how !== 'outfit' && how !== 'face';
    const masc = how === 'masc' || (all && r() < 0.5);
    if (all || how === 'face' || how === 'masc') {
      c.skin = pick(CC.SKIN.slice(0, 10).concat(r() < 0.15 ? CC.SKIN.slice(10) : []));
      c.jaw = masc ? pick(['lean', 'square', 'square', 'soft']) : pick(['soft', 'soft', 'pointed', 'lean']);
      c.neckW = masc ? 1 + Math.round(r() * 6) * 0.05 : 1;
      c.eyes = id('eyes'); c.iris = pick(CC.EYE); c.sparkle = r() < 0.5 ? id('sparkle') : 'none'; c.sparkleC = pick(CC.CLOTH);
      c.lashes = masc ? 0 : Math.floor(r() * 4); c.brow = masc ? pick(['thick', 'flat', 'angry', 'soft']) : id('brow'); c.nose = id('nose'); c.mouth = id('mouth'); c.lip = !masc && r() < 0.3 ? pick(CC.LIP) : '';
      if (masc) { c.eyes = pick(['almond', 'sharp', 'sleepy', 'round', 'dot']); c.sparkle = r() < 0.2 ? id('sparkle') : 'none'; }
      c.eyeSize = mild('eyeSize'); c.eyeGap = mild('eyeGap'); c.eyeTilt = mild('eyeTilt'); c.mouthW = mild('mouthW'); c.blush = mild('blush');
      c.headW = mild('headW'); c.headH = mild('headH'); c.chin = mild('chin'); c.ear = r() < 0.7 ? 'round' : id('ear');
      c.freckles = r() < 0.7 ? 'none' : id('freckles'); c.mark = r() < 0.75 ? 'none' : id('mark'); c.markC = pick(CC.CLOTH);
      c.facial = masc ? (r() < 0.45 ? id('facial') : 'none') : (r() < 0.93 ? 'none' : id('facial')); c.glasses = r() < 0.75 ? 'none' : id('glasses'); c.glC1 = pick(CC.CLOTH); c.glC2 = pick(CC.CLOTH);
      c.hair = masc ? pick(['buzz', 'crop', 'sidepart', 'quiff', 'mohawk', 'spiky', 'undercut', 'slick', 'flattop', 'curtains', 'locs', 'manbun', 'rows', 'fauxhawk', 'shaggy', 'afro', 'curls', 'mullet', 'bald']) : id('hair'); c.hairColor = pick(CC.HAIR); c.hairColor2 = pick(CC.HAIR); c.dye = r() < 0.6 ? 'solid' : id('dye'); c.hairline = 'auto'; c.hairVol = mild('hairVol');
      c.hairAcc = id('hairAcc'); c.hairAccC = pick(CC.CLOTH);
      c.browColor = '';
    }
    if (all || how === 'outfit' || how === 'masc') {
      c.onepiece = masc ? (r() < 0.12 ? pick(['onesie', 'overalls', 'jumpsuit']) : 'none') : (r() < 0.3 ? id('onepiece') : 'none'); c.animal = id('animal'); c.opC1 = pick(CC.CLOTH); c.opC2 = pick(CC.CLOTH);
      c.top = id('top'); c.topC1 = pick(CC.CLOTH); c.topC2 = pick(CC.CLOTH); c.topPattern = r() < 0.5 ? 'none' : id('pattern'); c.sleeve = 'auto';
      c.bottom = masc ? pick(['jeans', 'skinny', 'baggy', 'joggers', 'cargo', 'shorts', 'bermuda', 'flared']) : id('bottom'); c.botC1 = pick(CC.CLOTH); c.botC2 = pick(CC.CLOTH); c.botPattern = r() < 0.8 ? 'none' : id('pattern');
      c.shoe = masc ? pick(['sneaker', 'chunky', 'hightop', 'boot', 'slipon', 'sandal']) : id('shoe'); c.shoeC1 = pick(CC.CLOTH); c.shoeC2 = pick(CC.CLOTH); c.sock = id('sock'); c.sockC = pick(CC.CLOTH);
      c.headwear = r() < 0.55 ? 'none' : id('headwear'); c.hwC1 = pick(CC.CLOTH); c.hwC2 = pick(CC.CLOTH);
      c.earring = masc ? (r() < 0.7 ? 'none' : pick(['stud', 'hoop', 'cuff'])) : id('earring'); c.earC = pick(CC.METAL); c.neck = id('neck'); c.neckC = pick(CC.CLOTH);
      c.wrist = r() < 0.6 ? 'none' : id('wrist'); c.wristC = pick(CC.CLOTH); c.gloves = r() < 0.8 ? 'none' : id('gloves'); c.gloveC = pick(CC.CLOTH);
      c.back = r() < 0.75 ? 'none' : id('back'); c.backC = pick(CC.CLOTH); c.micC = pick(CC.CLOTH);
      c.build = mild('build'); c.legLen = mild('legLen');
    }
    return CC.clean(c);
  };
  CC.rng = function (seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  // ---- share links and files ----
  CC.encode = (c) => { try { return btoa(unescape(encodeURIComponent(JSON.stringify(CC.diff(c))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; } };
  CC.decode = (s) => {
    try { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return CC.clean(JSON.parse(decodeURIComponent(escape(atob(s))))); } catch (e) { return null; }
  };
  // only the keys that differ from the default (short links)
  CC.diff = (c) => { const o = {}; for (const k of CC.KEYS) if (c[k] !== CC.DEFAULT[k]) o[k] = c[k]; return o; };
})();
