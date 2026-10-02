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
    const known = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape', 'gulp', 'bomb', 'corrode', 'jam', 'eggs'].concat(C.BEST_KINDS || [], C.FAM_KINDS || [], C.DEP_KINDS || []);
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
    // these pin each relic's own numbers; the round 6 set bonuses have their own block
    if (!o.sets) run.noSets = true;
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
    // two shields: the round 12 rat (DATA.DIFFICULTY.dmg 2.6+) bites through a single one, leaving no Block to keep
    const F = mk(['tower_shield', 'tower_shield', 'rusty_sword'], ['castle_walls', 'battering_ram']);
    pid(F, 'tower_shield'); pid(F, 'tower_shield');
    const b0 = F.player.block, blocked0 = F.stats.blocked;
    h.ok(F.enemies[0].intent && F.enemies[0].intent.v < b0, `the rat's bite (${F.enemies[0].intent && F.enemies[0].intent.v}) leaves Block to keep (${b0})`);
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
      if (c.ctx && c.ctx.pet) F.petId = c.ctx.pet;   // a pet combo needs its pet along (round 7, EVOLVE)
      C.useGrab(F);
      if (c.ctx && c.ctx.perfect) { C.techOn(F, true); C.techCab(F, 'perfect', c.ctx.perfect); }   // a PERFECT grab (round 17, TECH)
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
    h.ok(TD.DIFFICULTY.hp === 3.1 && TD.DIFFICULTY.dmg === 2.6 && TD.DIFFICULTY.tierDmg.elite === 1.5, 'DATA.DIFFICULTY defaults untouched (the round 12 balance pass values)');
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

// ---------- Feel (round 4): enemy Armor is capped ----------
h.test('feel: enemy Armor stops at ARMOR_MAX, the player\'s does not', () => {
  COMBAT.useDefs(STUB);
  const cap = COMBAT.ARMOR_MAX;
  h.eq(cap, 8, 'the cap is 8');
  let F = COMBAT.newFight({ hp: 70, maxHp: 70, act: 1, bin: [], relics: [], claw: {} }, ['dummy'], U.rng(5));
  const e = F.enemies[0];
  for (let i = 0; i < 20; i++) COMBAT.status(F, e, 'armor', 2);
  h.eq(e.status.armor, cap, 'twenty Tempers stop at the cap');
  h.eq(COMBAT.status(F, e, 'armor', 3), 0, 'a gain at the cap adds nothing');
  h.eq(COMBAT.status(F, e, 'armor', -3), -3, 'it can still come down');
  COMBAT.status(F, F.player, 'armor', 20);
  h.eq(F.player.status.armor, 20, 'the player is not capped');
});
if (hasData) {
  const L4 = boot({ only: ['util', 'data', 'combat'] });
  const C4 = L4.COMBAT;
  h.test('feel: the Frozen Knight tempers for 120 turns and never passes the Armor cap', () => {
    const F = C4.newFight({ hp: 9999, maxHp: 9999, act: 3, bin: [], relics: [], claw: { grabs: 3 } }, ['frostknight'], L4.U.rng(11));
    const e = F.enemies[0];
    e.hp = e.maxHp = 1e6;
    let top = 0;
    for (let t = 0; t < 120 && F.phase !== 'over'; t++) {
      C4.endTurn(F);
      F.player.hp = F.player.maxHp;
      top = Math.max(top, e.status.armor | 0);
    }
    h.ok(top > 0 && top <= C4.ARMOR_MAX, `armor peaked at ${top} (cap ${C4.ARMOR_MAX})`);
    const G = C4.newFight({ hp: 70, maxHp: 70, act: 1, bin: [], relics: [], claw: {} }, ['frostknight'], L4.U.rng(12));
    const g = G.enemies[0];
    g.status.armor = C4.ARMOR_MAX;
    C4.giveAffix(G, g, 'armored');
    h.ok((g.status.armor | 0) <= C4.ARMOR_MAX, 'Armored at the cap stays at the cap');
  });
}

// ================================================================ ENDLESS (DESIGN.md "Endless and mutators")
{
  const E5 = boot({ only: ['util', 'data', 'combat'] });
  const C5 = E5.COMBAT, D5 = E5.DATA, U5 = E5.U;
  const bin5 = ['rusty_sword', 'rusty_sword', 'dented_shield', 'dented_shield', 'rusty_sword', 'dented_shield'].map((id, i) => ({ uid: 'e' + i, id }));
  const run5 = (extra) => Object.assign({ hp: 80, maxHp: 80, act: 1, bin: bin5, relics: [], claw: { grabs: 3 }, fights: 0, seed: 5 }, extra || {});
  const atkOf = (e) => (e.def.moves || []).filter(m => m.k === 'attack' && m.v != null).map(m => m.v);

  h.test('endless: the loop lifts every enemy (hp and hits), summons too', () => {
    const F0 = C5.newFight(run5(), ['rat'], U5.rng(11));
    h.ok(F0.loop === 0 && F0.mut === null && F0.mix === null, 'a plain run: no loop, no mutators');
    for (const loop of [1, 2, 3, 4]) {
      const act = D5.endlessAct(loop), s = D5.endlessScale(loop, act);
      const Fa = C5.newFight(run5({ act }), ['rat'], U5.rng(11));
      const Fb = C5.newFight(run5({ act, endless: { loop } }), ['rat'], U5.rng(11));
      h.eq(Fb.loop, loop, `loop ${loop}: F.loop`);
      const a = Fa.enemies[0], b = Fb.enemies[0];
      const affixHp = b.affix.reduce((k, id) => k * (1 + ((D5.AFFIXES[id] || {}).hp || 0.1)), 1) / a.affix.reduce((k, id) => k * (1 + ((D5.AFFIXES[id] || {}).hp || 0.1)), 1);
      h.near(b.maxHp / (a.maxHp * affixHp), s.hp, 0.12 * s.hp, `loop ${loop}: hp x${s.hp.toFixed(2)}`);
      const ka = atkOf(a), kb = atkOf(b);
      h.ok(kb.length && kb.every((v, i) => Math.abs(v - Math.max(1, Math.round(ka[i] * s.dmg))) <= Math.ceil(ka[i] * 0.05) + 1), `loop ${loop}: attacks x${s.dmg.toFixed(2)} (${ka} -> ${kb})`);
      h.ok(b.affix.length >= Math.min(3, a.affix.length + s.normalAffix) - 0 && b.affix.length >= s.normalAffix, `loop ${loop}: ${s.normalAffix} extra affixes on a normal (${b.affix})`);
    }
    // a summon made mid fight carries the lift too (makeEnemy)
    h.ok(C5.endlessScaleOf({ loop: 2, act: 2 }).hp === D5.endlessScale(2, 2).hp, 'endlessScaleOf reads the loop and the act');
  });

  h.test('endless: bosses rage from the bell, elites later, and borrow another trick', () => {
    const b1 = C5.newFight(run5({ endless: { loop: 1, mix: 'smelter' } }), ['hoard'], U5.rng(3)).enemies[0];
    h.ok(!b1.enraged, 'loop 1: the boss waits for half hp as usual');
    h.eq(b1.def.sig.id, 'heat', 'loop 1: the Hoard learned the Furnace Blast');
    h.eq(b1.borrowed, 'smelter', 'it knows who it borrowed from');
    h.eq(D5.ENEMIES.hoard.sig.id, 'spill', 'the data is never touched');
    h.ok(b1.affix.length >= 1, 'loop 1: a boss carries an extra affix');
    const F2 = C5.newFight(run5({ endless: { loop: 2, mix: 'glacius' } }), ['hoard'], U5.rng(3));
    const b2 = F2.enemies[0];
    h.ok(b2.enraged && (b2.status.str | 0) > 0, 'loop 2: phase two and its Strength from the bell');
    h.ok(F2.events.some(e => e.t === 'enrage' && e.idx === 0), 'the roar plays at the start');
    h.eq(b2.def.sig.id, 'ice', 'loop 2: Glacius\' Deep Freeze');
    const hp0 = b2.hp;
    C5.damage(F2, F2.player, b2, Math.ceil(b2.maxHp * 0.6), { pierce: true });
    h.ok(F2.events.filter(e => e.t === 'enrage').length === 1, 'the half hp transformation never fires again');
    h.ok(b2.hp < hp0, 'it still takes damage');
    const el3 = C5.newFight(run5({ act: 2, endless: { loop: 3 } }), ['ironjaw'], U5.rng(3)).enemies[0];
    const el4 = C5.newFight(run5({ act: 1, endless: { loop: 4 } }), ['mimic'], U5.rng(3)).enemies[0];
    h.ok(!el3.enraged && el4.enraged, 'elites rage from the bell from loop 4');
    // every boss with every other boss's trick plays 24 clean turns
    const bosses = Object.keys(D5.ENEMIES).filter(id => D5.ENEMIES[id].tier === 'boss' && D5.ENEMIES[id].sig);
    for (const id of bosses) for (const mix of bosses) {
      if (mix === id) continue;
      const act = D5.ENEMIES[id].act || 1;
      const F = C5.newFight(run5({ act, hp: 999, maxHp: 999, endless: { loop: 2, mix } }), [id], U5.rng(id.length * 7 + mix.length));
      let bad = 0;
      for (let turn = 0; turn < 24 && F.phase !== 'over'; turn++) {
        try {
          if (F.bin.length) C5.play(F, F.bin[0], 0);
          C5.endTurn(F);
        } catch (err) { bad++; }
        F.events.length = 0;
        if (F.enemies.some(e => !Number.isFinite(e.hp)) || !Number.isFinite(F.player.hp)) bad++;
      }
      h.eq(bad, 0, `${id} with ${mix}'s trick: 24 clean turns`);
    }
  });

  h.test('endless: mutators in the fight (grabs, half hits, affixes, rules), gone without them', () => {
    const F0 = C5.newFight(run5(), ['rat'], U5.rng(4));
    const Fd = C5.newFight(run5({ muts: ['double'] }), ['rat'], U5.rng(4));
    h.eq(Fd.player.grabsMax, F0.player.grabsMax * 2, 'Double Grabs: twice the grabs');
    h.eq(Fd.player.grabs, Fd.player.grabsMax, 'from the first turn');
    const e0 = F0.enemies[0], ed = Fd.enemies[0];
    e0.status = {}; ed.status = {}; e0.block = ed.block = 0;
    const l0 = C5.damage(F0, F0.player, e0, 10), ld = C5.damage(Fd, Fd.player, ed, 10);
    h.eq(l0, 10, 'a plain hit');
    h.eq(ld, 5, 'Half Damage: the player hits for half');
    const hit = C5.damage(Fd, ed, Fd.player, 8);
    h.eq(hit, 8, 'monsters still hit in full');
    const Fh = C5.newFight(run5({ muts: ['hungry'] }), ['rat', 'hoard'], U5.rng(4));
    h.ok(Fh.enemies[0].affix.includes('greedy'), 'Hungry Hungry: the rat is Greedy');
    h.ok(!Fh.enemies[1].affix.includes('greedy'), 'a gulper is never Greedy on top');
    const Ff = C5.newFight(run5({ muts: ['fever'] }), ['rat'], U5.rng(4));
    h.ok(Ff.rules.comboTwice >= 1 && Ff.ruleSrc.comboTwice, 'Jackpot Fever: combos fire twice');
    h.ok(Ff.enemies[0].affix.includes('hasty'), 'and the monsters are Hasty');
    const Fp = C5.newFight(run5({ muts: [] }), ['rat'], U5.rng(4));
    h.ok(Fp.mut === null && !Fp.rules.comboTwice && Fp.player.grabsMax === F0.player.grabsMax && !Fp.enemies[0].affix.includes('hasty'), 'a run without mutators is untouched');
    const Fj = C5.newFight(run5({ muts: ['nope', 42] }), ['rat'], U5.rng(4));
    h.ok(Fj.mut === null, 'unknown mutators are ignored');
  });
}

// ---------------------------------------------------------------- BESTIARY (round 4): the machine tricks
{
  const Bx = boot({ only: ['util', 'data', 'combat'] });
  const BC = Bx.COMBAT, BD = Bx.DATA, BU = Bx.U;
  const NEW = ['tickler', 'jelly', 'barker', 'magbat', 'mole', 'dozer', 'ghost', 'collector'];
  const realItems = Object.keys(BD.ITEMS).filter(id => BD.ITEMS[id].rarity !== 'junk' && !BD.ITEMS[id].bag);
  const metal = realItems.filter(id => (BD.ITEMS[id].tags || []).includes('metal'));
  const bin18 = realItems.slice(0, 14).concat(metal.slice(0, 4));
  const mk = (id, o) => {
    o = o || {};
    const def = BD.ENEMIES[id];
    const run = { hp: 999, maxHp: 999, act: def.act, relics: [], claw: { grabs: 3 }, bin: (o.bin || bin18).map((x, i) => ({ uid: 'b' + i, id: x, plus: !!o.plus })) };
    return BC.newFight(run, [id], BU.rng(o.seed || 5));
  };
  const act = (F, k) => { const e = F.enemies[0]; e.intent = e.def.moves.find(m => m.k === k) || e.intent; e.acts = 1; return BC.endTurn(F); };
  const evs = (list, t) => (list || []).filter(e => e.t === t);
  const count = (F) => F.bin.length + F.used.length + F.exhausted.length + F.stolen.length + (F.digested || []).length + F.purged.length + (F.buried || []).length + F.enemies.reduce((a, e) => a + (e.belly || []).length, 0);

  h.test('bestiary: eight new enemies, one new trick each, telegraphed', () => {
    h.eq((BC.BEST_KINDS || []).length, 7, 'seven new move kinds (plus the rival claw)');
    for (const id of NEW) h.ok(!!BD.ENEMIES[id], id + ' exists');
    const kinds = new Set();
    for (const id of NEW) for (const m of BD.ENEMIES[id].moves) if (BC.BEST_KINDS.includes(m.k)) kinds.add(m.k);
    for (const k of BC.BEST_KINDS) h.ok(kinds.has(k), 'kind ' + k + ' is used by a new enemy');
    h.ok(BD.ENEMIES.collector.rival && NEW.filter(id => BD.ENEMIES[id].rival).length === 1, 'only the Claw Collector brings its own claw');
    for (const id of NEW) {
      const F = mk(id), e = F.enemies[0];
      for (const m of e.def.moves) {
        e.intent = m;
        const s = BC.intentText(e);
        h.ok(typeof s === 'string' && s.length > 4 && !/undefined|NaN|\?\?\?/.test(s), `${id}.${m.id} telegraph: "${s}"`);
      }
    }
    const Fc = mk('collector');
    h.ok(/claw grabs your rarest item/.test(BC.intentText(Fc.enemies[0])), 'the rival claw rides on every telegraph: ' + BC.intentText(Fc.enemies[0]));
  });

  h.test('bestiary: each trick emits its bin event', () => {
    const want = { tickle: 'binTickle', glue: 'binGlue', ceiling: 'binCeiling', plow: 'binPlow', vanish: 'binVanish', bury: 'binBury', wheel: 'binWheel' };
    const who = { tickle: 'tickler', glue: 'jelly', ceiling: 'magbat', plow: 'dozer', vanish: 'ghost', bury: 'mole', wheel: 'barker' };
    for (const k in want) {
      const F = mk(who[k]);
      const out = act(F, k);
      const e = evs(out, want[k]);
      h.ok(e.length >= 1 && e[0].idx === 0, `${who[k]} ${k} -> ${want[k]}`);
      if (k === 'tickle' || k === 'glue') h.eq(e[0].turns, 1, k + ' lasts one turn');
      if (k === 'ceiling') h.ok(e[0].insts.length === F.bin.filter(i => (BD.ITEMS[i.id].tags || []).includes('metal')).length && e[0].insts.length >= 4 && e[0].insts.every(i => (BD.ITEMS[i.id].tags || []).includes('metal')), 'the lid takes the metal (and only the metal)');
      if (k === 'vanish') h.ok(e[0].insts.length === 3 && new Set(e[0].insts.map(i => i.uid)).size === 3 && e[0].insts.every(i => F.bin.includes(i)), 'three different items go invisible (they stay in the bin)');
    }
    const Fn = mk('magbat', { bin: realItems.filter(id => !(BD.ITEMS[id].tags || []).includes('metal')).slice(0, 8) });
    const outN = act(Fn, 'ceiling');
    h.ok(!evs(outN, 'binCeiling').length && evs(outN, 'text').some(t => t.str === 'NO METAL'), 'no metal: nothing floats, it says so');
  });

  h.test('bestiary: the Mole buries items, the claw digs them up, its death gives them back', () => {
    const F = mk('mole');
    const n0 = count(F);
    const out = act(F, 'bury');
    const b = evs(out, 'binBury');
    h.ok(b.length === 1 && F.buried.length === 1 && F.buried[0].inst === b[0].inst && !F.bin.includes(b[0].inst), 'one item goes under the floor (out of the bin)');
    h.eq(count(F), n0, 'every item accounted for');
    h.eq(BC.bestUnbury(F, b[0].inst), 'bin', 'digging it up puts it back in the bin');
    h.ok(F.bin.includes(b[0].inst) && !F.buried.length, 'back in the bin, the floor is empty');
    h.eq(BC.bestUnbury(F, b[0].inst), null, 'a second dig finds nothing');
    act(F, 'bury'); act(F, 'bury');
    h.ok(F.buried.length >= 1, 'buried again');
    const buried = F.buried.map(x => x.inst);
    const d = [];
    const e = F.enemies[0];
    const res = BC.damage(F, F.player, e, 9999, { pierce: true });
    h.ok(res > 0 && !e.alive, 'the Mole goes down');
    const un = evs(F.events, 'binUnbury');
    h.ok(un.length === 1 && un[0].insts.length === buried.length && buried.every(i => F.bin.includes(i) || F.used.includes(i)) && !F.buried.length, 'its death coughs every buried item back up');
    // the floor: never below BEST_FLOOR real items
    const Fs = mk('mole', { bin: realItems.slice(0, 5) });
    for (let i = 0; i < 6; i++) act(Fs, 'bury');
    const real = Fs.bin.concat(Fs.used).filter(i => !BC.isJunk(i)).length;
    h.ok(real >= BC.BEST_FLOOR, `burying never takes you below ${BC.BEST_FLOOR} real items (${real})`);
  });

  h.test('bestiary: the prize wheel spins first, then pays its wedge, with a house edge', () => {
    const W = BC.BEST_WHEEL;
    h.ok(W.length === 8 && W.filter(w => w.who === 'it').length === 4 && W.every(w => w.label && w.k && w.v > 0), 'eight wedges, four of them its own');
    let it = 0, you = 0, rage = 0;
    for (let s = 1; s <= 300; s++) {
      const F = mk('barker', { seed: s });
      const out = act(F, 'wheel');
      const i = out.findIndex(e => e.t === 'binWheel');
      const w = out[i];
      h.ok(i >= 0 && W[w.w] && W[w.w].who === w.who, 'spin ' + s + ' names a wedge');
      if (w.who === 'it') it++; else you++;
      if (s <= 40) {
        const after = out.slice(i + 1);
        const k = W[w.w].k;
        const hit = k === 'gold' ? F.gain.gold === W[w.w].v : k === 'block' ? after.some(e => e.t === 'block' && e.who === (w.who === 'it' ? 'e' : 'p')) : k === 'heal' ? true : after.some(e => e.t === 'status' && e.s === k && e.who === (w.who === 'it' ? 'e' : 'p'));
        h.ok(hit, `spin ${s}: the ${w.label} lands after the spin`);
      }
      const F2 = mk('barker', { seed: s }); F2.enemies[0].enraged = true;
      if (evs(act(F2, 'wheel'), 'binWheel')[0].who === 'it') rage++;
    }
    h.ok(it / 300 > 0.5 && it / 300 < 0.66, `the house wins about 57% of spins (${Math.round(it / 3)}%)`);
    h.ok(rage / 300 > 0.64, `once enraged, far more (${Math.round(rage / 3)}%)`);
    const a = act(mk('barker', { seed: 9 }), 'wheel'), b = act(mk('barker', { seed: 9 }), 'wheel');
    h.eq(JSON.stringify(evs(a, 'binWheel')), JSON.stringify(evs(b, 'binWheel')), 'deterministic by the fight seed');
  });

  h.test('bestiary: the Claw Collector grabs your rarest item every turn and keeps it on display', () => {
    const bin = ['rusty_sword'].concat(realItems.filter(id => BD.ITEMS[id].rarity === 'r').slice(0, 2), realItems.filter(id => BD.ITEMS[id].rarity === 'c').slice(0, 8));
    const F = mk('collector', { bin });
    F.player.maxHp = F.player.hp = 5000;   // (13 turns of a round 12 elite, tierDmg x1.5, out-hit 999 hp)
    const e = F.enemies[0];
    const pick = BC.bestRivalPick(F);
    h.ok(pick && BD.ITEMS[pick.id].rarity === 'r', 'it has its eye on a rare item');
    h.eq(BC.bestRivalPick(F), pick, 'the pick is pure (no rng): the reticle tells the truth');
    const n0 = count(F);
    e.intent = e.def.moves.find(m => m.k === 'block'); e.acts = 1;
    const out = BC.endTurn(F);
    const r = evs(out, 'binRival'), eat = evs(out, 'binEat');
    h.ok(r.length === 1 && r[0].inst === pick && eat.length === 1 && eat[0].inst === pick, 'binRival then binEat: its claw takes exactly that item');
    h.ok(out.indexOf(r[0]) < out.indexOf(eat[0]), 'the claw shows up before the item leaves');
    h.eq(count(F), n0, 'every item accounted for');
    for (let t = 0; t < 12 && F.phase !== 'over'; t++) BC.endTurn(F);
    h.ok(e.belly.length <= 4 && !(F.digested || []).length, 'it keeps up to four, never digests them (' + e.belly.length + ')');
    const real = F.bin.concat(F.used).filter(i => !BC.isJunk(i)).length;
    h.ok(real >= BC.BEST_FLOOR, 'never below the floor of real items');
    BC.damage(F, F.player, e, 9999, { pierce: true });
    h.ok(!e.alive && !e.belly.length && count(F) === n0, 'beat it and the whole collection comes back');
    // enraged: two a turn
    const F2 = mk('collector', { bin: realItems.slice(0, 16) });
    F2.enemies[0].enraged = true; F2.enemies[0].intent = F2.enemies[0].def.moves[1]; F2.enemies[0].acts = 1;
    h.eq(evs(BC.endTurn(F2), 'binRival').length, 2, 'enraged, its claw goes back for seconds');
    h.ok(/2 rarest/.test(BC.intentText(F2.enemies[0])), 'and the telegraph says so');
  });

  h.test('bestiary: 16 turns of every new enemy stay clean, nothing vanishes', () => {
    for (const id of NEW) {
      const F = mk(id, { seed: 11 });
      const n0 = count(F);
      let ok = true;
      for (let t = 0; t < 16 && F.phase !== 'over'; t++) {
        try { BC.endTurn(F); } catch (err) { ok = false; h.ok(false, id + ' threw ' + err.stack); break; }
        if (count(F) < n0) { ok = false; h.ok(false, `${id}: an item vanished at turn ${t}`); break; }
        if (!Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp))) { ok = false; h.ok(false, id + ': NaN hp'); break; }
      }
      h.ok(ok, `${id}: 16 turns clean, every item accounted for`);
    }
  });
}

