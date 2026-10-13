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
for (let i = 0; i < 120; i++) { const g = C.villagerModel('#4a90e0', i, { seed: i, tool: ['none', 'axe', 'pick', 'hoe', 'hammer', 'ladle', 'scroll', 'basket'][i % 8] }); worst = Math.max(worst, tris(g)); looks.add(i % 8 + ':' + (g.children.length)); }
ok(worst <= 2100, 'villagers <= 2100 tris (worst ' + worst + ')');
const v = C.villagerModel('#e8564a', 5, { tool: 'axe' }); ok(names(v).has('body') && names(v).has('arm'), 'villager keeps the body/arm contract');
for (const pose of ['idle', 'walk', 'work', 'carry', 'cheer', 'sleep']) C.setPose(v, pose, 1.3, 0.2); for (const m of ['happy', 'tired', 'hungry', 'busy']) C.setMood(v, m); ok(true, 'every pose and mood runs');

const E = await import('../hearthvale/art/environment.js');
for (let i = 0; i < 12; i++) ok(tris(E.treeModel(i)) <= 900, 'tree ' + i + ' <= 900 tris'); ok(tris(E.rockModel(2)) <= 900 && tris(E.clayModel(2)) <= 900 && tris(E.stumpModel()) <= 900, 'node models are small');
const sp = new Set(); for (let i = 0; i < 20; i++) sp.add(E.treeModel(i).userData.species); ok(sp.size >= 4, 'at least 4 tree species (' + [...sp].join(',') + ')');
for (const f of ['tree', 'clay', 'rock', 'wheat']) { const g = E.fieldModel(f, 0); ok(tris(g) <= 12000 && g.getObjectByName('stuff'), 'field ' + f + ' within budget with a stuff group'); }
ok(tris(E.plotModel('#e8564a', 0)) <= 4000, 'a village plot is cheap (16 are on screen)'); ok(E.boardModel().getObjectByName('flag'), 'board has a flag');
const isl = E.islandModel(72); ok(tris(isl) < 90000, 'island within budget (' + Math.round(tris(isl)) + ')');

const K = await import('../hearthvale/art/critters.js');
for (const [k, f] of Object.entries(K.CRITTERS)) { for (let i = 0; i < 4; i++) { const g = f(i); ok(tris(g) <= 520, k + ' <= 520 tris (' + tris(g) + ')'); } }
const sheep = K.sheepModel(1); for (const a of ['idle', 'walk', 'graze']) K.animateCritter(sheep, a, 2.2, 1, 0); ok(true, 'critters animate');
console.log('hearthvale art: ' + n + ' checks passed'); process.exit(0);
