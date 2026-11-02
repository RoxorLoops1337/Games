// data_meta.js: meta progression data. Studio upgrades (Records), gear (crates), fame, quests, achievements, outfits, daily rewards.
// Pure data. No DOM, no Math.random, no Date.
import { TURRETS } from './data_core.js';

// ---------------------------------------------------------------- Studio upgrades (permanent, bought with Records)
// fx are applied once per level via applyFx(mods, fx, level). cost(level) is the price of the NEXT level (level = owned levels).
const geo = (base, g) => (l) => Math.round(base * Math.pow(g, l));
export const STUDIO = {
  amp:      { id: 'amp',      name: 'Bigger Speakers',   glyph: 'speaker', max: 20, cost: geo(60, 1.30),  fx: [['dmg', 'mul', 1.05]],          desc: '+5% damage per level.' },
  tempo:    { id: 'tempo',    name: 'Tight Timing',      glyph: 'clock',   max: 20, cost: geo(80, 1.29),  fx: [['rate', 'mul', 1.03]],         desc: '+3% fire rate per level.' },
  range:    { id: 'range',    name: 'Long Cables',       glyph: 'plug',    max: 10, cost: geo(90, 1.34),  fx: [['range', 'mul', 1.02]],        desc: '+2% range per level.' },
  crit:     { id: 'crit',     name: 'Lucky Charm',       glyph: 'clover',  max: 15, cost: geo(70, 1.30),  fx: [['crit', 'add', 0.01]],         desc: '+1% crit chance per level.' },
  critdmg:  { id: 'critdmg',  name: 'Big Finish',        glyph: 'bolt',    max: 10, cost: geo(110, 1.32), fx: [['critDmg', 'add', 0.05]],      desc: '+5% crit damage per level.' },
  coin:     { id: 'coin',     name: 'Tip Jar',           glyph: 'bag',     max: 20, cost: geo(75, 1.28),  fx: [['coin', 'mul', 1.04]],         desc: '+4% coins from kills per level.' },
  deploy:   { id: 'deploy',   name: 'Roadie Deals',      glyph: 'ticket',  max: 20, cost: geo(85, 1.29),  fx: [['deployCost', 'mul', 0.985]],  desc: 'Deploys cost 1.5% less per level.' },
  cash:     { id: 'cash',     name: 'Opening Act Cash',  glyph: 'coin',    max: 15, cost: geo(50, 1.27),  fx: [['startCoins', 'add', 15]],     desc: '+15 starting coins per level.' },
  stagehp:  { id: 'stagehp',  name: 'Sturdy Stage',      glyph: 'heart',   max: 10, cost: geo(120, 1.38), fx: [['stageHp', 'add', 1]],         desc: '+1 stage health per level.' },
  herocd:   { id: 'herocd',   name: 'Warm Hands',        glyph: 'hourglass', max: 10, cost: geo(100, 1.33), fx: [['heroCd', 'mul', 0.98]],     desc: 'Hero abilities recharge 2% faster per level.' },
  heropow:  { id: 'heropow',  name: 'Showmanship',       glyph: 'sparkle', max: 10, cost: geo(100, 1.33), fx: [['heroPow', 'mul', 1.04]],      desc: 'Hero abilities are 4% stronger per level.' },
  hype:     { id: 'hype',     name: 'Hype Drive',        glyph: 'rocket',  max: 10, cost: geo(95, 1.32),  fx: [['hype', 'mul', 1.04]],         desc: '+4% hype from kills per level.' },
  lucky:    { id: 'lucky',    name: 'Lucky Dealer',      glyph: 'dice',    max: 10, cost: geo(130, 1.34), fx: [['lucky', 'add', 0.01]],        desc: '+1% chance a deploy arrives as level 2.' },
  rebate:   { id: 'rebate',   name: 'Merge Rebate',      glyph: 'merge',   max: 10, cost: geo(140, 1.34), fx: [['mergeRefund', 'add', 0.02]],  desc: 'Merges refund +2% of a deploy.' },
  royalty:  { id: 'royalty',  name: 'Royalties',         glyph: 'record',  max: 8,  cost: geo(180, 1.38), fx: [['interest', 'add', 0.005]],    desc: 'Earn +0.5% interest on your coins after every wave.' },
  tipcup:   { id: 'tipcup',   name: 'Tip Cup',           glyph: 'coin',    max: 10, cost: geo(100, 1.31), fx: [['waveCoins', 'add', 3]],       desc: 'Start every wave with +3 coins.' },
  setlist:  { id: 'setlist',  name: 'Spare Setlist',     glyph: 'reroll',  max: 4,  cost: geo(400, 1.9),  fx: [['rerolls', 'add', 1]],         desc: '+1 free reroll per run.' },
  rack:     { id: 'rack',     name: 'Roadie Rack',        glyph: 'gear',    max: 3,  cost: geo(900, 2.6),  fx: [['startCoins', 'add', 60]],     desc: 'Start every run with +60 coins.' },
  stream:   { id: 'stream',   name: 'Streaming Royalties', glyph: 'note',  max: 8,  cost: geo(250, 1.5),  fx: [],                              desc: 'Earn more Records while you are away (and a longer away cap).', special: 'offline' },
};
export const STUDIO_IDS = Object.keys(STUDIO);
export const HERO_MAX = 10;
export const heroCost = (lv) => Math.round(120 * Math.pow(1.5, lv - 1));     // price to go from lv to lv+1
export const LOADOUT_BASE = 12;
export const AUTOMERGE_PRICE = 150;   // diamonds