// ---------- round 6: relic sets and the boon's warm-up grabs ----------
if (hasData) {
  const R6 = boot({ only: ['util', 'data', 'combat'] });
  const D6 = R6.DATA, C6 = R6.COMBAT;
  // A fight with these relics; o.noSets opts out (the control), o.run merges run fields.
  const SF = (bin, relics, enemies, o) => {
    o = o || {};
    const run = Object.assign({ hp: 200, maxHp: 200, act: 1, gold: o.gold || 0, relics, claw: { grabs: o.grabs || 3 },
      bin: bin.map((id, i) => ({ uid: 's' + i, id, plus: false })) }, o.run || {});
    if (o.noSets) run.noSets = true;
    const F = C6.newFight(run, enemies || ['rat'], R6.U.rng(o.seed || 5));
    for (const e of F.enemies) { e.hp = 300; e.maxHp = 300; e.block = 0; }
    return F;
  };
  const pl = (F, id, t) => { const i = F.bin.find(x => x.id === id); if (!i) throw new Error('not in bin: ' + id); return C6.play(F, i, t); };
  const procOf = (F, id) => F.events.filter(e => e.t === 'proc' && e.id === id);
  const BIN = ['rusty_sword', 'dented_shield', 'crisp_apple', 'rusty_sword'];

  h.test('sets: the bonuses switch on at 2 and 3 pieces, never at 1', () => {
    for (const id of D6.SET_IDS) {
      const p = D6.SETS[id].pieces;
      const F1 = SF(BIN, [p[0]]), F2 = SF(BIN, [p[0], p[2]]), F3 = SF(BIN, p.slice());
      h.eq(F1.sets.join(), '', `${id}: one piece, no bonus`);
      h.eq(F2.sets.join(), `set:${id}:2`, `${id}: two pieces, the small bonus`);
      h.eq(F3.sets.join(), `set:${id}:2,set:${id}:3`, `${id}: three, both`);
      h.eq(F3.relics.join(), p.join(), `${id}: F.relics keeps only the real relics`);
      h.eq(F3.hookErrors.length, 0, `${id}: no hook errors`);
    }
    h.eq(C6.rulesOf(['set:circus:2']).rules.amp.magic, 2, 'rulesOf reads a set bonus');
    h.eq(C6.relicMods(['set:fortress:2']).startBlock, 6, 'relicMods reads a set bonus');
  });

  h.test('sets: Poisoner\'s Kit, Pyromaniac and Cold Storage', () => {
    let F = SF(BIN, ['venom_gland', 'contagion'], ['rat', 'rat']);
    C6.status(F, F.enemies[0], 'poison', 3);
    h.eq(F.enemies[0].status.poison, 4, 'Toxic Touch: 3 Poison lands as 4');
    F = SF(BIN, ['venom_gland']);
    C6.status(F, F.enemies[0], 'poison', 3);
    h.eq(F.enemies[0].status.poison, 3, 'one piece: 3 stays 3');
    // Plague Doctor: the poison ticks at your turn end too
    const plague = (o) => { const G = SF(BIN, ['venom_gland', 'contagion', 'festering_jar'], ['rat'], o); G.enemies[0].status.poison = 6; const h0 = G.enemies[0].hp; C6.endTurn(G); return { G, drop: h0 - G.enemies[0].hp }; };
    const on = plague(), off = plague({ noSets: true });
    h.eq(on.drop - off.drop, 6, 'Plague Doctor: 6 Poison hits for 6 more at your turn end');
    h.ok(procOf(on.G, 'set:poison:3').length >= 1, 'PLAGUE proc credits the set');
    // Pyromaniac
    F = SF(BIN, ['flint_striker', 'bellows'], ['rat']);
    C6.status(F, F.enemies[0], 'burn', 2);
    h.eq(F.enemies[0].status.burn, 3, 'Kindling: 2 Burn lands as 3');
    F = SF(BIN, ['flint_striker', 'bellows', 'powder_keg'], ['rat', 'rat']);
    h.ok(F.enemies.every(e => e.status.burn >= 2), 'Wildfire: every enemy starts the turn burning');
    F.enemies[0].status.burn = 5;
    C6.damage(F, F.player, F.enemies[0], 999, { pierce: true });
    h.ok(!F.enemies[0].alive && F.enemies[1].status.burn >= 2 + 5, 'Wildfire: a burning death spreads its Burn');
    // Cold Storage
    F = SF(BIN, ['snow_globe', 'cold_snap'], ['rat', 'rat']);
    const b0 = F.player.block;
    C6.status(F, F.enemies[0], 'freeze', 1);
    h.eq(F.player.block - b0, 5, 'Ice Box: a freeze gives 5 Block');
    F = SF(BIN, ['snow_globe', 'cold_snap', 'permafrost_core'], ['rat', 'rat', 'rat']);
    for (const e of F.enemies) e.status = {};
    const hp1 = F.enemies[1].hp;
    C6.status(F, F.enemies[0], 'freeze', 1);
    h.ok(F.enemies[1].status.chill === 2 && F.enemies[2].status.chill === 2, 'Flash Freeze: the others gain 2 Chill');
    h.eq(F.enemies[0].hp, 300 - 6 - 8, 'the frozen one takes 8 (and the Cold Snap 6)');
    h.eq(F.enemies[1].hp, hp1 - 6, 'the others only the Cold Snap');
    const hp0 = F.enemies[0].hp;
    C6.status(F, F.enemies[1], 'freeze', 1);
    h.eq(F.enemies[1].hp, hp1 - 6 - 6, 'the second freeze this turn: no Flash Freeze');
    h.eq(F.enemies[0].hp, hp0 - 6, 'only the Cold Snap');
  });

  h.test('sets: Iron Fortress, Junkyard Dogs and High Rollers', () => {
    const on = SF(BIN, ['kettle_helm', 'battering_ram']), off = SF(BIN, ['kettle_helm', 'battering_ram'], null, { noSets: true });
    h.eq(on.player.block - off.player.block, 6, 'Reinforced: 6 more Block at the bell');
    let F = SF(BIN, ['kettle_helm', 'battering_ram', 'castle_walls'], ['rat', 'rat']);
    C6.status(F, F.player, 'block', 4);
    h.ok(F.enemies.every(e => e.hp === 300), 'Siege Engine: 4 Block does nothing');
    C6.status(F, F.player, 'block', 5);
    h.ok(F.enemies.every(e => e.hp === 297), 'Siege Engine: 5 Block hits ALL for 3');
    // Junkyard Dogs
    const junk = (relics, o) => { const G = SF(BIN, relics, ['rat'], o); C6.addJunk(G, 'rock', 1); const b = G.player.block, hp = G.enemies[0].hp; C6.play(G, G.bin.find(i => i.junk), 0); return { G, block: G.player.block - b, hit: hp - G.enemies[0].hp }; };
    const j2 = junk(['dumpster_lid', 'recycling_bin']), j0 = junk(['dumpster_lid', 'recycling_bin'], { noSets: true });
    h.eq(j2.block - j0.block, 3, 'Scrap Armor: junk grabbed out gives 3 more Block');
    F = SF(BIN, ['dumpster_lid', 'recycling_bin', 'junkyard_king']);
    h.eq(F.bin.filter(i => i.junk && i.id === 'rock').length, 2, 'Wrecking Crew: two Rocks in the bin at the bell');
    const j3 = junk(['dumpster_lid', 'recycling_bin', 'junkyard_king']), j3off = junk(['dumpster_lid', 'recycling_bin', 'junkyard_king'], { noSets: true });
    h.eq(j3.hit - j3off.hit, 8, 'Wrecking Crew: junk grabbed out hits for 8 more');
    // High Rollers
    const l2 = SF(BIN, ['dealers_visor', 'lucky_cat']), l0 = SF(BIN, ['dealers_visor', 'lucky_cat'], null, { noSets: true });
    h.eq(C6.luckOf(l2) - C6.luckOf(l0), 1, 'Hot Hand: 1 more Luck at the turn start');
    F = SF(BIN, ['dealers_visor', 'lucky_cat', 'high_roller']);
    F.player.status.luck = 8;
    C6.cashOut(F, 2);
    h.eq(C6.luckOf(F), 4, 'House Money: a cash out of 8 hands back 4');
  });

  h.test('sets: The Arcade Owner, Glassworks, The Hungry Pack, Midnight Circus', () => {
    const jack = (relics, o) => {
      const G = SF(['rusty_sword', 'rusty_sword', 'dented_shield', 'crisp_apple', 'crisp_apple', 'dented_shield'], relics, ['rat'], Object.assign({ grabs: 6 }, o || {}));
      const t0 = G.stats.tix, b0 = G.player.block, g0 = G.player.grabs;
      C6.useGrab(G); pl(G, 'rusty_sword'); pl(G, 'crisp_apple'); pl(G, 'dented_shield');
      C6.grabDone(G, 3);
      return { G, tix: G.stats.tix - t0, grabs: G.player.grabs - (g0 - 1) };
    };
    const a2 = jack(['prize_counter', 'ticket_roll']), a0 = jack(['prize_counter', 'ticket_roll'], { noSets: true });
    h.ok(a2.tix > a0.tix, `Frequent Player: more tickets (${a0.tix} -> ${a2.tix})`);
    const a3 = jack(['prize_counter', 'ticket_roll', 'gacha_charm']), a30 = jack(['prize_counter', 'ticket_roll', 'gacha_charm'], { noSets: true });
    h.eq(a3.grabs - a30.grabs, 1, "Owner's Cut: a jackpot gives a grab back");
    C6.useGrab(a3.G); pl(a3.G, 'rusty_sword'); pl(a3.G, 'crisp_apple'); pl(a3.G, 'dented_shield');
    const gA = a3.G.player.grabs;
    C6.grabDone(a3.G, 3);
    h.eq(a3.G.player.grabs, gA, 'only once a turn');
    h.eq(D6.SET_FX['set:arcade:3'].loot.capUp, 0.25, 'and capsules upgrade more often (read by the game)');
    // Glassworks
    let F = SF(['toxic_vial', 'crystal_shard', 'rusty_sword'], ['bottle_deposit', 'sharp_shards'], ['rat']);
    let hp = F.enemies[0].hp;
    C6.material(F, 'shatter', F.bin.find(i => i.id === 'toxic_vial'));
    h.eq(hp - F.enemies[0].hp, 4 + 3, 'Tempered: a shatter cuts for 3 more (and the shards 4)');
    F = SF(['toxic_vial', 'crystal_shard', 'rusty_sword'], ['bottle_deposit', 'sharp_shards', 'glass_cannon'], ['rat']);
    const n0 = F.bin.length;
    C6.material(F, 'shatter', F.bin.find(i => i.id === 'toxic_vial'));
    h.ok(F.player.status.str === 1 && F.bin.length === n0 + 1 && F.bin.some(i => i.temp && D6.ITEMS[i.id].tags.includes('glass')), 'Glassblower: +1 Strength and a glass copy');
    C6.material(F, 'shatter', F.bin.find(i => i.id === 'crystal_shard'));
    h.ok(F.player.status.str === 2 && F.bin.length === n0 + 1, 'the copy once a turn, the Strength every time');
    // The Hungry Pack (the game calls petTrick on every trick)
    F = SF(BIN, ['treat_jar'], ['rat'], { run: { hp: 150 } });
    let ev = C6.petTrick(F, 'cat');
    h.ok(F.player.hp === 152 && F.player.block >= 2 && ev.some(e => e.t === 'proc' && e.id === 'treat_jar'), 'Treat Jar: a trick heals 2 and blocks 2');
    F = SF(BIN, ['dog_whistle'], ['rat']);
    C6.petTrick(F, 'cat');
    h.eq(F.enemies[0].hp, 297, 'Dog Whistle: a trick hits the target for 3');
    F = SF(BIN, ['chew_toy', 'treat_jar'], ['rat']);
    hp = F.enemies[0].hp;
    ev = C6.petTrick(F, 'hamster');
    h.ok(hp - F.enemies[0].hp === 3 && ev.some(e => e.t === 'proc' && e.id === 'set:pack:2'), 'Pack Tactics: 3 to a random enemy, credited to the set');
    F = SF(BIN, ['chew_toy', 'treat_jar', 'dog_whistle'], ['rat']);
    ev = C6.petTrick(F, 'hamster');
    h.ok(ev.some(e => e.t === 'proc' && e.id === 'set:pack:3' && e.text === 'TOP DOG'), 'Top Dog proc (its extra trick and power live in the game)');
    F.phase = 'over';
    h.eq(C6.petTrick(F, 'cat').length, 0, 'no tricks after the fight');
    // Midnight Circus
    const book = (relics, o) => { const G = SF(['rulebook', 'rulebook', 'rulebook', 'rusty_sword'], relics, ['rat'], Object.assign({ grabs: 9 }, o || {})); const bs = G.bin.filter(i => i.id === 'rulebook' && !i.temp); const b0 = G.player.block; C6.play(G, bs[0]); const one = G.player.block - b0; C6.play(G, bs[1]); return { G, one, two: G.player.block - b0 }; };
    const c2 = book(['crystal_focus', 'wizard_hat']), c0 = book(['crystal_focus', 'wizard_hat'], { noSets: true });
    h.eq(c2.one - c0.one, 2, 'Sleight of Hand: +2 on a magic item');
    const c3 = book(['crystal_focus', 'wizard_hat', 'echo_chamber']);
    h.eq(c3.two, c3.one * 3, 'Grand Illusion: the 2nd magic item resolves twice');
    h.eq(c3.G.bin.filter(i => i.temp).length, 2, 'and a second magic copy at the bell');
  });

  h.test('boon: the warm-up grabs ride the first fight', () => {
    const F = SF(BIN, [], ['rat'], { run: { boon: { grabs: 2 } } });
    h.ok(F.player.grabsMax === 5 && F.sets.includes('boon:grabs'), '+2 grabs every turn');
    C6.endTurn(F);
    h.eq(F.player.grabsMax, 5, 'still there next turn');
    h.eq(SF(BIN, [], ['rat'], { run: { boon: { grabs: 0 } } }).player.grabsMax, 3, 'gone once spent');
  });

  h.test('sets: a 30 turn fuzz holding every set piece stays clean', () => {
    const all = [];
    for (const id of D6.SET_IDS) all.push(...D6.SETS[id].pieces);
    const pool = Object.keys(D6.ITEMS).filter(id => D6.ITEMS[id].rarity !== 'junk').slice(0, 40);
    const F = SF(pool.slice(0, 16), all, ['rat', 'slime'], { grabs: 4, gold: 200, seed: 11 });
    const r = R6.U.rng(99);
    for (let t = 0; t < 30 && F.phase !== 'over'; t++) {
      for (let g = 0; g < 3 && F.phase === 'player' && F.bin.length; g++) {
        C6.useGrab(F);
        for (let k = 0; k < 1 + (g % 3) && F.bin.length && F.phase === 'player'; k++) C6.play(F, F.bin[Math.floor(r() * F.bin.length)], 0);
        if (F.phase === 'player') C6.grabDone(F, 1 + (g % 3));
        if (F.phase === 'player' && g === 1) { C6.petTrick(F, 'cat'); C6.material(F, 'shatter', F.bin[0]); }
      }
      for (const e of F.enemies) if (e.alive && e.hp < 50) e.hp = 300;   // keep it going
      if (F.phase === 'player') C6.endTurn(F);
      if (!Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp))) break;
    }
    h.eq(F.hookErrors.length, 0, 'no hook errors ' + F.hookErrors.slice(0, 2).join(' | '));
    h.ok(Number.isFinite(F.player.hp) && F.enemies.every(e => Number.isFinite(e.hp)), 'no NaN hp');
    h.ok(F.sets.length === 20, 'all twenty bonuses live');
  });
}

