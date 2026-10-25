// Stacking Cats: static data (cats, snacks, enemies, unlock rules). No DOM, no randomness.

export const MAX_STACK = 5;
export const MAX_BENCH = 4;
export const BOSS_EVERY = 5;
export const START_CATS = 3;   // cats you pick at the start of a run, one choice of 3 each
export const LVL_MUL = [1, 2.4, 5.6];   // dmg and hp multiplier per cat level
export const AURA_MUL = [1, 1.6, 2.4];  // passive aura strength per level
export const BASE_HP = 90;
export const BASE_DMG = 10;

// atk.t: melee | proj | lob | cone | chain | beam | strike | nova | mine | storm
// dmg is in units of BASE_DMG, cd in seconds, range in px. sup is a second ability (heal).
// pas is a passive: haste/dmg aura for the tower, curse on enemies, dr (damage reduction),
// snack (snack bonus), snackPick (extra snack choice), dodge, revive.
export const CATS = [
  // ---- the five cats everyone starts with ----
  { id: 'tabby', name: 'Tabby', title: 'The Brave One', role: 'Claw', hp: 1.1,
    desc: 'Quick claw swipes that also nick the mouse behind.',
    atk: { t: 'melee', dmg: 1.0, cd: 0.65, range: 80, cleave: 1 },
    art: { fur: '#f2a14e', belly: '#fff0d8', accent: '#e4504a', eye: '#3b8f5a', pat: 'stripes' } },
  { id: 'ember', name: 'Ember', title: 'Flame Whisker', role: 'Flames', hp: 0.9,
    desc: 'Breathes a cone of fire. Burns whole crowds, short range.',
    atk: { t: 'cone', dmg: 0.42, cd: 0.25, range: 128, burn: { dps: 0.5, t: 2 } },
    art: { fur: '#ff7a45', belly: '#ffe3b0', accent: '#ffcc33', eye: '#ffb02e', pat: 'plain' } },
  { id: 'sparky', name: 'Sparky', title: 'Static Shock', role: 'Electric', hp: 0.85,
    desc: 'Chain lightning jumps between up to four mice.',
    atk: { t: 'chain', dmg: 0.9, cd: 0.95, range: 270, jumps: 3, fall: 0.78, stun: 0.25 },
    art: { fur: '#ffe14d', belly: '#fffbe0', accent: '#4aa8ff', eye: '#3a7bff', pat: 'bolt' } },
  { id: 'buckshot', name: 'Buckshot', title: 'The Deputy', role: 'Shotgun', hp: 0.95,
    desc: 'Six pellets per blast. Devastating up close.',
    atk: { t: 'spread', dmg: 0.38, cd: 1.25, range: 235, pellets: 6 },
    art: { fur: '#a58a72', belly: '#efe0cc', accent: '#8a4b2a', eye: '#5a3a1a', pat: 'patch' } },
  { id: 'mochi', name: 'Mochi', title: 'Fluffy Wall', role: 'Tank', hp: 2.2,
    desc: 'Huge and squishy. Soaks hits and makes the whole stack tougher.',
    atk: { t: 'melee', dmg: 0.55, cd: 0.9, range: 70 }, pas: { dr: 0.06, taunt: true },
    art: { fur: '#fdfbff', belly: '#ffe9f1', accent: '#ffa6c1', eye: '#6a5acd', pat: 'plain' } },

  // ---- unlockable ----
  { id: 'yuki', name: 'Yuki', title: 'Snowball Scout', role: 'Frost', hp: 0.9,
    desc: 'Snowballs that slow whatever they hit.',
    atk: { t: 'proj', dmg: 0.75, cd: 1.0, range: 380, speed: 480, color: '#bfeaff', fx: { slow: 0.4, t: 2.2 } },
    art: { fur: '#dff3ff', belly: '#ffffff', accent: '#5bb8ff', eye: '#2f8fe0', pat: 'plain' },
    unlock: { k: 'bestWave', n: 6, text: 'Reach wave 6' } },
  { id: 'hawkeye', name: 'Hawkeye', title: 'Long Shot', role: 'Sniper', hp: 0.8,
    desc: 'One slow, huge shot at the toughest mouse. Ignores armor.',
    atk: { t: 'proj', dmg: 3.6, cd: 2.6, range: 720, speed: 1200, color: '#fff3a0', pierce: 1, target: 'strong', crit: 0.2, pierceArmor: true, r: 5 },
    art: { fur: '#7d8ea3', belly: '#e6edf5', accent: '#2d3e55', eye: '#ffd23f', pat: 'patch' },
    unlock: { k: 'kills', n: 300, text: 'Defeat 300 mice in total' } },
  { id: 'boomer', name: 'Boomer', title: 'Bombardier', role: 'Bomber', hp: 1.0,
    desc: 'Lobs bombs that blow up whole groups.',
    atk: { t: 'lob', dmg: 1.7, cd: 2.0, range: 430, splash: 72, color: '#3b3b4f' },
    art: { fur: '#6b5a8a', belly: '#d9cdf0', accent: '#ff5d5d', eye: '#ff8f3d', pat: 'plain' },
    unlock: { k: 'bossKills', n: 1, text: 'Destroy your first nest' } },
  { id: 'pudding', name: 'Pudding', title: 'Nurse', role: 'Healer', hp: 1.0,
    desc: 'Heals the most hurt cat. Tosses little hearts at mice.',
    atk: { t: 'proj', dmg: 0.35, cd: 1.2, range: 320, speed: 420, color: '#ff9ac6', r: 4 },
    sup: { t: 'heal', pct: 0.14, cd: 2.4 },
    art: { fur: '#ffd1e0', belly: '#fff5f8', accent: '#ff6b9a', eye: '#e0508a', pat: 'plain' },
    unlock: { k: 'recruits', n: 8, text: 'Recruit 8 cats in total' } },
  { id: 'shadow', name: 'Shadow', title: 'Night Blade', role: 'Ninja', hp: 0.8,
    desc: 'Twin shuriken, often critical.',
    atk: { t: 'proj', dmg: 0.4, cd: 0.6, range: 350, speed: 820, color: '#cfd6e6', count: 2, crit: 0.25, r: 4 },
    art: { fur: '#2e2b3c', belly: '#6c6785', accent: '#d4324b', eye: '#ffd23f', pat: 'plain' },
    unlock: { k: 'bestWave', n: 10, text: 'Reach wave 10' } },
  { id: 'ronin', name: 'Ronin', title: 'Wandering Blade', role: 'Samurai', hp: 1.2,
    desc: 'One wide slash cuts every mouse in reach.',
    atk: { t: 'melee', dmg: 2.2, cd: 1.2, range: 112, pierce: true },
    art: { fur: '#e9e4dc', belly: '#ffffff', accent: '#c93a3a', eye: '#2b2b2b', pat: 'tux' },
    unlock: { k: 'bossKills', n: 2, text: 'Destroy 2 nests' } },
  { id: 'merlin', name: 'Merlin', title: 'Arcane Whisker', role: 'Wizard', hp: 0.8,
    desc: 'Homing magic missiles that never miss.',
    atk: { t: 'proj', dmg: 0.8, cd: 0.85, range: 430, speed: 380, color: '#b78bff', count: 2, homing: true, r: 5 },
    art: { fur: '#9b8cd6', belly: '#e8e0ff', accent: '#5b3fd0', eye: '#ffd23f', pat: 'plain' },
    unlock: { k: 'merges', n: 5, text: 'Merge cats 5 times' } },
  { id: 'cutlass', name: 'Cutlass', title: 'Salty Captain', role: 'Pirate', hp: 1.1,
    desc: 'Cannonballs. Always finds one extra snack to choose from.',
    atk: { t: 'lob', dmg: 1.5, cd: 1.7, range: 410, splash: 56, color: '#2c2c36' }, pas: { snackPick: 1 },
    art: { fur: '#c9703a', belly: '#ffe6c9', accent: '#2a3a7a', eye: '#3a2a1a', pat: 'patch' },
    unlock: { k: 'snacks', n: 12, text: 'Eat 12 snacks in total' } },
  { id: 'sprout', name: 'Sprout', title: 'Garden Keeper', role: 'Poison', hp: 1.0,
    desc: 'Thorn seeds that poison. Poison stacks.',
    atk: { t: 'proj', dmg: 0.3, cd: 0.55, range: 310, speed: 520, color: '#8be05a', poison: { dps: 0.55, t: 3.2 }, r: 4 },
    art: { fur: '#a6d96a', belly: '#f1ffd8', accent: '#3f9a3f', eye: '#2f6f2f', pat: 'spots' },
    unlock: { k: 'kills', n: 1000, text: 'Defeat 1000 mice in total' } },
  { id: 'gizmo', name: 'Gizmo', title: 'Tinkerer', role: 'Mines', hp: 1.0,
    desc: 'Plants mines in the path. Mice walk right into them.',
    atk: { t: 'mine', dmg: 2.2, cd: 2.2, splash: 80, max: 4 },
    art: { fur: '#f0c04a', belly: '#fff3c9', accent: '#4a6a8a', eye: '#2a7fb0', pat: 'plain' },
    unlock: { k: 'bossKills', n: 3, text: 'Destroy 3 nests' } },
  { id: 'lyra', name: 'Lyra', title: 'Songstress', role: 'Bard', hp: 0.9,
    desc: 'Her song makes every cat attack faster.',
    atk: { t: 'proj', dmg: 0.5, cd: 0.9, range: 330, speed: 420, color: '#ffe27a', r: 4 }, pas: { haste: 0.12 },
    art: { fur: '#ffb8d9', belly: '#fff0f7', accent: '#8a4bd0', eye: '#8a4bd0', pat: 'plain' },
    unlock: { k: 'recruits', n: 15, text: 'Recruit 15 cats in total' } },
  { id: 'nibbles', name: 'Count Nibbles', title: 'Vampire Lord', role: 'Vampire', hp: 1.0,
    desc: 'Bites heal him and the most hurt cat.',
    atk: { t: 'melee', dmg: 1.1, cd: 0.75, range: 82, lifesteal: 0.25 },
    art: { fur: '#4a3a5a', belly: '#c9b8d8', accent: '#c01c3a', eye: '#ff3b5c', pat: 'plain' },
    unlock: { k: 'bossKills', n: 5, text: 'Destroy 5 nests' } },
  { id: 'zeus', name: 'Zeus', title: 'Storm Caller', role: 'Thunder', hp: 0.9,
    desc: 'Calls lightning down on random mice and stuns them.',
    atk: { t: 'strike', dmg: 2.4, cd: 1.8, range: 620, splash: 48, stun: 0.5 },
    art: { fur: '#bcd4ff', belly: '#f2f7ff', accent: '#ffe14d', eye: '#ffd23f', pat: 'plain' },
    unlock: { k: 'bestWave', n: 15, text: 'Reach wave 15' } },
  { id: 'volcano', name: 'Volcano', title: 'Lava Lord', role: 'Magma', hp: 1.2,
    desc: 'Lava globs leave burning pools on the ground.',
    atk: { t: 'lob', dmg: 1.0, cd: 2.2, range: 390, splash: 52, color: '#ff5a1f', pool: { dps: 0.6, t: 3.5, r: 62 } },
    art: { fur: '#5c3a34', belly: '#c98a70', accent: '#ff5a1f', eye: '#ffb02e', pat: 'plain' },
    unlock: { k: 'lvl3Of', id: 'ember', text: 'Merge Ember up to Lv 3' } },
  { id: 'blizzard', name: 'Blizzard', title: 'Ice Queen', role: 'Freeze', hp: 1.0,
    desc: 'Frost nova freezes everything around the tower.',
    atk: { t: 'nova', dmg: 1.1, cd: 3.2, radius: 230, freeze: 1.3 },
    art: { fur: '#e8f6ff', belly: '#ffffff', accent: '#78c8ff', eye: '#4aa8ff', pat: 'plain' },
    unlock: { k: 'bestWave', n: 20, text: 'Reach wave 20' } },
  { id: 'dusty', name: 'Dusty', title: 'Fastest Paw', role: 'Gunslinger', hp: 0.9,
    desc: 'Fires a six-shooter volley in a blink.',
    atk: { t: 'proj', dmg: 0.5, cd: 2.0, range: 400, speed: 900, color: '#ffe9a0', burst: 6, gap: 0.09, r: 3 },
    art: { fur: '#d9a066', belly: '#fff0dc', accent: '#7a4a2a', eye: '#3a2a1a', pat: 'stripes' },
    unlock: { k: 'kills', n: 3000, text: 'Defeat 3000 mice in total' } },
  { id: 'cyber', name: 'Cyber', title: 'Laser Unit', role: 'Laser', hp: 1.0,
    desc: 'A piercing beam that burns every mouse in a line.',
    atk: { t: 'beam', dmg: 1.3, cd: 1.6, range: 540, pierceArmor: true },
    art: { fur: '#3dd6d0', belly: '#d8fffd', accent: '#ff3bd4', eye: '#ff3bd4', pat: 'plain' },
    unlock: { k: 'bossKills', n: 7, text: 'Destroy 7 nests' } },
  { id: 'boo', name: 'Boo', title: 'Friendly Ghost', role: 'Spirit', hp: 0.85,
    desc: 'Ghost bolts pass through 3 mice and ignore armor. Sometimes dodges.',
    atk: { t: 'proj', dmg: 0.7, cd: 0.9, range: 410, speed: 400, color: '#b9f5ff', pierce: 3, pierceArmor: true, r: 5 }, pas: { dodge: 0.15 },
    art: { fur: '#e9f8ff', belly: '#ffffff', accent: '#7fd8ff', eye: '#2a3a5a', pat: 'plain' },
    unlock: { k: 'flawless', n: 8, text: 'Clear 8 waves with no cat going down' } },
  { id: 'draco', name: 'Draco', title: 'Dragon Cat', role: 'Dragon', hp: 1.3,
    desc: 'Huge fireballs that burn everything they touch.',
    atk: { t: 'lob', dmg: 2.0, cd: 2.2, range: 440, splash: 88, color: '#ff7a1f', burn: { dps: 0.5, t: 2.5 } },
    art: { fur: '#d94a4a', belly: '#ffd9a0', accent: '#ffcc33', eye: '#ffe14d', pat: 'plain' },
    unlock: { k: 'bossKills', n: 10, text: 'Destroy 10 nests' } },
  { id: 'halo', name: 'Halo', title: 'Guardian Angel', role: 'Angel', hp: 1.1,
    desc: 'Once per wave, brings a fallen cat back. Heals the stack a little.',
    atk: { t: 'proj', dmg: 0.6, cd: 1.0, range: 390, speed: 450, color: '#fff6b0', r: 4 },
    sup: { t: 'heal', pct: 0.06, cd: 3 }, pas: { revive: true },
    art: { fur: '#fffaf0', belly: '#ffffff', accent: '#ffd966', eye: '#6aa8ff', pat: 'plain' },
    unlock: { k: 'recruits', n: 30, text: 'Recruit 30 cats in total' } },
  { id: 'mecha', name: 'Mecha', title: 'Rocket Unit', role: 'Rockets', hp: 1.4,
    desc: 'Fires a volley of three rockets that explode.',
    atk: { t: 'proj', dmg: 0.9, cd: 2.6, range: 460, speed: 420, color: '#ff8a4a', burst: 3, gap: 0.18, splash: 44, r: 5 },
    art: { fur: '#9aa6b8', belly: '#e2e8f0', accent: '#ff5d3a', eye: '#4af0ff', pat: 'plain' },
    unlock: { k: 'bestWave', n: 25, text: 'Reach wave 25' } },
  { id: 'hexa', name: 'Hexa', title: 'Hex Witch', role: 'Curse', hp: 0.85,
    desc: 'Curses make every mouse take more damage from every cat.',
    atk: { t: 'proj', dmg: 0.6, cd: 1.0, range: 390, speed: 400, color: '#c06bff', r: 4 }, pas: { curse: 0.10 },
    art: { fur: '#6a3f8f', belly: '#e0c8f5', accent: '#9bff6b', eye: '#9bff6b', pat: 'plain' },
    unlock: { k: 'temp', n: 20, text: 'Eat 20 temporary snacks' } },
  { id: 'nori', name: 'Chef Nori', title: 'Sushi Master', role: 'Chef', hp: 1.1,
    desc: 'Throws sushi. All snack bonuses are 30% stronger.',
    atk: { t: 'lob', dmg: 1.0, cd: 1.3, range: 360, splash: 38, color: '#ff8f8f' }, pas: { snack: 0.3 },
    art: { fur: '#fff0e0', belly: '#ffffff', accent: '#ff6b4a', eye: '#4a6a3a', pat: 'patch' },
    unlock: { k: 'snacks', n: 40, text: 'Eat 40 snacks in total' } },
  { id: 'leo', name: 'King Leo', title: 'The Lion King', role: 'Royal', hp: 1.5,
    desc: 'Royal claws and a mane that powers up all cats.',
    atk: { t: 'melee', dmg: 1.8, cd: 1.0, range: 96, cleave: 2 }, pas: { dmg: 0.12 },
    art: { fur: '#e8b34a', belly: '#fff0c0', accent: '#a8341c', eye: '#7a3a10', pat: 'mane' },
    unlock: { k: 'bossKills', n: 12, text: 'Destroy 12 nests' } },
  { id: 'nebula', name: 'Nebula', title: 'Star Weaver', role: 'Cosmic', hp: 1.0,
    desc: 'Rains five falling stars on random mice.',
    atk: { t: 'storm', dmg: 0.35, cd: 2.0, range: 700, stars: 5, splash: 36 },
    art: { fur: '#3a2f7a', belly: '#9a8de0', accent: '#ffe14d', eye: '#ff9bf0', pat: 'stars' },
    unlock: { k: 'lvl3', n: 10, text: 'Merge cats up to Lv 3, 10 times' } },
];

