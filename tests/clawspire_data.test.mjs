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
const MOVES = 'attack block buff debuff heal shake grease fog junk steal freezeItem summon tilt charge escape gulp bomb corrode jam eggs tickle glue wheel ceiling bury plow vanish restock cans change lure jellies pinch shock decoy'.split(' ');
const EVENT_FX = 'hp maxhp gold ink brush item relic remove upgrade claw fight junk'.split(' ');
const MODS = 'grabs width grip speed prongs rubber magnet maxhp gold ink startBlock startStr'.split(' ');
const HOOKS = 'onFightStart onTurnStart onTurnEnd onPlay onGrab onDmgDealt onKill onHurt onStatus onBlock onHeal onJunk onCombo onJackpot onShatter onGold onCashOut onEat onMaterial onPet onBubble onCab'.split(' ');
// Round 6 (sets): The Hungry Pack's three pet relics, left out of the build pass's counts.
const R6_RELICS = 'chew_toy treat_jar dog_whistle'.split(' ');
const RULES = 'poisonKeep blockKeep shatter glassBreak amp comboTwice echo luck cashAmp turret bubbles'.split(' ');
const ARCHS = 'poison burn frost fortress brawler metal junk jackpot swarm glass feast greed echo luck tech'.split(' ');
const STATUSES = 'block str weak vuln poison burn chill freeze regen thorns dodge bleed stun grease fog shield_up enrage armor streak luck'.split(' ');
const CHARS = 'knight alchemist rogue gambler engineer bubbler techie'.split(' ');
// Round 17 (TECH, Cabinet Tech and Joy Stick): checked in its own block below, left out of the build pass's counts.
const R17_ITEMS = 'arcade_stick arcade_button coin_mech neon_tube circuit_board extension_cord crt_monitor golden_stick'.split(' ');
const R17_RELICS = 'service_remote laser_sight service_key lamp_oil coin_hopper metronome fever_dream circuit_breaker trick_shot double_feature leg_motherboard'.split(' ');
const R21_RELICS = 'cr_steel cr_brew cr_feast cr_jackpot cr_casino cr_tech cr_party cr_all'.split(' ');   // (round 21: the combo relics)
// Round 10 (ROS, Ms. Bubbles): checked in its own block below, left out of the build pass's counts.
const R10_ITEMS = 'rubber_duck soap_bar bubble_pipe sponge scrub_brush bath_bomb foam_cannon loofah bubble_bath golden_duck'.split(' ');
const R10_RELICS = 'bubble_wand foam_machine soap_dish squeaky_toy'.split(' ');
// Round 8 (CR8, Mama Mech): checked in its own block below, left out of the build pass's counts.
const R8_ITEMS = 'hex_bolt tin_plate pipe_wrench spring_coil oil_can rivet_gun toolbox tesla_coil mech_arm mech_core'.split(' ');
const R8_RELICS = 'socket_set blueprints armor_piercing grease_gun'.split(' ');
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
  if (h.onBubble) { h.onBubble(F, 'chute', 2); h.onBubble(F, 'bin', 1); }   // (round 12)
  if (h.onCab) { for (const id of ['surge', 'coins', 'capsule']) h.onCab(F, 'event', 0, id); h.onCab(F, 'perfect', 2); h.onCab(F, 'fever', 1); h.onCab(F, 'double', 0, 'coins'); }   // (round 17)
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
    t.ok(['c', 'u', 'r', 'boss', 'event', 'l'].includes(r.rarity), `${W}: rarity`);   // (round 12: legendaries)
    t.ok(typeof r.text === 'string' && r.text.length > 8, `${W}: text`);
    t.ok(!!(r.mods || r.hooks || r.rules || r.combo), `${W}: has mods, hooks, rules or a combo family`);   // (round 21: a combo relic's power is its family)
    if (r.combo != null) t.ok(r.combo === 'all' || !!DATA.CR.FAM[r.combo], `${W}: combo is a family or 'all' [${r.combo}]`);
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
  t.eq(Object.keys(CHARACTERS).sort().join(), 'alchemist,bubbler,engineer,gambler,knight,rogue,techie', 'seven characters (round 17: Joy Stick)');
  const hp = { knight: 80, alchemist: 60, rogue: 65, gambler: 78, engineer: 84, bubbler: 68, techie: 70 };   // (round 16: Mama Mech 75 -> 84) (round 17 QA: Lucky Lou 70 -> 78)
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
    t.ok(['start', 'act2', 'win', 'fever'].includes(c.unlock), `${W}: unlock rule`);
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
  // round 12 balance pass: act 2 is 64 / 29 / 6.5 / 0.5 (was 55 / 33 / 11 / 1)
  t.near(cnt.c / 20000, 0.64, 0.02, 'rollRarity act2 commons');
  t.near(cnt.u / 20000, 0.29, 0.02, 'rollRarity act2 uncommons');
  t.near(cnt.r / 20000, 0.065, 0.015, 'rollRarity act2 rares');
  t.near(cnt.l / 20000, 0.005, 0.004, 'rollRarity act2 legendaries');
  const a = U.rng(7), b = U.rng(7);
  t.ok(Array.from({ length: 50 }, () => DATA.rollRarity(a)).join() === Array.from({ length: 50 }, () => DATA.rollRarity(b)).join(), 'rollRarity deterministic');
  const z = U.rng(3);
  t.ok(Array.from({ length: 2000 }, () => DATA.rollRarity(z, 1)).every(x => x !== 'l'), 'no legendary in act 1 weights');
});

t.test('rewardItems', () => {
  // round 12 balance pass: fewer rares out of fight rewards (was 70/25/5/0, 55/33/11/1, 40/38/18/4)
  const W = { 1: { c: 0.76, u: 0.22, r: 0.02, l: 0 }, 2: { c: 0.64, u: 0.29, r: 0.065, l: 0.005 }, 3: { c: 0.52, u: 0.35, r: 0.115, l: 0.015 } };
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
  t.eq(Object.keys(A).sort().join(), ARCHS.slice().sort().join(), '15 archetypes (round 17: Tech)');
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
  for (const id of Object.keys(RELICS).filter(id => RELICS[id].rules)) t.ok(['r', 'l'].includes(RELICS[id].rarity), `${id}: rule benders are rare or legendary [${RELICS[id].rarity}]`);
  t.ok(DATA.RELIC_RULES.join() === RULES.join() && DATA.RELIC_HOOKS.join() === HOOKS.join(), 'DATA lists the hooks and rules');
});

t.test('new content sits in the pools', () => {
  const OLD_RELICS = 'squire_gauntlet bubbling_satchel pickpocket_glove grip_tape oiled_rails golden_ticket inkwell heart_locket kettle_helm consolation_prize sore_loser blood_bag hot_coffee wide_palm rubber_thimbles protein_bar jackpot_bell thorn_mail venom_gland flint_striker snow_globe trophy_rack egg_timer grudge_journal recycling_bin potion_belt fridge_magnet cracked_hourglass big_knuckles four_leaf_clover vampire_dentures second_wind token_stack third_hand golden_crane cursed_quarter friendship_bracelet cursed_plush'.split(' ');
  const fresh = Object.keys(RELICS).filter(id => !(RELICS[id].rarity === 'l' && id.startsWith('leg_')) && !OLD_RELICS.includes(id) && !R3_RELICS.includes(id) && !R6_RELICS.includes(id) && !R8_RELICS.includes(id) && !R10_RELICS.includes(id) && !R17_RELICS.includes(id) && !R21_RELICS.includes(id));
  t.ok(fresh.length >= 20 && fresh.length <= 32, `20..32 new relics [${fresh.length}]`);
  for (const id of fresh) {
    const r = RELICS[id];
    t.ok(!r.starter && ['c', 'u', 'r'].includes(r.rarity), `${id}: a c/u/r pool relic`);
    t.ok(DATA.relicPool(r.rarity).includes(id), `${id}: in relicPool('${r.rarity}')`);
  }
  const OLD_ITEMS = OLD_ITEM_IDS;
  const newItems = Object.keys(ITEMS).filter(id => !OLD_ITEMS.includes(id) && id !== 'hoardcoin' && !R3_ITEMS.includes(id) && !R8_ITEMS.includes(id) && !R10_ITEMS.includes(id) && !R17_ITEMS.includes(id));   // the Hoard's coins are boss junk, not a build piece
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
  t.ok(boss.r + boss.l > 280, `boss capsules are mostly rare or better (${boss.r + boss.l}/500)`);
  t.ok(boss.l < boss.r / 3, `a legendary boss capsule stays a treat (${boss.l} legendary, ${boss.r} rare)`);
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
      if (p.k === 'item') { t.ok(!!ITEMS[p.id] && ITEMS[p.id].rarity !== 'junk', `${tier}: item ${p.id} exists`); if (!p.plus) t.ok(DATA.LOOT.ITEM_RAR[tier].includes(ITEMS[p.id].rarity), `${tier}: item rarity fits the tier (${ITEMS[p.id].rarity})`); }
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
  t.ok(DATA.DIFFICULTY.hp === 3.1 && DATA.DIFFICULTY.dmg === 2.6 && DATA.DIFFICULTY.tierDmg.boss === 1.5, 'DIFFICULTY defaults untouched (round 12 values)');
});

