// Trap synergy art pack: 67 new synergy_<theme>_<trapA>_<trapB>.png overlays take
// SYNERGIES from 35 to 102 curated pairs (every damage trap sits in exactly 12).
// Checks the art on disk (all 523x545 RGBA, the venomfent typo fixed, the three
// off-size uploads normalised), the new SYNERGIES entries (canonical keys, theme
// from the filename, the CC traps now pairing), and that build + run phase
// update()/draw() with the new synergy rooms stay clean, including the
// graceful fallback when an overlay has not loaded.
//
//   node tests/no_room_for_heroes_art_synergy.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const SYN_DIR = join(here, '..', 'no_room_for_heroes', 'rooms', 'synergies');

const A = loadGame(`freshGame,chooseBoss,buildCells,prepCampaignWave,startWave,update,draw,render,
  makeRoom,makeUnit,applyRunes,roomSynergy,synergyFromTypes,synergyHint,roomSynArt,synImg,SYN_IMG,
  SYNERGIES,SYNERGY_TYPES,ROOMS,BOSSES,
  get G(){return G;},set G(v){G=v;},get RB(){return RB;}`);
const t = harness('art: trap synergies');
const BOSS = Object.keys(A.BOSSES)[0];

// long trap names used in the filenames -> ROOMS ids
const LONG = { flamejet:'flame', frosttrap:'frost', teslacoil:'tesla', spikepit:'spike', venomvent:'venom',
  oilslick:'oil', dartwall:'arrow', armorcrusher:'maul', acidsprayer:'corrode', hexward:'hexward',
  hexbrand:'hexbrand', magebane:'magebane', bombard:'bombard', gallows:'gallows', websnare:'web',
  wailinghorn:'horn', confusioncenser:'censer' };

// the 67 pairs this art pack adds (the original 35 are covered by the fusion suite)
const NEW_KEYS = `arrow+corrode arrow+gallows arrow+hexbrand arrow+hexward arrow+oil arrow+tesla arrow+web
  bombard+censer bombard+corrode bombard+hexbrand bombard+hexward bombard+horn bombard+magebane bombard+venom
  censer+corrode censer+flame censer+frost censer+gallows censer+hexbrand censer+magebane censer+maul censer+oil
  censer+spike censer+tesla censer+venom corrode+horn corrode+magebane corrode+spike corrode+web
  flame+gallows flame+hexbrand flame+horn flame+tesla flame+venom flame+web
  frost+gallows frost+horn frost+magebane frost+maul frost+oil frost+web gallows+horn gallows+maul gallows+web
  hexbrand+hexward hexbrand+oil hexbrand+spike hexward+horn hexward+oil hexward+venom hexward+web
  horn+magebane horn+maul horn+oil horn+spike horn+tesla horn+web magebane+maul magebane+web
  maul+spike maul+venom oil+web spike+tesla spike+web tesla+venom tesla+web venom+web`.trim().split(/\s+/);

// PNG IHDR: width @16, height @20 (big-endian), colour type @25 (6 = RGBA)
function pngInfo(file){
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25] };
}

// ---------------- art on disk ----------------
t.ok(NEW_KEYS.length === 67 && new Set(NEW_KEYS).size === 67, `67 distinct new pairs listed (${NEW_KEYS.length})`);
let badArt = '';
for(const k in A.SYNERGIES){
  const f = join(SYN_DIR, A.SYNERGIES[k].img + '.png');
  if(!existsSync(f)){ badArt = k+' art missing'; break; }
  const p = pngInfo(f);
  if(p.w !== 523 || p.h !== 545 || p.ct !== 6){ badArt = `${k} is ${p.w}x${p.h} ct${p.ct}`; break; }
}
t.ok(!badArt, 'every synergy overlay is on disk as a 523x545 RGBA PNG (registers 1:1 with empty.png)' + (badArt ? ': '+badArt : ''));
const onDisk = readdirSync(SYN_DIR).filter(f => f.endsWith('.png'));
t.ok(onDisk.length === 102, `102 overlays shipped in rooms/synergies (${onDisk.length})`);
t.ok(!onDisk.some(f => f.includes('venomfent')), 'the venomfent upload typo was fixed on copy (no venomfent file)');
t.ok(existsSync(join(SYN_DIR, 'synergy_fire_flamejet_venomvent.png')), 'flame+venom art ships as synergy_fire_flamejet_venomvent.png');
for(const n of ['synergy_fire_flamejet_confusioncenser', 'synergy_physical_bombard_wailinghorn', 'synergy_frost_frosttrap_armorcrusher']){
  const p = pngInfo(join(SYN_DIR, n + '.png'));
  t.ok(p.w === 523 && p.h === 545, `${n} normalised to 523x545 (${p.w}x${p.h})`);
}
const used = new Set(Object.values(A.SYNERGIES).map(s => s.img + '.png'));
t.ok(onDisk.every(f => used.has(f)), 'no orphan overlay: every file in rooms/synergies is wired to a pair');

