// Meta layer 2: the case file (run-end milestones), Credit, cosmetics, starting relics, boss practice, save migration.
// Pure functions over the meta object. Re-exported by engine/meta.js. Must NOT import meta.js (it imports us).
// Save compatibility: graftwork_meta_v1 keeps m.v = 1. New fields are additive and carry m.rev = 2; migrate2() fills and
// sanitises them, and grants a one-time welcome Credit to old saves (migrate2 is idempotent).
import { ENEMIES, RELICS, CARDS, GRAFTS } from '../data/index.js';
import * as RUN from './run.js';

const REV = 2;
export const CREDIT_RUN_CAP = 60;   // gate knob: max Credit one run can pay
export const FIRST_BONUS = 2;       // curve knob: lifetime-first milestone pays x2
export const WIN_CREDIT = 10;       // flat Credit for a win
export const ASC_CREDIT = 2;        // extra Credit per ascension level on a win
const WELCOME_CAP = 80;      // retro grant for old saves
const PRACTICE_MAX = 8;

// ---- catalog (data-driven; ids are append-only because they are saved) ----
// cost null = earned by achievement only
export const CARD_BACKS = [
  { id: 'plain', name: 'Plain Linen', cost: 0 }, { id: 'ledger', name: 'Ledger Green', cost: 25 }, { id: 'bone', name: 'Bone White', cost: 40 },
  { id: 'verdigris', name: 'Verdigris', cost: 60 }, { id: 'oxblood', name: 'Oxblood', cost: 90 }, { id: 'gilt', name: 'Gilt Edge', cost: 120 },
  { id: 'tapestry', name: 'Tapestry', cost: null }, { id: 'ward_lamp', name: 'Ward Lamp', cost: null },
];
export const START_RELICS = [
  { id: 'r_bandage_roll', cost: 40 }, { id: 'r_scar_tissue', cost: 50 }, { id: 'r_free_sample', cost: 50 },
  { id: 'r_cold_storage', cost: 60 }, { id: 'r_suture_thread', cost: 70 }, { id: 'r_sterile_field', cost: 80 },
];
export const TITLES = [{ id: 'patient', name: 'Patient', cost: 20 }, { id: 'outpatient', name: 'Outpatient', cost: 35 }, { id: 'night_shift', name: 'Night Shift', cost: 60 }]; // achievements add more via reward { kind: 'title', id, name }
export const TINTS = [{ id: 'none', name: 'Standard issue', color: null }, { id: 'ash', name: 'Ash', color: '#8d8a84' }, { id: 'rose', name: 'Rose', color: '#c97b84' }, { id: 'moss', name: 'Moss', color: '#7f9a6a' }, { id: 'brass', name: 'Brass', color: '#c9a227' },
  { id: 'ink', name: 'Ink', color: '#5a6fa8', cost: 45 }, { id: 'cinder', name: 'Cinder', color: '#d2623a', cost: 75 }]; // none + 5 tints; ash/rose/moss/brass are earned, ink/cinder bought

