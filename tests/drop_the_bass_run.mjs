// Runs every tests/drop_the_bass_*.test.mjs in sequence; fails on the first red one.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => /^drop_the_bass_.*\.test\.mjs$/.test(f)).sort();
for (const f of files) { console.log('> ' + f); execFileSync('node', [dir + f], { stdio: 'inherit' }); }
console.log(files.length + ' drop_the_bass suites passed');
