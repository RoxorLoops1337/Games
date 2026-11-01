// The Beatbox Heroes 3D build (park3d.bundle.js, r3/entry.js, r3/p3-*.js) is COMMITTED: Cloudflare Pages runs no build and serves the repo as it is, so the
// committed files (and the hash stamped into the committed pages) are what players get. `node build.js` is the first step of `npm run check` and
// `check:changed` for every game, so it must be gentle with them. Before: it deleted ~55 tracked files up front and wrote them back at the very end, so a
// slow, failed or interrupted build left every other session sharing the checkout with "deleted" files.
import { ok, eq, done } from './beatbox_heroes_lib.mjs';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), HQ = path.join(REPO, 'beatbox_heroes');
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' });
const build = () => execFileSync(process.execPath, ['build.js'], { cwd: REPO, stdio: 'pipe' });
const deleted = () => git('ls-files', '-d').split('\n').filter(Boolean);
const sha10 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);

/* ---------------------------------------------------------------- what is committed (the site needs it) */
const tracked = git('ls-files', 'beatbox_heroes').split('\n').filter(Boolean);
const chunks = tracked.filter((f) => /^beatbox_heroes\/r3\/p3-[\w.-]+\.js$/.test(f));
ok(tracked.includes('beatbox_heroes/r3/entry.js') && tracked.includes('beatbox_heroes/park3d.bundle.js') && chunks.length > 10, 'the 3D build is committed (Pages runs no build): entry.js, park3d.bundle.js and ' + chunks.length + ' chunks');
ok(tracked.includes('beatbox_heroes/r3/boot3d.js') && tracked.includes('beatbox_heroes/r3/scenes_rhythm.js'), 'the hand-written r3 files are tracked too');

/* ---------------------------------------------------------------- a build killed half way never leaves a tracked file deleted */
await new Promise((resolve) => {
  const p = spawn(process.execPath, ['build.js'], { cwd: REPO, stdio: 'ignore' });
  setTimeout(() => { p.kill('SIGKILL'); }, 1500); p.on('exit', resolve);
});
eq(deleted(), [], 'a build killed after 1.5 s leaves no tracked file deleted');

/* ---------------------------------------------------------------- a full build: nothing deleted, nothing rewritten the second time */
build();
eq(deleted(), [], 'a full build deletes no tracked file');
ok(fs.existsSync(path.join(HQ, 'r3', 'boot3d.js')) && fs.existsSync(path.join(HQ, 'r3', 'scenes_rhythm.js')), 'the hand-written r3 files survive the build');
const mirror = ['park3d.bundle.js', 'r3/entry.js'].map((f) => path.join(HQ, f)).concat(fs.readdirSync(path.join(HQ, 'r3')).filter((f) => /^p3-.*\.js$/.test(f)).map((f) => path.join(HQ, 'r3', f)));
ok(mirror.length > 10 && mirror.every((f) => fs.existsSync(f)), 'the mirror is complete after the build (' + mirror.length + ' files)');
const state = git('status', '--porcelain', '--untracked-files=all'), mt = Object.fromEntries(mirror.map((f) => [f, fs.statSync(f).mtimeMs]));
build();
eq(git('status', '--porcelain', '--untracked-files=all'), state, 'building again changes nothing git can see');
ok(mirror.every((f) => fs.statSync(f).mtimeMs === mt[f]), 'an unchanged mirror is not rewritten by the next build');
eq(deleted(), [], 'still no tracked file deleted');

/* ---------------------------------------------------------------- the committed pages match the committed build (a stale build must not be committed) */
{
  const entryHash = sha10(path.join(HQ, 'r3', 'entry.js')), bundleHash = sha10(path.join(HQ, 'park3d.bundle.js'));
  const m = (f, re) => (fs.readFileSync(path.join(HQ, f), 'utf8').match(re) || [])[1];
  eq(m('index.html', /r3\/entry\.js\?v=([0-9a-f]+)/), entryHash, 'index.html pins the hash of r3/entry.js (if this fails: run node build.js and commit the result)');
  for (const f of ['index.html', 'park3d.html', 'flat3d.html', 'minigames3d.html', 'world3d.html']) eq(m(f, /park3d\.bundle\.js\?v=([0-9a-f]+)/), bundleHash, f + ' pins the hash of park3d.bundle.js (if this fails: run node build.js and commit the result)');
  const dist = fs.readFileSync(path.join(REPO, 'dist', 'beatbox_heroes', 'index.html'), 'utf8');
  ok(dist.includes('r3/entry.js?v=' + entryHash) && fs.existsSync(path.join(REPO, 'dist', 'beatbox_heroes', 'r3', 'entry.js')), 'dist/ carries the same stamped page and a fresh 3D build');
}
done();
