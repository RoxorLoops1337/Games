#!/usr/bin/env node
// Golden master recorder for the Graftwork cleanup (graftwork/design/CLEANUP_PLAN.md, phase 0).
// Record once on the baseline, record again after a refactor, compare: every key must be identical.
//
//   node tools/graftwork_golden.mjs record <out.json> [--root <repo dir>] [--only engine,ui,assets,resume] [--scenes a,b] [--merge]
//                                      [--quick] [--jobs N] [--resume-from <baseline.json>] [--verify] [--classic-rng]
//                                      [--browser [--label <name> | --shots <dir>]]
//   node tools/graftwork_golden.mjs compare <a.json> <b.json> [--common]      every differing key, exit 1 on any difference
//   node tools/graftwork_golden.mjs compare-shots <dirA> <dirB> [--tolerance x]   mean absolute pixel difference per screenshot
//   node tools/graftwork_golden.mjs dump <ui|assets>/<scene>@<variant> <out.txt> [--root <repo dir>] [--warm | --pass N]
//                                                                             the full draw-call log of one scene: diff two of them
//   node tools/graftwork_golden.mjs list                                      scene and variant names
//
// The usual round:   record base.json --root <baseline checkout>        (once)
//                    record now.json --resume-from base.json            (after every change; --quick while iterating)
//                    compare base.json now.json                         (--common when now.json is a --quick record)
//
// --root runs against another checkout: the game is imported from <root>/graftwork, the fake-canvas recorder from
// <root>/tests/graftwork_rec_lib.mjs and the bots from <root>/tools/graftwork_driver.mjs (an older root without the shared driver:
// graftwork_sim.mjs + graftwork_strong.mjs), all by file URL, so this file may live outside that checkout. Default root: the repo
// this file is in. Every run is a Ward run: a root that still has the Classic map is recorded with the tool version of that root.
//
// Sections (each key of the JSON is one comparable fact; `meta` and `payloads` are never compared):
//   engine  seeded full runs for every hero x 9 seeds (ascension 0 / 4 / 7 / 10, Assist, the starting pool, two "deep" seeds with
//           a hit point cheat that reach the last floor, one of them through an Endless loop; one run per Daily modifier): the strong
//           bot from the root's driver, the Ward builder and walker replicated here. Per run a step trace (every morning, walk,
//           fight, reward, graft, shop, forge and event choice with hp, gold and the rng state after it), the final deck, relics,
//           stats, the save payload hash and the meta progression after it. Keys keep the `ward` segment (`runs/marrow.ward.a0`) they
//           had while there were two modes. Plus probes: rng streams, cardSpec and rules text for every card x grafts, every card /
//           graft / relic / potion / event choice / enemy / building card driven through a fixed fight or choice, a new run for
//           every hero and ascension, unlock tables, Ward tables and kit recipes.
//   resume  save compatibility: runs saved after k steps (between screens, mid combat, mid Ward walk, after a graft, on a reward,
//           event, shop, at night), the payload stored in the file, then continued FROM THE PAYLOAD to the end. With
//           --resume-from <baseline.json> the baseline's payloads are continued under this root's code (`end`), next to what this
//           root's code would have saved at the same point (`savedBy`). The Ward saves of tests/fixtures/graftwork_wardsave_*.json
//           are continued too (`wardFixture`). The saves of tests/fixtures/graftwork_oldsave_*.json are runs on the retired Classic
//           map: each gets the trace of its closing (`retired`: what engine/meta.js retireClassicRun returns and leaves in the meta).
//   ui      the real boot (main.js) on the recording canvas: every screen, on the desktop stage (1280x720) and the phone stage
//           (844x390, scale 0.54, touch taps, device pixel ratio 3), reduced motion off and on, fixed dt 1/60, a fake clock for
//           performance.now and Date, a seeded Math.random. Script: enter, 90 frames, scripted inputs, 60 frames (some longer).
//           Recorded: sha1 of the canvas call stream (method names, arguments to 3 decimals, property sets, offscreen canvases,
//           Path2D), the call count, the hash after each part, the layout registry at the last frame, the script's trail.
//           One fresh process per scene and variant; the script runs twice in it: `cold`, then `warm` (caches built).
//   assets  the same with the real manifests of <root>/graftwork/assets and fake images that carry the real files' sizes (a
//           missing file fails like a 404; pixel reads answer a fixed mannequin so the puppet walk has legs to cut): Ward kit
//           rooms, battle sprites and frames, the title scene in kit mode. Also what each scene asked the network for (files,
//           bytes). The phone has device pixel ratio 1 here, so it asks for the @1x files.
//   browser (--browser) Playwright Chromium screenshots (1280x720, and 1000x462 at device pixel ratio 2) with reduced motion and a
//           frozen clock, PNG files outside the repo (default /tmp/claude-0/golden/<label>/), their pixel hashes in the JSON.
//
// --quick is a strict subset of the full record (2 seeds, 3 save points, the variants desk.motion and phone.reduced, the cold
// pass only, 5 screenshots): compare a quick record with a full baseline with `compare --common`.
// --scenes shop,forge records only those ui / assets scenes; --merge keeps everything this run does not record from the file that
// is already at <out.json> (to re-record one section or one scene of a golden file).
// --classic-rng is for ONE comparison: against a record made before the Classic map was retired. Fights, graft tables, forges and
// content probes were recorded on Classic runs then, and the map generator had drawn from run.rng before the scene's first draw. With
// this flag the vehicles of those probes and scenes get that very stream (the retired generator's draws are replayed, see
// classicMapDraws; no map is built), so everything that did not depend on the map compares equal. Never use it for a new reference.
// --verify runs every child a second time in a fresh process and fails on any difference (the proof that a record is
// deterministic); it also reports the scenes where a third pass in the same process still differs from the second.
// Determinism: cold and warm differ by design (card faces, panel textures, sprite layers are cached per process), which is why
// each scene has its own process. Nothing reads the real clock or the real Math.random. A change to THIS file can change hashes:
// record the baseline again with the same version of the tool before comparing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), '..');
const argv = process.argv.slice(2);
const CMD = argv[0];
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 || i + 1 >= argv.length || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const VALUE_FLAGS = new Set(['root', 'only', 'scenes', 'resume-from', 'shots', 'label', 'jobs', 'key', 'pass', 'tolerance']);
const positional = (() => { const out = []; for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) { if (VALUE_FLAGS.has(argv[i].slice(2))) i++; continue; } out.push(argv[i]); } return out; })();
const ROOT = path.resolve(opt('root', REPO));
const QUICK = flag('quick');
const CLASSIC_RNG = flag('classic-rng');
const TOOL_VERSION = 2; // 2: Ward runs only (the Classic map is retired), bots from tools/graftwork_driver.mjs, --classic-rng
const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const h12 = (s) => sha1(s).slice(0, 12);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const HEROES = ['marrow', 'wick', 'odile'];

// Canonical text of any value: sorted keys, functions as "fn" (their behaviour is what the runs and probes measure), cycles cut.
function canon(v, seen = new Set()) {
  if (v === null || v === undefined) return 'null';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return String(v);
  if (t === 'function') return '"fn"';
  if (t !== 'object') return JSON.stringify(String(v));
  if (seen.has(v)) return '"cycle"';
  seen.add(v);
  let out;
  if (Array.isArray(v)) out = '[' + v.map((x) => canon(x, seen)).join(',') + ']';
  else if (v instanceof Set) out = '{"set":' + canon([...v], seen) + '}';
  else if (v instanceof Map) out = '{"map":' + canon([...v], seen) + '}';
  else out = '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k], seen)).join(',') + '}';
  seen.delete(v);
  return out;
}
const hc = (v) => h12(canon(v));

// ---------------------------------------------------------------- determinism: one fake clock, one seeded Math.random
// Installed in every child before any game module loads (ui/audio.js keeps a reference to Math.random at import).
const DET = { clock: 1e6, seed: 0 };
function installDeterminism() {
  process.env.TZ = 'UTC';
  for (const k of Object.keys(process.env)) if (/^GW_/.test(k)) delete process.env[k]; // the bots read GW_* knobs at import
  const RealDate = Date;
  const rnd = () => { DET.seed = (DET.seed + 0x6D2B79F5) >>> 0; let t = DET.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  // wall time is 2026-01-05T00:00:00Z plus the fake milliseconds, so every date the game writes (history, achievements) is fixed too
  const EPOCH = 1767571200000, wall = () => EPOCH + Math.floor(DET.clock);
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(wall()); } static now() { return wall(); } }
  globalThis.Date = FakeDate;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => DET.clock, mark() {}, measure() {} }, configurable: true, writable: true });
  resetDeterminism();
}
function resetDeterminism() { DET.clock = 1e6; DET.seed = 0x9e3779b9; }
const REAL_NOW = (() => { const hr = process.hrtime.bigint; return () => Number(hr()) / 1e6; })(); // real milliseconds for the runtime report only

// ---------------------------------------------------------------- engine: loader
function memoryStorage() { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear() }; }
async function loadEngine() {
  const driver = fs.existsSync(path.join(ROOT, 'tools/graftwork_driver.mjs')); // the shared driver of the balance tools; an older root keeps the bots in two files
  const files = { RUN: 'graftwork/engine/run.js', C: 'graftwork/engine/combat.js', WD: 'graftwork/engine/ward.js', K: 'graftwork/engine/cards.js', D: 'graftwork/data/index.js', RNG: 'graftwork/engine/rng.js', TEXT: 'graftwork/engine/text.js', META: 'graftwork/engine/meta.js', SAVE: 'graftwork/engine/save.js', UNL: 'graftwork/data/unlocks.js', WDATA: 'graftwork/data/ward.js', KIT: 'graftwork/data/ward_kit.js', KITBIG: 'graftwork/data/ward_kit_big.js', ...(driver ? { SIM: 'tools/graftwork_driver.mjs' } : { SIM: 'tools/graftwork_sim.mjs', STRONG: 'tools/graftwork_strong.mjs' }) };
  const E = {};
  for (const [k, f] of Object.entries(files)) E[k] = await imp(f);
  E.pol = E.SIM.POLICIES.strong; // the strong policy (an older root: tools/graftwork_strong.mjs registers it on import)
  E.wardPol = { ...E.pol, pickGraft: (run, pol) => wardPickGraft(E, run, pol) };
  return E;
}

// ---------------------------------------------------------------- engine: the run driver (one call = one screen's worth of decisions)
// Fights, graft picks, shop, forge and events use the root's own bots (tools/graftwork_driver.mjs). The Ward builder and walker are
// replicated here (from the driver's strongMorning / strongWalk) with one difference: the walker's tie-break dice come from the run
// state, never from a bot-side rng, so a run resumed from a save makes the same choices.
const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const manh = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const roomCount = (run, type) => Object.values(run.ward.rooms).filter((r) => r.type === type).length;

