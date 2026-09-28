// Clawspire content suite: validates js/data.js against the design bible's
// schema so every other module can trust DATA blindly. Headless, util+data only.
import fs from 'fs';
import path from 'path';
import { boot, harness, DIR } from './clawspire_lib.mjs';

const t = harness('clawspire data');
const { U, DATA } = boot({ only: ['util', 'data'] });
const SRC = fs.readFileSync(path.join(DIR, 'js', 'data.js'), 'utf8');

const {
  ITEMS, STATUS, ENEMIES, ENCOUNTERS, RELICS, EVENTS, CLAW_UPGRADES, BRUSHES, CHARACTERS, ACTS,
} = DATA || {};

// The bible's closed lists, written out here independently of data.js so a
// drifted list in data.js is caught too.
const ITEM_ART = 'sword dagger axe hammer anvil shield buckler potion flask bomb torch iceshard snowball coin gem rock slag iceblock apple bread book scroll orb ring key chain horn whetstone feather skull star boot bone bottle heart lantern wand mask egg dice chip card horseshoe clover slot potato pill cookie'.split(' ');
const ENEMY_ART = 'rat slime bat gremlin mimic spider goblin hoard imp clockwork golem furnace magnet ironjaw wraith yeti frostmage icemimic prizemaster mushroom knight wisp crab drone tinker cultist raccoon goat magpie tickler jelly barker magbat mole dozer ghost collector'.split(' ');
const TAGS = 'metal weapon glass potion heavy light junk magic food tool small'.split(' ');
const FX = 'dmg block heal status grab gold ink maxhp shake junk purge copy dmgPer cleanse lifesteal random poisonAll blockPer pay again'.split(' ');
const PER = 'block junk metal grabsUsed poison burn small streak gold luck'.split(' ');
const MOVES = 'attack block buff debuff heal shake grease fog junk steal freezeItem summon tilt charge escape gulp bomb corrode jam eggs tickle glue wheel ceiling bury plow vanish'.split(' ');
const EVENT_FX = 'hp maxhp gold ink brush item relic remove upgrade claw fight junk'.split(' ');
const MODS = 'grabs width grip speed prongs rubber magnet maxhp gold ink startBlock startStr'.split(' ');
const HOOKS = 'onFightStart onTurnStart onTurnEnd onPlay onGrab onDmgDealt onKill onHurt onStatus onBlock onHeal onJunk onCombo onJackpot onShatter onGold onCashOut onEat onMaterial onPet'.split(' ');
// Round 6 (sets): The Hungry Pack's three pet relics, left out of the build pass's counts.
const R6_RELICS = 'chew_toy treat_jar dog_whistle'.split(' ');
const RULES = 'poisonKeep blockKeep shatter glassBreak amp comboTwice echo luck cashAmp'.split(' ');
const ARCHS = 'poison burn frost fortress brawler metal junk jackpot swarm glass feast greed echo luck'.split(' ');
const STATUSES = 'block str weak vuln poison burn chill freeze regen thorns dodge bleed stun grease fog shield_up enrage armor streak luck'.split(' ');
const CHARS = 'knight alchemist rogue gambler'.split(' ');
// Round 3 content (Lucky Lou and the synergy pass): checked in its own block
// below, left out of the build pass's own "new content" counts.
const R3_ITEMS = 'bone_dice poker_chip scratch_card fortune_cookie double_or_nothing lucky_horseshoe marked_deck one_armed_bandit roulette_wheel golden_dice poison_pill hot_potato crystal_dice floating_token firecracker lucky_clover'.split(' ');
const R3_RELICS = 'snake_eyes pity_timer dealers_visor lucky_ticket lucky_cat wheel_of_fortune rabbits_foot high_roller ticket_roll gacha_charm heartburn broken_mirror blasting_cap lodestone sand_pail big_catch'.split(' ');
const BIN_KINDS = ['shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'tilt', 'gulp', 'bomb', 'corrode', 'jam', 'eggs', 'tickle', 'glue', 'wheel', 'ceiling', 'bury', 'plow', 'vanish'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const junkIds = () => Object.keys(ITEMS).filter(id => ITEMS[id].rarity === 'junk');
const isSmall = (d) => !!d && Array.isArray(d.tags) && d.tags.includes('small');
const smallIds = () => Object.keys(ITEMS).filter(id => isSmall(ITEMS[id]));
const bagIds = () => Object.keys(ITEMS).filter(id => ITEMS[id].bag);

t.test('module shape', () => {
  t.ok(DATA && typeof DATA === 'object', 'DATA exists');
  for (const k of ['ITEMS', 'STATUS', 'ENEMIES', 'ENCOUNTERS', 'RELICS', 'EVENTS', 'CLAW_UPGRADES', 'BRUSHES', 'CHARACTERS', 'ACTS'])
    t.ok(DATA[k] && typeof DATA[k] === 'object', `DATA.${k} exists`);
  for (const k of ['itemText', 'pool', 'rollRarity', 'rewardItems', 'keywords', 'kwIds', 'combosFor', 'investment', 'pickRelic'])
    t.ok(typeof DATA[k] === 'function', `DATA.${k} is a function`);
  const top = SRC.split('\n').filter(l => /^(const|let|var|function|class)\b/.test(l));
  t.eq(top.length, 1, 'exactly one top-level declaration');
  t.ok(/^const DATA = \(\(\) => \{/m.test(SRC), 'top level is const DATA = (() => {');
  t.ok(!/[\u2014\u2013]/.test(SRC), 'no em or en dashes in data.js');
  t.ok(!/Math\.random/.test(SRC), 'no Math.random in data.js');
  t.ok(!/\b(document|window|localStorage)\b/.test(SRC.replace(/\/\/.*$/gm, '')), 'no DOM access in data.js');
});

// ---------------------------------------------------------------- items
function checkFx(list, where) {
  t.ok(Array.isArray(list), `${where}: fx is an array`);
  for (const f of list || []) {
    t.ok(FX.includes(f.k), `${where}: fx kind ${f.k} allowed`);
    const needV = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'dmgPer', 'lifesteal', 'random', 'blockPer', 'pay'];
    if (needV.includes(f.k)) t.ok(isNum(f.v), `${where}: ${f.k} has numeric v`);
    if (f.k === 'dmg' && f.n != null) t.ok(Number.isInteger(f.n) && f.n >= 1, `${where}: dmg n is a positive int`);
    if (f.k === 'status') {
      t.ok(!!STATUS[f.s], `${where}: status ${f.s} exists`);
      t.ok(['enemy', 'self', 'all'].includes(f.to), `${where}: status to ${f.to} valid`);
      t.ok(f.v > 0, `${where}: status v positive`);
    }
    if (f.k === 'junk') {
      t.ok(!!ITEMS[f.id] && ITEMS[f.id].rarity === 'junk', `${where}: junk id ${f.id} is a junk item`);
      t.ok(Number.isInteger(f.n) && f.n >= 1, `${where}: junk n`);
      t.eq(f.to, 'self', `${where}: junk to self`);
    }
    if (f.k === 'purge') t.ok(Number.isInteger(f.n) && f.n >= 1, `${where}: purge n`);
    if (f.k === 'dmgPer' || f.k === 'blockPer') t.ok(PER.includes(f.per), `${where}: ${f.k} per ${f.per}`);
    if (f.k === 'pay') t.ok(f.v > 0, `${where}: pay costs something`);
    if (f.k === 'copy' && f.tag != null) t.ok(TAGS.includes(f.tag), `${where}: copy tag ${f.tag}`);
    if (f.k === 'random') t.ok(isNum(f.min) && isNum(f.max) && f.min >= 0 && f.min <= f.max, `${where}: random min<=max`);
  }
}

function checkShape(s, where, small) {
  t.ok(s && ['circle', 'box', 'poly'].includes(s.kind), `${where}: shape kind`);
  if (!s) return;
  // Small fillers are r 9-11 so the claw's cradle carries two or three.
  if (s.kind === 'circle' && small) t.ok(isNum(s.r) && s.r >= 9 && s.r <= 11, `${where}: small circle r 9..11 [${s.r}]`);
  else if (s.kind === 'circle') t.ok(isNum(s.r) && s.r >= 10 && s.r <= 30, `${where}: circle r 10..30 [${s.r}]`);
  if (s.kind === 'box') {
    const L = Math.max(s.w, s.h), S = Math.min(s.w, s.h);
    t.ok(L >= 20 && L <= 60, `${where}: box long axis 20..60 [${L}]`);
    t.ok(S >= 6, `${where}: box short axis >= 6 [${S}]`);
  }
  if (s.kind === 'poly') {
    const v = s.verts || [];
    t.ok(v.length >= 3 && v.length <= 8, `${where}: poly 3..8 verts [${v.length}]`);
    let area = 0, convex = true, cx = 0, cy = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], c = v[(i + 2) % v.length];
      const cr = a.x * b.y - b.x * a.y;
      area += cr; cx += (a.x + b.x) * cr; cy += (a.y + b.y) * cr;
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) convex = false;
    }
    t.ok(area > 0, `${where}: poly wound CCW (positive area)`);
    t.ok(convex, `${where}: poly strictly convex`);
    cx /= 3 * area; cy /= 3 * area;
    t.ok(Math.hypot(cx, cy) < 1.5, `${where}: poly centred on its centroid`);
    const xs = v.map(p => p.x), ys = v.map(p => p.y);
    const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys);
    t.ok(W <= 60 && H <= 60, `${where}: poly within 60px [${W}x${H}]`);
    t.ok(Math.max(W, H) >= 20, `${where}: poly long axis >= 20`);
  }
}

t.test('items', () => {
  const ids = Object.keys(ITEMS);
  t.ok(ids.length >= 48, `>= 48 items [${ids.length}]`);
  t.ok(ids.length >= 67, `>= 67 items with the small fillers and bags [${ids.length}]`);
  t.ok(ids.length >= 95, `>= 95 items with the build pieces [${ids.length}]`);
  const by = (r) => ids.filter(id => ITEMS[id].rarity === r).length;
  t.ok(by('c') >= 16, `commons [${by('c')}]`);
  t.ok(by('u') >= 12, `uncommons [${by('u')}]`);
  t.ok(by('r') >= 10, `rares [${by('r')}]`);
  t.ok(by('l') >= 4, `legendaries [${by('l')}]`);
  t.eq(junkIds().sort().join(','), 'broodegg,fusebomb,hoardcoin,iceblock,rock,slag', 'junk items are rock, slag, iceblock plus the monster junk (lit bomb, spider egg) and the Hoard\'s coins');
  for (const ch of ['knight', 'alchemist', 'rogue']) {
    const n = ids.filter(id => ITEMS[id].char === ch).length;
    t.ok(n >= 6, `${ch} pool >= 6 [${n}]`);
    t.ok(ids.some(id => ITEMS[id].char === ch && ITEMS[id].rarity === 'l'), `${ch} has a legendary`);
  }
  t.ok(ids.filter(id => !ITEMS[id].char).length >= 15, 'plenty of shared items');
  const used = new Set();
  for (const id of ids) {
    const d = ITEMS[id], W = `item ${id}`;
    t.eq(d.id, id, `${W}: key matches id`);
    t.ok(typeof d.name === 'string' && d.name.length > 1, `${W}: name`);
    t.ok(['c', 'u', 'r', 'l', 'junk'].includes(d.rarity), `${W}: rarity`);
    t.ok(isNum(d.cost) && d.cost >= 0, `${W}: cost`);
    if (isSmall(d)) t.ok(d.cost >= 10 && d.cost <= 25, `${W}: small filler cost 10..25`);
    else if (d.bag) t.ok(d.cost >= 25 && d.cost <= 35, `${W}: bag cost 25..35`);
    else if (d.rarity !== 'junk') t.ok(d.cost >= 30 && d.cost <= 160, `${W}: cost in shop range`);
    t.ok(Array.isArray(d.tags) && d.tags.every(x => TAGS.includes(x)), `${W}: tags allowed`);
    t.eq(d.rarity === 'junk', d.tags.includes('junk'), `${W}: junk tag iff junk rarity`);
    checkShape(d.shape, W, isSmall(d));
    t.ok(isNum(d.density) && d.density >= 0.3 && d.density <= 3, `${W}: density`);
    t.ok(isNum(d.friction) && d.friction >= 0 && d.friction <= 1.2, `${W}: friction`);
    t.ok(isNum(d.restitution) && d.restitution >= 0 && d.restitution <= 1, `${W}: restitution`);
    t.ok(isHex(d.color) && isHex(d.color2), `${W}: colors`);
    t.ok(ITEM_ART.includes(d.art), `${W}: art key ${d.art}`);
    used.add(d.art);
    t.ok(['enemy', 'all', 'self', 'random', 'none'].includes(d.target), `${W}: target`);
    checkFx(d.fx, W);
    if (d.bag) {
      // A bag never reaches a cabinet: the game adds its contents instead.
      t.eq(d.fx.length, 0, `${W}: a bag has no effects of its own`);
      t.ok(!d.plus, `${W}: a bag has no plus`);
    } else if (d.rarity !== 'junk') {
      t.ok(d.fx.length >= 1, `${W}: has effects`);
      t.ok(d.plus && typeof d.plus.name === 'string' && Array.isArray(d.plus.fx) && d.plus.fx.length, `${W}: has a plus`);
      checkFx(d.plus.fx, `${W}+`);
      t.ok(d.plus.fx.map(f => f.k).join() !== '' , `${W}: plus fx non-empty`);
      t.ok(JSON.stringify(d.plus.fx) !== JSON.stringify(d.fx), `${W}: plus differs`);
    }
    if (d.char != null) t.ok(CHARS.includes(d.char), `${W}: char`);
    t.ok(typeof d.text === 'string' && d.text.length > 5, `${W}: text`);
    for (const plus of [false, true]) {
      const s = DATA.itemText(d, plus);
      t.ok(!/[{}]/.test(s), `${W}: itemText fully substituted [${s}]`);
    }
  }
  for (const a of ITEM_ART) t.ok(used.has(a), `item art ${a} used`);
});

t.test('small fillers', () => {
  const ids = smallIds();
  t.ok(ids.length >= 8, `>= 8 small fillers [${ids.length}]`);
  const looks = new Set();
  for (const id of ids) {
    const d = ITEMS[id], W = `small ${id}`;
    t.eq(d.rarity, 'c', `${W}: common`);
    t.ok(d.shape && d.shape.kind === 'circle' && d.shape.r >= 9 && d.shape.r <= 11, `${W}: circle r 9..11`);
    t.ok(d.cost >= 10 && d.cost <= 25, `${W}: cost 10..25 [${d.cost}]`);
    t.ok(!d.char && !d.starter && !d.bag, `${W}: shared, not a starter, not a bag`);
    t.ok(!d.exhaust, `${W}: stays in the bin`);
    t.ok(d.plus && d.plus.fx.length >= 1, `${W}: has a plus`);
    // Fillers are a little bit of something, never a real card's worth.
    const fx = d.plus.fx;
    const hit = fx.reduce((a, f) => a + (f.k === 'dmg' ? f.v * (f.n || 1) : f.k === 'random' ? f.max : 0), 0);
    t.ok(hit <= 5, `${W}+: at most 5 damage [${hit}]`);
    t.ok(fx.every(f => ['dmg', 'block', 'heal', 'status', 'gold', 'random'].includes(f.k)), `${W}: simple effects only`);
    t.ok(fx.every(f => f.k !== 'status' || f.v <= 3), `${W}+: at most 3 stacks of a status`);
    looks.add(d.art + d.color + d.color2);
  }
  t.eq(looks.size, ids.length, 'every filler has its own art and colours');
  const bigLooks = new Set(Object.keys(ITEMS).filter(id => !isSmall(ITEMS[id]) && !ITEMS[id].bag).map(id => ITEMS[id].art + ITEMS[id].color));
  t.ok(ids.every(id => !bigLooks.has(ITEMS[id].art + ITEMS[id].color)), 'fillers do not copy a big item look');
  t.ok(ids.some(id => ITEMS[id].fx.some(f => f.k === 'dmg')), 'some fillers deal damage');
  t.ok(ids.some(id => ITEMS[id].fx.some(f => f.k === 'block')), 'some fillers block');
  t.ok(ids.some(id => ITEMS[id].fx.some(f => f.k === 'heal')), 'some fillers heal');
  t.ok(ids.some(id => ITEMS[id].restitution >= 0.8), 'a bouncy one');
  t.ok(ids.some(id => ITEMS[id].density >= 2), 'a heavy one');
  // Kept out of single-item pools; asked for by tag they are all there.
  t.ok(DATA.pool().every(id => !isSmall(ITEMS[id]) && !ITEMS[id].bag), 'pool() skips fillers and bags');
  t.eq(DATA.pool('c', null, ['small']).sort().join(), ids.slice().sort().join(), "pool('c', null, ['small']) lists the fillers");
});

t.test('bags', () => {
  const ids = bagIds();
  t.ok(ids.length >= 3, `>= 3 bags [${ids.length}]`);
  for (const k of ['bag_marbles', 'bag_beads', 'bag_sweets']) t.ok(!!ITEMS[k] && Array.isArray(ITEMS[k].bag), `${k} is a bag`);
  for (const id of ids) {
    const d = ITEMS[id], W = `bag ${id}`;
    t.ok(id.startsWith('bag_'), `${W}: id starts with bag_`);
    t.eq(d.rarity, 'c', `${W}: common`);
    t.ok(!d.char && !d.starter, `${W}: shared, not a starter`);
    t.ok(Array.isArray(d.bag) && d.bag.length >= 2 && d.bag.length <= 4, `${W}: 2..4 items [${d.bag && d.bag.length}]`);
    for (const x of d.bag || []) {
      t.ok(!!ITEMS[x], `${W}: ${x} exists`);
      t.ok(isSmall(ITEMS[x]) && !ITEMS[x].bag && ITEMS[x].rarity !== 'junk', `${W}: ${x} is a small filler`);
    }
    const worth = (d.bag || []).reduce((a, x) => a + (ITEMS[x] ? ITEMS[x].cost : 0), 0);
    t.ok(d.cost <= worth, `${W}: costs no more than its contents (${d.cost} <= ${worth})`);
  }
});

t.test('itemText', () => {
  const s = DATA.itemText(ITEMS.rusty_sword), p = DATA.itemText(ITEMS.rusty_sword, true);
  t.ok(s.includes(String(ITEMS.rusty_sword.fx[0].v)), 'base v substituted');
  t.ok(p.includes(String(ITEMS.rusty_sword.plus.fx[0].v)), 'plus v substituted');
  const fake = { text: 'Deal {v}, then {v2}, {n} times, {min}-{max}', fx: [{ k: 'dmg', v: 4, n: 2 }, { k: 'block', v: -3 }, { k: 'random', v: 5, min: 1, max: 9 }] };
  t.eq(DATA.itemText(fake), 'Deal 4, then 3, 2 times, 1-9', 'tokens');
  t.ok(DATA.itemText({ text: 'Zap.', fx: [], exhaust: true }).endsWith('Exhaust.'), 'exhaust appended');
  t.eq(DATA.itemText(null), '', 'null safe');
});

t.test('statuses', () => {
  for (const s of STATUSES) t.ok(!!STATUS[s], `status ${s} exists`);
  for (const id in STATUS) {
    const d = STATUS[id];
    t.eq(d.id, id, `status ${id} key`);
    t.ok(typeof d.name === 'string' && d.name, `status ${id} name`);
    t.ok(typeof d.icon === 'string' && Array.from(d.icon).length >= 1 && Array.from(d.icon).length <= 2, `status ${id} icon 1-2 chars`);
    t.ok(isHex(d.color), `status ${id} color`);
    t.ok(['buff', 'debuff'].includes(d.kind), `status ${id} kind`);
    t.ok(['count', 'turns'].includes(d.stack), `status ${id} stack`);
    t.ok(typeof d.text === 'string' && d.text.length > 5, `status ${id} text`);
  }
});

