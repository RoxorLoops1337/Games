// Clawspire combat engine suite.
// Part 1 drives COMBAT against tiny inline fixtures (COMBAT.useDefs(stub)) so
// every rule is pinned exactly. Part 2 runs when clawspire/js/data.js exists:
// every real item fx, enemy move and relic hook resolves, plus a 300-turn fuzz.
import fs from 'fs';
import path from 'path';
import { boot, harness, DIR } from './clawspire_lib.mjs';

const h = harness('clawspire combat');
const { U, COMBAT } = boot({ only: ['util', 'combat'] });

// ---------- fixtures ----------
const ITEMS = {
  sword: { id: 'sword', name: 'Sword', rarity: 'c', tags: ['metal', 'weapon'], fx: [{ k: 'dmg', v: 6 }], plus: { fx: [{ k: 'dmg', v: 9 }] } },
  twin: { id: 'twin', name: 'Twin Daggers', rarity: 'c', tags: ['metal'], fx: [{ k: 'dmg', v: 3, n: 2 }] },
  shield: { id: 'shield', name: 'Shield', rarity: 'c', tags: ['metal'], target: 'self', fx: [{ k: 'block', v: 5 }] },
  potion: { id: 'potion', name: 'Potion', rarity: 'c', tags: ['potion'], target: 'self', fx: [{ k: 'heal', v: 5 }] },
  vial: { id: 'vial', name: 'Poison Vial', rarity: 'c', tags: ['potion'], fx: [{ k: 'status', s: 'poison', v: 3, to: 'enemy' }] },
  hex: { id: 'hex', name: 'Hex', rarity: 'u', tags: ['magic'], fx: [{ k: 'status', s: 'vuln', v: 2 }, { k: 'dmg', v: 6 }] },
  bomb: { id: 'bomb', name: 'Bomb', rarity: 'u', tags: [], target: 'all', exhaust: true, fx: [{ k: 'dmg', v: 8 }] },
  fang: { id: 'fang', name: 'Fang', rarity: 'u', tags: [], fx: [{ k: 'lifesteal', v: 5 }] },
  bash: { id: 'bash', name: 'Shield Bash', rarity: 'u', tags: [], fx: [{ k: 'block', v: 4 }, { k: 'dmgPer', v: 1, per: 'block' }] },
  magnetite: { id: 'magnetite', name: 'Magnetite', rarity: 'r', tags: [], fx: [{ k: 'dmgPer', v: 2, per: 'metal' }] },
  junkblast: { id: 'junkblast', name: 'Junk Blast', rarity: 'r', tags: [], fx: [{ k: 'dmgPer', v: 3, per: 'junk' }] },
  combo: { id: 'combo', name: 'Combo', rarity: 'r', tags: [], fx: [{ k: 'dmgPer', v: 2, per: 'grabsUsed' }] },
  dice: { id: 'dice', name: 'Dice', rarity: 'u', tags: [], fx: [{ k: 'random', v: 0, min: 2, max: 12 }] },
  extra: { id: 'extra', name: 'Extra Coin', rarity: 'u', tags: [], target: 'self', fx: [{ k: 'grab', v: 1 }, { k: 'gold', v: 5 }, { k: 'ink', v: 1 }] },
  heart: { id: 'heart', name: 'Heart', rarity: 'r', tags: [], target: 'self', fx: [{ k: 'maxhp', v: 3 }] },
  horn: { id: 'horn', name: 'Horn', rarity: 'c', tags: [], target: 'self', fx: [{ k: 'shake' }] },
  pickaxe: { id: 'pickaxe', name: 'Pickaxe', rarity: 'c', tags: [], target: 'self', fx: [{ k: 'junk', id: 'rock', n: 2, to: 'self' }] },
  broom: { id: 'broom', name: 'Broom', rarity: 'u', tags: [], target: 'self', fx: [{ k: 'purge', n: 2 }] },
  mirror: { id: 'mirror', name: 'Mirror', rarity: 'r', tags: [], target: 'self', fx: [{ k: 'copy' }] },
  salve: { id: 'salve', name: 'Salve', rarity: 'u', tags: [], target: 'self', fx: [{ k: 'cleanse' }] },
  catalyst: { id: 'catalyst', name: 'Catalyst', rarity: 'r', tags: [], target: 'all', fx: [{ k: 'poisonAll' }] },
  miasma: { id: 'miasma', name: 'Miasma', rarity: 'r', tags: [], target: 'all', fx: [{ k: 'poisonAll', v: 2 }] },
  cursed: { id: 'cursed', name: 'Cursed Blade', rarity: 'u', tags: [], fx: [{ k: 'dmg', v: 10 }, { k: 'dmg', v: -3 }] },
  rage: { id: 'rage', name: 'Rage', rarity: 'u', tags: [], target: 'self', fx: [{ k: 'status', s: 'str', v: 2 }] },
  frost: { id: 'frost', name: 'Frost', rarity: 'u', tags: [], fx: [{ k: 'status', s: 'chill', v: 3 }] },
  rock: { id: 'rock', name: 'Rock', rarity: 'junk', tags: ['junk', 'heavy'], target: 'none' },
  slag: { id: 'slag', name: 'Slag', rarity: 'junk', tags: ['junk'], target: 'none', fx: [{ k: 'dmg', v: -2 }] },
};
const E = (id, moves, extra) => Object.assign({ id, name: id, act: 1, tier: 'normal', hp: [40, 40], moves, ai: 'cycle' }, extra || {});
const ENEMIES = {
  dummy: E('dummy', [{ id: 'wait', k: 'block', v: 0 }], { hp: [100, 100] }),
  hitter: E('hitter', [{ id: 'hit', k: 'attack', v: 5 }], { hp: [60, 60] }),
  multi: E('multi', [{ id: 'hit', k: 'attack', v: 3, n: 3 }]),
  blocker: E('blocker', [{ id: 'b', k: 'block', v: 7 }]),
  cycler: E('cycler', [{ id: 'a', k: 'attack', v: 1 }, { id: 'b', k: 'block', v: 2 }, { id: 'c', k: 'buff', s: 'str', v: 1 }], { pattern: [0, 2, 2, 1] }),
  rando: E('rando', [{ id: 'a', k: 'attack', v: 1 }, { id: 'b', k: 'block', v: 2 }, { id: 'c', k: 'heal', v: 1 }], { ai: 'random' }),
  weigh: E('weigh', [{ id: 'a', k: 'attack', v: 1, w: 3 }, { id: 'b', k: 'block', v: 2, w: 0 }, { id: 'c', k: 'heal', v: 1, w: 1 }], { ai: 'weighted' }),
  charger: E('charger', [{ id: 'wind', k: 'charge', v: 20 }, { id: 'poke', k: 'attack', v: 2 }]),
  caller: E('caller', [{ id: 'call', k: 'summon', id: 'rat' }]),
  rat: E('rat', [{ id: 'bite', k: 'attack', v: 1 }], { hp: [8, 8] }),
  runner: E('runner', [{ id: 'run', k: 'escape' }], { hp: [30, 30] }),
  thief: E('thief', [{ id: 'grab', k: 'steal' }]),
  icer: E('icer', [{ id: 'ice', k: 'freezeItem' }]),
  junker: E('junker', [{ id: 'junk', k: 'junk', item: 'rock', n: 2 }]),
  shaker: E('shaker', [{ id: 's', k: 'shake' }, { id: 'g', k: 'grease', v: 1 }, { id: 'f', k: 'fog', v: 1 }, { id: 't', k: 'tilt', v: -1 }]),
  hexer: E('hexer', [{ id: 'd', k: 'debuff', s: 'weak', v: 1 }]),
  chiller: E('chiller', [{ id: 'd', k: 'debuff', s: 'chill', v: 3 }]),
  bulwark: E('bulwark', [{ id: 'up', k: 'buff', s: 'shield_up', v: 2 }, { id: 'b', k: 'block', v: 7 }], { pattern: [0, 1, 1, 1, 1, 1] }),
  golem: E('golem', [{ id: 'hit', k: 'attack', v: 4 }], { status: { armor: 2 } }),
  pinata: E('pinata', [{ id: 'w', k: 'block', v: 0 }], { hp: [5, 5], onDeath: { k: 'junk', id: 'rock', n: 1 } }),
  mother: E('mother', [{ id: 'w', k: 'block', v: 0 }], { hp: [5, 5], onDeath: { k: 'summon', id: 'rat' } }),
  snack: E('snack', [{ id: 'w', k: 'block', v: 0 }], { hp: [5, 5], onDeath: { k: 'heal', v: 4 } }),
  elite1: E('elite1', [{ id: 'hit', k: 'attack', v: 5 }], { tier: 'elite', hp: [50, 50] }),
  ranged: E('ranged', [{ id: 'hit', k: 'attack', v: 5 }], { hp: [10, 20] }),
};
const log = [];
const RELICS = {
  counter: {
    id: 'counter', name: 'Counter', hooks: {
      onFightStart(F) { log.push('fs'); }, onTurnStart(F) { log.push('ts' + F.turn); }, onTurnEnd(F) { log.push('te' + F.turn); },
      onPlay(F, inst, def) { log.push('play:' + def.id); }, onGrab(F, n) { log.push('grab:' + n); },
      onDmgDealt(F, e, amt) { log.push('dealt:' + amt); }, onKill(F, e) { log.push('kill:' + e.id); }, onHurt(F, amt) { log.push('hurt:' + amt); },
    },
  },
  echo: { id: 'echo', name: 'Echo', hooks: { onDmgDealt(F, e, amt) { COMBAT.damage(F, F.player, e, 1); } } },
  broken: { id: 'broken', name: 'Broken', hooks: { onTurnStart() { throw new Error('boom'); } } },
  gauntlet: { id: 'gauntlet', name: 'Gauntlet', mods: { grabs: 1, startBlock: 5, startStr: 1 } },
  magnetclaw: { id: 'magnetclaw', name: 'Magnet', mods: { magnet: 1, prongs: 1, width: 0.2 } },
  fat: { id: 'fat', name: 'Fat', mods: { maxhp: 10, gold: 25 } },
};
const STATUS = {};
for (const [s, kind] of Object.entries({ str: 'buff', weak: 'debuff', vuln: 'debuff', poison: 'debuff', burn: 'debuff', chill: 'debuff', freeze: 'debuff', regen: 'buff', thorns: 'buff', dodge: 'buff', bleed: 'debuff', stun: 'debuff', grease: 'debuff', fog: 'debuff', shield_up: 'buff', enrage: 'buff', armor: 'buff' })) {
  STATUS[s] = { id: s, name: s, icon: s[0], color: '#fff', kind, stack: ['weak', 'vuln', 'freeze', 'grease', 'fog'].includes(s) ? 'turns' : 'count' };
}
const STUB = { ITEMS, ENEMIES, RELICS, STATUS };
COMBAT.useDefs(STUB);

