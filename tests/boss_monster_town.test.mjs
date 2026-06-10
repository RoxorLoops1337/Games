// Town Builder map: plot coverage, hit-testing, popup content, build flow.
//
//   node tests/boss_monster_town.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './boss_monster_lib.mjs';

const A = loadGame(`freshGame,openTownBuilder,renderTownBuilder,drawTownMap,townPlotAt,
  showTownPop,hideTownPop,buildTown,townLvl,buildingCost,canAfford,townClampCam,
  get townZoom(){return townZoom;},set townZoom(v){townZoom=v;},
  get townCamX(){return townCamX;},set townCamX(v){townCamX=v;},
  get _tVisW(){return _tVisW;},
  BUILDINGS,TOWN_PLOTS,get TOWN(){return TOWN;},get G(){return G;},set G(v){G=v;}`);
const t = harness('town map');

// every building has a home on the map, and no plot points at a ghost id
const bk = Object.keys(A.BUILDINGS), pk = Object.keys(A.TOWN_PLOTS);
t.ok(bk.every(id => pk.includes(id)), 'every building has a plot');
t.ok(pk.every(id => bk.includes(id)), 'every plot is a real building');

// plots are far enough apart that taps are unambiguous (hit radius is 58)
let minD = 1e9;
for (let i = 0; i < pk.length; i++) for (let j = i + 1; j < pk.length; j++) {
  const a = A.TOWN_PLOTS[pk[i]], b = A.TOWN_PLOTS[pk[j]];
  minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y));
}
t.ok(minD > 100, `closest plots ${Math.round(minD)}px apart (> 100)`);

// hit-testing: a tap on the guild's building body finds it; open meadow finds nothing
const g = A.TOWN_PLOTS.guild;
t.ok(A.townPlotAt(g.x, g.y - 22) === 'guild', 'tap on guild hits guild');
t.ok(A.townPlotAt(40, 60) === null, 'tap on empty meadow hits nothing');

// screens render without throwing
A.G = A.freshGame('campaign');
let threw = '';
try { A.openTownBuilder(); A.showTownPop('guild'); A.hideTownPop(); } catch (e) { threw = e.message; }
t.ok(threw === '', 'map + popup render clean' + (threw ? ' — ' + threw : ''));

// pan/zoom clamps: zoom is capped at 3 and the camera can't leave the world
// (the visible width depends on the cover-scaled viewport, so read it back)
A.townZoom = 99; A.townCamX = 1e5; A.townClampCam();
t.ok(A.townZoom === 3, 'zoom clamps to 3x');
t.ok(Math.abs(A.townCamX - (960 - A._tVisW / 3)) < 1e-6, 'camera clamps to the world edge');
A.townZoom = 0.2; A.townClampCam();
t.ok(A.townZoom === 1 && Math.abs(A.townCamX - (960 - A._tVisW)) < 1e-6, 'zoom-out clamps to 1x at the edge');

// build flow: rig the treasury, build the watchtower, verify level + deduction
A.TOWN.res.wood = 500; A.TOWN.res.stone = 500; A.TOWN.res.shards = 100;
const w0 = A.TOWN.res.wood, s0 = A.TOWN.res.stone;
const cost = A.buildingCost('watch', 1);
t.ok(A.canAfford(cost), 'can afford the watchtower');
A.buildTown('watch');
t.ok(A.townLvl('watch') === 1, 'watchtower built to Lv 1');
t.ok(A.TOWN.res.wood === w0 - (cost.wood || 0) && A.TOWN.res.stone === s0 - (cost.stone || 0), 'resources deducted');
A.buildTown('watch');   // max:1 — must refuse
t.ok(A.townLvl('watch') === 1, 'fully-built building refuses another level');

t.done();
