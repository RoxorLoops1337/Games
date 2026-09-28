// Runs every tests/rogue_book_*.test.mjs, one process each, and prints a summary.
//   node tests/rogue_book_all.mjs            run everything
//   node tests/rogue_book_all.mjs combat     only suites whose name contains "combat"
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const suites = fs.readdirSync(here).filter((f) => /^rogue_book_.*\.test\.mjs$/.test(f) && f.includes(filter)).sort();
let failed = 0;
const t0 = Date.now();
for (const s of suites) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, s)], { encoding: 'utf8', timeout: 20 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').slice(-1)[0] || '';
  const ok = r.status === 0;
  if (!ok) { failed++; console.log(out.trim().split('\n').slice(-25).join('\n')); }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${s} (${((Date.now() - t) / 1000).toFixed(1)}s) ${last}`);
}
console.log(`rogue_book: ${suites.length - failed}/${suites.length} suites green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