// ---------- SECRET (round 6, DESIGN.md "Secret act (round 6)"): The Machine and the Back Room's elites ----------
if (hasData) {
  const S6 = boot({ only: ['util', 'data', 'combat'] });
  const SD = S6.DATA, SC = S6.COMBAT, SU = S6.U;
  const IDS = Object.keys(SD.ITEMS).filter(id => SD.ITEMS[id].rarity !== 'junk' && !SD.ITEMS[id].bag);
  const run6 = (extra) => Object.assign({ hp: 999, maxHp: 999, act: 3, relics: [], claw: { grabs: 3 }, gold: 50, bin: IDS.slice(0, 14).map((id, i) => ({ uid: 's' + i, id, plus: false })) }, extra || {});
  const calm = (e) => { e.intent = { id: 'calm', name: 'Calm', k: 'block', v: 1, txt: 'calm' }; e.charged = 0; };
  const evK = (evs, k) => evs.filter(x => x.t === 'boss' && x.k === k);
  // Makes The Machine's next action carry the phase's part `part`.
  const aim = (e, part) => { const s = e.def.sig, ph = SC.secPhase(e), set = s.phases[ph]; e.sigN = set.indexOf(part); calm(e); return e.sigN >= 0; };
  h.test('secret: The Machine is a secret boss with a cabinet event every action', () => {
    const d = SD.ENEMIES.machine;
    h.ok(d && d.tier === 'boss' && d.secret && d.look === 'machine' && d.sig && d.sig.id === 'machine' && d.sig.first === 0 && d.sig.every === 1, 'a secret boss, a signature every action');
    h.ok(d.sig.phases.length === 3 && d.sig.phases.every(p => p.length >= 3), 'three phases, three tricks or more each');
    for (const p of ['tilt', 'flood', 'claw', 'grav', 'rail', 'shutter']) h.ok(d.sig.phases.some(set => set.includes(p)) && d.sig.texts[p] && d.sig.signs[p], `the ${p} event is used, telegraphed and signed`);
    h.ok(!SD.ENCOUNTERS[3].boss.some(enc => enc.includes('machine')), 'never met in a normal act');
    for (let s = 1; s <= 60; s++) for (const a of [1, 2, 3]) h.ok(SD.endlessMix(SU.rng(s), a) !== 'machine', 'an Endless boss never borrows its tricks');
  });
  h.test('secret: its phases (half hp OVERCLOCKED, the last quarter MELTDOWN) pick their own events', () => {
    const F = SC.newFight(run6(), ['machine'], SU.rng(3));
    const e = F.enemies[0];
    h.eq(SC.secPhase(e), 0, 'phase one');
    const seen0 = new Set();
    for (let i = 0; i < 6; i++) { e.sigN = i; seen0.add(SC.sigInfo(e).part); }
    h.eq([...seen0].sort().join(), [...SD.ENEMIES.machine.sig.phases[0]].sort().join(), 'phase one cycles its set');
    const info = SC.sigInfo(e);
    h.ok(info.sign === SD.ENEMIES.machine.sig.signs[info.part] && /then /.test(SC.intentText(e)), 'the telegraph names the event: ' + SC.intentText(e));
    SC.damage(F, F.player, e, Math.ceil(e.maxHp * 0.55), { pierce: true });
    h.ok(e.enraged && SC.secPhase(e) === 1 && F.events.some(x => x.t === 'enrage' && x.name === 'OVERCLOCKED'), 'OVERCLOCKED at half hp');
    SC.endTurn(F);
    SC.damage(F, F.player, e, e.hp - Math.floor(e.maxHp * 0.2), { pierce: true });
    for (let k = 0; k < 3 && !e.final; k++) SC.endTurn(F);
    h.ok(e.final && F.final && SC.secPhase(e) === 2, 'the final quarter');
    const F2 = SC.newFight(run6(), ['machine'], SU.rng(4));
    const e2 = F2.enemies[0];
    SC.damage(F2, F2.player, e2, Math.ceil(e2.maxHp * 0.55), { pierce: true });
    F2.events.length = 0;
    SC.damage(F2, F2.player, e2, e2.hp - Math.floor(e2.maxHp * 0.2), { pierce: true });
    const fin = evK(F2.events, 'final')[0];
    h.ok(fin && fin.name === 'MELTDOWN', 'the final phase is called MELTDOWN');
  });
  h.test('secret: every cabinet event, what it leaves for your turn, and its end', () => {
    for (const [part, ph] of [['tilt', 0], ['flood', 0], ['claw', 0], ['grav', 1], ['rail', 1], ['shutter', 1], ['claw', 2], ['flood', 2], ['rail', 2]]) {
      const F = SC.newFight(run6(), ['machine'], SU.rng(11 + part.length + ph));
      const e = F.enemies[0];
      if (ph >= 1) e.enraged = true;
      if (ph >= 2) e.final = true;
      h.ok(aim(e, part), `${part}: in phase ${ph}'s set`);
      const bin0 = F.bin.length, hp0 = F.player.hp;
      F.events.length = 0;
      SC.endTurn(F);
      const evs = F.events;
      const W = `${part} (phase ${ph})`;
      if (part === 'tilt') h.ok(Math.abs(F.tilt) === 1 && evs.some(x => x.t === 'binTilt') && evK(evs, 'mTilt').length === 1, W + ': the cabinet tilts');
      if (part === 'flood') {
        const want = SD.ENEMIES.machine.sig.flood[ph], it = evK(evs, 'mFlood')[0];
        h.ok(it && it.items.length === want && it.items.every(i => i.junk && F.bin.indexOf(i) >= 0), `${W}: ${want} junk pour in`);
        h.ok(F.bin.length >= bin0 + want - 2, W + ': into the bin');
      }
      if (part === 'claw') h.ok(F.rigged && F.rigged.secret && F.rigged.drops === (ph === 2 ? 2 : 1) && evK(evs, 'mClaw').length === 1, W + ': it takes the claw (' + (F.rigged && F.rigged.drops) + ' drops)');
      if (part === 'grav') {
        const g = evK(evs, 'mGrav')[0];
        h.ok(F.secGrav === 1 && g && g.insts.length > 0 && g.insts.length <= SD.ENEMIES.machine.sig.float[ph] && g.insts.every(i => F.bin.indexOf(i) >= 0), W + ': zero g, the pile floats up');
      }
      if (part === 'rail') {
        h.ok(F.secZap && F.secZap.v === SD.ENEMIES.machine.sig.zap[ph] && evK(evs, 'mRail').length === 1, W + ': a live rail');
        F.player.block = 0;
        const hpA = F.player.hp;
        const zap = SC.secDrop(F);
        h.eq(F.player.hp, hpA - F.secZap.v, W + ': a drop shocks you');
        h.ok(evK(zap, 'mZap').length === 1, W + ': the zap event');
        F.player.block = 50;
        SC.secDrop(F);
        h.ok(F.player.block < 50, W + ': Block soaks the shock');
        h.ok(SC.secGround(F) && !F.secZap && !SC.secGround(F), W + ': a metal prize grounds it');
        h.eq(SC.secDrop(F).length, 0, W + ': a grounded rail is safe');
      }
      if (part === 'shutter') {
        h.ok(F.secShut && F.secShut.hp === 2 && evK(evs, 'mShutter').length === 1, W + ': the shutter comes down');
        h.eq(SC.secShutHit(F, false).hp, 2, W + ': a light prize bounces off');
        h.eq(SC.secShutHit(F, true).hp, 1, W + ': a heavy one dents it');
        h.eq(SC.secShutHit(F, true), null, W + ': the second dent knocks it open');
        h.ok(!F.secShut && SC.secShutHit(F, true) === null, W + ': open stays open');
        F.secShut = { hp: 2, max: 2 };
      }
      // it all clears as your next turn ends
      F.events.length = 0;
      calm(e); e.sigN = 0;
      const had = !!(F.secGrav || F.secZap || F.secShut);
      if (e.def.sig) e.sigForce = false;
      const sig0 = e.def.sig; e.def = Object.assign({}, e.def, { sig: null });
      SC.endTurn(F);
      e.def = Object.assign({}, e.def, { sig: sig0 });
      h.ok(!F.secGrav && !F.secZap && !F.secShut && !F.rigged && !F.tilt, W + ': gone when your turn ends');
      if (had) h.ok(evK(F.events, 'mEnd').length === 1, W + ': the end is announced');
      h.ok(Number.isFinite(F.player.hp) && F.player.hp <= hp0, W + ': no NaN');
    }
  });
  h.test('secret: the Back Room\'s elites stack the strongest affixes', () => {
    const pool = SD.SECRET.affixPool;
    for (const id of ['frostknight', 'collector', 'ironjaw', 'dozer']) {
      const inRoom = SC.newFight(run6({ sec: { room: true } }), [id], SU.rng(21)).enemies[0];
      h.ok(inRoom.affix.length >= SD.SECRET.eliteAffix && inRoom.affix.filter(a => pool.includes(a)).length >= SD.SECRET.eliteAffix - 1, `${id}: ${inRoom.affix.join(',')}`);
      const outside = SC.newFight(run6(), [id], SU.rng(21)).enemies[0];
      h.ok(outside.affix.length < inRoom.affix.length, `${id}: fewer outside the Back Room`);
    }
    const m = SC.newFight(run6({ sec: { room: true } }), ['machine'], SU.rng(2)).enemies[0];
    h.eq(m.affix.length, 0, 'The Machine carries no affix');
  });
  h.test('secret: 40 clean turns with The Machine (any claw, every event)', () => {
    for (const seed of [1, 2, 3]) {
      const F = SC.newFight(run6(), ['machine'], SU.rng(seed));
      let bad = 0;
      const parts = new Set();
      for (let turn = 0; turn < 40 && F.phase !== 'over'; turn++) {
        try {
          if (F.bin.length) SC.play(F, F.bin[0], 0);
          if (F.secZap && turn % 3 === 0) SC.secDrop(F);
          if (F.secShut) SC.secShutHit(F, turn % 2 === 0);
          for (const x of F.events) if (x.t === 'boss' && /^m[A-Z]/.test(x.k)) parts.add(x.k);
          F.events.length = 0;
          const e = F.enemies[0];
          if (turn === 12 && e.alive) SC.damage(F, F.player, e, Math.ceil(e.hp * 0.6), { pierce: true });
          if (turn === 24 && e.alive) SC.damage(F, F.player, e, Math.ceil(e.hp * 0.6), { pierce: true });
          if (F.player.hp < 100) F.player.hp = 900;
          SC.endTurn(F);
          for (const x of F.events) if (x.t === 'boss' && /^m[A-Z]/.test(x.k)) parts.add(x.k);
        } catch (err) { bad++; }
        if (!Number.isFinite(F.player.hp) || F.enemies.some(x => !Number.isFinite(x.hp))) bad++;
      }
      h.eq(bad, 0, `seed ${seed}: 40 clean turns`);
      h.ok(parts.size >= 6, `seed ${seed}: the events it ran: ${[...parts].join(',')}`);
    }
  });
}

// ---------- QA (round 7): the incoming-damage telegraph (COMBAT.qaIntent / qaThreat) ----------
{
  const Q = boot({ only: ['util', 'combat'] });
  const QC = Q.COMBAT;
  const QE = Object.assign({}, ENEMIES, {
    qa_vuln: E('qa_vuln', [{ id: 'hex', k: 'debuff', s: 'vuln', v: 1 }], { hp: [60, 60] }),
    qa_big: E('qa_big', [{ id: 'gape', name: 'Gape', k: 'charge', v: 30 }, { id: 'bite', k: 'attack', v: 6 }], { hp: [90, 90] }),
  });
  QC.useDefs(Object.assign({}, STUB, { ENEMIES: QE }));
  const qfight = (ids, o) => {
    o = o || {};
    const run = { hp: o.hp == null ? 70 : o.hp, maxHp: 70, act: 1, relics: [], claw: { grabs: 3 }, bin: ['sword', 'shield', 'potion', 'sword', 'shield', 'sword'].map((id, i) => ({ uid: 'q' + i, id, plus: false })) };
    return QC.newFight(run, ids, Q.U.rng(o.seed || 5));
  };
  // The preview must be what the engine then does: end the turn and compare.
  const check = (F, msg) => {
    const T = QC.qaThreat(F), hp0 = F.player.hp;
    QC.endTurn(F);
    h.eq(hp0 - F.player.hp, T.loss, `${msg}: previewed ${T.loss}, the enemy phase took ${hp0 - F.player.hp}`);
    return T;
  };
  h.test('qa: a plain hit, Strength, Vulnerable and Armor, as the engine hits', () => {
    let F = qfight(['hitter']);
    let q = QC.qaIntent(F, F.enemies[0]);
    h.ok(q.k === 'attack' && q.hit === 5 && q.n === 1 && q.total === 5, 'a plain 5');
    check(F, 'plain');
    F = qfight(['hitter']);
    F.enemies[0].status.str = 2; F.player.status.vuln = 1; F.player.status.armor = 1;
    q = QC.qaIntent(F, F.enemies[0]);
    h.eq(q.hit, Math.floor((5 + 2) * 1.5) - 1, 'Strength, then Vulnerable, then Armor: 9');
    check(F, 'str vuln armor');
    F = qfight(['hitter']);
    F.enemies[0].status.enrage = 2;
    h.eq(QC.qaIntent(F, F.enemies[0]).hit, 7, 'Enrage lands before it acts');
    check(F, 'enrage');
    F = qfight(['hitter']); F.enemies[0].status.weak = 1;
    h.eq(QC.qaIntent(F, F.enemies[0]).hit, 3, 'a Weak enemy hits for less');
    check(F, 'weak');
  });
  h.test('qa: multi-hits show the total; Block soaks and Dodge eats whole hits', () => {
    let F = qfight(['multi']);
    let q = QC.qaIntent(F, F.enemies[0]);
    h.ok(q.hit === 3 && q.n === 3 && q.total === 9, `3 x3 = 9 (${q.hit}x${q.n}=${q.total})`);
    F.player.block = 4;
    let T = check(F, 'multi vs 4 Block');
    h.ok(T.raw === 9 && T.blocked === 4 && T.loss === 5, 'raw 9, blocked 4, lost 5');
    F = qfight(['multi']); F.player.status.dodge = 1;
    T = check(F, 'multi vs 1 Dodge');
    h.ok(T.dodged === 3 && T.loss === 6, 'the first hit misses');
    F = qfight(['multi', 'hitter']); F.player.block = 10;
    T = check(F, 'two attackers share the Block');
    h.eq(T.loss, 4, '9 + 5 - 10');
  });
  h.test('qa: a Hasty jab counts; a frozen or stunned enemy skips', () => {
    const F = qfight(['hitter']);
    const e = F.enemies[0];
    e.affix = ['hasty']; e.acts = 2;
    const q = QC.qaIntent(F, e);
    h.ok(q.jab === 3 && q.total === 8, `5 and a jab of 3 (${q.total})`);
    check(F, 'hasty');
    for (const s of ['freeze', 'stun']) {
      const G = qfight(['hitter']);
      G.enemies[0].status[s] = 1;
      const T = check(G, s);
      h.ok(T.per[0].skip && T.loss === 0, `${s}: nothing comes`);
    }
    const P = qfight(['hitter']);
    P.enemies[0].status.poison = 99;
    h.ok(QC.qaThreat(P).per[0].skip, 'an enemy its own Poison kills first skips');
  });
  h.test('qa: a charge previews its unleash a turn ahead, then the unleash hits for it', () => {
    const F = qfight(['qa_big']);
    const e = F.enemies[0];
    e.status.str = 2;
    let q = QC.qaIntent(F, e);
    h.ok(q.k === 'charge' && q.next === 32 && q.total === 0, `charging: 30 + 2 Strength next turn (${q.next})`);
    let T = check(F, 'the charge turn');
    h.eq(T.loss, 0, 'nothing lands while it winds up');
    q = QC.qaIntent(F, e);
    h.ok(q.charged && q.hit === 32 && q.total === 32, `the unleash: ${q.hit}`);
    T = check(F, 'the unleash');
    h.eq(T.loss, 32, 'and it hits for exactly that');
    const G = qfight(['qa_big']);
    G.enemies[0].status.enrage = 1; G.player.status.vuln = 2;
    h.eq(QC.qaIntent(G, G.enemies[0]).next, Math.floor((30 + 2) * 1.5), 'two Enrage ticks by then, a 2-stack Vulnerable still on');
    G.player.status.vuln = 1;
    h.eq(QC.qaIntent(G, G.enemies[0]).next, 32, 'a 1-stack Vulnerable has worn off by then');
  });
  h.test('qa: lethal, Burn, Poison and bombs; a Vulnerable debuff lands for the next enemy', () => {
    let F = qfight(['hitter'], { hp: 5 });
    let T = QC.qaThreat(F);
    h.ok(T.lethal && T.left <= 0, 'hp 5 vs a 5: lethal');
    QC.endTurn(F);
    h.ok(F.player.hp <= 0 && F.phase === 'over', 'and it was');
    F = qfight(['multi'], { hp: 5 });
    T = QC.qaThreat(F);
    h.ok(T.net === 9 && T.loss === 5 && T.left === -4 && T.lethal, `the net runs past the hp (net ${T.net}, loss ${T.loss}, left ${T.left}): 5 more Block would save you`);
    F.player.block = 5;
    h.ok(!QC.qaThreat(F).lethal && QC.qaThreat(F).left === 1, 'and with 5 Block it does');
    F = qfight(['hitter'], { hp: 6 });
    h.ok(!QC.qaThreat(F).lethal, 'hp 6 vs a 5: not lethal');
    F.player.block = 2; F.player.status.burn = 3;
    T = check(F, 'burn through block');
    h.ok(T.burn === 3 && T.loss === 3 + 3, 'Burn ticks through Block first, then 5 - 2');
    F = qfight(['dummy']); F.player.status.poison = 4;
    T = QC.qaThreat(F);
    h.ok(T.poison === 4 && T.loss === 4, 'the player\'s Poison as the next turn starts');
    F = qfight(['qa_vuln', 'hitter']);
    T = check(F, 'vuln then a hit');
    h.eq(T.loss, 7, 'the second enemy hits a Vulnerable player: floor(5 x 1.5)');
    F = qfight(['dummy']);
    F.bin.push({ uid: 'bomb1', id: 'rock', junk: true, fuse: 1, boom: 9, lit: 0 });
    F.player.block = 4;
    T = check(F, 'a lit bomb');
    h.ok(T.bomb === 9 && T.loss === 5, 'a lit bomb on its last turn goes off through Block');
    F = qfight(['dummy']);
    F.bin.push({ uid: 'bomb2', id: 'rock', junk: true, fuse: 1, boom: 9, lit: F.turn });
    h.eq(QC.qaThreat(F).bomb, 0, 'one lit this turn waits');
  });
  h.test('qa: the preview is pure (nothing in the fight changes)', () => {
    const F = qfight(['multi', 'qa_big', 'hitter']);
    F.player.status.dodge = 1; F.player.block = 3; F.player.status.burn = 2;
    const before = JSON.stringify({ p: F.player, e: F.enemies.map(e => [e.hp, e.status, e.charged, e.acts, e.intent && e.intent.id]), ev: F.events.length, bin: F.bin.length });
    for (let i = 0; i < 5; i++) { QC.qaThreat(F); QC.qaIntent(F, F.enemies[1]); }
    h.eq(JSON.stringify({ p: F.player, e: F.enemies.map(e => [e.hp, e.status, e.charged, e.acts, e.intent && e.intent.id]), ev: F.events.length, bin: F.bin.length }), before, 'unchanged');
    h.eq(QC.qaThreat(null).loss, 0, 'no fight: nothing');
  });
  if (hasData) {
    const QD = boot({ only: ['util', 'data', 'combat'] });
    const D7 = QD.DATA, C7 = QD.COMBAT;
    h.test('qa: over every real enemy and 8 turns, the preview matches the enemy phase', () => {
      const IDS = Object.keys(D7.ITEMS).filter(id => D7.ITEMS[id].rarity !== 'junk' && !D7.ITEMS[id].bag && !D7.ITEMS[id].hot);
      let same = 0, n = 0;
      const miss = [];
      for (const id of Object.keys(D7.ENEMIES)) {
        const d = D7.ENEMIES[id];
        for (const seed of [3, 11]) {
          const run = { hp: 400, maxHp: 400, act: d.act || 1, relics: [], claw: { grabs: 3 }, gold: 40, bin: IDS.slice(seed, seed + 14).map((x, i) => ({ uid: 'r' + i, id: x, plus: false })) };
          const F = C7.newFight(run, [id], QD.U.rng(seed));
          for (let turn = 0; turn < 8 && F.phase === 'player'; turn++) {
            if (turn % 2) F.player.block = 7;
            if (turn === 3) F.player.status.vuln = 2;
            // what the preview leaves out by design: a Greedy gulp's lent Strength, a boss trick, the wheel's wedge
            const odd = F.enemies.some(e => e.alive && (C7.greedNext(e) || (C7.sigNext && C7.sigNext(e)) || (e.intent && (e.intent.k === 'wheel' || e.intent.k === 'gulp'))));
            const T = C7.qaThreat(F), hp0 = F.player.hp;
            C7.endTurn(F);
            if (odd) continue;
            n++;
            if (hp0 - F.player.hp === T.loss) same++;
            else if (miss.length < 6) miss.push(`${id} t${turn}: ${T.loss} vs ${hp0 - F.player.hp}`);
            if (F.player.hp < 150) F.player.hp = 400;
          }
        }
      }
      h.ok(n > 200 && same === n, `exact on ${same} of ${n} turns ${miss.join('; ')}`);
    });
  }
}

