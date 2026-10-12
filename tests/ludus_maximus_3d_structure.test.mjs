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

console.log(`ludus_maximus_3d structure: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