const WANT = { rm_sawmill: 2, rm_quarry: 2, rm_ward: 3, rm_isolation: 2, rm_chapel: 1, rm_dispensary: 1, rm_workshop: 1, rm_linen: 1, rm_counting: 1, rm_generator: 3, rm_pharmacy: 1, rm_library: 1, rm_morgue: 1, rm_kitchen: 1, rm_boiler: 1, rm_laundry: 1, rm_isolation2: 1 };
const EXPAND_W = { rm_ward: 4.2, rm_workshop: 3.2, rm_chapel: 3, rm_library: 2.8, rm_kitchen: 2.4 };
const ROAD_W = 0.6, EARLY_HP = 0.65;
function theatreLinked(E, run) {
  const w = run.ward, th = E.WD.theatreOf(run), seen = new Set([w.hero.room]), q = [w.hero.room];
  while (q.length) { const id = q.shift(); if (id === th.id) return true; for (const n of E.WD.neighbors(run, id)) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return false;
}
function roomPriority(E, run, type) {
  const w = run.ward, have = roomCount(run, type), pw = E.WD.wardPower(run), need = E.WDATA.ROOMS[type].power;
  if (type === 'rm_corridor') return !theatreLinked(E, run) ? 6.5 : w.day >= w.dayLimit - 4 && w.res.wood >= 2 ? 5 : w.res.wood >= 3 ? 1 : 0.2;
  if (type === 'rm_generator') return pw.free < 1 ? 9 : pw.free < 2 ? 3 : 0;
  if (have >= (WANT[type] || 1)) return 0;
  if (need && pw.free < need) return 0.5;
  const base = { rm_sawmill: 8, rm_quarry: 8, rm_ward: 7, rm_isolation: have === 0 ? 9.5 : 6, rm_chapel: 4, rm_dispensary: 5, rm_workshop: 6, rm_linen: 5, rm_counting: 3, rm_pharmacy: 3.5, rm_library: 4.5, rm_morgue: 3, rm_kitchen: 3, rm_boiler: roomCount(run, 'rm_ward') >= 2 ? 4 : 0, rm_laundry: run.deck.some((x) => x.id.startsWith('j_')) ? 3 : 0, rm_isolation2: have === 0 && w.day >= 2 ? 6.5 : 0 }[type] || 2;
  return base - have * 2;
}
function bestCell(E, run, type) {
  const w = run.ward, cells = E.WD.buildCells(run);
  if (!cells.length) return null;
  const th = E.WD.theatreOf(run), hero = w.rooms[w.hero.room], ent = E.WD.entranceOf(run);
  const score = (c) => {
    if (type === 'rm_corridor') return -manh(c, [th.x, th.y]) * 2 - manh(c, [hero.x, hero.y]) * 0.3;
    return E.WDATA.ROOMS[type].spawn ? -manh(c, [ent.x, ent.y]) * 0.6 - manh(c, [hero.x, hero.y]) * 0.6 : -Math.abs(c[1] - ent.y) * 0.2 - manh(c, [th.x, th.y]) * ROAD_W;
  };
  return cells.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s)[0].c;
}
function wardMorning(E, run) {
  const { WD } = E, w = run.ward, ROOMS = E.WDATA.ROOMS, BUILD = E.WDATA.BUILD_CARDS, played = [];
  for (let g = 0; g < 20; g++) {
    const opts = [];
    for (const inst of w.deck.hand) {
      const card = BUILD[inst.id];
      if (card.kind === 'room') {
        const p = roomPriority(E, run, card.room); if (p <= 0) continue;
        const cell = bestCell(E, run, card.room); if (!cell) continue;
        opts.push({ p, uid: inst.uid, id: inst.id, target: { x: cell[0], y: cell[1] } });
      } else if (card.kind === 'expand') {
        const pw = WD.wardPower(run);
        for (const r of Object.values(w.rooms)) {
          const want = EXPAND_W[r.type]; if (!want) continue;
          const ex = WD.expandOptions(run, r.id); if (!ex.ok) continue;
          if (ROOMS[r.type].power && pw.free < 1) continue;
          const c = ex.cost; if (w.res.wood - (c.wood || 0) < 1 || w.res.stone - (c.stone || 0) < 1 || run.gold - (c.gold || 0) < 40) continue;
          opts.push({ p: want - (r.type === 'rm_ward' ? roomCount(run, 'rm_ward') * 0.3 : 0), uid: inst.uid, id: inst.id, target: r.id });
        }
      } else if (card.kind === 'upgrade') {
        const want = { b_reinforced_beds: 4, b_overtime: 3, b_scrub_in: 3, b_sterile_field: 2, b_iron_doors: 0.5, b_double_doors: 0.4, b_soundproofing: 1.5 }[card.id] || 0;
        if (want > 0) for (const r of Object.values(w.rooms)) if (card.on.includes(r.type)) opts.push({ p: want, uid: inst.uid, id: inst.id, target: r.id });
      } else {
        const hpF = run.hp / run.maxHp, rooms = Object.values(w.rooms);
        const wardsFull = rooms.some((r) => r.type === 'rm_ward' && r.contents.length >= 4);
        const v = { move: 6, rations: 2.5, lamp: rooms.some((r) => !r.on && ROOMS[r.type].power) ? 3 : 0, heal: hpF < 0.85 ? 5 : 0, res: 5, tick: 2, flood: w.day >= 2 ? 2 : 0, otpay: run.gold < 150 ? 3 : 0, nurse: hpF < 0.75 ? 3 : 0, fumigate: wardsFull ? 3.5 : 0, power: WD.wardPower(run).free < 1 ? 3 : 0, linens: rooms.some((r) => r.type === 'rm_linen' && r.timers.spawn > 1 && !r.contents.length) && hpF < 0.8 ? 3 : 0, shift: 2, ledger: 3.5 }[card.effect] || 0;
        if (v <= 0) continue;
        let target = null;
        if (card.effect === 'res') target = w.res.wood <= w.res.stone ? 'wood' : 'stone';
        if (card.effect === 'fumigate') { const r = rooms.filter((x) => x.type === 'rm_ward').sort((a, b) => b.contents.length - a.contents.length)[0]; if (!r || r.contents.length < 4) continue; target = r.id; }
        if (card.effect === 'tick') { const r = rooms.find((x) => x.type === 'rm_ward' && x.on) || rooms.find((x) => WD.everyOf(x) && x.on); if (!r) continue; target = r.id; }
        opts.push({ p: v, uid: inst.uid, id: inst.id, target });
      }
    }
    opts.sort((a, b) => b.p - a.p);
    let done = false;
    for (const o of opts) if (WD.playBuildCard(run, o.uid, o.target).ok) { played.push(o.id + '>' + (o.target && typeof o.target === 'object' ? o.target.x + ',' + o.target.y : o.target)); done = true; break; }
    if (!done) break;
  }
  for (const r of Object.values(w.rooms)) if (!r.on && ROOMS[r.type].power && WD.togglePower(run, r.id).ok) played.push('on>' + r.id);
  WD.endMorning(run);
  return played;
}
function walkScore(E, run, pv) {
  const { WD } = E, w = run.ward, hpF = run.hp / run.maxHp, ph = w.phase, act = run.act, per = 3.5 + act * 0.5;
  let s = 0, fights = 0, hp = run.hp;
  for (const t of pv.triggers) {
    if (t.bribed) continue;
    if (t.kind === 'fight') { fights++; const cost = t.detail.count * per * (ph === 'night' ? 1.35 : 1); s += 5 + t.detail.count * 1.5 - cost * (hp / run.maxHp < 0.5 ? 1.6 : 0.5); hp -= cost; }
    else if (t.kind === 'elite') { const cost = 18 + act * 4 + (t.detail.level >= 2 ? 10 : 0) + (ph === 'night' ? 6 : 0); s += hp - cost > run.maxHp * 0.35 ? 14 : -30; hp -= cost; }
    else if (t.kind === 'event') s += ph === 'midday' ? 7 : 5;
    else if (t.kind === 'shop') s += run.gold >= 120 ? 8 : run.gold >= 60 ? 3 : 0.5;
    else if (t.kind === 'forge') s += hpF < 0.7 ? 11 : 6;
    else if (t.kind === 'rest') s += (1 - hpF) * 22;
    else if (t.kind === 'boss') s += t.detail.early ? (hpF >= EARLY_HP && hp >= run.maxHp * EARLY_HP ? 30 : -40) : 100;
  }
  if (fights > 2) s -= (fights - 2) * 4;
  if (hp < run.maxHp * 0.25) s -= 25;
  s -= pv.offPenalty * 0.6;
  if (pv.wait) s += 1;
  if (WD.bossOpen(run) && hpF >= EARLY_HP && !pv.triggers.some((t) => t.kind === 'boss') && pv.path && pv.path.length) {
    const th = WD.theatreOf(run), end = w.rooms[pv.path[pv.path.length - 1]];
    if (end) s += Math.max(0, 8 - manh([end.x, end.y], [th.x, th.y])) * 1.2;
  }
  return s;
}
function pathR(E, run, rid, alt = 0) { // a walk is at most the roll: pathTo cut to it
  const { WD } = E, p = WD.pathTo(run, rid, alt);
  if (!p.ok || p.wait || p.forced) return p;
  const n = WD.rollOf(run).n, info = (pth) => WD.routeInfo(run, pth.slice(0, n)), main = info(p.path);
  return { ...p, path: main.path, triggers: main.triggers, offPenalty: main.offPenalty, cost: main.path.length, alts: p.alts.map((a) => { const i = info(a.path); return { path: i.path, triggers: i.triggers, offPenalty: i.offPenalty }; }) };
}
function wardWalk(E, run) {
  const { WD } = E, w = run.ward, day = w.day, phase = w.phase;
  let best = null, bs = -1e9;
  for (const rid of Object.keys(w.rooms)) {
    const p = pathR(E, run, rid); if (!p.ok) continue;
    const variants = [{ ...p, alt: 0 }, ...p.alts.map((a, i) => ({ ...a, alt: i + 1, wait: p.wait }))];
    for (const v of variants) { const s = walkScore(E, run, v) + (fnv(`${run.seed}:${day}:${phase}:${rid}:${v.alt}`) % 1000) / 1000 * 0.3; if (s > bs) { bs = s; best = [rid, v.alt]; } }
  }
  if (!best) best = [w.hero.room, 0];
  const p = pathR(E, run, best[0], best[1]);
  let r;
  if (!p.ok || p.wait || p.forced) r = WD.startWalk(run, best[0], best[1]);
  else { WD.clearRoute(run); for (const id of p.path) if (!WD.extendRoute(run, id).ok) break; r = WD.startRoute(run); }
  if (r === false) throw new Error('illegal walk ' + run.ward.why);
  return best[0] + '/' + best[1] + (p.wait ? ' wait' : p.forced ? ' forced' : ' ' + (p.path || []).join('>'));
}
function wardPickGraft(E, run, pol) {
  const { RUN, K, D } = E, offer = run.pending.offer, focus = {};
  for (const inst of run.deck) for (const s of K.schoolsOf(K.cardSpec(inst))) focus[s] = (focus[s] || 0) + 1;
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  let best = null, bs = -1e9;
  for (const uid of offer.cards) {
    const inst = RUN.findInst(run, uid);
    for (const gid of offer.grafts) {
      if (!K.canGraft(inst, gid)) continue;
      const r = E.SIM.graftScore(run, inst, gid, pol);
      if (r.strain > pol.maxStrain) continue;
      const g = D.GRAFTS[gid];
      let s = r.s;
      if (g.mods.some((m) => m.k === 'custom')) s -= 0.5 * ({ common: 2, uncommon: 3.5, rare: 5 }[g.rarity] || 2);
      if (top && g.school === top[0]) s += 1.5; else if (top && (focus[g.school] || 0) >= 2) s += 0.7;
      if (inst.grafts.length === 2 && r.strain === 0 && !run.flags.gwOverloaded && (fnv(run.seed + ':over') % 1000) / 1000 < 0.35) s += 3.5;
      if (s > bs) { bs = s; best = [uid, gid]; }
    }
  }
  const pick = best && bs >= 1.5 ? best : null;
  if (pick && RUN.findInst(run, pick[0]).grafts.length === 2) run.flags.gwOverloaded = true;
  return pick;
}
function buildValue(E, run, id) {
  const c = E.WDATA.BUILD_CARDS[id];
  if (c.kind === 'room') return roomPriority(E, run, c.room);
  return { b_reinforced_beds: 6, b_morning_rounds: 5, b_requisition: 4, b_rations: 3, b_overtime: 3, b_scrub_in: 3, b_triage: 2 }[id] || 1;
}
const instName = (inst) => (inst ? inst.id + (inst.up ? '+' : '') : 'none');
const deckLine = (run) => run.deck.map((i) => i.id + (i.up ? '+' : '') + (i.grafts.length ? '{' + i.grafts.join(',') + '}' : '') + (i.fused && i.fused.length ? '[' + i.fused.join(',') + ']' : ''));

// One step. Appends one line to the trace T: what was chosen, then hp/maxHp, gold and the rng state.
function stepRun(E, run, T, o = {}) {
  const { RUN, WD, SIM } = E, pol = E.wardPol;
  let ev;
  switch (run.phase) {
    case 'ward': {
      const w = run.ward, day = w.day, ph = w.phase;
      if (ph === 'morning') ev = ['morning', day, wardMorning(E, run).join(' ') || '-'];
      else ev = ['walk', day, ph, wardWalk(E, run)];
      break;
    }
    case 'combat': {
      const p = run.pending, kind = p.fightKind, foes = p.enemies.join('+');
      if (o.deep) run.hp = run.maxHp;
      const where = `d${run.ward.day}${run.ward.phase[0]}`, act = run.act;
      const { res } = pol.fight(run, pol);
      RUN.resolveFight(run, res);
      ev = ['fight', 'a' + act, where, kind, foes, res.win ? 'win' : 'loss', 't' + res.turns];
      break;
    }
    case 'reward': {
      const rw = run.pending; ev = ['reward', 'g' + (rw.gold || 0)];
      RUN.claimGold(run, rw);
      if (rw.relic) { RUN.addRelic(run, rw.relic); ev.push('relic:' + rw.relic); }
      if (rw.relicChoices && rw.relicChoices.length) {
        let id; // eslint-disable-line prefer-const
        const plain = rw.relicChoices.filter((r) => !E.D.RELICS[r].ward); id = plain.length ? pol.pickRelic(plain) : rw.relicChoices[0]; // the ranking knows the combat relics; a building relic only when nothing else is offered
        RUN.addRelic(run, id); ev.push('pick:' + id + '/' + rw.relicChoices.join(','));
      }
      if (rw.potion) { RUN.addPotion(run, rw.potion); ev.push('potion:' + rw.potion); }
      if (rw.buildChoice) { const id = rw.buildChoice.map((b) => ({ b, v: buildValue(E, run, b) })).sort((a, b) => b.v - a.v)[0].b; ev.push('plan:' + id + '/' + rw.buildChoice.join(',')); WD.takeBuildChoice(run, id); }
      RUN.afterReward(run); break;
    }
    case 'graft': {
      const offer = run.pending.offer, pick = SIM.chooseGraft(run, pol);
      if (pick) { ev = ['graft', instName(RUN.findInst(run, pick[0])), pick[1], 'of', offer.grafts.join(',')]; RUN.applyGraft(run, pick[0], pick[1]); }
      else { const ch = run.hp / run.maxHp < 0.7 ? 'heal' : 'budget'; RUN.skipGraft(run, ch); ev = ['skip', ch, 'of', offer.grafts.join(',')]; }
      RUN.afterGraft(run); break;
    }
    case 'shop': {
      const shop = run.pending;
      if (shop.builds) { const want = shop.builds.map((b, i) => ({ b, i, v: buildValue(E, run, b.id) })).filter((x) => x.v >= 5 && run.gold >= x.b.price + 60).sort((a, b) => b.v - a.v)[0]; if (want) RUN.shopBuy(run, 'build', want.i); }
      SIM.doShop(run, pol, { shops: 0 });
      ev = ['shop'];
      for (const k of ['cards', 'grafts', 'relics', 'potions', 'builds']) for (const it of shop[k] || []) ev.push((it.sold ? '*' : '') + it.id + '@' + it.price);
      ev.push('removed' + run.shopUses.remove);
      break;
    }
    case 'forge': {
      const hp0 = run.hp, b0 = run.budgetBonus, d0 = deckLine(run).join(' ');
      SIM.doForge(run, pol);
      ev = ['forge', 'hp' + (run.hp - hp0), 'budget' + (run.budgetBonus - b0), deckLine(run).join(' ') === d0 ? 'deck=' : 'deck*'];
      break;
    }
    case 'event': {
      const id = run.pending.id, cand = RUN.eventChoices(run).filter((x) => x.ok && (!x.pick || x.cards.length));
      const best = cand.map((c) => ({ c, s: SIM.eventScore(run, c) })).sort((a, b) => b.s - a.s)[0].c;
      let uid; if (best.pick === 'card') uid = SIM.pickEventCard(run, best, best.cards);
      ev = ['event', id, 'choice' + best.i, uid === undefined ? '' : instName(RUN.findInst(run, uid))];
      RUN.eventChoose(run, best.i, uid); RUN.afterEvent(run); break;
    }
    default: throw new Error('stuck in phase ' + run.phase);
  }
  T.push(`${ev.join(' ')} | ${run.hp}/${run.maxHp} ${run.gold}g rng${run.rng.state} ${h12(deckLine(run).join(' ') + '|' + run.relics.join(',') + '|' + run.potions.join(','))}`);
}
const ended = (run) => run.phase === 'dead' || run.phase === 'won';
function finishRun(E, run, T, o = {}) {
  let guard = 0, looped = false;
  for (;;) {
    while (!ended(run) && guard++ < 4000) stepRun(E, run, T, o);
    if (run.phase === 'won' && o.loop && !looped) { looped = true; E.RUN.startLoop(run); T.push(`loop ${run.loop} | ${run.hp}/${run.maxHp} ${run.gold}g rng${run.rng.state}`); continue; } // Endless: what the end screen does (the next loop opens on a fresh first floor)
    break;
  }
  return summarize(E, run, T);
}
function summarize(E, run, T) {
  const si = E.K.strainInfo(run), payload = E.RUN.serializeRun(run);
  return {
    result: ended(run) ? run.phase : 'unfinished:' + run.phase, steps: T.length, act: run.act, loop: run.loop || 0, floors: run.stats.floors, day: run.ward ? run.ward.day : 0,
    hp: run.hp, maxHp: run.maxHp, gold: run.gold, budget: E.K.budgetOf(run), strain: si.strain, weight: si.weight,
    deck: deckLine(run), relics: run.relics.slice(), potions: run.potions.slice(), stats: canon(run.stats),
    save: sha1(payload), saveCanon: hc(JSON.parse(payload)), traceHash: sha1(T.join('\n')),
  };
}
function startRun(E, v, hero, seed) {
  const run = E.RUN.newRun({ hero, seed, ascension: v.asc || 0, assist: v.assist, unlocked: v.unlocked || 'all', daily: v.daily });
  if (v.deep) { run.maxHp += 200; run.hp = run.maxHp; } // the tool's own cheat: these seeds reach the late acts (and the final boss) whatever the bot does
  return run;
}
const RUN_VARIANTS = [
  { tag: 'a0' }, { tag: 'deep', deep: true }, // the two --quick seeds
  { tag: 'a0b' }, { tag: 'a4', asc: 4 }, { tag: 'a10deep', asc: 10, deep: true }, { tag: 'a7', asc: 7 },
  { tag: 'assist', assist: { on: true, sturdy: true, gentle: true, kind: true, mercy: true } }, { tag: 'start', unlocked: 'start' },
  { tag: 'endless', deep: true, loop: true }, // a won run goes on into one Endless loop (added with the Classic retirement: `deep` keeps the trace it always had)
];
function guarded(fn) { try { return fn(); } catch (e) { return { error: String(e && e.message || e).slice(0, 300) }; } }

async function sectionEngine() {
  installDeterminism(); memoryStorage();
  const E = await loadEngine(), { RUN, D, META } = E;
  const out = { runs: {}, dailyWard: {}, probes: {} };
  const variants = QUICK ? RUN_VARIANTS.slice(0, 2) : RUN_VARIANTS;
  // what main.js does around a run (onRunStart, recordRunEnd): the meta progression (Credit, unlock points, achievements, history) is part
  // of the golden. One profile plays the two --quick seeds of every hero in a row; every other seed has a fresh profile.
  // Keys and seeds keep the `ward` segment from the time there were two modes, so a record stays comparable with an older one.
  const career = META.defaultMeta();
  for (const hero of HEROES) for (const v of variants) {
    const key = `${hero}.ward.${v.tag}`, T = [], meta = RUN_VARIANTS.indexOf(v) < 2 ? career : META.defaultMeta();
    out.runs[key] = guarded(() => {
      const run = startRun(E, v, hero, `golden-${key}`);
      if (META.onRunStart) META.onRunStart(meta, run);
      const s = finishRun(E, run, T, v);
      if (ended(run)) { run.ended = true; s.endInfo = hc(META.recordRunEnd(meta, run, run.phase === 'won' ? 'won' : 'dead')); s.metaAfter = hc(meta); }
      return { ...s, trace: T };
    });
    if (out.runs[key].error) out.runs[key].trace = T;
  }
  if (!QUICK) { // one run per Daily modifier (the hero rotates). `dailyWard`: the `daily` key of older records held Classic runs
    RUN.DAILY_MODS.forEach((m, i) => {
      let seed = null; for (let k = 0; k < 4000 && !seed; k++) { const s = `daily-2026-01-${String(1 + (k % 28)).padStart(2, '0')}-${k}`; if (E.RNG.hashSeed(s) % RUN.DAILY_MODS.length === i) seed = s; }
      const T = [];
      out.dailyWard[m.id] = guarded(() => finishRun(E, startRun(E, { daily: seed }, HEROES[i % 3], seed), T, {}));
    });
  }
  Object.assign(out.probes, probes(E));
  return out;
}

