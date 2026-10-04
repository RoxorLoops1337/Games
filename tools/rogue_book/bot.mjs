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
//   --compare-from file  the same comparison from an existing --stream or --runs-out file of greedy runs (nothing is replayed): the greedy records
//                       whose pair, trial and seed match a run of this report are used, so the two sets are paired by seed
//   --effort fast|normal|deep   search effort of the combat bot (default normal: about 5 to 8 s of CPU a run on an idle core; fast about 3 s; greedy under 1 s)
//   --style normal|rush|explore|max   map style: how much Ink is spent on extra hexes beyond the way to the boss (normal: about 12 per chapter and
//                       about 27 fights a run, the design's 24 to 30; rush: 4, explore: 24, max: as many as Ink and HP allow, the Ink economy probe)
//   --unlocked all|none  all content unlocked (default, measures every card) or a fresh profile (locked cards, relics and gems out of the pools)
//   --clairvoyant       let the combat bot see the real order of its draw pile and the real random rolls (the old behaviour; default is a fair player
//                       who plans on a re-shuffled draw pile and fresh random rolls, see bot/combat_ai.mjs)
//   --noise X           draft exploration noise in card-net points (default 1.3; 0 is the pure scorer). It makes every card get sampled.
//   --pick-bias X       shifts the bar a card (or a shop card) must clear to be taken, in card-net points (default 0; -1.5 takes many more cards, +1.5 keeps
//                       the deck lean): the sensitivity knob for "does the bot leave power on the table by skipping cards"
//   --diff old.json new.json   compare two --json outputs (headline, pairs, bosses, fights, flags) and exit: the before/after check for a tuning pass
//   --benchmark runs.jsonl [--bench-n 40]   head to head, same decks and fights: refights the fights recorded in a --runs-out file at full HP with COMBAT.greedyPolicy and
//                       with the search bot and prints HP lost and fights won per chapter and tier (how much better the bot plays)
//   --brief             print only the headline tables and the flags
//   --quiet             no progress line
//   --stream file       append every finished run to this JSON Lines file AS IT FINISHES (a long run that is killed keeps what it had)
//   --resume            with --stream: skip the tasks whose records are already in the stream file (same options, same seeds)
//   --from file[,file2] build the report from stream or --runs-out files instead of simulating (concatenated, duplicates by task key dropped;
//                       --trial and --pair/--all-pairs, when given, select which of the stored runs are reported)
//   --awake-report      calibration probe for the audio Hush: also prints the median woken share of the map when a boss fight starts (per chapter and
//                       overall; forces --jobs 1; records and --runs-out are unchanged, and with the flag off nothing is recorded)
//   --progress N        when stderr is not a terminal, print a progress line every N finished runs (default 20)
// The bot is deterministic: same options, same output. See tools/rogue_book/bot/*.mjs headers for how it plays and where it is biased.
import fs from 'node:fs';
import { loadGame, ALL_PAIRS } from './bot/game.mjs';
import { AWAKE_REPORT } from './bot/driver.mjs';
import { runPool, defaultJobs } from './bot/pool.mjs';
import { buildReport, renderText, renderMarkdown } from './bot/report.mjs';
import { benchmark } from './bot/benchmark.mjs';

export function parseArgs(argv) {
  const o = { runs: 20, trial: [0], pairs: [], seed: 1, jobs: defaultJobs(), combat: 'ai', effort: 'normal', style: 'normal', unlocked: 'all', noise: 1.3 };
  const take = (i) => argv[i + 1];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') o.runs = Math.max(1, parseInt(take(i++), 10));
    else if (a === '--trial') { o.trial = String(take(i++)).split(',').map((x) => Math.max(0, Math.min(10, parseInt(x, 10)))); o.trialExplicit = true; }
    else if (a === '--pair') { o.pairs.push(String(take(i++)).split(',')); o.pairsExplicit = true; }
    else if (a === '--all-pairs') { o.pairs = ALL_PAIRS.map((p) => p.slice()); o.pairsExplicit = true; }
    else if (a === '--seed') o.seed = parseInt(take(i++), 10) >>> 0;
    else if (a === '--json') o.json = take(i++);
    else if (a === '--runs-out') o.runsOut = take(i++);
    else if (a === '--md') o.md = take(i++);
    else if (a === '--jobs') o.jobs = Math.max(1, parseInt(take(i++), 10));
    else if (a === '--combat') o.combat = take(i++);
    else if (a === '--compare') o.compare = true;
    else if (a === '--compare-from') o.compareFrom = take(i++);
    else if (a === '--effort') o.effort = take(i++);
    else if (a === '--style') o.style = take(i++);
    else if (a === '--unlocked') o.unlocked = take(i++);
    else if (a === '--noise') o.noise = parseFloat(take(i++));
    else if (a === '--pick-bias') o.pickBias = parseFloat(take(i++));
    else if (a === '--brief') o.brief = true;
    else if (a === '--benchmark') o.benchmark = take(i++);
    else if (a === '--bench-n') o.benchN = parseInt(take(i++), 10);
    else if (a === '--diff') { o.diff = [take(i), argv[i + 2]]; i += 2; }
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--clairvoyant') o.clairvoyant = true;
    else if (a === '--stream') o.stream = take(i++);
    else if (a === '--resume') o.resume = true;
    else if (a === '--from') o.from = String(take(i++)).split(',');
    else if (a === '--awake-report') o.awakeReport = true;
    else if (a === '--progress') o.progress = Math.max(1, parseInt(take(i++), 10));
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('unknown option ' + a + ' (try --help)');
  }
  if (!o.pairs.length) o.pairs = [['hanae', 'kuro']];
  const oneOf = { style: ['normal', 'rush', 'explore', 'max'], combat: ['ai', 'beam', 'greedy'], effort: ['fast', 'normal', 'deep'], unlocked: ['all', 'none'] };
  Object.keys(oneOf).forEach((k) => { if (oneOf[k].indexOf(o[k]) < 0) throw new Error(`bad --${k} ${o[k]} (one of ${oneOf[k].join(', ')})`); });
  o.pairs.forEach((p) => { if (p.length !== 2 || p[0] === p[1] || p.some((h) => ALL_PAIRS.every((q) => q.indexOf(h) < 0))) throw new Error('bad --pair ' + p.join(',') + ' (two different heroes of hanae, kuro, suzu, raiga)'); });
  return o;
}

