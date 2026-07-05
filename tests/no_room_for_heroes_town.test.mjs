// Town Builder map: plot coverage, hit-testing, popup content, build flow.
//
//   node tests/no_room_for_heroes_town.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,openTownBuilder,renderTownBuilder,drawTownMap,townPlotAt,
  showTownPop,hideTownPop,buildTown,townLvl,buildingCost,canAfford,townClampCam,
  corruptHero,corruptCost,minionCardFromSpec,CHAMPIONS,
  forgeCard,forgePrice,FORGE_GOLD,cardRarity,handCap,gotoTown,chooseBoss,BOSSES,get overlay(){return overlay;},
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

// ---- corruption rework: cost scales with power, champions are a premium,
//      a corrupted champion is nerfed, and the ATTEMPT is a 60% gamble ----
A.G = A.freshGame('campaign');
const CK = Object.keys(A.CHAMPIONS)[0];
const mk = over => ({cls:'warrior', power:40, traits:[], rival:false, name:'X', debuff:{atkMul:1,burn:0,robbed:false}, ...over});
const mook = mk({power:4}), bruiser = mk({}), champ = mk({champion:CK});
t.ok(A.corruptCost(bruiser) > A.corruptCost(mook), 'corruption cost scales with hero power');
t.ok(A.corruptCost(champ) > A.corruptCost(bruiser) * 2, 'a champion (super-hero) costs a hefty premium');

const cm = A.minionCardFromSpec(champ), nm = A.minionCardFromSpec(bruiser);
t.ok(cm.minHp < nm.minHp && cm.minAtk < nm.minAtk, 'a corrupted champion comes back weaker than a corrupted normal hero');

// the 60% gamble — deterministic via a stubbed RNG
A.TOWN.built.inn = 2;                                    // unlock corruption
const _rand = Math.random;
const setup = () => { A.G.queue = [mk({champion:CK})]; A.G.hand = []; A.G.dread = 1e6; A.G.corruptedThisTown = 0; };
let cThrew = '';
try {
  setup(); Math.random = () => 0.1;  A.corruptHero(0);   // < 0.6 → success
  t.ok(A.G.queue.length === 0 && A.G.hand.length === 1, 'a successful corruption turns the hero into a minion card');
  setup(); Math.random = () => 0.9;  A.corruptHero(0);   // ≥ 0.6 → failure
  t.ok(A.G.queue.length === 1 && A.G.hand.length === 0 && A.G.corruptedThisTown === 1,
    'a failed corruption spends the attempt but leaves the hero to march on');
} catch (e) { cThrew = e.message; }
finally { Math.random = _rand; }
t.ok(cThrew === '', 'corruptHero runs clean' + (cThrew ? ' — ' + cThrew : ''));

// ---- ⚒️ Town Forge: copy ONE hand card per visit, gold, rarity-priced ----
A.G = A.freshGame('campaign');
A.G.forgeUsed = false;
A.G.hand = [{type:'spike', lvl:1}];
A.G.gold = 1000;
const fPrice = A.forgePrice('spike');
t.ok(fPrice === A.FORGE_GOLD[A.cardRarity('spike')], 'forge price follows the rarity table');
t.ok(A.FORGE_GOLD.common === 40 && A.FORGE_GOLD.special === 70 && A.FORGE_GOLD.rare === 120 && A.FORGE_GOLD.epic === 200,
  'rarity prices: 40/70/120/200');
A.forgeCard(0);
t.ok(A.G.hand.length === 2 && A.G.hand[1].type === 'spike', 'the forge duplicates the card into the hand');
t.ok(A.G.gold === 1000 - fPrice, 'the copy costs its rarity price');
t.ok(A.G.forgeUsed === true, 'the forge is spent for the visit');
A.forgeCard(0);
t.ok(A.G.hand.length === 2 && A.G.gold === 1000 - fPrice, 'a second copy the same visit is refused');
// a full hand refuses the copy (and does not burn the visit)
A.G.forgeUsed = false;
while (A.G.hand.length < A.handCap()) A.G.hand.push({type:'spike', lvl:1});
A.forgeCard(0);
t.ok(A.G.hand.length === A.handCap() && A.G.forgeUsed === false, 'a FULL hand refuses the forge without spending it');
// gotoTown re-arms the forge and renders the stall
A.G = A.freshGame('campaign'); A.chooseBoss(Object.keys(A.BOSSES)[0]);
A.G.forgeUsed = true; A.G.hand = [{type:'spike', lvl:1}];
A.gotoTown();
t.ok(A.G.forgeUsed === false, 'a new town visit re-arms the forge');
t.ok((A.overlay.innerHTML || '').includes('forgeCard(0)'), 'the town screen offers the hand card at the Forge stall');

t.done();