t.test('meta: achievements are well formed and checked safely', () => {
  const ids = DATA.ACH_IDS;
  // The board is a 3-column grid on a phone: room for the seasonal and evolution
  // stickers of round 7, but a runaway list still fails here (round 7 QA: 50 -> 60;
  // round 15, the Neon Depths' Deep Diver: 60 -> 63, the grid's next full row of three).
  t.ok(ids.length >= 25 && ids.length <= 63, `25 to 63 stickers (${ids.length})`);
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
const MUT_FX = ['gs', 'drag', 'scale', 'slick', 'glass', 'drift', 'belt', 'quake', 'dark', 'temp', 'grabs', 'dmgOut', 'affix', 'rules', 'extra',
  'bounce', 'clawK', 'tremor', 'mirror', 'sticky', 'flood'];   // (ROS, round 10: the mutator pack)
t.test('endless: the mutators are well formed and the engine reads every effect', () => {
  const M = DATA.MUTATORS, ids = DATA.MUT_IDS;
  t.ok(ids.length >= 10 && ids.length <= 20, `10 to 20 mutators (${ids.length})`);
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
  t.ok(DATA.DIFFICULTY.hp === 3.1 && DATA.DIFFICULTY.dmg === 2.6 && DATA.DIFFICULTY.tierDmg.boss === 1.5, 'DIFFICULTY defaults untouched (round 12 values)');
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
  t.ok(per.skin >= 8 && per.skin <= 13, `8 to 13 cabinet skins (${per.skin})`);   // (round 12: three animated ones)
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
  t.eq(PET_IDS.length, 11, 'eleven pets (round 10 added three)');
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
  t.eq(seen.size, PET_IDS.length, 'every pet shows up in some shop');
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
  // (round 21) three upgraded copies make the plus 2 copy; three +2 copies (or an item with no +2) climb a rarity instead
  const I2 = (id, plus) => ({ id, plus });
  const two = DATA.cmpRule([I('rusty_sword', true), I('rusty_sword', true), I('rusty_sword', true)]);
  t.ok(two.ok && two.kind === 'plus2' && two.id === 'rusty_sword', 'three plus copies: the plus 2 copy');
  t.eq(DATA.cmpRoll(U.rng(1), [I('rusty_sword', true), I('rusty_sword', true), I('rusty_sword', true)], 'knight').plus, 2, 'rolled as the +2 copy');
  t.eq(DATA.cmpRule([I2('rusty_sword', 2), I2('rusty_sword', true), I2('rusty_sword', true)]).kind, 'plus2', 'a +2 with two +1: still +2 (one above the lowest)');
  t.eq(DATA.cmpRule([I2('rusty_sword', 2), I2('rusty_sword', 2), I2('rusty_sword', false)]).kind, 'plus', 'a plain one among them: one above the lowest, the plus copy');
  t.eq(DATA.cmpRule([I2('rusty_sword', 2), I2('rusty_sword', 2), I2('rusty_sword', 2)]).kind, 'rarity', 'three +2 copies: the rarity rule instead');
  const noTwo = Object.keys(ITEMS).find((id) => ITEMS[id].plus && !DATA.cmp2Ok(ITEMS[id]) && ITEMS[id].rarity !== 'junk');
  if (noTwo) t.eq(DATA.cmpRule([I(noTwo, true), I(noTwo, true), I(noTwo, true)]).kind, 'rarity', `${noTwo} has no +2: three plus copies climb a rarity`);
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
  t.ok(ids.length >= 12 && ids.length <= 30, `12 to 30 recipes [${ids.length}]`);   // (round 12: ten more)
  const froms = new Set(), relics = new Set(), names = new Set(Object.keys(ITEMS).map(id => ITEMS[id].name));
  const pooled = new Set(DATA.pool()), dexItems = new Set(DATA.dexEntries().items);
  for (const id of ids) {
    const r = REC[id], d = EV[id], W = `evo ${id}`;
    t.ok(r && r.id === id && r.to === id && d && d.id === id, `${W}: recipe and def`);
    const base = ITEMS[r.from];
    t.ok(base && Object.keys(ITEMS).includes(r.from) && base.rarity !== 'junk' && base.plus, `${W}: its base ${r.from} is a real item with a plus`);
    t.ok(RELICS[r.relic] && !RELICS[r.relic].starter && ['c', 'u', 'r', 'l'].includes(RELICS[r.relic].rarity), `${W}: its relic ${r.relic} is a pool relic (or a legendary)`);
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
    t.ok(DATA.seaCostumeOf('winter', base) !== id, W + ': not in winter (winter dresses it its own way)');
  }
  t.ok(ENEMIES.slime_ghost.status.dodge === 1, 'the ghost sheet lets the first hit through');
  const K = ENEMIES.pumpking;
  t.ok(K && K.tier === 'elite' && K.act === 1 && K.look === 'pumpking' && ENEMY_ART.includes(K.art) && K.taunt && K.enrage && ekeys.indexOf('pumpking') < 0, 'the Pumpkin King: an act 1 elite with its own look, a taunt, a phase two');
  t.ok(K.moves.some(m => m.k === 'bomb'), 'he lobs lit pumpkins into the bin');
  for (const act of [1, 2, 3]) for (const tier of ['normal', 'elite', 'boss']) t.ok(ENCOUNTERS[act][tier].every(enc => enc.every(id => !ENEMIES[id].season)), `act ${act} ${tier}: no seasonal monster in the year-round encounters`);
});
t.test('season: the event cosmetics, the wallet, the currency, the doors, the sticker', () => {
  const ids = DATA.SEA_COSMETIC_IDS, C = DATA.COSMETICS;
  t.ok(ids.length === 23, 'twenty-three event cosmetics (ten Claw-o-ween with Mama Mech\'s, Ms. Bubbles\' and Joy Stick\'s witch hats, thirteen winter)');
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
  t.eq(DATA.seaCosmetics('winter').length, 13, 'winter: thirteen cosmetics (WIN, round 12; round 17: Joy Stick\'s scarf)');
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

// WIN (round 12): Winter Wonderclaw (DESIGN.md "Winter Wonderclaw (round 12)").
t.test('winter: its edges and the new year, the countdown across it', () => {
  const at = (d) => (DATA.seasonAt(d) || {}).id || null;
  t.eq(at(new Date(2026, 11, 9, 23, 59, 59)), null, 'the last second of 9 December: nothing');
  t.eq(at(new Date(2026, 11, 10, 0, 0, 1)), 'winter', 'the first second of 10 December: winter');
  t.eq(at(new Date(2026, 11, 31, 23, 59, 59)), 'winter', 'New Year\'s Eve at midnight');
  t.eq(at(new Date(2027, 0, 1, 0, 0, 1)), 'winter', '...and a second into the new year');
  t.eq(at(new Date(2027, 0, 6, 23, 59, 59)), 'winter', 'the last second of 6 January');
  t.eq(at(new Date(2027, 0, 7, 0, 0, 1)), null, 'gone on 7 January');
  t.eq(at('2030-12-25'), 'winter', 'every year');
  const day = (y, m, d) => new Date(y, m - 1, d).getTime();
  const a = DATA.seasonWindow('winter', '2026-12-20'), b = DATA.seasonWindow('winter', '2027-01-03');
  t.ok(a.start === b.start && a.end === b.end && a.start === day(2026, 12, 10) && a.end === day(2027, 1, 7), 'December and January share one span');
  t.eq(DATA.seasonLeft('winter', '2027-01-06'), day(2027, 1, 7) - day(2027, 1, 6), 'the last day has a day left');
  t.eq(DATA.seasonLeft('winter', '2027-01-07'), 0, 'none after it');
  t.eq(DATA.seasonWindow('winter', '2027-02-01').start, day(2027, 12, 10), 'in February the next window is next December');
});
t.test('winter: the content stays out of every year-round table and pool', () => {
  const Wn = DATA.SEASONS.winter;
  t.ok(Wn.items.length >= 6 && Wn.items.length <= 8, `6 to 8 items (${Wn.items.length})`);
  t.eq(Wn.relics.length, 4, 'four relics');
  t.ok(Wn.elite === 'krampus' && Wn.tile === 'advent', 'Krampus and the advent calendar');
  const keys = Object.keys(ITEMS), rkeys = Object.keys(RELICS), ekeys = Object.keys(ENEMIES);
  const pooled = new Set(DATA.pool().concat(DATA.pool('c', null, ['small'])));
  const fps = new Set();
  for (const id of Wn.items.concat(['win_snowball', 'win_coal'])) {
    const d = ITEMS[id], W = 'winter item ' + id;
    t.ok(!!d && d.id === id && d.season === 'winter', W + ': looked up by id');
    t.ok(keys.indexOf(id) < 0 && !pooled.has(id), W + ': never listed or pooled year-round');
    t.ok(ITEM_ART.includes(d.art) && ['c', 'u', 'r', 'junk'].includes(d.rarity), W + ': art, rarity');
    t.ok(typeof d.name === 'string' && d.name.length > 2 && d.text.length > 10 && d.text.indexOf(String.fromCharCode(0x2014)) < 0, W + ': a name and a line');
    fps.add(d.name);
    if (d.bag) { t.ok(d.bag.every(x => ITEMS[x] && ITEMS[x].tags.includes('small') && ITEMS[x].season === 'winter'), W + ': a sack of small winter fillers'); continue; }
    checkFx(d.fx, W);
    checkShape(d.shape, W, d.tags.includes('small'));
    if (d.rarity === 'junk') continue;
    t.ok(d.cost >= 10, W + ': a cost');
    checkFx(d.plus.fx, W + '+');
    t.ok(JSON.stringify(d.plus.fx) !== JSON.stringify(d.fx), W + ': the plus differs');
    for (const plus of [false, true]) t.ok(!/[{}]/.test(DATA.itemText(d, plus)), W + ': text fully substituted');
  }
  t.eq(fps.size, Wn.items.length + 2, 'every winter item has its own name');
  t.ok(ITEMS.present_box.sea.gift && ITEMS.win_snowball.sea.candy === 1 && ITEMS.ornament.tags.includes('glass'), 'a Present Box that unwraps, a Snowball that pays, a glass ornament');
  t.ok(ITEMS.fruitcake.density >= 2.4 && ITEMS.fruitcake.tags.includes('heavy'), 'a Fruitcake heavy as an anvil');
  t.ok(ITEMS.jingle_bell.tags.includes('magic') && ITEMS.yule_log.fx.some(f => f.s === 'burn'), 'a magic Jingle Bell, a burning Yule Log');
  t.ok(ITEMS.win_coal.rarity === 'junk' && ITEMS.win_coal.tags.includes('heavy'), 'the coal is heavy junk');
  for (let s = 1; s <= 200; s++) {
    const got = DATA.rewardItems(U.rng(s), 1 + (s % 3), ['knight', 'alchemist', 'rogue'][s % 3], 3, { bin: [], relics: [] });
    if (got.some(id => ITEMS[id] && ITEMS[id].season === 'winter')) { t.ok(false, 'a year-round reward held a winter item (seed ' + s + ')'); break; }
  }
  for (const id of Wn.relics) {
    const r = RELICS[id], W = 'winter relic ' + id;
    t.ok(!!r && r.season === 'winter' && rkeys.indexOf(id) < 0 && DATA.relicPool().indexOf(id) < 0, W + ': looked up, never pooled year-round');
    t.ok(['c', 'u', 'r'].includes(r.rarity) && Array.from(r.icon).length <= 2 && r.kw.every(k => ARCHS.includes(k)) && r.hooks, W + ': rarity, icon, archetypes, hooks');
    for (const k in r.hooks) t.ok(HOOKS.includes(k), W + ': hook ' + k);
    let threw = null;
    try { runHooks(r, mockF()); } catch (e) { threw = e; }
    t.ok(!threw, W + ': hooks survive without COMBAT');
  }
  t.eq(new Set(Wn.relics.map(id => RELICS[id].name)).size, 4, 'four relic names of their own');
  for (const [base, id] of Object.entries(Wn.costumes)) {
    const e = ENEMIES[id], b = ENEMIES[base], W = 'winter costume ' + id;
    t.ok(!!e && ekeys.indexOf(id) < 0 && e.season === 'winter', W + ': looked up, never listed');
    t.ok(e.act === b.act && e.tier === b.tier && e.art === b.art && e.base === base && !!e.costume, W + ': the base monster in a costume');
    t.ok(Math.abs((e.hp[0] + e.hp[1]) - (b.hp[0] + b.hp[1])) <= 4, W + ': about the base monster\'s hp');
    t.ok(e.moves.every(m => MOVES.includes(m.k) && m.txt && m.name) && JSON.stringify(e.moves) !== JSON.stringify(b.moves), W + ': its own twist');
    t.eq(DATA.seaCostumeOf('winter', base), id, W + ': seaCostumeOf');
    t.ok(DATA.seaCostumeOf('halloween', base) !== id, W + ': never on Halloween');
  }
  t.ok(['reindeer', 'snowman', 'elf'].every(c => Object.values(Wn.costumes).some(id => ENEMIES[id].costume === c)), 'a reindeer, a snowman, an elf');
  t.ok(ENEMIES.rat_reindeer.moves.some(m => m.k === 'fog') && ENEMIES.slime_snowman.status.armor === 1 && ENEMIES.goblin_elf.moves.some(m => m.k === 'junk' && m.item === 'fruitcake'),
    'twists: the nose fogs the glass, the snowman is packed hard, the elf regifts a fruitcake');
  const K = ENEMIES.krampus;
  t.ok(K && K.tier === 'elite' && K.act === 1 && K.look === 'krampus' && ENEMY_ART.includes(K.art) && K.taunt && K.enrage && K.enrage.str > 0 && ekeys.indexOf('krampus') < 0, 'Krampus: an act 1 elite with his own look, a taunt, a phase two');
  t.ok(K.sig && K.sig.id === 'spill' && K.sig.item === 'win_coal' && K.sig.first >= 1 && K.sig.every >= 2, 'his signature: a sack of coal into your bin');
  t.ok(K.moves.every(m => MOVES.includes(m.k) && /\d/.test(m.txt)), 'every move says its number (a clear telegraph)');
  t.ok(K.hp[0] >= ENEMIES.mimic.hp[0] && K.moves.some(m => m.k === 'charge' && m.v >= 20), 'as tough as the act 1 elites, with a big charged hit');
  for (const act of [1, 2, 3]) for (const tier of ['normal', 'elite', 'boss']) t.ok(ENCOUNTERS[act][tier].every(enc => enc.every(id => ENEMIES[id].season !== 'winter')), `act ${act} ${tier}: no winter monster year-round`);
  t.ok(JSON.stringify(DATA.WIN_K).length > 20 && JSON.stringify(Wn).indexOf(String.fromCharCode(0x2014)) < 0, 'dials, no em dashes');
});
t.test('winter: the advent calendar\'s gifts are modest, grow door by door and roll the same for the same rng', () => {
  const K = DATA.WIN_K, items = DATA.winGiftPool('knight'), relics = ['mistletoe', 'warm_scarf'];
  t.ok(items.length > 5 && items.every(id => ITEMS[id] && ITEMS[id].rarity === 'c' && !ITEMS[id].bag), 'the item gifts are common items');
  t.ok(items.includes('hot_cocoa') && items.includes('fruitcake'), '...with the season\'s own commons');
  t.eq(JSON.stringify(DATA.winAdventRoll(U.rng(5), 7, 1, { items, relics })), JSON.stringify(DATA.winAdventRoll(U.rng(5), 7, 1, { items, relics })), 'deterministic');
  const cnt = {}, rng = U.rng(77);
  let bad = 0, early = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const day = 1 + (i % 24), o = DATA.winAdventRoll(rng, day, 1 + (i % 3), { items, relics });
    cnt[o.k] = (cnt[o.k] || 0) + 1;
    if (o.kind !== 'treat' || !(o.candy >= K.advFlakes[0]) || o.day !== day) bad++;
    if (o.k === 'item' && !(ITEMS[o.id] && ITEMS[o.id].rarity === 'c')) bad++;
    if (o.k === 'relic' && relics.indexOf(o.id) < 0) bad++;
    if (o.k === 'gold' && !(o.gold >= K.advGold[0] && o.gold <= 60)) bad++;
    if (o.k === 'capsule' && o.tier !== 'c') bad++;
    if ((o.k === 'capsule' && day < K.advCapsuleDay) || (o.k === 'relic' && day < K.advRelicDay)) early++;
    if (o.candy > 30) bad++;
  }
  t.eq(bad, 0, 'every door pays what it says, always with snowflakes, never a pile');
  t.eq(early, 0, 'no capsule or relic behind the early doors');
  t.ok((cnt.flakes + cnt.gold) / N > 0.65, `mostly snowflakes and gold (${Math.round((cnt.flakes + cnt.gold) / N * 100)}%)`);
  t.ok(cnt.capsule / N < 0.06 && cnt.relic / N < 0.03 && cnt.capsule > 0 && cnt.relic > 0, `capsules (${cnt.capsule}) and relics (${cnt.relic}) are rare but real`);
  // bigger if you opened the ones before: the average snowflakes climb
  const avg = (day) => { const r = U.rng(9); let s = 0; for (let i = 0; i < 300; i++) s += DATA.winAdventRoll(r, day, 1, { items, relics }).candy; return s / 300; };
  t.ok(avg(24) > avg(12) && avg(12) > avg(1), `later doors are bigger (${avg(1).toFixed(1)}, ${avg(12).toFixed(1)}, ${avg(24).toFixed(1)})`);
  t.ok(DATA.winAdventRoll(U.rng(3), 6, 1, { items }).big && !DATA.winAdventRoll(U.rng(3), 5, 1, { items }).big, 'every sixth door is a bigger present');
  t.eq(DATA.winAdventRoll(U.rng(3), 99, 1, {}).day, K.advMax, 'past Christmas Eve the calendar stays on its last door');
  let rel = 0;
  for (let i = 0; i < 500; i++) if (DATA.winAdventRoll(rng, 20, 1, { items, relics: [] }).k === 'relic') rel++;
  t.eq(rel, 0, 'no relic when none is left to win');
  // the profile's calendar is repaired
  t.eq(JSON.stringify(DATA.winAdvFix(null)), JSON.stringify({ y: '', n: 0 }), 'a fresh calendar');
  t.eq(JSON.stringify(DATA.winAdvFix({ y: 2026, n: -4 })), JSON.stringify({ y: '', n: 0 }), 'junk repaired');
  t.eq(DATA.seaFix({ adv: { y: '2026', n: 5.7 } }).adv.n, 5, 'kept on the season record');
  t.eq(DATA.seaFix({}).adv.n, 0, '...and empty on an old one');
});
t.test('winter: the Snowflake Stand stocks a cabinet, paints, a marquee, a trail and a scarf for every crawler', () => {
  const C = DATA.COSMETICS;
  for (const ch of CHARS) t.eq(DATA.seaCosmetics('winter', 'outfit', ch).length, 1, `scarf and earmuffs for ${ch}`);
  t.ok(DATA.seaCosmetics('winter', 'skin').length === 2 && DATA.seaCosmetics('winter', 'paint').length === 2, 'two cabinets (the Frosted Cabinet and the Gingerbread House) and two paints');
  t.ok(DATA.seaCosmetics('winter', 'marquee').length === 1 && DATA.seaCosmetics('winter', 'trail').length === 1, 'a festive marquee and a snowflake trail');
  for (const id of DATA.WIN_COSMETIC_IDS) {
    const c = C[id];
    t.ok(c && c.season === 'winter' && c.price > 0 && DATA.vaultHow(id) === 'event' && DATA.vaultPrice(id) === 0 && DATA.vaultPool().indexOf(id) < 0, id + ': snowflakes only, never tickets or a capsule');
    t.ok(DATA.SEA_COSMETIC_IDS.includes(id), id + ': on the event list');
  }
  t.ok(C.paint_sea_cane.name !== C.paint_candy.name && C.trail_sea_flakes.name !== C.trail_snow.name, 'never a copy of a year-round prize');
  t.eq(C.mq_sea_festive.look.style, 'sea_festive', 'the festive marquee has its own style');
});

// ---------------------------------------------------------------- HISTORY (round 8: run history and the death recap)
{
  const recOf = (i, o) => Object.assign({ id: 'r' + i, d: 1.78e9 + i * 100, c: i % 2 ? 'rogue' : 'knight', cl: 'classic', tl: 0, m: 'classic', s: 1000 + ((i * 7919) % 5000), r: i % 4 ? 'loss' : 'win', a: 1 + (i % 3), lp: 0,
    tu: 20, kl: 10, f: 5, bs: 0, bh: 30, jp: 2, ev: 0, b: ['rusty_sword', 'dented_shield+'], rl: ['squire_gauntlet'] }, o || {});

  t.test('history: records are repaired, compact and never carry junk', () => {
    const H = DATA.HIS;
    t.ok(H.CAP === 50 && H.HOF === 10 && H.BIN === 8 && H.TURNS === 5, 'the caps: 50 runs, 10 in the Hall of Fame, 8 prizes, 5 turns');
    t.eq(DATA.hisRecFix(null), null, 'null is no record');
    t.eq(DATA.hisRecFix({ c: 'knight' }), null, 'an id is required');
    t.eq(DATA.hisRecFix({ id: 'x' }), null, 'a crawler is required');
    const r = DATA.hisRecFix(Object.assign(recOf(1), { s: -5, r: 'maybe', a: 99, extra: 'drop me', b: ['a', 1, null, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], mu: [], st: [], bc: { n: 'Tea Party', t: 9 }, lt: [[1, 2, 3], 'x', [4, 'q', 6]] }));
    t.ok(r.s === 0 && r.r === 'loss' && r.a === 9 && !('extra' in r), 'numbers clamped, a bad result is a loss, unknown fields dropped');
    t.ok(r.b.length === 8 && r.b.every((x) => typeof x === 'string'), 'the bin: 8 ids at most');
    t.ok(!('mu' in r) && !('st' in r), 'empty lists are left out');
    t.ok(r.bc.t === 3 && r.lt.length === 2 && r.lt[1][1] === 0, 'the combo tier and the turns are repaired');
    t.ok(JSON.stringify(DATA.hisRecFix(recOf(2, { k: 'Ironjaw', kk: 'hit', ke: 'ironjaw', km: 'Gape', kh: 129, lt: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 1, 1], [0, 0, 0]], mu: ['lowgrav', 'glass'], st: ['s1'] }))).length < 520, 'a full record stays small');
    const h0 = DATA.hisFix(undefined);
    t.ok(h0.runs.length === 0 && h0.hof.length === 0 && h0.n === 0 && JSON.stringify(h0.by) === '{}', 'no history is an empty one');
    const hj = DATA.hisFix({ runs: 'x', hof: [null, recOf(3), recOf(3)], by: { knight: [2, 5], rogue: 'x', '': [1, 1] }, n: 'lots' });
    t.ok(hj.runs.length === 0 && hj.hof.length === 1 && hj.by.knight[1] === 2 && !hj.by.rogue && hj.n === 0, 'junk is repaired (no duplicates, wins never above runs)');
    t.ok(JSON.stringify(DATA.hisTips({})).indexOf(String.fromCharCode(0x2014)) < 0, 'no em dashes');
  });

  t.test('history: the last 50, a Hall of Fame of 10, one record per run, quit never overwrites', () => {
    const h = DATA.hisFix(null);
    let best = 0;
    for (let i = 0; i < 70; i++) { const rec = recOf(i); best = Math.max(best, rec.s); const res = DATA.hisPush(h, rec); t.ok(res && res.fresh, 'fresh ' + i); }
    t.ok(h.runs.length === 50 && h.runs[0].id === 'r20' && h.runs[49].id === 'r69' && h.n === 70, 'the last 50 of 70, oldest first');
    t.eq(h.hof.length, 10, 'ten in the Hall of Fame');
    t.eq(h.hof[0].s, best, 'the best of all 70 leads it, even one out of the last 50');
    for (let i = 1; i < 10; i++) t.ok(h.hof[i - 1].s >= h.hof[i].s, 'best first ' + i);
    t.ok(h.by.knight[0] === 35 && h.by.rogue[0] === 35 && h.by.knight[1] === 18 && h.by.rogue[1] === 0, 'lifetime counts per crawler');
    // the same run again: updated where it stands
    const up = DATA.hisPush(h, recOf(61, { r: 'endless', lp: 3, s: 999999 }));
    t.ok(up && !up.fresh && up.hof === 1, 'an update: into the Hall of Fame at #1');
    t.ok(h.runs.length === 50 && h.runs.filter((r) => r.id === 'r61').length === 1 && h.runs[41].r === 'endless' && h.n === 70, 'in place, counted once');
    t.ok(h.by.rogue[0] === 35 && h.by.rogue[1] === 1, 'a loss that became a win counts the win, not the run');
    const q = DATA.hisPush(h, recOf(61, { r: 'quit', s: 1 }));
    t.ok(q.kept && h.runs[41].r === 'endless' && h.hof[0].id === 'r61', 'quit never overwrites a finished run');
    t.ok(DATA.hisPush(h, { id: 'bad' }) === null && DATA.hisPush(null, recOf(1)) === null, 'junk is refused');
    // a tie goes to the older run
    const t2 = DATA.hisFix(null);
    DATA.hisPush(t2, recOf(1, { s: 500, d: 20 })); DATA.hisPush(t2, recOf(2, { s: 500, d: 10 }));
    t.eq(t2.hof[0].id, 'r2', 'ties: the older run first');
  });

  t.test('history: filters, the charts, the packed map', () => {
    const list = [recOf(0), recOf(1), recOf(2, { r: 'endless' }), recOf(3, { r: 'quit' }), recOf(4)];
    t.eq(DATA.hisFilter(list, { c: 'knight' }).length, 3, 'by crawler');
    t.eq(DATA.hisFilter(list, { r: 'win' }).length, 3, 'wins include Endless');
    t.eq(DATA.hisFilter(list, { r: 'endless' }).length, 1, 'Endless alone');
    t.eq(DATA.hisFilter(list, { c: 'rogue', r: 'quit' }).length, 1, 'both');
    t.eq(DATA.hisFilter(list, { c: 'all', r: 'all' }).length, 5, 'all');
    const ch = DATA.hisChart(list, { knight: [4, 2], rogue: [6, 0], ghost: [0, 0] });
    t.ok(ch.pts.length === 5 && ch.max === Math.max(...list.map((r) => r.s)) && ch.pts[ch.best].s === ch.max, 'the score line and its best');
    t.ok(ch.per.length === 2 && ch.per[0].c === 'rogue' && ch.per[1].rate === 0.5 && ch.wins === 3 && ch.rate === 0.6, 'win rate per crawler, most played first');
    t.ok(DATA.hisChart([], {}).max === 0 && DATA.hisChart([], {}).best === -1, 'an empty chart');
    // a map: 16 x 22, some lit, some walked, water
    const M = { cols: 16, rows: 22, tiles: {}, pos: { q: 3, r: 10 }, boss: { q: 10, r: 11 }, start: { q: -5, r: 11 } };
    for (let r = 0; r < 22; r++) for (let c = 0; c < 16; c++) { const q = c - Math.floor(r / 2); M.tiles[q + ',' + r] = { q, r, terrain: (c + r) % 7 === 0 ? 'sea' : 'land', revealed: (c * r) % 3 === 0, visited: (c + r) % 5 === 0 && (c + r) % 7 !== 0 }; }
    const mp = DATA.hisMapPack(M), cells = DATA.hisMapCells(mp);
    t.ok(mp.w === 16 && mp.h === 22 && mp.g.length === Math.ceil(352 / 3) && /^[A-Za-z0-9_-]+$/.test(mp.g), '2 bits a hex, 118 characters');
    let ok = true;
    for (let r = 0; r < 22; r++) for (let c = 0; c < 16; c++) { const q = c - Math.floor(r / 2), tl = M.tiles[q + ',' + r], v = tl.terrain === 'sea' ? 1 : tl.visited ? 3 : tl.revealed ? 2 : 0; if (cells[r * 16 + c] !== v) ok = false; }
    t.ok(ok, 'it unpacks to the same hexes');
    t.ok(mp.p === 10 * 16 + 3 + 5 && cells.length === 352, 'the crawler as a cell index');
    t.ok(DATA.hisMapPack(null) === null && DATA.hisMapCells({ w: 16, h: 22, g: 'AB' }) === null && DATA.hisMapCells(null) === null, 'no map, a broken map');
    t.ok(DATA.hisRecFix(recOf(5, { mp: { w: 16, h: 22, g: 'x' } })).mp === undefined, 'a broken map is dropped from a record');
  });

  t.test('history: the recap line and the tips for sample deaths', () => {
    const base = { name: 'Ironjaw', mv: 'Unleash', amt: 129, maxHp: 80, grabsLeft: 0, tier: 'elite' };
    const gape = Object.assign({}, base, { kind: 'hit', charged: true, chargeName: 'Gape', verb: 'opening wide' });
    t.eq(DATA.hisKillLine(gape), 'Killed by Ironjaw with Gape for 129', 'a charged hit is named by its charge');
    t.eq(DATA.hisTips(gape)[0], "Ironjaw's Gape hits for 129 on the turn after opening wide. Stack Block or kill it first.", 'the charge tip leads');
    t.ok(/took 161% of your max HP/.test(DATA.hisTips(gape)[1]), 'then the size of the hit');
    const grabs = DATA.hisTips(Object.assign({}, gape, { grabsLeft: 3 }));
    t.eq(grabs[1], 'You had 3 unused grabs on your last turn. Every grab is a shield or a hit you did not play.', 'unused grabs');
    t.ok(DATA.hisTips(Object.assign({}, base, { kind: 'hit', grabsLeft: 1 }))[0].indexOf('1 unused grab on') > 0, 'one grab, singular');
    t.ok(/LETHAL: 42 more Block/.test(DATA.hisTips({ kind: 'hit', name: 'Rat', amt: 5, maxHp: 80, lethal: true, need: 42 })[0]), 'the lethal preview');
    t.eq(DATA.hisKillLine({ kind: 'burn', amt: 6 }), 'Burned down: your own Burn did the last 6', 'burn');
    t.ok(/^Burn ticks through Block/.test(DATA.hisTips({ kind: 'burn', amt: 6, maxHp: 80 })[0]), 'the burn tip');
    t.ok(/^Poison ticks/.test(DATA.hisTips({ kind: 'poison', amt: 4, maxHp: 80 })[0]) && DATA.hisKillLine({ kind: 'poison', amt: 4 }) === 'Poison finished you for 4', 'poison');
    t.ok(/lit bomb/.test(DATA.hisTips({ kind: 'bomb', amt: 12, maxHp: 80 })[0]) && /bomb in the bin went off for 12/.test(DATA.hisKillLine({ kind: 'bomb', amt: 12 })), 'a bomb');
    t.ok(/hit you 4 times in one turn/.test(DATA.hisTips({ kind: 'hit', name: 'Swarm', amt: 6, hits: 4, maxHp: 80 })[0]), 'a flurry');
    t.ok(/on 3 turns in a row with no Block/.test(DATA.hisTips({ kind: 'hit', name: 'Rat', amt: 6, bare: 3, maxHp: 80 })[0]), 'no Block up');
    t.ok(/Bosses change their pattern/.test(DATA.hisTips({ kind: 'hit', name: 'Hoard', amt: 9, maxHp: 80, tier: 'boss' })[0]), 'a boss');
    t.eq(DATA.hisKillLine({ kind: 'self', amt: 3 }), 'Your own bin hit you for 3', 'your own bin');
    t.eq(DATA.hisKillLine({ name: 'a bad decision' }), 'Killed by a bad decision', 'a death outside a fight');
    const one = DATA.hisTips({});
    t.ok(one.length === 1 && /INCOMING pill/.test(one[0]), 'nothing known: one general tip');
    for (const rc of [gape, { kind: 'burn', amt: 1 }, {}, { kind: 'hit', hits: 9, bare: 9, grabsLeft: 9, lethal: true, need: 9, amt: 999, maxHp: 1, tier: 'boss' }]) t.ok(DATA.hisTips(rc).length >= 1 && DATA.hisTips(rc).length <= 2, 'one or two tips');
  });
}

// ---------- round 8: stories, the rival, alternate bosses (DESIGN.md "Stories, the rival and alternate bosses (round 8)")
t.test('stories: 8 to 10 of them, every beat reachable, a visit is 2 to 4 beats', () => {
  const SD = DATA.STORIES, ids = DATA.STORY_IDS;
  t.ok(ids.length >= 8 && ids.length <= 10, `8 to 10 stories [${ids.length}]`);
  const later = {};
  for (const id of ids) for (const b of Object.values(SD[id].beats)) for (const ch of b.choices) for (const c of [ch.call, ch.roll && ch.roll.win.call, ch.roll && ch.roll.lose.call]) if (c && c.k === 'later') later[id + ':' + c.beat] = 1;
  for (const id of ids) {
    const S0 = SD[id], W = 'story ' + id;
    t.ok(/^sto_/.test(id) && S0.id === id && !EVENTS[id], `${W}: its own id, not an old event`);
    t.ok(typeof S0.title === 'string' && S0.title.length > 3 && !S0.title.includes(String.fromCharCode(8212)), `${W}: title`);
    t.ok(Array.isArray(S0.acts) && S0.acts.length && S0.acts.every(a => [1, 2, 3].includes(a)), `${W}: acts`);
    t.ok(!!S0.beats.start, `${W}: a start beat`);
    const beats = Object.keys(S0.beats);
    t.ok(beats.length >= 2 && beats.length <= 5, `${W}: 2 to 5 beats [${beats.length}]`);
    const edges = (b) => { const out = []; for (const ch of S0.beats[b].choices) { if (ch.go) out.push(ch.go); if (ch.roll) for (const br of [ch.roll.win, ch.roll.lose]) if (br && br.go) out.push(br.go); } return out; };
    // the longest walk in one visit
    const depth = (b, seen) => { if (seen.has(b)) return 99; const s = new Set(seen); s.add(b); let d = 1; for (const n of edges(b)) d = Math.max(d, 1 + depth(n, s)); return d; };
    t.ok(depth('start', new Set()) <= 4, `${W}: a visit is at most 4 beats [${depth('start', new Set())}]`);
    const reach = new Set(['start']), q = ['start'];
    while (q.length) for (const n of edges(q.shift())) { t.ok(!!S0.beats[n], `${W}: go ${n} exists`); if (S0.beats[n] && !reach.has(n)) { reach.add(n); q.push(n); } }
    for (const b of beats) t.ok(reach.has(b) || later[id + ':' + b], `${W}: beat ${b} is reachable (or a later act's)`);
    t.ok(beats.some(b => b !== 'start' && reach.has(b)) || beats.length >= 2, `${W}: branches past its start`);
    for (const b of beats) {
      const B = S0.beats[b], txt = DATA.stoBeatText(B, { score: 3 });
      t.ok(txt.length > 20 && txt.length < 260 && !txt.includes(String.fromCharCode(8212)), `${W} ${b}: text`);
      t.ok(B.choices.length >= 1 && B.choices.length <= 3, `${W} ${b}: 1 to 3 choices`);
      for (const ch of B.choices) {
        t.ok(ch.txt && ch.txt.length < 40 && ch.sub && ch.sub.length < 90 && !(ch.txt + ch.sub).includes(String.fromCharCode(8212)), `${W} ${b}: choice copy "${ch.txt}"`);
        for (const f of (ch.fx || []).concat(ch.roll ? (ch.roll.win.fx || []).concat(ch.roll.lose.fx || []) : [])) t.ok(EVENT_FX.includes(f.k) || f.k === 'pet', `${W} ${b}: fx ${f.k}`);
        if (ch.roll) t.ok(ch.roll.p > 0 && ch.roll.p < 1 && ch.roll.win && ch.roll.lose, `${W} ${b}: a roll has odds and two branches`);
        for (const c of [ch.call, ch.roll && ch.roll.win.call, ch.roll && ch.roll.lose.call]) if (c) t.ok(['ally', 'hunt', 'later', 'boss', 'shop'].includes(c.k) && (c.k !== 'later' || !!S0.beats[c.beat]), `${W} ${b}: callback ${c.k}`);
      }
    }
  }
  const kinds = new Set();
  for (const id of ids) for (const b of Object.values(SD[id].beats)) for (const ch of b.choices) for (const c of [ch.call, ch.roll && ch.roll.win.call, ch.roll && ch.roll.lose.call]) if (c) kinds.add(c.k);
  t.eq([...kinds].sort().join(), 'ally,boss,hunt,later,shop', 'every kind of callback is used');
  t.ok(ids.filter(id => Object.values(SD[id].beats).some(b => b.choices.some(ch => ch.roll))).length >= 5, 'five or more stories roll the dice');
});
t.test('stories: choosing, state, callbacks, due dates, repair', () => {
  const SD = DATA.STORIES, run = { gold: 100, maxHp: 70, act: 1 };
  const lucky = () => 0, unlucky = () => 0.99;
  let r = DATA.stoChoose('sto_crab', 'start', 0, {}, run, lucky);
  t.ok(r.win === true && r.next === 'free', 'a won roll goes down its win branch');
  r = DATA.stoChoose('sto_crab', 'start', 0, {}, run, unlucky);
  t.ok(r.win === false && r.next === 'pinch', 'a lost roll goes down the other');
  r = DATA.stoChoose(SD.sto_crab, 'free', 0, {}, run, lucky);
  t.ok(r.next === null && r.calls.length === 1 && r.calls[0].k === 'ally' && r.calls[0].pow === 2 && r.set.fed === 1 && r.fx.some(f => f.k === 'hp' && f.v === -4), 'the snack: a stronger ally, a flag, 4 HP');
  t.eq(DATA.stoChoose('sto_crab', 'start', 1, {}, { gold: 5 }, lucky), null, 'a choice you cannot afford is closed');
  t.eq(DATA.stoChoose('sto_crab', 'nope', 0, {}, run, lucky), null, 'an unknown beat is null');
  r = DATA.stoChoose('sto_dance', 'start', 0, {}, run, lucky);
  t.ok(r.add.score === 1 && r.next === 'r2', 'the dance adds to its score');
  const end = SD.sto_dance.beats.end;
  t.ok(DATA.stoOk(end.choices[0], run, { score: 4 }) && !DATA.stoOk(end.choices[0], run, { score: 3 }), 'the stash only for a winning score');
  t.ok(DATA.stoOk(end.choices[2], run, { score: 1 }) && !DATA.stoOk(end.choices[2], run, { score: 2 }), 'the mop for a low score');
  t.ok(/Final score: 4/.test(DATA.stoBeatText(end, { score: 4 })) && /needed 4/.test(DATA.stoBeatText(end, { score: 2 })), 'a beat reads the story state');
  t.ok(DATA.stoOk({ cond: () => { throw new Error('x'); } }, run, {}) === false, 'a throwing cond is closed');
  // due dates: a boss call in its own act, the rest from the next act on; Endless loops count on
  t.eq(DATA.stoStage({ act: 2 }), 2, 'stage = act');
  t.eq(DATA.stoStage({ act: 1, endless: { loop: 2 } }), 7, 'an Endless loop adds three acts');
  t.ok(!DATA.stoDue({ k: 'ally', stage: 1 }, { act: 1 }) && DATA.stoDue({ k: 'ally', stage: 1 }, { act: 2 }), 'an ally from the next act on');
  t.ok(DATA.stoDue({ k: 'boss', stage: 2 }, { act: 2 }) && !DATA.stoDue({ k: 'boss', stage: 2 }, { act: 1 }), 'a boss call in its own act');
  t.ok(!DATA.stoDue({ k: 'later', stage: 1, done: true }, { act: 3 }), 'a paid call is not due');
  // picking: unseen, told in the act
  const seen = { sto: { seen: {} } };
  for (const id of DATA.STORY_IDS) if (SD[id].acts.includes(3)) { const R0 = { act: 3, sto: { seen: {} } }; t.ok(DATA.STORY_IDS.filter(x => SD[x].acts.includes(3)).includes(DATA.stoPick(U.rng(id.length), R0)), 'an act 3 story for act 3'); break; }
  for (const id of DATA.STORY_IDS) seen.sto.seen[id] = 1;
  t.eq(DATA.stoPick(U.rng(1), Object.assign({ act: 1 }, seen)), null, 'every story told: none left');
  // repair
  const fresh = DATA.stoFix(null, 12);
  t.ok(fresh.calls.length === 0 && typeof fresh.gary.on === 'boolean', 'a new run: fresh state, Gary rolled');
  let on = 0;
  for (let s = 1; s <= 400; s++) if (DATA.stoFix(null, s).gary.on) on++;
  t.ok(on > 300 && on < 380, `Gary turns up in most runs [${on}/400]`);
  const old = DATA.stoFix({}, 12);
  t.ok(old.gary.on === false && old.calls.length === 0, 'a save from before: Gary off');
  const junk = DATA.stoFix({ st: 5, seen: { sto_crab: 1, nope: 1 }, cur: { id: 'sto_crab', beat: 'zzz' }, calls: [{ k: 'ally', stage: 'x' }, { k: 'bad' }, null], alt: { 1: 'plushqueen', 2: 'nope', x: 'hoard', 4: '' }, gary: { on: 1, w: -3, duel: 'maybe' } }, 3);
  t.ok(junk.seen.sto_crab && !junk.seen.nope && junk.cur === null && junk.calls.length === 1 && junk.calls[0].stage === 1, 'junk repaired');
  t.ok(junk.alt[1] === 'plushqueen' && !('2' in junk.alt) && !('x' in junk.alt) && junk.alt[4] === '', 'alt boss picks repaired');
  t.ok(junk.gary.on === true && junk.gary.w === 0 && junk.gary.duel === '', 'Gary repaired');
});
t.test('the rival: gear, taunts, the claw-off pile and its prizes', () => {
  const G0 = DATA.GARY;
  t.eq(DATA.garyGear({}), 0, 'no record: the rookie cap');
  t.eq(DATA.garyGear({ wins: 2 }), 1, 'two claw-offs lost: shades');
  t.eq(DATA.garyGear({ wins: 2, beat: 1 }), 2, 'a showdown lost too: the chain');
  t.eq(DATA.garyGear({ wins: 99, beat: 9 }), G0.gear.length - 1, 'capped at the turbo claw');
  const first = DATA.garyTaunt({}, 'meet', () => 0);
  t.ok(DATA.GARY_LINES.first.includes(first), 'the first meeting introduces him');
  t.ok(DATA.GARY_LINES.behind.includes(DATA.garyTaunt({ met: 3, offs: 3, wins: 0, losses: 3 }, 'meet', () => 0)), 'ahead of you: smug');
  t.ok(/pro shades/.test(DATA.garyTaunt({ met: 3, offs: 3, wins: 2, losses: 1 }, 'meet', () => 0)), 'behind: shows off the new gear');
  t.ok(DATA.GARY_LINES.rematch.includes(DATA.garyTaunt({ met: 1, offs: 1 }, 'off', () => 0)), 'a rematch');
  t.ok(DATA.GARY_LINES.duel.includes(DATA.garyTaunt({ met: 2 }, 'duel', () => 0)), 'the showdown');
  for (const k in DATA.GARY_LINES) for (const s of DATA.GARY_LINES[k]) t.ok(s.length < 130 && !s.includes(String.fromCharCode(8212)), 'line ' + k);
  const pile = DATA.garyPile(U.rng(5), 1);
  const by = {};
  for (const p of pile) by[p.id === 'rock' ? 'junk' : ITEMS[p.id].rarity] = (by[p.id === 'rock' ? 'junk' : ITEMS[p.id].rarity] || 0) + 1;
  t.ok(pile.length === 13 && by.l === 1 && by.r === 2 && by.u === 3 && by.c === 5 && by.junk === 2, 'the pile: one of every good thing, two rocks ' + JSON.stringify(by));
  t.ok(pile.every(p => p.v === DATA.garyVal(ITEMS[p.id])) && pile.some(p => p.v === 7), 'values by rarity (a legendary is 7)');
  t.eq(JSON.stringify(DATA.garyPile(U.rng(5), 1)), JSON.stringify(pile), 'deterministic by seed');
  const w = DATA.garyPrize(2, 'win'), l = DATA.garyPrize(2, 'lose'), tie = DATA.garyPrize(2, 'tie');
  t.ok(w.gold > tie.gold && tie.gold > l.gold && w.cap && !l.cap && w.tix > l.tix, 'win beats tie beats a loss');
  t.ok(DATA.garyPrize(3, 'win').gold > DATA.garyPrize(1, 'win').gold, 'more gold later in the tower');
  const gf = DATA.garyFix({ met: '3', wins: -2, beat: 'x', losses: 4.7 });
  t.ok(gf.met === 3 && gf.wins === 0 && gf.beat === 0 && gf.losses === 4 && gf.ties === 0, 'the record repaired');
});
t.test('the new monsters: the Card Shark, Grabby Gary, three alternate bosses', () => {
  for (const id of ['cardshark', 'gary', 'plushqueen', 'conveyorking', 'arcticarcade']) {
    const e = ENEMIES[id];
    t.ok(e && e.look === id && e.taunt && e.desc && e.enrage, `${id}: look, taunt, desc, phase two`);
    for (const act of [1, 2, 3]) for (const tier of ['normal', 'elite', 'boss']) t.ok(!ENCOUNTERS[act][tier].some(enc => enc.includes(id)), `${id} is not in act ${act}'s ${tier} pool (it comes by its own road)`);
  }
  t.ok(ENEMIES.gary.rival && ENEMIES.gary.tier === 'elite' && ENEMIES.gary.act === 3, 'Gary: an act 3 elite with his own claw');
  t.ok(ENEMIES.cardshark.tier === 'elite' && ENEMIES.cardshark.act === 2, 'the Card Shark: an act 2 elite');
  const SIG = { plushqueen: 'plush', conveyorking: 'belt', arcticarcade: 'glacier' };
  for (const act of [1, 2, 3]) {
    const alt = DATA.stoAltOf(act), own = DATA.STO.own[act];
    t.ok(ENEMIES[alt].tier === 'boss' && ENEMIES[alt].act === act && ENEMIES[alt].sig.id === SIG[alt], `act ${act}: ${alt} with its own signature`);
    t.ok(ENCOUNTERS[act].boss.some(enc => enc.includes(own)), `act ${act}: the alternate stands in for ${own}`);
    const hp = ENEMIES[alt].hp[0] + (ENEMIES[alt].onDeath && ENEMIES[alt].onDeath.k === 'summon' ? ENEMIES[ENEMIES[alt].onDeath.id].hp[0] : 0);
    t.ok(hp >= { 1: 90, 2: 150, 3: 280 }[act], `act ${act}: ${alt} is a full boss fight [${hp}]`);
  }
  t.eq(ENEMIES.arcticarcade.onDeath.id, 'prizemaster', 'the Prize Master still steps out after the act 3 boss');
  const mix = new Set();
  for (let s = 1; s <= 200; s++) mix.add(DATA.endlessMix(U.rng(s), 1));
  t.ok(mix.has('conveyorking') && mix.has('arcticarcade') && !mix.has('machine'), 'Endless bosses may borrow the new tricks');
  for (const id of ['sto_plush', 'sto_crate'].concat(DATA.STO_ICE)) {
    t.ok(ITEMS[id] && ITEMS[id].rarity === 'junk' && ITEMS[id].exhaust && ITEMS[id].sto, `${id}: boss junk, reachable`);
    t.ok(!Object.keys(ITEMS).includes(id) && !DATA.dexEntries().items.includes(id), `${id}: never listed, pooled or in the Prizedex`);
  }
  t.eq(DATA.STO_ICE.length, 6, 'the ice block grows six sizes');
  t.ok(DATA.STO_ICE.every((id, i) => i === 0 || ITEMS[id].shape.verts[1].x > ITEMS[DATA.STO_ICE[i - 1]].shape.verts[1].x), 'each size bigger than the last');
  const dex = DATA.dexEntries().enemies;
  t.ok(['cardshark', 'gary', 'plushqueen', 'conveyorking', 'arcticarcade'].every(id => dex.includes(id)), 'all five in the Prizedex');
  for (const id of ['rival_crusher', 'full_circle']) t.ok(DATA.ACHIEVEMENTS[id] && DATA.ACH_IDS.includes(id), 'sticker ' + id);
  t.ok(DATA.achCheck({ kind: 'meta', meta: { gary: { beat: 1 } } }, {}).includes('rival_crusher'), 'Rival Crusher: a showdown won');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { sto: { pays: 1 } } }, {}).includes('full_circle'), 'Full Circle: a callback paid off');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: {} }, {}).includes('full_circle'), 'not before');
});

