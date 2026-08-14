#!/usr/bin/env node
// How long each suite in `npm run check` takes, and a warning when one of them
// has run away from the rest.
//
// WHY THIS IS A SCRIPT AND NOT A NOTE. The timings were written down once, in
// CHECK_TIMES.md, and a file is a measurement that goes stale the day after it
// is taken. Nobody making a suite slow reads it, because they are not looking
// for it — they are looking at their own game. This runs the same measurement on
// demand and says which suite is the problem in the terminal where the person
// who made it slow is already standing.
//
//   node tools/check-times.mjs            time every suite, warn on outliers
//   node tools/check-times.mjs --ci       exit 1 if any suite is over the bar
//   node tools/check-times.mjs --bar 15   change the share-of-total bar (percent)
//
// THE BAR IS A SHARE OF THE TOTAL, AND THE FIRST VERSION OF IT WAS WRONG.
//
// It started as a multiple of the median suite, on the reasoning that the median
// is the repo's own idea of "normal" and moves with it. Run against the real
// repo that fired on SIX of 39 suites — including this tool's own author's game —
// because 27 of the 39 finish in under a second, which drags the median to 0.6s
// and puts the bar at 11s. A smoke alarm that flags 15% of the building is the
// same failure as one that never sounds: nobody can act on it.
//
// The question worth asking is not "is this suite slower than typical" — most of
// the check is trivial suites, so nearly anything real looks slow next to them.
// It is "is any one suite an unreasonable share of the wait", and that has an
// obvious answer: no single suite should be more than a quarter of the whole
// check. Scale-free, survives the repo growing, and it names one thing.
//
// Against the reading that prompted this: blacksite 45% fires, crashmas 17% does
// not. One name, which is what a person can do something about.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const CI = args.includes('--ci');
const BAR = Number((args[args.indexOf('--bar') + 1] || 0)) || 25;   // percent of total

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const suites = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:'));

console.log(`timing ${suites.length} suites — this runs the whole check, so it takes as long as one\n`);
try { execSync('node build.js', { stdio: 'ignore' }); } catch { /* the suites will say so */ }

const rows = [];
for (const s of suites) {
  const t0 = Date.now();
  let ok = true;
  try { execSync(`npm run ${s}`, { stdio: 'ignore' }); } catch { ok = false; }
  rows.push({ s, ms: Date.now() - t0, ok });
  process.stdout.write('.');
}
console.log('\n');

rows.sort((a, b) => b.ms - a.ms);
const total = rows.reduce((n, r) => n + r.ms, 0);
const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const limit = total * (BAR / 100);

for (const r of rows) {
  const share = (r.ms / total) * 100;
  const flag = r.ms > limit ? '  ← OVER THE BAR' : '';
  if (r.ms >= 1000 || flag) {
    console.log(`${(r.ms / 1000).toFixed(1).padStart(7)}s  ${(share.toFixed(0) + '%').padStart(4)}  ` +
      `${r.s.replace('test:', '').padEnd(14)}${r.ok ? '' : '  (FAILED)'}${flag}`);
  }
}
const over = rows.filter((r) => r.ms > limit);
console.log(`\n${(total / 1000).toFixed(1)}s total · median suite ${(median / 1000).toFixed(1)}s · ` +
  `bar is ${BAR}% of the total = ${(limit / 1000).toFixed(1)}s`);

if (over.length) {
  console.log(`\n${over.length} suite${over.length > 1 ? 's are' : ' is'} over the bar: ` +
    over.map((r) => `${r.s.replace('test:', '')} (${(r.ms / 1000).toFixed(0)}s, ` +
      `${((r.ms / total) * 100).toFixed(0)}% of the check)`).join(', '));
  console.log('CHECK_TIMES.md has what worked for frostfell, which used to be the worst of these.');
  if (CI) process.exit(1);
} else {
  console.log('\nno suite is over the bar.');
}