// Build a fight. bin: item ids (or {id, plus}).
function fight(enemies, o) {
  o = o || {};
  const run = {
    hp: o.hp == null ? 70 : o.hp, maxHp: o.maxHp || 70, act: o.act || 1, relics: o.relics || [],
    claw: Object.assign({ grabs: 3 }, o.claw || {}),
    bin: (o.bin || ['sword', 'sword', 'shield', 'shield', 'potion', 'sword']).map((b, i) => (typeof b === 'string' ? { uid: 'i' + i, id: b, plus: false } : Object.assign({ uid: 'i' + i }, b))),
  };
  return COMBAT.newFight(run, enemies, U.rng(o.seed || 7));
}
// Find an item in the bin, adding one when the fixture bin lacks it.
let extraN = 0;
const inst = (F, id) => {
  let i = F.bin.find(x => x.id === id);
  if (!i) { i = { uid: 'x' + (extraN++), id, plus: false, frozen: false, junk: false }; F.bin.push(i); }
  return i;
};
const playId = (F, id, t) => COMBAT.play(F, inst(F, id), t);
const E0 = (F) => F.enemies[0];
const find = (evs, t) => evs.filter(e => e.t === t);

// ---------- damage math ----------
h.test('base damage, block, str, weak, vuln, armor, pierce', () => {
  let F = fight(['dummy']);
  let ev = playId(F, 'sword');
  h.eq(E0(F).hp, 94, 'sword deals 6');
  h.ok(find(ev, 'play').length === 1 && find(ev, 'play')[0].target === 0, 'play event with target 0');
  h.ok(find(ev, 'dmg').some(d => d.who === 'e' && d.idx === 0 && d.amt === 6 && d.blocked === 0), 'dmg event');

  F = fight(['dummy']); F.player.status.str = 2; playId(F, 'sword'); h.eq(E0(F).hp, 92, 'str adds per hit');
  F = fight(['dummy']); F.player.status.str = 2; playId(F, 'twin'); h.eq(E0(F).hp, 90, 'str adds to each of n hits');
  F = fight(['dummy']); F.player.status.weak = 1; playId(F, 'sword'); h.eq(E0(F).hp, 96, 'weak: floor(6*0.75)=4');
  F = fight(['dummy']); E0(F).status.vuln = 1; playId(F, 'sword'); h.eq(E0(F).hp, 91, 'vuln: 6*1.5=9');
  F = fight(['dummy']); F.player.status.str = 2; F.player.status.weak = 1; E0(F).status.vuln = 1; playId(F, 'sword');
  h.eq(E0(F).hp, 91, 'str+weak+vuln: floor(8*0.75*1.5)=9');
  F = fight(['dummy']); E0(F).status.vuln = 1; E0(F).status.armor = 2; playId(F, 'sword'); h.eq(E0(F).hp, 93, 'armor after vuln: 9-2');
  F = fight(['dummy']); E0(F).block = 4; ev = playId(F, 'sword');
  h.eq(E0(F).hp, 98, 'block absorbs first'); h.eq(E0(F).block, 0, 'block spent');
  h.ok(find(ev, 'dmg').some(d => d.amt === 2 && d.blocked === 4), 'dmg event carries blocked');
  F = fight(['dummy']); E0(F).block = 10; E0(F).status.armor = 3;
  h.eq(COMBAT.damage(F, F.player, E0(F), 6, { pierce: true }), 6, 'pierce ignores block and armor');
  h.eq(E0(F).block, 10, 'pierce leaves block');
  F = fight(['dummy']); F.player.status.str = 0; E0(F).status.armor = 20; playId(F, 'sword'); h.eq(E0(F).hp, 100, 'armor floors at 0 dmg');
  F = fight(['dummy']); COMBAT.status(F, F.player, 'str', -5); h.eq(F.player.status.str, undefined, 'stacks never go negative');
});

