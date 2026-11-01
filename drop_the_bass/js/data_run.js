// data_run.js: in-run progression data. Remix cards (stackable, picked on level up), relics ("Merch", unique passives),
// wave modifiers (a twist on one wave) and daily challenge modifiers. Pure data plus the tiny effect applier.
// fx = list of [path, op, value]. op 'mul' multiplies, 'add' adds, 'max' keeps the larger, 'set' sets. Path 'per.kick.dmg' targets one turret.
import { TURRETS } from './data_core.js';

export function freshMods() {
  const per = {};
  for (const id of Object.keys(TURRETS)) per[id] = { dmg: 1, rate: 1, range: 1, extra: 0 };
  return {
    dmg: 1, rate: 1, range: 1, crit: 0, critDmg: 0, coin: 1, deployCost: 1, sell: 0, hype: 1, interest: 0,
    freeDeploys: 0, lucky: 0, mergeRefund: 0, mergeBuff: 0, mergeSpawn: 0, armorPierce: 0, bossDmg: 1, enemySlow: 0,
    heroCd: 1, heroPow: 1, stageHp: 0, waveCoins: 0, splash: 1, chains: 0, rerolls: 0, enemySpeed: 1, enemyHp: 1,
    comboBonus: 1, dropEvery: 0, dropPower: 0, hotStreak: 0, lastStand: 0, healKills: 0, gemChance: 0, beatBonus: 1,
    startLevel: 0, startCoins: 0, noMerge: 0, deployLimit: 0, auraBoost: 1, burn: 0, execute: 0, thorns: 0, reviveOnce: 0, coinOnCrit: 0,
    per,
  };
}
export function applyFx(mod, fx, stacks = 1) {
  for (const [path, op, v] of fx) {
    const parts = path.split('.');
    let o = mod;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const k = parts[parts.length - 1];
    for (let s = 0; s < stacks; s++) {
      if (op === 'mul') o[k] *= v;
      else if (op === 'add') o[k] += v;
      else if (op === 'max') o[k] = Math.max(o[k], v);
      else o[k] = v;
    }
  }
}