// ---------- round 7: item evolutions and pet synergies (DESIGN.md "Evolutions and pet synergies (round 7)")
if (hasData) {
  const L7 = boot({ only: ['util', 'data', 'combat'] });
  const C = L7.COMBAT, D = L7.DATA, U7 = L7.U;
  const erun = (bin, relics, extra) => Object.assign({ hp: 70, maxHp: 70, act: 1, char: 'knight', relics: relics || [], claw: { grabs: 3 },
    bin: bin.map((x, i) => (typeof x === 'string' ? { uid: 'v' + i, id: x, plus: false } : Object.assign({ uid: 'v' + i }, x))) }, extra || {});
  const efight = (bin, relics, extra, enc, seed) => {
    const F = C.newFight(erun(bin, relics, extra), enc || ['rat', 'rat'], U7.rng(seed || 11));
    for (const e of F.enemies) { e.hp = e.maxHp = 400; e.status = {}; e.block = 0; }
    F.events.length = 0;
    return F;
  };
  const playId = (F, id) => { const i = F.bin.find(b => b.id === id); return i ? C.play(F, i) : []; };
  const bad = (F) => { for (const u of [F.player, ...F.enemies]) { if (!Number.isFinite(u.hp) || u.hp < 0 || u.hp > u.maxHp) return 'hp'; for (const k in u.status) if (!Number.isFinite(u.status[k])) return k; } return F.hookErrors.length ? F.hookErrors[0] : null; };

  h.test('evolve: a recipe triggers only with the right item, plus and relic', () => {
    const F = efight([{ id: 'rusty_sword', plus: true }, { id: 'rusty_sword' }, { id: 'longsword', plus: true }, { id: 'venom_dart', plus: true }], ['trophy_rack']);
    const [sw, plain, other, dart] = F.bin;
    h.eq(C.evoCheck(F, sw) && C.evoCheck(F, sw).to, 'excalibur_claw', 'Rusty Sword+ with the Trophy Rack is ready');
    h.eq(C.evoCheck(F, plain), null, 'not upgraded: not ready');
    h.eq(C.evoCheck(F, other), null, 'another item: not ready');
    h.eq(C.evoCheck(F, dart), null, 'Venom Dart+ without the Festering Jar: not ready');
    h.eq(C.evolve(F, plain), null, 'evolve refuses what is not ready');
    h.eq(plain.id, 'rusty_sword', 'and leaves it alone');
    const r = C.evolve(F, sw);
    h.ok(r && sw.id === 'excalibur_claw' && sw.plus === false, 'evolve turns the fight instance');
    h.ok(F.evos.includes('evo:excalibur_claw'), 'its aura joins the fight at once');
    h.eq(F.evolved.length, 1, 'F.evolved records it');
    h.eq(C.evoCheck(F, sw), null, 'an evolved item never evolves again');
    for (const id of D.EVO_IDS) {
      const R0 = D.EVOLUTIONS[id];
      const G = efight([{ id: R0.from, plus: true }], [R0.relic]);
      h.eq(C.evolve(G, G.bin[0]) && G.bin[0].id, id, `${id}: ${R0.from}+ and ${R0.relic} evolve`);
      const W = efight([{ id: R0.from, plus: true }], []);
      h.eq(C.evolve(W, W.bin[0]), null, `${id}: not without the relic`);
    }
  });

  h.test('evolve: evolved effects and auras in a fight', () => {
    // Excalibur Claw: 18 and a Strength; King's Oath: 5 Block per kill
    let F = efight(['excalibur_claw', 'femur'], []);
    h.ok(F.evos.includes('evo:excalibur_claw'), 'an evolved item in the run bin brings its aura');
    const hp0 = F.enemies[0].hp;
    C.useGrab(F); playId(F, 'excalibur_claw'); C.grabDone(F, 1);
    h.eq(hp0 - F.enemies[0].hp, 18, 'Excalibur Claw deals 18');
    h.eq(F.player.status.str, 1, 'and gives 1 Strength');
    F.enemies[1].hp = 3; F.target = 1;
    const b0 = F.player.block;
    C.useGrab(F); const ev = playId(F, 'femur'); C.grabDone(F, 1);
    h.ok(!F.enemies[1].alive && F.player.block - b0 === 5, `King's Oath: a kill gives 5 Block (${F.player.block - b0})`);
    h.ok(ev.some(e => e.t === 'proc' && e.id === 'evo:excalibur_claw'), 'the aura fires a proc');
    // Plague Needle: Epidemic spreads Poison to the others
    F = efight(['plague_needle'], []);
    C.useGrab(F); playId(F, 'plague_needle'); C.grabDone(F, 1);
    h.ok(F.enemies[0].status.poison >= 7 && F.enemies[1].status.poison >= 1, `Plague Needle poisons, Epidemic spreads (${F.enemies[0].status.poison}/${F.enemies[1].status.poison})`);
    // Tower Aegis: Battlements at the end of the turn
    F = efight(['tower_aegis'], []);
    C.useGrab(F); playId(F, 'tower_aegis'); C.grabDone(F, 1);
    h.ok(F.player.block >= 15 && F.player.status.thorns === 2, 'Tower Aegis: 15 Block and 2 Thorns');
    const e0 = F.enemies.map(e => e.hp);
    C.endTurn(F);
    h.ok(F.enemies.every((e, i) => e0[i] - e.hp >= 3), 'Battlements hit ALL at the end of the turn');
    // Midas Coin: gold gives Block
    F = efight(['midas_coin'], []);
    C.useGrab(F); playId(F, 'midas_coin'); C.grabDone(F, 1);
    h.ok(F.gain.gold === 8 && F.player.block === 8, `Midas Coin: 8 gold, Golden Touch gives 8 Block (${F.player.block})`);
    // Prism Lance: three beams, never shatters with the Glass Cannon; Refraction on a shatter
    F = efight(['prism_lance', 'empty_bottle'], ['glass_cannon']);
    const tot0 = F.enemies.reduce((a, e) => a + e.hp, 0);
    C.useGrab(F); playId(F, 'prism_lance'); C.grabDone(F, 1);
    h.eq(tot0 - F.enemies.reduce((a, e) => a + e.hp, 0), 18, 'Prism Lance: 3 beams of 6');
    h.ok(F.used.some(i => i.id === 'prism_lance') && !F.exhausted.some(i => i.id === 'prism_lance'), 'it never shatters');
    const t1 = F.enemies.map(e => e.hp);
    C.useGrab(F); playId(F, 'empty_bottle'); C.grabDone(F, 1);
    h.ok(F.enemies.every((e, i) => t1[i] - e.hp >= 5), 'Refraction: a shatter hits ALL for 5');
    // Loaded Fate / Absolute Zero / Echo Grimoire: rules from the aura
    h.eq(efight(['loaded_fate'], []).rules.cashAmp, 1, 'Loaded Fate: House Edge adds cashAmp');
    h.eq(efight(['absolute_zero'], ['permafrost_core']).rules.shatter, 0.75, 'Absolute Zero: Deep Cold adds to SHATTER');
    h.eq(efight(['echo_grimoire'], ['echo_chamber']).rules.echo, 2, 'Echo Grimoire: every 2nd magic item echoes');
    F = efight(['absolute_zero'], []);
    C.useGrab(F); playId(F, 'absolute_zero'); C.grabDone(F, 1);
    h.ok(F.enemies[0].status.freeze >= 1 && F.enemies[1].status.chill >= 1, 'Absolute Zero freezes the target and chills the rest');
    // an evolved item mid fight: its rules land at once
    F = efight([{ id: 'frost_pearl', plus: true }], ['permafrost_core']);
    const sh0 = F.rules.shatter;
    C.evolve(F, F.bin[0]);
    h.eq(F.rules.shatter, sh0 + 0.25, 'an evolution mid fight merges its aura rules');
    // Scrap Titan: a Rock at the bell, junk out hits ALL
    F = C.newFight(erun(['scrap_titan'], []), ['rat', 'rat'], U7.rng(3));
    h.ok(F.bin.some(i => i.id === 'rock'), 'Scrap Heap: a Rock in the bin at the bell');
  });

  h.test('evolve: pet synergies through COMBAT.evoPet', () => {
    let F = efight(['prize_marble', 'prize_marble', 'lucky_penny', 'femur'], [], { pet: { id: 'hamster', lv: 1, xp: 0 } });
    h.eq(F.petId, 'hamster', 'F.petId is the pet along');
    const tot = () => F.enemies.reduce((a, e) => a + e.hp, 0);
    let t0 = tot();
    let ev = C.evoPet(F, 'hamster', 'marbles');
    h.eq(t0 - tot(), 6, 'Marble Run: 2 per small item in the bin');
    h.ok(ev[0] && ev[0].t === 'proc' && ev[0].src === 'pet' && ev[0].id === 'pet:hamster', 'a pet proc first');
    F = efight(['torch'], []);
    C.evoPet(F, 'cat', 'burn', { v: 2 });
    h.ok(F.enemies.every(e => e.status.burn === 2), 'Fire Cat: 2 Burn on ALL');
    F = efight(['femur'], []);
    const n0 = F.bin.length;
    ev = C.evoPet(F, 'parrot', 'copy', { id: 'femur' });
    h.ok(F.bin.length === n0 + 1 && F.bin[F.bin.length - 1].temp && ev.some(e => e.t === 'binCopy'), 'Mimic: a fight copy of the carried item');
    C.evoPet(F, 'raccoon', 'feast');
    h.ok(F.player.status.str === 1 && F.player.block === 3, "King's Feast: 1 Strength and 3 Block");
    C.evoPet(F, 'goose', 'luck');
    h.eq(F.player.status.luck, 1, 'Golden Clutch: 1 Luck');
    ev = C.evoPet(F, 'octopus', 'proc', { label: 'TWO ARMS!' });
    h.ok(ev.length === 1 && ev[0].text === 'TWO ARMS!', 'a proc only kind');
    // Frost Light: a spotlit item on a Frozen target resolves twice
    F = efight(['femur', 'femur'], []);
    F.enemies[0].status.freeze = 2;
    const a = F.bin[0]; a.spot = 1;
    let h0 = F.enemies[0].hp;
    C.useGrab(F); ev = C.play(F, a); C.grabDone(F, 1);
    const twice = h0 - F.enemies[0].hp;
    h.ok(ev.some(e => e.t === 'proc' && e.id === 'pet:firefly'), 'Frost Light fires its proc');
    const b = F.bin.find(x => x.id === 'femur');
    F.enemies[0].status.freeze = 2; h0 = F.enemies[0].hp;
    C.useGrab(F); C.play(F, b); C.grabDone(F, 1);
    h.eq(twice, (h0 - F.enemies[0].hp) * 2, 'twice the damage of an unlit one');
    F = efight(['femur'], []);
    F.bin[0].spot = 1; h0 = F.enemies[0].hp;
    C.useGrab(F); ev = C.play(F, F.bin[0]); C.grabDone(F, 1);
    h.ok(!ev.some(e => e.t === 'proc' && e.id === 'pet:firefly'), 'not Frozen: no Frost Light');
  });

  h.test('evolve: the new combos fire in a fight', () => {
    const grab = (F, ids) => { C.useGrab(F); for (const id of ids) { const i = F.bin.find(b => b.id === id && F.grab.insts.indexOf(b) < 0); if (i) C.play(F, i); } return C.grabDone(F, ids.length); };
    let F = efight(['excalibur_claw', 'femur', 'crisp_apple'], []);
    h.ok(grab(F, ['excalibur_claw', 'femur', 'crisp_apple']).some(e => e.t === 'combo' && e.id === 'legend_rising'), 'Legend Rising');
    F = efight(['excalibur_claw', 'plague_needle'], []);
    h.ok(grab(F, ['excalibur_claw', 'plague_needle']).some(e => e.t === 'combo' && e.id === 'twin_legends'), 'Twin Legends');
    F = efight(['femur', 'bouncy_ball'], [], { pet: { id: 'cat' } });
    h.ok(grab(F, ['femur', 'bouncy_ball']).some(e => e.t === 'combo' && e.id === 'fetch'), 'Fetch! with a pet');
    F = efight(['femur', 'bouncy_ball'], []);
    h.ok(!grab(F, ['femur', 'bouncy_ball']).some(e => e.t === 'combo' && e.id === 'fetch'), 'no Fetch! without one');
    F = efight(['quail_egg', 'lucky_penny'], [], { pet: { id: 'goose' } });
    h.ok(grab(F, ['quail_egg', 'lucky_penny']).some(e => e.t === 'combo' && e.id === 'nest_egg'), 'Nest Egg with the goose');
  });

  h.test('evolve: a 30 turn fuzz with every evolved item and the recipe relics', () => {
    const relics = D.EVO_IDS.map(id => D.EVOLUTIONS[id].relic);
    const F = C.newFight(erun(D.EVO_IDS.concat(['rock', 'femur', 'prize_marble']), relics, { hp: 300, maxHp: 300, pet: { id: 'goose' } }), ['rat', 'slime', 'rat'], U7.rng(71));
    h.eq(F.evos.length, D.EVO_IDS.length, 'every aura in the fight');
    const rng = U7.rng(9);
    for (let t = 0; t < 30 && F.phase !== 'over'; t++) {
      while (F.phase === 'player' && F.player.grabs > 0 && C.useGrab(F)) {
        const n = rng.int(0, 3);
        for (let k = 0; k < n && F.bin.length && F.phase === 'player'; k++) C.play(F, F.bin[rng.int(0, F.bin.length - 1)], rng.int(0, F.enemies.length - 1));
        C.grabDone(F, n);
      }
      if (F.phase === 'player') C.endTurn(F);
      for (const e of F.enemies) if (e.alive && e.hp < 50) e.hp = e.maxHp;
      if (F.player.hp < 100) F.player.hp = 300;
      const b = bad(F);
      if (b) { h.ok(false, `turn ${t}: ${b}`); break; }
    }
    h.ok(!bad(F), 'clean after 30 turns');
  });
}

// ---------- round 8: the alternate bosses' signatures and the story callbacks (DESIGN.md "Stories, the rival and alternate bosses (round 8)")
{
  const L8 = boot({ only: ['util', 'data', 'combat'] });
  const C = L8.COMBAT, D = L8.DATA, U8 = L8.U;
  if (D && D.STO) {
    const IDS = Object.keys(D.ITEMS).filter(id => D.ITEMS[id].rarity !== 'junk' && !D.ITEMS[id].bag && !D.ITEMS[id].hot);
    const srun = (extra, n) => Object.assign({ hp: 400, maxHp: 400, act: 1, relics: [], claw: { grabs: 3 }, gold: 40, bin: IDS.slice(0, n || 14).map((x, i) => ({ uid: 's' + i, id: x, plus: false })) }, extra || {});
    const bossEv = (list, k) => list.filter(e => e.t === 'boss' && e.k === k);
    const count = (F) => F.bin.length + F.used.length + F.exhausted.length + F.stolen.length + (F.digested || []).length + F.purged.length
      + F.enemies.reduce((a, e) => a + (e.belly || []).length, 0) + (F.stoIce ? F.stoIce.insts.length : 0) + (F.buried || []).length;
    const calm = (F) => { for (const e of F.enemies) { e.hp = e.maxHp = 500; e.block = 0; e.status = {}; } F.player.block = 0; F.player.status = {}; F.events.length = 0; };
    const sig = (F) => { F.enemies[0].sigForce = true; F.player.hp = 400; return C.endTurn(F); };

    h.test('story bosses: the Plushie Queen\'s plushies soak every hit on her', () => {
      const F = C.newFight(srun(), ['plushqueen'], U8.rng(4));
      const e = F.enemies[0];
      const ev = sig(F);
      const p = bossEv(ev, 'plush')[0];
      h.ok(p && p.items.length === 3 && C.stoPlush(F) === 3, 'Plush Parade: three plushies in the bin');
      h.ok(p.items.every(i => i.junk && i.temp && D.ITEMS[i.id].sto === 'plush'), 'fight-only junk');
      calm(F);
      let got = C.damage(F, F.player, e, 10);
      h.eq(got, 7, 'three plushies soak 3 of a 10');
      h.ok(F.events.some(x => x.t === 'text' && x.str === 'FLUFF -3'), 'and say so');
      h.eq(C.damage(F, F.player, e, 2), 0, 'a small hit vanishes into the fluff');
      h.eq(C.damage(F, null, e, 10, { fixed: true }), 10, 'fixed damage (a bomb, thorns) goes straight through');
      const plush = F.bin.find(i => D.ITEMS[i.id].sto === 'plush');
      const b0 = F.player.block;
      C.play(F, plush);
      h.ok(F.player.block === b0 + 2 && C.stoPlush(F) === 2 && F.exhausted.includes(plush), 'grabbed out: 2 Block, one plush fewer, gone for the fight');
      h.eq(C.damage(F, F.player, e, 10), 8, 'two left soak 2');
      for (let k = 0; k < 4; k++) { F.phase = 'player'; sig(F); }
      h.ok(C.stoPlush(F) >= D.ENEMIES.plushqueen.sig.max, 'parades fill the bin up to sig.max (a Royal Decree may add one more)');
      calm(F);
      h.eq(C.damage(F, F.player, e, 20), 20 - D.ENEMIES.plushqueen.sig.max, 'the soak never passes sig.max');
      const G = C.newFight(srun(), ['plushqueen'], U8.rng(5));
      G.enemies[0].enraged = true;
      h.eq(bossEv(sig(G), 'plush')[0].items.length, 4, 'enraged: one more a parade');
      const H = C.newFight(srun({ endless: { loop: 1, mix: 'plushqueen' } }), ['hoard'], U8.rng(3));
      h.ok(H.enemies[0].def.sig.id === 'plush', 'an Endless Hoard can borrow the parade');
      sig(H); calm(H);
      h.ok(C.stoPlush(H) > 0 && C.damage(H, H.player, H.enemies[0], 10) === 10 - C.stoPlush(H), 'and its plushies soak for it');
    });
    h.test('story bosses: the Conveyor King\'s belt, crates, the jam, the stop', () => {
      const F = C.newFight(srun({ act: 2 }), ['conveyorking'], U8.rng(4));
      const ev = sig(F);
      const b = bossEv(ev, 'belt')[0];
      h.ok(b && F.conv && F.conv.v === 70 && F.conv.dir === -1, 'Belt Drive: the floor runs away from the chute for your turn');
      h.ok(b.items.length === 2 && b.items.every(i => i.id === 'sto_crate'), 'two crates ride in');
      const crate = F.bin.find(i => i.id === 'sto_crate'), b0 = F.player.block;
      C.play(F, crate);
      h.eq(F.player.block, b0 + 3, 'a crate grabbed out: cardboard armour');
      h.ok(!!F.conv, 'a crate does not jam it');
      const metal = F.bin.find(i => (D.ITEMS[i.id].tags || []).includes('metal'));
      const jam = C.play(F, metal);
      h.ok(bossEv(jam, 'beltJam').length === 1 && !F.conv, 'a metal prize delivered jams the belt');
      const G = C.newFight(srun({ act: 2 }), ['conveyorking'], U8.rng(6));
      sig(G);
      h.ok(!!G.conv, 'running');
      const off = C.endTurn(G);
      h.ok(bossEv(off, 'beltOff').length === 1, 'your turn ends: it stops');
      const E = C.newFight(srun({ act: 2 }), ['conveyorking'], U8.rng(7));
      E.enemies[0].enraged = true;
      sig(E);
      h.eq(E.conv.v, 98, 'overtime: faster');
      C.damage(E, E.player, E.enemies[0], 99999, { pierce: true });
      h.ok(!E.conv, 'the King goes down: the belt stops');
    });
    h.test('story bosses: the Arctic Arcade\'s growing ice block', () => {
      const F = C.newFight(srun({ act: 3 }), ['arcticarcade'], U8.rng(4));
      const n0 = count(F), real0 = F.bin.filter(i => !i.junk).length;
      let ev = sig(F);
      const g1 = bossEv(ev, 'glacier')[0];
      h.ok(g1 && g1.insts.length === 1 && g1.n === 1 && g1.inst.id === 'sto_glacier1', 'one item freezes into a block');
      h.ok(F.bin.includes(g1.inst) && !F.bin.includes(g1.insts[0]) && C.stoIce(F).insts[0] === g1.insts[0], 'the item leaves the bin, the block sits in it');
      h.eq(count(F), n0 + 1, 'nothing vanished (the block is new)');
      F.phase = 'player'; ev = sig(F);
      const g2 = bossEv(ev, 'glacier')[0];
      h.ok(g2 && g2.inst === g1.inst && g1.inst.id === 'sto_glacier2' && C.stoIce(F).insts.length === 2, 'the same block grows a size');
      F.phase = 'player'; F.enemies[0].enraged = true; ev = sig(F);
      h.ok(bossEv(ev, 'glacier')[0].insts.length === 2 && g1.inst.id === 'sto_glacier4', 'enraged: two at once');
      F.phase = 'player'; calm(F); F.enemies[0].status = {};
      const hp0 = F.enemies[0].hp;
      const out = C.play(F, g1.inst);
      const br = bossEv(out, 'glacierBreak')[0];
      h.ok(br && br.smash && br.insts.length === 4 && br.v === 20, 'delivered: it smashes, four come back, 5 each');
      h.eq(F.enemies[0].hp, hp0 - 20, 'the boss takes it');
      h.ok(C.stoIce(F).insts.length === 0 && br.insts.every(i => F.bin.includes(i) || F.used.includes(i)), 'every frozen item is back');
      h.eq(F.bin.filter(i => !i.junk).length + F.used.filter(i => !i.junk).length, real0, 'no real item lost');
      // its death melts the block open
      const G = C.newFight(srun({ act: 3 }), ['arcticarcade'], U8.rng(8));
      sig(G);
      const inside = C.stoIce(G).insts.slice();
      const d = C.damage(G, G.player, G.enemies[0], 99999, { pierce: true });
      h.ok(d > 0 && inside.every(i => G.bin.includes(i)) && G.events.some(x => x.t === 'boss' && x.k === 'glacierBreak' && !x.smash), 'it goes down: the ice melts, the items come back');
      // the floor: never below BEST_FLOOR real items
      const S5 = C.newFight(srun({ act: 3 }, 5), ['arcticarcade'], U8.rng(9));
      for (let k = 0; k < 4; k++) { S5.phase = 'player'; sig(S5); }
      h.eq(S5.bin.filter(i => !i.junk).length + S5.used.filter(i => !i.junk).length, 4, 'a small bin keeps four real items');
    });
    h.test('story bosses: 24 turns each, clean, nothing vanishes', () => {
      for (const id of ['plushqueen', 'conveyorking', 'arcticarcade', 'gary', 'cardshark']) {
        const F = C.newFight(srun({ act: D.ENEMIES[id].act }), [id], U8.rng(11));
        const rng = U8.rng(21), n0 = count(F);
        let ok = true;
        for (let turn = 0; turn < 24 && F.phase !== 'over'; turn++) {
          try {
            while (F.phase === 'player' && F.player.grabs > 0 && C.useGrab(F)) {
              const n = rng.int(0, 2);
              for (let k = 0; k < n && F.bin.length && F.phase === 'player'; k++) C.play(F, F.bin[rng.int(0, F.bin.length - 1)], 0);
              C.grabDone(F, n);
            }
            if (F.phase === 'player') C.endTurn(F);
            F.player.hp = Math.max(F.player.hp, 200);
          } catch (err) { ok = false; h.ok(false, id + ' threw ' + err.stack); break; }
          if (count(F) < n0 || !Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp))) { ok = false; h.ok(false, `${id}: broke at turn ${turn}`); break; }
        }
        h.ok(ok, `${id}: 24 turns clean`);
      }
    });
    h.test('story callbacks: the crab, the ghost, the sabotage, Gary\'s gear', () => {
      const F = C.newFight(srun({ act: 2 }), ['rat', 'slime'], U8.rng(3));
      calm(F);
      F.enemies[0].hp = 300; F.enemies[1].hp = 450;
      const ev = C.stoAlly(F, 'crab', 1);
      const a = ev.find(x => x.t === 'sto' && x.k === 'ally');
      h.ok(a && a.id === 'crab' && a.idx === 1 && a.v === 9 && a.n === 2, 'the crab goes for the strongest (6 + 3 in act 2, twice)');
      h.eq(F.enemies[1].hp, 450 - 18, 'two pinches land');
      h.eq(F.player.block, 5, 'and it covers you');
      const F2 = C.newFight(srun({ act: 1 }), ['rat'], U8.rng(3));
      calm(F2);
      C.stoAlly(F2, 'crab', 2);
      h.ok(F2.enemies[0].hp === 500 - 24 && F2.player.block === 10, 'a fed crab hits twice as hard');
      const F3 = C.newFight(srun(), ['rat', 'slime'], U8.rng(3));
      calm(F3);
      C.stoAlly(F3, 'ghost', 1);
      h.ok(F3.enemies.every(e => e.status.weak === 2) && F3.player.status.dodge === 1, 'the ghost: every foe Weak, a Dodge for you');
      h.eq(C.stoAlly(F3, 'nobody', 1).length, 0, 'an unknown friend does nothing');
      const B = C.newFight(srun(), ['plushqueen'], U8.rng(3));
      const hp0 = B.enemies[0].hp;
      const sv = C.stoSabotage(B, { weak: 2, vuln: 3 }, 0.12);
      h.ok(sv.some(x => x.t === 'sto' && x.k === 'sabotage') && B.enemies[0].hp === hp0 - Math.round(hp0 * 0.12), 'the boss starts 12% down');
      h.ok(B.enemies[0].status.vuln === 3 && B.enemies[0].status.weak === 2, 'Vulnerable and Weak');
      h.eq(C.stoSabotage(C.newFight(srun(), ['rat'], U8.rng(3)), { vuln: 2 }, 0.12).length, 0, 'no boss: nothing to sabotage');
      const G0 = C.newFight(srun({ act: 3 }), ['gary'], U8.rng(3)), G3 = C.newFight(srun({ act: 3 }), ['gary'], U8.rng(3));
      C.stoGear(G0, 0); C.stoGear(G3, 3);
      h.ok(G3.enemies[0].maxHp === Math.round(G0.enemies[0].maxHp * 1.18) && G3.enemies[0].status.str === 1 && !G0.enemies[0].status.str, 'Gary\'s jacket: more hp and a Strength');
      const hpNow = G3.enemies[0].maxHp;
      C.stoGear(G3, 4);
      h.eq(G3.enemies[0].maxHp, hpNow, 'only once a fight');
    });
  }
}