export const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));
export const STARTERS = CATS.filter((c) => !c.unlock).map((c) => c.id);

// k: perm = lasts the whole run, temp = lasts 3 waves, instant = used at once.
export const SNACKS = [
  { id: 'sushi', name: 'Salmon Sushi', icon: '🍣', kind: 'perm', fx: { dmg: 0.12 }, desc: '+12% damage for the whole run' },
  { id: 'tuna', name: 'Tuna Can', icon: '🥫', kind: 'perm', fx: { hp: 0.15 }, desc: '+15% max health for the whole run' },
  { id: 'catnip', name: 'Catnip Leaf', icon: '🌿', kind: 'perm', fx: { haste: 0.10 }, desc: '+10% attack speed for the whole run' },
  { id: 'milk', name: 'Warm Milk', icon: '🥛', kind: 'perm', fx: { waveHeal: 0.12 }, desc: 'Heal 12% more after every wave' },
  { id: 'kibble', name: 'Crunchy Kibble', icon: '🍘', kind: 'perm', fx: { crit: 0.08 }, desc: '+8% critical chance for the whole run' },
  { id: 'bonito', name: 'Bonito Flakes', icon: '🐟', kind: 'perm', fx: { range: 0.12 }, desc: '+12% range for the whole run' },
  { id: 'golden', name: 'Golden Fish', icon: '🐠', kind: 'perm', fx: {}, nine: true, desc: 'Nine Lives: if the tower falls, everyone gets back up once', rare: true },
  { id: 'pepper', name: 'Spicy Pepper', icon: '🌶️', kind: 'temp', fx: { dmg: 0.45 }, desc: '+45% damage for 3 waves' },
  { id: 'cola', name: 'Cat Cola', icon: '🥤', kind: 'temp', fx: { haste: 0.35 }, desc: '+35% attack speed for 3 waves' },
  { id: 'bone', name: 'Fish Bone Armor', icon: '🦴', kind: 'temp', fx: { dr: 0.30 }, desc: '30% less damage taken for 3 waves' },
  { id: 'icecream', name: 'Frozen Treat', icon: '🍦', kind: 'temp', fx: { slow: 0.22 }, desc: 'Mice move 22% slower for 3 waves' },
  { id: 'yarn', name: 'Rainbow Yarn', icon: '🧶', kind: 'temp', fx: { crit: 0.25, critMul: 0.6 }, desc: '+25% crit chance and bigger crits for 3 waves' },
  { id: 'drumstick', name: 'Big Drumstick', icon: '🍗', kind: 'temp', fx: { dmg: 0.25, hp: 0.2 }, desc: '+25% damage and +20% health for 3 waves' },
  { id: 'megatuna', name: 'Mega Tuna', icon: '🍱', kind: 'instant', fx: {}, heal: 0.6, desc: 'Heals every cat by 60% right now' },
];
export const SNACK_BY_ID = Object.fromEntries(SNACKS.map((s) => [s.id, s]));
export const TEMP_WAVES = 3;

