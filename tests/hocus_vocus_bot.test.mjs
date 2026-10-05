// The balance bot (tools/hocus_vocus/bot.mjs and tools/hocus_vocus/bot/*): headless full runs through the real RUN, COMBAT, MAP and META
// scripts. Short and deterministic (a few seconds): fast combat effort, trial 0 and trial 5, all six hero pairs, a few seeds.
//
//   * every run finishes (win or lose) with no exception, no stall and well inside the global step cap;
//   * the same options give byte-identical run records, in this process and through the worker pool, in any job count;
//   * economy and state invariants hold (gold, Vox, HP, deck, Act counters);
//   * the report builder produces sane numbers, flags and both renderings;
//   * the search combat bot loses less HP than COMBAT.greedyPolicy on a fixed set of fights, and plans without seeing the order of its draw pile;
//   * long jobs survive a kill: --stream appends finished runs, --resume skips them, --from rebuilds a report from the file;
//   * the bot source obeys the house rules (no em or en dashes, no unseeded random).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, ROOT } from './hocus_vocus_lib.mjs';
import { loadGame, ALL_PAIRS } from '../tools/hocus_vocus/bot/game.mjs';
import { playRun } from '../tools/hocus_vocus/bot/driver.mjs';
import { runPool, runSerial } from '../tools/hocus_vocus/bot/pool.mjs';
import { buildReport, renderText, renderMarkdown, versusSections } from '../tools/hocus_vocus/bot/report.mjs';
import { createValuer } from '../tools/hocus_vocus/bot/cardval.mjs';
import { createCombatAI } from '../tools/hocus_vocus/bot/combat_ai.mjs';
import { createPolicies } from '../tools/hocus_vocus/bot/policies.mjs';
import { parseArgs, buildTasks, collect, taskKey, recKey } from '../tools/hocus_vocus/bot.mjs';

const t = harness('hocus_vocus bot');
const G = loadGame();
const { DATA, RUN } = G;
const MAX_STEPS = 1500;

const task = (pair, trial, seed, extra) => Object.assign({ heroes: pair, trial, seed, combat: 'greedy', effort: 'fast', maxSteps: MAX_STEPS }, extra || {});

// ------------------------------------------------------------------ completion: all six pairs, trial 0 and 5, several seeds
const tasks = [];
ALL_PAIRS.forEach((pair, pi) => {
  [0, 5].forEach((trial) => tasks.push(task(pair, trial, 100 + pi + 3 * trial)));
  tasks.push(task(pair, 0, 200 + pi));
});
const recs = runSerial(tasks);

t.test('every pair finishes runs at trial 0 and trial 5 without an exception or a stall', () => {
  t.eq(recs.length, tasks.length, 'a record per task');
  recs.forEach((r, i) => {
    const label = `${tasks[i].heroes.join(',')} trial ${tasks[i].trial} seed ${tasks[i].seed}`;
    t.ok(!r.error, `${label}: no exception ${r.error ? r.error.split('\n')[0] : ''}`);
    t.ok(r.result === 'win' || r.result === 'lose', `${label}: finished with win or lose, got ${r.result}`);
    t.ok(r.steps < MAX_STEPS, `${label}: ${r.steps} steps is under the global cap`);
    t.ok(!r.stall, `${label}: no map stall`);
  });
});
t.test('the greedy-combat runs are not all one outcome (the map, draft and combat layers actually play)', () => {
  const wins = recs.filter((r) => r.result === 'win').length;
  const deep = recs.filter((r) => r.chaptersCleared >= 1).length;
  t.ok(deep >= 4, `a good share of the runs clear chapter 1 (${deep} of ${recs.length})`);
  t.ok(wins <= recs.length, 'win count is a count');
  t.ok(recs.some((r) => r.fights.length >= 10), 'some run fights ten or more times');
});

t.test('map walks interrupted by events and shops no longer strand the party (the three-strikes visit cap used to stall these seeds)', () => {
  [[['kuro', 'raiga'], 1529785], [['hanae', 'kuro'], 1063355]].forEach(([pair, seed]) => {
    const r = playRun(G, task(pair, 0, seed));
    t.ok(r.result === 'win' || r.result === 'lose', `${pair.join(',')} seed ${seed}: finished, got ${r.result}`);
    t.ok(!r.stall, `${pair.join(',')} seed ${seed}: no map stall`);
  });
});
t.test('a fresh profile (locked content out of every pool) plays through too', () => {
  const r = playRun(G, task(['suzu', 'raiga'], 0, 77, { unlocked: 'none' }));
  t.ok(!r.error && (r.result === 'win' || r.result === 'lose') && !r.stall, `finished with ${r.result}`);
  const lockedIds = [].concat(r.picks.map((p) => p.picked), r.finalRelics, r.finalGems).filter((id) => id && ((DATA.cards[id] || DATA.relics[id] || DATA.gems[id] || {}).locked));
  t.eq(lockedIds.length, 0, 'no locked card, relic or gem was ever drafted or found');
});

