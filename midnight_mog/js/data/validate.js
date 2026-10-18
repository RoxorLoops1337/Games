// Effect vocabulary (the closed set the sim must implement) and validateAll() for all content in js/data.
// Documented in docs/SYSTEMS.md. Adding a kind here without implementing it in sim/battle.js is a bug.
import { CATS, CAT_BY_ID, CAT_ROLES, RARITIES } from './cats.js';
import { ENEMIES, ENEMY_BY_ID } from './enemies.js';
import { CARDS } from './cards.js';
import { RELICS } from './relics.js';
import { DISTRICTS, DISTRICT_BY_ID, ENDLESS, ELITE_AFFIXES } from './districts.js';

export const SELECTORS = ['self', 'target', 'nearest', 'farthest', 'strongest', 'weakest', 'lowest_ally', 'random', 'all', 'radius', 'base'];
export const PLACEMENTS = ['self', 'target', 'nearest', 'strongest', 'lane_ahead', 'edge'];
export const CARD_TARGETS = ['none', 'tile', 'enemy', 'lane'];
export const ELEMENTS = ['phys', 'fire', 'elec', 'shadow', 'holy', 'poison', 'void'];
export const DOT_KINDS = ['fire', 'poison', 'bleed', 'elec', 'shadow', 'holy', 'void', 'phys'];
export const BUFF_STATS = ['dmg', 'rate', 'speed', 'range', 'hp', 'armor', 'crit', 'critdmg', 'lifesteal', 'regen'];
export const DEBUFF_STATS = ['dmg', 'rate', 'speed', 'armor', 'vuln'];
export const MOD_STATS = ['dmg', 'hp', 'rate', 'range', 'speed', 'crit', 'critdmg', 'lifesteal', 'armor', 'regen', 'cooldown', 'reflect', 'chain_jumps', 'spell_power', 'cost_add', 'fish', 'yarn', 'xp', 'drop_rate'];
export const TRAITS = ['swarm', 'armored', 'flying', 'healer', 'splitter', 'shielded', 'burrower', 'ranged', 'fast', 'summoner', 'explosive', 'boss'];
export const TRIGGERS = ['on_kill', 'on_hit', 'on_crit', 'on_cast', 'on_summon', 'on_play_card', 'on_wave_start', 'on_battle_start', 'on_base_hit', 'on_ally_death'];
export const RULES = ['start_energy_add', 'energy_cap_add', 'energy_regen_mult', 'energy_regen_add', 'hand_size_add', 'first_card_free', 'spell_echo', 'ability_echo',
  'trap_charges_add', 'buff_duration_mult', 'base_revive_once', 'cat_revive_once', 'base_hp_pct', 'reward_pct'];
export const RESOURCES = ['fish', 'yarn'];
export const CARD_TYPES = ['summon', 'spell', 'trap', 'build'];
export const MOD_SCOPE_RE = /^(all_cats|cards|economy|enemies|base|self|(role|tag|rarity|trait):[a-z_]+)$/;

// req: keys that must exist. oneOf: groups, at least one key of each group must exist. nested: keys holding effects.
export const EFFECT_SPEC = {
  damage: { oneOf: [['amount', 'mult']] },
  chain: { req: ['jumps'], oneOf: [['amount', 'mult']] },
  pierce: { oneOf: [['amount', 'mult']] },
  aoe: { req: ['radius'], oneOf: [['amount', 'mult']] },
  heal: { oneOf: [['amount', 'pct']] },
  shield: { req: ['duration'], oneOf: [['amount', 'pct']] },
  buff: { req: ['stat', 'pct', 'duration'] },
  debuff: { req: ['stat', 'pct', 'duration'] },
  stun: { req: ['duration'] },
  dot: { req: ['dps', 'duration'] },
  taunt: { req: ['radius', 'duration'] },
  reflect: { req: ['pct', 'duration'] },
  knockback: { req: ['tiles'] },
  pull: { req: ['tiles'] },
  execute: { req: ['threshold'] },
  cleanse: {},
  revive: { req: ['n', 'hpPct'] },
  energy: { req: ['amount'] },
  draw: { req: ['count'] },
  spawn: { req: ['minion', 'count'] },
  summon: { req: ['cat'] },
  spawn_enemies: { req: ['enemy', 'count'] },
  trap: { req: ['charges', 'radius', 'effect'], nested: ['effect'] },
  barricade: { req: ['hp'] },
  aura: { req: ['radius', 'interval', 'duration', 'effect'], nested: ['effect'] },
  battle_rule: { req: ['rule', 'value'] },
  reward_mult: { req: ['resource'], oneOf: [['pct', 'flat']] },
  reset_cooldown: {},
  multi: { req: ['steps'] },
};
export const EFFECT_KINDS = Object.keys(EFFECT_SPEC);
export const RELIC_KINDS = ['stat_mod', 'on_event', 'rule', 'multi_mod'];

