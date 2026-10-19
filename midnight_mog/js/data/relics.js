// Relics: run modifiers found in crates and bosses. Relic = {id, name, rarity, tags, text, effect, synergy, flavor}.
// effect.kind is one of 'stat_mod' | 'on_event' | 'rule' (see docs/SYSTEMS.md). `synergy` lists cat/card tags that the relic rewards.

const rel = (id, name, rarity, tags, synergy, text, effect, flavor) => ({ id, name, rarity, tags, synergy, text, effect, flavor });

export const RELICS = [
  // ---- common ----
  rel('rusty_bell', 'Rusty Bell', 'common', ['energy'], ['energy'], 'Start every battle with +1 energy.',
    { kind: 'rule', rule: 'start_energy_add', value: 1 }, 'It rings once. Then you hear the tuna.'),
  rel('lucky_collar', 'Lucky Collar', 'common', ['crit'], ['crit'], 'All cats +10% crit chance.',
    { kind: 'stat_mod', scope: 'all_cats', stat: 'crit', add: 0.1 }, 'Four-leaf clover glued to a bottle cap.'),
  rel('fish_skeleton', 'Fish Skeleton Charm', 'common', ['economy'], ['economy'], '+20% fish from battles.',
    { kind: 'stat_mod', scope: 'economy', stat: 'fish', mult: 1.2 }, 'Still smells like Tuesday.'),
  rel('warm_sock', 'Warm Sock', 'common', ['hp'], ['tank', 'fluff'], 'All cats +15% max HP.',
    { kind: 'stat_mod', scope: 'all_cats', stat: 'hp', mult: 1.15 }, 'Only one. Nobody knows where the other went.'),
  rel('yarn_scrap', 'Yarn Scrap', 'common', ['economy'], ['economy'], '+15% yarn from battles.',
    { kind: 'stat_mod', scope: 'economy', stat: 'yarn', mult: 1.15 }, 'Unravel it. You know you want to.'),
  rel('scratch_pad_notes', 'Scratch Pad Notes', 'common', ['economy'], ['street'], 'Each kill has a 25% chance to drop 1 bonus fish.',
    { kind: 'on_event', trigger: 'on_kill', chance: 0.25, effect: { kind: 'reward_mult', resource: 'fish', flat: 1 } }, 'Scribbled: "got fish". Underlined twice.'),

  // ---- rare ----
  rel('ember_locket', 'Ember Locket', 'rare', ['fire'], ['fire'], 'Fire cats deal +30% damage and their hits burn for 3s.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'tag:fire', stat: 'dmg', mult: 1.3 }, { kind: 'on_event', trigger: 'on_hit', filter: { tag: 'fire' }, chance: 0.3, effect: { kind: 'dot', to: 'target', dps: 0.3, duration: 3, element: 'fire' } }] },
    'Holds one tiny forever-fire.'),
  rel('tesla_whisker', 'Tesla Whisker', 'rare', ['electric'], ['electric'], 'Electric cats deal +25% damage and chains jump 2 more times.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'tag:electric', stat: 'dmg', mult: 1.25 }, { kind: 'stat_mod', scope: 'tag:electric', stat: 'chain_jumps', add: 2 }] },
    'Plucked from a storm. Complained about it.'),
  rel('trapper_toolbelt', 'Trapper Toolbelt', 'rare', ['trap'], ['trap'], 'Traps get +1 charge and trapper cats +20% damage.',
    { kind: 'multi_mod', steps: [{ kind: 'rule', rule: 'trap_charges_add', value: 1 }, { kind: 'stat_mod', scope: 'role:trapper', stat: 'dmg', mult: 1.2 }] },
    'Twelve pouches. Eleven are snacks.'),
  rel('tin_whistle', 'Tin Whistle', 'rare', ['hand'], ['spell'], 'Hand size +1.',
    { kind: 'rule', rule: 'hand_size_add', value: 1 }, 'One long blow summons ideas.'),
  rel('hairball_amulet', 'Hairball Amulet', 'rare', ['spell'], ['spell'], 'Spells are 25% stronger.',
    { kind: 'stat_mod', scope: 'cards', stat: 'spell_power', mult: 1.25 }, 'Coughed up with great ceremony.'),
  rel('bulwark_bowl', 'Bulwark Bowl', 'rare', ['tank'], ['tank', 'reflect'], 'Tank cats +40% max HP and reflect 15% of damage taken.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'role:tank', stat: 'hp', mult: 1.4 }, { kind: 'stat_mod', scope: 'role:tank', stat: 'reflect', add: 0.15 }] },
    'Always full. Nobody knows who fills it.'),
  rel('sniper_scope', 'Sniper Scope', 'rare', ['crit'], ['ranged', 'crit'], 'Archers +1 range and +15% crit chance.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'role:archer', stat: 'range', add: 1 }, { kind: 'stat_mod', scope: 'role:archer', stat: 'crit', add: 0.15 }] },
    'A bottle bottom and a dream.'),
  rel('snack_dispenser', 'Snack Dispenser', 'rare', ['heal'], ['holy', 'medic'], 'At the start of each wave heal all cats for 10%.',
    { kind: 'on_event', trigger: 'on_wave_start', effect: { kind: 'heal', to: 'all', pct: 0.1 } }, 'Vends one treat per wave. Honor system.'),
  rel('catnip_pouch', 'Catnip Pouch', 'rare', ['buff'], ['buff', 'energy'], 'Buffs you cast last 30% longer.',
    { kind: 'rule', rule: 'buff_duration_mult', value: 1.3 }, 'Smells like confidence.'),
  rel('glow_stick', 'Glow Stick', 'rare', ['neon'], ['neon'], 'Neon cats attack 20% faster and deal +10% damage.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'tag:neon', stat: 'rate', mult: 1.2 }, { kind: 'stat_mod', scope: 'tag:neon', stat: 'dmg', mult: 1.1 }] },
    'Snapped at exactly the right moment.'),

  // ---- epic ----
  rel('moonstone_prism', 'Moonstone Prism', 'epic', ['spell'], ['spell', 'holy'], 'Spells have a 25% chance to cast twice.',
    { kind: 'rule', rule: 'spell_echo', value: 0.25 }, 'Bends one moon into two.'),
  rel('nine_lives_charm', 'Nine Lives Charm', 'epic', ['revive'], ['revive', 'tank'], 'Once per battle, the base survives lethal damage at 30% HP.',
    { kind: 'rule', rule: 'base_revive_once', value: 0.3 }, 'Two lives remain on the clasp.'),
  rel('stray_crown', 'Stray Crown', 'epic', ['cooldown'], ['royal'], 'Cat abilities recharge 25% faster. Royal cats 40%.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'all_cats', stat: 'cooldown', mult: 0.75 }, { kind: 'stat_mod', scope: 'tag:royal', stat: 'cooldown', mult: 0.8 }] },
    'Found in a puddle. Fits perfectly.'),
  rel('chain_reaction_collar', 'Chain Reaction Collar', 'epic', ['electric'], ['electric', 'neon'], 'Each kill has a 30% chance to chain lightning to 3 nearby enemies.',
    { kind: 'on_event', trigger: 'on_kill', chance: 0.3, effect: { kind: 'chain', jumps: 3, mult: 0.8, falloff: 0.1, range: 2.5, element: 'elec' } }, 'It crackles. It likes you.'),
  rel('overclock_battery', 'Overclock Battery', 'epic', ['energy'], ['energy', 'mech'], 'Energy regenerates 30% faster; mech cats +20% attack speed.',
    { kind: 'multi_mod', steps: [{ kind: 'rule', rule: 'energy_regen_mult', value: 1.3 }, { kind: 'stat_mod', scope: 'tag:mech', stat: 'rate', mult: 1.2 }] },
    'Do not lick it. A cat already did.'),
  rel('shadow_cloak', 'Shadow Cloak', 'epic', ['shadow'], ['shadow', 'summon'], 'Each summoned cat gains a shield worth 30% max HP for 6s.',
    { kind: 'on_event', trigger: 'on_summon', effect: { kind: 'shield', to: 'target', pct: 0.3, duration: 6 } }, 'Woven from the gap between streetlights.'),

  // ---- legend ----
  rel('infinite_yarn', 'The Infinite Yarn', 'legend', ['hand'], ['spell', 'trap'], 'Your first card each battle is free. Every card played has a 25% chance to draw one.',
    { kind: 'multi_mod', steps: [{ kind: 'rule', rule: 'first_card_free', value: 1 }, { kind: 'on_event', trigger: 'on_play_card', chance: 0.25, effect: { kind: 'draw', count: 1 } }] },
    'There is no end. Believe me, we looked.'),
  rel('midnight_crown', 'Crown of Midnight', 'legend', ['power'], ['royal', 'shadow'], 'All cats +25% damage and +25% HP, but enemies have +10% HP.',
    { kind: 'multi_mod', steps: [{ kind: 'stat_mod', scope: 'all_cats', stat: 'dmg', mult: 1.25 }, { kind: 'stat_mod', scope: 'all_cats', stat: 'hp', mult: 1.25 }, { kind: 'stat_mod', scope: 'enemies', stat: 'hp', mult: 1.1 }] },
    'Heavy is the head. Lighter is the wallet.'),
  rel('supernova_bell', 'Supernova Bell', 'legend', ['cooldown'], ['spell', 'electric', 'fire'], 'Each cat ability has a 20% chance to recharge instantly after casting.',
    { kind: 'on_event', trigger: 'on_cast', chance: 0.2, effect: { kind: 'reset_cooldown', to: 'self' } }, 'Rang once, in another galaxy.'),

  // ---- mythic ----
  rel('cheshire_grin', 'Cheshire Grin', 'mythic', ['summon'], ['void', 'shadow', 'summon'], 'Each kill has a 15% chance to conjure a spectral cat for 8s.',
    { kind: 'on_event', trigger: 'on_kill', chance: 0.15, effect: { kind: 'spawn', count: 1, minion: { name: 'Spectral Cat', hp: 400, dmg: 30, range: 3, rate: 1.2, duration: 8 } } }, 'Floats where the cat was.'),
  rel('nine_tailed_halo', 'Nine Tailed Halo', 'mythic', ['cooldown'], ['holy', 'royal', 'revive'], 'Each cat ability has a 40% chance to cast twice. Cats survive death once per battle at 25% HP.',
    { kind: 'multi_mod', steps: [{ kind: 'rule', rule: 'ability_echo', value: 0.4 }, { kind: 'rule', rule: 'cat_revive_once', value: 0.25 }] },
    'Nine tails, nine lives, nine opinions.'),
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));