// ---------- round 8: Mama Mech's scrap turret (DESIGN.md "Mama Mech and two new claws")
{
  const LM = boot({ only: ['util', 'data', 'combat'] });
  const C = LM.COMBAT, D = LM.DATA, UM = LM.U;
  if (D && D.CHARACTERS && D.CHARACTERS.engineer) {
    const MBIN = D.CHARACTERS.engineer.bin;
    const mrun = (extra, bin) => Object.assign({ hp: 400, maxHp: 400, act: 1, char: 'engineer', relics: ['socket_set'], claw: { grabs: 3 }, gold: 40,
      bin: (bin || MBIN).map((id, i) => ({ uid: 'm' + i, id, plus: false })) }, extra || {});
    const mfight = (extra, bin, enc, seed) => {
      const F = C.newFight(mrun(extra, bin), enc || ['rat'], UM.rng(seed || 7));
      for (const e of F.enemies) { e.hp = e.maxHp = 500; e.block = 0; e.status = {}; }
      return F;
    };
    const grabOf = (F, ids) => {
      C.useGrab(F);
      const out = [];
      for (const id of ids) { const i = F.bin.find(b => b.id === id && F.grab.insts.indexOf(b) < 0); if (i && F.phase === 'player') out.push(...C.play(F, i)); }
      out.push(...C.grabDone(F, ids.length));
      return out;
    };
    const turEv = (list, k) => list.filter(e => e.t === 'turret' && (!k || e.k === k));

    h.test('round 8: Mama Mech starts with a Lv 1 turret (Socket Set), nobody else has one', () => {
      const F = mfight();
      h.ok(F.tur && F.tur.parts === 2 && F.tur.lv === 1, 'two parts from the Socket Set: Lv 1');
      h.eq(F.player.block, 3, 'and 3 Block');
      h.ok(turEv(F.events, 'up').some(e => e.lv === 1 && e.name === 'PEA SHOOTER'), 'a level-up event for the game');
      h.eq(C.turretOf(F), F.tur, 'turretOf');
      const K = mfight({ char: 'knight', relics: [] });
      h.eq(K.tur, null, 'the Knight has no turret');
      h.eq(C.turretParts(K, 3).length, 0, 'feeding a fight without a turret does nothing');
      const M0 = mfight({ relics: [] });
      h.ok(M0.tur && M0.tur.parts === 0 && M0.tur.lv === 0, 'Mama without her starter: a bare mount');
      for (let lv = 0; lv <= 5; lv++) h.eq(C.turLv(C.TUR.need[lv]), lv, 'turLv at ' + C.TUR.need[lv] + ' parts');
      h.eq(C.turLv(C.TUR.need[2] - 1), 1, 'one part short stays down');
    });

    h.test('round 8: Blueprints build it for anyone, and give Mama 3 more', () => {
      const K = mfight({ char: 'knight', relics: ['blueprints'] });
      h.ok(K.tur && K.tur.parts === 0, 'the Knight gets a bare turret');
      const M = mfight({ relics: ['socket_set', 'blueprints'] });
      h.ok(M.tur.parts === 5 && M.tur.lv === 2, 'Mama: 2 + 3 parts, Lv 2');
      h.ok(D.RELICS.blueprints.rules && D.RELICS.blueprints.rules.turret === 1 && D.RELIC_RULES.includes('turret'), 'a rule relic');
    });

    h.test('round 8: metal parts, `part` counts, the volley at the end of the turn', () => {
      const F = mfight({}, MBIN.concat(['pipe_wrench', 'toolbox', 'mech_core']));
      F.events.length = 0;
      let ev = grabOf(F, ['hex_bolt']);
      h.eq(F.tur.parts, 3, 'a hex bolt: one part');
      h.ok(turEv(ev, 'part').some(e => e.n === 1 && e.parts === 3), 'a part event');
      ev = grabOf(F, ['crisp_apple']);
      h.eq(F.tur.parts, 3, 'an apple is not a part');
      grabOf(F, ['pipe_wrench']);
      h.ok(F.tur.parts === 5 && F.tur.lv === 2, 'a wrench is two: Lv 2');
      const hp0 = F.enemies[0].hp;
      F.enemies[0].block = 0;
      const e2 = C.turretFire(F);
      const shots = turEv(e2, 'fire');
      h.eq(shots.length, C.TUR.shots[2], 'Lv 2 fires two shots');
      h.eq(hp0 - F.enemies[0].hp, C.TUR.shots[2] * C.TUR.dmg[2], 'each for its level');
      h.ok(shots.every(s => s.idx === 0 && !s.all), 'at the target');
      // the real end of the turn fires too (before the enemies act)
      const hp1 = F.enemies[0].hp;
      const et = C.endTurn(F);
      h.ok(turEv(et, 'fire').length === C.TUR.shots[2] && hp1 - F.enemies[0].hp >= C.TUR.shots[2] * C.TUR.dmg[2], 'endTurn fires the volley');
    });

    h.test('round 8: Lv 5 (MEGA MECH) ends on a shot at ALL, extra parts are overclock shots', () => {
      const F = mfight({}, null, ['rat', 'rat']);
      for (const e of F.enemies) { e.hp = e.maxHp = 500; }
      C.turretParts(F, 30, 'TEST');
      h.eq(F.tur.lv, 5, 'maxed');
      h.eq(F.tur.parts, C.TUR.need[5], 'parts stop at the top');
      h.ok(F.tur.over > 0 && F.events.some(e => e.t === 'turret' && e.k === 'over'), 'the rest fired as overclock shots');
      const a0 = F.enemies[0].hp, b0 = F.enemies[1].hp;
      const ev = turEv(C.turretFire(F), 'fire');
      h.eq(ev.length, C.TUR.shots[5], 'four shots');
      h.ok(ev[ev.length - 1].all && ev.slice(0, -1).every(s => !s.all), 'the last one hits ALL');
      h.ok(b0 - F.enemies[1].hp === C.TUR.dmg[5] && a0 - F.enemies[0].hp === C.TUR.dmg[5] * 4, 'the mega shot reaches the second rat');
      h.ok(D.achCheck({ kind: 'ev', ev: { t: 'turret', k: 'up', lv: 5 } }, {}).includes('fully_armed'), 'Fully Armed at Lv 5');
      h.ok(!D.achCheck({ kind: 'ev', ev: { t: 'turret', k: 'up', lv: 4 } }, {}).includes('fully_armed'), 'not at Lv 4');
    });

    h.test('round 8: Armor-Piercing Rounds and the Grease Gun, with and without a turret', () => {
      const F = mfight({ relics: ['socket_set', 'armor_piercing'] });
      h.eq(F.tur.amp, 2, 'AP: +2 a shot');
      const hp0 = F.enemies[0].hp;
      C.turretFire(F);
      h.eq(hp0 - F.enemies[0].hp, C.TUR.dmg[1] + 2, 'a Lv 1 shot for 5');
      const K = mfight({ char: 'knight', relics: ['armor_piercing'] }, ['hex_bolt', 'tin_plate', 'crisp_apple', 'spring_coil']);
      const k0 = K.enemies[0].hp;
      grabOf(K, ['hex_bolt', 'spring_coil']);
      h.eq(k0 - K.enemies[0].hp, 4 + 6 + 3, 'no turret: 2 metal in a grab zaps for 3 more');
      const G = mfight({ relics: ['socket_set', 'grease_gun'] });
      G.player.block = 0;
      D.RELICS.grease_gun.hooks.onTurnEnd(G);
      h.eq(G.player.block, 2, 'Grease Gun: 2 Block per turret level');
      const N = mfight({ char: 'knight', relics: ['grease_gun'] }, ['hex_bolt', 'tin_plate', 'spring_coil', 'crisp_apple']);
      grabOf(N, ['hex_bolt', 'spring_coil']);
      N.player.block = 0;
      D.RELICS.grease_gun.hooks.onTurnEnd(N);
      h.eq(N.player.block, 4, 'no turret: 2 per metal item this turn');
      const J = mfight({}, MBIN.concat(['rock']));
      const p0 = J.tur.parts;
      const r = J.bin.find(b => b.id === 'rock');
      if (r) { C.useGrab(J); C.play(J, r); C.grabDone(J, 1); h.eq(J.tur.parts, p0 + 1, 'Socket Set: junk is scrap'); }
    });

    h.test('round 8: the evolutions feed the turret too', () => {
      const F = mfight({ evos: ['thunder_bolt'] });
      const p0 = F.tur.parts;
      h.ok(D.EVOLUTIONS.thunder_bolt.from === 'hex_bolt' && D.EVOLUTIONS.mech_plating.from === 'tin_plate', 'the recipes');
      D.EVO_FX['evo:thunder_bolt'].hooks.onTurnStart(F);
      h.eq(F.tur.parts, p0 + 1, 'Live Wire: a free part a turn');
      F.player.block = 0;
      D.EVO_FX['evo:mech_plating'].hooks.onTurnEnd(F);
      h.eq(F.player.block, 2 * F.tur.lv, 'Armor Up: 2 Block a level');
    });

    h.test('round 8: 40 turns of Mama Mech stay clean (fuzz)', () => {
      const rng = UM.rng(88);
      for (const seed of [1, 2, 3]) {
        const F = C.newFight(mrun({ relics: ['socket_set', 'blueprints', 'armor_piercing', 'grease_gun'] }, MBIN.concat(['toolbox', 'mech_core', 'tesla_coil', 'mech_arm', 'rivet_gun'])), ['rat', 'slime'], UM.rng(seed));
        let ok = true;
        for (let t = 0; t < 40 && F.phase !== 'over'; t++) {
          for (let g = 0; g < 3 && F.phase === 'player'; g++) {
            const ids = F.bin.filter(() => rng() < 0.2).slice(0, 3).map(b => b.id);
            grabOf(F, ids);
          }
          if (F.phase === 'player') C.endTurn(F);
          if (!Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp)) || (F.tur && !(F.tur.lv >= 0 && F.tur.lv <= 5))) { ok = false; break; }
          if (F.phase === 'over') break;
        }
        h.ok(ok, 'seed ' + seed + ': clean');
        h.ok(F.tur && F.tur.shots > 0 && F.tur.dealt > 0, 'seed ' + seed + ': the turret did its share');
      }
    });
  }
}

