// Enemies of the endless city: 6 districts, 28 regular enemies + 6 bosses.
// base: hp, dmg per hit, speed in tiles per second, reward in fish (before stage scaling).
// Extra fields (documented in docs/SYSTEMS.md): district, range (tiles, default 1), rate (attacks/s, default 1),
// params (per-trait numbers), ability {every, effect} (cast from the enemy's side), phases (bosses), size (draw scale), desc.
// Enemy effect targets are from the enemy's point of view: 'nearest' means nearest cat, heal means heal enemies.

const en = (id, name, district, tier, hp, dmg, speed, reward, traits, o = {}) => ({
  id, name, tier, district,
  base: { hp, dmg, speed, reward },
  traits, flying: traits.includes('flying'), boss: !!o.boss,
  range: o.range ?? 1, rate: o.rate ?? 1, size: o.size ?? 1,
  params: o.params ?? {}, ability: o.ability ?? null, phases: o.phases ?? [],
  desc: o.desc ?? '',
});

export const ENEMIES = [
  // ---- District 1: Rooftop Row (pigeons) ----
  en('pigeon_scout', 'Pigeon Scout', 'rooftop_row', 1, 18, 3, 1.1, 1, ['swarm', 'flying'],
    { params: { swarm: { group: 6 } }, desc: 'Arrives in flocks of six and judges you.' }),
  en('pigeon_bomber', 'Pigeon Bomber', 'rooftop_row', 1, 30, 14, 0.8, 3, ['flying', 'explosive'],
    { params: { explosive: { radius: 1.2, mult: 1.0, on: 'contact' } }, desc: 'Drops its payload by dying on you.' }),
  en('gutter_gull', 'Gutter Gull', 'rooftop_row', 1, 55, 6, 0.7, 3, ['armored'],
    { params: { armored: { armor: 0.25 } }, desc: 'Armored in discarded fries.' }),
  en('antenna_raven', 'Antenna Raven', 'rooftop_row', 1, 40, 9, 0.6, 4, ['flying', 'ranged'],
    { range: 4, params: { ranged: {} }, desc: 'Perches on aerials and caws insults.' }),
  en('king_coo', 'King Coo, Pigeon Sovereign', 'rooftop_row', 1, 1400, 20, 0.35, 60, ['summoner', 'boss'],
    { boss: true, size: 2, range: 1, params: { summoner: { enemy: 'pigeon_scout', every: 8, count: 4 } },
      desc: 'Rules the Row from a throne of bread crusts.',
      phases: [
        { at: 1.0, name: 'Royal Roost', text: 'The king summons scouts every 8s.' },
        { at: 0.66, name: 'Flock Call', text: 'Calls a flock of eight scouts.', effect: { kind: 'spawn_enemies', enemy: 'pigeon_scout', count: 8, at: 'edge' } },
        { at: 0.33, name: 'Dive Bomb Frenzy', text: 'Faster and angrier, with bombers.', mods: { speedMult: 1.5, dmgMult: 1.3 }, effect: { kind: 'spawn_enemies', enemy: 'pigeon_bomber', count: 3, at: 'edge' } },
      ] }),

  // ---- District 2: Alley Alamo (rats and strays) ----
  en('rat_courier', 'Rat Courier', 'alley_alamo', 2, 28, 5, 1.3, 2, ['swarm', 'fast'],
    { params: { swarm: { group: 8 } }, desc: 'Delivers pain on a tight schedule.' }),
  en('dumpster_raccoon', 'Dumpster Raccoon', 'alley_alamo', 2, 120, 12, 0.5, 5, ['armored'],
    { params: { armored: { armor: 0.4 } }, desc: 'Wears a lid as a hat. And as a shield.' }),
  en('stray_mutt', 'Stray Mutt', 'alley_alamo', 2, 70, 14, 1.0, 4, ['fast'],
    { params: { fast: { burstEvery: 6, burstSpeedMult: 1.8, burstTime: 1.5 } }, desc: 'Barks, then sprints.' }),
  en('rat_shaman', 'Rat Shaman', 'alley_alamo', 2, 60, 6, 0.5, 6, ['healer', 'ranged'],
    { range: 3, params: { healer: { pct: 0.1, radius: 2.5, every: 3 } }, desc: 'Chants over a cracked cheese wheel.' }),
  en('rat_emperor', 'Rat Emperor Squeakimus', 'alley_alamo', 2, 3200, 30, 0.35, 120, ['summoner', 'shielded', 'boss'],
    { boss: true, size: 2, params: { summoner: { enemy: 'rat_courier', every: 7, count: 6 }, shielded: { shield: 400, regen: 20 } },
      desc: 'Lord of ten thousand rats in a trench coat.',
      phases: [
        { at: 1.0, name: 'Sewer Court', text: 'Sends couriers every 7s behind a 400 point shield.' },
        { at: 0.6, name: 'Cheese Decree', text: 'Heals the horde and summons shamans.', effect: { kind: 'multi', steps: [{ kind: 'heal', to: 'all', pct: 0.1 }, { kind: 'spawn_enemies', enemy: 'rat_shaman', count: 2, at: 'edge' }] } },
        { at: 0.3, name: 'Royal Stampede', text: 'Enrages and unleashes a stampede.', mods: { speedMult: 1.4, dmgMult: 1.5 }, effect: { kind: 'spawn_enemies', enemy: 'rat_courier', count: 14, at: 'edge' } },
      ] }),

  // ---- District 3: Sewer Sprawl (gators and sludge) ----
  en('sewer_gator', 'Sewer Gator', 'sewer_sprawl', 3, 220, 22, 0.45, 8, ['armored'],
    { params: { armored: { armor: 0.35 } }, desc: 'Has eaten three shopping carts and a bad decision.' }),
  en('sludge_blob', 'Sludge Blob', 'sewer_sprawl', 3, 90, 8, 0.5, 5, ['splitter'],
    { params: { splitter: { into: 'sludge_glob', count: 2 } }, desc: 'Splits into two angrier blobs.' }),
  en('sludge_glob', 'Sludge Glob', 'sewer_sprawl', 3, 30, 5, 0.8, 1, ['swarm'],
    { params: { swarm: { group: 1 } }, desc: 'A small piece of a bigger problem.' }),
  en('mud_mole', 'Mud Mole', 'sewer_sprawl', 3, 110, 16, 0.7, 7, ['burrower'],
    { params: { burrower: { every: 6, duration: 2.5, emergeAoe: { radius: 1.2, mult: 1.0 } } }, desc: 'Pops up under your cats at the worst time.' }),
  en('toxic_toad', 'Toxic Toad', 'sewer_sprawl', 3, 100, 18, 0.5, 7, ['ranged'],
    { range: 4, ability: { every: 7, effect: { kind: 'dot', to: 'nearest', dps: 0.4, duration: 4, element: 'poison' } }, desc: 'Spits green opinions.' }),
  en('gator_mayor', 'Mayor Mawgator', 'sewer_sprawl', 3, 7500, 40, 0.3, 220, ['armored', 'summoner', 'boss'],
    { boss: true, size: 2.2, params: { armored: { armor: 0.35 }, summoner: { enemy: 'sludge_blob', every: 9, count: 3 } },
      desc: 'Re-elected nine times. Nobody voted.',
      phases: [
        { at: 1.0, name: 'Campaign Trail', text: 'Armored, and sends blobs every 9s.' },
        { at: 0.65, name: 'Death Roll', text: 'Rolls over the front line, knocking cats back and stunning them.', effect: { kind: 'multi', steps: [{ kind: 'aoe', at: 'self', radius: 2.5, mult: 2 }, { kind: 'knockback', to: 'radius', at: 'self', radius: 2.5, tiles: 2 }] } },
        { at: 0.3, name: 'Filibuster', text: 'Sheds armor but hits much harder.', mods: { armorAdd: -0.35, dmgMult: 1.6, speedMult: 1.3 }, effect: { kind: 'spawn_enemies', enemy: 'sewer_gator', count: 2, at: 'edge' } },
      ] }),

  // ---- District 4: Laser Lights Strip (drones and arcade machines) ----
  en('red_dot_drone', 'Red Dot Drone', 'laser_lights', 4, 95, 15, 1.2, 9, ['flying', 'fast'],
    { ability: { every: 8, effect: { kind: 'stun', to: 'nearest', duration: 1.5 } }, desc: 'Waves a laser dot. Cats cannot look away.' }),
  en('strobe_sentry', 'Strobe Sentry', 'laser_lights', 4, 260, 12, 0.4, 10, ['shielded'],
    { params: { shielded: { shield: 150, regen: 15 } }, desc: 'Flashes until everyone gets a headache.' }),
  en('arcade_clanker', 'Arcade Clanker', 'laser_lights', 4, 380, 28, 0.45, 12, ['armored'],
    { params: { armored: { armor: 0.4 } }, desc: 'Insert coin to continue being hit.' }),
  en('glitch_bug', 'Glitch Bug', 'laser_lights', 4, 130, 10, 0.9, 9, ['splitter'],
    { params: { splitter: { into: 'glitch_byte', count: 3 } }, desc: 'Corrupts into smaller bugs on defeat.' }),
  en('glitch_byte', 'Glitch Byte', 'laser_lights', 4, 40, 6, 1.1, 2, ['swarm', 'fast'],
    { params: { swarm: { group: 1 } }, desc: 'One bit of trouble.' }),
  en('dot_overlord', 'Laser Dot Overlord', 'laser_lights', 4, 14000, 55, 0.4, 420, ['flying', 'summoner', 'boss'],
    { boss: true, size: 2.2, params: { summoner: { enemy: 'red_dot_drone', every: 8, count: 3 } },
      desc: 'A pointer the size of a moon. Every cat wants it.',
      phases: [
        { at: 1.0, name: 'Dot Parade', text: 'Releases drones every 8s.' },
        { at: 0.66, name: 'Hypnosis Beam', text: 'Stuns every cat for 1.5s.', effect: { kind: 'stun', to: 'all', duration: 1.5 } },
        { at: 0.33, name: 'Strobe Overload', text: 'Faster, with a shielded escort.', mods: { speedMult: 1.4, dmgMult: 1.4 }, effect: { kind: 'spawn_enemies', enemy: 'strobe_sentry', count: 2, at: 'edge' } },
      ] }),

  // ---- District 5: Appliance Heights (vacuum mechs) ----
  en('roomba_rover', 'Roomba Rover', 'appliance_heights', 5, 120, 10, 1.0, 12, ['swarm'],
    { params: { swarm: { group: 8 } }, desc: 'Bumps into things on purpose now.' }),
  en('vacuum_mech', 'Vacuum Mech Mk VII', 'appliance_heights', 5, 520, 32, 0.45, 18, ['armored'],
    { params: { armored: { armor: 0.4 } }, ability: { every: 9, effect: { kind: 'pull', to: 'radius', at: 'self', radius: 3, tiles: 1.5 } }, desc: 'Sucks cats toward its blades.' }),
  en('toaster_turret', 'Toaster Turret', 'appliance_heights', 5, 300, 36, 0.3, 16, ['ranged', 'explosive'],
    { range: 5, params: { explosive: { radius: 1.5, mult: 1.2, on: 'death' } }, desc: 'Pops up toast at supersonic speed.' }),
  en('microwave_medic', 'Microwave Medic', 'appliance_heights', 5, 360, 14, 0.4, 20, ['healer', 'shielded'],
    { range: 2, params: { healer: { pct: 0.15, radius: 3, every: 3 }, shielded: { shield: 200, regen: 20 } }, desc: 'Heals in thirty second bursts. Beeps when done.' }),
  en('hoovermatron_prime', 'Hoovermatron Prime', 'appliance_heights', 5, 36000, 75, 0.35, 800, ['armored', 'summoner', 'boss'],
    { boss: true, size: 2.3, params: { armored: { armor: 0.45 }, summoner: { enemy: 'roomba_rover', every: 8, count: 6 } },
      desc: 'Vacuum cleaner. Mech. Prime. Three problems in one.',
      phases: [
        { at: 1.0, name: 'Deep Clean', text: 'Armored, launches Roombas every 8s.' },
        { at: 0.66, name: 'Maximum Suction', text: 'Pulls every cat toward it and slams them.', effect: { kind: 'multi', steps: [{ kind: 'pull', to: 'all', tiles: 3 }, { kind: 'aoe', at: 'self', radius: 3, mult: 2.5 }] } },
        { at: 0.33, name: 'Overheat Mode', text: 'Burning hot and much faster.', mods: { speedMult: 1.5, dmgMult: 1.6 }, effect: { kind: 'spawn_enemies', enemy: 'toaster_turret', count: 2, at: 'edge' } },
      ] }),

  // ---- District 6: Bathtub Bay (the drain) ----
  en('rubber_duck_raider', 'Rubber Duck Raider', 'bathtub_bay', 6, 180, 14, 1.0, 16, ['swarm', 'flying'],
    { params: { swarm: { group: 8 } }, desc: 'Squeaks before it strikes. Always.' }),
  en('soap_slimer', 'Soap Slimer', 'bathtub_bay', 6, 400, 20, 0.5, 18, ['splitter'],
    { params: { splitter: { into: 'soap_bubble', count: 4 } }, desc: 'Slippery. Then very many.' }),
  en('soap_bubble', 'Soap Bubble', 'bathtub_bay', 6, 50, 8, 1.0, 2, ['swarm', 'flying'],
    { params: { swarm: { group: 1 } }, desc: 'Floats. Pops. Stings.' }),
  en('plunger_crab', 'Plunger Crab', 'bathtub_bay', 6, 640, 40, 0.45, 26, ['armored', 'burrower'],
    { params: { armored: { armor: 0.4 }, burrower: { every: 7, duration: 2, emergeAoe: { radius: 1.5, mult: 1.2 } } }, desc: 'Claws made of rubber suction cups. Do not ask.' }),
  en('faucet_eel', 'Faucet Eel', 'bathtub_bay', 6, 480, 30, 0.5, 24, ['ranged', 'shielded'],
    { range: 5, params: { shielded: { shield: 250, regen: 25 } }, ability: { every: 8, effect: { kind: 'chain', jumps: 3, mult: 1.0, falloff: 0.1, range: 2, element: 'elec' } }, desc: 'Drips with ambition.' }),
  en('kraken_tentacle', 'Kraken Tentacle', 'bathtub_bay', 6, 900, 35, 0.3, 10, ['armored'],
    { params: { armored: { armor: 0.25 } }, desc: 'Not attached to anything anymore.' }),
  en('bathtub_kraken', 'The Bathtub Kraken', 'bathtub_bay', 6, 90000, 110, 0.3, 2000, ['summoner', 'shielded', 'boss'],
    { boss: true, size: 2.6, params: { summoner: { enemy: 'kraken_tentacle', every: 10, count: 2 }, shielded: { shield: 4000, regen: 100 } },
      desc: 'Drawn from the drain by the sound of a running tap. Hates baths. Is one.',
      phases: [
        { at: 1.0, name: 'Rising Tide', text: 'Shielded, sends tentacles every 10s.' },
        { at: 0.75, name: 'Ink Cloud', text: 'Blinds the team: all cats lose 30% damage for 6s.', effect: { kind: 'debuff', to: 'all', stat: 'dmg', pct: 0.3, duration: 6 } },
        { at: 0.5, name: 'Whirlpool', text: 'Drags every cat in and hits the pile.', effect: { kind: 'multi', steps: [{ kind: 'pull', to: 'all', tiles: 4 }, { kind: 'aoe', at: 'self', radius: 4, mult: 3 }, { kind: 'stun', to: 'radius', at: 'self', radius: 4, duration: 1.5 }] } },
        { at: 0.25, name: 'Bubble Bath Fury', text: 'Floods the lane with bubbles and rages.', mods: { speedMult: 1.5, dmgMult: 1.8 }, effect: { kind: 'spawn_enemies', enemy: 'soap_slimer', count: 4, at: 'edge' } },
      ] }),
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
export const BOSSES = ENEMIES.filter((e) => e.boss);
