// Runs every tests/graftwork_*.test.mjs in sequence; fails if any fails. New suites are picked up automatically.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => /^graftwork_.*\.test\.mjs$/.test(f)).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [new URL(f, import.meta.url).pathname], { encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${f}`);
  if (!ok) { bad++; console.log((r.stdout || '').split('\n').slice(-12).join('\n')); console.log(r.stderr); }
}
console.log(`${files.length - bad}/${files.length} graftwork suites passed`);
process.exit(bad ? 1 : 0);
