// data_depth.js: run depth data. Turret branches, hero abilities, run modifiers, boss phases, endless milestones.
// Pure data, no DOM, no Math.random, no Date. Ids are append-only lowercase_snake (saves and snapshots point at them).
// House rule: never write an em dash. Implemented by sim.js; the API is described in GAMEPLAY_API.md.
import { TURRETS } from './data_core.js';
import { WAVE_MODS } from './data_run.js';

// ---------------------------------------------------------------- 1. turret branches
// A turret that reaches level 4 may take ONE branch (a choice of two). fx keys (all read by sim.js):
//   dmg rate range crit critDmg (additive fractions, may be negative), splash (blast / orb burst radius fraction),
//   shells (extra shells, Kick), shots (extra snare shots), discs (extra records), orbs (extra orbs), chains (extra arc jumps),
//   armorPierce (0..1), spinFloor / spinMax (Hi-Hat), slow / slowT (Sub), push (px shove per pulse), beamW (beam width fraction),
//   healAny + healEvery (Siren Mic stage heal), stun (extra seconds), bossStun (stun multiplier on bosses), fullCone (Air Horn circle),
//   arc (Vinyl record spark), execAt (Cowbell execute threshold), markSpread (extra marked targets), markT (extra mark seconds),
//   reach (aura reaches this many extra tiles), auraMul (aura strength fraction), auraCrit (aura crit given to neighbours), healChance (Choir Orb).
export const TURRET_BRANCHES = {
  kick: [
    { id: 'kick_big_bang', name: 'Big Bang', desc: 'Much bigger blast and harder hits, but it fires 30% slower.', glyph: 'bomb', fx: { splash: 0.7, dmg: 0.45, rate: -0.3 } },
    { id: 'kick_double_tap', name: 'Double Tap', desc: 'Fires 25% faster and lobs a second shell.', glyph: 'double', fx: { rate: 0.25, shells: 1 } },
  ],
  snare: [
    { id: 'snare_rimshot', name: 'Rimshot', desc: '+20% crit chance and crits hit much harder.', glyph: 'target', fx: { crit: 0.2, critDmg: 0.6 } },
    { id: 'snare_flam', name: 'Flam', desc: 'Fires one extra shot every volley and plays 10% faster.', glyph: 'double', fx: { shots: 1, rate: 0.1 } },
  ],
  hat: [
    { id: 'hat_shredder', name: 'Shredder', desc: 'Bullets ignore all armor and hit 20% harder.', glyph: 'bolt', fx: { armorPierce: 1, dmg: 0.2 } },
    { id: 'hat_overspin', name: 'Overspin', desc: 'Starts spun up and spins past full speed.', glyph: 'fire', fx: { spinFloor: 0.6, spinMax: 0.5 } },
  ],
  sub: [
    { id: 'sub_deep_freeze', name: 'Deep Freeze', desc: 'A much stronger, longer slow, but softer pulses.', glyph: 'snow', fx: { slow: 0.3, slowT: 2, dmg: -0.2 } },
    { id: 'sub_shockwave', name: 'Shockwave', desc: 'Wider pulse that hits harder and shoves enemies back.', glyph: 'wave', fx: { range: 0.3, dmg: 0.4, push: 40 } },
  ],
  mic: [
    { id: 'mic_wide_wail', name: 'Wide Wail', desc: 'The beam is twice as wide and sweeps up more Static.', glyph: 'wave', fx: { beamW: 1, dmg: 0.1 } },
    { id: 'mic_healing_hook', name: 'Healing Hook', desc: 'Every 3rd beam mends the stage, at any level. 15% faster.', glyph: 'heart', fx: { healAny: 1, healEvery: 3, rate: 0.15 } },
  ],
  synth: [
    { id: 'synth_storm', name: 'Storm', desc: 'Lightning jumps 3 more times.', glyph: 'bolt', fx: { chains: 3 } },
    { id: 'synth_overload', name: 'Overload', desc: 'Every arc stuns briefly and hits 40% harder.', glyph: 'plug', fx: { dmg: 0.4, stun: 0.6 } },
  ],
  horn: [
    { id: 'horn_sonic_boom', name: 'Sonic Boom', desc: 'Blasts in a full circle with 15% more reach.', glyph: 'horn', fx: { fullCone: 1, range: 0.15 } },
    { id: 'horn_deafening', name: 'Deafening', desc: 'Stuns a full second longer, even bosses flinch.', glyph: 'speaker', fx: { stun: 1, bossStun: 0.5, dmg: 0.3 } },
  ],
  scratch: [
    { id: 'scratch_triple_spin', name: 'Triple Spin', desc: 'Throws one more record each time.', glyph: 'disc', fx: { discs: 1 } },
    { id: 'scratch_razor', name: 'Razor Record', desc: 'Records hit 50% harder, ignore armor and throw sparks.', glyph: 'record', fx: { dmg: 0.5, armorPierce: 1, arc: 1 } },
  ],
  loop: [
    { id: 'loop_wide', name: 'Wide Loop', desc: 'The aura reaches two tiles out instead of one.', glyph: 'magnet', fx: { reach: 1 } },
    { id: 'loop_hot', name: 'Hot Loop', desc: 'The aura is 50% stronger.', glyph: 'fire', fx: { auraMul: 0.5 } },
  ],
  cowbell: [
    { id: 'cowbell_execute', name: 'Execute', desc: 'Finishes any non-boss enemy below 30% health. +15% crit.', glyph: 'skull', fx: { execAt: 0.3, crit: 0.15 } },
    { id: 'cowbell_chain_mark', name: 'Chain Mark', desc: 'A hit also marks the 2 nearest enemies, and marks last longer.', glyph: 'target', fx: { markSpread: 2, markT: 2 } },
  ],
  amp: [
    { id: 'amp_wide_stack', name: 'Wide Stack', desc: 'The aura reaches two tiles out instead of one.', glyph: 'speaker', fx: { reach: 1 } },
    { id: 'amp_eleven', name: 'Up to Eleven', desc: 'The aura is 50% stronger and neighbours gain crit.', glyph: 'bolt', fx: { auraMul: 0.5, auraCrit: 0.1 } },
  ],
  vocal: [
    { id: 'vocal_swarm', name: 'Choir Swarm', desc: 'Fires 2 extra orbs, each a bit softer.', glyph: 'notes', fx: { orbs: 2, dmg: -0.25 } },
    { id: 'vocal_big_chorus', name: 'Big Chorus', desc: 'Huge bursts that heal the stage more often and hit 20% harder.', glyph: 'heart', fx: { splash: 0.8, healChance: 0.2, dmg: 0.2 } },
  ],
};
export const BRANCH_LEVEL = 4;
export const BRANCH_BY_ID = {};
export const BRANCH_TURRET = {};   // branch id -> turret type
for (const [type, list] of Object.entries(TURRET_BRANCHES)) for (const b of list) { BRANCH_BY_ID[b.id] = b; BRANCH_TURRET[b.id] = type; }
export const BRANCH_FX_KEYS = ['dmg', 'rate', 'range', 'crit', 'critDmg', 'splash', 'shells', 'shots', 'discs', 'orbs', 'chains', 'armorPierce', 'spinFloor', 'spinMax',
  'slow', 'slowT', 'push', 'beamW', 'healAny', 'healEvery', 'stun', 'bossStun', 'fullCone', 'arc', 'execAt', 'markSpread', 'markT', 'reach', 'auraMul', 'auraCrit', 'healChance'];