// ------------------------------------------------------------------ determinism
t.test('the same task gives an identical record twice, and through the worker pool', async () => {
  const a = playRun(G, task(['hanae', 'kuro'], 0, 11));
  const b = playRun(G, task(['hanae', 'kuro'], 0, 11));
  t.ok(JSON.stringify(a) === JSON.stringify(b), 'two in-process runs of one task are identical');
  const c = playRun(G, task(['hanae', 'kuro'], 0, 12));
  t.ok(JSON.stringify(a) !== JSON.stringify(c), 'a different seed plays a different run');
  const sub = [task(['suzu', 'raiga'], 0, 21), task(['kuro', 'suzu'], 5, 22), task(['hanae', 'raiga'], 0, 23)];
  const serial = runSerial(sub);
  const pooled = await runPool(sub, 3);
  t.ok(JSON.stringify(serial) === JSON.stringify(pooled), 'worker threads give the same records in the same order as one process');
});
t.test('the search combat bot is deterministic too', () => {
  const x = playRun(G, task(['hanae', 'kuro'], 0, 31, { combat: 'ai', maxSteps: 110 }));
  const y = playRun(G, task(['hanae', 'kuro'], 0, 31, { combat: 'ai', maxSteps: 110 }));
  t.ok(JSON.stringify(x) === JSON.stringify(y), 'two search-bot runs of one task are identical');
  t.ok(x.result === 'win' || x.result === 'lose' || x.result === 'cap', 'it finished or hit the cap, never threw');
});
t.test('the CLI option parser and the task builder are deterministic and shape the work', () => {
  const o = parseArgs(['--runs', '3', '--all-pairs', '--trial', '0,5', '--seed', '9', '--effort', 'fast']);
  const tk = buildTasks(o);
  t.eq(tk.length, 3 * 6 * 2, 'runs x pairs x trials');
  t.deep(buildTasks(o), tk, 'the same options build the same tasks');
  const seeds = new Set(tk.filter((x) => x.trial === 0).map((x) => x.seed));
  t.eq(seeds.size, 18, 'every run of every pair gets its own seed');
  t.deep(tk.filter((x) => x.trial === 5).map((x) => x.seed), tk.filter((x) => x.trial === 0).map((x) => x.seed), 'trials share seeds, so they are paired');
  t.throws(() => parseArgs(['--nonsense']), 'an unknown option is an error', /unknown option/);
});

