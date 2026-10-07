// Static checks for the Encore Island 3D test slice: files exist, modules parse, the importmap resolves to vendored files,
// every module exports the contract from DESIGN.md. (WebGL rendering is covered by manual/Playwright screenshots.)
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('encore_island_3d');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'encore_island_3d');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
t.ok(existsSync(join(dir, map.three)), 'importmap: three is vendored');
t.ok(existsSync(join(dir, map['three/addons/'], 'postprocessing/UnrealBloomPass.js')), 'importmap: addons are vendored');
const need = { 'js/characters.js': ['makeJasmin', 'makeRoxor', 'makeCreature', 'makeFan'], 'js/environment.js': ['buildWorld'], 'js/props.js': ['buildProps'], 'js/main.js': [], 'js/palette.js': ['C', 'SCALE'] };
for (const [f, ex] of Object.entries(need)) {
  const p = join(dir, f); t.ok(existsSync(p), f + ' exists'); if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  try { execFileSync(process.execPath, ['--check', '--input-type=module', '-'], { input: src, stdio: ['pipe', 'pipe', 'pipe'] }); t.ok(true, f + ' parses'); } catch (e) { t.ok(false, f + ' parses: ' + String(e.stderr).split('\n')[0]); }
  for (const name of ex) t.ok(new RegExp('export\\s+(const|function|class)\\s+' + name + '\\b').test(src), f + ' exports ' + name);
}
const main = readFileSync(join(dir, 'js/main.js'), 'utf8');
t.ok(/__E3D/.test(main), 'main.js exposes test hooks');
t.ok(!/https?:\/\//.test(main + html.replace(/xmlns='http:\/\/www\.w3\.org\/2000\/svg'/, '')), 'no network dependencies');
t.done();
