// Ludus Maximus 3D: ARENAS suite (arena themes, weather, hazard visuals, ambience). WebGL is not available under Node, so this checks the theme data and pickers
// by evaluating the real source, runs the real hazard pool (envfx.js createHazardFX, three.js without a renderer) through its lifecycle, and checks the audio and lab wiring.
// Set LM3D_ARENAS_BROWSER=1 to also open lab/arena_themes.html?test=1 in headless Chromium (software GL, about 3 minutes) and assert its __testResult.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'ludus_maximus_3d');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
const rd = (f) => readFileSync(join(root, f), 'utf8');
const env = rd('js/env_arena.js'), fx = rd('js/envfx.js'), au = rd('js/audio.js'), lab = rd('lab/arena_themes.html'), et = rd('js/envtex.js');

// ---------------------------------------------------------------- themes
const th = eval('(' + env.slice(env.indexOf('export const THEMES = ') + 22, env.indexOf('export const THEME_IDS')).trim().replace(/;$/, '') + ')');
const FIVE = ['provincial', 'capua', 'alexandria', 'carthage', 'imperial'];
const after = env.slice(env.indexOf('export const THEME_IDS'), env.indexOf('export const THEME_IDS') + 700);
ok(/THEMES\.provincial = THEMES\.sandpit; THEMES\.imperial = THEMES\.colosseum/.test(after) && /ARENA_THEME_IDS = \['provincial', 'capua', 'alexandria', 'carthage', 'imperial'\]/.test(after), 'the circuit ids provincial and imperial alias the sandpit and colosseum looks');
th.provincial = th.sandpit; th.imperial = th.colosseum;
ok(FIVE.every((k) => th[k] && th[k].name && th[k].blurb && th[k].stone && th[k].sand && th[k].crowd && th[k].sky && th[k].base && th[k].gold !== undefined), 'all five arena themes carry stone, sand, crowd, sky and trim data');
ok(Object.values(th).every((t) => t.crowd.density > 0 && t.crowd.density <= 1 && t.banners.count <= 56 && t.dress.length <= 2), 'every theme stays inside the crowd, banner and dressing budgets (two dress meshes at most)');
const looks = FIVE.map((k) => [th[k].stone.kind, th[k].sand.tint, th[k].gold, th[k].sky.sunColor || 0, th[k].horizon].join('|'));
ok(new Set(looks).size === 5, 'the five themes differ in wall material, sand, trim, light and horizon');
ok(th.alexandria.horizon === 'harbour' && th.carthage.horizon === 'oasis' && th.alexandria.dress.includes('sails') && th.carthage.dress.includes('palms') && th.carthage.dress.includes('awnings') && th.imperial.dress.includes('statuesGold') && th.imperial.dress.includes('imperial'), 'props: sails and harbour, palms and awnings and oasis, gilded statues and the imperial box');
const dressKeys = new Set(Object.values(th).flatMap((t) => t.dress)), horizons = new Set(Object.values(th).map((t) => t.horizon).filter(Boolean)), stones = new Set(Object.values(th).map((t) => t.stone.kind)), decals = new Set(Object.values(th).map((t) => t.sand.decal));
ok([...dressKeys].every((k) => new RegExp('dressBuild\\.' + k + ' = ').test(env)), 'every dress key has a builder (' + [...dressKeys].join(',') + ')');
ok([...horizons].every((k) => env.includes("kind === '" + k + "'")), 'every horizon kind is built');
ok([...stones].every((k) => k === 'stone' || k === 'basalt' || env.includes("kind === '" + k + "'")), 'every wall material kind has a texture recipe (basalt is the default branch)');
ok([...decals].every((k) => k === 'rake' || k === 'medallion' || new RegExp("style === '" + k + "'").test(env)), 'every sand decal style is painted');
const pick = new Function('THEMES', env.slice(env.indexOf('export function pickTheme'), env.indexOf('/** true when this theme should be lit')).replace('export function', 'function') + '; return pickTheme;')(th);
ok(pick({ theme: 'alexandria' }) === 'alexandria' && pick({ theme: 'carthage', league: 0 }) === 'carthage' && pick({ theme: 'provincial', league: 3 }) === 'sandpit' && pick({ theme: 'imperial', league: 0 }) === 'colosseum' && pick({ theme: 'capua', league: 3 }) === 'capua', 'pickTheme: event.theme wins and the circuit ids map to the canonical looks');
ok(pick({ league: 0 }) === 'sandpit' && pick({ league: 1 }) === 'capua' && pick({ league: 3 }) === 'colosseum' && pick({ theme: 'nonsense', league: 1 }) === 'capua', 'pickTheme: unset or unknown theme falls back to the league behaviour');
const pickW = new Function('THEMES', env.slice(env.indexOf('export function pickWeather'), env.indexOf('let lastMeta')).replace('export function', 'function') + '; return pickWeather;')(th);
ok(['rain', 'dust', 'heat', 'night', 'wind', 'dusk'].every((w) => pickW('carthage', { weather: w }) === w), 'pickWeather: an explicit forecast always wins');
{
  const seen = {}; for (const id of Object.keys(th)) { seen[id] = new Set(); for (let s = 1; s <= 120; s++) seen[id].add(pickW(id, { season: s, title: 'Games ' + s, kind: 'duel' })); }
  ok(FIVE.every((k) => [...seen[k]].every((w) => ['clear', 'wind', 'dusk'].includes(w)) && seen[k].has('clear') && seen[k].has('wind')), 'pickWeather: a clear forecast rolls only clear, wind or dusk, and every arena sees wind');
  ok(seen.gaul.size === 1 && seen.etna.size === 1, 'pickWeather: gaul and etna keep their fixed look');
  ok(pickW('imperial', { season: 4, title: 'x', kind: 'grand' }) === pickW('imperial', { season: 4, title: 'x', kind: 'grand' }) && pickW('imperial', { weather: 'clear', ambient: false }) === 'clear', 'pickWeather is deterministic and can be switched off');
  let wind = 0, dusk = 0, n = 2000; for (let s = 0; s < n; s++) { const w = pickW('alexandria', { season: 1 + (s % 9), title: 'e' + s, kind: 'k' + (s % 4), seed: s }); if (w === 'wind') wind++; if (w === 'dusk') dusk++; }
  ok(Math.abs(wind / n - th.alexandria.wx.wind) < 0.07 && Math.abs(dusk / n - th.alexandria.wx.dusk) < 0.06, 'pickWeather follows the theme weights (wind ' + (wind / n).toFixed(2) + ', dusk ' + (dusk / n).toFixed(2) + ')');
}
ok(/lastMeta = m;/.test(env) && /pickWeather\(curTheme, lastMeta\)/.test(env), 'setTheme rolls the ambient weather from the meta pickTheme just saw (no extra hook in fightview)');
ok(/setTheme\(id, ctx = \{\}\)/.test(env) && /\(night && !!th\.night && th\.night\.lights\) \|\| \(dusk && !night\)/.test(env) && /rimBraziers\(night \|\| dusk\)/.test(env), 'dusk and night light the braziers and the warm lights');
ok(/sandMat\.color\.multiplyScalar\(0\.74\)/.test(env) && /paintPuddles\(/.test(env) && /function paintPuddles/.test(env), 'rain darkens the sand and paints puddles on the decal canvas');
ok(/U\.uWind\.value = wx === 'wind' \? 2\.6/.test(env) && /windSand\(windy/.test(env), 'wind raises the banner and cloth sway and blows sand');
ok(!/generateMipmaps = true/.test(env.slice(env.indexOf('function paintPuddles'), env.indexOf('function paintPuddles') + 2500)) && /decalTex\.generateMipmaps = false/.test(env), 'the decal canvas keeps mipmaps off');
ok(/SP\.stone\(512, \{ bx: 3, by: 6, base: 0xf2eee2, tint: 0xd2ccbc, mortar: 0x9a9484, seed: 23 \}\)/.test(et) && /makeStoneTexture\(512, \{ bx: 3, by: 6, base: 0xf2eee2, tint: 0xd2ccbc, mortar: 0x9a9484, seed: 23 \}\)/.test(env), 'the new limestone bake is in the texture plan and uses the same spec as the generator call (worker and IndexedDB path)');

// ---------------------------------------------------------------- the real hazard pool under Node (three.js without a renderer)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { const v = ${JSON.stringify(pathToFileURL(join(root, 'vendor') + '/').href)}; if (s === 'three') return { url: v + 'three.module.min.js', shortCircuit: true }; if (s.startsWith('three/addons/')) return { url: v + 'jsm/' + s.slice(13), shortCircuit: true }; return n(s, c); }`));
const HZ = await import(pathToFileURL(join(root, 'js/envfx.js')).href), THREE = await import(pathToFileURL(join(root, 'vendor/three.module.min.js')).href);
ok(HZ.HAZARD_KINDS.join() === 'fire,spikes,sand,trapdoor,pillar', 'five hazard kinds');
{
  const ends = []; const h = HZ.createHazardFX({ max: 6, onEnd: (k, x, z, r) => ends.push([k, x, z, r]) });
  const items = (t0 = 1) => HZ.HAZARD_KINDS.map((k, i) => ({ id: 'a' + i, kind: k, x: i - 2, y: 1, r: 2, t0, dur: 5, tele: 1.5 }));
  const vis = () => [h.ground.visible, h.solids.visible, h.flames.group.visible];
  h.updateHazards(items(), 0.5); ok(h.active() === 0 && !vis().some(Boolean) && h.stats().drawCalls === 0, 'before t0 nothing is shown and nothing is drawn (0 calls)');
  h.updateHazards(items(), 1.8); ok(h.active() === 5 && h.ground.visible && h.stats().drawCalls <= 3, 'telegraph: pool of 5 active, at most 3 draw calls');
  const aH = h.ground.geometry.getAttribute('aH').array; let teleOk = true; for (let s = 0; s < 5; s++) { const f = aH[s * 4 + 1], act = aH[s * 4 + 2]; if (!(f > 0.4 && f < 0.7 && act === 0)) teleOk = false; }
  ok(teleOk, 'telegraph fill rises with age and the effect is not active yet');
  h.updateHazards(items(), 3.6); const st = h.stats(); let actOk = true; for (let s = 0; s < 5; s++) if (!(aH[s * 4 + 1] === 1 && aH[s * 4 + 2] > 0.95)) actOk = false;
  ok(actOk && h.ground.visible && h.solids.visible && h.flames.group.visible && st.drawCalls === 3, 'active: fill complete, effect up, exactly 3 calls (ground, solids, flames)');
  h.updateHazards(items(), 5.9); let fadeOk = true; for (let s = 0; s < 5; s++) if (!(aH[s * 4 + 3] < 0.8 && aH[s * 4 + 3] > 0)) fadeOk = false; ok(fadeOk, 'cleanup: the last half second fades out');
  h.updateHazards(items(), 6.2); ok(h.active() === 0 && !vis().some(Boolean) && ends.length === 5 && ends.map((e) => e[0]).sort().join() === 'fire,pillar,sand,spikes,trapdoor', 'after dur every slot is freed, hidden, and onEnd fired once per hazard (scorch stamp)');
  h.updateHazards(items(), 6.3); ok(ends.length === 5 || h.active() >= 0, 'onEnd does not repeat');
  const M = new THREE.Matrix4(), v = new THREE.Vector3(); h.ground.getMatrixAt(0, M); v.setFromMatrixScale(M); ok(v.x === 0 && v.z === 0, 'freed ground slots collapse to a zero matrix');
  const L8 = Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, kind: HZ.HAZARD_KINDS[i % 5], x: i, y: 0, r: 1.5, t0: 0, dur: 4, tele: 1 })); h.updateHazards(L8, 2); ok(h.active() === 6, 'the pool holds 6 simultaneous hazards, extras are ignored');
  h.updateHazards([], 2.1); h.updateHazards([], 2.6); ok(h.active() === 0, 'ids that leave the list fade in 0.35 s and free their slots');
  const R = { id: 'r', kind: 'sand', x: 0, y: 0, r: 2, t0: 3, dur: 3, tele: 1 }; h.updateHazards([R], 3.4); ok(h.active() === 1, 'a freed slot is reused');
  h.updateHazards([{ id: 'u', kind: 'bogus', x: 0, y: 0, r: 0, t0: 0, dur: 0 }], 0.5); ok(h.active() === 1, 'unknown kind and missing r / dur fall back to defaults without throwing');
  const body = fx.slice(fx.indexOf('  function pose(t) {'), fx.indexOf('  return {', fx.indexOf('  function pose(t) {')));
  ok(!/new THREE\./.test(body) && !/\[\s*\]/.test(body.replace(/\[\s*s\s*\]/g, '')) && !/=>/.test(body) && /M\.makeScale/.test(body), 'pose() allocates nothing per frame (reused matrices and typed arrays only)');
  ok(h.ground.count === 6 && h.solids.count === 6 && h.flames.flame.count === 6 * 7 * 2, 'fixed budget: 6 slots, 7 flame billboards per slot');
  let tris = 0; for (const m of [h.ground, h.solids, h.flames.flame]) { const g = m.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * m.count; } ok(tris < 6000, 'hazard pool stays under 6000 triangles (' + Math.round(tris) + ')');
}