// ---------------------------------------------------------------- Gear
export const SLOTS = ['head', 'mic', 'body', 'chain', 'feet'];
export const SLOT_NAMES = { head: 'Headwear', mic: 'Microphone', body: 'Top', chain: 'Bling', feet: 'Sneakers' };
// stat id -> { base per rarity-mult at level 1, label, fx(value) -> fx list }
export const STATS = {
  dmg:      { base: 0.040, label: 'Damage',            fmt: 'pct', fx: (v) => [['dmg', 'mul', 1 + v]] },
  rate:     { base: 0.030, label: 'Fire rate',         fmt: 'pct', fx: (v) => [['rate', 'mul', 1 + v]] },
  crit:     { base: 0.020, label: 'Crit chance',       fmt: 'pct', fx: (v) => [['crit', 'add', v]] },
  critdmg:  { base: 0.060, label: 'Crit damage',       fmt: 'pct', fx: (v) => [['critDmg', 'add', v]] },
  range:    { base: 0.025, label: 'Range',             fmt: 'pct', fx: (v) => [['range', 'mul', 1 + v]] },
  coin:     { base: 0.050, label: 'Coins',             fmt: 'pct', fx: (v) => [['coin', 'mul', 1 + v]] },
  hype:     { base: 0.050, label: 'Hype',              fmt: 'pct', fx: (v) => [['hype', 'mul', 1 + v]] },
  stagehp:  { base: 1.0,   label: 'Stage health',      fmt: 'int', fx: (v) => [['stageHp', 'add', Math.round(v)]] },
  herocd:   { base: 0.030, label: 'Hero recharge',     fmt: 'pct', fx: (v) => [['heroCd', 'mul', Math.max(0.5, 1 - v)]] },
  heropow:  { base: 0.050, label: 'Hero power',        fmt: 'pct', fx: (v) => [['heroPow', 'mul', 1 + v]] },
  deploy:   { base: 0.020, label: 'Cheaper deploys',   fmt: 'pct', fx: (v) => [['deployCost', 'mul', Math.max(0.5, 1 - v)]] },
  cash:     { base: 12,    label: 'Starting coins',    fmt: 'int', fx: (v) => [['startCoins', 'add', Math.round(v)]] },
  lucky:    { base: 0.010, label: 'Lucky deploys',     fmt: 'pct', fx: (v) => [['lucky', 'add', v]] },
};
export const SETS = {
  mohawk: { id: 'mohawk', name: 'Mohawk Mayhem', hero: 'roxor',  color: '#9dff3a',
            bonus: { 2: { stat: 'dmg', v: 0.06, text: '+6% damage' }, 3: { stat: 'crit', v: 0.04, text: '+4% crit' }, 5: { stat: 'dmg', v: 0.15, text: '+15% damage' } } },
  pink:   { id: 'pink',   name: 'Pink Harmony',  hero: 'jasmin', color: '#ff5fb0',
            bonus: { 2: { stat: 'heropow', v: 0.08, text: '+8% hero power' }, 3: { stat: 'herocd', v: 0.06, text: 'Heroes recharge 6% faster' }, 5: { stat: 'rate', v: 0.12, text: '+12% fire rate' } } },
  neon:   { id: 'neon',   name: 'Neon Nights',   hero: 'duo',    color: '#2fe6ff',
            bonus: { 2: { stat: 'coin', v: 0.08, text: '+8% coins' }, 3: { stat: 'hype', v: 0.08, text: '+8% hype' }, 5: { stat: 'coin', v: 0.2, text: '+20% coins' } } },
};
// 30 templates: 6 per slot. set = SETS id or null. main stat always; sub stat applies from epic up.
export const GEAR = {
  // head
  head_cap:      { id: 'head_cap',      slot: 'head',  name: 'Trucker Cap',        set: null,     main: 'hype',    sub: 'cash',    glyph: 'hat' },
  head_headph:   { id: 'head_headph',   slot: 'head',  name: 'Studio Headphones',  set: null,     main: 'range',   sub: 'crit',    glyph: 'speaker' },
  head_mohawk:   { id: 'head_mohawk',   slot: 'head',  name: 'Mohawk Gel Crown',   set: 'mohawk', main: 'crit',    sub: 'critdmg', glyph: 'crown' },
  head_scrunchie:{ id: 'head_scrunchie',name: 'Pink Scrunchie',  slot: 'head',  set: 'pink',   main: 'herocd',  sub: 'heropow', glyph: 'flower' },
  head_shades:   { id: 'head_shades',   slot: 'head',  name: 'Neon Shades',        set: 'neon',   main: 'coin',    sub: 'hype',    glyph: 'eye' },
  head_halo:     { id: 'head_halo',     slot: 'head',  name: 'Golden Halo',        set: null,     main: 'dmg',     sub: 'rate',    glyph: 'sparkle' },
  // mic
  mic_old:       { id: 'mic_old',       slot: 'mic',   name: 'Old Faithful Mic',   set: null,     main: 'dmg',     sub: 'range',   glyph: 'mic' },
  mic_green:     { id: 'mic_green',     slot: 'mic',   name: 'Green Band Mic',     set: 'mohawk', main: 'dmg',     sub: 'crit',    glyph: 'mic' },
  mic_pink:      { id: 'mic_pink',      slot: 'mic',   name: 'Pink Band Mic',      set: 'pink',   main: 'heropow', sub: 'rate',    glyph: 'mic' },
  mic_neon:      { id: 'mic_neon',      slot: 'mic',   name: 'Neon Tube Mic',      set: 'neon',   main: 'crit',    sub: 'coin',    glyph: 'mic' },
  mic_loop:      { id: 'mic_loop',      slot: 'mic',   name: 'Loop Pedal Mic',     set: null,     main: 'rate',    sub: 'dmg',     glyph: 'merge' },
  mic_gold:      { id: 'mic_gold',      slot: 'mic',   name: 'Gold Record Mic',    set: null,     main: 'critdmg', sub: 'dmg',     glyph: 'record' },
  // body
  body_tee:      { id: 'body_tee',      slot: 'body',  name: 'Smiley Tee',         set: 'mohawk', main: 'stagehp', sub: 'dmg',     glyph: 'drop' },
  body_hoodie:   { id: 'body_hoodie',   slot: 'body',  name: 'Tour Hoodie',        set: null,     main: 'stagehp', sub: 'coin',    glyph: 'shield' },
  body_pink:     { id: 'body_pink',     slot: 'body',  name: 'Pink Crop Top',      set: 'pink',   main: 'hype',    sub: 'heropow', glyph: 'heart' },
  body_jacket:   { id: 'body_jacket',   slot: 'body',  name: 'Neon Jacket',        set: 'neon',   main: 'coin',    sub: 'stagehp', glyph: 'bolt' },
  body_onesie:   { id: 'body_onesie',   slot: 'body',  name: 'Comfy Onesie',       set: null,     main: 'stagehp', sub: 'herocd',  glyph: 'cat' },
  body_stage:    { id: 'body_stage',    slot: 'body',  name: 'Stage Suit',         set: null,     main: 'dmg',     sub: 'hype',    glyph: 'star' },
  // chain
  chain_heart:   { id: 'chain_heart',   slot: 'chain', name: 'Heart Necklace',     set: 'pink',   main: 'herocd',  sub: 'stagehp', glyph: 'heart' },
  chain_gold:    { id: 'chain_gold',    slot: 'chain', name: 'Gold Chain',         set: null,     main: 'coin',    sub: 'cash',    glyph: 'coin' },
  chain_smiley:  { id: 'chain_smiley',  slot: 'chain', name: 'Orange Smiley Pin',  set: 'mohawk', main: 'lucky',   sub: 'crit',    glyph: 'sparkle' },
  chain_dogtag:  { id: 'chain_dogtag',  slot: 'chain', name: 'Backstage Pass',     set: 'neon',   main: 'hype',    sub: 'deploy',  glyph: 'ticket' },
  chain_clover:  { id: 'chain_clover',  slot: 'chain', name: 'Lucky Clover',       set: null,     main: 'lucky',   sub: 'crit',    glyph: 'clover' },
  chain_disc:    { id: 'chain_disc',    slot: 'chain', name: 'Platinum Disc',      set: null,     main: 'dmg',     sub: 'coin',    glyph: 'disc' },
  // feet
  feet_lime:     { id: 'feet_lime',     slot: 'feet',  name: 'Lime Sneakers',      set: 'mohawk', main: 'rate',    sub: 'dmg',     glyph: 'shoe' },
  feet_pink:     { id: 'feet_pink',     slot: 'feet',  name: 'Pink High-Tops',     set: 'pink',   main: 'deploy',  sub: 'rate',    glyph: 'shoe' },
  feet_neon:     { id: 'feet_neon',     slot: 'feet',  name: 'Glow Laces',         set: 'neon',   main: 'cash',    sub: 'coin',    glyph: 'shoe' },
  feet_boots:    { id: 'feet_boots',    slot: 'feet',  name: 'Stomp Boots',        set: null,     main: 'dmg',     sub: 'stagehp', glyph: 'shoe' },
  feet_slides:   { id: 'feet_slides',   slot: 'feet',  name: 'Comfy Slides',       set: null,     main: 'cash',    sub: 'deploy',  glyph: 'shoe' },
  feet_rocket:   { id: 'feet_rocket',   slot: 'feet',  name: 'Rocket Runners',     set: null,     main: 'rate',    sub: 'range',   glyph: 'rocket' },
};
export const GEAR_IDS = Object.keys(GEAR);
export const GEAR_MAX_LEVEL = 10;
export const gearUpgradeCost = (rarityIdx, lvl) => Math.round((40 + 30 * rarityIdx) * Math.pow(1.45, lvl - 1));  // lvl -> lvl+1
export const GEAR_SELL = { common: 15, rare: 50, epic: 180, legendary: 700, mythic: 2500 };   // records when scrapped