// -------------------------------------------------------------- enemies
t.test('enemies', () => {
  const ids = Object.keys(ENEMIES);
  t.ok(ids.length >= 26, `>= 26 enemies [${ids.length}]`);
  const kinds = new Set(), arts = new Set();
  for (const id of ids) {
    const e = ENEMIES[id], W = `enemy ${id}`;
    t.eq(e.id, id, `${W}: key`);
    t.ok([1, 2, 3].includes(e.act), `${W}: act`);
    t.ok(['normal', 'elite', 'boss'].includes(e.tier), `${W}: tier`);
    t.ok(Array.isArray(e.hp) && e.hp.length === 2 && e.hp[0] > 0 && e.hp[0] <= e.hp[1], `${W}: hp range`);
    t.ok(ENEMY_ART.includes(e.art), `${W}: art ${e.art}`);
    arts.add(e.art);
    t.ok(isNum(e.size) && e.size > 0.3 && e.size <= 2, `${W}: size`);
    t.ok(typeof e.desc === 'string' && e.desc.length > 5, `${W}: desc`);
    t.ok(['cycle', 'random', 'weighted'].includes(e.ai), `${W}: ai`);
    t.ok(Array.isArray(e.moves) && e.moves.length >= 1, `${W}: moves`);
    const mids = new Set();
    e.moves.forEach((m, i) => {
      const M = `${W} move ${m.id}`;
      t.ok(typeof m.id === 'string' && !mids.has(m.id), `${M}: unique id`);
      mids.add(m.id);
      t.ok(typeof m.name === 'string' && m.name, `${M}: name`);
      t.ok(typeof m.txt === 'string' && m.txt, `${M}: txt`);
      t.ok(MOVES.includes(m.k), `${M}: kind ${m.k}`);
      kinds.add(m.k);
      if (['attack', 'block', 'heal', 'charge'].includes(m.k)) t.ok(isNum(m.v) && m.v > 0, `${M}: v`);
      if (m.k === 'attack' && m.n != null) t.ok(Number.isInteger(m.n) && m.n >= 1, `${M}: n`);
      if (m.k === 'buff' || m.k === 'debuff') {
        t.ok(!!STATUS[m.s], `${M}: status ${m.s} exists`);
        t.ok(isNum(m.v) && m.v > 0, `${M}: v`);
        t.eq(STATUS[m.s] && STATUS[m.s].kind, m.k === 'buff' ? 'buff' : 'debuff', `${M}: ${m.k} uses a ${m.k} status`);
      }
      if (m.k === 'junk') t.ok(!!ITEMS[m.item] && ITEMS[m.item].rarity === 'junk' && m.n >= 1, `${M}: junk item + n`);
      if (m.k === 'summon') t.ok(!!ENEMIES[m.id] && m.id !== id, `${M}: summons an existing enemy`);
      if (m.k === 'grease' || m.k === 'fog') t.ok(isNum(m.v) && m.v >= 1, `${M}: turns`);
      if (m.to != null) t.ok(['all', 'self'].includes(m.to), `${M}: to`);
      if (e.ai === 'weighted') t.ok(isNum(m.w) && m.w > 0, `${M}: weight`);
    });
    if (e.pattern) {
      t.ok(e.ai === 'cycle', `${W}: pattern only with cycle ai`);
      t.ok(e.pattern.every(i => Number.isInteger(i) && i >= 0 && i < e.moves.length), `${W}: pattern indices valid`);
    }
    if (e.ai === 'cycle') {
      const seq = e.pattern || e.moves.map((m, i) => i);
      e.moves.forEach((m, i) => t.ok(seq.includes(i), `${W}: move ${m.id} is reachable`));
      // combat unleashes a charge by itself on the next turn: a charge
      // straight into an attack would double up, and two charges in a row waste one.
      seq.forEach((i, k) => {
        if (e.moves[i].k !== 'charge') return;
        const nx = e.moves[seq[(k + 1) % seq.length]];
        t.ok(nx.k !== 'charge', `${W}: no charge right after charge`);
      });
    }
    if (e.onDeath) {
      const o = e.onDeath;
      t.ok(['summon', 'junk', 'heal'].includes(o.k), `${W}: onDeath kind`);
      if (o.k === 'summon') t.ok(!!ENEMIES[o.id], `${W}: onDeath summon exists`);
      if (o.k === 'junk') t.ok(!!ITEMS[o.id] && ITEMS[o.id].rarity === 'junk', `${W}: onDeath junk exists`);
      if (o.k === 'heal') t.ok(isNum(o.v), `${W}: onDeath heal v`);
    }
    if (e.status) for (const s in e.status) t.ok(!!STATUS[s], `${W}: starting status ${s} exists`);
  }
  for (const k of MOVES) t.ok(kinds.has(k), `move kind ${k} used somewhere`);
  for (const a of ENEMY_ART) t.ok(arts.has(a), `enemy art ${a} used`);
  t.ok(ENEMIES.prizemaster && ENEMIES.prizemaster.tier === 'boss' && ENEMIES.prizemaster.art === 'prizemaster', 'prizemaster final boss');
  const pmReach = Object.values(ENEMIES).some(e => (e.onDeath && e.onDeath.id === 'prizemaster') ||
    e.moves.some(m => m.k === 'summon' && m.id === 'prizemaster')) ||
    [1, 2, 3].some(a => ENCOUNTERS[a].boss.some(enc => enc.includes('prizemaster')));
  t.ok(pmReach, 'prizemaster is reachable in a run');

  for (const act of [1, 2, 3]) {
    const mine = ids.map(i => ENEMIES[i]).filter(e => e.act === act && !e.minion);
    const n = (tier) => mine.filter(e => e.tier === tier).length;
    t.ok(n('normal') >= 6, `act ${act}: >= 6 normal enemies [${n('normal')}]`);
    t.ok(n('elite') >= 2, `act ${act}: >= 2 elites`);
    t.ok(n('boss') >= 1, `act ${act}: >= 1 boss`);
    // bin sabotage is introduced act by act
    const bin = new Set();
    ids.map(i => ENEMIES[i]).filter(e => e.act === act).forEach(e => e.moves.forEach(m => { if (BIN_KINDS.includes(m.k)) bin.add(m.k); }));
    if (act === 1) {
      t.ok(bin.has('shake') && bin.has('junk'), 'act 1 introduces shake and junk');
      // The monsters pass: act 1 also eats items, drops a bomb and lays eggs
      // (each shown in its telegraph); grease, steal, tilt, fog, ice stay later.
      // (the bestiary adds the gentle machine tricks: a tickled claw, a sticky pile, the prize wheel)
      t.ok([...bin].every(k => ['shake', 'junk', 'gulp', 'bomb', 'eggs', 'tickle', 'glue', 'wheel'].includes(k)), `act 1 only shakes, junks, gulps, bombs, lays eggs, tickles, glues and spins [${[...bin]}]`);
      for (const k of ['gulp', 'bomb', 'eggs']) t.ok(bin.has(k), `act 1 introduces ${k}`);
    }
    if (act === 2) {
      for (const k of ['grease', 'steal', 'tilt']) t.ok(bin.has(k), `act 2 introduces ${k}`);
      t.ok(!bin.has('fog') && !bin.has('freezeItem'), 'act 2 saves fog and freezeItem for act 3');
      for (const k of ['corrode', 'jam']) t.ok(bin.has(k), `act 2 introduces ${k}`);
    }
    if (act === 3) for (const k of ['fog', 'freezeItem']) t.ok(bin.has(k), `act 3 introduces ${k}`);
    // Balance bands: the bible's, lifted ~x1.3 by the balance pass (the
    // claw delivers more often than the bible assumed, and later acts face
    // bigger bins; act 3 sits near x1.7; see the balance suite).
    const band = { 1: [10, 40], 2: [24, 80], 3: [36, 136] }[act];
    mine.filter(e => e.tier === 'normal').forEach(e =>
      t.ok(e.hp[0] >= band[0] && e.hp[1] <= band[1], `act ${act} normal ${e.id} hp in band [${e.hp}]`));
    // Act 3's boss fight is two phases (the boss, then its onDeath summon).
    const bossMin = { 1: 90, 2: 150, 3: 280 }[act];
    const fightHp = (e) => e.hp[0] + (e.onDeath && e.onDeath.k === 'summon' && ENEMIES[e.onDeath.id] ? ENEMIES[e.onDeath.id].hp[0] : 0);
    mine.filter(e => e.tier === 'boss' && ENCOUNTERS[act].boss.some(enc => enc.includes(e.id)))
      .forEach(e => t.ok(fightHp(e) >= bossMin, `act ${act} boss fight ${e.id} hp ${fightHp(e)} >= ${bossMin}`));
  }
});

// The monsters pass: new move fields, phase two specs, affixes.
t.test('monsters: new moves, phase two, affixes', () => {
  const likes = TAGS.concat(['shiny']);
  let gulpers = 0;
  for (const id in ENEMIES) {
    const e = ENEMIES[id], W = `enemy ${id}`;
    for (const m of e.moves) {
      const M = `${W} move ${m.id}`;
      if (m.k === 'gulp') { gulpers++; t.ok(Number.isInteger(m.n) && m.n >= 1 && m.n <= 3, `${M}: gulp n 1..3`); t.ok(m.like == null || likes.includes(m.like), `${M}: like ${m.like}`); }
      if (m.k === 'bomb') { t.ok(isNum(m.v) && m.v > 0 && Number.isInteger(m.fuse) && m.fuse >= 1, `${M}: bomb v + fuse`); }
      if (m.k === 'eggs') {
        t.ok(!!ENEMIES[m.hatch] && ENEMIES[m.hatch].minion, `${M}: hatches a minion (${m.hatch})`);
        t.ok(Number.isInteger(m.n) && m.n >= 1 && Number.isInteger(m.turns) && m.turns >= 1, `${M}: eggs n + turns`);
      }
      if (m.k === 'corrode') t.ok(Number.isInteger(m.n) && m.n >= 1, `${M}: corrode n`);
      if (m.k === 'jam') t.ok(isNum(m.v) && m.v >= 1, `${M}: jam turns`);
    }
    if (e.enrage != null) {
      t.ok(e.tier === 'elite' || e.tier === 'boss', `${W}: only elites and bosses have a phase two`);
      if (e.enrage) {
        t.ok(typeof e.enrage.name === 'string' && e.enrage.name.length > 2, `${W}: phase two name`);
        if (e.enrage.str != null) t.ok(isNum(e.enrage.str) && e.enrage.str >= 0, `${W}: phase two str`);
        const pat = e.enrage.pattern;
        if (pat) {
          t.ok(e.ai === 'cycle' && pat.every(i => Number.isInteger(i) && i >= 0 && i < e.moves.length), `${W}: phase two pattern valid`);
          pat.forEach((i, k) => { if (e.moves[i].k === 'charge') t.ok(e.moves[pat[(k + 1) % pat.length]].k !== 'charge', `${W}: phase two no charge after charge`); });
        }
      }
    }
  }
  t.ok(gulpers >= 5, `five or more enemies eat items [${gulpers}]`);
  for (const id of ['mimic', 'ironjaw', 'hoard', 'gloop', 'trashpanda']) t.ok(ENEMIES[id].moves.some(m => m.k === 'gulp'), `${id} eats items`);
  for (const k of ['fusebomb', 'broodegg']) t.ok(ITEMS[k] && ITEMS[k].rarity === 'junk' && ITEMS[k].exhaust, `${k}: monster junk, exhausts`);
  t.ok(DATA.AFFIXES && Object.keys(DATA.AFFIXES).length >= 6, '6+ affixes');
  for (const id in DATA.AFFIXES) {
    const a = DATA.AFFIXES[id];
    t.ok(a.id === id && a.name && a.icon && /^#[0-9a-f]{6}$/i.test(a.color) && a.text.length > 8, `affix ${id}: id, name, icon, colour, text`);
  }
  t.eq(typeof DATA.affixRoll, 'function', 'DATA.affixRoll');
  t.ok(!!STATUS.jam && STATUS.jam.kind === 'debuff', 'jam status is a debuff');
});

t.test('encounters', () => {
  for (const act of [1, 2, 3]) {
    const E = ENCOUNTERS[act];
    t.ok(E && E.normal.length >= 6 && E.elite.length >= 2 && E.boss.length >= 1, `act ${act}: 6 normal / 2 elite / 1 boss`);
    for (const tier of ['normal', 'elite', 'boss']) {
      for (const enc of E[tier]) {
        t.ok(Array.isArray(enc) && enc.length >= 1 && enc.length <= 3, `act ${act} ${tier}: 1..3 enemies`);
        for (const id of enc) {
          const e = ENEMIES[id];
          t.ok(!!e, `act ${act} ${tier}: ${id} exists`);
          if (!e) continue;
          t.eq(e.act, act, `act ${act} ${tier}: ${id} belongs to act`);
          t.ok(!e.minion, `act ${act} ${tier}: ${id} is not a minion`);
        }
        const tiers = enc.map(id => ENEMIES[id] && ENEMIES[id].tier);
        if (tier === 'normal') t.ok(tiers.every(x => x === 'normal'), `act ${act} normal: only normals`);
        else t.ok(tiers.includes(tier), `act ${act} ${tier}: contains a ${tier}`);
      }
    }
  }
});

// ---------------------------------------------------------------- relics
// A fight in the middle of things: a burning, poisoned, frozen foe, a dead
// poisoned one, Block up, a streak of 3 and a grab of two metal items.
function mockF() {
  return {
    turn: 3, target: 0, events: [], relics: [], bin: [{ uid: 'm1', id: 'rusty_sword' }, { uid: 'm2', id: 'pot_lid' }], used: [], streak: 3,
    grab: { insts: [], defs: [ITEMS.rusty_sword, ITEMS.dented_shield] },
    player: { hp: 20, maxHp: 70, block: 10, status: {}, grabs: 3, grabsMax: 3, grabsUsed: 1 },
    enemies: [{ uid: 'a', hp: 20, maxHp: 20, block: 0, status: { poison: 4, burn: 12, freeze: 1 }, alive: true },
      { uid: 'b', hp: 0, maxHp: 9, block: 0, status: { poison: 3 }, alive: false }],
  };
}
function runHooks(r, F) {
  const h = r.hooks || {};
  const def = ITEMS.rusty_sword, jd = ITEMS.rock;
  if (h.onFightStart) h.onFightStart(F);
  if (h.onTurnStart) h.onTurnStart(F);
  if (h.onPlay) {
    h.onPlay(F, { uid: 'x', id: 'rusty_sword' }, def);
    h.onPlay(F, { uid: 'y', id: 'rock', junk: true }, jd);
    h.onPlay(F, { uid: 'z', id: 'bubble_flask' }, ITEMS.bubble_flask);
    h.onPlay(F, { uid: 'w', id: 'prize_marble' }, ITEMS.prize_marble);
    h.onPlay(F, { uid: 'v', id: 'crystal_ball' }, ITEMS.crystal_ball);
    h.onPlay(F, { uid: 'u', id: 'crisp_apple' }, ITEMS.crisp_apple);
  }
  if (h.onGrab) { h.onGrab(F, 0); h.onGrab(F, 2); }
  if (h.onDmgDealt) h.onDmgDealt(F, F.enemies[0], 15);
  if (h.onKill) h.onKill(F, F.enemies[1]);
  if (h.onHurt) h.onHurt(F, 5);
  if (h.onStatus) {
    h.onStatus(F, F.enemies[0], 'burn', 3);
    h.onStatus(F, F.enemies[0], 'freeze', 1);
    h.onStatus(F, F.player, 'str', 2);
  }
  if (h.onBlock) h.onBlock(F, 6);
  if (h.onHeal) h.onHeal(F, 4);
  if (h.onJunk) h.onJunk(F, 2, []);
  if (h.onCombo) h.onCombo(F, DATA.COMBOS.magnetized, [ITEMS.rusty_sword, ITEMS.dented_shield, ITEMS.pot_lid]);
  if (h.onJackpot) h.onJackpot(F, 3);
  if (h.onShatter) h.onShatter(F, { uid: 'g', id: 'empty_bottle' }, ITEMS.empty_bottle);
  if (h.onGold) h.onGold(F, 5);
  if (h.onCashOut) h.onCashOut(F, 6, 2);
  if (h.onEat) h.onEat(F, F.enemies[0], { uid: 'p', id: 'poison_pill' }, ITEMS.poison_pill);
  if (h.onMaterial) for (const k of ['crack', 'shatter', 'fuse', 'blast']) h.onMaterial(F, k, { uid: 'q', id: 'firecracker' }, ITEMS.firecracker);
  if (h.onPet) h.onPet(F, 'cat');
  if (h.onTurnEnd) h.onTurnEnd(F);
}

t.test('relics', () => {
  const ids = Object.keys(RELICS);
  t.ok(ids.length >= 28, `>= 28 relics [${ids.length}]`);
  for (const id of ids) {
    const r = RELICS[id], W = `relic ${id}`;
    t.eq(r.id, id, `${W}: key`);
    t.ok(typeof r.name === 'string' && r.name, `${W}: name`);
    t.ok(typeof r.icon === 'string' && Array.from(r.icon).length >= 1 && Array.from(r.icon).length <= 2, `${W}: icon`);
    t.ok(['c', 'u', 'r', 'boss', 'event'].includes(r.rarity), `${W}: rarity`);
    t.ok(typeof r.text === 'string' && r.text.length > 8, `${W}: text`);
    t.ok(!!(r.mods || r.hooks || r.rules), `${W}: has mods, hooks or rules`);
    t.ok(Array.isArray(r.kw) && r.kw.every(k => ARCHS.includes(k)), `${W}: kw lists archetypes`);
    if (r.proc != null) t.ok(typeof r.proc === 'string' && r.proc.length >= 2 && r.proc.length <= 16 && r.proc === r.proc.toUpperCase(), `${W}: proc label short and loud [${r.proc}]`);
    if (r.rules) for (const k in r.rules) {
      t.ok(RULES.includes(k), `${W}: rule ${k} allowed`);
      const v = r.rules[k];
      t.ok(isNum(v) ? v > 0 : (v && typeof v === 'object' && Object.keys(v).every(tg => TAGS.includes(tg) && isNum(v[tg]))), `${W}: rule ${k} value`);
    }
    if (r.mods) for (const k in r.mods) {
      t.ok(MODS.includes(k), `${W}: mod ${k} allowed`);
      t.ok(isNum(r.mods[k]) && r.mods[k] !== 0, `${W}: mod ${k} numeric`);
    }
    if (r.hooks) for (const k in r.hooks) {
      t.ok(HOOKS.includes(k), `${W}: hook ${k} allowed`);
      t.ok(typeof r.hooks[k] === 'function', `${W}: hook ${k} is a function`);
    }
    // Without COMBAT loaded every hook must be a harmless no-op.
    const F = mockF(), before = JSON.stringify(F);
    let threw = null;
    try { runHooks(r, F); } catch (e) { threw = e; }
    t.ok(!threw, `${W}: hooks survive without COMBAT ${threw || ''}`);
    t.eq(JSON.stringify({ ...F, rs: undefined }), JSON.stringify({ ...JSON.parse(before), rs: undefined }), `${W}: no mutation without COMBAT`);
  }
  // With a recording COMBAT stub the hooks go through its helpers.
  const calls = [];
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', src, v]); return v; },
    status: (F, who, s, v) => { calls.push(['status', s, v]); return v; },
    heal: (F, who, v) => { calls.push(['heal', v]); return v; },
    addJunk: (F, id, n) => { calls.push(['addJunk', id, n]); return []; },
    addTemp: (F, id, n) => { calls.push(['addTemp', id, n]); return []; },
    copy: (F, tag) => { calls.push(['copy', tag]); return null; },
    gainGold: (F, v) => { calls.push(['gainGold', v]); return v; },
    tickets: (F, v) => { calls.push(['tickets', v]); return v; },
    gainMaxHp: (F, v) => { calls.push(['gainMaxHp', v]); return v; },
    gold: () => 150,
    emit: (F, ev) => { calls.push(['emit', ev.t]); return ev; },
    removeJunk: () => [], stealItem: () => null, freezeItem: () => null,
  };
  try {
    let hookRelics = 0;
    for (const id of ids) {
      if (!RELICS[id].hooks) continue;
      hookRelics++;
      calls.length = 0;
      const F = mockF(), g0 = F.player.grabs;
      let threw = null;
      try { runHooks(RELICS[id], F); } catch (e) { threw = e; }
      t.ok(!threw, `relic ${id}: hooks run with COMBAT ${threw || ''}`);
      t.ok(calls.length > 0 || F.player.grabs !== g0, `relic ${id}: hooks do something through COMBAT`);
      t.ok(calls.every(c => c[0] !== 'damage' || c[1] === null), `relic ${id}: relic damage has no attacker`);
      t.ok(calls.every(c => c[0] !== 'status' || STATUS[c[1]]), `relic ${id}: statuses exist`);
      t.ok(calls.every(c => c[0] !== 'addJunk' || (ITEMS[c[1]] && ITEMS[c[1]].rarity === 'junk')), `relic ${id}: junk ids exist`);
      t.ok(calls.every(c => c[0] !== 'addTemp' || (ITEMS[c[1]] && ITEMS[c[1]].rarity !== 'junk')), `relic ${id}: temp ids exist`);
      t.ok(calls.every(c => c[0] !== 'emit' || c[1] === 'proc' || c[1] === 'grab'), `relic ${id}: emits only proc / grab events`);
    }
    t.ok(hookRelics >= 14, `plenty of hook relics [${hookRelics}]`);
    // once-per-fight memory really is once per fight
    const F = mockF();
    calls.length = 0;
    RELICS.second_wind.hooks.onHurt(F); RELICS.second_wind.hooks.onHurt(F);
    t.eq(calls.length, 1, 'second wind fires once per fight');
  } finally { delete globalThis.COMBAT; }
  for (const r of ['c', 'u', 'r', 'boss']) t.ok(DATA.relicPool(r).length >= 3, `relic pool ${r} has >= 3`);
  t.ok(DATA.relicPool().every(id => RELICS[id].rarity !== 'event' && !RELICS[id].starter), 'relic pool skips event/starter');
  t.ok(!DATA.relicPool('c', ['grip_tape']).includes('grip_tape'), 'relic pool exclude');
});

// ---------------------------------------------------------------- events
t.test('events', () => {
  const ids = Object.keys(EVENTS);
  t.ok(ids.length >= 14, `>= 14 events [${ids.length}]`);
  let conds = 0;
  const runs = [
    { gold: 0, hp: 5, maxHp: 30, act: 1, claw: { grabs: 3, ups: {} }, relics: [], bin: [] },
    { gold: 999, hp: 70, maxHp: 80, act: 3, claw: { grabs: 3, ups: { grip: 3, magnet: 1, rubber: 1, width: 3, speed: 2 } }, relics: [], bin: [] },
    {},
  ];
  for (const id of ids) {
    const e = EVENTS[id], W = `event ${id}`;
    t.eq(e.id, id, `${W}: key`);
    t.ok(typeof e.title === 'string' && e.title && typeof e.text === 'string' && e.text.length > 10, `${W}: title/text`);
    if (e.art != null) t.ok(ITEM_ART.includes(e.art) || ENEMY_ART.includes(e.art), `${W}: art key`);
    t.ok(Array.isArray(e.choices) && e.choices.length >= 2, `${W}: >= 2 choices`);
    t.ok(e.choices.some(c => !c.cond), `${W}: at least one choice is always available`);
    for (const c of e.choices) {
      const C = `${W} "${c.txt}"`;
      t.ok(typeof c.txt === 'string' && c.txt, `${C}: txt`);
      if (c.sub != null) t.ok(typeof c.sub === 'string', `${C}: sub`);
      t.ok(Array.isArray(c.fx), `${C}: fx array`);
      if (c.cond) {
        conds++;
        t.ok(typeof c.cond === 'function', `${C}: cond is a function`);
        for (const r of runs) t.ok(typeof c.cond(r) === 'boolean', `${C}: cond returns boolean`);
      }
      for (const f of c.fx) {
        t.ok(EVENT_FX.includes(f.k), `${C}: fx ${f.k} allowed`);
        if (['hp', 'maxhp', 'gold', 'ink'].includes(f.k)) t.ok(isNum(f.v) && f.v !== 0, `${C}: ${f.k} v`);
        if (f.k === 'brush') t.ok(!!BRUSHES[f.id], `${C}: brush ${f.id} exists`);
        if (f.k === 'item') t.ok(f.id === 'random' || f.id === 'rare' || (!!ITEMS[f.id] && ITEMS[f.id].rarity !== 'junk'), `${C}: item ${f.id}`);
        if (f.k === 'relic') t.ok(f.id === 'random' || !!RELICS[f.id], `${C}: relic ${f.id}`);
        if (f.k === 'claw') t.ok(!!CLAW_UPGRADES[f.u], `${C}: claw ${f.u}`);
        if (f.k === 'fight') {
          t.ok(Array.isArray(f.enc) && f.enc.length >= 1 && f.enc.length <= 3 && f.enc.every(x => ENEMIES[x]), `${C}: fight enc`);
          if (f.elite != null) t.ok(typeof f.elite === 'boolean', `${C}: elite flag`);
        }
        if (f.k === 'junk') t.ok(!!ITEMS[f.id] && ITEMS[f.id].rarity === 'junk' && f.n >= 1, `${C}: junk`);
      }
    }
  }
  t.ok(conds >= 5, `several conditional choices [${conds}]`);
  // Claw upgrades come from bosses and towers only, never from events.
  for (const id of ids) for (const c of EVENTS[id].choices) t.ok(!c.fx.some(f => f && f.k === 'claw'), `event ${id}: "${c.txt}" grants no claw upgrade`);
  t.ok(DATA.ECONOMY.trickle === 2 && DATA.ECONOMY.binFloor === 6, 'bin trickle 2, floor 6');
  // gold costs are gated by a gold condition
  for (const id of ids) for (const c of EVENTS[id].choices) {
    const cost = c.fx.find(f => f.k === 'gold' && f.v < 0);
    if (cost) t.ok(!!c.cond && c.cond({ gold: 0, claw: {}, maxHp: 70, hp: 70 }) === false, `event ${id}: gold cost is gated`);
  }
});

// ----------------------------------------------------------- claw upgrades
t.test('claw upgrades', () => {
  const need = { grabs: 2, width: 3, grip: 3, speed: 2, prongs: 1, rubber: 1, magnet: 1 };
  for (const id in need) {
    const u = CLAW_UPGRADES[id], W = `upgrade ${id}`;
    t.ok(!!u, `${W} exists`);
    if (!u) continue;
    t.eq(u.id, id, `${W}: key`);
    t.eq(u.max, need[id], `${W}: max`);
    t.ok(isNum(u.cost) && u.cost >= 50 && u.cost <= 160, `${W}: cost 50..160`);
    t.ok(typeof u.name === 'string' && typeof u.icon === 'string' && typeof u.text === 'string', `${W}: labels`);
    const claw = { grabs: 3, width: 1, grip: 1, speed: 1, prongs: 2, rubber: 0, magnet: 0 };
    for (let i = 0; i < u.max; i++) t.ok(u.apply(claw) === true, `${W}: apply #${i + 1} succeeds`);
    const snap = JSON.stringify(claw);
    t.ok(u.apply(claw) === false, `${W}: refused past max`);
    t.eq(JSON.stringify(claw), snap, `${W}: no change past max`);
    const exp = { grabs: ['grabs', 5], width: ['width', 1.54], grip: ['grip', 2.05], speed: ['speed', 1.6], prongs: ['prongs', 3], rubber: ['rubber', 1], magnet: ['magnet', 1] }[id];
    t.near(claw[exp[0]], exp[1], 1e-9, `${W}: final ${exp[0]}`);
  }
  t.eq(Object.keys(CLAW_UPGRADES).length, 7, 'exactly the 7 upgrades');
});