h.test('thorns, dodge, lifesteal, self damage', () => {
  let F = fight(['dummy']); E0(F).status.thorns = 3; playId(F, 'twin');
  h.eq(F.player.hp, 64, 'thorns hit the attacker per hit (2 hits x 3)');
  h.eq(E0(F).hp, 94, 'target still takes the hits');
  F = fight(['dummy']); E0(F).status.dodge = 1; let ev = playId(F, 'twin');
  h.eq(E0(F).hp, 97, 'dodge eats one hit'); h.ok(!E0(F).status.dodge, 'dodge consumed');
  h.ok(find(ev, 'text').some(t => t.str === 'MISS'), 'MISS text');
  F = fight(['hitter']); F.player.status.dodge = 1; COMBAT.endTurn(F); h.eq(F.player.hp, 70, 'player dodge vs enemy attack');
  F = fight(['dummy'], { hp: 50 }); playId(F, 'fang'); h.eq(E0(F).hp, 95, 'lifesteal deals'); h.eq(F.player.hp, 55, 'lifesteal heals dealt');
  F = fight(['dummy'], { hp: 50 }); E0(F).block = 5; playId(F, 'fang'); h.eq(F.player.hp, 50, 'lifesteal heals only unblocked');
  F = fight(['dummy']); playId(F, 'cursed'); h.eq(E0(F).hp, 90, 'cursed hits'); h.eq(F.player.hp, 67, 'negative dmg v hurts self');
  F = fight(['dummy']); F.player.block = 10; playId(F, 'cursed'); h.eq(F.player.hp, 67, 'self damage ignores block');
});

h.test('enemy attacks: str, weak, player block, vuln, multi-hit', () => {
  let F = fight(['hitter']); COMBAT.endTurn(F); h.eq(F.player.hp, 65, 'enemy hits for 5');
  F = fight(['hitter']); E0(F).status.str = 3; E0(F).status.weak = 2; COMBAT.endTurn(F); h.eq(F.player.hp, 64, 'enemy str+weak floor(8*.75)=6');
  h.eq(E0(F).status.weak, 1, 'enemy weak decays after its action');
  F = fight(['hitter']); F.player.block = 3; F.player.status.vuln = 1; COMBAT.endTurn(F); h.eq(F.player.hp, 66, 'vuln 7 minus 3 block');
  F = fight(['multi']); F.player.block = 4; COMBAT.endTurn(F); h.eq(F.player.hp, 65, '3x3 with 4 block = 5');
  h.eq(F.player.block, 0, 'player block resets at next turn start');
});

// ---------- statuses ----------
h.test('poison, burn, regen, bleed tick and decay', () => {
  let F = fight(['dummy']); E0(F).status.poison = 3;
  COMBAT.endTurn(F); h.eq(E0(F).hp, 97, 'enemy poison ticks at its action'); h.eq(E0(F).status.poison, 2, 'poison -1');
  COMBAT.endTurn(F); h.eq(E0(F).hp, 95, 'poison 2'); COMBAT.endTurn(F); COMBAT.endTurn(F); h.eq(E0(F).hp, 94, 'poison runs out'); h.ok(!E0(F).status.poison, 'poison gone');
  F = fight(['dummy']); F.player.status.poison = 2; COMBAT.endTurn(F);
  h.eq(F.player.hp, 68, 'player poison ticks at player turn start'); h.eq(F.player.status.poison, 1, 'player poison -1');
  F = fight(['dummy']); F.player.status.burn = 3; F.player.block = 10; let ev = COMBAT.endTurn(F);
  h.eq(F.player.hp, 67, 'player burn at end of player turn ignores block'); h.eq(F.player.status.burn, 2, 'burn -1');
  const iBurn = ev.findIndex(e => e.t === 'dmg' && e.who === 'p'); const iTurn = ev.findIndex(e => e.t === 'turn');
  h.ok(iBurn >= 0 && iBurn < iTurn, 'burn resolves before the next turn');
  F = fight(['dummy']); E0(F).status.burn = 4; COMBAT.endTurn(F); h.eq(E0(F).hp, 96, 'enemy burn ticks at its action'); h.eq(E0(F).status.burn, 3, 'enemy burn -1');
  F = fight(['dummy'], { hp: 50 }); F.player.status.regen = 3; COMBAT.endTurn(F); h.eq(F.player.hp, 53, 'regen heals at turn start'); h.eq(F.player.status.regen, 2, 'regen -1');
  F = fight(['dummy']); E0(F).hp = 50; E0(F).status.regen = 2; COMBAT.endTurn(F); h.eq(E0(F).hp, 52, 'enemy regen');
  F = fight(['hitter']); E0(F).status.bleed = 2; COMBAT.endTurn(F); h.eq(E0(F).hp, 58, 'enemy bleeds when acting'); h.eq(E0(F).status.bleed, 1, 'bleed -1');
  F = fight(['dummy']); F.player.status.bleed = 2; playId(F, 'sword'); h.eq(F.player.hp, 68, 'player bleeds when playing'); h.eq(F.player.status.bleed, 1, 'player bleed -1');
});

h.test('weak/vuln/grease/fog decay at end of owner turn; persistent stacks stay', () => {
  const F = fight(['dummy']);
  Object.assign(F.player.status, { weak: 2, vuln: 1, grease: 1, fog: 1, str: 2, thorns: 1, armor: 1 });
  Object.assign(E0(F).status, { weak: 1, vuln: 2, str: 1, thorns: 2 });
  COMBAT.endTurn(F);
  h.eq(F.player.status.weak, 1, 'player weak -1'); h.ok(!F.player.status.vuln, 'player vuln gone');
  h.ok(!F.player.status.grease && !F.player.status.fog, 'grease/fog last one player turn');
  h.eq(F.player.status.str, 2, 'str persists'); h.eq(F.player.status.thorns, 1, 'thorns persist'); h.eq(F.player.status.armor, 1, 'armor persists');
  h.ok(!E0(F).status.weak, 'enemy weak -1'); h.eq(E0(F).status.vuln, 1, 'enemy vuln -1'); h.eq(E0(F).status.str, 1, 'enemy str persists');
});

