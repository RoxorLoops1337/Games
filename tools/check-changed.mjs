#!/usr/bin/env node
// `npm run check`, but only the suites for the games this branch changed.
//
// WHY. The full check runs every game's tests (about 7.5 minutes, nearly half of
// it blacksite). A one-line fix to one game should not wait on 45 other games,
// and a flaky suite in a game nobody touched should not block it either.
//
// HOW IT DECIDES. It diffs the branch against origin/main (committed, staged,
// unstaged and untracked files) and maps every changed path to suites:
//   <game folder>/...        that game's suites (GAME_SUITES below)
//   tests/<file>             every suite that runs or imports that file
//   functions/api/<x>.js     the suite for that endpoint (FUNCTION_SUITES)
//   tools/<dir>/...          the suite that uses that tool (TOOL_SUITES, or the
//                            game of the same name, or a suite importing it)
//   root *.md, docs/, .claude/, .gitignore, awesome_farm/   nothing (docs; Awesome Farm has its own check)
// Anything it cannot place (build.js, package.json, an unmapped folder, a new
// game) falls back to the FULL check. Unknown means "run everything", never
// "run nothing", so a gap in the map costs time, not safety.
//
//   node tools/check-changed.mjs            build + the changed games' suites
//   node tools/check-changed.mjs --dry      only print what it would run
//   node tools/check-changed.mjs --base X   diff against X instead of origin/main
//   node tools/check-changed.mjs --dry --files a,b   plan for these paths (to test the map)
//
// A NEW GAME: add its folder and its `test:` scripts to GAME_SUITES. Until then
// any change to it runs the full check, which is slow but correct.
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const GAME_SUITES = {
  no_room_for_heroes: ['test:boss'],
  kingshot_endless: ['test:kingshot'],
  encore_island: ['test:encore'],
  encore_island_3d: ['test:encore'],
  headliner: ['test:headliner'],
  horde_runner: ['test:horde'],
  spijker_master: ['test:spijker'],
  nineties_cars: ['test:cars'],
  frietkot_tycoon: ['test:frietkot'],
  horse_ranch: ['test:horse'],
  wildwalk: ['test:wildwalk', 'test:wwboard'],
  the_collection: ['test:collection'],
  ballistic: ['test:ballistic'],
  coin_pusher: ['test:pusher', 'test:pusherrender'],
  dungeon_pusher: ['test:dungeon', 'test:dpboard', 'test:dpsave', 'test:dpinball', 'test:dpfont'],
  cell_survivor: ['test:cells'],
  grimhold: ['test:grimhold'],
  leviathan_press: ['test:leviathan'],
  ironbridge: ['test:ironbridge'],
  'ironbridge-relay': ['test:ibrelay'],
  blacksite: ['test:blacksite'],
  flipper_crawl: ['test:flipper'],
  duck_fishing: ['test:ducks'],
  emberkin: ['test:emberkin'],
  birds_and_beasts: ['test:beasts', 'test:bbfont'],
  joske_de_flosser: ['test:joske'],
  merry_crashmas: ['test:crashmas'],
  donut_patrol: ['test:donut'],
  world_choir_games: ['test:choir', 'test:choirimport'],
  frostfell: ['test:frostfell', 'test:frostfont'],
  beatborne: ['test:beatborne'],
  grudge_draft: ['test:grudge'],
  clawspire: ['test:clawspire'],
  claw_crawl: ['test:claw'],
  pixel_colony: ['test:colony'],
  rogue_book: ['test:rogue_book'],
  hocus_vocus: ['test:hocus_vocus'],
  beatbox_heroes: ['test:heroes'],
  LoopDoku: ['test:loopdoku'],
};

// Folders the site serves that have no test suite: a change there only needs
// the build to succeed.
const NO_SUITE = [
  'Carnegiendon', 'DhauwieSurvival', 'beatbox_story', 'carmanager', 'chase_hq',
  'crypto', 'cutie_merge', 'decktest', 'evolve_and_conquer', 'gamedevloop',
  'mazekeep', 'messenger', 'night_shift', 'pitchdeck', 'ralpherizer',
  'roblox_obby', 'thieu_excuses_app', 'tower-defense-sprites', 'verb_collector',
];

const FUNCTION_SUITES = {
  'board.js': ['test:boss'],
  'save.js': ['test:boss'],
  'wildwalk_board.js': ['test:wwboard'],
  'dungeon_board.js': ['test:dpboard'],
  'dungeon_save.js': ['test:dpsave'],
};

