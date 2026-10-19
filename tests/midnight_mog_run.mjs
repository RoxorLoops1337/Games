// Runs every tests/midnight_mog_*.test.mjs in sequence; fails on the first red one.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => /^midnight_mog_.*\.test\.mjs$/.test(f)).sort();
for (const f of files) { console.log('> ' + f); execFileSync('node', [dir + f], { stdio: 'inherit' }); }
console.log(files.length + ' midnight_mog suites passed');
