// npm run heroes:sync: two branches that both change the Beatbox Heroes 3D sources always conflict in the committed, content-hashed build files.
// The helper must resolve that by REBUILDING from the merged sources, never by picking a side.
//   unit         stamp-only conflicts in the pages are resolved, anything else is left alone
//   integration  in a throwaway clone: branch A and branch B each edit a different string of the 3D sources and commit their rebuilt files; merging B into A
//                conflicts in the generated files; heroes:sync resolves it; the merge commit's build files are byte-identical to a fresh build of the merged
//                sources (a second `node build.js` changes nothing) and the merged bundle carries both edits. A hand-written conflict is reported and nothing is touched.
import { ok, eq, done } from './beatbox_heroes_lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStampConflicts, GENERATED } from '../tools/beatbox_heroes/sync_build.mjs';

/* ---------------------------------------------------------------- unit: stamp-only conflicts */
{
  const hunk = (a, b) => 'x\n<<<<<<< HEAD\n' + a + '\n=======\n' + b + '\n>>>>>>> other\ny\n';
  const stamp = (h, p) => `window.BBH_R3 = "r3/entry.js?v=${h}"; window.BBH_R3_IIFE = "park3d.bundle.js?v=${p}";`;
  let r = resolveStampConflicts(hunk(stamp('aaaaaaaaaa', '1111111111'), stamp('bbbbbbbbbb', '2222222222')));
  eq([r.left, r.text], [0, 'x\n' + stamp('aaaaaaaaaa', '1111111111') + '\ny\n'], 'a hunk that differs only by hash stamps is resolved');
  r = resolveStampConflicts(hunk('<title>One</title>', '<title>Two</title>'));
  eq(r.left, 1, 'a real difference is left alone'); ok(r.text.includes('<<<<<<< HEAD') && r.text.includes('>>>>>>> other'), 'and its markers are kept');
  r = resolveStampConflicts(hunk(stamp('aaaaaaaaaa', '1'), stamp('bbbbbbbbbb', '1')) + hunk('keep ours?', 'no, theirs'));
  eq(r.left, 1, 'two hunks: the stamp one resolved, the other left');
  ok(GENERATED.test('beatbox_heroes/r3/p3-chunk-ABC123.js') && GENERATED.test('beatbox_heroes/r3/entry.js') && GENERATED.test('beatbox_heroes/park3d.bundle.js'), 'generated files are recognised');
  ok(!GENERATED.test('beatbox_heroes/r3/boot3d.js') && !GENERATED.test('beatbox_heroes/park3d/mg_rhythm.js'), 'hand-written files are not');
}

/* ---------------------------------------------------------------- integration in a throwaway clone */
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'heroes_sync_')), C = path.join(tmp, 'repo');
const run = (cmd, args, o = {}) => execFileSync(cmd, args, { cwd: C, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const git = (...a) => run('git', a);
const tryRun = (cmd, args) => { try { return { code: 0, out: run(cmd, args) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };
const edit = (rel, from, to) => { const f = path.join(C, rel), t = fs.readFileSync(f, 'utf8'); if (!t.includes(from)) throw new Error(rel + ' no longer contains ' + from); fs.writeFileSync(f, t.replace(from, to)); };
const build = () => run(process.execPath, ['build.js'], { stdio: 'pipe' });
const unmerged = () => git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
try {
  execFileSync('git', ['clone', '-q', '--local', REPO, C], { stdio: 'pipe' });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(C, 'node_modules'));
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
  for (const f of ['build.js', 'tools/beatbox_heroes/sync_build.mjs', 'tools/beatbox_heroes/build_park3d.mjs']) fs.copyFileSync(path.join(REPO, f), path.join(C, f));   // the code under test, committed or not
  const base = git('rev-parse', 'HEAD').trim(), baseBranch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  build(); git('add', '-A'); try { git('commit', '-q', '-m', 'baseline: rebuilt in the clone'); } catch (e) { /* already identical */ }
  void base;
  const A_FROM = 'Set interrupted.', B_FROM = 'BUSKING SET';

  git('checkout', '-q', '-b', 'a'); edit('beatbox_heroes/park3d/mg_rhythm.js', A_FROM, 'Set interrupted AAA.'); build(); git('add', '-A'); git('commit', '-q', '-m', 'A');
  git('checkout', '-q', baseBranch); git('checkout', '-q', '-b', 'b'); edit('beatbox_heroes/park3d/mg_rhythm_ui.js', B_FROM, 'BUSKING SET BBB'); build(); git('add', '-A'); git('commit', '-q', '-m', 'B');
  git('checkout', '-q', 'a');

  /* a plain merge conflicts in the generated build files (that is the problem) */
  const m = tryRun('git', ['merge', '--no-commit', '--no-ff', 'b']);
  const conflicted = unmerged();
  ok(m.code !== 0 && conflicted.length > 0 && conflicted.every((f) => GENERATED.test(f) || /^beatbox_heroes\/[\w]+\.html$/.test(f)), 'merging B into A conflicts, and only in generated files or their page stamps (' + conflicted.length + ' files)');

  /* heroes:sync resolves it by rebuilding */
  const s = tryRun(process.execPath, ['tools/beatbox_heroes/sync_build.mjs']);
  ok(s.code === 0, 'heroes:sync succeeds (' + s.out.trim().split('\n').pop() + ')');
  eq(unmerged(), [], 'nothing is left unmerged');
  git('commit', '-q', '--no-edit');
  const bundle = fs.readFileSync(path.join(C, 'beatbox_heroes', 'park3d.bundle.js'), 'utf8');
  ok(bundle.includes('Set interrupted AAA.') && bundle.includes('BUSKING SET BBB'), 'the merged bundle carries BOTH branches\' changes');
  build();
  eq(git('status', '--porcelain', '--untracked-files=all'), '', 'the committed merge result is byte-identical to a fresh build of the merged sources');
  eq(git('ls-files', '-d'), '', 'no tracked file is missing');
  const again = tryRun(process.execPath, ['tools/beatbox_heroes/sync_build.mjs']);
  ok(again.code === 0 && /nothing to stage/.test(again.out), 'running it again on a clean tree is a no-op');

  /* a hand-written conflict is reported first and nothing is touched */
  git('checkout', '-q', baseBranch); git('checkout', '-q', '-b', 'c'); edit('beatbox_heroes/park3d/mg_rhythm.js', A_FROM, 'Set interrupted CCC.'); build(); git('add', '-A'); git('commit', '-q', '-m', 'C');
  git('checkout', '-q', 'a');
  const m2 = tryRun('git', ['merge', '--no-commit', '--no-ff', 'c']);
  const u2 = unmerged();
  ok(m2.code !== 0 && u2.includes('beatbox_heroes/park3d/mg_rhythm.js'), 'C and A edit the same line of a source file: a real conflict');
  const s2 = tryRun(process.execPath, ['tools/beatbox_heroes/sync_build.mjs']);
  ok(s2.code !== 0 && s2.out.includes('beatbox_heroes/park3d/mg_rhythm.js') && /hand-written/.test(s2.out), 'heroes:sync stops and names the hand-written file');
  eq(unmerged(), u2, 'and it touched nothing (the same files are still unmerged)');
  git('merge', '--abort');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
done();