// ---------------------------------------------------------------- Crates (odds shown in the UI come from these tables)
export const CRATES = {
  garage:   { id: 'garage',   name: 'Garage Crate',   price: { records: 400 },  items: 1, odds: { common: 70, rare: 25, epic: 4.6, legendary: 0.4, mythic: 0 },
              blurb: 'A dented crate from the back of the van.' },
  studio:   { id: 'studio',   name: 'Studio Crate',   price: { diamonds: 40 },  items: 1, odds: { common: 35, rare: 42, epic: 18, legendary: 4.5, mythic: 0.5 },
              blurb: 'Fresh from the studio. Better odds, shinier things.' },
  platinum: { id: 'platinum', name: 'Platinum Crate', price: { diamonds: 140 }, items: 3, odds: { common: 0, rare: 55, epic: 33, legendary: 10, mythic: 2 }, guarantee: 'epic',
              blurb: 'Three items, at least one Epic. Gold-plated.' },
};
export const CRATE_IDS = Object.keys(CRATES);
export const PITY = { epicEvery: 10, legendaryEvery: 40 };   // guaranteed after this many crate items without one

// ---------------------------------------------------------------- Fame (account level)
export const fansForLevel = (lv) => 50 + 45 * lv + 6 * lv * lv;          // fans needed to go from lv to lv+1
export const FAME_MAX = 50;
export function fameReward(lv) {   // reward for reaching level lv
  const r = { diamonds: 5 + Math.floor(lv / 2), records: 60 * lv };
  if (lv % 5 === 0) r.crate = lv % 10 === 0 ? 'studio' : 'garage';
  for (const [id, t] of Object.entries(TURRETS)) if (t.unlock.fame === lv && lv > 1) (r.unlocks = r.unlocks || []).push(id);
  return r;
}