// ---------------------------------------------------------------- Remix cards
// rarity weights come from RARITY. max = how many times it may be picked in a run. turret = only offered when that turret is in the loadout.
export const REMIX = {
  bass_boost:   { id: 'bass_boost',   name: 'Bass Boost',      rarity: 'common',    glyph: 'speaker', max: 8, desc: 'All turrets deal +12% damage.', fx: [['dmg', 'mul', 1.12]] },
  tempo_up:     { id: 'tempo_up',     name: 'Tempo Up',        rarity: 'common',    glyph: 'clock',   max: 8, desc: 'All turrets fire 10% faster.', fx: [['rate', 'mul', 1.10]] },
  soundcheck:   { id: 'soundcheck',   name: 'Soundcheck',      rarity: 'common',    glyph: 'target',  max: 5, desc: 'All turrets gain +8% range.', fx: [['range', 'mul', 1.08]] },
  lucky_break:  { id: 'lucky_break',  name: 'Lucky Break',     rarity: 'common',    glyph: 'clover',  max: 6, desc: '+6% crit chance.', fx: [['crit', 'add', 0.06]] },
  big_hits:     { id: 'big_hits',     name: 'Big Hits',        rarity: 'common',    glyph: 'bolt',    max: 5, desc: 'Crits deal +40% more.', fx: [['critDmg', 'add', 0.4]] },
  piggy_bank:   { id: 'piggy_bank',   name: 'Piggy Bank',      rarity: 'common',    glyph: 'bag',     max: 6, desc: '+15% coins from kills.', fx: [['coin', 'mul', 1.15]] },
  interest:     { id: 'interest',     name: 'Royalties',       rarity: 'rare',      glyph: 'record',  max: 4, desc: 'After each wave, earn 4% of your coins (max 60).', fx: [['interest', 'add', 0.04]] },
  discount:     { id: 'discount',     name: 'Roadie Discount', rarity: 'common',    glyph: 'ticket',  max: 5, desc: 'Deploys cost 7% less.', fx: [['deployCost', 'mul', 0.93]] },
  free_sample:  { id: 'free_sample',  name: 'Free Samples',    rarity: 'common',    glyph: 'gift',    max: 4, desc: 'The next 3 deploys are free.', fx: [['freeDeploys', 'add', 3]] },
  lucky_drop:   { id: 'lucky_drop',   name: 'Lucky Drop',      rarity: 'rare',      glyph: 'dice',    max: 4, desc: '12% of deploys arrive as level 2.', fx: [['lucky', 'add', 0.12]] },
  recycler:     { id: 'recycler',     name: 'Recycler',        rarity: 'common',    glyph: 'sell',    max: 3, desc: 'Selling refunds 15% more.', fx: [['sell', 'add', 0.15]] },
  hype_train:   { id: 'hype_train',   name: 'Hype Train',      rarity: 'common',    glyph: 'rocket',  max: 4, desc: '+25% hype from kills.', fx: [['hype', 'mul', 1.25]] },
  encore_hp:    { id: 'encore_hp',    name: 'Crowd Energy',    rarity: 'common',    glyph: 'heart',   max: 5, desc: '+4 stage health.', fx: [['stageHp', 'add', 4]] },
  reroller:     { id: 'reroller',     name: 'Remix Master',    rarity: 'common',    glyph: 'reroll',  max: 3, desc: '+2 free rerolls for cards and drops.', fx: [['rerolls', 'add', 2]] },
  overdrive:    { id: 'overdrive',    name: 'Overdrive',       rarity: 'rare',      glyph: 'fire',    max: 4, desc: 'Merging a turret makes it fire 30% faster for 6 seconds.', fx: [['mergeBuff', 'add', 6]] },
  merge_refund: { id: 'merge_refund', name: 'Merge Rebate',    rarity: 'rare',      glyph: 'merge',   max: 3, desc: 'Every merge refunds 25% of a deploy.', fx: [['mergeRefund', 'add', 0.25]] },
  twin_spawn:   { id: 'twin_spawn',   name: 'Twin Spawn',      rarity: 'epic',      glyph: 'double',  max: 3, desc: '20% of merges also spawn a free level 1 turret.', fx: [['mergeSpawn', 'add', 0.2]] },
  combo_master: { id: 'combo_master', name: 'Combo Master',    rarity: 'rare',      glyph: 'star',    max: 4, desc: 'Kill combos give 50% more bonus coins.', fx: [['comboBonus', 'mul', 1.5]] },
  slow_mo:      { id: 'slow_mo',      name: 'Slow Mo',         rarity: 'rare',      glyph: 'hourglass', max: 4, desc: 'All Static move 6% slower.', fx: [['enemySlow', 'add', 0.06]] },
  pierce_armor: { id: 'pierce_armor', name: 'Armor Pierce',    rarity: 'rare',      glyph: 'arrow_up', max: 3, desc: 'Hits ignore 30% of armor.', fx: [['armorPierce', 'add', 0.3]] },
  boss_hunter:  { id: 'boss_hunter',  name: 'Boss Hunter',     rarity: 'rare',      glyph: 'crown',   max: 3, desc: '+30% damage to bosses.', fx: [['bossDmg', 'mul', 1.3]] },
  hero_cd:      { id: 'hero_cd',      name: 'Quick Hands',     rarity: 'common',    glyph: 'clock',   max: 4, desc: 'Hero abilities recharge 15% faster.', fx: [['heroCd', 'mul', 0.85]] },
  hero_pow:     { id: 'hero_pow',     name: 'Spotlight',       rarity: 'rare',      glyph: 'sparkle', max: 4, desc: 'Hero abilities are 25% stronger.', fx: [['heroPow', 'mul', 1.25]] },
  wave_cash:    { id: 'wave_cash',    name: 'Tip Jar',         rarity: 'common',    glyph: 'coin',    max: 5, desc: 'Start every wave with +25 coins.', fx: [['waveCoins', 'add', 25]] },
  splash_up:    { id: 'splash_up',    name: 'Wider Waves',     rarity: 'rare',      glyph: 'wave',    max: 4, desc: 'Blasts and pulses are 15% wider.', fx: [['splash', 'mul', 1.15]] },
  chain_up:     { id: 'chain_up',     name: 'Extra Cable',     rarity: 'epic',      glyph: 'plug',    max: 2, desc: 'Chain lightning jumps +1 time.', fx: [['chains', 'add', 1]] },
  hot_streak:   { id: 'hot_streak',   name: 'Hot Streak',      rarity: 'rare',      glyph: 'fire',    max: 3, desc: 'With a 10+ combo, turrets fire 10% faster.', fx: [['hotStreak', 'add', 0.1]] },
  last_stand:   { id: 'last_stand',   name: 'Last Stand',      rarity: 'rare',      glyph: 'shield',  max: 2, desc: 'At 6 or less stage health, deal +40% damage.', fx: [['lastStand', 'add', 0.4]] },
  heal_kills:   { id: 'heal_kills',   name: 'Fresh Air',       rarity: 'epic',      glyph: 'flower',  max: 2, desc: 'Every 40 kills restores 1 stage health.', fx: [['healKills', 'add', 40]] },
  gem_hunter:   { id: 'gem_hunter',   name: 'Gem Hunter',      rarity: 'epic',      glyph: 'diamond', max: 3, desc: 'Kills have a small chance to drop a diamond.', fx: [['gemChance', 'add', 0.004]] },
  on_beat:      { id: 'on_beat',      name: 'Perfect Pitch',   rarity: 'rare',      glyph: 'note',    max: 3, desc: 'On-beat deploys give twice the discount.', fx: [['beatBonus', 'mul', 2]] },
  bass_drop:    { id: 'bass_drop',    name: 'The Drop',        rarity: 'epic',      glyph: 'drop',    max: 3, desc: 'Every 18 seconds a shockwave hits every enemy for big damage.', fx: [['dropEvery', 'max', 18], ['dropPower', 'add', 1]] },
  burn_notes:   { id: 'burn_notes',   name: 'Hot Licks',       rarity: 'rare',      glyph: 'fire',    max: 3, desc: 'Hits set enemies alight (damage over time).', fx: [['burn', 'add', 1]] },
  executioner:  { id: 'executioner',  name: 'Cut Track',       rarity: 'epic',      glyph: 'skull',   max: 2, desc: 'Normal enemies under 10% health die instantly.', fx: [['execute', 'add', 0.1]] },
  coin_crit:    { id: 'coin_crit',    name: 'Cha-Ching',       rarity: 'rare',      glyph: 'coin',    max: 3, desc: 'Crit kills drop 2 bonus coins.', fx: [['coinOnCrit', 'add', 2]] },
  aura_up:      { id: 'aura_up',      name: 'Good Vibes',      rarity: 'rare',      glyph: 'sparkle', max: 3, desc: 'Loop Station and Amp Stack auras are 25% stronger.', fx: [['auraBoost', 'mul', 1.25]] },
  platinum:     { id: 'platinum',     name: 'Platinum Record', rarity: 'legendary', glyph: 'record',  max: 2, desc: 'All turrets deal +60% damage.', fx: [['dmg', 'mul', 1.6]] },
  double_time:  { id: 'double_time',  name: 'Double Time',     rarity: 'legendary', glyph: 'ff',      max: 2, desc: 'All turrets fire 35% faster. Enemies move 5% faster.', fx: [['rate', 'mul', 1.35], ['enemySpeed', 'mul', 1.05]] },
  sold_out:     { id: 'sold_out',     name: 'Sold Out Show',   rarity: 'legendary', glyph: 'ticket',  max: 2, desc: '+50% coins and +25% hype for the rest of the run.', fx: [['coin', 'mul', 1.5], ['hype', 'mul', 1.25]] },
  second_wind:  { id: 'second_wind',  name: 'Second Wind',     rarity: 'legendary', glyph: 'heart',   max: 1, desc: 'Once per run, if the stage falls, it is restored to half health.', fx: [['reviveOnce', 'add', 1]] },
  // per turret (only offered when that turret is in the loadout)
  kick_blast:   { id: 'kick_blast',   name: 'Heavier Kick',    rarity: 'common',    glyph: 'drop',    max: 5, turret: 'kick',    desc: 'Kick Cannon: +30% damage.', fx: [['per.kick.dmg', 'mul', 1.3]] },
  snare_roll:   { id: 'snare_roll',   name: 'Snare Roll',      rarity: 'common',    glyph: 'disc',    max: 5, turret: 'snare',   desc: 'Snare Snapper: +25% fire rate.', fx: [['per.snare.rate', 'mul', 1.25]] },
  hat_spin:     { id: 'hat_spin',     name: 'Open Hat',        rarity: 'common',    glyph: 'hat',     max: 5, turret: 'hat',     desc: 'Hi-Hat Gatling: +30% damage.', fx: [['per.hat.dmg', 'mul', 1.3]] },
  sub_deep:     { id: 'sub_deep',     name: 'Deep Sub',        rarity: 'common',    glyph: 'speaker', max: 5, turret: 'sub',     desc: 'Sub Bass: +30% damage and +10% range.', fx: [['per.sub.dmg', 'mul', 1.3], ['per.sub.range', 'mul', 1.1]] },
  mic_high:     { id: 'mic_high',     name: 'High Note',       rarity: 'common',    glyph: 'mic',     max: 5, turret: 'mic',     desc: 'Siren Mic: +30% damage.', fx: [['per.mic.dmg', 'mul', 1.3]] },
  synth_patch:  { id: 'synth_patch',  name: 'New Patch',       rarity: 'common',    glyph: 'bolt',    max: 5, turret: 'synth',   desc: 'Arc Synth: +30% damage.', fx: [['per.synth.dmg', 'mul', 1.3]] },
  horn_loud:    { id: 'horn_loud',    name: 'Louder Horn',     rarity: 'common',    glyph: 'horn',    max: 5, turret: 'horn',    desc: 'Air Horn: +40% damage and +15% range.', fx: [['per.horn.dmg', 'mul', 1.4], ['per.horn.range', 'mul', 1.15]] },
  scratch_fast: { id: 'scratch_fast', name: 'Fast Hands',      rarity: 'common',    glyph: 'disc',    max: 5, turret: 'scratch', desc: 'Vinyl Scratcher: +25% damage and fire rate.', fx: [['per.scratch.dmg', 'mul', 1.25], ['per.scratch.rate', 'mul', 1.25]] },
  loop_tight:   { id: 'loop_tight',   name: 'Tight Loop',      rarity: 'rare',      glyph: 'merge',   max: 4, turret: 'loop',    desc: 'Loop Station aura is +40% stronger.', fx: [['per.loop.extra', 'add', 0.4]] },
  cowbell_more: { id: 'cowbell_more', name: 'More Cowbell',    rarity: 'common',    glyph: 'bell',    max: 5, turret: 'cowbell', desc: 'Cowbell Sniper: +35% damage.', fx: [['per.cowbell.dmg', 'mul', 1.35]] },
  amp_eleven:   { id: 'amp_eleven',   name: 'Up To Eleven',    rarity: 'rare',      glyph: 'speaker', max: 4, turret: 'amp',     desc: 'Amp Stack aura is +40% stronger.', fx: [['per.amp.extra', 'add', 0.4]] },
  vocal_harmony:{ id: 'vocal_harmony',name: 'Harmony',         rarity: 'common',    glyph: 'notes',   max: 5, turret: 'vocal',   desc: 'Choir Orb: +35% damage.', fx: [['per.vocal.dmg', 'mul', 1.35]] },
};
export const REMIX_IDS = Object.keys(REMIX);