// ---------------- config entries ----------------
const keys = Object.keys(A.SYNERGIES);
t.ok(keys.length === 102, `SYNERGIES holds 102 pairs (${keys.length})`);
t.ok(NEW_KEYS.every(k => A.SYNERGIES[k]), 'all 67 new pairs are defined' + (NEW_KEYS.filter(k => !A.SYNERGIES[k]).join(',') ? ': missing '+NEW_KEYS.filter(k => !A.SYNERGIES[k]).join(',') : ''));
let badCfg = '';
for(const k of keys){
  const s = A.SYNERGIES[k], parts = s.img.split('_');
  if(parts.length !== 4 || parts[0] !== 'synergy'){ badCfg = k+' img name shape'; break; }
  if(parts[1] !== s.type){ badCfg = k+' type does not match the filename theme'; break; }
  if(!A.SYNERGY_TYPES[s.type]){ badCfg = k+' unknown type'; break; }
  const ids = [LONG[parts[2]], LONG[parts[3]]];
  if(ids.some(x => !x) || ids.slice().sort().join('+') !== k){ badCfg = k+' key does not match '+s.img; break; }
}
t.ok(!badCfg, 'every pair: key = sorted trap ids from the filename, type = the filename theme' + (badCfg ? ': '+badCfg : ''));

const dmgTraps = Object.keys(A.ROOMS).filter(id => A.ROOMS[id].kind === 'trap' && !A.ROOMS[id].amp);
const per = {}; for(const id of dmgTraps) per[id] = keys.filter(k => k.split('+').includes(id)).length;
t.ok(dmgTraps.length === 17 && dmgTraps.every(id => per[id] === 12), 'every one of the 17 damage traps sits in exactly 12 pairs ' + JSON.stringify(per));
t.ok(!keys.some(k => k.split('+').includes('runestone')), 'Runestone (amp-only) is never paired');

// spot checks straight from the spec
const S = A.SYNERGIES;
t.ok(S['flame+venom']?.type === 'fire' && S['flame+venom'].img === 'synergy_fire_flamejet_venomvent', 'flame+venom -> fire (venomvent art)');
t.ok(S['censer+flame']?.img === 'synergy_fire_flamejet_confusioncenser', 'censer+flame -> fire');
t.ok(S['hexward+oil']?.type === 'lightning', 'hexward+oil keeps its lightning filename theme');
t.ok(S['horn+web']?.type === 'physical' && S['horn+web'].img === 'synergy_physical_wailinghorn_websnare', 'horn+web -> physical');
t.ok(S['arrow+gallows']?.type === 'physical', 'arrow+gallows keeps its physical filename theme');
t.ok(S['bombard+hexward']?.type === 'fire', 'bombard+hexward keeps its fire filename theme');
t.ok(S['frost+maul']?.img === 'synergy_frost_frosttrap_armorcrusher', 'frost+maul -> frost');

// the 34 uncurated pairs stay neutral
for(const pr of [['flame','spike'],['frost','tesla'],['flame','frost'],['oil','venom'],['censer','horn'],['censer','web']])
  t.ok(A.synergyFromTypes(pr) === null, pr.join('+')+' is still not a synergy');

// ---------------- detection with the CC traps ----------------
const u = (type) => ({type, kind:'trap', lvl:1});
t.ok(A.roomSynergy({units:[u('web'), u('horn')]})?.type === 'physical', 'Web Snare + Wailing Horn -> Brutal');
t.ok(A.roomSynergy({units:[u('horn'), u('web')]})?.type === 'physical', 'pair lookup ignores unit order');
t.ok(A.roomSynergy({units:[u('censer'), u('flame'), u('runestone')]})?.type === 'fire', 'Censer + Flame Jet -> Inferno, a Runestone does not break it');
t.ok(A.roomSynergy({units:[u('web'), u('web')]}) === null, 'the same CC trap twice is not a synergy');