// ------------------------------------------------ round 8: Mama Mech and two new claws
// DESIGN.md "Mama Mech and two new claws (round 8)": the fifth crawler, her
// scrap turret kit, the Vacuum Nozzle and the Twin Claws.
t.test('round 8: Mama Mech, the Engineer', () => {
  const c = CHARACTERS.engineer;
  t.ok(c && c.name === 'Mama Mech' && c.title === 'The Engineer', 'Mama Mech, The Engineer');
  t.eq(c.bin.length, 19, 'a 19 item starting bin');
  t.ok(c.bin.every(id => ITEMS[id]), 'every bin item exists');
  t.ok(c.bin.filter(id => ITEMS[id].char === 'engineer').length >= 10 && c.bin.every(id => R8_ITEMS.includes(id) || !ITEMS[id].char), 'the bin is mostly her new kit');
  t.ok(c.bin.filter(id => (ITEMS[id].tags || []).includes('metal')).length >= 12, 'and mostly metal (turret parts)');
  t.ok(c.turret === true && c.relic === 'socket_set' && RELICS.socket_set.starter && RELICS.socket_set.rarity === 'event', 'her gift: the turret; her starter: the Socket Set');
  t.ok(c.hp === 84 && c.gold > 0 && c.claw.grabs === 3, 'hp, gold, grabs');   // (round 16: hp 75 -> 84)
  t.eq(c.unlock, 'act2', 'unlocked by reaching act 2');
  t.eq(c.vsLine, 'Hold still. Measuring you.', 'her versus line');
  const seen = new Set();
  for (let d = 0; d < 200; d++) seen.add(DATA.dailyChar('2026-12-' + d));
  t.ok(seen.has('engineer'), 'the daily rotation deals her in');
  for (const r of ['c', 'u', 'r', 'l']) t.ok(DATA.pool(r, 'engineer').length >= (r === 'l' ? 1 : 2), `pool ${r}/engineer has choices`);
  for (let seed = 1; seed <= 200; seed++) {
    const r = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), 'engineer');
    if (r.length !== 3 || !r.every(id => ITEMS[id] && !ITEMS[id].starter && (!ITEMS[id].char || ITEMS[id].char === 'engineer'))) { t.ok(false, `engineer rewards seed ${seed} [${r}]`); break; }
  }
  t.ok(true, 'her reward screens only offer shared and engineer items');
  for (const id of R8_ITEMS) {
    const d = ITEMS[id];
    t.ok(d.char === 'engineer' && (d.tags || []).includes('metal'), `${id}: hers and metal`);
    t.ok(d.part == null || (Number.isInteger(d.part) && d.part >= 2 && d.part <= 6), `${id}: a sane part count`);
  }
  t.ok(R8_ITEMS.some(id => ITEMS[id].rarity === 'l'), 'a legendary of her own');
  t.ok(DATA.CR8 && DATA.CR8.TUR_NAMES.length === 6 && DATA.CR8.TUR_TIP.length > 20, 'the turret\'s words');
});

t.test('round 8: her relics, outfits, stickers and evolutions', () => {
  for (const id of R8_RELICS) t.ok(RELICS[id] && RELICS[id].text && RELICS[id].name, `${id} exists`);
  t.ok(!RELICS.blueprints.starter && RELICS.blueprints.rules.turret === 1, 'Blueprints: a pool relic, a rule');
  t.ok(RELICS.armor_piercing.tur && RELICS.armor_piercing.tur.amp === 2, 'AP rounds: +2 a shot');
  t.ok(RELICS.grease_gun.hooks && RELICS.grease_gun.hooks.onTurnEnd, 'Grease Gun: an end-of-turn hook');
  const fits = DATA.vaultList('outfit', 'engineer');
  for (const id of ['fit_mama_welder', 'fit_mama_hardhat']) t.ok(fits.includes(id) && DATA.COSMETICS[id].look.style, `${id}: an outfit of hers`);
  t.ok(DATA.vaultPrice('fit_mama_welder') > 0 && DATA.vaultPrice('fit_mama_hardhat') > 0, 'both for sale');
  for (const id of ['fully_armed', 'clean_sweep']) t.ok(DATA.ACHIEVEMENTS[id] && DATA.ACH_IDS.includes(id), `sticker ${id}`);
  t.ok(DATA.ACH_IDS.length <= 63, `the sticker board holds 63 at most (${DATA.ACH_IDS.length})`);
  const tick = (n, clawType) => DATA.achCheck({ kind: 'tick', run: { clawType }, f: { grab: n } }, {});
  t.ok(tick(3, 'vacuum').includes('clean_sweep'), 'Clean Sweep: three up the hose in one grab');
  t.ok(!tick(2, 'vacuum').includes('clean_sweep') && !tick(3, 'classic').includes('clean_sweep'), 'not two, not another claw');
  for (const [evo, from, relic] of [['thunder_bolt', 'hex_bolt', 'dynamo'], ['mech_plating', 'tin_plate', 'blueprints']]) {
    t.ok(DATA.evoOf(from) && DATA.evoOf(from).to === evo && DATA.evoOf(from).relic === relic && RELICS[relic], `${from} + ${relic} evolves into ${evo}`);
    t.ok(ITEMS[evo] && ITEMS[evo].evolved && DATA.EVO_FX['evo:' + evo], `${evo}: an evolved item with an aura`);
  }
  t.ok(CHARACTERS.engineer.bin.some(x => DATA.evoOf(x)), 'a starter item can evolve');
});

t.test('round 8: the Vacuum Nozzle and the Twin Claws', () => {
  for (const id of ['vacuum', 'twin']) {
    const c = DATA.CLAWS[id];
    t.ok(c && c.name && c.icon && c.color && c.text && c.joke && c.good && c.bad, `${id}: named and described`);
    t.ok(c.stats && [c.stats.grip, c.stats.reach, c.stats.speed].every(v => v >= 1 && v <= 5), `${id}: picker stats`);
    t.ok(c.ups && Object.keys(c.ups).length >= 2, `${id}: says what the upgrades do`);
    t.eq(DATA.clawType(id), c, `${id}: clawType finds it`);
  }
  t.ok(DATA.CLAWS.vacuum.order !== DATA.CLAWS.twin.order, 'their own places in the picker');
  t.eq(DATA.clawType('nope'), DATA.CLAWS.classic, 'an unknown claw is the classic');
});

// FAMILY (round 9): three enemy families, one per act, and the Vending Gang's cans.
t.test('round 9: the enemy families', () => {
  const { FAM, FAM_IDS, FAM_KINDS, FAM_ENEMIES } = DATA;
  t.ok(FAM && Array.isArray(FAM_IDS) && FAM_IDS.length === 3, 'DATA.FAM and three family ids');
  t.eq(FAM_KINDS.join(','), 'restock,cans,change', 'the new move kinds');
  const acts = new Set();
  for (const f of FAM_IDS) {
    const c = FAM[f], W = 'family ' + f;
    t.ok(c && c.id === f && c.name && c.icon && isHex(c.color) && isHex(c.color2) && c.tag && c.bond.length > 30, `${W}: named, coloured, a tag and a bond line`);
    acts.add(c.act);
    t.eq(c.members.length, 3, `${W}: three members`);
    for (const id of c.members) {
      const e = ENEMIES[id];
      t.ok(!!e && e.fam === f && e.act === c.act && e.tier === 'normal' && !e.minion, `${W}: ${id} is an act ${c.act} normal of the family`);
      t.ok(e && typeof e.look === 'string' && e.look === id && ENEMY_ART.includes(e.art), `${W}: ${id} has its own look over a drawable art key`);
      t.ok(e && JSON.stringify(e).indexOf(String.fromCharCode(0x2014)) < 0, `${W}: ${id} no em dashes`);
    }
    // encounter pools: two duos and the whole family, in the act's normal list
    const pools = ENCOUNTERS[c.act].normal.filter(enc => enc.some(id => ENEMIES[id].fam === f));
    t.ok(pools.length >= 3 && pools.some(enc => enc.length === 3) && pools.every(enc => enc.every(id => ENEMIES[id].fam === f)), `${W}: its own encounters (${pools.length})`);
    t.eq(DATA.famsIn(c.members).join(), f, `${W}: famsIn`);
    t.eq(DATA.famOf(c.members[0]), f, `${W}: famOf`);
  }
  t.eq([...acts].sort().join(), '1,2,3', 'one family per act');
  t.eq(DATA.famOf('rat'), null, 'a rat has no family');
  t.eq(FAM_ENEMIES.length, 9, 'nine members');
  // the Band: a SOLO value for every member, the drummer's double beat
  const B = FAM.band;
  t.ok(B.max >= 4 && B.per >= 1 && B.beat.fam_drummer === 2 && B.harm > 0 && B.drop > 0, 'the Band: meter, beat, harmony and drop');
  t.ok(B.members.every(id => B.solo[id] > 0), 'every bandmate has a SOLO value');
  // the Vending Gang's moves and the can
  const kinds = new Set();
  for (const id of FAM.vending.members) for (const m of ENEMIES[id].moves) kinds.add(m.k);
  t.ok(['restock', 'cans', 'change'].every(k => kinds.has(k)), 'the gang restocks, lobs cans and makes change');
  t.ok(ENEMIES.fam_change.moves.some(m => m.k === 'change' && m.v > 0), 'the Change Machine takes gold');
  const can = ITEMS.fam_can;
  t.ok(can && can.rarity === 'junk' && can.tags.includes('junk') && can.exhaust && can.fx.length, 'the Empty Can is junk you can grab out');
  t.ok(Object.keys(ITEMS).indexOf('fam_can') < 0, 'the can is never listed (no pool, shop or Prizedex)');
  t.ok(DATA.itemText(can, false).indexOf('{v}') < 0 && /1 HP/.test(DATA.itemText(can, false)), 'its text fills in: ' + DATA.itemText(can, false));
  // the Choir hums on the same pattern step: equal pattern lengths, the hum at the same index, an attack with fam 'chorus'
  const C = FAM.choir.members.map(id => ENEMIES[id]);
  const at = C.map(e => e.pattern.findIndex(i => e.moves[i].fam === 'chorus'));
  t.ok(C.every(e => e.ai === 'cycle' && e.pattern.length === C[0].pattern.length), 'the choir share one pattern length');
  t.ok(at.every(i => i >= 0 && i === at[0]), 'the hum sits on the same step for every globe');
  t.ok(C.every(e => e.moves.some(m => m.fam === 'chorus' && m.k === 'attack' && m.v > 0)), 'the hum is an attack');
  t.ok(FAM.choir.angry > 0 && FAM.choir.harm > 0, 'the choir: anger and harmony');
});

