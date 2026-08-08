// EMBERKIN — which of the suite's checks can actually fail?
//
//   node tools/emberkin/tautology.mjs            # the whole set
//   node tools/emberkin/tautology.mjs --plant    # prove the sweep bites first
//
// Five passes running produced a check that no break could make fail: an
// `ok(at < arr.length)` after a findIndex (177), a count whose two sides were
// the same constant (178), a sweep that reported clean because it had crashed
// (179), and scene errors that read as findings (180, 181). Reading the suite
// does not find these — the 177 one sat under a comment claiming it proved
// something. Only mutation does: break the SUBJECT and see whether the check
// notices.
//
// This asserts nothing. It runs the render suite against a set of mutants and
// prints, per section, how many of that section's checks ever died. A section
// whose subject is mutated and whose checks all survive is where a sentence is
// hiding. It is NOT a claim that a never-killed check is worthless — this set
// is small and targeted, so most checks are simply out of its reach, and the
// report says which sections were aimed at.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME = join(REPO, 'emberkin', 'index.html');
const SUITE = join(REPO, 'tests', 'emberkin_render.test.mjs');
const TMP = process.env.EK_TMP || '/tmp/emberkin_mutants';
mkdirSync(TMP, { recursive: true });
const SRC = readFileSync(GAME, 'utf8');