const MIN = { cats: 30, common: 12, rare: 9, epic: 6, legend: 3, mythic: 2, enemies: 24, bosses: 6, cards: 40, relics: 24, districts: 6 };

export function validateEffect(e, where, err, ctx = {}) {
  if (!e || typeof e !== 'object') return err(where + ': effect missing');
  const spec = EFFECT_SPEC[e.kind];
  if (!spec) return err(where + ': unknown effect kind ' + e.kind);
  for (const k of spec.req || []) if (e[k] === undefined) err(where + ': ' + e.kind + ' needs ' + k);
  for (const g of spec.oneOf || []) if (!g.some((k) => e[k] !== undefined)) err(where + ': ' + e.kind + ' needs one of ' + g.join('|'));
  if (e.to !== undefined && !SELECTORS.includes(e.to)) err(where + ': bad selector ' + e.to);
  if (e.to === 'radius' && e.radius === undefined) err(where + ': to radius needs radius');
  if (e.at !== undefined && !PLACEMENTS.includes(e.at)) err(where + ': bad placement ' + e.at);
  if (e.element !== undefined && !(e.kind === 'dot' ? DOT_KINDS : ELEMENTS).includes(e.element)) err(where + ': bad element ' + e.element);
  if (e.kind === 'buff' && !BUFF_STATS.includes(e.stat)) err(where + ': bad buff stat ' + e.stat);
  if (e.kind === 'debuff' && !DEBUFF_STATS.includes(e.stat)) err(where + ': bad debuff stat ' + e.stat);
  if (e.kind === 'battle_rule' && !RULES.includes(e.rule)) err(where + ': bad rule ' + e.rule);
  if (e.kind === 'reward_mult' && !RESOURCES.includes(e.resource)) err(where + ': bad resource ' + e.resource);
  if (e.kind === 'summon' && !CAT_BY_ID[e.cat]) err(where + ': summon of unknown cat ' + e.cat);
  if (e.kind === 'spawn_enemies' && !ENEMY_BY_ID[e.enemy]) err(where + ': spawn_enemies of unknown enemy ' + e.enemy);
  if (e.kind === 'spawn' && !(e.minion && e.minion.hp > 0 && e.minion.duration > 0)) err(where + ': spawn minion needs hp and duration');
  if (e.kind === 'multi') {
    if (!Array.isArray(e.steps) || !e.steps.length) err(where + ': multi needs steps');
    else e.steps.forEach((s, i) => { if (s.kind === 'multi') err(where + ': multi cannot nest multi'); validateEffect(s, where + '.steps[' + i + ']', err, ctx); });
  }
  for (const k of spec.nested || []) if (e[k]) validateEffect(e[k], where + '.' + k, err, ctx);
}

function validateRelicEffect(e, where, err) {
  if (!e || !RELIC_KINDS.includes(e.kind)) return err(where + ': bad relic effect kind ' + (e && e.kind));
  if (e.kind === 'stat_mod') {
    if (!MOD_SCOPE_RE.test(e.scope || '')) err(where + ': bad scope ' + e.scope);
    if (!MOD_STATS.includes(e.stat)) err(where + ': bad stat ' + e.stat);
    if (e.mult === undefined && e.add === undefined) err(where + ': stat_mod needs mult or add');
  } else if (e.kind === 'on_event') {
    if (!TRIGGERS.includes(e.trigger)) err(where + ': bad trigger ' + e.trigger);
    if (e.chance !== undefined && !(e.chance > 0 && e.chance <= 1)) err(where + ': bad chance');
    validateEffect(e.effect, where + '.effect', err);
  } else if (e.kind === 'rule') {
    if (!RULES.includes(e.rule)) err(where + ': bad rule ' + e.rule);
    if (e.value === undefined) err(where + ': rule needs value');
  } else if (e.kind === 'multi_mod') {
    if (!Array.isArray(e.steps) || !e.steps.length) err(where + ': multi_mod needs steps');
    else e.steps.forEach((s, i) => { if (s.kind === 'multi_mod') err(where + ': no nested multi_mod'); validateRelicEffect(s, where + '.steps[' + i + ']', err); });
  }
}

