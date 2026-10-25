// Pitch Story: Draft Day tests. The game is Godot 4.7.1 (GDScript), so its suites run in the
// engine: `godot --headless --path pitch_story -s tests/run_tests.gd`.
//
// Needs the Godot binary: GODOT=/path/to/godot, or `godot` on PATH, or ~/bin/godot.
// Without it this prints NOT RUN loudly and exits 0, so machines without Godot can still run
// `npm run check`. NOT RUN is not a pass: install Godot 4.7.1 before merging changes to pitch_story/.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const candidates = [process.env.GODOT, 'godot', `${homedir()}/bin/godot`, '/root/bin/godot'].filter(Boolean);
const godot = candidates.find((c) => {
  if (c.includes('/')) return existsSync(c);
  return spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0;
});
if (!godot) {
  console.log('pitch_story: NOT RUN (no Godot binary found: set GODOT=/path/to/godot 4.7.1). Nothing was tested.');
  process.exit(0);
}
const ver = spawnSync(godot, ['--version'], { encoding: 'utf8' }).stdout.trim();
console.log(`pitch_story: using ${godot} (${ver})`);
if (!ver.startsWith('4.7')) console.log('pitch_story: WARNING the project pins Godot 4.7.1; this is a different version.');

// A fresh checkout has no class cache; import first so class_name scripts resolve.
spawnSync(godot, ['--headless', '--path', 'pitch_story', '--import'], { encoding: 'utf8' });
const r = spawnSync(godot, ['--headless', '--path', 'pitch_story', '-s', 'tests/run_tests.gd'], { encoding: 'utf8', timeout: 300000 });
const out = (r.stdout || '') + (r.stderr || '');
process.stdout.write(out.split('\n').filter((l) => !/^\s*$/.test(l) && !/ObjectDB|at: cleanup/.test(l)).join('\n') + '\n');
if (/SCRIPT ERROR|Parse Error|Failed to load script/.test(out)) {
  console.log('pitch_story: FAILED (the engine reported a script error above)');
  process.exit(1);
}
if (r.status !== 0) {
  console.log(`pitch_story: FAILED (exit ${r.status})`);
  process.exit(1);
}
console.log('pitch_story: ok');