// ---------------------------------------------------------------- engine: probes (every piece of content driven once, no bot involved)
const evSig = (e) => Object.keys(e).sort().map((k) => { const v = e[k]; return k + '=' + (v === null || typeof v !== 'object' ? String(v) : (v.uid !== undefined ? v.uid : v.id !== undefined ? v.id : Array.isArray(v) ? v.length : 'o')); }).join(',');
const stSig = (st) => Object.keys(st).filter((k) => st[k]).sort().map((k) => k + st[k]).join(',');
// A fixed fight: each turn play the first playable cards (the probed ones first), then end the turn. Returns one hash per turn.
function fightProbe(E, run, enemies, kind, turns, o = {}) {
  const { C } = E, c = C.newCombat(run, enemies, { kind }), out = [];
  const live = () => c.enemies.findIndex((e) => !e.dead);
  if (o.potion !== undefined && !c.over) { C.usePotion(c, o.potion, live()); }
  for (let t = 0; t < turns && !c.over; t++) {
    const line = [c.enemies.filter((e) => !e.dead).map((e) => e.id + ':' + hc(C.intentOf(c, e))).join(' ')];
    let plays = 0, guard = 0;
    while (!c.over && plays < 6 && guard++ < 40) {
      if (c.pending) { const p = c.pending, pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; C.resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); continue; }
      let hi = -1;
      for (let i = 0; i < c.hand.length; i++) { if (!C.canPlay(c, i).ok) continue; if (o.prefer && o.prefer(c.hand[i])) { hi = i; break; } if (hi < 0) hi = i; }
      if (hi < 0) break;
      line.push('play ' + c.hand[hi].inst.id);
      C.playCard(c, hi, C.needsTarget(c, hi) ? live() : null); plays++;
    }
    if (!c.over) C.endTurn(c);
    line.push(c.ev.map(evSig).join(';')); c.ev.length = 0;
    line.push(`P ${c.player.hp}/${c.player.maxHp} b${c.player.block} ${stSig(c.player.st)} e${c.energy} h${c.hand.length} d${c.drawPile.length} x${c.discard.length} ex${c.exhaust.length} rng${c.rng.state}`);
    for (const e of c.enemies) line.push(`${e.id} ${e.dead ? 'dead' : e.hp + '/' + e.maxHp} b${e.block} ${stSig(e.st)}`);
    out.push(h12(line.join('\n')));
  }
  return { c, turns: out, over: c.over || '-' };
}
// ---------------------------------------------------------------- --classic-rng: the stream a Classic run had
// The retired map generator (engine/run.js genMap as it was at 5f3e252b), kept here for its random draws only: nothing is returned. A
// vehicle that calls it after a bare newRun has the rng state a Classic run had when its first screen opened. See the header.
function classicMapDraws(run, act) {
  const rng = run.rng, COLS = 6;
  const rows = { 1: 10, 2: 10, 3: 11 }[act];
  const bossRows = act === 3 ? 2 : 1;
  const nodes = [];
  const byRow = [];
  for (let r = 0; r < rows; r++) {
    const last = r >= rows - bossRows;
    const count = last ? 1 : (r === 0 ? rng.range(3, 4) : rng.range(2, 4));
    const cols = last ? [2] : rng.sample([0, 1, 2, 3, 4, 5], count).sort((a, b) => a - b);
    const row = cols.map((col) => ({ id: `${act}-${r}-${col}`, row: r, col, type: 'fight', next: [], visited: false }));
    byRow.push(row); nodes.push(...row);
  }
  // edges: every node links to 1 or 2 nodes in the next row, and every node has an incoming edge
  for (let r = 0; r < rows - 1; r++) {
    const a = byRow[r], b = byRow[r + 1];
    const nearest = (n) => b.slice().sort((x, y) => Math.abs(x.col - n.col) - Math.abs(y.col - n.col));
    for (const n of a) {
      const near = nearest(n);
      n.next.push(near[0].id);
      if (near[1] && rng.chance(0.45) && Math.abs(near[1].col - n.col) <= 2) n.next.push(near[1].id);
    }
    for (const m of b) if (!a.some((n) => n.next.includes(m.id))) { const n = a.slice().sort((x, y) => Math.abs(x.col - m.col) - Math.abs(y.col - m.col))[0]; n.next.push(m.id); }
  }
  // types
  const set = (n, type) => { n.type = type; };
  const bossRow = rows - bossRows;
  if (act === 3) { set(byRow[rows - 2][0], 'boss'); set(byRow[rows - 1][0], 'final'); } else set(byRow[rows - 1][0], 'boss');
  const forgeRow = bossRow - 1;
  for (const n of byRow[forgeRow]) set(n, 'forge');
  for (const n of byRow[0]) set(n, 'fight');
  const mid = nodes.filter((n) => n.row >= 1 && n.row < forgeRow);
  const weights = [['fight', 52], ['event', 20], ['shop', 8], ['forge', 8], ['elite', 12]];
  for (const n of mid) {
    let w = weights.filter(([t]) => (t !== 'elite' || n.row >= 3) && (t !== 'shop' || n.row >= 2) && (t !== 'forge' || n.row >= 3));
    if (n.row === forgeRow - 1) w = w.filter(([t]) => t !== 'forge');
    set(n, rng.weighted(w, ([, k]) => k)[0]);
  }
  // guarantees: a shop around the middle, at least 2 elites (3 on A1+), and two events
  const need = (type, count, rowMin, rowMax) => {
    let have = mid.filter((n) => n.type === type).length;
    const pool = mid.filter((n) => n.row >= rowMin && n.row <= rowMax && n.type === 'fight');
    while (have < count && pool.length) { set(pool.splice(rng.int(pool.length), 1)[0], type); have++; }
  };
  need('shop', 1, 3, 6); need('elite', 2 + (run.ascension >= 1 ? 1 : 0), 3, forgeRow - 1); need('event', 2, 1, forgeRow - 2);
  // no two shops or forges in a row on one path would be nice; keep it simple
  for (const n of nodes) { n.x = (n.col + 0.5) / COLS + (rng.next() - 0.5) * 0.04; }
}

// The run a probe happens on. o.ward: a Ward run with its first floor laid out (what the content needs a floor for, or always had one).
// Otherwise a bare run, no floor: a fight, a potion or a card needs none. (--classic-rng: plus the draws of the retired map generator,
// which is the run those probes were recorded on before the retirement.)
function probeRun(E, hero, seed, o = {}) {
  const run = E.RUN.newRun({ hero, seed, bare: !o.ward });
  if (!o.ward && CLASSIC_RNG) classicMapDraws(run, 1);
  run.maxHp = run.hp = 400; if (o.act) run.act = o.act;
  return run;
}
const DUMMIES = ['orderly', 'gauze_mummy'];
// a whole Ward day spent waiting (end the morning, wait three times): the rooms tick and fill the way they do in play
function passDay(WD, run) { WD.endMorning(run); for (let i = 0; i < 3 && run.phase === 'ward' && run.ward.phase !== 'morning'; i++) WD.startWalk(run, run.ward.hero.room); }
function probes(E) {
  const { RUN, C, WD, K, D, RNG, TEXT, META } = E, P = {};
  const g = (fn) => { try { return fn(); } catch (e) { return 'error: ' + String(e && e.message || e).slice(0, 160); } };
  // rng streams
  P.rng = {};
  for (const seed of ['a', 'graftwork', 'golden-1', '12345', 7, 0, 4294967295, 'daily-2026-01-05']) {
    const r = RNG.makeRng(seed), xs = []; for (let i = 0; i < 50; i++) xs.push(r.next());
    const q = RNG.makeRng(seed), items = [1, 2, 3, 4, 5, 6, 7, 8];
    P.rng[String(seed)] = { hashSeed: RNG.hashSeed(String(seed)), first: xs[0], n50: xs[49], first50: h12(xs.join(',')), helpers: [q.int(10), q.range(3, 9), q.chance(0.5), q.pick(items), q.shuffle(items.slice()).join(''), q.sample(items, 3).join(''), q.weighted(items, (x) => x), q.state].join(' ') };
  }
  // content tables: key order (Object.values order feeds rng.pick) and one hash per entry
  P.data = {};
  for (const name of ['CARDS', 'GRAFTS', 'ENEMIES', 'STATUSES', 'RELICS', 'POTIONS', 'EVENTS', 'HEROES', 'SCHOOLS']) {
    const t = D[name]; if (!t) { P.data[name] = 'missing'; continue; }
    const items = {}; for (const id of Object.keys(t)) items[id] = hc(t[id]);
    P.data[name] = { n: Object.keys(t).length, order: h12(Object.keys(t).join(',')), items };
  }
  // cardSpec and rules text for every card: bare, upgraded, 1 / 2 / 3 grafts (the third is an Overload), tempered
  const GL = D.GRAFT_LIST, CL = D.CARD_LIST;
  const graftsFor = (inst, n, from) => { for (let k = 0; k < GL.length && inst.grafts.length < n; k++) { const gid = GL[(from + k) % GL.length].id; if (g(() => K.canGraft(inst, gid)) === true) inst.grafts.push(gid); } return inst; };
  const specText = (inst) => g(() => { const sp = K.cardSpec(inst); return { spec: hc(sp), text: h12([TEXT.cardLines(sp, false), TEXT.cardLines(sp, true), TEXT.priceLines(sp)].map((x) => canon(x)).join('|')), weight: K.instWeight(inst), bare: K.isBare(inst) }; });
  P.cardSpec = {};
  let uid = 1;
  for (const cd of CL) {
    const mk = (n, from, up) => { const i = K.newInst(cd.id, () => uid++); i.uid = 1; i.up = up ? 1 : 0; return graftsFor(i, n, from); };
    const off = fnv(cd.id) % GL.length, o = {};
    o.bare = specText(mk(0, 0, 0)); o.up = specText(mk(0, 0, 1));
    for (const [tag, n, from] of [['g1', 1, off], ['g2', 2, off + 41], ['g3', 3, off + 83]]) { const i = mk(n, from, tag === 'g2'); o[tag] = { grafts: i.grafts.join(','), ...specText(i) }; }
    o.tempered = g(() => { const i = mk(2, off + 17, 0); if (!K.canTemper(i)) return 'cannot'; K.temper(i); graftsFor(i, 1, off + 5); return { grafts: i.grafts.join(','), fused: (i.fused || []).join(','), ...specText(i) }; });
    P.cardSpec[cd.id] = o;
  }
  // rules text: statuses, and every op of every enemy move, potion and graft
  P.text = { status: {}, ops: {} };
  for (const id of Object.keys(D.STATUSES)) P.text.status[id] = h12([1, 2, 5].map((n) => g(() => TEXT.statusText(id, n))).join('|'));
  const opsText = (ops) => h12((ops || []).map((op) => g(() => canon(TEXT.opText(op, 1, new Set())))).join('|'));
  for (const e of Object.values(D.ENEMIES)) P.text.ops['enemy:' + e.id] = opsText(Object.values(e.moves || {}).flatMap((m) => m.fx || []));
  for (const p of Object.values(D.POTIONS)) P.text.ops['potion:' + p.id] = opsText(p.fx);
  for (const gr of GL) P.text.ops['graft:' + gr.id] = opsText((gr.mods || []).flatMap((m) => m.fx || []));
  // every enemy: intents and what its moves do over 6 turns against a fixed deck
  P.enemy = {};
  for (const e of Object.values(D.ENEMIES)) P.enemy[e.id] = g(() => { const r = fightProbe(E, probeRun(E, 'marrow', 'probe-enemy-' + e.id, { act: e.act || 1 }), [e.id], e.final ? 'final' : e.kind === 'boss' || e.kind === 'elite' ? e.kind : 'normal', 6, {}); return { turns: r.turns, over: r.over }; });
  // every card (bare, grafted) and every graft played in a fixed fight
  const cardFight = (hero, seed, insts) => {
    const run = probeRun(E, hero, seed), st = run.deck.slice(0, 4), mine = new Set();
    run.deck = [];
    for (const src of insts) for (let k = 0; k < 4; k++) { const i = { ...src, uid: run.uidNext++, grafts: src.grafts.slice(), fused: (src.fused || []).slice() }; mine.add(i.uid); run.deck.push(i); }
    run.deck.push(...st);
    const r = fightProbe(E, run, DUMMIES, 'normal', 3, { prefer: (k) => mine.has(k.inst.uid) });
    const res = C.finishCombat(r.c);
    return { turns: r.turns, over: r.over, strain: hc(r.c.strain), after: `${run.hp}/${run.maxHp} ${run.gold}g d${run.deck.length} sh${(res.shattered || []).length}` };
  };
  const heroOf = (cd) => (HEROES.includes(cd.hero) ? cd.hero : 'marrow');
  P.cardFight = {}; P.graftFight = {};
  for (const cd of CL) {
    const bare = K.newInst(cd.id, () => 1), gr = graftsFor(K.newInst(cd.id, () => 1), 2, fnv(cd.id + 'x') % GL.length); gr.up = 1;
    P.cardFight[cd.id] = { bare: g(() => cardFight(heroOf(cd), 'probe-card-' + cd.id, [bare])), grafted: g(() => ({ grafts: gr.grafts.join(','), ...cardFight(heroOf(cd), 'probe-cardg-' + cd.id, [gr]) })) };
  }
  for (const gr of GL) {
    const hosts = []; for (const cd of CL) { if (hosts.length >= 2) break; if (cd.type === 'junk') continue; const i = K.newInst(cd.id, () => 1); if (g(() => K.canGraft(i, gr.id)) === true) { i.grafts.push(gr.id); hosts.push(i); } }
    P.graftFight[gr.id] = hosts.length ? g(() => ({ on: hosts.map((h) => h.id).join(','), ...cardFight(heroOf(D.CARDS[hosts[0].id]), 'probe-graft-' + gr.id, hosts) })) : 'no host';
  }
  // every relic: pickup, a fixed fight, the reward and the next shop; every potion: used on turn 1
  P.relic = {}; P.potion = {};
  Object.values(D.RELICS).forEach((r, i) => {
    P.relic[r.id] = g(() => {
      const run = probeRun(E, HEROES.includes(r.hero) ? r.hero : HEROES[i % 3], 'probe-relic-' + r.id, { ward: !!r.ward || !CLASSIC_RNG }); // a relic reaches into the reward and the shop: it is probed on a floor
      const added = RUN.addRelic(run, r.id);
      run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: DUMMIES.slice() };
      const f = fightProbe(E, run, DUMMIES, 'normal', 4, {}), res = C.finishCombat(f.c);
      RUN.resolveFight(run, res);
      const reward = run.phase === 'reward' ? hc(run.pending) : run.phase;
      const shop = hc(RUN.makeShop(run));
      return { added, turns: f.turns, over: f.over, reward, shop, after: `${run.hp}/${run.maxHp} ${run.gold}g budget${K.budgetOf(run)} potions${RUN.potionSlots(run)} forge${RUN.forgeHeal(run)}` };
    });
  });
  for (const p of Object.values(D.POTIONS)) P.potion[p.id] = g(() => { const run = probeRun(E, 'wick', 'probe-potion-' + p.id); run.potions = [p.id]; const f = fightProbe(E, run, DUMMIES, 'normal', 2, { potion: 0 }); return { turns: f.turns, over: f.over, left: run.potions.join(',') }; });
  // every event: each choice applied to the same prepared run
  P.event = {};
  Object.values(D.EVENTS).forEach((ev, i) => {
    const prep = () => {
      const run = probeRun(E, HEROES[i % 3], 'probe-event-' + ev.id, { ward: !!ev.ward || !CLASSIC_RNG, act: ev.act || 1 }); // an event ends back on the Ward
      run.gold = 300; run.hp = 250;
      graftsFor(run.deck[0], 1, fnv(ev.id) % GL.length); graftsFor(run.deck[1], 2, (fnv(ev.id) + 29) % GL.length);
      run.deck.push(K.newInst('j_clot', () => run.uidNext++));
      RUN.addPotion(run, Object.keys(D.POTIONS)[i % Object.keys(D.POTIONS).length]);
      run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null };
      return run;
    };
    const o = { choices: g(() => hc(RUN.eventChoices(prep()).map((c) => [c.label, c.text, c.pick, c.ok, c.cards ? c.cards.length : null]))) };
    for (let k = 0; k < ev.choices.length; k++) o['choice' + k] = g(() => {
      const run = prep(), ch = RUN.eventChoices(run)[k];
      if (!ch.ok) return 'locked';
      if (ch.pick && !ch.cards.length) return 'no cards';
      const res = RUN.eventChoose(run, k, ch.pick ? ch.cards[0] : undefined), next = RUN.afterEvent(run);
      return { result: h12(String(res)), next: String(next), run: h12(RUN.serializeRun(run)) };
    });
    P.event[ev.id] = o;
  });
  // a fresh run for every hero and ascension 0 / 5 / 10: the Ward floor, the deck, the first offers
  P.newRun = {};
  for (const hero of HEROES) for (let asc = 0; asc <= 10; asc += 5) P.newRun[`${hero}.ward.a${asc}`] = g(() => {
    const run = RUN.newRun({ hero, seed: `probe-new-${hero}-${asc}`, ascension: asc });
    const o = { run: h12(RUN.serializeRun(run)) };
    for (const act of [2, 3]) { RUN.startAct(run, act); o['act' + act] = h12(RUN.serializeRun(run)); }
    o.shop = hc(RUN.makeShop(run)); o.offer = hc(RUN.makeGraftOffer(run)); o.encounters = ['normal', 'elite', 'boss', 'final'].map((k) => RUN.makeEncounter(run, k).join('+')).join(' ');
    return o;
  });
  // unlock tables and the meta defaults
  P.unlock = {};
  for (const k of ['UNLOCKS', 'STEPS', 'TOTAL_COST', 'HERO_GATES', 'START', 'UP', 'LOCKED_IDS']) P.unlock[k] = E.UNL[k] === undefined ? 'missing' : hc(E.UNL[k]);
  P.unlock.startSnapshot = g(() => hc(META.snapshotFor('start'))); P.unlock.stateOfNew = g(() => hc(META.unlockState(META.defaultMeta())));
  P.meta = { defaults: g(() => hc(META.defaultMeta())), migrateEmpty: g(() => hc(META.migrate({}))), migrateOld: g(() => hc(META.migrate({ v: 1, wins: 3, stats: { wins: 3, deaths: 9 }, seen: { cards: { m_cut: 1 } }, settings: { master: 0.5, textSize: 'large' } }))) };
  // Ward tables: rooms, building cards, phases, floors, tuning, the kit recipes resolved against the root's kit manifest
  P.ward = {};
  for (const k of ['ROOMS', 'BUILD_CARDS', 'PHASES', 'PHASE_ORDER', 'FLOOR', 'WARD_TUNE', 'STARTER_BUILD_DECK', 'START_RES', 'PREBUILT']) {
    const t = E.WDATA[k];
    if (t === undefined) P.ward[k] = 'missing';
    else if (k === 'ROOMS' || k === 'BUILD_CARDS') { const items = {}; for (const id of Object.keys(t)) items[id] = hc(t[id]); P.ward[k] = { order: h12(Object.keys(t).join(',')), items }; }
    else P.ward[k] = hc(t);
  }
  const kitFile = path.join(ROOT, 'graftwork/assets/ward_kit/manifest.json'), kit = fs.existsSync(kitFile) ? JSON.parse(fs.readFileSync(kitFile, 'utf8')) : null;
  P.ward.recipes = {};
  for (const type of Object.keys(E.WDATA.ROOMS)) for (const [fw, fh] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
    if ((fw > 1 || fh > 1) && !g(() => E.KIT.hasBigRecipe(type, fw, fh) || E.KIT.hasBigRecipe(type, fh, fw))) continue;
    P.ward.recipes[`${type}.${fw}x${fh}`] = g(() => hc(E.KIT.resolveRecipe(type, kit, fw, fh)));
  }
  // every building card: where it may be played on a fixed floor, and the floor after its first legal play
  P.buildCard = {};
  for (const id of Object.keys(E.WDATA.BUILD_CARDS)) P.buildCard[id] = g(() => {
    const run = RUN.newRun({ hero: 'marrow', seed: 'probe-build' }), w = run.ward;
    passDay(WD, run); // day 2: the first rooms hold something
    w.res.wood = 40; w.res.stone = 40; run.gold = 500;
    const inst = { uid: 9000, id }; w.deck.hand.push(inst);
    const targets = [null, 'wood', 'stone', ...Object.keys(w.rooms)]; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) targets.push({ x, y });
    const ok = targets.filter((t) => WD.canPlayBuild(run, inst.uid, t).ok);
    const tag = (t) => (t && typeof t === 'object' ? t.x + ',' + t.y : String(t));
    if (!ok.length) return { ok: 0 };
    const played = WD.playBuildCard(run, inst.uid, ok[0]);
    return { ok: ok.length, legal: h12(ok.map(tag).join(' ')), first: tag(ok[0]), played: hc(played), after: h12(RUN.serializeRun(run)) };
  });
  return P;
}

