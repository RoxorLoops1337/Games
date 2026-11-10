#!/usr/bin/env node
// Golden master recorder for the Graftwork cleanup (graftwork/design/CLEANUP_PLAN.md, phase 0).
// Record once on the baseline, record again after a refactor, compare: every key must be identical.
//
//   node tools/graftwork_golden.mjs record <out.json> [--root <repo dir>] [--only engine,ui,assets,resume] [--quick]
//                                      [--resume-from <baseline.json>] [--browser [--shots <dir>] [--label <name>]] [--jobs N] [--verify]
//   node tools/graftwork_golden.mjs compare <a.json> <b.json> [--common]      every differing key, exit 1 on any difference
//   node tools/graftwork_golden.mjs compare-shots <dirA> <dirB>               mean absolute pixel difference per screenshot
//   node tools/graftwork_golden.mjs dump <scene@variant> <out.txt> [--root <repo dir>] [--warm]   full draw-call log of one scene (diff two of them)
//   node tools/graftwork_golden.mjs list                                      scene and variant names
//
// --root runs against another checkout: the game is imported from <root>/graftwork, the fake-canvas recorder from
// <root>/tests/graftwork_rec_lib.mjs and the bots from <root>/tools/graftwork_sim.mjs + graftwork_strong.mjs, all by file URL, so
// this file may live outside that checkout. Default root: the repo this file is in.
//
// Sections (each key of the JSON is one comparable fact; `meta` and `payloads` are never compared):
//   engine  seeded full runs for every hero x mode (classic, ward) x seeds (strong bot from the root's tools, the Ward builder and
//           walker replicated here), a step trace with the rng state after every step, the final save payload hash; plus probes:
//           rng streams, cardSpec for every card x grafts, rules text, every card / graft / relic / potion / event / enemy driven
//           through a fixed fight or choice, unlock tables, Ward tables.
//   resume  save compatibility: runs saved after k steps (between screens, mid combat, mid Ward walk, after a graft), the payload
//           stored in the file, then continued FROM THE PAYLOAD to the end. --resume-from <baseline.json> continues the baseline's
//           payloads under this root's code, so an old save must reach the same outcome. tests/fixtures/graftwork_oldsave_*.json too.
//   ui      the real boot (main.js) on a recording canvas: every screen at 1280x720 and at the 844x390 phone stage (scale 0.54),
//           reduced motion off and on, fixed dt 1/60, fake clock, seeded Math.random: sha1 of the canvas call stream, call count,
//           the layout registry at the last frame. One fresh process per scene; each scene runs twice in it (cold, warm).
//   assets  the same with the real manifests of <root>/graftwork/assets and fake images that carry the real files' sizes
//           (a missing file fails like a 404): Ward kit rooms, battle sprites, the title scene in kit mode.
//   browser (--browser) Playwright Chromium screenshots with reduced motion and a frozen clock, PNG files outside the repo.
//
// --quick is a strict subset of the full record (2 seeds, 2 variants, cold pass only): compare a quick record with a full
// baseline with `compare --common`.
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
const VALUE_FLAGS = new Set(['root', 'only', 'resume-from', 'shots', 'label', 'jobs', 'key', 'out']);
const positional = (() => { const out = []; for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) { if (VALUE_FLAGS.has(argv[i].slice(2))) i++; continue; } out.push(argv[i]); } return out; })();
const ROOT = path.resolve(opt('root', REPO));
const QUICK = flag('quick');
const TOOL_VERSION = 1;
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
  const files = { RUN: 'graftwork/engine/run.js', C: 'graftwork/engine/combat.js', WD: 'graftwork/engine/ward.js', K: 'graftwork/engine/cards.js', D: 'graftwork/data/index.js', RNG: 'graftwork/engine/rng.js', TEXT: 'graftwork/engine/text.js', META: 'graftwork/engine/meta.js', UNL: 'graftwork/data/unlocks.js', WDATA: 'graftwork/data/ward.js', KIT: 'graftwork/data/ward_kit.js', KITBIG: 'graftwork/data/ward_kit_big.js', SIM: 'tools/graftwork_sim.mjs', STRONG: 'tools/graftwork_strong.mjs' };
  const E = {};
  for (const [k, f] of Object.entries(files)) E[k] = await imp(f);
  E.pol = E.SIM.POLICIES.strong; // tools/graftwork_strong.mjs registers it on import
  E.wardPol = { ...E.pol, pickGraft: (run, pol) => wardPickGraft(E, run, pol) };
  return E;
}

