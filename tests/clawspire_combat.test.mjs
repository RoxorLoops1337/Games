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
  glassy: { id: 'glassy', name: 'Glassy', rarity: 'c', tags: ['glass'], fx: [{ k: 'dmg', v: 3 }] },
  vase: { id: 'vase', name: 'Vase', rarity: 'c', tags: ['glass'], exhaust: true, target: 'self', fx: [{ k: 'block', v: 2 }] },
  pebble: { id: 'pebble', name: 'Pebble', rarity: 'c', tags: ['small'], fx: [{ k: 'dmg', v: 2 }, { k: 'status', s: 'poison', v: 1, to: 'enemy' }] },
  orb: { id: 'orb', name: 'Orb', rarity: 'c', tags: ['magic'], fx: [{ k: 'dmg', v: 4 }] },
  plate: { id: 'plate', name: 'Plate', rarity: 'c', tags: ['metal'], target: 'self', fx: [{ k: 'block', v: 3 }, { k: 'blockPer', v: 2, per: 'junk' }] },
  bribe: { id: 'bribe', name: 'Bribe', rarity: 'u', tags: [], fx: [{ k: 'pay', v: 10 }, { k: 'dmg', v: 9 }] },
  encore: { id: 'encore', name: 'Encore', rarity: 'r', tags: [], target: 'self', fx: [{ k: 'block', v: 1 }, { k: 'again' }] },
  rot: { id: 'rot', name: 'Rot', rarity: 'u', tags: [], fx: [{ k: 'status', s: 'poison', v: 2, to: 'enemy' }, { k: 'dmgPer', v: 1, per: 'poison' }] },
  scorch: { id: 'scorch', name: 'Scorch', rarity: 'u', tags: [], fx: [{ k: 'dmgPer', v: 2, per: 'burn' }] },
  jar: { id: 'jar', name: 'Jar', rarity: 'u', tags: [], target: 'all', fx: [{ k: 'dmgPer', v: 1, per: 'small' }] },
  token: { id: 'token', name: 'Token', rarity: 'c', tags: [], fx: [{ k: 'dmg', v: 1 }, { k: 'dmgPer', v: 2, per: 'streak' }] },
  idol: { id: 'idol', name: 'Idol', rarity: 'u', tags: [], fx: [{ k: 'dmgPer', v: 1, per: 'gold' }] },
  tome: { id: 'tome', name: 'Tome', rarity: 'u', tags: ['magic'], target: 'none', fx: [{ k: 'copy', tag: 'magic' }] },
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
  // one relic per new hook: log the call, then do something visible
  hooky: {
    id: 'hooky', name: 'Hooky', icon: 'H', proc: 'HOOKED', hooks: {
      onStatus(F, u, s, v) { log.push(`status:${s}:${v}:${u === F.player ? 'p' : 'e'}`); if (s === 'poison') COMBAT.damage(F, null, F.enemies[0], 1); },
      onBlock(F, amt) { log.push('block:' + amt); COMBAT.damage(F, null, F.enemies[0], 1); },
      onHeal(F, amt) { log.push('heal:' + amt); COMBAT.damage(F, null, F.enemies[0], 1); },
      onJunk(F, n, insts) { log.push('junk:' + n + ':' + insts.length); COMBAT.damage(F, null, F.enemies[0], 1); },
      onCombo(F, combo, defs) { log.push('combo:' + combo.id + ':' + defs.length); COMBAT.damage(F, null, F.enemies[0], 1); },
      onJackpot(F, n) { log.push('jackpot:' + n); COMBAT.damage(F, null, F.enemies[0], 1); },
      onShatter(F, inst, def) { log.push('shatter:' + def.id); COMBAT.damage(F, null, F.enemies[0], 1); },
      onGold(F, amt) { log.push('gold:' + amt); COMBAT.damage(F, null, F.enemies[0], 1); },
    },
  },
  selfproc: { id: 'selfproc', name: 'Selfproc', hooks: { onBlock(F) { COMBAT.emit(F, { t: 'proc', src: 'relic', id: 'selfproc', text: 'MINE' }); COMBAT.damage(F, null, F.enemies[0], 1); } } },
  quiet: { id: 'quiet', name: 'Quiet', hooks: { onBlock() { log.push('quiet'); } } },
  r_fester: { id: 'r_fester', name: 'Fester', rules: { poisonKeep: 1 } },
  r_walls: { id: 'r_walls', name: 'Walls', rules: { blockKeep: 1 } },
  r_shatter: { id: 'r_shatter', name: 'Shatter', rules: { shatter: 0.5 } },
  r_glass: { id: 'r_glass', name: 'Glass', rules: { glassBreak: 1 } },
  r_amp: { id: 'r_amp', name: 'Amp', rules: { amp: { small: 2 } } },
  r_amp2: { id: 'r_amp2', name: 'Amp2', rules: { amp: { small: 1 } } },
  r_encore: { id: 'r_encore', name: 'Encore', rules: { comboTwice: 1 } },
  r_echo: { id: 'r_echo', name: 'Echo', rules: { echo: 3 } },
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
  const rf = find(ev, 'refill'); h.eq(rf.length, 1, 'refill emitted at turn start (floor + trickle)');
  h.eq(rf[0].items.length, 2, 'refill carries the moved items'); h.eq(F.used.length, 0, 'used emptied'); h.eq(F.bin.length, 4, 'bin refilled');
  h.ok(!F.bin.some(i => i.id === 'bomb'), 'exhausted item stays out');
  F = fight(['dummy'], { bin: ['sword', 'shield', 'potion'] }); ev = COMBAT.endTurn(F); h.eq(find(ev, 'refill').length, 0, 'no refill with an empty used pile');
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
  h.eq(COMBAT.MAX_ITEMS, 48, 'item cap is 48 (19-item starting bins of cheap small circles)');
  h.eq(F.bin.length + F.used.length, 48, 'junk fills up to the 48 item cap and no further');
  // cabinet cap: a big bin keeps 34 bodies in the cabinet, the rest waits in used
  h.eq(COMBAT.MAX_CABINET, 34, 'cabinet cap is 34');
  F = fight(['dummy'], { bin: Array.from({ length: 40 }, (_, i) => (i % 2 ? 'sword' : 'shield')) });
  h.eq(F.bin.length, 34, 'a 40-item bin puts 34 in the cabinet'); h.eq(F.used.length, 6, 'and 6 in the used pile');
  F = fight(['dummy'], { bin: Array.from({ length: 34 }, () => 'sword') });
  h.eq(F.bin.length, 34, 'a 34-item bin fits whole'); h.eq(F.used.length, 0, 'nothing waits');
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
  h.eq(fight(['hitter'], { act: 2 }).enemies[0].hp, 120, 'act1 def in act2 x2.0');
  h.eq(fight(['hitter'], { act: 3 }).enemies[0].hp, 192, 'act1 def in act3 x3.2');
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


// ---------- builds: new hooks, procs, rules, grab buffer, combos ----------
const procs = (evs, id) => evs.filter(e => e.t === 'proc' && (!id || e.id === id));
// A stub recipe book: two metal items fire 'clang' (3 to the target), three
// items fire 'bonus' (+1 grab, once a turn).
const CLANG = { id: 'clang', name: 'Clang', text: 'Two metal.', color: '#aab3bd', tier: 1, family: 'm', target: 'enemy', fx: [{ k: 'dmg', v: 3 }] };
const BONUS = { id: 'bonus', name: 'Bonus', text: 'Three items.', color: '#ffc94d', tier: 2, family: 'b', target: 'none', once: 'turn', fx: [{ k: 'grab', v: 1 }] };
function withCombos(fn) {
  STUB.combosFor = (defs) => {
    const out = [];
    if (defs.length >= 3) out.push(BONUS);
    if (defs.filter(d => (d.tags || []).includes('metal')).length >= 2) out.push(CLANG);
    return out;
  };
  try { fn(); } finally { delete STUB.combosFor; }
}
// One grab: useGrab, play the ids in order, grabDone. Returns grabDone's events.
function grabOf(F, ids, n) {
  COMBAT.useGrab(F);
  for (const id of ids) playId(F, id);
  return COMBAT.grabDone(F, n == null ? ids.length : n);
}

h.test('new relic hooks fire with their arguments and a proc event leads their effects', () => {
  log.length = 0;
  let F = fight(['dummy'], { relics: ['hooky'], hp: 60, bin: ['vial', 'shield', 'potion', 'pickaxe', 'vase', 'extra', 'sword', 'sword', 'sword'] });
  let ev = playId(F, 'vial');
  h.ok(log.includes('status:poison:3:e'), 'onStatus(F, unit, s, v) on an applied status');
  const pi = ev.findIndex(e => e.t === 'proc' && e.id === 'hooky'), di = ev.findIndex(e => e.t === 'dmg' && e.amt === 1);
  h.ok(pi >= 0 && di > pi, 'the proc comes before the hook effect in the returned events');
  const pe = ev[pi];
  h.ok(pe.src === 'relic' && pe.name === 'Hooky' && pe.icon === 'H' && pe.text === 'HOOKED' && pe.who === 'player' && pe.idx === -1 && typeof pe.color === 'string', 'proc carries the contract fields (relic.proc as text)');
  h.ok(F.events.indexOf(pe) === F.events.findIndex(e => e.t === 'proc'), 'and it sits in F.events too');
  ev = playId(F, 'shield'); h.ok(log.includes('block:5') && procs(ev, 'hooky').length === 1, 'onBlock(F, amt)');
  ev = playId(F, 'potion'); h.ok(log.includes('heal:5') && procs(ev, 'hooky').length === 1, 'onHeal(F, amt)');
  ev = playId(F, 'pickaxe'); h.ok(log.includes('junk:2:2') && procs(ev, 'hooky').length === 1, 'onJunk(F, n, insts) when junk is added');
  ev = playId(F, 'vase'); h.ok(log.includes('shatter:vase') && procs(ev, 'hooky').length === 2, 'onShatter(F, inst, def) for exhausting glass (its Block fired onBlock too)');
  h.ok(procs(ev).some(e => e.src === 'item' && e.id === 'vase' && e.text === 'SHATTER'), 'and the item shows a SHATTER proc');
  ev = playId(F, 'extra'); h.ok(log.includes('gold:5') && procs(ev, 'hooky').length === 1, 'onGold(F, amt)');
  COMBAT.useGrab(F); playId(F, 'sword'); playId(F, 'sword'); playId(F, 'sword');
  ev = COMBAT.grabDone(F, 3); h.ok(log.includes('jackpot:3') && procs(ev, 'hooky').length >= 1, 'onJackpot(F, n) on a 3-item grab');
  log.length = 0;
  withCombos(() => {
    const G = fight(['dummy'], { relics: ['hooky'], bin: ['sword', 'shield', 'potion', 'sword'] });
    const e2 = grabOf(G, ['sword', 'shield']);
    h.ok(log.includes('combo:clang:2'), 'onCombo(F, combo, defs)');
    h.ok(procs(e2, 'hooky').length >= 1, 'with its proc');
  });
  // a hook that emits its own proc gets no second one; a silent hook gets none
  F = fight(['dummy'], { relics: ['selfproc', 'quiet'] });
  ev = playId(F, 'shield');
  h.eq(procs(ev, 'selfproc').length, 1, 'a hook with its own proc is not doubled');
  h.eq(procs(ev, 'quiet').length, 0, 'a hook that does nothing visible emits no proc');
  // the old hooks get procs too
  F = fight(['dummy'], { relics: ['echo'] }); ev = playId(F, 'sword');
  h.eq(procs(ev, 'echo').length, 1, 'existing relic hooks get an automatic proc');
});

h.test('relic rules: poisonKeep, blockKeep, shatter', () => {
  let F = fight(['dummy'], { relics: ['r_fester'] });
  E0(F).status.poison = 3; F.player.status.poison = 2;
  let ev = COMBAT.endTurn(F);
  h.eq(E0(F).status.poison, 3, 'enemy poison does not decay'); h.eq(E0(F).hp, 97, 'but it still ticks');
  h.eq(F.player.status.poison, 1, 'player poison still decays');
  h.ok(procs(ev).some(p => p.id === 'r_fester' && p.text === 'FESTER' && p.who === 'enemy' && p.idx === 0), 'FESTER proc on the enemy');
  COMBAT.endTurn(F); h.eq(E0(F).hp, 94, 'three a turn, forever');
  F = fight(['blocker'], { relics: ['r_walls'] });
  F.player.block = 9; ev = COMBAT.endTurn(F);
  h.eq(F.player.block, 9, 'player Block survives the turn start');
  h.ok(procs(ev, 'r_walls').some(p => p.text === 'WALLS HOLD'), 'WALLS HOLD proc');
  COMBAT.endTurn(F); h.eq(E0(F).block, 7, 'enemy Block still fades');
  F = fight(['dummy'], { relics: ['r_shatter'] });
  E0(F).status.freeze = 1;
  const pv = COMBAT.previewDamage(F, 'twin', false);
  ev = playId(F, 'twin');
  h.eq(E0(F).hp, 92, 'hits on a Frozen enemy deal +50% (3 -> 4, twice)');
  h.eq(pv, 8, 'previewDamage knows about the shatter');
  h.eq(procs(ev, 'r_shatter').filter(p => p.text === 'SHATTER').length, 1, 'one SHATTER proc per play');
  F = fight(['dummy'], { relics: ['r_shatter'] }); playId(F, 'sword'); h.eq(E0(F).hp, 94, 'no bonus on a thawed enemy');
  F = fight(['dummy'], { relics: ['r_shatter'] }); E0(F).status.freeze = 1; COMBAT.damage(F, null, E0(F), 10); h.eq(E0(F).hp, 90, 'relic damage (no attacker) does not shatter');
});

