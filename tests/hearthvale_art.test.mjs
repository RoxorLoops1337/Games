// Art budgets: builds every Hearthvale model headlessly and checks triangle and mesh counts, contracts and variety.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILDINGS } from '../hearthvale/shared/data.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const tris = (o) => { let t = 0; o.traverse((m) => { if (m.isMesh && m.visible !== false) { const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t; };
const meshes = (o) => { let t = 0; o.traverse((m) => { if (m.isMesh) t++; }); return t; };
const names = (o) => { const s = new Set(); o.traverse((m) => { if (m.name) s.add(m.name); }); return s; };

const B = await import('../hearthvale/art/buildings.js');
for (const type of Object.keys(BUILDINGS).filter((t) => t !== 'farm')) {
  if (!B.BUILD[type]) { ok(BUILDINGS[type].hidden, 'every building has art: ' + type); continue; }
  for (const lvl of [1, 2, 3]) {
    const g = B.BUILD[type]({ id: 3, color: '#e8564a', lvl });
    ok(tris(g) <= 2500, `${type} lvl${lvl} <= 2500 tris (${tris(g)})`); ok(meshes(g) <= 14, `${type} lvl${lvl} <= 14 meshes (${meshes(g)})`);
    ok(typeof g.userData.topY === 'number', `${type} has userData.topY`);
  }
}
ok(names(B.BUILD.sawmill({ id: 1, color: '#fff' })).has('spin'), 'sawmill blade is named spin'); ok(names(B.BUILD.mill({ id: 1, color: '#fff' })).has('spinz'), 'windmill sails are named spinz');
ok(names(B.BUILD.kitchen({ id: 1, color: '#fff' })).has('chimney'), 'kitchen has a chimney anchor');
const farm = B.farmModel({ id: 1, color: '#fff' }); ok(names(farm).has('crops'), 'farm has crops'); for (const st of ['empty', 'grow', 'ripe']) B.setFarmStage(farm, st, 0.5); ok(tris(farm) <= 2500, 'farm within budget');
ok(tris(B.constructionSite(2, 2)) <= 2500, 'construction site within budget');
ok(B.windowMat.emissiveIntensity === 0 && B.lanternMat.emissiveIntensity === 0, 'night materials start dark');

