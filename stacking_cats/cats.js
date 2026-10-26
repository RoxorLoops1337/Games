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
    atk: { t: 'proj', dmg: 0.95, cd: 1.0, range: 380, speed: 480, color: '#bfeaff', fx: { slow: 0.4, t: 2.2 } },
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
    atk: { t: 'proj', dmg: 0.55, cd: 1.2, range: 320, speed: 420, color: '#ff9ac6', r: 4 },
    sup: { t: 'heal', pct: 0.16, cd: 2.4 },
    art: { fur: '#ffd1e0', belly: '#fff5f8', accent: '#ff6b9a', eye: '#e0508a', pat: 'plain' },
    unlock: { k: 'recruits', n: 8, text: 'Recruit 8 cats in total' } },
  { id: 'shadow', name: 'Shadow', title: 'Night Blade', role: 'Ninja', hp: 0.8,
    desc: 'Twin shuriken, often critical.',
    atk: { t: 'proj', dmg: 0.52, cd: 0.6, range: 350, speed: 820, color: '#cfd6e6', count: 2, crit: 0.25, r: 4 },
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
    atk: { t: 'proj', dmg: 0.68, cd: 0.9, range: 330, speed: 420, color: '#ffe27a', r: 4 }, pas: { haste: 0.14 },
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
    atk: { t: 'nova', dmg: 1.5, cd: 3.2, radius: 230, freeze: 1.3 },
    art: { fur: '#e8f6ff', belly: '#ffffff', accent: '#78c8ff', eye: '#4aa8ff', pat: 'plain' },
    unlock: { k: 'bestWave', n: 20, text: 'Reach wave 20' } },
  { id: 'dusty', name: 'Dusty', title: 'Fastest Paw', role: 'Gunslinger', hp: 0.9,
    desc: 'Fires a six-shooter volley in a blink.',
    atk: { t: 'proj', dmg: 0.62, cd: 2.0, range: 400, speed: 900, color: '#ffe9a0', burst: 6, gap: 0.09, r: 3 },
    art: { fur: '#d9a066', belly: '#fff0dc', accent: '#7a4a2a', eye: '#3a2a1a', pat: 'stripes' },
    unlock: { k: 'kills', n: 3000, text: 'Defeat 3000 mice in total' } },
  { id: 'cyber', name: 'Cyber', title: 'Laser Unit', role: 'Laser', hp: 1.0,
    desc: 'A piercing beam that burns every mouse in a line.',
    atk: { t: 'beam', dmg: 1.3, cd: 1.6, range: 540, pierceArmor: true },
    art: { fur: '#3dd6d0', belly: '#d8fffd', accent: '#ff3bd4', eye: '#ff3bd4', pat: 'plain' },
    unlock: { k: 'bossKills', n: 7, text: 'Destroy 7 nests' } },
  { id: 'boo', name: 'Boo', title: 'Friendly Ghost', role: 'Spirit', hp: 0.85,
    desc: 'Ghost bolts pass through 3 mice and ignore armor. Sometimes dodges.',
    atk: { t: 'proj', dmg: 0.88, cd: 0.9, range: 410, speed: 400, color: '#b9f5ff', pierce: 3, pierceArmor: true, r: 5 }, pas: { dodge: 0.15 },
    art: { fur: '#e9f8ff', belly: '#ffffff', accent: '#7fd8ff', eye: '#2a3a5a', pat: 'plain' },
    unlock: { k: 'flawless', n: 8, text: 'Clear 8 waves with no cat going down' } },
  { id: 'draco', name: 'Draco', title: 'Dragon Cat', role: 'Dragon', hp: 1.3,
    desc: 'Huge fireballs that burn everything they touch.',
    atk: { t: 'lob', dmg: 2.0, cd: 2.2, range: 440, splash: 88, color: '#ff7a1f', burn: { dps: 0.5, t: 2.5 } },
    art: { fur: '#d94a4a', belly: '#ffd9a0', accent: '#ffcc33', eye: '#ffe14d', pat: 'plain' },
    unlock: { k: 'bossKills', n: 10, text: 'Destroy 10 nests' } },
  { id: 'halo', name: 'Halo', title: 'Guardian Angel', role: 'Angel', hp: 1.1,
    desc: 'Once per wave, brings a fallen cat back. Heals the stack a little.',
    atk: { t: 'proj', dmg: 0.8, cd: 1.0, range: 390, speed: 450, color: '#fff6b0', r: 4 },
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
    atk: { t: 'proj', dmg: 0.82, cd: 1.0, range: 390, speed: 400, color: '#c06bff', r: 4 }, pas: { curse: 0.13 },
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
  { id: 'biscuit', name: 'Biscuit', title: 'Royal Baker', role: 'Baker', hp: 1.1,
    desc: 'Tosses warm loaves that crumble over a small crowd of mice.',
    atk: { t: 'lob', dmg: 1.3, cd: 1.7, range: 410, splash: 54, color: '#e6b26a' },
    art: { fur: '#e0a868', belly: '#fff1d6', accent: '#fffaf0', eye: '#7a4a2a', pat: 'plain' },
    unlock: { k: 'recruits', n: 20, text: 'Recruit 20 cats in total' } },
  { id: 'pearl', name: 'Pearl', title: 'Tide Singer', role: 'Tide', hp: 1.0,
    desc: 'Bubbles that slow whatever they pop on. Slippery: sometimes dodges a bite.',
    atk: { t: 'proj', dmg: 0.95, cd: 1.05, range: 390, speed: 440, color: '#8ff0ff', fx: { slow: 0.3, t: 1.8 } }, pas: { dodge: 0.1 },
    art: { fur: '#bfe9f2', belly: '#ffffff', accent: '#ff9ad0', eye: '#2a8fb0', pat: 'plain' },
    unlock: { k: 'merges', n: 25, text: 'Merge cats 25 times' } },
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
  { id: 'rice', name: 'Rice Ball', icon: '🍙', kind: 'perm', fx: { dmg: 0.07, hp: 0.08 }, desc: '+7% damage and +8% health for the whole run' },
  { id: 'bonito', name: 'Bonito Flakes', icon: '🐟', kind: 'perm', fx: { range: 0.12 }, desc: '+12% range for the whole run' },
  { id: 'golden', name: 'Golden Fish', icon: '🐠', kind: 'perm', fx: {}, nine: true, desc: 'Nine Lives: if the tower falls, everyone gets back up once', rare: true },
  { id: 'pepper', name: 'Spicy Pepper', icon: '🌶️', kind: 'temp', fx: { dmg: 0.45 }, desc: '+45% damage for 3 waves' },
  { id: 'cola', name: 'Cat Cola', icon: '🥤', kind: 'temp', fx: { haste: 0.35 }, desc: '+35% attack speed for 3 waves' },
  { id: 'smoothie', name: 'Berry Smoothie', icon: '🍓', kind: 'temp', fx: { haste: 0.2, range: 0.2 }, desc: '+20% attack speed and range for 3 waves' },
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
  // counters to a one-note tower: dashers leap over the stack to bite the top cat, shield bearers shrug off status effects until the
  // shield breaks, diggers tunnel under the field and cannot be hit until they pop up next to the stack
  dasher:  { name: 'Dash Mouse',   w: 30, h: 32, hp: 22,  dmg: 9,  cd: 1.5, spd: 120, cost: 2, minWave: 9, wt: 3, ai: 'dash', hint: 'Leaps over the stack to bite the top cat' },
  shield:  { name: 'Shield Bearer', w: 46, h: 46, hp: 60, dmg: 9,  cd: 1.2, spd: 34, cost: 4, minWave: 10, wt: 3, ai: 'melee', shield: 1.4, hint: 'Its shield blocks burns, slows and poison until it breaks' },
  digger:  { name: 'Digger',       w: 40, h: 40, hp: 52,  dmg: 15, cd: 1.3, spd: 44, cost: 4, minWave: 12, wt: 2, ai: 'burrow', hint: 'Tunnels under the field and cannot be hit until it pops up' },
};