h.test('relic rules: glassBreak, amp, echo', () => {
  let F = fight(['dummy'], { relics: ['r_glass', 'hooky'], bin: ['glassy', 'vase', 'sword', 'sword'] });
  log.length = 0;
  let ev = playId(F, 'glassy');
  h.eq(E0(F).hp, 100 - 6 - 1, 'glass numbers double (3 -> 6), plus the onShatter hook');
  h.ok(F.exhausted.some(i => i.id === 'glassy'), 'and it shatters (exhausts) though it has no exhaust flag');
  h.ok(log.includes('shatter:glassy'), 'onShatter fired');
  playId(F, 'vase'); h.eq(F.player.block, 4, 'glass Block doubles too');
  F = fight(['dummy'], { relics: ['r_amp'], bin: ['pebble', 'sword', 'sword'] });
  h.eq(COMBAT.previewDamage(F, 'pebble'), 4, 'preview: small +2 damage');
  playId(F, 'pebble'); h.eq(E0(F).hp, 96, 'amp: small damage 2 -> 4'); h.eq(E0(F).status.poison, 2, 'amp: statuses get +ceil(n/2)');
  F = fight(['dummy'], { relics: ['r_amp', 'r_amp2'], bin: ['pebble', 'sword'] });
  playId(F, 'pebble'); h.eq(E0(F).hp, 95, 'amp rules from two relics add up (+3)');
  F = fight(['dummy'], { relics: ['r_amp'], bin: ['sword', 'sword'] }); playId(F, 'sword'); h.eq(E0(F).hp, 94, 'amp leaves other tags alone');
  F = fight(['dummy'], { relics: ['r_echo'], bin: ['orb', 'orb', 'orb', 'orb', 'sword'], claw: { grabs: 9 } });
  playId(F, 'orb'); playId(F, 'orb'); h.eq(E0(F).hp, 92, 'no echo on the first two magic items');
  ev = playId(F, 'orb'); h.eq(E0(F).hp, 84, 'the third resolves twice');
  h.ok(procs(ev, 'r_echo').some(p => p.text === 'ECHO'), 'ECHO proc');
  playId(F, 'sword'); playId(F, 'orb'); h.eq(E0(F).hp, 74, 'non-magic items do not count toward the echo');
  const r = COMBAT.rulesOf(['r_amp', 'r_amp2', 'r_glass', 'r_fester', 'nope']);
  h.eq(JSON.stringify(r.rules), JSON.stringify({ amp: { small: 3 }, glassBreak: 1, poisonKeep: 1 }), 'rulesOf merges rules');
  h.eq(r.src.amp, 'r_amp', 'rulesOf credits the first relic');
});

h.test('grab buffer, streak and combos', () => {
  withCombos(() => {
    let F = fight(['dummy'], { bin: ['sword', 'shield', 'potion', 'sword', 'rock'], claw: { grabs: 6 } });
    COMBAT.useGrab(F); playId(F, 'sword'); playId(F, 'shield');
    h.eq(F.grab.defs.map(d => d.id).join(), 'sword,shield', 'play fills the grab buffer');
    let ev = COMBAT.grabDone(F, 2);
    const cb = find(ev, 'combo');
    h.ok(cb.length === 1 && cb[0].id === 'clang' && cb[0].name === 'Clang' && cb[0].text === 'Two metal.' && cb[0].n === 2 && cb[0].tier === 1 && cb[0].color === '#aab3bd', 'combo event with the contract fields');
    const ci = ev.indexOf(cb[0]), di = ev.findIndex(e => e.t === 'dmg');
    h.ok(di > ci, 'the combo event comes before its effects');
    h.eq(E0(F).hp, 100 - 6 - 3, 'the combo resolved (3 damage)');
    h.eq(F.grab.defs.length, 0, 'grabDone clears the buffer');
    h.eq(F.stats.combos, 1, 'stats count combos'); h.eq(F.combos.clang, 1, 'per combo');
    // the buffer is per grab
    COMBAT.useGrab(F); playId(F, 'sword'); COMBAT.grabDone(F, 1);
    COMBAT.useGrab(F); ev = COMBAT.grabDone(F, 0);
    h.eq(find(ev, 'combo').length, 0, 'an empty grab after a single one fires nothing (no carry-over)');
    // str applies to combo hits, like an item
    F = fight(['dummy'], { bin: ['sword', 'shield', 'sword'] }); F.player.status.str = 2;
    grabOf(F, ['sword', 'shield']); h.eq(E0(F).hp, 100 - 8 - 5, 'Strength adds to combo hits');
    // once a turn
    F = fight(['dummy'], { bin: ['potion', 'potion', 'potion', 'potion', 'potion', 'potion', 'rock'], claw: { grabs: 5 }, hp: 40 });
    ev = grabOf(F, ['potion', 'potion', 'potion']);
    h.ok(find(ev, 'combo').some(c => c.id === 'bonus') && F.player.grabs === 5, 'bonus +1 grab');
    ev = grabOf(F, ['potion', 'potion', 'potion']);
    h.ok(!find(ev, 'combo').some(c => c.id === 'bonus') && F.player.grabs === 4, 'a once-a-turn combo stays quiet the second time');
    COMBAT.endTurn(F);
    // encore
    F = fight(['dummy'], { relics: ['r_encore'], bin: ['sword', 'shield', 'sword'] });
    ev = grabOf(F, ['sword', 'shield']);
    h.eq(E0(F).hp, 100 - 6 - 3 - 3, 'Encore: the combo resolves twice');
    h.ok(procs(ev, 'r_encore').some(p => p.text === 'ENCORE'), 'ENCORE proc');
    // no combos once the fight is over
    F = fight(['rat'], { bin: ['sword', 'shield', 'sword'] });
    COMBAT.useGrab(F); playId(F, 'sword'); playId(F, 'sword');
    h.eq(F.phase, 'over', 'the grab killed the rat'); h.eq(COMBAT.grabDone(F, 2).length, 0, 'grabDone after the win does nothing');
    // a thawed item does not count
    F = fight(['dummy'], { bin: ['sword', 'shield', 'sword'] });
    F.bin[0].frozen = true;
    COMBAT.useGrab(F); COMBAT.play(F, F.bin[0]); playId(F, 'shield');
    h.eq(F.grab.defs.length, 1, 'an item that only thawed is not part of the grab');
  });
  // streak
  const F = fight(['dummy'], { claw: { grabs: 9 }, bin: ['sword', 'sword', 'sword', 'sword', 'token', 'token'] });
  for (let i = 0; i < 3; i++) { COMBAT.useGrab(F); COMBAT.grabDone(F, 1); }
  h.eq(F.streak, 3, 'three good grabs make a streak of 3'); h.eq(F.player.status.streak, 3, 'shown as the streak status');
  h.eq(find(F.events, 'status').filter(e => e.s === 'streak').length, 0, 'the streak status emits no status events');
  const hp0 = E0(F).hp; playId(F, 'token'); h.eq(hp0 - E0(F).hp, 1 + 2 * 3, 'dmgPer streak');
  COMBAT.useGrab(F); COMBAT.grabDone(F, 0);
  h.eq(F.streak, 0, 'an empty grab resets it'); h.ok(!F.player.status.streak, 'status removed');
  COMBAT.endTurn(F); COMBAT.useGrab(F); COMBAT.grabDone(F, 2); h.eq(F.streak, 1, 'streaks count across turns');
  playId(F, 'token'); h.ok(!find(F.events, 'text').some(t => t.str === 'FIZZLE'), 'a per-count with nothing to count stays quiet after another effect');
});

