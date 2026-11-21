// Million To One: the page. Input, game loop, menus, tutorial, HUD juice, settings.
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, SAVE_KEY, VIEW_W, zoneIndex, ZSTART } from './core.js';
import * as C from './core.js';
import * as K from './content.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';

// content: the old names are always there, the newer ones are guarded so a missing export never breaks the page
const { ZONES, RACE_LEN, MUTATIONS, HABITS, HABIT_ORDER, habitCost, COMBO_WORDS, DEATH_LINES, INTRO, PX_PER_CM, RIVALS, TOTAL_SWIMMERS } = K;
const basePick = K.pickLine || ((a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : ''));
// a no-repeat shuffle bag per pool: every line plays once before any repeats, and a fresh bag never opens with the last line
const BAGS = new WeakMap();
const pickLine = (a) => {
  if (!Array.isArray(a) || a.length < 2) return basePick(a);
  let b = BAGS.get(a); if (!b) { b = { q: [], last: null }; BAGS.set(a, b); }
  if (!b.q.length) {
    const q = a.slice();
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = q[i]; q[i] = q[j]; q[j] = t; }
    // q is popped from the end: never open the new bag with the line that just played
    if (q[q.length - 1] === b.last) { const t = q[0]; q[0] = q[q.length - 1]; q[q.length - 1] = t; }
    b.q = q;
  }
  const v = b.q.pop(); b.last = v; return v;
};
// a line from an optional pool (array or string), else the fallback
const lineOr = (a, fb) => (Array.isArray(a) && a.length ? pickLine(a) || fb : typeof a === 'string' && a ? a : fb);
const fillLine = K.fillLine || ((s, v = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)));
const tierLine = K.tierLine || ((t, r) => { for (const [m, x] of t) if (r <= m) return x; return t.length ? t[t.length - 1][1] : ''; });
const rankLine = K.rankLine || (() => '');
const ZONE_LINES = K.ZONE_LINES || {}, RIVAL_TAUNTS = K.RIVAL_TAUNTS || {}, TIPS = K.TIPS || [], LOSE_TITLES = K.LOSE_TITLES || ['OOF'];
const WIN_LINES = K.WIN_LINES || ['You beat 999,999 swimmers. Nature is amazed.'];
const TUT_TEXT = K.TUT_TEXT || {}, COACH_SHORT = K.COACH_SHORT || {}, POP_LINES = K.POP_LINES || {}, BANK_GRADES = K.BANK_GRADES || [];
const BREAK_LINES = K.BREAK_LINES || [], RESULT_TITLES = K.RESULT_TITLES || {}, DEATH_BY_ZONE = K.DEATH_BY_ZONE || {}, NEAR_MISS_LINES = K.NEAR_MISS_LINES || [];
const TIP_BY_REASON = K.TIP_BY_REASON || {}, KEVIN_NEXT = K.KEVIN_NEXT || {}, SHARE_LINES = K.SHARE_LINES || [], RIVAL_LINES = K.RIVAL_LINES || {};
const EGG_LINES = K.EGG_LINES || {}, SYNERGY_HINTS = K.SYNERGY_HINTS || {}, AWAY_LINES = K.AWAY_LINES || {}, DAILY_LINES = K.DAILY_LINES || {};
const HABIT_QUIPS = K.HABIT_QUIPS || {}, FACTORY_NAMES = K.FACTORY_NAMES || [], CODEX_LINES = K.CODEX_LINES || {}, RECORD_LINES = K.RECORD_LINES || [];
const SYNERGIES = C.SYNERGIES || [];
const RIVAL_REACTS = K.RIVAL_REACTS || {}, RIVAL_GRUDGE = K.RIVAL_GRUDGE || {}, RIVAL_SETTLED = K.RIVAL_SETTLED || {}, REMATCH_LINES = K.REMATCH_LINES || {};
const HAZARD_INTRO = K.HAZARD_INTRO || {}, FIRST_DEATH = K.FIRST_DEATH || {}, LOW_ENERGY = K.LOW_ENERGY || ['Running on empty! Eat fruit!'];
const STYLE_WORDS = K.STYLE_WORDS || [], CLUTCH_LINES = K.CLUTCH_LINES || ['CLUTCH!'], FINISHER_LINES = K.FINISHER_LINES || ['CASHED IN!'], ECHO_LINES = K.ECHO_LINES || ['ECHO!'];
const LOSS_RANK_LINES = K.LOSS_RANK_LINES || ['First to the door. Second through it.'], NEXT_GOAL_LINES = K.NEXT_GOAL_LINES || {}, DAD_PICK_LINES = K.DAD_PICK_LINES || {};
const SYNERGY_SO_CLOSE = K.SYNERGY_SO_CLOSE || [], BABY_FIRST_WORDS = K.BABY_FIRST_WORDS || [], GEN_UNLOCK_LINES = K.GEN_UNLOCK_LINES || [], GEN_INTROS = K.GEN_INTROS || [];
const RUN_MILESTONES = K.RUN_MILESTONES || [], WELCOME_TITLES = K.WELCOME_TITLES || ['Welcome back, Kevin!'], STREAK_NUDGE = K.STREAK_NUDGE || [];
const ZONE_LINES_SHORT = K.ZONE_LINES_SHORT || null, UI_LINES = K.UI_LINES || {}, COMBO_WORDS_HIGH = K.COMBO_WORDS_HIGH || [];
const TUT_TEXT_GENTLE = K.TUT_TEXT_GENTLE || '', TUT_PRAISE = K.TUT_PRAISE || {}, FIRST_SWIM_LAUNCH = K.FIRST_SWIM_LAUNCH || COACH_SHORT.launch || '';
const CASH_HINT = K.CASH_HINT || 'Swipe DOWN to cash it in!', BREAK_POT_LINES = K.BREAK_POT_LINES || BREAK_LINES, MILESTONE_LINES = K.MILESTONE_LINES || {};
const EVENT_SHORT = K.EVENT_SHORT || {}, SYNERGY_SHORT = K.SYNERGY_SHORT || {}, COACH_SHORT_MORE = K.COACH_SHORT_MORE || {}, NEAR_MISS_BY_GAP = K.NEAR_MISS_BY_GAP || null;
const REMATCH_NEAR_CM = K.REMATCH_NEAR_CM || [], REMATCH_PROMISE = K.REMATCH_PROMISE || {}, WIN_MARGIN_LINES = K.WIN_MARGIN_LINES || {};
const FIRST_GO_LINE = K.FIRST_GO_LINE || 'GO!', FIRST_DEATH_TAIL = K.FIRST_DEATH_TAIL || '', TUT_DNA_EXPLAIN = K.TUT_DNA_EXPLAIN || 'DNA buys Dad better habits. Better Dad, faster Kevin!';
const GEN_INTROS_ENDLESS = K.GEN_INTROS_ENDLESS || [], FINALE_LINES = K.FINALE_LINES || [], DYNASTY_STAMP = K.DYNASTY_STAMP || '', MUT_FLAVOR = K.MUT_FLAVOR || {};
const reactsOf = (name) => RIVAL_REACTS[name] || RIVAL_REACTS[first(name)] || Object.keys(RIVAL_REACTS).reduce((o, k) => o || (first(k) === first(name) ? RIVAL_REACTS[k] : null), null) || {};
const byFirst = (tbl, name) => (tbl[name] != null ? tbl[name] : Object.keys(tbl).reduce((o, k) => (o != null ? o : first(k) === first(name) ? tbl[k] : null), null));
const POP = (key, fb) => pickLine(POP_LINES[key]) || fb;
// a UI shout (K.UI_LINES[key]), with the old fixed text as the fallback
const UIL = (key, fb) => pickLine(UI_LINES[key]) || fb;
// a flat system string (K.UI_COPY[key]) with today's text as the fallback
const UIC = (key, fb) => { const v = (K.UI_COPY || {})[key]; return typeof v === 'string' && v ? v : fb; };
// the fork's shout: both pools as one bag (built once, so the no-repeat bag holds)
const FORK_RIGHT = [...(POP_LINES.forkRight || []), ...(UI_LINES.forkRight || [])], FORK_WRONG = [...(POP_LINES.forkWrong || []), ...(UI_LINES.forkWrong || [])];
// Chad claims one more 'win' every time he says so: the single 1xxx number in a Chad line counts up for ever (S.chadClaim)
const chadFix = (t) => {
  if (typeof t !== 'string' || !/Chad/.test(t) || !/\b1\d{3}\b/.test(t)) return t;
  return t.replace(/\b1\d{3}\b/, () => { S.chadClaim = (S.chadClaim | 0) + 1; try { saveUI(); } catch (e) { /* later */ } return String(S.chadClaim); });
};

const $ = (id) => document.getElementById(id);
// one cached formatter (toLocaleString builds a new one on every call)
const NUM_FMT = (() => { try { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }); } catch (e) { return null; } })();
const fmt = (n) => { const v = Math.round(n); return NUM_FMT ? NUM_FMT.format(v) : v.toLocaleString('en-US'); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const first = (name) => String(name || '').split(' ')[0];
const andList = (a) => (a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const tauntsOf = (name) => RIVAL_TAUNTS[first(name)] || RIVAL_TAUNTS[name] || {};
const linesOf = (name) => RIVAL_LINES[first(name)] || RIVAL_LINES[name] || {};
const cv = $('cv'), R = new Renderer(cv), A = new Audio();
const SHARE_URL = 'https://games-71g.pages.dev/million_to_one/';

let meta = newMeta();
try { meta = loadMeta(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch (e) { /* private mode */ }
// one tab owns the save (navigator.locks 'mto-active', else a BroadcastChannel hello): a tab that does not own it is
// stale and never writes, so two tabs never overwrite each other's swims. ownKnown: the ownership check has answered
// (a save asked for before that waits for it: saveWanted)
let staleTab = false, ownsTab = false, ownKnown = false, saveWanted = false;
// the factory keeps its own clock: idleTick moves lastSeen, save never touches it
const save = () => {
  if (staleTab) return;
  if (!ownKnown) { saveWanted = true; return; }
  try { idleTick(meta, Date.now()); localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
};

// ------------------------------------------------------------------ settings (own key: loadMeta drops unknown fields)
const UI_KEY = 'million_to_one_ui';
let prefersReduced = false;
try { prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
const S = { music: true, sfx: true, mvol: 1, svol: 1, haptics: true, reduced: false, noFlash: false, redSet: false, tutDone: false, tutTries: 0,
  sens: 1.6, lefty: false, q: 1, qT: 0, qs: 0, gfx: 'auto', frenzySeen: false, bestGap: 0, tutSkipped: [], seenHaz: [], revealSeen: false,
  lowSeen: 0, streakLostDay: -1, welcomeAt: 0, genIntroSeen: 0, cashHint: false, finaleSeen: false, dynastySeen: false,
  cashDone: false, cashN: 0, drillSeen: false, tutReplay: false, zoneFirst: [], zoneLoss: [], clues: [], chadClaim: 1000, lessonTries: {}, bestProg: 0,
  act2Seen: false, dnaExplained: false, lastDeathY: 0, cashBtnN: 0, swipeTip: false, mono: false, firstBuy: false, gdSeen: {}, revealed: null, silentN: 0,
  lungeTaught: false, bestHead: 0, flickTip: false, flickHardSeen: false, popcornTold: false, dashBtnOne: 0, flickSeen: false, act3Seen: false, act4Seen: false, act4From: -1,
  autoDailySeen: false, tutPaid: [], tutPaidMig: false, act2From: -1, act3From: -1, rookieEndSeen: false, hzCareerSeen: 0, mix: 'playback', mixSet: false,
  gentle: false, famName: '', perkNew: '' };
try { const o = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (o && typeof o === 'object') for (const k of Object.keys(S)) if (typeof o[k] === typeof S[k]) S[k] = o[k]; } catch (e) { /* ignore */ }
// an explicit choice wins, otherwise follow the system setting
if (!S.redSet) S.reduced = prefersReduced;
// iPhones: 'ambient' sessions obey the silent switch and lose the band, so 'playback' is the default. A save still on the
// old untouched 'ambient' moves once; a deliberate 'Play over my music' (mixSet) is kept
if (!S.mixSet && S.mix === 'ambient') { S.mix = 'playback'; try { localStorage.setItem(UI_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
// steering got finger acceleration: the old steps map onto the new ones
{ const SENS_MAP = { 1: 1.2, 1.35: 1.6, 1.8: 2.1 }; if (SENS_MAP[S.sens]) S.sens = SENS_MAP[S.sens]; if (![1.2, 1.6, 2.1].includes(S.sens)) S.sens = 1.6; }
if (!Array.isArray(S.tutSkipped)) S.tutSkipped = [];
if (!Array.isArray(S.tutPaid)) S.tutPaid = [];
if (!Array.isArray(S.seenHaz)) S.seenHaz = [];
for (const k of ['zoneFirst', 'zoneLoss', 'clues']) if (!Array.isArray(S[k])) S[k] = [];
if (!['auto', 'full', 'lite'].includes(S.gfx)) S.gfx = 'auto';
if (!(S.chadClaim >= 1000)) S.chadClaim = 1000;
if (!S.lessonTries || typeof S.lessonTries !== 'object' || Array.isArray(S.lessonTries)) S.lessonTries = {};
if (!S.gdSeen || typeof S.gdSeen !== 'object' || Array.isArray(S.gdSeen)) S.gdSeen = {};
if (S.revealed != null && !Array.isArray(S.revealed)) S.revealed = null;
// a save that already bought a habit has had its first purchase
if (!S.firstBuy && HABIT_ORDER.some((id) => lv(meta, id) > 0)) S.firstBuy = true;
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
// the act clocks: the swim count when generation 10 (Act 2) and 20 (Act 3) began; a save already past them starts now.
// (generation numbers as the story counts them: meta.gen + 1, the hero being generation 1)
function actMarks() {
  let ch = false; const gn = (meta.gen | 0) + 1;
  if (gn >= 10 && !(S.act2From >= 0)) { S.act2From = meta.runs | 0; ch = true; }
  if (gn >= 20 && !(S.act3From >= 0)) { S.act3From = meta.runs | 0; ch = true; }
  if (gn >= 30 && !(S.act4From >= 0)) { S.act4From = meta.runs | 0; ch = true; }
  if (!['ambient', 'playback'].includes(S.mix)) { S.mix = 'playback'; ch = true; }
  return ch;
}
// a loss in Act 2 (generations 10 to 18) or Act 3 (20 to 28): the first loss clue its swims have earned, never heard before
// ({ id: 'a2:<swims>', t }). Act 2's stop once its finale was seen, Act 3's once its finale was seen
function actLossClue() {
  actMarks();
  const gn = (meta.gen | 0) + 1, runs = meta.runs | 0, cl = Array.isArray(S.clues) ? S.clues : [];
  const pickOf = (tbl, from, tag) => {
    if (!Array.isArray(tbl) || !(from >= 0)) return null;
    const x = tbl.find((c) => Array.isArray(c) && c[0] <= runs - from && !cl.includes(tag + c[0]));
    return x ? { id: tag + x[0], t: String(x[1] || '') } : null;
  };
  if (gn >= 10 && gn <= 18 && !S.act2Seen) return pickOf(K.ACT2_LOSS_CLUES, S.act2From, 'a2:');
  if (gn >= 20 && gn <= 28 && !S.act3Seen) return pickOf(K.ACT3_LOSS_CLUES, S.act3From, 'a3:');
  if (gn >= 30 && gn <= 38 && !S.act4Seen) return pickOf(K.ACT4_LOSS_CLUES, S.act4From, 'a4:');
  return null;
}
// players who already swam before the tutorial existed do not need it
if (meta.runs > 0 && !S.tutDone && !S.tutTries) { S.tutDone = true; saveUI(); }
if (actMarks()) saveUI();

function applyAudio() {
  try { A.setMuted(meta.muted); A.setMusicVol(S.mvol); A.setSfxVol(S.svol); A.setMusicMuted(!S.music); A.setSfxMuted(!S.sfx); } catch (e) { /* older audio */ }
  try { if (A.setCalm) A.setCalm(!!S.reduced); } catch (e) { /* optional */ }
  try { if (typeof A.setMono === 'function') A.setMono(!!S.mono); } catch (e) { /* optional */ }
  try { if (typeof A.setGentle === 'function') A.setGentle(!!S.gentle); } catch (e) { /* optional */ }
  // iOS: 'ambient' plays over the player's own music (the band stays quiet), 'playback' is the full game (S.mix)
  try { if (typeof A.setSessionType === 'function') A.setSessionType(S.mix === 'playback' ? 'playback' : 'ambient'); } catch (e) { /* optional */ }
}
function unlock() {
  // a hidden tab never wakes the band (a late focus or pointer event while switching apps)
  if (document.hidden) return;
  A.unlock();
  if (A.ctx && (A._suspended || A.ctx.state === 'suspended')) { try { A.resume(); } catch (e) { /* ignore */ } }
  silentHint();
}
// iPhones: the ring/silent switch mutes web audio. The first unlock of the first 3 sessions says so on the title (2.5 s)
let silentDone = false;
function silentHint() {
  if (silentDone) return;
  silentDone = true;
  try {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints | 0) > 1);
    if (!ios || (S.silentN | 0) >= 3 || meta.muted || mode !== 'title') return;
    // a 'playback' session ignores the silent switch: nothing to say
    if (navigator.audioSession && S.mix === 'playback') return;
    S.silentN = (S.silentN | 0) + 1; saveUI();
    toast(K.SILENT_SWITCH_HINT || 'Sound off? Flip the silent switch.', 2500);
  } catch (e) { /* optional */ }
}
const muffle = (on) => { try { A.setMuffle(on); } catch (e) { /* optional */ } };
// win, lose, frenzy and comboBreak also change the music (key, tempo, a dry beat), so they reach audio.js even with
// sound effects off: setSfxMuted already silences the sfx bus there.
// (comboBank to dnaTick hold song state too: the key lift, the egg duel bar, the pass and DNA counters; the fx bus plays them at gain 0)
const SFX_STATEFUL = new Set(['win', 'lose', 'quit', 'frenzy', 'comboBreak', 'comboMilestone', 'comboLow', 'finale', 'backflow', 'trick', 'trickStreak',
  'comboBank', 'comboEnd', 'finisher', 'drillLead', 'eggClaim', 'rivalTell', 'synergy', 'pass', 'dnaTick']);
// stingers: a babble never lands within 0.25 s of one (lastStingerAt, performance.now())
const STINGERS = new Set(['boss', 'bossTaunt', 'rivalTell', 'eggClaim', 'zone', 'frenzy', 'trick', 'trickStreak', 'finisher', 'comboMilestone', 'record',
  'synergy', 'countered', 'drillLead', 'egg', 'goal', 'event', 'legendary', 'grudge', 'finale']);
let lastStingerAt = -1e9;
const sfx = (n, k) => { if (STINGERS.has(n)) lastStingerAt = performance.now(); if (S.sfx || (SFX_STATEFUL.has(n) && A.setSfxMuted)) { try { A.sfx(n, k); } catch (e) { /* never let a sound break a frame */ } } };
// kind: 'title' | 'shop' | 'result' (audio.js picks the menu groove by A.menuKind)
function menuMusic(kind) { try { if (kind) A.menuKind = kind; } catch (e) { /* optional */ } if (A.on) A.intensity = 0.3; setTension(0); slowmoReset(); }
// drop every slow-mo state at once (pause, menus): no tape stop, no swell
function slowmoReset() { try { if (A.slowmoReset) A.slowmoReset(); else A.slowmo(false); } catch (e) { /* ignore */ } }
applyAudio(); $('muteChk').checked = meta.muted;
document.body.classList.toggle('reduced', S.reduced);
document.body.classList.toggle('lefty', S.lefty);
// follow the system setting live until the player picks one in Settings
try {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const onMq = () => { if (S.redSet) return; S.reduced = mq.matches; document.body.classList.toggle('reduced', S.reduced); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
} catch (e) { /* old browser */ }
// the very first tap anywhere starts the band (quietly, behind the menu filter)
document.addEventListener('pointerdown', (e) => {
  unlock();
  if (e.pointerType === 'touch') touchUsed = true;
  // the egg finale: a tap after the first 1.2 s goes straight to the result card. A drum roll is not a skip: a tap within
  // 450 ms of the last drill tap (or of the last tap it swallowed) only keeps the roll going
  if (mode === 'race' && (finHold || birthOn)) {
    const nowMs = performance.now();
    if (nowMs - lastDrillTap < SKIP_GUARD_MS) lastDrillTap = nowMs;
    else if (finHold) finishSkip();
    else birthSkip();
  }
  if (!A.on) { A.on = true; if (mode !== 'race') A.intensity = 0.3; }
}, { capture: true });

// haptics: tiny, throttled, guarded. No navigator.vibrate (iOS Safari): a hidden <input type=checkbox switch> whose label
// is clicked inside a real gesture gives one system tick (at most one every 60 ms); with neither, Settings hides the row
const IOS_TICK = (() => {
  try {
    if (navigator.vibrate || !('switch' in HTMLInputElement.prototype)) return null;
    const lb = document.createElement('label'), ip = document.createElement('input');
    ip.type = 'checkbox'; ip.setAttribute('switch', ''); ip.tabIndex = -1; ip.setAttribute('aria-hidden', 'true');
    lb.appendChild(ip); lb.style.cssText = 'display:none'; lb.setAttribute('aria-hidden', 'true');
    document.body.appendChild(lb);
    return lb;
  } catch (e) { return null; }
})();
// true while a pointer or key event is being handled (the only time the switch trick is allowed to fire)
let inGesture = false;
for (const ev of ['pointerdown', 'pointerup', 'keydown', 'click']) addEventListener(ev, () => { inGesture = true; setTimeout(() => { inGesture = false; }, 0); }, { capture: true });
let lastTick = 0;
function iosTick() {
  if (!IOS_TICK || !inGesture) return;
  const now = performance.now(); if (now - lastTick < 60) return; lastTick = now;
  try { IOS_TICK.click(); } catch (e) { /* not allowed */ }
}
let lastBuzz = 0;
function buzz(pat, force) {
  if (!S.haptics) return;
  if (!navigator.vibrate) { iosTick(); return; }
  const now = performance.now(); if (!force && now - lastBuzz < 70) return; lastBuzz = now;
  // every buzz is at least 12 ms: shorter ones do nothing on most phones (pauses in a pattern stay as they are)
  const v = Array.isArray(pat) ? pat.map((x, i) => (i % 2 ? x : Math.max(12, x | 0))) : Math.max(12, pat | 0);
  try { navigator.vibrate(v); } catch (e) { /* not allowed */ }
}
// camera feel
const trauma = (a, dx, dy, hz) => { if (R.addTrauma) R.addTrauma(S.reduced ? a * 0.3 : a, dx, dy, hz); else R.shake = Math.max(R.shake, a * 14); };
const kick = (dx, dy) => { if (R.kick && !S.reduced) R.kick(dx, dy); };

let race = null, mode = 'title', timeScale = 1, slowT = 0, shownRank = TOTAL_SWIMMERS, hintT = 0, prevBest = TOTAL_SWIMMERS;
// (per swim: the near-flick count for the FLICK_HARDER coach line; the egg duel's tell holds and per-rival bark clocks)
const BRIGHT_ZONES = new Set(['acid', 'sea', 'fork', 'rapids', 'egg']);
let flickNear = 0, duelTellUntil = {}, duelAt = {}, thinkPend = null, thinkCalmAt = -1;
let clock = 0, stopT = 0, freezeT = 0, countT = 0, goT = 0, lastSlowAt = -99, lastPopStop = -99, kevinN = 1, firstSwim = false, raceT0 = 0;
window.game = { get race() { return race; }, get meta() { return meta; }, get settings() { return S; }, R, get gov() { return gov; },
  // test hooks (the browser suite): the hit-stop state and its release count
  story: () => (genStory() || []).map((l) => l.t),
  hs: { hitStop: (...a) => hitStop(...a), hitStopRL: (...a) => hitStopRL(...a), get stopT() { return stopT; }, get hold() { return hitHold; },
    get frozen() { return frozenRecent; }, set frozen(v) { frozenRecent = +v || 0; }, get releases() { return hitReleaseN; } } };

// a demo race runs behind the title screen
function demo() { race = new Race(newMeta(), Math.random, { autopilot: true }); race.demo = true; R.camY = null; }

const OVERLAYS = ['title', 'intro', 'cards', 'result', 'shop', 'album', 'pause', 'settings', 'welcome', 'trickbook', 'records'];
function show(id) { document.body.classList.toggle('cardsUp', id === 'cards'); if (id !== 'title' && R.titleHero) R.titleHero(false); introUnderOff(); for (const o of OVERLAYS) $(o).classList.toggle('hide', o !== id); if (id !== 'cards') $('cards').classList.remove('out'); $('ver').classList.toggle('hide', id !== 'title'); staleUI(); }
// ------------------------------------------------------------------ two tabs, one save
// a live race: the player's swim in this tab (the title's demo is not one)
const liveRace = () => mode === 'race' && !!race && !race.demo;
// the 'Kevin is swimming in another tab' bar: up whenever this tab is stale, except over a live swim
function staleUI() { const b = $('staleBar'); if (b) b.classList.toggle('hide', !staleTab || liveRace()); }
// read the save again (another tab may have written it); a missing or broken one keeps what this tab holds
function reloadMeta() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) meta = loadMeta(JSON.parse(raw)); } catch (e) { /* keep ours */ }
}
// the open screen shows the save as it is now
function refreshOpen() {
  try {
    if (mode === 'title') { titleStats(); renderFactory(); }
    badges();
    if (!$('shop').classList.contains('hide')) shop(shopFrom);
  } catch (e) { /* only a redraw */ }
}
let tabBC = null;
try { if (typeof BroadcastChannel === 'function') tabBC = new BroadcastChannel('mto'); } catch (e) { tabBC = null; }
// this tab lost the save to another one (it pressed 'Play here')
function lostTab() { ownsTab = false; staleTab = true; staleUI(); }
if (tabBC) tabBC.onmessage = (ev) => {
  const t = ev && ev.data && ev.data.t;
  if (t === 'hello' && ownsTab) { try { tabBC.postMessage({ t: 'here' }); } catch (e) { /* closed */ } }
  else if (t === 'take' && ownsTab) lostTab();
};
// ask for the save: true once this tab owns it. steal: 'Play here' takes it from the other tab
function acquireTab(steal) {
  return new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    try {
      if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
        navigator.locks.request('mto-active', steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) { fin(false); return null; }
          fin(true);
          return new Promise(() => { /* held for as long as this tab lives */ });
        }).catch(() => { if (done && ownsTab) lostTab(); fin(false); });
        return;
      }
    } catch (e) { /* no locks: the channel */ }
    if (!tabBC) { fin(true); return; }
    if (steal) { try { tabBC.postMessage({ t: 'take' }); } catch (e) { /* closed */ } fin(true); return; }
    let heard = false; const onM = (ev) => { if (ev && ev.data && ev.data.t === 'here') heard = true; };
    tabBC.addEventListener('message', onM);
    try { tabBC.postMessage({ t: 'hello' }); } catch (e) { /* closed */ }
    setTimeout(() => { tabBC.removeEventListener('message', onM); fin(!heard); }, 150);
  });
}
// the answer: an owner writes what waited; a tab without the save goes stale (it never writes)
function ownResult(ok) {
  ownKnown = true; ownsTab = !!ok; staleTab = !ok; staleUI();
  if (ok && saveWanted) { saveWanted = false; save(); }
  return ok;
}
// 'Play here': the save as the other tab left it, then this tab takes it over
function claimTab() {
  reloadMeta();
  acquireTab(true).then((ok) => { ownResult(ok); if (ok) { reloadMeta(); refreshOpen(); sfx('tap'); } });
}
// another tab wrote the save: outside a live swim this tab shows it at once; mid-swim this tab's copy is stale
addEventListener('storage', (e) => {
  if (!e || e.key !== SAVE_KEY || e.newValue == null) return;
  if (liveRace()) { staleTab = true; return; }
  try { meta = loadMeta(JSON.parse(e.newValue)); } catch (err) { return; }
  refreshOpen();
});
function hud(on) {
  for (const id of ['hud', 'dashBtn', 'pauseBtn']) $(id).classList.toggle('hide', !on);
  // body.racing re-anchors the hint and the toast under the HUD; body.egg hides the coach strip under the egg panel
  document.body.classList.toggle('racing', !!on);
  if (!on) {
    eggBody(false); setC($('pauseBtn'), 'off', false); lessonEnd();
    $('combo').style.opacity = 0; H.combo._op = 0; setC(document.body, 'comboOn', false); duelShow(false); tutHide(); coClear();
    coachClear(); $('hint').style.opacity = 0; $('count').className = ''; setC($('tutTarget'), 'hide', true); dashHoldEnd();
    setC(document.body, 'noTick', false); setC(document.body, 'hud1', false); setC(document.body, 'hud2', false); setC(document.body, 'swim1', false);
    setC(document.body, 'intense', false); intenseOn = false; R.youOff = 0;
    if (curOn) { curOn = false; try { if (A.current) A.current(0); } catch (e) { /* optional */ } }
  } else requestAnimationFrame(measureHud);
}
// the DASH button's box in #app coordinates (measureHud): guide rings keep off it
let dashRectApp = null;
// --hudB: where the HUD ends (the coach strip and banners sit under it); the renderer keeps threats out from under it too
function measureHud() {
  const h = $('hud'), hh = h.offsetHeight; if (!hh) return;
  document.documentElement.style.setProperty('--hudB', hh + 'px');
  // the renderer's copies (logical units): where the HUD ends, and the DASH button's box (labels keep clear of it)
  { const c = cv.getBoundingClientRect(), kk = c.width ? VIEW_W / c.width : (R.cssK || 1); hudBottomL = hh * (R.cssK || kk);
    // the egg panel under the HUD: canvas labels and signs keep below it too
    if (!DU.ui.classList.contains('hide') && !landscape()) { const dr = duRestRect(); if (dr.height && dr.top - c.top < c.height / 2) hudBottomL = Math.max(hudBottomL, (dr.bottom - c.top + 6) * kk); }
    duelBoxMeasure();
    const d = $('dashBtn').getBoundingClientRect();
    { const ab = APP.getBoundingClientRect(); dashRectApp = d.width ? { x: d.left - ab.left, y: d.top - ab.top, w: d.width, h: d.height } : null; }
    dashAvoidL = d.width && c.width ? { x: (d.left - c.left) * kk, y: (d.top - c.top) * kk, w: d.width * kk, h: d.height * kk } : null;
    if (H && H.tick) H.tick._res = null; }
  // in landscape the HUD is a side gutter, so nothing in the tube is under it
  const land = landscape();
  R.padTop = land ? 0 : hh;
  // the bottom: the combo strip while it shows, otherwise the room it keeps (safe area + 104 px). Landscape: a gutter again.
  // (portrait: the combo strip sits under the HUD now, so the bottom is the room above DASH: safe area + 104, 118 when narrow)
  const cb = $('combo'), r = cb.getBoundingClientRect(), ab = APP.getBoundingClientRect().bottom;
  R.padBot = land ? 0 : Math.round(safeBpx + (innerWidth <= 400 ? 118 : 104));
  // its height pushes the coach strip, a top banner and swim 1's card below it while a combo is live (--comboH)
  { const ch = Math.round(r.height) || 0; if (ch > 0 && ch !== comboHpx) { comboHpx = ch; document.documentElement.style.setProperty('--comboH', ch + 'px'); } }
  // the egg zone: the duel panel sits low (above the DASH row), so Kevin is framed above it
  if (!land && document.body.classList.contains('egg') && !DU.ui.classList.contains('hide')) { const dr = duRestRect(); if (dr.height) R.padBot = Math.max(R.padBot, Math.round(ab - dr.top + 6)); }
  document.documentElement.style.setProperty('--padBot', R.padBot + 'px');
  measureBankTarget();
  // rival name tags: a row is only used when it has room, so a tag never runs into the rank, the gas bar or the chips
  const pr = $('prog').getBoundingClientRect(), rr = $('rankRow').getBoundingClientRect(), er = $('energyRow').getBoundingClientRect(), mr = $('mutRow').getBoundingClientRect();
  const below = Math.min(er.top, mr.height > 0 ? mr.top : 1e9);
  tagRowOk[0] = pr.top - rr.bottom >= 9;
  // the lower row's tag (from 9 px to 22 px under the bar's top) keeps 4 px off the gas bar and the mutation chips
  tagRowOk[1] = below - pr.top >= 26;
  if (!tagRowOk[0] && !tagRowOk[1]) tagRowOk[0] = true;
  // the '1,000,000 swimmers alive' line: a top-row tag whose band (16 px over the bar) would sit on it drops below the bar
  const al = $('alive').getBoundingClientRect();
  aliveRes = al.width > 0 && al.bottom > pr.top - 17 ? [al.left - pr.left - 4, al.right - pr.left + 4] : null;
  hudClampCheck(er);
}
// #hud never leaves 0..innerWidth: a GAS row whose chips (a FRENZY or MAXED pop, a shaking bar) poke past an edge drops
// its animations and clips (.hudClamp) until a later measure finds it back on screen
function hudClampCheck(er) {
  const h = $('hud'), W = innerWidth || 0; if (!W) return;
  const r = h.getBoundingClientRect(); let out = r.left < -0.5 || r.right > W + 0.5;
  if (!out && er && er.width) out = er.left < -0.5 || er.right > W + 0.5;
  if (!out) for (const c of $('energyRow').children) { if (c.classList.contains('hide')) continue; const q = c.getBoundingClientRect(); if (q.width && (q.left < -0.5 || q.right > W + 0.5)) { out = true; break; } }
  if (out) { h.style.transform = 'none'; h.classList.add('hudClamp'); } else if (h.classList.contains('hudClamp') && r.right <= W) h.classList.remove('hudClamp');
}
let tagRowOk = [true, true], aliveRes = null, comboHpx = 0;
// banked helices fly to the HUD's DNA counter (logical screen units, as the renderer wants them)
// fruit flies to the GAS bar's centre (gasTgtL), DNA motes to the DNA counter (R.bankTarget): logical units, measured with
// the HUD (never per pickup, so a pickup never forces a layout)
let gasTgtL = null;
function measureBankTarget() {
  { const g = $('ebar') || $('energyRow'), c = cv.getBoundingClientRect(), r = g ? g.getBoundingClientRect() : null;
    if (r && r.width && c.width) { const k = VIEW_W / c.width; gasTgtL = { x: (r.left + r.width / 2 - c.left) * k, y: (r.top + r.height / 2 - c.top) * k }; } }
  const el = $('dnaHud'); if (!el || el.classList.contains('hide')) return;
  const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect(); if (!r.width || !c.width) return;
  const k = VIEW_W / c.width;
  R.bankTarget = { x: (r.left + r.width / 2 - c.left) * k, y: (r.top + r.height / 2 - c.top) * k };
}
R.onBankLand = (i, n) => {
  sfx('dnaTick', { i, n });
  const el = $('dnaHud'); if (!el || S.reduced || !el.animate) return;
  el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
};
// the same rule the CSS uses for the landscape layout, so JS and CSS never disagree
// (landscape phones, and any landscape screen 5:4 or wider: tablets and desktops get the same gutter layout)
const LAND_MQ = (() => { try { return matchMedia('(orientation:landscape) and (max-height:520px), (orientation:landscape) and (min-aspect-ratio:5/4)'); } catch (e) { return null; } })();
const landscape = () => (LAND_MQ ? LAND_MQ.matches : innerWidth > innerHeight && (innerHeight <= 520 || innerWidth / innerHeight >= 1.25));
// the phone turned mid-swim: the layout jumps under the thumb, so a live swim pauses (the resume countdown runs)
let lastLand = landscape();
function landCheck() {
  const l = landscape(); if (l === lastLand) return; lastLand = l;
  if (mode === 'race' && race && !race.demo && !race.pending && !race.over && !race.paused) pause();
}
if (LAND_MQ) { const f = () => { landCheck(); requestAnimationFrame(() => { if (mode === 'race') measureHud(); }); }; if (LAND_MQ.addEventListener) LAND_MQ.addEventListener('change', f); else if (LAND_MQ.addListener) LAND_MQ.addListener(f); }

// ------------------------------------------------------------------ Dad's habits helpers (core may cap levels by generation)
function habMax(id) {
  try { if (typeof C.maxLv === 'function') { const v = C.maxLv(meta, id); if (Number.isFinite(v) && v >= 0) return v; } } catch (e) { /* fall back */ }
  return HABITS[id].max;
}
function habEff(id, l) {
  try {
    if (typeof C.habitEffect !== 'function') return null;
    let v = C.habitEffect(id, l, meta);
    if (v && typeof v === 'object') v = v.label;
    if (v == null || v === '' || typeof v === 'object' || /undefined|NaN/.test(String(v))) return null;
    return String(v);
  } catch (e) { return null; }
}
const affordable = () => HABIT_ORDER.filter((id) => lv(meta, id) < habMax(id) && meta.dna >= habitCost(id, lv(meta, id)));
function badges() {
  // the first swims point at ONE habit (Dad's pick): no count badge yet
  const n = (meta.runs | 0) <= 1 ? 0 : affordable().length;
  for (const id of ['shopBtn', 'resShopBtn']) {
    const b = $(id); let c = b.querySelector('.cnt');
    if (!n) { if (c) c.remove(); continue; }
    if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); }
    c.textContent = n;
  }
}
// one line per normal level (the tier comes from the habit's own max, never the grandad cap); past it, Grandad's pool
function habitQuip(id) {
  const l = lv(meta, id), g = (K.GRANDAD_QUIPS || {})[id];
  if (HABITS[id] && l >= HABITS[id].max && Array.isArray(g) && g.length) return pickLine(g);
  const q = HABIT_QUIPS[id]; if (!q || !q.length) return '';
  return q[Math.min(l, q.length - 1)];
}
// shopSwim: the first purchase ever was just made, so the shop's Back button swims with it
let shopSwim = false;
function buy(id) {
  if (!buyHabit(meta, id)) { buzz(6); return false; }
  sfx('buy'); buzz(15); save();
  if (!S.firstBuy) { S.firstBuy = true; saveUI(); shopSwim = true; }
  // a buy in the shop opened from a result: Back becomes SWIM WITH IT (the new habit, straight into a swim)
  if (shopFrom === 'result' && mode === 'result' && !$('shop').classList.contains('hide')) shopSwim = true;
  const q = habitQuip(id); toast(HABITS[id].icon + ' ' + (q || HABITS[id].name + ' levelled up!'));
  badges();
  // this level unlocks a perk: a 1.6 s PERK UNLOCKED card, and a banner on the next launch (S.perkNew)
  { const l = lv(meta, id);
    if (habitPerkLevels(id).includes(l)) { const px = perksOf(id).find((x) => x.lv === l), T = px ? (K.HABIT_PERK_TEXT || {})[px.perk] : null; if (T && T.name) { perkCard(T); S.perkNew = px.perk; saveUI(); } } }
  return true;
}
// the PERK UNLOCKED card: name and rule, a gold burst, 1.6 s (a tap closes it sooner)
let perkCardTO = 0;
function perkCard(T) {
  const el = $('perkCard'); if (!el) return;
  el.innerHTML = `<div class="pk"><div class="k">PERK UNLOCKED</div><b>${esc(T.name)}</b>${T.desc ? `<small>${esc(T.desc)}</small>` : ''}</div>`;
  el.classList.remove('hide', 'on'); void el.offsetWidth; el.classList.add('on');
  buzz([20, 40, 80]); sfx('perk');
  try { if (R.confetti && !S.reduced) R.confetti(); } catch (e) { /* only juice */ }
  clearTimeout(perkCardTO); perkCardTO = setTimeout(() => { el.classList.remove('on'); el.classList.add('hide'); }, 1600);
  el.onclick = () => { clearTimeout(perkCardTO); el.classList.remove('on'); el.classList.add('hide'); };
}

// ------------------------------------------------------------------ title
// the factory payout sound's level: bank under 25%, 25-60%, 60-99%, full
const factoryLv = (f) => (f >= 0.99 ? 3 : f >= 0.6 ? 2 : f >= 0.25 ? 1 : 0);
function capHours() { const v = C.factoryCapHours; let h = 12; try { h = typeof v === 'function' ? v(meta) : +v; } catch (e) { /* default */ } return h > 0 ? h : 12; }
function hm(h) { const m = Math.max(0, Math.round(h * 60)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
function renderFactory() {
  const rate = factoryRate(meta), cap = rate * capHours(), bank = meta.bank || 0, full = bank >= cap - 0.5;
  const name = FACTORY_NAMES[clamp(lv(meta, 'factory'), 0, FACTORY_NAMES.length - 1)] || "Dad's factory";
  setT($('bankName'), `🏭 ${name} · ${fmt(rate)} DNA/h`);
  setBar($('bankFill'), cap > 0 ? bank / cap : 0);
  setT($('bankLine'), `${fmt(Math.floor(bank))} / ${fmt(cap)} DNA · ${full ? 'FULL! Collect it' : 'full in ' + hm((cap - bank) / Math.max(1, rate))}`);
  setC($('bankBox'), 'full', full);
  setC($('bankBox'), 'ripe', cap > 0 && bank / cap >= 0.6);
  const b = $('bankBtn'); const off = Math.floor(bank) < 1; if (b.disabled !== off) b.disabled = off;
}
$('bankBtn').onclick = () => {
  idleTick(meta, Date.now());
  const rate = Math.max(1, factoryRate(meta)), cap = rate * capHours(), wasFull = meta.bank >= cap - 0.5;
  const fill = clamp((meta.bank || 0) / Math.max(1, cap), 0, 1);
  const d = collectBank(meta); if (d < 1) return;
  const h = d / rate, key = wasFull ? 'full' : h < 1 ? '<1' : h < 4 ? '1-4' : h < 8 ? '4-8' : '8+';
  sfx('factory', factoryLv(fill)); buzz(20); save();
  toast(fillLine(pickLine(AWAY_LINES[key]) || '+{dna} DNA collected!', { dna: fmt(d) }));
  if (race) R.pop(VIEW_W / 2, race.p.y + 200, '+' + fmt(d) + ' DNA', '#7dffb0', 26);
  titleStats(); renderFactory(); badges();
};
function titleStats() {
  $('titleStats').innerHTML = `<div class="stat"><b>${meta.best >= TOTAL_SWIMMERS ? '-' : '#' + fmt(meta.best)}</b>best place</div><div class="stat"><b>${fmt(meta.dna)}</b>DNA 🧬</div><div class="stat"><b>${meta.gen + 1}</b>generation</div><div class="stat"><b>${meta.babies.length}</b>babies</div>`;
}
const streakOf = () => +(meta.dailyStreak ?? meta.streak ?? 0) || 0;
// the daily's rule (systems: C.dailyRule(day) -> an event id, or race.dailyRule) and today's medal (meta.dailyMedal)
const MEDAL_IC = { 1: '🥉', 2: '🥈', 3: '🥇' };
function dailyRuleId(day) {
  try { if (typeof C.dailyRule === 'function') { const r = C.dailyRule(day); return r && typeof r === 'object' ? r.id : r || null; } } catch (e) { /* optional */ }
  return race && race.daily === day && race.dailyRule ? race.dailyRule : null;
}
function dailyRuleShort(day) { const id = dailyRuleId(day); return id ? EVENT_SHORT[id] || (C.RACE_EVENTS && C.RACE_EVENTS[id] && C.RACE_EVENTS[id].name) || '' : ''; }
function dailyMedalToday(day) {
  const m = meta.dailyMedal; if (m == null) return 0;
  if (typeof m === 'object') return m.day === day ? clamp(m.tier | 0, 0, 3) : (m[day] != null ? clamp(m[day] | 0, 0, 3) : 0);
  return meta.dailyDay === day ? clamp(m | 0, 0, 3) : 0;
}
function newBadge(el, on) {
  let n = el.querySelector('.newb');
  if (!on) { if (n) n.remove(); return; }
  if (!n) { n = document.createElement('span'); n.className = 'newb'; n.textContent = 'NEW'; el.appendChild(n); }
}
// the title opens up as the player goes: Daily (5 swims, or a first baby), Dad's factory (a level or a first
// payout), the Album (a baby or a mashup), the stats (2 swims). Each gets a NEW badge the first time it shows
// (S.revealed; shownNew keeps that badge for the rest of this session)
const REVEALS = [['daily', 'dailyBtn', 'noDaily'], ['bank', 'bankBox', 'noBank'], ['album', 'albumBtn', 'noAlbum'], ['stats', 'titleStats', 'noStats']];
const shownNew = new Set();
function revealOn(k) {
  const runs = meta.runs | 0;
  if (k === 'daily') return (typeof C.normRunsOf === 'function' ? C.normRunsOf(meta) : runs) >= 5 || (meta.wins | 0) > 0;
  if (k === 'bank') return lv(meta, 'factory') > 0 || (+meta.bank || 0) >= 1;
  if (k === 'album') return (meta.babies || []).length > 0 || (meta.synergiesSeen || []).length > 0;
  return runs >= 2;
}
function revealTick(fresh) {
  // a save from before the reveal: what it already qualifies for counts as seen (no wall of NEW badges)
  if (S.revealed == null) { S.revealed = (meta.runs | 0) >= 2 ? REVEALS.map((r) => r[0]).filter(revealOn) : []; saveUI(); }
  for (const [k, id, cls] of REVEALS) {
    const on = revealOn(k);
    setC($('title'), cls, !on);
    if (on && !fresh && !S.revealed.includes(k)) { S.revealed.push(k); saveUI(); shownNew.add(k); }
    newBadge($(id), on && shownNew.has(k));
  }
  // the daily swim before it opens: a locked chip that says what opens it (never on the very first visit)
  { const dl = $('dailyLock'); if (dl) { setT(dl, '🔒 ' + (K.DAILY_LOCKED || 'Opens after your first baby or 5 swims')); setC(dl, 'hide', revealOn('daily') || (meta.runs | 0) === 0 || typeof C.dailySeed !== 'function'); } }
}
function title() {
  mode = 'title'; demo(); hud(false); show('title'); muffle(false); menuMusic('title'); govHold(3);
  birthOn = null; try { if (typeof R.birthEnd === 'function') R.birthEnd(); } catch (e) { /* optional */ }
  pushGuard();
  save();
  titleStats(); renderFactory();
  // the very first visit: just the story and one big SWIM button; the rest opens up after the first swim
  const fresh = meta.runs === 0;
  $('title').classList.toggle('fresh', fresh);
  // art's idle Kevin with his #1,000,000 bib, drawn into his own canvas above the logo on the very first visit
  if (R.titleHero) R.titleHero(fresh && innerHeight > 600, $('heroCv'));
  // after the first visit the subtitle rotates through the taglines (the story line stays for the very first look)
  const tl = !fresh && K.TITLE_TAGLINES && K.TITLE_TAGLINES.length ? fillLine(pickLine(K.TITLE_TAGLINES), { n: fmt(kevinNo()) }) : '';
  // (the very first look: K.TITLE_FIRST, HTML with a <br>)
  if (tl) setT($('titleSub'), tl); else { const ts = $('titleSub'); ts._v = null; ts.innerHTML = fresh ? K.TITLE_FIRST || 'Every person alive won this race once.<br>Your turn.' : '1,000,000 swimmers. 1 egg.<br>You start dead last.'; }
  // the bounty the last swim promised
  const gl = fresh ? '' : nextGoalLine(meta.goal);
  setT($('titleGoal'), gl ? '🎯 ' + gl : ''); setC($('titleGoal'), 'hide', !gl);
  $('autoWrap').classList.toggle('hide', !lv(meta, 'gps')); $('autoChk').checked = meta.autopilot;
  const daily = typeof C.dailySeed === 'function';
  $('dailyBtn').classList.toggle('hide', !daily);
  setC($('dailyBtn'), 'pulse', false);
  if (daily) {
    const today = C.dailySeed(), n = streakOf(), done = meta.dailyDay === today, now = Date.now();
    const alive = n > 0 && (typeof C.streakAlive === 'function' ? C.streakAlive(meta, now) : meta.dailyLastDay >= today - 1), best = +meta.bestStreak || 0;
    // a streak freeze WILL bridge the missed day if today's daily is swum (the same test as core's settle): it is not lost
    const saveable = !done && n > 0 && !alive && meta.dailyLastDay === today - 2 && (meta.streakFreeze | 0) > 0;
    let sub;
    if (saveable) {
      const fl = Array.isArray(K.FREEZE_LINES) && K.FREEZE_LINES.length ? K.FREEZE_LINES[today % K.FREEZE_LINES.length] : '';
      sub = fl ? fillLine(fl, { n }) : `❄ Swim today to keep your ${n}-day streak`;
      setC($('dailyBtn'), 'pulse', true);
    } else if (alive && !done && STREAK_NUDGE.length) { sub = fillLine(STREAK_NUDGE[today % STREAK_NUDGE.length], { n }); setC($('dailyBtn'), 'pulse', true); }
    else if (alive) sub = `🔥 ${n} day streak` + (done && meta.dailyBest < TOTAL_SWIMMERS ? ' · today #' + fmt(meta.dailyBest) : '');
    else if (n > 0 && (DAILY_LINES.lost || []).length && (S.streakLostDay === -1 || S.streakLostDay === today)) {
      // a streak that died: said once, on the day you come back
      sub = DAILY_LINES.lost[today % DAILY_LINES.lost.length];
      if (S.streakLostDay !== today) { S.streakLostDay = today; saveUI(); }
    } else sub = done && meta.dailyBest < TOTAL_SWIMMERS ? 'today: #' + fmt(meta.dailyBest) : 'same tube for everyone today';
    if ((alive || saveable) && !done && n > 0) S.streakLostDay = -1;
    if (best > 1) sub += ` · best ${best}`;
    // a week of pips (day 7 pays triple), what the next counted daily pays, and when the next tube opens
    const pos = (alive || saveable) && n > 0 ? ((n - 1) % 7) + 1 : 0;
    const pips = Array.from({ length: 7 }, (_, i) => `<i class="${i < pos ? 'on' : ''}${i === 6 ? ' x3' : ''}"${i === 6 ? ' title="Day 7 pays x3"' : ''}></i>`).join('');
    const bonus = typeof C.dailyBonusFor === 'function' ? C.dailyBonusFor(done || alive || saveable ? n + 1 : 1, meta.gen) : 0;
    // the next tube opens at local midnight (the daily runs on local days)
    const left = Math.max(0, new Date().setHours(24, 0, 0, 0) - now);
    const nxt = (bonus > 0 ? `${done ? 'Tomorrow' : 'Today'}: +${fmt(bonus)} DNA` : '') + (done ? `${bonus > 0 ? ' · ' : ''}next tube in ${hm(left / 3600000)}` : '');
    const rule = dailyRuleShort(today), tier = dailyMedalToday(today);
    const medals = [1, 2, 3].map((m) => `<i class="m${m}${tier >= m ? ' on' : ''}">${tier >= m ? MEDAL_IC[m] : ''}</i>`).join('');
    // streak freezes held (meta.streakFreeze): an ice pip each, beside the week
    const fz = clamp(Math.floor(+meta.streakFreeze || 0), 0, 5), ice = fz ? `<span class="dfrz${saveable ? ' save' : ''}" title="${esc((K.FREEZE_SHOP && K.FREEZE_SHOP.name) || 'Streak freeze')}" aria-label="${fz} streak freeze${fz === 1 ? '' : 's'}">${'<i>❄</i>'.repeat(fz)}</span>` : '';
    $('dailyBtn').innerHTML = `Daily Swim 📅 ${rule ? `<small class="drule">${esc(rule)}</small>` : ''}<small>${esc(sub)}</small><span class="dpips">${pips}${ice}</span><span class="dmed" aria-label="today's medal">${medals}</span>${nxt ? `<small class="dnx">${esc(nxt)}</small>` : ''}`;
  }
  const seen = (meta.synergiesSeen || []).length;
  $('albumBtn').innerHTML = `Baby Album 👶 <small>${meta.babies.length} babies · Mashups ${seen}/${SYNERGIES.length}</small>`;
  const reveal = !fresh && !S.revealSeen;
  newBadge($('shopBtn'), reveal);
  revealTick(fresh);
  if (reveal) { S.revealSeen = true; saveUI(); }
  // the nemesis gets a line of their own
  const nem = nemesisOf(), nl = $('titleNem');
  if (nem && !fresh) {
    const x = rivalRec(nem), r = RIVALS.find((q) => first(q.name) === nem);
    nl.innerHTML = `<b>NEMESIS</b> ${esc(nem)} <small>${x.beat | 0}-${x.lost | 0}</small>`; nl.style.setProperty('--c', r ? r.col : '#ff5c7a');
    nl.title = linesOf(nem).nemesis || '';
    nl.classList.remove('hide');
  } else nl.classList.add('hide');
  badges(); syncMute();
  // a long break taken during a paused swim: welcome back now (a beat later, so the title is up first)
  if (pendingAway > 0 && meta.runs >= 1) { const aw = pendingAway; pendingAway = 0; setTimeout(() => { if (mode === 'title') maybeWelcome(aw); }, 0); }
}

// ------------------------------------------------------------------ welcome back: what Dad's factory made while you were away
let welcomeAnim = null;
function maybeWelcome(awayMs) {
  if (!(awayMs >= 15 * 60000) || mode !== 'title' || $('title').classList.contains('hide') || meta.runs < 1) return false;
  idleTick(meta, Date.now());
  const bank = Math.floor(meta.bank || 0); if (bank < 1) return false;
  const rate = Math.max(1, factoryRate(meta)), cap = rate * capHours(), h = awayMs / 3600000;
  const key = meta.bank >= cap - 0.5 ? 'full' : h < 1 ? '<1' : h < 4 ? '1-4' : h < 8 ? '4-8' : '8+';
  setT($('wbTitle'), pickLine(WELCOME_TITLES));
  setT($('wbAway'), fillLine(UIC('away', 'You were away for {t}'), { t: hm(h) }));
  setT($('wbLine'), fillLine(pickLine(AWAY_LINES[key]) || '+{dna} DNA collected!', { dna: fmt(bank) }));
  $('wbDna').textContent = '+0 🧬';
  setC($('wbCollect'), 'hide', false); setC($('wbShop'), 'hide', true); setT($('wbClose'), 'Later');
  show('welcome');
  welcomeAnim = { t: 0, dur: S.reduced ? 0.01 : 1.2, n: bank, tick: 0 };
  return true;
}
function welcomeTick(dt) {
  const a = welcomeAnim; a.t += dt;
  const k = clamp(a.t / a.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
  setT($('wbDna'), '+' + fmt(a.n * e) + ' 🧬');
  a.tick -= dt; if (a.tick <= 0 && k < 1) { a.tick = 0.12; sfx('countTick', k); }
  if (k >= 1) welcomeAnim = null;
}
$('wbCollect').onclick = () => {
  welcomeAnim = null; idleTick(meta, Date.now());
  const fill = clamp((meta.bank || 0) / Math.max(1, factoryRate(meta) * capHours()), 0, 1);
  const d = collectBank(meta); if (d >= 1) { sfx('factory', factoryLv(fill)); buzz(20); }
  save(); setT($('wbDna'), '+' + fmt(d) + ' 🧬'); setT($('wbLine'), 'Collected! It is all in the bank.');
  setC($('wbCollect'), 'hide', true); setT($('wbClose'), 'Back');
  const n = affordable().length;
  if (n) { setT($('wbShop'), `You can afford ${n} habit${n === 1 ? '' : 's'} 🥦`); setC($('wbShop'), 'hide', false); }
  titleStats(); renderFactory(); badges();
};
$('wbShop').onclick = () => shop('title');
$('wbClose').onclick = () => title();

// ------------------------------------------------------------------ intro story (and the new-generation story), over the dimmed demo race
// A line is a string or { t, ch (a chapter starts here), sticky (Skip never jumps past it), tap (no auto-advance),
// onShow (called once the line is on screen) }. Skip jumps to the next chapter; inside a sticky chapter (a finale) it
// goes to that chapter's last line, so a finale is never skipped past.
let introTO = 0;
function intro(done, lines = INTRO) {
  mode = 'intro'; show('intro'); let i = 0; setC($('introHint'), 'pulse', false);
  setT($('introHint'), lines === INTRO ? 'tap to start swimming' : 'tap to continue');
  // the opening story (swim 1): about 1 s a line, the last one stays up over the countdown, and any touch means go now
  const opening = lines === INTRO;
  const L = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
  let ended = false, lineAt = 0;
  // the story's own music (audio: A.story 1 for a chapter, 2 under a finale, 0 when it closes; A.storyReveal on the reveal)
  const story = (n) => { try { if (!opening && typeof A.story === 'function') A.story(n); } catch (e) { /* optional */ } };
  story(1);
  const end = () => {
    if (ended) return; ended = true;
    clearTimeout(introTO); $('intro').onclick = null; $('intro').onpointerdown = null; $('introSkip').onclick = null;
    story(0);
    if (opening) meta.introSeen = true; save(); done();
  };
  const next = () => {
    clearTimeout(introTO);
    // the story waits while the tab is hidden: nobody misses a line, and the swim never starts in the background
    if (document.hidden) { introTO = setTimeout(next, 500); return; }
    if (i >= L.length) return end();
    const ln = L[i++], t = String(ln.t || ''), el = $('introTxt');
    const last = opening && i === L.length;
    // big: the 'Dead last.' beat, the opening's last line and the NEW GENERATION stamp (a long one a size down)
    // a setup sentence ending in 'Dead last.': the setup at reading size, the punchline on its own line, big
    const dm = t.match(/^(.+?)\s*(Dead last\.)$/);
    const big = !dm && (t === 'NEW GENERATION' || last);
    if (dm) el.innerHTML = `<span class="setup">${esc(dm[1])}</span><span class="punch">${esc(dm[2])}</span>`;
    else el.textContent = t;
    el.classList.toggle('split', !!dm); el.classList.toggle('big', big); el.classList.toggle('long', big && t.length > 16);
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    lineAt = performance.now();
    sfx('tap', i / L.length);
    if (!opening) { if (ln.tap && ln.sticky) { try { if (typeof A.storyReveal === 'function') A.storyReveal(); } catch (e) { /* optional */ } } else story(ln.sticky ? 2 : 1); }
    if (ln.onShow) { try { ln.onShow(); } catch (e) { /* the story goes on */ } }
    // a pulsing "tap" says the story can be hurried along: the opening from its first line (a tap there starts the swim),
    // the other stories from the second line (a tap-only line always says so)
    setC($('introHint'), 'pulse', opening || i >= 2 || !!ln.tap);
    // the opening's last line: the swim starts now, its countdown running under this line
    if (last) { introUnder(end); return; }
    // the opening dwells by its length (1.2 to 1.8 s): control in about 4 s, and a tap gets there sooner
    if (!ln.tap) introTO = setTimeout(next, opening ? clamp(500 + 30 * t.length, 1200, 1800) : t.length <= 16 ? 800 : t.length <= 40 ? 1300 : 2000);
  };
  if (opening) {
    // a touch after the first line (never in the first 350 ms of a line: a thumb still on its way down from SWIM is not a
    // skip) jumps to the last line, and the swim's countdown goes straight to GO: that thumb is ready
    $('intro').onclick = null;
    $('intro').onpointerdown = () => {
      if (ended || performance.now() - lineAt < 350) return;
      if (i < L.length) i = L.length - 1;
      next(); introGo();
    };
  } else { $('intro').onpointerdown = null; $('intro').onclick = next; }
  $('introSkip').onclick = (e) => {
    e.stopPropagation();
    if (opening) { end(); introGo(); return; }
    const cur = L[i - 1];
    let j = i;
    if (cur && cur.sticky) {
      // inside a sticky chapter: to its last line; already on it, Skip moves on like a tap
      let last = i - 1; while (last + 1 < L.length && L[last + 1].sticky && !L[last + 1].ch) last++;
      j = last === i - 1 ? i : last;
    } else while (j < L.length && !L[j].ch) j++;
    if (j >= L.length) return end();
    i = j; next();
  };
  next();
}
// the opening's last line stays on screen (touch-through, under the HUD) while the countdown runs; GO takes it away.
// The line moves into its own layer (#introLast), so the story overlay itself is gone the moment the swim starts
function introUnder(end) {
  end();
  if (mode !== 'race' || !(countT > 0)) return;
  const ll = $('introLast'); ll.appendChild($('introTxt')); ll.classList.remove('hide');
}
function introUnderOff() {
  const ll = $('introLast'), tx = $('introTxt'); if (!ll || !tx || tx.parentNode !== ll) return;
  $('intro').insertBefore(tx, $('intro').firstChild); ll.classList.add('hide');
}
// a touch during the opening countdown (or the story) is a ready thumb: the count goes straight to GO
function countGoNow() { if (mode === 'race' && countT > 0 && !countFromPause) { countT = Math.min(countT, 0.001); return true; } return false; }
// the intro tap that sent the count to GO is still on the glass: the race ignores touches for 350 ms after it
let introGoAt = -1e9;
function introGo() { if (countGoNow()) introGoAt = performance.now(); }
// a story block as lines: the first starts a chapter; a sticky block (a finale) ends on a tap-only line that marks it seen
function chapter(lines, o = {}) {
  const out = lines.filter(Boolean).map((t, j) => ({ t, ch: j === 0, sticky: !!o.sticky }));
  if (out.length && o.seen) { const last = out[out.length - 1]; last.tap = true; last.onShow = () => { S[o.seen] = true; saveUI(); }; }
  return out;
}
// after a win: NEW GENERATION in 3 beats, then that generation's own little story (GEN_INTROS)
function genStory() {
  if (!(meta.gen >= 1) || (S.genIntroSeen | 0) >= meta.gen) return null;
  const bs = (meta.babies || []).filter((x) => x && !x.practice), b = bs[bs.length - 1]; if (!b) return null;
  const gf = (g) => (typeof C.genFactor === 'function' ? C.genFactor(g) : 1 + 0.25 * g);
  const fw = firstWord(b), head = ['NEW GENERATION'];
  head.push(`${b.name}${fw ? '. First words: ' + fw : ''}`);
  // the DNA multiplier jump is shown on the result screen, where the numbers live
  head.push(pickLine(GEN_UNLOCK_LINES) || 'A new generation!');
  // what the new generation changes in the tube (one line)
  const GS = K.GEN_STEP_LINES || {}, step = meta.gen === 1 ? GS.hazGen : meta.gen === 2 ? GS.chaseOn : GS.genFaster;
  if (step) head.push(step);
  const grew = `${b.name} grew up. Their Kevins are lining up.`;
  const out = chapter(head);
  // index 0 is generation 2 (the hero is generation 1). Act 2: generation 10 has its own intro (after the finale),
  // 11 to 18 add one clue each, 19 tells the whole story (once); from 20 the endless pool cycles
  const gn = meta.gen + 1, v = { heir: heirName() || b.name, grandad: bs.length >= 2 ? bs[bs.length - 2].name : 'Dad', gen: gn };
  // the win that made this generation: who Kevin beat at the egg, by how much, and which Kevin did it
  { const wm = lastResult && lastResult.reason === 'win' ? winMargin(lastResult) : null;
    v.beat = wm && wm.agent && wm.agent.boss ? first(wm.agent.boss.name) : nemesisOf() || 'Chad';
    v.margin = wm && Number.isFinite(wm.sec) ? wm.sec.toFixed(1) + ' s' : 'a whisker';
    v.kevin = 'Kevin #' + fmt(kevinN || 1); }
  const fl = (a) => (Array.isArray(a) ? a.map((l) => fillLine(l, v)) : []);
  const endless = (n) => (GEN_INTROS_ENDLESS.length ? GEN_INTROS_ENDLESS[n % GEN_INTROS_ENDLESS.length] : GEN_INTROS[GEN_INTROS.length - 1]);
  const finale = () => (!S.finaleSeen && FINALE_LINES.length ? chapter(FINALE_LINES, { sticky: true, seen: 'finaleSeen' }) : []);
  const G10 = K.GEN10_INTRO || [], CL = K.ACT2_CLUES || [], A2F = K.ACT2_FINALE || [];
  const G20 = Array.isArray(K.GEN20_INTRO) ? K.GEN20_INTRO : [], A3C = Array.isArray(K.ACT3_CHAPTERS) ? K.ACT3_CHAPTERS : [];
  const A2C = Array.isArray(K.ACT2_CHAPTERS) ? K.ACT2_CHAPTERS : [], C3 = Array.isArray(K.ACT3_CLUES) ? K.ACT3_CLUES : [], A3F = Array.isArray(K.ACT3_FINALE) ? K.ACT3_FINALE : [];
  const G30 = (Array.isArray(K.GEN30_EPILOGUE) ? K.GEN30_EPILOGUE : []).concat(Array.isArray(K.GEN30_INTRO) ? K.GEN30_INTRO : []);
  const A4C = Array.isArray(K.ACT4_CHAPTERS) ? K.ACT4_CHAPTERS : [], C4 = Array.isArray(K.ACT4_CLUES) ? K.ACT4_CLUES : [], A4F = Array.isArray(K.ACT4_FINALE) ? K.ACT4_FINALE : [];
  // the endless pool: from generation 40 when Act 4 is there, 30 when Act 3 is, else from 20 as before
  const e0 = A4F.length ? 40 : 30;
  const endlessAt = (g) => endless(A3F.length && g >= e0 ? (g - e0) % Math.max(1, GEN_INTROS_ENDLESS.length) : g >= 20 ? g - 20 : g - 11);
  // the museum wing for the endless intros: 1 for the first endless generation, +1 each one after
  v.wing = Math.max(1, gn - e0 + 1);
  const n0 = out.length;
  if (gn === 10) {
    // nine generations: the finale, once ever, then generation 10's own intro (alone if the finale was already seen)
    out.push(...finale());
    out.push(...chapter(G10.length ? fl(G10) : fl(GEN_INTROS[meta.gen - 1] || endless(0))));
  } else {
    let gi = GEN_INTROS[meta.gen - 1], a2 = false, a3 = false, a4 = false;
    if (!Array.isArray(gi) && gn >= 11) {
      if (gn === 19 && !S.act2Seen && A2F.length) { a2 = true; gi = null; }
      // Act 2's chapters (generations 11 to 18), each with its clue's punchline below
      else if (gn <= 18 && Array.isArray(A2C[gn - 11]) && A2C[gn - 11].length) gi = A2C[gn - 11];
      // Act 3's finale plays once, at generation 29
      else if (gn === 29 && !S.act3Seen && A3F.length) { a3 = true; gi = null; }
      // Act 3 opens at generation 20 (the family is one now), then one chapter a generation (21 to 28), each with its
      // clue's punchline below
      else if (gn === 20 && G20.length) gi = G20;
      else if (gn >= 21 && gn <= 28 && Array.isArray(A3C[gn - 21]) && A3C[gn - 21].length) gi = A3C[gn - 21];
      // Act 4: generation 30's epilogue and intro, one chapter a generation (31 to 38), the finale once at 39
      else if (gn === 30 && G30.length) gi = G30;
      else if (gn >= 31 && gn <= 38 && Array.isArray(A4C[gn - 31]) && A4C[gn - 31].length) gi = A4C[gn - 31];
      else if (gn === 39 && !S.act4Seen && A4F.length) { a4 = true; gi = null; }
      else gi = endlessAt(gn);
    }
    // a finale that was never seen (a save that jumped past generation 10) still plays first, once
    if (gn > 10) out.push(...finale());
    // the same rescue for Act 2's finale: a save past generation 19 that never saw it hears it before the endless chapter
    if (gn > 19 && S.finaleSeen && !S.act2Seen && A2F.length) out.push(...chapter(A2F.map((l) => fillLine(l, v)), { sticky: true, seen: 'act2Seen' }));
    const ch = fl(gi);
    if (gn >= 11 && gn <= 18) { const c = CL.find((x) => Array.isArray(x) && x[0] === gn); if (c) ch.push(fillLine(c[1], v)); }
    // Act 3's clues (generations 21 to 28) close their chapter
    if (gn >= 21 && gn <= 28) { const c = C3.find((x) => Array.isArray(x) && x[0] === gn); if (c) ch.push(fillLine(c[1], v)); }
    if (gn >= 31 && gn <= 38) { const c = C4.find((x) => Array.isArray(x) && x[0] === gn); if (c) ch.push(fillLine(c[1], v)); }
    out.push(...chapter(ch));
    if (a2) out.push(...chapter(A2F.map((l) => fillLine(l, v)), { sticky: true, seen: 'act2Seen' }));
    if (a3) out.push(...chapter(A3F.map((l) => fillLine(l, v)), { sticky: true, seen: 'act3Seen' }));
    if (a4) out.push(...chapter(A4F.map((l) => fillLine(l, v)), { sticky: true, seen: 'act4Seen' }));
  }
  // the head's 'grew up' beat only when no chapter follows it
  if (out.length === n0) out.push(...chapter([grew]).map((l) => Object.assign(l, { ch: false })));
  return out;
}
// a double tap on SWIM AGAIN (or SWIM and the daily) can never start two swims: 300 ms re-entry lock
let launchAt = -1e9;
function launch(opts) {
  const nowMs = performance.now(); if (nowMs - launchAt < 300) return; launchAt = nowMs;
  const gs = genStory();
  // the story counts as seen once it has played to the end: an app killed mid-story hears it again
  if (gs) { const g = meta.gen; intro(() => { S.genIntroSeen = g; saveUI(); start(opts); }, gs); }
  else start(opts);
}
// saves from before these flags: do not replay what the player has effectively seen
{
  const lb = meta.babies[meta.babies.length - 1];
  if (meta.gen > 0 && !S.genIntroSeen && lb && meta.runs > (lb.run | 0)) { S.genIntroSeen = meta.gen; saveUI(); }
  if (meta.runs > 1 && !S.revealSeen) { S.revealSeen = true; saveUI(); }
}
// ------------------------------------------------------------------ run
let runOpts = {};
function start(opts) {
  unlock(); A.on = true;
  runOpts = opts || {}; shopSwim = false;
  // the daily's music is seeded too: the same tube sounds the same for everyone today
  try { A.newRun(runOpts.daily && typeof C.dailySeed === 'function' ? C.dailySeed() : undefined); } catch (e) { /* optional */ }
  muffle(false); setTension(0);
  // the daily is hand steering only: a sticky sat-nav never burns it
  const o = { autopilot: meta.autopilot && lv(meta, 'gps') > 0 && !runOpts.daily };
  if (runOpts.daily && typeof C.dailySeed === 'function') o.seed = C.dailySeed();
  // the rematch rival stays here (core does not read it)
  const rmK = Number.isInteger(runOpts.rematch) && RIVALS[runOpts.rematch] ? runOpts.rematch : -1;
  race = new Race(meta, Math.random, o);
  flickNear = 0; thinkPend = null; thinkCalmAt = -1; thinkAt = -99; thinkPassed = false; thinkLowN = 0; thinkLow = false; thinkScanAt = 0;
  rematch = rmK >= 0 ? { k: rmK, name: first(RIVALS[rmK].name), slam: false, paid: false } : null;
  // the swim is open until it ends: an app killed mid-tube is counted as abandoned on the next boot (systems)
  if (typeof C.openRun === 'function') { try { C.openRun(meta, race); } catch (e) { /* optional */ } save(); }
  progAt = 0; progSaveAt = clock;
  R.camY = null; R.parts = []; R.pops = []; if (R.rings) R.rings = [];
  kevinN = kevinNo(); firstSwim = meta.runs === 0; raceT0 = clock;
  shownRank = race.rank; prevBest = meta.best; prevBestCombo = meta.bestCombo || 0;
  stopT = 0; hitHold = null; trickStreakPend = null; pausedStreak = null; freezeT = 0; audSlow = false; audSlowT = 0; pauseCountRest = 0; slowT = 0; timeScale = 1; dashBuf = 0; heartAcc = 0; lastShout = 0; lastSlowAt = -99; lastBubble = -99;
  passedOnce = new Set(); vsSlamDone = false; forkSmellDone = false; rivalIntro = RIVALS.map(() => false); eggClaimed = false; eggOn = false; rivalF = 0; rivalK = -1; drillN = 0; quip = { zi: -1, done: 0 };
  nemAtStart = nemesisOf();
  simAcc = 0; coreHas = {}; shoveAt = {}; bonkN = 0; lowDone = false; lowRingT = 0; hazT = 0; hazSlowT = 0; hazAt = -99; crawlOn = false; threatSaid = false; leadSaid = 0;
  tut = null; onbHeld = []; lessonDna = 0; lastInputAt = clock; idleSeenIn = clock; idleAcc = 0; idleN = 0; idleAt = -99; dashAskStep = -1; firstPuff = false; hzQ = []; slowLog = []; flickRingT = 0; flickAt = -99; dashReadyAt = -99; dashCdPrev = 0; R.firstRun = firstSwim; frenzyCoachPend = false; clearInput(); resetHud(); draftK = -1; draftT = 0; draftSaid = new Set(); draftZone = -1;
  crawlN = 0; crawlAt = -99; nearAt = []; gas35Done = false; fruit55Done = false; cardYield = false; comboMusicT = 0; featPend = null; comboWordPick = null; kevLeadFx = false; kindPopT = -9; fruitN = 0; paceSaid = false; paceV = null; vEma = 0; tierTagSaid = false;
  lessonEnd(); cashLast = -99; wallSide = 0; goalHit = false; hazPend = null;
  overAt = -1; finHold = null; birthOn = null; endPot = null; lastDashAt = -99; frozenRecent = 0; finPopUntil = -99; laterQ = []; comboSeenAt = -1; comboIntroDone = false; threatOnB = false; intenseOn = false;
  synHoldAt = -1; coachWaitQ = []; perkWait = []; drillTapLog = []; drillCounted = 0; gaspDone = false; photoDone = false; tellOn = 0; lastDrillTapId.clear(); dnaHudV = -1;
  tellK = -1; tellMove = ''; tellPipN = -1; duelLog = {}; ctkClear(); eggSaidAt = -99; eggSayPend = null; eggVoiceHold = false; duelUp(false);
  frameErrs = 0; failRun = 0; zfPend = null; coPend = null; coDefer = null; popChain = 0; popChainAt = -99; ftShow = null; frenzyDescPend = '';
  setC(document.body, 'threat', false); setC(document.body, 'intense', false); setC($('dnaHud'), 'hide', true);
  R.teach = meta.runs < 3;
  // the OS back swipe pauses the swim instead of leaving the page
  pushGuard();
  mode = 'race'; show(null); hud(true);
  // the very first swim: a quick 2, 1, GO (0.6 s a number)
  // the count rides the music: one number a beat (A.countBeat, 60 / bpm), 0.6 s a number without it
  countUnit = 0.6; try { if (typeof A.countBeat === 'function') { const b = +A.countBeat(); if (Number.isFinite(b) && b > 0.25 && b < 1.2) countUnit = b; } } catch (e) { /* default */ }
  countT = runOpts.countdown ? (firstSwim ? countUnit : 3 * countUnit) : 0; goT = 0; lastCount = 0; ghostT = 0;
  govHold(3); setIntensity();
  R.nemesis = nemAtStart; measureHud();
  // the first swim keeps the GO frame clean: no threat line (and no threat banner later), one short caption
  const tk = firstSwim ? null : threatName();
  // the bounty goes on the zone 1 banner; when it takes the line, the threat gets its own banner when it shows up
  const gl = firstSwim ? '' : nextGoalLine(meta.goal);
  const zo = { t: ZONES[0].name, z: `${kevinLabel()} · ${race.daily != null ? 'DAILY SWIM · ' : ''}ZONE 1`, c: gl ? '🎯 ' + gl : tk ? threatLine(tk) : null, sec: gl || tk ? 2.6 : 1.8 };
  // no bounty and no threat to name: say what this generation's field is like (systems: C.freshGenActive, C.fieldInfo)
  if (!zo.c && !firstSwim) { const hl = genHelpLine(); if (hl) { zo.c = hl; zo.sec = 2.4; } }
  // a pep talk banked by the last swim (race.pepPct): on the start banner, or on the coach strip a beat later
  { const pp = Math.round(+race.pepPct || 0);
    if (pp > 0 && !firstSwim) { const pl = `🛟 Pep talk: +${pp}% boost this swim`; if (!zo.c) { zo.c = pl; zo.sec = 2.4; } else later(3, () => coach(pl, 2.4, 1)); } }
  // swim 1: the zone banner waits for GO (+0.4 s), so the countdown and the ghost finger have the screen to themselves
  countFromPause = false; launchCo = null; launchPend = false; tutQ = []; famSaid = false; tapLog = []; tapHintSaid = false; stillNudgeN = 0; bestMarkY = 0; curOn = false;
  // swim 1: no zone banner at all; the countdown, the steer card and the ghost finger have the screen
  if (!firstSwim) callout('zone', zo);
  // BUY + SWIM: what the new habit does, a short banner after the zone's
  if (buySwimNote) { const bn = buySwimNote; buySwimNote = null; later(firstSwim ? 0.5 : 2.2, () => callout('event', { t: bn.t, c: bn.c, col: '#7dffb0', sec: 1.5 })); }
  // a perk unlocked in the shop: its 1.2 s banner on this launch
  if (S.perkNew) { const T = (K.HABIT_PERK_TEXT || {})[S.perkNew]; S.perkNew = ''; saveUI(); if (T && T.name) later(firstSwim ? 0.8 : 3.8, () => callout('event', { t: 'PERK: ' + T.name.toUpperCase(), c: T.desc || '', col: '#ffd75c', sec: 1.2 })); }
  if ((tk && !gl) || firstSwim) threatSaid = true;
  goalPill();
  const tired = !firstSwim && race.daily == null && (meta.raceLosses | 0) > 0;
  const heirL = !firstSwim && race.daily == null && (meta.gen | 0) >= 1 && kevinN === 1 ? rivalHeirLine() : '';
  // swim 1: the minimap pips, the name tags and the distance text wait until the lesson is over
  setC(document.body, 'tutHud', false); setC(document.body, 'hudIn', false); setC(document.body, 'noTick', false);
  // swim 1 shows no pot, gap, recipe chips, multiplier or CASH; swim 2 keeps the pot and CASH back until the cash lesson
  // body.swim1: every #tut card sits under the HUD (index.html), one place to look
  setC(document.body, 'swim1', firstSwim);
  setC(document.body, 'hud1', firstSwim); setC(document.body, 'hud2', meta.runs === 1 && !S.cashDone && !(S.cashN | 0));
  dashN = 0; gasBurn = 0; lowGasSaid = false; lowGasRingT = 0; steveSorrySaid = false; duelTellUntil = {}; duelAt = {}; tellSide = 0; tellCol = '';
  trickTease = null; trickFlash = null;
  headT = 0; headV = -1; headOn = false; setC(H.head, 'hide', true); setC(H.head, 'low', false);
  // Coach's look grows with the story (clues heard, the finale, Act 2) and he escorts generation 9
  { const nc = (S.clues || []).length;
    try { R.coachStage = (meta.gen | 0) >= 10 ? 4 : S.finaleSeen ? 3 : nc >= 4 ? 2 : nc >= 2 ? 1 : 0; R.coachEscort = (meta.gen | 0) === 8; } catch (e) { /* optional */ } }
  // nemesis rival pip: its name tag stays even where the others hide (landscape)
  for (let k = 0; k < RIVALS.length; k++) setC(H.rv[k], 'nem', !!nemAtStart && first(RIVALS[k].name) === nemAtStart);
  if (!S.tutDone && !race.autopilot) {
    tutStart();
    // swim 1: the +places ticker waits until Kevin has steered
    if (firstSwim) { setC(document.body, 'tutHud', true); setC(document.body, 'noTick', true); }
    // the first swim: no launch line, the steering card and the ghost finger say it all
    // the ghost finger starts at GO and loops until Kevin has steered 120 px
    if (firstSwim) ghostT = 1e9;
    else coach(zoneCoach('launch'), 4.5, 1);
  }
  else if (race.autopilot) hint('Autopilot is ON: it keeps 40% of the DNA. Tap DASH if you like.', 4, 1);
  // the named rivals were eased off after a loss to them: say so, it is a reason to go again (it wins over the early hint)
  else if (tired) coach(K.RIVALS_TIRED || 'The big names look tired today. Pounce!', 3.4, 1, true);
  // the first swim of a new generation: a rival family has a new heir too
  else if (heirL) coach(heirL, 3.4, 1, true);
  // the tube was eased after early deaths (race.rescuePct): Coach says so, warmly (K.RESCUE_LINES)
  else if (+race.rescuePct > 0 && Array.isArray(K.RESCUE_LINES) && K.RESCUE_LINES.length && !firstSwim) coach(pickLine(K.RESCUE_LINES), 3, 1, true);
  else if (meta.runs < 3) hint(touchUsed ? K.START_HINT || 'Drag to steer. Tap DASH to zoom.' : K.START_HINT_KEYS || K.START_HINT || 'Arrows steer. SPACE to zoom.', 4, 1);
  else if (!familyCoach(ZONES[0])) coach(zoneCoach('launch'), 3);
  startBeats();
  // the tube remembers: your best distance and where the last Kevin fell (R.marks)
  setMarks();
  // started in a tab that went to the background meanwhile: wait on the pause card
  if (document.hidden) pause();
}

// one-time beats on the start, hzNew style (2.4 s Coach lines, a beat apart): the daily's missing sat-nav, the end of
// the rookie swims and a new hazard step from experience (systems: C.normRunsOf, C.ROOKIE_TAPER, C.hzCareer)
function startBeats() {
  if (firstSwim || !race || race.demo) return;
  const GS = K.GEN_STEP_LINES || {}, beats = [];
  if (runOpts.daily && !S.autoDailySeen && lv(meta, 'gps') > 0) {
    beats.push(pickLine(K.AUTOPILOT_DAILY_LINES) || 'No autopilot on the daily. Your tail, your medal.'); S.autoDailySeen = true;
  }
  if (!runOpts.daily && !S.rookieEndSeen && typeof C.normRunsOf === 'function' && Array.isArray(C.ROOKIE_TAPER) && C.normRunsOf(meta) === C.ROOKIE_TAPER.length) {
    S.rookieEndSeen = true; if (GS.rookieEnd) beats.push(GS.rookieEnd);
  }
  if (!runOpts.daily && typeof C.hzCareer === 'function') {
    const hz = C.hzCareer(meta) | 0;
    if (hz > (S.hzCareerSeen | 0)) { S.hzCareerSeen = hz; if (GS.hazGen) beats.push(GS.hazGen); }
  }
  if (!beats.length) return;
  saveUI();
  beats.forEach((l, i) => later(1.1 + 2.6 * i, () => coach(l, 2.4, 2, true)));
}
// the family remembers: on a zone's first entry (from generation 2, 1 in 3, once a swim) Coach tells a story about an
// earlier family swimmer ({who}) and the grown-up heir ({heir}) in place of his zone line
let famSaid = false;
function familyCoach(z) {
  if (famSaid || !z || (meta.gen | 0) < 1 || firstSwim || !race || race.demo || Math.random() >= 1 / 3) return false;
  const pool = (K.FAMILY_ZONE_LINES || {})[z.id]; if (!Array.isArray(pool) || !pool.length) return false;
  const heir = heirName(), bs = (meta.babies || []).filter((b) => b && !b.practice && b.name && b.name !== heir);
  const who = bs.length ? bs[Math.floor(Math.random() * bs.length)].name : 'Dad';
  famSaid = true;
  return coach(fillLine(pickLine(pool), { who, heir: heir || 'Kevin' }), 3.2, 1);
}
// the first swim of a new generation: one rival family's new heir (K.RIVAL_HEIR_LINES, {name} = 'Brock Jr.', 'Brock III')
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
function rivalHeirLine() {
  // the rival Kevin beat at the egg (the last win's runner-up), else the nemesis: their heir holds a grudge
  // (K.RIVAL_HEIR_GRUDGE[first name], {name}); a random family is only the fallback
  { const g = meta.gen | 0, wm = lastResult && lastResult.reason === 'win' ? winMargin(lastResult) : null;
    const nm = wm && wm.agent && wm.agent.boss ? first(wm.agent.boss.name) : nemesisOf();
    const pool = nm ? byFirst(K.RIVAL_HEIR_GRUDGE || {}, nm) : null;
    if (Array.isArray(pool) && pool.length) return fillLine(pickLine(pool), { name: `${nm} ${g <= 1 ? 'Jr.' : ROMAN[g + 1] || 'the ' + (g + 1) + 'th'}` }); }
  // after Act 2's finale the rival heirs know they are family (K.RIVAL_HEIR_LINES_KIN, when content has it)
  const kin = S.act2Seen && K.RIVAL_HEIR_LINES_KIN && typeof K.RIVAL_HEIR_LINES_KIN === 'object' ? K.RIVAL_HEIR_LINES_KIN : null;
  const T = kin || K.RIVAL_HEIR_LINES || {}, ks = RIVALS.map((r, k) => k).filter((k) => Array.isArray(byFirst(T, RIVALS[k].name)) && byFirst(T, RIVALS[k].name).length);
  if (!ks.length) return '';
  const k = ks[Math.floor(Math.random() * ks.length)], g = meta.gen | 0;
  const name = `${first(RIVALS[k].name)} ${g <= 1 ? 'Jr.' : ROMAN[g + 1] || 'the ' + (g + 1) + 'th'}`;
  return fillLine(pickLine(byFirst(T, RIVALS[k].name)), { name });
}
// R.marks: your best distance and where the last Kevin fell (none under 3% of the tube; the grave not within 400 px of BEST)
let bestMarkY = 0;
function setMarks() {
  const m = [], lo = RACE_LEN * 0.03, by = clamp(+S.bestProg || 0, 0, 1) * RACE_LEN, gy = +S.lastDeathY || 0;
  if (by >= lo) m.push({ y: by, kind: 'best', label: 'BEST' });
  if (gy >= lo && kevinN > 1 && !(by >= lo && Math.abs(gy - by) < 400)) m.push({ y: gy, kind: 'grave', label: 'KEVIN #' + fmt(kevinN - 1) });
  bestMarkY = by >= lo ? by : 0;
  try { R.marks = m; } catch (e) { /* optional */ }
}
// a touch player tapping (3 still taps in 2.5 s) instead of dragging: once a swim, the hint and the ghost finger
let tapLog = [], tapHintSaid = false, stillNudgeN = 0, downSeq = 0;
function stillTap(now) {
  if (tapHintSaid || !race || race.demo || !touchUsed || mode !== 'race') return;
  // a tap already nudges Kevin (stillNudge): the hint waits until 4 nudges have shown that tapping is all this thumb does
  if (stillNudgeN < 4) return;
  tapLog = tapLog.filter((t) => now - t < 2500); tapLog.push(now);
  // swim 1 says it after 2 (a double tap there is blocked until the DASH card: it lands here)
  if (tapLog.length < (firstSwim ? 2 : 3)) return;
  tapHintSaid = true; tapLog = [];
  coach(K.TAP_STEER_HINT || 'Drag, do not tap! Slide your thumb left and right.', 2.6, 2, true);
  ghostT = Math.max(ghostT, 1.6);
}
// a still tap with no second tap (DBL_GAP_MS ran out): Kevin hops 55 world px toward the tapped side, clamped to the
// band, with the edge tick. Tapping players still get somewhere
function stillNudge(clientX) {
  if (!race || race.demo || race.drill || race.over || race.pending || race.autopilot || drag || mode !== 'race' || countT > 0 || playBlocked()) return;
  const p = race.p, c = mid(p.y), b = band(p.y, p.side), r = cv.getBoundingClientRect(); if (!r.width) return;
  const kx = r.left + p.x * (r.width / VIEW_W), side = clientX < kx ? -1 : 1;
  const base = holdOff != null && Number.isFinite(holdOff) ? holdOff : p.x - c;
  const tx = clamp(c + base + 55 * side, b.l, b.r);
  holdOff = tx - c; stillNudgeN++; lastInputAt = clock;
  sfx('edge', side); buzz(5); tutSteer(Math.abs(tx - c - base) * side);
}
// the start card's field line: a fresh family (rivals ease off) or this generation's field numbers
function genHelpLine() {
  const HL = K.RESULT_HELP_LINES || {};
  try {
    if (typeof C.freshGenActive === 'function' && HL.freshGen && C.freshGenActive(meta)) return HL.freshGen;
    if (typeof C.fieldInfo === 'function' && HL.genField && (meta.gen | 0) >= 1) {
      const fi = C.fieldInfo(meta); if (!fi || typeof fi !== 'object') return '';
      const sp = +(fi.speedPct ?? fi.speed), fr = +(fi.fruit ?? fi.fruitMul ?? fi.fruitMult);
      if (!Number.isFinite(sp) || !Number.isFinite(fr)) return '';
      const hz = +fi.hz, hzT = Number.isFinite(hz) && hz > 0 ? ` · hazards +${Math.round(hz)}` : '';
      return fillLine(HL.genField, { gen: (meta.gen | 0) + 1, speed: Math.round(sp), fruit: +fr.toFixed(2) }) + hzT;
    }
  } catch (e) { /* optional */ }
  return '';
}
// the swim-1 zone banner, held until GO
let launchCo = null;
// launchPend: the swim-1 banner is promised but not up yet (the tutorial card and the ghost finger wait for it)
let launchPend = false;
function goNow() {
  if (!launchCo) return;
  const o = launchCo; launchCo = null;
  later(0.4, () => { launchPend = false; if (race && !race.over && !race.demo) callout('zone', o); });
}
// swim 1's GO frame: the zone banner first, then the lesson
const launchBusy = () => firstSwim && (launchPend || bannerUp() || synWait.some((o) => o.kind === 'zone'));
// Coach Gonad's zone line: the plain one for the first 3 swims, then a rotating pool that knows Kevin's number
function zoneCoach(id) {
  if (meta.runs >= 3 && Array.isArray(COACH_SHORT_MORE[id]) && COACH_SHORT_MORE[id].length) {
    const l = fillLine(pickLine(COACH_SHORT_MORE[id]), { n: fmt(kevinNo()) });
    if (l) return l;
  }
  return COACH_SHORT[id] || '';
}
// ONE text channel in the race: the coach strip under the HUD. Higher priority wins while it shows
// (2: tutorial, rivals, rescues; 1: start, events, forks; 0: Coach Gonad's chatter).
let coachT = 0, coachPri = -1, coachLong = false, coachHint = false;
// a #tut card (a tutorial step or a lesson) is up: only priority 2 lines may talk over it
const tutCardUp = () => (!!tut && tut.on && tut.i >= 0) || !!lesson;
// two text surfaces at most: while a full banner is up a low line (pri < 2) waits in ONE slot (coPend, the newest wins)
// and plays when the banner goes, if it is under 3 s old. A line over 44 characters only shows in a calm moment (combo
// under 5, no FRENZY, no threat ahead); otherwise the newest one waits for the next calm moment (coDefer, coachCalmTick)
let coPend = null, coDefer = null;
const coachCalm = () => !race || race.demo || mode !== 'race' || (race.p.combo < 5 && !(race.p.frenzyT > 0) && !threatOnB);
let coachZi = -1;
// R.rivalEaten (render.js, one frame): a named rival just went down a Big Macro's throat. Its K.RIVAL_EATEN line, once a rival
function rivalEatenLine(k) {
  if (!race || mode !== 'race' || race.over || !K.RIVAL_EATEN) return;
  const r = typeof k === 'number' ? RIVALS[k] : RIVALS.find((q) => first(q.name) === k);
  if (!r) return;
  const pool = byFirst(K.RIVAL_EATEN, r.name);
  if (Array.isArray(pool) && pool.length) coach(pickLine(pool), 2.6, 1);
}
function coach(t, sec = 3.2, pri = 0, force = false) {
  if (!t) return false;
  // a coach line holds 4.5 s at most
  sec = Math.min(sec, 4.5);
  if (!force && pri < 2 && tutCardUp()) return false;
  // the screen is busy (body.intense): small talk waits for a calm moment, and then says it in 2 s at most
  // (a threat ahead counts as busy too)
  if (!force && pri < 2 && (intenseOn || threatOnB) && mode === 'race') { coDefer = { t, sec: Math.min(sec, 2.0), pri, force, at: clock, zi: zoneNow() }; return false; }
  if (pri < 2 && bannerUp() && !$('banner').classList.contains('compact')) { coPend = { t, sec, pri, force, at: clock, zi: zoneNow() }; return false; }
  if (String(t).length > 44 && !coachCalm()) { coDefer = { t, sec, pri, force, at: clock, zi: zoneNow() }; return false; }
  if (coachT > 0 && pri < coachPri) return false;
  const c = $('coach'); setT(c, chadFix(t)); c.classList.remove('two'); c.classList.add('on'); coachT = sec; coachPri = pri; coachLong = false; coachHint = false; coachZi = zoneNow();
  // a line too long for one line: two smaller lines (CSS clamps it), and 0.8 s more to read it
  if (c.scrollWidth > c.clientWidth + 1) { c.classList.add('two'); coachT += 0.8; }
  return true;
}
// a hint: the coach strip for 2.5 s of real play at most (its clock waits through the countdown and a hit-stop)
function hint(t, sec = 3, pri = 0) {
  if (eggOn && pri < 2) return false;
  if (tut && tut.on && pri < 2) return false;
  if (!coach(t, Math.min(2.5, sec), pri)) return false;
  coachHint = true; return true;
}
function coachClear() { coachT = 0; coachPri = -1; coachLong = false; coachHint = false; $('coach').classList.remove('on'); }
// swim 1: one text at a time. While the coach strip talks, the #tut card steps aside (its clock waits), and comes back
// with its timer reset once the strip is quiet. Run once a frame, after every tick that may show either of them
let cardYield = false;
function cardYieldTick() {
  const el = $('tut'), co = $('coach').classList.contains('on');
  if (!firstSwim || mode !== 'race' || !race || race.over) { if (cardYield) { cardYield = false; cardBack(false); } return; }
  if (co && el.classList.contains('on')) { cardYield = true; el.classList.remove('on'); return; }
  if (cardYield && !co) { cardYield = false; cardBack(true); }
}
function cardBack(reset) {
  const live = (tut && tut.on && (tut.i >= 0 || !!tut.inter)) || !!lesson;
  if (!live) return;
  if (reset) {
    if (lesson) lesson.t = lesson.sec;
    else if (tut.inter) tut.inter.t = tut.inter.sec;
    else tut.t = 0;
  }
  $('tut').classList.add('on');
}
// a long line that waited for a calm moment goes out once the strip is free (dropped after 10 s: it is stale by then)
function coachCalmTick() {
  if (!coDefer) return;
  if (clock - coDefer.at > 10) { coDefer = null; return; }
  if (coachT > 0 || bannerUp() || !coachCalm() || intenseOn) return;
  const d = coDefer; coDefer = null; coach(d.t, d.pri < 2 ? Math.min(d.sec, 2.0) : d.sec, d.pri, d.force);
}

// Kevin's number counts from the start of this generation when there is an heir
// the heir is the newest real (not practice) baby: core's meta.heir / meta.genRunStart when it keeps them, else read off the album
const lastHeir = () => { const bs = meta.babies || []; for (let i = bs.length - 1; i >= 0; i--) if (bs[i] && !bs[i].practice) return bs[i]; return null; };
const heirName = () => { const h = meta.heir != null && meta.heir !== '' ? meta.heir : lastHeir(); return h ? String(typeof h === 'object' ? h.name || '' : h) : ''; };
function kevinNo() {
  const lh = lastHeir(), gs = Number.isFinite(+meta.genRunStart) && meta.genRunStart != null ? +meta.genRunStart : lh ? lh.run | 0 : 0;
  return Math.max(1, meta.runs - (heirName() && gs <= meta.runs ? gs : 0) + 1);
}
// the heir's last word is the family name: KEVIN #3 · TEAM PICKLE
// the family's name: taken once from the first baby's last word (S.famName), kept for good
function famName() {
  if (S.famName) return S.famName;
  const b0 = (meta.babies || []).find((b) => b && b.name && !b.practice) || (meta.babies || [])[0];
  const w = b0 && b0.name ? String(b0.name).trim().split(/\s+/).pop().replace(/[^\p{L}\p{N}'-]/gu, '') : '';
  if (w) { S.famName = w; saveUI(); }
  return w;
}
function kevinLabel() {
  const h = heirName().trim(), fam = famName() || (h ? h.split(/\s+/).pop().replace(/[^\p{L}\p{N}'-]/gu, '') : '');
  return `KEVIN #${fmt(kevinN)}` + (fam ? ` · TEAM ${fam.toUpperCase()}` : '');
}
// the rival core picked as this swim's threat (race.threatK), named in the zone 1 banner
let threatSaid = false;
function threatName() { const k = race && Number.isInteger(race.threatK) ? race.threatK : -1; return k >= 0 && RIVALS[k] ? RIVALS[k].name : null; }
function threatLine(name) { const nem = nemesisOf(); return nem === first(name) ? `Your nemesis ${first(name)} is in this swim.` : `Watch out: ${first(name)} is in this swim.`; }

// ------------------------------------------------------------------ callouts: ONE queue for banners and milestones
const PRI = { drill: 5, synergy: 4, eggClaim: 4, goal: 3, event: 3, zone: 2, milestone: 1 };
let coCur = null, coQ = [], bannerBoxL = null, hudBottomL = null, dashAvoidL = null;
// the zone a line belongs to: a banner or a coach line from an earlier zone never shows (or stays) in a later one
const zoneNow = () => (race && !race.demo ? race.zoneReached | 0 : -1);
function callout(kind, o) {
  o.kind = kind; o.pri = PRI[kind] || 2; o.at = clock; o.sec = o.sec || (o.c ? 2.2 : 1.6);
  if (o.zi == null) o.zi = zoneNow();
  // at the egg the duel panel holds the call: a banner it already says is skipped, the rest go in 1.0 s
  if ((kind === 'drill' || kind === 'eggClaim') && race && !race.over && !DU.ui.classList.contains('hide')) {
    if (o.duHas) return;
    o.sec = Math.min(o.sec, 1.0);
  }
  // a MASHUP, a zone or a goal banner waits (2.5 s at most) until nothing hostile is within 700 px ahead: never a banner
  // over a threat (it is queued, not faded). One that still has to show over one goes up under the HUD (.top), below the
  // threat chevrons (.clr)
  if (HOLD_KINDS.has(kind) && !o.held && race && !race.demo && mode === 'race' && (hostileAhead(700) || (kind === 'synergy' && forkNear()))) { o.held = true; synWait.push(o); if (synHoldAt < 0) synHoldAt = clock; return; }
  // a compact MASHUP never wipes a coach line mid-read: it waits for the coach strip to finish (4 s at most)
  if (kind === 'synergy' && o.compact && !o.coWaited && coachT > 0 && race && !race.demo && mode === 'race') { o.coWaited = true; coachWaitQ.push(o); return; }
  // a rival's tell at the egg is live: nothing else takes the centre, the banner waits (2 s at most, coQ)
  if (race && race.drill && !race.over && clock < tellOn && !o.duHas) { coQ.push(o); coQ.sort((a, b) => b.pri - a.pri || a.at - b.at); if (coQ.length > 5) coQ.length = 5; return; }
  if (!coCur) return coShow(o);
  if (o.pri > coCur.pri && coCur.shown > 0.35) { coEnd(); return coShow(o); }
  coQ.push(o); coQ.sort((a, b) => b.pri - a.pri || a.at - b.at); if (coQ.length > 5) coQ.length = 5;
}
function coShow(o) {
  coCur = o; o.shown = 0; o.left = o.sec;
  if (o.kind === 'milestone') {
    const rr = $('rankRow'); setT($('rankLbl'), o.t); rr.style.setProperty('--mc', o.col || '#ffd75c');
    rr.classList.remove('ms'); void rr.offsetWidth; rr.classList.add('ms'); o.left = Math.min(o.sec, 1.4); H.tick._res = null;
    return;
  }
  const b = $('banner');
  // a new MASHUP banner wipes the coach strip: one text at a time
  if (o.kind === 'synergy') coachClear();
  // mid-combo, in FRENZY or at the egg nobody reads: one short line, no kicker, no caption, gone in 1.4 s.
  // In the egg zone, at a drill or a claim the banner also moves up under the HUD with no box, so Kevin stays clear
  const p = race && race.p, eggish = !!p && !!race && (zoneIndex(p.y) === C.EGG_I || !!race.drill || eggOn);
  // (the fork's PICK A TUBE moment counts as busy too: short line, no caption)
  const fk = !!p && forkNear();
  const intense = !!p && (p.combo >= 10 || p.frenzyT > 0 || eggish || fk);
  // a threat ahead: the banner goes up under the HUD, never down onto Kevin, and below the threat chevrons (.clr)
  let top = eggish || !!o.mustTop || threatOnB;
  b.classList.toggle('top', top);
  setC(b, 'clr', !eggish && (threatOnB || !!o.mustTop || o.kind === 'zone'));
  // a busy screen (body.intense): a zone banner is one compact line under the HUD, gone in 1.2 s
  if (o.kind === 'zone' && intenseOn) { o.compact = true; o.left = Math.min(o.left, 1.2); }
  setC(b, 'kclr', false);
  // compact: one line under the HUD, no kicker, no caption (a MASHUP mid-swim)
  setC(b, 'compact', !!o.compact);
  if (o.compact) { top = true; b.classList.add('top'); }
  // a MASHUP keeps its one-line rule even when compact (banner.syn: 13 px, two lines at most)
  const t = intense && o.short ? o.short : o.t, c = o.synC ? o.c || '' : intense || o.compact ? '' : o.short || o.c || '';
  setC(b, 'syn', !!o.synC); b.style.top = '';
  if (intense) o.left = Math.min(o.left, 1.4);
  b.querySelector('.t').textContent = t; b.querySelector('.z').textContent = (intense || eggOn) && !o.zKeep ? '' : o.z || ''; b.querySelector('.c').textContent = c;
  b.querySelector('.c').style.display = c ? '' : 'none';
  b.classList.toggle('intense', intense);
  b.classList.toggle('red', o.kind === 'eggClaim' || !!o.red); b.style.setProperty('--bc', o.col || '#ff5c7a');
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  // a banner is up: the lesson card dims and drops its second line (two text surfaces at most)
  setC(document.body, 'bnr', true);
  // a MASHUP released at the fork: when the PICK A TUBE sign is in the upper band, the line drops low (above the combo
  // strip) so it never sits on the sign
  setC(b, 'low', false);
  if ((o.forkClr || fk) && R.camY != null && C.FORK_Y0) {
    const kk = cv.clientWidth / VIEW_W, sy = R.sy(C.FORK_Y0 - 500) * kk + cv.offsetTop, by = b.offsetTop;
    if (sy > by - 110 && sy < by + 90) { top = false; b.classList.remove('top'); setC(b, 'clr', false); setC(b, 'low', true); }
  }
  // never within 90 px of Kevin, whatever slot it took (.low included): a banner that would cover him tries the other
  // slot; when both would, it is one compact line under the HUD for 1.2 s at most (the caption goes to the coach queue)
  const onKevin = () => bannerOnKevin(b);
  if (onKevin()) {
    if (b.classList.contains('low')) { setC(b, 'low', false); top = true; b.classList.add('top'); }
    else if (!top) { top = true; b.classList.add('top'); }
    if (onKevin()) {
      const cap = b.querySelector('.c').textContent;
      setC(b, 'low', false); b.classList.add('top', 'compact', 'kclr'); setC(b, 'clr', false);
      b.querySelector('.z').textContent = ''; b.querySelector('.c').textContent = ''; b.querySelector('.c').style.display = 'none';
      o.left = Math.min(o.left, 1.2);
      if (cap && o.kind !== 'synergy') later(1.3, () => coach(cap, 2.2, 0));
    }
  }
  // where the banner is, for the renderer (logical units): canvas signs and labels keep out of its band
  bannerMeasure();
  // the full rule follows on the coach strip, but only when there is a moment to read it
  if (o.long && o.long !== c && p && p.combo < 10 && !eggOn) o.coachLong = true;
}
// the banner's box would sit within 90 px of Kevin on screen (portrait; landscape keeps banners in the middle column)
function bannerOnKevin(b) {
  const p = race && race.p, k = cv.clientWidth / VIEW_W;
  if (!p || race.demo || R.camY == null || !(k > 0) || landscape()) return false;
  const ky = R.sy(p.y) * k + cv.offsetTop, y0 = b.offsetTop, y1 = y0 + b.offsetHeight;
  return y1 > ky - 90 && y0 < ky + 90;
}
// every frame a banner is up: one that Kevin swam into (the camera moved, the banner grew) becomes one compact line under
// the HUD (top compact kclr), its caption going to the coach queue. Runs before forkClearTick (and its .low early return)
function bannerKevinTick() {
  if (!coCur || coCur.kind === 'milestone' || !race || race.demo || race.over) return;
  const b = $('banner'); if (!b.classList.contains('on') || b.classList.contains('kclr')) return;
  if (!bannerOnKevin(b)) return;
  const cap = b.querySelector('.c').textContent;
  setC(b, 'low', false); b.classList.add('top', 'compact', 'kclr'); setC(b, 'clr', false); b.style.top = '';
  b.querySelector('.z').textContent = ''; b.querySelector('.c').textContent = ''; b.querySelector('.c').style.display = 'none';
  coCur.left = Math.min(coCur.left, 1.2);
  if (cap && coCur.kind !== 'synergy') later(1.3, () => coach(cap, 2.2, 0));
  bannerMeasure(false);
}
// the fork's PICK A TUBE plate is pinned in screen space (render.js drawForkSign: y = max(padW + 140, hudB() + 12 cssK
// + 15) while its spot in the world is on screen). Every frame a banner is up: one within 24 CSS px of the plate drops
// low, or, when low would cover Kevin, becomes one compact line (its caption to the coach queue)
function forkClearTick() {
  if (!race || race.demo || R.camY == null || !C.FORK_Y0 || landscape()) return;
  const fy = R.sy(C.FORK_Y0 - 500); if (!(fy > -60 && fy < (R.H || 900) + 60)) return;
  const b = $('banner'); if (b.classList.contains('low')) return;
  const kk = cv.clientWidth / VIEW_W; if (!(kk > 0)) return;
  const py = Math.max((R.padW || 0) + 140, (typeof R.hudB === 'function' ? R.hudB() : 110) + 12 * (R.cssK || 1) + 15) * kk + cv.offsetTop;
  const ph = 20 * kk, near = (el) => { const y0 = el.offsetTop, y1 = y0 + el.offsetHeight; return y1 > py - ph - 24 && y0 < py + ph + 24; };
  if (!near(b)) return;
  const p = race.p, onK = () => { const ky = R.sy(p.y) * kk + cv.offsetTop, y0 = b.offsetTop, y1 = y0 + b.offsetHeight; return y1 > ky - 90 && y0 < ky + 90; };
  b.classList.remove('top', 'kclr'); setC(b, 'clr', false); setC(b, 'low', true); b.style.top = '';
  if (onK()) {
    setC(b, 'low', false);
    if (!b.classList.contains('compact')) {
      const cap = b.querySelector('.c').textContent;
      b.classList.add('top', 'compact'); b.querySelector('.z').textContent = ''; b.querySelector('.c').textContent = ''; b.querySelector('.c').style.display = 'none';
      if (coCur) coCur.left = Math.min(coCur.left, 1.2);
      if (cap && coCur && coCur.kind !== 'synergy') later(1.3, () => coach(cap, 2.2, 0));
    } else b.classList.add('top');
    // still on the plate: the compact line sits just under it
    if (near(b)) b.style.top = Math.round(py + ph + 26) + 'px';
  }
  bannerMeasure(false);
}
// the banner's band for the renderer; again once its move (a .35 s transition) has landed
let bannerMeasureT = 0;
function bannerMeasure(again = true) {
  const b = $('banner'), k = cv.clientWidth / VIEW_W;
  // never under the HUD (portrait): a HUD that grew since the banner went up (a taller rank row in the Rapids) pushes it down
  if (bannerUp() && !landscape()) {
    const hb = $('hud').offsetHeight | 0;
    if (hb > 0 && b.offsetTop < hb + 4) b.style.top = (hb + 4) + 'px';
  }
  bannerBoxL = k > 0 && bannerUp() ? { y0: (b.offsetTop - cv.offsetTop) / k, y1: (b.offsetTop + b.offsetHeight - cv.offsetTop) / k } : null;
  if (again) bannerMeasureT = 0.4;
}
function coEnd() {
  if (!coCur) return;
  const o = coCur;
  if (o.kind === 'milestone') { $('rankRow').classList.remove('ms'); setT($('rankLbl'), 'YOUR PLACE'); H.tick._res = null; }
  else { $('banner').classList.remove('on'); bannerBoxL = null; setC(document.body, 'bnr', false); }
  coCur = null;
  if (o.coachLong && race && race.p.combo < 10 && !eggOn && coach(o.long, clamp(1.6 + o.long.length * 0.035, 2.2, 3.4), 1)) coachLong = true;
  // the line that waited out the banner
  // (not while another banner is queued: it waits for the last one, and goes stale after 3 s)
  if (coPend && (clock - coPend.at >= 3 || !coQ.some((q) => q.kind !== 'milestone'))) { const c = coPend; coPend = null; if (clock - c.at < 3 && race && !race.over) coach(c.t, c.sec, c.pri, c.force); }
}
function coTick(dt) {
  // a new zone: the last zone's banner and coach line go, and nothing queued from it ever shows
  const zn = zoneNow();
  if (zn >= 0) {
    if (coCur && coCur.zi != null && coCur.zi >= 0 && coCur.zi !== zn) coEnd();
    if (coQ.length) coQ = coQ.filter((q) => q.zi == null || q.zi < 0 || q.zi === zn);
    if (synWait.length) { synWait = synWait.filter((q) => q.zi == null || q.zi < 0 || q.zi === zn); if (!synWait.length) synHoldAt = -1; }
    if (coachT > 0 && coachZi >= 0 && coachZi !== zn) coachClear();
    if (coPend && coPend.zi != null && coPend.zi !== zn) coPend = null;
    if (coDefer && coDefer.zi != null && coDefer.zi !== zn) coDefer = null;
    // a zone banner names the zone Kevin is IN: one for a zone he already left (a fast crossing, a jump) never shows
    if (race && race.p) {
      const zh = zoneIndex(race.p.y), wrong = (q) => q && q.kind === 'zone' && q.zoneI != null && q.zoneI !== zh;
      // (it goes at once: no fade-out transition for its last frame, so the old zone's name never ghosts into the new one)
      if (wrong(coCur)) { const bn = $('banner'); bn.style.transition = 'none'; coEnd(); requestAnimationFrame(() => { bn.style.transition = ''; }); }
      if (coQ.length) coQ = coQ.filter((q) => !wrong(q));
      if (zfPend && zfPend.zi !== zh) zfPend = null;
    }
  }
  if (coCur) { coCur.shown += dt; coCur.left -= dt; if (coCur.left <= 0) coEnd(); }
  if (coCur && coCur.kind !== 'milestone') { bannerKevinTick(); forkClearTick(); }
  if (coachWaitQ.length && (coachT <= 0 || clock - coachWaitQ[0].at > 4)) { const q = coachWaitQ; coachWaitQ = []; for (const o of q) if (o.zi == null || o.zi < 0 || o.zi === zoneNow()) callout(o.kind, o); }
  // a habit perk's pop held while a zone banner was up: it plays once the banner is gone
  if (perkWait.length && !bannerUp()) { const q = perkWait; perkWait = []; for (const f of q) if (clock - f.at < 3) f.fn(); }
  // the held zone story goes up once the lesson card is gone (or after 12 s, as a plain banner would be stale)
  if (zfPend && (!$('tut').classList.contains('on') || clock - zfPend.at > 12)) { const z = zfPend; zfPend = null; if (race && !race.over && (race.zoneReached | 0) === z.zi) zoneArrive(z.zi, Object.assign(z.o, { noHold: true })); }
  if (bannerMeasureT > 0) { bannerMeasureT -= dt; if (bannerMeasureT <= 0 && bannerUp()) bannerMeasure(false); }
  if (!coCur && coQ.length && !(race && race.drill && !race.over && clock < tellOn)) { coQ = coQ.filter((q) => q.keep || clock - q.at < 2); const n = coQ.shift(); if (n) coShow(n); }
  // held banners go out once the lane is clear (or after 2.5 s). A MASHUP held by the fork goes out too once its 2.5 s are
  // up: one compact line under the HUD for 1.2 s at most, kept clear of the PICK A TUBE sign (coShow: forkClr)
  if (synWait.length) {
    const fk = !!race && forkNear(), still = !!race && hostileAhead(700), up = clock - synHoldAt >= 2.5, out = [];
    synWait = synWait.filter((o) => { const go = up || (!still && !(fk && o.kind === 'synergy')); if (go) out.push(o); return !go; });
    if (!synWait.length) synHoldAt = -1;
    for (const o of out) {
      o.at = clock; o.mustTop = still;
      if (o.kind === 'synergy' && fk) { o.compact = true; o.mustTop = true; o.forkClr = true; o.sec = Math.min(o.sec || 1.4, 1.2); }
      // timed out with the threat still there: one compact line under the HUD (1.2 s at most); its caption waits for the
      // coach strip (coPend, said when the banner ends)
      else if (still) {
        o.compact = true; o.sec = Math.min(o.sec || 1.4, 1.2);
        const cap = o.c || o.long || '';
        if (cap) { coPend = { t: cap, sec: 2.0, pri: 1, force: false, at: clock, zi: zoneNow() }; o.c = null; o.long = null; }
      }
      callout(o.kind, o);
    }
  }
}
function coClear() { coQ = []; synWait = []; synHoldAt = -1; coPend = null; coEnd(); }
// Kevin moved further in one frame than any swim can (a test or debug jump): every queued banner and coach line belongs to
// where he was, so they all go, and the hazard first looks are checked again for the new zone
let jumpY = null, jumpRace = null;
const JUMP_PX = 1500;
function jumpCheck() {
  if (!race || race.demo || mode !== 'race') { jumpY = null; jumpRace = null; return; }
  const py = +race.p.y || 0;
  if (jumpRace !== race) { jumpRace = race; jumpY = py; return; }
  if (jumpY != null && Math.abs(py - jumpY) > JUMP_PX) {
    coClear(); coDefer = null; zfPend = null; coachClear();
    hzQ = []; hazT = 0; hazEnt = null; hazPend = null; hazAt = -99;
  }
  jumpY = py;
}
let synWait = [], synHoldAt = -1, coachWaitQ = [], perkWait = [];
const HOLD_KINDS = new Set(['synergy', 'zone', 'goal']);
// the fork's stretch: from 1400 px before the split to 200 px past it
const forkNear = () => { if (!race || !race.p || !C.FORK_Y0) return false; const d = C.FORK_Y0 - race.p.y; return d > -200 && d < 1400; };
// a zone banner; the first ever arrival in zones 2 to 7 tells its little story (K.ZONE_FIRST): three short beats of 1.4 s,
// the first one in place of the subtitle
// zfPend: a first-arrival story held while a #tut card is up (swim 1's lesson cards spill into the Acid Lagoon); coTick
// plays it once the card is gone
let zfPend = null;
function zoneArrive(zi, o) {
  // the zone the banner names: it never shows while Kevin is in another one (coTick)
  o.zoneI = zi;
  const z = ZONES[zi], lines = z && zi >= 1 && zi <= 6 && K.ZONE_FIRST ? K.ZONE_FIRST[z.id] : null;
  if (race && !race.demo && Array.isArray(lines) && lines.length && !S.zoneFirst.includes(z.id)) {
    if (!o.noHold && $('tut').classList.contains('on')) { zfPend = { zi, o, at: clock }; return; }
    S.zoneFirst.push(z.id); saveUI();
    // swim 1: the Acid Lagoon's story is one beat (its hazard look and the lesson cards have the screen)
    lines.slice(0, firstSwim && z.id === 'acid' ? 1 : 3).forEach((l, i) => callout('zone', i ? { t: o.t, z: o.z, c: l, sec: 1.4, keep: true, zoneI: zi } : Object.assign({}, o, { c: l, sec: 1.4, keep: true })));
    return;
  }
  callout('zone', o);
}
// the threat lane: a hostile within range ahead of Kevin, with the same filter the renderer's edge warnings use
// (Big Macros anywhere, acid and goo only in Kevin's lane, goo gates on his side of the fork)
// the nearest such hostile's distance ahead (Infinity when none is within range): one pass serves both the threat lane
// (700) and the intense HUD (600)
function hostileDy(range) {
  if (!race || !race.p) return Infinity;
  const p = race.p; let best = Infinity;
  for (const e of race.ents) {
    if (e.dead) continue;
    const dy = e.y - p.y; if (dy <= 0 || dy > range || dy >= best) continue;
    if (e.t === 'gate') { if (e.side && p.side && e.side !== p.side) continue; best = dy; }
    else if (e.t === 'wbc') { if (!e.popcorn || Math.abs(+e.vx || 0) > 20) best = dy; }
    else if ((e.t === 'acid' || e.t === 'goo') && Math.abs(e.x - p.x) <= (e.r || 0) + 60) best = dy;
  }
  return best;
}
function hostileAhead(range) {
  if (!race || !race.p) return false;
  const p = race.p;
  for (const e of race.ents) {
    if (e.dead) continue;
    const dy = e.y - p.y; if (dy <= 0 || dy > range) continue;
    if (e.t === 'gate') { if (e.side && p.side && e.side !== p.side) continue; return true; }
    // (a dozing POPCORN Big Macro is not a threat until it moves)
    if (e.t === 'wbc' && (!e.popcorn || Math.abs(+e.vx || 0) > 20)) return true;
    if ((e.t === 'acid' || e.t === 'goo') && Math.abs(e.x - p.x) <= (e.r || 0) + 60) return true;
  }
  return false;
}
const bannerUp = () => !!coCur && coCur.kind !== 'milestone';

// ------------------------------------------------------------------ first-run tutorial (never blocks: every step times out)
// A step is only credited once its card has been shown; a step the swim never got to is 'pre' (queued for next time), not 'skip'.
const TUT_ALL = {
  steer: { id: 'steer', ic: '👆', to: 5, d: { t: 'Drag anywhere to steer', s: 'Left, right, wiggle wiggle.' } },
  dash: { id: 'dash', ic: '⚡', to: 5, d: { t: 'Tap DASH for a burst!', s: 'Pink button, or double-tap.' } },
  fruit: { id: 'fruit', ic: '🍓', to: 5, d: { t: 'Grab the fruit sugar', s: 'Fruit is energy. Eat fruit.' } },
  combo: { id: 'combo', ic: '🔥', to: 5, d: { t: 'Pass 3 in a row', s: 'Chain passes for a COMBO.' } },
  cash: { id: 'cash', ic: '👇', to: 6, d: { t: 'Swipe DOWN to cash it in!', s: 'Bank it before you bonk.' } },
  draft: { id: 'draft', ic: '💨', to: 4, d: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' } },
};
// lesson DNA is paid once per step for good (S.tutPaid): a replayed tutorial keeps every card, ring and praise, not the DNA.
// A save from before tutPaid that already finished its lessons has been paid for every step
if (!S.tutPaidMig) {
  if ((meta.runs | 0) > 0 && S.tutDone) for (const id of Object.keys(TUT_ALL)) if (!S.tutPaid.includes(id)) S.tutPaid.push(id);
  S.tutPaidMig = true; saveUI();
}
const tutUnpaid = (id) => !S.tutPaid.includes(id);
// pays a step's DNA if it never has been: true when it paid
function tutPay(id) { if (!tutUnpaid(id)) return false; S.tutPaid.push(id); saveUI(); meta.dna += TUT_DNA; return true; }
// swim 1 learns what keeps Kevin alive (steer, dash, fruit is GAS); drafting is swim 2's redo lesson, cashing in waits
// for swim 2's lesson card
// swim 1's clocks are shorter: sims reach zone 2 at 14 to 17 s, and the whole lesson has to fit in the Launch Tube
// swim 1's order: steer, then DASH (the button is the second thing a thumb finds; it burns GAS and the bar pulses as it
// does), then fruit (it refills that GAS: the bar pulses again when the fruit is credited)
const TUT_FIRST_TO = { steer: 5, dash: 3.5, fruit: 3.5 };
// (fruit is no longer a step: it is taught when it matters, the first time the tank drops under 55% on swim 1, lowTick)
const TUT_FIRST = ['steer', 'dash'].map((id) => Object.assign({}, TUT_ALL[id], { to: TUT_FIRST_TO[id] }));
// the dash card's wait for a lined-up swimmer: 1 s on swim 1, 2 s on a replay
const tutDashCap = () => (firstSwim ? 1 : 2);
const TUT_REPLAY = ['steer', 'dash', 'fruit', 'combo', 'draft'].map((id) => TUT_ALL[id]);
let TUT_STEPS = TUT_REPLAY;
const TUT_DNA = 20;
// keyboard players get the key names (K.TUT_TEXT_KEYS) for the steps that have them
const tutText = (st) => { const kx = !touchUsed && K.TUT_TEXT_KEYS && K.TUT_TEXT_KEYS[st.id]; if (kx && kx.t) return kx; const x = TUT_TEXT[st.id]; return x && x.t ? x : st.d; };
// where the lesson ends: zone 2 on swim 1 (the Acid Lagoon stays for the hazard look), zone 3 on a replay
const tutEndZone = () => (firstSwim ? 1 : 2);
let tut = null;
function tutStart() {
  TUT_STEPS = firstSwim ? TUT_FIRST : TUT_REPLAY; tutDashWait = 0;
  tut = { on: true, i: -1, t: 0, st: {}, shown: {}, steer: 0, dirs: 0, lastDir: 0, draftT: 0, okT: 0, combo0: 0, cashSlow: false };
  // a second lesson only replays the steps that were missed last time
  const sk = S.tutSkipped || [];
  if (S.tutTries > 0 && sk.length) for (const x of TUT_STEPS) if (!sk.includes(x.id)) tut.st[x.id] = 'pre';
}
// steering counts once the finger has travelled 120 px (swim 1: 60 px, the first real drag is the lesson)
const STEER_CREDIT_BASE = 120;
const steerCredit = () => (firstSwim ? 60 : STEER_CREDIT_BASE);
function tutSteer(dx) {
  lessonSteer(dx);
  if (!tut || !tut.on) return;
  tut.steer += Math.abs(dx);
  const sg = Math.sign(dx);
  if (sg && Math.abs(dx) >= 2) { if (tut.lastDir && sg !== tut.lastDir) tut.dirs++; tut.lastDir = sg; }
}
function tutDots() { return TUT_STEPS.filter((x) => tut.st[x.id] !== 'pre').map((x) => `<i class="${tut.st[x.id] === 'ok' ? 'ok' : tut.st[x.id] === 'skip' ? 'sk' : x === TUT_STEPS[tut.i] ? 'cur' : ''}"></i>`).join(''); }
const tutCur = () => (tut && tut.on && !tut.inter && tut.okT <= 0 && tut.i >= 0 && TUT_STEPS[tut.i] ? TUT_STEPS[tut.i].id : '');
// the dash card waits (2 s at most) for a swimmer lined up 120 to 420 px ahead within 60 px of Kevin: a dash that passes
let tutDashWait = 0;
function dashLined() {
  if (!race) return false; const p = race.p;
  for (const a of race.agents) { if (!a.alive || a.arrived) continue; const dy = a.y - p.y; if (dy >= 120 && dy <= 420 && Math.abs(race.agentX(a) - p.x) <= 60) return true; }
  return false;
}
// one-off cards queued behind the tutorial step on screen (swim 1's COMBO_INTRO): {id, ic, t, s, sec}
let tutQ = [];
// swim 1, one message at a time: until the steer step is credited, the FRENZY card, its freeze and a first trick's pops
// wait here (onbHeld). They play once steering is credited, and are dropped if the lesson ends first
let onbHeld = [];
const onbHolding = () => firstSwim && !!tut && tut.on && tut.st.steer !== 'ok' && !!race && !race.demo;
function onbHold(fn) { if (!onbHolding()) return false; onbHeld.push(fn); return true; }
function onbFlush(run) { const q = onbHeld; onbHeld = []; if (run) for (const f of q) { try { f(); } catch (e) { console.error(e); } } }
function queueCard(c) { if (!tutQ.some((q) => q.id === c.id)) tutQ.push(c); }
// a queued card may wait for its moment. Swim 1's COMBO card: not before 8 s of swim; near the end of the Launch Tube
// (the last 2500 px before the first card deal) it waits until that deal has closed; never in the last 2 s before a
// zone change
function cardReady(c) {
  if (!c || c.id !== 'comboIntro' || !race) return true;
  const p = race.p, zi = zoneIndex(p.y);
  if ((+race.t || 0) < (c.at || 0)) return false;
  if ((race.zoneReached | 0) < 1 && p.y > ZONES[0].len - 2500) return false;
  if (race.pending || cardsLive()) return false;
  const nxt = ZSTART[zi + 1];
  if (Number.isFinite(nxt) && (nxt - p.y) / Math.max(150, +p.vy || 0) < 2) return false;
  return true;
}
// #tut goes up: the coach strip is cut at once (no fade under the card), so only one text ever shows
function tutRaise() {
  coachClear();
  const co = $('coach'); co.classList.add('cut');
  requestAnimationFrame(() => requestAnimationFrame(() => co.classList.remove('cut')));
}
function tutInterlude() {
  if (!tut || !tutQ.length || !cardReady(tutQ[0])) return false;
  const c = tutQ.shift(); if (!c) return false;
  tutRaise();
  const el = $('tut');
  el.querySelector('.ic').textContent = c.ic; el.querySelector('.tt').textContent = c.t; el.querySelector('.ts').textContent = c.s || '';
  el.querySelector('.dots').innerHTML = ''; setBar(el.querySelector('.bar i'), 1);
  el.className = 'on lesson step-' + c.id; $('dashBtn').classList.remove('nudge');
  tut.inter = { t: c.sec, sec: c.sec }; sfx('tap', 0.6);
  return true;
}
function tutNext() {
  if (!tut) return;
  let i = 0; while (i < TUT_STEPS.length && tut.st[TUT_STEPS[i].id]) i++;
  if (i >= TUT_STEPS.length) return tutFinish();
  if (TUT_STEPS[i].id === 'dash' && !dashLined() && tutDashWait < tutDashCap()) { tut.waitDash = true; tut.i = -2; tutHide(); return; }
  tut.waitDash = false;
  tut.i = i; tut.t = 0;
  tutRaise();
  const st = TUT_STEPS[i], el = $('tut'), tx = tutText(st);
  tut.shown[st.id] = true;
  if (st.id === 'combo') tut.combo0 = Math.floor(race ? race.p.combo : 0);
  if (st.id === 'draft') tut.draftT = 0;
  if (st.id === 'cash') tut.cashSlow = false;
  if (st.id === 'fruit') { tut.fruitOff0 = steerOffNow(); tut.fruitDev = 0; tut.fruitAt = clock; }
  el.querySelector('.ic').textContent = st.ic; el.querySelector('.tt').textContent = tx.t;
  // swim 1's DASH card says where the button is
  el.querySelector('.ts').textContent = (firstSwim && st.id === 'dash' && touchUsed ? K.DASH_WHERE || tx.s : tx.s) || '';
  // swim 1 praises without the number: its lessons' DNA is counted once, on the result card
  el.querySelector('.tt').dataset.praise = (TUT_PRAISE[st.id] || 'NICE!') + (firstSwim || !tutUnpaid(st.id) ? '' : ' +' + TUT_DNA + ' DNA');
  // swim 1 shows one instruction at a time: no step dots
  el.querySelector('.dots').innerHTML = firstSwim ? '' : tutDots();
  el.className = 'on step-' + st.id;
  $('dashBtn').classList.toggle('nudge', st.id === 'dash');
  // the dash card: the GAS bar pulses, DASH is paid for out of it
  if (st.id === 'dash') gasPulse();
}
function tutMark(id) {
  if (!tut || !tut.on || tut.st[id] || !tut.shown[id] || !race || race.demo) return;
  tut.st[id] = 'ok';
  const paid = tutPay(id);
  // swim 1 keeps the swim clean: no +DNA pop and no DNA talk (the result card counts the lessons' DNA and says what it is for).
  // A step paid before (a replayed tutorial) gets only its praise word
  if (firstSwim) { if (paid) lessonDna += TUT_DNA; }
  else R.pop(race.p.x, race.p.y + 70, paid ? '+' + TUT_DNA + ' DNA' : TUT_PRAISE[id] || 'NICE!', '#7dffb0', 18, 1.2);
  // the lesson sting climbs with each step learned (audio: sfx 'lesson', 0..1)
  { const si = TUT_STEPS.findIndex((x) => x.id === id); sfx('lesson', (Math.max(0, si) + 1) / Math.max(1, TUT_STEPS.length)); }
  buzz(12);
  const cur = TUT_STEPS[tut.i] && TUT_STEPS[tut.i].id === id;
  if (cur) { tut.okT = 0.7; $('tut').classList.add('ok'); $('dashBtn').classList.remove('nudge'); }
  // (swim 1 keeps the +places ticker hidden until the first pass: the 'pass' event drops noTick)
  if (id === 'steer' && !firstSwim) setC(document.body, 'noTick', false);
  // steering credited off its own card: what waited behind it plays now (on its card: after the praise, tutTick)
  if (id === 'steer' && !cur) onbFlush(true);
  // swim 1: the COMBO card comes right after the DASH praise (at 5 s of swim at the earliest: cardReady)
  if (id === 'dash' && firstSwim && !comboIntroDone) {
    comboIntroDone = true;
    queueCard({ id: 'comboIntro', ic: '🔥', t: K.COMBO_INTRO || 'Passing in a row = COMBO', s: K.COMBO_INTRO_SUB || '', sec: 3, at: 5 });
  }
  $('tut').querySelector('.dots').innerHTML = firstSwim ? '' : tutDots();
  if (!firstSwim && paid) dnaExplain();
}
// swim 1: the DNA its lessons paid, shown once on its result card
let lessonDna = 0;
// the first DNA praise ever: what DNA is for, once
function dnaExplain() {
  if (S.dnaExplained) return;
  S.dnaExplained = true; saveUI();
  later(0.3, () => coach(K.TUT_DNA_EXPLAIN || 'DNA = Dad upgrades. Spend it later!', 2.6, 2, true));
}
function tutFinish() {
  if (!tut || !tut.on) return;
  tut.on = false; tutHide(); setC(document.body, 'noTick', false);
  // anything still held for the steer step is dropped: the moment has passed
  onbFlush(false);
  // swim 1: the race HUD fills in now (rival pips, name tags, the distance), with a little pop
  if (document.body.classList.contains('tutHud')) { setC(document.body, 'tutHud', false); setC(document.body, 'hudIn', true); setTimeout(() => setC(document.body, 'hudIn', false), 500); requestAnimationFrame(measureHud); }
  const skipped = [], unseen = [];
  let met = 0;
  for (const st of TUT_STEPS) {
    const v = tut.st[st.id];
    if (v === 'ok') met++;
    else if (v === 'pre') continue;
    else if (tut.shown[st.id]) skipped.push(st.id);
    else { tut.st[st.id] = 'pre'; unseen.push(st.id); }
  }
  // a thumb that clearly steered (60+ px) never gets the steer lesson again, whatever its card did
  const missed = skipped.concat(unseen).filter((id) => !(id === 'steer' && tut.steer > 60));
  // swim 1 never teaches drafting: it comes back on swim 2 as a redo lesson card
  S.tutSkipped = firstSwim && !missed.includes('draft') ? missed.concat('draft') : missed;
  if (missed.length && (skipped.length >= 2 || unseen.length)) { S.tutTries = (S.tutTries || 0) + 1; S.tutDone = S.tutTries >= 2; }
  else S.tutDone = true;
  // swim 1: the combo lesson waits for the tutorial to end, then rings a clump of rivals to swim through
  if (firstSwim && !comboIntroDone && race && !race.demo && !race.over) {
    comboIntroDone = true;
    queueCard({ id: 'comboIntro', ic: '🔥', t: K.COMBO_INTRO || 'Passing in a row = COMBO', s: K.COMBO_INTRO_SUB || '', sec: 3, at: 8 });
  }
  // a step still missed after the lessons stays in S.tutSkipped: it comes back once as a single card when its moment is live
  saveUI();
  if (!race || race.demo || race.over) return;
  if (!missed.length) { coach(TUT_TEXT.natural || "You're a natural!", 2.6, 2); sfx('milestone'); buzz([15, 25, 15]); }
  // the first swims never hear "we will practise again": a warm word when most of it landed, otherwise nothing
  else if (meta.runs <= 1) { if (met >= TUT_STEPS.length - 1 && TUT_TEXT_GENTLE) coach(TUT_TEXT_GENTLE, 2.6, 2); }
  else if (!S.tutDone) coach(TUT_TEXT.retry || 'We will practise again next swim.', 2.6, 2);
}
function tutHide() { $('tut').className = ''; $('dashBtn').classList.remove('nudge'); tutPlace(false); }
// the steer card keeps its top 70+ CSS px below Kevin on screen (portrait), so the thumb's target is never under it
function tutPlace(on) {
  const el = $('tut');
  if (!on || !race || R.camY == null || landscape()) { if (el._pl) { el._pl = false; el.style.bottom = ''; } return; }
  const k = cv.clientWidth / VIEW_W; if (!(k > 0)) return;
  const ky = R.sy(race.p.y) * k + cv.offsetTop, ph = (el.offsetParent || APP).clientHeight || innerHeight;
  const want = ky + 70;
  // only ever lower than its CSS spot (_cssTop, read while the rule is in charge): back to the rule once that is clear
  if (!el._pl) { const t = el.offsetTop; if (t >= want) return; el._cssTop = t; }
  else if (el._cssTop >= want) { el._pl = false; el.style.bottom = ''; return; }
  el._pl = true; el.style.bottom = Math.max(6, Math.round(ph - want - el.offsetHeight)) + 'px';
}
// ------------------------------------------------------------------ lessons: one #tut card outside the tutorial (cash in, drill)
let lesson = null;
// a pickup's motes landed on the HUD: a small pulse (at most every 120 ms, so a fruit chain never stutters the bar)
let gasLandAt = 0, dnaLandAt = 0;
function gasLand() { const nw = performance.now(); if (nw - gasLandAt < 120) return; gasLandAt = nw; gasPulse(); }
function dnaLand() {
  const nw = performance.now(); if (nw - dnaLandAt < 120 || S.reduced) return; dnaLandAt = nw;
  const el = $('dnaHud'); try { if (el && el.animate) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' }); } catch (e) { /* old browser */ }
}
function gasPulse() {
  if (S.reduced) return;
  const er = $('energyRow'), ef = $('efill');
  try {
    if (er.animate) er.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    if (ef.animate) ef.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.8) saturate(.6)', offset: 0.3 }, { filter: 'brightness(1)' }], { duration: 300, easing: 'ease-out' });
  } catch (e) { /* old browser */ }
}
function lessonShow(id, ic, tx, sec) {
  if (tut && tut.on) return false;
  tutRaise();
  const el = $('tut');
  el.querySelector('.ic').textContent = ic; el.querySelector('.tt').textContent = tx.t || ''; el.querySelector('.ts').textContent = tx.s || '';
  el.querySelector('.dots').innerHTML = ''; setBar(el.querySelector('.bar i'), 1);
  el.className = 'on lesson step-' + id;
  lesson = { id, t: sec, sec };
  // swim 2: the pot and CASH come in with their lesson
  if (id === 'cash') setC(document.body, 'hud2', false);
  return true;
}
function lessonEnd() { if (!lesson) return; lesson = null; if (!(tut && tut.on)) tutHide(); }
// steering during a replayed steer lesson (the same rule as the tutorial: 120 px of travel)
function lessonSteer(dx) {
  if (!lesson || !lesson.redo || lesson.id !== 'steer') return;
  lesson.steer += Math.abs(dx); const sg = Math.sign(dx);
  if (sg && Math.abs(dx) >= 2) { if (lesson.lastDir && sg !== lesson.lastDir) lesson.dirs++; lesson.lastDir = sg; }
}
// the cash lesson: the first pots worth cashing (bank 10+, when the CASH chip shows) slow the swim a beat and show how; up to 3 times, 20 s apart
let cashLast = -99, lessonSlowT = 0;
const CASH_TXT = () => {
  const x = TUT_TEXT.cash && TUT_TEXT.cash.t ? TUT_TEXT.cash : { t: 'Swipe DOWN to cash it in!', s: 'Bank it before you bonk.' };
  const kx = K.TUT_TEXT_KEYS && K.TUT_TEXT_KEYS.cash;
  return touchUsed ? x : kx && kx.t ? kx : { t: K.CASH_HINT_KEYS || 'Press S to cash in your combo!', s: x.s || '' };
};
function lessonTick(dt) {
  if (lessonSlowT > 0) lessonSlowT -= dt;
  if (!race || race.demo || race.over) { lessonEnd(); drillRingT = 0; return; }
  const p = race.p;
  if (drillRingT > 0) { drillRingT -= dt; if (race.drill) ringAsk(p.x, p.y, ''); }
  if (lesson) {
    if (!cardYield && !(firstSwim && threatOnB)) lesson.t -= dt;
    setBar($('tut').querySelector('.bar i'), lesson.t / lesson.sec);
    if (lesson.id === 'cash') {
      if (p.bank < 3 || race.drill) { lessonEnd(); return; }
      // touch: the ring sits on the CASH chip itself ('tap!'); keys: on Kevin
      if (!(touchUsed && ringAskEl(H.cash, 'tap!'))) ringAsk(p.x, p.y - 30, touchUsed ? 'tap!' : 'S!');
    }
    else if (lesson.id === 'fruitLow') {
      // swim 1's fruit lesson, when the tank first ran under 55%: a 'grab!' ring on the nearest fruit
      const f = nearestFruit(700); if (f) ringAsk(f.x, f.y, 'grab!', '', 'sugar', 'good', f.r);
    }
    else if (lesson.id === 'comboIntro') {
      if (race.drill) { lessonEnd(); return; }
      const c = clumpAhead(450); if (c) ringAsk(c.x, c.y, K.COMBO_RING_LABEL || 'go through!');
      // the chain reaches 3 while the card is up: a beat of slow-mo so it lands
      if (p.combo >= 3 && !lesson.c3) { lesson.c3 = true; comboIntroNow = true; if (!S.reduced) lessonSlowT = Math.max(lessonSlowT, 0.25); }
    }
    else if (lesson.redo) {
      // a replayed step: its ring and its check, the same as in the tutorial
      if (lesson.id === 'fruit') { const f = nearestFruit(700); if (f) ringAsk(f.x, f.y, 'fruit!'); }
      else if (lesson.id === 'steer' && lesson.steer > steerCredit()) { lessonDone('steer'); return; }
      else if (lesson.id === 'steer') ghostAsk('drag');
      else if (lesson.id === 'combo') { lesson.combo0 = Math.min(lesson.combo0, Math.floor(p.combo)); if (p.combo >= lesson.combo0 + 3) { lessonDone('combo'); return; } }
      else if (lesson.id === 'draft') {
        if (p.draft > 0.08) { lesson.draftT += dt; if (lesson.draftT > 0.6) { lessonDone('draft'); return; } }
        let bd = 1e9, tg = null;
        for (const a of race.agents) { if (!a.alive || a.arrived) continue; const dy = a.y - p.y; if (dy < 50 || dy > 320) continue; const d = dy + Math.abs(race.agentX(a) - p.x) * 1.5; if (d < bd) { bd = d; tg = a; } }
        if (tg) ringAsk(race.agentX(tg), tg.y - 55, 'here!');
      }
    }
    else if (lesson.id === 'drill' || race.drill) { lessonEnd(); return; }
    if (lesson && lesson.t <= 0) lessonEnd();
    return;
  }
  if (tutQ.length && !(tut && tut.on) && !race.drill && !race.pending && !eggOn && countT <= 0 && !bannerUp() && !(coachT > 0 && coachPri >= 1) && !(firstSwim && acidUnseenAhead(p)) && cardReady(tutQ[0])) { const c = tutQ.shift(); if (lessonShow(c.id, c.ic, { t: c.t, s: c.s }, c.sec)) return; }
  if (redoTick(p)) return;
  if ((meta.runs | 0) < 1 || S.cashDone || (S.cashN | 0) >= 3 || clock - cashLast < 20 || p.bank < 10 || race.drill || race.pending || countT > 0 || eggOn || race.autopilot) return;
  if (!lessonShow('cash', touchUsed ? '👆' : '👇', CASH_TXT(), 3.2)) return;
  cashLast = clock; S.cashN = (S.cashN | 0) + 1; saveUI();
  if (!S.reduced) lessonSlowT = 1;
  sfx('tap', 0.6); buzz([10, 20, 10]);
}
// a tutorial step that was skipped: once the tutorial is done it comes back as one lesson card when its moment is live
// (2 tries per step, 15 s apart, never in the first 4 s, under a banner, at the egg or on autopilot)
let redoAt = -99;
function redoLive(id, p) {
  if (id === 'steer') return true;
  if (id === 'dash') return !(p.dashCd > 0) && !lowForDash();
  if (id === 'fruit') return !!nearestFruit(600);
  if (id === 'combo') return p.combo >= 1 && p.combo < 3;
  if (id === 'cash') return p.bank >= TUT_CASH_BANK && p.combo >= 3;
  if (id === 'draft') return race.agents.some((a) => a.alive && !a.arrived && a.y - p.y > 50 && a.y - p.y < 320);
  return false;
}
function redoTick(p) {
  const sk = S.tutSkipped || [];
  if (!S.tutDone || !sk.length || (tut && tut.on) || (meta.runs | 0) < 1) return false;
  if (clock - redoAt < 15 || clock - raceT0 < 4 || race.drill || race.pending || countT > 0 || eggOn || race.autopilot || bannerUp() || hazT > 0) return false;
  for (const id of sk.slice()) {
    const st = TUT_ALL[id];
    if (!st || (S.lessonTries[id] | 0) >= 2) { S.tutSkipped = S.tutSkipped.filter((x) => x !== id); saveUI(); continue; }
    if (id === 'cash' && S.cashDone) continue;
    if (!redoLive(id, p)) continue;
    if (!lessonShow(id, st.ic, tutText(st), id === 'cash' ? 4 : 3.5)) return false;
    redoAt = clock; S.lessonTries[id] = (S.lessonTries[id] | 0) + 1; saveUI();
    lesson.redo = true; lesson.steer = 0; lesson.dirs = 0; lesson.lastDir = 0; lesson.draftT = 0; lesson.combo0 = Math.floor(p.combo);
    if (id === 'dash') $('dashBtn').classList.add('nudge');
    sfx('tap', 0.6); buzz([10, 20, 10]);
    return true;
  }
  return false;
}
// the lesson card's move was made: praise, +DNA and the step is learned for good
function lessonDone(id) {
  if (!lesson || lesson.id !== id || !race || race.demo) return;
  S.tutSkipped = (S.tutSkipped || []).filter((x) => x !== id); saveUI();
  if (lesson.redo) { const paid = tutPay(id); R.pop(race.p.x, race.p.y + 70, (TUT_PRAISE[id] || 'NICE!') + (paid ? ' +' + TUT_DNA + ' DNA' : ''), '#7dffb0', 18, 1.2); sfx('pick'); buzz(12); if (paid) dnaExplain(); }
  lessonEnd();
}
// the drill lesson: the first drill on a save with no wins. No pill (the egg panel already says TAP, and a card over the
// duel hides the bars): a ring on Kevin for 3.5 s does the pointing
let drillRingT = 0;
// what the duel panel says while the first drill is taught: the key names on a keyboard, the thumbs on touch
function drillTeachText() {
  const kx = !touchUsed && K.TUT_TEXT_KEYS && K.TUT_TEXT_KEYS.drill, tx = TUT_TEXT.drill;
  return (kx && kx.t) || (touchUsed && tx && tx.t) || (tx && tx.t) || '';
}
function drillLesson() {
  if (S.drillSeen || (meta.wins | 0) > 0 || race.autopilot) return;
  lessonEnd(); drillRingT = 3.5; S.drillSeen = true; saveUI();
}

// swim 1: a queued card waits while the Acid Lagoon's first look is still to come (an acid pool within 450 px ahead)
function acidUnseenAhead(p) {
  if (S.seenHaz.includes('acid')) return false;
  for (const e of race.ents) if (e.t === 'acid' && !e.dead && e.y - p.y > -40 && e.y - p.y < 450) return true;
  return false;
}
// the densest clump of 3+ swimmers within maxDy ahead (each counted with its neighbours within 70 px): its centre.
// A swimmer within (r + 70) px of an acid pool or a goo blob is never a target: the ring must not lead Kevin into one
function clumpAhead(maxDy) {
  const p = race.p, cand = [], bad = [];
  for (const e of race.ents) if ((e.t === 'acid' || e.t === 'goo') && !e.dead && e.y - p.y > -100 && e.y - p.y < maxDy + 100) bad.push(e);
  for (const a of race.agents) {
    if (!a.alive || a.arrived) continue;
    const dy = a.y - p.y; if (dy < 40 || dy > maxDy) continue;
    if (p.side && a.side && a.side !== p.side && p.y >= C.FORK_Y0) continue;
    if (bad.length) { const ax = race.agentX(a); if (bad.some((e) => Math.hypot(e.x - ax, e.y - a.y) < (e.r || 0) + 70)) continue; }
    cand.push({ x: race.agentX(a), y: a.y });
    if (cand.length >= 80) break;
  }
  let best = null, bn = 2;
  for (const c of cand) {
    let n = 0, sx = 0, sy = 0;
    for (const o of cand) if (Math.abs(o.x - c.x) < 70 && Math.abs(o.y - c.y) < 70) { n++; sx += o.x; sy += o.y; }
    if (n > bn) { bn = n; best = { x: sx / n, y: sy / n, n }; }
  }
  return best;
}
function nearestFruit(maxDy) {
  const p = race.p; let best = null, bd = 1e9;
  for (const e of race.ents) { if (e.t !== 'sugar' || e.dead) continue; const dy = e.y - p.y; if (dy < 30 || dy > maxDy) continue; if (e.side && p.side && e.side !== p.side) continue; const d = dy + Math.abs(e.x - p.x) * 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
// the cash step needs a pot to cash: 6 in the bank (the clock waits until then)
const TUT_CASH_BANK = 6;
function tutTick(dt) {
  if (!tut || !tut.on || !race || race.demo) return;
  // swim 1 ends the lesson at the Acid Lagoon, a replay runs through zone 2 so every step gets its moment
  if (race.over || race.zoneReached >= tutEndZone()) return tutFinish();
  if (race.pending || !$('cards').classList.contains('hide') || countT > 0) return;
  // a queued one-off card (swim 1's COMBO lesson) runs its own clock, then the steps go on
  if (tut.inter) { if (!cardYield && !threatOnB) tut.inter.t -= dt; setBar($('tut').querySelector('.bar i'), tut.inter.t / tut.inter.sec); if (tut.inter.t <= 0) { tut.inter = null; tutNext(); } return; }
  // the dash card waits for someone to dash past (2 s at most)
  if (tut.waitDash) { tutDashWait += dt; if (dashLined() || tutDashWait >= tutDashCap()) tutNext(); if (!tut.on || tut.waitDash) return; }
  // the first swim starts once its zone banner has had its moment; a replay waits for the zone banner to clear
  if (tut.i === -1) { if (launchBusy() || (!firstSwim && bannerUp())) return; tutNext(); if (!tut.on || tut.i < 0) return; }
  const p = race.p, st = TUT_STEPS[tut.i], cur = st && tut.okT <= 0 ? st.id : '';
  tutPlace(st && st.id === 'steer');
  // steering is learned with 120 px of travel and at least one change of direction (a wiggle, not a slide); swim 1: any
  // 60 px drag (control in the first seconds, no homework)
  if (tut.steer > steerCredit() && (firstSwim || tut.dirs >= 1)) tutMark('steer');
  if (tut.shown.combo) { tut.combo0 = Math.min(tut.combo0, Math.floor(p.combo)); if (p.combo >= tut.combo0 + 3) tutMark('combo'); }
  if (cur === 'fruit') { const o = steerOffNow(); if (o != null && tut.fruitOff0 != null) tut.fruitDev = Math.max(tut.fruitDev || 0, Math.abs(o - tut.fruitOff0)); }
  // drafting only counts while its card is up
  if (cur === 'draft' && p.draft > 0.08) { tut.draftT += dt; if (tut.draftT > 0.6) tutMark('draft'); }
  let target = null, paused = false;
  if (cur === 'draft') {
    // a ring that marks the sweet spot behind the nearest rival ahead
    let bd = 1e9;
    for (const a of race.agents) {
      if (!a.alive || a.arrived) continue;
      const dy = a.y - p.y; if (dy < 50 || dy > 320) continue;
      const d = dy + Math.abs(race.agentX(a) - p.x) * 1.5; if (d < bd) { bd = d; target = a; }
    }
    if (target) ringAsk(race.agentX(target), target.y - 55, 'here!'); else paused = true;
  } else if (cur === 'fruit') {
    const f = nearestFruit(700);
    // the fruit step is the sugar's first look too (it never gets a second intro)
    if (f) ringAsk(f.x, f.y, 'fruit!', '', 'sugar', 'good', f.r); else paused = true;
  }
  if (tut.okT > 0) { tut.okT -= dt; if (tut.okT <= 0) { if (onbHeld.length && tut.st.steer === 'ok') onbFlush(true); if (!tut.inter && !tutInterlude()) tutNext(); } }
  else if (st) {
    // the clock stops while there is nothing to do (no rival to tuck behind, no fruit ahead, no pot) or a banner is up
    // a hazard's first look owns the ring and the player's eyes: the step clock waits for it too
    // swim 1's steer card: its clock waits until the first idle nudge has fired (a slow starter is never timed out)
    const idleWait = firstSwim && st.id === 'steer' && idleN === 0;
    // (a threat ahead: the card has moved low and lost its second line, so its clock waits too)
    if (!bannerUp() && !paused && hazT <= 0 && !cardYield && !idleWait && !threatOnB) tut.t += dt;
    setBar($('tut').querySelector('.bar i'), 1 - tut.t / st.to);
    if (tut.t > st.to) { tut.st[st.id] = 'skip'; if (!tutInterlude()) tutNext(); }
  }
}
// idle re-prompt (swims 1 to 3): 4 s of play with no input (a 2+ px drag, a dash or a flick) and nothing else on screen
// brings the ghost finger back with a Coach nudge. 3 times a swim at most, 12 s apart
let lastInputAt = 0, idleSeenIn = 0, idleAcc = 0, idleN = 0, idleAt = -99;
function idleNudgeTick(dt) {
  if (!race || race.demo || race.autopilot || race.drill || race.over || (meta.runs | 0) >= 3) return;
  if (lastInputAt !== idleSeenIn) { idleSeenIn = lastInputAt; idleAcc = 0; }
  if (race.pending || !$('cards').classList.contains('hide') || bannerUp() || countT > 0 || eggOn) return;
  idleAcc += dt;
  if (idleAcc < 4 || idleN >= 3 || clock - idleAt < 12) return;
  if (!coach((Array.isArray(K.IDLE_NUDGE) && pickLine(K.IDLE_NUDGE)) || K.TAP_STEER_HINT || 'Drag your thumb. Kevin will follow.', 2.4, 2, true)) return;
  idleN++; idleAt = clock; idleAcc = 0;
  ghostT = Math.max(ghostT, 2.5); sfx('nudge'); buzz(10);
}
// Kevin's steering offset from the tube centre right now (the finger's, the held lane's, or where he is)
function steerOffNow() {
  if (!race || !race.p) return null;
  if (drag && Number.isFinite(drag.off)) return drag.off;
  if (holdOff != null && Number.isFinite(holdOff)) return holdOff;
  return race.p.x - mid(race.p.y);
}
// the fruit step: steered 30+ px since its card came up, or dashed
const fruitEarned = () => !!tut && ((tut.fruitDev || 0) >= 30 || (tut.fruitAt != null && lastDashAt >= tut.fruitAt));
// first swim: a ghost finger swipes over Kevin while the countdown runs
let ghostT = 0;
// the first flick that really dashes (once a save): a 0.6 s 'FLICK!' ring on Kevin
let flickAt = -99, flickRingT = 0;
let dashAskStep = -1;
function ghostTick(dt) {
  if (flickRingT > 0 && race && race.p) { flickRingT -= dt; ringAsk(race.p.x, race.p.y + 40, 'FLICK!'); }
  // the DASH step: no swipe ghost, a ring on the button itself (and one nudge sound each time the step comes up)
  if (race && tutCur() === 'dash') {
    $('tut').classList.toggle('fg', false);
    ringAskEl($('dashBtn'), 'tap!');
    if (dashAskStep !== tut.i) { dashAskStep = tut.i; sfx('nudge'); }
    return;
  }
  if (ghostT <= 0 || !race) { $('tut').classList.toggle('fg', false); return; }
  if (launchBusy() || countT > 0) return;
  if (ghostT > 1e8 && (!tut || !tut.on || tut.steer > steerCredit())) { ghostT = 0; return; }
  ghostT -= dt;
  // Swim 1: the finger alone (the lesson card is the one instruction); Kevin's YOU tag stays up (the finger is below him)
  if (ghostT > 0) ghostAsk(firstSwim ? '' : 'drag');
  // swim 1's steer card sits just above the finger (portrait)
  const fg = firstSwim && ghostT > 0 && ghostScrY > 0 && tutCur() === 'steer' && !landscape();
  if (fg) { const b = Math.round((APP.clientHeight || innerHeight) - ghostScrY + 18); if (ghostFgB !== b) { ghostFgB = b; document.documentElement.style.setProperty('--fgB', b + 'px'); } }
  $('tut').classList.toggle('fg', fg);
}
let ghostFgB = -1;
// the ghost finger: BELOW Kevin (120 px, where a thumb really is, kept above the home strip and the combo strip),
// swaying 50 px each way (sin 3t) round a centre pulled toward the next fruit, with a faint dotted line up to Kevin
const GHOST_SWAY = 50, GHOST_SWAY_STEER = 40;
let ghostScrY = -1;
function ghostAsk(label) {
  const p = race.p; let wy = p.y - 120;
  const k = cv.clientWidth / VIEW_W;
  if (k > 0 && R.camY != null && Number.isFinite(R.H)) {
    const yMax = (APP.clientHeight || innerHeight) - Math.max(safeBpx + 40, +R.padBot || 0);
    const wyMin = R.camY + R.H - (yMax - cv.offsetTop) / k;
    if (wy < wyMin) wy = wyMin;
    ghostScrY = R.sy(wy) * k + cv.offsetTop;
  }
  const f = nearestFruit(500);
  let cx = p.x + (f ? clamp(f.x - p.x, -110, 110) * 0.6 : 0), amp = GHOST_SWAY;
  const sw = S.reduced ? 0 : Math.sin(clock * 3);
  // the steer step: the finger sits just left of Kevin, inside the band he can really swim (60 px off each wall), with a
  // smaller sway, so it never points at a wall or off the screen
  if (tutCur() === 'steer') { const b = band(p.y, p.side); cx = clamp(p.x - 40, b.l + 60, Math.max(b.l + 60, b.r - 60)); amp = GHOST_SWAY_STEER; }
  ringAsk(cx + sw * amp, wy, label, 'swipe');
  if (ringReq && ringReq.cls === 'swipe') { ringReq.sway = sw; ringReq.amp = amp; ringReq.link = true; }
}

// swim 1's first drag: a puff of bubbles off Kevin's tail (once a swim)
let firstPuff = false;
function firstPuffFx() {
  firstPuff = true;
  const p = race.p;
  R.burst(p.x, p.y - 22, '#bfefff', 12, 150, 0.45, 3);
  if (R.ring && !S.reduced) R.ring(p.x, p.y - 18, '#bfefff', 34, 0.3, 3);
  buzz(10); sfx('tap', 0.8);
}
// ------------------------------------------------------------------ one guide ring (#tutTarget), shared by the tutorial,
// the low-energy rescue and the first look at each hazard. The first ask in a frame wins.
let ringReq = null;
// tone: 'bad' (a danger's first look, red) or 'good' (a pickup, green); r: the thing's world radius (the ring fits round it)
function ringAsk(wx, wy, label, cls, haz, tone, r) { if (!ringReq) ringReq = { wx, wy, label, cls: cls || '', haz: haz || null, tone: tone || '', r: +r || 0 }; }
// a ring on a HUD element (the CASH chip): screen coordinates, false when the element is not on screen
function ringAskEl(el, label) {
  if (ringReq || !el || el.classList.contains('hide')) return false;
  const r = el.getBoundingClientRect(), a = APP.getBoundingClientRect(); if (!r.width) return false;
  ringReq = { sx: r.left + r.width / 2 - a.left, sy: r.top + r.height / 2 - a.top, label, cls: '', haz: null, tone: '', r: 0 };
  return true;
}
function ringApply() {
  const tg = $('tutTarget');
  // the pill drops its second line while a ring or the ghost finger does the explaining
  setC($('tut'), 'rg', !!ringReq && mode === 'race');
  if (!ringReq || R.camY == null || !race || mode !== 'race') { setC(tg, 'hide', true); ringReq = null; return; }
  const k = cv.clientWidth / VIEW_W, scr = ringReq.sx != null;
  const x0 = scr ? ringReq.sx : ringReq.wx * k + cv.offsetLeft, y0 = scr ? ringReq.sy : R.sy(ringReq.wy) * k + cv.offsetTop;
  // kept on the screen (below the HUD, above the bottom edge); a clamped ring shows an arrow at the real spot
  const top = scr ? 20 : (R.padTop || 0) + 30, bot = (APP.clientHeight || innerHeight) - (scr ? 20 : 40);
  // the ghost hand keeps 44 px off each side (its finger and arc are wider than a ring)
  const sideM = !scr && ringReq.cls === 'swipe' ? 44 : 26;
  const lo = cv.offsetLeft + sideM, hi = cv.offsetLeft + cv.clientWidth - sideM;
  let x = clamp(x0, lo, Math.max(lo, hi)), y = clamp(y0, top, Math.max(top, bot));
  // landscape: a swipe hand that would cross the bottom edge goes above Kevin instead
  if (!scr && ringReq.cls === 'swipe' && landscape() && y0 > bot - 50 && R.youY != null) y = clamp(R.youY * k + cv.offsetTop - 70, top, Math.max(top, bot));
  // never on the DASH button (its box grown by 12 px), unless the ring is about the button itself: pushed out the short way
  if (!scr) {
    const db = dashRectApp;
    if (db && db.w) {
      const L = db.x - 12 - 22, Rr = db.x + db.w + 12 + 22, T = db.y - 12 - 22, B = db.y + db.h + 12 + 22;
      if (x > L && x < Rr && y > T && y < B) {
        const dl = x - L, dr = Rr - x, dt = y - T;
        if (dt <= Math.min(dl, dr)) y = T; else if (dl <= dr) x = L; else x = Rr;
      }
    }
  }
  const edge = Math.abs(x - x0) > 1 || Math.abs(y - y0) > 1;
  // near the bottom the label goes above the ring (never clipped, never under DASH)
  setC(tg, 'up', y > bot - 50);
  tg.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  if (edge) { const a = Math.round(Math.atan2(y0 - y, x0 - x) * 180 / Math.PI + 90); if (tg._a !== a) { tg._a = a; tg.style.setProperty('--ang', a + 'deg'); } }
  setC(tg, 'edge', edge);
  // at the egg the duel panel does the talking: the ring keeps quiet
  const lab = DU.ui.classList.contains('hide') ? ringReq.label : '';
  if (tg._l !== lab) { tg._l = lab; tg.dataset.l = lab; }
  // the label stays on the screen: about 8 px a character plus its padding, shifted inside [8, width - 8]
  { const hw = lab ? (String(lab).length * 8 + 16) / 2 : 0, l0 = cv.offsetLeft + 8, r0 = cv.offsetLeft + cv.clientWidth - 8;
    const lx = !lab ? 0 : x - hw < l0 ? Math.round(l0 - (x - hw)) : x + hw > r0 ? Math.round(r0 - (x + hw)) : 0;
    if (tg._lx !== lx) { tg._lx = lx; tg.style.setProperty('--lx', lx + 'px'); } }
  setC(tg, 'swipe', ringReq.cls === 'swipe');
  // the ghost finger sways in JS: its arc stays put under it, and the finger tilts with the swing
  if (ringReq.cls === 'swipe') { const sw = +ringReq.sway || 0, v = Math.round(sw * (+ringReq.amp || GHOST_SWAY)); if (tg._sw !== v) { tg._sw = v; tg.style.setProperty('--sw', v + 'px'); tg.style.setProperty('--swr', (sw * 14).toFixed(1) + 'deg'); } }
  // a ring on Kevin (or within 90 px of him): its label goes to the far side, and Kevin's tag steps beside him
  { let near = false, on = false;
    if (R.youX != null && R.youY != null && race && race.p) {
      const kk = cv.clientWidth / VIEW_W, yx = R.youX * kk + cv.offsetLeft, yy = R.youY * kk + cv.offsetTop, d = Math.hypot(x - yx, y - yy);
      near = d < 90; on = d < 40;
    }
    // the label goes on the side away from Kevin: above the ring when the ring sits above him
    setC(tg, 'flip', near && y < R.youY * (cv.clientWidth / VIEW_W) + cv.offsetTop);
    if (on) R.youHold = 0.5; }
  // a faint dotted line from the fingertip (12 px above the ring's centre) up to Kevin
  { let lk = false;
    if (ringReq.link && R.youX != null && R.youY != null) {
      const kk = cv.clientWidth / VIEW_W, kx = R.youX * kk + cv.offsetLeft, ky = R.youY * kk + cv.offsetTop + 14;
      const dx = kx - x, dy = ky - (y - 12), L = Math.hypot(dx, dy);
      if (L > 24) {
        lk = true;
        const len = Math.round(L - 18), ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
        if (tg._lk !== len) { tg._lk = len; tg.style.setProperty('--lk', len + 'px'); }
        if (tg._la !== ang) { tg._la = ang; tg.style.setProperty('--la', ang + 'deg'); }
      }
    }
    setC(tg, 'lnk', lk); }
  setC(tg, 'down', ringReq.cls === 'down');
  setC(tg, 'bad', ringReq.tone === 'bad'); setC(tg, 'good', ringReq.tone === 'good');
  // a first look's ring fits round the thing (44 to 140 px); every other ring, and one waiting at the edge, is 44 px
  const sz = Math.round(ringReq.r > 0 && !edge && !scr ? clamp(2 * ringReq.r * k + 16, 44, 140) : 44);
  if (tg._sz !== sz) { tg._sz = sz; tg.style.width = tg.style.height = sz + 'px'; tg.style.margin = `${-sz / 2}px 0 0 ${-sz / 2}px`; }
  // a hazard's first look only counts as seen once its ring has really been on screen
  if (ringReq.haz && !S.seenHaz.includes(ringReq.haz)) { S.seenHaz.push(ringReq.haz); saveUI(); }
  setC(tg, 'hide', false); ringReq = null;
}
// early swims: the first time the tank runs low, point at the nearest fruit
let lowDone = false, lowRingT = 0, gas35Done = false, fruit55Done = false;
function lowTick(dt) {
  if (!race || race.demo || race.drill || meta.runs >= 3) return;
  const p = race.p;
  if (!lowDone && p.e < 30 && countT <= 0 && !race.pending) {
    lowDone = true; lowRingT = 4;
    coach(pickLine(LOW_ENERGY), 2.8, 2); buzz([30, 30, 30], true);
  }
  // swim 1: the fruit lesson when it matters, the first time the tank drops under 55% (TUT_TEXT.fruit, a 'grab!' ring)
  if (firstSwim && !fruit55Done && p.e / (p.maxE || 100) < 0.55 && countT <= 0 && !race.pending) {
    fruit55Done = true;
    const tx = TUT_TEXT.fruit && TUT_TEXT.fruit.t ? TUT_TEXT.fruit : TUT_ALL.fruit.d;
    queueCard({ id: 'fruitLow', ic: '🍓', t: tx.t, s: tx.s || '', sec: 3.5 });
  }
  // swim 1: the first time the tank drops under 35%, the nearest fruit gets a ring for 3 s
  if (firstSwim && !gas35Done && p.e / (p.maxE || 100) < 0.35 && countT <= 0 && !race.pending) { gas35Done = true; lowGasRingT = Math.max(lowGasRingT, 3); }
  if (lowGasRingT > 0) { lowGasRingT -= dt; const f = nearestFruit(700); if (f) ringAsk(f.x, f.y, 'fruit!', '', null, 'good', f.r); }
  if (lowRingT > 0) {
    lowRingT -= dt;
    const best = nearestFruit(700);
    if (best) ringAsk(best.x, best.y, 'fruit!');
  }
}
// the first time each hazard scrolls into view: a ring, one line and a short slow-down
const HAZ_KEY = { acid: 'acid', alkali: 'alkali', gate: 'gate', goo: 'goo', wbc: 'wbc', current: 'current', cilia: 'cilia', dna: 'dna', shield: 'helmet', sugar: 'sugar' };
// pickups, not dangers: they wait until the tutorial is done
const HAZ_SOFT = new Set(['dna', 'helmet', 'shield', 'sugar']);
const HAZ_BAD = new Set(['acid', 'goo', 'gate', 'wbc', 'cilia', 'current']);
let hazAt = -99, hazEnt = null, hazT = 0, hazSlowT = 0, hazPend = null;
// remixed hazards waiting for their first look: {id, l (the line), ent, y, at}
let hzQ = [];
function hazTick(dt) {
  if (hazSlowT > 0) hazSlowT -= dt;
  if (!race || race.demo || race.drill || eggOn) { hazT = 0; return; }
  const p = race.p;
  if (hazT > 0) {
    hazT -= dt;
    if (hazEnt && !hazEnt.dead) {
      let x = hazEnt.x;
      if (hazEnt.t === 'gate' && hazEnt.gaps && hazEnt.gaps.length) x = hazEnt.gaps.reduce((a, g) => (Math.abs(g - p.x) < Math.abs(a - p.x) ? g : a), hazEnt.gaps[0]);
      // dangers are red 'avoid!' (a goo gate's ring sits on its gap: 'gap!'), pickups green 'grab!'
      const bad = HAZ_BAD.has(hazEnt.t) && !hazEnt.popcorn, gr = hazEnt.t === 'gate' ? (+hazEnt.gw || 40) / 2 : +hazEnt.r || 0;
      ringAsk(x, hazEnt.y, hazEnt.t === 'gate' ? 'gap!' : bad ? 'avoid!' : 'grab!', '', hazPend, bad ? 'bad' : 'good', gr);
    }
    return;
  }
  hazPend = null;
  // the tutorial's own ring (fruit, draft) and the low-energy rescue come first: an intro waits, it is never used up unseen
  const tStep = tutCur();
  if (tStep === 'fruit' || tStep === 'draft' || tStep === 'cash' || lowRingT > 0 || lesson) return;
  if (firstSwim && clock - raceT0 < 6) return;
  if (clock - hazAt < 4 || bannerUp() || race.pending || countT > 0 || !$('cards').classList.contains('hide')) return;
  // swim 1: one text at a time. While a lesson card is up a first look waits (hazAt stays, so it tries again), unless
  // the danger is already within 260 px: then it takes the coach strip and the card steps aside until it is said
  const cardOn = firstSwim && (tutCardUp() || cardYield), maxDy = cardOn ? 260 : 450;
  const seen = S.seenHaz, soft = !!(tut && tut.on);
  let best = null, bd = 1e9, kind = null;
  for (const e of race.ents) {
    // (a POPCORN PATCH's dozing Big Macros have their own first look)
    const kk = e.t === 'wbc' && e.popcorn ? 'popcorn' : HAZ_KEY[e.t]; if (!kk || e.dead || seen.includes(kk) || !HAZARD_INTRO[kk]) continue;
    if (soft && (HAZ_SOFT.has(kk) || HAZ_SOFT.has(e.t))) continue;
    const dy = e.y - p.y; if (dy < 150 || dy > maxDy) continue;
    // a hazard of the next zone waits for its own zone: the Acid Lagoon never talks about goo walls
    if (zoneIndex(e.y) !== zoneIndex(p.y)) continue;
    if (e.side && p.side && e.side !== p.side) continue;
    // (on swim 1 only the dangers may talk over a card)
    if (cardOn && (!HAZ_BAD.has(e.t) || kk === 'popcorn')) continue;
    if (dy < bd) { bd = dy; best = e; kind = kk; }
  }
  // a remixed hazard's first look (core 'hzNew'): its Coach line and a red ring once it is 100 to 600 px ahead; one
  // that is gone or left behind waits for its next appearance (never marked seen unsaid)
  if (hzQ.length && !cardOn) {
    hzQ = hzQ.filter((q) => clock - q.at < 20 && !(q.ent && q.ent.dead) && (q.ent ? q.ent.y : q.y) - p.y > 100 && !seen.includes('hz_' + q.id));
    const q = hzQ.find((x) => (x.ent ? x.ent.y : x.y) - p.y <= 600 && zoneIndex(x.ent ? x.ent.y : x.y) === zoneIndex(p.y));
    if (q) {
      hazAt = clock;
      if (!coach(q.l, 2.4, 2)) return;
      hzQ = hzQ.filter((x) => x !== q);
      if (q.ent) { hazEnt = q.ent; hazT = 2.4; hazPend = 'hz_' + q.id; } else { seen.push('hz_' + q.id); saveUI(); }
      if (!S.reduced) hazSlowT = 0.7;
      return;
    }
  }
  if (!best && !cardOn && !seen.includes('forkSign') && HAZARD_INTRO.forkSign && C.FORK_Y0 - p.y > 150 && C.FORK_Y0 - p.y < 450) kind = 'forkSign';
  if (!kind) return;
  hazAt = clock;
  // a line that could not be said now is tried again in 4 s
  if (!coach(HAZARD_INTRO[kind], 2.4, 2)) return;
  hazEnt = best; hazT = best ? 2.4 : 0;
  // with a ring: seen once ringApply shows it; the fork sign has no ring, the line was the intro
  if (best) hazPend = kind; else { seen.push(kind); saveUI(); }
  if (!S.reduced) hazSlowT = 0.7;
}

// ------------------------------------------------------------------ input
// drag: the finger sets an offset from the tube centre, so the swimmer follows the tube's wiggle and never pins to a wall.
// Lifting the finger keeps that lane (holdOff) until the next touch or key.
const keys = {};
let lastSwish = -99;
const keyName = (k) => (k && k.length === 1 ? k.toLowerCase() : k);
const SKIP_GUARD_MS = 450;
let drag = null, lastSteerUpAt = -1e9, lastSteerUpX = 0, lastSteerUpY = 0, lastDown = 0, lastTapX = 0, lastTapY = 0, dashBuf = 0, lastDrillTap = 0, drillN = 0, holdOff = null, wallSide = 0;
// every finger on the play area (not on buttons): when the steering thumb lifts, another one still down takes over.
// An entry: { x, y, t0, x0, y0, lastMoveT (the last move of 4+ px), rest (a palm or a grip on the edge: never steers) }
const fingers = new Map();
function fingerAdd(e, rest, palm) {
  const now = performance.now();
  // palm: flagged by its contact size (a flat thumb on some Androids reports one too): it may still earn the steering
  // by travelling sideways (pointermove). pt0/px0: the start of its current 400 ms travel window
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: now, x0: e.clientX, y0: e.clientY, mx: e.clientX, my: e.clientY, lastMoveT: now, rest: !!rest,
    palm: !!palm, pt0: now, px0: e.clientX });
}
// a contact that is not a thumb: a palm (a big contact patch), or in portrait a second touch hugging the side edge (the
// hand that grips the phone)
const PALM_PX = 64, EDGE_PX = 26, PALM_PROMOTE_PX = 24, PALM_PROMOTE_MS = 400, GRIP_LOW_PX = 90, GRIP_SIDE_PX = 40;
const palmLike = (e) => (+e.width || 0) > PALM_PX || (+e.height || 0) > PALM_PX;
// a big patch (over 42 px: a flat thumb, or a palm) that was the only contact steers, but until it has travelled 24 px a
// second finger landing takes the steering over (it never dashes) and the patch rests from then on
const PALMISH_PX = 42;
const palmish = (e) => (+e.width || 0) > PALMISH_PX || (+e.height || 0) > PALMISH_PX;
const edgeGrip = (e) => !landscape() && (e.clientX < EDGE_PX || e.clientX > innerWidth - EDGE_PX);
// a second contact low on a side (the bottom 90 px, within 40 px of an edge) is the gripping hand's thumb root: it rests,
// silently (never a dash, never the 'refuse' wiggle). A touch on DASH itself is never a grip
const lowGrip = (e) => {
  if (e.target && e.target.closest && e.target.closest('#dashBtn')) return false;
  const b = APP.getBoundingClientRect().bottom || innerHeight;
  return e.clientY > b - GRIP_LOW_PX && (e.clientX < GRIP_SIDE_PX || e.clientX > innerWidth - GRIP_SIDE_PX);
};
// the last time the steering finger really moved (4+ px)
const dragMovedAt = (d) => { const f = d && fingers.get(d.id); return f ? f.lastMoveT : d ? d.lt : 0; };
// a handed-over drag (the thumb that was left on the glass) that has held still this long is taken by a new touch
const HANDED_STILL_MS = 600, HANDED_BACKSTOP_MS = 1200, HANDOFF_MOVE_MS = 500;
function clearInput() {
  drag = null; lastDown = 0; dashBuf = 0; holdOff = null; fingers.clear();
  for (const k of Object.keys(keys)) keys[k] = 0;
  dashPress = null; cashSrc = ''; try { cashPress = null; } catch (e) { /* declared below: not yet in use at boot */ }
  // a CASH press (or a drill tap's side) queued before a pause or a card pick never fires after resume
  if (race) { race.input.tx = null; race.input.dash = false; race.input.tap = 0; race.input.touch = false; race.input.dir = 0; race.input.finger = false;
    race.input.cashOut = false; race.input.tapSide = null;
    // drill taps queued past the bucket never land after a pause
    if (race.drill) race.drill.carry = 0; }
}
// a lost pointerup leaves a phantom steering finger (every later touch dashed, steering gone until a pause): a new primary
// touch means no other touch is on the glass, so a drag held by another pointer is a ghost. Kevin keeps its lane.
function dropPhantom(e) {
  if (!drag || e.pointerId === drag.id || !e.isPrimary) return;
  holdOff = drag.off; fingers.clear(); drag = null;
  if (race) race.input.finger = false;
}
const toWorldX = (clientX) => { const r = cv.getBoundingClientRect(); return (clientX - r.left) / r.width * VIEW_W; };
const playBlocked = () => !race || mode !== 'race' || race.paused || race.pending || race.over;
function band(y, side) {
  try { if (typeof C.playBand === 'function') { const b = C.playBand(y, side); if (b && Number.isFinite(b.l) && Number.isFinite(b.r) && b.r > b.l) return b; } } catch (e) { /* fall back */ }
  const ch = C.channel ? C.channel(y, side) : { c: VIEW_W / 2, h: 120 };
  return { l: ch.c - ch.h + 9, r: ch.c + ch.h - 9 };
}
const mid = (y) => (C.centre ? C.centre(y) : VIEW_W / 2);
let lastWallCue = -1e9;
// the rising edge of steering into a wall (side -1 left, +1 right): a fast swerve into it (220+ lateral speed) thuds
// (sfx 'wall', a kick off it, a little shake and a buzz); a slow lean only clicks ('edge'). Never twice within 250 ms
function wallCue(hit) {
  wallSide = hit;
  const nw = performance.now(); if (nw - lastWallCue < 250) return;
  lastWallCue = nw;
  const vx = race && race.p ? Math.abs(+race.p.vx || 0) : 0;
  if (vx > 220) { sfx('wall', { side: hit }); kick(hit < 0 ? 0.3 : -0.3, 0); trauma(0.12); buzz(12); }
  else { buzz(5); sfx('edge', hit); }
  // the wall itself answers (art: a squash and a ripple on that side), 0..1 by how hard Kevin swerved into it
  try { if (typeof R.wallHit === 'function') R.wallHit(hit, clamp(vx / 440, 0, 1)); } catch (e) { /* optional */ }
}
function steerTick() {
  if (!drag || !race || race.drill || mode !== 'race') return;
  const p = race.p, c = mid(p.y), b = band(p.y, p.side);
  let tx = c + drag.off0 + drag.acc;
  // wall feel: a tiny tick and the edge click (panned to that side) on the rising edge of the target being clamped at a wall,
  // re-armed once the finger is back 24 world px off it, and never twice within 250 ms
  const hit = tx <= b.l ? -1 : tx >= b.r ? 1 : 0;
  if (hit && hit !== wallSide) wallCue(hit);
  else if (wallSide && (wallSide < 0 ? tx > b.l + 24 : tx < b.r - 24)) wallSide = 0;
  // pushed past a wall: rebase the anchor so moving back responds at once
  if (tx < b.l) { tx = b.l; drag.off0 = tx - c; drag.acc = 0; }
  else if (tx > b.r) { tx = b.r; drag.off0 = tx - c; drag.acc = 0; }
  drag.off = tx - c;
  // a finger on the glass is playing even when it holds still (core reads input.finger)
  race.input.tx = tx; race.input.touch = true; race.input.finger = true;
}
// finger lifted: keep the lane it chose, following the tube's wiggle
function holdTick(kd) {
  if (race && !drag) race.input.finger = false;
  if (!race || race.drill || race.autopilot) { holdOff = null; return; }
  if (drag || kd || holdOff == null) return;
  const p = race.p, b = band(p.y, p.side);
  race.input.tx = clamp(mid(p.y) + holdOff, b.l, b.r); race.input.touch = true;
}
const lowForDash = () => { const p = race.p, cost = (race.s && race.s.dashCost) || 0; return p.e <= cost && !(race.muts && race.muts.nitro); };
function requestDash() {
  if (!race || race.drill) return;
  lastInputAt = clock;
  if (lowForDash()) { refuseDash(); return; }   // only an empty tank says no at once
  // a cooldown about to end waits a beat (0.2 s at most); a longer one says no, and its arc pulses so the wait shows
  const cd = +race.p.dashCd || 0;
  if (cd > 0.2) { refuseDash(true); return; }
  race.input.dash = true; dashBuf = Math.min(0.2, Math.max(0.15, cd + 0.05));
}
let cdPulseAt = -1e9;
function refuseDash(cool) {
  const b = $('dashBtn');
  if (cool) {
    const now = performance.now(); if (now - cdPulseAt < 250) return; cdPulseAt = now;
    b.classList.remove('cdp'); void b.offsetWidth; b.classList.add('cdp'); buzz(6); return;
  }
  b.classList.remove('refuse'); void b.offsetWidth; b.classList.add('refuse'); buzz(6);
}
// cash the combo in on purpose (long press on DASH, or a quick swipe down)
// src: 'btn' (the CASH chip), 'hold' (long press on DASH), 'swipe', 'key'
let cashSrc = '';
function cashOut(src = '') {
  if (playBlocked() || race.drill || countT > 0) return;
  race.input.cashOut = true; buzz(10); cashSrc = src;
}
// drill taps: throttled per finger (45 ms), so two thumbs drum twice as fast. A raw tap only clicks; the burst, the shake
// and the buzz wait for core's 'drillTap' event (the taps it really counted)
const lastDrillTapId = new Map();
// side: the half of the screen tapped (-1 left, +1 right); without one (SPACE) the tap goes to the side of the rival
// that is winding up a move. Core counters a tell only with taps on that rival's side (input.tapSide)
function drillTap(id = 'k', side = 0) {
  const now = performance.now();
  // a hit-stop holds the sim: taps queue up (6 while it holds, 3 otherwise), so a slow-mo never eats a drum roll
  if (now - (lastDrillTapId.get(id) || 0) < 45 || race.input.tap - ((race.drill && race.drill.carry) || 0) >= (stopT > 0 ? 6 : 3)) return;
  lastDrillTapId.set(id, now); lastDrillTap = now; race.input.tap++; drillN++;
  const sd = side === -1 || side === 1 ? side : clock < tellOn && (tellSide === -1 || tellSide === 1) ? tellSide : 0;
  race.input.tapSide = sd || null;
  sfx('drill', drillN);
}
// the whole app takes touches, so the gutters steer too in landscape
const APP = $('app');
// iOS in the browser (not added to the home screen): its back swipe starts on the left edge
const IOS_BACK = (() => {
  try {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints | 0) > 1);
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone;
  } catch (e) { return false; }
})();
// the bottom safe area in CSS px (measured from a probe, refreshed on resize)
let safeBpx = 0;
function measureSafeB() {
  try {
    const pr = document.createElement('div');
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(pr); safeBpx = pr.offsetHeight || 0; pr.remove();
  } catch (e) { safeBpx = 0; }
}
measureSafeB();
// a touch that starts within the safe area + 20 px of the bottom: the home-indicator strip
const nearBottom = (y) => { const b = APP.getBoundingClientRect().bottom || innerHeight; return y > b - safeBpx - 20; };
const smooth01 = (x) => x * x * (3 - 2 * x);

// re-grip: a new touch carries on from the lane Kevin was aiming for (the held lane, else the live target), so lifting and
// touching again never snaps him back to where he is; only a target 140+ world px from Kevin falls back to his spot
function gripOff(prefer) {
  const p = race.p, c = mid(p.y);
  let off = prefer != null ? prefer : race.input.tx != null ? race.input.tx - c : p.x - c;
  if (!Number.isFinite(off) || Math.abs(c + off - p.x) > 140) off = p.x - c;
  return off;
}
// the steering gain and acceleration for the band Kevin is in now. Finger acceleration: slow moves are precise, fast
// swipes carry further, on a fixed reference width (340 to 430 CSS px). A narrow band damps the acceleration (accK); a wide
// one (the Sea) gets a gain floor so a 150 CSS px swipe at 600 px/s crosses it, capped at 1.15x the base gain: past that
// the acceleration is raised instead, so slow moves stay precise
function steerGainLive(w) {
  const cw = w || (cv.getBoundingClientRect().width || 1);
  const bb = race && race.p ? band(race.p.y, race.p.side) : { l: 0, r: 300 }, bw = bb.r - bb.l;
  let accK = 0.7 * clamp((bw - 180) / 160, 0.35, 1);
  const ramp = (v, k) => 1 + k * smooth01(clamp((v - ACCEL_FROM) / 1200, 0, 1));
  const baseGain = (VIEW_W / clamp(cw, 340, 430)) * S.sens, want = (bw / 150) / ramp(600, accK) * S.sens / 1.6;
  const gain = Math.max(baseGain, Math.min(want, 1.15 * baseGain));
  if (want > gain) { const s6 = smooth01(clamp((600 - ACCEL_FROM) / 1200, 0, 1)); if (s6 > 0) accK = Math.min(2.2, accK + ((want / gain) * (1 + accK * s6) - (1 + accK * s6)) / s6); }
  return { gain, accK };
}
function newDrag(id, x, y, now, extra, off) {
  const o = off != null ? off : gripOff(null);
  // a new touch snaps to the live gain (it eases only while the finger stays down)
  let g0 = null; try { if (race && !race.demo) g0 = steerGainLive(0); } catch (e) { g0 = null; }
  return Object.assign({ gain: g0 ? g0.gain : 0, accK: g0 ? g0.accK : 0, gT: now, id, t0: now, x0: x, y0: y, lx: x, lt: now, v: 0, acc: 0, off0: o, off: o, moved: 0, hx: 0, flick: false, dashed: false,
    win: [], ring: [], flArmed: true, flFrozen: false, flTop: y, flLock: null, cashUsed: false, cashT0: null, flickT: -1e9, nearFlick: false }, extra);
}
// the whole document takes the play touches, so the margins beside the app on a wide portrait screen steer too
document.addEventListener('pointerdown', (e) => {
  if (mode !== 'race' || playBlocked()) return;
  if (e.target && e.target.closest && e.target.closest('button,.ov')) return;
  if (performance.now() - introGoAt < 350) return;
  // the OS back swipe: only iOS Safari (in the browser, not added to the home screen) owns a strip, 12 px on the left.
  // The right edge always plays.
  if (IOS_BACK && e.clientX < 12) return;
  downSeq++;
  dropPhantom(e);
  if (e.pointerType === 'touch') touchUsed = true;
  // a palm never steers or dashes: it rests on the glass. But the only contact (no other finger, no drag) is never a palm:
  // a flat thumb on some Androids reports a big patch, and refusing it would leave the game with no steering at all
  if (!race.drill && palmLike(e) && (fingers.size > 0 || drag)) { fingerAdd(e, true, true); return; }
  // a handed-over drag (a thumb left resting when the steering one lifted) that has held still: this touch takes the
  // steering (it never dashes); the old thumb rests from now on
  let took = null;
  if (drag && e.pointerId !== drag.id && drag.handed && !race.drill && performance.now() - dragMovedAt(drag) > HANDED_STILL_MS) {
    const of = fingers.get(drag.id); if (of) of.rest = true;
    took = drag.off; drag = null; race.input.finger = false;
  }
  if (drag && e.pointerId !== drag.id && drag.palmish && !race.drill && drag.moved < PALM_PROMOTE_PX) {
    const of = fingers.get(drag.id); if (of) { of.rest = true; of.palm = true; of.pt0 = performance.now(); of.px0 = of.x; }
    took = drag.off; drag = null; race.input.finger = false;
  }
  // a second thumb: dash (or drill) without stealing the steering finger. A grip on the side edge (portrait) only rests
  const tapSd = e.clientX < innerWidth / 2 ? -1 : 1;
  if (drag && e.pointerId !== drag.id) {
    if (!race.drill && (edgeGrip(e) || lowGrip(e))) { fingerAdd(e, true); return; }
    fingerAdd(e, false);
    if (race.drill) { if (countT <= 0) drillTap(e.pointerId, tapSd); } else if (countT <= 0) requestDash();
    return;
  }
  fingerAdd(e, false);
  try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  if (race.drill) { holdOff = null; if (countT <= 0) drillTap(e.pointerId, tapSd); return; }
  const off0 = gripOff(took != null ? took : holdOff); holdOff = null;
  const now = performance.now();
  // a double tap dashes: a first tap under 180 ms and 12 px, then the second within 280 ms and 48 px of it. Swim 1 only
  // once the DASH card has shown; before that a double tap is a tapping player (stillTap: the drag hint)
  const dbl = !took && lastDown && now - lastDown < DBL_GAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < DBL_GAP_PX;
  const dblOk = !firstSwim || !!(tut && tut.shown && tut.shown.dash);
  let fed = false;
  if (dbl && !dblOk) { stillTap(now); fed = true; lastDown = 0; }
  else if (dbl && countT <= 0) { requestDash(); lastDown = 0; }
  drag = newDrag(e.pointerId, e.clientX, e.clientY, now, { dashed: dbl && dblOk, tapFed: fed, palmish: palmish(e) }, off0);
  // a touch that starts on the home-indicator strip steers, but its upward swipe is the OS's: no flick dash from it
  if (nearBottom(e.clientY)) { drag.flArmed = false; drag.flLock = 'edge'; }
  steerTick();
  if (race.autopilot) { race.autopilot = false; hint(UIL('autopilotOff', 'Autopilot off. You are driving!'), 2, 1); }
  // the opening count: a thumb on the glass means ready, so it goes now
  countGoNow();
});
// one-thumb flick dash: the finger went up 46+ px in the last 120 ms at 680+ px/s, mostly straight (|dx| < 0.4 |dy|), so
// frantic steering never dashes by accident.
// It re-arms once the finger slows under 200 px/s or comes back down 20 px; the steering freezes while the flick runs
// (and the sideways drift of the flick itself is undone), so a dash never jerks Kevin sideways.
// The same ring (the last 200 ms of samples, 24 at most) sees a cash swipe mid-drag: 110+ px down within 160 ms at
// 650+ px/s, mostly straight (|dx| < 0.35 dy), on a drag at least 200 ms old (a fresh touch that lands moving is steering).
// A drag that started on DASH or CASH (startBtn) counts its age from when the finger first got 30+ px from where it went
// down (cashT0), and no cash swipe lands in the 250 ms after a flick dash.
// It freezes the steering the same way and fires once a drag (drag.cashUsed; drag.flick only stops the lift being a tap).
// A near flick (35+ px straight up at 420 to 680 px/s), seen twice in a swim, gets one coach line ever: snap it harder.
// A locked re-arm (flLock: 'edge' for a touch from the bottom strip, 'cash' after a cash swipe) waits for a real stop.
const ACCEL_FROM = 220;   // px/s: the finger acceleration ramp starts here
const FLICK_UP = 46, FLICK_MS = 120, FLICK_V = 680, FLICK_STRAIGHT = 0.4, CASH_DOWN = 110, CASH_MS = 160, CASH_V = 650, CASH_STRAIGHT = 0.35, CASH_MIN_AGE = 200;
const CASH_BTN_SLIDE = 30, CASH_AFTER_FLICK = 250, FLICK_NEAR_UP = 35, FLICK_NEAR_V = 420, DBL_TAP_MS = 180, DBL_TAP_PX = 12, DBL_GAP_MS = 280, DBL_GAP_PX = 48;
function flickTick(d, x, y, t) {
  const r = d.ring; r.push({ x, y, t, acc: d.acc });
  while (r.length > 24 || (r.length > 2 && t - r[0].t > 200)) r.shift();
  if (d.startBtn && d.cashT0 == null && Math.hypot(x - d.x0, y - d.y0) >= CASH_BTN_SLIDE) d.cashT0 = t;
  const cashAge = d.startBtn ? (d.cashT0 == null ? -1 : t - d.cashT0) : t - d.t0;
  // a swipe down cashes the pot in, wherever the drag is
  if (!d.cashUsed && r.length > 1 && cashAge >= CASH_MIN_AGE && t - d.flickT >= CASH_AFTER_FLICK) {
    let o = null; for (const q of r) if (t - q.t <= CASH_MS) { o = q; break; }
    if (o && o !== r[r.length - 1]) {
      const down = y - o.y, v = down / Math.max(6, t - o.t) * 1000;
      if (down >= CASH_DOWN && v >= CASH_V && Math.abs(x - o.x) < CASH_STRAIGHT * down && potReady() && countT <= 0 && !playBlocked() && !race.drill) {
        d.cashUsed = true; d.flick = true; d.flArmed = false; d.flFrozen = true; d.flLock = 'cash'; d.acc = o.acc;
        cashOut('swipe'); return;
      }
    }
  }
  if (!d.flArmed) {
    d.flTop = Math.min(d.flTop, y);
    const a = r[r.length - 2], vy = a ? Math.abs(y - a.y) / Math.max(6, t - a.t) * 1000 : 0;
    if (d.flLock) { if (a && r.length >= 3 && vy < 200) { d.flLock = null; d.flArmed = true; d.flFrozen = false; } }
    else if (vy < 200 || y - d.flTop >= 20) { d.flArmed = true; d.flFrozen = false; }
    return;
  }
  let o = null; for (const q of r) if (t - q.t <= FLICK_MS) { o = q; break; }
  if (!o || o === r[r.length - 1]) return;
  const up = o.y - y, dx = Math.abs(x - o.x), v = up / Math.max(6, t - o.t) * 1000;
  // the press that already dashed (DASH button, double tap) gets 300 ms before a flick may dash again
  if (up >= FLICK_UP && v > FLICK_V && dx < FLICK_STRAIGHT * up && !(d.dashed && t - d.t0 < 300) && countT <= 0 && !playBlocked()) {
    d.flArmed = false; d.flFrozen = true; d.flTop = y; d.flick = true; d.flickT = t; d.acc = o.acc;
    flickAt = clock; requestDash();
    return;
  }
  // a near flick: straight up but too slow. Twice in one swim, one coach line (once a save)
  if (!d.nearFlick && up >= FLICK_NEAR_UP && v >= FLICK_NEAR_V && v <= FLICK_V && dx < FLICK_STRAIGHT * up && countT <= 0 && !playBlocked() && race && !race.drill && !race.demo) {
    d.nearFlick = true; flickNear++;
    if (flickNear >= 2 && !S.flickHardSeen && coach(lineOr(K.FLICK_HARDER, 'Faster flick! Snap it UP!'), 2.4, 1)) { S.flickHardSeen = true; saveUI(); }
  }
}
document.addEventListener('pointermove', (e) => {
  const f = fingers.get(e.pointerId);
  if (f) { f.x = e.clientX; f.y = e.clientY; if (Math.hypot(f.x - f.mx, f.y - f.my) >= 4) { f.mx = f.x; f.my = f.y; f.lastMoveT = performance.now(); } }
  // a palm-flagged contact that travels 24+ CSS px sideways within 400 ms while nothing steers is a thumb after all
  if (f && f.palm && f.rest && !drag) {
    const nw = performance.now();
    if (nw - f.pt0 > PALM_PROMOTE_MS) { f.pt0 = nw; f.px0 = f.x; }
    else if (Math.abs(f.x - f.px0) >= PALM_PROMOTE_PX) { f.rest = false; f.palm = false; try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ } }
  }
  // no steering finger (the backstop dropped a ghost): a finger still on the glass that moves takes over (never a palm)
  if (!drag && f && !f.rest && race && mode === 'race' && !playBlocked() && !race.drill) { drag = newDrag(e.pointerId, e.clientX, e.clientY, performance.now(), { flick: true, dashed: true, handed: true }, gripOff(holdOff)); holdOff = null; }
  if (!drag || e.pointerId !== drag.id || !race) return;
  { const cr = cv.getBoundingClientRect(); R.thumbY = e.clientY - cr.top; }   // the camera lifts Kevin off a low thumb (render.js)
  const w = cv.getBoundingClientRect().width || 1;
  // every sample the browser coalesced into this event (a 120 Hz finger on a 60 Hz frame), in order
  let list = null; try { list = e.getCoalescedEvents ? e.getCoalescedEvents() : null; } catch (err) { list = null; }
  if (!list || !list.length) list = [e];
  let sdxSum = 0;
  for (const ce of list) {
    const t = ce.timeStamp || e.timeStamp || performance.now(), sdx = ce.clientX - drag.lx;
    drag.win.push({ x: ce.clientX, t }); while (drag.win.length > 2 && t - drag.win[0].t > 50) drag.win.shift();
    if (!drag.flFrozen) sdxSum += sdx;
    drag.lx = ce.clientX; drag.lt = t; drag.hx += Math.abs(sdx);
    drag.moved = Math.max(drag.moved, Math.hypot(ce.clientX - drag.x0, ce.clientY - drag.y0));
    flickTick(drag, ce.clientX, ce.clientY, t);
  }
  // finger speed in CSS px/s over the last 50 ms (at least 6 ms), smoothed once per event
  const w0 = drag.win[0], w1 = drag.win[drag.win.length - 1];
  const sp = w0 && w1 && w1 !== w0 ? Math.abs(w1.x - w0.x) / Math.max(6, w1.t - w0.t) * 1000 : 0;
  drag.v += (sp - drag.v) * 0.4;
  // a hard swerve (a fast flick sideways while Kevin really moves): a swish panned to the turn
  if (race && drag.v > 1100 && Math.abs(+race.p.vx || 0) > 280 && clock - lastSwish > 0.16 && !playBlocked()) {
    lastSwish = clock; sfx('swerve', { pan: Math.sign(race.p.vx), v: clamp((drag.v - 1100) / 1400, 0, 1) });
  }
  // finger acceleration: slow moves are precise, fast swipes carry further. The gain is on a fixed reference width (340 to
  // 430 CSS px), so a tablet or a wide phone never steers twitchier than a small one; in a narrow band the acceleration is
  // damped (accK), so a fast flick there never slams Kevin from wall to wall
  // The gain and the acceleration are frozen for the drag (newDrag): while the finger is down they only ease toward the
  // live value (1.5 a second at most), so a band that widens under the thumb never changes how far a move goes mid-swipe
  if (!drag.flFrozen && sdxSum) {
    const lv = steerGainLive(w), nt = performance.now(), sdt = clamp((nt - (drag.gT || nt)) / 1000, 0, 0.1); drag.gT = nt;
    if (!(drag.gain > 0)) { drag.gain = lv.gain; drag.accK = lv.accK; }
    else { const st = 1.5 * sdt; drag.gain += clamp(lv.gain - drag.gain, -st, st); drag.accK += clamp(lv.accK - drag.accK, -st, st); }
    const accel = 1 + drag.accK * smooth01(clamp((drag.v - ACCEL_FROM) / 1200, 0, 1));
    drag.acc += sdxSum * drag.gain * accel;
  }
  if (dashHold && e.pointerId === dashHold.id && Math.hypot(e.clientX - dashHold.x0, e.clientY - dashHold.y0) > 20) dashHoldEnd();
  dashPressMove(e);
  if (sdxSum) tutSteer(sdxSum);
  if (sdxSum && drag.moved > 2) lastInputAt = clock;
  // swim 1's first real drag (20 px): the tail answers at once, a puff, a tick and a buzz
  if (firstSwim && !firstPuff && drag.moved > 20 && countT <= 0 && !playBlocked()) firstPuffFx();
  steerTick();
});
const up = (e) => {
  fingers.delete(e.pointerId);
  if (dashHold && e.pointerId === dashHold.id) dashHoldEnd();
  if (e.type === 'pointerup') dashPressUp(e); else if (dashPress && dashPress.id === e.pointerId) dashPress = null;
  if (!drag || e.pointerId !== drag.id) return;
  // a cancelled pointer (the OS took the touch, or capture was lost) is not a lift: no handoff, no tap, no dash
  const cancel = e.type !== 'pointerup';
  const now = performance.now(), d = drag;
  drag = null; R.thumbY = null;
  if (race) race.input.finger = false;
  if (cancel) { if (race) race.input.tx = null; holdOff = d.off; return; }
  // a steering thumb that just lifted: a DASH (or CASH) press right after it is the same thumb landing, not a press
  if (!d.fromDash) { lastSteerUpAt = now; lastSteerUpX = e.clientX; lastSteerUpY = e.clientY; }
  // thumb handoff: another finger is still on the glass, it steers on from the lane this one held. A finger the browser
  // no longer knows (the capture throws) is a ghost: it is dropped and this is a normal lift
  // Only a thumb (never a palm or an edge grip) that moved in the last 500 ms takes over: a still one is resting
  if (race && mode === 'race' && !playBlocked() && !race.drill && fingers.size) {
    let id = null, f = null;
    for (const [k, v] of fingers) if (!v.rest && now - v.lastMoveT <= HANDOFF_MOVE_MS) { id = k; f = v; break; }
    let ok = id != null;
    if (ok) { try { APP.setPointerCapture(id); } catch (err) { ok = false; fingers.delete(id); } }
    if (ok) {
      drag = newDrag(id, f.x, f.y, now, { flick: true, dashed: true, handed: true }, gripOff(d.off));
      steerTick();
      return;
    }
  }
  if (race) { race.input.tx = null; race.input.touch = false; if (!race.drill) holdOff = d.off; }
  // a quick, still touch is a tap: the next touch soon after (and close by) dashes
  if (!d.dashed && !d.flick && now - d.t0 < DBL_TAP_MS && d.moved < DBL_TAP_PX) {
    lastDown = d.tapFed ? 0 : now; lastTapX = e.clientX; lastTapY = e.clientY;
    if (!d.tapFed) { stillTap(now); const seq = downSeq, cx = e.clientX, r0 = race; setTimeout(() => { if (downSeq === seq && race === r0) stillNudge(cx); }, DBL_GAP_MS + 10); }
  }
  else lastDown = 0;
};
document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); document.addEventListener('lostpointercapture', up);
// no OS gestures mid-swim: no scroll, no pull-to-refresh, no long-press menu, no text callout
const blockOS = (e) => {
  if (mode !== 'race') return;
  const t = e.target; if (t && t.closest && t.closest('button,.ov')) return;
  if (e.cancelable) e.preventDefault();
};
APP.addEventListener('touchstart', blockOS, { passive: false });
APP.addEventListener('touchmove', blockOS, { passive: false });
addEventListener('contextmenu', (e) => e.preventDefault());
const DASH_KEYS = [' ', 'ArrowUp', 'w'];
let lastPauseKeyAt = -1e9;
const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'a', 'd'];
addEventListener('keydown', (e) => {
  unlock();
  const k = keyName(e.key);
  if (k === 'm' && !e.repeat) { toggleMute(); return; }
  if (k === 'Escape' || k === 'p') {
    // a held key repeats, and a double press within 250 ms is one press
    if (e.repeat || performance.now() - lastPauseKeyAt < 250) return;
    if (mode === 'race' && race && !race.over && !race.pending) { lastPauseKeyAt = performance.now(); if (race.paused) { if (settingsUp()) $('setBack').click(); else resume(); } else pause(); }
    return;
  }
  if (mode === 'result') {
    if (!$('trickbook').classList.contains('hide')) { if (k === 'Escape' || k === 'Backspace') $('tbBack').click(); return; }
    if (!$('records').classList.contains('hide')) { if (k === 'Escape' || k === 'Backspace') $('recBack').click(); return; }
    // a focused button other than SWIM AGAIN (Habits, Brag, the menu) takes Enter and Space itself (its own click)
    { const ae = document.activeElement; if ((k === ' ' || k === 'Enter') && ae && ae.tagName === 'BUTTON' && ae.id !== 'againBtn' && !$('result').classList.contains('hide')) return; }
    if ((k === ' ' || k === 'Enter') && resultReady && !$('result').classList.contains('hide')) { e.preventDefault(); again(); }
    return;
  }
  if (mode === 'race' && (finHold || birthOn) && (k === ' ' || k === 'Enter')) {
    e.preventDefault();
    const nowMs = performance.now();
    if (e.repeat || nowMs - lastDrillTap < SKIP_GUARD_MS) { lastDrillTap = nowMs; return; }
    if (finHold) finishSkip(); else birthSkip();
    return;
  }
  if (!race || mode !== 'race') return;
  if (race.pending) {
    if (!cardsLive() || e.repeat) return;
    // 1..9 picks (a golden draft deals more than 3), R rerolls
    if (/^[1-9]$/.test(k) && +k <= race.pending.length) pick(race.pending[+k - 1]);
    else if (k === 'r') reroll();
    return;
  }
  if (race.paused || race.over) return;
  if (DASH_KEYS.includes(k)) {
    e.preventDefault();
    if (e.repeat || countT > 0) return;
    if (race.drill) drillTap('key:' + k); else requestDash();
    return;
  }
  if (k === 's' || k === 'ArrowDown') { if (!e.repeat) cashOut('key'); return; }
  keys[k] = 1;
  // at the egg Left/A and Right/D drum on that side of the egg
  if (race.drill && STEER_KEYS.includes(k)) { if (!e.repeat && countT <= 0) drillTap('key:' + k, k === 'ArrowLeft' || k === 'a' ? -1 : 1); return; }
  if (STEER_KEYS.includes(k)) { holdOff = null; tutSteer(k === 'ArrowLeft' || k === 'a' ? -25 : 25); }
});
addEventListener('keyup', (e) => { keys[keyName(e.key)] = 0; });
// long press on DASH cashes the combo in, but only when there is a pot worth it (combo 10+, bank 3+).
// A ring fills round the button (--hold) for 800 ms; sliding 20 px or off the button cancels.
const HOLD_MS = 800;
// the hold only arms for a player who knows cashing: the lesson done and 3 cash-ins by the CASH chip
const holdCashOk = () => !!S.cashDone && (S.cashBtnN | 0) >= 3;
let dashHold = null;
// the tutorial's cash step takes any pot it asked for (combo 3+, bank 3+)
const potReady = () => !!race && race.p.bank >= 3 && (race.p.combo >= 10 || (tutCur() === 'cash' && race.p.combo >= 3));
function dashHoldEnd() {
  dashHold = null; const b = $('dashBtn');
  if (b._hold !== 0) { b._hold = 0; b.style.setProperty('--hold', '0'); b.classList.remove('holding'); }
}
function dashHoldTick() {
  if (!dashHold) return;
  if (playBlocked() || race.drill || !potReady()) { dashHoldEnd(); return; }
  const f = clamp((performance.now() - dashHold.t0) / HOLD_MS, 0, 1), b = $('dashBtn'), v = Math.round(f * 100) / 100;
  if (b._hold !== v) { b._hold = v; b.style.setProperty('--hold', String(v)); }
  if (f >= 1) { dashHoldEnd(); cashOut('hold'); buzz(8, true); }
}
// portrait, one thumb: a DASH press that turns into a steering slide must not dash. It fires on release (under 260 ms), or
// after 45 ms held under 10 px, and a slide of 10+ px first cancels it. A press within 100 ms (and 60 px) of the steering
// thumb lifting may be that thumb coming to rest (restOnly): it never fires on a hold, only on a quick release (under
// 180 ms, under 10 px), so a lift-and-tap still dashes; one that slides steers, and the button wiggles so the press is
// never silently lost. A second finger (another one steers) and landscape fire at once.
const DASH_HOLD_MS = 45, DASH_STILL_MS = 260, DASH_REST_MS = 100, DASH_SLIDE = 10, DASH_REST_UP_MS = 180;
let dashPress = null;
function dashPressFire() { const d = dashPress; if (!d || d.fired) return; d.fired = true; if (!playBlocked() && countT <= 0 && race && !race.drill) requestDash(); }
function dashPressMove(e) {
  const d = dashPress; if (!d || d.fired || e.pointerId !== d.id) return;
  d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
  if (d.moved >= DASH_SLIDE) { dashPress = null; if (d.restOnly) refuseDash(); }
}
function dashPressUp(e) {
  const d = dashPress; if (!d || e.pointerId !== d.id) return;
  dashPress = null;
  if (d.fired) return;
  if (performance.now() - d.t0 < (d.restOnly ? DASH_REST_UP_MS : DASH_STILL_MS) && d.moved < DASH_SLIDE) { dashPress = d; dashPressFire(); dashPress = null; }
  else if (d.restOnly) refuseDash();
}
function dashPressTick() {
  const d = dashPress; if (!d || d.fired) return;
  const age = performance.now() - d.t0;
  if (age >= DASH_STILL_MS) { dashPress = null; return; }
  // a resting thumb never fires on a hold: only its quick release does (dashPressUp)
  if (!d.restOnly && age >= DASH_HOLD_MS && d.moved < DASH_SLIDE) dashPressFire();
}
$('dashBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); unlock();
  dropPhantom(e);
  if (playBlocked() || countT > 0) return;
  if (race.drill) { drillTap(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); return; }
  // the steering thumb landing back (within 100 ms and 60 px of where it lifted): a restOnly press (a quick tap still dashes)
  const instant = !!drag || landscape();
  // one thumb doing both (no other finger steering): after 3 such presses, the flick shortcut, once a save
  if (e.pointerType === 'touch' && !drag && !S.flickTip && K.FLICK_TIP) {
    S.dashBtnOne = (S.dashBtnOne | 0) + 1;
    if (S.dashBtnOne >= 3 && coach(K.FLICK_TIP, 3, 1)) S.flickTip = true;
    saveUI();
  }
  const resting = !drag && !landscape() && performance.now() - lastSteerUpAt < DASH_REST_MS && Math.hypot(e.clientX - lastSteerUpX, e.clientY - lastSteerUpY) < 60;
  if (instant) requestDash();
  else dashPress = { id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 0, fired: false, restOnly: resting };
  dashHoldEnd();
  if (holdCashOk() && potReady()) { dashHold = { id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY }; $('dashBtn').classList.add('holding'); }
  // the thumb that pressed DASH steers too when no other finger does: sliding off the button just keeps swimming
  if (!drag) {
    drag = newDrag(e.pointerId, e.clientX, e.clientY, performance.now(), { flick: true, dashed: true, fromDash: !resting, startBtn: true }, gripOff(holdOff));
    fingerAdd(e, false); holdOff = null;
    try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  }
});
$('dashBtn').addEventListener('pointermove', (e) => { if (dashHold && e.pointerId === dashHold.id && Math.hypot(e.clientX - dashHold.x0, e.clientY - dashHold.y0) > 20) dashHoldEnd(); dashPressMove(e); });
// (not pointerleave: the press hands its pointer to the steering drag, which moves the capture off the button)
for (const ev of ['pointerup', 'pointercancel']) $('dashBtn').addEventListener(ev, (e) => { if (dashHold && e.pointerId === dashHold.id) dashHoldEnd(); if (ev === 'pointerup') dashPressUp(e); else if (dashPress && dashPress.id === e.pointerId) dashPress = null; });
function toggleMute() {
  meta.muted = !meta.muted; applyAudio(); save(); $('muteChk').checked = meta.muted; syncMute();
}
function syncMute() { for (const b of document.querySelectorAll('.muteBtn')) { b.textContent = meta.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', meta.muted ? 'Sound off' : 'Sound on'); } }
for (const b of document.querySelectorAll('.muteBtn')) b.onclick = (e) => { e.stopPropagation(); unlock(); toggleMute(); };

// ------------------------------------------------------------------ pause, background, settings
let settingsFrom = 'pause';
// a pause inside the opening countdown keeps what was left of it: resume runs that count (its GO, its sfx('go'), swim 1's
// FIRST_GO_LINE), never the shorter "resume" one
let pauseCountRest = 0, pausedStreak = null;
function pause() {
  if (mode !== 'race' || !race || race.pending || race.over || race.paused) return;
  pauseCountRest = countT > 0 && !countFromPause ? countT : 0;
  race.paused = true; pickT = 0; $('cards').classList.remove('out'); clearInput(); slowT = 0; freezeT = 0; syncMute();
  // a pause wipes every timed state: the countdown restarts on resume, slow-mo and the crawl start over
  countT = 0; goT = 0; lastCount = 0; $('count').className = ''; crawlOn = false; hazSlowT = 0; lessonSlowT = 0; dashHoldEnd();
  // a trick streak's pop waiting on the hold is kept (pausedStreak): it lands on the resume count's GO, never under the
  // pause card
  if (trickStreakPend) { pausedStreak = trickStreakPend; trickStreakPend = null; }
  // a big hold that was live lets the band's gasp go softly (no snap under the pause card)
  if (stopT > 0 && hitHold && hitHold.ms >= 60) { try { if (A.impactRelease) A.impactRelease(59); } catch (e) { /* optional */ } }
  // a hit-stop or a sim remainder never carries across a pause
  stopT = 0; simAcc = 0; hitHold = null; trickStreakPend = null;
  setT($('pauseTip'), pickLine(TIPS)); quitDisarm();
  show('pause'); muffle(true); slowmoReset(); audSlow = false; audSlowT = 0;
}
function resume() {
  if (!race || !race.paused) return;
  unlock(); race.paused = false; clearInput(); show(null); muffle(false);
  if (meta.openRun && meta.openRun.paused) { openRunPaused(false); save(); }
  // a short "2, 1, GO" so the thumb is back on the glass before the tube moves (at the drill too: no lost taps)
  if (!race.over && !race.pending) {
    lastCount = 0;
    // the beat may have changed (a zone's bpm): the count is in the band's own beats
    countUnit = 0.6; try { if (typeof A.countBeat === 'function') { const b = +A.countBeat(); if (Number.isFinite(b) && b >= 0.25 && b <= 1.2) countUnit = b; } } catch (e) { /* default */ }
    // the opening count picks up on a whole beat (never under one); a normal pause counts 2, 1, GO
    if (pauseCountRest > 0) { countT = Math.max(countUnit, Math.ceil(pauseCountRest / countUnit - 1e-6) * countUnit); countFromPause = false; }
    else { countT = 2 * countUnit; countFromPause = true; }
  }
  pauseCountRest = 0;
  govHold(3);
}
const settingsUp = () => !$('settings').classList.contains('hide');
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = resume;
// Give up takes a second tap: the first arms it for 2.5 s
let quitArmT = 0;
function quitDisarm() { clearTimeout(quitArmT); quitArmT = 0; const b = $('quitBtn'); b.classList.remove('arm'); b.textContent = 'Give up'; }
$('quitBtn').onclick = () => {
  if (!race || race.over) return;
  const b = $('quitBtn');
  if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Tap again to give up'; buzz(10); clearTimeout(quitArmT); quitArmT = setTimeout(quitDisarm, 2500); return; }
  quitDisarm(); countT = 0; clearInput(); coClear(); coachClear();
  // the swim ends first (still paused, so no frame can run in between); a throw in end() is the crash rescue, never a
  // half-closed pause card over a live tube
  try { race.end('quit'); } catch (e) { console.error(e); race.paused = false; crashOut(); return; }
  race.paused = false; show(null); muffle(false); };
// how far the open swim got (systems: C.runProgress(meta, y)), noted on the way to the background and every ~5 s of race clock
let progAt = 0, progSaveAt = 0;
function runProgressNote() {
  if (mode === 'race' && race && !race.demo && !race.over && typeof C.runProgress === 'function') { try { C.runProgress(meta, race.p.y, race.p.maxE > 0 ? clamp(race.p.e / race.p.maxE, 0, 1) : 1, race.rank); } catch (e) { /* optional */ } }
}
// the open swim is paused (or not): a paused swim the OS discards later is forgiven at the next boot (C.runPaused)
function openRunPaused(on) {
  const o = meta.openRun; if (!o) return;
  try { if (typeof C.runPaused === 'function') C.runPaused(meta, on, Date.now()); else { o.paused = !!on; o.pausedAt = on ? Date.now() : 0; } } catch (e) { /* optional */ }
}
function toBackground() {
  runProgressNote();
  save(); clearInput();
  if (mode === 'race' && race && !race.over && !race.demo && !race.pending) { pause(); if (race.paused) { openRunPaused(true); save(); } }
  // the cards stay up while away: no half-held DASH ring, and no muffled band left behind
  // (a tab discarded on the deal is a paused swim too, never a rage quit that costs the streak)
  else if (mode === 'race' && race && race.pending && !race.demo && !race.over) { dashHoldEnd(); if (meta.openRun && !meta.openRun.paused) { openRunPaused(true); save(); } }
  // a blur with the page still on screen (a notification, devtools, a second window) keeps the band running
  if (document.hidden) { try { A.suspend(); } catch (e) { /* ignore */ } }
}
// back from away (focus or the tab showing again): the win beat or the birth re-arms, so the first tap back is never a skip
function backFromAway() {
  if (mode !== 'race' || !(finHold || birthOn)) return;
  if (finHold) { finHold.ready = Math.max(finHold.ready, clock + 0.6); finHold.readyMs = Math.max(finHold.readyMs, performance.now() + 600); }
  if (birthOn) birthOn.at = Math.max(birthOn.at, clock - 0.5);
  muffle(false);
}
document.addEventListener('visibilitychange', () => {
  govReset();
  // the win beat or the birth is up: the band goes behind the filter while away, and the first tap back is never a skip
  const fin = mode === 'race' && (finHold || birthOn);
  if (document.hidden) { if (fin) muffle(true); toBackground(); return; }
  // outside a live swim, another tab may have written the save while this one was away: read it before anything saves
  if (!liveRace()) { reloadMeta(); staleUI(); }
  const away = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
  unlock();
  backFromAway();
  // back to a card deal: the band stays behind the cards' filter
  if (mode === 'race' && race && race.pending && cardsLive()) muffle(true);
  // the deal is back on screen: the open swim is live again (toBackground marked it paused)
  if (mode === 'race' && race && race.pending && meta.openRun && meta.openRun.paused) { openRunPaused(false); save(); }
  // a fresh frame: the canvas may have been dropped while away
  drawKey = '';
  const long = away >= 15 * 60000;
  if (mode === 'title') {
    // a quick app switch keeps whatever was open; a long break rebuilds the title and says welcome back
    if (!$('title').classList.contains('hide') && long) { title(); maybeWelcome(away); }
    else { titleStats(); renderFactory(); badges(); }
  } else if (mode === 'result' && long && resultReady) {
    // back to a result card after a long break: the title, and what Dad's factory made meanwhile
    resAnim = null; resultReady = false; title(); maybeWelcome(away);
  } else if (mode === 'race' && long && race && !race.demo && (race.paused || race.pending)) {
    // a paused swim keeps its pause card: the welcome waits for the next title, a toast says the DNA is there
    pendingAway = Math.max(pendingAway, away);
    // what the factory made while away (not the whole bank, which may hold an older pile)
    const b0 = +meta.bank || 0;
    try { idleTick(meta, Date.now()); } catch (e) { /* optional */ }
    const made = Math.floor((+meta.bank || 0) - b0);
    if (made >= 1) toast(fillLine(UIL('factoryWaiting', "Dad's factory made +{dna} DNA. It waits on the menu."), { dna: fmt(made) }), 2800);
    save();
  }
});
// a long break seen during a paused swim: the welcome card plays on the next title
let pendingAway = 0;
// the OS back gesture: one step back inside the game (a swim pauses, a sub-screen goes to its Back button, the story
// skips, the result goes to the menu), and the guard entry goes back on. On the title a back leaves the page.
const pushGuard = () => { try { if (!(history.state && history.state.mto)) history.pushState({ mto: 1 }, ''); } catch (e) { /* sandboxed */ } };
const openOv = () => OVERLAYS.find((o) => !$(o).classList.contains('hide')) || null;
// popAt: the last back gesture handled. Two within 250 ms are one gesture (a pause must never resume on its own echo)
let popAt = -1e9;
addEventListener('popstate', () => {
  const ov = openOv(), nw = performance.now();
  if (nw - popAt < 250) { pushGuard(); return; }
  popAt = nw;
  if (ov === 'settings') $('setBack').click();
  else if (mode === 'race') {
    if (race && !race.demo && !race.over && race.paused && ov === 'pause') resume();
    // the deal is live: a back never skips the pick; the cards shake no
    else if (race && !race.demo && !race.over && race.pending && cardsLive()) {
      buzz(8);
      const row = $('cardRow');
      if (row && !row.classList.contains('locked')) { row.classList.add('locked', 'lockShake'); setTimeout(() => { row.classList.remove('lockShake'); if (cardsReady) row.classList.remove('locked'); }, 300); }
      else if (row) { row.classList.remove('lockShake'); void row.offsetWidth; row.classList.add('lockShake'); setTimeout(() => row.classList.remove('lockShake'), 300); }
    } else if (race && !race.demo && !race.over && !race.pending) pause();
  }
  else if (mode === 'intro') $('introSkip').click();
  else if (ov === 'shop') { shopSwim = false; $('shopBack').click(); }
  else if (ov === 'album') $('albumBack').click();
  else if (ov === 'trickbook') $('tbBack').click();
  else if (ov === 'records') $('recBack').click();
  else if (ov === 'welcome') $('wbClose').click();
  else if (mode === 'result') { if (resultReady) { resAnim = null; title(); } }
  else if (ov === 'title' || mode === 'title') return;
  pushGuard();
});
addEventListener('focus', () => { unlock(); backFromAway(); drawKey = ''; });

addEventListener('blur', toBackground);
addEventListener('pagehide', toBackground);
function openSettings(from) {
  settingsFrom = from; show('settings');
  $('setMusic').checked = S.music; $('setSfx').checked = S.sfx; $('setHaptics').checked = S.haptics; $('setReduced').checked = S.reduced; $('setNoFlash').checked = !!S.noFlash;
  $('setMusicVol').value = S.mvol; $('setSfxVol').value = S.svol; $('setLefty').checked = S.lefty; $('setMono').checked = !!S.mono;
  { const g = $('setGentle'); if (g) g.checked = !!S.gentle; }
  $('setMix').checked = S.mix !== 'playback'; setC($('setMixRow'), 'hide', !(typeof navigator !== 'undefined' && navigator.audioSession && typeof A.setSessionType === 'function'));
  for (const b of $('setSens').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === S.sens);
  for (const b of $('setGfx').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === S.gfx);
  $('setHapticsRow').classList.toggle('hide', !navigator.vibrate && !IOS_TICK);
  muffle(from === 'pause');
}
$('pauseSetBtn').onclick = () => openSettings('pause');
$('titleSetBtn').onclick = () => openSettings('title');
$('setBack').onclick = () => (settingsFrom === 'pause' ? show('pause') : title());
$('setMusic').onchange = (e) => { S.music = e.target.checked; saveUI(); applyAudio(); };
$('setSfx').onchange = (e) => { S.sfx = e.target.checked; saveUI(); applyAudio(); sfx('tap'); };
$('setMusicVol').oninput = (e) => { S.mvol = clamp(+e.target.value || 0, 0, 1); applyAudio(); };
$('setMusicVol').onchange = () => saveUI();
$('setSfxVol').oninput = (e) => { S.svol = clamp(+e.target.value || 0, 0, 1); applyAudio(); };
$('setSfxVol').onchange = () => { saveUI(); sfx('tap'); };
$('setHaptics').onchange = (e) => { S.haptics = e.target.checked; saveUI(); buzz(25, true); };
$('setReduced').onchange = (e) => { S.reduced = e.target.checked; S.redSet = true; saveUI(); document.body.classList.toggle('reduced', S.reduced); if (H.combo) H.combo._sw = null; try { if (A.setCalm) A.setCalm(S.reduced); } catch (err) { /* optional */ } };
$('setNoFlash').onchange = (e) => { S.noFlash = e.target.checked; R.noFlash = S.noFlash; saveUI(); };
$('setMono').onchange = (e) => { S.mono = e.target.checked; saveUI(); applyAudio(); sfx('tap'); };
// Gentle sound: softer highs and fewer sharp stingers (audio: A.setGentle)
$('setGentle').onchange = (e) => { S.gentle = e.target.checked; saveUI(); try { if (typeof A.setGentle === 'function') A.setGentle(!!S.gentle); } catch (err) { /* optional */ } sfx('tap'); };
$('setMix').onchange = (e) => { S.mix = e.target.checked ? 'ambient' : 'playback'; S.mixSet = true; saveUI(); applyAudio(); sfx('tap'); };
$('setLefty').onchange = (e) => { S.lefty = e.target.checked; saveUI(); document.body.classList.toggle('lefty', S.lefty); };
for (const b of $('setSens').querySelectorAll('button')) b.onclick = () => { S.sens = +b.dataset.v; saveUI(); openSettings(settingsFrom); sfx('tap'); };
for (const b of $('setGfx').querySelectorAll('button')) b.onclick = () => { S.gfx = b.dataset.v; saveUI(); applyGfx(); openSettings(settingsFrom); sfx('tap'); };
// any settings change: the frozen frame under the pause card is drawn again (a pause skips redraws until its key changes)
for (const id of ['setMusic', 'setSfx', 'setMusicVol', 'setSfxVol', 'setHaptics', 'setReduced', 'setNoFlash', 'setMono', 'setGentle', 'setLefty']) $(id).addEventListener('change', () => { drawKey = ''; });
for (const b of $('setSens').querySelectorAll('button')) b.addEventListener('click', () => { drawKey = ''; });
// a lost GPU context (a phone under memory pressure): ask for it back, then redraw from scratch
cv.addEventListener('contextlost', (e) => { e.preventDefault(); });
cv.addEventListener('contextrestored', () => { drawKey = ''; try { R.resize(); } catch (e) { /* the next resize retries */ } });
$('setTut').onclick = () => {
  // a full replay: every lesson and first look comes back (and the runs >= 15 migration must not skip the hazards again)
  S.tutDone = false; S.tutTries = 0; S.cashDone = false; S.cashN = 0; S.drillSeen = false; S.frenzySeen = false;
  S.seenHaz = []; S.tutSkipped = []; S.tutReplay = true; saveUI();
  $('setTut').textContent = 'Tutorial on next swim ✓';
};

// ------------------------------------------------------------------ mutation cards: slow-mo stinger, then a dramatic deal
let revealT = 0, pickT = 0, cardsReady = false, cardsTO = 0;
const cardsLive = () => !$('cards').classList.contains('hide') && !$('cards').classList.contains('out');
function cardStinger() {
  { const ho = drag ? drag.off : holdOff; clearInput(); holdOff = ho; }
  revealT = S.reduced ? 0.12 : 0.6;
  const p = race.p;
  sfx('deal'); buzz([20, 40, 30]); muffle(true);
  if (!S.reduced) { R.flash = 0.45; R.flashCol = 'rgba(255,240,200,0.5)'; if (R.zoomPunch) R.zoomPunch(0.14); }
  trauma(0.35);
  if (R.ring) R.ring(p.x, p.y, '#ffd75c', 120, 0.6, 7);
  if (R.confetti) R.confetti(p.x, p.y, 40);
  R.pop(p.x, p.y + 90, race.pendingMid ? 'HALFWAY BONUS!' : UIL('zoneClear', 'ZONE CLEARED!'), '#ffd75c', 26, 1.2);
}
// combo hints on a card: up to 2 partner lines (a partner you hold first, then undiscovered combos, then ones you have seen).
// The first draft only gets one plain line.
function completesPair(id) {
  return SYNERGIES.some((sy) => !(race.syn && race.syn[sy.id]) && sy.needs.includes(id) && sy.needs.every((n) => n === id || race.muts[n] > 0));
}
function partnerLines(id, plain) {
  // the pairs line is for swim 3 on: the first swims only learn what a card does
  if ((meta.runs | 0) < 2) return '';
  const seen = meta.synergiesSeen || [], held = [], fresh = [], known = [];
  for (const s of SYNERGIES) {
    if ((race.syn && race.syn[s.id]) || !s.needs.includes(id)) continue;
    const others = s.needs.filter((n) => n !== id);
    if (others.every((n) => race.muts[n] > 0)) { const r = SYNERGY_SHORT[s.id]; held.push(`<div class="syn">${s.icon} Completes MASHUP: ${esc(s.name)}!${r ? `<small>${esc(r)}</small>` : ''}</div>`); continue; }
    // never tease a partner that can no longer be dealt this swim
    if (typeof race.canOffer === 'function' && others.some((n) => !(race.muts[n] > 0) && !race.canOffer(n))) continue;
    const o = MUTATIONS[others[0]]; if (!o) continue;
    const isKnown = seen.includes(s.id);
    if (plain) { fresh.push(`<div class="syn half">Pairs with ${o.icon} ${esc(o.name)} for a secret mashup</div>`); continue; }
    (isKnown ? known : fresh).push(`<div class="syn half">Pairs with ${o.icon} ${esc(o.name)} for ${isKnown ? s.icon + ' ' + esc(s.name) : 'a secret mashup'}</div>`);
  }
  return held.concat(fresh, known).slice(0, plain ? 1 : 2).join('');
}
let offerGolden = false, cpAutoTO = 0;
// Coach's pick on the first deal of the early swims: a card that completes a pair, else the rarest, else the first
function coachPickOf(ids) {
  const done = ids.find((id) => completesPair(id)); if (done) return done;
  let best = ids[0];
  for (const id of ids) if (MUTATIONS[id] && MUTATIONS[best] && MUTATIONS[id].r > MUTATIONS[best].r) best = id;
  return best;
}
// a deal that throws or shows no card takes the first card itself, so the zone stinger can never loop
function dealCards() {
  let dealt = false;
  try { cards(); dealt = !!$('cardRow').querySelector('.card') && !$('cards').classList.contains('hide'); } catch (e) { console.error(e); }
  if (dealt || !race || !race.pending) return;
  clearTimeout(cardsTO); cardsReady = false; offerGolden = false;
  race.choose(race.pending[0]);
  show(null); muffle(false); clearInput(); revealT = 0;
}
function cards() {
  const zi = race.zoneReached, firstDraft = firstSwim && (race.draftN || 1) <= 1 && !race.pendingMid;
  // the very first deal is short: MUTATE!, 'Tap one!' and three cards (the stinger already said ZONE CLEARED)
  setC($('cardsSub'), 'hide', firstDraft);
  { const pl = `<span class="nw">PLACE #${fmt(race.rank)}</span>`;
    $('cardsSub').innerHTML = firstDraft ? 'ZONE 1 CLEARED' : race.pendingMid ? `HALFWAY BONUS · ${pl}` : `${esc(ZONES[Math.max(0, zi - 1)].name.toUpperCase())} CLEARED · ${pl}`; }
  setT($('cardsH'), offerGolden ? 'GOLDEN DRAFT' : 'MUTATE!'); setC($('cards'), 'golden', offerGolden);
  // the first swims' first deal also says what the next zone holds (K.NEXT_ZONE_TEASE, by the zone not reached yet)
  const nz = !race.pendingMid && (race.draftN | 0) <= 1 && (meta.runs | 0) < 3 && ZONES[zi] ? (K.NEXT_ZONE_TEASE || {})[ZONES[zi].id] || '' : '';
  // the first deal's heading is K.FIRST_DRAFT_HEAD; later deals use a K.CARDS_LINE_MORE line one time in two
  const more = Array.isArray(K.CARDS_LINE_MORE) && K.CARDS_LINE_MORE.length && Math.random() < 0.5 ? pickLine(K.CARDS_LINE_MORE) : '';
  const cl = firstDraft ? K.FIRST_DRAFT_HEAD || 'Tap one!' : more || 'Pick one. It lasts until this swim ends.';
  // (the first deal keeps its line and adds the tease as a small second one)
  if (firstDraft) {
    const ft = ZONES[zi] ? (K.NEXT_ZONE_TEASE || {})[ZONES[zi].id] || '' : '';
    $('cardsLine').innerHTML = esc(K.FIRST_DRAFT_HEAD || 'Tap one. Evolution, but fast.') + (ft ? `<small class="tz">${esc(ft)}</small>` : '');
    $('cardsLine')._v = null;
  } else setT($('cardsLine'), nz || cl);
  $('cardsOwned').innerHTML = Object.keys(race.muts).map((id) => MUTATIONS[id] ? `<span title="${esc(MUTATIONS[id].name)}">${MUTATIONS[id].icon}${race.muts[id] > 1 ? `<b>${race.muts[id]}</b>` : ''}</span>` : '').join('');
  let lastEnd = 0;
  const cp = (race.draftN || 1) <= 1 && !race.pendingMid && (meta.runs | 0) < 3 ? coachPickOf(race.pending) : null;
  const cpTag = (id) => (id === cp ? `<span class="cp">COACH'S PICK</span>` : '');
  // the first deal: the joke is always on Coach's pick (the descriptions never count against the screen's words)
  const fdJoke = firstDraft && !!cp && !!MUT_FLAVOR[cp];
  $('cardRow').innerHTML = race.pending.map((id, k) => {
    const m = MUTATIONS[id], have = race.muts[id] || 0, delay = k * (firstDraft ? 0.15 : 0.1);
    lastEnd = Math.max(lastEnd, delay + (m.r === 3 ? 0.7 : 0.5));
    // the very first deal: the icon, the name and what it does, one card at a time
    if (firstDraft) return `<button class="card simple r${m.r}${id === cp ? ' cpick' : ''}" data-id="${id}" style="animation-delay:${delay.toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="nm">${esc(m.name)}</div><div class="ds">${esc((K.FIRST_DEAL_DESC || {})[id] || m.desc)}</div>${id === cp && fdJoke ? `<div class="fl">${esc(MUT_FLAVOR[id])}</div>` : ''}</div>${cpTag(id)}${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
    const lvl = firstDraft ? ['COMMON', 'RARE', 'LEGENDARY'][m.r - 1] : `${['COMMON', 'RARE', 'LEGENDARY'][m.r - 1]} · ${have ? `LV ${have} → ${have + 1}` : 'NEW'}${m.max > 1 ? ' of ' + m.max : ''}`;
    const fl = MUT_FLAVOR[id] ? `<div class="fl">${esc(MUT_FLAVOR[id])}</div>` : '', mash = completesPair(id), pb = mash ? '<span class="pb">MASHUP!</span>' : '';
    // the level that maxes it out unlocks its capstone: say what it is
    const capI = (K.MUTATION_CAPSTONES || {})[id], capL = capI && capI.name && Array.isArray(C.MUT_CAPSTONE_IDS) && C.MUT_CAPSTONE_IDS.includes(id) && m.max > 1 && have + 1 === m.max ? `<div class="syn capst">⭐ MAX: ${esc(capI.name)}${capI.line ? `<small>${esc(capI.line)}</small>` : ''}</div>` : '';
    return `<button class="card r${m.r}${mash ? ' mash' : ''}" data-id="${id}" style="animation-delay:${delay.toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="lvl">${lvl}${pb}<span class="key">${k + 1}</span></div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>${capL}${fl}${partnerLines(id, false)}</div>${cpTag(id)}${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
  }).join('');
  // a card that completes a combo gets a shimmer once the deal lands
  const completes = race.pending.some(completesPair);
  for (const b of $('cardRow').querySelectorAll('.card')) b.onclick = () => pick(b.dataset.id);
  $('rerollBtn').classList.toggle('hide', race.rerolls <= 0);
  $('rerollBtn').textContent = `🎲 Reroll · Rerolls: ${race.rerolls}`;
  // no taps until the last card has landed
  cardsReady = false; $('cardRow').classList.add('locked'); clearTimeout(cardsTO);
  const dealRace = race;
  // (the first deal is tappable within 1.0 s; Coach's pick then pulses gently)
  cardsTO = setTimeout(() => {
    if (race !== dealRace || !race.pending || mode !== 'race') return;
    cardsReady = true; $('cardRow').classList.remove('locked');
 const cpk = $('cardRow').querySelector('.card.cpick'); if (cpk) cpk.classList.add('cpk');
    // the first deal: a 5 s ring round Coach's pick, which takes it when it runs out (a thumb that froze still swims on)
    if (firstDraft && cpk) {
      cpk.classList.add('auto'); cpk.style.setProperty('--autoT', (S.reduced ? 5 : 5) + 's');
      clearTimeout(cpAutoTO);
      cpAutoTO = setTimeout(() => { if (race === dealRace && race.pending && cardsReady && mode === 'race' && !race.paused && cardsLive() && !document.hidden) pick(cpk.dataset.id); }, 5000);
    }
  }, S.reduced ? 80 : firstDraft ? Math.min(1000, Math.round(lastEnd * 1000) + 30) : Math.round(lastEnd * 1000) + 30);
  $('cards').classList.remove('out'); show('cards');
  // the flavour lines are a bonus: drop them when they would push a card off a short screen
  // (measured from layout boxes, so the deal animation's transforms do not count)
  const co = $('cards'); co.classList.remove('nofl');
  const last = $('rerollBtn').classList.contains('hide') ? $('cardRow') : $('rerollBtn');
  if (last.offsetTop + last.offsetHeight + 12 > co.clientHeight) co.classList.add('nofl');
  sfx('cards');
  const dealLive = () => race === dealRace && mode === 'race' && cardsLive() && !document.hidden;
  if (race.pending.some((id) => MUTATIONS[id].r === 3)) setTimeout(() => { if (dealLive()) { sfx('legendary'); buzz([10, 30, 10]); } }, 380);
  if (completes) setTimeout(() => { if (dealLive()) sfx('synTease'); }, Math.round(lastEnd * 1000) + 300);
}
function reroll() { if (cardsReady && race && race.pending && race.rerolls > 0 && race.reroll()) { sfx('reroll'); buzz(10); dealCards(); } }
$('rerollBtn').onclick = reroll;
// the card just picked (a max-1 card is 'maxed' by its own pick: no MAXED pop on top of the pick)
let justPicked = null;
function pick(id) {
  if (!race || !race.pending || !cardsReady) return;
  const el = $('cardRow').querySelector(`.card[data-id="${id}"]`), mid = !!race.pendingMid;
  if (!race.choose(id)) return;
  justPicked = { id, ms: performance.now() };
  // the deal is over: the open swim is live again (toBackground may have marked it paused)
  if (meta.openRun && meta.openRun.paused) { openRunPaused(false); save(); }
  // the pick is in: no second pick, and a late "cards ready" timer can never unlock a dead row
  cardsReady = false; clearTimeout(cardsTO); clearTimeout(cpAutoTO);
  offerGolden = false;
  // Kevin holds the lane he had when the cards came up (clearInput drops it)
  { const ho = holdOff; clearInput(); holdOff = ho; }
  sfx('pick'); buzz(18);
  if (el) el.classList.add('picked');
  $('cards').classList.add('out'); pickT = S.reduced ? 0.05 : 0.28; document.body.classList.remove('cardsUp');
  muffle(false);
  const zi = race.zoneReached, z = ZONES[zi];
  if (!mid) {
    if (zi >= tutEndZone()) tutFinish();
    coachClear();
    zoneArrive(zi, { t: z.name, z: `ZONE ${zi + 1}`, sec: 1.6 });
    if (race.p.combo < 20 && !familyCoach(z)) coach(zoneCoach(z.id), firstSwim ? 4.5 : 3, 1);
    A.bpm = z.beat;
    // the zone's stinger plays on the new beat, as the zone begins (the deal had its own sting)
    sfx('zone');
  }
  setIntensity();
  if (mid) sfx('resume');
  R.pop(race.p.x, race.p.y + 60, MUTATIONS[id].icon + ' ' + MUTATIONS[id].name, '#ffd75c', 18, 1.6);
  // a ready beat: the tube eases back in from slow (never faster than it already is)
  if (!S.reduced) timeScale = Math.min(timeScale, 0.35);
}

// ------------------------------------------------------------------ events -> juice
let bankedNow = false, leadK = -1, leadSaid = 0, kevLeadFx = false, kindPopT = -9;
let bonkN = 0, shoveAt = {}, coreHas = {}, passedOnce = new Set(), rivalIntro = [], lastBubble = -99, eggClaimed = false, rivalF = 0, rivalK = -1, passBlip = false, lastBlip = 0;
// hit-stop: the frame holds for ms. Only the big ones (60 ms+) make the music gasp, and at most one gasp per 0.5 s.
// With a place (x, y) the hit thing flashes white for the hold (R.impactFrame).
let lastImpact = -99;
// a leaky freeze budget: frozenRecent counts the seconds held lately (it drains 1 a second). Past 0.12 s the small holds
// shrink to 30% and the ones that end up under 20 ms are skipped, so a pile-up never turns into stutter.
// force: FRENZY, milestones, a shield hit, second wind and Kevin taking the egg lead always land in full.
let frozenRecent = 0, finPopUntil = -99;
const BIG_HOLDS = new Set(['frenzy', 'milestone', 'shieldHit', 'second', 'kevin', 'finisher']);
// hitHold: the hold now running (its size, kind and the direction the hit pushes Kevin), released in frameBody
let hitHold = null;
// replace: the rate limiter's bigger hit takes over the running hold, but only once it has passed the freeze budget
// (a replace that the budget then skips must never kill the hold that is running)
// kdx, kdy (optional): the kick on release, in place of the one worked out from where the hit came from
function hitStop(ms, x, y, kind, force, replace, kdx, kdy) {
  if (!race || race.demo) return;
  // no hold is running: whatever an old one left behind is stale (it would replay its kind and kick on a later release)
  if (stopT <= 0) hitHold = null;
  // reduced motion keeps the beat but short: 50 ms at most (90 ms for Kevin's last frame, a death or a win)
  if (S.reduced) ms = Math.min(ms, kind === 'death' || (kind === 'kevin' && force) ? 90 : 50);
  // a short hold (under 45 ms) reads as stutter on a phone: it becomes a zoom punch and a little shake instead
  if (!force && ms < 45 && kind !== 'razor') { try { if (R.zoomPunch) R.zoomPunch(0.03 + ms / 1000); } catch (e) { /* optional */ } trauma(0.12); return; }
  if (!force && !BIG_HOLDS.has(kind) && frozenRecent > 0.12) { ms *= 0.3; if (ms < 20) return; }
  if (replace) { stopT = 0; hitHold = null; }
  frozenRecent += ms / 1000;
  stopT = Math.max(stopT, ms / 1000);
  // the kick on release: away from where the hit came from (camera units: +dx right, +dy back down the tube)
  let dx = 0, dy = 0;
  if (x != null && y != null && race.p) { const hx = race.p.x - x, hy = y - race.p.y, d = Math.hypot(hx, hy); if (d > 1) { dx = hx / d * 0.35; dy = hy / d * 0.35; } }
  if (kdx != null || kdy != null) { dx = +kdx || 0; dy = +kdy || 0; }
  if (!hitHold || ms >= hitHold.ms) hitHold = { ms, kind: kind || '', dx, dy };
  if (ms >= 60 && clock - lastImpact >= 0.5) { lastImpact = clock; try { if (A.impact) A.impact(ms); } catch (e) { /* optional */ } }
  if (x != null && y != null) { try { if (R.impactFrame) R.impactFrame(x, y, kind || 'hit', ms / 1000); } catch (e) { /* optional */ } }
}
// a big finisher's receipt, built a term at a time (120 ms a step): 31 LINKS x1.6 STYLE x1.3 CLUTCH ... = +84 DNA.
// x1.0 terms are skipped; each step ticks (sfx 'tally'); reduced motion shows the final line only
function finisherTally(ev, dnaS, x, y) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const sm = typeof C.styleMult === 'function' ? C.styleMult(ev.style) : 1;
  const terms = [`${ev.n | 0} LINKS`];
  for (const [v, nm] of [[sm, 'STYLE'], [1 + clamp(+ev.clutch || 0, 0, 0.5), 'CLUTCH'], [1 + Math.max(0, +ev.trick || 0), 'TRICKS'], [+ev.mult || 1, 'FINISHER']]) {
    if (Number.isFinite(v) && r1(v) !== 1) terms.push(`x${r1(v).toFixed(1)} ${nm}`);
  }
  terms.push(`= +${dnaS} DNA`);
  // a phone line holds about 30 characters: the receipt rolls, the oldest terms scroll off the front
  const win = (k) => { let a = terms.slice(0, k), cut = false; while (a.length > 1 && a.join(' ').length > 30) { a = a.slice(1); cut = true; } return (cut ? '.. ' : '') + a.join(' '); };
  const tr = race;
  if (S.reduced) { R.pop(x, y + 160, win(terms.length), '#fff1b0', 16, 1.8); return; }
  let tp = null;
  terms.forEach((_, i) => later(0.12 * i, () => {
    if (race !== tr || !race || race.over) return;
    const txt = win(i + 1);
    // the same pop grows (its sprite is baked again); a pop the renderer already dropped starts a new one
    if (tp && R.pops.includes(tp)) { tp.text = txt; tp.spr = null; tp.life = 1.4; tp.max = 1.4; tp.age = 0.2; }
    else { R.pop(race.p.x, race.p.y + 160, txt, '#fff1b0', 16, 1.4); tp = R.pops[R.pops.length - 1] || null; if (tp && tp.text !== txt) tp = null; }
    sfx('tally', { i, n: terms.length });
  }));
}
// near misses (a close pass, a dodge): a punch and a nudge away from the danger, at most 3 a second (no hold)
let nearAt = [];
function nearMissFx(ev, p) {
  nearAt = nearAt.filter((t) => clock - t < 1);
  if (nearAt.length >= 3) return;
  nearAt.push(clock);
  const x = ev.x != null ? ev.x : p.x, y = ev.y != null ? ev.y : p.y;
  let hunted = false;
  if (ev.kind === 'dodge') for (const e of race.ents) if (e.t === 'wbc' && !e.dead && e.hunt > 0.5 && Math.hypot(e.x - x, e.y - y) < 80) { hunted = true; break; }
  // no hold for a near miss (they come in floods): a hunted dodge breathes with a short slow-mo instead
  if (hunted) slow(0.18);
  // slipped a hunting Big Macro: a small breath of relief beside Kevin
  if (hunted && Array.isArray(K.PHEW_LINES) && K.PHEW_LINES.length) R.pop(p.x + (x < p.x ? 30 : -30), p.y + 34, pickLine(K.PHEW_LINES), '#bfefff', 13, 0.8);
  if (R.zoomPunch) R.zoomPunch(0.03);
  kick(x < p.x ? 0.25 : -0.25, 0); buzz(8);
}
// a named rival yelps in its own voice, 30 ms after the boing that hurt it
function rivalOuch(k) { if (k >= 0 && RIVALS[k]) setTimeout(() => { if (mode === 'race') sfx('rivalOuch', k); }, 30); }
// a rival talks: a babble of syllables by the line's length, panned to where they are. Never on swim 1, never on top of a
// stinger that just played (0.25 s)
function babble(k, text) {
  if (firstSwim || !text || performance.now() - lastStingerAt < 250) return;
  const ki = typeof k === 'number' ? k : RIVALS.findIndex((q) => first(q.name) === first(k)); if (ki < 0) return;
  const a = race && race.agents ? race.agents[ki] : null, pan = a && race.p ? clamp((race.agentX(a) - race.p.x) / 160, -1, 1) : 0;
  sfx('babble', { k: ki, n: clamp(Math.round(String(text).length / 6), 2, 7), pan });
}
// the duel panel's small line (DU.ep) is never rewritten while the drill runs and a tap landed in the last 0.6 s
const epBusy = () => !!(race && race.drill && !race.over) && performance.now() - lastDrillTap < 600;
// a bubble over the rival already says who is talking: 'Steve: "Sorry!"' reads 'Sorry!'
function bubbleText(k, text) {
  let tx = chadFix(text);
  const r = typeof k === 'number' ? RIVALS[k] : RIVALS.find((q) => first(q.name) === first(k));
  const nm = r ? first(r.name) : '';
  // any leading 'Name:' or 'Name,' (a tell line, a counter line) goes, with the quotes round what follows
  if (nm && tx.startsWith(nm)) { const m = tx.slice(nm.length).match(/^\s*[:,]\s*("?)/); if (m) { tx = tx.slice(nm.length + m[0].length); if (m[1]) tx = tx.replace(/"\s*$/, ''); } }
  return tx;
}
// the egg duel is live (its panel shows): rival lines go to their own duel bubbles (R.duelSay)
const duelLive = () => !!(eggOn && race && race.drill && !race.over && !DU.ui.classList.contains('hide'));
// at the egg a rival's line is a short duel bark (K.RIVAL_EGG_BARKS[name][slot]: tell, hit, countered, arrive, lose), in
// its own bubble over the rival for 1.2 s, never held back by the drumming (the thumb reads a bubble over the rival, not
// the panel). The long line is the fallback. A tell wins over a react line from the same rival while it is up
function duelLine(k, text, slot, force) {
  const r = typeof k === 'number' ? RIVALS[k] : RIVALS.find((q) => first(q.name) === first(k));
  const ki = r ? RIVALS.indexOf(r) : -1, key = ki >= 0 ? ki : String(k);
  const bark = r && slot ? (byFirst(K.RIVAL_EGG_BARKS || {}, r.name) || {})[slot] : null;
  const line = (Array.isArray(bark) && bark.length ? pickLine(bark) : typeof bark === 'string' ? bark : '') || text;
  if (!line) return false;
  if (slot !== 'tell' && clock < (duelTellUntil[key] || -99)) return false;
  if (!force && slot !== 'tell' && clock - (duelAt[key] ?? -99) < 0.8) return false;
  const tx = bubbleText(k, line), sk = ki >= 0 ? ki : k;
  if (typeof R.duelSay === 'function') R.duelSay(sk, tx, 1.2);
  else if (R.say) R.say(sk, tx, 1.2);
  else return false;
  duelAt[key] = clock; lastBubble = clock;
  if (slot === 'tell') duelTellUntil[key] = clock + 1.2;
  babble(sk, tx); return true;
}
function sayRival(k, text, dur = 2.2, force, slot) {
  // at the egg: a duel bubble (a bark for its slot, else this line), never gated by epBusy (the panel's .ep strip is
  // THE EGG's own voice now)
  if (duelLive()) return duelLine(k, text, slot || '', force);
  if (!text || (!force && clock - lastBubble < 5)) return false;
  if (!R.say) return false;
  const tx = bubbleText(k, text);
  lastBubble = clock; R.say(k, tx, dur); babble(k, tx); return true;
}
let epUntil = -99;
// a rival's own reaction line (RIVAL_REACTS[name][kind]), through the same 5 s bubble throttle
function react(k, kind, dur = 2.2) {
  const r = RIVALS[k]; if (!r) return false;
  return sayRival(k, pickLine(reactsOf(r.name)[kind]), dur);
}
// hit-stop is rate limited: one per 0.14 s (0.08 s for the big ones, BIG_HOLDS), so a pile-up never freezes the frame
// inside that window a bigger hit (1.3x what is left of the hold) replaces the current one
// (a small hit in the window with no hold running is dropped: the frame just moved again, a second freeze is stutter;
// the big ones, BIG_HOLDS, may still start one). kdx, kdy: the shove that lands when the hold lets go
let lastHitStop = -99;
function hitStopRL(ms, x, y, kind, kdx, kdy) {
  const big = BIG_HOLDS.has(kind);
  // a short one is only a punch (hitStop turns it into a zoom punch): it never takes the rate limiter's window
  if (!big && ms < 45 && kind !== 'razor') { hitStop(ms, x, y, kind, false, false, kdx, kdy); return; }
  if (clock - lastHitStop < (big ? 0.08 : 0.14)) {
    if (!big && stopT <= 0) return;
    if (!(ms / 1000 > 1.3 * stopT)) return;
    lastHitStop = clock; hitStop(ms, x, y, kind, false, true, kdx, kdy); return;
  }
  lastHitStop = clock; hitStop(ms, x, y, kind, false, false, kdx, kdy);
}
// the music follows the race: calm in the launch tube, busier in the middle, loud near the egg, flat out in FRENZY
// The combo lifts it too (12+: 1, 30+: 1.4); a tier the combo raised only drops on a bank, a break or the combo's end
// (comboTierReset), never because a pass was slow
let comboMusicT = 0;
function setIntensity() {
  if (!race || race.demo || mode !== 'race' || !A.on) return;
  const zi = race.zoneReached | 0, p = race.p;
  const zt = zi <= 1 ? 0 : zi <= 4 ? 1 : 1.4, ct = p.combo >= 30 ? 1.4 : p.combo >= 12 ? 1 : 0;
  if (ct > comboMusicT) comboMusicT = ct;
  const v = p.frenzyT > 0 ? 2 : Math.max(zt, comboMusicT);
  if (A.intensity !== v) A.intensity = v;
}
function comboTierReset() { comboMusicT = 0; comboWordPick = null; setIntensity(); }
// the combo strip's trick strip: the true trick queue (race.p.seq: up to 3 {k, t}, oldest first) as coloured chips,
// fading 1.5 s after the last one. When its last 1 or 2 kinds open a signature trick (C.TRICKS), a pulsing ghost chip
// shows the kind that finishes it, with the trick's name and a bar that empties over C.TRICK_T. 2 of 3: a tease sting;
// that window running out unfinished: a miss sting. A landed trick flashes its 3 chips gold. Colours: the in-tube pops'.
// (one source with render.js: K.LINK_CHIP; the literal is only a fallback for an older content.js)
const LINK_CHIP = K.LINK_CHIP && typeof K.LINK_CHIP === 'object' ? K.LINK_CHIP : { pass: ['PASS', '#fff4f8'], rival: ['RIVAL', '#ffd75c'], close: ['CLOSE', '#5ce1ff'], dodge: ['DODGE', '#5ce1ff'], gate: ['THREAD', '#d9b8ff'],
  draft: ['DRAFT', '#b8f0ff'], slingshot: ['SLING', '#ffd75c'], weave: ['WEAVE', '#7dffb0'], snipe: ['SNIPE', '#ff8fc8'], bump: ['BUMP', '#ffb36b'],
  pop: ['POP', '#f4eef7'], domino: ['DOMINO', '#ffd75c'], sugar: ['FRUIT', '#7dffb0'], dna: ['DNA', '#ff8be0'], trick: ['TRICK', '#ffd75c'], cash: ['CASH', '#7dffb0'] };
const TRICK_WIN = () => (C.TRICK_T > 0 ? C.TRICK_T : 2.6);
let linkLog = [], linkAt = -99, linkSig = '', trickTease = null, trickFlash = null;
// (the old event log, only for a core with no p.seq)
function linkPush(kind) {
  if (!LINK_CHIP[kind]) return;
  if (linkLog[linkLog.length - 1] !== kind) { linkLog.push(kind); if (linkLog.length > 3) linkLog.shift(); }
  linkAt = clock;
}
// the recipe the queue is building: { T, m (kinds matched), t0 (race time of its first kind) }, the longest match first
function trickOpen(q) {
  // core's threads (race.trickThreads: every recipe in progress) name the recipe directly: the most advanced live one
  const TH = race.trickThreads;
  if (Array.isArray(TH) && TH.length) {
    let best = null;
    for (const h of TH) {
      if (!h || !h.T || !Array.isArray(h.T.kinds) || !Array.isArray(h.s) || !h.s.length || h.s.length > 2) continue;
      if (race.t - h.s[0].t >= TRICK_WIN()) continue;
      if (!best || h.s.length > best.s.length || (h.s.length === best.s.length && h.s[h.s.length - 1].t >= best.s[best.s.length - 1].t)) best = h;
    }
    if (best) return { T: best.T, m: best.s.length, t0: best.s[0].t };
  }
  const TR = C.TRICKS || []; if (!q.length || !TR.length) return null;
  for (const m of [2, 1]) {
    if (q.length < m) continue;
    const tail = q.slice(q.length - m);
    if (race.t - tail[0].t >= TRICK_WIN()) continue;
    const T = TR.find((tr) => tail.every((e, i) => tr.kinds[i] === e.k));
    if (T) return { T, m, t0: tail[0].t };
  }
  return null;
}
const chipHtml = (k, cls) => { const c = LINK_CHIP[k] || [String(k).toUpperCase(), '#fff4f8']; return `<i class="${cls || ''}" style="color:${c[1]}">${esc(c[0])}</i>`; };
function linksTick(allow = true) {
  const el = H.links; if (!el || !race) return false;
  const seqOk = Array.isArray(race.p.seq), q = seqOk ? race.p.seq : null;
  let kinds, lastT, open = null;
  if (seqOk) { kinds = q.map((e) => e.k); lastT = q.length ? q[q.length - 1].t : -99; open = trickOpen(q); }
  else { kinds = linkLog; lastT = race.t - (clock - linkAt); }
  // the tease (2 of 3) and the miss when its window runs out
  if (open && open.m === 2) {
    // (swim 1 hides the strip: no sting for a strip nobody can see)
    if (!trickTease || trickTease.id !== open.T.id || trickTease.t0 !== open.t0) { trickTease = { id: open.T.id, t0: open.t0 }; if (!firstSwim) sfx('trickTease', { step: 2, id: open.T.id }); }
  } else if (trickTease) {
    if (race.t - trickTease.t0 >= TRICK_WIN() && q && q.length && !firstSwim) sfx('trickMiss');
    trickTease = null;
  }
  const fl = trickFlash && clock < trickFlash.until ? trickFlash : null;
  const on = !!fl || !!open || (kinds.length > 0 && race.t - lastT < 1.5);
  const TT = C.TRICK_TEXT || K.TRICK_TEXT || {};
  const sig = !on ? '' : fl ? 'F' + fl.kinds.join('+') : kinds.join('+') + (open ? '|' + open.T.id + open.m : '');
  if (sig !== linkSig) {
    linkSig = sig;
    if (!on) el.innerHTML = '';
    else if (fl) el.innerHTML = fl.kinds.map((k) => chipHtml(k, 'gold')).join('<b>+</b>');
    else {
      let h = kinds.map((k) => chipHtml(k)).join('<b>+</b>');
      if (open) {
        const nm = (TT[open.T.id] && TT[open.T.id].name) || open.T.id.toUpperCase();
        h += `<b>+</b>${chipHtml(open.T.kinds[open.m], 'ghost')}<em class="tn">${esc(nm)}<u><s></s></u></em>`;
      }
      el.innerHTML = h;
    }
    el._bar = el.querySelector('.tn s');
    setC(el, 'fade', false);
  }
  if (open && el._bar) setBar(el._bar, 1 - (race.t - open.t0) / TRICK_WIN());
  setC(el, 'hide', !on || !allow);
  if (on) setC(el, 'fade', !open && !fl && race.t - lastT > 1.1);
  return on && allow;
}
// combo saved by Echo Chamber: a soft cyan echo, never the shatter
function echoFx(kept) {
  const p = race.p;
  R.pop(p.x, p.y + 70, 'ECHO! +' + kept, '#7fe8ff', 17, 1.1);
  sfx('comboEnd', { n: lastCombo }); R.lastBankT = R.time; buzz(8);
}
// combo ladder: a light first rung at 5 (no hold), then 10 and 25 each land harder (no extra hit-stop when FRENZY fired
// the same frame). There are no 50 or 100 rungs: comboMilestone owns 40 and up, so nothing celebrates twice.
// [at, hold ms, trauma, zoom punch, flash, buzz]
const LADDER = [[5, 0, 0.08, 0.03, 0, 8], [10, 45, 0.15, 0.05, 0.12, 12], [25, 60, 0.25, 0.07, 0.18, 20]];
function comboLadderFx(n, p) {
  let li = -1;
  for (let i = 0; i < LADDER.length; i++) if (n >= LADDER[i][0] && comboLadder < LADDER[i][0]) li = i;
  if (li < 0) return;
  const [at, ms, tr, zp, fl, bz] = LADDER[li];
  comboLadder = at;
  if (!frenzyNow && ms > 0) hitStop(ms, p.x, p.y, 'ladder');
  trauma(tr); if (R.zoomPunch) R.zoomPunch(zp);
  if (!S.reduced && fl > 0) { R.flash = Math.max(R.flash || 0, fl); R.flashCol = 'rgba(255,215,92,0.35)'; }
  buzz(bz);
  // 5x a small gold pop, 10x gold, 25x a big pink one that stays 1.3 s
  R.pop(p.x, p.y + 125, at + 'x!', at >= 25 ? '#ff5cd2' : '#ffd75c', at >= 25 ? 34 : at >= 10 ? 30 : 22, at >= 25 ? 1.3 : at >= 10 ? 1.1 : 0.8);
}
// a rival's epithet (K.RIVAL_EPITHETS: 'the Protein Shake') and the banner kicker that carries it
const epithetOf = (name) => byFirst(K.RIVAL_EPITHETS || {}, name) || '';
const rivalKicker = (name) => { const e = epithetOf(name); return e ? `${first(name)} ${e}`.toUpperCase() : 'RIVAL'; };
const rivalIndex = (ev) => (Number.isInteger(ev.k) && RIVALS[ev.k] ? ev.k : RIVALS.findIndex((r) => r.name === (ev.boss || ev.name) || first(r.name) === first(ev.boss || ev.name)));
function passedBy(k) {
  const r = RIVALS[k]; if (!r) return;
  if (sayRival(k, pickLine(tauntsOf(r.name).pass), 2.2)) sfx('bossTaunt', k);
  const el = H.rv[k]; if (el) { el._hotUntil = clock + 1.5; el.classList.remove('taunt'); void el.offsetWidth; el.classList.add('taunt'); }
}
function comboBreakFx(n, ringDone, potLost) {
  const p = race.p;
  if (R.comboBreak && !ringDone) R.comboBreak(p.x, p.y, n);
  // n: the combo that was lost (audio scales the shatter by it)
  sfx('comboBreak', n);
  // a lost pot already said its line
  if (!potLost) R.pop(p.x, p.y + 70, (pickLine(BREAK_LINES) || 'COMBO DROPPED') + (n >= 10 ? ` (${n})` : ''), '#ff8bb0', 18);
  // a big chain lost lands like a hit: a hold, a shake and the camera pulling back, all growing with what was lost
  if (n >= 10) {
    hitStop(clamp(20 + 1.2 * n, 30, 80), p.x, p.y, 'break');
    trauma(Math.min(0.45, 0.1 + 0.012 * n));
    if (R.zoomPull) R.zoomPull(0.03 + 0.0015 * Math.min(n, 40));
    buzz(n >= 20 ? [30, 40, 60] : 15);
  }
}
let evErrs = 0;
// the smallest chain that banks as a real bank (core's BANK_AT[0]); under it a bank is a tick
const BANK_AT0 = Array.isArray(C.BANK_AT) && Number.isFinite(+C.BANK_AT[0]) ? +C.BANK_AT[0] : 5;
const perkPopAt = {};
function onEvents() {
  // take the batch first: whatever a handler does (even a throw), these events are never replayed
  const p = race.p, evs = race.events; race.events = [];
  if (race.demo) return;
  bankedNow = false; frenzyNow = false; blastNow = false;
  for (const ev of evs) {
    if (ev.type === 'comboBreak' || ev.type === 'comboBank' || ev.type === 'passedBy') coreHas[ev.type] = true;
    if (ev.type === 'frenzy') frenzyNow = true;
    // a blast this frame: its pops leave the shake and the hold to the blast itself (one hit, sized by the count)
    if (ev.type === 'blast') blastNow = true;
    // a spare life's bite owns the hit: the pop core emits just before it holds no frame of its own
    if (ev.type === 'spareBite') lastPopStop = clock;
  }
  for (const ev of evs) {
    try { onEvent(ev, p); } catch (e) { if (evErrs++ < 3) console.error(e); }
  }
}
let frenzyNow = false, frenzyCoachPend = false, blastNow = false, lastBlastSlow = -99;
// pops in a chain; the strip's FRENZY tier tag ({t, until}); a tier's long text held for after the FRENZY
let popChain = 0, popChainAt = -99, ftShow = null, frenzyDescPend = '';
// swim 1's first FRENZY: a one-shot card during the freeze (it replaces the COMBO card, which is dropped)
function firstFrenzyCard() {
  tutQ = tutQ.filter((q) => q.id !== 'comboIntro');
  if (lesson && lesson.id === 'comboIntro') lessonEnd();
  const fc = K.FIRST_FRENZY_CARD || {}, c = { id: 'frenzyCard', ic: '🔥', t: fc.t || 'You passed 10 in a row!', s: fc.s || 'Keep passing = keep FRENZY', sec: 2.4 };
  // over a tutorial step: an interlude (the step picks up after it); otherwise its own lesson card
  if (tut && tut.on) { tutQ.unshift(c); tutInterlude(); }
  else { lessonEnd(); lessonShow(c.id, c.ic, { t: c.t, s: c.s }, c.sec); }
  sfx('tap', 0.6);
}
function onEvent(ev, p) {
    switch (ev.type) {
      case 'pass':
        // swim 1: the +places ticker shows from the first pass on
        if (firstSwim && document.body.classList.contains('noTick')) setC(document.body, 'noTick', false);
        // a dash that passes someone, in the first lessons: ZOOM PAST! (+2 DNA, once a dash)
        if (clock - lastDashAt < 0.4 && zoomPastAt !== lastDashAt && (firstSwim || (tut && tut.on && TUT_STEPS.some((x) => tutUnpaid(x.id)))) && !race.demo) {
          zoomPastAt = lastDashAt; meta.dna += 2;
          // swim 1: the burst and the buzz, no text (one thing to read at a time)
          if (firstSwim) { lessonDna += 2; R.burst(p.x, p.y + 30, '#8cdcff', 10, 160, 0.4, 2.5); }
          else R.pop(p.x, p.y + 80, (POP_LINES.zoomPast && pickLine(POP_LINES.zoomPast)) || 'ZOOM PAST! +2 DNA', '#8cdcff', 18, 1.1);
          buzz(10);
        }
        if (ev.boss) {
          const k = rivalIndex(ev), name = ev.boss;
          if (!passedOnce.has(name)) {
            passedOnce.add(name);
            // the rematch rival, passed for the first time: PAYBACK!
            const pay = !!rematch && !rematch.paid && first(name) === rematch.name;
            if (pay) { rematch.paid = true; sfx('grudge'); }
            R.pop(ev.x, ev.y + 30, pay ? 'PAYBACK!' : `PASSED ${first(name).toUpperCase()}!`, '#ffd75c', pay ? 24 : 20, 1.6);
            R.flash = 0.3; R.flashCol = 'rgba(255,215,92,0.35)'; trauma(0.35); hitStop(pay ? 120 : 60, ev.x, ev.y, 'pass');
            if (clock - lastSlowAt >= 6) { slow(0.4); lastSlowAt = clock; }
            sfx('boss', k >= 0 ? k : undefined); buzz([15, 30, 25]); bossPassed(k); headGainPop();
            sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2);
          } else { passBlip = true; R.pop(ev.x, ev.y + 30, first(name).toUpperCase() + ' AGAIN', '#ffe9a8', 14, 0.9); bossPassed(k); sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2); }
        } else { passSum += ev.w; passBlip = true; }
        // (the first overtake's thought waits for a free moment: the first one that can be said)
        if (!thinkPassed && !race.demo && kevinThink('firstPass')) thinkPassed = true;
        // passing Chad: after his own line has had its moment
        if (ev.boss && first(ev.boss) === 'Chad' && !race._chadThought) { race._chadThought = true; later(2.6, () => kevinThink('passChad')); }
        if (R.passFx) R.passFx(ev.x, ev.y, p.combo, R.ringCol ? R.ringCol(clamp(p.comboT / (p.comboMax || 1), 0, 1)) : '#ffd75c');
        else R.burst(ev.x, ev.y, '#ffffff', 3, 80, 0.35, 2);
        break;
      case 'passedBy': {
        const k = rivalIndex(ev); if (k >= 0) passedBy(k);
        const ox = ev.x != null ? ev.x : k >= 0 && race.agents[k] ? race.agentX(race.agents[k]) : p.x;
        sfx('overtaken', { k, pan: clamp((ox - p.x) / 160, -1, 1) });
        break;
      }
      case 'combo': {
        linkPush(ev.kind); comboLinkN++;
        sfx('link', { n: ev.n, kind: ev.kind });
        setIntensity();
        // a graded shave (ev.gap, px): 4 or less is a RAZOR (a short hold, a breath of slow-mo, a punch); up to 10 the
        // usual near miss; wider only the link note
        const gp = ev.gap != null && Number.isFinite(+ev.gap) ? +ev.gap : null, nearK = ev.kind === 'close' || ev.kind === 'dodge';
        if (nearK && gp != null && gp <= 4) {
          hitStopRL(35, ev.x, ev.y, 'razor'); slow(0.12); if (R.zoomPunch) R.zoomPunch(0.06); buzz(15);
          sfx('close', { tight: 1 });
          R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 34, pickLine(K.RAZOR_LINES || []) || 'A WHISKER!', '#bfefff', 17, 1);
          if (Math.random() < 0.25) later(0.5, () => kevinThink('nearMiss'));
        } else if (!nearK || gp == null || gp <= 10) {
          if (nearK) nearMissFx(ev, p);
          if (ev.kind === 'close') { sfx('close'); R.pop(ev.x, ev.y + 30, POP('close', 'CLOSE!'), '#5ce1ff', 15); if (Math.random() < 0.25) later(0.5, () => kevinThink('nearMiss')); }
          if (ev.kind === 'dodge') R.pop(ev.x, ev.y + 30, POP('dodge', 'DODGED!'), '#5ce1ff', 15);
        }
        if (ev.kind === 'gate') { sfx('thread'); R.pop(p.x, p.y + 40, POP('thread', 'THREADED!'), '#d9b8ff', 16); }
        if (ev.kind === 'draft') R.pop(p.x, p.y + 40, POP('draft', 'COMFY!'), '#b8f0ff', 14);
        // the new overtake kinds (systems): a small named pop, at most one every 0.45 s so a plow does not spam
        // swim 1: none while the tutorial talks (one message at a time), then at most one every 2 s
        if ((ev.kind === 'slingshot' || ev.kind === 'weave' || ev.kind === 'snipe') && !(firstSwim && tut && tut.on)
          && race.t - (kindPopT || -9) > (firstSwim ? 2 : 0.45)) {
          kindPopT = race.t;
          const KP = { slingshot: ['SLINGSHOT!', '#ffd75c'], weave: ['WEAVE!', '#7dffb0'], snipe: ['SNIPED!', '#ff8fc8'] }[ev.kind];
          R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 34, POP(ev.kind, KP[0]), KP[1], 15);
        }
        comboLadderFx(ev.n | 0, p);
        if (ev.fresh && (ev.style || 1) >= 3) {
          const w = STYLE_WORDS[clamp((ev.style | 0) - 3, 0, Math.max(0, STYLE_WORDS.length - 1))];
          if (w) comboTag(w);
          sfx('style', ev.style);
        }
        break;
      }
      // OVERCLOCK past HYPER ({n}): HYPER x(n + 1) in the tier slot, a pop of rising disbelief, its own sting
      case 'overclock': {
        const n = Math.max(1, ev.n | 0), OL = K.OVERCLOCK_LINES || [], pool = OL[Math.min(n, OL.length) - 1];
        ftShow = { t: 'HYPER x' + (n + 1), until: clock + 1.2 };
        const l = (Array.isArray(pool) ? pickLine(pool) : '') || 'OVERCLOCKED!';
        R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 150, l, '#ff5cd2', 22 + 2 * Math.min(n, 4), 1.2);
        sfx('overclock', { n }); buzz([10, 20, 10 + 10 * Math.min(n, 4)]); trauma(0.2 + 0.05 * Math.min(n, 4));
        break;
      }
      case 'comboBank': {
        comboTierReset();
        const g = clamp(ev.grade | 0, 0, Math.max(0, BANK_GRADES.length - 1)), dnaRaw = +ev.dna || 0, dna = Math.round(dnaRaw);
        const dnaS = dnaRaw < 9.95 ? dnaRaw.toFixed(1) : String(dna); // a small bank reads +0.4, never +0
        bankedNow = true;
        if (R.comboBank) R.comboBank(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, dna);
        // cashed at the very last second of the timer: a gold buzzer-beater pop, a beat more hold, its horn
        if (ev.buzzer) {
          const bx = ev.x != null ? ev.x : p.x, by = ev.y != null ? ev.y : p.y;
          R.pop(bx, by + 190, pickLine(K.BUZZER_LINES || []) || 'BUZZER BEATER!', '#ffd75c', 26, 1.3);
          hitStop(40, bx, by, 'finisher', true); sfx('buzzer'); buzz([15, 30, 15]);
        }
        if (ev.finisher) {
          // a cash-in on purpose: the lesson is learned (and the tutorial's cash step is done)
          lessonDone('cash');
          if (!S.cashDone) { S.cashDone = true; saveUI(); lessonEnd(); }
          tutMark('cash');
          // a few cash-ins by the button: the swipe shortcut, once ever
          if (cashSrc === 'btn' && touchUsed) {
            S.cashBtnN = (S.cashBtnN | 0) + 1;
            if (S.cashBtnN >= 3 && !S.swipeTip) { S.swipeTip = true; later(1.6, () => coach(K.CASH_SWIPE_TIP || 'Pro move: swipe DOWN to cash.', 3, 1)); }
            saveUI();
          }
          cashSrc = '';
          const bn = ev.blastN | 0, big = bn >= 3, sg = big ? Math.min(4, g + 1) : ev.grade;
          // a finisher that blasted 3+ Big Macros: the stinger one grade up and an extra shove of shake
          // The bank frame is only the wind-up (the reversed swell starts, the camera draws back a hair); the hit lands
          // on the stinger's thud (A.finisherLead), so the eye and the ear hit together
          sfx('finisher', sg);
          if (R.zoomPull) R.zoomPull(0.05);
          buzz(8);
          let lead = 0.2 + 0.05 * g;
          try { if (A.finisherLead) { const v = +A.finisherLead(sg); if (Number.isFinite(v) && v >= 0) lead = Math.min(0.6, v); } } catch (e) { /* default lead */ }
          const fr = race, fx = p.x, fy = p.y;
          later(lead, () => {
            if (!race || race !== fr || race.over) return;
            const q = race.p;
            trauma(0.25 + (bn > 0 ? 0.15 : 0) + (big ? 0.3 : 0));
            if (bn > 0) {
              if (R.ring) R.ring(q.x, q.y, '#ffd75c', 150, 0.55, 8);
              if (!S.reduced) { R.lastFlashT = -9; R.flash = Math.max(R.flash || 0, 0.3); R.flashCol = 'rgba(255,215,92,0.4)'; }
              buzz([20, 20, 30, 20, 60], true);
            } else buzz([10, 20, 10], true);
            if (R.zoomPunch) R.zoomPunch(0.1 + 0.02 * g);
            // ONE pop for the whole cash-in, not a stack of three
            R.pop(q.x, q.y + 100, `${BANK_GRADES[g] || 'BANKED'} +${dnaS} DNA${bn > 0 ? ' · BLASTED ' + bn : ''}`, '#ffd75c', 28 + g * 2, 1.3);
            finPopUntil = clock + 1.3;
            hitStop(60 + 15 * g, q.x, q.y, 'finisher', true);
          });
          finPopUntil = clock + lead + 1.3;
          // a big bank shows its sum, a term at a time, while the swell builds
          if ((ev.n | 0) >= 25) finisherTally(ev, dnaS, fx, fy);
          if ((ev.n | 0) < 10) coach(pickLine(FINISHER_LINES), 1.8, 1);
        } else if ((ev.n | 0) < BANK_AT0) {
          // a tiny bank (a short chain that ended): no pop, no buzz, just the DNA tick
          sfx('dnaTick');
        } else {
          sfx('comboBank', ev.grade);
          // grade 2+ snaps to the beat's 16th grid (A.lastSnapLead): the pop, the hold and the punch land with the hit
          const fr = race, bx = p.x, by = p.y;
          const bankFx = () => {
            if (!race || race !== fr || race.over) return;
            R.pop(bx, by + 80, (BANK_GRADES[g] || 'BANKED') + ' +' + dnaS, '#7dffb0', 18 + g * 2, 1.4); buzz([10, 20, 10]);
            if (g >= 2) { hitStop([0, 0, 30, 50, 80][Math.min(4, g)], bx, by, 'bank'); if (R.zoomPunch) R.zoomPunch(0.03 + 0.025 * g); }
          };
          const ld = g >= 2 ? snapLead() : 0;
          if (ld > 0) later(ld, bankFx); else bankFx();
          break;
        }
        // the bigger banks land with a hold and a punch (a finisher's own hold lands on its thud)
        if (g >= 2 && !ev.finisher) { hitStop([0, 0, 30, 50, 80][Math.min(4, g)], p.x, p.y, 'bank'); if (R.zoomPunch) R.zoomPunch(0.03 + 0.025 * g); }
        break;
      }
      case 'comboBreak': {
        comboTierReset();
        const potLost = potBreak(), n = ev.n | 0;
        if (ev.kept > 0) echoFx(ev.kept);
        else if (!bankedNow) {
          if (R.comboBreak) R.comboBreak(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, n);
          comboBreakFx(n, true, potLost);
        }
        break;
      }
      case 'comboMilestone': {
        const n = ev.n | 0, msk = Math.max(0, ev.skipped | 0);
        // the sting snaps to the 16th grid (A.lastSnapLead): the confetti, the hold and the pop wait for it
        sfx('comboMilestone', n);
        const fr = race, mx = p.x, my = p.y;
        const msFx = () => {
          if (!race || race !== fr || race.over) return;
          // several milestones crossed in one step (skipped): one bigger pop, one confetti, one hold
          if (R.confetti) R.confetti(mx, my, msk ? 90 : 60);
          hitStop((n >= 150 ? 140 : n >= 100 ? 120 : n >= 80 ? 80 : n >= 60 ? 70 : 60) + (msk ? 20 : 0), mx, my, 'milestone'); trauma(msk ? 0.5 : 0.4); buzz([30, 30, 30, 30, 90], true);
          const mTxt = msk ? fillLine(lineOr(K.MULTI_MILESTONE, 'x{n} MILESTONES!'), { n: msk + 1 }) : MILESTONE_LINES[n] || n + ' COMBO!';
          // a cash-in pop still on screen: the milestone waits a beat so the two never stack
          const mPop = () => { if (race && !race.over) R.pop(race.p.x, race.p.y + 150, mTxt, '#ffd75c', msk ? 40 : 34, msk ? 1.9 : 1.6); };
          if (finPopUntil > clock) later(0.35, mPop); else mPop();
        };
        const ld = snapLead();
        if (ld > 0) later(ld, msFx); else msFx();
        break;
      }
      case 'comboEnd':
        comboTierReset();
        // a cash-in is not a combo ending: its head start shows as one small pop, no ECHO!, no whistle
        if (ev.finisher) { if (ev.kept > 0) R.pop(p.x, p.y + 60, fillLine(pickLine(K.HEAD_START_LINES || ['HEAD START +{n}']), { n: ev.kept }), '#ffd75c', 16, 1); break; }
        if (ev.kept > 0) { if (!coreHas.comboBreak) echoFx(ev.kept); }
        else if (!coreHas.comboBreak && !bankedNow && ev.n >= 5) comboBreakFx(ev.n);
        else if (!bankedNow && !coreHas.comboBreak) sfx('comboEnd', ev.n);
        break;
      case 'clutch':
        if (R.clutch) R.clutch(ev.x, ev.y);
        R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 50, pickLine(CLUTCH_LINES), '#ffd75c', 18, 1); sfx('clutch'); buzz(10);
        break;
      // a DASH buffered on the way into the deal never fires (or shakes the refused button) under the cards
      case 'offer': offerGolden = !!ev.golden; dashBuf = 0; race.input.dash = false; break;
      case 'threat': {
        const k = rivalIndex(ev);
        if (!threatSaid && k >= 0) { threatSaid = true; callout('event', { t: `${first(RIVALS[k].name).toUpperCase()} IS HERE`, z: rivalKicker(RIVALS[k].name), c: threatLine(RIVALS[k].name), col: RIVALS[k].col, sec: 2.2 }); babble(k, threatLine(RIVALS[k].name)); }
        if (k >= 0) { sfx('bossTaunt', k); buzz(15); }
        break;

      }
      case 'drillLead': {
        const k = rivalIndex(ev), kev = !!ev.kevin;
        const nm = kev ? 'KEVIN' : k >= 0 ? first(RIVALS[k].name).toUpperCase() : 'A RIVAL';
        const line = kev && EGG_LINES.leadYou ? pickLine(EGG_LINES.leadYou) : fillLine(pickLine(EGG_LINES.lead) || '{name} TAKES THE LEAD!', { name: nm });
        callout('drill', { t: line, z: 'THE EGG', col: kev ? '#7dffb0' : k >= 0 ? RIVALS[k].col : '#ff5c7a', sec: 1.3 });
        sfx('drillLead', { k, kevin: kev }); buzz(kev ? [15, 20, 30] : 20);
        eggSay(kev ? 'kevinLeads' : 'rivalLeads', k >= 0 ? first(RIVALS[k].name) : '');
        // the one big hit at the egg: Kevin takes the lead (once a swim)
        if (kev && !kevLeadFx) { kevLeadFx = true; hitStop(140, p.x, p.y, 'kevin'); if (!S.reduced) { R.flash = Math.max(R.flash || 0, 0.4); R.flashCol = 'rgba(125,255,176,0.45)'; } }
        if (!kev && k >= 0) leadK = k;
        break;
      }
      case 'rivalShove': {
        const k = rivalIndex(ev);
        sfx('rivalShove'); buzz(15); trauma(0.2);
        if (k >= 0) react(k, 'drill');
        break;
      }
      case 'frenzy': {
        const T = C.FRENZY_TIERS, tier = ev.tier || 1, name = ev.name || (ev.first ? 'FRENZY!' : 'MEGA FRENZY!');
        if (ev.first || tier <= 1) later(1.2, () => kevinThink('frenzy'));
        // tiers climbed past in the same step (skipped): one bigger moment, never a stack of them
        const fsk = Math.max(0, ev.skipped | 0);
        sfx('frenzy', tier); R.flash = 0.35; R.flashCol = 'rgba(255,255,255,0.4)'; trauma(0.45 + 0.1 * tier + (fsk ? 0.1 : 0)); hitStop(fsk ? 110 : 80, p.x, p.y, 'frenzy');
        if (clock - lastSlowAt >= 2) slow(0.3 + tier * 0.05, !!ev.first);
        R.burst(p.x, p.y, '#ffd75c', 30 + fsk * 10, 260, 0.8, 4); R.pop(p.x, p.y + 80, fsk ? name + ' x' + (fsk + 1) : name, '#ffd75c', 28 + tier * 2 + (fsk ? 4 : 0), fsk ? 1.6 : 1.4);
        if (R.ring) R.ring(p.x, p.y, '#ffd75c', 90 + tier * 25, 0.5, 6);
        if ((tier >= 3 || fsk) && R.confetti) R.confetti(p.x, p.y, 20 + tier * 8);
        if (!S.frenzySeen) {
          S.frenzySeen = true; saveUI();
          // swim 1: the FRENZY card is the combo lesson (the queued COMBO card is dropped), shown during the freeze. Steering
          // comes first: before the steer step is credited, the card and its freeze wait (onbHold)
          if (firstSwim) { comboIntroDone = true; if (!onbHold(() => { if (!S.reduced) freezeT = 0.8; firstFrenzyCard(); })) { if (!S.reduced) freezeT = 0.8; firstFrenzyCard(); } }
          else {
            if (!S.reduced) freezeT = 0.8;
            // the line waits for the FRENZY to end: nobody reads mid-FRENZY
            frenzyCoachPend = true;
          }
        } else if (T && tier > 1) {
          headGainPop();
          // what the new tier adds: a short tag in the strip's tier slot for 1.2 s; the long text only after the FRENZY
          const sh = (K.FRENZY_TIER_SHORT || [])[tier - 1];
          if (sh) ftShow = { t: sh, until: clock + 1.2 }; else if (ev.desc) frenzyDescPend = ev.desc;
        }
        A.intensity = 2; buzz(tier >= 3 ? [30, 40, 30, 40, 80] : [20, 30, 60]);
        comboFlash = 0.5;
        break;
      }
      case 'frenzyEnd':
        setIntensity(); sfx('frenzyEnd');
        if (frenzyCoachPend) { frenzyCoachPend = false; coach(TUT_TEXT.frenzy || 'FRENZY! Keep passing to stay on fire.', 2.6, 2); }
        else if (frenzyDescPend) hint(frenzyDescPend, 2.2, 1);
        frenzyDescPend = '';
        break;
      case 'sugar':
        fruitN++; sfx('sugar'); R.burst(ev.x, ev.y, '#7dffb0', 6, 90, 0.4, 2.5);
        // the sugar flies into the GAS bar, which pulses as it lands
        if (gasTgtL && typeof R.collect === 'function') { try { R.collect(ev.x, ev.y, '#7dffb0', gasTgtL.x, gasTgtL.y, 3, gasLand); } catch (e) { /* only juice */ } }
        // the fruit step is credited for fruit Kevin was steered (30+ px) or dashed into, never for fruit he drifted onto
        // (the credited fruit pulses the GAS bar too: that is where the sugar went)
        if (tutCur() !== 'fruit' || fruitEarned()) { const was = tutCur() === 'fruit'; tutMark('fruit'); if (was) gasPulse(); } else gasPulse();
        lessonDone('fruit');
        // swim 1's contextual fruit card: the grab is the lesson (praise, its DNA counted on the result card)
        if (lesson && lesson.id === 'fruitLow') { if (tutPay('fruit') && firstSwim) lessonDna += TUT_DNA; R.pop(p.x, p.y + 70, TUT_PRAISE.fruit || 'YUM!', '#7dffb0', 18, 1.2); sfx('lesson', 1); lessonEnd(); }
        // swims 1 to 3: the first fruit shows where it went (the GAS bar swells and flashes mint)
        if (fruitN === 1 && (meta.runs | 0) < 3) gasPulse();
        break;
      case 'dna': {
        const n = Math.round(ev.amount || 5);
        sfx('dna'); R.burst(ev.x, ev.y, '#ff5cd2', 14, 140, 0.6, 3);
        // the motes fly to the DNA counter (once it is on screen), which pops as they land
        { const bt = R.bankTarget; if (bt && typeof R.collect === 'function' && !$('dnaHud').classList.contains('hide')) { try { R.collect(ev.x, ev.y, '#ff8be0', bt.x, bt.y, clamp(Math.round(n / 3), 2, 6), dnaLand); } catch (e) { /* only juice */ } } }
        R.pop(ev.x, ev.y + 20, '+' + n + ' DNA', n >= 10 ? '#ffd75c' : '#ff8be0', 16 + Math.max(0, Math.min(8, n - 5))); buzz(8);
        break;
      }
      case 'shield': sfx('shield'); R.pop(ev.x, ev.y + 20, POP('shield', '+1 SHIELD'), '#ffd75c', 16); buzz(12); break;
      case 'alkali': sfx('alkali'); R.pop(ev.x, ev.y + 20, POP('alkali', 'pH OK!'), '#5cc8ff', 14); break;
      case 'dash': {
        dashBuf = 0; sfx('dash'); R.burst(p.x, p.y - 20, '#8cdcff', 10, 180, 0.4, 2.5); kick(0, -0.4); buzz(12); lessonDone('dash'); lastDashAt = clock;
        if (!S.flickSeen && clock - flickAt < 0.4) { S.flickSeen = true; saveUI(); flickRingT = 0.6; }
        // the dash card is learned by any dash (a pass right after it says ZOOM PAST!)
        if (tutCur() === 'dash') tutMark('dash');
        // what it cost: a '-N' chip flies off the GAS bar (not when a mutation paid for it)
        const cost = race.s && race.s.dashCost > 0 ? race.s.dashCost : 0, free = !!(race.muts && race.muts.nitro) || !!ev.free;
        dashN++; if (cost && !free) { gasBurn += cost; gasChip(Math.round(cost)); }
        // swim 1: the first 3 dashes pulse the GAS bar (that is what they spend)
        if (firstSwim && dashN <= 3) gasPulse();
        break;
      }
      // a sleepy Macro booped awake (Popcorn Party): a little push, a tiny hold, BOOP! and the combo clock flashes
      case 'popcornWake': {
        const bx = ev.x != null ? ev.x : p.x, by = ev.y != null ? ev.y : p.y;
        trauma(0.2, bx - p.x, 0); hitStopRL(35, bx, by, 'bump'); R.pop(bx, by + 30, 'BOOP!', '#ffd75c', 15);
        sfx('boop'); buzz(12);
        if (H.cbarW && H.cbarW.animate && !S.reduced) H.cbarW.animate([{ filter: 'brightness(2.2)', transform: 'scaleY(1.8)' }, { filter: 'none', transform: 'none' }], { duration: 320, easing: 'ease-out' });
        if ((meta.runs | 0) < 3 && !S.popcornTold) { const hl = (K.HAZARD_INTRO || {}).popcorn; if (hl && coach(hl, 2.6, 1)) { S.popcornTold = true; saveUI(); } }
        break;
      }
      // the swim-1 Big Macro set piece: it wakes (a breath of slow-mo, no coach line), it misses (a cheer)
      case 'setpiece':
        if (ev.phase === 'wake') slow(0.25);
        else if (ev.phase === 'dodged') { R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 40, lineOr(K.DODGED_SETPIECE, 'DODGED!'), '#7dffb0', 20, 1.2); sfx('record'); buzz(15); }
        break;
      case 'bonk': bonkN++; sfx('bonk'); trauma(0.55, 0, 1); hitStopRL(70, ev.x, ev.y, 'bonk', 0, 0.6); R.pop(ev.x, ev.y, POP('bonk', 'SPLAT'), '#d9b8ff', 19); // (the goo-wall line only when a goo gate really is right there: a bonk from anything else never talks about walls)
        if (race.ents.some((g) => g.t === 'gate' && Math.abs(g.y - (+ev.y || p.y)) < 120)) hint(pickLine(UI_LINES.bonkHint) || 'Find the GAP in the goo wall!', 2, 1);
        buzz(45); break;
      case 'surf': sfx('surf'); R.pop(ev.x, ev.y + 20, POP('surf', 'SURF!'), '#d9b8ff', 18); break;
      case 'bump': {
        trauma(0.3, 1, 0); hitStopRL(50, ev.x, ev.y, 'bump', ev.x < p.x ? 0.3 : -0.3, 0); R.pop(ev.x, ev.y + 20, POP('bump', 'BONK!'), '#ffb36b', 16); sfx('bump'); buzz(15);
        if (ev.boss) { const k = rivalIndex(ev); if (k >= 0) { react(k, 'bump'); rivalOuch(k); } }
        break;
      }
      case 'pop': {
        // pops in a chain (0.7 s apart at most) each hold a little longer, pushed away from the pop; audio climbs its pitch
        // ladder on the same count
        popChain = clock - popChainAt <= 0.7 ? popChain + 1 : 1; popChainAt = clock;
        sfx('pop', popChain); buzz(20);
        // a dash that pops something (not the spiky mutation's own pops): its own cue, panned to the pop
        if (p.dashT > 0 && !(race.muts && race.muts.spiky)) sfx('dashPop', clamp(((ev.x != null ? ev.x : p.x) - p.x) / 160, -1, 1));
        // art's pop (it escalates with the chain), else the plain burst
        if (typeof R.popFx === 'function') { try { R.popFx(ev.x, ev.y, popChain); } catch (e) { R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4); } }
        else R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4);
        if (!blastNow && clock - lastPopStop >= 0.08) {
          lastPopStop = clock;
          hitStopRL(45 + 10 * Math.min(popChain - 1, 3), ev.x, ev.y, 'pop');
          if (!((R.shake || 0) / 14 > 0.6)) trauma(0.3, ev.x - p.x, ev.y - p.y);
          if (R.zoomPunch) R.zoomPunch(0.03);
        }
        break;
      }
      case 'blast': {
        const n = Math.max(1, ev.n | 0);
        // a blast of 5+ gasps the music itself (audio.js calls A.impact(90)): the hit-stop must not gasp it twice
        if (n >= 5) lastImpact = clock;
        sfx('blast', ev.n); if (R.ring) R.ring(ev.x, ev.y, '#ffffff', ev.r || 160, 0.5, 8); R.pop(ev.x, ev.y + 50, `${ev.n} POPPED!`, '#ffffff', 20 + Math.min(10, ev.n * 2), 1.2); buzz([20, 20, 40]);
        // ONE hit for the whole blast, growing with how many it took
        hitStop(Math.min(40 + 15 * n, 120), ev.x, ev.y, 'blast'); trauma(Math.min(0.6, 0.2 + 0.08 * n));
        if (R.zoomPunch) R.zoomPunch(Math.min(0.15, 0.04 + 0.02 * n));
        if (n >= 3 && !S.reduced) { R.flash = Math.max(R.flash || 0, 0.25); R.flashCol = 'rgba(255,255,255,0.35)'; }
        if (n >= 4 && clock - lastBlastSlow >= 6) { lastBlastSlow = clock; slow(0.35); }
        break;
      }
      case 'shieldHit': sfx('hit'); { const hx = ev.x != null ? ev.x : p.x, hy = ev.y != null ? ev.y : p.y; trauma(0.5, hx - p.x, hy - p.y); hitStop(90, hx, hy, 'shieldHit'); } R.lastFlashT = -9; R.flash = 0.5; R.flashCol = 'rgba(255,215,92,0.5)'; R.pop(p.x, p.y + 40, POP('shieldHit', 'SHIELD SAVED YOU'), '#ffd75c', 17); slow(0.5); buzz([40, 30, 40]); break;
      case 'wingHit': sfx('hit'); { const hx = ev.x != null ? ev.x : p.x, hy = ev.y != null ? ev.y : p.y; trauma(0.5, hx - p.x, hy - p.y); hitStop(90, hx, hy, 'wingHit'); } R.pop(p.x, p.y + 40, POP('wingHit', 'WINGMAN TOOK IT') + ' 🫡', '#ffe0a8', 17); buzz([30, 30, 30]); break;
      case 'wingBack': sfx('heart'); R.pop(p.x, p.y + 50, UIL('wingBack', 'WINGMAN IS BACK') + ' 🤝', '#ffe0a8', 16); break;
      case 'second': sfx('second'); hitStop(120, p.x, p.y, 'second'); trauma(0.5); R.lastFlashT = -9; R.flash = 0.8; R.flashCol = 'rgba(255,92,140,0.6)'; R.pop(p.x, p.y + 60, POP('second', 'SECOND WIND!'), '#ff5c8a', 26, 1.6); buzz([60, 40, 60, 40, 120]); break;
      case 'synergy': {
        const n = (meta.synergiesSeen || []).length, tot = SYNERGIES.length;
        if (R.ring) R.ring(p.x, p.y, '#d9b8ff', 130, 0.6, 7);
        // mid-swim: one compact line under the HUD (the full rule waits in the Mashup Book and on the cards)
        const sh = ev.id ? SYNERGY_SHORT[ev.id] : '';
        // the icon and the name on the line, what it does under it (two lines at most)
        callout('synergy', sh ? { t: `${ev.icon || ''} ${ev.name || 'MASHUP'}`.trim(), c: sh, synC: true, compact: true, sec: 1.8 } : { t: `MASHUP! ${ev.icon || ''} ${ev.name || 'Synergy'} ${n}/${tot}`, compact: true, sec: 1.4 });
        sfx('synergy', ev.fresh); buzz([20, 40, 20, 40, 60]); mutSig = '';
        break;
      }
      case 'event': {
        const sh = EVENT_SHORT[ev.id];
        callout('event', { t: ev.name || 'SOMETHING HAPPENED', z: 'RACE EVENT', c: ev.text || null, short: sh || null, long: sh ? ev.text || null : null, sec: 2.2 });
        sfx('event'); buzz([20, 30, 20]);
        break;
      }
      case 'eventEnd': {
        if (p.combo >= 10) break;   // mid-combo nobody wants to read
        const pool = UI_LINES.eventEnd && UI_LINES.eventEnd[ev.id];
        hint(pickLine(pool) || (ev.name ? ev.name.replace(/[!.]+$/, '') + ' is over.' : 'Back to normal.'), 1.6, 1);
        break;
      }
      case 'fork':
        sfx('fork', { right: !!ev.right });
        R.pop(p.x, p.y + 60, (ev.right ? pickLine(FORK_RIGHT) || 'RIGHT TUBE!' : pickLine(FORK_WRONG) || 'UH OH...'), ev.right ? '#ff9be0' : '#c9b6c2', 18);
        if (ev.right) hint('You smell something sweet up ahead...', 3, 1); else hint('Hmm. It smells... empty in here.', 3, 1);
        break;
      case 'backflow':
        sfx('backflow');
        R.pop(p.x, p.y + 60, POP('backflow', 'WRONG WAY!'), '#ff5c7a', 19);
        callout('event', { t: POP('backflow', 'WRONG WAY!'), z: 'BACKFLOW', sec: 1.6 }); buzz([20, 20]);
        break;
      case 'zone':
        if (ev.zi === C.EGG_I) later(1.5, () => kevinThink('eggArrive'));
        // a zone crossed with no deal: the crawl lands its payoff (a punch, a shake, a named hold); no crawl ran, a lighter
        // punch still marks the line. A deal has the card stinger for that
        if (ev.draft === false) { if (crawlOn) crawlEnd(true); else { if (R.zoomPunch) R.zoomPunch(0.06); trauma(0.15); } }
        else crawlEnd();
        if (ev.draft === false) {
          const z = ZONES[ev.zi] || ZONES[ZONES.length - 1];
          if (ev.zi >= tutEndZone()) tutFinish();
          coachClear();
          zoneArrive(ev.zi, { t: z.name, z: `ZONE ${ev.zi + 1}`, sec: 1.6 }); A.bpm = z.beat; sfx('zone'); buzz([20, 40, 30]);
          if (!familyCoach(z)) coach(zoneCoach(z.id), firstSwim ? 4.5 : 3, 1);
          if (R.confetti) R.confetti(p.x, p.y, 30);
        }
        setIntensity();
        break;
      case 'maxed': {
        // a mutation at its max level: a capstone card says its capstone's name, any other card a small MAXED. A max-1
        // card is maxed by the pick itself (a deal): the pick already said so, no pop
        const mx = (MUTATIONS[ev.id] || {}).max | 0;
        if (mx <= 1 && justPicked && justPicked.id === ev.id && performance.now() - justPicked.ms < 400) break;
        const cap = (K.MUTATION_CAPSTONES || {})[ev.id];
        if (ev.capstone && cap && cap.name) { R.pop(p.x, p.y + 110, 'MAXED: ' + cap.name, '#ffd75c', 22, 1.5); sfx('maxed', { id: ev.id, capstone: true }); buzz([15, 25, 40]); }
        else if (!ev.capstone) { R.pop(p.x, p.y + 100, 'MAXED', '#ffd75c', 15, 0.9); sfx('maxed', { id: ev.id, capstone: false }); buzz(10); }
        break;
      }
      case 'capstone': {
        // a capstone fired for the first time this run: a TORPEDO!-style callout with its name
        const cap = (K.MUTATION_CAPSTONES || {})[ev.id];
        if (cap && cap.name) { R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 90, cap.name.toUpperCase() + '!', '#ffd75c', 20, 1.2); buzz(20); sfx('legendary'); trauma(0.2); }
        break;
      }
      case 'stunBonk': {
        // Kevin bonked a napping (stunned) swimmer: harmless, but it should feel silly
        const bx = ev.x != null ? ev.x : p.x, by = ev.y != null ? ev.y : p.y;
        sfx('swatBonk'); R.pop(bx, by + 30, pickLine(K.STUN_BONK_LINES) || 'BOING!', '#d9b8ff', 15, 0.9); buzz(8);
        break;
      }
      case 'helmetRing': {
        // Helmet Head's capstone: a knockback ring where the shield broke
        const hx = ev.x != null ? ev.x : p.x, hy = ev.y != null ? ev.y : p.y;
        if (R.ring) R.ring(hx, hy, '#ffd75c', +ev.r || 120, 0.4, 6);
        trauma(0.35); sfx('bump');
        break;
      }
      case 'gooIn':
        sfx('gooIn', { surf: !!ev.surf }); buzz(10);
        R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 40, pickLine(K.GOO_LINES || []) || 'STICKY!', ev.surf ? '#7dffb0' : '#c9f27a', 15, 0.9);
        break;
      case 'finale': {
        sfx('finale');
        const ks = Array.isArray(ev.ks) ? ev.ks : [];
        const k0 = ks.length ? ks[0] : ev.sprinters && ev.sprinters.length ? RIVALS.findIndex((r) => first(r.name) === first(ev.sprinters[0])) : -1;
        if (ev.sprinters && ev.sprinters.length) {
          // the lead sprinter in their own voice (K.RIVAL_SPRINT; _NEMESIS when it is the grudge), else the plain line
          const r0 = k0 >= 0 ? RIVALS[k0] : null, nemK = r0 && nemesisOf() === first(r0.name);
          const sp = r0 ? pickLine((nemK && byFirst(K.RIVAL_SPRINT_NEMESIS || {}, r0.name)) || byFirst(K.RIVAL_SPRINT || {}, r0.name) || []) : '';
          const names = andList(ev.sprinters.map(first));
          callout('event', { t: UIC('finalSprint', 'FINAL SPRINT!'), z: 'THE EGG', c: chadFix(sp) || fillLine(UIC('lastGear', '{names} found a secret gear!'), { names }), sec: 2.4, mustTop: true });
        }
        // the duel is named now, about 5 s before the egg: the VS slam (the lead sprinter) and the head start's ledger
        { const a0 = k0 >= 0 && race.agents ? race.agents[k0] : null, slam = vsSlamOnce(a0 && a0.boss ? a0 : null);
          const hv = headRead(); headLedger(hv > 0 ? hv : 0, slam ? 0.85 : 0.3); }
        if (k0 >= 0) react(k0, 'sprint', 2.4);
        // a rival who took the wrong tube is back for the finale
        // core sends comeback: 1 with how ('tube' or 'eaten'): the comeback is the last rival in ks
        const cb = ev.comeback, ck = ev.how && ks.length ? ks[ks.length - 1] : Number.isInteger(cb) ? cb : typeof cb === 'string' ? RIVALS.findIndex((r) => first(r.name) === first(cb)) : Array.isArray(cb) && cb.length ? (Number.isInteger(cb[0]) ? cb[0] : RIVALS.findIndex((r) => first(r.name) === first(cb[0]))) : cb === true ? k0 : -1;
        if (ck >= 0 && RIVALS[ck]) {
          const r = RIVALS[ck];
          callout('event', { t: `${first(r.name).toUpperCase()} IS BACK!`, z: rivalKicker(r.name), col: r.col, sec: 1.8 });
          // spat back out of a Big Macro: its own line (K.RIVAL_COMEBACK_EATEN, one per rival)
          // back from the wrong tube: K.RIVAL_COMEBACK (how 'tube')
          const ce = ev.how === 'eaten' ? byFirst(K.RIVAL_COMEBACK_EATEN || {}, r.name) : null;
          sayRival(ck, (Array.isArray(ce) ? pickLine(ce) : ce) || pickLine(byFirst(K.RIVAL_COMEBACK || {}, r.name) || []), 2.4, true);
        }
        break;
      }
      case 'swat': trauma(0.3, 1, 0); hitStopRL(45, p.x, p.y, 'swat', ev.wall < 0 ? 0.4 : -0.4, 0); R.pop(p.x, p.y + 40, 'SWAT!', '#5ce1ff', 16); sfx('swat'); buzz(20); break;
      case 'domino': {
        const n = Math.max(1, ev.n | 0);
        R.pop(p.x, p.y + 90, `DOMINO x${ev.n}!`, '#ffd75c', 19); hitStopRL(30 + 8 * n, p.x, p.y, 'domino');
        if (R.ring) R.ring(p.x, p.y, '#ffd75c', 60 + 20 * n, 0.4, 5);
        sfx('domino', n);
        break;
      }
      // panned by where the Big Macro is from Kevin (160 px is a full pan)
      case 'lockon': sfx('lockon', clamp(((ev.x != null ? ev.x : p.x) - p.x) / 160, -1, 1)); break;
      // a Big Macro spotted Kevin: a '!' over it and its own spotted sting, panned to where it is
      // a Lunger crouching (ev.lunge, ev.crouch s): a double '!!' in orange and its wind-up growl, the snap on dur
      case 'spot': {
        const pan = clamp(((ev.x != null ? ev.x : p.x) - p.x) / 160, -1, 1);
        if (ev.lunge) {
          if (ev.x != null) R.pop(ev.x, ev.y + 44, '!!', '#ff9a2a', 22, 0.7);
          sfx('pounce', { pan, dur: +ev.crouch > 0 ? +ev.crouch : undefined }); buzz([15, 40, 15]);
          break;
        }
        if (ev.x != null) R.pop(ev.x, ev.y + 40, '!', '#ff5c7a', 19, 0.6); sfx('spot', { pan });
        break;
      }
      // a gift (a free sugar on the first swims, systems 'gift'): a gold sugar sparkle where it was
      case 'gift': sfx('gift'); R.burst(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, '#ffd75c', 16, 140, 0.6, 3); if (R.ring) R.ring(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, '#ffd75c', 40, 0.4, 3); break;
      case 'drillTap': drillTapFx(ev); break;
      case 'rivalMove': rivalMoveFx(ev); break;
      case 'spareBite': {
        // the spare life took a Big Macro's bite: a hard hold, a red flash, a shove away from the jaws and a beat of slow-mo
        const bx = ev.x != null ? ev.x : p.x, by = ev.y != null ? ev.y : p.y;
        lastPopStop = clock;
        hitStop(110, bx, by, 'player', true); trauma(0.6, bx - p.x, by - p.y);
        if (!S.reduced) { R.lastFlashT = -9; R.flash = 0.35; R.flashCol = 'rgba(255,60,110,0.45)'; }
        slow(0.45); sfx('spareBite');
        R.pop(bx, by + 40, POP('spare', 'SPARE LIFE!'), '#ffd75c', 18, 1.1); buzz([20, 30, 20]); if (Array.isArray(K.SPARE_BITE_LINES) && K.SPARE_BITE_LINES.length) coach(pickLine(K.SPARE_BITE_LINES), 2.6, 1);
        break;
      }
      case 'swatBonk': R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 40, 'BONK!', '#7ae0ff', 19, 0.9); sfx('bonk'); buzz(12); break;
      case 'goalMet':
        goalHit = true; goalPill();
        callout('goal', { t: 'GOAL SMASHED!', z: '+' + fmt(ev.dna || 0) + ' 🧬', c: fillLine(pickLine(K.GOAL_MET_LINES) || '', { dna: fmt(ev.dna || 0) }) || null, col: '#ffd75c', sec: 1.8 });
        sfx('goal'); buzz([20, 30, 60]);
        break;

      case 'record': sfx('record'); R.pop(p.x, p.y + 90, POP('record', 'NEW BEST PLACE!'), '#ffd75c', 20, 1.4); break;
      case 'eggClaim': claimEgg(ev); break;
      case 'arrive': rivalArrive(ev); break;
      case 'rivalDrill': rivalF = clamp(+ev.f || 0, 0, 1); if (Number.isInteger(ev.k)) rivalK = ev.k; break;
      case 'drillShove': {
        const sk = ev.k != null ? ev.k : ev.boss; if (clock - (shoveAt[sk] || -9) < 0.4) break; shoveAt[sk] = clock;
        let x = ev.x, y = ev.y; const a = Number.isInteger(ev.k) ? race.agents[ev.k] : null;
        if (x == null && a) { x = race.agentX(a); y = a.y; }
        R.pop(x != null ? x : p.x, (y != null ? y : p.y) + 30, POP('drillShove', 'SHOVE!'), '#ff8b5c', 18); sfx('drillShove');
        // at the egg the shoves come in floods: a shake only, the hit-stop is saved for the lead change
        if (race.drill) { trauma(0.12); buzz(12); } else { hitStopRL(60, x, y, 'shove'); trauma(0.35); buzz([15, 20, 25]); }
        if (Number.isInteger(ev.k) && ev.k >= 0) react(ev.k, 'shove');
        break;
      }
      case 'drill': {
        sfx('egg'); drillLesson();
        // from generation 20 the egg has a doorbell (Act 3 on), and it rings for Kevin
        if ((meta.gen | 0) + 1 >= 20) { try { if (typeof A.doorbell === 'function') A.doorbell(); } catch (e) { /* optional */ } }
        eggSay(ev.rank === 1 ? 'arrive' : 'kevinKnocks');
        // (the VS slam and the head start's ledger played at the finale; a duel that had no finale still gets its slam)
        if (!vsSlamDone) vsSlamOnce();
        { const hv = +(ev.head ?? (race.drill && race.drill.head)) || 0;
          if (hv > 0 && hv > (+S.bestHead || 0)) { S.bestHead = Math.round(hv * 10) / 10; saveUI(); } }
        // 0.9 s, and never over a rival's tell (the '<< TAP LEFT!' prompt owns the centre)
        if (!(clock < tellOn)) callout('drill', { t: ev.rank === 1 ? (pickLine(EGG_LINES.first) || 'FIRST ONE THERE!') : `#${ev.rank} AT THE EGG`, z: 'THE EGG', sec: 0.9 });
        // ONE 0.3 s hit on the music's downbeat (A.eggLead: up to half a second away): the lean, the shake, the buzz
        { const lead = +A.eggLead || 0, dr = race;
          const hit = () => { if (race !== dr || race.over) return; slow(0.3, true); drillHit(); buzz([40, 40, 80]); };
          if (lead > 0 && lead < 0.5) later(lead, hit); else hit(); }
        break;
      }
      // a signature trick (systems: {id, n, first, repeat, kinds, firstEver}): a hold, a punch, its name big and gold
      case 'trick': trickFx(ev, p); break;
      // tricks back to back: a bigger pop each time, a longer hold
      case 'trickStreak': {
        const n = Math.max(1, ev.n | 0), TS = K.TRICK_STREAK_LINES || {};
        // n is the streak after the first trick: 1 is two tricks back to back (the pool's 2)
        const pool = TS[Math.min(n + 1, 4)] || TS[Math.min(n, 4)] || ['TRICK STREAK!'];
        const l = pickLine(pool) || 'TRICK STREAK!';
        // the trick's hold stretched to 90 + 20 per streak step (max, never a second hold on top); the pop and the sting
        // land on its release (hitRelease), or at once when no hold runs (reduced motion)
        hitStop(90 + 20 * Math.min(n, 4), race.p.x, race.p.y, 'trick', true);
        // a MEDLEY (five different tricks in a row): its own line and sting
        const ml = ev.medley ? pickLine(K.MEDLEY_LINES || []) || 'FULL ROUTINE!' : '';
        const go = () => { if (race && !race.over) { R.pop(VIEW_W / 2, race.p.y + 215, (ml || l) + (ev.mult > 1 ? ' x' + Math.round(ev.mult * 10) / 10 : ''), ml ? '#ffd75c' : '#ff5cd2', 30 + 2 * Math.min(n, 4) + (ml ? 4 : 0), ml ? 1.6 : 1.4); sfx(ml ? 'medley' : 'trickStreak', ml ? { n } : n); } };
        if (hitHold && hitHold.kind === 'trick' && stopT > 0) trickStreakPend = go; else go();
        trauma(0.25 + 0.05 * Math.min(n, 4)); buzz([20, 20, 30, 20, 50]);
        break;
      }
      case 'draftOn': buzz(8); sfx('draftOn'); break;
      case 'slingReady': buzz([10, 30, 14]); sfx('slingReady'); if (R.ring) R.ring(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, '#ffd75c', 36, 0.35, 3); break;
      // a remixed hazard's first look: Coach says what changed
      // (queued for hazTick: taught once a save, S.seenHaz 'hz_' + id, with a ring on the thing itself)
      case 'hzNew': {
        const id = String(ev.id || ''), l = (C.HZ_REMIX_INTRO || K.HZ_REMIX_INTRO || {})[id];
        if (!id || !l || S.seenHaz.includes('hz_' + id) || hzQ.some((q) => q.id === id)) break;
        let ent = null; for (const e of race.ents) if (Math.abs(e.x - ev.x) < 1 && Math.abs(e.y - ev.y) < 1) { ent = e; break; }
        hzQ.push({ id, l, ent, y: ev.y, at: clock });
        break;
      }
      // Kevin arrived at the egg in style: a bonus start ({dna, sec})
      case 'headBonus': {
        const dna = Math.round(+ev.dna || 0), sec = +ev.sec || 0, l = pickLine(K.HEAD_BONUS_LINES || []) || 'STYLE ENTRY!';
        const tail = dna > 0 ? ' +' + fmt(dna) + ' 🧬' : sec > 0 ? ' +' + sec.toFixed(1) + 's' : '';
        later(0.5, () => { if (race && !race.over) R.pop(race.p.x, race.p.y + 120, l.replace(/!+$/, '') + tail, '#ffd75c', 22, 1.3); });
        sfx('style', 3); buzz([15, 20, 30]);
        break;
      }
      // a Dad's habit perk fired ({id: the habit, perk, x, y}): the habit's icon and the perk's pop, gold, once a perk per 2 s
      case 'habitPerk': {
        const T = (K.HABIT_PERK_TEXT || {})[ev.perk]; if (!T) break;
        if (clock - (perkPopAt[ev.perk] ?? -99) < 2) break; perkPopAt[ev.perk] = clock;
        const ic = HABITS[ev.id] ? HABITS[ev.id].icon + ' ' : '', txt = ic + (pickLine(T.pops || []) || T.name || '');
        // (a zone banner never covers it: it waits for the banner to end)
        const show = () => { if (!race || race.over) return; R.pop(race.p.x, race.p.y + 70, txt, '#ffd75c', 17, 1.1); sfx('synergy'); buzz(10); };
        if (bannerUp()) perkWait.push({ fn: show, at: clock }); else show();
        break;
      }
      // the trick of the day (systems 'featuredTrick' {id}): one coach line at the countdown, with how to land it
      case 'featuredTrick': {
        const T = (C.TRICK_TEXT || K.TRICK_TEXT || {})[ev.id], pool = K.FEATURED_TRICK_LINES;
        if (!T || !T.name || !Array.isArray(pool) || !pool.length || firstSwim) break;
        featPend = { t: fillLine(pickLine(pool), { name: T.name }) + (T.hint ? ' ' + T.hint : ''), at: clock };
        featTick();
        break;
      }
      // swim 1's first real drag set the rank free ({gained} places): a jackpot pop on Kevin
      case 'firstSurge': {
        const g = Math.max(0, Math.round(+ev.gained || 0)); if (!g) break;
        const t = g >= 1000 ? '+' + Math.round(g / 1000) + 'k!' : '+' + fmt(g) + '!';
        R.pop(p.x, p.y + 70, t, '#ffd75c', 30, 1.3);
        if (R.ring) R.ring(p.x, p.y, '#ffd75c', 80, 0.45, 5);
        sfx('pass', 5); buzz([15, 25, 15]);
        break;
      }
      case 'over': finish(ev); break;
    }
}
// how far after its sfx() call the last snapped comboBank / comboMilestone hit lands (audio: A.lastSnapLead, 0 to 60 ms)
function snapLead() { try { const v = +A.lastSnapLead; return Number.isFinite(v) && v > 0 ? Math.min(0.06, v) : 0; } catch (e) { return 0; } }
// the featured trick's line waits for the coach strip to be free (8 s at most); it may run long, so it shows for 4 s
let featPend = null;
function featTick() {
  const f = featPend; if (!f) return;
  if (clock - f.at > 8 || !race || race.over) { featPend = null; return; }
  if (coachT > 0 || bannerUp()) return;
  featPend = null; coach(f.t, 4, 1, true);
}
function trickFx(ev, p) {
  const TT = C.TRICK_TEXT || K.TRICK_TEXT || {}, t = TT[ev.id], name = (t && t.name) || String(ev.id || 'TRICK').toUpperCase();
  // a fixed 90 ms hold that always lands (a streak in the same beat stretches this one, it never stacks a second)
  hitStop(90, race.p.x, race.p.y, 'trick', true); if (R.zoomPunch) R.zoomPunch(0.05);
  // its 3 chips flash gold on the strip first, then the name lands
  const kinds = Array.isArray(ev.kinds) && ev.kinds.length ? ev.kinds : null;
  if (kinds) trickFlash = { kinds, until: clock + 0.5 };
  try { if (R.trickTrace) R.trickTrace(kinds); } catch (e) { /* render hook is optional */ }
  trickTease = null;
  const first = !!ev.first;
  const pops = () => {
    if (!race || race.over) return;
    const y = race.p.y + 150;
    R.pop(VIEW_W / 2, y, name, '#ffd75c', 32, 1.4);
    if (first) R.pop(VIEW_W / 2, y + 44, pickLine(K.TRICK_NEW_LINES || ['NEW TRICK!']) || 'NEW TRICK!', '#7dffb0', 18, 1.4);
  };
  // swim 1 before the steer step is credited: a first trick's text waits (the sound and the hold still land)
  if (!(first && onbHold(pops))) later(kinds ? 0.15 : 0, pops);
  buzz([20, 30, 40]);
  sfx('trick', { id: ev.id, first: !!ev.first, kinds: ev.kinds });
}
// Egg Nose at the Fork: a sniff over each tube mouth as the split comes into view (K.FORK_SMELL), the right tube pink
let forkSmellDone = false;
function forkSmellTick() {
  if (forkSmellDone || !race || race.over || race.pending || !(race.muts && race.muts.nose) || !C.FORK_Y0 || typeof C.channel !== 'function') return;
  const p = race.p, d = C.FORK_Y0 - p.y; if (d > 520 || d < -150) return;
  forkSmellDone = true;
  const FS = K.FORK_SMELL || {}, y = C.FORK_Y0 + 260, es = race.eggSide === -1 || race.eggSide === 1 ? race.eggSide : 0;
  if (!es) return;
  for (const sd of [-1, 1]) {
    const ok = sd === es, l = pickLine(ok ? FS.right : FS.wrong); if (!l) continue;
    const ch = C.channel(y, sd);
    // (staggered: the two sniffs never sit on one line)
    R.pop(clamp(ch.c, 80, VIEW_W - 80), y - (sd > 0 ? 34 : 0), l, ok ? '#ff9be0' : '#c9b6c2', ok ? 15 : 13, 2.2);
  }
  sfx('tap', 0.7);
}
// Kevin's own thoughts (K.KEVIN_THINKS): a small pop above him, once every 15 s at most, never over a #tut card, a
// rival's line or swim 1's tutorial. kind: firstPass | passChad | nearMiss | lowGas | frenzy | macroClose | eggArrive
let thinkAt = -99, thinkPassed = false, thinkLowN = 0, thinkLow = false, thinkScanAt = 0;
// a thought never lands in a busy moment (body.intense, a threat, a 5+ combo, FRENZY): it waits (thinkPend) and plays
// once things have been calm (coachCalm) for 1.0 s, or is dropped after 6 s
const thinkBusy = () => !!race && (intenseOn || threatOnB || race.p.combo >= 5 || race.p.frenzyT > 0);
function kevinThink(kind) {
  if (!race || race.demo || race.over || mode !== 'race') return false;
  if (thinkBusy()) { thinkPend = { kind, at: clock }; thinkCalmAt = -1; return false; }
  if (clock - thinkAt < 15) return false;
  if (tutCardUp() || (tut && tut.on) || (R.bubble && R.bubble.life > 0) || clock - lastBubble < 2.5) return false;
  const pool = (K.KEVIN_THINKS || {})[kind]; if (!Array.isArray(pool) || !pool.length) return false;
  const p = race.p; thinkAt = clock;
  R.pop(p.x, p.y + 64, pickLine(pool), '#fff4f8', 13, 1.6, 'think');
  return true;
}
// the thoughts that come from watching the tube: the tank dipping under 20% (every other time) and a Big Macro that
// came within 120 px and was left behind
function thinkTick() {
  if (!race || race.demo || race.over || race.drill || mode !== 'race') return;
  if (thinkPend) {
    if (clock - thinkPend.at > 6) thinkPend = null;
    else if (!thinkBusy() && coachCalm()) { if (thinkCalmAt < 0) thinkCalmAt = clock; else if (clock - thinkCalmAt >= 1) { const k = thinkPend.kind; thinkPend = null; thinkCalmAt = -1; kevinThink(k); } }
    else thinkCalmAt = -1;
  }
  const p = race.p, lo = p.e / (p.maxE || 100) < 0.2;
  if (lo && !thinkLow) { thinkLowN++; if (thinkLowN % 2 === 0) kevinThink('lowGas'); }
  thinkLow = lo;
  if (clock - thinkScanAt < 0.2) return;
  thinkScanAt = clock;
  for (const e of race.ents) {
    if (e.t !== 'wbc' || e.dead || e.popcorn) continue;
    const dy = e.y - p.y;
    if (!e._kvNear && Math.abs(dy) < 120 && Math.abs((+e.x || 0) - p.x) < 120 && (!e.side || !p.side || e.side === p.side)) e._kvNear = true;
    else if (e._kvNear && !e._kvSaid && dy < -140) { e._kvSaid = true; kevinThink('macroClose'); }
  }
}
// a rematch (SWIM AGAIN on a card that named the rival): at 0.8 s ROUND 2 slams in with the lifetime record and the rival
// opens their mouth (K.RIVAL_REMATCH_OPEN); the first pass on them pays back (PAYBACK!), a win over them is REVENGE
let rematch = null;
function rematchTick() {
  const m = rematch; if (!m || m.slam || !race || race.demo || race.over || !(+race.t >= 0.8)) return;
  m.slam = true;
  const x = rivalRec(m.name), ag = race.agents[m.k];
  try { if (typeof R.vsSlam === 'function' && ag) R.vsSlam(null, ag, { record: `W ${x.beat | 0} - L ${x.lost | 0}`, kicker: 'ROUND 2' }); } catch (e) { /* only juice */ }
  const pool = byFirst(K.RIVAL_REMATCH_OPEN || {}, m.name);
  if (Array.isArray(pool) && pool.length) later(0.9, () => sayRival(m.k, pickLine(pool), 2.4));
}
// the egg's VS slam (art: R.vsSlam): Kevin against the named rival furthest into the egg, with the lifetime record
let vsSlamDone = false;
function vsSlamOnce(pref) {
  if (vsSlamDone || !race || typeof R.vsSlam !== 'function') return false;
  let best = pref && pref.boss && pref.alive ? pref : null, bf = -1;
  if (!best) for (const a of race.agents) if (a && a.boss && a.alive && a.arrived) { const f = (a.drill || 0) / (a.need || 1); if (f > bf) { bf = f; best = a; } }
  if (!best) return false;
  vsSlamDone = true;
  const nm = first(best.boss.name), x = rivalRec(nm);
  try { R.vsSlam(null, best, { record: `W ${x.beat | 0} - L ${x.lost | 0}`, nemesis: nemesisOf() === nm }); } catch (e) { return false; }
  { const k = rivalIndex({ boss: best.boss.name }); sfx('bossTaunt', k >= 0 ? k : undefined); } buzz([20, 30, 20]);
  return true;
}
// the head start, itemised over Kevin as he starts to drill (race.headParts): 'HEAD START 2.3s', then each term ticks in
// on the beat (tank, FRENZY tier, combo, bosses, lead), a red line for the hits taken; 1.2 s in all. (The header is a
// headline pop; the lines are 16 px, so the renderer keeps them while it is up, three at a time, the oldest rolling off)
function headLedger(hv, delay) {
  let hp = null; try { hp = typeof race.headParts === 'function' ? race.headParts() : null; } catch (e) { hp = null; }
  const head = hv > 0 ? hv : hp && Number.isFinite(+hp.duel) ? +hp.duel : 0;
  if (!(head > 0.05) && !(hp && hp.total > 0.05)) return;
  const rows = [];
  if (hp) {
    const tier = race.p.bestTier | 0;
    for (const [k, lbl, col] of [['tank', 'TANK', '#7dffb0'], ['tier', tier > 0 ? 'FRENZY T' + tier : 'FRENZY', '#ffd75c'], ['combo', 'COMBO', '#ff8be0'], ['boss', 'BOSSES', '#ffb36b'], ['lead', 'LEAD', '#5ce1ff']]) {
      const v = +hp[k] || 0; if (v >= 0.05) rows.push({ t: `${lbl} +${v.toFixed(1)}s`, col });
    }
    if (+hp.hits < -0.04) rows.push({ t: `HITS ${(+hp.hits).toFixed(1)}s`, col: '#ff5c7a' });
  }
  const dr = race, beat = clamp(60 / (A.bpm || 110) / 2, 0.12, 0.3), step = Math.min(beat, 1.2 / Math.max(1, rows.length + 1));
  // (it plays at the finale now, before the drill: any moment of this swim that is not over)
  const at = (i, fn) => later(delay + i * step, () => { if (race === dr && !race.over) fn(); });
  at(0, () => { R.pop(race.p.x, race.p.y + 190, `HEAD START ${head.toFixed(1)}s`, '#7dffb0', 20, 1.6); sfx('tap', 0.5); });
  rows.forEach((r, i) => at(i + 1, () => { R.pop(race.p.x, race.p.y + 176 - 26 * (i + 1), r.t, r.col, 16, Math.max(0.9, 1.6 - (i + 1) * step)); sfx('tap', 0.55 + 0.08 * i); }));
}
// a rival reached the egg before you: red alarm, a countdown and the music closes in
function claimEgg(ev) {
  if (eggClaimed) return; eggClaimed = true;
  let a = Number.isInteger(ev.k) ? race.agents[ev.k] : null;
  const nm = ev.name || ev.boss || (a && a.boss && a.boss.name) || '';
  const who = nm ? first(nm).toUpperCase() : 'SWIMMER #' + fmt(2 + Math.floor(Math.random() * 90000));
  const ep = nm ? epithetOf(nm) : '';
  callout('eggClaim', { t: fillLine(pickLine(EGG_LINES.claim) || '{name} IS AT THE EGG!', { name: who }), z: ep ? `${first(nm)} ${ep} · HURRY!`.toUpperCase() : 'HURRY!', zKeep: true, col: ev.col || (a && a.boss && a.boss.col) || '#ff5c7a', sec: 2.2 });
  { const ri = rivalIndex(ev); sfx('eggClaim', ri >= 0 ? ri : undefined); } buzz([30, 30, 60]);
  // Kevin was already drilling: the claimer crashes it (the VS slam, once a swim) and makes an entrance
  if (race.drill && a && a.boss) {
    crashSlam(a);
    const k = rivalIndex(ev); if (k >= 0) sayRival(k, eggEntranceLine(k), 2.2, true, 'arrive');
  }
}
// a rival's entrance line at the egg: the grudge line when it is your nemesis (K.RIVAL_NEMESIS_FINALE), else
// K.RIVAL_EGG_ENTRANCE
function eggEntranceLine(k) {
  const r = RIVALS[k]; if (!r) return '';
  const nem = nemesisOf() === first(r.name);
  const pool = byFirst((nem ? K.RIVAL_NEMESIS_FINALE : K.RIVAL_EGG_ENTRANCE) || {}, r.name) || (nem ? byFirst(K.RIVAL_EGG_ENTRANCE || {}, r.name) : null);
  return Array.isArray(pool) ? pickLine(pool) || '' : typeof pool === 'string' ? pool : '';
}
// the VS slam for a rival who crashes a drill already running (once a swim, shared with vsSlamOnce)
function crashSlam(a) {
  if (vsSlamDone || !race || typeof R.vsSlam !== 'function' || !a || !a.boss) return false;
  const nm = first(a.boss.name), x = rivalRec(nm);
  try { if (R.vsSlam(null, a, { record: `W ${x.beat | 0} - L ${x.lost | 0}`, nemesis: nemesisOf() === nm, kicker: 'CRASHING YOUR DRILL' }) === false) return false; } catch (e) { return false; }
  vsSlamDone = true;
  return true;
}
// a second (or later) rival reaches the egg while Kevin drills (core 'arrive' {boss, k}): a short banner, a taunt, a shake
function rivalArrive(ev) {
  if (!race || !race.drill) return;
  const k = Number.isInteger(ev.k) && ev.k >= 0 ? ev.k : rivalIndex(ev), r = RIVALS[k]; if (!r) return;
  const NAME = first(r.name).toUpperCase(), jl = pickLine(K.EGG_JOIN_LINES);
  callout('drill', { t: jl ? String(jl).replace('{name}', NAME) : `${NAME} JOINS THE FIGHT!`, col: r.col, sec: 1.2 });
  sfx('bossTaunt', k); buzz([20, 30, 20]); react(k, 'sprint');
  sayRival(k, eggEntranceLine(k), 2.2, true, 'arrive');
  trauma(0.25);
}
// overtakes come in floods: show them as one rolling "+places" number instead of a pile of popups
let passSum = 0, passT = 0;
function flushPasses(dt) {
  passT -= dt;
  // the HUD ticker next to the rank says "+places" now; the world stays clear for the swimmer
  if (passT <= 0) { passSum = 0; passT = 0.45; }
  const now = performance.now();
  if (passBlip && race && now - lastBlip >= 70) { passBlip = false; lastBlip = now; sfx('pass', race.p.combo); }
}
// big: the music's tape stop and bent beat (first FRENZY, the egg drill); small slows only dip the music
// big: the swell (only the first FRENZY and the egg drill); essential: never skipped by the slow-mo budget
function slow(sec, big, essential) {
  if (S.reduced) return;
  if (!big && !essential && !slowBudget(sec)) return;
  if (big || essential) slowLog.push({ at: clock, sec });
  slowT = Math.max(slowT, sec); try { A.slowmo(true, !!big); } catch (e) { /* ignore */ }
}
let tensionV = 0;
function setTension(v) { if (Math.abs(v - tensionV) < 0.02 && !(v === 0 && tensionV !== 0)) return; tensionV = v; try { A.tension = v; } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ the egg panel: you vs the best rival
const DU = (() => { const ui = $('drillUI'); return { ui, pips: ui.querySelector('.cpips'), head: ui.querySelector('.you u'), t: ui.querySelector('.t'), cd: ui.querySelector('.cd'), you: ui.querySelector('.you i'), youB: ui.querySelector('.you b'), riv: ui.querySelector('.riv'), rivI: ui.querySelector('.riv i'), rivB: ui.querySelector('.riv b'), ep: ui.querySelector('.ep'), rate: ui.querySelector('.rate'), rateI: ui.querySelector('.rate i') }; })();
let eggOn = false;
// the duel panel's band for the renderer (R.duelBox, logical units): name tags keep out of it. Measured when the panel
// shows or hides and in measureHud (it moves with the layout); null while it is hidden or beside the canvas (landscape)
function duelBoxMeasure() {
  if (DU.ui.classList.contains('hide')) { R.duelBox = null; return; }
  const c = cv.getBoundingClientRect(), dr = DU.ui.getBoundingClientRect(), kk = c.width ? VIEW_W / c.width : (R.cssK || 1);
  R.duelBox = dr.height && c.width && dr.right > c.left && dr.left < c.right ? { y0: (dr.top - c.top) * kk - 6, y1: (dr.bottom - c.top) * kk + 6 } : null;
}
function duelShow(on) {
  if (DU.ui._chide === !on) return;
  setC(DU.ui, 'hide', !on);
  duelBoxMeasure();
}
// the finale's HUD (body.egg): the CSS folds it down to the rank, the bar and the gas, then the HUD is measured again
function eggBody(on) {
  if (document.body._cegg === on) return;
  setC(document.body, 'egg', on);
  // (the bar moves clear of the pause button in the egg: #me and the rival dots are placed in px of its width)
  measureHud(); measureBar(); requestAnimationFrame(() => { measureHud(); measureBar(); });
}
// drill feel: core's 'drillTap' {n} is the taps it really counted. Each counted batch bursts, shakes and buzzes harder the
// further in Kevin is (frac = me / need); every 5th counted tap holds a beat with a ring. The meter shows taps a second
// against what core counts at most (C.DRILL_TAPS_MAX, 3): gold with MAX! from 95% of it.
const DRILL_CAP = C.DRILL_TAPS_MAX || 5;
let drillTapLog = [], drillCounted = 0, gaspDone = false, photoDone = false, photoT = 0, tellOn = 0, tellSide = 0, tellCol = '', steveSorrySaid = false;
// the move being answered: its rival (tellK) and kind (tellMove); the counter pips' last count (for the +1 pop)
let tellK = -1, tellMove = '', tellPipN = -1;
// how long a move's '<< TAP LEFT' prompt stays up: the whole window in which taps on that side count
function tellLen(ev) {
  const T = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  switch (ev.move) {
    case 'maxRep': return T(C.MOVE_TELL, 0.8);
    case 'byTheBook': return T(ev.t, T(C.MOVE_TELL, 0.8)) + (ev.cite ? T(C.BOOK_CITE_T, 1) : 0);
    case 'hairCheck': return T(C.MOVE_TELL, 0.8) + T(C.HAIR_T, 1.6);
    case 'stuntDive': return T(C.STUNT_OUT, 1.2);
    default: return 1.2;
  }
}
// the counter so far, as pips: [filled, of] for the move being answered (null when the move has no tap count)
function tellPips() {
  const a = race && tellK >= 0 ? race.agents[tellK] : null, mv = a && a.mv; if (!mv) return null;
  const need = +C.MOVE_COUNTER_TAPS || 3;
  if (tellMove === 'maxRep') return [mv.taps | 0, need];
  if (tellMove === 'byTheBook') return mv.citeTell >= 0 && !mv.citeDone ? [mv.citeTaps | 0, +C.BOOK_CITE_TAPS || 4] : null;
  if (tellMove === 'hairCheck') return [mv.hairTaps | 0, need];
  if (tellMove === 'stuntDive') { const hit = +C.STUNT_HIT || 0.18; return [Math.floor(clamp((+mv.taken || 0) / hit, 0, 1) * need + 1e-6), need]; }
  return null;
}
function pipsTick(tl) {
  const el = DU.pips; if (!el) return;
  const pp = tl ? tellPips() : null;
  setC(el, 'hide', !pp);
  if (!pp) { tellPipN = -1; return; }
  const [n0, of] = pp, n = clamp(n0, 0, of), key = n + '/' + of + '|' + tellCol;
  if (el._k !== key) {
    el._k = key;
    el.innerHTML = Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}${i === n - 1 && n > tellPipN && tellPipN >= 0 ? ' pop' : ''}"></i>`).join('');
    el.style.setProperty('--pc', tellCol || '#ffd75c');
  }
  tellPipN = n;
}
function drillTapFx(ev) {
  const n = ev.n | 0; if (n <= 0 || !race || !race.drill) return;
  const p = race.p, frac = clamp((race.drill.me || 0) / (race.drill.need || 1), 0, 1);
  R.burst(p.x, p.y + 20, '#5ce1ff', Math.round(4 + 8 * frac), 160, 0.3, 2);
  trauma(0.06 + 0.12 * frac); if (R.zoomPunch) R.zoomPunch(0.015 + 0.035 * frac);
  buzz(12);
  for (let i = 0; i < n; i++) {
    drillTapLog.push(clock); drillCounted++;
    if (drillCounted % 5 === 0) { if (R.ring) R.ring(p.x, p.y, frac > 0.7 ? '#ffd75c' : '#5ce1ff', 60 + 40 * frac, 0.3, 4); if (R.zoomPunch && !S.reduced) R.zoomPunch(0.04); }
  }
  // (the prompt stays up until that rival's move lands or is countered: rivalMoveFx ends it)
}
// a named rival's signature move at the egg (systems 'rivalMove' {k, move, phase}): the tell, the hit, the counter
// lastCounterAt[k]: a rival's counter lands its full fx at most once every 2.5 s
const lastCounterAt = {};
// the duel's move ledger for the result's post-mortem: per rival {tells, hits, counters, cost, move}
let duelLog = {};
function duelTally(ev, k) {
  if (k < 0 || !ev || (ev.move === 'sorry' && ev.dme)) return;   // (Steve's random 'sorry' gifts are not blocks)
  const d = duelLog[k] || (duelLog[k] = { tells: 0, hits: 0, counters: 0, cost: 0, move: ev.move || '' });
  if (ev.phase === 'tell') d.tells++;
  else if (ev.phase === 'hit') { d.hits++; d.cost += Math.abs(+ev.dme || +ev.gain || +ev.t || +ev.taken || 0) || 0.1; }
  else if (ev.phase === 'countered') { d.counters++; ctkPip(k); }
}
// a gold tick on the duel panel for each move countered
function ctkPip(k) {
  let el = DU.ui.querySelector('.ctk');
  if (!el) { el = document.createElement('div'); el.className = 'ctk'; el.setAttribute('aria-hidden', 'true'); DU.ui.insertBefore(el, DU.ep); }
  if (el.childElementCount >= 8) return;
  const i = document.createElement('i'); i.textContent = '✓'; if (RIVALS[k]) i.style.setProperty('--pc', RIVALS[k].col); el.appendChild(i);
}
function ctkClear() { const el = DU.ui.querySelector('.ctk'); if (el) el.textContent = ''; }
function rivalMoveFx(ev) {
  const k = rivalIndex(ev), r = RIVALS[k], p = race.p;
  duelTally(ev, k);
  // the move being answered landed or was blocked: its prompt goes (before any fx throttle below can return)
  if (k >= 0 && k === tellK && (ev.phase === 'countered' || (ev.phase === 'hit' && ev.move !== 'hairCheck'))) tellOn = 0;
  // Steve's 'sorry' gift: a tiny thank-you, nothing more (no hold, no banner, no bubble, not on the canvas's rival track)
  if (ev.phase === 'countered' && ev.move === 'sorry' && ev.dme) {
    R.pop(p.x, p.y + 60, '+SORRY', r ? r.col : '#ffd75c', 14, 0.6); buzz(8);
    // his first counter of the drill gets his line too (once a drill)
    if (r && !steveSorrySaid) { steveSorrySaid = true; sayRival(k, pickLine(byFirst(K.RIVAL_COUNTERED || {}, r.name) || []), 1.8, true, 'countered'); }
    return;
  }
  if (ev.phase === 'countered') { const ck = k >= 0 ? k : String(ev.k); if (clock - (lastCounterAt[ck] ?? -99) < 2.5) return; lastCounterAt[ck] = clock; }
  try { if (R.rivalMove) R.rivalMove(ev); } catch (e) { /* optional */ }
  if (!r) return;
  const fn = first(r.name);
  if (ev.phase === 'tell') {
    // the '<< TAP LEFT!' prompt owns the centre alone: a banner that is up goes
    if (coCur && coCur.kind !== 'milestone') coEnd();
    // the duel panel says which side to drum ('<< TAP LEFT!' in the rival's colour): the banner would only repeat it
    tellSide = ev.side === -1 || ev.side === 1 ? ev.side : 0; tellCol = r.col || '';
    callout('drill', { t: byFirst(K.RIVAL_MOVE_NAMES || {}, r.name) || 'WATCH OUT!', z: rivalKicker(r.name), zKeep: true, col: r.col, sec: 0.8, duHas: !!tellSide });
    sayRival(k, pickLine(byFirst(K.RIVAL_MOVE_TELLS || {}, r.name) || []), 1.6, true, 'tell');
    buzz([12, 10, 12], true); sfx('rivalTell', ev.k != null ? ev.k : k);
    tellOn = clock + tellLen(ev); tellK = k; tellMove = ev.move || ''; tellPipN = -1;
  } else if (ev.phase === 'hit') {
    trauma(0.3); kick(0, 0.3); buzz([20, 20, 30]);
    // the move landed: the rival crows (a bark only: no long line for a hit)
    sayRival(k, '', 1.2, true, 'hit');
    // Chad's 'hit' is the start of his hair care: his counter window is still open
    if (k === tellK && ev.move !== 'hairCheck') tellOn = 0;
  } else if (ev.phase === 'countered') {
    hitStop(90, p.x, p.y, 'countered');
    R.pop(p.x, p.y + 90, pickLine(K.EGG_COUNTER_BANNERS || ['COUNTERED!']), '#ffd75c', 28, 1.2);
    sfx('countered'); rivalOuch(k); buzz([15, 20, 40]); if (k === tellK) tellOn = 0;
    sayRival(k, pickLine(byFirst(K.RIVAL_COUNTERED || {}, r.name) || []), 1.8, true, 'countered');
  }
  void fn;
}
// a slow-mo at the egg is felt, not lived: the music bends (A.slowmo), the camera leans in and the edges darken for 0.3 s,
// while the sim keeps 0.85 speed or more (frameBody) so no tap is lost
function drillFeel(sec) {
  slow(sec, true);
  drillHit(true);
}
// the egg's impact: a lean in, dark edges (and, on arrival, a shake and a warm flash)
function drillHit(soft) {
  if (S.reduced) return;
  if (R.zoomPunch) R.zoomPunch(0.15);
  R.breakVig = Math.max(R.breakVig || 0, 0.3);
  if (soft) return;
  trauma(0.35); R.flash = Math.max(R.flash || 0, 0.18); R.flashCol = 'rgba(255,233,168,0.4)';
}
// audio: every drilling agent's progress 0..1 (contested drills keep the heartbeat up); [] when no drill
let ringsOn = false;
function drillRingsTick(need) {
  if (!A.drillRings) return;
  const list = [];
  if (race && !race.over && race.drill) {
    list.push((race.drill.me || 0) / (race.drill.need || need));
    for (const a of race.agents) if (a.alive && a.arrived) list.push((a.drill || 0) / (a.need || need));
  }
  if (!list.length && !ringsOn) return;
  ringsOn = list.length > 0;
  try { A.drillRings(list); } catch (e) { /* ignore */ }
}
function eggTick() {
  // the finale: the panel stays up (frozen) while the egg has its last word, until the result card takes over
  if (race && !race.demo && race.over && eggVoiceHold && mode === 'race') { eggOn = false; drillRingsTick(0); setC(DU.ui, 'tell', false); setC(DU.t, 'hide', true); setC(DU.pips, 'hide', true); eggSayTick(); setC(DU.ep, 'hide', !DU.ep._v); return; }
  if (!race || race.demo || race.over) { eggOn = false; drillRingsTick(0); duelShow(false); duelUp(false); return; }
  const need = race.drill ? race.drill.need : (C.EGG_DRILL || 3);
  let best = null, f = 0;
  for (const a of race.agents) if (a.alive && a.arrived) { const af = (a.drill || 0) / (a.need || need); if (af > f) { f = af; best = a; } }
  if (rivalF > f) { f = rivalF; if (rivalK >= 0 && race.agents[rivalK]) best = race.agents[rivalK]; }
  if (best && !eggClaimed) claimEgg({ name: best.boss ? best.boss.name : '', col: best.boss ? best.boss.col : null });
  const on = !!race.drill || !!best;
  if (on && !eggOn) { coachClear(); if (!race.drill && best && best.boss) eggSay('rivalKnocks', first(best.boss.name)); }
  if (on !== eggOn) requestAnimationFrame(measureHud);
  eggOn = on;
  duelShow(on);
  if (!on) eggBody(false);

  const me = race.drill ? (race.drill.me || 0) / need : 0;
  // photo finish: both of you past 85%: the world slows, the camera leans in, the band holds its breath (once)
  if (!photoDone && race.drill && best && me >= 0.85 && f >= 0.85) { photoDone = true; photoT = clock + 1.2; drillFeel(1.0); }
  // the lead passes 90%: one gasp from the band
  if (!gaspDone && race.drill && Math.max(me, f) > 0.9) { gaspDone = true; try { if (A.duelGasp) A.duelGasp(); } catch (e) { /* optional */ } }
  setTension(clock < photoT ? 1 : best ? clamp(0.25 + f * 0.75, 0, 1) : race.drill ? 0.2 : 0);
  drillRingsTick(need);
  if (!on) return;
  // the tap-rate meter, and a pulsing TAP! while a rival winds up a move
  drillTapLog = drillTapLog.filter((t) => clock - t < 1);
  const rate = drillTapLog.length / DRILL_CAP;
  setC(DU.rate, 'hide', !race.drill); setBar(DU.rateI, rate); setC(DU.rate, 'max', rate >= 0.95);
  // a rival's tell: which side to drum, in their colour (gameplay text: it shows under reduced motion too)
  const tl = clock < tellOn, ts = K.EGG_TELL_SIDE || {};
  setC(DU.ui, 'tell', tl);
  // the first drill on a save with no wins says how (the keys or the thumbs) while its ring points; then the drum call
  const teach = !tl && drillRingT > 0 && !!race.drill ? drillTeachText() : '';
  if (tl) setT(DU.t, (tellSide < 0 ? ts.left : tellSide > 0 ? ts.right : '') || 'TAP! TAP!'); else setT(DU.t, teach || 'TAP TAP TAP!');
  setC(DU.t, 'teach', !!teach);
  pipsTick(tl && !!race.drill);
  const tc = tl && tellSide && tellCol ? tellCol : '';
  if (DU.t._col !== tc) { DU.t._col = tc; DU.t.style.color = tc; }
  setC(DU.ui, 'claim', !!best);
  setC(DU.t, 'hide', !race.drill);
  // the egg panel sits under the HUD: the coach strip steps away and the egg banners and the drill lesson go below it
  eggBody(true);
  const dk = (race.drill ? 'd' : '') + (best ? 'b' : '');
  if (DU.ui._k !== dk) { DU.ui._k = dk; requestAnimationFrame(() => { const h = DU.ui.offsetHeight; if (h) { document.documentElement.style.setProperty('--duB', `calc(var(--hudB) + ${h + 14}px)`); document.documentElement.style.setProperty('--duH', h + 'px'); } measureHud(); }); }
  setBar(DU.you, race.drill ? race.drill.me / need : race.progress());
  // the head start the swim earned, shown as the bar's pre-filled stretch from the moment the duel starts
  { const hf = race.drill ? clamp((+race.drill.head || 0) / need, 0, 1) : 0; setBar(DU.head, hf); setC(DU.head, 'hide', !(hf > 0.005)); }
  setT(DU.youB, race.drill ? 'YOU' : 'YOU 🏊');
  setC(DU.riv, 'hide', !best); setC(DU.riv, 'hot', f > 0.7);
  if (best) {
    setBar(DU.rivI, f);
    const nm = best.boss ? first(best.boss.name).toUpperCase() : 'RIVAL';
    setT(DU.rivB, nm); setC(DU.rivB, 'long', nm.length > 7); if (clock >= epUntil && !epBusy()) setT(DU.ep, best.boss ? epithetOf(best.boss.name) : '');
    // a big countdown: the rival's own seconds to get in (what is left of its drill over its drill rate), red under 1.5 s.
    // Frozen and grey while it is not drilling (a counter, a stunt, a hair check); once Kevin drills, his live shove
    // pressure (0.07 x his taps a second) comes off its rate
    if (DU.cd._who !== best) { DU.cd._who = best; DU.cd._s = null; }
    const mv = best.mv, frozen = !!mv && (mv.stopT > 0 || mv.outT > 0);
    let secs = DU.cd._s != null ? DU.cd._s : 0;
    if (!frozen || DU.cd._s == null) {
      const left = Number.isFinite(best.need) && Number.isFinite(best.drill) ? Math.max(0, best.need - best.drill) : Math.max(0, (1 - f) * need);
      let rate = 1; try { rate = typeof race.drillRate === 'function' ? race.drillRate(best) : 1; } catch (e) { rate = 1; }
      if (race.drill) rate -= 0.07 * drillTapLog.length;
      secs = left / Math.max(0.05, rate);
      if (!Number.isFinite(secs)) secs = 99;
      secs = Math.min(99, secs);
    }
    DU.cd._s = secs;
    const st = secs.toFixed(1), key = nm + '|' + st + (frozen ? '|f' : '');
    if (DU.cd._k !== key) {
      DU.cd._k = key; DU.cd._v = null;
      DU.cd.innerHTML = `<small>${esc(nm)} BREAKS IN</small><b class="${frozen ? 'frz' : secs < 1.5 ? 'hot' : ''}">${st}s</b>`;
    }
  } else if (DU.cd._k !== '') { DU.cd._k = ''; DU.cd._s = null; DU.cd.textContent = 'Drill in before the others do!'; if (clock >= epUntil) setT(DU.ep, ''); }
  if (!best && clock >= epUntil && DU.ep._v) setT(DU.ep, '');
  setC(DU.ep, 'hide', !DU.ep._v);
  // 15 times a second: the duel rival swimming under the panel moves the panel up under the HUD
  if (clock - duelUpT >= 1 / 15 || clock < duelUpT) { duelUpT = clock; duelUpCheck(best); }
  eggSayTick();
}
// the egg panel steps up under the HUD while the duel rival is behind it (portrait only); measured from where it sits
// at rest, so the camera framing (measureHud) never moves with it. Held 1 s at least, so it never flaps
let duelUpOn = false, duelUpAt = -9, duelUpT = -9;
// the panel's box where it sits at rest (a step up under the HUD taken back out): the camera framing reads this one
function duRestRect() {
  const r = DU.ui.getBoundingClientRect(), off = duelUpOn ? parseFloat(DU.ui.style.getPropertyValue('--duY')) || 0 : 0;
  return off ? { top: r.top - off, bottom: r.bottom - off, left: r.left, right: r.right, height: r.height, width: r.width } : r;
}
function duelUp(on) {
  if (on === duelUpOn) return;
  duelUpOn = on; duelUpAt = clock;
  if (on) {
    const dr = DU.ui.getBoundingClientRect(), a = APP.getBoundingClientRect(), hb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hudB')) || 0;
    DU.ui.style.setProperty('--duY', Math.round(a.top + hb + 8 - dr.top) + 'px');
  }
  setC(DU.ui, 'up', on);
  requestAnimationFrame(duelBoxMeasure);
}
function duelUpCheck(best) {
  if (!best || landscape() || R.camY == null) { if (duelUpOn && clock - duelUpAt >= 1) duelUp(false); return; }
  const k = cv.clientWidth / VIEW_W; if (!(k > 0)) return;
  const sy = R.sy(best.y) * k + cv.offsetTop, sx = race.agentX(best) * k + cv.offsetLeft;
  // the panel's rest box (the move offset taken back out), 20 px of margin round it
  const dr = DU.ui.getBoundingClientRect(), a = APP.getBoundingClientRect(), off = duelUpOn ? parseFloat(DU.ui.style.getPropertyValue('--duY')) || 0 : 0;
  const y0 = dr.top - a.top - off - 20, y1 = dr.bottom - a.top - off + 20, x0 = dr.left - a.left - 20, x1 = dr.right - a.left + 20;
  const under = sy > y0 && sy < y1 && sx > x0 && sx < x1;
  if (under !== duelUpOn && (under || clock - duelUpAt >= 1)) duelUp(under);
}
// THE EGG speaks (K.EGG_VOICE) in the duel panel's small strip: one line per 2.5 s at most; a newer one waits its turn
// (only the newest waits), and a rival's line on the strip is never cut short
let eggSaidAt = -99, eggSayPend = null, eggVoiceHold = false;
// after Act 3's finale THE EGG has a new voice (K.EGG_VOICE_AFTER, when content has it; a key it lacks keeps EGG_VOICE's)
const eggVoice = () => {
  const A3 = S.act3Seen && K.EGG_VOICE_AFTER && typeof K.EGG_VOICE_AFTER === 'object' ? K.EGG_VOICE_AFTER : null;
  return A3 ? Object.assign({}, K.EGG_VOICE || {}, A3) : K.EGG_VOICE;
};
function eggSay(key, name, force) {
  const V = eggVoice(); if (!V || typeof V !== 'object' || !Array.isArray(V[key]) || !V[key].length) return;
  eggSayPend = { key, name: name || '', at: clock, force: !!force };
  eggSayTick();
}
function eggSayTick() {
  const q = eggSayPend; if (!q) return;
  if (clock - q.at > 4) { eggSayPend = null; return; }
  if (DU.ui.classList.contains('hide') || clock - eggSaidAt < 2.5 || (clock < epUntil && !q.force) || epBusy()) return;
  eggSayPend = null;
  const l = fillLine(pickLine((eggVoice() || {})[q.key] || []), { name: q.name || 'Somebody' });
  if (!l) return;
  eggSaidAt = clock; epUntil = clock + 2.2; setT(DU.ep, l); setC(DU.ep, 'hide', false);
}

// ------------------------------------------------------------------ end of run
let resAnim = null, prevBestCombo = 0, lastResult = null, resultReady = false, resultTO = 0;
// resTok: one token per result card; a late timer from an older card (or a hidden tab) never plays over a newer screen
let resTok = 0;
function resLater(ms, fn) { const tok = resTok; setTimeout(() => { if (tok === resTok && mode === 'result' && !document.hidden) { try { fn(); } catch (e) { console.error(e); } } }, ms); }
// the egg finale: the result card waits (3 s on a win, 2.4 s on a steal) while the rivals at the egg have their say;
// the first tap after 0.8 s skips straight to it. The timer is set first, so nothing below can ever lock the swim.
let finHold = null, overAt = -1;
function goResult(fin, o) {
  if (race !== fin || race.over !== o || mode !== 'race' || birthOn) return;
  finHold = null;
  // a real (not practice) win: the birth plays over the frozen egg first (a tap skips it), then the card
  if (o.reason === 'win' && o.baby && !o.baby.practice && typeof R.birth === 'function' && !S.reduced) {
    birthOn = { o, at: clock, first: (meta.wins | 0) === 1 };
    try { hud(false); coClear(); } catch (e) { /* the HUD can stay */ }
    const done = () => { if (!birthOn || birthOn.o !== o) return; birthOn = null; try { showResult(o); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left */ } } };
    try { R.birth(o.baby, { first: (meta.wins | 0) === 1, words: firstWord(o.baby) }, done); return; } catch (e) { console.error(e); birthOn = null; }
  }
  try { showResult(o); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left to show */ } }
}
// the birth beat (R.birth) is up: { o, at } until its done() hands over to the result card
let birthOn = null;
// the birth is skippable after 1.5 s on screen (2.5 s on the very first win: that one is worth seeing)
function birthSkip() { if (!birthOn || clock - birthOn.at < (birthOn.first ? 2.5 : 1.5)) return false; try { if (typeof R.birthSkip === 'function') R.birthSkip(); else { const o = birthOn.o; birthOn = null; showResult(o); } } catch (e) { /* the watchdog still ends it */ } return true; }
function finishSkip() {
  if (!finHold || clock < finHold.ready || performance.now() < finHold.readyMs) return false;
  const h = finHold; goResult(h.fin, h.o); return true;
}
// a win names who it beat: the arrived boss furthest into their drill (else the named rival nearest the egg on Kevin's
// side), the seconds they still needed (as core counts them), a stamp line from K.WIN_MARGIN_LINES in their colour.
// Worked out once per finished swim (o._margin)
function winMargin(o) {
  if (!o || o.reason !== 'win' || !race) return null;
  if (o._margin !== undefined) return o._margin;
  o._margin = null;
  let best = null, bf = -1;
  for (const a of race.agents) if (a && a.boss && a.alive && a.arrived) { const f = (a.drill || 0) / (a.need || 1); if (f > bf) { bf = f; best = a; } }
  let sec = NaN;
  if (best) {
    if (Number.isFinite(best.need) && Number.isFinite(best.drill)) { let r = 1; try { r = typeof race.drillRate === 'function' ? race.drillRate(best) : 1; } catch (e) { r = 1; } sec = Math.max(0, best.need - best.drill) / Math.max(0.01, r); }
  } else {
    for (const a of race.agents) { if (!a || !a.boss || !a.alive || a.arrived) continue; if (race.eggSide && a.side && a.side !== race.eggSide) continue; if (!best || a.y > best.y) best = a; }
    if (best) sec = Math.max(0, RACE_LEN - 70 - best.y) / Math.max(1, (race.s && race.s.speed) || 400);
  }
  if (!best) return null;
  if (!Number.isFinite(sec)) sec = Number.isFinite(o.gapSec) ? o.gapSec : NaN;
  if (!Number.isFinite(sec)) return null;
  sec = Math.round(sec * 10) / 10;
  const b = sec < 0.5 ? 'hair' : sec < 1.5 ? 'tail' : 'clear', pool = WIN_MARGIN_LINES[b];
  const name = first(best.boss.name).toUpperCase();
  const t = fillLine(pickLine(Array.isArray(pool) && pool.length ? pool : ['{s} S AHEAD OF {name}']), { name, s: sec.toFixed(1) });
  if (!t) return null;
  o._margin = { t, sec, photo: sec < 0.5, col: best.boss.col || '#ffd75c', name, agent: best };
  return o._margin;
}
function finish(o) {
  // a steal: the egg went while Kevin drilled, or before he even got there (race.eggTaken). Both hold 2.4 s (art pans to
  // the egg when he never arrived)
  const fin = race, win = o.reason === 'win', stolen = o.reason === 'late' && (!!race.drill || !!race.eggTaken);
  // eaten by a Big Macro or starved in the wrong tube: a beat longer, so the NOM lands before the card
  const gulp = o.reason === 'wbc' || o.reason === 'wrong';
  const soft = o.reason === 'quit' || o.reason === 'crash';
  const wait = win ? 3000 : stolen ? 2400 : soft ? 300 : gulp ? 1400 : 900;
  // the card waits on the race clock (frameBody), so a hidden tab or a hitch never skips the finale
  finHold = { fin, o, until: clock + wait / 1000, ready: clock + 1.2, readyMs: performance.now() + 1200 };
  try { save(); } catch (e) { /* storage */ }
  // where this Kevin fell: the next swim's grave mark
  if (!win && !soft) { S.lastDeathY = Math.round(race.p.y); saveUI(); }
  lastResult = o; endPot = { combo: Math.floor(Math.max(lastCombo, race.p.combo || 0)), pot: potV };
  try {
    clearInput(); setTension(0);
    if (win) buzz([50, 50, 50, 50, 200], true); else buzz([90, 60, 160], true);
    // Kevin's last frame: a held impact frame where he is (kind 'death' on a loss)
    // (a loss gasps once: the explicit A.impact below, so the hold's own gasp is skipped)
    if (!soft && !win) lastImpact = clock;
    if (!soft) hitStop(win ? 180 : 160, race.p.x, race.p.y, win ? 'kevin' : 'death', true);
    if (gulp) {
      const p = race.p;
      slow(0.7, false, true); if (R.zoomPunch && !S.reduced) R.zoomPunch(0.2); kick(0, 0.8);
      R.pop(p.x, p.y + 90, o.reason === 'wbc' ? 'NOM.' : 'pfffft...', o.reason === 'wbc' ? '#ff5c7a' : '#c9b6c2', 40, 1.4);
    }
    // the egg itself: a stolen egg names the thief in their colour and lets it sink in; a win says who is in
    if (stolen || win) {
      const th = race.eggTaken && race.eggTaken.boss ? race.eggTaken.boss : null;
      const nm = win ? 'KEVIN' : th ? first(th.name).toUpperCase() : o.by ? first(o.by).toUpperCase() : 'A RIVAL';
      const pool = win ? EGG_LINES.win : EGG_LINES.stolen, line = fillLine(pickLine(pool) || (win ? '{name} IS IN!' : '{name} STOLE THE EGG!'), { name: nm });
      coClear();
      callout('drill', { t: line, z: 'THE EGG', col: win ? '#7dffb0' : th ? th.col : '#ff5c7a', red: !win, sec: win ? 1.4 : 1.7 });
      // the egg's last word, in the duel panel (it stays up through the finale when it was showing)
      if (!DU.ui.classList.contains('hide') && K.EGG_VOICE) { eggVoiceHold = true; const bn = th ? th.name : byName(o); eggSay(win ? 'kevinIn' : 'rivalIn', bn ? first(bn) : '', true); }
      eggFinaleLines(win, th);
      // (the finale's banners never time out: the HUD loop is off once the swim is over, so a later beat replaces the last)
      const still = () => race === fin && mode === 'race' && !!finHold && finHold.fin === fin;
      // stolen before Kevin got there: how far away he still was, in the thief's colour, with the thief's claim sting
      if (stolen && !race.drill && Number.isFinite(+o.gapSec) && +o.gapSec > 0) {
        const tk = th ? RIVALS.findIndex((r) => r.name === th.name || first(r.name) === first(th.name)) : -1;
        later(0.6, () => { if (!still()) return; coEnd(); callout('drill', { t: `${(+o.gapSec).toFixed(1)}s AWAY`, z: th ? `${first(th.name)} got in first`.toUpperCase() : 'THE EGG', zKeep: true, col: th ? th.col : '#ff5c7a', red: true, sec: 1.6 }); sfx('eggClaim', tk >= 0 ? tk : undefined); });
      }
      // a win names who it beat, in their colour (a photo finish says so)
      const wm = win ? winMargin(o) : null;
      if (wm) later(0.9, () => { if (!still()) return; coEnd(); callout('drill', { t: wm.t, z: wm.photo ? 'PHOTO FINISH' : 'THE EGG', zKeep: true, col: wm.col, sec: 1.8 }); if (wm.photo) buzz([15, 25, 15]); });
      // a photo finish (a win by under 0.5 s, or a loss with Kevin's drill at 90%+): art freezes the frame (R.photoFinish)
      { const dr = race.drill, myF = dr && dr.need > 0 ? (+dr.me || 0) / dr.need : 0;
        const pw = win && wm && wm.sec < 0.5 ? { w: race.p, l: wm.agent || null, sec: wm.sec } : !win && stolen && myF >= 0.9 ? { w: race.eggTaken || null, l: race.p, sec: Number.isFinite(+o.gapSec) ? +o.gapSec : 0 } : null;
        if (pw && typeof R.photoFinish === 'function') later(0.9, () => { if (!still()) return; try { R.photoFinish(race, pw.w, pw.l, pw.sec); } catch (e) { /* optional */ } }); }
    }
    // the win flash must never lose to the 0.5 s flash limiter (a lead-change flash just before it)
    if (win) { R.lastFlashT = -9; R.flash = 1; R.flashCol = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) R.burst(race.p.x, race.p.y + 150, ['#ffd75c', '#ff5c8a', '#5ce1ff'][i % 3], 30, 400, 1.4, 5); if (R.confetti) R.confetti(); }
    else if (!soft) {
      // the loss flash never loses to the flash limiter either, and the band's gasp is not left to hitStop's 0.5 s throttle
      trauma(0.8); R.lastFlashT = -9; R.flash = 0.5; R.flashCol = 'rgba(120,0,30,0.6)';
      try { if (A.impact) A.impact(160); } catch (e) { /* optional */ }
    }
  } catch (e) { console.error(e); }
}
// each named rival still at the egg says one line, 0.35 s apart: a win gets their sore-loser lines, a steal the thief's
// line from inside the egg and one sore line from another rival
function eggFinaleLines(win, thief) {
  const at = [];
  RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && a.alive && a.arrived && a.boss && (!thief || a.boss !== thief)) at.push(k); });
  const says = [];
  if (win) {
    // Kevin won against them: each rival's 'lose' bark (K.RIVAL_EGG_BARKS) in its own duel bubble, the long line as the fallback
    const barks = [];
    for (const k of at) { const b = (byFirst(K.RIVAL_EGG_BARKS || {}, RIVALS[k].name) || {}).lose; if (Array.isArray(b) && b.length && typeof R.duelSay === 'function') barks.push([k, pickLine(b)]); else says.push([k, pickLine(byFirst(K.RIVAL_EGG_LOSS || {}, RIVALS[k].name) || [])]); }
    barks.forEach(([k, l], i) => later(0.35 * i + 0.3, () => { try { R.duelSay(k, l, 1.4); babble(k, l); } catch (e) { /* optional */ } }));
  }
  else {
    const tk = thief ? RIVALS.findIndex((r) => r.name === thief.name || first(r.name) === first(thief.name)) : -1;
    if (tk >= 0) says.push([tk, pickLine(byFirst(K.RIVAL_STEAL || {}, RIVALS[tk].name) || [])]);
    // one other rival is a sore loser about the thief ({thief}); no pool, no line (never a line about losing to Kevin)
    if (at.length && tk >= 0) {
      const pool = byFirst(K.RIVAL_SORE || {}, RIVALS[at[0]].name);
      if (Array.isArray(pool) && pool.length) says.push([at[0], fillLine(pickLine(pool), { thief: first(RIVALS[tk].name) })]);
    }
  }
  says.filter((x) => x[1]).forEach(([k, l], i) => later(0.35 * i + 0.3, () => sayRival(k, l, 1.6, true, win ? 'lose' : '')));
}
// a tiny clock-driven delay queue (pauses with the race, cleared on a new swim). Each entry carries its swim (a token): a
// callback never lands in a different swim. The queue also waits out a card deal and a countdown (its clock stands
// still there), and a line queued during a live swim is dropped once the swim is over; the finale's own beats (queued
// after the end) still play
let laterQ = [];
function later(sec, fn) { laterQ.push({ at: clock + sec, fn, r: race, over: !!(race && race.over) }); }
function laterTick(dt = 0) {
  if (!laterQ.length) return;
  if (race && (race.pending || countT > 0)) { for (const q of laterQ) q.at += dt; return; }
  laterQ = laterQ.filter((q) => q.r === race && !(race && race.over && !q.over));
  const due = laterQ.filter((q) => clock >= q.at); if (!due.length) return;
  laterQ = laterQ.filter((q) => clock < q.at);
  for (const q of due) { if (q.r !== race) continue; try { q.fn(); } catch (e) { console.error(e); } }
}
function eggWinner() {
  let w = race.eggTaken || null;
  if (!w) for (const a of race.agents) if (a.alive && a.arrived && (!w || a.drill > w.drill)) w = a;
  return w;
}
function byName(o) {
  let by = o.by;
  if (typeof by === 'number') by = RIVALS[by] && RIVALS[by].name;
  if (!by && o.reason === 'late') { const w = eggWinner(); if (w && w.boss) by = w.boss.name; }
  return by || null;
}
function beatenSet(o) {
  const s = new Set(), rb = o.rivalsBeaten;
  if (Array.isArray(rb)) { for (const v of rb) { const k = typeof v === 'number' ? v : RIVALS.findIndex((r) => r.name === v || first(r.name) === first(v)); if (k >= 0) s.add(k); } return s; }
  if (typeof rb === 'number') { for (let k = 0; k < Math.min(rb, RIVALS.length); k++) s.add(k); return s; }
  if (o.reason === 'win') { RIVALS.forEach((r, k) => s.add(k)); return s; }
  RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && (!a.alive || (!a.arrived && a.y < race.p.y))) s.add(k); });
  return s;
}
function gapInfo(o, by) {
  if (o.reason === 'win' || o.reason === 'quit' || o.reason === 'crash') return null;
  let sec = Number.isFinite(o.gapSec) ? o.gapSec : null, name = o.gapBy || o.gapName || by;
  if (typeof name === 'number') name = RIVALS[name] && RIVALS[name].name;
  if (!name) { let top = null; RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && a.alive && (a.arrived || a.y > race.p.y) && (!top || a.y > top.y)) top = a; }); if (top && top.boss) name = top.boss.name; }
  if (sec != null && sec <= 0.05) return null;
  if (sec == null) {
    const p = race.p;
    if (o.reason === 'late') { sec = race.drill ? (race.drill.need - race.drill.me) / 0.5 : race.remaining() / Math.max(300, p.vy || 400) + (C.EGG_DRILL || 3) / 0.5; }
    else {
      let best = null; RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && a.alive && a.y > p.y && (!best || a.y - p.y < best.y - p.y)) best = a; });
      if (best) { sec = (best.y - p.y) / Math.max(200, best.sp || 450); name = name || best.boss.name; }
    }
  }
  if (sec == null || !(sec >= 0) || sec > 600) return null;
  return { sec, name };
}
// a joke about this very swim (K.RESULT_STAT_QUIPS), about 40% of the time when one fits
let fruitN = 0;
let lastDashAt = -99, endPot = null, zoomPastAt = -99, dashN = 0, gasBurn = 0;
function statQuip(o, win) {
  const Q = K.RESULT_STAT_QUIPS; if (!Q) return '';
  const z = o.zone | 0, fits = [], p = race.p, lost = !win && o.reason !== 'quit' && o.reason !== 'crash';
  // the sharp ones about how this very swim ended: 70% of the time when one fits
  const sharp = [];
  if (lost && p.frenzyT > 0) sharp.push(['diedInFrenzy', {}]);
  if (lost && endPot && endPot.combo >= 10 && endPot.pot >= 3) sharp.push(['unbankedPot', { n: fmt(endPot.combo) }]);
  if (lost && (p.shield | 0) >= 2) sharp.push(['shieldsUnused', { n: p.shield | 0 }]);
  if (lost && (o.uiCause === 'wrong' || o.reason === 'wrong')) { const ck = RIVALS.findIndex((r) => first(r.name) === 'Chad'), ca = ck >= 0 ? race.agents[ck] : null; if (ca && ca.side && ca.side === p.side) sharp.push(['followedChadWrong', {}]); }
  if (lost) for (const nm of passedOnce) { const k = RIVALS.findIndex((r) => r.name === nm || first(r.name) === first(nm)), a = k >= 0 ? race.agents[k] : null; if (a && a.alive && a.y > p.y) { sharp.push(['passedRivalThenDied', { name: first(nm) }]); break; } }
  if (o.reason === 'wbc' && (p.dashT > 0 || clock - lastDashAt < 1.2)) sharp.push(['wbcAfterDash', {}]);
  const sOk = sharp.filter(([id]) => Array.isArray(Q[id]) && Q[id].length);
  if (sOk.length && Math.random() < 0.7) { const [id, v] = sOk[Math.floor(Math.random() * sOk.length)]; return fillLine(pickLine(Q[id]), v); }
  if (Math.random() >= 0.4) return '';
  if (lost && z === 0 && (race.t || 0) < 25) fits.push(['fastDeath', {}]);
  if (fruitN === 0 && z >= 1) fits.push(['noFruit', {}]);
  if ((o.combo | 0) >= 40) fits.push(['hugeCombo', { n: fmt(o.combo) }]);
  if (bonkN >= 4) fits.push(['manyBonks', { n: bonkN }]);
  if (!win && z >= 2 && (o.overtakes | 0) < 15) fits.push(['fewOvertakes', { n: o.overtakes | 0 }]);
  if (!win && nemAtStart) { const k = RIVALS.findIndex((r) => first(r.name) === nemAtStart); if (k >= 0 && beatenSet(o).has(k)) fits.push(['nemesisBeatButLost', { name: nemAtStart }]); }
  const ok = fits.filter(([id]) => Array.isArray(Q[id]) && Q[id].length);
  if (!ok.length) return '';
  const [id, v] = ok[Math.floor(Math.random() * ok.length)];
  return fillLine(pickLine(Q[id]), v);
}
// the DNA receipt: core's breakdown when it has one, otherwise rebuilt from the run
const BD_LABELS = { distance: 'Distance', dist: 'Distance', placing: 'Placing', place: 'Placing', rank: 'Placing', combos: 'Combos', combo: 'Combos',
  banked: 'Banked', bank: 'Banked', bounties: 'Bounties', bounty: 'Bounties', gen: 'Gen x', genMul: 'Gen x', auto: 'AUTO -40%', autoCut: 'AUTO -40%', autopilot: 'AUTO -40%',
  daily: 'Daily streak', dailyBonus: 'Daily streak', streak: 'Daily streak', photo: 'Photo finish!', goal: 'Goal smashed!',
  near: 'So near!', podium: 'Podium', firstWin: 'First win!', medal: 'Daily medal', dailyScale: 'Daily lap pay',
  tough: K.TOUGH_DAY_LABEL || "Dad's sympathy", first: 'FIRST BABY BONUS' };
// a multiplier row (x0.5), never a +DNA row: the generation's and the daily repeat lap's
const MULT_KEY = /^gen|^dailyScale/i;

function receipt(o) {
  const bd = o.breakdown, out = [];
  const add = (label, v, key) => {
    if (v == null || !Number.isFinite(+v)) return; v = +v;
    const mk = key || label, mult = MULT_KEY.test(mk) && v >= 0 && v < 10;
    if (mult && Math.abs(v - 1) < 0.01) return;
    // a full-pay lap is no news; a no-pay one reads x0
    if (/^dailyScale/i.test(mk) && !mult) return;
    if (/^auto/i.test(key || label) && v > 0) v = -v;   // the autopilot cut comes off the total
    // the autopilot row says how much it took ('AUTO -24%'); a swim the sat-nav drove all the way says what it kept
    if (/^auto/i.test(key || label)) { const ap = Math.round(+o.autoPct); label = ap >= 60 ? 'Sat-nav kept 40%' : ap > 0 ? 'AUTO -' + ap + '%' : label; }
    if (!mult && Math.round(v) === 0) return;
    out.push({ label, v, mult, key: key || '' });
  };
  if (Array.isArray(bd)) for (const it of bd) { if (Array.isArray(it)) add(String(it[0]), it[1]); else if (it && typeof it === 'object') add(String(it.label || BD_LABELS[it.k || it.key || it.id] || it.k || it.key || it.id || ''), it.dna ?? it.v ?? it.value, it.k || it.key || it.id); }
  // a key with no label of its own is internal: never a raw 'dailyScale +1' row
  else if (bd && typeof bd === 'object') for (const k of Object.keys(bd)) { if (BD_LABELS[k]) add(BD_LABELS[k], bd[k], k); }
  if (out.length) return out;
  const gm = typeof C.genFactor === 'function' ? C.genFactor(race.gen || 0) : 1, base = o.dna / gm, d = (o.dist || 0) / 1400;
  let pl = Math.max(0, Math.log10(TOTAL_SWIMMERS / Math.max(1, o.rank))) * 6;
  if (o.reason === 'win') pl += 150;
  add('Distance', d); add('Placing', pl); add('Combos & pickups', Math.max(0, base - d - pl));
  if (gm > 1) out.push({ label: 'Gen x', v: gm, mult: true });
  return out;
}
// rivals: lifetime wins and losses, and the nemesis (lost to them 3+ more times than you beat them)
function rivalRec(name) { const m = meta.rivals || {}; return m[first(name)] || m[name] || { beat: 0, lost: 0 }; }
function nemesisOf() {
  let best = null, bd = 2;
  for (const r of RIVALS) { const x = rivalRec(r.name), d = (x.lost | 0) - (x.beat | 0); if (d >= 3 && d > bd) { bd = d; best = first(r.name); } }
  return best;
}
// the rival with the most drilling done when you got in (for the win line and the win sting)
function topDriller() {
  let best = -1, bf = 0;
  RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && a.alive && a.arrived) { const f = (a.drill || 0) / (a.need || 1); if (f > bf) { bf = f; best = k; } } });
  return best;
}
let resEggHome = null;
function placeResEgg(close) {
  const eg = $('resEgg');
  if (!resEggHome) resEggHome = { parent: eg.parentNode, next: eg.nextSibling };
  if (close) $('resRank').after(eg); else resEggHome.parent.insertBefore(eg, resEggHome.next);
  eg.classList.toggle('close', !!close);
}
function nextGoalLine(g) {
  if (!g || typeof g !== 'object') return '';
  const kind = g.kind || g.type || g.id, tpl = NEXT_GOAL_LINES[kind]; if (!tpl) return '';
  // core: { id, target, dna, k } (target is a zone index for reachZone, a combo count for combo)
  const zi = Number.isInteger(g.target) && kind === 'reachZone' ? g.target : Number.isInteger(g.zone) ? g.zone : -1;
  const zone = typeof g.zone === 'string' ? g.zone : zi >= 0 && ZONES[zi] ? ZONES[zi].name : 'the next zone';
  const name = g.name != null ? first(typeof g.name === 'number' ? RIVALS[g.name] && RIVALS[g.name].name : g.name) : Number.isInteger(g.k) && RIVALS[g.k] ? first(RIVALS[g.k].name) : 'them';
  const dna = +(g.dna ?? g.reward ?? g.bonus) || 0;
  return fillLine(tpl, goalSlots(g, name, zone)) + (dna > 0 ? ` +${fmt(dna)} 🧬` : '');
}
// a goal's slots: {name}, {zone}, {n} (a margin goal's seconds, else the target) and {trick} (the trick's display name)
function goalSlots(g, name, zone) {
  const TT = C.TRICK_TEXT || K.TRICK_TEXT || {}, tr = g.trick && TT[g.trick] && TT[g.trick].name ? TT[g.trick].name : 'trick';
  return { name, zone, n: g.n ?? g.target ?? '', trick: tr };
}
// the small flavour line under a next goal (K.NEXT_GOAL_FLAVOR[kind], the same slots)
function goalFlavor(g) {
  if (!g || typeof g !== 'object') return '';
  const kind = g.kind || g.type || g.id, pool = (K.NEXT_GOAL_FLAVOR || {})[kind];
  if (!Array.isArray(pool) || !pool.length) return '';
  const zi = Number.isInteger(g.target) && kind === 'reachZone' ? g.target : -1;
  const zone = typeof g.zone === 'string' ? g.zone : zi >= 0 && ZONES[zi] ? ZONES[zi].name : 'the next zone';
  const name = Number.isInteger(g.k) && RIVALS[g.k] ? first(RIVALS[g.k].name) : 'them';
  return fillLine(pickLine(pool), goalSlots(g, name, zone));
}
// one synergy you hold half of: tease the missing card
function soCloseLine() {
  if (!SYNERGY_SO_CLOSE.length) return '';
  const seen = meta.synergiesSeen || [];
  for (const s of SYNERGIES) {
    if (race.syn && race.syn[s.id]) continue;
    const miss = s.needs.filter((n) => !(race.muts[n] > 0));
    if (miss.length !== 1 || miss.length === s.needs.length || !MUTATIONS[miss[0]]) continue;
    const m = MUTATIONS[miss[0]];
    const known = seen.includes(s.id);
    return fillLine(pickLine(SYNERGY_SO_CLOSE), { card: m.icon + ' ' + m.name, combo: known ? s.icon + ' ' + s.name : 'a secret mashup' });
  }
  return '';
}
// the lost egg duel's post-mortem (K.DUEL_POSTMORTEM by the biggest shortfall in race.headParts(): tank | tier | boss,
// else taps) and the head start the swim earned. race.headParts() may return {tank, tier, boss, ...} as {v, max} pairs (or
// numbers with a .max map, or a .short map) and .total; without it the line falls back to 'taps'
function headShort() {
  let hp = null; try { hp = typeof race.headParts === 'function' ? race.headParts() : null; } catch (e) { hp = null; }
  let key = 'taps', bs = 0.05, total = race.drill && Number.isFinite(+race.drill.head) ? +race.drill.head : NaN;
  if (hp && typeof hp === 'object') {
    for (const k of ['tank', 'tier', 'boss']) {
      const x = hp[k]; let sh = NaN;
      if (x && typeof x === 'object') sh = (+x.max || 0) - (+(x.v ?? x.got ?? x.value ?? x.val) || 0);
      else if (hp.short && Number.isFinite(+hp.short[k])) sh = +hp.short[k];
      else if (hp.max && Number.isFinite(+x) && Number.isFinite(+hp.max[k])) sh = +hp.max[k] - +x;
      if (sh > bs) { bs = sh; key = k; }
    }
    if (!Number.isFinite(total) && Number.isFinite(+hp.total)) total = +hp.total;
  }
  return { key, total };
}
// the result's chip row extras (the duel's head start and best vs now, the daily attempt's pay), merged in by chipsDone()
let resChipBase = [], resChipX = [];
function chipsDone() {
  const chips = $('resChips'); if (!chips) return;
  const all = resChipBase.concat(resChipX);
  chips.innerHTML = all.join(' · '); setC(chips, 'hide', !all.length);
}
// the duel's costliest rival move (most landed, then the most it cost): { k, d }
function duelWorst() {
  let bk = -1, bd = null;
  for (const k of Object.keys(duelLog)) { const d = duelLog[k]; if (d.hits > 0 && (!bd || d.hits > bd.hits || (d.hits === bd.hits && d.cost > bd.cost))) { bk = +k; bd = d; } }
  return bd ? { k: bk, d: bd } : null;
}
function duelPostmortem(on, g, foe, won) {
  const el = $('resDuel'); if (!el) return;
  const P = K.DUEL_POSTMORTEM || {};
  let html = '';
  if (on) {
    const hs = headShort(), sec = g && Number.isFinite(g.sec) ? g.sec.toFixed(1) : '', name = foe ? first(foe) : 'The winner';
    // a line that needs a number it cannot have is never picked
    const pool = (Array.isArray(P[hs.key]) ? P[hs.key] : P.taps || []).filter((l) => sec || !/\{sec\}/.test(l));
    const line = pool.length ? fillLine(pickLine(pool), { sec, name }) : '';
    // the head start and the best one any swim brought (S.bestHead) go on the chip row: 'Head start +2.1s · Best 2.8s'
    if (Number.isFinite(hs.total)) resChipX.push(`Head start +${hs.total.toFixed(1)}s`);
    const bh = +S.bestHead || 0, now = race.drill && Number.isFinite(+race.drill.head) ? +race.drill.head : hs.total;
    if (bh > 0 && Number.isFinite(now) && now < bh - 0.05) resChipX.push(`Best ${bh.toFixed(1)}s`);
    // the costliest move, named, with what to do about it
    const w = duelWorst();
    let mv = '';
    if (w && RIVALS[w.k]) {
      const r = RIVALS[w.k], fn = first(r.name), MN = byFirst(K.RIVAL_MOVE_NAMES || {}, r.name) || 'BIG MOVE';
      const her = /^(Tiffany)$/.test(fn) ? 'HER' : 'HIS';
      mv = `${fn.toUpperCase()}'S ${String(MN).replace(/[!.]+$/, '')}: ${w.d.hits} landed, ${w.d.counters} blocked. Drum ${her} side.`;
    }
    if (line || mv) html = esc(line) + (mv ? `<small class="mv">${esc(mv)}</small>` : '');
  } else if (won) {
    // a won duel: how many of the rivals' moves were blocked
    let n = 0, m = 0;
    for (const k of Object.keys(duelLog)) { const d = duelLog[k]; n += d.counters; m += Math.max(d.tells, d.hits + d.counters); }
    if (m > 0) html = `<small class="mv">Blocked ${n} of ${m} move${m === 1 ? '' : 's'}</small>`;
  }
  el.innerHTML = html; setC(el, 'hide', !html);
}
// the daily's repeat laps pay less: 'Attempt 2 · half pay' (over.dailyAttempt, over.dailyScale) and a line about it
function dailyAttemptLine(o) {
  const el = $('resAttempt'); if (!el) return;
  const n = o.dailyAttempt | 0, sc = +o.dailyScale;
  const on = o.daily != null && n > 1 && Number.isFinite(sc) && sc < 1;
  const payOf = (v) => (v <= 0 ? 'no pay' : Math.abs(v - 0.5) < 0.01 ? 'half pay' : Math.round(v * 100) + '% pay');
  // what the next attempt today pays (C.dailyScaleOf), when it pays less than this one did
  let nx = '';
  try { if (o.daily != null && n >= 1 && typeof C.dailyScaleOf === 'function') { const ns = +C.dailyScaleOf(n + 1); if (Number.isFinite(ns) && ns < (Number.isFinite(sc) ? sc : 1) - 0.001) nx = `next attempt pays x${+ns.toFixed(2)}`; } } catch (e) { nx = ''; }
  let t = '';
  // the attempt and its pay ride on the chip row; this line keeps the joke and what the next attempt pays
  if (on) {
    resChipX.push(`Attempt ${n} · ${payOf(sc)}`);
    const l = pickLine(K.DAILY_ATTEMPT_LINES || []);
    t = [nx ? nx.charAt(0).toUpperCase() + nx.slice(1) : '', l].filter(Boolean).join('. ');
  } else if (nx) t = nx.charAt(0).toUpperCase() + nx.slice(1);
  setT(el, t); setC(el, 'hide', !t);
}
// Dad's factory, on the result and the shop: when it is full, what that pays and what it buys
// ('Factory full at 21:40: +120 DNA, enough for Broccoli Lv 3'); nothing until the factory has been revealed
const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function factoryLine(el) {
  if (!el) return;
  let t = '';
  try {
    if (revealOn('bank')) {
      idleTick(meta, Date.now());
      const rate = factoryRate(meta), cap = rate * capHours(), bank = meta.bank || 0;
      if (rate > 0 && cap >= 1) {
        const full = bank >= cap - 0.5, n = Math.floor(cap), pot = meta.dna + cap;
        const dp = dadPickId(), open = HABIT_ORDER.filter((id) => HABITS[id] && lv(meta, id) < habMax(id)).map((id) => ({ id, c: habitCost(id, lv(meta, id)) })).sort((a, b) => a.c - b.c);
        const tgt = (dp && open.find((x) => x.id === dp && x.c <= pot)) || open.filter((x) => x.c <= pot).pop() || null;
        const buys = tgt ? `, enough for ${HABITS[tgt.id].name} Lv ${lv(meta, tgt.id) + 1}` : '';
        t = full ? `🏭 Factory FULL: +${fmt(n)} DNA waiting${buys}` : `🏭 Factory full at ${hhmm(Date.now() + (cap - bank) / rate * 3600000)}: +${fmt(n)} DNA${buys}`;
      }
    }
  } catch (e) { t = ''; }
  setT(el, t); setC(el, 'hide', !t);
}
// the rematch button, by the card's one story (x: { by, close, g, kind, cause, named, firstRes, byK, cm, pk })
// under this many cm to go the egg caption says 'Nose on the egg' and the rematch button says REMATCH_NOSE (never '0.01 CM')
const NOSE_CM = 0.015;
function rematchLabel(o, x) {
  const pk = x.pk || pickLine, by = x.by, g = x.g, death = x.kind === 'death' || x.kind === 'eggGas';
  // a win sends the next generation ('GEN 4 GO!')
  if (x.kind === 'win' && Array.isArray(REMATCH_LINES.win) && REMATCH_LINES.win.length) { const l = fillLine(pk(REMATCH_LINES.win), { gen: (meta.gen | 0) + 1 }); if (l) return l; }
  // ran out a few centimetres short: the distance itself ('0.05 CM. GO GET IT')
  // nose on the egg: never '0.01 CM'
  if (death && x.cm < NOSE_CM) { const l = pk(Array.isArray(K.REMATCH_NOSE) && K.REMATCH_NOSE.length ? K.REMATCH_NOSE : []); return l ? l + ' 💦' : 'NOSE ON IT. GO! 💦'; }
  if (death && x.cm < 0.5 && REMATCH_NEAR_CM.length) { const l = fillLine(pk(REMATCH_NEAR_CM), { cm: Math.max(0.01, x.cm).toFixed(x.cm < 1 ? 2 : 1) }); if (l) return l; }
  // beaten by under a second, or a close one with the rival named on the card: call them out ('GET STEVE! 0.4 S')
  if (x.named && by && g && (g.sec < 1 || x.close) && Array.isArray(K.REMATCH_CLOSE_FOE) && K.REMATCH_CLOSE_FOE.length) {
    const l = fillLine(pk(K.REMATCH_CLOSE_FOE), { name: first(by).toUpperCase(), sec: g.sec.toFixed(1) });
    if (l) return l;
  }
  const pr = REMATCH_PROMISE[x.kind === 'soft' ? o.reason : x.cause];
  // the first result, or nobody to come back for: a promise about what ended it ('FRUIT THIS TIME')
  if ((x.firstRes || x.byK < 0) && Array.isArray(pr) && pr.length) { const l = pk(pr); if (l) return l; }
  if (x.named && by) { const l = byFirst(REMATCH_LINES, by); if (Array.isArray(l) && l.length) return pk(l); }
  if (x.close && REMATCH_LINES.close && x.kind === 'raced') return pk(REMATCH_LINES.close);
  if (Array.isArray(pr) && pr.length) { const l = pk(pr); if (l) return l; }
  const bc = x.kind !== 'win' && K.REMATCH_BY_CAUSE ? K.REMATCH_BY_CAUSE[x.cause] : null;
  if (Array.isArray(bc) && bc.length) return pk(bc) + ' 💦';
  return pk(REMATCH_LINES.default) || 'SWIM AGAIN 💦';
}
// what the newest generation added past the habits' max: {d levels, on n habits}
function grandadGain() {
  let d = 0, n = 0;
  try {
    if (typeof C.maxLv !== 'function' || !(meta.gen >= 1)) return { d, n };
    const prev = Object.assign({}, meta, { gen: meta.gen - 1 });
    for (const id of HABIT_ORDER) {
      if (!HABITS[id] || !(HABITS[id].max > 0)) continue;
      const now = C.maxLv(meta, id), was = C.maxLv(prev, id);
      if (now > HABITS[id].max && now > was) { n++; d = Math.max(d, now - Math.max(was, HABITS[id].max)); }
    }
  } catch (e) { /* optional */ }
  return { d, n };
}
function babyCanvas(b, size) {
  const c = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px'; c.className = 'face';
  try { const g = c.getContext('2d'); g.scale(d, d); if (R.babyPortrait) R.babyPortrait(g, b, size); } catch (e) { /* the emoji stays */ }
  return c;
}
// a baby's first words follow its top mutation (K.FIRST_WORDS_BY_MUT), else the general pool
const firstWord = (b) => {
  if (!b) return '';
  const top = Array.isArray(b.top) ? b.top[0] : typeof b.top === 'string' ? b.top : null, by = K.FIRST_WORDS_BY_MUT || {};
  const w = top && Array.isArray(by[top]) ? by[top][(b.run | 0) % 2] : '';
  return w || (BABY_FIRST_WORDS.length ? BABY_FIRST_WORDS[((b.run | 0) * 7) % BABY_FIRST_WORDS.length] : '');
};
let nemAtStart = null;
// which cause a zone's own death jokes are about (the egg's only when you were drilling)
const ZONE_HAZ = { acid: 'acid', sea: 'wbc', goo: 'bonk', fork: 'wrong', rapids: 'energy', egg: 'late' };
// a title and a why line that share one of the punchline words read as the same joke twice
const ECHO_WORDS = ['gas', 'petrol', 'fumes', 'fuel', 'goo', 'tube', 'egg'];
const echoWords = (t) => { const s = String(t || '').toLowerCase(); return ECHO_WORDS.filter((w) => new RegExp('\\b' + w + 's?\\b').test(s)); };
const echoesTitle = (title, line) => { const a = echoWords(title); return !!a.length && echoWords(line).some((w) => a.includes(w)); };
// a long result title ('GUNTHER GOT THERE FIRST') shrinks until it fits the card instead of clipping off a phone
function fitResTitle() {
  const el = $('resTitle');
  if (!el) return;
  el.style.fontSize = '';
  const fit = () => {
    try {
      const w = el.clientWidth || (el.parentNode && el.parentNode.clientWidth) || 0;
      if (!w || el.scrollWidth <= w + 1) return;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 30;
      el.style.fontSize = Math.max(16, Math.floor(fs * w / el.scrollWidth)) + 'px';
    } catch (e) { /* layout not ready */ }
  };
  fit(); requestAnimationFrame(fit);
}
function showResult(o) {
  resTok++;
  mode = 'result'; hud(false); muffle(false);
  const win = o.reason === 'win', z = ZONES[clamp(o.zone | 0, 0, ZONES.length - 1)], by = byName(o), reason = o.reason;
  const g = gapInfo(o, by);
  // ONE foe for the whole screen: who took the egg, else the named rival nearest ahead, else whoever the gap names
  // soft: a quit or a crash (the tube hiccupped): no foe, no cause, no egg bar
  const soft = reason === 'quit' || reason === 'crash';
  const foe = win || soft ? null : by || o.gapBy || (g && g.name) || null;
  const byK = foe ? RIVALS.findIndex((r) => first(r.name) === first(foe)) : -1, topK = win ? topDriller() : -1;
  sfx(soft ? 'quit' : win ? 'win' : 'lose', win ? (topK >= 0 ? topK : undefined) : (byK >= 0 ? byK : undefined));
  // the waiting room's groove remembers how far this swim got
  try { if (A.menuZone) A.menuZone(race.zoneReached | 0); } catch (e) { /* optional */ }
  const prog = clamp(race.p.y / RACE_LEN, 0, 1), close = !win && !soft && prog >= 0.85;
  // a loss keeps the race loop going behind a filter, itching for the rematch (audio's rematchMusic); a win gets the menu
  try { A.menuKind = 'result'; } catch (e) { /* optional */ }
  if (!win && typeof A.rematchMusic === 'function') { setTension(0); slowmoReset(); try { A.rematchMusic(close); } catch (e) { menuMusic('result'); } }
  else { menuMusic('result'); A.intensity = 0.3; }
  // what really ended the swim (core's o.cause); reaching the egg and losing the drill is always 'late'
  const drilled = !!race.drill;
  let cause = win ? 'win' : o.cause || (reason === 'energy' && race.p.acid > 0 ? 'acid' : reason === 'energy' && bonkN >= 3 ? 'bonk' : reason);
  if (!win && drilled && !soft) cause = 'late';
  // out of GAS (or fizzed) in the egg zone itself is a death, never a lost race: no rival title, no near-miss, no DASH advice
  const eggY = ZSTART[C.EGG_I] != null ? ZSTART[C.EGG_I] : RACE_LEN * 0.9;
  const eggGas = !win && (reason === 'energy' || reason === 'acid') && race.p.y >= eggY;
  if (eggGas) cause = 'energy';
  o.uiCause = cause;
  // raced: a real lost race (the egg went to someone else, or a rival really got there first). Only then is it a photo
  // finish, a 'beat you by', a gloat about a tight one. A death is a death: title, why, tip and Dad's Pick name its cause
  const arrivedFirst = !!race.eggTaken || race.agents.some((a) => a && a.alive && a.arrived && a.boss);
  const raced = !win && !soft && !eggGas && (reason === 'late' || arrivedFirst || drilled);
  // ONE story per card: the title pool, the why pool, the caption's unit (s or cm), the first-death lesson and Dad's Pick
  // all come from this kind and nothing else ('eggGas': out of GAS or fizzed in the egg zone, a death, never a lost race)
  const kind = win ? 'win' : soft ? 'soft' : eggGas ? 'eggGas' : raced ? 'raced' : 'death';
  o.uiKind = kind;
  // a lost race is always about the egg ('late'): its lesson, its tip and Dad's Pick
  if (kind === 'raced') cause = 'late';
  o.uiCause = cause;
  // the first swims never hear "again" (nobody has failed at anything yet)
  const pk = (a) => pickLine((meta.runs | 0) <= 1 && Array.isArray(a) ? a.filter((l) => !/again/i.test(String(l))) : a);
  // headline and the why
  let tt, why = null, near = false;
  if (kind === 'win') {
    tt = "IT'S A BABY! 🍼";
    // the runner-up's voice (a photo finish under 0.5 s has its own), else their old egg line, else the win pool
    let rv = '';
    if (topK >= 0) {
      const wm0 = winMargin(o), ph = wm0 && wm0.sec < 0.5 ? byFirst(K.RIVAL_WIN_CARD_PHOTO || {}, RIVALS[topK].name) : null, wc = byFirst(K.RIVAL_WIN_CARD || {}, RIVALS[topK].name);
      rv = (Array.isArray(ph) && ph.length ? pickLine(ph) : '') || (Array.isArray(wc) && wc.length ? pickLine(wc) : '') || linesOf(RIVALS[topK].name).loseEgg || '';
    }
    why = rv || pickLine(WIN_LINES);
  }
  else if (kind === 'soft') {
    if (reason === 'crash') { tt = pk(RESULT_TITLES.crash) || 'TUBE HICCUP'; why = K.CRASH_LINE || 'The tube hiccupped. Kevin keeps the DNA.'; }
    else { tt = pk(RESULT_TITLES.quit) || 'BREAK TIME'; why = pk(DEATH_LINES.quit) || 'Kevin is taking a little break.'; if (o.counted === false) why += ' Too short to count: no daily, no rival record.'; }
  } else if (kind === 'eggGas') {
    // out of GAS at the egg: the energy titles and the egg's own GAS lines, never a near-miss by gap
    // (a nose from the egg gets the close titles: the why and the tip still say GAS)
    tt = (prog >= 0.985 ? pk(RESULT_TITLES.close) : '') || pk(RESULT_TITLES.energy) || 'OUT OF GAS';
    why = pk(DEATH_LINES.energyEgg) || pk(DEATH_LINES.energy);
  } else if (kind === 'raced') {
    if (by) { const stl = byFirst(K.STEAL_TITLES || {}, by); tt = (Array.isArray(stl) && stl.length ? pk(stl) : '') || `${first(by).toUpperCase()} GOT THERE FIRST`; why = pk(byFirst(K.RIVAL_STEAL_WHY || {}, by) || []) || linesOf(by).stealEgg || null; }
    else tt = (!drilled ? pk(RESULT_TITLES.lateRoute) : '') || ((o.zone | 0) >= 6 ? pk(RESULT_TITLES.close) || 'SO. CLOSE.' : pk(RESULT_TITLES.late) || pk(LOSE_TITLES));
    if (!why) {
      // a lost race gets a near-miss line that points at the next swim (by how far behind the winner)
      const bucket = g ? (g.sec < 0.3 ? 'hair' : g.sec < 1 ? 'tail' : g.sec < 3 ? 'length' : '') : '';
      if (bucket && NEAR_MISS_BY_GAP && Array.isArray(NEAR_MISS_BY_GAP[bucket]) && NEAR_MISS_BY_GAP[bucket].length) { why = pk(NEAR_MISS_BY_GAP[bucket]); near = true; }
      else if (o.rank <= 10 && NEAR_MISS_LINES.length) { why = pk(NEAR_MISS_LINES); near = true; }
      else why = pk((!drilled && DEATH_LINES.lateRoute) || DEATH_LINES.late);
    }
  } else {
    // a death: its cause's title and line; from swim 3 on, 40% of the time a joke about the zone it happened in
    tt = pk(RESULT_TITLES[cause]) || pk(RESULT_TITLES[reason]) || pk(LOSE_TITLES);
    // pounced on by a lunging Big Macro: its own lines
    const lunge = o.bite === 'lunge' && Array.isArray(K.DEATH_LUNGE) && K.DEATH_LUNGE.length;
    why = lunge ? pk(K.DEATH_LUNGE) : pk(DEATH_LINES[cause] || DEATH_LINES[reason] || DEATH_LINES.energy);
    const dz = DEATH_BY_ZONE[z.id];
    if (!lunge && (meta.runs | 0) >= 2 && Array.isArray(dz) && dz.length && Math.random() < 0.4) why = pk(dz) || why;
  }
  // the why never repeats the title's punchline word ('OUT OF GAS' over a line about petrol): up to 5 fresh picks from
  // the same pool, then the zone's own death joke
  if ((kind === 'death' || kind === 'eggGas') && why && echoesTitle(tt, why)) {
    const pool = o.bite === 'lunge' && Array.isArray(K.DEATH_LUNGE) ? K.DEATH_LUNGE : kind === 'eggGas' ? DEATH_LINES.energyEgg || DEATH_LINES.energy : DEATH_LINES[cause] || DEATH_LINES[reason] || DEATH_LINES.energy;
    let w = why;
    for (let i = 0; i < 5 && echoesTitle(tt, w); i++) w = pk(pool) || w;
    if (echoesTitle(tt, w)) { const dz = (DEATH_BY_ZONE[z.id] || []).filter((l) => !echoesTitle(tt, l)); w = dz.length ? pk(dz) : ''; }
    why = w;
  }
  $('resTitle').textContent = tt; $('resWhy').textContent = chadFix(why || '');
  fitResTitle();
  // a win's margin stamp: who it beat and by how much, in their colour ('PHOTO FINISH' under half a second)
  { const el = $('resMargin'), wm = kind === 'win' ? winMargin(o) : null;
    if (el) {
      if (wm) { el.innerHTML = `${esc(wm.t)}${wm.photo ? '<span class="pf">PHOTO FINISH</span>' : ''}`; el.style.setProperty('--c', wm.col); el.classList.remove('hide'); }
      else el.classList.add('hide');
    } }
  // the first death: one title, one line, the rank, the egg bar, the DNA, one tip and SWIM AGAIN (nothing else)
  const firstRes = (meta.runs | 0) <= 1;
  setC($('result'), 'first', firstRes);
  // two joke lines at most: the why and the rank line (none after a near-miss line, which already says it).
  // Never contradict the headline: rank 1 and 2 lines only ever mean a win
  // the joke line: about 40% of the time one about this very swim (when one fits), else the rank joke
  // a close loss (beaten by under 3 s) keeps its two joke lines for the why and the rival's gloat: no rank line
  const closeLoss = raced && !!foe && !!g && g.sec < 3;
  // a close raced loss reads in one glance: title, one rival voice, the rank, the egg bar with ONE gap number, +DNA
  // and the button (the ladder, the chips and the receipt fold away)
  const tight = !firstRes && raced && (closeLoss || close);
  setC($('result'), 'tight', tight); setC($('result'), 'tightUp', false);
  // (a long why line already fills the card: no stat quip under it)
  const sq = near || closeLoss || String(why || '').length > 40 ? '' : statQuip(o, win);
  $('resRankLine').textContent = near || closeLoss ? '' : sq || (!win && o.rank <= 2 ? (eggGas ? '' : pk(LOSS_RANK_LINES)) : rankLine(o.rank));
  $('resRankLbl').textContent = `${kevinLabel()} · FINAL PLACE`;
  $('resRank').textContent = '#' + fmt(TOTAL_SWIMMERS);
  $('resStats').innerHTML = `<div class="stat"><b>${(o.dist / PX_PER_CM).toFixed(1)} cm</b>swum</div><div class="stat"><b>${fmt(o.overtakes)}</b>overtakes</div><div class="stat${o.combo > prevBestCombo && prevBestCombo > 0 ? ' rec' : ''}"><b>${o.combo}</b>best combo</div><div class="stat"><b>${(o.zone | 0) + 1}/${ZONES.length}</b>zones</div>`;
  const rb = $('resBaby'); rb.innerHTML = '';
  if (o.baby) {
    const fw = firstWord(o.baby);
    rb.innerHTML = `<div class="baby"><div class="bn">${esc(o.baby.name)}</div>${fw ? `<div class="fw">First words: ${esc(fw)}</div>` : ''}<div class="tr">${esc((o.baby.traits || []).join(', '))}.</div><div class="tr" style="margin-top:6px;opacity:.7">Generation ${o.baby.gen} begins. The race gets faster.</div></div>`;
    rb.firstChild.prepend(babyCanvas(o.baby, 96));
    // the new generation's DNA multiplier (moved here from the story card)
    if (!o.baby.practice && meta.gen >= 1) {
      const gf = (x) => (typeof C.genFactor === 'function' ? C.genFactor(x) : 1 + 0.15 * x);
      rb.firstChild.insertAdjacentHTML('beforeend', `<div class="gm">DNA x${gf(meta.gen - 1).toFixed(2)} → x${gf(meta.gen).toFixed(2)}</div>`);
      // the new generation's Grandad levels: '+1 Grandad level on 5 habits'
      const gl = grandadGain();
      if (gl.n > 0) rb.firstChild.insertAdjacentHTML('beforeend', `<div class="gm gd">+${gl.d} Grandad level${gl.d === 1 ? '' : 's'} on ${gl.n} habit${gl.n === 1 ? '' : 's'}</div>`);
    }
  }
  const syn = Array.isArray(o.synergies) ? o.synergies.map((id) => SYNERGIES.find((s) => s.id === id)).filter(Boolean) : [];
  // short portrait screens hide the named list: a compact strip of icons instead
  { const ms = $('resMutStrip'); if (ms) { ms.innerHTML = Object.keys(race.muts).filter((id) => MUTATIONS[id]).map((id) => `<span title="${esc(MUTATIONS[id].name)}">${MUTATIONS[id].icon}</span>`).join('') + syn.map((sy) => `<span class="sy" title="${esc(sy.name)}">${sy.icon}</span>`).join(''); setC(ms, 'none', !ms.innerHTML || firstRes); } }
  $('resMuts').innerHTML = Object.keys(race.muts).filter((id) => MUTATIONS[id]).map((id) => `<span>${MUTATIONS[id].icon} ${esc(MUTATIONS[id].name)}${race.muts[id] > 1 ? ' x' + race.muts[id] : ''}</span>`).join('') + syn.map((s) => `<span class="sy">${s.icon} ${esc(s.name)}</span>`).join('');
  // rival ladder with lifetime win-loss, the nemesis marked, and the gap to the one who beat you
  const beat = beatenSet(o), nemNow = nemesisOf();
  const settled = nemAtStart && RIVALS.some((r, k) => first(r.name) === nemAtStart && beat.has(k));
  const fullLadder = RIVALS.map((r, k) => {
    const x = rivalRec(r.name), fn = first(r.name), nem = fn === nemNow || fn === nemAtStart, won = beat.has(k);
    const cls = [won ? 'on' : 'lost', nem ? 'nemesis' : '', settled && fn === nemAtStart ? 'beaten' : ''].join(' ').trim();
    return `<span class="${cls}" style="--c:${r.col}"><u>${won ? '✓' : '✗'}</u>${esc(fn)}<small>${x.beat | 0}-${x.lost | 0}</small>${nem && !(settled && fn === nemAtStart) ? '<em>NEMESIS</em>' : ''}</span>`;
  }).join('<i>›</i>');
  // one chip ('4/5 rivals beaten · Tiffany 0-1', tap to open the ladder); a grudge or a nemesis keeps the full ladder
  { const lad = $('resLadder'), nemOn = settled || RIVALS.some((r) => first(r.name) === nemNow || first(r.name) === nemAtStart);
    const fk = byK >= 0 ? byK : RIVALS.findIndex((r, k) => !beat.has(k)), fr = fk >= 0 ? RIVALS[fk] : null, fx = fr ? rivalRec(fr.name) : null;
    const chip = `${beat.size}/${RIVALS.length} rivals beaten${fr ? ` · <b style="color:${fr.col}">${esc(first(fr.name))}</b> ${fx.beat | 0}-${fx.lost | 0}` : ''}`;
    lad.innerHTML = nemOn ? `<div class="lfull">${fullLadder}</div>` : `<button class="lchip" aria-expanded="false">${chip} <i>▾</i></button><div class="lfull">${fullLadder}</div>`;
    setC(lad, 'open', nemOn);
    const lb = lad.querySelector('.lchip');
    if (lb) lb.onclick = () => { const on = !lad.classList.contains('open'); setC(lad, 'open', on); lb.setAttribute('aria-expanded', String(on)); sfx('tap', 0.5); }; }
  const gs = $('resGrudge');
  if (settled) {
    gs.innerHTML = `GRUDGE SETTLED<small>${esc(byFirst(RIVAL_SETTLED, nemAtStart) || linesOf(nemAtStart).beaten || '')}</small>`;
    gs.classList.remove('hide'); resLater(900, () => sfx('grudge'));
  } else if (rematch && rematch.k >= 0 && beat.has(rematch.k)) {
    // a rematch won: the REVENGE stamp (the grudge stamp's look), and the rival is a sore loser about it
    const tl = pickLine(K.REVENGE_TITLES || []) || 'REVENGE!', ln = byFirst(K.REVENGE_LINES || {}, rematch.name);
    gs.innerHTML = `${esc(tl)}${Array.isArray(ln) && ln.length ? `<small>${esc(pickLine(ln))}</small>` : ''}`;
    gs.classList.remove('hide'); resLater(900, () => sfx('grudge'));
  } else gs.classList.add('hide');
  // ONE celebration badge, in this order: the NEW RECORD stamp, the best badge (first record, daily best), the gap's NEW BEST
  const firstRec = prevBest >= TOTAL_SWIMMERS, rec = o.rank < prevBest, dailyBest = o.daily != null && !!o.dailyBest;
  // the gap to whoever beat you: no line of its own, it is the egg bar's caption (below)
  $('resGap').classList.add('hide');
  let gapNB = false, gapTxt = '';
  if (g && raced) {
    const had = S.bestGap > 0, better = !had || g.sec < S.bestGap;
    if (better) { S.bestGap = g.sec; saveUI(); }
    gapNB = had && better && !rec && !dailyBest;
    gapTxt = `${g.name ? esc(first(g.name)) : 'The winner'} beat you by <b>${g.sec.toFixed(1)} s</b>${gapNB ? '<span class="nb">NEW BEST</span>' : ''}`;
  } else if (g && g.name) gapTxt = `${esc(first(g.name))} was <b>${g.sec.toFixed(1)} s</b> ahead`;
  // the joke budget: one punchline (the rank line) and ONE rival voice: the gloat (or the thief's steal line), else the
  // SHORT_BY joke on the egg bar, else the why line
  const gw = $('resGloat');
  let gloat = '';
  const stealLine = reason === 'late' && drilled && by ? pickLine(byFirst(K.RIVAL_STEAL || {}, by) || []) : '';
  if (firstRes) gloat = '';
  else if (stealLine) gloat = stealLine;
  else if (foe && raced && (!near || closeLoss)) {
    const tight = raced && g && g.sec < 1 && K.RIVAL_GLOATS_TIGHT && K.RIVAL_GLOATS_TIGHT.length;
    gloat = tight ? `${first(foe)}: ${pk(K.RIVAL_GLOATS_TIGHT)}` : pk(byFirst(K.RIVAL_GLOATS || {}, foe) || []);
  }
  gloat = chadFix(gloat || '');
  setT(gw, gloat); setC(gw, 'hide', !gloat);
  if (gloat) gw.style.setProperty('--c', byK >= 0 ? RIVALS[byK].col : '#ff8b9b');
  // one chip row: the swim in numbers; a beaten combo record turns it gold (unless the big NEW RECORD stamp goes off)
  const comboRec = o.combo > prevBestCombo && prevBestCombo > 0 && !(rec && !firstRec);
  const chips = $('resChips');
  // (no 'COMBO x0': a combo under 2 is not a combo)
  resChipX = [];
  resChipBase = [comboRec ? `<b>NEW BEST COMBO</b> x${fmt(o.combo)}` : (o.combo | 0) >= 2 ? `COMBO x${fmt(o.combo)}` : '', `${fmt(o.overtakes)} passed`, `${(o.dist / PX_PER_CM).toFixed(1)} cm`].filter(Boolean);
  chipsDone();
  setC(chips, 'gold', comboRec);
  // nine generations: the dynasty stamp, once ever
  const dy = $('resDynasty');
  if (win && o.baby && !o.baby.practice && meta.gen >= 9 && !S.dynastySeen && DYNASTY_STAMP) {
    S.dynastySeen = true; saveUI(); dy.textContent = DYNASTY_STAMP; dy.classList.remove('hide');
    resLater(1300, () => { sfx('record'); if (R.confetti) R.confetti(); });
  } else dy.classList.add('hide');
  // the egg bar: every loss that is not a quit. Your best ever distance is a BEST tick; going further says by how much
  const eg = $('resEgg');
  placeResEgg(close);
  let shortJoke = false;
  if (!win && !soft) {
    const cm = race.remaining() / PX_PER_CM;
    const bar = eg.querySelector('i'); bar.style.transition = 'none'; bar.style.transform = `scaleX(${close && !S.reduced ? 0 : prog.toFixed(3)})`;
    if (close && !S.reduced) { void bar.offsetWidth; bar.style.transition = ''; requestAnimationFrame(() => { bar.style.transform = `scaleX(${prog.toFixed(3)})`; }); }
    const bp = clamp(+S.bestProg || 0, 0, 1), pct = Math.min(99, Math.round(prog * 100)), further = prog > bp + 0.005 && bp > 0;
    // (a swim that reached the drill is past every distance tick: no BEST tick there)
    const bt = eg.querySelector('.best'); if (bt) { bt.style.left = (bp * 100).toFixed(1) + '%'; setC(bt, 'hide', !(bp > 0.01) || further || drilled); }
    if (prog > bp) { S.bestProg = Math.round(prog * 1000) / 1000; saveUI(); }
    const sp = eg.querySelector('span'), sec = g && raced ? g.sec : 99;
    // ONE gap number: seconds for a lost race, centimetres for a death. A hair short: one of the numbered near-miss
    // jokes in that same unit (a joke in the other unit is never picked), the number in bold
    const sbk = raced ? (sec < 0.3 ? 'hair' : 'tiny') : cm < 0.15 ? 'hair' : 'tiny';
    const sbl = (K.SHORT_BY_LINES && K.SHORT_BY_LINES[sbk] || []).filter((l) => (raced ? /\{sec\}/.test(l) && !/\{cm\}/.test(l) : /\{cm\}/.test(l) && !/\{sec\}/.test(l)));
    let cap;
    // (ONE comic line per card: a rival voice already speaking keeps the caption plain)
    if ((raced ? sec < 1 : cm < 0.5 && cm >= NOSE_CM) && sbl.length && !firstRes && !gloat) { shortJoke = true; cap = fillLine(esc(pk(sbl)), raced ? { sec: `<b>${sec.toFixed(1)}</b>` } : { cm: `<b>${cm.toFixed(cm < 1 ? 2 : 1)}</b>` }); }
    else if (raced && gapTxt && !firstRes) cap = gapTxt;
    else if (raced) cap = pickLine(K.REACHED_EGG_LINES || []) || 'You made it to the egg!';
    // nose on the egg: 0.00 cm short reads like a rounding bug, so it says where he was
    else if (cm < NOSE_CM) cap = fillLine(pickLine(K.NOSE_LINES || []) || 'Nose on the egg! ({pct}% there)', { pct });
    else cap = `${cm.toFixed(cm < 1 ? 2 : 1)} cm short (${pct}% there)`;
    // (a lost drill already made it to the egg: no 'best: 99%' chip)
    const chip = further ? `<i class="far">NEW FURTHEST +${Math.max(1, Math.round((prog - bp) * 100))}%</i>` : bp > 0.01 && !(drilled && !win) ? `<i class="bst">best: ${Math.min(99, Math.round(bp * 100))}%</i>` : '';
    sp.innerHTML = cap + chip;
    eg.classList.remove('hide');
    if (close) resLater(700, () => sfx('loseClose'));
  } else eg.classList.add('hide');
  // a lost duel at the egg: why, by the biggest shortfall in the head start the swim earned (race.headParts), and that head start
  duelPostmortem(kind === 'raced' && drilled && !soft, g, foe, win && drilled);
  // one rival voice: a gloat or the egg bar's SHORT_BY joke takes the why line's place
  if (gloat || (shortJoke && raced)) $('resWhy').textContent = '';
  // ONE comic line per card, by rank: the rival voice, the SHORT_BY joke, the stat quip or rank joke, the medal's line
  const comicTaken = !!gloat || shortJoke;
  if (comicTaken) $('resRankLine').textContent = '';
  // ONE lesson line: the lost duel's post-mortem, else the first-death lesson, else the tip
  const duelOn = !$('resDuel').classList.contains('hide');
  // the receipt counts up line by line (folded from the start on a tight one)
  const lines = receipt(o);
  $('resReceipt').classList.toggle('fold', tight);
  // the tough-day and first-baby rows carry one caption line under their label (K.TOUGH_DAY_LINES, K.FIRST_WIN_LINES)
  const capOf = (l) => { const c = l.key === 'tough' ? K.TOUGH_DAY_LINES : l.key === 'first' ? K.FIRST_WIN_LINES : null; return Array.isArray(c) && c.length ? `<small class="rcap">${esc(pickLine(c))}</small>` : ''; };
  $('resReceipt').innerHTML = lines.map((l) => `<div class="${!l.mult && l.v < 0 ? 'neg' : ''}${l.key === 'first' ? ' firstBaby' : ''}"><span>${esc(l.label)}${capOf(l)}</span><b>${l.mult ? multTxt(l.v) : (l.v < 0 ? '-' : '+') + '0'}</b></div>`).join('');
  // the signature tricks found so far (meta.tricks: {id: times}), under the DNA: a row that opens the TRICK BOOK
  { const TT = C.TRICK_TEXT || K.TRICK_TEXT || {}, tot = Object.keys(TT).length, n = tricksFound().length, el = $('resTricks');
    if (el) {
      // (only when there is something in the book, or every fifth swim as a reminder)
      const on = !!tot && !firstRes && (n > 0 || (meta.runs | 0) % 5 === 0);
      if (on) el.innerHTML = `<span>📒 Tricks found</span><b>${Math.min(n, tot)}/${tot}</b><i>›</i>`;
      setC(el, 'hide', !on);
    } }
  $('resDna').textContent = '+0 DNA 🧬';
  // the first result: what the lessons paid, what DNA is for, and a warm tail (DNA was never explained mid-swim)
  { const el = $('resLessons');
    if (el) {
      // swim 1: what the lessons paid is its own row (the one DNA count includes it); DNA's meaning rides on the Spend button
      const on = firstRes && firstSwim && lessonDna > 0;
      if (on) el.innerHTML = `<span>${esc(UIC('lessons', 'Lessons learned'))}</span><b>+${fmt(lessonDna)} DNA</b>`;
      setC(el, 'hide', !on);
    } }
  // a near miss on the record (under 15% of this rank off it) pulls: '{n} places off your best', in pink
  const offBest = !rec && !firstRec && meta.best < TOTAL_SWIMMERS ? o.rank - meta.best : 0, nearRec = offBest > 0 && offBest < 0.15 * o.rank;
  $('resBest').textContent = rec ? (firstRec ? 'FIRST RECORD!' : `old best #${fmt(prevBest)}`)
    : nearRec ? (Array.isArray(K.RECORD_NEAR_LINES) && K.RECORD_NEAR_LINES.length && Math.random() < 0.4 ? fillLine(pickLine(K.RECORD_NEAR_LINES), { n: fmt(offBest) }) : `${fmt(offBest)} places off your best`)
    : `best ever #${fmt(meta.best)}`;
  if (dailyBest) $('resBest').textContent += ' · DAILY BEST!';
  $('resBest').className = 'badge hide' + (nearRec ? ' near' : '');
  $('resBounty').classList.add('hide');
  $('resRecord').classList.add('hide');
  $('shareBtn').textContent = o.daily != null ? 'Share Daily 📅' : 'Brag 📋';
  // the slim row starts at the DNA held before this swim and fills with the count-up (not the first or a tight card)
  resDnaShown = !firstRes && !tight ? Math.max(0, meta.dna - (+o.dna || 0)) : null;
  renderResUp();
  // one lesson (plain words on the very first swim, never after a close one) and the next Kevin
  // out of GAS at the egg has its own first lesson ({cm} to go); swim 1 running dry after a few dashes says what they cost
  const cmLeft = (race.remaining() / PX_PER_CM).toFixed(1);
  // right at the egg (0.0 cm to go) it says so instead of a zero distance
  // (from where Kevin really was: the zone index in o can lag behind his position)
  // (the kind picks the key: a lost race is 'late', a crash 'crash', any death with Kevin in the egg zone the egg's GAS one)
  const fdEgg = (kind === 'eggGas' || (kind === 'death' && race.p.y >= eggY)) && !!FIRST_DEATH.energyEgg;
  // a race lost on the road (a rival got in before Kevin ever drilled) has its own lesson and tip: lateRoute
  const tipKey = kind === 'raced' && !drilled ? 'lateRoute' : cause;
  const fdKey = kind === 'soft' ? reason : kind === 'raced' ? (!drilled && FIRST_DEATH.lateRoute ? 'lateRoute' : 'late') : fdEgg ? (+cmLeft < 0.1 && FIRST_DEATH.energyEggAt ? 'energyEggAt' : 'energyEgg') : cause;
  const lessonOk = kind !== 'win' && !(kind === 'soft' && reason !== 'crash');
  let big = !duelOn && lessonOk && (firstRes || (meta.runs === 1 && !close && !(g && g.sec < 3))) && FIRST_DEATH[fdKey] ? fillLine(FIRST_DEATH[fdKey], { cm: cmLeft }) : '';
  if (kind === 'death' && firstSwim && reason === 'energy' && !fdEgg && dashN >= 2 && gasBurn > 0 && K.DASH_COST_TIP) big = fillLine(K.DASH_COST_TIP, { n: dashN, g: Math.round(gasBurn) });
  // the first time a lunging Big Macro gets Kevin: what the crouch means (once a save)
  if (kind === 'death' && o.bite === 'lunge' && !S.lungeTaught && K.FIRST_DEATH_EXTRA && K.FIRST_DEATH_EXTRA.lunge) { big = K.FIRST_DEATH_EXTRA.lunge; S.lungeTaught = true; saveUI(); }
  // the big lesson IS the card's sentence: no why line competing with it
  if (big) $('resWhy').textContent = '';
  let tip = !lessonOk || duelOn ? '' : kind === 'soft' ? big || pk(TIP_BY_REASON.crash) || '' : big || pk(TIP_BY_REASON[tipKey]) || pk(TIP_BY_REASON[cause]) || pk(TIP_BY_REASON[reason]) || pk(TIPS);
  // the egg drill pumped Kevin's arms: next time drills faster
  if (!tip && !win && reason === 'late' && typeof C.eggBoostPct === 'function' && K.RESULT_HELP_LINES && K.RESULT_HELP_LINES.eggBoost) {
    try { const pc = Math.round(+C.eggBoostPct(meta) || 0); if (pc > 0) tip = fillLine(K.RESULT_HELP_LINES.eggBoost, { pct: pc }); } catch (e) { /* optional */ }
  }
  $('resTip').classList.toggle('big', !!big);
  // ONE advice block (adviceSync): Dad's Pick when it is affordable, else the MASHUP tease, else the tip
  resAdv = { tip, big: !!big, syn: !big && !firstRes && !win ? soCloseLine() : '', cause, firstRes };
  adviceSync();
  // a soft landing for the next swim (systems: race.pepPct), one line
  { const pp = Math.round(+race.pepPct || 0), el = $('resPep'); if (el) { setT(el, pp > 0 ? '🛟 ' + fillLine(UIC('pepBanked', 'Pep talk banked: +{n}% boost on your next swim'), { n: pp }) : ''); setC(el, 'hide', !(pp > 0) || firstRes); } }
  const nk = kevinNo(), kt = nk <= 3 ? KEVIN_NEXT.few : nk <= 10 ? KEVIN_NEXT.many : KEVIN_NEXT.tenPlus;
  const ms = RUN_MILESTONES.find((x) => x[0] === meta.runs);
  // the next-Kevin joke only when there is no tip to read, or once the player knows the ropes (swim 3 on)
  // 60% of the time the next Kevin learned from what got this one (K.KEVIN_NEXT_BY_CAUSE)
  const kbc = !win && !soft && K.KEVIN_NEXT_BY_CAUSE ? K.KEVIN_NEXT_BY_CAUSE[kind === 'eggGas' ? 'eggGas' : cause] : null;
  const kPool = Array.isArray(kbc) && kbc.length && Math.random() < 0.6 ? kbc : kt;
  let nx = ms ? ms[1] : win || (tip && meta.runs < 3) ? '' : fillLine(pickLine(kPool), { n: fmt(nk) });
  if (o.daily != null && DAILY_LINES.streak && streakOf() > 0) nx = (DAILY_LINES.streak[clamp(streakOf(), 1, DAILY_LINES.streak.length) - 1] || '') + (nx ? ' ' + nx : '');
  // the family saga: the first loss in each zone, and Coach Gonad's clues at their run counts, go above the next-Kevin line
  const story = [];
  // Coach Gonad's clues: the next unseen one once the swims (or the generations) have earned it, first in line;
  // none once the finale has told the whole story
  const clue = Array.isArray(K.COACH_CLUES) && !S.finaleSeen ? K.COACH_CLUES.find((x, i) => !S.clues.includes(x[0]) && ((meta.runs | 0) >= x[0] || (meta.gen | 0) >= i + 1)) : null;
  // Acts 2 and 3: a loss hears the next hint once enough swims went by since the act began (same slot as Coach's clues)
  const actClue = clue || win || soft ? null : actLossClue();
  if (clue) { S.clues.push(clue[0]); saveUI(); story.push(clue[1]); }
  else if (actClue) { S.clues.push(actClue.id); saveUI(); story.push(actClue.t); }
  // ONE saga line: a clue comes first; the zone's first-loss line waits for the next loss there when a clue took the spot
  else if (!win && !soft && o.counted !== false && K.ZONE_FIRST_LOSS && K.ZONE_FIRST_LOSS[z.id] && !S.zoneLoss.includes(z.id)) {
    S.zoneLoss.push(z.id); saveUI(); story.push(fillLine(K.ZONE_FIRST_LOSS[z.id], { n: fmt(kevinNo()) }));
  }
  // the saga wins the spot, else the next-Kevin joke
  $('resNext').textContent = (story.length ? story.slice(0, 1) : nx ? [nx] : []).join('\n');
  // the bounty rides on the rematch button; once today's daily is done, a line for tomorrow sits above it
  const goal = nextGoalLine(o.nextGoal);
  let tmr = '';
  if (o.daily != null && o.counted !== false && Array.isArray(K.TOMORROW_LINES) && K.TOMORROW_LINES.length && typeof C.dailySeed === 'function' && meta.dailyDay === C.dailySeed()) {
    const day = streakOf() + 1, n = typeof C.dailyBonusFor === 'function' ? C.dailyBonusFor(day, meta.gen) : 0;
    tmr = fillLine(K.TOMORROW_LINES[day % K.TOMORROW_LINES.length], { n: fmt(n), day });
    const nr = dailyRuleShort(C.dailySeed() + 1);
    if (nr) tmr += ' · Tomorrow: ' + nr;
  }
  setT($('resGoal'), tmr); setC($('resGoal'), 'hide', !tmr);
  // the rematch button names who you are coming back for, in their colour
  // the rival is named on this card only on a lost race (the title, the gloat, the caption): only then does the
  // rematch button call them out, wear their colour and introduce them
  const named = kind === 'raced' && !!foe && byK >= 0;
  // SWIM AGAIN on this card is a rematch against the rival it names (again(): runOpts.rematch)
  rematchK = named ? byK : -1;
  const cmLeftN = race.remaining() / PX_PER_CM;
  const ab = $('againBtn'), rl = rematchLabel(o, { by: foe, close, g: raced ? g : null, kind, cause: tipKey, named, firstRes, byK, cm: cmLeftN, pk });
  // a card that was close (a few cm short, a lost race under a second, a named rival, out of GAS at 95%+): the rematch call
  // IS the button, in the rival's colour, and the bounty steps up to a small line above it. Any other card keeps SWIM AGAIN
  // as the big word with the bounty (else the rematch call) on its small line
  const nearCard = !firstRes && (((kind === 'death' || kind === 'eggGas') && cmLeftN < 0.5) || (raced && !!g && g.sec < 1) || named || (kind === 'eggGas' && prog >= 0.95));
  const callL = nearCard && rl && !/^SWIM AGAIN/i.test(rl) ? rl : '';
  // the first result keeps a plain SWIM AGAIN, but a death a few cm short still says so on its small line
  const firstNear = firstRes && (kind === 'death' || kind === 'eggGas') && cmLeftN < 0.5 && rl && !/^SWIM AGAIN/i.test(rl) ? rl : '';
  const sl = callL ? '' : firstNear || (goal ? '🎯 ' + goal : rl && !/^SWIM AGAIN/i.test(rl) ? rl : '');
  // the next goal gets its flavour line under it (one small line more)
  const gfl = goal ? goalFlavor(o.nextGoal) : '';
  // (one small line at most on the button: the goal's flavour line stays off it)
  ab.innerHTML = callL ? `<span class="rl">${esc(callL)}</span><small>SWIM AGAIN 💦</small>` : 'SWIM AGAIN 💦' + (sl ? `<small>${esc(sl)}</small>` : '');
  ab.setAttribute('aria-label', 'Swim again' + (callL ? ': ' + callL : sl ? ': ' + sl : ''));
  setC(ab, 'call', !!callL);
  { const al = $('resAgainGoal'), t = callL && goal ? '🎯 ' + goal : '';
    if (al) { if (t && gfl) { al.innerHTML = `${esc(t)}<small class="gfl">${esc(gfl)}</small>`; al._v = null; } else setT(al, t); setC(al, 'hide', !t); } }
  dailyAttemptLine(o); chipsDone();
  factoryLine($('resFactory'));
  // the rematch names a rival Kevin never got introduced to this swim: who they are, in one small line under the button
  // a loss in Acts 1 to 3: the next chapter's first five words, a tease to win for
  { const te = $('resTease'), gn = (meta.gen | 0) + 1, nc = !win && !soft && !firstRes && gn <= 28 ? chapterFor(gn + 1) : null;
    const t = nc && nc.lines[0] ? 'NEXT CHAPTER: ' + nc.lines[0].split(/\s+/).slice(0, 5).join(' ').replace(/[.,;:!?]+$/, '') + '...' : '';
    if (te) { setT(te, t); setC(te, 'hide', !t); } }
  { const rv = $('resRival'), rr = named && !rivalIntro[byK] && RIVALS[byK] && RIVALS[byK].line ? RIVALS[byK].line : '';
    if (rv) { setT(rv, rr); setC(rv, 'hide', !rr); if (rr) rv.style.setProperty('--c', RIVALS[byK].col); } }
  medalStamp(o);
  // the medal's quip is the comic line only when nothing funnier already spoke
  { const msl = $('resMedal').querySelector('small'); if (msl && (comicTaken || !!$('resRankLine').textContent)) msl.remove(); }
  // the daily's Brag button is a quiet one unless there is something to brag about (a win, a fresh GOLD)
  // Brag is gold only when there is something to brag about; otherwise a quiet icon
  { const sh = $('shareBtn'), recs = Array.isArray(o.records) ? o.records.filter((x) => x && x.id) : [];
    const loud = kind === 'win' || (rec && !firstRec) || nearRec || medalTier(o) === 3 || o.rank <= 100 || recs.length > 0;
    setC(sh, 'alt', !loud); setC(sh, 'gold', loud); setC(sh, 'icon', !loud);
    sh.textContent = loud ? (o.daily != null ? 'Share Daily 📅' : 'Brag 📋') : '📋'; sh.setAttribute('aria-label', o.daily != null ? 'Share the daily' : 'Brag'); }
  // a daily whose next attempt pays less: SWIM AGAIN starts a normal full-pay swim, the reduced daily is a small link
  { const dl = $('dailyAgainLink'); let sc = 1;
    try { if (o.daily != null && typeof C.dailyScaleOf === 'function') { const v = +C.dailyScaleOf((o.dailyAttempt | 0) + 1); if (Number.isFinite(v)) sc = v; } } catch (e) { sc = 1; }
    againNormal = o.daily != null && sc < 1;
    if (dl) { setT(dl, againNormal ? UIC('dailyAgain', 'Daily again (x0.5)').replace(/x[\d.]+/, 'x' + (+sc.toFixed(2))) : ''); setC(dl, 'hide', !againNormal); } }
  // a streak freeze covered a missed day: say so once the card is up
  if (o.freezeUsed) resLater(1200, () => toast('❄ ' + (pickLine(K.FREEZE_USED_LINES || []) || 'A streak freeze kept your streak alive.'), 2800));
  // short phones: the lesson and the tomorrow line leave the sticky bar (it keeps just the buttons)
  { const acts = $('resActions'), short = innerHeight <= 700;
    for (const id of ['resGoal', 'resTip']) { const el = $(id); if (short) { if (el.parentNode === acts) acts.parentNode.insertBefore(el, acts); } else if (el.parentNode !== acts) acts.insertBefore(el, acts.firstChild); }
    { const tl = $('resTail'), tp = $('resTip'); if (tl && tp.nextSibling !== tl) tp.after(tl); } }

  ab.style.setProperty('--rc', named ? RIVALS[byK].col : '#ff3d6e');
  ab.classList.toggle('rival', named);
  // buttons wake up after a beat, so a panicked tap does not skip the screen
  resultReady = false; clearTimeout(resultTO); againUnqueue();
  for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn', 'resSeeAll']) { const b = $(id); b.classList.remove('ready', 'breathe'); b.classList.add('wait'); }
  $('resShopBtn').classList.toggle('prime', meta.runs === 1);
  spendLayout((meta.runs | 0) >= 1 && (meta.runs | 0) <= 3);
  badges();
  // the first death: Dad's Pick rides on the Habits button instead of its own card
  // (the spend card's subline says what DNA is for, once: TUT_DNA_EXPLAIN)
  { const sb = $('resShopBtn'), pk = firstRes ? dadPickId() : null, sp = $('result').classList.contains('spend'); let sm = sb.querySelector('.pk');
    if (pk && HABITS[pk]) { if (!sm) { sm = document.createElement('small'); sm.className = 'pk'; sb.appendChild(sm); } sm.textContent = sp ? TUT_DNA_EXPLAIN : "Dad's pick " + HABITS[pk].icon; if (sp && !S.dnaExplained) { S.dnaExplained = true; saveUI(); } }
    else if (sm) sm.remove(); }
  show('result'); $('result').scrollTop = 0; resPad(); resShownAtMs = performance.now();
  const wakeTok = resTok;
  const wake = () => {
    if (wakeTok !== resTok || mode !== 'result') return;
    // a hidden tab waits: the buttons wake (and the ready sound plays) once the card is on screen again
    if (document.hidden) { resultTO = setTimeout(wake, 300); return; }
    resultReady = true;
    // a SWIM AGAIN tap that waited out the beat: go now
    if (againQueued) { againUnqueue(); for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn', 'resSeeAll']) $(id).classList.remove('wait'); again(); return; }
    sfx('ready');
    for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn', 'resSeeAll']) { const b = $(id); b.classList.remove('wait'); void b.offsetWidth; b.classList.add('ready'); }
    // the spend card: Habits breathes gold and takes the focus; any other card: SWIM AGAIN breathes
    const spend = $('result').classList.contains('spend'), main = spend ? $('resShopBtn') : $('againBtn');
    main.classList.add('breathe');
    if (spend || $('result').classList.contains('first')) { try { main.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
  };
  // the buttons wake when the rank lands (tickResult: a.wake), never sooner than 0.6 s after the card; a backstop in case
  // the animation never runs
  resultTO = setTimeout(wake, 2500);
  const red = S.reduced, shownAt = performance.now();
  resAnim = { wake: () => { clearTimeout(resultTO); resultTO = setTimeout(wake, Math.max(0, 600 - (performance.now() - shownAt))); },
    tight, t: 0, dur: red ? 0.01 : 0.8, step: red || tight ? 0.01 : 0.16, rank: o.rank, dna: (+o.dna || 0) + (firstRes && firstSwim ? lessonDna : 0), rec, firstRec, celebrate: firstRec || dailyBest || nearRec, gapNB, done: false, tick: 0, lines, shown: -1, goalDone: o.goalDone || null,
    recs: Array.isArray(o.records) ? o.records.filter((x) => x && x.id).slice(0, 2) : [] };
  { const rc = $('resRecs'); if (rc) { rc.innerHTML = ''; rc.classList.add('hide'); } }
}
// the records ledger (over.records): a gold chip for each new record, 2 at most, 0.45 s after the rank lands
const RECORD_NAMES = { margin: 'BIGGEST WIN GAP', combo: 'BEST COMBO', winT: 'FASTEST EGG', dna: 'BEST DNA HAUL', winStreak: 'WIN STREAK', sweep: 'SWEEPS', streak: 'DAILY STREAK' };
function recordChips(a) {
  const rc = $('resRecs'); if (!rc || !a.recs || !a.recs.length) return;
  const RL = K.RECORD_LINES || {};
  rc.innerHTML = a.recs.map((x) => {
    const line = lineOr(RL[x.id], '');
    return `<div class="rchip"><b>🏆 ${esc(RECORD_NAMES[x.id] || 'NEW RECORD')}</b>${line ? `<small>${esc(line)}</small>` : ''}</div>`;
  }).join('');
  rc.classList.remove('hide');
  sfx('record'); buzz([20, 30, 20]);
}
function tickResult(dt) {
  const a = resAnim; if (!a || a.done) return;
  a.t += dt;
  const k = clamp(a.t / a.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
  // rank falls in log space so every digit gets its moment
  const r = Math.exp(Math.log(TOTAL_SWIMMERS) + (Math.log(a.rank) - Math.log(TOTAL_SWIMMERS)) * e);
  $('resRank').textContent = '#' + fmt(k >= 1 ? a.rank : r);
  a.tick -= dt; if (a.tick <= 0 && k < 1) { a.tick = 0.07; sfx('tap', k); }
  if (k >= 1 && !a.landed) {
    a.landed = true;
    if (a.wake) a.wake();
    const rr = $('resRank'); rr.classList.remove('land'); void rr.offsetWidth; rr.classList.add('land');
    // ONE record line: the big stamp for a real record, the small badge otherwise (and on the very first swim)
    if (a.rec && !a.firstRec) {
      $('resRecord').innerHTML = `NEW RECORD! 🏆${RECORD_LINES.length ? `<small>${esc(pickLine(RECORD_LINES))}</small>` : ''}`;
      $('resRecord').classList.remove('hide'); $('resBest').classList.add('hide');
      sfx('record'); buzz([30, 40, 30, 40, 90], true);
      if (R.confetti) { R.confetti(); R.confetti(); }
    } else if (a.celebrate || !a.gapNB) { $('resBest').classList.remove('hide'); $('resBest').classList.toggle('rec', !!a.rec); }
    if (a.recs && a.recs.length) setTimeout(() => { if (resAnim === a && mode === 'result') recordChips(a); }, S.reduced ? 0 : 450);
    // a bounty paid out: its stamp 0.3 s after the rank lands
    if (a.goalDone) { const gd = a.goalDone; setTimeout(() => { if (resAnim === a && mode === 'result') bountyStamp(gd, document.hidden); }, S.reduced ? 0 : 300); }
  }
  // then the receipt, one line at a time
  const rows = $('resReceipt').children, lt = a.t - a.dur, n = a.lines.length;
  const totalDur = a.step * Math.max(1, n);
  for (let i = 0; i < n; i++) {
    const li = a.lines[i], f = clamp((lt - i * a.step) / (a.step * 0.8), 0, 1), row = rows[i]; if (!row) continue;
    if (f > 0 && !row.classList.contains('on')) {
      row.classList.add('on'); sfx('tap', 0.4 + i * 0.1);
      // the first baby's jackpot row lands big: a coin burst out of the row, a bell and a long buzz
      if (li.key === 'first') firstBabyFx(row);
    }
    if (f > 0) setT(row.lastChild, li.mult ? multTxt(li.v) : (li.v < 0 ? '-' : '+') + fmt(Math.abs(li.v) * f));
  }
  const ft = clamp(lt / totalDur, 0, 1);
  if (k >= 1) $('resDna').textContent = `+${fmt(a.dna * ft)} DNA 🧬`;
  if (resSlim && resDnaShown != null) resSlimTick(meta.dna - a.dna * (1 - (k >= 1 ? ft : 0)));
  if (k >= 1 && ft >= 1) {
    a.done = true; if (!a.rec || a.firstRec) sfx('dna'); resDnaShown = null; renderResUp();
    // the receipt has been read: 0.6 s later it folds into the one +DNA line
    const rc = $('resReceipt'); setTimeout(() => { if (resAnim === a && mode === 'result') { rc.classList.add('fold'); resPad(); } }, S.reduced || a.tight ? 0 : 400);
  }
}
// the FIRST BABY BONUS row: gold coins burst from it (the renderer's collect motes, aimed at the DNA total) and confetti
function firstBabyFx(row) {
  sfx('bounty'); buzz([20, 30, 60, 30, 90]);
  try {
    const k = cv.clientWidth / VIEW_W; if (!(k > 0)) return;
    const rr = row.getBoundingClientRect(), cr = cv.getBoundingClientRect(), dn = $('resDna').getBoundingClientRect();
    const lx = (rr.left + rr.width * 0.75 - cr.left) / k, ly = (rr.top + rr.height / 2 - cr.top) / k;
    const tx = (dn.left + dn.width / 2 - cr.left) / k, ty = (dn.top + dn.height / 2 - cr.top) / k;
    // collect takes a world point: the row's screen spot turned back into world units
    const wy = R.camY != null && Number.isFinite(R.H) ? R.camY + R.H - ly : ly;
    if (typeof R.collect === 'function') R.collect(lx, wy, '#ffd75c', tx, ty, 12, () => { const d = $('resDna'); d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse'); });
    if (R.confetti) R.confetti();
  } catch (e) { /* only juice */ }
}
// the first result with Dad's pick affordable: Habits is the big full-width button ('Spend your DNA'), the rematch
// steps down to second place; any other result puts both back
let shopHome = null, resBuySwimId = null, buySwimNote = null;
function spendLayout(firstRun) {
  const sb = $('resShopBtn'), ab = $('againBtn');
  if (!shopHome) shopHome = { parent: sb.parentNode, next: sb.nextSibling };
  // until the first buy ever: Spend your DNA is the full-width primary (the lowest button), SWIM AGAIN steps up as secondary
  const dp = firstRun && !S.firstBuy ? dadPickId() : null, on = !!dp && !!HABITS[dp] && meta.dna >= habitCost(dp, lv(meta, dp));
  setC($('result'), 'spend', on);
  // the spend card: Habits stays in its row beside 🏠 and that whole row drops under SWIM AGAIN, so Spend is the lowest
  // big button and 🏠 sits beside it (never a lone 🏠 floating between two big buttons). Any other card: the row goes home
  const row = shopHome.parent;
  if (!shopHome.rowNext) shopHome.rowNext = { parent: row.parentNode, next: row.nextSibling };
  if (sb.parentNode !== row) row.insertBefore(sb, shopHome.next);
  if (on) { if (ab.nextSibling !== row) ab.parentNode.insertBefore(row, ab.nextSibling); }
  else if (row.nextSibling !== shopHome.rowNext.next) shopHome.rowNext.parent.insertBefore(row, shopHome.rowNext.next);
  setC(sb, 'wide', on); setC(ab, 'second', on);
  // runs 1 to 3: the spend button buys Dad's pick and swims with it in one tap (BUY + SWIM); 'See all habits' opens the shop
  setC($('result'), 'buySwim', on); resBuySwimId = on ? dp : null;
  { const sa = $('resSeeAll'); if (sa) setC(sa, 'hide', !on); }
  const tn = sb.firstChild; if (tn && tn.nodeType === 3) tn.nodeValue = on ? 'BUY + SWIM 💦' : 'Habits 🥦';
  setC(row, 'spendRow', on);
  sb.classList.toggle('alt', !on); sb.classList.toggle('gold', on); ab.classList.remove('alt');
}
// the bounty stamp: what it paid, what it was, and a quip
function bountyStamp(gd, quiet) {
  const el = $('resBounty'); if (!el) return;
  const dna = Math.round(+gd.dna || 0), what = nextGoalLine(Object.assign({}, gd, { dna: 0 })).replace(/^NEXT:\s*/i, ''), q = pickLine(K.BOUNTY_DONE_LINES || []) || '';
  el.innerHTML = `🎯 BOUNTY SMASHED${dna > 0 ? ` +${fmt(dna)} 🧬` : ''}${what ? `<small>${esc(what)}</small>` : ''}${q ? `<small class="q">${esc(q)}</small>` : ''}`;
  el.classList.remove('hide');
  if (!quiet) { sfx('bounty'); buzz([20, 30, 60]); }
}
// one quick upgrade right on the result screen: Dad's Pick follows what ended the swim, else the cheapest
// (core's table: C.DAD_PICKS is the one core's over.pickBridge is worked out from; the copy is only for an older core)
const DAD_PICKS = C.DAD_PICKS || { energy: ['water', 'sleep', 'berries'], acid: ['water', 'sleep', 'berries'], wbc: ['hottub', 'sleep'], late: ['broccoli', 'beatbox'],
  bonk: ['walk', 'broccoli'], wrong: ['meditate', 'broccoli'], win: ['meditate', 'hottub', 'gps', 'factory'] };
// the very first pick is never water (a bigger tank reads as 'more of the same'): the next one on the list, if any
const picksFor = (cause) => { const w = DAD_PICKS[cause] || []; if (S.firstBuy) return w; const nw = w.filter((id) => id !== 'water'); return nw.length ? nw : w; };

let resPickShown = false, resPickCause = null;
// Dad's Pick for the shop: what the last swim's ending asks for (one that can still level), the affordable one first
function dadPickId() {
  const o = lastResult; if (!o) return null;
  const cause = o.uiCause || (o.reason === 'win' ? 'win' : o.cause || o.reason), wants = picksFor(cause);
  const open = wants.filter((id) => HABITS[id] && lv(meta, id) < habMax(id));
  return open.find((id) => meta.dna >= habitCost(id, lv(meta, id))) || open[0] || null;
}
// a tap on the result card's body (not a button) skips the count-up: the rank lands and the receipt fills at once
$('result').addEventListener('pointerdown', (e) => {
  const a = resAnim; if (mode !== 'result' || !a || a.done) return;
  if (e.target && e.target.closest && e.target.closest('button,a,input,label')) return;
  a.t = Math.max(a.t, a.dur + a.step * Math.max(1, (a.lines || []).length) + 0.01);
});
let resUpNear = false;
function renderResUp() {
  const el = $('resUp'), o = lastResult || {};
  const opts = HABIT_ORDER.filter((id) => lv(meta, id) < habMax(id)).map((id) => ({ id, l: lv(meta, id), cost: habitCost(id, lv(meta, id)) })).sort((a, b) => a.cost - b.cost);
  if (!opts.length) { setC($('result'), 'tightUp', false); el.classList.add('hide'); resPickShown = false; resPickCause = null; resUpNear = false; return; }
  const cause = o.uiCause || (o.reason === 'win' ? 'win' : o.cause || o.reason), wants = picksFor(cause);
  const picks = wants.map((id) => opts.find((x) => x.id === id)).filter(Boolean);
  const dad = picks.find((x) => meta.dna >= x.cost) || picks[0] || null;
  const can = dad && meta.dna >= dad.cost ? dad : opts.find((x) => meta.dna >= x.cost), x = dad || can || opts[0], h = HABITS[x.id];
  const a = habEff(x.id, x.l), b = habEff(x.id, x.l + 1);
  const eff = a && b ? (x.l ? `${esc(a)} → ${esc(b)}` : 'Next: ' + esc(b)) : esc(h.desc);
  const dl = DAD_PICK_LINES[o.uiKind === 'eggGas' && DAD_PICK_LINES.energyEgg ? 'energyEgg' : cause] || DAD_PICK_LINES.generic || '';
  const affordable = meta.dna >= x.cost, isPick = !!(dad && x === dad);
  // a tight loss card's one row (.tightUp) drops the setup sentence: DAD'S PICK, the habit and the bridge line (.wh)
  const tightUp = $('result').classList.contains('tight') && affordable && isPick;
  const why = isPick ? `<div class="dp">DAD'S PICK${dl && !tightUp ? ' · ' + esc(dl) : ''}</div>` : '';
  const wh = isPick ? bridgeLine(o, x.id) : '';
  // a pick this swim's pay (or 25 DNA) away stays up: it is the reason to go again
  resUpNear = !affordable && x.cost - meta.dna <= Math.max(25, +o.dna || 0);
  resPickShown = !!why; resPickCause = why ? cause : null;
  el.classList.remove('hide'); el.classList.toggle('can', affordable);
  // a tight loss card keeps Dad's Pick when it can be bought right now: one 56 px row (index.html: .tightUp)
  setC($('result'), 'tightUp', tightUp);
  if (affordable) {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)}</b><small>${eff}</small>${wh}</div><button id="resBuy">BUY<small>${fmt(x.cost)} DNA</small></button>`;
    $('resBuy').onclick = () => { if (buy(x.id)) { renderResUp(); R.pop(VIEW_W / 2, race.p.y + 160, h.icon + ' ' + h.name + '!', '#7dffb0', 20); } };
  } else {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)} in ${fmt(x.cost - meta.dna)} DNA</b><small>${eff}</small>${wh}<div class="bb"><i style="transform:scaleX(${clamp(meta.dna / x.cost, 0, 1).toFixed(3)})"></i></div></div>`;
  }
  // every later card (not the first, not a tight one): the slim next-habit row while the DNA counts up, and after it
  // when the habit is still out of reach (icon, name, 'X / Y DNA', a 7 px mint bar that fills with the receipt)
  const slim = !$('result').classList.contains('first') && !$('result').classList.contains('tight') && (resDnaShown != null ? resDnaShown < x.cost : !affordable);
  setC(el, 'slim', slim);
  if (slim) {
    const dn = resDnaShown != null ? resDnaShown : meta.dna, need = Math.max(0, Math.ceil(x.cost - dn)), per = Math.max(1, +o.dna || 0), sw = Math.max(1, Math.ceil(need / per));
    const txt = resDnaShown != null ? `${fmt(dn)} / ${fmt(x.cost)} DNA` : `in ${fmt(need)} DNA: about ${sw} more swim${sw === 1 ? '' : 's'}`;
    el.classList.remove('can');
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx"><div class="sl"><b>${esc(h.name)}</b> <span>${esc(txt)}</span></div><div class="bb"><i style="transform:scaleX(${clamp(dn / x.cost, 0, 1).toFixed(3)})"></i></div></div>`;
    resSlim = { cost: x.cost, name: h.name };
  } else resSlim = null;
  adviceSync();
}
// the slim row's live DNA while the receipt counts up (null: the count-up is over, or there is no slim row)
let resDnaShown = null, resSlim = null;
function resSlimTick(dn) {
  const el = $('resUp'), s0 = resSlim; if (!s0 || !el.classList.contains('slim')) return;
  const was = resDnaShown; resDnaShown = dn;
  if (was != null && was < s0.cost && dn >= s0.cost) {
    // the count-up crossed the price: the BUY row, Habits breathes gold, CAN BUY!
    resDnaShown = null; renderResUp();
    const sb = $('resShopBtn'); sb.classList.remove('alt'); sb.classList.add('gold', 'breathe');
    try { R.pop(VIEW_W / 2, (race ? race.p.y : 0) + 160, 'CAN BUY!', '#7dffb0', 22, 1.2); } catch (e) { /* only juice */ }
    sfx('afford'); buzz([15, 25, 15]);
    return;
  }
  const sp = el.querySelector('.sl span'), bi = el.querySelector('.bb i');
  if (sp) setT(sp, `${fmt(dn)} / ${fmt(s0.cost)} DNA`);
  if (bi) setBar(bi, dn / s0.cost);
}
// short screens: Dad's Pick under the sticky buttons is docked (#result.upDock: compact, no Tricks row, one subline)
function resDock() {
  const rs = $('result'), up = $('resUp'), ra = $('resActions'); if (rs.classList.contains('hide')) return;
  setC(rs, 'upDock', false);
  if (up.classList.contains('hide')) return;
  const a = up.getBoundingClientRect(), b = ra.getBoundingClientRect();
  if (a.height && b.height && a.bottom > b.top - 4) setC(rs, 'upDock', true);
}
// what Dad's Pick would have done for the swim just lost (systems: over.pickBridge {habit, gain, unit, need, enough}):
// one line from K.WOULD_HAVE_LINES, with a gold THAT'S THE EGG tag when that habit alone would have covered the gap
const numTxt = (v) => { v = +v; return !Number.isFinite(v) ? '' : Math.abs(v - Math.round(v)) < 0.05 || Math.abs(v) >= 10 ? fmt(v) : v.toFixed(1); };
function bridgeLine(o, id) {
  let b = o && o.pickBridge;
  const W = K.WOULD_HAVE_LINES;
  // a bridge worked out for another habit than the one on the card: core works this habit's own out (C.wouldHave)
  if ((!b || (b.habit != null && b.habit !== id)) && typeof C.wouldHave === 'function') {
    try { if (!o._wh || o._wh.habit !== id) { const w = C.wouldHave(meta, o, id); o._wh = w ? { habit: id, ...w } : { habit: id, none: true }; o._whL = null; } } catch (e) { o._wh = { habit: id, none: true }; }
    b = o._wh && !o._wh.none ? o._wh : null;
  }
  if (!b || typeof b !== 'object' || !W || typeof W !== 'object') return '';
  // a bridge worked out for another habit than the one on the card says nothing about this one
  if (b.habit != null && b.habit !== id && HABITS[b.habit]) return '';
  const pool = b.enough ? W.enough : W.short;
  if (!Array.isArray(pool) || !pool.length) return '';
  const need = numTxt(b.need), gain = numTxt(b.gain);
  if (!need || !gain) return '';
  const hb = HABITS[b.habit] || HABITS[id], l = fillLine(o._whL || (o._whL = pickLine(pool)), { need, gain, unit: String(b.unit == null ? '' : b.unit), habit: hb ? hb.name : String(b.habit || '') });
  if (!l || /\{\w+\}/.test(l)) return '';
  return `<div class="wh">${esc(l)}${b.enough ? `<span class="egg">THAT'S THE EGG</span>` : ''}</div>`;
}
// ------------------------------------------------------------------ the TRICK BOOK (from the result's 'Tricks found' row)
// every signature trick: a found one with its name, its 3 chips, times landed and the hint; one still to find with
// K.TRICK_BOOK_TEXT.lockedName, its first chip and two '?' chips, the hint dimmed
function tricksFound() {
  const mt = meta.tricks;
  return Array.isArray(mt) ? mt.slice() : mt && typeof mt === 'object' ? Object.keys(mt).filter((k) => mt[k]) : [];
}
function trickTimes(id) { const mt = meta.tricks; return mt && typeof mt === 'object' && !Array.isArray(mt) ? Math.max(0, mt[id] | 0) : 0; }
function trickBook() {
  const TT = C.TRICK_TEXT || K.TRICK_TEXT || {}, BT = K.TRICK_BOOK_TEXT || {}, found = new Set(tricksFound());
  const list = (C.TRICKS && C.TRICKS.length ? C.TRICKS : Object.keys(TT).map((id) => ({ id, kinds: [] }))).filter((t) => t && TT[t.id]);
  setT($('tbH'), BT.title || 'TRICK BOOK');
  const n = list.filter((t) => found.has(t.id)).length;
  setT($('tbSub'), n ? `${n}/${list.length} found` : BT.empty || 'No tricks yet. Chain three moves and Coach writes it down.');
  const q = '<i class="q">?</i>';
  $('tbList').innerHTML = list.map((t) => {
    const x = TT[t.id], got = found.has(t.id), kinds = Array.isArray(t.kinds) ? t.kinds : [];
    const chips = got ? kinds.map((k) => chipHtml(k)).join('<b>+</b>') : (kinds.length ? chipHtml(kinds[0]) : q) + '<b>+</b>' + q + '<b>+</b>' + q;
    const nt = trickTimes(t.id), times = got && nt > 0 ? fillLine(BT.timesLabel || 'landed {n}x', { n: fmt(nt) }) : '';
    return `<div class="tb${got ? ' got' : ''}"><div class="nm">${esc(got ? x.name : BT.lockedName || '???')}${times ? `<small>${esc(times)}</small>` : ''}</div><div class="ch">${chips}</div>${x.hint ? `<div class="ht">${esc(x.hint)}</div>` : ''}</div>`;
  }).join('');
  show('trickbook'); $('trickbook').scrollTop = 0; sfx('tap', 0.5);
}
$('resTricks').onclick = () => { if (mode !== 'result') return; trickBook(); };
// RECORDS: tapping the title's stats opens the whole ledger (best place, combo, margin, fastest egg, streaks, golds,
// sweeps) and the five big names' win-loss, the nemesis marked
function recordsSheet() {
  const m = meta, dash = '-';
  const secs = (v) => (+v > 0 ? (+v).toFixed(1) + ' s' : dash), num = (v) => (+v > 0 ? fmt(+v) : dash);
  const rows = [
    ['🏁', 'Best place', m.best >= TOTAL_SWIMMERS ? dash : '#' + fmt(m.best)],
    ['🔥', 'Best combo', +m.bestCombo > 0 ? fmt(m.bestCombo) + 'x' : dash],
    ['📏', 'Best win gap', secs(m.bestMargin)],
    ['⏱', 'Fastest egg', secs(m.bestWinT)],
    ['👑', 'Longest win streak', num(m.bestWinStreak)],
    ['📅', 'Best daily streak', num(m.bestStreak)],
    ['🥇', 'Daily golds', num(m.dailyGolds)],
    ['🧹', 'Sweeps', num(m.sweeps)],
  ];
  const nem = nemesisOf();
  const riv = RIVALS.map((rv) => { const x = rivalRec(rv.name), nm = first(rv.name), isN = !!nem && nem === nm;
    return `<div class="rr${isN ? ' nem' : ''}"><i style="background:${rv.col}">${esc(nm.charAt(0))}</i><span>${esc(nm)}${isN ? ' <em>NEMESIS</em>' : ''}</span><b>W ${x.beat | 0} - L ${x.lost | 0}</b></div>`; }).join('');
  $('recList').innerHTML = rows.map(([ic, l, v]) => `<div class="rw"><span>${ic} ${esc(l)}</span><b>${esc(v)}</b></div>`).join('') + `<h3>THE BIG NAMES</h3>${riv}`;
  show('records'); $('records').scrollTop = 0; sfx('tap', 0.5);
}
$('titleStats').onclick = () => { if (mode !== 'title') return; recordsSheet(); };
$('recBack').onclick = () => { title(); };
$('tbBack').onclick = () => { if (mode === 'result') { show('result'); resPad(); } else title(); };
// the result's ONE advice block, in this order: Dad's Pick when it is affordable, else the MASHUP tease, else the tip.
// A pick that is up already says what to fix, so the tip steps aside for it on every swim. The first death keeps its lesson.
let resAdv = null;
function adviceSync() {
  const a = resAdv; if (!a || mode !== 'result') return;
  const up = $('resUp'), upOn = !up.classList.contains('hide') && !a.firstRes, can = upOn && up.classList.contains('can');
  let tip = a.tip, syn = '';
  if (a.big) { /* the first death: its one plain lesson */ }
  else if (can || (upOn && resUpNear)) tip = '';
  else if (a.syn) { syn = a.syn; tip = ''; if (upOn) up.classList.add('hide'); }
  else if (tip && upOn) up.classList.add('hide');
  if (!a.big && !up.classList.contains('hide') && resPickCause === a.cause) tip = '';
  // the slim next-habit row is on every later card: never hidden by the tip or the tease
  if (up.classList.contains('slim') && !a.firstRes) up.classList.remove('hide');
  setT($('resTip'), tip); setT($('resSyn'), syn);
  // never the saga line and the tip together: the tip wins (it is the one to act on)
  setC($('resNext'), 'hide', !!tip && !!$('resNext').textContent);
  // the first death's warm tail, under its one lesson (by Dad's pick)
  { const tl = $('resTail'); if (tl) { const dp = a.big && a.firstRes ? dadPickId() : null, t = a.big && a.firstRes ? ((K.FIRST_DEATH_TAIL_BY_PICK || {})[dp] || FIRST_DEATH_TAIL) : '';
    setT(tl, t || ''); setC(tl, 'hide', !t); } }
  resPad();
  requestAnimationFrame(resDock);
}
// the result scrolls with room at the bottom for the sticky button bar (scroll-padding: a focused or scrolled-to row is
// never left under it)
function resPad() {
  requestAnimationFrame(() => { const ra = $('resActions'), rs = $('result'); if (!ra || rs.classList.contains('hide')) return; const h = ra.offsetHeight; rs.style.scrollPaddingBottom = h ? h + 'px' : ''; });
}
// the daily's medal (systems: over.medalNew, the tier 1 bronze, 2 silver, 3 gold, or over.medal with medalNew true)
const medalTier = (o) => clamp(typeof o.medalNew === 'number' ? o.medalNew : o.medalNew ? o.medal | 0 : 0, 0, 3);
function medalStamp(o) {
  const el = $('resMedal'); if (!el) return;
  const t = o.daily != null ? medalTier(o) : 0;
  if (!t) { el.classList.add('hide'); return; }
  const l = pickLine((K.DAILY_MEDAL_LINES || {})[t] || []) || '';
  el.innerHTML = `<span class="md">${MEDAL_IC[t]}</span>${esc(['', 'BRONZE', 'SILVER', 'GOLD'][t])}${l ? `<small>${esc(l)}</small>` : ''}`;
  el.className = 'm' + t;
  resLater(1500, () => { sfx('medal', t); buzz([20, 30, 60]); });
}
// Daily #1 is the day the daily went live
const DAILY_EPOCH = Math.floor(Date.UTC(2026, 10, 1) / 86400000);
function dailyShareText(o) {
  const z = clamp(o.zone | 0, 0, 6), win = o.reason === 'win', atEgg = !win && z >= 6;
  const row = Array.from({ length: 7 }, (_, i) => (win ? (i < 6 ? '🟩' : '👶') : i < z ? '🟩' : i === z ? (atEgg ? '🥚' : '🟥') : '⬛')).join('');
  const t = medalTier(o) || (o.medal | 0), md = t ? ' · ' + MEDAL_IC[t] : '';
  const T = K.DAILY_SHARE_TAILS || {}, tail = pickLine(T[win ? 'won' : atEgg || z >= 5 ? 'egg' : 'early'] || []) || '';
  const n = Math.max(1, (o.daily | 0) - DAILY_EPOCH + 1), st = Math.max(1, o.streak | 0 || streakOf());
  return `Million To One Daily #${n} 🔥${st}\n${row}\n#${fmt(o.rank)} · combo x${fmt(o.combo | 0)}${md}${tail ? '\n' + tail : ''}`;
}
async function share() {
  const o = lastResult; if (!o) return;
  const tail = tierLine(SHARE_LINES, o.rank);
  const head = o.reason === 'win' ? 'I beat 999,999 swimmers and became a PERSON in Million To One.'
    : `I finished #${fmt(o.rank)} out of 1,000,000 swimmers in Million To One.`;
  const wm = winMargin(o), mt = wm ? wm.t + (wm.photo ? ' (photo finish!)' : '') : '';
  const fm = famName();
  const text = o.daily != null ? dailyShareText(o) + (mt ? '\n' + mt : '') : `${head}${mt ? ' ' + mt : ''}${tail ? ' ' + tail : ''} (Kevin #${kevinN}${fm ? ', the ' + fm + ' family' : ''})`;
  buzz(10);
  if (navigator.share) {
    try { await navigator.share({ title: 'Million To One', text, url: SHARE_URL }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const full = text + (o.daily != null ? '\n' : ' ') + SHARE_URL;
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(full); ok = true; } } catch (e) { /* fall through */ }
  if (!ok) {
    try { const ta = document.createElement('textarea'); ta.value = full; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { /* ignore */ }
  }
  toast(ok ? UIL('copied', 'Copied! Paste it somewhere smug.') : full);
}
let toastTO = 0;
function toast(t, ms = 2400) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove('on'), ms); }
// againNormal: the daily's next attempt pays less, so SWIM AGAIN is a normal full-pay swim (the link keeps the daily)
let againNormal = false;
// the rival the last result card named (a lost race): SWIM AGAIN is ROUND 2 against them
let rematchK = -1;
function again(daily) {
  if (!resultReady) return; resultReady = false; resAnim = null; sfx('again');
  const d = daily === true || (daily !== false && runOpts.daily && !againNormal);
  launch(d ? { daily: true } : rematchK >= 0 ? { rematch: rematchK } : {});
}
{ const dl = $('dailyAgainLink'); if (dl) dl.onclick = () => again(true); }
$('shareBtn').onclick = share;
// a SWIM AGAIN tap while the buttons still wait (the card has been up 0.45 s or more) is queued: the button squishes,
// says GET READY... and the swim starts the moment the buttons wake (wake())
let againQueued = false, resShownAtMs = 0;
function againQueue() {
  if (againQueued || resultReady || mode !== 'result' || $('result').classList.contains('hide')) return false;
  if (performance.now() - resShownAtMs < 450) return false;
  againQueued = true;
  const b = $('againBtn'); b.classList.add('queued');
  let gr = b.querySelector('small.gr'); if (!gr) { gr = document.createElement('small'); gr.className = 'gr'; b.appendChild(gr); }
  gr.textContent = 'GET READY...';
  if (!S.reduced && b.animate) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.92,0.86)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  buzz(10); sfx('tap');
  return true;
}
function againUnqueue() { againQueued = false; const b = $('againBtn'); b.classList.remove('queued'); const gr = b.querySelector('small.gr'); if (gr) gr.remove(); }
$('againBtn').onclick = () => { if (!resultReady) { againQueue(); return; } again(); };
$('resMenuBtn').onclick = () => { if (!resultReady) return; resultReady = false; resAnim = null; title(); };

// ------------------------------------------------------------------ shop, album, combo book
// a habit's perks as [{lv, perk}] (systems: C.habitPerksAt(id) -> levels or {lv, id|perk}, or C.HABIT_PERKS keyed by habit
// ([{lv, id}] or {lv: perk}) or by perk ({habit, lv})). An empty list when systems has none
function perksOf(id) {
  const out = [], push = (l, perk) => { l = +l; if (Number.isFinite(l) && l > 0) out.push({ lv: l, perk: perk == null ? '' : String(perk) }); };
  const norm = (v) => {
    if (Array.isArray(v)) for (const x of v) { if (typeof x === 'number') push(x, ''); else if (x && typeof x === 'object') push(x.lv ?? x.at ?? x.level, x.perk ?? x.id); }
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (Number.isFinite(+k)) push(k, v[k] && typeof v[k] === 'object' ? v[k].perk ?? v[k].id : v[k]); }
  };
  try {
    // content.js HABIT_PERKS is the source of truth: [{id: habit, at: level, perk}] (core.habitPerksAt(id, lv) answers a
    // different question: the perk ids already unlocked at lv)
    if (Array.isArray(K.HABIT_PERKS)) { for (const x of K.HABIT_PERKS) if (x && x.id === id) push(x.at, x.perk); }
    else if (typeof C.habitPerksAt === 'function') norm(C.habitPerksAt(id, meta));
    else if (C.HABIT_PERKS && typeof C.HABIT_PERKS === 'object') {
      const P = C.HABIT_PERKS;
      if (P[id] != null) norm(P[id]);
      else for (const k of Object.keys(P)) { const x = P[k]; if (x && typeof x === 'object' && (x.habit === id || x.id === id)) push(x.lv ?? x.at ?? x.level, x.perk || k); }
    }
  } catch (e) { return []; }
  return out.sort((a, b) => a.lv - b.lv);
}
// the levels at which a habit unlocks a perk
const habitPerkLevels = (id) => perksOf(id).map((x) => x.lv);
// 'NEXT PERK: Green Machine at Lv 3 (2 buys, 140 DNA)'
function nextPerkLine(id, l, mx) {
  const nx = perksOf(id).find((x) => x.lv > l && x.lv <= mx); if (!nx) return '';
  const T = (K.HABIT_PERK_TEXT || {})[nx.perk], nm = T && T.name ? T.name : 'a perk';
  let dna = 0; for (let i = l; i < nx.lv; i++) dna += habitCost(id, i);
  const k = nx.lv - l;
  return `NEXT PERK: ${nm} at Lv ${nx.lv} (${k} buy${k === 1 ? '' : 's'}, ${fmt(dna)} DNA)`;
}
let shopFrom = 'title';
// the row order and Dad's Pick are fixed for the whole visit (worked out when the shop opens), so a buy never moves a row
// under the next tap; each buy button also ignores a second tap within 200 ms
let shopOrder = null, shopDad = null;
const shopTapAt = {};
function shop(from) {
  if (from || !shopOrder) {
    shopFrom = from || shopFrom;
    // Dad's Pick first; then what you can afford (cheapest first), what you cannot yet, the locked ones, the maxed ones
    shopDad = dadPickId();
    const rows = HABIT_ORDER.map((id) => {
      const l = lv(meta, id), mx = habMax(id), locked = HABITS[id].max > 0 && mx === 0, maxed = !locked && l >= mx, cost = habitCost(id, l);
      return { id, locked, maxed, cost, can: !locked && !maxed && meta.dna >= cost };
    });
    const rank = (r) => (r.id === shopDad ? 0 : r.can ? 1 : !r.locked && !r.maxed ? 2 : r.locked ? 3 : 4);
    rows.sort((a, b) => rank(a) - rank(b) || a.cost - b.cost);
    shopOrder = rows.map((r) => r.id);
  }
  show('shop');
  try { A.menuKind = 'shop'; } catch (e) { /* optional */ }
  { const ss = $('shopSub'); if (ss && K.SHOP_SUB) setT(ss, K.SHOP_SUB); }
  $('dnaTop').textContent = `${fmt(meta.dna)} DNA 🧬`;
  const dad = shopDad;
  // the first visit before any purchase: Dad's pick pulses, with a caption that says what to do
  const firstShop = !S.firstBuy && !!dad && meta.dna >= habitCost(dad, lv(meta, dad));
  setT($('shopCap'), firstShop ? K.FIRST_SHOP_CAPTION || "Tap Dad's pick. It lasts forever." : ''); setC($('shopCap'), 'hide', !firstShop);
  // the first purchase ever is in: Back swims with it
  setT($('shopBack'), shopSwim ? 'SWIM WITH IT 💦' : 'Back'); setC($('shopBack'), 'swim', shopSwim);
  // SWIM WITH IT keeps a small plain Back above it
  setC($('shopBackLink'), 'hide', !shopSwim);
  factoryLine($('shopFactory'));
  // the first shop: Dad's pick is the one full row, the rest fold small (one story with the first result card)
  setC($('shopList'), 'firstShop', !S.firstBuy && !!dad);
  let gdNew = false;
  $('shopList').innerHTML = shopOrder.map((id) => {
    const l = lv(meta, id), mx = habMax(id), locked = HABITS[id].max > 0 && mx === 0, maxed = !locked && l >= mx, cost = habitCost(id, l);
    const h = HABITS[id];
    if (locked) return `<div class="hab locked"><div class="ic">${h.icon}</div><div><div class="nm">${esc(h.name)}</div><div class="lk">🔒 ${esc(fillLine(UIC('lockedGen', 'Unlocks at Generation {g}'), { g: 2 }))}</div><div class="ds">${esc(h.desc)}</div></div></div>`;
    const a = habEff(id, l), b = maxed ? null : habEff(id, l + 1);
    const ef = maxed && a ? `<div class="ef">${esc(a)} · MAXED</div>` : a && b ? `<div class="ef">${l ? esc(a) + ' → ' + esc(b) : 'Next: ' + esc(b)}</div>` : `<div class="ds">${esc(h.desc)}</div>`;
    const q = habitQuip(id), pick = id === dad ? `<div class="dp">DAD'S PICK</div>` : '';
    // the normal levels as pips, then the generations' Grandad levels as a gold group (stars, or 'GRANDAD n/m' past 5)
    const hm = h.max, gm = Math.max(0, mx - hm), gl = clamp(l - hm, 0, gm), nl = Math.min(l, hm);
    const gp = gm <= 0 ? '' : `<span class="gd">${gm > 5 ? `GRANDAD ${gl}/${gm}` : '★'.repeat(gl) + '☆'.repeat(gm - gl)}</span>`;
    // a gold marker on the pip where a perk unlocks, and what the next one costs to reach
    const pl = new Set(habitPerkLevels(id));
    const pipH = Array.from({ length: hm }, (_, i) => `<i class="${i < nl ? 'on' : ''}${pl.has(i + 1) ? ' pk' : ''}">${i < nl ? '●' : '○'}</i>`).join('');
    const np = maxed ? '' : nextPerkLine(id, l, mx);
    // a maxed habit that just got a new Grandad level: a one-time ribbon
    const rib = gm > 0 && l >= hm && gm > (S.gdSeen[id] | 0) ? `<div class="gdNew">${esc(UIC('grandadNew', 'NEW: Grandad level!'))}</div>` : '';
    if (gm !== (S.gdSeen[id] | 0) && (l >= hm || gm < (S.gdSeen[id] | 0))) { S.gdSeen[id] = gm; gdNew = true; }
    const pulse = firstShop && id === dad ? ' pulse' : '';
    return `<div class="hab${!maxed && meta.dna >= cost ? ' can' : ''}${pick ? ' pick' : ''}" data-row="${id}"><div class="ic">${h.icon}</div><div>${rib}${pick}<div class="nm">${esc(h.name)}</div>${q ? `<div class="qp">${esc(q)}</div>` : ''}${ef}<div class="pips">${pipH}${gp}</div>${np ? `<div class="np">${esc(np)}</div>` : ''}</div><button class="${pulse.trim()}" data-id="${id}" ${maxed || meta.dna < cost ? 'disabled' : ''}>${maxed ? 'MAX' : fmt(cost)}<small>${maxed ? '' : 'DNA'}</small></button></div>`;
  }).join('');
  if (gdNew) saveUI();
  // the streak freeze (C.buyFreeze): once the Daily is on the title, a row at the end of the list
  if (typeof C.buyFreeze === 'function' && revealOn('daily')) {
    const FS = K.FREEZE_SHOP || { name: 'Streak Freeze', desc: 'Miss a day, keep your streak.' }, mx = +C.STREAK_FREEZE_MAX || 2;
    const have = clamp(Math.floor(+meta.streakFreeze || 0), 0, mx);
    let cost = +C.STREAK_FREEZE_COST || 150; try { if (typeof C.streakFreezeCost === 'function') cost = +C.streakFreezeCost(meta.gen) || cost; } catch (e) { /* default */ }
    const full = have >= mx, can = !full && meta.dna >= cost;
    $('shopList').insertAdjacentHTML('beforeend', `<div class="hab frz${can ? ' can' : ''}"><div class="ic">❄</div><div><div class="nm">${esc(FS.name)}</div><div class="ds">${esc(FS.desc)}</div><div class="pips">${'<i class="on">❄</i>'.repeat(have)}${'<i>○</i>'.repeat(mx - have)}</div></div><button data-freeze="1" ${can ? '' : 'disabled'}>${full ? 'FULL' : `BUY<small>${fmt(cost)} DNA</small>`}</button></div>`);
  }
  for (const b of $('shopList').querySelectorAll('button[data-freeze]')) b.onclick = () => {
    const now = performance.now(); if (now - (shopTapAt.freeze || -1e9) < 200) return; shopTapAt.freeze = now;
    let ok = false; try { ok = !!C.buyFreeze(meta); } catch (e) { ok = false; }
    if (!ok) { buzz(6); return; }
    sfx('buy'); buzz(15); save(); toast('❄ ' + ((K.FREEZE_SHOP && K.FREEZE_SHOP.name) || 'Streak freeze') + '!'); badges(); shop();
  };
  for (const b of $('shopList').querySelectorAll('button[data-id]')) b.onclick = () => {
    const id = b.dataset.id, now = performance.now();
    if (now - (shopTapAt[id] || -1e9) < 200) return;
    shopTapAt[id] = now;
    // the rows stay where they are: only their levels, prices and buttons change
    if (buy(id)) shop();
  };
}
$('shopBtn').onclick = () => shop('title');
$('resShopBtn').onclick = () => {
  if (!resultReady) return;
  // BUY + SWIM: the same buy as the shop's, then straight into a swim with a 1.5 s banner that names what it does
  if ($('result').classList.contains('buySwim') && resBuySwimId && HABITS[resBuySwimId]) {
    const id = resBuySwimId, l0 = lv(meta, id);
    if (buy(id)) {
      S.firstBuy = true; saveUI(); shopSwim = false;
      const h = HABITS[id], b = habEff(id, l0 + 1);
      buySwimNote = { t: h.icon + ' ' + h.name.toUpperCase() + '!', c: b ? String(b) : h.desc || '' };
      resultReady = false; resAnim = null; launch(runOpts.daily ? { daily: true } : {}); return;
    }
  }
  resultReady = false; shop('result');
};
{ const sa = $('resSeeAll'); if (sa) sa.onclick = () => { if (!resultReady) return; resultReady = false; shop('result'); }; }
// back from the shop to the result: its buttons work again
$('shopBack').onclick = () => {
  // right after the first purchase ever, or a buy from a result: straight into a swim with it (a daily stays a daily)
  if (shopSwim) { const d = shopFrom === 'result' && !!runOpts.daily; shopSwim = false; resAnim = null; resultReady = false; launch(d ? { daily: true } : {}); return; }
  if (shopFrom === 'result' && mode === 'result') { try { A.menuKind = 'result'; } catch (e) { /* optional */ } show('result'); renderResUp(); adviceSync(); badges(); factoryLine($('resFactory')); resultReady = true; } else title(); };
$('shopBackLink').onclick = () => { shopSwim = false; $('shopBack').click(); };
let albumTab = 'babies';
// a generation's chapter as the story played it (Acts 1 to 4), for the album's Story tab and the loss teaser: {title, lines}
// or null. g is the story's generation number (the hero is generation 1)
function chapterFor(g) {
  const bs = (meta.babies || []).filter((x) => x && !x.practice);
  const v = { heir: (bs[g - 2] && bs[g - 2].name) || heirName() || 'Kevin', grandad: (bs[g - 3] && bs[g - 3].name) || 'Dad', gen: g, beat: nemesisOf() || 'Chad', margin: 'a whisker', kevin: 'Kevin' };
  const fl = (a) => (Array.isArray(a) ? a.filter(Boolean).map((l) => fillLine(String(l), v)) : []);
  const clue = (tbl) => { const c = Array.isArray(tbl) ? tbl.find((x) => Array.isArray(x) && x[0] === g) : null; return c ? [fillLine(String(c[1]), v)] : []; };
  let lines = [], title = 'Generation ' + g;
  if (g >= 2 && g <= 9) lines = fl(GEN_INTROS[g - 2]);
  else if (g === 10) { lines = fl(K.GEN10_INTRO); title = 'Act 2: Generation 10'; }
  else if (g >= 11 && g <= 18) lines = fl((K.ACT2_CHAPTERS || [])[g - 11]).concat(clue(K.ACT2_CLUES));
  else if (g === 19) { lines = S.act2Seen ? fl(K.ACT2_FINALE) : []; title = 'Act 2 finale'; }
  else if (g === 20) { lines = fl(K.GEN20_INTRO); title = 'Act 3: Generation 20'; }
  else if (g >= 21 && g <= 28) lines = fl((K.ACT3_CHAPTERS || [])[g - 21]).concat(clue(K.ACT3_CLUES));
  else if (g === 29) { lines = S.act3Seen ? fl(K.ACT3_FINALE) : []; title = 'Act 3 finale'; }
  else if (g === 30) { lines = fl(K.GEN30_EPILOGUE).concat(fl(K.GEN30_INTRO)); title = 'Act 4: Generation 30'; }
  else if (g >= 31 && g <= 38) lines = fl((K.ACT4_CHAPTERS || [])[g - 31]).concat(clue(K.ACT4_CLUES));
  else if (g === 39) { lines = S.act4Seen ? fl(K.ACT4_FINALE) : []; title = 'Act 4 finale'; }
  return lines.length ? { title, lines } : null;
}
// the Story tab: every chapter already played, oldest first, each with a replay; then the next one, locked
function storyCards() {
  const gn = (meta.gen | 0) + 1, out = [];
  // Coach's clues as they were heard (S.clues holds the swim counts)
  const cl = Array.isArray(K.COACH_CLUES) ? K.COACH_CLUES.filter((x) => Array.isArray(x) && (S.clues || []).includes(x[0])) : [];
  for (const [n, l] of cl) out.push({ title: `Coach's clue, swim #${fmt(n)}`, lines: [String(l)], small: true });
  for (let g = 2; g <= Math.min(gn, 39); g++) {
    const c = chapterFor(g); if (c) out.push(c);
    // the first finale, after generation 9
    if (g === 9 && S.finaleSeen && FINALE_LINES.length) out.push({ title: 'Act 1 finale', lines: FINALE_LINES.slice() });
  }
  return out;
}
function album(tab) {
  albumTab = tab || albumTab; show('album');
  const seen = meta.synergiesSeen || [], tot = SYNERGIES.length;
  $('tabBabies').classList.toggle('on', albumTab === 'babies'); $('tabCombos').classList.toggle('on', albumTab === 'combos');
  { const ts = $('tabStory'); if (ts) ts.classList.toggle('on', albumTab === 'story'); }
  if (albumTab === 'story') {
    $('albumH').textContent = 'The Story So Far';
    const cards = storyCards(), gn = (meta.gen | 0) + 1, nx = gn + 1;
    $('albumSub').textContent = cards.length ? `${cards.length} chapter${cards.length === 1 ? '' : 's'} so far` : 'The story starts when Kevin wins.';
    $('albumList').innerHTML = cards.map((c, i) => `<div class="cx st${c.small ? ' clue' : ''}"><div class="ic">${c.small ? '🕵️' : '📖'}</div><div><div class="nm">${esc(c.title)}</div><div class="ds">${esc(c.lines[0])}</div></div><button class="rp" data-i="${i}" aria-label="Replay ${esc(c.title)}">▶</button></div>`).join('')
      + `<div class="cx st locked"><div class="ic">🔒</div><div><div class="nm">Chapter ${nx}: ???</div><div class="ds">Win generation ${nx - 1} to read it</div></div></div>`;
    for (const b of $('albumList').querySelectorAll('button.rp')) b.onclick = () => { const c = cards[+b.dataset.i]; if (c) { sfx('tap', 0.5); intro(() => { mode = 'title'; album('story'); }, chapter(c.lines)); } };
    $('album').scrollTop = 0;
    return;
  }
  $('tabCombos').textContent = `Mashups ${seen.length}/${tot}`;
  if (albumTab === 'babies') {
    { const fm = famName(), ng = (meta.gen | 0) + 1; $('albumH').textContent = fm ? `The ${fm} Family Tree, ${ng} generation${ng === 1 ? '' : 's'}` : 'Baby Album'; }
    $('albumSub').textContent = 'Every win becomes a person. Every person grows up and becomes the next dad.';
    // the family tree, oldest at the top, and a dashed slot for whoever comes next
    const bs = meta.babies;
    // the 'child of' chain follows real babies only (a practice baby has no children of its own)
    const parentOf = (i) => { for (let j = i - 1; j >= 0; j--) if (bs[j] && !bs[j].practice) return bs[j].name; return 'Dad'; };
    const node = (b, i) => { const fw = firstWord(b); return `<div class="node"><i class="slot" data-i="${i}"></i><div class="nd"><div class="bn">${esc(b.name)}</div><div class="of">child of ${esc(parentOf(i))}</div>${fw ? `<div class="fw">First words: ${esc(fw)}</div>` : ''}<div class="tr">${esc((b.traits || []).join(', '))}.</div><div class="tr dim">Generation ${b.gen} · swim #${b.run}</div></div></div>`; };
    const nextOf = parentOf(bs.length);
    $('albumList').innerHTML = `<div class="tree">${bs.map(node).join('')}<div class="node next"><i class="q">?</i><div class="nd"><div class="bn">???</div><div class="of">child of ${esc(nextOf)}</div><div class="tr">${bs.length ? 'Win again to meet them.' : esc(S.act2Seen && K.ALBUM_EMPTY_AFTER_ACT2 ? K.ALBUM_EMPTY_AFTER_ACT2 : 'No babies yet. Win a race to make one. The current record holder is Chad Thundertail, who has never won.')}</div></div></div></div>`;
    for (const sl of $('albumList').querySelectorAll('.slot')) sl.replaceWith(babyCanvas(bs[+sl.dataset.i], 64));
  } else {
    $('albumH').textContent = CODEX_LINES.header || 'The Mashup Book';
    $('albumSub').textContent = fillLine(!seen.length ? CODEX_LINES.none || 'Mix mutations to discover combos.' : seen.length >= tot ? CODEX_LINES.all || 'All found!' : CODEX_LINES.half || '{n} of {total} found.', { n: seen.length, total: tot });
    $('albumList').innerHTML = SYNERGIES.map((s) => {
      const got = seen.includes(s.id), nd = s.needs.map((n) => MUTATIONS[n] ? MUTATIONS[n].icon + ' ' + esc(MUTATIONS[n].name) : esc(n)).join(' + ');
      return got ? `<div class="cx got"><div class="ic">${s.icon}</div><div><div class="nm">${esc(s.name)}</div><div class="ds">${esc(s.desc)}</div><div class="nd">${nd}</div></div></div>`
        : `<div class="cx"><div class="ic">❓</div><div><div class="nm">???</div><div class="ds">${esc(SYNERGY_HINTS[s.id] || 'Mix two mutations to find out.')}</div></div></div>`;
    }).join('');
  }
  $('album').scrollTop = 0;
}
$('albumBtn').onclick = () => album('babies');
$('tabBabies').onclick = () => album('babies');
$('tabCombos').onclick = () => album('combos');
{ const ts = $('tabStory'); if (ts) ts.onclick = () => album('story'); }
$('albumBack').onclick = () => title();
$('playBtn').onclick = () => { if (!meta.introSeen) intro(() => start({ countdown: true })); else launch(); };
$('dailyBtn').onclick = () => launch({ daily: true });
$('muteChk').onchange = (e) => { meta.muted = e.target.checked; applyAudio(); save(); syncMute(); };
$('autoChk').onchange = (e) => { meta.autopilot = e.target.checked; save(); };

// ------------------------------------------------------------------ HUD (cached writes: only touch the DOM when a value changes)
const setT = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
const setC = (el, c, on) => { const k = '_c' + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } };
const setBar = (el, f) => { const v = Math.round(clamp(f, 0, 1) * 400) / 400; if (el._s !== v) { el._s = v; el.style.transform = `scaleX(${v})`; } };
const setLeft = (el, pct) => { const v = Math.round(pct * 10) / 10; if (el._l !== v) { el._l = v; el.style.left = v + '%'; } };
const ticks = ZSTART.slice(1).map((y) => `<div class="tick" style="left:${y / RACE_LEN * 100}%"></div>`).join('');
$('prog').insertAdjacentHTML('afterbegin', ticks + RIVALS.map((r, k) => `<div class="rv${k % 2 ? ' lo' : ''}" id="rv${k}" style="--rc:${r.col}"><i class="dot" style="background:${r.col}">${esc(first(r.name).charAt(0))}</i><span class="tag" style="color:${r.col}">${esc(first(r.name))}</span></div>`).join(''));
const H = {
  rank: $('rank'), tick: $('rankTick'), alive: $('alive'), cm: $('cm'), distW: $('dist'), zone: $('zoneName'), fill: $('progFill'), me: $('me'),
  efill: $('efill'), ebar: $('ebar'), shields: $('shields'), combo: $('combo'), cn: $('combo').querySelector('.n'), cw: $('combo').querySelector('.w'),
  cbar: $('combo').querySelector('.bar i'), cbarW: $('combo').querySelector('.bar'), cft: $('combo').querySelector('.ft'),
  ctag: $('combo').querySelector('.tag'), cin: $('combo').querySelector('.in'), potRow: $('combo').querySelector('.potRow'), dash: $('dashBtn'), dashL: $('dashBtn').querySelector('.dl'), muts: $('mutRow'), elow: $('elow'),
  pot: $('combo').querySelector('.pot'), gap: $('combo').querySelector('.gap'), links: $('combo').querySelector('.links'), cash: $('cashBtn'), pips: $('combo').querySelector('.pips'), pipI: [...$('combo').querySelectorAll('.pips i')], pace: $('pace'),

  cashV: $('cashBtn').querySelector('.cv'), cashT: $('cashBtn').querySelector('.mt'),
  rv: RIVALS.map((r, k) => $('rv' + k)),
  head: $('headRow'), headV: $('headRow').querySelector('b'), headI: $('headRow').querySelector('.hb i'),
};
let tickHeld = false, rankPunchN = 0;
// the rank number punches (1, 1.18, 1 over 220 ms) with a green flash
function rankPunch() {
  if (S.reduced || !H.rank.animate) return;
  try { H.rank.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', color: '#7dffb0', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' }); } catch (e) { /* old browser */ }
}
let tickSum = 0, tickT = 0, histT = 0, rankHist = [], jumpT = 0, lastCombo = 0, comboFlash = 0, mutSig = '', msIdx = 0, rvState = [], lastShout = 0, tagT = 0, heartAcc = 0, lastZone = -1;
let quip = { zi: -1, done: 0 }, lastQuip = ''; const usedQuips = new Set();
const MILESTONES = [[100000, 'TOP 100,000!'], [10000, 'TOP 10,000!'], [1000, 'TOP 1,000!'], [100, 'TOP 100!'], [10, 'TOP 10!'], [1, 'IN THE LEAD!']];
const COMBO_TIERS = [3, 10, 20, 30, 45, 60, 100, 150];
// the combo pot: what cashing in would pay right now, rolling upward; a smashed pot strikes through for 0.3 s
let potV = 0, potBrokeT = 0, comboLadder = 0;
// a touch screen talks about swipes from the very first card; a keyboard (no touch seen) gets the key names
let touchUsed = (() => { try { return matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints | 0) > 0; } catch (e) { return false; } })();
// every multiplier reads with one decimal: x2.0, x1.7
const multTxt = (m) => 'x' + (Math.round(m * 10) / 10).toFixed(1);
// links landed this frame (the 'combo' events): one merged counter punch for all of them
let comboLinkN = 0, punchTilt = 1;
// the counter punch scales with the tier ct: 1.18 + 0.06 ct (one merged punch for several links, 1.6x at most) over
// 140 + 15 ct ms, tilting the other way each time by 2 + ct degrees; crossing a COMBO_TIERS step also flashes it bright.
// Reduced motion keeps only the colour flash
function comboPunch(ct, crossed) {
  const el = H.cn; if (!el || !el.animate) return;
  const n = Math.max(1, comboLinkN);
  try {
    if (S.reduced) { if (crossed) el.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 220, easing: 'ease-out' }); return; }
    const sc = Math.min(1.6, 1.18 + 0.06 * ct + 0.05 * (n - 1)), dur = 140 + 15 * ct, tilt = punchTilt * (2 + ct); punchTilt = -punchTilt;
    const k0 = { transform: `scale(${sc.toFixed(3)}) rotate(${tilt}deg)` }, k1 = { transform: 'scale(1) rotate(0deg)' };
    if (crossed) { k0.filter = 'brightness(2.2)'; k1.filter = 'brightness(1)'; }
    el.animate([k0, k1], { duration: dur, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  } catch (e) { /* old browser */ }
}
// the CASH pill: the real multiplier a cash-in pays now, M = style x clutch x tricks x finisher x disco (the same terms
// core's bankDna and payBank use). A term that rises punches the pill (1, 1.5, 1 over 180 ms) and names itself under it
// (K.MULT_TERM_LABELS) for 0.8 s. Pink from x5, gold rainbow from x10. It pulses (.cashHot) only when the timer bar is in
// its last 35% or the pot just crossed a grade
function cashPill(p, fm, discoK, f) {
  const cb = H.combo, el = H.cash;
  const terms = { style: typeof C.styleMult === 'function' ? C.styleMult(p.style) : 1, clutch: 1 + clamp(+p.clutch || 0, 0, 0.5),
    tricks: 1 + Math.min(Math.max(0, +p.trickMult || 0), 1), finisher: fm, disco: 1 + Math.max(0, discoK) };
  let M = 1; for (const k in terms) M *= Number.isFinite(terms[k]) ? terms[k] : 1;
  setT(H.cashV, 'CASH ' + multTxt(M));
  setC(el, 'm5', M >= 5 && M < 10); setC(el, 'm10', M >= 10);
  const prev = cb._mt; let rose = '';
  if (prev) for (const k in terms) if (terms[k] > (prev[k] || 0) + 0.001) { rose = k; break; }
  cb._mt = terms;
  if (rose) {
    const L = K.MULT_TERM_LABELS || {}; setT(H.cashT, L[rose] || '+' + rose.toUpperCase()); setC(H.cashT, 'on', true); cb._mtUntil = clock + 0.8;
    if (!S.reduced && H.cashV.animate) { try { H.cashV.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }); } catch (e) { /* old browser */ } }
  } else if (cb._mtUntil && clock >= cb._mtUntil) { cb._mtUntil = 0; setC(H.cashT, 'on', false); }
  // the pot crossed a bank grade: hot for 1 s
  const g = typeof C.bankGrade === 'function' ? C.bankGrade(p.bank) : 0;
  if (cb._cg != null && g > cb._cg) cb._cgAt = clock;
  cb._cg = g;
  setC(el, 'cashHot', f < 0.35 || clock - (cb._cgAt || -9) < 1);
}
const finMult = (style) => (typeof C.finisherMult === 'function' ? C.finisherMult(style) : style >= 5 ? 2 : style >= 4 ? 1.6 : 1.3);
function potBreak() {
  if (potV <= 0 || !race) return false;
  potBrokeT = 0.3; setC(H.pot, 'broke', true);
  // the very first smash of a save explains itself once (K.BREAK_POT_FIRST); later smashes keep the joke pool
  const first = (typeof C.potBreak === 'function' ? C.potBreak(potV, S.potSeen, race.demo) === 'first' : !S.potSeen && !race.demo) && !!K.BREAK_POT_FIRST;
  R.pop(race.p.x, race.p.y + 100, (first ? K.BREAK_POT_FIRST : pickLine(BREAK_POT_LINES)) || 'POT GONE', '#ff5c7a', 18, first ? 1.8 : 1.1);
  if (first) { S.potSeen = true; saveUI(); }
  return true;
}
// CASH fires on release after a short, still press (under 300 ms, under 12 px); a press that moves is steering, so the
// pointer is handed to the drag from where it went down
let cashPress = null;
const CB = $('cashBtn');
CB.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); unlock();
  if (playBlocked()) return;
  dropPhantom(e);
  const now = performance.now();
  // the steering thumb landing back on the chip (within 250 ms and 60 px of where it lifted) re-grips: it steers, it
  // never cashes. A press while another finger is down is a palm or a resting thumb: ignored
  if (drag || [...fingers.values()].some((f) => !f.rest)) return;
  if (now - lastSteerUpAt < 250 && Math.hypot(e.clientX - lastSteerUpX, e.clientY - lastSteerUpY) < 60) {
    if (race.drill) return;
    drag = newDrag(e.pointerId, e.clientX, e.clientY, now, { flick: true, dashed: true, startBtn: true }, gripOff(holdOff));
    fingerAdd(e, false); holdOff = null;
    try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
    steerTick();
    return;
  }
  cashPress = { id: e.pointerId, t0: now, x0: e.clientX, y0: e.clientY };
  try { CB.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
});
CB.addEventListener('pointermove', (e) => {
  const c = cashPress; if (!c || e.pointerId !== c.id) return;
  if (Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < 12) return;
  cashPress = null;
  if (drag || playBlocked() || race.drill) return;
  drag = newDrag(c.id, c.x0, c.y0, c.t0, { flick: true, dashed: true, startBtn: true });
  fingerAdd(e, false); holdOff = null;
  try { APP.setPointerCapture(c.id); } catch (err) { /* old browser */ }
});
CB.addEventListener('pointerup', (e) => {
  const c = cashPress; if (!c || e.pointerId !== c.id) return;
  cashPress = null;
  if (performance.now() - c.t0 < 300 && Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < 12) cashOut('btn');
});
CB.addEventListener('pointercancel', () => { cashPress = null; });
// 3 significant digits for the +places ticker: 845, 1.23k, 12.3k, 123k, 1.2M
function sig3(n) { n = Math.round(n); if (n < 1000) return String(n); const k = n / 1000; return k < 999.5 ? Number(k.toPrecision(3)) + 'k' : Number((n / 1e6).toPrecision(3)) + 'M'; }
function resetHud() {
  lastZone = -1; tickHeld = false; rankPunchN = 0; tickSum = 0; tickT = 0; histT = 0; rankHist = [race.rank]; jumpT = 0; lastCombo = 0; comboFlash = 0; mutSig = ''; msIdx = 0; tagT = 0;
  while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) msIdx++;
  rvState = RIVALS.map(() => ({ ahead: true, alive: true }));
  H.tick.classList.remove('on'); H.tick._last = null; H.tick._con = false; H.muts.innerHTML = '';
  for (const el of H.rv) { el.classList.remove('dead', 'behind', 'hit', 'taunt'); el._cdead = el._cbehind = false; }
  H.rank.parentNode.classList.remove('jump'); H.rank._cjump = false; H.ctag.classList.remove('on'); setC(H.cw, 'tagged', false); H.combo._sw = null;
  measureBar(); document.body.classList.remove('bright');
  coClear(); coachClear(); $('hint').style.opacity = 0; hudSlowT = 0;
  duelShow(false);
  potV = 0; potBrokeT = 0; comboLadder = 0; setC(H.pot, 'broke', false); setC(H.pot, 'hide', true); setC(H.cash, 'hide', true);
  H.shields._n = -1; H.shields._w = -1; DU.cd._k = null; DU.cd._s = null; H.rank._n = null; H.alive._n = null; ftShow = null;
  setC(H.pace, 'hide', true); setC(H.gap, 'hide', true); linkLog = []; linkAt = -99; linkSig = ''; if (H.links) { H.links.innerHTML = ''; setC(H.links, 'hide', true); } H.pot._fm = null; H.pot._tm = null; H.pot._pk = null; H.combo._mr = 0; H.combo._mrAt = -9; H.tick._res = null; H.pips._n = -1; setC(H.pips, 'lock', false); DU.ui._k = null;
  for (const el of H.rv) el._hotUntil = -99;
}
// the progress bar's rival dots: dots within 12 px merge into one count dot (the one furthest on shows how many), a dot
// within 16 px of #me steps aside (.clr), the rivals behind dim (.behind, in the CSS). Dead rivals keep their own grey dot
function rivalDots(mePx) {
  const xs = [];
  for (let k = 0; k < RIVALS.length; k++) { const a = race.agents[k], el = H.rv[k]; if (!a || !a.alive || el._x == null) { if (el) { setC(el, 'mg', false); setC(el, 'clr', false); } continue; } xs.push([el._x, k]); }
  xs.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < xs.length;) {
    let j = i; while (j + 1 < xs.length && xs[j + 1][0] - xs[i][0] < 12) j++;
    const n = j - i + 1, lead = xs[j][1];
    for (let q = i; q <= j; q++) {
      const [x, k] = xs[q], el = H.rv[k], dot = el._dot || (el._dot = el.querySelector('.dot'));
      const cnt = k === lead ? n : 0, txt = cnt > 1 ? String(cnt) : first(RIVALS[k].name).charAt(0);
      setC(el, 'mg', cnt === 0); setC(el, 'grp', cnt > 1); setC(el, 'clr', Math.abs(x - mePx) < 16);
      if (dot._t !== txt) { dot._t = txt; dot.textContent = txt; }
    }
    i = j + 1;
  }
}
function bossPassed(k) {
  const el = H.rv[k]; if (!el) return;
  el._hotUntil = clock + 1.5;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}
function comboTag(t) { setT(H.ctag, t); H.ctag.classList.add('on'); setC(H.cw, 'tagged', true); tagT = 1.3; }
const TIER_SCALE = [1, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35];
let intenseAt = -99;
let comboIntroNow = false, comboSeenAt = -1, comboIntroDone = false, mutShowT = 0, threatOnB = false, intenseOn = false, dnaHudV = -1, cdV = -1;
// DASH: a conic cooldown sweep (--cd 0..1, written on 0.02 steps), a pop and a buzz when it is ready, a thin red tick when
// the tank cannot pay for a dash
function dashTick(p) {
  const b = H.dash, full = race.s && race.s.dashCd > 0 ? race.s.dashCd : 1;
  const v = race.drill ? 1 : clamp(1 - (p.dashCd || 0) / full, 0, 1);
  if (Math.abs(v - cdV) >= 0.02 || (v === 1 && cdV !== 1)) {
    const was = cdV; cdV = v; b.style.setProperty('--cd', v.toFixed(2));
    if (v === 1 && was >= 0 && was < 1 && !race.drill) { b.classList.remove('rdy'); void b.offsetWidth; b.classList.add('rdy'); buzz(12); }
  }
  setC(b, 'lowE', !race.drill && lowForDash());
  // the cooldown just ran out in a live swim: a soft 'ready' blip, or the low-gas heartbeat when the tank cannot pay (1.5 s apart)
  { const cd = +p.dashCd || 0;
    if (dashCdPrev > 0 && cd <= 0 && !race.drill && !race.over && !race.pending && countT <= 0 && clock - dashReadyAt >= 1.5) {
      dashReadyAt = clock;
      const dc = race.s && race.s.dashCost > 0 ? race.s.dashCost : 0;
      if (p.e > dc || (race.muts && race.muts.nitro)) sfx('dashReady'); else sfx('lowE', 0);
    }
    dashCdPrev = cd; }
  // the first swims: the tank is close to empty for a dash (2.5 dashes left or fewer): LOW GAS on the button, once a
  // swim Coach says why and the fruit gets a ring
  const cost = race.s && race.s.dashCost > 0 ? race.s.dashCost : 0;
  const lg = (meta.runs | 0) < 3 && !race.drill && cost > 0 && p.e < 2.5 * cost && !(race.muts && race.muts.nitro);
  setC(b, 'lowGas', lg);
  if (lg && !lowGasSaid && countT <= 0 && !race.pending && !race.over) {
    lowGasSaid = true;
    if (coach(pickLine(K.DASH_LOW_GAS) || 'Easy on the DASH! Eat fruit.', 2.6, 2)) lowGasRingT = 3;
  }
}
let lowGasSaid = false, lowGasRingT = 0, dashCdPrev = 0, dashReadyAt = -99;
// a dash's price: a '-N' chip flies up off the GAS bar where the tank ends
function gasChip(n) {
  const el = $('gasChip'), eb = H.ebar; if (!el || !eb || !race) return;
  const f = clamp(race.p.e / (race.p.maxE || 100), 0, 1);
  el.textContent = '-' + n;
  el.style.left = (eb.offsetLeft + eb.offsetWidth * f).toFixed(1) + 'px';
  el.classList.remove('hide');
  if (S.reduced || !el.animate) { clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hide'), 700); return; }
  try { if (el._a) el._a.cancel(); } catch (e) { /* ignore */ }
  el._a = el.animate([{ transform: 'translate(-50%,0) scale(1.2)', opacity: 1 }, { transform: 'translate(-50%,-26px) scale(1)', opacity: 0 }], { duration: 700, easing: 'ease-out' });
  el._a.onfinish = () => el.classList.add('hide');
}
// the threat lane and the intense HUD (body classes, so the CSS moves banners and trims the HUD)
function laneTick(p) {
  const hd = race.over || race.pending ? Infinity : hostileDy(700), th = hd <= 700;
  if (th !== threatOnB) {
    threatOnB = th; setC(document.body, 'threat', th);
    // a banner already up moves under the HUD with the threat (below its chevrons): the renderer gets its new band
    if (th && bannerUp() && !$('banner').classList.contains('low')) { $('banner').classList.add('top'); setC($('banner'), 'clr', !eggOn); bannerMeasure(); }
  }
  // (opacity only: the HUD keeps its height, --hudB holds still)
  // it stays on at least 1.5 s after the last trigger, so the HUD never flickers between busy and calm
  const trig = !race.over && (p.combo >= 10 || p.frenzyT > 0 || hd <= 600);
  if (trig) intenseAt = clock;
  const it = !race.over && (trig || (intenseOn && clock - intenseAt < 1.5));
  if (it !== intenseOn) { intenseOn = it; setC(document.body, 'intense', it); }
}
// this swim's DNA so far, in the HUD: where banked helices fly to (R.bankTarget), popping as each one lands
function dnaHudTick() {
  const el = $('dnaHud'), v = Math.floor(race.dnaRun || 0);
  if (v !== dnaHudV) { const was = el.classList.contains('hide'); dnaHudV = v; setT(el, '🧬 ' + fmt(v)); setC(el, 'hide', v <= 0); if (was && v > 0) requestAnimationFrame(measureBankTarget); }
}
let hudSlowT = 0, barW = 0;
// the progress bar's pixel width, cached (rival dots move with transforms, never with left)
function measureBar() { barW = $('prog').clientWidth || barW; }
const setX = (el, px) => { const v = Math.round(px * 2) / 2; if (el._x !== v) { el._x = v; el.style.transform = `translate3d(${v}px,0,0)`; } };
// the +places ticker (or a milestone label) reaches down into the rival tags' top row: that much of row 0 is taken
function rankReserve() {
  const ms = coCur && coCur.kind === 'milestone';
  if (!ms && !H.tick.classList.contains('on')) return 0;
  if (H.tick._res == null) {
    const el = ms ? $('rankLbl') : H.tick, r = el.getBoundingClientRect(), pr = $('prog').getBoundingClientRect();
    H.tick._res = r.width && r.bottom > pr.top - 24 ? r.right - pr.left + 6 : 0;
  }
  return H.tick._res;
}
function drawHud(dt, live) {
  const p = race.p;
  R.hudBottom = hudBottomL; R.bannerBox = bannerUp() ? bannerBoxL : null; R.avoidRect = dashAvoidL;
  // canvas signs keep this much clear (logical px) of the HUD bottom and a banner box (render reads R.signPad)
  R.signPad = 12;
  if (!barW) measureBar();
  // text that changes every frame is written at most 15 times a second
  hudSlowT -= dt; const slowTick = hudSlowT <= 0; if (slowTick) hudSlowT = 1 / 15;
  // rank rolls toward the real number (in log space so the big drops feel big)
  // both clamped to 1 or more (and a NaN starts over), so '#NaN' can never latch
  const rk = Math.max(1, +race.rank || 1);
  if (!(shownRank >= 1)) shownRank = rk;
  const lr = Math.log(shownRank), tr = Math.log(rk);
  shownRank = Math.exp(lr + (tr - lr) * Math.min(1, dt * 6));
  if (Math.abs(shownRank - rk) < 0.6) shownRank = rk;
  if ((slowTick || shownRank === rk) && H.rank._n !== Math.round(shownRank)) {
    H.rank._n = Math.round(shownRank);
    const txt = '#' + fmt(shownRank);
    if (H.rank._v !== txt) { setT(H.rank, txt); if (!S.reduced) { setC(H.rank, 'bump', true); clearTimeout(H.rank._t); H.rank._t = setTimeout(() => setC(H.rank, 'bump', false), 80); } }
  }
  const rc = jumpT > 0 ? '#7dffb0' : race.rank <= 1 ? '#ffd75c' : race.rank <= 10 ? '#7dffb0' : '#fff';
  if (H.rank._col !== rc) { H.rank._col = rc; H.rank.style.color = rc; }
  if (live) {
    // "+places" ticker and big-jump flash
    histT += dt;
    if (histT >= 0.25) {
      histT = 0; rankHist.push(race.rank); if (rankHist.length > 3) rankHist.shift();
      const gain = rankHist[0] - race.rank;
      if (gain > Math.max(40, race.rank * 0.05) && jumpT <= 0) { jumpT = 0.45; setC(H.rank.parentNode, 'jump', true); buzz(8); }
    }
    if (jumpT > 0) { jumpT -= dt; if (jumpT <= 0) setC(H.rank.parentNode, 'jump', false); }
    const prev = H.tick._last == null ? race.rank : H.tick._last; H.tick._last = race.rank;
    // a busy moment (body.intense) holds the ticker: the places add up and land in one go once it calms down
    if (race.rank < prev && intenseOn) { tickSum += prev - race.rank; tickHeld = true; if (tickT > 0) { tickT = 0; setC(H.tick, 'on', false); } }
    else if (race.rank < prev || (tickHeld && !intenseOn)) {
      if (race.rank < prev) tickSum += prev - race.rank;
      // swim 1: the first 3 places gained get a punch on the rank and a green tick
      const punch = firstSwim && race.rank < prev && rankPunchN < 3;
      if (punch) { rankPunchN++; rankPunch(); }
      const held = tickHeld; tickHeld = false; tickT = 1.1;
      if (slowTick || held || punch) { const tv = H.tick._v; setT(H.tick, (punch ? '✓ +' : '+') + sig3(tickSum)); if (H.tick._v !== tv) H.tick._res = null; }
      setC(H.tick, 'on', true);
    }
    else if (tickT > 0) { tickT -= dt; if (tickT <= 0) { tickSum = 0; setC(H.tick, 'on', false); } }
    // several thresholds in one leap: only the best one gets the flash
    let ms = null; while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) ms = MILESTONES[msIdx++];
    if (ms) { callout('milestone', { t: ms[1], col: msIdx >= 5 ? '#ffd75c' : '#7dffb0', sec: 1.4 }); sfx('milestone'); buzz([15, 25, 15]); }
  }
  // the fork's PICK A TUBE sign scrolls up under the rank row: the ticker steps aside while it is on screen
  if (live && R.camY != null && C.FORK_Y0) { const fy = R.sy(C.FORK_Y0 - 500); setC(H.tick, 'fork', fy > -60 && fy < (R.H || 900) + 60); }
  if (slowTick) {
    // swim 1's lesson: the goal sits where the swimmers-alive count goes
    const goalL = firstSwim && tut && tut.on;
    // swim 1 keeps the HUD to what matters: no swimmers-alive count at all (swim 2 brings it), the distance to the egg
    // once the lesson is over
    setC(H.alive, 'vhide', firstSwim && !goalL);
    setC(H.distW, 'vhide', firstSwim && !!(tut && tut.on));
    // (the launch caption first, K.FIRST_SWIM_LAUNCH, for the swim's first 2.5 s; then the goal)
    const launchL = goalL && !!FIRST_SWIM_LAUNCH && (+race.t || 0) < 2.5;
    const an = launchL ? -2 : goalL ? -1 : Math.max(race.alive, Math.round(shownRank));
    if (H.alive._n !== an) { H.alive._n = an; setT(H.alive, launchL ? FIRST_SWIM_LAUNCH : goalL ? (K.FIRST_SWIM_GOAL || 'Pass them all. Reach the egg.') + ' 🥚' : fmt(an) + ' swimmers alive'); }
    setT(H.cm, (race.remaining() / PX_PER_CM).toFixed(1) + ' cm');
  }
  const zi = zoneIndex(p.y);
  if (zi !== lastZone) {
    lastZone = zi; setT(H.zone, ZONES[zi].name);
    // a zone banner still up for the zone Kevin just left is stale: it goes now
    if (coCur && coCur.kind === 'zone' && coCur.zoneI != null && coCur.zoneI !== zi) coEnd();
    // bright zones (pale backdrops: the Acid Lagoon, the Womb Sea, the fork, the rapids, the egg): HUD text goes cream
    // and a scrim sits under the HUD (#hud::before) so its labels keep 4.5:1
    document.body.classList.toggle('bright', BRIGHT_ZONES.has(ZONES[zi].id));
  }
  const pr = race.progress();
  setBar(H.fill, pr); setX(H.me, pr * barW);
  // rival dots; name tags take a free row (above or below the bar) or hide when crowded
  const meX = pr * 100, tagX = [];
  for (let k = RIVALS.length - 1; k >= 0; k--) {
    const a = race.agents[k], el = H.rv[k], st = rvState[k]; if (!a) continue;
    const x = Math.min(100, a.y / RACE_LEN * 100);
    setX(el, x / 100 * barW);
    // swim 1: a named rival's pip shows once they have been introduced
    setC(el, 'vhide', firstSwim && !rivalIntro[k]);
    if (st.alive !== a.alive) { st.alive = a.alive; setC(el, 'dead', !a.alive); }
    const ahead = a.y > p.y;
    if (st.ahead !== ahead) {
      // a rival just went past you: if core does not say so itself, say it here
      if (ahead && !st.ahead && a.alive && !a.arrived && !race.drill && live && !coreHas.passedBy && (p.y < C.FORK_Y0 || a.side === p.side)) passedBy(k);
      st.ahead = ahead; setC(el, 'behind', !ahead);
    }
    tagX[k] = x;
  }
  rivalDots(pr * barW);
  // name tags: only the nearest rival ahead (top row) and the nearest behind (bottom row), plus anyone who just
  // taunted or got passed (1.5 s); everyone else is a 9 px dot with an initial
  let na = -1, nb = -1, dA = 1e9, dB = 1e9;
  for (let k = 0; k < RIVALS.length; k++) {
    const a = race.agents[k]; if (!a || !a.alive || a.arrived || tagX[k] == null) continue;
    if (p.side && a.side && a.side !== p.side) continue;
    const d = a.y - p.y;
    if (d > 0 && d < dA) { dA = d; na = k; } else if (d <= 0 && -d < dB) { dB = -d; nb = k; }
  }
  const want = [];
  if (na >= 0) want.push([na, 0]);
  // intense (big combo, FRENZY, the egg zone): only the nearest rival ahead keeps a name tag
  if (!intenseOn) {
    if (nb >= 0) want.push([nb, 1]);
    for (let k = 0; k < RIVALS.length; k++) if (k !== na && k !== nb && tagX[k] != null && H.rv[k]._hotUntil > clock) want.push([k, -1]);
  }
  const rowsUsed = [[], []], placed = new Set(), rsv = rankReserve();
  if (rsv > 0) rowsUsed[0].push([-1e9, rsv]);
  if (aliveRes) rowsUsed[0].push(aliveRes);
  // #me keeps its own spot on the top row: no name tag ever sits on your dot
  { const mx = pr * barW; rowsUsed[0].push([mx - 14, mx + 14]); }
  for (const [k, pref] of want) {
    const el = H.rv[k], tg = el._tag || (el._tag = el.querySelector('.tag'));
    if (!el._tw && !el._cnotag) { const w = tg ? tg.offsetWidth : 0; if (w > 0) el._tw = w; }
    const tw = el._tw || 56, px = tagX[k] / 100 * barW, c = barW > tw ? clamp(px, tw / 2 - 6, barW - tw / 2) : px;
    const lo = c - tw / 2 - 3, hi = c + tw / 2 + 3;
    let row = -1;
    for (const r of pref >= 0 ? [pref, 1 - pref] : [0, 1]) if (tagRowOk[r] && !rowsUsed[r].some((iv) => lo < iv[1] && hi > iv[0]) && (r === 1 || Math.abs(tagX[k] - meX) > 4)) { row = r; break; }
    if (row < 0) continue;
    rowsUsed[row].push([lo, hi]); placed.add(k);
    setC(el, 'lo', row === 1); setC(el, 'notag', false);
    const sh = Math.round(c - px);
    if (tg && el._sh !== sh) { el._sh = sh; tg.style.transform = sh ? `translateX(calc(-50% + ${sh}px))` : ''; }
  }
  for (let k = 0; k < RIVALS.length; k++) if (!placed.has(k)) setC(H.rv[k], 'notag', true);
  setBar(H.efill, p.e / p.maxE);
  const low = p.e < 25; setC(H.efill, 'low', low); setC(H.elow, 'hide', !low); setC(H.ebar, 'shake', low && !S.reduced); setC(H.ebar, 'crit', p.e < 12);
  // shields: one pill that flashes when the count changes
  if (H.shields._n !== p.shield || H.shields._w !== p.wing) {
    const pn = H.shields._n, grew = p.shield > pn || p.wing > H.shields._w;
    H.shields._n = p.shield; H.shields._w = p.wing;
    H.shields.textContent = (p.shield > 0 ? '⛑️×' + p.shield : '') + (p.wing ? (p.shield > 0 ? ' ' : '') + '🤝' : '');
    setC(H.shields, 'hide', !(p.shield > 0 || p.wing));
    if (!S.reduced && pn >= 0) { H.shields.classList.remove('flash', 'lost'); void H.shields.offsetWidth; H.shields.classList.add(grew ? 'flash' : 'lost'); }
  }
  // combo strip: one row, one bar; its size grows a step per tier but never past the screen edge
  // swim 1: the strip waits until the chain means something (combo 5+, or a chain that has lasted 2 s)
  if (p.combo >= 3) { if (comboSeenAt < 0) comboSeenAt = clock; } else comboSeenAt = -1;
  const firstOk = !firstSwim || comboIntroDone || p.combo >= 5 || (comboSeenAt >= 0 && clock - comboSeenAt >= 2);
  const cb = H.combo, showCombo = (p.combo >= 3 || potBrokeT > 0) && !race.drill && !eggOn && firstOk;
  if (p.combo < 10) comboLadder = 0;
  // the pot: what cashing in pays right now (rolls upward over ~120 ms, drops at once); a smashed pot shows struck through
  // what CASH pays right now: the bank, the finisher multiplier for this style, double in a disco
  // (the disco's bonus exactly as core pays it: x(1 + evK('disco')))
  let discoK = 0; try { discoK = typeof race.evK === 'function' ? +race.evK('disco') || 0 : typeof race.evIs === 'function' && race.evIs('disco') ? 1 : 0; } catch (e) { discoK = 0; }
  if (potBrokeT > 0) { potBrokeT -= dt; if (potBrokeT <= 0) { potV = 0; setC(H.pot, 'broke', false); } }
  else {
    // (the trick multiplier too: without it the strip showed as little as half of the real bank)
    const potT = p.bank >= 3 && typeof C.bankDna === 'function' ? C.bankDna(p.bank, p.style, p.clutch, p.trickMult || 0) * finMult(p.style) * (1 + discoK) : 0;
    potV = potT > potV ? potV + (potT - potV) * Math.min(1, dt * 25) : potT;
    if (potT - potV < 0.05) potV = potT;
  }
  if (showCombo) {
    if (cb._op !== 1) {
      cb._op = 1; cb.style.opacity = 1; requestAnimationFrame(measureHud); setC(document.body, 'comboOn', true);
      // the intro on swim 1: a little bounce as the strip arrives
      if (comboIntroNow && !S.reduced && H.combo.animate) H.combo.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
      comboIntroNow = false;
    }
    let changed = false;
    const ct0 = H.cn._v; setT(H.cn, Math.floor(p.combo) + 'x'); if (H.cn._v !== ct0) changed = true;
    const fz = p.frenzyT > 0;
    let w = comboWord(p.combo);
    for (const [n, word] of COMBO_WORDS_HIGH) if (p.combo >= n) w = word;
    const T = C.FRENZY_TIERS, ti = fz && T ? clamp((p.tier || 1) - 1, 0, T.length - 1) : -1;
    // a new FRENZY tier: what it adds (K.FRENZY_TIER_SHORT) sits in the tier slot for 1.2 s
    if (ftShow && (clock >= ftShow.until || !fz)) ftShow = null;
    const ft = ftShow ? ftShow.t : ti >= 0 ? T[ti].name : '', ww = ti >= 0 ? '' : w;
    if (H.cft._v !== ft || H.cw._v !== ww || !!H.cft._cshow !== !!ftShow) { changed = true; H.cft._cshow = !!ftShow; }
    setT(H.cft, ft); setT(H.cw, ww);
    // in FRENZY the tier name already shouted on the canvas: the strip keeps the number, the pot and the gap to MEGA
    setC(H.cw, 'hide', ti >= 0); setC(H.cft, 'hide', !ftShow);
    const f = p.comboT / (p.comboMax || race.s.combo || 1);
    setBar(H.cbar, f); setC(H.cbarW, 'low', f < 0.3);
    let ct = 0; while (ct < COMBO_TIERS.length && p.combo >= COMBO_TIERS[ct]) ct++;
    if (cb._tier !== ct) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.toggle('t' + i, i === ct); if (ct > (cb._tier || 0) && ct > 1) comboFlash = 0.35; cb._tier = ct; changed = true; }
    setC(cb, 'fz', fz);
    const mult = p.mult > 0 ? p.mult : typeof C.comboMult === 'function' ? C.comboMult(p.combo) : 0;
    const bd = document.body;
    // row 3 is ONE slot, by priority: a trick 2 of 3 (the recipe with its ghost chip) > 3 or less to the next FRENZY tier >
    // the recipe chips > the pot ('+12 🧬'). The CASH chip ('CASH x1.7') is a side pill at the end of the row, so CASH and
    // the recipe show together (the pot steps aside while it shows: CASH says the same). Swim 1 shows none of them; swim 2
    // keeps the pot and CASH back until the cash lesson
    const fm = finMult(p.style), noPot = !!(bd._chud1 || bd._chud2);
    const potOn = potV > 0.05 && !noPot;
    const cashOn = p.bank >= 10 && potBrokeT <= 0 && !race.pending && !noPot;
    let gp = -1;
    if (typeof race.fzPoints === 'function' && Number.isFinite(p.nextFrenzy)) gp = Math.ceil(p.nextFrenzy - race.fzPoints());
    const gapOn = gp > 0 && gp <= 3 && !bd._chud1;
    // (the chips' stings run every frame, shown or not)
    const tease = !!(trickTease && !bd._chud1);
    const lOn = linksTick((tease || !gapOn) && !bd._chud1);
    const slot = lOn && tease ? 'links' : gapOn ? 'gap' : lOn ? 'links' : potOn && !cashOn ? 'pot' : '';
    // ZOOM has no slot of its own: a rise in its one-decimal value (combo 5+) flashes as the strip's tag, at most every
    // 1.5 s and never over a style word; never while CASH holds the slot or in FRENZY (one multiplier at a time)
    const mr = mult && p.combo >= 5 ? Math.round(mult * 10) / 10 : 0;
    if (mr > 1 && mr > (cb._mr || 0) + 0.05 && tagT <= 0 && clock - (cb._mrAt || -9) >= 1.5 && !bd._chud1 && !cashOn && !fz) {
      cb._mrAt = clock; comboTag(((K.COMBO_LABELS || {}).speed || 'ZOOM') + ' ' + multTxt(mr)); changed = true;
    }
    cb._mr = mr;
    setC(H.cash, 'hide', !cashOn);
    if (cashOn) cashPill(p, fm, discoK, f);
    else { setC(H.cash, 'cashHot', false); cb._mt = null; }
    setC(H.gap, 'hide', slot !== 'gap');
    if (slot === 'gap') { setT(H.gap, gp + (fz ? ' TO MEGA' : ' TO FRENZY')); setC(H.gap, 'near', true); }
    setC(H.pot, 'hide', slot !== 'pot');
    // row 3 changed what it holds (or the recipe its chips): measured again
    const rowSig = slot + (cashOn ? '+c' + H.cashV._v : '') + (slot === 'links' ? linkSig : slot === 'gap' ? gp : '');
    if (cb._row !== rowSig) { cb._row = rowSig; changed = true; }
    if (changed || cb._sw == null) fitCombo(ct);
    if (slot === 'pot') {
      // the text is rebuilt only when what it shows changes (a pot under 10 shows one decimal)
      const pk = potV < 10 ? Math.round(potV * 10) : Math.round(potV) * 10 + 1e6;
      if (H.pot._pk !== pk) { H.pot._pk = pk; setT(H.pot, '+' + (potV < 10 ? potV.toFixed(1) : fmt(potV)) + ' 🧬'); }
      const tm = +p.trickMult || 0;
      if (!S.reduced && H.pot.animate && ((H.pot._fm != null && fm > H.pot._fm + 0.001) || (H.pot._tm != null && tm > H.pot._tm + 0.001))) H.pot.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      H.pot._fm = fm; H.pot._tm = tm;
      const g = typeof C.bankGrade === 'function' ? C.bankGrade(p.bank) : 0;
      if (H.pot._g !== g && potBrokeT <= 0) { H.pot._g = g; H.pot.style.fontSize = (13 + 2 * g) + 'px'; }
    }
    stylePips(p);
    if (p.combo > lastCombo) comboPunch(ct, (cb._tier0 | 0) < ct && lastCombo > 0);
    cb._tier0 = ct;
  } else {
    if (cb._op !== 0) { cb._op = 0; cb.style.opacity = 0; requestAnimationFrame(measureHud); setC(document.body, 'comboOn', false); }
    setC(H.cash, 'hide', true);
    if (cb._tier) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.remove('t' + i); cb._tier = 0; }
  }
  comboLinkN = 0;
  // a shout for every new ten, however the combo jumped there
  if (p.combo < lastShout) lastShout = p.combo;
  if (p.combo >= 10 && Math.floor(p.combo / 10) > Math.floor(lastShout / 10)) { sfx('combo', p.combo); lastShout = p.combo; }
  lastCombo = p.combo;
  if (comboFlash > 0) { comboFlash -= dt; setC(cb, 'flash', comboFlash > 0); }
  if (tagT > 0 && live) { tagT -= dt; if (tagT <= 0) { H.ctag.classList.remove('on'); setC(H.cw, 'tagged', false); } }
  // owned mutations, rebuilt only when they change (short phones show 8 chips and a +N)
  const sig = Object.keys(race.muts).map((id) => id + race.muts[id]).join(',') + '|' + (race.syn ? Object.keys(race.syn).join(',') : '');
  if (sig !== mutSig) {
    const old = new Set(mutSig.split(/[,|]/)); mutSig = sig;
    const syns = race.syn ? Object.keys(race.syn).map((id) => SYNERGIES.find((s) => s.id === id)).filter(Boolean) : [];
    const chips = Object.keys(race.muts).filter((id) => MUTATIONS[id]).map((id) => `<span class="${old.has(id + race.muts[id]) ? '' : 'new'}" title="${esc(MUTATIONS[id].name)}">${MUTATIONS[id].icon}${race.muts[id] > 1 ? `<b>${race.muts[id]}</b>` : ''}</span>`)
      .concat(syns.map((s) => `<span class="sy" title="${esc(s.name)}">${s.icon}</span>`));
    const cap = innerHeight <= 700 ? 8 : 99;
    H.muts.innerHTML = chips.slice(0, cap).join('') + (chips.length > cap ? `<span class="more">+${chips.length - cap}</span>` : '');
    requestAnimationFrame(measureHud);
    // hidden while intense, but a new chip shows for 1.5 s
    mutShowT = 1.5;
  }
  if (mutShowT > 0) mutShowT -= dt;
  setC(H.muts, 'peek', mutShowT > 0);
  laneTick(p);
  dnaHudTick();
  if (live) headTick(dt, p);
  // the first time this swim goes past the BEST mark
  if (live && bestMarkY > 0 && p.y >= bestMarkY && !race.demo) {
    bestMarkY = 0;
    // in the Egg zone a big pop never lands on the egg's face: it goes 120 px above its eyes (RACE_LEN + 120)
    const inEgg = zoneIndex(p.y) === C.EGG_I, ey = RACE_LEN + 240;
    R.pop(inEgg ? mid(RACE_LEN) : p.x, inEgg ? Math.max(p.y + 90, ey) : p.y + 90, POP('pastBest', 'PAST YOUR BEST!'), '#ffd75c', 22, 1.2); sfx('pastBest'); buzz(30);
  }
  currentTick(live);
  if (slowTick) paceTick(p);
  setC(H.dash, 'cd', p.dashCd > 0 && !race.drill);
  dashTick(p);

  setT(H.dashL, race.drill ? 'DRILL' : 'DASH');
  if (live) {
    // banners, story beats and coach lines keep their clocks still through a countdown, a hit-stop or a card deal
    const coFrozen = countT > 0 || stopT > 0 || !!race.pending || cardsLive();
    coTick(coFrozen ? 0 : dt);
    if (coachT > 0 && !coFrozen) { coachT -= dt; if (coachT <= 0) { coachPri = -1; coachHint = false; $('coach').classList.remove('on'); } }
    // the old #hint line, if anything ever shows it: gone after 2.5 s of real play
    { const he = $('hint'); if (+he.style.opacity > 0) { if (countT <= 0 && stopT <= 0) hintT += dt; if (hintT >= 2.5) { he.style.opacity = 0; hintT = 0; } } else hintT = 0; }
  }
}
// riding a flow current: the audio swells with it (A.current every frame) and whooshes on the way in, panned its way
let curOn = false;
function currentTick(live) {
  if (!A.current) return;
  const c = live && race && !race.over && !race.pending ? +race.p.current || 0 : 0, on = c !== 0, dir = clamp(c, -1, 1);
  if (on && !curOn) sfx('whoosh', { pan: dir });
  if (on || curOn) { try { A.current(on ? 1 : 0, dir); } catch (e) { /* optional */ } }
  curOn = on;
}
// STYLE pips: one per different move in the chain (6 max). They pulse when the points are there for the next FRENZY
// tier but the style is holding it back, with a one-time tag that says so
let tierTagSaid = false;
function stylePips(p) {
  const el = H.pips; if (!el) return;
  const n = clamp(p.style | 0, 0, 6);
  if (el._n !== n) { el._n = n; H.pipI.forEach((x, i) => x.classList.toggle('on', i < n)); }
  let locked = false;
  if (p.frenzyT > 0 && typeof race.tierOf === 'function' && typeof race.fzPoints === 'function') {
    const T = C.FRENZY_TIERS, tier = p.tier | 0;
    locked = race.tierOf(race.fzPoints()) > tier && (!T || tier < T.length) && (typeof C.styleTierCap !== 'function' || C.styleTierCap(p.style) <= tier);
  }
  setC(el, 'lock', locked);
  if (locked && !tierTagSaid) { tierTagSaid = true; comboTag('NEXT TIER LOCKED: NEW MOVE!'); H.combo._sw = null; sfx('tap', 0.9); }
}
// the egg clock (from the Sea on): the leading named rival's time to the egg against yours, + when you are ahead
let paceV = null, paceSaid = false, vEma = 0;
function paceTick(p) {
  const el = H.pace; if (!el) return;
  vEma = vEma > 0 ? vEma + ((p.vy || 0) - vEma) * 0.08 : Math.max(1, p.vy || 0);
  const zi = zoneIndex(p.y), sea = C.SEA_I >= 0 ? C.SEA_I : 3;
  let lead = null;
  if (zi >= sea && !race.drill && !eggOn) {
    for (let k = 0; k < RIVALS.length; k++) {
      const a = race.agents[k]; if (!a || !a.alive || a.arrived || !a.boss) continue;
      if (p.side && a.side && a.side !== p.side) continue;
      if (!lead || a.y > lead.y) lead = a;
    }
  }
  if (!lead) { setC(el, 'hide', true); paceV = null; return; }
  const end = RACE_LEN - 70, mine = Math.max(0, end - p.y) / Math.max(150, vEma), theirs = Math.max(0, end - lead.y) / Math.max(150, lead.sp || 430);
  const gap = theirs - mine;
  paceV = paceV == null ? gap : paceV + (gap - paceV) * 0.15;
  const v = Math.round(paceV * 10) / 10;
  // whole seconds, and only while it is a race worth watching (30 s behind to 10 s ahead)
  if (v < -30 || v > 10) { setC(el, 'hide', true); return; }
  const sec = Math.max(1, Math.round(Math.abs(v)));
  setT(el, v < 0 ? `🏁 ${first(lead.boss.name)} ${sec}s ahead` : `🏁 ${first(lead.boss.name)} ${sec}s behind`);
  setC(el, 'hide', false); setC(el, 'ahead', v >= 0); setC(el, 'behind', v < 0); setC(el, 'hot', v < -5);
  const zid = ZONES[zi] && ZONES[zi].id;
  if (!paceSaid && v < -4 && (zid === 'sea' || zid === 'fork')) {
    paceSaid = true;
    callout('event', { t: 'PICK UP THE PACE', z: `${first(lead.boss.name).toUpperCase()} IS AHEAD`, col: lead.boss.col, sec: 1.8 });
    buzz([15, 20, 15]);
  }
}
// the egg head start in the HUD (from the Fork on, never on swim 1): what the swim has earned for the duel so far
// (race.headStart(), read every 0.25 s) on a 0..C.DRILL_HEAD_MAX bar (the duel's soft knee starts at HEAD_DUEL_MAX); red under a quarter tank (the tank feeds it)
const FORK_ZI = Math.max(0, ZONES.findIndex((z) => z.id === 'fork'));
// the bar's full mark is this swim's real cap (core headCapOf: 3.4, 2.56 for generation 0 rookies), else the old constant
const HEAD_MAX = () => {
  if (race && +race.headCap > 0) return +race.headCap;
  if (typeof C.headCapOf === 'function' && race && !race.demo) { try { const v = +C.headCapOf(meta, race.daily != null ? race.daily : undefined); if (v > 0) return v; } catch (e) { /* the constant */ } }
  return +C.DRILL_HEAD_MAX || +C.HEAD_DUEL_MAX || 2.4;
};
let headT = 0, headV = -1, headOn = false;
function headRead() { try { const v = +race.headStart(); return Number.isFinite(v) ? Math.max(0, v) : -1; } catch (e) { return -1; } }
function headShow(v) { headV = v; setT(H.headV, '+' + v.toFixed(1) + 's'); setBar(H.headI, v / HEAD_MAX()); }
function headTick(dt, p) {
  const el = H.head; if (!el) return;
  const on = !firstSwim && !race.demo && !race.drill && !eggOn && !race.over && typeof race.headStart === 'function' && zoneIndex(p.y) >= FORK_ZI;
  if (on !== headOn) { headOn = on; setC(el, 'hide', !on); headT = 0; requestAnimationFrame(measureHud); }
  if (!on) return;
  setC(el, 'low', p.e / (p.maxE || 100) < 0.25);
  headT -= dt; if (headT > 0 && headV >= 0) return;
  headT = 0.25;
  const v = headRead(); if (v >= 0 && Math.abs(v - headV) >= 0.005) headShow(v);
}
// a named rival passed or a new FRENZY tier: the head start it added pops ('+0.2s') and the chip flashes
function headGainPop() {
  if (!headOn || !race || race.over) return;
  const v = headRead(); if (v < 0) return;
  const d = v - Math.max(0, headV); headShow(v); headT = 0.25;
  if (d < 0.05) return;
  later(0.35, () => { if (race && !race.over) R.pop(race.p.x + 40, race.p.y + 40, '+' + d.toFixed(1) + 's 🥚', '#7dffb0', 15, 1); });
  const el = H.head; el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain');
}
// the bounty in the HUD: a small pill under the distance, ticked off when it is met mid-swim
let goalHit = false;
function goalPill() {
  const el = $('goalPill'), g = race && !race.demo && !firstSwim ? meta.goal : null;
  const l = goalHit ? 'GOAL SMASHED ✓' : g ? nextGoalLine(g).replace(/^NEXT:\s*/i, '').replace(/\s*\+[\d,]+ 🧬$/, '') : '';
  setT(el, l ? (goalHit ? l : '🎯 ' + l) : ''); setC(el, 'hide', !l); setC(el, 'done', goalHit);
}
// the threat growl and the acid sizzle follow the nearest hunting Big Macro and the acid every frame
let threatOn = false;
function threatTick(live) {
  if (!A.threat) return;
  const on = live && !!race && !race.demo && !race.over && !race.pending && mode === 'race';
  if (!on) { if (threatOn) { threatOn = false; acidWas = 0; try { A.threat(0); A.acid = 0; A.acidLow = false; if (A.steer) A.steer(0, 0); } catch (e) { /* ignore */ } } return; }
  const p = race.p; let k = 0, pan = 0, bd = 300;
  for (const e of race.ents) {
    if (e.t !== 'wbc' || e.dead || !(e.hunt > 0.5)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; k = 1 - d / 300; pan = clamp((e.x - p.x) / 200, -1, 1); }
  }
  threatOn = true;
  try {
    A.threat(k, pan);
    // acid: a level from 0 to 1 (p.acid fades out over 0.5 s), louder and higher when the GAS tank is low, and a splash on entry
    const ac = clamp(+p.acid || 0, 0, 1); A.acid = ac; A.acidLow = p.maxE > 0 && p.e / p.maxE < 0.3;
    if (ac >= 0.99 && acidWas <= 0) sfx('acidIn'); acidWas = ac;
    // the steering voice: a whoosh that follows sideways speed
    if (A.steer) A.steer(clamp(Math.abs(+p.vx || 0) / 460, 0, 1), Math.sign(+p.vx || 0));
  } catch (e) { /* ignore */ }
}
let acidWas = 0;
// the combo word: one variant per threshold from K.COMBO_WORDS_POOL ({3: [...], 6: [...]}), picked once per chain
// (seeded by the race time the chain started, so the word holds while the chain lives), else COMBO_WORDS
let comboWordPick = null;
const POOL_STEPS = (() => { const P = K.COMBO_WORDS_POOL; if (!P || typeof P !== 'object') return null; const a = Object.keys(P).map((k) => [+k, P[k]]).filter(([n, l]) => Number.isFinite(n) && Array.isArray(l) && l.length).sort((x, y) => x[0] - y[0]); return a.length ? a : null; })();
function comboWord(c) {
  if (!(c >= 1)) { comboWordPick = null; return ''; }
  if (!comboWordPick) comboWordPick = { seed: Math.floor(((race && race.t) || 0) * 1000) | 0, at: {} };
  if (POOL_STEPS) {
    let st = null; for (const x of POOL_STEPS) if (c >= x[0]) st = x;
    if (!st) return '';
    let w = comboWordPick.at[st[0]];
    if (w == null) { let h = (comboWordPick.seed ^ Math.imul(st[0] + 1, 2654435761)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; w = comboWordPick.at[st[0]] = st[1][(h ^ (h >>> 13)) % st[1].length]; }
    return w;
  }
  let w = ''; for (const [n, word] of COMBO_WORDS) if (c >= n) w = word;
  return w;
}
// scale the combo strip to its tier, but never wider than its box (measured only when its text changes). The box's
// padding (the landscape gutter's safe-area side) is not room. Row 3 (.potRow: the slot and the CASH pill) gets the same
// scale, smaller still if it is the wider of the two, never under 0.5
function fitCombo(ct) {
  const cb = H.combo, inr = H.cin, row = H.potRow;
  let pl = 0, pr = 0;
  try { const cs = getComputedStyle(cb); pl = parseFloat(cs.paddingLeft) || 0; pr = parseFloat(cs.paddingRight) || 0; } catch (e) { /* old browser */ }
  const w = inr.scrollWidth || 1, avail = Math.max(40, (cb.clientWidth || innerWidth) - pl - pr - 12);
  const sc = Math.max(0.5, Math.min(TIER_SCALE[ct] || 1, avail / w));
  cb._sw = w;
  const v = S.reduced ? Math.min(1, sc) : sc;
  if (inr._sc !== v) { inr._sc = v; inr.style.transform = `scale(${v.toFixed(3)})`; }
  if (row) {
    // the row's own content width: its shown children and the gaps between them (the row box itself is full width)
    let rw = 0, n = 0;
    for (const c of row.children) { if (c.classList.contains('hide')) continue; const cw = c.offsetWidth; if (cw > 0) { rw += cw; n++; } }
    rw += Math.max(0, n - 1) * 6;
    const rs = Math.max(0.5, Math.min(1, v, rw > 0 ? avail / rw : 1));
    if (row._sc !== rs) { row._sc = rs; row.style.transform = rs < 0.999 ? `scale(${rs.toFixed(3)})` : ''; }
  }
}
// Coach Gonad chimes in twice a zone (35% and 70%), never over a banner, the tutorial, a FRENZY, a big combo or the egg
function quipTick() {
  if (!race || race.demo || race.drill) return;
  const p = race.p, zi = zoneIndex(p.y), z = ZONES[zi];
  if (zi !== quip.zi) { if (quip.zi >= 0 && coachPri <= 0) coachClear(); quip.zi = zi; quip.done = 0; }
  if (quip.done >= 2) return;
  const zf = (p.y - ZSTART[zi]) / z.len, slot = quip.done ? 0.7 : 0.35;
  if (zf < slot) return;
  if (zf > slot + 0.25) { quip.done++; return; }
  if (p.frenzyT > 0 || p.combo >= 10 || eggOn) return;
  if ((tut && tut.on) || bannerUp() || coachT > 0 || race.pending) return;
  const firstSrc = firstSwim && K.ZONE_LINES_SHORT_FIRST ? K.ZONE_LINES_SHORT_FIRST[z.id] : null;
  const src = (Array.isArray(firstSrc) && firstSrc.length && firstSrc) || (ZONE_LINES_SHORT && ZONE_LINES_SHORT[z.id]) || ZONE_LINES[z.id] || [];
  let pool = src.filter((l) => !usedQuips.has(l));
  // a zone that ran dry starts over (never the line we just said)
  if (!pool.length && src.length) { for (const l of src) usedQuips.delete(l); pool = src.filter((l) => l !== lastQuip); }
  quip.done++;
  if (!pool.length) return;
  const l = pickLine(pool); usedQuips.add(l); lastQuip = l;
  coach(l, clamp(1.6 + l.length * 0.035, 2, 3.2), 0);
}
// a named rival you tuck in behind for 1 s says something about it (K.RIVAL_DRAFTED): once per rival per zone, never
// within 4 s of another bubble, never in the swim-1 lesson
let draftK = -1, draftT = 0, draftSaid = new Set(), draftZone = -1;
function draftTick(dt) {
  if (!race || race.demo || race.drill || race.over || race.pending || countT > 0) { draftK = -1; draftT = 0; return; }
  const zi = race.zoneReached | 0; if (zi !== draftZone) { draftZone = zi; draftSaid = new Set(); }
  const a = race.draftTarget, k = a && a.boss ? race.agents.indexOf(a) : -1;
  if (k < 0 || !RIVALS[k] || !(race.p.draft > 0.08)) { draftK = -1; draftT = 0; return; }
  if (k !== draftK) { draftK = k; draftT = 0; }
  draftT += dt;
  if (draftT < 1 || draftSaid.has(k) || (firstSwim && tut && tut.on) || clock - lastBubble < 4) return;
  const pool = byFirst(K.RIVAL_DRAFTED || {}, RIVALS[k].name);
  if (!Array.isArray(pool) || !pool.length) { draftSaid.add(k); return; }
  if (sayRival(k, pickLine(pool), 2, true)) draftSaid.add(k);
}
// meet the named rivals: one line the first time each comes into view
function rivalTick() {
  const p = race.p;
  for (let k = 0; k < RIVALS.length; k++) {
    const a = race.agents[k]; if (!a || !a.alive || rivalIntro[k]) continue;
    if (Math.abs(a.y - p.y) > 400 || (p.y >= C.FORK_Y0 && a.side !== p.side)) continue;
    const l = linesOf(RIVALS[k].name).intro;
    if (!l) { rivalIntro[k] = true; continue; }
    if ((coachT > 0 && coachPri >= 2) || (tut && tut.on) || eggOn) continue;
    rivalIntro[k] = true;
    const grudge = nemesisOf() === first(RIVALS[k].name) && byFirst(RIVAL_GRUDGE, RIVALS[k].name);
    hint(grudge || l, 2.8, 2);
  }
}

// ------------------------------------------------------------------ quality governor
// Learns the display's own frame period (the median of the first 90 frames). Steps down when frames run 1.3x slower
// than that for 2 s: first the canvas resolution (stage 1), then (5 s later, if still slow) the lite renderer (stage 2).
// Steps back up after 20 s in which the frame's OWN work (workEma, main.js start to end of a frame) stays under 0.45x
// the period: a vsync-locked display never shows a faster interval, so the interval cannot say so. Never judged on menus,
// cards or pause, or in the 3 s after a screen change. Auto remembers the stage for 7 days (S.qs, S.qT), written only
// once a stage has held 10 s; a fresh guess starts a weak phone at stage 1.
// failAt[stage]: when that stage was too slow this session; the governor never steps back up into it (a GPU-bound phone
// shows a fast frame's own work but a slow display, so stepping up flip-flopped)
const gov = { samples: [], period: 0, ema: 0, workEma: 0, slowFor: 0, fastFor: 0, stage: 0, stageAt: 0, holdUntil: 0, pend: -1, failAt: {} };
const Q_KEEP = 7 * 86400000;
function govHold(sec) { gov.holdUntil = Math.max(gov.holdUntil, clock + sec); gov.slowFor = 0; gov.fastFor = 0; }
function setStage(st) {
  gov.stage = st; gov.stageAt = clock;
  try { if (typeof A.setLite === 'function') A.setLite(st >= 2); } catch (e) { /* optional */ }
  try { if (typeof A.setStage === 'function') A.setStage(st); } catch (e) { /* optional */ }
  R.lite = st >= 2;          // set before resize: the renderer caps the lite canvas lower
  R.resize(st >= 1 ? 0 : 1);
}
function lowEnd() {
  try {
    const hc = navigator.hardwareConcurrency || 8, dm = navigator.deviceMemory || 8;
    const px = (cv.clientWidth || innerWidth) * (cv.clientHeight || innerHeight) * 4;   // the canvas at DPR 2
    return hc <= 6 || dm <= 4 || px > 2e6;
  } catch (e) { return false; }
}
function autoStage() { return S.qT && Date.now() - S.qT < Q_KEEP ? clamp(S.qs | 0, 0, 2) : lowEnd() ? 1 : 0; }
function applyGfx() {
  gov.slowFor = 0; gov.fastFor = 0; gov.pend = -1;
  setStage(S.gfx === 'lite' ? 2 : S.gfx === 'full' ? 0 : autoStage());
  if (R.textScale != null) R.textScale = textScaleNow();
  drawKey = '';
}
function learnStage(st) { setStage(st); gov.pend = st; gov.slowFor = 0; gov.fastFor = 0; gov.ema = gov.period; gov.workEma = 0; }
// the display's frame period: the 20th percentile of 90 live-race frames, snapped to a real refresh rate (never above 60 Hz's)
const PERIODS = [6.94, 8.33, 11.1, 16.67];
const snapPeriod = (v) => PERIODS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), PERIODS[0]);
function govReset() { gov.samples = []; gov.period = 0; gov.slowFor = 0; gov.fastFor = 0; }
function governor(raw, work) {
  if (S.gfx !== 'auto' || raw > 100 || raw <= 0 || document.hidden) return;
  // a stage that has held 10 s is the one to remember
  if (gov.pend >= 0 && gov.stage === gov.pend && clock - gov.stageAt >= 10) { S.qs = gov.pend; S.qT = Date.now(); saveUI(); gov.pend = -1; }
  // only a live race says anything about the phone: not paused, no cards, no pending deal, not in a hold after a screen change
  const busy = mode !== 'race' || !race || race.demo || race.paused || race.pending || race.over || !$('cards').classList.contains('hide');
  if (busy || clock < gov.holdUntil) { gov.slowFor = 0; gov.fastFor = 0; return; }
  if (gov.samples.length < 90 || !gov.period) {
    gov.samples.push(raw);
    if (gov.samples.length >= 90) { const s = gov.samples.slice().sort((a, b) => a - b); gov.period = snapPeriod(s[Math.floor(s.length * 0.2)]); gov.ema = gov.period; }
    return;
  }
  gov.ema += (raw - gov.ema) * 0.05;
  if (work >= 0 && work < 100) gov.workEma = gov.workEma > 0 ? gov.workEma + (work - gov.workEma) * 0.05 : work;
  if (gov.ema > gov.period * 1.3) { gov.slowFor += raw / 1000; gov.fastFor = 0; }
  else { gov.slowFor = 0; if (gov.workEma > 0 && gov.workEma < gov.period * 0.45) gov.fastFor += raw / 1000; else gov.fastFor = 0; }
  if (gov.slowFor >= 2 && gov.stage < 2 && (gov.stage === 0 || clock - gov.stageAt >= 5)) {
    gov.failAt[gov.stage] = clock;
    learnStage(gov.stage + 1);
    // a step down is remembered at once (the next session starts there), not after 10 s
    S.qs = gov.stage; S.qT = Date.now(); saveUI(); gov.pend = -1;
  } else if (gov.fastFor >= 20 && gov.stage > 0 && gov.failAt[gov.stage - 1] == null && gov.ema <= gov.period * 1.05) learnStage(gov.stage - 1);
}
// world text a touch larger on narrow phones
const textScaleNow = () => clamp(390 / Math.max(240, cv.clientWidth || 390), 1, 1.25);

// ------------------------------------------------------------------ zone-end crawl: only when it is a real moment
// the first zone line of a swim always crawls; after that only with a named rival within 200 px or a 25+ combo,
// at most every 25 s, and those repeats only dip the music (no tape stop)
let crawlOn = false, crawlAt = -99, crawlN = 0;
const crawlWanted = () => crawlN === 0 || ((rivalNear(200) || race.p.combo >= 25) && clock - crawlAt >= 25);
function rivalNear(px) {
  const p = race.p;
  for (let k = 0; k < RIVALS.length; k++) { const a = race.agents[k]; if (a && a.alive && !a.arrived && Math.abs(a.y - p.y) < px && (!p.side || !a.side || a.side === p.side)) return true; }
  return false;
}
// (a crawl is never the big swell: only the first FRENZY and the egg drill get that)
function crawlStart() { if (crawlOn) return; crawlOn = true; crawlAt = clock; try { A.slowmo(true, false); } catch (e) { /* ignore */ } crawlN++; }
function crawlEnd(crossed) {
  if (!crawlOn) return;
  crawlOn = false;
  if (slowT <= 0 && freezeT <= 0) { try { A.slowmo(false); } catch (e) { /* ignore */ } }
  if (crossed) { if (R.zoomPunch) R.zoomPunch(0.12); trauma(0.3); const p = race && race.p; hitStopRL(60, p ? p.x : null, p ? p.y : null, 'zone'); }
}

// ------------------------------------------------------------------ 2, 1, GO (0.6 s a number)
let lastCount = 0;
// countFromPause: this countdown is the one after a pause (its GO is sfx('resume'))
let countFromPause = false;
let countUnit = 0.6;
function countTick(dt) {
  const el = $('count');
  countT -= dt;
  // the countdown is idle time: art bakes the crowd sprites the swim is about to need
  if (countT > 0 && typeof R.prewarmRun === 'function') { try { R.prewarmRun(); } catch (e) { /* optional */ } }
  if (countT > 0) {
    const n = clamp(Math.ceil(countT / countUnit), 1, 3);
    if (n !== lastCount) { lastCount = n; el.textContent = n; el.className = ''; void el.offsetWidth; el.className = 'on'; sfx('count', { n }); buzz(10); }
  } else {
    // swim 1's GO is a line of its own (K.FIRST_GO_LINE), a size down
    const goL = firstSwim && !countFromPause && FIRST_GO_LINE && FIRST_GO_LINE !== 'GO!' ? FIRST_GO_LINE : 'GO!';
    countT = 0; lastCount = 0; el.textContent = goL; el.className = ''; void el.offsetWidth; el.className = 'on go' + (goL !== 'GO!' ? ' line' : ''); goT = goL !== 'GO!' ? 0.9 : 0.5;
    introUnderOff();
    sfx(countFromPause ? 'resume' : 'go'); buzz([20, 20, 40]); trauma(0.25);
    // the trick streak's pop that the pause held lands with the GO
    if (pausedStreak) { const f = pausedStreak; pausedStreak = null; if (countFromPause) { try { f(); } catch (e) { /* only a pop */ } } }
    // a no-op once the swim-1 banner went up; after a pause in the opening count it still goes up here
    goNow();
    // swim 1: Kevin's YOU tag drops in on GO (scale 1.6 to 1 over 0.25 s; art reads R.youDropT, or takes R.youDrop())
    if (firstSwim && !countFromPause && !S.reduced) { try { if (typeof R.youDrop === 'function') R.youDrop(1.6, 0.25); else R.youDropT = 0.25; } catch (e) { /* optional */ } }
    countFromPause = false;
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), facT = 0, frameErrs = 0, simAcc = 0, audSlow = false, audSlowT = 0;
const SIM_HZ = 240, SIM_MAX = Math.ceil(0.05 * SIM_HZ);
// rafP: the smoothed raw rAF interval. Auto and Lite throttle only real high-refresh screens (under 9.5 ms, so 120 Hz
// and up) to about 60 fps with a budget; 90 Hz, 60 Hz and slower screens draw every frame they get
let rafP = 16.7, prevRaf = 0, rafAcc = 0;
// draw cost: a frozen frame (paused, a hit-stop, the countdown) is drawn once and then left alone until something changes;
// under the cards, the shop or the result card the canvas redraws every 3rd frame; the title demo draws at 30 fps
let drawKey = '', drawAcc = 0, drawN = 0;
const CARDS_EL = $('cards');
function drawFrame(dt, ts, inRace) {
  drawAcc = Math.min(0.1, drawAcc + dt); drawN++;
  // a hit-stop or the countdown freezes the world but not the shake, the flash or the impact frame: drawn every frame at ts 0.
  // Only a pause, a card deal or an overlay on top skips the redraw until something changes
  const still = inRace && (race.paused || race.pending || !CARDS_EL.classList.contains('hide') || mode !== 'race');
  if (ts === 0 && still) {
    const key = `${race.paused ? 1 : 0}|${cv.width}x${cv.height}|${R.camY == null ? 0 : 1}|${race.over ? 1 : 0}`;
    if (key === drawKey) { drawAcc = 0; return; }
    drawKey = key;
  } else {
    drawKey = '';
    const overlay = mode === 'result' || (mode === 'race' && !CARDS_EL.classList.contains('hide'));
    if (overlay && drawN % 3) return;
    if (!overlay && race.demo && drawAcc < 1 / 30 - 0.004) return;
  }
  if (!drag || mode !== 'race') R.thumbY = null;
  R.draw(race, drawAcc, ts); drawAcc = 0;
  if (R.rivalEaten != null) { const k = R.rivalEaten; R.rivalEaten = null; rivalEatenLine(k); }
}
// frameThrowRun: frames in a row whose body threw past every inner guard; 30 of them run the drawFails rescue
let frameThrowRun = 0;
function frame(now) {
  try {
    const iv = prevRaf ? now - prevRaf : 16.7; prevRaf = now;
    if (iv > 0 && iv < 100) rafP += (iv - rafP) * 0.1;
    if (S.gfx !== 'full' && rafP < 9.5) {
      rafAcc += iv; if (rafAcc < 12.7) return;
      rafAcc = Math.min(rafAcc - 16.7, 8);
    } else rafAcc = 0;
    frameBody(now);
    frameThrowRun = 0;
  } catch (e) {
    if (frameErrs++ < 3) console.error(e);
    if (++frameThrowRun >= 30) { frameThrowRun = 0; crashOut(); }
  } finally {
    requestAnimationFrame(frame);
  }
}
function frameBody(now) {
  const t0 = performance.now();
  const raw = now - last; last = now;
  const dt = clamp(raw / 1000, 0, 0.05);
  const inRace = !!race && mode === 'race' && !race.demo;
  const live = !(inRace && race.paused);
  jumpCheck();
  if (live) clock += dt;
  frozenRecent = Math.max(0, frozenRecent - dt);
  // the finale's own timer (race clock), then the watchdog: a finished swim still on the race screen 3.5 s later goes to
  // the result card no matter what (the birth has its own, longer one)
  if (mode === 'race' && finHold && clock >= finHold.until) goResult(finHold.fin, finHold.o);
  if (mode === 'race' && race && race.over && !race.demo && !birthOn) {
    if (overAt < 0) overAt = clock;
    // never before the finale's own timer has had its turn (+1 s), so the birth beat is never skipped
    else if (clock - overAt > Math.max(3.5, finHold ? finHold.until - overAt + 1.0 : 0)) { overAt = -1; finHold = null; try { showResult(race.over); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left */ } } }
  } else if (birthOn) {
    overAt = -1;
    if (clock - birthOn.at > 9) { const b = birthOn; birthOn = null; try { showResult(b.o); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left */ } } }
  } else overAt = -1;
  // slow-mo: event hits, the first look at a hazard, and a crawl over the end of a zone when a rival is close or the combo is big.
  // The crawl has hysteresis: in at 200 px, out at 300 px (or 320 px past the line), held for at least 0.5 s.
  let want = 1;
  if (inRace && !S.reduced && !race.drill && !race.over && live) {
    const nz = ZSTART[race.zoneReached + 1], d = nz != null ? nz - race.p.y : -1;
    if (!crawlOn) { if (d > 0 && d < 240 && crawlWanted()) crawlStart(); }
    else if (clock - crawlAt >= 0.5 && (d <= 0 || d > 320 || (crawlN > 1 && race.p.combo < 25 && !rivalNear(300)))) crawlEnd(false);
    if (crawlOn) want = 0.45;
    if (hazSlowT > 0) want = Math.min(want, 0.45);
    if (lessonSlowT > 0) want = Math.min(want, 0.5);
  } else if (crawlOn && live) crawlEnd(false);
  if (live) {
    let target = want;
    if (freezeT > 0) { freezeT -= dt; target = 0.3; }
    else if (slowT > 0) { slowT -= dt; target = Math.min(target, 0.35); if (slowT <= 0 && !crawlOn) { try { A.slowmo(false); } catch (e) { /* ignore */ } } }
    // the egg drill never crawls: taps must land, so the felt slowdown is the music, the zoom and the vignette
    if (inRace && race.drill && !race.over) target = Math.max(target, 0.85);
    // ease in fast (a slow-mo hits within a few frames), ease out slower
    timeScale += (target - timeScale) * Math.min(1, dt * (target < timeScale ? 25 : 10));
    // the music follows the felt slow-mo (a crawl, a first look, a lesson beat, a hit coming back slow): in on the rising
    // edge, out on the falling one when no other slow holds it, each edge held 0.15 s so a blip never wobbles the band
    const sl = inRace && !race.over && (want < 0.9 || timeScale < 0.8);
    if (sl !== audSlow) {
      audSlowT += dt;
      if (audSlowT >= 0.15) {
        audSlow = sl; audSlowT = 0;
        try { if (sl) A.slowmo(true); else if (slowT <= 0 && freezeT <= 0 && !crawlOn) A.slowmo(false); } catch (e) { /* optional */ }
      }
    } else audSlowT = 0;
  }
  if (race) {
    // a frame where the sim, a live tick, the canvas or the HUD threw: 30 of them in a row end the swim (drawFails)
    let held = false, bad = false;
    if (inRace && live) {
      try {
        if (countT > 0) { held = true; countTick(dt); }
        else if (stopT > 0) { stopT -= dt; held = true; if (stopT <= 0) hitRelease(); }
      } catch (e) { bad = true; drawErr(e, 'simFault'); }
      if (goT > 0) { goT -= dt; if (goT <= 0) $('count').className = ''; }
      const kd = (keys.arrowleft || keys.ArrowLeft || keys.a ? -1 : 0) + (keys.arrowright || keys.ArrowRight || keys.d ? 1 : 0);
      if (!drag) {
        race.input.dir = kd;
        if (kd) { race.input.touch = false; holdOff = null; race.input.tx = null; lastInputAt = clock; }
        // the keys feel the walls too: Kevin pressed against one, the same thud or click as a finger
        if (!race.drill && race.p && !playBlocked()) {
          const p = race.p, b = band(p.y, p.side), h = kd < 0 && p.x <= b.l + 3 ? -1 : kd > 0 && p.x >= b.r - 3 ? 1 : 0;
          if (h && h !== wallSide) wallCue(h);
          else if (!h && wallSide && (wallSide < 0 ? p.x > b.l + 24 : p.x < b.r - 24)) wallSide = 0;
        }
      }
      // backstop: a steering finger that has not moved for 4 s while another finger is down is a ghost (a lost pointerup)
      if (drag && fingers.size > 1 && performance.now() - Math.max(drag.lt, dragMovedAt(drag)) > (drag.handed ? HANDED_BACKSTOP_MS : 4000)) { fingers.delete(drag.id); holdOff = drag.off; drag = null; race.input.finger = false; }
      steerTick(); holdTick(kd);
      // a slow-mo makes the same finger travel feel smaller: steering gets that much snappier (core reads input.steerK)
      race.input.steerK = race.drill || race.autopilot ? 1 : clamp(1 / Math.max(0.01, timeScale), 1, 2.2);
      if (dashBuf > 0 && !held && !race.pending) race.input.dash = true;
    }
    // fixed 240 Hz steps: up to 50 ms of sim a frame, so a 30 fps phone runs at full speed but a hitch never snowballs;
    // at most one step of remainder carries over
    // the title demo only needs 60 Hz steps (nobody is steering it)
    if (!held && live) {
      const hz = race.demo ? 60 : SIM_HZ;
      simAcc += dt * timeScale;
      const n = Math.min(Math.ceil(0.05 * hz), Math.floor(simAcc * hz));
      simAcc = clamp(simAcc - n / hz, 0, 1 / hz);
      try { for (let i = 0; i < n; i++) race.step(1 / hz); } catch (e) { bad = true; drawErr(e, 'simFault'); if (race.demo) demo(); }
    }
    if (race.demo && (race.over || race.pending)) { if (race.pending) race.choose(race.pending[0]); else demo(); }
    onEvents(); flushPasses(dt);
    if (inRace && live && !held && dashBuf > 0 && !race.pending) { dashBuf -= dt; if (dashBuf <= 0) { dashBuf = 0; if (race.p.dashCd > 0.05) refuseDash(); } }
    if (mode === 'race') {
      // the lesson clocks only run with the sim: a card deal, the countdown or a hit-stop never eats a lesson's time
      const simDt = held || race.pending ? 0 : dt;
      if (live) { try { tutTick(simDt); idleNudgeTick(simDt); ghostTick(dt); lowTick(simDt); lessonTick(simDt); hazTick(simDt); quipTick(); rivalTick(); draftTick(simDt); eggTick(); tellTick(); rematchTick(); thinkTick(); dashHoldTick(); dashPressTick(); laterTick(dt); coachCalmTick(); featTick(); forkSmellTick(); } catch (e) { bad = true; drawErr(e, 'simFault'); } }
      // (after drawHud too: the coach strip's clock runs there) swim 1's one-text rule
      try { cardYieldTick(); } catch (e) { /* only a card */ }
      try { ringApply(); } catch (e) { bad = true; drawErr(e, 'simFault'); }
      // no pause during the zone stinger and the deal (Escape is gated the same way)
      setC($('pauseBtn'), 'off', !!race.pending || revealT > 0);
      const hidden = $('cards').classList.contains('hide');
      if (race.pending && hidden) {
        // a stinger or a deal that throws takes the first card itself: the zone can never lock up behind it
        try {
          if (revealT <= 0) cardStinger();
          else { revealT -= dt; if (revealT <= 0) { revealT = 0; if (race.pending) dealCards(); } }
        } catch (e) {
          drawErr(e, 'simFault'); revealT = 0;
          try { clearTimeout(cardsTO); cardsReady = false; offerGolden = false; if (race.pending) race.choose(race.pending[0]); } catch (e2) { /* the next frame tries again */ }
          show(null); muffle(false); govHold(3);
        }
      } else if (!race.pending) revealT = 0;
      // the deal fades out, then the overlay goes; when a new deal is already pending (back to back), the stinger takes over
      if (pickT > 0) { pickT -= dt; if (pickT <= 0 && !race.paused) { show(null); if (!race.pending) govHold(3); } }
      // low energy: a heartbeat every 2 beats, every beat when it is critical
      const p = race.p;
      // (both wait out a hold: a countdown or a hit-stop is not time running out)
      if (!held) {
        if (live && !race.over && !race.drill && !race.pending && p.e < 25) {
          heartAcc += dt; const iv = (p.e < 12 ? 1 : 2) * 60 / (A.bpm || 100);
          if (heartAcc >= iv) { heartAcc = 0; sfx('lowE', p.e < 12 ? 1 : 0); }
        } else heartAcc = 0;
      }
      // the combo clock is running out: a ticking that climbs (audio keeps it on the grid)
      if (!held && live && !race.over && !race.drill && !race.pending && p.combo >= 5) {
        const f = p.comboT / (p.comboMax || 1);
        if (f < 0.25) sfx('comboLow', f);
      }
      A.combo = p.combo;
      // how fast Kevin swims, 0..1 (audio's swim bed): core's p.v / p.vMax when it has them, else forward speed over 1.5x cruise
      { const v = Math.abs(Number.isFinite(+p.v) ? +p.v : +p.vy || 0), vm = +p.vMax > 0 ? +p.vMax : race.s && race.s.speed > 0 ? race.s.speed * 1.5 : 700;
        const sp = race.over || race.paused ? 0 : clamp(v / vm, 0, 1); if (Math.abs(sp - (A.speed || 0)) > 0.01) { try { A.speed = sp; } catch (e) { /* optional */ } } }
    }
    // the result's count-up: a throw there must never leave the buttons asleep (30 bad frames wake them)
    if (mode === 'result') { try { tickResult(dt); resErrRun = 0; } catch (e) { drawErr(e, 'resultFault'); if (++resErrRun >= 30) resultWake(); } }
    if (mode === 'title') { facT += dt; if (facT >= 1) { facT = 0; idleTick(meta, Date.now()); renderFactory(); } }
    if (S.reduced) { R.shake = Math.min(R.shake, 1.5); R.flash = Math.min(R.flash, 0.15); if (R.zoomK) R.zoomK = 0; }
    R.beat = A.pulse || 0; R.reduced = S.reduced; R.noFlash = !!S.noFlash;
    threatTick(live && mode === 'race');
    // the beatbox band locks its groove to the swim (the zone's tempo), once a live frame
    if (inRace && live && !race.over && typeof A.lockPhase === 'function') {
      const z = ZONES[zoneIndex(race.p.y)];
      if (z && z.beat > 0) { try { A.lockPhase((race.t * z.beat / 60) % 1, z.beat); } catch (e) { /* optional */ } }
    }
    // paused: the world stands still (no particles, no camera drift)
    // the canvas and the HUD each fail on their own: a broken draw never takes the other down, and a swim that keeps
    // failing (30 frames in a row) ends on the result card instead of freezing
    try { drawFrame(dt, held || !live ? 0 : timeScale, inRace); } catch (e) { bad = true; drawErr(e); }
    if (mode === 'race' && !race.over) { try { drawHud(dt, live); } catch (e) { bad = true; drawErr(e); } }
    drawFails(bad, inRace);
  }
  if (inRace && live && !race.over && clock - progAt >= 5) {
    progAt = clock;
    const y0 = meta.openRun ? +meta.openRun.y || 0 : 0;
    runProgressNote();
    // saved the moment the swim passes the free-restart line (it now counts if the app dies), else every 15 s at most
    const AY = +C.ABANDON_Y || 3000, y1 = meta.openRun ? +meta.openRun.y || 0 : 0;
    if ((y0 < AY && y1 >= AY) || clock - progSaveAt >= 15) { progSaveAt = clock; save(); }
  }
  if (welcomeAnim) welcomeTick(dt);
  A.tick();
  governor(raw, performance.now() - t0);
}
// failed frames in a row; the first error of each burst is logged (a sim or tick fault tagged 'simFault', once a burst)
let failRun = 0, errLogged = false, resErrRun = 0;
function drawErr(e, tag) { if (failRun === 0 && !errLogged) { errLogged = true; if (tag) console.error(tag, e); else console.error(e); } }
// the result card's buttons wake up whatever the count-up does
function resultWake() {
  resErrRun = 0; if (resAnim) resAnim.done = true; if (resDnaShown != null) { resDnaShown = null; try { renderResUp(); } catch (e) { /* the card stays */ } }
  clearTimeout(resultTO); resultReady = true;
  for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn', 'resSeeAll']) { const b = $(id); b.classList.remove('wait'); b.classList.add('ready'); }
}
// a swim that keeps failing ends as a 'crash' (counted, pays, never charged as a quit) on the result card
function drawFails(bad, inRace) {
  if (!bad) { failRun = 0; errLogged = false; return; }
  failRun++;
  if (failRun < 30 || !inRace || mode !== 'race' || !race || race.demo) return;
  failRun = 0;
  crashOut();
}
// the rescue: a live swim ends as a 'crash' on the result card; anywhere else the title comes back
function crashOut() {
  try {
    if (mode === 'race' && race && !race.demo) {
      if (!race.over) { race.paused = false; race.ending = false; race.end('crash'); }
      try { onEvents(); } catch (e) { /* the card still shows */ }
      finHold = null; birthOn = null;
      if (!race.over) throw new Error('no result');
      showResult(race.over);
    } else title();
  } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left */ } }
}
// a hold just ended: a big one (60 ms+) comes back in slow-mo that the easer pulls up, and the hit's kick lands now
const SLOW_BACK = new Set(['frenzy', 'milestone', 'shieldHit', 'second', 'kevin', 'trick']);
// a trick streak's pop and sting, waiting for the trick's hold to let go
let trickStreakPend = null;
let hitReleaseN = 0;
function hitRelease() {
  hitReleaseN++;
  const h = hitHold; hitHold = null; stopT = 0;
  if (trickStreakPend) { const f = trickStreakPend; trickStreakPend = null; f(); }
  // the swim is over (Kevin's last frame): the gasp lets go softly (under 60 ms: no snap), whatever held
  if (race && race.over) { try { if (A.impactRelease) A.impactRelease(59); } catch (e) { /* optional */ } }
  if (!h) return;
  // the band's gasp lets go on the same frame the world moves again
  if (h.ms >= 60 && !(race && race.over)) { try { if (A.impactRelease) A.impactRelease(h.ms); } catch (e) { /* optional */ } }
  // a big hold comes back slow, by its kind: being hit resumes at once (no mush), a payoff eases out of 0.8, the big
  // moments out of 0.35; a non-essential slow-back skips once the slow-mo budget is spent
  if (h.ms >= 60 && race && !race.drill && !S.reduced && !HIT_SNAP.has(h.kind)) {
    // (a finisher comes back slow from grade 3: the BANKED pop is the 60 + 15 * grade ms hold)
    const big = SLOW_BACK.has(h.kind) || (h.kind === 'finisher' && h.ms >= 60 + 15 * 3), to = big ? 0.35 : 0.8;
    if (big || slowBudget(0.25)) timeScale = Math.min(timeScale, to);
  }
  if (h.dx || h.dy) kick(h.dx, h.dy);
}
// hits that resume at full speed, and the slow-mo budget: 2.0 s of slow calls per rolling 8 s
const HIT_SNAP = new Set(['bonk', 'bump', 'swat', 'shove', 'break', 'player', 'death']);
let slowLog = [];
function slowBudget(sec) {
  slowLog = slowLog.filter((x) => clock - x.at < 8);
  const used = slowLog.reduce((a, x) => a + x.sec, 0);
  if (used + sec > 2.0) return false;
  slowLog.push({ at: clock, sec }); return true;
}
// the cilia tremble before they swat: a fizz from their wall when one starts, up to 500 px ahead
function tellTick() {
  if (!race || race.over || race.drill || race.pending) return;
  const p = race.p; let said = false;
  for (const e of race.ents) {
    // a goo gate's first 500 px ahead: a cue panned toward its nearest gap (a sliding gate has its own), once a gate
    if (e.t === 'gate') {
      if (e._gn || e.dead) continue;
      const dy = e.y - p.y; if (dy <= 0 || dy > 500) continue;
      if (e.side && p.side && e.side !== p.side) continue;
      e._gn = true;
      const gx = Array.isArray(e.gaps) && e.gaps.length ? e.gaps.reduce((a, g) => (Math.abs(g - p.x) < Math.abs(a - p.x) ? g : a), e.gaps[0]) : e.x;
      sfx(e.slide ? 'gateNearSlide' : 'gateNear', clamp((gx - p.x) / 200, -1, 1));
      continue;
    }
    if (e.t !== 'cilia') continue;
    const st = e.state | 0, was = e._ps; e._ps = st;
    if (st !== 1 || was === 1 || was == null || said) continue;
    const dy = e.y - p.y; if (dy < 0 || dy > 500) continue;
    if (e.side && p.side && e.side !== p.side) continue;
    said = true; sfx('tell', e.wall);
  }
}
addEventListener('resize', () => { landCheck(); measureSafeB(); R.resize(); R.textScale = textScaleNow(); measureHud(); measureBar(); if (H.combo) H.combo._sw = null; govReset(); govHold(3); drawKey = ''; });
applyGfx();
if (meta.runs >= 15 && !S.seenHaz.length && !S.tutReplay) { S.seenHaz = Object.keys(HAZARD_INTRO); saveUI(); }
syncMute();
const bootAway = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
// a swim left open by an app that was killed mid-tube: counted (systems: C.settleAbandoned), the streak said goodbye.
// Only the tab that owns the save settles it: a second tab must never close the first one's live swim
function bootSettle() {
  try {
    const ab = typeof C.settleAbandoned === 'function' ? C.settleAbandoned(meta, Date.now()) : null;
    if (ab) {
      save(); refreshOpen();
      if (ab.forgiven) setTimeout(() => toast(K.ABANDON_FORGIVEN_LINE || 'Your phone napped mid-swim. Streak kept.', 3200), 400);
      else if (ab.counted) {
        // a streak freeze is held: the toast never says the streak reset
        const frz = (+meta.streakFreeze || 0) > 0, pool = (K.ABANDONED_LINES || []).filter((l) => !frz || !/streak reset/i.test(l));
        const ln = (pool.length ? pickLine(pool) : '') || (frz ? 'Last swim was abandoned mid-tube. Your freeze is safe.' : 'Last swim was abandoned mid-tube. Streak reset.');
        setTimeout(() => toast(ln, 3200), 400);
      }
    }
  } catch (e) { /* optional */ }
}
{
  // a lock request that never answers (an odd browser) must not leave the save unwritten: 600 ms, then this tab owns it
  let settled = false;
  const go = (ok) => { if (settled) return; settled = true; ownResult(ok); if (ok) bootSettle(); };
  acquireTab(false).then(go, () => go(true));
  setTimeout(() => go(true), 600);
}
$('staleBtn').onclick = claimTab;
title();
maybeWelcome(bootAway);
requestAnimationFrame(frame);