// ---------------------------------------------------------------- Relics ("Merch"): unique passives found in chests and boss drops
export const RELICS = {
  lucky_hat:    { id: 'lucky_hat',    name: 'Lucky Hat',          rarity: 'common',    glyph: 'hat',    desc: '+8% crit chance.', fx: [['crit', 'add', 0.08]] },
  tour_van:     { id: 'tour_van',     name: 'Tour Van',           rarity: 'common',    glyph: 'van',    desc: '+8 stage health.', fx: [['stageHp', 'add', 8]] },
  gold_chain:   { id: 'gold_chain',   name: 'Gold Chain',         rarity: 'common',    glyph: 'coin',   desc: '+20% coins.', fx: [['coin', 'mul', 1.2]] },
  spare_cable:  { id: 'spare_cable',  name: 'Spare Cable',        rarity: 'common',    glyph: 'plug',   desc: 'Chain lightning jumps +1 time.', fx: [['chains', 'add', 1]] },
  setlist:      { id: 'setlist',      name: 'Setlist',            rarity: 'common',    glyph: 'tape',   desc: '+2 free rerolls.', fx: [['rerolls', 'add', 2]] },
  merch_tee:    { id: 'merch_tee',    name: 'Merch Tee',          rarity: 'common',    glyph: 'gift',   desc: 'Deploys cost 10% less.', fx: [['deployCost', 'mul', 0.9]] },
  energy_drink: { id: 'energy_drink', name: 'Energy Drink',       rarity: 'rare',      glyph: 'battery', desc: 'Turrets fire 12% faster.', fx: [['rate', 'mul', 1.12]] },
  sticker_pack: { id: 'sticker_pack', name: 'Sticker Pack',       rarity: 'rare',      glyph: 'star',   desc: 'Start every wave with +40 coins.', fx: [['waveCoins', 'add', 40]] },
  metronome:    { id: 'metronome',    name: 'Golden Metronome',   rarity: 'rare',      glyph: 'clock',  desc: 'On-beat deploys give twice the discount.', fx: [['beatBonus', 'mul', 2]] },
  cat_mascot:   { id: 'cat_mascot',   name: 'Lucky Cat',          rarity: 'rare',      glyph: 'cat',    desc: 'Kills have a small chance to drop a diamond.', fx: [['gemChance', 'add', 0.005]] },
  vinyl_stack:  { id: 'vinyl_stack',  name: 'Vinyl Stack',        rarity: 'rare',      glyph: 'disc',   desc: 'Scratcher records and Choir Orbs hit 30% harder.', fx: [['per.scratch.dmg', 'mul', 1.3], ['per.vocal.dmg', 'mul', 1.3]] },
  big_speaker:  { id: 'big_speaker',  name: 'Festival Speaker',   rarity: 'rare',      glyph: 'speaker', desc: 'Blasts and pulses are 20% wider.', fx: [['splash', 'mul', 1.2]] },
  heart_charm:  { id: 'heart_charm',  name: 'Heart Charm',        rarity: 'rare',      glyph: 'heart',  desc: 'Jasmin\'s heart necklace: hero abilities recharge 20% faster.', fx: [['heroCd', 'mul', 0.8]] },
  mohawk_gel:   { id: 'mohawk_gel',   name: 'Mohawk Gel',         rarity: 'rare',      glyph: 'sparkle', desc: 'Roxor\'s hair stays up: hero abilities are 30% stronger.', fx: [['heroPow', 'mul', 1.3]] },
  fog_machine:  { id: 'fog_machine',  name: 'Fog Machine',        rarity: 'epic',      glyph: 'snow',   desc: 'All Static move 10% slower.', fx: [['enemySlow', 'add', 0.1]] },
  laser_pointer:{ id: 'laser_pointer',name: 'Laser Show',         rarity: 'epic',      glyph: 'target', desc: 'Turrets have +10% range and +10% crit chance.', fx: [['range', 'mul', 1.1], ['crit', 'add', 0.1]] },
  confetti:     { id: 'confetti',     name: 'Confetti Cannon',    rarity: 'epic',      glyph: 'gift',   desc: 'Merges refund 40% of a deploy and give a 10% chance of a free turret.', fx: [['mergeRefund', 'add', 0.4], ['mergeSpawn', 'add', 0.1]] },
  platinum_mic: { id: 'platinum_mic', name: 'Platinum Mic',       rarity: 'epic',      glyph: 'mic',    desc: 'All turrets deal +35% damage.', fx: [['dmg', 'mul', 1.35]] },
  bass_pedal:   { id: 'bass_pedal',   name: 'Octave Pedal',       rarity: 'epic',      glyph: 'drop',   desc: 'Every 18 seconds a shockwave hits all enemies.', fx: [['dropEvery', 'max', 18], ['dropPower', 'add', 1]] },
  backstage:    { id: 'backstage',    name: 'Backstage Pass',     rarity: 'epic',      glyph: 'ticket', desc: 'Start of run effects: every deploy has a 20% chance to arrive as level 2.', fx: [['lucky', 'add', 0.2]] },
  loopy_plush:  { id: 'loopy_plush',  name: 'Loopy Plush',        rarity: 'epic',      glyph: 'sparkle', desc: 'Loop Station and Amp Stack auras are 50% stronger.', fx: [['auraBoost', 'mul', 1.5]] },
  golden_ticket:{ id: 'golden_ticket',name: 'Golden Ticket',      rarity: 'legendary', glyph: 'ticket', desc: 'Free deploys: the next 8 deploys cost nothing, and deploys cost 15% less after.', fx: [['freeDeploys', 'add', 8], ['deployCost', 'mul', 0.85]] },
  encore_pass:  { id: 'encore_pass',  name: 'Encore Pass',        rarity: 'legendary', glyph: 'heart',  desc: 'Once per run the stage is restored when it falls. +6 stage health.', fx: [['reviveOnce', 'add', 1], ['stageHp', 'add', 6]] },
  gold_record:  { id: 'gold_record',  name: 'Gold Record',        rarity: 'legendary', glyph: 'record', desc: 'All turrets deal +50% damage and fire 15% faster.', fx: [['dmg', 'mul', 1.5], ['rate', 'mul', 1.15]] },
  mr_p_remote:  { id: 'mr_p_remote',  name: 'Stolen Remote',      rarity: 'legendary', glyph: 'play',   desc: 'Mr. Playback\'s remote: normal enemies under 12% health vanish. Bosses take +40% damage.', fx: [['execute', 'add', 0.12], ['bossDmg', 'mul', 1.4]] },
};
export const RELIC_IDS = Object.keys(RELICS);