h.test('new fx: blockPer, pay, again, copy tag, dmgPer poison/burn/small/gold, gold and max hp helpers', () => {
  let F = fight(['dummy'], { bin: ['plate', 'sword', 'sword'] });
  COMBAT.addJunk(F, 'rock', 3); playId(F, 'plate'); h.eq(F.player.block, 3 + 6, 'blockPer: 3 + 2 per junk');
  F = fight(['dummy'], { bin: ['bribe', 'sword'] }); F.gold0 = 25;
  h.eq(COMBAT.gold(F), 25, 'gold(F) is the run gold at fight start');
  h.eq(COMBAT.previewDamage(F, 'bribe'), 9, 'preview when you can pay');
  let ev = playId(F, 'bribe'); h.eq(E0(F).hp, 91, 'paid and hit'); h.eq(F.gain.gold, -10, 'the cost comes off the fight gold'); h.eq(COMBAT.gold(F), 15, 'gold left');
  h.eq(F.stats.spent, 10, 'spent counted');
  F.gold0 = 5; F.gain.gold = 0; F.bin.push({ uid: 'b2', id: 'bribe', plus: false });
  h.eq(COMBAT.previewDamage(F, 'bribe'), 0, 'preview when broke');
  ev = playId(F, 'bribe'); h.eq(E0(F).hp, 91, 'broke: the rest fizzles'); h.ok(find(ev, 'text').some(t => t.str === 'BROKE'), 'BROKE text'); h.eq(F.gain.gold, 0, 'nothing paid');
  F = fight(['dummy'], { bin: ['sword', 'encore', 'encore', 'sword'] });
  ev = playId(F, 'encore'); h.ok(find(ev, 'text').some(t => t.str === 'NOTHING'), 'again with nothing played before: NOTHING');
  playId(F, 'sword'); ev = playId(F, 'encore');
  h.eq(E0(F).hp, 88, 'again replays the sword'); h.ok(procs(ev).some(p => p.src === 'item' && p.id === 'encore' && /AGAIN/.test(p.text)), 'AGAIN proc');
  h.eq(F.lastPlay.def.id, 'sword', 'an again item is never the last play');
  F = fight(['dummy'], { bin: ['tome', 'orb', 'sword', 'sword'] }); ev = playId(F, 'tome');
  h.ok(find(ev, 'binCopy').some(c => c.inst.id === 'orb'), 'copy {tag} copies an item of that tag');
  F = fight(['dummy'], { bin: ['tome', 'sword'] }); ev = playId(F, 'tome'); h.ok(find(ev, 'text').some(t => t.str === 'NOTHING'), 'no item of the tag: NOTHING');
  F = fight(['dummy'], { bin: ['rot', 'sword'] }); E0(F).status.poison = 3;
  h.eq(COMBAT.previewDamage(F, 'rot'), 5, 'preview counts the poison the item applies first');
  playId(F, 'rot'); h.eq(E0(F).hp, 95, 'dmgPer poison reads the target after the item poisons it');
  F = fight(['dummy', 'hitter'], { bin: ['scorch', 'sword'] }); F.enemies[1].status.burn = 4; playId(F, 'scorch', 1); h.eq(F.enemies[1].hp, 52, 'dmgPer burn: 2 per Burn on the target');
  F = fight(['dummy'], { bin: ['scorch', 'sword'] }); ev = playId(F, 'scorch'); h.ok(find(ev, 'text').some(t => t.str === 'FIZZLE'), 'nothing to count and nothing else done: FIZZLE');
  F = fight(['dummy', 'hitter'], { bin: ['jar', 'pebble', 'pebble', 'pebble', 'sword'] }); playId(F, 'jar');
  h.ok(E0(F).hp === 97 && F.enemies[1].hp === 57, 'dmgPer small counts small items in the cabinet, all targets');
  F = fight(['dummy'], { bin: ['idol', 'sword'] }); F.gold0 = 57; playId(F, 'idol'); h.eq(E0(F).hp, 95, 'dmgPer gold: 1 per 10 gold');
  F = fight(['dummy'], { hp: 50 }); h.eq(COMBAT.gainGold(F, 7), 7, 'gainGold'); h.eq(F.gain.gold, 7, 'lands on F.gain.gold');
  h.eq(COMBAT.gainMaxHp(F, 2), 2, 'gainMaxHp'); h.ok(F.player.maxHp === 72 && F.player.hp === 52 && F.gain.maxhp === 2, 'max hp and a heal, recorded for the run');
  const t0 = COMBAT.addTemp(F, 'pebble', 2);
  h.ok(t0.length === 2 && t0.every(i => i.temp && !i.junk && F.bin.includes(i)), 'addTemp adds temporary non-junk copies');
  h.ok(find(F.events, 'binCopy').filter(e => t0.includes(e.inst)).length === 2, 'with binCopy events so the game spawns them');
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
    const known = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'shake', 'junk', 'purge', 'copy', 'dmgPer', 'cleanse', 'lifesteal', 'random', 'poisonAll', 'blockPer', 'pay', 'again'];
    for (const k of kinds) h.ok(known.includes(k), `item fx kind ${k} is one the engine implements`);
  });

  h.test('data: starting bins fit the cabinet with room for junk', () => {
    for (const [ch, c] of Object.entries(DATA.CHARACTERS || {})) {
      const F = C.newFight(mkRun(c.bin, [c.relic], 1), firstEnc, U.rng(11));
      h.eq(F.bin.length, c.bin.length, `${ch}: all ${c.bin.length} starting items start in the cabinet`);
      h.ok(C.MAX_CABINET - c.bin.length >= 10, `${ch}: room for 10+ junk or copies (${C.MAX_CABINET - c.bin.length})`);
      h.ok(!invariants(F, ch), `${ch}: starting fight is clean`);
    }
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
    const known = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape', 'gulp', 'bomb', 'corrode', 'jam', 'eggs'];
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

  // ---------- mini builds on the real data (DESIGN.md "Builds and synergies") ----------
  // Enemies get 300 hp so nothing dies by accident; the player 200.
  const mk = (bin, relics, enemies, o) => {
    o = o || {};
    const run = Object.assign(mkRun(bin, relics, 1), { hp: o.hp || 200, maxHp: o.maxHp || 200, gold: o.gold || 0 });
    if (o.grabs) run.claw = { grabs: o.grabs };
    const F = C.newFight(run, enemies || ['rat'], U.rng(o.seed || 3));
    for (const e of F.enemies) { e.hp = 300; e.maxHp = 300; }
    return F;
  };
  const pid = (F, id, t) => { const i = F.bin.find(x => x.id === id); if (!i) throw new Error('not in bin: ' + id); return C.play(F, i, t); };
  const P = (evs, id) => (evs || []).filter(e => e.t === 'proc' && e.id === id);
  const all = (F) => F.events;
  const newRelicProcs = new Set();
  const saw = (F) => { for (const e of F.events) if (e.t === 'proc' && e.src === 'relic') newRelicProcs.add(e.id); };

  h.test('build: poison (Festering Jar + Contagion)', () => {
    const F = mk(['stink_potion', 'rusty_sword', 'rusty_sword'], ['festering_jar', 'contagion'], ['rat', 'rat']);
    pid(F, 'stink_potion', 0);
    const p0 = F.enemies[0].status.poison;
    C.endTurn(F); C.endTurn(F);
    h.eq(F.enemies[0].status.poison, p0, `poison stays at ${p0} turn after turn`);
    h.eq(F.enemies[0].hp, 300 - 2 * p0, 'and ticks every turn');
    h.ok(P(all(F), 'festering_jar').some(e => e.text === 'FESTER'), 'FESTER proc');
    C.damage(F, F.player, F.enemies[0], 999, { pierce: true });
    h.eq(F.enemies[1].status.poison, p0, 'the dying rat spreads its poison');
    h.ok(P(all(F), 'contagion').some(e => e.text === 'SPREAD ' + p0), 'SPREAD proc');
    saw(F);
  });

  h.test('build: pyro (Powder Keg + Bellows)', () => {
    const F = mk(['torch', 'rusty_sword'], ['powder_keg', 'bellows'], ['rat', 'rat']);
    C.status(F, F.enemies[0], 'burn', 10);
    h.ok(F.enemies[0].hp === 290 && F.enemies[1].hp === 290, '10 Burn explodes for 10 on ALL enemies');
    h.eq(F.enemies[0].status.burn, 5, 'then its Burn halves');
    h.ok(P(all(F), 'powder_keg').some(e => e.text === 'KABOOM 10'), 'KABOOM proc');
    C.endTurn(F);
    h.eq(F.enemies[0].hp, 284, 'Bellows stokes it to 6 before it ticks');
    h.eq(F.enemies[0].status.burn, 5, 'so the Burn holds steady');
    h.ok(P(all(F), 'bellows').length >= 1, 'STOKE proc');
    saw(F);
  });

  h.test('build: frost (Permafrost Core + Cold Snap)', () => {
    const F = mk(['snowball', 'snowball', 'snowball', 'rusty_sword'], ['permafrost_core', 'cold_snap'], ['rat', 'rat'], { grabs: 6 });
    pid(F, 'snowball', 0); pid(F, 'snowball', 0); pid(F, 'snowball', 0);
    h.eq(F.enemies[0].status.freeze, 1, 'three Chill freeze it');
    h.eq(F.enemies[1].hp, 294, 'Cold Snap: the freeze hits ALL enemies for 6');
    const before = F.enemies[0].hp;
    const ev = pid(F, 'rusty_sword', 0);
    h.eq(before - F.enemies[0].hp, 10, 'the sword SHATTERS a frozen rat (7 -> 10)');
    h.ok(P(ev, 'permafrost_core').some(e => e.text === 'SHATTER' && e.who === 'enemy'), 'SHATTER proc on the enemy');
    saw(F);
  });

  h.test('build: fortress (Castle Walls + Battering Ram)', () => {
    const F = mk(['tower_shield', 'rusty_sword'], ['castle_walls', 'battering_ram']);
    pid(F, 'tower_shield');
    const b0 = F.player.block, blocked0 = F.stats.blocked;
    C.endTurn(F);
    h.eq(F.enemies[0].hp, 300 - Math.floor(b0 / 2), 'the Ram hits for half the Block');
    h.eq(F.player.block, b0 - (F.stats.blocked - blocked0), 'Block survives the turn start (minus what it soaked)');
    h.ok(P(all(F), 'battering_ram').length >= 1, 'RAM proc');
    saw(F);
  });

  h.test('build: scrap (Dumpster Lid + Junkyard King + Recycling Bin + Junk Cannon)', () => {
    const F = mk(['junk_cannon', 'femur', 'femur'], ['dumpster_lid', 'junkyard_king', 'recycling_bin'], ['rat', 'rat']);
    C.addJunk(F, 'rock', 2);
    h.eq(F.player.block, 6, 'junk thrown in: 3 Block each');
    const rock = F.bin.find(i => i.junk);
    C.play(F, rock, 0);
    h.eq(F.player.status.str, 1, 'grabbing out junk: +1 Strength');
    h.eq(F.enemies[0].hp, 297, 'and the Recycling Bin hits for 3');
    pid(F, 'junk_cannon', 0);
    h.ok(F.enemies[0].hp === 297 - 5 && F.enemies[1].hp === 295, 'Junk Cannon: 4 per junk (+1 Str) to ALL');
    h.eq(F.bin.filter(i => i.junk).length, 0, 'then blasts the junk out');
    h.ok(P(all(F), 'junkyard_king').length && P(all(F), 'dumpster_lid').length, 'procs');
    // Scrap Shot: junk and a weapon in one grab
    C.addJunk(F, 'rock', 1);
    C.useGrab(F); C.play(F, F.bin.find(i => i.junk), 0); pid(F, 'femur', 0);
    const ev = C.grabDone(F, 2);
    h.ok(ev.some(e => e.t === 'combo' && e.id === 'scrap_shot'), 'Scrap Shot combo');
    saw(F);
  });

  h.test('build: glass (Glass Cannon + Sharp Shards + Bottle Deposit)', () => {
    const F = mk(['toxic_vial', 'rusty_sword'], ['glass_cannon', 'sharp_shards', 'bottle_deposit'], ['rat', 'rat']);
    pid(F, 'toxic_vial', 0);
    h.eq(F.enemies[0].status.poison, 4, 'glass doubles: 2 -> 4 Poison');
    h.eq(F.enemies[0].hp, 300 - 2 - 4, 'glass doubles the hit (1 -> 2), then the shards cut ALL for 4');
    h.eq(F.enemies[1].hp, 296, 'the shards hit everyone');
    h.ok(F.exhausted.some(i => i.id === 'toxic_vial'), 'the vial shattered');
    h.ok(F.player.block === 3 && F.gain.gold === 2, 'Bottle Deposit: 3 Block and 2 gold');
    saw(F);
  });

  h.test('build: grab combos with Encore Machine, Tuning Fork and Horseshoe', () => {
    const F = mk(['rusty_sword', 'longsword', 'crisp_apple'], ['encore_machine', 'tuning_fork', 'horseshoe']);
    C.useGrab(F); pid(F, 'rusty_sword'); pid(F, 'longsword');
    const ev = C.grabDone(F, 2);
    const cb = ev.filter(e => e.t === 'combo');
    h.ok(cb.length === 1 && cb[0].id === 'crossed_blades' && cb[0].tier === 1 && cb[0].n === 2, 'Crossed Blades');
    h.eq(F.enemies[0].hp, 300 - 7 - 11 - 4 - 4 - 4, 'blades twice (Encore, 4 each) and the Fork clang');
    h.eq(F.player.block, 4, 'Horseshoe: 2 metal in one grab, 4 Block');
    for (const id of ['encore_machine', 'tuning_fork', 'horseshoe']) h.ok(P(ev, id).length >= 1, `${id} procs in the grabDone events`);
    saw(F);
  });

  h.test('build: swarm (Pocket Dimension + Marble Pouch + Beehive)', () => {
    const F = mk(['glass_bead', 'rusty_sword'], ['pocket_dimension', 'marble_pouch', 'beehive'], ['rat'], { grabs: 3 });
    h.eq(F.bin.filter(i => i.id === 'prize_marble' && i.temp).length, 3, 'three marbles in the bin for this fight');
    pid(F, 'prize_marble');
    h.eq(F.enemies[0].hp, 300 - 4 - 2, 'a marble hits for 4 (2 + 2) and the bees for 2');
    C.useGrab(F); pid(F, 'prize_marble'); pid(F, 'prize_marble'); pid(F, 'glass_bead');
    const g0 = F.player.grabs;
    const ev = C.grabDone(F, 3);
    h.ok(ev.some(e => e.t === 'combo' && e.id === 'handful'), 'Handful combo');
    h.eq(F.player.grabs, g0 + 1, '+1 grab');
    saw(F);
  });

  h.test('build: greed (Piggy Bank + Money Bags + Bribe + Pay to Win)', () => {
    const F = mk(['lucky_coin', 'bribe', 'pay_to_win', 'pay_to_win'], ['piggy_bank', 'money_bags'], ['rat'], { gold: 60, grabs: 9 });
    h.eq(F.player.block, 6, 'Piggy Bank: 1 Block per 10 gold');
    pid(F, 'lucky_coin');
    h.eq(F.enemies[0].hp, 300 - 3 - 2, 'coin hits for 3, Money Bags throws the 2 gold at ALL');
    pid(F, 'bribe');
    h.eq(F.enemies[0].status.stun, 1, 'Bribe stuns'); h.eq(C.gold(F), 50, 'for 12 gold');
    pid(F, 'pay_to_win'); h.eq(F.enemies[0].hp, 295 - 30, 'Pay to Win: 20 gold for 30 damage');
    pid(F, 'pay_to_win'); h.eq(F.enemies[0].hp, 265 - 30, 'and again');
    const ev = pid(F, 'pay_to_win'.replace('pay_to_win', 'lucky_coin'));
    h.ok(P(ev, 'money_bags').some(e => /CHA-CHING/.test(e.text)), 'CHA-CHING proc');
    saw(F);
    const G = mk(['pay_to_win', 'femur'], [], ['rat'], { gold: 5 });
    const e2 = pid(G, 'pay_to_win');
    h.ok(G.enemies[0].hp === 300 && e2.some(e => e.t === 'text' && e.str === 'BROKE'), 'broke: no hit');
  });

  h.test('build: echo (Echo Chamber + Wizard Hat + Crystal Focus + Deja Vu)', () => {
    const F = mk(['rulebook', 'rulebook', 'rulebook', 'femur', 'deja_vu'], ['echo_chamber', 'wizard_hat', 'crystal_focus'], ['rat'], { grabs: 9 });
    h.ok(F.bin.length === 6 && F.bin.some(i => i.temp && DATA.ITEMS[i.id].tags.includes('magic')), 'Crystal Focus copied a magic item');
    const books = F.bin.filter(i => i.id === 'rulebook' && !i.temp).slice(0, 3);
    for (const b of books) C.play(F, b);
    h.eq(F.player.block, 6 + 6 + 12, 'the third magic item resolves twice');
    h.eq(F.enemies[0].hp, 291, 'Wizard Hat zaps 3 per magic item');
    h.ok(P(all(F), 'echo_chamber').some(e => e.text === 'ECHO'), 'ECHO proc');
    pid(F, 'femur');
    const ev = pid(F, 'deja_vu');
    h.eq(F.enemies[0].hp, 291 - 7 - 7 - 3, 'Deja Vu plays the femur again');
    h.ok(ev.some(e => e.t === 'proc' && e.src === 'item' && e.id === 'deja_vu'), 'AGAIN proc');
    saw(F);
  });

  h.test('build: feast (Feast Table + Bat Wing)', () => {
    const F = mk(['crisp_apple', 'crisp_apple', 'crisp_apple', 'crisp_apple', 'femur'], ['feast_table', 'bat_wing'], ['rat'], { hp: 100, grabs: 9 });
    for (let i = 0; i < 4; i++) pid(F, 'crisp_apple');
    h.eq(F.player.maxHp, 203, 'three food items grow Max HP by 3 (capped per fight)');
    h.eq(F.gain.maxhp, 3, 'recorded for the run');
    h.eq(F.enemies[0].hp, 300 - 4 * 4 - 3, 'every heal bites back (4 per apple, 1 per Max HP heal)');
    saw(F);
  });

  h.test('build: brawler (Gym Membership + Sweatband)', () => {
    const F = mk(['whetstone', 'twin_daggers'], ['gym_membership', 'sweatband']);
    pid(F, 'whetstone');
    h.eq(F.player.status.str, 3, 'Whetstone 2 Strength +1 from the gym');
    h.eq(F.player.block, 4, 'Sweatband: 4 Block');
    pid(F, 'twin_daggers'); h.eq(F.enemies[0].hp, 300 - 3 * 6, 'every dagger hit gets the Strength');
    saw(F);
  });

  h.test('build: jackpot (Winning Streak + Prize Counter)', () => {
    const F = mk(Array.from({ length: 12 }, () => 'femur'), ['winning_streak', 'prize_counter'], ['rat']);
    for (let i = 0; i < 3; i++) { C.useGrab(F); pid(F, 'femur'); C.grabDone(F, 1); }
    h.eq(F.streak, 3, 'a streak of 3'); h.eq(F.player.grabs, 1, 'Winning Streak: +1 grab');
    C.useGrab(F); pid(F, 'femur'); pid(F, 'femur'); pid(F, 'femur');
    const ev = C.grabDone(F, 3);
    h.ok(F.player.block >= 6, 'Prize Counter: 6 Block on a 3-item grab');
    const ids = ev.filter(e => e.t === 'combo').map(e => e.id);
    h.ok(ids.includes('armory') && ids.includes('three_of_a_kind') && ids.length === 3, `three femurs: ${ids.join(', ')}`);
    h.eq(F.player.grabs, 0, 'no second streak grab in the same turn');
    saw(F);
  });

  h.test('build: magnet (Dynamo)', () => {
    const F = mk(['rusty_sword', 'rusty_sword', 'rusty_sword', 'dented_shield', 'dented_shield', 'crisp_apple'], ['dynamo']);
    C.endTurn(F);
    h.eq(F.enemies[0].hp, 295, 'Dynamo: 1 per metal item in the cabinet at turn end');
    h.ok(P(all(F), 'dynamo').some(e => e.text === 'DYNAMO 5'), 'DYNAMO proc');
    saw(F);
  });

  h.test('build relics proc in their builds', () => {
    const want = ['festering_jar', 'contagion', 'powder_keg', 'bellows', 'permafrost_core', 'cold_snap', 'castle_walls', 'battering_ram',
      'dumpster_lid', 'junkyard_king', 'recycling_bin', 'glass_cannon', 'sharp_shards', 'bottle_deposit', 'encore_machine', 'tuning_fork',
      'horseshoe', 'marble_pouch', 'beehive', 'pocket_dimension', 'piggy_bank', 'money_bags', 'echo_chamber', 'wizard_hat', 'crystal_focus', 'feast_table',
      'bat_wing', 'gym_membership', 'sweatband', 'winning_streak', 'prize_counter', 'dynamo'];
    const missing = want.filter(id => DATA.RELICS[id] && !newRelicProcs.has(id));
    h.eq(missing.join(','), '', 'every build relic emitted a proc');
    h.ok(want.every(id => DATA.RELICS[id]), 'all of them exist');
  });

  h.test('old saves: a run of old ids fights clean', () => {
    const bin = ['rusty_sword', 'dented_shield', 'toxic_vial', 'shiv', 'lucky_coin', 'crisp_apple', 'prize_marble', 'glass_bead', 'plague_orb', 'family_anvil'];
    const relics = ['squire_gauntlet', 'jackpot_bell', 'venom_gland', 'token_stack', 'recycling_bin', 'second_wind'];
    const F = C.newFight(Object.assign(mkRun(bin, relics, 2), { hp: 120, maxHp: 120 }), encOf(2)[0], U.rng(8));
    const rng = U.rng(4);
    for (let t = 0; t < 6 && F.phase !== 'over'; t++) randomTurn(F, rng);
    h.ok(!invariants(F, 'old save'), `old ids fight clean ${invariants(F, 'old save') || ''}`);
    h.ok(F.rules && Object.keys(F.rules).length === 0, 'old relics bend no rules');
  });

  h.test('data: every combo resolves on a real fight', () => {
    for (const id of Object.keys(DATA.COMBOS || {})) {
      const c = DATA.COMBOS[id];
      const F = C.newFight(mkRun(c.example.concat(['rock', 'femur']), [], 1), firstEnc, U.rng(U.hashStr(id)));
      if (c.ctx && c.ctx.luck) F.player.status.luck = c.ctx.luck;   // a recipe that reads the grab state (Lucky Seven)
      C.useGrab(F);
      for (const x of c.example) { const i = F.bin.find(b => b.id === x && F.grab.insts.indexOf(b) < 0); if (i && F.phase === 'player') C.play(F, i); }
      const ev = C.grabDone(F, c.example.length);
      h.ok(F.phase === 'over' || ev.some(e => e.t === 'combo' && e.id === id), `combo ${id} fires in a fight`);
      h.ok(!invariants(F, id), `combo ${id} resolves cleanly ${invariants(F, id) || ''}`);
    }
  });
}

h.test('a dry turn (nothing played) pours the used pile back in', () => {
  const run = { hp: 70, maxHp: 70, act: 1, bin: Array.from({ length: 14 }, () => ({ id: 'sword' })), relics: [], claw: { grabs: 9 } };
  const F = COMBAT.newFight(run, ['dummy'], U.rng(3));
  for (let i = 0; i < 6; i++) COMBAT.play(F, F.bin[0]);
  h.eq(F.used.length, 6, 'six played');
  COMBAT.endTurn(F);
  h.eq(F.bin.length, 10, 'a turn that played something only trickles 2 into an 8-item bin');
  h.eq(F.used.length, 4, 'four still wait');
  const ev = COMBAT.endTurn(F);
  h.eq(F.bin.length, 14, 'a dry turn pours everything back');
  h.eq(F.used.length, 0, 'used emptied');
  h.ok(ev.some(e => e.t === 'refill'), 'with a refill event');
});

// Turn start: the bin is topped up to binFloor from the used pile, then
// `trickle` more items rain in (random picks), never past MAX_CABINET.
h.test('bin trickle: 2 a turn, floor of 6, cabinet cap, immediate refill mid-turn', () => {
  const swords = (n) => Array.from({ length: n }, () => 'sword');
  // Park n bin items in the used pile and mark the turn as played (not dry).
  const park = (F, n) => { F.used.push(...F.bin.splice(0, n)); F.playedThisTurn = 1; };
  let F = fight(['dummy'], { bin: swords(20) });
  park(F, 10);
  let ev = COMBAT.endTurn(F);
  let rf = find(ev, 'refill');
  h.eq(rf.length, 1, 'one refill event at turn start');
  h.eq(rf[0].items.length, 2, 'the trickle is 2 items');
  h.eq(F.bin.length, 12, 'bin 10 -> 12'); h.eq(F.used.length, 8, 'used 10 -> 8');
  h.ok(rf[0].items.every(i => F.bin.includes(i) && !F.used.includes(i)), 'the trickled items moved from used to the bin');
  F.playedThisTurn = 1; ev = COMBAT.endTurn(F);
  h.eq(find(ev, 'refill')[0].items.length, 2, 'another 2 the next turn');
  h.eq(F.bin.length, 14, 'bin 12 -> 14');
  // random picks: over a few seeds the trickle does not always take the oldest used items
  let varied = false;
  for (let seed = 1; seed <= 8 && !varied; seed++) {
    const G = fight(['dummy'], { bin: swords(20), seed });
    const order = G.bin.slice(0, 10);
    park(G, 10);
    const got = find(COMBAT.endTurn(G), 'refill')[0].items;
    if (got[0] !== order[0] || got[1] !== order[1]) varied = true;
  }
  h.ok(varied, 'the trickle picks at random from the used pile');
  // floor: a 2-item bin is topped up to 6, then 2 more
  F = fight(['dummy'], { bin: swords(20) });
  park(F, 18);
  ev = COMBAT.endTurn(F);
  h.eq(find(ev, 'refill')[0].items.length, 6, 'floor top-up 4 plus trickle 2');
  h.eq(F.bin.length, 8, 'bin 2 -> 8'); h.eq(F.used.length, 12, 'used 18 -> 12');
  // floor with a short used pile: whatever there is comes back
  F = fight(['dummy'], { bin: swords(5) });
  park(F, 4);
  COMBAT.endTurn(F);
  h.eq(F.bin.length, 5, 'a short used pile comes back whole'); h.eq(F.used.length, 0, 'nothing left in used');
  // cap: a full cabinet takes nothing, one free slot takes one
  F = fight(['dummy'], { bin: swords(40) });
  h.eq(F.bin.length, COMBAT.MAX_CABINET, 'a 40-item bin fills the cabinet'); h.eq(F.used.length, 6, 'six wait');
  F.playedThisTurn = 1; ev = COMBAT.endTurn(F);
  h.eq(find(ev, 'refill').length, 0, 'no trickle into a full cabinet'); h.eq(F.bin.length, COMBAT.MAX_CABINET, 'still at the cap');
  park(F, 1);
  ev = COMBAT.endTurn(F);
  h.eq(find(ev, 'refill')[0].items.length, 1, 'one slot free, one item rains in'); h.eq(F.bin.length, COMBAT.MAX_CABINET, 'never above the cap');
  // nothing to trickle
  F = fight(['dummy'], { bin: swords(5) });
  F.playedThisTurn = 1; ev = COMBAT.endTurn(F);
  h.eq(find(ev, 'refill').length, 0, 'no refill event with an empty used pile'); h.eq(F.bin.length, 5, 'bin unchanged');
  // mid-turn: the last item played pours the used pile back at once
  F = fight(['dummy'], { bin: swords(10), claw: { grabs: 9 } });
  park(F, 8);
  playId(F, 'sword'); ev = playId(F, 'sword');
  h.eq(find(ev, 'refill').length, 1, 'an empty bin refills immediately mid-turn');
  h.eq(F.bin.length, 10, 'everything back'); h.eq(F.used.length, 0, 'used empty');
  // never empty at turn start while used holds anything (fuzz over seeds)
  let bare = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const G = fight(['dummy'], { bin: swords(12), seed });
    for (let turn = 0; turn < 6; turn++) {
      park(G, Math.min(G.bin.length, 1 + (seed + turn) % 12));
      COMBAT.endTurn(G);
      if (G.used.length && G.bin.length < 6) bare++;
    }
  }
  h.eq(bare, 0, 'a turn never starts below the floor while used has items');
  // tunable from DATA.ECONOMY
  STUB.ECONOMY = { trickle: 3, binFloor: 0 };
  F = fight(['dummy'], { bin: swords(20) });
  park(F, 10);
  COMBAT.endTurn(F);
  h.eq(F.bin.length, 13, 'ECONOMY.trickle 3 moves 3');
  delete STUB.ECONOMY;
});