/* ---------------------------------------------------------------- LORE (round 9): the Codex, landmark lore, act intros, the weekly challenge */
const LORE_DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');   // en and em dashes, spelled without typing them
t.test('lore: the Codex book, its chapters and pages, the words', () => {
  const B = DATA.loreBook();
  t.ok(B === DATA.loreBook(), 'the book is built once and kept');
  t.eq(B.chapters.length, 8, 'eight chapters');
  t.eq(JSON.stringify(B.chapters.map(c => c.id)), JSON.stringify(['spire', 'master', 'floors', 'crawlers', 'bosses', 'bestiary', 'gary', 'machine']), 'in reading order');
  t.ok(B.entries.length >= 40, `at least 40 pages (${B.entries.length})`);
  t.eq(new Set(B.ids).size, B.ids.length, 'page ids are unique');
  t.eq(new Set(B.entries.map(e => e.name)).size, B.ids.length, 'page names are unique');
  for (const c of B.chapters) t.ok((B.ch[c.id] || []).length >= 3, `${c.id}: three pages or more`);
  t.ok(B.chapters.filter(c => c.spoiler).map(c => c.id).join() === 'machine', 'The Machine is the one spoiler chapter');
  t.eq(B.ch.crawlers.length, Object.keys(CHARACTERS).length, 'one page per crawler');
  for (const id of Object.keys(CHARACTERS)) t.ok(B.entries.some(e => e.ch === 'crawlers' && e.r[0] === 'win' && e.r[1] === id), `${id} has a page, earned by a win`);
  for (const id of ['hoard', 'smelter', 'glacius', 'plushqueen', 'conveyorking', 'arcticarcade']) t.ok(B.entries.some(e => e.ch === 'bosses' && e.r[0] === 'kills' && e.r[1] === id && e.r[2] === 1), `the boss ${id} has a page, earned by beating it`);
  for (const e of B.entries) {
    const W = 'page ' + e.id;
    const words = e.text.split(/\s+/).filter(Boolean).length;
    t.ok(words >= 60 && words <= 120, `${W}: 60 to 120 words (${words})`);
    t.ok(B.chapters.some(c => c.id === e.ch), `${W}: a known chapter`);
    t.ok(DATA.LORE_ART.includes(e.art.k), `${W}: a known picture (${e.art.k})`);
    t.ok(DATA.LORE_RULES.includes(e.r[0]), `${W}: a known unlock rule (${e.r[0]})`);
    if (e.art.k === 'enemy') t.ok(!!ENEMIES[e.art.id], `${W}: its enemy exists (${e.art.id})`);
    if (e.art.k === 'char') t.ok(!!CHARACTERS[e.art.id], `${W}: its crawler exists`);
    if (e.r[0] === 'kills' || e.r[0] === 'seen') t.ok(!!ENEMIES[e.r[1]], `${W}: its rule names a real enemy (${e.r[1]})`);
    const s = JSON.stringify([e.name, e.text, e.hint || '']);
    t.ok(!LORE_DASH.test(s), `${W}: no em or en dashes`);
    t.ok(!/\bink/i.test(s), `${W}: never says ink`);
    t.ok(/[.!?]$/.test(e.text), `${W}: ends a sentence`);
  }
  for (const c of B.chapters) t.ok(c.name && c.icon && /^#[0-9a-f]{6}$/i.test(c.col) && c.blurb && !LORE_DASH.test(c.blurb), `${c.id}: a name, an icon, a colour and a blurb`);
});

t.test('lore: unlock rules read the profile (kills, bosses, acts, wins per crawler, keys, Gary, loops, Tilt)', () => {
  const none = DATA.loreCheck({}, {});
  t.eq(none.length, 0, 'a blank profile has earned nothing');
  t.eq(DATA.loreCheck(null, null).length, 0, 'no profile at all: nothing, no throw');
  const has = (m, id) => DATA.loreOk(id, m);
  t.ok(has({ stats: { runs: 1 } }, 'spire_tower') && !has({ stats: { runs: 0 } }, 'spire_tower'), 'the first climb opens The Tower');
  t.ok(has({ stats: { fights: 1 } }, 'fl_cellar'), 'the first fight opens the Damp Arcade');
  t.ok(!has({ stats: { bestAct: 1 } }, 'fl_foundry') && has({ stats: { bestAct: 2 } }, 'fl_foundry') && has({ stats: { bestAct: 3 } }, 'fl_vault'), 'reaching an act opens its floor');
  t.ok(has({ stats: { played: 25 } }, 'spire_rig') && !has({ stats: { played: 24 } }, 'spire_rig'), 'deliveries count up to the Rig');
  t.ok(!has({ lore: { kills: { rat: 4 } } }, 'be_rat') && has({ lore: { kills: { rat: 5 } } }, 'be_rat'), 'five Coin Rats and not four');
  t.ok(!has({ lore: { kills: { mimic: 2 } } }, 'be_mimic') && has({ lore: { kills: { mimic: 3 } } }, 'be_mimic'), 'an elite takes three');
  t.ok(has({ lore: { kills: { hoard: 1 } } }, 'bo_hoard') && !has({ lore: { kills: { smelter: 0 } } }, 'bo_smelter'), 'a boss opens on its first defeat');
  t.ok(has({ winsBy: { rogue: 1 } }, 'cr_rogue') && !has({ winsBy: { rogue: 1 } }, 'cr_knight'), 'a win opens that crawler only');
  t.ok(has({ stats: { wins: 1 } }, 'pm_wall') && !has({ stats: { wins: 4 } }, 'pm_chair') && has({ stats: { wins: 5 } }, 'pm_chair'), 'wins open the Prize Master\'s pages');
  t.ok(has({ seen: { enemies: { prizemaster: 1 } } }, 'pm_host'), 'meeting the host opens The Host');
  t.ok(!has({ bestTilt: {} }, 'pm_tilt') && !has({ bestTilt: { knight: 2 } }, 'pm_tilt') && has({ bestTilt: { rogue: 3 } }, 'pm_tilt'), 'a win at Tilt 3 opens Tilt');
  t.ok(has({ loot: { caps: 5 } }, 'spire_tickets') && has({ arc: { plays: 5 } }, 'spire_cabinets'), 'capsules and cabinets');
  t.ok(has({ sec: { keys: 1 } }, 'spire_keys') && has({ sec: { rooms: 1 } }, 'fl_room'), 'a golden key and the Back Room');
  t.ok(has({ endless: { best: 1 } }, 'spire_loop'), 'a loop of Endless');
  t.ok(has({ gary: { met: 1 } }, 'gy_meet') && has({ gary: { wins: 1 } }, 'gy_beat') && has({ gary: { beat: 1 } }, 'gy_duel') && !has({ gary: { met: 1 } }, 'gy_duel'), 'Grabby Gary\'s three pages');
  const v = DATA.loreVal(['kills', 'rat', 5], { lore: { kills: { rat: 3 } } });
  t.ok(v.v === 3 && v.goal === 5, 'progress reads 3 of 5');
  t.eq(JSON.stringify(DATA.loreVal(['nope'], {})), JSON.stringify({ v: 0, goal: 1 }), 'an unknown rule reads nothing');
  // loreCheck: new ones only, in book order, and never mutating the profile
  const m = { stats: { runs: 3, fights: 12, played: 40, bestAct: 2 }, lore: { kills: { rat: 9 } } };
  const snap = JSON.stringify(m);
  const got = DATA.loreCheck(m, {});
  t.ok(['spire_tower', 'spire_rig', 'spire_dark', 'fl_cellar', 'fl_foundry', 'be_rat'].every(id => got.includes(id)), 'every earned page: ' + got.join(','));
  t.eq(JSON.stringify(m), snap, 'checking never changes the profile');
  const idx = got.map(id => DATA.loreBook().ids.indexOf(id));
  t.ok(idx.every((x, i) => i === 0 || x > idx[i - 1]), 'in book order');
  t.eq(DATA.loreCheck(m, { spire_tower: 1 }).includes('spire_tower'), false, 'owned pages are not earned twice');
});

t.test('lore: The Machine stays a secret until it is met; spoiler pages keep their hints vague', () => {
  const B = DATA.loreBook();
  t.ok(!DATA.loreChOpen('machine', {}) && DATA.loreChOpen('machine', { seen: { enemies: { machine: 1 } } }), 'the chapter opens when it has been met');
  t.ok(DATA.loreChOpen('spire', {}), 'every other chapter is open');
  t.ok(!DATA.loreOk('mc_down', { sec: { ends: 3 } }), 'no Machine page while the chapter is shut, whatever the counters say');
  t.ok(DATA.loreOk('mc_down', { sec: { ends: 1 }, seen: { enemies: { machine: 1 } } }), 'met and powered down: the page opens');
  for (const e of B.entries) {
    const h = DATA.loreHint(e, {});
    t.ok(typeof h === 'string' && h.length > 5 && !LORE_DASH.test(h) && !/\bink/i.test(h), `${e.id}: a hint (${h})`);
    if (e.spoiler || e.ch === 'machine') t.ok(!/machine|key|back room|door/i.test(h), `${e.id}: the hint gives nothing away`);
  }
  t.ok(/Coin Rat/.test(DATA.loreHint('be_rat', {})) && /5/.test(DATA.loreHint('be_rat', {})), 'a bestiary hint names the monster and the count');
  t.ok(/Lucky Lou/.test(DATA.loreHint('cr_gambler', {})), 'a crawler hint names the crawler');
});

t.test('lore: chapter progress, the count and the repaired profile', () => {
  const B = DATA.loreBook();
  const got = { spire_tower: 1, spire_rig: 1, be_rat: 1, nope: 1 };
  const P = DATA.loreProgress({ lore: { got, new: { be_rat: 1, spire_tower: 1 } } });
  t.eq(P.n, 3, 'three real pages owned (an unknown id does not count)');
  t.eq(P.total, B.entries.length, 'out of every page');
  t.ok(P.per.spire.n === 2 && P.per.spire.total === B.ch.spire.length && P.per.spire.fresh === 1, 'the Clawspire: 2 found, 1 NEW');
  t.ok(P.per.bestiary.n === 1 && P.per.bestiary.fresh === 1 && P.per.gary.n === 0, 'per chapter');
  t.eq(DATA.loreCount({ lore: { got } }), 3, 'loreCount');
  t.eq(DATA.loreCount({}), 0, 'no lore, no pages');
  const F = DATA.loreFix({ got: { spire_tower: 1, junk: 1, be_rat: 0 }, new: { spire_tower: 1, be_rat: 1 }, kills: { rat: '7', slime: -2, bat: 'x', ['x'.repeat(50)]: 3 }, intros: { a1: 2, a9: 1, L12: 1, room: 1, zz: 4 } });
  t.eq(JSON.stringify(F.got), JSON.stringify({ spire_tower: 1 }), 'got keeps known pages that are set');
  t.eq(JSON.stringify(F.new), JSON.stringify({ spire_tower: 1 }), 'NEW only on pages owned');
  t.eq(JSON.stringify(F.kills), JSON.stringify({ rat: 7 }), 'kills: whole positive numbers, sane ids');
  t.eq(JSON.stringify(F.intros), JSON.stringify({ a1: 2, L12: 1, room: 1 }), 'intros: known keys only');
  for (const junk of [null, 5, 'x', [], { got: [], kills: 'no' }]) { const f = DATA.loreFix(junk); t.ok(f && f.got && f.new && f.kills && f.intros, 'junk repairs: ' + JSON.stringify(junk)); }
});

t.test('lore: landmark snippets, the old high score board, act intros', () => {
  for (const k of ['tower', 'plinko', 'wheel', 'slots', 'moles', 'skee', 'petshop', 'jukebox', 'tickets', 'hiscore']) {
    const L = DATA.LORE_SNIPS[k];
    t.ok(Array.isArray(L) && L.length >= 3, `${k}: three lines or more`);
    t.ok(DATA.LORE_MARKS[k] && DATA.LORE_MARKS[k].name && DATA.LORE_MARKS[k].icon, `${k}: a name and an icon`);
    for (const s of L) t.ok(s.length <= 96 && /[.!?]$/.test(s) && !LORE_DASH.test(s) && !/\bink/i.test(s), `${k}: one short line: ${s}`);
    const a = DATA.loreSnippet(k, 77, 3, 4);
    t.ok(L.includes(a) && a === DATA.loreSnippet(k, 77, 3, 4), `${k}: a line, the same every time for a hex`);
    const seen = new Set();
    for (let q = 0; q < 12; q++) seen.add(DATA.loreSnippet(k, 77, q, 2));
    t.ok(seen.size >= 2, `${k}: different hexes say different things`);
  }
  t.eq(DATA.loreSnippet('nope', 1, 0, 0), '', 'an unknown landmark says nothing');
  // the board: the Prize Master on top for good, your best climbs with arcade initials, the regulars fill in
  const hof = [{ id: 'a', c: 'knight', s: 12000, d: 5 }, { id: 'b', c: 'rogue', s: 50000, d: 6 }, { id: 'c', c: 'gambler', s: 3000, d: 7 }, { id: 'd', c: 'alchemist', s: 1200000, d: 8 }, { id: 'e', c: 'engineer', s: 9000, d: 1 }];
  const rows = DATA.loreBoard(hof, 8);
  t.eq(rows.length, 8, 'eight rows');
  t.ok(rows.every((r, i) => r.rank === i + 1), 'ranked 1..8');
  t.ok(rows.every((r, i) => i === 0 || r.s <= rows[i - 1].s), 'highest first');
  t.ok(rows[0].you && rows[0].s === 1200000 && rows[1].who === 'prizemaster', 'a run over the Prize Master\'s mark tops it; he is second');
  t.ok(rows.every(r => /^[A-Z.!]{3}$/.test(r.ini)), 'three-letter arcade initials: ' + rows.map(r => r.ini).join(' '));
  t.ok(rows.filter(r => r.you).length === 3 && rows.find(r => r.id === 'b').ini === DATA.loreInitials(hof[1]), 'your three climbs that make the cut, each with its own initials');
  t.eq(DATA.loreBoard(hof, 20).filter(r => r.you).length, 5, 'a longer board lists all five');
  t.eq(rows.find(r => r.s === 9000 && r.you) ? 'you' : 'house', 'house', 'a tie goes to the regulars (they were here first)');
  const empty = DATA.loreBoard([], 8);
  t.ok(empty.length === 8 && empty.every(r => r.house) && empty[0].who === 'prizemaster' && empty[0].s === 999990, 'no history: the house\'s board, the Prize Master on top');
  t.eq(JSON.stringify(DATA.loreBoard(hof, 8)), JSON.stringify(rows), 'deterministic');
  t.ok(DATA.loreBoard([null, 5, { s: 'x' }, { id: 'z', c: 'knight', s: 100 }], 3).length === 3, 'junk records are skipped');
  // act intros
  for (const k of ['a1', 'a2', 'a3', 'room']) {
    const I = DATA.loreIntro(k);
    t.ok(I && I.title && I.name && I.lines.length === 2 && I.lines.every(l => l.length <= 52 && !LORE_DASH.test(l)) && ['cellar', 'foundry', 'vault', 'machine'].includes(I.biome), `${k}: a card (${I && I.name})`);
  }
  t.ok(DATA.loreIntro('a2').name === ACTS[2].name && DATA.loreIntro('a3').name === ACTS[3].name && DATA.loreIntro('a1').name === ACTS[1].name, 'the acts\' own names');
  const L4 = DATA.loreIntro('L4', 1), L2 = DATA.loreIntro('L2', 2);
  t.ok(L4.title === 'LOOP 4' && L4.biome === 'cellar' && L4.loop === 4 && L2.biome === 'foundry', 'a loop is its biome, again');
  t.ok(L4.lines.join() !== DATA.loreIntro('L5', 2).lines.join(), 'loops rotate their lines');
  t.eq(DATA.loreIntro('nope'), null, 'an unknown key has no card');
});

t.test('weekly: ISO weeks (year boundaries included), dates in every form, the time left', () => {
  const W = [
    ['2026-01-01', '2026-W01'], ['2027-01-01', '2026-W53'], ['2024-12-30', '2025-W01'], ['2021-01-03', '2020-W53'], ['2020-12-31', '2020-W53'],
    ['2026-09-28', '2026-W40'], ['2026-10-04', '2026-W40'], ['2026-10-05', '2026-W41'], ['2015-12-31', '2015-W53'], ['2016-01-03', '2015-W53'],
    ['2016-01-04', '2016-W01'], ['2018-12-31', '2019-W01'], ['2019-12-30', '2020-W01'], ['2022-01-02', '2021-W52'], ['2023-01-01', '2022-W52'],
  ];
  for (const [d, k] of W) t.eq(DATA.wkKey(d), k, `${d} is ${k}`);
  t.eq(DATA.wkKey(new Date(2027, 0, 1, 12)), '2026-W53', 'a Date');
  t.eq(DATA.wkKey(new Date(2026, 8, 30, 23, 59).getTime()), '2026-W40', 'a timestamp');
  t.eq(DATA.wkKey('junk'), '', 'junk has no week');
  t.eq(DATA.wkKey(null), '', 'nothing has no week');
  t.eq(DATA.wkIso('2026-10-04').dow, 6, 'Sunday is the last day of the week');
  // (a week with no clock change anywhere the suite might run)
  t.eq(DATA.wkLeft('2026-03-09'), 7 * 86400000, 'a Monday has the whole week left');
  t.eq(DATA.wkLeft('2026-03-15'), 86400000, 'a Sunday has a day left');
  t.eq(DATA.wkLeft(new Date(2026, 2, 15, 23, 0)), 3600000, 'Sunday 23:00: an hour left');
  t.eq(DATA.wkLeft(new Date(2026, 11, 31, 12, 0)), 3.5 * 86400000, 'across the new year it counts to Monday the 4th');
  t.ok(DATA.wkParse('2026-W53') && !DATA.wkParse('2025-W53') && !DATA.wkParse('2026-W00') && !DATA.wkParse('2026-W99') && !DATA.wkParse('x'), 'only real weeks parse (2026 has a W53, 2025 does not)');
  t.eq(DATA.wkParse('2026-W41').idx - DATA.wkParse('2026-W40').idx, 1, 'week indices count on');
  t.eq(DATA.wkParse('2021-W01').idx - DATA.wkParse('2020-W53').idx, 1, 'and across a W53');
  const l0 = SRC.indexOf('LORE (round 9'), l1 = SRC.indexOf('/LORE', l0);
  t.ok(l0 > 0 && l1 > l0 && !/Date\.now|new Date\(\)/.test(SRC.slice(l0, l1)), 'the lore and weekly code never reads the clock');
});

t.test('weekly: the seed, the theme and its mutators, the crawler and the claw, the medal targets', () => {
  const d = DATA.wkDef('2026-W40');
  t.ok(d && d.key === '2026-W40' && d.y === 2026 && d.w === 40, 'the week');
  t.eq(JSON.stringify(DATA.wkDef('2026-W40')), JSON.stringify(d), 'deterministic by the week');
  t.eq(d.seed, DATA.wkSeed('2026-W40'), 'its seed');
  t.eq(DATA.wkDef('nope'), null, 'no week, no challenge');
  const themes = new Set(), seeds = new Set();
  let prev = null, repeats = 0;
  for (let i = 0; i < 120; i++) {
    const key = DATA.wkKey(new Date(2025, 0, 6 + i * 7));
    const w = DATA.wkDef(key), T = DATA.WK.THEMES.find(x => x.id === w.theme);
    themes.add(w.theme); seeds.add(w.seed);
    t.ok(T && w.name === T.name && w.icon === T.icon, `${key}: a theme (${w.name})`);
    t.ok(w.muts.length >= 2 && w.muts.length <= 3 && w.muts[0] === T.lead, `${key}: the theme's own mutator and 1 or 2 more (${w.muts.join('+')})`);
    t.eq(JSON.stringify(DATA.mutClean(w.muts)), JSON.stringify(w.muts), `${key}: known, unique, no clash`);
    t.ok(!!CHARACTERS[w.char] && !!DATA.CLAWS[w.claw], `${key}: a crawler (${w.char}) and a claw (${w.claw})`);
    if (T.claws) t.ok(T.claws.includes(w.claw), `${key}: the theme's claw`);
    const tg = w.targets;
    t.ok(tg.bronze < tg.silver && tg.silver < tg.gold && tg.gold < tg.platinum && tg.bronze >= 50, `${key}: four rising targets`);
    t.eq(tg.gold, Math.max(50, Math.round(DATA.WK.BASE.gold * DATA.mutMult(w.muts) / 50) * 50), `${key}: scaled by the mutators' multiplier`);
    if (prev && prev === w.theme) repeats++;
    prev = w.theme;
  }
  t.eq(repeats, 0, 'a theme never comes two weeks running');
  t.eq(themes.size, DATA.WK.THEMES.length, 'every theme comes around');
  t.eq(seeds.size, 120, 'a seed of its own every week');
  t.ok(DATA.WK.THEMES.every(T => DATA.MUTATORS[T.lead] && T.blurb && !LORE_DASH.test(T.name + T.blurb)), 'every theme leads with a real mutator');
  // across the new year: consecutive weeks, still different
  const a = DATA.wkDef('2026-W53'), b = DATA.wkDef(DATA.wkKey('2027-01-04'));
  t.ok(a && b && b.key === '2027-W01' && a.theme !== b.theme && a.seed !== b.seed, 'W53 into W01');
});

t.test('weekly: medals, the cabinet and the repaired record', () => {
  const tg = { bronze: 1000, silver: 2000, gold: 4000, platinum: 6000 };
  t.eq(DATA.wkMedal(999, tg), '', 'under bronze: none');
  t.eq(DATA.wkMedal(1000, tg), 'bronze', 'bronze at the mark');
  t.eq(DATA.wkMedal(4100, tg), 'gold', 'gold');
  t.eq(DATA.wkMedal(99999, tg), 'platinum', 'platinum');
  t.ok(DATA.wkRank('gold') > DATA.wkRank('silver') && DATA.wkRank('') < 0, 'medals rank');
  const F = DATA.wkFix({ best: { '2026-W40': 4210, '2026-W39': '7450', 'nope': 5, '2026-W38': -3 }, medal: { '2026-W40': 'silver', '2026-W39': 'gold', '2026-W37': 'tin' }, runs: '4' });
  t.eq(JSON.stringify(F.best), JSON.stringify({ '2026-W40': 4210, '2026-W39': 7450 }), 'best scores: real weeks, numbers');
  t.eq(JSON.stringify(F.medal), JSON.stringify({ '2026-W40': 'silver', '2026-W39': 'gold' }), 'medals: real medals');
  t.eq(F.runs, 4, 'runs');
  for (const junk of [null, 5, [], { best: [], medal: 'x' }]) { const f = DATA.wkFix(junk); t.ok(f && f.best && f.medal && f.runs === 0, 'junk repairs: ' + JSON.stringify(junk)); }
  const big = { best: {}, medal: {} };
  for (let i = 0; i < 200; i++) { const k = DATA.wkKey(new Date(2020, 0, 6 + i * 7)); big.best[k] = i; big.medal[k] = 'bronze'; }
  const Fb = DATA.wkFix(big);
  t.eq(Object.keys(Fb.best).length, DATA.WK.KEEP, 'the newest weeks are kept');
  t.ok(Fb.best[DATA.wkKey(new Date(2020, 0, 6 + 199 * 7))] === 199 && !Fb.best['2020-W02'], 'the oldest go first');
  const C = DATA.wkCabinet(F);
  t.ok(C.list.length === 2 && C.list[0].key === '2026-W40' && C.list[1].medal === 'gold', 'the cabinet, newest first');
  t.ok(C.counts.gold === 1 && C.counts.silver === 1 && C.counts.bronze === 0, 'medal counts');
  t.eq(DATA.wkMedalCount({ wk: { medal: { a: 'gold', b: 'platinum', c: 'silver' } } }, 'gold'), 2, 'a platinum counts as a gold too');
  t.eq(DATA.wkMedalCount({}, 'gold'), 0, 'no record, no medals');
});

t.test('lore: the two stickers (a gold weekly medal, 25 Codex pages), inside the board\'s cap', () => {
  const A = DATA.ACHIEVEMENTS;
  t.ok(A.podium && A.lorekeeper, 'Podium Finish and Lorekeeper');
  t.ok(DATA.ACH_IDS.length <= 63, `the board holds ${DATA.ACH_IDS.length} of 63`);
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { wk: { medal: { '2026-W40': 'silver' } } } }, {}).includes('podium'), 'silver is not the podium');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { wk: { medal: { '2026-W40': 'gold' } } } }, {}).includes('podium'), 'gold is');
  t.ok(DATA.achCheck({ kind: 'end', meta: { wk: { medal: { '2026-W40': 'platinum' } } } }, {}).includes('podium'), 'platinum too');
  const got = {};
  DATA.loreBook().ids.slice(0, 24).forEach(id => { got[id] = 1; });
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { lore: { got } } }, {}).includes('lorekeeper'), '24 pages are not enough');
  got[DATA.loreBook().ids[30]] = 1;
  t.ok(DATA.achCheck({ kind: 'meta', meta: { lore: { got } } }, {}).includes('lorekeeper'), '25 are');
  t.ok(A.lorekeeper.goal === 25 && A.lorekeeper.val({ meta: { lore: { got } } }) === 25, 'its progress bar');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: {} }, {}).some(id => id === 'podium' || id === 'lorekeeper'), 'an empty profile earns neither');
});

/* ---------------------------------------------------------------- RUSH (round 10): the Boss Rush and the ghost race */
t.test('rush: the lineup, every boss once in a seeded order, then the Prize Master, The Machine only once met', () => {
  const K = DATA.RUSH;
  const six = [].concat(K.ACTS[1], K.ACTS[2], K.ACTS[3]);
  t.eq(six.length, 6, 'three acts, a boss and its understudy each');
  for (const a of [1, 2, 3]) for (const id of K.ACTS[a]) t.ok(ENEMIES[id] && ENEMIES[id].tier === 'boss' && DATA.rushActOf(id) === a, `${id}: an act ${a} boss`);
  t.ok(ENEMIES[K.FINAL].tier === 'boss' && ENEMIES[K.SECRET].tier === 'boss' && ENEMIES[K.SECRET].secret, 'the Prize Master and The Machine');
  t.ok(six.includes('plushqueen') && six.includes('conveyorking') && six.includes('arcticarcade'), 'the alternates are in');
  const firsts = new Set(), orders = new Set();
  for (let s = 1; s <= 60; s++) {
    const o = DATA.rushOrder(s), m = DATA.rushOrder(s, { machine: true });
    t.eq(o.length, 7, `seed ${s}: seven bosses`);
    t.eq(o.slice(0, 6).slice().sort().join(), six.slice().sort().join(), `seed ${s}: every act boss once`);
    t.eq(o[6], K.FINAL, `seed ${s}: the Prize Master comes last`);
    t.ok(!o.includes(K.SECRET), `seed ${s}: no Machine unless met`);
    t.ok(m.length === 8 && m[7] === K.SECRET && m.slice(0, 7).join() === o.join(), `seed ${s}: The Machine closes the lineup once met`);
    firsts.add(o[0]); orders.add(o.join());
  }
  t.ok(orders.size >= 40 && firsts.size === 6, `a random order (${orders.size} orders, ${firsts.size} openers)`);
  t.eq(DATA.rushOrder(4242).join(), DATA.rushOrder(4242).join(), 'the same seed, the same lineup');
  t.ok(DATA.rushActOf(K.SECRET) === 3 && DATA.rushActOf('nope') === 3, 'The Machine and junk fight in act 3');
  for (const id of six.concat([K.FINAL, K.SECRET])) {
    const hk = DATA.rushHpK(id), dk = DATA.rushDmgK(id);
    t.ok(hk > 0.2 && hk <= 1 && dk > 0.2 && dk <= 1, `${id}: rush hp x${hk}, hits x${dk}`);
  }
  t.eq(DATA.rushHpK(K.FINAL), K.HPK.final, 'the Prize Master has its own share');
  t.eq(DATA.rushDmgK(K.SECRET), K.DMGK.secret, 'so does The Machine');
});

t.test('rush: a starting kit per crawler (real items, pool relics, claw parts, max hp), and one for a crawler without its own', () => {
  for (const c in CHARACTERS) {
    const k = DATA.rushKit(c);
    t.ok(k.items.length >= 3 && k.items.every(id => ITEMS[id] && ITEMS[id].rarity !== 'junk'), `${c}: kit items (${k.items.join(', ')})`);
    t.ok(k.relics.length >= 1 && k.relics.every(id => RELICS[id] && !RELICS[id].starter && RELICS[id].rarity !== 'boss'), `${c}: kit relics`);
    t.ok(k.claw.every(id => CLAW_UPGRADES[id]) && k.hp > 0, `${c}: a claw part and max hp`);
    t.ok(!k.relics.includes(CHARACTERS[c].relic), `${c}: never its own starter relic`);
    // a per-fight relic, never a per-kill one: a rush fight has one enemy
    t.ok(!k.relics.includes('trophy_rack') && !k.relics.includes('contagion') && !k.relics.includes('blood_bag'), `${c}: no relic that waits for a second kill`);
  }
  for (const c of ['knight', 'alchemist', 'rogue', 'gambler', 'engineer'].concat(CHARACTERS.bubbler ? ['bubbler'] : [])) {
    t.ok(DATA.rushKit(c).own, `${c} has a kit of its own`);
    for (const id of DATA.rushKit(c).items) t.ok(!ITEMS[id].char || ITEMS[id].char === c, `${c}: ${id} is its own or shared`);
  }
  // every crawler on the roster brings its own kit (a new crawler needs a line in RUSH.KIT)
  for (const c in CHARACTERS) t.ok(DATA.rushKit(c).own, `${c}: an entry in RUSH.KIT`);
  if (CHARACTERS.bubbler) {
    const kb = DATA.rushKit('bubbler');
    t.ok(kb.items.some(id => ITEMS[id].char === 'bubbler') && kb.items.every(id => ITEMS[id].rarity !== 'c'), 'Ms. Bubbles brings her own uncommons and better');
    t.ok(kb.items.some(id => (ITEMS[id].fx || []).some(f => f.k === 'dmg')), 'and something that hits');
  }
  const any = DATA.rushKit('nobody');
  t.ok(!any.own && any.items.length === DATA.RUSH.KIT_ANY.n && any.items.every(id => ITEMS[id]) && any.relics.length === 2, 'a crawler without a kit gets the spare one');
  t.eq(JSON.stringify(DATA.rushKit('knight')), JSON.stringify(DATA.rushKit('knight')), 'the same kit every time');
});

t.test('rush: the draft (1 of 3 kinds, a heal when hurt, no claw part when maxed), the score, the clock', () => {
  const K = DATA.RUSH;
  let heals = 0, claws = 0;
  for (let s = 1; s <= 80; s++) for (let i = 1; i <= 7; i++) {
    const k = DATA.rushDraftKinds(s, i, { hp: 0.9 });
    t.ok(k.length === 3 && new Set(k).size === 3 && k.every(x => K.KINDS.includes(x)), `seed ${s} boss ${i}: three kinds (${k.join()})`);
    if (k.includes('heal')) heals++;
    if (k.includes('claw')) claws++;
    t.ok(DATA.rushDraftKinds(s, i, { hp: 0.3 }).includes('heal'), `seed ${s} boss ${i}: hurt, a heal is offered`);
    t.ok(!DATA.rushDraftKinds(s, i, { hp: 0.9, claw: false }).includes('claw'), `seed ${s} boss ${i}: a maxed claw gets no part`);
  }
  t.ok(heals > 300 && heals < 560 && claws > 300 && claws < 560, `each kind turns up about 3 times in 4 (${heals}, ${claws} of 560)`);
  t.eq(DATA.rushDraftKinds(9, 3, { hp: 0.9 }).join(), DATA.rushDraftKinds(9, 3, { hp: 0.9 }).join(), 'the same seed and boss, the same cards');
  // the score: bosses, the clear, hp left, seconds under par
  const fall = DATA.rushScore({ n: 3, total: 7, won: false, t: 200, hp: 0 });
  t.ok(fall.total === 3 * K.SCORE.boss && fall.lines.length === 1, 'a fall scores its bosses: ' + fall.total);
  const par = K.PAR * 7;
  const win = DATA.rushScore({ n: 7, total: 7, won: true, t: par - 100, hp: 40 });
  t.eq(win.total, 7 * K.SCORE.boss + K.SCORE.clear + 40 * K.SCORE.hp + 100 * K.SCORE.sec, 'a clear: bosses, the clear, hp, the seconds under par');
  t.ok(['boss', 'clear', 'hp', 'time'].every(k => win.lines.some(l => l.k === k && l.v > 0 && l.label)), 'every line has its words');
  t.ok(DATA.rushScore({ n: 7, total: 7, won: true, t: par - 200, hp: 40 }).total > win.total, 'faster scores more');
  t.eq(DATA.rushScore({ n: 7, total: 7, won: true, t: par + 500, hp: 0 }).total, 7 * K.SCORE.boss + K.SCORE.clear, 'over par: no time bonus, never negative');
  t.eq(DATA.rushScore(null).total, 0, 'junk scores nothing');
  // the clock
  t.eq(DATA.rushFmt(83.46), '1:23.4', 'm:ss.d');
  t.eq(DATA.rushFmt(0), '0:00.0', 'zero');
  t.eq(DATA.rushFmt(59.99), '0:59.9', 'never rounds up past the second');
  t.eq(DATA.rushFmt(3725), '1:02:05', 'an hour or more');
  t.eq(DATA.rushFmt('junk'), '0:00.0', 'junk');
  t.eq(DATA.rushFmt(-4), '0:00.0', 'never negative');
});