// ---------------------------------------------------------------- wave modifiers: one twist, announced on the wave banner
// wm fields are read by the sim for the duration of that wave only.
export const WAVE_MODS = {
  rush_hour:   { id: 'rush_hour',   name: 'Rush Hour',    glyph: 'ff',      good: false, desc: 'Static move 30% faster. +40% coins.', wm: { speed: 1.3, coin: 1.4 } },
  heavy_metal: { id: 'heavy_metal', name: 'Heavy Metal',  glyph: 'shield',  good: false, desc: 'Static have 40% more health. +40% coins.', wm: { hp: 1.4, coin: 1.4 } },
  power_cut:   { id: 'power_cut',   name: 'Power Cut',    glyph: 'plug',    good: false, desc: 'Turrets fire 20% slower. Coins doubled.', wm: { rate: 0.8, coin: 2 } },
  big_crowd:   { id: 'big_crowd',   name: 'Big Crowd',    glyph: 'fans',    good: false, desc: '50% more enemies, each worth less.', wm: { count: 1.5, coin: 0.8 } },
  tailwind:    { id: 'tailwind',    name: 'Tailwind',     glyph: 'wave',    good: true,  desc: 'Static move 20% slower.', wm: { speed: 0.8 } },
  happy_hour:  { id: 'happy_hour',  name: 'Happy Hour',   glyph: 'coin',    good: true,  desc: 'Coins from kills +60%.', wm: { coin: 1.6 } },
  hype_wave:   { id: 'hype_wave',   name: 'Hype Wave',    glyph: 'rocket',  good: true,  desc: 'Hype from kills doubled.', wm: { hype: 2 } },
  sound_boost: { id: 'sound_boost', name: 'Sound Boost',  glyph: 'speaker', good: true,  desc: 'Turrets deal +25% damage.', wm: { dmg: 1.25 } },
  golden_hour: { id: 'golden_hour', name: 'Golden Hour',  glyph: 'sparkle', good: true,  desc: 'Many Golden elites show up. Kill them for coins.', wm: { golden: 1 } },
  glitch_storm:{ id: 'glitch_storm',name: 'Glitch Storm', glyph: 'bolt',    good: false, desc: 'Enemies teleport forward now and then.', wm: { blink: 1, coin: 1.3 } },
};
export const WAVE_MOD_IDS = Object.keys(WAVE_MODS);