// ---------- part 3: the monsters pass (bellies, bin tricks, affixes, phase two) ----------
{
  const M = boot({ only: ['util', 'combat'] });
  const MC = M.COMBAT, MU = M.U;
  const MI = {
    sword: { id: 'sword', name: 'Sword', rarity: 'c', tags: ['metal', 'weapon'], fx: [{ k: 'dmg', v: 6 }] },
    shield: { id: 'shield', name: 'Shield', rarity: 'c', tags: ['metal'], target: 'self', fx: [{ k: 'block', v: 6 }] },
    gem: { id: 'gem', name: 'Gem', rarity: 'r', tags: ['magic'], fx: [{ k: 'dmg', v: 4 }] },
    potion: { id: 'potion', name: 'Potion', rarity: 'c', tags: ['potion', 'glass'], target: 'self', fx: [{ k: 'heal', v: 5 }] },
    vial: { id: 'vial', name: 'Vial', rarity: 'c', tags: ['potion', 'glass'], fx: [{ k: 'status', s: 'poison', v: 3, to: 'enemy' }] },
    bomb: { id: 'bomb', name: 'Bomb', rarity: 'u', art: 'bomb', tags: ['weapon'], target: 'all', fx: [{ k: 'dmg', v: 6 }] },
    pane: { id: 'pane', name: 'Pane', rarity: 'c', tags: ['glass'], target: 'self', fx: [{ k: 'block', v: 3 }] },
    apple: { id: 'apple', name: 'Apple', rarity: 'c', tags: ['food'], target: 'self', fx: [{ k: 'heal', v: 2 }] },
    fusebomb: { id: 'fusebomb', name: 'Lit Bomb', rarity: 'junk', tags: ['junk'], target: 'enemy', exhaust: true, fx: [] },
    broodegg: { id: 'broodegg', name: 'Egg', rarity: 'junk', tags: ['junk'], target: 'none', exhaust: true, fx: [] },
  };
  const ME = (id, moves, extra) => Object.assign({ id, name: id, act: 1, tier: 'normal', hp: [60, 60], moves, ai: 'cycle' }, extra || {});
  const MEN = {
    dummy: ME('dummy', [{ id: 'w', k: 'block', v: 0 }], { hp: [200, 200] }),
    metaleater: ME('metaleater', [{ id: 'g', k: 'gulp', n: 1, like: 'metal' }, { id: 'w', k: 'block', v: 0 }]),
    magpie: ME('magpie', [{ id: 'g', k: 'gulp', n: 2, like: 'shiny' }, { id: 'w', k: 'block', v: 0 }]),
    glutton: ME('glutton', [{ id: 'g', k: 'gulp', n: 4 }, { id: 'w', k: 'block', v: 0 }], { hp: [300, 300] }),
    bomber: ME('bomber', [{ id: 'b', k: 'bomb', v: 10, fuse: 2 }, { id: 'w', k: 'block', v: 0 }]),
    rust: ME('rust', [{ id: 'c', k: 'corrode', n: 2 }]),
    jammer: ME('jammer', [{ id: 'j', k: 'jam', v: 1 }, { id: 'w', k: 'block', v: 0 }]),
    layer: ME('layer', [{ id: 'l', k: 'eggs', n: 2, hatch: 'grub', turns: 2 }, { id: 'w', k: 'block', v: 0 }]),
    grub: ME('grub', [{ id: 'n', k: 'attack', v: 1 }], { hp: [5, 5], minion: true }),
    runner: ME('runner', [{ id: 'g', k: 'gulp', n: 1 }, { id: 'r', k: 'escape' }]),
    hitter: ME('hitter', [{ id: 'h', k: 'attack', v: 10 }], { hp: [80, 80] }),
    boss: ME('boss', [{ id: 'a', k: 'attack', v: 5 }, { id: 'b', k: 'block', v: 5 }, { id: 'c', k: 'buff', s: 'str', v: 1 }], { tier: 'elite', hp: [100, 100], enrage: { name: 'MAD', text: 'grr', str: 4, pattern: [2, 0] } }),
    plain: ME('plain', [{ id: 'a', k: 'attack', v: 5 }], { tier: 'boss', hp: [100, 100] }),
  };
  const MSTAT = {};
  for (const [s, kind] of Object.entries({ str: 'buff', armor: 'buff', thorns: 'buff', poison: 'debuff', weak: 'debuff', vuln: 'debuff', jam: 'debuff' })) MSTAT[s] = { id: s, name: s, kind, stack: ['weak', 'vuln', 'jam'].includes(s) ? 'turns' : 'count' };
  const MSTUB = { ITEMS: MI, ENEMIES: MEN, STATUS: MSTAT, RELICS: {}, AFFIXES: { hasty: { hp: 0 }, vampiric: { hp: 0 }, explosive: { hp: 0 }, greedy: { hp: 0 }, armored: { hp: 0.1 }, spiky: { hp: 0 }, regen: { hp: 0 } } };
  MC.useDefs(MSTUB);
  const mfight = (enemies, bin, o) => {
    o = o || {};
    const run = { hp: o.hp || 70, maxHp: 70, act: o.act || 1, relics: [], claw: { grabs: 3 }, bin: bin.map((id, i) => ({ uid: 'm' + i, id, plus: false })) };
    return MC.newFight(run, enemies, MU.rng(o.seed || 5));
  };
  const evs = (list, t) => list.filter(e => e.t === t);
  const ids = (list) => list.map(i => i.id).sort().join(',');

  h.test('monsters: gulp swallows by taste, holds items in the belly', () => {
    let F = mfight(['metaleater'], ['gem', 'potion', 'sword', 'apple']);
    const e = F.enemies[0];
    h.ok(/Swallows/.test(MC.intentText(e)), 'gulp telegraph: ' + MC.intentText(e));
    let ev = MC.endTurn(F);
    h.eq(e.belly.length, 1, 'one item swallowed');
    h.eq(e.belly[0].inst.id, 'sword', 'the metal eater takes the metal item');
    h.ok(!F.bin.some(i => i.id === 'sword'), 'it left the bin');
    const eat = evs(ev, 'binEat');
    h.eq(eat.length, 1, 'a binEat event'); h.eq(eat[0].idx, 0, 'with the eater index'); h.eq(eat[0].inst.id, 'sword', 'and the instance');
    h.ok(evs(ev, 'text').some(x => x.who === 'e' && /NOM|GULP|MINE|CHOMP/.test(x.str)), 'a taunt when it eats');
    h.eq(e.status.str, 2, 'a swallowed weapon lends +2 Strength');
    // shiny: the rarest first, two at a time
    F = mfight(['magpie'], ['sword', 'gem', 'pane', 'shield']);
    MC.endTurn(F);
    const took = F.enemies[0].belly.map(b => b.inst.id);
    h.eq(took[0], 'gem', 'shiny goes for the rare gem first');
    h.ok(['sword', 'shield'].includes(took[1]), 'then a metal item over glass: ' + took[1]);
    // junk and iced items are never eaten; the belly caps
    F = mfight(['glutton'], ['sword', 'shield', 'gem', 'pane', 'sword', 'gem']);
    F.bin[0].frozen = true;
    MC.addJunk(F, 'fusebomb', 1);
    MC.endTurn(F);
    const g = F.enemies[0];
    h.eq(g.belly.length, MC.BELLY_MAX, 'the belly holds ' + MC.BELLY_MAX);
    h.ok(g.belly.every(b => !b.inst.frozen && b.inst.id !== 'fusebomb'), 'never junk or iced items');
    // an empty bin: nothing to eat
    F = mfight(['metaleater'], []);
    ev = MC.endTurn(F);
    h.ok(evs(ev, 'text').some(x => x.str === 'NOTHING'), 'NOTHING when the bin is empty');
  });

  h.test('monsters: hiccup, death burst and digestion bring items back (or not)', () => {
    let F = mfight(['glutton'], ['sword', 'shield', 'gem', 'gem', 'sword', 'gem']);
    const e = F.enemies[0];
    MC.endTurn(F);
    h.eq(e.belly.length, 4, 'four items down');
    const need = MC.hiccupAt(e);
    h.eq(need, Math.max(6, Math.ceil(e.maxHp * 0.15)), 'hiccupAt is 15% of max hp (min 6)');
    const b0 = F.bin.length;
    MC.damage(F, F.player, e, need - 1, { pierce: true });
    h.eq(e.belly.length, 4, 'not enough damage yet');
    let ev = [];
    const c = MC.damage(F, F.player, e, 1, { pierce: true });
    ev = F.events.filter(x => x.t === 'binReturn');
    h.ok(c > 0 && e.belly.length === 3, 'crossing the threshold hiccups one item');
    h.eq(F.bin.length, b0 + 1, 'it lands back in the bin');
    h.eq(ev[ev.length - 1].why, 'hiccup', 'binReturn why hiccup'); h.eq(ev[ev.length - 1].insts.length, 1, 'one instance');
    // the meter empties at the turn start
    MC.damage(F, F.player, e, need - 1, { pierce: true });
    MC.endTurn(F);
    h.eq(e.gut, 0, 'the hiccup meter resets each turn');
    // damage in the enemy phase (poison, glass, thorns) does not count
    const held = e.belly.length;
    F.phase = 'enemy';
    MC.damage(F, null, e, need + 1, { pierce: true });
    F.phase = 'player';
    h.eq(e.belly.length, held, 'enemy-phase damage never hiccups');
    // death: everything bursts out
    F.events.length = 0;
    const left = e.belly.map(b => b.inst);
    MC.damage(F, F.player, e, 9999, { pierce: true });
    const burst = F.events.filter(x => x.t === 'binReturn');
    h.ok(!e.alive, 'dead');
    h.eq(burst.length, 1, 'one burst event'); h.eq(burst[0].why, 'burst', 'why burst');
    h.eq(burst[0].insts.length, left.length, 'every swallowed item comes back');
    h.ok(left.every(i => F.bin.includes(i)), 'all back in the bin');
    const di = F.events.findIndex(x => x.t === 'die'), bi = F.events.findIndex(x => x.t === 'binReturn');
    h.ok(di >= 0 && di < bi, 'the die event plays before the burst');
    // digestion: DIGEST of its turns, then gone for this fight only
    F = mfight(['metaleater'], ['sword', 'gem', 'gem', 'gem', 'gem', 'gem']);
    const m = F.enemies[0];
    MC.endTurn(F);
    const eaten = m.belly[0].inst;
    h.eq(m.belly[0].turns, MC.DIGEST, 'digest clock starts at ' + MC.DIGEST);
    let dig = [];
    for (let k = 0; k < MC.DIGEST; k++) dig = dig.concat(evs(MC.endTurn(F), 'binDigest'));
    h.ok(!m.belly.some(b => b.inst === eaten), 'digested after ' + MC.DIGEST + ' of its turns');
    h.ok(F.digested.includes(eaten) && !F.bin.includes(eaten) && !F.used.includes(eaten), 'gone for the fight (F.digested)');
    h.ok(dig.some(x => x.k === 'digest' && x.inst === eaten), 'binDigest k digest');
    h.eq(m.status.str || 0, 0, 'its lent Strength goes with it');
    // a full cabinet: the burst goes to the used pile instead
    F = mfight(['glutton'], ['sword', 'shield', 'gem', 'pane']);
    MC.endTurn(F);
    while (F.bin.length < MC.MAX_CABINET) F.bin.push({ uid: 'f' + F.bin.length, id: 'gem', plus: false });
    MC.damage(F, F.player, F.enemies[0], 9999, { pierce: true });
    h.ok(F.bin.length <= MC.MAX_CABINET && F.used.length >= 4, 'overflow lands in the used pile');
    // Polish and QA: digestion never takes the player's last real items (a
    // gulper that ate the bin down to nothing made an unwinnable fight)
    h.eq(MC.DIGEST_FLOOR, 4, 'the floor is four real items');
    F = mfight(['metaleater'], ['sword', 'gem', 'gem']);
    const mm = F.enemies[0];
    MC.endTurn(F);
    const gulped = mm.belly[0] && mm.belly[0].inst;
    h.ok(!!gulped, 'it swallows one');
    F.events.length = 0;
    let back = [];
    for (let k = 0; k < MC.DIGEST; k++) back = back.concat(evs(MC.endTurn(F), 'binReturn'));
    h.ok(!(F.digested || []).includes(gulped), 'with only two real items left it is not digested');
    h.ok(F.bin.includes(gulped) || F.used.includes(gulped) || mm.belly.some((b) => b.inst === gulped), 'it comes back (or is still held after a re-gulp)');
    h.ok(back.some((x) => x.why === 'burst' && x.insts.includes(gulped)), 'coughed up with a binReturn');
  });

  h.test('monsters: what it ate matters (bomb, potion, poison, glass, plate)', () => {
    // a bomb goes off inside it
    let F = mfight(['metaleater'], ['bomb']);
    let e = F.enemies[0];
    let hp0 = e.hp, ev = MC.endTurn(F);
    h.eq(hp0 - e.hp, 12, 'a swallowed 6-damage bomb blows up for 12 inside it');
    h.ok(evs(ev, 'binDigest').some(x => x.k === 'boom'), 'binDigest k boom');
    h.ok(F.used.concat(F.bin).some(i => i.id === 'bomb'), 'the bomb goes to the used pile (and trickles back), not lost');
    h.eq(e.belly.length, 0, 'nothing held');
    // a healing potion heals it (double)
    F = mfight(['glutton'], ['potion']);
    e = F.enemies[0]; e.hp = 100;
    MC.endTurn(F);
    h.eq(e.hp, 110, 'drinks the potion: +10');
    // a poison vial poisons it
    F = mfight(['glutton'], ['vial']);
    e = F.enemies[0];
    ev = MC.endTurn(F);
    h.eq(e.status.poison, 3, 'the poison lands on the eater');
    h.ok(evs(ev, 'text').some(x => x.str === 'BLEGH'), 'BLEGH');
    // glass cuts it every turn it is held
    F = mfight(['glutton'], ['pane']);
    e = F.enemies[0];
    MC.endTurn(F);
    hp0 = e.hp; MC.endTurn(F);
    h.eq(hp0 - e.hp, 4, 'swallowed glass cuts for 4 (act 1)');
    // plate lends Armor while held, dropped on the hiccup
    F = mfight(['metaleater'], ['shield']);
    e = F.enemies[0];
    MC.endTurn(F);
    h.eq(e.status.armor, 1, 'plate: +1 Armor');
    MC.damage(F, F.player, e, MC.hiccupAt(e) + 1, { pierce: true });
    h.eq(e.status.armor || 0, 0, 'armor gone with the item');
  });

  h.test('monsters: lit bombs, eggs, rust and a jammed rail', () => {
    // a bomb left alone goes off after its fuse, through Block
    let F = mfight(['bomber'], ['sword', 'sword', 'gem']);
    let ev = MC.endTurn(F);
    const b = F.bin.find(i => i.id === 'fusebomb');
    h.ok(!!b && evs(ev, 'binBomb').length === 1, 'binBomb drops a lit bomb in the bin');
    h.eq(b.fuse, 2, 'fuse 2 (not burnt on the turn it lands)');
    h.ok(MC.isJunk(b), 'it is junk');
    ev = MC.endTurn(F);
    h.eq(b.fuse, 1, 'one turn later: 1');
    F.player.block = 4;
    const hp0 = F.player.hp;
    ev = MC.endTurn(F);
    h.ok(evs(ev, 'binBoom').length === 1 && !F.bin.includes(b), 'BOOM: it leaves the bin');
    h.eq(hp0 - F.player.hp, 10 - 4 + 0, 'hits the player for 10 through 4 block');
    // grabbed: it flies back at the bomber for 1.5x
    F = mfight(['bomber', 'dummy'], ['sword', 'gem']);
    MC.endTurn(F);
    MC.setTarget(F, 1);
    const e0 = F.enemies[0], h0 = e0.hp;
    const bomb = F.bin.find(i => i.id === 'fusebomb');
    MC.play(F, bomb, 1);
    h.eq(h0 - e0.hp, 15, 'thrown back at the thrower (not the target) for 15');
    h.ok(F.exhausted.includes(bomb), 'and it is spent');
    // eggs hatch into minions unless grabbed
    F = mfight(['layer'], ['sword', 'gem']);
    ev = MC.endTurn(F);
    const eggs = F.bin.filter(i => i.id === 'broodegg');
    h.eq(eggs.length, 2, 'two eggs laid'); h.eq(evs(ev, 'binEggs').length, 1, 'binEggs event');
    MC.play(F, eggs[0]);
    h.ok(!F.bin.includes(eggs[0]) && F.exhausted.includes(eggs[0]), 'a grabbed egg is gone');
    MC.endTurn(F);
    ev = MC.endTurn(F);
    h.eq(evs(ev, 'binHatch').length, 1, 'the other one hatches');
    h.ok(F.enemies.some(e => e.id === 'grub' && e.alive), 'into a grub');
    // rust halves an item's numbers
    F = mfight(['rust'], ['sword', 'shield', 'gem']);
    ev = MC.endTurn(F);
    h.eq(evs(ev, 'binRust').length, 2, 'two metal items rusted');
    const sw = F.bin.find(i => i.id === 'sword');
    h.ok(sw.rust, 'the sword is rusty');
    const r0 = F.enemies[0].hp;
    MC.play(F, sw);
    h.eq(r0 - F.enemies[0].hp, 3, 'a rusty 6-damage sword hits for 3');
    h.ok(!F.bin.find(i => i.id === 'gem').rust, 'non-metal never rusts');
    // jam: one grab fewer next turn, never the last one
    F = mfight(['jammer'], ['sword']);
    ev = MC.endTurn(F);
    h.eq(evs(ev, 'binJam').length, 1, 'binJam event');
    h.eq(F.player.grabs, 2, 'jammed: 3 grabs -> 2');
    h.ok(F.player.status.jam > 0, 'the jam shows during the turn');
    MC.endTurn(F);
    h.eq(F.player.grabs, 3, 'the rail is clear the turn after');
  });

  h.test('monsters: escape takes the belly; affixes; phase two', () => {
    let F = mfight(['runner', 'dummy'], ['sword', 'gem']);
    MC.endTurn(F);
    const got = F.enemies[0].belly[0].inst;
    const ev = MC.endTurn(F);
    h.ok(F.enemies[0].escaped && F.stolen.includes(got), 'a fleeing eater keeps what it ate (for this fight)');
    h.ok(evs(ev, 'binDigest').some(x => x.k === 'escape'), 'binDigest k escape');
    // Hasty: every third action twice
    F = mfight(['hitter'], ['gem'], { hp: 70 });
    const e = F.enemies[0];
    MC.giveAffix(F, e, 'hasty');
    const hits = [];
    for (let k = 0; k < 3; k++) { const hp0 = F.player.hp; MC.endTurn(F); hits.push(hp0 - F.player.hp); F.player.hp = 70; }
    h.eq(hits.join(), '10,10,15', 'the third action adds a half-size jab');
    h.ok(!MC.hasteNext(e), 'then the count restarts');
    // Vampiric heals half of what gets through
    F = mfight(['hitter'], ['gem']);
    MC.giveAffix(F, 0, 'vampiric');
    F.enemies[0].hp = 50;
    MC.endTurn(F);
    h.eq(F.enemies[0].hp, 55, 'vampiric: 10 dealt, 5 drunk');
    // Explosive: a parting blast that never kills
    F = mfight(['dummy'], ['gem'], { hp: 5 });
    MC.giveAffix(F, 0, 'explosive');
    MC.damage(F, F.player, F.enemies[0], 9999, { pierce: true });
    h.eq(F.player.hp, 1, 'the blast leaves the player at 1');
    h.eq(MC.isOver(F), 'win', 'and the fight is still won');
    // Greedy gulps on its first action
    F = mfight(['hitter'], ['gem', 'sword']);
    MC.giveAffix(F, 0, 'greedy');
    h.ok(/Greedy/.test(MC.intentText(F.enemies[0])), 'the telegraph says Greedy');
    MC.endTurn(F);
    h.eq(F.enemies[0].belly.length, 1, 'greedy: one item gulped on top of its move');
    // Armored adds Armor and hp
    F = mfight(['dummy'], ['gem']);
    const hp1 = F.enemies[0].maxHp;
    MC.giveAffix(F, 0, 'armored');
    h.ok(F.enemies[0].status.armor >= 1 && F.enemies[0].maxHp > hp1, 'armored: armor and +hp');
    h.ok(!MC.giveAffix(F, 0, 'armored'), 'an affix never stacks twice');
    // phase two at half hp, once
    F = mfight(['boss'], ['gem']);
    const bo = F.enemies[0];
    MC.damage(F, F.player, bo, 49, { pierce: true });
    h.ok(!bo.enraged, 'not yet at 51%');
    F.events.length = 0;
    MC.damage(F, F.player, bo, 1, { pierce: true });
    const er = F.events.filter(x => x.t === 'enrage');
    h.ok(bo.enraged && er.length === 1, 'enraged at 50%');
    h.eq(er[0].name, 'MAD', 'with its name'); h.eq(bo.status.str, 4, 'and its Strength');
    h.eq(bo.def.pattern.join(), '2,0', 'and its new pattern');
    F.events.length = 0;
    MC.damage(F, F.player, bo, 10, { pierce: true });
    h.eq(F.events.filter(x => x.t === 'enrage').length, 0, 'only once');
    // default phase two for a boss without a spec: +act+1 Strength
    F = mfight(['plain'], ['gem'], { act: 2 });
    MC.damage(F, F.player, F.enemies[0], 60, { pierce: true });
    h.ok(F.enemies[0].enraged && F.enemies[0].status.str === 2, 'default: ENRAGED, +2 Strength in act 2');
    // normals never enrage
    F = mfight(['hitter'], ['gem']);
    MC.damage(F, F.player, F.enemies[0], 60, { pierce: true });
    h.ok(!F.enemies[0].enraged, 'normals have no phase two');
  });
  MC.useDefs(null);

  // real data: affix rolls by act and escalation, every new enemy fights clean
  if (hasData) {
    const R = boot({ only: ['util', 'data', 'combat'] });
    const { DATA } = R;
    const C = R.COMBAT;
    h.test('monsters (data): affix rolls climb with the act and the escalation', () => {
      const avg = (id, act, fights) => {
        let n = 0;
        for (let s = 1; s <= 200; s++) n += DATA.affixRoll(R.U.rng(s), DATA.ENEMIES[id], act, fights).length;
        return n / 200;
      };
      h.eq(avg('rat', 1, 0), 0, 'act 1 normals start clean');
      h.eq(avg('slimeling', 3, 99), 0, 'minions never get one');
      h.ok(avg('mimic', 1, 0) >= 1, 'act 1 elites always get one');
      h.ok(avg('frostknight', 3, 0) >= 1.3, 'act 3 elites often get two');
      h.ok(avg('frostknight', 3, 24) > avg('frostknight', 3, 0), 'escalation adds more to elites');
      h.ok(avg('ironjaw', 2, 0) > avg('mimic', 1, 0), 'act 2 elites get more than act 1');
      h.ok(avg('rat', 1, 24) > avg('rat', 1, 0), 'escalation brings affixes to normals');
      h.ok(avg('wraith', 3, 0) > avg('imp', 2, 0), 'act 3 normals more often than act 2');
      for (let s = 1; s <= 60; s++) {
        const a = DATA.affixRoll(R.U.rng(s), DATA.ENEMIES.mimic, 3, 30);
        h.ok(new Set(a).size === a.length && a.every(x => DATA.AFFIXES[x]), `seed ${s}: distinct known affixes`);
        h.ok(!a.includes('greedy'), 'a gulper is never Greedy');
      }
      const F = C.newFight({ hp: 70, maxHp: 70, act: 3, bin: [], relics: [], claw: {} }, ['frostknight'], R.U.rng(3));
      h.ok(F.enemies[0].affix.length >= 1, 'newFight applies the roll: ' + F.enemies[0].affix.join('+'));
      const G = C.newFight({ hp: 70, maxHp: 70, act: 3, bin: [], relics: [], claw: {} }, ['frostknight'], R.U.rng(3));
      h.eq(G.enemies[0].affix.join(), F.enemies[0].affix.join(), 'deterministic per fight seed');
    });
    h.test('monsters (data): every gulper, bomber and layer fights through without breaking', () => {
      const bin = Object.keys(DATA.ITEMS).filter(id => DATA.ITEMS[id].rarity !== 'junk' && !DATA.ITEMS[id].bag).slice(0, 18);
      const users = Object.keys(DATA.ENEMIES).filter(id => (DATA.ENEMIES[id].moves || []).some(m => ['gulp', 'bomb', 'eggs', 'corrode', 'jam'].includes(m.k)));
      h.ok(users.length >= 8, 'eight or more enemies use the new moves: ' + users.join(','));
      h.ok(users.filter(id => DATA.ENEMIES[id].moves.some(m => m.k === 'gulp')).length >= 5, 'five or more eat items');
      for (const id of users) {
        const def = DATA.ENEMIES[id];
        const F = C.newFight({ hp: 999, maxHp: 999, act: def.act, bin: bin.map((x, i) => ({ uid: 'q' + i, id: x })), relics: [], claw: {} }, [id], R.U.rng(9));
        let ok = true;
        for (let t = 0; t < 14 && F.phase !== 'over'; t++) {
          try { C.endTurn(F); } catch (err) { ok = false; h.ok(false, id + ' threw ' + err.stack); break; }
          const all = F.bin.length + F.used.length + F.exhausted.length + F.stolen.length + (F.digested || []).length + F.purged.length + F.enemies.reduce((a, e) => a + (e.belly || []).length, 0);
          if (all < bin.length) { ok = false; h.ok(false, `${id}: an item vanished (${all} < ${bin.length})`); break; }
        }
        h.ok(ok && Number.isFinite(F.player.hp), `${id}: 14 turns clean, every item accounted for`);
      }
    });
  }
}