void TURRETS;

// ---------------------------------------------------------------- 2. hero abilities
// Unlocked by hero level (heroLv). cdMul multiplies the hero cooldown. 'blast' and 'song' are the originals and always available.
export const HERO_ABILITIES = {
  roxor: [
    { id: 'blast', name: 'Beatbox Blast', desc: 'Hits every enemy, stuns and shoves them back.', unlockLv: 1, cdMul: 1 },
    { id: 'freeze', name: 'Bass Freeze', desc: 'A bass drop freezes every enemy in place for 3 seconds.', unlockLv: 4, cdMul: 1.1 },
    { id: 'overclock', name: 'Overclock', desc: 'All turrets fire 60% faster for 6 seconds.', unlockLv: 7, cdMul: 1.15 },
  ],
  jasmin: [
    { id: 'song', name: 'Siren Song', desc: 'Slows the Static, makes them take more damage and mends the stage.', unlockLv: 1, cdMul: 1 },
    { id: 'coinrain', name: 'Coin Rain', desc: 'A burst of coins, then double coins per kill for 8 seconds.', unlockLv: 4, cdMul: 1 },
    { id: 'shield', name: 'Stage Shield', desc: 'Leaks do no stage damage for 6 seconds.', unlockLv: 7, cdMul: 1.1 },
  ],
};
export const HERO_ABILITY_DEFAULT = { roxor: 'blast', jasmin: 'song' };
export const HERO_ABILITY_NUMS = { freezeSec: 3, freezeBossSec: 1.2, overclockSec: 6, overclockRate: 0.6, coinRainSec: 8, coinRainKillMul: 2, shieldSec: 6 };

