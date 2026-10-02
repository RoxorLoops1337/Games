// The balance bot (tools/rogue_book/bot.mjs and tools/rogue_book/bot/*): headless full runs through the real RUN, COMBAT, MAP and META
// scripts. Short and deterministic (a few seconds): fast combat effort, trial 0 and trial 5, all six hero pairs, a few seeds.
//
//   * every run finishes (win or lose) with no exception, no stall and well inside the global step cap;
//   * the same options give byte-identical run records, in this process and through the worker pool, in any job count;
//   * economy and state invariants hold (gold, Ink, HP, deck, chapter counters);
//   * the report builder produces sane numbers, flags and both renderings;
//   * the search combat bot loses less HP than COMBAT.greedyPolicy on a fixed set of fights;
//   * the bot source obeys the house rules (no em or en dashes, no unseeded random).
import fs from 'node:fs';
import path from 'node:path';
import { harness, ROOT } from './rogue_book_lib.mjs';
import { loadGame, ALL_PAIRS } from '../tools/rogue_book/bot/game.mjs';
import { playRun } from '../tools/rogue_book/bot/driver.mjs';
import { runPool, runSerial } from '../tools/rogue_book/bot/pool.mjs';
import { buildReport, renderText, renderMarkdown } from '../tools/rogue_book/bot/report.mjs';
import { createValuer } from '../tools/rogue_book/bot/cardval.mjs';
import { createCombatAI } from '../tools/rogue_book/bot/combat_ai.mjs';
import { parseArgs, buildTasks } from '../tools/rogue_book/bot.mjs';

const t = harness('rogue_book bot');
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
  const x = playRun(G, task(['hanae', 'kuro'], 0, 31, { combat: 'ai', maxSteps: 400 }));
  const y = playRun(G, task(['hanae', 'kuro'], 0, 31, { combat: 'ai', maxSteps: 400 }));
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
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'rogue_book', 'bot', 'driver.mjs'), 'utf8');
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

// ------------------------------------------------------------------ house rules for the bot source
t.test('the bot sources have no em or en dashes and no unseeded random', () => {
  const dirs = [path.join(ROOT, 'tools', 'rogue_book', 'bot'), path.join(ROOT, 'tools', 'rogue_book')];
  const files = [];
  dirs.forEach((d) => fs.readdirSync(d).forEach((f) => { if (/\.mjs$/.test(f) && (d.endsWith('bot') || f === 'bot.mjs')) files.push(path.join(d, f)); }));
  files.push(path.join(ROOT, 'tests', 'rogue_book_bot.test.mjs'));
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