// ai: melee | range | fly | bomb | shaman | nest
export const ENEMY_TYPES = {
  mouse:   { name: 'Mouse',        w: 34, h: 36, hp: 28,  dmg: 6,  cd: 1.0, spd: 46, cost: 1, minWave: 1, wt: 10, ai: 'melee' },
  scout:   { name: 'Zippy Mouse',  w: 28, h: 30, hp: 16,  dmg: 5,  cd: 0.8, spd: 100, cost: 1, minWave: 2, wt: 5, ai: 'melee' },
  slinger: { name: 'Slinger',      w: 34, h: 40, hp: 24,  dmg: 7,  cd: 1.9, spd: 42, cost: 2, minWave: 3, wt: 4, ai: 'range', range: 340 },
  brute:   { name: 'Brute Rat',    w: 66, h: 64, hp: 170, dmg: 16, cd: 1.5, spd: 28, cost: 6, minWave: 4, wt: 2, ai: 'melee' },
  armored: { name: 'Helmet Mouse', w: 40, h: 42, hp: 70,  dmg: 9,  cd: 1.1, spd: 36, cost: 3, minWave: 5, wt: 3, ai: 'melee', armor: 0.4 },
  glider:  { name: 'Glider',       w: 44, h: 34, hp: 30,  dmg: 8,  cd: 1.2, spd: 72, cost: 2, minWave: 6, wt: 3, ai: 'fly', alt: 105 },
  bomber:  { name: 'Bomb Mouse',   w: 36, h: 38, hp: 36,  dmg: 36, cd: 1,   spd: 86, cost: 3, minWave: 7, wt: 3, ai: 'bomb' },
  shaman:  { name: 'Shaman Rat',   w: 40, h: 50, hp: 58,  dmg: 0,  cd: 2.6, spd: 38, cost: 4, minWave: 8, wt: 2, ai: 'shaman', range: 400 },
};