// ---- case file milestones ----
// check(run, x) where x = { overloaded, tempered, ... } from caseStats(). tiers pay once each per run.
const MILESTONES = [
  { id: 'overload', name: 'First Overload', text: 'A card carried a 3rd graft.', credit: 4, check: (s) => s.overloaded > 0 || s.shatters > 0 },
  { id: 'shatter', name: 'First Shatter', text: 'An Overloaded card broke on play.', credit: 4, check: (s) => s.shatters >= 1 },
  { id: 'line', name: 'Longest Line', text: 'A Line of 4 knots or more.', credit: 5, value: (s) => s.maxLine, check: (s) => s.maxLine >= 4 },
  { id: 'line5', name: 'Full Spool', text: 'A Line of 5 knots.', credit: 5, value: (s) => s.maxLine, check: (s) => s.maxLine >= 5 },
  { id: 'hit', name: 'Biggest Hit', text: 'A single hit of 30 or more.', credit: 4, value: (s) => s.maxHit, check: (s) => s.maxHit >= 30 },
  { id: 'hit60', name: 'Biggest Hit, Framed', text: 'A single hit of 60 or more.', credit: 6, value: (s) => s.maxHit, check: (s) => s.maxHit >= 60 },
  { id: 'temper', name: 'Tempered', text: 'A card was Tempered.', credit: 4, check: (s) => s.tempered >= 1 },
  { id: 'temper3', name: 'Hammer Hand', text: '3 cards Tempered.', credit: 6, value: (s) => s.tempered, check: (s) => s.tempered >= 3 },
  { id: 'boss1', name: 'Boss Down', text: 'Defeated a boss.', credit: 8, value: (s) => s.bosses, check: (s) => s.bosses >= 1 },
  { id: 'boss2', name: 'Second Opinion Overruled', text: 'Defeated 2 bosses.', credit: 8, check: (s) => s.bosses >= 2 },
  { id: 'boss3', name: 'The Full Set', text: 'Defeated 3 bosses.', credit: 10, check: (s) => s.bosses >= 3 },
];

function caseStats(run) {
  const st = (run && run.stats) || {};
  let overloaded = 0, tempered = 0;
  for (const i of (run && run.deck) || []) { if ((i.grafts || []).length > 2) overloaded++; if ((i.fused || []).length) tempered++; }
  return { overloaded, tempered, shatters: st.shatters || 0, maxLine: st.maxLine || 0, maxHit: st.maxHit || 0, bosses: st.bosses || 0 };
}

// Pure: what the case file would pay. firsts = meta.firsts (lifetime milestones already paid once). Returns { items, total, capped }.
export function caseFile(run, won, firsts = {}) {
  if (!run || run.practice) return { items: [], total: 0, capped: false };
  const s = caseStats(run), items = [];
  for (const m of MILESTONES) {
    let ok = false; try { ok = !!m.check(s); } catch { ok = false; }
    if (!ok) continue;
    const first = !run.assist && !firsts[m.id]; // Assist runs never get the first-time doubling
    items.push({ id: m.id, name: m.name, text: m.text, value: m.value ? m.value(s) : null, first, credit: m.credit * (first ? FIRST_BONUS : 1) });
  }
  if (won) items.push({ id: 'win', name: 'Discharged', text: 'The file closes in your favour.', value: null, first: false, credit: WIN_CREDIT + ASC_CREDIT * (run.ascension || 0) });
  const raw = items.reduce((a, b) => a + b.credit, 0);
  return { items, total: Math.min(CREDIT_RUN_CAP, raw), capped: raw > CREDIT_RUN_CAP };
}
// Applies the case file to meta (once per run: caller guards with run.metaDone). Returns the file.
export function awardCaseFile(m, run, won) {
  const f = caseFile(run, won, m.firsts);
  if (!run.assist) for (const it of f.items) m.firsts[it.id] = 1; // ...and do not use up a lifetime first
  m.credit.bal += f.total; m.credit.total += f.total;
  return f;
}