// Each mutation is a real behaviour change, aimed at a section of the suite.
// `aims` names the sections it should be able to reach; a mutation that kills
// nothing at all is reported too, because that means the mutation missed.
const MUTANTS = [
  { name: 'motes: the fade removed', aims: ['no speck of air is ever born visible'],
    find: '    a: fade * breath,', to: '    a: breath,' },
  { name: 'motes: one shared clock', aims: ['no speck of air is ever born visible'],
    find: '  const life = 6 + fx * 5;', to: '  const life = 8;' },
  { name: 'motes: the draw threshold ignored', aims: ['no speck of air is ever born visible'],
    find: '    if (m.a < 1 / 255) continue;', to: '    if (false) continue;' },
  { name: 'arena: the ground haze deleted', aims: ['the element reaches the ground, not just the sky', 'the light is under the kin, not over them'],
    find: '  g.fillRect(0, hz.y, VIEW_W, hz.h); g.restore();', to: '  g.restore();' },
  { name: 'arena: haze weaker than nothing', aims: ['the element reaches the ground, not just the sky', 'PLANTED'],
    find: 'const SKY_WASH = .16, GROUND_HAZE = .12;', to: 'const SKY_WASH = .16, GROUND_HAZE = 0;' },
  { name: 'arena: the haze band stops short', aims: ['the element reaches the ground, not just the sky'],
    find: '  y: HORIZON + 6, h: VIEW_H - HORIZON - 6,', to: '  y: HORIZON + 6, h: 40,' },
  { name: 'chest: the replaced card unnamed', aims: ['a pull that costs you a card says which card'],
    find: "const swapNote = (c) => (c && c.replaced ? `replaced ${c.replaced}` : '');",
    to: "const swapNote = (c) => '';" },
  { name: 'chest: a full deck grows instead of swapping', aims: ['a pull that costs you a card says which card'],
    find: '  G.deck = G.deck.filter((u) => u !== worst.u);\n  G.deck.push(c.u);', to: '  G.deck.push(c.u);' },
  { name: 'menus: no way back at all', aims: ['back out of a menu row goes back to the menu', 'back out of a battle menu row goes back to the battle menu', 'and the pause menu still goes back the same way'],
    find: '  G.screen = { kind, i, sel: null, opt, prev: from, prevRow: fromRow, prevMenu: fromMenu };',
    to: '  G.screen = { kind, i, sel: null, opt, prev: from, prevRow: fromRow, prevMenu: null };' },
  { name: 'menus: the row forgotten', aims: ['back out of a menu row goes back to the menu', 'back out of a battle menu row goes back to the battle menu'],
    find: 'prevRow: fromRow, prevMenu: fromMenu };', to: 'prevRow: 0, prevMenu: fromMenu };' },
  { name: 'menus: the battle actions never come back', aims: ['back out of a battle menu row goes back to the battle menu'],
    find: "    if (s.prevMenu === 'battlemenu') openBattleActions(s.prevRow || 0);\n", to: '' },
  { name: 'menus: the pause menu never comes back', aims: ['back out of a menu row goes back to the menu', 'and the pause menu still goes back the same way'],
    find: "  if (s.prevMenu === 'mainmenu' && G.map) { openMainMenu({ i: s.prevRow || 0, quiet: true }); return; }\n", to: '' },
  { name: 'menus: the battle rows discard provenance again', aims: ['back out of a battle menu row goes back to the battle menu'],
    find: "    { label: 'Kin', fn: () => openScreen('party') },", to: "    { label: 'Kin', fn: () => { closeMenu(); openScreen('party'); } }," },
  { name: 'opening: no fade', aims: ['the game opens the way it changes any other scene'],
    find: 'const OPEN_FADE = .45;', to: 'const OPEN_FADE = 0;' },
  { name: 'covers: the screen is never covered', aims: ['a beat is not shown while the screen is covered'],
    find: 'const screenCovered = () => (G.fade > 0) || !!G.warp || G.wipe > 0;',
    to: 'const screenCovered = () => false;' },
  { name: 'ambush: the recoil never moves you', aims: ['being called out happens to you as well as to them'],
    find: 'const BUMP_T = .18;', to: 'const BUMP_T = 0;' },
  { name: 'exit: no cover handing the map back', aims: ['a fight hands the map back the way everything else does'],
    find: 'const BATTLE_OUT = .22;', to: 'const BATTLE_OUT = 0;' },
  { name: 'exit: the evolution keeps its hard cut', aims: ['a fight hands the map back the way everything else does'],
    find: '    if (nxt) runEvolution(nxt);\n    else backToWorld();', to: '    if (nxt) runEvolution(nxt);\n    else saveGame();' },
  { name: 'sound: the flourish borrows the level cue', aims: ['two different beats do not make the same sound'],
    find: "    battleBar(false);\n  }\n  playCue('win');", to: "    battleBar(false);\n  }\n  playCue('level');" },
  // A partial edit here is not a duplicate at all — the first version of this
  // mutant changed one of the three notes and killed nothing, which the sweep
  // correctly reported as a mutation that missed rather than as a sentence.
  { name: 'sound: win defined as a copy of level', aims: ['two different beats do not make the same sound'],
    find: "    blip(note(19), .14, 'triangle', .055);\n    blip(note(12), .26, 'triangle', .06, t + .1);\n    blip(note(0), .34, 'sine', .05, t + .1);",
    to: "    [0, 4, 7, 12].forEach((s2, i) => blip(note(12 + s2), .16, 'square', .05, t + i * .07));" },
  { name: 'said: the level names nothing', aims: ['a beat that changes your numbers says which ones'],
    find: "    const d = (after[k] || 0) - (before[k] || 0);\n    if (d) parts.push", to: "    const d = 0;\n    if (d) parts.push" },
  { name: 'said: zeroes named too', aims: ['a beat that changes your numbers says which ones'],
    find: "    if (d) parts.push(`${d > 0 ? '+' : ''}${d} ${label}`);", to: "    parts.push(`${d > 0 ? '+' : ''}${d} ${label}`);" },
  { name: 'skip: the evolution cannot be pressed past', aims: ['the longest beat in the game can be pressed past'],
    find: "  if (bi > 0 && a.i < bi && (justPressed('a') || justPressed('b'))) {", to: '  if (false) {' },
  { name: 'skip: the flourish stops answering', aims: ['every beat that can be pressed past still can'],
    find: "  if (f.t < FLOURISH_T && !justPressed('a') && !justPressed('b')) return true;", to: '  if (f.t < FLOURISH_T) return true;' },
  // ---- pass 188: aimed at the OLDEST sections, none of which had ever had a
  // mutant pointed at them. 75 of ~88 sections were unswept, and a 0 from this
  // tool only started meaning something once 187 made source checks visible.
  { name: 'wide: two maps lit the same way', aims: ['every map is lit as its own place'],
    find: "  lab:         { tint: [150, 190, 255], grade: .20, vig: .56, motes: 12,  mc: [190, 220, 255], drift: [2, -5] },",
    to:   "  lab:         { tint: [255, 208, 140], grade: .17, vig: .46, motes: 16, mc: [255, 226, 170], drift: [-4, -7] }," },
  { name: 'wide: a place loses its weather', aims: ['weather belongs to the place'],
    find: "  route_one: 'motes',", to: '' },
  { name: 'wide: a theme loses its lead', aims: ['every theme is shaped like something musicTick can play'],
    find: '  route: {                        // Route One: open, bright, walking pace',
    to:   '  route: { lead: [], bpm: 116, order: [0], bass: [0] }, routeOld: {' },
  { name: 'wide: the hand is a row, not a fan', aims: ['the hand is a fan, not a row'],
    find: 'function fanStyle(i, n, selected) {', to: 'function fanStyle(i, n, selected) { return \'\';' },
  { name: 'wide: a card face says nothing', aims: ['a card face carries everything you need to read it'],
    find: 'function cardHTML(c, opt = {}) {', to: 'function cardHTML(c, opt = {}) { if (c) return \'<div></div>\';' },
  { name: 'wide: a count never pluralises', aims: ['a count and its noun agree'],
    find: 'const countOf = (n, one, many) => `${n} ${n === 1 ? one : (many || one + \'s\')}`;',
    to:   'const countOf = (n, one, many) => `${n} ${one}`;' },
  { name: 'wide: the stats block goes blank', aims: ['the box shows what the kin under the cursor can do'],
    find: 'function statBlock(m) {\n  if (!m) return \'\';', to: 'function statBlock(m) {\n  return \'\';' },
  // Aimed at `shelve`, which is what that section actually tests. The first
  // version broke `screenList` — a different function the section never calls —
  // and reported 0 killed, which reads exactly like a section that cannot fail.
  { name: 'wide: the bag stops being shelved', aims: ['the screens have a shape'],
    find: 'function shelve(', to: 'function shelve(keys) { return [[\'All\', keys]]; }\nfunction shelveOld(' },

  { name: 'phone: the list never follows the cursor', aims: ['the list follows the cursor'],
    find: '  if (sel.top < box.scrollTop) return Math.max(0, sel.top);', to: '  return box.scrollTop;' },
  { name: 'phone: the list shifts under an in-view selection', aims: ['the list follows the cursor'],
    find: '  if (sel.top < box.scrollTop) return Math.max(0, sel.top);\n  const bottom', to: '  return Math.max(0, sel.top);\n  const bottom' },

  { name: 'grid: counts the document, not the cursor row', aims: ['the cursor moves by the grid it is in'],
    find: "  const scope = cur && cur.parentElement && cur.parentElement.querySelector(SEL)\n    ? cur.parentElement : els.screen;",
    to: '  const scope = els.screen;' },
  { name: 'grid: colsFrom counts every cell', aims: ['the cursor moves by the grid it is in'],
    find: '  for (const t of tops) { if (t !== top) break; n++; }', to: '  for (const t of tops) { void t; n++; }' },

  // A mutant only a SOURCE check can see, and one the game does not feel: the
  // stub DOM never looks up #pad, so nothing driven changes. It exists because
  // the suite used to read the game TWICE — loadGame honoured EK_GAME and the
  // source nets read a hardcoded path — so all 135 source checks were invisible
  // to every mutant, and a whole section came back 0 killed while the same
  // mutation by hand plainly killed a check in it. If this one stops biting,
  // the two reads have drifted apart again.
  { name: 'PLANTED SOURCE: the markup only a source net can see', aims: [], sourceOnly: true,
    find: 'id="pad"', to: 'id="padXX"' },
  // A mutant that is MEANT to bring the suite down, so the crash detector has a
  // live case. Without it that detector is unexercised — and it is the one that
  // found pass 182's fault, where 90 unrun checks read back as 90 survivors.
  { name: 'PLANTED CRASH: the arena throws', aims: [], crashes: true,
    find: 'function drawArena(g, tint, b) {',
    to: 'function drawArena(g, tint, b) { throw new Error("planted crash");' },
];

