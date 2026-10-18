// Six districts of the endless city (stages 1 to 60, boss on every 10th stage) plus the looping endless mode from stage 61.
// palette values are PAL role names from js/palette.js (not hex): the art director maps them.
// enemyPool: weight = spawn weight, from = first stage within the district (1..10) where it can appear.

const pool = (id, weight, from = 1) => ({ id, weight, from });

export const DISTRICTS = [
  { id: 'rooftop_row', name: 'Rooftop Row', order: 1, stages: [1, 10], tagline: 'Pigeons own the skyline.',
    palette: { skyTop: 'void', skyBottom: 'violet', accent: 'cyan', ground: 'ink2', mood: 'dusk, shingle roofs, antennae, laundry lines' },
    enemyPool: [pool('pigeon_scout', 10), pool('gutter_gull', 5, 2), pool('pigeon_bomber', 4, 3), pool('antenna_raven', 3, 5)],
    boss: 'king_coo', bossStage: 10, waves: { base: 3, perStages: 3, max: 6 },
    modifier: { text: 'Strong winds: flying enemies are 10% faster.', effect: { kind: 'stat_mod', scope: 'trait:flying', stat: 'speed', mult: 1.1 } } },
  { id: 'alley_alamo', name: 'Alley Alamo', order: 2, stages: [11, 20], tagline: 'Rats run the back alleys.',
    palette: { skyTop: 'ink2', skyBottom: 'violet', accent: 'magenta', ground: 'ink3', mood: 'brick, dumpsters, fire escapes, steam vents' },
    enemyPool: [pool('rat_courier', 10), pool('dumpster_raccoon', 5, 2), pool('stray_mutt', 5, 3), pool('rat_shaman', 3, 5), pool('pigeon_bomber', 2, 6)],
    boss: 'rat_emperor', bossStage: 20, waves: { base: 4, perStages: 3, max: 7 },
    modifier: { text: 'Steam vents: cats lose 5% attack speed.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'rate', mult: 0.95 } } },
  { id: 'sewer_sprawl', name: 'Sewer Sprawl', order: 3, stages: [21, 30], tagline: 'Gators, slime and bad ideas.',
    palette: { skyTop: 'ink', skyBottom: 'ink3', accent: 'lime', ground: 'ink2', mood: 'tunnels, dripping pipes, toxic green glow' },
    enemyPool: [pool('sludge_blob', 8), pool('sewer_gator', 5, 2), pool('mud_mole', 4, 3), pool('toxic_toad', 4, 4), pool('rat_shaman', 2, 6)],
    boss: 'gator_mayor', bossStage: 30, waves: { base: 4, perStages: 3, max: 8 },
    modifier: { text: 'Toxic fumes: enemies regenerate 1% HP per second.', effect: { kind: 'stat_mod', scope: 'enemies', stat: 'regen', add: 0.01 } } },
  { id: 'laser_lights', name: 'Laser Lights Strip', order: 4, stages: [31, 40], tagline: 'Neon, drones, and one very tempting dot.',
    palette: { skyTop: 'void', skyBottom: 'magenta', accent: 'magenta', ground: 'ink3', mood: 'casinos, arcades, searchlights, laser grids' },
    enemyPool: [pool('red_dot_drone', 8), pool('glitch_bug', 6, 2), pool('strobe_sentry', 5, 3), pool('arcade_clanker', 4, 4)],
    boss: 'dot_overlord', bossStage: 40, waves: { base: 4, perStages: 3, max: 8 },
    modifier: { text: 'Strobing lights: cats have 5% less crit chance.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'crit', add: -0.05 } } },
  { id: 'appliance_heights', name: 'Appliance Heights', order: 5, stages: [41, 50], tagline: 'The vacuums have formed a union.',
    palette: { skyTop: 'ink2', skyBottom: 'violet', accent: 'cyan', ground: 'ink3', mood: 'steel towers, conveyor belts, sparking wires' },
    enemyPool: [pool('roomba_rover', 8), pool('toaster_turret', 5, 2), pool('vacuum_mech', 5, 3), pool('microwave_medic', 4, 4)],
    boss: 'hoovermatron_prime', bossStage: 50, waves: { base: 5, perStages: 3, max: 9 },
    modifier: { text: 'Static buildup: enemy abilities fire 15% more often.', effect: { kind: 'stat_mod', scope: 'enemies', stat: 'cooldown', mult: 0.85 } } },
  { id: 'bathtub_bay', name: 'Bathtub Bay', order: 6, stages: [51, 60], tagline: 'Where all the water goes.',
    palette: { skyTop: 'ink', skyBottom: 'cyan', accent: 'cyan', ground: 'ink2', mood: 'tiled docks, soap foam, giant faucets, drain whirlpools' },
    enemyPool: [pool('rubber_duck_raider', 8), pool('soap_slimer', 6, 2), pool('plunger_crab', 5, 3), pool('faucet_eel', 4, 4)],
    boss: 'bathtub_kraken', bossStage: 60, waves: { base: 5, perStages: 3, max: 10 },
    modifier: { text: 'Slippery floor: cats move 15% slower.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'speed', mult: 0.85 } } },
];

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const LAST_STAGE = 60;

// Endless mode: from stage 61 the districts replay in order, 10 stages each, forever. Every full loop of 60 stages
// is a "round" and raises affix count. Boss stages (every 10th) replay the district boss as an elite.
export const ELITE_AFFIXES = [
  { id: 'swift', name: 'Swift', text: '+30% speed.', effect: { kind: 'stat_mod', scope: 'self', stat: 'speed', mult: 1.3 } },
  { id: 'plated', name: 'Plated', text: '+30% armor.', effect: { kind: 'stat_mod', scope: 'self', stat: 'armor', add: 0.3 } },
  { id: 'regenerating', name: 'Regenerating', text: 'Heals 3% HP per second.', effect: { kind: 'stat_mod', scope: 'self', stat: 'regen', add: 0.03 } },
  { id: 'volatile', name: 'Volatile', text: 'Explodes on death.', effect: { kind: 'aoe', at: 'self', radius: 1.5, mult: 1.5 } },
  { id: 'warded', name: 'Warded', text: 'Starts with a shield worth 50% max HP.', effect: { kind: 'shield', to: 'self', pct: 0.5, duration: 0 } },
  { id: 'vampiric', name: 'Vampiric', text: 'Heals for 50% of damage dealt.', effect: { kind: 'stat_mod', scope: 'self', stat: 'lifesteal', add: 0.5 } },
];

export const ENDLESS = {
  id: 'endless_midnight',
  name: 'Endless Midnight',
  startStage: 61,
  stagesPerDistrict: 10,
  // Hints for progression.stageScaling (that file is the authority). Applies per stage past 60, compounding.
  scaling: { hpGrowth: 1.045, dmgGrowth: 1.03, rewardGrowth: 1.025, roundHpBonus: 1.5, roundDmgBonus: 1.25 },
  // Elite affix count by round (round 0 = stages 61 to 120). Normal enemies roll one affix chance, bosses always get this many.
  affixesByRound: (round) => Math.min(4, 1 + round),
  eliteChance: (stageInRound) => Math.min(0.5, 0.1 + stageInRound * 0.005),
  waveCap: 12,
};

// Pure helper. Returns { district, stageInDistrict, round, endless, isBoss, loopedStage } for any stage >= 1.
export function districtForStage(stage) {
  const s = Math.max(1, Math.floor(stage));
  if (s <= LAST_STAGE) {
    const district = DISTRICTS[Math.floor((s - 1) / 10)];
    return { district, stageInDistrict: ((s - 1) % 10) + 1, round: 0, endless: false, isBoss: s === district.bossStage, loopedStage: s };
  }
  const off = s - ENDLESS.startStage;
  const round = Math.floor(off / LAST_STAGE);
  const inRound = off % LAST_STAGE;
  const district = DISTRICTS[Math.floor(inRound / 10)];
  const stageInDistrict = (inRound % 10) + 1;
  return { district, stageInDistrict, round, endless: true, isBoss: stageInDistrict === 10, loopedStage: inRound + 1 };
}

// Number of waves for a stage (pure). Bosses add one final boss wave handled by progression.js.
export function waveCount(stage) {
  const { district, stageInDistrict, endless } = districtForStage(stage);
  const w = district.waves;
  const n = w.base + Math.floor((stageInDistrict - 1) / w.perStages);
  return Math.min(endless ? ENDLESS.waveCap : w.max, n);
}
