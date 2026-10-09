// Encore Island 3D view: headless suite. WebGL is not available under Node, so this checks (1) structure and parsing, (2) the shared kit and the actor baker,
// (3) every 3D module's init + update against LIVE game state with a stubbed V (budgets counted from the scene graph), (4) all creatures and heroes build,
// bake and animate, (5) the 2D/3D switch in view.js and the 3D branch of the main draw loop. Pixels are covered by tools/3d_shot.mjs screenshots.
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
register('./three_loader.mjs', import.meta.url);
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';

const t = harness('encore_island_view3d');
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'encore_island'), v3 = join(root, 'view3d');
const EI = loadEI({ bridge: true });
const THREE = await import('three');
const imp = (f) => import('../encore_island/view3d/' + f);

// ---- 1. structure ----
const html = readFileSync(join(root, 'index.html'), 'utf8');
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
t.ok(existsSync(join(root, map.three)) && existsSync(join(root, map['three/addons/'], 'utils/BufferGeometryUtils.js')), 'index.html importmap resolves to the vendored three.js');
t.ok(/id="game3d"/.test(html) && html.indexOf('id="game3d"') < html.indexOf('id="game"'), 'a WebGL canvas sits under the 2D HUD canvas');
t.ok(/js\/view\.js/.test(html), 'view.js is in the script chain');
const MODS = ['kit', 'bake', 'post', 'quality', 'overlay', 'plate3d', 'engine', 'fx3d', 'env3d', 'loot3d', 'heroes3d', 'foes3d', 'foes_a', 'foes_b', 'foes_c', 'hub3d', 'lands3d', 'backstage3d'];
for (const m of MODS) {
  const p = join(v3, m + '.js'); t.ok(existsSync(p), m + '.js exists'); if (!existsSync(p)) continue;
  try { execFileSync(process.execPath, ['--check', '--input-type=module', '-'], { input: readFileSync(p, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] }); t.ok(true, m + '.js parses'); } catch (e) { t.ok(false, m + '.js parses: ' + String(e.stderr).split('\n')[0]); }
}
const allSrc = MODS.map((m) => (existsSync(join(v3, m + '.js')) ? readFileSync(join(v3, m + '.js'), 'utf8') : '')).join('\n');
t.ok(!/https?:\/\/(?!www\.w3\.org)/.test(allSrc), 'no network dependencies in the 3D modules');
t.ok(!allSrc.includes('—'), 'no em dashes in the 3D modules');