// ------------------------------------------------------------------ tools
// The map's light: TOOLS (flare, lantern, kite) with BRUSHES as an alias,
// TERMS for the player-facing words, and no copy that still says ink.
t.test('tools, terms and the light copy', () => {
  const { TOOLS, TERMS } = DATA;
  t.ok(TOOLS && BRUSHES === TOOLS, 'DATA.BRUSHES aliases DATA.TOOLS');
  t.eq(Object.keys(TOOLS).join(), 'flare,lantern,kite', 'three tools: flare, lantern, kite');
  const kinds = { flare: 'line', lantern: 'ring', kite: 'patch' };
  for (const id in kinds) {
    const b = TOOLS[id];
    t.ok(!!b && b.id === id && typeof b.name === 'string' && typeof b.icon === 'string' && typeof b.text === 'string' && b.text.length > 20, `tool ${id} labels`);
    t.eq(b.kind, kinds[id], `tool ${id} kind`);
    t.ok(!('cells' in b), `tool ${id} has no brush footprint (MAP does the geometry)`);
  }
  t.ok(TERMS && TERMS.ink === 'bulb' && TERMS.inkPlural === 'bulbs' && TERMS.brush === 'tool' && TERMS.brushPlural === 'tools', 'TERMS: bulb / bulbs / tool / tools');
  t.ok(DATA.ECONOMY.towerInk === 2 && DATA.ECONOMY.eliteToolChance > 0 && DATA.ECONOMY.eliteToolChance < 1, 'economy: towers leave 2 bulbs, elites sometimes a tool');
  t.ok(DATA.ECONOMY.startInk === 10 && DATA.ECONOMY.inkTile === 2, 'economy keys keep their spelling: startInk is the bulbs per act');
  // No copy says ink (a word starting with ink: Ink, inks, inkwell...; drink, pink and blink are fine).
  const bad = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (/\bink/i.test(v) && !/^[a-z_]+$/.test(v)) bad.push(path + ': ' + v); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const k in v) if (k !== 'id' && k !== 'k' && k !== 'art') walk(v[k], path + '.' + k);
  };
  for (const k of ['ITEMS', 'STATUS', 'ENEMIES', 'RELICS', 'EVENTS', 'CLAW_UPGRADES', 'TOOLS', 'CHARACTERS', 'ACTS', 'TERMS']) walk(DATA[k], k);
  t.eq(bad.length, 0, 'no DATA copy says ink: ' + bad.join(' | '));
  t.ok(RELICS.inkwell && /Bulb/.test(RELICS.inkwell.name) && /Bulbs/.test(RELICS.inkwell.text), 'the inkwell relic (id kept) reads as bulbs');
  t.ok(ITEMS.map_scrap && /Bulbs/.test(ITEMS.map_scrap.text), 'Map Scrap gives Bulbs');
  const evTools = [];
  for (const id in EVENTS) for (const c of EVENTS[id].choices) for (const f of c.fx) if (f.k === 'brush') evTools.push(f.id);
  t.ok(evTools.length >= 3 && evTools.every(id => TOOLS[id]), 'events hand out real tools (' + evTools.join(',') + ')');
  t.ok(evTools.includes('flare') && evTools.includes('lantern') && evTools.includes('kite'), 'every tool can come from an event');
});

// ------------------------------------------------------------- characters
t.test('characters', () => {
  t.eq(Object.keys(CHARACTERS).sort().join(), 'alchemist,gambler,knight,rogue', 'four characters');
  const hp = { knight: 80, alchemist: 60, rogue: 65, gambler: 70 };
  for (const id in CHARACTERS) {
    const c = CHARACTERS[id], W = `char ${id}`;
    t.eq(c.id, id, `${W}: key`);
    for (const k of ['name', 'title', 'blurb']) t.ok(typeof c[k] === 'string' && c[k], `${W}: ${k}`);
    t.eq(c.hp, hp[id], `${W}: hp`);
    t.ok(isNum(c.gold) && c.gold >= 0, `${W}: gold`);
    t.ok(Array.isArray(c.bin) && c.bin.length >= 16 && c.bin.length <= 22, `${W}: bin 16..22 [${c.bin.length}]`);
    t.ok(c.bin.every(i => ITEMS[i] && ITEMS[i].rarity !== 'junk' && !ITEMS[i].bag), `${W}: bin items exist, no junk, no bags`);
    // 5-6 small fillers on top; the big items keep the character identity.
    const small = c.bin.filter(i => isSmall(ITEMS[i])), big = c.bin.filter(i => !isSmall(ITEMS[i]));
    t.ok(small.length >= 5 && small.length <= 6, `${W}: 5..6 small fillers [${small.length}]`);
    t.ok(big.length >= 12 && big.length <= 14, `${W}: 12..14 big items [${big.length}]`);
    t.ok(big.filter(i => ITEMS[i].char === id).length >= 10, `${W}: big items are mostly its own`);
    t.ok(c.bin.every(i => !ITEMS[i].char || ITEMS[i].char === id), `${W}: no other character's items`);
    t.ok(!!RELICS[c.relic], `${W}: starting relic exists`);
    t.ok(['start', 'act2', 'win'].includes(c.unlock), `${W}: unlock rule`);
    t.ok(isHex(c.color), `${W}: color`);
    const cl = c.claw;
    for (const k of ['grabs', 'width', 'grip', 'speed', 'prongs', 'rubber', 'magnet']) t.ok(isNum(cl[k]), `${W}: claw.${k}`);
    t.ok([2, 3].includes(cl.prongs), `${W}: prongs`);
    t.ok(cl.grip >= 0.6 && cl.grip <= 2 && cl.width > 0.5 && cl.width < 1.6, `${W}: claw in physics range`);
    const dmgers = c.bin.filter(i => ITEMS[i].fx.some(f => ['dmg', 'random', 'dmgPer', 'lifesteal'].includes(f.k) || (f.k === 'status' && f.s === 'poison')));
    const blockers = c.bin.filter(i => ITEMS[i].fx.some(f => f.k === 'block'));
    t.ok(dmgers.length >= 5 && blockers.length >= 4, `${W}: starting bin can attack and defend`);
  }
  t.eq(CHARACTERS.alchemist.claw.grabs, 4, 'alchemist has 4 grabs');
  t.ok(CHARACTERS.alchemist.claw.width < 1, 'alchemist has a small claw');
  t.ok(CHARACTERS.rogue.claw.speed > CHARACTERS.knight.claw.speed, 'rogue claw is fast');
  t.ok(CHARACTERS.rogue.gold > CHARACTERS.knight.gold, 'rogue starts richer');
  t.eq(Object.values(CHARACTERS).filter(c => c.unlock === 'start').length, 1, 'one starter character');
  // Filler flavour per character.
  const has = (ch, ids) => ids.every(x => CHARACTERS[ch].bin.includes(x));
  t.ok(has('knight', ['prize_marble', 'glass_bead']), 'knight: marbles and beads');
  t.ok(has('alchemist', ['sour_drop', 'peppermint', 'frost_pearl']), 'alchemist: sour drops, peppermints, frost pearls');
  t.ok(has('rogue', ['lucky_penny', 'lead_shot']), 'rogue: lucky pennies and lead shot');
});

t.test('acts', () => {
  for (const a of [1, 2, 3]) {
    const A = ACTS[a];
    t.ok(A && typeof A.name === 'string' && typeof A.sub === 'string', `act ${a} labels`);
    t.ok(A && isHex(A.palette.bg) && isHex(A.palette.wall) && isHex(A.palette.accent), `act ${a} palette`);
    t.ok(A && A.floors >= 1, `act ${a} floors`);
  }
});

// ---------------------------------------------------------------- pools
t.test('pool and rarity', () => {
  const c = DATA.pool('c');
  t.ok(c.length > 0 && c.every(id => ITEMS[id].rarity === 'c'), 'pool(c) only commons');
  t.ok(c.every(id => !ITEMS[id].starter), 'pool skips starters');
  t.ok(DATA.pool().every(id => ITEMS[id].rarity !== 'junk'), 'pool skips junk');
  t.eq(DATA.pool('junk').sort().join(), 'broodegg,fusebomb,hoardcoin,iceblock,rock,slag', 'pool(junk)');
  const k = DATA.pool(null, 'knight');
  t.ok(k.every(id => !ITEMS[id].char || ITEMS[id].char === 'knight'), 'pool(char) excludes other characters');
  t.ok(k.some(id => ITEMS[id].char === 'knight') && k.some(id => !ITEMS[id].char), 'pool(char) has own + shared');
  const g = DATA.pool(null, null, ['glass']);
  t.ok(g.length > 0 && g.every(id => ITEMS[id].tags.includes('glass')), 'pool(tags)');
  for (const r of ['c', 'u', 'r', 'l']) for (const ch of ['knight', 'alchemist', 'rogue'])
    t.ok(DATA.pool(r, ch).length >= (r === 'l' ? 2 : 3), `pool ${r}/${ch} has choices`);

  const rng = U.rng(42), cnt = { c: 0, u: 0, r: 0, l: 0 };
  for (let i = 0; i < 20000; i++) cnt[DATA.rollRarity(rng, DATA.RARITY_WEIGHTS[2])]++;
  t.near(cnt.c / 20000, 0.55, 0.02, 'rollRarity act2 commons');
  t.near(cnt.u / 20000, 0.33, 0.02, 'rollRarity act2 uncommons');
  t.near(cnt.r / 20000, 0.11, 0.015, 'rollRarity act2 rares');
  t.near(cnt.l / 20000, 0.01, 0.005, 'rollRarity act2 legendaries');
  const a = U.rng(7), b = U.rng(7);
  t.ok(Array.from({ length: 50 }, () => DATA.rollRarity(a)).join() === Array.from({ length: 50 }, () => DATA.rollRarity(b)).join(), 'rollRarity deterministic');
  const z = U.rng(3);
  t.ok(Array.from({ length: 2000 }, () => DATA.rollRarity(z, 1)).every(x => x !== 'l'), 'no legendary in act 1 weights');
});

t.test('rewardItems', () => {
  const W = { 1: { c: 0.70, u: 0.25, r: 0.05, l: 0 }, 2: { c: 0.55, u: 0.33, r: 0.11, l: 0.01 }, 3: { c: 0.40, u: 0.38, r: 0.18, l: 0.04 } };
  for (const ch of ['knight', 'alchemist', 'rogue']) {
    for (let seed = 1; seed <= 200; seed++) {
      const r1 = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), ch);
      const r2 = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), ch);
      if (r1.length !== 3 || new Set(r1).size !== 3) { t.ok(false, `${ch} seed ${seed}: 3 unique ids [${r1}]`); break; }
      if (r1.join() !== r2.join()) { t.ok(false, `${ch} seed ${seed}: deterministic`); break; }
      if (!r1.every(id => ITEMS[id] && ITEMS[id].rarity !== 'junk' && !ITEMS[id].starter && (!ITEMS[id].char || ITEMS[id].char === ch))) {
        t.ok(false, `${ch} seed ${seed}: valid ids [${r1}]`); break;
      }
    }
    t.ok(true, `${ch}: 200 seeds of rewards are unique, valid, deterministic`);
  }
  t.eq(DATA.rewardItems(U.rng(9), 2, 'rogue', 5).length, 5, 'n=5');
  // Bags: about 30% of 3-slot screens, at most one, never on a 1-slot draw,
  // and no single small filler is ever offered on its own.
  for (const act of [1, 2, 3]) {
    let bags = 0, loose = 0, multi = 0;
    const rng = U.rng(500 + act);
    for (let i = 0; i < 3000; i++) {
      const r = DATA.rewardItems(rng, act, ['knight', 'alchemist', 'rogue'][i % 3], 3);
      const b = r.filter(id => ITEMS[id].bag).length;
      if (b) bags++;
      if (b > 1) multi++;
      if (r.some(id => isSmall(ITEMS[id]))) loose++;
    }
    const share = bags / 3000;
    t.ok(share >= 0.2 && share <= 0.38, `act ${act}: a bag on ${Math.round(100 * share)}% of reward screens (20..38%)`);
    t.eq(multi, 0, `act ${act}: never two bags on one screen`);
    t.eq(loose, 0, `act ${act}: no loose small filler offered`);
  }
  const one = U.rng(77);
  t.ok(Array.from({ length: 500 }, () => DATA.rewardItems(one, 1, 'knight', 1)[0]).every(id => !ITEMS[id].bag), 'a 1-slot draw is never a bag');
  const shop = U.rng(78);
  t.ok(Array.from({ length: 300 }, () => DATA.rewardItems(shop, 1, 'rogue', 5)).some(r => r.some(id => ITEMS[id].bag)), 'shops (5 slots) can stock a bag');
  t.eq(new Set(DATA.rewardItems(U.rng(9), 2, 'rogue', 12)).size, 12, 'n=12 still unique');
  t.ok(DATA.rewardItems(U.rng(1), 1, undefined).length === 3, 'no character works');
  const seen = new Set();
  for (let s = 1; s <= 30; s++) seen.add(DATA.rewardItems(U.rng(s), 2, 'knight').join());
  t.ok(seen.size >= 25, 'different seeds give different rewards');
  for (const act of [1, 2, 3]) {
    const cnt = { c: 0, u: 0, r: 0, l: 0 };
    let own = 0, tot = 0;
    const rng = U.rng(1000 + act);
    for (let i = 0; i < 4000; i++) {
      const id = DATA.rewardItems(rng, act, 'alchemist', 1)[0];
      cnt[ITEMS[id].rarity]++; tot++;
      if (ITEMS[id].char === 'alchemist') own++;
    }
    for (const r of ['c', 'u', 'r', 'l']) t.near(cnt[r] / tot, W[act][r], 0.03, `act ${act} reward rarity ${r}`);
    t.near(own / tot, 0.4, 0.05, `act ${act}: ~40% from the character pool`);
  }
});

// ------------------------------------------------------------- builds
// DESIGN.md "Builds and synergies": archetype chips, grab combos, the build
// pull and old saves.
// Every item id a save from before the build pass can hold.
const OLD_ITEM_IDS = 'rusty_sword dented_shield spiked_buckler iron_chain heater_shield longsword tower_shield whetstone battle_axe war_hammer war_horn family_anvil toxic_vial bubble_flask cherry_bomb stink_potion alembic liquid_fire frost_phial acid_bottle volatile_egg elixir plague_orb philosophers_stone shiv old_boot lucky_coin serrated_knife smoke_bomb twin_daggers skeleton_key loaded_dice stolen_gem thieves_ring harlequin_mask wishing_star crisp_apple stale_bread torch snowball femur empty_bottle tickle_feather icicle rattle_mallet pot_lid map_scrap rulebook grudge_skull leech_wand rubble_bomb spooky_lantern crystal_ball golden_egg spare_heart dragon_egg prize_marble glass_bead peppermint ember_pebble frost_pearl lead_shot lucky_penny sour_drop bouncy_ball pocket_die quail_egg bag_marbles bag_beads bag_sweets rock slag iceblock'.split(' ');
const cards = () => Object.keys(ITEMS).filter(id => ITEMS[id].rarity !== 'junk' && !ITEMS[id].bag);
const poolRelics = () => Object.keys(RELICS).filter(id => !RELICS[id].starter && RELICS[id].rarity !== 'event');
const kwOf = (d) => DATA.kwIds(d);

t.test('archetypes and keywords', () => {
  const A = DATA.ARCHETYPES;
  t.eq(Object.keys(A).sort().join(), ARCHS.slice().sort().join(), '14 archetypes');
  for (const k of ARCHS) {
    const a = A[k];
    t.ok(a && typeof a.label === 'string' && a.label.length >= 3 && a.label.length <= 10, `${k}: label`);
    t.ok(a && typeof a.icon === 'string' && Array.from(a.icon).length >= 1 && Array.from(a.icon).length <= 2, `${k}: icon`);
    t.ok(a && isHex(a.color), `${k}: color`);
    t.ok(a && typeof a.blurb === 'string' && a.blurb.length > 15, `${k}: blurb`);
    const items = cards().filter(id => kwOf(ITEMS[id]).includes(k));
    const relics = poolRelics().filter(id => kwOf(RELICS[id]).includes(k));
    t.ok(items.length >= 4, `${k}: >= 4 items [${items.length}: ${items.join(' ')}]`);
    t.ok(relics.length >= 3, `${k}: >= 3 pool relics [${relics.length}: ${relics.join(' ')}]`);
    const payoff = items.filter(id => ['r', 'l'].includes(ITEMS[id].rarity)).concat(relics.filter(id => RELICS[id].rarity === 'r'));
    t.ok(payoff.length >= 1, `${k}: a rare or legendary payoff [${payoff.join(' ')}]`);
  }
  // chips: shape, cap, order
  for (const id of Object.keys(ITEMS).concat(Object.keys(RELICS))) {
    const def = ITEMS[id] || RELICS[id];
    const chips = DATA.keywords(def);
    t.ok(Array.isArray(chips) && chips.length <= 3, `${id}: at most 3 chips`);
    t.ok(chips.every(c => A[c.id] && c.label === A[c.id].label && c.icon === A[c.id].icon && c.color === A[c.id].color), `${id}: chips are archetypes`);
    t.eq(DATA.keywords(def, Infinity).length, kwOf(def).length, `${id}: uncapped chips = kwIds`);
  }
  t.eq(DATA.keywords(null).length, 0, 'null safe');
  const has = (id, ks) => ks.every(k => kwOf(ITEMS[id]).includes(k));
  t.ok(has('plague_orb', ['poison', 'glass', 'echo']), 'plague orb: poison, glass, echo');
  t.ok(has('ghost_pepper', ['burn', 'feast']), 'ghost pepper bridges pyro and feast');
  t.ok(has('frozen_heart', ['frost', 'fortress']), 'frozen heart bridges frost and fortress');
  t.ok(has('glass_shield', ['glass', 'fortress']), 'glass shield bridges glass and fortress');
  t.ok(has('twin_daggers', ['brawler']) && has('whetstone', ['brawler']), 'multi-hit and Strength are brawler');
  t.ok(has('prize_marble', ['swarm']) && has('bag_marbles', ['swarm']), 'fillers and bags are swarm');
  t.ok(has('bribe', ['greed']) && has('golden_idol', ['greed']), 'pay and per gold are greed');
  t.ok(has('deja_vu', ['echo']) && has('arcane_tome', ['echo']), 'again and copy are echo');
  t.ok(!kwOf(ITEMS.slag).includes('burn'), 'self burn is not pyro');
  // every build relic says what build it belongs to
  const RULED_OR_NEW = Object.keys(RELICS).filter(id => RELICS[id].rules || Object.keys(RELICS[id].hooks || {}).some(h => !['onFightStart', 'onTurnStart', 'onTurnEnd', 'onPlay', 'onGrab', 'onDmgDealt', 'onKill', 'onHurt'].includes(h)));
  t.ok(RULED_OR_NEW.length >= 12, `plenty of relics on the new hooks and rules [${RULED_OR_NEW.length}]`);
  for (const id of RULED_OR_NEW) t.ok(RELICS[id].kw.length >= 1, `${id}: build relic has an archetype`);
  for (const id of Object.keys(RELICS).filter(id => RELICS[id].rules)) t.eq(RELICS[id].rarity, 'r', `${id}: rule benders are rare`);
  t.ok(DATA.RELIC_RULES.join() === RULES.join() && DATA.RELIC_HOOKS.join() === HOOKS.join(), 'DATA lists the hooks and rules');
});

t.test('new content sits in the pools', () => {
  const OLD_RELICS = 'squire_gauntlet bubbling_satchel pickpocket_glove grip_tape oiled_rails golden_ticket inkwell heart_locket kettle_helm consolation_prize sore_loser blood_bag hot_coffee wide_palm rubber_thimbles protein_bar jackpot_bell thorn_mail venom_gland flint_striker snow_globe trophy_rack egg_timer grudge_journal recycling_bin potion_belt fridge_magnet cracked_hourglass big_knuckles four_leaf_clover vampire_dentures second_wind token_stack third_hand golden_crane cursed_quarter friendship_bracelet cursed_plush'.split(' ');
  const fresh = Object.keys(RELICS).filter(id => !OLD_RELICS.includes(id) && !R3_RELICS.includes(id) && !R6_RELICS.includes(id));
  t.ok(fresh.length >= 20 && fresh.length <= 32, `20..32 new relics [${fresh.length}]`);
  for (const id of fresh) {
    const r = RELICS[id];
    t.ok(!r.starter && ['c', 'u', 'r'].includes(r.rarity), `${id}: a c/u/r pool relic`);
    t.ok(DATA.relicPool(r.rarity).includes(id), `${id}: in relicPool('${r.rarity}')`);
  }
  const OLD_ITEMS = OLD_ITEM_IDS;
  const newItems = Object.keys(ITEMS).filter(id => !OLD_ITEMS.includes(id) && id !== 'hoardcoin' && !R3_ITEMS.includes(id));   // the Hoard's coins are boss junk, not a build piece
  t.ok(newItems.length >= 20 && newItems.length <= 32, `20..32 new items [${newItems.length}]`);
  const pooled = new Set(DATA.pool());
  for (const id of newItems) {
    const d = ITEMS[id];
    if (d.bag || d.tags.includes('small') || d.rarity === 'junk') continue;
    t.ok(pooled.has(id), `${id}: in the reward pool`);
    t.ok(!d.starter, `${id}: not a starter`);
  }
  t.ok(newItems.filter(id => !ITEMS[id].char).length >= 15, 'most new items are shared');
  for (const ch of ['knight', 'alchemist', 'rogue']) t.ok(newItems.some(id => ITEMS[id].char === ch), `${ch} gets new pieces`);
});