// ---------------------------------------------------------------- Outfits (cosmetic)
// Every outfit: id, name, desc, price (diamonds, 0 when it is earned instead) and optional unlock: { world: 'beach' } (that stage is cleared) or { endless: 50 }
// (best Endless wave reached on any stage). An outfit with an unlock is granted free the moment the rule is met (meta.js syncOutfits). Ids are append-only.
const O = (id, name, desc, price, unlock) => (unlock ? { id, name, desc, price, unlock } : { id, name, desc, price });
export const OUTFITS = {
  roxor: {
    default: O('default', 'Classic Tee', 'The black tee with the yellow smiley.', 0),
    onesie: O('onesie', 'Monster Onesie', 'A cosy green monster hood with horns.', 120),
    stage: O('stage', 'Stage Sparkle', 'A purple sequin jacket, gold stripes and star pins.', 80),
    rocker: O('rocker', 'Punk Rocker', 'Studded leather jacket, band tee, ripped jeans and boots.', 160),
    beach: O('beach', 'Beach Bum', 'Flower shirt, board shorts, sandals and a straw hat. Clear Bonfire Beach.', 0, { world: 'beach' }),
    moon: O('moon', 'Moonlight Raver', 'Holographic jacket, glow-stick bracelets and a star visor. Clear Moonlight Rave.', 0, { world: 'moon' }),
    outfit_gold: O('outfit_gold', 'Golden Headliner', 'A gold sequin stage look. Reach wave 50 in Endless.', 0, { endless: 50 }),
  },
  jasmin: {
    default: O('default', 'Pink Top', 'The pink crop top and baggy cargo pants.', 0),
    onesie: O('onesie', 'Unicorn Onesie', 'A fluffy unicorn hood with a rainbow mane.', 120),
    stage: O('stage', 'Stage Sparkle', 'A pink sequin dress with star motifs and gold bangles.', 80),
    rocker: O('rocker', 'Punk Rocker', 'Plaid skirt, fishnet sleeves, band top and chunky boots.', 160),
    beach: O('beach', 'Beach Bloom', 'A sunny sundress, sandals and a flower crown. Clear Bonfire Beach.', 0, { world: 'beach' }),
    moon: O('moon', 'Moonlight Raver', 'Holographic jacket, glow-stick bracelets and a moon hair clip. Clear Moonlight Rave.', 0, { world: 'moon' }),
    outfit_gold: O('outfit_gold', 'Golden Headliner', 'A gold sequin stage dress and tiara. Reach wave 50 in Endless.', 0, { endless: 50 }),
  },
};