// ---- 2. kit + baker ----
const kit = await imp('kit.js'), bake = await imp('bake.js');
{ const b = new kit.Builder(); b.rbox(0xff7eb6, 0, 0.5, 0, 1, 1, 1, 0.2); b.ball(0xffd84d, 0, 1.4, 0, 0.3); b.cyl(0x7a5cd8, 1, 0, 0, 0.3, 0.6); b.lathe(0x46c8c0, [[0.01, 0], [0.5, 0], [0.3, 1], [0.01, 1.2]], -1, 0, 0); const g = b.build();
  let nan = 0, tris = 0, meshes = 0; g.traverse((o) => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position; tris += p.count / 3; for (let i = 0; i < p.array.length; i++) if (!isFinite(p.array[i])) nan++; } });
  t.ok(meshes === 1 && nan === 0 && tris > 200, 'Builder merges coloured parts into one mesh without NaNs (' + tris + ' triangles)'); }
{ const g = kit.roundedBoxGeo(1, 2, 3, 0.2, 3); let ok = true; const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) > 0.5001 || Math.abs(p.getY(i)) > 1.0001 || Math.abs(p.getZ(i)) > 1.5001 || !isFinite(p.getX(i))) ok = false; t.ok(ok, 'rounded box stays inside its box'); }
{ // a small rig: body + arm (animated) + hidden hat, with hurt flash material and an ink hull
  const grp = new THREE.Group(), arm = new THREE.Group(), hat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  const mat = new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0xff2a4a, emissiveIntensity: 0 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat); grp.add(body); arm.position.set(0.5, 0.2, 0); const am = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), mat); arm.add(am); grp.add(arm); hat.position.y = 0.7; grp.add(hat);
  const hull = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ color: 0x2d170f, side: THREE.BackSide })); body.add(hull);
  const before = [body, am, hat, hull].length, info = bake.bakeActor({ group: grp });
  grp.updateMatrixWorld(true); const bm = info.skeleton.boneMatrices; info.skeleton.update();
  t.ok(info.calls <= 3 && info.calls < before && info.bones >= 3, 'bakeActor folds a rig into a few skinned meshes (' + info.calls + ' calls, ' + info.bones + ' bones)');
  hat.visible = false; arm.rotation.z = 1; grp.updateMatrixWorld(true); info.skeleton.update();
  const hatBone = info.skeleton.bones.indexOf(hat); let zero = true; for (let k = 0; k < 16; k++) if (bm[hatBone * 16 + k] !== 0) zero = false; t.ok(zero, 'a hidden node collapses its bone');
  const armBone = info.skeleton.bones.indexOf(am); let moved = false; for (let k = 0; k < 16; k++) if (Math.abs(bm[armBone * 16 + k]) > 1e-6 && k % 5 !== 0) moved = true; t.ok(moved, 'animating a node moves its bone');
  mat.emissiveIntensity = 0.7; const sm = info.meshes.find((m) => m.material.isMeshStandardMaterial); t.ok(sm && Math.abs(sm.material.emissiveIntensity - 0.7) < 1e-6, 'the hurt flash reaches the baked material'); }