t.test('grab combos', () => {
  const C = DATA.COMBOS;
  const ids = Object.keys(C);
  t.ok(ids.length >= 20, `>= 20 combos [${ids.length}]`);
  const tiers = [1, 2, 3].map(n => ids.filter(id => C[id].tier === n).length);
  t.ok(tiers[0] >= 8 && tiers[1] >= 4 && tiers[2] >= 3, `tiers 1/2/3: ${tiers.join('/')}`);
  const names = new Set();
  const defs = (list) => list.map(id => ITEMS[id]);
  for (const id of ids) {
    const c = C[id], W = `combo ${id}`;
    t.eq(c.id, id, `${W}: key`);
    t.ok(typeof c.name === 'string' && c.name.length > 3 && !names.has(c.name), `${W}: unique name`);
    names.add(c.name);
    t.ok(typeof c.text === 'string' && c.text.length > 10 && c.text.length <= 100, `${W}: one-line text`);
    t.ok(isHex(c.color), `${W}: color`);
    t.ok([1, 2, 3].includes(c.tier), `${W}: tier`);
    t.ok(typeof c.family === 'string' && c.family, `${W}: family`);
    t.ok(['enemy', 'all', 'self', 'random', 'none'].includes(c.target), `${W}: target`);
    t.ok(c.once == null || c.once === 'turn', `${W}: once`);
    t.ok(!c.sup || c.sup.every(x => C[x]), `${W}: sup ids exist`);
    t.ok(typeof c.match === 'function', `${W}: match`);
    checkFx(c.fx, W);
    t.ok(c.fx.length >= 1, `${W}: has effects`);
    if (c.fx.some(f => f.k === 'grab')) t.eq(c.once, 'turn', `${W}: a grab-giving combo fires once a turn`);
    t.ok(Array.isArray(c.example) && c.example.length >= 2 && c.example.every(x => ITEMS[x]), `${W}: example items exist`);
    t.ok(Array.isArray(c.miss) && c.miss.every(x => ITEMS[x]), `${W}: miss items exist`);
    // c.ctx: the grab state a state-reading recipe needs (Lucky Seven's Luck)
    t.ok(c.match(defs(c.example), c.ctx), `${W}: matches its example`);
    t.ok(!c.match(defs(c.miss), c.ctx), `${W}: does not match its near miss`);
    t.ok(DATA.combosFor(defs(c.example), c.ctx).some(x => x.id === id), `${W}: fires on its example (${c.example.join('+')})`);
    t.ok(!DATA.combosFor(defs(c.miss), c.ctx).some(x => x.id === id), `${W}: stays quiet on its near miss (${c.miss.join('+')})`);
    t.ok(!c.match([defs(c.example)[0]], c.ctx), `${W}: never on a single item`);
    t.ok(c.secret == null || (c.secret === true && c.tier === 3), `${W}: only tier 3 recipes are secret`);
  }
  // selection rules
  const fire = (list) => DATA.combosFor(defs(list)).map(c => c.id);
  t.eq(fire(['rusty_sword']).length, 0, 'one item fires nothing');
  t.eq(DATA.combosFor([]).length, 0, 'empty grab fires nothing');
  t.eq(DATA.combosFor(null).length, 0, 'null safe');
  const three = fire(['rusty_sword', 'femur', 'shiv']);
  t.ok(three.includes('armory') && !three.includes('crossed_blades'), `a family keeps its biggest tier [${three}]`);
  const storm = fire(['torch', 'snowball', 'stink_potion']);
  t.ok(storm.includes('elemental_storm') && !storm.some(x => ['steam_burst', 'toxic_fumes', 'frostbite'].includes(x)), `the storm replaces the pairs [${storm}]`);
  t.ok(storm.indexOf('elemental_storm') === 0, 'biggest tier first');
  const big = fire(['rusty_sword', 'rusty_sword', 'rusty_sword', 'longsword', 'femur']);
  t.ok(big.length <= DATA.COMBO_MAX && DATA.COMBO_MAX === 3, `at most ${DATA.COMBO_MAX} combos a grab [${big}]`);
  t.eq(fire(['rusty_sword', 'femur']).join(), fire(['femur', 'rusty_sword']).join(), 'order of delivery does not matter');
  t.eq(JSON.stringify(fire(['torch', 'snowball'])), JSON.stringify(fire(['torch', 'snowball'])), 'pure: same input, same combos');
  const roles = fire(['liquid_fire', 'femur']);
  t.ok(!roles.includes('molotov'), 'a two-role recipe needs two different items (Liquid Fire alone is not a Molotov)');
  t.ok(fire(['liquid_fire', 'bubble_flask']).includes('molotov'), 'Liquid Fire plus another glass item is');
  t.ok(fire(['rock', 'rock']).includes('landslide'), 'two rocks start a Landslide');
  const marbles = fire(['prize_marble', 'prize_marble', 'prize_marble']);
  t.ok(marbles.includes('three_of_a_kind') && marbles.includes('handful'), `three marbles: Three of a Kind and a Handful [${marbles}]`);
});

t.test('build pull: investment, rewards and relic picks', () => {
  const knight = { bin: DATA.CHARACTERS.knight.bin.map(id => ({ id })), relics: ['squire_gauntlet'] };
  const inv = DATA.investment(knight);
  t.ok(inv.metal > 0 && inv.fortress > 0, `knight starts in metal and fortress [${JSON.stringify(inv)}]`);
  t.eq(JSON.stringify(DATA.investment(null)), '{}', 'no run, no investment');
  const withRelic = DATA.investment({ bin: [], relics: ['festering_jar'] });
  t.eq(withRelic.poison, 3, 'a relic counts 3 for each archetype it carries');
  t.eq(DATA.investment({ bin: ['venom_dart', 'rot_catalyst'], relics: [] }).poison, 2, 'bin ids count once each (plain id strings work)');
  // without a run the draw is exactly the old one
  for (let seed = 1; seed <= 60; seed++) {
    const a = DATA.rewardItems(U.rng(seed), 1 + seed % 3, 'alchemist');
    const b = DATA.rewardItems(U.rng(seed), 1 + seed % 3, 'alchemist', 3, null);
    if (a.join() !== b.join()) { t.ok(false, `seed ${seed}: no run, same draw`); break; }
  }
  t.ok(true, 'no run: rewardItems draws exactly as before');
  // a poison run sees more poison
  const poisonRun = { bin: ['venom_dart', 'rot_catalyst', 'stink_potion', 'acid_bottle', 'plague_orb'].map(id => ({ id })), relics: ['festering_jar', 'contagion', 'venom_gland'] };
  let base = 0, pulled = 0, bad = 0;
  const N = 3000;
  const r1 = U.rng(99), r2 = U.rng(99);
  for (let i = 0; i < N; i++) {
    const a = DATA.rewardItems(r1, 2, 'alchemist', 3);
    const b = DATA.rewardItems(r2, 2, 'alchemist', 3, poisonRun);
    if (a.some(id => kwOf(ITEMS[id]).includes('poison'))) base++;
    if (b.some(id => kwOf(ITEMS[id]).includes('poison'))) pulled++;
    if (b.length !== 3 || new Set(b).size !== 3 || b.some(id => !ITEMS[id] || ITEMS[id].rarity === 'junk' || (ITEMS[id].char && ITEMS[id].char !== 'alchemist'))) bad++;
  }
  t.eq(bad, 0, 'pulled screens stay 3 unique valid ids');
  t.ok(pulled / N >= base / N + 0.1 && pulled / N <= base / N + 0.3, `poison on ${Math.round(100 * base / N)}% of plain screens, ${Math.round(100 * pulled / N)}% with the pull`);
  const a1 = DATA.rewardItems(U.rng(5), 2, 'knight', 3, poisonRun), a2 = DATA.rewardItems(U.rng(5), 2, 'knight', 3, poisonRun);
  t.eq(a1.join(), a2.join(), 'the pull is deterministic');
  // relic picks
  const pool = DATA.relicPool('u');
  for (let seed = 1; seed <= 40; seed++) {
    const r = U.rng(seed), q = U.rng(seed);
    if (DATA.pickRelic(r, pool) !== q.pick(pool)) { t.ok(false, `seed ${seed}: pickRelic without a run is rng.pick`); break; }
  }
  t.ok(true, 'pickRelic without a run is rng.pick(pool)');
  t.eq(DATA.pickRelic(U.rng(1), []), null, 'empty pool gives null');
  const burnRun = { bin: [], relics: ['flint_striker', 'powder_keg'] };
  let plain = 0, biased = 0;
  const q1 = U.rng(7), q2 = U.rng(7);
  for (let i = 0; i < 4000; i++) {
    if (kwOf(RELICS[DATA.pickRelic(q1, pool)]).includes('burn')) plain++;
    if (kwOf(RELICS[DATA.pickRelic(q2, pool, burnRun)]).includes('burn')) biased++;
  }
  t.ok(biased > plain * 2, `burn relics offered ${plain} times plain, ${biased} with a burn run`);
});

t.test('old saves: every id a save can hold still resolves', () => {
  for (const id of OLD_ITEM_IDS) t.ok(!!ITEMS[id] && ITEMS[id].id === id, `old item ${id} still exists`);
  const OLD = 'squire_gauntlet bubbling_satchel pickpocket_glove grip_tape oiled_rails golden_ticket inkwell heart_locket kettle_helm consolation_prize sore_loser blood_bag hot_coffee wide_palm rubber_thimbles protein_bar jackpot_bell thorn_mail venom_gland flint_striker snow_globe trophy_rack egg_timer grudge_journal recycling_bin potion_belt fridge_magnet cracked_hourglass big_knuckles four_leaf_clover vampire_dentures second_wind token_stack third_hand golden_crane cursed_quarter friendship_bracelet cursed_plush'.split(' ');
  for (const id of OLD) t.ok(!!RELICS[id] && RELICS[id].id === id, `old relic ${id} still exists`);
  for (const id of OLD) t.eq(RELICS[id].rarity, { squire_gauntlet: 'event', bubbling_satchel: 'event', pickpocket_glove: 'event' }[id] || RELICS[id].rarity, `old relic ${id} keeps its rarity`);
});

// ---------------------------------------------------------------- loot
t.test('loot: capsule tiers roll deterministically by seed, upgrade now and then, pity lifts to rare', () => {
  const L = DATA.LOOT;
  t.ok(L && Array.isArray(L.TIERS) && L.TIERS.join() === 'c,u,r,l', 'LOOT.TIERS is c,u,r,l');
  for (const k of L.TIERS) t.ok(isHex(L.COLOR[k]) && typeof L.NAME[k] === 'string', `tier ${k} has a colour and a name`);
  const roll = (seed, src, o) => { const r = U.rng(seed); return [0, 1, 2, 3, 4].map(() => JSON.stringify(DATA.rollCapsule(r, src, o))); };
  for (const src of ['normal', 'bonus', 'elite', 'boss', 'treasure']) {
    t.eq(roll(77, src).join('|'), roll(77, src).join('|'), `${src}: same seed, same capsules`);
    t.ok(roll(77, src).join('|') !== roll(78, src).join('|'), `${src}: another seed rolls differently`);
  }
  const idx = (x) => L.TIERS.indexOf(x);
  const cnt = { c: 0, u: 0, r: 0, l: 0 };
  let ups = 0, upFromC = 0, cs = 0;
  const r = U.rng(4242);
  for (let i = 0; i < 4000; i++) {
    const c = DATA.rollCapsule(r, 'normal');
    cnt[c.tier]++;
    t.ok(L.TIERS.includes(c.tier0) && L.TIERS.includes(c.tier), 'tiers are known');
    let prev = c.tier0;
    for (const u of c.ups) { if (idx(u) !== idx(prev) + 1) t.ok(false, 'every upgrade is one step up'); prev = u; }
    t.eq(prev, c.tier, 'the last up is the final tier');
    if (c.pity) t.ok(false, 'no pity without a pity count');
    if (c.ups.length) ups++;
    if (c.tier0 === 'c') { cs++; if (c.ups.length) upFromC++; }
  }
  t.ok(cnt.c > cnt.u && cnt.u > cnt.r && cnt.r > cnt.l, `normal capsules: common most, legendary least (${JSON.stringify(cnt)})`);
  const pc = upFromC / cs;
  t.ok(Math.abs(pc - L.UP.c) < 0.03, `a common upgrades mid-open about ${L.UP.c} of the time (${pc.toFixed(3)})`);
  t.ok(ups > 200 && ups < 1000, `upgrades are a treat, not the norm (${ups}/4000)`);
  const boss = { c: 0, u: 0, r: 0, l: 0 };
  for (let i = 0; i < 500; i++) boss[DATA.rollCapsule(r, 'boss').tier]++;
  t.eq(boss.c, 0, 'a boss never drops a common');
  t.ok(boss.r + boss.l > 350, 'boss capsules are mostly rare or better');
  for (let i = 0; i < 300; i++) {
    const c = DATA.rollCapsule(r, 'normal', { pity: L.PITY });
    t.ok(idx(c.tier) >= 2, 'at the pity count the capsule ends rare or better');
    if (idx(c.tier0) < 2) t.ok(c.ups.length >= 1, 'the pity lift plays as upgrades');
  }
  const fixed = DATA.rollCapsule(U.rng(1), 'counter', { tier: 'r' });
  t.eq(fixed.tier0, 'r', 'a counter capsule starts at the tier it was bought at');
});

t.test('loot: every capsule prize is valid for its tier', () => {
  const pools = { c: DATA.relicPool('c'), u: DATA.relicPool('u'), r: DATA.relicPool('r'), boss: DATA.relicPool('boss') };
  const ctx = { act: 2, char: 'knight', relics: pools, claws: Object.keys(CLAW_UPGRADES), tools: Object.keys(DATA.TOOLS) };
  const kinds = {};
  const r = U.rng(99);
  for (const tier of DATA.LOOT.TIERS) {
    for (let i = 0; i < 400; i++) {
      const p = DATA.capsulePrize(r, tier, ctx);
      kinds[tier + ':' + p.k] = 1;
      t.ok(['item', 'relic', 'gold', 'ink', 'maxhp', 'tickets', 'tool', 'claw'].includes(p.k), `${tier}: known prize kind ${p.k}`);
      if (p.k === 'item') { t.ok(!!ITEMS[p.id] && ITEMS[p.id].rarity !== 'junk', `${tier}: item ${p.id} exists`); if (!p.plus && tier !== 'l') t.eq(ITEMS[p.id].rarity, tier, `${tier}: item rarity matches`); }
      if (p.k === 'relic') { t.ok(!!RELICS[p.id], `${tier}: relic ${p.id} exists`); t.ok(DATA.LOOT.RELIC_RAR[tier].includes(RELICS[p.id].rarity), `${tier}: relic rarity fits the tier`); }
      if (p.k === 'claw') t.ok(!!CLAW_UPGRADES[p.u], `${tier}: claw part ${p.u} exists`);
      if (p.k === 'tool') t.ok(!!DATA.TOOLS[p.id], `${tier}: tool ${p.id} exists`);
      if (['gold', 'ink', 'maxhp', 'tickets'].includes(p.k)) t.ok(Number.isInteger(p.n) && p.n > 0, `${tier}: ${p.k} amount is a positive int`);
      const info = DATA.prizeInfo(p);
      t.ok(info && typeof info.name === 'string' && info.name.length > 0 && typeof info.text === 'string', `${tier}: ${p.k} has a name and text`);
      t.ok(!/\bink\b/i.test(info.name + ' ' + info.text), 'prize copy never says ink');
    }
  }
  t.ok(kinds['l:claw'] && kinds['l:relic'] && kinds['c:gold'] && kinds['c:tickets'], 'the tables reach their headline prizes');
  // empty pools fall back to gold, never to a bad id
  const bare = { act: 1, char: 'knight', relics: {}, claws: [], tools: [] };
  for (let i = 0; i < 200; i++) { const p = DATA.capsulePrize(r, 'l', bare); t.ok(p.k !== 'relic' && p.k !== 'claw', 'no relic or claw prize from empty pools'); }
  for (let i = 0; i < 100; i++) { const p = DATA.capsulePrize(r, 'u', Object.assign({ prefer: 'relic' }, ctx)); t.eq(p.k, 'relic', 'a treasure capsule prefers a relic'); }
  const a = DATA.capsulePrize(U.rng(5), 'r', ctx), b = DATA.capsulePrize(U.rng(5), 'r', ctx);
  t.eq(JSON.stringify(a), JSON.stringify(b), 'prizes are deterministic by seed');
});

t.test('loot: the prize shelf and the payout lines', () => {
  const shelf = DATA.prizeShelf(U.rng(3), 1, { char: 'rogue', tools: Object.keys(DATA.TOOLS) });
  t.eq(shelf.length, 6, 'six slots on the shelf');
  t.eq(shelf.filter(s => s.k === 'cap').length, 3, 'three capsules on the shelf');
  for (const s of shelf) { t.ok(Number.isInteger(s.price) && s.price > 0, `slot ${s.k} has a ticket price`); t.eq(s.sold, false, 'slots start unsold'); t.ok(DATA.prizeInfo(s).name.length > 0, `slot ${s.k} has a label`); }
  t.eq(JSON.stringify(DATA.prizeShelf(U.rng(3), 1, { char: 'rogue' })), JSON.stringify(DATA.prizeShelf(U.rng(3), 1, { char: 'rogue' })), 'the shelf is deterministic by seed');
  const plain = DATA.payout({ tier: 'normal', gold: 17, jackpots: 0, combos: [], dmgTaken: 4, turns: 5, overkill: 0 });
  t.eq(plain.lines.length, 1, 'a plain win has one line');
  t.eq(plain.gold, 17, 'its gold is the base roll');
  t.eq(plain.tix, DATA.LOOT.TICKETS.normal, 'its tickets are the normal base');
  const big = DATA.payout({ tier: 'elite', gold: 20, jackpots: 2, combos: [{ name: 'X', tier: 3 }, { name: 'Y', tier: 1 }], dmgTaken: 0, turns: 1, overkill: 14 });
  const ids = big.lines.map(l => l.id);
  t.eq(ids.join(','), 'base,jackpot,combo,flawless,speedy,overkill', 'every bonus line in order');
  t.eq(big.gold, big.lines.reduce((a, l) => a + l.gold, 0), 'gold total is the sum of the lines');
  t.eq(big.tix, big.lines.reduce((a, l) => a + l.tix, 0), 'ticket total is the sum of the lines');
  t.eq(big.lines[1].tix, 2 * DATA.LOOT.TICKETS.jackpot, 'tickets per jackpot');
  t.eq(big.lines[2].label, 'Combos x2', 'two combos are counted');
  const dbl = DATA.payout({ tier: 'elite', gold: 20, jackpots: 2, combos: [], dmgTaken: 0, turns: 1, overkill: 14, double: true });
  t.eq(dbl.lines[dbl.lines.length - 1].id, 'double', 'the double line comes last');
  const nodbl = DATA.payout({ tier: 'elite', gold: 20, jackpots: 2, combos: [], dmgTaken: 0, turns: 1, overkill: 14 });
  t.eq(dbl.gold, nodbl.gold * 2, 'DOUBLE doubles the gold');
  t.eq(dbl.tix, nodbl.tix * 2, 'DOUBLE doubles the tickets');
  t.ok(DATA.LOOT.DOUBLE > 0 && DATA.LOOT.DOUBLE <= 0.1, 'the double is a rare treat');
});

// ---------------------------------------------------------------- META (meta progression)
t.test('meta: Tilt levels 0..10, named, each one adds its own twist', () => {
  t.eq(DATA.TILT_MAX, 10, 'ten Tilt levels above zero');
  t.eq(DATA.TILT.length, 11, 'levels 0..10');
  DATA.TILT.forEach((l, i) => { t.eq(l.lv, i, `level ${i} in order`); t.ok(l.name && l.text, `level ${i} has a name and a line`); });
  t.eq(new Set(DATA.TILT.map(l => l.name)).size, 11, 'every level has its own name');
  t.eq(DATA.TILT[1].name, 'Loose Coin', 'level 1 is Loose Coin');
  t.eq(DATA.TILT[2].name, 'Sticky Joystick', 'level 2 is Sticky Joystick');
  t.eq(DATA.TILT[10].name, 'Rigged', 'level 10 is Rigged');
  const zero = DATA.tiltMods(0);
  t.ok(zero.hp === 0 && zero.dmg === 0 && zero.eliteAffix === 0 && zero.bulbs === 0 && zero.junk.length === 0 && zero.shop === 0 && zero.ramp === 0 && zero.rest === 0 && zero.caps === 0 && zero.bossRage === 0, 'Tilt 0 is neutral');
  t.eq(JSON.stringify(DATA.tiltMods(-3)), JSON.stringify(zero), 'below 0 clamps to neutral');
  t.eq(JSON.stringify(DATA.tiltMods(99)), JSON.stringify(DATA.tiltMods(10)), 'above 10 clamps to 10');
  const key = (m) => ({ hp: m.hp, dmg: m.dmg, eliteAffix: m.eliteAffix, bulbs: m.bulbs, junk: m.junk.length, shop: m.shop, ramp: m.ramp, rest: m.rest, caps: m.caps, bossRage: m.bossRage });
  for (let i = 1; i <= 10; i++) {
    const a = key(DATA.tiltMods(i - 1)), b = key(DATA.tiltMods(i));
    const diff = Object.keys(a).filter(k => a[k] !== b[k]);
    t.eq(diff.length, 1, `level ${i} (${DATA.TILT[i].name}) changes exactly one twist: ${diff.join(',')}`);
    t.eq(diff[0], DATA.TILT[i].k === 'junk' ? 'junk' : DATA.TILT[i].k, `level ${i} changes its own twist`);
  }
  const top = DATA.tiltMods(10);
  t.ok(top.hp > 0 && top.dmg > 0 && top.eliteAffix >= 1 && top.bulbs > 0 && top.junk.every(id => DATA.ITEMS[id]) && top.shop > 0 && top.ramp > 0 && top.ramp < DATA.DIFFICULTY.ramp.every && top.rest > 0 && top.rest < 0.3 && top.caps >= 1 && top.bossRage > 0, 'Tilt 10 carries every twist (cumulative)');
  t.ok(DATA.DIFFICULTY.hp === 2.0 && DATA.DIFFICULTY.dmg === 1.8, 'DIFFICULTY defaults untouched');
});