// ---------- round 9: enemy families (DESIGN.md "Enemy families (round 9)") ----------
if (hasData) {
  const LF = boot({ only: ['util', 'data', 'combat'] });
  const C = LF.COMBAT, D = LF.DATA, UF = LF.U;
  const FB = ['rusty_sword', 'rusty_sword', 'dented_shield', 'dented_shield', 'apple', 'rusty_sword', 'dented_shield', 'apple'];
  const frun = (extra) => Object.assign({ hp: 900, maxHp: 900, act: 1, relics: [], claw: { grabs: 3 }, gold: 40, bin: FB.map((id, i) => ({ uid: 'f' + i, id: D.ITEMS[id] ? id : 'rock', plus: false })) }, extra || {});
  // a family fight with tough members (their own numbers otherwise) and no affixes
  const ffight = (ids, extra, seed) => {
    const F = C.newFight(frun(Object.assign({ act: D.ENEMIES[ids[0]].act }, extra)), ids, UF.rng(seed || 5));
    for (const e of F.enemies) { e.hp = e.maxHp = 900; e.affix = []; e.status = {}; }
    F.events.length = 0;
    return F;
  };
  const ev = (F, k) => F.events.filter(x => x.t === 'fam' && x.k === k);
  const lossOf = (F) => { const T = C.qaThreat(F), hp0 = F.player.hp; C.endTurn(F); return [T.loss, hp0 - F.player.hp]; };

  h.test('families: the data and the bond state', () => {
    h.eq(D.FAM_IDS.join(','), 'band,vending,choir', 'three families');
    for (const f of D.FAM_IDS) {
      const c = D.FAM[f];
      h.eq(c.members.length, 3, `${f}: three members`);
      h.ok(c.members.every(id => D.ENEMIES[id] && D.ENEMIES[id].fam === f && D.ENEMIES[id].act === c.act), `${f}: members of act ${c.act}`);
      h.ok(D.ENCOUNTERS[c.act].normal.some(enc => enc.length === 3 && c.members.every(id => enc.includes(id))), `${f}: the whole family is an encounter`);
      h.eq(D.famsIn(c.members).join(','), f, `${f}: famsIn`);
    }
    const F = ffight(D.FAM.band.members);
    h.ok(F.fam && F.fam.ids.join() === 'band' && F.fam.cres === 0 && F.fam.max === D.FAM.band.max, 'a band fight carries the Crescendo');
    const P = C.newFight(frun(), ['rat', 'rat'], UF.rng(5));
    h.eq(P.fam, null, 'a fight without a family has no family state');
    h.eq(C.famState(P), null, 'famState null');
  });

  h.test('families: the band builds a Crescendo, then plays a SOLO', () => {
    const F = ffight(D.FAM.band.members);
    const [dr, bs, sg] = F.enemies;
    let r = lossOf(F);
    h.eq(r[0], r[1], 'turn 1: the preview is exact');
    h.eq(F.fam.cres, 4, 'turn 1: drummer 2 + bassist 1 + singer 1');
    h.ok(ev(F, 'cres').length >= 1 || F.fam.cres === 4, 'cres events');
    F.events.length = 0;
    r = lossOf(F);
    h.eq(r[0], r[1], 'turn 2: exact');
    // the move each pattern would have played next (the SOLO cut in front of it)
    const next = [dr, bs, sg].map(e => e.def.moves[e.def.pattern[e.cyc % e.def.pattern.length]].id);
    h.eq(F.fam.cres, 8, 'turn 2: full');
    h.ok([dr, bs, sg].every(e => e.intent.fam === 'solo' && e.intent.k === 'attack'), 'every member telegraphs its SOLO');
    h.ok(ev(F, 'soloReady').length === 1, 'soloReady event');
    const q = C.qaIntent(F, dr);
    h.eq(q.fam, 'solo', 'qaIntent knows the SOLO');
    h.eq(q.band, 3, 'three in it');
    const base = Math.round(D.FAM.band.solo.fam_drummer * dr.dmgMul);
    h.eq(C.famHit(F, dr), Math.round(base * 1.5), 'harmony: +25% per bandmate (two)');
    h.ok(/SOLO/.test(C.intentText(dr)), 'the intent text says SOLO: ' + C.intentText(dr));
    const T = C.qaThreat(F);
    F.events.length = 0;
    const hp0 = F.player.hp;
    C.endTurn(F);
    h.eq(hp0 - F.player.hp, T.loss, 'the SOLO lands exactly as previewed (' + T.loss + ')');
    h.ok(T.loss >= 3 * Math.round(base * 1.5) - 3, 'a big shared attack');
    h.eq(ev(F, 'solo').length, 1, 'one spotlight for the whole SOLO');
    h.eq(F.fam.cres, 0, 'the meter empties after the SOLO');
    h.eq([dr, bs, sg].map(e => e.intent.id).join(), next.join(), 'each pattern resumes where the SOLO cut in');
    h.eq(F.fam.solos, 1, 'one SOLO played');
    // a frozen member keeps no beat
    const G = ffight(D.FAM.band.members);
    G.enemies[0].status.freeze = 1;
    C.endTurn(G);
    h.eq(G.fam.cres, 2, 'a frozen drummer adds nothing (bassist + singer)');
    // a duo builds slower
    const H = ffight(['fam_bassist', 'fam_singer']);
    C.endTurn(H); C.endTurn(H); C.endTurn(H);
    h.eq(H.fam.cres, 6, 'a duo without the drummer: 2 a turn');
  });

  h.test('families: knock one out and the SOLO is off', () => {
    const F = ffight(D.FAM.band.members);
    C.endTurn(F); C.endTurn(F);
    h.ok(F.enemies.every(e => e.intent.fam === 'solo'), 'the SOLO is telegraphed');
    F.events.length = 0;
    C.damage(F, F.player, F.enemies[2], 9999, { pierce: true });
    h.ok(!F.enemies[2].alive, 'the singer is down');
    h.ok(F.enemies[0].intent.k === 'fumble' && F.enemies[1].intent.k === 'fumble', 'the rest lose the beat');
    h.eq(ev(F, 'cancel').length, 1, 'a cancel event');
    h.eq(F.fam.cres, 0, 'the meter empties');
    h.eq(C.qaThreat(F).raw, 0, 'the preview says nothing is coming');
    h.eq(C.intentText(F.enemies[0]), 'Lost the beat', 'the text says so');
    const hp0 = F.player.hp;
    C.endTurn(F);
    h.eq(F.player.hp, hp0, 'no SOLO lands');
    h.ok(F.enemies.filter(e => e.alive).every(e => e.intent.fam !== 'solo' && e.intent.k !== 'fumble'), 'they go back to their patterns');
    // a loss with no SOLO pending drops the meter
    const G = ffight(D.FAM.band.members);
    C.endTurn(G);
    h.eq(G.fam.cres, 4, '4 after a turn');
    C.damage(G, G.player, G.enemies[1], 9999, { pierce: true });
    h.eq(G.fam.cres, 4 - D.FAM.band.drop, 'a member lost drops the meter by ' + D.FAM.band.drop);
  });

  h.test('families: the Vending Gang restocks, lobs cans, makes change', () => {
    const F = ffight(D.FAM.vending.members, { gold: 30 });
    const [pop, snack, chg] = F.enemies;
    pop.hp = 500; chg.hp = 800;
    snack.intent = D.ENEMIES.fam_snack.moves.find(m => m.k === 'restock');
    pop.intent = D.ENEMIES.fam_pop.moves.find(m => m.k === 'cans');
    chg.intent = D.ENEMIES.fam_change.moves.find(m => m.k === 'change');
    const bin0 = F.bin.length;
    for (const e of F.enemies) h.ok(!/undefined|NaN/.test(C.intentText(e)), 'intent text: ' + C.intentText(e));
    const r = lossOf(F);
    h.eq(r[0], r[1], 'the preview is exact (no hits)');
    const re = ev(F, 'restock')[0];
    h.ok(re && re.to === 0, 'the snack machine restocks the most dented friend (Pop Top)');
    h.eq(pop.hp, 512, 'healed 12');
    const cans = ev(F, 'cans')[0];
    h.ok(cans && cans.items.length === 2 && cans.items.every(i => i.id === 'fam_can' && i.junk), 'two empty cans');
    h.ok(F.bin.length >= bin0 + 2 - 1 && F.bin.concat(F.used).filter(i => i.id === 'fam_can').length === 2, 'they land in your bin');
    h.ok(D.ITEMS.fam_can && D.ITEMS.fam_can.rarity === 'junk' && Object.keys(D.ITEMS).indexOf('fam_can') < 0, 'the can is junk nobody lists');
    const ch = ev(F, 'change')[0];
    h.ok(ch && ch.gold === 12 && ch.armor === 3, 'the Change Machine takes 12 gold for 3 Armor');
    h.eq(C.gold(F), 18, 'your gold is 12 lighter');
    h.ok(F.enemies.every(e => e.status.armor >= 3), 'Armor for the whole gang');
    h.eq(chg.bank, 12, 'banked');
    const g0 = C.gold(F);
    C.damage(F, F.player, chg, 99999, { pierce: true });
    h.eq(C.gold(F), g0 + 12, 'break it and it pays out');
    h.eq(ev(F, 'payout').length, 1, 'a payout event');
    // broke: no change, a little Block
    const G = ffight(D.FAM.vending.members, { gold: 0 });
    G.enemies[2].intent = D.ENEMIES.fam_change.moves.find(m => m.k === 'change');
    C.endTurn(G);
    h.eq(C.gold(G), 0, 'nothing to take');
    h.ok(G.enemies[2].status.armor == null, 'no Armor from nothing');
  });

  h.test('families: the choir hums in sync, scrambles the pile, and gets angry', () => {
    const F = ffight(D.FAM.choir.members);
    let r = lossOf(F); h.eq(r[0], r[1], 'turn 1 exact');
    r = lossOf(F); h.eq(r[0], r[1], 'turn 2 exact');
    h.ok(F.enemies.every(e => e.intent.fam === 'chorus'), 'all three hum on the same step');
    const q = C.qaIntent(F, F.enemies[0]);
    h.eq(q.band, 3, 'three globes humming');
    h.eq(C.famHit(F, F.enemies[0]), Math.round(Math.round(6 * F.enemies[0].dmgMul) * 1.5), 'harmony x1.5');
    F.events.length = 0;
    r = lossOf(F); h.eq(r[0], r[1], 'the hum lands exactly');
    h.eq(ev(F, 'scramble').length, 1, 'one scramble for the whole choir');
    h.eq(ev(F, 'hum').length, 3, 'every globe hums');
    // a frozen globe falls out of step, then back in
    const G = ffight(D.FAM.choir.members);
    G.enemies[1].status.freeze = 1;
    C.endTurn(G);
    h.ok(G.enemies.every(e => e.cyc === G.enemies[0].cyc) && G.enemies.every(e => e.moveIdx === G.enemies[0].moveIdx), 'resynced after the phase');
    C.endTurn(G);
    h.ok(G.enemies.every(e => e.intent.fam === 'chorus'), 'and they hum together on the next step');
    // frozen on the hum turn: two globes hum, for less
    const H = ffight(D.FAM.choir.members);
    C.endTurn(H); C.endTurn(H);
    H.enemies[2].status.freeze = 1;
    h.eq(C.qaIntent(H, H.enemies[0]).band, 2, 'a frozen globe does not hum');
    r = lossOf(H); h.eq(r[0], r[1], 'two-globe hum exact');
    // a globe shattered on your turn: the rest get angry at once
    const A = ffight(D.FAM.choir.members);
    const s0 = C.qaIntent(A, A.enemies[1]).hit;
    C.damage(A, A.player, A.enemies[0], 99999, { pierce: true });
    h.ok(A.enemies[1].status.str === D.FAM.choir.angry && A.enemies[2].status.str === D.FAM.choir.angry, 'the rest gain Strength');
    h.ok(A.enemies[1].famAngry === 1, 'marked angry');
    h.eq(ev(A, 'shatter').length, 1, 'a shatter event');
    h.eq(ev(A, 'angry').length, 1, 'an angry event');
    h.ok(C.qaIntent(A, A.enemies[1]).hit > s0, 'the telegraph shows the angrier hit');
    r = lossOf(A); h.eq(r[0], r[1], 'exact after the anger');
    // a globe that falls to its own Poison on their turn: the anger waits for the phase to end
    const B = ffight(D.FAM.choir.members);
    B.enemies[0].status.poison = 5; B.enemies[0].hp = 3;
    r = lossOf(B);
    h.eq(r[0], r[1], 'the phase a globe shatters in stays exact');
    h.ok(!B.enemies[0].alive && B.enemies[1].status.str === D.FAM.choir.angry, 'the anger lands as the phase ends');
  });

  h.test('families: every preview exact over every family encounter (seeds, freezes, kills, Vulnerable)', () => {
    let same = 0, n = 0;
    const miss = [];
    const encs = [];
    for (const act of [1, 2, 3]) for (const enc of D.ENCOUNTERS[act].normal) if (enc.some(id => D.ENEMIES[id].fam)) encs.push(enc);
    h.ok(encs.length === 9, 'nine family encounters');
    for (const enc of encs) {
      for (const seed of [2, 7, 13, 21]) {
        const F = C.newFight(frun({ act: D.ENEMIES[enc[0]].act }), enc, UF.rng(seed));
        const rng = UF.rng(seed * 31);
        for (const e of F.enemies) { e.affix = e.affix.filter(a => a !== 'explosive'); e.hp = e.maxHp = e.maxHp * 4; }
        for (let turn = 0; turn < 12 && F.phase === 'player'; turn++) {
          if (turn % 3 === 1) F.player.block = 9;
          if (turn === 4) F.player.status.vuln = 2;
          const live = F.enemies.filter(e => e.alive);
          if (rng() < 0.25 && live.length) live[Math.floor(rng() * live.length)].status.freeze = 1;
          if (turn === 6 && live.length > 1) C.damage(F, F.player, live[live.length - 1], 99999, { pierce: true });
          if (turn === 8 && live.length) { const v = live[0]; v.status.poison = 3; }
          const odd = F.enemies.some(e => e.alive && (C.greedNext(e) || (e.intent && e.intent.k === 'gulp')));
          const T = C.qaThreat(F), hp0 = F.player.hp;
          C.endTurn(F);
          if (odd || F.phase === 'over') continue;
          n++;
          if (hp0 - F.player.hp === T.loss) same++;
          else if (miss.length < 6) miss.push(`${enc.join('+')} s${seed} t${turn}: ${T.loss} vs ${hp0 - F.player.hp}`);
          if (F.player.hp < 400) F.player.hp = 900;
        }
      }
    }
    h.ok(n > 250 && same === n, `exact on ${same} of ${n} family turns ${miss.join('; ')}`);
  });

  h.test('families: 30 turns of random play stay clean (fuzz)', () => {
    const IDS = Object.keys(D.ITEMS).filter(id => D.ITEMS[id].rarity !== 'junk').slice(0, 60);
    for (const f of D.FAM_IDS) {
      for (const seed of [1, 4]) {
        const run = { hp: 120, maxHp: 120, act: D.FAM[f].act, relics: [], claw: { grabs: 3 }, gold: 50, bin: IDS.slice(seed * 7, seed * 7 + 16).map((id, i) => ({ uid: 'z' + i, id, plus: false })) };
        const F = C.newFight(run, D.FAM[f].members, UF.rng(seed));
        const rng = UF.rng(seed + 99);
        let ok = true;
        for (let t = 0; t < 30 && F.phase !== 'over'; t++) {
          while (F.phase === 'player' && F.player.grabs > 0 && C.useGrab(F)) {
            const k = rng.int(0, 2);
            for (let j = 0; j < k && F.bin.length && F.phase === 'player'; j++) C.play(F, F.bin[rng.int(0, F.bin.length - 1)], rng.int(0, F.enemies.length - 1));
            C.grabDone(F, k);
          }
          if (F.phase === 'player') C.endTurn(F);
          if (!Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp) || e.hp < 0) || (F.fam && !(F.fam.cres >= 0 && F.fam.cres <= F.fam.max))) { ok = false; break; }
        }
        h.ok(ok && !F.hookErrors.length, `${f} seed ${seed}: clean`);
      }
    }
  });
}

// ---------- round 10 (ROS): Ms. Bubbles' bubbles, the mutator pack's claw, the new pets' synergies
{
  const LB = boot({ only: ['util', 'data', 'combat'] });
  const C = LB.COMBAT, D = LB.DATA, UB = LB.U;
  if (D && D.CHARACTERS && D.CHARACTERS.bubbler) {
    const BBIN = D.CHARACTERS.bubbler.bin;
    const brun = (extra, bin) => Object.assign({ hp: 400, maxHp: 400, act: 1, char: 'bubbler', relics: ['bubble_wand'], claw: { grabs: 3, width: 1 }, gold: 40,
      bin: (bin || BBIN).map((id, i) => ({ uid: 'b' + i, id, plus: false })) }, extra || {});
    const bfight = (extra, bin, seed) => {
      const F = C.newFight(brun(extra, bin), ['rat', 'slime'], UB.rng(seed || 7));
      for (const e of F.enemies) { e.hp = e.maxHp = 500; e.block = 0; e.status = {}; }
      return F;
    };
    h.test('round 10: Ms. Bubbles blows two bubbles a turn (three on the first with the Bubble Wand); nobody else does', () => {
      const F = bfight();
      h.ok(F.bub && F.bub.n === 2 && F.bub.first === 1 && F.bub.block === 2, 'the gift and the wand');
      h.eq(C.rosBlowN(F), 3, 'three on turn 1');
      F.turn = 2;
      h.eq(C.rosBlowN(F), 2, 'two after');
      h.eq(F.player.block, 2, 'the wand\'s 2 Block at the bell');
      const K = bfight({ char: 'knight', relics: [] });
      h.eq(K.bub, null, 'the Knight blows none');
      h.eq(C.rosBlowN(K), 0, 'nothing to blow');
      const M = bfight({ char: 'knight', relics: ['foam_machine'] }), MB = bfight({ relics: ['bubble_wand', 'foam_machine'] });
      h.ok(M.bub && M.bub.n === 1, 'the Foam Machine: one a turn for anyone');
      h.ok(MB.bub.n === 3, 'and one more for her');
      h.ok(M.events.some(e => e.t === 'proc' && /BUBBLES/.test(e.text)) && MB.events.some(e => e.t === 'proc' && /FOAM MACHINE/.test(e.text)), 'the rule procs');
    });
    h.test('round 10: pops pay Block, two or more in a grab are a Bubble Combo on ALL, bin bursts pay the aura', () => {
      const F = bfight();
      const b0 = F.player.block, hp = F.enemies.map(e => e.hp);
      const one = C.rosPop(F, 1, 'chute');
      h.ok(one.some(e => e.t === 'ros' && e.k === 'pop' && e.n === 1) && F.player.block === b0 + 2, 'one pop: 2 Block');
      h.ok(!one.some(e => e.k === 'combo') && F.enemies.every((e, i) => e.hp === hp[i]), 'no combo for one');
      const three = C.rosPop(F, 3, 'chute');
      const cb = three.find(e => e.t === 'ros' && e.k === 'combo');
      h.ok(cb && cb.n === 3 && cb.dmg === 3 * C.ROS.combo, 'three: a Bubble Combo of 3 x ' + C.ROS.combo);
      h.ok(F.enemies.every((e, i) => e.hp === hp[i] - cb.dmg), 'on ALL, no attacker');
      h.ok(F.bub.popped === 4 && F.bub.combos === 1 && F.bub.best === 3, 'counted');
      const S = bfight({ relics: ['bubble_wand', 'squeaky_toy', 'soap_dish'] });
      h.ok(S.bub.combo === C.ROS.combo + 3 && S.bub.block === 4, 'the Squeaky Toy and the Soap Dish add up');
      const blk = F.player.block;
      h.ok(C.rosPop(F, 2, 'bin').some(e => e.k === 'burst') && F.player.block === blk, 'a burst in the bin pays nothing without the aura');
      const Q = bfight({}, BBIN.concat(['bubble_shield']));
      Q.relics.length = 0;
      const A = C.newFight(brun({ bin: BBIN.concat(['bubble_shield']).map((id, i) => ({ uid: 'q' + i, id })) }), ['rat'], UB.rng(3));
      h.ok(A.evos.includes('evo:bubble_shield') && A.bub.bin === 3, 'Suds Armor: 3 Block a burst');
      const qb = A.player.block;
      C.rosPop(A, 2, 'bin');
      h.eq(A.player.block, qb + 6, 'two bursts, 6 Block');
      const Dk = C.newFight(brun({ bin: BBIN.concat(['captain_quack']).map((id, i) => ({ uid: 'd' + i, id })) }), ['rat'], UB.rng(3));
      Dk.enemies[0].hp = Dk.enemies[0].maxHp = 300;
      C.rosPop(Dk, 2, 'chute');
      h.eq(Dk.enemies[0].hp, 300 - 3 * 2 - 2 * C.ROS.combo, 'Duck Patrol: 3 a pop to a random enemy, then the combo');
      h.eq(C.rosPop(bfight({ char: 'knight', relics: [] }), 2, 'chute').length, 0, 'no bubbles: pops do nothing');
    });
    h.test('round 10: soap blows bubbles when played (for anyone), a turn of her kit never NaNs', () => {
      const F = bfight();
      const i = F.bin.find(x => x.id === 'bubble_pipe');
      const ev = C.play(F, i);
      h.ok(ev.some(e => e.t === 'ros' && e.k === 'blow' && e.n === 1 && e.src === 'bubble_pipe'), 'the Bubble Pipe blows one');
      const K = bfight({ char: 'knight', relics: [] }, ['bath_bomb', 'rusty_sword']);
      const kv = C.play(K, K.bin[0]);
      h.ok(kv.some(e => e.t === 'ros' && e.k === 'blow' && e.n === 2) && K.bub && K.bub.n === 0, 'a Bath Bomb bubbles in the Knight\'s hands (no bubbles a turn)');
      const Z = C.newFight(brun({ relics: ['bubble_wand', 'soap_dish', 'squeaky_toy', 'foam_machine'] }, BBIN.concat(['golden_duck', 'bubble_bath', 'foam_cannon', 'loofah', 'bath_bomb'])), ['rat', 'slime', 'bat'], UB.rng(11));
      const r = UB.rng(5);
      let bad = 0;
      for (let t = 0; t < 30 && Z.phase !== 'over'; t++) {
        for (let g = 0; g < 3 && Z.phase === 'player'; g++) {
          C.useGrab(Z);
          const n = Math.floor(r() * 3);
          for (let k = 0; k < n && Z.bin.length && Z.phase === 'player'; k++) C.play(Z, Z.bin[Math.floor(r() * Z.bin.length)]);
          C.grabDone(Z, n);
          if (Z.phase === 'player' && r() < 0.5) C.rosPop(Z, 1 + Math.floor(r() * 3), 'chute');
        }
        if (Z.phase === 'player') { C.rosPop(Z, Math.floor(r() * 2), 'bin'); C.endTurn(Z); }
        if (!Number.isFinite(Z.player.hp) || Z.enemies.some(e => !Number.isFinite(e.hp))) bad++;
      }
      h.eq(bad, 0, 'a 30 turn fuzz with every bubble piece stays finite');
    });
    h.test('round 10: Tiny Claw, Big Prizes shrinks the claw and hits harder; the other new mutators leave COMBAT alone', () => {
      const F = bfight({ muts: ['tinyclaw'] }), P = bfight();
      h.ok(Math.abs(F.claw.width - P.claw.width * 0.7) < 1e-9, 'the claw at 70%');
      const e = F.enemies[0], hp0 = e.hp;
      C.damage(F, F.player, e, 10);
      h.eq(hp0 - e.hp, 15, 'a 10 hit lands for 15');
      const M = bfight({ muts: ['moon', 'earthquake', 'mirror', 'sticky', 'flood'] });
      h.ok(M.mut && M.mut.bounce === 0.72 && M.mut.tremor === 2 && M.mut.mirror && M.mut.sticky === 0.35 && M.mut.flood === 1, 'the fx reach F.mut for the game');
      h.ok(M.claw.width === P.claw.width && M.player.grabsMax === P.player.grabsMax, 'nothing else changes in the fight');
    });
    h.test('round 10: the new pets\' synergies (chill, gold, block) and their procs', () => {
      const F = bfight({ pet: { id: 'penguin' } });
      const ev = C.rosPetSyn(F, 'penguin', 'chill', { v: 2, label: 'SNOWBALL FIGHT!' });
      h.ok(ev[0].t === 'proc' && ev[0].id === 'pet:penguin' && ev[0].text === 'SNOWBALL FIGHT!', 'the proc first');
      h.ok(F.enemies.every(e => (e.status.chill | 0) === 2), '2 Chill on ALL');
      const g0 = C.gold(F);
      C.rosPetSyn(F, 'molerat', 'gold', { v: 5 });
      h.eq(C.gold(F), g0 + 5, 'Gold Digger: 5 gold');
      const b0 = F.player.block;
      C.rosPetSyn(F, 'roomba', 'block', { v: 3 });
      h.eq(F.player.block, b0 + 3, 'Turbo Suction: 3 Block');
      F.phase = 'over';
      h.eq(C.rosPetSyn(F, 'roomba', 'block', { v: 3 }).length, 0, 'never after the fight');
    });
  }
}