// ---------------------------------------------------------------- 3. run modifiers (pre-run risk for a bigger payout)
// mul = reward multipliers the meta layer applies to the payout (they stack multiplicatively, max 3 modifiers per run).
// Daily and the Weekly Gig ignore modifiers.
export const MAX_RUN_MODIFIERS = 3;
export const RUN_MODIFIERS = [
  { id: 'double_trouble', name: 'Double Trouble', glyph: 'double', desc: 'Twice the Static, each at 60% health. Coins from kills are doubled overall.', mul: { records: 1.3, fans: 1.3, diamonds: 1.2 } },
  { id: 'small_band', name: 'Small Band', glyph: 'mic', desc: 'Only 6 random turret types are in your drop pool.', mul: { records: 1.2, fans: 1.2, diamonds: 1.15 } },
  { id: 'glass_stage', name: 'Glass Stage', glyph: 'shield', desc: 'The stage only has 6 health.', mul: { records: 1.6, fans: 1.6, diamonds: 1.5 } },
  { id: 'speedrun', name: 'Speedrun', glyph: 'rocket', desc: 'Enemies move 25% faster.', mul: { records: 1.3, fans: 1.3, diamonds: 1.2 } },
  { id: 'no_heroes', name: 'No Heroes', glyph: 'cross', desc: 'Roxor and Jasmin sit this one out: no hero moves.', mul: { records: 1.6, fans: 1.6, diamonds: 1.5 } },
  { id: 'fragile_merge', name: 'Fragile Merge', glyph: 'merge', desc: 'Every merge costs 20 coins.', mul: { records: 1.15, fans: 1.15, diamonds: 1.1 } },
  { id: 'brutal_bosses', name: 'Brutal Bosses', glyph: 'skull', desc: 'Bosses have 50% more health.', mul: { records: 1.25, fans: 1.25, diamonds: 1.2 } },
  { id: 'lone_lane', name: 'Lone Lane', glyph: 'arrow_up', desc: 'Every enemy marches down one lane and carries 25% more health.', mul: { records: 1.3, fans: 1.3, diamonds: 1.2 } },
  { id: 'cramped', name: 'Cramped Stage', glyph: 'lock', desc: 'Only 65% of the build slots can be used.', mul: { records: 1.25, fans: 1.25, diamonds: 1.2 } },
  { id: 'lean_times', name: 'Lean Times', glyph: 'coin', desc: 'Kill coins are cut by 25% and turrets cost 15% more.', mul: { records: 1.2, fans: 1.2, diamonds: 1.15 } },
];
export const RUN_MODIFIER_BY_ID = Object.fromEntries(RUN_MODIFIERS.map((m) => [m.id, m]));
export const RUN_MODIFIER_NUMS = {
  doubleHp: 0.6, speedrun: 1.25, glassStage: 6, fragileMergeCost: 20, brutalBoss: 1.5, loneLaneHp: 1.25, crampedFrac: 0.65,
  leanCoin: 0.75, leanDeploy: 1.15, smallBand: 6,
};

