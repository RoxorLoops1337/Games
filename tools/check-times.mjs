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
//   node tools/check-times.mjs --bar 15   change the multiple of the median
//
// THE BAR IS A MULTIPLE OF THE MEDIAN, NOT A CONSTANT. A repo of forty games
// grows, boxes differ, and a hard second-count would be wrong on every machine
// but the one it was written on. The median suite is the repo's own idea of
// "normal" and it moves with the repo; a suite twenty times that is an outlier
// on any hardware. The default of 20 is deliberately loose — it is a smoke
// alarm, not a budget, and it should fire when something is badly wrong rather
// than whenever somebody adds a test.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const CI = args.includes('--ci');
const BAR = Number((args[args.indexOf('--bar') + 1] || 0)) || 20;

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
const limit = median * BAR;

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
  `bar is ${BAR}x median = ${(limit / 1000).toFixed(1)}s`);

if (over.length) {
  console.log(`\n${over.length} suite${over.length > 1 ? 's are' : ' is'} over the bar: ` +
    over.map((r) => `${r.s.replace('test:', '')} (${(r.ms / 1000).toFixed(0)}s, ` +
      `${(r.ms / median).toFixed(0)}x median)`).join(', '));
  console.log('CHECK_TIMES.md has what worked for frostfell, which used to be the worst of these.');
  if (CI) process.exit(1);
} else {
  console.log('\nno suite is over the bar.');
}