h.test('freeze, stun, chill', () => {
  let F = fight(['hitter']); E0(F).status.freeze = 1; let ev = COMBAT.endTurn(F);
  h.eq(F.player.hp, 70, 'frozen enemy skips its action'); h.ok(!E0(F).status.freeze, 'freeze -1');
  h.ok(find(ev, 'text').some(t => t.str === 'FROZEN' && t.who === 'e'), 'FROZEN text');
  h.eq(E0(F).intent.id, 'hit', 'intent kept');
  COMBAT.endTurn(F); h.eq(F.player.hp, 65, 'acts again after thaw');
  F = fight(['hitter']); E0(F).status.stun = 1; COMBAT.endTurn(F); h.eq(F.player.hp, 70, 'stunned enemy skips'); h.ok(!E0(F).status.stun, 'stun -1');
  F = fight(['dummy']); F.player.status.freeze = 1; COMBAT.endTurn(F);
  h.eq(F.player.grabs, 2, 'frozen player loses a grab'); h.ok(!F.player.status.freeze, 'player freeze -1');
  F = fight(['dummy']); F.player.status.stun = 1; COMBAT.endTurn(F); h.eq(F.player.grabs, 2, 'stunned player loses a grab');
  F = fight(['hitter']); COMBAT.status(F, E0(F), 'chill', 2); h.eq(E0(F).status.chill, 2, 'chill counts');
  COMBAT.status(F, E0(F), 'chill', 1);
  h.ok(!E0(F).status.chill, 'chill resets at 3'); h.eq(E0(F).status.freeze, 1, 'chill 3 -> freeze 1');
  COMBAT.endTurn(F); h.eq(F.player.hp, 70, 'chilled-to-frozen enemy skips');
  F = fight(['hitter']); playId(F, 'frost'); h.eq(E0(F).status.freeze, 1, 'item chill 3 freezes');
  F = fight(['chiller']); COMBAT.endTurn(F); h.eq(F.player.grabs, 2, 'player chill 3 -> lose a grab next turn'); h.ok(!F.player.status.chill, 'player chill reset');
});

h.test('enrage, shield_up, armor, clamps', () => {
  let F = fight(['hitter']); E0(F).status.enrage = 2; COMBAT.endTurn(F);
  h.eq(E0(F).status.str, 2, 'enrage adds str each turn'); h.eq(F.player.hp, 63, 'enraged hit 7');
  COMBAT.endTurn(F); h.eq(E0(F).status.str, 4, 'enrage stacks');
  F = fight(['blocker']); COMBAT.endTurn(F); h.eq(E0(F).block, 7, 'enemy block holds through the player turn');
  COMBAT.endTurn(F); h.eq(E0(F).block, 7, 'enemy block resets at its action (then re-blocks)');
  E0(F).status.shield_up = 1; COMBAT.endTurn(F); h.eq(E0(F).block, 14, 'shield_up keeps block'); h.ok(!E0(F).status.shield_up, 'one stack per saved reset');
  COMBAT.endTurn(F); h.eq(E0(F).block, 7, 'block fades again once shield_up runs out');
  F = fight(['bulwark']); COMBAT.endTurn(F); h.eq(E0(F).status.shield_up, 2, 'buff shield_up 2');
  COMBAT.endTurn(F); COMBAT.endTurn(F); h.eq(E0(F).block, 14, 'block survives the next 2 resets (7+7)'); h.ok(!E0(F).status.shield_up, 'spent');
  COMBAT.endTurn(F); h.eq(E0(F).block, 7, 'then resets');
  F = fight(['dummy']); F.player.status.shield_up = 1; F.player.block = 5; COMBAT.endTurn(F); h.eq(F.player.block, 5, 'player shield_up keeps block');
  COMBAT.endTurn(F); h.eq(F.player.block, 0, 'player block fades after');
  F = fight(['golem']); h.eq(E0(F).status.armor, 2, 'def.status seeds armor'); playId(F, 'sword'); h.eq(E0(F).hp, 36, 'armor 2 cuts 6 to 4');
  F = fight(['dummy']); COMBAT.status(F, E0(F), 'poison', 150); h.eq(E0(F).status.poison, 99, 'stacks clamp to 99');
  COMBAT.heal(F, F.player, 999); h.eq(F.player.hp, 70, 'heal clamps to maxHp');
  COMBAT.damage(F, null, F.player, 999, { fixed: true }); h.eq(F.player.hp, 0, 'hp clamps to 0');
});

h.test('cleanse, grease/fog/shake/tilt enemy moves', () => {
  let F = fight(['dummy']); Object.assign(F.player.status, { weak: 2, poison: 3, str: 2, chill: 1 });
  let ev = playId(F, 'salve'); h.eq(Object.keys(F.player.status).join(), 'str', 'cleanse removes debuffs only');
  h.ok(find(ev, 'status').some(s => s.s === 'poison' && s.v === -3), 'cleanse emits removal status events');
  F = fight(['shaker']);
  ev = COMBAT.endTurn(F); h.eq(find(ev, 'binShake').length, 1, 'shake move');
  ev = COMBAT.endTurn(F); h.ok(find(ev, 'binGrease').some(g => g.turns === 1), 'grease move'); h.eq(F.player.status.grease, 1, 'player greased');
  ev = COMBAT.endTurn(F); h.ok(!F.player.status.grease, 'grease wears off after the player turn');
  h.ok(find(ev, 'binFog').some(g => g.turns === 1), 'fog move'); h.eq(F.player.status.fog, 1, 'player fogged');
  ev = COMBAT.endTurn(F); h.ok(find(ev, 'binTilt').some(g => g.dir === -1), 'tilt move'); h.eq(F.tilt, -1, 'F.tilt set for the player turn');
  COMBAT.endTurn(F); h.ok(F.tilt === 0 || find(F.events, 'binShake').length >= 2, 'tilt cleared at end of player turn');
  F = fight(['hexer']); COMBAT.endTurn(F); h.eq(F.player.status.weak, 1, 'debuff move hits the player');
});