// ---------- round 12 (LEG): the legendary relics, the new evolutions
{
  const LB = boot({ only: ['util', 'data', 'combat'] });
  const C = LB.COMBAT, D = LB.DATA, UB = LB.U;
  if (D && D.LEG) {
    const K = D.LEG.K;
    const KBIN = D.CHARACTERS.knight.bin;
    const lrun = (extra, bin) => Object.assign({ hp: 300, maxHp: 300, act: 1, char: 'knight', relics: [], claw: { grabs: 3, width: 1, grip: 1 }, gold: 40,
      bin: (bin || KBIN).map((id, i) => (typeof id === 'string' ? { uid: 'l' + i, id, plus: false } : Object.assign({ uid: 'l' + i }, id))) }, extra || {});
    const lfight = (relics, extra, bin, enc, seed) => {
      const F = C.newFight(lrun(Object.assign({ relics }, extra || {}), bin), enc || ['slime', 'spider'], UB.rng(seed || 7));
      for (const e of F.enemies) { e.hp = e.maxHp = 500; e.block = 0; e.status = {}; }
      return F;
    };
    const binOf = (F, id) => F.bin.find(i => i.id === id);
    const grab = (F, ids) => { C.useGrab(F); let n = 0; for (const id of ids) { const i = binOf(F, id); if (i && F.phase === 'player') { C.play(F, i); n++; } } return C.grabDone(F, n); };
    h.test('round 12: twelve legendaries, F.leg only when one is held', () => {
      h.eq(D.LEG.RELICS.length, 12, 'twelve legendary relics');
      h.eq(lfight([]).leg, null, 'no legendary: F.leg is null (the old fight)');
      const F = lfight(['leg_golden_claw', 'leg_crowd']);
      h.ok(F.leg && F.leg.golden === K.gold && F.leg.hypeK === K.hypeK && F.leg.hype === 0, 'the leg numbers merge');
    });
    h.test('round 12: The Golden Claw: every 5th grab is golden, pays per prize on 2+, and the rest grip looser', () => {
      const F = lfight(['leg_golden_claw']), P = lfight([]);
      h.ok(Math.abs(F.claw.grip - (P.claw.grip - 0.15)) < 1e-9, 'the grip mod: -0.15');
      const seen = [];
      for (let g = 0; g < 5; g++) { seen.push(C.legGolden(F)); if (g < 4) { if (!F.player.grabs) C.endTurn(F); grab(F, []); } }
      h.eq(seen.join(), 'false,false,false,false,true', 'the 5th grab is golden (idle telegraph)');
      if (!F.player.grabs) C.endTurn(F);
      C.useGrab(F);
      h.ok(C.legGolden(F, true), 'and it is golden while in flight');
      const hp = F.enemies.map(e => e.hp), b0 = F.player.block;
      const three = F.bin.filter(i => i.id === 'dented_shield').slice(0, 3);
      for (const i of three) C.play(F, i);
      const ev = C.grabDone(F, 3);
      h.ok(ev.some(e => e.t === 'proc' && e.id === 'leg_golden_claw' && /GOLDEN x3/.test(e.text)), 'GOLDEN x3');
      h.ok(F.enemies.every((e, i) => hp[i] - e.hp >= K.goldDmg * 3), '4 a prize to ALL');
      h.ok(F.player.block >= b0 + 3 * 5 + K.goldBlock * 3, '2 Block a prize on top of the shields');
      grab(F, ['rusty_sword']);
      h.ok(!C.legGolden(F, true), 'the 6th is not');
    });
    h.test('round 12: Infinite Coin Slot: every 3rd prize a turn is a grab, 2 a turn at most, and 12 Max HP gone', () => {
      const F = lfight(['leg_coin_slot']), P = lfight([]);
      for (const X of [F, P]) { C.useGrab(X); for (let k = 0; k < 9; k++) C.play(X, X.bin[0]); C.grabDone(X, 9); }
      h.eq(F.player.grabs, P.player.grabs + 2, '9 prizes: +2 grabs over the same grab without it (the cap)');
      C.endTurn(F);
      const g1 = F.player.grabs;
      C.useGrab(F); for (let k = 0; k < 3; k++) C.play(F, F.bin[0]); C.grabDone(F, 3);
      h.eq(F.player.grabs, g1, 'a new turn: 3 prizes pay the grab back');
      const run = { maxHp: 80, hp: 80, relics: [] };
      C.gainRelic(run, 'leg_coin_slot');
      h.eq(run.maxHp, 68, 'the slot keeps a cut: 80 -> 68 Max HP');
    });
    h.test("round 12: the Prize Master's Monocle sees the next move and EXPOSES an attacker once a turn", () => {
      const F = lfight(['leg_monocle'], {}, null, ['slime', 'goblin']);
      h.ok(F.claw.speed < lfight([]).claw.speed, 'the claw squints: slower');
      h.eq(C.legPeek(lfight([]), F.enemies[0]), null, 'no monocle: no peek');
      let ok = 0, n = 0;
      for (let t = 0; t < 6 && F.phase === 'player'; t++) {
        const want = F.enemies.map(e => C.legPeek(F, e));
        C.endTurn(F);
        F.enemies.forEach((e, i) => { if (!want[i] || want[i].unknown) return; n++; if ((e.intent.charged ? 'attack' : e.intent.k) === want[i].k) ok++; });
      }
      h.ok(n >= 8 && ok === n, `the peek is the move they pick next (${ok}/${n})`);
      const G = lfight(['leg_monocle'], {}, null, ['slime']);
      const e = G.enemies[0];
      e.intent = { k: 'attack', v: 5 };
      const hp = e.hp;
      C.damage(G, G.player, e, 10);
      h.eq(hp - e.hp, 10 + K.peekDmg, 'EXPOSED: 6 more on an attacker');
      C.damage(G, G.player, e, 10);
      h.eq(hp - e.hp, 20 + K.peekDmg, 'once a turn');
      e.intent = { k: 'block', v: 5 };
      G.turn++;
      C.damage(G, G.player, e, 10);
      h.eq(hp - e.hp, 30 + K.peekDmg, 'not while it blocks');
      const R = lfight(['leg_monocle'], {}, null, ['bat']);
      h.ok(C.legPeek(R, R.enemies[0]).unknown, 'a random enemy is a ? to the monocle');
    });
    h.test('round 12: Black Hole Bin: a Rock at the bell, junk falls in for 8, a hungry turn eats an item', () => {
      const F = lfight(['leg_black_hole']);
      const rock = F.bin.find(i => i.id === 'rock');
      h.ok(!!rock, 'a Rock in the bin at the bell');
      const t = F.enemies[F.target], hp = t.hp;
      C.useGrab(F);
      const ev = C.play(F, rock);
      C.grabDone(F, 1);
      h.ok(ev.some(e => e.t === 'leg' && e.k === 'void' && e.inst === rock), 'the void event');
      h.ok(!F.used.includes(rock) && !F.bin.includes(rock), 'gone for the fight');
      h.eq(hp - t.hp, K.voidDmg, 'the target takes 8');
      const cans = C.addJunk(F, 'slag', 4), t2 = F.enemies[F.target];
      let got = [];
      for (const s of cans) { const h0 = t2.hp; C.play(F, s); got.push(h0 - t2.hp); }
      h.ok(cans.every(s => !F.used.includes(s) && !F.bin.includes(s)), 'Slag falls in for good too (it would cycle back)');
      h.eq(got.join(), [K.voidDmg, K.voidDmg, K.voidDmg + K.voidGrow, K.voidDmg + K.voidGrow].join(), 'the hole grows: +2 after every 3 swallowed');
      C.endTurn(F);
      const used0 = F.used.length, pur0 = F.purged.length;
      C.useGrab(F); C.play(F, binOf(F, 'rusty_sword')); C.grabDone(F, 1);
      const evs = C.endTurn(F);
      h.ok(evs.some(e => e.t === 'proc' && /FEEDS/.test(e.text)) && F.purged.length === pur0 + 1, 'nothing fell in: the hole feeds on a used item');
      h.ok(F.used.length <= used0 + 1, 'from the used pile');
    });
    h.test('round 12: Perpetual Motion Machine: two prizes a turn bounce back (once a fight each) for 1 HP', () => {
      const F = lfight(['leg_perpetual']);
      const a = binOf(F, 'rusty_sword'), hp0 = F.player.hp;
      C.useGrab(F);
      const ev = C.play(F, a);
      h.ok(ev.some(e => e.t === 'leg' && e.k === 'bounce' && e.inst === a) && F.bin.includes(a) && !F.used.includes(a), 'it bounces back into the cabinet');
      h.eq(hp0 - F.player.hp, K.bounceHp, 'for 1 HP');
      C.play(F, binOf(F, 'dented_shield'));
      const c = F.bin.find(i => i.id === 'crisp_apple');
      C.play(F, c);
      h.ok(F.used.includes(c), 'the third one this turn stays played');
      C.grabDone(F, 3);
      C.endTurn(F);
      C.useGrab(F); C.play(F, a); C.grabDone(F, 1);
      h.ok(F.used.includes(a) || !F.bin.includes(a), 'a prize bounces once a fight');
      h.eq(F.leg.bounced, 2, 'two bounces booked');
    });
    h.test('round 12: The Crowd: combos build Hype, Hype multiplies your hits, a dull turn halves it, none left boos', () => {
      const F = lfight(['leg_crowd']);
      const e = F.enemies[0];
      grab(F, ['rusty_sword', 'iron_chain']);
      h.ok(F.leg.hype >= 1, 'a combo: +1 Hype (' + F.leg.hype + ')');
      F.leg.hype = 5;
      const hp = e.hp;
      C.damage(F, F.player, e, 10);
      h.eq(hp - e.hp, 15, '5 Hype: a 10 hit lands for 15');
      C.endTurn(F);
      h.eq(F.leg.hype, 5, 'the combo turn keeps it');
      C.endTurn(F);
      h.eq(F.leg.hype, 2, 'a dull turn: 5 -> 2');
      F.leg.hype = 0;
      C.endTurn(F);
      h.ok((F.player.status.weak | 0) >= 1, 'no Hype left: BOO, 1 Weak');
      const r0 = e.hp; F.leg.hype = 10;
      C.damage(F, null, e, 10);
      h.eq(r0 - e.hp, 10, 'relic damage has no attacker: no Hype');
    });
    h.test('round 12: Crown of Foam: anyone blows bubbles, a Bubble Combo is Strength, a bin burst stings', () => {
      const F = lfight(['leg_foam_crown']);
      h.ok(F.bub && F.bub.n === 2, 'the Knight blows two a turn');
      const B = C.newFight(lrun({ char: 'bubbler', relics: ['bubble_wand', 'leg_foam_crown'] }, D.CHARACTERS.bubbler.bin), ['slime'], UB.rng(3));
      h.eq(B.bub.n, 4, 'Ms. Bubbles four');
      const s0 = F.player.status.str | 0;
      C.rosPop(F, 2, 'chute');
      h.eq((F.player.status.str | 0) - s0, 1, 'FOAM ROYALTY: +1 Strength');
      const hp = F.player.hp;
      C.rosPop(F, 2, 'bin');
      h.eq(hp - F.player.hp, 2 * K.binSting, 'two bursts in the bin sting for 4');
    });
    h.test('round 12: Overclocked Core: a Lv 2 turret for anyone, a shot per metal prize, no turn-end volley', () => {
      const F = lfight(['leg_overclock']);
      h.ok(F.tur && F.tur.lv === 2, 'the Knight has a Lv 2 turret at the bell');
      const ev = C.play(F, binOf(F, 'rusty_sword'));
      h.ok(ev.some(e => e.t === 'turret' && e.k === 'fire'), 'a metal prize fires a shot');
      const shots = F.tur.shots;
      C.play(F, binOf(F, 'crisp_apple'));
      h.eq(F.tur.shots, shots, 'an apple does not');
      const et = C.endTurn(F);
      h.ok(!et.some(e => e.t === 'turret' && e.k === 'fire'), 'no volley at the end of the turn');
      const M = C.newFight(lrun({ char: 'engineer', relics: ['socket_set'] }, D.CHARACTERS.engineer.bin), ['slime'], UB.rng(3));
      h.ok(C.endTurn(M).some(e => e.t === 'turret' && e.k === 'fire'), 'without it Mama\'s turret still fires its volley');
    });
    h.test('round 12: Fate Engine: the meter for anyone, whiffs +1, no cash out, FATE at 10', () => {
      const F = lfight(['leg_fate_engine']);
      h.eq(F.luckK, 1, 'the Knight fills the meter');
      grab(F, []);
      h.eq(F.player.status.luck | 0, 3, 'a whiff: 2 + 1 Luck');
      grab(F, ['rusty_sword', 'dented_shield']);
      h.eq(F.player.status.luck | 0, 3, 'two prizes: no cash out, the Luck stays');
      const hp = F.enemies.map(e => e.hp);
      const ev = C.addLuck(F, 7);
      h.ok(ev.some(e => e.t === 'proc' && /FATE/.test(e.text)), 'FATE STRIKES at 10');
      h.ok(F.enemies.every((e, i) => hp[i] - e.hp === K.fateDmg), '25 to ALL');
      h.eq(F.player.status.luck | 0, 0, 'the meter empties');
    });
    h.test('round 12: Alpha Collar: tricks hit ALL for 3 and cost 1 HP; no pet, a stray bites', () => {
      const F = lfight(['leg_alpha_collar'], { pet: { id: 'cat' } });
      const hp = F.enemies.map(e => e.hp), p0 = F.player.hp;
      C.petTrick(F, 'cat');
      h.ok(F.enemies.every((e, i) => hp[i] - e.hp === K.collarDmg) && p0 - F.player.hp === 1, 'a trick: 3 to ALL, 1 HP');
      h.ok(D.RELICS.leg_alpha_collar.pet.uses === 1, 'one more trick a turn (pet.uses)');
      const S = lfight(['leg_alpha_collar']);
      const tot = S.enemies.reduce((s, e) => s + e.hp, 0);
      C.endTurn(S);
      h.ok(S.enemies.reduce((s, e) => s + e.hp, 0) < tot, 'no pet: a stray bites at the turn start');
    });
    h.test('round 12: Glass Heart: cracks and shatters in the cabinet hit back', () => {
      const F = lfight(['leg_glass_heart']);
      h.ok(F.leg.glass === 1, 'the game reads F.leg.glass');
      const tot = () => F.enemies.reduce((s, e) => s + e.hp, 0);
      const t0 = tot();
      C.material(F, 'crack', F.bin[0]);
      h.eq(t0 - tot(), K.crackDmg, 'a crack: 4 to a random enemy');
      const t1 = tot();
      C.material(F, 'shatter', F.bin[1]);
      h.eq(t1 - tot(), K.shatterDmg * F.enemies.length, 'a shatter: 6 to ALL');
    });
    h.test("round 12: Giant Slayer's Crown: +30% on elites and bosses, -20% on the rest, Strength when one enrages", () => {
      const F = lfight(['leg_slayer_crown'], {}, null, ['mimic', 'slime']);
      const el = F.enemies[0], no = F.enemies[1];
      const a = el.hp, b = no.hp;
      C.damage(F, F.player, el, 10); C.damage(F, F.player, no, 10);
      h.eq(a - el.hp, 13, 'an elite takes 13 from a 10');
      h.eq(b - no.hp, 8, 'a slime 8');
      el.enraged = true;
      const s0 = F.player.status.str | 0;
      C.endTurn(F);
      h.eq((F.player.status.str | 0) - s0, K.slayStr, 'it enraged: +3 Strength at your turn');
      C.endTurn(F);
      h.eq((F.player.status.str | 0) - s0, K.slayStr, 'once per enemy');
    });
    h.test('round 12: the ten evolutions: only the right item + relic, auras at work', () => {
      const R = D.EVOLUTIONS;
      h.eq(D.LEG.EVOS.length, 10, 'ten more recipes');
      for (const id of D.LEG.EVOS) {
        const r = R[id];
        const inst = { uid: 'x', id: r.from, plus: true };
        const F = lfight([r.relic], {}, [r.from]);
        h.eq(C.evoCheck(F, inst), r, id + ': the right pieces evolve');
        h.eq(C.evoCheck(F, Object.assign({}, inst, { plus: false })), null, id + ': not upgraded, no');
        h.eq(C.evoCheck(lfight(['trophy_rack'], {}, [r.from]), inst), null, id + ': the wrong relic, no');
        const other = D.LEG.EVOS.find(x => x !== id);
        h.eq(C.evoCheck(F, { uid: 'y', id: R[other].from, plus: true }), R[other].relic === r.relic ? R[other] : null, id + ': another base item, no');
        const G = lfight([r.relic], {}, [{ id: r.from, plus: true }, 'rusty_sword']);
        const got = C.evolve(G, G.bin[0]);
        h.ok(got && G.bin[0].id === id && G.evos.includes('evo:' + id), id + ': evolves, its aura joins');
      }
      // a few auras in a fight
      const A = C.newFight(lrun({ relics: ['leg_fate_engine'] }, ['all_in_chip', 'rusty_sword']), ['slime'], UB.rng(4));
      const b0 = A.player.block;
      grab(A, []);
      h.ok(A.player.block >= b0 + 2 + 3, 'Poker Face: a whiff gives 2 Block + 1 per Luck');
      const G = C.newFight(lrun({ char: 'engineer', relics: ['leg_overclock'] }, ['gear_grinder', 'hex_bolt']), ['slime'], UB.rng(4));
      const s0 = G.tur.shots;
      C.endTurn(G);
      h.ok(G.tur.shots > s0, 'Flywheel: a turret shot at the turn start');
      const Rg = C.newFight(lrun({ char: 'engineer', relics: ['socket_set'] }, ['railgun_coil', 'hex_bolt']), ['slime'], UB.rng(4));
      h.eq(Rg.tur.amp, 1, 'Magnetic Rail: turret shots +1');
      const V = C.newFight(lrun({ relics: [] }, ['vanishing_act', 'rusty_sword']), ['goblin'], UB.rng(4));
      h.eq(V.player.status.dodge | 0, 1, 'Now You See Me: 1 Dodge at the bell');
      const S = C.newFight(lrun({ relics: ['leg_black_hole'] }, ['singularity', 'rusty_sword']), ['slime', 'spider'], UB.rng(4));
      for (const e of S.enemies) e.hp = e.maxHp = 500;
      const rock = S.bin.find(i => i.id === 'rock');
      C.play(S, rock);
      h.ok(S.enemies.every(e => e.hp <= 500 - 3), 'Accretion: junk falling in hits ALL for 3');
      const Bm = C.newFight(lrun({ relics: ['leg_perpetual'] }, ['boomerang_blades', 'rusty_sword', 'crisp_apple']), ['slime'], UB.rng(4));
      Bm.enemies[0].hp = Bm.enemies[0].maxHp = 500;
      C.play(Bm, Bm.bin.find(i => i.id === 'rusty_sword'));
      h.ok(Bm.enemies[0].hp <= 500 - 7 - 3, 'Return Flight: the bouncing sword hits again for 3');
    });
    h.test('round 12: a 30 turn fuzz holding every legendary and every new evolved item never NaNs', () => {
      const bin = D.LEG.EVOS.concat(KBIN.slice(0, 8), ['rock', 'glass_bead']);
      const Z = C.newFight(lrun({ relics: D.LEG.RELICS.slice(), pet: { id: 'cat' } }, bin), ['slime', 'mimic', 'spider'], UB.rng(12));
      const r = UB.rng(9);
      let bad = 0;
      for (let t = 0; t < 30 && Z.phase !== 'over'; t++) {
        for (let g = 0; g < 4 && Z.phase === 'player' && Z.player.grabs > 0; g++) {
          C.useGrab(Z);
          const n = Math.floor(r() * 4);
          for (let k = 0; k < n && Z.bin.length && Z.phase === 'player'; k++) C.play(Z, Z.bin[Math.floor(r() * Z.bin.length)]);
          C.grabDone(Z, n);
          if (Z.phase === 'player' && r() < 0.3) C.rosPop(Z, 1 + Math.floor(r() * 3), r() < 0.5 ? 'chute' : 'bin');
          if (Z.phase === 'player' && r() < 0.2) C.material(Z, r() < 0.5 ? 'crack' : 'shatter', Z.bin[0]);
          if (Z.phase === 'player' && r() < 0.2) C.petTrick(Z, 'cat');
        }
        if (Z.phase === 'player') C.endTurn(Z);
        if (!Number.isFinite(Z.player.hp) || Z.enemies.some(e => !Number.isFinite(e.hp)) || Z.hookErrors.length) bad++;
      }
      h.eq(bad, 0, 'finite, no hook errors ' + (Z.hookErrors[0] || ''));
    });
  }
}

// ---------- TRD (round 14): an evolved pet's flourish (DESIGN.md "The Trading Post and pet evolution (round 14)")
{
  const LT = boot({ only: ['util', 'data', 'combat'] });
  const C = LT.COMBAT, D = LT.DATA, UT = LT.U;
  const tfight = (pet) => {
    const run = { hp: 50, maxHp: 70, act: 1, char: 'knight', relics: [], claw: { grabs: 3 }, pet: { id: pet, xp: 100, lv: 5, evo: 1 },
      bin: ['rusty_sword', 'crisp_apple', 'femur'].map((id, i) => ({ uid: 't' + i, id, plus: false })) };
    const F = C.newFight(run, ['rat', 'rat'], UT.rng(21));
    for (const e of F.enemies) { e.hp = e.maxHp = 300; e.status = {}; e.block = 0; }
    F.player.block = 0; F.player.status = {};
    return F;
  };
  h.test('trd: every evolved form\'s flourish does what its card says', () => {
    for (const id of D.PET_IDS) {
      const f = D.PEV_FORMS[id], F = tfight(id), x = f.fx;
      const hp0 = F.enemies.map(e => e.hp), me0 = F.player.hp;
      const ev = C.pevTrick(F, id);
      h.ok(ev[0] && ev[0].t === 'proc' && ev[0].src === 'pet' && ev[0].id === 'pev:' + id && ev[0].text === f.trick.toUpperCase() + '!', id + ': a pet proc named after the trick');
      const lost = F.enemies.map((e, i) => hp0[i] - e.hp);
      if (x.k === 'dmg') h.ok(lost.reduce((a, b) => a + b, 0) === x.v && lost.filter(v => v > 0).length === 1, `${id}: ${x.v} to one random enemy (${lost})`);
      if (x.k === 'dmgAll') h.ok(lost.every(v => v === x.v), `${id}: ${x.v} to ALL (${lost})`);
      if (x.k === 'block') h.eq(F.player.block, x.v, id + ': Block');
      if (x.k === 'heal') h.eq(F.player.hp - me0, x.v, id + ': a heal');
      if (x.k === 'status') h.ok(F.enemies.every(e => (e.status[x.s] | 0) >= x.v || (x.s === 'chill' && e.status.freeze > 0)), `${id}: ${x.v} ${x.s} on ALL`);
      h.ok(F.pevLog && F.pevLog.length === 1 && F.pevLog[0].pet === id, id + ': logged on F.pevLog');
    }
    // nothing for an unknown pet, nothing once the fight is over, never a NaN
    const F = tfight('cat');
    h.eq(C.pevTrick(F, 'dragon').length, 0, 'an unknown pet does nothing');
    F.phase = 'over';
    h.eq(C.pevTrick(F, 'cat').length, 0, 'a finished fight does nothing');
    const Z = tfight('mouse');
    for (let i = 0; i < 400 && Z.phase !== 'over'; i++) C.pevTrick(Z, 'mouse');
    h.ok(Z.phase === 'over' && Z.enemies.every(e => Number.isFinite(e.hp) && e.hp >= 0), 'Arc Zap over and over wins the fight cleanly');
  });
}