export const NESTS = [
  { id: 'cheese', name: 'Cheese Hut' },
  { id: 'pipe', name: 'Drain Pipe Den' },
  { id: 'castle', name: 'Rat Castle' },
  { id: 'trash', name: 'Trash Tower' },
  { id: 'moon', name: 'Moon Burrow' },
];

export const THEMES = [
  { name: 'Sunny Garden',  sky: ['#8fd3ff', '#fff1c9'], far: '#a9d8b8', mid: '#6fbf8a', ground: ['#8fd36e', '#5fa84f'], dirt: '#a6764a', deco: 'flower' },
  { name: 'Autumn Alley',  sky: ['#ffb58a', '#ffe6b0'], far: '#d99a7a', mid: '#b86a4a', ground: ['#d9a24a', '#a8742f'], dirt: '#7a4a2a', deco: 'leaf' },
  { name: 'Moonlit Roofs', sky: ['#1d1b4a', '#5a4a9a'], far: '#3a3a78', mid: '#2a2a5a', ground: ['#4a5a9a', '#2f3a78'], dirt: '#1f2550', deco: 'star' },
  { name: 'Cheese Caves',  sky: ['#ffd36b', '#fff2b0'], far: '#e0b24a', mid: '#c98f2a', ground: ['#f2c94c', '#c9992a'], dirt: '#8a5f1a', deco: 'hole' },
  { name: 'Frosty Pond',   sky: ['#a8c8ff', '#eaf6ff'], far: '#c9dcf5', mid: '#9ab8e0', ground: ['#e8f4ff', '#bcd8f2'], dirt: '#8aa8c8', deco: 'snow' },
  { name: 'Sakura Hill',   sky: ['#ffc6e0', '#fff0f5'], far: '#f2a6c4', mid: '#e07aa6', ground: ['#a8e08a', '#6fb85f'], dirt: '#a8765a', deco: 'petal' },
];