// ---------- bin flow ----------
h.test('refill, exhaust, junk, purge, copy, steal, freezeItem', () => {
  let F = fight(['dummy'], { bin: ['sword', 'shield', 'potion', 'bomb', 'rock'] });
  playId(F, 'sword'); playId(F, 'shield'); playId(F, 'bomb');
  h.eq(F.bin.length, 2, 'bin 2 after three plays'); h.eq(F.used.length, 2, 'two in used'); h.eq(F.exhausted.length, 1, 'bomb exhausted');
  let ev = COMBAT.endTurn(F);
  const rf = find(ev, 'refill'); h.eq(rf.length, 1, 'refill emitted at turn start when bin < 3');
  h.eq(rf[0].items.length, 2, 'refill carries the moved items'); h.eq(F.used.length, 0, 'used emptied'); h.eq(F.bin.length, 4, 'bin refilled');
  h.ok(!F.bin.some(i => i.id === 'bomb'), 'exhausted item stays out');
  F = fight(['dummy'], { bin: ['sword', 'shield', 'potion'] }); ev = COMBAT.endTurn(F); h.eq(find(ev, 'refill').length, 0, 'no refill at 3');
  F = fight(['dummy'], { bin: ['sword', 'shield'] });
  playId(F, 'sword'); ev = playId(F, 'shield'); h.eq(find(ev, 'refill').length, 1, 'empty bin refills immediately'); h.eq(F.bin.length, 2, 'both back');
  // junk
  F = fight(['dummy']); ev = playId(F, 'pickaxe');
  h.ok(find(ev, 'binJunk').some(j => j.items.length === 2 && j.items.every(i => i.junk && i.id === 'rock')), 'junk fx adds 2 rocks');
  h.eq(F.bin.filter(i => i.id === 'rock').length, 2, 'rocks in bin');
  ev = playId(F, 'rock'); h.eq(find(ev, 'dmg').length, 0, 'rock does nothing'); h.ok(F.used.some(i => i.id === 'rock'), 'played junk goes to used');
  F = fight(['dummy'], { bin: ['slag', 'sword', 'sword', 'sword'] }); playId(F, 'slag'); h.eq(F.player.hp, 68, 'slag only does its own fx');
  F = fight(['dummy'], { bin: ['broom', 'rock', 'sword', 'sword'] }); COMBAT.addJunk(F, 'rock', 2);
  ev = playId(F, 'broom'); const pg = find(ev, 'binPurge'); h.ok(pg.length === 1 && pg[0].insts.length === 2, 'purge removes 2 junk');
  h.eq(F.bin.filter(COMBAT.isJunk).length, 1, 'one junk left (base rock counts as junk)');
  // copy
  F = fight(['dummy'], { bin: ['mirror', 'sword', 'rock'] }); ev = playId(F, 'mirror');
  const cp = find(ev, 'binCopy'); h.ok(cp.length === 1 && cp[0].inst.id === 'sword' && cp[0].inst.temp, 'copy duplicates a non-junk item');
  h.eq(F.bin.filter(i => i.id === 'sword').length, 2, 'copy lands in the bin');
  // steal
  F = fight(['thief'], { bin: ['sword', 'rock', 'rock', 'rock'] }); ev = COMBAT.endTurn(F);
  const sl = find(ev, 'binSteal'); h.ok(sl.length === 1 && sl[0].inst.id === 'sword', 'steal takes a non-junk item');
  h.eq(F.stolen.length, 1, 'stolen list'); h.ok(!F.bin.some(i => i.id === 'sword') && !F.used.some(i => i.id === 'sword'), 'gone for the fight');
  // freezeItem
  F = fight(['icer'], { bin: ['sword', 'rock', 'rock'] }); ev = COMBAT.endTurn(F);
  const fz = find(ev, 'binFreeze'); h.ok(fz.length === 1 && fz[0].inst.id === 'sword' && fz[0].inst.frozen, 'freezeItem encases');
  const hp0 = E0(F).hp; ev = playId(F, 'sword');
  h.eq(E0(F).hp, hp0, 'frozen item does nothing'); h.ok(!F.bin.some(i => i.id === 'sword') && F.used.find(i => i.id === 'sword').frozen === false, 'played frozen item thaws into used');
  h.ok(find(ev, 'text').some(t => t.str === 'THAWED'), 'THAWED text');
  // run bin is not mutated by the fight
  const run = { hp: 70, maxHp: 70, act: 1, relics: [], claw: { grabs: 3 }, bin: [{ uid: 'z1', id: 'sword', plus: false }] };
  F = COMBAT.newFight(run, ['icer'], U.rng(3)); COMBAT.endTurn(F); h.eq(run.bin[0].frozen, undefined, 'run.bin instances untouched');
  h.eq(F.bin[0].uid, 'z1', 'fight instances keep run uids');
  // junk cap
  F = fight(['dummy']); for (let i = 0; i < 10; i++) COMBAT.addJunk(F, 'rock', 20);
  h.ok(F.bin.length + F.used.length <= 40, 'junk capped at 40 items');
});

h.test('grab fx, gold/ink/maxhp gains, shake, useGrab, grabDone', () => {
  let F = fight(['dummy'], { relics: ['counter'] });
  h.ok(COMBAT.useGrab(F) && COMBAT.useGrab(F) && COMBAT.useGrab(F), 'three grabs');
  h.ok(!COMBAT.useGrab(F), 'fourth refused'); h.eq(F.player.grabsUsed, 3, 'grabsUsed');
  F = fight(['dummy'], { bin: ['extra', 'heart', 'horn', 'sword'], hp: 60 });
  let ev = playId(F, 'extra'); h.eq(F.player.grabs, 4, '+1 grab'); h.ok(find(ev, 'grab').some(g => g.v === 1), 'grab event');
  h.eq(F.gain.gold, 5, 'gold gain recorded'); h.eq(F.gain.ink, 1, 'ink gain recorded');
  playId(F, 'heart'); h.eq(F.player.maxHp, 73, 'maxhp +3'); h.eq(F.player.hp, 63, 'maxhp gain heals'); h.eq(F.gain.maxhp, 3, 'maxhp gain recorded');
  ev = playId(F, 'horn'); h.eq(find(ev, 'binShake').length, 1, 'shake fx');
  log.length = 0; F = fight(['dummy'], { relics: ['counter'] }); ev = COMBAT.grabDone(F, 2); h.ok(log.includes('grab:2'), 'grabDone fires onGrab with delivered count');
});

h.test('dmgPer, random, poisonAll, status targeting, plus fx', () => {
  let F = fight(['dummy'], { bin: ['bash', 'sword'] }); F.player.block = 3; playId(F, 'bash'); h.eq(E0(F).hp, 93, 'dmgPer block counts block gained first (3+4)');
  F = fight(['dummy'], { bin: ['magnetite', 'sword', 'sword', 'shield', 'potion'] }); playId(F, 'magnetite'); h.eq(E0(F).hp, 94, 'dmgPer metal: 3 metal in bin x2');
  F = fight(['dummy'], { bin: ['junkblast', 'rock', 'sword'] }); COMBAT.addJunk(F, 'rock', 1); playId(F, 'junkblast'); h.eq(E0(F).hp, 94, 'dmgPer junk: 2 x3');
  F = fight(['dummy'], { bin: ['combo', 'sword'] }); COMBAT.useGrab(F); COMBAT.useGrab(F); playId(F, 'combo'); h.eq(E0(F).hp, 96, 'dmgPer grabsUsed 2 x2');
  let seen = new Set();
  for (let s = 1; s < 60; s++) { F = fight(['dummy'], { seed: s, bin: ['dice', 'sword'] }); playId(F, 'dice'); const d = 100 - E0(F).hp; seen.add(d); h.ok(d >= 2 && d <= 12, 'random within min..max'); }
  h.ok(seen.size > 4, 'random varies by seed');
  F = fight(['dummy', 'hitter'], { bin: ['vial', 'sword'] }); playId(F, 'vial', 1); h.eq(F.enemies[1].status.poison, 3, 'status to enemy uses the target index'); h.ok(!E0(F).status.poison, 'other enemy untouched');
  F = fight(['dummy', 'hitter'], { bin: ['miasma', 'catalyst', 'sword'] }); playId(F, 'miasma');
  h.ok(F.enemies.every(e => e.status.poison === 2), 'poisonAll v poisons all');
  playId(F, 'catalyst'); h.eq(E0(F).hp, 98, 'poisonAll without v detonates poison'); h.eq(E0(F).status.poison, 2, 'without decay');
  F = fight(['dummy'], { bin: ['rage', 'sword'] }); playId(F, 'rage'); h.eq(F.player.status.str, 2, 'buff status defaults to self');
  F = fight(['dummy'], { bin: [{ id: 'sword', plus: true }, 'shield'] }); playId(F, 'sword'); h.eq(E0(F).hp, 91, 'plus fx used when upgraded');
  F = fight(['dummy', 'hitter'], { bin: ['bomb', 'sword'] }); playId(F, 'bomb'); h.ok(E0(F).hp === 92 && F.enemies[1].hp === 52, 'target all hits every enemy');
});