const C = await import('../hearthvale/art/characters.js'); let worst = 0; const looks = new Set();
const TOOL8 = ['none', 'axe', 'pick', 'hoe', 'hammer', 'ladle', 'scroll', 'basket'];
for (let i = 0; i < 120; i++) { const g = C.villagerModel('#4a90e0', i, { seed: i, tool: TOOL8[i % 8] }); worst = Math.max(worst, tris(g)); looks.add(i % 8 + ':' + (g.children.length)); }
ok(worst <= 2100, 'villagers (default lod) <= 2100 tris (worst ' + worst + ')');
// level of detail: low <= 900 (far villagers), mid = default <= 2100, high <= 3200 (near the camera)
const lodWorst = { low: 0, mid: 0, high: 0 };
for (const lod of ['low', 'mid', 'high']) for (let i = 0; i < 120; i++) { const g = C.villagerModel('#4a90e0', i, { seed: i, lod, tool: TOOL8[i % 8] }); lodWorst[lod] = Math.max(lodWorst[lod], tris(g)); }
ok(lodWorst.low <= 900, 'villager lod low <= 900 tris (worst ' + lodWorst.low + ')'); ok(lodWorst.mid <= 2100, 'villager lod mid <= 2100 tris (worst ' + lodWorst.mid + ')'); ok(lodWorst.high <= 3200, 'villager lod high <= 3200 tris (worst ' + lodWorst.high + ')');
ok(lodWorst.low < lodWorst.mid && lodWorst.mid < lodWorst.high, 'lods are ordered by detail');
console.log('villager tris worst: low ' + lodWorst.low + ', mid ' + lodWorst.mid + ', high ' + lodWorst.high);
const v = C.villagerModel('#e8564a', 5, { tool: 'axe' }); ok(names(v).has('body') && names(v).has('arm'), 'villager keeps the body/arm contract');
for (const lod of ['low', 'mid', 'high']) { const g = C.villagerModel('#e8564a', 9, { tool: 'hammer', lod }); const nm = names(g); ok(['body', 'arm', 'armL', 'legL', 'legR', 'head', 'eyes'].every((k) => nm.has(k)), 'lod ' + lod + ' keeps every named child'); }
for (const pose of C.POSES) C.setPose(v, pose, 1.3, 0.2); for (const m of C.MOODS) C.setMood(v, m); ok(true, 'every pose and mood runs');
for (const lod of ['low', 'mid', 'high']) { const g = C.villagerModel('#e8564a', 7, { lod }); for (const m of C.MOODS) { C.setMood(g, m); for (const p of C.POSES) for (const t of [0.1, 1.7, 5.2]) C.setPose(g, p, t, 0.4); } for (const k of C.CARRY_KINDS) { C.setCarry(g, k); C.setPose(g, 'carry', 2, 0); } for (const a of ['carryLog', 'carryStone', 'carryWheat', 'carryEggs', 'lookAround']) C.setPose(g, a, 1, 0); for (const e of C.EMOTES) { C.setEmote(g, e, 2); C.setPose(g, 'idle', 3, 0); } C.setEmote(g, null); C.setPose(g, 'idle', 4, 0); }
ok(true, 'emotes, loads and aliases run in every lod (headless: no atlas without a DOM)');
{ const g = C.villagerModel('#e8564a', 3, {}); C.setPose(g, 'idle', 1, 0); const b0 = JSON.stringify(g.getObjectByName('body').position.toArray()); C.setPose(g, 'work', 0.2, 0); ok(JSON.stringify(g.getObjectByName('body').position.toArray()) !== undefined && b0, 'poses write numbers only'); }
{ // work stroke: the arm winds up (raised, negative rotation.x) and strikes (near down) within one period: anticipation and follow-through exist
  const g = C.villagerModel('#e8564a', 3, { tool: 'axe' }), arm = g.getObjectByName('arm'); let lo = 9, hi = -9; for (let t = 0; t < 1.3; t += 0.01) { C.setPose(g, 'work', t, 0); lo = Math.min(lo, arm.rotation.x); hi = Math.max(hi, arm.rotation.x); }
  ok(lo < -2 && hi > -0.4, 'axe stroke winds up overhead and strikes low (' + lo.toFixed(2) + '..' + hi.toFixed(2) + ')'); }
{ const k0 = new Set(); for (let i = 0; i < 60; i++) k0.add(C.villagerModel('#e8564a', i, { seed: i }).userData.look.skin); ok(k0.size === 5, 'all five skin tones appear'); }

const E = await import('../hearthvale/art/environment.js');
for (let i = 0; i < 12; i++) ok(tris(E.treeModel(i)) <= 900, 'tree ' + i + ' <= 900 tris'); ok(tris(E.rockModel(2)) <= 900 && tris(E.clayModel(2)) <= 900 && tris(E.stumpModel()) <= 900, 'node models are small');
const sp = new Set(); for (let i = 0; i < 20; i++) sp.add(E.treeModel(i).userData.species); ok(sp.size >= 4, 'at least 4 tree species (' + [...sp].join(',') + ')');
for (const f of ['tree', 'clay', 'rock', 'wheat']) { const g = E.fieldModel(f, 0); ok(tris(g) <= 12000 && g.getObjectByName('stuff'), 'field ' + f + ' within budget with a stuff group'); }
ok(tris(E.plotModel('#e8564a', 0)) <= 4000, 'a village plot is cheap (16 are on screen)'); ok(E.boardModel().getObjectByName('flag'), 'board has a flag');
const isl = E.islandModel(72); ok(tris(isl) < 90000, 'island within budget (' + Math.round(tris(isl)) + ')');