// ---------------------------------------------------------------- resume: saves taken mid run, continued from the payload
// Every resume run uses the `deep` cheat (it is the tool's option, not part of the save), so the continuation is long.
const RESUME_OPTS = { deep: true };
const RESUME_CASES = [
  { tag: 'k17', steps: 17 }, // --quick: k17, combat, walk
  { tag: 'combat', min: 8, when: (run) => run.phase === 'combat', midCombat: 2 },
  { tag: 'walk', min: 6, when: (run) => run.phase !== 'ward' && !!run.ward.walk && run.ward.walk.i < run.ward.walk.path.length },
  { tag: 'k5', steps: 5 }, { tag: 'k41', steps: 41 }, { tag: 'k90', steps: 90 },
  { tag: 'graft', min: 4, afterLine: (l) => l.startsWith('graft ') },
  { tag: 'reward', min: 10, when: (run) => run.phase === 'reward' },
  { tag: 'event', min: 6, when: (run) => run.phase === 'event' },
  { tag: 'shop', min: 6, when: (run) => run.phase === 'shop' },
  { tag: 'night', min: 6, when: (run) => run.phase === 'ward' && run.ward.phase === 'night' },
  { tag: 'day3', min: 6, when: (run) => run.phase === 'ward' && run.ward.phase === 'morning' && run.ward.day >= 3 },
];
// what "Save and quit" from the pause menu stores in the middle of a fight: the run object as the fight left it so far
function partialCombat(E, run, turns) {
  const { C } = E, p = run.pending, c = C.newCombat(run, p.enemies, { kind: p.fightKind });
  for (let t = 0; t < turns && !c.over; t++) {
    let plays = 0, guard = 0;
    while (!c.over && plays < 3 && guard++ < 20) {
      if (c.pending) { const q = c.pending, pool = q.kind === 'fetch' ? (q.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; C.resolvePending(c, pool.slice(0, q.n).map((k) => k.uid)); continue; }
      const hi = c.hand.findIndex((_, i) => C.canPlay(c, i).ok); if (hi < 0) break;
      C.playCard(c, hi, C.needsTarget(c, hi) ? c.enemies.findIndex((e) => !e.dead) : null); plays++;
    }
    if (!c.over) C.endTurn(c);
  }
  return `turn ${c.turn}${c.over ? ' over ' + c.over : ''}`;
}
function makeSave(E, hero, cs) {
  const run = startRun(E, RESUME_OPTS, hero, `golden-resume-${hero}-ward`), T = [];
  let prev = E.RUN.serializeRun(run), at = 'start', n = 0;
  const hit = () => (cs.steps !== undefined ? n >= cs.steps : n >= (cs.min || 0) && ((cs.when && cs.when(run)) || (cs.afterLine && T.length && cs.afterLine(T[T.length - 1]))));
  while (!ended(run) && n < 3000 && !hit()) { prev = E.RUN.serializeRun(run); stepRun(E, run, T, RESUME_OPTS); n++; }
  if (ended(run)) return { payload: prev, at: `before the last step (${n - 1} steps, the run ended before the save point)` }; // a finished run has no save
  at = `${n} steps, ${run.phase} day ${run.ward.day} ${run.ward.phase}`;
  if (cs.midCombat && run.phase === 'combat') at += ', ' + partialCombat(E, run, cs.midCombat);
  return { payload: E.RUN.serializeRun(run), at };
}
function continueSave(E, payload, o) { const run = E.RUN.deserializeRun(payload), T = []; return finishRun(E, run, T, o); }
async function sectionResume() {
  installDeterminism(); memoryStorage();
  const E = await loadEngine(), out = { cases: {}, wardFixture: {}, retired: {} }, payloads = {};
  const base = opt('resume-from', null) ? JSON.parse(fs.readFileSync(path.resolve(opt('resume-from')), 'utf8')) : null;
  const cases = QUICK ? RESUME_CASES.slice(0, 3) : RESUME_CASES;
  for (const hero of HEROES) for (const cs of cases) {
    const key = `${hero}.ward.${cs.tag}`;
    out.cases[key] = guarded(() => {
      const fresh = makeSave(E, hero, cs);
      const from = base && base.payloads && base.payloads[key] !== undefined ? base.payloads[key] : fresh.payload;
      payloads[key] = from;
      // savedBy: what THIS root's code writes at the save point. end: where the stored payload (the baseline's with --resume-from) ends up under this root's code.
      return { at: fresh.at, savedBy: sha1(fresh.payload), savedByCanon: hc(JSON.parse(fresh.payload)), bytes: fresh.payload.length, end: continueSave(E, from, RESUME_OPTS) };
    });
  }
  const dir = [path.join(ROOT, 'tests/fixtures'), path.join(REPO, 'tests/fixtures')].find((d) => fs.existsSync(d));
  const fixtures = (re) => (dir ? fs.readdirSync(dir).filter((n) => re.test(n)).sort() : []).map((f) => [f.replace(/^graftwork_[a-z]+save_|\.json$/g, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]);
  // Ward saves written by an older commit (tests/fixtures/graftwork_wardsave_*.json): load and play each to the end
  for (const [tag, fx] of fixtures(/^graftwork_wardsave_.*\.json$/)) for (const hero of Object.keys(fx)) fx[hero].forEach((sv, i) => { out.wardFixture[`${tag}.${hero}.${i}.${sv.phase}`] = guarded(() => ({ payload: sha1(sv.json), end: continueSave(E, sv.json, { deep: !!sv.deep }) })); });
  // Saves from before the Ward (tests/fixtures/graftwork_oldsave_*.json) are runs on the retired Classic map: no longer played on. Each one is put
  // where the game looks for a save and closed by the engine (engine/meta.js retireClassicRun: counted like an abandoned run, deleted, a notice left).
  const { META, SAVE } = E, RUN_KEY = 'graftwork_run_v1';
  for (const [tag, fx] of fixtures(/^graftwork_oldsave_.*\.json$/)) for (const hero of Object.keys(fx)) fx[hero].forEach((sv, i) => {
    out.retired[`${tag}.${hero}.${i}.${sv.phase}`] = guarded(() => {
      if (!META.retireClassicRun) return { error: 'this root has no retireClassicRun' };
      globalThis.localStorage.clear(); globalThis.localStorage.setItem(RUN_KEY, sv.json);
      const meta = META.defaultMeta(), info = META.retireClassicRun(meta), h = meta.history[0] || {};
      return { payload: sha1(sv.json), closed: !!info, saveLeft: SAVE.hasRun(), notice: String(meta.notice), endInfo: hc(info), metaAfter: hc(meta),
        history: `${h.hero} ${h.outcome} floors ${h.floors} grafts ${h.grafts}`, stats: canon(meta.stats), up: info && info.unlock ? info.unlock.up : null, credit: canon(meta.credit), again: META.retireClassicRun(meta) === null };
    });
  });
  globalThis.localStorage.clear();
  return { resume: out, payloads, resumeFrom: base ? path.resolve(opt('resume-from')) : null };
}

// ---------------------------------------------------------------- ui / assets: the stage (real boot on a recording canvas)
// Variants: the first two are the --quick set. The phone stage is 844x390 (scale 0.5417), a touch device: clicks are taps there.
// In the assets section the phone has device pixel ratio 1, so it asks for the @1x files (the desktop asks for @2x).
const VARIANTS = [
  { id: 'desk.motion', w: 1280, h: 720, dpr: 1, reduced: false },
  { id: 'phone.reduced', w: 844, h: 390, dpr: 3, reduced: true, touch: true },
  { id: 'desk.reduced', w: 1280, h: 720, dpr: 1, reduced: true },
  { id: 'phone.motion', w: 844, h: 390, dpr: 3, reduced: false, touch: true },
];
const sceneNames = (sec) => Object.keys(SCENES[sec]);
const sceneKeys = (sec) => { const vs = QUICK ? VARIANTS.slice(0, 2) : VARIANTS, out = []; for (const n of sceneNames(sec)) for (const v of vs) out.push(`${n}@${v.id}`); return out; };
const num3 = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v && typeof v === 'object' ? (v.__id || '{}') : String(v));

// size of an image file from its header (WebP: VP8 / VP8L / VP8X, PNG), so a fake image is as big as the real one
function imageSize(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(32); fs.readSync(fd, b, 0, 32, 0); fs.closeSync(fd);
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const cc = b.toString('latin1', 12, 16);
    if (cc === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (cc === 'VP8L') return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6))];
    if (cc === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  return [256, 256];
}
// What a pixel read answers in the assets section: every sprite is the same mannequin (head, coat, two separate legs, shoes), so the
// alpha analysis of ui/puppet.js and the contact point of ui/ward_iso.js run on a figure with real legs. Deterministic in w and h.
function mannequin(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h; let c = null;
    if (Math.hypot((u - 0.5) * w / h, v - 0.14) < 0.09) c = [226, 190, 160];
    else if (v >= 0.22 && v < 0.6 && u >= 0.34 && u < 0.66) c = [120, 60, 70];
    else if (v >= 0.9 && v < 0.94 && ((u >= 0.33 && u < 0.47) || (u >= 0.53 && u < 0.67))) c = [30, 30, 30];
    else if (v >= 0.6 && v < 0.94 && ((u >= 0.36 && u < 0.47) || (u >= 0.53 && u < 0.64))) c = [60, 60, 90];
    if (c) { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  }
  return d;
}