// ---------------------------------------------------------------- META: Tilt levels in a fight
{
  const T = boot({ only: ['util', 'data', 'combat'] });
  const TC = T.COMBAT, TD = T.DATA, TU = T.U;
  const run = (tilt, o) => Object.assign({ hp: 70, maxHp: 70, act: 1, relics: [], claw: { grabs: 3 }, bin: [], tilt, fights: 0 }, o || {});
  const fight = (tilt, ids, o) => TC.newFight(run(tilt, o), ids, TU.rng((o && o.seed) || 11));
  const normal = Object.keys(TD.ENEMIES).find(id => TD.ENEMIES[id].act === 1 && TD.ENEMIES[id].tier === 'normal' && (TD.ENEMIES[id].moves || []).some(m => m.k === 'attack'));
  const elite = Object.keys(TD.ENEMIES).find(id => TD.ENEMIES[id].act === 1 && TD.ENEMIES[id].tier === 'elite');
  const boss = Object.keys(TD.ENEMIES).find(id => TD.ENEMIES[id].act === 1 && TD.ENEMIES[id].tier === 'boss' && TD.ENEMIES[id].enrage !== false);
  const atk = (e) => (e.def.moves.find(m => m.k === 'attack') || {}).v;

  h.test('tilt: level 0 (and an old run with no tilt) changes nothing', () => {
    const a = fight(0, [normal, elite]), b = TC.newFight({ hp: 70, maxHp: 70, act: 1, relics: [], claw: { grabs: 3 }, bin: [], fights: 0 }, [normal, elite], TU.rng(11));
    h.eq(a.tiltLv, 0, 'F.tiltLv 0');
    h.eq(b.tiltLv, 0, 'no run.tilt reads as 0');
    h.eq(a.enemies.map(e => e.maxHp).join(), b.enemies.map(e => e.maxHp).join(), 'same hp');
    h.eq(a.enemies.map(e => e.affix.join('+')).join(), b.enemies.map(e => e.affix.join('+')).join(), 'same affixes');
  });
  h.test('tilt: Loose Coin adds hp, Sticky Joystick adds damage', () => {
    const a = fight(0, [normal]), b = fight(1, [normal]), c = fight(2, [normal]);
    h.near(b.enemies[0].maxHp, Math.round(a.enemies[0].maxHp * 1.1), 1, 'Tilt 1: +10% hp');
    h.eq(atk(b.enemies[0]), atk(a.enemies[0]), 'Tilt 1: attacks unchanged');
    h.ok(atk(c.enemies[0]) >= atk(a.enemies[0]) && Math.abs(atk(c.enemies[0]) - Math.round(atk(a.enemies[0]) * 1.1)) <= 1, `Tilt 2: +10% damage (${atk(a.enemies[0])} -> ${atk(c.enemies[0])})`);
    h.eq(c.enemies[0].maxHp, b.enemies[0].maxHp, 'Tilt 2 keeps Tilt 1 hp (cumulative)');
    h.ok(c.enemies[0].dmgMul > a.enemies[0].dmgMul, 'the bomb multiplier follows');
    h.ok(TD.DIFFICULTY.hp === 2.0 && TD.DIFFICULTY.dmg === 1.8, 'DATA.DIFFICULTY defaults untouched');
  });
  h.test('tilt: Bent Prong gives elites one more affix, normals none', () => {
    for (let s = 1; s <= 12; s++) {
      const a = fight(2, [elite, normal], { seed: s }), b = fight(3, [elite, normal], { seed: s });
      h.eq(b.enemies[0].affix.length, a.enemies[0].affix.length + 1, `seed ${s}: the elite has one more affix (${b.enemies[0].affix.join('+')})`);
      h.eq(b.enemies[1].affix.length, a.enemies[1].affix.length, `seed ${s}: the normal is left alone`);
      h.eq(new Set(b.enemies[0].affix).size, b.enemies[0].affix.length, `seed ${s}: no duplicate affix`);
    }
  });
  h.test('tilt: Hot Streak steps the hidden escalation every 2 fights', () => {
    const every = TD.DIFFICULTY.ramp.every;
    const a = fight(6, [normal], { fights: 4 }), b = fight(7, [normal], { fights: 4 });
    const steps = (n) => 1 + Math.min(Math.floor(4 / n), TD.DIFFICULTY.ramp.max) * TD.DIFFICULTY.ramp.hp;
    h.near(b.enemies[0].maxHp / a.enemies[0].maxHp, steps(2) / steps(every), 0.03, `4 fights in: ${Math.floor(4 / 2)} steps instead of ${Math.floor(4 / every)}`);
    const c = fight(6, [normal], { fights: 0 }), d = fight(7, [normal], { fights: 0 });
    h.eq(d.enemies[0].maxHp, c.enemies[0].maxHp, 'no fights yet: no difference');
    h.eq(TC.tiltScale({ tiltLv: 0 }).join(), '1,1', 'tiltScale at 0 is neutral');
  });
  h.test('tilt: Rigged bosses start with their phase two Strength', () => {
    const a = fight(9, [boss]), b = fight(10, [boss]);
    const R = TD.ENEMIES[boss].enrage;
    const want = R && R.str != null ? R.str : 1;
    h.eq((b.enemies[0].status.str || 0) - (a.enemies[0].status.str || 0), want, `+${want} Strength from the opening bell`);
    h.ok(!b.enemies[0].enraged, 'the transformation itself still waits for half hp');
    const n = fight(10, [normal]);
    h.ok(!(n.enemies[0].status.str > 0), 'normals get no rage');
  });
  h.test('tilt: summons mid-fight get the same scaling', () => {
    const a = fight(1, [normal]);
    const e = a.enemies[0];
    h.ok(e.maxHp > 0 && a.tiltLv === 1, 'fight at Tilt 1');
    h.ok(TC.tiltScale(a)[0] > 1, 'makeEnemy scale for summons > 1');
  });
}