t.test('a long job streams every finished run to a file, resumes from it and rebuilds the report from it (--stream, --resume, --from)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv_bot_'));
  const file = path.join(dir, 'runs.jsonl');
  const base = ['--pair', 'hanae,kuro', '--pair', 'suzu,raiga', '--combat', 'greedy', '--effort', 'fast', '--seed', '3', '--jobs', '1', '--stream', file, '--quiet'];
  try {
    const o2 = parseArgs(base.concat(['--runs', '2']));
    const first = await collect(o2, () => {});
    const lines = () => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    t.eq(first.recs.length, 4, 'two pairs x two runs');
    t.eq(lines().length, 4, 'every finished run is in the stream file');
    t.ok(first.tasks.every((tk, i) => taskKey(tk) === recKey(first.recs[i])), 'a record carries the identity of the task that made it');
    const again = await collect(parseArgs(base.concat(['--runs', '2', '--resume'])), () => {});
    t.eq(lines().length, 4, 'a resumed job plays nothing that is already in the file');
    t.ok(JSON.stringify(again.recs) === JSON.stringify(first.recs), 'and returns the same records in the same order');
    const more = await collect(parseArgs(base.concat(['--runs', '3', '--resume'])), () => {});
    t.eq(lines().length, 6, 'asking for one more run per pair plays only the two missing runs');
    t.ok(JSON.stringify(more.recs.filter((r) => first.recs.some((x) => recKey(x) === recKey(r)))) === JSON.stringify(first.recs), 'the runs played before come back unchanged');
    fs.appendFileSync(file, '{ truncated line from a killed job');
    const from = await collect(parseArgs(['--from', file, '--pair', 'suzu,raiga']), () => {});
    t.eq(from.recs.length, 3, '--from reads the file (a torn last line is ignored) and --pair selects runs');
    const rep = buildReport(from.recs, G, {});
    t.eq(rep.meta.runs, 3, 'a report can be built from the stored runs alone');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
t.test('the CLI rejects an unknown style, combat player or hero pair instead of silently playing something else', () => {
  t.throws(() => parseArgs(['--style', 'zzz']), 'bad style', /bad --style/);
  t.throws(() => parseArgs(['--combat', 'zzz']), 'bad combat player', /bad --combat/);
  t.throws(() => parseArgs(['--pair', 'hanae,hanae']), 'a pair needs two different heroes', /bad --pair/);
  t.throws(() => parseArgs(['--pair', 'hanae,nobody']), 'a pair needs real heroes', /bad --pair/);
  t.eq(parseArgs(['--style', 'max']).style, 'max', 'the Ink probe style is accepted');
});

t.test('every map style plays a run to the end without a stall (rush, explore and max included)', () => {
  ['rush', 'explore', 'max'].forEach((style, k) => {
    const r = playRun(G, task(['hanae', 'suzu'], 0, 61 + k, { style }));
    t.ok(!r.error && (r.result === 'win' || r.result === 'lose') && !r.stall, `${style}: finished with ${r.result}`);
  });
});

t.test('--pick-bias is parsed, reaches every task and changes the run identity (and the default stays what it was)', () => {
  const o = parseArgs(['--runs', '2', '--pick-bias', '-1.5']);
  t.eq(o.pickBias, -1.5, 'parsed as a number');
  const tk = buildTasks(o);
  t.ok(tk.every((x) => x.pickBias === -1.5), 'every task carries it');
  const base = buildTasks(parseArgs(['--runs', '2']));
  t.ok(base.every((x) => x.pickBias === undefined), 'unset by default, so records made before the knob existed still resume');
  t.ok(taskKey(tk[0]) !== taskKey(base[0]), 'a different bias is a different run');
  t.eq(recKey({ pair: base[0].heroes.join(','), trial: base[0].trial, seed: base[0].seed, combat: base[0].combat, effort: base[0].effort, style: base[0].style, unlocked: base[0].unlocked, draftNoise: base[0].draftNoise }), taskKey(base[0]), 'a record without the field matches an unbiased task');
});

t.test('a worker that dies costs only its own run: the run is an error record, a replacement takes over and the job finishes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv_bot_w_'));
  try {
    const file = path.join(dir, 'dying_worker.mjs');
    // a worker that answers like the real one, except that the task with seed 7 kills the thread
    fs.writeFileSync(file, `import { parentPort } from 'node:worker_threads';\nparentPort.on('message', (m) => { if (m.cfg.seed === 7) process.exit(3); parentPort.postMessage({ id: m.id, rec: { pair: m.cfg.heroes.join(','), seed: m.cfg.seed, trial: 0, result: 'win', fights: [], picks: [] } }); });\nparentPort.postMessage({ ready: true });\n`);
    const tasksW = [5, 6, 7, 8, 9, 10].map((s) => ({ heroes: ['hanae', 'kuro'], trial: 0, seed: s }));
    const seen = [];
    const out = await runPool(tasksW, 2, null, (i, rec) => seen.push(i), { worker: file });
    t.eq(out.length, 6, 'a record per task');
    t.eq(out[2].result, 'error', 'the task that killed its worker is recorded as an error');
    t.ok(/worker/.test(out[2].error), 'with a reason');
    t.eq(out.filter((r, i) => i !== 2 && r.result === 'win').length, 5, 'every other task still ran');
    t.eq(seen.length, 6, 'onRecord fired once per task, the dead one included');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

t.test('the shop removes a curse before it removes any playable card, however good the deck has become', () => {
  const V = createValuer(G);
  const P = createPolicies(G, V, {});
  const R = RUN.newRun({ heroes: ['kuro', 'raiga'], seed: 61, trial: 0 });
  ['kuro_ink_flick', 'raiga_sundering_blow', 'raiga_tiger_and_crane', 'raiga_rolling_thunder', 'raiga_raijin_hammer', 'kuro_inkfall_inferno'].forEach((id) => RUN.addCard(R, id, {}));
  RUN.addCard(R, 'curse_regret', {}); RUN.addCard(R, 'curse_smudge', {});
  const c = P.removalCandidates(R, null);
  t.ok(c[0].id.startsWith('curse_') && c[1].id.startsWith('curse_'), `the two curses lead the removal ranking, got ${c.slice(0, 3).map((x) => x.id).join(', ')}`);
  const playable = c.filter((x) => !x.id.startsWith('curse_'));
  t.ok(c[1].util > playable[0].util, 'and the worse curse still outranks the best playable removal candidate');
});

t.test('tasks are ordered run by run, so any finished prefix covers every pair and trial', () => {
  const tk = buildTasks(parseArgs(['--runs', '4', '--all-pairs', '--trial', '0,5']));
  const firstRound = tk.slice(0, 12);
  t.eq(new Set(firstRound.map((x) => x.heroes.join(',') + '|' + x.trial)).size, 12, 'the first 12 tasks are one run of every pair at every trial');
});

// ------------------------------------------------------------------ invariants
t.test('records obey the economy and state invariants', () => {
  recs.forEach((r, i) => {
    const label = `${tasks[i].heroes.join(',')} t${tasks[i].trial} s${tasks[i].seed}`;
    t.ok(r.finalGold >= 0, `${label}: gold is never negative`);
    t.ok(r.stats.goldSpent <= r.stats.goldEarned + 60 + 1, `${label}: gold spent ${r.stats.goldSpent} is covered by gold earned ${r.stats.goldEarned} plus the starting 60`);
    t.ok(r.stats.mercy >= 0 && r.stats.mercy <= 12, `${label}: mercy grants ${r.stats.mercy} stay few`);
    t.ok(r.chaptersCleared >= 0 && r.chaptersCleared <= 3, `${label}: chapters cleared in 0..3`);
    t.ok((r.result === 'win') === (r.chaptersCleared === 3), `${label}: a win is exactly three boss kills`);
    t.ok(r.deckSize >= 5 && r.deckSize <= 60, `${label}: deck size ${r.deckSize} is sane`);
    t.ok(r.finalHeroes.every((h) => h.maxHp > 0 && h.hp >= 0 && h.hp <= h.maxHp), `${label}: hero HP within 0..max`);
    t.ok(r.fights.every((f) => f.turns >= 1 && f.hpLost >= 0), `${label}: every fight has turns and non-negative HP lost`);
    t.ok(r.fights.filter((f) => f.tier === 'boss' && f.result === 'win').length === r.chaptersCleared, `${label}: boss wins equal chapters cleared`);
    t.ok(r.result !== 'lose' || (r.death && r.death.enemies.length > 0), `${label}: a lost run records who killed it`);
    t.ok(r.chapters.every((c) => c.ink1 >= 0 && c.ink1 <= DATA.ECONOMY.inkMax + 12), `${label}: Ink left stays in range`);
  });
});
t.test('a fresh run starts as the design says and the bot only uses the public RUN API', () => {
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 5, trial: 0 });
  t.eq(R.deck.length, 10, 'two five-card starters');
  t.eq(R.gold, DATA.ECONOMY.startGold, 'starting gold');
  t.eq(R.ink, DATA.ECONOMY.startInk, 'starting Ink');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'hocus_vocus', 'bot', 'driver.mjs'), 'utf8');
  t.ok(!/R\.gold\s*[+-]?=[^=]/.test(src.replace(/\/\/.*$/gm, '')), 'the driver never assigns gold directly');
  t.ok(!/R\.ink\s*[+-]?=[^=]/.test(src.replace(/\/\/.*$/gm, '')), 'the driver never assigns Ink directly');
});

