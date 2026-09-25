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
const ITEM_ART = 'sword dagger axe hammer anvil shield buckler potion flask bomb torch iceshard snowball coin gem rock slag iceblock apple bread book scroll orb ring key chain horn whetstone feather skull star boot bone bottle heart lantern wand mask egg dice'.split(' ');
const ENEMY_ART = 'rat slime bat gremlin mimic spider goblin hoard imp clockwork golem furnace magnet ironjaw wraith yeti frostmage icemimic prizemaster mushroom knight wisp crab drone tinker cultist'.split(' ');
const TAGS = 'metal weapon glass potion heavy light junk magic food tool small'.split(' ');
const FX = 'dmg block heal status grab gold ink maxhp shake junk purge copy dmgPer cleanse lifesteal random poisonAll'.split(' ');
const MOVES = 'attack block buff debuff heal shake grease fog junk steal freezeItem summon tilt charge escape'.split(' ');
const EVENT_FX = 'hp maxhp gold ink brush item relic remove upgrade claw fight junk'.split(' ');
const MODS = 'grabs width grip speed prongs rubber magnet maxhp gold ink startBlock startStr'.split(' ');
const HOOKS = 'onFightStart onTurnStart onTurnEnd onPlay onGrab onDmgDealt onKill onHurt'.split(' ');
const STATUSES = 'block str weak vuln poison burn chill freeze regen thorns dodge bleed stun grease fog shield_up enrage armor'.split(' ');
const BIN_KINDS = ['shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'tilt'];
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
  for (const k of ['itemText', 'pool', 'rollRarity', 'rewardItems'])
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
    const needV = ['dmg', 'block', 'heal', 'status', 'grab', 'gold', 'ink', 'maxhp', 'dmgPer', 'lifesteal', 'random'];
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
    if (f.k === 'dmgPer') t.ok(['block', 'junk', 'metal', 'grabsUsed'].includes(f.per), `${where}: dmgPer per ${f.per}`);
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
  const by = (r) => ids.filter(id => ITEMS[id].rarity === r).length;
  t.ok(by('c') >= 16, `commons [${by('c')}]`);
  t.ok(by('u') >= 12, `uncommons [${by('u')}]`);
  t.ok(by('r') >= 10, `rares [${by('r')}]`);
  t.ok(by('l') >= 4, `legendaries [${by('l')}]`);
  t.eq(junkIds().sort().join(','), 'iceblock,rock,slag', 'junk items are rock, slag, iceblock');
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
    if (d.char != null) t.ok(['knight', 'alchemist', 'rogue'].includes(d.char), `${W}: char`);
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
      t.ok([...bin].every(k => k === 'shake' || k === 'junk'), `act 1 only shakes and junks [${[...bin]}]`);
    }
    if (act === 2) {
      for (const k of ['grease', 'steal', 'tilt']) t.ok(bin.has(k), `act 2 introduces ${k}`);
      t.ok(!bin.has('fog') && !bin.has('freezeItem'), 'act 2 saves fog and freezeItem for act 3');
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
function mockF() {
  return {
    turn: 3, target: 0, events: [], relics: [], bin: [], used: [],
    player: { hp: 20, maxHp: 70, block: 0, status: {}, grabs: 3, grabsMax: 3, grabsUsed: 1 },
    enemies: [{ uid: 'a', hp: 20, maxHp: 20, block: 0, status: {}, alive: true }, { uid: 'b', hp: 0, maxHp: 9, block: 0, status: {}, alive: false }],
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
  }
  if (h.onGrab) { h.onGrab(F, 0); h.onGrab(F, 2); }
  if (h.onDmgDealt) h.onDmgDealt(F, F.enemies[0], 15);
  if (h.onKill) h.onKill(F, F.enemies[1]);
  if (h.onHurt) h.onHurt(F, 5);
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
    t.ok(!!(r.mods || r.hooks), `${W}: has mods or hooks`);
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

// ---------------------------------------------------------------- brushes
t.test('brushes', () => {
  const size = { line3: 3, splash: 7, drip: 3, comb: 5 };
  const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
  for (const id in size) {
    const b = BRUSHES[id];
    t.ok(!!b && b.id === id && typeof b.name === 'string' && typeof b.icon === 'string' && typeof b.text === 'string', `brush ${id} labels`);
    for (const [q, r] of [[3, 3], [0, 0], [5, -2], [7, 6], [-1, 4]]) {
      const cells = b.cells(q, r);
      t.ok(Array.isArray(cells) && cells.every(c => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger)), `brush ${id}: [q,r] pairs`);
      t.ok(cells.some(c => c[0] === q && c[1] === r), `brush ${id}: contains target`);
      t.eq(new Set(cells.map(c => c.join())).size, size[id], `brush ${id}: ${size[id]} unique cells at ${q},${r}`);
      t.eq(JSON.stringify(b.cells(q, r)), JSON.stringify(cells), `brush ${id}: deterministic`);
      if (id === 'splash' || id === 'drip') t.ok(cells.every(c => hexDist(c, [q, r]) <= 1), `brush ${id}: neighbours only`);
      if (id === 'line3') t.ok(cells.every(c => c[1] === r && c[0] >= q), `brush line3 runs east toward the boss`);
      if (id === 'comb') {
        t.eq(new Set(cells.map(c => c[1])).size, 5, 'comb spans 5 rows');
        t.ok(cells.every(c => c[0] + Math.floor(c[1] / 2) === q + Math.floor(r / 2)), 'comb keeps one offset column');
      }
    }
  }
  const drips = new Set();
  for (let q = 0; q < 12; q++) for (let r = 0; r < 7; r++) drips.add(JSON.stringify(BRUSHES.drip.cells(q, r).slice(1).map(c => [c[0] - q, c[1] - r])));
  t.ok(drips.size >= 6, `drip varies by cell [${drips.size}]`);
});

// ------------------------------------------------------------- characters
t.test('characters', () => {
  t.eq(Object.keys(CHARACTERS).sort().join(), 'alchemist,knight,rogue', 'three characters');
  const hp = { knight: 80, alchemist: 60, rogue: 65 };
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
  t.eq(DATA.pool('junk').sort().join(), 'iceblock,rock,slag', 'pool(junk)');
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

t.done();