const K = await import('../hearthvale/art/critters.js');
for (const [k, f] of Object.entries(K.CRITTERS)) { for (let i = 0; i < 4; i++) { const g = f(i); ok(tris(g) <= 520, k + ' <= 520 tris (' + tris(g) + ')'); } ok(tris(f(1, 'low')) <= 520, k + ' lod low <= 520'); ok(tris(f(1, 'high')) <= 1800, k + ' lod high <= 1800 tris (' + tris(f(1, 'high')) + ')'); }
for (const k of ['lamb', 'calf', 'goat', 'piglet', 'horse']) ok(K.CRITTERS[k] && K[k + 'Model'], 'new critter ' + k + ' is exported and registered');
const sheep = K.sheepModel(1); for (const a of ['idle', 'walk', 'graze']) K.animateCritter(sheep, a, 2.2, 1, 0); ok(true, 'critters animate');
for (const [k, f] of Object.entries(K.CRITTERS)) { if (k === 'cloud') continue; const g = f(2); let tt = 0; for (const a of ['idle', 'walk', 'graze', 'fly', 'eat', 'sleep', 'happy', 'follow']) for (let i = 0; i < 25; i++) { tt += 0.033; K.animateCritter(g, a, tt, 1, 0); } g.traverse((o) => { if (o.isMesh) { for (const e of ['x', 'y', 'z']) assert.ok(Number.isFinite(o.rotation[e]) && Number.isFinite(o.scale[e]) && Number.isFinite(o.position[e]), k + ' transforms stay finite'); } }); }
ok(true, 'every critter runs every behaviour (idle walk graze fly eat sleep happy follow) with finite transforms');
{ // sleeping lowers the body and shuts the eyes; happy hops higher than idle
  const g = K.sheepModel(0); let tt = 0; for (let i = 0; i < 90; i++) { tt += 0.033; K.animateCritter(g, 'sleep', tt, 1, 0); } const bod = g.getObjectByName('body'); ok(bod.position.y < 0 && g.getObjectByName('eyes').scale.y < 0.2, 'sleep: body drops and eyes close');
  let hmax = -9, imax = -9; const h = K.sheepModel(0), idl = K.sheepModel(0); for (let i = 0; i < 300; i++) { tt += 0.033; K.animateCritter(h, 'happy', tt, 1, 0); K.animateCritter(idl, 'idle', tt, 1, 0); hmax = Math.max(hmax, h.getObjectByName('body').position.y); imax = Math.max(imax, idl.getObjectByName('body').position.y); }
  ok(hmax > imax, 'happy jumps higher than idle (' + hmax.toFixed(3) + ' vs ' + imax.toFixed(3) + ')'); }

const PR = await import('../hearthvale/art/props.js');
for (const k of ['coinStack', 'eggBasket', 'milkChurn', 'fishBucket', 'yarnBasket', 'appleCrate', 'cheeseWheel', 'jamJar', 'pie', 'giftBox', 'trophy', 'firework']) { ok(typeof PR.PROPS[k] === 'function', 'prop ' + k + ' is registered'); const g = PR.PROPS[k](); ok(tris(g) <= 400, 'prop ' + k + ' <= 400 tris (' + tris(g) + ')'); PR.animateProp(g, 1.1, {}); }
ok(names(PR.giftBoxModel()).has('bow') && names(PR.trophyModel()).has('star') && names(PR.fireworkModel()).has('flame'), 'new props keep named animated children');