// ------------------------------------------------------------------ report
const report = buildReport(recs, G, {});
t.test('the report builder summarises runs with sane numbers', () => {
  t.eq(report.meta.runs, recs.length, 'run count');
  t.eq(report.meta.errors, 0, 'no error records');
  t.ok(report.cells.length === 12, 'six pairs x two trials');
  report.cells.forEach((c) => {
    t.ok(c.win >= 0 && c.win <= 100 && c.clear1 >= 0 && c.clear1 <= 100 && c.clear2 >= 0 && c.clear2 <= 100, `${c.pair} t${c.trial}: rates are percentages`);
    t.ok(c.win <= c.clear2 + 1e-9 && c.clear2 <= c.clear1 + 1e-9, `${c.pair} t${c.trial}: full clear <= chapter 2 clear <= chapter 1 clear`);
    t.ok(Number.isFinite(c.turnsMean) && Number.isFinite(c.fightsMedian), `${c.pair} t${c.trial}: finite turn and fight counts`);
  });
  t.ok(report.trials.length === 2 && report.trials[0].trial === 0 && report.trials[1].trial === 5, 'one row per trial');
  t.ok(report.cells.every((c) => c.lost1 + c.lost2 + c.lost3 === c.runs - Math.round(c.win * c.runs / 100)), 'every lost run is counted in the chapter where it ended, per pair and trial');
  t.ok(report.cells.every((c) => c.boss.length === 3 && c.boss.every((x) => x === null || (x >= 0 && x <= 100))), 'per pair and trial boss win rates are percentages');
  t.ok(report.cards.length >= 100 && report.relics.length === 66 && report.gems.length === 24, 'every card, relic and gem has a row');
  t.ok(report.cards.every((c) => Number.isFinite(c.lift) && Number.isFinite(c.pickRate)), 'card rows are finite');
  t.ok(report.enemies.length > 20 && report.enemies.every((e) => Number.isFinite(e.dmgPerTurn)), 'enemy rows are finite');
  t.ok(Array.isArray(report.flags), 'flags are a list');
  t.ok(report.archetypes.length > 10, 'archetype usage rows');
  t.ok(report.meta.regression && report.meta.regression.fights > 100, 'the item regression ran on the fights');
});
t.test('the report renders to text and Markdown without NaN and without dashes', () => {
  const txt = renderText(report), md = renderMarkdown(report);
  t.ok(txt.length > 2000 && md.length > 2000, 'both renderings have content');
  t.ok(!/NaN|undefined|Infinity/.test(txt), 'no NaN or undefined in the text report');
  t.ok(!/NaN|undefined|Infinity/.test(md), 'no NaN or undefined in the Markdown report');
  t.ok(!new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(txt + md), 'no em or en dash in the output');
  t.ok(/Headline/.test(txt) && /Boss fights/.test(md) && /Flags/.test(txt), 'the main sections are there');
});
t.test('the versus sections compare two sets of runs on the same seeds and render without NaN', () => {
  const a = recs.filter((r) => r.trial === 0), b = a.map((r) => Object.assign({}, r, { result: r.result === 'win' ? 'lose' : r.result, chaptersCleared: Math.min(r.chaptersCleared, 2) }));
  const A = buildReport(a, G, {}), B = buildReport(b, G, {});
  const secs = versusSections(A, B, a, b);
  t.ok(secs.length >= 3, 'headline, pair, paired and fight sections');
  t.ok(secs[0].rows.length === 1 && secs[0].rows[0][0] === 0, 'one headline row for trial 0');
  const paired = secs.find((x) => /Paired/.test(x.title));
  t.ok(paired && paired.rows[0][0] === a.length, 'every run is paired with its twin');
  const txt = renderText(A, { versus: B, versusRecsA: a, versusRecsB: b });
  t.ok(/Search bot versus COMBAT.greedyPolicy/.test(txt) && !/NaN|undefined|Infinity/.test(txt), 'the text report carries the comparison');
});