// ---------- Bosses (DESIGN.md "Bosses"): each boss's signature trick ----------
if (hasData) {
  const B = boot({ only: ['util', 'data', 'combat'] });
  const BD = B.DATA, BC = B.COMBAT;
  const IDS = Object.keys(BD.ITEMS);
  const metal = IDS.filter(id => BD.ITEMS[id].rarity !== 'junk' && (BD.ITEMS[id].tags || []).includes('metal') && !BD.ITEMS[id].bag);
  const soft = IDS.filter(id => BD.ITEMS[id].rarity !== 'junk' && !(BD.ITEMS[id].tags || []).includes('metal') && !BD.ITEMS[id].bag && (BD.ITEMS[id].target || 'enemy') === 'self');
  const run = (bin, act) => ({ hp: 90, maxHp: 90, act: act || 1, relics: [], claw: { grabs: 3 }, gold: 50, bin: bin.map((id, i) => ({ uid: 'b' + i, id, plus: false })) });
  const bossFight = (id, bin, seed) => B.COMBAT.newFight(run(bin || metal.slice(0, 6).concat(soft.slice(0, 4)), BD.ENEMIES[id].act), [id], B.U.rng(seed || 7));
  // Make the boss's next action a harmless block so only the signature acts.
  const calm = (e) => { e.intent = { id: 'calm', name: 'Calm', k: 'block', v: 1, txt: 'calm' }; e.charged = 0; };
  const evK = (evs, k) => evs.filter(x => x.t === 'boss' && x.k === k);

  h.test('bosses: every boss has a signature, every elite and boss a taunt', () => {
    for (const id of ['hoard', 'smelter', 'glacius', 'prizemaster']) {
      const s = BD.ENEMIES[id].sig;
      h.ok(s && ['spill', 'heat', 'ice', 'rig'].includes(s.id) && s.name && s.sign && s.text, `${id}: a signature with name, sign and text`);
    }
    for (const e of Object.values(BD.ENEMIES)) if (e.tier === 'elite' || e.tier === 'boss') h.ok(typeof e.taunt === 'string' && e.taunt.length > 8 && e.taunt.indexOf(String.fromCharCode(0x2014)) < 0, `${e.id}: a taunt`);
    h.ok(BD.ITEMS.hoardcoin && BD.ITEMS.hoardcoin.rarity === 'junk' && BD.ITEMS.hoardcoin.fx.some(f => f.k === 'gold'), 'the Hoard\'s coins are junk that pays gold');
  });

  h.test('bosses: the signature is telegraphed a turn ahead on a cadence', () => {
    const F = bossFight('hoard');
    const e = F.enemies[0];
    const due = [];
    for (let a = 0; a < 9; a++) { e.acts = a; due.push(BC.sigNext(e) ? 1 : 0); }
    h.eq(due.join(''), '010010010', 'first on its 2nd action, then every 3rd');
    e.acts = 1;
    h.ok(/then spills a coin avalanche/.test(BC.intentText(e)), 'the intent text names it: ' + BC.intentText(e));
    e.acts = 2;
    h.ok(!/avalanche/.test(BC.intentText(e)), 'and only when it is due');
    const P = bossFight('prizemaster').enemies[0];
    const pd = []; for (let a = 0; a < 8; a++) { P.acts = a; pd.push(BC.sigNext(P) ? 1 : 0); }
    h.eq(pd.join(''), '01000000', 'the Prize Master rigs once on its own (then once per phase)');
    h.ok(!BC.sigNext({ alive: true, acts: 1, def: BD.ENEMIES.rat }), 'normals have none');
  });

  h.test('bosses: the Hoard spills coins that clutter the bin and pay gold', () => {
    const F = bossFight('hoard');
    const e = F.enemies[0];
    e.acts = 1; calm(e);
    const n0 = F.bin.length;
    const evs = BC.endTurn(F);
    const sp = evK(evs, 'spill');
    h.eq(sp.length, 1, 'a spill event');
    const coins = F.bin.filter(i => i.id === 'hoardcoin');
    h.eq(coins.length, BD.ENEMIES.hoard.sig.n, 'five coins land in the bin');
    h.ok(coins.every(i => i.junk && i.temp) && sp[0].items.length === coins.length, 'as temporary junk, listed on the event');
    h.ok(F.bin.length >= n0 + coins.length - 3, 'the bin is fuller');
    h.ok(evs.some(x => x.t === 'text' && x.str === 'MY COINS!'), 'the Hoard shouts');
    const g0 = BC.gold(F);
    BC.play(F, coins[0]);
    h.eq(BC.gold(F), g0 + 2, 'grabbing a coin out pays 2 gold');
    h.ok(F.exhausted.includes(coins[0]), 'and it is gone for the fight');
    // phase two: the pile leans toward it for good
    BC.damage(F, F.player, e, e.hp - Math.floor(e.maxHp / 2), { pierce: true });
    h.ok(e.enraged && F.lean === -1, 'phase two leans the cabinet toward the Hoard');
    h.ok(F.events.some(x => x.t === 'boss' && x.k === 'lean' && x.dir === -1), 'a lean event');
    // enraged, the next avalanche is bigger
    e.acts = 4; calm(e);
    const before = F.bin.filter(i => i.id === 'hoardcoin').length;
    BC.endTurn(F);
    h.eq(F.bin.filter(i => i.id === 'hoardcoin').length - before, BD.ENEMIES.hoard.sig.n + 2, 'an enraged spill pours two more');
    // a full cabinet: no room, no throw
    const G = bossFight('hoard', Array(34).fill(soft[0]));
    G.enemies[0].acts = 1; calm(G.enemies[0]);
    BC.endTurn(G);
    h.ok(G.bin.length <= BC.MAX_CABINET, 'never past the cabinet cap');
  });

  h.test('bosses: the Smelter turns metal red hot; each one delivered burns the hand through Block', () => {
    const F = bossFight('smelter');
    const e = F.enemies[0];
    e.acts = 1; calm(e);
    const evs = BC.endTurn(F);
    const hv = evK(evs, 'heat')[0];
    const hot = F.bin.filter(i => i.hot);
    h.ok(hv && F.heat === 1, 'a heat event and the cabinet is hot');
    h.eq(hot.length, Math.min(BD.ENEMIES.smelter.sig.n, metal.slice(0, 6).length), 'up to 4 metal items glow');
    h.ok(hot.every(i => (BD.ITEMS[i.id].tags || []).includes('metal') && !i.junk), 'only real metal items');
    h.ok(F.bin.some(i => i.id === 'slag' && hv.items.includes(i)), 'a lump of slag drips in');
    // a plain weapon (damage only), so the hand is the only thing that changes
    const pure = metal.find(id => (BD.ITEMS[id].fx || []).every(f => f.k === 'dmg' && f.v > 0) && (BD.ITEMS[id].target || 'enemy') === 'enemy');
    hot[0].id = pure; hot[1].id = pure;
    F.player.block = 0;
    const hp0 = F.player.hp;
    const evp = BC.play(F, hot[0]);
    h.ok(evK(evp, 'sear').length === 1 && evp.some(x => x.t === 'text' && x.str === 'RED HOT!'), 'the hand is seared');
    h.eq(F.player.hp, hp0 - BD.ENEMIES.smelter.sig.burn, '2 damage for the hot item');
    h.ok(!hot[0].hot, 'it cooled in the hand');
    F.player.block = 10;
    const hp1 = F.player.hp;
    BC.play(F, hot[1]);
    h.ok(F.player.hp === hp1 && F.player.block === 10 - BD.ENEMIES.smelter.sig.burn, 'Block soaks the burn');
    // the turn ends: everything cools
    calm(e); e.acts = 2;
    const ev2 = BC.endTurn(F);
    h.ok(evK(ev2, 'cool').length === 1 && !F.heat && ![...F.bin, ...F.used].some(i => i.hot), 'the cabinet cools as the turn ends');
  });

  h.test('bosses: Glacius ices the chute lip, then the rail; prizes crack it, a heavy one smashes it, the turn thaws it', () => {
    const F = bossFight('glacius', null, 3);
    const e = F.enemies[0];
    e.acts = 1; calm(e);
    h.eq(BC.sigInfo(e).part, 'lid', 'the first freeze is the chute lip');
    h.ok(/prize chute shut/.test(BC.intentText(e)), 'telegraphed by part: ' + BC.intentText(e));
    let evs = BC.endTurn(F);
    h.ok(evK(evs, 'ice')[0] && evK(evs, 'ice')[0].part === 'lid' && F.ice && F.ice.part === 'lid', 'the lid is iced');
    h.eq(F.ice.hp, BC.ICE_HP, 'two prizes to crack it');
    h.ok(BC.crackIce(F, false) && F.ice.hp === 1, 'one prize cracks it');
    h.eq(BC.crackIce(F, false), null, 'a second one breaks it');
    h.ok(!F.ice, 'the chute is open');
    // next one: the rail, and a heavy item smashes at once
    e.acts = 4; calm(e);
    h.eq(BC.sigInfo(e).part, 'rail', 'then the claw rail');
    evs = BC.endTurn(F);
    h.ok(F.ice && F.ice.part === 'rail', 'the rail is iced');
    h.ok(BC.breakIce(F) && !F.ice, 'a heavy delivery breaks it');
    e.acts = 7; calm(e);
    BC.endTurn(F);
    h.ok(F.ice && F.ice.part === 'lid', 'and around again to the lid');
    h.eq(BC.crackIce(F, true), null, 'a heavy prize smashes the lid outright');
    e.acts = 10; calm(e);
    BC.endTurn(F);
    h.ok(F.ice, 'iced again');
    e.acts = 11; calm(e);
    evs = BC.endTurn(F);
    h.ok(evK(evs, 'thaw').length === 1 && !F.ice, 'waiting a turn thaws it');
  });

  h.test('bosses: the Prize Master rigs one drop per phase and goes red at a quarter hp', () => {
    const F = bossFight('prizemaster', null, 5);
    const e = F.enemies[0];
    e.acts = 1; calm(e);
    let evs = BC.endTurn(F);
    h.ok(evK(evs, 'rig').length === 1 && F.rigged && F.rigged.drops === 1 && F.rigged.stage === 1, 'rigged for one drop');
    h.ok(BC.unrig(F) && !F.rigged, 'the hijacked drop spends it');
    h.ok(!BC.unrig(F), 'only once');
    e.acts = 3; calm(e);
    h.ok(!BC.sigNext(e), 'not again on its own');
    BC.damage(F, F.player, e, e.hp - Math.floor(e.maxHp / 2), { pierce: true });
    h.ok(e.enraged && BC.sigNext(e), 'phase two rigs the machine again (telegraphed at once)');
    calm(e);
    evs = BC.endTurn(F);
    h.ok(F.rigged && F.rigged.stage === 2 && !e.sigForce, 'stage two rig');
    calm(e);
    evs = BC.endTurn(F);
    h.ok(!F.rigged, 'a rig lasts one turn');
    const str0 = e.status.str || 0;
    BC.damage(F, F.player, e, e.hp - Math.floor(e.maxHp / 4), { pierce: true });
    h.ok(e.final && F.final && BC.sigNext(e), 'the final phase: lights red and one more rigged drop');
    h.eq((e.status.str || 0) - str0, 1, '+1 Strength');
    h.eq(F.events.filter(x => x.t === 'boss' && x.k === 'final').length, 1, 'one final event');
    BC.damage(F, F.player, e, 1, { pierce: true });
    h.eq(F.events.filter(x => x.t === 'boss' && x.k === 'final').length, 1, 'never twice');
  });

  h.test('bosses: 24 turns of every boss with random plays stay clean', () => {
    for (const id of ['hoard', 'smelter', 'glacius', 'prizemaster']) {
      const F = bossFight(id, null, 11);
      const r = B.U.rng(B.U.hashStr(id));
      let err = null;
      try {
        for (let turn = 0; turn < 24 && F.phase !== 'over'; turn++) {
          while (F.phase === 'player' && F.player.grabs > 0 && BC.useGrab(F)) {
            for (let k = r.int(0, 2); k > 0 && F.bin.length && F.phase === 'player'; k--) BC.play(F, F.bin[r.int(0, F.bin.length - 1)], 0);
            if (F.ice && r() < 0.3) BC.crackIce(F, r() < 0.3);
            if (F.rigged && r() < 0.5) BC.unrig(F);
            BC.grabDone(F, 1);
          }
          if (F.phase === 'player') BC.endTurn(F);
          F.player.hp = Math.max(F.player.hp, 40);
          const bad = [F.player, ...F.enemies].find(u => !Number.isFinite(u.hp) || u.hp < 0);
          if (bad) { err = 'bad hp'; break; }
          if (F.bin.length > BC.MAX_CABINET) { err = 'bin over cap ' + F.bin.length; break; }
        }
      } catch (e) { err = e.stack; }
      h.ok(!err, `${id}: clean (${err || 'ok'})`);
    }
  });
}