const validateAny = (e, where, err) => (e && RELIC_KINDS.includes(e.kind) ? validateRelicEffect(e, where, err) : validateEffect(e, where, err));
const dupes = (arr, label, err) => {
  const seen = new Set();
  for (const x of arr) { if (seen.has(x.id)) err(label + ': duplicate id ' + x.id); seen.add(x.id); if (!/^[a-z][a-z0-9_]*$/.test(x.id)) err(label + ': bad id ' + x.id); }
};
const noEmDash = (v, where, err) => {
  const s = JSON.stringify(v);
  if (s.includes(String.fromCharCode(0x2014))) err(where + ': contains an em dash');
};

// Returns { ok, errors:[string], counts }. Pass extra = { buildings, crates } arrays to also check their ids are unique.
export function validateAll(extra = {}) {
  const errors = [];
  const err = (m) => errors.push(m);

  dupes(CATS, 'cat', err); dupes(ENEMIES, 'enemy', err); dupes(CARDS, 'card', err); dupes(RELICS, 'relic', err); dupes(DISTRICTS, 'district', err);
  for (const k of Object.keys(extra)) if (Array.isArray(extra[k])) dupes(extra[k], k, err);

  const cnt = { cats: CATS.length, enemies: ENEMIES.length, bosses: ENEMIES.filter((e) => e.boss).length, cards: CARDS.length, relics: RELICS.length, districts: DISTRICTS.length };
  for (const r of RARITIES) cnt[r] = CATS.filter((c) => c.rarity === r).length;
  for (const k of Object.keys(MIN)) if (cnt[k] < MIN[k]) err('count: ' + k + ' is ' + cnt[k] + ', need at least ' + MIN[k]);

  for (const c of CATS) {
    const w = 'cat ' + c.id;
    if (!CAT_ROLES.includes(c.role)) err(w + ': bad role ' + c.role);
    if (!RARITIES.includes(c.rarity)) err(w + ': bad rarity ' + c.rarity);
    if (!Array.isArray(c.tags) || !c.tags.length) err(w + ': needs tags');
    for (const k of ['hp', 'dmg', 'range', 'rate']) if (!(c.base[k] > 0)) err(w + ': base.' + k + ' must be > 0');
    if (!(c.base.speed >= 0)) err(w + ': base.speed must be >= 0');
    if (!(c.perLevel.hp > 0 && c.perLevel.dmg > 0)) err(w + ': perLevel must be > 0');
    if (!c.ability || !c.ability.id || !(c.ability.cooldown > 0)) err(w + ': ability needs id and cooldown');
    else validateEffect(c.ability.effect, w + '.ability', err);
    if (!c.flavor) err(w + ': missing flavor');
    noEmDash(c, w, err);
  }
  const abIds = CATS.map((c) => c.ability.id);
  if (new Set(abIds).size !== abIds.length) err('cats: ability ids must be unique');
  for (const r of RARITIES) for (const role of CAT_ROLES) if (!CATS.some((c) => c.role === role)) err('roster: no cat for role ' + role);

  for (const e of ENEMIES) {
    const w = 'enemy ' + e.id;
    if (!(e.tier >= 1 && e.tier <= 6)) err(w + ': tier 1..6');
    if (!DISTRICT_BY_ID[e.district]) err(w + ': unknown district ' + e.district);
    for (const k of ['hp', 'dmg', 'reward']) if (!(e.base[k] > 0)) err(w + ': base.' + k + ' must be > 0');
    if (!(e.base.speed > 0)) err(w + ': base.speed must be > 0');
    for (const t of e.traits) if (!TRAITS.includes(t)) err(w + ': unknown trait ' + t);
    if (e.boss !== e.traits.includes('boss')) err(w + ': boss flag and boss trait disagree');
    if (e.flying !== e.traits.includes('flying')) err(w + ': flying flag and trait disagree');
    for (const k of Object.keys(e.params)) if (!e.traits.includes(k)) err(w + ': param ' + k + ' without trait');
    const need = { splitter: 'into', summoner: 'enemy', healer: 'pct', armored: 'armor', shielded: 'shield', burrower: 'every', explosive: 'radius', swarm: 'group' };
    for (const t of e.traits) if (need[t] && !(e.params[t] && e.params[t][need[t]] !== undefined)) err(w + ': trait ' + t + ' needs params.' + t + '.' + need[t]);
    if (e.params.splitter && !ENEMY_BY_ID[e.params.splitter.into]) err(w + ': splits into unknown ' + e.params.splitter.into);
    if (e.params.summoner && !ENEMY_BY_ID[e.params.summoner.enemy]) err(w + ': summons unknown ' + e.params.summoner.enemy);
    if (e.ability) { if (!(e.ability.every > 0)) err(w + ': ability.every'); validateEffect(e.ability.effect, w + '.ability', err); }
    if (e.boss) {
      if (e.phases.length < 3) err(w + ': boss needs at least 3 phases');
      e.phases.forEach((p, i) => {
        if (!(p.at > 0 && p.at <= 1)) err(w + ': phase ' + i + ' bad at');
        if (i > 0 && !(p.at < e.phases[i - 1].at)) err(w + ': phases must descend');
        if (p.effect) validateEffect(p.effect, w + '.phase' + i, err);
      });
    } else if (e.phases.length) err(w + ': only bosses have phases');
    noEmDash(e, w, err);
  }

  for (const c of CARDS) {
    const w = 'card ' + c.id;
    if (!CARD_TYPES.includes(c.type)) err(w + ': bad type ' + c.type);
    if (!RARITIES.includes(c.rarity)) err(w + ': bad rarity ' + c.rarity);
    if (!Number.isInteger(c.cost) || c.cost < 0 || c.cost > 5) err(w + ': cost 0..5');
    if (!c.text) err(w + ': text');
    if (!c.effect || !CARD_TARGETS.includes(c.effect.target)) err(w + ': effect.target must be one of ' + CARD_TARGETS.join('|'));
    validateEffect(c.effect, w, err);
    if (c.type === 'summon' && c.effect.kind !== 'summon') err(w + ': summon cards use kind summon');
    if (c.type === 'trap' && c.effect.kind !== 'trap') err(w + ': trap cards use kind trap');
    noEmDash(c, w, err);
  }
  for (const c of CATS) if (!CARDS.some((k) => k.effect.kind === 'summon' && k.effect.cat === c.id)) err('cat ' + c.id + ': no summon card');
  for (let cost = 0; cost <= 5; cost++) if (!CARDS.some((k) => k.cost === cost)) err('cards: nothing costs ' + cost);

  for (const r of RELICS) {
    const w = 'relic ' + r.id;
    if (!RARITIES.includes(r.rarity)) err(w + ': bad rarity ' + r.rarity);
    if (!r.text || !r.flavor) err(w + ': text and flavor');
    if (!Array.isArray(r.synergy)) err(w + ': synergy array');
    validateRelicEffect(r.effect, w, err);
    noEmDash(r, w, err);
  }

  let expectFrom = 1;
  for (const d of DISTRICTS) {
    const w = 'district ' + d.id;
    if (d.stages[0] !== expectFrom || d.stages[1] !== expectFrom + 9) err(w + ': stages must be contiguous blocks of 10');
    expectFrom = d.stages[1] + 1;
    const boss = ENEMY_BY_ID[d.boss];
    if (!boss || !boss.boss) err(w + ': boss ' + d.boss + ' missing or not a boss');
    else if (boss.district !== d.id) err(w + ': boss belongs to ' + boss.district);
    if (d.bossStage !== d.stages[1]) err(w + ': bossStage must be the last stage');
    if (!d.enemyPool.length) err(w + ': empty enemyPool');
    for (const p of d.enemyPool) { if (!ENEMY_BY_ID[p.id]) err(w + ': pool has unknown enemy ' + p.id); else if (ENEMY_BY_ID[p.id].boss) err(w + ': boss in pool'); if (!(p.weight > 0 && p.from >= 1 && p.from <= 10)) err(w + ': bad pool entry ' + p.id); }
    if (!d.enemyPool.some((p) => p.from === 1)) err(w + ': needs an enemy available from stage 1');
    if (!d.palette || !d.palette.skyTop || !d.palette.accent) err(w + ': palette');
    validateAny(d.modifier.effect, w + '.modifier', err);
    noEmDash(d, w, err);
  }
  for (const a of ELITE_AFFIXES) validateAny(a.effect, 'affix ' + a.id, err);
  if (ENDLESS.startStage !== expectFrom) err('endless: startStage must follow the last district');

  return { ok: errors.length === 0, errors, counts: cnt };
}