t.test('an empty or all-error record list does not crash the builder', () => {
  const r = buildReport([], G, {});
  t.eq(r.meta.runs, 0, 'zero runs');
  t.ok(typeof renderText(r) === 'string', 'renders');
  const e = buildReport([{ error: 'x', result: 'error', pair: 'hanae,kuro', trial: 0, seed: 1, fights: [], picks: [] }], G, {});
  t.eq(e.meta.errors, 1, 'an error record is counted, not analysed');
});

// ------------------------------------------------------------------ combat: the search bot against COMBAT.greedyPolicy
t.test('the search combat bot loses less HP than COMBAT.greedyPolicy on a fixed set of fights', () => {
  const V = createValuer(G);
  const AI = createCombatAI(G, V, { beam: 1, maxReplays: 40 });
  const groups = [].concat(DATA.encounters[2].normal.slice(4, 14), DATA.encounters[3].normal.slice(2, 8));
  let lossG = 0, lossA = 0, winsG = 0, winsA = 0, n = 0;
  groups.forEach((g, i) => {
    const chapter = DATA.encounters[2].normal.indexOf(g) >= 0 ? 2 : 3;
    const R = RUN.newRun({ heroes: ALL_PAIRS[i % 6], seed: 500 + i, trial: 0 });
    for (let k = 0; k < 7; k++) {
      const hero = ALL_PAIRS[i % 6][k % 2];
      const pool = DATA.rewardPool(hero, k % 3 === 2 ? 'uncommon' : 'common', null);
      if (pool.length) RUN.addCard(R, pool[(k * 5 + i) % pool.length].id, {});
    }
    R.chapter = chapter;
    const opts = Object.assign(RUN.combatInit(R, { enemies: g.enemies, tier: 'normal', seed: 900 + i }), { maxTurns: 40 });
    const a = G.COMBAT.simulate(opts);
    const b = AI.fight(opts);
    const loss = (s) => (s.result === 'win' ? s.heroes.reduce((x, h, j) => x + (R.heroes[j].maxHp - h.hp), 0) : 400);
    lossG += loss(a); lossA += loss(b.summary); winsG += a.result === 'win'; winsA += b.summary.result === 'win'; n++;
  });
  t.ok(n === groups.length && winsA >= winsG - 1, `the search bot wins as often (${winsA} vs ${winsG} of ${n})`);
  t.ok(lossA <= lossG * 1.02 + 5, `total HP lost by the search bot ${lossA} is not above greedy's ${lossG}`);
});