// ---- meta progression (saved between runs) ----
export function emptyStats() {
  return { runs: 0, kills: 0, bossKills: 0, recruits: 0, merges: 0, lvl3: 0, lvl3Of: {}, snacks: 0, temp: 0, flawless: 0, bestWave: 0 };
}

export function unlockProgress(def, stats) {
  const u = def.unlock;
  if (!u) return { have: 1, need: 1 };
  if (u.k === 'lvl3Of') return { have: stats.lvl3Of && stats.lvl3Of[u.id] ? 1 : 0, need: 1 };
  return { have: Math.min(stats[u.k] || 0, u.n), need: u.n };
}

export function checkUnlocks(stats, unlocked) {
  const fresh = [];
  for (const c of CATS) {
    if (!c.unlock || unlocked.has(c.id)) continue;
    const p = unlockProgress(c, stats);
    if (p.have >= p.need) fresh.push(c.id);
  }
  return fresh;
}

export function mergeRun(stats, run) {
  const s = JSON.parse(JSON.stringify(stats));
  s.runs += 1;
  for (const k of ['kills', 'bossKills', 'recruits', 'merges', 'lvl3', 'snacks', 'temp', 'flawless']) s[k] += run[k] || 0;
  s.bestWave = Math.max(s.bestWave, run.wave || 0);
  for (const id in run.lvl3Of) s.lvl3Of[id] = true;
  return s;
}