t.test('rush: the bests per crawler, the leaderboard, junk profiles', () => {
  for (const junk of [null, 5, [], { best: [], beat: 'x', runs: -3 }, { best: { knight: { t: 'x', n: -1 } } }]) {
    const f = DATA.rushFix(junk);
    t.ok(f && f.best && f.beat && f.runs >= 0 && f.clears >= 0 && f.score >= 0 && typeof f.pick === 'string', 'junk repairs: ' + JSON.stringify(junk));
  }
  const kept = DATA.rushFix({ runs: 4, clears: 1, score: 12000, best: { knight: { t: 612.5, n: 7, s: 12000, at: 5 } }, beat: { hoard: 3, nope: 2 }, pick: 'rogue' });
  t.ok(kept.runs === 4 && kept.best.knight.t === 612.5 && kept.beat.hoard === 3 && !kept.beat.nope && kept.pick === 'rogue', 'a good record is kept, unknown bosses dropped');
  const M = DATA.rushFix(null);
  let r = DATA.rushRecord(M, { char: 'knight', t: 300, n: 2, won: false, score: 2000 });
  t.ok(!r.newTime && r.newN && M.best.knight.t === 0 && M.best.knight.n === 2 && M.runs === 1 && M.clears === 0, 'a fall books its bosses, no time');
  r = DATA.rushRecord(M, { char: 'knight', t: 700, n: 7, won: true, score: 14000 });
  t.ok(r.newTime && r.newScore && r.newTop && M.best.knight.t === 700 && M.clears === 1 && M.score === 14000, 'the first clear sets the time');
  r = DATA.rushRecord(M, { char: 'knight', t: 800, n: 7, won: true, score: 13000 });
  t.ok(!r.newTime && !r.newScore && M.best.knight.t === 700 && r.prevT === 700, 'a slower clear keeps the best');
  r = DATA.rushRecord(M, { char: 'knight', t: 650.25, n: 7, won: true, score: 15000 });
  t.ok(r.newTime && M.best.knight.t === 650.25, 'a faster one takes it');
  DATA.rushRecord(M, { char: 'rogue', t: 500, n: 7, won: true, score: 9000 });
  DATA.rushRecord(M, { char: 'gambler', t: 900, n: 4, won: false, score: 4000 });
  DATA.rushRecord(M, { char: 'alchemist', t: 100, n: 5, won: false, score: 5000 });
  const B = DATA.rushBoard(M);
  t.eq(B.map(x => x.c).join(), 'rogue,knight,alchemist,gambler', 'the board: clears fastest first, then the most bosses');
  t.eq(DATA.rushBoard(null).length, 0, 'an empty board');
  t.ok(JSON.stringify(DATA.rushFix(M)) === JSON.stringify(M), 'a record survives its own repair');
});

t.test('ghost: compact checkpoints, a record repaired, the delta at the same step, the pass, the chart', () => {
  const cp = DATA.ghoCp({ n: 3, a: 2, q: -4, r: 9, hp: 51.6, g: 120, s: 2345, tu: 14, t: 301.7 });
  t.eq(JSON.stringify(cp), '[3,2,-4,9,52,120,2345,14,302]', 'nine whole numbers');
  t.ok(JSON.stringify(cp).length < 50, 'about 40 bytes a checkpoint');
  t.eq(JSON.stringify(DATA.ghoRead(cp)), JSON.stringify({ n: 3, a: 2, q: -4, r: 9, hp: 52, g: 120, s: 2345, tu: 14, t: 302 }), 'read back');
  t.ok(DATA.ghoRead(null) === null && DATA.ghoRead([1, 2]) === null && DATA.ghoRead([1, 2, 3, 4, 5, 6, 'x', 8, 9]) === null, 'junk checkpoints read as nothing');
  t.eq(JSON.stringify(DATA.ghoCp({ s: NaN, hp: -5 })), '[0,0,0,0,0,0,0,0,0]', 'junk numbers are zeros');
  // records
  for (const junk of [null, 3, [], { d: 'x', w: [], passes: -2 }, { d: { key: 5, cps: [] } }]) {
    const f = DATA.ghoFix(junk);
    t.ok(f && f.d === null && f.w === null && f.passes === 0, 'junk repairs: ' + JSON.stringify(junk));
  }
  const rec = DATA.ghoRecFix({ key: '2026-09-28', cps: [DATA.ghoCp({ n: 1, s: 600 }), 'junk', DATA.ghoCp({ n: 2, s: 900 })], s: 1500, won: false, c: 'rogue', e: [1, 3, 4] });
  t.ok(rec.cps.length === 2 && rec.s === 1500 && rec.c === 'rogue' && rec.n === 2 && rec.e.join() === '1,3,4', 'a record keeps its good checkpoints and where it ended');
  const many = DATA.ghoRecFix({ key: 'k', cps: Array.from({ length: 200 }, (_, i) => DATA.ghoCp({ n: i + 1, s: i })) });
  t.eq(many.cps.length, DATA.GHO.MAX, 'a record keeps at most GHO.MAX checkpoints');
  t.ok(JSON.stringify(DATA.ghoFix({ d: many })).length < 5000, 'a long day stays small');
  // the delta at the same step
  const ghost = { cps: [DATA.ghoCp({ n: 1, s: 500 }), DATA.ghoCp({ n: 2, s: 1000 })], s: 1300 };
  const me = [DATA.ghoCp({ n: 1, s: 450 })];
  let d = DATA.ghoDelta(me, ghost);
  t.ok(d.n === 1 && d.d === -50 && d.have && !d.ahead && d.g.s === 500, 'behind at fight 1: -50');
  me.push(DATA.ghoCp({ n: 2, s: 1100 }));
  d = DATA.ghoDelta(me, ghost);
  t.ok(d.d === 100 && d.ahead, 'ahead at fight 2: +100');
  me.push(DATA.ghoCp({ n: 3, s: 1250 }));
  d = DATA.ghoDelta(me, ghost);
  t.ok(d.d === -50 && !d.have && d.g === null, 'its climb ended at 1300: you race its final score');
  t.ok(DATA.ghoDelta([], ghost).d === 0 && DATA.ghoDelta([], ghost).have, 'level at the start');
  t.eq(DATA.ghoDelta(me, null), null, 'no ghost, no race');
  t.ok(DATA.ghoPassed(-50, 100) && DATA.ghoPassed(0, 1) && !DATA.ghoPassed(10, 100) && !DATA.ghoPassed(-5, 0) && !DATA.ghoPassed(-5, -1), 'passing is going from behind or level to ahead');
  t.eq(JSON.stringify(DATA.ghoAt(ghost, 2)), JSON.stringify(DATA.ghoRead(ghost.cps[1])), 'where it stood after 2 fights');
  t.ok(DATA.ghoAt(ghost, 0) === null && DATA.ghoAt(ghost, 3) === null && DATA.ghoAt(null, 1) === null, 'nothing at the start, past its end, or with no ghost');
  t.eq(DATA.ghoSeries(ghost.cps, 1300).join(), '0,500,1000,1300', 'the chart series: from 0, a point a fight, the final');
  t.eq(DATA.ghoSeries(null).join(), '0', 'an empty series');
});

t.test('rush: two stickers (a cleared rush, an overtaken ghost), inside the cap', () => {
  const A = DATA.ACHIEVEMENTS;
  t.ok(A.rush_clear && A.photo_finish, 'Rush Hour and Photo Finish');
  t.ok(DATA.ACH_IDS.length <= 63, `the board holds ${DATA.ACH_IDS.length} of 63`);
  t.ok(new Set(DATA.ACH_IDS.map(id => A[id].name)).size === DATA.ACH_IDS.length, 'the names stay unique');
  t.ok(!DATA.achCheck({ kind: 'end', run: { rush: { won: false } } }, {}).includes('rush_clear'), 'a fall is not a clear');
  t.ok(!DATA.achCheck({ kind: 'tick', run: { rush: { won: true } } }, {}).includes('rush_clear'), 'only at the rush\'s end');
  t.ok(DATA.achCheck({ kind: 'end', run: { rush: { won: true } } }, {}).includes('rush_clear'), 'a clear earns it');
  t.ok(!DATA.achCheck({ kind: 'tick', run: { gho: { passed: false } }, meta: {} }, {}).includes('photo_finish'), 'no pass, no sticker');
  t.ok(DATA.achCheck({ kind: 'tick', run: { gho: { passed: true } }, meta: {} }, {}).includes('photo_finish'), 'a pass in the run');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { gho: { passes: 1 } } }, {}).includes('photo_finish'), 'or one on the profile (an old run caught up)');
  for (const id of ['rush_clear', 'photo_finish']) t.ok((A[id].name + A[id].text).indexOf(String.fromCharCode(0x2014)) < 0 && A[id].text.length < 80, id + ': short, no em dash');
});

// ------------------------------------------------ round 10 (ROS): Ms. Bubbles, the mutator pack, three pets
// DESIGN.md "Ms. Bubbles, the mutator pack and three pets (round 10)".
const ROS_DASH = new RegExp(String.fromCharCode(0x2014));
t.test('round 10: Ms. Bubbles, the Foam Chemist', () => {
  const c = CHARACTERS.bubbler;
  t.ok(c && c.name === 'Ms. Bubbles' && c.title === 'The Foam Chemist', 'Ms. Bubbles, The Foam Chemist');
  t.eq(c.bin.length, 19, 'a 19 item starting bin');
  t.ok(c.bin.filter(id => ITEMS[id].char === 'bubbler').length >= 10 && c.bin.every(id => R10_ITEMS.includes(id) || !ITEMS[id].char), 'the bin is mostly her new kit');
  t.ok(c.bubbles === true && c.relic === 'bubble_wand' && RELICS.bubble_wand.starter && RELICS.bubble_wand.rarity === 'event', 'her gift: bubbles; her starter: the Bubble Wand');
  t.ok(c.hp === 68 && c.claw.grabs === 3 && c.claw.grip < 1, 'hp, grabs, a slippery grip (the bubbles make up for it)');
  t.eq(c.unlock, 'win', 'unlocked by winning a run');
  t.eq(c.vsLine, 'Hold your breath, sweetie.', 'her versus line');
  const seen = new Set();
  for (let d = 0; d < 200; d++) seen.add(DATA.dailyChar('2026-12-' + d));
  t.ok(seen.has('bubbler'), 'the daily rotation deals her in');
  const wk = new Set();
  for (let w = 1; w <= 52; w++) wk.add(DATA.wkDef('2027-W' + String(w).padStart(2, '0')).char);
  t.ok(wk.has('bubbler'), 'so does the weekly challenge');
  for (const r of ['c', 'u', 'r', 'l']) t.ok(DATA.pool(r, 'bubbler').length >= 1, `pool ${r}/bubbler has choices`);
  for (let seed = 1; seed <= 200; seed++) {
    const r = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), 'bubbler');
    if (r.length !== 3 || !r.every(id => ITEMS[id] && !ITEMS[id].starter && (!ITEMS[id].char || ITEMS[id].char === 'bubbler'))) { t.ok(false, `bubbler rewards seed ${seed} [${r}]`); break; }
  }
  t.ok(true, 'her reward screens only offer shared and bubbler items');
  let soap = 0;
  for (const id of R10_ITEMS) {
    const d = ITEMS[id];
    t.ok(d && d.char === 'bubbler' && !ROS_DASH.test(d.name + d.text), `${id}: hers, no em dash`);
    t.ok(d.soap == null || (Number.isInteger(d.soap) && d.soap >= 1 && d.soap <= 3), `${id}: a sane soap count`);
    if (d.soap) soap++;
  }
  t.ok(soap >= 4, `soap items blow bubbles (${soap})`);
  t.ok(R10_ITEMS.some(id => ITEMS[id].rarity === 'l'), 'a legendary of her own');
  t.ok(ITEMS.rubber_duck.density < 1 && ITEMS.soap_bar.friction < 0.2, 'the duck floats, the soap slips');
  t.ok(DATA.loreHint && /Ms\. Bubbles/.test(DATA.loreHint('cr_bubbler', {})), 'a Codex page for her');
});
t.test('round 10: her relics, outfits, stickers and evolutions', () => {
  for (const id of R10_RELICS) t.ok(RELICS[id] && RELICS[id].text && !ROS_DASH.test(RELICS[id].text), `${id} exists`);
  t.ok(!RELICS.foam_machine.starter && RELICS.foam_machine.rules.bubbles === 1 && DATA.relicPool('r').includes('foam_machine'), 'the Foam Machine: a pool rare, a rule');
  t.ok(RELICS.soap_dish.bub.block === 2 && RELICS.squeaky_toy.bub.combo === 3, 'bub numbers');
  const fits = DATA.vaultList('outfit', 'bubbler');
  t.eq(fits.join(), 'fit_bub_showercap,fit_bub_snorkel', 'two outfits of hers');
  t.ok(fits.every(id => DATA.vaultPrice(id) > 0), 'both for sale');
  t.ok(DATA.COSMETICS.fit_bub_witch && DATA.COSMETICS.fit_bub_witch.season === 'halloween', 'and a Claw-o-ween witch hat');
  for (const id of ['foam_party', 'squeaky_clean']) t.ok(DATA.ACHIEVEMENTS[id] && DATA.ACH_IDS.includes(id), `sticker ${id}`);
  const ev = (n) => DATA.achCheck({ kind: 'ev', ev: { t: 'ros', k: 'combo', n } }, {});
  t.ok(ev(3).includes('foam_party') && !ev(2).includes('foam_party'), 'Foam Party: three bubbles in one grab');
  t.ok(DATA.achCheck({ kind: 'win', run: { char: 'bubbler' } }, {}).includes('squeaky_clean') && !DATA.achCheck({ kind: 'win', run: { char: 'knight' } }, {}).includes('squeaky_clean'), 'Squeaky Clean: a win as her');
  for (const [evo, from, relic] of [['captain_quack', 'rubber_duck', 'foam_machine'], ['bubble_shield', 'soap_bar', 'soap_dish']]) {
    t.ok(DATA.evoOf(from) && DATA.evoOf(from).to === evo && DATA.evoOf(from).relic === relic, `${from} + ${relic} evolves into ${evo}`);
    t.ok(ITEMS[evo] && ITEMS[evo].evolved && DATA.EVO_FX['evo:' + evo] && DATA.EVO_FX['evo:' + evo].bub, `${evo}: an evolved item with a bubble aura`);
  }
  t.ok(CHARACTERS.bubbler.bin.some(x => DATA.evoOf(x)), 'a starter item can evolve');
  t.ok(DATA.ROS && DATA.ROS.BUB_TIP.length > 20, 'the bubbles\' words');
});
t.test('round 10: the mutator pack merges, clashes nowhere, joins every pool', () => {
  const PACK = ['moon', 'tinyclaw', 'earthquake', 'mirror', 'sticky', 'flood'];
  for (const id of PACK) t.ok(DATA.MUTATORS[id] && DATA.MUT_IDS.includes(id) && !ROS_DASH.test(DATA.MUTATORS[id].text), `${id} is in the panel`);
  const m = DATA.mutMods(PACK.slice(0, 3)), n = DATA.mutMods(PACK.slice(3));
  t.ok(m.bounce === 0.72 && Math.abs(m.clawK - 0.7) < 1e-9 && m.dmgOut === 1.5 && m.tremor === 2, 'Moon Bounce, Tiny Claw, Earthquake');
  t.ok(n.mirror === true && n.sticky === 0.35 && n.flood === 1, 'Mirror, Sticky, Flood');
  const none = DATA.mutMods([]);
  t.ok(none.bounce === 0 && none.clawK === 1 && none.tremor === 0 && !none.mirror && none.sticky === 0 && none.flood === 0, 'neutral without them');
  t.eq(DATA.rosMutMerge(null, {}), null, 'merge: junk in, junk out');
  t.ok(DATA.mutMods(['double', 'tinyclaw']).dmgOut === 0.75, 'Half Damage and Big Prizes multiply');
  const daily = new Set(), loop = new Set();
  for (let d = 1; d <= 400; d++) for (const id of DATA.dailyMutators('2027-' + String(1 + (d % 12)).padStart(2, '0') + '-' + String(1 + (d % 28)).padStart(2, '0') + ':' + d)) daily.add(id);
  for (let s = 1; s <= 300; s++) loop.add(DATA.mutPick(U.rng(s), []));
  t.ok(PACK.every(id => daily.has(id)), 'the daily draws them');
  t.ok(PACK.every(id => loop.has(id)), 'an Endless loop draws them');
  const wk = new Set();
  for (let w = 1; w <= 53; w++) { const d = DATA.wkDef('2026-W' + String(w).padStart(2, '0')); if (d) d.muts.forEach(id => wk.add(id)); }
  t.ok(PACK.some(id => wk.has(id)), 'the weekly draws them as extras');
});
t.test('round 10: three new pets, their synergies', () => {
  for (const id of ['penguin', 'molerat', 'roomba']) {
    const p = DATA.PETS[id];
    t.ok(p && DATA.PET_IDS.includes(id) && p.when === 'turn', `${id}: a turn pet`);
    t.ok(DATA.PET_SYN[id] && DATA.petSynOn(id, { bin: [], relics: [], clawType: 'classic' }) === null, `${id}: a synergy, off on a bare run`);
  }
  const on = (id, run) => !!DATA.petSynOn(id, Object.assign({ bin: [], relics: [], clawType: 'classic' }, run));
  t.ok(on('penguin', { bin: [{ id: 'frost_pearl' }] }) && !on('penguin', { bin: [{ id: 'torch' }] }), 'penguin: a Frost item in the bin');
  t.ok(on('molerat', { relics: ['money_bags'] }) && !on('molerat', { relics: ['beehive'] }), 'mole rat: a Greed relic');
  t.ok(on('roomba', { clawType: 'vacuum' }) && !on('roomba', { clawType: 'twin' }), 'robot vacuum: the Vacuum Nozzle');
  const seen = new Set();
  for (let s = 1; s <= 120; s++) DATA.petOffer(U.rng(s), 'hamster', 3).forEach(id => seen.add(id));
  t.ok(['penguin', 'molerat', 'roomba'].every(id => seen.has(id)), 'the pet shop offers them');
});