// A run that ENDED is not a run that crashed.
//
// The first version called any short run a crash, and a mutant that merely made
// a section assert fewer times — because the section reads a list out of the
// game's own output — was reported as taking checks off the board. A crash is
// the suite not reaching its own summary line; that is what to look for.
const ENDED = /emberkin_render: (\d+ checks passed|\d+ FAILED)/;
const run = (path) => {
  try {
    const out = execFileSync('node', [SUITE], {
      env: { ...process.env, EK_GAME: path, EK_TRACE: '1' },
      encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out;
  } catch (e) {
    // A failing suite exits 1 — that is the normal case for a mutant.
    return (e.stdout || '') + (e.stderr || '');
  }
};
const parse = (out) => {
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('@CHECK\t')) continue;
    const [, i, verdict, sec, ...rest] = line.split('\t');
    rows.push({ i: +i, ok: verdict === 'pass', sec, label: rest.join('\t') });
  }
  return rows;
};

const base = parse(run(GAME));
// An aim that names no section judges the wrong one, silently. The first run of
// this sweep aimed at 'the opening' and matched a section from an older pass,
// then reported 0/15 for a section the mutation never touched — while the real
// failures sat in 'the game opens the way it changes any other scene'. So aims
// are checked against the section names the suite actually printed, and an aim
// that matches nothing stops the sweep instead of quietly mis-scoring it.