// ---------------------------------------------------------------- 4. boss phases
// BOSS_PHASES[bossId] = [{ at, id, text, ...params }]. When the boss health fraction drops to `at` or below, the phase effect `id` fires once
// (list in descending `at`; unsorted lists are sorted). `id` is a key of BOSS_PHASE_EFFECTS (implemented in sim.js, bossPhaseFx).
// Optional params override the effect defaults. A boss id with no entry (or an unknown effect id) is safe: nothing fires.
// To add a boss ('lowpass', 'silence'): add it to BOSSES in data_core.js, then add a BOSS_PHASES entry here. No sim.js change needed.
export const BOSS_PHASE_EFFECTS = {
  dark_lane:    { id: 'dark_lane',    name: 'Dark Lane',    desc: 'Turrets in a two column band around the boss cannot target.', defaults: { dur: 5, cols: 2 } },
  steal_turret: { id: 'steal_turret', name: 'Borrowed',     desc: 'A random non-aura turret is borrowed and returns later.', defaults: { dur: 8 } },
  summon_wave:  { id: 'summon_wave',  name: 'Summon Wave',  desc: 'A mini wave of this world\'s enemies joins the fight.', defaults: { n: 6, hpMul: 0.7 } },
  bulwark:      { id: 'bulwark',      name: 'Bulwark',      desc: 'A shield that must be broken before the boss takes damage.', defaults: { frac: 0.12 } },
  enrage:       { id: 'enrage',       name: 'Enrage',       desc: 'The boss walks faster.', defaults: { speed: 1.3 } },
  heal_pulse:   { id: 'heal_pulse',   name: 'Heal Pulse',   desc: 'The boss and nearby Static recover health.', defaults: { frac: 0.06, radius: 120, allyFrac: 0.1 } },
  jam_pulse:    { id: 'jam_pulse',    name: 'Jam Pulse',    desc: 'Turrets near the boss are jammed.', defaults: { radius: 170, dur: 2.2, max: 5 } },
};
export const BOSS_PHASE_EFFECT_IDS = Object.keys(BOSS_PHASE_EFFECTS);
export const BOSS_PHASES = {
  compressor: [
    { at: 0.66, id: 'bulwark', text: 'The Compressor squeezes out a shield!', frac: 0.1 },
    { at: 0.33, id: 'enrage', text: 'The Compressor is pumping up the volume!', speed: 1.35 },
  ],
  noisegate: [
    { at: 0.75, id: 'summon_wave', text: 'The Gate opens and the Static pours in!', n: 5 },
    { at: 0.5, id: 'dark_lane', text: 'Lights out! A whole band goes silent.', dur: 4.5 },
    { at: 0.25, id: 'enrage', text: 'The Gate is slamming faster!', speed: 1.3 },
  ],
  reverb: [
    { at: 0.75, id: 'dark_lane', text: 'The echo swallows a band of the stage.', dur: 4 },
    { at: 0.5, id: 'summon_wave', text: 'The Titan sings back an army!', n: 6 },
    { at: 0.25, id: 'heal_pulse', text: 'A huge reverb tail heals the Static!', frac: 0.05 },
  ],
  djglitch: [
    { at: 0.7, id: 'steal_turret', text: 'DJ Glitch sampled one of your turrets!', dur: 7 },
    { at: 0.4, id: 'jam_pulse', text: 'Scratch! The nearby turrets skip.', dur: 2 },
    { at: 0.2, id: 'enrage', text: 'DJ Glitch drops the tempo up!', speed: 1.3 },
  ],
  playback: [
    { at: 0.85, id: 'jam_pulse', text: 'Mr. Playback presses PAUSE.', dur: 2, max: 4 },
    { at: 0.5, id: 'bulwark', text: 'Mr. Playback cranks the master volume!', frac: 0.08 },
    { at: 0.2, id: 'steal_turret', text: 'Mr. Playback skips one of your tracks!', dur: 8 },
  ],
  lowpass: [
    { at: 0.85, id: 'dark_lane', text: 'The tide rolls over a band of the stage.', dur: 4.5 },
    { at: 0.66, id: 'summon_wave', text: 'The Tide washes in a crowd!', n: 6 },
    { at: 0.4, id: 'bulwark', text: 'A wall of water rises around the Tide!', frac: 0.1 },
    { at: 0.19, id: 'enrage', text: 'The tide is coming in fast!', speed: 1.35 },
  ],
  silence: [
    { at: 1, id: 'jam_pulse', text: 'Dr. Dead Air mutes the room.', dur: 2, max: 4 },
    { at: 0.66, id: 'steal_turret', text: 'Dr. Dead Air steals one of your instruments!', dur: 8 },
    { at: 0.66, id: 'dark_lane', text: 'A pocket of dead air swallows the sound.', dur: 4.5 },
    { at: 0.33, id: 'summon_wave', text: 'The silence calls its biggest crowd!', n: 7 },
    { at: 0.33, id: 'heal_pulse', text: 'Dr. Dead Air drinks in the quiet.', frac: 0.05 },
    { at: 0.33, id: 'bulwark', text: 'A wall of silence rises!', frac: 0.1 },
    { at: 0.09, id: 'enrage', text: 'Dr. Dead Air is closing in!', speed: 1.35 },
  ],
};
// Per-boss damage tricks read by sim.js hurt(): hits weaker than weakFrac of the boss max health are multiplied by weakMul.
export const BOSS_TRICKS = {
  lowpass: { weakFrac: 0.002, weakMul: 0.4 },
};
// Periodic mute: every `every` seconds the nearest `n` turrets are jammed for `dur` seconds (Dr. Dead Air mutes turrets in waves).
export const BOSS_PULSES = {
  silence: { every: 9, n: 3, dur: 1.8 },
};