export const NESTS = [
  { id: 'cheese', name: 'Cheese Hut', trick: 'Lobs cheese bombs and calls for help as it gets hurt' },
  { id: 'pipe', name: 'Drain Pipe Den', trick: 'Floods the field with fast Dash Mice every few seconds' },
  { id: 'castle', name: 'Rat Castle', trick: 'Guards with shields: it takes far less damage while a Shield Bearer stands' },
  { id: 'trash', name: 'Trash Tower', trick: 'Rots and heals itself unless you keep hitting it' },
  { id: 'moon', name: 'Moon Burrow', trick: 'Wraps itself in a moon bubble for a moment: save your big hits' },
];

// amb: ambient light on the first wave of a stage and on the nest wave (the day turns to dusk). grade: colour grading
// laid over the picture (top, bottom). weather: rain, snow, drip or none. haze: distance fog colour.
export const THEMES = [
  { name: 'Sunny Garden',  sky: ['#8fd3ff', '#e6dcb8'], far: '#a9d8b8', mid: '#6fbf8a', ground: ['#8fd36e', '#5fa84f'], dirt: '#a6764a', deco: 'flower', amb: ['#ffffff', '#efc6b8'], grade: ['rgba(255,214,150,.16)', 'rgba(120,200,255,.10)'], weather: 'none', haze: '#cfe4f2' },
  { name: 'Autumn Alley',  sky: ['#ffb58a', '#ffe6b0'], far: '#d99a7a', mid: '#b86a4a', ground: ['#d9a24a', '#a8742f'], dirt: '#7a4a2a', deco: 'leaf', amb: ['#fff6ec', '#e0b0a0'], grade: ['rgba(255,170,90,.18)', 'rgba(140,90,200,.10)'], weather: 'none', haze: '#ffe3c4' },
  { name: 'Moonlit Roofs', sky: ['#1d1b4a', '#4a4088'], far: '#3a3a78', mid: '#2a2a5a', ground: ['#5a6ab0', '#3a4590'], dirt: '#2a3266', deco: 'star', amb: ['#a8a8e8', '#7a6cb8'], grade: ['rgba(80,110,255,.22)', 'rgba(255,120,200,.10)'], weather: 'rain', haze: '#8078c4' },
  { name: 'Cheese Caves',  sky: ['#ffd36b', '#fff2b0'], far: '#e0b24a', mid: '#c98f2a', ground: ['#f2c94c', '#c9992a'], dirt: '#8a5f1a', deco: 'hole', amb: ['#ffe9b8', '#c08a60'], grade: ['rgba(255,190,90,.12)', 'rgba(90,120,220,.14)'], weather: 'drip', haze: '#ffe49a' },
  { name: 'Frosty Pond',   sky: ['#a8c8ff', '#d2e2f4'], far: '#c9dcf5', mid: '#9ab8e0', ground: ['#e8f4ff', '#bcd8f2'], dirt: '#8aa8c8', deco: 'snow', amb: ['#f6faff', '#c8c8f0'], grade: ['rgba(150,200,255,.16)', 'rgba(255,180,230,.10)'], weather: 'snow', haze: '#d4e2f2' },
  { name: 'Sakura Hill',   sky: ['#ffc6e0', '#e8d4dc'], far: '#f2a6c4', mid: '#e07aa6', ground: ['#a8e08a', '#6fb85f'], dirt: '#a8765a', deco: 'petal', amb: ['#fff4fa', '#e8b0c8'], grade: ['rgba(255,160,210,.16)', 'rgba(255,230,150,.10)'], weather: 'none', haze: '#e8cddc' },
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

// ---------------------------------------------------------------- items (equipped on one cat)
// fx keys: dmg hp haste crit critMul range (all as fractions), ls lifesteal, dr damage reduction, regen (maxHp per second),
// thorns (reflect), berserk (extra dmg below half hp), extra (one more shot), burn, slow, stun (chance), coin.
export const ITEMS = [
  { id: 'claws', name: 'Sharpened Claws', icon: '🪝', rarity: 'common', fx: { dmg: 0.20 }, desc: '+20% damage' },
  { id: 'bell', name: 'Swift Bell', icon: '🔔', rarity: 'common', fx: { haste: 0.18 }, desc: '+18% attack speed' },
  { id: 'cushion', name: 'Soft Cushion', icon: '🛏️', rarity: 'common', fx: { hp: 0.30 }, desc: '+30% health' },
  { id: 'clover', name: 'Lucky Clover', icon: '🍀', rarity: 'common', fx: { crit: 0.12 }, desc: '+12% critical chance' },
  { id: 'monocle', name: 'Eagle Monocle', icon: '🧐', rarity: 'common', fx: { range: 0.25 }, desc: '+25% range' },
  { id: 'vest', name: 'Fish Scale Vest', icon: '🦺', rarity: 'common', fx: { dr: 0.15 }, desc: 'Takes 15% less damage' },
  { id: 'mitten', name: 'Warm Mittens', icon: '🧤', rarity: 'common', fx: { hp: 0.15, haste: 0.09 }, desc: '+15% health and +9% attack speed' },
  { id: 'basket', name: 'Cozy Basket', icon: '🧺', rarity: 'common', fx: { hp: 0.12, regen: 0.01 }, desc: '+12% health and heals 1% of its health every second' },
  { id: 'spikes', name: 'Spiky Collar', icon: '📿', rarity: 'common', fx: { thorns: 0.5 }, desc: 'Mice that bite this cat take 50% of their damage back' },
  { id: 'fang', name: 'Vampire Fang', icon: '🦷', rarity: 'rare', fx: { ls: 0.12 }, desc: 'Heals for 12% of the damage it deals' },
  { id: 'heart', name: 'Healing Charm', icon: '💖', rarity: 'rare', fx: { regen: 0.02 }, desc: 'Heals 2% of its health every second' },
  { id: 'scarf', name: 'Berserker Scarf', icon: '🧣', rarity: 'rare', fx: { dmg: 0.08, berserk: 0.5 }, desc: '+8% damage, +50% more below half health' },
  { id: 'whistle', name: 'Twin Whistle', icon: '📯', rarity: 'rare', fx: { extra: 1 }, desc: 'One extra shot, pellet, jump or star with every attack' },
  { id: 'flamering', name: 'Ember Ring', icon: '💍', rarity: 'rare', fx: { burn: 1 }, desc: 'Attacks set mice on fire' },
  { id: 'frost', name: 'Frost Charm', icon: '❄️', rarity: 'rare', fx: { slow: 0.3 }, desc: 'Attacks slow mice by 30%' },
  { id: 'thunder', name: 'Thunder Stone', icon: '🪨', rarity: 'rare', fx: { stun: 0.12 }, desc: '12% chance to stun on every hit' },
  { id: 'ribbon', name: 'Silk Ribbon', icon: '🎀', rarity: 'rare', fx: { dmg: 0.10, crit: 0.10 }, desc: '+10% damage and +10% critical chance' },
  { id: 'shell', name: 'Lucky Shell', icon: '🐚', rarity: 'rare', fx: { dodge: 0.12, hp: 0.08 }, desc: '+12% chance to dodge a bite and +8% health' },
  { id: 'gbell', name: 'Golden Bell', icon: '🛎️', rarity: 'rare', fx: { coin: 0.15 }, desc: '+15% coins from this run' },
  { id: 'crown', name: 'Cheese Crown', icon: '🧀', rarity: 'epic', fx: { dmg: 0.25, hp: 0.25 }, desc: '+25% damage and +25% health' },
  { id: 'hourglass', name: 'Time Hourglass', icon: '⏳', rarity: 'epic', fx: { haste: 0.30, range: 0.10 }, desc: '+30% attack speed, +10% range' },
  { id: 'dragonheart', name: 'Dragon Heart', icon: '🐲', rarity: 'epic', fx: { dmg: 0.30, burn: 1, crit: 0.08 }, desc: '+30% damage, +8% crit, sets mice on fire' },
  { id: 'feather', name: 'Angel Feather', icon: '🪶', rarity: 'epic', fx: { dr: 0.20, regen: 0.015 }, desc: 'Takes 20% less damage and heals 1.5% per second' },
  { id: 'cloak', name: 'Shadow Cloak', icon: '🧥', rarity: 'epic', fx: { dodge: 0.20, haste: 0.12 }, desc: '+20% chance to dodge a bite and +12% attack speed' },
  { id: 'mask', name: "Assassin's Mask", icon: '🎭', rarity: 'epic', fx: { crit: 0.20, critMul: 0.8 }, desc: '+20% crit chance and much bigger crits' },

  // ---- more relics. Each has one clear job: kill effects, conditional damage, barriers, team auras, loot luck, and a few run-changing legends.
  // common
  { id: 'rind', name: 'Cheese Rind', icon: '🍪', rarity: 'common', fx: { kheal: 0.05 }, desc: 'Heals 5% of its health on every kill' },
  { id: 'penny', name: 'Copper Penny', icon: '🏅', rarity: 'common', fx: { kcoin: 0.5 }, desc: '+0.5 coins for every mouse it defeats' },
  { id: 'needle', name: 'Sewing Needle', icon: '🪡', rarity: 'common', fx: { pierce: 1 }, desc: 'Its attacks ignore mouse armor' },
  { id: 'twine', name: 'Ball of Twine', icon: '🎾', rarity: 'common', fx: { kcharge: 0.03 }, desc: 'Each kill charges its special move by 3%' },
  { id: 'sprig', name: 'Catnip Sprig', icon: '🌻', rarity: 'common', fx: { zoomG: 0.2 }, desc: 'The Zoomies meter fills 20% faster' },
  { id: 'toymouse', name: 'Toy Mouse', icon: '🧸', rarity: 'common', fx: { exec: 0.3 }, desc: '+30% damage to mice below 30% health' },
  { id: 'post', name: 'Scratching Post', icon: '🪵', rarity: 'common', fx: { shield: 0.12 }, desc: 'Starts every wave with a barrier worth 12% of its health' },
  { id: 'fishbone', name: 'Fish Bone', icon: '🧲', rarity: 'common', fx: { cleave: 0.25 }, desc: 'Its hits also strike a second mouse for 25% damage' },
  { id: 'jingle', name: 'Jingle Collar', icon: '🪀', rarity: 'common', fx: { open: 0.3 }, desc: '+30% damage to mice at full health' },
  { id: 'sunbeam', name: 'Sunbeam', icon: '🌟', rarity: 'common', fx: { wheal: 0.04 }, desc: 'The whole team heals 4% more after every wave' },
  { id: 'medal', name: 'Dusty Medal', icon: '⭐', rarity: 'common', fx: { bossDmg: 0.25 }, desc: '+25% damage to elite mice and nests' },
  { id: 'hairball', name: 'Hairball', icon: '🪁', rarity: 'common', fx: { venom: 0.2 }, desc: 'Its hits poison mice, and the poison stacks' },
  { id: 'bowl', name: 'Silver Bowl', icon: '🥄', rarity: 'common', fx: { pristine: 0.2 }, desc: '+20% damage while it is above 80% health' },
  { id: 'pingpong', name: 'Ping Pong Ball', icon: '🏓', rarity: 'common', fx: { frenzy: 0.025 }, desc: '+2.5% attack speed for every kill this wave (up to 10 kills)' },
  // rare
  { id: 'whisker', name: 'Reaper Whisker', icon: '💀', rarity: 'rare', fx: { exec: 0.6 }, desc: '+60% damage to mice below 30% health' },
  { id: 'piggy', name: 'Piggy Bank', icon: '🏺', rarity: 'rare', fx: { kcoin: 1.2 }, desc: '+1.2 coins for every mouse it defeats' },
  { id: 'sock', name: 'Static Sock', icon: '🪤', rarity: 'rare', fx: { echo: 0.2 }, desc: '20% chance that an attack fires a second time for free' },
  { id: 'spore', name: 'Spore Mushroom', icon: '🍄', rarity: 'rare', fx: { venom: 0.45 }, desc: 'Its hits poison mice, and the poison stacks' },
  { id: 'ironbowl', name: 'Iron Bowl', icon: '🪣', rarity: 'rare', fx: { shield: 0.3, dr: 0.05 }, desc: 'Starts every wave with a barrier worth 30% of its health, takes 5% less damage' },
  { id: 'cracker', name: 'Firecracker', icon: '🧨', rarity: 'rare', fx: { boom: 0.35 }, desc: 'Mice it kills explode, hurting others nearby for 35% of their health' },
  { id: 'banner', name: 'Sunflower Banner', icon: '🎈', rarity: 'rare', fx: { teamDmg: 0.05 }, desc: 'The whole team deals 5% more damage' },
  { id: 'chime', name: 'Windchime', icon: '🎐', rarity: 'rare', fx: { teamHaste: 0.05 }, desc: 'The whole team attacks 5% faster' },
  // epic
  { id: 'cookie', name: 'Fortune Cookie', icon: '🥠', rarity: 'epic', fx: { luck: 2 }, desc: 'Much better loot: rare, epic and legendary relics turn up far more often' },
  { id: 'hexdoll', name: 'Hex Doll', icon: '🧿', rarity: 'epic', fx: { curseT: 0.1 }, desc: 'Every mouse takes 10% more damage from the whole team' },
  { id: 'lantern', name: 'Guardian Lantern', icon: '🕯', rarity: 'epic', fx: { teamDr: 0.05, teamHp: 0.12 }, desc: 'The whole team takes 5% less damage and has 12% more health' },
  { id: 'drum', name: 'War Drum', icon: '🥁', rarity: 'epic', fx: { frenzy: 0.045, teamHaste: 0.04 }, desc: '+4.5% attack speed per kill this wave, and the team attacks 4% faster' },
  { id: 'rod', name: 'Lightning Rod', icon: '🔱', rarity: 'epic', fx: { echo: 0.3, crit: 0.05 }, desc: '30% chance that an attack fires a second time, +5% crit' },
  // legendary
  { id: 'locket', name: 'Nine Lives Locket', icon: '🪞', rarity: 'legendary', fx: { undying: 1, hp: 0.15 }, desc: 'Once per wave it survives a deadly bite with 40% health. +15% health' },
  { id: 'keg', name: 'Powder Keg', icon: '⚗', rarity: 'legendary', fx: { boom: 0.8, dmg: 0.12 }, desc: 'Mice it kills blow up for 80% of their health, hurting the mice around them. +12% damage' },
  { id: 'whiskers', name: 'Echo Whiskers', icon: '🪄', rarity: 'legendary', fx: { echo: 0.45, haste: 0.15 }, desc: '45% chance that an attack fires a second time for free, +15% attack speed' },
  { id: 'scythe', name: 'Moon Scythe', icon: '🗝', rarity: 'legendary', fx: { exec: 1.2, kheal: 0.12, crit: 0.1 }, desc: '+120% damage to mice below 30% health, heals 12% on a kill, +10% crit' },
  { id: 'goldpaw', name: 'Golden Paw', icon: '🍯', rarity: 'legendary', fx: { kcoin: 4, coin: 0.4, luck: 1.5 }, desc: '+4 coins per kill, +40% coins and better loot' },
  { id: 'rainbow', name: 'Rainbow Yarn', icon: '🌈', rarity: 'legendary', fx: { teamDmg: 0.12, teamHaste: 0.1 }, desc: 'The whole team deals 12% more damage and attacks 10% faster' },
  // mythic
  { id: 'kingcrown', name: 'Crown of the Cat King', icon: '🧷', rarity: 'mythic', fx: { teamDmg: 0.2, teamHp: 0.25, teamDr: 0.08, luck: 2 }, desc: 'The whole team: +20% damage, +25% health, 8% less damage taken, and much better loot' },
  { id: 'timeknot', name: 'Time Knot', icon: '⌛', rarity: 'mythic', fx: { echo: 0.5, haste: 0.45, frenzy: 0.05, spc: 0.5 }, desc: '50% chance to attack twice, +45% attack speed, faster kills and specials' },
  { id: 'wheart', name: 'Heart of Whiskerton', icon: '📜', rarity: 'mythic', fx: { undying: 1, shield: 0.5, regen: 0.03, teamDr: 0.1, hp: 0.3 }, desc: 'Survives deadly bites, starts waves with a 50% barrier, heals constantly. The team takes 10% less damage' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const ITEM_WEIGHT = { common: 10, rare: 6, epic: 1.4, legendary: 0.55, mythic: 0.1 };   // per relic: there are many more commons than legends, so the odds of a tier are this times its relic count
export const MAX_STASH = 12;
// selling pays coins (scaled a little by wave); forging turns three of one rarity into one of the next
export const SELL_VALUE = { common: 8, rare: 22, epic: 60, legendary: 150, mythic: 400 };
export const FORGE_NEXT = { common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic', mythic: 'mythic' };
export const FORGE_COUNT = 3;
export const itemSlots = (lvl) => (lvl >= 3 ? 2 : 1);

// ---------------------------------------------------------------- the Cat Kingdom (spend coins between runs)
// bonus(level) returns the part of the run bonuses this building gives at that level.
export const BUILDINGS = [
  { id: 'dojo', name: 'Training Dojo', icon: '🥋', max: 5, base: 60, blurb: 'All cats hit harder.', bonus: (l) => ({ dmg: 0.04 * l }), text: (l) => `+${4 * l}% damage` },
  { id: 'beds', name: 'Cozy Cat Beds', icon: '🛏️', max: 5, base: 60, blurb: 'Well rested cats are tougher.', bonus: (l) => ({ hp: 0.05 * l }), text: (l) => `+${5 * l}% health` },
  { id: 'yarn', name: 'Yarn Workshop', icon: '🧶', max: 5, base: 70, blurb: 'Playful cats attack faster.', bonus: (l) => ({ haste: 0.03 * l }), text: (l) => `+${3 * l}% attack speed` },
  { id: 'spa', name: 'Healing Springs', icon: '♨️', max: 5, base: 70, blurb: 'Better rests between waves.', bonus: (l) => ({ waveHeal: 0.04 * l, reviveHp: 0.05 * l }), text: (l) => `+${4 * l}% wave healing, fallen cats return with +${5 * l}% health` },
  { id: 'tower', name: 'Lookout Tower', icon: '🔭', max: 5, base: 80, blurb: 'See farther, aim better.', bonus: (l) => ({ range: 0.04 * l, crit: 0.02 * l }), text: (l) => `+${4 * l}% range, +${2 * l}% crit` },
  { id: 'shrine', name: 'Lucky Shrine', icon: '⛩️', max: 5, base: 90, blurb: 'Fortune smiles on loot.', bonus: (l) => ({ luck: l }), text: (l) => `Better loot odds, +${4 * l}% chance elites drop a chest` },
  { id: 'vault', name: 'Treasure Vault', icon: '💰', max: 5, base: 100, blurb: 'Cats find more coins.', bonus: (l) => ({ coinMul: 0.10 * l }), text: (l) => `+${10 * l}% coins every run` },
  { id: 'tent', name: 'Fortune Teller Tent', icon: '🔮', max: 4, base: 80, blurb: 'Look again at any choice.', bonus: (l) => ({ rerolls: l }), text: (l) => `${l} free reroll${l > 1 ? 's' : ''} per run` },
  { id: 'stall', name: 'Snack Stall', icon: '🍣', max: 3, base: 90, blurb: 'Start each run with snacks.', bonus: (l) => ({ startSnacks: l }), text: (l) => `Start every run with ${l} free snack${l > 1 ? 's' : ''}` },
];
export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export const emptyKingdom = () => ({ coins: 0, lv: {}, earned: 0, gems: 0, wonders: {} });
export const buildingLevel = (k, id) => Math.min(BUILDING_BY_ID[id].max, (k && k.lv && k.lv[id]) | 0);
export function upgradeCost(id, level) {
  const b = BUILDING_BY_ID[id];
  return Math.round((b.base * Math.pow(1.75, level)) / 5) * 5;
}
// the cheapest building the player can pay for right now (null when none), used for the Kingdom hint
export function cheapestUpgrade(k) {
  let best = null, bc = Infinity;
  for (const b of BUILDINGS) {
    const l = buildingLevel(k, b.id);
    if (l >= b.max) continue;
    const c = upgradeCost(b.id, l);
    if (c <= ((k && k.coins) | 0) && c < bc) { best = b.id; bc = c; }
  }
  return best;
}
export const kingdomLevel = (k) => BUILDINGS.reduce((n, b) => n + buildingLevel(k, b.id), 0);
export function kingdomBonuses(k) {
  const m = { dmg: 0, hp: 0, haste: 0, waveHeal: 0, reviveHp: 0, range: 0, crit: 0, luck: 0, coinMul: 0, rerolls: 0, startSnacks: 0, startItem: 0, bench: 0, startPicks: 0, zoomStart: 0, zoomDur: 0, nine: 0 };
  for (const b of BUILDINGS) {
    const l = buildingLevel(k, b.id);
    if (!l) continue;
    const bo = b.bonus(l);
    for (const key in bo) m[key] += bo[key];
  }
  for (const w of WONDERS) if (k && k.wonders && k.wonders[w.id]) for (const key in w.bonus) m[key] += w.bonus[key];
  return m;
}
// the cheapest unmaxed building with the coins still missing for it (null when everything is built), used for the game over goal line
export function nextGoal(k) {
  let best = null;
  for (const b of BUILDINGS) {
    const l = buildingLevel(k, b.id);
    if (l >= b.max) continue;
    const cost = upgradeCost(b.id, l);
    if (!best || cost < best.cost) best = { id: b.id, cost };
  }
  if (best) best.need = Math.max(0, best.cost - ((k && k.coins) | 0));
  return best;
}
// the cheapest wonder not yet built that the gems can pay for (null when none), used for the Kingdom hint
export function affordableWonder(k) {
  let best = null;
  for (const w of WONDERS) {
    if ((k && k.wonders && k.wonders[w.id]) || ((k && k.gems) | 0) < w.cost) continue;
    if (!best || w.cost < best.cost) best = w;
  }
  return best ? best.id : null;
}
export function buyWonder(k, id) {
  const w = WONDER_BY_ID[id];
  if (!w || (k.wonders && k.wonders[id]) || (k.gems | 0) < w.cost) return false;
  k.gems -= w.cost;
  k.wonders = k.wonders || {};
  k.wonders[id] = true;
  return true;
}
export function buyUpgrade(k, id) {
  const l = buildingLevel(k, id), b = BUILDING_BY_ID[id];
  if (l >= b.max) return false;
  const c = upgradeCost(id, l);
  if (k.coins < c) return false;
  k.coins -= c;
  k.lv[id] = l + 1;
  return true;
}

// coins earned while playing (before the vault bonus)
export const COIN = { kill: 1, elite: 5, wave: 3, waveGrow: 0.6, nest: 30, nestGrow: 12 };

// ---------------------------------------------------------------- difficulty
export const DIFFS = {
  cozy:   { name: 'Cozy',   icon: '🌼', desc: 'Gentler mice, a few less of them. Coins x0.8.',          hp: 0.84, dmg: 0.8, budget: 0.93, coin: 0.8 },
  normal: { name: 'Normal', icon: '🐱', desc: 'The way it was meant to be played.',                hp: 1,    dmg: 1,    budget: 1,    coin: 1 },
  hard:   { name: 'Hard',   icon: '🔥', desc: 'Tougher, hungrier mice. Coins x1.5.',                hp: 1.3,  dmg: 1.25, budget: 1.12, coin: 1.5 },
};

// ---------------------------------------------------------------- synergies (cats that share a tag boost each other)
export const CAT_TAGS = {
  tabby: ['blade'], ember: ['fire'], sparky: ['storm'], buckshot: ['gun'], mochi: ['guardian'],
  yuki: ['storm'], hawkeye: ['gun'], boomer: ['gun'], pudding: ['guardian', 'cheer'], shadow: ['blade'], ronin: ['blade'],
  merlin: ['magic'], cutlass: ['gun'], sprout: ['cheer'], gizmo: ['tech'], lyra: ['cheer'], nibbles: ['blade'],
  zeus: ['storm'], volcano: ['fire'], blizzard: ['storm'], dusty: ['gun'], cyber: ['tech'], boo: ['magic'],
  draco: ['fire'], halo: ['guardian'], mecha: ['gun', 'tech'], hexa: ['magic'], nori: ['cheer'], leo: ['guardian'], nebula: ['magic'], biscuit: ['cheer'], pearl: ['storm'],
};
// self: applies to the cats with the tag. team: applies to every cat. Tier 1 needs 2 cats, tier 2 needs 3 or more.
export const SYNERGIES = {
  fire:     { name: 'Flame Club',    icon: '🔥', tiers: [{ self: { dmg: 0.15 } }, { self: { dmg: 0.35 } }] },
  storm:    { name: 'Storm Squad',   icon: '⚡',       tiers: [{ self: { haste: 0.12 } }, { self: { haste: 0.28 } }] },
  gun:      { name: 'Sharpshooters', icon: '🎯', tiers: [{ self: { crit: 0.10 } }, { self: { crit: 0.22, dmg: 0.10 } }] },
  blade:    { name: 'Blade Pack',    icon: '🗡️', tiers: [{ self: { dmg: 0.12, crit: 0.08 } }, { self: { dmg: 0.25, crit: 0.16 } }] },
  magic:    { name: 'Mystic Circle', icon: '✨',       tiers: [{ self: { range: 0.18, dmg: 0.10 } }, { self: { range: 0.35, dmg: 0.22 } }] },
  guardian: { name: 'Guardians',     icon: '🛡️', tiers: [{ team: { dr: 0.06, hp: 0.10 } }, { team: { dr: 0.12, hp: 0.22 } }] },
  tech:     { name: 'Gearheads',     icon: '⚙️', tiers: [{ team: { dmg: 0.08 } }, { team: { dmg: 0.18 } }] },
  cheer:    { name: 'Cheer Squad',   icon: '🎵', tiers: [{ team: { regen: 0.01 } }, { team: { regen: 0.02, haste: 0.05 } }] },
};
export const synergyText = (tag, tier) => {
  const t = SYNERGIES[tag].tiers[tier - 1], f = t.self || t.team;
  const nm = { dmg: 'damage', haste: 'attack speed', crit: 'crit', range: 'range', dr: 'less damage taken', hp: 'health', regen: 'health regen per second' };
  return Object.entries(f).map(([k, v]) => `+${Math.round(v * 100)}% ${nm[k]}`).join(', ') + (t.self ? ` for ${SYNERGIES[tag].name} cats` : ' for the whole team');
};

// ---------------------------------------------------------------- routes (pick the road to the next nest)
export const ROUTES = [
  { id: 'trail',    name: 'Sunny Trail',   icon: '☀️', desc: 'A calm stroll. Nothing special.', enemyHp: 1, enemyDmg: 1, coin: 1, chest: 0, budget: 1, bossHp: 1, rare: 0, snackExtra: 0, healNow: 0, speed: 1 },
  { id: 'treasure', name: 'Treasure Road', icon: '💰', desc: 'Coins x1.5 and more chests, but tougher mice.', enemyHp: 1.12, enemyDmg: 1, coin: 1.5, chest: 1.2, budget: 1, bossHp: 1, rare: 0, snackExtra: 0, healNow: 0, speed: 1 },
  { id: 'danger',   name: 'Danger Pass',   icon: '☠️', desc: 'Much deadlier mice. Coins x1.3 and a better chance of epic loot.', enemyHp: 1.25, enemyDmg: 1.2, coin: 1.3, chest: 0.4, budget: 1.05, bossHp: 1.1, rare: 2, snackExtra: 0, healNow: 0, speed: 1 },
  { id: 'meadow',   name: 'Cozy Meadow',   icon: '🌼', desc: 'Heal 50% now. Fewer, softer mice. Coins x0.8.', enemyHp: 0.88, enemyDmg: 0.9, coin: 0.8, chest: 0, budget: 0.85, bossHp: 0.9, rare: 0, snackExtra: 0, healNow: 0.5, speed: 1 },
  { id: 'moon',     name: 'Moon Path',     icon: '🌙', desc: 'Mice move 15% slower, but the nest is 30% tougher. Better loot.', enemyHp: 1, enemyDmg: 1, coin: 1.1, chest: 0.5, budget: 1, bossHp: 1.3, rare: 1, snackExtra: 0, healNow: 0, speed: 0.85 },
  { id: 'market',   name: 'Snack Market',  icon: '🍣', desc: 'One extra snack to choose from after every wave of this stage.', enemyHp: 1.05, enemyDmg: 1, coin: 1, chest: 0, budget: 1, bossHp: 1, rare: 0, snackExtra: 1, healNow: 0, speed: 1 },
];
export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

// ---------------------------------------------------------------- the daily challenge
export const DAILY_POOL = [...STARTERS, 'yuki', 'hawkeye', 'boomer', 'pudding', 'shadow', 'ronin', 'merlin', 'cutlass'];
export const DAILY_MODS = [
  { id: 'fast',  name: 'Zoomies Day',   icon: '💨', desc: 'Mice move 25% faster.',                         speed: 1.25 },
  { id: 'glass', name: 'Glass Cats',    icon: '🔮', desc: 'Cats deal +40% damage but have 35% less health.', dmg: 0.4, hp: -0.35 },
  { id: 'horde', name: 'Horde Day',     icon: '🐀', desc: '40% more mice, each 20% weaker.',                budget: 1.4, enemyHp: 0.8 },
  { id: 'elite', name: 'Elite Storm',   icon: '👑', desc: 'Elite mice show up from wave 2. Chests drop more.', elite: 0.2, chest: 1 },
  { id: 'tiny',  name: 'Tiny Tower',    icon: '🧱', desc: 'The tower only holds 4 cats.',                    stack: 4 },
  { id: 'rich',  name: 'Gold Rush',     icon: '🪙', desc: 'Double coins and double the chests.',            coin: 2, chest: 1 },
];
export function dayKey(ms = Date.now()) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
export function dayInfo(day) {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return { day, seed: h || 1, mod: DAILY_MODS[h % DAILY_MODS.length] };
}

// ---------------------------------------------------------------- wonders (bought with gems, the second currency)
export const WONDERS = [
  { id: 'paw',     name: 'Golden Paw',      icon: '🐾', cost: 4, desc: 'Start every run with a random rare relic already equipped.', bonus: { startItem: 1 } },
  { id: 'bench',   name: 'Big Bench',       icon: '🪑', cost: 3, desc: 'One more bench spot (5 instead of 4).',                    bonus: { bench: 1 } },
  { id: 'cafe',    name: 'Cat Cafe',        icon: '☕',       cost: 6, desc: 'Pick one extra cat at the start of every run.',             bonus: { startPicks: 1 } },
  { id: 'academy', name: 'Zoomies Academy', icon: '🎓', cost: 4, desc: 'Zoomies meter starts half full and lasts 3 seconds longer.', bonus: { zoomStart: 50, zoomDur: 3 } },
  { id: 'coin',    name: 'Lucky Coin',      icon: '🍀', cost: 3, desc: 'One more free reroll in every run.',                        bonus: { rerolls: 1 } },
  { id: 'spring',  name: 'Phoenix Fountain', icon: '🕊️', cost: 8, desc: 'Every run starts with Nine Lives: the tower rises once after falling.', bonus: { nine: 1 } },
];
export const WONDER_BY_ID = Object.fromEntries(WONDERS.map((w) => [w.id, w]));

// ---------------------------------------------------------------- achievements (coins and gems)
// check gets { stats (after this run), run, save, kingdom }.
const bld = (k, n) => BUILDINGS.filter((b) => buildingLevel(k, b.id) >= n).length;
export const ACHIEVEMENTS = [
  { id: 'first',    name: 'First Catch',      desc: 'Defeat your first mouse.',                    coins: 20,  gems: 0, check: (c) => c.stats.kills >= 1 },
  { id: 'hunter',   name: 'Mouser',           desc: 'Defeat 1000 mice in total.',                  coins: 80,  gems: 0, check: (c) => c.stats.kills >= 1000 },
  { id: 'exterm',   name: 'Exterminator',     desc: 'Defeat 10000 mice in total.',                 coins: 300, gems: 2, check: (c) => c.stats.kills >= 10000 },
  { id: 'nest1',    name: 'Nest Buster',      desc: 'Destroy a nest.',                             coins: 50,  gems: 1, check: (c) => c.stats.bossKills >= 1 },
  { id: 'nest10',   name: 'Nest Crusher',     desc: 'Destroy 10 nests in total.',                  coins: 150, gems: 1, check: (c) => c.stats.bossKills >= 10 },
  { id: 'w10',      name: 'Getting Warm',     desc: 'Reach wave 10.',                              coins: 60,  gems: 0, check: (c) => c.stats.bestWave >= 10 },
  { id: 'w20',      name: 'Cat Hero',         desc: 'Reach wave 20.',                              coins: 120, gems: 1, check: (c) => c.stats.bestWave >= 20 },
  { id: 'w30',      name: 'Cat Legend',       desc: 'Reach wave 30.',                              coins: 250, gems: 2, check: (c) => c.stats.bestWave >= 30 },
  { id: 'w50',      name: 'Whisker of Gold',  desc: 'Reach wave 50.',                              coins: 500, gems: 3, check: (c) => c.stats.bestWave >= 50 },
  { id: 'merge5',   name: 'Merge Master',     desc: 'Merge cats up to Lv 3, 5 times.',             coins: 100, gems: 1, check: (c) => c.stats.lvl3 >= 5 },
  { id: 'flaw5',    name: 'Not a Scratch',    desc: 'Clear 5 waves in one run without a cat going down.', coins: 80, gems: 0, check: (c) => c.run.flawless >= 5 },
  { id: 'combo50',  name: 'Combo King',       desc: 'Chain a 50 mouse combo.',                     coins: 80,  gems: 1, check: (c) => (c.run.maxCombo || 0) >= 50 },
  { id: 'rich',     name: 'Piggy Bank',       desc: 'Earn 5000 coins in total.',                   coins: 100, gems: 1, check: (c) => c.kingdom.earned >= 5000 },
  { id: 'build15',  name: 'Town Planner',     desc: 'Reach Kingdom level 15.',                     coins: 100, gems: 1, check: (c) => kingdomLevel(c.kingdom) >= 15 },
  { id: 'allbld',   name: 'Full Village',     desc: 'Build every Kingdom building.',               coins: 150, gems: 2, check: (c) => bld(c.kingdom, 1) >= BUILDINGS.length },
  { id: 'maxbld',   name: 'Finishing Touch',  desc: 'Fully upgrade one building.',                 coins: 100, gems: 1, check: (c) => BUILDINGS.some((b) => buildingLevel(c.kingdom, b.id) >= b.max) },
  { id: 'coll15',   name: 'Cat Collector',    desc: 'Unlock 15 cats.',                             coins: 100, gems: 1, check: (c) => c.save.unlocked.length >= 15 },
  { id: 'coll30',   name: 'Gotta Pet Them All', desc: 'Unlock all 32 cats.',                       coins: 300, gems: 3, check: (c) => c.save.unlocked.length >= CATS.length },
  { id: 'loot8',    name: 'Loot Goblin',      desc: 'Collect 8 relics in one run.',                 coins: 80,  gems: 1, check: (c) => c.run.items >= 8 },
  { id: 'hard15',   name: 'Brave Whiskers',   desc: 'Reach wave 15 on Hard.',                      coins: 200, gems: 2, check: (c) => c.run.diff === 'hard' && c.run.wave >= 15 },
  { id: 'daily1',   name: 'Daily Dabbler',    desc: 'Play the daily challenge.',                   coins: 40,  gems: 1, check: (c) => !!c.run.daily },
  { id: 'daily20',  name: 'Daily Champion',   desc: 'Reach wave 20 in a daily challenge.',         coins: 200, gems: 2, check: (c) => !!c.run.daily && c.run.wave >= 20 },
  { id: 'syn3',     name: 'Dream Team',       desc: 'Get a full tier 2 synergy (3 cats of one kind).', coins: 80, gems: 1, check: (c) => (c.run.synMax || 0) >= 3 },
  { id: 'big1000',  name: 'Big Hitter',       desc: 'Land a single hit of 1000 damage.',           coins: 120, gems: 1, check: (c) => c.run.biggest >= 1000 },
  { id: 'nine',     name: 'Nine Lives',       desc: 'Be saved by Nine Lives.',                     coins: 60,  gems: 1, check: (c) => (c.run.nine || 0) >= 1 },
  { id: 'sp5',      name: 'Special Delivery', desc: 'Use 5 special moves in one run.',             coins: 60,  gems: 1, check: (c) => (c.run.specials || 0) >= 5 },
  { id: 'sp25',     name: 'Showstopper',      desc: 'Use 25 special moves in one run.',            coins: 150, gems: 2, check: (c) => (c.run.specials || 0) >= 25 },
  { id: 'forge1',   name: 'Blacksmith',       desc: 'Forge three relics into a better one.',        coins: 50,  gems: 1, check: (c) => (c.run.forged || 0) >= 1 },
  { id: 'sell5',    name: 'Yard Sale',        desc: 'Sell 5 relics in one run.',                    coins: 50,  gems: 0, check: (c) => (c.run.sold || 0) >= 5 },
  { id: 'event3',   name: 'Wanderer',         desc: 'Visit 3 event stops in one run.',             coins: 70,  gems: 1, check: (c) => (c.run.events || 0) >= 3 },
  { id: 'wish',     name: 'Lucky Wish',       desc: 'Win a toss at the Wishing Fountain.',         coins: 70,  gems: 1, check: (c) => (c.run.fountainWins || 0) >= 1 },
  { id: 'king',     name: 'Cheddar Crusher',  desc: 'Defeat King Squeakimus in the wave 30 nest.', coins: 300, gems: 0, check: (c) => !!(c.save && c.save.storyDone) },
];

// ---------------------------------------------------------------- special moves (tap a charged cat; each cat has one)
// kind picks the effect in sim.js (useSpecial); pow scales its damage or length
export const SPECIALS = {
  tabby:    { kind: 'frenzy', name: 'Claw Frenzy', icon: '🗡️', color: '#ffb35a', pow: 1 },
  ember:    { kind: 'inferno', name: 'Inferno', icon: '🔥', color: '#ff7a2b', pow: 1 },
  sparky:   { kind: 'storm', name: 'Static Storm', icon: '⚡', color: '#ffe14d', pow: 1 },
  buckshot: { kind: 'volley', name: 'Double Barrel', icon: '🎯', color: '#ffd27a', pow: 1 },
  mochi:    { kind: 'fortress', name: 'Fluffy Fortress', icon: '🛡️', color: '#9ad0ff', pow: 1 },
  yuki:     { kind: 'freeze', name: 'Deep Freeze', icon: '❄️', color: '#bfeaff', pow: 1 },
  hawkeye:  { kind: 'snipe', name: 'Headshot', icon: '🎯', color: '#ffffff', pow: 1 },
  boomer:   { kind: 'barrage', name: 'Bomb Rain', icon: '✨', color: '#ff9a3a', pow: 1 },
  pudding:  { kind: 'heal', name: 'Mass Healing', icon: '💖', color: '#ff9ec6', pow: 1 },
  shadow:   { kind: 'volley', name: 'Shadow Dance', icon: '🌙', color: '#b88aff', pow: 1.2 },
  ronin:    { kind: 'frenzy', name: 'Iaido Rush', icon: '🗡️', color: '#e8eef8', pow: 1.1 },
  merlin:   { kind: 'meteor', name: 'Meteor', icon: '✨', color: '#c8a0ff', pow: 1 },
  cutlass:  { kind: 'barrage', name: 'Broadside', icon: '✨', color: '#ffcf6a', pow: 1 },
  sprout:   { kind: 'toxin', name: 'Toxic Bloom', icon: '☠️', color: '#8be05a', pow: 1 },
  gizmo:    { kind: 'barrage', name: 'Minefield', icon: '✨', color: '#ffd23f', pow: 1.1 },
  lyra:     { kind: 'anthem', name: 'Battle Anthem', icon: '🎵', color: '#ffd23f', pow: 1 },
  nibbles:  { kind: 'frenzy', name: 'Bloodlust', icon: '🦷', color: '#ff6a8a', pow: 1.2 },
  zeus:     { kind: 'storm', name: 'Judgement', icon: '⚡', color: '#fff27a', pow: 1.3 },
  volcano:  { kind: 'inferno', name: 'Eruption', icon: '🔥', color: '#ff5a1f', pow: 1.2 },
  blizzard: { kind: 'freeze', name: 'Absolute Zero', icon: '❄️', color: '#dff4ff', pow: 1.3 },
  dusty:    { kind: 'volley', name: 'Quick Draw', icon: '🎯', color: '#ffc27a', pow: 1.1 },
  cyber:    { kind: 'snipe', name: 'Orbital Beam', icon: '⚡', color: '#7bf0ff', pow: 1.2 },
  boo:      { kind: 'phase', name: 'Phase Out', icon: '💨', color: '#cfd8ff', pow: 1 },
  draco:    { kind: 'inferno', name: 'Dragon Breath', icon: '🔥', color: '#ff4a2a', pow: 1.4 },
  halo:     { kind: 'heal', name: 'Holy Light', icon: '💖', color: '#fff6b0', pow: 1.2 },
  mecha:    { kind: 'barrage', name: 'Missile Rain', icon: '✨', color: '#ff8a5a', pow: 1.2 },
  hexa:     { kind: 'hex', name: 'Hex', icon: '🔮', color: '#d28aff', pow: 1 },
  nori:     { kind: 'barrage', name: 'Hot Pot', icon: '✨', color: '#ffb05a', pow: 1 },
  biscuit:  { kind: 'barrage', name: 'Fresh Batch', icon: '✨', color: '#e6b26a', pow: 1 },
  pearl:    { kind: 'barrage', name: 'Tidal Wave', icon: '✨', color: '#6fd8ff', pow: 1 },
  leo:      { kind: 'frenzy', name: 'Royal Roar', icon: '👑', color: '#ffd23f', pow: 1.3 },
  nebula:   { kind: 'supernova', name: 'Supernova', icon: '✨', color: '#9a8aff', pow: 1 },
};
export const SPECIAL_TIME = 26;       // seconds of fighting to charge a special by itself (kills help)

// ---------------------------------------------------------------- event stops between waves
export const EVENTS = [
  { id: 'shop', name: 'Wandering Shop', icon: '💰', desc: 'A travelling cat sells supplies. Coins you spend here are not saved for the Kingdom.' },
  { id: 'shrine', name: 'Moon Shrine', icon: '🌙', desc: 'Offer something and the shrine may give back more.' },
  { id: 'rest', name: 'Cozy Campfire', icon: '🔥', desc: 'A warm rest. Free, but only one choice.' },
  { id: 'deal', name: 'Shady Deal', icon: '🎭', desc: 'A masked mouse offers loot with a catch.' },
  { id: 'dojo', name: 'Training Yard', icon: '🥋', desc: 'Pick one cat to train for the rest of the run.' },
  { id: 'picnic', name: 'Cat Picnic', icon: '🍱', desc: 'A blanket full of snacks. Take one, free.' },
  { id: 'fountain', name: 'Wishing Fountain', icon: '🪙', desc: 'Toss in some coins and make a wish. It may pay back, it may not.' },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ================================================================ META 2: cat mastery, challenge ladder, weekly challenge
// ---- cat mastery: every cat earns XP from use (waves survived in the tower, damage, kills) and levels 1 to 5.
// Each level above 1 gives that cat a tiny permanent bonus. Level 5 also unlocks the Master's Medal cosmetic for it.
export const MASTERY_XP = [0, 50, 200, 500, 1000];       // total XP needed for level 1..5
export const MASTERY_MAX = 5;
export const MASTERY_BONUS = { dmg: 0.02, hp: 0.01 };    // per level above 1 (level 5 = +8% damage, +4% health)
export function masteryXp(s) {
  if (!s) return 0;
  const waves = s.waves != null ? s.waves : (s.runs || 0) * 4;   // older saves did not count waves
  return Math.floor(waves * 3 + (s.kills || 0) + (s.dmg || 0) / 500);
}
export function masteryLevel(s) {
  const xp = masteryXp(s);
  let lv = 1;
  for (let i = 1; i < MASTERY_XP.length; i++) if (xp >= MASTERY_XP[i]) lv = i + 1;
  return lv;
}
// { lv, xp, from, to, pct } where to is null at the top level
export function masteryProgress(s) {
  const xp = masteryXp(s), lv = masteryLevel(s), from = MASTERY_XP[lv - 1], to = lv >= MASTERY_MAX ? null : MASTERY_XP[lv];
  return { lv, xp, from, to, pct: to == null ? 100 : Math.max(0, Math.min(100, Math.round((100 * (xp - from)) / (to - from)))) };
}
export const masteryBonus = (lv) => ({ dmg: MASTERY_BONUS.dmg * Math.max(0, lv - 1), hp: MASTERY_BONUS.hp * Math.max(0, lv - 1) });
// the map newGame takes: { catId: level } for cats that have reached level 2 or more
export function masteryMap(catStats) {
  const out = {};
  for (const id in catStats || {}) if (CAT_BY_ID[id]) { const lv = masteryLevel(catStats[id]); if (lv >= 2) out[id] = lv; }
  return out;
}

// ---- challenge ladder: Nightmare I to V, each tier stacks one more rule on top of the last
// mod keys: speed (mice speed, multiplies), heal (wave healing multiplier, smallest wins), elite (extra elite chance from wave 3, adds),
// snack (fewer snack choices, adds), rerolls (fewer free rerolls, adds)
export const LADDER_RULES = [
  { tier: 1, name: 'Quick Mice',    icon: '💨', desc: 'Mice move 6% faster.',                        mod: { speed: 1.06 } },
  { tier: 2, name: 'Lean Times',    icon: '🥫', desc: 'Cats heal half as much after each wave.',      mod: { heal: 0.5 } },
  { tier: 3, name: 'Royal Guard',   icon: '👑', desc: 'Elite mice show up much more often.',          mod: { elite: 0.1 } },
  { tier: 4, name: 'Slim Pickings', icon: '🍱', desc: 'One snack choice fewer, and one reroll fewer.', mod: { snack: 1, rerolls: 1 } },
  { tier: 5, name: 'Sealed Pantry', icon: '🔒', desc: 'No healing after waves and no free rerolls. Mice are faster still.', mod: { heal: 0, rerolls: 9, speed: 1.05 } },
];
export const LADDER_TIERS = LADDER_RULES.length;
// the wave to reach on a tier to unlock the next one (index 0 is Hard, index n is Nightmare n)
export const LADDER_WAVE = [15, 14, 13, 12, 12];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const ladderId = (tier) => 'nm' + tier;
export const ladderTier = (diff) => { const m = /^nm([1-5])$/.exec(String(diff)); return m ? +m[1] : 0; };
export function stackRules(tier) {
  const out = { speed: 1, heal: 1, elite: 0, snack: 0, rerolls: 0 };
  for (const r of LADDER_RULES) if (r.tier <= tier) {
    const m = r.mod;
    if (m.speed != null) out.speed *= m.speed;
    if (m.heal != null) out.heal = Math.min(out.heal, m.heal);
    for (const k of ['elite', 'snack', 'rerolls']) if (m[k]) out[k] += m[k];
  }
  return out;
}
for (let t = 1; t <= LADDER_TIERS; t++) {
  const r = LADDER_RULES[t - 1];
  DIFFS[ladderId(t)] = {
    name: 'Nightmare ' + ROMAN[t], icon: '☠', tier: t, rule: r,
    desc: 'Hard plus ' + LADDER_RULES.filter((x) => x.tier <= t).map((x) => x.name).join(', ') + '. Coins x' + (1.5 + 0.25 * t) + '.',
    hp: 1.3 + 0.03 * t, dmg: 1.25 + 0.02 * t, budget: 1.12 + 0.01 * t, coin: 1.5 + 0.25 * t, ...stackRules(t),
  };
}
export const DIFF_ORDER = ['cozy', 'normal', 'hard', ...LADDER_RULES.map((r) => ladderId(r.tier))];
// highest Nightmare tier the player may start: Hard must have been cleared first (the 'hard15' trophy), then each tier clears the next
export function ladderUnlocked(save) {
  const cleared = Math.max(0, Math.min(LADDER_TIERS, (save && save.ladder) | 0));
  const hard = cleared > 0 || !!(save && save.ach && save.ach.hard15);
  return Math.min(LADDER_TIERS, cleared + (hard ? 1 : 0));
}
export const diffAllowed = (save, id) => !!DIFFS[id] && ladderTier(id) <= ladderUnlocked(save);
// the tier a finished run clears, or 0 (Hard is tracked by the trophy)
export const ladderClears = (run) => { const t = ladderTier(run.diff); return t && run.wave >= LADDER_WAVE[t] ? t : 0; };

// ---- weekly challenge: one seed and three stacked modifiers per ISO week (UTC)
export const WEEKLY_MODS = [
  { id: 'fast',  name: 'Zoomies Week',  icon: '💨', desc: 'Mice move 20% faster.',                 speed: 1.2 },
  { id: 'glass', name: 'Glass Cats',    icon: '🔮', desc: 'Cats deal +30% damage, 30% less health.', dmg: 0.3, hp: -0.3 },
  { id: 'horde', name: 'Horde Week',    icon: '🐀', desc: '30% more mice, each 15% weaker.',        budget: 1.3, enemyHp: 0.85 },
  { id: 'elite', name: 'Elite Storm',   icon: '👑', desc: 'Elite mice from wave 2. More chests.',   elite: 0.18, chest: 0.5 },
  { id: 'tiny',  name: 'Tiny Tower',    icon: '🧱', desc: 'The tower only holds 4 cats.',           stack: 4 },
  { id: 'brute', name: 'Brute Mice',    icon: '🛡', desc: 'Mice have 30% more health.',             enemyHp: 1.3 },
  { id: 'poor',  name: 'Tight Purse',   icon: '🪙', desc: 'Coins are halved, chests are rarer.',    coin: 0.5, chest: -0.4 },
];
export function weekKey(ms = Date.now()) {
  const d = new Date(ms), day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day0).getUTCDay() + 6) % 7;                // Monday = 0
  const thu = day0 + (3 - dow) * 86400000;                          // the Thursday decides which year the week belongs to
  const y = new Date(thu).getUTCFullYear();
  const wk = Math.floor((thu - Date.UTC(y, 0, 1)) / (7 * 86400000)) + 1;
  return `${y}-W${String(wk).padStart(2, '0')}`;
}
export const WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
export function mergeMods(list) {
  const m = { id: 'weekly', enemyHp: 1.1 };                          // an iron week: mice are a little tougher before any rule
  for (const x of list) {
    for (const k of ['speed', 'budget', 'enemyHp', 'coin']) if (x[k]) m[k] = (m[k] || 1) * x[k];
    for (const k of ['dmg', 'hp', 'elite', 'chest']) if (x[k]) m[k] = (m[k] || 0) + x[k];
    if (x.stack) m.stack = Math.min(m.stack || 99, x.stack);
  }
  return m;
}
export function weekInfo(week) {
  let h = 2166136261;
  const s = 'weekly:' + week;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const pool = WEEKLY_MODS.slice(), picks = [];
  let r = h;
  while (picks.length < 3) {
    const i = r % pool.length;
    picks.push(pool.splice(i, 1)[0]);
    r = Math.imul(r ^ (r >>> 15), 2246822519) >>> 0;
  }
  const mod = mergeMods(picks);
  mod.name = 'Weekly Gauntlet'; mod.icon = '🏆'; mod.desc = picks.map((p) => p.name).join(', ');
  return { day: week, week, kind: 'weekly', seed: h || 1, mod, mods: picks };
}

// one plain sentence per special move kind, for the Cat Dex and the tray tooltips
export const SPECIAL_TEXT = {
  frenzy: 'Attacks about twice as fast for a few seconds.',
  fortress: 'The whole stack takes 70% less damage for 5 seconds.',
  inferno: 'A wall of fire burns every mouse in front of the stack.',
  storm: 'Lightning jumps through up to ten mice and stuns them.',
  volley: 'Fires a burst of shots at random mice.',
  freeze: 'Freezes every mouse for a few seconds (nests only slow down).',
  snipe: 'One huge shot at the toughest mouse, ignoring armor.',
  barrage: 'Seven explosions rain down on the mice.',
  heal: 'Heals the whole team and wakes up fallen cats.',
  meteor: 'A giant explosion where the mice are packed tightest.',
  toxin: 'Poisons every mouse on the field.',
  anthem: 'The whole team attacks 50% faster for 6 seconds.',
  hex: 'Cursed mice take 35% more damage for 6 seconds.',
  phase: 'The stack dodges 60% of attacks for 5 seconds.',
  supernova: 'A cosmic blast hits every mouse on the field.',
};

// the cats stacked on the title screen: the player's five most used unlocked cats (ties keep unlock order), so the title shows their own team
export function titleStackIds(unlocked, catStats = {}) {
  const used = (id) => (catStats[id] && catStats[id].runs) || 0;
  return unlocked.map((id, i) => ({ id, i })).sort((a, b) => used(b.id) - used(a.id) || a.i - b.i).slice(0, 5).map((x) => x.id);
}