if (!base.length) { console.error('the baseline produced no checks — the sweep is not running'); process.exit(1); }
const baseFails = base.filter((r) => !r.ok);
if (baseFails.length) { console.error(`the baseline is not green (${baseFails.length} failing) — nothing measured`); process.exit(1); }
console.log(`baseline: ${base.length} checks, all passing\n`);
{
  const names = new Set(base.map((r) => r.sec));
  const bad = [];
  for (const m of MUTANTS) for (const a of m.aims) {
    const hits = [...names].filter((n) => n.includes(a));
    if (!hits.length) bad.push(`${m.name}: aim ${JSON.stringify(a)} names no section`);
    else if (hits.length > 1) bad.push(`${m.name}: aim ${JSON.stringify(a)} names ${hits.length} sections — ${hits.join(' | ')}`);
  }
  if (bad.length) { console.error('the aims do not line up with the suite:\n  ' + bad.join('\n  ')); process.exit(1); }
}

// key by (section, ordinal in section) so a label whose text is interpolated
// still lines up when a mutant changes the value inside it.
const keyOf = (rows) => {
  const seen = new Map(), keys = [];
  for (const r of rows) {
    const n = (seen.get(r.sec) || 0);
    seen.set(r.sec, n + 1);
    keys.push(`${r.sec}#${n}`);
  }
  return keys;
};
const baseKeys = keyOf(base);
const killed = new Set();
const ran = new Set();      // keys seen in at least one mutant run
const crashed = new Set();
const killedBy = new Map();   // mutant name -> how many checks it killed
const missed = [];

for (const m of MUTANTS) {
  if (!SRC.includes(m.find)) { missed.push(`${m.name} — its anchor is not in the file`); continue; }
  const path = join(TMP, m.name.replace(/[^a-z0-9]+/gi, '_') + '.html');
  writeFileSync(path, SRC.replace(m.find, m.to));
  const out = run(path);
  const rows = parse(out);
  const keys = keyOf(rows);
  let n = 0;
  rows.forEach((r, idx) => { if (!r.ok) { n++; if (!m.crashes) killed.add(keys[idx]); } });
  // A check that never RAN is not a check that survived.
  //
  // A mutant that makes the suite throw takes every check after the throw off
  // the board, and the first version of this sweep counted all of them as
  // survivors — so the loudest thing it can say, "not one of these died", was
  // exactly what a crash looked like. It reported a section of mine as a
  // sentence on that basis. Deleting the pause menu's return threw at
  // `g.G.menu.i` and cost 90 checks.
  killedBy.set(m.name, n);
  const short = base.length - rows.length;
  const ended = ENDED.test(out);
  if (!m.crashes && ended) rows.forEach((r, idx) => ran.add(keys[idx]));
  if (!ended) crashed.add(m.name);
  console.log(`  ${n === 0 && !short ? '!!' : '  '} ${String(n).padStart(4)} killed   ${m.name}` +
    (!ended ? `   <- CRASHED: ${short} checks never ran and are not evidence` : '') +
    (ended && short > 0 ? `   (${short} fewer checks ran — a section that reads its own list)` : '') +
    (n === 0 && ended ? '   <- KILLED NOTHING: the mutation missed, or the section is a sentence' : ''));
}

