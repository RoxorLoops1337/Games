#!/usr/bin/env node
// INKWOVEN balance bot: plays complete runs through the real RUN / COMBAT / MAP APIs and measures balance.
//
//   node tools/rogue_book/bot.mjs --runs 100 --trial 0 --pair hanae,kuro --seed 1 --json out.json
//   node tools/rogue_book/bot.mjs --all-pairs --runs 60 --trial 0,3 --seed 7 --md report.md --json all.json
//
// Options
//   --runs N            runs per hero pair and trial (default 20)
//   --pair a,b          one hero pair (hanae kuro suzu raiga); --all-pairs plays all six
//   --trial 0[,3,5]     Ink Trial levels (default 0); the same seeds are used at every level, so trials are paired
//   --seed S            base seed (default 1); run i of a pair uses a seed derived from S, i and the pair, so any job count gives identical results
//   --json file         write the summary (and the flags) as JSON;  --runs-out file writes every run record (large)
//   --md file           write the report as Markdown
//   --jobs N            worker threads (default: number of CPUs, at most 8; 1 runs in this process)
//   --combat ai|beam|greedy   the combat player: the rollout search bot (default), the older beam search, or COMBAT.greedyPolicy
//   --compare           also play the same runs with COMBAT.greedyPolicy and print both headlines (how much better the bot is)
//   --effort fast|normal|deep   search effort of the combat bot (default normal: about 5 to 8 s of CPU a run on an idle core; fast about 3 s; greedy under 1 s)
//   --style normal|rush|explore   map style: how much Ink is spent on extra hexes beyond the way to the boss (normal: about 12 per chapter and
//                       about 27 fights a run, the design's 24 to 30; rush: 4, explore: 24)
//   --unlocked all|none  all content unlocked (default, measures every card) or a fresh profile (locked cards, relics and gems out of the pools)
//   --noise X           draft exploration noise in card-net points (default 1.3; 0 is the pure scorer). It makes every card get sampled.
//   --diff old.json new.json   compare two --json outputs (headline, pairs, bosses, fights, flags) and exit: the before/after check for a tuning pass
//   --benchmark runs.jsonl [--bench-n 40]   head to head, same decks and fights: refights the fights recorded in a --runs-out file at full HP with COMBAT.greedyPolicy and
//                       with the search bot and prints HP lost and fights won per chapter and tier (how much better the bot plays)
//   --brief             print only the headline tables and the flags
//   --quiet             no progress line
// The bot is deterministic: same options, same output. See tools/rogue_book/bot/*.mjs headers for how it plays and where it is biased.
import fs from 'node:fs';
import { loadGame, ALL_PAIRS } from './bot/game.mjs';
import { runPool, defaultJobs } from './bot/pool.mjs';
import { buildReport, renderText, renderMarkdown } from './bot/report.mjs';
import { benchmark } from './bot/benchmark.mjs';

export function parseArgs(argv) {
  const o = { runs: 20, trial: [0], pairs: [], seed: 1, jobs: defaultJobs(), combat: 'ai', effort: 'normal', style: 'normal', unlocked: 'all', noise: 1.3 };
  const take = (i) => argv[i + 1];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') o.runs = Math.max(1, parseInt(take(i++), 10));
    else if (a === '--trial') o.trial = String(take(i++)).split(',').map((x) => Math.max(0, Math.min(10, parseInt(x, 10))));
    else if (a === '--pair') o.pairs.push(String(take(i++)).split(','));
    else if (a === '--all-pairs') o.pairs = ALL_PAIRS.map((p) => p.slice());
    else if (a === '--seed') o.seed = parseInt(take(i++), 10) >>> 0;
    else if (a === '--json') o.json = take(i++);
    else if (a === '--runs-out') o.runsOut = take(i++);
    else if (a === '--md') o.md = take(i++);
    else if (a === '--jobs') o.jobs = Math.max(1, parseInt(take(i++), 10));
    else if (a === '--combat') o.combat = take(i++);
    else if (a === '--compare') o.compare = true;
    else if (a === '--effort') o.effort = take(i++);
    else if (a === '--style') o.style = take(i++);
    else if (a === '--unlocked') o.unlocked = take(i++);
    else if (a === '--noise') o.noise = parseFloat(take(i++));
    else if (a === '--brief') o.brief = true;
    else if (a === '--benchmark') o.benchmark = take(i++);
    else if (a === '--bench-n') o.benchN = parseInt(take(i++), 10);
    else if (a === '--diff') { o.diff = [take(i), argv[i + 2]]; i += 2; }
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('unknown option ' + a + ' (try --help)');
  }
  if (!o.pairs.length) o.pairs = [['hanae', 'kuro']];
  return o;
}

export function buildTasks(o) {
  const tasks = [];
  o.pairs.forEach((pair, pi) => {
    o.trial.forEach((trial) => {
      for (let i = 0; i < o.runs; i++) {
        tasks.push({ heroes: pair, trial, seed: ((o.seed * 1000003 + i * 7919 + pi * 104729) >>> 0) || 1, unlocked: o.unlocked, style: o.style, combat: o.combat, effort: o.effort, draftNoise: o.noise });
      }
    });
  });
  return tasks;
}