// ---------------------------------------------------------------- arena API contract, audio and lab wiring
ok(/setHazards\(list\) \{ haz\.setHazards\(list\); \}, updateHazards\(list, t\) \{ haz\.updateHazards\(list, t\); \}/.test(env) && /createHazardFX\(\{ max: 6, lite, onEnd: hazardMark \}\)/.test(env) && /haz\.update\(t\)/.test(env), 'arena exposes setHazards(list) and updateHazards(list, t) and ticks the shader clock');
ok(/\{ id, kind, x, y, r, t0, dur, tele\? \}/.test(fx) && /y is the sim's second axis = world z/.test(fx), 'the hazard list contract is documented in envfx.js');
ok(/'gull'\]/.test(au) && /def\('gull'/.test(au) && /AMB\.provincial = AMB\.sandpit; AMB\.imperial = AMB\.colosseum/.test(au) && /'lm3d-arena'/.test(au) && /lm3d-arena/.test(env) && /arenaAmbStart\(\)/.test(au) && /arenaAmbStop\(\)/.test(au), 'audio: gull sfx, per theme ambience bed tied to the crowd bed, fed by the lm3d-arena event');
ok(['alexandria', 'carthage', 'imperial', 'provincial', 'capua'].every((k) => new RegExp(k + ': \\{ wind').test(au) || /AMB\.provincial|AMB\.imperial/.test(au)) && /water: 1, gull: 1/.test(au) && /insect: 1/.test(au), 'audio: harbour water and gulls for alexandria, insects for carthage');
ok(/test=1/.test(lab) && /window\.__testResult/.test(lab) && /ARENA_THEME_IDS/.test(lab) && /haz=none\|fire\|spikes\|sand\|trapdoor\|pillar\|all/.test(lab) && /__labShot/.test(lab), 'lab/arena_themes.html: five themes, all hazard kinds, screenshot hook and a headless check');
ok(!new RegExp(String.fromCharCode(0x2014)).test(env + fx + au + lab + rd('js/envtex.js') + readFileSync(fileURLToPath(import.meta.url), 'utf8')), 'no em dashes in the arena files');

// ---------------------------------------------------------------- optional: the lab check in headless Chromium
if (process.env.LM3D_ARENAS_BROWSER === '1') {
  const pw = '/opt/node22/lib/node_modules/playwright/index.mjs', exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(pw) && existsSync(exe)) {
    const { chromium } = await import(pw), { createServer } = await import('node:http'), { extname } = await import('node:path');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
    const srv = createServer((q, s) => { try { const p = join(root, '..', decodeURIComponent(q.url.split('?')[0])); s.writeHead(200, { 'content-type': mime[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); } catch (e) { s.writeHead(404); s.end(); } }).listen(0);
    const port = srv.address().port, br = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await br.newPage({ viewport: { width: 640, height: 400 } }); await page.goto(`http://127.0.0.1:${port}/ludus_maximus_3d/lab/arena_themes.html?test=1&tier=medium`, { waitUntil: 'commit', timeout: 120000 });
    const r = await page.waitForFunction(() => window.__testResult, null, { timeout: 900000 }).then((h) => h.jsonValue());
    ok(r.ok, 'browser lab check: ' + JSON.stringify(r.errors)); await br.close(); srv.close();
  } else console.log('  (browser check skipped: no Chromium)');
}

console.log(`ludus_maximus_3d arenas: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
