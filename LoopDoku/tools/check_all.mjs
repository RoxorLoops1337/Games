// Runs the logic tests and every skin check. Usage: node tools/check_all.mjs   (needs node tools/serve.mjs 5320 running)
import { spawnSync } from 'node:child_process';
const skins = ['comic', 'idol', 'sticker', 'paper', 'studio', 'riso', 'jelly', 'watercolour', 'pixel', 'neon'];
let bad = 0;
const run = (args) => { const r = spawnSync(process.execPath, args, { encoding: 'utf8' }); process.stdout.write(r.stdout + r.stderr); if (r.status) bad++; };
run(['tools/test_core.mjs']);
for (const s of skins) run(['tools/skin_check.mjs', s]);
run(['tools/touch_check.mjs']);
console.log(bad ? bad + ' check(s) failed' : 'everything passes');
process.exit(bad ? 1 : 0);