const STAGE = { log: null, first: true, mods: null, pending: [], loads: null, pathId: 0 };
// Boots the game on a fresh recorder. Returns the script API S. Called once per pass (cold, then warm in the same process).
async function bootStage(sec, v, o = {}) {
  const assetsMode = sec === 'assets';
  resetDeterminism();
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, val) => { store.set(k, String(val)); }, removeItem: (k) => { store.delete(k); }, clear: () => store.clear() };
  if (STAGE.first) {
    STAGE.first = false;
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: v.touch ? 'GoldenMaster Mobile' : 'GoldenMaster', maxTouchPoints: v.touch ? 5 : 0 }, configurable: true, writable: true });
    globalThis.window = { innerWidth: v.w, innerHeight: v.h, devicePixelRatio: assetsMode && v.touch ? 1 : v.dpr, addEventListener() {}, removeEventListener() {} };
    globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
    // Path2D objects go into the same log as the canvas calls (their ids restart with every pass, like the recorder's canvas ids)
    globalThis.Path2D = class { constructor(a) { const id = 'path#' + (STAGE.pathId++); this.__id = id; STAGE.log.push('new ' + id + (a === undefined ? '' : '(' + num3(a) + ')')); return new Proxy(this, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : (...x) => { STAGE.log.push(id + ':' + k + '(' + x.map(num3).join(',') + ')'); }) }); } };
    if (assetsMode) globalThis.Image = class { constructor() { this.__id = 'img'; this.width = 0; this.height = 0; this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; this.onload = null; this.onerror = null; } set src(u) { this._src = u; this.__id = 'img:' + u; STAGE.pending.push(this); } get src() { return this._src; } };
    STAGE.mods = { REC: await imp('tests/graftwork_rec_lib.mjs') };
  }
  // the recorder of tests/graftwork_rec_lib.mjs, with its log turned into a running sha1 (a scene makes millions of calls)
  const R = STAGE.mods.REC.makeRecorder(), sink = o.sink || null;
  const H = createHash('sha1'); let calls = 0, buf = [];
  const flush = () => { if (buf.length) { H.update(buf.join('\n') + '\n'); buf = []; } };
  const digest = () => { flush(); return H.copy().digest('hex'); };
  R.log.push = (s) => { buf.push(s); calls++; if (buf.length >= 8192) flush(); if (sink) sink(s); return calls; };
  STAGE.log = R.log; STAGE.pathId = 0; STAGE.pending = []; STAGE.loads = { n: 0, bytes: 0, list: [], missing: [] };
  R.install();
  const doc = globalThis.document; doc.getElementById = () => null;
  if (assetsMode) { // pixel reads and writes work on every offscreen canvas (see mannequin)
    const mk0 = doc.createElement;
    doc.createElement = (tag) => {
      const c = mk0(tag), g = c.getContext('2d'), def = (k, fn) => Object.defineProperty(g, k, { value: fn, configurable: true, writable: true });
      def('getImageData', (x, y, w, h) => { R.log.push(`${c.__id}:getImageData(${[x, y, w, h].map(num3).join(',')})`); return { width: w, height: h, data: mannequin(w, h) }; });
      def('createImageData', (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }));
      def('putImageData', (id, x, y) => { R.log.push(`${c.__id}:putImageData(${id && id.data ? h12(Buffer.from(id.data.buffer, id.data.byteOffset, id.data.byteLength)) : '?'},${num3(x)},${num3(y)})`); });
      return c;
    };
  }
  const cv = R.root; cv.width = 1280; cv.height = 720; cv.addEventListener = () => {}; cv.setPointerCapture = () => {};
  cv.getBoundingClientRect = () => ({ left: parseFloat(cv.style.left) || 0, top: parseFloat(cv.style.top) || 0, width: parseFloat(cv.style.width) || 1280, height: parseFloat(cv.style.height) || 720 });
  const M = STAGE.mods;
  if (!M.META) { for (const [k, f] of Object.entries({ META: 'graftwork/engine/meta.js', RUN: 'graftwork/engine/run.js', WD: 'graftwork/engine/ward.js', K: 'graftwork/engine/cards.js', D: 'graftwork/data/index.js', WDATA: 'graftwork/data/ward.js' })) M[k] = await imp(f); }
  // the profile: a fresh one (tips off unless the scene wants the first-run tips), or a veteran one built by the real run-end bookkeeping
  const meta = M.META.defaultMeta();
  meta.settings.reducedMotion = !!v.reduced; meta.settings.tips = !!o.tips;
  if (o.veteran) veteranMeta(M, meta);
  localStorage.setItem('graftwork_meta_v1', JSON.stringify(meta));
  if (assetsMode) {
    if (!M.ASSETS) M.ASSETS = await imp('graftwork/ui/assets.js');
    M.ASSETS.assets.fetchJson = async (url) => { STAGE.loads.list.push(url); return JSON.parse(fs.readFileSync(path.join(ROOT, 'graftwork', url), 'utf8')); };
  }
  if (!M.MAIN) { M.MAIN = await imp('graftwork/main.js'); M.WARDUI = await imp('graftwork/ui/ward.js'); }
  const { app, flow } = M.MAIN.boot(cv);
  const btns = [], rects = []; let bf = -1;
  const fresh = () => { if (bf !== app.frame) { bf = app.frame; btns.length = 0; rects.length = 0; } };
  const button0 = app.button, clicked0 = app.clicked;
  app.button = (label, x, y, w, h, bo) => { fresh(); btns.push({ label: String(label), x, y, w, h, dis: !!(bo && bo.disabled) || !!app.blocked }); return button0(label, x, y, w, h, bo); };
  app.clicked = (x, y, w, h) => { fresh(); if (w > 8 && h > 8 && rects.length < 400 && !app.blocked) rects.push([x, y, w, h]); return clicked0(x, y, w, h); }; // only what the top screen offers
  const marks = {}, trail = [];
  const fireImages = () => {
    if (!STAGE.pending.length) return;
    const list = STAGE.pending; STAGE.pending = [];
    for (const img of list) {
      const url = img._src, file = path.join(ROOT, 'graftwork', url), L = STAGE.loads;
      L.list.push(url);
      if (fs.existsSync(file)) { const [w, h] = imageSize(file); img.width = img.naturalWidth = w; img.height = img.naturalHeight = h; img.complete = true; L.n++; L.bytes += fs.statSync(file).size; if (img.onload) img.onload(); }
      else { L.missing.push(url); if (img.onerror) img.onerror(); }
    }
  };
  const S = {
    app, flow, v, sec, M, trail, btns, rects, assetsMode,
    get run() { return app.shared.run; }, get meta() { return app.shared.meta; },
    frames(n = 1) { for (let i = 0; i < n; i++) { if (assetsMode) fireImages(); DET.clock += 1000 / 60; app.tick(1 / 60); } },
    // frames with a turn of the microtask queue after each: manifest loads (promises) land between frames, as in a browser
    async wait(n = 1) { for (let i = 0; i < n; i++) { S.frames(1); if (assetsMode) for (let k = 0; k < 4; k++) await null; } },
    move(x, y) { app.mouse.x = x; app.mouse.y = y; app.mouse.touch = false; },
    click(x, y) { const m = app.mouse; m.x = x; m.y = y; m.touch = !!v.touch; m.pressed = true; m.down = true; S.frames(1); m.released = true; m.down = false; if (v.touch) m.touchUp = true; S.frames(1); },
    drag(x0, y0, x1, y1) { const m = app.mouse; m.x = x0; m.y = y0; m.touch = !!v.touch; m.pressed = true; m.down = true; S.frames(1); for (let i = 1; i <= 8; i++) { m.x = x0 + (x1 - x0) * i / 8; m.y = y0 + (y1 - y0) * i / 8; S.frames(1); } m.released = true; m.down = false; if (v.touch) m.touchUp = true; S.frames(3); trail.push(`drag ${Math.round(x0)},${Math.round(y0)} > ${Math.round(x1)},${Math.round(y1)}`); },
    key(k, extra) { app.pressedKeys.push({ key: k, preventDefault() {}, ...(extra || {}) }); trail.push('key ' + k); S.frames(1); },
    wheel(dy) { app.mouse.wheel += dy; trail.push('wheel ' + dy); S.frames(1); },
    rect(id, n = 0) { return app.layout.getAll().filter((r) => (id instanceof RegExp ? id.test(r.id) : r.id === id))[n] || null; },
    // every helper below notes what it found in the trail (part of the golden), and a miss is a note, never a throw
    hoverRect(id, k = 12, n = 0) { const r = S.rect(id, n); if (!r) { trail.push('miss rect ' + id); S.frames(k); return false; } trail.push('hover ' + r.id); S.move(r.x + r.w / 2, r.y + r.h / 2); S.frames(k); return true; },
    clickRect(id, n = 0) { const r = S.rect(id, n); if (!r) { trail.push('miss rect ' + id); S.frames(2); return false; } trail.push('click ' + r.id); S.click(r.x + r.w / 2, r.y + r.h / 2); return true; },
    btn(re, n = 0) { return btns.filter((b) => re.test(b.label) && !b.dis)[n] || null; },
    hoverBtn(re, k = 12, n = 0) { const b = S.btn(re, n); if (!b) { trail.push('miss button ' + re); S.frames(k); return false; } trail.push('hover [' + b.label + ']'); S.move(b.x + b.w / 2, b.y + b.h / 2); S.frames(k); return true; },
    clickBtn(re, n = 0) { const b = S.btn(re, n); if (!b) { trail.push('miss button ' + re); S.frames(2); return false; } trail.push('click [' + b.label + ']'); S.click(b.x + b.w / 2, b.y + b.h / 2); return true; },
    // the i-th clickable rectangle of the last frame (screens that register nothing, like Settings): hover or click it
    hoverN(i, k = 6) { const r = rects[i]; if (!r) { trail.push('miss clickable ' + i); S.frames(k); return false; } const p = [r[0] + r[2] / 2, r[1] + r[3] / 2]; trail.push(`hover #${i} ${Math.round(p[0])},${Math.round(p[1])}`); S.move(p[0], p[1]); S.frames(k); return true; },
    clickN(i) { const r = rects[i]; if (!r) { trail.push('miss clickable ' + i); S.frames(2); return false; } const p = [r[0] + r[2] / 2, r[1] + r[3] / 2]; trail.push(`click #${i} ${Math.round(p[0])},${Math.round(p[1])}`); S.click(p[0], p[1]); return true; },
    at(x, y, k = 10) { trail.push(`hover ${x},${y}`); S.move(x, y); S.frames(k); },
    // a point inside a registered rectangle, dx / dy logical px from its corner (grids of cards that register only their scroll box)
    tapIn(id, dx, dy) { const r = S.rect(id); if (!r) { trail.push('miss rect ' + id); S.frames(2); return false; } trail.push(`click ${r.id}+${dx},${dy}`); S.click(r.x + dx, r.y + dy); return true; },
    // tap along a row of a rectangle until `done()`: finds the first card of a grid without knowing its layout
    scanTap(id, fy, done) { const r = S.rect(id); if (!r) { trail.push('miss rect ' + id); return false; } for (let x = r.x + 70; x < r.x + r.w - 40; x += 55) { S.click(x, r.y + r.h * fy); S.frames(4); if (done()) { trail.push(`click ${r.id} row ${fy} at x ${Math.round(x)}`); return true; } } trail.push(`nothing to click in ${r.id} row ${fy}`); return false; },
    tap(x, y) { trail.push(`click ${x},${y}`); S.click(x, y); },
    away() { app.mouse.x = -999; app.mouse.y = -999; },
    note(s) { trail.push(String(s)); },
    state() { const run = app.shared.run; return `${app.current}[${app.stack.map((s) => s.name).join('>')}]${run ? ` ${run.phase}${run.ward ? ` day ${run.ward.day} ${run.ward.phase}` : ''} hp ${run.hp}/${run.maxHp} gold ${run.gold}` : ''}`; },
    mark(name) { marks[name] = digest().slice(0, 12); trail.push(`-- ${name}: ${S.state()}`); },
    result() {
      const L = STAGE.loads, out = { hash: digest(), calls, marks, state: S.state(), rects: app.layout.getAll().map((r) => `${r.id} ${[r.x, r.y, r.w, r.h].map(num3).join(',')} ${r.layer}${r.group !== r.id ? ' g:' + r.group : ''}${r.overlay ? ' overlay' : ''}`), trail };
      if (assetsMode) out.loads = { files: L.n, bytes: L.bytes, requests: L.list.length, list: h12(L.list.join('\n')), missing: L.missing.slice() };
      return out;
    },
  };
  return S;
}
// A profile with history: two finished runs go through the game's own run-end bookkeeping (Credit, unlock points, achievements, seen).
function veteranMeta(M, meta) {
  const { RUN, META, D } = M;
  for (const [hero, outcome, asc] of [['marrow', 'won', 0], ['wick', 'dead', 2], ['odile', 'won', 1]]) {
    const run = RUN.newRun({ hero, seed: 'golden-veteran-' + hero, ascension: asc });
    run.act = outcome === 'won' ? 3 : 2; Object.assign(run.stats, { fights: 18, elites: 3, grafts: 9, floors: 27, bosses: outcome === 'won' ? 3 : 1, goldEarned: 640, damageTaken: 210 });
    run.seenEnemies = Object.keys(D.ENEMIES).slice(0, 30); run.killedEnemies = run.seenEnemies.slice(0, 24); run.phase = outcome; run.ended = true;
    if (META.onRunStart) META.onRunStart(meta, run);
    META.recordRunEnd(meta, run, outcome);
  }
  for (const h of HEROES) if (!meta.unlocked.heroes.includes(h)) meta.unlocked.heroes.push(h);
  if (meta.credit && typeof meta.credit === 'object') { meta.credit.bal = (meta.credit.bal || 0) + 400; meta.credit.total = (meta.credit.total || 0) + 400; }
  return meta;
}
// A run with things on it: grafts on the first cards, relics, potions, gold (all through the engine's own functions).
function enrich(S, o = {}) {
  const { RUN, K, D } = S.M, run = S.run;
  const GL = D.GRAFT_LIST; let k = fnv(run.seed) % GL.length;
  for (const [idx, n] of [[0, 1], [1, 2], [2, o.overload ? 3 : 1]]) { const inst = run.deck[idx]; for (let g = 0; g < GL.length && inst.grafts.length < n; g++, k++) { const gid = GL[k % GL.length].id; if (K.canGraft(inst, gid)) RUN.applyGraft(run, inst.uid, gid, { keepPhase: true }); } }
  const relics = Object.values(D.RELICS).filter((r) => !r.ward && (!r.hero || r.hero === run.hero) && r.rarity !== 'boss');
  for (let i = 0; i < (o.relics === undefined ? 5 : o.relics); i++) RUN.addRelic(run, relics[(fnv(run.seed + i) + i * 7) % relics.length].id);
  const pots = Object.keys(D.POTIONS); for (let i = 0; i < 2; i++) RUN.addPotion(run, pots[(fnv(run.seed) + i * 5) % pots.length]);
  run.gold = o.gold === undefined ? 400 : o.gold;
  if (o.up) for (const i of [3, 4]) if (run.deck[i]) run.deck[i].up = 1;
  S.note('deck ' + deckLine(run).slice(0, 4).join(' ') + ' relics ' + run.relics.join(','));
  return run;
}
// Start a run through the real flow: it opens on the Ward. (--classic-rng, for the scenes that were recorded on a Classic run: that run
// without its map, a bare run with the map generator's draws, parked on an empty screen where the map screen used to be.)
const startRunUi = (S, hero, seed, o = {}) => {
  const opts = { hero, seed: 'golden-ui-' + seed, ascension: o.asc || 0 };
  if (!CLASSIC_RNG || o.ward) { S.flow.start(opts); return S.run; }
  const { RUN, META } = S.M, app = S.app, run = RUN.newRun(META.withUnlocks(app.shared.meta, { ...opts, bare: true }));
  classicMapDraws(run, 1);
  app.shared.run = run; if (META.onRunStart) META.onRunStart(app.shared.meta, run);
  if (!app.screens.golden_parked) app.register('golden_parked', { draw() {} });
  app.go('golden_parked', { run });
  return run;
};
// the next floor of a run (--classic-rng: what the next act of a Classic run drew)
const toAct = (S, run, act) => { if (CLASSIC_RNG && !run.ward) { run.act = act; classicMapDraws(run, act); } else S.M.RUN.startAct(run, act); };
// an event as the Chapel draws it (--classic-rng: the uniform draw a Classic event node made)
function drawEvent(S, run) {
  const { WD, D, META } = S.M;
  if (!CLASSIC_RNG || run.ward) return WD.wardStartEvent(run);
  const pool = Object.values(D.EVENTS).filter((e) => (e.act === 0 || e.act === run.act) && !run.seenEvents.includes(e.id) && !e.ward), open = pool.filter((e) => META.runAllows(run, e.id));
  const ev = run.rng.pick(open.length ? open : pool); run.seenEvents.push(ev.id); run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null };
  return run.pending;
}
function fightUi(S, enemies, kind = 'normal') { const run = S.run; run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: kind, enemies }; S.flow.route(); }
// a turn through the real widgets: card, then target; the trail keeps what the engine saw
function playCards(S, n) {
  for (let i = 0; i < n; i++) { if (!S.clickRect(/^hand_/, 0)) break; S.frames(8); S.clickRect(/^en\d+:body$/, 0); S.frames(34); }
  S.note('hand ' + S.app.layout.getAll().filter((r) => /^hand_/.test(r.id)).length + ', foes ' + S.app.layout.getAll().filter((r) => /^en\d+:body$/.test(r.id)).length);
}
// a hospital of ten rooms and more, with a two cell Ward Wing and a two cell Generator, built by the engine's own playBuildCard
function buildHospital(S) {
  const { WD, WDATA } = S.M, run = S.run, w = run.ward;
  w.res.wood = 60; w.res.stone = 60; run.gold = 900; w.deck.hand = [];
  for (const id of ['b_corridor', 'b_ward_wing', 'b_generator', 'b_dispensary', 'b_workshop', 'b_isolation', 'b_corridor', 'b_linen']) {
    if (!WDATA.BUILD_CARDS[id]) { S.note('no plan ' + id); continue; }
    const c = { uid: 9000 + w.cardNext++, id }; w.deck.hand.push(c);
    let ok = false; for (const [x, y] of WD.buildCells(run)) if (WD.playBuildCard(run, c.uid, { x, y }).ok) { ok = true; break; }
    if (!ok) S.note('not built ' + id);
  }
  passDay(WD, run); // the next morning every lit room has ticked: monsters, an elite, an event, the shop, the forge
  S.note('rooms ' + Object.values(w.rooms).map((r) => `${r.id}:${r.type}@${r.x},${r.y}${r.w || r.h ? ' ' + (r.w || 1) + 'x' + (r.h || 1) : ''}${r.contents.length ? ' (' + r.contents.map((c) => c.id || c.kind).join(',') + ')' : ''}`).join(' | '));
}