// ---------- flow ----------
h.test('win and lose', () => {
  let F = fight(['rat'], { bin: ['sword', 'sword', 'sword'] });
  playId(F, 'sword'); h.eq(F.phase, 'player', 'still going'); const ev = playId(F, 'sword');
  h.eq(COMBAT.isOver(F), 'win', 'isOver win'); h.eq(F.phase, 'over', 'phase over'); h.eq(F.result, 'win', 'result win');
  h.ok(find(ev, 'die').some(d => d.idx === 0) && find(ev, 'over').some(o => o.result === 'win'), 'die + over events');
  h.eq(F.kills, 1, 'kill counted'); h.eq(COMBAT.play(F, F.bin[0]).length, 0, 'no plays after over');
  h.eq(COMBAT.endTurn(F).length, 0, 'no endTurn after over');
  F = fight(['hitter'], { hp: 4 }); const ev2 = COMBAT.endTurn(F);
  h.eq(F.result, 'lose', 'lose at hp 0'); h.eq(F.player.hp, 0, 'hp clamped'); h.ok(find(ev2, 'over').some(o => o.result === 'lose'), 'over lose event');
  h.eq(find(ev2, 'turn').length, 0, 'no next turn after death');
  F = fight(['dummy'], { hp: 2 }); F.player.status.poison = 5; COMBAT.endTurn(F); h.eq(F.result, 'lose', 'poison can kill at turn start');
});

h.test('intents: cycle with pattern, random + weighted reproducible, intentText', () => {
  let F = fight(['cycler']); const seq = [E0(F).intent.id];
  for (let i = 0; i < 7; i++) { COMBAT.endTurn(F); seq.push(E0(F).intent.id); }
  h.eq(seq.join(''), 'accbaccb', 'cycle walks pattern [0,2,2,1]');
  const walk = (seed, id) => { const G = fight([id], { seed }); const s = [G.enemies[0].intent.id]; for (let i = 0; i < 30; i++) { COMBAT.endTurn(G); s.push(G.enemies[0].intent.id); } return s.join(''); };
  h.eq(walk(11, 'rando'), walk(11, 'rando'), 'random reproducible by seed');
  h.ok(walk(11, 'rando') !== walk(12, 'rando'), 'random differs across seeds');
  const w = walk(5, 'weigh'); h.eq(walk(5, 'weigh'), w, 'weighted reproducible');
  h.ok(!w.includes('b'), 'weight 0 never picked'); h.ok((w.match(/a/g) || []).length > (w.match(/c/g) || []).length, 'weight 3 beats weight 1');
  F = fight(['hitter', 'multi', 'blocker']);
  h.eq(COMBAT.intentText(F.enemies[0]), 'Attacks for 5', 'attack text'); h.eq(COMBAT.intentText(F.enemies[1]), 'Attacks for 3x3', 'multi text');
  h.eq(COMBAT.intentText(F.enemies[2]), 'Blocks 7', 'block text');
  F.enemies[0].status.str = 2; h.eq(COMBAT.intentText(F.enemies[0]), 'Attacks for 7', 'text includes str');
  F = fight(['shaker']); h.eq(COMBAT.intentText(E0(F)), 'Shakes the bin', 'shake text');
  const ev = COMBAT.endTurn(F); h.ok(find(ev, 'intent').some(i => i.idx === 0), 'intent event after acting');
});

h.test('charge telegraphs a big hit', () => {
  const F = fight(['charger']); h.eq(E0(F).intent.k, 'charge', 'starts charging');
  let ev = COMBAT.endTurn(F);
  h.eq(E0(F).charged, 20, 'charged set'); h.eq(F.player.hp, 70, 'charge turn deals nothing');
  h.ok(E0(F).intent.k === 'attack' && E0(F).intent.charged && E0(F).intent.v === 20, 'next intent is the charged hit');
  h.eq(COMBAT.intentText(E0(F)), 'Unleashes 20', 'unleash text');
  COMBAT.endTurn(F); h.eq(F.player.hp, 50, 'charged hit lands for v'); h.eq(E0(F).charged, 0, 'charge spent');
  h.eq(E0(F).intent.id, 'poke', 'cycle resumes');
});

h.test('summon cap, onDeath effects, escape', () => {
  let F = fight(['caller']);
  for (let i = 0; i < 6; i++) { COMBAT.endTurn(F); h.ok(F.enemies.filter(e => e.alive).length <= 3, 'never more than 3 alive'); }
  h.eq(F.enemies.filter(e => e.alive).length, 3, 'filled to 3'); h.ok(F.enemies.length <= 3, 'slots stay within 3');
  h.ok(find(F.events, 'summon').length === 2, 'two summon events');
  // kill a rat, caller refills the slot
  const ri = F.enemies.findIndex(e => e.id === 'rat');
  COMBAT.damage(F, F.player, F.enemies[ri], 99); h.ok(!F.enemies[ri].alive, 'rat dies');
  COMBAT.endTurn(F); h.ok(F.enemies[ri].alive && F.enemies[ri].id === 'rat', 'summon reuses the dead slot');
  F = fight(['pinata', 'dummy']); COMBAT.damage(F, F.player, E0(F), 10); h.ok(find(F.events, 'binJunk').length === 1, 'onDeath junk');
  F = fight(['mother', 'dummy']); COMBAT.damage(F, F.player, E0(F), 10); h.ok(find(F.events, 'summon').length === 1 && F.enemies.some(e => e.alive && e.id === 'rat'), 'onDeath summon');
  F = fight(['snack'], { hp: 50 }); COMBAT.damage(F, F.player, E0(F), 10); h.eq(F.player.hp, 54, 'onDeath heal feeds the player when alone');
  F = fight(['snack', 'dummy']); F.enemies[1].hp = 90; COMBAT.damage(F, F.player, E0(F), 10); h.eq(F.enemies[1].hp, 94, 'onDeath heal heals allies');
  F = fight(['runner', 'dummy']); const ev = COMBAT.endTurn(F);
  h.ok(!E0(F).alive && E0(F).escaped, 'escaped'); h.eq(F.kills, 0, 'escape is not a kill'); h.ok(find(ev, 'die').some(d => d.escaped), 'die event flagged escaped');
  h.ok(!find(ev, 'text').some(t => t.str === 'ESCAPED'), 'no duplicate ESCAPED text (the game shows it from the die event)');
  h.eq(F.target, 1, 'retargets to the survivor'); h.eq(F.phase, 'player', 'fight continues');
  F = fight(['runner']); COMBAT.endTurn(F); h.eq(F.result, 'win', 'last enemy escaping ends the fight'); h.eq(F.escaped.length, 1, 'escaped list');
});