const TOOL_SUITES = {
  choirscore: ['test:choirimport'],
  spritegrid: ['test:emberkin'],
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
const filesArg = args.includes('--files') ? args[args.indexOf('--files') + 1].split(',') : null;

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const CHECK_SUITES = [...pkg.scripts.check.matchAll(/npm run (test:[\w:]+)/g)].map((m) => m[1]);

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function changedFiles() {
  let base = baseArg;
  if (!base) {
    // Sessions clone a stale origin/main; a stale base makes every file merged
    // since look "changed" and forces the full check. Offline is fine: skip it.
    try { execSync('git fetch -q origin main', { stdio: 'ignore', timeout: 30000 }); } catch { /* offline */ }
    for (const ref of ['origin/main', 'main']) {
      try { base = sh(`git merge-base HEAD ${ref}`); break; } catch { /* try the next */ }
    }
  }
  if (!base) return null;
  const out = [
    sh(`git diff --name-only ${base}`),
    sh('git ls-files --others --exclude-standard'),
  ].join('\n');
  return [...new Set(out.split('\n').filter(Boolean))];
}

// Every file a suite runs, plus the tests/ helpers those files import.
function suiteFiles(suite) {
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f) || !statSync(f, { throwIfNoEntry: false })?.isFile()) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"`]\.\/([\w.-]+\.mjs)['"`]/g)) visit(`tests/${m[1]}`);
    for (const m of src.matchAll(/['"`]\.\.\/(tools\/[\w./-]+)['"`]/g)) visit(m[1]);
  };
  const script = pkg.scripts[suite] || '';
  for (const m of script.matchAll(/node ((?:tests|tools)\/[\w./-]+)/g)) visit(m[1]);
  // run_clawspire.mjs builds its test file names at runtime.
  if (suite === 'test:clawspire') {
    for (const f of sh('ls tests').split('\n')) if (f.startsWith('clawspire_')) visit(`tests/${f}`);
  }
  return seen;
}

function plan(files) {
  const suites = new Set();
  const why = [];
  for (const f of files) {
    const [top, ...rest] = f.split('/');
    if ((!rest.length && f.endsWith('.md')) || top === 'docs' || top === '.claude' || f === '.gitignore') continue;
    if (top === 'awesome_farm' || NO_SUITE.includes(top)) continue;
    if (GAME_SUITES[top]) { GAME_SUITES[top].forEach((s) => suites.add(s)); continue; }
    if (top === 'functions' && FUNCTION_SUITES[rest.at(-1)]) {
      FUNCTION_SUITES[rest.at(-1)].forEach((s) => suites.add(s)); continue;
    }
    if (top === 'tools' && rest.length > 1) {
      const own = TOOL_SUITES[rest[0]] || GAME_SUITES[rest[0]] ||
        CHECK_SUITES.filter((s) => suiteFiles(s).has(f));
      if (own.length) { own.forEach((s) => suites.add(s)); continue; }
    }
    if (top === 'tools' && rest.length === 1) {
      continue; // loose editors and one-off scripts (screenshots, timing); no suite runs them
    }
    if (top === 'tests') {
      const users = CHECK_SUITES.filter((s) => suiteFiles(s).has(f));
      // Helpers loaded by a computed path (hocus_vocus_player.mjs) belong to the
      // game whose name they start with.
      const game = Object.keys(GAME_SUITES).find((g) => rest[0].startsWith(`${g}_`));
      if (!users.length && game) users.push(...GAME_SUITES[game]);
      if (users.length) { users.forEach((s) => suites.add(s)); continue; }
    }
    why.push(f);
  }
  return { suites, why };
}

// A suite in `check` that no map above names means a game was added without
// telling this file. Say so, so the gap gets closed instead of silently costing
// a full check on every change to that game.
const mapped = new Set([...Object.values(GAME_SUITES), ...Object.values(FUNCTION_SUITES),
  ...Object.values(TOOL_SUITES)].flat());
const unmapped = CHECK_SUITES.filter((s) => !mapped.has(s));
if (unmapped.length) {
  console.log(`note: add ${unmapped.join(', ')} to GAME_SUITES in tools/check-changed.mjs\n`);
}

const files = filesArg || changedFiles();
let toRun;
if (!files) {
  console.log('could not find origin/main or main to diff against: running the full check');
  toRun = 'full';
} else {
  const { suites, why } = plan(files);
  if (why.length) {
    console.log(`these changes are not tied to one game, so this runs the FULL check:\n  ${why.slice(0, 10).join('\n  ')}${why.length > 10 ? `\n  ...and ${why.length - 10} more` : ''}`);
    toRun = 'full';
  } else {
    toRun = CHECK_SUITES.filter((s) => suites.has(s)); // keep check's order
    console.log(`${files.length} changed file${files.length === 1 ? '' : 's'} -> ` +
      (toRun.length ? toRun.join(', ') : 'no suites (build only)'));
  }
}

if (DRY) process.exit(0);

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
try {
  if (toRun === 'full') run('npm run check');
  else {
    run('node build.js');
    for (const s of toRun) run(`npm run ${s}`);
  }
} catch {
  process.exit(1);
}
console.log(toRun === 'full' ? '\nfull check passed' : `\nchanged-games check passed (${toRun.length} suite${toRun.length === 1 ? '' : 's'})`);