// ---------------------------------------------------------------- 5. endless milestones (data and event only, the meta layer pays them)
export const ENDLESS_MILESTONES = [
  { wave: 25, id: 'endless_25', name: 'Encore Hero', reward: { diamonds: 10 } },
  { wave: 50, id: 'endless_50', name: 'Never Ending Set', reward: { diamonds: 25, cosmetic: 'milestone_50' } },
  { wave: 100, id: 'endless_100', name: 'Legend of the Loop', reward: { diamonds: 75, cosmetic: 'milestone_100' } },
];

// ---------------------------------------------------------------- 6. endless themed waves
// In endless mode every wave with w % 10 === 5 from wave 15 (15, 25, 35, ...) is a THEMED wave: one of these six, never a boss wave. The theme is the wave's
// mod (spec.mod, nextWavePreview().mod, currentWaveInfo().mod, the wave event, run.wmId), so it rides the wave-mod mechanism: `wm` is read by the sim for that wave
// only (count and hp as in WAVE_MODS, coin, echoSplit). genWave in sim.js reads the group shape: `types` forces the group types, `support` adds a group of that
// type next to every group (supportFrac of its size). The themes are also registered in WAVE_MODS (same objects) so every place that looks a wave mod up by id
// (banner, HUD badge, preview card) finds them; they are never picked as a random mod. Order is append-only. Which theme comes when: endlessThemeFor in sim.js.
export const ENDLESS_THEME_FIRST = 15;
export const ENDLESS_THEMES = {
  swarm:          { id: 'swarm',          name: 'Swarm',          glyph: 'fans',    good: false, theme: true, desc: 'Three times as many Static, each with 40% of the health.', wm: { count: 3, hp: 0.4, coin: 0.6 } },
  armored_parade: { id: 'armored_parade', name: 'Armored Parade', glyph: 'shield',  good: false, theme: true, desc: 'Every Static is a Brickwall. Small hits bounce off, so bring big hitters.', types: ['brick'], wm: { coin: 1.3 } },
  zip_rush:       { id: 'zip_rush',       name: 'Zip Rush',       glyph: 'ff',      good: false, theme: true, desc: 'Nothing but fast Glitch Zips. Splash and slows save the day.', types: ['zip'], wm: { coin: 1.2 } },
  echo_chamber:   { id: 'echo_chamber',   name: 'Echo Chamber',   glyph: 'wave',    good: false, theme: true, desc: 'Echoes split twice: every Echo Mini splits again when it dies.', types: ['echo'], wm: { echoSplit: 2 } },
  heal_party:     { id: 'heal_party',     name: 'Heal Party',     glyph: 'heart',   good: false, theme: true, desc: 'Hum Healers join every group and keep the Static topped up.', support: 'leech', supportFrac: 0.3, wm: { coin: 1.1 } },
  gold_rush:      { id: 'gold_rush',      name: 'Gold Rush',      glyph: 'coin',    good: true,  theme: true, desc: 'Fewer Static, but every kill pays double coins.', wm: { count: 0.55, coin: 2 } },
};
export const ENDLESS_THEME_IDS = Object.keys(ENDLESS_THEMES);
for (const id of ENDLESS_THEME_IDS) if (!WAVE_MODS[id]) WAVE_MODS[id] = ENDLESS_THEMES[id];
