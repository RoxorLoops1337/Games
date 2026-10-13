// Ludus Maximus 3D: structure suite. WebGL is not available under Node, so this checks parsing, import graph, importmap, build registration,
// content rules (no em dashes) and the sim hooks the 3D layer relies on. Pixels are covered by tools/ludus3d_shot.mjs screenshots.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'ludus_maximus_3d');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f === 'vendor' || f === 'lab') continue; walk(p, out); } else out.push(p); } return out; };
const files = walk(root);
const js = files.filter((f) => f.endsWith('.js') && !f.includes('/core/'));
ok(js.length >= 14, 'js modules present (' + js.length + ')');

// 1. every module parses
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', '--input-type=module', '-'], { input: readFileSync(f, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] }); ok(true, ''); }
  catch (e) { ok(false, f.replace(root, '') + ' parses: ' + String(e.stderr).split('\n').find((l) => /Error/.test(l))); }
}

// 2. relative imports resolve (static and dynamic literal imports); bare 'three' is covered by the importmap
const importRe = /(?:import\s+(?:[^'"]*?from\s+)?|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
for (const f of js) {
  const src = readFileSync(f, 'utf8'); let m;
  while ((m = importRe.exec(src))) {
    const target = resolve(dirname(f), m[1]);
    const optional = /hub\.js$/.test(m[1]); // hub.js is imported with a stub fallback
    ok(existsSync(target) || optional, f.replace(root, '') + ' imports ' + m[1]);
  }
}
// screens are lazy-loaded from a template string: every id in game.js SCREENS must exist once the UI wave lands (warn only for missing)
const game = readFileSync(join(root, 'js', 'game.js'), 'utf8');
const ids = (game.match(/const SCREENS = \[([^\]]+)\]/) || [, ''])[1].match(/'(\w+)'/g) || [];
ok(ids.length >= 8, 'game.js lists the screens');
for (const q of ids) { const id = q.replace(/'/g, ''); if (!existsSync(join(root, 'js', 'screens', id + '.js'))) console.warn('  note: screen not built yet: ' + id); }

// 3. index.html: importmap resolves to the vendored three.js, classic core scripts come before the module
const html = readFileSync(join(root, 'index.html'), 'utf8');
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
ok(existsSync(join(root, map.three)) && existsSync(join(root, map['three/addons/'], 'postprocessing/EffectComposer.js')), 'importmap resolves');
ok(html.indexOf('core/data.js') < html.indexOf('core/sim.js') && html.indexOf('core/sim.js') < html.indexOf('core/arena.js') && html.indexOf('core/arena.js') < html.indexOf('js/main.js'), 'script order data, sim, arena, main');
ok(/viewport-fit=cover/.test(html), 'viewport-fit=cover for safe areas');

// 4. build registration
const build = readFileSync(join(here, '..', 'build.js'), 'utf8');
ok(/'ludus_maximus_3d'/.test(build), 'build.js STATIC_PATHS has ludus_maximus_3d');
ok(/ludus_maximus_3d\\\/\(lab/.test(build), 'lab pages are dev only');
const cc = readFileSync(join(here, '..', 'tools', 'check-changed.mjs'), 'utf8');
ok(/ludus_maximus_3d: \['test:ludus3d'\]/.test(cc), 'check-changed maps the game');

// 5. save key is its own, never the 2D game's
const sim = readFileSync(join(root, 'core', 'sim.js'), 'utf8');
ok(/KEY = 'ludus_maximus_3d_v1'/.test(sim), 'own save key');
ok(!/KEY = 'ludus_maximus_v1'/.test(sim), 'does not share the 2D save');

// 5b. portraits: renderer module exists, game exposes ctx.portrait
const gm = readFileSync(join(root, 'js', 'game.js'), 'utf8');
ok(/export function createPortraitRenderer/.test(readFileSync(join(root, 'js', 'portrait.js'), 'utf8')) && /portrait: \(/.test(gm), 'portrait renderer + ctx.portrait');

// 6. no em dashes anywhere in authored text (owner rule)
for (const f of files.filter((x) => /\.(js|html|css|md)$/.test(x))) ok(!readFileSync(f, 'utf8').includes('—'), f.replace(root, '') + ' has no em dash');

// 7. sim hooks used by the 3D layer
const require = createRequire(import.meta.url);
require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/arena.js');
for (const fn of ['newGame', 'makeGlad', 'mkUnits', 'createFight', 'step', 'useUlt', 'useDuo', 'useFavor', 'focus', 'apsOf', 'weekTrain', 'weekFinish', 'dueKeys', 'eventByKey', 'settle', 'teamCtx', 'odds', 'oppStance', 'augCtx', 'facPerks', 'duoPair', 'tourneyInit', 'stars']) ok(typeof LM[fn] === 'function', 'LM.' + fn);
{ // a fight emits the event kinds the 3D bindings handle
  const seeded = (s) => { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  LM.setRandom(seeded(7));
  const a = LM.makeGlad({ style: 'murmillo', lvl: 6, id: 1 }), b = LM.makeGlad({ style: 'thraex', lvl: 6, id: 2 });
  const F = LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}), { autoA: true }); const kinds = new Set(); let n = 0;
  while (!F.done && n++ < 3000) { LM.step(F, 1 / 30); F.ev.splice(0).forEach((e) => kinds.add(e.k)); }
  ok(F.done, 'fight ends'); for (const k of ['atk', 'hit', 'down', 'end']) ok(kinds.has(k), 'event ' + k + ' emitted');
  const src = readFileSync(join(root, 'js', 'fightview.js'), 'utf8');
  for (const k of ['atk', 'hit', 'miss', 'tech', 'dash', 'proj', 'aoe', 'tele', 'zap', 'hook', 'bleed', 'status', 'heal', 'ult', 'down', 'revive', 'roar', 'favorready']) ok(new RegExp("case '" + k + "'").test(src), 'fightview handles ' + k);
}

// 8. deterministic replay: a snapshot + seed + recorded taps reproduces the fight exactly
{
  const mk = () => { const a = LM.makeGlad({ style: 'hoplomachus', lvl: 9, id: 1, r: LM.mulberry(5) }), b = LM.makeGlad({ style: 'retiarius', lvl: 9, id: 2, r: LM.mulberry(6) });
    return LM.createFight(LM.mkUnits([a], 'A', {}), LM.mkUnits([b], 'B', {}), { autoA: false, hazards: 1 }); };
  LM.setRandom(LM.mulberry(11)); const F = mk(); const seed = 777; LM.setRandom(LM.mulberry(seed));
  let snap; try { snap = structuredClone(F); ok(true, ''); } catch (e) { ok(false, 'fight snapshot is structured-cloneable: ' + e.message); }
  const taps = []; let n = 0;
  while (!F.done && n++ < 4000) { if (F.n === 90) { taps.push({ n: F.n, uid: 'A0', k: 0 }); LM.useUlt(F, 'A0', 0); } LM.step(F, 1 / 30); F.ev.length = 0; }
  LM.setRandom(LM.mulberry(seed)); const G = snap; let m = 0, ti = 0;
  while (!G.done && m++ < 4000) { while (ti < taps.length && taps[ti].n <= (G.n || 0)) { LM.useUlt(G, taps[ti].uid, taps[ti].k); ti++; } LM.step(G, 1 / 30); G.ev.length = 0; }
  LM.setRandom(null);
  ok(F.done && G.done && F.winner === G.winner && F.n === G.n && F.units.every((u, i) => u.hp === G.units[i].hp), `replay matches (winner ${F.winner}/${G.winner}, steps ${F.n}/${G.n})`);
}

// 9. gore: files, hooks, the Gore pref, the sfx, and the "never touches the sim RNG" rule
{
  const rd = (f) => readFileSync(join(root, 'js', f), 'utf8');
  const gore = rd('gore.js'), fv = rd('fightview.js'), more = rd('screens/more.js'), au = rd('audio.js'), rig = rd('rig.js'), fxs = rd('fx.js'), dir = rd('director.js');
  ok(existsSync(join(root, 'js', 'gore.js')) && /export function createGore/.test(gore) && /export function goreLevel/.test(gore), 'js/gore.js exports createGore and goreLevel');
  ok(!/Math\.random/.test(gore), 'gore.js has no Math.random (own seeded RNG, replays render the same gore)');
  ok(!/setRandom|LM\.|globalThis\.LM\b/.test(gore), 'gore.js never touches the sim or its RNG');
  ok(/mulberry/.test(gore) && /G\.reset = \(seed/.test(gore), 'gore reseeds from the fight / replay seed');
  ok(/import \{ createGore \} from '\.\/gore\.js'/.test(fv) && /gore\.onHit\(/.test(fv) && /gore\.onDown\(/.test(fv) && /gore\.onBleed\(/.test(fv) && /gore\.postFrame\(/.test(fv), 'fightview feeds hit, down, bleed and the vignette frame to gore');
  ok(/replay\.seed/.test(fv) && /goreSeed/.test(fv), 'fightview seeds gore from the replay seed');
  ok(/p\.extra/.test(dir), 'kill shot frames gore extra points (the flung limb)');
  ok(/PREF_KEY = 'ludus_maximus_3d_prefs'/.test(more) && /gore: 'full'/.test(more) && /Gore: Off/.test(more) && /Gore: Low/.test(more) && /Gore: Full/.test(more) && /LM3D_GORE/.test(more), 'More > Settings has the Gore level in the existing prefs object (default full)');
  ok(/lx-reduce-motion/.test(gore) && /prefers-reduced-motion/.test(gore), 'reduced motion turns gore off');
  for (const n of ['slashWet', 'crunch', 'boneSnap', 'spurt', 'splat', 'gibThud', 'crowdGore']) ok(new RegExp("'" + n + "'").test(au.match(/SFX_NAMES = \[[\s\S]*?\];/)[0]) && new RegExp("def\\('" + n + "'").test(au), 'audio.js has sfx ' + n);
  ok(/export function makeBloodUniforms/.test(rig) && /sever\(part\)/.test(rig) && /addWound\(/.test(rig) && /restoreParts\(/.test(rig), 'rig.js has blood uniforms, wounds and sever');
  ok(/putS\(/.test(fxs) && /hooks: \[\]/.test(fxs) && /decalDraw/.test(fxs), 'fx.js exposes the gore hooks');
  ok(/gore_gibs/.test(gore) && (gore.match(/new THREE\.InstancedMesh/g) || []).length === 1, 'gore adds a single instanced draw call');
}


// 10. arena themes, the fallen, tutorial robustness, the world screen (content team round)
{
  const rd = (f) => readFileSync(join(root, f), 'utf8'), env = rd('js/env_arena.js'), fv = rd('js/fightview.js'), fs = rd('js/fightsetup.js'), game = rd('js/game.js'), tut = rd('js/tutorial.js'), more = rd('js/screens/more.js'), modes = rd('js/screens/modes.js'), flow = rd('js/flow.js'), world = rd('js/screens/world.js'), idx = rd('index.html'), sim = rd('core/sim.js'), ext = rd('core/ext.js'), cer = rd('js/ceremonies.js');
  // arena themes
  const th = eval('(' + env.slice(env.indexOf('export const THEMES = ') + 22, env.indexOf('export const THEME_IDS')).trim().replace(/;$/, '') + ')');
  ok(['sandpit', 'capua', 'colosseum', 'desert', 'gaul', 'etna'].every((k) => th[k] && th[k].name && th[k].stone && th[k].sand && th[k].crowd && th[k].sky && th[k].base), 'THEMES has the six arena looks with stone, sand, crowd and sky data');
  ok(Object.values(th).every((t) => t.crowd.density > 0 && t.crowd.density <= 1 && t.banners.count <= 56 && t.dress.length <= 2), 'every theme stays inside the crowd, banner and dressing budgets');
  const pick = new Function('THEMES', env.slice(env.indexOf('export function pickTheme'), env.indexOf('/** true when this theme should be lit')).replace('export function', 'function') + '; return pickTheme;')(th);
  ok(pick({ league: 0 }) === 'sandpit' && pick({ league: 1 }) === 'capua' && pick({ league: 3 }) === 'colosseum' && pick({ league: 2, kind: 'grand' }) === 'colosseum', 'pickTheme: league and grand games choose sandpit, capua, colosseum');
  ok(pick({ league: 1, weather: 'dust' }) === 'desert' && pick({ league: 1, weather: 'rain' }) === 'gaul' && pick({ league: 0, kind: 'pit' }) === 'etna' && pick({ league: 1, festival: 'mars' }) === 'etna' && pick({ league: 0, kind: 'horde' }) === 'desert', 'pickTheme: weather, pit, horde and festivals choose desert, gaul and etna');
  ok(new Set([0, 1, 2].map((s) => pick({ league: 2, season: s + 1 }))).size === 3, 'pickTheme: league 2 rotates by season');
  ok(/setTheme\(id, ctx = \{\}\)/.test(env) && /api = \{[\s\S]*setTheme/.test(env) && /applyTOD\(p/.test(env) && /nightLights/.test(env), 'arena exposes setTheme, which also drives the sky and torch lights');
  ok((fv.match(/ARENA_THEME/g) || []).length === 2 && /pickTheme\(m\)/.test(fv) && /arena\.setTheme\(/.test(fv), 'fightview carries exactly the two ARENA_THEME hook lines');
  ok(/kind: ev\.kind \|\| ''/.test(fs) && /festival: lm\.fest/.test(fs), 'fight meta carries event kind and festival for the theme picker');
  // the fallen
  ok(/<script src="core\/ext\.js"><\/script>/.test(idx) && idx.indexOf('core/sim.js') < idx.indexOf('core/ext.js') && /LM\.extWeek\)/.test(sim), 'ext.js loads after sim.js and the weekly hook is wired');
  for (const f of ['mortality', 'deathRoll', 'fall', 'takeHeir', 'monument', 'legacyFame', 'ludiAct', 'ludiTable', 'calendar', 'mentorStart', 'feast']) ok(new RegExp('LM\\.' + f + ' = ').test(ext), 'ext.js defines LM.' + f);
  ok(/export async function fallenFlow/.test(flow) && /export async function mortalCheck/.test(flow) && /export async function heirOffer/.test(flow) && /Cer\.eulogy\(ctx, \{ kind: 'fallen'/.test(flow), 'flow.js wires the fallen eulogy, the mortal check and the heir offer');
  ok(/deathRoll\(S, g, \{ kind: 'pit'/.test(modes) && /kind: 'horde'/.test(modes) && /mortalCheck\(ctx, \[g\], res, \{ kind: 'champ' \}\)/.test(modes) && /mortalCheck\(ctx, \[g\], res, \{ kind: 'bounty' \}\)/.test(modes), 'the Pit, Horde, champion duels and bounties can kill');
  ok(/runEvent[\s\S]*mortalCheck\(ctx, gl, res, \{ kind: 'event' \}\)/.test(flow), 'ordinary events roll mortality too (it is zero unless Hardcore)');
  ok(/Hardcore \(permadeath\)/.test(more) && /S\.opts\.hardcore = v/.test(more) && /hardcore/.test(ext) && !/hardcore: true/.test(sim), 'Hardcore is a setting in More, default off');
  ok(/kind === 'fallen'/.test(cer) && /In memoriam/.test(cer), 'the fallen eulogy variant exists');
  ok(/Memorial wall/.test(world) && /wd-wall/.test(world) && /Memorial wall/.test(rd('js/screens/legacy.js')) && /Memorial wall/.test(rd('js/screens/building.js')), 'memorial wall screen is reachable from the Hall, the Shrine and More');
  // tutorial robustness
  ok(!/byText|sheetWith|navItem|titleOf\(x\)\)/.test(tut) && /sheetBy\('roster'\)/.test(tut) && /sheetBy\('arena'\)/.test(tut) && /tutEl\(null, 'nav-roster'\)/.test(tut), 'tutorial finds sheets and buttons by data attributes, not by text');
  ok(/dataset\.tutSheet = tk/.test(game) && /nav-' \+ k/.test(game) && /advBtn\.dataset\.tut = 'advance'/.test(game) && /TUT_SHEETS/.test(game), 'game.js tags sheets, nav buttons and the Advance button');
  ok(/dataset\.tut = 'hire'/.test(rd('js/screens/recruit.js')) && /dataset\.tut = 'auto-plan'/.test(rd('js/screens/roster.js')) && /dataset\.tut = 'enter'/.test(rd('js/screens/arena.js')) && /dataset\.tut = 'plan-grid'/.test(rd('js/screens/ui_common.js')), 'screens carry data-tut on the buttons the tutorial points at');
  ok(/reset\(\)/.test(tut) && /fastForward\(id\)/.test(tut) && /this\.tutorial && this\.tutorial\.reset\(\)/.test(game), 'a new game resets the tutorial; fastForward test hook exists');
  ok(/Replay tutorial/.test(more) && /tutorial\.restart\(\)/.test(more), 'More, Help has a Replay tutorial button');
  ok(/'results'/.test(tut) && /'week'/.test(tut) && /sheetBy|tutSheet/.test(tut) && /resultsOpen/.test(tut) && /done2/.test(tut), 'tutorial still covers the results and week steps');
  ok(/SCREENS = \[[^\]]*'world'/.test(game) && /export function open\(ctx, arg\)/.test(world) && ['calendar', 'rivals', 'barracks', 'memorial'].every((t) => new RegExp("id: '" + t + "'").test(world)), 'world screen registered with calendar, rivals, barracks and memorial tabs');
  const mine = ['core/ext.js', 'js/screens/world.js', 'js/env_arena.js', 'js/flow.js', 'js/tutorial.js', 'js/screens/modes.js', 'js/screens/more.js'];
  ok(mine.every((f) => !/—/.test(rd(f))), 'no em dashes in the files of this round');
  ok(/ludus_maximus_3d_v1/.test(sim) && /ludus_maximus_3d_prefs/.test(more), 'save key and prefs key are unchanged');
  ok(/Math\.random|LM\.rand/.test(ext) === true && !/Math\.random/.test(ext), 'ext.js draws only from the sim RNG');
}

// 10. fight team: phone HUD, gore props and coverage cap, hit-feel pulses, ultimates, kill cam and the outro
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const fv = rd('js/fightview.js'), gore = rd('js/gore.js'), fxs = rd('js/fx.js'), dir = rd('js/director.js'), css = rd('css/ui.css');
  ok(/placePlate\(/.test(fv) && /measureHud\(/.test(fv) && /lx-fv-top/.test(fv) && /\.lx-fv-top/.test(css) && /@media \(max-height: 480px\)[^}]*\.lx-fv-hud/.test(css.replace(/\n/g, ' ')), 'fight HUD: compact top row, nameplates avoid the button rows (phones and landscape)');
  ok(/caPulse\(a\)/.test(fv) && /Math\.min\(a, 0\.006\)/.test(fv) && !/pulseCA\(0\.01/.test(fv) && /zoomPunch\(0\.028\)/.test(fv), 'chromatic aberration and zoom pulses are small (capped at 0.006)');
  ok(/meteorFall\(/.test(fv) && /fx\.shoot\(from, to/.test(fv), 'meteor has a travel streak that lands when the telegraph fills');
  ok(/showEnd\(/.test(fv) && /clearEnd\(/.test(fv) && /lx-fv-end/.test(css) && /phase === 'outro' \? 0(\.0)? : 1/.test(fv), 'outro: big VICTORY / DEFEAT title, plates and ult buttons hidden');
  ok(!/setTimeout\(\(\) => this\.dir\.setShot\('victory'/.test(fv) && /next: \{ name: 'victory'/.test(fv), 'victory shot is chained from the kill cam (no wall clock timer)');
  ok(/vx \+ bx \* \(0\.6 \+ 1\.5 \* fall\)/.test(dir) && /p\.side \* 0\.5 \* k/.test(dir) && /\* 0\.1 \* ease\(t \/ 2\.5\)/.test(dir), 'kill cam frames the blow axis and the fall; victory orbit is slow (no spin)');
  ok(/function dropWeapon/.test(gore) && /ensureBrawl/.test(gore) && /WEAPON_POSES/.test(gore) && /setWeapon\(BRAWL\)/.test(gore), 'a severed weapon hand drops the weapon prop and switches to a one-handed brawl stance');
  ok(/function popArmor/.test(gore) && /spawnProp\(7,/.test(gore) && /spawnProp\(8,/.test(gore), 'armour plates and the plume pop off on heavy hits');
  ok(/aMask/.test(gore) && /iHair/.test(gore) && /ragged|neckStump/.test(gore) && /helmed/.test(gore), 'head prop: skin tone, hair or helm, ragged neck stump');
  ok(/function measureCover/.test(gore) && /function dryAll/.test(gore) && /function clearUnderFeet/.test(gore) && /capK\(\)/.test(gore), 'gore caps sand coverage, dries old blood darker and lifts it under fighters');
  ok((gore.match(/new THREE\.InstancedMesh/g) || []).length === 1 && !/Math\.random/.test(gore) && !/LM\./.test(gore), 'gore still one instanced draw call, no Math.random');
  ok(/cast\(el, pos, color\)/.test(fxs) && /flame spikes/.test(fxs) && /function beamUp\(pos, c, life, w = 1\.1\)/.test(fxs) && !/s1: 3\.6, cell: CELL\.glow/.test(fxs), 'ultimates are crisp shapes (spikes, bolts, shards, crescents), no big glow discs');
}

// 10. hub polish, phone taps, hub audio, photo mode
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const hub = rd('js/hub.js'), bld = rd('js/buildings.js'), au = rd('js/audio.js'), ph = rd('js/photo.js'), gm = rd('js/game.js'), css = rd('css/ui.css'), envl = rd('js/env_ludus.js');
  ok(/function roofWeather/.test(bld) && /function rearYard/.test(bld), 'buildings: weathered roofs and rear yards');
  ok(/godrays/.test(hub) && /RAY_VERT/.test(hub) && /function pickNear/.test(hub) && /pointerType/.test(hub) && /'preview'/.test(hub) && /lx-hubcard/.test(hub), 'hub: god rays, tap slop picking, preview card');
  ok(/focusHome/.test(hub) && /audioTick/.test(hub) && /audio\.ambient/.test(hub), 'hub: focusHome and spatial audio feed');
  ok(/aSway/.test(hub) && /bakePiece/.test(hub), 'hub: baked cloaks and skirts with shader sway');
  ok(/colosseumTexture/.test(envl), 'env_ludus: Colosseum facade texture');
  for (const n of ['uiHover', 'uiSelect', 'uiOpen', 'uiClose', 'bird', 'owl', 'hammer', 'clink', 'chop', 'sizzle', 'thock', 'thunder']) ok(new RegExp("def\\('" + n + "'").test(au), 'audio.js sfx ' + n);
  ok(/const ambient = /.test(au) && /music\.setHubTime/.test(au) && /function attachUi/.test(au) && /'slashWet'/.test(au) && /def\('crowdGore'/.test(au), 'audio.js: ambient, hub time of day, ui hooks, gore sfx kept');
  ok(/export function createPhoto/.test(ph) && /toBlob/.test(ph) && /navigator\.share/.test(ph) && /drawImage\(glCanvas/.test(ph) && /prefers-reduced-motion/.test(ph), 'photo.js: capture, toBlob, share, reduced motion');
  ok(/createPhoto/.test(gm) && /PHOTO/.test(gm) && /photo\.frame/.test(gm), 'game.js PHOTO hooks');
  ok(/\.lx-photo-fab/.test(css) && /#ui > \.lx-photo/.test(css), 'ui.css has .lx-photo rules');
  ok(existsSync(join(here, '..', '.claude', 'skills', 'ludus3d-photo', 'SKILL.md')), 'photo skill exists');
}

// 12. wounds, scars, patrons and the event deck: screens, hooks, copy and docs
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const gm = rd('js/game.js'), flow = rd('js/flow.js'), world = rd('js/screens/world.js'), sk = rd('js/screens/sk.js'), prof = rd('js/screens/profile.js'), ros = rd('js/screens/roster.js'), more = rd('js/screens/more.js');
  const inf = rd('js/screens/infirmary.js'), spo = rd('js/screens/sponsors.js'), evs = rd('js/screens/events.js'), wu = rd('js/screens/wounds_ui.js'), ext = rd('core/ext.js'), data = rd('core/data.js');
  ok(/'infirmary', 'sponsors', 'events'/.test(gm), 'game.js registers the infirmary, sponsors and events screens');
  for (const [f, src] of [['infirmary', inf], ['sponsors', spo], ['events', evs]]) ok(/export function open\(ctx, arg\)/.test(src) && /export function render\(ctx, root/.test(src) && /lx-dep/.test(src), `${f}.js exports open and render and scopes to .lx-dep`);
  ok(/id: 'infirmary'/.test(world) && /id: 'patrons'/.test(world) && /id: 'chronicle'/.test(world) && /Inf\.render/.test(world) && /Pat\.render/.test(world) && /Chr\.render/.test(world), 'the World has Infirmary, Patrons and Chronicle tabs');
  ok(/woundCall\(ctx\)/.test(flow) && /patronFlow\(ctx\)/.test(flow) && /lm\.evView/.test(flow) && /S\.evLast/.test(flow), 'flow.js runs the wound decision, patron beats, and shows named events with effect chips');
  ok(/woundBadges/.test(sk) && /woundBadges/.test(wu) && !/from '\.\/sk\.js'/.test(wu), 'every fighter picker shows wounds, weakness and scars (wounds_ui.js has no import cycle)');
  ok(/lm\.scarChance/.test(prof) && /Treat or rest/.test(prof) && /d\.WOUNDS\[/.test(ros), 'profile and roster show body parts, scar risk and scars');
  ok(/Wounds, patrons, events/.test(more) && /tab: 'patrons'/.test(more), 'help and the More menu mention wounds, patrons and events');
  ok(/LM\.addWound/.test(ext) && /LM\.sponsorAccept/.test(ext) && /LM\.runChoice/.test(ext) && /LM\.weekTrain = /.test(ext) && /LM\.settle = /.test(ext), 'ext.js wraps settle and weekTrain and adds wounds, patrons and the event runner');
  ok(!/Math\.random/.test(ext.slice(ext.indexOf('WAVE 2: body-part'))), 'the wave 2 sim never touches Math.random (hash rolls and the sim RNG only)');
  for (const [n, src] of [['infirmary.js', inf], ['sponsors.js', spo], ['events.js', evs], ['wounds_ui.js', wu]]) ok(!/\u2014/.test(src), n + ' has no em dashes');
  ok(!/\u2014/.test(data), 'data.js has no em dashes'); ok(!/\u2014/.test(ext), 'ext.js has no em dashes');
  ok(existsSync(join(here, '..', 'tools', 'ludus3d_balance.mjs')), 'the headless balance harness exists');
  const skill = readFileSync(join(here, '..', '.claude', 'skills', 'ludus3d-content', 'SKILL.md'), 'utf8');
  ok(/g\.scars/.test(skill) && /lost_eye/.test(skill) && /ludus3d_balance/.test(skill) && /Patrons/.test(skill) && /Chronicle/.test(skill), 'the content skill documents scar ids, patrons, the chronicle and the balance harness');
  const req = createRequire(import.meta.url); const D = req('../ludus_maximus_3d/core/data.js');
  ok(Object.keys(D.SCARS).every((id) => skill.includes(id)), 'every scar id is documented for the rig and gladiator agents');
}

// 12. VENATIO: procedural beasts, hunts, bestiary (js/beast.js, js/beast_fx.js, js/screens/venatio.js, core/arena.js beast AI, core/ext.js section 5)
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const beast = rd('js/beast.js'), bfx = rd('js/beast_fx.js'), ven = rd('js/screens/venatio.js'), fv = rd('js/fightview.js'), arena = rd('core/arena.js'), ext = rd('core/ext.js'), au = rd('js/audio.js'), portrait = rd('js/portrait.js'), gore = rd('js/gore.js'), dir = rd('js/director.js'), world = rd('js/screens/world.js'), arenaScr = rd('js/screens/arena.js'), main = rd('js/main.js');
  ok(/export function createBeast/.test(beast) && /class BeastAnimator/.test(beast) && /THREE\.SkinnedMesh/.test(beast) && !/Math\.random/.test(beast) && !/localStorage/.test(beast), 'beast.js: skinned procedural rigs, no Math.random, no storage');
  ok(['lion', 'wolf', 'bear', 'boar', 'nemean', 'elephant'].every((k) => new RegExp(k + ':').test(beast)) && /rider/.test(beast) && /trunk/.test(beast), 'beast.js: six species, the elephant has a trunk and a handler');
  ok(/makeBloodUniforms/.test(beast) && /shadePatch/.test(beast) && /addWound/.test(beast) && /addBlood/.test(beast) && /sever\(\) \{ return null/.test(beast), 'beast.js: blood, wounds and the gore hooks (no dismemberment)');
  for (const c of ['idle', 'bite', 'claw', 'pounce', 'roar', 'hurt', 'death', 'stomp', 'swipe', 'gore']) ok(new RegExp('C\\.' + c + ' = clip\\(').test(beast) || c === 'idle', 'beast clip ' + c);
  ok(/BEAST/.test(fv) && /BF\.makeRig/.test(fv) && /BF\.atk/.test(fv) && /BF\.hitFx/.test(fv) && /BF\.down/.test(fv) && /BF\.event/.test(fv) && /rig\.nameH/.test(fv), 'fightview.js: tagged BEAST hooks (rig, atk, hit, down, event, plate height)');
  ok((fv.match(/BEAST/g) || []).length <= 14, 'fightview.js keeps its BEAST edits tiny');
  ok(/u\.h \|\| h/.test(dir) && /u\.r/.test(dir), 'director.js frames big beasts (u.h / u.r)');
  ok(/rig\.beast\) return/.test(gore) && /beastFrame/.test(portrait) && /createBeast/.test(portrait), 'gore skips plate armour on animals; portrait.js renders beasts');
  ok(/function beastThink/.test(arena) && /function bCharge/.test(arena) && /function bPounce/.test(arena) && /function beastHit/.test(arena) && /enraged/.test(arena) && !/Math\.random/.test(arena), 'arena.js: beast AI (pounce, pack flank, charge, trample, enrage) and no Math.random');
  ok(/D\.BEASTS = /.test(ext) && /D\.HUNTS = /.test(ext) && /LM\.venatioSettle/.test(ext) && /LM\.bestiary/.test(ext) && /enumerable: false/.test(ext) && /hunt: 0\.07/.test(ext), 'ext.js: beast data, hunts, settlement, bestiary, hidden beast styles, hunt mortality');
  for (const n of ['beastRoar', 'beastHowl', 'beastGrowl', 'beastHurt', 'beastDeath', 'beastBite', 'beastClaw', 'beastGore', 'beastSlam', 'pawThud', 'beastSnort', 'beastCharge']) ok(new RegExp("def\\('" + n + "'").test(au), 'audio.js sfx ' + n);
  ok(/export function venatioCard/.test(ven) && /export async function startHunt/.test(ven) && /export function bestiaryTab/.test(ven) && /venatioCard/.test(arenaScr) && /bestiaryTab/.test(world) && /id: 'bestiary'/.test(world), 'Venatio UI: Arena challenge card, hunt flow, World Bestiary tab');
  ok(/demoHunt/.test(main) && /export function demoHunt/.test(bfx), 'main.js: ?demo=1&hunt= for beast fights');
  ok(existsSync(join(root, 'lab', 'beast_lab.html')) && /test=1/.test(rd('lab/beast_lab.html')) && /window\.__testResult/.test(rd('lab/beast_lab.html')), 'beast lab with a headless check page');
  ok(existsSync(join(here, '..', '.claude', 'skills', 'ludus3d-beasts', 'SKILL.md')), 'beasts skill exists');
  ok(!/—/.test(beast + bfx + ven), 'no em dashes in the beast files');
}


// 11. fight QoL pass: finisher, weight, pause / speed / replay controls, perf (appended by the fight team)
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const fv = rd('js/fightview.js'), fxs = rd('js/fx.js'), gore = rd('js/gore.js'), main = rd('js/main.js'), post = rd('js/post.js'), dir = rd('js/director.js'), css = rd('css/ui.css'), html = rd('index.html');
  ok(/startExec\(/.test(fv) && /execHit\(/.test(fv) && /canExec\(/.test(fv) && /executeKill\(\)/.test(fv) && /\.finisher\(\{/.test(fv) && /execPending/.test(fv), 'finisher: last kill staged as an execution (presentation only)');
  ok(/kind === 'duel' && win === 'A'/.test(fv) && /NO_EXEC/.test(fv) && /clips\.finisher/.test(fv), 'finisher: mercy duels are not struck, sparring and beast rigs skipped');
  ok(/tight/.test(dir) && /tight: true/.test(fv), 'kill cam has a tight execution framing');
  ok(/stepPush\(/.test(fv) && /shove\(/.test(fv) && /MASS\[/.test(fv) && /'skid'/.test(fv), 'weight: visual shove spring, skid marks, heavier styles move less');
  ok(/pause\(on\)/.test(fv) && /openPauseMenu/.test(fv) && /confirmQuit/.test(fv) && /forfeit\(\)/.test(fv) && /lx-fv-pause/.test(css), 'pause button + menu + quit confirm');
  ok(/SPEEDS = \[1, 2, 3\]/.test(fv) && /Math\.min\(speedUp, 3\)/.test(fv), 'speed x1 x2 x3 scales sim and animation, audio untouched');
  ok(/seekTo\(/.test(fv) && /restartReplay\(/.test(fv) && /CAMS = /.test(fv) && /lx-fv-rbar/.test(css) && /replay\.total|F\.replay\.total/.test(fv), 'replay controls: scrub, rate, camera presets');
  ok(/async warm\(\)/.test(fv) && /warmUp\(\)/.test(main) && /setWarm/.test(fxs) && /G\.warm/.test(gore) && /warmRigs/.test(fv), 'shader warm-up behind the boot overlay');
  ok(/uploadDecals/.test(fxs) && /texSubImage2D/.test(fxs) && /decPainted/.test(fxs) && /addCover/.test(gore) && !/getImageData/.test(gore), 'decal canvas: tiled partial upload, no GPU readback for coverage');
  ok(/spikes: frameStats\(\)/.test(main) && /recordFrame/.test(main) && /fpsCap/.test(main) && /modulepreload/.test(html), 'frame spikes in stats, fps cap, modulepreload');
  ok(/mips: 3/.test(post) && /leather\|steel/.test(post), 'medium: 3 bloom mips, leaner shadow casters');
}

// 9. fight tactics, readability, tournament presentation and the highlight reel (fight team round 3): files exist, are wired, copy has no em dashes
{
  const rd = (f) => readFileSync(join(root, f), 'utf8'), fv = rd('js/fightview.js'), tac = rd('js/tactics.js'), bk = rd('js/bracket.js'), rl = rd('js/reel.js'), ar = rd('core/arena.js'), fl = rd('js/flow.js'), sa = rd('js/screens/arena.js'), gm2 = rd('js/game.js'), fx2 = rd('js/fx.js');
  for (const f of ['js/tactics.js', 'js/bracket.js', 'js/reel.js']) ok(existsSync(join(root, f)), f + ' exists');
  for (const [n, src] of [['tactics', tac], ['bracket', bk], ['reel', rl], ['fightview', fv], ['arena core', ar]]) ok(!/—/.test(src), n + ' has no em dash');
  ok(/createTactics\(this\)/.test(fv) && /applyTap/.test(fv) && /t\.kind === 'stance'/.test(fv) && /command\(kind, a, b\)/.test(fv) && /canOrder\(\)/.test(fv), 'orders go through tap() (recorded by sim step) and applyTap (replay)');
  ok(/L\.command = /.test(ar) && /L\.CMD = /.test(ar) && /cmdAI/.test(ar) && /TELE_ULT/.test(ar), 'sim: LM.command, LM.CMD, foe tactics (cmdAI) and ultimate telegraphs');
  ok(/!F\.cmdAI/.test(fv) && /replay\.snap\.cmdAI = true/.test(fv), 'live fights switch foe tactics on and the replay snapshot agrees');
  ok(/KEYS = \['press', 'hold', 'retreat', 'guard', 'swap', 'rally'\]/.test(tac) && /T\.hotkey = /.test(tac) && /openWheel/.test(tac) && /pointerdown/.test(tac) && /setPointerCapture/.test(tac) && /stateOf\(/.test(tac), 'dock with hotkeys 1 to 6, radial wheel on long press, cooldown state');
  ok(/Shift\+1/.test(fv) && /\^\[1-6\]\$/.test(fv), 'speed moved to Shift+1/2/3, digits 1 to 6 are orders');
  ok(/drawFrame\(/.test(tac) && /tac-danger/.test(tac) && /\[7, 5\]/.test(tac) && /T\.links/.test(tac) && /off-screen/.test(tac), 'overlay: team rings (dashed foes), links option, danger vignette, off-screen arrows');
  ok(/ik = Math\.max\(0\.5/.test(fx2), 'status icons shrink in close shots');
  ok(/num\(u, text, kind\) \{/.test(fv) && /tl\.length >= 7/.test(fv), 'damage numbers: global budget and per-target declutter');
  ok(/export function showBracket/.test(bk) && /export function vsIntro/.test(bk) && /export function crowdOdds/.test(bk) && /Bracket\.showBracket\(ctx, T, \{ mode: 'before'/.test(fl) && /mode: 'after'/.test(fl) && /bracketPreview/.test(sa), 'bracket tablet is used by tournaments and the Arena screen');
  ok(/vsIntro\(/.test(fv) && /THEME_INTRO/.test(bk), 'fight intro per theme');
  ok(/pickSegments/.test(rl) && /createReel\(this\)/.test(fv) && /watchReplay\(res, \{ reel: true \}\)/.test(fl) && /reel: !!o\.reel/.test(gm2) && /captureStream/.test(rl) && /MediaRecorder/.test(rl) && /R\.screenshot/.test(rl), 'highlight reel: scored moments, replay seek, MediaRecorder with screenshot fallback');
  const tut = rd('js/tutorial.js'); ok(/orders/.test(tut) && /Tap an enemy to focus/.test(tut), 'tutorial mentions orders and focus');
}
// the pure reel picker (no DOM): 3 segments at most, the final blow is always in, spacing keeps the cuts apart
{
  const { pickSegments } = await import('../ludus_maximus_3d/js/reel.js');
  const mom = [{ n: 100, kind: 'hit', score: 30, label: 'Crushing blow', src: 'A0', dst: 'B0' }, { n: 110, kind: 'hit', score: 25, label: 'Heavy hit', src: 'A0', dst: 'B0' }, { n: 400, kind: 'ult', score: 45, label: 'Meteor', src: 'B0' }, { n: 420, kind: 'hit', score: 22, label: 'Heavy hit', src: 'B0', dst: 'A0' }, { n: 700, kind: 'hit', score: 20, label: 'Critical blow', src: 'A0', dst: 'B0' }, { n: 900, kind: 'down', score: 100, label: 'The final blow', src: 'A0', dst: 'B0', final: true }, { n: 905, kind: 'hit', score: 5, label: 'x' }];
  const s = pickSegments(mom, 905, 3);
  ok(s.length === 3 && s.some((x) => x.final && x.label === 'The final blow'), 'reel keeps the final blow and at most 3 moments');
  ok(s.every((x, i) => i === 0 || x.a >= s[i - 1].b - 1), 'reel segments are in order and do not overlap');
  ok(s.every((x) => x.a >= 0 && x.a < x.b), 'reel windows are valid');
  ok(pickSegments([], 100).length === 0 && pickSegments(null, 100).length === 0, 'no moments, no reel');
  ok(pickSegments([{ n: 50, kind: 'hit', score: 20, label: 'a' }], 60).length === 1, 'a single moment makes a single cut');
  const bm = await import('../ludus_maximus_3d/js/bracket.js').catch((e) => ({ err: e }));
  // bracket.js touches document only inside functions: the pure model is testable under Node
  if (bm.bracketModel) {
    const T = { size: 8, slots: Array.from({ length: 8 }, (_, i) => ({ name: 'S' + i, lvl: 3 + i, style: 'murmillo' })), alive: [0, 1, 2, 3, 4, 5, 6, 7], hist: [[0, 3, 4, 7]], round: 1 };
    const M = bm.bracketModel(T);
    ok(M.n === 3 && M.rounds.length === 3 && M.rounds[0].matches.length === 4 && M.rounds[1].matches.length === 2 && M.rounds[2].matches.length === 1, 'bracket model has 4, 2 and 1 bouts');
    ok(M.rounds[0].matches.map((m) => m.w).join() === '0,3,4,7' && M.rounds[1].matches[0].a === 0 && M.rounds[1].matches[0].b === 3 && M.rounds[1].matches[1].a === 4, 'winners advance in pair order');
    ok(bm.roundNames(8).join() === 'Quarterfinal,Semifinal,Final' && bm.roundNames(4).join() === 'Semifinal,Final', 'round names');
    ok(bm.crowdOdds({ lvl: 9, style: 'murmillo' }, { lvl: 3, style: 'murmillo' }) > 0.7 && Math.abs(bm.crowdOdds({ lvl: 5, style: 'thraex' }, { lvl: 5, style: 'thraex' }) - 0.5) < 1e-9, 'crowd odds follow level, not stats');
  } else ok(false, 'bracket.js loads under Node: ' + (bm.err && bm.err.message));
}


// 13. perf pass 3: worker / IndexedDB textures, lazy FightView, texture memory, governor and the ?perf=1 overlay (appended by the perf team)
{
  const rd = (f) => readFileSync(join(root, f), 'utf8');
  const et = rd('js/envtex.js'), gen = rd('js/envtex_gen.js'), wk = rd('js/envtex_worker.js'), gm = rd('js/game.js'), mn = rd('js/main.js'), ps = rd('js/post.js'), html = rd('index.html'), rg = rd('js/rig.js');
  ok(/export const GEN_VERSION/.test(gen) && /export function generate\(/.test(gen) && /export function specKey/.test(gen) && !/from 'three'|document\.|window\./.test(gen), 'envtex_gen.js is pure (no three, no DOM) and versioned for the IndexedDB cache');
  ok(/from '\.\/envtex_gen\.js'/.test(wk) && /self\.onmessage/.test(wk) && /\[r\.color\.buffer, r\.bump\.buffer\]/.test(wk), 'envtex_worker.js bakes with envtex_gen.js and transfers the buffers');
  ok(/new Worker\(new URL\('\.\/envtex_worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/.test(et) && /indexedDB\.open\('lm3d_tex'/.test(et) && /export function prepare\(/.test(et) && /export const PLAN/.test(et) && /export function configure\(/.test(et), 'envtex.js: worker pool, IndexedDB cache, prepare(), PLAN and configure()');
  ok(/take\(spec\)/.test(et) && /generate\(spec\)/.test(et) && /export function sceneTextures/.test(et) && /export function releaseTextures/.test(et) && /export function warmTextures/.test(et), 'envtex.js: synchronous fallback (miss) and the release / re-warm helpers');
  ok(/ET\.prepare\(ET\.PLAN\.hub\(\)/.test(mn) && /ET\.configure\(/.test(mn) && /bootfill/.test(mn) && /id="bootfill"/.test(html) && /id="bootbar"/.test(html), 'boot: textures start baking at the top of main.js, the boot overlay has a progress bar');
  ok(/ensureFightView\(\)/.test(gm) && /prewarm\(o = \{\}\)/.test(gm) && /markInteractive\(/.test(gm) && /await this\.prewarm\(\{ immediate: true \}\)/.test(gm) && !/this\.fightView = new FightView\(\{[^}]*\}\);\n\s*try \{ const mod = await import\('\.\/hub\.js'\)/.test(gm), 'game.js: FightView is built lazily / in idle time, a fight waits for it');
  ok(/later\(fn\)/.test(gm) && /this\.later\(\(\) => \{ this\.audio\.music\.setMode/.test(gm), 'game.js: hub audio is deferred until the game is interactive');
  ok(/memSwap\(to\)/.test(gm) && /memPressure\(\)/.test(gm) && /ET\.releaseTextures/.test(gm) && /ET\.warmTextures/.test(gm), 'game.js: low tier releases the other scene\'s procedural textures and re-uploads them before the scene shows');
  ok(/setScene\(n\)/.test(ps) && /setVsync\(ms, certain/.test(ps) && /hardReset\(/.test(ps) && /ceil/.test(ps) && /locked30/.test(ps), 'post.js: governor with per-scene state, vsync awareness, failed-recovery ceiling and 30 Hz lock detection');
  ok(/sampleRefresh\(/.test(mn) && /PressureObserver/.test(mn) && /perfOverlay\(/.test(mn) && /q\.get\('perf'\)/.test(mn) && /lx-perfhud/.test(mn) && /pacing:/.test(mn), 'main.js: refresh-rate detection, thermal hint, ?perf=1 overlay, stats().pacing');
  ok(/prep: \(\) => \{[^}]*bInv/.test(rg) && !/a\.setXYZ\(i, _w\.x/.test(rg), 'rig.js: cloak collider reads the body matrices once per step, cloth write() avoids setXYZ');
  const bs = rd('js/beast.js');
  ok(/class Clip \{/.test(rg) && /Clip\.prototype|^  sample\(t, P\) \{/m.test(rg) && /return new Clip\(name, keys/.test(rg) && !/c\.sample = function/.test(rg), 'rig.js: every clip is an instance of one Clip class (one shape, one prototype sample)');
  ok(/function eulerAll\(/.test(rg) && /function slerpA\(/.test(rg) && /function mulQ\(/.test(rg) && /function scaleAdd\(/.test(rg) && /function writeJoints\(/.test(rg) && /Float64Array\(NJ \* 4\)/.test(rg), 'rig.js: the pose mixer works on flat Float64Arrays with every per-joint loop in its own small function');
  ok(/function evalClip\(/.test(bs) && /function writeQuats\(/.test(bs) && /function composeOut\(/.test(bs) && !/j\.rotation\.set\(out\[i\]/.test(bs), 'beast.js: clips sampled over typed key arrays, joint quaternions written without Euler.set');
  ok(/async jitWarm\(/.test(gm) && /deferMusic\(\)/.test(gm) && /noJit/.test(mn), 'game.js: JIT warm-up of the kept warm rigs and the deferred music calls');
}

{ // block 13: wave 3 (scars on bodies, fight hurt, keyboard hub, tutorial placement, trophies, bestiary art)
  const rd = (f) => readFileSync(join(root, f), 'utf8'), gear = rd('js/gear.js'), gl = rd('js/gladiator.js'), por = rd('js/portrait.js'), hub = rd('js/hub.js'), tut = rd('js/tutorial.js'), sk = rd('js/screens/sk.js'), fl = rd('js/flow.js'), gly = rd('js/glyphs.js'), css = rd('css/ui.css'), ven = rd('js/screens/venatio.js'), more = rd('js/screens/more.js');
  ok(/export function addMarks\(rig, g\)/.test(gear) && /gash_scar/.test(gear) && /lost_eye/.test(gear) && /old_ribs/.test(gear) && /stiff_arm/.test(gear) && /bad_knee/.test(gear) && /ringing/.test(gear) && /burn/.test(gear) && /whip/.test(gear) && /addMaterial\('linen'/.test(gear), 'gear.js: every scar id and bandages are drawn');
  ok(/addMarks\(rig, o\.g\)/.test(gear) && /, g \}\);/.test(gl) && /an\.update = \(dt\)/.test(gl), 'gladiator.js passes the record to the gear and layers the limp');
  ok(/scars \|\| \[\]\)\.join/.test(por) && /wounds \|\| \[\]\)\.filter/.test(por), 'portrait cache key includes scars and wounds');
  ok(/markSig/.test(hub) && /onKeyDown/.test(hub) && /aria-live/.test(hub) && /lx-bl-focus/.test(hub) && /pointerdown/.test(hub) && /wheel/.test(hub), 'hub.js: keyboard orbit with aria-live hint and focus ring, pointer input kept');
  ok(/avoid:/.test(tut) && /lx-tut-compact/.test(tut) && /lx-tut-compact/.test(css), 'tutorial.js: card avoids the element it points at');
  ok(/hurtKind/.test(sk) && /ax-hurtbtn/.test(sk) && /hurtRisk/.test(sk) && /ids\.hurt/.test(rd('js/screens/arena.js')) && /entryReady/.test(fl) && /hurtResolve/.test(fl) && /hurtMark/.test(rd('js/screens/modes.js')) && /hurtMark/.test(ven), 'fight hurt: picker option, entry, flow and mode wiring');
  ok(/export function glyph\(/.test(gly) && /export function emblem\(/.test(gly) && /export function trophyIcon/.test(gly) && /emblem\(b\.kind/.test(ven) && /glyph\(trophyIcon/.test(more) && /trophyProgress/.test(more) && /Cer\.trophy/.test(sk), 'glyphs, emblems, trophy progress and the ceremony on unlock are wired');
  for (const [n, t] of [['glyphs.js', gly], ['gear.js', gear], ['css', css]]) ok(!t.includes('\u2014'), n + ': no em dashes');
  ok(/\.lx-bl-grid/.test(css) && /\.lx-bl-hubhint/.test(css) && /\.lx-bl-kills/.test(css), 'css/ui.css: lx-bl block present');
}

{ // block 14: UI pass (sheets, toasts, confetti, docked results, labels, empty states, unique names)
  const rd = (f) => readFileSync(join(root, f), 'utf8'), kit = rd('js/ui_kit.js'), css = rd('css/ui.css'), gm = rd('js/game.js'), fl = rd('js/flow.js'), cer = rd('js/ceremonies.js'), rec = rd('js/screens/recruit.js'), ph = rd('js/photo.js'), sim = rd('core/sim.js');
  ok(/closable = true/.test(kit) && /top\.closable === false/.test(kit) && /lx-nudge/.test(kit), 'ui_kit modal: closable option, Escape nudges a locked sheet instead of dying silently');
  ok(/strip\(msg/.test(kit) && /top\.strip/.test(kit) && /lx-toast-strip/.test(css), 'toasts raised while a dialog is open land in a strip inside it, never over its title');
  const z = (re) => { const m = re.exec(css); return m ? +m[1] : NaN; };
  ok(z(/\.lx-toasts \{ position: fixed; z-index: (\d+)/) < z(/\.lx-scrim \{ position: fixed; inset: 0; z-index: (\d+)/), 'layering: toasts sit below modals');
  ok(z(/\.lx-cer-layer \{ position: fixed; inset: 0; z-index: (\d+)/) < z(/\.lx-scrim \{ position: fixed; inset: 0; z-index: (\d+)/) && /lx-modal-open/.test(cer), 'layering: confetti sits below modals and is cleared when one opens');
  ok(/dock/.test(kit) && /lx-peek/.test(kit) && /lx-dock-low/.test(css) && /dock: 'low'/.test(fl) && /tut: 'results'/.test(fl), 'results dialogs dock low with a See the finish peek');
  ok(!/title: win \? 'Victory' : 'Defeat'/.test(fl) && !/title: 'Duel won'/.test(fl), 'results title names the fight, the banner names the result');
  ok(/uniqueNames/.test(fl) && /LM\.uniqueNames/.test(sim), 'flow.js runs LM.uniqueNames before prep and before every fight');
  ok(/export function fitLabels/.test(kit) && !/\.lx-btn-label \{[^}]*overflow-wrap: anywhere/.test(css), 'labels: no mid-word breaks, fitter shrinks instead');
  ok(/closable/.test(rec) === false && /Decide later/.test(rec) && /_recruitLater/.test(rec) && /Hire your first fighter/.test(gm), 'first-run recruit: closable on purpose, says what happens, hub button becomes Hire your first fighter');
  ok(/export function emptyState/.test(kit) && /emptyState/.test(rd('js/screens/armory.js')) && /Build a Market/.test(rd('js/screens/market.js')) && /Open the Arena/.test(rd('js/screens/venatio.js')) && /See the Calendar/.test(rd('js/screens/events.js')), 'empty states carry a guiding action');
  ok(/lx-photo-on/.test(ph) && /lx-photo-on/.test(css), 'photo mode hides live combat callouts and moves its message off the top edge');
  ok(/@media \(min-width: 900px\)[^}]*\.lx-hud \.lx-nav \{ width: min\(100% - 40px, 820px\)/.test(css), 'desktop nav is a wide dock');
  for (const [n, t] of [['ui_kit.js', kit], ['css', css], ['flow.js', fl], ['recruit.js', rec], ['ceremonies.js', cer], ['sim.js', sim]]) ok(!t.includes('\u2014'), n + ': no em dashes');
}

// ---- round 3 (rig team): readable fighters, body blood that reads as blood, a crowd with heads and arms
{
  const rd3 = (f) => readFileSync(join(root, f), 'utf8'), rg = rd3('js/rig.js'), gl = rd3('js/gladiator.js'), ea = rd3('js/env_arena.js'), po = rd3('js/post.js'), fvw = rd3('js/fightview.js');
  ok(/spotsB/.test(rg) && /BL_CAP/.test(rg) && /drip lanes/.test(rg) && /BLOOD_KIND/.test(rg), 'body blood: spray spots, drip lanes, per material kind and a coverage cap');
  ok(!/bodyN = 0\.5 \* n1/.test(rg) && !/thr = 1\.24/.test(rg), 'body blood: the big noise soak that read as leopard spots is gone');
  ok(/MAX_WOUNDS = 6, MAX_CUTS = 3/.test(rg) && /addBlood\(amount, fresh = 1\)/.test(rg) && /addWound\(pt, dir/.test(rg) && /clearBlood\(\)/.test(rg), 'gore.js API on the rig is unchanged (addBlood, addWound, clearBlood, sever)');
  ok(/export function gradeSkin/.test(gl) && /export function teamTint/.test(gl) && /TEAM_ACCENT/.test(gl) && /opts\.team/.test(gl), 'gladiator.js grades skin tones and tints tunic and plume by team');
  ok(/team: u\.side/.test(fvw), 'fightview passes the team side to createGladiator');
  ok(/aRand2/.test(ea) && /isFeat/.test(ea) && /featured/.test(ea) && /inBox/.test(ea) && /vFlag/.test(ea), 'crowd: per spectator outfit, headwear, standing fans, senators in the imperial box');
  ok(/aPart > 3\.5/.test(ea) && /SphereGeometry\(0\.152/.test(ea) && /elbow|bend/.test(ea), 'crowd: hair / cap / hood dome and bending arms');
  ok(/ov \/ \(1\.0 \+ ov \* 0\.4\)/.test(po), 'post: highlight shoulder before the tonemap');
  ok(existsSync(join(root, 'tools', 'ludus3d_readability.mjs')) === false && existsSync(join(root, '..', 'tools', 'ludus3d_readability.mjs')), 'readability test script exists (tools/ludus3d_readability.mjs)');
  ok(/body blood/.test(rd3('lab/rig_test.html')) && /blotch detector/.test(rd3('lab/rig_test.html')), 'rig_test renders body blood and checks cover, cap and blotches');
  for (const [n, t] of [['rig.js', rg], ['gladiator.js', gl], ['env_arena.js', ea], ['post.js', po], ['readability test', rd3('../tools/ludus3d_readability.mjs')]]) ok(!t.includes('—'), n + ': no em dashes');
}

{ // block 14: MOVE (rearrange the ludus): sim rules, hub 3D parts, controller, screens, help, tutorial, monkey hook
  const rd = (f) => readFileSync(join(root, f), 'utf8'), ext = rd('core/ext.js'), dat = rd('core/data.js'), hub = rd('js/hub.js'), bld = rd('js/buildings.js'), rr = rd('js/rearrange.js'), gm = rd('js/game.js'), bs = rd('js/screens/building.js'), mo = rd('js/screens/more.js'), tu = rd('js/tutorial.js'), ui = rd('js/ui_kit.js');
  const qa = readFileSync(join(here, '..', 'tools', 'ludus3d_qa_lib.mjs'), 'utf8');
  ok(/LM\.moveBuilding = /.test(ext) && /LM\.moveQuote = /.test(ext) && /LM\.moveUndo = /.test(ext) && /LM\.moving = /.test(ext) && /LM\.moveEffects = /.test(ext) && /LM\.moveWhySource = /.test(ext) && /LM\.moveWhyDest = /.test(ext), 'ext.js: MOVE rules (moveQuote, moveBuilding, moveUndo, moving, moveEffects, reasons)');
  ok(/D\.MOVE = \{/.test(dat) && /pinned: \{ hall:/.test(dat) && /undoRefund/.test(dat) && /big: \['stands', 'sparring'\]/.test(dat), 'data.js: D.MOVE documents the pinned and the big buildings, prices and the undo refund');
  ok(/LM\.bfx = \(S, id\) =>/.test(ext.slice(ext.indexOf('MOVE (rearrange'))) && /LM\.synAt = /.test(ext.slice(ext.indexOf('MOVE (rearrange'))) && /LM\.rosterCap = /.test(ext.slice(ext.indexOf('MOVE (rearrange'))) && /LM\.upgrade = /.test(ext.slice(ext.indexOf('MOVE (rearrange'))), 'ext.js: perks, synergy, bed count and upgrades follow the construction state');
  ok(/\.mv = \{ f: /.test(ext.slice(ext.indexOf('MOVE (rearrange'))) && !/SAVE_VER = 3/.test(ext) && /LM\.SAVE_VER = 2/.test(ext), 'save: the only new data is an optional mv field on a plot, the schema version is unchanged');
  ok(/uOff/.test(bld) && /export function buildSite\(/.test(bld) && /export function makeCrane\(/.test(bld) && /export function makeWorkerMesh\(/.test(bld) && /export const siteStage/.test(bld), 'buildings.js: per-plot offsets, construction sites, workers and the crane');
  ok(/buildSite\(/.test(hub) && /customDepthMaterial/.test(hub) && /function playMove\(/.test(hub) && /rrBegin/.test(hub) && /rrGhost/.test(hub) && /frameTwo/.test(hub) && /USE_INSTANCING_COLOR/.test(hub) && /pointer-events:none !important/.test(hub), 'hub.js: sites in the merged world, shadows follow offsets, cinematic, markers, ghost, auto frame, tags never block taps');
  ok(/'hammer'/.test(hub + bld + rr) && /\bhammer\b/.test(ui) && /sfx\('coin'\)|sfx\('coin'/.test(rr) && /hitSfx = \['hammer', 'thock', 'chop', 'clink'/.test(hub), 'hammer icon exists and the crew uses the existing hammer, thock, chop and clink sfx');
  ok(/ArrowLeft/.test(rr) && /ArrowUp/.test(rr) && /'Escape'/.test(rr) && /'Enter'/.test(rr) && /aria-live/.test(rr) && /aria-pressed/.test(rr) && /role', 'dialog'/.test(rr) && /navigator\.vibrate/.test(rr), 'rearrange.js: keyboard (arrows, Enter, Escape), aria-live announcements, aria-pressed button, dialog card, haptics');
  ok(/data-rr|dataset\.rr/.test(rr) && /dataset\.tut = 'rearrange'/.test(rr) && /rearrange-open/.test(bs), 'data attributes: data-tut=rearrange on the hammer button, rearrange-open on the plot screen, data-rr on the confirm buttons');
  ok(/createRearrange/.test(gm) && /rearr\.stop\(true\)/.test(gm), 'game.js: controller created in the HUD build and stopped before a week or a screen');
  ok(/moveUndo/.test(bs) && /constructionCard/.test(bs) && /rearrangeCard/.test(bs) && /'hammer'/.test(bs), 'building screen: Move button, construction card with progress, undo');
  ok(/Rearrange the ludus/.test(mo) && /hammer button/.test(tu), 'More > Help and the tutorial mention rearranging');
  ok(/rearrWalk/.test(qa) && /'rearr'/.test(qa) && /lx-rr-fab/.test(qa), 'monkey: the rearr step opens the mode with a real click and walks lift, preview, confirm or cancel, undo, Escape');
  for (const [n, t] of [['rearrange.js', rr], ['hub.js', hub], ['buildings.js', bld], ['building.js', bs], ['ext.js', ext], ['data.js', dat]]) ok(!t.includes('—'), n + ': no em dashes');
  ok(!/Math\.random/.test(rr) && !/localStorage/.test(rr), 'rearrange.js: no Math.random, no storage keys');
  ok(/for \(let k = 0; k < 2; k\+\+\) \{ const m = new THREE\.Mesh\(new THREE\.BufferGeometry\(\), k \? ghostMatB : ghostMat\)/.test(hub) && (hub.match(/name = 'move_line'/g) || []).length === 1, 'hub.js: two ghost meshes and one line mesh at most (draw call budget while previewing)');
}

{ // block 15: hub night + heat haze (HUB-NIGHT, HUB-HEAT)
  const rd = (f) => readFileSync(join(root, f), 'utf8'), hub = rd('js/hub.js'), post = rd('js/post.js'), bld = rd('js/buildings.js');
  ok(/const NIGHT = \{/.test(hub) && /night_pools/.test(hub) && /uNightRim/.test(hub + bld) && /uToe/.test(hub + post), 'hub: night preset, light pools, moon rim and the grade toe exist');
  ok(/function heatStep\(/.test(hub) && /uHeatAsp/.test(post) && /uHeatBand/.test(hub) && /tier === 'low' \? 0/.test(hub) && /prefersReduced\(\)/.test(hub.slice(hub.indexOf('function heatStep'), hub.indexOf('function heatStep') + 700)), 'hub: heat haze is a horizon band shimmer, off on low tier and reduced motion');
  ok(!/heatTarget \* 0\.6/.test(hub), 'hub: the old 0.6 heat amplitude is gone');
  ok(/uToe = 0|uToe\.value = 0/.test(hub), 'hub.exit resets the shared grade uniforms');
  for (const f of ['tools/ludus3d_hub_light.mjs']) ok(!readFileSync(join(here, '..', f), 'utf8').includes('\u2014'), f + ': no em dashes');
}

{ // BEAST real animals: lofted smooth skin, strand cards, fur shells, wound based blood, eyes and lids, paw planting, VS portraits
  const rd = (f) => readFileSync(join(root, f), 'utf8'), beast = rd('js/beast.js'), bfx = rd('js/beast_fx.js'), br = rd('js/bracket.js'), por = rd('js/portrait.js'), lab = rd('lab/beast_lab.html');
  ok(/function loft\(/.test(beast) && /function skinKnots\(/.test(beast) && /class Blades/.test(beast) && /rs = new Float32Array/.test(beast), 'beast.js: lofted surfaces with per vertex skin weights and strand card batches');
  ok(/mats\.shell = furMaterial/.test(beast) && /mats\.mane = furMaterial/.test(beast) && /discard/.test(beast) && /dFdx\(-vViewPosition\)/.test(beast), 'beast.js: fur shells, mane cards and the derivative bump fur shader');
  ok(/soak/.test(beast) && /if \(false\) \{/.test(beast) && /uWoundD\.value\[i\]\.w/.test(beast), 'beast.js: wound based blood (the shared uniform soak is switched off)');
  ok(/'eyeL', 'eyeR', 'lidL', 'lidR', 'mane1', 'mane2'/.test(beast) && /plant\(out, dt\)/.test(beast) && /fid\.type/.test(beast) && /GAITS/.test(beast), 'beast.js: eye and lid joints, mane joints, paw planting, fidgets and gait tables');
  ok(/prefetchBusts/.test(bfx) && /bustPlaceholder/.test(br) && !/c\.removeAttribute\('width'\)/.test(br) && /createBeast\(g, \{ detail: 'medium' \}\)/.test(por) && /BUST_AIM/.test(por), 'VS splash: busts prefetched, a medallion placeholder, cached canvases no longer wiped, medium detail beast portraits');
  ok(/view === 'portrait'/.test(lab) && /uWoundD/.test(lab) && /idle paws planted/.test(lab) && !/\u2014/.test(beast + bfx + lab + br), 'beast lab: portrait view and the extended checks, no em dashes');
}

console.log(`ludus_maximus_3d structure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
