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
  ok(/showEnd\(/.test(fv) && /clearEnd\(/.test(fv) && /lx-fv-end/.test(css) && /phase === 'outro' \? 0\.0/.test(fv), 'outro: big VICTORY / DEFEAT title, plates and ult buttons hidden');
  ok(!/setTimeout\(\(\) => this\.dir\.setShot\('victory'/.test(fv) && /next: \{ name: 'victory'/.test(fv), 'victory shot is chained from the kill cam (no wall clock timer)');
  ok(/vx \+ bx \* \(0\.6 \+ 1\.5 \* fall\)/.test(dir) && /p\.side \* 0\.5 \* k/.test(dir) && /\* 0\.1 \* ease\(t \/ 2\.5\)/.test(dir), 'kill cam frames the blow axis and the fall; victory orbit is slow (no spin)');
  ok(/function dropWeapon/.test(gore) && /ensureBrawl/.test(gore) && /WEAPON_POSES/.test(gore) && /setWeapon\(BRAWL\)/.test(gore), 'a severed weapon hand drops the weapon prop and switches to a one-handed brawl stance');
  ok(/function popArmor/.test(gore) && /spawnProp\(7,/.test(gore) && /spawnProp\(8,/.test(gore), 'armour plates and the plume pop off on heavy hits');
  ok(/aMask/.test(gore) && /iHair/.test(gore) && /ragged|neckStump/.test(gore) && /helmed/.test(gore), 'head prop: skin tone, hair or helm, ragged neck stump');
  ok(/function measureCover/.test(gore) && /function dryAll/.test(gore) && /function clearUnderFeet/.test(gore) && /capK\(\)/.test(gore), 'gore caps sand coverage, dries old blood darker and lifts it under fighters');
  ok((gore.match(/new THREE\.InstancedMesh/g) || []).length === 1 && !/Math\.random/.test(gore) && !/LM\./.test(gore), 'gore still one instanced draw call, no Math.random');
  ok(/cast\(el, pos, color\)/.test(fxs) && /flame spikes/.test(fxs) && /function beamUp\(pos, c, life, w = 1\.1\)/.test(fxs) && !/s1: 3\.6, cell: CELL\.glow/.test(fxs), 'ultimates are crisp shapes (spikes, bolts, shards, crescents), no big glow discs');
}

console.log(`ludus_maximus_3d structure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