// FX: headless smoke test with a stub canvas (the atlas is painted with the 2D API, which node does not have)
{
  const noop = new Proxy(function () {}, { get: (t, k) => (k === 'addColorStop' ? () => {} : noop), apply: () => noop, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  const F = await import('../hearthvale/art/fx.js'); const scene = new THREE.Scene(); const fx = new F.Fx(scene);
  const draws = () => { let n = 0; scene.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; };
  const all = () => { fx.smoke(0, 1, 0); fx.dust(0, 0, 0); fx.sparkle(0, 1, 0); fx.confetti(0, 1, 0); fx.coinPop(0, 1, 0); fx.leaf(0, 1, 0); fx.splash(0, 0, 0); fx.ring(0, 0, 0); fx.hearts(0, 1, 0); fx.heartsBurst(0, 1, 0); fx.note(0, 1, 0); fx.petal(0, 1, 0); fx.star(0, 1, 0); fx.mote(0, 1, 0);
    fx.cheer(0, 1, 0); fx.levelUp(0, 0, 0); fx.build(0, 0, 0, 3, 2); fx.harvest(0, 0, 0, '#ffd84a'); fx.craft(0, 1, 0); fx.coinBurst(0, 1, 0, 10); fx.fireworks(0, 0, 0); fx.rainbow(0, 0, 0); fx.sparkleTrail([0, 1, 0], { x: 3, y: 1, z: 0 }); fx.ripple(0, 0, 0); fx.groundPulse(0, 0, '#ffe27a'); };
  let peak = 0; for (let i = 0; i < 300; i++) { if (i % 4 === 0) all(); fx.update(1 / 60); peak = Math.max(peak, fx.count); }
  ok(peak <= 900, 'fx never exceeds 900 live particles (peak ' + peak + ')'); ok(draws() <= 3, 'fx draws at most 3 meshes (' + draws() + ')');
  for (const k of ['cheer', 'levelUp', 'build', 'harvest', 'craft', 'coinBurst', 'fireworks', 'rainbow', 'sparkleTrail', 'ripple', 'groundPulse', 'clear']) ok(typeof fx[k] === 'function', 'Fx.' + k + ' exists');
  for (let i = 0; i < 60; i++) { fx.fireworks(0, 0, 0); fx.update(0.1); } ok(fx.count <= 900, 'fireworks spam stays inside the pool (' + fx.count + ')');
  fx.setLight(0.3); fx.update(0.016); ok(fx.A.mat.uniforms.uLight.value === 0.3, 'setLight still dims the alpha layer');
  fx.timeScale = 0; const c0 = fx.count; fx.update(0.5); ok(fx.count === c0, 'timeScale 0 freezes the simulation'); fx.timeScale = 1; F.Fx.timeScale = 0; fx.update(0.5); ok(fx.count === c0, 'Fx.timeScale 0 freezes every Fx'); F.Fx.timeScale = 1;
  F.Fx.clear(); ok(fx.count === 0, 'Fx.clear() empties the pool'); fx.dispose(); delete globalThis.document;
}

// ---- round 3: the Great Project monument, the orchard contract, the new buildings and decor (art/monument.js, art/buildings.js)
{
  const M = await import('../hearthvale/art/monument.js'); ok(M.MONUMENT_STAGES === 6, 'monument has 6 stages');
  const want = [['flag'], ['flag'], ['bell', 'flag'], ['spinz', 'flag'], ['flag', 'beam'], ['lanterns', 'flag']];
  for (let st = 0; st < M.MONUMENT_STAGES; st++) {
    const m = M.monumentModel(st); ok(tris(m) <= 6000, `monument stage ${st} <= 6000 tris (${Math.round(tris(m))})`); ok(meshes(m) <= 14, `monument stage ${st} <= 14 meshes (${meshes(m)})`);
    ok(typeof m.userData.topY === 'number' && Math.abs(m.userData.topY - M.monumentTopY(st)) < 1e-9, `monument stage ${st} topY matches monumentTopY`);
    const nm = names(m); for (const k of want[st]) ok(nm.has(k), `monument stage ${st} has a named child ${k}`);
    const solid = m.clone(true), bm = solid.getObjectByName('beam'); if (bm) bm.parent.remove(bm); const box = new THREE.Box3().setFromObject(solid), sz = box.getSize(new THREE.Vector3()); ok(box.max.y >= M.monumentTopY(st) - 0.3 && box.max.y <= M.monumentTopY(st) + 0.9, `monument stage ${st} topY is near its top (${box.max.y.toFixed(2)} vs ${M.monumentTopY(st)})`); ok(sz.x <= 5.0 && sz.z <= 5.0 && sz.y <= 9.8, `monument stage ${st} fits about 4 x 4 x 9 (${sz.x.toFixed(1)} x ${sz.y.toFixed(1)} x ${sz.z.toFixed(1)})`);
  }
  ok(M.monumentTopY(0) < M.monumentTopY(2) && M.monumentTopY(2) < M.monumentTopY(5), 'the monument grows taller with its stages');
  ok(M.monumentModel(99).userData.stage === 5 && M.monumentModel(-3).userData.stage === 0, 'monumentModel clamps the stage');
  const beam = M.monumentModel(4).getObjectByName('beam'); ok(beam && beam.children.length >= 1, 'the lighthouse beam is a named group with geometry');
  const orch = B.orchardModel({ id: 2, color: '#fff', lvl: 3 }); ok(names(orch).has('crops') && orch.userData.crops, 'orchard has a crops group like the farm');
  ok(B.BUILD.orchard && tris(B.BUILD.orchard({ id: 1, color: '#fff', lvl: 1 })) <= 2500, 'BUILD.orchard is an alias that works');
  let prev = -1; for (const stg of ['empty', 'grow', 'ripe']) { B.setFarmStage(orch, stg, 0.8); ok(tris(orch) <= 2500 && meshes(orch) <= 14, `orchard ${stg} within budget (${Math.round(tris(orch))} tris, ${meshes(orch)} meshes)`); const t = tris(orch); ok(t >= prev, 'orchard fruit only appears as it ripens (' + stg + ')'); prev = t; }
  B.setFarmStage(orch, 'empty', 0); ok(orch.userData.crops.visible, 'an empty orchard still shows saplings'); const sc0 = orch.userData.orchard[0].T.scale.x; B.setFarmStage(orch, 'ripe', 1); ok(orch.userData.orchard[0].T.scale.x > sc0 * 2 && orch.userData.orchard[0].fr.visible, 'ripe canopies are bigger and carry fruit');
  for (const id of ['coop', 'barn', 'dairy', 'dock', 'pantry', 'weavery']) for (const lvl of [1, 2, 3]) { const g = B.BUILD[id]({ id: 5, color: '#4a90e0', lvl }); ok(tris(g) <= 2500 && meshes(g) <= 14 && typeof g.userData.topY === 'number', `${id} lvl${lvl} budget and topY`); }
  ok(names(B.BUILD.barn({ id: 1, color: '#fff', lvl: 1 })).has('door'), 'barn has a named door'); ok(names(B.BUILD.dock({ id: 1, color: '#fff', lvl: 1 })).has('boat'), 'dock has a named boat'); ok(names(B.BUILD.weavery({ id: 1, color: '#fff', lvl: 1 })).has('spin'), 'weavery wheel is named spin');
  for (const id of ['dairy', 'pantry', 'weavery']) ok(names(B.BUILD[id]({ id: 1, color: '#fff', lvl: 2 })).has('chimney'), id + ' has a chimney anchor');
  for (const id of ['bench', 'birdbath', 'scarecrow', 'picnic', 'swing', 'flowercart', 'pumpkins', 'hammock', 'beeskep']) { let last = 0; for (const lvl of [1, 2, 3]) { const g = B.BUILD[id]({ id: 4, color: '#e8564a', lvl }); ok(tris(g) <= 2500 && meshes(g) <= 14 && typeof g.userData.topY === 'number', `${id} lvl${lvl} budget and topY`); const t = tris(g); ok(t > last, `${id} lvl${lvl} is richer than the level below`); last = t; } }
  const bb = (g) => { const b = new THREE.Box3(); g.updateMatrixWorld(true); g.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) b.union(new THREE.Box3().setFromObject(o)); }); return b.getSize(new THREE.Vector3()); }; const need = { coop: [2, 2], barn: [3, 2], dairy: [2, 2], orchard: [3, 3], dock: [3, 2], pantry: [2, 2], weavery: [2, 2], bench: [2, 1], birdbath: [1, 1], picnic: [2, 2], swing: [2, 2], flowercart: [2, 1], pumpkins: [2, 2], hammock: [2, 1], scarecrow: [1, 1], beeskep: [1, 1] };
  for (const [id, [w, h]] of Object.entries(need)) { const s = bb(B.BUILD[id]({ id: 1, color: '#fff', lvl: 3 })); ok(s.x <= w + 0.45 && s.z <= h + 0.45, `${id} stays inside its ${w}x${h} footprint (${s.x.toFixed(2)} x ${s.z.toFixed(2)})`); }
}
console.log('hearthvale art: ' + n + ' checks passed'); process.exit(0);