A.G = A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.slots = 2; A.G.phase = 'build';
A.G.rooms = [{ type:'web', cap:2, kills:0, units:[{type:'web',kind:'trap',lvl:1}] }, null];
const hint = A.synergyHint('horn');
t.ok(hint && hint.room === 0 && hint.syn.type === 'physical', 'a Horn card now badges "forms Brutal" next to a Web room');
t.ok(A.synergyHint('censer') === null, 'censer+web is uncurated, so no badge');

A.G = A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.slots = 1;
A.G.rooms = [{ type:'web', cap:2, kills:0, units:[{type:'web',kind:'trap',lvl:1},{type:'horn',kind:'trap',lvl:1}] }];
A.buildCells();
const c0 = A.G.cells[0];
t.ok(c0.synType === 'physical' && Math.abs(c0.syn - (1 + A.SYNERGY_TYPES.physical.amp + (A.RB.synergy||0))) < 1e-9,
  `buildCells caches the new pair's type + amp (synType=${c0.synType}, syn=${c0.syn})`);

// ---------------- draw / update with the new overlays ----------------
function room(type, part2){
  const r = A.makeRoom(type, 2);
  if(part2){ r.cap = 2; r.units.push(A.makeUnit(part2, 2)); }
  return r;
}
// one new pair per synergy type, including the three normalised files and the typo fix
const PAIRS = [['flame','venom'], ['censer','flame'], ['frost','maul'], ['bombard','horn'],
  ['hexward','oil'], ['horn','web'], ['censer','spike'], ['arrow','hexbrand'], ['corrode','web']];
function synRooms(){ return PAIRS.map(([a,b]) => room(a, b)); }

let threw = null;
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.rooms = synRooms(); A.G.slots = A.G.rooms.length;
  A.G.hand = [{type:'horn',lvl:1},{type:'censer',lvl:1}];
  A.G.phase = 'build'; A.buildCells(); A.prepCampaignWave();
  for(let i=0;i<4;i++){ A.render(); A.update(0.05); A.draw(); }
  let lazy = '';
  A.G.rooms.forEach((r, i) => {
    const s = A.roomSynergy(r), im = s && A.SYN_IMG[s.img];            // read the cache BEFORE roomSynArt (it would load on demand)
    if(!s) lazy = lazy || ('room '+i+' formed no synergy');
    else if(!im || !im._ok || im.src !== 'rooms/synergies/'+s.img+'.png') lazy = lazy || ('room '+i+' overlay not loaded by draw ('+s.img+')');
    else if(A.roomSynArt(r) !== im) lazy = lazy || ('room '+i+' roomSynArt does not return the cached overlay');
  });
  t.ok(!lazy, 'every new pair lazy-loads its overlay from rooms/synergies/ when drawn' + (lazy ? ': '+lazy : ''));
  t.ok(!A.SYN_IMG['synergy_physical_bombard_armorcrusher'], 'overlays for pairs not on the board are never requested');
  A.G.brokenCells = {0:true, 3:true}; A.draw();                  // synergy art layers over smashed rooms too
  t.ok(true, 'build-phase render + draw clean with every new synergy room');

  // graceful fallback: an overlay that failed to load draws the plain stone room
  const miss = A.SYNERGIES['horn+web'].img;
  A.SYN_IMG[miss]._ok = false;
  t.ok(A.roomSynArt(A.G.rooms[5]) === null, 'an unloaded overlay returns null (room falls back to stone art)');
  t.ok(A.roomSynergy(A.G.rooms[5])?.type === 'physical', 'the synergy still applies without its art');
  A.draw();
  t.ok(true, 'draw clean with a missing overlay');
  A.SYN_IMG[miss]._ok = true;

  // run phase: heroes walk every new synergy room, riders fire, the loop never throws
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.rooms = synRooms(); A.G.slots = A.G.rooms.length;
  if(typeof A.applyRunes === 'function') A.applyRunes();
  A.prepCampaignWave(); A.startWave();
  t.ok(A.G.phase === 'run', 'wave started through the synergy rooms');
  const types = new Set(A.G.cells.map(c => c.synType).filter(Boolean));
  t.ok(['fire','frost','physical','lightning','execution','arcane','poison'].every(x => types.has(x)), 'all 7 synergy types are live on the board: '+[...types].join(','));
  let frames = 0;
  for(; frames<1200; frames++){ A.update(0.05); A.draw(); if(A.G.phase !== 'run') break; }
  t.ok(frames > 0, 'ran '+frames+' run-phase update/draw frames');
}catch(e){ threw = e; }
t.ok(!threw, 'synergy art update/draw loop never threw'
  + (threw ? (': '+threw.message+'\n'+String(threw.stack||'').split('\n').slice(0,4).join('\n')) : ''));

t.done();