// ---------------------------------------------------------------- Daily login and quests
export const LOGIN_REWARDS = [
  { day: 1, records: 150 }, { day: 2, diamonds: 8 }, { day: 3, records: 300 }, { day: 4, diamonds: 12 },
  { day: 5, records: 500, crate: 'garage' }, { day: 6, diamonds: 20 }, { day: 7, diamonds: 30, crate: 'studio' },
];
// Streak bonuses on top of the 7-day calendar: each is paid once per profile the first time the login streak reaches `days`.
export const STREAK_MILESTONES = [
  { days: 7,  diamonds: 20 },
  { days: 14, diamonds: 40 },
  { days: 30, diamonds: 100, crate: 'studio' },
];
export const QUESTS = [
  { id: 'q_kills',   stat: 'kills',    goal: 150, text: 'Defeat 150 Static', reward: { records: 120 } },
  { id: 'q_kills2',  stat: 'kills',    goal: 400, text: 'Defeat 400 Static', reward: { records: 260 } },
  { id: 'q_merge',   stat: 'merges',   goal: 20,  text: 'Merge 20 times', reward: { records: 120 } },
  { id: 'q_merge2',  stat: 'merges',   goal: 50,  text: 'Merge 50 times', reward: { diamonds: 6 } },
  { id: 'q_deploy',  stat: 'deploys',  goal: 40,  text: 'Deploy 40 turrets', reward: { records: 100 } },
  { id: 'q_runs',    stat: 'runs',     goal: 3,   text: 'Play 3 runs', reward: { diamonds: 5 } },
  { id: 'q_win',     stat: 'wins',     goal: 1,   text: 'Win a stage', reward: { diamonds: 8 } },
  { id: 'q_boss',    stat: 'bosses',   goal: 2,   text: 'Defeat 2 bosses', reward: { diamonds: 8 } },
  { id: 'q_waves',   stat: 'waves',    goal: 30,  text: 'Clear 30 waves', reward: { records: 200 } },
  { id: 'q_hero',    stat: 'heroUses', goal: 12,  text: 'Use hero abilities 12 times', reward: { records: 120 } },
  { id: 'q_combo',   stat: 'bestCombo', goal: 25, text: 'Reach a 25 kill combo', reward: { diamonds: 5 }, max: true },
  { id: 'q_beat',    stat: 'perfects', goal: 10,  text: 'Make 10 on-beat deploys', reward: { records: 140 } },
  { id: 'q_remix',   stat: 'remixes',  goal: 8,   text: 'Pick 8 Remix cards', reward: { records: 140 } },
  { id: 'q_lvl5',    stat: 'maxLevel', goal: 5,   text: 'Merge a turret to level 5', reward: { diamonds: 6 }, max: true },
  // round 6 (append only). Stats come from the run result (meta.applyRunResult) or the crate, gear merge and wheel hooks in meta.js.
  { id: 'q_duet',    stat: 'duets',    goal: 2,   text: 'Trigger the Duet Finale 2 times', reward: { diamonds: 6 } },
  { id: 'q_relics',  stat: 'relics',   goal: 4,   text: 'Pick up 4 Merch relics', reward: { records: 160 } },
  { id: 'q_flaw',    stat: 'flawless', goal: 1,   text: 'Win a stage with no leaks', reward: { diamonds: 10 } },
  { id: 'q_modwin',  stat: 'modWins',  goal: 1,   text: 'Win a run with a modifier on', reward: { diamonds: 8 } },
  { id: 'q_crates',  stat: 'crates',   goal: 2,   text: 'Open 2 crates', reward: { records: 200 } },
  { id: 'q_gearmrg', stat: 'gearMerges', goal: 2, text: 'Merge gear 2 times', reward: { records: 180 } },
  { id: 'q_spin',    stat: 'spins',    goal: 1,   text: 'Spin the Lucky Wheel', reward: { records: 100 } },
  { id: 'q_daily',   stat: 'dailies',  goal: 1,   text: 'Play the Daily Challenge', reward: { diamonds: 6 } },
  { id: 'q_coins',   stat: 'coins',    goal: 3000, text: 'Earn 3,000 coins in your runs', reward: { records: 140 } },
  { id: 'q_endless', stat: 'endlessWave', goal: 12, text: 'Reach wave 12 in Endless', reward: { diamonds: 6 }, max: true },
  // round 7 (append only). Stats come from the run result (sim counters dropRerolls, sells, moves, branches, synergies).
  { id: 'q_reroll',  stat: 'dropRerolls', goal: 6, text: 'Re-roll the next drop 6 times', reward: { records: 120 } },
  { id: 'q_branch',  stat: 'branches', goal: 2,   text: 'Pick 2 turret upgrade paths', reward: { diamonds: 6 } },
  { id: 'q_move',    stat: 'moves',    goal: 8,   text: 'Move turrets 8 times', reward: { records: 110 } },
  { id: 'q_sell',    stat: 'sells',    goal: 4,   text: 'Sell 4 turrets', reward: { records: 100 } },
  { id: 'q_syn',     stat: 'synergies', goal: 3,  text: 'Have 3 synergy pairs active at once', reward: { diamonds: 6 }, max: true },
];