// Run-major order (run 0 of every pair and trial, then run 1, ...): whatever prefix of a long job has finished covers all pairs evenly.
export function buildTasks(o) {
  const tasks = [];
  for (let i = 0; i < o.runs; i++) {
    o.pairs.forEach((pair, pi) => {
      o.trial.forEach((trial) => {
        tasks.push({ heroes: pair, trial, seed: ((o.seed * 1000003 + i * 7919 + pi * 104729) >>> 0) || 1, unlocked: o.unlocked, style: o.style, combat: o.combat, effort: o.effort, draftNoise: o.noise, pickBias: o.pickBias, clairvoyant: !!o.clairvoyant });
      });
    });
  }
  return tasks;
}
// identity of one run (what makes two records the same run): used by --resume and --from
export function taskKey(t) { return [t.heroes.join(','), t.trial, t.seed, t.combat, t.effort, t.style, t.unlocked, t.draftNoise, t.pickBias, t.clairvoyant ? 'c' : 'h'].join('|'); }
export function recKey(r) { return [r.pair, r.trial, r.seed, r.combat, r.effort, r.style, r.unlocked, r.draftNoise, r.pickBias, r.clairvoyant ? 'c' : 'h'].join('|'); }
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

// Plays (or loads) the runs the options ask for and returns { recs, tasks } in task order. --from reads records, --stream appends each
// finished run to a JSONL file and --resume skips the runs already in it. log(text) gets the progress lines (stderr in the CLI).
export async function collect(o, log) {
  log = log || (() => {});
  let tasks = buildTasks(o);
  let recs;
  if (o.from) {
    const seen = new Set();
    recs = [];
    o.from.forEach((f) => readJsonl(f).forEach((x) => {
      const r = x.rec || x;
      if (!r || !r.pair || r.result === 'error') return;
      if (o.trialExplicit && o.trial.indexOf(r.trial) < 0) return;
      if (o.pairsExplicit && !o.pairs.some((p) => p.join(',') === r.pair)) return;
      const k = recKey(r);
      if (seen.has(k)) return;
      seen.add(k); recs.push(r);
    }));
    if (!recs.length) throw new Error('--from: no records found in ' + o.from.join(', '));
    tasks = recs.map((r) => ({ heroes: r.pair.split(','), trial: r.trial, seed: r.seed, unlocked: r.unlocked, style: r.style, combat: r.combat, effort: r.effort, draftNoise: r.draftNoise, pickBias: r.pickBias, clairvoyant: !!r.clairvoyant }));
    return { recs, tasks };
  }
  const t0 = Date.now();
  const every = o.progress || 20;
  const tty = typeof process !== 'undefined' && process.stderr && process.stderr.isTTY;
  const progress = (done, total) => {
    if (tty) log(`\r${done}/${total} runs`);
    else if (done % every === 0 || done === total) log(`progress ${done}/${total} runs, ${Math.round((Date.now() - t0) / 1000)} s elapsed\n`);
  };
  // finished runs go to the stream file at once; a resumed job only plays the tasks that are missing from it
  const have = new Map();
  if (o.stream && o.resume) readJsonl(o.stream).forEach((x) => { if (x.rec && x.key && x.rec.result !== 'error') have.set(x.key, x.rec); });
  const todo = [];
  tasks.forEach((t, i) => { if (!have.has(taskKey(t))) todo.push(i); });
  if (have.size) log(`resume: ${tasks.length - todo.length} of ${tasks.length} runs already in ${o.stream}\n`);
  const fresh = await runPool(todo.map((i) => tasks[i]), o.jobs, progress, (j, rec) => {
    if (o.stream) fs.appendFileSync(o.stream, JSON.stringify({ key: taskKey(tasks[todo[j]]), rec }) + '\n');
  });
  recs = new Array(tasks.length);
  todo.forEach((i, j) => { recs[i] = fresh[j]; });
  tasks.forEach((t, i) => { if (!recs[i]) recs[i] = have.get(taskKey(t)); });
  if (tty) log('\n');
  return { recs, tasks };
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
    const B = benchmark(loadGame(), recs, { perCell: o.benchN || 40, effort: o.effort, clairvoyant: o.clairvoyant });
    const pad = (x, n) => String(x).padEnd(n);
    console.log('Search bot versus COMBAT.greedyPolicy: same decks, relics, enemies and seeds, party at full HP (HP lost is both heroes, a lost fight counts all HP)');
    console.log([pad('ch', 3), pad('tier', 7), pad('fights', 7), pad('greedy HP lost', 15), pad('bot HP lost', 12), pad('change', 8), pad('greedy won %', 13), pad('bot won %', 10), pad('turns g/b', 10)].join(''));
    B.rows.forEach((r) => console.log([pad(r.ch, 3), pad(r.tier, 7), pad(r.n, 7), pad(r.lossG, 15), pad(r.lossA, 12), pad((r.change > 0 ? '+' : '') + r.change + '%', 8), pad(r.winG, 13), pad(r.winA, 10), pad(r.turnsG + '/' + r.turnsA, 10), r.lossC !== undefined ? `clairvoyant bot: HP lost ${r.lossC}, won ${r.winC}%` : ''].join('')));
    console.log(`all: ${B.total.n} fights, greedy HP lost ${B.total.lossG}, bot HP lost ${B.total.lossA}, greedy won ${B.total.winG}%, bot won ${B.total.winA}%` + (B.total.winC ? `, clairvoyant bot HP lost ${B.total.lossC}, won ${B.total.winC}%` : ''));
    return;
  }
  if (o.help) {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n');
    console.log(src);
    return;
  }
  const G = loadGame();
  if (o.awakeReport) { o.jobs = 1; AWAKE_REPORT.on = true; AWAKE_REPORT.list = []; }
  const { recs, tasks } = await collect(o, (m) => { if (!o.quiet) process.stderr.write(m); });
  const progress = (done, total) => { if (!o.quiet && process.stderr.isTTY) process.stderr.write(`\r${done}/${total} runs`); };
  const S = buildReport(recs, G, {});
  let G2 = null, S2 = null;
  if (o.compare && o.combat !== 'greedy' && !o.from) {
    const t2 = tasks.map((t) => Object.assign({}, t, { combat: 'greedy' }));
    G2 = await runPool(t2, o.jobs, progress);
    S2 = buildReport(G2, G, {});
  } else if (o.compareFrom) {
    const want = new Set(recs.map((r) => r.pair + '|' + r.trial + '|' + r.seed));
    G2 = readJsonl(o.compareFrom).map((x) => x.rec || x).filter((r) => r && r.pair && r.result !== 'error' && r.combat === 'greedy' && want.has(r.pair + '|' + r.trial + '|' + r.seed));
    if (!G2.length) throw new Error('--compare-from: no greedy run in ' + o.compareFrom + ' matches a run of this report (same pair, trial and seed)');
    S2 = buildReport(G2, G, {});
  }
  const ropts = { brief: o.brief, versus: S2 || undefined, versusRecsA: S2 ? recs : undefined, versusRecsB: S2 ? G2 : undefined };
  const text = renderText(S, ropts);
  if (o.brief) {
    const keep = text.split('\n== ').filter((s, i) => i === 0 || /^(Headline|By hero pair|Boss|Search bot versus|Flags)/.test(s));
    console.log(keep.join('\n== '));
  } else console.log(text);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(S2 ? { options: o, summary: S, greedy: S2 } : { options: o, summary: S }, null, 1));
  if (o.md) fs.writeFileSync(o.md, renderMarkdown(S, ropts));
  if (o.runsOut) fs.writeFileSync(o.runsOut, recs.map((r) => JSON.stringify(r)).join('\n'));
  if (o.awakeReport) console.log(awakeLine(AWAKE_REPORT.list));
  if (S.meta.errors) process.exitCode = 1;
}

// one line: the median woken share of the map at each boss fight, per chapter and overall (the audio calibration of AUDIO.HUSH)
export function awakeLine(list) {
  const med = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
  const f2 = (x) => (x === x ? x.toFixed(2) : 'n/a');
  const per = [1, 2, 3].map((c) => { const a = list.filter((x) => x.ch === c).map((x) => x.frac); return `ch${c} median ${f2(med(a))} (${a.length})`; });
  return `awake at keeper: ${per.join(', ')}, all ${f2(med(list.map((x) => x.frac)))} (${list.length})`;
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === fs.realpathSync(process.argv[1]);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
