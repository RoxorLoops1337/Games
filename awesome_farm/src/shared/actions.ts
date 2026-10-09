// Every "key action" the juice rule covers. The simulation emits these as events;
// the client's FX table (client/juice/fx.ts) is a Record over this list, so adding an
// action here without giving it a sound + burst + shake fails to compile.

export const ACTIONS = [
    'hitWood', 'hitStone', 'hitEarth', 'hitCrystal', 'breakTree', 'breakRock', 'breakOre', 'breakEarth', 'breakCrystal', 'breakPlant', 'openChest',
    'pickup', 'build', 'buyLand', 'levelUp', 'perk', 'eat', 'plant', 'harvestCrop', 'sell',
    'smelt', 'upgrade', 'hurt', 'heal', 'enemyHit', 'enemyDie', 'dusk', 'dawn', 'deny',
    'downed', 'revive', 'join', 'win', 'craft', 'equip', 'skill', 'unlock', 'load', 'collect', 'drink',
    'shoot', 'slam', 'roar', 'bossDie', 'dash', 'crit', 'summon',
    'throwPod', 'catchOk', 'catchFail', 'petLevel', 'petWork', 'post',
    'riftEnter', 'waveStart', 'waveClear', 'boon', 'riftWin', 'riftFail',
    'eggStart', 'hatch', 'awaken',
    'cast', 'bite', 'fishCatch', 'fishLost',
    'tutorial', 'look', 'mail', 'dig', 'packDrop', 'descend', 'crateOpen', 'lucky', 'golden', 'jackpot', 'spin', 'gambleWin', 'gambleLose', 'rare',
    'perfect', 'hollow', 'titan',
    'hearth', 'pat', 'gift',      // (the evening hearth is kindled; you pet your companion; it digs up a gift: sim/hearth.ts, sim/bond.ts)
    'chute',
    'feast',
    // co-op boss statuses (sim/costatus.ts)
    'freeze', 'thaw', 'hex', 'hexTick', 'hexJump', 'chain', 'chainTug', 'unbind',
    'bedSet',     // (a Bed becomes where you wake up: sim/bed.ts)
    // the Blight (sim/blight.ts): hitting and breaking a nest, a nest spreading or merging
    'nestHit', 'nestDie', 'nestSpread',
    'raid',       // (a raid sets out from a nest at nightfall: sim/raid.ts)
    'bldHit', 'bldBreak',     // (a raider strikes a wall, and breaks it: sim/defense.ts)
    'towerShot', 'ballista', 'zap', 'spike',      // (the towers fire and the traps bite: they carry no farmer, so they never shake a camera)
] as const;

export type Action = typeof ACTIONS[number];