// ---------------------------------------------------------------- Achievements ("Stickers"), claimed for diamonds
export const ACHIEVEMENTS = [
  { id: 'a_kills1',   stat: 'kills',     goal: 100,    name: 'First Hundred',     text: 'Defeat 100 Static.',            diamonds: 5 },
  { id: 'a_kills2',   stat: 'kills',     goal: 1000,   name: 'Noise Cancelling',  text: 'Defeat 1,000 Static.',          diamonds: 15 },
  { id: 'a_kills3',   stat: 'kills',     goal: 10000,  name: 'Static Storm',      text: 'Defeat 10,000 Static.',         diamonds: 40 },
  { id: 'a_kills4',   stat: 'kills',     goal: 100000, name: 'Eternal Encore',    text: 'Defeat 100,000 Static.',        diamonds: 100 },
  { id: 'a_merge1',   stat: 'merges',    goal: 50,     name: 'Merge Rookie',      text: 'Merge 50 times.',               diamonds: 5 },
  { id: 'a_merge2',   stat: 'merges',    goal: 500,    name: 'Merge Maestro',     text: 'Merge 500 times.',              diamonds: 20 },
  { id: 'a_merge3',   stat: 'merges',    goal: 5000,   name: 'Merge Machine',     text: 'Merge 5,000 times.',            diamonds: 60 },
  { id: 'a_lvl5',     stat: 'maxLevel',  goal: 5,      name: 'Level Five',        text: 'Merge a turret to level 5.',    diamonds: 8, max: true },
  { id: 'a_lvl7',     stat: 'maxLevel',  goal: 7,      name: 'Maxed Out',         text: 'Merge a turret to level 7.',    diamonds: 25, max: true },
  { id: 'a_runs1',    stat: 'runs',      goal: 10,     name: 'Road Warriors',     text: 'Play 10 runs.',                 diamonds: 8 },
  { id: 'a_runs2',    stat: 'runs',      goal: 100,    name: 'Tour Veterans',     text: 'Play 100 runs.',                diamonds: 40 },
  { id: 'a_win1',     stat: 'wins',      goal: 1,      name: 'First Win',         text: 'Win a stage.',                  diamonds: 10 },
  { id: 'a_win2',     stat: 'wins',      goal: 25,     name: 'Headliners',        text: 'Win 25 stages.',                diamonds: 40 },
  { id: 'a_boss1',    stat: 'bosses',    goal: 5,      name: 'Boss Fight',        text: 'Defeat 5 bosses.',              diamonds: 10 },
  { id: 'a_boss2',    stat: 'bosses',    goal: 50,     name: 'Boss Rush',         text: 'Defeat 50 bosses.',             diamonds: 40 },
  { id: 'a_world2',   stat: 'worlds',    goal: 2,      name: 'On The Street',     text: 'Clear 2 stages.',               diamonds: 15, max: true },
  { id: 'a_world5',   stat: 'worlds',    goal: 5,      name: 'Mega Arena',        text: 'Clear the first 5 stages.',        diamonds: 80, max: true },
  { id: 'a_world7',   stat: 'worlds',    goal: 7,      name: 'Moon Walk',         text: 'Clear all 7 stages, up to the Moon.', diamonds: 120, max: true },
  { id: 'a_stars15',  stat: 'stars',     goal: 15,     name: 'Starstruck',        text: 'Collect 15 stars.',             diamonds: 20, max: true },
  { id: 'a_stars50',  stat: 'stars',     goal: 50,     name: 'Constellation',     text: 'Collect 50 stars.',             diamonds: 60, max: true },
  { id: 'a_combo',    stat: 'bestCombo', goal: 30,     name: 'Combo Breaker',     text: 'Reach a 30 kill combo.',        diamonds: 10, max: true },
  { id: 'a_combo2',   stat: 'bestCombo', goal: 50,     name: 'Unbroken',          text: 'Reach the 50 kill combo cap.',  diamonds: 30, max: true },
  { id: 'a_beat',     stat: 'perfects',  goal: 100,    name: 'Perfect Pitch',     text: 'Make 100 on-beat deploys.',     diamonds: 15 },
  { id: 'a_crates',   stat: 'crates',    goal: 10,     name: 'Crate Digger',      text: 'Open 10 crates.',               diamonds: 10 },
  { id: 'a_crates2',  stat: 'crates',    goal: 100,    name: 'Crate Hoarder',     text: 'Open 100 crates.',              diamonds: 50 },
  { id: 'a_legend',   stat: 'legendary', goal: 1,      name: 'Gold Rush',         text: 'Find a Legendary gear piece.',  diamonds: 25 },
  { id: 'a_gearmerge',stat: 'gearMerges',goal: 5,      name: 'Gear Alchemist',    text: 'Merge gear 5 times.',           diamonds: 15 },
  { id: 'a_fame10',   stat: 'fame',      goal: 10,     name: 'Local Legend',      text: 'Reach Fame level 10.',          diamonds: 30, max: true },
  { id: 'a_fame25',   stat: 'fame',      goal: 25,     name: 'Household Name',    text: 'Reach Fame level 25.',          diamonds: 80, max: true },
  { id: 'a_endless1', stat: 'endless',   goal: 25,     name: 'Overtime',          text: 'Reach wave 25 in Endless.',     diamonds: 20, max: true },
  { id: 'a_endless2', stat: 'endless',   goal: 50,     name: 'Marathon',          text: 'Reach wave 50 in Endless.',     diamonds: 60, max: true },
  { id: 'a_relics',   stat: 'relics',    goal: 25,     name: 'Merch Table',       text: 'Pick up 25 relics.',            diamonds: 20 },
  { id: 'a_streak7',  stat: 'streak',    goal: 7,      name: 'Seven Day Tour',    text: 'Log in 7 days in a row.',       diamonds: 25, max: true },
  { id: 'a_daily5',   stat: 'dailies',   goal: 5,      name: 'Daily Duet',        text: 'Complete 5 daily challenges.',  diamonds: 25 },
  { id: 'a_duet',     stat: 'duets',     goal: 10,     name: 'In Harmony',        text: 'Trigger the Duet Finale 10 times.', diamonds: 15 },
  { id: 'a_codex1',   stat: 'seenEnemies', goal: 10,  name: 'Know Your Enemy',   text: 'Meet all 10 kinds of Static.',  diamonds: 20, max: true },
  { id: 'a_codex2',   stat: 'seenBosses',  goal: 5,   name: 'Boss Collector',    text: 'Meet all 5 bosses.',            diamonds: 30, max: true },
  { id: 'a_rack',     stat: 'wins',        goal: 10,  name: 'Tour Regular',      text: 'Win 10 stages.',                diamonds: 40 },
  { id: 'a_rush',     stat: 'rushBest',    goal: 10,  name: 'Boss Rush Done',    text: 'Beat all 10 bosses in Boss Rush.', diamonds: 50, max: true },
  { id: 'a_wheel',    stat: 'spins',       goal: 10,  name: 'Lucky Spinner',     text: 'Spin the Lucky Wheel 10 times.', diamonds: 15 },
  { id: 'a_perfect',  stat: 'flawless',  goal: 1,      name: 'Not A Scratch',     text: 'Win a stage with no leaks.',    diamonds: 20 },
];