// ---- cosmetics / shop ----
const has = (m, kind, id) => m.cosmetics[kind].includes(id);
const KINDS = { back: ['backs', CARD_BACKS], relic: ['relics', START_RELICS], title: ['titles', TITLES], tint: ['tints', TINTS] };
export function grantReward(m, reward) {
  if (!reward || !KINDS[reward.kind]) return false;
  const list = m.cosmetics[KINDS[reward.kind][0]];
  if (list.includes(reward.id)) return false;
  list.push(reward.id); if (reward.kind === 'title' && !m.titleNames[reward.id]) m.titleNames[reward.id] = reward.name || reward.id;
  return true;
}
export function buy(m, kind, id) {
  const k = KINDS[kind]; if (!k) return { ok: false, why: 'unknown' };
  const item = k[1].find((x) => x.id === id);
  if (!item || item.cost === null || item.cost === undefined) return { ok: false, why: 'not for sale' };
  if (has(m, k[0], id)) return { ok: false, why: 'owned' };
  if (m.credit.bal < item.cost) return { ok: false, why: 'short' };
  m.credit.bal -= item.cost; m.cosmetics[k[0]].push(id);
  return { ok: true, cost: item.cost };
}
export function equip(m, kind, id) {
  const k = KINDS[kind]; if (!k) return false;
  if (id !== null && !has(m, k[0], id) && !(kind === 'tint' && id === 'none')) return false;
  m.loadout[kind === 'relic' ? 'relic' : kind] = id; return true;
}
export function titleName(m) { const t = m && m.loadout && m.loadout.title; if (!t || !has(m, 'titles', t)) return null; const d = TITLES.find((x) => x.id === t); return (m.titleNames && m.titleNames[t]) || (d && d.name) || t; }
export function tintColor(m) { const t = m && m.loadout && m.loadout.tint; const d = TINTS.find((x) => x.id === t); return d && d.color && has(m, 'tints', t) ? d.color : null; }
export function startRelicOf(m) { const r = m && m.loadout && m.loadout.relic; return r && RELICS[r] && has(m, 'relics', r) ? r : null; }

// ---- boss practice ----
export function recordBosses(m, run) {
  if (!run || run.practice) return;
  for (const b of run.bossLog || []) {
    const boss = (b.enemies || []).find((id) => ENEMIES[id] && ENEMIES[id].kind === 'boss') || (b.kind === 'final' ? (b.enemies || [])[0] : null);
    if (!boss || !ENEMIES[boss]) continue;
    m.practice[boss] = { boss, kind: b.kind, enemies: b.enemies.slice(), act: b.act, hero: run.hero, asc: run.ascension || 0, deck: b.deck, relics: b.relics, maxHp: b.maxHp, win: !!b.win, ts: Date.now() };
  }
  const ids = Object.keys(m.practice);
  if (ids.length > PRACTICE_MAX) for (const id of ids.sort((a, b) => m.practice[a].ts - m.practice[b].ts).slice(0, ids.length - PRACTICE_MAX)) delete m.practice[id];
}
// Practice is unlocked once the boss has been met (codex 'enemies' seen) and a deck was saved.
export function practiceList(m) {
  return Object.values(m.practice).filter((p) => p && ENEMIES[p.boss] && m.seen && m.seen.enemies && m.seen.enemies[p.boss])
    .sort((a, b) => (ENEMIES[a.boss].act - ENEMIES[b.boss].act)).map((p) => ({ ...p, name: ENEMIES[p.boss].name }));
}
export function newPracticeRun(snap, m) {
  const run = RUN.newRun({ hero: snap.hero, seed: 'practice-' + snap.boss, ascension: snap.asc || 0, unlocked: m, bare: true }); // one fight, no floor; practice uses the player's unlocked set
  const live = (l) => (l || []).filter((g) => GRAFTS[g]); // a saved deck may name cards or grafts that no longer exist: they are left out
  run.deck = snap.deck.filter((d) => d && CARDS[d.id]).map((d) => ({ uid: RUN.nextUid(run), id: d.id, grafts: live(d.grafts), fused: live(d.fused), up: d.up || 0 }));
  run.relics = (snap.relics || []).filter((r) => RELICS[r]);
  run.maxHp = Math.max(1, snap.maxHp | 0); run.hp = run.maxHp; run.act = snap.act || 1;
  run.practice = snap.boss; run.metaDone = true; run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: snap.kind === 'final' ? 'final' : 'boss', enemies: snap.enemies.slice() };
  return run;
}

