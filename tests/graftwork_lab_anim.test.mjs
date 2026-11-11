// GRAFTWORK animation lab (graftwork/lab/anim.html + anim.js): the page references files that exist, imports only real modules and exports, has the five
// scenes, reads its URL params, lists actors from the manifest (no hard coded roster), offers the game's two walks (the puppet and the hop) and nothing that
// left the game. Headless safe: static checks plus a node import of the game modules it drives (no DOM needed). That the lab runs as a page, in Chromium, with
// the controls of its puppet and rig scenes is tests/graftwork_puppet.test.mjs and tests/graftwork_rig.test.mjs; the dash rule is hygiene's.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fakeCtx, canvasCalls } from './graftwork_lib.mjs';
import { withChromium, labVisit } from './graftwork_browser_lib.mjs';
const root = new URL('../graftwork/', import.meta.url).pathname;
const html = readFileSync(join(root, 'lab/anim.html'), 'utf8'), js = readFileSync(join(root, 'lab/anim.js'), 'utf8');
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
  for (const w of ['ISO.gait(', 'ISO.drawActor(', 'CA.drawEnemySprite(', 'CA.drawHeroSprite(', 'CA.drawBackdrop(', 'KR.drawStatic(', 'RIG.walkPose(', 'RIG.solveRig(', 'RIG.drawRig(', 'PUP.infoOf(']) assert.ok(js.includes(w), w);
});
await t('the_modules_export_what_the_lab_calls', async () => {
  const ISO = await import('../graftwork/ui/ward_iso.js'), CA = await import('../graftwork/ui/combat_art.js'), RIG = await import('../graftwork/ui/rig.js'), A = await import('../graftwork/ui/assets.js'), KR = await import('../graftwork/ui/ward_kit_iso.js'), J = await import('../graftwork/ui/juice.js');
  for (const f of ['gait', 'drawActor', 'contactOf', 'lightState']) assert.equal(typeof ISO[f], 'function', 'ward_iso ' + f);
  assert.equal(ISO.STRIDE, 0.5);
  for (const f of ['spriteOf', 'drawEnemySprite', 'drawHeroSprite', 'drawBackdrop', 'enemyFrameStem', 'heroFrameStem', 'warm', 'kindK']) assert.equal(typeof CA[f], 'function', 'combat_art ' + f);
  for (const f of ['walkPose', 'solveRig', 'drawRig', 'leadFoot']) assert.equal(typeof RIG[f], 'function', 'rig ' + f);
  assert.equal(typeof A.pickAtkFrame, 'function'); assert.equal(typeof A.assets.frames, 'function'); assert.equal(typeof A.assets.frame, 'function');
  for (const f of ['recipeFor', 'drawStatic', 'drawItems', 'heroPolyline', 'alongPolyline', 'wallHeights', 'extentOf', 'worldLen']) assert.equal(typeof KR[f], 'function', 'ward_kit_iso ' + f);
  for (const f of ['atkTiming', 'atkTotal', 'atkPhase', 'isMelee', 'reachK']) assert.equal(typeof J[f], 'function', 'juice ' + f);
});
await t('the_aura_switch_is_additive: an elite or a boss has its aura unless the lab says aura false, and nobody else has one', async () => {
  const CA = await import('../graftwork/ui/combat_art.js'), { ENEMIES } = await import('../graftwork/data/index.js');
  const sp = { img: { width: 256, height: 256, tag: 'stand' }, def: { w: 256, h: 256 }, bbox: [40, 18, 216, 243] }, ed = { anim: { sq: 0 }, phase: 0, scale: 1, w: 150, h: 200, atk: { phase: 'idle', k: 0 }, atkT: -1 };
  const calls = (kind, o) => { const def = Object.values(ENEMIES).find((e) => e.kind === kind), g = fakeCtx(), c0 = canvasCalls(); CA.drawEnemySprite(g, sp, def, ed, 900, 356, 1, { reduced: false, ...o }); return canvasCalls() - c0; };
  for (const kind of ['elite', 'boss']) {
    const plain = calls(kind, {}), on = calls(kind, { aura: true }), off = calls(kind, { aura: false });
    assert.equal(plain, on, kind + ': no switch means the aura is drawn'); assert.ok(off < plain, `${kind}: aura false draws less (${off} calls against ${plain})`);
  }
  assert.equal(calls('normal', {}), calls('normal', { aura: false }), 'a normal enemy has no aura to switch');
});
await t('five_scenes_and_url_params', () => {
  for (const s of ['viewer', 'map', 'battle', 'rig', 'compare']) assert.ok(js.includes(`SC.${s} = {`) && js.includes(`'${s}'`), 'scene ' + s);
  for (const p of ["'scene'", "'actor'", "'anim'", "'source'", "'t'", "'frame'", "'pace'", "'tod'", "'enemies'", "'hero'", "'speed'"]) assert.ok(js.includes(`Q.get(${p})`) || js.includes(`qn(${p}`) || js.includes(`Q.has(${p})`), 'param ' + p);
  for (const a of ['idle', 'walk', 'attack', 'hit', 'die']) assert.ok(js.includes(`'${a}'`), 'anim ' + a);
});
await t('viewer_controls_exist', () => {
  for (const w of ['Onion skin', 'Feet line', 'Contact', 'Grid', 'Flip', 'Loop', 'Speed', 'Scale', 'scale drift', 'feet offset', 'framesOk', 'procedural walk', 'PUPPET walk']) assert.ok(js.includes(w), w);
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
await t('the_walk_has_the_two_sources_of_the_game_and_compare_is_puppet_versus_hop', () => {
  const opts = [...js.matchAll(/\{ v: '([a-z]+)', t: 'Source: [^']+' \}/g)].map((m) => m[1]);
  assert.deepEqual(opts, ['puppet', 'procedural'], 'the source menu: the puppet (the game) and the hop under it');
  assert.ok(js.includes("'Puppet vs hop'") && /ST\.source = 'puppet'; ST\.source2 = 'procedural'/.test(js), 'the Compare preset');
  assert.ok(/source: srcOf\(Q\.get\('source'\), 'puppet'\)/.test(js) && /source2: srcOf\(Q\.get\('source2'\), 'procedural'\)/.test(js), 'Compare opens on puppet (left) versus hop (right)');
  assert.ok(/rec\.pm = walkSrc\([^)]*\) === 'puppet' \? '' : 'off'/.test(js), 'the hop is the game\'s own actor draw with the puppet switched off');
  for (const gone of ['step swap', 'painted walk', 'Source: painted', "'swap'", "'frames'", "'_b'", 'walkIndex', 'walkReady', 'wantsPuppet', 'walkOk', 'walk1x']) assert.ok(!js.includes(gone), 'left the game, so it left the lab: ' + gone);
});
await t('the_room_lab_is_gone', () => {
  assert.ok(!existsSync(join(root, 'lab/rooms.html')) && !existsSync(join(root, 'lab/rooms.js')), 'the room lab page was removed');
  assert.ok(!html.includes('rooms.html'), 'no link to it');
});
await t('every_scene_runs_as_a_page: it builds its controls, answers every request, draws and raises nothing (Chromium; skipped when it is missing)', async () => {
  await withChromium(async ({ br, base }) => {
    const scenes = { viewer: 'Actor viewer', map: 'Map walk', battle: 'Battle', rig: 'Rig lab', compare: 'Compare' };
    const visits = await Promise.all(Object.keys(scenes).map((sc) => labVisit(br, base, `?scene=${sc}`, `document.getElementById('read').innerText.length > 0`)));
    try {
      const asked = new Set();
      for (const [i, sc] of Object.keys(scenes).entries()) {
        const v = visits[i], S = await v.read();
        assert.deepEqual(v.errors, [], sc + ': nothing raised'); assert.equal(S.banner, '', sc + ': no error banner');
        assert.ok(S.ctl.includes(scenes[sc]), sc + ': the page opens on its own scene'); assert.deepEqual(v.requests.filter((q) => q.status !== 200), [], sc + ': every request is answered');
        for (const q of v.requests) asked.add(q.url);
      }
      for (const f of ['/graftwork/lab/anim.js', '/graftwork/assets/ward/manifest.json', '/tools/graftwork_art_meta.json', ...['assets', 'combat_art', 'ward_iso', 'ward_kit_iso', 'rig', 'rigs', 'puppet', 'juice', 'combat_layout'].map((m) => `/graftwork/ui/${m}.js`)]) assert.ok(asked.has(f), 'the lab loads ' + f);
    } finally { for (const v of visits) await v.close(); }
  });
});
console.log(n + ' animation lab checks passed');