h.test('enemy hp roll and act scaling', () => {
  const hs = new Set(); for (let s = 1; s < 40; s++) { const F = fight(['ranged'], { seed: s }); hs.add(E0(F).hp); h.ok(E0(F).hp >= 10 && E0(F).hp <= 20 && E0(F).maxHp === E0(F).hp, 'hp rolled in range'); }
  h.ok(hs.size > 3, 'hp varies by seed');
  h.eq(fight(['hitter'], { act: 1 }).enemies[0].hp, 60, 'same act x1.0');
  h.eq(fight(['hitter'], { act: 2 }).enemies[0].hp, 102, 'act1 def in act2 x1.7');
  h.eq(fight(['hitter'], { act: 3 }).enemies[0].hp, 156, 'act1 def in act3 x2.6');
  h.eq(fight(['elite1'], { act: 3 }).enemies[0].hp, 50, 'elites never scale');
  h.eq(fight([], {}).enemies.length, 1, 'empty encounter still builds a fight');
});

h.test('previewDamage matches an actual play', () => {
  const cases = [
    ['sword', {}], ['twin', { str: 2 }], ['hex', {}], ['sword', { weak: 1, vuln: 1, armor: 1 }], ['bash', { block: 3 }],
    ['fang', { str: 1 }], ['bomb', { vuln: 1 }], [{ id: 'sword', plus: true }, { str: 1 }], ['magnetite', {}],
  ];
  for (const [b, o] of cases) {
    const id = typeof b === 'string' ? b : b.id; const plus = typeof b === 'object';
    const F = fight(['dummy'], { bin: [b, 'sword', 'shield', 'sword'] });
    if (o.str) F.player.status.str = o.str; if (o.weak) F.player.status.weak = o.weak;
    if (o.vuln) E0(F).status.vuln = o.vuln; if (o.armor) E0(F).status.armor = o.armor; if (o.block) F.player.block = o.block;
    const pv = COMBAT.previewDamage(F, ITEMS[id], plus); const pv2 = COMBAT.previewDamage(F, id, plus);
    COMBAT.play(F, F.bin[0]);
    h.eq(pv, 100 - E0(F).hp, `preview ${id}${plus ? '+' : ''} matches play`); h.eq(pv, pv2, 'preview accepts an id');
  }
  const F = fight(['dummy']); h.eq(COMBAT.previewDamage(F, ITEMS.shield, false), 0, 'shield previews 0');
});

h.test('relic mods and hooks', () => {
  log.length = 0;
  let F = fight(['rat'], { relics: ['counter', 'gauntlet'], bin: ['sword', 'sword', 'shield', 'shield'] });
  h.eq(F.player.grabs, 4, 'grabs mod'); h.eq(F.player.grabsMax, 4, 'grabsMax includes mod'); h.eq(F.claw.grabs, 4, 'F.claw carries effective grabs');
  h.eq(F.player.block, 5, 'startBlock'); h.eq(F.player.status.str, 1, 'startStr');
  h.eq(log.slice(0, 2).join(), 'ts1,fs', 'onTurnStart(1) then onFightStart');
  F.player.block = 0; COMBAT.endTurn(F); h.eq(F.player.grabs, 4, 'grabs mod every turn'); h.eq(F.player.block, 0, 'startBlock is fight start only');
  h.ok(log.includes('te1') && log.includes('ts2') && log.includes('hurt:1'), 'turn end/start + hurt hooks');
  playId(F, 'sword'); playId(F, 'sword');
  h.ok(log.includes('play:sword') && log.includes('dealt:7') && log.includes('kill:rat'), 'play/dealt/kill hooks');
  F = fight(['dummy'], { relics: ['magnetclaw'], claw: { width: 1.18, prongs: 2 } });
  h.eq(F.claw.magnet, 1, 'magnet mod'); h.eq(F.claw.prongs, 3, 'prongs mod'); h.near(F.claw.width, 1.38, 1e-9, 'width mod adds');
  F = fight(['dummy'], { relics: ['echo'] }); playId(F, 'sword'); h.eq(E0(F).hp, 93, 'hook damage does not re-enter its own hook');
  F = fight(['dummy'], { relics: ['broken'] }); COMBAT.endTurn(F);
  h.ok(F.hookErrors.length >= 1 && /broken\.onTurnStart/.test(F.hookErrors[0]), 'throwing hook is caught and logged'); h.eq(F.phase, 'player', 'fight survives');
  const run = { hp: 50, maxHp: 70, gold: 10, relics: [] }; COMBAT.gainRelic(run, 'fat');
  h.ok(run.maxHp === 80 && run.hp === 60 && run.gold === 35 && run.relics[0] === 'fat', 'gainRelic applies run-level mods once');
  h.eq(fight(['dummy'], { relics: ['fat'], maxHp: 80 }).player.maxHp, 80, 'newFight does not re-add maxhp');
});

h.test('events mirror onto F.events; determinism', () => {
  const go = (seed) => {
    U.resetUid(500);
    const F = fight(['rando', 'cycler', 'thief'], { seed, bin: ['sword', 'dice', 'shield', 'mirror', 'vial', 'twin', 'pickaxe'] });
    for (let t = 0; t < 8 && F.phase !== 'over'; t++) {
      while (F.bin.length && F.player.grabs > 0 && F.phase === 'player') { COMBAT.useGrab(F); COMBAT.play(F, F.bin[Math.floor(F.rng() * F.bin.length)]); }
      COMBAT.endTurn(F);
    }
    return JSON.stringify(F.events, (k, v) => (k === 'def' ? v && v.id : v));
  };
  h.eq(go(9), go(9), 'same seed, same event log'); h.ok(go(9) !== go(10), 'different seed differs');
  const F = fight(['hitter']); const n0 = F.events.length; const ev = COMBAT.endTurn(F);
  h.eq(F.events.length - n0, ev.length, 'endTurn return == events appended'); h.ok(find(ev, 'turn').some(t => t.n === 2), 'turn event n=2');
  h.eq(F.turn, 2, 'endTurn advances and starts the next turn'); h.eq(F.phase, 'player', 'back to player phase');
});