// ---------------------------------------------------------------- ui / assets: the scenes
// A scene is { enter(S), inputs(S), pre = 90, post = 60, tips, veteran }: enter, `pre` frames, the scripted inputs, `post` frames.
// Scripts only use what a player can see: registered rectangles, button labels, keys. Game state is prepared through the engine.
const wardStart = (S, hero, seed) => startRunUi(S, hero, seed, { ward: true }); // the scenes that have always been Ward scenes
// plan n route steps: click the floor of a legal room (rooms that hold something first; ui/ward.js cellCenter gives the floor's screen point),
// or walk the keyboard focus when that export is gone
function wardRoute(S, n, o = {}) {
  const { WD } = S.M, run = S.run, w = run.ward, UI = STAGE.mods.WARDUI;
  S.note(`roll ${w.roll ? w.roll.n : '-'} legal ${WD.legalSteps(run).join(',')}`);
  for (let i = 0; i < n; i++) {
    const legal = WD.legalSteps(run); if (!legal.length) break;
    const full = legal.filter((id) => w.rooms[id].contents.length && w.rooms[id].type !== 'rm_theatre'), id = (o.quiet ? legal.filter((x) => !full.includes(x))[0] : full[0]) || legal[0], r = w.rooms[id];
    if (UI && UI.cellCenter && !o.keys) { const c = UI.cellCenter(r.x, r.y); S.note('step ' + id); S.click(c.x, c.y); S.frames(8); }
    else { S.key('Tab'); S.frames(4); S.key('Enter'); S.frames(8); }
  }
  S.note('route ' + (w.route || []).join('>') + ' triggers ' + WD.routeInfo(run).triggers.map((t) => t.kind + '@' + t.room).join(','));
}
const pickerEvent = (S) => { // the first event that offers a card pick on this run
  const { RUN, D } = S.M, run = S.run;
  for (const ev of Object.values(D.EVENTS)) {
    if (ev.ward || (ev.act && ev.act !== run.act)) continue;
    run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null };
    const ch = RUN.eventChoices(run).find((c) => c.pick && c.ok && c.cards.length);
    if (ch) return { id: ev.id, i: ch.i };
  }
  return null;
};
const SCENES = { ui: {
  title: { inputs(S) { S.hoverBtn(/^New Run/, 14); S.key('Tab'); S.key('Tab'); S.key('ArrowDown'); S.frames(6); S.hoverRect('title-hero-card', 14); S.hoverRect('title-archive', 14); S.hoverBtn(/^Settings/, 10); S.away(); } },
  title_intro: { enter(S) { S.app.go('title', { intro: true }); }, inputs(S) { S.frames(110); S.key(' '); S.frames(20); } },
  title_select: { enter(S) { S.frames(40); S.clickBtn(/^New Run/); }, inputs(S) { S.clickBtn(/^>$/); S.frames(10); S.hoverRect('title-assist', 12); S.key('ArrowRight'); S.frames(8); S.hoverBtn(/^Begin/, 10); } },
  title_veteran: { veteran: true, enter(S) { startRunUi(S, 'wick', 'veteran'); S.flow.toTitle(); }, inputs(S) { S.hoverBtn(/^Continue/, 14); S.hoverRect('title-hero-card', 12); S.clickBtn(/^Credits/); S.frames(50); S.key('Escape'); S.frames(20); S.hoverBtn(/^Daily Run/, 10); S.clickBtn(/^Daily Run/); } },
  ward_morning: { pre: 190, enter(S) { wardStart(S, 'marrow', 'ward'); }, inputs(S) { S.hoverRect('ward-card0', 14); S.hoverRect('ward-card2', 10); S.clickRect('ward-card0'); S.frames(10); S.key('Tab'); S.frames(6); S.key('Tab'); S.frames(6); S.key('Enter'); S.frames(30); S.hoverRect(/^ward-room-/, 14, 0); S.hoverRect('ward-res', 10); S.clickBtn(/^View$/); S.frames(30); S.key('Escape'); S.frames(8); S.hoverRect('ward-clock', 12); } },
  ward_midday: { pre: 190, enter(S) { wardStart(S, 'wick', 'ward-midday'); S.M.WD.endMorning(S.run); }, inputs(S) { S.frames(60); wardRoute(S, 2, { keys: true }); S.hoverRect(/^ward-room-/, 14, 1); S.clickBtn(/^Undo step/); S.frames(10); wardRoute(S, 2, { quiet: true }); S.key('Backspace'); S.frames(8); S.hoverRect('ward-die', 12); S.hoverRect('ward-strip', 10); S.clickBtn(/^\+$/); S.frames(12); S.key('c'); S.frames(12); } },
  ward_evening: { pre: 190, enter(S) { const run = wardStart(S, 'odile', 'ward-evening'); S.M.WD.endMorning(run); S.M.WD.startWalk(run, run.ward.hero.room); S.note('phase ' + run.phase + ' ' + run.ward.phase); S.flow.route(); }, inputs(S) { S.key('w'); S.frames(14); S.key('w'); S.frames(14); for (let i = 0; i < 3; i++) S.hoverRect(/^ward-room-/, 10, i); S.clickBtn(/^-$/); S.frames(12); S.key('f'); S.frames(8); wardRoute(S, 1, { quiet: true }); S.hoverRect('ward-hero', 10); } },
  ward_night: { pre: 190, enter(S) { const run = wardStart(S, 'marrow', 'ward-night'); const WD = S.M.WD; WD.endMorning(run); for (let i = 0; i < 2 && run.phase === 'ward'; i++) WD.startWalk(run, run.ward.hero.room); S.note('phase ' + run.phase + ' ' + run.ward.phase); S.flow.route(); }, post: 240, inputs(S) { for (let i = 0; i < 2; i++) S.hoverRect(/^ward-room-/, 12, i); S.hoverBtn(/^Wait/, 10); S.clickBtn(/^Wait/); } },
  ward_built: { pre: 190, post: 300, enter(S) { const run = wardStart(S, 'marrow', 'ward-built'); buildHospital(S); S.M.WD.endMorning(run); }, inputs(S) { for (let i = 0; i < 12; i += 3) S.hoverRect(/^ward-room-/, 8, i); S.key('w'); S.frames(10); wardRoute(S, 3); S.key('g'); } },
  combat: { pre: 170, enter(S) { startRunUi(S, 'marrow', 'combat'); enrich(S); fightUi(S, ['bedpan_slime', 'gauze_mummy']); }, post: 260, inputs(S) { S.hoverRect(/^hand_/, 16, 0); S.hoverRect('en1:intent', 16); S.hoverRect('seamRail', 10); S.hoverRect('strain', 10); playCards(S, 2); S.note('after plays ' + S.state()); S.clickBtn(/^END TURN/); } },
  combat_elite: { pre: 170, post: 260, enter(S) { const run = startRunUi(S, 'wick', 'elite', { asc: 5 }); toAct(S, run, 2); enrich(S, { overload: true, up: true }); fightUi(S, ['the_appraiser'], 'elite'); }, inputs(S) { S.hoverRect('potion0', 12); S.clickRect('potion0'); S.frames(10); S.clickRect(/^en\d+:body$/); S.frames(40); S.hoverRect(/^status:/, 12); playCards(S, 3); S.hoverRect('pile_draw', 10); S.clickRect('pile_disc'); S.frames(20); S.key('Escape'); S.frames(8); S.clickBtn(/^END TURN/); } },
  combat_boss: { pre: 170, post: 300, enter(S) { startRunUi(S, 'odile', 'boss'); enrich(S); fightUi(S, ['the_matron'], 'boss'); }, inputs(S) { S.hoverRect(/^en\d+:name$/, 12); playCards(S, 2); S.clickBtn(/^Deck/); S.frames(24); S.clickRect('deck-x'); S.frames(10); S.clickBtn(/^END TURN/); S.frames(240); playCards(S, 3); S.clickBtn(/^END TURN/); } },
  combat_three: { pre: 170, post: 260, enter(S) { startRunUi(S, 'marrow', 'three'); fightUi(S, ['stitch_rat', 'pill_swarm', 'night_nurse']); }, inputs(S) { const r = S.rect(/^hand_/, 1), e = S.rect('en2:body'); if (r && e) S.drag(r.x + r.w / 2, r.y + r.h / 2, e.x + e.w / 2, e.y + e.h / 2); S.frames(34); playCards(S, 2); S.key('e'); S.frames(10); S.key('e'); } },
  combat_tips: { tips: true, pre: 200, post: 200, enter(S) { startRunUi(S, 'marrow', 'tips'); fightUi(S, ['orderly']); }, inputs(S) { S.tap(640, 360); S.frames(30); S.hoverRect(/^hand_/, 20, 1); S.hoverRect('orb', 20); playCards(S, 2); S.frames(20); S.clickBtn(/^END TURN/); } },
  reward: { enter(S) { const run = startRunUi(S, 'marrow', 'reward'); enrich(S, { relics: 2 }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'elite', enemies: ['the_resident'] }; S.M.RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 9, turns: 4 }); S.flow.route(); }, inputs(S) { S.hoverRect('reward-row0', 12); S.hoverRect('reward-chip0', 12); S.hoverRect('reward-purse', 10); S.hoverRect('reward-notes', 8); S.clickRect('reward-row0'); S.frames(14); S.clickBtn(/Continue/); } },
  reward_boss: { enter(S) { const run = wardStart(S, 'wick', 'reward-boss'); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'boss', enemies: ['the_matron'], ward: { boss: true, early: true, room: S.M.WD.theatreOf(run).id, count: 1 }, mods: {} }; S.M.RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 30, turns: 9 }); S.flow.route(); }, pre: 150, inputs(S) { for (let i = 0; i < 2; i++) S.hoverRect('reward-choice' + i, 10); S.clickRect('reward-choice1'); S.frames(14); S.clickRect('reward-choose'); S.frames(14); S.clickBtn(/Continue|Take|Skip/); } },
  graft: { post: 200, enter(S) { const run = startRunUi(S, 'marrow', 'graft'); enrich(S); S.M.RUN.startGraftPick(run); S.flow.route(); }, inputs(S) { S.hoverRect('graft-card0', 14); S.hoverRect('graft-patch0', 14); S.clickRect('graft-card1'); S.frames(12); S.clickRect('graft-patch1'); S.frames(20); S.hoverRect('graft-after', 12); S.hoverRect('graft-strain', 10); S.note('offer ' + JSON.stringify(S.run.pending && S.run.pending.offer)); S.clickBtn(/^Sew it on/); } },
  graft_decline: { post: 150, enter(S) { const run = startRunUi(S, 'odile', 'graft-decline'); run.hp = 30; S.M.RUN.startGraftPick(run); S.flow.route(); }, inputs(S) { S.clickRect('graft-card2'); S.frames(10); S.clickRect('graft-patch2'); S.frames(14); S.clickBtn(/^Reroll offer/); S.frames(40); S.clickBtn(/^Decline the graft/); S.frames(20); S.hoverRect('graft-skipmenu', 10); S.key('1'); S.frames(10); S.key('Enter'); } },
  shop: { enter(S) { const run = startRunUi(S, 'wick', 'shop'); enrich(S, { gold: 520 }); run.deck.push(S.M.K.newInst('j_clot', () => run.uidNext++)); run.phase = 'shop'; run.pending = S.M.RUN.makeShop(run); S.flow.route(); }, post: 120, inputs(S) { for (const id of ['shop-card0', 'shop-graft0', 'shop-relic0', 'shop-potion0']) S.hoverRect(id, 12); S.clickRect('shop-card1'); S.frames(30); S.clickRect('shop-potion1'); S.frames(30); S.clickRect('shop-relic0'); S.frames(30); S.note('gold ' + S.run.gold + ' deck ' + S.run.deck.length + ' relics ' + S.run.relics.length); S.clickRect('shop-graft1'); S.frames(24); S.tapIn('scroll-modal', 100, 93); S.frames(40); if (S.rect('modal')) S.clickBtn(/^Back$/); S.frames(110); S.clickBtn(/^Remove a card/); S.frames(24); S.tapIn('scroll-modal', 100, 93); S.frames(40); if (S.rect('modal')) S.clickBtn(/^Back$/); S.note('gold ' + S.run.gold + ' deck ' + deckLine(S.run).slice(0, 3).join(' ') + ' x' + S.run.deck.length); } },
  forge: { post: 200, enter(S) { const run = startRunUi(S, 'odile', 'forge'); enrich(S, { overload: true }); run.hp = Math.round(run.maxHp * 0.5); run.phase = 'forge'; run.pending = { kind: 'forge', used: false }; S.flow.route(); }, inputs(S) { for (let i = 0; i < 6; i++) S.hoverRect('forge-opt' + i, 8); S.clickRect('forge-opt0'); S.frames(30); S.note('forge ' + JSON.stringify(S.run.pending)); } },
  forge_temper: { post: 240, enter(S) { const run = startRunUi(S, 'marrow', 'temper'); enrich(S, { overload: true }); run.phase = 'forge'; run.pending = { kind: 'forge', used: false }; S.flow.route(); }, inputs(S) { S.hoverRect('forge-opt3', 10); S.clickRect('forge-opt3'); S.frames(30); S.at(160, 250, 12); S.tapIn('scroll-modal', 100, 93); S.frames(30); S.note('forge ' + JSON.stringify(S.run.pending) + ' deck ' + deckLine(S.run).slice(0, 3).join(' ')); } },
  event: { pre: 200, post: 120, enter(S) { const run = startRunUi(S, 'marrow', 'event'); enrich(S); drawEvent(S, run); S.note('event ' + (run.pending && run.pending.id)); S.flow.route(); }, inputs(S) { S.tapIn('event-panel', 60, 30); S.frames(20); S.hoverRect('event-choice0', 12); S.hoverRect('event-choice1', 12); S.hoverRect('event-hud', 8); S.clickRect(/^event-choice/, S.M.RUN.eventChoices(S.run).findIndex((c) => c.ok && !c.pick)); S.frames(60); S.note('result ' + (S.run.pending && S.run.pending.result ? 'shown' : 'none') + ' ' + S.state()); S.clickBtn(/^Continue/); } },
  event_picker: { pre: 200, post: 120, enter(S) { startRunUi(S, 'wick', 'picker'); enrich(S, { up: true }); const ev = pickerEvent(S); S.pick = ev; S.note('event ' + JSON.stringify(ev)); S.flow.route(); }, inputs(S) { if (!S.pick) return; S.tapIn('event-panel', 60, 30); S.frames(20); S.clickRect('event-choice' + S.pick.i); S.frames(30); S.note('picker ' + (S.rect('event-picker') ? 'open' : 'closed')); S.at(300, 300, 12); S.wheel(120); S.frames(8); S.wheel(-120); S.frames(8); S.scanTap('scroll-picker', 0.3, () => !S.rect('event-picker')); S.frames(100); S.note('result ' + (S.run.pending && S.run.pending.result ? 'shown' : 'none') + ' deck ' + deckLine(S.run).slice(0, 3).join(' ')); S.clickBtn(/^Continue/); } },
  deckview: { enter(S) { startRunUi(S, 'marrow', 'deck'); enrich(S, { overload: true, up: true }); S.flow.openDeck(); }, inputs(S) { S.clickBtn(/^Attack$/); S.frames(10); S.clickBtn(/^Grafted only$/); S.frames(10); S.clickBtn(/^All$/); S.frames(8); S.clickBtn(/^Cost$/); S.frames(10); S.at(420, 330, 16); S.wheel(240); S.frames(10); S.wheel(-240); S.frames(8); S.tap(420, 330); S.frames(30); S.key('Escape'); S.frames(8); S.hoverRect('deck-x', 8); } },
  codex: { veteran: true, enter(S) { S.flow.openCodex(); }, post: 40, inputs(S) { for (let i = 1; i < 8; i++) { S.clickRect('codex-tab' + i); S.frames(12); S.at(420, 360, 8); S.wheel(200); S.frames(4); } S.clickRect('codex-tab0'); S.frames(10); S.clickBtn(/^Wick$/); S.frames(10); S.tap(330, 330); S.frames(24); S.key('Escape'); } },
  archive: { veteran: true, enter(S) { S.flow.openArchive(); }, post: 40, inputs(S) { for (let i = 1; i < 6; i++) { S.clickRect('archive-tab' + i); S.frames(12); S.at(520, 400, 8); } S.clickRect('archive-tab0'); S.frames(8); S.clickRect('archive-fwick'); S.frames(10); S.wheel(300); S.frames(8); S.hoverRect('archive-queue', 12); S.hoverRect('archive-totals', 10); } },
  wardrobe: { veteran: true, enter(S) { S.flow.openWardrobe(); }, post: 40, inputs(S) { for (let i = 1; i < 4; i++) { S.clickRect('wardrobe-cat' + i); S.frames(12); S.hoverRect(/^wardrobe-[a-z]+-\d+$/, 8, 1); } S.clickRect('wardrobe-cat0'); S.frames(10); S.clickBtn(/^Buy|^Need|^Equip/); S.frames(14); S.clickBtn(/^Equip/); S.frames(14); S.hoverRect('wardrobe-credit', 10); S.note('loadout ' + canon(S.meta.loadout) + ' credit ' + canon(S.meta.credit)); } },
  settings: { enter(S) { S.flow.openSettings(); }, inputs(S) { const n = S.rects.length; S.note('clickables ' + n); for (let i = 0; i < n; i++) S.hoverN(i, 3); for (const i of [2, 5, 8, 11, 14, 17]) { S.clickN(i); S.frames(8); } S.key('ArrowDown'); S.key('ArrowDown'); S.key('ArrowRight'); S.frames(8); S.key('Enter'); S.frames(8); S.note('settings ' + canon(S.meta.settings)); } },
  settings_app: { enter(S) { S.flow.openSettings(); S.frames(20); S.app.push('app_panel'); }, inputs(S) { const n = S.rects.length; S.note('clickables ' + n); for (let i = 0; i < n; i++) S.hoverN(i, 5); S.note('buttons ' + S.btns.map((b) => b.label).join('|')); S.key('Escape'); S.frames(10); } },
  install_help: { enter(S) { S.app.push('install_help'); }, post: 30, inputs(S) { for (let i = 0; i < S.rects.length; i++) S.hoverN(i, 4); S.note('buttons ' + S.btns.map((b) => b.label).join('|')); S.frames(10); S.app.pop(); S.app.push('offline_prompt'); S.frames(40); for (let i = 0; i < S.rects.length; i++) S.hoverN(i, 4); S.note('buttons ' + S.btns.map((b) => b.label).join('|')); } },
  pause: { pre: 170, enter(S) { startRunUi(S, 'wick', 'pause'); enrich(S); fightUi(S, ['night_nurse', 'crutchling']); S.frames(150); S.flow.openPause(); }, inputs(S) { const n = S.rects.length; S.note('clickables ' + n + ' buttons ' + S.btns.map((b) => b.label).join('|')); for (let i = 0; i < n; i++) S.hoverN(i, 4); S.away(); for (let i = 0; i < 3; i++) S.key('ArrowDown'); S.frames(6); S.key('Enter'); S.frames(30); S.at(640, 400, 6); S.wheel(240); S.frames(10); S.key('Escape'); S.frames(12); S.key('ArrowDown'); S.key('Enter'); S.frames(20); S.note('clickables ' + S.rects.length); S.key('Escape'); S.frames(10); S.note('stack ' + S.state()); } },
  end_won: { veteran: true, post: 150, enter(S) { const run = startRunUi(S, 'odile', 'won', { asc: 2 }); enrich(S, { overload: true, up: true }); Object.assign(run.stats, { fights: 21, elites: 4, grafts: 11, floors: 31, bosses: 3, goldEarned: 812, damageTaken: 301 }); run.act = 3; run.seenEnemies = ['the_matron', 'the_broker', 'the_impresario', 'the_grafter']; run.phase = 'won'; run.pending = null; S.flow.route(); }, inputs(S) { S.hoverRect('end-star', 12); S.hoverRect('end-grid', 12); S.hoverRect('end-news', 10); S.wheel(200); S.frames(8); S.hoverBtn(/^Endless/, 10); S.clickBtn(/^Copy seed/); S.frames(20); S.hoverRect('end-archive', 10); } },
  end_dead: { post: 150, enter(S) { const run = startRunUi(S, 'marrow', 'dead'); enrich(S); Object.assign(run.stats, { fights: 7, elites: 1, grafts: 4, floors: 9, damageTaken: 96 }); run.hp = 0; run.killedBy = 'two_gurneys'; run.deathCause = 'attack'; run.phase = 'dead'; run.pending = null; S.flow.route(); }, inputs(S) { S.hoverRect('end-recap', 12); S.hoverRect('end-title', 8); S.hoverBtn(/^New Run/, 10); S.wheel(160); S.frames(8); S.clickBtn(/^Back to title/); } },
}, assets: {
  title_kit: { post: 120, inputs(S) { S.hoverBtn(/^New Run/, 14); S.hoverRect('title-hero-card', 14); S.away(); S.frames(60); S.clickBtn(/^New Run/); } },
  ward_kit_morning: { pre: 220, enter(S) { wardStart(S, 'marrow', 'kit'); }, inputs(S) { for (let i = 0; i < 5; i++) S.hoverRect('ward-card' + i, 8); S.clickRect('ward-card1'); S.frames(10); S.key('Tab'); S.frames(6); S.key('Enter'); S.frames(40); for (let i = 0; i < 4; i++) S.hoverRect(/^ward-room-/, 10, i); S.key('w'); S.frames(14); S.key('w'); S.frames(14); S.clickBtn(/^View$/); S.frames(30); S.key('Escape'); } },
  ward_kit_built: { pre: 220, post: 420, enter(S) { const run = wardStart(S, 'wick', 'kit-built'); buildHospital(S); S.M.WD.endMorning(run); }, inputs(S) { for (let i = 0; i < 12; i += 2) S.hoverRect(/^ward-room-/, 8, i); S.clickBtn(/^\+$/); S.frames(14); S.key('c'); S.frames(14); wardRoute(S, 4); S.key('g'); } },
  ward_kit_night: { pre: 220, post: 300, enter(S) { const run = wardStart(S, 'odile', 'kit-night'); const WD = S.M.WD; buildHospital(S); WD.endMorning(run); for (let i = 0; i < 2 && run.phase === 'ward'; i++) WD.startWalk(run, run.ward.hero.room); S.note('phase ' + run.phase + ' ' + run.ward.phase); S.flow.route(); }, inputs(S) { for (let i = 0; i < 12; i += 3) S.hoverRect(/^ward-room-/, 8, i); S.key('w'); S.frames(12); wardRoute(S, 2); S.key('g'); } },
  combat_art: { pre: 200, post: 300, enter(S) { startRunUi(S, 'marrow', 'art'); enrich(S); fightUi(S, ['crutchling', 'bedpan_slime']); }, inputs(S) { S.hoverRect(/^en\d+:body$/, 12); playCards(S, 3); S.clickBtn(/^END TURN/); S.frames(240); playCards(S, 3); S.clickBtn(/^END TURN/); } },
  combat_art_boss: { pre: 200, post: 300, enter(S) { startRunUi(S, 'wick', 'art-boss'); enrich(S, { overload: true }); fightUi(S, ['the_matron'], 'boss'); }, inputs(S) { playCards(S, 3); S.clickBtn(/^END TURN/); S.frames(260); playCards(S, 2); S.clickBtn(/^END TURN/); } },
  combat_art_kill: { pre: 200, post: 300, enter(S) { const run = startRunUi(S, 'odile', 'art-kill'); enrich(S); fightUi(S, ['the_resident'], 'elite'); S.frames(120); const combat = S.app.screens.combat; if (combat && combat.api) { const c = combat.api().c; for (const e of c.enemies) e.hp = Math.min(e.hp, 3); S.note('enemy hp set to 3'); } }, inputs(S) { playCards(S, 3); S.frames(120); S.note('after ' + S.state()); } },
  shop_ward: { pre: 150, enter(S) { const run = wardStart(S, 'marrow', 'kit-shop'); enrich(S, { gold: 600 }); run.phase = 'shop'; run.pending = S.M.RUN.makeShop(run); S.flow.route(); }, inputs(S) { S.hoverRect('shop-plans', 12); for (const id of ['shop-card0', 'shop-relic0']) S.hoverRect(id, 10); S.clickRect('shop-plans'); S.frames(30); S.tap(640, 360); S.frames(30); S.note('gold ' + S.run.gold); } },
} };