t.test('meta: achievements are well formed and checked safely', () => {
  const ids = DATA.ACH_IDS;
  // The board is a 3-column grid on a phone: room for the seasonal and evolution
  // stickers of round 7, but a runaway list still fails here (round 7 QA: 50 -> 60).
  t.ok(ids.length >= 25 && ids.length <= 60, `25 to 60 stickers (${ids.length})`);
  t.eq(new Set(ids).size, ids.length, 'unique ids');
  t.eq(new Set(ids.map(id => DATA.ACHIEVEMENTS[id] && DATA.ACHIEVEMENTS[id].name)).size, ids.length, 'unique sticker names (the board and the slap tell them apart)');
  for (const id of ids) {
    const a = DATA.ACHIEVEMENTS[id];
    t.ok(a && a.name && a.icon && a.text && a.color && typeof a.check === 'function', `${id} has name, icon, text, colour, check`);
    if (a.goal) t.ok(typeof a.val === 'function' && a.goal > 0, `${id} progress has a val()`);
    t.ok(!DATA.achCheck({ kind: 'tick' }, {}).includes(id), `${id} does not fire on an empty context`);
  }
  for (const want of ['jackpot', 'handful', 'full_roster', 'special_delivery', 'indigestion', 'golden_capsule', 'seriously_tilted', 'untouchable', 'ticket_tycoon'])
    t.ok(DATA.ACHIEVEMENTS[want], `the brief's sticker ${want} exists`);
  const run = { delivered: 3, jackpots: 1, act: 2, gold: 320, relics: [], bin: [], loot: { tixEarned: 120, bestCap: 'l', bigHit: 44, overkill: 31, doubles: 1 } };
  const got = DATA.achCheck({ kind: 'tick', run, meta: { stats: {} } }, {});
  for (const id of ['first_prize', 'jackpot', 'going_up', 'money_bags', 'ticket_tycoon', 'golden_capsule', 'crusher', 'overkill', 'double_down']) t.ok(got.includes(id), `tick earns ${id}`);
  t.ok(!DATA.achCheck({ kind: 'tick', run, meta: {} }, { jackpot: 1 }).includes('jackpot'), 'an owned sticker is never earned twice');
  const f = { tier: 'elite', dmgTaken: 0, turn: 1, hp: 4 };
  const fight = DATA.achCheck({ kind: 'fight', run: {}, meta: {}, f }, {});
  t.ok(fight.includes('untouchable') && fight.includes('one_turn') && fight.includes('by_a_thread'), 'won-fight stickers');
  t.ok(!DATA.achCheck({ kind: 'tick', run: {}, meta: {}, f }, {}).includes('untouchable'), 'fight stickers need a won fight');
  const boom = DATA.achCheck({ kind: 'ev', ev: { t: 'die', idx: 0 }, f: { enemy: { tier: 'boss' }, curDef: { art: 'bomb' } } }, {});
  t.ok(boom.includes('special_delivery'), 'a boss finished by a bomb');
  t.ok(!DATA.achCheck({ kind: 'ev', ev: { t: 'die', idx: 0 }, f: { enemy: { tier: 'boss' }, curDef: { art: 'sword' } } }, {}).includes('special_delivery'), 'not by a sword');
  t.ok(DATA.achCheck({ kind: 'ev', ev: { t: 'binReturn', why: 'burst' } }, {}).includes('indigestion'), 'eat and burst');
  t.ok(DATA.achCheck({ kind: 'ev', ev: { t: 'combo', id: 'mega_jackpot', tier: 3 } }, {}).includes('mega'), 'the Mega Jackpot combo');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { winsBy: { knight: 1, alchemist: 2, rogue: 1 } } }, {}).includes('full_roster'), 'three crawlers won with');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { winsBy: { knight: 5 } } }, {}).includes('full_roster'), 'one crawler is not a roster');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { tilt: { rogue: 5 } } }, {}).includes('seriously_tilted'), 'Tilt 5 unlocked');
  t.ok(DATA.achCheck({ kind: 'win', run: { tilt: 10 } }, {}).includes('rigged'), 'a Tilt 10 win');
  t.ok(DATA.achCheck({ kind: 'end', run: { daily: '2026-09-27' } }, {}).includes('daily_grind'), 'a finished daily');
  t.eq(DATA.ACHIEVEMENTS.full_roster.val({ meta: { winsBy: { knight: 1, rogue: 0 } } }), 1, 'progress counts crawlers with a win');
  // a throwing check never breaks the rest
  const bad = DATA.achCheck(null, null);
  t.ok(Array.isArray(bad), 'a null context is safe');
  const SRC = fs.readFileSync(path.join(DIR, 'js', 'data.js'), 'utf8');
  t.ok(SRC.indexOf(String.fromCharCode(0x2014)) < 0, 'no em dash in data.js');
});

t.test('meta: the Prizedex entries and progress', () => {
  const E = DATA.dexEntries();
  t.eq(DATA.DEX_TABS.map(x => x.id).join(','), 'items,relics,enemies,combos', 'four tabs');
  t.eq(E.items.length, Object.keys(DATA.ITEMS).length, 'every item (junk included)');
  t.eq(E.relics.length, Object.keys(DATA.RELICS).length, 'every relic');
  t.eq(E.combos.length, Object.keys(DATA.COMBOS).length, 'every combo');
  t.ok(E.enemies.length >= 26 && E.enemies.every(id => DATA.ENEMIES[id]), 'the enemies');
  const none = DATA.dexProgress({});
  t.ok(none.n === 0 && none.pct === 0 && none.total === E.items.length + E.relics.length + E.enemies.length + E.combos.length, 'empty book');
  const all = {};
  for (const tab in E) { all[tab] = {}; for (const id of E[tab]) all[tab][id] = 1; }
  const full = DATA.dexProgress(all);
  t.ok(full.n === full.total && full.pct === 100, 'a full book is 100%');
  const one = DATA.dexProgress({ items: { [E.items[0]]: 1, nope: 1 } });
  t.ok(one.n === 1 && one.per.items.n === 1 && one.per.relics.n === 0, 'unknown ids do not count');
});

t.test('meta: the daily run seed, crawler and score', () => {
  const k = DATA.dailyKey(new Date(2026, 8, 27, 15, 0));
  t.eq(k, '2026-09-27', 'day key');
  t.eq(DATA.dailySeed(k), DATA.dailySeed('2026-09-27'), 'the same seed for everyone that day');
  t.ok(DATA.dailySeed(k) !== DATA.dailySeed('2026-09-28'), 'a new seed tomorrow');
  t.ok(DATA.dailySeed(k) > 0, 'a positive seed');
  t.ok(DATA.CHARACTERS[DATA.dailyChar(k)], 'a real crawler');
  const seen = new Set();
  for (let d = 1; d <= 30; d++) seen.add(DATA.dailyChar(`2026-10-${d < 10 ? '0' : ''}${d}`));
  t.eq(seen.size, Object.keys(DATA.CHARACTERS).length, 'every crawler gets a day');
  const r = { act: 2, kills: 10, jackpots: 2, gold: 80, loot: { tixEarned: 20 } };
  t.ok(DATA.dailyScore(r, true) > DATA.dailyScore(r, false), 'a win scores more');
  t.ok(DATA.dailyScore(Object.assign({}, r, { act: 3 }), false) > DATA.dailyScore(r, false), 'climbing higher scores more');
  t.eq(DATA.dailyScore({}, false), 0, 'an empty run scores 0');
});

t.test('claw types: DATA.CLAWS matches the physics rig types and reads well', () => {
  const P = boot({ only: ['util', 'physics'] }).PHYS;
  const ids = Object.keys(DATA.CLAWS);
  t.eq(ids.sort().join(), Object.keys(P.CLAW_TYPES).sort().join(), 'one entry per PHYS.CLAW_TYPES rig');
  const orders = new Set();
  for (const id of ids) {
    const c = DATA.CLAWS[id];
    t.eq(c.id, id, id + ' id');
    for (const k of ['name', 'icon', 'text', 'joke', 'good', 'bad', 'color']) t.ok(typeof c[k] === 'string' && c[k].length > 0, `${id}.${k}`);
    for (const k of ['grip', 'reach', 'speed']) t.ok(c.stats[k] >= 1 && c.stats[k] <= 5 && (c.stats[k] | 0) === c.stats[k], `${id} stat ${k} in 1..5`);
    t.ok(c.text.length <= 170 && c.joke.length <= 90, id + ' copy is short enough for a phone');
    for (const s of [c.name, c.text, c.joke, c.good, c.bad].concat(Object.values(c.ups || {}))) t.ok(s.indexOf(String.fromCharCode(0x2014)) < 0, id + ' has no em dash');
    for (const u in (c.ups || {})) t.ok(DATA.CLAW_UPGRADES[u], `${id} notes a real upgrade (${u})`);
    orders.add(c.order);
  }
  t.eq(orders.size, ids.length, 'every claw has its own place in the picker');
  t.eq(DATA.CLAWS.classic.order, 0, 'the classic claw comes first');
  t.eq(DATA.clawType('magnet').id, 'magnet', 'clawType finds a claw');
  t.eq(DATA.clawType(undefined).id, 'classic', 'a missing claw type is the classic claw');
  t.eq(DATA.clawType('laser').id, 'classic', 'an unknown claw type is the classic claw');
});

// ------------------------------------------------ round 3: Lucky Lou
// DESIGN.md "Lucky Lou and the synergy pass": the fourth crawler, the Luck
// build, bait, material and claw relics, the casino combos and the secrets.
t.test('round 3: Lucky Lou, the Gambler', () => {
  const c = CHARACTERS.gambler;
  t.ok(c && c.name === 'Lucky Lou' && c.title === 'The Gambler', 'Lucky Lou, The Gambler');
  t.eq(c.bin.length, 19, 'a 19 item starting bin like the others');
  t.ok(c.luck === true, 'his gift: the Luck meter');
  t.eq(c.relic, 'snake_eyes', 'starts with Snake Eyes');
  t.ok(RELICS.snake_eyes.starter && RELICS.snake_eyes.rarity === 'event', 'Snake Eyes is a starter, never in a pool');
  t.ok(c.bin.filter(id => ITEMS[id].char === 'gambler').length >= 10 && c.bin.every(id => R3_ITEMS.includes(id) || !ITEMS[id].char), 'the bin is mostly his new kit');
  t.ok(c.claw.grip < CHARACTERS.knight.claw.grip, 'a looser claw than the knight (whiffs are fuel)');
  for (const id of CHARS) t.ok(typeof CHARACTERS[id].vsLine === 'string' && CHARACTERS[id].vsLine.length > 4 && CHARACTERS[id].vsLine.length <= 32, `${id} has a versus card line`);
  t.eq(CHARACTERS.gambler.vsLine, 'Double or nothing, pal.', 'his line');
  const seen = new Set();
  for (let d = 0; d < 120; d++) seen.add(DATA.dailyChar('2026-11-' + d));
  t.ok(seen.has('gambler'), 'the daily rotation deals him in');
  for (const r of ['c', 'u', 'r', 'l']) t.ok(DATA.pool(r, 'gambler').length >= (r === 'l' ? 2 : 3), `pool ${r}/gambler has choices`);
  t.ok(Object.keys(ITEMS).some(id => ITEMS[id].char === 'gambler' && ITEMS[id].rarity === 'l'), 'a legendary of his own');
  for (let seed = 1; seed <= 200; seed++) {
    const r = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), 'gambler');
    if (r.length !== 3 || !r.every(id => ITEMS[id] && !ITEMS[id].starter && (!ITEMS[id].char || ITEMS[id].char === 'gambler'))) { t.ok(false, `gambler rewards seed ${seed} [${r}]`); break; }
  }
  t.ok(true, 'his reward screens only offer shared and gambler items');
});

t.test('round 3: new items, relics and the Luck archetype', () => {
  t.ok(R3_ITEMS.length >= 15 && R3_ITEMS.length <= 20 && R3_ITEMS.every(id => ITEMS[id]), `15..20 new items [${R3_ITEMS.length}]`);
  const poolR = R3_RELICS.filter(id => !RELICS[id].starter);
  t.ok(poolR.length >= 12 && poolR.length <= 15, `12..15 new pool relics [${poolR.length}]`);
  for (const id of poolR) t.ok(['c', 'u', 'r'].includes(RELICS[id].rarity) && DATA.relicPool(RELICS[id].rarity).includes(id), `${id}: in relicPool`);
  for (const id of R3_ITEMS) {
    const d = ITEMS[id];
    if (!d.starter && !d.tags.includes('small')) t.ok(DATA.pool().includes(id), `${id}: in the reward pool`);
    t.ok(DATA.kwIds(d).length >= 1, `${id}: carries a build chip`);
  }
  const kw = (id) => DATA.kwIds(ITEMS[id]);
  t.ok(kw('fortune_cookie').includes('luck') && kw('one_armed_bandit').includes('luck') && kw('lucky_clover').includes('luck'), 'Luck from cookies, clovers and the bandit');
  t.ok(!kw('poker_chip').includes('luck') && kw('poker_chip').includes('fortress'), 'chips are Block: Lou\'s Luck comes from whiffs, clovers and cookies');
  t.ok(kw('loaded_dice').includes('luck') && kw('volatile_egg').includes('luck'), 'old dice items join the Luck build (Luck rolls them twice)');
  t.ok(kw('hot_potato').includes('burn') && kw('hot_potato').includes('feast'), 'Hot Potato bridges pyro and feast');
  t.ok(kw('floating_token').includes('luck') && kw('floating_token').includes('greed'), 'the Floating Token bridges luck and greed');
  t.ok(DATA.keywords(RELICS.lucky_cat, Infinity).map(x => x.id).join() === 'luck,greed', 'Lucky Cat chips');
  // bait for hungry monsters
  t.ok(ITEMS.poison_pill.lure > 0 && ITEMS.poison_pill.eaten.status.poison > 0 && ITEMS.poison_pill.plus.eaten.dmg > ITEMS.poison_pill.eaten.dmg, 'the Poison Pill is bait that hurts its eater');
  t.ok(ITEMS.hot_potato.hot > 0 && ITEMS.hot_potato.eaten.status.burn > 0, 'the Hot Potato burns whoever holds it');
  // materials: a bomb with a fuse, glass dice, a magic coin that floats
  t.eq(ITEMS.firecracker.art, 'bomb', 'the Firecracker has a real fuse');
  t.ok(ITEMS.crystal_dice.tags.includes('glass') && ITEMS.floating_token.tags.includes('magic') && ITEMS.floating_token.tags.includes('metal'), 'glass dice crack, the token floats and sticks to magnets');
  // claw and loot relics
  t.ok(RELICS.gacha_charm.loot && RELICS.gacha_charm.loot.capUp > 0, 'the Gacha Charm upgrades capsules');
  for (const id of ['lodestone', 'sand_pail', 'big_catch']) t.ok(/Magnet|Scoop|Harpoon/.test(RELICS[id].text), `${id} names its claw`);
  for (const id of R3_ITEMS.concat(R3_RELICS)) {
    const s = JSON.stringify([ITEMS[id] && ITEMS[id].text, RELICS[id] && RELICS[id].text]);
    t.ok(s.indexOf(String.fromCharCode(0x2014)) < 0, `${id}: no em dash`);
  }
});

t.test('round 3: relic hooks with a recording COMBAT', () => {
  const calls = [];
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', v]); return v; },
    status: (F, who, s, v) => { calls.push(['status', s, v, who === F.player ? 'p' : 'e']); return v; },
    heal: () => 0, gainGold: (F, v) => { calls.push(['gold', v]); return v; }, tickets: (F, v) => { calls.push(['tix', v]); return v; },
    emit: (F, ev) => { calls.push(['emit', ev.t, ev.text]); return ev; }, gold: () => 0,
  };
  try {
    const F = mockF();
    F.rng = U.rng(5);
    RELICS.snake_eyes.hooks.onGrab(F, 0);
    RELICS.snake_eyes.hooks.onGrab(F, 0);
    t.eq(calls.filter(x => x[0] === 'damage').length, 1, 'Snake Eyes rolls once a turn');
    t.ok(calls.some(x => x[0] === 'emit' && /\d\+\d/.test(x[2] || '')), 'and shows the dice');
    calls.length = 0;
    RELICS.snake_eyes.hooks.onGrab(F, 2);
    t.eq(calls.length, 0, 'never on a grab that delivered');
    // a doubles roll gives the grab back
    let doubles = false;
    for (let s = 1; s < 200 && !doubles; s++) {
      const G = mockF(); G.rng = U.rng(s); const g0 = G.player.grabs;
      RELICS.snake_eyes.hooks.onGrab(G, 0);
      if (G.player.grabs > g0) doubles = true;
    }
    t.ok(doubles, 'doubles refund the grab');
    calls.length = 0;
    const L = mockF();
    RELICS.lucky_cat.hooks.onCashOut(L, 7, 2);
    RELICS.lucky_ticket.hooks.onCashOut(L, 7, 2);
    t.ok(calls.some(x => x[0] === 'gold' && x[1] === 7) && calls.some(x => x[0] === 'tix' && x[1] === 4), 'cash outs pay gold and tickets');
    calls.length = 0;
    const M = mockF(); M.clawType = 'magnet'; M.grab = { insts: [], defs: [ITEMS.rusty_sword] };
    RELICS.lodestone.hooks.onGrab(M, 1);
    t.ok(calls.some(x => x[0] === 'damage'), 'the Lodestone zaps with the Magnet Crane from one metal item');
    calls.length = 0;
    const N = mockF(); N.grab = { insts: [], defs: [ITEMS.rusty_sword] };
    RELICS.lodestone.hooks.onGrab(N, 1);
    t.eq(calls.length, 0, 'but needs two metal items on any other claw');
    const H = mockF(); H.clawType = 'hook';
    calls.length = 0; RELICS.big_catch.hooks.onPlay(H); RELICS.big_catch.hooks.onPlay(H);
    t.eq(JSON.stringify(calls.filter(x => x[0] === 'damage')), JSON.stringify([['damage', 8]]), 'Big Catch: 8 with the Harpoon, once a turn');
    const P = mockF(); P.clawType = 'scoop';
    calls.length = 0; RELICS.sand_pail.hooks.onGrab(P, 2);
    t.ok(calls.some(x => x[0] === 'damage' && x[1] === 6), 'the Sand Pail pays on a 2 item scoop');
    calls.length = 0; RELICS.sand_pail.hooks.onGrab(mockF(), 2);
    t.eq(calls.length, 0, 'but not on another claw');
    calls.length = 0; RELICS.blasting_cap.hooks.onMaterial(mockF(), 'blast');
    t.ok(calls.some(x => x[0] === 'status' && x[1] === 'burn') && calls.some(x => x[0] === 'status' && x[1] === 'block'), 'the Blasting Cap burns and blocks on a blast');
  } finally { delete globalThis.COMBAT; }
});

t.test('round 3: combos, secret recipes and the loot hooks', () => {
  const R3_COMBOS = 'double_dice poker_night hot_lunch two_pair bad_medicine full_house royal_flush dead_mans_hand midas_touch lucky_seven'.split(' ');
  t.ok(R3_COMBOS.length >= 6 && R3_COMBOS.length <= 10 && R3_COMBOS.every(id => DATA.COMBOS[id]), `6..10 new combos [${R3_COMBOS.length}]`);
  const secrets = Object.keys(DATA.COMBOS).filter(id => DATA.COMBOS[id].secret);
  t.ok(secrets.length >= 3 && secrets.every(id => DATA.COMBOS[id].tier === 3), `secret legendary recipes [${secrets}]`);
  const defs = (list) => list.map(id => ITEMS[id]);
  const fire = (list, ctx) => DATA.combosFor(defs(list), ctx).map(c => c.id);
  t.ok(!fire(['bone_dice', 'poker_chip']).includes('lucky_seven'), 'Lucky Seven needs the grab state');
  t.ok(fire(['bone_dice', 'poker_chip'], { luck: 7 }).includes('lucky_seven'), 'fires on exactly 7 Luck');
  t.ok(!fire(['bone_dice', 'poker_chip'], { luck: 8 }).includes('lucky_seven'), 'not on 8');
  const house = fire(['prize_marble', 'prize_marble', 'prize_marble', 'glass_bead', 'glass_bead']);
  t.ok(house.includes('full_house') && !house.includes('three_of_a_kind') && !house.includes('two_pair'), `a Full House replaces the kind and the pairs [${house}]`);
  t.ok(fire(['hoardcoin', 'lucky_coin', 'lucky_penny']).includes('midas_touch'), 'the Hoard\'s coins can start a Midas Touch');
  t.ok(!fire(['lucky_coin', 'lucky_coin', 'lucky_penny']).includes('midas_touch'), 'Midas wants three different coins');
  t.ok(fire(['poison_pill', 'toxic_vial']).includes('bad_medicine'), 'Bad Medicine');
  // loot: capsules that upgrade more often, ticket relics on the payout
  let a = 0, b = 0;
  const r1 = U.rng(8), r2 = U.rng(8);
  for (let i = 0; i < 2000; i++) { a += DATA.rollCapsule(r1, 'normal', {}).ups.length; b += DATA.rollCapsule(r2, 'normal', { up: 0.2 }).ups.length; }
  t.ok(b > a * 1.8, `the Gacha Charm doubles the upgrades or so (${a} -> ${b})`);
  t.eq(JSON.stringify(DATA.rollCapsule(U.rng(3), 'elite', { up: 0 })), JSON.stringify(DATA.rollCapsule(U.rng(3), 'elite', {})), 'no charm, no change');
  const p = DATA.payout({ tier: 'normal', gold: 10, relicTix: 5 });
  t.ok(p.lines.some(l => l.id === 'relictix' && l.tix === 5) && p.tix === DATA.LOOT.TICKETS.normal + 5, 'ticket relics get a payout line');
  t.ok(!DATA.payout({ tier: 'normal', gold: 10 }).lines.some(l => l.id === 'relictix'), 'none without them');
  // stickers
  const A = DATA.ACHIEVEMENTS;
  t.ok(A.big_payout.check({ kind: 'ev', ev: { t: 'luck', k: 'cash', v: 10 } }) && !A.big_payout.check({ kind: 'ev', ev: { t: 'luck', k: 'cash', v: 9 } }), 'Big Payout: 10 Luck cashed out');
  t.ok(A.secret_menu.check({ kind: 'ev', ev: { t: 'combo', id: 'midas_touch' } }) && !A.secret_menu.check({ kind: 'ev', ev: { t: 'combo', id: 'armory' } }), 'Secret Menu: a secret recipe');
  t.ok(A.house_loses.check({ kind: 'win', run: { char: 'gambler' } }) && !A.house_loses.check({ kind: 'win', run: { char: 'knight' } }), 'The House Loses: a win with Lou');
});