// ---- 3. headless V + live game state ----
const S = EI.S; S.started = true; try { EI.FEATS.find((f) => f.id === 'tutorial').api.finish(); S.feat.tutorial.off = true; } catch (e) { /* optional */ }
for (let i = 0; i < 7; i++) EI.addLand();
S.wallet = 5e5; S.gems = 9; S.houses = 3; for (let i = 0; i < 12; i++) EI.recruit();
EI.seedMain(7); for (const z of S.lands) for (let i = 0; i < 6; i++) EI.spawnEnemy(z); EI.spawnEnemy(S.lands[0], { boss: true }); for (const e of S.enemies) e.born = 1;
for (let i = 0; i < 40; i++) EI.dropItem(S.lands[0].g.x + (i % 8) * 30, S.lands[0].g.y + (i / 8 | 0) * 30, i % 7 === 0 ? { gem: true } : { k: 1 + (i % 12), bar: i % 5 === 0 });
S.forge = { queue: [{ k: 3 }], tray: [1, 2, 3, 4], smeltT: 0.5 }; S.forgeLvl = 2; S.bsPlate.built = true;
const labelsSeen = [], labelText = new Set(); const labels = { pill(txt) { labelsSeen.push('pill'); labelText.add(String(txt)); }, price(v) { labelsSeen.push('price'); labelText.add(String(v)); }, bar() { labelsSeen.push('bar'); }, icon() { labelsSeen.push('icon'); }, clear() { labelsSeen.length = 0; } };
S.player.helmets = [{ k: 2 }, { k: 5 }, { k: 7, bar: true }]; // the companion's loot counter is a label too
// the V below uses the medium (phone) tier caps: the budget that matters
function mkV() {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe8f4, 60, 200); const camera = new THREE.PerspectiveCamera(32, 0.5, 1, 800), rig = kit.makeLightRig(scene, { shadows: false });
  const world = new THREE.Group(), dyn = new THREE.Group(); scene.add(world, dyn); const blobs = new kit.BlobShadows(256); scene.add(blobs.mesh);
  const V = { THREE, kit, scene, camera, renderer: null, rig, LOOK: kit.LOOK, Q: kit.Q, W: kit.W, world, dyn, blobs, labels, mods: {}, focus: { x: 0, z: 0 }, quality: { tier: 'medium', detail: 2, shadows: true, dpr: 1, particles: 0.7, decor: 0.8, fans: 16, foes: 20 }, moodOverride: null, heightAt: () => 0, S: () => EI.S };
  V.bake = (a, o) => bake.bakeActor(a, o); return V;
}
// what a frame would draw: visible meshes whose bounding sphere is within the fog distance of the hero (the engine's frustum and fog cull the rest)
const _sp = new THREE.Sphere(), _fv = new THREE.Vector3();
function sceneCost(V, focus, range = 38) { V.scene.updateMatrixWorld(true); let calls = 0, tris = 0; V.scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine)) return; let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; } if (!vis || !o.layers.test({ mask: 1 })) return;
  const g = o.geometry; if (!g || !g.attributes.position) return;
  if (!o.isInstancedMesh && !o.isPoints) { if (!g.boundingSphere) g.computeBoundingSphere(); _sp.copy(o.boundingSphere || g.boundingSphere).applyMatrix4(o.matrixWorld); if (Math.hypot(_sp.center.x - focus.x, _sp.center.z - focus.z) - _sp.radius > range) return; }
  calls++; const n = g.index ? g.index.count : g.attributes.position.count; tris += (o.isInstancedMesh ? o.count : 1) * (o.isPoints ? 0 : n / 3); }); return { calls, tris }; }
{
  const V = mkV(), order = ['fx3d', 'env3d', 'loot3d', 'heroes3d', 'foes3d', 'hub3d', 'lands3d', 'backstage3d'], inst = {};
  for (const m of order) {
    if (!existsSync(join(v3, m + '.js'))) continue;
    try { const mod = await imp(m + '.js'); const r = await mod.init(V); t.ok(!!r && typeof r.update === 'function', m + ' init returns an updatable module'); if (r) { inst[m] = r; V.mods[m === 'env3d' ? 'env' : m.replace(/3d$/, '')] = r; } } catch (e) { t.ok(false, m + ' init: ' + (e && e.stack || e)); }
  }
  t.ok(!!V.fx, 'fx3d publishes V.fx');
  let thrown = null; const names = Object.keys(inst); const focus = V.focus;
  try { for (let f = 0; f < 45; f++) { EI.tick(1 / 30); labels.clear(); V.blobs.begin(); focus.x = S.player.x * kit.W; focus.z = S.player.y * kit.W; for (const m of names) inst[m].update(1 / 30, S.t, focus); V.blobs.end(); } } catch (e) { thrown = e; }
  t.ok(!thrown, 'all modules update for 45 frames against live state' + (thrown ? ': ' + (thrown.stack || thrown) : ''));
  // visit land 1 and the hub with the rich state, then count what a frame would cost
  S.player.x = S.lands[0].g.x; S.player.y = S.lands[0].g.y; try { for (let f = 0; f < 20; f++) { EI.tick(1 / 30); focus.x = S.player.x * kit.W; focus.z = S.player.y * kit.W; for (const m of names) inst[m].update(1 / 30, S.t, focus); } } catch (e) { thrown = e; }
  t.ok(!thrown, 'modules keep updating while the hero stands on land 1' + (thrown ? ': ' + thrown : ''));
  const cost = sceneCost(V, focus); t.ok(cost.calls > 20 && cost.calls < 330, 'a busy frame near land 1 stays inside the draw-call budget (' + cost.calls + ' objects in the view frustum range)'); t.ok(cost.tris < 800000, 'and the triangle budget (' + Math.round(cost.tris / 1000) + 'k)');
  if (process.env.V3_DEBUG) { // which top-level groups carry the draw calls? (V3_DEBUG=1 node tests/encore_island_view3d.test.mjs)
    const rows = []; for (const root of [V.world, V.dyn]) for (const ch of root.children) { const one = { scene: { traverse: (f) => ch.traverse(f), updateMatrixWorld() {} } }; const c = sceneCost({ scene: { traverse: (f) => ch.traverse(f), updateMatrixWorld: () => {} } }, focus); if (c.calls) rows.push([c.calls, Math.round(c.tris / 1000) + 'k', ch.name || ch.type + ':' + (ch.children[0] ? ch.children[0].type : '')]); }
    rows.sort((a, b) => b[0] - a[0]); console.log('V3 breakdown (calls, tris, group):\n' + rows.slice(0, 40).map((r) => '  ' + r.join('  ')).join('\n')); }
  t.ok([...labelText].every((x) => !/\[object|NaN|undefined|null|Infinity/.test(x)) && [...labelText].some((x) => /^3\/\d+$/.test(x)), 'every HUD label reads cleanly and the companion shows its n/cap counter (' + [...labelText].slice(0, 6).join(' | ') + ' ...)');
  t.ok(labelsSeen.length > 0, 'modules queue HUD labels (' + labelsSeen.length + ' this frame)');
  // reset behaviour: an Encore Tour empties the lands, modules must follow without throwing
  EI.prestige(); thrown = null; try { for (let f = 0; f < 10; f++) { EI.tick(1 / 30); for (const m of names) inst[m].update(1 / 30, EI.S.t, focus); } } catch (e) { thrown = e; }
  t.ok(!thrown, 'modules survive an Encore Tour reset' + (thrown ? ': ' + (thrown.stack || thrown) : ''));
  for (const m of names) try { inst[m].dispose && inst[m].dispose(); } catch (e) { thrown = e; } t.ok(!thrown, 'modules dispose cleanly');
}

// ---- 4. every creature and hero ----
{
  const V = mkV(); const reg = {}; for (const f of ['foes_a', 'foes_b', 'foes_c']) { if (!existsSync(join(v3, f + '.js'))) continue; const m = await imp(f + '.js'); for (const k in m) if (/^FOES_/.test(k)) Object.assign(reg, m[k]); }
  const arts = [...FOE_ART.flat(), ...BOSS_ART]; t.ok(arts.length === 27 && arts.every((a) => typeof reg[a] === 'function'), 'all 27 creatures (24 + 3 bosses) are modelled' + (arts.filter((a) => !reg[a]).length ? ' (missing ' + arts.filter((a) => !reg[a]).join(',') + ')' : ''));
  let bad = [];
  for (const art of arts) { if (!reg[art]) continue; try { const boss = BOSS_ART.includes(art), a = reg[art]({ boss, elite: art.length % 2 === 0, gold: art.length % 3 === 0 }); const info = bake.bakeActor(a);
      for (let i = 0; i < 40; i++) a.update(1 / 30, i / 30, { speed: i % 20 < 10 ? 1 : 0, atk: i % 15 === 3, hurt: i % 9 === 0 ? 1 : 0, die: i > 34 ? (i - 34) / 6 : 0, elite: true, gold: false });
      let tris = 0; a.group.traverse((o) => { if (o.isSkinnedMesh) tris += o.geometry.attributes.position.count / 3; });
      if (info.calls > (boss ? 10 : 7) || tris > (boss ? 14000 : 6000) || !(a.radius > 0) || !(a.height > 0)) bad.push(art + ' calls ' + info.calls + ' tris ' + Math.round(tris)); info.dispose(); } catch (e) { bad.push(art + ': ' + e.message); } }
  t.ok(bad.length === 0, 'every creature builds, bakes, animates (attack, hurt, death) inside its budget' + (bad.length ? ': ' + bad.join(' | ') : ''));
  let hm = null; try { hm = await imp('heroes3d.js'); } catch (e) { t.ok(false, 'heroes3d imports: ' + e.message); }
  if (hm && hm.makeHero) { const hb = []; for (const art of ['jasmin', 'roxor', 'rawclaw', 'andy', 'jasmin_unicorn', 'roxor_monster', 'rawclaw_goat', 'jordan']) { try { const a = hm.makeHero(art), info = bake.bakeActor(a); for (let i = 0; i < 30; i++) a.update(1 / 30, i / 30, { speed: i % 12 < 6 ? 1 : 0, atk: i % 10 === 2, cast: i === 20, cheer: i === 25, hurt: i === 8 ? 1 : 0, singing: true, carry: [{ k: 2 }, { k: 9, bar: true }] }); if (info.calls > 16) hb.push(art + ' calls ' + info.calls); info.dispose(); } catch (e) { hb.push(art + ': ' + e.message); } }
    t.ok(hb.length === 0, 'all 8 heroes build, bake and animate' + (hb.length ? ': ' + hb.join(' | ') : '')); }
}

// ---- 5. the 2D / 3D switch ----
{
  t.ok(EI.VIEW && EI.VIEW.mode === '2d' && !EI.VIEW.on3d, 'the game starts in 2D by default');
  const q = EI.w2s(CAM.x + 100, CAM.y - 50); t.ok(Math.abs(q.x - (vw / 2 + 100 * scl)) < 1e-6 && Math.abs(q.y - (vh * 0.46 - 50 * scl)) < 1e-6, 'w2s matches the 2D camera formula in 2D');
  EI.draw(0.016); t.ok(true, '2D draw still works');
  // pretend a ready 3D engine: the draw loop must call it, draw the screen-space features and the overlay, and not paint the 2D world
  const calls = { frame: 0, overlay: 0, resize: 0 }; EI.VIEW.api = { lost: false, frame() { calls.frame++; }, overlay() { calls.overlay++; }, resize() { calls.resize++; }, project: (x, y, h) => ({ x: 100 + x * 0.1, y: 200 + y * 0.1 - (h || 0), k: 1, ok: true }), setQuality() {} }; EI.VIEW.on3d = true; EI.VIEW.status = 'ready';
  let ok = true; try { EI.S.started = true; for (let i = 0; i < 5; i++) { EI.tick(0.05); EI.draw(0.05); } EI.S.started = false; EI.draw(0.05); EI.S.started = true; } catch (e) { ok = false; console.log(e); }
  t.ok(ok && calls.frame === 6 && calls.overlay === 6, '3D draw branch runs the engine, the overlay and the HUD without throwing');
  const p3 = EI.w2s(10, 20, 5); t.ok(p3.x === 101 && p3.y === 197, 'w2s projects through the 3D camera when 3D is on');
  EI.VIEW.on3d = false; EI.VIEW.api = null; EI.VIEW.status = 'idle';
  t.ok((await EI.viewSet('3d')) === false && EI.VIEW.mode === '2d' && EI.VIEW.status === 'failed', 'without WebGL the 3D choice falls back to 2D by itself');
  t.ok((await EI.viewSet('2d')) === true && JSON.parse(localStorage.getItem('encore_island_view_v1')).mode === '2d', 'the view choice is remembered in its own key');
  EI.viewSetQuality('medium'); t.ok(JSON.parse(localStorage.getItem('encore_island_view_v1')).q === 'medium', 'the quality choice is remembered');
  EI.viewSetQuality('auto');
  const q2 = await imp('quality.js'); const gl = (gpu) => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => gpu });
  t.ok(q2.detectTier(gl('ANGLE (Google, Vulkan, SwiftShader)')) === 'low' && q2.detectTier(gl('NVIDIA GeForce RTX 4070')) === 'high' && q2.detectTier(gl('x'), 'medium') === 'medium', 'tier detection: software GL is low, a desktop GPU is high, a forced choice wins');
  { const ad = new q2.Adaptive('high', (c) => { ad.last = c; }, {}); ad.cool = 0; const seq = []; for (let i = 0; i < 400; i++) ad.feed(0.033); t.ok(ad.last && ad.tier !== 'high' || ad.scale < 1, 'the governor lowers resolution then tier when frames stay slow (scale ' + ad.scale + ', tier ' + ad.tier + ')');
    const ad2 = new q2.Adaptive('medium', () => {}, {}); ad2.cool = 0; ad2.scale = 0.7; for (let i = 0; i < 2000; i++) ad2.feed(0.011); t.ok(ad2.scale > 0.7, 'and raises it again after a calm stretch'); }
}
t.done();
