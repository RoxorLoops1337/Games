/*
 * HEARTHPAWS clan cards (B02). 42 non-champion cards: 20 units, 14 spells, 8 toys.
 * Rarity: 18 common, 16 uncommon, 8 rare. Schema: A03. Rules: RULES.md (locked).
 * Toys use the A03 type "toy" and occupy one of the two room slots on a floor.
 * The clan basic unit and the 2 champions are NOT in this file.
 *
 * Loop tags (tags field, "loop:<name>"): eternal_nap, heap_fortress, purr_furnace, alarm_chain.
 *
 * NEEDS: (engine additions; everything else uses existing A03/A04/A05 vocabulary)
 *  1. Trigger onWake: fires when a Napping cat wakes (the Stretch). triggerSource = that cat.
 *     Cards using it: pillow_bruiser, snooze_tabby. onWake resolves AFTER the Stretch attack.
 *  2. Trigger onDusk: fires at the Dusk tick, after the Rested gain and before the Purr heal.
 *  3. Effect type "wake": force target cat(s) to wake now; any Napping cat does its Stretch immediately.
 *     Waking by effect still consumes Rested like a normal wake. Used by alarm_clock.
 *  4. Effect "nap" inside onPlay (sleepy_calico, old_mortimer) ignores the "cannot Nap the turn it was played" rule.
 *  5. AmountExpr counters: adjacentCats, pileSize (size of the Pile the source is in, 0 if none),
 *     restedOnSelf, restedOnFloor (sum of Rested on all cats on the floor), nappingCats (all Napping cats
 *     on the board), fluffOnSelf.
 *  6. AmountExpr extra fields: "div" (floor(counter / div) replaces mult) and "cap" (max result).
 *  7. Checks: selfNapping (bool), pileSize (number, same meaning as the counter).
 *  8. Aura: an "if" array on an aura entry (cuddle_captain). Aura stat "pileSize" with target thisFloor
 *     (+N to the size of every Pile on that floor, big_mama, family_portrait). Aura stat "keyword:deepsleep"
 *     (hammock) grants a keyword while the cat stands on the floor.
 *  9. Keyword deepsleep (old_mortimer, hammock): Rested max 6 on this cat and it is never Rudely Awakened
 *     (damage does not wake it and does not strip Rested).
 * 10. Passive spell effects: target "thisFloor" inside a passive registered by a spell on onNap resolves
 *     as the floor of the triggering cat (nap_economy).
 * 11. Tags kitten and large are read by upgrades and the Box rules; "large" cards have stats.size 2.
 * 12. (verification pass) New ops in src/engine/ops-hearth.js: fluffByPile (Group Hug), pileBoost (Heated Blanket,
 *     Hearth Rug), setUnitFlag (noRude on Window Hammock and Old Mortimer), check notRudeWake (Snooze Tabby,
 *     Pillow Bruiser act on a real Stretch only), and the deepsleep Rested cap of 6.
 */
window.SB = window.SB || {}; SB.data = SB.data || {};