t.test('the search combat bot plans on a hidden draw pile: its choice cannot depend on the real order of the pile, and the real fight stays legal', () => {
  const V = createValuer(G);
  const fair = createCombatAI(G, V, { beam: 1, maxReplays: 30 });
  const states = [[['hanae', 'kuro'], ['kappa', 'karakasa'], 41], [['suzu', 'raiga'], ['oni_cub'], 42], [['kuro', 'suzu'], ['crow_tengu', 'bamboo_boar'], 43], [['hanae', 'raiga'], ['tengu_duelist'], 44]];
  states.forEach(([pair, enemies, seed]) => {
    const R = RUN.newRun({ heroes: pair, seed, trial: 0 });
    for (let k = 0; k < 6; k++) { const pool = DATA.rewardPool(pair[k % 2], k % 2 ? 'uncommon' : 'common', null); if (pool.length) RUN.addCard(R, pool[(k * 3 + seed) % pool.length].id, {}); }
    const opts = RUN.combatInit(R, { enemies, tier: 'normal', seed: 900 + seed });
    const a = fair.decide(opts, []);
    const b = fair.decide(opts, [], (C) => C.draw.reverse());
    const c = fair.decide(opts, [], (C) => { const x = C.draw; for (let i = 0; i < x.length; i++) { const j = (i * 7 + 3) % x.length; const tmp = x[i]; x[i] = x[j]; x[j] = tmp; } });
    t.ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c), `${pair.join(',')} vs ${enemies.join('+')}: the same first action for any order of the draw pile (${JSON.stringify(a)})`);
  });
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 9, trial: 0 });
  const opts = Object.assign(RUN.combatInit(R, { enemies: ['kappa', 'tanuki_bandit'], tier: 'normal', seed: 31 }), { maxTurns: 40 });
  const f1 = fair.fight(opts), f2 = fair.fight(opts);
  t.ok(f1.summary.result === 'win' || f1.summary.result === 'lose', 'the fight finishes');
  t.ok(JSON.stringify(f1.summary) === JSON.stringify(f2.summary), 'and replays identically');
  const C = f1.C;
  t.eq(C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0), opts.deck.length + C.added, 'the real combat the bot played obeys card conservation');
});

// ------------------------------------------------------------------ house rules for the bot source
t.test('the bot sources have no em or en dashes and no unseeded random', () => {
  const dirs = [path.join(ROOT, 'tools', 'hocus_vocus', 'bot'), path.join(ROOT, 'tools', 'hocus_vocus')];
  const files = [];
  dirs.forEach((d) => fs.readdirSync(d).forEach((f) => { if (/\.mjs$/.test(f) && (d.endsWith('bot') || f === 'bot.mjs')) files.push(path.join(d, f)); }));
  files.push(path.join(ROOT, 'tests', 'hocus_vocus_bot.test.mjs'));
  const dash = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
  const rnd = new RegExp('Math' + String.fromCharCode(46) + 'random');
  files.forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    t.ok(!dash.test(s), `${path.basename(f)}: no em or en dash`);
    t.ok(!rnd.test(s), `${path.basename(f)}: no unseeded random`);
    t.ok(!/\t/.test(s), `${path.basename(f)}: no tab indentation`);
  });
  t.ok(files.length >= 8, 'the bot files were found');
});

await t.done();