// ---------- part 2: real data ----------
const hasData = fs.existsSync(path.join(DIR, 'js', 'data.js'));
if (!hasData) console.log('clawspire combat: js/data.js not found, skipping data-driven checks');
else {
  const R = boot({ only: ['util', 'data', 'combat'] });
  const { DATA } = R;
  const C = R.COMBAT;
  const bad = (x) => !Number.isFinite(x);
  function invariants(F, where) {
    const us = [F.player, ...F.enemies];
    for (const u of us) {
      if (bad(u.hp) || bad(u.maxHp) || bad(u.block) || u.hp < 0 || u.hp > u.maxHp || u.block < 0) return `${where}: bad hp/block ${u.id || 'player'} ${u.hp}/${u.maxHp} b${u.block}`;
      for (const k in u.status) if (bad(u.status[k]) || u.status[k] < 0 || u.status[k] > 99) return `${where}: bad stack ${k}=${u.status[k]}`;
    }
    if (bad(F.player.grabs) || F.player.grabs < 0) return `${where}: bad grabs`;
    if (F.hookErrors.length) return `${where}: hook error ${F.hookErrors[0]}`;
    return null;
  }
  const allItems = Object.keys(DATA.ITEMS);
  const allRelics = Object.keys(DATA.RELICS || {});
  const acts = [1, 2, 3].filter(a => DATA.ENCOUNTERS && DATA.ENCOUNTERS[a]);
  const encOf = (a) => { const E = DATA.ENCOUNTERS[a]; return [...(E.normal || []), ...(E.elite || []), ...(E.boss || [])]; };
  const mkRun = (bin, relics, act) => ({ hp: 70, maxHp: 70, act, relics, claw: { grabs: 3 }, bin: bin.map((id, i) => ({ uid: 'd' + i, id: typeof id === 'string' ? id : id.id, plus: !!id.plus })) });
  const firstEnc = acts.length ? encOf(acts[0])[0] : [Object.keys(DATA.ENEMIES)[0]];

  h.test('data: every item fx resolves (base and plus)', () => {
    const kinds = new Set();
    for (const id of allItems) {
      for (const plus of [false, true]) {
        try {
          const F = C.newFight(mkRun([{ id, plus }, 'rock', 'rock', ...allItems.slice(0, 4)], [], 1), firstEnc, U.rng(U.hashStr(id)));
          F.enemies.forEach(e => { e.status.poison = 2; });
          const pv = C.previewDamage(F, DATA.ITEMS[id], plus);
          C.play(F, F.bin[0]);
          h.ok(!invariants(F, id) && Number.isFinite(pv), `item ${id}${plus ? '+' : ''} resolves cleanly ${invariants(F, id) || ''}`);
          const def = DATA.ITEMS[id]; (plus && def.plus && def.plus.fx ? def.plus.fx : def.fx || []).forEach(f => kinds.add(f.k));
        } catch (e) { h.ok(false, `item ${id}${plus ? '+' : ''} threw ${e.stack}`); }
      }
    }
    const known = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'shake', 'junk', 'purge', 'copy', 'dmgPer', 'cleanse', 'lifesteal', 'random', 'poisonAll'];
    for (const k of kinds) h.ok(known.includes(k), `item fx kind ${k} is one the engine implements`);
  });

  h.test('data: every enemy move kind resolves', () => {
    const kinds = new Set();
    for (const [id, def] of Object.entries(DATA.ENEMIES)) {
      (def.moves || []).forEach((m, mi) => {
        kinds.add(m.k);
        try {
          const F = C.newFight(mkRun(allItems.slice(0, 8), [], def.act || 1), [id], U.rng(mi + 1));
          const e = F.enemies[0]; e.intent = m; e.moveIdx = mi;
          const t0 = C.intentText(e);
          C.endTurn(F);
          h.ok(typeof t0 === 'string' && t0.length > 0 && !/undefined|NaN/.test(t0), `intentText ${id}.${m.id}: "${t0}"`);
          h.ok(!invariants(F, id), `enemy ${id} move ${m.id || mi} (${m.k}) resolves ${invariants(F, id) || ''}`);
        } catch (err) { h.ok(false, `enemy ${id} move ${m.k} threw ${err.stack}`); }
      });
      if (def.onDeath) {
        const F = C.newFight(mkRun(allItems.slice(0, 6), [], def.act || 1), [id], U.rng(3));
        C.damage(F, F.player, F.enemies[0], 9999, { pierce: true });
        h.ok(!invariants(F, id), `enemy ${id} onDeath resolves`);
      }
    }
    const known = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape'];
    for (const k of kinds) h.ok(known.includes(k), `enemy move kind ${k} is one the engine implements`);
  });

  // Plays whatever the claw "delivers" (random bin items), then ends the turn.
  function randomTurn(F, rng) {
    while (F.phase === 'player' && F.player.grabs > 0 && C.useGrab(F)) {
      const n = rng.int(0, 2);
      for (let k = 0; k < n && F.bin.length && F.phase === 'player'; k++) {
        C.play(F, F.bin[rng.int(0, F.bin.length - 1)], rng.int(0, F.enemies.length - 1));
      }
      C.grabDone(F, n);
    }
    if (F.phase === 'player') C.endTurn(F);
  }

  h.test('data: every relic fires its hooks across a fight', () => {
    for (const id of allRelics) {
      try {
        const F = C.newFight(mkRun(allItems.slice(0, 12), [id], 1), firstEnc, U.rng(U.hashStr(id)));
        const rng = U.rng(5);
        for (let t = 0; t < 6 && F.phase !== 'over'; t++) { randomTurn(F, rng); }
        h.ok(!invariants(F, id), `relic ${id} ${invariants(F, id) || ''}`);
      } catch (e) { h.ok(false, `relic ${id} threw ${e.stack}`); }
    }
    const F = C.newFight(mkRun(allItems.slice(0, 12), allRelics, 2), firstEnc, U.rng(77));
    const rng = U.rng(6); for (let t = 0; t < 8 && F.phase !== 'over'; t++) randomTurn(F, rng);
    h.ok(!invariants(F, 'all relics'), `all relics together ${invariants(F, 'all') || ''}`);
  });

  h.test('data: 300-turn fuzz never NaNs or goes negative', () => {
    const rng = U.rng(2024);
    let turns = 0, fights = 0, fail = null, over = 0;
    while (turns < 300 && !fail) {
      const act = acts.length ? rng.pick(acts) : 1;
      const enc = acts.length ? rng.pick(encOf(act)) : [rng.pick(Object.keys(DATA.ENEMIES))];
      const bin = []; for (let i = 0; i < 12; i++) bin.push({ id: rng.pick(allItems), plus: rng.chance(0.3) });
      const relics = rng.shuffle(allRelics).slice(0, rng.int(0, 5));
      const F = C.newFight(Object.assign(mkRun(bin, relics, act), { hp: 120, maxHp: 120 }), enc, U.rng(rng.int(1, 1e9)));
      fights++;
      for (let t = 0; t < 40 && F.phase !== 'over' && turns < 300; t++) {
        if (rng.chance(0.1)) C.addJunk(F, 'rock', 2);
        randomTurn(F, rng); turns++;
        fail = invariants(F, `fight ${fights} turn ${F.turn}`);
        if (fail) break;
        for (const e of F.enemies) if (e.alive && !C.intentText(e)) fail = 'empty intent';
      }
      if (F.phase === 'over') over++;
    }
    h.ok(!fail, 'fuzz invariants hold: ' + (fail || 'ok'));
    h.ok(turns >= 300, `ran ${turns} turns over ${fights} fights (${over} finished)`);
  });
}

h.done();