// ---------------------------------------------------------------- daily challenge modifiers (one per day, seeded by date)
export const DAILY_MODS = {
  two_instruments: { id: 'two_instruments', name: 'Duet Only',      glyph: 'notes',  desc: 'Only Kick Cannon and Snare Snapper. Turrets deal +60% damage.', loadout: ['kick', 'snare'], mods: [['dmg', 'mul', 1.6]] },
  level_three:     { id: 'level_three',     name: 'Pre-Mixed',      glyph: 'merge',  desc: 'Every deploy arrives as level 3, but deploys cost triple.', mods: [['startLevel', 'set', 3], ['deployCost', 'mul', 3]] },
  no_merge:        { id: 'no_merge',        name: 'Solo Acts',      glyph: 'cross',  desc: 'Merging is disabled. Deploys are cheap and turrets hit 2.5x harder.', mods: [['noMerge', 'set', 1], ['deployCost', 'mul', 0.4], ['dmg', 'mul', 2.5]] },
  glass_cannon:    { id: 'glass_cannon',    name: 'Glass Cannon',   glyph: 'bolt',   desc: 'Stage health is 5. Turrets deal +100% damage.', stageHp: 5, mods: [['dmg', 'mul', 2]] },
  speed_run:       { id: 'speed_run',       name: 'Fast Forward',   glyph: 'ff',     desc: 'Enemies move 40% faster. Coins +60%.', mods: [['enemySpeed', 'mul', 1.4], ['coin', 'mul', 1.6]] },
  tiny_stage:      { id: 'tiny_stage',      name: 'Limited Slots',  glyph: 'lock',   desc: 'Only 14 turret slots. Turrets fire 40% faster.', deployLimit: 14, mods: [['rate', 'mul', 1.4]] },
  iron_wall:       { id: 'iron_wall',       name: 'Iron Wall',      glyph: 'shield', desc: 'Enemies have 60% more health and armor. Hits deal +50%.', mods: [['enemyHp', 'mul', 1.6], ['dmg', 'mul', 1.5], ['armorPierce', 'add', -0.2]] },
  rich_tour:       { id: 'rich_tour',       name: 'Rich Tour',      glyph: 'bag',    desc: 'Deploys cost double, but coins from kills are tripled.', mods: [['deployCost', 'mul', 2], ['coin', 'mul', 3]] },
};
export const DAILY_MOD_IDS = Object.keys(DAILY_MODS);