// Star milestones on the Tour screen: total stars -> reward
export const STAR_MILESTONES = [
  { stars: 3,  reward: { records: 300 } },
  { stars: 6,  reward: { crate: 'garage' } },
  { stars: 10, reward: { diamonds: 20 } },
  { stars: 15, reward: { crate: 'studio' } },
  { stars: 22, reward: { diamonds: 30 } },
  { stars: 30, reward: { crate: 'studio', diamonds: 20 } },
  { stars: 40, reward: { diamonds: 50 } },
  { stars: 50, reward: { crate: 'platinum' } },
  { stars: 60, reward: { diamonds: 80 } },
  { stars: 75, reward: { crate: 'platinum', diamonds: 50 } },
];

// ---------------------------------------------------------------- Boosters: optional pre-run purchases (diamonds)
export const BOOSTERS = {
  cash:  { id: 'cash',  name: 'Head Start',  glyph: 'coin',    price: 8,  desc: '+250 starting coins.',                         fx: [['startCoins', 'add', 250]] },
  lucky: { id: 'lucky', name: 'Lucky Start', glyph: 'dice',    price: 10, desc: 'First 3 drops are free and 25% start at level 2.', fx: [['freeDeploys', 'add', 3], ['lucky', 'add', 0.25]] },
  tough: { id: 'tough', name: 'Roadies',     glyph: 'shield',  price: 8,  desc: '+6 stage health.',                             fx: [['stageHp', 'add', 6]] },
  hype:  { id: 'hype',  name: 'Hype Pack',   glyph: 'rocket',  price: 12, desc: 'Start with a Remix pick ready.',               fx: [], special: 'hype' },
};
export const BOOSTER_IDS = Object.keys(BOOSTERS);

// ---------------------------------------------------------------- Lucky Wheel: one free spin a day, more for diamonds
export const WHEEL_SPIN_PRICE = 15;
export const WHEEL = [
  { id: 'r100',  weight: 22, label: '100',   reward: { records: 100 },  glyph: 'record' },
  { id: 'd5',    weight: 18, label: '5',     reward: { diamonds: 5 },   glyph: 'diamond' },
  { id: 'r250',  weight: 16, label: '250',   reward: { records: 250 },  glyph: 'record' },
  { id: 'c1',    weight: 10, label: 'Crate', reward: { crate: 'garage' }, glyph: 'gift' },
  { id: 'd10',   weight: 12, label: '10',    reward: { diamonds: 10 },  glyph: 'diamond' },
  { id: 'r600',  weight: 8,  label: '600',   reward: { records: 600 },  glyph: 'record' },
  { id: 'c2',    weight: 4,  label: 'Studio', reward: { crate: 'studio' }, glyph: 'gift' },
  { id: 'd30',   weight: 2,  label: '30',    reward: { diamonds: 30 },  glyph: 'diamond' },
];

// ---------------------------------------------------------------- Fame titles (shown next to the Fame level)
export const FAME_TITLES = [
  [1, 'Garage Band'], [3, 'Street Busker'], [6, 'Open Mic Hero'], [10, 'Local Legend'], [14, 'Club Regular'], [19, 'Opening Act'],
  [25, 'Household Name'], [31, 'Festival Headliner'], [38, 'Chart Topper'], [45, 'Arena Star'], [50, 'Bass Legend'],
];
export function fameTitle(lv) {
  let t = FAME_TITLES[0][1];
  for (const [min, name] of FAME_TITLES) if (lv >= min) t = name;
  return t;
}

// ---------------------------------------------------------------- Weekly Gig (one fixed run per ISO week, same seed for everyone)
// Each gig = one DAILY_MODS id (the sim's opts.daily) + a few extra base effects, on a fixed stage, 25 waves.
// Rotation is by week number, so neighbouring weeks never repeat.
export const WEEKLY_WAVES = 25;
export const WEEKLY_GIGS = [
  { id: 'garage_marathon', name: 'Garage Marathon',  mod: 'rich_tour',       world: 'garage',   extra: [['enemyHp', 'mul', 1.25]] },
  { id: 'street_sprint',   name: 'Street Sprint',    mod: 'speed_run',       world: 'busk',     extra: [['enemyHp', 'mul', 1.15]] },
  { id: 'club_glass',      name: 'Glass Night',      mod: 'glass_cannon',    world: 'club',     extra: [['rate', 'mul', 1.15]] },
  { id: 'festival_remix',  name: 'Festival Remix',   mod: 'level_three',     world: 'festival', extra: [['enemyHp', 'mul', 1.2]] },
  { id: 'solo_tour',       name: 'Solo Tour',        mod: 'no_merge',        world: 'busk',     extra: [['enemyHp', 'mul', 1.3]] },
  { id: 'arena_duet',      name: 'Arena Duet',       mod: 'two_instruments', world: 'arena',    extra: [['enemyHp', 'mul', 1.35]] },
];
export const WEEKLY_REWARD = { diamonds: 20, perWave: 1, winDiamonds: 25, records: 600, perWaveRecords: 60, fans: 120, crate: 'studio', crateMinWaves: 15 };