function diffReports(aPath, bPath) {
  const A = JSON.parse(fs.readFileSync(aPath, 'utf8')).summary, B = JSON.parse(fs.readFileSync(bPath, 'utf8')).summary;
  const sign = (x) => (x > 0 ? '+' : '') + Math.round(x * 10) / 10;
  const out = [`diff ${aPath} -> ${bPath}`, `runs ${A.meta.runs} -> ${B.meta.runs}`];
  const cmp = (title, rows) => { out.push('\n== ' + title); rows.forEach((r) => out.push(r)); };
  cmp('Headline by trial (full clear %, chapter 1 %, chapter 2 %)', B.trials.map((t) => { const a = A.trials.find((x) => x.trial === t.trial); return a ? `trial ${t.trial}: full ${a.win} -> ${t.win} (${sign(t.win - a.win)}), ch1 ${a.clear1} -> ${t.clear1}, ch2 ${a.clear2} -> ${t.clear2}` : `trial ${t.trial}: new`; }));
  cmp('Pairs', B.cells.map((c) => { const a = A.cells.find((x) => x.pair === c.pair && x.trial === c.trial); return a ? `${c.pair} t${c.trial}: full ${a.win} -> ${c.win} (${sign(c.win - a.win)})` : `${c.pair} t${c.trial}: new`; }));
  cmp('Bosses (win %)', B.bosses.map((b) => { const a = A.bosses.find((x) => x.id === b.id); return a ? `${b.id}: ${a.winRate} -> ${b.winRate} (${sign(b.winRate - a.winRate)}), HP lost ${a.hpLostPct}% -> ${b.hpLostPct}%` : `${b.id}: new`; }));
  cmp('Fights (HP lost % of max)', B.fights.map((f) => { const a = A.fights.find((x) => x.ch === f.ch && x.tier === f.tier); return a ? `ch${f.ch} ${f.tier}: ${a.hpLostPct} -> ${f.hpLostPct} (${sign(f.hpLostPct - a.hpLostPct)}), turns ${a.turns} -> ${f.turns}` : `ch${f.ch} ${f.tier}: new`; }));
  const fa = new Set(A.flags.map((f) => f.msg)), fb = new Set(B.flags.map((f) => f.msg));
  cmp('Flags that appeared', B.flags.filter((f) => !fa.has(f.msg)).map((f) => `[${f.sev}] ${f.msg}`));
  cmp('Flags that went away', A.flags.filter((f) => !fb.has(f.msg)).map((f) => `[${f.sev}] ${f.msg}`));
  console.log(out.join('\n'));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.diff) { diffReports(o.diff[0], o.diff[1]); return; }
  if (o.benchmark) {
    const recs = fs.readFileSync(o.benchmark, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const B = benchmark(loadGame(), recs, { perCell: o.benchN || 40, effort: o.effort });
    const pad = (x, n) => String(x).padEnd(n);
    console.log('Search bot versus COMBAT.greedyPolicy: same decks, relics, enemies and seeds, party at full HP (HP lost is both heroes, a lost fight counts all HP)');
    console.log([pad('ch', 3), pad('tier', 7), pad('fights', 7), pad('greedy HP lost', 15), pad('bot HP lost', 12), pad('change', 8), pad('greedy won %', 13), pad('bot won %', 10), pad('turns g/b', 10)].join(''));
    B.rows.forEach((r) => console.log([pad(r.ch, 3), pad(r.tier, 7), pad(r.n, 7), pad(r.lossG, 15), pad(r.lossA, 12), pad((r.change > 0 ? '+' : '') + r.change + '%', 8), pad(r.winG, 13), pad(r.winA, 10), pad(r.turnsG + '/' + r.turnsA, 10)].join('')));
    console.log(`all: ${B.total.n} fights, greedy HP lost ${B.total.lossG}, bot HP lost ${B.total.lossA}, greedy won ${B.total.winG}%, bot won ${B.total.winA}%`);
    return;
  }
  if (o.help) {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n');
    console.log(src);
    return;
  }
  const G = loadGame();
  const tasks = buildTasks(o);
  const progress = (done, total) => { if (!o.quiet && process.stderr.isTTY) process.stderr.write(`\r${done}/${total} runs`); };
  const recs = await runPool(tasks, o.jobs, progress);
  if (!o.quiet && process.stderr.isTTY) process.stderr.write('\n');
  const S = buildReport(recs, G, {});
  let G2 = null, S2 = null;
  if (o.compare && o.combat !== 'greedy') {
    const t2 = tasks.map((t) => Object.assign({}, t, { combat: 'greedy' }));
    G2 = await runPool(t2, o.jobs, progress);
    S2 = buildReport(G2, G, {});
  }
  const text = renderText(S, { brief: o.brief });
  if (o.brief) {
    const keep = text.split('\n== ').filter((s, i) => i === 0 || /^(Headline|By hero pair|Boss|Flags)/.test(s));
    console.log(keep.join('\n== '));
  } else console.log(text);
  if (S2) {
    console.log('\n== Bot versus COMBAT.greedyPolicy on the same seeds (same map, draft and shop policies, only the combat player differs)');
    const row = (name, T) => `${name.padEnd(10)} full ${String(T.win).padStart(5)}%   ch1 ${String(T.clear1).padStart(5)}%   ch2 ${String(T.clear2).padStart(5)}%   median turns ${T.turnsMedian}   avg score ${T.scoreMean}`;
    S.trials.forEach((t) => { const g = S2.trials.find((x) => x.trial === t.trial); console.log(`trial ${t.trial}\n  ${row('search bot', t)}\n  ${row('greedy', g)}`); });
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(S2 ? { options: o, summary: S, greedy: S2 } : { options: o, summary: S }, null, 1));
  if (o.md) fs.writeFileSync(o.md, renderMarkdown(S, {}));
  if (o.runsOut) fs.writeFileSync(o.runsOut, recs.map((r) => JSON.stringify(r)).join('\n'));
  if (S.meta.errors) process.exitCode = 1;
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === fs.realpathSync(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
