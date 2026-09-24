// Clawspire -- content. Items, statuses, enemies, encounters, relics, events,
// claw upgrades, brushes, characters, acts and a few small pure helpers.
// No DOM, no module state: everything here is data or a pure function of its
// arguments. Relic hooks mutate the fight object F they are handed, always
// through COMBAT helpers, and only when COMBAT exists.
const DATA = (() => {
  // ------------------------------------------------------------------ lists
  // The closed vocabularies other modules rely on. Tests check content
  // against these, so a typo is caught before the renderer draws a blank.
  const ITEM_ART = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask',
    'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread',
    'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star',
    'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice'];
  const ENEMY_ART = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp',
    'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic',
    'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist'];
  const TAGS = ['metal', 'weapon', 'glass', 'potion', 'heavy', 'light', 'junk', 'magic', 'food', 'tool'];
  const FX_KINDS = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'shake', 'junk',
    'purge', 'copy', 'dmgPer', 'cleanse', 'lifesteal', 'random', 'poisonAll'];
  const MOVE_KINDS = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk',
    'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape'];
  const EVENT_FX = ['hp', 'maxhp', 'gold', 'ink', 'brush', 'item', 'relic', 'remove', 'upgrade', 'claw',
    'fight', 'junk'];
  const RELIC_MODS = ['grabs', 'width', 'grip', 'speed', 'prongs', 'rubber', 'magnet', 'maxhp', 'gold',
    'ink', 'startBlock', 'startStr'];
  const RELIC_HOOKS = ['onFightStart', 'onTurnStart', 'onTurnEnd', 'onPlay', 'onGrab', 'onDmgDealt',
    'onKill', 'onHurt'];
  const RARITY_WEIGHTS = {
    1: { c: 70, u: 25, r: 5, l: 0 },
    2: { c: 55, u: 33, r: 11, l: 1 },
    3: { c: 40, u: 38, r: 18, l: 4 },
  };
  // Chance that a reward slot is drawn from the character's own pool.
  const CHAR_BIAS = 0.4;
  // Map economy the game and map read (balance bot, 40 runs per setting):
  // the bible's ~35% reveal share needs ~20 ink per act. 5 start ink left
  // the map 22% revealed and a rushing player stuck on most maps.
  const ECONOMY = {
    startInk: 10,          // ink at the start of every act (was 5)
    inkTile: 2,            // an ink tile always gives 2 (was 1, sometimes 2)
    fightInkChance: 0.5,   // a won normal fight drops 1 ink this often
    eliteInk: 2,           // ink for beating an elite (was 1)
  };

  // ------------------------------------------------------------ shape kit
  const box = (w, h) => ({ kind: 'box', w, h });
  const circle = (r) => ({ kind: 'circle', r });

  // Convex hull (monotone chain) of loose points, wound so the shoelace
  // area is positive (CCW in math terms, same winding as PHYS.box), then
  // shifted so the area centroid sits on the origin. Hand-typed outlines
  // may be sloppy; what reaches the physics engine never is.
  function poly(pts) {
    const p = pts.map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], hi = [];
    for (const q of p) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
      lo.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
      hi.push(q);
    }
    const h = lo.slice(0, -1).concat(hi.slice(0, -1));
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < h.length; i++) {
      const s = h[i], t = h[(i + 1) % h.length];
      const c = s.x * t.y - t.x * s.y;
      a += c; cx += (s.x + t.x) * c; cy += (s.y + t.y) * c;
    }
    cx /= 3 * a; cy /= 3 * a;
    const r1 = (v) => Math.round(v * 10) / 10;
    return { kind: 'poly', verts: h.map(v => ({ x: r1(v.x - cx), y: r1(v.y - cy) })) };
  }
  // Regular n-gon, first vertex pointing up.
  function ngon(n, r) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return poly(pts);
  }
  // Egg: an octagon whose top half is pinched narrower than the bottom.
  function egg(rx, ry) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const s = Math.sin(a);
      pts.push([Math.cos(a) * rx * (s < 0 ? 0.8 : 1), s * ry]);
    }
    return poly(pts);
  }

  const SHAPES = {
    kite: poly([[-17, -18], [17, -18], [17, 4], [0, 22], [-17, 4]]),
    heater: poly([[-14, -15], [14, -15], [14, 3], [0, 16], [-14, 3]]),
    axe: poly([[-4, -28], [6, -28], [18, -20], [20, -6], [3, 28], [-3, 28]]),
    hammer: poly([[-16, -22], [16, -22], [16, -8], [3, 24], [-3, 24], [-16, -8]]),
    mallet: poly([[-12, -16], [12, -16], [12, -6], [3, 18], [-3, 18], [-12, -6]]),
    anvil: poly([[-26, -14], [26, -14], [22, -6], [14, 14], [-14, 14], [-22, -6]]),
    potion: poly([[-4, -17], [4, -17], [12, -3], [12, 11], [6, 17], [-6, 17], [-12, 11], [-12, -3]]),
    flask: poly([[-4, -15], [4, -15], [14, 15], [-14, 15]]),
    bottle: poly([[-3, -20], [3, -20], [9, -7], [9, 20], [-9, 20], [-9, -7]]),
    shard: poly([[1, -22], [8, 2], [0, 22], [-7, -2]]),
    gem: poly([[-9, -12], [9, -12], [15, -2], [0, 14], [-15, -2]]),
    rock: poly([[-14, -6], [-6, -14], [10, -12], [16, 2], [8, 13], [-10, 12]]),
    slag: poly([[-18, -4], [-8, -14], [12, -12], [19, 0], [10, 14], [-12, 12]]),
    skull: poly([[-13, -12], [-6, -16], [6, -16], [13, -12], [14, 2], [8, 14], [-8, 14], [-14, 2]]),
    star: ngon(5, 17),
    boot: poly([[-10, -18], [4, -18], [8, 4], [18, 8], [18, 16], [-10, 16]]),
    heart: poly([[8, -15], [15, -9], [15, 0], [0, 15], [-15, 0], [-15, -9], [-8, -15]]),
    lantern: poly([[-6, -18], [6, -18], [11, -8], [11, 12], [6, 18], [-6, 18], [-11, 12], [-11, -8]]),
    mask: poly([[-15, -14], [15, -14], [16, 0], [9, 15], [-9, 15], [-16, 0]]),
    bread: poly([[-20, 2], [-16, -8], [-6, -11], [6, -11], [16, -8], [20, 2], [18, 9], [-18, 9]]),
    horn: poly([[-20, -12], [-13, -15], [19, 3], [17, 9], [-17, 2]]),
    egg: egg(12, 16),
    bigEgg: egg(15, 20),
  };

  // --------------------------------------------------------------- fx kit
  const dmg = (v, n) => (n ? { k: 'dmg', v, n } : { k: 'dmg', v });
  const block = (v) => ({ k: 'block', v });
  const heal = (v) => ({ k: 'heal', v });
  const status = (s, v, to) => ({ k: 'status', s, v, to: to || 'enemy' });
  const grab = (v) => ({ k: 'grab', v });
  const gold = (v) => ({ k: 'gold', v });
  const ink = (v) => ({ k: 'ink', v });
  const maxhp = (v) => ({ k: 'maxhp', v });
  const shake = () => ({ k: 'shake' });
  const junk = (id, n) => ({ k: 'junk', id, n, to: 'self' });
  const purge = (n) => ({ k: 'purge', n });
  const copy = () => ({ k: 'copy' });
  const dmgPer = (v, per) => ({ k: 'dmgPer', v, per });
  const cleanse = () => ({ k: 'cleanse' });
  const lifesteal = (v) => ({ k: 'lifesteal', v });
  // v is the rounded expected roll, kept for previews; combat rolls min..max.
  const random = (min, max) => ({ k: 'random', v: Math.round((min + max) / 2), min, max });
  // No v: every enemy takes damage equal to its Poison right now.
  const poisonAll = () => ({ k: 'poisonAll' });

  // ------------------------------------------------------------------ items
  // Physical feel, by design: long thin things (swords, staffs) twist out of
  // the prongs, balls sit nicely in the palm, flat discs and coins slide,
  // heavy things (anvil, hammer, tower shield) need grip. Starters are
  // flagged so reward pools and shops skip them.
  const ITEM_LIST = [
    // ---- Knight: swords, shields, metal, sturdy ----
    { id: 'rusty_sword', name: 'Rusty Sword', rarity: 'c', cost: 40, char: 'knight', starter: true,
      tags: ['metal', 'weapon'], shape: box(48, 10), density: 1.3, friction: 0.45,
      color: '#b7a58c', color2: '#6b4a2b', art: 'sword',
      fx: [dmg(6)], plus: { fx: [dmg(9)] }, text: 'Deal {v} damage. It has seen better centuries.' },
    { id: 'dented_shield', name: 'Dented Shield', rarity: 'c', cost: 40, char: 'knight', starter: true,
      tags: ['metal'], shape: SHAPES.kite, density: 1.2, friction: 0.35,
      color: '#8fa3b8', color2: '#3d4f66', art: 'shield', target: 'self',
      fx: [block(5)], plus: { fx: [block(8)] }, text: 'Gain {v} Block. The dent is load-bearing.' },
    { id: 'spiked_buckler', name: 'Spiked Buckler', rarity: 'c', cost: 45, char: 'knight',
      tags: ['metal', 'weapon'], shape: circle(15), density: 1.6, friction: 0.35, restitution: 0.2,
      color: '#c9cfd6', color2: '#ff5a4a', art: 'buckler',
      fx: [block(3), dmgPer(1, 'block')], plus: { fx: [block(6), dmgPer(1, 'block')] },
      text: 'Gain {v} Block, then deal damage equal to your Block. A hug, but pointy.' },
    { id: 'iron_chain', name: 'Iron Chain', rarity: 'c', cost: 50, char: 'knight',
      tags: ['metal', 'weapon', 'heavy'], shape: box(58, 10), density: 2.2, friction: 0.6,
      color: '#7d8590', color2: '#3b4048', art: 'chain', target: 'all',
      fx: [dmg(5)], plus: { fx: [dmg(8)] }, text: 'Deal {v} damage to ALL enemies. Clanks with enthusiasm.' },
    { id: 'heater_shield', name: 'Heater Shield', rarity: 'c', cost: 45, char: 'knight',
      tags: ['metal', 'heavy'], shape: SHAPES.heater, density: 2.0, friction: 0.5,
      color: '#ffc94d', color2: '#8a2b2b', art: 'shield', target: 'self',
      fx: [block(8)], plus: { fx: [block(11)] }, text: 'Gain {v} Block. Heavy. Heavy is good.' },
    { id: 'longsword', name: 'Longsword', rarity: 'u', cost: 65, char: 'knight',
      tags: ['metal', 'weapon'], shape: box(58, 10), density: 1.4, friction: 0.45,
      color: '#dfe6ee', color2: '#4a3b8c', art: 'sword',
      fx: [dmg(11)], plus: { fx: [dmg(15)] }, text: 'Deal {v} damage. Mostly handle, somehow.' },
    { id: 'tower_shield', name: 'Tower Shield', rarity: 'u', cost: 70, char: 'knight',
      tags: ['metal', 'heavy'], shape: box(36, 50), density: 2.4, friction: 0.6,
      color: '#6f7f99', color2: '#2ee6d6', art: 'shield', target: 'self',
      fx: [block(12)], plus: { fx: [block(16)] }, text: 'Gain {v} Block. Weighs about as much as your regrets.' },
    { id: 'whetstone', name: 'Whetstone', rarity: 'u', cost: 60, char: 'knight',
      tags: ['tool', 'heavy'], shape: box(34, 14), density: 2.0, friction: 0.7,
      color: '#8a8f99', color2: '#c7ccd4', art: 'whetstone', target: 'self', exhaust: true,
      fx: [status('str', 2, 'self')], plus: { fx: [status('str', 3, 'self')] },
      text: 'Gain {v} Strength. Sparks included.' },
    { id: 'battle_axe', name: 'Executioner Axe', rarity: 'r', cost: 100, char: 'knight',
      tags: ['metal', 'weapon', 'heavy'], shape: SHAPES.axe, density: 1.8, friction: 0.5,
      color: '#aab3bd', color2: '#6b4a2b', art: 'axe',
      fx: [dmg(17)], plus: { fx: [dmg(23)] }, text: 'Deal {v} damage. Heavy, honest, rude.' },
    { id: 'war_hammer', name: 'Bonk Hammer', rarity: 'r', cost: 100, char: 'knight',
      tags: ['metal', 'weapon', 'heavy'], shape: SHAPES.hammer, density: 2.4, friction: 0.55,
      color: '#9aa4ad', color2: '#5a3a22', art: 'hammer',
      fx: [dmg(12), status('vuln', 2)], plus: { fx: [dmg(16), status('vuln', 3)] },
      text: 'Deal {v} damage and apply {v2} Vulnerable. Bonk, with paperwork.' },
    { id: 'war_horn', name: 'War Horn', rarity: 'r', cost: 95, char: 'knight',
      tags: ['tool'], shape: SHAPES.horn, density: 0.9, friction: 0.5,
      color: '#e8d6a8', color2: '#8a5a2b', art: 'horn', target: 'self', exhaust: true,
      fx: [status('str', 2, 'self'), block(6)], plus: { fx: [status('str', 3, 'self'), block(9)] },
      text: 'Gain {v} Strength and {v2} Block. The neighbours complain.' },
    { id: 'family_anvil', name: 'Family Anvil', rarity: 'l', cost: 130, char: 'knight',
      tags: ['metal', 'heavy', 'weapon'], shape: SHAPES.anvil, density: 2.4, friction: 0.7,
      color: '#4a4f58', color2: '#ffc94d', art: 'anvil',
      fx: [dmgPer(3, 'metal')], plus: { fx: [dmgPer(4, 'metal')] },
      text: 'Deal {v} damage for each metal item in your bin. Good luck lifting it.' },

    // ---- Alchemist: potions, bombs, poison, junk control ----
    { id: 'toxic_vial', name: 'Toxic Vial', rarity: 'c', cost: 40, char: 'alchemist', starter: true,
      tags: ['glass', 'potion'], shape: SHAPES.flask, density: 0.8, friction: 0.4,
      color: '#a6ff5e', color2: '#2d5a1a', art: 'flask',
      fx: [dmg(2), status('poison', 3)], plus: { fx: [dmg(3), status('poison', 5)] },
      text: 'Deal {v} damage and apply {v2} Poison. Do not drink.' },
    { id: 'bubble_flask', name: 'Bubble Flask', rarity: 'c', cost: 40, char: 'alchemist', starter: true,
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#7fd6ff', color2: '#1b4f73', art: 'potion', target: 'self',
      fx: [block(5)], plus: { fx: [block(8)] }, text: 'Gain {v} Block. The bubbles do the blocking.' },
    { id: 'cherry_bomb', name: 'Cherry Bomb', rarity: 'c', cost: 45, char: 'alchemist',
      tags: ['weapon'], shape: circle(13), density: 1.1, friction: 0.5, restitution: 0.25,
      color: '#ff5a4a', color2: '#2a1a1a', art: 'bomb', target: 'all',
      fx: [dmg(4)], plus: { fx: [dmg(6)] }, text: 'Deal {v} damage to ALL enemies. Contains no cherries.' },
    { id: 'stink_potion', name: 'Stink Potion', rarity: 'c', cost: 40, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#8fae3a', color2: '#4a3a1a', art: 'potion',
      fx: [status('poison', 4)], plus: { fx: [status('poison', 6)] },
      text: 'Apply {v} Poison. The cork was the only thing holding it back.' },
    { id: 'alembic', name: 'Alembic', rarity: 'c', cost: 50, char: 'alchemist',
      tags: ['glass', 'tool'], shape: SHAPES.flask, density: 0.9, friction: 0.4,
      color: '#d8f0ff', color2: '#ff2e88', art: 'flask', target: 'self',
      fx: [purge(2), block(4)], plus: { fx: [purge(3), block(6)] },
      text: 'Remove {n} junk from your bin, then gain {v} Block. Science!' },
    { id: 'liquid_fire', name: 'Liquid Fire', rarity: 'u', cost: 65, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#ff8a2e', color2: '#ffc94d', art: 'potion', target: 'all',
      fx: [status('burn', 3, 'all')], plus: { fx: [status('burn', 5, 'all')] },
      text: 'Apply {v} Burn to ALL enemies. Smells like a barbecue argument.' },
    { id: 'frost_phial', name: 'Frost Phial', rarity: 'u', cost: 60, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.bottle, density: 0.8, friction: 0.35,
      color: '#bfefff', color2: '#2ee6d6', art: 'bottle', target: 'all',
      fx: [status('chill', 2, 'all'), block(4)], plus: { fx: [status('chill', 3, 'all'), block(6)] },
      text: 'Apply {v} Chill to ALL enemies and gain {v2} Block. Serve cold.' },
    { id: 'acid_bottle', name: 'Acid Bottle', rarity: 'u', cost: 65, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.bottle, density: 0.8, friction: 0.35,
      color: '#d4ff3a', color2: '#5a6b1a', art: 'bottle',
      fx: [status('vuln', 2), status('poison', 3)], plus: { fx: [status('vuln', 3), status('poison', 5)] },
      text: 'Apply {v} Vulnerable and {v2} Poison. Eats through armor and friendships.' },
    { id: 'volatile_egg', name: 'Volatile Egg', rarity: 'u', cost: 55, char: 'alchemist',
      tags: ['food', 'magic'], shape: SHAPES.egg, density: 1.0, friction: 0.35, restitution: 0.15,
      color: '#fff3d6', color2: '#ff2e88', art: 'egg', target: 'random',
      fx: [random(2, 14)], plus: { fx: [random(5, 16)] },
      text: 'Deal {min} to {max} damage to a random enemy. Do not incubate.' },
    { id: 'elixir', name: 'Elixir of Vigor', rarity: 'r', cost: 95, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#ff2e88', color2: '#ffc94d', art: 'potion', target: 'self', exhaust: true,
      fx: [heal(6), status('regen', 3, 'self')], plus: { fx: [heal(9), status('regen', 4, 'self')] },
      text: 'Heal {v} HP and gain {v2} Regen. Tastes like cough syrup and victory.' },
    { id: 'plague_orb', name: 'Plague Orb', rarity: 'r', cost: 105, char: 'alchemist',
      tags: ['glass', 'magic'], shape: circle(17), density: 1.0, friction: 0.35, restitution: 0.15,
      color: '#6bd35e', color2: '#12091f', art: 'orb', target: 'all',
      fx: [status('poison', 3, 'all'), poisonAll()], plus: { fx: [status('poison', 5, 'all'), poisonAll()] },
      text: 'Apply {v} Poison to ALL enemies, then every enemy takes its Poison right now.' },
    { id: 'philosophers_stone', name: "Philosopher's Stone", rarity: 'l', cost: 130, char: 'alchemist',
      tags: ['magic'], shape: SHAPES.gem, density: 1.6, friction: 0.45,
      color: '#ff2e88', color2: '#ffc94d', art: 'gem', target: 'none', exhaust: true,
      fx: [purge(3), copy(), copy()], plus: { fx: [purge(3), copy(), copy(), copy()] },
      text: 'Remove {n} junk, then copy {copies} random items in your bin for this fight. Lead not included.' },

    // ---- Rogue: daggers, coins, dodge, extra grabs ----
    { id: 'shiv', name: 'Shiv', rarity: 'c', cost: 40, char: 'rogue', starter: true,
      tags: ['metal', 'weapon', 'light'], shape: box(30, 9), density: 1.2, friction: 0.45,
      color: '#d0d6de', color2: '#3a2a4a', art: 'dagger',
      fx: [dmg(5)], plus: { fx: [dmg(8)] }, text: 'Deal {v} damage. Small, pointy, deniable.' },
    { id: 'old_boot', name: 'Old Boot', rarity: 'c', cost: 40, char: 'rogue', starter: true,
      tags: [], shape: SHAPES.boot, density: 0.9, friction: 0.7,
      color: '#7a5236', color2: '#3a2616', art: 'boot', target: 'self',
      fx: [block(5)], plus: { fx: [block(8)] }, text: 'Gain {v} Block. Smells like a plan.' },
    { id: 'lucky_coin', name: 'Lucky Coin', rarity: 'c', cost: 45, char: 'rogue',
      tags: ['metal'], shape: circle(11), density: 2.4, friction: 0.3, restitution: 0.3,
      color: '#ffc94d', color2: '#b8862b', art: 'coin',
      fx: [dmg(3), gold(3)], plus: { fx: [dmg(5), gold(5)] },
      text: 'Deal {v} damage and gain {v2} gold. Heads, you win.' },
    { id: 'serrated_knife', name: 'Serrated Knife', rarity: 'c', cost: 45, char: 'rogue',
      tags: ['metal', 'weapon', 'light'], shape: box(34, 9), density: 1.2, friction: 0.5,
      color: '#c0c7cf', color2: '#ff5a4a', art: 'dagger',
      fx: [dmg(3), status('bleed', 3)], plus: { fx: [dmg(4), status('bleed', 5)] },
      text: 'Deal {v} damage and apply {v2} Bleed. The teeth are decorative. Also functional.' },
    { id: 'smoke_bomb', name: 'Smoke Bomb', rarity: 'c', cost: 50, char: 'rogue',
      tags: ['light'], shape: circle(15), density: 0.7, friction: 0.5, restitution: 0.2,
      color: '#8a8aa0', color2: '#2e2e3a', art: 'bomb', target: 'self',
      fx: [status('dodge', 1, 'self'), status('weak', 1, 'all')],
      plus: { fx: [status('dodge', 2, 'self'), status('weak', 2, 'all')] },
      text: 'Gain {v} Dodge and apply {v2} Weak to ALL enemies. Poof.' },
    { id: 'twin_daggers', name: 'Twin Daggers', rarity: 'u', cost: 65, char: 'rogue',
      tags: ['metal', 'weapon'], shape: box(36, 12), density: 1.3, friction: 0.45,
      color: '#e6ebf0', color2: '#ff2e88', art: 'dagger',
      fx: [dmg(3, 3)], plus: { fx: [dmg(4, 3)] }, text: 'Deal {v} damage {n} times. Twins, not triplets. Mostly.' },
    { id: 'skeleton_key', name: 'Skeleton Key', rarity: 'u', cost: 70, char: 'rogue',
      tags: ['metal', 'tool'], shape: box(34, 12), density: 1.5, friction: 0.4,
      color: '#ffc94d', color2: '#7a5a1a', art: 'key', target: 'none',
      fx: [grab(1), block(2)], plus: { fx: [grab(1), block(5)] },
      text: 'Gain {v} extra grab this turn and {v2} Block. Opens everything except your heart.' },
    { id: 'loaded_dice', name: 'Loaded Dice', rarity: 'u', cost: 55, char: 'rogue',
      tags: ['tool'], shape: box(24, 24), density: 1.2, friction: 0.4, restitution: 0.3,
      color: '#f4f0e6', color2: '#ff2e88', art: 'dice',
      fx: [random(2, 12)], plus: { fx: [random(6, 12)] }, text: 'Deal {min} to {max} damage. The dice know.' },
    { id: 'stolen_gem', name: 'Stolen Gem', rarity: 'r', cost: 95, char: 'rogue',
      tags: ['magic'], shape: SHAPES.gem, density: 1.6, friction: 0.4,
      color: '#2ee6d6', color2: '#1a6b66', art: 'gem',
      fx: [dmg(6), gold(10)], plus: { fx: [dmg(9), gold(14)] },
      text: 'Deal {v} damage and gain {v2} gold. Finders keepers.' },
    { id: 'thieves_ring', name: "Thief's Ring", rarity: 'r', cost: 100, char: 'rogue',
      tags: ['metal', 'magic'], shape: circle(10), density: 2.0, friction: 0.35, restitution: 0.2,
      color: '#ffc94d', color2: '#ff2e88', art: 'ring',
      fx: [dmgPer(3, 'grabsUsed')], plus: { fx: [dmgPer(4, 'grabsUsed')] },
      text: 'Deal {v} damage for each grab used this turn. Save it for last.' },
    { id: 'harlequin_mask', name: 'Harlequin Mask', rarity: 'r', cost: 95, char: 'rogue',
      tags: ['magic', 'light'], shape: SHAPES.mask, density: 0.6, friction: 0.5,
      color: '#ff2e88', color2: '#12091f', art: 'mask', target: 'self',
      fx: [status('dodge', 2, 'self'), grab(1)], plus: { fx: [status('dodge', 3, 'self'), grab(1)] },
      text: 'Gain {v} Dodge and {v2} extra grab this turn. Nobody knows it is you.' },
    { id: 'wishing_star', name: 'Wishing Star', rarity: 'l', cost: 125, char: 'rogue',
      tags: ['magic', 'light'], shape: SHAPES.star, density: 0.6, friction: 0.5, restitution: 0.2,
      color: '#ffe066', color2: '#ff9a2e', art: 'star', target: 'self', exhaust: true,
      fx: [grab(2), status('dodge', 2, 'self')], plus: { fx: [grab(3), status('dodge', 2, 'self')] },
      text: 'Gain {v} extra grabs and {v2} Dodge. Wish responsibly.' },

    // ---- Shared ----
    { id: 'crisp_apple', name: 'Crisp Apple', rarity: 'c', cost: 40,
      tags: ['food'], shape: circle(13), density: 0.8, friction: 0.5,
      color: '#ff5a4a', color2: '#a6ff5e', art: 'apple', target: 'self',
      fx: [heal(4)], plus: { fx: [heal(6)] }, text: 'Heal {v} HP. Keeps the Prize Master away.' },
    { id: 'stale_bread', name: 'Stale Bread', rarity: 'c', cost: 40,
      tags: ['food'], shape: SHAPES.bread, density: 0.9, friction: 0.8,
      color: '#d9a35e', color2: '#8a5a2b', art: 'bread', target: 'self',
      fx: [block(6)], plus: { fx: [block(9)] }, text: 'Gain {v} Block. Hard enough to count as armor.' },
    { id: 'torch', name: 'Torch', rarity: 'c', cost: 45,
      tags: ['light', 'weapon'], shape: box(42, 10), density: 0.6, friction: 0.5,
      color: '#8a5a2b', color2: '#ff8a2e', art: 'torch',
      fx: [dmg(4), status('burn', 2)], plus: { fx: [dmg(5), status('burn', 4)] },
      text: 'Deal {v} damage and apply {v2} Burn. A classic for a reason.' },
    { id: 'snowball', name: 'Snowball', rarity: 'c', cost: 40,
      tags: ['light'], shape: circle(14), density: 0.5, friction: 0.2, restitution: 0.05,
      color: '#f2fbff', color2: '#9fd8ff', art: 'snowball',
      fx: [dmg(3), status('chill', 1)], plus: { fx: [dmg(5), status('chill', 2)] },
      text: 'Deal {v} damage and apply {v2} Chill. Three Chill freezes solid.' },
    { id: 'femur', name: 'Femur', rarity: 'c', cost: 40,
      tags: ['weapon'], shape: box(44, 12), density: 0.9, friction: 0.5,
      color: '#f0e8d0', color2: '#b8ab88', art: 'bone',
      fx: [dmg(7)], plus: { fx: [dmg(10)] }, text: "Deal {v} damage. It was someone's leg, once." },
    { id: 'empty_bottle', name: 'Empty Bottle', rarity: 'c', cost: 40,
      tags: ['glass', 'weapon'], shape: SHAPES.bottle, density: 0.8, friction: 0.35,
      color: '#6bd3a0', color2: '#1a4a33', art: 'bottle', exhaust: true,
      fx: [dmg(9)], plus: { fx: [dmg(13)] }, text: 'Deal {v} damage. It shatters, so it is a one-time deal.' },
    { id: 'tickle_feather', name: 'Tickle Feather', rarity: 'c', cost: 40,
      tags: ['light'], shape: box(44, 8), density: 0.5, friction: 0.3,
      color: '#ff9ad0', color2: '#ffffff', art: 'feather',
      fx: [status('weak', 2)], plus: { fx: [status('weak', 3)] },
      text: 'Apply {v} Weak. Hard to swing a club while giggling.' },
    { id: 'icicle', name: 'Icicle', rarity: 'c', cost: 45,
      tags: ['weapon', 'glass'], shape: SHAPES.shard, density: 1.0, friction: 0.15,
      color: '#bfefff', color2: '#2ee6d6', art: 'iceshard',
      fx: [dmg(4, 2)], plus: { fx: [dmg(5, 2)] }, text: 'Deal {v} damage {n} times. Pointy at both ends.' },
    { id: 'rattle_mallet', name: 'Rattle Mallet', rarity: 'c', cost: 45,
      tags: ['tool', 'weapon'], shape: SHAPES.mallet, density: 1.4, friction: 0.5,
      color: '#b8864a', color2: '#5a3a22', art: 'hammer',
      fx: [dmg(5), shake()], plus: { fx: [dmg(8), shake()] },
      text: 'Deal {v} damage and shake your bin loose. Percussive maintenance.' },
    { id: 'pot_lid', name: 'Pot Lid', rarity: 'c', cost: 40,
      tags: ['metal'], shape: circle(16), density: 1.3, friction: 0.3, restitution: 0.2,
      color: '#b0b8c0', color2: '#5a6068', art: 'buckler', target: 'self',
      fx: [block(6)], plus: { fx: [block(9)] }, text: 'Gain {v} Block. Dinner can wait.' },
    { id: 'map_scrap', name: 'Map Scrap', rarity: 'u', cost: 55,
      tags: ['light', 'magic'], shape: box(42, 14), density: 0.5, friction: 0.6,
      color: '#f0e0b0', color2: '#8a5a2b', art: 'scroll', target: 'none', exhaust: true,
      fx: [ink(1)], plus: { fx: [ink(2)] }, text: 'Gain {v} Ink. X marks several spots.' },
    { id: 'rulebook', name: 'Rulebook', rarity: 'u', cost: 60,
      tags: ['magic'], shape: box(30, 38), density: 1.0, friction: 0.6,
      color: '#4a3b8c', color2: '#ffc94d', art: 'book', target: 'self',
      fx: [cleanse(), block(6)], plus: { fx: [cleanse(), block(9)] },
      text: 'Remove your debuffs and gain {v} Block. Rule one: no crying.' },
    { id: 'grudge_skull', name: 'Grudge Skull', rarity: 'u', cost: 65,
      tags: ['magic'], shape: SHAPES.skull, density: 1.2, friction: 0.45,
      color: '#f0e8d0', color2: '#ff2e88', art: 'skull',
      fx: [dmg(3), dmgPer(3, 'junk')], plus: { fx: [dmg(5), dmgPer(4, 'junk')] },
      text: 'Deal {v} damage, plus {v2} for each junk item in your bin. It holds grudges.' },
    { id: 'leech_wand', name: 'Leech Wand', rarity: 'u', cost: 65,
      tags: ['magic', 'light'], shape: box(40, 8), density: 0.6, friction: 0.45,
      color: '#8a2b4a', color2: '#ff5a4a', art: 'wand',
      fx: [lifesteal(6)], plus: { fx: [lifesteal(9)] },
      text: 'Deal {v} damage and heal what gets through. Slurp.' },
    { id: 'rubble_bomb', name: 'Rubble Bomb', rarity: 'u', cost: 60,
      tags: ['weapon', 'heavy'], shape: circle(18), density: 1.6, friction: 0.5, restitution: 0.15,
      color: '#5a5048', color2: '#ff8a2e', art: 'bomb', target: 'all',
      fx: [dmg(10), junk('rock', 2)], plus: { fx: [dmg(14), junk('rock', 2)] },
      text: 'Deal {v} damage to ALL enemies. Adds {n} Rocks to your bin. Big boom, big mess.' },
    { id: 'spooky_lantern', name: 'Spooky Lantern', rarity: 'u', cost: 65,
      tags: ['glass', 'magic'], shape: SHAPES.lantern, density: 1.0, friction: 0.45,
      color: '#2ee6d6', color2: '#3a2a4a', art: 'lantern', target: 'all',
      fx: [status('burn', 3, 'all'), block(3)], plus: { fx: [status('burn', 5, 'all'), block(4)] },
      text: 'Apply {v} Burn to ALL enemies and gain {v2} Block. Boo, but warm.' },
    { id: 'crystal_ball', name: 'Crystal Ball', rarity: 'u', cost: 65,
      tags: ['glass', 'magic'], shape: circle(15), density: 1.1, friction: 0.3, restitution: 0.15,
      color: '#d8c8ff', color2: '#7a5aff', art: 'orb', target: 'all',
      fx: [status('weak', 2, 'all')], plus: { fx: [status('weak', 3, 'all')] },
      text: 'Apply {v} Weak to ALL enemies. It saw this coming.' },
    { id: 'golden_egg', name: 'Golden Egg', rarity: 'r', cost: 95,
      tags: ['food', 'magic', 'metal'], shape: SHAPES.egg, density: 1.8, friction: 0.35,
      color: '#ffc94d', color2: '#fff3a0', art: 'egg', target: 'none', exhaust: true,
      fx: [copy(), gold(6)], plus: { fx: [copy(), gold(12)] },
      text: 'Copy a random item in your bin for this fight and gain {v} gold. Mind the goose.' },
    { id: 'spare_heart', name: 'Spare Heart', rarity: 'r', cost: 100,
      tags: ['food', 'magic'], shape: SHAPES.heart, density: 1.0, friction: 0.5,
      color: '#ff2e88', color2: '#8a1a4a', art: 'heart', target: 'self', exhaust: true,
      fx: [maxhp(3)], plus: { fx: [maxhp(5)] },
      text: 'Gain {v} Max HP and heal {v}. Best not to ask where it came from.' },
    { id: 'dragon_egg', name: 'Dragon Egg', rarity: 'l', cost: 130,
      tags: ['magic', 'heavy'], shape: SHAPES.bigEgg, density: 1.8, friction: 0.4,
      color: '#ff5a4a', color2: '#ffc94d', art: 'egg', target: 'all',
      fx: [dmg(6), status('burn', 5, 'all')], plus: { fx: [dmg(9), status('burn', 7, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. It hatched angry.' },

    // ---- Junk: clogs the bin, does nothing useful, clears when grabbed ----
    { id: 'rock', name: 'Rock', rarity: 'junk', cost: 0,
      tags: ['junk', 'heavy'], shape: SHAPES.rock, density: 2.0, friction: 0.7,
      color: '#7a7068', color2: '#4a4440', art: 'rock', target: 'none', exhaust: true,
      fx: [], text: 'Does nothing. It is a rock. Grab it out to clear it for this fight.' },
    { id: 'slag', name: 'Slag', rarity: 'junk', cost: 0,
      tags: ['junk', 'heavy', 'metal'], shape: SHAPES.slag, density: 2.4, friction: 0.8,
      color: '#3a3230', color2: '#ff8a2e', art: 'slag', target: 'self', exhaust: true,
      fx: [status('burn', 2, 'self')], text: 'Still warm. Grabbing it out gives you {v} Burn.' },
    { id: 'iceblock', name: 'Ice Block', rarity: 'junk', cost: 0,
      tags: ['junk', 'glass'], shape: box(36, 34), density: 1.2, friction: 0.05, restitution: 0.05,
      color: '#cfefff', color2: '#7fc8e8', art: 'iceblock', target: 'none', exhaust: true,
      fx: [], text: 'Slippery, cold, useless. Grab it out to clear it for this fight.' },
  ];
  const ITEMS = {};
  for (const d of ITEM_LIST) {
    const def = Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'enemy', tags: [] }, d);
    if (def.plus) def.plus = Object.assign({ name: def.name + '+' }, def.plus);
    ITEMS[def.id] = def;
  }
  const ITEM_IDS = Object.keys(ITEMS);

  // ----------------------------------------------------------------- status
  const STATUS = {};
  [
    ['block', 'Block', '🛡', '#7fb2ff', 'buff', 'count', 'Absorbs damage. Fades at the start of your turn.'],
    ['str', 'Strength', '💪', '#ff5a4a', 'buff', 'count', '+1 damage per hit for each stack.'],
    ['weak', 'Weak', '🥀', '#b08cff', 'debuff', 'turns', 'Deals 25% less damage.'],
    ['vuln', 'Vulnerable', '💔', '#ff8a2e', 'debuff', 'turns', 'Takes 50% more damage.'],
    ['poison', 'Poison', '☠', '#a6ff5e', 'debuff', 'count', 'Loses HP equal to Poison at turn start, then Poison drops by 1.'],
    ['burn', 'Burn', '🔥', '#ff8a2e', 'debuff', 'count', 'Loses HP equal to Burn, then Burn drops by 1. You burn at the end of your turn, enemies when they act.'],
    ['chill', 'Chill', '❄', '#9fd8ff', 'debuff', 'count', 'At 3 Chill, freeze solid and reset.'],
    ['freeze', 'Frozen', '🧊', '#2ee6d6', 'debuff', 'turns', 'Enemies skip their action. You lose a grab.'],
    ['regen', 'Regen', '💚', '#6bd35e', 'buff', 'count', 'Heals Regen HP at turn start, then Regen drops by 1.'],
    ['thorns', 'Thorns', '🌵', '#8fae3a', 'buff', 'count', 'Attackers take this much damage back.'],
    ['dodge', 'Dodge', '💨', '#e6ebf0', 'buff', 'count', 'The next attacks miss, one per stack.'],
    ['bleed', 'Bleed', '🩸', '#ff2e4a', 'debuff', 'count', 'Loses HP equal to Bleed when acting, then Bleed drops by 1.'],
    ['stun', 'Stunned', '💫', '#ffe066', 'debuff', 'turns', 'Skips the next action.'],
    ['grease', 'Greased', '🛢', '#c8a040', 'debuff', 'turns', 'Your bin is slippery. Everything slides out of the claw.'],
    ['fog', 'Fogged', '🌫', '#a0a8b8', 'debuff', 'turns', 'The cabinet glass is fogged. Good luck.'],
    ['shield_up', 'Bulwark', '🔰', '#7fb2ff', 'buff', 'turns', 'Block does not fade at turn start.'],
    ['enrage', 'Enrage', '😡', '#ff2e4a', 'buff', 'count', 'Gains this much Strength every turn.'],
    ['armor', 'Armor', '🔩', '#aab3bd', 'buff', 'count', 'Every hit taken is reduced by this much.'],
  ].forEach(([id, name, icon, color, kind, stack, text]) => {
    STATUS[id] = { id, name, icon, color, kind, stack, text };
  });

  // ---------------------------------------------------------------- enemies
  // Move helpers. Note a summon move's id IS the enemy id it summons (the
  // contract's `summon {id}` shares the field with the move id).
  const atk = (id, name, v, n, txt) => (n && n > 1 ? { id, name, k: 'attack', v, n, txt } : { id, name, k: 'attack', v, txt });
  const blk = (id, name, v, txt) => ({ id, name, k: 'block', v, txt });
  const buff = (id, name, s, v, txt) => ({ id, name, k: 'buff', s, v, txt });
  const debuff = (id, name, s, v, txt) => ({ id, name, k: 'debuff', s, v, txt });
  const mheal = (id, name, v, txt) => ({ id, name, k: 'heal', v, txt });
  const mv = (id, name, k, txt, extra) => Object.assign({ id, name, k, txt }, extra || {});
  const w = (m, weight) => Object.assign(m, { w: weight });

  // Charge: combat turns the NEXT intent into an automatic "unleash" hit for
  // v, so patterns never follow a charge with a separate attack move.
  const ENEMY_LIST = [
    // ================= ACT 1: The Damp Arcade (shake + junk, gently) =========
    { id: 'rat', name: 'Coin Rat', act: 1, tier: 'normal', hp: [12, 16], art: 'rat', size: 0.85, color: '#9a8a7a',
      desc: 'Lives in the coin return. Bites anything shiny, including you.', ai: 'weighted',
      moves: [w(atk('bite', 'Bite', 5, 1, 'Bites for 5'), 3), w(atk('nibble', 'Nibble', 2, 3, 'Nibbles 2 x3'), 2),
        w(buff('squeak', 'Squeak', 'str', 1, 'Squeaks itself braver (+1 Strength)'), 1)] },
    { id: 'slime', name: 'Sticky Slime', act: 1, tier: 'normal', hp: [24, 30], art: 'slime', size: 1, color: '#a6ff5e',
      desc: 'Mostly water. The rest is attitude. Splits when popped.', ai: 'cycle', pattern: [0, 1, 0, 2],
      moves: [atk('slam', 'Slam', 7, 1, 'Slams for 7'), debuff('spit', 'Spit Goo', 'weak', 1, 'Gums up your hands (Weak)'),
        blk('wobble', 'Wobble', 6, 'Wobbles defensively (Block 6)')],
      onDeath: { k: 'summon', id: 'slimeling' } },
    { id: 'slimeling', name: 'Slimeling', act: 1, tier: 'normal', minion: true, hp: [7, 9], art: 'slime', size: 0.6, color: '#c8ff9a',
      desc: 'A slime, but fun-sized.', ai: 'cycle',
      moves: [atk('splat', 'Splat', 3, 1, 'Splats for 3')] },
    { id: 'bat', name: 'Arcade Bat', act: 1, tier: 'normal', hp: [12, 15], art: 'bat', size: 0.85, color: '#6b4a8c',
      desc: 'Sleeps upside down in the claw rail. Wakes up grumpy.', ai: 'random',
      moves: [atk('flap', 'Flap', 3, 2, 'Flaps and scratches 3 x2'), mv('screech', 'Screech', 'shake', 'Screeches. Your bin rattles.'),
        atk('dive', 'Dive', 6, 1, 'Dives for 6')] },
    { id: 'gremlin', name: 'Token Gremlin', act: 1, tier: 'normal', hp: [18, 22], art: 'gremlin', size: 0.9, color: '#6bd35e',
      desc: 'Feeds rocks to machines to see what happens.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [mv('kick', 'Kick', 'shake', 'Kicks the cabinet. Your bin rattles.'),
        mv('pelt', 'Pelt', 'junk', 'Tosses a Rock into your bin', { item: 'rock', n: 1 }),
        atk('scratch', 'Scratch', 6, 1, 'Scratches for 6')] },
    { id: 'spider', name: 'Crawl Spider', act: 1, tier: 'normal', hp: [16, 20], art: 'spider', size: 0.9, color: '#4a3a5a',
      desc: 'Builds webs in the prize chute. Rude.', ai: 'cycle', pattern: [0, 1, 0, 2],
      moves: [atk('bite', 'Bite', 5, 1, 'Bites for 5'), debuff('venom', 'Venom', 'poison', 3, 'Venom (3 Poison)'),
        debuff('web', 'Web', 'weak', 1, 'Webs your arms (Weak)')] },
    { id: 'goblin', name: 'Goblin Crank-Op', act: 1, tier: 'normal', hp: [20, 26], art: 'goblin', size: 1, color: '#8fae3a',
      desc: 'Operates the machines. Badly. With a wrench.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('jab', 'Jab', 5, 1, 'Jabs for 5'), blk('guard', 'Guard', 6, 'Hides behind a crate (Block 6)'),
        mv('windup', 'Wind Up', 'charge', 'Winding up a big swing (14 next turn)', { v: 14 })] },
    { id: 'mushroom', name: 'Spore Cap', act: 1, tier: 'normal', hp: [20, 24], art: 'mushroom', size: 0.95, color: '#ff5a4a',
      desc: 'Grew on a spilled soda. Now it has opinions.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [debuff('puff', 'Puff', 'poison', 2, 'Puffs spores (2 Poison)'), atk('bonk', 'Bonk', 6, 1, 'Bonks for 6'),
        mheal('sprout', 'Sprout', 5, 'Regrows 5 HP')] },
    { id: 'crab', name: 'Claw Crab', act: 1, tier: 'normal', hp: [24, 30], art: 'crab', size: 1, color: '#ff8a5a',
      desc: 'Thinks your claw is a rival. Wants a rematch.', ai: 'cycle', pattern: [0, 1, 2, 1],
      status: { armor: 1 },
      moves: [blk('shell', 'Shell Up', 8, 'Shells up (Block 8)'), atk('pinch', 'Pinch', 4, 2, 'Pinches 4 x2'),
        buff('harden', 'Harden', 'armor', 1, 'Hardens its shell (+1 Armor)')] },
    // act 1 elites
    { id: 'mimic', name: 'Prize Mimic', act: 1, tier: 'elite', hp: [50, 56], art: 'mimic', size: 1.15, color: '#ffc94d',
      desc: 'Looks like a prize. Is a mouth.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [mv('lure', 'Lure', 'junk', 'Spits 2 Rocks into your bin', { item: 'rock', n: 2 }),
        atk('chomp', 'Chomp', 11, 1, 'Chomps for 11'), mv('rattle', 'Rattle', 'shake', 'Rattles the cabinet. Your bin rattles.'),
        mv('gulp', 'Deep Breath', 'charge', 'Opening wide (20 next turn)', { v: 20 })] },
    { id: 'broodmother', name: 'Brood Mother', act: 1, tier: 'elite', hp: [46, 52], art: 'spider', size: 1.2, color: '#6b2a5a',
      desc: 'Every egg sac is a tiny, furious prize.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [mv('spiderling', 'Hatch', 'summon', 'Hatches a Spiderling'), atk('bite', 'Bite', 9, 1, 'Bites for 9'),
        debuff('venom', 'Venom', 'poison', 4, 'Venom (4 Poison)'), debuff('web', 'Web', 'weak', 2, 'Webs your arms (Weak 2)')] },
    { id: 'spiderling', name: 'Spiderling', act: 1, tier: 'normal', minion: true, hp: [6, 8], art: 'spider', size: 0.55, color: '#8a4a7a',
      desc: 'Small. Numerous. Bitey.', ai: 'cycle',
      moves: [atk('nip', 'Nip', 3, 1, 'Nips for 3'), debuff('drip', 'Drip', 'poison', 1, 'Drips venom (1 Poison)')] },
    // act 1 boss
    { id: 'hoard', name: 'The Hoard', act: 1, tier: 'boss', hp: [90, 90], art: 'hoard', size: 1, color: '#ffc94d',
      desc: 'Every prize nobody ever won, piled up and angry about it.', ai: 'cycle',
      pattern: [0, 2, 4, 1, 3, 5, 7, 6],
      moves: [atk('avalanche', 'Prize Avalanche', 4, 3, 'Prize avalanche: 4 x3'),
        mv('topple', 'Topple', 'shake', 'Topples onto the cabinet. Your bin rattles.'),
        mv('cough', 'Cough Up', 'junk', 'Coughs 2 Rocks into your bin', { item: 'rock', n: 2 }),
        mv('rat', 'Call Rat', 'summon', 'Whistles for a Coin Rat'),
        blk('glitter', 'Glitter Wall', 12, 'Hides behind prizes (Block 12)'),
        mv('loom', 'Loom', 'charge', 'Looming over you (22 next turn)', { v: 22 }),
        atk('swat', 'Swat', 8, 1, 'Swats for 8'),
        buff('greed', 'Greed', 'str', 2, 'Grows greedier (+2 Strength)')] },

    // ================= ACT 2: The Clockwork Foundry (grease, steal, tilt) =====
    { id: 'imp', name: 'Grease Imp', act: 2, tier: 'normal', hp: [28, 34], art: 'imp', size: 0.9, color: '#ff5a4a',
      desc: 'Lubricates machinery. And floors. And you.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [mv('grease', 'Grease', 'grease', 'Greases your bin (slippery for 1 turn)', { v: 1 }),
        atk('poke', 'Poke', 8, 1, 'Pokes for 8'), debuff('hex', 'Hex', 'burn', 3, 'Hexes you (3 Burn)')] },
    { id: 'clockwork', name: 'Wind-Up Soldier', act: 2, tier: 'normal', hp: [36, 42], art: 'clockwork', size: 1, color: '#c8a040',
      desc: 'Marches forward. Only forward. Turning is a premium feature.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [atk('march', 'March', 9, 1, 'Marches into you for 9'), buff('wind', 'Wind Up', 'str', 2, 'Winds its key (+2 Strength)'),
        atk('volley', 'Volley', 4, 3, 'Volley: 4 x3'), blk('rust', 'Rest', 8, 'Stops to rest (Block 8)')] },
    { id: 'drone', name: 'Claw Drone', act: 2, tier: 'normal', hp: [24, 30], art: 'drone', size: 0.9, color: '#2ee6d6',
      desc: 'A tiny flying claw. Kill it before it leaves with your stuff.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [mv('snatch', 'Snatch', 'steal', 'Snatches an item from your bin'), atk('buzz', 'Buzz', 7, 1, 'Buzzes you for 7'),
        mv('getaway', 'Getaway', 'escape', 'Flies off with the loot')] },
    { id: 'tinker', name: 'Tinker Gnome', act: 2, tier: 'normal', hp: [30, 36], art: 'tinker', size: 0.9, color: '#ff9a2e',
      desc: 'Fixes things so they break in more interesting ways.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [mv('jack', 'Jack Up', 'tilt', 'Jacks up one side of the cabinet (tilt)'), atk('wrench', 'Wrench', 9, 1, 'Wrenches you for 9'),
        mv('drone', 'Build Drone', 'summon', 'Builds a Claw Drone'), mheal('patch', 'Patch Up', 8, 'Patches itself (heal 8)')] },
    { id: 'golem', name: 'Brass Golem', act: 2, tier: 'normal', hp: [46, 51], art: 'golem', size: 1.1, color: '#c8a040',
      desc: 'Built to guard a prize. Forgot which one.', ai: 'cycle', pattern: [0, 1, 3, 2],
      status: { armor: 1 },
      moves: [blk('brace', 'Brace', 12, 'Braces (Block 12)'), mv('windup', 'Wind Up', 'charge', 'Winding up (20 next turn)', { v: 20 }),
        atk('punch', 'Punch', 10, 1, 'Punches for 10'), mv('stomp', 'Stomp', 'shake', 'Stomps. Your bin rattles.')] },
    { id: 'tinknight', name: 'Tin Knight', act: 2, tier: 'normal', hp: [38, 44], art: 'knight', size: 1, color: '#aab3bd',
      desc: 'A suit of armor from the prize shelf. Nobody is inside. Probably.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [blk('guard', 'Guard', 10, 'Raises its shield (Block 10)'), atk('lunge', 'Lunge', 11, 1, 'Lunges for 11'),
        debuff('taunt', 'Taunt', 'vuln', 1, 'Taunts you (Vulnerable)')] },
    { id: 'oilslick', name: 'Oil Slick', act: 2, tier: 'normal', hp: [34, 40], art: 'slime', size: 1, color: '#3a3230',
      desc: 'A slime that went into the machine oil and never came back out.', ai: 'random',
      moves: [mv('slick', 'Slick', 'grease', 'Oils your bin (slippery for 1 turn)', { v: 1 }),
        atk('slap', 'Slap', 10, 1, 'Slaps for 10'), debuff('ooze', 'Ooze', 'weak', 2, 'Oozes on your gloves (Weak 2)')] },
    // act 2 elites
    { id: 'ironjaw', name: 'Ironjaw', act: 2, tier: 'elite', hp: [92, 100], art: 'ironjaw', size: 1.2, color: '#7d8590',
      desc: 'A bear trap that learned to walk. And swallow.', ai: 'cycle', pattern: [0, 1, 2, 3, 0],
      moves: [atk('bite', 'Bite', 14, 1, 'Bites for 14'), mv('swallow', 'Swallow', 'steal', 'Swallows an item from your bin'),
        buff('clench', 'Clench', 'armor', 2, 'Clenches (+2 Armor)'), mv('gape', 'Gape', 'charge', 'Opens wide (30 next turn)', { v: 30 })] },
    { id: 'lodestone', name: 'The Lodestone', act: 2, tier: 'elite', hp: [84, 92], art: 'magnet', size: 1.2, color: '#ff2e4a',
      desc: 'A living magnet. Your metal things are very interested in it.', ai: 'cycle', pattern: [0, 1, 2, 4, 3, 4],
      moves: [buff('polarize', 'Polarize', 'shield_up', 2, 'Polarizes (Block persists 2 turns)'),
        blk('plate', 'Plate', 15, 'Pulls scrap into armor (Block 15)'),
        mv('pull', 'Pull', 'steal', 'Yanks an item out of your bin'),
        mv('drag', 'Drag', 'tilt', 'Drags the whole cabinet sideways (tilt)'),
        atk('zap', 'Zap', 8, 2, 'Zaps 8 x2')] },
    // act 2 boss
    { id: 'smelter', name: 'The Smelter', act: 2, tier: 'boss', hp: [170, 170], art: 'furnace', size: 1, color: '#ff8a2e',
      desc: 'The foundry furnace. It melts down failed adventurers into prize tokens.', ai: 'cycle',
      pattern: [0, 1, 2, 3, 6, 4, 5, 7, 1],
      moves: [buff('stoke', 'Stoke', 'enrage', 1, 'Stokes its fire (Enrage 1)'), atk('spew', 'Spew', 6, 3, 'Spews embers: 6 x3'),
        mv('oil', 'Oil Pour', 'grease', 'Pours oil in your bin (slippery 2 turns)', { v: 2 }),
        mv('smelt', 'Smelt', 'junk', 'Smelts 3 Slag into your bin', { item: 'slag', n: 3 }),
        debuff('heat', 'Heat Wave', 'burn', 4, 'Heat wave (4 Burn)'),
        mv('tip', 'Belch', 'tilt', 'Belches. The cabinet lurches (tilt)'),
        blk('vent', 'Vent', 20, 'Closes its grate (Block 20)'),
        mv('roar', 'Roar', 'charge', 'Heating up (32 next turn)', { v: 32 })] },

    // ================= ACT 3: The Frozen Penthouse (fog, freezeItem) ==========
    { id: 'wraith', name: 'Glass Wraith', act: 3, tier: 'normal', hp: [42, 48], art: 'wraith', size: 1, color: '#bfefff',
      desc: 'Haunts display cases. Breathes on the glass so you cannot see.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [mv('haunt', 'Haunt', 'fog', 'Breathes on the glass (fog 1 turn)', { v: 1 }), atk('claw', 'Claw', 13, 1, 'Claws for 13'),
        debuff('wail', 'Wail', 'weak', 2, 'Wails (Weak 2)'), buff('fade', 'Fade', 'dodge', 1, 'Fades out (Dodge 1)')] },
    { id: 'wisp', name: 'Cold Wisp', act: 3, tier: 'normal', hp: [32, 38], art: 'wisp', size: 0.8, color: '#9fd8ff',
      desc: 'A floating chill with a grudge.', ai: 'weighted',
      moves: [w(atk('flicker', 'Flicker', 4, 3, 'Flickers: 4 x3'), 3), w(debuff('frost', 'Frost', 'chill', 2, 'Frosts you (2 Chill)'), 2),
        w(buff('blink', 'Blink', 'dodge', 1, 'Blinks (Dodge 1)'), 1)] },
    { id: 'frostmage', name: 'Frost Mage', act: 3, tier: 'normal', hp: [46, 54], art: 'frostmage', size: 1, color: '#7fb2ff',
      desc: 'Keeps the prizes fresh. Keeps you fresh too.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'), atk('bolt', 'Ice Bolt', 14, 1, 'Ice bolt for 14'),
        debuff('chill', 'Chill', 'chill', 2, 'Chills you (2 Chill)'), blk('barrier', 'Barrier', 12, 'Ice barrier (Block 12)')] },
    { id: 'icemimic', name: 'Ice Mimic', act: 3, tier: 'normal', hp: [62, 70], art: 'icemimic', size: 1.05, color: '#cfefff',
      desc: 'A mimic that moved somewhere colder. Hungrier for it.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [blk('lurk', 'Lurk', 14, 'Pretends to be a prize (Block 14)'), mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'),
        atk('bite', 'Bite', 12, 1, 'Bites for 12'), mv('gape', 'Gape', 'charge', 'Opening wide (30 next turn)', { v: 30 })] },
    { id: 'cultist', name: 'Claw Cultist', act: 3, tier: 'normal', hp: [48, 56], art: 'cultist', size: 1, color: '#ff2e88',
      desc: 'Worships the Prize Master. Has a punch card.', ai: 'cycle', pattern: [0, 1, 2, 1, 3],
      moves: [buff('chant', 'Chant', 'str', 3, 'Chants (+3 Strength)'), atk('slash', 'Slash', 12, 1, 'Slashes for 12'),
        debuff('curse', 'Curse', 'vuln', 2, 'Curses you (Vulnerable 2)'), mheal('pray', 'Pray', 10, 'Prays (heal 10)')] },
    { id: 'yeti', name: 'Snow Yeti', act: 3, tier: 'normal', hp: [66, 76], art: 'yeti', size: 1.15, color: '#f2fbff',
      desc: 'Fell asleep in the freezer aisle. You woke it.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [atk('maul', 'Maul', 17, 1, 'Mauls for 17'), mv('pound', 'Pound', 'shake', 'Pounds the cabinet. Your bin rattles.'),
        mv('hurl', 'Hurl', 'junk', 'Hurls 2 Ice Blocks into your bin', { item: 'iceblock', n: 2 }),
        debuff('roar', 'Roar', 'weak', 2, 'Roars (Weak 2)')] },
    { id: 'rimecap', name: 'Rime Cap', act: 3, tier: 'normal', hp: [44, 52], art: 'mushroom', size: 1, color: '#9fd8ff',
      desc: 'A frozen mushroom. Its spores are tiny snowflakes. Poisonous ones.', ai: 'cycle', pattern: [0, 1, 2, 3, 2],
      moves: [mv('spores', 'Spore Cloud', 'fog', 'Spore cloud on the glass (fog 1 turn)', { v: 1 }),
        debuff('rot', 'Frost Rot', 'poison', 5, 'Frost rot (5 Poison)'), atk('bonk', 'Bonk', 12, 1, 'Bonks for 12'),
        buff('regrow', 'Regrow', 'regen', 4, 'Regrows (Regen 4)')] },
    // act 3 elites
    { id: 'frostknight', name: 'The Frozen Knight', act: 3, tier: 'elite', hp: [140, 150], art: 'knight', size: 1.25, color: '#7fb2ff',
      desc: 'A Crawler who got too close to the ice box. Still guarding it.', ai: 'cycle', pattern: [0, 1, 3, 2, 4, 5, 3],
      moves: [buff('bulwark', 'Bulwark', 'shield_up', 3, 'Frozen bulwark (Block persists 3 turns)'),
        blk('wall', 'Ice Wall', 20, 'Ice wall (Block 20)'), mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'),
        atk('cleave', 'Cleave', 20, 1, 'Cleaves for 20'), mv('raise', 'Raise Blade', 'charge', 'Raising its blade (40 next turn)', { v: 40 }),
        buff('temper', 'Temper', 'armor', 2, 'Tempers its armor (+2 Armor)')] },
    { id: 'highcultist', name: 'High Cultist', act: 3, tier: 'elite', hp: [128, 140], art: 'cultist', size: 1.2, color: '#b02e88',
      desc: 'Has the gold punch card. Twelve more stamps until a free soul.', ai: 'cycle', pattern: [0, 1, 2, 3, 5, 2, 4],
      moves: [buff('ritual', 'Ritual', 'enrage', 2, 'Begins a ritual (Enrage 2)'), mv('wisp', 'Summon Wisp', 'summon', 'Summons a Cold Wisp'),
        atk('lash', 'Lash', 10, 2, 'Lashes 10 x2'), mv('veil', 'Veil', 'fog', 'Veils the glass (fog 2 turns)', { v: 2 }),
        { id: 'mend', name: 'Dark Mend', k: 'heal', v: 15, to: 'all', txt: 'Heals everyone on its side for 15' },
        debuff('hex', 'Hex', 'vuln', 2, 'Hexes you (Vulnerable 2)')] },
    // act 3 boss (phase one); the Prize Master steps out when it breaks
    { id: 'glacius', name: 'Glacius, the Ice Box', act: 3, tier: 'boss', hp: [150, 150], art: 'frostmage', size: 1, color: '#2ee6d6',
      desc: 'The penthouse freezer, awake. Behind it, a door marked STAFF ONLY.', ai: 'cycle',
      pattern: [0, 1, 2, 4, 3, 5, 6, 7, 1],
      moves: [mv('blizzard', 'Blizzard', 'fog', 'Blizzard on the glass (fog 2 turns)', { v: 2 }),
        atk('hail', 'Hail', 7, 4, 'Hail: 7 x4'), mv('encase', 'Deep Freeze', 'freezeItem', 'Freezes an item in your bin solid'),
        debuff('frost', 'Frostbite', 'chill', 3, 'Frostbite (3 Chill)'), blk('icewall', 'Ice Wall', 25, 'Ice wall (Block 25)'),
        mv('wisp', 'Call Wisp', 'summon', 'Calls a Cold Wisp'),
        mv('gather', 'Gather Cold', 'charge', 'Gathering cold (38 next turn)', { v: 38 }),
        mv('quake', 'Quake', 'shake', 'Shakes the whole floor. Your bin rattles.')],
      onDeath: { k: 'summon', id: 'prizemaster' } },
    // final boss: every trick in the machine, in three acts of its own
    { id: 'prizemaster', name: 'The Prize Master', act: 3, tier: 'boss', hp: [230, 230], art: 'prizemaster', size: 1, color: '#ff2e88',
      desc: 'Runs the Clawspire. Turns adventurers into prizes. Very good at claw machines.', ai: 'cycle',
      // The Show: 0 1 2 3 13 5 | Rigged: 7 8 9 6 10 4 11 5 | Endgame: 12 1 3 2 6 5
      pattern: [0, 1, 2, 3, 13, 5, 7, 8, 9, 6, 10, 4, 11, 5, 12, 1, 3, 2, 6, 5],
      moves: [buff('welcome', 'Welcome!', 'str', 2, 'Welcome, contestant! (+2 Strength)'),
        atk('house', 'House Edge', 8, 3, 'House edge: 8 x3'),
        mv('rigged', 'Rigged', 'tilt', 'The game is rigged (tilt)'),
        mv('confiscate', 'Confiscate', 'steal', 'Confiscates an item from your bin'),
        mv('drone', 'Security!', 'summon', 'Calls a Claw Drone'),
        mv('wind', 'Big Claw', 'charge', 'Lowering the big claw (45 next turn)', { v: 45 }),
        atk('slap', 'Slap', 12, 1, 'Slaps for 12'),
        mv('lights', 'Lights Out', 'fog', 'Kills the lights (fog 2 turns)', { v: 2 }),
        mv('freeze', 'On Ice', 'freezeItem', 'Puts one of your items on ice'),
        mv('consolation', 'Consolation Prizes', 'junk', 'Consolation prizes! (2 Slag)', { item: 'slag', n: 2 }),
        mv('butter', 'Butter Fingers', 'grease', 'Butters your bin (slippery 1 turn)', { v: 1 }),
        debuff('markup', 'Markup', 'vuln', 2, 'Marks you up (Vulnerable 2)'),
        buff('rules', 'House Rules', 'shield_up', 2, 'House rules (Block persists 2 turns)'),
        blk('glass', 'Glass Case', 20, 'Steps into a glass case (Block 20)')] },
  ];
  const ENEMIES = {};
  for (const e of ENEMY_LIST) ENEMIES[e.id] = Object.assign({ size: 1 }, e);

  // ------------------------------------------------------------ encounters
  // Normal lists run easy -> hard: MAP biases later columns toward the back.
  const ENCOUNTERS = {
    1: {
      normal: [['rat', 'rat'], ['bat', 'bat'], ['gremlin'], ['slime'], ['spider', 'rat'], ['goblin'],
        ['mushroom', 'bat'], ['crab'], ['gremlin', 'rat']],
      elite: [['mimic'], ['broodmother']],
      boss: [['hoard']],
    },
    2: {
      normal: [['drone', 'imp'], ['imp', 'imp'], ['clockwork'], ['tinker'], ['oilslick', 'drone'], ['tinknight'],
        ['golem'], ['clockwork', 'drone']],
      elite: [['ironjaw'], ['lodestone']],
      boss: [['smelter']],
    },
    3: {
      normal: [['wisp', 'wisp'], ['wraith'], ['frostmage'], ['rimecap', 'wisp'], ['cultist'], ['icemimic'],
        ['wraith', 'wisp'], ['yeti']],
      elite: [['frostknight'], ['highcultist']],
      boss: [['glacius']],
    },
  };

  // ----------------------------------------------------------------- relics
  // Hook helpers. They resolve COMBAT at call time (it loads after this
  // file) and do nothing without it, so data stays loadable on its own.
  const CB = () => (typeof COMBAT !== 'undefined' ? COMBAT : null);
  const aliveOf = (F) => (F.enemies || []).filter(e => e && e.alive);
  // The targeted enemy if alive, else the first living one.
  const focus = (F) => {
    const e = (F.enemies || [])[F.target];
    return e && e.alive ? e : aliveOf(F)[0] || null;
  };
  // Relic damage has no attacker (src null): no Strength, no Thorns back.
  const zap = (F, e, v) => { const c = CB(); if (c && e) c.damage(F, null, e, v); };
  const zapAll = (F, v) => aliveOf(F).forEach(e => zap(F, e, v));
  const selfStatus = (F, s, v) => { const c = CB(); if (c) c.status(F, F.player, s, v); };
  const foeStatus = (F, e, s, v) => { const c = CB(); if (c && e) c.status(F, e, s, v); };
  const allStatus = (F, s, v) => aliveOf(F).forEach(e => foeStatus(F, e, s, v));
  const gainBlock = (F, v) => selfStatus(F, 'block', v);   // COMBAT.status routes 'block' to block
  const healP = (F, v) => { const c = CB(); if (c) c.heal(F, F.player, v); };
  const moreGrabs = (F, v) => {
    if (!CB() || !F.player) return;
    F.player.grabs += v;
    // Through COMBAT.emit so the event also reaches the open collectors
    // (the play/endTurn/grabDone return values the game renders).
    if (CB().emit) CB().emit(F, { t: 'grab', v });
    else if (Array.isArray(F.events)) F.events.push({ t: 'grab', v });
  };
  // Per-fight relic memory lives on the fight itself.
  const mem = (F) => F.rs || (F.rs = {});
  const tagged = (def, t) => !!(def && def.tags && def.tags.indexOf(t) >= 0);

  const RELIC_LIST = [
    // starters (not in random pools)
    { id: 'squire_gauntlet', name: "Squire's Gauntlet", icon: '🧤', rarity: 'event', starter: true,
      text: 'Your claw grips a little harder. Start each fight with 5 Block.',
      mods: { grip: 0.15 }, hooks: { onFightStart(F) { gainBlock(F, 5); } } },
    { id: 'bubbling_satchel', name: 'Bubbling Satchel', icon: '🧪', rarity: 'event', starter: true,
      text: 'Start each fight with 2 Poison on every enemy. Something in here is alive.',
      hooks: { onFightStart(F) { allStatus(F, 'poison', 2); } } },
    { id: 'pickpocket_glove', name: 'Pickpocket Glove', icon: '✋', rarity: 'event', starter: true,
      text: 'Start each fight with 1 Dodge. Whenever an enemy dies, gain 1 Dodge.',
      hooks: { onFightStart(F) { selfStatus(F, 'dodge', 1); }, onKill(F) { selfStatus(F, 'dodge', 1); } } },

    // common
    { id: 'grip_tape', name: 'Grip Tape', icon: '🩹', rarity: 'c', text: 'Your claw grips 25% harder. Sticky, in a good way.',
      mods: { grip: 0.25 } },
    { id: 'oiled_rails', name: 'Oiled Rails', icon: '🛢', rarity: 'c', text: 'Your claw moves 30% faster. Wheee.',
      mods: { speed: 0.3 } },
    { id: 'golden_ticket', name: 'Golden Ticket', icon: '🎟', rarity: 'c', text: 'On pickup, gain 90 gold. Redeemable nowhere else.',
      mods: { gold: 90 } },
    { id: 'inkwell', name: 'Bottomless Inkwell', icon: '🖋', rarity: 'c', text: 'On pickup, gain 3 Ink. It has a bottom. It lied.',
      mods: { ink: 3 } },
    { id: 'heart_locket', name: 'Heart Locket', icon: '💗', rarity: 'c', text: 'Gain 8 Max HP. There is a tiny picture of you inside.',
      mods: { maxhp: 8 } },
    { id: 'kettle_helm', name: 'Kettle Helm', icon: '🫖', rarity: 'c', text: 'Start each fight with 6 Block. Also makes tea.',
      mods: { startBlock: 6 } },
    { id: 'consolation_prize', name: 'Consolation Prize', icon: '🧸', rarity: 'c',
      text: 'Whenever a grab delivers nothing, gain 4 Block.',
      hooks: { onGrab(F, n) { if (!n) gainBlock(F, 4); } } },
    { id: 'sore_loser', name: 'Sore Loser', icon: '😤', rarity: 'c',
      text: 'Whenever a grab delivers nothing, deal 4 damage to the targeted enemy.',
      hooks: { onGrab(F, n) { if (!n) zap(F, focus(F), 4); } } },
    { id: 'blood_bag', name: 'Blood Bag', icon: '🩸', rarity: 'c', text: 'Whenever an enemy dies, heal 3 HP.',
      hooks: { onKill(F) { healP(F, 3); } } },
    { id: 'hot_coffee', name: 'Hot Coffee', icon: '☕', rarity: 'c', text: 'Gain 1 extra grab on the first turn of each fight.',
      hooks: { onFightStart(F) { moreGrabs(F, 1); } } },

    // uncommon
    { id: 'wide_palm', name: 'Wide Palm', icon: '🖐', rarity: 'u', text: 'Your claw opens 20% wider.',
      mods: { width: 0.2 } },
    { id: 'rubber_thimbles', name: 'Rubber Thimbles', icon: '👆', rarity: 'u', text: 'Rubber tips on your prongs. Nothing slips as easily.',
      mods: { rubber: 1 } },
    { id: 'protein_bar', name: 'Protein Bar', icon: '💪', rarity: 'u', text: 'Start each fight with 1 Strength. Chewy.',
      mods: { startStr: 1 } },
    { id: 'jackpot_bell', name: 'Jackpot Bell', icon: '🔔', rarity: 'u',
      text: 'Whenever one grab delivers 2 or more items, deal 5 damage to ALL enemies. DING.',
      hooks: { onGrab(F, n) { if (n >= 2) zapAll(F, 5); } } },
    { id: 'thorn_mail', name: 'Thorn Mail', icon: '🌵', rarity: 'u', text: 'Start each fight with 3 Thorns. Hugs discouraged.',
      hooks: { onFightStart(F) { selfStatus(F, 'thorns', 3); } } },
    { id: 'venom_gland', name: 'Venom Gland', icon: '🐍', rarity: 'u',
      text: 'Whenever you play a weapon, apply 1 Poison to the targeted enemy.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'weapon')) foeStatus(F, focus(F), 'poison', 1); } } },
    { id: 'flint_striker', name: 'Flint Striker', icon: '🔥', rarity: 'u',
      text: 'The first item you play each turn applies 2 Burn to the targeted enemy.',
      hooks: {
        onPlay(F) {
          const m = mem(F);
          if (m.flint === F.turn) return;
          m.flint = F.turn;
          foeStatus(F, focus(F), 'burn', 2);
        },
      } },
    { id: 'snow_globe', name: 'Snow Globe', icon: '❄', rarity: 'u', text: 'Start each fight with 2 Chill on every enemy.',
      hooks: { onFightStart(F) { allStatus(F, 'chill', 2); } } },
    { id: 'trophy_rack', name: 'Trophy Rack', icon: '🏆', rarity: 'u', text: 'Whenever an enemy dies, gain 1 Strength.',
      hooks: { onKill(F) { selfStatus(F, 'str', 1); } } },
    { id: 'egg_timer', name: 'Egg Timer', icon: '⏲', rarity: 'u', text: 'Every third turn, gain 1 extra grab. Ding.',
      hooks: { onTurnStart(F) { if (F.turn % 3 === 0) moreGrabs(F, 1); } } },
    { id: 'grudge_journal', name: 'Grudge Journal', icon: '📓', rarity: 'u',
      text: 'Whenever you lose HP, deal 3 damage to the targeted enemy. You wrote their name down.',
      hooks: { onHurt(F) { zap(F, focus(F), 3); } } },
    { id: 'recycling_bin', name: 'Recycling Bin', icon: '♻', rarity: 'u',
      text: 'Whenever you grab out junk, gain 3 Block and deal 3 damage to the targeted enemy.',
      hooks: { onPlay(F, inst, def) { if ((inst && inst.junk) || tagged(def, 'junk')) { gainBlock(F, 3); zap(F, focus(F), 3); } } } },
    { id: 'potion_belt', name: 'Potion Belt', icon: '🧴', rarity: 'u', text: 'Whenever you play a potion, heal 2 HP.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'potion')) healP(F, 2); } } },

    // rare
    { id: 'fridge_magnet', name: 'Fridge Magnet', icon: '🧲', rarity: 'r',
      text: 'Your claw becomes a magnet. Metal items drift into it.',
      mods: { magnet: 1 } },
    { id: 'cracked_hourglass', name: 'Cracked Hourglass', icon: '⌛', rarity: 'r',
      text: 'At the end of your turn, apply 1 Vulnerable to the targeted enemy.',
      hooks: { onTurnEnd(F) { foeStatus(F, focus(F), 'vuln', 1); } } },
    { id: 'big_knuckles', name: 'Brass Knuckles', icon: '👊', rarity: 'r',
      text: 'Whenever one hit deals 12 or more damage, gain 4 Block.',
      hooks: { onDmgDealt(F, e, amt) { if (amt >= 12) gainBlock(F, 4); } } },
    { id: 'four_leaf_clover', name: 'Four-Leaf Clover', icon: '🍀', rarity: 'r', text: 'Start each fight with 2 Dodge.',
      hooks: { onFightStart(F) { selfStatus(F, 'dodge', 2); } } },
    { id: 'vampire_dentures', name: 'Vampire Dentures', icon: '🦷', rarity: 'r',
      text: 'Whenever one hit deals 10 or more damage, heal 2 HP. They click when you smile.',
      hooks: { onDmgDealt(F, e, amt) { if (amt >= 10) healP(F, 2); } } },
    { id: 'second_wind', name: 'Second Wind', icon: '🌬', rarity: 'r',
      text: 'The first time each fight you drop below half HP, gain 12 Block.',
      hooks: {
        onHurt(F) {
          const m = mem(F), p = F.player;
          if (m.wind || !p || p.hp * 2 >= p.maxHp) return;
          m.wind = true;
          gainBlock(F, 12);
        },
      } },

    // boss
    { id: 'token_stack', name: 'Stack of Tokens', icon: '🪙', rarity: 'boss',
      text: '+1 grab every turn. Start each fight with 2 Rocks in your bin.',
      mods: { grabs: 1 }, hooks: { onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'rock', 2); } } },
    { id: 'third_hand', name: 'Third Hand', icon: '🦾', rarity: 'boss',
      text: 'Your claw grows a third prong. Where did it come from? Do not ask.',
      mods: { prongs: 1 } },
    { id: 'golden_crane', name: 'Golden Crane', icon: '🏗', rarity: 'boss',
      text: 'Your claw opens 20% wider and grips 30% harder. Solid gold, mostly.',
      mods: { width: 0.2, grip: 0.3 } },
    { id: 'cursed_quarter', name: 'Cursed Quarter', icon: '👁', rarity: 'boss',
      text: '+1 grab every turn. Lose 10 Max HP. The arcade always gets paid.',
      mods: { grabs: 1, maxhp: -10 } },

    // event only
    { id: 'friendship_bracelet', name: 'Friendship Bracelet', icon: '📿', rarity: 'event',
      text: 'Gain 5 Max HP. Start each fight with 3 Block. You made a friend. It was a plush.',
      mods: { maxhp: 5 }, hooks: { onFightStart(F) { gainBlock(F, 3); } } },
    { id: 'cursed_plush', name: 'Cursed Plush', icon: '🧿', rarity: 'event',
      text: 'Start each fight with 2 Strength and 1 Slag in your bin. It whispers encouragement.',
      mods: { startStr: 2 }, hooks: { onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'slag', 1); } } },
  ];
  const RELICS = {};
  for (const r of RELIC_LIST) RELICS[r.id] = r;

  // -------------------------------------------------------- claw upgrades
  // Each upgrade counts itself on claw.ups so apply() can refuse past max.
  // Returns true when applied, false when already maxed.
  function upgrade(id, max, fn) {
    return (claw) => {
      claw.ups = claw.ups || {};
      const n = claw.ups[id] || 0;
      if (n >= max) return false;
      fn(claw);
      claw.ups[id] = n + 1;
      return true;
    };
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const CLAW_UPGRADES = {
    grabs: { id: 'grabs', name: 'Extra Token', icon: '🪙', max: 2, cost: 160,
      text: '+1 grab every turn.', apply: upgrade('grabs', 2, c => { c.grabs = (c.grabs || 3) + 1; }) },
    width: { id: 'width', name: 'Wider Palm', icon: '↔', max: 3, cost: 90,
      text: 'The claw opens 18% wider. Hug bigger things.', apply: upgrade('width', 3, c => { c.width = r2((c.width || 1) + 0.18); }) },
    grip: { id: 'grip', name: 'Stronger Motor', icon: '✊', max: 3, cost: 100,
      text: 'The prongs squeeze 35% harder. Heavy things stop slipping.', apply: upgrade('grip', 3, c => { c.grip = r2((c.grip || 1) + 0.35); }) },
    speed: { id: 'speed', name: 'Greased Rails', icon: '⚡', max: 2, cost: 80,
      text: 'The carriage moves 30% faster.', apply: upgrade('speed', 2, c => { c.speed = r2((c.speed || 1) + 0.3); }) },
    prongs: { id: 'prongs', name: 'Third Prong', icon: '🔱', max: 1, cost: 150,
      text: 'Adds a middle prong. Grabs much more reliably.', apply: upgrade('prongs', 1, c => { c.prongs = 3; }) },
    rubber: { id: 'rubber', name: 'Rubber Tips', icon: '🟣', max: 1, cost: 110,
      text: 'Grippy rubber prong tips. Round things stop squirting out.', apply: upgrade('rubber', 1, c => { c.rubber = 1; }) },
    magnet: { id: 'magnet', name: 'Electromagnet', icon: '🧲', max: 1, cost: 130,
      text: 'The palm pulls nearby metal items in while it drops.', apply: upgrade('magnet', 1, c => { c.magnet = 1; }) },
  };

  // ----------------------------------------------------------------- events
  const hasGold = (n) => (run) => (run && run.gold || 0) >= n;
  const canUp = (id) => (run) => !((run && run.claw && run.claw.ups && run.claw.ups[id] || 0) >= CLAW_UPGRADES[id].max);
  const LEAVE = { txt: 'Walk away.', sub: 'Nothing happens.', fx: [] };
  const EVENT_LIST = [
    { id: 'out_of_order', title: 'Out of Order', art: 'mimic',
      text: 'A claw machine with a handwritten OUT OF ORDER sign. The prize inside is staring at you.',
      choices: [
        { txt: 'Kick it.', sub: 'Lose 6 HP. Gain a random item.', fx: [{ k: 'hp', v: -6 }, { k: 'item', id: 'random' }] },
        { txt: 'Insert 30 gold.', sub: 'Lose 30 gold. Gain a rare item.', fx: [{ k: 'gold', v: -30 }, { k: 'item', id: 'rare' }], cond: hasGold(30) },
        { txt: 'Respect the sign.', sub: 'Nothing happens.', fx: [] },
      ] },
    { id: 'wishing_well', title: 'Wishing Well', art: 'coin',
      text: 'A fountain full of coins. Every one of them is a wish that did not come true.',
      choices: [
        { txt: 'Toss in 25 gold.', sub: 'Lose 25 gold. Gain 6 Max HP.', fx: [{ k: 'gold', v: -25 }, { k: 'maxhp', v: 6 }], cond: hasGold(25) },
        { txt: 'Fish out the coins.', sub: 'Gain 40 gold. Add a Rock to your bin.', fx: [{ k: 'gold', v: 40 }, { k: 'junk', id: 'rock', n: 1 }] },
        LEAVE,
      ] },
    { id: 'goblin_mechanic', title: 'Goblin Mechanic', art: 'goblin',
      text: 'A goblin in greasy overalls offers to "tune" your Rig. He is holding the wrench upside down.',
      choices: [
        { txt: 'Pay 70 gold.', sub: 'Lose 70 gold. Stronger claw motor.', fx: [{ k: 'gold', v: -70 }, { k: 'claw', u: 'grip' }],
          cond: (run) => hasGold(70)(run) && canUp('grip')(run) },
        { txt: 'Let him experiment.', sub: 'Lose 8 HP. Faster claw rails.', fx: [{ k: 'hp', v: -8 }, { k: 'claw', u: 'speed' }], cond: canUp('speed') },
        { txt: 'No thanks.', sub: 'Nothing happens.', fx: [] },
      ] },
    { id: 'ink_squid', title: 'The Ink Squid', art: 'scroll',
      text: 'A squid in a fishbowl helmet waddles up. It seems to want a hug.',
      choices: [
        { txt: 'Hug it.', sub: 'Lose 4 HP. Gain 3 Ink.', fx: [{ k: 'hp', v: -4 }, { k: 'ink', v: 3 }] },
        { txt: 'Ask to borrow a brush.', sub: 'Gain a Splash brush.', fx: [{ k: 'brush', id: 'splash' }] },
        { txt: 'Back away slowly.', sub: 'Nothing happens.', fx: [] },
      ] },
    { id: 'lonely_anvil', title: 'Lonely Anvil', art: 'anvil',
      text: 'An anvil sits alone in the dark. It hums when you get close. It wants to be useful.',
      choices: [
        { txt: 'Hammer something.', sub: 'Lose 3 HP. Upgrade an item.', fx: [{ k: 'hp', v: -3 }, { k: 'upgrade' }] },
        { txt: 'Hammer everything.', sub: 'Lose 6 Max HP. Upgrade two items.', fx: [{ k: 'maxhp', v: -6 }, { k: 'upgrade' }, { k: 'upgrade' }],
          cond: (run) => (run && run.maxHp || 0) > 30 },
        LEAVE,
      ] },
    { id: 'refund_shrine', title: 'Customer Service Shrine', art: 'book',
      text: 'A shrine with a little bell and a sign: ALL SALES FINAL. REMOVALS FREE.',
      choices: [
        { txt: 'Ring the bell.', sub: 'Remove an item from your bin.', fx: [{ k: 'remove' }] },
        { txt: 'Ring it twice.', sub: 'Lose 40 gold. Remove two items.', fx: [{ k: 'gold', v: -40 }, { k: 'remove' }, { k: 'remove' }], cond: hasGold(40) },
        LEAVE,
      ] },
    { id: 'suspicious_chest', title: 'Suspicious Chest', art: 'mimic',
      text: 'A treasure chest with teeth marks on the lid. Its own teeth, you suspect.',
      choices: [
        { txt: 'Open it.', sub: 'Fight a Prize Mimic (elite).', fx: [{ k: 'fight', enc: ['mimic'], elite: true }] },
        { txt: 'Poke it with a stick.', sub: 'Lose 4 HP. Gain 20 gold.', fx: [{ k: 'hp', v: -4 }, { k: 'gold', v: 20 }] },
        LEAVE,
      ] },
    { id: 'ring_toss', title: 'Ring Toss', art: 'ring',
      text: 'Three rings, one bottle, zero chance. The booth goblin grins.',
      choices: [
        { txt: 'Play fair.', sub: 'Lose 15 gold. Gain a random item.', fx: [{ k: 'gold', v: -15 }, { k: 'item', id: 'random' }], cond: hasGold(15) },
        { txt: 'Cheat.', sub: 'Gain a random relic. Add 2 Slag to your bin.', fx: [{ k: 'relic', id: 'random' }, { k: 'junk', id: 'slag', n: 2 }] },
        LEAVE,
      ] },
    { id: 'fortune_crane', title: 'Fortune Crane', art: 'scroll',
      text: 'A tiny claw machine full of paper fortunes. One of them just says "LEFT".',
      choices: [
        { txt: 'Take a fortune.', sub: 'Gain 1 Ink and a Drip brush.', fx: [{ k: 'ink', v: 1 }, { k: 'brush', id: 'drip' }] },
        { txt: 'Steal its rubber tips.', sub: 'Lose 6 HP. Your claw gets Rubber Tips.', fx: [{ k: 'hp', v: -6 }, { k: 'claw', u: 'rubber' }], cond: canUp('rubber') },
        LEAVE,
      ] },
    { id: 'stuffed_adventurer', title: 'Stuffed Adventurer', art: 'knight',
      text: 'A plush knight with button eyes sits on a shelf. A former Crawler. It blinks at you.',
      choices: [
        { txt: 'Take its sword.', sub: 'Gain a Longsword.', fx: [{ k: 'item', id: 'longsword' }] },
        { txt: 'Read its diary.', sub: 'Gain 2 Ink.', fx: [{ k: 'ink', v: 2 }] },
        { txt: 'Cut it free.', sub: 'Lose 5 HP. Gain Friendship Bracelet.', fx: [{ k: 'hp', v: -5 }, { k: 'relic', id: 'friendship_bracelet' }] },
      ] },
    { id: 'steam_vent', title: 'Steam Vent', art: 'bottle',
      text: 'A warm vent hisses under the floor tiles. It smells like pretzels.',
      choices: [
        { txt: 'Sit in the steam.', sub: 'Heal 15 HP.', fx: [{ k: 'hp', v: 15 }] },
        { txt: 'Bottle it.', sub: 'Gain an Elixir of Vigor. Lose 3 HP.', fx: [{ k: 'hp', v: -3 }, { k: 'item', id: 'elixir' }] },
        { txt: 'Keep moving.', sub: 'Nothing happens.', fx: [] },
      ] },
    { id: 'one_armed_bandit', title: 'One-Armed Bandit', art: 'dice',
      text: 'A slot machine. Its arm is a real arm. It waves.',
      choices: [
        { txt: 'Pull the arm.', sub: 'Lose 10 HP. Gain a rare item.', fx: [{ k: 'hp', v: -10 }, { k: 'item', id: 'rare' }] },
        { txt: 'Shake it down.', sub: 'Gain 45 gold. Add 2 Rocks to your bin.', fx: [{ k: 'gold', v: 45 }, { k: 'junk', id: 'rock', n: 2 }] },
        LEAVE,
      ] },
    { id: 'ghost_smith', title: 'Ghost Blacksmith', art: 'hammer',
      text: 'A ghost with a hammer, looking for work. It accepts HP or gold. Mostly HP.',
      choices: [
        { txt: 'Magnetize the claw.', sub: 'Lose 8 Max HP. Your claw gets an Electromagnet.', fx: [{ k: 'maxhp', v: -8 }, { k: 'claw', u: 'magnet' }],
          cond: (run) => canUp('magnet')(run) && (run && run.maxHp || 0) > 30 },
        { txt: 'Widen the claw.', sub: 'Lose 60 gold. Wider claw.', fx: [{ k: 'gold', v: -60 }, { k: 'claw', u: 'width' }],
          cond: (run) => hasGold(60)(run) && canUp('width')(run) },
        LEAVE,
      ] },
    { id: 'frozen_crane', title: 'Frozen Crane', art: 'iceblock',
      text: 'A claw machine frozen solid. Something glitters deep inside the ice.',
      choices: [
        { txt: 'Thaw it with your hands.', sub: 'Lose 10 HP. Gain a random relic.', fx: [{ k: 'hp', v: -10 }, { k: 'relic', id: 'random' }],
          cond: (run) => (run && run.hp || 0) > 10 },
        { txt: 'Smash the glass.', sub: 'Gain an Icicle. Add 2 Ice Blocks to your bin.', fx: [{ k: 'item', id: 'icicle' }, { k: 'junk', id: 'iceblock', n: 2 }] },
        LEAVE,
      ] },
    { id: 'cursed_plushie', title: 'Cursed Plushie', art: 'skull',
      text: 'A plush toy with too many eyes sits in the aisle. It says your name. Politely.',
      choices: [
        { txt: 'Take it.', sub: 'Gain Cursed Plush.', fx: [{ k: 'relic', id: 'cursed_plush' }] },
        { txt: 'Burn it.', sub: 'Lose 3 HP. Gain 15 gold. It screams a little.', fx: [{ k: 'hp', v: -3 }, { k: 'gold', v: 15 }] },
        LEAVE,
      ] },
    { id: 'map_mole', title: 'Map Mole', art: 'scroll',
      text: 'A mole in a trench coat opens it. Ink bottles and brushes, all very legal.',
      choices: [
        { txt: 'Buy ink.', sub: 'Lose 40 gold. Gain 3 Ink.', fx: [{ k: 'gold', v: -40 }, { k: 'ink', v: 3 }], cond: hasGold(40) },
        { txt: 'Buy a comb.', sub: 'Lose 50 gold. Gain a Comb brush.', fx: [{ k: 'gold', v: -50 }, { k: 'brush', id: 'comb' }], cond: hasGold(50) },
        { txt: 'Take a free sample.', sub: 'Gain 1 Ink.', fx: [{ k: 'ink', v: 1 }] },
      ] },
    { id: 'under_the_machine', title: 'Under the Machine', art: 'coin',
      text: 'Something shiny is wedged under a claw machine. Something else is breathing under there too.',
      choices: [
        { txt: 'Reach under.', sub: 'Lose 5 HP. Gain 30 gold.', fx: [{ k: 'hp', v: -5 }, { k: 'gold', v: 30 }] },
        { txt: 'Poke it out with the Rig.', sub: 'Fight a Coin Rat pack. Gain 20 gold.', fx: [{ k: 'gold', v: 20 }, { k: 'fight', enc: ['rat', 'rat', 'rat'] }] },
        LEAVE,
      ] },
    { id: 'goblin_toll', title: 'Goblin Toll Booth', art: 'goblin',
      text: 'A goblin in a paper hat sits in a cardboard toll booth. "Twenty gold or a fight. Company policy."',
      choices: [
        { txt: 'Pay the toll.', sub: 'Lose 20 gold.', fx: [{ k: 'gold', v: -20 }], cond: hasGold(20) },
        { txt: 'Refuse.', sub: 'Fight the goblin and a friend.', fx: [{ k: 'fight', enc: ['goblin', 'gremlin'] }] },
        { txt: 'Tear down the booth.', sub: 'Lose 7 HP. Gain a Grudge Skull.', fx: [{ k: 'hp', v: -7 }, { k: 'item', id: 'grudge_skull' }] },
      ] },
  ];
  const EVENTS = {};
  for (const e of EVENT_LIST) EVENTS[e.id] = e;

  // ---------------------------------------------------------------- brushes
  // Axial neighbour order shared with MAP (east first, then counterclockwise).
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const BRUSHES = {
    line3: { id: 'line3', name: 'Straight Line', icon: '➡', text: 'Reveal 3 tiles in a row toward the boss.',
      cells: (q, r) => [[q, r], [q + 1, r], [q + 2, r]] },
    splash: { id: 'splash', name: 'Splash', icon: '💦', text: 'Reveal a tile and all 6 of its neighbours.',
      cells: (q, r) => [[q, r]].concat(DIRS.map(([dq, dr]) => [q + dq, r + dr])) },
    // Two different neighbours, picked by a hash of the cell so it is stable.
    drip: { id: 'drip', name: 'Drip', icon: '💧', text: 'Reveal a tile and 2 of its neighbours.',
      cells: (q, r) => {
        const h = U.hashStr('drip:' + q + ',' + r);
        const i = h % 6;
        const j = (i + 1 + ((h >>> 3) % 5)) % 6;
        return [[q, r], [q + DIRS[i][0], r + DIRS[i][1]], [q + DIRS[j][0], r + DIRS[j][1]]];
      } },
    // Same offset column (MAP is odd-r: c = q + floor(r/2)), two rows up and down.
    comb: { id: 'comb', name: 'Comb', icon: '🪮', text: 'Reveal a column of 5 tiles.',
      cells: (q, r) => {
        const c = q + Math.floor(r / 2);
        const out = [];
        for (let d = -2; d <= 2; d++) out.push([c - Math.floor((r + d) / 2), r + d]);
        return out;
      } },
  };

  // ------------------------------------------------------------- characters
  const CHARACTERS = {
    knight: { id: 'knight', name: 'Sir Grabsworth', title: 'The Knight', color: '#2ee6d6',
      blurb: 'Swords, shields and a very firm handshake. Heavy gear, strong grip, slow rails.',
      hp: 80, gold: 99, unlock: 'start', unlockText: 'Available from the start.',
      claw: { grabs: 3, width: 1.1, grip: 1.3, speed: 0.9, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'squire_gauntlet',
      bin: ['rusty_sword', 'rusty_sword', 'rusty_sword', 'rusty_sword', 'rusty_sword',
        'dented_shield', 'dented_shield', 'dented_shield', 'dented_shield', 'dented_shield',
        'spiked_buckler', 'iron_chain', 'crisp_apple'] },
    alchemist: { id: 'alchemist', name: 'Mira Fizzwick', title: 'The Alchemist', color: '#a6ff5e',
      blurb: 'Potions, bombs and poison. Four grabs a turn with a tiny claw. Things tend to fizz.',
      hp: 60, gold: 99, unlock: 'act2', unlockText: 'Reach Act 2 with any Crawler.',
      claw: { grabs: 4, width: 0.85, grip: 0.9, speed: 1, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'bubbling_satchel',
      bin: ['toxic_vial', 'toxic_vial', 'toxic_vial', 'toxic_vial',
        'bubble_flask', 'bubble_flask', 'bubble_flask', 'bubble_flask', 'bubble_flask',
        'cherry_bomb', 'cherry_bomb', 'stink_potion', 'crisp_apple'] },
    rogue: { id: 'rogue', name: 'Pip Quickclaw', title: 'The Rogue', color: '#ff2e88',
      blurb: 'Daggers, coins and not being there when the hit lands. The fastest rails in the Spire.',
      hp: 65, gold: 140, unlock: 'win', unlockText: 'Win a run with any Crawler.',
      claw: { grabs: 3, width: 0.95, grip: 1, speed: 1.4, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'pickpocket_glove',
      bin: ['shiv', 'shiv', 'shiv', 'shiv', 'shiv',
        'old_boot', 'old_boot', 'old_boot', 'old_boot', 'old_boot',
        'lucky_coin', 'lucky_coin', 'skeleton_key'] },
  };

  // ------------------------------------------------------------------- acts
  const ACTS = {
    1: { name: 'The Damp Arcade', sub: 'Basement level. Where the prizes rust.', floors: 1,
      palette: { bg: '#12091f', wall: '#2a1840', accent: '#a6ff5e' } },
    2: { name: 'The Clockwork Foundry', sub: 'Mezzanine. Where the prizes are made.', floors: 1,
      palette: { bg: '#1a0d12', wall: '#3a2220', accent: '#ffc94d' } },
    3: { name: 'The Frozen Penthouse', sub: 'Top floor. Where the prizes are kept forever.', floors: 1,
      palette: { bg: '#0b1426', wall: '#1c2f4a', accent: '#2ee6d6' } },
  };

  // ---------------------------------------------------------------- helpers
  // Final rules text. Tokens: {v} {v2} {v3} = |v| of the 1st/2nd/3rd effect
  // that has a v, {n} = the first effect with an n, {min} {max} = the random
  // roll range, {copies} = how many copy effects. Exhaust is appended.
  function itemText(def, plus) {
    if (!def) return '';
    const fx = (plus && def.plus && Array.isArray(def.plus.fx)) ? def.plus.fx : (def.fx || []);
    const withV = fx.filter(f => typeof f.v === 'number');
    const withN = fx.find(f => typeof f.n === 'number');
    const rnd = fx.find(f => f.k === 'random');
    const copies = fx.filter(f => f.k === 'copy').length;
    let s = String(def.text || '');
    s = s.replace(/\{v(\d?)\}/g, (m, d) => {
      const f = withV[d ? Number(d) - 1 : 0];
      return f ? String(Math.abs(f.v)) : m;
    });
    s = s.replace(/\{n\}/g, (m) => (withN ? String(withN.n) : m));
    s = s.replace(/\{min\}/g, (m) => (rnd ? String(rnd.min) : m));
    s = s.replace(/\{max\}/g, (m) => (rnd ? String(rnd.max) : m));
    s = s.replace(/\{copies\}/g, String(copies));
    if (def.exhaust && def.rarity !== 'junk' && !/exhaust/i.test(s)) s += ' Exhaust.';
    return s;
  }

  // Item ids for a rarity ('c','u','r','l', 'junk', or falsy for any),
  // limited to shared items plus the given character's (all when no char),
  // optionally to items carrying any of the given tags. Starters and junk
  // are left out unless junk is asked for by name.
  function pool(rarity, char, tags) {
    return ITEM_IDS.filter(id => {
      const d = ITEMS[id];
      if (rarity === 'junk') return d.rarity === 'junk';
      if (d.rarity === 'junk' || d.starter) return false;
      if (rarity && d.rarity !== rarity) return false;
      if (char && d.char && d.char !== char) return false;
      if (tags && tags.length && !tags.some(t => d.tags.indexOf(t) >= 0)) return false;
      return true;
    });
  }

  // Weighted rarity roll. weights: {c,u,r,l} or an act number (default act 1).
  function rollRarity(rng, weights) {
    const wt = typeof weights === 'number' ? (RARITY_WEIGHTS[weights] || RARITY_WEIGHTS[1]) : (weights || RARITY_WEIGHTS[1]);
    const keys = ['c', 'u', 'r', 'l'];
    let tot = 0;
    for (const k of keys) tot += Math.max(0, wt[k] || 0);
    if (tot <= 0) return 'c';
    let x = rng() * tot;
    for (const k of keys) {
      const v = Math.max(0, wt[k] || 0);
      if (x < v) return k;
      x -= v;
    }
    return 'c';
  }

  // n distinct item ids for a reward screen. Each slot rolls a rarity by act,
  // then draws from the character's own pool (CHAR_BIAS of the time) or the
  // shared pool, falling back to anything left if that pool is exhausted.
  // Deterministic: the same rng state always gives the same ids.
  function rewardItems(rng, act, char, n) {
    n = n == null ? 3 : n;
    const wt = RARITY_WEIGHTS[Math.min(3, Math.max(1, act | 0))];
    const out = [];
    const fresh = (ids) => ids.filter(id => out.indexOf(id) < 0);
    const pickFrom = (ids) => ids[Math.floor(rng() * ids.length)];
    for (let i = 0; i < n; i++) {
      const rar = rollRarity(rng, wt);
      const own = !!char && rng() < CHAR_BIAS;
      let cand;
      if (!char) cand = fresh(pool(rar));
      else cand = fresh(pool(rar, char).filter(id => (own ? ITEMS[id].char === char : !ITEMS[id].char)));
      if (!cand.length) cand = fresh(pool(rar, char));
      for (const r of ['c', 'u', 'r', 'l']) { if (cand.length) break; cand = fresh(pool(r, char)); }
      if (!cand.length) break;
      out.push(pickFrom(cand));
    }
    return out;
  }

  // Relic ids of a rarity (or any random-pool rarity when falsy), minus the
  // ones listed in `exclude` (e.g. already owned). Starters and event relics
  // never show up here.
  function relicPool(rarity, exclude) {
    const ex = exclude || [];
    return Object.keys(RELICS).filter(id => {
      const r = RELICS[id];
      if (r.starter || r.rarity === 'event') return false;
      if (rarity && r.rarity !== rarity) return false;
      return ex.indexOf(id) < 0;
    });
  }

  return {
    ITEMS, STATUS, ENEMIES, ENCOUNTERS, RELICS, EVENTS, CLAW_UPGRADES, BRUSHES, CHARACTERS, ACTS,
    ITEM_ART, ENEMY_ART, TAGS, FX_KINDS, MOVE_KINDS, EVENT_FX, RELIC_MODS, RELIC_HOOKS, RARITY_WEIGHTS, CHAR_BIAS, ECONOMY,
    itemText, pool, rollRarity, rewardItems, relicPool,
  };
})();