// ================================================================ ENDLESS (DESIGN.md "Endless and mutators")
const MUT_FX = ['gs', 'drag', 'scale', 'slick', 'glass', 'drift', 'belt', 'quake', 'dark', 'temp', 'grabs', 'dmgOut', 'affix', 'rules', 'extra'];
t.test('endless: the mutators are well formed and the engine reads every effect', () => {
  const M = DATA.MUTATORS, ids = DATA.MUT_IDS;
  t.ok(ids.length >= 10 && ids.length <= 14, `10 to 14 mutators (${ids.length})`);
  t.eq(new Set(ids).size, ids.length, 'unique ids');
  t.eq(DATA.MUT_MAX, 3, 'up to 3 at once');
  for (const id of ids) {
    const m = M[id];
    t.ok(m && m.id === id && m.name && m.icon && m.text && /^#[0-9a-f]{6}$/i.test(m.color), `${id}: name, icon, text, colour`);
    t.ok(m.mult >= 0.8 && m.mult <= 1.5, `${id}: a score multiplier in range (${m.mult})`);
    t.ok(m.text.length <= 110 && m.name.length <= 26, `${id}: the copy fits a chip and the reboot card`);
    const keys = Object.keys(m.fx || {});
    t.ok(keys.length > 0 && keys.every((k) => MUT_FX.includes(k)), `${id}: effects the engine reads (${keys.join()})`);
    if (m.fx.temp) t.ok(ITEMS[m.fx.temp.id] && m.fx.temp.n > 0 && m.fx.temp.max >= m.fx.temp.n, `${id}: its temporary item exists`);
    if (m.fx.affix) t.ok(DATA.AFFIXES[m.fx.affix], `${id}: its affix exists`);
    for (const k in m.fx.rules || {}) t.ok(DATA.RELIC_RULES.includes(k), `${id}: rule ${k} is a relic rule`);
  }
  for (const want of ['lowgrav', 'glass', 'bombs', 'magnet', 'tiny', 'giant', 'slippery', 'double', 'hungry', 'fever', 'blackout', 'conveyor']) t.ok(M[want], `the brief's mutator ${want} exists`);
});
t.test('endless: mutators clash, clean, merge and pick', () => {
  t.ok(DATA.mutClash('tiny', 'giant') && DATA.mutClash('giant', 'tiny') && !DATA.mutClash('tiny', 'lowgrav'), 'Tiny and Giant clash, others do not');
  t.eq(DATA.mutClean(['tiny', 'giant', 'nope', 'tiny', 'lowgrav']).join(), 'tiny,lowgrav', 'clean: known, unique, no clash, in order');
  t.eq(DATA.mutClean(['lowgrav', 'glass', 'bombs', 'magnet'], DATA.MUT_MAX).join(), 'lowgrav,glass,bombs', 'the cap keeps the first three');
  t.eq(DATA.mutClean(null).length, 0, 'junk is no mutators');
  const none = DATA.mutMods([]);
  t.ok(none.ids.length === 0 && none.mult === 1 && none.gs === 1 && none.scale === 1 && none.slick === 1 && none.grabs === 1 && none.dmgOut === 1 && !none.dark && !none.glass && !none.quake && none.extra === 0 && none.temp.length === 0 && none.affix.length === 0, 'no mutators: neutral');
  const m = DATA.mutMods(['lowgrav', 'double', 'hungry', 'fever']);
  t.ok(m.gs < 0.5 && m.drag > 0, 'Low Gravity floats');
  t.ok(m.grabs === 2 && m.dmgOut === 0.5, 'Double Grabs, Half Damage');
  t.ok(m.affix.includes('greedy') && m.affix.includes('hasty'), 'Hungry Hungry and Jackpot Fever affixes');
  t.eq(m.rules.comboTwice, 1, 'Jackpot Fever: combos fire twice');
  const prod = ['lowgrav', 'double', 'hungry', 'fever'].reduce((p, id) => p * DATA.MUTATORS[id].mult, 1);
  t.near(m.mult, prod, 0.006, 'the multiplier is the product');
  t.eq(DATA.mutMult(['tiny', 'giant']), DATA.MUTATORS.tiny.mult, 'a clash never counts twice');
  t.ok(DATA.mutMods(['magnet']).mult < 1, 'a helpful mutator lowers the score multiplier');
  let bad = 0;
  for (let s = 1; s <= 200; s++) {
    const rng = U.rng(s), have = s % 2 ? ['tiny', 'bombs'] : ['giant'];
    const id = DATA.mutPick(rng, have);
    if (!id || have.includes(id) || have.some((o) => DATA.mutClash(o, id))) bad++;
  }
  t.eq(bad, 0, 'mutPick never repeats one or picks a clash');
  t.eq(DATA.mutPick(U.rng(3), DATA.MUT_IDS), null, 'nothing left to pick: null');
});
t.test('endless: the daily run brings 1 or 2 fixed mutators for the date', () => {
  const k = '2026-09-28';
  t.eq(DATA.dailyMutators(k).join(), DATA.dailyMutators(k).join(), 'the same date, the same mutators');
  const seen = new Set(), counts = {};
  for (let d = 1; d <= 60; d++) {
    const key = `2026-${d <= 30 ? '10' : '11'}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`;
    const ids = DATA.dailyMutators(key);
    t.ok(ids.length >= 1 && ids.length <= 2, `${key}: 1 or 2 mutators`);
    t.eq(DATA.mutClean(ids).length, ids.length, `${key}: known and compatible`);
    seen.add(ids.join());
    counts[ids.length] = (counts[ids.length] | 0) + 1;
  }
  t.ok(seen.size >= 20, `the mix changes day to day (${seen.size} sets in 60 days)`);
  t.ok(counts[1] > 5 && counts[2] > 5, 'some days bring one, some two');
});
t.test('endless: the loop scaling', () => {
  const s0 = DATA.endlessScale(0, 1);
  t.ok(s0.hp === 1 && s0.dmg === 1 && !s0.normalAffix && !s0.bigAffix && !s0.rage && !s0.mix, 'loop 0 is neutral');
  t.eq([1, 2, 3, 4, 5, 6, 7].map(DATA.endlessAct).join(), '1,2,3,1,2,3,1', 'the loops cycle the three acts');
  let prev = null;
  for (let loop = 1; loop <= 9; loop++) {
    const act = DATA.endlessAct(loop), s = DATA.endlessScale(loop, act);
    t.ok(s.hp > 1 && s.dmg > 1, `loop ${loop}: tougher than the act it borrows`);
    // the strength over act 3's own numbers grows every loop, whatever the pool
    const hp3 = s.hp / DATA.ENDLESS.liftHp[act], dmg3 = s.dmg / DATA.ENDLESS.liftDmg[act];
    if (prev) t.ok(hp3 > prev[0] && dmg3 > prev[1], `loop ${loop}: stronger than loop ${loop - 1}`);
    prev = [hp3, dmg3];
    t.eq(s.normalAffix, Math.min(3, Math.floor(loop / 2)), `loop ${loop}: normals' extra affixes`);
    t.eq(s.bigAffix, Math.min(3, Math.ceil(loop / 2)), `loop ${loop}: elites' and bosses' extra affixes`);
    t.eq(s.rage, loop >= 2, `loop ${loop}: bosses in phase two from loop 2`);
    t.eq(s.eliteRage, loop >= 4, `loop ${loop}: elites too from loop 4`);
    t.ok(s.mix, `loop ${loop}: the boss borrows a trick`);
  }
  t.ok(DATA.endlessScale(1, 1).hp > DATA.endlessScale(1, 3).hp, 'act 1 pools are lifted further than act 3 pools');
  for (let act = 1; act <= 3; act++) {
    const own = ENCOUNTERS[act].boss[0];
    for (let s = 1; s <= 40; s++) {
      const id = DATA.endlessMix(U.rng(s), act);
      t.ok(ENEMIES[id] && ENEMIES[id].tier === 'boss' && ENEMIES[id].sig && !own.includes(id), `act ${act} seed ${s}: another boss's trick (${id})`);
    }
    t.eq(DATA.endlessMix(U.rng(7), act), DATA.endlessMix(U.rng(7), act), 'deterministic by rng');
  }
  t.ok(DATA.DIFFICULTY.hp === 2.0 && DATA.DIFFICULTY.dmg === 1.8, 'DIFFICULTY defaults untouched');
});
t.test('endless: the run score', () => {
  const S0 = DATA.SCORE;
  const run = { act: 2, kills: 30, jackpots: 4, tilt: 0, sc: { bosses: 1, combos: 10 } };
  const r = DATA.runScore(run, false);
  t.eq(r.mode, 'classic', 'a plain run is classic');
  t.eq(r.base, 2 * S0.floor + 30 * S0.kill + S0.boss + 4 * S0.jackpot + 10 * S0.combo, 'base = floors, kills, bosses, jackpots, combos');
  t.eq(r.total, r.base, 'no Tilt, no mutators: x1');
  t.eq(r.lines.map((l) => l.k).join(), 'floors,kills,bosses,jackpots,combos', 'one line per scored thing');
  const won = DATA.runScore(Object.assign({}, run, { act: 3 }), true);
  t.eq(won.base - DATA.runScore(Object.assign({}, run, { act: 3 }), false).base, S0.win, 'a win adds the Prize Master line');
  const tilt = DATA.runScore(Object.assign({}, run, { tilt: 5 }), false);
  t.eq(tilt.total, Math.round(r.base * 1.5), 'Tilt 5: x1.5');
  const mut = DATA.runScore(Object.assign({}, run, { muts: ['blackout', 'hungry'] }), false);
  t.eq(mut.mutM, DATA.mutMult(['blackout', 'hungry']), 'the mutator multiplier');
  t.eq(mut.total, Math.round(r.base * mut.mutM), 'total = base x Tilt x mutators');
  const end = DATA.runScore(Object.assign({}, run, { act: 1, endless: { loop: 4 } }), false);
  t.eq(end.mode, 'endless', 'Endless mode');
  t.ok(end.lines.some((l) => l.k === 'loops' && l.n === 4 && l.v === 4 * S0.loop), 'loops scored');
  t.ok(end.lines.some((l) => l.k === 'floors' && l.n === 7), 'floors = 3 + the loop');
  t.ok(end.lines.some((l) => l.k === 'win'), 'Endless always carries the win');
  t.eq(DATA.runScore(Object.assign({}, run, { daily: '2026-09-28' }), false).mode, 'daily', 'a daily run');
  const empty = DATA.runScore(null, false);
  t.ok(empty.total >= 0 && Number.isFinite(empty.total), 'an empty run is safe');
});
t.test('endless: the stickers', () => {
  const A = DATA.ACHIEVEMENTS;
  for (const id of ['endless_on', 'loop3', 'loop6', 'mad_science', 'high_score']) t.ok(A[id] && DATA.ACH_IDS.includes(id), `${id} is on the board`);
  t.ok(A.endless_on.check({ kind: 'tick', run: { endless: { loop: 1 } } }) && !A.endless_on.check({ kind: 'tick', run: {} }), 'Insert Another Coin: an Endless run');
  t.ok(A.loop3.check({ kind: 'tick', run: { endless: { loop: 3 } } }) && !A.loop3.check({ kind: 'tick', run: { endless: { loop: 2 } } }), 'Loop de Loop: loop 3');
  t.ok(A.loop6.check({ kind: 'meta', meta: { endless: { best: 6 } } }) && !A.loop6.check({ kind: 'meta', meta: { endless: { best: 5 } } }), 'Groundhog Claw: loop 6 on the profile');
  t.eq(A.loop6.val({ meta: { endless: { best: 4 } } }), 4, 'its progress bar');
  t.ok(A.mad_science.check({ kind: 'win', run: { muts: ['tiny', 'glass'] } }) && !A.mad_science.check({ kind: 'win', run: { muts: ['tiny', 'giant'] } }) && !A.mad_science.check({ kind: 'end', run: { muts: ['tiny', 'glass'] } }), 'Mad Science: a win with 2+ mutators');
  t.ok(A.high_score.check({ kind: 'end', run: { scoreTop: 25000 } }) && !A.high_score.check({ kind: 'end', run: { scoreTop: 24999 } }), 'High Score: 25,000');
});

// BESTIARY (round 4): eight enemies that play with the machine itself.
t.test('bestiary: the new enemies, their acts and encounters', () => {
  const NEW = { tickler: [1, 'normal'], jelly: [1, 'normal'], barker: [1, 'elite'], magbat: [2, 'normal'], mole: [2, 'normal'], dozer: [2, 'elite'], ghost: [3, 'normal'], collector: [3, 'elite'] };
  const KIND = { tickler: 'tickle', jelly: 'glue', barker: 'wheel', magbat: 'ceiling', mole: 'bury', dozer: 'plow', ghost: 'vanish' };
  for (const id in NEW) {
    const e = ENEMIES[id], [act, tier] = NEW[id], W = 'bestiary ' + id;
    t.ok(!!e && e.act === act && e.tier === tier, `${W}: act ${act} ${tier}`);
    if (!e) continue;
    t.eq(e.art, id, `${W}: its own art key`);
    if (KIND[id]) t.ok(e.moves.some(m => m.k === KIND[id]), `${W}: uses ${KIND[id]}`);
    const pools = ENCOUNTERS[act][tier];
    t.ok(pools.some(enc => enc.includes(id)), `${W}: appears in the act ${act} ${tier} encounters`);
    t.ok(JSON.stringify(e).indexOf(String.fromCharCode(0x2014)) < 0, `${W}: no em dashes`);
    if (tier === 'elite') t.ok(typeof e.taunt === 'string' && e.taunt.length > 8 && e.enrage && e.enrage.name, `${W}: a versus-card taunt and a phase two`);
  }
  const C = ENEMIES.collector;
  t.ok(C.rival === true && C.digest >= 10 && Array.isArray(C.noAffix) && C.noAffix.includes('greedy'), 'the Claw Collector: rival claw, keeps what it takes, never Greedy on top');
  t.ok(ENEMIES.mole.moves.find(m => m.k === 'bury').n === 1 && ENEMIES.ghost.moves.find(m => m.k === 'vanish').n === 3, 'bury 1 item, vanish 3');
  for (const id of ['tickler', 'jelly', 'magbat']) t.ok(ENEMIES[id].moves.find(m => m.k === KIND[id]).v === 1, `${id}: its trick lasts one turn`);
});

// VAULT (round 5): the Prize Vault's cosmetics, prices and the Vault Capsule.
t.test('vault: the cosmetics table', () => {
  const { VAULT, VAULT_CATS, VAULT_DEFAULT, COSMETICS, COSMETIC_IDS } = DATA;
  t.ok(VAULT && COSMETICS && Array.isArray(COSMETIC_IDS), 'DATA.VAULT, COSMETICS, COSMETIC_IDS');
  t.eq(VAULT_CATS.map(c => c.id).join(','), 'skin,paint,marquee,outfit,trail', 'five shelves in order');
  const per = {};
  for (const id of COSMETIC_IDS) {
    const c = COSMETICS[id], W = 'cosmetic ' + id;
    per[c.cat] = (per[c.cat] || 0) + 1;
    t.eq(c.id, id, W + ': id matches');
    t.ok(VAULT_CATS.some(k => k.id === c.cat), W + ': a known category');
    t.ok(['c', 'u', 'r', 'l'].includes(c.rarity), W + ': a rarity');
    t.ok(typeof c.name === 'string' && c.name.length >= 3 && c.name.length <= 20, W + ': a name that fits a card');
    t.ok(typeof c.text === 'string' && c.text.length >= 12 && c.text.length <= 80, W + ': one line of copy');
    t.ok(c.look && typeof c.look === 'object', W + ': look fields for the renderer');
    t.ok(JSON.stringify(c).indexOf(String.fromCharCode(0x2014)) < 0, W + ': no em dashes');
    if (c.ach) t.ok(!!DATA.ACHIEVEMENTS[c.ach], W + ': its sticker exists');
  }
  t.ok(per.skin >= 8 && per.skin <= 10, `8 to 10 cabinet skins (${per.skin})`);
  t.ok(per.paint >= 8 && per.paint <= 10, `8 to 10 claw paints (${per.paint})`);
  t.ok(per.marquee >= 5 && per.trail >= 5, 'marquees and trails');
  for (const ch of CHARS) t.eq(DATA.vaultList('outfit', ch).length, 2, `two outfits for ${ch}`);
  for (const cat of ['skin', 'paint', 'marquee', 'trail']) {
    const d = COSMETICS[VAULT_DEFAULT[cat]];
    t.ok(d && d.cat === cat && d.free && DATA.vaultPrice(d.id) === 0 && DATA.vaultHow(d.id) === 'own', `the default ${cat} is owned, free and never sold`);
  }
  for (const cat of ['skin', 'paint', 'marquee', 'trail']) t.ok(DATA.vaultList(cat).some(id => COSMETICS[id].rarity === 'l'), `a legendary (rainbow) ${cat}`);
  const skins = DATA.vaultList('skin').map(id => COSMETICS[id].look);
  t.ok(new Set(skins.map(l => l.frame + l.panel + l.pp)).size === skins.length, 'every skin has its own frame and panel');
  t.ok(COSMETICS.skin_gold && COSMETICS.skin_gold.ach === 'mega', 'the Gold Jackpot cabinet comes from the Mega Jackpot sticker');
  t.eq(DATA.vaultForSticker('mega').join(','), 'skin_gold', 'vaultForSticker(mega)');
  t.eq(DATA.vaultForSticker('first_prize').length, 0, 'most stickers carry no prize');
});
t.test('vault: prices and how each prize is won', () => {
  const { VAULT, COSMETICS } = DATA;
  for (const id of DATA.COSMETIC_IDS) {
    const c = COSMETICS[id], how = DATA.vaultHow(id), p = DATA.vaultPrice(id);
    if (how === 'buy') t.eq(p, VAULT.PRICE[c.rarity], id + ': priced by rarity');
    else t.eq(p, 0, id + ': not for sale (' + how + ')');
    if (c.rarity === 'l' && !c.ach) t.eq(how, 'capsule', id + ': a legendary only comes from a capsule');
  }
  t.ok(VAULT.PRICE.c < VAULT.PRICE.u && VAULT.PRICE.u < VAULT.PRICE.r && VAULT.PRICE.r < VAULT.PRICE.l, 'rarer costs more');
  t.ok(VAULT.CAP_PRICE > VAULT.PRICE.c && VAULT.CAP_PRICE < VAULT.PRICE.u, 'a capsule costs between a common and an uncommon');
  t.ok(VAULT.DUPE.c < VAULT.CAP_PRICE && VAULT.DUPE.l > VAULT.CAP_PRICE, 'a dupe refunds less than a capsule, a legendary dupe more');
  t.eq(VAULT.SHARE, 1, 'every ticket won banks in the vault');
  const pool = DATA.vaultPool();
  t.ok(pool.length >= 30 && pool.every(id => !COSMETICS[id].free && !COSMETICS[id].ach), 'the capsule pool: no defaults, no sticker prizes');
});
t.test('vault: the Vault Capsule odds, dupes and the pity', () => {
  const { VAULT, COSMETICS } = DATA;
  // odds by tier, with nothing owned (a fresh profile)
  const cnt = { c: 0, u: 0, r: 0, l: 0 }, N = 20000, rng = U.rng(4242);
  let bad = 0;
  for (let i = 0; i < N; i++) { const r = DATA.vaultRoll(rng, {}, 0); cnt[r.tier]++; if (!(r.tier === COSMETICS[r.id].rarity && !r.dupe && r.tix === 0)) bad++; }
  t.eq(bad, 0, 'every roll is a real prize of its tier, never a dupe on a fresh profile');
  const tot = Object.values(VAULT.CAP_W).reduce((s, v) => s + v, 0);
  for (const k of ['c', 'u', 'r', 'l']) t.near(cnt[k] / N, VAULT.CAP_W[k] / tot, 0.012, `tier ${k} lands about ${Math.round(VAULT.CAP_W[k] * 100 / tot)}% of the time`);
  // deterministic by the rng
  const a = DATA.vaultRoll(U.rng(9), {}, 3), b = DATA.vaultRoll(U.rng(9), {}, 3);
  t.eq(JSON.stringify(a), JSON.stringify(b), 'same rng, same capsule');
  // the reveal climbs to the tier
  const T = ['c', 'u', 'r', 'l'];
  for (let i = 0; i < 300; i++) {
    const r = DATA.vaultRoll(rng, {}, 0);
    const ok = T.indexOf(r.tier0) <= T.indexOf(r.tier) && (r.ups.length ? r.ups[r.ups.length - 1] === r.tier : r.tier0 === r.tier) && r.ups.every((x, j) => T.indexOf(x) === T.indexOf(r.tier0) + j + 1);
    if (!ok) { t.ok(false, 'tier0 and ups climb to the tier: ' + JSON.stringify(r)); break; }
  }
  // own everything: every roll is a dupe that pays tickets
  const all = {};
  for (const id of DATA.vaultPool()) all[id] = 1;
  let dupes = 0, pay = 0;
  for (let i = 0; i < 400; i++) { const r = DATA.vaultRoll(rng, all, 0); if (r.dupe) { dupes++; pay += r.tix === VAULT.DUPE[r.tier] ? 1 : 0; } }
  t.eq(dupes, 400, 'with everything owned, every capsule is a dupe');
  t.eq(pay, 400, 'a dupe pays DUPE[tier] tickets');
  // fresh prizes come first most of the time
  const half = {};
  DATA.vaultPool('c').slice(0, 3).forEach(id => { half[id] = 1; });
  let fresh = 0, commons = 0;
  for (let i = 0; i < 2000; i++) { const r = DATA.vaultRoll(rng, half, 0); if (r.tier === 'c') { commons++; if (!half[r.id]) fresh++; } }
  t.ok(fresh / commons > 0.7, `unowned prizes are preferred (${Math.round(fresh * 100 / commons)}% fresh)`);
  // the pity: PITY - 1 capsules without a legendary, then one is
  const p = DATA.vaultRoll(U.rng(1), {}, VAULT.PITY - 1);
  t.ok(p.tier === 'l' && p.lucky && p.pity === 0, 'the pity capsule is a legendary and resets the count');
  const q = DATA.vaultRoll(U.rng(1), {}, 2);
  t.ok(q.pity === (q.tier === 'l' ? 0 : 3), 'the count climbs by one below a legendary');
  const allL = {};
  DATA.vaultPool('l').forEach(id => { allL[id] = 1; });
  t.ok(!DATA.vaultRoll(U.rng(1), allL, VAULT.PITY + 5).lucky, 'no pity once every legendary is owned');
});

// ---------------------------------------------------------------- PETS (round 5)
t.test('pets: the table, levels, the shop offer, repairs and card lines', () => {
  const { PETS, PET_IDS, PET_XP, PET_MAX, PET_GAIN, PET_SHOP } = DATA;
  t.ok(PETS && Array.isArray(PET_IDS), 'DATA.PETS and PET_IDS exist');
  t.eq(PET_IDS.length, 8, 'eight pets');
  t.eq(JSON.stringify(PET_IDS.slice().sort()), JSON.stringify(Object.keys(PETS).sort()), 'PET_IDS lists every pet');
  const acts = new Set();
  for (const id of PET_IDS) {
    const p = PETS[id], L = 'pet ' + id;
    t.eq(p.id, id, L + ': id');
    t.ok(typeof p.name === 'string' && p.name.length >= 3 && p.name.length <= 16, L + ': name');
    t.ok(['turn', 'lift', 'grab'].includes(p.when), L + ': when');
    t.ok(typeof p.act === 'string' && !acts.has(p.act), L + ': its own action (' + p.act + ')');
    acts.add(p.act);
    t.ok(typeof p.verb === 'string' && p.verb === p.verb.toUpperCase(), L + ': verb');
    t.ok(Array.isArray(p.names) && p.names.length >= 3 && p.names.every(n => typeof n === 'string' && n.length <= 12), L + ': names');
    t.ok(Array.isArray(p.quips) && p.quips.length >= 2, L + ': quips');
    t.ok(/^#[0-9a-f]{6}$/i.test(p.col) && /^#[0-9a-f]{6}$/i.test(p.col2), L + ': colours');
    t.ok(typeof p.text === 'string' && p.text.length > 20 && p.text.length < 110, L + ': text');
    for (const s of [p.name, p.text, ...p.names, ...p.quips]) t.ok(!s.includes(String.fromCharCode(0x2014)) && !/\bink\b/i.test(s), L + ': no em dash, no ink: ' + s);
  }
  t.eq(PET_XP.length, PET_MAX, 'an xp step per level');
  const lv = [[0, 1], [11, 1], [12, 2], [29, 2], [30, 3], [59, 3], [60, 4], [99, 4], [100, 5], [9999, 5], [-5, 1], [NaN, 1]];
  for (const [xp, want] of lv) t.eq(DATA.petLevel(xp), want, `petLevel(${xp})`);
  t.eq(DATA.petNext(100), null, 'no next level at the top');
  const nx = DATA.petNext(20);
  t.ok(nx.need === 10 && nx.into === 8 && nx.span === 18, 'petNext: need, into, span');
  t.eq(DATA.petPow(1), 1, 'Lv 1 power x1');
  t.ok(Math.abs(DATA.petPow(5) - 1.8) < 1e-9, 'Lv 5 power x1.8');
  t.ok(DATA.petUses(1) === 1 && DATA.petUses(2) === 1 && DATA.petUses(3) === 2 && DATA.petUses(5) === 2, 'one use a turn, two from Lv 3');
  t.ok(DATA.petEgg(1).need === 3 && DATA.petEgg(3).need === 2 && DATA.petEgg(5).gold > DATA.petEgg(1).gold, 'the egg: a jackpot at first, a double from Lv 3, richer with levels');
  t.ok(DATA.petGlow(5) > DATA.petGlow(1), 'the spotlight pays more with levels');
  const L = DATA.petLook(1), L4 = DATA.petLook(4), L5 = DATA.petLook(5);
  t.ok(!L.scarf && !L.crown && DATA.petLook(2).scarf && L4.crown && !L4.aura && L5.aura, 'the looks: scarf Lv 2, crown Lv 4, aura Lv 5');
  t.ok(PET_GAIN.item >= 1 && PET_GAIN.boss > PET_GAIN.elite && PET_GAIN.elite > PET_GAIN.fight && PET_GAIN.treat > 0, 'xp gains');
  t.ok(PET_SHOP.offer === 3 && PET_SHOP.treat > 0 && PET_SHOP.swap > 0 && PET_SHOP.treats >= 1, 'the shop dials');
  // the offer: three different pets, never the one you have, the same for the same seed
  for (let s = 1; s <= 60; s++) {
    const have = PET_IDS[s % 8];
    const o = DATA.petOffer(U.rng(s), have, 3), o2 = DATA.petOffer(U.rng(s), have, 3);
    t.ok(o.length === 3 && new Set(o).size === 3 && !o.includes(have) && o.every(id => PETS[id]), `offer ${s}: three new pets`);
    t.eq(JSON.stringify(o), JSON.stringify(o2), `offer ${s}: deterministic`);
  }
  const seen = new Set(); for (let s = 1; s <= 60; s++) DATA.petOffer(U.rng(s), null, 3).forEach(id => seen.add(id));
  t.eq(seen.size, 8, 'every pet shows up in some shop');
  // names, a new pet, repairs
  for (const id of PET_IDS) t.ok(PETS[id].names.includes(DATA.petName(id, 12345)), id + ': a name from its list');
  t.eq(DATA.petName('hamster', 7), DATA.petName('hamster', 7), 'names are stable by seed');
  const p = DATA.petNew('cat', 99);
  t.ok(p.id === 'cat' && p.xp === 0 && p.lv === 1 && PETS.cat.names.includes(p.name), 'petNew');
  t.eq(DATA.petNew('dragon', 1), null, 'no unknown pets');
  for (const junk of [null, 5, 'cat', {}, { id: 'unicorn' }, []]) t.eq(DATA.petFix(junk), null, 'petFix drops ' + JSON.stringify(junk));
  const fx = DATA.petFix({ id: 'goose', xp: '65', lv: 1, name: '' });
  t.ok(fx.xp === 65 && fx.lv === 4 && PETS.goose.names.includes(fx.name) && fx.fed === 0, 'petFix repairs the level, the name, the counters');
  t.eq(DATA.petFix({ id: 'mouse', xp: -4 }).xp, 0, 'petFix: no negative xp');
  // the card line carries the level's numbers
  t.ok(/9 gold, 2 tickets/.test(DATA.petText('goose', 3)) && /Twice a turn/.test(DATA.petText('goose', 3)), 'the goose card at Lv 3');
  t.ok(DATA.petText('firefly', 1).includes(DATA.petGlow(1) + ' bonus gold'), 'the firefly card names its bonus');
  t.ok(!/Twice/.test(DATA.petText('hamster', 1)), 'one use at Lv 1');
  t.ok(!SRC.slice(SRC.indexOf('PETS (companion pets'), SRC.indexOf('/PETS')).includes('Math.random'), 'no Math.random in the pets block');
});

// ---------------------------------------------------------------- round 6: relic sets, the boon draft, the Compactor
t.test('sets: ten sets of three pool relics, one set per relic, two bonuses each', () => {
  const S = DATA.SETS, ids = DATA.SET_IDS;
  t.ok(ids.length >= 8 && ids.length <= 10, `8..10 sets [${ids.length}]`);
  const seen = {};
  for (const id of ids) {
    const s = S[id], W = `set ${id}`;
    t.eq(s.id, id, `${W}: key`);
    t.ok(typeof s.name === 'string' && s.name.length > 3 && Array.from(s.icon).length <= 2 && isHex(s.color), `${W}: name, icon, colour`);
    t.eq(s.pieces.length, 3, `${W}: three pieces`);
    for (const r of s.pieces) {
      t.ok(!!RELICS[r] && !RELICS[r].starter && ['c', 'u', 'r'].includes(RELICS[r].rarity), `${W}: ${r} is a pool relic`);
      t.ok(!seen[r], `${W}: ${r} sits in one set only`);
      seen[r] = id;
      t.eq(DATA.setOf(r), id, `${W}: setOf(${r})`);
    }
    t.ok(ARCHS.includes(s.kw), `${W}: an archetype`);
    for (const n of [2, 3]) {
      const fx = DATA.SET_FX[`set:${id}:${n}`], W2 = `${W} ${n}/3`;
      t.ok(fx && fx.set === id && fx.n === n && fx.name && fx.text.length > 12, `${W2}: a bonus with words`);
      t.ok(!!(fx.hooks || fx.rules || fx.mods || fx.loot || fx.pet), `${W2}: does something`);
      t.ok(fx.proc && fx.proc === fx.proc.toUpperCase() && fx.proc.length <= 16, `${W2}: proc label [${fx.proc}]`);
      for (const k in fx.hooks || {}) t.ok(HOOKS.includes(k) && typeof fx.hooks[k] === 'function', `${W2}: hook ${k}`);
      for (const k in fx.rules || {}) t.ok(RULES.includes(k), `${W2}: rule ${k}`);
      for (const k in fx.mods || {}) t.ok(MODS.includes(k), `${W2}: mod ${k}`);
      t.ok(!RELICS[fx.id], `${W2}: not a relic of its own (never in a pool or the Prizedex relics)`);
    }
    t.ok(JSON.stringify([s.name, s.two, s.three]).indexOf(String.fromCharCode(0x2014)) < 0, `${W}: no em dashes`);
  }
  t.eq(DATA.setOf('grip_tape'), null, 'a relic outside every set');
  // the new pet relics are pool relics in The Hungry Pack
  for (const id of R6_RELICS) t.ok(RELICS[id] && DATA.relicPool(RELICS[id].rarity).includes(id) && DATA.setOf(id) === 'pack', `${id}: in the pool and the Hungry Pack`);
  t.ok(RELICS.dog_whistle.pet.uses === 1 && RELICS.chew_toy.pet.xp > 0, 'the pet relics carry their pet stats');
});

t.test('sets: counts, live bonuses at 2 and 3 (not 1), the card tag and the pull', () => {
  const run = (relics, o) => Object.assign({ relics }, o || {});
  t.eq(DATA.setFxIds(run(['venom_gland'])).join(), '', '1 piece: no bonus');
  t.eq(DATA.setFxIds(run(['venom_gland', 'grip_tape', 'contagion'])).join(), 'set:poison:2', '2 pieces: the small bonus');
  t.eq(DATA.setFxIds(run(['festering_jar', 'venom_gland', 'contagion'])).join(), 'set:poison:2,set:poison:3', '3 pieces: both');
  t.eq(DATA.setFxIds(['venom_gland', 'contagion', 'venom_gland']).join(), 'set:poison:2', 'a duplicate counts once; a bare list works');
  t.eq(DATA.setFxIds(run(['venom_gland', 'contagion'], { noSets: true })).join(), '', 'noSets opts out');
  t.eq(DATA.setFxIds(run([], { boon: { grabs: 2 } })).join(), 'boon:grabs', 'the boon warm-up rides along');
  t.eq(DATA.setFxIds(run([], { boon: { grabs: 0 } })).join(), '', 'and runs out');
  t.eq(DATA.setFxIds(null).join(), '', 'null is empty');
  const P = DATA.setProgress(['kettle_helm', 'castle_walls', 'snow_globe']);
  t.eq(P.map(p => p.id + ':' + p.n + ':' + p.missing.join('+')).join(), 'frost:1:cold_snap+permafrost_core,fortress:2:battering_ram', 'progress lists the sets held and what is missing');
  const tg = DATA.setTagOf('castle_walls', ['kettle_helm', 'battering_ram']);
  t.ok(tg.n === 3 && tg.completes && tg.text === '3/3 Iron Fortress', 'the card tag counts the piece you would take: ' + tg.text);
  t.ok(DATA.setTagOf('castle_walls', []).text === '1/3 Iron Fortress' && !DATA.setTagOf('castle_walls', []).completes, 'a first piece');
  t.eq(DATA.setTagOf('castle_walls', ['castle_walls']).n, 1, 'an owned piece is not counted twice');
  t.eq(DATA.setTagOf('grip_tape', []), null, 'no tag outside a set');
  t.eq(DATA.setWant(run(['venom_gland']), ['contagion', 'grip_tape', 'festering_jar', 'venom_gland']).join(), 'contagion,festering_jar', 'setWant: the missing pieces of a started set');
  t.eq(DATA.setWant(run(['venom_gland', 'contagion', 'festering_jar']), ['snow_globe']).join(), '', 'nothing for a set not started');
  // the pull: a run with one piece meets its set's other pieces more often
  const pool = DATA.relicPool();
  const one = run(['kettle_helm']);
  let plain = 0, pulled = 0;
  for (let s = 1; s <= 1500; s++) {
    if (['battering_ram', 'castle_walls'].includes(DATA.pickRelic(U.rng(s), pool))) plain++;
    if (['battering_ram', 'castle_walls'].includes(DATA.pickRelic(U.rng(s), pool, one))) pulled++;
  }
  t.ok(pulled > plain * 4, `the set pull finds the missing pieces (${plain} -> ${pulled} of 1500)`);
  t.eq(DATA.pickRelic(U.rng(9), pool, one), DATA.pickRelic(U.rng(9), pool, one), 'deterministic');
  const none = run(['grip_tape']);
  let same = 0;
  for (let s = 1; s <= 200; s++) if (DATA.pickRelic(U.rng(s), pool, none) === DATA.pickRelic(U.rng(s), pool, Object.assign({}, none))) same++;
  t.eq(same, 200, 'a run without set pieces draws as before');
  t.ok(DATA.SET_PULL > 0 && DATA.SET_PULL < 0.5, 'a gentle pull');
});

t.test('sets: bonus hooks survive without COMBAT and go through its helpers with it', () => {
  const calls = [];
  for (const id of Object.keys(DATA.SET_FX)) {
    const F = mockF(), before = JSON.stringify(F);
    let threw = null;
    try { runHooks(DATA.SET_FX[id], F); } catch (e) { threw = e; }
    t.ok(!threw, `${id}: no COMBAT, no throw ${threw || ''}`);
    t.eq(JSON.stringify({ ...F, rs: undefined }), JSON.stringify({ ...JSON.parse(before), rs: undefined }), `${id}: no mutation without COMBAT`);
  }
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', src, v]); return v; },
    status: (F, who, s, v) => { calls.push(['status', s, v]); return v; },
    heal: (F, who, v) => { calls.push(['heal', v]); return v; },
    addJunk: (F, id, n) => { calls.push(['addJunk', id, n]); return []; },
    copy: (F, tag) => { calls.push(['copy', tag]); return null; },
    tickets: (F, v) => { calls.push(['tickets', v]); return v; },
    gainGold: () => 0, gold: () => 100, emit: (F, ev) => { calls.push(['emit', ev.t, ev.id]); return ev; },
  };
  try {
    for (const id of Object.keys(DATA.SET_FX)) {
      const fx = DATA.SET_FX[id];
      if (!fx.hooks) continue;
      calls.length = 0;
      const F = mockF(), g0 = F.player.grabs;
      let threw = null;
      try { runHooks(fx, F); if (fx.hooks.onStatus) fx.hooks.onStatus(F, F.enemies[0], 'poison', 2); } catch (e) { threw = e; }
      t.ok(!threw, `${id}: hooks run with COMBAT ${threw || ''}`);
      t.ok(calls.length > 0 || F.player.grabs !== g0, `${id}: hooks do something`);
      t.ok(calls.every(c => c[0] !== 'damage' || c[1] === null), `${id}: set damage has no attacker`);
      t.ok(calls.every(c => c[0] !== 'status' || STATUS[c[1]]), `${id}: statuses exist`);
      t.ok(calls.every(c => c[0] !== 'addJunk' || ITEMS[c[1]].rarity === 'junk'), `${id}: junk exists`);
      t.ok(calls.every(c => c[0] !== 'emit' || ((c[1] === 'proc' && c[2] === id) || c[1] === 'grab')), `${id}: its procs name the bonus`);
    }
  } finally { delete globalThis.COMBAT; }
  t.ok(!SRC.slice(SRC.indexOf('SETS (relic sets'), SRC.indexOf('/SETS')).includes('Math.random'), 'no Math.random in the sets block');
});

t.test('boons: three cards, one per slot, deterministic by seed and Tilt, spicier with Tilt', () => {
  const B = DATA.BOONS;
  t.ok(DATA.BOON_IDS.length >= 12, 'a dozen boons or more');
  for (const id of DATA.BOON_IDS) {
    const b = B[id];
    t.ok(b.id === id && DATA.BOON_SLOTS.includes(b.slot) && b.name && b.text && isHex(b.color) && b.tilt[0] <= b.tilt[1], `boon ${id}: fields`);
    t.ok(b.slot !== 'trade' || (typeof b.cost === 'string' && b.cost.length > 5), `boon ${id}: a trade says its cost`);
    t.ok(JSON.stringify(b).indexOf(String.fromCharCode(0x2014)) < 0, `boon ${id}: no em dashes`);
  }
  const ctx = { relics: { c: DATA.relicPool('c'), u: DATA.relicPool('u'), r: DATA.relicPool('r'), boss: DATA.relicPool('boss') }, pets: DATA.PET_IDS.slice() };
  const a = DATA.boonOffer(1234, 0, ctx), b = DATA.boonOffer(1234, 0, ctx);
  t.eq(JSON.stringify(a), JSON.stringify(b), 'the same seed and Tilt deal the same cards');
  t.eq(a.map(o => o.slot).join(), 'gift,boost,trade', 'a gift, a boost and a trade');
  const tiltOf = {};
  let differ = 0, seedsDiffer = new Set();
  for (let s = 1; s <= 300; s++) {
    for (const tl of [0, 3, 6, 9]) {
      const o = DATA.boonOffer(s, tl, ctx);
      for (const x of o) {
        t.ok(B[x.id] && tl >= B[x.id].tilt[0] && tl <= B[x.id].tilt[1], `seed ${s} Tilt ${tl}: ${x.id} is allowed`);
        (tiltOf[tl] = tiltOf[tl] || new Set()).add(x.id);
        for (const r of x.relics || []) t.ok(!!RELICS[r], `seed ${s}: ${x.id} rolls a real relic`);
        if (x.id === 'setpiece') t.ok(x.relics.length === 1 && DATA.setOf(x.relics[0]) && ['c', 'u'].includes(RELICS[x.relics[0]].rarity), 'Starter Set is a c/u set piece');
        if (x.id === 'favor' || x.id === 'pact') t.ok(RELICS[x.relics[0]].rarity === 'r', `${x.id}: a rare`);
        if (x.id === 'shark' || x.id === 'devil') t.eq(RELICS[x.relics[0]].rarity, 'boss', `${x.id}: a boss relic`);
        if (x.id === 'glassjaw') t.ok(x.relics.length === 2 && x.relics[0] !== x.relics[1], 'Glass Jaw: two different rares');
        if (x.id === 'pet') t.ok(DATA.PETS[x.pet], 'Pet Pal names its pet');
      }
      seedsDiffer.add(o.map(x => x.id).join());
    }
    if (JSON.stringify(DATA.boonOffer(s, 0, ctx)) !== JSON.stringify(DATA.boonOffer(s, 9, ctx))) differ++;
  }
  t.ok(seedsDiffer.size >= 20, `many different deals over the seeds [${seedsDiffer.size}]`);
  t.ok(differ > 280, `the Tilt changes the deal [${differ}/300]`);
  const trades = (tl) => [...tiltOf[tl]].filter(id => B[id].slot === 'trade').sort().join();
  t.eq(trades(0), 'pact,pockets', 'Tilt 0 trades: Blood Pact, Heavy Pockets');
  t.eq(trades(9), 'devil,glassjaw,shark', 'Tilt 9 trades: the spicy ones only');
  t.ok(tiltOf[0].has('favor') && !tiltOf[3].has('favor') && !tiltOf[9].has('favor'), 'a free rare only at low Tilt');
  const empty = DATA.boonOffer(5, 9, { relics: {}, pets: [] });
  t.ok(empty.length === 3 && empty.every(o => !o.relics || Array.isArray(o.relics)), 'empty pools deal empty relic lists, never undefined ids');
});

t.test('compactor: the recipe rules', () => {
  const I = (id, plus) => ({ id, plus: !!plus });
  const rare = DATA.pool('r'), unc = DATA.pool('u'), com = DATA.pool('c');
  t.eq(DATA.cmpRule([I('rusty_sword'), I('rusty_sword')]).ok, false, 'two items: refused');
  t.eq(DATA.cmpRule([I('rusty_sword'), I('rusty_sword'), I('nope')]).ok, false, 'an unknown item: refused');
  const same = DATA.cmpRule([I('rusty_sword'), I('rusty_sword'), I('rusty_sword', true)]);
  t.ok(same.ok && same.kind === 'plus' && same.id === 'rusty_sword', 'three of a kind: its plus copy');
  t.eq(DATA.cmpRoll(U.rng(1), [I('rusty_sword'), I('rusty_sword'), I('rusty_sword')], 'knight').plus, true, 'rolled as the upgraded copy');
  t.eq(DATA.cmpRule([I('rusty_sword', true), I('rusty_sword', true), I('rusty_sword', true)]).kind, 'rarity', 'three plus copies: the rarity rule instead');
  const rr = (ids) => DATA.cmpRule(ids.map(x => I(x))).rar;
  t.eq(rr([com[0], com[1], com[2]]), 'u', 'c c c -> uncommon');
  t.eq(rr([com[0], com[1], unc[0]]), 'u', 'c c u -> uncommon (the middle one, one step up)');
  t.eq(rr([com[0], unc[0], unc[1]]), 'r', 'c u u -> rare');
  t.eq(rr(['rock', 'slag', rare[0]]), 'c', 'junk junk r -> common (no cheap legendaries)');
  t.eq(rr([rare[0], rare[1], unc[0]]), 'l', 'r r u -> legendary');
  const L = DATA.pool('l');
  t.eq(rr([L[0], L[1], L[2]]), 'l', 'legendaries stay legendary');
  // rolls: the next rarity, a shared keyword, never an input, never junk / starter / bag / small
  let shared = 0, n = 0;
  for (let s = 1; s <= 400; s++) {
    const r = U.rng(s);
    const pick = [com[s % com.length], com[(s * 7) % com.length], unc[(s * 3) % unc.length]].map(x => I(x));
    if (new Set(pick.map(p => p.id)).size < 3) continue;
    const res = DATA.cmpRoll(r, pick, ['knight', 'alchemist', 'rogue', 'gambler'][s % 4]);
    const d = ITEMS[res.id];
    n++;
    t.ok(res && d && d.rarity === 'u' && !res.plus, `seed ${s}: an uncommon comes out`);
    t.ok(!d.starter && !d.bag && d.rarity !== 'junk' && !d.tags.includes('small'), `seed ${s}: a real reward item`);
    t.ok(!pick.some(p => p.id === res.id), `seed ${s}: not one of the inputs`);
    const kws = new Set(pick.flatMap(p => DATA.kwIds(ITEMS[p.id])));
    if (DATA.kwIds(d).some(k => kws.has(k))) shared++;
  }
  t.ok(shared >= n * 0.95, `the result shares a keyword with the inputs (${shared}/${n})`);
  const p3 = [I('toxic_vial'), I('venom_dart'), I('rusty_sword')];
  t.eq(JSON.stringify(DATA.cmpRoll(U.rng(77), p3, 'alchemist')), JSON.stringify(DATA.cmpRoll(U.rng(77), p3, 'alchemist')), 'deterministic by rng');
  t.eq(DATA.cmpRoll(U.rng(1), [I('rusty_sword')], 'knight'), null, 'a refused rule rolls nothing');
});

// ---------------------------------------------------------------- round 7: evolutions and pet synergies
// DESIGN.md "Evolutions and pet synergies (round 7)": item + relic recipes,
// the evolved defs (hidden from every pool), their auras, the pet
// synergies, the new combos and the two stickers.
t.test('round 7: evolution recipes and the evolved items', () => {
  const ids = DATA.EVO_IDS, EV = DATA.EVOLVED, REC = DATA.EVOLUTIONS;
  t.ok(ids.length >= 12 && ids.length <= 16, `12 to 16 recipes [${ids.length}]`);
  const froms = new Set(), relics = new Set(), names = new Set(Object.keys(ITEMS).map(id => ITEMS[id].name));
  const pooled = new Set(DATA.pool()), dexItems = new Set(DATA.dexEntries().items);
  for (const id of ids) {
    const r = REC[id], d = EV[id], W = `evo ${id}`;
    t.ok(r && r.id === id && r.to === id && d && d.id === id, `${W}: recipe and def`);
    const base = ITEMS[r.from];
    t.ok(base && Object.keys(ITEMS).includes(r.from) && base.rarity !== 'junk' && base.plus, `${W}: its base ${r.from} is a real item with a plus`);
    t.ok(RELICS[r.relic] && !RELICS[r.relic].starter && ['c', 'u', 'r'].includes(RELICS[r.relic].rarity), `${W}: its relic ${r.relic} is a pool relic`);
    t.ok(!froms.has(r.from), `${W}: one recipe per base item`);
    froms.add(r.from); relics.add(r.relic);
    t.eq(DATA.evoOf(r.from), r, `${W}: evoOf(base) finds it`);
    // the def: an item like any other, reachable by id, never listed
    t.ok(ITEMS[id] === d && !Object.keys(ITEMS).includes(id) && !DATA.ITEM_IDS, `${W}: ITEMS[id] finds it, Object.keys(ITEMS) does not list it`);
    t.ok(!pooled.has(id) && !dexItems.has(id), `${W}: never in a reward pool or the item Prizedex`);
    t.ok(d.evolved === true && d.rarity === 'l' && !d.plus && d.cost === 0, `${W}: evolved, legendary, no plus`);
    t.ok(typeof d.name === 'string' && d.name.length > 3 && !names.has(d.name), `${W}: its own name`);
    names.add(d.name);
    t.ok(ITEM_ART.includes(d.art) && isHex(d.color) && isHex(d.color2) && isHex(d.glow), `${W}: art key and colours`);
    t.ok(d.tags.every(x => TAGS.includes(x)) && !d.tags.includes('junk'), `${W}: tags allowed`);
    t.ok(['enemy', 'all', 'self', 'random', 'none'].includes(d.target), `${W}: target`);
    checkShape(d.shape, W, false);
    checkFx(d.fx, W);
    t.ok(d.fx.length >= 1, `${W}: has effects`);
    const s = DATA.itemText(d, false);
    t.ok(!/[{}]/.test(s) && s.length > 10, `${W}: text fully substituted [${s}]`);
    t.ok(DATA.keywords(d).length >= 1, `${W}: keyword chips`);
    // the aura: a relic-shaped def
    const a = DATA.EVO_FX[d.auraId];
    t.ok(a && a.id === 'evo:' + id && a.name === d.auraName && a.text === d.auraText && a.proc && a.icon && isHex(a.color), `${W}: its aura def`);
    t.ok(!!(a.hooks || a.rules), `${W}: the aura does something`);
    for (const k of Object.keys(a.hooks || {})) t.ok(HOOKS.includes(k), `${W}: aura hook ${k} is a known hook`);
    for (const k of Object.keys(a.rules || {})) t.ok(RULES.includes(k), `${W}: aura rule ${k} is a known rule`);
    t.ok(JSON.stringify([r, d.text, d.auraText, d.name]).indexOf(String.fromCharCode(0x2014)) < 0, `${W}: no em dashes`);
  }
  t.ok(relics.size >= 12, `the recipes use many different relics [${relics.size}]`);
  for (const ch of ['knight', 'alchemist', 'rogue', 'gambler']) t.ok(DATA.CHARACTERS[ch].bin.some(x => DATA.evoOf(x)), `${ch}: a starter item can evolve`);
  // evoReady: only the right item, plus, relic, and a real bin item
  const r0 = REC.excalibur_claw;
  const inst = (o) => Object.assign({ uid: 'e1', id: 'rusty_sword', plus: true }, o || {});
  t.eq(DATA.evoReady(inst(), ['trophy_rack']), r0, 'Rusty Sword+ and the Trophy Rack: ready');
  t.eq(DATA.evoReady(inst({ plus: false }), ['trophy_rack']), null, 'not upgraded: not ready');
  t.eq(DATA.evoReady(inst(), ['festering_jar']), null, 'the wrong relic: not ready');
  t.eq(DATA.evoReady(inst({ id: 'longsword' }), ['trophy_rack']), null, 'the wrong item: not ready');
  t.eq(DATA.evoReady(inst({ temp: true }), ['trophy_rack']), null, 'a fight copy: not ready');
  t.eq(DATA.evoReady(inst(), { relics: ['trophy_rack'] }), r0, 'a run works as the relic list');
  t.eq(DATA.evoReady(inst({ id: 'excalibur_claw' }), ['trophy_rack']), null, 'an evolved item never evolves again');
  for (const id of ids) {
    const r = REC[id];
    for (const other of ids.filter(x => x !== id).slice(0, 3)) t.eq(DATA.evoReady({ uid: 'q', id: r.from, plus: true }, [REC[other].relic].filter(x => x !== r.relic)), null, `${id}: another recipe's relic does not evolve it`);
    t.eq(DATA.evoReady({ uid: 'q', id: r.from, plus: true }, [r.relic]), r, `${id}: its own relic does`);
  }
  // auras ride the run's bin (unique, never a fight copy)
  const run = { bin: [{ id: 'excalibur_claw' }, { id: 'excalibur_claw' }, { id: 'nuke_pop', temp: true }, { id: 'rusty_sword' }, { id: 'midas_coin' }] };
  t.eq(DATA.evoAuraIds(run).join(), 'evo:excalibur_claw,evo:midas_coin', 'one aura per evolved id in the bin');
  t.eq(DATA.evoAuraIds(null).length, 0, 'null safe');
  // meta repair
  const fx0 = DATA.evoMetaFix({ seen: { excalibur_claw: 1, bogus: 1 }, made: '3', syn: -2, new: { excalibur_claw: 1, nuke_pop: 1 } });
  t.eq(JSON.stringify(fx0), JSON.stringify({ seen: { excalibur_claw: 1 }, made: 3, syn: 0, new: { excalibur_claw: 1 } }), 'meta.evo repaired: unknown ids and junk dropped');
  t.eq(JSON.stringify(DATA.evoMetaFix('junk')), JSON.stringify({ seen: {}, made: 0, syn: 0, new: {} }), 'a junk meta.evo is fresh');
});

t.test('round 7: the evolved auras with and without COMBAT', () => {
  const calls = [];
  for (const id of DATA.EVO_IDS) {
    const a = DATA.EVO_FX['evo:' + id];
    if (!a.hooks) continue;
    const F = mockF(), before = JSON.stringify(F);
    let threw = null;
    try { runHooks(a, F); } catch (e) { threw = e; }
    t.ok(!threw, `${id}: aura hooks, no COMBAT, no throw ${threw || ''}`);
    t.eq(JSON.stringify({ ...F, rs: undefined }), JSON.stringify({ ...JSON.parse(before), rs: undefined }), `${id}: no mutation without COMBAT`);
  }
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', src, v]); return v; },
    status: (F, who, s, v) => { calls.push(['status', s, v]); return v; },
    heal: (F, who, v) => { calls.push(['heal', v]); return v; },
    addJunk: (F, id, n) => { calls.push(['addJunk', id, n]); return []; },
    copy: (F, tag) => { calls.push(['copy', tag]); return null; },
    tickets: () => 0, gainGold: () => 0, gold: () => 100, emit: (F, ev) => { calls.push(['emit', ev.t, ev.id]); return ev; },
  };
  try {
    for (const id of DATA.EVO_IDS) {
      const a = DATA.EVO_FX['evo:' + id];
      if (!a.hooks) continue;
      calls.length = 0;
      const F = mockF();
      F.streak = 6;
      F.enemies.push({ uid: 'c', hp: 10, maxHp: 10, block: 0, status: {}, alive: true });
      F.enemies[1].status.burn = 3;
      let threw = null;
      try { runHooks(a, F); if (a.hooks.onStatus) a.hooks.onStatus(F, F.enemies[0], 'poison', 2); } catch (e) { threw = e; }
      t.ok(!threw, `${id}: aura hooks run with COMBAT ${threw || ''}`);
      t.ok(calls.length > 0, `${id}: the aura does something [${calls.map(c => c[0]).join(',')}]`);
      t.ok(calls.every(c => c[0] !== 'damage' || c[1] === null), `${id}: aura damage has no attacker`);
      t.ok(calls.every(c => c[0] !== 'status' || STATUS[c[1]]), `${id}: statuses exist`);
    }
    // the proc helper names the aura
    calls.length = 0;
    DATA.evoProc(mockF(), 'evo:nuke_pop', 'BOOM');
    t.ok(calls.some(c => c[0] === 'emit' && c[1] === 'proc' && c[2] === 'evo:nuke_pop'), 'evoProc emits a proc for the aura');
  } finally { delete globalThis.COMBAT; }
  const SRC7 = SRC.slice(SRC.indexOf('EVOLVE (round 7'), SRC.indexOf('/EVOLVE'));
  t.ok(SRC7.length > 1000 && !SRC7.includes('Math.random'), 'no Math.random in the evolve block');
});

