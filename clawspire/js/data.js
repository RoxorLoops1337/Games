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
    'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice',
    // round 3 (Lucky Lou and the synergy pass): casino kit and bait
    'chip', 'card', 'horseshoe', 'clover', 'slot', 'potato', 'pill', 'cookie'];
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
  // gold the gold carried (per 10), luck the player's Luck (it is not spent).
  const PER_KINDS = ['block', 'junk', 'metal', 'grabsUsed', 'poison', 'burn', 'small', 'streak', 'gold', 'luck'];
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
    'onKill', 'onHurt', 'onStatus', 'onBlock', 'onHeal', 'onJunk', 'onCombo', 'onJackpot', 'onShatter', 'onGold',
    // round 3: Luck cashed out (F, luck, items), an enemy swallowed one of your
    // items (F, e, inst, def), a cabinet material reacted (F, kind 'crack' |
    // 'shatter' | 'fuse' | 'blast', inst, def)
    'onCashOut', 'onEat', 'onMaterial',
    // round 6: the companion pet did a trick in the fight (F, petId)
    'onPet',
    // round 12 (LEG): bubbles popped (F, where 'chute' | 'bin', n), after they paid
    'onBubble',
    // round 17 (TECH): the cabinet did something on your turn (F, kind 'event' | 'perfect' |
    // 'fever' | 'double', v: the PERFECT streak or the fever's count, id: the event's id)
    'onCab'];
  // Engine rules a build-defining relic can bend (relic.rules, merged into
  // F.rules by COMBAT.newFight). See DESIGN.md "Builds and synergies".
  // luck: empty grabs and near misses fill the Luck meter (Lucky Lou's gift);
  // cashAmp: +1 damage per Luck on every cash out.
  // turret (CR8, round 8): any crawler builds Mama Mech's turret (Blueprints).
  // bubbles (ROS, round 10): any crawler blows Ms. Bubbles' bubbles (the Foam Machine).
  const RELIC_RULES = ['poisonKeep', 'blockKeep', 'shatter', 'glassBreak', 'amp', 'comboTwice', 'echo', 'luck', 'cashAmp', 'turret', 'bubbles'];
  // BALANCE (round 12, owner request): fewer rare and legendary reward cards (was 70/25/5/0, 55/33/11/1, 40/38/18/4)
  const RARITY_WEIGHTS = {
    1: { c: 76, u: 22, r: 2, l: 0 },
    2: { c: 64, u: 29, r: 6.5, l: 0.5 },
    3: { c: 52, u: 35, r: 11.5, l: 1.5 },
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
  // BALANCE (round 12, owner request: a skilled player should lose about 70% of runs): was hp 2.0, dmg 1.8,
  // ramp every 3 fights +12% / +12% up to 8 steps. Now a harder start and a slower, longer ramp, so the
  // deaths spread over the three acts instead of piling up in act 2. tierDmg: elites and bosses hit 50% harder
  // on top (normals stay where a starting bin can still beat every one of them; the balance suite guards that).
  const DIFFICULTY = { hp: 3.1, dmg: 2.6, ramp: { every: 4, hp: 0.1, dmg: 0.1, max: 10 }, tierDmg: { elite: 1.5, boss: 1.5 } };   // the owner tunes by hand

  const ECONOMY = {
    startInk: 10,          // bulbs at the start of every act (was 5)
    inkTile: 2,            // a box of bulbs always gives 2 (was 1, sometimes 2)
    fightInkChance: 0.5,   // a won normal fight drops 1 bulb this often
    eliteInk: 2,           // bulbs for beating an elite (was 1)
    towerInk: 2,           // bulbs a tower keeper leaves on top of the view and the relic
    eliteToolChance: 0.35, // a beaten elite hands over a tool this often
    trickle: 2,            // used items that rain back into the bin at every turn start
    binFloor: 6,           // a bin below this at turn start is topped up from the used pile first (then the trickle)
    // BALANCE (round 12, owner request): gold is earned all the time but a good relic takes a few fights and an elite
    goldK: 0.7,            // x the gold a won fight pays (the 10-25 roll, +4 an act, x1.6 elite, x2.5 boss); was 1
    shopK: 1.3,            // x every shop price (items, the relic, a reroll's shelf); Tilt's Price Hike still stacks; was 1
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

    // ---- Round 3 (DESIGN.md "Lucky Lou and the synergy pass"). Lucky Lou's
    // casino kit: dice roll twice and keep the best while you hold Luck, Luck
    // comes from chips, clovers and whiffs, and a grab of 2+ items cashes it
    // out on everything. Then shared pieces for the round 1 and 2 systems:
    // bait for hungry monsters, glass dice that crack, a fuse to light, a
    // coin that floats. ----
    { id: 'bone_dice', name: 'Bone Dice', rarity: 'c', cost: 40, char: 'gambler', starter: true,
      tags: [], shape: box(22, 22), density: 1.2, friction: 0.4, restitution: 0.3,
      color: '#f1e9d6', color2: '#8a1a2a', art: 'dice',
      fx: [random(2, 8)], plus: { fx: [random(4, 10)] },
      text: 'Deal {min} to {max} damage. Carved from something that lost a bet.' },
    { id: 'poker_chip', name: 'Poker Chip', rarity: 'c', cost: 40, char: 'gambler', starter: true,
      tags: [], shape: circle(13), density: 1.3, friction: 0.3, restitution: 0.15,
      color: '#ff2e4a', color2: '#ffffff', art: 'chip', target: 'self',
      fx: [block(4)], plus: { fx: [block(6)] },
      text: 'Gain {v} Block. Stack them high, hide behind them.' },
    { id: 'scratch_card', name: 'Scratch Card', rarity: 'c', cost: 45, char: 'gambler',
      tags: ['light'], shape: box(24, 34), density: 0.5, friction: 0.6,
      color: '#ffe066', color2: '#ff2e88', art: 'card',
      fx: [random(0, 10), gold(2)], plus: { fx: [random(2, 12), gold(3)] },
      text: 'Scratch it: deal {min} to {max} damage and win {v2} gold. Not a winner? Try again!' },
    { id: 'fortune_cookie', name: 'Fortune Cookie', rarity: 'c', cost: 40, char: 'gambler',
      tags: ['food'], shape: poly([[-16, 5], [-11, -8], [0, -12], [11, -8], [16, 5], [0, 11]]), density: 0.6, friction: 0.6,
      color: '#e8b25e', color2: '#fff6e0', art: 'cookie', target: 'self',
      fx: [heal(3), status('luck', 1, 'self')], plus: { fx: [heal(5), status('luck', 2, 'self')] },
      text: 'Heal {v} HP and gain {v2} Luck. It says: you will grab something soon.' },
    { id: 'double_or_nothing', name: 'Double or Nothing', rarity: 'u', cost: 60, char: 'gambler',
      tags: ['metal'], shape: circle(12), density: 2.2, friction: 0.3, restitution: 0.3,
      color: '#e6ebf0', color2: '#2a2a3a', art: 'coin',
      fx: [random(0, 20)], plus: { fx: [random(0, 26)] },
      text: 'Flip it: deal {min} to {max} damage. With Luck it flips twice and keeps the best.' },
    { id: 'lucky_horseshoe', name: 'Lucky Horseshoe', rarity: 'u', cost: 60, char: 'gambler',
      tags: ['metal', 'heavy'], shape: poly([[-15, -14], [15, -14], [16, 4], [8, 15], [-8, 15], [-16, 4]]), density: 2.0, friction: 0.5,
      color: '#aab3bd', color2: '#ffc94d', art: 'horseshoe', target: 'self',
      fx: [block(6), status('luck', 2, 'self')], plus: { fx: [block(9), status('luck', 2, 'self')] },
      text: 'Gain {v} Block and {v2} Luck. Points up, so the luck stays in.' },
    { id: 'marked_deck', name: 'Marked Deck', rarity: 'u', cost: 65, char: 'gambler',
      tags: ['tool'], shape: box(26, 34), density: 0.9, friction: 0.55,
      color: '#3b6fd6', color2: '#ffffff', art: 'card', target: 'none',
      fx: [grab(1), status('luck', 1, 'self')], plus: { fx: [grab(1), status('luck', 2, 'self')] },
      text: 'Gain {v} extra grab this turn and {v2} Luck. Every card is the ace of spades.' },
    { id: 'one_armed_bandit', name: 'One-Armed Bandit', rarity: 'r', cost: 100, char: 'gambler',
      tags: ['metal', 'heavy'], shape: box(30, 40), density: 2.0, friction: 0.55,
      color: '#ff2e4a', color2: '#ffc94d', art: 'slot',
      fx: [dmg(4), dmgPer(3, 'luck')], plus: { fx: [dmg(6), dmgPer(4, 'luck')] },
      text: 'Pull the lever: deal {v} damage, plus {v2} for each Luck you hold. The Luck stays put.' },
    { id: 'roulette_wheel', name: 'Roulette Wheel', rarity: 'r', cost: 95, char: 'gambler',
      tags: ['heavy'], shape: circle(18), density: 1.6, friction: 0.35, restitution: 0.15,
      color: '#1a1224', color2: '#ff2e4a', art: 'chip',
      fx: [random(1, 36)], plus: { fx: [random(6, 36)] },
      text: 'Spin it: deal {min} to {max} damage. No zero on this wheel. Probably.' },
    { id: 'golden_dice', name: 'Golden Dice', rarity: 'l', cost: 130, char: 'gambler',
      tags: ['metal', 'heavy'], shape: box(26, 26), density: 2.2, friction: 0.4, restitution: 0.25,
      color: '#ffc94d', color2: '#12091f', art: 'dice', target: 'all',
      fx: [{ k: 'random', v: 9, min: 4, max: 14, n: 2 }, status('luck', 2, 'self')],
      plus: { fx: [{ k: 'random', v: 11, min: 6, max: 16, n: 2 }, status('luck', 3, 'self')] },
      text: 'Roll twice: deal {min} to {max} damage to ALL enemies each time, then gain {v2} Luck. Solid gold, never loaded.' },
    // Bait: good to be eaten. Gulpers go for the lure first; a Poison Pill
    // or a Hot Potato hurts whoever swallows it (COMBAT reads def.eaten).
    { id: 'poison_pill', name: 'Poison Pill', rarity: 'c', cost: 45,
      tags: ['potion'], shape: box(26, 12), density: 0.7, friction: 0.4,
      color: '#a6ff5e', color2: '#ff2e88', art: 'pill', lure: 40, eaten: { dmg: 6, status: { poison: 8 } },
      fx: [status('poison', 4)], plus: { fx: [status('poison', 6)], eaten: { dmg: 9, status: { poison: 10 } } },
      text: 'Apply {v} Poison. Monsters cannot resist it: whoever swallows it takes 6 damage and 8 Poison.' },
    { id: 'hot_potato', name: 'Hot Potato', rarity: 'u', cost: 60,
      tags: ['food'], shape: poly([[-17, -3], [-11, -10], [4, -11], [15, -6], [17, 3], [9, 10], [-8, 10], [-16, 5]]), density: 1.0, friction: 0.5,
      color: '#c98a4a', color2: '#ff5a2e', art: 'potato', hot: 2, lure: 25, eaten: { status: { burn: 10 } },
      fx: [dmg(10), status('burn', 2)], plus: { fx: [dmg(14), status('burn', 3)] },
      text: 'Deal {v} damage and apply {v2} Burn. Too hot to keep: in your bin at the end of your turn it gives you 2 Burn. Swallowed, 10 Burn.' },
    { id: 'crystal_dice', name: 'Crystal Dice', rarity: 'u', cost: 55,
      tags: ['glass'], shape: box(22, 22), density: 1.1, friction: 0.25, restitution: 0.2,
      color: '#bfefff', color2: '#7a5aff', art: 'dice',
      fx: [random(3, 12)], plus: { fx: [random(5, 14)] },
      text: 'Deal {min} to {max} damage. Glass: land it hard and it cracks for half again.' },
    { id: 'floating_token', name: 'Floating Token', rarity: 'u', cost: 55,
      tags: ['metal', 'magic'], shape: circle(11), density: 0.9, friction: 0.35, restitution: 0.15,
      color: '#b08cff', color2: '#ffe066', art: 'coin', target: 'self',
      fx: [dmg(4), status('luck', 1, 'self'), gold(1)], plus: { fx: [dmg(6), status('luck', 1, 'self'), gold(2)] },
      text: 'Deal {v} damage, gain {v2} Luck and {v3} gold. It floats on top of the pile, and magnets love it.' },
    { id: 'firecracker', name: 'Firecracker', rarity: 'c', cost: 45,
      tags: ['weapon', 'light'], shape: circle(13), density: 0.8, friction: 0.5, restitution: 0.2,
      color: '#ff2e4a', color2: '#ffe066', art: 'bomb', target: 'all',
      fx: [dmg(3), status('burn', 1, 'all')], plus: { fx: [dmg(5), status('burn', 2, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. Slam it into the pile and its fuse catches.' },
    { id: 'lucky_clover', name: 'Lucky Clover', rarity: 'c', cost: 15,
      tags: ['small', 'light'], shape: circle(9), density: 0.5, friction: 0.5, restitution: 0.15,
      color: '#3ddc84', color2: '#1a6b3a', art: 'clover', target: 'self',
      fx: [status('luck', 1, 'self')], plus: { fx: [status('luck', 2, 'self')] },
      text: 'Gain {v} Luck. Four leaves, no waiting.' },

    // ---- CR8 (round 8, DESIGN.md "Mama Mech and two new claws"): Mama Mech's
    // workshop. Every metal item she delivers is a part for the turret on
    // her cabinet (COMBAT's CR8 block); `part` says how many parts an item
    // is worth instead of one. ----
    { id: 'hex_bolt', name: 'Hex Bolt', rarity: 'c', cost: 40, char: 'engineer', starter: true,
      tags: ['metal', 'weapon'], shape: box(28, 12), density: 1.6, friction: 0.45, restitution: 0.12,
      color: '#aab3bd', color2: '#5a6068', art: 'key',
      fx: [dmg(4)], plus: { fx: [dmg(6)] },
      text: 'Deal {v} damage. A turret part: it goes up on the cabinet after it hits.' },
    { id: 'tin_plate', name: 'Tin Plate', rarity: 'c', cost: 40, char: 'engineer', starter: true,
      tags: ['metal'], shape: box(32, 10), density: 1.4, friction: 0.35, restitution: 0.1,
      color: '#c9d3e0', color2: '#ff8a2e', art: 'buckler', target: 'self',
      fx: [block(5)], plus: { fx: [block(7)] },
      text: 'Gain {v} Block. A turret part. Flat, so it slides out of a lazy grip.' },
    { id: 'pipe_wrench', name: 'Pipe Wrench', rarity: 'c', cost: 50, char: 'engineer', part: 2,
      tags: ['metal', 'weapon', 'tool', 'heavy'], shape: box(44, 14), density: 1.8, friction: 0.5,
      color: '#d8343a', color2: '#8e98a8', art: 'hammer',
      fx: [dmg(7)], plus: { fx: [dmg(10)] },
      text: 'Deal {v} damage. Counts as 2 turret parts.' },
    { id: 'spring_coil', name: 'Spring Coil', rarity: 'c', cost: 45, char: 'engineer',
      tags: ['metal'], shape: circle(12), density: 1.1, friction: 0.4, restitution: 0.55,
      color: '#ffc94d', color2: '#8a5a12', art: 'ring',
      fx: [dmg(3, 2)], plus: { fx: [dmg(4, 2)] },
      text: 'Deal {v} damage twice. Boing. A turret part.' },
    { id: 'oil_can', name: 'Oil Can', rarity: 'c', cost: 45, char: 'engineer',
      tags: ['metal', 'tool'], shape: box(22, 28), density: 1.2, friction: 0.5,
      color: '#2e9e5a', color2: '#ffc94d', art: 'lantern', target: 'self',
      fx: [heal(3), cleanse()], plus: { fx: [heal(5), cleanse()] },
      text: 'Heal {v} HP and oil every debuff away. A turret part.' },
    { id: 'rivet_gun', name: 'Rivet Gun', rarity: 'u', cost: 70, char: 'engineer',
      tags: ['metal', 'weapon', 'tool'], shape: box(38, 22), density: 1.5, friction: 0.5,
      color: '#ff8a2e', color2: '#3a3f4a', art: 'horn',
      fx: [dmg(3, 3)], plus: { fx: [dmg(4, 3)] },
      text: 'Fire {v} damage three times. Pop, pop, pop.' },
    { id: 'toolbox', name: 'Toolbox', rarity: 'u', cost: 65, char: 'engineer', part: 3,
      tags: ['metal', 'heavy', 'tool'], shape: box(38, 26), density: 2.0, friction: 0.55,
      color: '#d8343a', color2: '#ffc94d', art: 'book', target: 'self',
      fx: [block(6)], plus: { fx: [block(9)] },
      text: 'Gain {v} Block. Full of spare parts: counts as 3 turret parts.' },
    { id: 'tesla_coil', name: 'Tesla Coil', rarity: 'r', cost: 100, char: 'engineer',
      tags: ['metal', 'magic'], shape: box(20, 42), density: 1.3, friction: 0.5,
      color: '#2ee6d6', color2: '#b08cff', art: 'wand', target: 'all',
      fx: [dmg(5), status('weak', 1, 'all')], plus: { fx: [dmg(7), status('weak', 2, 'all')] },
      text: 'Zap ALL enemies for {v} damage and {v2} Weak. It hums in the bin.' },
    { id: 'mech_arm', name: 'Mech Arm', rarity: 'r', cost: 110, char: 'engineer',
      tags: ['metal', 'heavy', 'weapon'], shape: box(52, 16), density: 1.9, friction: 0.55,
      color: '#8e98a8', color2: '#ff8a2e', art: 'sword',
      fx: [dmgPer(2, 'metal')], plus: { fx: [dmgPer(3, 'metal')] },
      text: 'Deal {v} damage for every metal item in the cabinet. Hydraulic.' },
    { id: 'mech_core', name: 'Mech Core', rarity: 'l', cost: 140, char: 'engineer', part: 6,
      tags: ['metal', 'magic', 'heavy'], shape: circle(17), density: 1.8, friction: 0.45, restitution: 0.15,
      color: '#ff8a2e', color2: '#2ee6d6', art: 'orb', target: 'all',
      fx: [dmg(8)], plus: { fx: [dmg(12)] },
      text: 'Deal {v} damage to ALL enemies. Its reactor counts as 6 turret parts.' },

    // ---- ROS (round 10, DESIGN.md "Ms. Bubbles, the mutator pack and three
    // pets"): Ms. Bubbles' bath kit. `soap` is how many bubbles an item blows
    // into the cabinet when it is played (COMBAT's ROS block, the game floats them). ----
    { id: 'rubber_duck', name: 'Rubber Duck', rarity: 'c', cost: 40, char: 'bubbler', starter: true,
      tags: ['light'], shape: circle(13), density: 0.5, friction: 0.5, restitution: 0.32,
      color: '#ffd23f', color2: '#ff8a2e', art: 'horn',
      fx: [dmg(4)], plus: { fx: [dmg(6)] },
      text: 'Deal {v} damage. Squeak. Light enough to float on anything.' },
    { id: 'soap_bar', name: 'Soap Bar', rarity: 'c', cost: 40, char: 'bubbler', starter: true,
      tags: [], shape: box(30, 16), density: 0.9, friction: 0.12, restitution: 0.1,
      color: '#ffb3de', color2: '#ffffff', art: 'bread', target: 'self',
      fx: [block(5)], plus: { fx: [block(7)] },
      text: 'Gain {v} Block. It squirts out of a lazy grip. In a bubble it cannot.' },
    { id: 'bubble_pipe', name: 'Bubble Pipe', rarity: 'c', cost: 45, char: 'bubbler', soap: 1,
      tags: ['light'], shape: box(36, 12), density: 0.7, friction: 0.5,
      color: '#b0763a', color2: '#bfefff', art: 'horn',
      fx: [dmg(5)], plus: { fx: [dmg(7)] },
      text: 'Deal {v} damage and blow a bubble into the cabinet.' },
    { id: 'sponge', name: 'Sponge', rarity: 'c', cost: 45, char: 'bubbler',
      tags: ['light'], shape: box(26, 20), density: 0.4, friction: 0.9, restitution: 0.2,
      color: '#ffe066', color2: '#3ddc84', art: 'bread', target: 'self',
      fx: [heal(3), block(2)], plus: { fx: [heal(5), block(3)] },
      text: 'Heal {v} HP and gain {v2} Block. Soaks up the hits.' },
    { id: 'scrub_brush', name: 'Scrub Brush', rarity: 'c', cost: 50, char: 'bubbler',
      tags: ['weapon', 'tool'], shape: box(40, 14), density: 1.1, friction: 0.6,
      color: '#8a5a2b', color2: '#ffe9a8', art: 'hammer',
      fx: [dmg(6)], plus: { fx: [dmg(9)] },
      text: 'Deal {v} damage. Scrubs the grin right off.' },
    { id: 'bath_bomb', name: 'Bath Bomb', rarity: 'u', cost: 70, char: 'bubbler', soap: 2,
      tags: ['light', 'magic'], shape: circle(14), density: 0.8, friction: 0.5, restitution: 0.15,
      color: '#ff9ad0', color2: '#8dfff5', art: 'gem', target: 'all',
      fx: [dmg(4), status('weak', 1, 'all')], plus: { fx: [dmg(6), status('weak', 2, 'all')] },
      text: 'Fizz: {v} damage and {v2} Weak to ALL enemies, and two bubbles float up.' },
    { id: 'foam_cannon', name: 'Foam Cannon', rarity: 'u', cost: 75, char: 'bubbler', soap: 1,
      tags: ['weapon', 'tool'], shape: box(42, 20), density: 1.2, friction: 0.5,
      color: '#2ee6d6', color2: '#ffffff', art: 'horn',
      fx: [dmg(3, 3)], plus: { fx: [dmg(4, 3)] },
      text: 'Spray {v} damage three times and blow a bubble.' },
    { id: 'loofah', name: 'Loofah', rarity: 'u', cost: 65, char: 'bubbler',
      tags: ['light', 'food'], shape: box(34, 16), density: 0.5, friction: 0.8,
      color: '#e9d8a6', color2: '#b08a4a', art: 'bread',
      fx: [lifesteal(5)], plus: { fx: [lifesteal(7)] },
      text: 'Deal {v} damage and heal as much. Exfoliating.' },
    { id: 'bubble_bath', name: 'Bubble Bath', rarity: 'r', cost: 100, char: 'bubbler', soap: 2,
      tags: ['potion'], shape: box(22, 40), density: 1.1, friction: 0.45,
      color: '#8dfff5', color2: '#ff9ad0', art: 'bottle', target: 'self',
      fx: [block(10)], plus: { fx: [block(14)] },
      text: 'Gain {v} Block and pour two bubbles into the cabinet.' },
    { id: 'golden_duck', name: 'Golden Duck', rarity: 'l', cost: 140, char: 'bubbler', soap: 3,
      tags: ['light', 'magic'], shape: circle(16), density: 0.6, friction: 0.5, restitution: 0.3,
      color: '#ffc94d', color2: '#fff6c0', art: 'star', target: 'all',
      fx: [dmg(9)], plus: { fx: [dmg(13)] },
      text: 'Deal {v} damage to ALL enemies and blow three bubbles. Pure gold, still squeaks.' },
    // ---- TECH (round 17, DESIGN.md "Cabinet Tech and the new crawler (round 17)"): Joy Stick's
    // arcade parts. `lamp` is how many more cells of the Jackpot Lamp an item lights when it is
    // delivered (game.js TECH block; for anyone who holds it). An item with `lamp` wears the Tech chip. ----
    { id: 'arcade_stick', name: 'Arcade Stick', rarity: 'c', cost: 40, char: 'techie', starter: true, lamp: 1,
      tags: ['weapon'], shape: box(20, 34), density: 0.9, friction: 0.5, restitution: 0.15,
      color: '#ff2e88', color2: '#1a1030', art: 'wand',
      fx: [dmg(4)], plus: { fx: [dmg(6)] },
      text: 'Deal {v} damage. Delivered, it lights a cell of the Jackpot Lamp.' },
    { id: 'arcade_button', name: 'Arcade Button', rarity: 'c', cost: 40, char: 'techie', starter: true, lamp: 1,
      tags: [], shape: box(26, 18), density: 1, friction: 0.45, restitution: 0.1,
      color: '#ff4a4a', color2: '#1a1030', art: 'orb', target: 'self',
      fx: [block(5)], plus: { fx: [block(7)] },
      text: 'Gain {v} Block. Press it: a lamp cell lights up.' },
    { id: 'coin_mech', name: 'Coin Mech', rarity: 'c', cost: 45, char: 'techie', kw: ['tech'],
      tags: ['metal'], shape: box(24, 30), density: 1.6, friction: 0.45, restitution: 0.1,
      color: '#aab3bd', color2: '#ffc94d', art: 'coin',
      fx: [dmg(4), gold(2)], plus: { fx: [dmg(6), gold(3)] },
      text: 'Deal {v} damage and gain {v2} gold. The coin door off an old cabinet: clunk, clunk.' },
    { id: 'neon_tube', name: 'Neon Tube', rarity: 'c', cost: 50, char: 'techie', lamp: 2,
      tags: ['glass', 'light'], shape: box(40, 10), density: 0.6, friction: 0.4, restitution: 0.2,
      color: '#ff7ad9', color2: '#ffffff', art: 'wand',
      fx: [dmg(7)], plus: { fx: [dmg(10)] },
      text: 'Deal {v} damage. Delivered, it lights 2 lamp cells. Fragile, like every good sign.' },
    { id: 'circuit_board', name: 'Circuit Board', rarity: 'u', cost: 70, char: 'techie', lamp: 1,
      tags: ['metal', 'magic'], shape: box(34, 24), density: 1, friction: 0.5, restitution: 0.1,
      color: '#2e9d5a', color2: '#ffc94d', art: 'book', target: 'all',
      fx: [dmg(5)], plus: { fx: [dmg(7)] },
      text: 'Deal {v} damage to ALL enemies. Delivered, it lights a lamp cell.' },
    { id: 'extension_cord', name: 'Extension Cord', rarity: 'u', cost: 70, char: 'techie', lamp: 1,
      tags: ['tool'], shape: box(40, 14), density: 0.9, friction: 0.7, restitution: 0.1,
      color: '#ff8a2e', color2: '#2a2a3a', art: 'chain', target: 'none',
      fx: [grab(1), block(3)], plus: { fx: [grab(1), block(6)] },
      text: 'Gain {v} extra grab and {v2} Block. Plugged in, a lamp cell lights up.' },
    { id: 'crt_monitor', name: 'CRT Monitor', rarity: 'r', cost: 100, char: 'techie', lamp: 3,
      tags: ['heavy', 'glass'], shape: box(38, 34), density: 1.7, friction: 0.55, restitution: 0.05,
      color: '#3a3f4a', color2: '#2ee6d6', art: 'slot',
      fx: [dmg(14)], plus: { fx: [dmg(19)] },
      text: 'Deal {v} damage. Heavy as sin. Delivered, it lights 3 lamp cells.' },
    { id: 'golden_stick', name: 'Golden Joystick', rarity: 'l', cost: 140, char: 'techie', lamp: 4,
      tags: ['weapon', 'magic'], shape: box(22, 38), density: 1, friction: 0.5, restitution: 0.2,
      color: '#ffc94d', color2: '#fff6c0', art: 'star', target: 'random',
      fx: [dmg(6, 3)], plus: { fx: [dmg(8, 3)] },
      text: 'Strike {v} damage {n} times at random enemies and light 4 lamp cells. High score material.' },

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
    // Round 3: Lucky Lou's meter (any crawler can hold it). Never decays.
    ['luck', 'Luck', '🍀', '#3ddc84', 'buff', 'count', 'Dice roll twice and keep the best. A grab of 2+ items cashes it all out: 2 damage per Luck to ALL enemies (max 10).'],
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
    // (BALANCE round 12: with the harder difficulty dial Ironjaw one-shot a full-hp crawler; hp 136-148 -> 88-98,
    // Bite 22 -> 11, Gape 46 -> 20, Thorns 4 -> 2 (4 per hit bit a many-prize drop for 40): still the act 2
    // wall, now one you can block) (round 16: hp 88-98 -> 80-90, still the top act 2 killer)
    { id: 'ironjaw', name: 'Ironjaw', act: 2, tier: 'elite', hp: [80, 90], art: 'ironjaw', size: 1.2, color: '#7d8590',
      desc: 'A bear trap that learned to walk. And swallow. Metal goes down easiest.', ai: 'cycle', pattern: [0, 1, 2, 3, 0],
      taunt: 'CLANK. CLANK. CHOMP.',
      status: { thorns: 2 },
      enrage: { name: 'LOCKJAW', text: 'The springs wind all the way tight', str: 3, pattern: [1, 0, 1, 3, 0] },
      moves: [atk('bite', 'Bite', 11, 1, 'Bites for 11'), gulp('swallow', 'Swallow', 1, 'metal', 'Swallows a metal item from your bin'),
        buff('clench', 'Clench', 'armor', 1, 'Clenches (+1 Armor)'), mv('gape', 'Gape', 'charge', 'Opens wide (20 next turn)', { v: 20 })] },
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

    // ================= BESTIARY (round 4): they play with the machine itself =====
    // New move kinds (combat.js BESTIARY block, staged by game.js):
    // tickle (the claw shakes on your drops next turn), glue (the pile is
    // sticky next turn: the claw lifts clumps), wheel (a prize wheel: a random
    // prize for it or for you), ceiling (metal floats up to the lid for a
    // turn, grabbable mid-air), bury (items go under the floor; the claw digs
    // the mound up), plow (the pile is shoved to the far wall), vanish (items
    // go invisible until the claw touches them) and the Claw Collector's
    // rival claw (def.rival: it grabs your rarest item every turn).
    { id: 'tickler', name: 'Tickle Monster', act: 1, tier: 'normal', hp: [22, 27], art: 'tickler', size: 0.95, color: '#ff8ad8', color2: '#7a3aa8',
      desc: 'Lives under the prize counter. Has eleven arms, all of them feathers.', ai: 'cycle', pattern: [0, 1, 2, 1],
      moves: [mv('tickle', 'Tickle Fingers', 'tickle', 'Tickles your claw: it wiggles on every drop next turn', { v: 1 }),
        atk('flurry', 'Feather Flurry', 2, 3, 'Feather flurry: 2 x3'), debuff('giggle', 'Giggle Fit', 'weak', 1, 'Gives you the giggles (Weak)')] },
    { id: 'jelly', name: 'Jelly Cube', act: 1, tier: 'normal', hp: [28, 34], art: 'jelly', size: 1, color: '#7af0c8', color2: '#2e9e8a',
      desc: 'A cube of lime gelatin. You can see a coin, a key and a very old sandwich inside.', ai: 'cycle', pattern: [0, 1, 3, 2, 1],
      moves: [mv('goo', 'Goo Coat', 'glue', 'Slimes your bin: items stick together next turn (the claw lifts clumps)', { v: 1 }),
        atk('slam', 'Jiggle Slam', 7, 1, 'Slams for 7'), mv('absorb', 'Absorb', 'junk', 'Spits out a Rock it absorbed', { item: 'rock', n: 1 }),
        blk('wobble', 'Wobble', 6, 'Wobbles defensively (Block 6)')] },
    { id: 'barker', name: 'Carnival Barker', act: 1, tier: 'elite', hp: [58, 64], art: 'barker', size: 1.1, color: '#ff2e88', color2: '#ffc94d',
      desc: 'Runs the prize wheel. The wheel has eight wedges. Most of them say BARKER.', ai: 'cycle', pattern: [0, 1, 3, 0, 2, 4, 5],
      taunt: 'Step right up! Every spin a winner! (The winner is me.)',
      enrage: { name: 'RIGGED WHEEL', text: 'Every wedge says BARKER now', str: 2, pattern: [0, 1, 0, 5] },
      moves: [mv('spin', 'Spin the Wheel', 'wheel', 'Spins the prize wheel: a prize for it... or for you'),
        atk('cane', 'Cane Rap', 10, 1, 'Raps you with its cane for 10'), atk('pitch', 'Sales Pitch', 4, 2, 'Sales pitch: 4 x2'),
        debuff('hype', 'Hype', 'vuln', 1, 'Hypes the crowd against you (Vulnerable)'),
        mv('ballyhoo', 'Ballyhoo', 'shake', 'Bangs on the cabinet. Your bin rattles.'),
        mv('bigtop', 'Big Top', 'charge', 'Raising the big top (18 next turn)', { v: 18 })] },
    { id: 'magbat', name: 'Magnet Bat', act: 2, tier: 'normal', hp: [40, 48], art: 'magbat', size: 0.9, color: '#d81f3a', color2: '#c9d3e0',
      desc: 'Roosts on the claw rail. Everything made of metal wants to roost with it.', ai: 'cycle', pattern: [0, 1, 3, 2, 1],
      moves: [mv('polar', 'Reverse Polarity', 'ceiling', 'Magnetizes the lid: your metal items float up for a turn (grab them mid-air)', { v: 1 }),
        atk('zap', 'Zap', 5, 2, 'Zaps 5 x2'), atk('dive', 'Iron Dive', 11, 1, 'Dives for 11'),
        buff('cling', 'Cling', 'armor', 1, 'Clings to scrap (+1 Armor)')] },
    { id: 'mole', name: 'Cinder Mole', act: 2, tier: 'normal', hp: [44, 52], art: 'mole', size: 0.95, color: '#8a5a3a', color2: '#ffb0c0',
      desc: 'Tunnels under the foundry floor. Takes souvenirs down with it.', ai: 'cycle', pattern: [0, 1, 3, 0, 2],
      moves: [mv('dig', 'Dig Under', 'bury', 'Digs an item under the floor (drop the claw on the mound to dig it up)', { n: 1 }),
        atk('claws', 'Digging Claws', 6, 2, 'Digging claws: 6 x2'), atk('pop', 'Pop Up', 12, 1, 'Pops up for 12'),
        blk('burrow', 'Burrow', 10, 'Burrows in (Block 10)')] },
    { id: 'dozer', name: 'The Bulldozer', act: 2, tier: 'elite', hp: [120, 132], art: 'dozer', size: 1.2, color: '#ffc94d', color2: '#3a3230',
      desc: 'Clears the lot every night. Tonight the lot is your bin.', ai: 'cycle', pattern: [0, 1, 2, 3, 0, 4],
      taunt: 'BEEP. BEEP. BEEP. Clearing the lot.',
      enrage: { name: 'NO BRAKES', text: 'The throttle snaps off', str: 3, pattern: [0, 1, 4, 0, 2] },
      moves: [mv('plow', 'Plow', 'plow', 'Plows your whole pile to the far wall, away from the chute'),
        atk('ram', 'Ram', 20, 1, 'Rams you for 20'), mv('dump', 'Dump Truck', 'junk', 'Dumps 2 Slag into your bin', { item: 'slag', n: 2 }),
        blk('grille', 'Grille Guard', 16, 'Lowers its grille (Block 16)'),
        mv('rev', 'Rev Up', 'charge', 'Revving up (40 next turn)', { v: 40 })] },
    { id: 'ghost', name: 'Peekaboo Ghost', act: 3, tier: 'normal', hp: [76, 88], art: 'ghost', size: 1, color: '#e8f4ff', color2: '#9fd8ff',
      desc: 'Haunts the prize shelf. Plays peekaboo with your stuff. It always wins.', ai: 'cycle', pattern: [0, 1, 2, 0, 3, 1],
      moves: [mv('vanish', 'Now You See It', 'vanish', 'Turns 3 of your items invisible until the claw touches them', { n: 3 }),
        atk('boo', 'BOO!', 18, 1, 'Boos you for 18'), debuff('spook', 'Spook', 'weak', 2, 'Spooks you (Weak 2)'),
        buff('fade', 'Fade', 'dodge', 1, 'Fades out (Dodge 1)')] },
    { id: 'collector', name: 'The Claw Collector', act: 3, tier: 'elite', hp: [176, 190], art: 'collector', size: 1.2, color: '#7a3aa8', color2: '#ffc94d',
      desc: 'Brought its own claw. Every turn it takes your rarest prize for its glass case.', ai: 'cycle', pattern: [0, 1, 3, 2, 4],
      taunt: 'Mint condition. Into the case you go.',
      rival: true, digest: 99, noAffix: ['greedy'],
      enrage: { name: 'RARE FIND', text: 'Its claw goes back for seconds', str: 2 },
      moves: [atk('cane', 'Swordcane', 24, 1, 'Swordcane for 24'), blk('case', 'Glass Case', 20, 'Steps into its glass case (Block 20)'),
        debuff('appraise', 'Appraise', 'vuln', 2, 'Appraises you (Vulnerable 2)'), atk('pins', 'Pin Flurry', 9, 3, 'Pin flurry: 9 x3'),
        mv('display', 'Grand Display', 'charge', 'Polishing its big claw (48 next turn)', { v: 48 })] },
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
      normal: [['rat', 'rat'], ['bat', 'bat'], ['gremlin'], ['slime'], ['tickler'], ['spider', 'rat'], ['goblin'],
        ['mushroom', 'bat'], ['jelly'], ['crab'], ['gremlin', 'rat'], ['tickler', 'bat'], ['trashpanda', 'rat'], ['gloop'], ['jelly', 'rat'], ['trashpanda', 'bat']],
      elite: [['mimic'], ['broodmother'], ['barker']],
      boss: [['hoard']],
    },
    2: {
      normal: [['drone', 'imp'], ['imp', 'imp'], ['magbat', 'imp'], ['clockwork'], ['tinker'], ['mole'], ['oilslick', 'drone'], ['tinknight'],
        ['golem'], ['magbat', 'drone'], ['clockwork', 'drone'], ['mole', 'imp'], ['scrapgoat'], ['rustmite', 'imp'], ['scrapgoat', 'rustmite']],
      elite: [['ironjaw'], ['lodestone'], ['dozer']],
      boss: [['smelter']],
    },
    3: {
      normal: [['wisp', 'wisp'], ['wraith'], ['ghost'], ['frostmage'], ['rimecap', 'wisp'], ['cultist'], ['icemimic'],
        ['wraith', 'wisp'], ['ghost', 'wisp'], ['yeti'], ['magpie', 'wisp'], ['magpie']],
      elite: [['frostknight'], ['highcultist'], ['collector']],
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
  // Round 3 helpers: Luck on the player, arcade tickets for the payout
  // (COMBAT.tickets banks them on F.stats.tix), the claw type in play, and a
  // die roll from the fight's own seeded rng.
  const luckUp = (F, v) => selfStatus(F, 'luck', v);
  const tix = (F, v) => { const c = CB(); if (c && c.tickets) c.tickets(F, v); };
  const clawIs = (F, type) => !!F && F.clawType === type;
  const d6 = (F) => 1 + Math.floor((typeof F.rng === 'function' ? F.rng() : 0.5) * 6);
  // CR8: feed Mama Mech's turret (a fight without one, or no COMBAT: nothing).
  const turParts = (F, v, label) => { const c = CB(); if (c && c.turretParts && F && F.tur) c.turretParts(F, v, label); };
  // TECH (round 17): Cabinet Tech's numbers (the game's TECH block reads the cabinet ones through
  // DATA.TECH.K). A live cabinet (F.tech.on, set by the game) has events, the lamp and PERFECT
  // grabs; a quiet one (Duo, a headless suite) has none, so the event relics ring every 2nd turn.
  const TECH_K = {
    remoteDmg: 3, remoteBlock: 3, quietEvery: 2,       // Service Remote (Joy Stick's starter)
    giftEvP: 0.22, giftFirst: 1, giftPerfLamp: 1,      // her gift: more events, from turn 1; a PERFECT lights 1 more cell
    laserX: 5, laserBlock: 3,                          // Laser Sight: the PERFECT window x2 (5 px more), Block a PERFECT
    keyEvP: 0.15, keyBlock: 5,                         // Service Key
    oilStart: 4, oilHeal: 3,                           // Lamp Oil
    hopperCoins: 3, hopperGold: 1,                     // Coin Hopper: coins more a shower and a fever, gold more a coin
    metroDmg: 4, metroMax: 16,                         // Metronome: 4 per PERFECT in the streak
    feverDmg: 8, feverBlock: 4,                        // Fever Dream
    breakZap: 6, breakBlock: 6, breakHeal: 5,          // Circuit Breaker: a surge, a coin shower, a capsule drop
    dblEvP: 0.08,                                      // Double Feature: a little more often too
    mbDmg: 15, mbPerfLamp: 2, mbDrain: 3,              // The Motherboard (legendary)
  };
  const techLive = (F) => !!(F && F.tech && F.tech.on);
  // A quiet cabinet's turn for the event relics: every 2nd turn from turn 2.
  const techQuiet = (F) => !!F && !techLive(F) && (F.turn | 0) >= 2 && (F.turn | 0) % TECH_K.quietEvery === 0;

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
    // Lucky Lou's: the first whiff of a turn is a dice roll.
    { id: 'snake_eyes', name: 'Snake Eyes', icon: '🐍', rarity: 'event', kw: ['luck'], proc: 'ROLL', starter: true,
      text: 'The first grab each turn that brings up nothing rolls two dice: a random enemy takes the total. Doubles give the grab back.',
      hooks: {
        onGrab(F, n) {
          if (n || !CB()) return;
          const m = mem(F);
          if (m.snake === F.turn) return;
          m.snake = F.turn;
          const a = d6(F), b = d6(F);
          proc(F, 'snake_eyes', (a === b ? (a === 1 ? 'SNAKE EYES! ' : 'DOUBLES! ') : 'ROLL ') + a + '+' + b);
          zap(F, randomFoe(F), a + b);
          if (a === b) moreGrabs(F, 1);
        },
      } },
    // Mama Mech's (CR8): the turret starts half built, and junk is scrap for it.
    { id: 'socket_set', name: 'Socket Set', icon: '🔧', rarity: 'event', kw: ['metal'], proc: 'SOCKET SET', starter: true,
      text: 'Start each fight with 2 turret parts (Lv 1) and 3 Block. Junk you grab out is a turret part too.',
      hooks: {
        onFightStart(F) { turParts(F, 2, 'SOCKET SET'); gainBlock(F, 3); },
        onPlay(F, inst, def) { if (isJunkPlay(inst, def)) turParts(F, 1, 'SCRAP'); },
      } },
    // Ms. Bubbles' (ROS, round 10): one more bubble on the opening turn, and pops give Block.
    // `bub` is read by COMBAT's ROS block: {n: bubbles a turn, first: more on turn 1,
    // block / dmg: per bubble popped in the chute, combo: per bubble of a Bubble Combo, bin: per bubble that bursts in the bin}.
    { id: 'bubble_wand', name: 'Bubble Wand', icon: '\u{1F9FC}', rarity: 'event', kw: ['fortress'], proc: 'BUBBLE WAND', starter: true,
      text: 'Start each fight with 2 Block and one more bubble. Every bubble you pop in the chute gives 2 Block.',
      bub: { first: 1, block: 2 }, hooks: { onFightStart(F) { gainBlock(F, 2); } } },
    // Joy Stick's (TECH, round 17): the cabinet's events pay out. `onCab(F, kind, v, id)` is the
    // cabinet hook (COMBAT.techCab, fired by the game's TECH block: 'event' id, 'perfect' n, 'fever' n,
    // 'double' id). A quiet cabinet (Duo, where it has no events) rings the remote every 2nd turn.
    { id: 'service_remote', name: 'Service Remote', icon: '\u{1F4DF}', rarity: 'event', kw: ['tech'], proc: 'REMOTE', starter: true,
      text: 'Every cabinet event that lands zaps ALL enemies for 3 and gives you 3 Block. When the cabinet is quiet (Duo), it rings every 2nd turn instead.',
      hooks: {
        onCab(F, kind) { if (kind === 'event') { zapAll(F, TECH_K.remoteDmg); gainBlock(F, TECH_K.remoteBlock); } },
        onTurnStart(F) { if (techQuiet(F)) { proc(F, 'service_remote', 'REMOTE'); zapAll(F, TECH_K.remoteDmg); gainBlock(F, TECH_K.remoteBlock); } },
      } },

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

    // ---- Round 3 (DESIGN.md "Lucky Lou and the synergy pass"): the Luck
    // build, tickets and capsules, hungry monsters, cabinet materials and
    // the claw types. ----
    // Luck
    { id: 'pity_timer', name: 'Pity Timer', icon: '⏳', rarity: 'c', kw: ['luck'], proc: 'PITY',
      text: 'Whenever a grab brings up nothing, gain 1 Luck. The machine feels bad for you.',
      hooks: { onGrab(F, n) { if (!n) luckUp(F, 1); } } },
    { id: 'dealers_visor', name: "Dealer's Visor", icon: '🧢', rarity: 'c', kw: ['luck'], proc: 'HOUSE RULES',
      text: 'Start each fight with 3 Luck. The house never starts empty.',
      hooks: { onFightStart(F) { luckUp(F, 3); } } },
    { id: 'lucky_ticket', name: 'Lucky Ticket', icon: '🧧', rarity: 'c', kw: ['luck', 'fortress'], proc: 'PAYOUT',
      text: 'Whenever you cash out Luck, gain that much Block and print a ticket for every 2 Luck.',
      hooks: { onCashOut(F, luck) { gainBlock(F, luck); tix(F, Math.ceil(luck / 2)); } } },
    { id: 'lucky_cat', name: 'Lucky Cat', icon: '🐱', rarity: 'u', kw: ['luck', 'greed'], proc: 'MANEKI',
      text: 'Whenever you cash out Luck, gain that much gold. It waves at every customer.',
      hooks: { onCashOut(F, luck) { gainGold(F, luck); } } },
    { id: 'wheel_of_fortune', name: 'Wheel of Fortune', icon: '🎡', rarity: 'r', kw: ['luck', 'jackpot'],
      text: 'At the start of each turn the wheel spins: 5 Block, 4 damage to ALL enemies, 2 Luck, or (rarely) an extra grab.',
      hooks: {
        onTurnStart(F) {
          if (!CB()) return;
          const r = typeof F.rng === 'function' ? F.rng() : 0.5;
          if (r < 0.3) { proc(F, 'wheel_of_fortune', 'WHEEL: BLOCK'); gainBlock(F, 5); }
          else if (r < 0.6) { proc(F, 'wheel_of_fortune', 'WHEEL: ZAP'); zapAll(F, 4); }
          else if (r < 0.88) { proc(F, 'wheel_of_fortune', 'WHEEL: LUCK'); luckUp(F, 2); }
          else { proc(F, 'wheel_of_fortune', 'WHEEL: JACKPOT'); moreGrabs(F, 1); }
        },
      } },
    { id: 'rabbits_foot', name: "Rabbit's Foot", icon: '🐇', rarity: 'r', kw: ['luck'], proc: 'LUCKY FOOT',
      text: 'Your empty grabs give 2 Luck and near misses 1, like Lucky Lou. Lucky Lou gets double.',
      rules: { luck: 1 } },
    { id: 'high_roller', name: 'High Roller', icon: '💎', rarity: 'r', kw: ['luck'], proc: 'HIGH ROLLER',
      text: 'Cash outs deal 3 damage per Luck instead of 2. Bet big.',
      rules: { cashAmp: 1 } },
    // Tickets and capsules
    { id: 'ticket_roll', name: 'Ticket Roll', icon: '🧾', rarity: 'c', kw: ['jackpot'], proc: 'TICKETS',
      text: 'Every grab combo prints 2 extra arcade tickets.',
      hooks: { onCombo(F) { tix(F, 2); } } },
    { id: 'gacha_charm', name: 'Gacha Charm', icon: '💊', rarity: 'u', kw: ['jackpot'], proc: 'GACHA',
      text: 'Prize capsules upgrade 20% more often as they open. Every jackpot prints 2 tickets.',
      loot: { capUp: 0.2 }, hooks: { onJackpot(F) { tix(F, 2); } } },
    // Hungry monsters
    { id: 'heartburn', name: 'Heartburn', icon: '🌶', rarity: 'u', kw: ['burn', 'poison'], proc: 'HEARTBURN',
      text: 'Whenever an enemy swallows one of your items, it gains 4 Burn and 2 Poison.',
      hooks: { onEat(F, e) { foeStatus(F, e, 'burn', 4); foeStatus(F, e, 'poison', 2); } } },
    // Cabinet materials
    { id: 'broken_mirror', name: 'Broken Mirror', icon: '🪞', rarity: 'c', kw: ['glass', 'luck'], proc: 'SEVEN YEARS',
      text: 'Whenever a glass item cracks or shatters, gain 1 Luck. Seven years of good luck.',
      hooks: {
        onMaterial(F, kind) { if (kind === 'crack') luckUp(F, 1); },
        onShatter(F) { luckUp(F, 1); },
      } },
    { id: 'blasting_cap', name: 'Blasting Cap', icon: '🧨', rarity: 'u', kw: ['burn', 'fortress'], proc: 'BLAST CAP',
      text: 'Whenever a bomb goes off in your bin, every enemy gains 3 Burn and you gain 5 Block. Lighting a fuse gives 2 Block.',
      hooks: {
        onMaterial(F, kind) {
          if (kind === 'blast') { allStatus(F, 'burn', 3); gainBlock(F, 5); }
          else if (kind === 'fuse') gainBlock(F, 2);
        },
      } },
    // Claw types (useful with any claw, better with their own)
    { id: 'lodestone', name: 'Lodestone', icon: '🪨', rarity: 'u', kw: ['metal', 'fortress'], proc: 'LODESTONE',
      text: 'A grab with 2+ metal items gives 3 Block per metal item. Magnet Crane: from 1, and it zaps ALL for 2 each.',
      hooks: {
        onGrab(F) {
          const m = grabDefs(F).filter(d => tagged(d, 'metal')).length;
          const mag = clawIs(F, 'magnet');
          if (m < (mag ? 1 : 2)) return;
          gainBlock(F, 3 * m);
          if (mag) zapAll(F, 2 * m);
        },
      } },
    { id: 'sand_pail', name: 'Sand Pail', icon: '🪣', rarity: 'u', kw: ['swarm', 'jackpot'], proc: 'SCOOPED',
      text: 'A grab of 3+ items deals 3 damage per item to a random enemy. The Scoop counts from 2 items.',
      hooks: {
        onJackpot(F, n) { zap(F, randomFoe(F), 3 * (n | 0)); },
        onGrab(F, n) { if (n === 2 && clawIs(F, 'scoop')) zap(F, randomFoe(F), 6); },
      } },
    { id: 'big_catch', name: 'Big Catch', icon: '🎣', rarity: 'u', kw: ['brawler'], proc: 'BIG CATCH',
      text: 'The first item you deliver each turn deals 4 more damage to the targeted enemy. Harpoon: 8.',
      hooks: {
        onPlay(F) {
          const m = mem(F);
          if (m.catch === F.turn || !CB()) return;
          m.catch = F.turn;
          zap(F, focus(F), clawIs(F, 'hook') ? 8 : 4);
        },
      } },

    // ---- Round 6 (DESIGN.md "Sets, boons and the Compactor"): The Hungry
    // Pack, three pet relics. `pet` is read by the game's pet code (xp after
    // a won fight, extra tricks a turn); onPet(F, petId) fires on every trick.
    { id: 'chew_toy', name: 'Chew Toy', icon: '🦴', rarity: 'c', kw: ['fortress'], proc: 'CHEW',
      text: 'Start each fight with 3 Block. Your pet gains 2 more xp for every fight you win.',
      pet: { xp: 2 }, hooks: { onFightStart(F) { gainBlock(F, 3); } } },
    { id: 'treat_jar', name: 'Treat Jar', icon: '🍪', rarity: 'u', kw: ['feast'], proc: 'GOOD PET',
      text: 'Whenever your pet does a trick in a fight, heal 2 HP and gain 2 Block.',
      hooks: { onPet(F) { healP(F, 2); gainBlock(F, 2); } } },
    { id: 'dog_whistle', name: 'Dog Whistle', icon: '🦮', rarity: 'r', kw: ['brawler'], proc: 'SIC EM',
      text: 'Your pet does one more trick every turn, and every trick deals 3 damage to the targeted enemy.',
      pet: { uses: 1 }, hooks: { onPet(F) { zap(F, focus(F), 3); } } },

    // ---- CR8 (round 8): the turret build. rules.turret builds Mama Mech's
    // turret for any crawler (and gives her 3 more parts at the bell); a
    // relic's `tur: {amp}` adds damage to every turret shot (COMBAT's CR8 block).
    { id: 'blueprints', name: 'Blueprints', icon: '📐', rarity: 'r', kw: ['metal'], proc: 'BLUEPRINTS',
      text: "Any crawler builds Mama Mech's turret on the cabinet: every metal item delivered is a part. Mama starts each fight with 3 more parts.",
      rules: { turret: 1 } },
    { id: 'armor_piercing', name: 'Armor-Piercing Rounds', icon: '🎯', rarity: 'u', kw: ['metal', 'brawler'], proc: 'AP ROUNDS',
      text: 'Every turret shot deals 2 more damage. No turret: every grab that brings up 2+ metal items deals 3 damage to the targeted enemy.',
      tur: { amp: 2 }, hooks: { onGrab(F) { if (!F.tur && grabDefs(F).filter(d => tagged(d, 'metal')).length >= 2) zap(F, focus(F), 3); } } },
    { id: 'grease_gun', name: 'Grease Gun', icon: '🛢', rarity: 'c', kw: ['metal', 'fortress'], proc: 'GREASED',
      text: 'At the end of your turn, gain 2 Block per turret level. No turret: gain 2 Block per metal item delivered this turn (up to 6).',
      hooks: {
        onPlay(F, inst, def) { if (tagged(def, 'metal')) { const m = mem(F); if (m.gg !== F.turn) { m.gg = F.turn; m.ggN = 0; } m.ggN++; } },
        onTurnEnd(F) {
          const lv = F.tur ? F.tur.lv | 0 : 0, m = mem(F);
          const v = lv > 0 ? 2 * lv : m.gg === F.turn ? Math.min(6, 2 * (m.ggN | 0)) : 0;
          if (v > 0) gainBlock(F, v);
        },
      } },

    // ---- ROS (round 10): the bubble build. rules.bubbles blows Ms. Bubbles'
    // bubbles for any crawler (and one more for her); `bub` adds to every pop
    // (COMBAT's ROS block). Each has a use without bubbles too.
    { id: 'foam_machine', name: 'Foam Machine', icon: '\u{1F6C1}', rarity: 'r', kw: ['jackpot'], proc: 'FOAM MACHINE',
      text: "Any crawler blows a bubble into the cabinet every turn: a bubbled prize never slips. Ms. Bubbles blows one more.",
      rules: { bubbles: 1 } },
    { id: 'soap_dish', name: 'Soap Dish', icon: '\u{1F9F4}', rarity: 'c', kw: ['fortress'], proc: 'SOAP DISH',
      text: 'Every bubble you pop in the chute gives 2 Block. No bubbles: the first item you deliver each turn gives 2 Block.',
      bub: { block: 2 },
      hooks: { onPlay(F) { if (F.bub) return; const m = mem(F); if (m.sd === F.turn) return; m.sd = F.turn; gainBlock(F, 2); } } },
    { id: 'squeaky_toy', name: 'Squeaky Toy', icon: '\u{1F986}', rarity: 'u', kw: ['jackpot'], proc: 'SQUEAK',
      text: 'A Bubble Combo hits 3 harder for every bubble in it. No bubbles: a grab of 2+ items deals 2 damage to ALL enemies.',
      bub: { combo: 3 },
      hooks: { onGrab(F, n) { if (!F.bub && (n | 0) >= 2) zapAll(F, 2); } } },

    // ---- TECH (round 17, DESIGN.md "Cabinet Tech and the new crawler (round 17)"): the
    // cabinet's own systems (round 16) as builds. `tech` numbers are the game's (DATA.techMods
    // adds them up: evP / first more events, perfX the PERFECT window, laser, lampStart, coins /
    // coinGold, double, perfLamp, drain); the hooks hear the cabinet on onCab. Every cabinet
    // effect lands on your own turn (the game holds a fever that bursts after END TURN until
    // your next one). The event relics ring every 2nd turn when the cabinet is quiet (Duo). ----
    { id: 'laser_sight', name: 'Laser Sight', icon: '\u{1F526}', rarity: 'c', kw: ['tech'], proc: 'LASER',
      text: 'A red laser shows where the claw will drop, and PERFECT grabs are twice as easy to land. Every PERFECT grab gives you 3 Block.',
      tech: { perfX: TECH_K.laserX, laser: 1 },
      hooks: { onCab(F, kind) { if (kind === 'perfect') gainBlock(F, TECH_K.laserBlock); } } },
    { id: 'service_key', name: 'Service Key', icon: '\u{1F511}', rarity: 'c', kw: ['tech', 'fortress'], proc: 'SERVICE KEY',
      text: 'Cabinet events come more often and can land on your first turn. Every event that lands gives you 5 Block.',
      tech: { evP: TECH_K.keyEvP, first: 1 },
      hooks: {
        onCab(F, kind) { if (kind === 'event') gainBlock(F, TECH_K.keyBlock); },
        onTurnStart(F) { if (techQuiet(F)) gainBlock(F, TECH_K.keyBlock); },
      } },
    { id: 'lamp_oil', name: 'Lamp Oil', icon: '\u{1F3EE}', rarity: 'c', kw: ['tech', 'feast'], proc: 'LAMP OIL',
      text: 'The Jackpot Lamp starts every fight 4 cells fuller, and every LAMP FEVER heals you 3 HP.',
      tech: { lampStart: TECH_K.oilStart },
      hooks: { onCab(F, kind) { if (kind === 'fever') healP(F, TECH_K.oilHeal); } } },
    { id: 'coin_hopper', name: 'Coin Hopper', icon: '\u{1FA99}', rarity: 'c', kw: ['tech', 'greed'], proc: 'HOPPER',
      text: 'Coin Showers and LAMP FEVER drop 3 more coins into the cabinet, and every coin you deliver pays 2 gold instead of 1.',
      tech: { coins: TECH_K.hopperCoins, coinGold: TECH_K.hopperGold },
      hooks: { onCab(F, kind, v, id) { if ((kind === 'event' && id === 'coins') || kind === 'fever') proc(F, 'coin_hopper', 'HOPPER'); } } },
    { id: 'metronome', name: 'Metronome', icon: '⏱', rarity: 'u', kw: ['tech'], proc: 'METRONOME',
      text: 'Every PERFECT grab hits a random enemy for 4, plus 4 for each PERFECT right before it (16 at most).',
      hooks: {
        onCab(F, kind, v) {
          if (kind !== 'perfect') return;
          const n = Math.max(1, v | 0), d = Math.min(TECH_K.metroMax, TECH_K.metroDmg * n);
          proc(F, 'metronome', n > 1 ? 'METRONOME x' + n : 'METRONOME');
          zap(F, randomFoe(F), d);
        },
      } },
    { id: 'fever_dream', name: 'Fever Dream', icon: '\u{1F300}', rarity: 'u', kw: ['tech'], proc: 'FEVER DREAM',
      text: 'LAMP FEVER deals 8 damage to ALL enemies and gives you 4 Block.',
      hooks: { onCab(F, kind) { if (kind === 'fever') { zapAll(F, TECH_K.feverDmg); gainBlock(F, TECH_K.feverBlock); } } } },
    { id: 'circuit_breaker', name: 'Circuit Breaker', icon: '⚡', rarity: 'u', kw: ['tech', 'metal'], proc: 'BREAKER',
      text: 'Cabinet events hit back: a POWER SURGE zaps ALL enemies for 6, a COIN SHOWER gives you 6 Block and a CAPSULE DROP heals you 5 HP.',
      hooks: {
        onCab(F, kind, v, id) {
          if (kind !== 'event') return;
          if (id === 'surge') zapAll(F, TECH_K.breakZap);
          else if (id === 'coins') gainBlock(F, TECH_K.breakBlock);
          else if (id === 'capsule') healP(F, TECH_K.breakHeal);
        },
      } },
    { id: 'trick_shot', name: 'Trick Shot', icon: '\u{1F3AF}', rarity: 'r', kw: ['tech', 'jackpot'], proc: 'TRICK SHOT',
      text: 'A PERFECT grab right after another PERFECT (x2 or better) gives you the grab back, once a turn.',
      hooks: {
        onCab(F, kind, v) {
          if (kind !== 'perfect' || (v | 0) < 2) return;
          const m = mem(F);
          if (m.trick === F.turn) return;
          m.trick = F.turn;
          moreGrabs(F, 1);
        },
      } },
    { id: 'double_feature', name: 'Double Feature', icon: '\u{1F3AC}', rarity: 'r', kw: ['tech'], proc: 'DOUBLE FEATURE',
      text: 'Every cabinet event lands twice: the reel spins again for a second, different event. Events come a little more often too.',
      tech: { double: 1, evP: TECH_K.dblEvP },
      hooks: { onCab(F, kind) { if (kind === 'double') proc(F, 'double_feature', 'DOUBLE FEATURE'); } } },

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
      bal: { grabs: -1 },   // (round 16) the claw type's own start on top of the crawler's (GAME newRun): a handful a drop, one drop fewer a turn
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
    // CR8 (round 8): the vacuum nozzle and the twin claws
    vacuum: { id: 'vacuum', name: 'Vacuum Nozzle', icon: '🌪', color: '#9b7bff', order: 6,
      text: 'Hovers over the pile and sucks small, light things up its wand into a canister, three at a time. Heavy things resist; a big light thing jams the nozzle.',
      joke: 'Found a sock in there once. Nobody owns up to the sock.',
      stats: { grip: 2, reach: 4, speed: 3 }, good: 'Small light things, fillers', bad: 'Heavy things, daggers and swords jam it',
      ups: { width: 'A wider nozzle: bigger things fit, and the canister holds one more.', prongs: 'A second intake: 25% more reach and one more in the canister.', grip: 'A stronger motor: more suction, heavier things.' } },
    twin: { id: 'twin', name: 'Twin Claws', icon: '♊', color: '#ff5a9a', order: 7,
      text: 'Two small claws on one bar. Each slides to the prize nearest it and closes on its own, so one drop brings up a pair.',
      joke: 'Twins. One is five minutes older and never lets the other forget it.',
      stats: { grip: 2, reach: 4, speed: 3 }, good: 'Pairs, doubles, combos', bad: 'Big heavy things, swords',
      bal: { hp: 10, grabs: 1 },   // (round 16) two small heads bring up less a drop: one more grab a turn and 10 Max HP
      ups: { width: 'Bigger heads, spread further apart.', prongs: 'Grippier fingertips on both heads.' } },
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
    // Round 3: the Gambler. `luck` is his gift (COMBAT: empty grabs give 2
    // Luck, near misses 1; a grab of 2+ items cashes it out), so a whiff is
    // never wasted and a loose claw is part of the plan.
    gambler: { id: 'gambler', name: 'Lucky Lou', title: 'The Gambler', color: '#ffc94d',
      blurb: 'Dice, chips and a loose claw. Every whiff fills his Luck meter; the next double grab cashes it out on everything.',
      hp: 78, gold: 110, unlock: 'act2', unlockText: 'Reach Act 2 with any Crawler.',   // (round 17 QA: 70 -> 78)
      claw: { grabs: 3, width: 1, grip: 0.9, speed: 1.1, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'snake_eyes', luck: true,
      bin: ['bone_dice', 'bone_dice', 'bone_dice', 'bone_dice', 'bone_dice',
        'poker_chip', 'poker_chip', 'poker_chip', 'poker_chip', 'poker_chip',
        'scratch_card', 'fortune_cookie', 'crisp_apple',
        'lucky_clover', 'lucky_clover', 'lucky_clover', 'pocket_die', 'pocket_die', 'pocket_die'] },
    // Round 8 (CR8): the Engineer. `turret` is her gift (COMBAT's CR8 block):
    // every metal item she delivers bolts a part onto the turret on her
    // cabinet, and the turret fires at the end of every turn, bigger each level.
    engineer: { id: 'engineer', name: 'Mama Mech', title: 'The Engineer', color: '#ff8a2e',
      blurb: 'Bolts, plates and a wrench. Every metal thing she delivers builds the turret on her cabinet, and it fires every turn.',
      hp: 84, gold: 95, unlock: 'act2', unlockText: 'Reach Act 2 with any Crawler.',   // (round 16: 75 -> 84)
      claw: { grabs: 3, width: 1, grip: 1.1, speed: 0.95, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'socket_set', turret: true,
      bin: ['hex_bolt', 'hex_bolt', 'hex_bolt', 'hex_bolt', 'hex_bolt',
        'tin_plate', 'tin_plate', 'tin_plate', 'tin_plate',
        'pipe_wrench', 'spring_coil', 'oil_can', 'crisp_apple',
        'iron_nut', 'iron_nut', 'iron_nut', 'bouncy_ball', 'bouncy_ball', 'bouncy_ball'] },
    // Round 10 (ROS): the Foam Chemist. `bubbles` is her gift (COMBAT's ROS
    // block): every turn she blows bubbles into the cabinet that trap prizes
    // and float them up; a bubbled prize never slips, and popping it in the
    // chute pays. Two or more popped in one grab is a Bubble Combo.
    bubbler: { id: 'bubbler', name: 'Ms. Bubbles', title: 'The Foam Chemist', color: '#8dfff5',
      blurb: 'Soap, sponges and a squeaky duck. She blows bubbles that float prizes up to the claw: a bubbled prize never slips, and popping bubbles in the chute pays.',
      hp: 68, gold: 100, unlock: 'win', unlockText: 'Win a run with any Crawler.',
      claw: { grabs: 3, width: 1, grip: 0.85, speed: 1.05, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'bubble_wand', bubbles: true,
      bin: ['rubber_duck', 'rubber_duck', 'rubber_duck', 'rubber_duck', 'rubber_duck',
        'soap_bar', 'soap_bar', 'soap_bar', 'soap_bar',
        'bubble_pipe', 'sponge', 'scrub_brush', 'crisp_apple',
        'glass_bead', 'glass_bead', 'glass_bead', 'peppermint', 'peppermint', 'peppermint'] },
    // Round 17 (TECH): the Technician. `tech` is her gift (game.js TECH block): the cabinet works
    // for her. Its events come more often and from her first turn, and every PERFECT grab lights
    // one more lamp cell. Unlocked by setting off LAMP FEVER with anyone (`unlock: 'fever'`).
    techie: { id: 'techie', name: 'Joy Stick', title: 'The Technician', color: '#ff7ad9',
      blurb: 'Joysticks, buttons and a service remote. The cabinet works for her: its events come more often and from her first turn, and every one that lands zaps everything.',
      hp: 70, gold: 100, unlock: 'fever', unlockText: 'Set off LAMP FEVER with any Crawler.',
      claw: { grabs: 3, width: 1, grip: 1, speed: 1.15, prongs: 2, rubber: 0, magnet: 0 },
      relic: 'service_remote', tech: true,
      bin: ['arcade_stick', 'arcade_stick', 'arcade_stick', 'arcade_stick', 'arcade_stick',
        'arcade_button', 'arcade_button', 'arcade_button', 'arcade_button', 'arcade_button',
        'coin_mech', 'neon_tube', 'crisp_apple',
        'lucky_penny', 'lucky_penny', 'lucky_penny', 'bouncy_ball', 'bouncy_ball', 'bouncy_ball'] },
  };
  // The crawler's line on the versus card before an elite or boss (RENDER.vsCard).
  const VS_LINES = {
    knight: 'Have at thee, prize!', alchemist: 'Hold still, this might fizz.',
    rogue: 'Your wallet looks heavy.', gambler: 'Double or nothing, pal.',
    engineer: 'Hold still. Measuring you.',
    bubbler: 'Hold your breath, sweetie.',
    techie: 'Hold on, rebooting you.',
  };
  for (const id in CHARACTERS) CHARACTERS[id].vsLine = VS_LINES[id] || '';

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
    // round 3: Lucky Lou's build (whiffs fill the meter, a double grab cashes it out)
    luck: { label: 'Luck', icon: '🍀', color: '#3ddc84', blurb: 'Dice that roll twice, whiffs that pay later and a meter that cashes out on everything.' },
    // round 17 (TECH): the cabinet's own systems (events, the Jackpot Lamp, PERFECT grabs, its coins)
    tech: { label: 'Tech', icon: '\u{1F579}', color: '#ff7ad9', blurb: 'The machine is on your side: PERFECT grabs, cabinet events, LAMP FEVER and the coins it rains.' },
  };
  // Chip order: specific engines first, broad families (glass, metal) last.
  const ARCH_ORDER = ['poison', 'burn', 'frost', 'fortress', 'brawler', 'junk', 'tech', 'jackpot', 'swarm', 'greed', 'luck', 'feast',
    'echo', 'glass', 'metal'];
  const TAG_ARCH = { metal: 'metal', small: 'swarm', glass: 'glass', food: 'feast', magic: 'echo', junk: 'junk' };
  const PER_ARCH = { poison: 'poison', burn: 'burn', block: 'fortress', metal: 'metal', junk: 'junk', grabsUsed: 'jackpot',
    streak: 'jackpot', small: 'swarm', gold: 'greed', luck: 'luck' };
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
      if (def.lamp) got.add('tech');   // (TECH, round 17: it lights the Jackpot Lamp)
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
        // Luck: gaining it, reading it, or rolling dice (Luck rolls them twice)
        if ((f.k === 'status' && f.s === 'luck' && f.to === 'self') || f.k === 'random') got.add('luck');
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
  // Round 3 recipe helpers: an art key, how many copies of each item (most
  // first), how many different items came in pairs or better.
  const artIs = (a) => (d) => !!d && d.art === a;
  function sameCounts(defs) {
    const n = {};
    for (const d of defs) if (d && d.id) n[d.id] = (n[d.id] || 0) + 1;
    return Object.values(n).sort((a, b) => b - a).concat([0, 0]);
  }
  const pairs = (defs) => sameCounts(defs).filter(k => k >= 2).length;
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

    // ---- Round 3: the casino table. Two pairs and a pill are on the menu;
    // the `secret` ones hide their recipe in the Prizedex (???) until they
    // fire once. match(defs, ctx) may read ctx {luck, streak} (the grab's
    // state, COMBAT passes it); `ctx` on a recipe is its test fixture. ----
    { id: 'double_dice', name: 'Double Dice', tier: 1, family: 'dice', color: '#f1e9d6', target: 'random',
      text: 'Two dice: deal 4 damage to a random enemy and gain 2 Luck.', fx: [dmg(4), status('luck', 2, 'self')],
      match: (d) => count(d, artIs('dice')) >= 2, example: ['bone_dice', 'pocket_die'], miss: ['bone_dice', 'femur'] },
    { id: 'poker_night', name: 'Poker Night', tier: 1, family: 'cards', color: '#ff2e4a', target: 'self',
      text: 'A card and a chip: gain 4 Block and 1 Luck.', fx: [block(4), status('luck', 1, 'self')],
      match: (d) => roles(d, [artIs('card'), artIs('chip')]), example: ['scratch_card', 'poker_chip'], miss: ['poker_chip', 'poker_chip'] },
    { id: 'hot_lunch', name: 'Hot Lunch', tier: 1, family: 'hotfood', color: '#ff8a2e', target: 'enemy',
      text: 'Food meets fire: heal 3 HP and apply 2 Burn.', fx: [heal(3), status('burn', 2)],
      match: (d) => roles(d, [tagOf('food'), burny]), example: ['crisp_apple', 'torch'], miss: ['crisp_apple', 'femur'] },
    { id: 'two_pair', name: 'Two Pair', tier: 2, family: 'pairs', color: '#ffe066', target: 'all',
      text: 'Two different pairs in one grab: deal 8 damage to ALL enemies and gain 2 Luck.', fx: [dmg(8), status('luck', 2, 'self')],
      match: (d) => pairs(d) >= 2, example: ['bone_dice', 'bone_dice', 'poker_chip', 'poker_chip'], miss: ['bone_dice', 'bone_dice', 'poker_chip', 'femur'] },
    { id: 'bad_medicine', name: 'Bad Medicine', tier: 2, family: 'medicine', color: '#a6ff5e', target: 'all',
      text: 'A Poison Pill and another potion: apply 4 Poison and 2 Weak to ALL enemies.', fx: [status('poison', 4, 'all'), status('weak', 2, 'all')],
      match: (d) => roles(d, [(x) => x.id === 'poison_pill', tagOf('potion')]), example: ['poison_pill', 'stink_potion'], miss: ['poison_pill', 'femur'] },
    // secret recipes (tier 3)
    { id: 'full_house', name: 'Full House', tier: 3, family: 'house', color: '#ff2e88', target: 'all', secret: true,
      sup: ['three_of_a_kind', 'two_pair'],
      text: 'Three of one item and two of another: deal 16 damage to ALL enemies, gain 4 Luck and 10 gold.', fx: [dmg(16), status('luck', 4, 'self'), gold(10)],
      match: (d) => { const n = sameCounts(d); return n[0] >= 3 && n[1] >= 2; },
      example: ['prize_marble', 'prize_marble', 'prize_marble', 'glass_bead', 'glass_bead'], miss: ['prize_marble', 'prize_marble', 'prize_marble', 'glass_bead', 'femur'] },
    { id: 'royal_flush', name: 'Royal Flush', tier: 3, family: 'flush', color: '#ffc94d', target: 'all', secret: true,
      text: 'A card, a chip, a die and a coin at once: 20 damage to ALL enemies, 5 Luck and 15 gold.', fx: [dmg(20), status('luck', 5, 'self'), gold(15)],
      match: (d) => roles(d, [artIs('card'), artIs('chip'), artIs('dice'), artIs('coin')]),
      example: ['marked_deck', 'poker_chip', 'bone_dice', 'lucky_coin'], miss: ['marked_deck', 'poker_chip', 'bone_dice', 'femur'] },
    { id: 'dead_mans_hand', name: "Dead Man's Hand", tier: 3, family: 'deadman', color: '#b3a4d6', target: 'enemy', secret: true,
      text: 'A skull, a bone and a card: apply 3 Vulnerable, then strike 3 times for 6.', fx: [status('vuln', 3), dmg(6, 3)],
      match: (d) => roles(d, [artIs('skull'), artIs('bone'), artIs('card')]),
      example: ['grudge_skull', 'femur', 'scratch_card'], miss: ['grudge_skull', 'femur', 'crisp_apple'] },
    { id: 'midas_touch', name: 'Midas Touch', tier: 3, family: 'midas', color: '#ffe066', target: 'all', secret: true,
      text: 'Three different coins in one grab: deal 14 damage to ALL enemies and gain 20 gold.', fx: [dmg(14), gold(20)],
      match: (d) => kinds(d, artIs('coin')) >= 3, example: ['lucky_coin', 'lucky_penny', 'arcade_token'], miss: ['lucky_coin', 'lucky_coin', 'lucky_penny'] },
    { id: 'lucky_seven', name: 'Lucky Seven', tier: 3, family: 'seven', color: '#3ddc84', target: 'random', secret: true,
      text: 'A grab of 2+ items while you hold exactly 7 Luck: 7 damage 7 times at random and 7 gold.', fx: [dmg(7, 7), gold(7)],
      match: (d, ctx) => d.length >= 2 && !!ctx && (ctx.luck | 0) === 7, ctx: { luck: 7 },
      example: ['bone_dice', 'femur'], miss: ['bone_dice'] },
    // ---- TECH (round 17): the arcade's own recipes. A Tech item (it lights the lamp, or wears the
    // chip) with coins or metal, and a PERFECT grab (ctx.perfect: the grab's PERFECT streak, COMBAT
    // passes it from the game's TECH block). ----
    { id: 'coin_op', name: 'Coin-Op', tier: 1, family: 'coinop', color: '#ffc94d', target: 'enemy',
      text: 'A Tech item and a coin: insert coin, deal 5 damage and gain 3 gold.', fx: [dmg(5), gold(3)],
      match: (d) => roles(d, [(x) => has(x, 'tech'), artIs('coin')]), example: ['arcade_stick', 'lucky_penny'], miss: ['arcade_stick', 'crisp_apple'] },
    { id: 'short_circuit', name: 'Short Circuit', tier: 2, family: 'circuit', color: '#ff7ad9', target: 'all',
      text: 'A Tech item and two metal items: sparks fly, 6 damage and 1 Weak to ALL enemies.', fx: [dmg(6), status('weak', 1, 'all')],
      match: (d) => roles(d, [(x) => has(x, 'tech'), tagOf('metal'), tagOf('metal')]),
      example: ['arcade_button', 'rusty_sword', 'iron_chain'], miss: ['arcade_button', 'rusty_sword', 'crisp_apple'] },
    { id: 'bullseye', name: 'Bullseye', tier: 2, family: 'bullseye', color: '#ffe066', target: 'enemy',
      text: 'A PERFECT grab that brings up 2+ items: deal 8 damage and gain 4 Block.', fx: [dmg(8), block(4)],
      match: (d, ctx) => d.length >= 2 && !!ctx && (ctx.perfect | 0) >= 1, ctx: { perfect: 1 },
      example: ['rusty_sword', 'crisp_apple'], miss: ['rusty_sword'] },
  ];
  const COMBOS = {};
  for (const c of COMBO_LIST) COMBOS[c.id] = c;

  // The combos one grab fires, given the item defs it delivered: one per
  // family (the biggest tier), minus the ones a bigger recipe replaces,
  // biggest tier first, at most COMBO_MAX. ctx (optional): the grab's state
  // {luck, streak} for the recipes that read it (Lucky Seven).
  function combosFor(defs, ctx) {
    const list = (defs || []).filter(Boolean);
    if (list.length < 2) return [];
    const hit = COMBO_LIST.filter(c => { try { return !!c.match(list, ctx || null); } catch (e) { return false; } });
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
    // Set pull (round 6): a missing piece of a set the run holds 1 or 2 of.
    // Only draws when there is such a piece, so a run without sets rolls as before.
    const want = run ? setWant(run, ids) : [];
    if (want.length && rng() < SET_PULL) return pickFrom(want);
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
      if (!rarity && r.rarity === 'l') return false;   // (LEG: legendaries only come when asked for by name)
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
    // BALANCE (round 12, owner request: capsules stay, their contents get smaller). Was normal 62/28/9/1,
    // bonus 45/37/15/3, elite 20/46/27/7, boss 0/20/58/22, treasure 34/40/22/4; UP 0.16/0.11/0.07; PITY 5.
    WEIGHTS: {
      normal: { c: 72, u: 22, r: 5.5, l: 0.5 },
      bonus: { c: 60, u: 30, r: 9, l: 1 },      // a jackpot or a tier 3 combo in the fight
      elite: { c: 36, u: 44, r: 17, l: 3 },
      boss: { c: 0, u: 34, r: 56, l: 10 },
      treasure: { c: 46, u: 38, r: 14, l: 2 },
      counter: { c: 100, u: 0, r: 0, l: 0 },
    },
    // Chance per step that a capsule turns one tier better mid-open; the
    // steps chain (a common can go all the way, rarely).
    UP: { c: 0.12, u: 0.08, r: 0.05 },
    PITY: 8,                 // capsules in a row below rare, then the next one turns rare mid-open
    TAPS: 3, FAST_TAPS: 2, FAST_AFTER: 12,   // taps to crack one; fewer once the player has opened plenty
    // What falls out, by tier (weights). A kind with nothing in stock rerolls to gold.
    // (BALANCE round 12: far fewer relics, more gold, tickets and plain items. Was c 34/26/20/12/8 gold/item/
    // tickets/ink/tool; u item 30, gold 16, relic 16, tool 12, maxhp 10, tickets 10, ink 6; r relic 34, item 28,
    // itemPlus 10, maxhp 10, gold 10, claw 8; l relic 32, item 26, claw 24, maxhp 18.)
    PRIZES: {
      c: { gold: 36, item: 26, tickets: 22, ink: 10, tool: 6 },
      u: { item: 30, gold: 24, tickets: 18, relic: 6, tool: 10, maxhp: 6, ink: 6 },
      r: { item: 26, gold: 24, relic: 16, tickets: 14, itemPlus: 8, maxhp: 6, claw: 6 },
      l: { relic: 24, item: 22, gold: 20, claw: 18, maxhp: 16 },
    },
    RELIC_RAR: { c: ['c'], u: ['c', 'u'], r: ['u', 'r'], l: ['r', 'boss', 'l'] },   // (LEG: a legendary capsule may hold a legendary relic)
    // (BALANCE round 12: an item prize draws from its tier and the one below; was c/u/r/l each its own tier.
    // Capsule gold was c 12-25, u 30-50, r 70-100, l 120-160.)
    ITEM_RAR: { c: ['c'], u: ['c', 'u'], r: ['u', 'r'], l: ['r', 'l'] },
    GOLD: { c: [8, 16], u: [15, 28], r: [30, 45], l: [50, 80] },
    TICKET_PRIZE: { c: [8, 14], u: [18, 28], r: [30, 40], l: [50, 60] },
    INK: { c: 2, u: 3, r: 4, l: 5 },
    MAXHP: { c: 2, u: 3, r: 6, l: 10 },
    // Arcade tickets a won fight spits out, and the gold bonus lines of the
    // payout screen (per jackpot, per combo tier, flawless, speedy, overkill).
    // (BALANCE round 12: was TICKETS normal 4, elite 8, boss 15, jackpot 3, combo 1, flawless 5, speedy 3,
    // overkill 1 per 5 up to 4; BONUS_GOLD jackpot 4, combo 2, flawless 8, speedy 5, overkill 1 per 3 up to 8.)
    TICKETS: { normal: 3, elite: 6, boss: 12, jackpot: 1, combo: 0, flawless: 3, speedy: 2, overkillPer: 6, overkillMax: 2 },
    BONUS_GOLD: { jackpot: 1, combo: 1, flawless: 3, speedy: 2, overkillPer: 4, overkillMax: 3 },
    SPEEDY_TURNS: 2,         // won by the end of this turn
    OVERKILL_MIN: 5,
    BONUS_P: 0.35,           // (BALANCE round 12) the chance a fight with a jackpot or a tier 3 combo drops a bonus capsule (was always)
    DOUBLE: 1 / 30,          // the lucky DOUBLE REWARD roulette (was 1 / 20)
    // Prize counter prices, in tickets (BALANCE round 12: was cap 12 / 28 / 55 / 110, item 14 / 24 / 40 / 70, max hp 30, bulbs 10, tool 18).
    PRICE: { cap: { c: 30, u: 70, r: 130, l: 260 }, item: { c: 24, u: 44, r: 75, l: 130 }, maxhp: 45, ink: 16, tool: 28 },
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
    // opts.up: extra upgrade chance per step (the Gacha Charm relic, relic.loot.capUp)
    const up = Math.max(0, Math.min(0.6, +opts.up || 0));
    while (cur !== 'l' && rng() < (LOOT.UP[cur] || 0) + up) { cur = capNext(cur); ups.push(cur); }
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
    // Tickets relics printed in the fight (Ticket Roll, Gacha Charm, Lucky Ticket: F.stats.tix)
    const rt = Math.max(0, Math.round(st.relicTix || 0));
    if (rt > 0) lines.push({ id: 'relictix', label: 'Ticket relics', gold: 0, tix: rt });
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
    // round 3: Lucky Lou and the secret recipes
    A_('big_payout', 'Big Payout', '\u{1F340}', '#3ddc84', 'Cash out 10 Luck in one grab.', (c) => c.kind === 'ev' && !!c.ev && c.ev.t === 'luck' && c.ev.k === 'cash' && (c.ev.v | 0) >= 10),
    A_('secret_menu', 'Secret Menu', '\u{1F92B}', '#ff2e88', 'Discover a secret combo.', (c) => c.kind === 'ev' && !!c.ev && c.ev.t === 'combo' && !!COMBOS[c.ev.id] && !!COMBOS[c.ev.id].secret),
    A_('house_loses', 'The House Loses', '\u{1F3B2}', '#ffc94d', 'Win a run as Lucky Lou.', (c) => c.kind === 'win' && RUNS(c).char === 'gambler'),
    // endless mode and run mutators (the ENDLESS block below)
    A_('endless_on', 'Insert Another Coin', '\u{1FA99}', '#ffc94d', 'Keep playing into Endless mode.', (c) => !!RUNS(c).endless),
    A_('loop3', 'Loop de Loop', '➰', '#ff6bb0', 'Reach Loop 3 in Endless mode.', (c) => ((RUNS(c).endless || {}).loop | 0) >= 3),
    A_('loop6', 'Groundhog Claw', '♾', '#ff2e88', 'Reach Loop 6 in Endless mode.', (c) => endlessBest(c) >= 6, { goal: 6, val: endlessBest }),
    A_('mad_science', 'Mad Science', '\u{1F9EA}', '#a6ff5e', 'Win a run with 2 or more mutators on.', (c) => c.kind === 'win' && mutClean(RUNS(c).muts).length >= 2),
    A_('high_score', 'High Score', '\u{1F947}', '#2ee6d6', 'Score 25,000 points in one run.', (c) => (RUNS(c).scoreTop | 0) >= 25000),
    // round 6: the secret act (the SECRET block below)
    A_('keymaster', 'Keymaster', '\u{1F5DD}', '#ffc94d', 'Find all three golden keys in one run.', (c) => secKeyN(RUNS(c)) >= 3),
    A_('back_room', 'The Back Room', '\u{1F6AA}', '#2ee6d6', 'Step through the hidden door.', (c) => !!(RUNS(c).sec && RUNS(c).sec.room)),
    A_('true_ending', 'True Ending', '\u{1F305}', '#ff2e88', 'Power down The Machine and see the true ending.', (c) => !!(RUNS(c).sec && RUNS(c).sec.ended)),
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

  // ================================================================ ENDLESS (endless mode and run mutators)
  /* DESIGN.md "Endless and mutators". Pure data and pure helpers: the flow
     lives in game.js (the ENDLESS block), the fight side in combat.js (the
     ENDLESS block). A run without run.endless and run.muts is untouched. */

  /* Run mutators: fun rules that change the claw machine itself, picked on
     character select (up to MUT_MAX), fixed per date for the daily run, and
     one more every Endless loop from ENDLESS.mutFrom. fx is what the engine
     reads; mutMods(ids) merges a set of them:
       gs, drag     every prize's gravity scale (x) and extra air drag (+)
       scale        every prize's size (x)          slick  pile and floor friction (x), never the claw's grip
       glass        every prize cracks like glass   drift  px/s^2 pull toward the claw's column
       belt         the bin floor rolls toward the chute (px/s)
       quake        the cabinet lurches a random way every turn
       dark         the cabinet lights are out, a flashlight rides the claw
       temp         {id, n, turn, max}: n temporary prizes at the bell, `turn` more each turn, at most max
       grabs        grabs per turn (x)              dmgOut  the player's hits (x)
       affix        an affix every enemy carries    rules   relic rules added to every fight
       extra        more monsters in every normal fight
     mult is the run score multiplier (under 1 for the ones that help). */
  const MUT_MAX = 3;
  const MUT_LIST = [
    { id: 'lowgrav', name: 'Low Gravity', icon: '\u{1F388}', color: '#8dfff5', mult: 1.15,
      text: 'Everything floats. Prizes drift down like feathers and bob off each other.', fx: { gs: 0.36, drag: 0.7 } },
    { id: 'glass', name: 'Everything Is Glass', icon: '\u{1F48E}', color: '#bff4ff', mult: 1.25,
      text: 'Every prize cracks on a hard landing: a cracked one hits for +50%, a second crack shatters it.', fx: { glass: true } },
    { id: 'bombs', name: 'Bomb Party', icon: '\u{1F4A3}', color: '#ff5a4a', mult: 1.1,
      text: 'Two Firecrackers roll into every fight and one more each turn. Mind the fuses.', fx: { temp: { id: 'firecracker', n: 2, turn: 1, max: 5 } } },
    { id: 'magnet', name: 'Magnet Storm', icon: '\u{1F9F2}', color: '#ff6bb0', mult: 0.9,
      text: 'The whole pile creeps toward the claw. Handfuls come easy.', fx: { drift: 420 } },
    { id: 'tiny', name: 'Tiny Items', icon: '\u{1F52C}', color: '#a6ff5e', mult: 1.05, excl: ['giant'],
      text: 'Every prize shrinks to 70%. Handfuls, if you can hold them.', fx: { scale: 0.7 } },
    { id: 'giant', name: 'Giant Items', icon: '\u{1F418}', color: '#ffc94d', mult: 1.2, excl: ['tiny'],
      text: 'Every prize grows to 135%. One at a time, pal.', fx: { scale: 1.35 } },
    { id: 'slippery', name: 'Slippery Floor', icon: '⛸️', color: '#8dfff5', mult: 1.1,
      text: 'Somebody waxed the bin. The pile slides at a touch.', fx: { slick: 0.1 } },
    { id: 'double', name: 'Double Grabs, Half Damage', icon: '✌️', color: '#2ee6d6', mult: 1.1,
      text: 'Twice the grabs every turn. Your hits land for half.', fx: { grabs: 2, dmgOut: 0.5 } },
    { id: 'hungry', name: 'Hungry Hungry', icon: '\u{1F37D}', color: '#a6ff5e', mult: 1.3,
      text: 'Every monster is Greedy: it gulps your prizes on its first action and every third after.', fx: { affix: 'greedy' } },
    { id: 'fever', name: 'Jackpot Fever', icon: '\u{1F3B0}', color: '#ffc94d', mult: 1.2,
      text: 'Every grab combo fires twice. So do the monsters: every one is Hasty.', fx: { rules: { comboTwice: 1 }, affix: 'hasty' } },
    { id: 'blackout', name: 'Blackout', icon: '\u{1F526}', color: '#b3a4d6', mult: 1.3,
      text: 'The cabinet lights are out. A flashlight on the claw is all you get.', fx: { dark: true } },
    { id: 'conveyor', name: 'Conveyor Belt', icon: '⏩', color: '#ffb347', mult: 0.95,
      text: 'The bin floor rolls toward the chute. The pile piles up against the divider.', fx: { belt: 55 } },
    { id: 'quake', name: 'Wobbly Legs', icon: '\u{1F4F3}', color: '#ff9ad0', mult: 1.15,
      text: 'The cabinet lurches to one side every turn. Everything slides.', fx: { quake: true } },
    { id: 'crowd', name: 'Double Trouble', icon: '\u{1F46F}', color: '#ff2e88', mult: 1.35,
      text: 'Every normal fight brings one more monster.', fx: { extra: 1 } },
    // ROS (round 10): the mutator pack, rules for the machine itself. The new
    // fx (ROS_MUT below): bounce (every prize's restitution floor), clawK (the
    // claw's size, x), tremor (quakes a turn), mirror (the steering is wired
    // backwards), sticky (the claw glues its catch; the chance one will not
    // let go over the chute), flood (the bin fills with water turn by turn).
    { id: 'moon', name: 'Moon Bounce', icon: '\u{1F319}', color: '#d6c8ff', mult: 1.15,
      text: 'Every prize is a bouncy ball. They spring off the floor, the walls and each other.', fx: { bounce: 0.72 } },
    { id: 'tinyclaw', name: 'Tiny Claw, Big Prizes', icon: '\u{1F90F}', color: '#ffb347', mult: 1.1,
      text: 'The claw shrinks to 70%. Every prize you land hits 50% harder.', fx: { clawK: 0.7, dmgOut: 1.5 } },
    { id: 'earthquake', name: 'Earthquake', icon: '\u{1F30B}', color: '#ff8a2e', mult: 1.2,
      text: 'The ground rumbles twice a turn: the whole pile jumps, even in the middle of a grab.', fx: { tremor: 2 } },
    { id: 'mirror', name: 'Mirror Machine', icon: '\u{1F500}', color: '#ff2e88', mult: 1.25,
      text: 'The controls are wired backwards: steer left and the claw goes right.', fx: { mirror: true } },
    { id: 'sticky', name: 'Sticky Fingers', icon: '\u{1F36F}', color: '#ffc94d', mult: 1.05,
      text: 'Prizes glue to the claw: nothing slips, but now and then one will not let go over the chute.', fx: { sticky: 0.35 } },
    { id: 'flood', name: 'Rising Water', icon: '\u{1F30A}', color: '#4aa8ff', mult: 1.2,
      text: 'The bin floods a little more every turn. Heavy prizes sink, light ones float up.', fx: { flood: 1 } },
  ];
  const MUTATORS = {};
  for (const m of MUT_LIST) MUTATORS[m.id] = m;
  const MUT_IDS = MUT_LIST.map((m) => m.id);
  // Two mutators that cannot run together (Tiny and Giant).
  function mutClash(a, b) {
    const A = MUTATORS[a], B = MUTATORS[b];
    return !!((A && (A.excl || []).indexOf(b) >= 0) || (B && (B.excl || []).indexOf(a) >= 0));
  }
  // Known, unique and compatible ids in order (a later clash is dropped); max caps the count.
  function mutClean(ids, max) {
    const out = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!MUTATORS[id] || out.indexOf(id) >= 0 || out.some((o) => mutClash(o, id))) continue;
      out.push(id);
      if (max && out.length >= max) break;
    }
    return out;
  }
  // The merged effects of a set of mutators (neutral for none).
  function mutMods(ids) {
    const m = { ids: [], gs: 1, drag: 0, scale: 1, slick: 1, glass: false, drift: 0, belt: 0, quake: false, dark: false,
      temp: [], grabs: 1, dmgOut: 1, affix: [], rules: {}, extra: 0, mult: 1,
      bounce: 0, clawK: 1, tremor: 0, mirror: false, sticky: 0, flood: 0 };   // (ROS: the mutator pack)
    for (const id of mutClean(ids)) {
      const M = MUTATORS[id], f = M.fx || {};
      m.ids.push(id);
      m.mult *= M.mult || 1;
      rosMutMerge(m, f);   // ROS (round 10): bounce, clawK, tremor, mirror, sticky, flood
      if (f.gs != null) m.gs *= f.gs;
      if (f.drag) m.drag += f.drag;
      if (f.scale) m.scale *= f.scale;
      if (f.slick != null) m.slick *= f.slick;
      if (f.glass) m.glass = true;
      if (f.drift) m.drift += f.drift;
      if (f.belt) m.belt += f.belt;
      if (f.quake) m.quake = true;
      if (f.dark) m.dark = true;
      if (f.temp) m.temp.push(Object.assign({}, f.temp));
      if (f.grabs) m.grabs *= f.grabs;
      if (f.dmgOut != null) m.dmgOut *= f.dmgOut;
      if (f.affix && m.affix.indexOf(f.affix) < 0) m.affix.push(f.affix);
      for (const k in f.rules || {}) m.rules[k] = (m.rules[k] || 0) + f.rules[k];
      if (f.extra) m.extra += f.extra;
    }
    m.mult = Math.round(m.mult * 100) / 100;
    return m;
  }
  const mutMult = (ids) => mutMods(ids).mult;
  // A seeded pick of one more mutator that is not in `have` and clashes with none of it (null when none is left).
  function mutPick(rng, have) {
    have = mutClean(have);
    const pool = MUT_IDS.filter((id) => have.indexOf(id) < 0 && !have.some((o) => mutClash(o, id)));
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] : null;
  }
  // The daily run's 1 or 2 mutators: the same for everyone on that date.
  function dailyMutators(key) {
    let x = dailySeed(String(key) + ':mutators');
    const r = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    const out = [];
    const n = r() < 0.5 ? 1 : 2;
    while (out.length < n) { const id = mutPick(r, out); if (!id) break; out.push(id); }
    return out;
  }

  /* Endless mode: after the Prize Master the machine reboots and loops the
     three act biomes and their enemy pools (Loop 1 is act 4, Loop 2 act 5 ...,
     each loop one map). endlessScale(loop, act) is the lift for a fight in a
     loop drawn from act `act`'s pools: enemies are first lifted to act 3
     strength (liftHp / liftDmg per pool act: the roster's act 3 / act n hp
     and attack ratios, about 3.2 / 1.6 and 2.6 / 1.35), then grow by hpGrow /
     dmgGrow per loop, compounding; normals carry floor(loop / 2) extra affixes,
     elites and bosses ceil(loop / 2) (at most 3); bosses start in phase two
     from rageFrom, elites from eliteRageFrom; from mixFrom each loop's boss
     borrows another boss's signature; from mutFrom every loop adds a random
     mutator. */
  const ENDLESS = {
    liftHp: [1, 3.2, 1.6, 1], liftDmg: [1, 2.6, 1.35, 1],
    hpGrow: 0.25, dmgGrow: 0.1, affixMax: 3,
    rageFrom: 2, eliteRageFrom: 4, mixFrom: 1, mutFrom: 2,
    heal: 0.3,
  };
  function endlessScale(loop, act) {
    loop = Math.max(0, Math.floor(+loop || 0));
    const a = Math.max(1, Math.min(3, Math.floor(+act || 1)));
    if (!loop) return { loop: 0, hp: 1, dmg: 1, normalAffix: 0, bigAffix: 0, rage: false, eliteRage: false, mix: false };
    const E = ENDLESS;
    return {
      loop,
      hp: E.liftHp[a] * Math.pow(1 + E.hpGrow, loop),
      dmg: E.liftDmg[a] * Math.pow(1 + E.dmgGrow, loop),
      normalAffix: Math.min(E.affixMax, Math.floor(loop / 2)),
      bigAffix: Math.min(E.affixMax, Math.ceil(loop / 2)),
      rage: loop >= E.rageFrom, eliteRage: loop >= E.eliteRageFrom, mix: loop >= E.mixFrom,
    };
  }
  // The loop's act (the biome and the enemy pools): 1, 2, 3, 1, 2, 3 ...
  const endlessAct = (loop) => ((Math.max(1, Math.floor(+loop || 1)) - 1) % 3) + 1;
  // The boss whose signature this loop's boss borrows (never its own).
  function endlessMix(rng, act) {
    const own = ((ENCOUNTERS[act] || {}).boss || [[]])[0] || [];
    const ids = Object.keys(ENEMIES).filter((id) => ENEMIES[id].tier === 'boss' && ENEMIES[id].sig && !ENEMIES[id].secret && !ENEMIES[id].dep && own.indexOf(id) < 0);   // (never the secret boss's tricks) (DEP: the High Tide stays in the Depths)
    return ids.length ? ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))] : null;
  }

  /* The run score (every end screen, a best per mode in meta.scores): the
     climb (floors = acts reached, 3 + the loop in Endless), kills, bosses
     beaten, jackpots, combos, loops, the win; times the Tilt multiplier (+10%
     a level) and the mutator multiplier. The daily keeps its own dailyScore. */
  const SCORE = { floor: 400, kill: 25, boss: 300, jackpot: 40, combo: 15, loop: 1000, win: 2500, tilt: 0.1 };
  const runMode = (run) => (run && run.endless ? 'endless' : run && run.daily ? 'daily' : 'classic');
  function runScore(run, won) {
    run = run || {};
    const E = run.endless && typeof run.endless === 'object' ? run.endless : null;
    const loops = E ? Math.max(0, Math.floor(+E.loop || 0)) : 0;
    const floors = E ? 3 + loops : Math.max(1, Math.min(3, run.act | 0));
    const sc = run.sc || {};
    won = !!won || !!E;
    const lines = [];
    const add = (k, label, n, per) => { if (n > 0) lines.push({ k, label, n, v: Math.round(n * per) }); };
    add('floors', 'Floors climbed', floors, SCORE.floor);
    add('kills', 'Monsters beaten', run.kills | 0, SCORE.kill);
    add('bosses', 'Bosses down', sc.bosses | 0, SCORE.boss);
    add('jackpots', 'Jackpots', run.jackpots | 0, SCORE.jackpot);
    add('combos', 'Combos', sc.combos | 0, SCORE.combo);
    add('loops', 'Endless loops', loops, SCORE.loop);
    add('dep', 'Drowned Jukeboxes unplugged', sc.dep | 0, DEP_K.dive);   // DEP (round 15): a Depths boss
    if (won) lines.push({ k: 'win', label: 'Prize Master down', n: 1, v: SCORE.win });
    if (run.sec && run.sec.beat) lines.push({ k: 'machine', label: 'The Machine powered down', n: 1, v: SECRET.score });   // SECRET: the true ending
    const base = lines.reduce((s, l) => s + l.v, 0);
    const tiltM = Math.round((1 + SCORE.tilt * Math.max(0, run.tilt | 0)) * 100) / 100;
    const mutM = mutMult(run.muts);
    const mult = Math.round(tiltM * mutM * 100) / 100;
    return { mode: runMode(run), base, tiltM, mutM, mult, total: Math.max(0, Math.round(base * tiltM * mutM)), lines };
  }
  // (a declaration: the sticker table above reads it before this line runs)
  function endlessBest(c) { return (((c && c.meta && c.meta.endless) || {}).best | 0); }
  // ================================================================ /ENDLESS

  // ================================================================ VAULT (the Prize Vault: cosmetics)
  /* A meta ticket sink (DESIGN.md "Prize Vault"). Every arcade ticket won
     in a run also lands in the lifetime Vault Tickets wallet (spending in a
     run never takes it back), and the Prize Vault on the title trades them
     for cosmetics: cabinet skins, claw paint, marquee titles, crawler outfits
     and map trails. Buy one outright, or crack a Vault Capsule (a cosmetic
     gacha; a dupe pays tickets back, legendaries are the rainbow ones). A few
     come only from a sticker. Pure data: the look fields are read by
     RENDER.vault, the flow and the wallet live in game.js (the VAULT block). */
  const VAULT = {
    SHARE: 1,                // the share of every ticket won that banks into the vault (all of them)
    PRICE: { c: 40, u: 90, r: 180, l: 450 },
    CAP_PRICE: 60,           // a Vault Capsule
    CAP_W: { c: 58, u: 30, r: 10, l: 2 },
    DUPE: { c: 12, u: 25, r: 55, l: 150 },   // tickets back for a dupe
    PITY: 12,                // capsules in a row without a legendary, then the next one is (while one is left to win)
    FRESH: 0.6,              // the chance a capsule prefers a prize you do not own yet (when there is one in its tier)
    UP: 0.3,                 // the chance per step a capsule shows one tier lower and upgrades mid-open
    NAME: { c: 'Common', u: 'Uncommon', r: 'Rare', l: 'Legendary' },
    COLOR: { c: '#b9b0cc', u: '#2ee6d6', r: '#ff2e88', l: '#ffc94d' },
  };
  const VAULT_CATS = [
    { id: 'skin', label: 'Cabinets', icon: '\u{1F579}', text: 'The whole machine: frame, bulbs, back panel.' },
    { id: 'paint', label: 'Claw paint', icon: '\u{1F3A8}', text: 'A new coat for every claw type.' },
    { id: 'marquee', label: 'Marquees', icon: '\u{1F4A1}', text: 'The sign on top and how its bulbs chase.' },
    { id: 'outfit', label: 'Outfits', icon: '\u{1F3A9}', text: 'Hats, capes and shades for your crawlers.' },
    { id: 'trail', label: 'Trails', icon: '✨', text: 'What your footsteps leave on the map.' },
  ];
  // The defaults every profile owns (the look the game always had).
  const VAULT_DEFAULT = { skin: 'skin_classic', paint: 'paint_chrome', marquee: 'mq_classic', trail: 'trail_dust' };
  const V_ = (id, cat, name, rarity, text, look, extra) => Object.assign({ id, cat, name, rarity, text, look }, extra || {});
  const COSMETIC_LIST = [
    // ---- cabinet skins: frame (fill, trim, frame pattern fp), panel (fill, pattern pp), bulbs (lit, glow, off), neon
    V_('skin_classic', 'skin', 'Neon Classic', 'c', 'The cabinet as the Prize Master built it.', { frame: '#1d1233', trim: null, fp: '', panel: '#0f0a1f', pp: 'dots', bulb: '#fff6c0', glow: '#ffc94d', neon: null }, { free: true }),
    V_('skin_candy', 'skin', 'Candy Shop', 'c', 'Pink stripes, sugar bulbs, a toothache waiting to happen.', { frame: '#ff6fae', trim: '#fff0f7', fp: 'stripes', panel: '#3a0f2a', pp: 'candy', bulb: '#ffffff', glow: '#ff9ad0', neon: '#ff9ad0' }),
    V_('skin_wood', 'skin', 'Retro Wood', 'c', 'Walnut veneer and brass, like the machine in the diner.', { frame: '#6b3f1f', trim: '#c9a24a', fp: 'grain', panel: '#20140c', pp: 'planks', bulb: '#ffe9b0', glow: '#ffb347', neon: '#ffb347' }),
    V_('skin_chrome', 'skin', 'Chrome Deluxe', 'u', 'Polished steel, rivets and a cold blue glow.', { frame: '#8e9bb0', trim: '#e8f0ff', fp: 'rivets', panel: '#10151d', pp: 'grid', bulb: '#e8f6ff', glow: '#8dfff5', neon: '#8dfff5' }),
    V_('skin_jungle', 'skin', 'Jungle Bash', 'u', 'Vines on the frame, leaves on the glass, something growling.', { frame: '#2e5a1e', trim: '#a6ff5e', fp: 'vines', panel: '#0d1f0f', pp: 'leaves', bulb: '#e4ffb0', glow: '#a6ff5e', neon: '#a6ff5e' }),
    V_('skin_haunted', 'skin', 'Haunted House', 'u', 'Cobwebs, bats and bulbs that glow a sickly green.', { frame: '#2a2238', trim: '#9b7bff', fp: 'drips', panel: '#0b0714', pp: 'bats', bulb: '#d6ffc2', glow: '#7dff7a', neon: '#9b7bff' }),
    V_('skin_space', 'skin', 'Deep Space', 'r', 'A starfield behind the pile and planets on the frame.', { frame: '#1a1f4a', trim: '#6f8cff', fp: 'stars', panel: '#05061a', pp: 'stars', bulb: '#ffffff', glow: '#9b7bff', neon: '#6f8cff' }),
    V_('skin_lava', 'skin', 'Molten Core', 'r', 'Cracked basalt with lava glowing through the seams.', { frame: '#2e0f08', trim: '#ff5a1f', fp: 'cracks', panel: '#1a0604', pp: 'lava', bulb: '#ffd27a', glow: '#ff5a1f', neon: '#ff5a1f' }),
    V_('skin_gold', 'skin', 'Gold Jackpot', 'l', 'Solid gold, coins on the frame. Only a Mega Jackpot earns it.', { frame: '#b8860b', trim: '#fff1a8', fp: 'coins', panel: '#1f1605', pp: 'coins', bulb: '#fff6c0', glow: '#ffc94d', neon: '#ffc94d' }, { ach: 'mega' }),
    V_('skin_rainbow', 'skin', 'Rainbow Riot', 'l', 'Every colour at once, chasing around the frame.', { frame: '#1d1233', trim: '#ffffff', fp: 'rainbow', panel: '#0f0a1f', pp: 'rainbow', bulb: '#ffffff', glow: '#ffffff', neon: '#ff2e88', rainbow: true }),
    // ---- claw paint: c1 (the body), c2 (rivets, seams, accents), fx (rainbow, glow, sparkle, stripe, stealth, frost)
    V_('paint_chrome', 'paint', 'Factory Chrome', 'c', 'Bright steel, straight off the line.', { c1: '#c9d3e0', c2: '#8e98a8', fx: '' }, { free: true }),
    V_('paint_bubblegum', 'paint', 'Bubblegum', 'c', 'Pink enough to pop.', { c1: '#ff9ad0', c2: '#ff4fa3', fx: '' }),
    V_('paint_mint', 'paint', 'Mint Chip', 'c', 'Cool green with dark flecks.', { c1: '#9df5d0', c2: '#2e9c6a', fx: '' }),
    V_('paint_copper', 'paint', 'Copper Pot', 'c', 'Warm copper that never goes green.', { c1: '#e0935a', c2: '#8a4a1e', fx: '' }),
    V_('paint_stealth', 'paint', 'Stealth Black', 'u', 'Matte black with red eyes. Nobody hears it coming.', { c1: '#3a3d46', c2: '#1b1d22', fx: 'stealth' }),
    V_('paint_glow', 'paint', 'Glow in the Dark', 'u', 'Charged by the neon, it glows green all turn.', { c1: '#c8ffd8', c2: '#3ddc84', fx: 'glow', glow: '#6bff9a' }),
    V_('paint_candy', 'paint', 'Candy Cane', 'u', 'Red and white stripes down every prong.', { c1: '#ffffff', c2: '#ff2e4a', fx: 'stripe' }),
    V_('paint_gold', 'paint', 'Solid Gold', 'r', 'It sparkles. It is probably not real gold.', { c1: '#ffd35a', c2: '#b8860b', fx: 'sparkle' }),
    V_('paint_frost', 'paint', 'Frostbite', 'r', 'Ice blue, cold to the touch, flakes drifting off.', { c1: '#bff4ff', c2: '#3aa8e6', fx: 'frost', glow: '#8dfff5' }),
    V_('paint_rainbow', 'paint', 'Rainbow Chrome', 'l', 'The whole spectrum, shifting as it moves.', { c1: '#ff2e88', c2: '#ffffff', fx: 'rainbow' }),
    // ---- marquees: text, style (neon, retro, dots, glitch, fire, gold, rainbow), bulbs (chase, blink, wave, sparkle, alt)
    V_('mq_classic', 'marquee', 'CLAWSPIRE', 'c', 'The name in neon, bulbs chasing round.', { text: 'CLAWSPIRE', style: 'neon', bulbs: 'chase' }, { free: true }),
    V_('mq_grab', 'marquee', 'GRAB IT!', 'c', 'Chunky yellow letters, bulbs blinking together.', { text: 'GRAB IT!', style: 'retro', bulbs: 'blink', col: '#ffe066' }),
    V_('mq_prize', 'marquee', 'PRIZE ZONE', 'u', 'Letters made of bulbs, a wave rolling through.', { text: 'PRIZE ZONE', style: 'dots', bulbs: 'wave', col: '#8dfff5' }),
    V_('mq_glitch', 'marquee', 'CL4WSP1RE', 'u', 'A sign that hacked itself. The bulbs twinkle at random.', { text: 'CL4WSP1RE', style: 'glitch', bulbs: 'sparkle', col: '#ff2e88' }),
    V_('mq_hot', 'marquee', 'HOT CLAW', 'r', 'Flaming letters, every other bulb burning.', { text: 'HOT CLAW', style: 'fire', bulbs: 'alt', col: '#ff8a2b' }),
    V_('mq_winner', 'marquee', 'WINNER!', 'r', 'Gold letters, a fast chase. Beat the Prize Master for it.', { text: 'WINNER!', style: 'gold', bulbs: 'fast', col: '#ffc94d' }, { ach: 'champion' }),
    V_('mq_rainbow', 'marquee', 'JACKPOT', 'l', 'Rainbow letters riding a rainbow wave.', { text: 'JACKPOT', style: 'rainbow', bulbs: 'rainbow', col: '#ffffff' }),
    // ---- crawler outfits: two per crawler; kind hat (style) / shades (style) / cape (colours)
    V_('fit_knight_cape', 'outfit', 'Royal Cape', 'u', 'Red velvet and ermine. Sir Grabsworth insists.', { kind: 'cape', c1: '#d81f3a', c2: '#fff8ec' }, { char: 'knight' }),
    V_('fit_knight_shades', 'outfit', 'Cool Shades', 'c', 'Sunglasses over a visor. Why not.', { kind: 'shades', style: 'bar', c1: '#12091f', c2: '#2ee6d6' }, { char: 'knight' }),
    V_('fit_alch_wizard', 'outfit', 'Wizard Hat', 'u', 'A starry hat that fizzes when she thinks.', { kind: 'hat', style: 'wizard', c1: '#6b3fd6', c2: '#ffc94d' }, { char: 'alchemist' }),
    V_('fit_alch_flowers', 'outfit', 'Flower Crown', 'c', 'Fresh from the greenhouse behind the forge.', { kind: 'hat', style: 'flowers', c1: '#ff6bb0', c2: '#ffe066' }, { char: 'alchemist' }),
    V_('fit_rogue_pirate', 'outfit', 'Pirate Hat', 'r', 'A tricorn with a skull. Arr, the prizes.', { kind: 'hat', style: 'tricorn', c1: '#1b1320', c2: '#ffc94d' }, { char: 'rogue' }),
    V_('fit_rogue_stars', 'outfit', 'Star Shades', 'c', 'Pink star glasses. Very subtle.', { kind: 'shades', style: 'star', c1: '#ff2e88', c2: '#ffffff' }, { char: 'rogue' }),
    V_('fit_lou_cowboy', 'outfit', 'Ten Gallon Hat', 'u', 'Lou bets it holds ten gallons. It does not.', { kind: 'hat', style: 'cowboy', c1: '#a8703a', c2: '#ffc94d' }, { char: 'gambler' }),
    V_('fit_lou_cape', 'outfit', 'High Roller Cape', 'r', 'Gold lamé and a lucky clover pin.', { kind: 'cape', c1: '#ffc94d', c2: '#3ddc84' }, { char: 'gambler' }),
    // CR8 (round 8): Mama Mech's two
    V_('fit_mama_welder', 'outfit', 'Welding Mask', 'u', 'Flipped up, sparks and all. Mama welds with her eyes closed anyway.', { kind: 'hat', style: 'welder', c1: '#3a3f4a', c2: '#2ee6d6' }, { char: 'engineer' }),
    V_('fit_mama_hardhat', 'outfit', 'Hard Hat', 'r', 'A yellow hard hat with a headlamp. Safety third.', { kind: 'hat', style: 'hardhat', c1: '#ffc94d', c2: '#fff6c0' }, { char: 'engineer' }),
    // ROS (round 10): Ms. Bubbles' two
    V_('fit_bub_showercap', 'outfit', 'Shower Cap', 'c', 'Frilly, pink, and covered in little ducks. Rain or shine.', { kind: 'hat', style: 'showercap', c1: '#ff9ad0', c2: '#ffd23f' }, { char: 'bubbler' }),
    V_('fit_bub_snorkel', 'outfit', 'Snorkel Mask', 'r', 'Diving goggles and a snorkel. For when the bin floods.', { kind: 'shades', style: 'snorkel', c1: '#2ee6d6', c2: '#ffc94d' }, { char: 'bubbler' }),
    // TECH (round 17): Joy Stick's two
    V_('fit_joy_headset', 'outfit', 'Service Headset', 'u', 'Big padded cans and a boom mic. She hears the cabinets humming.', { kind: 'hat', style: 'tech_headset', c1: '#2a2a3a', c2: '#ff7ad9' }, { char: 'techie' }),
    V_('fit_joy_visor', 'outfit', 'Scanline Visor', 'r', 'A wraparound visor with a scanline that never stops scrolling.', { kind: 'shades', style: 'tech_visor', c1: '#2ee6d6', c2: '#ff7ad9' }, { char: 'techie' }),
    // ---- map trails: what the crawler's footsteps leave behind
    V_('trail_dust', 'trail', 'Dust', 'c', 'Plain old footprints in the dust.', { art: 'dust', col: '#b3a4d6' }, { free: true }),
    V_('trail_sparkle', 'trail', 'Sparkles', 'c', 'A little glitter with every step.', { art: 'sparkle', col: '#fff6c0' }),
    V_('trail_hearts', 'trail', 'Hearts', 'c', 'Love for every hex you walk.', { art: 'hearts', col: '#ff6bb0' }),
    V_('trail_fire', 'trail', 'Fire Walk', 'u', 'Hot feet. The map smokes behind you.', { art: 'fire', col: '#ff8a2b' }),
    V_('trail_snow', 'trail', 'Snowfall', 'u', 'Every step a snowflake.', { art: 'snow', col: '#dff6ff' }),
    V_('trail_coins', 'trail', 'Coin Drop', 'r', 'You jingle when you walk.', { art: 'coins', col: '#ffc94d' }),
    V_('trail_confetti', 'trail', 'Confetti', 'r', 'Party wherever you go. Score 25,000 in a run for it.', { art: 'confetti', col: '#2ee6d6' }, { ach: 'high_score' }),
    V_('trail_rainbow', 'trail', 'Rainbow Road', 'l', 'A rainbow ribbon follows you everywhere.', { art: 'rainbow', col: '#ffffff' }),
  ];
  const COSMETICS = {};
  for (const c of COSMETIC_LIST) COSMETICS[c.id] = c;
  const COSMETIC_IDS = COSMETIC_LIST.map((c) => c.id);
  // The cosmetic ids of a category, in shelf order (outfits of one crawler with char).
  function vaultList(cat, char) {
    return COSMETIC_IDS.filter((id) => (!cat || COSMETICS[id].cat === cat) && (!char || COSMETICS[id].char === char));
  }
  // Ticket price, or 0 when it is not for sale (a default, a sticker prize, a legendary: capsule only).
  function vaultPrice(id) {
    const c = COSMETICS[id];
    if (!c || c.free || c.ach || c.rarity === 'l' || c.season) return 0;   // (SEASON: event cosmetics cost the season's currency)
    return VAULT.PRICE[c.rarity] || 0;
  }
  // What a Vault Capsule can hold: everything but the defaults and the sticker prizes.
  function vaultPool(tier) {
    return COSMETIC_IDS.filter((id) => { const c = COSMETICS[id]; return !c.free && !c.ach && (!tier || c.rarity === tier); });
  }
  // How a cosmetic is unlocked, for the shelf: 'own' | 'buy' | 'sticker' | 'capsule'.
  function vaultHow(id) {
    const c = COSMETICS[id];
    if (!c) return null;
    return c.free ? 'own' : c.season ? 'event' : c.school ? 'school' : c.ach ? 'sticker' : c.rarity === 'l' ? 'capsule' : 'buy';   // (SEASON: 'event' = the season's counter)
  }
  // The sticker prizes an achievement id unlocks.
  function vaultForSticker(achId) { return COSMETIC_IDS.filter((id) => COSMETICS[id].ach === achId); }
  /* A Vault Capsule: rng, owned {id: 1}, pity (capsules since the last
     legendary). Rolls the tier (the pity lifts it to legendary while one is
     left to win), prefers a prize you do not own (FRESH), and dresses it for
     the ritual: tier0 shows lower and ups climb to the tier. Returns {id,
     tier0, ups, tier, dupe, tix, pity (the new count), lucky (the pity fired)}. */
  function vaultRoll(rng, owned, pity) {
    owned = owned || {};
    const T = ['c', 'u', 'r', 'l'];
    let tier = wpick(rng, VAULT.CAP_W);
    let lucky = false;
    const unownedL = vaultPool('l').filter((id) => !owned[id]);
    if (tier !== 'l' && (pity | 0) + 1 >= VAULT.PITY && unownedL.length) { tier = 'l'; lucky = true; }
    let pool = vaultPool(tier);
    if (!pool.length) pool = vaultPool(null);
    const fresh = pool.filter((id) => !owned[id]);
    const pickFresh = lucky || (fresh.length && rng() < VAULT.FRESH);
    const id = (pickFresh && fresh.length ? fresh : pool)[Math.floor(rng() * (pickFresh && fresh.length ? fresh.length : pool.length))];
    tier = COSMETICS[id].rarity;
    // the reveal: show a lower tier and climb (never below common)
    let i0 = T.indexOf(tier);
    while (i0 > 0 && rng() < VAULT.UP) i0--;
    const ups = T.slice(i0 + 1, T.indexOf(tier) + 1);
    const dupe = !!owned[id];
    return { id, tier0: T[i0], ups, tier, dupe, tix: dupe ? VAULT.DUPE[tier] || 0 : 0, pity: tier === 'l' ? 0 : (pity | 0) + 1, lucky };
  }
  // ================================================================ /VAULT

  // ================================================================ PETS (companion pets, round 5)
  /* Companion pets (DESIGN.md "Pets"): a small creature that lives on the
     cabinet frame, reacts to everything and helps the claw once a turn
     (twice from Lv 3) with a visible action. Pure data: the game stages the
     actions (game.js PET block), the renderer draws them (render.js PET
     block). `when`: 'turn' acts once the pile settles on your turn (the
     second use after your first grab), 'lift' when the claw lifts cargo,
     'grab' after a grab that delivers enough. `act` is the action the game
     runs; `verb` its label. A run carries one pet (`run.pet`). */
  const PETS = {
    hamster: { id: 'hamster', name: 'Hamster', icon: '\u{1F439}', col: '#f0a860', col2: '#fff1dc', when: 'turn', act: 'nudge', verb: 'NUDGE',
      names: ['Hammy', 'Nibbles', 'Pip', 'Biscuit'], text: 'Runs along the floor and shoves the farthest item toward the chute.',
      quips: ['Wheee!', 'Heave ho!', 'Snack break later.'] },
    parrot: { id: 'parrot', name: 'Parrot', icon: '\u{1F99C}', col: '#3ddc84', col2: '#ff5a4a', when: 'turn', act: 'peck', verb: 'PECK',
      names: ['Polly', 'Captain', 'Mango', 'Squawks'], text: 'Flies in, pecks the most buried item loose and carries it up on top of the pile.',
      quips: ['SQUAWK!', 'Polly wants a prize!', 'Dig it out!', 'Shiny! Shiny!', 'Pieces of eight!'] },
    cat: { id: 'cat', name: 'Cat', icon: '\u{1F408}', col: '#ff9a3c', col2: '#fff1dc', when: 'turn', act: 'bat', verb: 'BAT',
      names: ['Mittens', 'Socks', 'Noodle', 'Pumpkin'], text: 'Bats at the pile: one item flies at the chute. Sometimes it lands in!',
      quips: ['Mrrp.', '*knocks it off the table*', 'Mine now.'] },
    octopus: { id: 'octopus', name: 'Octopus', icon: '\u{1F419}', col: '#c77dff', col2: '#ffd1f0', when: 'lift', act: 'hold', verb: 'HOLD',
      names: ['Inky', 'Squish', 'Octavia', 'Suction'], text: 'Rides the claw on a lift and holds a prize tight: it cannot slip on the way.',
      quips: ['Got it!', 'Eight arms, zero slips.', 'Hold on tight!'] },
    firefly: { id: 'firefly', name: 'Firefly', icon: '✨', col: '#ffe066', col2: '#a6ff5e', when: 'turn', act: 'glow', verb: 'GLOW',
      names: ['Glim', 'Sparky', 'Lumen', 'Twinkle'], text: 'Lights an item: deliver it this turn for bonus gold. Lights Blackout and finds invisible items.',
      quips: ['Over here!', 'Bzzt!', 'Follow the light.'] },
    mouse: { id: 'mouse', name: 'Magnet Mouse', icon: '\u{1F42D}', col: '#b8c0cc', col2: '#ff5a4a', when: 'turn', act: 'pull', verb: 'PULL',
      names: ['Volt', 'Ferris', 'Squeak', 'Coil'], text: 'Pulls one metal item across the floor to right under the claw.',
      quips: ['Squeak!', 'Opposites attract.', 'Zap zap!'] },
    raccoon: { id: 'raccoon', name: 'Trash Raccoon', icon: '\u{1F99D}', col: '#8e8a9a', col2: '#2a2433', when: 'turn', act: 'eat', verb: 'CHOMP',
      names: ['Bandit', 'Rascal', 'Dumpy', 'Scraps'], text: 'Eats one junk item from the bin for the fight. No junk? It digs the pile loose.',
      quips: ['Yum, garbage.', '*crunch crunch*', 'Delicious rock.'] },
    goose: { id: 'goose', name: 'Golden Goose', icon: '\u{1F9A2}', col: '#fff6d6', col2: '#ffc94d', when: 'grab', act: 'egg', verb: 'EGG',
      names: ['Goldie', 'Honk', 'Duchess', 'Nugget'], text: 'Lays a golden egg on a jackpot (a double from Lv 3): gold and tickets.',
      quips: ['HONK!', 'HONK HONK!', 'Golden!'] },
    // ROS (round 10): three more (the game's ROS block runs their tricks)
    penguin: { id: 'penguin', name: 'Penguin', icon: '\u{1F427}', col: '#2a3348', col2: '#ffffff', when: 'turn', act: 'slide', verb: 'SLIDE',
      names: ['Pebble', 'Tux', 'Waddles', 'Skipper'], text: 'Belly-slides along the floor and sweeps every low prize in its path toward the chute.',
      quips: ['Wheeee!', 'Belly slide!', 'Coming through!'] },
    molerat: { id: 'molerat', name: 'Mole Rat', icon: '\u{1F401}', col: '#f2b8a8', col2: '#8a5a4a', when: 'turn', act: 'dig', verb: 'DIG',
      names: ['Digby', 'Nubs', 'Tater', 'Wrinkles'], text: 'Tunnels under the pile and pops the bottom prize up right under the claw. Digs up buried things.',
      quips: ['Dig dig dig!', 'Found one!', 'Tunnel time.'] },
    roomba: { id: 'roomba', name: 'Robot Vacuum', icon: '\u{1F916}', col: '#3a3f4a', col2: '#2ee6d6', when: 'turn', act: 'sweep', verb: 'SWEEP',
      names: ['Dusty', 'Beep', 'Zoomer', 'R-2 Clean'], text: 'Drives along the floor, sucks up junk and small prizes, and dumps them down the chute.',
      quips: ['BEEP BOOP.', 'Cleaning...', 'Dust detected.'] },
  };
  const PET_IDS = ['hamster', 'parrot', 'cat', 'octopus', 'firefly', 'mouse', 'raccoon', 'goose', 'penguin', 'molerat', 'roomba'];
  // XP to reach Lv 1..5: one per item delivered, more for a won fight, a treat.
  const PET_XP = [0, 12, 30, 60, 100];
  const PET_MAX = 5;
  const PET_GAIN = { item: 1, fight: 2, elite: 4, boss: 6, treat: 8 };
  // The pet shop: three pets in the pens, treats for your own (gold, max per shop).
  const PET_SHOP = { offer: 3, treat: 12, treats: 3, swap: 25 };
  function petLevel(xp) {
    xp = Math.max(0, +xp || 0);
    let lv = 1;
    for (let i = 1; i < PET_XP.length; i++) if (xp >= PET_XP[i]) lv = i + 1;
    return Math.min(PET_MAX, lv);
  }
  // XP still needed for the next level ({need, into, span}) or null at the top.
  function petNext(xp) {
    const lv = petLevel(xp);
    if (lv >= PET_MAX) return null;
    const a = PET_XP[lv - 1], b = PET_XP[lv];
    return { need: b - xp, into: xp - a, span: b - a };
  }
  // The action's strength (x1 at Lv 1 to x1.8 at Lv 5) and its uses a turn.
  const petPow = (lv) => 1 + 0.2 * (U.clamp(lv | 0, 1, PET_MAX) - 1);
  const petUses = (lv) => ((lv | 0) >= 3 ? 2 : 1);
  // The look by level: a scarf from Lv 2, a crown from Lv 4, sparkles at Lv 5.
  const petLook = (lv) => ({ scarf: lv >= 2, crown: lv >= 4, aura: lv >= 5 });
  // The Golden Goose's egg: gold and tickets by level; it lays on this many delivered items.
  const petEgg = (lv) => ({ gold: 3 + 2 * U.clamp(lv | 0, 1, PET_MAX), tix: 1 + Math.floor(U.clamp(lv | 0, 1, PET_MAX) / 2), need: (lv | 0) >= 3 ? 2 : 3 });
  // The Firefly's spotlight bonus (gold for delivering the lit item that turn).
  const petGlow = (lv) => 2 + U.clamp(lv | 0, 1, PET_MAX);
  // The pet's own name from a seed (stable across reloads).
  function petName(id, seed) {
    const d = PETS[id];
    if (!d) return 'Buddy';
    const n = d.names.length;
    return d.names[(((seed >>> 0) % n) + n) % n];
  }
  function petNew(id, seed) {
    if (!PETS[id]) return null;
    return { id, name: petName(id, seed), xp: 0, lv: 1, seed: (seed >>> 0) || 1, fed: 0 };
  }
  // A saved pet as it is today (old or junk saves: null, or the fields defaulted).
  function petFix(p) {
    if (!p || typeof p !== 'object' || !PETS[p.id]) return null;
    const xp = Math.max(0, Math.floor(+p.xp || 0));
    const o = { id: p.id, name: typeof p.name === 'string' && p.name ? p.name.slice(0, 16) : petName(p.id, p.seed | 0), xp, lv: petLevel(xp), seed: (p.seed >>> 0) || 1, fed: Math.max(0, p.fed | 0) };
    if (p.evo && o.lv >= PET_MAX) o.evo = 1;   // TRD (round 14): evolved once, for good (only at the top level; junk is dropped)
    return o;
  }
  // Pets for the shop's pens: n different ids, never the one you have.
  function petOffer(rng, have, n) {
    const pool = PET_IDS.filter((id) => id !== have);
    const out = [];
    n = Math.min(pool.length, n == null ? PET_SHOP.offer : n);
    while (out.length < n) {
      const id = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0];
      out.push(id);
    }
    return out;
  }
  // The card line with the level's numbers in it.
  function petText(id, lv) {
    const d = PETS[id];
    if (!d) return '';
    lv = U.clamp(lv | 0, 1, PET_MAX);
    const uses = petUses(lv) === 2 ? ' Twice a turn.' : '';
    if (d.act === 'egg') { const e = petEgg(lv); return `Lays a golden egg when one grab delivers ${e.need}+ items: ${e.gold} gold, ${e.tix} ticket${e.tix === 1 ? '' : 's'}.${uses}`; }
    if (d.act === 'glow') return `${d.text.replace('bonus gold', petGlow(lv) + ' bonus gold')}${uses}`;
    return d.text + uses;
  }
  // ================================================================ /PETS

  // ================================================================ SECRET (round 6: the Back Room and The Machine)
  /* Three golden keys per run (one per act), each hidden a different way:
     inside a roaming monster, as the jackpot of any arcade cabinet on the
     map, or on a dark hex far from the road. All three before the Prize
     Master falls open a hidden door: THE BACK ROOM, a short secret act 4
     inside the machine, and its boss THE MACHINE (the claw cabinet itself).
     Pure data here; the flow is game.js' SECRET block, the map map.js',
     the fight combat.js' and the look render.js'. See DESIGN.md "Secret act". */
  const SECRET = {
    keys: 3, kinds: ['roam', 'arcade', 'dark'], score: 5000, heal: 0.3,
    // the back room's elites: the meanest of every act, with the strongest affixes stacked on
    eliteAffix: 3, affixPool: ['vampiric', 'hasty', 'armored', 'spiky', 'regen', 'explosive'],
    roomElites: [['frostknight'], ['highcultist'], ['collector'], ['ironjaw'], ['dozer'], ['lodestone']],
    // the service counter: legendary stock, a boss relic
    shop: { items: 5, rarity: 'l', price: [150, 230], relicPrice: 200 },
  };
  // Which act hides its key which way: a seeded order of the three kinds.
  function secKinds(seed) {
    const r = U.rng(U.hashStr('clawspire:secret:' + (seed >>> 0)));
    const k = r.shuffle(SECRET.kinds.slice());
    return { 1: k[0], 2: k[1], 3: k[2] };
  }
  // The run's secret state as it is today (old or junk saves default).
  function secFix(o, seed) {
    const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const keys = {};
    for (const a of [1, 2, 3]) if (src.keys && src.keys[a]) keys[a] = typeof src.keys[a] === 'string' ? src.keys[a] : 'key';
    const kinds = src.kinds && SECRET.kinds.indexOf(src.kinds[1]) >= 0 && SECRET.kinds.indexOf(src.kinds[2]) >= 0 && SECRET.kinds.indexOf(src.kinds[3]) >= 0
      ? { 1: src.kinds[1], 2: src.kinds[2], 3: src.kinds[3] } : secKinds(seed);
    const door = src.door === 'open' || src.door === 'skip' ? src.door : '';
    // room: in the Back Room; beat: The Machine is down; ended: the true ending was shown; done: back out (the win screen)
    return { keys, kinds, door, room: !!src.room && door === 'open', beat: !!src.beat, ended: !!src.ended, done: !!src.done };
  }
  // Golden keys found this run (acts 1..3).
  function secKeyN(run) {
    const k = run && run.sec && run.sec.keys;
    if (!k || typeof k !== 'object') return 0;
    let n = 0;
    for (const a of [1, 2, 3]) if (k[a]) n++;
    return n;
  }
  // The Machine: the claw cabinet itself, awake. Its signature is a cabinet
  // event every action (combat.js SECRET block), a different set per phase:
  // the half hp transformation (OVERCLOCKED) and a final quarter (MELTDOWN,
  // the glass cracks). art stays a data art key; `look` is its own drawing.
  ENEMIES.machine = {
    id: 'machine', name: 'The Machine', act: 3, tier: 'boss', hp: [330, 330], art: 'prizemaster', look: 'machine', size: 1, secret: true, noAffix: true,
    color: '#2ee6d6', color2: '#ff2e88', color3: '#ffc94d',
    desc: 'The claw cabinet itself, awake. The Prize Master never owned the machine. The machine owned the Prize Master.',
    taunt: 'INSERT COIN. INSERT COIN. INSERT YOU.',
    ai: 'cycle', pattern: [0, 2, 1, 3, 4, 5, 6, 1, 7, 8, 0, 4, 5],
    enrage: { name: 'OVERCLOCKED', text: 'Every bulb in the cabinet burns at once', str: 2 },
    sig: { id: 'machine', name: 'Cabinet Event', sign: 'CABINET EVENT', shout: 'MALFUNCTION!', text: 'runs a cabinet event',
      first: 0, every: 1, final: true, finalName: 'MELTDOWN', finalText: 'The glass is cracking. So is it.',
      phases: [['tilt', 'flood', 'claw'], ['grav', 'rail', 'shutter'], ['shutter', 'claw', 'grav', 'rail', 'flood', 'tilt']],
      texts: { tilt: 'tilts the whole cabinet', flood: 'floods your bin with junk', claw: 'takes your claw for a drop', grav: 'flips the gravity for a turn', rail: 'electrifies the claw rail', shutter: 'shutters the prize chute' },
      signs: { tilt: 'BIG TILT', flood: 'JUNK FLOOD', claw: 'HIJACK', grav: 'ZERO G', rail: 'LIVE RAIL', shutter: 'SHUTTER' },
      shouts: { tilt: 'TILT! TILT! TILT!', flood: 'OUT OF ORDER!', claw: 'MY CLAW NOW', grav: 'GRAVITY OFF', rail: 'HIGH VOLTAGE', shutter: 'CLOSED FOR SERVICE' },
      junk: ['rock', 'slag', 'iceblock'], flood: [5, 6, 8], zap: [3, 4, 6], shut: 2, float: [8, 10, 12] },
    moves: [atk('chomp', 'Coin Slot Chomp', 16, 1, 'Chomps with the coin slot for 16'),
      atk('bulbs', 'Bulb Barrage', 5, 4, 'Bulb barrage: 5 x4'),
      blk('glass', 'Tempered Glass', 26, 'Tempers its glass (Block 26)'),
      debuff('static', 'Static Shock', 'weak', 2, 'Static shock (Weak 2)'),
      mv('motor', 'Big Motor', 'charge', 'Winding the big motor (44 next turn)', { v: 44 }),
      atk('slam', 'Cabinet Slam', 24, 1, 'Slams the whole cabinet into you for 24'),
      buff('overclock', 'Overclock', 'str', 2, 'Overclocks (+2 Strength)'),
      buff('service', 'Service Mode', 'shield_up', 2, 'Service mode (Block persists 2 turns)'),
      debuff('glare', 'Marquee Glare', 'vuln', 2, 'Blinds you with the marquee (Vulnerable 2)')],
  };
  // The service counter's stock (legendary items, a boss relic), seeded.
  function secShopStock(rng) {
    const S0 = SECRET.shop, have = {};
    let ids = pool(S0.rarity).filter((id) => ITEMS[id] && !ITEMS[id].bag);
    ids = rng.shuffle(ids).filter((id) => (have[id] ? false : (have[id] = 1))).slice(0, S0.items);
    const items = ids.map((id) => ({ id, price: Math.round(S0.price[0] + rng() * (S0.price[1] - S0.price[0])), sold: false }));
    return { items, relicPrice: S0.relicPrice };
  }
  // ================================================================ /SECRET

  // ================================================================ SETS (relic sets, the boon draft, the Compactor: round 6)
  /* Relic sets (DESIGN.md "Sets, boons and the Compactor"). Ten themed sets
     of three relics; every relic sits in at most one set. Owning 2 pieces
     turns on the set's small bonus, all 3 the big one as well. A bonus is a
     relic-shaped def in SET_FX (hooks / rules / mods / loot / pet, the same
     fields a relic has) that COMBAT runs next to the real relics
     (setFxIds(run) lists the live ones). Nothing about a set is saved: it is
     read off run.relics, so an old save simply has whatever sets it owns. */
  const SETS = {
    poison: { name: "Poisoner's Kit", icon: '🧪', color: '#a6ff5e', kw: 'poison', pieces: ['venom_gland', 'contagion', 'festering_jar'],
      two: { name: 'Toxic Touch', proc: 'TOXIC TOUCH', text: 'Whenever an enemy gains Poison, it gains 1 more.' },
      three: { name: 'Plague Doctor', proc: 'PLAGUE', text: 'At the end of your turn, every poisoned enemy takes its Poison as damage. It ticks twice.' } },
    burn: { name: 'Pyromaniac', icon: '🔥', color: '#ff8a2e', kw: 'burn', pieces: ['flint_striker', 'bellows', 'powder_keg'],
      two: { name: 'Kindling', proc: 'KINDLING', text: 'Whenever an enemy gains Burn, it gains 1 more.' },
      three: { name: 'Wildfire', proc: 'WILDFIRE', text: 'At the start of your turn every enemy gains 2 Burn. A burning enemy that dies spreads its Burn to the rest.' } },
    frost: { name: 'Cold Storage', icon: '🧊', color: '#9fd8ff', kw: 'frost', pieces: ['snow_globe', 'cold_snap', 'permafrost_core'],
      two: { name: 'Ice Box', proc: 'ICE BOX', text: 'Whenever an enemy is Frozen, gain 5 Block.' },
      three: { name: 'Flash Freeze', proc: 'FLASH FREEZE', text: 'The first freeze each turn deals 8 damage to it and gives every other enemy 2 Chill.' } },
    fortress: { name: 'Iron Fortress', icon: '🛡', color: '#7fb2ff', kw: 'fortress', pieces: ['kettle_helm', 'battering_ram', 'castle_walls'],
      two: { name: 'Reinforced', proc: 'REINFORCED', text: 'Start each fight with 6 more Block.' },
      three: { name: 'Siege Engine', proc: 'SIEGE', text: 'Whenever you gain 5 or more Block at once, deal 3 damage to ALL enemies.' } },
    junk: { name: 'Junkyard Dogs', icon: '🔩', color: '#c8a040', kw: 'junk', pieces: ['dumpster_lid', 'recycling_bin', 'junkyard_king'],
      two: { name: 'Scrap Armor', proc: 'SCRAP ARMOR', text: 'Whenever you grab out junk, gain 3 more Block.' },
      three: { name: 'Wrecking Crew', proc: 'WRECKED', text: 'Start each fight with 2 Rocks in your bin. Grabbing out junk deals 8 damage to the targeted enemy.' } },
    luck: { name: 'High Rollers', icon: '🎲', color: '#3ddc84', kw: 'luck', pieces: ['dealers_visor', 'lucky_cat', 'high_roller'],
      two: { name: 'Hot Hand', proc: 'HOT HAND', text: 'Start each turn with 1 more Luck.' },
      three: { name: 'House Money', proc: 'HOUSE MONEY', text: 'Every cash out hands back half the Luck it spent.' } },
    arcade: { name: 'The Arcade Owner', icon: '🕹', color: '#ffc94d', kw: 'jackpot', pieces: ['prize_counter', 'ticket_roll', 'gacha_charm'],
      two: { name: 'Frequent Player', proc: 'REGULAR', text: 'Every jackpot and every grab combo prints 1 more ticket and gives 2 Block.' },
      three: { name: "Owner's Cut", proc: "OWNER'S CUT", text: 'A jackpot gives 1 extra grab (once a turn). Prize capsules upgrade 25% more often.' } },
    glass: { name: 'Glassworks', icon: '🏺', color: '#d8f0ff', kw: 'glass', pieces: ['bottle_deposit', 'sharp_shards', 'glass_cannon'],
      two: { name: 'Tempered', proc: 'TEMPERED', text: 'Whenever a glass item shatters, deal 3 damage to a random enemy.' },
      three: { name: 'Glassblower', proc: 'GLASSBLOWER', text: 'Whenever a glass item shatters, gain 1 Strength and blow a copy of a glass item into your bin (once a turn).' } },
    pack: { name: 'The Hungry Pack', icon: '🐾', color: '#ffb347', kw: 'feast', pieces: ['chew_toy', 'treat_jar', 'dog_whistle'],
      two: { name: 'Pack Tactics', proc: 'PACK TACTICS', text: 'Every trick your pet does deals 3 damage to a random enemy.' },
      three: { name: 'Top Dog', proc: 'TOP DOG', text: 'Your pet does one more trick every turn and its tricks are 50% stronger.' } },
    circus: { name: 'Midnight Circus', icon: '🎪', color: '#b08cff', kw: 'echo', pieces: ['crystal_focus', 'wizard_hat', 'echo_chamber'],
      two: { name: 'Sleight of Hand', proc: 'SLEIGHT', text: 'Magic items get +2 damage, Block and healing, and +1 to the statuses they apply.' },
      three: { name: 'Grand Illusion', proc: 'ILLUSION', text: 'Every 2nd magic item resolves twice (not every 3rd). Start each fight by copying a magic item.' } },
  };
  const SET_IDS = ['poison', 'burn', 'frost', 'fortress', 'junk', 'luck', 'arcade', 'glass', 'pack', 'circus'];
  for (const id of SET_IDS) SETS[id].id = id;
  // A relic id -> its set id (a relic belongs to one set at most).
  const SET_OF = {};
  for (const id of SET_IDS) for (const r of SETS[id].pieces) SET_OF[r] = id;
  // Reward screens redraw toward a missing piece of a set the run holds 1 or
  // 2 of this share of the time (after the build pull, only with a run).
  const SET_PULL = 0.3;

  // The bonuses, as relic-shaped defs. Their hooks use the relic helpers.
  const setOnce = (F, k) => { const m = mem(F); if (m[k] === F.turn) return false; m[k] = F.turn; return true; };
  // A set bonus's own proc label (the relic helper `proc` only knows RELICS).
  const setProc = (F, id, text) => {
    const r = SET_FX[id];
    if (!r || !CB()) return;
    emitE(F, { t: 'proc', src: 'relic', id, name: r.name, icon: r.icon, color: r.color, text: text || r.proc, who: 'player', idx: -1 });
  };
  const SET_BONUS = {
    poison: {
      two: { hooks: { onStatus(F, u, s, v) { if (s === 'poison' && u && u !== F.player && v > 0) foeStatus(F, u, 'poison', 1); } } },
      three: { hooks: { onTurnEnd(F) {
        const hit = aliveOf(F).filter(e => ((e.status && e.status.poison) || 0) > 0);
        if (!hit.length || !CB()) return;
        setProc(F, 'set:poison:3', 'PLAGUE');
        hit.forEach(e => zap(F, e, e.status.poison));
      } } },
    },
    burn: {
      two: { hooks: { onStatus(F, u, s, v) { if (s === 'burn' && u && u !== F.player && v > 0) foeStatus(F, u, 'burn', 1); } } },
      three: { hooks: {
        onTurnStart(F) { allStatus(F, 'burn', 2); },
        onKill(F, e) {
          const b = (e && e.status && e.status.burn) || 0;
          const rest = aliveOf(F).filter(x => x !== e);
          if (!b || !rest.length || !CB()) return;
          setProc(F, 'set:burn:3', 'WILDFIRE ' + b);
          rest.forEach(x => foeStatus(F, x, 'burn', b));
        },
      } },
    },
    frost: {
      two: { hooks: { onStatus(F, u, s, v) { if (s === 'freeze' && u && u !== F.player && v > 0) gainBlock(F, 5); } } },
      three: { hooks: { onStatus(F, u, s, v) {
        if (s !== 'freeze' || !u || u === F.player || !(v > 0) || !CB() || !setOnce(F, 'setFlash')) return;
        zap(F, u, 8);
        aliveOf(F).filter(x => x !== u).forEach(x => foeStatus(F, x, 'chill', 2));
      } } },
    },
    fortress: {
      two: { mods: { startBlock: 6 } },
      three: { hooks: { onBlock(F, amt) { if (amt >= 5) zapAll(F, 3); } } },
    },
    junk: {
      two: { hooks: { onPlay(F, inst, def) { if (isJunkPlay(inst, def)) gainBlock(F, 3); } } },
      three: { hooks: {
        onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'rock', 2); },
        onPlay(F, inst, def) { if (isJunkPlay(inst, def)) zap(F, focus(F), 8); },
      } },
    },
    luck: {
      two: { hooks: { onTurnStart(F) { luckUp(F, 1); } } },
      three: { hooks: { onCashOut(F, luck) { const v = Math.floor((luck | 0) / 2); if (v > 0) luckUp(F, v); } } },
    },
    arcade: {
      two: { hooks: { onJackpot(F) { tix(F, 1); gainBlock(F, 2); }, onCombo(F) { tix(F, 1); gainBlock(F, 2); } } },
      three: { loot: { capUp: 0.25 }, hooks: { onJackpot(F) { if (CB() && setOnce(F, 'setCut')) moreGrabs(F, 1); } } },
    },
    glass: {
      two: { hooks: { onShatter(F) { zap(F, randomFoe(F), 3); } } },
      three: { hooks: { onShatter(F) {
        selfStatus(F, 'str', 1);
        const c = CB();
        if (c && c.copy && setOnce(F, 'setBlow')) c.copy(F, 'glass');
      } } },
    },
    pack: {
      two: { hooks: { onPet(F) { zap(F, randomFoe(F), 3); } } },
      three: { pet: { uses: 1, pow: 0.5 }, hooks: { onPet(F) { setProc(F, 'set:pack:3', 'TOP DOG'); } } },
    },
    circus: {
      two: { rules: { amp: { magic: 2 } } },
      // echo adds up with the Echo Chamber's 3: every 2nd magic item echoes
      three: { rules: { echo: -1 }, hooks: { onFightStart(F) { const c = CB(); if (c && c.copy) c.copy(F, 'magic'); } } },
    },
  };
  // SET_FX['set:<id>:2' | 'set:<id>:3'] and the boon's first fight grabs.
  const SET_FX = {};
  for (const id of SET_IDS) {
    const s = SETS[id];
    for (const n of [2, 3]) {
      const txt = n === 2 ? s.two : s.three, b = SET_BONUS[id][n === 2 ? 'two' : 'three'];
      SET_FX[`set:${id}:${n}`] = Object.assign({ id: `set:${id}:${n}`, name: txt.name, icon: s.icon, rarity: 'set', kw: [s.kw],
        proc: txt.proc, text: txt.text, set: id, n, color: s.color }, b);
    }
  }
  SET_FX['boon:grabs'] = { id: 'boon:grabs', name: 'Warm-Up Tokens', icon: '🪙', rarity: 'boon', kw: ['jackpot'], proc: 'WARM-UP',
    text: '+2 grabs every turn of this fight.', mods: { grabs: 2 }, color: '#ffc94d' };

  const relicIdsOf = (x) => (Array.isArray(x) ? x : (x && Array.isArray(x.relics) ? x.relics : []));
  // The set a relic belongs to, or null.
  function setOf(relicId) { return SET_OF[relicId] || null; }
  // How many distinct pieces of a set a relic list (or a run) holds.
  function setCount(relics, id) {
    const s = SETS[id], have = relicIdsOf(relics);
    return s ? s.pieces.filter(r => have.indexOf(r) >= 0).length : 0;
  }
  // Every set the list holds at least one piece of: [{id, n, have, missing}].
  function setProgress(relics) {
    const have = relicIdsOf(relics), out = [];
    for (const id of SET_IDS) {
      const s = SETS[id], got = s.pieces.filter(r => have.indexOf(r) >= 0);
      if (got.length) out.push({ id, n: got.length, have: got, missing: s.pieces.filter(r => got.indexOf(r) < 0) });
    }
    return out;
  }
  // The live bonus ids for a run (or a relic list): 'set:x:2' from 2 pieces,
  // 'set:x:3' too at 3, and the boon's warm-up grabs while they last.
  function setFxIds(run) {
    const have = relicIdsOf(run), out = [];
    // run.noSets: a test pinning one relic's own numbers opts out of the bonuses
    if (!(run && run.noSets)) for (const id of SET_IDS) {
      const n = setCount(have, id);
      if (n >= 2) out.push(`set:${id}:2`);
      if (n >= 3) out.push(`set:${id}:3`);
    }
    if (run && !Array.isArray(run) && run.boon && run.boon.grabs > 0) out.push('boon:grabs');
    return out;
  }
  // The pieces in `ids` that a run holding 1 or 2 of their set is missing.
  function setWant(run, ids) {
    const have = relicIdsOf(run);
    return (ids || []).filter(r => { const s = SET_OF[r]; if (!s || have.indexOf(r) >= 0) return false; const n = setCount(have, s); return n >= 1 && n <= 2; });
  }
  // A card line for a relic that belongs to a set: the count once you take it.
  function setTagOf(relicId, relics) {
    const id = SET_OF[relicId];
    if (!id) return null;
    const have = relicIdsOf(relics), s = SETS[id];
    const n = setCount(have, id) + (have.indexOf(relicId) >= 0 ? 0 : 1);
    return { id, name: s.name, icon: s.icon, color: s.color, n, total: s.pieces.length, completes: n === s.pieces.length && have.indexOf(relicId) < 0,
      text: `${n}/${s.pieces.length} ${s.name}` };
  }

  /* The boon draft (Neow's deal): after character select the machine offers
     three face-down cards, a gift, a boost and a trade, picked by the run's
     seed and its Tilt (higher Tilt: spicier trades, no free rare). */
  const BOONS = {
    // gifts
    gold: { slot: 'gift', name: 'Pocket Change', icon: '🪙', color: '#ffc94d', tilt: [0, 10], text: 'Gain 100 gold.' },
    capsule: { slot: 'gift', name: 'Mystery Capsule', icon: '🔮', color: '#ff9ec7', tilt: [0, 10], text: 'An uncommon or better prize capsule. Crack it right now.' },
    grabs: { slot: 'gift', name: 'Warm-Up Tokens', icon: '🎟', color: '#2ee6d6', tilt: [0, 10], text: '+2 grabs every turn of your first fight.' },
    pet: { slot: 'gift', name: 'Pet Pal', icon: '🐾', color: '#ffb347', tilt: [0, 10], text: 'A buddy jumps out of the prize chute and joins you, already Lv 2.' },
    favor: { slot: 'gift', name: "Prize Master's Favor", icon: '👑', color: '#ffc94d', tilt: [0, 2], text: 'A rare relic, no strings attached. This time.' },
    // boosts
    setpiece: { slot: 'boost', name: 'Starter Set', icon: '⛓', color: '#b08cff', tilt: [0, 10], text: 'A common or uncommon relic that belongs to a set.' },
    trim: { slot: 'boost', name: 'Spring Cleaning', icon: '🧹', color: '#a6ff5e', tilt: [0, 10], text: 'Remove 3 items from your bin (you pick).' },
    polish: { slot: 'boost', name: 'Polish', icon: '✨', color: '#d8f0ff', tilt: [0, 10], text: 'Upgrade 3 random items in your bin.' },
    bulbs: { slot: 'boost', name: 'Bright Idea', icon: '💡', color: '#ffe066', tilt: [0, 10], text: 'Gain 5 bulbs and a lantern.' },
    // trades (the curse-for-power deals)
    pact: { slot: 'trade', name: 'Blood Pact', icon: '🩸', color: '#ff5a4a', tilt: [0, 4], cost: 'Lose 10 Max HP.', text: 'Gain a rare relic.' },
    pockets: { slot: 'trade', name: 'Heavy Pockets', icon: '🪨', color: '#c8a040', tilt: [0, 6], cost: '2 Rocks join your bin for good.', text: 'Gain an uncommon relic and 50 gold.' },
    shark: { slot: 'trade', name: 'Loan Shark', icon: '🦈', color: '#7fb2ff', tilt: [3, 10], cost: 'Lose all your gold.', text: 'Gain a boss relic.' },
    glassjaw: { slot: 'trade', name: 'Glass Jaw', icon: '🥊', color: '#ff2e88', tilt: [5, 10], cost: 'Lose 15 Max HP.', text: 'Gain two rare relics.' },
    devil: { slot: 'trade', name: "Devil's Bargain", icon: '😈', color: '#ff2e30', tilt: [8, 10], cost: 'Lose 20% of your Max HP and a Slag joins your bin.', text: 'Gain a boss relic and a rare relic.' },
  };
  const BOON_IDS = Object.keys(BOONS);
  for (const id of BOON_IDS) BOONS[id].id = id;
  const BOON_SLOTS = ['gift', 'boost', 'trade'];
  // What each boon's relics are rolled from (the rarity pools in ctx.relics).
  const BOON_RELICS = { favor: ['r'], pact: ['r'], pockets: ['u'], shark: ['boss'], glassjaw: ['r', 'r'], devil: ['boss', 'r'] };
  // seed, tilt, ctx {relics: {c, u, r, boss: [ids not owned]}, pets: [ids]}
  // -> three offers [{id, slot, relics?, pet?}], one per slot, the same for the
  // same seed, Tilt and pools.
  function boonOffer(seed, tilt, ctx) {
    ctx = ctx || {};
    tilt = Math.max(0, Math.min(10, tilt | 0));
    const rng = U.rng(((seed >>> 0) ^ Math.imul(tilt + 1, 0x9e3779b1)) >>> 0);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const pools = ctx.relics || {};
    const out = [];
    for (const slot of BOON_SLOTS) {
      const ids = BOON_IDS.filter(id => BOONS[id].slot === slot && tilt >= BOONS[id].tilt[0] && tilt <= BOONS[id].tilt[1]);
      // the trade slot leans to the spiciest deal the Tilt allows
      let id = pick(ids);
      if (slot === 'trade' && tilt >= 3 && rng() < 0.5) id = ids.slice().sort((a, b) => BOONS[b].tilt[0] - BOONS[a].tilt[0])[0];
      const o = { id, slot };
      const want = BOON_RELICS[id];
      if (want) {
        const got = [];
        for (const r of want) {
          const cand = (pools[r] || []).filter(x => got.indexOf(x) < 0);
          if (cand.length) got.push(pick(cand));
        }
        o.relics = got;
      }
      if (id === 'setpiece') {
        const cand = [].concat(pools.c || [], pools.u || []).filter(x => SET_OF[x]);
        o.relics = cand.length ? [pick(cand)] : [];
      }
      if (id === 'pet') { const p = ctx.pets || []; o.pet = p.length ? pick(p) : null; }
      out.push(o);
    }
    return out;
  }

  /* The Compactor: three items go in, one comes out. Three of the same item
     (not all upgraded already) make its plus copy; anything else makes an
     item one rarity above the middle one of the three (junk < common <
     uncommon < rare < legendary) that shares a keyword with the inputs,
     leaning to the keywords most of them share. */
  const CMP = { n: 3, price: 30, RANK: { junk: 0, c: 1, u: 2, r: 3, l: 4 }, RAR: ['junk', 'c', 'u', 'r', 'l'] };
  // insts [{id, plus}] -> {ok, why?, kind: 'plus' | 'rarity', id?, rar?, kw: [ids by count]}
  function cmpRule(insts) {
    const list = (insts || []).filter(i => i && ITEMS[i.id]);
    if (list.length !== CMP.n) return { ok: false, why: `Feed it ${CMP.n} items.`, kw: [] };
    const defs = list.map(i => ITEMS[i.id]);
    const cnt = {};
    for (const d of defs) for (const k of kwIds(d)) cnt[k] = (cnt[k] || 0) + 1;
    const kw = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || ARCH_ORDER.indexOf(a) - ARCH_ORDER.indexOf(b));
    const same = list.every(i => i.id === list[0].id);
    if (same && defs[0].rarity !== 'junk' && defs[0].plus && !list.every(i => i.plus)) return { ok: true, kind: 'plus', id: list[0].id, kw };
    const ranks = defs.map(d => CMP.RANK[d.rarity] || 0).sort((a, b) => a - b);
    const rar = CMP.RAR[Math.min(4, ranks[1] + 1)];
    return { ok: true, kind: 'rarity', rar, kw, cnt };
  }
  // rng, insts, char -> {id, plus} (null when the rule refuses)
  function cmpRoll(rng, insts, char) {
    const R = cmpRule(insts);
    if (!R.ok) return null;
    if (R.kind === 'plus') return { id: R.id, plus: true };
    const ins = insts.map(i => i.id);
    let rar = R.rar, cand = [];
    // a crawler's own pool may run dry at a rarity: step down until it does not
    while (!cand.length && CMP.RANK[rar] >= 1) {
      const all = pool(rar, char).filter(id => ins.indexOf(id) < 0);
      cand = all.filter(id => kwIds(ITEMS[id]).some(k => R.cnt[k]));
      if (!cand.length) cand = all;
      if (!cand.length) rar = CMP.RAR[CMP.RANK[rar] - 1];
    }
    if (!cand.length) return null;
    // weight: how many inputs share each of the candidate's keywords
    const w = cand.map(id => 1 + kwIds(ITEMS[id]).reduce((s, k) => s + (R.cnt[k] || 0) * 2, 0));
    let x = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x < 0) return { id: cand[i], plus: false }; }
    return { id: cand[cand.length - 1], plus: false };
  }
  // ================================================================ /SETS

  // ================================================================ EVOLVE (round 7: item evolutions and pet synergies)
  /* Item evolutions (DESIGN.md "Evolutions and pet synergies (round 7)").
     A recipe is "base item + relic": an upgraded (plus) copy of the base item,
     delivered in a fight while the run holds the relic (or picked at a rest
     or a forge), turns into the evolved item for good. The evolved defs live
     in EVOLVED and are also reachable as ITEMS[id] through NON-ENUMERABLE
     properties: every lookup (COMBAT, the renderer, combos, the bin, the
     save) finds them, while Object.keys(ITEMS) / for..in / ITEM_IDS never
     list them, so reward pools, shops, capsules, the Compactor's pool and
     the Prizedex's item tab stay exactly as before. An evolved item has no
     plus and carries an aura: a relic-shaped def in EVO_FX ('evo:<id>')
     that COMBAT runs next to the relics while the item is in the run's bin.
     Ids never change: the base ids are untouched, the evolved ids are new. */
  const evoProc = (F, id, text) => {
    const r = EVO_FX[id];
    if (!r || !CB()) return;
    emitE(F, { t: 'proc', src: 'relic', id, name: r.name, icon: r.icon, color: r.color, text: text || r.proc, who: 'player', idx: -1 });
  };
  const EVO_LIST = [
    { id: 'excalibur_claw', name: 'Excalibur Claw', from: 'rusty_sword', relic: 'trophy_rack', icon: '⚔', glow: '#ffe27a',
      tags: ['metal', 'weapon'], shape: box(56, 12), density: 1.4, friction: 0.45, color: '#fff3c4', color2: '#3b6fd6', art: 'sword',
      fx: [dmg(18), status('str', 1, 'self')], text: 'Deal {v} damage and gain {v2} Strength. The pile chose you.',
      aura: { name: "King's Oath", proc: "KING'S OATH", text: 'Whenever an enemy dies, gain 5 Block.', hooks: { onKill(F) { gainBlock(F, 5); } } } },
    { id: 'plague_needle', name: 'Plague Needle', from: 'venom_dart', relic: 'festering_jar', icon: '💉', glow: '#a6ff5e',
      tags: ['metal', 'weapon', 'light'], shape: box(50, 10), density: 0.9, friction: 0.45, color: '#c6ff8a', color2: '#3a2f5a', art: 'dagger',
      fx: [dmg(4), status('poison', 7), { k: 'poisonAll' }], text: 'Deal {v} damage and apply {v2} Poison, then every enemy takes its Poison now.',
      aura: { name: 'Epidemic', proc: 'EPIDEMIC', text: 'Whenever an enemy gains Poison, every other enemy gains 1.',
        hooks: { onStatus(F, u, s, v) { if (s === 'poison' && u && u !== F.player && v > 0) aliveOf(F).filter(e => e !== u).forEach(e => foeStatus(F, e, 'poison', 1)); } } } },
    { id: 'nuke_pop', name: 'Nuke Pop', from: 'cherry_bomb', relic: 'powder_keg', icon: '☢', glow: '#ff8a2e',
      tags: ['weapon'], shape: circle(17), density: 1.2, friction: 0.55, restitution: 0.2, color: '#ff3b3b', color2: '#ffe066', art: 'bomb', target: 'all',
      fx: [dmg(10), status('burn', 5, 'all')], text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. Duck.',
      aura: { name: 'Chain Reaction', proc: 'CHAIN REACTION', text: 'Whenever a burning enemy dies, every other enemy takes 8 damage.',
        hooks: { onKill(F, e) { if (e && e.status && e.status.burn > 0) aliveOf(F).filter(x => x !== e).forEach(x => zap(F, x, 8)); } } } },
    { id: 'prism_lance', name: 'Prism Lance', from: 'glass_bead', relic: 'glass_cannon', icon: '🔷', glow: '#9ff6ff',
      tags: ['magic', 'weapon'], shape: box(54, 12), density: 0.8, friction: 0.35, color: '#d8f8ff', color2: '#ff6bd6', art: 'iceshard', target: 'random',
      fx: [dmg(6, 3)], text: 'Split into {n} beams of {v} damage at random enemies. It never shatters.',
      aura: { name: 'Refraction', proc: 'REFRACTION', text: 'Whenever a glass item shatters, deal 5 damage to ALL enemies.', hooks: { onShatter(F) { zapAll(F, 5); } } } },
    { id: 'loaded_fate', name: 'Loaded Fate', from: 'bone_dice', relic: 'high_roller', icon: '🎲', glow: '#3ddc84',
      tags: ['magic'], shape: circle(14), density: 1.1, friction: 0.5, restitution: 0.25, color: '#ffe8a0', color2: '#1a6b3a', art: 'dice',
      fx: [{ k: 'random', v: 11, min: 8, max: 14, n: 2 }, status('luck', 2, 'self')], text: 'Roll {min} to {max} damage twice and gain 2 Luck.',
      aura: { name: 'House Edge', proc: 'HOUSE EDGE', text: 'Cash outs deal 1 more damage per Luck.', rules: { cashAmp: 1 } } },
    { id: 'absolute_zero', name: 'Absolute Zero', from: 'frost_pearl', relic: 'permafrost_core', icon: '❄', glow: '#bfe8ff',
      tags: ['magic'], shape: circle(14), density: 0.9, friction: 0.2, color: '#e8f8ff', color2: '#4aa8ff', art: 'snowball',
      fx: [dmg(4), status('chill', 2, 'all'), status('freeze', 1)], text: 'Deal {v} damage, {v2} Chill to ALL enemies, and Freeze the target.',
      aura: { name: 'Deep Cold', proc: 'DEEP COLD', text: 'Your hits on Frozen enemies deal 25% more (on top of SHATTER).', rules: { shatter: 0.25 } } },
    { id: 'tower_aegis', name: 'Tower Aegis', from: 'pot_lid', relic: 'castle_walls', icon: '🏰', glow: '#8fb6ff',
      tags: ['metal', 'heavy'], shape: box(40, 50), density: 2.2, friction: 0.55, color: '#9fb4d8', color2: '#ffc94d', art: 'shield', target: 'self',
      fx: [block(15), status('thorns', 2, 'self')], text: 'Gain {v} Block and {v2} Thorns. A castle you can carry.',
      aura: { name: 'Battlements', proc: 'BATTLEMENTS', text: 'At the end of your turn, deal a quarter of your Block (up to 15) to ALL enemies.',
        hooks: { onTurnEnd(F) { const v = Math.min(15, Math.floor(((F.player && F.player.block) || 0) / 4)); if (v > 0) zapAll(F, v); } } } },
    { id: 'scrap_titan', name: 'Scrap Titan', from: 'scrap_shield', relic: 'junkyard_king', icon: '🤖', glow: '#ffb347',
      tags: ['metal', 'heavy'], shape: box(42, 40), density: 2.2, friction: 0.6, color: '#b89a6a', color2: '#ff5a4a', art: 'buckler',
      fx: [block(6), blockPer(3, 'junk'), dmgPer(3, 'junk')], text: 'Gain {v} Block, then {v2} Block and {v3} damage for each junk in your bin.',
      aura: { name: 'Scrap Heap', proc: 'SCRAP HEAP', text: 'Start each fight with a Rock in your bin. Grabbing out junk deals 5 damage to ALL enemies.',
        hooks: { onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'rock', 1); }, onPlay(F, inst, def) { if (isJunkPlay(inst, def)) zapAll(F, 5); } } } },
    { id: 'black_death', name: 'Black Death Vial', from: 'toxic_vial', relic: 'contagion', icon: '☠', glow: '#7dff5e',
      tags: ['glass', 'potion'], shape: SHAPES.flask, density: 1, friction: 0.4, color: '#2b1f3a', color2: '#7dff5e', art: 'flask', target: 'all',
      fx: [dmg(3), status('poison', 5, 'all')], text: 'Deal {v} damage and apply {v2} Poison to ALL enemies.',
      aura: { name: 'Miasma', proc: 'MIASMA', text: 'At the end of your turn, every poisoned enemy gains 1 Poison.',
        hooks: { onTurnEnd(F) { aliveOf(F).filter(e => e.status && e.status.poison > 0).forEach(e => foeStatus(F, e, 'poison', 1)); } } } },
    { id: 'midas_coin', name: 'Midas Coin', from: 'lucky_coin', relic: 'money_bags', icon: '👑', glow: '#ffe066',
      tags: ['metal'], shape: circle(16), density: 1.5, friction: 0.35, restitution: 0.15, color: '#ffd84a', color2: '#b8860b', art: 'coin',
      fx: [dmg(8), gold(8)], text: 'Deal {v} damage and gain {v2} gold. Everything it hits is worth something.',
      aura: { name: 'Golden Touch', proc: 'GOLDEN TOUCH', text: 'Whenever you gain gold in a fight, gain that much Block (up to 10).',
        hooks: { onGold(F, amt) { if (amt > 0) gainBlock(F, Math.min(10, amt)); } } } },
    { id: 'swarm_queen', name: 'Swarm Queen', from: 'prize_marble', relic: 'pocket_dimension', icon: '🐝', glow: '#ffe066',
      tags: ['small', 'magic'], shape: circle(13), density: 1, friction: 0.4, restitution: 0.3, color: '#ffcf3f', color2: '#3a2a10', art: 'orb', target: 'random',
      fx: [dmg(3, 4)], text: 'Sting random enemies {n} times for {v} damage each. Small, but she is the queen.',
      aura: { name: 'The Hive', proc: 'THE HIVE', text: 'Whenever you play a small item, deal 2 damage to a random enemy.',
        hooks: { onPlay(F, inst, def) { if (tagged(def, 'small')) zap(F, randomFoe(F), 2); } } } },
    { id: 'echo_grimoire', name: 'Echo Grimoire', from: 'arcane_tome', relic: 'echo_chamber', icon: '📖', glow: '#b08cff',
      tags: ['magic'], shape: box(34, 40), density: 1, friction: 0.55, color: '#5a2b9c', color2: '#9ff6ff', art: 'book',
      fx: [dmg(9), copy('magic'), copy('magic')], text: 'Deal {v} damage and copy {copies} magic items into your bin for this fight.',
      aura: { name: 'Reverb', proc: 'REVERB', text: 'Magic items echo one play sooner (every 2nd with the Echo Chamber).', rules: { echo: -1 } } },
    { id: 'streak_stiletto', name: 'Streak Stiletto', from: 'shiv', relic: 'winning_streak', icon: '🗡', glow: '#2ee6d6',
      tags: ['metal', 'weapon', 'light'], shape: box(46, 10), density: 0.9, friction: 0.45, color: '#e8fbff', color2: '#ff2e88', art: 'dagger',
      fx: [dmg(6), dmgPer(3, 'streak')], text: 'Deal {v} damage, then {v2} more for each grab in your streak.',
      aura: { name: 'Momentum', proc: 'MOMENTUM', text: 'While your grab streak is 5 or more, every grab that brings something up deals 3 damage to a random enemy.',
        hooks: { onGrab(F, n) { if ((n | 0) > 0 && (F.streak | 0) >= 5) zap(F, randomFoe(F), 3); } } } },
    { id: 'phoenix_torch', name: 'Phoenix Torch', from: 'torch', relic: 'bellows', icon: '🔥', glow: '#ff8a2e',
      tags: ['light', 'weapon'], shape: box(14, 50), density: 0.8, friction: 0.5, color: '#ffb347', color2: '#8a2b2b', art: 'torch',
      fx: [dmg(7), status('burn', 6, 'all')], text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. It never goes out.',
      aura: { name: 'Rebirth', proc: 'REBIRTH', text: 'Whenever a burning enemy dies, heal 4 HP.', hooks: { onKill(F, e) { if (e && e.status && e.status.burn > 0) healP(F, 4); } } } },
    // CR8 (round 8): Mama Mech's two
    { id: 'thunder_bolt', name: 'Thunder Bolt', from: 'hex_bolt', relic: 'dynamo', icon: '⚡', glow: '#7ff7ff',
      tags: ['metal', 'weapon', 'magic'], shape: box(34, 14), density: 1.5, friction: 0.45, color: '#dff6ff', color2: '#2ee6d6', art: 'key',
      fx: [dmg(8), dmgPer(1, 'metal')], text: 'Deal {v} damage, then {v2} more for each metal item in the cabinet. A turret part.',
      aura: { name: 'Live Wire', proc: 'LIVE WIRE', text: 'At the start of your turn the turret gets a free part. No turret: zap a random enemy for 3.',
        hooks: { onTurnStart(F) { if (F.tur) turParts(F, 1, 'LIVE WIRE'); else zap(F, randomFoe(F), 3); } } } },
    { id: 'mech_plating', name: 'Mech Plating', from: 'tin_plate', relic: 'blueprints', icon: '🛡', glow: '#ffb347',
      tags: ['metal', 'heavy'], shape: box(40, 14), density: 2.0, friction: 0.4, color: '#ffc94d', color2: '#3a3f4a', art: 'buckler', target: 'self',
      fx: [block(10), status('thorns', 2, 'self')], text: 'Gain {v} Block and {v2} Thorns. Riveted to the frame.',
      aura: { name: 'Armor Up', proc: 'ARMOR UP', text: 'At the end of your turn, gain 2 Block per turret level (4 Block without a turret).',
        hooks: { onTurnEnd(F) { gainBlock(F, F.tur ? 2 * (F.tur.lv | 0) || 2 : 4); } } } },
    // ROS (round 10): Ms. Bubbles' two (their auras' `bub` is set in the ROS block below)
    { id: 'captain_quack', name: 'Captain Quack', from: 'rubber_duck', relic: 'foam_machine', icon: '\u{1F986}', glow: '#ffd23f', soap: 2,
      tags: ['light', 'magic'], shape: circle(15), density: 0.5, friction: 0.5, restitution: 0.32, color: '#ffd23f', color2: '#2e6bd6', art: 'horn',
      fx: [dmg(8), status('weak', 1, 'enemy')], text: 'Deal {v} damage, apply {v2} Weak and blow two bubbles. Aye aye.',
      aura: { name: 'Duck Patrol', proc: 'DUCK PATROL', text: 'Every bubble you pop in the chute deals 3 damage to a random enemy. No bubbles: a grab of 2+ items does.',
        hooks: { onGrab(F, n) { if (!F.bub && (n | 0) >= 2) zap(F, randomFoe(F), 3); } } } },
    { id: 'bubble_shield', name: 'Bubble Shield', from: 'soap_bar', relic: 'soap_dish', icon: '\u{1F6E1}', glow: '#8dfff5', soap: 1,
      tags: ['magic'], shape: box(34, 20), density: 0.8, friction: 0.12, color: '#bff4ff', color2: '#ff9ad0', art: 'bread', target: 'self',
      fx: [block(12)], text: 'Gain {v} Block and blow a bubble. It wobbles, it holds.',
      aura: { name: 'Suds Armor', proc: 'SUDS ARMOR', text: 'A bubble that bursts in the bin at the end of your turn gives 3 Block. No bubbles: gain 2 Block at the end of your turn.',
        hooks: { onTurnEnd(F) { if (!F.bub) gainBlock(F, 2); } } } },
  ];
  const EVOLVED = {}, EVOLUTIONS = {}, EVO_OF = {}, EVO_FX = {};
  for (const d of EVO_LIST) {
    const def = Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'enemy', tags: [] }, d, { rarity: 'l', cost: 0, evolved: true });
    delete def.aura;
    const a = d.aura, fxId = 'evo:' + d.id;
    def.auraId = fxId; def.auraName = a.name; def.auraText = a.text;
    EVOLVED[d.id] = def;
    // reachable as ITEMS[id], never listed by Object.keys(ITEMS) (see above)
    Object.defineProperty(ITEMS, d.id, { value: def, enumerable: false, configurable: true, writable: true });
    EVOLUTIONS[d.id] = { id: d.id, from: d.from, relic: d.relic, to: d.id, name: d.name, icon: d.icon, glow: d.glow };
    EVO_OF[d.from] = d.id;
    EVO_FX[fxId] = Object.assign({ id: fxId, name: a.name, icon: d.icon, rarity: 'evo', kw: kwIds(def).slice(0, 1), proc: a.proc, text: a.text,
      color: d.glow, evo: d.id }, a.hooks ? { hooks: a.hooks } : {}, a.rules ? { rules: a.rules } : {});
  }
  const EVO_IDS = EVO_LIST.map(d => d.id);
  // The recipe that evolves this base item id (or null).
  function evoOf(itemId) { const to = EVO_OF[itemId]; return to ? EVOLUTIONS[to] : null; }
  // The recipe a bin instance is ready for: plus, a real item (not a fight
  // copy, not junk), and the relic in hand. relics: an id list or a run.
  function evoReady(inst, relics) {
    if (!inst || !inst.plus || inst.temp || inst.junk) return null;
    const r = evoOf(inst.id), have = relicIdsOf(relics);
    return r && have.indexOf(r.relic) >= 0 ? r : null;
  }
  // The auras a run carries: one per evolved item id in its bin.
  function evoAuraIds(run) {
    const out = [];
    for (const i of (run && Array.isArray(run.bin) ? run.bin : [])) {
      const d = i && !i.temp ? EVOLVED[i.id] : null;
      if (d && out.indexOf(d.auraId) < 0) out.push(d.auraId);
    }
    return out;
  }
  // meta.evo {seen: {evolvedId: 1}, made, syn, new: {evolvedId: 1}}: a junk value becomes the default.
  function evoMetaFix(o) {
    const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const seen = {}, fresh = {};
    if (src.seen && typeof src.seen === 'object') for (const k in src.seen) if (EVOLVED[k] && src.seen[k]) seen[k] = 1;
    if (src.new && typeof src.new === 'object') for (const k in src.new) if (seen[k] && src.new[k]) fresh[k] = 1;
    const n = (v) => Math.max(0, Math.floor(+v) || 0);
    return { seen, made: n(src.made), syn: n(src.syn), new: fresh };
  }

  /* Pet synergies: each companion pet gets a bonus trick with a build. on(run)
     reads the run only (relics, the claw type, the bin, the sets); the game
     applies the effect in the pet's trick and fires a {t:'proc', src:'pet'}. */
  const relicKw = (run, k) => relicIdsOf(run).some(id => RELICS[id] && (RELICS[id].kw || []).indexOf(k) >= 0);
  const binHas = (run, p) => (run && Array.isArray(run.bin) ? run.bin : []).some(i => i && ITEMS[i.id] && p(ITEMS[i.id]));
  const PET_SYN = {
    hamster: { name: 'Marble Run', icon: '🎱', color: '#2ee6d6', need: 'a Swarm relic',
      text: 'Every shove flicks your small items too: 2 damage to a random enemy for each small item in the cabinet (up to 5).', on: (run) => relicKw(run, 'swarm') },
    parrot: { name: 'Mimic', icon: '🦜', color: '#b08cff', need: 'an Echo relic',
      text: 'The item it carries is copied into your bin for this fight (up to 3 a fight).', on: (run) => relicKw(run, 'echo') },
    cat: { name: 'Fire Cat', icon: '🔥', color: '#ff8a2e', need: 'a Pyro item in your bin',
      text: 'It bats Pyro items first, and every Pyro item it bats gives ALL enemies 2 Burn.', on: (run) => binHas(run, (d) => kwIds(d).indexOf('burn') >= 0) },
    octopus: { name: 'Two Arms', icon: '🐙', color: '#c77dff', need: 'the Tri-Claw',
      text: 'On the Tri-Claw it holds the two lowest prizes on a lift, not one.', on: (run) => !!run && run.clawType === 'tri' },
    firefly: { name: 'Frost Light', icon: '❄', color: '#9fd8ff', need: 'a Frost relic',
      text: 'An item in its spotlight that is played against a Frozen enemy resolves twice.', on: (run) => relicKw(run, 'frost') },
    mouse: { name: 'Double Pull', icon: '🧲', color: '#ff5a4a', need: 'the Magnet Crane',
      text: 'On the Magnet Crane it pulls two metal items to the claw, not one.', on: (run) => !!run && run.clawType === 'magnet' },
    raccoon: { name: "King's Feast", icon: '👑', color: '#ffc94d', need: 'Junkyard King',
      text: 'Every junk it eats gives 1 Strength and 3 Block.', on: (run) => relicIdsOf(run).indexOf('junkyard_king') >= 0 },
    goose: { name: 'Golden Clutch', icon: '🥚', color: '#ffe066', need: '2 pieces of High Rollers',
      text: 'It lays two golden eggs at once, and every clutch gives 1 Luck.', on: (run) => setCount(run, 'luck') >= 2 },
    // ROS (round 10): the new three (COMBAT.rosPetSyn runs the effect)
    penguin: { name: 'Snowball Fight', icon: '❄', color: '#9fd8ff', need: 'a Frost item in your bin',
      text: 'Every slide chills the room: 1 Chill to ALL enemies, 2 if it swept three or more prizes.', on: (run) => binHas(run, (d) => kwIds(d).indexOf('frost') >= 0) },
    molerat: { name: 'Gold Digger', icon: '\u{1FA99}', color: '#ffc94d', need: 'a Greed relic',
      text: 'Every dig turns up buried coins: 3 gold, 1 more per level.', on: (run) => relicKw(run, 'greed') },
    roomba: { name: 'Turbo Suction', icon: '\u{1F300}', color: '#2ee6d6', need: 'the Vacuum Nozzle',
      text: 'On the Vacuum Nozzle it carries two more, and every sweep gives 3 Block.', on: (run) => !!run && run.clawType === 'vacuum' },
  };
  for (const id in PET_SYN) PET_SYN[id].id = id;
  // The pet's synergy when the run has switched it on, else null.
  function petSynOn(petId, run) {
    const s = PET_SYN[petId];
    if (!s) return null;
    try { return s.on(run) ? s : null; } catch (e) { return null; }
  }

  // Combos with the evolved items and the pets (COMBAT passes ctx.pet).
  const evoIs = (d) => !!(d && d.evolved);
  COMBO_LIST.push(
    { id: 'legend_rising', name: 'Legend Rising', tier: 2, family: 'evo', color: '#ffe27a', target: 'all',
      text: 'An evolved item and two more: deal 10 damage to ALL enemies and gain 6 Block.', fx: [dmg(10), block(6)],
      match: (d) => d.length >= 3 && d.some(evoIs), example: ['excalibur_claw', 'femur', 'crisp_apple'], miss: ['rusty_sword', 'femur', 'crisp_apple'] },
    { id: 'twin_legends', name: 'Twin Legends', tier: 3, family: 'evo', color: '#fff6a0', target: 'all', secret: true,
      text: 'Two different evolved items in one grab: deal 25 damage to ALL enemies and gain 2 Strength.', fx: [dmg(25), status('str', 2, 'self')],
      match: (d) => kinds(d, evoIs) >= 2, example: ['excalibur_claw', 'plague_needle'], miss: ['excalibur_claw', 'excalibur_claw'] },
    { id: 'fetch', name: 'Fetch!', tier: 2, family: 'fetch', color: '#ff9ec7', target: 'enemy',
      text: 'A bone and a ball with your pet along: strike twice for 6 and gain 4 Block.', fx: [dmg(6, 2), block(4)],
      match: (d, ctx) => !!ctx && !!ctx.pet && roles(d, [artIs('bone'), artIs('orb')]), ctx: { pet: 'hamster' },
      example: ['femur', 'bouncy_ball'], miss: ['femur', 'crisp_apple'] },
    { id: 'nest_egg', name: 'Nest Egg', tier: 2, family: 'nest', color: '#ffe066', target: 'all',
      text: 'An egg and a coin with the Golden Goose along: gain 12 gold and deal 8 damage to ALL enemies.', fx: [gold(12), dmg(8)],
      match: (d, ctx) => !!ctx && ctx.pet === 'goose' && roles(d, [artIs('egg'), artIs('coin')]), ctx: { pet: 'goose' },
      example: ['quail_egg', 'lucky_penny'], miss: ['quail_egg', 'femur'] },
  );
  for (const c of COMBO_LIST) if (!COMBOS[c.id]) COMBOS[c.id] = c;
  const EVO_COMBOS = ['legend_rising', 'twin_legends', 'fetch', 'nest_egg'];

  // Two stickers (the board caps the list, see the data suite).
  for (const a of [
    A_('evolved', 'It Evolved!', '\u{1F9EC}', '#ffe27a', 'Evolve an item: an upgraded item and its relic.', (c) => (((c.meta && c.meta.evo) || {}).made | 0) >= 1),
    A_('best_buds', 'Best Buds', '\u{1F43E}', '#ff9ec7', 'Set off a pet synergy in a fight.', (c) => (((c.meta && c.meta.evo) || {}).syn | 0) >= 1),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // ================================================================ /EVOLVE

  // ================================================================ SEASON (round 7: seasonal events)
  /* Seasonal events (DESIGN.md "Seasonal events (round 7)"). A season is a
     date span (month, day inclusive at both ends; a span may wrap the
     new year) with its own content: items, relics, costumed enemies, an
     elite, a map tile, cosmetics bought with its own currency, a sticker.
     Everything here is pure: seasonAt(date) reads only the date it is
     given (a Date, a timestamp or 'YYYY-MM-DD'), never the clock.
     The seasonal items, relics, enemies and cosmetics are reachable as
     ITEMS[id] / RELICS[id] / ENEMIES[id] / COSMETICS[id] through
     NON-ENUMERABLE properties (like the evolved items): every lookup finds
     them (COMBAT, the renderer, the save), while Object.keys / for..in /
     ITEM_IDS never list them, so the year-round pools, shops, capsules, the
     Prizedex and the Vault shelves stay exactly as they are. The game's
     SEASON block brings them in while a run's season is on. */
  const seaAdd = (T, d) => { Object.defineProperty(T, d.id, { value: d, enumerable: false, configurable: true, writable: true }); return d; };
  const SEASONS = {
    halloween: {
      id: 'halloween', name: 'Claw-o-ween', icon: '\u{1F383}', from: [10, 1], to: [11, 3], col: '#ff8a1f', col2: '#9b4dff',
      cur: { id: 'candy', name: 'candy', one: 'candy', icon: '\u{1F36C}', col: '#ff8a1f' },
      blurb: 'Costumed monsters, trick-or-treat doors, candy in every fight. Spend it at the Candy Counter in the Prize Vault.',
      counter: 'Candy Counter', look: 'spooky', music: 'spooky',
      items: ['candy_corn', 'bag_candycorn', 'pumpkin_bomb', 'cursed_lollipop', 'haunted_teddy', 'witch_broom', 'skull_candle'],
      relics: ['candy_bucket', 'jack_o_lantern', 'witch_brew', 'ghost_sheet'],
      costumes: { rat: 'rat_vamp', slime: 'slime_ghost', goblin: 'goblin_witch' }, elite: 'pumpking', tile: 'treat',
      cosmetics: ['skin_sea_mansion', 'paint_sea_pumpkin', 'fit_knight_witch', 'fit_alch_witch', 'fit_rogue_witch', 'fit_lou_witch', 'fit_mama_witch', 'fit_bub_witch', 'fit_joy_witch', 'trail_sea_bats'],
      hats: ['witch', 'pumpkin', 'horns'],
    },
    winter: {
      id: 'winter', name: 'Winter Wonderclaw', icon: '❄', from: [12, 10], to: [1, 6], col: '#8dfff5', col2: '#ff2e4a',
      cur: { id: 'flakes', name: 'snowflakes', one: 'snowflake', icon: '❄', col: '#bff4ff' },
      blurb: 'Costumed monsters, advent calendars on every map, Krampus on the prowl, snowflakes in every fight. Spend them at the Snowflake Stand in the Prize Vault.',
      counter: 'Snowflake Stand', look: 'snowy', music: 'jingle',
      // WIN (round 12): the winter content, defined in the WIN block after /SEASON
      items: ['bag_snowball', 'candy_cane', 'hot_cocoa', 'present_box', 'ornament', 'fruitcake', 'jingle_bell', 'yule_log'],
      relics: ['win_stocking', 'mistletoe', 'sleigh_bells', 'warm_scarf'],
      costumes: { rat: 'rat_reindeer', slime: 'slime_snowman', goblin: 'goblin_elf' }, elite: 'krampus', tile: 'advent',
      cosmetics: ['skin_sea_frost', 'skin_sea_ginger', 'paint_sea_holly', 'paint_sea_cane', 'mq_sea_festive', 'trail_sea_flakes',
        'fit_knight_scarf', 'fit_alch_scarf', 'fit_rogue_scarf', 'fit_lou_scarf', 'fit_mama_scarf', 'fit_bub_scarf', 'fit_joy_scarf'],
      hats: ['santa', 'elf', 'antlers'],
    },
  };
  const SEASON_IDS = Object.keys(SEASONS);
  // Dials: costumes, the Pumpkin King, generic party hats, the doors, the currency.
  const SEA_K = {
    costumeP: 0.55,          // a monster with a costume wears it this often in season
    kingP: 0.45,             // an act 1 elite fight (not a tower) is the season's elite this often
    hatP: 0.3,               // any other monster turns up in a party hat this often
    treatN: [3, 4],          // trick-or-treat doors per map (the big world gets the top)
    treatGap: 4, treatStart: 3,
    earn: { normal: 3, elite: 8, boss: 15, costume: 2, king: 12, treat: [8, 14], corn: 1 },
    // a door's outcome: 70% treats, 30% tricks
    treat: { candy: 22, gold: 18, capsule: 16, item: 10, relic: 4, fight: 18, curse: 12 },
    curse: 'slag',
  };
  // 'YYYY-MM-DD' / a Date / a timestamp -> {y, m, d} (local calendar), null when unreadable.
  function seaYmd(date) {
    if (date == null) return null;
    if (typeof date === 'string') {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date);
      return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
    }
    const dt = typeof date === 'number' ? new Date(date) : date;
    if (!dt || typeof dt.getFullYear !== 'function' || !isFinite(dt.getTime())) return null;
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  const seaMd = (m, d) => m * 100 + d;
  function seaIn(def, ymd) {
    const a = seaMd(def.from[0], def.from[1]), b = seaMd(def.to[0], def.to[1]), x = seaMd(ymd.m, ymd.d);
    return a <= b ? (x >= a && x <= b) : (x >= a || x <= b);
  }
  // The season on a date (its def), or null.
  function seasonAt(date) {
    const ymd = seaYmd(date);
    if (!ymd) return null;
    for (const id of SEASON_IDS) if (seaIn(SEASONS[id], ymd)) return SEASONS[id];
    return null;
  }
  const seaTime = (date) => (typeof date === 'string' ? (() => { const q = seaYmd(date); return q ? new Date(q.y, q.m - 1, q.d).getTime() : NaN; })() : typeof date === 'number' ? date : (date && date.getTime ? date.getTime() : NaN));
  /* The span of a season around a date: the one it is in, else the next
     one. {start, end} timestamps, end exclusive (the local midnight after
     the last day), so a countdown is end - now. */
  function seasonWindow(id, date) {
    const def = SEASONS[id], ymd = seaYmd(date);
    if (!def || !ymd) return null;
    const wraps = seaMd(def.from[0], def.from[1]) > seaMd(def.to[0], def.to[1]);
    let y0 = ymd.y;
    if (wraps && seaMd(ymd.m, ymd.d) <= seaMd(def.to[0], def.to[1])) y0 -= 1;   // January of a span that began last year
    let start = new Date(y0, def.from[0] - 1, def.from[1]).getTime();
    let end = new Date(y0 + (wraps ? 1 : 0), def.to[0] - 1, def.to[1] + 1).getTime();
    if (seaTime(date) >= end) { start = new Date(y0 + 1, def.from[0] - 1, def.from[1]).getTime(); end = new Date(y0 + 1 + (wraps ? 1 : 0), def.to[0] - 1, def.to[1] + 1).getTime(); }
    return { start, end };
  }
  // Milliseconds left in the season on that date (0 when it is not on).
  function seasonLeft(id, date) {
    const def = SEASONS[id], ymd = seaYmd(date);
    if (!def || !ymd || !seaIn(def, ymd)) return 0;
    const w = seasonWindow(id, date), now = seaTime(date);
    return w && isFinite(now) ? Math.max(0, w.end - now) : 0;
  }
  // The profile's seasonal fields (meta.sea): the preview pick, the wallets, the counters.
  function seaFix(o) {
    const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const num = (v) => Math.max(0, Math.floor(+v || 0));
    const bag = (v) => { const out = {}; if (v && typeof v === 'object' && !Array.isArray(v)) for (const k in v) out[k] = num(v[k]); return out; };
    const pv = typeof src.preview === 'string' && (src.preview === 'off' || SEASONS[src.preview]) ? src.preview : '';
    return { preview: pv, wallet: bag(src.wallet), earned: bag(src.earned), spent: bag(src.spent), knocks: num(src.knocks), king: num(src.king),
      runs: bag(src.runs), seen: bag(src.seen), adv: winAdvFix(src.adv) };   // (WIN: the advent calendar)
  }
  // Currency a won fight drops: by tier, plus the costumed monsters beaten and the season's elite.
  function seaEarn(tier, costumed, king) {
    const E = SEA_K.earn;
    return (E[tier] || E.normal) + (costumed | 0) * E.costume + (king ? E.king : 0);
  }
  /* A trick-or-treat door: rng, act, ctx {relics: ids still to win, items}.
     -> {kind: 'treat' | 'trick', k, candy, gold?, id?, tier?}. A treat always
     carries candy on top of its prize; a trick is a fight or a curse. */
  function seaTreatRoll(rng, act, ctx) {
    ctx = ctx || {};
    const w = Object.assign({}, SEA_K.treat);
    const relics = (ctx.relics || []).filter((id) => RELICS[id]);
    const items = (ctx.items || SEASONS.halloween.items).filter((id) => ITEMS[id]);
    if (!relics.length) w.relic = 0;
    if (!items.length) w.item = 0;
    const k = wpick(rng, w);
    const [c0, c1] = SEA_K.earn.treat;
    const a = Math.max(1, act | 0);
    const out = { kind: k === 'fight' || k === 'curse' ? 'trick' : 'treat', k, candy: 0 };
    if (out.kind === 'treat') out.candy = c0 + Math.floor(rng() * (c1 - c0 + 1));
    if (k === 'candy') out.candy += 6;
    if (k === 'gold') out.gold = 18 + Math.floor(rng() * 16) + 6 * (a - 1);
    if (k === 'capsule') out.tier = rng() < 0.3 ? 'u' : 'c';
    if (k === 'item') out.id = items[Math.floor(rng() * items.length)];
    if (k === 'relic') out.id = relics[Math.floor(rng() * relics.length)];
    if (k === 'curse') out.id = SEA_K.curse;
    return out;
  }
  // ---- Claw-o-ween's items (a pumpkin is a real bomb: its fuse lights)
  const SEA_ITEMS = [
    { id: 'candy_corn', name: 'Candy Corn', rarity: 'c', cost: 15, season: 'halloween', sea: { candy: 1 },
      tags: ['small', 'food'], shape: circle(10), density: 0.8, friction: 0.4, restitution: 0.15,
      color: '#ff8a1f', color2: '#ffe066', art: 'gem', target: 'self',
      fx: [heal(1), block(1)], plus: { fx: [heal(2), block(2)] }, text: 'Heal {v} and gain {v2} Block. In season, every one you land is a piece of candy.' },
    { id: 'bag_candycorn', name: 'Candy Corn Bag', rarity: 'c', cost: 30, season: 'halloween',
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#ff8a1f', color2: '#3a1f4a', art: 'orb', target: 'none', exhaust: true,
      bag: ['candy_corn', 'candy_corn', 'candy_corn'], fx: [],
      text: 'Adds 3 Candy Corn to your bin. Nobody knows who likes it. You will.' },
    { id: 'pumpkin_bomb', name: 'Pumpkin Bomb', rarity: 'u', cost: 70, season: 'halloween',
      tags: ['weapon'], shape: circle(15), density: 1.2, friction: 0.5, restitution: 0.2,
      color: '#ff8a1f', color2: '#2e6a1e', art: 'bomb', target: 'all',
      fx: [dmg(5), status('burn', 2, 'all')], plus: { fx: [dmg(7), status('burn', 3, 'all')] },
      text: 'Deal {v} damage and apply {v2} Burn to ALL enemies. Carved with love, lit with malice.' },
    { id: 'cursed_lollipop', name: 'Cursed Lollipop', rarity: 'u', cost: 60, season: 'halloween',
      tags: ['magic', 'food'], shape: box(40, 14), density: 0.8, friction: 0.45,
      color: '#9b4dff', color2: '#ffe066', art: 'wand',
      fx: [dmg(9), status('poison', 3), status('weak', 1, 'self')], plus: { fx: [dmg(12), status('poison', 4), status('weak', 1, 'self')] },
      text: 'Deal {v} damage and apply {v2} Poison. Cursed: you get {v3} Weak.' },
    { id: 'haunted_teddy', name: 'Haunted Teddy', rarity: 'r', cost: 110, season: 'halloween',
      tags: ['magic', 'light'], shape: egg(14, 17), density: 0.6, friction: 0.55, restitution: 0.2,
      color: '#b98a5a', color2: '#7dff7a', art: 'heart', target: 'self',
      fx: [block(7), status('weak', 2, 'all')], plus: { fx: [block(10), status('weak', 3, 'all')] },
      text: 'Gain {v} Block and apply {v2} Weak to ALL enemies. It floats. It watches. It hugs.' },
    { id: 'witch_broom', name: 'Witch Broom', rarity: 'u', cost: 65, season: 'halloween', sea: { sweep: 1 },
      tags: ['tool', 'light'], shape: box(56, 10), density: 0.6, friction: 0.5,
      color: '#c9a24a', color2: '#6b3f1f', art: 'feather',
      fx: [dmg(5), block(3)], plus: { fx: [dmg(8), block(4)] },
      text: 'Deal {v} damage and gain {v2} Block, then it sweeps the pile toward the chute.' },
    { id: 'skull_candle', name: 'Skull Candle', rarity: 'r', cost: 100, season: 'halloween',
      tags: ['light'], shape: SHAPES.skull, density: 0.9, friction: 0.5,
      color: '#f1e9d6', color2: '#ff8a1f', art: 'torch', target: 'all',
      fx: [status('burn', 4, 'all'), status('vuln', 1, 'all')], plus: { fx: [status('burn', 6, 'all'), status('vuln', 2, 'all')] },
      text: 'Apply {v} Burn and {v2} Vulnerable to ALL enemies. The wax screams a little.' },
  ];
  for (const d of SEA_ITEMS) {
    const def = Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'enemy', tags: [] }, d);
    if (def.plus) def.plus = Object.assign({ name: def.name + '+' }, def.plus);
    seaAdd(ITEMS, def);
  }
  // ---- Claw-o-ween's relics (the Candy Bucket's sea field: more candy per win)
  const SEA_RELICS = [
    { id: 'candy_bucket', name: 'Candy Bucket', icon: '\u{1F36C}', rarity: 'c', season: 'halloween', sea: { candy: 2 }, kw: ['feast'], proc: 'TREAT',
      text: 'Every kill heals 2 HP. In season, each fight you win drops 2 more candy.', hooks: { onKill(F) { healP(F, 2); } } },
    { id: 'jack_o_lantern', name: "Jack-o'-Lantern", icon: '\u{1F383}', rarity: 'u', season: 'halloween', kw: ['burn'], proc: 'SPOOKY',
      text: 'At the start of your turn, apply 1 Burn to ALL enemies.', hooks: { onTurnStart(F) { allStatus(F, 'burn', 1); } } },
    { id: 'witch_brew', name: "Witch's Brew", icon: '\u{1F9D9}', rarity: 'u', season: 'halloween', kw: ['poison'], proc: 'BREW',
      text: 'Every potion you play also applies 2 Poison to a random enemy.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'potion')) foeStatus(F, randomFoe(F), 'poison', 2); } } },
    { id: 'ghost_sheet', name: 'Ghost Sheet', icon: '\u{1F47B}', rarity: 'r', season: 'halloween', kw: ['fortress'], proc: 'BOO',
      text: 'Start each fight with 1 Dodge. Whenever you take damage, gain 3 Block.',
      hooks: { onFightStart(F) { selfStatus(F, 'dodge', 1); }, onHurt(F) { gainBlock(F, 3); } } },
  ];
  for (const r of SEA_RELICS) seaAdd(RELICS, r);
  // ---- costumed monsters (the base monster plus a twist) and the season's elite
  const SEA_ENEMIES = [
    { id: 'rat_vamp', name: 'Count Ratula', act: 1, tier: 'normal', hp: [17, 21], art: 'rat', costume: 'vampire', base: 'rat', size: 0.85, color: '#8a7a9a',
      season: 'halloween', desc: 'A Coin Rat in a cape. It drinks now, and hides in the cape when you swing.', ai: 'weighted',
      moves: [w(atk('bite', 'Fang Bite', 5, 1, 'Bites for 5'), 3), w(mheal('drain', 'Drain', 5, 'Drinks deep (heals 5)'), 2),
        w(buff('cape', 'Cape Swirl', 'dodge', 1, 'Hides in its cape (Dodge 1)'), 1)] },
    { id: 'slime_ghost', name: 'Sheet Slime', act: 1, tier: 'normal', hp: [30, 38], art: 'slime', costume: 'ghost', base: 'slime', size: 1, color: '#c8ffd8',
      season: 'halloween', desc: 'A slime under a bedsheet. Your first hit goes straight through it.', ai: 'cycle', pattern: [0, 1, 0, 2],
      status: { dodge: 1 },
      moves: [atk('slam', 'Slam', 7, 1, 'Slams for 7'), debuff('boo', 'Boo!', 'weak', 1, 'BOO! Your hands shake (Weak)'),
        blk('wobble', 'Wobble', 6, 'Wobbles under the sheet (Block 6)')],
      onDeath: { k: 'summon', id: 'slimeling' } },
    { id: 'goblin_witch', name: 'Goblin Witch', act: 1, tier: 'normal', hp: [26, 33], art: 'goblin', costume: 'witch', base: 'goblin', size: 1, color: '#6bd35e',
      season: 'halloween', desc: 'Traded the wrench for a broom. The spells are worse than the swings.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [atk('jab', 'Broom Jab', 5, 1, 'Jabs for 5'), debuff('hex', 'Hex', 'vuln', 1, 'Hexes you (Vulnerable)'),
        mv('brew', 'Toss Brew', 'junk', 'Tosses a Slag into your bin', { item: 'slag', n: 1 }),
        mv('windup', 'Wind Up', 'charge', 'Winding up a big swing (14 next turn)', { v: 14 })] },
    { id: 'pumpking', name: 'The Pumpkin King', act: 1, tier: 'elite', hp: [60, 68], art: 'mushroom', look: 'pumpking', size: 1.15,
      color: '#ff8a1f', color2: '#2e6a1e', color3: '#ffe066', season: 'halloween',
      desc: 'Carved himself a crown and rules the patch with an iron vine. Lobs lit pumpkins into your bin.',
      ai: 'cycle', pattern: [0, 2, 1, 3, 4, 2], taunt: 'Trick or treat? I only do tricks.',
      moves: [atk('lash', 'Vine Lash', 9, 1, 'Lashes for 9'), bombMv('pumpkin', 'Lit Pumpkin', 8, 2, 'Lobs a lit pumpkin into your bin (8 in 2 turns)'),
        atk('seeds', 'Seed Spit', 3, 3, 'Spits seeds 3 x3'), buff('moon', 'Harvest Moon', 'str', 2, 'Grows under the moon (+2 Strength)'),
        mv('squash', 'Squash', 'charge', 'Rolling up for a squash (18 next turn)', { v: 18 })],
      enrage: { name: "JACK'S FURY", text: 'The candle inside burns white hot', str: 2 } },
  ];
  for (const e of SEA_ENEMIES) seaAdd(ENEMIES, Object.assign({ size: 1 }, e));
  // ---- the event cosmetics: bought with the season's currency, owned for good
  const SEA_COSMETICS = [
    V_('skin_sea_mansion', 'skin', 'Haunted Mansion', 'r', 'Rotten boards, jack-o-lanterns on the frame, a full moon behind the pile.',
      { frame: '#2b1a12', trim: '#ff8a1f', fp: 'sea_pumpkins', panel: '#140b1c', pp: 'sea_moon', bulb: '#ffd08a', glow: '#ff8a1f', neon: '#9b4dff' }, { season: 'halloween', price: 120 }),
    V_('paint_sea_pumpkin', 'paint', 'Pumpkin Spice', 'u', 'Orange and black, with a candle glowing inside.', { c1: '#ff8a1f', c2: '#2a1a12', fx: 'glow', glow: '#ffb347' }, { season: 'halloween', price: 80 }),
    V_('fit_knight_witch', 'outfit', 'Witch Hat', 'u', 'A pointy hat over the visor. Sir Grabsworth is a good witch.', { kind: 'hat', style: 'witch', c1: '#2a1a3a', c2: '#ff8a1f' }, { char: 'knight', season: 'halloween', price: 60 }),
    V_('fit_alch_witch', 'outfit', 'Witch Hat', 'u', 'A crooked hat with a buckle. Finally, the right uniform.', { kind: 'hat', style: 'witch', c1: '#3a1a5a', c2: '#a6ff5e' }, { char: 'alchemist', season: 'halloween', price: 60 }),
    V_('fit_rogue_witch', 'outfit', 'Witch Hat', 'u', 'A black hat, a purple band. Very sneaky, very spooky.', { kind: 'hat', style: 'witch', c1: '#1b1320', c2: '#9b4dff' }, { char: 'rogue', season: 'halloween', price: 60 }),
    V_('fit_lou_witch', 'outfit', 'Witch Hat', 'u', 'Lou bets the hat is lucky. A spider lives in it.', { kind: 'hat', style: 'witch', c1: '#241a2e', c2: '#3ddc84' }, { char: 'gambler', season: 'halloween', price: 60 }),
    V_('fit_mama_witch', 'outfit', 'Witch Hat', 'u', 'Riveted, of course. The brim folds out into a spanner.', { kind: 'hat', style: 'witch', c1: '#2a2230', c2: '#ff8a2e' }, { char: 'engineer', season: 'halloween', price: 60 }),   // (CR8)
    V_('fit_bub_witch', 'outfit', 'Witch Hat', 'u', 'A cauldron of foam on top. It bubbles over at midnight.', { kind: 'hat', style: 'witch', c1: '#3a2a5a', c2: '#8dfff5' }, { char: 'bubbler', season: 'halloween', price: 60 }),   // (ROS)
    V_('fit_joy_witch', 'outfit', 'Witch Hat', 'u', 'A pointy hat with a blinking service LED on the band. Spooky, but serviced.', { kind: 'hat', style: 'witch', c1: '#2a1a3a', c2: '#ff7ad9' }, { char: 'techie', season: 'halloween', price: 60 }),   // (TECH)
    V_('trail_sea_bats', 'trail', 'Bat Trail', 'r', 'Little bats flap up out of every step you take.', { art: 'bats', col: '#2a1a3a' }, { season: 'halloween', price: 90 }),
    V_('skin_sea_frost', 'skin', 'Frosted Cabinet', 'r', 'Snow on the roof, icicles on the frame, a cosy frost on the glass.',
      { frame: '#dfeaf5', trim: '#ff2e4a', fp: 'sea_icicles', panel: '#0c1a2a', pp: 'sea_snow', bulb: '#ffffff', glow: '#8dfff5', neon: '#ff2e4a' }, { season: 'winter', price: 120 }),
    V_('paint_sea_holly', 'paint', 'Hollyberry', 'u', 'Holly green with red berry rivets and a sparkle of frost.', { c1: '#2e9c4a', c2: '#d81f3a', fx: 'sparkle' }, { season: 'winter', price: 80 }),
  ];
  for (const c of SEA_COSMETICS) seaAdd(COSMETICS, c);
  const SEA_COSMETIC_IDS = SEA_COSMETICS.map((c) => c.id);
  // The season's cosmetics of a category (outfits of one crawler with char).
  function seaCosmetics(id, cat, char) {
    const S0 = SEASONS[id];
    const ids = S0 ? S0.cosmetics : SEA_COSMETIC_IDS;
    return ids.filter((x) => COSMETICS[x] && (!cat || COSMETICS[x].cat === cat) && (!char || COSMETICS[x].char === char));
  }
  // The costumed twin of a monster in a season (null when it has none).
  function seaCostumeOf(season, enemyId) {
    const S0 = SEASONS[season];
    const id = S0 && S0.costumes ? S0.costumes[enemyId] : null;
    return id && ENEMIES[id] ? id : null;
  }
  // One sticker for the event (the board's cap is shared with the other rounds).
  for (const a of [
    A_('trick_or_treat', 'Trick or Treat!', '\u{1F383}', '#ff8a1f', 'Knock on 5 trick-or-treat doors during Claw-o-ween.',
      (c) => (((c.meta && c.meta.sea) || {}).knocks | 0) >= 5, { goal: 5, val: (c) => ((c.meta && c.meta.sea) || {}).knocks | 0, season: 'halloween' }),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // ================================================================ /SEASON

  // ================================================================ WIN (round 12: Winter Wonderclaw)
  /* The winter event's content (DESIGN.md "Winter Wonderclaw (round 12)") on
     the round 7 season system: eight items (plus the Packed Snowball filler
     their sack holds), a Lump of Coal (Krampus's junk), four relics, three
     costumed monsters, Krampus (the winter elite), the advent calendar's
     gifts and the Snowflake Stand's cosmetics. Everything goes in through
     seaAdd (non-enumerable), so the year-round tables, pools, capsules and
     shelves never list it. Pure: the advent roll reads only its rng. */
  const WIN_K = {
    advMax: 24,              // the calendar's last door (Christmas Eve); later doors keep its gift size
    // an advent door's gift by weight: mostly snowflakes and a little gold, rarely more (loot stays modest)
    adv: { flakes: 44, gold: 28, item: 20, capsule: 5, relic: 3 },
    advFlakes: [4, 7],       // every door's snowflakes, +1 per 3 doors opened before it (at most +6)
    advGold: [8, 14],        // a gold gift, +1 per 2 doors opened before it, +4 an act after the first
    advCapsuleDay: 8,        // no capsule behind the doors before this one
    advRelicDay: 16,         // no relic behind the doors before this one
    advBig: 6,               // every 6th door is a bigger present: +6 snowflakes
    giftU: 0.2,              // the Present Box unwraps an uncommon item this often (else a common one)
  };
  // The profile's advent calendar (meta.sea.adv): the season year it counts for and the doors opened.
  function winAdvFix(o) {
    const src = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    return { y: typeof src.y === 'string' ? src.y.slice(0, 12) : '', n: Math.max(0, Math.min(99, Math.floor(+src.n || 0))) };
  }
  /* An advent door: rng, day (1..24, the door's number on the calendar), act,
     ctx {items: common item ids, relics: ids still to win}. -> {kind: 'treat',
     k, candy (snowflakes), day, big?, gold?, id?, tier?}. Every door carries
     snowflakes; the later the door, the more (bigger if you opened the
     ones before it); capsules and relics are rare and never early. */
  function winAdventRoll(rng, day, act, ctx) {
    ctx = ctx || {};
    const K = WIN_K, d = Math.max(1, Math.min(K.advMax, Math.floor(+day || 1))), prev = d - 1;
    const w = Object.assign({}, K.adv);
    const items = (ctx.items || []).filter((id) => ITEMS[id]);
    const relics = (ctx.relics || []).filter((id) => RELICS[id]);
    if (!items.length) w.item = 0;
    if (!relics.length || d < K.advRelicDay) w.relic = 0;
    if (d < K.advCapsuleDay) w.capsule = 0;
    const k = wpick(rng, w);
    const [f0, f1] = K.advFlakes;
    const out = { kind: 'treat', k, day: d, candy: f0 + Math.floor(rng() * (f1 - f0 + 1)) + Math.min(6, Math.floor(prev / 3)) };
    if (d % K.advBig === 0) { out.big = true; out.candy += 6; }
    if (k === 'flakes') out.candy += 4;
    if (k === 'gold') out.gold = K.advGold[0] + Math.floor(rng() * (K.advGold[1] - K.advGold[0] + 1)) + Math.floor(prev / 2) + 4 * (Math.max(1, act | 0) - 1);
    if (k === 'item') out.id = items[Math.floor(rng() * items.length)];
    if (k === 'capsule') out.tier = 'c';
    if (k === 'relic') out.id = relics[Math.floor(rng() * relics.length)];
    return out;
  }
  // The common items an advent door (or a Present Box, uncommons too) can hold: the season's commons and the shared pool.
  function winGiftPool(char, rarity) {
    const r = rarity || 'c';
    const sea = SEASONS.winter.items.filter((id) => ITEMS[id] && ITEMS[id].rarity === r && !ITEMS[id].bag);
    return sea.concat(pool(r, char || null).filter((id) => !ITEMS[id].bag && !ITEMS[id].season));
  }
  // ---- the winter items (the Present Box unwraps, the Packed Snowball pays a snowflake, the ornament is glass)
  const WIN_ITEMS = [
    { id: 'win_snowball', name: 'Packed Snowball', rarity: 'c', cost: 15, season: 'winter', sea: { candy: 1 },
      tags: ['small'], shape: circle(10), density: 0.8, friction: 0.35, restitution: 0.1,
      color: '#f4fbff', color2: '#9fd8ff', art: 'snowball',
      fx: [dmg(2), status('chill', 1)], plus: { fx: [dmg(3), status('chill', 2)] }, text: 'Deal {v} damage and apply {v2} Chill. In season, every one you land is a snowflake.' },
    { id: 'bag_snowball', name: 'Snowball Sack', rarity: 'c', cost: 30, season: 'winter',
      tags: [], shape: circle(14), density: 1.0, friction: 0.5,
      color: '#c8b08a', color2: '#d81f3a', art: 'orb', target: 'none', exhaust: true,
      bag: ['win_snowball', 'win_snowball', 'win_snowball'], fx: [],
      text: 'Adds 3 Packed Snowballs to your bin. Rolled fresh this morning.' },
    { id: 'candy_cane', name: 'Candy Cane', rarity: 'u', cost: 60, season: 'winter',
      tags: ['weapon', 'food'], shape: box(44, 10), density: 0.9, friction: 0.4,
      color: '#ffffff', color2: '#e8203a', art: 'wand',
      fx: [dmg(4, 2), heal(1)], plus: { fx: [dmg(5, 2), heal(2)] }, text: 'Deal {v} damage {n} times and heal {v2}. Sharpened peppermint.' },
    { id: 'hot_cocoa', name: 'Hot Cocoa', rarity: 'c', cost: 40, season: 'winter',
      tags: ['potion', 'food'], shape: poly([[-12, -12], [12, -12], [10, 12], [-10, 12]]), density: 1.0, friction: 0.5,
      color: '#7a4a2a', color2: '#fff4e0', art: 'potion', target: 'self',
      fx: [heal(5), cleanse()], plus: { fx: [heal(8), cleanse()] }, text: 'Heal {v} and wash off your debuffs. Marshmallows included.' },
    { id: 'present_box', name: 'Present Box', rarity: 'u', cost: 55, season: 'winter', sea: { gift: 1 },
      tags: ['light'], shape: box(30, 28), density: 0.7, friction: 0.55,
      color: '#d81f3a', color2: '#ffc94d', art: 'dice', target: 'self',
      fx: [block(3)], plus: { fx: [block(5)] }, text: 'Gain {v} Block, then it unwraps into a random item that joins your bin this fight.' },
    { id: 'ornament', name: 'Glass Ornament', rarity: 'u', cost: 65, season: 'winter',
      tags: ['glass', 'magic'], shape: circle(13), density: 0.6, friction: 0.35, restitution: 0.25,
      color: '#2e9cff', color2: '#ffc94d', art: 'orb', target: 'all',
      fx: [dmg(5), status('vuln', 1, 'all')], plus: { fx: [dmg(7), status('vuln', 2, 'all')] },
      text: 'Deal {v} damage and apply {v2} Vulnerable to ALL enemies. Glass: it floats down gently.' },
    { id: 'fruitcake', name: 'Fruitcake', rarity: 'c', cost: 20, season: 'winter',
      tags: ['heavy', 'food'], shape: SHAPES.bread, density: 2.6, friction: 0.8,
      color: '#7a3f1f', color2: '#e8203a', art: 'bread', target: 'self',
      fx: [heal(3), block(3)], plus: { fx: [heal(4), block(5)] }, text: 'Heal {v} and gain {v2} Block. Weighs as much as an anvil. Nobody has ever finished one.' },
    { id: 'jingle_bell', name: 'Jingle Bell', rarity: 'r', cost: 95, season: 'winter',
      tags: ['magic', 'light', 'metal'], shape: circle(11), density: 0.7, friction: 0.4, restitution: 0.2,
      color: '#ffc94d', color2: '#d81f3a', art: 'ring', target: 'all',
      fx: [status('weak', 2, 'all'), status('chill', 2, 'all')], plus: { fx: [status('weak', 3, 'all'), status('chill', 3, 'all')] },
      text: 'Apply {v} Weak and {v2} Chill to ALL enemies. It floats, jingling all the way.' },
    { id: 'yule_log', name: 'Yule Log', rarity: 'r', cost: 100, season: 'winter',
      tags: ['heavy'], shape: box(48, 18), density: 1.4, friction: 0.6,
      color: '#8a5a2e', color2: '#ff8a2e', art: 'torch', target: 'all',
      fx: [status('burn', 4, 'all'), block(4)], plus: { fx: [status('burn', 6, 'all'), block(6)] },
      text: 'Apply {v} Burn to ALL enemies and gain {v2} Block. Cosy for you, not for them.' },
    // Krampus's junk: heavy, sooty, useless
    { id: 'win_coal', name: 'Lump of Coal', rarity: 'junk', cost: 0, season: 'winter',
      tags: ['junk', 'heavy'], shape: poly([[-12, -5], [-4, -11], [9, -9], [13, 2], [6, 10], [-9, 9]]), density: 2.2, friction: 0.75,
      color: '#2a2628', color2: '#ff6a3a', art: 'rock', target: 'none', exhaust: true,
      fx: [], text: 'For the naughty. Heavy, sooty, useless. Grab it out to clear it for this fight.' },
  ];
  for (const d of WIN_ITEMS) {
    const def = Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'enemy', tags: [] }, d);
    if (def.plus) def.plus = Object.assign({ name: def.name + '+' }, def.plus);
    seaAdd(ITEMS, def);
  }
  // ---- the winter relics (the Stocking's sea field: more snowflakes per win)
  const WIN_RELICS = [
    { id: 'win_stocking', name: 'Stocking', icon: '\u{1F9E6}', rarity: 'c', season: 'winter', sea: { candy: 2 }, kw: ['feast'], proc: 'STUFFED',
      text: 'Whenever you play a food item, heal 2 HP. In season, each fight you win drops 2 more snowflakes.',
      hooks: { onPlay(F, inst, def) { if (tagged(def, 'food') && !isJunkPlay(inst, def)) healP(F, 2); } } },
    { id: 'mistletoe', name: 'Mistletoe', icon: '\u{1F33F}', rarity: 'u', season: 'winter', kw: ['fortress'], proc: 'SMOOCH',
      text: 'At the start of each fight, apply 1 Weak to ALL enemies. Nobody fights well under the mistletoe.',
      hooks: { onFightStart(F) { allStatus(F, 'weak', 1); } } },
    { id: 'sleigh_bells', name: 'Sleigh Bells', icon: '\u{1F514}', rarity: 'u', season: 'winter', kw: ['frost'], proc: 'JINGLE',
      text: 'At the start of your turn, apply 1 Chill to a random enemy.',
      hooks: { onTurnStart(F) { foeStatus(F, randomFoe(F), 'chill', 1); } } },
    { id: 'warm_scarf', name: 'Warm Scarf', icon: '\u{1F9E3}', rarity: 'r', season: 'winter', kw: ['fortress'], proc: 'TOASTY',
      text: 'Whenever you heal, gain that much Block. Toasty.',
      hooks: { onHeal(F, amt) { if (amt > 0) gainBlock(F, Math.min(12, amt | 0)); } } },
  ];
  for (const r of WIN_RELICS) seaAdd(RELICS, r);
  // ---- costumed monsters (the base monster plus a winter twist) and Krampus
  const WIN_ENEMIES = [
    { id: 'rat_reindeer', name: 'Red-Nosed Rat', act: 1, tier: 'normal', hp: [17, 21], art: 'rat', costume: 'reindeer', base: 'rat', size: 0.85, color: '#a0703f',
      season: 'winter', desc: 'A Coin Rat in antlers, with a nose you could land a sleigh by. It glows right into your glass.', ai: 'weighted',
      moves: [w(atk('antler', 'Antler Butt', 5, 1, 'Butts for 5'), 3), w(atk('dash', 'Sleigh Dash', 2, 3, 'Dashes 2 x3'), 2),
        w(mv('glow', 'Nose Glow', 'fog', 'Its nose glows so bright your glass fogs (1 turn)', { v: 1 }), 1)] },
    { id: 'slime_snowman', name: 'Snowman Slime', act: 1, tier: 'normal', hp: [30, 38], art: 'slime', costume: 'snowman', base: 'slime', size: 1, color: '#eef6ff',
      season: 'winter', desc: 'A slime that rolled through a snowdrift and liked it. Packed hard: every hit loses 1.', ai: 'cycle', pattern: [0, 1, 0, 2],
      status: { armor: 1 },
      moves: [atk('snowball', 'Snowball', 6, 1, 'Throws a snowball for 6'), debuff('hug', 'Cold Hug', 'chill', 2, 'A cold hug (2 Chill)'),
        mv('drift', 'Snow Drift', 'junk', 'Dumps an Ice Block into your bin', { item: 'iceblock', n: 1 })],
      onDeath: { k: 'summon', id: 'slimeling' } },
    { id: 'goblin_elf', name: 'Elf Goblin', act: 1, tier: 'normal', hp: [26, 33], art: 'goblin', costume: 'elf', base: 'goblin', size: 1, color: '#8fae3a',
      season: 'winter', desc: 'Works the toy line now. Wraps presents nobody asked for and throws them at you.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [atk('jab', 'Candy Cane Jab', 5, 1, 'Jabs for 5'), mv('regift', 'Regift', 'junk', 'Regifts a heavy Fruitcake into your bin', { item: 'fruitcake', n: 1 }),
        buff('cheer', 'Holiday Cheer', 'str', 1, 'Whistles a carol (+1 Strength)'), mv('windup', 'Wind Up', 'charge', 'Winding up a big swing (14 next turn)', { v: 14 })] },
    { id: 'krampus', name: 'Krampus', act: 1, tier: 'elite', hp: [64, 70], art: 'goat', look: 'krampus', size: 1.2,
      color: '#4a3032', color2: '#e8dcc0', color3: '#ffcf3a', season: 'winter',
      desc: 'Keeps the naughty list. Horns, chains, a birch switch and a sack with room for one more.',
      ai: 'cycle', pattern: [0, 1, 2, 4, 3, 5], taunt: 'Naughty. Definitely naughty. Get in the sack.',
      // Signature (the Hoard's spill, with coal): a sack of coal into your bin, heavy junk to dig through; two more once enraged.
      sig: { id: 'spill', name: 'Sack of Coal', sign: 'COAL', shout: 'NAUGHTY!', text: 'empties a sack of coal into your bin', first: 2, every: 3, n: 2, item: 'win_coal' },
      moves: [atk('switch', 'Birch Switch', 4, 3, 'Birch switch: 4 x3'), debuff('chains', 'Rattle Chains', 'vuln', 2, 'Rattles its chains (Vulnerable 2)'),
        atk('hoof', 'Hoof Kick', 10, 1, 'Kicks for 10'), buff('list', 'Check the List', 'str', 2, 'Checks the naughty list twice (+2 Strength)'),
        mv('sack', 'Open the Sack', 'charge', 'Opening the sack (20 next turn)', { v: 20 }), debuff('frost', 'Frost Breath', 'chill', 2, 'Breathes frost on you (2 Chill)')],
      enrage: { name: 'NAUGHTY OR NICE', text: 'It checked the list twice. You are on the wrong one.', str: 2, pattern: [0, 2, 4, 1, 5] } },
  ];
  for (const e of WIN_ENEMIES) seaAdd(ENEMIES, Object.assign({ size: 1 }, e));
  // ---- the Snowflake Stand's cosmetics (on top of the Frosted Cabinet and Hollyberry): owned for good
  const WIN_COSMETICS = [
    V_('skin_sea_ginger', 'skin', 'Gingerbread House', 'r', 'Gingerbread walls, icing on every seam, gumdrops on the roof.',
      { frame: '#a0622d', trim: '#fff6ec', fp: 'sea_ginger', panel: '#2a140a', pp: 'sea_gumdrops', bulb: '#fff0c8', glow: '#ffb070', neon: '#ffe0b8' }, { season: 'winter', price: 120 }),
    V_('paint_sea_cane', 'paint', 'Peppermint Swirl', 'u', 'Red and white stripes, a mint green pinstripe and a sugar sparkle.', { c1: '#ffffff', c2: '#e8203a', fx: 'sea_cane', glow: '#3ddc84' }, { season: 'winter', price: 80 }),
    V_('mq_sea_festive', 'marquee', 'MERRY CLAWMAS', 'r', 'Red and green letters in holly, the bulbs twinkling red, green and gold.', { text: 'MERRY CLAWMAS', style: 'sea_festive', bulbs: 'sea_twinkle', col: '#ff2e4a' }, { season: 'winter', price: 100 }),
    V_('trail_sea_flakes', 'trail', 'Snowflake Trail', 'r', 'Six-armed crystal flakes twirl up out of every step.', { art: 'sea_flakes', col: '#dff6ff' }, { season: 'winter', price: 90 }),
    V_('fit_knight_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'A red scarf over the gorget, earmuffs over the visor. Toasty.', { kind: 'hat', style: 'sea_scarf', c1: '#d81f3a', c2: '#fff8ec' }, { char: 'knight', season: 'winter', price: 60 }),
    V_('fit_alch_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Knitted from bubbling yarn. It smells faintly of cinnamon.', { kind: 'hat', style: 'sea_scarf', c1: '#3ddc84', c2: '#ffffff' }, { char: 'alchemist', season: 'winter', price: 60 }),
    V_('fit_rogue_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Black and pink, for sneaking through the snow in style.', { kind: 'hat', style: 'sea_scarf', c1: '#2a2a3a', c2: '#ff2e88' }, { char: 'rogue', season: 'winter', price: 60 }),
    V_('fit_lou_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Green and gold with a clover pin. Lou bet it would not snow.', { kind: 'hat', style: 'sea_scarf', c1: '#2e9c4a', c2: '#ffc94d' }, { char: 'gambler', season: 'winter', price: 60 }),
    V_('fit_mama_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Hi-vis orange, riveted earmuffs. Scarf safety rules apply.', { kind: 'hat', style: 'sea_scarf', c1: '#ff8a2e', c2: '#3a3f4a' }, { char: 'engineer', season: 'winter', price: 60 }),
    V_('fit_bub_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Fluffy as foam, with pompom earmuffs. Very, very soft.', { kind: 'hat', style: 'sea_scarf', c1: '#8dfff5', c2: '#ff9ad0' }, { char: 'bubbler', season: 'winter', price: 60 }),
    V_('fit_joy_scarf', 'outfit', 'Scarf & Earmuffs', 'u', 'Striped in arcade pink, earmuffs with a little antenna each.', { kind: 'hat', style: 'sea_scarf', c1: '#ff7ad9', c2: '#2ee6d6' }, { char: 'techie', season: 'winter', price: 60 }),   // (TECH)
  ];
  for (const c of WIN_COSMETICS) { seaAdd(COSMETICS, c); if (SEA_COSMETIC_IDS.indexOf(c.id) < 0) SEA_COSMETIC_IDS.push(c.id); }
  const WIN_COSMETIC_IDS = WIN_COSMETICS.map((c) => c.id);
  // ================================================================ /WIN

  // ================================================================ CR8 (round 8: Mama Mech and two new claws)
  // DESIGN.md "Mama Mech and two new claws". The crawler, her items, relics,
  // outfits and evolutions sit in their tables above (search CR8); here are
  // the two stickers (the board's cap is shared) and the turret's words.
  for (const a of [
    A_('fully_armed', 'Fully Armed', '\u{1F52B}', '#ff8a2e', "Build Mama Mech's turret up to Lv 5 in a fight.",
      (c) => c.kind === 'ev' && !!c.ev && c.ev.t === 'turret' && c.ev.k === 'up' && (c.ev.lv | 0) >= 5),
    A_('clean_sweep', 'Clean Sweep', '\u{1F32A}', '#9b7bff', 'Suck three prizes up the Vacuum Nozzle and deliver them in one grab.',
      (c) => c.kind === 'tick' && !!c.f && (c.f.grab | 0) >= 3 && RUNS(c).clawType === 'vacuum'),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // The turret's levels as the game shows them (the numbers live in COMBAT.TUR).
  const CR8 = {
    TUR_NAMES: ['Bare Mount', 'Pea Shooter', 'Bolt Gun', 'Rivet Cannon', 'Gatling', 'Mega Mech'],
    TUR_TIP: 'Every metal item you deliver bolts a part onto the turret. It fires at the end of your turn, harder each level.',
  };
  // ================================================================ /CR8

  // ================================================================ ROS (round 10: Ms. Bubbles, the mutator pack, three pets)
  // DESIGN.md "Ms. Bubbles, the mutator pack and three pets (round 10)". The
  // crawler, her items, relics, outfits, evolutions, the six mutators and the
  // three pets sit in their tables above (search ROS); here are the merge of
  // the new mutator fx, the evolved auras' bubble numbers, two stickers and
  // the words the game shows.
  /* The mutator pack's fx on top of mutMods' own: bounce keeps the bounciest,
     clawK multiplies, tremor and flood add, mirror is on if any is, sticky
     keeps the stickiest. (A declaration: mutMods calls it.) */
  function rosMutMerge(m, f) {
    if (!m || !f) return m;
    if (f.bounce != null) m.bounce = Math.max(m.bounce || 0, +f.bounce || 0);
    if (f.clawK != null && +f.clawK > 0) m.clawK = (m.clawK || 1) * +f.clawK;
    if (f.tremor) m.tremor = (m.tremor || 0) + (+f.tremor || 0);
    if (f.mirror) m.mirror = true;
    if (f.sticky != null) m.sticky = Math.max(m.sticky || 0, +f.sticky || 0);
    if (f.flood) m.flood = (m.flood || 0) + (+f.flood || 0);
    return m;
  }
  // The evolved auras' bubble numbers (read by COMBAT's ROS block like a relic's `bub`).
  if (EVO_FX['evo:captain_quack']) EVO_FX['evo:captain_quack'].bub = { dmg: 3 };
  if (EVO_FX['evo:bubble_shield']) EVO_FX['evo:bubble_shield'].bub = { bin: 3 };
  for (const a of [
    A_('foam_party', 'Foam Party', '\u{1F6BF}', '#8dfff5', 'Pop three bubbles in the chute with one grab.',
      (c) => c.kind === 'ev' && !!c.ev && c.ev.t === 'ros' && c.ev.k === 'combo' && (c.ev.n | 0) >= 3),
    A_('squeaky_clean', 'Squeaky Clean', '\u{1F986}', '#ffd23f', 'Win a run as Ms. Bubbles.', (c) => c.kind === 'win' && RUNS(c).char === 'bubbler'),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  const ROS = {
    BUB_TIP: 'Bubbles float prizes up to the claw. A bubbled prize never slips; pop it in the chute for Block, two or more in one grab for a Bubble Combo.',
    MUT_TIP: { mirror: 'MIRROR MODE: steer left, the claw goes right.', sticky: 'STICKY: nothing slips, but it might not let go.', flood: 'RISING WATER: heavy sinks, light floats.' },
  };
  // ================================================================ /ROS

  // ================================================================ TECH (round 17: Cabinet Tech and Joy Stick)
  // DESIGN.md "Cabinet Tech and the new crawler (round 17)". The crawler, her items, the relics,
  // outfits, combos and her Codex page sit in their tables above (search TECH); here are the
  // legendary (The Motherboard), two stickers and techMods, the cabinet numbers the game reads.
  const TECH_LEG = { id: 'leg_motherboard', name: 'The Motherboard', icon: '\u{1F4BE}', rarity: 'l', kw: ['tech'], proc: 'MOTHERBOARD', leg: {},
    text: 'The cabinet answers to you: an event lands every turn, PERFECT grabs light 2 more lamp cells and LAMP FEVER deals 15 damage to ALL enemies. The catch: a grab that brings up nothing drains 3 lamp cells.',
    tech: { evP: 1, first: 1, perfLamp: TECH_K.mbPerfLamp, drain: TECH_K.mbDrain },
    hooks: { onCab(F, kind) { if (kind === 'fever') zapAll(F, TECH_K.mbDmg); } } };
  if (!RELICS[TECH_LEG.id]) { RELIC_LIST.push(TECH_LEG); RELICS[TECH_LEG.id] = TECH_LEG; }
  const TECH_RELICS = ['laser_sight', 'service_key', 'lamp_oil', 'coin_hopper', 'metronome', 'fever_dream', 'circuit_breaker', 'trick_shot', 'double_feature', 'leg_motherboard'];
  const TECH_ITEMS = ['arcade_stick', 'arcade_button', 'coin_mech', 'neon_tube', 'circuit_board', 'extension_cord', 'crt_monitor', 'golden_stick'];
  const TECH_COMBOS = ['coin_op', 'short_circuit', 'bullseye'];
  /* The cabinet numbers a run's relics and crawler add up to (the game's TECH block reads them at
     the bell): evP (more event chance a turn), first (events from turn 1), perfX (px more room
     for a PERFECT), laser (draw the aim), lampStart, coins (more a shower and a fever), coinGold (more a
     coin), double (events land twice), perfLamp (more lamp a PERFECT), drain (lamp a whiff costs). */
  function techMods(relics, charId) {
    const m = { evP: 0, first: 0, perfX: 0, laser: 0, lampStart: 0, coins: 0, coinGold: 0, double: 0, perfLamp: 0, drain: 0 };
    const c = CHARACTERS[charId];
    if (c && c.tech) { m.evP += TECH_K.giftEvP; m.first += TECH_K.giftFirst; m.perfLamp += TECH_K.giftPerfLamp; }
    for (const id of relics || []) {
      const t = RELICS[id] && RELICS[id].tech;
      if (!t) continue;
      for (const k in m) if (+t[k]) m[k] += +t[k];
    }
    m.evP = Math.min(1, m.evP);
    return m;
  }
  for (const a of [
    A_('perfect_game', 'Perfect Game', '\u{1F3AF}', '#ffe066', 'Land five PERFECT grabs in a row.',
      (c) => c.kind === 'ev' && !!c.ev && c.ev.t === 'tech' && c.ev.k === 'perfect' && (c.ev.n | 0) >= 5),
    A_('tech_support', 'Tech Support', '\u{1F579}', '#ff7ad9', 'Win a run as Joy Stick.', (c) => c.kind === 'win' && RUNS(c).char === 'techie'),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  const TECH = { K: TECH_K, RELICS: TECH_RELICS, ITEMS: TECH_ITEMS, COMBOS: TECH_COMBOS, mods: techMods,
    TIP: 'The cabinet works for Joy Stick: more events, from turn 1.' };
  // ================================================================ /TECH

  // ================================================================ STORY (round 8: branching stories, the rival, alternate bosses)
  /* DESIGN.md "Stories, the rival and alternate bosses (round 8)". Pure data
     and pure helpers; the flow is game.js' STORY block, the fight side
     combat.js', the looks render.js'.
     - STORIES: events told in beats (2 to 4 per visit). A beat is {text, art?,
       choices}; a choice is {txt, sub, fx?, go?, set?, add?, call?, cond?,
       roll?} where fx are the event fx kinds (plus 'pet'), go the next beat
       (none: the story ends), set / add write the story's own state (read
       by a later beat's text or a choice's cond(run, st)), call a callback
       that pays off later in the run, and roll {p, win, lose} a dice roll
       whose branches carry their own {go, fx, set, add, call}.
     - Callbacks (run.sto.calls): ally (a friend fights one turn for you in a
       later elite or boss fight), hunt (a Card Shark prowls the next act's
       map, awake), later (the story goes on at an event tile of a later act),
       boss (this act's boss starts sabotaged), shop (a shop of a later act
       hands you a gift).
     - The rival: Grabby Gary (GARY, garyTaunt, garyGear, garyPile, garyPrize)
       and his elite; the alternate bosses: STO.alt (one per act, a coin flip
       against the act's own boss), each with a signature (combat.js). */
  const STO = {
    p: 0.5,            // an event tile tells a story this often (while one fits)
    garyP: 0.85,       // the runs Gary turns up in
    altP: 0.5,         // an act's boss is its alternate this often
    alt: { 1: 'plushqueen', 2: 'conveyorking', 3: 'arcticarcade' },
    own: { 1: 'hoard', 2: 'smelter', 3: 'glacius' },
    ally: { crab: { dmg: 6, perAct: 3, hits: 2, block: 5 }, ghost: { weak: 2, dodge: 1 } },
    sabotage: { hp: 0.12 },
    hunt: ['cardshark'],
    vendy: 'u',
    maxCalls: 12,
  };
  // Bits of fx the stories share.
  const G_ = (v) => ({ k: 'gold', v }), HP_ = (v) => ({ k: 'hp', v }), IT_ = (id) => ({ k: 'item', id });
  const STORY_LIST = [
    { id: 'sto_crab', title: 'The Caged Crab', art: 'crab', acts: [1, 2],
      beats: {
        start: { text: 'A Claw Crab sits in a prize cage. The sign says DO NOT FEED, DO NOT FREE, DO NOT MAKE EYE CONTACT. It is making eye contact.',
          choices: [
            { txt: 'Pick the lock.', sub: 'Roll the dice. Free it, or get pinched.', roll: { p: 0.6, win: { go: 'free' }, lose: { go: 'pinch' } } },
            { txt: 'Buy it out (35 gold).', sub: 'Lose 35 gold. It is free.', fx: [G_(-35)], go: 'free', cond: hasGold(35) },
            { txt: 'Walk away.', sub: 'It watches you go. Sadly.' },
          ] },
        pinch: { text: 'SNAP. The lock holds. The crab does not: it pinches you, then looks deeply sorry about it.',
          choices: [
            { txt: 'Try again.', sub: 'Lose 6 HP. This time it opens.', fx: [HP_(-6)], go: 'free' },
            { txt: 'Leave it be.', sub: 'It salutes you with one claw.' },
          ] },
        free: { text: 'The cage pops open. The crab clicks its claws at you twice. You are fairly sure that means "I owe you one."',
          choices: [
            { txt: 'Share your snack.', sub: 'Lose 4 HP. It will remember this. Fondly.', fx: [HP_(-4)], set: { fed: 1 }, call: { k: 'ally', id: 'crab', pow: 2 } },
            { txt: 'Wave goodbye.', sub: 'It scuttles into the dark. See you around?', call: { k: 'ally', id: 'crab', pow: 1 } },
          ] },
      } },
    { id: 'sto_monte', title: 'Three-Card Monte', art: 'goblin', acts: [1, 2],
      beats: {
        start: { text: 'A goblin in a tiny vest shuffles three cards on an upturned crate. "Find the lady, win the pot. Easy money. For me."',
          choices: [
            { txt: 'Play fair (15 gold).', sub: 'Lose 15 gold. Roll for the lady.', fx: [G_(-15)], cond: hasGold(15), roll: { p: 0.34, win: { go: 'won' }, lose: { go: 'lost' } } },
            { txt: 'Cheat.', sub: 'Peek under the cards while he blinks.', go: 'cheat' },
            { txt: 'Walk away.', sub: 'Your wallet thanks you.' },
          ] },
        won: { text: 'You point. It is the lady. The goblin stares at the card like it betrayed him personally.',
          choices: [{ txt: 'Take the pot.', sub: 'Gain 50 gold.', fx: [G_(50)] }] },
        lost: { text: 'It is a two of clubs. It is always a two of clubs.',
          choices: [
            { txt: 'One more go (15 gold).', sub: 'He is getting sloppy. Probably.', fx: [G_(-15)], cond: hasGold(15), roll: { p: 0.5, win: { go: 'won' }, lose: { go: 'broke' } } },
            { txt: 'Fair enough.', sub: 'Leave poorer and wiser.' },
          ] },
        broke: { text: 'Two of clubs. Again. The goblin tips his hat. You could swear there were only two cards on the table.',
          choices: [{ txt: 'Lesson learned.', sub: 'Nothing happens.' }] },
        cheat: { text: 'You flip a corner while he blinks. The lady winks at you. You win. The goblin does NOT blink. "Nobody cheats Lefty," he says, very quietly.',
          choices: [
            { txt: 'Take the pot and run.', sub: 'Gain 60 gold and a Marked Deck. Lefty has a big brother.', fx: [G_(60), IT_('marked_deck')], set: { cheat: 1 }, call: { k: 'hunt', id: 'shark' } },
            { txt: 'Give it back.', sub: 'He respects that. Gain a Poker Chip.', fx: [IT_('poker_chip')], set: { honest: 1 } },
          ] },
      } },
    { id: 'sto_seed', title: 'The Coin Seed', art: 'coin', acts: [1, 2],
      beats: {
        start: { text: 'A gumball machine full of seeds. The label reads MONEY TREE, 1 PER CUSTOMER, RESULTS MAY VARY.',
          choices: [
            { txt: 'Buy a seed (20 gold).', sub: 'Lose 20 gold. Plant it somewhere.', fx: [G_(-20)], cond: hasGold(20), go: 'plant' },
            { txt: 'Shake the machine.', sub: 'Roll: 15 gold falls out, or a spider (3 HP) and 5 gold.', roll: { p: 0.5, win: { fx: [G_(15)] }, lose: { fx: [HP_(-3), G_(5)] } } },
            { txt: 'Walk away.', sub: 'Money does not grow on trees. Usually.' },
          ] },
        plant: { text: 'The seed is warm and buzzes like a phone on silent. Where does it go?',
          choices: [
            { txt: 'A flower pot by the ticket booth.', sub: 'Come back next act. It might grow.', set: { where: 'pot' }, call: { k: 'later', beat: 'tree' } },
            { txt: 'Swallow it. Safest place.', sub: 'Lose 5 HP. You will be jingling for a while.', fx: [HP_(-5)], set: { where: 'belly' }, call: { k: 'later', beat: 'belly' } },
          ] },
        tree: { text: 'Remember the coin seed? It grew. A tree of gold coins hums over the machines, taller than all of them. A goblin guards it with a rake.',
          choices: [
            { txt: 'Shake the tree.', sub: 'Gain 80 gold. The goblin does not approve.', fx: [G_(80)] },
            { txt: 'Pick one golden fruit.', sub: 'Gain a rare item.', fx: [IT_('rare')] },
          ] },
        belly: { text: 'Your stomach has been jingling since the last act. Something in there is ready to come out. It is, legally, a tree.',
          choices: [
            { txt: 'Cough it up.', sub: 'Lose 6 HP. Gain 110 gold.', fx: [HP_(-6), G_(110)] },
            { txt: 'Keep it. It is family now.', sub: 'Gain 8 Max HP. You rattle when you walk.', fx: [{ k: 'maxhp', v: 8 }] },
          ] },
      } },
    { id: 'sto_intern', title: 'The Nervous Intern', art: 'tinker', acts: [1, 2, 3],
      beats: {
        start: { text: 'An intern in a Prize Master lanyard is crying into a clipboard. "I have to reset the boss\'s cabinet and I forgot the password."',
          choices: [
            { txt: 'Help him guess it.', sub: 'Roll the dice.', roll: { p: 0.5, win: { go: 'guessed' }, lose: { go: 'wrong' } } },
            { txt: 'Bribe him (30 gold).', sub: 'Lose 30 gold. Ask about the boss\'s weak spots.', fx: [G_(-30)], cond: hasGold(30), go: 'bribe' },
            { txt: 'Report him to management.', sub: 'Gain 25 gold. Management gives out gold stars.', fx: [G_(25)] },
          ] },
        guessed: { text: 'It was PASSWORD1. It is always PASSWORD1. He is so grateful he offers to "lose" a few screws in this act\'s boss.',
          choices: [
            { txt: 'Loosen the screws.', sub: 'This act\'s boss starts weakened.', set: { saboteur: 1 }, call: { k: 'boss', id: 'intern', s: { weak: 2, vuln: 2 } } },
            { txt: 'Just take a tip.', sub: 'Gain 30 gold.', fx: [G_(30)] },
          ] },
        wrong: { text: 'Wrong. The cabinet locks for an hour. The intern blames you, loudly, on the radio.',
          choices: [{ txt: 'Run.', sub: 'Lose 4 HP on the way out.', fx: [HP_(-4)] }] },
        bribe: { text: 'He pockets the gold and whispers: "The boss hates Vulnerable. Also its left side. Also stairs."',
          choices: [
            { txt: 'Sabotage it together.', sub: 'This act\'s boss starts badly weakened.', set: { saboteur: 2 }, call: { k: 'boss', id: 'intern', s: { weak: 2, vuln: 3 } } },
            { txt: 'Ask for his lunch instead.', sub: 'Heal 12 HP. It is a very good sandwich.', fx: [HP_(12)] },
          ] },
      } },
    { id: 'sto_dance', title: 'Dance-Off', art: 'trashpanda', acts: [1, 2, 3],
      beats: {
        start: { text: 'A raccoon in a sweatband runs a dance machine. "Three rounds, 4 points to beat me. Win and my stash is yours. Lose and you mop." Round one: LEFT, LEFT, SPIN, CLAW?!',
          choices: [
            { txt: 'Nail the basics.', sub: 'A safe roll for 1 point.', roll: { p: 0.75, win: { add: { score: 1 }, go: 'r2' }, lose: { go: 'r2' } } },
            { txt: 'The claw spin.', sub: 'A risky roll for 2 points (or 3 HP).', roll: { p: 0.45, win: { add: { score: 2 }, go: 'r2' }, lose: { fx: [HP_(-3)], go: 'r2' } } },
            { txt: 'Walk away.', sub: 'The raccoon calls you a chicken. In three languages.' },
          ] },
        r2: { text: (st) => `Round two. Faster. The raccoon is sweating right through the sweatband. Score: ${st.score | 0}.`,
          choices: [
            { txt: 'Nail the basics.', sub: 'A safe roll for 1 point.', roll: { p: 0.7, win: { add: { score: 1 }, go: 'r3' }, lose: { go: 'r3' } } },
            { txt: 'The claw spin.', sub: 'A risky roll for 2 points (or 3 HP).', roll: { p: 0.45, win: { add: { score: 2 }, go: 'r3' }, lose: { fx: [HP_(-3)], go: 'r3' } } },
          ] },
        r3: { text: (st) => `Final round. The machine plays your song. You do not know how it knows. Score: ${st.score | 0}.`,
          choices: [
            { txt: 'Nail the basics.', sub: 'A safe roll for 1 point.', roll: { p: 0.65, win: { add: { score: 1 }, go: 'end' }, lose: { go: 'end' } } },
            { txt: 'The claw spin.', sub: 'A risky roll for 2 points (or 3 HP).', roll: { p: 0.45, win: { add: { score: 2 }, go: 'end' }, lose: { fx: [HP_(-3)], go: 'end' } } },
          ] },
        end: { text: (st) => ((st.score | 0) >= 4 ? `Final score: ${st.score}. The raccoon throws its sweatband into the crowd. The crowd is two rats. They go wild.`
          : `Final score: ${st.score | 0}. The raccoon needed 4. It hands you a mop without a word.`),
          choices: [
            { txt: 'Claim the stash.', sub: 'Gain 40 gold and a rare item.', fx: [G_(40), IT_('rare')], cond: (run, st) => ((st && st.score) | 0) >= 4 },
            { txt: 'Take a bow.', sub: 'Gain 25 gold. Second place still pays.', fx: [G_(25)], cond: (run, st) => { const s = (st && st.score) | 0; return s >= 2 && s < 4; } },
            { txt: 'Grab the mop.', sub: 'Gain 5 gold. It was a nice mop.', fx: [G_(5)], cond: (run, st) => ((st && st.score) | 0) < 2 },
          ] },
      } },
    { id: 'sto_egg', title: 'The Warm Egg', art: 'egg', acts: [1, 2],
      beats: {
        start: { text: 'In a prize bin full of rubber ducks sits one real egg. It is warm. It is ticking. No, that is your heart. It is cute.',
          choices: [
            { txt: 'Keep it warm in your Rig.', sub: 'Lose 3 Max HP. It takes up room. Check on it next act.', fx: [{ k: 'maxhp', v: -3 }], set: { kept: 1 }, call: { k: 'later', beat: 'hatch' },
              cond: (run) => (run && run.maxHp || 0) > 20 },
            { txt: 'Sell it to a passing chef.', sub: 'Gain 30 gold. The chef is thrilled. The egg is not.', fx: [G_(30)] },
            { txt: 'Leave it with the ducks.', sub: 'They will raise it as their own.' },
          ] },
        hatch: { text: 'Your Rig squeaks. The egg has hatched! Something tiny climbs onto your shoulder, blinks at you, and refuses to leave.',
          choices: [
            { txt: 'Keep it.', sub: 'A new pet (or 30 XP for the one you have).', fx: [{ k: 'pet' }] },
            { txt: 'Feed it your snacks.', sub: 'Heal 10 HP and gain 6 Max HP. It shares.', fx: [HP_(10), { k: 'maxhp', v: 6 }] },
          ] },
      } },
    { id: 'sto_booth', title: 'The Photo Booth', art: 'ghost', acts: [2, 3],
      beats: {
        start: { text: 'A photo booth flashes on its own. The strip slides out: you, smiling. And behind you, a ghost, also smiling.',
          choices: [
            { txt: 'Take another photo.', sub: 'Surely it was a smudge.', go: 'flash' },
            { txt: 'Keep the strip.', sub: 'Gain 2 Bulbs. It glows faintly.', fx: [{ k: 'ink', v: 2 }] },
            { txt: 'Leave. Quickly.', sub: 'Do not look back. Do not look back.' },
          ] },
        flash: { text: 'FLASH. The ghost is closer. It is holding up two fingers behind your head.',
          choices: [
            { txt: 'Say cheese.', sub: 'Be a good sport.', go: 'friend' },
            { txt: 'Punch the booth.', sub: 'Lose 5 HP. Gain 25 gold. The ghost looks offended.', fx: [HP_(-5), G_(25)] },
          ] },
        friend: { text: 'The ghost floats out of the strip. "Nobody ever poses WITH me," it sniffles. It would like to tag along.',
          choices: [
            { txt: 'Sure, buddy.', sub: 'It will haunt your next big fight (for you).', set: { pal: 1 }, call: { k: 'ally', id: 'ghost', pow: 1 } },
            { txt: 'Ask where the lights are.', sub: 'Gain 4 Bulbs. Ghosts know.', fx: [{ k: 'ink', v: 4 }] },
          ] },
      } },
    { id: 'sto_vendy', title: 'The Runaway Vending Machine', art: 'slot', acts: [1, 2],
      beats: {
        start: { text: 'A vending machine shuffles down the aisle on stubby legs. Its screen scrolls: PLEASE. THEY WANT TO TURN ME INTO A CLAW MACHINE.',
          choices: [
            { txt: 'Help it escape.', sub: 'Distract the guard.', go: 'escape' },
            { txt: 'Loot it while it is distracted.', sub: 'Gain a random item. And a Rock.', fx: [IT_('random'), { k: 'junk', id: 'rock', n: 1 }], go: 'looted' },
            { txt: 'Call security.', sub: 'Gain 20 gold. You monster.', fx: [G_(20)] },
          ] },
        escape: { text: 'You make a very convincing chicken noise. The guard runs off to find the chicken. The machine waddles into the dark. I WILL NOT FORGET THIS. EXACT CHANGE ONLY.',
          choices: [{ txt: 'Good luck, Vendy.', sub: 'You get the feeling it will pay you back.', set: { saved: 1 }, call: { k: 'shop', id: 'vendy' } }] },
        looted: { text: 'A bag of chips drops out with the prize. The screen reads :( and the machine wobbles away.',
          choices: [{ txt: 'Eat the chips.', sub: 'Heal 8 HP. They taste like guilt.', fx: [HP_(8)] }] },
      } },
    { id: 'sto_oracle', title: 'The Magpie Oracle', art: 'magpie', acts: [1, 2, 3],
      beats: {
        start: { text: 'A magpie in a tiny turban perches on a crystal ball. "Three questions," it croaks. "Shiny ones only."',
          choices: [
            { txt: 'Ask about the road ahead.', sub: 'Gain 2 Bulbs. Then another question?', fx: [{ k: 'ink', v: 2 }], go: 'more' },
            { txt: 'Ask about treasure.', sub: 'Upgrade an item.', fx: [{ k: 'upgrade' }] },
            { txt: 'Offer it a shiny (10 gold).', sub: 'Lose 10 gold. Hear your fortune.', fx: [G_(-10)], cond: hasGold(10), go: 'fortune' },
          ] },
        more: { text: '"The dark is only a room with the lights off," it croaks, very pleased with itself. "One more? Shinier."',
          choices: [
            { txt: 'Pay 15 gold.', sub: 'Lose 15 gold. Gain a rare item.', fx: [G_(-15), IT_('rare')], cond: hasGold(15) },
            { txt: 'No thanks.', sub: 'It pecks your hat on the way out.' },
          ] },
        fortune: { text: 'It stares into the ball. "You will meet a tall, dark... claw machine." Then it pecks the gold and pushes something toward you.',
          choices: [{ txt: 'Take it.', sub: 'Gain a random relic.', fx: [{ k: 'relic', id: 'random' }] }] },
      } },
  ];
  const STORIES = {};
  for (const s of STORY_LIST) STORIES[s.id] = s;
  const STORY_IDS = STORY_LIST.map((s) => s.id);
  const stoBeatText = (beat, st) => (beat ? (typeof beat.text === 'function' ? String(beat.text(st || {})) : String(beat.text || '')) : '');
  // A choice is open when its cond (run, story state) holds; a throwing cond is closed.
  function stoOk(ch, run, st) {
    if (!ch) return false;
    if (typeof ch.cond !== 'function') return true;
    try { return !!ch.cond(run, st || {}); } catch (e) { return false; }
  }
  /* Resolve a choice (pure; rng only for a roll) -> {fx, next, set, add,
     calls, win, txt} or null (unknown or closed). The game applies it. */
  function stoChoose(story, beatId, idx, st, run, rng) {
    const S0 = typeof story === 'string' ? STORIES[story] : story;
    const beat = S0 && S0.beats && S0.beats[beatId];
    const ch = beat && beat.choices && beat.choices[idx];
    if (!ch || !stoOk(ch, run, st)) return null;
    let br = null, win = null;
    if (ch.roll) { win = (rng ? rng() : 0) < ch.roll.p; br = (win ? ch.roll.win : ch.roll.lose) || {}; }
    const fx = (ch.fx || []).concat(br ? (br.fx || []) : []);
    const calls = [];
    for (const c of [ch.call, br && br.call]) if (c) calls.push(Object.assign({}, c));
    const next = br ? (br.go || null) : (ch.go || null);
    return { fx, next: next && S0.beats[next] ? next : null, set: Object.assign({}, ch.set || {}, (br && br.set) || {}),
      add: Object.assign({}, ch.add || {}, (br && br.add) || {}), calls, win, txt: ch.txt };
  }
  // The run's progress through the acts (Endless loops count on).
  const stoStage = (run) => (run ? ((run.endless && run.endless.loop) | 0) * 3 + ((run.act | 0) || 1) : 1);
  // A callback is due: a boss call in its own act (or later), the rest from the next act on.
  function stoDue(call, run) {
    if (!call || call.done) return false;
    const now = stoStage(run), at = call.stage | 0;
    return call.k === 'boss' ? now >= at : now > at;
  }
  // A story that can start now: unseen this run, told in this act.
  function stoPick(rng, run) {
    const seen = (run && run.sto && run.sto.seen) || {}, act = (run && run.act) || 1;
    const ids = STORY_IDS.filter((id) => !seen[id] && STORIES[id].acts.indexOf(act) >= 0);
    return ids.length ? ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))] : null;
  }
  // The run's story state as it is today (an old or junk save gets a fresh one; `gary` is off for a save from before).
  function stoFix(o, seed) {
    const src = o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const out = { st: {}, seen: {}, done: {}, cur: null, calls: [], alt: {}, pays: 0, gary: { on: false, w: 0, l: 0, met: 0, duel: '' } };
    if (!src) { out.gary.on = U.rng(U.hashStr('clawspire:gary:' + ((seed >>> 0) || 1)))() < STO.garyP; return out; }
    for (const id in obj(src.st)) if (STORIES[id]) out.st[id] = Object.assign({}, obj(src.st[id]));
    for (const id in obj(src.seen)) if (STORIES[id]) out.seen[id] = 1;
    for (const id in obj(src.done)) if (STORIES[id]) out.done[id] = String(src.done[id]);
    const c = src.cur;
    if (c && STORIES[c.id] && STORIES[c.id].beats[c.beat]) out.cur = { id: c.id, beat: c.beat, n: Math.max(1, c.n | 0) };
    for (const k of Array.isArray(src.calls) ? src.calls : []) {
      if (!k || typeof k !== 'object' || ['ally', 'hunt', 'later', 'boss', 'shop'].indexOf(k.k) < 0 || out.calls.length >= STO.maxCalls) continue;
      out.calls.push(Object.assign({}, k, { stage: Math.max(1, k.stage | 0), done: !!k.done }));
    }
    for (const a in obj(src.alt)) { const v = src.alt[a]; if (/^\d{1,3}$/.test(a) && (v === '' || (typeof v === 'string' && ENEMIES[v]))) out.alt[a] = v; }
    out.pays = Math.max(0, src.pays | 0);
    if (src.huntNote) out.huntNote = 1;
    const g = obj(src.gary);
    out.gary = { on: !!g.on, w: Math.max(0, g.w | 0), l: Math.max(0, g.l | 0), met: Math.max(0, g.met | 0), duel: g.duel === 'won' || g.duel === 'lost' ? g.duel : '' };
    return out;
  }
  // The alternate boss of an act (null when it has none).
  const stoAltOf = (act) => (STO.alt[act] && ENEMIES[STO.alt[act]] ? STO.alt[act] : null);

  // ---- Grabby Gary, the rival claw champion
  /* He meets you on a map tile (act 1), races you in a claw-off (acts 1 and
     2: three drops each from a shared bin), and if you beat him twice in a
     run he calls you out to a showdown in act 3 (an elite fight with his own
     claw). The profile remembers him (meta.gary: met, offs, wins, losses,
     duels, beat): his taunts follow the record and he buys new gear every
     time you beat him. */
  const GARY = {
    gear: ['Rookie Cap', 'Pro Shades', 'Gold Chain', 'Champion Jacket', 'Turbo Claw'],
    drops: 3,
    val: { junk: 0, c: 1, u: 2, r: 4, l: 7 },
    pile: { c: 5, u: 3, r: 2, l: 1, junk: 2 },
    prize: { gold: 30, perAct: 15, lose: 10, tix: 6, loseTix: 2 },
    aim: [34, 28, 22, 17, 12],       // his aim error (px) by gear
    grip: [1.1, 1.18, 1.26, 1.34, 1.42],
    duel: { hpPerGear: 0.06, strAt: 3, gold: 60 },
  };
  // His gear level: every claw-off you won and every showdown (twice) sends him shopping.
  function garyGear(g) {
    g = g || {};
    return Math.max(0, Math.min(GARY.gear.length - 1, Math.floor(((g.wins | 0) + 2 * (g.beat | 0)) / 2)));
  }
  const GARY_LINES = {
    first: ['Name\'s Gary. Grabby Gary. Undefeated claw-off champion, three arcades running. You look like a Tuesday.',
      'Nice claw. Did it come with training wheels? I am Gary. Grabby Gary. Remember it.'],
    ahead: ['Oh. It is YOU. I have been practising. Like the new {gear}? Bought them with YOUR tickets. Eventually.',
      'You got lucky last time. Luck is not a strategy. I have a spreadsheet.'],
    behind: ['Back for another lesson? I will go easy on you. That is a lie.', 'My trophy shelf has a spot with your name on it. Two spots.'],
    even: ['Tied record, huh? Not for long.', 'We keep meeting like this. I am starting to think you like losing to me.'],
    rematch: ['Round two. My claw has been oiled. My ego has been polished.', 'Rematch! This time I am not holding back. I was not before either.'],
    duel: ['Two losses in one run? Nobody does that to Gary. SHOWDOWN. Now.', 'You beat me twice. The third time I bring my REAL claw.'],
    win: ['HA! Put it on my shelf. Next to the others.', 'Easy. Did you even warm up?', 'And THAT is why they call me Grabby.'],
    lose: ['Rigged! That claw was rigged! Rematch next act!', 'I let you win. For morale. Yours.', 'Enjoy it. I am going shopping.'],
    tie: ['A tie? Unacceptable. We settle this later.'],
  };
  // A taunt for the moment: kind 'meet' | 'off' | 'duel' | 'win' | 'lose' | 'tie'; g = meta.gary.
  function garyTaunt(g, kind, rng) {
    g = g || {};
    const pick = (a) => a[Math.min(a.length - 1, Math.floor((rng ? rng() : 0) * a.length))];
    let list;
    if (kind === 'duel' || kind === 'win' || kind === 'lose' || kind === 'tie') list = GARY_LINES[kind];
    else if (!(g.offs | 0) && !(g.met | 0)) list = GARY_LINES.first;
    else if (kind === 'off') list = GARY_LINES.rematch;
    else list = (g.wins | 0) > (g.losses | 0) ? GARY_LINES.ahead : (g.wins | 0) < (g.losses | 0) ? GARY_LINES.behind : GARY_LINES.even;
    return pick(list).replace('{gear}', GARY.gear[garyGear(g)].toLowerCase());
  }
  const garyVal = (def) => (def ? (GARY.val[def.rarity] == null ? 1 : GARY.val[def.rarity]) : 0);
  // The shared bin of a claw-off: [{id, v}], seeded. Every rarity is there, and two rocks.
  function garyPile(rng, act) {
    const out = [];
    for (const r of ['l', 'r', 'u', 'c']) {
      let ids = pool(r).filter((id) => ITEMS[id] && !ITEMS[id].bag && !ITEMS[id].char);
      if (!ids.length) ids = pool(r);
      for (let k = 0; k < (GARY.pile[r] | 0) && ids.length; k++) {
        const id = ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
        out.push({ id, v: garyVal(ITEMS[id]) });
      }
    }
    for (let k = 0; k < GARY.pile.junk; k++) out.push({ id: 'rock', v: 0 });
    return rng.shuffle ? rng.shuffle(out) : out;
  }
  // What a claw-off pays: a win gold, tickets and a capsule; a loss a little gold.
  function garyPrize(act, res) {
    const P = GARY.prize, a = Math.max(1, act | 0);
    if (res === 'win') return { gold: P.gold + P.perAct * (a - 1), tix: P.tix, cap: 'elite' };
    if (res === 'tie') return { gold: Math.round((P.gold + P.perAct * (a - 1)) / 2), tix: P.loseTix, cap: '' };
    return { gold: P.lose, tix: P.loseTix, cap: '' };
  }
  // The profile's rival record, repaired (old or junk profiles start fresh).
  function garyFix(o) {
    const g = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const n = (v) => Math.max(0, Math.floor(+v) || 0);
    return { met: n(g.met), offs: n(g.offs), wins: n(g.wins), losses: n(g.losses), ties: n(g.ties), duels: n(g.duels), beat: n(g.beat) };
  }

  // ---- the new monsters: the Card Shark, Grabby Gary, the alternate bosses
  const STO_ENEMIES = [
    { id: 'cardshark', name: 'The Card Shark', act: 2, tier: 'elite', hp: [118, 130], art: 'goblin', look: 'cardshark', size: 1.1, color: '#4a8ab8', color2: '#2b3a5a', color3: '#ffc94d',
      desc: 'Lefty\'s big brother. A shark in a dealer\'s visor who never forgets a cheat, and never deals fair.', ai: 'cycle', pattern: [0, 1, 2, 3, 4, 5],
      taunt: 'You cheated my little brother. Now we play MY game.',
      enrage: { name: 'ALL IN', text: 'It pushes every chip to the middle', str: 2 },
      moves: [atk('deal', 'Deal', 5, 4, 'Deals cards like knives: 5 x4'), debuff('mark', 'Mark the Card', 'vuln', 2, 'Marks you (Vulnerable 2)'),
        mv('palm', 'Palm a Prize', 'steal', 'Palms an item from your bin'), atk('bite', 'Big Bite', 18, 1, 'Bites for 18'),
        mv('stack', 'Stack the Deck', 'charge', 'Stacking the deck (30 next turn)', { v: 30 }), blk('fold', 'Fold', 16, 'Folds behind its cards (Block 16)')] },
    { id: 'gary', name: 'Grabby Gary', act: 3, tier: 'elite', hp: [168, 180], art: 'tinker', look: 'gary', size: 1.1, color: '#3ddc84', color2: '#ffc94d', color3: '#ff2e88',
      desc: 'Undefeated claw-off champion (he says). He brings his own claw to the showdown and grabs your best prize every turn.', ai: 'cycle', pattern: [0, 1, 2, 3, 4, 5],
      taunt: 'Name\'s Gary. Grabby Gary. Undefeated.', rival: true, digest: 99, noAffix: ['greedy'],
      enrage: { name: 'TURBO MODE', text: 'His claw goes back for seconds', str: 2 },
      moves: [atk('jab', 'Joystick Jab', 10, 2, 'Joystick jab: 10 x2'), debuff('trash', 'Trash Talk', 'weak', 2, 'Trash talks you (Weak 2)'),
        blk('trophy', 'Trophy Shield', 22, 'Hides behind a trophy (Block 22)'), atk('slam', 'Champion Slam', 26, 1, 'Champion slam for 26'),
        buff('hype', 'Hype Up', 'str', 2, 'Hypes himself up (+2 Strength)'), mv('wind', 'Wind Up', 'charge', 'Winding up the big grab (44 next turn)', { v: 44 })] },
    { id: 'plushqueen', name: 'The Plushie Queen', act: 1, tier: 'boss', hp: [92, 92], art: 'slime', look: 'plushqueen', size: 1, color: '#ff9ec7', color2: '#ffd1e6', color3: '#ffc94d',
      desc: 'Every unclaimed plush in the tower pledged itself to her. Every one of them is a pillow between you and her.', ai: 'cycle',
      taunt: 'Hugs are mandatory. Resistance is fluffy.',
      // Boss signature: a parade of plush toys into your bin; each one soaks a point of every hit on her until you grab it out.
      sig: { id: 'plush', name: 'Plush Parade', sign: 'PLUSH PARADE', shout: 'HUG TIME!', text: 'fills your bin with plushies (each soaks 1 off every hit on her)',
        first: 1, every: 3, n: 3, soak: 1, max: 6, item: 'sto_plush' },
      pattern: [0, 1, 2, 3, 4, 5, 1, 6],
      enrage: { name: 'ROYAL CUDDLE', text: 'Every plush in the kingdom answers the call', str: 2, pattern: [1, 5, 0, 3, 1, 6] },
      moves: [atk('bonk', 'Scepter Bonk', 9, 1, 'Scepter bonk for 9'), atk('pillow', 'Pillow Fight', 4, 3, 'Pillow fight: 4 x3'),
        blk('fluff', 'Fluff Up', 12, 'Fluffs up (Block 12)'), mv('decree', 'Royal Decree', 'junk', 'Knights a Plush into your bin', { item: 'sto_plush', n: 1 }),
        debuff('hug', 'Bear Hug', 'weak', 2, 'A bear hug (Weak 2)'), mv('nap', 'Royal Nap', 'charge', 'Settling in for a big squeeze (22 next turn)', { v: 22 }),
        mv('wobble', 'Tantrum', 'shake', 'Throws a tantrum. Your bin rattles.')] },
    { id: 'conveyorking', name: 'The Conveyor King', act: 2, tier: 'boss', hp: [165, 165], art: 'clockwork', look: 'conveyorking', size: 1, color: '#ffb347', color2: '#5a6373', color3: '#2ee6d6',
      desc: 'The foundry\'s shipping department, crowned. Everything moves on his line. Away from you.', ai: 'cycle',
      taunt: 'Everything moves. Away from YOU.',
      // Boss signature: the bin floor turns into a conveyor running away from the chute for your next turn, and crates ride in on it.
      sig: { id: 'belt', name: 'Belt Drive', sign: 'CONVEYOR', shout: 'KEEP IT MOVING!', text: 'turns your bin floor into a conveyor away from the chute',
        first: 1, every: 3, v: 70, crates: 2, item: 'sto_crate' },
      pattern: [0, 1, 2, 3, 4, 6, 5, 1],
      enrage: { name: 'OVERTIME', text: 'The belt runs a double shift', str: 2, pattern: [1, 5, 0, 6, 4, 1] },
      moves: [atk('grind', 'Gear Grind', 7, 3, 'Gear grind: 7 x3'), mv('box', 'Box It', 'junk', 'Ships 2 Crates into your bin', { item: 'sto_crate', n: 2 }),
        blk('wrap', 'Shrink Wrap', 20, 'Shrink wraps himself (Block 20)'), mv('oil', 'Oil the Line', 'grease', 'Oils the line (slippery 2 turns)', { v: 2 }),
        atk('press', 'Hydraulic Press', 24, 1, 'Hydraulic press for 24'), mv('rush', 'Rush Order', 'charge', 'Rush order (34 next turn)', { v: 34 }),
        mv('lurch', 'Lurch', 'tilt', 'The line lurches (tilt)')] },
    { id: 'arcticarcade', name: 'The Arctic Arcade', act: 3, tier: 'boss', hp: [115, 115], art: 'icemimic', look: 'arcticarcade', size: 1, color: '#8dfff5', color2: '#3a6fb8', color3: '#ffffff',
      desc: 'A whole arcade frozen into one cabinet, still running. It freezes your prizes into its growing block of ice.', ai: 'cycle',
      taunt: 'Welcome to the coolest arcade in the tower. Please remain frozen.',
      // Boss signature: one of your items (two once enraged) freezes into a growing ice block in your bin; deliver the block to smash it open.
      sig: { id: 'glacier', name: 'Ice Block', sign: 'ICE BLOCK', shout: 'CHILL OUT!', text: 'freezes one of your items into a growing ice block',
        first: 1, every: 2, n: 1, cap: 6, dmg: 5 },
      pattern: [0, 1, 2, 3, 4, 5, 6],
      enrage: { name: 'DEEP FREEZE MODE', text: 'The compressor roars', str: 2 },
      moves: [mv('blizzard', 'Blizzard', 'fog', 'Blizzard on the glass (fog 2 turns)', { v: 2 }), atk('hail', 'Hail', 7, 4, 'Hail: 7 x4'),
        debuff('frost', 'Frostbite', 'chill', 3, 'Frostbite (3 Chill)'), blk('iceWall', 'Ice Wall', 25, 'Ice wall (Block 25)'),
        mv('snow', 'Snow Machine', 'junk', 'Dumps 2 Ice Blocks into your bin', { item: 'iceblock', n: 2 }),
        mv('gather', 'Gather Cold', 'charge', 'Gathering cold (36 next turn)', { v: 36 }), atk('slam', 'Cabinet Slam', 16, 1, 'Cabinet slam for 16')],
      onDeath: { k: 'summon', id: 'prizemaster' } },
  ];
  for (const e of STO_ENEMIES) ENEMIES[e.id] = Object.assign({ size: 1 }, e);
  // The bosses' junk: reachable as ITEMS[id], never listed (no pool, shop or Prizedex sees them).
  const stoItem = (d) => Object.defineProperty(ITEMS, d.id, { value: Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'none', tags: ['junk'], rarity: 'junk', cost: 0, exhaust: true, fx: [] }, d),
    enumerable: false, configurable: true, writable: true });
  stoItem({ id: 'sto_plush', name: 'Royal Plush', tags: ['junk', 'light'], shape: circle(19), density: 0.5, friction: 0.8, restitution: 0.35,
    color: '#ff9ec7', color2: '#ffd1e6', art: 'heart', target: 'self', fx: [{ k: 'block', v: 2 }], sto: 'plush',
    text: 'Soaks a point of every hit on the Plushie Queen while it sits in your bin. Grab it out for {v} Block. It is very huggable.' });
  stoItem({ id: 'sto_crate', name: 'Shipping Crate', tags: ['junk', 'heavy'], shape: box(46, 32), density: 1.3, friction: 0.8,
    color: '#c89a5a', color2: '#8a5a2b', art: 'rock', target: 'self', fx: [{ k: 'block', v: 3 }], sto: 'crate',
    text: 'Rides in on the Conveyor King\'s belt. Grab it out for {v} Block of cardboard armour.' });
  // The Arctic Arcade's block grows a size per frozen item (the physics body is rebuilt from the bigger def).
  const STO_ICE = [];
  for (let n = 1; n <= 6; n++) {
    const w = 34 + n * 8, hh = 28 + n * 6, id = 'sto_glacier' + n;
    stoItem({ id, name: 'Ice Block', tags: ['junk', 'heavy'], density: 1.4, friction: 0.2, restitution: 0.05, color: '#bff4ff', color2: '#5ab4e6', art: 'rock', sto: 'glacier', ice: n,
      shape: { kind: 'poly', verts: [{ x: -w / 2, y: -hh / 2 }, { x: w / 2, y: -hh / 2 }, { x: w / 2, y: hh / 2 }, { x: -w / 2, y: hh / 2 }] },
      text: `${n} of your item${n > 1 ? 's' : ''}, frozen solid. Deliver the block to smash it: they come back, and the boss takes 5 per item.` });
    STO_ICE.push(id);
  }
  // Two stickers (the board is shared with the round's other work).
  for (const a of [
    A_('rival_crusher', 'Rival Crusher', '\u{1F3C6}', '#3ddc84', 'Beat Grabby Gary in his act 3 showdown.', (c) => (((c.meta && c.meta.gary) || {}).beat | 0) >= 1),
    A_('full_circle', 'Full Circle', '\u{1F501}', '#ff9ec7', 'See a story from an earlier act come back around.', (c) => (((c.meta && c.meta.sto) || {}).pays | 0) >= 1),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // ================================================================ /STORY

  // ================================================================ FAMILY (round 9: enemy families)
  /* Three families, one per act, three members each, that fight better
     together (DESIGN.md "Enemy families (round 9)"). A member carries `fam`
     (the family id) and `look` (its own drawing, RENDER's FAMILY block);
     COMBAT's FAMILY block runs the bond. Numbers here, rules there:
     - band: every member that takes its action adds `per` Crescendo (the
       drummer `beat`); at `max` the whole band plays a SOLO next turn, each
       member hitting for `solo[id]` (scaled like any attack) x (1 + `harm`
       per other member playing). Knock one out first and the rest lose the
       beat; a member lost otherwise drops the meter by `drop`.
     - vending: `restock` heals the most dented member and gives half as much
       Block, `cans` lobs empty cans (junk `fam_can`) into your bin, `change`
       takes up to v of your gold and gives every member 1 Armor per `per`
       gold (the Change Machine banks it and pays it back when it breaks).
     - choir: the members hum in lockstep (the hum is an attack with
       `fam: 'chorus'`, the same `harm` rule); the first hum of a turn
       scrambles the pile; a globe that shatters gives the rest `angry` Strength. */
  const FAM = {
    band: { id: 'band', name: 'The Band', act: 1, icon: '♫', color: '#ff2e88', color2: '#ffc94d',
      members: ['fam_drummer', 'fam_bassist', 'fam_singer'], tag: 'THEY PLAY BETTER TOGETHER',
      bond: 'Every turn they play, the Crescendo builds. At full Crescendo they play a SOLO together. Knock one out first to cancel it.',
      max: 8, per: 1, beat: { fam_drummer: 2 }, drop: 3, harm: 0.25, solo: { fam_drummer: 4, fam_bassist: 4, fam_singer: 5 } },
    vending: { id: 'vending', name: 'The Vending Gang', act: 2, icon: '\u{1F964}', color: '#2ee6d6', color2: '#ff5a4a',
      members: ['fam_pop', 'fam_snack', 'fam_change'], tag: 'THEY RESTOCK EACH OTHER',
      bond: 'They restock each other with cans, pelt your bin with empties, and the Change Machine turns your gold into their Armor. Break it to get your gold back.',
      per: 4, take: 12 },
    choir: { id: 'choir', name: 'The Snow Globe Choir', act: 3, icon: '❄', color: '#8dfff5', color2: '#b8a4ff',
      members: ['fam_soprano', 'fam_alto', 'fam_baritone'], tag: 'THEY SING AS ONE',
      bond: 'They hum in sync: every globe shakes the cabinet at once and scrambles your pile. Shatter one globe and the rest get angry.',
      harm: 0.25, angry: 3 },
  };
  const FAM_IDS = ['band', 'vending', 'choir'];
  const FAM_KINDS = ['restock', 'cans', 'change'];
  const famAtk = (id, name, v, n, txt, fam) => Object.assign(atk(id, name, v, n, txt), fam ? { fam } : {});
  const FAM_ENEMIES = [
    // ---- act 1: The Band (the Crescendo meter, then a SOLO)
    { id: 'fam_drummer', fam: 'band', name: 'Buster Beats', act: 1, tier: 'normal', hp: [18, 22], art: 'gremlin', look: 'fam_drummer', size: 0.9, color: '#ff8a2e', color2: '#ffc94d', color3: '#2ee6d6',
      desc: 'Drums on anything. Mostly the cabinet. Keeps the whole band on the beat, and the beat builds twice as fast with him.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [atk('rimshot', 'Rimshot', 3, 2, 'Rimshot: 3 x2'), mv('drumroll', 'Drumroll', 'shake', 'Drums on the cabinet. Your bin rattles.'),
        atk('crash', 'Cymbal Crash', 6, 1, 'Cymbal crash for 6'), blk('kit', 'Behind the Kit', 5, 'Hides behind the kit (Block 5)')] },
    { id: 'fam_bassist', fam: 'band', name: 'Low-Note Lenny', act: 1, tier: 'normal', hp: [20, 24], art: 'slime', look: 'fam_bassist', size: 1, color: '#7a5cff', color2: '#ffc94d', color3: '#ff2e88',
      desc: 'A slime with a bass guitar. You feel him before you hear him.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('slap', 'Slap Bass', 7, 1, 'Slap bass for 7'), debuff('rumble', 'Rumble', 'weak', 1, 'A low rumble (Weak)'),
        blk('groove', 'In the Groove', 6, 'Settles into the groove (Block 6)')] },
    { id: 'fam_singer', fam: 'band', name: 'Mic Drop Mimi', act: 1, tier: 'normal', hp: [15, 19], art: 'bat', look: 'fam_singer', size: 0.85, color: '#ff2e88', color2: '#ffc94d', color3: '#ffffff',
      desc: 'The front bat. Hits the high notes, then hits you.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('belt', 'Belt It Out', 5, 1, 'Belts it out for 5'), debuff('shriek', 'High Note', 'vuln', 1, 'Hits a high note (Vulnerable)'),
        atk('encore', 'Encore', 2, 3, 'Encore: 2 x3')] },
    // ---- act 2: The Vending Gang (restocks, empty cans, the Change Machine)
    { id: 'fam_pop', fam: 'vending', name: 'Pop Top', act: 2, tier: 'normal', hp: [40, 46], art: 'clockwork', look: 'fam_pop', size: 1.05, color: '#ff5a4a', color2: '#f4f8ff', color3: '#2ee6d6',
      desc: 'A soda machine with a pitching arm. Every can it throws is empty. Every single one.', ai: 'cycle', pattern: [0, 1, 2, 3],
      moves: [mv('lob', 'Lob Cans', 'cans', 'Lobs 2 empty cans into your bin', { n: 2 }), atk('fizz', 'Fizz Blast', 9, 1, 'Fizz blast for 9'),
        mv('refill', 'Restock', 'restock', 'Dispenses a soda to its most dented friend (heals 10, Block 5)', { v: 10 }), atk('spray', 'Shaken Can', 4, 2, 'Sprays a shaken can: 4 x2')] },
    { id: 'fam_snack', fam: 'vending', name: 'Snackatron', act: 2, tier: 'normal', hp: [44, 50], art: 'clockwork', look: 'fam_snack', size: 1.1, color: '#3b6fd6', color2: '#ffc94d', color3: '#ff9ec7',
      desc: 'Row B4 is always stuck. It keeps the good snacks for its friends.', ai: 'cycle', pattern: [1, 0, 3, 2],
      moves: [mv('restock', 'Restock', 'restock', 'Dispenses a snack to its most dented friend (heals 12, Block 6)', { v: 12 }), atk('coil', 'Spiral Coil', 5, 2, 'Spiral coil punch: 5 x2'),
        blk('glass', 'Shatterproof', 10, 'Shatterproof glass (Block 10)'), atk('drop', 'Snack Drop', 11, 1, 'Drops a family-size bag on you for 11')] },
    { id: 'fam_change', fam: 'vending', name: 'The Change Machine', act: 2, tier: 'normal', hp: [36, 42], art: 'clockwork', look: 'fam_change', size: 0.95, color: '#ffc94d', color2: '#5a6373', color3: '#2ee6d6',
      desc: 'It only ever gives you change for the gang. Break it open and your coins come pouring back.', ai: 'cycle', pattern: [1, 0, 2],
      moves: [mv('change', 'Make Change', 'change', 'Takes up to 12 of your gold and turns it into Armor for the gang', { v: 12 }),
        atk('spit', 'Coin Spit', 3, 3, 'Spits coins: 3 x3'), blk('vault', 'Coin Vault', 8, 'Locks its coin box (Block 8)')] },
    // ---- act 3: The Snow Globe Choir (a synchronized hum that scrambles the pile, anger when one shatters)
    { id: 'fam_soprano', fam: 'choir', name: 'Soprano Globe', act: 3, tier: 'normal', hp: [44, 50], art: 'wisp', look: 'fam_soprano', size: 0.9, color: '#b8a4ff', color2: '#e8fdff', color3: '#ffc94d',
      desc: 'A tiny angel in a snow globe. Her high C cracks glass. Mostly her own.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [debuff('aria', 'Frost Aria', 'chill', 2, 'A frosty aria (2 Chill)'), blk('dome', 'Polish the Dome', 10, 'Polishes her dome (Block 10)'),
        famAtk('hum', 'Hum in Harmony', 6, 1, 'Hums in sync with the choir: every globe shakes the cabinet', 'chorus')] },
    { id: 'fam_alto', fam: 'choir', name: 'Penguin Alto', act: 3, tier: 'normal', hp: [48, 54], art: 'yeti', look: 'fam_alto', size: 0.95, color: '#2ee6d6', color2: '#e8fdff', color3: '#ff8a2e',
      desc: 'Waddles in circles inside her globe. Pecks at anyone who taps the glass.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('peck', 'Peck', 6, 2, 'Pecks: 6 x2'), debuff('flurry', 'Flurry', 'weak', 1, 'A flurry in your face (Weak)'),
        famAtk('hum', 'Hum in Harmony', 6, 1, 'Hums in sync with the choir: every globe shakes the cabinet', 'chorus')] },
    { id: 'fam_baritone', fam: 'choir', name: 'Snowman Baritone', act: 3, tier: 'normal', hp: [52, 58], art: 'yeti', look: 'fam_baritone', size: 1.05, color: '#e8fdff', color2: '#ff8a2e', color3: '#2b3a6a',
      desc: 'The low end of the choir. His hum rattles every globe on the shelf.', ai: 'cycle', pattern: [0, 1, 2],
      moves: [atk('thump', 'Deep Thump', 12, 1, 'A deep thump for 12'), mv('squall', 'Snow Squall', 'fog', 'Snows up the glass (fog 1 turn)', { v: 1 }),
        famAtk('hum', 'Hum in Harmony', 6, 1, 'Hums in sync with the choir: every globe shakes the cabinet', 'chorus')] },
  ];
  for (const e of FAM_ENEMIES) ENEMIES[e.id] = Object.assign({ size: 1 }, e);
  // The Vending Gang's empties: reachable as ITEMS.fam_can, never listed (no pool, shop or Prizedex sees it).
  Object.defineProperty(ITEMS, 'fam_can', { value: { id: 'fam_can', name: 'Empty Can', rarity: 'junk', cost: 0, tags: ['junk', 'light'], shape: box(18, 30),
    density: 0.6, friction: 0.45, restitution: 0.3, color: '#ff5a4a', color2: '#e8e8f0', art: 'bottle', target: 'self', exhaust: true, fam: 'can',
    fx: [{ k: 'heal', v: 1 }], text: 'An empty can from the Vending Gang. Grab it out for {v} HP of flat soda. Mostly it is in the way.' },
  enumerable: false, configurable: true, writable: true });
  // Encounters: duos first, the whole family last (the lists run easy -> hard, MAP leans later columns to the back).
  ENCOUNTERS[1].normal.push(['fam_drummer', 'fam_singer'], ['fam_bassist', 'fam_drummer'], ['fam_drummer', 'fam_bassist', 'fam_singer']);
  ENCOUNTERS[2].normal.push(['fam_pop', 'fam_change'], ['fam_snack', 'fam_pop'], ['fam_pop', 'fam_snack', 'fam_change']);
  ENCOUNTERS[3].normal.push(['fam_soprano', 'fam_alto'], ['fam_alto', 'fam_baritone'], ['fam_soprano', 'fam_alto', 'fam_baritone']);
  // The family of an enemy id (or null), and every family in a fight's enemy list.
  const famOf = (id) => { const e = ENEMIES[id]; return e && e.fam && FAM[e.fam] ? e.fam : null; };
  const famsIn = (ids) => { const out = []; for (const id of ids || []) { const f = famOf(id); if (f && out.indexOf(f) < 0) out.push(f); } return out; };
  // ================================================================ /FAMILY

  // ================================================================ HISTORY (round 8: run history and the death recap)
  /* Every finished run leaves a compact record on the profile (meta.his,
     DESIGN.md "Run history, the death recap and photo mode (round 8)"): the
     last HIS.CAP runs (oldest first) plus a Hall of Fame of the best HIS.HOF
     by score. Short keys keep a record near 400 bytes:
       id  unique run id        d   date (epoch seconds)   c   crawler
       cl  claw type            o   outfit (absent: none)  tl  Tilt
       mu  mutators             se  season (absent: none)  dl  daily key
       m   mode                 s   score                  r   win | loss | endless | quit
       a   act reached          lp  Endless loop           tu  turns
       kl  kills                f   fights                 bs  bosses down
       bh  biggest hit          bc  best combo {n, t}      jp  jackpots
       ev  evolutions           st  sets completed [ids]   rl  relics [ids]
       b   the final bin, the top HIS.BIN by rarity ['id' | 'id+']
       k / kk / ke / km / kh    the killer's name, how (hit | burn | poison | bomb | self),
                                its enemy id, its move and the killing hit
       mp  the act's map {w, h, g, p, b, s}: 2 bits a hex (0 dark, 1 water,
           2 lit, 3 walked) packed three to a character, and the crawler,
           boss and start as cell indices
       lt  a loss's last turns [[hp lost, blocked, Block held]]
     Pure: the game builds the record, these repair, store, rank and read it. */
  const HIS = { CAP: 50, HOF: 10, BIN: 8, RELICS: 16, TURNS: 5, RESULTS: ['win', 'loss', 'endless', 'quit'], MODES: ['classic', 'daily', 'endless'] };
  const HIS_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const hisStr = (v, n) => (typeof v === 'string' && v ? v.slice(0, n || 40) : '');
  const hisInt = (v, lo, hi) => { const n = Math.floor(+v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
  const hisIds = (a, n, len) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x).slice(0, n).map((x) => x.slice(0, len || 40)) : []);
  const hisWon = (r) => !!r && (r.r === 'win' || r.r === 'endless');
  // One record, repaired: unknown fields dropped, numbers clamped, null when it is not a record.
  function hisRecFix(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const id = hisStr(r.id, 40), c = hisStr(r.c, 24);
    if (!id || !c) return null;
    const o = {
      id, d: hisInt(r.d, 0, 4e9), c, cl: hisStr(r.cl, 16) || 'classic', tl: hisInt(r.tl, 0, 99), m: HIS.MODES.indexOf(r.m) >= 0 ? r.m : 'classic',
      s: hisInt(r.s, 0, 1e9), r: HIS.RESULTS.indexOf(r.r) >= 0 ? r.r : 'loss', a: hisInt(r.a, 1, 9), lp: hisInt(r.lp, 0, 9999),
      tu: hisInt(r.tu, 0, 1e6), kl: hisInt(r.kl, 0, 1e6), f: hisInt(r.f, 0, 1e5), bs: hisInt(r.bs, 0, 9999), bh: hisInt(r.bh, 0, 1e7),
      jp: hisInt(r.jp, 0, 1e6), ev: hisInt(r.ev, 0, 9999), b: hisIds(r.b, HIS.BIN, 41), rl: hisIds(r.rl, HIS.RELICS),
    };
    const mu = hisIds(r.mu, 6), st = hisIds(r.st, 12);
    if (mu.length) o.mu = mu;
    if (st.length) o.st = st;
    for (const k of ['o', 'se', 'dl', 'k', 'kk', 'ke', 'km']) { const s = hisStr(r[k], 40); if (s) o[k] = s; }
    if (r.kh > 0) o.kh = hisInt(r.kh, 0, 1e7);
    if (r.dp > 0) o.dp = hisInt(r.dp, 0, 9999);   // DEP (round 15): the Neon Depths dives this run
    if (r.bc && typeof r.bc === 'object' && hisStr(r.bc.n, 40)) o.bc = { n: hisStr(r.bc.n, 40), t: hisInt(r.bc.t, 1, 3) };
    const mp = r.mp;
    if (mp && typeof mp === 'object' && hisMapCells(mp)) o.mp = { w: mp.w | 0, h: mp.h | 0, g: mp.g, p: hisInt(mp.p, -1, 1e4), b: hisInt(mp.b, -1, 1e4), s: hisInt(mp.s, -1, 1e4) };
    if (Array.isArray(r.lt)) {
      const lt = r.lt.filter((x) => Array.isArray(x)).slice(-HIS.TURNS).map((x) => [hisInt(x[0], 0, 1e6), hisInt(x[1], 0, 1e6), hisInt(x[2], 0, 1e6)]);
      if (lt.length) o.lt = lt;
    }
    return o;
  }
  // Best first; a tie goes to the older run.
  function hisRank(list) { return list.slice().sort((a, b) => b.s - a.s || a.d - b.d || (a.id < b.id ? -1 : 1)); }
  // The profile's history, repaired (an old profile, or junk, is an empty one).
  function hisFix(h) {
    const o = h && typeof h === 'object' && !Array.isArray(h) ? h : {};
    const fixList = (a) => { const out = [], seen = {}; for (const r of Array.isArray(a) ? a : []) { const x = hisRecFix(r); if (x && !seen[x.id]) { seen[x.id] = 1; out.push(x); } } return out; };
    const runs = fixList(o.runs).slice(-HIS.CAP);
    const hof = hisRank(fixList(o.hof)).slice(0, HIS.HOF);
    const by = {};
    if (o.by && typeof o.by === 'object' && !Array.isArray(o.by)) {
      for (const c in o.by) {
        const v = o.by[c];
        if (!Array.isArray(v) || !hisStr(c, 24)) continue;
        const n = hisInt(v[0], 0, 1e7);
        if (n > 0) by[c] = [n, hisInt(v[1], 0, n)];
      }
    }
    return { runs, hof, by, n: Math.max(hisInt(o.n, 0, 1e7), runs.length) };
  }
  /* Adds a record to a repaired history h (in place). The same id again
     updates it where it stands (a banked win that goes on into Endless);
     'quit' never overwrites a finished run. Lifetime counts per crawler
     (h.by: [runs, wins]) count a run once. Returns {rec, fresh, hof} (hof:
     the Hall of Fame place, 1-based, 0 when out) or null. */
  function hisPush(h, rec) {
    const r = hisRecFix(rec);
    if (!h || !r || !Array.isArray(h.runs) || !Array.isArray(h.hof)) return null;
    if (!h.by || typeof h.by !== 'object') h.by = {};
    const i = h.runs.findIndex((x) => x.id === r.id);
    const old = i >= 0 ? h.runs[i] : h.hof.find((x) => x.id === r.id) || null;
    const place = (id) => h.hof.findIndex((x) => x.id === id) + 1;
    if (old && r.r === 'quit') return { rec: old, fresh: false, hof: place(old.id), kept: true };
    if (i >= 0) h.runs[i] = r;
    else { h.runs.push(r); if (h.runs.length > HIS.CAP) h.runs.splice(0, h.runs.length - HIS.CAP); }
    const b = h.by[r.c] || (h.by[r.c] = [0, 0]);
    if (!old) { h.n = (h.n | 0) + 1; b[0]++; if (hisWon(r)) b[1]++; }
    else if (!hisWon(old) && hisWon(r)) b[1] = Math.min(b[0], b[1] + 1);
    const hof = h.hof.filter((x) => x.id !== r.id);
    hof.push(r);
    h.hof = hisRank(hof).slice(0, HIS.HOF);
    return { rec: r, fresh: !old, hof: place(r.id) };
  }
  // The list screen's filters: f {c: crawler | 'all', r: 'win' (Endless too) | 'loss' | 'endless' | 'quit' | 'all'}.
  function hisFilter(list, f) {
    f = f || {};
    return (list || []).filter((r) => (!f.c || f.c === 'all' || r.c === f.c)
      && (!f.r || f.r === 'all' || (f.r === 'win' ? hisWon(r) : r.r === f.r)));
  }
  // The lifetime charts: the score line over the runs given (oldest first) and win rate per crawler.
  function hisChart(list, by) {
    list = list || [];
    const pts = list.map((r) => ({ s: r.s | 0, r: r.r, id: r.id }));
    let max = 0, best = -1, sum = 0;
    pts.forEach((p, i) => { sum += p.s; if (p.s > max) { max = p.s; best = i; } });
    const per = [];
    for (const c in by || {}) { const v = by[c]; if (Array.isArray(v) && v[0] > 0) per.push({ c, n: v[0], w: Math.min(v[0], v[1] | 0), rate: Math.min(v[0], v[1] | 0) / v[0] }); }
    per.sort((a, b) => b.n - a.n || (a.c < b.c ? -1 : 1));
    const wins = list.filter(hisWon).length;
    return { pts, max, best, avg: pts.length ? Math.round(sum / pts.length) : 0, per, n: list.length, wins, rate: list.length ? wins / list.length : 0 };
  }
  // The act's map in 2 bits a hex (see the key above); null for no map.
  function hisMapPack(M) {
    if (!M || !M.tiles || !(M.cols > 0) || !(M.rows > 0) || M.cols * M.rows > 1500) return null;
    const w = M.cols | 0, h = M.rows | 0;
    const idx = (p) => (p && typeof p.q === 'number' && typeof p.r === 'number' && p.r >= 0 && p.r < h ? p.r * w + p.q + Math.floor(p.r / 2) : -1);
    let g = '', acc = 0, k = 0;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const t = M.tiles[(c - Math.floor(r / 2)) + ',' + r];
        const v = !t ? 0 : t.terrain === 'sea' ? 1 : (t.visited || t.done) ? 3 : t.revealed ? 2 : 0;
        acc += v << (2 * k);
        if (++k === 3) { g += HIS_B64[acc]; acc = 0; k = 0; }
      }
    }
    if (k) g += HIS_B64[acc];
    return { w, h, g, p: idx(M.pos), b: idx(M.boss), s: idx(M.start) };
  }
  // The packed map back to one value per cell (row-major, column c is axial q = c - floor(r / 2)); null when broken.
  function hisMapCells(mp) {
    if (!mp || !(mp.w > 0) || !(mp.h > 0) || typeof mp.g !== 'string') return null;
    const n = (mp.w | 0) * (mp.h | 0);
    if (n > 1500 || mp.g.length < Math.ceil(n / 3)) return null;
    const out = new Array(n);
    for (let i = 0; i < n; i++) { const v = HIS_B64.indexOf(mp.g[(i / 3) | 0]); out[i] = v < 0 ? 0 : (v >> (2 * (i % 3))) & 3; }
    return out;
  }
  /* The death recap's words. rc: {kind: 'hit' | 'burn' | 'poison' | 'bomb' |
     'self' | '', name, mv, amt, charged, chargeName, verb, hits, grabsLeft,
     lethal, need, bare (turns in a row hit with no Block), maxHp, tier}. */
  function hisKillLine(rc) {
    rc = rc || {};
    const amt = Math.max(0, rc.amt | 0);
    switch (rc.kind) {
      case 'hit': return `Killed by ${rc.name || 'a monster'} with ${rc.charged && rc.chargeName ? rc.chargeName : rc.mv || 'a hit'} for ${amt}`;
      case 'burn': return `Burned down: your own Burn did the last ${amt}`;
      case 'poison': return `Poison finished you for ${amt}`;
      case 'bomb': return `A bomb in the bin went off for ${amt}`;
      case 'self': return `Your own bin hit you for ${amt}`;
      default: return `Killed by ${rc.name || 'the Clawspire'}`;
    }
  }
  // One or two tips from what happened, the most useful first.
  function hisTips(rc) {
    rc = rc || {};
    const out = [];
    const add = (s) => { if (s && out.length < 2 && out.indexOf(s) < 0) out.push(s); };
    const name = rc.name || 'It', amt = Math.max(0, rc.amt | 0), g = Math.max(0, rc.grabsLeft | 0);
    if (rc.kind === 'hit' && rc.charged && rc.chargeName) add(`${name}'s ${rc.chargeName} hits for ${amt} on the turn after ${rc.verb || 'winding up'}. Stack Block or kill it first.`);
    if (g > 0) add(`You had ${g} unused grab${g === 1 ? '' : 's'} on your last turn. Every grab is a shield or a hit you did not play.`);
    if (rc.lethal && rc.need > 0) add(`The INCOMING pill read LETHAL: ${rc.need} more Block would have kept you standing. When it pulses red, grab shields first.`);
    if (rc.kind === 'burn' || rc.kind === 'poison') add(`${rc.kind === 'burn' ? 'Burn' : 'Poison'} ticks through Block. A potion or a cleanse clears it; end fights fast while it stacks.`);
    if (rc.kind === 'bomb') add('A lit bomb went off in the bin. Grab it and play it before its fuse runs down.');
    if (rc.kind === 'hit' && (rc.hits | 0) > 1) add(`${name} hit you ${rc.hits | 0} times in one turn. Block soaks every hit, so one big shield covers the whole flurry.`);
    if ((rc.bare | 0) >= 2) add(`You took hits on ${rc.bare | 0} turns in a row with no Block up. One shield a turn keeps the chip damage off.`);
    if (rc.maxHp > 0 && amt >= rc.maxHp * 0.4) add(`That hit took ${Math.round(amt / rc.maxHp * 100)}% of your max HP. A red bubble over an enemy warns you a turn ahead.`);
    if (rc.tier === 'boss') add('Bosses change their pattern at half HP. Save a strong grab for the turn it transforms.');
    else if (rc.tier === 'elite') add('Elites hit harder than the rest of their act. A rest stop before one gives you room to learn it.');
    add('The INCOMING pill at the arena\'s left edge adds up the whole enemy turn before you end yours.');
    return out;
  }
  // ================================================================ /HISTORY

  // ================================================================ LORE (round 9: the Codex, landmark lore, act intros, the weekly challenge)
  /* Pure data and pure helpers (DESIGN.md "Lore and the weekly challenge
     (round 9)"). The Codex is a book of chapters and pages; a page unlocks by
     a rule read off the profile (loreVal / loreOk / loreCheck never mutate
     it). The book is built on first use (loreBook), so boot stays light.
     Map landmarks speak one-liners (loreSnippet), the old high score board
     reads the Hall of Fame (loreBoard), every act opens on a title card
     (loreIntro). The weekly challenge is a fixed seed by ISO week with a
     theme, 2 or 3 mutators, a crawler and a claw, and medal targets (wk*);
     every date is passed in, nothing here reads the clock. */
  const LORE_CH = [
    { id: 'spire', name: 'The Clawspire', icon: '\u{1F5FC}', col: '#ff2e88', blurb: 'The tower, the arcade, and the rules nobody wrote down.' },
    { id: 'master', name: 'The Prize Master', icon: '\u{1F3A9}', col: '#ffc94d', blurb: 'The host. The house. The hand on the joystick.' },
    { id: 'floors', name: 'The Floors', icon: '\u{1F3E2}', col: '#2ee6d6', blurb: 'Three storeys of arcade stacked on top of each other, all closed.' },
    { id: 'crawlers', name: 'The Crawlers', icon: '\u{1F392}', col: '#a6ff5e', blurb: 'Five fools with a claw machine strapped to their backs.' },
    { id: 'bosses', name: 'The Bosses', icon: '\u{1F451}', col: '#ff5a4a', blurb: 'The floor managers. Every one of them used to be something else.' },
    { id: 'bestiary', name: 'The Bestiary', icon: '\u{1F47E}', col: '#b388ff', blurb: 'Who lives in the machines, and what they want from your bin.' },
    { id: 'gary', name: 'Grabby Gary', icon: '\u{1F9E2}', col: '#3ddc84', blurb: 'Undefeated. Unbearable. Unfortunately, very good.' },
    { id: 'machine', name: 'The Machine', icon: '\u{1F50C}', col: '#ff2e30', spoiler: true, blurb: 'It was always plugged in.' },
  ];
  const LORE_SPOIL = 'Some pages are better found than told. Keep climbing, keep looking.';
  // The pages: {id, ch, name, art {k, id?, act?}, r: [rule kind, ...args], text, hint?, spoiler?}.
  // Kept in a function so the text is only turned into objects when the Codex (or a check) first asks.
  function loreEntries() {
    return [
      // ---- the Clawspire
      { id: 'spire_tower', ch: 'spire', name: 'The Tower', art: { k: 'tower' }, r: ['runs', 1],
        text: 'Nobody built the Clawspire on purpose. It started as one claw machine in the back of a laundromat, and every time somebody lost, it grew another floor. Arcades got stacked on arcades. Carpets got stacked on carpets. Now it goes up past the clouds, humming, blinking, taking quarters from people who stopped carrying quarters years ago. The sign out front still says OPEN 24 HOURS. It does not say which hours, or whose.' },
      { id: 'spire_rig', ch: 'spire', name: 'The Rig', art: { k: 'rig' }, r: ['played', 25],
        text: 'Every Crawler climbs with a claw machine strapped to their back. It is heavy, it is cursed, and it is the only weapon the tower respects. You do not swing a sword in here. You win one. Whatever the claw drops down the chute gets played, fair and square, the way the machines like it. The Rig has opinions about grip strength. The Rig has opinions about everything. Some Crawlers swear it hums along when they win.' },
      { id: 'spire_dark', ch: 'spire', name: 'The Dark', art: { k: 'dark' }, r: ['fights', 10],
        text: 'The Clawspire lost power on every floor at once, one Tuesday, and never got it back. What is left runs on marquee bulbs: little glass promises that something is still switched on. Light one and the floor remembers itself for a while. Towers see further. Roads stay lit because somebody keeps walking them. Nobody has found the fuse box. Nobody has looked very hard, either. In the dark the machines are cheaper to run, and they know it.' },
      { id: 'spire_tickets', ch: 'spire', name: 'Tickets', art: { k: 'tickets' }, r: ['caps', 5],
        text: 'Tickets are the only currency older than the tower. Every jackpot spits a ribbon of them, every prize counter pretends they are worth something, and every Crawler keeps a fat roll in a back pocket just in case. In the old days kids traded ten thousand tickets for a rubber spider and walked away happy. The rubber spiders are still here, on the top shelf behind the glass, and some of them have started trading tickets back.' },
      { id: 'spire_cabinets', ch: 'spire', name: 'The Cabinets', art: { k: 'cabinet' }, r: ['arc', 5],
        text: 'Plinko, the wheel, the slots, whack-a-mole, skee-ball. The tower kept all of its old games plugged in, even the ones nobody ever won. They are not traps, exactly. They just remember what it felt like to be fed a coin, and they would like to feel it again. Play one and the lights come up the way they used to on a Friday night. Walk away and you can hear them powering down behind you, a little slower than they need to.' },
      { id: 'spire_keys', ch: 'spire', name: 'Golden Keys', art: { k: 'key' }, r: ['keys', 1], spoiler: true,
        text: 'There are three of them, one to a floor, and none of them are where a key should be. One rides around in a monster\'s pocket. One pays out from a jackpot. One lies in the dark where nobody walks. The Prize Master pretends not to know about them. He checks the lost and found every night, though, and always leaves looking a little disappointed. Whatever they open, it is not the front door.' },
      { id: 'spire_loop', ch: 'spire', name: 'Insert Another Coin', art: { k: 'loop' }, r: ['loop', 1],
        text: 'Beating the Prize Master does not turn the tower off. It just reboots it. The screens go white, the marquee spells BIOS in a font nobody has used since the nineties, and the floors come back meaner, shuffled like a deck. The monsters remember nothing. The bulbs remember everything. Crawlers who stay for another loop call it Endless, because saying Forever out loud in an arcade is bad luck. The high score table only goes to seven digits.' },
      // ---- the Prize Master
      { id: 'pm_host', ch: 'master', name: 'The Host', art: { k: 'enemy', id: 'prizemaster', act: 3 }, r: ['seen', 'prizemaster'], hint: 'Climb to the top floor and meet the host.',
        text: 'The Prize Master runs the Clawspire the way a cat runs a fishbowl. Tall hat, bright teeth, a voice like a jackpot in a tin can. He greets every Crawler personally, compliments their grip, and asks them to step right up. Everybody wins, he says, and technically he is right: somebody always wins, and it is always the house. He has never been seen blinking. He has once been seen dusting a trophy, very tenderly.' },
      { id: 'pm_wall', ch: 'master', name: 'The Prize Wall', art: { k: 'prizes' }, r: ['wins', 1],
        text: 'Behind the Prize Master\'s counter is a wall of prizes that goes up forever. Plush bears. Glass swans. A surprising number of helmets. Look closer and the helmets have names scratched inside them, and so do the swans. Those are the Crawlers who lost. He does not hurt them, exactly. He just wins them, and keeps them, and polishes them on Sundays. When you beat him, a few prizes on the wall turn their heads to watch you leave.' },
      { id: 'pm_tilt', ch: 'master', name: 'Tilt', art: { k: 'tilt' }, r: ['tilt', 3],
        text: 'Every time you beat him, the Prize Master gets up, straightens his hat, and bends the machine a little further. A looser coin here, a stickier joystick there, a bent prong in the elites\' claws. He calls it Tilt, the way pinball players do, as if the table were the one cheating. He is not angry about losing. He is interested. Nobody has made him interested in a very long time, and it is not a good look on him.' },
      { id: 'pm_chair', ch: 'master', name: 'The Empty Chair', art: { k: 'chair' }, r: ['wins', 5],
        text: 'After the fifth time, the Prize Master stops saying step right up. He starts saying welcome back. He keeps a chair behind the counter now, with your name taped on it, just in case you ever want to stay and help. Great hours, he says. Great prizes. He was a Crawler too, you know, a long time ago, before the tower offered him the counter. He does not remember his real name. He remembers his high score.' },
      // ---- the floors
      { id: 'fl_cellar', ch: 'floors', name: 'The Damp Arcade', art: { k: 'act', act: 1 }, r: ['fights', 1],
        text: 'The basement level, where the prizes rust. The carpet is wet in places nobody can explain and the moss has learned to glow in time with the attract mode. Coin Rats live in the returns. Slimes live in the drip trays. The machines down here are the oldest in the tower and the most forgiving, which is not saying much. Every Crawler starts here, standing in a puddle, looking up the stairs, wondering why the elevator has a claw instead of a button.' },
      { id: 'fl_foundry', ch: 'floors', name: 'The Clockwork Foundry', art: { k: 'act', act: 2 }, r: ['act', 2],
        text: 'The mezzanine, where the prizes are made. Somewhere a furnace never stops, and the air tastes of pennies. Conveyor belts carry half finished plush toward machines that stamp, stitch and glue them into something you might want. Gremlins wind the clocks. Golems haul the scrap. Everything here was built to make prizes faster than anybody could win them, and it worked. The foundry has been overproducing for decades. Nobody told it to stop, so it never did.' },
      { id: 'fl_vault', ch: 'floors', name: 'The Frozen Penthouse', art: { k: 'act', act: 3 }, r: ['act', 3],
        text: 'The top floor, where the prizes are kept forever. It is cold up here on purpose: cold keeps things mint. The shelves are glass, the floors are ice, and the cabinets hum a lullaby to themselves in a key that makes your teeth ache. Every prize nobody claimed ends up in the penthouse eventually, labelled and frozen and very quiet. The view is incredible. You can see the whole city from up here, all of its lights, none of them yours.' },
      { id: 'fl_room', ch: 'floors', name: 'The Back Room', art: { k: 'room' }, r: ['rooms', 1], spoiler: true,
        text: 'Behind the Prize Master\'s counter there is a door marked STAFF ONLY, and behind that door is the part of the arcade nobody was supposed to see. Circuit boards for floors. Coin hoppers for walls. Service lights blinking in a rhythm that sounds like breathing. This is where the tower keeps its insides. Every quarter ever lost in the Clawspire rolled downhill to this room eventually, and something has been counting them the whole time.' },
      // ---- the crawlers
      { id: 'cr_knight', ch: 'crawlers', name: 'Sir Grabsworth', art: { k: 'char', id: 'knight' }, r: ['win', 'knight'],
        text: 'Sir Grabsworth was knighted for services to the claw machine at a county fair, by a mayor who had lost a bet. He took it seriously. He takes everything seriously. He polishes his shield before every drop and apologises to prizes he fails to pick up. His grip is the strongest in the tower and his rails are the slowest, because he refuses to rush a gentleman. He climbs the Clawspire to rescue his squire, who went up for a stuffed dragon in 1987.' },
      { id: 'cr_alchemist', ch: 'crawlers', name: 'Mira Fizzwick', art: { k: 'char', id: 'alchemist' }, r: ['win', 'alchemist'],
        text: 'Mira Fizzwick failed her alchemy exam three times, on account of the explosions, and passed the fourth on account of a better explosion. She carries a tiny claw because a tiny claw fits a tiny flask, and everything she owns bubbles, fizzes or glows. She says she climbs for science. She is really climbing for the penthouse freezer, where rumour says the tower keeps a soda that never goes flat. She has a very specific idea of immortality.' },
      { id: 'cr_rogue', ch: 'crawlers', name: 'Pip Quickclaw', art: { k: 'char', id: 'rogue' }, r: ['win', 'rogue'],
        text: 'Pip Quickclaw has the fastest rails in the tower and the lightest fingers in the city, which is how Pip ended up with a claw machine in the first place. It was supposed to be a quick job: lift the Rig, sell the Rig, retire somewhere with a beach. The Rig had other plans and would not come off. So Pip climbs, pocketing every coin on the way up, telling anyone who asks that the whole tower is technically a heist.' },
      { id: 'cr_gambler', ch: 'crawlers', name: 'Lucky Lou', art: { k: 'char', id: 'gambler' }, r: ['win', 'gambler'],
        text: 'Lucky Lou has never won a thing in his life on purpose. He loses so well, so reliably and with such style that his luck has nowhere to go but up, and it piles up behind him like a debt coming due. Every whiff is a deposit. Every double is a withdrawal. He climbs the Clawspire because the Prize Master owes him a rematch from a card game in the car park. The Prize Master says that was a different Lou.' },
      { id: 'cr_engineer', ch: 'crawlers', name: 'Mama Mech', art: { k: 'char', id: 'engineer' }, r: ['win', 'engineer'],
        text: 'Mama Mech repaired every machine in the Damp Arcade for thirty years and never got a single thank you, only more quarters stuck in more slots. When the tower started taking Crawlers, she stopped fixing and started building. Everything metal she wins goes into the turret on her Rig, bolt by bolt, until it has opinions of its own. She climbs to have a word with the management. Not an angry word. A long word, with a clipboard.' },
      { id: 'cr_bubbler', ch: 'crawlers', name: 'Ms. Bubbles', art: { k: 'char', id: 'bubbler' }, r: ['win', 'bubbler'],
        text: 'Ms. Bubbles ran the laundromat next door to the Damp Arcade, and every kid who ever lost a quarter in a claw machine came to her to cry about it. She gave them soap bubbles instead. One day she noticed the bubbles could lift a prize, if you blew them right. Now she climbs the Clawspire with a wand, a duck and a very firm opinion that nobody should ever lose a prize to a slippery grip again.' },   // (ROS, round 10)
      { id: 'cr_techie', ch: 'crawlers', name: 'Joy Stick', art: { k: 'char', id: 'techie' }, r: ['win', 'techie'],
        text: 'Joy Stick is the arcade technician nobody ever sees: the one who comes in after closing, opens the cabinets with a ring of tiny keys and talks to them while she works. She knows which lamp flickers when a machine is happy and which coin door sticks when it sulks. When the Clawspire started running its cabinets on its own, she took it personally. Now she climbs with a service remote in her pocket, and every machine on every floor seems to be quietly on her side.' },   // (TECH, round 17)
      // ---- the bosses
      { id: 'bo_hoard', ch: 'bosses', name: 'The Hoard', art: { k: 'enemy', id: 'hoard', act: 1 }, r: ['kills', 'hoard', 1],
        text: 'Every prize nobody ever won, piled up in the basement and angry about it. The Hoard started as a heap of lost plush behind the coin return and grew a mouth out of sheer resentment. It flings coins it never earned and sulks when you take them back. It is not evil, just jealous: it watched a thousand kids walk past to the good machines. Beat it and the heap falls apart into ordinary junk, and for a moment it looks almost relieved.' },
      { id: 'bo_smelter', ch: 'bosses', name: 'The Smelter', art: { k: 'enemy', id: 'smelter', act: 2 }, r: ['kills', 'smelter', 1],
        text: 'The foundry furnace, awake. The Smelter used to melt down broken prizes so they could be made into new ones, which is recycling, which is nice. Then the tower ran low on broken prizes and it started melting down Crawlers instead, into shiny little tokens with surprised faces. It runs very hot and very proud. It heats your metal until it bites your hands. Somewhere in its belly there are still a few tokens that remember their names.' },
      { id: 'bo_glacius', ch: 'bosses', name: 'Glacius, the Ice Box', art: { k: 'enemy', id: 'glacius', act: 3 }, r: ['kills', 'glacius', 1],
        text: 'The penthouse freezer, standing up. Glacius was built to keep prizes mint forever, and it took the job personally. It ices over your chute, your rails and eventually your patience. It is lonely up there in the cold, with nothing but perfect things that never move. It asks Crawlers to stay a while. It means forever. Behind Glacius there is a door marked STAFF ONLY, and it has guarded that door for so long it forgot why.' },
      { id: 'bo_plush', ch: 'bosses', name: 'The Plushie Queen', art: { k: 'enemy', id: 'plushqueen', act: 1 }, r: ['kills', 'plushqueen', 1],
        text: 'Every unclaimed plush in the tower pledged itself to her, and there are a lot of unclaimed plush. The Plushie Queen rules the basement from a throne of bears that will never be hugged by a child, and she takes that personally too. Her subjects throw themselves between you and her, soft and loyal and very hard to hit through. Grab them out of the bin and she gets small and sad. Some Crawlers feel bad. Most keep grabbing.' },
      { id: 'bo_conveyor', ch: 'bosses', name: 'The Conveyor King', art: { k: 'enemy', id: 'conveyorking', act: 2 }, r: ['kills', 'conveyorking', 1],
        text: 'Head of shipping for the Clockwork Foundry, crowned by nobody, which he considers a technicality. The Conveyor King believes everything should keep moving, always, preferably away from you. He turns the floor of your bin into a belt and ships crates in while he is at it. He has never delivered a single parcel. The loading dock outside his office is stacked to the ceiling with boxes addressed to people who stopped waiting years ago.' },
      { id: 'bo_arctic', ch: 'bosses', name: 'The Arctic Arcade', art: { k: 'enemy', id: 'arcticarcade', act: 3 }, r: ['kills', 'arcticarcade', 1],
        text: 'A whole arcade froze solid one winter and decided to keep running anyway. The Arctic Arcade is thirty cabinets fused into one block of ice, every screen still playing its attract mode, every speaker still chirping INSERT COIN through two feet of frost. It freezes your prizes into its growing collection because that is the only way it knows how to hold on to anything. Smash the block and they come back out cold, blinking, a little embarrassed.' },
      // ---- the bestiary
      { id: 'be_rat', ch: 'bestiary', name: 'Coin Rat', art: { k: 'enemy', id: 'rat', act: 1 }, r: ['kills', 'rat', 5],
        text: 'Coin Rats live in the coin returns of every machine in the Damp Arcade, which is why nobody ever gets their change back. They bite anything shiny, including you, and they are sure that everything is shiny if you look at it hopefully enough. A Coin Rat has never spent a coin. It stacks them into little towers in the dark and sits on top, the king of its own small Clawspire, squeaking at the ceiling.' },
      { id: 'be_slime', ch: 'bestiary', name: 'Sticky Slime', art: { k: 'enemy', id: 'slime', act: 1 }, r: ['kills', 'slime', 5],
        text: 'Mostly water, the rest attitude. Sticky Slimes seep out of the drip trays after closing and wobble around looking for trouble, or crumbs, or both. Pop one and it splits into smaller, angrier ones, which is a lesson in something. They are harmless the way a spilled drink on a joystick is harmless: technically yes, but the game is ruined. Somebody once watched one dissolve a whole bag of gummy worms and look extremely pleased with itself.' },
      { id: 'be_panda', ch: 'bestiary', name: 'Trash Panda', art: { k: 'enemy', id: 'trashpanda', act: 1 }, r: ['kills', 'trashpanda', 5],
        text: 'Trash Pandas live behind the prize counter and consider everything on the other side of it an open buffet. Anything shiny goes straight down the hatch: coins, keys, your best sword. They are not malicious. They are just hungry, and the tower has been feeding them the wrong things for a very long time. Hit one hard enough and it hiccups your stuff back up, slightly damp. They are ashamed of this, and wash their paws afterwards, thoroughly.' },
      { id: 'be_tickler', ch: 'bestiary', name: 'Tickle Monster', art: { k: 'enemy', id: 'tickler', act: 1 }, r: ['kills', 'tickler', 5],
        text: 'The Tickle Monster lives under the prize counter and has eleven arms, all of them feathers. It cannot hurt you. It does not want to hurt you. It only wants your claw to laugh so hard it drops what it is holding, which, in the Clawspire, is worse. Rumour says it used to be the arcade\'s mascot suit, back when there were birthday parties and somebody inside the suit. Nobody is inside it now. Probably.' },
      { id: 'be_mimic', ch: 'bestiary', name: 'Prize Mimic', art: { k: 'enemy', id: 'mimic', act: 1 }, r: ['kills', 'mimic', 3],
        text: 'It looks like a prize. It is a mouth. The Prize Mimic sits on the shelf with a price tag in its teeth and waits for a Crawler to reach for it, and then it reaches back. It eats the best thing in your bin first, because it has taste. Mimics are what happens when a prize waits so long to be won that it decides to go and win somebody instead. Deep down they just want to be picked first.' },
      { id: 'be_barker', ch: 'bestiary', name: 'Carnival Barker', art: { k: 'enemy', id: 'barker', act: 1 }, r: ['kills', 'barker', 3],
        text: 'The Carnival Barker runs the prize wheel, and the prize wheel has eight wedges, most of which say BARKER. He tips his hat, he spins, he wins. He has been spinning that wheel since the tower was a single boardwalk, and he has never once lost on purpose. Beat him anyway and he laughs, genuinely, like nothing has surprised him in years. Then he writes your name on a wedge. By morning the wedge says BARKER again.' },
      { id: 'be_ironjaw', ch: 'bestiary', name: 'Ironjaw', art: { k: 'enemy', id: 'ironjaw', act: 2 }, r: ['kills', 'ironjaw', 3],
        text: 'A bear trap that learned to walk, and then learned to swallow. Ironjaw clanks around the foundry floor chewing anything metal, and it considers you mostly metal. It opens wide before it bites, a whole turn early, as a courtesy nobody appreciates. More Crawlers have lost their climbs to Ironjaw than to any boss in the tower. It keeps no trophies. It just keeps chewing, patient and hungry, like a door that has been waiting all day to slam.' },
      { id: 'be_magbat', ch: 'bestiary', name: 'Magnet Bat', art: { k: 'enemy', id: 'magbat', act: 2 }, r: ['kills', 'magbat', 5],
        text: 'Magnet Bats roost upside down on the claw rail, humming. Every piece of metal in the cabinet wants to roost with them, which is why your swords keep drifting up to the lid. The bats think they are being hospitable. They are very social animals and very bad at reading a room. A foundry worker once taught one to fetch bolts. It fetched every bolt in the building, including the ones holding the building up.' },
      { id: 'be_ghost', ch: 'bestiary', name: 'Peekaboo Ghost', art: { k: 'enemy', id: 'ghost', act: 3 }, r: ['kills', 'ghost', 5],
        text: 'The Peekaboo Ghost haunts the prize shelf and plays peekaboo with your things. It always wins, because it is a ghost, and because what it hides is still there, invisible, waiting for your claw to brush against it. It is not a scary ghost. It is the ghost of a kid who once spent a whole afternoon looking for a lost ticket and never found it. It hides things so somebody else can have the fun of finding them.' },
      { id: 'be_collector', ch: 'bestiary', name: 'The Claw Collector', art: { k: 'enemy', id: 'collector', act: 3 }, r: ['kills', 'collector', 3],
        text: 'The Claw Collector brought its own claw. It rides a little trolley under the lid, picks your rarest prize and lifts it into a glass case, mint in box, never to be touched again. It is the most dangerous kind of collector: the kind that does not even want to play with anything. Its case is full of things Crawlers loved. Beat it and the glass cracks, and every prize inside tumbles out, confused and grateful and a little dusty.' },
      // ---- Grabby Gary
      { id: 'gy_meet', ch: 'gary', name: 'Grabby Gary', art: { k: 'gary', gear: 0 }, r: ['gary', 'met', 1],
        text: 'Grabby Gary is sixteen, undefeated and happy to tell you about it. He has his own claw, his own sweatband and his own theme song, which he hums while he plays. He challenges every Crawler he meets to a claw-off, three drops each, winner takes the best prize in the bin. He is extremely good. He is also extremely annoying about it. Nobody knows how he got into the tower. He says he was born here, next to the skee-ball.' },
      { id: 'gy_beat', ch: 'gary', name: 'The Rematch', art: { k: 'gary', gear: 2 }, r: ['gary', 'wins', 1],
        text: 'The first time you beat Grabby Gary in a claw-off, he goes very quiet, checks the claw for faults, checks the prize for faults, checks you for faults, and then asks for a rematch. Every time after that he turns up with new gear: shades, a gold chain, a jacket with his own name on the back. He is not getting better so much as more expensive. Secretly he writes down every one of your drops in a notebook.' },
      { id: 'gy_duel', ch: 'gary', name: 'The Showdown', art: { k: 'gary', gear: 4 }, r: ['gary', 'beat', 1],
        text: 'Beat Gary twice in one climb and he stops asking for claw-offs and asks for a real fight, up in the penthouse, with his own claw bolted to his back like yours. It is the first time anyone has ever made him try. When he loses the showdown he sits on the floor for a long time. Then he laughs, the real kind, and says nobody ever beat him fair before. Everybody else just stopped showing up.' },
      // ---- The Machine (the whole chapter stays shut until it has been met)
      { id: 'mc_machine', ch: 'machine', name: 'The Machine', art: { k: 'enemy', id: 'machine', act: 3 }, r: ['seen', 'machine'],
        text: 'The Prize Master never owned the Clawspire. The Clawspire owned the Prize Master. Down in the Back Room, wired into every cabinet on every floor, sits the first claw machine: the one from the laundromat, grown to fill a room, its marquee eyes wide open. It has been playing all of you, every Crawler, every monster, every host in a top hat. It does not want your quarters any more. It wants you to keep playing.' },
      { id: 'mc_down', ch: 'machine', name: 'Powered Down', art: { k: 'dawn' }, r: ['ends', 1],
        text: 'When The Machine finally goes dark, it does not explode. It powers down, one bulb at a time, the way an arcade closes at the end of a long night. SYSTEM FAILURE. POWERING DOWN. GOODNIGHT, CONTESTANT. Then quiet, for the first time in the tower\'s life. Walk out the front door and the sun is coming up over the car park. The prizes on the shelves are just prizes now. Somewhere a kid finds a quarter in the gutter.' },
      { id: 'mc_again', ch: 'machine', name: 'Goodnight, Contestant', art: { k: 'enemy', id: 'machine', act: 3, sleep: true }, r: ['ends', 2],
        text: 'Here is the secret the true ending does not tell you: the Clawspire always switches back on. Somebody feeds it a coin, somewhere, some night, and the marquee flickers, and the floors stack themselves up again, and the rats find the coin returns. Maybe that is not a curse. Maybe an arcade is just a place that refuses to stay closed. The Machine remembers you now. It saved your initials. Next time, it says, you can go first.' },
    ];
  }
  const LORE_RULES = ['runs', 'fights', 'played', 'act', 'wins', 'win', 'kills', 'seen', 'caps', 'arc', 'keys', 'rooms', 'ends', 'gary', 'tilt', 'loop'];
  const LORE_ART = ['tower', 'rig', 'dark', 'tickets', 'cabinet', 'key', 'loop', 'enemy', 'prizes', 'tilt', 'chair', 'act', 'room', 'char', 'gary', 'dawn'];
  let LORE_BOOK = null;
  // The book: chapters in order, pages in order, lookups. Built once, on first use.
  function loreBook() {
    if (LORE_BOOK) return LORE_BOOK;
    const entries = loreEntries().concat(depLorePages()), byId = {}, ch = {};   // (DEP round 15: the Neon Depths' pages)
    for (const c of LORE_CH) ch[c.id] = [];
    for (const e of entries) { byId[e.id] = e; if (ch[e.ch]) ch[e.ch].push(e.id); }
    LORE_BOOK = { chapters: LORE_CH, entries, byId, ids: entries.map((e) => e.id), ch };
    return LORE_BOOK;
  }
  const loreN = (x) => Math.max(0, Math.floor(+x || 0));
  const loreObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  // A rule's progress off the profile: {v, goal} (pure; a missing field reads 0).
  function loreVal(r, m) {
    m = loreObj(m) || {};
    r = Array.isArray(r) ? r : [];
    const st = loreObj(m.stats) || {}, L = loreObj(m.lore) || {}, sec = loreObj(m.sec) || {}, g = loreObj(m.gary) || {};
    switch (r[0]) {
      case 'runs': case 'fights': case 'played': case 'wins': return { v: loreN(st[r[0]]), goal: r[1] | 0 };
      case 'act': return { v: loreN(st.bestAct), goal: r[1] | 0 };
      case 'win': return { v: Math.min(1, loreN((loreObj(m.winsBy) || {})[r[1]])), goal: 1 };
      case 'kills': return { v: loreN((loreObj(L.kills) || {})[r[1]]), goal: r[2] | 0 };
      case 'seen': return { v: m.seen && m.seen.enemies && m.seen.enemies[r[1]] ? 1 : 0, goal: 1 };
      case 'caps': return { v: loreN((loreObj(m.loot) || {}).caps), goal: r[1] | 0 };
      case 'arc': return { v: loreN((loreObj(m.arc) || {}).plays), goal: r[1] | 0 };
      case 'keys': case 'rooms': case 'ends': return { v: loreN(sec[r[0]]), goal: r[1] | 0 };
      case 'gary': return { v: loreN(g[r[1]]), goal: r[2] | 0 };
      case 'tilt': { let v = -1; const b = loreObj(m.bestTilt) || {}; for (const k in b) if (+b[k] >= 0) v = Math.max(v, Math.floor(+b[k])); return { v: Math.max(0, v), goal: r[1] | 0, won: v >= 0 }; }
      case 'loop': return { v: loreN((loreObj(m.endless) || {}).best), goal: r[1] | 0 };
      default: return { v: 0, goal: 1 };
    }
  }
  // A chapter is open (its title shows) unless it is a spoiler nobody has met yet.
  function loreChOpen(chId, m) {
    const c = LORE_CH.find((x) => x.id === chId);
    if (!c) return false;
    if (!c.spoiler) return true;
    return !!(m && m.seen && m.seen.enemies && m.seen.enemies.machine);
  }
  // Has the profile earned this page? (an id or an entry)
  function loreOk(e, m) {
    e = typeof e === 'string' ? loreBook().byId[e] : e;
    if (!e || !e.r) return false;
    if (!loreChOpen(e.ch, m)) return false;
    const x = loreVal(e.r, m);
    if (e.r[0] === 'tilt') return !!x.won && x.v >= x.goal;
    return x.goal > 0 && x.v >= x.goal;
  }
  // The pages a profile newly earns (have: {id: truthy} already unlocked), in book order.
  function loreCheck(m, have) {
    have = loreObj(have) || {};
    const out = [];
    for (const e of loreBook().entries) {
      if (have[e.id]) continue;
      let ok = false;
      try { ok = loreOk(e, m); } catch (err) { ok = false; }
      if (ok) out.push(e.id);
    }
    return out;
  }
  // How a locked page is earned, in words (a spoiler page keeps its secret).
  function loreHint(e, m) {
    e = typeof e === 'string' ? loreBook().byId[e] : e;
    if (!e) return '';
    if (e.spoiler || !loreChOpen(e.ch, m)) return LORE_SPOIL;
    if (e.hint) return e.hint;
    const r = e.r || [], n = r[r.length - 1] | 0;
    const en = (id) => (ENEMIES[id] && ENEMIES[id].name) || id;
    switch (r[0]) {
      case 'runs': return 'Start a climb.';
      case 'fights': return n === 1 ? 'Fight your first fight.' : `Fight ${n} fights in the tower.`;
      case 'played': return `Deliver ${n} prizes down the chute.`;
      case 'act': return `Reach act ${n}.`;
      case 'wins': return n === 1 ? 'Beat the Prize Master.' : `Beat the Prize Master ${n} times.`;
      case 'win': return `Win a climb as ${(CHARACTERS[r[1]] && CHARACTERS[r[1]].name) || r[1]}.`;
      case 'kills': return n === 1 ? `Defeat ${en(r[1])}.` : `Defeat ${en(r[1])} ${n} times.`;
      case 'seen': return `Meet ${en(r[1])}.`;
      case 'caps': return `Open ${n} prize capsules.`;
      case 'arc': return `Play the arcade cabinets on the map ${n} times.`;
      case 'gary': return r[1] === 'met' ? 'Somebody by the road wants a claw-off.' : r[1] === 'wins' ? 'Win a claw-off against Grabby Gary.' : 'Beat Grabby Gary in the showdown.';
      case 'tilt': return `Win a climb at Tilt ${n} or higher.`;
      case 'loop': return 'Keep playing past the Prize Master.';
      default: return LORE_SPOIL;
    }
  }
  // meta.lore repaired: {got, new, kills, intros}; junk is dropped, NEW only on pages owned.
  function loreFix(o) {
    const src = loreObj(o) || {}, B = loreBook();
    const flags = (x) => { const out = {}; const s = loreObj(x) || {}; for (const id in s) if (B.byId[id] && s[id]) out[id] = 1; return out; };
    const got = flags(src.got), fresh = flags(src.new);
    for (const id in fresh) if (!got[id]) delete fresh[id];
    const kills = {}, ks = loreObj(src.kills) || {};
    for (const id in ks) { const n = loreN(ks[id]); if (n > 0 && id.length <= 40) kills[id] = Math.min(n, 1e9); }
    const intros = {}, is = loreObj(src.intros) || {};
    for (const k in is) { const n = loreN(is[k]); if (n > 0 && /^(a[1-3]|room|L\d{1,4})$/.test(k)) intros[k] = Math.min(n, 1e6); }
    return { got, new: fresh, kills, intros };
  }
  function loreCount(m) {
    const L = m && loreObj(m.lore), g = L && loreObj(L.got), B = loreBook();
    if (!g) return 0;
    let n = 0;
    for (const id in g) if (g[id] && B.byId[id]) n++;
    return n;
  }
  // {n, total, pct, per: {chapter: {n, total, fresh}}} from meta.lore.got / new.
  function loreProgress(m) {
    const B = loreBook(), L = (m && loreObj(m.lore)) || {}, got = loreObj(L.got) || {}, fresh = loreObj(L.new) || {};
    const per = {};
    let n = 0;
    for (const c of LORE_CH) {
      const ids = B.ch[c.id] || [];
      const k = ids.filter((id) => got[id]).length;
      per[c.id] = { n: k, total: ids.length, fresh: ids.filter((id) => got[id] && fresh[id]).length };
      n += k;
    }
    const total = B.entries.length;
    return { n, total, pct: total ? (n * 100) / total : 0, per };
  }
  function loreHash(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /* Map landmarks. The three decorative ones (MAP.LORE_KINDS) stand on empty
     land and speak when stepped on or tapped; towers, arcade cabinets and the
     pet shop speak when tapped. One line each, picked by the map's seed and
     the hex, so the same hex always says the same thing. */
  const LORE_MARKS = {
    jukebox: { name: 'Broken Jukebox', icon: '\u{1F3B5}', col: '#ff6bb0' },
    tickets: { name: 'Lost Tickets', icon: '\u{1F39F}', col: '#ffb347' },
    hiscore: { name: 'Old High Score Board', icon: '\u{1F3C6}', col: '#2ee6d6' },
    tower: { name: 'Lookout Tower', icon: '\u{1F5FC}', col: '#ffc94d' },
    plinko: { name: 'Plinko', icon: '\u{1F53B}', col: '#ff2e88' },
    wheel: { name: 'Prize Wheel', icon: '\u{1F3A1}', col: '#ffc94d' },
    slots: { name: 'Lucky Slots', icon: '\u{1F3B0}', col: '#a6ff5e' },
    moles: { name: 'Whack-a-Mole', icon: '\u{1F528}', col: '#ff8a2e' },
    skee: { name: 'Skee-Ball', icon: '\u{1F3B3}', col: '#2ee6d6' },
    petshop: { name: 'Pet Shop', icon: '\u{1F43E}', col: '#a6ff5e' },
  };
  const LORE_SNIPS = {
    tower: ['A lookout tower. The coin-op telescope on top only shows yesterday.', 'Someone carved I WAS HERE, 1994 into the rail. And STILL HERE under it.',
      'The tower keeper sleeps with one eye on the stairs and one on the view.', 'From up there you can count every lit bulb on the floor. It is not many.',
      'The lift is out. The lift has been out since before there were lifts.', 'Towers were built to watch for Crawlers. Now they just watch.'],
    plinko: ['A Plinko board. Every peg has been hit a million times and still says ding.', 'The pegs remember every token. They are rooting for the middle.',
      'A sticker on the glass: NO SHAKING. Someone has drawn a sad face on it.'],
    wheel: ['The prize wheel creaks. JACKPOT is painted on the smallest wedge, on purpose.', 'A wheel of fortune. Fortune has not been seen since the last power cut.',
      'The flapper is worn thin. It has said no to a lot of people.'],
    slots: ['A slot machine with one arm. It waves at you anyway.', 'Three cherries, a bell and a bulb, spinning in the dark for nobody.',
      'The payout tray is polished smooth by fingers checking it, just in case.'],
    moles: ['Whack-a-mole. The moles unionised years ago and ask to be whacked gently.', 'You can hear them in there, practising their pop-ups.',
      'A laminated card: THE MOLES ARE FINE. THE MOLES ARE ACTORS.'],
    skee: ['A skee-ball lane. The 100 cups are hit so rarely they have cobwebs.', 'The balls roll back on their own. The lane gets lonely.',
      'Somebody scratched a tally of perfect games into the rail. It says one.'],
    petshop: ['A pet shop. Every animal in here was a prize once. Now they want a Crawler of their own.', 'Every pen has a name tag. Some names are crossed out and written again, bigger.',
      'A sign: PETS ARE FOR LIFE, NOT JUST FOR ONE CLIMB.'],
    jukebox: ['A broken jukebox. It only plays B-sides now, and only to itself.', 'Press any button: same song. Everyone in the tower knows the words.',
      'The jukebox hums the attract mode tune, off key, like a lullaby.', 'Somebody left a quarter on top of the jukebox in case it ever gets better.'],
    tickets: ['A pile of lost tickets, thousands deep. Nobody ever came back for them.', 'Somebody saved these tickets for a whole summer. The bear they wanted is still upstairs.',
      'Lost tickets drift down here from every floor, like leaves.', 'The top ticket has FOR MOM written on it in crayon. Then nothing.'],
    hiscore: ['An old high score board, still lit. Somebody keeps it plugged in.', 'The high score board. The top name has not changed in years.',
      'A high score board with a cracked screen. The scores glow through the cracks.'],
  };
  function loreSnippet(kind, seed, q, r) {
    const L = LORE_SNIPS[kind];
    if (!L || !L.length) return '';
    return L[loreHash(kind + ':' + ((seed >>> 0) || 0) + ':' + (q | 0) + ',' + (r | 0)) % L.length];
  }
  /* The old high score board: the Prize Master holds the top slot for good,
     then your best climbs from the Hall of Fame (their own fake arcade
     initials) and a few old regulars, highest first. hof: DATA.hisFix(...).hof. */
  const LORE_INI = {
    knight: ['SIR', 'GRB', 'KNT'], alchemist: ['MRA', 'FZZ', 'POP'], rogue: ['PIP', 'QIK', 'YNK'], gambler: ['LOU', 'DBL', 'ACE'], engineer: ['MCH', 'BLT', 'WRN'], bubbler: ['BUB', 'SUD', 'FOM'], techie: ['JOY', 'TEK', 'LMP'],
    _: ['YOU', 'CRW', 'ME!'],
  };
  const LORE_HOUSE = [['P.M', 999990, 'prizemaster'], ['GRY', 42000, 'gary'], ['AAA', 25000, ''], ['JAZ', 15000, ''], ['RXR', 9000, ''], ['DAD', 4000, ''], ['ZZZ', 1000, ''], ['CPU', 500, '']];
  function loreInitials(rec) {
    const L = LORE_INI[rec && rec.c] || LORE_INI._;
    return L[loreHash('ini:' + ((rec && rec.id) || '') + ':' + ((rec && rec.c) || '')) % L.length];
  }
  function loreBoard(hof, n) {
    n = Math.max(1, (n | 0) || 8);
    const mine = (Array.isArray(hof) ? hof : []).filter((x) => loreObj(x) && Number.isFinite(+x.s))
      .map((x, i) => ({ ini: loreInitials(x), s: Math.max(0, Math.floor(+x.s)), c: typeof x.c === 'string' ? x.c : '', r: x.r || '', you: true, id: String(x.id || ''), d: +x.d || 0, i }));
    mine.sort((a, b) => b.s - a.s || a.d - b.d || a.i - b.i);
    const house = LORE_HOUSE.map(([ini, s, who], i) => ({ ini, s, who, house: true, you: false, i: 100 + i }));
    const all = mine.slice(0, n).concat(house);
    // a tie goes to the house: the regulars were here first
    all.sort((a, b) => b.s - a.s || (a.house === b.house ? a.i - b.i : a.house ? -1 : 1));
    return all.slice(0, n).map((x, i) => ({ rank: i + 1, ini: x.ini, s: x.s, you: !!x.you, house: !!x.house, who: x.who || '', c: x.c || '', r: x.r || '', id: x.id || '' }));
  }
  /* Act intros: the title card when a floor is entered. a1..a3 the acts,
     room the Back Room, L<n> an Endless loop (in the biome of act, the run's
     act). Two lines each, typed out under the name. */
  const LORE_ACTS = {
    a1: { title: 'ACT 1', name: 'The Damp Arcade', biome: 'cellar', act: 1, lines: ['Basement level. The carpet squelches.', 'Somewhere in the dark, a coin return is chewing.'] },
    a2: { title: 'ACT 2', name: 'The Clockwork Foundry', biome: 'foundry', act: 2, lines: ['Mezzanine. The air tastes of pennies.', 'Every machine up here was built to win.'] },
    a3: { title: 'ACT 3', name: 'The Frozen Penthouse', biome: 'vault', act: 3, lines: ['Top floor. Everything is kept forever.', 'Mind the ice. Mind the view.'] },
    room: { title: 'ACT 4', name: 'The Back Room', biome: 'machine', act: 3, lines: ['STAFF ONLY. It hums like breathing.', 'Every lost quarter rolled down here.'] },
  };
  const LORE_LOOPS = [
    ['The tower reboots. The monsters remember nothing.', 'The bulbs remember everything.'],
    ['BIOS OK. MONSTERS OK. MERCY NOT FOUND.', 'Same floor. Meaner carpet.'],
    ['Somebody fed the Clawspire another coin.', 'It was you. It is always you.'],
    ['The high score table has room for one more digit.', 'Just one.'],
    ['The prizes on the wall are watching now.', 'Some of them are cheering.'],
  ];
  function loreIntro(key, act) {
    key = String(key || '');
    const A = LORE_ACTS[key];
    if (A) return { key, title: A.title, name: A.name, biome: A.biome, act: A.act, lines: A.lines.slice(), loop: 0 };
    const m = /^L(\d{1,4})$/.exec(key);
    if (!m) return null;
    const n = Math.max(1, +m[1]), a = Math.max(1, Math.min(3, (act | 0) || (((n - 1) % 3) + 1))), base = LORE_ACTS['a' + a];
    return { key, title: 'LOOP ' + n, name: base.name + ', again', biome: base.biome, act: a, lines: LORE_LOOPS[(n - 1) % LORE_LOOPS.length].slice(), loop: n };
  }

  /* The weekly challenge. One seed per ISO week (Monday to Sunday, local
     dates), the same for everyone: a theme with its headline mutator plus 1
     or 2 more, a crawler and a claw, and four medal targets for the run score
     (DATA.runScore), scaled by the mutators' multiplier. Themes never repeat
     two weeks running. meta.wk keeps the best score and medal per week. */
  const WK = {
    MEDALS: ['bronze', 'silver', 'gold', 'platinum'],
    BASE: { bronze: 1200, silver: 2600, gold: 5500, platinum: 8000 },
    MEDAL: {
      bronze: { name: 'Bronze', col: '#d08a4a', icon: '\u{1F949}' }, silver: { name: 'Silver', col: '#cfd8e6', icon: '\u{1F948}' },
      gold: { name: 'Gold', col: '#ffc94d', icon: '\u{1F947}' }, platinum: { name: 'Platinum', col: '#8dfff5', icon: '\u{1F48E}' },
    },
    KEEP: 156, DAY: 86400000, EPOCH: Date.UTC(1970, 0, 5),
    THEMES: [
      { id: 'zerog', name: 'Zero-G Week', icon: '\u{1F388}', col: '#8dfff5', lead: 'lowgrav', blurb: 'Everything floats. Aim low, grab gently.' },
      { id: 'fragile', name: 'Handle With Care', icon: '\u{1F48E}', col: '#bff4ff', lead: 'glass', blurb: 'Every prize cracks. Some of them shatter.' },
      { id: 'boom', name: 'Boom Town', icon: '\u{1F4A3}', col: '#ff5a4a', lead: 'bombs', blurb: 'Firecrackers in every bin. Mind the fuses.' },
      { id: 'storm', name: 'Magnet Storm', icon: '\u{1F9F2}', col: '#ff6bb0', lead: 'magnet', blurb: 'The pile creeps toward the claw.', claws: ['magnet', 'classic'] },
      { id: 'giants', name: 'Land of Giants', icon: '\u{1F418}', col: '#ffc94d', lead: 'giant', blurb: 'One prize at a time, pal.', claws: ['hand', 'hook'] },
      { id: 'tiny', name: 'Tiny Town', icon: '\u{1F52C}', col: '#a6ff5e', lead: 'tiny', blurb: 'Handfuls, if you can hold them.', claws: ['scoop', 'vacuum'] },
      { id: 'rink', name: 'Ice Rink', icon: '⛸️', col: '#8dfff5', lead: 'slippery', blurb: 'Somebody waxed every bin in the tower.' },
      { id: 'lights', name: 'Lights Out', icon: '\u{1F526}', col: '#b3a4d6', lead: 'blackout', blurb: 'A flashlight on the claw is all you get.' },
      { id: 'feeding', name: 'Feeding Time', icon: '\u{1F37D}', col: '#a6ff5e', lead: 'hungry', blurb: 'Every monster is hungry. Guard your best prizes.' },
      { id: 'fever', name: 'Jackpot Fever', icon: '\u{1F3B0}', col: '#ffc94d', lead: 'fever', blurb: 'Combos fire twice. So do the monsters.' },
      { id: 'line', name: 'Assembly Line', icon: '⏩', col: '#ffb347', lead: 'conveyor', blurb: 'The bin floor rolls. Ride it to the chute.' },
      { id: 'quake', name: 'Shake Week', icon: '\u{1F4F3}', col: '#ff9ad0', lead: 'quake', blurb: 'The cabinet lurches every turn.' },
      { id: 'rush', name: 'Rush Hour', icon: '\u{1F46F}', col: '#ff2e88', lead: 'crowd', blurb: 'Every fight brings a friend.' },
      { id: 'twofer', name: 'Two for One', icon: '✌️', col: '#2ee6d6', lead: 'double', blurb: 'Twice the grabs. Half the punch.', claws: ['twin', 'tri'] },
    ],
  };
  // A date as local {y, m (0..11), d}: a Date, a timestamp or 'YYYY-MM-DD'; null for junk.
  function wkDate(x) {
    if (typeof x === 'string') {
      const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
      if (!s) return null;
      return { y: +s[1], m: +s[2] - 1, d: +s[3] };
    }
    const dt = x instanceof Date ? x : typeof x === 'number' ? new Date(x) : null;
    if (!dt || !Number.isFinite(dt.getTime())) return null;
    return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
  }
  // The ISO week of a date: {y (the week's year), w (1..53), dow (0 Monday..6 Sunday), mon (UTC ms of that Monday)}.
  function wkIso(x) {
    const p = wkDate(x);
    if (!p) return null;
    const t = Date.UTC(p.y, p.m, p.d), dow = (new Date(t).getUTCDay() + 6) % 7;
    const thu = t + (3 - dow) * WK.DAY, y = new Date(thu).getUTCFullYear();
    const w = 1 + Math.floor((thu - Date.UTC(y, 0, 1)) / (7 * WK.DAY));
    return { y, w, dow, mon: t - dow * WK.DAY };
  }
  const wkPad = (n) => (n < 10 ? '0' : '') + n;
  function wkKey(x) { const i = wkIso(x); return i ? i.y + '-W' + wkPad(i.w) : ''; }
  // 'YYYY-Www' -> {y, w, mon (UTC ms of its Monday), idx (weeks since 1970-01-05)} or null.
  function wkParse(key) {
    const s = /^(\d{4})-W(\d{2})$/.exec(String(key || ''));
    if (!s) return null;
    const y = +s[1], w = +s[2];
    const jan4 = Date.UTC(y, 0, 4), dow = (new Date(jan4).getUTCDay() + 6) % 7, mon = jan4 - dow * WK.DAY + (w - 1) * 7 * WK.DAY;
    if (w < 1 || w > 53 || wkKey(new Date(mon + 3 * WK.DAY).toISOString().slice(0, 10)) !== key) return null;
    return { y, w, mon, idx: Math.round((mon - WK.EPOCH) / (7 * WK.DAY)) };
  }
  function wkSeed(key) { return loreHash('clawspire-weekly:' + key) || 1; }
  // Milliseconds from x until the week ends (the next Monday, local midnight). A plain date counts from its midnight.
  function wkLeft(x) {
    const p = wkDate(x), i = wkIso(x);
    if (!p || !i) return 0;
    const now = typeof x === 'string' ? new Date(p.y, p.m, p.d).getTime() : (x instanceof Date ? x.getTime() : +x);
    return Math.max(0, new Date(p.y, p.m, p.d + 7 - i.dow).getTime() - now);
  }
  // The theme of week idx: a seeded shuffle of every theme per cycle, so no theme comes twice in a row.
  function wkCycle(c) {
    const n = WK.THEMES.length, perm = [];
    for (let i = 0; i < n; i++) perm.push(i);
    let x = loreHash('clawspire-weekly:cycle:' + c) || 1;
    for (let i = n - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const j = x % (i + 1); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    return perm;
  }
  function wkThemeAt(idx) {
    const n = WK.THEMES.length, c = Math.floor(idx / n), k = ((idx % n) + n) % n;
    let perm = wkCycle(c);
    if (k <= 1) {
      // across a cycle's seam the first theme must differ from the last one of the cycle before
      const prevLast = wkCycle(c - 1)[n - 1];
      if (perm[0] === prevLast) perm = [perm[1], perm[0]].concat(perm.slice(2));
    }
    return WK.THEMES[perm[k]];
  }
  // The week's challenge: {key, seed, y, w, theme, name, icon, col, blurb, muts, char, claw, mult, targets}.
  function wkDef(key) {
    const P = wkParse(key);
    if (!P) return null;
    const seed = wkSeed(key), T = wkThemeAt(P.idx);
    let x = wkSeed(key + ':mut');
    const r = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    const muts = MUTATORS[T.lead] ? [T.lead] : [];
    const want = seed % 3 === 0 ? 3 : 2;
    while (muts.length < want) { const id = mutPick(r, muts); if (!id) break; muts.push(id); }
    const chars = Object.keys(CHARACTERS), cl = (T.claws || Object.keys(CLAWS)).filter((id) => CLAWS[id]);
    const mult = mutMult(muts), targets = {};
    for (const m of WK.MEDALS) targets[m] = Math.max(50, Math.round((WK.BASE[m] * mult) / 50) * 50);
    return {
      key, seed, y: P.y, w: P.w, theme: T.id, name: T.name, icon: T.icon, col: T.col, blurb: T.blurb, muts,
      char: chars.length ? chars[wkSeed(key + ':char') % chars.length] : 'knight', claw: cl.length ? cl[wkSeed(key + ':claw') % cl.length] : 'classic', mult, targets,
    };
  }
  // The best medal a score earns against the targets ('' for none).
  function wkMedal(score, targets) {
    let out = '';
    for (const m of WK.MEDALS) if (targets && +score >= +targets[m]) out = m;
    return out;
  }
  const wkRank = (m) => WK.MEDALS.indexOf(m);
  // meta.wk repaired: {best: {key: score}, medal: {key: medal}, runs}; the newest WK.KEEP weeks.
  function wkFix(o) {
    const src = loreObj(o) || {}, bs = loreObj(src.best) || {}, ms = loreObj(src.medal) || {};
    const okKey = (k) => /^\d{4}-W\d{2}$/.test(k);
    const keys = new Set();
    for (const k in bs) if (okKey(k) && Number.isFinite(+bs[k]) && +bs[k] >= 0) keys.add(k);
    for (const k in ms) if (okKey(k) && wkRank(ms[k]) >= 0) keys.add(k);
    const keep = [...keys].sort().reverse().slice(0, WK.KEEP);
    const best = {}, medal = {};
    for (const k of keep) { if (k in bs && Number.isFinite(+bs[k]) && +bs[k] >= 0) best[k] = Math.floor(+bs[k]); if (wkRank(ms[k]) >= 0) medal[k] = ms[k]; }
    return { best, medal, runs: loreN(src.runs) };
  }
  // The medal cabinet: every week on record, newest first, and how many of each medal.
  function wkCabinet(wk) {
    const W = wkFix(wk), keys = new Set(Object.keys(W.best).concat(Object.keys(W.medal)));
    const list = [...keys].sort().reverse().map((key) => ({ key, best: W.best[key] | 0, medal: W.medal[key] || '' }));
    const counts = {};
    for (const m of WK.MEDALS) counts[m] = list.filter((x) => x.medal === m).length;
    return { list, counts, weeks: list.length };
  }
  // Weeks with at least medal `min` (a platinum week counts as gold too).
  function wkMedalCount(m, min) {
    const W = m && loreObj(m.wk), md = (W && loreObj(W.medal)) || {}, r0 = Math.max(0, wkRank(min));
    let n = 0;
    for (const k in md) if (wkRank(md[k]) >= r0) n++;
    return n;
  }
  for (const a of [
    A_('podium', 'Podium Finish', '\u{1F3C5}', '#ffc94d', 'Earn a gold medal in a weekly challenge.', (c) => wkMedalCount(c.meta, 'gold') >= 1),
    A_('lorekeeper', 'Lorekeeper', '\u{1F4DC}', '#e9dcc4', 'Unlock 25 pages of the Codex.', (c) => loreCount(c.meta) >= 25, { goal: 25, val: (c) => loreCount(c.meta) }),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // ================================================================ /LORE

  // ================================================================ RUSH (round 10): the Boss Rush and the ghost race
  /* DESIGN.md "Boss Rush and the ghost race (round 10)". Pure data and pure
     helpers; the flow is game.js's RUSH and GHOST blocks, the art
     RENDER.rush and RENDER.gho.
     - The Boss Rush: every act boss and its understudy in a seeded order,
       then the Prize Master, then The Machine once it has been met; a
       starting kit per crawler; a draft of 1 of 3 between fights (an item,
       a relic, a heal, a claw part); a clock that runs while you fight; a
       score; the best times per crawler in meta.rush.
     - The ghost race: a daily (or weekly) climb keeps a compact checkpoint
       per fight won; the best attempt of the day (the week) is kept in
       meta.gho and the next attempt races it. */
  const RUSH = {
    ACTS: { 1: ['hoard', 'plushqueen'], 2: ['smelter', 'conveyorking'], 3: ['glacius', 'arcticarcade'] },
    FINAL: 'prizemaster', SECRET: 'machine',
    // a boss's hit points and hits in a rush, by act: a starter kit and a few picks, not a whole run's bin
    // (the balance model through whole rushes, scratchpad r10/rushsim.mjs: 18-98% clears by crawler, 4.5-6 turns a boss)
    HPK: { 1: 0.65, 2: 0.5, 3: 0.55, final: 0.55, secret: 0.5 },
    DMGK: { 1: 0.8, 2: 0.7, 3: 0.75, final: 0.75, secret: 0.7 },
    // ROUND 13: DIFFICULTY.tierDmg (round 12: bosses x1.5) came after this tuning. A rush boss's hits are multiplied
    // by TIERK on top of DMGK (rushTierK): 1 / tierDmg.boss takes the lift back out, so the round 10 numbers hold; 1 keeps it
    TIERK: 1 / ((DIFFICULTY.tierDmg && DIFFICULTY.tierDmg.boss) || 1),
    RAMP: 1,   // run.fights per boss beaten (DIFFICULTY's hidden escalation)
    BREATHER: 0.1,   // a breath between bosses: this share of max hp comes back on every win
    HEAL: 0.35, CUT: 0.5,   // a heal card mends 35% of max hp; under half hp one is always on the table
    KINDS: ['item', 'relic', 'heal', 'claw'],
    PLUS: 0.35,   // an item card comes upgraded this often
    PAR: 100,   // seconds a boss: a clear scores the seconds it saved under par
    SCORE: { boss: 1000, clear: 5000, hp: 25, sec: 20 },
    // one boss at a time: relics that pay per fight or per hit, never per kill
    KIT: {
      knight: { items: ['longsword', 'battle_axe', 'war_hammer', 'tower_shield'], relics: ['protein_bar', 'big_knuckles'], claw: ['grip'], hp: 15 },
      alchemist: { items: ['liquid_fire', 'frost_phial', 'acid_bottle', 'volatile_egg'], relics: ['kettle_helm', 'venom_gland'], claw: ['width'], hp: 15 },
      rogue: { items: ['stolen_gem', 'loaded_dice', 'venom_dart', 'harlequin_mask'], relics: ['protein_bar', 'four_leaf_clover'], claw: ['grip'], hp: 15 },
      gambler: { items: ['double_or_nothing', 'one_armed_bandit', 'roulette_wheel', 'lucky_horseshoe'], relics: ['dealers_visor', 'high_roller'], claw: ['grip'], hp: 15 },
      engineer: { items: ['rivet_gun', 'toolbox', 'spring_coil', 'oil_can'], relics: ['kettle_helm', 'grease_gun'], claw: ['grip'], hp: 15 },
      // her starter bin is soft (ducks, soap, fillers): her kit brings the punch, the Golden Duck and a Strength relic
      bubbler: { items: ['golden_duck', 'foam_cannon', 'bath_bomb', 'loofah'], relics: ['protein_bar', 'squeaky_toy'], claw: ['grip'], hp: 15 },
      // (TECH, round 17) her arcade parts, and the lamp's payoff: every LAMP FEVER in a rush hits the boss
      techie: { items: ['crt_monitor', 'circuit_board', 'extension_cord', 'neon_tube'], relics: ['protein_bar', 'fever_dream'], claw: ['grip'], hp: 15 },
    },
    // a crawler with no kit of its own: its own uncommons and rares, else these
    KIT_ANY: { items: ['firebomb', 'frozen_heart', 'thorn_ring', 'rage_potion'], relics: ['kettle_helm', 'protein_bar'], claw: ['grip'], hp: 15, n: 4 },
  };
  function rushHash(s) {
    let x = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return (x >>> 0) || 1;
  }
  // A little seeded stream (an LCG), so the order is the same everywhere for a seed.
  function rushRng(seed) {
    let x = rushHash('clawspire-rush:' + seed);
    return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  }
  // The lineup: the six act bosses shuffled, then the Prize Master, then The Machine (o.machine: met it).
  function rushOrder(seed, o) {
    o = o || {};
    const r = rushRng(seed), all = [];
    for (const a of [1, 2, 3]) for (const id of RUSH.ACTS[a]) if (ENEMIES[id]) all.push(id);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = all[i]; all[i] = all[j]; all[j] = t; }
    if (ENEMIES[RUSH.FINAL]) all.push(RUSH.FINAL);
    if (o.machine && ENEMIES[RUSH.SECRET]) all.push(RUSH.SECRET);
    return all;
  }
  // The act a boss belongs to (its arena, its music, its escalation).
  const rushActOf = (id) => Math.max(1, Math.min(3, ((ENEMIES[id] && ENEMIES[id].act) | 0) || 3));
  // Its hit points in a rush (tab: RUSH.HPK), or its hits (RUSH.DMGK).
  function rushHpK(id, tab) {
    const T = tab || RUSH.HPK;
    if (id === RUSH.SECRET) return T.secret;
    if (id === RUSH.FINAL) return T.final;
    return T[rushActOf(id)] || 1;
  }
  const rushDmgK = (id) => rushHpK(id, RUSH.DMGK);
  // ROUND 13: the factor on a rush (or co-op, k = DUO.COOP.tierK) boss's hits that undoes DIFFICULTY.tierDmg; 1 for a tier it leaves alone.
  function rushTierK(id, k) {
    const e = ENEMIES[id], td = e && DIFFICULTY.tierDmg ? +DIFFICULTY.tierDmg[e.tier || 'normal'] : NaN, v = +(k == null ? RUSH.TIERK : k);
    return td > 0 && td !== 1 && v > 0 ? v : 1;
  }
  // A crawler's starting kit {items, relics, claw, hp}: its own, else its best cards and the spare relics. Only real ids.
  function rushKit(charId) {
    const k = RUSH.KIT[charId], A = RUSH.KIT_ANY;
    let items = k ? k.items.slice() : [];
    if (!k) {
      const RK = { l: 0, r: 1, u: 2 };
      const own = Object.keys(ITEMS).filter((id) => ITEMS[id].char === charId && RK[ITEMS[id].rarity] != null)
        .sort((a, b) => (RK[ITEMS[b].rarity] - RK[ITEMS[a].rarity]) || (a < b ? -1 : 1));
      items = own.slice(0, A.n);
      for (const id of A.items) if (items.length < A.n && items.indexOf(id) < 0) items.push(id);
    }
    const src = k || A;
    return {
      items: items.filter((id) => !!ITEMS[id]), relics: src.relics.filter((id) => !!RELICS[id]),
      claw: src.claw.filter((id) => !!CLAW_UPGRADES[id]), hp: Math.max(0, src.hp | 0), own: !!k,
    };
  }
  // The three kinds of card after boss i: a heal for sure when hurt (under CUT), no claw part when the claw is maxed.
  function rushDraftKinds(seed, i, o) {
    o = o || {};
    const r = rushRng(seed + ':draft:' + i);
    let kinds = RUSH.KINDS.filter((k) => k !== 'claw' || o.claw !== false);
    for (let n = kinds.length - 1; n > 0; n--) { const j = Math.floor(r() * (n + 1)); const t = kinds[n]; kinds[n] = kinds[j]; kinds[j] = t; }
    if ((o.hp != null ? +o.hp : 1) < RUSH.CUT && kinds.indexOf('heal') > 2) kinds = ['heal'].concat(kinds.filter((k) => k !== 'heal'));
    return kinds.slice(0, 3);
  }
  // The rush's score: {total, lines}. o {n bosses beaten, total in the lineup, won, t seconds, hp left}.
  function rushScore(o) {
    o = o || {};
    const n = Math.max(0, o.n | 0), tot = Math.max(n, o.total | 0), won = !!o.won, K = RUSH.SCORE, lines = [];
    lines.push({ k: 'boss', label: `Bosses beaten x${n}`, v: n * K.boss });
    if (won) {
      lines.push({ k: 'clear', label: 'Rush cleared', v: K.clear });
      const hp = Math.max(0, Math.round(+o.hp || 0));
      if (hp) lines.push({ k: 'hp', label: `HP left x${hp}`, v: hp * K.hp });
      const save = Math.max(0, Math.floor(RUSH.PAR * tot - Math.max(0, +o.t || 0)));
      if (save) lines.push({ k: 'time', label: `${save}s under par`, v: save * K.sec });
    }
    let total = 0;
    for (const l of lines) total += l.v;
    return { total, lines };
  }
  // 83.46 -> '1:23.4'; an hour or more -> '1:02:03'.
  function rushFmt(t) {
    t = Math.max(0, +t || 0);
    const p = (n) => (n < 10 ? '0' : '') + n;
    if (t >= 3600) { const s = Math.floor(t); return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`; }
    const d = Math.floor(t * 10), m = Math.floor(d / 600), s = Math.floor((d % 600) / 10);
    return `${m}:${p(s)}.${d % 10}`;
  }
  const rushObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const rushN = (x) => (Number.isFinite(+x) && +x > 0 ? Math.floor(+x) : 0);
  // meta.rush repaired: {runs, clears, score (best), best {crawler: {t, n, s, at}}, beat {boss: times}, pick}.
  function rushFix(o) {
    const src = rushObj(o) || {}, bs = rushObj(src.best) || {}, bt = rushObj(src.beat) || {};
    const best = {}, beat = {};
    for (const c in bs) {
      const b = rushObj(bs[c]);
      if (!b || !/^[a-z0-9_]{1,24}$/.test(c)) continue;
      const t = Number.isFinite(+b.t) && +b.t > 0 ? Math.round(+b.t * 1000) / 1000 : 0;
      best[c] = { t, n: rushN(b.n), s: rushN(b.s), at: rushN(b.at) };
    }
    for (const id in bt) if (ENEMIES[id] && rushN(bt[id])) beat[id] = rushN(bt[id]);
    return { runs: rushN(src.runs), clears: rushN(src.clears), score: rushN(src.score), best, beat, pick: typeof src.pick === 'string' ? src.pick.slice(0, 24) : '' };
  }
  // Books a finished rush on meta.rush (repaired in place). res {char, t, n, won, score, at} -> what it beat.
  function rushRecord(m, res) {
    res = res || {};
    const c = String(res.char || 'knight'), b = m.best[c] || (m.best[c] = { t: 0, n: 0, s: 0, at: 0 });
    const out = { prevT: b.t, prevN: b.n, prevS: b.s, prevScore: m.score, newTime: false, newN: false, newScore: false, newTop: false };
    m.runs = (m.runs | 0) + 1;
    const t = Math.max(0, Math.round((+res.t || 0) * 1000) / 1000), n = rushN(res.n), s = rushN(res.score);
    if (res.won) {
      m.clears = (m.clears | 0) + 1;
      if (t > 0 && (!b.t || t < b.t)) { b.t = t; out.newTime = true; }
    }
    if (n > b.n) { b.n = n; out.newN = true; }
    if (s > b.s) { b.s = s; out.newScore = true; b.at = rushN(res.at); }
    if (s > m.score) { m.score = s; out.newTop = true; }
    return out;
  }
  // The leaderboard: every crawler with a best, cleared times first (fastest), then the most bosses.
  function rushBoard(m) {
    const B = (rushObj(m) && rushObj(m.best)) || {};
    return Object.keys(B).map((c) => Object.assign({ c }, B[c])).filter((r) => r.t > 0 || r.n > 0)
      .sort((a, b) => ((a.t > 0 ? 0 : 1) - (b.t > 0 ? 0 : 1)) || (a.t > 0 && b.t > 0 ? a.t - b.t : b.n - a.n) || (b.s - a.s) || (a.c < b.c ? -1 : 1));
  }

  /* The ghost race. A checkpoint is [n (fights won), stage (act, 4 the Back
     Room, 4 + loop in Endless), q, r (the fight's hex), hp, gold, score,
     turns, seconds]: nine numbers, about 40 bytes. meta.gho = {d, w, passes}:
     the day's best attempt and the week's, each {key, cps, s (final score),
     won, c (crawler), n, tu, t, a, at}. */
  const GHO = { MAX: 90, KEYS: ['d', 'w'], F: ['n', 'a', 'q', 'r', 'hp', 'g', 's', 'tu', 't'] };
  const ghoNum = (x, lo) => (Number.isFinite(+x) ? Math.max(lo == null ? -1e6 : lo, Math.min(1e9, Math.round(+x))) : 0);
  // o {n, a, q, r, hp, g, s, tu, t} -> a compact checkpoint
  function ghoCp(o) {
    o = o || {};
    return [ghoNum(o.n, 0), ghoNum(o.a, 0), ghoNum(o.q), ghoNum(o.r), ghoNum(o.hp, 0), ghoNum(o.g, 0), ghoNum(o.s, 0), ghoNum(o.tu, 0), ghoNum(o.t, 0)];
  }
  // A checkpoint read back as {n, a, q, r, hp, g, s, tu, t} (junk: null).
  function ghoRead(cp) {
    if (!Array.isArray(cp) || cp.length < GHO.F.length) return null;
    const o = {};
    for (let i = 0; i < GHO.F.length; i++) { if (!Number.isFinite(+cp[i])) return null; o[GHO.F[i]] = +cp[i]; }
    return o;
  }
  function ghoRecFix(r) {
    const o = rushObj(r);
    if (!o || typeof o.key !== 'string' || !o.key || !Array.isArray(o.cps)) return null;
    const cps = o.cps.filter((c) => !!ghoRead(c)).slice(0, GHO.MAX).map((c) => ghoCp(ghoRead(c)));
    // e: where its climb ended [stage, q, r] (a fallen ghost stays there, grey)
    const e = Array.isArray(o.e) && o.e.length >= 3 && o.e.slice(0, 3).every((v) => Number.isFinite(+v)) ? o.e.slice(0, 3).map((v) => Math.round(+v)) : null;
    return { key: o.key.slice(0, 16), cps, s: rushN(o.s), won: !!o.won, c: typeof o.c === 'string' ? o.c.slice(0, 24) : '', n: rushN(o.n) || cps.length,
      tu: rushN(o.tu), t: rushN(o.t), a: rushN(o.a), at: rushN(o.at), e };
  }
  function ghoFix(o) {
    const src = rushObj(o) || {};
    return { d: ghoRecFix(src.d), w: ghoRecFix(src.w), passes: rushN(src.passes) };
  }
  // Where the ghost stood after n fights: its checkpoint, or null at the start (n 0) or once its climb had ended.
  function ghoAt(rec, n) {
    if (!rec || !rec.cps || n < 1 || n > rec.cps.length) return null;
    return ghoRead(rec.cps[n - 1]);
  }
  /* The race after my latest checkpoint: {n, d (my score minus the ghost's at
     the same step, or its final score once its climb had ended), have (the
     ghost reached this step), ahead, g (its checkpoint)}. No ghost: null. */
  function ghoDelta(cps, rec) {
    if (!rec) return null;
    const n = (cps || []).length, me = n ? ghoRead(cps[n - 1]) : null, g = ghoAt(rec, n);
    const mine = me ? me.s : 0, theirs = n === 0 ? 0 : g ? g.s : rec.s;
    const d = Math.round(mine - theirs);
    return { n, d, have: !!g || n === 0, ahead: d > 0, g };
  }
  // The moment you overtake it: behind or level before this checkpoint, ahead after it.
  const ghoPassed = (prev, d) => (+prev || 0) <= 0 && (+d || 0) > 0;
  // The chart's series: the score after every checkpoint (from 0), plus a final score when given.
  function ghoSeries(cps, fin) {
    const out = [0];
    for (const c of cps || []) { const o = ghoRead(c); if (o) out.push(o.s); }
    if (fin != null && Number.isFinite(+fin)) out.push(Math.max(0, Math.round(+fin)));
    return out;
  }
  for (const a of [
    A_('rush_clear', 'Rush Hour', '⏱', '#ff5a4a', 'Clear the Boss Rush: every boss, back to back.', (c) => c.kind === 'end' && !!(RUNS(c).rush && RUNS(c).rush.won)),
    A_('photo_finish', 'Photo Finish', '\u{1F47B}', '#bff4ff', 'Overtake your own ghost in a daily or weekly run.', (c) => !!(RUNS(c).gho && RUNS(c).gho.passed) || (((c.meta && c.meta.gho) || {}).passes | 0) >= 1),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  // ================================================================ /RUSH

  // ================================================================ DUO (round 11)
  /* Pass-and-play for two on one phone (DESIGN.md "Duo: pass and play
     (round 11)"): the tables and the pure rules of both modes. CO-OP BOSS:
     two crawlers share one boss fight, turn about. VERSUS CLAW-OFF: a
     shared bin of prizes, drops turn about, sabotage cards between them,
     best of three rounds. The game (GAME.duo) owns the flow; nothing here
     touches a run. */
  const DUO = {
    NAME_MAX: 10,
    // a player's colour: the HUD accent, the name, and the claw's team paint
    COLORS: [
      { id: 'pink', col: '#ff2e88', paint: 'paint_bubblegum', name: 'Hot Pink' },
      { id: 'cyan', col: '#2ee6d6', paint: 'paint_frost', name: 'Arcade Cyan' },
      { id: 'gold', col: '#ffc94d', paint: 'paint_gold', name: 'Prize Gold' },
      { id: 'lime', col: '#a6ff5e', paint: 'paint_glow', name: 'Slime Lime' },
      { id: 'orange', col: '#ff8a2b', paint: 'paint_copper', name: 'Hot Copper' },
      { id: 'red', col: '#ff5a4a', paint: 'paint_candy', name: 'Candy Red' },
    ],
    DEF: [{ name: 'P1', color: 'pink' }, { name: 'P2', color: 'cyan' }],
    // the claw-off: prize values on the glass, the pile per round, the bonuses
    VAL: { junk: 0, c: 1, u: 2, r: 4, l: 7 },
    PILE: { c: 5, u: 4, r: 2, l: 1, junk: 2 },
    PILE_MORE: { c: 1, u: 1 },   // per drop each above 3: a longer round gets a fuller bin
    BONUS: { double: 1, jackpot: 3, comboTier: 1, golden: 2 },
    DROPS: [3, 4, 5], DROPS_DEF: 3,
    WIN_ROUNDS: 2, MAX_ROUNDS: 5,
    HAND: { start: 2, max: 3 },
    // sabotage cards: played on the rival's next drop
    CARDS: {
      shake: { id: 'shake', name: 'Shake Up', icon: '\u{1F4A5}', col: '#ff8a2b', text: 'Their bin gets a big shake right before they drop.' },
      grease: { id: 'grease', name: 'Butter Fingers', icon: '\u{1F9C8}', col: '#ffe066', text: 'Their claw is greasy for the drop: prizes slip out.' },
      fog: { id: 'fog', name: 'Fog Machine', icon: '\u{1F32B}\u{FE0F}', col: '#bfe8ff', text: 'The glass fogs up and the prize tags vanish.' },
      tilt: { id: 'tilt', name: 'Tilt!', icon: '\u{1F4D0}', col: '#b98cff', text: 'The whole bin leans to one side while they drop.' },
      mirror: { id: 'mirror', name: 'Mirror Mirror', icon: '\u{1FA9E}', col: '#2ee6d6', text: 'Their steering runs backwards.' },
      tiny: { id: 'tiny', name: 'Tiny Claw', icon: '\u{1F90F}', col: '#a6ff5e', text: 'Their claw shrinks for the drop.' },
      turbo: { id: 'turbo', name: 'Too Much Coffee', icon: '\u{2615}', col: '#ff5a4a', text: 'Their claw zooms twice as fast. Good luck aiming.' },
    },
    CARD_IDS: ['shake', 'grease', 'fog', 'tilt', 'mirror', 'tiny', 'turbo'],
    COPIES: 2,
    // canned taunts (versus) and cheers (co-op), each with its own voice (AUDIO duoTaunt {v})
    TAUNTS: [
      { id: 'nyah', short: 'Nyah', text: 'Nyah nyah!', icon: '\u{1F61B}', v: 'kazoo' },
      { id: 'spoon', short: 'Spoon', text: 'Is that a claw or a spoon?', icon: '\u{1F944}', v: 'boing' },
      { id: 'trombone', short: 'Wah wah', text: 'Wah wah waaah.', icon: '\u{1F3BA}', v: 'trombone' },
      { id: 'horn', short: 'Air horn', text: 'AIR HORN!', icon: '\u{1F4E2}', v: 'horn' },
      { id: 'beatbox', short: 'Boots', text: 'Boots and cats and boots and cats.', icon: '\u{1F941}', v: 'beatbox' },
      { id: 'mic', short: 'Mic drop', text: 'Mic drop.', icon: '\u{1F3A4}', v: 'mic' },
    ],
    CHEERS: [
      { id: 'hype', short: 'Let\'s go', text: 'Let\'s gooo!', icon: '\u{1F525}', v: 'horn' },
      { id: 'sing', short: 'Sing', text: 'La la la, we got this!', icon: '\u{1F3B6}', v: 'sing' },
      { id: 'beatbox', short: 'Boots', text: 'Boots and cats, partner!', icon: '\u{1F941}', v: 'beatbox' },
      { id: 'hug', short: 'Hug', text: 'Team hug!', icon: '\u{1F917}', v: 'cheer' },
    ],
    // the hand-off: seconds on the countdown before READY lights up
    HANDOFF: 3,
    // co-op: the boss's hit points on top of the Boss Rush's share (two crawlers hit it); tierK (ROUND 13): its hits
    // times this on top of the rush's DMGK (rushTierK): 1 / tierDmg.boss keeps the round 11 tuning, 1 the round 12 lift
    COOP: { hpK: 1.8, tierK: 1 / ((DIFFICULTY.tierDmg && DIFFICULTY.tierDmg.boss) || 1) },
    VOICES: ['kazoo', 'boing', 'trombone', 'horn', 'beatbox', 'mic', 'sing', 'cheer'],
  };
  const duoInt = (v, lo, hi, d) => { const n = Math.floor(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  // A player's name: printable, trimmed, one space between words, at most NAME_MAX letters; empty is P1 / P2.
  function duoName(s, i) {
    // control characters and the long dash go (the dash is built from its code: this file never holds one)
    let t = String(s == null ? '' : s).split(String.fromCharCode(0x2014)).join(' ').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
    t = Array.from(t).slice(0, DUO.NAME_MAX).join('').trim();
    return t || ('P' + ((i | 0) === 1 ? 2 : 1));
  }
  // The record's key for a name (case and spaces do not make a new player).
  const duoKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const duoColor = (id) => DUO.COLORS.find((c) => c.id === id) || DUO.COLORS[0];
  const duoCard = (id) => DUO.CARDS[id] || null;
  const duoTaunt = (id, coop) => (coop ? DUO.CHEERS : DUO.TAUNTS).find((x) => x.id === id) || null;
  // Two players: a name, a colour (never both the same), a crawler, a claw and a paint ('' is the team colour).
  function duoPlayers(list, chars, claws) {
    const out = [];
    chars = chars && chars.length ? chars : ['knight'];
    for (let i = 0; i < 2; i++) {
      const p = (list && list[i] && typeof list[i] === 'object') ? list[i] : {};
      let color = duoColor(p.color).id;
      if (!DUO.COLORS.some((c) => c.id === p.color)) color = DUO.DEF[i].color;
      if (i === 1 && color === out[0].color) color = DUO.COLORS.find((c) => c.id !== out[0].color).id;
      out.push({ name: duoName(p.name, i), color, char: chars.indexOf(p.char) >= 0 ? p.char : chars[Math.min(i, chars.length - 1)],
        claw: claws && claws.indexOf(p.claw) >= 0 ? p.claw : 'classic', paint: typeof p.paint === 'string' ? p.paint : '' });
    }
    return out;
  }
  // The claw-off's bin for a round: the prizes (value on the glass), two rocks, and one golden prize (double value); more drops, a fuller bin.
  function duoPile(rng, round, drops) {
    const out = [], more = Math.max(0, Math.min(2, ((drops | 0) || 3) - 3));
    for (const r of ['l', 'r', 'u', 'c']) {
      let ids = pool(r).filter((id) => ITEMS[id] && !ITEMS[id].bag && !ITEMS[id].char);
      if (!ids.length) ids = pool(r);
      const n = (DUO.PILE[r] | 0) + more * ((DUO.PILE_MORE[r] | 0));
      for (let k = 0; k < n && ids.length; k++) {
        const id = ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
        out.push({ id, v: DUO.VAL[r] });
      }
    }
    for (let k = 0; k < DUO.PILE.junk; k++) out.push({ id: 'rock', v: 0 });
    // the golden prize: a common or uncommon one, so it is worth a look but never the whole round
    const cand = out.map((p, i) => (p.v > 0 && p.v <= 2 ? i : -1)).filter((i) => i >= 0);
    if (cand.length) out[cand[Math.floor(rng() * cand.length) % cand.length]].gold = 1;
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }
  /* One drop's score. got: [{id, v, gold}] in the order they fell. Returns
     {pts, lines: [{k, label, v}], combos: [ids], n}: each prize's value
     (golden x2), DOUBLE for two, JACKPOT for three or more, and every named
     grab combo the drop makes (the fight's own recipes) for 2 per tier. */
  function duoDropScore(got) {
    const list = (got || []).filter((g) => g && ITEMS[g.id]);
    const lines = [];
    let pts = 0;
    for (const g of list) {
      const base = Math.max(0, g.v == null ? (DUO.VAL[ITEMS[g.id].rarity] | 0) : (g.v | 0));
      const v = g.gold ? base * DUO.BONUS.golden : base;
      pts += v;
      lines.push({ k: g.gold ? 'golden' : 'prize', label: (g.gold ? 'GOLDEN ' : '') + ITEMS[g.id].name, v });
    }
    const n = list.length;
    if (n === 2) { pts += DUO.BONUS.double; lines.push({ k: 'double', label: 'DOUBLE', v: DUO.BONUS.double }); }
    if (n >= 3) { pts += DUO.BONUS.jackpot; lines.push({ k: 'jackpot', label: 'JACKPOT!', v: DUO.BONUS.jackpot }); }
    const combos = combosFor(list.map((g) => ITEMS[g.id]));
    for (const c of combos) { const v = DUO.BONUS.comboTier * (c.tier || 1); pts += v; lines.push({ k: 'combo', label: c.name, v, id: c.id, color: c.color }); }
    return { pts, lines, combos: combos.map((c) => c.id), n };
  }
  // The sabotage deck: COPIES of every card, shuffled by the round's seed.
  function duoDeck(rng) {
    const d = [];
    for (const id of DUO.CARD_IDS) for (let k = 0; k < DUO.COPIES; k++) d.push(id);
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  // Draw from the deck (the top is the end) into a hand, up to n cards and never past HAND.max. Mutates both; returns what was drawn.
  function duoDrawCards(deck, hand, n) {
    const got = [];
    for (let k = 0; k < (n | 0) && deck.length && hand.length < DUO.HAND.max; k++) { const c = deck.pop(); hand.push(c); got.push(c); }
    return got;
  }
  // Who takes a round: 0 or 1, -1 for a tie.
  const duoRoundWin = (s) => ((s[0] | 0) > (s[1] | 0) ? 0 : (s[1] | 0) > (s[0] | 0) ? 1 : -1);
  /* The match over the rounds so far: {wins: [a, b], pts: [a, b], w}: w is
     0 or 1 once someone has WIN_ROUNDS; after MAX_ROUNDS (ties do not count)
     the most rounds, then the most points, win, else -1 (a draw); null while
     it goes on. */
  function duoMatch(rounds) {
    const wins = [0, 0], pts = [0, 0];
    for (const r of rounds || []) {
      if (!r || !r.s) continue;
      pts[0] += r.s[0] | 0; pts[1] += r.s[1] | 0;
      const w = duoRoundWin(r.s);
      if (w >= 0) wins[w]++;
    }
    let w = null;
    if (wins[0] >= DUO.WIN_ROUNDS) w = 0;
    else if (wins[1] >= DUO.WIN_ROUNDS) w = 1;
    else if ((rounds || []).length >= DUO.MAX_ROUNDS) w = wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) : pts[0] !== pts[1] ? (pts[0] > pts[1] ? 0 : 1) : -1;
    return { wins, pts, w };
  }
  // Who starts a round: the coin toss for the first, then whoever lost the last one (a tie: the other one starts).
  function duoStarter(first, rounds) {
    const n = (rounds || []).length;
    if (!n) return first | 0;
    const last = rounds[n - 1], w = last && last.s ? duoRoundWin(last.s) : -1;
    return w >= 0 ? 1 - w : ((first | 0) + n) % 2;
  }
  // The coin toss: who starts (0 / 1) and how many half turns the coin makes, from the duel's seed.
  function duoToss(seed) {
    let x = 2166136261 >>> 0;
    for (const ch of 'duo-toss:' + seed) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
    const w = x & 1;
    return { w, flips: 8 + ((x >>> 3) % 4) * 2 + w };
  }
  // The co-op bosses: the six act bosses and the Prize Master; beaten ones come from the Codex's kills and the rush.
  function duoBosses(kills, beat) {
    const out = [];
    for (const a of [1, 2, 3]) for (const id of RUSH.ACTS[a]) if (ENEMIES[id]) out.push(id);
    if (ENEMIES[RUSH.FINAL]) out.push(RUSH.FINAL);
    return out.map((id) => ({ id, beaten: ((kills && kills[id]) | 0) > 0 || ((beat && beat[id]) | 0) > 0 }));
  }
  // The profile's duel record, repaired: wins per name for the claw-off, team wins for co-op.
  function duoFix(o) {
    const d = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const n = (v) => Math.max(0, Math.floor(+v) || 0);
    const names = {};
    const src = d.names && typeof d.names === 'object' && !Array.isArray(d.names) ? d.names : {};
    for (const k in src) {
      const r = src[k];
      if (!r || typeof r !== 'object') continue;
      const nm = duoName(r.n || k, 0), key = duoKey(nm);
      if (!key) continue;
      names[key] = { n: nm, w: n(r.w), l: n(r.l), t: n(r.t), cg: n(r.cg), cw: n(r.cw) };
    }
    const last = d.last && typeof d.last === 'object' && !Array.isArray(d.last) ? d.last : {};
    return {
      games: n(d.games), vs: n(d.vs), coop: n(d.coop), coopWins: n(d.coopWins), names,
      last: { p: Array.isArray(last.p) ? last.p.slice(0, 2).filter((p) => p && typeof p === 'object') : [], drops: duoInt(last.drops, 3, 5, DUO.DROPS_DEF), boss: typeof last.boss === 'string' ? last.boss : '', mode: last.mode === 'coop' ? 'coop' : 'vs' },
      online: duoNetOnline(d.online),   // DUO NET (round 15): online co-op games and wins, the last online look
    };
  }
  // ---- DUO NET (round 15): online co-op (DESIGN.md "Online co-op (round 15)"). The rules the
  // game's DUO NET block and js/net.js share: the room code, the timings, a partner's profile repaired.
  DUO.NET = {
    PROTO: 2,                                  // the message format; a partner on another one is told to reload (2: round 16's online versus)
    MODES: ['coop', 'vs'],                     // (round 16) what an online room plays: the host's pick, the guest follows it
    VS_BODIES: 40,                             // (round 16) at most this many bin bodies in one versus stream or end-of-drop snapshot
    ALPHA: 'ABCDEFGHJKLMNPQRSTUVWXYZ', CODE_LEN: 4,   // the relay's room codes: no I, no O, no digits
    STREAM: 0.1, BODIES: 0.25,                 // the claw to the spectator 10 times a second, the bin 4 times
    YOURS: 5,                                  // YOUR TURN starts on its own after this many seconds
    AWAY: 45,                                  // a partner stepped away this long: keep fighting alone is offered
    FX_MAX: 24, BODIES_MAX: 40, LOG_MAX: 12,   // what one message may carry
  };
  // A room code as typed or pasted ("ab-cd", " abcd "): the four letters, or null.
  function duoNetCode(raw) {
    const s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length !== DUO.NET.CODE_LEN) return null;
    for (const c of s) if (DUO.NET.ALPHA.indexOf(c) < 0) return null;
    return s;
  }
  // The code in a page address (?join=ABCD), or null.
  function duoNetJoinParam(search) {
    const m = /[?&]join=([^&#]*)/i.exec(String(search || ''));
    let v = m ? m[1] : '';
    try { v = decodeURIComponent(v); } catch (e) { /* a broken escape: the raw text */ }
    return m ? duoNetCode(v) : null;
  }
  /* A player's profile from the other phone, repaired against this game's
     tables: a name, a colour of the six, a crawler that exists, a claw type
     that exists, a claw paint that exists ('' the team colour). Nothing
     from the wire is trusted. */
  function duoNetPlayer(p, i) {
    p = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    const pick = (v, ok, d) => (typeof v === 'string' && v.length < 40 && ok(v) ? v : d);
    const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
    return {
      name: duoName(typeof p.name === 'string' ? p.name : '', i),
      color: pick(p.color, (v) => DUO.COLORS.some((c) => c.id === v), DUO.DEF[(i | 0) === 1 ? 1 : 0].color),
      char: pick(p.char, (v) => has(CHARACTERS, v), 'knight'),
      claw: pick(p.claw, (v) => has(CLAWS, v), 'classic'),
      paint: pick(p.paint, (v) => has(COSMETICS, v) && COSMETICS[v].cat === 'paint', ''),
    };
  }
  // meta.duo.online: games and wins played online, the look last used there; (round 16) vsGames /
  // vsWins: the online versus claw-offs and the ones won (a forfeit win counts), wins never above games.
  function duoNetOnline(o) {
    const d = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const n = (v) => Math.max(0, Math.floor(+v) || 0);
    return { games: n(d.games), wins: Math.min(n(d.wins), n(d.games)), me: d.me && typeof d.me === 'object' && !Array.isArray(d.me) ? duoNetPlayer(d.me, 0) : null,
      vsGames: n(d.vsGames), vsWins: Math.min(n(d.vsWins), n(d.vsGames)) };
  }
  /* A finished duel on the record. o {mode: 'vs' | 'coop', names: [a, b],
     w: 0 | 1 | -1 (versus), won (co-op)}. Returns the record (mutated). */
  function duoRecord(m, o) {
    m = m && m.names ? m : duoFix(m);
    o = o || {};
    const nm = (o.names || []).slice(0, 2).map((s, i) => duoName(s, i));
    const row = (s) => { const k = duoKey(s); return m.names[k] || (m.names[k] = { n: s, w: 0, l: 0, t: 0, cg: 0, cw: 0 }); };
    m.games++;
    if (o.mode === 'coop') {
      m.coop++;
      if (o.won) m.coopWins++;
      const seen = {};
      for (const s of nm) { const k = duoKey(s); if (seen[k]) continue; seen[k] = 1; const r = row(s); r.n = s; r.cg++; if (o.won) r.cw++; }
    } else {
      m.vs++;
      nm.forEach((s, i) => { const r = row(s); r.n = s; if (o.w === -1 || nm.length < 2) r.t++; else if (o.w === i) r.w++; else r.l++; });
    }
    return m;
  }
  // The board: every name, most claw-off wins first, then team wins, then fewest losses.
  function duoBoard(m) {
    const rows = [];
    const names = (m && m.names) || {};
    for (const k in names) rows.push(Object.assign({ key: k }, names[k]));
    rows.sort((a, b) => (b.w - a.w) || (b.cw - a.cw) || (a.l - b.l) || (a.key < b.key ? -1 : 1));
    return rows;
  }
  // ================================================================ /DUO

  // ================================================================ SCHOOL (round 11)
  /* Claw School and the Practice Cabinet (DESIGN.md "Claw School and the
     Practice Cabinet (round 11)"). Pure tables and rules: five lessons of
     bite-size challenges (a fixed scripted pile, a goal, a drop or time
     limit), the star rules, the one-time vault ticket pay per star, the
     lesson unlocks, the report card grades, the practice presets, and the
     Valedictorian marquee the diploma pays (a non-enumerable cosmetic, like
     the event ones, so the Vault's shelves, counts and capsules are as
     before). The game runs the cabinet and feeds schEval its state. */
  const SCH = {
    TIX: 6,                          // vault tickets for every star, paid the first time it is earned
    NEED: [0, 6, 14, 24, 34],        // stars to open each lesson
    FUSE: 8,                         // seconds a bomb lit in the practice cabinet burns
    DIPLOMA: 'mq_valedictorian',     // the cosmetic the diploma pays
    PILE_MAX: 30,                    // bodies the practice cabinet holds
    // the practice cabinet's pile presets (spawned at random across the bin)
    PILES: [
      { id: 'starter', name: 'Starter bin', icon: '\u{1F392}', ids: [] },   // (the ids come from a crawler's starting bin)
      { id: 'junk', name: 'Junk heap', icon: '\u{1FAA8}', ids: ['rock', 'rock', 'rock', 'slag', 'slag', 'iceblock', 'hoardcoin', 'hoardcoin', 'broodegg', 'crisp_apple', 'prize_marble', 'lucky_coin'] },
      { id: 'glass', name: 'All glass', icon: '\u{1F48E}', ids: ['crystal_ball', 'empty_bottle', 'glass_shield', 'crystal_dice', 'gumball_jar', 'bubble_flask', 'toxic_vial', 'alembic', 'crystal_dice', 'empty_bottle'] },
      { id: 'bombs', name: 'All bombs', icon: '\u{1F4A3}', ids: ['cherry_bomb', 'cherry_bomb', 'firecracker', 'firecracker', 'firebomb', 'smoke_bomb', 'rubble_bomb', 'firecracker'] },
      { id: 'balls', name: 'Balls only', icon: '\u{1F3B1}', ids: ['prize_marble', 'prize_marble', 'bouncy_ball', 'bouncy_ball', 'glass_bead', 'crisp_apple', 'blood_orange', 'pot_lid', 'rubber_duck', 'crystal_ball', 'lucky_penny', 'peppermint'] },
    ],
    // the mutators the practice cabinet can play with (the machine's physics; the fight-only ones stay off)
    MUTS: ['lowgrav', 'glass', 'bombs', 'magnet', 'tiny', 'giant', 'slippery', 'blackout', 'conveyor', 'quake', 'moon', 'tinyclaw', 'earthquake', 'mirror', 'flood'],
    GRADES: [[1, 'A+'], [0.85, 'A'], [0.7, 'B'], [0.5, 'C'], [0.0001, 'D']],
  };
  // A pile entry: an item id, x across the bin (0 left .. 1 the divider), y where it is dropped from (interior px), o: {t: 1 (a target), lit: seconds (a lit bomb)}.
  const sp = (id, x, y, o) => Object.assign({ id, x, y }, o || {});
  const spRow = (ids, x0, x1, y) => ids.map((id, i) => sp(id, x0 + (ids.length > 1 ? (x1 - x0) * i / (ids.length - 1) : 0), y));
  /* A challenge: {id, name, goal (the words on the board), tip, claw (a claw
     type, default classic), drops (0: no limit), time (seconds, 0: none),
     win {k: total|grab|target|free|all, n, of}, never (a match that fails
     it when delivered), noCrack (a crack fails it), stars {k: drops|time|items,
     s3, s2}, pile [sp], muts [mutator ids]}. of / never: {id} | {tag} |
     {trait: glass|circle} | {not: of}. */
  const SCH_LESSONS = [
    { id: 'basics', name: 'Basics', icon: '✏', color: '#2ee6d6', blurb: 'Steer, drop, deliver. Claw 101.', ch: [
      { id: 'b1', name: 'First Grab', goal: 'Deliver any prize to the chute.', tip: 'Drag on the glass to steer. Let go to drop.',
        drops: 5, win: { k: 'total', n: 1 }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('crisp_apple', 0.22, 320), sp('blood_orange', 0.42, 320), sp('bouncy_ball', 0.62, 320), sp('crisp_apple', 0.8, 320)] },
      { id: 'b2', name: 'That One', goal: 'Deliver the glowing apple.', tip: 'Line the claw up right over it before you let go.',
        drops: 5, win: { k: 'target' }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('rock', 0.18, 320), sp('rock', 0.34, 320), sp('crisp_apple', 0.5, 320, { t: 1 }), sp('rock', 0.66, 320), sp('rock', 0.82, 320)] },
      { id: 'b3', name: 'Double Up', goal: 'Deliver 2 prizes in one grab.', tip: 'Drop into the middle of a clump.',
        drops: 5, win: { k: 'grab', n: 2 }, stars: { k: 'drops', s3: 1, s2: 3 },
        pile: spRow(['prize_marble', 'glass_bead', 'prize_marble', 'peppermint'], 0.42, 0.6, 300).concat(spRow(['glass_bead', 'prize_marble', 'peppermint', 'prize_marble'], 0.44, 0.58, 240)) },
      { id: 'b4', name: 'Jackpot!', goal: 'Deliver 3 prizes in one grab: a JACKPOT.', tip: 'Small things in a heap. Aim for the middle of it.',
        drops: 6, win: { k: 'grab', n: 3 }, stars: { k: 'drops', s3: 2, s2: 4 },
        pile: spRow(['prize_marble', 'glass_bead', 'sour_drop', 'peppermint', 'prize_marble'], 0.4, 0.62, 320)
          .concat(spRow(['lucky_penny', 'prize_marble', 'glass_bead', 'sour_drop', 'peppermint'], 0.42, 0.6, 260))
          .concat(spRow(['prize_marble', 'glass_bead', 'peppermint', 'prize_marble'], 0.45, 0.58, 200)) },
      { id: 'b5', name: 'Beat the Clock', goal: 'Deliver 4 prizes in 30 seconds.', tip: 'No drop limit. Keep the claw busy!',
        drops: 0, time: 30, win: { k: 'total', n: 4 }, stars: { k: 'time', s3: 16, s2: 23 },
        pile: spRow(['crisp_apple', 'bouncy_ball', 'blood_orange', 'prize_marble', 'crisp_apple'], 0.15, 0.85, 320).concat(spRow(['prize_marble', 'bouncy_ball', 'crisp_apple', 'glass_bead', 'blood_orange'], 0.2, 0.8, 250)) },
    ] },
    { id: 'materials', name: 'Materials', icon: '\u{1F9EA}', color: '#a6ff5e', blurb: 'Glass cracks, soap slips, bombs go boom.', ch: [
      { id: 'm1', name: 'Handle With Care', goal: 'Deliver the crystal ball without cracking it.', tip: 'Glass cracks on a hard landing. Do not let it slip.',
        drops: 4, noCrack: true, win: { k: 'target' }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('sponge', 0.3, 330), sp('crystal_ball', 0.5, 320, { t: 1 }), sp('loofah', 0.68, 330), sp('sponge', 0.82, 330)] },
      { id: 'm2', name: 'Heavy Metal', goal: 'Deliver the tower shield.', tip: 'Heavy things need a clean, centred grab.',
        drops: 4, win: { k: 'target' }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('prize_marble', 0.25, 330), sp('tower_shield', 0.5, 300, { t: 1 }), sp('prize_marble', 0.72, 330)] },
      { id: 'm3', name: 'Soap Opera', goal: 'Deliver 2 soap bars.', tip: 'Soap squirts out of a lazy grip. Grab it in the middle.',
        drops: 6, win: { k: 'total', n: 2, of: { id: 'soap_bar' } }, stars: { k: 'drops', s3: 2, s2: 4 },
        pile: [sp('soap_bar', 0.25, 320), sp('sponge', 0.4, 330), sp('soap_bar', 0.52, 320), sp('sponge', 0.66, 330), sp('soap_bar', 0.8, 320)] },
      { id: 'm4', name: 'Bouncy Castle', goal: 'Deliver 3 bouncy balls.', tip: 'Rubber bounces. Wait for them to settle.',
        drops: 6, win: { k: 'total', n: 3, of: { id: 'bouncy_ball' } }, stars: { k: 'drops', s3: 2, s2: 4 },
        pile: spRow(['bouncy_ball', 'bouncy_ball', 'bouncy_ball', 'bouncy_ball', 'bouncy_ball'], 0.2, 0.8, 300) },
      { id: 'm5', name: 'Hot Potato', goal: 'The bomb is lit! Deliver it before it blows.', tip: 'A lit fuse counts down. Grab it out, fast.',
        drops: 0, win: { k: 'target' }, stars: { k: 'time', s3: 8, s2: 14 },
        pile: [sp('crisp_apple', 0.2, 320), sp('cherry_bomb', 0.4, 320, { t: 1, lit: 20 }), sp('crisp_apple', 0.6, 320), sp('blood_orange', 0.8, 320)] },
    ] },
    { id: 'claws', name: 'Claw Types', icon: '\u{1F9F2}', color: '#ff9ad0', blurb: 'Eight claws, eight ways to grab.', ch: [
      { id: 'c1', name: 'Magnet Class', goal: 'Magnet Crane: deliver 3 metal things, nothing else.', tip: 'The magnet only sticks to metal.', claw: 'magnet',
        drops: 5, win: { k: 'total', n: 3, of: { tag: 'metal' } }, never: { not: { tag: 'metal' } }, stars: { k: 'drops', s3: 2, s2: 3 },
        pile: [sp('iron_nut', 0.18, 320), sp('crisp_apple', 0.3, 320), sp('lucky_coin', 0.42, 320), sp('stale_bread', 0.52, 320), sp('pot_lid', 0.62, 320),
          sp('glass_bead', 0.72, 320), sp('skeleton_key', 0.82, 320), sp('iron_nut', 0.5, 260)] },
      { id: 'c2', name: 'Scoop Troop', goal: 'The Scoop: deliver 5 marbles.', tip: 'The scoop digs in and lifts a handful.', claw: 'scoop',
        drops: 4, win: { k: 'total', n: 5 }, stars: { k: 'drops', s3: 2, s2: 3 },
        pile: spRow(['prize_marble', 'prize_marble', 'prize_marble', 'prize_marble', 'prize_marble', 'prize_marble'], 0.35, 0.65, 320)
          .concat(spRow(['prize_marble', 'prize_marble', 'prize_marble', 'prize_marble', 'prize_marble', 'prize_marble'], 0.37, 0.63, 260)) },
      { id: 'c3', name: 'Harpoon Hero', goal: 'The Harpoon: spear the lit bomb out from under the rocks.', tip: 'The harpoon drops through the pile and spears the first thing it hits.', claw: 'hook',
        drops: 0, win: { k: 'target' }, stars: { k: 'time', s3: 7, s2: 12 },
        pile: [sp('cherry_bomb', 0.5, 360, { t: 1, lit: 18 }), sp('rock', 0.42, 280), sp('rock', 0.58, 280), sp('crisp_apple', 0.2, 320), sp('crisp_apple', 0.8, 320)] },
      { id: 'c4', name: 'Big Hand', goal: 'The Glove: deliver the anvil.', tip: 'The glove holds the heaviest thing it touches.', claw: 'hand',
        drops: 3, win: { k: 'target' }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('prize_marble', 0.25, 330), sp('family_anvil', 0.5, 300, { t: 1 }), sp('prize_marble', 0.75, 330)] },
      { id: 'c5', name: 'Suck It Up', goal: 'The Vacuum: 3 prizes in one grab.', tip: 'Hover over small light things and it sucks them up.', claw: 'vacuum',
        drops: 4, win: { k: 'grab', n: 3 }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: spRow(['prize_marble', 'peppermint', 'lucky_penny', 'sour_drop', 'prize_marble'], 0.36, 0.62, 330).concat(spRow(['peppermint', 'bouncy_ball', 'prize_marble', 'sour_drop'], 0.4, 0.6, 270)) },
      { id: 'c6', name: 'Tri Hard', goal: 'The Tri-Claw: 3 round things in one grab.', tip: 'Three curled prongs cup a ball.', claw: 'tri',
        drops: 4, win: { k: 'grab', n: 3, of: { trait: 'circle' } }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: spRow(['prize_marble', 'bouncy_ball', 'crisp_apple', 'prize_marble', 'blood_orange'], 0.36, 0.62, 320).concat(spRow(['bouncy_ball', 'prize_marble', 'glass_bead', 'prize_marble'], 0.4, 0.58, 260)) },
    ] },
    { id: 'tricks', name: 'Tricks', icon: '\u{1F3A9}', color: '#ffc94d', blurb: 'Buried prizes, free prizes, one shot.', ch: [
      { id: 't1', name: 'Buried Treasure', goal: 'Dig the golden duck out from under the pile.', tip: 'Drop right on top of it. The rocks will move.',
        drops: 5, win: { k: 'target' }, stars: { k: 'drops', s3: 2, s2: 3 },
        pile: [sp('golden_duck', 0.5, 370, { t: 1 }), sp('rock', 0.42, 300), sp('rock', 0.58, 300), sp('slag', 0.5, 240), sp('rock', 0.35, 200), sp('rock', 0.65, 200), sp('crisp_apple', 0.15, 330)] },
      { id: 't2', name: 'Free Prize', goal: 'Get a FREE PRIZE: one the claw never touched.', tip: 'Prizes riding on top of what you grab count. So does a blast.', claw: 'scoop',
        drops: 6, win: { k: 'free', n: 1 }, stars: { k: 'drops', s3: 1, s2: 3 },
        pile: spRow(['prize_marble', 'glass_bead', 'prize_marble', 'peppermint', 'prize_marble', 'glass_bead'], 0.36, 0.64, 330)
          .concat(spRow(['peppermint', 'prize_marble', 'sour_drop', 'glass_bead', 'prize_marble', 'peppermint'], 0.38, 0.62, 270))
          .concat(spRow(['prize_marble', 'glass_bead', 'prize_marble', 'sour_drop'], 0.42, 0.58, 210)) },
      { id: 't3', name: 'One Shot', goal: 'One drop only. Deliver 2 in it.', tip: 'Take your time lining it up.',
        drops: 1, win: { k: 'grab', n: 2 }, stars: { k: 'items', s3: 4, s2: 3 },
        pile: spRow(['prize_marble', 'glass_bead', 'peppermint', 'prize_marble', 'sour_drop'], 0.4, 0.62, 320).concat(spRow(['glass_bead', 'prize_marble', 'peppermint', 'prize_marble'], 0.42, 0.6, 260)) },
      { id: 't4', name: 'Picky Eater', goal: 'Deliver the gem. Deliver a rock and you fail.', tip: 'Grab the gem alone, from the side away from the rocks.',
        drops: 4, win: { k: 'target' }, never: { id: 'rock' }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: [sp('rock', 0.16, 320), sp('rock', 0.3, 320), sp('stolen_gem', 0.56, 320, { t: 1 }), sp('rock', 0.86, 320)] },
      { id: 't5', name: 'Twin Trouble', goal: 'The Twin Claws: 2 prizes in one grab.', tip: 'Each head grabs its own prize.', claw: 'twin',
        drops: 4, win: { k: 'grab', n: 2 }, stars: { k: 'drops', s3: 1, s2: 2 },
        pile: spRow(['prize_marble', 'crisp_apple', 'glass_bead', 'peppermint', 'lucky_coin', 'bouncy_ball'], 0.2, 0.8, 320) },
    ] },
    { id: 'mastery', name: 'Mastery', icon: '\u{1F393}', color: '#ff5a4a', blurb: 'Everything at once. Graduate!', ch: [
      { id: 'x1', name: 'Glass Jackpot', goal: '2 glass things in one grab. No cracks.', tip: 'A clean grab and a smooth carry.',
        drops: 5, noCrack: true, win: { k: 'grab', n: 2, of: { trait: 'glass' } }, stars: { k: 'drops', s3: 2, s2: 3 },
        pile: [sp('sponge', 0.2, 330), sp('crystal_ball', 0.4, 320), sp('crystal_dice', 0.5, 320), sp('empty_bottle', 0.6, 320), sp('crystal_dice', 0.47, 250), sp('loofah', 0.8, 330)] },
      { id: 'x2', name: 'Lights Out', goal: 'Blackout! Deliver the golden duck.', tip: 'The claw carries a flashlight.', muts: ['blackout'],
        drops: 5, win: { k: 'target' }, stars: { k: 'drops', s3: 1, s2: 3 },
        pile: [sp('rock', 0.15, 320), sp('crisp_apple', 0.3, 320), sp('golden_duck', 0.7, 320, { t: 1 }), sp('rock', 0.45, 320), sp('bouncy_ball', 0.58, 320), sp('rock', 0.85, 320)] },
      { id: 'x3', name: 'Moon Walk', goal: 'Low Gravity: deliver 4 prizes in 40 seconds.', tip: 'Everything floats down slowly. So does the claw\'s catch.', muts: ['lowgrav'],
        drops: 0, time: 40, win: { k: 'total', n: 4 }, stars: { k: 'time', s3: 22, s2: 31 },
        pile: spRow(['crisp_apple', 'bouncy_ball', 'blood_orange', 'prize_marble', 'crisp_apple'], 0.15, 0.85, 320).concat(spRow(['prize_marble', 'bouncy_ball', 'crisp_apple', 'glass_bead', 'blood_orange'], 0.2, 0.8, 250)) },
      { id: 'x4', name: 'Mirror Mirror', goal: 'Mirror Machine: deliver 3 prizes.', tip: 'Steering is backwards. Your finger goes left, the claw goes right.', muts: ['mirror'],
        drops: 5, win: { k: 'total', n: 3 }, stars: { k: 'drops', s3: 2, s2: 3 },
        pile: spRow(['crisp_apple', 'prize_marble', 'blood_orange', 'bouncy_ball', 'crisp_apple', 'glass_bead'], 0.2, 0.8, 320) },
      { id: 'x5', name: 'Clean Sweep', goal: 'Empty the bin: every prize down the chute.', tip: 'Six prizes, six drops. Doubles save drops.',
        drops: 6, win: { k: 'all' }, stars: { k: 'drops', s3: 4, s2: 5 },
        pile: spRow(['crisp_apple', 'prize_marble', 'blood_orange', 'bouncy_ball', 'crisp_apple', 'prize_marble'], 0.3, 0.72, 320) },
    ] },
  ];
  const SCH_CH = {};
  SCH_LESSONS.forEach((L, li) => L.ch.forEach((c, i) => { c.lesson = li; c.idx = i; c.claw = c.claw || 'classic'; c.time = c.time || 0; c.muts = c.muts || []; SCH_CH[c.id] = c; }));
  const SCH_IDS = Object.keys(SCH_CH);
  SCH.MAX_STARS = SCH_IDS.length * 3;
  // Does a delivered prize d ({id, tags, glass, circle}) match a filter?
  function schMatch(o, d) {
    if (!o) return true;
    if (!d) return false;
    if (o.not) return !schMatch(o.not, d);
    if (o.id) return d.id === o.id;
    if (o.tag) return (d.tags || []).indexOf(o.tag) >= 0;
    if (o.trait) return !!d[o.trait];
    return true;
  }
  /* Judges a challenge (pure). st: {dl: [{id, tags, glass, circle, t (a
     target), free, g (the grab it came in)}], drops (used), t (seconds),
     cracked, blew, left (prizes still in the bin), targets (in the pile),
     busy (a grab in flight)}. -> {res: 'win' | 'fail' | null, why}. A
     failure outranks a win in the same beat (a rock with the gem is a fail). */
  function schEval(ch, st) {
    if (!ch || !st) return { res: null, why: '' };
    const dl = st.dl || [], w = ch.win || {};
    if (ch.noCrack && st.cracked) return { res: 'fail', why: 'cracked' };
    if (st.blew) return { res: 'fail', why: 'blew' };
    if (ch.never && dl.some((d) => schMatch(ch.never, d))) return { res: 'fail', why: 'never' };
    const n = Math.max(1, w.n | 0);
    let won = false;
    if (w.k === 'total') won = dl.filter((d) => schMatch(w.of, d)).length >= n;
    else if (w.k === 'grab') { const per = {}; for (const d of dl) if (schMatch(w.of, d)) per[d.g] = (per[d.g] | 0) + 1; won = Object.keys(per).some((g) => per[g] >= n); }
    else if (w.k === 'target') { const need = w.n > 0 ? w.n : Math.max(1, st.targets | 0); won = dl.filter((d) => d.t).length >= need; }
    else if (w.k === 'free') won = dl.filter((d) => d.free && schMatch(w.of, d)).length >= n;
    else if (w.k === 'all') won = (st.left | 0) === 0 && dl.length > 0;
    if (won) return { res: 'win', why: '' };
    if (!st.busy && ch.drops > 0 && (st.drops | 0) >= ch.drops) return { res: 'fail', why: 'drops' };
    if (!st.busy && ch.time > 0 && (+st.t || 0) >= ch.time) return { res: 'fail', why: 'time' };
    return { res: null, why: '' };
  }
  // Stars for a clear (1..3): r {drops, t, items (the best grab's prizes)}.
  function schStars(ch, r) {
    const s = (ch && ch.stars) || { k: 'drops', s3: 1, s2: 2 };
    r = r || {};
    if (s.k === 'items') { const v = r.items | 0; return v >= s.s3 ? 3 : v >= s.s2 ? 2 : 1; }
    const v = s.k === 'time' ? +r.t || 0 : r.drops | 0;
    return v <= s.s3 ? 3 : v <= s.s2 ? 2 : 1;
  }
  // The three rows under a goal ("★★★ in 1 drop" ...).
  function schStarText(ch) {
    const s = (ch && ch.stars) || {};
    const u = (v) => (s.k === 'time' ? v + 's' : s.k === 'items' ? v + ' prizes' : v + (v === 1 ? ' drop' : ' drops'));
    if (s.k === 'items') return ['3 stars: ' + u(s.s3) + ' in the grab', '2 stars: ' + u(s.s2), '1 star: clear it'];
    return ['3 stars: ' + (s.k === 'time' ? 'under ' : 'in ') + u(s.s3), '2 stars: ' + (s.k === 'time' ? 'under ' : 'in ') + u(s.s2), '1 star: clear it'];
  }
  // Vault tickets for a new best: only the stars never earned before pay.
  const schPay = (prev, now) => Math.max(0, (Math.min(3, now | 0) - Math.min(3, prev | 0))) * SCH.TIX;
  // Every star earned (stars {id: 0..3}), only known challenges.
  function schTotal(stars) {
    let n = 0;
    for (const id of SCH_IDS) n += Math.max(0, Math.min(3, (stars && stars[id]) | 0));
    return n;
  }
  const schLessonStars = (li, stars) => (SCH_LESSONS[li] ? SCH_LESSONS[li].ch.reduce((n, c) => n + Math.max(0, Math.min(3, (stars && stars[c.id]) | 0)), 0) : 0);
  const schOpen = (li, total) => li >= 0 && li < SCH_LESSONS.length && (total | 0) >= (SCH.NEED[li] | 0);
  // A challenge opens once the one before it in the lesson has a star.
  const schChOpen = (li, i, stars) => i === 0 || !!(SCH_LESSONS[li] && SCH_LESSONS[li].ch[i - 1] && ((stars || {})[SCH_LESSONS[li].ch[i - 1].id] | 0) > 0);
  function schGrade(got, max) {
    const k = max > 0 ? got / max : 0;
    for (const [v, g] of SCH.GRADES) if (k >= v) return g;
    return '-';
  }
  // The school's record on the profile, repaired (junk and old profiles get an empty one).
  function schFix(o) {
    o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const num = (v) => Math.max(0, Math.floor(+v || 0));
    const out = { stars: {}, best: {}, tix: num(o.tix), dip: o.dip ? 1 : 0, seen: o.seen ? 1 : 0, plays: num(o.plays), pr: {} };
    const st = o.stars && typeof o.stars === 'object' ? o.stars : {};
    for (const id of SCH_IDS) { const v = Math.min(3, num(st[id])); if (v) out.stars[id] = v; }
    const bs = o.best && typeof o.best === 'object' ? o.best : {};
    for (const id of SCH_IDS) {
      const b = bs[id];
      if (b && typeof b === 'object') out.best[id] = { drops: num(b.drops), t: Math.max(0, Math.round((+b.t || 0) * 10) / 10), items: num(b.items) };
    }
    const pr = o.pr && typeof o.pr === 'object' && !Array.isArray(o.pr) ? o.pr : {};
    out.pr = { claw: typeof pr.claw === 'string' ? pr.claw : '', paint: typeof pr.paint === 'string' ? pr.paint : '',
      muts: Array.isArray(pr.muts) ? pr.muts.filter((m) => SCH.MUTS.indexOf(m) >= 0).slice(0, 3) : [],
      pet: typeof pr.pet === 'string' && PETS[pr.pet] ? pr.pet : '', slow: !!pr.slow, pile: typeof pr.pile === 'string' ? pr.pile : 'starter' };
    return out;
  }
  // The diploma's prize: a marquee, found by id like any cosmetic but never listed, pooled or sold (like the event ones).
  const SCH_COSMETIC = V_('mq_valedictorian', 'marquee', 'Valedictorian', 'l', 'Gold letters over a rainbow wave. The Claw School diploma, every star earned.',
    { text: 'VALEDICTORIAN', style: 'gold', bulbs: 'wave', col: '#ffc94d' }, { school: true });
  Object.defineProperty(COSMETICS, SCH_COSMETIC.id, { value: SCH_COSMETIC, enumerable: false, configurable: true, writable: true });
  // ================================================================ /SCHOOL

  // ================================================================ LEG (round 12: legendary relics, more evolutions, animated cabinets)
  /* DESIGN.md "Legends (round 12)". Twelve legendary relics (rarity 'l'),
     each one a build of its own with a catch, that reach into the newer
     systems (the rig, combos, bubbles, the turret, Luck, pets, materials,
     elites and bosses). They never sit in a common pool: only the boss
     relic after an act (LEG_K.bossP of the time), a legendary capsule's
     relic prize (LOOT.RELIC_RAR.l) and the Back Room's service counter hand
     them out. A relic's `leg` object is merged into F.leg by COMBAT (numbers
     add, see combat.js LEG block): golden (every nth grab is golden), peek
     (enemy moves two turns ahead), noCash (Luck never cashes out), noVolley
     (the turret fires per delivery, not at the turn's end), hypeK (damage
     per Hype), slay (the Giant Slayer's scale), glass (the game makes every
     body glass). The hooks below are ordinary relic hooks. Then ten more
     evolutions (the round 7 mechanism, added here with legEvoAdd) and three
     animated cabinet skins for the Prize Vault (RENDER.leg draws them). */
  const LEG_K = {
    gold: 5, goldDmg: 4, goldBlock: 2,            // The Golden Claw: every 5th grab; per prize on a golden grab of 2+
    slot: 3, slotMax: 2,                          // Infinite Coin Slot: every 3rd prize a turn, 2 grabs a turn at most
    peekDmg: 6,                                   // the Monocle: EXPOSED, once a turn
    voidDmg: 8, voidGrow: 2,                      // Black Hole Bin: junk falling in, +2 per 3 swallowed
    bounce: 2, bounceHp: 1,                       // Perpetual Motion: prizes a turn, HP a bounce
    hypeMax: 10, hypeK: 0.1,                      // The Crowd: +10% a Hype
    binSting: 2,                                  // Crown of Foam: a bubble bursting in the bin
    overStart: 4,                                 // Overclocked Core: turret parts at the bell (Lv 2)
    fate: 10, fateDmg: 25,                        // Fate Engine: FATE at 10 Luck
    collarDmg: 3,                                 // Alpha Collar: every trick, ALL
    crackDmg: 4, shatterDmg: 6,                   // Glass Heart
    slayUp: 0.3, slayDown: 0.2, slayStr: 3,       // Giant Slayer's Crown
    bossP: 0.15,                                  // the act boss's relic is a legendary this often (BALANCE round 12: was 0.25)
    price: 250,                                   // the Back Room's service counter
  };
  const legHas = (F, id) => !!F && Array.isArray(F.relics) && F.relics.indexOf(id) >= 0;
  const legL = (F) => F.leg || (F.leg = {});
  const legLuck = (F) => ((F.player && F.player.status && F.player.status.luck) | 0);
  // Is the grab that just finished (grabDone's onGrab) a golden one?
  const legGoldNow = (F) => { const k = (F.leg && F.leg.golden) || LEG_K.gold; return (((F.stats && F.stats.grabs) | 0) % k) === 0; };
  const LEG_RELICS = [
    { id: 'leg_golden_claw', name: 'The Golden Claw', icon: '\u{1F3C6}', rarity: 'l', leg: { golden: LEG_K.gold }, kw: ['jackpot'], proc: 'GOLDEN GRAB',
      text: 'Every 5th grab is a GOLDEN GRAB: the claw turns gold and grips far harder. A golden grab that brings up 2+ prizes deals 4 damage to ALL and gives 2 Block per prize. The other grabs grip a little looser.',
      mods: { grip: -0.15 },
      hooks: {
        onGrab(F, n) {
          if (!legGoldNow(F)) return;
          if ((n | 0) >= 2) { proc(F, 'leg_golden_claw', 'GOLDEN x' + n); zapAll(F, LEG_K.goldDmg * n); gainBlock(F, LEG_K.goldBlock * n); }
          else proc(F, 'leg_golden_claw', 'GOLDEN WHIFF');
        },
      } },
    { id: 'leg_coin_slot', name: 'Infinite Coin Slot', icon: '♾', rarity: 'l', leg: { slot: 1 }, kw: ['jackpot', 'swarm'], proc: 'COIN SLOT',
      text: 'Every 3rd prize you deliver in a turn feeds the slot: +1 grab (2 a turn at most). The slot keeps a cut: lose 12 Max HP.',
      mods: { maxhp: -12 },
      hooks: {
        onPlay(F) {
          const m = mem(F);
          if (m.csT !== F.turn) { m.csT = F.turn; m.csN = 0; m.csG = 0; }
          m.csN++;
          if (m.csN % LEG_K.slot === 0 && m.csG < LEG_K.slotMax) { m.csG++; moreGrabs(F, 1); }
        },
      } },
    { id: 'leg_monocle', name: "Prize Master's Monocle", icon: '\u{1F9D0}', rarity: 'l', leg: { peek: 1 }, kw: ['brawler'], proc: 'EXPOSED',
      text: "You see every enemy's move two turns ahead. The first enemy you hit each turn while it winds up an attack takes 6 more. Squinting slows the claw 15%.",
      mods: { speed: -0.15 },
      hooks: {
        onFightStart(F) { proc(F, 'leg_monocle', 'I SEE YOU'); },
        onDmgDealt(F, e, amt) {
          if (!e || !e.alive || !(amt > 0)) return;
          const k = e.intent && e.intent.k;
          if (k !== 'attack' && k !== 'charge') return;
          const m = mem(F);
          if (m.monoT === F.turn) return;
          m.monoT = F.turn;
          zap(F, e, LEG_K.peekDmg);
        },
      } },
    { id: 'leg_black_hole', name: 'Black Hole Bin', icon: '\u{1F573}', rarity: 'l', kw: ['junk'], proc: 'EVENT HORIZON',
      text: 'Start each fight with a Rock. Junk you grab out falls into the black hole for good this fight and hits the target for 8, 2 more for every 3 it has swallowed. A turn with nothing for it, the hole feeds on a random item from your used pile.',
      hooks: {
        onFightStart(F) { const c = CB(); if (c) c.addJunk(F, 'rock', 1); },
        onPlay(F, inst, def) {
          if (!inst || !isJunkPlay(inst, def)) return;
          inst.legGo = 'void';
          const m = mem(F);
          m.bhT = F.turn;
          zap(F, focus(F), LEG_K.voidDmg + LEG_K.voidGrow * Math.floor((m.bhN | 0) / 3));
          m.bhN = (m.bhN | 0) + 1;
        },
        onTurnEnd(F) {
          const m = mem(F);
          if (m.bhT === F.turn || !CB() || !Array.isArray(F.used)) return;
          const pool = F.used.filter(i => i && !isJunkPlay(i, ITEMS[i.id]));
          if (!pool.length) return;
          const inst = pool[Math.floor((typeof F.rng === 'function' ? F.rng() : 0) * pool.length)];
          F.used.splice(F.used.indexOf(inst), 1);
          (F.purged || (F.purged = [])).push(inst);
          proc(F, 'leg_black_hole', 'THE HOLE FEEDS');
        },
      } },
    { id: 'leg_perpetual', name: 'Perpetual Motion Machine', icon: '⚙', rarity: 'l', kw: ['echo'], proc: 'BOUNCE BACK',
      text: 'The first 2 prizes you deliver each turn bounce back into the cabinet after they play (each prize once a fight), ready to grab again. Friction is not free: each bounce costs 1 HP.',
      hooks: {
        onPlay(F, inst, def) {
          if (!inst || inst.legB || inst.frozen || isJunkPlay(inst, def)) return;
          const m = mem(F);
          if (m.pmT !== F.turn) { m.pmT = F.turn; m.pmN = 0; }
          if (m.pmN >= LEG_K.bounce) return;
          m.pmN++;
          inst.legB = 1; inst.legGo = 'bounce';
          zap(F, F.player, LEG_K.bounceHp);
        },
      } },
    { id: 'leg_crowd', name: 'The Crowd', icon: '\u{1F4E3}', rarity: 'l', leg: { hypeK: LEG_K.hypeK }, kw: ['jackpot', 'brawler'], proc: 'HYPE',
      text: 'Every combo gets the crowd going: +1 Hype (10 at most), and your hits deal 10% more per Hype. A turn with no combo, the Hype halves; with none left, they boo you: 1 Weak.',
      hooks: {
        onCombo(F) {
          if (!CB()) return;
          const L = legL(F);
          L.hype = Math.min(LEG_K.hypeMax, (L.hype | 0) + 1);
          mem(F).crT = F.turn;
          proc(F, 'leg_crowd', 'HYPE ' + L.hype);
        },
        onTurnStart(F) {
          if (!CB() || (F.turn | 0) <= 1 || mem(F).crT === F.turn - 1) return;
          const L = legL(F), h0 = L.hype | 0;
          L.hype = Math.floor(h0 / 2);
          if (h0 > 0) proc(F, 'leg_crowd', 'HYPE ' + L.hype);
          else { proc(F, 'leg_crowd', 'BOO!'); selfStatus(F, 'weak', 1); }
        },
      } },
    { id: 'leg_foam_crown', name: 'Crown of Foam', icon: '\u{1FAE7}', rarity: 'l', kw: ['jackpot', 'fortress'], proc: 'FOAM CROWN',
      text: 'Any crawler blows 2 bubbles every turn (Ms. Bubbles 2 more). A Bubble Combo gives 1 Strength for the fight. A bubble left to burst in the bin stings you for 2.',
      rules: { bubbles: 1 }, bub: { n: 1 },
      hooks: {
        onBubble(F, where, n) {
          n = n | 0;
          if (n <= 0) return;
          if (where === 'bin') { proc(F, 'leg_foam_crown', 'STING x' + n); zap(F, F.player, LEG_K.binSting * n); }
          else if (n >= 2) { proc(F, 'leg_foam_crown', 'FOAM ROYALTY'); selfStatus(F, 'str', 1); }
        },
      } },
    { id: 'leg_overclock', name: 'Overclocked Core', icon: '\u{1F50B}', rarity: 'l', leg: { noVolley: 1 }, kw: ['metal'], proc: 'OVERCLOCK',
      text: 'Any crawler builds the turret, and it starts every fight at Lv 2. Every metal prize you deliver fires a turret shot on the spot. The turret no longer fires at the end of your turn.',
      rules: { turret: 1 },
      hooks: {
        onFightStart(F) { turParts(F, LEG_K.overStart, 'OVERCLOCK'); },
        onPlay(F, inst, def) {
          if (!tagged(def, 'metal')) return;
          const c = CB();
          if (c && F.tur && c.legShot) c.legShot(F); else zap(F, focus(F), 3);   // (no turret: a spark)
        },
      } },
    { id: 'leg_fate_engine', name: 'Fate Engine', icon: '\u{1F320}', rarity: 'l', leg: { noCash: 1 }, kw: ['luck'], proc: 'FATE',
      text: 'Any crawler fills the Luck meter, and every whiff adds 1 more. Luck never cashes out: at 10 Luck FATE strikes, 25 damage to ALL, and the meter empties.',
      rules: { luck: 1 },
      hooks: {
        onGrab(F, n) { if (!(n | 0)) luckUp(F, 1); },
        onStatus(F, u, s) {
          if (u !== F.player || s !== 'luck' || legLuck(F) < LEG_K.fate) return;
          proc(F, 'leg_fate_engine', 'FATE STRIKES');
          zapAll(F, LEG_K.fateDmg);
          selfStatus(F, 'luck', -legLuck(F));
        },
      } },
    { id: 'leg_alpha_collar', name: 'Alpha Collar', icon: '\u{1F43A}', rarity: 'l', kw: ['brawler'], proc: 'ALPHA',
      text: 'Your pet does one more trick a turn, 50% stronger, and every trick hits ALL enemies for 3. Each trick eats from your plate: 1 HP. No pet: a stray bites a random enemy for 3 every turn.',
      pet: { uses: 1, pow: 0.5 },
      hooks: {
        onPet(F) { zapAll(F, LEG_K.collarDmg); zap(F, F.player, 1); },
        onTurnStart(F) { if (!F.petId) zap(F, randomFoe(F), LEG_K.collarDmg); },
      } },
    { id: 'leg_glass_heart', name: 'Glass Heart', icon: '\u{1F4A0}', rarity: 'l', leg: { glass: 1 }, kw: ['glass'], proc: 'GLASS HEART',
      text: 'Everything in your cabinet is glass: a hard landing cracks it (+50% when played), a second crack shatters it for the fight. Every crack hits a random enemy for 4, every shatter hits ALL for 6.',
      hooks: {
        onMaterial(F, kind) {
          if (kind === 'crack') zap(F, randomFoe(F), LEG_K.crackDmg);
          else if (kind === 'shatter') zapAll(F, LEG_K.shatterDmg);
        },
      } },
    { id: 'leg_slayer_crown', name: "Giant Slayer's Crown", icon: '\u{1F451}', rarity: 'l', leg: { slay: 1 }, kw: ['brawler'], proc: 'GIANT SLAYER',
      text: 'Your hits on elites and bosses deal 30% more, and when one of them enrages you gain 3 Strength. Small fry bore you: your hits on normal enemies deal 20% less.',
      hooks: {
        onFightStart(F) {
          const big = aliveOf(F).some(e => e.def && (e.def.tier === 'elite' || e.def.tier === 'boss'));
          proc(F, 'leg_slayer_crown', big ? 'GIANT SLAYER' : 'SMALL FRY');
        },
        onTurnStart(F) {
          const m = mem(F), seen = m.slay || (m.slay = {});
          for (const e of F.enemies || []) {
            if (!e || !e.alive || !e.enraged || !e.def || (e.def.tier !== 'elite' && e.def.tier !== 'boss') || seen[e.uid]) continue;
            seen[e.uid] = 1;
            proc(F, 'leg_slayer_crown', 'STAND AND FIGHT');
            selfStatus(F, 'str', LEG_K.slayStr);
          }
        },
      } },
  ];
  for (const r of LEG_RELICS) { r.leg = r.leg || {}; RELIC_LIST.push(r); RELICS[r.id] = r; }
  const LEG_RELIC_IDS = LEG_RELICS.map(r => r.id);

  /* Ten more evolutions (DESIGN.md "Legends (round 12)"): the round 7
     mechanism exactly (base item + relic, an evolved def reachable as
     ITEMS[id] through a non-enumerable property, an aura in EVO_FX), for the
     crawlers with few (Ms. Bubbles, Mama Mech, Lucky Lou, the Rogue) and the
     new legendary relics. */
  function legEvoAdd(d) {
    const def = Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'enemy', tags: [] }, d, { rarity: 'l', cost: 0, evolved: true });
    delete def.aura;
    const a = d.aura, fxId = 'evo:' + d.id;
    def.auraId = fxId; def.auraName = a.name; def.auraText = a.text;
    EVOLVED[d.id] = def;
    Object.defineProperty(ITEMS, d.id, { value: def, enumerable: false, configurable: true, writable: true });
    EVOLUTIONS[d.id] = { id: d.id, from: d.from, relic: d.relic, to: d.id, name: d.name, icon: d.icon, glow: d.glow };
    EVO_OF[d.from] = d.id;
    EVO_FX[fxId] = Object.assign({ id: fxId, name: a.name, icon: d.icon, rarity: 'evo', kw: kwIds(def).slice(0, 1), proc: a.proc, text: a.text,
      color: d.glow, evo: d.id }, a.hooks ? { hooks: a.hooks } : {}, a.rules ? { rules: a.rules } : {}, a.bub ? { bub: a.bub } : {}, a.tur ? { tur: a.tur } : {});
    EVO_LIST.push(d);
    EVO_IDS.push(d.id);
  }
  const LEG_EVOS = [
    // Ms. Bubbles
    { id: 'calliope_pipe', name: 'Calliope Pipe', from: 'bubble_pipe', relic: 'squeaky_toy', icon: '\u{1F3BA}', glow: '#8dfff5', soap: 2,
      tags: ['light', 'magic'], shape: box(40, 14), density: 0.7, friction: 0.5, color: '#ffd23f', color2: '#8dfff5', art: 'horn', target: 'all',
      fx: [dmg(5)], text: 'Deal {v} damage to ALL enemies and blow two bubbles. It plays a little tune.',
      aura: { name: 'Steam Organ', proc: 'STEAM ORGAN', text: 'Bubble Combos hit 2 harder per bubble. No bubbles: a grab of 2+ items hits ALL for 2.',
        bub: { combo: 2 }, hooks: { onGrab(F, n) { if (!F.bub && (n | 0) >= 2) zapAll(F, 2); } } } },
    { id: 'kraken_sponge', name: 'Kraken Sponge', from: 'sponge', relic: 'leg_foam_crown', icon: '\u{1F991}', glow: '#ff9ad0', soap: 1,
      tags: ['light'], shape: box(30, 22), density: 0.4, friction: 0.9, restitution: 0.2, color: '#ffe066', color2: '#c77dff', art: 'bread', target: 'self',
      fx: [heal(6), block(6)], text: 'Heal {v} HP, gain {v2} Block and blow a bubble. It soaks up anything.',
      aura: { name: 'Deep Soak', proc: 'DEEP SOAK', text: 'A bubble bursting in the bin heals 2 HP. No bubbles: heal 2 at the end of your turn.',
        hooks: { onBubble(F, where, n) { if (where === 'bin' && (n | 0) > 0) healP(F, 2 * (n | 0)); }, onTurnEnd(F) { if (!F.bub) healP(F, 2); } } } },
    // Mama Mech
    { id: 'gear_grinder', name: 'Gear Grinder', from: 'pipe_wrench', relic: 'leg_overclock', icon: '⚙', glow: '#ffb347', part: 4,
      tags: ['metal', 'weapon', 'tool', 'heavy'], shape: box(46, 16), density: 1.8, friction: 0.5, color: '#d8343a', color2: '#ffc94d', art: 'hammer',
      fx: [dmg(12)], text: 'Deal {v} damage. The teeth spin: it counts as 4 turret parts.',
      aura: { name: 'Flywheel', proc: 'FLYWHEEL', text: 'The turret fires one shot at your turn start. No turret: zap a random enemy for 3.',
        hooks: { onTurnStart(F) { const c = CB(); if (c && F.tur && c.legShot) c.legShot(F); else zap(F, randomFoe(F), 3); } } } },
    { id: 'railgun_coil', name: 'Railgun Coil', from: 'spring_coil', relic: 'armor_piercing', icon: '\u{1F529}', glow: '#7ff7ff',
      tags: ['metal', 'weapon'], shape: circle(14), density: 1.2, friction: 0.4, restitution: 0.5, color: '#2ee6d6', color2: '#ffc94d', art: 'ring',
      fx: [dmg(5, 3)], text: 'Fire {v} damage {n} times down the rails. A turret part.',
      aura: { name: 'Magnetic Rail', proc: 'MAG RAIL', text: 'Turret shots deal 1 more. No turret: a grab of 2+ metal items zaps the target for 3.',
        tur: { amp: 1 }, hooks: { onGrab(F) { if (!F.tur && grabDefs(F).filter(d => tagged(d, 'metal')).length >= 2) zap(F, focus(F), 3); } } } },
    // Lucky Lou
    { id: 'all_in_chip', name: 'All-In Chip', from: 'poker_chip', relic: 'leg_fate_engine', icon: '\u{1F0CF}', glow: '#3ddc84',
      tags: [], shape: circle(15), density: 1.3, friction: 0.3, restitution: 0.15, color: '#1a1a2a', color2: '#ffc94d', art: 'chip', target: 'self',
      fx: [block(9), status('luck', 3, 'self')], text: 'Gain {v} Block and {v2} Luck. All of it on red.',
      aura: { name: 'Poker Face', proc: 'POKER FACE', text: 'An empty grab gives 2 Block, +1 per Luck you hold (12 at most).',
        hooks: { onGrab(F, n) { if (!(n | 0)) gainBlock(F, Math.min(12, 2 + legLuck(F))); } } } },
    { id: 'showstopper', name: 'Showstopper Deck', from: 'marked_deck', relic: 'leg_crowd', icon: '\u{1F3B4}', glow: '#ff2e88',
      tags: ['tool', 'magic'], shape: box(28, 36), density: 0.9, friction: 0.55, color: '#ff2e88', color2: '#ffe066', art: 'card', target: 'none',
      fx: [grab(1), status('luck', 3, 'self'), block(4)], text: 'Gain {v} extra grab, {v2} Luck and {v3} Block. The whole deck is aces.',
      aura: { name: 'Standing Ovation', proc: 'OVATION', text: 'Every combo also gives 1 Luck, and 1 Hype with The Crowd.',
        hooks: { onCombo(F) { luckUp(F, 1); if (legHas(F, 'leg_crowd')) { const L = legL(F); L.hype = Math.min(LEG_K.hypeMax, (L.hype | 0) + 1); } } } } },
    // the Rogue
    { id: 'boomerang_blades', name: 'Boomerang Blades', from: 'twin_daggers', relic: 'leg_perpetual', icon: '\u{1FA83}', glow: '#2ee6d6',
      tags: ['metal', 'weapon'], shape: box(38, 14), density: 1.2, friction: 0.45, color: '#e6ebf0', color2: '#ff2e88', art: 'dagger', target: 'random',
      fx: [dmg(5, 3)], text: 'Throw {v} damage {n} times at random enemies. They always come back.',
      aura: { name: 'Return Flight', proc: 'RETURN FLIGHT', text: 'A prize that bounces back hits a random enemy for 3 (else your first weapon each turn does).',
        hooks: {
          onPlay(F, inst, def) {
            if (inst && inst.legB === 1) { inst.legB = 2; zap(F, randomFoe(F), 3); return; }
            if (legHas(F, 'leg_perpetual') || !tagged(def, 'weapon')) return;
            const m = mem(F);
            if (m.rfT === F.turn) return;
            m.rfT = F.turn;
            zap(F, randomFoe(F), 3);
          },
        } } },
    { id: 'vanishing_act', name: 'Vanishing Act', from: 'smoke_bomb', relic: 'leg_monocle', icon: '\u{1F3A9}', glow: '#b08cff',
      tags: ['light', 'magic'], shape: circle(16), density: 0.7, friction: 0.5, restitution: 0.2, color: '#2a2238', color2: '#b08cff', art: 'mask', target: 'self',
      fx: [status('dodge', 2, 'self'), status('weak', 2, 'all'), status('vuln', 1, 'all')], text: 'Gain {v} Dodge, and {v2} Weak and {v3} Vulnerable on ALL enemies. And now, you do not see me.',
      aura: { name: 'Now You See Me', proc: 'NOW YOU SEE ME', text: '1 Dodge at the bell. Each turn start, every enemy winding up an attack gets 1 Weak.',
        hooks: {
          onFightStart(F) { selfStatus(F, 'dodge', 1); },
          onTurnStart(F) { aliveOf(F).filter(e => e.intent && (e.intent.k === 'attack' || e.intent.k === 'charge')).forEach(e => foeStatus(F, e, 'weak', 1)); },
        } } },
    { id: 'master_key', name: 'Master Key', from: 'skeleton_key', relic: 'leg_golden_claw', icon: '\u{1F5DD}', glow: '#ffe066',
      tags: ['metal', 'tool'], shape: box(38, 14), density: 1.5, friction: 0.4, color: '#ffe066', color2: '#b8860b', art: 'key', target: 'none',
      fx: [grab(1), block(6)], text: 'Gain {v} extra grab this turn and {v2} Block. It opens the glass.',
      aura: { name: 'Open Sesame', proc: 'OPEN SESAME', text: 'A golden grab (every 5th) that brings something up gives a grab back.',
        hooks: { onGrab(F, n) { if ((n | 0) > 0 && legGoldNow(F)) moreGrabs(F, 1); } } } },
    // a shared bomb, for the black hole
    { id: 'singularity', name: 'Singularity', from: 'rubble_bomb', relic: 'leg_black_hole', icon: '\u{1F311}', glow: '#9b7bff',
      tags: ['weapon', 'heavy', 'magic'], shape: circle(18), density: 1.6, friction: 0.5, restitution: 0.15, color: '#1a1030', color2: '#9b7bff', art: 'orb', target: 'all',
      fx: [dmg(14), junk('rock', 2)], text: 'Deal {v} damage to ALL enemies, and {n} Rocks fall out of the event horizon.',
      aura: { name: 'Accretion', proc: 'ACCRETION', text: 'Junk you grab out also hits ALL enemies for 3 on its way down.',
        hooks: { onPlay(F, inst, def) { if (isJunkPlay(inst, def)) zapAll(F, 3); } } } },
  ];
  for (const d of LEG_EVOS) legEvoAdd(d);
  const LEG_EVO_IDS = LEG_EVOS.map(d => d.id);

  /* Three animated cabinets for the Prize Vault. look.anim names the live
     layer RENDER.leg draws over the cached back (the older rare skins get
     theirs by id in render.js); fp / pp name their frame and panel. */
  const LEG_SKINS = [
    V_('skin_leg_aqua', 'skin', 'Aquarium', 'u', 'A fish tank behind the pile: fish, bubbles and swaying weed.',
      { frame: '#0f4a6b', trim: '#8dfff5', fp: 'leg_aqua', panel: '#04263a', pp: 'leg_aqua', bulb: '#d8fbff', glow: '#2ee6d6', neon: '#2ee6d6', anim: 'aqua' }),
    V_('skin_leg_tokyo', 'skin', 'Neon Tokyo', 'r', 'Rain on the glass, a skyline behind it and signs that scroll.',
      { frame: '#1a0f2e', trim: '#ff2e88', fp: 'leg_tokyo', panel: '#0b0716', pp: 'leg_tokyo', bulb: '#ffe0f4', glow: '#ff2e88', neon: '#ff2e88', anim: 'tokyo' }),
    V_('skin_leg_crt', 'skin', 'Retro CRT', 'l', 'Phosphor green, scanlines rolling, a tube that hums.',
      { frame: '#3a3a36', trim: '#c9c3a6', fp: 'leg_crt', panel: '#031a0a', pp: 'leg_crt', bulb: '#d8ffd8', glow: '#6bff9a', neon: '#6bff9a', anim: 'crt' }),
  ];
  for (const c of LEG_SKINS) { COSMETIC_LIST.push(c); COSMETICS[c.id] = c; COSMETIC_IDS.push(c.id); }
  const LEG = { K: LEG_K, RELICS: LEG_RELIC_IDS, EVOS: LEG_EVO_IDS, SKINS: LEG_SKINS.map(c => c.id), goldNow: legGoldNow };
  // ================================================================ /LEG

  // ================================================================ TRD (round 14): the Trading Post and pet evolution
  /* The Trading Post (DESIGN.md "The Trading Post and pet evolution (round
     14)"): a travelling merchant, one per act off the road, deals three
     TRADES a visit. Every trade is a swap at an even rate, never free value:
       swap     an item of your bin for a different item sharing a keyword:
                the same rarity (a plus stays a plus), or a plus copy for an
                item one rarity up that is not upgraded (the Compactor's own
                rate: three of a kind make one plus, three of a rarity one of
                the next, so a plus is worth about a rarity step)
       relic    a relic for a face-down relic of the same rarity from another
                archetype (its archetype is the hint)
       service  gold for lifting a curse (a junk item) or removing an item,
                at the shop's removal price with the round 12 shopK
       bundle   two named items of one rarity (common or uncommon, never a
                plus) for one face-down item of the next rarity above the
                lower of the two
     Rolled from the tile's own seed on arrival and saved with the tile (the
     game pays each trade once). Pure: the game hands in the bin, the relics,
     the unowned relic pool and the prices. Pet evolution rides here too: a
     pet at its top level can evolve ONCE into a final form (PEV_FORMS: a
     bigger, glowing look and an upgraded trick) for a price (a relic, a
     rest, or a gold fee by act, PEV_K). */
  const TRD_K = {
    n: 3,                                                  // trades a visit
    W: { swap: 40, relic: 25, service: 15, bundle: 20 },   // how often each kind is dealt (one that cannot be dealt is skipped)
    VAL: { junk: 0, c: 37, u: 63, r: 100, l: 132 },        // an item's worth: the shelf's average cost by rarity (DATA.ITEMS, round 14)
    plusK: 1.6,                                            // a plus copy is worth this much more (about one rarity step up)
    removeBase: 60,                                        // the shop's removal price, before ECONOMY.shopK
    bundleRar: ['c', 'u'],                                 // the bundle takes two of one of these
    relicRar: ['c', 'u', 'r'],                             // relics the merchant swaps
    RVAL: { c: 120, u: 160, r: 220 },                      // a relic's worth: the shop's relic price before shopK
  };
  const TRD_RANK = { junk: 0, c: 1, u: 2, r: 3, l: 4 }, TRD_RAR = ['junk', 'c', 'u', 'r', 'l'];
  // An item instance's worth in gold (the value rule the tests check).
  function trdValue(id, plus) {
    const d = ITEMS[id];
    if (!d) return 0;
    return Math.round((TRD_K.VAL[d.rarity] || 0) * (plus && d.rarity !== 'junk' ? TRD_K.plusK : 1));
  }
  // An item the merchant takes: real, not junk, never an evolved item.
  const trdTradable = (inst) => !!(inst && ITEMS[inst.id] && ITEMS[inst.id].rarity !== 'junk' && !ITEMS[inst.id].evolved && !ITEMS[inst.id].bag);
  // What a swap hands back for this instance: {rar, plus}.
  function trdSwapRule(inst) {
    const d = ITEMS[inst.id];
    if (inst.plus && d.rarity !== 'l') return { rar: TRD_RAR[Math.min(4, TRD_RANK[d.rarity] + 1)], plus: false };
    return { rar: d.rarity, plus: !!inst.plus };
  }
  // rng, inst, char -> {id, plus, kw} (a different item sharing a keyword) | null
  function trdSwapFor(rng, inst, char) {
    if (!trdTradable(inst)) return null;
    const R = trdSwapRule(inst), mine = kwIds(ITEMS[inst.id]);
    const all = pool(R.rar, char).filter(id => id !== inst.id);
    const cand = mine.length ? all.filter(id => kwIds(ITEMS[id]).some(k => mine.indexOf(k) >= 0)) : all;
    if (!cand.length) return null;
    const id = cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))];
    const kw = kwIds(ITEMS[id]).find(k => mine.indexOf(k) >= 0) || null;
    return { id, plus: R.plus, kw };
  }
  // A relic the merchant swaps: of a swapped rarity, not a crawler's own.
  const trdRelicOk = (id) => !!(RELICS[id] && TRD_K.relicRar.indexOf(RELICS[id].rarity) >= 0 && !RELICS[id].starter);
  // rng, relicId, unowned ids -> {id, kw, rar} (same rarity, another archetype) | null
  function trdRelicFor(rng, relicId, poolIds) {
    if (!trdRelicOk(relicId)) return null;
    const rar = RELICS[relicId].rarity, mine = kwIds(RELICS[relicId]);
    const cand = (poolIds || []).filter(id => id !== relicId && RELICS[id] && RELICS[id].rarity === rar && !RELICS[id].starter &&
      kwIds(RELICS[id]).length && !kwIds(RELICS[id]).some(k => mine.indexOf(k) >= 0));
    if (!cand.length) return null;
    const id = cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))];
    return { id, kw: kwIds(RELICS[id])[0], rar };
  }
  // The bundle's rule: one rarity above the lower of the two (legendary at most).
  function trdBundleRar(a, b) {
    const lo = Math.min(TRD_RANK[(ITEMS[a.id] || {}).rarity] || 0, TRD_RANK[(ITEMS[b.id] || {}).rarity] || 0);
    return TRD_RAR[Math.min(4, lo + 1)];
  }
  // rng, a, b, char -> {id, rar} (never one of the two; a dry pool steps down) | null
  function trdBundleFor(rng, a, b, char) {
    let rar = trdBundleRar(a, b), cand = [];
    while (!cand.length && TRD_RANK[rar] >= 1) {
      cand = pool(rar, char).filter(id => id !== a.id && id !== b.id);
      if (!cand.length) rar = TRD_RAR[TRD_RANK[rar] - 1];
    }
    if (!cand.length) return null;
    return { id: cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))], rar };
  }
  const trdGive = (inst) => ({ uid: inst.uid, id: inst.id, plus: !!inst.plus });
  const trdShuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  /* The visit's trades. ctx: {bin: [inst], relics: [ids], relicPool: [unowned
     ids], char, removePrice, binFloor}. -> [offer] (at most TRD_K.n):
       {k: 'swap', give: {uid, id, plus}, get: {id, plus, kw}, vGive, vGet}
       {k: 'relic', give: relicId, get: relicId, kw, rar, vGive, vGet}
       {k: 'service', mode: 'curse' | 'remove', price, vGive, vGet}
       {k: 'bundle', give: [{uid, id, plus} x2], get: {id, plus: false}, rar, vGive, vGet}
     A kind that cannot be dealt is skipped; the rest is filled with more
     swaps (other items). An item is never named in two trades. */
  function trdRoll(rng, ctx) {
    ctx = ctx || {};
    const bin = (ctx.bin || []).filter(i => i && ITEMS[i.id]), floor = ctx.binFloor == null ? 3 : ctx.binFloor;
    const used = {}, out = [];
    const swap = () => {
      const list = trdShuffle(rng, bin.filter(i => trdTradable(i) && !used[i.uid]));
      // a plus copy is offered first half the time (the rarity step is the fun one)
      if (rng() < 0.5) list.sort((a, b) => (b.plus ? 1 : 0) - (a.plus ? 1 : 0));
      for (const inst of list) {
        const g = trdSwapFor(rng, inst, ctx.char);
        if (!g) continue;
        used[inst.uid] = 1;
        return { k: 'swap', give: trdGive(inst), get: g, vGive: trdValue(inst.id, inst.plus), vGet: trdValue(g.id, g.plus) };
      }
      return null;
    };
    const relic = () => {
      for (const id of trdShuffle(rng, (ctx.relics || []).filter(trdRelicOk))) {
        const g = trdRelicFor(rng, id, ctx.relicPool || []);
        if (!g) continue;
        return { k: 'relic', give: id, get: g.id, kw: g.kw, rar: g.rar, vGive: TRD_K.RVAL[g.rar] || 0, vGet: TRD_K.RVAL[g.rar] || 0 };
      }
      return null;
    };
    const service = () => {
      if (bin.length <= floor) return null;
      const p = Math.max(1, Math.round(+ctx.removePrice || TRD_K.removeBase));
      return { k: 'service', mode: bin.some(i => ITEMS[i.id].rarity === 'junk') ? 'curse' : 'remove', price: p, vGive: p, vGet: p };
    };
    const bundle = () => {
      if (bin.length - 1 < floor) return null;   // two out, one in: the bin keeps its floor
      const groups = {};
      for (const i of bin) { const r = ITEMS[i.id].rarity; if (TRD_K.bundleRar.indexOf(r) >= 0 && trdTradable(i) && !i.plus && !used[i.uid]) (groups[r] = groups[r] || []).push(i); }
      for (const r of trdShuffle(rng, Object.keys(groups).filter(r => groups[r].length >= 2).sort())) {
        const two = trdShuffle(rng, groups[r]).slice(0, 2);
        const g = trdBundleFor(rng, two[0], two[1], ctx.char);
        if (!g) continue;
        for (const i of two) used[i.uid] = 1;
        return { k: 'bundle', give: two.map(trdGive), get: { id: g.id, plus: false }, rar: g.rar,
          vGive: trdValue(two[0].id, two[0].plus) + trdValue(two[1].id, two[1].plus), vGet: trdValue(g.id, false) };
      }
      return null;
    };
    const make = { swap, relic, service, bundle };
    // deal the kinds by weight without repeats; each one that cannot be dealt is dropped
    let kinds = Object.keys(TRD_K.W);
    while (out.length < TRD_K.n && kinds.length) {
      let x = rng() * kinds.reduce((s, k) => s + TRD_K.W[k], 0), pick = kinds[kinds.length - 1];
      for (const k of kinds) { x -= TRD_K.W[k]; if (x < 0) { pick = k; break; } }
      kinds = kinds.filter(k => k !== pick);
      const o = make[pick]();
      if (o) out.push(o);
    }
    while (out.length < TRD_K.n) { const o = swap(); if (!o) break; out.push(o); }
    return out;
  }
  // A saved trade post (tile.content.trd) as it is today, or null (junk).
  function trdFix(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.offers)) return null;
    const offers = o.offers.filter(x => x && typeof x === 'object' && ['swap', 'relic', 'service', 'bundle'].indexOf(x.k) >= 0);
    const done = Array.isArray(o.done) ? offers.map((x, i) => !!o.done[i]) : offers.map(() => false);
    return Object.assign({}, o, { offers, done, seed: (o.seed >>> 0) || 1 });
  }

  /* Pet evolution: a pet at PET_MAX evolves once (run.pet.evo = 1) into its
     final form: PEV_K.look times bigger, glowing, a flourish of its own, its
     trick PEV_K.pow stronger and ending in the form's `fx` (COMBAT.pevTrick).
     It costs a relic (the Trading Post takes it), a rest (the rest stop's
     choice, instead of healing) or gold (the Trading Post, PEV_K.gold by act
     times shopK and the Tilt's Price Hike). */
  const PEV_K = { lv: PET_MAX, pow: 0.4, look: 1.25, gold: { 1: 80, 2: 120, 3: 160 } };
  const PEV_FORMS = {
    hamster: { name: 'Turbo Hamster', trick: 'Stampede', icon: '⚡', col: '#ffb347', flair: 'bolts', fx: { k: 'dmg', v: 3 }, text: 'Every trick also hits a random enemy for 3.' },
    parrot: { name: 'Captain Parrot', trick: "Crow's Nest", icon: '⚓', col: '#3ddc84', flair: 'hat', fx: { k: 'block', v: 3 }, text: 'Every trick also gives you 3 Block.' },
    cat: { name: 'Sabertooth Cat', trick: 'Pounce', icon: '🗡', col: '#ff9a3c', flair: 'fangs', fx: { k: 'dmg', v: 4 }, text: 'Every trick also hits a random enemy for 4.' },
    octopus: { name: 'Kraken', trick: 'Ink Cloud', icon: '🌊', col: '#c77dff', flair: 'ink', fx: { k: 'status', s: 'weak', v: 1 }, text: 'Every trick also gives ALL enemies 1 Weak.' },
    firefly: { name: 'Starfly', trick: 'Dazzle', icon: '🌟', col: '#ffe066', flair: 'stars', fx: { k: 'status', s: 'vuln', v: 1 }, text: 'Every trick also gives ALL enemies 1 Vulnerable.' },
    mouse: { name: 'Tesla Mouse', trick: 'Arc Zap', icon: '⚡', col: '#8dfff5', flair: 'bolts', fx: { k: 'dmgAll', v: 2 }, text: 'Every trick also hits ALL enemies for 2.' },
    raccoon: { name: 'Raccoon Baron', trick: 'Recycling', icon: '🎩', col: '#ffc94d', flair: 'hat', fx: { k: 'block', v: 4 }, text: 'Every trick also gives you 4 Block.' },
    goose: { name: 'Golden Swan', trick: 'Grace', icon: '🦢', col: '#ffe27a', flair: 'wings', fx: { k: 'heal', v: 2 }, text: 'Every trick also heals you 2.' },
    penguin: { name: 'Emperor Penguin', trick: 'Blizzard', icon: '❄', col: '#9fd8ff', flair: 'stars', fx: { k: 'status', s: 'chill', v: 1 }, text: 'Every trick also gives ALL enemies 1 Chill.' },
    molerat: { name: 'Mole King', trick: 'Tremor', icon: '👑', col: '#f2b8a8', flair: 'fangs', fx: { k: 'dmgAll', v: 2 }, text: 'Every trick also hits ALL enemies for 2.' },
    roomba: { name: 'Robo Butler', trick: 'Polish', icon: '🤖', col: '#2ee6d6', flair: 'wings', fx: { k: 'block', v: 3 }, text: 'Every trick also gives you 3 Block.' },
  };
  for (const id in PEV_FORMS) PEV_FORMS[id].id = id;
  // A pet that may evolve now: at the top level, not evolved yet.
  const pevCan = (p) => !!(p && typeof p === 'object' && PETS[p.id] && PEV_FORMS[p.id] && !p.evo && petLevel(p.xp) >= PEV_K.lv);
  const pevOn = (p) => !!(p && typeof p === 'object' && p.evo && PEV_FORMS[p.id]);
  // The gold fee: by act (3 and Endless loops at the act 3 price), x shopK x the Price Hike.
  function pevFee(act, hike) {
    const a = U.clamp(act | 0, 1, 3);
    return Math.round((PEV_K.gold[a] || 120) * (ECONOMY.shopK || 1) * (1 + Math.max(0, +hike || 0)));
  }
  // The trick's strength: the level's, plus PEV_K.pow once evolved.
  const pevPow = (lv, evo) => petPow(lv) + (evo ? PEV_K.pow : 0);
  const TRD = { K: TRD_K, RANK: TRD_RANK, RAR: TRD_RAR, value: trdValue, tradable: trdTradable, swapRule: trdSwapRule, swapFor: trdSwapFor, relicOk: trdRelicOk,
    relicFor: trdRelicFor, bundleRar: trdBundleRar, bundleFor: trdBundleFor, roll: trdRoll, fix: trdFix };
  const PEV = { K: PEV_K, FORMS: PEV_FORMS, can: pevCan, on: pevOn, fee: pevFee, pow: pevPow };
  // ================================================================ /TRD

  // ================================================================ DEP (round 15): the Neon Depths
  /* The flooded basement under the Clawspire, a fourth biome for Endless
     (DESIGN.md "The Neon Depths (round 15)"). From Loop 3, every third loop
     (3, 6, 9 ...) dives into the Depths; the classic biomes carry on in
     order between the dives (cellar, foundry, DEPTHS, vault, cellar, DEPTHS,
     foundry, vault, DEPTHS ...). A dive plays at act 3 strength (run.act 3
     keeps every act-keyed rule) on its own map biome ('depths') with its
     own pools, plus a danger dial on top (DEP_K.hpK / dmgK). The monsters
     play with the water in the cabinet (COMBAT's DEP block decides, the
     game's DEP block stages it):
     - lure {v}: the Angler Token drops an Old Boot and hangs its lure over
       it: next turn the claw drifts toward the light (grab the boot out and
       the lure has nothing to hang over).
     - jellies {n, v}: the Jellyfish Coin drifts n jellies into the bin (junk
       that floats); each stings the claw that touches it for v (x its hits),
       once a grab. Delivered, a jelly stings them instead.
     - pinch {n}: the Crab Changer pinches your n best prizes and drags them
       along the floor to the far wall; whatever is still pinched when the
       enemy phase ends goes into its shell (the belly rules).
     - shock {v}: the Volt Eel electrifies the water for your next turn: a
       prize the claw lifted from under the waterline shocks you for v.
     - decoy {n, v}: the Sunken Mimic scatters n look-alike chests; one holds
       treasure (gold and Block), the rest bite the hand that delivers them.
     - sig 'tide' (The Drowned Jukebox, High Tide): for your next turn the
       water rises and falls with its music between tide.lo and tide.hi of
       the bin (heavy prizes sink, light ones float up and drift away). */
  const DEP_K = {
    from: 3, every: 3,                 // the first dive, and the loops between dives
    hpK: 1.1, dmgK: 1.1,               // the Depths hit harder than the act 3 pools they stand in for
    water: 0.16,                       // the standing water in a Depths cabinet (share of the bin's height)
    tide: { lo: 0.14, hi: 0.62, hiRage: 0.74, beats: 8, bpm: 88, rageK: 1.5 },
    real: { gold: 12, block: 8 },      // the Sunken Mimic's one real chest
    jelly: 5,                          // a delivered jelly's sting on a random enemy
    dive: 1500,                        // score per Drowned Jukebox unplugged (run.sc.dep)
    boss: 'dep_jukebox',
    name: 'The Neon Depths', sub: 'The flooded basement under the Clawspire',
  };
  const DEP_KINDS = ['lure', 'jellies', 'pinch', 'shock', 'decoy'];
  // Is this Endless loop a dive? How many dives up to it? Its act (3 for a dive, else the classic cycle without the dives).
  const depLoop = (loop) => { loop = Math.floor(+loop || 0); return loop >= DEP_K.from && (loop - DEP_K.from) % DEP_K.every === 0; };
  const depDives = (loop) => { loop = Math.floor(+loop || 0); return loop < DEP_K.from ? 0 : Math.floor((loop - DEP_K.from) / DEP_K.every) + 1; };
  const depAct = (loop) => (depLoop(loop) ? 3 : endlessAct(Math.max(1, Math.floor(+loop || 1) - depDives(loop))));
  const depMv = (id, name, k, txt, extra) => Object.assign({ id, name, k, txt }, extra || {});
  const DEP_ENEMIES = [
    { id: 'dep_angler', dep: 'angler', name: 'Angler Token', act: 3, tier: 'normal', hp: [66, 78], art: 'wisp', look: 'dep_angler', size: 0.95, color: '#1f4a6a', color2: '#ffe066', color3: '#2ee6d6',
      desc: 'A sunken arcade token with a lantern on a rod. It dangles the light over the junk in your bin, and your claw follows it like a moth.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [depMv('lure', 'Dangle the Lure', 'lure', 'Hangs its lure over an Old Boot: next turn your claw drifts toward the light', { v: 1, item: 'dep_boot' }),
        atk('chomp', 'Lantern Chomp', 17, 1, 'Chomps for 17'), debuff('glare', 'Deep Glare', 'weak', 2, 'Glares from the deep (Weak 2)'),
        atk('snap', 'Snap Bite', 7, 2, 'Snap bites: 7 x2')] },
    { id: 'dep_jelly', dep: 'jelly', name: 'Jellyfish Coin', act: 3, tier: 'normal', hp: [58, 70], art: 'jelly', look: 'dep_jelly', size: 0.9, color: '#ffc94d', color2: '#ff6bd6', color3: '#8dfff5',
      desc: 'A gold token that grew a jellyfish. It drifts its little ones into your bin, and every one of them stings the claw that touches it.', ai: 'cycle', pattern: [0, 1, 2, 1, 3],
      moves: [depMv('drift', 'Drift Jellies', 'jellies', 'Drifts 2 jellies into your bin: each stings your claw when it touches it', { n: 2, v: 2 }),
        atk('sting', 'Sting', 6, 3, 'Stings: 6 x3'), debuff('venom', 'Venom Bell', 'poison', 5, 'Rings its venom bell (5 Poison)'),
        blk('pulse', 'Pulse', 14, 'Pulses into a ball (Block 14)')] },
    { id: 'dep_crab', dep: 'crab', name: 'Crab Changer', act: 3, tier: 'normal', hp: [74, 86], art: 'crab', look: 'dep_crab', size: 1, color: '#ff6b4a', color2: '#9aa6b8', color3: '#ffc94d',
      desc: 'A hermit crab living in a coin changer. It pinches your best prizes and drags them off along the floor. Whatever is still pinched when your turn ends goes into its shell.', ai: 'cycle', pattern: [0, 1, 2, 0, 3],
      moves: [depMv('pinch', 'Pinch', 'pinch', 'Pinches your 2 best items and drags them away: grab them back before your turn ends', { n: 2 }),
        atk('clack', 'Claw Clack', 8, 2, 'Clacks: 8 x2'), blk('shell', 'Into the Shell', 16, 'Hides in its shell (Block 16)'),
        atk('crush', 'Crusher Claw', 19, 1, 'Crusher claw for 19')] },
    { id: 'dep_eel', dep: 'eel', name: 'Volt Eel', act: 3, tier: 'normal', hp: [68, 80], art: 'magbat', look: 'dep_eel', size: 1, color: '#2ee6d6', color2: '#ff2e88', color3: '#ffe066',
      desc: 'A neon sign tube that learned to swim. It lights up the water: every wet prize you pull out of it gives you a shock.', ai: 'cycle', pattern: [0, 1, 2, 3, 1],
      moves: [depMv('livewire', 'Live Wire', 'shock', 'Electrifies the water: next turn every wet prize you deliver shocks you', { v: 3 }),
        atk('lash', 'Zap Lash', 9, 2, 'Zap lash: 9 x2'), debuff('static', 'Static Cling', 'vuln', 2, 'Static cling (Vulnerable 2)'),
        depMv('surge', 'Power Surge', 'charge', 'Powering up (38 next turn)', { v: 38 })] },
    { id: 'dep_mimic', dep: 'mimic', name: 'Sunken Mimic', act: 3, tier: 'elite', hp: [182, 196], art: 'mimic', look: 'dep_mimic', size: 1.15, color: '#8a5a2b', color2: '#2ee6d6', color3: '#ffc94d',
      desc: 'A treasure chest that sank with the arcade and grew barnacles and a grudge. It scatters look-alike chests into your bin: one holds treasure, the others bite.', ai: 'cycle', pattern: [0, 1, 2, 3, 0, 4, 5],
      taunt: 'Go on. Open one. Open them all.',
      enrage: { name: 'DAVY JONES', text: 'Every chest in the deep snaps open at once', str: 2 },
      moves: [depMv('decoy', 'Sunken Treasure', 'decoy', 'Scatters 3 chests into your bin: one holds treasure, the others bite the hand that delivers them', { n: 3, v: 6 }),
        atk('lid', 'Lid Slam', 26, 1, 'Lid slam for 26'), gulp('gulp', 'Swallow', 1, 'shiny', 'Swallows your rarest item'),
        atk('barnacle', 'Barnacle Barrage', 8, 3, 'Barnacle barrage: 8 x3'), depMv('breath', 'Deep Breath', 'charge', 'Taking a deep breath (54 next turn)', { v: 54 }),
        blk('clamp', 'Clamp Shut', 22, 'Clamps shut (Block 22)')] },
    { id: 'dep_jukebox', dep: 'jukebox', name: 'The Drowned Jukebox', act: 3, tier: 'boss', hp: [150, 150], art: 'furnace', look: 'dep_jukebox', size: 1, color: '#ff6bd6', color2: '#2ee6d6', color3: '#ffc94d',
      desc: 'The basement jukebox, flooded to the coin slot and still playing. The water in your cabinet rises and falls with its music: heavy prizes sink, light ones float away.', ai: 'cycle',
      taunt: 'Now spinning: your last song.',
      // Boss signature: High Tide. For your next turn the water in the cabinet rises and falls with its music.
      sig: { id: 'tide', name: 'High Tide', sign: 'HIGH TIDE', shout: 'DROP THE BASS!', text: 'floods your cabinet: the water rises and falls with the music', first: 1, every: 2 },
      pattern: [0, 2, 1, 4, 3, 5, 6, 7, 0],
      enrage: { name: 'B-SIDE', text: 'The record flips. The tide comes in faster.', str: 2, pattern: [0, 7, 5, 6, 1, 2] },
      moves: [atk('bass', 'Bass Drop', 11, 3, 'Bass drop: 11 x3'), depMv('dep_jelly', 'Jelly Jam', 'summon', 'Calls a Jellyfish Coin'),
        debuff('feedback', 'Feedback', 'weak', 2, 'Feedback squeal (Weak 2)'), blk('seal', 'Waterproof Case', 26, 'Seals its case (Block 26)'),
        depMv('splash', 'Splash Down', 'shake', 'Splashes the cabinet. Your bin rattles.'),
        depMv('crank', 'Crank It Up', 'charge', 'Cranking the volume (38 next turn)', { v: 38 }),
        atk('scratch', 'Needle Scratch', 24, 1, 'Needle scratch for 24'),
        depMv('pour', 'Pour Jellies', 'jellies', 'Pours 2 jellies into your bin: each stings your claw when it touches it', { n: 2, v: 2 })] },
  ];
  for (const e of DEP_ENEMIES) ENEMIES[e.id] = Object.assign({ size: 1 }, e);
  // The Depths' pools (not in ENCOUNTERS, which stays act-keyed): normals run easy -> hard, like every act's.
  const DEP_ENC = {
    normal: [['dep_jelly', 'dep_jelly'], ['dep_angler'], ['dep_crab'], ['dep_eel'], ['dep_jelly', 'dep_angler'], ['dep_crab', 'dep_jelly'],
      ['dep_eel', 'dep_jelly'], ['dep_angler', 'dep_crab'], ['dep_eel', 'dep_angler'], ['dep_crab', 'dep_eel']],
    elite: [['dep_mimic'], ['dep_mimic', 'dep_jelly']],
    boss: [['dep_jukebox']],
  };
  const depEnc = () => DEP_ENC;
  // The monsters' junk: reachable as ITEMS[id], never listed (no pool, shop or Prizedex sees them).
  const depItem = (d) => Object.defineProperty(ITEMS, d.id, { value: Object.assign({ density: 1, friction: 0.5, restitution: 0.1, target: 'none', tags: ['junk'], rarity: 'junk', cost: 0, exhaust: true, fx: [] }, d),
    enumerable: false, configurable: true, writable: true });
  depItem({ id: 'dep_boot', name: 'Old Boot', tags: ['junk', 'heavy'], shape: box(40, 30), density: 1.5, friction: 0.7, color: '#6a5a3a', color2: '#2e6a5a', art: 'boot', dep: 'boot',
    text: 'A waterlogged boot, the Angler Token\'s bait. Its lure hangs over it; grab the boot out and the lure has nothing to hang over.' });
  depItem({ id: 'dep_jellyling', name: 'Jelly', tags: ['junk', 'light'], shape: circle(16), density: 0.55, friction: 0.35, restitution: 0.3, color: '#ff6bd6', color2: '#8dfff5', art: 'orb', dep: 'jelly',
    target: 'random', fx: [{ k: 'dmg', v: DEP_K.jelly }],
    text: 'A little jellyfish. It stings the claw that touches it. Delivered, it stings a random enemy for {v} instead.' });
  depItem({ id: 'dep_chest', name: 'Sunken Chest', tags: ['junk', 'heavy'], shape: box(38, 30), density: 1.3, friction: 0.6, color: '#8a5a2b', color2: '#ffc94d', art: 'rock', dep: 'chest',
    text: 'One of the Sunken Mimic\'s chests. One of them holds treasure. The others bite the hand that delivers them.' });
  // The Codex: the floor, its boss and its five monsters.
  function depLorePages() {
    return [
      { id: 'fl_depths', ch: 'floors', name: 'The Neon Depths', art: { k: 'act', act: 3, dep: 1 }, r: ['seen', 'dep_jelly'], hint: 'Keep playing past the Prize Master until the machine forgets to drain.',
        text: 'Under the Clawspire there is a basement nobody mentions, and under the basement there is water. The pipes gave up years ago. The arcade down there kept its power and lost its floor: cabinets stand knee deep in green light, their screens still playing to the fish. Kelp grew out of the carpet. The prizes that sank learned to swim. Every third time the machine reboots, it forgets to drain, and the loop dives into the Depths instead.' },
      { id: 'bo_jukebox', ch: 'bosses', name: 'The Drowned Jukebox', art: { k: 'enemy', id: 'dep_jukebox', act: 3, dep: 1 }, r: ['kills', 'dep_jukebox', 1],
        text: 'The basement jukebox was playing when the pipes burst, and it never stopped. It sits in the deep end with water up to its coin slot, flipping records nobody picked, and the whole flooded floor moves to its music. When the bass drops, the tide comes in: heavy prizes sink to the bottom, light ones drift off toward the far wall. It does not want to hurt anybody. It just wants one more quarter, and one more song, forever.' },
      { id: 'be_dep_angler', ch: 'bestiary', name: 'Angler Token', art: { k: 'enemy', id: 'dep_angler', act: 3, dep: 1 }, r: ['kills', 'dep_angler', 5],
        text: 'An arcade token that sank to the bottom and grew a lantern on a stick. The Angler Token dangles its little light over the junk in your bin, and your claw, which has never been able to resist a glowing thing, drifts after it. Steer against the pull or fish the bait out. Anglers are not clever, exactly. They have just noticed that Crawlers and moths make the same face when they see a light.' },
      { id: 'be_dep_jelly', ch: 'bestiary', name: 'Jellyfish Coin', art: { k: 'enemy', id: 'dep_jelly', act: 3, dep: 1 }, r: ['kills', 'dep_jelly', 5],
        text: 'A gold coin that drifted into the Depths and grew a skirt of glowing tentacles. Jellyfish Coins breed in the coin returns and send their little ones floating into your bin, where they bob about looking harmless and sting any claw that brushes them. Grab one out and it stings the other side instead. They are not angry. They are ninety five percent water and five percent static, and the static does all the talking.' },
      { id: 'be_dep_crab', ch: 'bestiary', name: 'Crab Changer', art: { k: 'enemy', id: 'dep_crab', act: 3, dep: 1 }, r: ['kills', 'dep_crab', 5],
        text: 'A hermit crab that moved into a broken coin changer and liked the acoustics. It pinches your best prizes and drags them along the floor to its corner, clacking happily the whole way. Whatever is still pinched when your turn ends goes into its shell, at least until you knock it back out of there. It gives change for nothing. It has never given change. It just likes the sound of coins.' },
      { id: 'be_dep_eel', ch: 'bestiary', name: 'Volt Eel', art: { k: 'enemy', id: 'dep_eel', act: 3, dep: 1 }, r: ['kills', 'dep_eel', 5],
        text: 'A neon sign tube that fell into the Depths, lit up, and decided it liked being a fish. The Volt Eel coils through the flooded cabinets humming at mains voltage. When it charges the water, every wet prize you pull out gives you a jolt on the way down the chute. Grab from the top of the pile, where it is dry. Old Crawlers say the eel used to spell OPEN. Now it mostly spells OUCH.' },
      { id: 'be_dep_mimic', ch: 'bestiary', name: 'Sunken Mimic', art: { k: 'enemy', id: 'dep_mimic', act: 3, dep: 1 }, r: ['kills', 'dep_mimic', 3],
        text: 'A treasure chest that sank with the arcade and grew barnacles and a grudge. The Sunken Mimic scatters look-alike chests into your bin. One of them really does hold treasure; the others have teeth. The real one glints when it thinks nobody is looking. Deliver a biter and it bites the hand that won it. It has waited at the bottom for a very long time, and it has learned to be patient, and a little mean.' },
    ];
  }
  // meta.dep: {dives (Depths loops entered), jukebox (Drowned Jukeboxes beaten), best (the deepest dive's loop)}; junk is repaired.
  function depFix(o) {
    const s = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    const n = (v) => Math.max(0, Math.min(1e9, Math.floor(+v) || 0));
    return { dives: n(s.dives), jukebox: n(s.jukebox), best: n(s.best) };
  }
  // One sticker (the board's cap moved from 60 to 61 for it).
  for (const a of [
    A_('deep_diver', 'Deep Diver', '\u{1F93F}', '#2ee6d6', 'Unplug The Drowned Jukebox in the Neon Depths.', (c) => (((c.meta && c.meta.dep) || {}).jukebox | 0) >= 1),
  ]) if (!ACHIEVEMENTS[a.id]) { ACH_LIST.push(a); ACHIEVEMENTS[a.id] = a; ACH_IDS.push(a.id); }
  const DEP = { K: DEP_K, KINDS: DEP_KINDS, ENEMIES: DEP_ENEMIES, ENC: DEP_ENC, loop: depLoop, dives: depDives, act: depAct, enc: depEnc, fix: depFix, lore: depLorePages };
  // ================================================================ /DEP

  return {
    // SCHOOL (round 11): Claw School and the Practice Cabinet (DESIGN.md "Claw School and the Practice Cabinet (round 11)")
    SCH, SCH_LESSONS, SCH_CH, SCH_IDS, schMatch, schEval, schStars, schStarText, schPay, schTotal, schLessonStars, schOpen, schChOpen, schGrade, schFix,
    // DUO (round 11): pass and play for two (DESIGN.md "Duo: pass and play (round 11)")
    DUO, duoName, duoKey, duoColor, duoCard, duoTaunt, duoPlayers, duoPile, duoDropScore, duoDeck, duoDrawCards, duoRoundWin, duoMatch, duoStarter, duoToss, duoBosses, duoFix, duoRecord, duoBoard,
    duoNetCode, duoNetJoinParam, duoNetPlayer, duoNetOnline,   // DUO NET (round 15): online co-op
    // the Boss Rush and the ghost race (DESIGN.md "Boss Rush and the ghost race (round 10)")
    RUSH, rushOrder, rushActOf, rushHpK, rushDmgK, rushTierK, rushKit, rushDraftKinds, rushScore, rushFmt, rushFix, rushRecord, rushBoard,
    GHO, ghoCp, ghoRead, ghoRecFix, ghoFix, ghoAt, ghoDelta, ghoPassed, ghoSeries,
    // lore and the weekly challenge (DESIGN.md "Lore and the weekly challenge (round 9)")
    LORE_CH, LORE_RULES, LORE_ART, LORE_MARKS, LORE_SNIPS, LORE_ACTS, loreBook, loreVal, loreOk, loreCheck, loreChOpen, loreHint, loreFix, loreCount, loreProgress,
    loreSnippet, loreInitials, loreBoard, loreIntro,
    WK, wkDate, wkIso, wkKey, wkParse, wkSeed, wkLeft, wkDef, wkMedal, wkRank, wkFix, wkCabinet, wkMedalCount,
    // enemy families (DESIGN.md "Enemy families (round 9)")
    FAM, FAM_IDS, FAM_KINDS, FAM_ENEMIES, famOf, famsIn,
    // Mama Mech and two new claws (DESIGN.md "Mama Mech and two new claws (round 8)")
    CR8,
    // ROS (round 10): Ms. Bubbles, the mutator pack, three pets (DESIGN.md "Ms. Bubbles, the mutator pack and three pets (round 10)")
    ROS, rosMutMerge,
    // LEG (round 12): legendary relics, ten more evolutions, animated cabinets (DESIGN.md "Legends (round 12)")
    LEG,
    // TECH (round 17): Cabinet Tech and Joy Stick (DESIGN.md "Cabinet Tech and the new crawler (round 17)")
    TECH, techMods,
    // TRD (round 14): the Trading Post and pet evolution (DESIGN.md "The Trading Post and pet evolution (round 14)")
    TRD, PEV, TRD_K, PEV_K, PEV_FORMS, trdValue, trdRoll, trdFix, pevCan, pevOn, pevFee, pevPow,
    // DEP (round 15): the Neon Depths, Endless's fourth biome (DESIGN.md "The Neon Depths (round 15)")
    DEP, DEP_K, DEP_KINDS, DEP_ENEMIES, DEP_ENC, depLoop, depDives, depAct, depEnc, depFix,
    // run history and the death recap (DESIGN.md "Run history, the death recap and photo mode (round 8)")
    HIS, hisRecFix, hisFix, hisPush, hisRank, hisFilter, hisChart, hisMapPack, hisMapCells, hisKillLine, hisTips, hisWon,
    // stories, the rival, alternate bosses (DESIGN.md "Stories, the rival and alternate bosses (round 8)")
    STO, STORIES, STORY_IDS, STO_ENEMIES, STO_ICE, stoBeatText, stoOk, stoChoose, stoStage, stoDue, stoPick, stoFix, stoAltOf, GARY, GARY_LINES, garyGear, garyTaunt, garyVal, garyPile, garyPrize, garyFix,
    // seasonal events (DESIGN.md "Seasonal events (round 7)")
    SEASONS, SEASON_IDS, SEA_K, SEA_ITEMS, SEA_RELICS, SEA_ENEMIES, SEA_COSMETIC_IDS, seasonAt, seasonWindow, seasonLeft, seaFix, seaEarn, seaTreatRoll, seaCosmetics, seaCostumeOf,
    // Winter Wonderclaw (DESIGN.md "Winter Wonderclaw (round 12)")
    WIN_K, WIN_ITEMS, WIN_RELICS, WIN_ENEMIES, WIN_COSMETIC_IDS, winAdvFix, winAdventRoll, winGiftPool,
    // item evolutions and pet synergies (DESIGN.md "Evolutions and pet synergies (round 7)")
    EVOLVED, EVOLUTIONS, EVO_IDS, EVO_FX, EVO_COMBOS, evoOf, evoReady, evoAuraIds, evoMetaFix, evoProc, PET_SYN, petSynOn,
    // the secret act (DESIGN.md "Secret act (round 6)")
    SECRET, secKinds, secFix, secKeyN, secShopStock,
    // relic sets, the boon draft, the Compactor (DESIGN.md "Sets, boons and the Compactor")
    SETS, SET_IDS, SET_FX, SET_PULL, setOf, setCount, setProgress, setFxIds, setWant, setTagOf, BOONS, BOON_IDS, BOON_SLOTS, boonOffer, CMP, cmpRule, cmpRoll,
    // companion pets (DESIGN.md "Pets")
    PETS, PET_IDS, PET_XP, PET_MAX, PET_GAIN, PET_SHOP, petLevel, petNext, petPow, petUses, petLook, petEgg, petGlow, petName, petNew, petFix, petOffer, petText,
    // the Prize Vault (DESIGN.md "Prize Vault"): cosmetics, prices, the Vault Capsule
    VAULT, VAULT_CATS, VAULT_DEFAULT, COSMETICS, COSMETIC_IDS, vaultList, vaultPrice, vaultPool, vaultHow, vaultForSticker, vaultRoll,
    // endless mode and run mutators (DESIGN.md "Endless and mutators")
    MUTATORS, MUT_IDS, MUT_MAX, mutMods, mutMult, mutClean, mutClash, mutPick, dailyMutators, ENDLESS, endlessScale, endlessAct, endlessMix, SCORE, runMode, runScore,
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

// ================================================================ GACHA (round 17): Capsule fever
/* DESIGN.md "Capsule fever (round 17)". Capsule Minis: little collectible
   figurines tucked into capsules. Pure looks and collection: a mini never
   touches a run (no power), and rolling one never touches the capsule's own
   tiers or prize (it is rolled from its own stream at the burst). Four
   series of six; a finished series pays a Prize Vault cosmetic (a rainbow
   one, else vault tickets). Dupes turn into vault tickets. look is read by
   RENDER.gacha only. */
DATA.GACHA = (() => {
  'use strict';
  const SERIES = [
    { id: 'arcade', name: 'Arcade Pals', icon: '\u{1F579}', col: '#2ee6d6', reward: 'mq_rainbow' },
    { id: 'snacks', name: 'Spire Snacks', icon: '\u{1F369}', col: '#ff9ec7', reward: 'trail_rainbow' },
    { id: 'neon', name: 'Neon Beasts', icon: '\u{1F308}', col: '#9b7bff', reward: 'skin_rainbow' },
    { id: 'lucky', name: 'Lucky Charms', icon: '\u{1F340}', col: '#a6ff5e', reward: 'paint_rainbow' },
  ];
  const M_ = (id, series, name, rarity, body, c1, c2, text) => ({ id, series, name, rarity, text, look: { body, c1, c2 } });
  const LIST = [
    M_('coin_critter', 'arcade', 'Coin Critter', 'c', 'coin', '#ffc94d', '#b8860b', 'Rolls under every machine. Never comes back out.'),
    M_('ticket_tot', 'arcade', 'Ticket Tot', 'c', 'ticket', '#ff9ec7', '#c2185b', 'Worth exactly one ticket. Knows it.'),
    M_('joy_jr', 'arcade', 'Joystick Jr', 'u', 'joystick', '#ff2e88', '#2a1a4a', 'Up, up, down, down. Then a nap.'),
    M_('pixel_ghost', 'arcade', 'Pixel Ghost', 'u', 'ghost', '#c3adff', '#6b4bd8', 'Haunts the high score table. Only the top spot.'),
    M_('prize_duck', 'arcade', 'Prize Duck', 'r', 'duck', '#ffe14d', '#ff8a1f', 'The rubber duck every claw is secretly after.'),
    M_('golden_claw', 'arcade', 'Golden Claw', 'l', 'claw', '#ffc94d', '#fff1a8', 'It never drops anything. Ever.'),
    M_('gummy_bear', 'snacks', 'Gummy Bear', 'c', 'bear', '#ff5a4a', '#b3261e', 'Chewy, brave, a little sticky.'),
    M_('popcorn_puff', 'snacks', 'Popcorn Puff', 'c', 'popcorn', '#fff4d6', '#ff2e88', 'Pops when surprised. Always surprised.'),
    M_('donut_pup', 'snacks', 'Donut Pup', 'u', 'donut', '#e0a060', '#ff6bb0', 'Good boy. Glazed boy.'),
    M_('soda_slime', 'snacks', 'Soda Slime', 'u', 'soda', '#2ee6d6', '#ff2e88', 'Fizzy, bubbly, slightly flat on Mondays.'),
    M_('cupcake_king', 'snacks', 'Cupcake King', 'r', 'cupcake', '#ff9ec7', '#8a4b2a', 'Rules a kingdom of crumbs.'),
    M_('golden_gumball', 'snacks', 'Golden Gumball', 'l', 'gumball', '#ffc94d', '#ff2e88', 'One coin, one gumball, one legend.'),
    M_('glow_frog', 'neon', 'Glow Frog', 'c', 'frog', '#a6ff5e', '#2f8a2a', 'Ribbits in neon green.'),
    M_('neon_cat', 'neon', 'Neon Cat', 'c', 'cat', '#ff2e88', '#ffd6ea', 'Nine lives, all of them lit.'),
    M_('laser_bunny', 'neon', 'Laser Bunny', 'u', 'bunny', '#8dfff5', '#ff2e88', 'Hops at the speed of light. Mostly sideways.'),
    M_('volt_bat', 'neon', 'Volt Bat', 'u', 'bat', '#9b7bff', '#ffe14d', 'Hangs upside down from power lines.'),
    M_('disco_crab', 'neon', 'Disco Crab', 'r', 'crab', '#ff5a4a', '#ffc94d', 'Only dances sideways. Dances all night.'),
    M_('rainbow_dragon', 'neon', 'Rainbow Dragon', 'l', 'dragon', '#ff6bb0', '#8dfff5', 'Breathes every colour at once.'),
    M_('clover_sprout', 'lucky', 'Clover Sprout', 'c', 'clover', '#a6ff5e', '#2f8a2a', 'Four leaves. Counted twice.'),
    M_('lucky_dice', 'lucky', 'Lucky Dice', 'c', 'dice', '#ffffff', '#ff2e88', 'Always lands on six. Please do not check.'),
    M_('horseshoe_hero', 'lucky', 'Horseshoe Hero', 'u', 'horseshoe', '#b9b0cc', '#ffc94d', 'Holds all the luck in. Upside up.'),
    M_('wish_star', 'lucky', 'Wish Star', 'u', 'star', '#ffe14d', '#ff9ec7', 'Grants one wish. The wish is "more capsules".'),
    M_('fortune_cat', 'lucky', 'Fortune Cat', 'r', 'maneki', '#ffffff', '#ff2e88', 'Waves in the jackpots. Paw never gets tired.'),
    M_('jackpot_seven', 'lucky', 'Jackpot Seven', 'l', 'seven', '#ff2e88', '#ffc94d', 'Three of him and the whole tower lights up.'),
  ];
  const MINIS = {};
  for (const m of LIST) MINIS[m.id] = m;
  const MINI_IDS = LIST.map((m) => m.id);
  // The chance a run capsule has a mini tucked in, by the capsule's tier (a Vault or daily capsule always has one).
  const CHANCE = { c: 0.3, u: 0.45, r: 0.7, l: 1 };
  // The mini's rarity by the capsule's tier.
  const W = { c: { c: 62, u: 28, r: 8, l: 2 }, u: { c: 40, u: 38, r: 17, l: 5 }, r: { c: 20, u: 36, r: 32, l: 12 }, l: { c: 0, u: 20, r: 40, l: 40 } };
  const DUPE = { c: 3, u: 6, r: 12, l: 30 };   // vault tickets for a mini you already have
  const SERIES_TIX = 150;                      // a finished series whose cosmetic you already own
  const DAILY_TIX = 5;                         // the daily capsule's streak bonus: 5 per day in a row, up to 7 days
  const DAILY_MAX = 7;
  const TEASE = 0.2;                           // a common or uncommon capsule flickers gold (looks only) this often
  const RAR = ['c', 'u', 'r', 'l'];
  function pickW(rng, w) {
    let tot = 0;
    for (const k of RAR) tot += Math.max(0, w[k] || 0);
    let u = rng() * tot;
    for (const k of RAR) { u -= Math.max(0, w[k] || 0); if (u < 0) return k; }
    return RAR[0];
  }
  // A mini's id for a capsule of tier (rng: its own stream).
  function rollMini(rng, tier) {
    const r = pickW(rng, W[tier] || W.c);
    const pool = MINI_IDS.filter((id) => MINIS[id].rarity === r);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }
  // Does a run capsule of this tier carry a mini? (one draw of its own stream)
  const hasMini = (rng, tier) => rng() < (CHANCE[tier] == null ? CHANCE.c : CHANCE[tier]);
  const seriesOf = (id) => SERIES.find((s) => MINIS[id] && s.id === MINIS[id].series) || null;
  const seriesIds = (sid) => MINI_IDS.filter((id) => MINIS[id].series === sid);
  // The rare tease: a stable yes / no per capsule seed (a string) for a common or uncommon capsule. Looks only.
  function tease(seed, tier) {
    if (tier !== 'c' && tier !== 'u') return false;
    let h = 2166136261 >>> 0;
    const s = 'tease:' + seed;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h % 1000) / 1000 < TEASE;
  }
  return { SERIES, MINIS, MINI_IDS, CHANCE, W, DUPE, SERIES_TIX, DAILY_TIX, DAILY_MAX, TEASE, rollMini, hasMini, seriesOf, seriesIds, tease };
})();
// ================================================================ /GACHA