// ---- migration (called from meta.js migrate; idempotent) ----
export function defaults2() {
  return { rev: REV, credit: { bal: 0, total: 0 }, cosmetics: { backs: ['plain'], relics: [], titles: [], tints: ['none'] }, titleNames: {}, loadout: { back: 'plain', relic: null, title: null, tint: 'none' }, firsts: {}, practice: {} };
}
const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
export function migrate2(m, hadRev) {
  const cr = m.credit, nz = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  cr.bal = nz(cr.bal); cr.total = Math.max(nz(cr.total), cr.bal);
  const c = m.cosmetics;
  for (const k of ['backs', 'relics', 'titles', 'tints']) c[k] = [...new Set(strs(c[k]))];
  if (!c.backs.includes('plain')) c.backs.unshift('plain');
  if (!c.tints.includes('none')) c.tints.unshift('none');
  c.relics = c.relics.filter((r) => START_RELICS.some((s) => s.id === r));
  const l = m.loadout;
  if (!c.backs.includes(l.back)) l.back = 'plain';
  if (l.relic !== null && !c.relics.includes(l.relic)) l.relic = null;
  if (l.title !== null && !c.titles.includes(l.title)) l.title = null;
  if (!c.tints.includes(l.tint)) l.tint = 'none';
  for (const id of Object.keys(m.practice)) { const p = m.practice[id]; if (!p || !Array.isArray(p.deck) || !Array.isArray(p.enemies) || !ENEMIES[id]) delete m.practice[id]; }
  if (!hadRev && m.stats && (m.stats.wins + m.stats.deaths) > 0) { // old save: one-time welcome Credit
    const g = Math.min(WELCOME_CAP, m.stats.wins * 8 + m.stats.deaths * 2); cr.bal += g; cr.total += g;
  }
  m.rev = REV;
  return m;
}

// ---- defeat advice: one concrete line from how the run died (run.deathCause, set by finishCombat). 12 cause categories. ----
export const DEATH_ADVICE = {
  poison: 'Cleanse or Block early; Poison ignores Block and grows each turn. Kill the source fast.',
  burn: 'Burn ticks every turn and ignores Block. Cleanse it, or end the fight before it stacks.',
  bleed: 'Bleed ticks every turn and ignores Block. Cleanse it, and avoid taking hits while it runs.',
  brittle: 'Brittle turns broken Block into damage. Keep Block small and steady instead of one big wall.',
  stagefright: 'Stage Fright punishes the cards you play. Play fewer, bigger cards, or Cleanse it.',
  dread: 'Dread bites when you end a turn with no Block. Always leave a little Block up.',
  strain: 'Too many grafts: Temper a card at the Forge, strip a graft, or skip a graft for +1 Budget.',
  backfire: 'Backfire jammed your opening hand. Cut your Weight under Budget or Temper a card to stop it.',
  boss: 'A boss has one trick. Read its move tips and plan your turns around the counter.',
  elite: 'Elites hit hard. Read the intent each turn, Block the sword, and skip them when low on HP.',
  enemy: 'Read the intent icon every turn and Block when the sword is coming.',
  generic: 'Heal at the Forge before a hard fight, and keep your Strain at 0.',
};
export function deathAdviceCategory(run) {
  const cs = (run && run.deathCause) || null;
  if (!cs) return 'generic';
  if (cs.status && DEATH_ADVICE[cs.status]) return cs.status;
  if ((cs.strain || 0) >= 2) return 'strain';
  if ((cs.backfire || 0) > 0) return 'backfire';
  const en = cs.enemy && ENEMIES[cs.enemy];
  if (en) return en.kind === 'boss' ? 'boss' : en.kind === 'elite' ? 'elite' : 'enemy';
  if ((cs.strain || 0) >= 1) return 'strain';
  return 'generic';
}
// Returns { cat, text }. A boss, elite or enemy death quotes the counter from the move tip that killed you when it has one.
export function deathAdvice(run) {
  const cat = deathAdviceCategory(run), cs = (run && run.deathCause) || null;
  let text = DEATH_ADVICE[cat];
  const en = cs && cs.enemy && ENEMIES[cs.enemy], mv = en && en.moves && cs.move && en.moves[cs.move];
  if ((cat === 'boss' || cat === 'elite' || cat === 'enemy') && mv && mv.tip) text = `${mv.name || 'This move'}: ${mv.tip}`;
  return { cat, text };
}