// ---- DUO (round 11): pass and play (DESIGN.md "Duo: pass and play (round 11)")
t.test('DUO: the tables (colours, cards, taunts, voices), names and players', () => {
  const K = DATA.DUO;
  t.ok(K && K.COLORS.length >= 6 && new Set(K.COLORS.map(c => c.id)).size === K.COLORS.length, 'six player colours, each its own');
  for (const c of K.COLORS) {
    t.ok(/^#[0-9a-f]{6}$/i.test(c.col), c.id + ': a real colour');
    t.ok(DATA.COSMETICS[c.paint] && DATA.COSMETICS[c.paint].cat === 'paint', c.id + ': its team paint is a claw paint in the vault');
  }
  t.ok(K.DEF[0].color !== K.DEF[1].color, 'the two default colours differ');
  t.eq(K.CARD_IDS.length, Object.keys(K.CARDS).length, 'every card is in the deck list');
  for (const id of K.CARD_IDS) { const c = K.CARDS[id]; t.ok(c && c.id === id && c.name && c.icon && c.text && c.text.length <= 70 && /^#[0-9a-f]{6}$/i.test(c.col), id + ': a whole card'); }
  for (const x of K.TAUNTS.concat(K.CHEERS)) t.ok(x.id && x.text && x.short && x.short.length <= 9 && x.icon && K.VOICES.includes(x.v), x.id + ': a taunt with a short label and a known voice');
  t.ok(K.TAUNTS.length >= 4 && K.CHEERS.length >= 3, 'a few taunts, a few cheers');
  t.ok(JSON.stringify(K).indexOf(String.fromCharCode(0x2014)) < 0, 'no em dash in the duo copy');
  // names: printable, trimmed, capped, P1 / P2 when empty; an em dash typed in is taken out
  t.eq(DATA.duoName('  Jasmin  ', 0), 'Jasmin', 'trimmed');
  t.eq(DATA.duoName('', 0), 'P1', 'empty is P1'); t.eq(DATA.duoName(null, 1), 'P2', '...or P2');
  t.eq(DATA.duoName('a very long name indeed', 0).length <= K.NAME_MAX, true, 'at most NAME_MAX letters');
  t.ok(DATA.duoName('Rox' + String.fromCharCode(0x2014) + 'or\n', 0).indexOf(String.fromCharCode(0x2014)) < 0, 'no em dash in a name');
  t.eq(DATA.duoKey(' ROXOR  '), 'roxor', 'the record key ignores case and spaces');
  // players: junk repaired, two colours never the same, only real crawlers and claws
  const P = DATA.duoPlayers([{ name: ' Rox ', color: 'lime', char: 'nobody', claw: 'spoon', paint: 5 }, { name: '', color: 'lime' }], ['knight', 'rogue'], ['classic', 'tri']);
  t.ok(P.length === 2 && P[0].name === 'Rox' && P[1].name === 'P2', 'names');
  t.ok(P[0].color === 'lime' && P[1].color !== 'lime', 'a clash of colours is split');
  t.ok(P[0].char === 'knight' && P[0].claw === 'classic' && P[0].paint === '', 'unknown crawler, claw and paint fall back');
  const P0 = DATA.duoPlayers(null, ['knight', 'rogue'], ['classic']);
  t.ok(P0[0].color === K.DEF[0].color && P0[1].color === K.DEF[1].color && P0[1].char === 'rogue', 'no setup yet: the defaults');
});

t.test('DUO: the claw-off pile, a drop\'s score, the sabotage deck, best of three, the toss', () => {
  const K = DATA.DUO;
  for (const [drops, n] of [[3, 14], [4, 16], [5, 18]]) {
    for (let s = 1; s <= 30; s++) {
      const p = DATA.duoPile(U.rng(s), 1, drops);
      if (s === 1) t.eq(p.length, n, `${drops} drops each: ${n} prizes in the bin`);
      if (p.length !== n || p.filter(x => x.gold).length !== 1 || p.filter(x => x.id === 'rock').length !== K.PILE.junk) { t.ok(false, `pile ${s}/${drops}: size, one golden prize, two rocks`); break; }
      if (!p.every(x => DATA.ITEMS[x.id] && x.v === K.VAL[DATA.ITEMS[x.id].rarity])) { t.ok(false, `pile ${s}: values by rarity`); break; }
      if (!p.every(x => !x.gold || (x.v > 0 && x.v <= 2))) { t.ok(false, `pile ${s}: the golden prize is a common or uncommon`); break; }
    }
  }
  t.eq(JSON.stringify(DATA.duoPile(U.rng(9), 2, 3)), JSON.stringify(DATA.duoPile(U.rng(9), 2, 3)), 'the same seed, the same pile');
  // the score: values, golden x2, DOUBLE, JACKPOT, the fight's own combos
  t.eq(DATA.duoDropScore([]).pts, 0, 'an empty drop scores 0');
  t.eq(DATA.duoDropScore([{ id: 'rock', v: 0 }]).pts, 0, 'a rock is worth nothing');
  t.eq(DATA.duoDropScore([{ id: 'rusty_sword', v: 1 }]).pts, 1, 'one common: 1');
  t.eq(DATA.duoDropScore([{ id: 'rusty_sword', v: 1, gold: 1 }]).pts, K.BONUS.golden, 'the golden prize: double');
  const two = DATA.duoDropScore([{ id: 'rusty_sword', v: 1 }, { id: 'longsword', v: 2 }]);
  t.ok(two.lines.some(l => l.k === 'double') && two.combos.includes('crossed_blades') && two.pts === 1 + 2 + K.BONUS.double + K.BONUS.comboTier, 'two weapons: DOUBLE and Crossed Blades');
  const three = DATA.duoDropScore([{ id: 'rusty_sword', v: 1 }, { id: 'longsword', v: 2 }, { id: 'rock', v: 0 }]);
  t.ok(three.lines.some(l => l.k === 'jackpot') && !three.lines.some(l => l.k === 'double') && three.n === 3, 'three: a JACKPOT, not a DOUBLE');
  t.eq(three.pts, three.lines.reduce((a, l) => a + l.v, 0), 'the lines add up to the score');
  // the deck: two of every card, shuffled by seed; a hand never passes HAND.max
  const d1 = DATA.duoDeck(U.rng(4)), d2 = DATA.duoDeck(U.rng(4)), d3 = DATA.duoDeck(U.rng(5));
  t.ok(d1.length === K.CARD_IDS.length * K.COPIES && K.CARD_IDS.every(id => d1.filter(x => x === id).length === K.COPIES), 'two of every card');
  t.ok(d1.join() === d2.join() && d1.join() !== d3.join(), 'shuffled by the seed');
  const hand = [];
  t.eq(DATA.duoDrawCards(d1, hand, 5).length, K.HAND.max, 'a hand holds HAND.max cards');
  t.eq(d1.length, K.CARD_IDS.length * K.COPIES - K.HAND.max, 'drawn cards leave the deck');
  t.eq(DATA.duoDrawCards([], [], 2).length, 0, 'an empty deck draws nothing');
  // best of three: first to two; a tie round counts for nobody; after five, rounds then points, else a draw
  t.eq(DATA.duoMatch([]).w, null, 'no rounds: it goes on');
  t.eq(DATA.duoMatch([{ s: [5, 3] }, { s: [2, 4] }]).w, null, '1 : 1 goes on');
  t.eq(DATA.duoMatch([{ s: [5, 3] }, { s: [2, 4] }, { s: [6, 1] }]).w, 0, '2 : 1 wins');
  t.eq(DATA.duoMatch([{ s: [1, 3] }, { s: [2, 4] }]).w, 1, 'two straight');
  t.eq(DATA.duoMatch([{ s: [3, 3] }, { s: [5, 3] }, { s: [3, 3] }]).w, null, 'ties do not count');
  t.eq(DATA.duoMatch([{ s: [3, 3] }, { s: [5, 3] }, { s: [3, 3] }, { s: [3, 3] }, { s: [3, 3] }]).w, 0, 'five rounds: the most rounds');
  t.eq(DATA.duoMatch([{ s: [3, 3] }, { s: [5, 3] }, { s: [3, 4] }, { s: [3, 3] }, { s: [3, 3] }]).w, 0, '...then the most points');
  t.eq(DATA.duoMatch([{ s: [3, 3] }, { s: [4, 3] }, { s: [3, 4] }, { s: [3, 3] }, { s: [3, 3] }]).w, -1, '...else a draw');
  t.eq(DATA.duoRoundWin([2, 2]), -1, 'a tied round');
  t.eq(DATA.duoStarter(1, []), 1, 'the toss starts round 1');
  t.eq(DATA.duoStarter(1, [{ s: [5, 3] }]), 1, 'the loser of a round starts the next');
  t.eq(DATA.duoStarter(0, [{ s: [5, 3] }, { s: [1, 3] }]), 0, '...every time');
  t.eq(DATA.duoStarter(0, [{ s: [3, 3] }]), 1, 'after a tie the other one starts');
  // the toss: a fair coin by seed; the coin lands on the side it says (the half turns' parity)
  const ws = [0, 0];
  for (let s = 1; s <= 200; s++) { const o = DATA.duoToss(s); ws[o.w]++; if (o.flips % 2 !== o.w || o.flips < 8) t.ok(false, 'toss ' + s + ': lands on its winner'); }
  t.ok(ws[0] > 60 && ws[1] > 60, `both players win tosses (${ws.join(' / ')})`);
  t.eq(DATA.duoToss(77).w, DATA.duoToss(77).w, 'the same seed, the same toss');
});

t.test('DUO: the co-op bosses, the record per name, old and junk profiles', () => {
  const L = DATA.duoBosses({ hoard: 2 }, { smelter: 1 });
  t.ok(L.length === 7 && L.every(x => DATA.ENEMIES[x.id] && DATA.ENEMIES[x.id].tier === 'boss'), 'the six act bosses and the Prize Master');
  t.ok(L.find(x => x.id === 'hoard').beaten && L.find(x => x.id === 'smelter').beaten && !L.find(x => x.id === 'glacius').beaten, 'beaten from the Codex kills and the rush');
  t.ok(DATA.duoBosses(null, null).every(x => !x.beaten), 'a fresh profile has beaten none');
  const f = DATA.duoFix(undefined);
  t.ok(f.games === 0 && Object.keys(f.names).length === 0 && f.last.drops === K3() && f.last.mode === 'vs', 'an old profile: an empty record');
  function K3() { return DATA.DUO.DROPS_DEF; }
  const junk = DATA.duoFix({ games: 'x', vs: -4, names: { ' RoXor ': { n: 'RoXor', w: '3', l: null }, bad: 7, '': { w: 1 } }, last: { p: 'no', drops: 99, mode: 'coop' } });
  t.ok(junk.games === 0 && junk.vs === 0 && junk.names.roxor && junk.names.roxor.w === 3 && junk.names.roxor.l === 0 && !junk.names.bad, 'a junk record is repaired');
  t.ok(Array.isArray(junk.last.p) && junk.last.drops === 5 && junk.last.mode === 'coop', '...its setup too');
  const m = DATA.duoFix(null);
  DATA.duoRecord(m, { mode: 'vs', names: ['Roxor', 'Jasmin'], w: 0 });
  DATA.duoRecord(m, { mode: 'vs', names: ['roxor', 'JASMIN'], w: 0 });
  DATA.duoRecord(m, { mode: 'vs', names: ['Roxor', 'Jasmin'], w: -1 });
  DATA.duoRecord(m, { mode: 'coop', names: ['Roxor', 'Jasmin'], won: true });
  DATA.duoRecord(m, { mode: 'coop', names: ['Roxor', 'Roxor'], won: false });
  t.ok(m.games === 5 && m.vs === 3 && m.coop === 2 && m.coopWins === 1, 'games, claw-offs, co-op and team wins counted');
  t.ok(m.names.roxor.w === 2 && m.names.roxor.t === 1 && m.names.jasmin.l === 2, 'wins per name, whatever the case');
  t.ok(m.names.roxor.cg === 2 && m.names.roxor.cw === 1 && m.names.jasmin.cw === 1, 'team games per name, once even when both share it');
  const b = DATA.duoBoard(m);
  t.ok(b[0].key === 'roxor' && b[1].key === 'jasmin', 'the board: most wins first');
  t.eq(JSON.stringify(DATA.duoFix(JSON.parse(JSON.stringify(m)))), JSON.stringify(m), 'the record survives a save and a load');
});

// ---- SCHOOL (round 11): Claw School's lessons, the star rules, the pay, the unlocks, the diploma's marquee
t.test('SCHOOL: five lessons of bite-size challenges, every one well formed', () => {
  const L = DATA.SCH_LESSONS, K = DATA.SCH;
  t.ok(L.length >= 4 && L.length <= 5, `4 or 5 lessons (${L.length})`);
  t.eq(L.map(x => x.name).join(), 'Basics,Materials,Claw Types,Tricks,Mastery', 'Basics, Materials, Claw Types, Tricks, Mastery');
  const ids = DATA.SCH_IDS;
  t.ok(ids.length >= 20 && ids.length <= 30, `20 to 30 challenges (${ids.length})`);
  t.eq(new Set(ids).size, ids.length, 'challenge ids are unique');
  t.eq(K.MAX_STARS, ids.length * 3, 'three stars a challenge');
  t.eq(K.NEED.length, L.length, 'a star count to open every lesson');
  t.ok(K.NEED[0] === 0 && K.NEED.every((n, i) => i === 0 || n > K.NEED[i - 1]) && K.NEED[L.length - 1] < K.MAX_STARS - 3 * L[L.length - 1].ch.length + 1, 'lesson 1 is open, each lesson needs more stars, and the last opens before every other star is in');
  const WIN = ['total', 'grab', 'target', 'free', 'all'], STARS = ['drops', 'time', 'items'];
  const okOf = (o) => !o || (o.not ? okOf(o.not) : (o.id ? !!ITEMS[o.id] : o.tag ? TAGS.includes(o.tag) : o.trait === 'glass' || o.trait === 'circle'));
  const nameSet = new Set();
  L.forEach((les, li) => {
    t.ok(les.ch.length >= 4 && les.ch.length <= 7, `${les.name}: 4 to 7 challenges`);
    t.ok(typeof les.icon === 'string' && /^#[0-9a-f]{6}$/i.test(les.color) && les.blurb.length <= 50, `${les.name}: icon, colour, a short blurb`);
    les.ch.forEach((c, i) => {
      const w = `${c.id} ${c.name}`;
      t.ok(c.lesson === li && c.idx === i && DATA.SCH_CH[c.id] === c, `${w}: indexed`);
      nameSet.add(c.name);
      t.ok(c.goal.length >= 10 && c.goal.length <= 60 && c.tip.length <= 72 && c.name.length <= 18, `${w}: a short name, goal and tip`);
      t.ok(!(c.name + c.goal + c.tip).split('').some(ch => ch.charCodeAt(0) === 0x2013 || ch.charCodeAt(0) === 0x2014), `${w}: no dashes`);
      t.ok(!!DATA.CLAWS[c.claw], `${w}: a real claw (${c.claw})`);
      t.ok(c.drops >= 0 && c.time >= 0 && (c.drops > 0 || c.time > 0 || c.pile.some(p => p.lit > 0)), `${w}: a drop limit, a clock or a fuse`);
      t.ok(WIN.includes(c.win.k) && okOf(c.win.of) && okOf(c.never), `${w}: a known goal and filters`);
      t.ok(STARS.includes(c.stars.k) && (c.stars.k === 'items' ? c.stars.s3 > c.stars.s2 : c.stars.s3 < c.stars.s2), `${w}: 3 stars are harder than 2`);
      if (c.stars.k === 'drops' && c.drops) t.ok(c.stars.s2 <= c.drops, `${w}: 2 stars within the drops`);
      if (c.stars.k === 'time' && c.time) t.ok(c.stars.s2 < c.time, `${w}: 2 stars within the clock`);
      t.ok(c.muts.every(m => DATA.MUTATORS[m]), `${w}: known mutators`);
      t.ok(c.pile.length >= 3 && c.pile.length <= 18, `${w}: a pile of 3 to 18 (${c.pile.length})`);
      for (const p of c.pile) {
        t.ok(!!ITEMS[p.id] && !ITEMS[p.id].bag, `${w}: ${p.id} is a real prize`);
        t.ok(p.x >= 0 && p.x <= 1 && p.y >= 60 && p.y <= 380, `${w}: ${p.id} drops inside the bin`);
        if (p.lit) t.ok(ITEMS[p.id].art === 'bomb' && p.t, `${w}: only a target bomb is lit`);
      }
      if (c.win.k === 'target') t.ok(c.pile.some(p => p.t), `${w}: a target to aim for`);
      if (c.win.k === 'grab' || c.win.k === 'total') t.ok(c.pile.filter(p => DATA.schMatch(c.win.of, { id: p.id, tags: ITEMS[p.id].tags, circle: ITEMS[p.id].shape.kind === 'circle', glass: (ITEMS[p.id].tags || []).includes('glass') })).length >= (c.win.n || 1), `${w}: enough prizes for the goal`);
      if (c.stars.k === 'items') t.eq(c.drops, 1, `${w}: best-grab stars only on a one-drop challenge`);
    });
  });
  t.eq(nameSet.size, ids.length, 'challenge names are unique');
  // the practice cabinet's presets and mutators
  for (const P of K.PILES) t.ok(P.id === 'starter' || (P.ids.length >= 6 && P.ids.every(id => ITEMS[id])), `preset ${P.id}: real prizes`);
  t.ok(K.MUTS.every(m => DATA.MUT_IDS.includes(m)), 'the practice mutators are real');
  for (const m of ['double', 'hungry', 'fever', 'crowd', 'sticky']) t.ok(!K.MUTS.includes(m), `${m} is fight only, off in practice`);
});

t.test('SCHOOL: schEval judges every goal, a failure beats a win, the drops and the clock wait for the grab', () => {
  const E = DATA.schEval, C = DATA.SCH_CH;
  const d = (id, o) => Object.assign({ id, tags: ITEMS[id].tags || [], glass: (ITEMS[id].tags || []).includes('glass'), circle: ITEMS[id].shape.kind === 'circle', t: false, free: false, g: 1 }, o || {});
  const st = (o) => Object.assign({ dl: [], drops: 1, t: 3, cracked: 0, blew: 0, left: 3, targets: 1, busy: false }, o);
  t.eq(E(C.b1, st({})).res, null, 'nothing delivered: still going');
  t.eq(E(C.b1, st({ dl: [d('crisp_apple')] })).res, 'win', 'total: any prize');
  t.eq(E(C.b2, st({ dl: [d('rock')] })).res, null, 'target: a rock is not the apple');
  t.eq(E(C.b2, st({ dl: [d('rock'), d('crisp_apple', { t: true })] })).res, 'win', 'target: the apple');
  t.eq(E(C.b3, st({ dl: [d('prize_marble', { g: 1 }), d('glass_bead', { g: 2 })] })).res, null, 'grab: two prizes in two grabs is not a double');
  t.eq(E(C.b3, st({ dl: [d('prize_marble', { g: 2 }), d('glass_bead', { g: 2 })] })).res, 'win', 'grab: two in one grab');
  t.eq(E(C.m3, st({ dl: [d('soap_bar'), d('sponge'), d('sponge')] })).res, null, 'total of: sponges are not soap');
  t.eq(E(C.m3, st({ dl: [d('soap_bar', { g: 1 }), d('soap_bar', { g: 3 })] })).res, 'win', 'total of: two soap bars, any grabs');
  t.eq(E(C.c6, st({ dl: [d('prize_marble'), d('bouncy_ball'), d('rusty_sword')] })).res, null, 'grab of a trait: a sword is not round');
  t.eq(E(C.c6, st({ dl: [d('prize_marble'), d('bouncy_ball'), d('crisp_apple')] })).res, 'win', 'grab of a trait: three round things');
  t.eq(E(C.t2, st({ dl: [d('prize_marble'), d('glass_bead')] })).res, null, 'free: the claw touched them');
  t.eq(E(C.t2, st({ dl: [d('prize_marble', { free: true })] })).res, 'win', 'free: one it never touched');
  t.eq(E(C.x5, st({ dl: [d('crisp_apple')], left: 2 })).res, null, 'all: prizes still in the bin');
  t.eq(E(C.x5, st({ dl: [d('crisp_apple')], left: 0 })).res, 'win', 'all: the bin is empty');
  t.eq(E(C.x5, st({ dl: [], left: 0 })).res, null, 'all: an empty bin with nothing delivered is not a clear');
  // failures
  const f = E(C.t4, st({ dl: [d('stolen_gem', { t: true }), d('rock')] }));
  t.ok(f.res === 'fail' && f.why === 'never', 'never: a rock with the gem fails');
  t.eq(E(C.c1, st({ dl: [d('iron_nut'), d('lucky_coin'), d('crisp_apple')] })).why, 'never', 'the magnet class: a non-metal prize fails');
  t.eq(E(C.m1, st({ dl: [d('crystal_ball', { t: true })], cracked: 1 })).why, 'cracked', 'no cracks: a crack fails even with the ball in');
  t.eq(E(C.b1, st({ cracked: 1, dl: [d('crisp_apple')] })).res, 'win', 'a crack only fails a no-crack challenge');
  t.eq(E(C.m5, st({ blew: 1 })).why, 'blew', 'the lit bomb blew');
  t.eq(E(C.b1, st({ drops: 5 })).why, 'drops', 'out of drops');
  t.eq(E(C.b1, st({ drops: 5, busy: true })).res, null, 'the last grab plays out before it is out of drops');
  t.eq(E(C.b1, st({ drops: 5, dl: [d('crisp_apple')] })).res, 'win', 'a win on the last drop');
  t.eq(E(C.b5, st({ t: 30, drops: 9 })).why, 'time', 'out of time');
  t.eq(E(C.b5, st({ t: 31, busy: true })).res, null, 'a buzzer beater: the grab in flight still counts');
  t.eq(E(C.b5, st({ t: 20, drops: 40 })).res, null, 'no drop limit on a timed challenge');
  t.eq(E(null, st({})).res, null, 'junk is no result');
});

t.test('SCHOOL: stars by drops, time or the best grab; the tickets are paid once per star; totals, unlocks, grades', () => {
  const C = DATA.SCH_CH, S = DATA.schStars;
  t.eq(S(C.b1, { drops: 1 }), 3, 'b1: 1 drop, 3 stars'); t.eq(S(C.b1, { drops: 2 }), 2, '2 drops, 2 stars'); t.eq(S(C.b1, { drops: 5 }), 1, '5 drops, 1 star');
  t.eq(S(C.b5, { t: 10 }), 3, 'b5: fast, 3 stars'); t.eq(S(C.b5, { t: 20 }), 2, '20 s, 2 stars'); t.eq(S(C.b5, { t: 29 }), 1, '29 s, 1 star');
  t.eq(S(C.t3, { items: 4 }), 3, 't3: a grab of 4, 3 stars'); t.eq(S(C.t3, { items: 3 }), 2, '3, 2 stars'); t.eq(S(C.t3, { items: 2 }), 1, '2, 1 star');
  for (const id of DATA.SCH_IDS) {
    const c = C[id], s = [1, 2, 3].map(n => S(c, n === 3 ? { drops: 99, t: 999, items: 0 } : n === 2 ? { drops: c.stars.s2, t: c.stars.s2, items: c.stars.s2 } : { drops: c.stars.s3, t: c.stars.s3, items: c.stars.s3 }));
    t.ok(s[0] === 3 && s[1] >= 2 && s[2] === 1, `${id}: every star count can be earned`);
    t.eq(DATA.schStarText(c).length, 3, `${id}: three star rules in words`);
  }
  t.eq(DATA.schPay(0, 3), 3 * DATA.SCH.TIX, 'a first 3-star clear pays three stars');
  t.eq(DATA.schPay(3, 3), 0, 'the same stars again pay nothing');
  t.eq(DATA.schPay(1, 3), 2 * DATA.SCH.TIX, 'a better clear pays only the new stars');
  t.eq(DATA.schPay(3, 1), 0, 'a worse clear pays nothing');
  t.eq(DATA.schPay(0, 9), 3 * DATA.SCH.TIX, 'never more than three stars');
  t.eq(DATA.schTotal({ b1: 3, b2: 2, nope: 3, b3: 7, b4: -2 }), 8, 'total: known challenges, 0..3 each');
  t.eq(DATA.schLessonStars(0, { b1: 3, b2: 2, m1: 3 }), 5, 'a lesson\'s own stars');
  t.ok(DATA.schOpen(0, 0) && !DATA.schOpen(1, DATA.SCH.NEED[1] - 1) && DATA.schOpen(1, DATA.SCH.NEED[1]) && !DATA.schOpen(9, 999), 'lessons open by the stars');
  t.ok(DATA.schChOpen(0, 0, {}) && !DATA.schChOpen(0, 1, {}) && DATA.schChOpen(0, 1, { b1: 1 }), 'a challenge opens once the one before it has a star');
  t.eq([78, 70, 58, 45, 10, 0].map(n => DATA.schGrade(n, 78)).join(), 'A+,A,B,C,D,-', 'grades');
});

t.test('SCHOOL: the record is repaired, old profiles get an empty one; the diploma\'s marquee is found but never listed', () => {
  const e = DATA.schFix(undefined);
  t.ok(e.tix === 0 && e.dip === 0 && !Object.keys(e.stars).length && e.pr.pile === 'starter' && e.pr.muts.length === 0, 'an old profile: an empty record');
  const j = DATA.schFix({ stars: { b1: 9, b2: '2', zz: 3, b3: -1 }, best: { b1: { drops: '2', t: 'x', items: 3 }, zz: {} }, tix: -5, dip: 'yes', pr: { claw: 5, muts: ['lowgrav', 'double', 'nope', 'moon', 'glass', 'mirror'], pet: 'dragon', slow: 1 } });
  t.ok(j.stars.b1 === 3 && j.stars.b2 === 2 && !('zz' in j.stars) && !('b3' in j.stars), 'stars: clamped, known ids only');
  t.ok(j.best.b1.drops === 2 && j.best.b1.t === 0 && !j.best.zz, 'bests repaired');
  t.ok(j.tix === 0 && j.dip === 1 && j.pr.claw === '' && j.pr.pet === '' && j.pr.slow === true, 'numbers, flags and the practice setup repaired');
  t.eq(j.pr.muts.join(), 'lowgrav,moon,glass', 'practice mutators: known, practice ones, three at most');
  t.eq(JSON.stringify(DATA.schFix(JSON.parse(JSON.stringify(j)))), JSON.stringify(j), 'the record survives a save and a load');
  const id = DATA.SCH.DIPLOMA, c = DATA.COSMETICS[id];
  t.ok(c && c.cat === 'marquee' && c.rarity === 'l' && c.school && c.look.text, 'the Valedictorian marquee');
  t.ok(!Object.keys(DATA.COSMETICS).includes(id) && !DATA.COSMETIC_IDS.includes(id) && !DATA.vaultList('marquee').includes(id), 'never on a shelf list or in the counts');
  t.ok(!DATA.vaultPool().includes(id) && !DATA.vaultPool('l').includes(id), 'never in a Vault Capsule');
  t.ok(DATA.vaultHow(id) === 'school' && DATA.vaultPrice(id) === 0, 'not for sale: the diploma pays it');
});

// ---------------------------------------------------------------- round 12 (LEG): legends
// DESIGN.md "Legends (round 12)": twelve legendary relics (rare, a build each,
// a catch where it fits), ten more evolutions, three animated cabinets.
t.test('round 12: the legendary relics: fields, a catch, and never in a common pool', () => {
  const L = DATA.LEG;
  t.ok(L && L.K && Array.isArray(L.RELICS), 'DATA.LEG');
  t.eq(L.RELICS.length, 12, 'twelve legendaries');
  const names = new Set(), icons = new Set();
  for (const id of L.RELICS) {
    const r = RELICS[id], W = 'legendary ' + id;
    t.ok(r && r.rarity === 'l' && !r.starter && id.startsWith('leg_'), W + ': rarity l');
    t.ok(r.kw.length >= 1 && r.proc && r.text.length > 60 && r.text.length < 260, W + ': chips, a proc and a text');
    t.ok(r.leg && typeof r.leg === 'object' && Object.values(r.leg).every(v => typeof v === 'number'), W + ': a leg object of numbers');
    t.ok(!names.has(r.name) && !icons.has(r.icon), W + ': its own name and icon');
    names.add(r.name); icons.add(r.icon);
    t.ok(!(r.text + r.name).split('').some(ch => ch.charCodeAt(0) === 0x2014 || ch.charCodeAt(0) === 0x2013), W + ': no dashes');
    t.ok(!DATA.relicPool().includes(id), W + ': not in the any-rarity pool');
    for (const rr of ['c', 'u', 'r', 'boss']) t.ok(!DATA.relicPool(rr).includes(id), W + ': not in the ' + rr + ' pool');
    t.ok(DATA.relicPool('l').includes(id), W + ': in the legendary pool when asked for by name');
    t.ok(DATA.dexEntries().relics.includes(id), W + ': a Prizedex entry');
  }
  // a catch where it fits: a stat cost, a rule taken away, or a sting in the hooks
  const src = (id) => String(Object.values(RELICS[id].hooks || {}).map(f => f.toString()).join(' '));
  const catchOf = (id) => {
    const r = RELICS[id];
    if (r.mods && Object.values(r.mods).some(v => v < 0)) return 'mod';
    if (r.leg.noCash || r.leg.noVolley || r.leg.slay || r.leg.glass) return 'rule';
    return /F\.player|weak|feeds|F\.used/.test(src(id)) ? 'sting' : '';
  };
  const noCatch = L.RELICS.filter(id => !catchOf(id));
  t.ok(noCatch.length <= 1, 'every legendary but at most one carries a catch [' + noCatch.join() + ']');
  // pool placement: a legendary capsule may hold one, lower tiers never
  t.ok(DATA.LOOT.RELIC_RAR.l.includes('l') && ['c', 'u', 'r'].every(k => !DATA.LOOT.RELIC_RAR[k].includes('l')), 'only legendary capsules hold legendary relics');
  const ctx = { act: 2, char: 'knight', relics: { c: ['grip_tape'], u: [], r: DATA.relicPool('r'), boss: DATA.relicPool('boss'), l: L.RELICS.slice() }, prefer: 'relic' };
  let leg = 0, rel = 0;
  const rng = U.rng(77);
  for (let i = 0; i < 2000; i++) {
    const p = DATA.capsulePrize(rng, 'l', ctx);
    if (p.k === 'relic') { rel++; if (RELICS[p.id].rarity === 'l') leg++; }
    const q = DATA.capsulePrize(rng, 'r', ctx);
    if (q.k === 'relic' && RELICS[q.id].rarity === 'l') t.ok(false, 'a rare capsule gave a legendary');
  }
  t.ok(rel === 2000 && leg > 300 && leg < 900, `a legendary capsule's relic is a legendary a fair share of the time (${leg}/2000)`);
  t.ok(L.K.bossP > 0 && L.K.bossP <= 0.35, 'the act boss relic is a legendary now and then, not always');
  // the rewards an ordinary reward roll and relic pick can see never include one
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(DATA.pickRelic(U.rng(i), DATA.relicPool('c').concat(DATA.relicPool('u'), DATA.relicPool('r'))));
  t.ok(![...seen].some(id => RELICS[id].rarity === 'l'), 'the c / u / r picks never hand one out');
});

t.test('round 12: legendary hooks go through COMBAT and do what they say (recording COMBAT)', () => {
  const calls = [];
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', src, v, e === F.player ? 'p' : 'e']); if (e && e.hp != null) e.hp -= v; return v; },
    status: (F, who, s, v) => { calls.push(['status', s, v]); if (who && who.status && s !== 'block') who.status[s] = (who.status[s] | 0) + v; return v; },
    heal: (F, who, v) => { calls.push(['heal', v]); return v; },
    addJunk: (F, id, n) => { calls.push(['addJunk', id, n]); return []; },
    emit: (F, ev) => { calls.push(['emit', ev.t, ev.text]); return ev; },
    turretParts: (F, n) => { calls.push(['parts', n]); },
    legShot: (F) => { calls.push(['shot']); },
    tickets: () => 0, gainGold: () => 0, gold: () => 100,
  };
  try {
    const R = (id) => RELICS[id].hooks;
    // the Golden Claw: the 5th grab with 3 prizes
    let F = mockF(); F.stats = { grabs: 5 }; calls.length = 0;
    R('leg_golden_claw').onGrab(F, 3);
    t.ok(calls.filter(c => c[0] === 'damage').length === 1 && calls.some(c => c[0] === 'status' && c[1] === 'block' && c[2] === 6), 'golden x3: 12 to ALL (one alive), 6 Block');
    F.stats.grabs = 4; calls.length = 0; R('leg_golden_claw').onGrab(F, 3);
    t.eq(calls.length, 0, 'the 4th grab is not golden');
    // the Fate Engine: at 10 Luck
    F = mockF(); F.player.status.luck = 10; calls.length = 0;
    R('leg_fate_engine').onStatus(F, F.player, 'luck', 3);
    t.ok(calls.some(c => c[0] === 'damage' && c[2] === DATA.LEG.K.fateDmg) && calls.some(c => c[0] === 'status' && c[1] === 'luck' && c[2] === -10), 'FATE: 25 to ALL, the meter empties');
    F.player.status.luck = 9; calls.length = 0; R('leg_fate_engine').onStatus(F, F.player, 'luck', 1);
    t.eq(calls.length, 0, 'not below 10');
    // the Crown's sting and royalty
    F = mockF(); calls.length = 0;
    R('leg_foam_crown').onBubble(F, 'bin', 2);
    t.ok(calls.some(c => c[0] === 'damage' && c[3] === 'p' && c[2] === 4), 'two bin bursts sting for 4');
    calls.length = 0; R('leg_foam_crown').onBubble(F, 'chute', 2);
    t.ok(calls.some(c => c[0] === 'status' && c[1] === 'str' && c[2] === 1), 'a Bubble Combo: 1 Strength');
    // the Overclocked Core fires a shot per metal prize, with a turret
    F = mockF(); F.tur = { lv: 2 }; calls.length = 0;
    R('leg_overclock').onPlay(F, { uid: 'm' }, ITEMS.rusty_sword);
    R('leg_overclock').onPlay(F, { uid: 'a' }, ITEMS.crisp_apple);
    t.eq(calls.filter(c => c[0] === 'shot').length, 1, 'one shot for the sword, none for the apple');
    // the Perpetual Motion Machine flags two a turn
    F = mockF(); const ins = [1, 2, 3].map(i => ({ uid: 'p' + i, id: 'rusty_sword' }));
    for (const i of ins) R('leg_perpetual').onPlay(F, i, ITEMS.rusty_sword);
    t.eq(ins.map(i => i.legGo || '-').join(), 'bounce,bounce,-', 'two bounces a turn');
    // the Black Hole: junk is flagged and hits the target
    F = mockF(); calls.length = 0; const rk = { uid: 'r', id: 'rock', junk: true };
    R('leg_black_hole').onPlay(F, rk, ITEMS.rock);
    t.ok(rk.legGo === 'void' && calls.some(c => c[0] === 'damage' && c[2] === DATA.LEG.K.voidDmg), 'junk falls in for 8');
  } finally { delete globalThis.COMBAT; }
});

t.test('round 12: ten more evolutions for the crawlers with few and the legendaries', () => {
  const L = DATA.LEG, REC = DATA.EVOLUTIONS;
  t.eq(L.EVOS.length, 10, 'ten recipes');
  const by = {};
  for (const id of L.EVOS) {
    const r = REC[id], base = ITEMS[r.from];
    t.ok(DATA.EVO_IDS.includes(id) && DATA.EVOLVED[id] && DATA.EVO_FX['evo:' + id], id + ': registered like the round 7 ones');
    t.ok(!Object.keys(ITEMS).includes(id) && ITEMS[id] === DATA.EVOLVED[id], id + ': found by id, never listed');
    const who = base.char || 'shared';
    by[who] = (by[who] || 0) + 1;
    t.ok(DATA.evoReady({ uid: 'q', id: r.from, plus: true }, [r.relic]) === r, id + ': ready with its item and relic');
    t.eq(DATA.evoReady({ uid: 'q', id: r.from, plus: true }, L.RELICS.filter(x => x !== r.relic)), null, id + ': never with the other legendaries');
  }
  for (const ch of ['bubbler', 'engineer', 'gambler', 'rogue']) t.ok((by[ch] | 0) >= 2, ch + ': two new recipes (' + (by[ch] | 0) + ')');
  t.ok(L.EVOS.filter(id => REC[id].relic.startsWith('leg_')).length >= 7, 'most use a new legendary relic');
  t.ok(DATA.EVO_FX['evo:calliope_pipe'].bub.combo === 2 && DATA.EVO_FX['evo:railgun_coil'].tur.amp === 1, 'the bubble and turret auras carry their numbers');
});

t.test('round 12: three animated cabinets on the Vault shelf', () => {
  const L = DATA.LEG;
  t.eq(L.SKINS.length, 3, 'three new skins');
  for (const id of L.SKINS) {
    const c = DATA.COSMETICS[id];
    t.ok(c && c.cat === 'skin' && DATA.vaultList('skin').includes(id) && DATA.COSMETIC_IDS.includes(id), id + ': on the skin shelf');
    t.ok(c.look.anim && c.look.fp && c.look.pp && isHex(c.look.frame) && isHex(c.look.neon), id + ': an animated look');
    t.ok(DATA.vaultPool(c.rarity).includes(id), id + ': in the Vault Capsule');
    const how = DATA.vaultHow(id);
    t.ok(how === 'buy' ? DATA.vaultPrice(id) === DATA.VAULT.PRICE[c.rarity] : how === 'capsule', id + ': sold or capsule only (' + how + ')');
  }
  t.ok(L.SKINS.some(id => DATA.vaultHow(id) === 'buy') && L.SKINS.some(id => DATA.vaultHow(id) === 'capsule'), 'some sold, one a capsule prize');
});

// ---------------------------------------------------------------- TRD (round 14): the Trading Post and pet evolution
// A random run's bin (a crawler's starter, reward items, some plus copies, sometimes a curse) and relics.
function trdCtx(seed) {
  const rng = U.rng(seed), chars = Object.keys(CHARACTERS), char = chars[seed % chars.length];
  const ids = Object.keys(ITEMS).filter(id => ITEMS[id].rarity !== 'junk');
  const bin = (CHARACTERS[char].bin || []).map((id, i) => ({ uid: 'a' + i, id, plus: rng() < 0.25 }));
  const extra = 2 + Math.floor(rng() * 10);
  for (let i = 0; i < extra; i++) bin.push({ uid: 'b' + i, id: ids[Math.floor(rng() * ids.length)], plus: rng() < 0.3 });
  if (rng() < 0.5) bin.push({ uid: 'j0', id: 'rock', plus: false });
  const pool = DATA.relicPool(null);
  const relics = [CHARACTERS[char].relic];
  for (let i = 0; i < Math.floor(rng() * 5); i++) relics.push(pool[Math.floor(rng() * pool.length)]);
  return { bin, relics, relicPool: pool.filter(id => relics.indexOf(id) < 0), char, removePrice: 78, binFloor: 3 };
}
t.test('trd: every trade is a swap by its value rule, never free value', () => {
  const T = DATA.TRD, K = DATA.TRD_K, RANK = T.RANK;
  t.eq(K.n, 3, 'three trades a visit');
  t.eq(DATA.trdValue('rusty_sword', false), K.VAL.c, 'a common is worth the common shelf price');
  t.eq(DATA.trdValue('rusty_sword', true), Math.round(K.VAL.c * K.plusK), 'a plus copy is worth plusK more');
  t.eq(DATA.trdValue('rock', true), 0, 'junk is worth nothing, plus or not');
  // the value table matches the shelf (the average item cost by rarity)
  for (const r of ['c', 'u', 'r', 'l']) {
    const cs = Object.keys(ITEMS).filter(id => ITEMS[id].rarity === r).map(id => ITEMS[id].cost || 0);
    const avg = cs.reduce((a, b) => a + b, 0) / cs.length;
    t.ok(Math.abs(avg - K.VAL[r]) <= 3, `VAL.${r} ${K.VAL[r]} is the shelf's average (${avg.toFixed(1)})`);
  }
  // a plus copy is worth about one rarity step (the Compactor's own rate)
  t.ok(Math.abs(K.VAL.c * K.plusK / K.VAL.u - 1) < 0.1 && Math.abs(K.VAL.u * K.plusK / K.VAL.r - 1) < 0.1, 'plus c ~ u, plus u ~ r');
  const kinds = { swap: 0, relic: 0, service: 0, bundle: 0 }, ratio = { swap: [], relic: [], service: [], bundle: [] };
  let n = 0;
  for (let s = 1; s <= 600; s++) {
    const ctx = trdCtx(s), offers = DATA.trdRoll(U.rng(s * 7 + 1), ctx), L = 'seed ' + s;
    t.ok(offers.length >= 1 && offers.length <= K.n, L + ': one to three trades');
    const uids = [];
    for (const o of offers) {
      kinds[o.k]++; n++;
      if (o.vGive > 0) ratio[o.k].push(o.vGet / o.vGive);
      if (o.k === 'swap') {
        const g = ctx.bin.find(i => i.uid === o.give.uid);
        t.ok(g && g.id === o.give.id && !!g.plus === o.give.plus, L + ': swap names an item of your bin');
        const gd = ITEMS[o.give.id], rd = ITEMS[o.get.id];
        t.ok(rd && o.get.id !== o.give.id && rd.rarity !== 'junk' && !rd.starter && !rd.evolved && gd.rarity !== 'junk' && !gd.evolved, L + ': a different real item for a real item');
        const up = o.give.plus && gd.rarity !== 'l';
        t.ok(up ? RANK[rd.rarity] === RANK[gd.rarity] + 1 && !o.get.plus : rd.rarity === gd.rarity && o.get.plus === o.give.plus, L + ': the rarity rule (' + gd.rarity + (o.give.plus ? '+' : '') + ' -> ' + rd.rarity + (o.get.plus ? '+' : '') + ')');
        const mine = DATA.kwIds(gd);
        if (mine.length) t.ok(DATA.kwIds(rd).some(k => mine.includes(k)) && mine.includes(o.get.kw), L + ': shares a keyword');
        t.ok(!rd.char || rd.char === ctx.char, L + ': from the crawler\'s own pool');
        uids.push(o.give.uid);
      } else if (o.k === 'relic') {
        const a = RELICS[o.give], b = RELICS[o.get];
        t.ok(ctx.relics.includes(o.give) && ctx.relicPool.includes(o.get) && !ctx.relics.includes(o.get), L + ': one of yours for one you lack');
        t.ok(a.rarity === b.rarity && ['c', 'u', 'r'].includes(a.rarity) && o.rar === a.rarity && !a.starter && o.give !== CHARACTERS[ctx.char].relic, L + ': the same rarity, never the crawler\'s own');
        t.ok(DATA.kwIds(b).length && !DATA.kwIds(b).some(k => DATA.kwIds(a).includes(k)) && DATA.kwIds(b).includes(o.kw), L + ': another archetype, and the hint names it');
      } else if (o.k === 'service') {
        t.eq(o.price, ctx.removePrice, L + ': the removal at the price given');
        t.eq(o.mode, ctx.bin.some(i => ITEMS[i.id].rarity === 'junk') ? 'curse' : 'remove', L + ': a curse to lift when there is junk');
        t.ok(o.vGive === o.price && o.vGet === o.price, L + ': gold for its worth');
      } else if (o.k === 'bundle') {
        const [a, b] = o.give.map(g => ctx.bin.find(i => i.uid === g.uid));
        t.ok(a && b && a.uid !== b.uid && !a.plus && !b.plus, L + ': two different items, neither a plus');
        t.ok(ITEMS[a.id].rarity === ITEMS[b.id].rarity && K.bundleRar.includes(ITEMS[a.id].rarity), L + ': both of one rarity, common or uncommon');
        t.eq(ITEMS[o.get.id].rarity, T.bundleRar(a, b), L + ': the next rarity up');
        t.eq(RANK[o.rar], RANK[ITEMS[a.id].rarity] + 1, L + ': one step up');
        t.ok(o.get.id !== a.id && o.get.id !== b.id && !o.get.plus, L + ': never one of the two, not a plus');
        uids.push(a.uid, b.uid);
      }
    }
    t.eq(new Set(uids).size, uids.length, L + ': an item is never in two trades');
    t.eq(JSON.stringify(DATA.trdRoll(U.rng(s * 7 + 1), trdCtx(s))), JSON.stringify(offers), L + ': the same seed deals the same trades');
  }
  for (const k in kinds) t.ok(kinds[k] > 60, `every kind is dealt (${k}: ${kinds[k]} of ${n})`);
  // about neutral: the swap and the relic exactly or near; the bundle keeps a cut for the thinner bin
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  t.ok(avg(ratio.swap) > 0.93 && avg(ratio.swap) < 1.08, 'swap: worth for worth ' + avg(ratio.swap).toFixed(3));
  t.ok(ratio.relic.every(r => r === 1), 'relic: always the same rarity');
  t.ok(ratio.service.every(r => r === 1), 'service: the price is the worth');
  t.ok(avg(ratio.bundle) > 0.78 && avg(ratio.bundle) < 0.9, 'bundle: two for one step up, the merchant\'s cut ' + avg(ratio.bundle).toFixed(3));
  // the bundle rule on mixed pairs; the floors
  t.eq(T.bundleRar({ id: 'rock' }, { id: 'rusty_sword' }), 'c', 'junk and a common: a common');
  const u = Object.keys(ITEMS).find(id => ITEMS[id].rarity === 'u'), r = Object.keys(ITEMS).find(id => ITEMS[id].rarity === 'r');
  t.eq(T.bundleRar({ id: u }, { id: r }), 'r', 'an uncommon and a rare: one above the lower');
  const small = { bin: [0, 1, 2].map(i => ({ uid: 's' + i, id: 'rusty_sword', plus: false })), relics: [], relicPool: DATA.relicPool(null), char: 'knight', removePrice: 78, binFloor: 3 };
  t.ok(DATA.trdRoll(U.rng(5), small).every(o => o.k === 'swap'), 'a bin at its floor: no removal and no bundle, and no relic without relics');
  t.ok(DATA.trdRoll(U.rng(5), { bin: [], relics: [] }).length === 0, 'an empty bin deals nothing');
  // the saved post
  t.eq(DATA.trdFix(null), null, 'junk: null');
  t.eq(DATA.trdFix({ offers: 'x' }), null, 'no offers: null');
  const fx = DATA.trdFix({ seed: 5, offers: [{ k: 'swap' }, { k: 'nope' }, { k: 'service' }] });
  t.ok(fx && fx.offers.length === 2 && fx.done.length === 2 && fx.done.every(d => d === false), 'unknown kinds dropped, done defaulted');
});
t.test('trd: pet evolution: gated by level, once, the fee by act, a final form for every pet', () => {
  const P = DATA.PEV, K = DATA.PEV_K;
  t.eq(K.lv, DATA.PET_MAX, 'evolves at the top level');
  for (const id of DATA.PET_IDS) {
    const f = DATA.PEV_FORMS[id];
    t.ok(f && f.name && f.trick && f.text && f.icon && isHex(f.col) && ['bolts', 'hat', 'fangs', 'ink', 'stars', 'wings'].includes(f.flair), id + ': a final form');
    t.ok(f.fx && ['dmg', 'dmgAll', 'block', 'heal', 'status'].includes(f.fx.k) && f.fx.v > 0 && (f.fx.k !== 'status' || STATUS[f.fx.s]), id + ': a flourish COMBAT runs');
    t.ok((f.name + f.trick + f.text).indexOf(String.fromCharCode(0x2014)) < 0, id + ': no em dash');
    const p = DATA.petNew(id, 7);
    t.ok(!DATA.pevCan(p), id + ': Lv 1 cannot evolve');
    p.xp = DATA.PET_XP[3]; t.ok(!DATA.pevCan(p), id + ': Lv 4 cannot');
    p.xp = DATA.PET_XP[4]; p.lv = 5; t.ok(DATA.pevCan(p) && !DATA.pevOn(p), id + ': Lv 5 can');
    p.evo = 1; t.ok(!DATA.pevCan(p) && DATA.pevOn(p), id + ': once evolved, never again');
  }
  t.ok(!DATA.pevCan(null) && !DATA.pevCan({ id: 'dragon', xp: 999 }) && !DATA.pevOn({ id: 'cat' }), 'junk and ordinary pets');
  const k = DATA.ECONOMY.shopK;
  t.eq(DATA.pevFee(1), Math.round(80 * k), 'act 1 fee');
  t.eq(DATA.pevFee(2), Math.round(120 * k), 'act 2 fee');
  t.eq(DATA.pevFee(3), Math.round(160 * k), 'act 3 fee');
  t.eq(DATA.pevFee(7), DATA.pevFee(3), 'Endless loops pay the act 3 fee');
  t.eq(DATA.pevFee(1, 0.25), Math.round(80 * k * 1.25), 'the Price Hike stacks');
  t.ok(DATA.pevFee(2) >= 100 && DATA.pevFee(2) <= 208, 'about a relic\'s worth, never more than a shop\'s uncommon relic');
  t.near(DATA.pevPow(5, true) - DATA.pevPow(5, false), K.pow, 1e-9, 'evolved: the trick is PEV_K.pow stronger');
  // the saved pet keeps its evolution; an old or junk flag does not sneak in
  const top = DATA.petFix({ id: 'cat', xp: 100, evo: 1 });
  t.eq(top.evo, 1, 'an evolved pet stays evolved');
  t.ok(!('evo' in DATA.petFix({ id: 'cat', xp: 100 })), 'an old save has no flag');
  t.ok(!('evo' in DATA.petFix({ id: 'cat', xp: 20, evo: 1 })), 'a flag below the top level is dropped');
});

/* ------------------------------------------------- DEP (round 15): the Neon Depths */
t.test('dep: every third loop from 3 dives into the Neon Depths; the classic cycle carries on between', () => {
  const K = DATA.DEP_K;
  t.eq(K.from, 3, 'the first dive is Loop 3');
  t.eq(K.every, 3, 'then every third loop');
  const seq = [];
  for (let l = 1; l <= 12; l++) seq.push(DATA.depLoop(l) ? 'D' + DATA.depAct(l) : String(DATA.depAct(l)));
  t.eq(seq.join(' '), '1 2 D3 3 1 D3 2 3 D3 1 2 D3', 'the loops: cellar, foundry, a dive, vault, ...');
  t.eq([1, 2, 3, 4, 5, 6, 7].map(DATA.endlessAct).join(), '1,2,3,1,2,3,1', 'endlessAct itself is unchanged');
  t.eq([0, 1, 2, 3, 4, 5, 6, 9, 12].map(DATA.depDives).join(), '0,0,0,1,1,1,2,3,4', 'the dives counted up to a loop');
  t.ok(!DATA.depLoop(0) && !DATA.depLoop(-3) && !DATA.depLoop('junk') && !DATA.depLoop(null), 'junk is never a dive');
  // every classic act still comes round between dives
  const acts = new Set(); for (let l = 1; l <= 12; l++) if (!DATA.depLoop(l)) acts.add(DATA.depAct(l));
  t.eq([...acts].sort().join(), '1,2,3', 'all three classic acts come round');
});

t.test('dep: five monsters, an elite and a boss, each with its trick; pools, junk, Codex and a sticker', () => {
  const E = DATA.ENEMIES, K = DATA.DEP_K;
  const ids = DATA.DEP_ENEMIES.map((e) => e.id);
  t.eq(ids.join(), 'dep_angler,dep_jelly,dep_crab,dep_eel,dep_mimic,dep_jukebox', 'the six Depths monsters');
  const kinds = new Set();
  for (const id of ids) {
    const d = E[id];
    t.ok(d && d.dep && d.act === 3 && d.look === id && d.name && d.desc, id + ': a Depths monster with its own look');
    t.ok(d.hp[0] > 0 && d.hp[1] >= d.hp[0] && d.pattern.every((i) => d.moves[i]), id + ': hp and a pattern that points at its moves');
    for (const m of d.moves) { if (DATA.DEP_KINDS.includes(m.k)) kinds.add(m.k); t.ok(m.name && m.txt && m.txt.indexOf(String.fromCharCode(0x2014)) < 0, id + '.' + m.id + ': named, no em dash'); }
  }
  t.eq([...kinds].sort().join(), 'decoy,jellies,lure,pinch,shock', 'every Depths trick is used by a move');
  t.eq(E.dep_mimic.tier, 'elite', 'the Sunken Mimic is the elite');
  t.ok(E.dep_mimic.enrage && E.dep_mimic.taunt, 'with an enrage and a taunt');
  const J = E.dep_jukebox;
  t.ok(J.tier === 'boss' && J.sig && J.sig.id === 'tide' && J.sig.sign && J.sig.shout && J.sig.text && J.taunt && J.enrage, 'The Drowned Jukebox: High Tide, a taunt, a B-side');
  t.eq(K.boss, 'dep_jukebox', 'the Depths boss');
  t.ok(K.tide.lo > 0 && K.tide.lo < K.tide.hi && K.tide.hi < K.tide.hiRage && K.tide.hiRage < 0.9, 'the tide stays inside the bin');
  t.ok(K.hpK >= 1 && K.dmgK >= 1, 'the Depths are never softer than the act 3 pools');
  // the pools: only Depths monsters, the right tiers
  const P = DATA.DEP_ENC;
  for (const tier of ['normal', 'elite', 'boss']) {
    t.ok(P[tier].length > 0, tier + ': a pool');
    for (const g of P[tier]) for (const id of g) t.ok(E[id] && E[id].dep, `${tier} ${g}: a Depths monster`);
  }
  t.ok(P.normal.every((g) => g.every((id) => E[id].tier === 'normal')), 'normals are normals');
  t.ok(P.elite.every((g) => E[g[0]].tier === 'elite'), 'each elite pool leads with the elite');
  t.eq(P.boss[0][0], 'dep_jukebox', 'the boss pool');
  t.eq(DATA.depEnc(), P, 'depEnc hands them out');
  // the classic pools never see them; an Endless mix never borrows High Tide
  for (const a of [1, 2, 3]) for (const tier of ['normal', 'elite', 'boss']) for (const g of DATA.ENCOUNTERS[a][tier] || []) t.ok(g.every((id) => !E[id].dep), `act ${a} ${tier} has no Depths monster`);
  for (let s = 1; s <= 200; s++) { const r = U.rng(s); for (const a of [1, 2, 3]) { const m = DATA.endlessMix(r, a); t.ok(!m || !E[m].dep, 'the mix never borrows the Jukebox'); } }
  // the junk: reachable, never listed
  for (const id of ['dep_boot', 'dep_jellyling', 'dep_chest']) {
    t.ok(DATA.ITEMS[id] && DATA.ITEMS[id].rarity === 'junk' && DATA.ITEMS[id].name && DATA.ITEMS[id].text, id + ': a junk item');
    t.ok(Object.keys(DATA.ITEMS).indexOf(id) < 0, id + ': never in a pool or the Prizedex');
  }
  t.ok(DATA.ITEMS.dep_jellyling.density < 1 && DATA.ITEMS.dep_boot.density > 1 && DATA.ITEMS.dep_chest.density > 1, 'jellies float, boots and chests sink');
  // the Codex: the floor, the boss and the five monsters
  const book = DATA.loreBook();
  for (const id of ['fl_depths', 'bo_jukebox', 'be_dep_angler', 'be_dep_jelly', 'be_dep_crab', 'be_dep_eel', 'be_dep_mimic']) {
    const p = book.byId[id];
    t.ok(p && p.name && p.text && p.text.length > 200 && p.text.indexOf(String.fromCharCode(0x2014)) < 0, id + ': a Codex page');
  }
  // meta.dep repairs; the sticker
  t.eq(JSON.stringify(DATA.depFix()), '{"dives":0,"jukebox":0,"best":0}', 'an old profile: no dives');
  t.eq(JSON.stringify(DATA.depFix({ dives: '3', jukebox: -2, best: 1e99 })), '{"dives":3,"jukebox":0,"best":1000000000}', 'junk is repaired');
  t.ok(DATA.ACHIEVEMENTS.deep_diver && DATA.ACH_IDS.includes('deep_diver'), 'the Deep Diver sticker');
  t.ok(DATA.achCheck({ kind: 'meta', meta: { dep: { jukebox: 1 } } }, {}).includes('deep_diver'), 'unplugging a Jukebox earns it');
  t.ok(!DATA.achCheck({ kind: 'meta', meta: { dep: { dives: 4 } } }, {}).includes('deep_diver'), 'diving alone does not');
  // the score line and the history record
  const sc = DATA.runScore({ endless: { loop: 3 }, sc: { dep: 1 } }, true);
  t.ok(sc.lines.some((l) => l.k === 'dep' && l.v === K.dive), 'a Jukebox unplugged scores');
  t.ok(!DATA.runScore({ endless: { loop: 3 }, sc: {} }, true).lines.some((l) => l.k === 'dep'), 'no line without one');
  const rec = DATA.hisRecFix({ id: 'x1', c: 'knight', dp: 2 }), rec0 = DATA.hisRecFix({ id: 'x2', c: 'knight', dp: 'junk' });
  t.eq(rec.dp, 2, 'a history record keeps its dives');
  t.ok(!('dp' in rec0), 'junk dives are dropped');
});

// ------------------------------------------------ round 17 (TECH): Cabinet Tech and Joy Stick
// DESIGN.md "Cabinet Tech and the new crawler (round 17)".
const TECH_DASH = new RegExp(String.fromCharCode(0x2014));
t.test('tech: Joy Stick, the Technician', () => {
  const c = CHARACTERS.techie;
  t.ok(c && c.name === 'Joy Stick' && c.title === 'The Technician', 'Joy Stick, The Technician');
  t.eq(c.bin.length, 19, 'a 19 item starting bin');
  t.ok(c.bin.filter(id => ITEMS[id].char === 'techie').length >= 12 && c.bin.every(id => R17_ITEMS.includes(id) || !ITEMS[id].char), 'the bin is mostly her new kit');
  t.ok(c.tech === true && c.relic === 'service_remote' && RELICS.service_remote.starter && RELICS.service_remote.rarity === 'event', 'her gift: the cabinet; her starter: the Service Remote');
  t.ok(c.hp === 70 && c.claw.grabs === 3 && c.claw.speed > 1, 'hp, grabs, quick rails');
  t.eq(c.unlock, 'fever', 'unlocked by LAMP FEVER');
  t.eq(c.vsLine, 'Hold on, rebooting you.', 'her versus line');
  const seen = new Set();
  for (let d = 0; d < 200; d++) seen.add(DATA.dailyChar('2026-12-' + d));
  t.ok(seen.has('techie'), 'the daily rotation deals her in');
  const wk = new Set();
  for (let w = 1; w <= 52; w++) wk.add(DATA.wkDef('2027-W' + String(w).padStart(2, '0')).char);
  t.ok(wk.has('techie'), 'so does the weekly challenge');
  for (const r of ['c', 'u', 'r', 'l']) t.ok(DATA.pool(r, 'techie').length >= 1, `pool ${r}/techie has choices`);
  for (let seed = 1; seed <= 200; seed++) {
    const r = DATA.rewardItems(U.rng(seed), 1 + (seed % 3), 'techie');
    if (r.length !== 3 || !r.every(id => ITEMS[id] && !ITEMS[id].starter && (!ITEMS[id].char || ITEMS[id].char === 'techie'))) { t.ok(false, `techie rewards seed ${seed} [${r}]`); break; }
  }
  t.ok(true, 'her reward screens only offer shared and Joy Stick items');
  let lamps = 0;
  for (const id of R17_ITEMS) {
    const d = ITEMS[id];
    t.ok(d && d.char === 'techie' && !TECH_DASH.test(d.name + d.text), `${id}: hers, no em dash`);
    t.ok(d.lamp == null || (Number.isInteger(d.lamp) && d.lamp >= 1 && d.lamp <= 4), `${id}: a sane lamp count`);
    t.ok(DATA.kwIds(d).includes('tech'), `${id}: wears the Tech chip`);
    if (d.lamp) lamps++;
  }
  t.ok(lamps >= 6, `arcade parts light the lamp (${lamps})`);
  t.ok(R17_ITEMS.some(id => ITEMS[id].rarity === 'l'), 'a legendary of her own');
  t.ok(DATA.loreHint && /Joy Stick/.test(DATA.loreHint('cr_techie', {})), 'a Codex page for her');
  const kit = DATA.rushKit('techie');
  t.ok(kit.items.some(id => ITEMS[id].char === 'techie') && kit.relics.includes('fever_dream'), 'a Boss Rush kit of her own (Duo seats use it too)');
});
t.test('tech: the Cabinet Tech relics, their numbers and hooks', () => {
  const A = DATA.ARCHETYPES.tech;
  t.ok(A && A.label === 'Tech' && isHex(A.color), 'the Tech archetype');
  t.eq(DATA.TECH.RELICS.length, 10, 'ten relics in the family');
  const rar = {};
  for (const id of DATA.TECH.RELICS) {
    const r = RELICS[id];
    t.ok(r && r.kw[0] === 'tech' && !TECH_DASH.test(r.name + r.text) && r.proc && r.proc.length <= 16, `${id}: a Tech relic, no em dash`);
    rar[r.rarity] = (rar[r.rarity] || 0) + 1;
    if (r.rarity !== 'l') t.ok(DATA.relicPool(r.rarity).includes(id), `${id}: in relicPool('${r.rarity}')`);
  }
  t.ok(rar.c >= 3 && rar.u >= 2 && rar.r >= 2 && rar.l === 1, 'a mix of rarities, one legendary: ' + JSON.stringify(rar));
  t.ok(!DATA.relicPool().includes('leg_motherboard') && RELICS.leg_motherboard.leg, 'the legendary stays out of the common pools');
  // the cabinet numbers
  const z = DATA.techMods([], 'knight');
  t.ok(Object.values(z).every(v => v === 0), 'nothing for a knight without them');
  const g = DATA.techMods([], 'techie'), K = DATA.TECH.K;
  t.ok(g.evP === K.giftEvP && g.first === 1 && g.perfLamp === 1, 'her gift: more events, from turn 1, a PERFECT lights one more');
  const m = DATA.techMods(['laser_sight', 'coin_hopper', 'lamp_oil', 'double_feature', 'service_key'], 'knight');
  t.ok(m.perfX === K.laserX && m.laser === 1 && m.coins === 3 && m.coinGold === 1 && m.lampStart === 4 && m.double === 1 && m.first === 1, 'the relics add up');
  t.eq(DATA.techMods(['leg_motherboard', 'service_key'], 'techie').evP, 1, 'the chance is capped at every turn');
  // the hooks through a recording COMBAT
  const calls = [];
  globalThis.COMBAT = {
    damage: (F, src, e, v) => { calls.push(['damage', v]); return v; }, status: (F, who, s, v) => { calls.push([s, v]); return v; },
    heal: (F, who, v) => { calls.push(['heal', v]); return v; }, emit: (F, ev) => { calls.push(['emit', ev.t, ev.text]); return ev; },
  };
  const H = (id) => RELICS[id].hooks;
  const live = () => Object.assign(mockF(), { tech: { on: true } });
  try {
    let F = live(); calls.length = 0;
    H('service_remote').onCab(F, 'event', 0, 'surge');
    t.ok(calls.some(c => c[0] === 'damage' && c[1] === 3) && calls.some(c => c[0] === 'block' && c[1] === 3), 'the remote: 3 to ALL and 3 Block per event');
    calls.length = 0; F.turn = 2; H('service_remote').onTurnStart(F);
    t.eq(calls.length, 0, 'a live cabinet never rings it on its own');
    F = mockF(); F.turn = 2; calls.length = 0; H('service_remote').onTurnStart(F);
    t.ok(calls.some(c => c[0] === 'damage'), 'a quiet cabinet (Duo) rings it every 2nd turn');
    F.turn = 3; calls.length = 0; H('service_remote').onTurnStart(F);
    t.ok(!calls.some(c => c[0] === 'damage'), 'and not on the odd ones');
    F = live(); calls.length = 0;
    H('metronome').onCab(F, 'perfect', 1); H('metronome').onCab(F, 'perfect', 3); H('metronome').onCab(F, 'perfect', 9);
    t.eq(calls.filter(c => c[0] === 'damage').map(c => c[1]).join(), '4,12,16', 'the Metronome: 4 per PERFECT in the streak, 16 at most');
    F = live(); const g0 = F.player.grabs;
    H('trick_shot').onCab(F, 'perfect', 1); t.eq(F.player.grabs, g0, 'Trick Shot: not on a first PERFECT');
    H('trick_shot').onCab(F, 'perfect', 2); H('trick_shot').onCab(F, 'perfect', 3);
    t.eq(F.player.grabs, g0 + 1, 'x2 gives the grab back, once a turn');
    F = live(); calls.length = 0;
    H('circuit_breaker').onCab(F, 'event', 0, 'surge'); H('circuit_breaker').onCab(F, 'event', 0, 'coins'); H('circuit_breaker').onCab(F, 'event', 0, 'capsule');
    t.ok(calls.some(c => c[0] === 'damage' && c[1] === 6) && calls.some(c => c[0] === 'block' && c[1] === 6) && calls.some(c => c[0] === 'heal' && c[1] === 5), 'the Circuit Breaker answers each event its own way');
    F = live(); calls.length = 0; H('fever_dream').onCab(F, 'fever', 1); H('leg_motherboard').onCab(F, 'fever', 1);
    t.ok(calls.some(c => c[0] === 'damage' && c[1] === 8) && calls.some(c => c[0] === 'damage' && c[1] === 15), 'LAMP FEVER: 8 (Fever Dream), 15 (the Motherboard)');
    F = live(); calls.length = 0; H('fever_dream').onCab(F, 'perfect', 1); H('laser_sight').onCab(F, 'event', 0, 'coins');
    t.eq(calls.length, 0, 'each answers only its own kind');
  } finally { delete globalThis.COMBAT; }
});
t.test('tech: combos, stickers, outfits', () => {
  for (const id of DATA.TECH.COMBOS) {
    const c = DATA.COMBOS[id];
    t.ok(c && !TECH_DASH.test(c.name + c.text), `${id}: a recipe`);
    t.ok(DATA.combosFor(c.example.map(i => ITEMS[i]), c.ctx || null).some(x => x.id === id), `${id}: its example fires`);
    t.ok(!DATA.combosFor(c.miss.map(i => ITEMS[i]), c.ctx || null).some(x => x.id === id), `${id}: its miss does not`);
  }
  t.ok(!DATA.combosFor([ITEMS.rusty_sword, ITEMS.crisp_apple], { perfect: 0 }).some(x => x.id === 'bullseye'), 'Bullseye wants a PERFECT grab');
  t.ok(DATA.combosFor([ITEMS.coin_mech, ITEMS.lucky_penny], null).some(x => x.id === 'coin_op'), 'Coin-Op: her Coin Mech and a penny');
  const ev = (n) => DATA.achCheck({ kind: 'ev', ev: { t: 'tech', k: 'perfect', n } }, {});
  t.ok(ev(5).includes('perfect_game') && !ev(4).includes('perfect_game'), 'Perfect Game: five PERFECT grabs in a row');
  t.ok(DATA.achCheck({ kind: 'win', run: { char: 'techie' } }, {}).includes('tech_support') && !DATA.achCheck({ kind: 'win', run: { char: 'knight' } }, {}).includes('tech_support'), 'Tech Support: a win as her');
  t.ok(DATA.ACH_IDS.length <= 63, `the board holds ${DATA.ACH_IDS.length} of 63`);
  const fits = DATA.vaultList('outfit', 'techie');
  t.eq(fits.join(), 'fit_joy_headset,fit_joy_visor', 'two outfits of hers');
  t.ok(fits.every(id => DATA.vaultPrice(id) > 0), 'both for sale');
});

// ---------------------------------------------------------------- GACHA (round 17): Capsule fever
t.test('gacha: the Capsule Minis table: four series of six (c c u u r l), a rainbow Vault prize per series, no em dash', () => {
  const G = DATA.GACHA;
  t.ok(G && G.SERIES && G.MINIS, 'DATA.GACHA is there');
  t.eq(G.SERIES.length, 4, 'four series');
  t.eq(G.MINI_IDS.length, 24, 'twenty four minis');
  for (const s of G.SERIES) {
    const ids = G.seriesIds(s.id);
    t.eq(ids.map((id) => G.MINIS[id].rarity).sort().join(''), ['c', 'c', 'u', 'u', 'r', 'l'].sort().join(''), `${s.id}: two common, two uncommon, a rare, a legendary`);
    const cos = DATA.COSMETICS[s.reward];
    t.ok(cos && cos.rarity === 'l' && DATA.vaultHow(s.reward) === 'capsule', `${s.id}: the prize ${s.reward} is a capsule-only legendary`);
    t.ok(/^#[0-9a-f]{6}$/i.test(s.col) && s.icon && s.name, `${s.id}: a name, an icon, a colour`);
  }
  for (const id of G.MINI_IDS) {
    const m = G.MINIS[id];
    t.ok(m.name && m.text && m.look && m.look.body && m.look.c1 && m.look.c2, `${id}: a name, a line and a look`);
    t.ok(G.seriesOf(id) && G.seriesOf(id).id === m.series, `${id}: its series`);
  }
  t.eq(new Set(G.MINI_IDS.map((id) => G.MINIS[id].look.body)).size, 24, 'every mini has a body of its own');
  const EM = String.fromCharCode(0x2014);
  t.eq(JSON.stringify(G).indexOf(EM), -1, 'no em dash');
  t.ok(G.DUPE.c < G.DUPE.u && G.DUPE.u < G.DUPE.r && G.DUPE.r < G.DUPE.l, 'rarer dupes pay more vault tickets');
});

t.test('gacha: the mini rolls match their weights, deterministic by seed; the tease is a stable fifth of common and uncommon capsules only', () => {
  const G = DATA.GACHA, N = 20000;
  for (const tier of ['c', 'u', 'r', 'l']) {
    const rng = U.rng(4242 + tier.charCodeAt(0)), n = { c: 0, u: 0, r: 0, l: 0 };
    let has = 0;
    for (let i = 0; i < N; i++) { n[G.MINIS[G.rollMini(rng, tier)].rarity]++; if (G.hasMini(rng, tier)) has++; }
    const W = G.W[tier], tot = W.c + W.u + W.r + W.l;
    for (const k of ['c', 'u', 'r', 'l']) t.near(n[k] / N, W[k] / tot, 0.015, `a ${tier} capsule's mini is ${k} ${W[k]}/${tot}`);
    t.near(has / N, G.CHANCE[tier], 0.015, `a ${tier} run capsule carries a mini ${G.CHANCE[tier]} of the time`);
  }
  const a = U.rng(99), b = U.rng(99);
  t.eq([0, 1, 2, 3, 4, 5].map(() => G.rollMini(a, 'r')).join(), [0, 1, 2, 3, 4, 5].map(() => G.rollMini(b, 'r')).join(), 'same seed, same minis');
  let tc = 0;
  for (let i = 0; i < 4000; i++) if (G.tease('cap' + i, i % 2 ? 'c' : 'u')) tc++;
  t.near(tc / 4000, G.TEASE, 0.03, 'about a fifth of common and uncommon capsules tease');
  t.eq(G.tease('x', 'c'), G.tease('x', 'c'), 'the same capsule always teases the same way');
  let rl = 0;
  for (let i = 0; i < 500; i++) if (G.tease('cap' + i, 'r') || G.tease('cap' + i, 'l')) rl++;
  t.eq(rl, 0, 'a rare or legendary capsule never teases (it has the real thing)');
});

t.test('gacha: capsule odds are untouched (the LOOT tables, rollCapsule, the Vault Capsule)', () => {
  const W = DATA.LOOT.WEIGHTS, N = 20000;
  for (const src of ['normal', 'elite', 'boss']) {
    const rng = U.rng(777), n = { c: 0, u: 0, r: 0, l: 0 };
    for (let i = 0; i < N; i++) n[DATA.rollCapsule(rng, src, { pity: 0 }).tier0]++;
    const w = W[src], tot = w.c + w.u + w.r + w.l;
    for (const k of ['c', 'u', 'r', 'l']) t.near(n[k] / N, w[k] / tot, 0.015, `${src}: the ${k} drop rate is still ${w[k]}/${tot}`);
  }
  t.eq(JSON.stringify(W.normal) + JSON.stringify(W.elite) + JSON.stringify(W.boss), JSON.stringify({ c: 72, u: 22, r: 5.5, l: 0.5 }) + JSON.stringify({ c: 36, u: 44, r: 17, l: 3 }) + JSON.stringify({ c: 0, u: 34, r: 56, l: 10 }), 'the round 12 weights stand');
  t.eq(DATA.LOOT.PITY, 8, 'the pity is still 8');
  t.eq(JSON.stringify(DATA.VAULT.CAP_W), JSON.stringify({ c: 58, u: 30, r: 10, l: 2 }), 'the Vault Capsule odds are unchanged');
});

// ---- round 21 (DESIGN.md "Combo relics and a gentler, clearer start (round 21)")
t.test('cr: every recipe sits in one combo family, every family has its relic, one relic has them all', () => {
  const CR = DATA.CR;
  t.ok(CR && CR.IDS.length >= 4 && CR.IDS.length <= 7, `4..7 families [${CR.IDS.join(', ')}]`);
  for (const id in DATA.COMBOS) t.ok(CR.FAM[DATA.COMBOS[id].cr], `${id}: in a family [${DATA.COMBOS[id].cr}]`);
  for (const f of CR.IDS) {
    const r = DATA.RELICS[CR.FAM[f].relic];
    t.ok(r && r.combo === f && ['c', 'u', 'r'].includes(r.rarity) && !r.starter, `${f}: its relic ${CR.FAM[f].relic} switches it on, a pool rarity`);
    t.ok(Object.values(DATA.COMBOS).some(c => c.cr === f), `${f}: has recipes`);
    t.ok(typeof r.proc === 'string' && /COMBO/.test(r.proc), `${f}: its proc says COMBO [${r.proc}]`);
  }
  t.ok(DATA.RELICS[CR.ALL] && DATA.RELICS[CR.ALL].combo === 'all' && DATA.RELICS[CR.ALL].rarity === 'r', 'The Strategy Guide: every family, rare');
  t.eq(CR.BUBBLE, 'party', 'the Bubble Combo is a Party combo');
  // crFamOf / crOn
  const on = DATA.crFamOf(['squire_gauntlet', 'cr_steel']);
  t.ok(DATA.crOn(on, DATA.COMBOS.armory) && !DATA.crOn(on, DATA.COMBOS.picnic) && !DATA.crOn(DATA.crFamOf([]), DATA.COMBOS.armory), 'a family relic: its own recipes only; none without one');
  t.ok(Object.values(DATA.COMBOS).every(c => DATA.crOn(DATA.crFamOf(['cr_all']), c)), 'the Strategy Guide: every recipe');
  // combosFor honours ctx.on before it fills the slots
  const defs = ['femur', 'femur', 'femur'].map(id => DATA.ITEMS[id]);
  const all = DATA.combosFor(defs).map(c => c.id), steel = DATA.combosFor(defs, { on: (c) => c.cr === 'steel' }).map(c => c.id);
  t.ok(all.some(id => DATA.COMBOS[id].cr === 'jackpot') && steel.length >= 1 && steel.every(id => DATA.COMBOS[id].cr === 'steel'), `ctx.on keeps the off recipes out (${all.join(',')} -> ${steel.join(',')})`);
  t.eq(DATA.combosFor(defs, { on: () => false }).length, 0, 'everything off: nothing fires');
  // starting crawlers built on a family
  t.ok(CR.START.gambler === 'cr_casino' && CR.START.bubbler === 'cr_party' && !CR.START.knight && !CR.START.techie, 'Lucky Lou: Casino, Ms. Bubbles: Party; the rest start with none');
});

t.test('cr: boosters and the pools, the first elite\'s offer', () => {
  const boosters = Object.keys(DATA.RELICS).filter(id => DATA.crBoosts(DATA.RELICS[id]));
  for (const id of ['encore_machine', 'tuning_fork', 'ticket_roll', 'leg_crowd', 'squeaky_toy']) t.ok(boosters.includes(id), `${id} feeds combos`);
  t.ok(!boosters.some(id => DATA.RELICS[id].combo), 'a combo relic is not a booster');
  const r0 = { act: 1, relics: ['squire_gauntlet'], bin: [] };
  t.ok(boosters.every(id => !DATA.crPoolOk(id, r0)) && DATA.CR.RELICS.every(id => !DATA.crPoolOk(id, r0)), 'act 1, nothing yet: no boosters, no combo relics');
  t.ok(DATA.CR.RELICS.every(id => DATA.crPoolOk(id, Object.assign({}, r0, { crPick: 1 }))), 'after the first elite\'s offer: combo relics in the pools');
  t.ok(boosters.every(id => DATA.crPoolOk(id, Object.assign({}, r0, { relics: ['cr_feast'] }))), 'a combo relic in hand: boosters too');
  t.ok(DATA.crPoolOk('grip_tape', r0) && DATA.crPoolOk('kettle_helm', r0), 'every other relic as before');
  const seen = {};
  for (let s = 1; s <= 200; s++) {
    const o = DATA.crOffer(U.rng(s), { relics: ['snake_eyes', 'cr_casino'], bin: [] }, 3);
    t.ok(o.length === 3 && new Set(o).size === 3 && o.every(id => DATA.RELICS[id].combo && DATA.RELICS[id].combo !== 'all') && !o.includes('cr_casino'), `seed ${s}: three different family relics, never one owned`);
    for (const id of o) seen[id] = 1;
  }
  t.eq(Object.keys(seen).length, DATA.CR.IDS.length - 1, 'every other family turns up');
  // it leans to the deck: a metal deck sees the Weapon Rack more often than a deck with none
  const metal = { relics: [], bin: Array.from({ length: 12 }, (_, i) => ({ id: ['rusty_sword', 'iron_chain', 'longsword'][i % 3] })) };
  let a = 0, b = 0;
  for (let s = 1; s <= 400; s++) { if (DATA.crOffer(U.rng(s), metal, 3).includes('cr_steel')) a++; if (DATA.crOffer(U.rng(s), { relics: [], bin: [] }, 3).includes('cr_steel')) b++; }
  t.ok(a > b, `a metal deck is offered the Weapon Rack more (${a} vs ${b} of 400)`);
});

t.test('round 21: the starting items hit and block for less; their upgrade keeps its old number', () => {
  // [base number before round 21, the plus number] per starter (Pip's shiv and boot stay: see DESIGN.md)
  const OLD = { rusty_sword: [7, 10], dented_shield: [5, 8], bubble_flask: [4, 7], poker_chip: [4, 6], hex_bolt: [4, 6], tin_plate: [5, 7],
    rubber_duck: [4, 6], soap_bar: [5, 7], arcade_stick: [4, 6], arcade_button: [5, 7] };
  for (const id in OLD) {
    const d = ITEMS[id], v = d.fx[0].v, p = d.plus.fx[0].v, cut = 1 - v / OLD[id][0];
    t.ok(d.starter && cut >= 0.19 && cut <= 0.41, `${id}: ${OLD[id][0]} -> ${v} (${Math.round(cut * 100)}% less)`);
    t.eq(p, OLD[id][1], `${id}: the plus keeps ${OLD[id][1]}`);
  }
  const vial = ITEMS.toxic_vial.fx.find(f => f.s === 'poison').v, dice = ITEMS.bone_dice.fx[0];
  t.ok(vial === 1 && (dice.min + dice.max) / 2 < 5 && dice.max < 8, `Toxic Vial 2 -> ${vial} Poison, Bone Dice 2-8 -> ${dice.min}-${dice.max}`);
  t.ok(ITEMS.shiv.fx[0].v === 5 && ITEMS.old_boot.fx[0].v === 4, 'Pip\'s shiv and boot stay');
  // every starter of every crawler: its first number is at most its old one
  for (const ch in DATA.CHARACTERS) for (const id of new Set(DATA.CHARACTERS[ch].bin)) if (OLD[id]) t.ok(ITEMS[id].fx[0].v < OLD[id][0], `${ch}: ${id} is weaker`);
  // the act 1 dial (combat applies it; the balance suite pins the numbers)
  const A = DATA.DIFFICULTY.act1;
  // (round 22) no gentler first fight; act 1's elites read their own sub-dial, a notch under tierDmg's full lift
  t.ok(A && A.hp > 1 && A.dmg > 1 && !A.first && A.elite && A.elite.hp > 0.5 && A.elite.hp <= 1 && A.elite.dmg > 0.5 && A.elite.dmg <= 1, `DIFFICULTY.act1 ${JSON.stringify(A)}`);
  t.eq(DATA.ENEMIES.golem.status.thorns, 1, 'the Brass Golem bites back for 1 (was 2)');
});

t.test('cmp2: plus 2 numbers, names and text', () => {
  let n = 0;
  for (const id in ITEMS) {
    const d = ITEMS[id];
    if (!d.plus || d.rarity === 'junk') continue;
    const f2 = DATA.CMP2.fx(d);
    if (!f2) continue;
    n++;
    const f1 = d.plus.fx;
    t.eq(f2.length, f1.length, `${id}: same effects as its plus`);
    t.ok(f2.some((f, i) => JSON.stringify(f) !== JSON.stringify(f1[i])), `${id}: something grew`);
    for (let i = 0; i < f2.length; i++) {
      const a = f1[i], b = f2[i];
      t.eq(b.k, a.k, `${id}: effect ${i} keeps its kind`);
      for (const k of ['v', 'min', 'max', 'n']) if (typeof a[k] === 'number') t.ok(Number.isFinite(b[k]) && Math.sign(b[k]) * Math.sign(a[k]) >= 0, `${id}: ${k} keeps its sign (${a[k]} -> ${b[k]})`);
      if (b.k === 'random') t.ok(b.min <= b.max && b.v === Math.round((b.min + b.max) / 2), `${id}: a sane roll`);
    }
    t.ok(/\+\+$/.test(DATA.cmp2Name(d, 2)) && DATA.itemText(d, 2) !== DATA.itemText(d, true), `${id}: "${DATA.cmp2Name(d, 2)}" reads its own numbers`);
  }
  const plusN = Object.keys(ITEMS).filter(id => ITEMS[id].plus && ITEMS[id].rarity !== 'junk').length;
  t.ok(n >= plusN - 2, `every upgradable item but a couple has a +2 [${n} of ${plusN}]`);
  const sw = ITEMS.rusty_sword;
  t.ok(DATA.cmp2FxAt(sw, 2)[0].v > DATA.cmp2FxAt(sw, true)[0].v && DATA.cmp2FxAt(sw, true)[0].v > DATA.cmp2FxAt(sw, false)[0].v, 'base < plus < plus 2');
  t.ok(DATA.cmp2Lv({ plus: 2 }) === 2 && DATA.cmp2Lv({ plus: true }) === 1 && DATA.cmp2Lv({}) === 0, 'levels 0, 1, 2');
  const bribe = DATA.CMP2.fx(ITEMS.bribe);
  t.ok(bribe && bribe[0].v >= 0 && bribe[0].v < ITEMS.bribe.plus.fx[0].v, 'a cost keeps falling, never below 0');
});

t.done();