// ---------- DEP (round 15): the Neon Depths' tricks and The Drowned Jukebox's High Tide ----------
{
  const R = boot({ only: ['util', 'data', 'combat'] });
  const C = R.COMBAT, D = R.DATA, K = D.DEP_K;
  const IDS = Object.keys(D.ITEMS).filter(id => D.ITEMS[id].rarity !== 'junk' && !D.ITEMS[id].bag && !D.ITEMS[id].hot);
  const dfight = (ids, seed, o) => {
    o = o || {};
    const bin = o.bin || IDS.slice(seed % 40, seed % 40 + 12).map((id, i) => ({ uid: 'd' + seed + '_' + i, id, plus: i === 3 }));
    // (a plain act 3 run: the Endless lift and its random affixes would blur the numbers; the Depths' own dial stays)
    const run = { hp: 400, maxHp: 400, act: 3, relics: [], claw: { grabs: 3 }, gold: 40, bin };
    return C.newFight(run, ids, R.U.rng(seed));
  };
  const evOf = (evs, k) => evs.filter(ev => ev.t === 'dep' && ev.k === k);
  const hpb = (F) => F.player.hp + F.player.block;

  h.test('dep: the Depths monsters hit and last a little more than act 3 (the danger dial)', () => {
    for (const d of D.DEP_ENEMIES) {
      const F = dfight([d.id], 7), e = F.enemies[0];
      h.ok(e.maxHp >= Math.round(d.hp[0] * K.hpK) && e.dmgMul >= K.dmgK, `${d.id}: hp ${e.maxHp} and hits x${e.dmgMul.toFixed(2)}`);
      const atk = d.moves.find(m => m.k === 'attack');
      if (atk) h.eq(e.def.moves.find(m => m.id === atk.id).v, Math.max(1, Math.round(atk.v * e.dmgMul)), `${d.id}: its ${atk.id} is scaled`);
    }
    const V = dfight([Object.keys(D.ENEMIES).find(id => D.ENEMIES[id].act === 3 && D.ENEMIES[id].tier === 'normal' && !D.ENEMIES[id].dep && !D.ENEMIES[id].secret)], 7);
    const W = dfight(['dep_angler'], 7);
    h.ok(Math.abs(W.enemies[0].dmgMul / V.enemies[0].dmgMul - K.dmgK) < 1e-9, `the Depths hit x${K.dmgK} over an ordinary act 3 monster, no more`);
  });

  h.test('dep: the Angler Token hangs its lure over an Old Boot; grabbing the boot out snaps it off', () => {
    const F = dfight(['dep_angler'], 11), e = F.enemies[0];
    h.eq(e.intent.k, 'lure', 'it opens with the lure');
    h.eq(C.intentText(e), 'Lures your claw toward junk', 'the intent says so');
    const n0 = F.bin.length;
    const evs = C.endTurn(F);
    const ev = evOf(evs, 'lure')[0];
    h.ok(ev && ev.inst && ev.inst.id === 'dep_boot', 'a lure event with its boot');
    h.eq(F.bin.length, n0 + 1, 'the Old Boot is in the bin');
    h.ok(C.depOf(F).lure && C.depOf(F).lure.inst === ev.inst && C.depOf(F).lure.by === e.uid, 'the lure hangs for this turn');
    const out = C.play(F, ev.inst);
    h.ok(out.some(x => x.t === 'dep' && x.k === 'lureOff' && x.why === 'bait'), 'grabbing the boot out snaps the lure off');
    h.eq(C.depOf(F).lure, null, 'no lure left');
    // left alone, the lure goes when the turn ends
    const G = dfight(['dep_angler'], 12);
    C.endTurn(G);
    h.ok(C.depOf(G).lure, 'a lure');
    h.ok(evOf(C.endTurn(G), 'lureOff').length === 1 && !C.depOf(G).lure, 'gone with the turn');
  });

  h.test('dep: Jellyfish Coin jellies sting the claw that touches them (through Block), and sting an enemy when delivered', () => {
    const F = dfight(['dep_jelly'], 13), e = F.enemies[0];
    h.eq(e.intent.k, 'jellies', 'it opens with its jellies');
    h.eq(C.intentText(e), 'Drifts 2 stinging jellies into your bin', 'the intent counts them');
    const evs = C.endTurn(F);
    const ev = evOf(evs, 'jellies')[0];
    const v = Math.max(1, Math.round(2 * e.dmgMul));
    h.ok(ev && ev.items.length === 2 && ev.items.every(i => i.id === 'dep_jellyling' && i.depSting === v) && ev.v === v, `two jellies, each stings for ${v}`);
    F.player.block = 5;
    const b0 = hpb(F);
    const st = C.depSting(F, ev.items[0]);
    h.ok(st.some(x => x.t === 'dep' && x.k === 'sting' && x.v === v), 'a sting event');
    h.eq(b0 - hpb(F), v, 'the sting takes its number');
    // delivered, it stings a random enemy for DEP_K.jelly
    const hp0 = e.hp + e.block;
    C.play(F, ev.items[1]);
    h.ok(hp0 - (e.hp + e.block) >= 1, 'a delivered jelly stings the Jellyfish Coin back');
    // off the player's turn a sting is nothing
    F.phase = 'enemy';
    h.eq(C.depSting(F, ev.items[0]).length, 0, 'no sting outside the player turn');
  });

  h.test('dep: the Crab Changer pinches your best, and takes only what is still pinched a turn later', () => {
    const F = dfight(['dep_crab'], 17), e = F.enemies[0];
    h.eq(e.intent.k, 'pinch', 'it opens with a pinch');
    h.eq(C.intentText(e), 'Pinches your 2 best items', 'the intent counts them');
    const want = C.depPinchPick(F, 2).map(i => i.uid);
    let evs = C.endTurn(F);
    const ev = evOf(evs, 'pinch')[0];
    h.eq(ev.insts.map(i => i.uid).join(), want.join(), 'it pinched what the preview named');
    h.eq(C.depPinched(F).length, 2, 'two prizes pinched');
    h.eq(evOf(evs, 'take').length, 0, 'nothing taken the turn it pinched');
    // the claw frees one; the other is taken when the next enemy phase ends
    h.ok(C.depUnpinch(F, ev.insts[0]), 'the claw lifts one clear');
    h.ok(!C.depUnpinch(F, ev.insts[0]), 'only once');
    evs = C.endTurn(F);
    const tk = evOf(evs, 'take')[0];
    h.ok(tk && tk.insts.length === 1 && tk.insts[0].uid === ev.insts[1].uid, 'the still pinched one goes into its shell');
    h.ok(evs.some(x => x.t === 'binEat' && x.inst === ev.insts[1] && x.idx === 0), 'it is swallowed (the belly rules: a drink is drunk on the spot)');
    h.ok(F.bin.includes(ev.insts[0]), 'the freed one stayed');
    // a delivered pinched prize is simply played; killing the crab lets go
    const G = dfight(['dep_crab'], 18);
    C.endTurn(G);
    const pin = C.depPinched(G);
    C.play(G, pin[0]);
    h.ok(!pin[0].depPinch, 'a delivered prize is no longer pinched');
    const k = C.damage(G, G.player, G.enemies[0], 9999);
    h.ok(!G.enemies[0].alive && C.depPinched(G).length === 0, 'killing the crab lets go of the rest');
    void k;
  });

  h.test('dep: the Volt Eel\'s live water shocks a wet delivery for its number, for one turn', () => {
    const F = dfight(['dep_eel'], 19), e = F.enemies[0];
    h.eq(e.intent.k, 'shock', 'it opens with Live Wire');
    const v = Math.max(1, Math.round(3 * e.dmgMul));
    h.eq(C.intentText(e), `Electrifies the water (${v} per wet prize)`, 'the intent says the number');
    h.eq(C.depZap(F, null).length, 0, 'dry water: no zap');
    const evs = C.endTurn(F);
    h.ok(evOf(evs, 'shock')[0] && C.depOf(F).shock.v === v, 'the water is live');
    F.player.block = 2;
    const b0 = hpb(F);
    h.ok(C.depZap(F, F.bin[0]).some(x => x.k === 'zap' && x.v === v), 'a zap');
    h.eq(b0 - hpb(F), v, 'for its number');
    h.ok(evOf(C.endTurn(F), 'shockOff').length === 1 && !C.depOf(F).shock, 'the current goes with the turn');
  });

  h.test('dep: the Sunken Mimic\'s chests: exactly one pays, the rest bite', () => {
    let reals = 0;
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const F = dfight(['dep_mimic'], seed), e = F.enemies[0];
      h.eq(e.intent.k, 'decoy', 'it opens with its chests');
      h.eq(C.intentText(e), 'Scatters 3 chests (one holds treasure)', 'the intent');
      const ev = evOf(C.endTurn(F), 'decoy')[0];
      h.ok(ev && ev.items.length === 3 && ev.items.every(i => i.id === 'dep_chest'), 'three chests');
      const real = ev.items.filter(i => i.depReal);
      h.eq(real.length, 1, 'exactly one is real');
      reals += ev.items.indexOf(real[0]);
      const g0 = F.gain.gold, b0 = F.player.block;
      const out = C.play(F, real[0]);
      h.ok(out.some(x => x.k === 'chest' && x.real), 'the real one pays');
      h.ok(F.player.block >= b0 + K.real.block, 'with Block');
      h.eq(F.gain.gold - g0, K.real.gold, 'and gold');
      const bite = ev.items.find(i => !i.depReal);
      F.player.block = 0;
      const h0 = F.player.hp;
      const ob = C.play(F, bite);
      h.ok(ob.some(x => x.k === 'chest' && !x.real && x.v === bite.depBite), 'a biter bites');
      h.eq(h0 - F.player.hp, bite.depBite, 'for its number');
    }
    h.ok(reals > 0, 'the treasure is not always the first chest');
  });

  h.test('dep: The Drowned Jukebox\'s High Tide floods the next turn, faster and higher on the B-side', () => {
    const F = dfight(['dep_jukebox'], 29), e = F.enemies[0];
    let tide = null, turns = 0;
    for (; turns < 6 && !tide; turns++) { const evs = C.endTurn(F); tide = evs.find(x => x.t === 'boss' && x.k === 'tide'); if (F.player.hp < 200) F.player.hp = 400; }
    h.ok(tide, `High Tide within ${turns} turns`);
    const T = C.depOf(F).tide;
    h.ok(T && T.lo === K.tide.lo && T.hi === K.tide.hi && T.bpm === K.tide.bpm && T.by === e.uid && !T.rage, 'the tide rises and falls between its marks');
    const evs = C.endTurn(F);
    h.ok(evs.some(x => x.t === 'boss' && x.k === 'ebb') && !C.depOf(F).tide, 'it ebbs when the turn ends');
    // enraged: higher, faster
    const G = dfight(['dep_jukebox'], 30);
    G.enemies[0].enraged = true;
    let T2 = null;
    for (let i = 0; i < 8 && !T2; i++) { C.endTurn(G); T2 = C.depOf(G).tide; if (G.player.hp < 200) G.player.hp = 400; }
    h.ok(T2 && T2.rage && T2.hi === K.tide.hiRage && T2.bpm === K.tide.bpm * K.tide.rageK, 'the B-side floods higher and faster');
    // the boss dies: its tide goes with it
    const X = dfight(['dep_jukebox'], 31);
    for (let i = 0; i < 8 && !C.depOf(X).tide; i++) { C.endTurn(X); if (X.player.hp < 200) X.player.hp = 400; }
    h.ok(C.depOf(X).tide, 'a tide up');
    C.damage(X, X.player, X.enemies[0], 99999);
    h.ok(!C.depOf(X).tide, 'unplugged: the water goes down');
  });

  h.test('dep: the telegraph stays exact over every Depths encounter (qaThreat is what the enemy phase takes)', () => {
    let same = 0, n = 0;
    const miss = [];
    for (const enc of D.DEP_ENC.normal.concat(D.DEP_ENC.elite, D.DEP_ENC.boss)) for (const seed of [3, 11, 19]) {
      const F = dfight(enc, seed);
      for (let turn = 0; turn < 10 && F.phase === 'player'; turn++) {
        if (turn % 2) F.player.block = 7;
        const odd = F.enemies.some(e => e.alive && (C.greedNext(e) || (e.intent && e.intent.k === 'gulp')));
        const T = C.qaThreat(F), hp0 = F.player.hp;
        C.endTurn(F);
        if (!odd) { n++; if (hp0 - F.player.hp === T.loss) same++; else miss.push(enc.join('+') + ' t' + turn + ': ' + T.loss + ' vs ' + (hp0 - F.player.hp)); }
        if (F.player.hp < 150) F.player.hp = 400;
      }
    }
    h.ok(n > 200, `turns checked (${n})`);
    h.eq(same, n, 'every preview exact: ' + miss.slice(0, 3).join(' | '));
  });

  h.test('dep: fuzz: random grabs, stings, zaps and unpinches over many seeds never break a fight', () => {
    let bad = 0, over = 0;
    for (let s = 1; s <= 40; s++) {
      const enc = D.DEP_ENC.normal.concat(D.DEP_ENC.elite, D.DEP_ENC.boss)[s % 13];
      const F = dfight(enc, 100 + s), r = R.U.rng(s);
      for (let t = 0; t < 30 && F.phase !== 'over'; t++) {
        for (let k = 0; k < 3 && F.phase === 'player' && F.bin.length; k++) {
          const inst = F.bin[Math.floor(r() * F.bin.length)];
          if (inst.depSting && r() < 0.5) C.depSting(F, inst);
          if (inst.depPinch && r() < 0.5) C.depUnpinch(F, inst);
          if (r() < 0.3) C.depZap(F, inst);
          if (F.phase === 'player') C.play(F, inst);
        }
        if (F.phase === 'player') C.endTurn(F);
        if (!Number.isFinite(F.player.hp) || F.enemies.some(e => !Number.isFinite(e.hp) || e.hp < 0)) bad++;
      }
      if (F.phase === 'over') over++;
    }
    h.eq(bad, 0, 'never a NaN or a negative hp');
    h.ok(over > 0, `some fights end (${over})`);
  });
}

// ---------- TECH (round 17): Cabinet Tech (DESIGN.md "Cabinet Tech and the new crawler (round 17)") ----------
{
  const R = boot({ only: ['util', 'data', 'combat'] });
  const C = R.COMBAT, D = R.DATA;
  const tfight = (relics, o) => {
    o = o || {};
    const run = { hp: 999, maxHp: 999, act: 1, char: o.char || 'techie', relics: relics || [], claw: { grabs: 3 }, bin: D.CHARACTERS.techie.bin.map((id, i) => ({ uid: 't' + i, id })) };
    const F = C.newFight(run, o.foes || ['slime', 'slime'], R.U.rng(o.seed || 7));
    if (o.on !== false) C.techOn(F, true);
    return F;
  };
  const hp = (F) => F.enemies.reduce((a, e) => a + e.hp, 0);

  h.test('tech: F.tech, the cabinet hook on your own turn only, the tech event', () => {
    const F = tfight(['service_remote']);
    h.ok(F.tech && F.tech.gift && F.tech.on && F.tech.perf === 0, 'F.tech: her gift, the live cabinet');
    const k = tfight([], { char: 'knight', on: false });
    h.ok(!k.tech.gift && !k.tech.on, 'a knight in a quiet cabinet');
    const h0 = hp(F), b0 = F.player.block;
    const ev = C.techCab(F, 'event', 0, 'surge');
    h.ok(ev.some((e) => e.t === 'tech' && e.k === 'event' && e.id === 'surge') && ev.some((e) => e.t === 'proc' && e.id === 'service_remote'), 'a tech event and the remote\'s proc');
    h.eq(h0 - hp(F), 6, 'the remote: 3 to each slime');
    h.eq(F.player.block, b0 + 3, 'and 3 Block');
    h.eq(F.tech.events, 1, 'counted');
    C.endTurn(F);
    h.ok(F.phase === 'player', 'back to your turn');
    F.phase = 'enemy';
    h.eq(C.techCab(F, 'event', 0, 'coins').length, 0, 'nothing off your turn');
    F.phase = 'player';
    h.eq(C.techCab(F, '', 0).length, 0, 'nothing for no kind');
  });

  h.test('tech: a PERFECT grab feeds Bullseye and the Metronome, then clears with the grab', () => {
    const F = tfight(['metronome']);
    C.useGrab(F);
    const h0 = hp(F);
    C.techCab(F, 'perfect', 2);
    h.eq(h0 - hp(F), 8, 'the Metronome: 8 on a PERFECT x2');
    h.eq(F.tech.perf, 2, 'this grab is PERFECT x2');
    for (const id of ['rubber_duck', 'arcade_stick']) { const i = F.bin.find((b) => b.id === id) || F.bin[0]; C.play(F, i); }
    const ev = C.grabDone(F, 2);
    h.ok(ev.some((e) => e.t === 'combo' && e.id === 'bullseye'), 'Bullseye fires on a PERFECT grab of 2');
    h.eq(F.tech.perf, 0, 'and the PERFECT goes with the grab');
    C.useGrab(F);
    C.play(F, F.bin[0]); C.play(F, F.bin[1]);
    h.ok(!C.grabDone(F, 2).some((e) => e.t === 'combo' && e.id === 'bullseye'), 'no Bullseye on an ordinary grab');
  });

  h.test('tech: the quiet cabinet rings the remote and the key every 2nd turn', () => {
    const F = tfight(['service_remote', 'service_key'], { on: false });
    const blk = [];
    for (let t = 0; t < 4 && F.phase === 'player'; t++) { C.endTurn(F); blk.push(F.turn + ':' + F.player.block); }
    h.ok(blk.filter((x) => +x.split(':')[0] % 2 === 0).every((x) => +x.split(':')[1] >= 8), 'even turns: 3 (remote) + 5 (key) Block (' + blk.join(' ') + ')');
    h.ok(blk.filter((x) => +x.split(':')[0] % 2 === 1).every((x) => +x.split(':')[1] === 0), 'odd turns: none');
    const L = tfight(['service_key']);
    C.endTurn(L);
    h.eq(L.player.block, 0, 'a live cabinet does not ring on its own');
  });

  h.test('tech: a 30 turn fuzz with every Cabinet Tech relic and random cabinet calls never breaks a fight', () => {
    let bad = 0, errs = 0;
    for (let s = 1; s <= 20; s++) {
      const F = tfight(D.TECH.RELICS.concat(['money_bags']), { seed: 50 + s, foes: ['goblin', 'slime'], on: s % 3 !== 0 }), r = R.U.rng(s);
      for (let t = 0; t < 30 && F.phase !== 'over'; t++) {
        for (let k = 0; k < 3 && F.phase === 'player' && F.bin.length; k++) {
          C.useGrab(F);
          if (r() < 0.4) C.techCab(F, 'perfect', 1 + Math.floor(r() * 5));
          if (r() < 0.3) C.techCab(F, ['event', 'fever', 'double'][Math.floor(r() * 3)], 1, ['surge', 'coins', 'capsule'][Math.floor(r() * 3)]);
          C.play(F, F.bin[Math.floor(r() * F.bin.length)]);
          if (F.phase === 'player') C.grabDone(F, 1);
        }
        if (F.phase === 'player') C.endTurn(F);
        if (!Number.isFinite(F.player.hp) || F.enemies.some((e) => !Number.isFinite(e.hp) || e.hp < 0)) bad++;
      }
      errs += F.hookErrors.length;
    }
    h.eq(bad, 0, 'never a NaN or a negative hp');
    h.eq(errs, 0, 'never a hook error');
  });
}

h.done();
