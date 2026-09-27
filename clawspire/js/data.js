// Clawspire -- content. Items, statuses, enemies, encounters, relics, events,
// claw upgrades, map tools, characters, acts and a few small pure helpers.
// The map's light is bulbs (the fx kind and the run field stay 'ink', the
// player-facing words come from TERMS) and its tools replace the brushes
// (TOOLS, with BRUSHES as an alias for old code and saves).
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
    'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist',
    // the monsters pass: scavengers that eat your stuff
    'raccoon', 'goat', 'magpie'];
  const TAGS = ['metal', 'weapon', 'glass', 'potion', 'heavy', 'light', 'junk', 'magic', 'food', 'tool', 'small'];
  const FX_KINDS = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'shake', 'junk',
    'purge', 'copy', 'dmgPer', 'cleanse', 'lifesteal', 'random', 'poisonAll', 'blockPer', 'pay', 'again'];
  // What dmgPer / blockPer can count. poison and burn read the target's
  // stacks, small the small items in the cabinet, streak the grab streak,
  // gold the gold carried (per 10).
  const PER_KINDS = ['block', 'junk', 'metal', 'grabsUsed', 'poison', 'burn', 'small', 'streak', 'gold'];
  const MOVE_KINDS = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk',
    'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape',
    // the monsters pass (see DESIGN.md "Enemies"): eat items, drop a ticking
    // bomb, rust metal, jam the claw rail, lay eggs that hatch
    'gulp', 'bomb', 'corrode', 'jam', 'eggs'];
  const EVENT_FX = ['hp', 'maxhp', 'gold', 'ink', 'brush', 'item', 'relic', 'remove', 'upgrade', 'claw',
    'fight', 'junk'];
  const RELIC_MODS = ['grabs', 'width', 'grip', 'speed', 'prongs', 'rubber', 'magnet', 'maxhp', 'gold',
    'ink', 'startBlock', 'startStr'];
  const RELIC_HOOKS = ['onFightStart', 'onTurnStart', 'onTurnEnd', 'onPlay', 'onGrab', 'onDmgDealt',
    'onKill', 'onHurt', 'onStatus', 'onBlock', 'onHeal', 'onJunk', 'onCombo', 'onJackpot', 'onShatter', 'onGold'];
  // Engine rules a build-defining relic can bend (relic.rules, merged into
  // F.rules by COMBAT.newFight). See DESIGN.md "Builds and synergies".
  const RELIC_RULES = ['poisonKeep', 'blockKeep', 'shatter', 'glassBreak', 'amp', 'comboTwice', 'echo'];
  const RARITY_WEIGHTS = {
    1: { c: 70, u: 25, r: 5, l: 0 },
    2: { c: 55, u: 33, r: 11, l: 1 },
    3: { c: 40, u: 38, r: 18, l: 4 },
  };
  // Chance that a reward slot is drawn from the character's own pool.
  const CHAR_BIAS = 0.4;
  // Build pull: with a run to read, this share of reward screens redraws
  // one slot from an archetype the run already invests in.
  const BUILD_PULL = 0.25;
  // Grab combos that may fire on one grab (biggest tier first).
  const COMBO_MAX = 3;
  // Chance that a reward or shop screen (3+ slots) turns one of its common
  // slots into a bag of small fillers. Screens without a common slot get no
  // bag, so about 30% of act 1 screens and 26% of act 3 screens show one.
  const BAG_CHANCE = 0.33;
  // Map economy the game and map read (balance bot, 40 runs per setting):
  // the bible's ~35% lit share needs ~20 bulbs per act. 5 start bulbs left
  // the map 22% lit and a rushing player stuck on most maps. The keys keep
  // the old 'ink' spelling: a bulb is what a unit of ink was.
  // Global difficulty step: the basket claw brings up one or two items on
  // nearly every drop, so the enemy bands are multiplied here rather than
  // rewritten. hp scales every enemy's hit points, dmg every attack and
  // charge value. Tuned with the whole-run bot.
  // hp/dmg multiply every enemy. ramp is the hidden escalation: after every
  // `every` fights of a run, enemies gain +hp/+dmg (as fractions) per step,
  // up to `max` steps. The player never sees the counter.
  const DIFFICULTY = { hp: 2.0, dmg: 1.8, ramp: { every: 3, hp: 0.12, dmg: 0.12, max: 8 } };   // the owner tunes by hand

  const ECONOMY = {
    startInk: 10,          // bulbs at the start of every act (was 5)
    inkTile: 2,            // a box of bulbs always gives 2 (was 1, sometimes 2)
    fightInkChance: 0.5,   // a won normal fight drops 1 bulb this often
    eliteInk: 2,           // bulbs for beating an elite (was 1)
    towerInk: 2,           // bulbs a tower keeper leaves on top of the view and the relic
    eliteToolChance: 0.35, // a beaten elite hands over a tool this often
    trickle: 2,            // used items that rain back into the bin at every turn start
    binFloor: 6,           // a bin below this at turn start is topped up from the used pile first (then the trickle)
  };
  // The player-facing words for the map's light and its tools: every piece
  // of copy reads them, so the rename lives in one place.
  const TERMS = { ink: 'bulb', inkPlural: 'bulbs', brush: 'tool', brushPlural: 'tools' };

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
  const copy = (tag) => (tag ? { k: 'copy', tag } : { k: 'copy' });
  const dmgPer = (v, per) => ({ k: 'dmgPer', v, per });
  const cleanse = () => ({ k: 'cleanse' });
  const lifesteal = (v) => ({ k: 'lifesteal', v });
  // v is the rounded expected roll, kept for previews; combat rolls min..max.
  const random = (min, max) => ({ k: 'random', v: Math.round((min + max) / 2), min, max });
  // No v: every enemy takes damage equal to its Poison right now.
  const poisonAll = () => ({ k: 'poisonAll' });
  const blockPer = (v, per) => ({ k: 'blockPer', v, per });
  // Spend v gold (the run's gold); when broke the rest of the item fizzles.
  const pay = (v) => ({ k: 'pay', v });
  // Resolve the previous item played this fight again.
  const again = () => ({ k: 'again' });

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
      fx: [dmg(7)], plus: { fx: [dmg(10)] }, text: 'Deal {v} damage. It has seen better centuries.' },
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
    { id: 'flail', name: 'Morning Flail', rarity: 'u', cost: 65, char: 'knight',
      tags: ['metal', 'weapon', 'heavy'], shape: box(56, 10), density: 1.9, friction: 0.55,
      color: '#aab3bd', color2: '#ff5a4a', art: 'chain',
      fx: [dmg(3, 3)], plus: { fx: [dmg(4, 3)] }, text: 'Deal {v} damage {n} times. Spin to win.' },
    { id: 'magnetite', name: 'Magnetite', rarity: 'u', cost: 65, char: 'knight',
      tags: ['metal', 'heavy'], shape: SHAPES.gem, density: 2.2, friction: 0.5,
      color: '#4a4f58', color2: '#ff2e88', art: 'gem',
      fx: [dmgPer(2, 'metal')], plus: { fx: [dmgPer(3, 'metal')] },
      text: 'Deal {v} damage for each metal item in your bin. Attracts attention.' },
    { id: 'aegis', name: 'Aegis of the Rig', rarity: 'l', cost: 130, char: 'knight',
      tags: ['metal', 'heavy'], shape: SHAPES.kite, density: 2.2, friction: 0.5,
      color: '#e6ebf0', color2: '#ffc94d', art: 'shield', target: 'self',
      fx: [block(14), status('shield_up', 1, 'self')], plus: { fx: [block(18), status('shield_up', 2, 'self')] },
      text: 'Gain {v} Block and {v2} Bulwark, so your Block survives that many turn starts. A wall with a handle.' },

    // ---- Alchemist: potions, bombs, poison, junk control ----
    { id: 'toxic_vial', name: 'Toxic Vial', rarity: 'c', cost: 40, char: 'alchemist', starter: true,
      tags: ['glass', 'potion'], shape: SHAPES.flask, density: 0.8, friction: 0.4,
      color: '#a6ff5e', color2: '#2d5a1a', art: 'flask',
      fx: [dmg(1), status('poison', 2)], plus: { fx: [dmg(2), status('poison', 4)] },
      text: 'Deal {v} damage and apply {v2} Poison. Do not drink.' },
    { id: 'bubble_flask', name: 'Bubble Flask', rarity: 'c', cost: 40, char: 'alchemist', starter: true,
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#7fd6ff', color2: '#1b4f73', art: 'potion', target: 'self',
      fx: [block(4)], plus: { fx: [block(7)] }, text: 'Gain {v} Block. The bubbles do the blocking.' },
    { id: 'cherry_bomb', name: 'Cherry Bomb', rarity: 'c', cost: 45, char: 'alchemist',
      tags: ['weapon'], shape: circle(13), density: 1.1, friction: 0.5, restitution: 0.25,
      color: '#ff5a4a', color2: '#2a1a1a', art: 'bomb', target: 'all',
      fx: [dmg(3)], plus: { fx: [dmg(5)] }, text: 'Deal {v} damage to ALL enemies. Contains no cherries.' },
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
    { id: 'rot_catalyst', name: 'Rot Catalyst', rarity: 'u', cost: 65, char: 'alchemist',
      tags: ['glass', 'potion'], shape: SHAPES.flask, density: 0.8, friction: 0.4,
      color: '#6b8f2e', color2: '#d4ff3a', art: 'flask',
      fx: [status('poison', 2), dmgPer(1, 'poison')], plus: { fx: [status('poison', 4), dmgPer(1, 'poison')] },
      text: 'Apply {v} Poison, then deal damage equal to the Poison on the target. Ripe.' },
    { id: 'bottled_blaze', name: 'Bottled Blaze', rarity: 'u', cost: 60, char: 'alchemist',
      tags: ['glass', 'potion', 'weapon'], shape: SHAPES.bottle, density: 0.8, friction: 0.35,
      color: '#ff9a2e', color2: '#6bd3a0', art: 'bottle', target: 'all', exhaust: true,
      fx: [dmg(4), status('burn', 4, 'all')], plus: { fx: [dmg(6), status('burn', 6, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. Shatters on impact, by design.' },

    // ---- Rogue: daggers, coins, dodge, extra grabs ----
    { id: 'shiv', name: 'Shiv', rarity: 'c', cost: 40, char: 'rogue', starter: true,
      tags: ['metal', 'weapon', 'light'], shape: box(30, 9), density: 1.2, friction: 0.45,
      color: '#d0d6de', color2: '#3a2a4a', art: 'dagger',
      fx: [dmg(5)], plus: { fx: [dmg(8)] }, text: 'Deal {v} damage. Small, pointy, deniable.' },
    { id: 'old_boot', name: 'Old Boot', rarity: 'c', cost: 40, char: 'rogue', starter: true,
      tags: [], shape: SHAPES.boot, density: 0.9, friction: 0.7,
      color: '#7a5236', color2: '#3a2616', art: 'boot', target: 'self',
      fx: [block(4)], plus: { fx: [block(7)] }, text: 'Gain {v} Block. Smells like a plan.' },
    { id: 'lucky_coin', name: 'Lucky Coin', rarity: 'c', cost: 45, char: 'rogue',
      tags: ['metal'], shape: circle(11), density: 2.4, friction: 0.3, restitution: 0.3,
      color: '#ffc94d', color2: '#b8862b', art: 'coin',
      fx: [dmg(3), gold(2)], plus: { fx: [dmg(5), gold(4)] },
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
    { id: 'venom_dart', name: 'Venom Dart', rarity: 'c', cost: 45, char: 'rogue',
      tags: ['metal', 'weapon', 'light'], shape: box(32, 9), density: 1.1, friction: 0.45,
      color: '#a6ff5e', color2: '#2d5a1a', art: 'dagger',
      fx: [dmg(2), status('poison', 3)], plus: { fx: [dmg(3), status('poison', 5)] },
      text: 'Deal {v} damage and apply {v2} Poison. The tip does the talking.' },
    { id: 'bribe', name: 'Bribe', rarity: 'u', cost: 60, char: 'rogue',
      tags: ['metal'], shape: circle(11), density: 2.2, friction: 0.3, restitution: 0.3,
      color: '#ffe066', color2: '#2a8a3a', art: 'coin',
      fx: [pay(12), status('stun', 1)], plus: { fx: [pay(8), status('stun', 1)] },
      text: 'Pay {v} gold: the target is Stunned and skips its next action. Everyone has a price.' },

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
      fx: [ink(1)], plus: { fx: [ink(2)] }, text: 'Gain {v} Bulbs. X marks several spots.' },
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
      fx: [maxhp(2)], plus: { fx: [maxhp(3)] },
      text: 'Gain {v} Max HP and heal {v}. Best not to ask where it came from.' },
    { id: 'dragon_egg', name: 'Dragon Egg', rarity: 'l', cost: 130,
      tags: ['magic', 'heavy'], shape: SHAPES.bigEgg, density: 1.8, friction: 0.4,
      color: '#ff5a4a', color2: '#ffc94d', art: 'egg', target: 'all',
      fx: [dmg(6), status('burn', 5, 'all')], plus: { fx: [dmg(9), status('burn', 7, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. It hatched angry.' },
    // ---- Build pieces (see DESIGN.md "Builds and synergies"). Most carry
    // two archetypes on purpose, so hybrids have glue. ----
    { id: 'firebomb', name: 'Firebomb', rarity: 'u', cost: 60,
      tags: ['weapon'], shape: circle(15), density: 1.1, friction: 0.5, restitution: 0.2,
      color: '#ff8a2e', color2: '#5a1a0a', art: 'bomb', target: 'all',
      fx: [dmg(3), status('burn', 3, 'all')], plus: { fx: [dmg(4), status('burn', 5, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. Handle with oven mitts.' },
    { id: 'ghost_pepper', name: 'Ghost Pepper', rarity: 'c', cost: 40,
      tags: ['food'], shape: circle(13), density: 0.8, friction: 0.5,
      color: '#ff2e4a', color2: '#3a8a1a', art: 'apple',
      fx: [status('burn', 4), status('burn', 1, 'self')], plus: { fx: [status('burn', 6), status('burn', 1, 'self')] },
      text: 'Apply {v} Burn. You gain {v2} Burn too. Worth it.' },
    { id: 'inferno_scroll', name: 'Inferno Scroll', rarity: 'r', cost: 100,
      tags: ['magic', 'light'], shape: box(42, 14), density: 0.5, friction: 0.6,
      color: '#ff8a2e', color2: '#8a1a0a', art: 'scroll',
      fx: [dmgPer(2, 'burn')], plus: { fx: [dmgPer(3, 'burn')] },
      text: 'Deal {v} damage for each Burn on the target. Reads best out loud.' },
    { id: 'ice_pick', name: 'Ice Pick', rarity: 'c', cost: 45,
      tags: ['metal', 'weapon', 'tool'], shape: box(34, 10), density: 1.2, friction: 0.35,
      color: '#bfefff', color2: '#3b6fd6', art: 'dagger',
      fx: [dmg(4), status('chill', 1)], plus: { fx: [dmg(6), status('chill', 2)] },
      text: 'Deal {v} damage and apply {v2} Chill. Chip, chip, freeze.' },
    { id: 'blizzard_orb', name: 'Blizzard Orb', rarity: 'r', cost: 100,
      tags: ['glass', 'magic'], shape: circle(16), density: 1.0, friction: 0.25, restitution: 0.15,
      color: '#eaf6ff', color2: '#2ee6d6', art: 'orb', target: 'all',
      fx: [dmg(5), status('chill', 2, 'all')], plus: { fx: [dmg(7), status('chill', 3, 'all')] },
      text: 'Deal {v} damage and apply {v2} Chill to ALL enemies. Indoor weather.' },
    { id: 'frozen_heart', name: 'Frozen Heart', rarity: 'u', cost: 60,
      tags: ['magic'], shape: SHAPES.heart, density: 1.1, friction: 0.3,
      color: '#9fd8ff', color2: '#2e6bd6', art: 'heart', target: 'self',
      fx: [block(6), status('chill', 1, 'all')], plus: { fx: [block(9), status('chill', 2, 'all')] },
      text: 'Gain {v} Block and apply {v2} Chill to ALL enemies. Cold, but it means well.' },
    { id: 'thorn_ring', name: 'Thorn Ring', rarity: 'u', cost: 60,
      tags: ['metal', 'magic'], shape: circle(10), density: 2.0, friction: 0.35, restitution: 0.2,
      color: '#8fae3a', color2: '#3a4a1a', art: 'ring', target: 'self',
      fx: [block(4), status('thorns', 1, 'self')], plus: { fx: [block(6), status('thorns', 2, 'self')] },
      text: 'Gain {v} Block and {v2} Thorns for this fight. Thorns stack. Ouch, fashionably.' },
    { id: 'glass_shield', name: 'Glass Shield', rarity: 'c', cost: 45,
      tags: ['glass'], shape: SHAPES.heater, density: 1.2, friction: 0.3,
      color: '#d8f0ff', color2: '#7fd6ff', art: 'shield', target: 'self', exhaust: true,
      fx: [block(11)], plus: { fx: [block(15)] },
      text: 'Gain {v} Block. Stops one big hit, then it is a mosaic.' },
    { id: 'rage_potion', name: 'Rage Potion', rarity: 'u', cost: 60,
      tags: ['glass', 'potion'], shape: SHAPES.potion, density: 0.8, friction: 0.4,
      color: '#ff2e4a', color2: '#5a0a1a', art: 'potion', target: 'self', exhaust: true,
      fx: [status('str', 3, 'self'), dmg(-3)], plus: { fx: [status('str', 4, 'self'), dmg(-2)] },
      text: 'Gain {v} Strength. Lose {v2} HP. Tastes angry.' },
    { id: 'scrap_shield', name: 'Scrap Shield', rarity: 'c', cost: 45,
      tags: ['metal'], shape: circle(16), density: 1.4, friction: 0.45, restitution: 0.15,
      color: '#8a6a4a', color2: '#ff8a2e', art: 'buckler', target: 'self',
      fx: [block(3), blockPer(2, 'junk')], plus: { fx: [block(5), blockPer(3, 'junk')] },
      text: 'Gain {v} Block, plus {v2} for each junk item in your bin. Upcycled.' },
    { id: 'pet_rock', name: 'Pet Rock', rarity: 'c', cost: 40,
      tags: ['heavy'], shape: SHAPES.rock, density: 1.9, friction: 0.7,
      color: '#b8a898', color2: '#ff2e88', art: 'rock',
      fx: [dmg(7), junk('rock', 1)], plus: { fx: [dmg(10), junk('rock', 1)] },
      text: 'Deal {v} damage. Adds a Rock to your bin, so it has a friend.' },
    { id: 'junk_cannon', name: 'Junk Cannon', rarity: 'r', cost: 100,
      tags: ['metal', 'heavy', 'tool'], shape: SHAPES.horn, density: 1.6, friction: 0.5,
      color: '#7a7068', color2: '#ffc94d', art: 'horn', target: 'all',
      fx: [dmgPer(4, 'junk'), purge(10)], plus: { fx: [dmgPer(6, 'junk'), purge(10)] },
      text: 'Deal {v} damage to ALL enemies for each junk item in your bin, then blast up to {n} junk out. Loaded with regret.' },
    { id: 'arcade_token', name: 'Arcade Token', rarity: 'c', cost: 45,
      tags: ['metal'], shape: circle(11), density: 2.2, friction: 0.3, restitution: 0.3,
      color: '#2ee6d6', color2: '#1a6b66', art: 'coin',
      fx: [dmg(3), dmgPer(2, 'streak')], plus: { fx: [dmg(4), dmgPer(3, 'streak')] },
      text: 'Deal {v} damage, plus {v2} for each grab in your current streak. Insert to continue.' },
    { id: 'gumball_jar', name: 'Gumball Jar', rarity: 'u', cost: 60,
      tags: ['glass'], shape: SHAPES.bottle, density: 1.0, friction: 0.35,
      color: '#ff9ad0', color2: '#2ee6d6', art: 'bottle', target: 'all',
      fx: [dmgPer(1, 'small')], plus: { fx: [dmgPer(2, 'small')] },
      text: 'Deal {v} damage to ALL enemies for each small item in your bin. Contents may vary.' },
    { id: 'crystal_shard', name: 'Crystal Shard', rarity: 'u', cost: 65,
      tags: ['glass', 'magic', 'weapon'], shape: SHAPES.shard, density: 1.0, friction: 0.2,
      color: '#ff9ad0', color2: '#7a5aff', art: 'iceshard', exhaust: true,
      fx: [dmg(7, 2)], plus: { fx: [dmg(9, 2)] },
      text: 'Deal {v} damage {n} times. Sharp enough to cut the tension.' },
    { id: 'blood_orange', name: 'Blood Orange', rarity: 'c', cost: 45,
      tags: ['food'], shape: circle(13), density: 0.8, friction: 0.5,
      color: '#ff8a2e', color2: '#8a1a2a', art: 'apple',
      fx: [lifesteal(5)], plus: { fx: [lifesteal(7)] },
      text: 'Deal {v} damage and heal what gets through. Juicy.' },
    { id: 'vampire_fang', name: 'Vampire Fang', rarity: 'u', cost: 65,
      tags: ['weapon'], shape: box(44, 12), density: 0.9, friction: 0.5,
      color: '#f4f0e6', color2: '#8a1a2a', art: 'bone',
      fx: [lifesteal(8)], plus: { fx: [lifesteal(11)] },
      text: 'Deal {v} damage and heal what gets through. Bitey.' },
    { id: 'pay_to_win', name: 'Pay to Win', rarity: 'r', cost: 105,
      tags: ['magic'], shape: SHAPES.star, density: 0.8, friction: 0.5, restitution: 0.2,
      color: '#ffc94d', color2: '#ff2e88', art: 'star',
      fx: [pay(20), dmg(30)], plus: { fx: [pay(20), dmg(40)] },
      text: 'Pay {v} gold to deal {v2} damage. The arcade way.' },
    { id: 'golden_idol', name: 'Golden Idol', rarity: 'u', cost: 65,
      tags: ['metal', 'magic', 'heavy'], shape: SHAPES.skull, density: 2.0, friction: 0.45,
      color: '#ffc94d', color2: '#8a5a2b', art: 'skull',
      fx: [dmgPer(1, 'gold')], plus: { fx: [dmgPer(2, 'gold')] },
      text: 'Deal {v} damage for every 10 gold you carry. It watches your wallet.' },
    { id: 'deja_vu', name: 'Deja Vu', rarity: 'r', cost: 100,
      tags: ['magic', 'light'], shape: box(42, 14), density: 0.5, friction: 0.6,
      color: '#b08cff', color2: '#ffe066', art: 'scroll', target: 'self',
      fx: [block(3), again()], plus: { fx: [block(6), again()] },
      text: 'Gain {v} Block, then play the last item you played this fight again. Have we met?' },
    { id: 'arcane_tome', name: 'Arcane Tome', rarity: 'u', cost: 60,
      tags: ['magic'], shape: box(30, 38), density: 1.0, friction: 0.6,
      color: '#7a5aff', color2: '#2ee6d6', art: 'book',
      fx: [dmg(4), copy('magic')], plus: { fx: [dmg(7), copy('magic')] },
      text: 'Deal {v} damage and copy a random magic item in your bin for this fight. Chapter one: more chapters.' },

    // ---- Small fillers: marbles, beads and sweets. Circles r 9-11 so the
    // claw's cradle scoops two or three at once; each does a little. Tagged
    // 'small', they stay out of the single-item reward and shop pools and
    // arrive in starting bins and bags instead. ----
    { id: 'prize_marble', name: 'Prize Marble', rarity: 'c', cost: 12,
      tags: ['small'], shape: circle(9), density: 1.3, friction: 0.2, restitution: 0.35,
      color: '#2ee6d6', color2: '#ff2e88', art: 'orb',
      fx: [dmg(2)], plus: { fx: [dmg(3)] }, text: 'Deal {v} damage. Someone lost their marbles. Finders keepers.' },
    { id: 'glass_bead', name: 'Glass Bead', rarity: 'c', cost: 12,
      tags: ['small'], shape: circle(9), density: 1.0, friction: 0.3, restitution: 0.2,
      color: '#9fd8ff', color2: '#3b6fd6', art: 'gem', target: 'self',
      fx: [block(2)], plus: { fx: [block(3)] }, text: 'Gain {v} Block. Tiny, shiny, weirdly stubborn.' },
    { id: 'peppermint', name: 'Peppermint', rarity: 'c', cost: 15,
      tags: ['small', 'food'], shape: circle(10), density: 0.8, friction: 0.35, restitution: 0.15,
      color: '#fff4f4', color2: '#ff2e4a', art: 'orb', target: 'self',
      fx: [heal(2)], plus: { fx: [heal(3)] }, text: 'Heal {v} HP. Minty fresh courage.' },
    { id: 'ember_pebble', name: 'Ember Pebble', rarity: 'c', cost: 15,
      tags: ['small'], shape: circle(9), density: 1.6, friction: 0.5, restitution: 0.1,
      color: '#ff8a2e', color2: '#ffe066', art: 'gem',
      fx: [status('burn', 2)], plus: { fx: [status('burn', 3)] }, text: 'Apply {v} Burn. A pebble with a temper.' },
    { id: 'frost_pearl', name: 'Frost Pearl', rarity: 'c', cost: 18,
      tags: ['small'], shape: circle(9), density: 1.1, friction: 0.15, restitution: 0.2,
      color: '#eaf6ff', color2: '#7fb2ff', art: 'snowball',
      fx: [dmg(1), status('chill', 1)], plus: { fx: [dmg(2), status('chill', 1)] },
      text: 'Deal {v} damage and apply {v2} Chill. Cultured, and very cold about it.' },
    { id: 'lead_shot', name: 'Lead Shot', rarity: 'c', cost: 18,
      tags: ['small', 'metal', 'weapon', 'heavy'], shape: circle(9), density: 2.2, friction: 0.4, restitution: 0.05,
      color: '#5a6068', color2: '#aab3bd', art: 'orb',
      fx: [dmg(3)], plus: { fx: [dmg(4)] }, text: 'Deal {v} damage. Heavier than it looks. Everything is.' },
    { id: 'lucky_penny', name: 'Lucky Penny', rarity: 'c', cost: 10,
      tags: ['small', 'metal'], shape: circle(10), density: 2.0, friction: 0.3, restitution: 0.3,
      color: '#d9824a', color2: '#8a4a1a', art: 'coin',
      fx: [dmg(1), gold(1)], plus: { fx: [dmg(2), gold(2)] }, text: 'Deal {v} damage and gain {v2} gold. Found it face up, obviously.' },
    { id: 'sour_drop', name: 'Sour Drop', rarity: 'c', cost: 15,
      tags: ['small', 'food'], shape: circle(9), density: 0.9, friction: 0.35, restitution: 0.15,
      color: '#b8ff4a', color2: '#3a8a1a', art: 'apple',
      fx: [status('poison', 2)], plus: { fx: [status('poison', 3)] }, text: 'Apply {v} Poison. So sour it hurts. Them, not you.' },
    { id: 'bouncy_ball', name: 'Bouncy Ball', rarity: 'c', cost: 10,
      tags: ['small', 'light'], shape: circle(10), density: 0.5, friction: 0.6, restitution: 0.9,
      color: '#ff5a4a', color2: '#ffe066', art: 'orb',
      fx: [dmg(1, 2)], plus: { fx: [dmg(2, 2)] }, text: 'Deal {v} damage {n} times. Hits them, bounces, hits them again.' },
    { id: 'pocket_die', name: 'Pocket Die', rarity: 'c', cost: 14,
      tags: ['small'], shape: circle(10), density: 1.1, friction: 0.4, restitution: 0.3,
      color: '#ffe066', color2: '#12091f', art: 'dice',
      fx: [random(1, 4)], plus: { fx: [random(2, 5)] }, text: 'Deal {min} to {max} damage. Worn round from years of cheating.' },
    { id: 'quail_egg', name: 'Quail Egg', rarity: 'c', cost: 12,
      tags: ['small', 'food'], shape: circle(9), density: 0.9, friction: 0.35, restitution: 0.1,
      color: '#f4e6c8', color2: '#8a6a4a', art: 'egg', target: 'self',
      fx: [block(1), heal(1)], plus: { fx: [block(2), heal(2)] }, text: 'Gain {v} Block and heal {v2} HP. Tiny breakfast, tiny armor.' },
    { id: 'iron_nut', name: 'Iron Nut', rarity: 'c', cost: 14,
      tags: ['small', 'metal'], shape: circle(10), density: 2.0, friction: 0.4, restitution: 0.1,
      color: '#8a929c', color2: '#4a5058', art: 'ring', target: 'self',
      fx: [block(2)], plus: { fx: [block(3)] }, text: 'Gain {v} Block. Holds the whole Rig together, probably.' },

    // ---- Bags: reward and shop entries only. The game adds every id in
    // `bag` to the bin instead of the bag itself, so a bag never sits in a
    // cabinet (fx stay empty; exhaust is a safety net). ----
    { id: 'bag_marbles', name: 'Bag of Marbles', rarity: 'c', cost: 30,
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#2ee6d6', color2: '#ff2e88', art: 'orb', target: 'none', exhaust: true,
      bag: ['prize_marble', 'prize_marble', 'prize_marble'], fx: [],
      text: 'Adds 3 Prize Marbles to your bin. Try not to lose them.' },
    { id: 'bag_beads', name: 'Bead Pouch', rarity: 'c', cost: 30,
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#9fd8ff', color2: '#3b6fd6', art: 'gem', target: 'none', exhaust: true,
      bag: ['glass_bead', 'glass_bead', 'glass_bead'], fx: [],
      text: 'Adds 3 Glass Beads to your bin. Some assembly required.' },
    { id: 'bag_sweets', name: 'Sack of Sweets', rarity: 'c', cost: 30,
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#fff4f4', color2: '#ff2e4a', art: 'orb', target: 'none', exhaust: true,
      bag: ['peppermint', 'peppermint', 'sour_drop'], fx: [],
      text: 'Adds 2 Peppermints and a Sour Drop to your bin. Dentists hate it.' },
    { id: 'bag_bolts', name: 'Bucket of Bolts', rarity: 'c', cost: 30,
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#8a929c', color2: '#4a5058', art: 'ring', target: 'none', exhaust: true,
      bag: ['iron_nut', 'iron_nut', 'iron_nut'], fx: [],
      text: 'Adds 3 Iron Nuts to your bin. Metal, and very small about it.' },

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
    // Monster junk (the monsters pass). A lit bomb an enemy dropped in: grab it
    // out and it flies back at the thrower (COMBAT reads inst.fuse / inst.boom),
    // leave it and it goes off in the cabinet. An egg hatches if left alone.
    { id: 'fusebomb', name: 'Lit Bomb', rarity: 'junk', cost: 0,
      tags: ['junk', 'heavy'], shape: circle(15), density: 1.6, friction: 0.6,
      color: '#2b2340', color2: '#ff5a4a', art: 'bomb', target: 'enemy', exhaust: true,
      fx: [], text: 'It is ticking. Grab it out to throw it back at whoever lit it.' },
    { id: 'broodegg', name: 'Spider Egg', rarity: 'junk', cost: 0,
      tags: ['junk', 'light'], shape: SHAPES.egg, density: 0.8, friction: 0.6, restitution: 0.2,
      color: '#e8d8f0', color2: '#8a4a7a', art: 'egg', target: 'none', exhaust: true,
      fx: [], text: 'Something inside is kicking. Grab it out before it hatches.' },
    // Boss junk (DESIGN.md "Bosses"): The Hoard's coin avalanche. It clutters
    // the bin like any junk, but grabbing it out pays a little gold.
    { id: 'hoardcoin', name: 'Hoard Coin', rarity: 'junk', cost: 0,
      tags: ['junk', 'metal'], shape: circle(12), density: 1.4, friction: 0.35, restitution: 0.15,
      color: '#ffc94d', color2: '#c98a1a', art: 'coin', target: 'self', exhaust: true,
      fx: [{ k: 'gold', v: 2 }], text: 'Spilled from the Hoard. Clutters the bin, but grabbing it out pays {v} gold.' },
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
    // the monsters pass: a wrench in the claw rail (player only)
    ['jam', 'Jammed', '🔧', '#c98a1a', 'debuff', 'turns', 'A wrench is stuck in the claw rail: one grab fewer this turn.'],
    // A display counter COMBAT keeps in step with F.streak (no events, no decay).
    ['streak', 'Streak', '🎯', '#ffc94d', 'buff', 'count', 'Grabs in a row that brought something up. An empty grab resets it.'],
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
  // The monsters pass. gulp: swallow n bin items (like: a tag it prefers, or
  // 'shiny' = the rarest); bomb: a lit bomb (v damage, fuse turns); corrode:
  // rust n metal items; jam: a wrench in the rail; eggs: n eggs that hatch
  // into `hatch` after `turns` turns.
  const gulp = (id, name, n, like, txt) => ({ id, name, k: 'gulp', n, like, txt });
  const bombMv = (id, name, v, fuse, txt) => ({ id, name, k: 'bomb', v, fuse, txt });

  // Charge: combat turns the NEXT intent into an automatic "unleash" hit for
  // v, so patterns never follow a charge with a separate attack move.
  const ENEMY_LIST = [
    // ================= ACT 1: The Damp Arcade (shake + junk, gently) =========
    { id: 'rat', name: 'Coin Rat', act: 1, tier: 'normal', hp: [16, 20], art: 'rat', size: 0.85, color: '#9a8a7a',
      desc: 'Lives in the coin return. Bites anything shiny, including you.', ai: 'weighted',
      moves: [w(atk('bite', 'Bite', 5, 1, 'Bites for 5'), 3), w(atk('nibble', 'Nibble', 2, 3, 'Nibbles 2 x3'), 2),
        w(buff('squeak', 'Squeak', 'str', 1, 'Squeaks itself braver (+1 Strength)'), 1)] },
    { id: 'slime', name: 'Sticky Slime', act: 1, tier: 'normal', hp: [30, 38], art: 'slime', size: 1, color: '#a6ff5e',
      desc: 'Mostly water. The rest is attitude. Splits when popped.', ai: 'cycle', pattern: [0, 1, 0, 2],
      moves: [atk('slam', 'Slam', 7, 1, 'Slams for 7'), debuff('spit', 'Spit Goo', 'weak', 1, 'Gums up your hands (Weak)'),
        blk('wobble', 'Wobble', 6, 'Wobbles defensively (Block 6)')],
      onDeath: { k: 'summon', id: 'slimeling' } },
    { id: 'slimeling', name: 'Slimeling', act: 1, tier: 'normal', minion: true, hp: [8, 10], art: 'slime', size: 0.6, color: '#c8ff9a',
      desc: 'A slime, but fun-sized.', ai: 'cycle',
      moves: [atk('splat', 'Splat', 3, 1, 'Splats for 3')] },
    { id: 'bat', name: 'Arcade Bat', act: 1, tier: 'normal', hp: [15, 19], art: 'bat', size: 0.85, color: '#6b4a8c',
      desc: 'Sleeps upside down in the claw rail. Wakes up grumpy.', ai: 'random',
      moves: [atk('flap', 'Flap', 3, 2, 'Flaps and scratches 3 x2'), mv('screech', 'Screech', 'shake', 'Screeches. Your bin rattles.'),
        atk('dive', 'Dive', 6, 1, 'Dives for 6')] },
    { id: 'gremlin', name: 'Token Gremlin', act: 1, tier: 'normal', hp: [23, 28], art: 'gremlin', size: 0.9, color: '#6bd35e',
      desc: 'Feeds rocks to machines to see what happens. Lately: bombs.', ai: 'cycle', pattern: [0, 1, 2, 3, 2],
      moves: [mv('kick', 'Kick', 'shake', 'Kicks the cabinet. Your bin rattles.'),
        mv('pelt', 'Pelt', 'junk', 'Tosses a Rock into your bin', { item: 'rock', n: 1 }),
        atk('scratch', 'Scratch', 6, 1, 'Scratches for 6'),
        bombMv('fuse', 'Lit Fuse', 9, 2, 'Drops a lit bomb in your bin (grab it to throw it back)')] },
    // Act 1 scavengers: they eat what you own and give it back when popped.
    { id: 'trashpanda', name: 'Trash Panda', act: 1, tier: 'normal', hp: [20, 25], art: 'raccoon', size: 0.95, color: '#8e92a0',
      desc: 'Lives behind the prize counter. Anything shiny goes straight down the hatch.', ai: 'cycle', pattern: [0, 1, 2, 1, 3],
      moves: [gulp('rummage', 'Rummage', 1, 'shiny', 'Rummages in your bin and swallows the shiniest thing'),
        atk('swipe', 'Swipe', 5, 1, 'Swipes for 5'), debuff('hiss', 'Hiss', 'weak', 1, 'Hisses at you (Weak)'),
        blk('scurry', 'Scurry', 5, 'Scurries behind a bin (Block 5)')] },
    { id: 'gloop', name: 'Hungry Gloop', act: 1, tier: 'normal', hp: [28, 34], art: 'slime', size: 1.05, color: '#ff7ad9', color2: '#b03a8a',
      desc: 'A slime with a sweet tooth. You can see everything it ate. So can it.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [gulp('slurp', 'Slurp', 2, null, 'Slurps up 2 items from your bin'), atk('slam', 'Slam', 7, 1, 'Slams for 7'),
        blk('burble', 'Burble', 6, 'Burbles defensively (Block 6)')] },
    { id: 'spider', name: 'Crawl Spider', act: 1, tier: 'normal', hp: [20, 25], art: 'spider', size: 0.9, color: '#4a3a5a',
      desc: 'Builds webs in the prize chute. Rude.', ai: 'cycle', pattern: [0, 1, 0, 2],
      moves: [atk('bite', 'Bite', 5, 1, 'Bites for 5'), debuff('venom', 'Venom', 'poison', 3, 'Venom (3 Poison)'),
        debuff('web', 'Web', 'weak', 1, 'Webs your arms (Weak)')] },
    { id: 'goblin', name: 'Goblin Crank-Op', act: 1, tier: 'normal', hp: [26, 33], art: 'goblin', size: 1, color: '#8fae3a',
      desc: 'Operates the machines. Badly. With a wrench.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('jab', 'Jab', 5, 1, 'Jabs for 5'), blk('guard', 'Guard', 6, 'Hides behind a crate (Block 6)'),
        mv('windup', 'Wind Up', 'charge', 'Winding up a big swing (14 next turn)', { v: 14 })] },
    { id: 'mushroom', name: 'Spore Cap', act: 1, tier: 'normal', hp: [26, 31], art: 'mushroom', size: 0.95, color: '#ff5a4a',
      desc: 'Grew on a spilled soda. Now it has opinions.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [debuff('puff', 'Puff', 'poison', 2, 'Puffs spores (2 Poison)'), atk('bonk', 'Bonk', 6, 1, 'Bonks for 6'),
        mheal('sprout', 'Sprout', 5, 'Regrows 5 HP')] },
    { id: 'crab', name: 'Claw Crab', act: 1, tier: 'normal', hp: [26, 30], art: 'crab', size: 1, color: '#ff8a5a',
      desc: 'Thinks your claw is a rival. Wants a rematch.', ai: 'cycle', pattern: [0, 1, 2, 1],
      status: { thorns: 2 },
      moves: [blk('shell', 'Shell Up', 8, 'Shells up (Block 8)'), atk('pinch', 'Pinch', 4, 2, 'Pinches 4 x2'),
        buff('harden', 'Harden', 'armor', 1, 'Hardens its shell (+1 Armor)')] },
    // act 1 elites
    { id: 'mimic', name: 'Prize Mimic', act: 1, tier: 'elite', hp: [60, 66], art: 'mimic', size: 1.15, color: '#ffc94d',
      desc: 'Looks like a prize. Is a mouth. Eats your best stuff first.', ai: 'cycle', pattern: [4, 1, 0, 2, 3, 1],
      taunt: 'Ooh, a customer. You look delicious.',
      moves: [mv('lure', 'Lure', 'junk', 'Spits 2 Rocks into your bin', { item: 'rock', n: 2 }),
        atk('chomp', 'Chomp', 11, 1, 'Chomps for 11'), mv('rattle', 'Rattle', 'shake', 'Rattles the cabinet. Your bin rattles.'),
        mv('gulp', 'Deep Breath', 'charge', 'Opening wide (20 next turn)', { v: 20 }),
        gulp('swallow', 'Swallow Prize', 1, 'shiny', 'Swallows your rarest item whole')],
      enrage: { name: 'FEEDING FRENZY', text: 'The lid will not close any more', str: 2, pattern: [4, 1, 4, 1, 3] } },
    { id: 'broodmother', name: 'Brood Mother', act: 1, tier: 'elite', hp: [55, 62], art: 'spider', size: 1.2, color: '#6b2a5a',
      desc: 'Every egg sac is a tiny, furious prize. She lays them in your bin.', ai: 'cycle', pattern: [3, 0, 1, 2, 0],
      taunt: 'My babies are hungry. You will do nicely.',
      moves: [atk('bite', 'Bite', 9, 1, 'Bites for 9'),
        debuff('venom', 'Venom', 'poison', 4, 'Venom (4 Poison)'), debuff('web', 'Web', 'weak', 2, 'Webs your arms (Weak 2)'),
        mv('lay', 'Lay Eggs', 'eggs', 'Lays 2 eggs in your bin. Grab them before they hatch', { n: 2, hatch: 'spiderling', turns: 3 })],
      enrage: { name: 'BROOD RAGE', text: 'Every egg at once', str: 1, pattern: [3, 0, 3, 1] } },
    { id: 'spiderling', name: 'Spiderling', act: 1, tier: 'normal', minion: true, hp: [7, 9], art: 'spider', size: 0.55, color: '#8a4a7a',
      desc: 'Small. Numerous. Bitey.', ai: 'cycle',
      moves: [atk('nip', 'Nip', 3, 1, 'Nips for 3'), debuff('drip', 'Drip', 'poison', 1, 'Drips venom (1 Poison)')] },
    // act 1 boss
    { id: 'hoard', name: 'The Hoard', act: 1, tier: 'boss', hp: [100, 100], art: 'hoard', size: 1, color: '#ffc94d',
      desc: 'Every prize nobody ever won, piled up and angry about it.', ai: 'cycle',
      taunt: 'Finders keepers. Losers? Also keepers.',
      // Boss signature (DESIGN.md "Bosses"): a coin avalanche into the bin;
      // at phase two the whole pile leans toward the Hoard for good.
      sig: { id: 'spill', name: 'Coin Avalanche', sign: 'AVALANCHE', shout: 'MY COINS!', text: 'spills a coin avalanche into your bin',
        first: 1, every: 3, n: 5, lean: true },
      pattern: [8, 0, 2, 4, 1, 3, 8, 5, 7, 6],
      enrage: { name: 'THE PILE SHIFTS', text: 'Everything it ever swallowed wants out', str: 2, pattern: [8, 0, 6, 8, 5, 1] },
      moves: [atk('avalanche', 'Prize Avalanche', 4, 3, 'Prize avalanche: 4 x3'),
        mv('topple', 'Topple', 'shake', 'Topples onto the cabinet. Your bin rattles.'),
        mv('cough', 'Cough Up', 'junk', 'Coughs 2 Rocks into your bin', { item: 'rock', n: 2 }),
        mv('rat', 'Call Rat', 'summon', 'Whistles for a Coin Rat'),
        blk('glitter', 'Glitter Wall', 12, 'Hides behind prizes (Block 12)'),
        mv('loom', 'Loom', 'charge', 'Looming over you (22 next turn)', { v: 22 }),
        atk('swat', 'Swat', 8, 1, 'Swats for 8'),
        buff('greed', 'Greed', 'str', 2, 'Grows greedier (+2 Strength)'),
        gulp('hoardit', 'Hoard It', 2, 'shiny', 'Adds 2 of your best items to the pile')] },

    // ================= ACT 2: The Clockwork Foundry (grease, steal, tilt) =====
    { id: 'imp', name: 'Grease Imp', act: 2, tier: 'normal', hp: [42, 51], art: 'imp', size: 0.9, color: '#ff5a4a',
      desc: 'Lubricates machinery. And floors. And you.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [mv('grease', 'Grease', 'grease', 'Greases your bin (slippery for 1 turn)', { v: 1 }),
        atk('poke', 'Poke', 9, 1, 'Pokes for 9'), debuff('hex', 'Hex', 'burn', 2, 'Hexes you (2 Burn)')] },
    { id: 'clockwork', name: 'Wind-Up Soldier', act: 2, tier: 'normal', hp: [53, 62], art: 'clockwork', size: 1, color: '#c8a040',
      desc: 'Marches forward. Only forward. Turning is a premium feature.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [atk('march', 'March', 12, 1, 'Marches into you for 12'), buff('wind', 'Wind Up', 'str', 2, 'Winds its key (+2 Strength)'),
        atk('volley', 'Volley', 5, 3, 'Volley: 5 x3'), blk('rust', 'Rest', 8, 'Stops to rest (Block 8)')] },
    { id: 'drone', name: 'Claw Drone', act: 2, tier: 'normal', hp: [35, 44], art: 'drone', size: 0.9, color: '#2ee6d6',
      desc: 'A tiny flying claw. Kill it before it leaves with your stuff.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [mv('snatch', 'Snatch', 'steal', 'Snatches an item from your bin'), atk('buzz', 'Buzz', 9, 1, 'Buzzes you for 9'),
        mv('getaway', 'Getaway', 'escape', 'Flies off with the loot')] },
    { id: 'tinker', name: 'Tinker Gnome', act: 2, tier: 'normal', hp: [44, 53], art: 'tinker', size: 0.9, color: '#ff9a2e',
      desc: 'Fixes things so they break in more interesting ways.', ai: 'cycle', pattern: [0, 1, 5, 2, 4, 3, 1],
      moves: [mv('jack', 'Jack Up', 'tilt', 'Jacks up one side of the cabinet (tilt)'), atk('wrench', 'Wrench', 12, 1, 'Wrenches you for 12'),
        mv('drone', 'Build Drone', 'summon', 'Builds a Claw Drone'), mheal('patch', 'Patch Up', 8, 'Patches itself (heal 8)'),
        debuff('solder', 'Hot Solder', 'burn', 3, 'Flicks hot solder at you (3 Burn)'),
        mv('monkey', 'Monkey Wrench', 'jam', 'Jams a wrench in your claw rail (one grab fewer next turn)', { v: 1 })] },
    // Act 2 metal-eaters and rust.
    { id: 'scrapgoat', name: 'Scrap Goat', act: 2, tier: 'normal', hp: [46, 54], art: 'goat', size: 1, color: '#b08a5a',
      desc: 'Eats tin cans, bolts, swords, shields. Mostly swords and shields.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [gulp('munch', 'Munch', 1, 'metal', 'Munches a metal item out of your bin'), atk('headbutt', 'Headbutt', 11, 1, 'Headbutts for 11'),
        mv('buck', 'Buck', 'shake', 'Bucks the cabinet. Your bin rattles.'), atk('horns', 'Horns', 6, 2, 'Horns: 6 x2')] },
    { id: 'rustmite', name: 'Rust Mite', act: 2, tier: 'normal', hp: [40, 48], art: 'spider', size: 0.85, color: '#c86a2e', color2: '#7a3a1a',
      desc: 'Chews on the good metal until it is the bad metal.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [mv('corrode', 'Corrode', 'corrode', 'Rusts 2 metal items (half as good this fight)', { n: 2 }),
        atk('nip', 'Nip', 8, 1, 'Nips for 8'), debuff('flake', 'Rust Flake', 'vuln', 1, 'Flakes rust in your eyes (Vulnerable)')] },
    { id: 'golem', name: 'Brass Golem', act: 2, tier: 'normal', hp: [68, 75], art: 'golem', size: 1.1, color: '#c8a040',
      desc: 'Built to guard a prize. Forgot which one.', ai: 'cycle', pattern: [0, 1, 3, 2],
      status: { armor: 1, thorns: 2 },
      moves: [blk('brace', 'Brace', 12, 'Braces (Block 12)'), mv('windup', 'Wind Up', 'charge', 'Winding up (27 next turn)', { v: 27 }),
        atk('punch', 'Punch', 14, 1, 'Punches for 14'), mv('stomp', 'Stomp', 'shake', 'Stomps. Your bin rattles.')] },
    { id: 'tinknight', name: 'Tin Knight', act: 2, tier: 'normal', hp: [55, 64], art: 'knight', size: 1, color: '#aab3bd',
      desc: 'A suit of armor from the prize shelf. Nobody is inside. Probably.', ai: 'cycle', pattern: [0, 1, 2, 1],
      status: { thorns: 3 },
      moves: [blk('guard', 'Guard', 10, 'Raises its shield (Block 10)'), atk('lunge', 'Lunge', 15, 1, 'Lunges for 15'),
        debuff('taunt', 'Taunt', 'vuln', 1, 'Taunts you (Vulnerable)')] },
    { id: 'oilslick', name: 'Oil Slick', act: 2, tier: 'normal', hp: [51, 59], art: 'slime', size: 1, color: '#3a3230',
      desc: 'A slime that went into the machine oil and never came back out.', ai: 'random',
      moves: [mv('slick', 'Slick', 'grease', 'Oils your bin (slippery for 1 turn)', { v: 1 }),
        atk('slap', 'Slap', 14, 1, 'Slaps for 14'), debuff('ooze', 'Ooze', 'weak', 2, 'Oozes on your gloves (Weak 2)'),
        debuff('fumes', 'Fumes', 'poison', 4, 'Breathes oil fumes (4 Poison)')] },
    // act 2 elites
    { id: 'ironjaw', name: 'Ironjaw', act: 2, tier: 'elite', hp: [136, 148], art: 'ironjaw', size: 1.2, color: '#7d8590',
      desc: 'A bear trap that learned to walk. And swallow. Metal goes down easiest.', ai: 'cycle', pattern: [0, 1, 2, 3, 0],
      taunt: 'CLANK. CLANK. CHOMP.',
      status: { thorns: 4 },
      enrage: { name: 'LOCKJAW', text: 'The springs wind all the way tight', str: 3, pattern: [1, 0, 1, 3, 0] },
      moves: [atk('bite', 'Bite', 22, 1, 'Bites for 22'), gulp('swallow', 'Swallow', 1, 'metal', 'Swallows a metal item from your bin'),
        buff('clench', 'Clench', 'armor', 1, 'Clenches (+1 Armor)'), mv('gape', 'Gape', 'charge', 'Opens wide (46 next turn)', { v: 46 })] },
    { id: 'lodestone', name: 'The Lodestone', act: 2, tier: 'elite', hp: [125, 135], art: 'magnet', size: 1.2, color: '#ff2e4a',
      desc: 'A living magnet. Your metal things are very interested in it.', ai: 'cycle', pattern: [0, 1, 2, 4, 3, 4],
      taunt: 'Your sword already agrees with me.',
      enrage: { name: 'FULL POLARITY', text: 'Every bolt in the room points at you' },
      moves: [buff('polarize', 'Polarize', 'shield_up', 2, 'Polarizes (Block persists 2 turns)'),
        blk('plate', 'Plate', 15, 'Pulls scrap into armor (Block 15)'),
        mv('pull', 'Pull', 'steal', 'Yanks an item out of your bin'),
        mv('drag', 'Drag', 'tilt', 'Drags the whole cabinet sideways (tilt)'),
        atk('zap', 'Zap', 14, 2, 'Zaps 14 x2')] },
    // act 2 boss
    { id: 'smelter', name: 'The Smelter', act: 2, tier: 'boss', hp: [165, 165], art: 'furnace', size: 1, color: '#ff8a2e',
      desc: 'The foundry furnace. It melts down failed adventurers into prize tokens.', ai: 'cycle',
      taunt: 'Step closer. I run a little hot.',
      // Boss signature: the cabinet heats up, metal glows red hot (each one
      // delivered burns the hand for `burn`, Block soaks it), slag drips in.
      sig: { id: 'heat', name: 'Furnace Blast', sign: 'HOT METAL', shout: 'FEEL THE HEAT', text: 'heats the cabinet: your metal items turn red hot',
        first: 1, every: 3, n: 4, drip: 1, burn: 2 },
      pattern: [0, 8, 1, 2, 3, 6, 4, 8, 5, 7, 1],
      enrage: { name: 'MELTDOWN', text: 'The grate glows white', str: 2, pattern: [8, 1, 4, 8, 7, 1] },
      moves: [buff('stoke', 'Stoke', 'str', 2, 'Stokes its fire (+2 Strength)'), atk('spew', 'Spew', 6, 3, 'Spews embers: 6 x3'),
        mv('oil', 'Oil Pour', 'grease', 'Pours oil in your bin (slippery 2 turns)', { v: 2 }),
        mv('smelt', 'Smelt', 'junk', 'Smelts 3 Slag into your bin', { item: 'slag', n: 3 }),
        debuff('heat', 'Heat Wave', 'burn', 4, 'Heat wave (4 Burn)'),
        mv('tip', 'Belch', 'tilt', 'Belches. The cabinet lurches (tilt)'),
        blk('vent', 'Vent', 20, 'Closes its grate (Block 20)'),
        mv('roar', 'Roar', 'charge', 'Heating up (28 next turn)', { v: 28 }),
        bombMv('slagbomb', 'Slag Bomb', 16, 2, 'Drops a molten bomb in your bin (grab it to throw it back)')] },

    // ================= ACT 3: The Frozen Penthouse (fog, freezeItem) ==========
    { id: 'wraith', name: 'Glass Wraith', act: 3, tier: 'normal', hp: [73, 83], art: 'wraith', size: 1, color: '#bfefff',
      desc: 'Haunts display cases. Breathes on the glass so you cannot see.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      status: { thorns: 3 },
      moves: [mv('haunt', 'Haunt', 'fog', 'Breathes on the glass (fog 1 turn)', { v: 1 }), atk('claw', 'Claw', 17, 1, 'Claws for 17'),
        debuff('wail', 'Wail', 'weak', 2, 'Wails (Weak 2)'), buff('fade', 'Fade', 'dodge', 1, 'Fades out (Dodge 1)')] },
    { id: 'wisp', name: 'Cold Wisp', act: 3, tier: 'normal', hp: [55, 65], art: 'wisp', size: 0.8, color: '#9fd8ff',
      desc: 'A floating chill with a grudge.', ai: 'weighted',
      moves: [w(atk('flicker', 'Flicker', 5, 3, 'Flickers: 5 x3'), 3), w(debuff('frost', 'Frost', 'chill', 2, 'Frosts you (2 Chill)'), 2),
        w(buff('blink', 'Blink', 'dodge', 1, 'Blinks (Dodge 1)'), 1)] },
    { id: 'frostmage', name: 'Frost Mage', act: 3, tier: 'normal', hp: [81, 94], art: 'frostmage', size: 1, color: '#7fb2ff',
      desc: 'Keeps the prizes fresh. Keeps you fresh too.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'), atk('bolt', 'Ice Bolt', 18, 1, 'Ice bolt for 18'),
        debuff('chill', 'Chill', 'chill', 2, 'Chills you (2 Chill)'), blk('barrier', 'Barrier', 12, 'Ice barrier (Block 12)')] },
    { id: 'icemimic', name: 'Ice Mimic', act: 3, tier: 'normal', hp: [109, 122], art: 'icemimic', size: 1.05, color: '#cfefff',
      desc: 'A mimic that moved somewhere colder. Hungrier for it.', ai: 'cycle', pattern: [4, 0, 1, 2, 4, 3],
      moves: [blk('lurk', 'Lurk', 14, 'Pretends to be a prize (Block 14)'), mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'),
        atk('bite', 'Bite', 16, 1, 'Bites for 16'), mv('gape', 'Gape', 'charge', 'Opening wide (39 next turn)', { v: 39 }),
        gulp('snap', 'Snap Up', 1, 'shiny', 'Snaps up your rarest item')] },
    // Act 3 scavenger: a thief with wings and a bomb habit.
    { id: 'magpie', name: 'Crystal Magpie', act: 3, tier: 'normal', hp: [70, 82], art: 'magpie', size: 0.95, color: '#2b3a5a', color2: '#e8f4ff',
      desc: 'Collects shiny things. Your shiny things. Pays you back in explosives.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [gulp('pilfer', 'Pilfer', 2, 'shiny', 'Pilfers your 2 shiniest items'), atk('peck', 'Peck', 9, 2, 'Pecks 9 x2'),
        bombMv('snowbomb', 'Snow Bomb', 20, 2, 'Drops a frozen bomb in your bin (grab it to throw it back)'),
        buff('preen', 'Preen', 'dodge', 1, 'Preens (Dodge 1)')] },
    { id: 'cultist', name: 'Claw Cultist', act: 3, tier: 'normal', hp: [83, 96], art: 'cultist', size: 1, color: '#ff2e88',
      desc: 'Worships the Prize Master. Has a punch card.', ai: 'cycle', pattern: [0, 1, 4, 2, 1, 3],
      moves: [buff('chant', 'Chant', 'str', 3, 'Chants (+3 Strength)'), atk('slash', 'Slash', 16, 1, 'Slashes for 16'),
        debuff('curse', 'Curse', 'vuln', 2, 'Curses you (Vulnerable 2)'), mheal('pray', 'Pray', 10, 'Prays (heal 10)'),
        debuff('blight', 'Blight', 'poison', 5, 'Blights you (5 Poison)')] },
    { id: 'yeti', name: 'Snow Yeti', act: 3, tier: 'normal', hp: [114, 130], art: 'yeti', size: 1.15, color: '#f2fbff',
      desc: 'Fell asleep in the freezer aisle. You woke it.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [atk('maul', 'Maul', 22, 1, 'Mauls for 22'), mv('pound', 'Pound', 'shake', 'Pounds the cabinet. Your bin rattles.'),
        mv('hurl', 'Hurl', 'junk', 'Hurls 2 Ice Blocks into your bin', { item: 'iceblock', n: 2 }),
        debuff('roar', 'Roar', 'weak', 2, 'Roars (Weak 2)')] },
    { id: 'rimecap', name: 'Rime Cap', act: 3, tier: 'normal', hp: [75, 88], art: 'mushroom', size: 1, color: '#9fd8ff',
      desc: 'A frozen mushroom. Its spores are tiny snowflakes. Poisonous ones.', ai: 'cycle', pattern: [0, 1, 2, 3, 2],
      moves: [mv('spores', 'Spore Cloud', 'fog', 'Spore cloud on the glass (fog 1 turn)', { v: 1 }),
        debuff('rot', 'Frost Rot', 'poison', 5, 'Frost rot (5 Poison)'), atk('bonk', 'Bonk', 16, 1, 'Bonks for 16'),
        buff('regrow', 'Regrow', 'regen', 4, 'Regrows (Regen 4)')] },
    // act 3 elites
    { id: 'frostknight', name: 'The Frozen Knight', act: 3, tier: 'elite', hp: [190, 203], art: 'knight', size: 1.25, color: '#7fb2ff',
      desc: 'A Crawler who got too close to the ice box. Still guarding it.', ai: 'cycle', pattern: [0, 1, 3, 2, 4, 5, 3],
      taunt: 'None shall pass. None have. None will.',
      enrage: { name: 'OATH BROKEN', text: 'The ice cracks. Something warm and furious is inside' },
      moves: [buff('bulwark', 'Bulwark', 'shield_up', 3, 'Frozen bulwark (Block persists 3 turns)'),
        blk('wall', 'Ice Wall', 20, 'Ice wall (Block 20)'), mv('encase', 'Encase', 'freezeItem', 'Freezes an item in your bin solid'),
        atk('cleave', 'Cleave', 30, 1, 'Cleaves for 30'), mv('raise', 'Raise Blade', 'charge', 'Raising its blade (60 next turn)', { v: 60 }),
        buff('temper', 'Temper', 'armor', 2, 'Tempers its armor (+2 Armor)')] },
    { id: 'highcultist', name: 'High Cultist', act: 3, tier: 'elite', hp: [174, 190], art: 'cultist', size: 1.2, color: '#b02e88',
      desc: 'Has the gold punch card. Twelve more stamps until a free soul.', ai: 'cycle', pattern: [0, 1, 2, 3, 5, 2, 4],
      taunt: 'Twelve more stamps. You are number eleven.',
      enrage: { name: 'LAST STAMP', text: 'The punch card is full' },
      moves: [buff('ritual', 'Ritual', 'enrage', 1, 'Begins a ritual (Enrage 1)'), mv('wisp', 'Summon Wisp', 'summon', 'Summons a Cold Wisp'),
        atk('lash', 'Lash', 14, 2, 'Lashes 14 x2'), mv('veil', 'Veil', 'fog', 'Veils the glass (fog 2 turns)', { v: 2 }),
        { id: 'mend', name: 'Dark Mend', k: 'heal', v: 15, to: 'all', txt: 'Heals everyone on its side for 15' },
        debuff('hex', 'Hex', 'vuln', 2, 'Hexes you (Vulnerable 2)')] },
    // act 3 boss (phase one); the Prize Master steps out when it breaks
    { id: 'glacius', name: 'Glacius, the Ice Box', act: 3, tier: 'boss', hp: [110, 110], art: 'frostmage', size: 1, color: '#2ee6d6',
      desc: 'The penthouse freezer, awake. Behind it, a door marked STAFF ONLY.', ai: 'cycle',
      taunt: 'Stay a while. Stay forever.',
      // Boss signature: ices over the prize chute lip, then the claw rail,
      // turn about, for one turn (a heavy prize delivered shatters it early).
      sig: { id: 'ice', name: 'Deep Freeze', sign: 'FROZEN', shout: 'FREEZE!', text: 'freezes part of the machine',
        parts: ['lid', 'rail'], texts: { lid: 'freezes the prize chute shut', rail: 'freezes the claw rail' }, first: 1, every: 3 },
      enrage: { name: 'DEFROST CYCLE', text: 'The compressor screams' },
      pattern: [0, 1, 2, 4, 3, 5, 6, 7, 1],
      moves: [mv('blizzard', 'Blizzard', 'fog', 'Blizzard on the glass (fog 2 turns)', { v: 2 }),
        atk('hail', 'Hail', 7, 4, 'Hail: 7 x4'), mv('encase', 'Deep Freeze', 'freezeItem', 'Freezes an item in your bin solid'),
        debuff('frost', 'Frostbite', 'chill', 3, 'Frostbite (3 Chill)'), blk('icewall', 'Ice Wall', 25, 'Ice wall (Block 25)'),
        mv('wisp', 'Call Wisp', 'summon', 'Calls a Cold Wisp'),
        mv('gather', 'Gather Cold', 'charge', 'Gathering cold (38 next turn)', { v: 38 }),
        mv('quake', 'Quake', 'shake', 'Shakes the whole floor. Your bin rattles.')],
      onDeath: { k: 'summon', id: 'prizemaster' } },
    // final boss: every trick in the machine, in three acts of its own
    { id: 'prizemaster', name: 'The Prize Master', act: 3, tier: 'boss', hp: [190, 190], art: 'prizemaster', size: 1, color: '#ff2e88',
      desc: 'Runs the Clawspire. Turns adventurers into prizes. Very good at claw machines.', ai: 'cycle',
      taunt: 'Step right up! Everybody wins! (Not you.)',
      // Boss signature: rigs the machine once per phase (and again at the
      // final phase, a quarter hp, when the cabinet lights go red): the bin
      // is shuffled and the next drop's claw wanders off toward junk.
      sig: { id: 'rig', name: 'Rigged!', sign: 'RIGGED', shout: 'HOUSE RULES', text: 'rigs the machine: it takes your claw for a drop',
        first: 1, every: 0, rephase: true, final: true, finalText: 'The lights go red. No more games.' },
      // The Show: 0 1 2 3 13 5 | Rigged: 7 8 9 6 10 4 11 5 | Endgame: 12 1 3 2 6 5
      pattern: [0, 1, 2, 3, 13, 5, 7, 8, 9, 6, 14, 10, 4, 11, 5, 12, 1, 3, 2, 14, 6, 5],
      enrage: { name: 'OUT OF ORDER', text: 'The Prize Master stops pretending to play fair', str: 2 },
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
        blk('glass', 'Glass Case', 20, 'Steps into a glass case (Block 20)'),
        mv('outoforder', 'Out of Order', 'jam', 'Hangs an OUT OF ORDER sign on your rail (one grab fewer)', { v: 1 })] },
  ];
  const ENEMIES = {};
  for (const e of ENEMY_LIST) ENEMIES[e.id] = Object.assign({ size: 1 }, e);

  // ---------------------------------------------------------------- affixes
  // Elite affixes (Monster Train / Slay the Spire style): rolled per enemy by
  // COMBAT.newFight through affixRoll, shown as badges with an aura. COMBAT
  // implements each id; `hp` is the max hp bonus it brings.
  const AFFIXES = {};
  [
    ['armored', 'Armored', '🔩', '#aab3bd', 'Starts with Armor: every hit on it is reduced.'],
    ['hasty', 'Hasty', '⚡', '#ffe066', 'Every third turn it acts twice (a second attack hits for half).'],
    ['vampiric', 'Vampiric', '🦇', '#d81f3a', 'Heals half the damage it deals you.'],
    ['spiky', 'Spiky', '🌵', '#8fae3a', 'Starts with Thorns: hitting it hurts.'],
    ['explosive', 'Explosive', '💥', '#ff8a2e', 'Blows up when it dies. The blast never finishes you off.'],
    ['regen', 'Regenerating', '💚', '#6bd35e', 'Heals a little at the start of every turn.'],
    ['greedy', 'Greedy', '👄', '#ffc94d', 'Gulps one of your items every third turn, on top of its move.'],
  ].forEach(([id, name, icon, color, text]) => { AFFIXES[id] = { id, name, icon, color, text, hp: 0.05 }; });
  const AFFIX_IDS = Object.keys(AFFIXES);
  // Odds per act (index 1..3). normal: chance of one affix; elite: affixes
  // for sure, then a chance of one more; boss: chance of one. Every hidden
  // escalation step (DIFFICULTY.ramp) adds `step` to each chance.
  const AFFIX_ODDS = {
    normal: [0, 0, 0.1, 0.2], elite: [0, 1, 1, 1], eliteMore: [0, 0, 0.25, 0.5], boss: [0, 0, 0.2, 0.4], step: 0.04,
  };
  // The affix ids an enemy spawns with: pure (rng, def, act, fights).
  // Minions never get one; gulpers are never Greedy (they already are).
  function affixRoll(rng, def, act, fights) {
    if (!def || def.minion || def.noAffix === true) return [];
    act = Math.max(1, Math.min(3, act | 0 || 1));
    const ramp = DIFFICULTY.ramp || {};
    const step = ramp.every > 0 ? Math.min(Math.floor((fights || 0) / ramp.every), ramp.max || 0) : 0;
    const bonus = step * AFFIX_ODDS.step;
    const tier = def.tier || 'normal';
    let n = 0;
    if (tier === 'elite') n = AFFIX_ODDS.elite[act] + (rng() < AFFIX_ODDS.eliteMore[act] + bonus ? 1 : 0);
    else if (tier === 'boss') n = rng() < AFFIX_ODDS.boss[act] + bonus ? 1 : 0;
    else n = rng() < AFFIX_ODDS.normal[act] + bonus ? 1 : 0;
    const eats = (def.moves || []).some(m => m && m.k === 'gulp');
    const pool = AFFIX_IDS.filter(id => !(id === 'greedy' && eats) && !(Array.isArray(def.noAffix) && def.noAffix.indexOf(id) >= 0));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }

  // ------------------------------------------------------------ encounters
  // Normal lists run easy -> hard: MAP biases later columns toward the back.
  const ENCOUNTERS = {
    1: {
      normal: [['rat', 'rat'], ['bat', 'bat'], ['gremlin'], ['slime'], ['spider', 'rat'], ['goblin'],
        ['mushroom', 'bat'], ['crab'], ['gremlin', 'rat'], ['trashpanda', 'rat'], ['gloop'], ['trashpanda', 'bat']],
      elite: [['mimic'], ['broodmother']],
      boss: [['hoard']],
    },
    2: {
      normal: [['drone', 'imp'], ['imp', 'imp'], ['clockwork'], ['tinker'], ['oilslick', 'drone'], ['tinknight'],
        ['golem'], ['clockwork', 'drone'], ['scrapgoat'], ['rustmite', 'imp'], ['scrapgoat', 'rustmite']],
      elite: [['ironjaw'], ['lodestone']],
      boss: [['smelter']],
    },
    3: {
      normal: [['wisp', 'wisp'], ['wraith'], ['frostmage'], ['rimecap', 'wisp'], ['cultist'], ['icemimic'],
        ['wraith', 'wisp'], ['yeti'], ['magpie', 'wisp'], ['magpie']],
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
  const emitE = (F, ev) => { const c = CB(); if (c && c.emit) c.emit(F, ev); };
  // A relic's own proc event (a floating label on the player). COMBAT emits
  // one automatically in front of any hook call that did something visible,
  // labelled with relic.proc; hooks with a dynamic label call this instead.
  const proc = (F, id, text) => {
    const r = RELICS[id];
    if (!r || !CB()) return;
    const k = (r.kw || [])[0];
    emitE(F, { t: 'proc', src: 'relic', id, name: r.name, icon: r.icon, color: k ? ARCHETYPES[k].color : '#ffc94d',
      text: text || r.proc || r.name.toUpperCase(), who: 'player', idx: -1 });
  };
  // A random living enemy, drawn from the fight's own rng (deterministic).
  const randomFoe = (F) => {
    const al = aliveOf(F);
    if (!al.length) return null;
    return typeof F.rng === 'function' ? al[Math.floor(F.rng() * al.length)] : al[0];
  };
  const gainGold = (F, v) => { const c = CB(); if (c && c.gainGold) c.gainGold(F, v); };
  // The item defs the current grab has delivered so far (COMBAT's buffer).
  const grabDefs = (F) => (F.grab && Array.isArray(F.grab.defs) ? F.grab.defs : []);
  const isJunkPlay = (inst, def) => !!((inst && inst.junk) || tagged(def, 'junk'));

  const RELIC_LIST = [
    // starters (not in random pools)
    { id: 'squire_gauntlet', name: "Squire's Gauntlet", icon: '🧤', rarity: 'event', kw: ['fortress'], proc: 'GAUNTLET', starter: true,
      text: 'Your claw grips a little harder. Start each fight with 5 Block.',
      mods: { grip: 0.15 }, hooks: { onFightStart(F) { gainBlock(F, 5); } } },
    { id: 'bubbling_satchel', name: 'Bubbling Satchel', icon: '🧪', rarity: 'event', kw: ['poison'], proc: 'SATCHEL', starter: true,
      text: 'Start each fight with 2 Poison on every enemy. Something in here is alive.',
      hooks: { onFightStart(F) { allStatus(F, 'poison', 2); } } },
    { id: 'pickpocket_glove', name: 'Pickpocket Glove', icon: '✋', rarity: 'event', kw: [], proc: 'SLIPPERY', starter: true,
      text: 'Whenever an enemy dies, gain 1 Dodge. Grab first, dodge later.',
      hooks: { onKill(F) { selfStatus(F, 'dodge', 1); } } },

    // common
    { id: 'grip_tape', name: 'Grip Tape', icon: '🩹', rarity: 'c', kw: [], text: 'Your claw grips 25% harder. Sticky, in a good way.',
      mods: { grip: 0.25 } },
    { id: 'oiled_rails', name: 'Oiled Rails', icon: '🛢', rarity: 'c', kw: [], text: 'Your claw moves 30% faster. Wheee.',
      mods: { speed: 0.3 } },
    { id: 'golden_ticket', name: 'Golden Ticket', icon: '🎟', rarity: 'c', kw: ['greed'], text: 'On pickup, gain 90 gold. Redeemable nowhere else.',
      mods: { gold: 90 } },
    { id: 'inkwell', name: 'Bottomless Bulb Crate', icon: '💡', rarity: 'c', kw: [], text: 'On pickup, gain 3 Bulbs. It has a bottom. It lied.',
      mods: { ink: 3 } },
    { id: 'heart_locket', name: 'Heart Locket', icon: '💗', rarity: 'c', kw: ['feast'], text: 'Gain 8 Max HP. There is a tiny picture of you inside.',
      mods: { maxhp: 8 } },
    { id: 'kettle_helm', name: 'Kettle Helm', icon: '🫖', rarity: 'c', kw: ['fortress'], text: 'Start each fight with 6 Block. Also makes tea.',
      mods: { startBlock: 6 } },
    { id: 'consolation_prize', name: 'Consolation Prize', icon: '🧸', rarity: 'c', kw: ['fortress'], proc: 'THERE THERE',
      text: 'Whenever a grab delivers nothing, gain 4 Block.',
      hooks: { onGrab(F, n) { if (!n) gainBlock(F, 4); } } },
    { id: 'sore_loser', name: 'Sore Loser', icon: '😤', rarity: 'c', kw: [], proc: 'HMPH',
      text: 'Whenever a grab delivers nothing, deal 4 damage to the targeted enemy.',
      hooks: { onGrab(F, n) { if (!n) zap(F, focus(F), 4); } } },
    { id: 'blood_bag', name: 'Blood Bag', icon: '🩸', rarity: 'c', kw: ['feast'], proc: 'TOP UP', text: 'Whenever an enemy dies, heal 3 HP.',
      hooks: { onKill(F) { healP(F, 3); } } },
    { id: 'hot_coffee', name: 'Hot Coffee', icon: '☕', rarity: 'c', kw: ['jackpot'], proc: 'CAFFEINE', text: 'Gain 1 extra grab on the first turn of each fight.',
      hooks: { onFightStart(F) { moreGrabs(F, 1); } } },

    // uncommon
    { id: 'wide_palm', name: 'Wide Palm', icon: '🖐', rarity: 'u', kw: [], text: 'Your claw opens 20% wider.',
      mods: { width: 0.2 } },
    { id: 'rubber_thimbles', name: 'Rubber Thimbles', icon: '👆', rarity: 'u', kw: [], text: 'Rubber tips on your prongs. Nothing slips as easily.',
      mods: { rubber: 1 } },
    { id: 'protein_bar', name: 'Protein Bar', icon: '💪', rarity: 'u', kw: ['brawler'], text: 'Start each fight with 1 Strength. Chewy.',
      mods: { startStr: 1 } },
    { id: 'jackpot_bell', name: 'Jackpot Bell', icon: '🔔', rarity: 'u', kw: ['jackpot'], proc: 'DING',
      text: 'Whenever one grab delivers 2 or more items, deal 5 damage to ALL enemies. DING.',
      hooks: { onGrab(F, n) { if (n >= 2) zapAll(F, 5); } } },
    { id: 'thorn_mail', name: 'Thorn Mail', icon: '🌵', rarity: 'u', kw: ['fortress'], proc: 'THORNS', text: 'Start each fight with 3 Thorns. Hugs discouraged.',
      hooks: { onFightStart(F) { selfStatus(F, 'thorns', 3); } } },
    { id: 'venom_gland', name: 'Venom Gland', icon: '🐍', rarity: 'u', kw: ['poison'], proc: 'VENOM',
      text: 'Whenever you play a weapon, apply 1 Poison to the targeted enemy.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'weapon')) foeStatus(F, focus(F), 'poison', 1); } } },
    { id: 'flint_striker', name: 'Flint Striker', icon: '🔥', rarity: 'u', kw: ['burn'], proc: 'SPARK',
      text: 'The first item you play each turn applies 2 Burn to the targeted enemy.',
      hooks: {
        onPlay(F) {
          const m = mem(F);
          if (m.flint === F.turn) return;
          m.flint = F.turn;
          foeStatus(F, focus(F), 'burn', 2);
        },
      } },
    { id: 'snow_globe', name: 'Snow Globe', icon: '❄', rarity: 'u', kw: ['frost'], proc: 'SNOW', text: 'Start each fight with 2 Chill on every enemy.',
      hooks: { onFightStart(F) { allStatus(F, 'chill', 2); } } },
    { id: 'trophy_rack', name: 'Trophy Rack', icon: '🏆', rarity: 'u', kw: ['brawler'], proc: 'TROPHY', text: 'Whenever an enemy dies, gain 1 Strength.',
      hooks: { onKill(F) { selfStatus(F, 'str', 1); } } },
    { id: 'egg_timer', name: 'Egg Timer', icon: '⏲', rarity: 'u', kw: ['jackpot'], proc: 'DING', text: 'Every third turn, gain 1 extra grab. Ding.',
      hooks: { onTurnStart(F) { if (F.turn % 3 === 0) moreGrabs(F, 1); } } },
    { id: 'grudge_journal', name: 'Grudge Journal', icon: '📓', rarity: 'u', kw: ['fortress'], proc: 'NOTED',
      text: 'Whenever you lose HP, deal 3 damage to the targeted enemy. You wrote their name down.',
      hooks: { onHurt(F) { zap(F, focus(F), 3); } } },
    { id: 'recycling_bin', name: 'Recycling Bin', icon: '♻', rarity: 'u', kw: ['junk'], proc: 'RECYCLE',
      text: 'Whenever you grab out junk, gain 3 Block and deal 3 damage to the targeted enemy.',
      hooks: { onPlay(F, inst, def) { if ((inst && inst.junk) || tagged(def, 'junk')) { gainBlock(F, 3); zap(F, focus(F), 3); } } } },
    { id: 'potion_belt', name: 'Potion Belt', icon: '🧴', rarity: 'u', kw: ['feast', 'glass'], proc: 'GULP', text: 'Whenever you play a potion, heal 2 HP.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'potion')) healP(F, 2); } } },

    // rare
    { id: 'fridge_magnet', name: 'Fridge Magnet', icon: '🧲', rarity: 'r', kw: ['metal'],
      text: 'Your claw becomes a magnet. Metal items drift into it.',
      mods: { magnet: 1 } },
    { id: 'cracked_hourglass', name: 'Cracked Hourglass', icon: '⌛', rarity: 'r', kw: [], proc: 'TICK',
      text: 'At the end of your turn, apply 1 Vulnerable to the targeted enemy.',
      hooks: { onTurnEnd(F) { foeStatus(F, focus(F), 'vuln', 1); } } },
    { id: 'big_knuckles', name: 'Brass Knuckles', icon: '👊', rarity: 'r', kw: ['brawler', 'fortress'], proc: 'KNUCKLES',
      text: 'Whenever one hit deals 12 or more damage, gain 4 Block.',
      hooks: { onDmgDealt(F, e, amt) { if (amt >= 12) gainBlock(F, 4); } } },
    { id: 'four_leaf_clover', name: 'Four-Leaf Clover', icon: '🍀', rarity: 'r', kw: [], proc: 'LUCKY', text: 'Start each fight with 2 Dodge.',
      hooks: { onFightStart(F) { selfStatus(F, 'dodge', 2); } } },
    { id: 'vampire_dentures', name: 'Vampire Dentures', icon: '🦷', rarity: 'r', kw: ['feast'], proc: 'SLURP',
      text: 'Whenever one hit deals 10 or more damage, heal 2 HP. They click when you smile.',
      hooks: { onDmgDealt(F, e, amt) { if (amt >= 10) healP(F, 2); } } },
    { id: 'second_wind', name: 'Second Wind', icon: '🌬', rarity: 'r', kw: ['fortress'], proc: 'SECOND WIND',
      text: 'The first time each fight you drop below half HP, gain 12 Block.',
      hooks: {
        onHurt(F) {
          const m = mem(F), p = F.player;
          if (m.wind || !p || p.hp * 2 >= p.maxHp) return;
          m.wind = true;
          gainBlock(F, 12);
        },
      } },

    // ---- Build relics (DESIGN.md "Builds and synergies"). Commons nudge,
    // uncommons connect, rares bend a rule and define the build. ----
    // Poison
    { id: 'contagion', name: 'Contagion', icon: '🦠', rarity: 'u', kw: ['poison'],
      text: 'When a poisoned enemy dies, its Poison spreads to every other enemy.',
      hooks: {
        onKill(F, e) {
          const p = (e && e.status && e.status.poison) || 0;
          const rest = aliveOf(F).filter(x => x !== e);
          if (!p || !rest.length || !CB()) return;
          proc(F, 'contagion', 'SPREAD ' + p);
          rest.forEach(x => foeStatus(F, x, 'poison', p));
        },
      } },
    { id: 'festering_jar', name: 'Festering Jar', icon: '🫙', rarity: 'r', kw: ['poison'], proc: 'FESTER',
      text: 'Poison on enemies no longer wears off. It only gets worse in there.',
      rules: { poisonKeep: 1 } },
    // Pyro
    { id: 'bellows', name: 'Bellows', icon: '♨', rarity: 'u', kw: ['burn'], proc: 'STOKE',
      text: 'At the end of your turn, every burning enemy gains 1 Burn. Keeps the fire fed.',
      hooks: { onTurnEnd(F) { aliveOf(F).filter(e => (e.status && e.status.burn) > 0).forEach(e => foeStatus(F, e, 'burn', 1)); } } },
    { id: 'powder_keg', name: 'Powder Keg', icon: '💥', rarity: 'r', kw: ['burn'],
      text: 'When an enemy reaches 10 Burn, it explodes: ALL enemies take damage equal to its Burn, then its Burn halves.',
      hooks: {
        onStatus(F, u, s) {
          if (s !== 'burn' || !u || u === F.player || !u.alive || !CB()) return;
          const b = (u.status && u.status.burn) || 0;
          if (b < 10) return;
          proc(F, 'powder_keg', 'KABOOM ' + b);
          zapAll(F, b);
          foeStatus(F, u, 'burn', -Math.ceil(b / 2));
        },
      } },
    // Frost
    { id: 'cold_snap', name: 'Cold Snap', icon: '🥶', rarity: 'u', kw: ['frost'], proc: 'COLD SNAP',
      text: 'Whenever an enemy is Frozen, deal 6 damage to ALL enemies.',
      hooks: { onStatus(F, u, s) { if (s === 'freeze' && u && u !== F.player) zapAll(F, 6); } } },
    { id: 'permafrost_core', name: 'Permafrost Core', icon: '💠', rarity: 'r', kw: ['frost'], proc: 'SHATTER',
      text: 'Your hits on Frozen enemies deal 50% more damage. SHATTER!',
      rules: { shatter: 0.5 } },
    // Fortress
    { id: 'battering_ram', name: 'Battering Ram', icon: '🐏', rarity: 'u', kw: ['fortress'], proc: 'RAM',
      text: 'At the end of your turn, deal damage equal to half your Block to the targeted enemy.',
      hooks: { onTurnEnd(F) { const b = Math.floor(((F.player && F.player.block) || 0) / 2); if (b > 0) zap(F, focus(F), b); } } },
    { id: 'castle_walls', name: 'Castle Walls', icon: '🏰', rarity: 'r', kw: ['fortress'], proc: 'WALLS HOLD',
      text: 'Your Block no longer fades at the start of your turn. Stack it high.',
      rules: { blockKeep: 1 } },
    // Brawler
    { id: 'sweatband', name: 'Sweatband', icon: '🎽', rarity: 'c', kw: ['brawler', 'fortress'], proc: 'PUMPED',
      text: 'Whenever you gain Strength, gain 4 Block.',
      hooks: { onStatus(F, u, s, v) { if (u === F.player && s === 'str' && v > 0) gainBlock(F, 4); } } },
    { id: 'gym_membership', name: 'Gym Membership', icon: '🏋', rarity: 'r', kw: ['brawler'], proc: 'GAINS',
      text: 'Whenever you gain Strength, gain 1 more. No pain, no gain.',
      hooks: { onStatus(F, u, s, v) { if (u === F.player && s === 'str' && v > 0) selfStatus(F, 'str', 1); } } },
    // Magnet
    { id: 'horseshoe', name: 'Horseshoe', icon: '🐴', rarity: 'c', kw: ['metal', 'fortress'], proc: 'CLINK',
      text: 'Whenever one grab delivers 2 or more metal items, gain 4 Block.',
      hooks: { onGrab(F) { if (grabDefs(F).filter(d => tagged(d, 'metal')).length >= 2) gainBlock(F, 4); } } },
    { id: 'tuning_fork', name: 'Tuning Fork', icon: '🎵', rarity: 'u', kw: ['metal', 'jackpot'], proc: 'CLANG',
      text: 'Whenever a grab combo includes a metal item, deal 4 damage to ALL enemies.',
      hooks: { onCombo(F, combo, defs) { if ((defs || []).some(d => tagged(d, 'metal'))) zapAll(F, 4); } } },
    { id: 'dynamo', name: 'Dynamo', icon: '🔋', rarity: 'r', kw: ['metal'],
      text: 'At the end of your turn, deal 1 damage to the targeted enemy for each metal item in your bin.',
      hooks: {
        onTurnEnd(F) {
          const n = (F.bin || []).filter(i => tagged(ITEMS[i.id], 'metal')).length;
          if (!n || !CB()) return;
          proc(F, 'dynamo', 'DYNAMO ' + n);
          zap(F, focus(F), n);
        },
      } },
    // Scrap
    { id: 'dumpster_lid', name: 'Dumpster Lid', icon: '🗑', rarity: 'c', kw: ['junk', 'fortress'], proc: 'LID',
      text: 'Whenever junk is added to your bin, gain 3 Block for each piece.',
      hooks: { onJunk(F, n) { if (n > 0) gainBlock(F, 3 * n); } } },
    { id: 'junkyard_king', name: 'Junkyard King', icon: '👑', rarity: 'r', kw: ['junk', 'brawler'], proc: 'KING OF TRASH',
      text: 'Whenever you grab out junk, gain 1 Strength. Long live the king.',
      hooks: { onPlay(F, inst, def) { if (isJunkPlay(inst, def)) selfStatus(F, 'str', 1); } } },
    // Jackpot
    { id: 'prize_counter', name: 'Prize Counter', icon: '🎫', rarity: 'c', kw: ['jackpot', 'fortress'], proc: 'PRIZE',
      text: 'Whenever one grab delivers 3 or more items, gain 6 Block.',
      hooks: { onJackpot(F) { gainBlock(F, 6); } } },
    { id: 'winning_streak', name: 'Winning Streak', icon: '📈', rarity: 'u', kw: ['jackpot'], proc: 'ON A ROLL',
      text: 'Every third grab in a row that brings something up gives 1 extra grab (once a turn).',
      hooks: {
        onGrab(F, n) {
          const k = F.streak || 0;
          if (!n || k < 3 || k % 3) return;
          const m = mem(F);
          if (m.streakTurn === F.turn) return;
          if (!CB()) return;
          m.streakTurn = F.turn;
          moreGrabs(F, 1);
        },
      } },
    { id: 'encore_machine', name: 'Encore Machine', icon: '🎰', rarity: 'r', kw: ['jackpot'], proc: 'ENCORE',
      text: 'Your grab combos resolve twice. The crowd demands it.',
      rules: { comboTwice: 1 } },
    // Swarm
    { id: 'marble_pouch', name: 'Marble Pouch', icon: '👝', rarity: 'c', kw: ['swarm'], proc: 'MARBLES',
      text: 'Start each fight with 3 extra Prize Marbles in your bin.',
      hooks: { onFightStart(F) { const c = CB(); if (c && c.addTemp) c.addTemp(F, 'prize_marble', 3); } } },
    { id: 'beehive', name: 'Beehive', icon: '🐝', rarity: 'u', kw: ['swarm'], proc: 'BZZT',
      text: 'Whenever you play a small item, deal 2 damage to a random enemy.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'small')) zap(F, randomFoe(F), 2); } } },
    { id: 'pocket_dimension', name: 'Pocket Dimension', icon: '🌀', rarity: 'r', kw: ['swarm'], proc: 'BIGGER INSIDE',
      text: 'Small items get +2 damage, Block and healing, and +1 to every status they apply.',
      rules: { amp: { small: 2 } } },
    // Glass
    { id: 'bottle_deposit', name: 'Bottle Deposit', icon: '🍾', rarity: 'c', kw: ['glass', 'greed'], proc: 'DEPOSIT',
      text: 'Whenever a glass item shatters, gain 3 Block and 2 gold.',
      hooks: { onShatter(F) { gainBlock(F, 3); gainGold(F, 2); } } },
    { id: 'sharp_shards', name: 'Sharp Shards', icon: '🔪', rarity: 'u', kw: ['glass'], proc: 'SHARDS',
      text: 'Whenever a glass item shatters, deal 4 damage to ALL enemies.',
      hooks: { onShatter(F) { zapAll(F, 4); } } },
    { id: 'glass_cannon', name: 'Glass Cannon', icon: '🥂', rarity: 'r', kw: ['glass'], proc: 'GLASS CANNON',
      text: 'Glass items resolve with double numbers, but always shatter (Exhaust) when played.',
      rules: { glassBreak: 1 } },
    // Feast
    { id: 'bat_wing', name: 'Bat Wing', icon: '🦇', rarity: 'u', kw: ['feast'], proc: 'DRAIN',
      text: 'Whenever you heal, deal that much damage (up to 10) to the targeted enemy.',
      hooks: { onHeal(F, amt) { const v = Math.min(10, Math.round(amt) || 0); if (v > 0) zap(F, focus(F), v); } } },
    { id: 'feast_table', name: 'Feast Table', icon: '🍗', rarity: 'r', kw: ['feast'], proc: 'SECONDS',
      text: 'Whenever you play a food item, gain 1 Max HP for good (up to 3 per fight).',
      hooks: {
        onPlay(F, inst, def) {
          const c = CB();
          if (!tagged(def, 'food') || !c || !c.gainMaxHp) return;
          const m = mem(F);
          if ((m.feast || 0) >= 3) return;
          m.feast = (m.feast || 0) + 1;
          c.gainMaxHp(F, 1);
        },
      } },
    // Greed
    { id: 'piggy_bank', name: 'Piggy Bank', icon: '🐷', rarity: 'u', kw: ['greed', 'fortress'], proc: 'SAVINGS',
      text: 'Start each fight with 1 Block for every 10 gold you carry (up to 20).',
      hooks: {
        onFightStart(F) {
          const c = CB();
          const g = c && c.gold ? c.gold(F) : 0;
          const v = Math.min(20, Math.floor(g / 10));
          if (v > 0) gainBlock(F, v);
        },
      } },
    { id: 'money_bags', name: 'Money Bags', icon: '💰', rarity: 'r', kw: ['greed'],
      text: 'Whenever you gain gold in a fight, deal that much damage (up to 15) to ALL enemies.',
      hooks: {
        onGold(F, amt) {
          const v = Math.min(15, Math.round(amt) || 0);
          if (v <= 0 || !CB()) return;
          proc(F, 'money_bags', 'CHA-CHING ' + v);
          zapAll(F, v);
        },
      } },
    // Echo
    { id: 'crystal_focus', name: 'Crystal Focus', icon: '🔮', rarity: 'c', kw: ['echo'], proc: 'FOCUS',
      text: 'Start each fight by copying a random magic item in your bin.',
      hooks: { onFightStart(F) { const c = CB(); if (c && c.copy) c.copy(F, 'magic'); } } },
    { id: 'wizard_hat', name: 'Wizard Hat', icon: '🎩', rarity: 'u', kw: ['echo'], proc: 'ZAP',
      text: 'Whenever you play a magic item, deal 3 damage to a random enemy.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'magic')) zap(F, randomFoe(F), 3); } } },
    { id: 'echo_chamber', name: 'Echo Chamber', icon: '📯', rarity: 'r', kw: ['echo'], proc: 'ECHO',
      text: 'Every third magic item you play resolves twice. Twice. Twice.',
      rules: { echo: 3 } },

    // boss
    { id: 'token_stack', name: 'Stack of Tokens', icon: '🪙', rarity: 'boss', kw: ['jackpot', 'junk'], proc: 'TOKENS',
      text: '+1 grab every turn. Start each fight with 2 Rocks in your bin.',
      mods: { grabs: 1 }, hooks: { onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'rock', 2); } } },
    { id: 'third_hand', name: 'Third Hand', icon: '🦾', rarity: 'boss', kw: [],
      text: 'Your claw grows a third prong. Where did it come from? Do not ask.',
      mods: { prongs: 1 } },
    { id: 'golden_crane', name: 'Golden Crane', icon: '🏗', rarity: 'boss', kw: [],
      text: 'Your claw opens 20% wider and grips 30% harder. Solid gold, mostly.',
      mods: { width: 0.2, grip: 0.3 } },
    { id: 'cursed_quarter', name: 'Cursed Quarter', icon: '👁', rarity: 'boss', kw: ['jackpot'],
      text: '+1 grab every turn. Lose 10 Max HP. The arcade always gets paid.',
      mods: { grabs: 1, maxhp: -10 } },

    // event only
    { id: 'friendship_bracelet', name: 'Friendship Bracelet', icon: '📿', rarity: 'event', kw: ['fortress'], proc: 'FRIEND',
      text: 'Gain 5 Max HP. Start each fight with 3 Block. You made a friend. It was a plush.',
      mods: { maxhp: 5 }, hooks: { onFightStart(F) { gainBlock(F, 3); } } },
    { id: 'cursed_plush', name: 'Cursed Plush', icon: '🧿', rarity: 'event', kw: ['brawler', 'junk'], proc: 'WHISPER',
      text: 'Start each fight with 2 Strength and 1 Slag in your bin. It whispers encouragement.',
      mods: { startStr: 2 }, hooks: { onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'slag', 1); } } },
  ];
  const RELICS = {};
  for (const r of RELIC_LIST) RELICS[r.id] = r;

  // -------------------------------------------------------- claw upgrades
  // Each upgrade counts itself on claw.ups so apply() can refuse past max.
  // Granted only by the boss spare-parts screen (acts 1 and 2) and tower
  // bonuses; no shop, rest stop or event sells them. cost stays for later use.
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
    width: { id: 'width', name: 'Wider Palm', icon: '↔', max: 3, cost: 70,
      text: 'The claw opens 18% wider. Hug bigger things.', apply: upgrade('width', 3, c => { c.width = r2((c.width || 1) + 0.18); }) },
    grip: { id: 'grip', name: 'Stronger Motor', icon: '✊', max: 3, cost: 80,
      text: 'The prongs squeeze 35% harder. Heavy things stop slipping.', apply: upgrade('grip', 3, c => { c.grip = r2((c.grip || 1) + 0.35); }) },
    speed: { id: 'speed', name: 'Greased Rails', icon: '⚡', max: 2, cost: 50,
      text: 'The carriage moves 30% faster.', apply: upgrade('speed', 2, c => { c.speed = r2((c.speed || 1) + 0.3); }) },
    prongs: { id: 'prongs', name: 'Third Prong', icon: '🔱', max: 1, cost: 110,
      text: 'Adds a middle prong. Grabs much more reliably.', apply: upgrade('prongs', 1, c => { c.prongs = 3; }) },
    rubber: { id: 'rubber', name: 'Rubber Tips', icon: '🟣', max: 1, cost: 80,
      text: 'Grippy rubber prong tips. Round things stop squirting out.', apply: upgrade('rubber', 1, c => { c.rubber = 1; }) },
    magnet: { id: 'magnet', name: 'Electromagnet', icon: '🧲', max: 1, cost: 90,
      text: 'The palm pulls nearby metal items in while it drops.', apply: upgrade('magnet', 1, c => { c.magnet = 1; }) },
  };

  // ------------------------------------------------------------ claw types
  // The claw the Crawler bolts onto the Rig at the start of a run (the claw
  // row on character select, run.clawType; a run without one is 'classic').
  // The physics lives in PHYS.CLAW_TYPES; this is what the picker shows.
  // stats are 1..5 pips: grip (how well it holds), reach (how much it can
  // take at once), speed (the rails and the drop), plus the good and bad
  // matchups. ups: how the spare-parts upgrades behave on this claw.
  const CLAWS = {
    classic: { id: 'classic', name: 'Classic Claw', icon: '🦀', color: '#c9d3e0', order: 0,
      text: 'Two chrome prongs and a dream. Grabs a bit of everything.',
      joke: 'Factory default. Has never once been rigged. Allegedly.',
      stats: { grip: 3, reach: 3, speed: 3 }, good: 'A bit of everything', bad: 'Nothing in particular',
      ups: {} },
    tri: { id: 'tri', name: 'Tri-Claw', icon: '🔱', color: '#ffc94d', order: 1,
      text: 'Three curled prongs that cup round things like eggs. Narrower than the classic.',
      joke: 'Holds a marble like a jeweller. Holds a sword like a toddler.',
      stats: { grip: 4, reach: 2, speed: 3 }, good: 'Balls, orbs, fruit', bad: 'Long things',
      ups: { prongs: 'A fourth prong. Even grippier.' } },
    scoop: { id: 'scoop', name: 'Scoop', icon: '🪣', color: '#ff8a2b', order: 2,
      text: 'A clamshell bucket. Scoops loose small things by the handful. Swords stick out and tip over the rim.',
      joke: 'Technically a shovel. The union is looking into it.',
      stats: { grip: 3, reach: 5, speed: 2 }, good: 'Small loose things, heaps', bad: 'Swords, axes, anything long',
      ups: { prongs: 'Taller bucket lips: grips a little better.', rubber: 'A rubber lining.' } },
    hand: { id: 'hand', name: 'Grabber Hand', icon: '🧤', color: '#ff9ad0', order: 3,
      text: 'A big rubber glove with curling fingers. Sticky. Always takes the biggest thing it touched, and only that.',
      joke: 'Previously employed as a high five. Still very enthusiastic.',
      stats: { grip: 5, reach: 1, speed: 1 }, good: 'One big heavy thing', bad: 'Handfuls, hurry',
      ups: { prongs: 'An extra finger. Even stickier.', width: 'A bigger glove.' } },
    magnet: { id: 'magnet', name: 'Magnet Crane', icon: '🧲', color: '#2ee6d6', order: 4,
      text: 'A round electromagnet on a cable. Only lifts metal (and what rides on it), with a pull that makes metal leap up. Drops everything when it lets go.',
      joke: 'Loves swords, keys and coins. Has not noticed the potions exist.',
      stats: { grip: 4, reach: 4, speed: 3 }, good: 'Metal builds', bad: 'Potions, food, anything not metal',
      ups: { grip: 'A stronger field: holds heavier metal.', width: 'A bigger magnet.', prongs: 'A second coil: 25% more range.', magnet: 'Overcharged: the pull gets 40% stronger.' } },
    hook: { id: 'hook', name: 'Harpoon', icon: '🪝', color: '#a6ff5e', order: 5,
      text: 'Fires a barbed hook straight down on a rope. Spears the first thing it hits and yanks it up through the pile.',
      joke: 'Technically fishing. Technically legal.',
      stats: { grip: 3, reach: 1, speed: 5 }, good: 'Sniping one item fast', bad: 'Heavy things tear off the barb',
      ups: { prongs: 'A second barb: easier to hit.', width: 'A bigger barb.', grip: 'A tougher rope: heavy things hold.' } },
  };
  /* The claw type def for an id (a missing or unknown id is the classic). */
  function clawType(id) { return CLAWS[id] || CLAWS.classic; }

  // ----------------------------------------------------------------- events
  const hasGold = (n) => (run) => (run && run.gold || 0) >= n;
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
        { txt: 'Pay 70 gold.', sub: 'Lose 70 gold. He sells you a part he "found": a random relic.', fx: [{ k: 'gold', v: -70 }, { k: 'relic', id: 'random' }],
          cond: hasGold(70) },
        { txt: 'Let him experiment.', sub: 'Lose 8 HP. Upgrade two items.', fx: [{ k: 'hp', v: -8 }, { k: 'upgrade' }, { k: 'upgrade' }] },
        { txt: 'No thanks.', sub: 'Nothing happens.', fx: [] },
      ] },
    { id: 'ink_squid', title: 'The Glow Squid', art: 'scroll',
      text: 'A squid in a fishbowl helmet waddles up, glowing softly. It seems to want a hug.',
      choices: [
        { txt: 'Hug it.', sub: 'Lose 4 HP. Gain 3 Bulbs.', fx: [{ k: 'hp', v: -4 }, { k: 'ink', v: 3 }] },
        { txt: 'Ask to borrow its lantern.', sub: 'Gain a Lantern.', fx: [{ k: 'brush', id: 'lantern' }] },
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
        { txt: 'Take a fortune.', sub: 'Gain 1 Bulb and a Kite.', fx: [{ k: 'ink', v: 1 }, { k: 'brush', id: 'kite' }] },
        { txt: 'Shake it upside down.', sub: 'Lose 6 HP. Gain 3 Bulbs.', fx: [{ k: 'hp', v: -6 }, { k: 'ink', v: 3 }] },
        LEAVE,
      ] },
    { id: 'stuffed_adventurer', title: 'Stuffed Adventurer', art: 'knight',
      text: 'A plush knight with button eyes sits on a shelf. A former Crawler. It blinks at you.',
      choices: [
        { txt: 'Take its sword.', sub: 'Gain a Longsword.', fx: [{ k: 'item', id: 'longsword' }] },
        { txt: 'Read its diary.', sub: 'Gain 2 Bulbs.', fx: [{ k: 'ink', v: 2 }] },
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
        { txt: 'Forge a charm.', sub: 'Lose 8 Max HP. Gain a random relic.', fx: [{ k: 'maxhp', v: -8 }, { k: 'relic', id: 'random' }],
          cond: (run) => (run && run.maxHp || 0) > 30 },
        { txt: 'Commission a blade.', sub: 'Lose 60 gold. Gain a rare item.', fx: [{ k: 'gold', v: -60 }, { k: 'item', id: 'rare' }],
          cond: hasGold(60) },
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
      text: 'A mole in a trench coat opens it. Marquee bulbs and flares, all very legal.',
      choices: [
        { txt: 'Buy bulbs.', sub: 'Lose 40 gold. Gain 3 Bulbs.', fx: [{ k: 'gold', v: -40 }, { k: 'ink', v: 3 }], cond: hasGold(40) },
        { txt: 'Buy a flare.', sub: 'Lose 50 gold. Gain a Flare.', fx: [{ k: 'gold', v: -50 }, { k: 'brush', id: 'flare' }], cond: hasGold(50) },
        { txt: 'Take a free sample.', sub: 'Gain 1 Bulb.', fx: [{ k: 'ink', v: 1 }] },
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

  // ------------------------------------------------------------------ tools
  // The map's light tools (MAP does the geometry by `kind`): a flare is a
  // straight line from the player, a lantern rings around any lit hex, a
  // kite a patch anywhere near. BRUSHES is the same table under its old
  // name, so old code and saves keep working (old brush ids load as a lantern).
  const TOOLS = {
    flare: { id: 'flare', name: 'Flare', icon: '🎇', kind: 'line',
      text: 'Fire it from your hex: lights 5 hexes in a straight line. Mountains and open water stop it.' },
    lantern: { id: 'lantern', name: 'Lantern', icon: '🏮', kind: 'ring',
      text: 'Hang it on any lit hex: lights the ring around it and about half of the next ring.' },
    kite: { id: 'kite', name: 'Kite', icon: '🪁', kind: 'patch',
      text: 'Fly it over any dark hex within 6 of you: lights that hex and its ring.' },
  };
  const BRUSHES = TOOLS;

  // ------------------------------------------------------------- characters
  const CHARACTERS = {
    knight: { id: 'knight', name: 'Sir Grabsworth', title: 'The Knight', color: '#2ee6d6',
      blurb: 'Swords, shields and a very firm handshake. Heavy gear, strong grip, slow rails.',
      hp: 80, gold: 99, unlock: 'start', unlockText: 'Available from the start.',
      claw: { grabs: 3, width: 1.1, grip: 1.3, speed: 0.9, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'squire_gauntlet',
      bin: ['rusty_sword', 'rusty_sword', 'rusty_sword', 'rusty_sword', 'rusty_sword',
        'dented_shield', 'dented_shield', 'dented_shield', 'dented_shield', 'dented_shield',
        'spiked_buckler', 'iron_chain', 'crisp_apple',
        'prize_marble', 'prize_marble', 'prize_marble', 'glass_bead', 'glass_bead', 'glass_bead'] },
    alchemist: { id: 'alchemist', name: 'Mira Fizzwick', title: 'The Alchemist', color: '#a6ff5e',
      blurb: 'Potions, bombs and poison. Four grabs a turn with a tiny claw. Things tend to fizz.',
      hp: 60, gold: 99, unlock: 'act2', unlockText: 'Reach Act 2 with any Crawler.',
      claw: { grabs: 4, width: 0.75, grip: 0.75, speed: 1, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'bubbling_satchel',
      bin: ['toxic_vial', 'toxic_vial', 'toxic_vial', 'toxic_vial',
        'bubble_flask', 'bubble_flask', 'bubble_flask', 'bubble_flask', 'bubble_flask',
        'cherry_bomb', 'cherry_bomb', 'stink_potion', 'crisp_apple',
        'sour_drop', 'sour_drop', 'peppermint', 'peppermint', 'frost_pearl', 'frost_pearl'] },
    rogue: { id: 'rogue', name: 'Pip Quickclaw', title: 'The Rogue', color: '#ff2e88',
      blurb: 'Daggers, coins and not being there when the hit lands. The fastest rails in the Spire.',
      hp: 65, gold: 100, unlock: 'win', unlockText: 'Win a run with any Crawler.',
      claw: { grabs: 3, width: 0.95, grip: 1, speed: 1.4, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'pickpocket_glove',
      bin: ['shiv', 'shiv', 'shiv', 'shiv', 'shiv',
        'old_boot', 'old_boot', 'old_boot', 'old_boot', 'old_boot',
        'lucky_coin', 'lucky_coin', 'skeleton_key',
        'lucky_penny', 'lucky_penny', 'lucky_penny', 'lead_shot', 'lead_shot', 'lead_shot'] },
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

  // ------------------------------------------------------------ archetypes
  // Build archetypes: the chips item and relic cards show, what the build
  // pull reads and what the combo recipes speak in. DESIGN.md "Builds and
  // synergies" has the table.
  const ARCHETYPES = {
    poison: { label: 'Poison', icon: '☠', color: '#a6ff5e', blurb: 'Stack Poison high, spread it, then detonate it.' },
    burn: { label: 'Pyro', icon: '🔥', color: '#ff8a2e', blurb: 'Pile on Burn until something explodes.' },
    frost: { label: 'Frost', icon: '❄', color: '#9fd8ff', blurb: 'Chill to freeze, then shatter what is frozen.' },
    fortress: { label: 'Fortress', icon: '🛡', color: '#7fb2ff', blurb: 'Block that lasts, Thorns that bite, and hitting with your wall.' },
    brawler: { label: 'Brawler', icon: '💪', color: '#ff5a4a', blurb: 'Strength and many small hits: every hit gets the bonus.' },
    metal: { label: 'Magnet', icon: '🧲', color: '#aab3bd', blurb: 'The more metal in the cabinet, the harder it all hits.' },
    junk: { label: 'Scrap', icon: '♻', color: '#c8a040', blurb: 'Turn the junk they throw at you into Block, Strength and damage.' },
    jackpot: { label: 'Jackpot', icon: '🎰', color: '#ffc94d', blurb: 'Many items per grab, grabs in a row, combos that fire twice.' },
    swarm: { label: 'Swarm', icon: '🎱', color: '#2ee6d6', blurb: 'Lots of little things, scooped by the handful.' },
    glass: { label: 'Glass', icon: '💎', color: '#d8f0ff', blurb: 'Fragile items that hit hard and pay out when they shatter.' },
    feast: { label: 'Feast', icon: '🍗', color: '#ff2e88', blurb: 'Food, healing and lifesteal that grow your Max HP.' },
    greed: { label: 'Greed', icon: '🪙', color: '#ffe066', blurb: 'Gold is a weapon: earn it in the fight, spend it or hoard it.' },
    echo: { label: 'Echo', icon: '✨', color: '#b08cff', blurb: 'Magic items that copy, repeat and replay each other.' },
  };
  // Chip order: specific engines first, broad families (glass, metal) last.
  const ARCH_ORDER = ['poison', 'burn', 'frost', 'fortress', 'brawler', 'junk', 'jackpot', 'swarm', 'greed', 'feast',
    'echo', 'glass', 'metal'];
  const TAG_ARCH = { metal: 'metal', small: 'swarm', glass: 'glass', food: 'feast', magic: 'echo', junk: 'junk' };
  const PER_ARCH = { poison: 'poison', burn: 'burn', block: 'fortress', metal: 'metal', junk: 'junk', grabsUsed: 'jackpot',
    streak: 'jackpot', small: 'swarm', gold: 'greed' };
  const KW_CACHE = new Map();

  // Archetype ids of an item or relic def, uncapped, in chip order. Relics
  // (no fx list) carry theirs in `kw`; items derive them from tags and base
  // fx, plus an optional explicit `kw`.
  function kwIds(def) {
    if (!def || typeof def !== 'object') return [];
    if (KW_CACHE.has(def)) return KW_CACHE.get(def);
    const got = new Set((Array.isArray(def.kw) ? def.kw : []).filter(k => ARCHETYPES[k]));
    if (Array.isArray(def.fx)) {
      for (const t of def.tags || []) if (TAG_ARCH[t]) got.add(TAG_ARCH[t]);
      if (def.bag) got.add('swarm');
      for (const f of def.fx) {
        if (!f) continue;
        const foe = f.k === 'status' && f.to !== 'self';
        if (foe && f.s === 'poison') got.add('poison');
        if (foe && f.s === 'burn') got.add('burn');
        if (foe && (f.s === 'chill' || f.s === 'freeze')) got.add('frost');
        if (f.k === 'status' && f.to === 'self' && (f.s === 'thorns' || f.s === 'shield_up')) got.add('fortress');
        if (f.k === 'status' && f.to === 'self' && f.s === 'str') got.add('brawler');
        if (f.k === 'poisonAll') got.add('poison');
        if ((f.k === 'block' && f.v >= 4) || f.k === 'blockPer') got.add('fortress');
        if ((f.k === 'dmg' || f.k === 'random') && f.v > 0 && (f.n || 1) >= 2) got.add('brawler');
        if ((f.k === 'dmgPer' || f.k === 'blockPer') && PER_ARCH[f.per]) got.add(PER_ARCH[f.per]);
        if (f.k === 'purge' || f.k === 'junk') got.add('junk');
        if (f.k === 'grab') got.add('jackpot');
        if (f.k === 'gold' || f.k === 'pay') got.add('greed');
        if ((f.k === 'heal' && f.v > 0) || f.k === 'lifesteal' || (f.k === 'maxhp' && f.v > 0)) got.add('feast');
        if (f.k === 'copy' || f.k === 'again') got.add('echo');
      }
    }
    const explicit = (Array.isArray(def.kw) ? def.kw : []).filter(k => ARCHETYPES[k]);
    const out = explicit.concat(ARCH_ORDER.filter(k => got.has(k) && explicit.indexOf(k) < 0));
    KW_CACHE.set(def, out);
    return out;
  }
  // Build-archetype chips for a card: [{id, label, icon, color}], at most max (3).
  function keywords(def, max) {
    const n = max == null ? 3 : max;
    return kwIds(def).slice(0, n).map(id => ({ id, label: ARCHETYPES[id].label, icon: ARCHETYPES[id].icon, color: ARCHETYPES[id].color }));
  }

  // ---------------------------------------------------------------- combos
  // Named recipes a single grab can fire (COMBAT.grabDone evaluates them on
  // the items the grab delivered). match() is pure over item defs; fx run as
  // if the player played them (Strength counts) at `target`. One per family
  // (the biggest tier), `sup` drops the smaller recipes a big one replaces,
  // `once: 'turn'` caps the grab-giving ones. example / miss: item ids that
  // do / do not fire it (tests and help text).
  const has = (d, k) => kwIds(d).indexOf(k) >= 0;
  const tagOf = (t) => (d) => tagged(d, t);
  const blocky = (d) => (d.fx || []).some(f => f && ((f.k === 'block' && f.v >= 4) || f.k === 'blockPer'));
  const burny = (d) => has(d, 'burn');
  const frosty = (d) => has(d, 'frost');
  const toxic = (d) => has(d, 'poison');
  const count = (defs, p) => defs.filter(d => d && p(d)).length;
  // How many different items (by id) satisfy p.
  const kinds = (defs, p) => new Set(defs.filter(d => d && p(d)).map(d => d.id)).size;
  // True when distinct delivered items can fill every role, one each.
  function roles(defs, preds) {
    const used = new Array(defs.length).fill(false);
    const fill = (i) => {
      if (i >= preds.length) return true;
      for (let j = 0; j < defs.length; j++) {
        if (used[j] || !defs[j] || !preds[i](defs[j])) continue;
        used[j] = true;
        if (fill(i + 1)) return true;
        used[j] = false;
      }
      return false;
    };
    return fill(0);
  }
  const COMBO_LIST = [
    // tier 1: pairs
    { id: 'crossed_blades', name: 'Crossed Blades', tier: 1, family: 'blades', color: '#ff5a4a', target: 'enemy',
      text: 'Two different weapons: strike once more for 4.', fx: [dmg(4)],
      match: (d) => kinds(d, tagOf('weapon')) >= 2, example: ['rusty_sword', 'femur'], miss: ['rusty_sword', 'rusty_sword'] },
    { id: 'shield_wall', name: 'Shield Wall', tier: 1, family: 'guard', color: '#7fb2ff', target: 'self',
      text: 'Two different Block items: gain 4 more Block.', fx: [block(4)],
      match: (d) => kinds(d, blocky) >= 2, example: ['dented_shield', 'pot_lid'], miss: ['dented_shield', 'dented_shield'] },
    { id: 'heavy_hitters', name: 'Heavy Hitters', tier: 1, family: 'heavy', color: '#aab3bd', target: 'enemy',
      text: 'Two heavy items: deal 6 damage.', fx: [dmg(6)],
      match: (d) => count(d, tagOf('heavy')) >= 2, example: ['heater_shield', 'iron_chain'], miss: ['heater_shield', 'shiv'] },
    { id: 'steam_burst', name: 'Steam Burst', tier: 1, family: 'steam', color: '#e6ebf0', target: 'all',
      text: 'Fire meets frost: deal 4 damage to ALL enemies.', fx: [dmg(4)],
      match: (d) => roles(d, [burny, frosty]), example: ['torch', 'snowball'], miss: ['torch', 'femur'] },
    { id: 'toxic_fumes', name: 'Toxic Fumes', tier: 1, family: 'fumes', color: '#a6ff5e', target: 'all',
      text: 'Poison meets fire: apply 2 Poison to ALL enemies.', fx: [status('poison', 2, 'all')],
      match: (d) => roles(d, [toxic, burny]), example: ['stink_potion', 'torch'], miss: ['stink_potion', 'femur'] },
    { id: 'frostbite', name: 'Frostbite', tier: 1, family: 'frostbite', color: '#9fd8ff', target: 'all',
      text: 'Poison meets frost: apply 1 Chill and 1 Poison to ALL enemies.', fx: [status('chill', 1, 'all'), status('poison', 1, 'all')],
      match: (d) => roles(d, [toxic, frosty]), example: ['stink_potion', 'snowball'], miss: ['snowball', 'femur'] },
    { id: 'molotov', name: 'Molotov', tier: 1, family: 'molotov', color: '#ff8a2e', target: 'all',
      text: 'Glass meets fire: apply 2 Burn to ALL enemies.', fx: [status('burn', 2, 'all')],
      match: (d) => roles(d, [tagOf('glass'), burny]), example: ['bubble_flask', 'torch'], miss: ['bubble_flask', 'femur'] },
    { id: 'picnic', name: 'Picnic', tier: 1, family: 'food', color: '#ff2e88', target: 'self',
      text: 'Two foods: heal 3 HP.', fx: [heal(3)],
      match: (d) => count(d, tagOf('food')) >= 2, example: ['crisp_apple', 'stale_bread'], miss: ['crisp_apple', 'femur'] },
    { id: 'pocket_change', name: 'Pocket Change', tier: 1, family: 'swarm', color: '#2ee6d6', target: 'random',
      text: 'Two small items: deal 3 damage to a random enemy.', fx: [dmg(3)],
      match: (d) => count(d, tagOf('small')) >= 2, example: ['prize_marble', 'glass_bead'], miss: ['prize_marble', 'femur'] },
    { id: 'resonance', name: 'Resonance', tier: 1, family: 'magic', color: '#b08cff', target: 'none',
      text: 'Two magic items: copy a random item in your bin for this fight.', fx: [copy()],
      match: (d) => count(d, tagOf('magic')) >= 2, example: ['crystal_ball', 'rulebook'], miss: ['crystal_ball', 'femur'] },
    { id: 'sharp_edges', name: 'Sharp Edges', tier: 1, family: 'edges', color: '#d8f0ff', target: 'enemy',
      text: 'Glass and a weapon: deal 4 damage.', fx: [dmg(4)],
      match: (d) => roles(d, [tagOf('glass'), tagOf('weapon')]), example: ['bubble_flask', 'femur'], miss: ['bubble_flask', 'crisp_apple'] },
    { id: 'scrap_shot', name: 'Scrap Shot', tier: 1, family: 'scrap', color: '#c8a040', target: 'enemy',
      text: 'Junk and a weapon: fire the junk for 8 damage.', fx: [dmg(8)],
      match: (d) => roles(d, [tagOf('junk'), tagOf('weapon')]), example: ['rock', 'femur'], miss: ['rock', 'crisp_apple'] },
    { id: 'pay_day', name: 'Pay Day', tier: 1, family: 'greed', color: '#ffe066', target: 'none',
      text: 'Two Greed items: gain 6 gold.', fx: [gold(6)],
      match: (d) => count(d, (x) => has(x, 'greed')) >= 2, example: ['lucky_coin', 'stolen_gem'], miss: ['lucky_coin', 'femur'] },
    // tier 2: triples and junk
    { id: 'magnetized', name: 'Magnetized', tier: 2, family: 'metal', color: '#aab3bd', target: 'all',
      text: 'Three metal items: deal 5 damage to ALL enemies and gain 5 Block.', fx: [dmg(5), block(5)],
      match: (d) => count(d, tagOf('metal')) >= 3, example: ['rusty_sword', 'dented_shield', 'pot_lid'], miss: ['rusty_sword', 'dented_shield'] },
    { id: 'handful', name: 'Handful', tier: 2, family: 'swarm', color: '#2ee6d6', target: 'none', once: 'turn',
      text: 'Three small items: +1 grab this turn (once a turn).', fx: [grab(1)],
      match: (d) => count(d, tagOf('small')) >= 3, example: ['prize_marble', 'lucky_penny', 'glass_bead'], miss: ['prize_marble', 'glass_bead'] },
    { id: 'banquet', name: 'Banquet', tier: 2, family: 'food', color: '#ff2e88', target: 'self',
      text: 'Three foods: heal 6 HP and gain 2 Regen.', fx: [heal(6), status('regen', 2, 'self')],
      match: (d) => count(d, tagOf('food')) >= 3, example: ['crisp_apple', 'stale_bread', 'peppermint'], miss: ['crisp_apple', 'stale_bread'] },
    { id: 'chandelier', name: 'Chandelier Crash', tier: 2, family: 'glass', color: '#d8f0ff', target: 'all',
      text: 'Three glass items: deal 8 damage to ALL enemies.', fx: [dmg(8)],
      match: (d) => count(d, tagOf('glass')) >= 3, example: ['bubble_flask', 'toxic_vial', 'empty_bottle'], miss: ['bubble_flask', 'toxic_vial'] },
    { id: 'landslide', name: 'Landslide', tier: 2, family: 'junk', color: '#c8a040', target: 'all',
      text: 'Two junk in one grab: deal 10 damage to ALL enemies.', fx: [dmg(10)],
      match: (d) => count(d, tagOf('junk')) >= 2, example: ['rock', 'slag'], miss: ['rock', 'femur'] },
    { id: 'hat_trick', name: 'Hat Trick', tier: 2, family: 'jackpot', color: '#ffc94d', target: 'all',
      text: 'Three items in one grab: deal 4 damage to ALL enemies.', fx: [dmg(4)],
      match: (d) => d.length >= 3, example: ['femur', 'crisp_apple', 'dented_shield'], miss: ['femur', 'crisp_apple'] },
    // tier 3: the big ones
    { id: 'armory', name: 'Armory', tier: 3, family: 'blades', color: '#ff5a4a', target: 'enemy',
      text: 'Three weapons: strike 4 more times for 4.', fx: [dmg(4, 4)],
      match: (d) => count(d, tagOf('weapon')) >= 3, example: ['rusty_sword', 'femur', 'shiv'], miss: ['rusty_sword', 'femur', 'crisp_apple'] },
    { id: 'iron_curtain', name: 'Iron Curtain', tier: 3, family: 'guard', color: '#7fb2ff', target: 'self',
      text: 'Three Block items: gain 12 Block and 2 Thorns.', fx: [block(12), status('thorns', 2, 'self')],
      match: (d) => count(d, blocky) >= 3, example: ['dented_shield', 'pot_lid', 'heater_shield'], miss: ['dented_shield', 'pot_lid', 'femur'] },
    { id: 'elemental_storm', name: 'Elemental Storm', tier: 3, family: 'elements', color: '#ff2e88', target: 'all',
      sup: ['steam_burst', 'toxic_fumes', 'frostbite'],
      text: 'Fire, frost and poison at once: 8 damage, 3 Poison, 3 Burn and 1 Chill to ALL enemies.',
      fx: [dmg(8), status('poison', 3, 'all'), status('burn', 3, 'all'), status('chill', 1, 'all')],
      match: (d) => roles(d, [burny, frosty, toxic]), example: ['torch', 'snowball', 'stink_potion'], miss: ['torch', 'snowball', 'femur'] },
    { id: 'three_of_a_kind', name: 'Three of a Kind', tier: 3, family: 'kind', color: '#ffe066', target: 'all',
      text: 'Three of the same item: deal 10 damage to ALL enemies and gain 5 gold. Cherries!', fx: [dmg(10), gold(5)],
      match: (d) => d.some(x => d.filter(y => y && x && y.id === x.id).length >= 3),
      example: ['prize_marble', 'prize_marble', 'prize_marble'], miss: ['prize_marble', 'prize_marble', 'glass_bead'] },
    { id: 'mega_jackpot', name: 'Mega Jackpot', tier: 3, family: 'jackpot', color: '#ffc94d', target: 'all', once: 'turn',
      text: 'Four or more items in one grab: deal 12 damage to ALL enemies and +1 grab (once a turn).', fx: [dmg(12), grab(1)],
      match: (d) => d.length >= 4, example: ['femur', 'crisp_apple', 'dented_shield', 'shiv'], miss: ['femur', 'crisp_apple', 'shiv'] },
  ];
  const COMBOS = {};
  for (const c of COMBO_LIST) COMBOS[c.id] = c;

  // The combos one grab fires, given the item defs it delivered: one per
  // family (the biggest tier), minus the ones a bigger recipe replaces,
  // biggest tier first, at most COMBO_MAX.
  function combosFor(defs) {
    const list = (defs || []).filter(Boolean);
    if (list.length < 2) return [];
    const hit = COMBO_LIST.filter(c => { try { return !!c.match(list); } catch (e) { return false; } });
    const best = {};
    for (const c of hit) if (!best[c.family] || c.tier > best[c.family].tier) best[c.family] = c;
    let out = hit.filter(c => best[c.family] === c);
    const gone = new Set();
    for (const c of out) for (const id of c.sup || []) gone.add(id);
    out = out.filter(c => !gone.has(c.id));
    out.sort((a, b) => b.tier - a.tier);
    return out.slice(0, COMBO_MAX);
  }

  // ------------------------------------------------------------ build pull
  // How much a run leans into each archetype: keywords over the bin (items
  // it started with or that came in bags weigh half) and 3 per relic.
  function investment(run) {
    const sc = {};
    if (!run) return sc;
    for (const it of run.bin || []) {
      const d = ITEMS[typeof it === 'string' ? it : it && it.id];
      if (!d || d.rarity === 'junk') continue;
      const w = d.starter || tagged(d, 'small') ? 0.5 : 1;
      for (const k of kwIds(d).slice(0, 3)) sc[k] = (sc[k] || 0) + w;
    }
    for (const id of run.relics || []) {
      const r = RELICS[id];
      for (const k of (r && r.kw) || []) if (ARCHETYPES[k]) sc[k] = (sc[k] || 0) + 3;
    }
    return sc;
  }
  // One archetype the run invests in (score 3+, top three, weighted by score).
  function pullArch(rng, run) {
    const sc = investment(run);
    const ks = ARCH_ORDER.filter(k => (sc[k] || 0) >= 3).sort((a, b) => sc[b] - sc[a]).slice(0, 3);
    if (!ks.length) return null;
    let x = rng() * ks.reduce((a, k) => a + sc[k], 0);
    for (const k of ks) { x -= sc[k]; if (x < 0) return k; }
    return ks[ks.length - 1];
  }

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
  // are left out unless junk is asked for by name. Small fillers and bags
  // are left out too (they come in bags, not as single picks) unless the
  // tags ask for 'small', which lists the fillers themselves.
  function pool(rarity, char, tags) {
    const wantSmall = !!(tags && tags.indexOf('small') >= 0);
    return ITEM_IDS.filter(id => {
      const d = ITEMS[id];
      if (rarity === 'junk') return d.rarity === 'junk';
      if (d.rarity === 'junk' || d.starter || d.bag) return false;
      if (!wantSmall && d.tags.indexOf('small') >= 0) return false;
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

  const BAG_IDS = ITEM_IDS.filter(id => ITEMS[id].bag);

  // n distinct item ids for a reward screen. Each slot rolls a rarity by act,
  // then draws from the character's own pool (CHAR_BIAS of the time) or the
  // shared pool, falling back to anything left if that pool is exhausted.
  // A screen of 3 or more slots then turns its last common slot into a bag
  // BAG_CHANCE of the time (a bag is common, so rarity shares hold).
  // Deterministic: the same rng state always gives the same ids.
  function rewardItems(rng, act, char, n, run) {
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
    if (n >= 3 && BAG_IDS.length && rng() < BAG_CHANCE) {
      let at = -1;
      for (let i = 0; i < out.length; i++) if (ITEMS[out[i]].rarity === 'c') at = i;
      if (at >= 0) out[at] = pickFrom(BAG_IDS);
    }
    // Build pull: only with a run to read, so plain calls draw exactly as before.
    if (run && out.length && rng() < BUILD_PULL) {
      const arch = pullArch(rng, run);
      const at = arch ? out.findIndex(id => !ITEMS[id].bag && kwIds(ITEMS[id]).indexOf(arch) < 0) : -1;
      if (at >= 0) {
        const cand = fresh(pool(ITEMS[out[at]].rarity, char)).filter(id => kwIds(ITEMS[id]).indexOf(arch) >= 0);
        if (cand.length) out[at] = pickFrom(cand);
      }
    }
    return out;
  }

  // A relic from pool (ids). With a run, BUILD_PULL of the time the pick is
  // limited to relics of an archetype the run invests in (when the pool has
  // one). Without a run it is exactly rng.pick(pool).
  function pickRelic(rng, pool, run) {
    const ids = (pool || []).filter(id => RELICS[id]);
    if (!ids.length) return null;
    const pickFrom = (a) => a[Math.floor(rng() * a.length)];
    if (run && rng() < BUILD_PULL) {
      const arch = pullArch(rng, run);
      const cand = arch ? ids.filter(id => (RELICS[id].kw || []).indexOf(arch) >= 0) : [];
      if (cand.length) return pickFrom(cand);
    }
    return pickFrom(ids);
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

  // ------------------------------------------------------------------ loot
  // Prize capsules, arcade tickets, the prize counter and the post-fight
  // payout (DESIGN.md "Loot"). Pure: every roll takes the caller's rng and
  // the live pools (relics not owned, claw parts not maxed, tools) come in
  // ctx, so the game decides what is still on offer. Balance is loose on
  // purpose: these are about anticipation, not power.
  const CAP_TIERS = ['c', 'u', 'r', 'l'];
  const LOOT = {
    TIERS: CAP_TIERS,
    NAME: { c: 'Common', u: 'Uncommon', r: 'Rare', l: 'Legendary' },
    COLOR: { c: '#b9b0cc', u: '#2ee6d6', r: '#ff2e88', l: '#ffc94d' },
    // Base tier weights per source. 'counter' capsules have a fixed tier.
    WEIGHTS: {
      normal: { c: 62, u: 28, r: 9, l: 1 },
      bonus: { c: 45, u: 37, r: 15, l: 3 },      // a jackpot or a tier 3 combo in the fight
      elite: { c: 20, u: 46, r: 27, l: 7 },
      boss: { c: 0, u: 20, r: 58, l: 22 },
      treasure: { c: 34, u: 40, r: 22, l: 4 },
      counter: { c: 100, u: 0, r: 0, l: 0 },
    },
    // Chance per step that a capsule turns one tier better mid-open; the
    // steps chain (a common can go all the way, rarely).
    UP: { c: 0.16, u: 0.11, r: 0.07 },
    PITY: 5,                 // capsules in a row below rare, then the next one turns rare mid-open
    TAPS: 3, FAST_TAPS: 2, FAST_AFTER: 12,   // taps to crack one; fewer once the player has opened plenty
    // What falls out, by tier (weights). A kind with nothing in stock rerolls to gold.
    PRIZES: {
      c: { gold: 34, item: 26, tickets: 20, ink: 12, tool: 8 },
      u: { item: 30, gold: 16, relic: 16, tool: 12, maxhp: 10, tickets: 10, ink: 6 },
      r: { relic: 34, item: 28, itemPlus: 10, maxhp: 10, gold: 10, claw: 8 },
      l: { relic: 32, item: 26, claw: 24, maxhp: 18 },
    },
    RELIC_RAR: { c: ['c'], u: ['c', 'u'], r: ['u', 'r'], l: ['r', 'boss'] },
    ITEM_RAR: { c: ['c'], u: ['u'], r: ['r'], l: ['l'] },
    GOLD: { c: [12, 25], u: [30, 50], r: [70, 100], l: [120, 160] },
    TICKET_PRIZE: { c: [8, 14], u: [18, 28], r: [30, 40], l: [50, 60] },
    INK: { c: 2, u: 3, r: 4, l: 5 },
    MAXHP: { c: 2, u: 3, r: 6, l: 10 },
    // Arcade tickets a won fight spits out, and the gold bonus lines of the
    // payout screen (per jackpot, per combo tier, flawless, speedy, overkill).
    TICKETS: { normal: 4, elite: 8, boss: 15, jackpot: 3, combo: 1, flawless: 5, speedy: 3, overkillPer: 5, overkillMax: 4 },
    BONUS_GOLD: { jackpot: 4, combo: 2, flawless: 8, speedy: 5, overkillPer: 3, overkillMax: 8 },
    SPEEDY_TURNS: 2,         // won by the end of this turn
    OVERKILL_MIN: 5,
    DOUBLE: 1 / 20,          // the lucky DOUBLE REWARD roulette
    // Prize counter prices, in tickets.
    PRICE: { cap: { c: 12, u: 28, r: 55, l: 110 }, item: { c: 14, u: 24, r: 40, l: 70 }, maxhp: 30, ink: 10, tool: 18 },
  };
  const capIdx = (t) => Math.max(0, CAP_TIERS.indexOf(t));
  const capNext = (t) => CAP_TIERS[Math.min(3, capIdx(t) + 1)];
  // Weighted pick of a key from {key: weight} (keys in insertion order).
  function wpick(rng, table) {
    let tot = 0;
    for (const k in table) tot += Math.max(0, table[k]);
    let x = rng() * tot;
    for (const k in table) { const v = Math.max(0, table[k]); if (x < v) return k; x -= v; }
    return Object.keys(table)[0];
  }
  const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

  /* A capsule's tiers: tier0 (the colour it drops in), ups (each tier it
     turns into while being cracked, in order) and tier (the final one).
     opts: {tier: fixed tier0 (the counter), pity: capsules below rare so
     far}. At LOOT.PITY a capsule below rare is lifted to rare through ups,
     so the guarantee plays as the "it turned pink!" moment. */
  function rollCapsule(rng, src, opts) {
    opts = opts || {};
    const tier0 = CAP_TIERS.indexOf(opts.tier) >= 0 ? opts.tier : rollRarity(rng, LOOT.WEIGHTS[src] || LOOT.WEIGHTS.normal);
    const ups = [];
    let cur = tier0;
    while (cur !== 'l' && rng() < (LOOT.UP[cur] || 0)) { cur = capNext(cur); ups.push(cur); }
    let pity = false;
    if ((opts.pity || 0) >= LOOT.PITY && capIdx(cur) < 2) {
      while (capIdx(cur) < 2) { cur = capNext(cur); ups.push(cur); }
      pity = true;
    }
    return { src: src || 'normal', tier0, ups, tier: cur, pity };
  }

  /* What a capsule of a tier holds. ctx: {act, char, relics: {c, u, r, boss:
     [ids not owned]}, claws: [upgrade ids not maxed], tools: [ids], prefer:
     'relic' (treasure: a relic whenever one is in stock)}. Returns a prize:
     {k:'item', id, plus} | {k:'relic', id} | {k:'gold'|'ink'|'maxhp'|'tickets', n}
     | {k:'tool', id} | {k:'claw', u}. Deterministic for a given rng. */
  function capsulePrize(rng, tier, ctx) {
    ctx = ctx || {};
    tier = CAP_TIERS.indexOf(tier) >= 0 ? tier : 'c';
    const pickFrom = (a) => a[Math.floor(rng() * a.length)];
    const relicIds = () => {
      const out = [];
      for (const r of LOOT.RELIC_RAR[tier]) for (const id of ((ctx.relics || {})[r] || [])) if (RELICS[id] && out.indexOf(id) < 0) out.push(id);
      return out;
    };
    const itemIds = () => {
      let out = [];
      for (const r of LOOT.ITEM_RAR[tier]) out = out.concat(pool(r, ctx.char));
      if (!out.length) out = pool(tier === 'l' ? 'r' : tier, ctx.char);
      return out;
    };
    const gold = () => ({ k: 'gold', n: rint(rng, LOOT.GOLD[tier][0], LOOT.GOLD[tier][1]) + 5 * Math.max(0, (ctx.act || 1) - 1) });
    let kind = ctx.prefer === 'relic' && relicIds().length ? 'relic' : wpick(rng, LOOT.PRIZES[tier]);
    switch (kind) {
      case 'relic': { const ids = relicIds(); return ids.length ? { k: 'relic', id: pickFrom(ids) } : gold(); }
      case 'item': { const ids = itemIds(); return ids.length ? { k: 'item', id: pickFrom(ids), plus: false } : gold(); }
      case 'itemPlus': { const ids = pool('u', ctx.char); return ids.length ? { k: 'item', id: pickFrom(ids), plus: true } : gold(); }
      case 'claw': { const ids = ctx.claws || []; return ids.length ? { k: 'claw', u: pickFrom(ids) } : gold(); }
      case 'tool': { const ids = ctx.tools || Object.keys(TOOLS); return ids.length ? { k: 'tool', id: pickFrom(ids) } : gold(); }
      case 'tickets': return { k: 'tickets', n: rint(rng, LOOT.TICKET_PRIZE[tier][0], LOOT.TICKET_PRIZE[tier][1]) };
      case 'ink': return { k: 'ink', n: LOOT.INK[tier] };
      case 'maxhp': return { k: 'maxhp', n: LOOT.MAXHP[tier] };
      default: return gold();
    }
  }

  /* Name, rules text, a short icon and a colour for a prize (or a counter
     shelf slot), for the reveal card and the shelf labels. */
  function prizeInfo(p) {
    p = p || {};
    const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    switch (p.k) {
      case 'item': {
        const d = ITEMS[p.id];
        if (!d) break;
        return { name: (p.plus && d.plus && d.plus.name) || (d.name + (p.plus ? '+' : '')), text: itemText(d, !!p.plus), icon: '', col: LOOT.COLOR[d.rarity] || '#ffffff', rarity: d.rarity };
      }
      case 'relic': { const r = RELICS[p.id]; if (!r) break; return { name: r.name, text: r.text || '', icon: r.icon || '', col: '#ffc94d', rarity: r.rarity }; }
      case 'gold': return { name: `${p.n} gold`, text: 'A pile of prize gold, still warm.', icon: '◉', col: '#ffc94d' };
      case 'ink': return { name: word(p.n, TERMS.ink, TERMS.inkPlural), text: 'Spare marquee bulbs. Light more of the dark.', icon: '☀', col: '#2ee6d6' };
      case 'maxhp': return { name: `+${p.n} max HP`, text: `A heart-shaped prize. Raises your max HP by ${p.n} and heals as much.`, icon: '♥', col: '#ff5a4a' };
      case 'tickets': return { name: word(p.n, 'ticket', 'tickets'), text: 'A fat roll of arcade tickets for the prize counter.', icon: '▤', col: '#ff9ec7' };
      case 'tool': { const t = TOOLS[p.id]; if (!t) break; return { name: t.name, text: t.text || '', icon: t.icon || '', col: '#ffb347' }; }
      case 'claw': { const c = CLAW_UPGRADES[p.u]; if (!c) break; return { name: c.name, text: c.text || '', icon: c.icon || '', col: '#2ee6d6' }; }
      case 'cap': return { name: `${LOOT.NAME[p.tier] || 'Mystery'} capsule`, text: 'Crack it open at the counter.', icon: '◒', col: LOOT.COLOR[p.tier] || '#ffffff' };
      default: break;
    }
    return { name: 'Prize', text: '', icon: '?', col: '#ffffff' };
  }

  /* The prize counter's glass shelf: six slots priced in tickets. Three
     capsules (common, uncommon, and a rare or now and then a legendary), an
     item, a heart and bulbs or a tool. Each slot: {k, ..., price, sold}. */
  function prizeShelf(rng, act, ctx) {
    ctx = ctx || {};
    const P = LOOT.PRICE;
    const top = rng() < 0.2 ? 'l' : 'r';
    const out = [
      { k: 'cap', tier: 'c', price: P.cap.c },
      { k: 'cap', tier: 'u', price: P.cap.u },
      { k: 'cap', tier: top, price: P.cap[top] },
    ];
    const rar = rollRarity(rng, act || 1);
    const ids = pool(rar, ctx.char);
    if (ids.length) out.push({ k: 'item', id: ids[Math.floor(rng() * ids.length)], plus: false, price: P.item[rar] || P.item.c });
    out.push({ k: 'maxhp', n: LOOT.MAXHP.u + 1, price: P.maxhp });
    const tools = ctx.tools || Object.keys(TOOLS);
    if (tools.length && rng() < 0.5) out.push({ k: 'tool', id: tools[Math.floor(rng() * tools.length)], price: P.tool });
    else out.push({ k: 'ink', n: LOOT.INK.u, price: P.ink });
    for (const s of out) s.sold = false;
    return out;
  }

  /* The post-fight payout: the lines the tally ticks in, one by one, then
     the totals. st: {tier, gold (the base roll), jackpots, combos: [{name,
     tier}], dmgTaken, turns, overkill, double}. Returns {lines: [{id, label,
     gold, tix}], gold, tix}. */
  function payout(st) {
    st = st || {};
    const T = LOOT.TICKETS, G = LOOT.BONUS_GOLD;
    const tier = st.tier === 'boss' || st.tier === 'elite' ? st.tier : 'normal';
    const lines = [{ id: 'base', label: tier === 'boss' ? 'Boss down' : tier === 'elite' ? 'Elite down' : 'Victory', gold: Math.max(0, Math.round(st.gold || 0)), tix: T[tier] }];
    const jp = Math.max(0, st.jackpots | 0);
    if (jp) lines.push({ id: 'jackpot', label: `Jackpot x${jp}`, gold: G.jackpot * jp, tix: T.jackpot * jp });
    const combos = (st.combos || []).filter(Boolean);
    if (combos.length) {
      const sum = combos.reduce((a, c) => a + Math.max(1, Math.min(3, c.tier | 0)), 0);
      const label = combos.length === 1 ? `Combo: ${combos[0].name || 'combo'}` : `Combos x${combos.length}`;
      lines.push({ id: 'combo', label, gold: G.combo * sum, tix: T.combo * sum });
    }
    if (st.dmgTaken === 0) lines.push({ id: 'flawless', label: 'Flawless', gold: G.flawless, tix: T.flawless });
    const turns = st.turns | 0;
    if (turns > 0 && turns <= LOOT.SPEEDY_TURNS) lines.push({ id: 'speedy', label: turns === 1 ? 'One turn KO' : `Speedy: ${turns} turns`, gold: G.speedy, tix: T.speedy });
    const ok = Math.max(0, Math.round(st.overkill || 0));
    if (ok >= LOOT.OVERKILL_MIN) lines.push({ id: 'overkill', label: `Overkill ${ok}`, gold: Math.min(G.overkillMax, Math.floor(ok / G.overkillPer)), tix: Math.min(T.overkillMax, Math.ceil(ok / T.overkillPer)) });
    let gold = 0, tix = 0;
    for (const l of lines) { gold += l.gold; tix += l.tix; }
    if (st.double) { lines.push({ id: 'double', label: 'DOUBLE REWARD x2', gold, tix }); gold *= 2; tix *= 2; }
    return { lines, gold, tix };
  }

  // ================================================================ META (meta progression)
  /* Reasons to play one more run (DESIGN.md "Meta"): Tilt levels (the
     ascension ladder), the Prizedex (the collection book), achievement
     stickers and the daily run. Pure data and pure helpers; the game keeps
     the profile (meta save) and the flow. */

  // Tilt: winning a run with a crawler unlocks the next level for that
  // crawler. Every level keeps all the twists below it (cumulative).
  const TILT_MAX = 10;
  const TILT = [
    { lv: 0, name: 'Fresh Cabinet', text: 'The machine as it left the factory.', color: '#2ee6d6' },
    { lv: 1, name: 'Loose Coin', text: 'Enemies have 10% more hp.', k: 'hp', v: 0.1, color: '#a6ff5e' },
    { lv: 2, name: 'Sticky Joystick', text: 'Enemies hit 10% harder.', k: 'dmg', v: 0.1, color: '#a6ff5e' },
    { lv: 3, name: 'Bent Prong', text: 'Elites carry one extra affix.', k: 'eliteAffix', v: 1, color: '#ffc94d' },
    { lv: 4, name: 'Dim Marquee', text: 'Start every act with 3 fewer bulbs.', k: 'bulbs', v: 3, color: '#ffc94d' },
    { lv: 5, name: 'Junk Drawer', text: 'A rock rattles in your starting bin.', k: 'junk', id: 'rock', v: 1, color: '#ffc94d' },
    { lv: 6, name: 'Price Hike', text: 'Shops charge 25% more.', k: 'shop', v: 0.25, color: '#ff6bb0' },
    { lv: 7, name: 'Hot Streak', text: 'The hidden escalation climbs every 2 fights, not 3.', k: 'ramp', v: 2, color: '#ff6bb0' },
    { lv: 8, name: 'Hard Bench', text: 'Rest stops heal 20% instead of 30%.', k: 'rest', v: 0.2, color: '#ff6bb0' },
    { lv: 9, name: 'Cheap Plastic', text: 'Prize capsules drop one tier lower.', k: 'caps', v: 1, color: '#ff2e88' },
    { lv: 10, name: 'Rigged', text: 'Bosses start with their phase two Strength.', k: 'bossRage', v: 1, color: '#ff2e88' },
  ];
  // The combined twists of a level (every level up to it). Neutral at 0.
  function tiltMods(lv) {
    const n = Math.max(0, Math.min(TILT_MAX, Math.floor(+lv || 0)));
    const m = { lv: n, hp: 0, dmg: 0, eliteAffix: 0, bulbs: 0, junk: [], shop: 0, ramp: 0, rest: 0, caps: 0, bossRage: 0 };
    for (let i = 1; i <= n; i++) {
      const t = TILT[i];
      if (!t || !t.k) continue;
      if (t.k === 'junk') m.junk.push(t.id);
      else if (t.k === 'ramp' || t.k === 'rest') m[t.k] = t.v;   // a replacement value, not a sum
      else m[t.k] += t.v;
    }
    return m;
  }

  /* Achievement stickers. check(c) is a pure test over a context the game
     builds (never mutates): c.kind 'tick' (polled a few times a second in a
     run), 'ev' (a fight event c.ev), 'fight' (a won fight), 'win' (a won
     run), 'end' (any finished run), 'meta' (profile changes); c.run, c.meta,
     c.f = {tier, grab (items this grab), streak, dmgTaken, turn, hp, curDef,
     lucky, free, enemy (the def an ev is about)}, c.dex = dexProgress(). An
     optional goal + val(c) shows a progress bar on the sticker board. */
  const A_ = (id, name, icon, color, text, check, extra) => Object.assign({ id, name, icon, color, text, check }, extra || {});
  const RUNS = (c) => c.run || {};
  const LOOTOF = (c) => (c.run && c.run.loot) || {};
  const MSTAT = (c) => (c.meta && c.meta.stats) || {};
  const ACH_LIST = [
    // the claw
    A_('first_prize', 'First Prize', '\u{1F3AF}', '#2ee6d6', 'Drop an item down the chute.', (c) => (RUNS(c).delivered | 0) >= 1),
    A_('jackpot', 'Jackpot!', '\u{1F3B0}', '#ffc94d', 'Land three items in one grab.', (c) => (RUNS(c).jackpots | 0) >= 1),
    A_('handful', 'Five Finger Discount', '\u{1F590}', '#ffc94d', 'Land five items in one grab.', (c) => c.kind === 'tick' && !!c.f && (c.f.grab | 0) >= 5),
    A_('on_a_roll', 'On a Roll', '\u{1F525}', '#ff6bb0', 'Keep a grab streak of 10.', (c) => !!c.f && (c.f.streak | 0) >= 10),
    A_('lucky', 'Lucky Claw', '\u{1F340}', '#a6ff5e', 'Light up the Lucky Claw.', (c) => !!c.f && !!c.f.lucky),
    A_('freebie', 'Free Prize', '\u{1F381}', '#2ee6d6', 'Land an item the claw never touched.', (c) => !!c.f && (c.f.free | 0) >= 1),
    A_('delivered500', 'Chute Veteran', '\u{1F4E6}', '#b3a4d6', 'Deliver 500 items over all your runs.', (c) => (MSTAT(c).played | 0) >= 500, { goal: 500, val: (c) => MSTAT(c).played | 0 }),
    // combos
    A_('combo', 'Combo Starter', '✨', '#2ee6d6', 'Fire any grab combo.', (c) => c.kind === 'ev' && c.ev && c.ev.t === 'combo'),
    A_('three_star', 'Three Star Grab', '⭐', '#ffc94d', 'Fire a tier 3 combo.', (c) => c.kind === 'ev' && c.ev && c.ev.t === 'combo' && (c.ev.tier | 0) >= 3),
    A_('mega', 'Mega Jackpot', '\u{1F4B0}', '#ff2e88', 'Fire the Mega Jackpot combo.', (c) => c.kind === 'ev' && c.ev && c.ev.t === 'combo' && c.ev.id === 'mega_jackpot'),
    A_('recipe_book', 'Recipe Book', '\u{1F4D6}', '#a6ff5e', 'Discover 12 different combos.', (c) => (c.dex && c.dex.per && c.dex.per.combos ? c.dex.per.combos.n : 0) >= 12,
      { goal: 12, val: (c) => (c.dex && c.dex.per && c.dex.per.combos ? c.dex.per.combos.n : 0) }),
    // fights
    A_('untouchable', 'Untouchable', '\u{1F6E1}', '#2ee6d6', 'Beat an elite without taking damage.', (c) => c.kind === 'fight' && !!c.f && c.f.tier === 'elite' && c.f.dmgTaken === 0),
    A_('one_turn', 'One Turn Wonder', '⚡', '#ffc94d', 'Win a fight on your first turn.', (c) => c.kind === 'fight' && !!c.f && (c.f.turn | 0) === 1),
    A_('by_a_thread', 'By a Thread', '\u{1F9F5}', '#ff5a4a', 'Win a fight with 5 hp or less.', (c) => c.kind === 'fight' && !!c.f && c.f.hp > 0 && c.f.hp <= 5),
    A_('crusher', 'Crusher', '\u{1F528}', '#ff6bb0', 'Deal 40 damage in one hit.', (c) => (LOOTOF(c).bigHit | 0) >= 40),
    A_('overkill', 'Overkill', '\u{1F4A5}', '#ff2e88', 'Hit 30 past the last hit point of a kill.', (c) => (LOOTOF(c).overkill | 0) >= 30),
    A_('special_delivery', 'Special Delivery', '\u{1F4A3}', '#ff5a4a', 'Finish a boss with a thrown bomb.',
      (c) => c.kind === 'ev' && c.ev && c.ev.t === 'die' && !c.ev.escaped && !!c.f && !!c.f.enemy && c.f.enemy.tier === 'boss' && !!c.f.curDef && c.f.curDef.art === 'bomb'),
    A_('indigestion', 'Indigestion', '\u{1F92E}', '#a6ff5e', 'Kill a monster with your stuff in its belly and get it all back.', (c) => c.kind === 'ev' && c.ev && c.ev.t === 'binReturn' && c.ev.why === 'burst'),
    A_('hiccup', 'HIC!', '\u{1F4A8}', '#a6ff5e', 'Hit a monster so hard it hiccups an item back up.', (c) => c.kind === 'ev' && c.ev && c.ev.t === 'binReturn' && c.ev.why === 'hiccup'),
    A_('boss_down', 'Boss Down', '\u{1F480}', '#ff2e88', 'Beat your first boss.', (c) => c.kind === 'fight' && !!c.f && c.f.tier === 'boss'),
    A_('prize_hunter', 'Prize Hunter', '\u{1F3F9}', '#ff6bb0', 'Take down 100 enemies over all your runs.', (c) => (MSTAT(c).kills | 0) >= 100, { goal: 100, val: (c) => MSTAT(c).kills | 0 }),
    // loot
    A_('golden_capsule', 'Golden Capsule', '\u{1F31F}', '#ffc94d', 'Open a legendary capsule.', (c) => LOOTOF(c).bestCap === 'l'),
    A_('capsule_fan', 'Gacha Fan', '\u{1F52E}', '#2ee6d6', 'Open 25 capsules over all your runs.', (c) => (((c.meta && c.meta.loot) || {}).caps | 0) >= 25, { goal: 25, val: (c) => ((c.meta && c.meta.loot) || {}).caps | 0 }),
    A_('ticket_tycoon', 'Ticket Tycoon', '\u{1F39F}', '#a6ff5e', 'Win 100 tickets in one run.', (c) => (LOOTOF(c).tixEarned | 0) >= 100),
    A_('double_down', 'Double Down', '✖', '#ffc94d', 'Hit a DOUBLE REWARD.', (c) => (LOOTOF(c).doubles | 0) >= 1),
    A_('money_bags', 'Money Bags', '\u{1F4B5}', '#ffc94d', 'Carry 300 gold at once.', (c) => (RUNS(c).gold | 0) >= 300),
    A_('relic_hoarder', 'Relic Hoarder', '\u{1F3FA}', '#ff6bb0', 'Hold 10 relics in one run.', (c) => ((RUNS(c).relics || []).length) >= 10),
    A_('packed_bin', 'Packed Bin', '\u{1F5D1}', '#b3a4d6', 'Own 30 items in one bin.', (c) => ((RUNS(c).bin || []).length) >= 30),
    // the climb
    A_('going_up', 'Going Up', '⬆', '#2ee6d6', 'Reach act 2.', (c) => (RUNS(c).act | 0) >= 2),
    A_('champion', 'Prize Master Down', '\u{1F451}', '#ffc94d', 'Win a run.', (c) => c.kind === 'win'),
    A_('full_roster', 'Full Roster', '\u{1F46A}', '#ffc94d', 'Win with three different crawlers.', (c) => winCount(c) >= 3, { goal: 3, val: winCount }),
    A_('tilted', 'Tilted', '\u{1F579}', '#a6ff5e', 'Win a run at Tilt 1 or higher.', (c) => c.kind === 'win' && (RUNS(c).tilt | 0) >= 1),
    A_('seriously_tilted', 'Seriously Tilted', '\u{1F300}', '#ff6bb0', 'Unlock Tilt 5 with any crawler.', (c) => maxTilt(c) >= 5, { goal: 5, val: maxTilt }),
    A_('rigged', 'Beat the Rigged Game', '\u{1F3C6}', '#ff2e88', 'Win a run at Tilt 10.', (c) => c.kind === 'win' && (RUNS(c).tilt | 0) >= TILT_MAX),
    A_('half_shelf', 'Half the Shelf', '\u{1F4DA}', '#2ee6d6', 'Fill half of the Prizedex.', (c) => !!c.dex && c.dex.pct >= 50, { goal: 50, val: (c) => (c.dex ? Math.floor(c.dex.pct) : 0) }),
    A_('daily_grind', 'Daily Grind', '\u{1F4C5}', '#a6ff5e', 'Finish a daily run.', (c) => c.kind === 'end' && !!RUNS(c).daily),
  ];
  function winCount(c) { const w = (c && c.meta && c.meta.winsBy) || {}; return Object.keys(w).filter((k) => w[k] > 0).length; }
  function maxTilt(c) { const t = (c && c.meta && c.meta.tilt) || {}; let m = 0; for (const k in t) m = Math.max(m, t[k] | 0); return m; }
  const ACHIEVEMENTS = {};
  for (const a of ACH_LIST) ACHIEVEMENTS[a.id] = a;
  const ACH_IDS = ACH_LIST.map((a) => a.id);
  // The ids a context newly earns (have: {id: truthy} already unlocked).
  function achCheck(c, have) {
    const out = [];
    have = have || {};
    for (const a of ACH_LIST) {
      if (have[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(c || {}); } catch (e) { ok = false; }
      if (ok) out.push(a.id);
    }
    return out;
  }

  /* The Prizedex: every item, relic, enemy and combo there is to find. Junk
     counts (you met it), test dummies and bare fixtures do not. */
  const DEX_TABS = [
    { id: 'items', label: 'Items', icon: '⚔' },
    { id: 'relics', label: 'Relics', icon: '\u{1F48E}' },
    { id: 'enemies', label: 'Enemies', icon: '\u{1F47E}' },
    { id: 'combos', label: 'Combos', icon: '✨' },
  ];
  function dexEntries() {
    return {
      items: Object.keys(ITEMS).filter((id) => !ITEMS[id].noDex),
      relics: Object.keys(RELICS).filter((id) => !RELICS[id].noDex),
      enemies: Object.keys(ENEMIES).filter((id) => id !== 'dummy' && !ENEMIES[id].noDex),
      combos: Object.keys(COMBOS),
    };
  }
  // seen: {items: {id: 1}, relics, enemies, combos} -> {n, total, pct, per: {tab: {n, total}}}
  function dexProgress(seen) {
    seen = seen || {};
    const E = dexEntries();
    const per = {};
    let n = 0, total = 0;
    for (const tab of DEX_TABS) {
      const ids = E[tab.id] || [], got = seen[tab.id] || {};
      let k = 0;
      for (const id of ids) if (got[id]) k++;
      per[tab.id] = { n: k, total: ids.length };
      n += k; total += ids.length;
    }
    return { n, total, pct: total ? (n * 100) / total : 0, per };
  }

  /* The daily run: one seed and one crawler per calendar day (the same for
     everyone), always at Tilt 0. The score rewards the climb first. */
  function dailyKey(d) {
    d = d instanceof Date ? d : new Date(d == null ? Date.now() : d);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function dailySeed(key) {
    const s = 'clawspire-daily:' + key;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) || 1;
  }
  function dailyChar(key) {
    const ids = Object.keys(CHARACTERS);
    return ids.length ? ids[dailySeed(key + ':char') % ids.length] : 'knight';
  }
  // run -> score (won: the run finished act 3).
  function dailyScore(run, won) {
    run = run || {};
    const L = run.loot || {};
    return Math.max(0, Math.round((run.act | 0) * 500 + (run.kills | 0) * 20 + (run.jackpots | 0) * 15 + (L.tixEarned | 0) * 3 + (run.gold | 0) + (won ? 2500 : 0)));
  }
  // ================================================================ /META

  return {
    // meta progression (Tilt, achievements, Prizedex, daily)
    TILT, TILT_MAX, tiltMods, ACHIEVEMENTS, ACH_IDS, achCheck, DEX_TABS, dexEntries, dexProgress, dailyKey, dailySeed, dailyChar, dailyScore,
    LOOT, rollCapsule, capsulePrize, prizeInfo, prizeShelf, payout,
    ITEMS, STATUS, ENEMIES, ENCOUNTERS, RELICS, EVENTS, CLAW_UPGRADES, BRUSHES, TOOLS, TERMS, CHARACTERS, ACTS,
    CLAWS, clawType,
    ITEM_ART, ENEMY_ART, TAGS, FX_KINDS, PER_KINDS, MOVE_KINDS, EVENT_FX, RELIC_MODS, RELIC_HOOKS, RELIC_RULES, RARITY_WEIGHTS,
    CHAR_BIAS, BAG_CHANCE, BUILD_PULL, COMBO_MAX, ECONOMY, DIFFICULTY, ARCHETYPES, ARCH_ORDER, COMBOS,
    itemText, pool, rollRarity, rewardItems, relicPool, pickRelic, keywords, kwIds, combosFor, investment,
    AFFIXES, AFFIX_ODDS, affixRoll,
  };
})();