async function runScene(sec, name, v, o = {}) {
  const sc = SCENES[sec][name];
  const S = await bootStage(sec, v, { tips: sc.tips, veteran: sc.veteran, sink: o.sink });
  if (sc.enter) await sc.enter(S);
  await S.wait(sc.pre === undefined ? 90 : sc.pre); S.mark('enter');
  if (sc.inputs) await sc.inputs(S);
  S.mark('inputs');
  await S.wait(sc.post === undefined ? 60 : sc.post); S.mark('end');
  return S.result();
}
function parseSceneKey(key) {
  const m = /^(ui|assets)\/([^@]+)@(.+)$/.exec(key || ''), v = m && VARIANTS.find((x) => x.id === m[3]);
  if (!m || !v || !SCENES[m[1]][m[2]]) throw new Error(`unknown scene ${key} (try: node tools/graftwork_golden.mjs list)`);
  return { sec: m[1], name: m[2], v };
}
// One fresh process per scene and variant. cold = the first pass, warm = the same script again in the same process (caches built).
async function sceneChild(key) {
  const { sec, name, v } = parseSceneKey(key), out = {};
  installDeterminism();
  try {
    out.cold = await runScene(sec, name, v);
    if (!QUICK) { const w = await runScene(sec, name, v); out.warm = { hash: w.hash, calls: w.calls, marks: w.marks, state: w.state }; }
    if (flag('thrice')) { const w = await runScene(sec, name, v), ref = out.warm || out.cold; out.thrice = w.hash === ref.hash && w.calls === ref.calls; } // --verify: is a further pass in this process identical to the one before it?
  } catch (e) { out.error = String(e && e.stack || e).split('\n').slice(0, 5).join(' | ').slice(0, 600); }
  return out;
}
async function cmdDump() {
  const [key, file] = positional;
  if (!key || !file) { console.error('usage: dump <ui|assets>/<scene>@<variant> <out.txt> [--root dir] [--warm]'); process.exit(2); }
  const { sec, name, v } = parseSceneKey(/^(ui|assets)\//.test(key) ? key : 'ui/' + key);
  installDeterminism();
  for (let i = 1, n = flag('warm') ? 2 : Number(opt('pass', 1)) || 1; i < n; i++) await runScene(sec, name, v); // --warm = --pass 2: dump the n-th pass in this process
  const fd = fs.openSync(file, 'w'); let buf = [];
  const r = await runScene(sec, name, v, { sink: (s) => { buf.push(s); if (buf.length >= 20000) { fs.writeSync(fd, buf.join('\n') + '\n'); buf = []; } } });
  fs.writeSync(fd, buf.join('\n') + '\n'); fs.closeSync(fd);
  console.log(`${key}: ${r.calls} calls, sha1 ${r.hash}, written to ${file}\n${r.trail.join('\n')}`);
}
// --verify: every child runs a second time in another fresh process, and any key that differs is a failure (not deterministic).
// The second scene child also runs one more pass in its process: with caches warm, two passes in a row should be identical too.
// A scene where they are not is reported (and kept in meta.verify), not failed: its cold and warm hashes still reproduce.
async function verifyScenes(out, tasks, jobs, failures) {
  let n = 0; const unsteady = [];
  await pool(tasks, jobs, async (t) => {
    const r = await runChild(t.sec ? [...t.args, '--thrice'] : t.args), first = t.sec ? out[t.sec][t.key] : t.name === 'engine' ? out.engine : { resume: out.resume, payloads: out.payloads };
    let second = r.data;
    if (second && t.sec) { const { thrice, ...rest } = second; second = rest; if (thrice === false && !QUICK) unsteady.push(t.name); } // --quick has no warm pass to compare with
    if (second && t.name === 'resume') second = { resume: second.resume, payloads: second.payloads };
    n++;
    if (!second || canon(second) !== canon(first)) {
      const a = flatten(first, t.name, new Map()), b = second ? flatten(second, t.name, new Map()) : new Map();
      failures.push(`${t.name}: NOT DETERMINISTIC, a second fresh process differs in ${[...a.keys()].filter((k) => a.get(k) !== b.get(k)).slice(0, 4).join(', ') || 'everything'}`);
    }
  });
  const before = out.meta.verify, mine = new Set(tasks.map((t) => t.name)); // --merge: keep what an earlier verify said about the scenes this run did not touch
  if (before) { for (const x of before.unsteady || []) if (!mine.has(x)) unsteady.push(x); n += Math.max(0, (before.children || 0) - tasks.length); }
  unsteady.sort();
  out.meta.verify = { children: n, unsteady };
  console.log(`verify: ${tasks.length} children ran a second time in fresh processes${unsteady.length ? `; ${unsteady.length} scenes where a further pass in the same process still differs from the one before: ${unsteady.join(' ')}` : '; every scene repeats itself exactly once its caches are warm'}`);
}

// ---------------------------------------------------------------- browser (--browser): real Chromium pixels, frozen clock
// The page never runs its own frame loop: requestAnimationFrame is captured, the clock and Math.random are the tool's, reduced motion
// is on. Each state is set up twice: a first time to let every image download and decode, then again from a reset clock for a fixed
// number of ticks, so the picture does not depend on how long the network took.
const SHOT_VIEWS = [
  { id: 'desk', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { id: 'phone', viewport: { width: 1000, height: 462 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
];
const SHOT_STATES = ['title', 'ward_built', 'combat', 'graft', 'shop', 'title_select', 'ward_morning', 'combat_boss', 'reward', 'forge', 'event', 'deckview', 'codex', 'pause', 'end_won', 'end_dead']; // --quick: the first five
const SHOT_INIT = `(() => {
  let clock = 1e6, seed = 0x9e3779b9;
  const EPOCH = 1767571200000, RealDate = Date;
  Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  performance.now = () => clock;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(EPOCH + Math.floor(clock)); } static now() { return EPOCH + Math.floor(clock); } }
  window.Date = FakeDate;
  // the game's frame loop never starts: its first requestAnimationFrame is swallowed here; release() gives the real one back (Playwright's screenshot waits on a frame)
  const raf0 = window.requestAnimationFrame.bind(window), caf0 = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {};
  try { localStorage.setItem('graftwork_meta_v1', JSON.stringify({ v: 1, settings: { reducedMotion: true, tips: false, graphics: 'high' } })); localStorage.removeItem('graftwork_run_v1'); } catch (e) {}
  const btns = []; let bf = -1;
  window.__golden = {
    reset() { clock = 1e6; seed = 0x9e3779b9; },
    release() { window.requestAnimationFrame = raf0; window.cancelAnimationFrame = caf0; },
    hook() { const app = window.__gw.app; if (app.__goldenHook) return; app.__goldenHook = true; const b0 = app.button; app.button = (label, x, y, w, h, o) => { if (bf !== app.frame) { bf = app.frame; btns.length = 0; } btns.push({ label: String(label), x, y, w, h, dis: !!(o && o.disabled) || !!app.blocked }); return b0(label, x, y, w, h, o); }; },
    tick(n, dt) { const app = window.__gw.app, d = dt || 1 / 60; for (let i = 0; i < n; i++) { clock += d * 1000; app.tick(d); } },
    click(x, y) { const m = window.__gw.app.mouse; m.x = x; m.y = y; m.pressed = true; m.down = true; this.tick(1); m.released = true; m.down = false; this.tick(1); m.x = -999; m.y = -999; },
    clickBtn(src) { const re = new RegExp(src), b = btns.find((q) => re.test(q.label) && !q.dis); if (!b) return false; this.click(b.x + b.w / 2, b.y + b.h / 2); return true; },
    clickRect(src, n) { const re = new RegExp(src), r = window.__gw.app.layout.getAll().filter((q) => re.test(q.id))[n || 0]; if (!r) return false; this.click(r.x + r.w / 2, r.y + r.h / 2); return true; },
  };
})();`;
// runs in the page: put the game in a named state (the same engine calls the headless scenes use)
async function shotSetup(name) {
  const { app, flow } = window.__gw, G = window.__golden;
  const RUN = await import('/graftwork/engine/run.js'), WD = await import('/graftwork/engine/ward.js'), K = await import('/graftwork/engine/cards.js'), D = await import('/graftwork/data/index.js');
  G.hook(); G.reset();
  while (app.stack.length > 1) app.pop();
  try { localStorage.removeItem('graftwork_run_v1'); } catch (e) { /* no storage */ }
  const start = (hero, seed) => { flow.start({ hero, seed: 'golden-shot-' + seed }); return app.shared.run; };
  const rich = (run) => {
    let k = 3;
    for (const [idx, n] of [[0, 1], [1, 2], [2, 3]]) { const inst = run.deck[idx]; for (let g = 0; g < D.GRAFT_LIST.length && inst.grafts.length < n; g++, k += 7) { const gid = D.GRAFT_LIST[k % D.GRAFT_LIST.length].id; if (K.canGraft(inst, gid)) RUN.applyGraft(run, inst.uid, gid, { keepPhase: true }); } }
    const relics = Object.values(D.RELICS).filter((r) => !r.ward && !r.hero && r.rarity !== 'boss'); for (let i = 0; i < 5; i++) RUN.addRelic(run, relics[(i * 11 + 2) % relics.length].id);
    const pots = Object.keys(D.POTIONS); RUN.addPotion(run, pots[1]); RUN.addPotion(run, pots[5 % pots.length]);
    run.gold = 400; return run;
  };
  const fight = (run, enemies, kind) => { run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: kind || 'normal', enemies }; flow.route(); };
  let ticks = 30; // 50 ms steps after the setup (reduced motion: screens settle at once)
  switch (name) {
    case 'title': app.shared.run = null; flow.toTitle(); break;
    case 'title_select': app.shared.run = null; flow.toTitle(); G.tick(12, 0.05); G.clickBtn('^New Run'); break;
    case 'ward_morning': start('marrow', 'ward'); ticks = 70; break;
    case 'ward_built': {
      const run = start('wick', 'built'), w = run.ward; w.res.wood = 60; w.res.stone = 60; run.gold = 900; w.deck.hand = [];
      for (const id of ['b_corridor', 'b_ward_wing', 'b_generator', 'b_dispensary', 'b_workshop', 'b_isolation', 'b_corridor', 'b_linen']) { if (!WD.BUILD_CARDS[id]) continue; const c = { uid: 9000 + w.cardNext++, id }; w.deck.hand.push(c); for (const [x, y] of WD.buildCells(run)) if (WD.playBuildCard(run, c.uid, { x, y }).ok) break; }
      WD.endMorning(run); for (let i = 0; i < 3 && run.phase === 'ward' && w.phase !== 'morning'; i++) WD.startWalk(run, w.hero.room); // a day passes: the rooms fill
      WD.endMorning(run); ticks = 80; break;
    }
    case 'combat': fight(rich(start('marrow', 'combat')), ['bedpan_slime', 'gauze_mummy']); G.tick(70, 0.05); G.clickRect('^hand_', 0); G.tick(8); G.clickRect('^en\\d+:body$', 0); ticks = 40; break;
    case 'combat_boss': fight(rich(start('odile', 'boss')), ['the_matron'], 'boss'); ticks = 80; break;
    case 'reward': { const run = rich(start('marrow', 'reward')); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'elite', enemies: ['the_resident'] }; RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 9, turns: 4 }); flow.route(); break; }
    case 'graft': { const run = rich(start('marrow', 'graft')); RUN.startGraftPick(run); flow.route(); G.tick(30, 0.05); G.clickRect('^graft-card1$'); G.tick(6); G.clickRect('^graft-patch1$'); ticks = 20; break; }
    case 'shop': { const run = rich(start('wick', 'shop')); run.phase = 'shop'; run.pending = RUN.makeShop(run); flow.route(); break; }
    case 'forge': { const run = rich(start('odile', 'forge')); run.hp = Math.round(run.maxHp / 2); run.phase = 'forge'; run.pending = { kind: 'forge', used: false }; flow.route(); break; }
    case 'event': { const run = rich(start('marrow', 'event')); WD.wardStartEvent(run); flow.route(); ticks = 100; break; }
    case 'deckview': rich(start('marrow', 'deck')); flow.openDeck(); break;
    case 'codex': app.shared.run = null; flow.toTitle(); flow.openCodex(); break;
    case 'settings': app.shared.run = null; flow.toTitle(); flow.openSettings(); break;
    case 'pause': fight(rich(start('wick', 'pause')), ['night_nurse', 'crutchling']); G.tick(60, 0.05); flow.openPause(); ticks = 20; break;
    case 'end_won': { const run = rich(start('odile', 'won')); Object.assign(run.stats, { fights: 21, elites: 4, grafts: 11, floors: 31, bosses: 3, goldEarned: 812, damageTaken: 301 }); run.act = 3; run.phase = 'won'; run.pending = null; flow.route(); ticks = 70; break; }
    case 'end_dead': { const run = rich(start('marrow', 'dead')); run.hp = 0; run.killedBy = 'two_gurneys'; run.phase = 'dead'; run.pending = null; flow.route(); ticks = 70; break; }
    default: throw new Error('unknown state ' + name);
  }
  return ticks;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
function serveRoot() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function shotsDir() {
  const dir = path.resolve(opt('shots', path.join('/tmp/claude-0/golden', opt('label', 'shots_' + (gitHead(ROOT) || path.basename(ROOT))))));
  for (const r of [REPO, ROOT]) if (dir === r || dir.startsWith(r + path.sep)) { console.error(`screenshots must live outside the repo: ${dir} is inside ${r}`); process.exit(2); }
  return dir;
}
async function recordBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const dir = shotsDir(), out = {};
  fs.mkdirSync(dir, { recursive: true });
  const srv = await serveRoot(), base = 'http://127.0.0.1:' + srv.address().port, browser = await chromium.launch({ headless: true });
  const states = QUICK ? SHOT_STATES.slice(0, 5) : SHOT_STATES;
  try {
    await Promise.all(SHOT_VIEWS.map(async (view) => { // the two viewports side by side, each in its own context
      const { id, ...ctxOpts } = view, ctx = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await ctx.addInitScript(SHOT_INIT);
      const page = await ctx.newPage(), errors = [];
      let requests = 0, inflight = 0;
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('request', () => { requests++; inflight++; });
      page.on('requestfinished', () => { inflight--; });
      page.on('requestfailed', () => { inflight--; });
      await page.goto(base + '/graftwork/', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__gw && window.__gw.app && window.__gw.app.current === 'title', null, { timeout: 60000 });
      await page.evaluate(() => window.__golden.release());
      const settle = async () => { // tick, let every request finish and decode, repeat until a round asks for nothing new
        for (let round = 0, last = -1; round < 30 && last !== requests; round++) {
          last = requests; await page.evaluate(() => window.__golden.tick(3, 0.05));
          for (let w = 0; w < 400 && inflight > 0; w++) await page.waitForTimeout(25);
          await page.waitForTimeout(100);
        }
      };
      for (const st of states) {
        const ts = REAL_NOW();
        await page.evaluate(shotSetup, st); await settle();                       // pass 1: everything this state draws is downloaded and decoded
        const ticks = await page.evaluate(shotSetup, st);                         // pass 2: the same state from a reset clock
        await page.evaluate((n) => window.__golden.tick(n, 0.05), ticks); // 50 ms steps: the longest step the game's own loop takes
        const file = path.join(dir, `${id}_${st}.png`);
        await page.screenshot({ path: file });
        const px = decodePng(fs.readFileSync(file));
        out[`${id}/${st}`] = { w: px.w, h: px.h, pixels: sha1(px.data) };
        if (flag('verbose')) console.log(`  shot ${id}/${st} ${((REAL_NOW() - ts) / 1000).toFixed(1)}s (${ticks} ticks)`);
      }
      if (errors.length) out[`${id}/pageErrors`] = errors.slice(0, 10);
      await ctx.close();
    }));
  } finally { await browser.close(); srv.close(); }
  console.log(`browser: ${Object.keys(out).length} screenshots in ${dir}`);
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}
// PNG -> { w, h, data: RGBA or RGB bytes } (8 bit, colour type 2 or 6, not interlaced: what Chromium writes)
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; if (body[8] !== 8 || (ct !== 2 && ct !== 6) || body[12] !== 0) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, data = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? data[dst + x - bpp] : 0, b = y ? data[dst + x - stride] : 0, c = x >= bpp && y ? data[dst + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, data };
}
function cmdCompareShots() {
  const [da, db] = positional;
  if (!da || !db) { console.error('usage: compare-shots <dirA> <dirB> [--tolerance <mean abs diff, default 0>]'); process.exit(2); }
  const tol = Number(opt('tolerance', 0)) || 0, names = [...new Set([...fs.readdirSync(da), ...fs.readdirSync(db)])].filter((n) => n.endsWith('.png')).sort();
  let bad = 0;
  for (const n of names) {
    const fa = path.join(da, n), fb = path.join(db, n);
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) { console.log(`${n.padEnd(28)} only in ${fs.existsSync(fa) ? 'A' : 'B'}`); bad++; continue; }
    const a = decodePng(fs.readFileSync(fa)), b = decodePng(fs.readFileSync(fb));
    if (a.w !== b.w || a.h !== b.h || a.bpp !== b.bpp) { console.log(`${n.padEnd(28)} size differs: ${a.w}x${a.h} vs ${b.w}x${b.h}`); bad++; continue; }
    let sum = 0, max = 0, px = 0;
    for (let i = 0; i < a.data.length; i += a.bpp) { let d = 0; for (let k = 0; k < a.bpp; k++) { const e = Math.abs(a.data[i + k] - b.data[i + k]); sum += e; if (e > max) max = e; d |= e; } if (d) px++; }
    const mean = sum / a.data.length;
    if (mean > tol) bad++;
    console.log(`${n.padEnd(28)} mean abs diff ${mean.toFixed(4)}  max ${max}  pixels changed ${px} of ${a.w * a.h} (${(100 * px / (a.w * a.h)).toFixed(3)}%)${mean > tol ? '  DIFFERENT' : ''}`);
  }
  console.log(bad ? `${bad} of ${names.length} screenshots differ` : `${names.length} screenshots identical${tol ? ' within ' + tol : ''}`);
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- record: one child process per section and per UI scene
const MARK = '@@GOLDEN@@';
function runChild(args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve) => {
    const t0 = REAL_NOW();
    const p = spawn(process.execPath, [SELF, '__child', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TZ: 'UTC' } });
    let out = '', err = '';
    const timer = setTimeout(() => { err += '\n(timeout)'; p.kill('SIGKILL'); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      clearTimeout(timer);
      const i = out.lastIndexOf(MARK);
      let data = null;
      if (i >= 0) { try { data = JSON.parse(out.slice(i + MARK.length)); } catch (e) { err += '\nbad child output: ' + e.message; } }
      resolve({ data, code, err: err.trim(), ms: REAL_NOW() - t0 });
    });
  });
}
async function pool(tasks, jobs, each) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, async () => { while (next < tasks.length) { const t = tasks[next++]; await each(t); } }));
}
const gitHead = (dir) => { try { const r = spawnSync('git', ['-C', dir, 'rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; } catch { return null; } };

async function cmdRecord() {
  const outFile = positional[0];
  if (!outFile) { console.error('usage: record <out.json> [--root dir] [--only engine,ui,assets,resume] [--quick] [--resume-from base.json] [--browser]'); process.exit(2); }
  if (!fs.existsSync(path.join(ROOT, 'graftwork/main.js'))) { console.error(`no graftwork/main.js under ${ROOT}`); process.exit(2); }
  const only = String(opt('only', 'engine,ui,assets,resume')).split(',').map((s) => s.trim()).filter(Boolean);
  const jobs = Math.max(1, Number(opt('jobs', Math.min(4, os.cpus().length))) || 1);
  const pass = ['--root', ROOT, ...(QUICK ? ['--quick'] : []), ...(CLASSIC_RNG ? ['--classic-rng'] : []), ...(opt('resume-from', null) ? ['--resume-from', path.resolve(opt('resume-from'))] : [])];
  const t0 = REAL_NOW(), out = { meta: { tool: TOOL_VERSION, root: ROOT, head: gitHead(ROOT), quick: QUICK, ...(CLASSIC_RNG ? { classicRng: true } : {}), sections: only.slice(), node: process.version, recorded: new Date().toISOString(), seconds: {} } };
  const failures = [], tasks = [];
  if (only.includes('engine')) tasks.push({ name: 'engine', args: ['engine', ...pass] });
  if (only.includes('resume')) tasks.push({ name: 'resume', args: ['resume', ...pass] });
  const scenes = opt('scenes', null) ? new Set(String(opt('scenes')).split(',').map((x) => x.trim())) : null; // --scenes shop,forge: only these
  for (const sec of ['ui', 'assets']) if (only.includes(sec)) for (const key of sceneKeys(sec)) if (!scenes || scenes.has(key.split('@')[0])) tasks.push({ name: sec + '/' + key, sec, key, args: ['scene', '--key', sec + '/' + key, ...pass] });
  // --merge: what this run does not record is kept from the file that is already there (same root, same --quick)
  const prev = flag('merge') && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
  if (prev && (path.resolve(prev.meta.root) !== ROOT || !!prev.meta.quick !== QUICK)) { console.error(`--merge: ${outFile} was recorded from ${prev.meta.root}${prev.meta.quick ? ' (quick)' : ''}, not from ${ROOT}${QUICK ? ' (quick)' : ''}`); process.exit(2); }
  const secMs = {};
  await pool(tasks, jobs, async (t) => {
    const r = await runChild(t.args);
    const sec = t.sec || t.name; secMs[sec] = (secMs[sec] || 0) + r.ms;
    if (!r.data) { failures.push(`${t.name}: child failed (exit ${r.code})\n${r.err.split('\n').slice(-8).join('\n')}`); if (t.sec) (out[t.sec] = out[t.sec] || {})[t.key] = { error: 'child failed' }; return; }
    if (t.name === 'engine') out.engine = r.data;
    else if (t.name === 'resume') { out.resume = r.data.resume; out.payloads = r.data.payloads; out.meta.resumeFrom = r.data.resumeFrom; }
    else { (out[t.sec] = out[t.sec] || {})[t.key] = r.data; if (r.data.error) failures.push(`${t.name}: ${r.data.error}`); }
    if (flag('verbose')) console.log(`  ${t.name} ${(r.ms / 1000).toFixed(1)}s`);
  });
  if (prev) {
    for (const sec of ['ui', 'assets']) if (prev[sec]) out[sec] = { ...prev[sec], ...(out[sec] || {}) };
    for (const k of ['engine', 'resume', 'payloads', 'browser']) if (out[k] === undefined && prev[k] !== undefined && !(k === 'browser' && flag('browser'))) out[k] = prev[k];
    out.meta = { ...prev.meta, tool: TOOL_VERSION, head: out.meta.head, seconds: out.meta.seconds, merged: [...(prev.meta.merged || []), { recorded: out.meta.recorded, tasks: tasks.length, only: only.join(','), scenes: scenes ? [...scenes].join(',') : null }] };
    if (out.resume && !only.includes('resume')) out.meta.resumeFrom = prev.meta.resumeFrom;
  }
  for (const sec of ['ui', 'assets']) if (out[sec]) out[sec] = Object.fromEntries(Object.keys(out[sec]).sort().map((k) => [k, out[sec][k]]));
  if (flag('verify')) await verifyScenes(out, tasks, jobs, failures);
  if (flag('browser')) { const tb = REAL_NOW(); out.browser = await recordBrowser(); out.meta.shots = shotsDir(); secMs.browser = REAL_NOW() - tb; }
  for (const k of Object.keys(secMs)) out.meta.seconds[k] = Math.round(secMs[k] / 100) / 10; // summed child time per section (cpu-ish, not wall)
  out.meta.seconds.wall = Math.round((REAL_NOW() - t0) / 100) / 10;
  const ordered = {}; for (const k of ['meta', 'engine', 'resume', 'ui', 'assets', 'browser', 'payloads']) if (out[k] !== undefined) ordered[k] = out[k];
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(ordered, null, 1));
  const flat = new Map(); for (const k of Object.keys(ordered)) if (k !== 'meta' && k !== 'payloads') flatten(ordered[k], k, flat);
  const errs = [...flat].filter(([k, v]) => /(^|\/)error$/.test(k) || (typeof v === 'string' && v.startsWith('error: ')));
  console.log(`recorded ${flat.size} keys from ${ROOT}${out.meta.head ? ' @ ' + out.meta.head : ''} into ${outFile} in ${out.meta.seconds.wall}s (${jobs} jobs${QUICK ? ', quick' : ''}); sections: ${Object.entries(out.meta.seconds).filter(([k]) => k !== 'wall').map(([k, v]) => `${k} ${v}s`).join(', ')}`);
  if (errs.length) { console.log(`${errs.length} recorded errors (they are part of the golden; a code path that throws on the baseline):`); for (const [k, v] of errs.slice(0, 20)) console.log(`  ${k}: ${String(v).slice(0, 160)}`); }
  if (failures.length) { console.error(`${failures.length} FAILURES:`); for (const f of failures) console.error('  ' + f); process.exit(1); }
}

// ---------------------------------------------------------------- compare
function flatten(v, pre, out) {
  if (v !== null && typeof v === 'object') {
    const arr = Array.isArray(v), keys = arr ? v.map((_, i) => i) : Object.keys(v);
    if (!keys.length) out.set(pre, arr ? '[]' : '{}');
    for (const k of keys) flatten(v[k], arr ? `${pre}[${k}]` : `${pre}/${k}`, out);
  } else out.set(pre, v);
  return out;
}
function cmdCompare() {
  const [fa, fb] = positional;
  if (!fa || !fb) { console.error('usage: compare <a.json> <b.json> [--common]'); process.exit(2); }
  const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8')), common = flag('common');
  const a = new Map(), b = new Map();
  for (const k of Object.keys(A)) if (k !== 'meta' && k !== 'payloads') flatten(A[k], k, a);
  for (const k of Object.keys(B)) if (k !== 'meta' && k !== 'payloads') flatten(B[k], k, b);
  const show = (v) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 140 ? s.slice(0, 137) + '...' : s; };
  const lists = new Map(); // list path -> { first, n }: one line per differing list (a trace that forks differs in every later line)
  let diff = 0, same = 0, onlyA = 0, onlyB = 0;
  const bySec = {};
  const note = (k, line) => {
    diff++; const sec = k.split('/')[0]; bySec[sec] = (bySec[sec] || 0) + 1;
    const m = /^(.*)\[(\d+)\]$/.exec(k);
    if (m) { const L = lists.get(m[1]); if (L) { L.n++; return; } lists.set(m[1], { n: 1 }); }
    console.log(line);
  };
  for (const [k, va] of a) {
    if (!b.has(k)) { if (!common) { onlyA++; note(k, `only in A  ${k} = ${show(va)}`); } continue; }
    const vb = b.get(k);
    if (va === vb) same++; else note(k, `differs    ${k}\n             A ${show(va)}\n             B ${show(vb)}`);
  }
  for (const [k, vb] of b) if (!a.has(k) && !common) { onlyB++; note(k, `only in B  ${k} = ${show(vb)}`); }
  for (const [p, L] of lists) if (L.n > 1) console.log(`           ${p}: ${L.n} entries differ in all (the first one is shown above)`);
  const where = (M) => `${M.meta && M.meta.root}${M.meta && M.meta.head ? ' @ ' + M.meta.head : ''}${M.meta && M.meta.quick ? ' (quick)' : ''}`;
  console.log(`A: ${fa}  ${where(A)}\nB: ${fb}  ${where(B)}`);
  if (B.meta && B.meta.resumeFrom) console.log(`B continued the saved payloads of ${B.meta.resumeFrom}`);
  console.log(diff ? `${diff} DIFFERENCES (${Object.entries(bySec).map(([s, n]) => `${s} ${n}`).join(', ')}${onlyA || onlyB ? `; only in A ${onlyA}, only in B ${onlyB}` : ''}); ${same} keys identical` : `0 differences: ${same} keys identical${common ? ' (common keys only)' : ''}`);
  process.exit(diff ? 1 : 0);
}

// ---------------------------------------------------------------- entry
async function main() {
  if (CMD === '__child') {
    const what = argv[1];
    let data;
    if (what === 'engine') data = await sectionEngine();
    else if (what === 'resume') data = await sectionResume();
    else if (what === 'scene') data = await sceneChild(opt('key'));
    else throw new Error('unknown child ' + what);
    process.stdout.write('\n' + MARK + JSON.stringify(data) + '\n');
    return;
  }
  if (CMD === 'record') return cmdRecord();
  if (CMD === 'compare') return cmdCompare();
  if (CMD === 'compare-shots') return cmdCompareShots();
  if (CMD === 'dump') return cmdDump();
  if (CMD === 'list') { for (const sec of ['ui', 'assets']) console.log(`${sec}: ${sceneNames(sec).join(' ')}\n  variants: ${VARIANTS.map((v) => v.id).join(' ')}`); return; }
  console.error('usage: node tools/graftwork_golden.mjs record|compare|compare-shots|dump|list ... (see the header of this file)');
  process.exit(2);
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
