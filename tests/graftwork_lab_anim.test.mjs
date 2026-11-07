// GRAFTWORK animation lab (graftwork/lab/anim.html + anim.js): the page references files that exist, imports only real modules and exports, has the five
// scenes, reads its URL params, lists actors from the manifest (no hard coded roster), links from the kit lab and has no em dashes. Headless safe: static
// checks plus a node import of the game modules it drives (no DOM needed).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const root = new URL('../graftwork/', import.meta.url).pathname;
const html = readFileSync(join(root, 'lab/anim.html'), 'utf8'), js = readFileSync(join(root, 'lab/anim.js'), 'utf8'), rooms = readFileSync(join(root, 'lab/rooms.html'), 'utf8');
const man = JSON.parse(readFileSync(join(root, 'assets/ward/manifest.json'), 'utf8'));
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };

await t('page_references_real_files', () => {
  assert.ok(/<script[^>]+type="module"[^>]+src="anim\.js"/.test(html), 'module script');
  assert.ok(html.includes('name="viewport"') && html.includes('id="cv"') && html.includes('id="banner"') && html.includes('id="strip"') && html.includes('id="ctl"'), 'viewport, canvas, banner, strip, controls');
  assert.ok(existsSync(join(root, 'lab/anim.js')));
  for (const m of js.matchAll(/(?:from|import\()\s*'(\.\.?\/[^']+)'/g)) assert.ok(existsSync(resolve(join(root, 'lab'), m[1])), 'import ' + m[1]);
  assert.ok(js.includes("'../assets/ward/'") && js.includes('graftwork_art_meta.json'));
  assert.ok(existsSync(join(root, '../tools/graftwork_art_meta.json')), 'the framesOk flags live in the art meta');
});
await t('uses_the_real_game_code_paths', () => {
  for (const f of ['ui/assets.js', 'ui/combat_art.js', 'ui/ward_iso.js', 'ui/ward_kit_iso.js', 'ui/rig.js', 'ui/juice.js', 'ui/combat_layout.js']) assert.ok(js.includes(`'../${f}'`), f);
  for (const w of ['ISO.gait(', 'ISO.drawActor(', 'CA.drawEnemySprite(', 'CA.drawHeroSprite(', 'CA.drawBackdrop(', 'KR.drawStatic(', 'RIG.walkPose(', 'RIG.solveRig(', 'RIG.drawRig(', 'walkIndex(']) assert.ok(js.includes(w), w);
});
await t('the_modules_export_what_the_lab_calls', async () => {
  const ISO = await import('../graftwork/ui/ward_iso.js'), CA = await import('../graftwork/ui/combat_art.js'), RIG = await import('../graftwork/ui/rig.js'), A = await import('../graftwork/ui/assets.js'), KR = await import('../graftwork/ui/ward_kit_iso.js'), J = await import('../graftwork/ui/juice.js');
  for (const f of ['gait', 'drawActor', 'contactOf', 'lightState']) assert.equal(typeof ISO[f], 'function', 'ward_iso ' + f);
  assert.equal(ISO.STRIDE, 0.5);
  for (const f of ['spriteOf', 'drawEnemySprite', 'drawHeroSprite', 'drawBackdrop', 'enemyFrameStem', 'heroFrameStem', 'warm', 'kindK']) assert.equal(typeof CA[f], 'function', 'combat_art ' + f);
  for (const f of ['walkPose', 'solveRig', 'drawRig', 'leadFoot']) assert.equal(typeof RIG[f], 'function', 'rig ' + f);
  assert.equal(typeof A.walkIndex, 'function'); assert.equal(typeof A.assets.frames, 'function');
  for (const f of ['recipeFor', 'drawStatic', 'drawItems', 'heroPolyline', 'alongPolyline', 'wallHeights', 'extentOf', 'worldLen']) assert.equal(typeof KR[f], 'function', 'ward_kit_iso ' + f);
  for (const f of ['atkTiming', 'atkTotal', 'atkPhase', 'isMelee', 'reachK']) assert.equal(typeof J[f], 'function', 'juice ' + f);
  assert.ok(/o\.aura !== false/.test(readFileSync(join(root, 'ui/combat_art.js'), 'utf8')), 'the aura switch is additive in combat_art');
});
await t('five_scenes_and_url_params', () => {
  for (const s of ['viewer', 'map', 'battle', 'rig', 'compare']) assert.ok(js.includes(`SC.${s} = {`) && js.includes(`'${s}'`), 'scene ' + s);
  for (const p of ["'scene'", "'actor'", "'anim'", "'source'", "'t'", "'frame'", "'pace'", "'tod'", "'enemies'", "'hero'", "'speed'"]) assert.ok(js.includes(`Q.get(${p})`) || js.includes(`qn(${p}`) || js.includes(`Q.has(${p})`), 'param ' + p);
  for (const a of ['idle', 'walk', 'attack', 'hit', 'die']) assert.ok(js.includes(`'${a}'`), 'anim ' + a);
});
await t('viewer_controls_exist', () => {
  for (const w of ['Onion skin', 'Feet line', 'Contact', 'Grid', 'Flip', 'Loop', 'Speed', 'Scale', 'scale drift', 'feet offset', 'framesOk', 'walkOk', 'step swap', 'procedural walk', 'painted walk cycle']) assert.ok(js.includes(w), w);
  for (const w of ['Hero attack', 'Enemy attack', 'Hit', 'Block', 'Die', 'Heal', 'Statuses', 'Elite and boss aura']) assert.ok(js.includes(`'${w}'`), w);
  for (const w of ['Stride', 'Step height', 'Body bob', 'Arm swing', 'Joints', 'lead foot', "'normal', 'fast', 'wander'", 'plants', 'What to judge']) assert.ok(js.includes(w), w);
});
await t('actor_list_is_manifest_driven', () => {
  assert.ok(js.includes('assets.manifest.actors'), 'actor groups come from the manifest');
  const ids = Object.keys(man.actors); assert.ok(ids.length >= 20);
  const used = new Set([...js.matchAll(/'(marrow|wick|odile|gauze_mummy|bedpan_slime|orderly|the_resident|the_matron|stitch_rat)'/g)].map((m) => m[1]));
  for (const id of used) assert.ok(man.actors[id], 'default actor ' + id + ' is in the manifest');
  for (const k of ['hero', 'normal', 'elite', 'boss', 'npc']) assert.ok(ids.some((id) => (man.actors[id].kind || (id.startsWith('npc_') ? 'npc' : '')) === k), 'manifest has kind ' + k);
});
await t('failures_are_shown_not_thrown', () => {
  assert.ok(js.includes('failed to load') && js.includes('manifest did not load') && js.includes('Drawing error'), 'visible fallback messages');
  assert.ok(!/console\.(error|warn)/.test(js), 'no console output from the lab');
});
await t('linked_from_the_kit_lab_and_no_em_dashes', () => {
  assert.ok(rooms.includes('href="anim.html"'), 'kit lab links to the animation lab');
  assert.ok(html.includes('href="rooms.html"'), 'animation lab links back');
  for (const [name, s] of [['anim.html', html], ['anim.js', js], ['rooms.html', rooms]]) assert.ok(!/[—–]/.test(s), 'em or en dash in ' + name);
});
console.log(n + ' animation lab checks passed');