(function () {
  var CLAN = 'hearth';

  function art(a) { return { sprite: a[0], palette: a[1], desc: a[2] }; }

  function unit(id, name, rarity, cost, power, health, lives, o) {
    var c = {
      id: id, name: name, type: 'unit', clan: CLAN, rarity: rarity, cost: cost, targeting: 'floor',
      stats: { power: power, health: health, lives: lives, size: o.size || 1 },
      keywords: o.kw || {}, text: o.text, flavor: o.flavor
    };
    if (o.effects) c.effects = o.effects;
    if (o.aura) c.aura = o.aura;
    c.upgrade = o.up;
    c.art = art(o.art);
    c.tags = o.tags || [];
    c.unlock = 'start';
    return c;
  }

  function spell(id, name, rarity, cost, targeting, o) {
    var c = {
      id: id, name: name, type: 'spell', clan: CLAN, rarity: rarity, cost: cost, targeting: targeting,
      keywords: o.kw || {}, text: o.text, flavor: o.flavor, effects: { onPlay: o.play },
      upgrade: o.up, art: art(o.art), tags: o.tags || [], unlock: 'start'
    };
    return c;
  }

  function toy(id, name, rarity, cost, o) {
    var c = {
      id: id, name: name, type: 'toy', clan: CLAN, rarity: rarity, cost: cost, targeting: 'floor',
      keywords: {}, text: o.text, flavor: o.flavor
    };
    if (o.effects) c.effects = o.effects;
    if (o.aura) c.aura = o.aura;
    c.upgrade = o.up;
    c.art = art(o.art);
    c.tags = o.tags || [];
    c.unlock = 'start';
    return c;
  }

  var cards = [];

  /* ===================== CAT UNITS (20) ===================== */

  // ---- Common (9) ----
  cards.push(unit('hearth_sleepy_calico', 'Sleepy Calico', 'common', 1, 2, 5, 3, {
    text: 'Deploy: Naps and gains Rested 1.',
    flavor: 'Arrived already asleep. Saves everyone time.',
    effects: { onPlay: [
      { type: 'nap', target: 'self' },
      { type: 'applyStatus', status: 'rested', amount: 1, target: 'self' }
    ] },
    up: { stats: { health: 7 }, text: 'Deploy: Naps and gains Rested 2.', effects: { onPlay: [
      { type: 'nap', target: 'self' },
      { type: 'applyStatus', status: 'rested', amount: 2, target: 'self' }
    ] } },
    art: ['cat_calico_loaf', 'cream', 'calico loaf with eyes shut, one ear twitching'],
    tags: ['nap', 'rested', 'loop:eternal_nap']
  }));

  cards.push(unit('hearth_biscuit_baker', 'Biscuit Baker', 'common', 1, 2, 5, 3, {
    text: 'End of your turn: adjacent Cats gain +1 Health for the fight.',
    flavor: 'Makes biscuits. There is no dough. Nobody has mentioned it.',
    effects: { onTurnEnd: [{ type: 'buff', stat: 'health', amount: 1, duration: 'fight', target: 'adjacentCats' }] },
    up: { text: 'End of your turn: adjacent Cats gain +2 Health for the fight.',
      effects: { onTurnEnd: [{ type: 'buff', stat: 'health', amount: 2, duration: 'fight', target: 'adjacentCats' }] } },
    art: ['cat_kneader', 'cream', 'cream cat kneading a cushion, flour-free apron'],
    tags: ['kneading', 'pile']
  }));

  cards.push(unit('hearth_porch_tabby', 'Porch Tabby', 'common', 1, 2, 6, 3, {
    kw: { purr: 1 }, text: 'Purr 1.',
    flavor: 'Mostly decorative. Decoratively load-bearing.',
    up: { keywords: { purr: 2 }, text: 'Purr 2.' },
    art: ['cat_tabby_sit', 'gold', 'amber tabby sitting upright on a doormat'],
    tags: ['purr']
  }));

  cards.push(unit('hearth_lap_squatter', 'Lap Squatter', 'common', 2, 3, 6, 3, {
    text: '+1 Power for each adjacent Cat.',
    flavor: 'Never agreed to this lap. Has not left it.',
    aura: [{ stat: 'power', amount: { base: 0, per: 'adjacentCats', mult: 1 }, target: 'self' }],
    up: { stats: { health: 8 } },
    art: ['cat_lump', 'gold', 'ginger cat draped across a stranger-sized knee'],
    tags: ['pile']
  }));

  cards.push(unit('hearth_fluff_ball', 'Fluff Ball', 'common', 1, 2, 5, 3, {
    text: 'Deploy: gain Fluff 4.',
    flavor: 'Mostly fur. A cat is in there somewhere.',
    effects: { onPlay: [{ type: 'fluff', amount: 4, target: 'self' }] },
    up: { text: 'Deploy: gain Fluff 6.', effects: { onPlay: [{ type: 'fluff', amount: 6, target: 'self' }] } },
    art: ['cat_puffball', 'cream', 'perfectly round white longhair, two eyes and a nose'],
    tags: ['fluff']
  }));

  cards.push(unit('hearth_sleepy_kitten', 'Sleepy Kitten', 'common', 0, 1, 3, 2, {
    text: 'Deploy: heal adjacent Cats 3.',
    flavor: 'Fell asleep mid-sentence. Sentences are new.',
    effects: { onPlay: [{ type: 'heal', amount: 3, target: 'adjacentCats' }] },
    up: { text: 'Deploy: heal adjacent Cats 5.', effects: { onPlay: [{ type: 'heal', amount: 5, target: 'adjacentCats' }] } },
    art: ['kitten_curl', 'cream', 'tiny kitten curled in a teacup shape'],
    tags: ['kitten', 'heal', 'pile']
  }));

  cards.push(unit('hearth_granny_whiskers', 'Granny Whiskers', 'common', 2, 2, 6, 3, {
    text: 'End of your turn: heal other Cats on this floor 2.',
    flavor: 'Has a tin for every injury. It is the same tin.',
    effects: { onTurnEnd: [{ type: 'heal', amount: 2, target: 'otherCatsOnFloor' }] },
    up: { text: 'End of your turn: heal other Cats on this floor 3.',
      effects: { onTurnEnd: [{ type: 'heal', amount: 3, target: 'otherCatsOnFloor' }] } },
    art: ['cat_granny', 'grey', 'grey elder cat in knitted shawl and tiny spectacles'],
    tags: ['heal']
  }));

  cards.push(unit('hearth_pillow_bruiser', 'Pillow Bruiser', 'common', 2, 3, 7, 3, {
    text: 'Stretch: gain Fluff 4.',
    flavor: 'A big cat in a small chair. The chair is a witness.',
    effects: { onWake: [{ type: 'fluff', amount: 4, target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] }] },
    up: { text: 'Stretch: gain Fluff 6.', effects: { onWake: [{ type: 'fluff', amount: 6, target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] }] } },
    art: ['cat_bruiser', 'gold', 'broad cream tom pressed into an armchair, yawning'],
    tags: ['nap', 'stretch', 'fluff', 'loop:alarm_chain']
  }));

  cards.push(unit('hearth_dozing_tom', 'Dozing Tom', 'common', 1, 3, 5, 3, {
    text: 'Whenever this Naps, gain Fluff 2.',
    flavor: 'Closes eyes. Gains armor. Nobody questions the physics.',
    effects: { onNap: [{ type: 'fluff', amount: 2, target: 'self' }] },
    up: { text: 'Whenever this Naps, gain Fluff 3.', effects: { onNap: [{ type: 'fluff', amount: 3, target: 'self' }] } },
    art: ['cat_tom_doze', 'gold', 'orange tom mid-nod, chin on chest'],
    tags: ['nap', 'fluff']
  }));

  // ---- Uncommon (7) ----
  cards.push(unit('hearth_warm_belly', 'Warm Belly', 'uncommon', 2, 1, 7, 3, {
    kw: { purr: 2 }, text: 'Purr 2. Deploy: add 3 Purr to this floor.',
    flavor: 'Warm to the touch. Warm to the argument.',
    effects: { onPlay: [{ type: 'floorStatus', status: 'purr', amount: 3, target: 'thisFloor' }] },
    up: { keywords: { purr: 3 }, text: 'Purr 3. Deploy: add 3 Purr to this floor.' },
    art: ['cat_belly', 'gold', 'rolled-over cat showing a striped belly like a hot-water bottle'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  cards.push(unit('hearth_cuddle_captain', 'Cuddle Captain', 'uncommon', 2, 2, 6, 3, {
    text: 'Other Cats here have +1 Power while in a Pile of 3 or more.',
    flavor: "Calls everyone 'team'. Means the horizontal kind.",
    aura: [{ stat: 'power', amount: 1, target: 'otherCatsOnFloor', if: [{ check: 'pileSize', op: '>=', value: 3 }] }],
    up: { text: 'Other Cats here have +2 Power while in a Pile of 3 or more.',
      aura: [{ stat: 'power', amount: 2, target: 'otherCatsOnFloor', if: [{ check: 'pileSize', op: '>=', value: 3 }] }] },
    art: ['cat_captain', 'gold', 'ginger cat in a tiny sailor cap, paws spread in a group hug'],
    tags: ['pile', 'loop:heap_fortress']
  }));

  cards.push(unit('hearth_sleep_talker', 'Sleep Talker', 'uncommon', 2, 1, 5, 3, {
    text: 'Start of your turn: if Napping, draw 1 card.',
    flavor: "Mumbles card advice in its sleep. Mostly 'fish'.",
    effects: { onTurnStart: [{ type: 'draw', amount: 1, target: 'player', if: [{ check: 'selfNapping', op: '==', value: true }] }] },
    up: { cost: 1 },
    art: ['cat_talker', 'cream', 'siamese-point cat asleep with a speech bubble of zeds'],
    tags: ['nap', 'draw', 'loop:eternal_nap']
  }));

  cards.push(unit('hearth_snooze_tabby', 'Snooze Tabby', 'uncommon', 2, 2, 6, 3, {
    text: 'Stretch: Naps again with Rested 1.',
    flavor: 'Five more minutes. Has been saying this since Tuesday.',
    effects: { onWake: [
      { type: 'nap', target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] },
      { type: 'applyStatus', status: 'rested', amount: 1, target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] }
    ] },
    up: { stats: { health: 8 }, text: 'Stretch: Naps again with Rested 2.', effects: { onWake: [
      { type: 'nap', target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] },
      { type: 'applyStatus', status: 'rested', amount: 2, target: 'self', if: [{ check: 'notRudeWake', op: '==', value: true }] }
    ] } },
    art: ['cat_snooze', 'gold', 'tabby with one paw hovering over an alarm clock'],
    tags: ['nap', 'stretch', 'loop:eternal_nap', 'loop:alarm_chain']
  }));

  cards.push(unit('hearth_cushion_matron', 'Cushion Matron', 'uncommon', 3, 2, 9, 3, {
    text: 'End of your turn: if in a Pile of 3 or more, all Cats here gain Fluff 2.',
    flavor: 'Runs a tight household. Tight meaning snug.',
    effects: { onTurnEnd: [{ type: 'fluff', amount: 2, target: 'allCatsOnFloor', if: [{ check: 'pileSize', op: '>=', value: 3 }] }] },
    up: { text: 'End of your turn: if in a Pile of 3 or more, all Cats here gain Fluff 3.',
      effects: { onTurnEnd: [{ type: 'fluff', amount: 3, target: 'allCatsOnFloor', if: [{ check: 'pileSize', op: '>=', value: 3 }] }] } },
    art: ['cat_matron', 'gold', 'plump matron cat on a throw cushion, flanked by smaller cats'],
    tags: ['pile', 'fluff', 'loop:heap_fortress']
  }));

  cards.push(unit('hearth_idle_engine', 'Idle Engine', 'uncommon', 2, 1, 6, 3, {
    text: 'End of your turn: add Purr to this floor equal to the Cats on it.',
    flavor: 'Runs rough until someone strokes it.',
    effects: { onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'catsOnFloor', mult: 1 }, target: 'thisFloor' }] },
    up: { text: 'End of your turn: add Purr to this floor equal to the Cats on it, plus 1.',
      effects: { onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: { base: 1, per: 'catsOnFloor', mult: 1 }, target: 'thisFloor' }] } },
    art: ['cat_engine', 'grey', 'grey cat with a tiny exhaust pipe tail, sound lines around it'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  cards.push(unit('hearth_dough_paws', 'Dough Paws', 'uncommon', 2, 1, 5, 3, {
    text: 'Whenever this Naps, gain +1 Power and +2 Health for the fight.',
    flavor: 'Kneads the air. The air has risen.',
    effects: { onNap: [
      { type: 'buff', stat: 'power', amount: 1, duration: 'fight', target: 'self' },
      { type: 'buff', stat: 'health', amount: 2, duration: 'fight', target: 'self' }
    ] },
    up: { text: 'Whenever this Naps, gain +1 Power and +3 Health for the fight.', effects: { onNap: [
      { type: 'buff', stat: 'power', amount: 1, duration: 'fight', target: 'self' },
      { type: 'buff', stat: 'health', amount: 3, duration: 'fight', target: 'self' }
    ] } },
    art: ['cat_dough', 'cream', 'cat with floury paws mid-knead on a bread loaf'],
    tags: ['nap', 'kneading', 'loop:alarm_chain']
  }));

  // ---- Rare (4) ----
  cards.push(unit('hearth_big_mama', 'Big Mama Marmalade', 'rare', 3, 3, 13, 4, {
    size: 2,
    text: 'Large. Counts as 2 Cats for Pile size. Dusk: heal other Cats here 2.',
    flavor: 'Has opinions and a lap. The lap has a waiting list.',
    aura: [{ stat: 'pileSize', amount: 1, target: 'thisFloor' }],
    effects: { onDusk: [{ type: 'heal', amount: 2, target: 'otherCatsOnFloor' }] },
    up: { stats: { health: 16 }, text: 'Large. Counts as 2 Cats for Pile size. Dusk: heal other Cats here 3.',
      effects: { onDusk: [{ type: 'heal', amount: 3, target: 'otherCatsOnFloor' }] } },
    art: ['cat_bigmama', 'gold', 'enormous marmalade matriarch, three kittens asleep on her back'],
    tags: ['large', 'pile', 'heal', 'loop:heap_fortress']
  }));

  cards.push(unit('hearth_sir_floofington', 'Sir Floofington', 'rare', 2, 1, 8, 3, {
    text: 'Deploy: Fluff 6. End of your turn: Fluff 2. +1 Power per 3 Fluff on it.',
    flavor: 'Weighs nothing. Hits like a sofa.',
    aura: [{ stat: 'power', amount: { base: 0, per: 'fluffOnSelf', div: 3 }, target: 'self' }],
    effects: { onPlay: [{ type: 'fluff', amount: 6, target: 'self' }], onTurnEnd: [{ type: 'fluff', amount: 2, target: 'self' }] },
    up: { text: 'Deploy: Fluff 6. End of your turn: Fluff 2. +1 Power per 2 Fluff on it.',
      aura: [{ stat: 'power', amount: { base: 0, per: 'fluffOnSelf', div: 2 }, target: 'self' }] },
    art: ['cat_floof', 'cream', 'cloud-shaped persian wearing a tiny knight collar'],
    tags: ['fluff', 'loop:heap_fortress']
  }));

  cards.push(unit('hearth_old_mortimer', 'Old Mortimer, Asleep', 'rare', 2, 1, 11, 3, {
    kw: { deepsleep: true },
    text: 'Deep Sleeper. Deploy: Naps. Dusk: if Napping, add Purr equal to Rested.',
    flavor: 'Present at every major family event. Aware of none.',
    effects: {
      onPlay: [{ type: 'nap', target: 'self' }, { type: 'setUnitFlag', flag: 'noRude' }],
      onDusk: [{ type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'restedOnSelf', mult: 1 }, target: 'thisFloor', if: [{ check: 'selfNapping', op: '==', value: true }] }]
    },
    up: { stats: { health: 14 }, text: 'Deep Sleeper. Deploy: Naps. Dusk: if Napping, add Purr equal to twice its Rested.',
      effects: {
        onPlay: [{ type: 'nap', target: 'self' }, { type: 'setUnitFlag', flag: 'noRude' }],
        onDusk: [{ type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'restedOnSelf', mult: 2 }, target: 'thisFloor', if: [{ check: 'selfNapping', op: '==', value: true }] }]
      } },
    art: ['cat_mortimer', 'grey', 'ancient grey cat with a dust layer and a very small hat, asleep'],
    tags: ['nap', 'rested', 'purr', 'loop:eternal_nap']
  }));

  cards.push(unit('hearth_mother_rumble', 'Mother Rumble', 'rare', 3, 2, 8, 3, {
    kw: { purr: 2 },
    text: 'Purr 2. Cats here have +1 Power per 5 Purr on this floor.',
    flavor: 'Registers on seismographs. The seismologists stopped asking.',
    aura: [{ stat: 'power', amount: { base: 0, per: 'purrOnFloor', div: 5 }, target: 'allCatsOnFloor' }],
    up: { keywords: { purr: 3 }, text: 'Purr 3. Cats here have +1 Power per 4 Purr on this floor.',
      aura: [{ stat: 'power', amount: { base: 0, per: 'purrOnFloor', div: 4 }, target: 'allCatsOnFloor' }] },
    art: ['cat_rumble', 'gold', 'huge tortoiseshell cat, concentric sound rings shaking the floor'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  /* ===================== SPELLS (14) ===================== */

  // ---- Common (6) ----
  cards.push(spell('hearth_lullaby', 'Lullaby', 'common', 1, 'cat', {
    text: 'A Cat Naps, gains Rested 2 and heals 2.',
    flavor: 'Sung badly on purpose. It works better that way.',
    play: [
      { type: 'nap', target: 'chosenCat' },
      { type: 'applyStatus', status: 'rested', amount: 2, target: 'chosenCat' },
      { type: 'heal', amount: 2, target: 'chosenCat' }
    ],
    up: { text: 'A Cat Naps, gains Rested 3 and heals 4.', effects: { onPlay: [
      { type: 'nap', target: 'chosenCat' },
      { type: 'applyStatus', status: 'rested', amount: 3, target: 'chosenCat' },
      { type: 'heal', amount: 4, target: 'chosenCat' }
    ] } },
    art: ['spell_lullaby', 'cream', 'music notes drifting over a sleeping cat'],
    tags: ['nap', 'rested']
  }));

  cards.push(spell('hearth_tuck_in', 'Tuck In', 'common', 1, 'cat', {
    text: 'Heal a Cat 4 and give it Fluff 4.',
    flavor: 'Corners tucked. Cat sealed. No notes.',
    play: [{ type: 'heal', amount: 4, target: 'chosenCat' }, { type: 'fluff', amount: 4, target: 'chosenCat' }],
    up: { text: 'Heal a Cat 6 and give it Fluff 6.', effects: { onPlay: [
      { type: 'heal', amount: 6, target: 'chosenCat' }, { type: 'fluff', amount: 6, target: 'chosenCat' }
    ] } },
    art: ['spell_tuck', 'gold', 'cat rolled into a blanket burrito, only ears showing'],
    tags: ['heal', 'fluff']
  }));

  cards.push(spell('hearth_stoke_radiator', 'Stoke the Radiator', 'common', 1, 'floor', {
    text: 'Add 4 Purr to a floor.',
    flavor: 'The radiator ticks. The cats take it personally.',
    play: [{ type: 'floorStatus', status: 'purr', amount: 4, target: 'chosenFloor' }],
    up: { text: 'Add 6 Purr to a floor.', effects: { onPlay: [{ type: 'floorStatus', status: 'purr', amount: 6, target: 'chosenFloor' }] } },
    art: ['spell_radiator', 'gold', 'cast-iron radiator with a cat shaped heat shimmer'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  cards.push(spell('hearth_fluff_up', 'Fluff Up', 'common', 1, 'floor', {
    text: 'Cats on a floor gain Fluff 3.',
    flavor: 'A single, slow, collective inhale.',
    play: [{ type: 'fluff', amount: 3, target: 'allCatsOnFloor' }],
    up: { text: 'Cats on a floor gain Fluff 5.', effects: { onPlay: [{ type: 'fluff', amount: 5, target: 'allCatsOnFloor' }] } },
    art: ['spell_fluffup', 'cream', 'row of cats doubling in size like popping corn'],
    tags: ['fluff', 'loop:heap_fortress']
  }));

  cards.push(spell('hearth_cozy_swat', 'Cozy Swat', 'common', 1, 'enemy', {
    text: 'Deal 3 damage. Heal all Cats 1.',
    flavor: 'A slap, but with a blanket on it.',
    play: [{ type: 'damage', amount: 3, kind: 'hit', target: 'chosenEnemy' }, { type: 'heal', amount: 1, target: 'allCats' }],
    up: { text: 'Deal 5 damage. Heal all Cats 2.', effects: { onPlay: [
      { type: 'damage', amount: 5, kind: 'hit', target: 'chosenEnemy' }, { type: 'heal', amount: 2, target: 'allCats' }
    ] } },
    art: ['spell_cozyswat', 'gold', 'paw wrapped in a knitted mitten mid-swat'],
    tags: ['heal']
  }));

  cards.push(spell('hearth_second_breakfast', 'Second Breakfast', 'common', 0, 'cat', {
    kw: { exhaust: true },
    text: 'Heal a Cat 3. Draw 1 card. Exhaust.',
    flavor: 'Technically a second dinner. The bowl has no jurisdiction.',
    play: [{ type: 'heal', amount: 3, target: 'chosenCat' }, { type: 'draw', amount: 1, target: 'player' }],
    up: { text: 'Heal a Cat 5. Draw 1 card. Exhaust.', effects: { onPlay: [
      { type: 'heal', amount: 5, target: 'chosenCat' }, { type: 'draw', amount: 1, target: 'player' }
    ] } },
    art: ['spell_breakfast', 'cream', 'tiny bowl, tiny fork, enormous satisfaction'],
    tags: ['heal', 'draw']
  }));

  // ---- Uncommon (6) ----
  cards.push(spell('hearth_alarm_clock', 'Alarm Clock', 'uncommon', 1, 'floor', {
    text: 'Wake all Napping Cats on a floor. They Stretch now.',
    flavor: "Ringing, in the cat's opinion, is an act of war.",
    play: [{ type: 'wake', target: 'allCatsOnFloor' }],
    up: { cost: 0 },
    art: ['spell_alarm', 'gold', 'brass twin-bell alarm clock vibrating off a nightstand'],
    tags: ['nap', 'stretch', 'loop:alarm_chain']
  }));

  cards.push(spell('hearth_naptime', 'Naptime', 'uncommon', 2, 'floor', {
    text: 'All Cats on a floor Nap and gain Rested 1.',
    flavor: 'Lights off. Cats off. Nobody is on call.',
    play: [{ type: 'nap', target: 'allCatsOnFloor' }, { type: 'applyStatus', status: 'rested', amount: 1, target: 'allCatsOnFloor' }],
    up: { text: 'All Cats on a floor Nap and gain Rested 2.', effects: { onPlay: [
      { type: 'nap', target: 'allCatsOnFloor' }, { type: 'applyStatus', status: 'rested', amount: 2, target: 'allCatsOnFloor' }
    ] } },
    art: ['spell_naptime', 'cream', 'a floor of cats going dark one by one, like city lights'],
    tags: ['nap', 'rested', 'loop:eternal_nap']
  }));

  cards.push(spell('hearth_warm_lap', 'Warm Lap', 'uncommon', 1, 'floor', {
    text: 'Add Purr to a floor equal to the Rested on it. Rested stays.',
    flavor: 'Converts naps into warmth at a rate set by nobody.',
    play: [{ type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'restedOnFloor', mult: 1 }, target: 'chosenFloor' }],
    up: { text: 'Add Purr to a floor equal to twice the Rested on it. Rested stays.', effects: { onPlay: [
      { type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'restedOnFloor', mult: 2 }, target: 'chosenFloor' }
    ] } },
    art: ['spell_lap', 'gold', 'a lap, patted twice, glowing faintly'],
    tags: ['rested', 'purr', 'loop:eternal_nap', 'loop:purr_furnace']
  }));

  cards.push(spell('hearth_group_hug', 'Group Hug', 'uncommon', 2, 'floor', {
    text: 'Cats on a floor gain Fluff equal to twice their Pile size.',
    flavor: 'Nobody asked for consent. Nobody asked to leave.',
    play: [{ type: 'fluffByPile', mult: 2, target: 'allCatsOnFloor' }],
    up: { text: 'Cats on a floor gain Fluff equal to three times their Pile size.', effects: { onPlay: [
      { type: 'fluffByPile', mult: 3, target: 'allCatsOnFloor' }
    ] } },
    art: ['spell_hug', 'gold', 'four cats fused into one heart-shaped heap'],
    tags: ['pile', 'fluff', 'loop:heap_fortress']
  }));

  cards.push(spell('hearth_purr_crescendo', 'Purr Crescendo', 'uncommon', 2, 'floor', {
    text: 'Double the Purr on a floor (adds at most 10).',
    flavor: 'It starts as a hum. The windows disagree.',
    play: [{ type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'purrOnFloor', mult: 1, cap: 10 }, target: 'chosenFloor' }],
    up: { text: 'Double the Purr on a floor (adds at most 16).', effects: { onPlay: [
      { type: 'floorStatus', status: 'purr', amount: { base: 0, per: 'purrOnFloor', mult: 1, cap: 16 }, target: 'chosenFloor' }
    ] } },
    art: ['spell_crescendo', 'gold', 'wavy sound rings growing until they crack a picture frame'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  cards.push(spell('hearth_sunny_spot', 'Sunny Spot', 'uncommon', 1, 'none', {
    text: 'Heal the Sunbeam 2, plus 1 per Napping Cat.',
    flavor: 'The patch of sun is real. The cats are on it. Everyone wins.',
    play: [{ type: 'warmth', amount: { base: 2, per: 'nappingCats', mult: 1 } }],
    up: { text: 'Heal the Sunbeam 3, plus 1 per Napping Cat.', effects: { onPlay: [
      { type: 'warmth', amount: { base: 3, per: 'nappingCats', mult: 1 } }
    ] } },
    art: ['spell_sunspot', 'gold', 'a square of window light with three sleeping loaves on it'],
    tags: ['nap', 'sunbeam', 'loop:eternal_nap']
  }));

  // ---- Rare (2) ----
  cards.push(spell('hearth_nap_economy', 'Nap Economy', 'rare', 2, 'none', {
    kw: { exhaust: true },
    text: 'Rest of fight: whenever a Cat Naps, add 2 Purr to its floor and heal the Sunbeam 1. Exhaust.',
    flavor: 'Output is down. Morale is up. Stakeholders are asleep.',
    play: [{ type: 'passive', trigger: 'onNap', effects: [
      { type: 'floorStatus', status: 'purr', amount: 2, target: 'thisFloor' },
      { type: 'warmth', amount: 1 }
    ] }],
    up: { cost: 1 },
    art: ['spell_economy', 'gold', 'tiny cat in a tie asleep on a rising bar chart'],
    tags: ['nap', 'purr', 'sunbeam', 'loop:eternal_nap']
  }));

  cards.push(spell('hearth_hibernation', 'Hibernation', 'rare', 3, 'none', {
    kw: { exhaust: true },
    text: 'All Cats Nap and gain Rested 2. Heal the Sunbeam 2 per Napping Cat. Exhaust.',
    flavor: 'The house is under attack. The cats are under blankets.',
    play: [
      { type: 'nap', target: 'allCats' },
      { type: 'applyStatus', status: 'rested', amount: 2, target: 'allCats' },
      { type: 'warmth', amount: { base: 0, per: 'nappingCats', mult: 2 } }
    ],
    up: { cost: 2 },
    art: ['spell_hibernation', 'cream', 'whole house dimmed under a patchwork quilt, snoring audible'],
    tags: ['nap', 'rested', 'sunbeam', 'loop:eternal_nap']
  }));

  /* ===================== TOYS AND ROOMS (8) ===================== */

  // ---- Common (3) ----
  cards.push(toy('hearth_sunny_cushion', 'Sunny Cushion', 'common', 1, {
    text: 'End of your turn: add 3 Purr to this floor.',
    flavor: 'Stuffed with sunlight. Do not ask how.',
    effects: { onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: 3, target: 'thisFloor' }] },
    up: { text: 'End of your turn: add 4 Purr to this floor.',
      effects: { onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: 4, target: 'thisFloor' }] } },
    art: ['toy_cushion', 'gold', 'square yellow cushion with a faint glow'],
    tags: ['purr', 'loop:purr_furnace']
  }));

  cards.push(toy('hearth_treat_bowl', 'Treat Bowl', 'common', 1, {
    text: 'Cats deployed here heal 3 and gain Fluff 2.',
    flavor: 'Not for eating. For being near. Then eating.',
    effects: { onCatDeployed: [
      { type: 'heal', amount: 3, target: 'triggerSource' },
      { type: 'fluff', amount: 2, target: 'triggerSource' }
    ] },
    up: { text: 'Cats deployed here heal 4 and gain Fluff 3.', effects: { onCatDeployed: [
      { type: 'heal', amount: 4, target: 'triggerSource' },
      { type: 'fluff', amount: 3, target: 'triggerSource' }
    ] } },
    art: ['toy_bowl', 'cream', 'ceramic bowl with a fish painted on the bottom'],
    tags: ['heal', 'fluff']
  }));

  cards.push(toy('hearth_wool_blanket', 'Wool Blanket', 'common', 1, {
    text: 'End of your turn: Cats here gain Fluff 1.',
    flavor: 'Itchy. Beloved. Impossible to wash.',
    effects: { onTurnEnd: [{ type: 'fluff', amount: 1, target: 'allCatsOnFloor' }] },
    up: { text: 'End of your turn: Cats here gain Fluff 2.',
      effects: { onTurnEnd: [{ type: 'fluff', amount: 2, target: 'allCatsOnFloor' }] } },
    art: ['toy_blanket', 'cream', 'chunky knit blanket in oatmeal and mustard'],
    tags: ['fluff', 'loop:heap_fortress']
  }));

  // ---- Uncommon (3) ----
  cards.push(toy('hearth_heated_blanket', 'Heated Blanket', 'uncommon', 2, {
    text: 'Dusk: Cats here in a Pile of 3 or more heal 2.',
    flavor: 'Plugged in. Do not ask who pays. Do not look at the meter.',
    effects: { onDusk: [{ type: 'pileBoost', min: 3, heal: 2, target: 'allCatsOnFloor' }] },
    up: { text: 'Dusk: Cats here in a Pile of 3 or more heal 3.',
      effects: { onDusk: [{ type: 'pileBoost', min: 3, heal: 3, target: 'allCatsOnFloor' }] } },
    art: ['toy_heatblanket', 'gold', 'orange-glowing electric blanket with a frayed cord'],
    tags: ['pile', 'heal', 'loop:heap_fortress']
  }));

  cards.push(toy('hearth_hammock', 'Window Hammock', 'uncommon', 2, {
    text: 'Cats here are never Rudely Awakened. Whenever a Cat here Naps, it gains Rested 1 extra.',
    flavor: 'Strung between two things never meant to hold a cat.',
    aura: [{ stat: 'keyword:deepsleep', amount: 1, target: 'allCatsOnFloor' }],
    effects: { onPlay: [{ type: 'setUnitFlag', flag: 'noRude' }], onNap: [{ type: 'applyStatus', status: 'rested', amount: 1, target: 'triggerSource' }] },
    up: { text: 'Cats here are never Rudely Awakened. Whenever a Cat here Naps, it gains Rested 2 extra.',
      effects: { onPlay: [{ type: 'setUnitFlag', flag: 'noRude' }], onNap: [{ type: 'applyStatus', status: 'rested', amount: 2, target: 'triggerSource' }] } },
    art: ['toy_hammock', 'cream', 'rope hammock hooked to a window frame, sun-faded'],
    tags: ['nap', 'rested', 'loop:eternal_nap']
  }));

  cards.push(toy('hearth_family_portrait', 'Family Portrait', 'uncommon', 2, {
    text: 'Piles on this floor count as 1 Cat larger.',
    flavor: 'Hung crooked. Nobody will fix it. They are all in it.',
    aura: [{ stat: 'pileSize', amount: 1, target: 'thisFloor' }],
    up: { cost: 1 },
    art: ['toy_portrait', 'gold', 'gilt frame holding a blurry heap of cats'],
    tags: ['pile', 'loop:heap_fortress']
  }));

  // ---- Rare (2) ----
  cards.push(toy('hearth_hearth_rug', 'Hearth Rug', 'rare', 3, {
    text: 'Dusk: if a Heap (4 Cats) stands here, each Cat gains Fluff 2 and heals 2 more.',
    flavor: 'Said to tie the room together. The cats tie it down.',
    effects: { onDusk: [{ type: 'pileBoost', min: 4, fluff: 2, heal: 2, target: 'allCatsOnFloor' }] },
    up: { text: 'Dusk: if a Heap (4 Cats) stands here, each Cat gains Fluff 3 and heals 3 more.', effects: { onDusk: [{ type: 'pileBoost', min: 4, fluff: 3, heal: 3, target: 'allCatsOnFloor' }] } },
    art: ['toy_rug', 'gold', 'thick woven rug with a worn cat-shaped dent in the middle'],
    tags: ['pile', 'heap', 'fluff', 'heal', 'loop:heap_fortress']
  }));

  cards.push(toy('hearth_fireplace', 'Fireplace', 'rare', 2, {
    text: 'End of your turn: add 3 Purr here. Dusk: if 10+ Purr here, heal the Sunbeam 1.',
    flavor: 'Lit once, for a photo. Now it is the household personality.',
    effects: {
      onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: 3, target: 'thisFloor' }],
      onDusk: [{ type: 'warmth', amount: 1, if: [{ check: 'purrOnFloor', op: '>=', value: 10 }] }]
    },
    up: { text: 'End of your turn: add 4 Purr here. Dusk: if 10+ Purr here, heal the Sunbeam 2.', effects: {
      onTurnEnd: [{ type: 'floorStatus', status: 'purr', amount: 4, target: 'thisFloor' }],
      onDusk: [{ type: 'warmth', amount: 2, if: [{ check: 'purrOnFloor', op: '>=', value: 10 }] }]
    } },
    art: ['toy_fireplace', 'gold', 'brick fireplace, three stockings, one sleeping cat on the mantel'],
    tags: ['purr', 'sunbeam', 'loop:purr_furnace']
  }));

  SB.data.cardsHearth = cards;
})();