// Only sections a mutation actually aimed at can be judged; the rest are simply
// out of reach of this set and are listed as such rather than accused.
const aimed = new Set(MUTANTS.flatMap((m) => m.aims));
const bySection = new Map();
base.forEach((r, i) => {
  if (!bySection.has(r.sec)) bySection.set(r.sec, { total: 0, dead: 0, unrun: 0, survivors: [] });
  const e = bySection.get(r.sec);
  e.total++;
  if (killed.has(baseKeys[i])) e.dead++;
  else if (!ran.has(baseKeys[i])) e.unrun++;      // never on the board, never judged
  else e.survivors.push(r.label);
});

// The sweep proves itself before it accuses anything.
//
// The suite carries one section holding a known sentence — an
// `ok(at < arr.length)` after a findIndex, the exact shape 177 shipped — beside
// a real check on the same subject. A working sweep kills the real one and
// leaves the sentence standing. If it cannot still do that, nothing below is
// worth reading, so it says so and stops.
{
  const e = [...bySection.entries()].find(([sec]) => sec.startsWith('PLANTED'));
  if (!e) { console.error('the planted section is gone — this sweep can no longer prove itself'); process.exit(1); }
  const [, p] = e;
  if (p.dead !== 1 || p.survivors.length !== 1 || !/SENTENCE/.test(p.survivors[0])) {
    console.error(`the sweep failed its own plant: ${p.dead} died, survivors ${JSON.stringify(p.survivors)}`);
    process.exit(1);
  }
  console.log('\nthe plant holds: the real check died, the sentence survived.');
  // …and the crash detector, which is the half that found this pass's fault.
  // …and the source-only plant, which proves the suite is reading the same game
  // it is running.
  const plants = MUTANTS.filter((x) => x.sourceOnly);
  if (!plants.length) {
    console.error('there is no source-only plant — this sweep can no longer tell whether the\n' +
      '  suite is reading the same file it runs, which is how 187 found 135 blind checks');
    process.exit(1);
  }
  for (const m of plants) {
    if (!killedBy.get(m.name)) {
      console.error(`the source-only plant killed nothing: ${m.name}\n` +
        '  the suite is reading a different file from the one it runs — every source check is blind');
      process.exit(1);
    }
  }
  console.log(`the source plant holds: a text-only change is seen (${plants.length} of them).`);

  const wantCrash = MUTANTS.filter((m) => m.crashes).map((m) => m.name);
  const missedCrash = wantCrash.filter((n) => !crashed.has(n));
  if (missedCrash.length) {
    console.error(`a mutant that should have brought the suite down did not: ${missedCrash.join(', ')}`);
    process.exit(1);
  }
  const falseCrash = [...crashed].filter((n) => !wantCrash.includes(n));
  console.log(`the crash detector holds: ${wantCrash.length} planted crash caught` +
    (falseCrash.length ? `, and ${falseCrash.length} real one(s): ${falseCrash.join(', ')}` : ', and no mutant crashes the suite by accident.'));
}

console.log('\n=== sections this set aimed at ===');
for (const [sec, e] of bySection) {
  if (![...aimed].some((a) => sec.includes(a))) continue;
  console.log(`\n  ${sec}\n    ${e.dead}/${e.total} checks died under mutation` +
    (e.unrun ? `, ${e.unrun} never ran under any of them` : ''));
  if (e.dead === 0 && e.unrun === e.total) console.log('    (this section was never on the board — every mutant that reached it crashed first)');
  else if (e.dead === 0) console.log('    !! NOT ONE of them died — every check here may be a sentence');
  else if (e.survivors.length) {
    console.log('    survivors (each may be out of reach, or may be unable to fail):');
    for (const s of e.survivors.slice(0, 12)) console.log('      · ' + s);
    if (e.survivors.length > 12) console.log(`      … and ${e.survivors.length - 12} more`);
  }
}
const outOfReach = [...bySection.entries()].filter(([sec]) => ![...aimed].some((a) => sec.includes(a)));
console.log(`\n${killed.size} of ${base.length} checks were killed by at least one of ${MUTANTS.length} mutations.`);
console.log(`${outOfReach.length} sections were not aimed at by this set and are not judged here.`);
for (const m of missed) console.log('  !! ' + m);