t.test('round 7: pet synergies, the new combos and stickers', () => {
  const PS = DATA.PET_SYN;
  t.eq(Object.keys(PS).sort().join(), DATA.PET_IDS.slice().sort().join(), 'a synergy for every pet');
  for (const id of DATA.PET_IDS) {
    const s = PS[id];
    t.ok(s.id === id && s.name && s.icon && isHex(s.color) && s.need && s.text.length > 20 && typeof s.on === 'function', `${id}: synergy fields`);
    t.eq(DATA.petSynOn(id, { bin: [], relics: [], clawType: 'classic' }), null, `${id}: off on a bare run`);
    t.ok(JSON.stringify([s.name, s.text, s.need]).indexOf(String.fromCharCode(0x2014)) < 0, `${id}: no em dashes`);
  }
  const on = (id, run) => !!DATA.petSynOn(id, Object.assign({ bin: [], relics: [], clawType: 'classic' }, run));
  t.ok(on('hamster', { relics: ['beehive'] }) && !on('hamster', { relics: ['wizard_hat'] }), 'hamster: a Swarm relic');
  t.ok(on('parrot', { relics: ['wizard_hat'] }) && !on('parrot', { relics: ['beehive'] }), 'parrot: an Echo relic');
  t.ok(on('cat', { bin: [{ id: 'torch' }] }) && !on('cat', { bin: [{ id: 'femur' }] }), 'cat: a Pyro item in the bin');
  t.ok(on('octopus', { clawType: 'tri' }) && !on('octopus', { clawType: 'magnet' }), 'octopus: the Tri-Claw');
  t.ok(on('firefly', { relics: ['snow_globe'] }) && !on('firefly', { relics: ['bellows'] }), 'firefly: a Frost relic');
  t.ok(on('mouse', { clawType: 'magnet' }) && !on('mouse', { clawType: 'tri' }), 'mouse: the Magnet Crane');
  t.ok(on('raccoon', { relics: ['junkyard_king'] }) && !on('raccoon', { relics: ['recycling_bin'] }), 'raccoon: Junkyard King');
  t.ok(on('goose', { relics: ['dealers_visor', 'lucky_cat'] }) && !on('goose', { relics: ['dealers_visor'] }), 'goose: two High Rollers pieces');
  t.eq(DATA.petSynOn('nobody', {}), null, 'an unknown pet has none');
  // combos
  t.eq(DATA.EVO_COMBOS.length, 4, 'four new combos');
  const defs = (l) => l.map(id => ITEMS[id]);
  const fire = (l, ctx) => DATA.combosFor(defs(l), ctx).map(c => c.id);
  t.ok(fire(['excalibur_claw', 'femur', 'crisp_apple']).includes('legend_rising'), 'Legend Rising: an evolved item and two more');
  t.ok(!fire(['excalibur_claw', 'femur']).includes('legend_rising'), 'not with only two items');
  const two = fire(['excalibur_claw', 'plague_needle', 'femur']);
  t.ok(two.includes('twin_legends') && !two.includes('legend_rising'), `Twin Legends replaces Legend Rising (one family) [${two}]`);
  t.ok(DATA.COMBOS.twin_legends.secret && DATA.COMBOS.twin_legends.tier === 3, 'Twin Legends is a secret tier 3 recipe');
  t.ok(fire(['femur', 'bouncy_ball'], { pet: 'cat' }).includes('fetch') && !fire(['femur', 'bouncy_ball'], {}).includes('fetch') && !fire(['femur', 'bouncy_ball']).includes('fetch'), 'Fetch! needs a pet along');
  t.ok(fire(['quail_egg', 'lucky_penny'], { pet: 'goose' }).includes('nest_egg') && !fire(['quail_egg', 'lucky_penny'], { pet: 'cat' }).includes('nest_egg'), 'Nest Egg needs the Golden Goose');
  // stickers
  for (const id of ['evolved', 'best_buds']) t.ok(DATA.ACHIEVEMENTS[id] && DATA.ACH_IDS.includes(id), `${id} is on the board`);
  t.ok(DATA.achCheck({ kind: 'meta', meta: { evo: { made: 1 } } }, {}).includes('evolved'), 'It Evolved! after the first evolution');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { evo: { syn: 2 } } }, {}).includes('best_buds'), 'Best Buds after a pet synergy');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { evo: { made: 0, syn: 0 } } }, {}).some(x => x === 'evolved' || x === 'best_buds'), 'neither before');
});