// ---------------------------------------------------------------- engine: the run driver (one call = one screen's worth of decisions)
// Fights, graft picks, shop, forge and events use the root's own bots (tools/graftwork_sim.mjs, tools/graftwork_strong.mjs). The map
// choice and the Ward builder / walker are not exported there, so their logic is replicated here (from tools/graftwork_sim.mjs chooseNode
// and tools/graftwork_ward_sim.mjs strongMorning / strongWalk); the walker's tie-break dice come from the run state, never from a
// bot-side rng, so a run resumed from a save makes the same choices.
const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const manh = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const roomCount = (run, type) => Object.values(run.ward.rooms).filter((r) => r.type === type).length;

function nodeChoice(E, run) {
  const hpF = run.hp / run.maxHp;
  const scored = E.RUN.availableNodes(run).map((id) => run.map.nodes[id]).map((n) => {
    let s = run.rng.next() * 0.5;
    if (n.type === 'forge') s += hpF < 0.65 ? 10 : hpF < 0.85 ? 3 : 0.5;
    if (n.type === 'shop') s += run.gold >= 150 ? 6 : run.gold >= 80 ? 2 : 0;
    if (n.type === 'event') s += hpF < 0.4 ? -1 : 2;
    if (n.type === 'elite') s += hpF > 0.8 ? 3.5 : hpF > 0.6 ? 1 : -6;
    if (n.type === 'fight') s += hpF < 0.35 ? -2 : 1.5;
    return { n, s };
  });
  return scored.sort((a, b) => b.s - a.s)[0].n;
}

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
  const { RUN, WD, SIM } = E, ward = run.mode === 'ward', pol = ward ? E.wardPol : E.pol;
  let ev;
  switch (run.phase) {
    case 'map': { const n = nodeChoice(E, run); RUN.enterNode(run, n.id); ev = ['node', n.id, n.type]; break; }
    case 'ward': {
      const w = run.ward, day = w.day, ph = w.phase;
      if (ph === 'morning') ev = ['morning', day, wardMorning(E, run).join(' ') || '-'];
      else ev = ['walk', day, ph, wardWalk(E, run)];
      break;
    }
    case 'combat': {
      const p = run.pending, kind = p.fightKind, foes = p.enemies.join('+');
      if (o.deep) run.hp = run.maxHp;
      const where = ward ? `d${run.ward.day}${run.ward.phase[0]}` : `f${run.stats.floors}`, act = run.act;
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
        let id;
        if (ward) { const classic = rw.relicChoices.filter((r) => !E.D.RELICS[r].ward); id = classic.length ? pol.pickRelic(classic) : rw.relicChoices[0]; } else id = pol.pickRelic(rw.relicChoices);
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
      if (ward && shop.builds) { const want = shop.builds.map((b, i) => ({ b, i, v: buildValue(E, run, b.id) })).filter((x) => x.v >= 5 && run.gold >= x.b.price + 60).sort((a, b) => b.v - a.v)[0]; if (want) RUN.shopBuy(run, 'build', want.i); }
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
    if (run.phase === 'won' && o.loop && !looped && run.mode !== 'ward') { looped = true; E.RUN.startLoop(run); run.phase = 'map'; T.push(`loop ${run.loop} | ${run.hp}/${run.maxHp} ${run.gold}g rng${run.rng.state}`); continue; } // Endless: what the end screen does
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
function startRun(E, v, hero, mode, seed) {
  const run = E.RUN.newRun({ hero, seed, mode: mode === 'ward' ? 'ward' : undefined, ascension: v.asc || 0, assist: v.assist, unlocked: v.unlocked || 'all', daily: v.daily });
  if (v.deep) { run.maxHp += 200; run.hp = run.maxHp; } // the tool's own cheat: these seeds reach the late acts (and the final boss) whatever the bot does
  return run;
}
const RUN_VARIANTS = [
  { tag: 'a0' }, { tag: 'deep', deep: true, loop: true }, // the two --quick seeds
  { tag: 'a0b' }, { tag: 'a4', asc: 4 }, { tag: 'a10deep', asc: 10, deep: true }, { tag: 'a7', asc: 7 },
  { tag: 'assist', assist: { on: true, sturdy: true, gentle: true, kind: true, mercy: true } }, { tag: 'start', unlocked: 'start' },
];
function guarded(fn) { try { return fn(); } catch (e) { return { error: String(e && e.message || e).slice(0, 300) }; } }

async function sectionEngine() {
  installDeterminism(); memoryStorage();
  const E = await loadEngine(), { RUN, D, META } = E;
  const out = { runs: {}, daily: {}, probes: {} };
  const variants = QUICK ? RUN_VARIANTS.slice(0, 2) : RUN_VARIANTS;
  // what main.js does around a run (onRunStart, recordRunEnd): the meta progression (Credit, unlock points, achievements, history) is part
  // of the golden. One profile plays the two --quick seeds of every hero and mode in a row; every other seed has a fresh profile.
  const career = META.defaultMeta();
  for (const hero of HEROES) for (const mode of ['classic', 'ward']) for (const v of variants) {
    const key = `${hero}.${mode}.${v.tag}`, T = [], meta = RUN_VARIANTS.indexOf(v) < 2 ? career : META.defaultMeta();
    out.runs[key] = guarded(() => {
      const run = startRun(E, v, hero, mode, `golden-${key}`);
      if (META.onRunStart) META.onRunStart(meta, run);
      const s = finishRun(E, run, T, v);
      if (ended(run)) { run.ended = true; s.endInfo = hc(META.recordRunEnd(meta, run, run.phase === 'won' ? 'won' : 'dead')); s.metaAfter = hc(meta); }
      return { ...s, trace: T };
    });
    if (out.runs[key].error) out.runs[key].trace = T;
  }
  if (!QUICK) { // one short classic run per Daily modifier (the hero rotates)
    RUN.DAILY_MODS.forEach((m, i) => {
      let seed = null; for (let k = 0; k < 4000 && !seed; k++) { const s = `daily-2026-01-${String(1 + (k % 28)).padStart(2, '0')}-${k}`; if (E.RNG.hashSeed(s) % RUN.DAILY_MODS.length === i) seed = s; }
      const T = [];
      out.daily[m.id] = guarded(() => finishRun(E, startRun(E, { daily: seed }, HEROES[i % 3], 'classic', seed), T, {}));
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
function probeRun(E, hero, seed, o = {}) {
  const run = E.RUN.newRun({ hero, seed, mode: o.ward ? 'ward' : undefined });
  run.maxHp = run.hp = 400; if (o.act) run.act = o.act;
  return run;
}
const DUMMIES = ['orderly', 'gauze_mummy'];
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
      const run = probeRun(E, HEROES.includes(r.hero) ? r.hero : HEROES[i % 3], 'probe-relic-' + r.id, { ward: !!r.ward });
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
      const run = probeRun(E, HEROES[i % 3], 'probe-event-' + ev.id, { ward: !!ev.ward, act: ev.act || 1 });
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
  // a fresh run for every hero, mode and ascension: the map or the Ward floor, the deck, the first offers
  P.newRun = {};
  for (const hero of HEROES) for (const mode of ['classic', 'ward']) for (let asc = 0; asc <= 10; asc += (mode === 'ward' ? 5 : 1)) P.newRun[`${hero}.${mode}.a${asc}`] = g(() => {
    const run = RUN.newRun({ hero, seed: `probe-new-${hero}-${asc}`, ascension: asc, mode: mode === 'ward' ? 'ward' : undefined });
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
    const run = RUN.newRun({ hero: 'marrow', seed: 'probe-build', mode: 'ward' }), w = run.ward;
    w.res.wood = 40; w.res.stone = 40; run.gold = 500;
    for (const r of Object.values(w.rooms)) if (WD.everyOf(r)) { r.timers.spawn = 1; WD.tickRoom(run, r); }
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
  { tag: 'walk', ward: true, min: 6, when: (run) => run.phase !== 'ward' && !!run.ward.walk && run.ward.walk.i < run.ward.walk.path.length },
  { tag: 'k5', steps: 5 }, { tag: 'k41', steps: 41 }, { tag: 'k90', steps: 90 },
  { tag: 'graft', min: 4, afterLine: (l) => l.startsWith('graft ') },
  { tag: 'reward', min: 10, when: (run) => run.phase === 'reward' },
  { tag: 'event', min: 6, when: (run) => run.phase === 'event' },
  { tag: 'shop', min: 6, when: (run) => run.phase === 'shop' },
  { tag: 'night', ward: true, min: 6, when: (run) => run.phase === 'ward' && run.ward.phase === 'night' },
  { tag: 'day3', ward: true, min: 6, when: (run) => run.phase === 'ward' && run.ward.phase === 'morning' && run.ward.day >= 3 },
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
function makeSave(E, hero, mode, cs) {
  const run = startRun(E, RESUME_OPTS, hero, mode, `golden-resume-${hero}-${mode}`), T = [];
  let prev = E.RUN.serializeRun(run), at = 'start', n = 0;
  const hit = () => (cs.steps !== undefined ? n >= cs.steps : n >= (cs.min || 0) && ((cs.when && cs.when(run)) || (cs.afterLine && T.length && cs.afterLine(T[T.length - 1]))));
  while (!ended(run) && n < 3000 && !hit()) { prev = E.RUN.serializeRun(run); stepRun(E, run, T, RESUME_OPTS); n++; }
  if (ended(run)) return { payload: prev, at: `before the last step (${n - 1} steps, the run ended before the save point)` }; // a finished run has no save
  at = `${n} steps, ${run.phase}${run.ward ? ' day ' + run.ward.day + ' ' + run.ward.phase : ' act ' + run.act}`;
  if (cs.midCombat && run.phase === 'combat') at += ', ' + partialCombat(E, run, cs.midCombat);
  return { payload: E.RUN.serializeRun(run), at };
}
function continueSave(E, payload, o) { const run = E.RUN.deserializeRun(payload), T = []; return finishRun(E, run, T, o); }
async function sectionResume() {
  installDeterminism(); memoryStorage();
  const E = await loadEngine(), out = { cases: {}, fixture: {} }, payloads = {};
  const base = opt('resume-from', null) ? JSON.parse(fs.readFileSync(path.resolve(opt('resume-from')), 'utf8')) : null;
  const cases = QUICK ? RESUME_CASES.slice(0, 3) : RESUME_CASES;
  for (const hero of HEROES) for (const mode of ['classic', 'ward']) for (const cs of cases) {
    if (cs.ward && mode !== 'ward') continue;
    const key = `${hero}.${mode}.${cs.tag}`;
    out.cases[key] = guarded(() => {
      const fresh = makeSave(E, hero, mode, cs);
      const from = base && base.payloads && base.payloads[key] !== undefined ? base.payloads[key] : fresh.payload;
      payloads[key] = from;
      // savedBy: what THIS root's code writes at the save point. end: where the stored payload (the baseline's with --resume-from) ends up under this root's code.
      return { at: fresh.at, savedBy: sha1(fresh.payload), savedByCanon: hc(JSON.parse(fresh.payload)), bytes: fresh.payload.length, end: continueSave(E, from, RESUME_OPTS) };
    });
  }
  // saves written by an older commit (the regression fixture): load and play each to the end
  const dir = [path.join(ROOT, 'tests/fixtures'), path.join(REPO, 'tests/fixtures')].find((d) => fs.existsSync(d));
  for (const f of dir ? fs.readdirSync(dir).filter((n) => /^graftwork_oldsave_.*\.json$/.test(n)).sort() : []) {
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), tag = f.replace(/^graftwork_oldsave_|\.json$/g, '');
    for (const hero of Object.keys(fx)) fx[hero].forEach((s, i) => { out.fixture[`${tag}.${hero}.${i}.${s.phase}`] = guarded(() => ({ payload: sha1(s.json), end: continueSave(E, s.json, {}) })); });
  }
  return { resume: out, payloads, resumeFrom: base ? path.resolve(opt('resume-from')) : null };
}

//@@UI@@
// TEMP stubs (replaced by the real UI part)
const VARIANTS = []; const sceneKeys = () => []; const sceneNames = () => []; async function sceneChild() { return {}; } async function verifyScenes() {} async function recordBrowser() { return {}; } function cmdCompareShots() {} function cmdDump() {}
//@@/UI@@

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
  const pass = ['--root', ROOT, ...(QUICK ? ['--quick'] : []), ...(opt('resume-from', null) ? ['--resume-from', path.resolve(opt('resume-from'))] : [])];
  const t0 = REAL_NOW(), out = { meta: { tool: TOOL_VERSION, root: ROOT, head: gitHead(ROOT), quick: QUICK, sections: only.slice(), node: process.version, recorded: new Date().toISOString(), seconds: {} } };
  const failures = [], tasks = [];
  if (only.includes('engine')) tasks.push({ name: 'engine', args: ['engine', ...pass] });
  if (only.includes('resume')) tasks.push({ name: 'resume', args: ['resume', ...pass] });
  for (const sec of ['ui', 'assets']) if (only.includes(sec)) for (const key of sceneKeys(sec)) tasks.push({ name: sec + '/' + key, sec, key, args: ['scene', '--key', sec + '/' + key, ...pass] });
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
  for (const sec of ['ui', 'assets']) if (out[sec]) out[sec] = Object.fromEntries(Object.keys(out[sec]).sort().map((k) => [k, out[sec][k]]));
  if (flag('verify')) await verifyScenes(out, tasks.filter((t) => t.sec), jobs, failures);
  if (flag('browser')) { const tb = REAL_NOW(); out.browser = await recordBrowser(); secMs.browser = REAL_NOW() - tb; }
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