// ---------- round 3: Lucky Lou's Luck, bait, hot items, materials, tickets
// (DESIGN.md "Lucky Lou and the synergy pass")
if (hasData) {
  const L3 = boot({ only: ['util', 'data', 'combat'] });
  const C = L3.COMBAT, D = L3.DATA, U3 = L3.U;
  const lrun = (bin, relics, extra) => Object.assign({ hp: 70, maxHp: 70, act: 1, char: 'gambler', relics: relics || [], claw: { grabs: 3 },
    bin: bin.map((id, i) => ({ uid: 'l' + i, id })) }, extra || {});
  const lfight = (bin, relics, extra, enc, seed) => {
    const F = C.newFight(lrun(bin, relics, extra), enc || ['rat'], U3.rng(seed || 7));
    for (const e of F.enemies) { e.hp = e.maxHp = 500; e.status = {}; e.block = 0; }
    F.events.length = 0;
    return F;
  };
  const grabOf = (F, ids) => {
    C.useGrab(F);
    for (const id of ids) { const i = F.bin.find(b => b.id === id && F.grab.insts.indexOf(b) < 0); if (i && F.phase === 'player') C.play(F, i); }
    return C.grabDone(F, ids.length);
  };
  const luck = (F) => F.player.status.luck | 0;
  const BIN = ['femur', 'femur', 'femur', 'crisp_apple', 'bone_dice', 'bone_dice', 'pocket_die', 'poker_chip', 'stale_bread'];

  h.test('round 3: the meter is Lucky Lou\'s gift (or the Rabbit\'s Foot)', () => {
    h.eq(lfight(BIN).luckK, 1, 'the gambler has the meter');
    h.eq(lfight(BIN, [], { char: 'knight' }).luckK, 0, 'the knight does not');
    h.eq(lfight(BIN, ['rabbits_foot'], { char: 'knight' }).luckK, 1, 'the Rabbit\'s Foot gives it to anyone');
    h.eq(lfight(BIN, ['rabbits_foot']).luckK, 2, 'and doubles it for Lou');
    h.eq(lfight(BIN, [], { clawType: 'hook' }).clawType, 'hook', 'F.clawType comes from the run');
    h.eq(lfight(BIN).clawType, 'classic', 'the classic claw by default');
  });

  h.test('round 3: an empty grab fills the meter, a double grab cashes it out', () => {
    const F = lfight(BIN);
    const ev = grabOf(F, []);
    h.eq(luck(F), 2, 'an empty grab: +2 Luck (BAD BEAT)');
    h.ok(ev.some(e => e.t === 'text' && e.str === 'BAD BEAT') && ev.some(e => e.t === 'status' && e.s === 'luck' && e.v === 2), 'with its label and a status event');
    grabOf(F, []);
    h.eq(luck(F), 4, 'another whiff: 4');
    const hp0 = F.enemies[0].hp;
    const ev2 = grabOf(F, ['femur', 'crisp_apple']);
    const cash = ev2.find(e => e.t === 'luck' && e.k === 'cash');
    h.ok(cash && cash.v === 4 && cash.dmg === 8 && !cash.jackpot, `a double grab cashes out 4 Luck for 8 [${JSON.stringify(cash)}]`);
    h.eq(luck(F), 0, 'the meter is empty after');
    h.eq(F.enemies[0].hp, hp0 - 7 - 8, 'the femur hit for 7, the cash out for 8');
    h.eq(F.stats.cash, 4, 'the best cash out is kept for stats');
    const K = lfight(BIN, [], { char: 'knight' });
    grabOf(K, []);
    h.eq(luck(K), 0, 'the knight\'s whiffs are just whiffs');
    // a jackpot (3+ items) pays x1.5
    const J = lfight(BIN);
    C.addLuck(J, 6);
    const ev3 = grabOf(J, ['femur', 'femur', 'crisp_apple']);
    const c3 = ev3.find(e => e.t === 'luck' && e.k === 'cash');
    h.ok(c3 && c3.jackpot && c3.dmg === 18, `a jackpot pays 6 x 2 x 1.5 = 18 [${c3 && c3.dmg}]`);
    // High Roller: 3 per Luck
    const HR = lfight(BIN, ['high_roller']);
    C.addLuck(HR, 5);
    const ev4 = grabOf(HR, ['femur', 'crisp_apple']);
    h.ok(ev4.some(e => e.t === 'luck' && e.k === 'cash' && e.dmg === 15), 'High Roller: 5 Luck for 15');
    h.ok(ev4.some(e => e.t === 'proc' && e.id === 'high_roller'), 'with its proc');
    // the cap
    const M = lfight(BIN);
    C.addLuck(M, 25);
    h.eq(luck(M), C.LUCK.max, 'Luck caps at ' + C.LUCK.max);
    C.addLuck(M, 1);
    h.eq(luck(M), C.LUCK.max, 'and stays there (MAX LUCK)');
    const P = lfight(['lucky_clover', 'lucky_clover', 'femur']);
    P.player.status.luck = 9;
    C.play(P, P.bin.find(b => b.id === 'lucky_clover'));
    C.play(P, P.bin.find(b => b.id === 'lucky_clover'));
    h.eq(luck(P), C.LUCK.max, 'item Luck respects the cap too');
  });

  h.test('round 3: near misses, Snake Eyes and the Pity Timer', () => {
    const F = lfight(BIN);
    C.nearMiss(F);
    h.eq(luck(F), 1, 'a near miss: +1 Luck');
    const K = lfight(BIN, [], { char: 'knight' });
    C.nearMiss(K);
    h.eq(luck(K), 0, 'nothing for the knight');
    const S = lfight(BIN, ['snake_eyes', 'pity_timer']);
    const g0 = S.player.grabs;
    const ev = grabOf(S, []);
    const roll = ev.find(e => e.t === 'proc' && e.id === 'snake_eyes');
    h.ok(roll && /\d\+\d/.test(roll.text), `Snake Eyes rolls the dice on the first whiff [${roll && roll.text}]`);
    h.ok(S.enemies.some(e => e.hp < 500), 'and someone takes the total');
    h.eq(luck(S), 3, 'Lou\'s 2 plus the Pity Timer\'s 1');
    const ev2 = grabOf(S, []);
    h.ok(!ev2.some(e => e.t === 'proc' && e.id === 'snake_eyes'), 'only the first whiff each turn');
    h.ok(S.player.grabs <= g0, 'grabs never go up past the start (doubles only refund the one spent)');
  });

  h.test('round 3: dice roll twice with Luck, the bandit reads it', () => {
    let lucky = 0, plain = 0;
    for (let s = 1; s <= 150; s++) {
      for (const withLuck of [false, true]) {
        const F = lfight(['bone_dice', 'femur'], [], null, null, s);
        if (withLuck) F.player.status.luck = 3;
        const hp0 = F.enemies[0].hp;
        const ev = C.play(F, F.bin.find(b => b.id === 'bone_dice'));
        const d = hp0 - F.enemies[0].hp;
        if (withLuck) { lucky += d; if (s === 1) h.ok(ev.some(e => e.t === 'text' && e.str === 'LUCKY ROLL'), 'LUCKY ROLL shows'); } else plain += d;
      }
    }
    h.ok(lucky > plain * 1.12, `Luck lifts the dice average (${(plain / 150).toFixed(2)} -> ${(lucky / 150).toFixed(2)})`);
    const B = lfight(['one_armed_bandit', 'femur'], [], null, ['dummy']);
    B.player.status.luck = 5;
    h.eq(C.previewDamage(B, 'one_armed_bandit'), 4 + 15, 'the One-Armed Bandit previews 4 + 3 per Luck');
    const hp0 = B.enemies[0].hp;
    C.play(B, B.bin.find(b => b.id === 'one_armed_bandit'));
    h.eq(hp0 - B.enemies[0].hp, 19, 'and deals it');
    h.eq(luck(B), 5, 'the Luck stays put');
  });

  h.test('round 3: bait hurts whoever swallows it', () => {
    const F = lfight(['femur', 'crisp_apple', 'poison_pill', 'stale_bread', 'bone_dice'], ['heartburn'], null, ['trashpanda']);
    const e = F.enemies[0];
    const ev = C.gulp(F, e, 1, 'shiny');
    h.ok(ev.some(x => x.t === 'binEat' && x.inst.id === 'poison_pill'), 'the monster goes straight for the pill (lure)');
    h.ok((e.status.poison | 0) >= 8 + 2, `the eater is poisoned (${e.status.poison})`);
    h.eq(e.hp, 500 - 6, 'and takes 6');
    h.ok((e.status.burn | 0) >= 4 && ev.some(x => x.t === 'proc' && x.id === 'heartburn'), 'Heartburn: every meal burns');
    h.ok(F.used.some(i => i.id === 'poison_pill') && !e.belly.length, 'the pill is spent, not held');
    const P = lfight(['femur', 'hot_potato', 'stale_bread'], [], null, ['trashpanda']);
    C.gulp(P, P.enemies[0], 1);
    h.ok((P.enemies[0].status.burn | 0) >= 10, 'a swallowed Hot Potato: 10 Burn');
  });

  h.test('round 3: a Hot Potato left in the bin burns its holder', () => {
    const F = lfight(['hot_potato', 'femur', 'femur']);
    const hp0 = F.player.hp;
    const ev = C.endTurn(F);
    h.ok(ev.some(e => e.t === 'text' && e.str === 'HOT POTATO!'), 'HOT POTATO!');
    h.ok(F.player.hp <= hp0 - 2, 'the burn ticks at once');
    const G = lfight(['femur', 'hot_potato', 'femur']);
    C.useGrab(G); C.play(G, G.bin.find(b => b.id === 'hot_potato')); C.grabDone(G, 1);
    const ev2 = C.endTurn(G);
    h.ok(!ev2.some(e => e.t === 'text' && e.str === 'HOT POTATO!'), 'grabbed out in time: no burn');
  });

  h.test('round 3: materials, tickets and claw relics reach the relics', () => {
    const F = lfight(BIN, ['blasting_cap', 'broken_mirror', 'sharp_shards']);
    const ev = C.material(F, 'blast', { uid: 'x', id: 'firecracker' });
    h.ok(F.enemies.every(e => (e.status.burn | 0) >= 3) && F.player.block >= 5, 'a bomb in the bin: Burn on ALL and Block');
    h.ok(ev.some(e => e.t === 'proc' && e.id === 'blasting_cap'), 'with the relic\'s proc');
    const s0 = F.stats.shattered;
    C.material(F, 'crack', { uid: 'y', id: 'crystal_dice' });
    h.eq(luck(F), 1, 'a crack: the Broken Mirror gives Luck');
    const hp0 = F.enemies[0].hp;
    C.material(F, 'shatter', { uid: 'z', id: 'crystal_dice' });
    h.eq(F.stats.shattered, s0 + 1, 'a shatter in the bin counts as a shatter');
    h.ok(F.enemies[0].hp < hp0 && luck(F) === 2, 'onShatter relics fire (Sharp Shards, the Mirror)');
    const T = lfight(['femur', 'rusty_sword', 'crisp_apple'], ['ticket_roll']);
    grabOf(T, ['femur', 'rusty_sword']);   // Crossed Blades
    h.ok(T.stats.tix >= 2, `Ticket Roll prints tickets on a combo (${T.stats.tix})`);
    const M = lfight(['rusty_sword', 'femur'], ['lodestone'], { clawType: 'magnet' });
    const b0 = M.player.block;
    grabOf(M, ['rusty_sword']);
    h.ok(M.player.block >= b0 + 3, 'the Lodestone pays one metal item on the Magnet Crane');
  });

  h.test('round 3: Lucky Seven and a secret combo fire in a real fight', () => {
    const F = lfight(['bone_dice', 'femur', 'crisp_apple']);
    F.player.status.luck = 7;
    const ev = grabOf(F, ['bone_dice', 'femur']);
    h.ok(ev.some(e => e.t === 'combo' && e.id === 'lucky_seven' && e.tier === 3), 'Lucky Seven on exactly 7 Luck');
    h.ok(ev.some(e => e.t === 'luck' && e.k === 'cash' && e.v === 7), 'and the 7 Luck cash out after it');
    const G = lfight(['lucky_coin', 'lucky_penny', 'arcade_token', 'femur']);
    const ev2 = grabOf(G, ['lucky_coin', 'lucky_penny', 'arcade_token']);
    h.ok(ev2.some(e => e.t === 'combo' && e.id === 'midas_touch'), 'Midas Touch');
  });

  h.test('round 3: 30 turns of Lucky Lou with every new relic stay clean', () => {
    const R3 = ['snake_eyes', 'pity_timer', 'dealers_visor', 'lucky_ticket', 'lucky_cat', 'wheel_of_fortune', 'rabbits_foot', 'high_roller', 'ticket_roll', 'gacha_charm', 'heartburn', 'broken_mirror', 'blasting_cap', 'lodestone', 'sand_pail', 'big_catch'];
    const bin = D.CHARACTERS.gambler.bin.concat(['poison_pill', 'hot_potato', 'golden_dice', 'one_armed_bandit', 'roulette_wheel', 'marked_deck']);
    for (const claw of ['classic', 'magnet', 'scoop', 'hook']) {
      const F = C.newFight(lrun(bin, R3, { clawType: claw, hp: 200, maxHp: 200 }), ['trashpanda', 'rat'], U3.rng(U3.hashStr(claw)));
      const r = U3.rng(3);
      let err = null;
      try {
        for (let turn = 0; turn < 30 && F.phase !== 'over'; turn++) {
          while (F.phase === 'player' && F.player.grabs > 0 && C.useGrab(F)) {
            const n = r.int(0, 3);
            for (let k = 0; k < n && F.bin.length && F.phase === 'player'; k++) C.play(F, F.bin[r.int(0, F.bin.length - 1)], 0);
            if (r() < 0.2) C.nearMiss(F);
            if (r() < 0.1) C.material(F, ['crack', 'shatter', 'fuse', 'blast'][r.int(0, 3)], F.bin[0]);
            C.grabDone(F, n);
          }
          if (F.phase === 'player') C.endTurn(F);
          F.player.hp = Math.max(F.player.hp, 60);
          if ((F.player.status.luck | 0) > C.LUCK.max) { err = 'luck over the cap'; break; }
          if ([F.player, ...F.enemies].some(u => !Number.isFinite(u.hp) || u.hp < 0)) { err = 'bad hp'; break; }
        }
      } catch (e) { err = e.stack; }
      h.ok(!err && !F.hookErrors.length, `${claw}: clean (${err || F.hookErrors.join(' | ') || 'ok'})`);
    }
  });
}

h.done();