// SEASON (round 7): seasonal events (DESIGN.md "Seasonal events (round 7)").
t.test('season: seasonAt by date, its edges and the new year', () => {
  const at = (d) => (DATA.seasonAt(d) || {}).id || null;
  t.ok(DATA.SEASONS && DATA.SEASONS.halloween && DATA.SEASONS.winter && DATA.SEASON_IDS.join() === 'halloween,winter', 'two seasons: halloween, winter');
  const cases = [['2026-09-30', null], ['2026-10-01', 'halloween'], ['2026-10-31', 'halloween'], ['2026-11-03', 'halloween'], ['2026-11-04', null],
    ['2026-12-09', null], ['2026-12-10', 'winter'], ['2026-12-31', 'winter'], ['2027-01-01', 'winter'], ['2027-01-06', 'winter'], ['2027-01-07', null], ['2027-07-04', null], ['2031-10-15', 'halloween']];
  for (const [d, want] of cases) t.eq(at(d), want, `seasonAt(${d})`);
  t.eq(at(new Date(2026, 9, 1, 0, 0, 1)), 'halloween', 'a Date reads its own calendar day (the first second)');
  t.eq(at(new Date(2026, 10, 3, 23, 59, 59)), 'halloween', '...and the last second');
  t.eq(at(new Date(2027, 0, 6, 12).getTime()), 'winter', 'a timestamp works too');
  t.eq(at(null), null, 'no date, no season');
  t.eq(at('junk'), null, 'an unreadable date, no season');
  // the countdown: the last day still has until midnight; a winter span that began last year
  const day = (y, m, d) => new Date(y, m - 1, d).getTime();
  t.eq(DATA.seasonLeft('halloween', '2026-11-03'), day(2026, 11, 4) - day(2026, 11, 3), 'the last day has a day left');
  t.eq(DATA.seasonLeft('halloween', new Date(2026, 10, 3, 18)), day(2026, 11, 4) - new Date(2026, 10, 3, 18).getTime(), 'the hours count down');
  t.eq(DATA.seasonLeft('halloween', '2026-11-04'), 0, 'nothing left after it');
  t.eq(DATA.seasonLeft('winter', '2026-12-31'), day(2027, 1, 7) - day(2026, 12, 31), 'winter on New Year\'s Eve ends on 7 January');
  t.eq(DATA.seasonLeft('winter', '2026-10-15'), 0, 'not winter in October');
  const w = DATA.seasonWindow('winter', '2027-01-02');
  t.eq(w.start, day(2026, 12, 10), 'a January day belongs to the span that began in December');
  t.eq(w.end, day(2027, 1, 7), '...and ends after 6 January');
  const nx = DATA.seasonWindow('halloween', '2026-12-01');
  t.eq(nx.start, day(2027, 10, 1), 'after the span, the window is next year\'s');
  t.eq(DATA.seasonWindow('nope', '2026-10-01'), null, 'an unknown season has none');
});
t.test('season: the Claw-o-ween content stays out of every year-round table and pool', () => {
  const H = DATA.SEASONS.halloween;
  t.ok(H.items.length >= 6 && H.items.length <= 8, `6 to 8 items (${H.items.length})`);
  t.eq(H.relics.length, 4, 'four relics');
  const keys = Object.keys(ITEMS), rkeys = Object.keys(RELICS), ekeys = Object.keys(ENEMIES);
  const pooled = new Set(DATA.pool().concat(DATA.pool('c', null, ['small'])));
  for (const id of H.items) {
    const d = ITEMS[id], W = 'season item ' + id;
    t.ok(!!d && d.id === id && d.season === 'halloween', W + ': looked up by id');
    t.ok(keys.indexOf(id) < 0 && !pooled.has(id), W + ': never listed or pooled year-round');
    t.ok(ITEM_ART.includes(d.art) && ['c', 'u', 'r'].includes(d.rarity) && d.cost >= 10, W + ': art, rarity, cost');
    t.ok(typeof d.name === 'string' && d.name.length > 2 && d.text.length > 10, W + ': a name and a line');
    if (d.bag) { t.ok(d.bag.every(x => ITEMS[x] && ITEMS[x].tags.includes('small')), W + ': a bag of small fillers'); continue; }
    checkFx(d.fx, W);
    checkFx(d.plus.fx, W + '+');
    checkShape(d.shape, W, d.tags.includes('small'));
    t.ok(JSON.stringify(d.plus.fx) !== JSON.stringify(d.fx), W + ': the plus differs');
    for (const plus of [false, true]) t.ok(!/[{}]/.test(DATA.itemText(d, plus)), W + ': text fully substituted');
  }
  t.ok(H.items.some(id => ITEMS[id].art === 'bomb'), 'a Pumpkin Bomb (a real bomb: its fuse lights)');
  t.ok(H.items.some(id => ITEMS[id].tags.includes('magic') && ITEMS[id].tags.includes('light')), 'a Haunted Teddy that floats like magic');
  t.ok(H.items.some(id => ITEMS[id].sea && ITEMS[id].sea.sweep), 'a Witch Broom that sweeps the pile');
  t.ok(ITEMS.candy_corn.sea.candy === 1 && ITEMS.bag_candycorn.bag.length === 3, 'Candy Corn pays candy, its bag holds three');
  for (let s = 1; s <= 200; s++) {
    const got = DATA.rewardItems(U.rng(s), 1 + (s % 3), ['knight', 'alchemist', 'rogue'][s % 3], 3, { bin: [], relics: [] });
    if (got.some(id => ITEMS[id] && ITEMS[id].season)) { t.ok(false, 'a year-round reward held a seasonal item (seed ' + s + ')'); break; }
  }
  for (const id of H.relics) {
    const r = RELICS[id], W = 'season relic ' + id;
    t.ok(!!r && r.season === 'halloween' && rkeys.indexOf(id) < 0 && DATA.relicPool().indexOf(id) < 0, W + ': looked up, never pooled year-round');
    t.ok(['c', 'u', 'r'].includes(r.rarity) && Array.from(r.icon).length <= 2 && r.kw.every(k => ARCHS.includes(k)) && r.hooks, W + ': rarity, icon, archetypes, hooks');
    for (const k in r.hooks) t.ok(HOOKS.includes(k), W + ': hook ' + k);
    const F = mockF();
    let threw = null;
    try { runHooks(r, F); } catch (e) { threw = e; }
    t.ok(!threw, W + ': hooks survive without COMBAT');
  }
  // costumed monsters and the Pumpkin King
  for (const [base, id] of Object.entries(H.costumes)) {
    const e = ENEMIES[id], b = ENEMIES[base], W = 'costume ' + id;
    t.ok(!!e && ekeys.indexOf(id) < 0 && e.season === 'halloween', W + ': looked up, never listed');
    t.ok(e.act === b.act && e.tier === b.tier && e.art === b.art && e.base === base && !!e.costume, W + ': the base monster in a costume');
    t.ok(Math.abs((e.hp[0] + e.hp[1]) - (b.hp[0] + b.hp[1])) <= 4, W + ': about the base monster\'s hp');
    t.ok(e.moves.every(m => MOVES.includes(m.k) && m.txt && m.name) && JSON.stringify(e.moves) !== JSON.stringify(b.moves), W + ': its own twist');
    t.eq(DATA.seaCostumeOf('halloween', base), id, W + ': seaCostumeOf');
    t.eq(DATA.seaCostumeOf('winter', base), null, W + ': not in winter');
  }
  t.ok(ENEMIES.slime_ghost.status.dodge === 1, 'the ghost sheet lets the first hit through');
  const K = ENEMIES.pumpking;
  t.ok(K && K.tier === 'elite' && K.act === 1 && K.look === 'pumpking' && ENEMY_ART.includes(K.art) && K.taunt && K.enrage && ekeys.indexOf('pumpking') < 0, 'the Pumpkin King: an act 1 elite with its own look, a taunt, a phase two');
  t.ok(K.moves.some(m => m.k === 'bomb'), 'he lobs lit pumpkins into the bin');
  for (const act of [1, 2, 3]) for (const tier of ['normal', 'elite', 'boss']) t.ok(ENCOUNTERS[act][tier].every(enc => enc.every(id => !ENEMIES[id].season)), `act ${act} ${tier}: no seasonal monster in the year-round encounters`);
});
t.test('season: the event cosmetics, the wallet, the currency, the doors, the sticker', () => {
  const ids = DATA.SEA_COSMETIC_IDS, C = DATA.COSMETICS;
  t.ok(ids.length === 9, 'nine event cosmetics (seven Claw-o-ween, two winter)');
  for (const id of ids) {
    const c = C[id], W = 'event cosmetic ' + id;
    t.ok(!!c && c.id === id && DATA.SEASONS[c.season] && c.price > 0, W + ': a season and a price');
    t.ok(DATA.COSMETIC_IDS.indexOf(id) < 0 && Object.keys(C).indexOf(id) < 0 && DATA.vaultPool().indexOf(id) < 0 && DATA.vaultList(c.cat).indexOf(id) < 0, W + ': never on a shelf, in a capsule or listed');
    t.eq(DATA.vaultHow(id), 'event', W + ': bought at the event counter');
    t.eq(DATA.vaultPrice(id), 0, W + ': never for tickets');
    t.ok(c.name.length >= 3 && c.name.length <= 20 && c.text.length >= 12 && c.text.length <= 80 && c.look, W + ': fits a card');
    t.ok(JSON.stringify(c).indexOf(String.fromCharCode(0x2014)) < 0, W + ': no em dashes');
  }
  for (const ch of CHARS) t.eq(DATA.seaCosmetics('halloween', 'outfit', ch).length, 1, `a witch hat for ${ch}`);
  t.ok(['skin', 'paint', 'trail'].every(cat => DATA.seaCosmetics('halloween', cat).length === 1), 'a Haunted Mansion cabinet, a pumpkin paint, a bat trail');
  t.eq(DATA.seaCosmetics('winter').length, 2, 'winter: two cosmetics');
  t.eq(C.skin_sea_mansion.look.fp, 'sea_pumpkins', 'the mansion frame has its own pattern');
  // the wallet
  const f = DATA.seaFix(null);
  t.ok(f.preview === '' && f.knocks === 0 && JSON.stringify(f.wallet) === '{}', 'a fresh profile: no preview, an empty wallet');
  const g = DATA.seaFix({ preview: 'winter', wallet: { candy: 12.7, flakes: -3, x: 'junk' }, knocks: '4', king: {} });
  t.ok(g.preview === 'winter' && g.wallet.candy === 12 && g.wallet.flakes === 0 && g.wallet.x === 0 && g.knocks === 4 && g.king === 0, 'numbers repaired, the preview kept');
  t.eq(DATA.seaFix({ preview: 'easter' }).preview, '', 'an unknown preview is dropped');
  t.eq(DATA.seaFix({ preview: 'off' }).preview, 'off', 'off is kept');
  // the currency a won fight drops
  const E = DATA.SEA_K.earn;
  t.eq(DATA.seaEarn('normal', 0, false), E.normal, 'a normal fight');
  t.eq(DATA.seaEarn('elite', 0, true), E.elite + E.king, 'the Pumpkin King');
  t.eq(DATA.seaEarn('normal', 2, false), E.normal + 2 * E.costume, 'two costumes');
  t.ok(DATA.seaEarn('boss', 0, false) > DATA.seaEarn('elite', 0, false) && DATA.seaEarn('elite', 0, false) > DATA.seaEarn('normal', 0, false), 'bosses drop the most');
  // the doors
  const a = DATA.seaTreatRoll(U.rng(7), 1, { relics: ['ghost_sheet'] }), b = DATA.seaTreatRoll(U.rng(7), 1, { relics: ['ghost_sheet'] });
  t.eq(JSON.stringify(a), JSON.stringify(b), 'a door rolls the same for the same rng');
  const cnt = {}, rng = U.rng(99);
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    const o = DATA.seaTreatRoll(rng, 2, { relics: ['jack_o_lantern'] });
    cnt[o.kind] = (cnt[o.kind] || 0) + 1; cnt[o.k] = (cnt[o.k] || 0) + 1;
    if (o.kind === 'treat' && !(o.candy >= E.treat[0])) bad++;
    if (o.kind === 'trick' && o.candy) bad++;
    if (o.k === 'relic' && o.id !== 'jack_o_lantern') bad++;
    if (o.k === 'item' && !(ITEMS[o.id] && ITEMS[o.id].season)) bad++;
    if (o.k === 'curse' && !(ITEMS[o.id] && ITEMS[o.id].rarity === 'junk')) bad++;
    if (o.k === 'gold' && !(o.gold > 0)) bad++;
  }
  t.eq(bad, 0, 'every door pays what it says (treats carry candy, tricks none)');
  t.near(cnt.treat / 4000, 0.7, 0.04, `about 70% treats (${Math.round(cnt.treat / 40)}%)`);
  t.ok(cnt.fight > 0 && cnt.curse > 0 && cnt.capsule > 0 && cnt.relic > 0 && cnt.item > 0 && cnt.gold > 0 && cnt.candy > 0, 'every outcome turns up');
  let rel = 0;
  for (let i = 0; i < 500; i++) if (DATA.seaTreatRoll(rng, 1, { relics: [] }).k === 'relic') rel++;
  t.eq(rel, 0, 'no relic treat when none is left to win');
  // one sticker
  const A = DATA.ACHIEVEMENTS.trick_or_treat;
  t.ok(A && DATA.ACH_IDS.includes('trick_or_treat') && A.goal === 5, 'Trick or Treat! is on the board with a goal of 5');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { sea: { knocks: 5 } } }, {}).includes('trick_or_treat'), 'five doors earn it');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { sea: { knocks: 4 } } }, {}).includes('trick_or_treat'), 'four do not');
  t.ok(JSON.stringify(DATA.SEASONS).indexOf(String.fromCharCode(0x2014)) < 0, 'no em dashes in the seasons');
});

t.done();