// ---------------------------------------------------------------- Seasons (round 6): one theme per calendar month
// SEASONS[month 1..12] = { id, name, desc, accent (card colour), theme (glyph name for the card art), keepsake }. The keepsake is a limited-time
// cosmetic granted ONCE per season when all three season goals are claimed: { kind: 'outfit', id } (both heroes get it) or { kind: 'skin', id }.
// There is no new art: every keepsake reuses an existing outfit or board skin id. If the player already owns it, the keepsake pays SEASON_KEEPSAKE_BONUS instead.
// Season ids and goal ids are append-only (profile.season points at them). The English name and desc go through the data overlay (SEASONS.<month>.name).
export const SEASONS = {
  1:  { id: 'winter_gig',       name: 'Winter Gig',          desc: 'Snowed-in sessions. The Static freeze up and the crowd sings along.',   accent: '#6fb7ff', theme: 'snow',    keepsake: { kind: 'skin', id: 'skin_chalk' } },
  2:  { id: 'heart_beat',       name: 'Heart Beat Month',    desc: 'Love songs only. Every merge makes the speakers blush.',                 accent: '#ff6f9f', theme: 'heart',   keepsake: { kind: 'outfit', id: 'stage' } },
  3:  { id: 'spring_bloom',     name: 'Spring Bloom',        desc: 'Flowers on the amps and sunshine on the stage.',                         accent: '#7fd66b', theme: 'flower',  keepsake: { kind: 'skin', id: 'skin_sticker' } },
  4:  { id: 'rainy_remix',      name: 'Rainy Day Remix',     desc: 'Puddles, umbrellas and a very wet bass drop.',                           accent: '#5aa7e8', theme: 'drop',    keepsake: { kind: 'outfit', id: 'onesie' } },
  5:  { id: 'street_festival',  name: 'Street Festival',     desc: 'Banners up, buskers out. Play every corner of town.',                    accent: '#ff9f43', theme: 'horn',    keepsake: { kind: 'outfit', id: 'rocker' } },
  6:  { id: 'beach_bash',       name: 'Summer Beach Bash',   desc: 'Sand, sun and subwoofers. The beach party never stops.',                 accent: '#ffc83d', theme: 'sparkle', keepsake: { kind: 'outfit', id: 'beach' } },
  7:  { id: 'heatwave_rave',    name: 'Heatwave Rave',       desc: 'It is hot, it is loud, and the Static are melting.',                     accent: '#ff5a4f', theme: 'fire',    keepsake: { kind: 'skin', id: 'skin_midnight' } },
  8:  { id: 'sunset_sessions',  name: 'Sunset Sessions',     desc: 'Golden hour jams on the rooftop.',                                       accent: '#ff8a5c', theme: 'star',    keepsake: { kind: 'outfit', id: 'moon' } },
  9:  { id: 'back_to_beats',    name: 'Back to School Beats', desc: 'New term, new tempo. Show the class how it is done.',                   accent: '#b78af0', theme: 'note',    keepsake: { kind: 'outfit', id: 'stage' } },
  10: { id: 'spooky_static',    name: 'Spooky Static',       desc: 'Things go buzz in the night. Be brave, keep the beat.',                  accent: '#ff7a1c', theme: 'skull',   keepsake: { kind: 'outfit', id: 'onesie' } },
  11: { id: 'autumn_harvest',   name: 'Autumn Harvest Jam',  desc: 'Falling leaves, warm amps and a bumper crop of beats.',                  accent: '#c9822b', theme: 'clover',  keepsake: { kind: 'skin', id: 'skin_chalk' } },
  12: { id: 'snowy_encore',     name: 'Snowy Encore',        desc: 'One last show of the year under the fairy lights.',                      accent: '#8fd3ff', theme: 'bell',    keepsake: { kind: 'skin', id: 'skin_midnight' } },
};
// The three goals of every season, counted from the first of the month (profile.season.progress). Rewards are paid on claim.
export const SEASON_GOALS = [
  { id: 'kills',  stat: 'kills',  goal: 2500, reward: { records: 900 } },
  { id: 'merges', stat: 'merges', goal: 400,  reward: { diamonds: 20 } },
  { id: 'wins',   stat: 'wins',   goal: 8,    reward: { diamonds: 30, records: 600 } },
];
export const SEASON_KEEPSAKE_BONUS = { diamonds: 25 };

// ---------------------------------------------------------------- Board skins (cosmetic, bought with diamonds)
// The art lives in doodle_env.js (BOARD_SKINS names and descriptions). Here only the shop side: ids (append-only) and prices.
// Owned skins: profile.skins.owned, equipped one: profile.settings.skin. The default skin is free and always owned.
export const SKIN_DEFAULT = 'skin_paper';
export const SKIN_PRICES = { skin_paper: 0, skin_chalk: 60, skin_sticker: 100, skin_midnight: 140 };
export const SKIN_IDS = Object.keys(SKIN_PRICES);
// fallback names, used when doodle_env.js has no BOARD_SKINS yet
export const SKIN_FALLBACK = {
  skin_paper: { name: 'Notebook Paper', desc: 'The classic ruled page with tape and crayon.' },
  skin_chalk: { name: 'Chalkboard', desc: 'A dark slate board with chalk-white outlines.' },
  skin_sticker: { name: 'Scrapbook', desc: 'A bright pastel page with washi tape and stickers.' },
  skin_midnight: { name: 'Midnight Page', desc: 'An inky night page with glow crayon lines.' },
};
