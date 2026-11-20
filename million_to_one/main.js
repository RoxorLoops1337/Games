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
const GEN_INTROS_ENDLESS = K.GEN_INTROS_ENDLESS || [], FINALE_LINES = K.FINALE_LINES || [], DYNASTY_STAMP = K.DYNASTY_STAMP || '', MUT_FLAVOR = K.MUT_FLAVOR || {};
const reactsOf = (name) => RIVAL_REACTS[name] || RIVAL_REACTS[first(name)] || Object.keys(RIVAL_REACTS).reduce((o, k) => o || (first(k) === first(name) ? RIVAL_REACTS[k] : null), null) || {};
const byFirst = (tbl, name) => (tbl[name] != null ? tbl[name] : Object.keys(tbl).reduce((o, k) => (o != null ? o : first(k) === first(name) ? tbl[k] : null), null));
const POP = (key, fb) => pickLine(POP_LINES[key]) || fb;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
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
// the factory keeps its own clock: idleTick moves lastSeen, save never touches it
const save = () => { try { idleTick(meta, Date.now()); localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------------ settings (own key: loadMeta drops unknown fields)
const UI_KEY = 'million_to_one_ui';
let prefersReduced = false;
try { prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
const S = { music: true, sfx: true, mvol: 1, svol: 1, haptics: true, reduced: false, redSet: false, tutDone: false, tutTries: 0,
  sens: 1.6, lefty: false, q: 1, qT: 0, qs: 0, gfx: 'auto', frenzySeen: false, bestGap: 0, tutSkipped: [], seenHaz: [], revealSeen: false,
  lowSeen: 0, streakLostDay: -1, welcomeAt: 0, genIntroSeen: 0, cashHint: false, finaleSeen: false, dynastySeen: false,
  cashDone: false, cashN: 0, drillSeen: false, tutReplay: false, zoneFirst: [], zoneLoss: [], clues: [] };
try { const o = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (o && typeof o === 'object') for (const k of Object.keys(S)) if (typeof o[k] === typeof S[k]) S[k] = o[k]; } catch (e) { /* ignore */ }
// an explicit choice wins, otherwise follow the system setting
if (!S.redSet) S.reduced = prefersReduced;
// steering got finger acceleration: the old steps map onto the new ones
{ const SENS_MAP = { 1: 1.2, 1.35: 1.6, 1.8: 2.1 }; if (SENS_MAP[S.sens]) S.sens = SENS_MAP[S.sens]; if (![1.2, 1.6, 2.1].includes(S.sens)) S.sens = 1.6; }
if (!Array.isArray(S.tutSkipped)) S.tutSkipped = [];
if (!Array.isArray(S.seenHaz)) S.seenHaz = [];
for (const k of ['zoneFirst', 'zoneLoss', 'clues']) if (!Array.isArray(S[k])) S[k] = [];
if (!['auto', 'full', 'lite'].includes(S.gfx)) S.gfx = 'auto';
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
// players who already swam before the tutorial existed do not need it
if (meta.runs > 0 && !S.tutDone && !S.tutTries) { S.tutDone = true; saveUI(); }

function applyAudio() {
  try { A.setMuted(meta.muted); A.setMusicVol(S.mvol); A.setSfxVol(S.svol); A.setMusicMuted(!S.music); A.setSfxMuted(!S.sfx); } catch (e) { /* older audio */ }
  try { if (A.setCalm) A.setCalm(!!S.reduced); } catch (e) { /* optional */ }
}
function unlock() {
  A.unlock();
  if (A.ctx && (A._suspended || A.ctx.state === 'suspended')) { try { A.resume(); } catch (e) { /* ignore */ } }
}
const muffle = (on) => { try { A.setMuffle(on); } catch (e) { /* optional */ } };
// win, lose, frenzy and comboBreak also change the music (key, tempo, a dry beat), so they reach audio.js even with
// sound effects off: setSfxMuted already silences the sfx bus there.
const SFX_STATEFUL = new Set(['win', 'lose', 'frenzy', 'comboBreak', 'comboMilestone', 'comboLow', 'finale', 'backflow']);
const sfx = (n, k) => { if (S.sfx || (SFX_STATEFUL.has(n) && A.setSfxMuted)) { try { A.sfx(n, k); } catch (e) { /* never let a sound break a frame */ } } };
function menuMusic() { if (A.on) A.intensity = 0.3; setTension(0); slowmoReset(); }
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
  // the egg finale: a tap after the first 0.8 s goes straight to the result card
  if (mode === 'race' && finHold) finishSkip();
  if (!A.on) { A.on = true; if (mode !== 'race') A.intensity = 0.3; }
}, { capture: true });

// haptics: tiny, throttled, guarded
let lastBuzz = 0;
function buzz(pat, force) {
  if (!S.haptics || !navigator.vibrate) return;
  const now = performance.now(); if (!force && now - lastBuzz < 70) return; lastBuzz = now;
  // every buzz is at least 12 ms: shorter ones do nothing on most phones (pauses in a pattern stay as they are)
  const v = Array.isArray(pat) ? pat.map((x, i) => (i % 2 ? x : Math.max(12, x | 0))) : Math.max(12, pat | 0);
  try { navigator.vibrate(v); } catch (e) { /* not allowed */ }
}
// camera feel
const trauma = (a, dx, dy) => { if (R.addTrauma) R.addTrauma(S.reduced ? a * 0.3 : a, dx, dy); else R.shake = Math.max(R.shake, a * 14); };
const kick = (dx, dy) => { if (R.kick && !S.reduced) R.kick(dx, dy); };

let race = null, mode = 'title', timeScale = 1, slowT = 0, shownRank = TOTAL_SWIMMERS, hintT = 0, prevBest = TOTAL_SWIMMERS;
let clock = 0, stopT = 0, freezeT = 0, countT = 0, goT = 0, lastSlowAt = -99, lastPopStop = -99, kevinN = 1, firstSwim = false, raceT0 = 0;
window.game = { get race() { return race; }, get meta() { return meta; }, get settings() { return S; } };

// a demo race runs behind the title screen
function demo() { race = new Race(newMeta(), Math.random, { autopilot: true }); race.demo = true; R.camY = null; }

const OVERLAYS = ['title', 'intro', 'cards', 'result', 'shop', 'album', 'pause', 'settings', 'welcome'];
function show(id) { if (id !== 'title' && R.titleHero) R.titleHero(false); for (const o of OVERLAYS) $(o).classList.toggle('hide', o !== id); if (id !== 'cards') $('cards').classList.remove('out'); $('ver').classList.toggle('hide', id !== 'title'); }
function hud(on) {
  for (const id of ['hud', 'dashBtn', 'pauseBtn']) $(id).classList.toggle('hide', !on);
  // body.racing re-anchors the hint and the toast under the HUD; body.egg hides the coach strip under the egg panel
  document.body.classList.toggle('racing', !!on);
  if (!on) {
    setC(document.body, 'egg', false); setC($('pauseBtn'), 'off', false); lessonEnd();
    $('combo').style.opacity = 0; H.combo._op = 0; setC(document.body, 'comboOn', false); setC(DU.ui, 'hide', true); tutHide(); coClear();
    coachClear(); $('hint').style.opacity = 0; $('count').className = ''; setC($('tutTarget'), 'hide', true); dashHoldEnd();
  } else requestAnimationFrame(measureHud);
}
// --hudB: where the HUD ends (the coach strip and banners sit under it); the renderer keeps threats out from under it too
function measureHud() {
  const h = $('hud'), hh = h.offsetHeight; if (!hh) return;
  document.documentElement.style.setProperty('--hudB', hh + 'px');
  // in landscape the HUD is a side gutter, so nothing in the tube is under it
  const land = landscape();
  R.padTop = land ? 0 : hh;
  // the bottom: the combo strip while it shows, otherwise the room it keeps (safe area + 104 px). Landscape: a gutter again.
  const cb = $('combo'), r = cb.getBoundingClientRect(), ab = APP.getBoundingClientRect().bottom;
  R.padBot = land ? 0 : Math.max(0, Math.round(ab - (H.combo._op === 1 ? r.top : r.bottom)));
  // the egg zone: the duel panel sits low (above the DASH row), so Kevin is framed above it
  if (!land && document.body.classList.contains('egg') && !DU.ui.classList.contains('hide')) { const dr = DU.ui.getBoundingClientRect(); if (dr.height) R.padBot = Math.max(R.padBot, Math.round(ab - dr.top + 6)); }
  document.documentElement.style.setProperty('--padBot', R.padBot + 'px');
  measureBankTarget();
  // rival name tags: a row is only used when it has room, so a tag never runs into the rank, the gas bar or the chips
  const pr = $('prog').getBoundingClientRect(), rr = $('rankRow').getBoundingClientRect(), er = $('energyRow').getBoundingClientRect(), mr = $('mutRow').getBoundingClientRect();
  const below = Math.min(er.top, mr.height > 0 ? mr.top : 1e9);
  tagRowOk[0] = pr.top - rr.bottom >= 9;
  // the lower row's tag (from 9 px to 22 px under the bar's top) keeps 4 px off the gas bar and the mutation chips
  tagRowOk[1] = below - pr.top >= 26;
  if (!tagRowOk[0] && !tagRowOk[1]) tagRowOk[0] = true;
}
let tagRowOk = [true, true];
// banked helices fly to the HUD's DNA counter (logical screen units, as the renderer wants them)
function measureBankTarget() {
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
const LAND_MQ = (() => { try { return matchMedia('(orientation:landscape) and (max-height:520px)'); } catch (e) { return null; } })();
const landscape = () => (LAND_MQ ? LAND_MQ.matches : innerWidth > innerHeight && innerHeight <= 520);
if (LAND_MQ) { const f = () => requestAnimationFrame(() => { if (mode === 'race') measureHud(); }); if (LAND_MQ.addEventListener) LAND_MQ.addEventListener('change', f); else if (LAND_MQ.addListener) LAND_MQ.addListener(f); }

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
  const n = affordable().length;
  for (const id of ['shopBtn', 'resShopBtn']) {
    const b = $(id); let c = b.querySelector('.cnt');
    if (!n) { if (c) c.remove(); continue; }
    if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); }
    c.textContent = n;
  }
}
function habitQuip(id) {
  const q = HABIT_QUIPS[id]; if (!q || !q.length) return '';
  const l = lv(meta, id), m = habMax(id);
  return q[l >= m ? q.length - 1 : l >= m / 2 ? Math.min(1, q.length - 1) : 0];
}
function buy(id) {
  if (!buyHabit(meta, id)) { buzz(6); return false; }
  sfx('buy'); buzz(15); save();
  const q = habitQuip(id); toast(HABITS[id].icon + ' ' + (q || HABITS[id].name + ' levelled up!'));
  badges();
  return true;
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
function title() {
  mode = 'title'; demo(); hud(false); show('title'); muffle(false); menuMusic(); govHold(3);
  save();
  titleStats(); renderFactory();
  // the very first visit: just the story and one big SWIM button; the rest opens up after the first swim
  const fresh = meta.runs === 0;
  $('title').classList.toggle('fresh', fresh);
  // art's idle Kevin with his #1,000,000 bib, drawn into his own canvas above the logo on the very first visit
  if (R.titleHero) R.titleHero(fresh && innerHeight > 600, $('heroCv'));
  // after the first visit the subtitle rotates through the taglines (the story line stays for the very first look)
  const tl = !fresh && K.TITLE_TAGLINES && K.TITLE_TAGLINES.length ? fillLine(pickLine(K.TITLE_TAGLINES), { n: fmt(kevinNo()) }) : '';
  if (tl) setT($('titleSub'), tl); else { const ts = $('titleSub'); ts._v = null; ts.innerHTML = '1,000,000 swimmers. 1 egg.<br>You start dead last.'; }
  // the bounty the last swim promised
  const gl = fresh ? '' : nextGoalLine(meta.goal);
  setT($('titleGoal'), gl ? '🎯 ' + gl : ''); setC($('titleGoal'), 'hide', !gl);
  $('autoWrap').classList.toggle('hide', !lv(meta, 'gps')); $('autoChk').checked = meta.autopilot;
  const daily = typeof C.dailySeed === 'function';
  $('dailyBtn').classList.toggle('hide', !daily || meta.runs < 1);
  setC($('dailyBtn'), 'pulse', false);
  if (daily) {
    const today = C.dailySeed(), n = streakOf(), done = meta.dailyDay === today, now = Date.now();
    const alive = n > 0 && (typeof C.streakAlive === 'function' ? C.streakAlive(meta, now) : meta.dailyLastDay >= today - 1), best = +meta.bestStreak || 0;
    let sub;
    if (alive && !done && STREAK_NUDGE.length) { sub = fillLine(STREAK_NUDGE[today % STREAK_NUDGE.length], { n }); setC($('dailyBtn'), 'pulse', true); }
    else if (alive) sub = `🔥 ${n} day streak` + (done && meta.dailyBest < TOTAL_SWIMMERS ? ' · today #' + fmt(meta.dailyBest) : '');
    else if (n > 0 && (DAILY_LINES.lost || []).length && (S.streakLostDay === -1 || S.streakLostDay === today)) {
      // a streak that died: said once, on the day you come back
      sub = DAILY_LINES.lost[today % DAILY_LINES.lost.length];
      if (S.streakLostDay !== today) { S.streakLostDay = today; saveUI(); }
    } else sub = done && meta.dailyBest < TOTAL_SWIMMERS ? 'today: #' + fmt(meta.dailyBest) : 'same tube for everyone today';
    if (alive && !done && n > 0) S.streakLostDay = -1;
    if (best > 1) sub += ` · best ${best}`;
    // a week of pips (day 7 pays double), what the next counted daily pays, and when the next tube opens
    const pos = alive && n > 0 ? ((n - 1) % 7) + 1 : 0;
    const pips = Array.from({ length: 7 }, (_, i) => `<i class="${i < pos ? 'on' : ''}${i === 6 ? ' x2' : ''}"></i>`).join('');
    const bonus = typeof C.dailyBonusFor === 'function' ? C.dailyBonusFor(done ? n + 1 : alive ? n + 1 : 1, meta.gen) : 0;
    const left = (today + 1) * 86400000 - now;
    const nxt = (bonus > 0 ? `${done ? 'Tomorrow' : 'Today'}: +${fmt(bonus)} DNA` : '') + (done ? `${bonus > 0 ? ' · ' : ''}next tube in ${hm(left / 3600000)}` : '');
    const rule = dailyRuleShort(today), tier = dailyMedalToday(today);
    const medals = [1, 2, 3].map((m) => `<i class="m${m}${tier >= m ? ' on' : ''}">${tier >= m ? MEDAL_IC[m] : ''}</i>`).join('');
    $('dailyBtn').innerHTML = `Daily Swim 📅 ${rule ? `<small class="drule">${esc(rule)}</small>` : ''}<small>${esc(sub)}</small><span class="dpips">${pips}</span><span class="dmed" aria-label="today's medal">${medals}</span>${nxt ? `<small class="dnx">${esc(nxt)}</small>` : ''}`;
  }
  const seen = (meta.synergiesSeen || []).length;
  $('albumBtn').innerHTML = `Baby Album 👶 <small>${meta.babies.length} babies · Mashups ${seen}/${SYNERGIES.length}</small>`;
  const reveal = !fresh && !S.revealSeen;
  newBadge($('shopBtn'), reveal); newBadge($('albumBtn'), reveal);
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
  setT($('wbAway'), 'You were away for ' + hm(h));
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
let introTO = 0;
function intro(done, lines = INTRO) {
  mode = 'intro'; show('intro'); let i = 0; setC($('introHint'), 'pulse', false);
  const end = () => { clearTimeout(introTO); $('intro').onclick = null; $('introSkip').onclick = null; if (lines === INTRO) meta.introSeen = true; save(); done(); };
  const next = () => {
    clearTimeout(introTO);
    if (i >= lines.length) return end();
    const t = lines[i++], el = $('introTxt');
    el.textContent = t; el.classList.toggle('big', t === 'SWIM.' || t === 'Dead last.' || t === 'NEW GENERATION');
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    sfx('tap', i / lines.length);
    // from the second line on, a pulsing "tap" says the story can be hurried along
    setC($('introHint'), 'pulse', i >= 2);
    introTO = setTimeout(next, t.length <= 16 ? 800 : t.length <= 40 ? 1300 : 2000);
  };
  $('intro').onclick = next;
  $('introSkip').onclick = (e) => { e.stopPropagation(); end(); };
  next();
}
// after a win: NEW GENERATION in 3 beats, then that generation's own little story (GEN_INTROS)
function genStory() {
  if (!(meta.gen >= 1) || (S.genIntroSeen | 0) >= meta.gen) return null;
  const bs = (meta.babies || []).filter((x) => x && !x.practice), b = bs[bs.length - 1]; if (!b) return null;
  const gf = (g) => (typeof C.genFactor === 'function' ? C.genFactor(g) : 1 + 0.25 * g);
  const fw = firstWord(b), out = ['NEW GENERATION'];
  out.push(`${b.name}${fw ? '. First words: ' + fw : ''}`);
  // the DNA multiplier jump is shown on the result screen, where the numbers live
  out.push(pickLine(GEN_UNLOCK_LINES) || 'A new generation!');
  // what the new generation changes in the tube (one line)
  const GS = K.GEN_STEP_LINES || {}, step = meta.gen === 1 ? GS.hazGen : meta.gen === 2 ? GS.chaseOn : GS.genFaster;
  if (step) out.push(step);
  out.push(`${b.name} grew up. Their Kevins are lining up.`);
  // index 0 is generation 2 (the hero is generation 1); from generation 11 the endless pool cycles
  const gn = meta.gen + 1, v = { heir: heirName() || b.name, grandad: bs.length >= 2 ? bs[bs.length - 2].name : 'Dad', gen: gn };
  let gi = GEN_INTROS[meta.gen - 1];
  if (!Array.isArray(gi) && gn >= 11) gi = GEN_INTROS_ENDLESS.length ? GEN_INTROS_ENDLESS[(gn - 11) % GEN_INTROS_ENDLESS.length] : GEN_INTROS[GEN_INTROS.length - 1];
  if (Array.isArray(gi)) for (const l of gi) out.push(fillLine(l, v));
  // nine generations: the finale, once ever
  if (meta.gen >= 9 && !S.finaleSeen && FINALE_LINES.length) { S.finaleSeen = true; saveUI(); for (const l of FINALE_LINES) out.push(l); }
  return out;
}
function launch(opts) {
  const gs = genStory();
  if (gs) { S.genIntroSeen = meta.gen; saveUI(); intro(() => start(opts), gs); }
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
  runOpts = opts || {};
  try { A.newRun(); } catch (e) { /* optional */ }
  muffle(false); setTension(0);
  const o = { autopilot: meta.autopilot && lv(meta, 'gps') > 0 };
  if (runOpts.daily && typeof C.dailySeed === 'function') o.seed = C.dailySeed();
  race = new Race(meta, Math.random, o);
  R.camY = null; R.parts = []; R.pops = []; if (R.rings) R.rings = [];
  kevinN = kevinNo(); firstSwim = meta.runs === 0; raceT0 = clock;
  shownRank = race.rank; prevBest = meta.best; prevBestCombo = meta.bestCombo || 0;
  stopT = 0; freezeT = 0; slowT = 0; timeScale = 1; dashBuf = 0; heartAcc = 0; lastShout = 0; lastSlowAt = -99; lastBubble = -99;
  passedOnce = new Set(); rivalIntro = RIVALS.map(() => false); eggClaimed = false; eggOn = false; rivalF = 0; rivalK = -1; drillN = 0; quip = { zi: -1, done: 0 };
  nemAtStart = nemesisOf();
  simAcc = 0; coreHas = {}; shoveAt = {}; bonkN = 0; lowDone = false; lowRingT = 0; hazT = 0; hazSlowT = 0; hazAt = -99; crawlOn = false; threatSaid = false; leadSaid = 0;
  tut = null; clearInput(); resetHud();
  crawlN = 0; crawlAt = -99; nearAt = []; kevLeadFx = false; kindPopT = -9; fruitN = 0; paceSaid = false; paceV = null; vEma = 0; tierTagSaid = false;
  lessonEnd(); cashLast = -99; wallSide = 0; goalHit = false; hazPend = null;
  overAt = -1; finHold = null; frozenRecent = 0; finPopUntil = -99; laterQ = []; comboSeenAt = -1; comboIntroDone = false; threatOnB = false; intenseOn = false;
  synHoldAt = -1; drillTapLog = []; drillCounted = 0; gaspDone = false; photoDone = false; tellOn = 0; lastDrillTapId.clear(); dnaHudV = -1;
  setC(document.body, 'threat', false); setC(document.body, 'intense', false); setC($('dnaHud'), 'hide', true);
  R.teach = meta.runs < 3;
  // the OS back swipe pauses the swim instead of leaving the page
  try { if (!(history.state && history.state.mto)) history.pushState({ mto: 1 }, ''); } catch (e) { /* sandboxed */ }
  mode = 'race'; show(null); hud(true);
  // the very first swim: a quick 2, 1, GO (0.6 s a number)
  countT = runOpts.countdown ? (firstSwim ? 1.2 : 1.8) : 0; goT = 0; lastCount = 0; ghostT = 0;
  govHold(3); setIntensity();
  R.nemesis = nemAtStart; measureHud();
  // the first swim keeps the GO frame clean: no threat line (and no threat banner later), one short caption
  const tk = firstSwim ? null : threatName();
  // the bounty goes on the zone 1 banner; when it takes the line, the threat gets its own banner when it shows up
  const gl = firstSwim ? '' : nextGoalLine(meta.goal);
  callout('zone', { t: ZONES[0].name, z: `${kevinLabel()} · ${race.daily != null ? 'DAILY SWIM · ' : ''}ZONE 1`, c: gl ? '🎯 ' + gl : tk ? threatLine(tk) : null, sec: firstSwim ? 1.2 : gl || tk ? 2.6 : 1.8 });
  if ((tk && !gl) || firstSwim) threatSaid = true;
  goalPill();
  const tired = !firstSwim && race.daily == null && (meta.raceLosses | 0) > 0;
  // swim 1: the minimap pips, the name tags and the distance text wait until the lesson is over
  setC(document.body, 'tutHud', false); setC(document.body, 'hudIn', false);
  if (!S.tutDone && !race.autopilot) {
    tutStart();
    if (firstSwim) setC(document.body, 'tutHud', true);
    // the first swim: no launch line, the steering card and the ghost finger say it all
    if (firstSwim) { tutNext(); ghostT = 1.2; }
    else coach(zoneCoach('launch'), 4.5, 1);
  }
  else if (race.autopilot) hint('Autopilot is ON. Sit back. Tap DASH if you like.', 4, 1);
  // the named rivals were eased off after a loss to them: say so, it is a reason to go again (it wins over the early hint)
  else if (tired) coach(K.RIVALS_TIRED || 'The big names look tired today. Pounce!', 3.4, 1, true);
  else if (meta.runs < 3) hint(touchUsed ? K.START_HINT || 'Drag to steer. Tap DASH to zoom.' : K.START_HINT_KEYS || K.START_HINT || 'Arrows steer. SPACE to zoom.', 4, 1);
  else coach(zoneCoach('launch'), 3);
}

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
let coachT = 0, coachPri = -1, coachLong = false;
// a #tut card (a tutorial step or a lesson) is up: only priority 2 lines may talk over it
const tutCardUp = () => (!!tut && tut.on && tut.i >= 0) || !!lesson;
function coach(t, sec = 3.2, pri = 0, force = false) {
  if (!t) return false;
  if (!force && pri < 2 && tutCardUp()) return false;
  if (coachT > 0 && pri < coachPri) return false;
  const c = $('coach'); setT(c, t); c.classList.add('on'); coachT = sec; coachPri = pri; coachLong = false; return true;
}
function hint(t, sec = 3, pri = 0) {
  if (eggOn && pri < 2) return false;
  if (tut && tut.on && pri < 2) return false;
  return coach(t, sec, pri);
}
function coachClear() { coachT = 0; coachPri = -1; coachLong = false; $('coach').classList.remove('on'); }

// Kevin's number counts from the start of this generation when there is an heir
// the heir is the newest real (not practice) baby: core's meta.heir / meta.genRunStart when it keeps them, else read off the album
const lastHeir = () => { const bs = meta.babies || []; for (let i = bs.length - 1; i >= 0; i--) if (bs[i] && !bs[i].practice) return bs[i]; return null; };
const heirName = () => { const h = meta.heir != null && meta.heir !== '' ? meta.heir : lastHeir(); return h ? String(typeof h === 'object' ? h.name || '' : h) : ''; };
function kevinNo() {
  const lh = lastHeir(), gs = Number.isFinite(+meta.genRunStart) && meta.genRunStart != null ? +meta.genRunStart : lh ? lh.run | 0 : 0;
  return Math.max(1, meta.runs - (heirName() && gs <= meta.runs ? gs : 0) + 1);
}
// the heir's last word is the family name: KEVIN #3 · TEAM PICKLE
function kevinLabel() {
  const h = heirName().trim(), fam = h ? h.split(/\s+/).pop().replace(/[^\p{L}\p{N}'-]/gu, '') : '';
  return `KEVIN #${fmt(kevinN)}` + (fam ? ` · TEAM ${fam.toUpperCase()}` : '');
}
// the rival core picked as this swim's threat (race.threatK), named in the zone 1 banner
let threatSaid = false;
function threatName() { const k = race && Number.isInteger(race.threatK) ? race.threatK : -1; return k >= 0 && RIVALS[k] ? RIVALS[k].name : null; }
function threatLine(name) { const nem = nemesisOf(); return nem === first(name) ? `Your nemesis ${first(name)} is in this swim.` : `Watch out: ${first(name)} is in this swim.`; }

// ------------------------------------------------------------------ callouts: ONE queue for banners and milestones
const PRI = { drill: 5, synergy: 4, eggClaim: 4, goal: 3, event: 3, zone: 2, milestone: 1 };
let coCur = null, coQ = [];
function callout(kind, o) {
  o.kind = kind; o.pri = PRI[kind] || 2; o.at = clock; o.sec = o.sec || (o.c ? 2.2 : 1.6);
  // a mid-race MASHUP waits (2.5 s at most) until nothing hostile is within 900 px ahead: never a banner over a threat
  if (kind === 'synergy' && !o.held && race && !race.demo && hostileAhead(900)) { o.held = true; synWait.push(o); if (synHoldAt < 0) synHoldAt = clock; return; }
  if (!coCur) return coShow(o);
  if (o.pri > coCur.pri && coCur.shown > 0.35) { coEnd(); return coShow(o); }
  coQ.push(o); coQ.sort((a, b) => b.pri - a.pri || a.at - b.at); if (coQ.length > 5) coQ.length = 5;
}
function coShow(o) {
  coCur = o; o.shown = 0; o.left = o.sec;
  if (o.kind === 'milestone') {
    const rr = $('rankRow'); setT($('rankLbl'), o.t); rr.style.setProperty('--mc', o.col || '#ffd75c');
    rr.classList.remove('ms'); void rr.offsetWidth; rr.classList.add('ms'); o.left = Math.min(o.sec, 1.4);
    return;
  }
  const b = $('banner');
  // a new MASHUP banner wipes the coach strip: one text at a time
  if (o.kind === 'synergy') coachClear();
  // mid-combo, in FRENZY or at the egg nobody reads: one short line, no kicker, no caption, gone in 1.4 s.
  // In the egg zone, at a drill or a claim the banner also moves up under the HUD with no box, so Kevin stays clear
  const p = race && race.p, eggish = !!p && !!race && (zoneIndex(p.y) === C.EGG_I || !!race.drill || eggOn);
  const intense = !!p && (p.combo >= 10 || p.frenzyT > 0 || eggish);
  b.classList.toggle('top', eggish);
  const t = intense && o.short ? o.short : o.t, c = intense ? '' : o.short || o.c || '';
  if (intense) o.left = Math.min(o.left, 1.4);
  b.querySelector('.t').textContent = t; b.querySelector('.z').textContent = (intense || eggOn) && !o.zKeep ? '' : o.z || ''; b.querySelector('.c').textContent = c;
  b.querySelector('.c').style.display = c ? '' : 'none';
  b.classList.toggle('intense', intense);
  b.classList.toggle('red', o.kind === 'eggClaim' || !!o.red); b.style.setProperty('--bc', o.col || '#ff5c7a');
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  // the full rule follows on the coach strip, but only when there is a moment to read it
  if (o.long && o.long !== c && p && p.combo < 10 && !eggOn) o.coachLong = true;
}
function coEnd() {
  if (!coCur) return;
  if (coCur.coachLong && race && race.p.combo < 10 && !eggOn && coach(coCur.long, clamp(1.6 + coCur.long.length * 0.035, 2.2, 3.4), 1)) coachLong = true;
  if (coCur.kind === 'milestone') { $('rankRow').classList.remove('ms'); setT($('rankLbl'), 'YOUR PLACE'); }
  else $('banner').classList.remove('on');
  coCur = null;
}
function coTick(dt) {
  if (coCur) { coCur.shown += dt; coCur.left -= dt; if (coCur.left <= 0) coEnd(); }
  if (!coCur && coQ.length) { coQ = coQ.filter((q) => q.keep || clock - q.at < 2); const n = coQ.shift(); if (n) coShow(n); }
  // held MASHUP banners go out once the lane is clear (or after 2.5 s)
  if (synWait.length && (!race || !hostileAhead(900) || clock - synHoldAt >= 2.5)) { const w = synWait; synWait = []; synHoldAt = -1; for (const o of w) { o.at = clock; callout('synergy', o); } }
}
function coClear() { coQ = []; synWait = []; synHoldAt = -1; coEnd(); }
let synWait = [], synHoldAt = -1;
// a zone banner; the first ever arrival in zones 2 to 7 tells its little story (K.ZONE_FIRST): three short beats of 1.4 s,
// the first one in place of the subtitle
function zoneArrive(zi, o) {
  const z = ZONES[zi], lines = z && zi >= 1 && zi <= 6 && K.ZONE_FIRST ? K.ZONE_FIRST[z.id] : null;
  if (race && !race.demo && Array.isArray(lines) && lines.length && !S.zoneFirst.includes(z.id)) {
    S.zoneFirst.push(z.id); saveUI();
    lines.slice(0, 3).forEach((l, i) => callout('zone', i ? { t: o.t, z: o.z, c: l, sec: 1.4, keep: true } : Object.assign({}, o, { c: l, sec: 1.4, keep: true })));
    return;
  }
  callout('zone', o);
}
// the threat lane: a hostile within range ahead of Kevin, with the same filter the renderer's edge warnings use
// (Big Macros anywhere, acid and goo only in Kevin's lane, goo gates on his side of the fork)
function hostileAhead(range) {
  if (!race || !race.p) return false;
  const p = race.p;
  for (const e of race.ents) {
    if (e.dead) continue;
    const dy = e.y - p.y; if (dy <= 0 || dy > range) continue;
    if (e.t === 'gate') { if (e.side && p.side && e.side !== p.side) continue; return true; }
    if (e.t === 'wbc') return true;
    if ((e.t === 'acid' || e.t === 'goo') && Math.abs(e.x - p.x) <= (e.r || 0) + 60) return true;
  }
  return false;
}
const bannerUp = () => !!coCur && coCur.kind !== 'milestone';

// ------------------------------------------------------------------ first-run tutorial (never blocks: every step times out)
// A step is only credited once its card has been shown; a step the swim never got to is 'pre' (queued for next time), not 'skip'.
const TUT_ALL = {
  steer: { id: 'steer', ic: '👆', to: 3.5, d: { t: 'Drag anywhere to steer', s: 'Left, right, wiggle wiggle.' } },
  dash: { id: 'dash', ic: '⚡', to: 3, d: { t: 'Tap DASH for a burst!', s: 'Or tap with your other thumb.' } },
  fruit: { id: 'fruit', ic: '🍓', to: 5, d: { t: 'Grab the fruit sugar', s: 'Fruit is energy. Eat fruit.' } },
  combo: { id: 'combo', ic: '🔥', to: 5, d: { t: 'Pass 3 in a row', s: 'Chain passes for a COMBO.' } },
  cash: { id: 'cash', ic: '👇', to: 6, d: { t: 'Swipe DOWN to cash in!', s: 'Bank it before you bonk.' } },
  draft: { id: 'draft', ic: '💨', to: 4, d: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' } },
};
// swim 1 learns the four moves that matter (steer, dash, cash in, draft); a replay keeps the fruit and the combo steps
const TUT_FIRST = ['steer', 'dash', 'cash', 'draft'].map((id) => TUT_ALL[id]);
const TUT_REPLAY = ['steer', 'dash', 'fruit', 'combo', 'draft'].map((id) => TUT_ALL[id]);
let TUT_STEPS = TUT_REPLAY;
const TUT_DNA = 5;
// keyboard players get the key names (K.TUT_TEXT_KEYS) for the steps that have them
const tutText = (st) => { const kx = !touchUsed && K.TUT_TEXT_KEYS && K.TUT_TEXT_KEYS[st.id]; if (kx && kx.t) return kx; const x = TUT_TEXT[st.id]; return x && x.t ? x : st.d; };
// where the lesson ends: zone 2 on swim 1 (the Acid Lagoon stays for the hazard look), zone 3 on a replay
const tutEndZone = () => (firstSwim ? 1 : 2);
let tut = null;
function tutStart() {
  TUT_STEPS = firstSwim ? TUT_FIRST : TUT_REPLAY;
  tut = { on: true, i: -1, t: 0, st: {}, shown: {}, steer: 0, dirs: 0, lastDir: 0, draftT: 0, okT: 0, combo0: 0, cashSlow: false };
  // a second lesson only replays the steps that were missed last time
  const sk = S.tutSkipped || [];
  if (S.tutTries > 0 && sk.length) for (const x of TUT_STEPS) if (!sk.includes(x.id)) tut.st[x.id] = 'pre';
}
// steering counts once the finger has travelled 180 px and changed direction at least once
function tutSteer(dx) {
  if (!tut || !tut.on) return;
  tut.steer += Math.abs(dx);
  const sg = Math.sign(dx);
  if (sg && Math.abs(dx) >= 2) { if (tut.lastDir && sg !== tut.lastDir) tut.dirs++; tut.lastDir = sg; }
}
function tutDots() { return TUT_STEPS.filter((x) => tut.st[x.id] !== 'pre').map((x) => `<i class="${tut.st[x.id] === 'ok' ? 'ok' : tut.st[x.id] === 'skip' ? 'sk' : x === TUT_STEPS[tut.i] ? 'cur' : ''}"></i>`).join(''); }
const tutCur = () => (tut && tut.on && tut.okT <= 0 && TUT_STEPS[tut.i] ? TUT_STEPS[tut.i].id : '');
function tutNext() {
  if (!tut) return;
  let i = 0; while (i < TUT_STEPS.length && tut.st[TUT_STEPS[i].id]) i++;
  if (i >= TUT_STEPS.length) return tutFinish();
  tut.i = i; tut.t = 0;
  const st = TUT_STEPS[i], el = $('tut'), tx = tutText(st);
  tut.shown[st.id] = true;
  if (st.id === 'combo') tut.combo0 = Math.floor(race ? race.p.combo : 0);
  if (st.id === 'draft') tut.draftT = 0;
  if (st.id === 'cash') tut.cashSlow = false;
  el.querySelector('.ic').textContent = st.ic; el.querySelector('.tt').textContent = tx.t; el.querySelector('.ts').textContent = tx.s || '';
  el.querySelector('.tt').dataset.praise = (TUT_PRAISE[st.id] || 'NICE!') + ' +' + TUT_DNA + ' DNA';
  el.querySelector('.dots').innerHTML = tutDots();
  el.className = 'on step-' + st.id;
  $('dashBtn').classList.toggle('nudge', st.id === 'dash');
}
function tutMark(id) {
  if (!tut || !tut.on || tut.st[id] || !tut.shown[id] || !race || race.demo) return;
  tut.st[id] = 'ok';
  meta.dna += TUT_DNA;
  R.pop(race.p.x, race.p.y + 70, '+' + TUT_DNA + ' DNA', '#7dffb0', 18, 1.2); sfx('pick'); buzz(12);
  const cur = TUT_STEPS[tut.i] && TUT_STEPS[tut.i].id === id;
  if (cur) { tut.okT = 0.7; $('tut').classList.add('ok'); $('dashBtn').classList.remove('nudge'); }
  $('tut').querySelector('.dots').innerHTML = tutDots();
  // the first swim: once Kevin can steer, say what the whole thing is for (it sits below the card, so it may talk over it)
  if (id === 'steer' && firstSwim) coach(K.FIRST_SWIM_GOAL || 'Pass them all. Reach the egg.', 2.6, 1, true);
}
function tutFinish() {
  if (!tut || !tut.on) return;
  tut.on = false; tutHide();
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
  const missed = skipped.concat(unseen);
  S.tutSkipped = missed;
  if (missed.length && (skipped.length >= 2 || unseen.length)) { S.tutTries = (S.tutTries || 0) + 1; S.tutDone = S.tutTries >= 2; }
  else S.tutDone = true;
  if (S.tutDone) S.tutSkipped = [];
  saveUI();
  if (!race || race.demo || race.over) return;
  if (!missed.length) { coach(TUT_TEXT.natural || "You're a natural!", 2.6, 2); sfx('milestone'); buzz([15, 25, 15]); }
  // the first swims never hear "we will practise again": a warm word when most of it landed, otherwise nothing
  else if (meta.runs <= 1) { if (met >= 3 && TUT_TEXT_GENTLE) coach(TUT_TEXT_GENTLE, 2.6, 2); }
  else if (!S.tutDone) coach(TUT_TEXT.retry || 'We will practise again next swim.', 2.6, 2);
}
function tutHide() { $('tut').className = ''; $('dashBtn').classList.remove('nudge'); }
// ------------------------------------------------------------------ lessons: one #tut card outside the tutorial (cash in, drill)
let lesson = null;
function lessonShow(id, ic, tx, sec) {
  if (tut && tut.on) return false;
  const el = $('tut');
  el.querySelector('.ic').textContent = ic; el.querySelector('.tt').textContent = tx.t || ''; el.querySelector('.ts').textContent = tx.s || '';
  el.querySelector('.dots').innerHTML = ''; setBar(el.querySelector('.bar i'), 1);
  el.className = 'on lesson step-' + id;
  lesson = { id, t: sec, sec };
  return true;
}
function lessonEnd() { if (!lesson) return; lesson = null; if (!(tut && tut.on)) tutHide(); }
// the cash lesson: the first pots worth cashing (bank 12+) slow the swim a beat and show how; up to 3 times, 20 s apart
let cashLast = -99, lessonSlowT = 0;
const CASH_TXT = () => {
  const x = TUT_TEXT.cash || { t: 'Swipe DOWN to cash in!', s: 'Bank it before you bonk.' };
  const kx = K.TUT_TEXT_KEYS && K.TUT_TEXT_KEYS.cash;
  return touchUsed ? x : kx && kx.t ? kx : { t: K.CASH_HINT_KEYS || 'Press S to cash in your combo!', s: x.s || '' };
};
function lessonTick(dt) {
  if (lessonSlowT > 0) lessonSlowT -= dt;
  if (!race || race.demo || race.over) { lessonEnd(); return; }
  const p = race.p;
  if (lesson) {
    lesson.t -= dt;
    setBar($('tut').querySelector('.bar i'), lesson.t / lesson.sec);
    if (lesson.id === 'cash') { if (p.bank < 3 || race.drill) { lessonEnd(); return; } ringAsk(p.x, p.y - 30, touchUsed ? 'swipe!' : 'S!', touchUsed ? 'down' : ''); }
    else if (lesson.id === 'drill') { if (!race.drill) { lessonEnd(); return; } ringAsk(p.x, p.y, 'TAP!'); }
    if (lesson && lesson.t <= 0) lessonEnd();
    return;
  }
  if (S.cashDone || (S.cashN | 0) >= 3 || clock - cashLast < 20 || p.bank < 12 || race.drill || race.pending || countT > 0 || eggOn || race.autopilot) return;
  if (!lessonShow('cash', '👇', CASH_TXT(), 3.2)) return;
  cashLast = clock; S.cashN = (S.cashN | 0) + 1; saveUI();
  if (!S.reduced) lessonSlowT = 1;
  sfx('tap', 0.6); buzz([10, 20, 10]);
}
// the drill lesson: the first drill on a save with no wins
function drillLesson() {
  if (S.drillSeen || (meta.wins | 0) > 0 || race.autopilot) return;
  if (lessonShow('drill', '👆', TUT_TEXT.drill || { t: 'Tap FAST to drill in!', s: 'Both thumbs. The egg is waiting.' }, 3.5)) { S.drillSeen = true; saveUI(); }
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
  // the first swim starts at GO; a replay waits for the zone banner to clear
  if (tut.i < 0) { if (!firstSwim && bannerUp()) return; tutNext(); if (!tut.on) return; }
  const p = race.p, st = TUT_STEPS[tut.i], cur = st && tut.okT <= 0 ? st.id : '';
  if (tut.steer > 180 && tut.dirs > 0) tutMark('steer');
  if (tut.shown.combo) { tut.combo0 = Math.min(tut.combo0, Math.floor(p.combo)); if (p.combo >= tut.combo0 + 3) tutMark('combo'); }
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
    if (f) ringAsk(f.x, f.y, 'fruit!'); else paused = true;
  } else if (cur === 'cash') {
    // nothing to cash yet: the clock waits. The moment there is: a beat of slow-mo and the swipe cue on Kevin
    if (p.bank < TUT_CASH_BANK || p.combo < 3) paused = true;
    else {
      if (!tut.cashSlow) { tut.cashSlow = true; if (!S.reduced) lessonSlowT = Math.max(lessonSlowT, 1); sfx('tap', 0.6); buzz([10, 20, 10]); }
      ringAsk(p.x, p.y - 30, touchUsed ? 'swipe!' : 'S!', touchUsed ? 'down' : '');
    }
  }
  if (tut.okT > 0) { tut.okT -= dt; if (tut.okT <= 0) tutNext(); }
  else if (st) {
    // the clock stops while there is nothing to do (no rival to tuck behind, no fruit ahead, no pot) or a banner is up
    // a hazard's first look owns the ring and the player's eyes: the step clock waits for it too
    if (!bannerUp() && !paused && hazT <= 0) tut.t += dt;
    setBar($('tut').querySelector('.bar i'), 1 - tut.t / st.to);
    if (tut.t > st.to) { tut.st[st.id] = 'skip'; tutNext(); }
  }
}
// first swim: a ghost finger swipes over Kevin while the countdown runs
let ghostT = 0;
function ghostTick(dt) {
  if (ghostT <= 0 || !race) return;
  ghostT -= dt;
  if (ghostT > 0) ringAsk(race.p.x, race.p.y + 60, 'drag', 'swipe');
}

// ------------------------------------------------------------------ one guide ring (#tutTarget), shared by the tutorial,
// the low-energy rescue and the first look at each hazard. The first ask in a frame wins.
let ringReq = null;
function ringAsk(wx, wy, label, cls, haz) { if (!ringReq) ringReq = { wx, wy, label, cls: cls || '', haz: haz || null }; }
function ringApply() {
  const tg = $('tutTarget');
  // the pill drops its second line while a ring or the ghost finger does the explaining
  setC($('tut'), 'rg', !!ringReq && mode === 'race');
  if (!ringReq || R.camY == null || !race || mode !== 'race') { setC(tg, 'hide', true); ringReq = null; return; }
  const k = cv.clientWidth / VIEW_W, x0 = ringReq.wx * k + cv.offsetLeft, y0 = R.sy(ringReq.wy) * k + cv.offsetTop;
  // kept on the screen (below the HUD, above the bottom edge); a clamped ring shows an arrow at the real spot
  const top = (R.padTop || 0) + 30, bot = (APP.clientHeight || innerHeight) - 40;
  const lo = cv.offsetLeft + 26, hi = cv.offsetLeft + cv.clientWidth - 26;
  const x = clamp(x0, lo, Math.max(lo, hi)), y = clamp(y0, top, Math.max(top, bot)), edge = Math.abs(x - x0) > 1 || Math.abs(y - y0) > 1;
  tg.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  if (edge) { const a = Math.round(Math.atan2(y0 - y, x0 - x) * 180 / Math.PI + 90); if (tg._a !== a) { tg._a = a; tg.style.setProperty('--ang', a + 'deg'); } }
  setC(tg, 'edge', edge);
  if (tg._l !== ringReq.label) { tg._l = ringReq.label; tg.dataset.l = ringReq.label; }
  setC(tg, 'swipe', ringReq.cls === 'swipe');
  setC(tg, 'down', ringReq.cls === 'down');
  // a hazard's first look only counts as seen once its ring has really been on screen
  if (ringReq.haz && !S.seenHaz.includes(ringReq.haz)) { S.seenHaz.push(ringReq.haz); saveUI(); }
  setC(tg, 'hide', false); ringReq = null;
}
// early swims: the first time the tank runs low, point at the nearest fruit
let lowDone = false, lowRingT = 0;
function lowTick(dt) {
  if (!race || race.demo || race.drill || meta.runs >= 3) return;
  const p = race.p;
  if (!lowDone && p.e < 30 && countT <= 0 && !race.pending) {
    lowDone = true; lowRingT = 4;
    coach(pickLine(LOW_ENERGY), 2.8, 2); buzz([30, 30, 30], true);
  }
  if (lowRingT > 0) {
    lowRingT -= dt;
    const best = nearestFruit(700);
    if (best) ringAsk(best.x, best.y, 'fruit!');
  }
}
// the first time each hazard scrolls into view: a ring, one line and a short slow-down
const HAZ_KEY = { acid: 'acid', alkali: 'alkali', gate: 'gate', goo: 'goo', wbc: 'wbc', current: 'current', cilia: 'cilia', dna: 'dna', shield: 'helmet' };
// pickups, not dangers: they wait until the tutorial is done
const HAZ_SOFT = new Set(['dna', 'helmet', 'shield']);
let hazAt = -99, hazEnt = null, hazT = 0, hazSlowT = 0, hazPend = null;
function hazTick(dt) {
  if (hazSlowT > 0) hazSlowT -= dt;
  if (!race || race.demo || race.drill || eggOn) { hazT = 0; return; }
  const p = race.p;
  if (hazT > 0) {
    hazT -= dt;
    if (hazEnt && !hazEnt.dead) {
      let x = hazEnt.x;
      if (hazEnt.t === 'gate' && hazEnt.gaps && hazEnt.gaps.length) x = hazEnt.gaps.reduce((a, g) => (Math.abs(g - p.x) < Math.abs(a - p.x) ? g : a), hazEnt.gaps[0]);
      ringAsk(x, hazEnt.y, hazEnt.t === 'gate' ? 'gap!' : 'look!', '', hazPend);
    }
    return;
  }
  hazPend = null;
  // the tutorial's own ring (fruit, draft) and the low-energy rescue come first: an intro waits, it is never used up unseen
  const tStep = tutCur();
  if (tStep === 'fruit' || tStep === 'draft' || tStep === 'cash' || lowRingT > 0 || lesson) return;
  // swim 1: the Acid Lagoon's first look waits for the lesson to wrap up
  if (firstSwim && tut && tut.on) return;
  if (firstSwim && clock - raceT0 < 6) return;
  if (clock - hazAt < 4 || bannerUp() || race.pending || countT > 0 || !$('cards').classList.contains('hide')) return;
  const seen = S.seenHaz, soft = !!(tut && tut.on);
  let best = null, bd = 1e9, kind = null;
  for (const e of race.ents) {
    const kk = HAZ_KEY[e.t]; if (!kk || e.dead || seen.includes(kk) || !HAZARD_INTRO[kk]) continue;
    if (soft && (HAZ_SOFT.has(kk) || HAZ_SOFT.has(e.t))) continue;
    const dy = e.y - p.y; if (dy < 150 || dy > 450) continue;
    if (e.side && p.side && e.side !== p.side) continue;
    if (dy < bd) { bd = dy; best = e; kind = kk; }
  }
  if (!best && !seen.includes('forkSign') && HAZARD_INTRO.forkSign && C.FORK_Y0 - p.y > 150 && C.FORK_Y0 - p.y < 450) kind = 'forkSign';
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
const keyName = (k) => (k && k.length === 1 ? k.toLowerCase() : k);
let drag = null, lastDown = 0, lastTapX = 0, lastTapY = 0, dashBuf = 0, lastDrillTap = 0, drillN = 0, holdOff = null, wallSide = 0;
// every finger on the play area (not on buttons): when the steering thumb lifts, another one still down takes over
const fingers = new Map();
function clearInput() {
  drag = null; lastDown = 0; dashBuf = 0; holdOff = null; fingers.clear();
  for (const k of Object.keys(keys)) keys[k] = 0;
  dashPress = null;
  if (race) { race.input.tx = null; race.input.dash = false; race.input.tap = 0; race.input.touch = false; race.input.dir = 0; race.input.finger = false; }
}
const toWorldX = (clientX) => { const r = cv.getBoundingClientRect(); return (clientX - r.left) / r.width * VIEW_W; };
const playBlocked = () => !race || mode !== 'race' || race.paused || race.pending || race.over;
function band(y, side) {
  try { if (typeof C.playBand === 'function') { const b = C.playBand(y, side); if (b && Number.isFinite(b.l) && Number.isFinite(b.r) && b.r > b.l) return b; } } catch (e) { /* fall back */ }
  const ch = C.channel ? C.channel(y, side) : { c: VIEW_W / 2, h: 120 };
  return { l: ch.c - ch.h + 9, r: ch.c + ch.h - 9 };
}
const mid = (y) => (C.centre ? C.centre(y) : VIEW_W / 2);
function steerTick() {
  if (!drag || !race || race.drill || mode !== 'race') return;
  const p = race.p, c = mid(p.y), b = band(p.y, p.side);
  let tx = c + drag.off0 + drag.acc;
  // wall feel: a tiny tick on the rising edge of hitting a wall, re-armed once the finger leaves it by 8 world px
  const hit = tx <= b.l ? -1 : tx >= b.r ? 1 : 0;
  if (hit && hit !== wallSide) { wallSide = hit; buzz(5); sfx('tap', 0.15); }
  else if (wallSide && (wallSide < 0 ? tx > b.l + 8 : tx < b.r - 8)) wallSide = 0;
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
  if (lowForDash()) { refuseDash(); return; }   // only an empty tank says no at once; a cooldown just waits a beat
  race.input.dash = true; dashBuf = Math.max(0.15, Math.min(0.6, (race.p.dashCd || 0) + 0.05));
}
function refuseDash() {
  const b = $('dashBtn'); b.classList.remove('refuse'); void b.offsetWidth; b.classList.add('refuse'); buzz(6);
}
// cash the combo in on purpose (long press on DASH, or a quick swipe down)
function cashOut() {
  if (playBlocked() || race.drill || countT > 0) return;
  race.input.cashOut = true; buzz(10);
}
// drill taps: throttled per finger (45 ms), so two thumbs drum twice as fast. A raw tap only clicks; the burst, the shake
// and the buzz wait for core's 'drillTap' event (the taps it really counted)
const lastDrillTapId = new Map();
function drillTap(id = 'k') {
  const now = performance.now();
  if (now - (lastDrillTapId.get(id) || 0) < 45 || race.input.tap >= 3) return;
  lastDrillTapId.set(id, now); lastDrillTap = now; race.input.tap++; drillN++;
  sfx('drill', drillN);
}
// the whole app takes touches, so the gutters steer too in landscape
const APP = $('app');
const smooth01 = (x) => x * x * (3 - 2 * x);

// re-grip: a new touch carries on from the lane Kevin was aiming for (the held lane, else the live target), so lifting and
// touching again never snaps him back to where he is; only a target 140+ world px from Kevin falls back to his spot
function gripOff(prefer) {
  const p = race.p, c = mid(p.y);
  let off = prefer != null ? prefer : race.input.tx != null ? race.input.tx - c : p.x - c;
  if (!Number.isFinite(off) || Math.abs(c + off - p.x) > 140) off = p.x - c;
  return off;
}
function newDrag(id, x, y, now, extra, off) {
  const o = off != null ? off : gripOff(null);
  return Object.assign({ id, t0: now, x0: x, y0: y, lx: x, lt: now, v: 0, acc: 0, off0: o, off: o, moved: 0, hx: 0, flick: false, dashed: false }, extra);
}
APP.addEventListener('pointerdown', (e) => {
  if (mode !== 'race' || playBlocked()) return;
  if (e.target && e.target.closest && e.target.closest('button,.ov')) return;
  // the OS back swipe lives on the screen edges: leave those strips to it (24 px on the left in landscape, 16 px elsewhere)
  if (e.clientX < (landscape() ? 24 : 16) || e.clientX > innerWidth - 16) return;
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'touch') touchUsed = true;
  // a second thumb: dash (or drill) without stealing the steering finger
  if (drag && e.pointerId !== drag.id) { if (race.drill) { if (countT <= 0) drillTap(e.pointerId); } else if (countT <= 0) requestDash(); return; }
  try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  if (race.drill) { holdOff = null; if (countT <= 0) drillTap(e.pointerId); return; }
  const off0 = gripOff(holdOff); holdOff = null;
  const now = performance.now();
  const dbl = lastDown && now - lastDown < 300 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 64;
  if (dbl && countT <= 0) { requestDash(); lastDown = 0; }
  drag = newDrag(e.pointerId, e.clientX, e.clientY, now, { dashed: dbl }, off0);
  steerTick();
  if (race.autopilot) { race.autopilot = false; hint('Autopilot off. You are driving!', 2, 1); }
});
APP.addEventListener('pointermove', (e) => {
  const f = fingers.get(e.pointerId); if (f) { f.x = e.clientX; f.y = e.clientY; }
  if (!drag || e.pointerId !== drag.id || !race) return;
  const now = performance.now(), sdx = e.clientX - drag.lx, w = cv.getBoundingClientRect().width || 1;
  // finger acceleration: slow moves are precise, fast swipes carry further (speed in CSS px/s, smoothed)
  const sp = Math.abs(sdx) / Math.max(1, now - drag.lt) * 1000;
  drag.v += (sp - drag.v) * 0.4;
  drag.acc += sdx / w * VIEW_W * S.sens * (1 + 0.7 * smooth01(clamp((drag.v - 300) / 1200, 0, 1)));
  drag.lx = e.clientX; drag.lt = now; drag.hx += Math.abs(sdx);
  drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
  if (dashHold && e.pointerId === dashHold.id && Math.hypot(e.clientX - dashHold.x0, e.clientY - dashHold.y0) > 20) dashHoldEnd();
  dashPressMove(e);
  if (tut) tutSteer(sdx);
  // a quick vertical flick: up dashes, a long fast straight one down cashes the combo in (only with a pot worth it,
  // and never out of a steering move: under 30 px of sideways travel before it)
  const dy = e.clientY - drag.y0, adx = Math.abs(e.clientX - drag.x0), age = now - drag.t0;
  if (!drag.flick && !drag.dashed && age < 160 && -dy > 60 && -dy > 1.6 * adx && countT <= 0 && !playBlocked()) { drag.flick = true; requestDash(); }
  else if (!drag.flick && potReady() && age < 200 && dy > 110 && adx < 0.5 * dy && drag.hx < 30) { drag.flick = true; cashOut(); }
  steerTick();
});
const up = (e) => {
  fingers.delete(e.pointerId);
  if (dashHold && e.pointerId === dashHold.id) dashHoldEnd();
  if (e.type === 'pointerup') dashPressUp(e); else if (dashPress && dashPress.id === e.pointerId) dashPress = null;
  if (!drag || e.pointerId !== drag.id) return;

  const now = performance.now(), d = drag;
  drag = null;
  if (race) race.input.finger = false;
  // thumb handoff: another finger is still on the glass, it steers on from the lane this one held
  if (race && mode === 'race' && !playBlocked() && !race.drill && fingers.size) {
    const [id, f] = fingers.entries().next().value;
    drag = newDrag(id, f.x, f.y, now, { flick: true, dashed: true }, gripOff(d.off));
    try { APP.setPointerCapture(id); } catch (err) { /* already released */ }
    steerTick();
    return;
  }
  if (race) { race.input.tx = null; race.input.touch = false; if (!race.drill) holdOff = d.off; }
  // a quick, still touch is a tap: the next touch soon after (and close by) dashes
  if (!d.dashed && !d.flick && now - d.t0 < 180 && d.moved < 12) { lastDown = now; lastTapX = e.clientX; lastTapY = e.clientY; }
  else lastDown = 0;
};
APP.addEventListener('pointerup', up); APP.addEventListener('pointercancel', up); APP.addEventListener('lostpointercapture', up);
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
const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'a', 'd'];
addEventListener('keydown', (e) => {
  unlock();
  const k = keyName(e.key);
  if (k === 'm' && !e.repeat) { toggleMute(); return; }
  if (k === 'Escape' || k === 'p') {
    if (mode === 'race' && race && !race.over && !race.pending) { if (race.paused) resume(); else pause(); }
    return;
  }
  if (mode === 'result') { if ((k === ' ' || k === 'Enter') && resultReady) { e.preventDefault(); again(); } return; }
  if (mode === 'race' && finHold && (k === ' ' || k === 'Enter')) { e.preventDefault(); finishSkip(); return; }
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
  if (k === 's' || k === 'ArrowDown') { if (!e.repeat) cashOut(); return; }
  keys[k] = 1;
  if (STEER_KEYS.includes(k)) { holdOff = null; if (tut) tutSteer(k === 'ArrowLeft' || k === 'a' ? -25 : 25); }
});
addEventListener('keyup', (e) => { keys[keyName(e.key)] = 0; });
// long press on DASH cashes the combo in, but only when there is a pot worth it (combo 10+, bank 3+).
// A ring fills round the button (--hold) for 650 ms; sliding 20 px or off the button cancels.
const HOLD_MS = 650;
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
  if (f >= 1) { dashHoldEnd(); cashOut(); buzz(8, true); }
}
// portrait, one thumb: a DASH press that turns into a steering slide must not dash. It fires on release, or after 70 ms
// held under 10 px, and a slide of 14+ px first cancels it. A second finger (another one steers) and landscape fire at once.
let dashPress = null;
function dashPressFire() { const d = dashPress; if (!d || d.fired) return; d.fired = true; if (!playBlocked() && countT <= 0 && race && !race.drill) requestDash(); }
function dashPressMove(e) {
  const d = dashPress; if (!d || d.fired || e.pointerId !== d.id) return;
  d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
  if (d.moved >= 14) dashPress = null;
}
function dashPressUp(e) { const d = dashPress; if (!d || e.pointerId !== d.id) return; dashPressFire(); dashPress = null; }
function dashPressTick() { const d = dashPress; if (d && !d.fired && performance.now() - d.t0 >= 70 && d.moved < 10) dashPressFire(); }
$('dashBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); unlock();
  if (playBlocked() || countT > 0) return;
  if (race.drill) { drillTap(e.pointerId); return; }
  const instant = !!drag || landscape();
  if (instant) requestDash(); else dashPress = { id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 0, fired: false };
  dashHoldEnd();
  if (potReady()) { dashHold = { id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY }; $('dashBtn').classList.add('holding'); }
  // the thumb that pressed DASH steers too when no other finger does: sliding off the button just keeps swimming
  if (!drag) {
    drag = newDrag(e.pointerId, e.clientX, e.clientY, performance.now(), { flick: true, dashed: true }, gripOff(holdOff));
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); holdOff = null;
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
function pause() {
  if (mode !== 'race' || !race || race.pending || race.over || race.paused) return;
  race.paused = true; pickT = 0; $('cards').classList.remove('out'); clearInput(); slowT = 0; freezeT = 0; syncMute();
  // a pause wipes every timed state: the countdown restarts on resume, slow-mo and the crawl start over
  countT = 0; goT = 0; lastCount = 0; $('count').className = ''; crawlOn = false; hazSlowT = 0; lessonSlowT = 0; dashHoldEnd();
  // a hit-stop or a sim remainder never carries across a pause
  stopT = 0; simAcc = 0;
  setT($('pauseTip'), pickLine(TIPS));
  show('pause'); muffle(true); slowmoReset();
}
function resume() {
  if (!race) return;
  unlock(); race.paused = false; clearInput(); show(null); muffle(false);
  // a short "2, 1, GO" so the thumb is back on the glass before the tube moves (at the drill too: no lost taps)
  if (!race.over && !race.pending) { countT = 0.8; lastCount = 0; }
  govHold(3);
}
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = resume;
$('quitBtn').onclick = () => { if (!race || race.over) return; race.paused = false; countT = 0; clearInput(); coClear(); coachClear(); show(null); muffle(false); race.end('quit'); };
function toBackground() {
  save(); clearInput();
  if (mode === 'race' && race && !race.over && !race.demo && !race.pending) pause();
  // the cards stay up while away: no half-held DASH ring, and no muffled band left behind
  else if (mode === 'race' && race && race.pending) { dashHoldEnd(); muffle(false); }
  try { A.suspend(); } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => {
  govReset();
  if (document.hidden) { toBackground(); return; }
  const away = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
  unlock();
  if (mode === 'title') {
    // a quick app switch keeps whatever was open; a long break rebuilds the title and says welcome back
    if (!$('title').classList.contains('hide') && away >= 15 * 60000) { title(); maybeWelcome(away); }
    else { titleStats(); renderFactory(); badges(); }
  }
});
// the OS back gesture mid-swim: pause, and put the guard entry back
addEventListener('popstate', () => {
  if (mode !== 'race' || !race || race.demo || race.over) return;
  pause();
  try { history.pushState({ mto: 1 }, ''); } catch (e) { /* sandboxed */ }
});
addEventListener('focus', unlock);

addEventListener('blur', toBackground);
addEventListener('pagehide', toBackground);
function openSettings(from) {
  settingsFrom = from; show('settings');
  $('setMusic').checked = S.music; $('setSfx').checked = S.sfx; $('setHaptics').checked = S.haptics; $('setReduced').checked = S.reduced;
  $('setMusicVol').value = S.mvol; $('setSfxVol').value = S.svol; $('setLefty').checked = S.lefty;
  for (const b of $('setSens').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === S.sens);
  for (const b of $('setGfx').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === S.gfx);
  $('setHapticsRow').classList.toggle('dim', !navigator.vibrate);
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
$('setLefty').onchange = (e) => { S.lefty = e.target.checked; saveUI(); document.body.classList.toggle('lefty', S.lefty); };
for (const b of $('setSens').querySelectorAll('button')) b.onclick = () => { S.sens = +b.dataset.v; saveUI(); openSettings(settingsFrom); sfx('tap'); };
for (const b of $('setGfx').querySelectorAll('button')) b.onclick = () => { S.gfx = b.dataset.v; saveUI(); applyGfx(); openSettings(settingsFrom); sfx('tap'); };
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
  clearInput();
  revealT = S.reduced ? 0.12 : 0.6;
  const p = race.p;
  sfx('zone'); buzz([20, 40, 30]); muffle(true);
  if (!S.reduced) { R.flash = 0.45; R.flashCol = 'rgba(255,240,200,0.5)'; if (R.zoomPunch) R.zoomPunch(0.14); }
  trauma(0.35);
  if (R.ring) R.ring(p.x, p.y, '#ffd75c', 120, 0.6, 7);
  if (R.confetti) R.confetti(p.x, p.y, 40);
  R.pop(p.x, p.y + 90, race.pendingMid ? 'HALFWAY BONUS!' : 'ZONE CLEARED!', '#ffd75c', 26, 1.2);
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
let offerGolden = false;
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
  $('cardsSub').textContent = firstDraft ? 'ZONE 1 CLEARED' : race.pendingMid ? `HALFWAY BONUS · PLACE #${fmt(race.rank)}` : `${ZONES[Math.max(0, zi - 1)].name.toUpperCase()} CLEARED · PLACE #${fmt(race.rank)}`;
  setT($('cardsH'), offerGolden ? 'GOLDEN DRAFT' : 'MUTATE!'); setC($('cards'), 'golden', offerGolden);
  setT($('cardsLine'), firstDraft ? 'Tap one. Kevin gets it for this swim.' : 'Pick one. It lasts until this swim ends.');
  $('cardsOwned').innerHTML = Object.keys(race.muts).map((id) => MUTATIONS[id] ? `<span title="${esc(MUTATIONS[id].name)}">${MUTATIONS[id].icon}${race.muts[id] > 1 ? `<b>${race.muts[id]}</b>` : ''}</span>` : '').join('');
  let lastEnd = 0;
  const cp = (race.draftN || 1) <= 1 && !race.pendingMid && (meta.runs | 0) < 3 ? coachPickOf(race.pending) : null;
  const cpTag = (id) => (id === cp ? `<span class="cp">COACH'S PICK</span>` : '');
  $('cardRow').innerHTML = race.pending.map((id, k) => {
    const m = MUTATIONS[id], have = race.muts[id] || 0, delay = k * (firstDraft ? 0.3 : 0.1);
    lastEnd = Math.max(lastEnd, delay + (m.r === 3 ? 0.7 : 0.5));
    // the very first deal: the icon, the name and what it does, one card at a time
    if (firstDraft) return `<button class="card simple r${m.r}" data-id="${id}" style="animation-delay:${delay.toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div></div>${cpTag(id)}${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
    const lvl = firstDraft ? ['COMMON', 'RARE', 'LEGENDARY'][m.r - 1] : `${['COMMON', 'RARE', 'LEGENDARY'][m.r - 1]} · ${have ? `LV ${have} → ${have + 1}` : 'NEW'}${m.max > 1 ? ' of ' + m.max : ''}`;
    const fl = MUT_FLAVOR[id] ? `<div class="fl">${esc(MUT_FLAVOR[id])}</div>` : '', mash = completesPair(id), pb = mash ? '<span class="pb">MASHUP!</span>' : '';
    return `<button class="card r${m.r}${mash ? ' mash' : ''}" data-id="${id}" style="animation-delay:${delay.toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="lvl">${lvl}${pb}<span class="key">${k + 1}</span></div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>${fl}${partnerLines(id, false)}</div>${cpTag(id)}${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
  }).join('');
  // a card that completes a combo gets a shimmer once the deal lands
  const completes = race.pending.some(completesPair);
  for (const b of $('cardRow').querySelectorAll('.card')) b.onclick = () => pick(b.dataset.id);
  $('rerollBtn').classList.toggle('hide', race.rerolls <= 0);
  $('rerollBtn').textContent = `🎲 Reroll · Rerolls: ${race.rerolls}`;
  // no taps until the last card has landed
  cardsReady = false; $('cardRow').classList.add('locked'); clearTimeout(cardsTO);
  cardsTO = setTimeout(() => { cardsReady = true; $('cardRow').classList.remove('locked'); }, S.reduced ? 80 : Math.round(lastEnd * 1000) + 30);
  $('cards').classList.remove('out'); show('cards');
  // the flavour lines are a bonus: drop them when they would push a card off a short screen
  // (measured from layout boxes, so the deal animation's transforms do not count)
  const co = $('cards'); co.classList.remove('nofl');
  const last = $('rerollBtn').classList.contains('hide') ? $('cardRow') : $('rerollBtn');
  if (last.offsetTop + last.offsetHeight + 12 > co.clientHeight) co.classList.add('nofl');
  sfx('cards');
  if (race.pending.some((id) => MUTATIONS[id].r === 3)) setTimeout(() => { sfx('legendary'); buzz([10, 30, 10]); }, 380);
  if (completes) setTimeout(() => { if (cardsLive()) sfx('synTease'); }, Math.round(lastEnd * 1000) + 300);
}
function reroll() { if (cardsReady && race && race.pending && race.rerolls > 0 && race.reroll()) { sfx('reroll'); buzz(10); dealCards(); } }
$('rerollBtn').onclick = reroll;
function pick(id) {
  if (!race || !race.pending || !cardsReady) return;
  const el = $('cardRow').querySelector(`.card[data-id="${id}"]`), mid = !!race.pendingMid;
  if (!race.choose(id)) return;
  // the pick is in: no second pick, and a late "cards ready" timer can never unlock a dead row
  cardsReady = false; clearTimeout(cardsTO);
  offerGolden = false;
  clearInput();
  sfx('pick'); buzz(18);
  if (el) el.classList.add('picked');
  $('cards').classList.add('out'); pickT = S.reduced ? 0.05 : 0.28;
  muffle(false);
  const zi = race.zoneReached, z = ZONES[zi];
  if (!mid) {
    if (zi >= tutEndZone()) tutFinish();
    coachClear();
    zoneArrive(zi, { t: z.name, z: `ZONE ${zi + 1}`, sec: 1.6 });
    if (race.p.combo < 20) coach(zoneCoach(z.id), firstSwim ? 4.5 : 3, 1);
    A.bpm = z.beat;
  }
  setIntensity();
  sfx('boss', 4);
  R.pop(race.p.x, race.p.y + 60, MUTATIONS[id].icon + ' ' + MUTATIONS[id].name, '#ffd75c', 18, 1.6);
  timeScale = S.reduced ? 1 : 0.25;   // ease back into the action
}

// ------------------------------------------------------------------ events -> juice
let bankedNow = false, leadK = -1, leadSaid = 0, kevLeadFx = false, kindPopT = -9;
let bonkN = 0, shoveAt = {}, coreHas = {}, passedOnce = new Set(), rivalIntro = [], lastBubble = -99, eggClaimed = false, rivalF = 0, rivalK = -1, passBlip = false, lastBlip = 0;
// hit-stop: the frame holds for ms. Only the big ones (60 ms+) make the music gasp, and at most one gasp per 0.5 s.
// With a place (x, y) the hit thing flashes white for the hold (R.impactFrame).
let lastImpact = -99;
// a leaky freeze budget: frozenRecent counts the seconds held lately (it drains 1 a second). Past 0.22 s the small holds
// shrink to 40% and the ones that end up under 20 ms are skipped, so a pile-up never turns into stutter.
// force: FRENZY, milestones, a shield hit, second wind and Kevin taking the egg lead always land in full.
let frozenRecent = 0, finPopUntil = -99;
const BIG_HOLDS = new Set(['frenzy', 'milestone', 'shieldHit', 'second', 'kevin']);
function hitStop(ms, x, y, kind, force) {
  if (S.reduced || !race || race.demo) return;
  if (!force && !BIG_HOLDS.has(kind) && frozenRecent > 0.22) { ms *= 0.4; if (ms < 20) return; }
  frozenRecent += ms / 1000;
  stopT = Math.max(stopT, ms / 1000);
  if (ms >= 60 && clock - lastImpact >= 0.5) { lastImpact = clock; try { if (A.impact) A.impact(ms); } catch (e) { /* optional */ } }
  if (x != null && y != null) { try { if (R.impactFrame) R.impactFrame(x, y, kind || 'hit', ms / 1000); } catch (e) { /* optional */ } }
}
// near misses (a close pass, a dodge): a tiny hold, a punch and a nudge away from the danger, at most 3 a second
let nearAt = [];
function nearMissFx(ev, p) {
  nearAt = nearAt.filter((t) => clock - t < 1);
  if (nearAt.length >= 3) return;
  nearAt.push(clock);
  const x = ev.x != null ? ev.x : p.x, y = ev.y != null ? ev.y : p.y;
  let hunted = false;
  if (ev.kind === 'dodge') for (const e of race.ents) if (e.t === 'wbc' && !e.dead && e.hunt > 0.5 && Math.hypot(e.x - x, e.y - y) < 80) { hunted = true; break; }
  hitStopRL(hunted ? 35 : 28, x, y, ev.kind);
  if (R.zoomPunch) R.zoomPunch(0.03);
  kick(x < p.x ? 0.25 : -0.25, 0); buzz(8);
}
function sayRival(k, text, dur = 2.2, force) {
  if (!text || (!force && clock - lastBubble < 5) || !R.say) return false;
  lastBubble = clock; R.say(k, text, dur); return true;
}
// a rival's own reaction line (RIVAL_REACTS[name][kind]), through the same 5 s bubble throttle
function react(k, kind, dur = 2.2) {
  const r = RIVALS[k]; if (!r) return false;
  return sayRival(k, pickLine(reactsOf(r.name)[kind]), dur);
}
// hit-stop is rate limited: one per 0.08 s, so a pile-up never freezes the frame
// inside the 80 ms window a bigger hit (1.3x what is left of the hold) replaces the current one
let lastHitStop = -99;
function hitStopRL(ms, x, y, kind) {
  if (clock - lastHitStop < 0.08) {
    if (!(ms / 1000 > 1.3 * stopT)) return;
    lastHitStop = clock; stopT = 0; hitStop(ms, x, y, kind); return;
  }
  lastHitStop = clock; hitStop(ms, x, y, kind);
}
// the music follows the race: calm in the launch tube, busier in the middle, loud near the egg, flat out in FRENZY
function setIntensity() {
  if (!race || race.demo || mode !== 'race' || !A.on) return;
  const zi = race.zoneReached | 0;
  A.intensity = race.p.frenzyT > 0 ? 2 : zi <= 1 ? 0 : zi <= 4 ? 1 : 1.4;
}
// combo saved by Echo Chamber: a soft cyan echo, never the shatter
function echoFx(kept) {
  const p = race.p;
  R.pop(p.x, p.y + 70, 'ECHO! +' + kept, '#7fe8ff', 17, 1.1);
  sfx('comboEnd'); R.lastBankT = R.time; buzz(8);
}
// combo ladder: crossing 10, 25, 50 and 100 each land harder (no extra hit-stop when FRENZY fired the same frame)
const LADDER = [[10, 30, 0.15, 0.05, 0.12, 12], [25, 45, 0.25, 0.07, 0.18, 20], [50, 60, 0.35, 0.09, 0.24, [20, 25, 30]], [100, 80, 0.5, 0.12, 0.3, [30, 30, 40, 30, 60]]];
function comboLadderFx(n, p) {
  let li = -1;
  for (let i = 0; i < LADDER.length; i++) if (n >= LADDER[i][0] && comboLadder < LADDER[i][0]) li = i;
  if (li < 0) return;
  const [at, ms, tr, zp, fl, bz] = LADDER[li];
  comboLadder = at;
  if (!frenzyNow) hitStop(ms);
  trauma(tr); if (R.zoomPunch) R.zoomPunch(zp);
  if (!S.reduced) { R.flash = Math.max(R.flash || 0, fl); R.flashCol = 'rgba(255,215,92,0.35)'; }
  buzz(bz);
  R.pop(p.x, p.y + 125, at + 'x!', li >= 2 ? '#ff5cd2' : '#ffd75c', 28 + li * 4, 1.1);
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
  sfx('comboBreak');
  // a lost pot already said its line
  if (!potLost) R.pop(p.x, p.y + 70, (pickLine(BREAK_LINES) || 'COMBO DROPPED') + (n >= 10 ? ` (${n})` : ''), '#ff8bb0', 18);
  if (n >= 10) buzz(15);
}
let evErrs = 0;
function onEvents() {
  // take the batch first: whatever a handler does (even a throw), these events are never replayed
  const p = race.p, evs = race.events; race.events = [];
  if (race.demo) return;
  bankedNow = false; frenzyNow = false;
  for (const ev of evs) {
    if (ev.type === 'comboBreak' || ev.type === 'comboBank' || ev.type === 'passedBy') coreHas[ev.type] = true;
    if (ev.type === 'frenzy') frenzyNow = true;
  }
  for (const ev of evs) {
    try { onEvent(ev, p); } catch (e) { if (evErrs++ < 3) console.error(e); }
  }
}
let frenzyNow = false;
function onEvent(ev, p) {
    switch (ev.type) {
      case 'pass':
        if (ev.boss) {
          const k = rivalIndex(ev), name = ev.boss;
          if (!passedOnce.has(name)) {
            passedOnce.add(name);
            R.pop(ev.x, ev.y + 30, `PASSED ${first(name).toUpperCase()}!`, '#ffd75c', 20, 1.6);
            R.flash = 0.3; R.flashCol = 'rgba(255,215,92,0.35)'; trauma(0.35); hitStop(60, ev.x, ev.y, 'pass');
            if (clock - lastSlowAt >= 6) { slow(0.4); lastSlowAt = clock; }
            sfx('boss', k >= 0 ? k : undefined); buzz([15, 30, 25]); bossPassed(k);
            sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2);
          } else { passBlip = true; R.pop(ev.x, ev.y + 30, first(name).toUpperCase() + ' AGAIN', '#ffe9a8', 14, 0.9); bossPassed(k); sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2); }
        } else { passSum += ev.w; passBlip = true; }
        if (R.passFx) R.passFx(ev.x, ev.y, p.combo, R.ringCol ? R.ringCol(clamp(p.comboT / (p.comboMax || 1), 0, 1)) : '#ffd75c');
        else R.burst(ev.x, ev.y, '#ffffff', 3, 80, 0.35, 2);
        break;
      case 'passedBy': { const k = rivalIndex(ev); if (k >= 0) passedBy(k); break; }
      case 'combo':
        sfx('link', { n: ev.n, kind: ev.kind });
        if (ev.kind === 'close' || ev.kind === 'dodge') nearMissFx(ev, p);
        if (ev.kind === 'close') { sfx('close'); R.pop(ev.x, ev.y + 30, POP('close', 'CLOSE!'), '#5ce1ff', 15); }
        if (ev.kind === 'gate') { sfx('thread'); R.pop(p.x, p.y + 40, POP('thread', 'THREADED!'), '#d9b8ff', 16); }
        if (ev.kind === 'dodge') R.pop(ev.x, ev.y + 30, POP('dodge', 'DODGED!'), '#5ce1ff', 15);
        if (ev.kind === 'draft') R.pop(p.x, p.y + 40, POP('draft', 'COMFY!'), '#b8f0ff', 14);
        // the new overtake kinds (systems): a small named pop, at most one every 0.45 s so a plow does not spam
        if ((ev.kind === 'slingshot' || ev.kind === 'weave' || ev.kind === 'snipe') && race.t - (kindPopT || -9) > 0.45) {
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
      case 'comboBank': {
        const g = clamp(ev.grade | 0, 0, Math.max(0, BANK_GRADES.length - 1)), dnaRaw = +ev.dna || 0, dna = Math.round(dnaRaw);
        const dnaS = dnaRaw < 9.95 ? dnaRaw.toFixed(1) : String(dna); // a small bank reads +0.4, never +0
        bankedNow = true;
        if (R.comboBank) R.comboBank(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, dna);
        if (ev.finisher) {
          // a cash-in on purpose: the lesson is learned (and the tutorial's cash step is done)
          if (!S.cashDone) { S.cashDone = true; saveUI(); lessonEnd(); }
          tutMark('cash');
          const bn = ev.blastN | 0, big = bn >= 3;
          // a finisher that blasted 3+ Big Macros: the stinger one grade up and an extra shove of shake
          sfx('finisher', big ? Math.min(4, g + 1) : ev.grade);
          trauma(0.25 + (bn > 0 ? 0.15 : 0) + (big ? 0.3 : 0));
          if (bn > 0) {
            if (R.zoomPunch) R.zoomPunch(0.1);
            if (R.ring) R.ring(p.x, p.y, '#ffd75c', 150, 0.55, 8);
            if (!S.reduced) { R.flash = Math.max(R.flash || 0, 0.3); R.flashCol = 'rgba(255,215,92,0.4)'; }
            buzz([20, 20, 30, 20, 60]);
          } else buzz([10, 20, 10]);
          // ONE pop for the whole cash-in, not a stack of three
          R.pop(p.x, p.y + 100, `${BANK_GRADES[g] || 'BANKED'} +${dnaS} DNA${bn > 0 ? ' · BLASTED ' + bn : ''}`, '#ffd75c', 28 + g * 2, 1.3);
          finPopUntil = clock + 1.3;
          if ((ev.n | 0) < 10) coach(pickLine(FINISHER_LINES), 1.8, 1);
        } else {
          sfx('comboBank', ev.grade);
          R.pop(p.x, p.y + 80, (BANK_GRADES[g] || 'BANKED') + ' +' + dnaS, '#7dffb0', 18 + g * 2, 1.4); buzz([10, 20, 10]);
        }
        // the bigger banks land with a hold and a punch
        if (g >= 2) { hitStop([0, 0, 30, 50, 80][Math.min(4, g)]); if (R.zoomPunch) R.zoomPunch(0.03 + 0.025 * g); }
        break;
      }
      case 'comboBreak': {
        const potLost = potBreak(), n = ev.n | 0;
        if (ev.kept > 0) echoFx(ev.kept);
        else if (!bankedNow) {
          if (R.comboBreak) R.comboBreak(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, n);
          comboBreakFx(n, true, potLost);
          if (n >= 25) { hitStop(45); trauma(0.25); }
        }
        break;
      }
      case 'comboMilestone': {
        const n = ev.n | 0;
        if (R.confetti) R.confetti(p.x, p.y, 60);
        hitStop(120, null, null, 'milestone'); trauma(0.4); buzz([30, 30, 30, 30, 90]);
        // a cash-in pop still on screen: the milestone waits a beat so the two never stack
        const mPop = () => { if (race && !race.over) R.pop(race.p.x, race.p.y + 150, MILESTONE_LINES[n] || n + ' COMBO!', '#ffd75c', 34, 1.6); };
        if (finPopUntil > clock) later(0.35, mPop); else mPop();
        sfx('comboMilestone', n);
        break;
      }
      case 'comboEnd':
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
      case 'offer': offerGolden = !!ev.golden; break;
      case 'threat': {
        const k = rivalIndex(ev);
        if (!threatSaid && k >= 0) { threatSaid = true; callout('event', { t: `${first(RIVALS[k].name).toUpperCase()} IS HERE`, z: rivalKicker(RIVALS[k].name), c: threatLine(RIVALS[k].name), col: RIVALS[k].col, sec: 2.2 }); }
        if (k >= 0) { sfx('bossTaunt', k); buzz(15); }
        break;

      }
      case 'drillLead': {
        const k = rivalIndex(ev), kev = !!ev.kevin;
        const nm = kev ? 'KEVIN' : k >= 0 ? first(RIVALS[k].name).toUpperCase() : 'A RIVAL';
        const line = kev && EGG_LINES.leadYou ? pickLine(EGG_LINES.leadYou) : fillLine(pickLine(EGG_LINES.lead) || '{name} TAKES THE LEAD!', { name: nm });
        callout('drill', { t: line, z: 'THE EGG', col: kev ? '#7dffb0' : k >= 0 ? RIVALS[k].col : '#ff5c7a', sec: 1.3 });
        sfx('drillLead', { k, kevin: kev }); buzz(kev ? [15, 20, 30] : 20);
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
        sfx('frenzy', tier); R.flash = 0.35; R.flashCol = 'rgba(255,255,255,0.4)'; trauma(0.45 + 0.1 * tier); hitStop(80, null, null, 'frenzy');
        if (clock - lastSlowAt >= 2) slow(0.3 + tier * 0.05, !!ev.first);
        R.burst(p.x, p.y, '#ffd75c', 30, 260, 0.8, 4); R.pop(p.x, p.y + 80, name, '#ffd75c', 28 + tier * 2, 1.4);
        if (R.ring) R.ring(p.x, p.y, '#ffd75c', 90 + tier * 25, 0.5, 6);
        if (tier >= 3 && R.confetti) R.confetti(p.x, p.y, 20 + tier * 8);
        if (!S.frenzySeen) {
          S.frenzySeen = true; saveUI();
          if (!S.reduced) freezeT = 0.8;
          coach(TUT_TEXT.frenzy || 'FRENZY! Keep passing to stay on fire.', 2.6, 2);
        } else if (ev.desc && T && tier > 1) hint(ev.desc, 2.2, 1);
        A.intensity = 2; buzz(tier >= 3 ? [30, 40, 30, 40, 80] : [20, 30, 60]);
        comboFlash = 0.5;
        break;
      }
      case 'frenzyEnd': setIntensity(); sfx('frenzyEnd'); break;
      case 'sugar': fruitN++; sfx('sugar'); R.burst(ev.x, ev.y, '#7dffb0', 6, 90, 0.4, 2.5); tutMark('fruit'); break;
      case 'dna': {
        const n = Math.round(ev.amount || 5);
        sfx('dna'); R.burst(ev.x, ev.y, '#ff5cd2', 14, 140, 0.6, 3);
        R.pop(ev.x, ev.y + 20, '+' + n + ' DNA', n >= 10 ? '#ffd75c' : '#ff8be0', 16 + Math.max(0, Math.min(8, n - 5))); buzz(8);
        break;
      }
      case 'shield': sfx('shield'); R.pop(ev.x, ev.y + 20, POP('shield', '+1 SHIELD'), '#ffd75c', 16); buzz(12); break;
      case 'alkali': sfx('alkali'); R.pop(ev.x, ev.y + 20, POP('alkali', 'pH OK!'), '#5cc8ff', 14); break;
      case 'dash': dashBuf = 0; sfx('dash'); R.burst(p.x, p.y - 20, '#8cdcff', 10, 180, 0.4, 2.5); kick(0, -0.4); buzz(12); tutMark('dash'); break;
      case 'bonk': bonkN++; sfx('bonk'); trauma(0.55, 0, 1); kick(0, 0.6); hitStopRL(70, ev.x, ev.y, 'bonk'); R.pop(ev.x, ev.y, POP('bonk', 'SPLAT'), '#d9b8ff', 20); hint(pickLine(UI_LINES.bonkHint) || 'Find the GAP in the goo wall!', 2, 1); buzz(45); break;
      case 'surf': sfx('surf'); R.pop(ev.x, ev.y + 20, POP('surf', 'SURF!'), '#d9b8ff', 18); break;
      case 'bump': {
        trauma(0.3, 1, 0); kick(ev.x < p.x ? 0.3 : -0.3, 0); hitStopRL(50, ev.x, ev.y, 'bump'); R.pop(ev.x, ev.y + 20, POP('bump', 'BONK!'), '#ffb36b', 16); sfx('bump'); buzz(15);
        if (ev.boss) { const k = rivalIndex(ev); if (k >= 0) react(k, 'bump'); }
        break;
      }
      case 'pop':
        sfx('pop'); R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4); trauma(0.3); buzz(20);
        if (clock - lastPopStop >= 0.08) { lastPopStop = clock; hitStop(25); }
        break;
      case 'blast': sfx('blast', ev.n); if (R.ring) R.ring(ev.x, ev.y, '#ffffff', ev.r || 160, 0.5, 8); R.pop(ev.x, ev.y + 50, `${ev.n} POPPED!`, '#ffffff', 20 + Math.min(10, ev.n * 2), 1.2); buzz([20, 20, 40]); break;
      case 'shieldHit': sfx('hit'); trauma(0.5); hitStop(90, p.x, p.y, 'shieldHit'); R.flash = 0.5; R.flashCol = 'rgba(255,215,92,0.5)'; R.pop(p.x, p.y + 40, POP('shieldHit', 'SHIELD SAVED YOU'), '#ffd75c', 17); slow(0.5); buzz([40, 30, 40]); break;
      case 'wingHit': sfx('hit'); trauma(0.4); hitStop(90, p.x, p.y, 'wingHit'); R.pop(p.x, p.y + 40, POP('wingHit', 'WINGMAN TOOK IT') + ' 🫡', '#ffe0a8', 17); buzz([30, 30, 30]); break;
      case 'wingBack': sfx('heart'); R.pop(p.x, p.y + 50, 'WINGMAN IS BACK 🤝', '#ffe0a8', 16); break;
      case 'second': sfx('second'); hitStop(120, p.x, p.y, 'second'); trauma(0.5); R.flash = 0.8; R.flashCol = 'rgba(255,92,140,0.6)'; R.pop(p.x, p.y + 60, 'SECOND WIND!', '#ff5c8a', 26, 1.6); buzz([60, 40, 60, 40, 120]); break;
      case 'synergy': {
        const n = (meta.synergiesSeen || []).length, tot = SYNERGIES.length;
        if (R.ring) R.ring(p.x, p.y, '#d9b8ff', 130, 0.6, 7);
        const sh = SYNERGY_SHORT[ev.id];
        callout('synergy', { t: `${ev.icon || ''} ${ev.name || 'Synergy'}`, z: ev.fresh ? `NEW MASHUP DISCOVERED ${n}/${tot}` : 'MASHUP UNLOCKED', c: ev.desc || null, short: sh ? `${ev.icon || ''} ${sh}` : null, long: sh ? ev.desc || null : null, sec: 2.2 });
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
        R.pop(p.x, p.y + 60, ev.right ? POP('forkRight', 'RIGHT TUBE!') : POP('forkWrong', 'UH OH...'), ev.right ? '#ff9be0' : '#c9b6c2', 18);
        if (ev.right) hint('You smell something sweet up ahead...', 3, 1); else hint('Hmm. It smells... empty in here.', 3, 1);
        break;
      case 'backflow':
        sfx('backflow');
        R.pop(p.x, p.y + 60, POP('backflow', 'WRONG WAY!'), '#ff5c7a', 20);
        callout('event', { t: POP('backflow', 'WRONG WAY!'), z: 'BACKFLOW', sec: 1.6 }); buzz([20, 20]);
        break;
      case 'zone':
        crawlEnd();
        if (ev.draft === false) {
          const z = ZONES[ev.zi] || ZONES[ZONES.length - 1];
          if (ev.zi >= tutEndZone()) tutFinish();
          coachClear();
          zoneArrive(ev.zi, { t: z.name, z: `ZONE ${ev.zi + 1}`, sec: 1.6 }); A.bpm = z.beat; sfx('zone'); buzz([20, 40, 30]);
          coach(zoneCoach(z.id), firstSwim ? 4.5 : 3, 1);
          if (R.confetti) R.confetti(p.x, p.y, 30);
        }
        setIntensity();
        break;
      case 'finale': {
        sfx('finale');
        if (ev.sprinters && ev.sprinters.length) callout('event', { t: 'FINAL SPRINT!', z: 'THE EGG', c: andList(ev.sprinters.map(first)) + ' found a last gear!', sec: 2.4 });
        const ks = Array.isArray(ev.ks) ? ev.ks : [];
        const k0 = ks.length ? ks[0] : ev.sprinters && ev.sprinters.length ? RIVALS.findIndex((r) => first(r.name) === first(ev.sprinters[0])) : -1;
        if (k0 >= 0) react(k0, 'sprint', 2.4);
        // a rival who took the wrong tube is back for the finale
        const cb = ev.comeback, ck = Number.isInteger(cb) ? cb : typeof cb === 'string' ? RIVALS.findIndex((r) => first(r.name) === first(cb)) : Array.isArray(cb) && cb.length ? (Number.isInteger(cb[0]) ? cb[0] : RIVALS.findIndex((r) => first(r.name) === first(cb[0]))) : cb === true ? k0 : -1;
        if (ck >= 0 && RIVALS[ck]) {
          const r = RIVALS[ck];
          callout('event', { t: `${first(r.name).toUpperCase()} IS BACK!`, z: rivalKicker(r.name), col: r.col, sec: 1.8 });
          sayRival(ck, pickLine(byFirst(K.RIVAL_COMEBACK || {}, r.name) || []), 2.4, true);
        }
        break;
      }
      case 'swat': trauma(0.3, 1, 0); kick(ev.wall < 0 ? 0.4 : -0.4, 0); hitStopRL(45, p.x, p.y, 'swat'); R.pop(p.x, p.y + 40, 'SWAT!', '#5ce1ff', 16); sfx('swat'); buzz(20); break;
      case 'domino': R.pop(p.x, p.y + 90, `DOMINO x${ev.n}!`, '#ffd75c', 20); sfx('blast', ev.n); break;
      // panned by where the Big Macro is from Kevin (160 px is a full pan)
      case 'lockon': sfx('lockon', clamp(((ev.x != null ? ev.x : p.x) - p.x) / 160, -1, 1)); break;
      // a Big Macro spotted Kevin: a '!' over it and its own spotted sting, panned to where it is
      case 'spot': if (ev.x != null) R.pop(ev.x, ev.y + 40, '!', '#ff5c7a', 26, 0.7); sfx('spot', { pan: clamp(((ev.x != null ? ev.x : p.x) - p.x) / 160, -1, 1) }); break;
      // a gift (a free sugar on the first swims, systems 'gift'): a gold sugar sparkle where it was
      case 'gift': R.burst(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, '#ffd75c', 16, 140, 0.6, 3); if (R.ring) R.ring(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, '#ffd75c', 40, 0.4, 3); break;
      case 'drillTap': drillTapFx(ev); break;
      case 'rivalMove': rivalMoveFx(ev); break;
      case 'spareBite': R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 40, 'SPARE LIFE!', '#ffd75c', 18, 1.1); sfx('chomp'); buzz([20, 30, 20]); if (Array.isArray(K.SPARE_BITE_LINES) && K.SPARE_BITE_LINES.length) coach(pickLine(K.SPARE_BITE_LINES), 2.6, 1); break;
      case 'swatBonk': R.pop(ev.x != null ? ev.x : p.x, (ev.y != null ? ev.y : p.y) + 40, 'BONK!', '#7ae0ff', 20, 0.9); sfx('bonk'); buzz(12); break;
      case 'goalMet':
        goalHit = true; goalPill();
        callout('goal', { t: 'GOAL SMASHED!', z: '+' + fmt(ev.dna || 0) + ' 🧬', c: fillLine(pickLine(K.GOAL_MET_LINES) || '', { dna: fmt(ev.dna || 0) }) || null, col: '#ffd75c', sec: 1.8 });
        sfx('record'); buzz([20, 30, 60]);
        break;

      case 'record': sfx('record'); R.pop(p.x, p.y + 90, 'NEW BEST PLACE!', '#ffd75c', 20, 1.4); break;
      case 'eggClaim': claimEgg(ev); break;
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
      case 'drill':
        sfx('egg'); drillLesson();
        callout('drill', { t: ev.rank === 1 ? (pickLine(EGG_LINES.first) || 'FIRST ONE THERE!') : `#${ev.rank} AT THE EGG`, z: 'THE EGG', sec: 1.6 });
        slow(0.6, true); buzz([40, 40, 80]);
        break;
      case 'over': finish(ev); break;
    }
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
function slow(sec, big) {
  if (S.reduced) return;
  slowT = Math.max(slowT, sec); try { A.slowmo(true, !!big); } catch (e) { /* ignore */ }
}
let tensionV = 0;
function setTension(v) { if (Math.abs(v - tensionV) < 0.02 && !(v === 0 && tensionV !== 0)) return; tensionV = v; try { A.tension = v; } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ the egg panel: you vs the best rival
const DU = (() => { const ui = $('drillUI'); return { ui, t: ui.querySelector('.t'), cd: ui.querySelector('.cd'), you: ui.querySelector('.you i'), youB: ui.querySelector('.you b'), riv: ui.querySelector('.riv'), rivI: ui.querySelector('.riv i'), rivB: ui.querySelector('.riv b'), ep: ui.querySelector('.ep'), rate: ui.querySelector('.rate'), rateI: ui.querySelector('.rate i') }; })();
let eggOn = false;
// drill feel: core's 'drillTap' {n} is the taps it really counted. Each counted batch bursts, shakes and buzzes harder the
// further in Kevin is (frac = me / need); every 5th counted tap holds a beat with a ring. The meter shows taps a second
// (core counts 8 at most): gold with MAX! at the cap.
const DRILL_CAP = 8;
let drillTapLog = [], drillCounted = 0, gaspDone = false, photoDone = false, photoT = 0, tellOn = 0;
function drillTapFx(ev) {
  const n = ev.n | 0; if (n <= 0 || !race || !race.drill) return;
  const p = race.p, frac = clamp((race.drill.me || 0) / (race.drill.need || 1), 0, 1);
  R.burst(p.x, p.y + 20, '#5ce1ff', Math.round(4 + 8 * frac), 160, 0.3, 2);
  trauma(0.06 + 0.12 * frac); if (R.zoomPunch) R.zoomPunch(0.015 + 0.035 * frac);
  buzz(12);
  for (let i = 0; i < n; i++) {
    drillTapLog.push(clock); drillCounted++;
    if (drillCounted % 5 === 0) { hitStop(22); if (R.ring) R.ring(p.x, p.y, frac > 0.7 ? '#ffd75c' : '#5ce1ff', 60 + 40 * frac, 0.3, 4); }
  }
  // a tap answers the rival's tell
  tellOn = 0;
}
// a named rival's signature move at the egg (systems 'rivalMove' {k, move, phase}): the tell, the hit, the counter
function rivalMoveFx(ev) {
  try { if (R.rivalMove) R.rivalMove(ev); } catch (e) { /* optional */ }
  const k = rivalIndex(ev), r = RIVALS[k]; if (!r) return;
  const fn = first(r.name), p = race.p;
  if (ev.phase === 'tell') {
    callout('drill', { t: byFirst(K.RIVAL_MOVE_NAMES || {}, r.name) || 'WATCH OUT!', z: rivalKicker(r.name), zKeep: true, col: r.col, sec: 0.8 });
    sayRival(k, pickLine(byFirst(K.RIVAL_MOVE_TELLS || {}, r.name) || []), 1.6, true);
    buzz([12, 10, 12], true); sfx('rivalTell', ev.k != null ? ev.k : k);
    tellOn = clock + 1.2;
  } else if (ev.phase === 'hit') {
    trauma(0.3); kick(0, 0.3); buzz([20, 20, 30]); tellOn = 0;
  } else if (ev.phase === 'countered') {
    hitStop(90, p.x, p.y, 'countered');
    R.pop(p.x, p.y + 90, pickLine(K.EGG_COUNTER_BANNERS || ['COUNTERED!']), '#ffd75c', 28, 1.2);
    sfx('countered'); buzz([15, 20, 40]); tellOn = 0;
    sayRival(k, pickLine(byFirst(K.RIVAL_COUNTERED || {}, r.name) || []), 1.8, true);
  }
  void fn;
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
  if (!race || race.demo || race.over) { eggOn = false; drillRingsTick(0); setC(DU.ui, 'hide', true); return; }
  const need = race.drill ? race.drill.need : (C.EGG_DRILL || 3);
  let best = null, f = 0;
  for (const a of race.agents) if (a.alive && a.arrived) { const af = (a.drill || 0) / (a.need || need); if (af > f) { f = af; best = a; } }
  if (rivalF > f) { f = rivalF; if (rivalK >= 0 && race.agents[rivalK]) best = race.agents[rivalK]; }
  if (best && !eggClaimed) claimEgg({ name: best.boss ? best.boss.name : '', col: best.boss ? best.boss.col : null });
  const on = !!race.drill || !!best;
  if (on && !eggOn) coachClear();
  if (on !== eggOn) requestAnimationFrame(measureHud);
  eggOn = on;
  setC(DU.ui, 'hide', !on);
  if (!on) setC(document.body, 'egg', false);

  const me = race.drill ? (race.drill.me || 0) / need : 0;
  // photo finish: both of you past 85%: the world slows, the camera leans in, the band holds its breath (once)
  if (!photoDone && race.drill && best && me >= 0.85 && f >= 0.85) { photoDone = true; photoT = clock + 1.2; slow(1.0, true); if (R.zoomPunch) R.zoomPunch(0.15); }
  // the lead passes 90%: one gasp from the band
  if (!gaspDone && race.drill && Math.max(me, f) > 0.9) { gaspDone = true; try { if (A.duelGasp) A.duelGasp(); } catch (e) { /* optional */ } }
  setTension(clock < photoT ? 1 : best ? clamp(0.25 + f * 0.75, 0, 1) : race.drill ? 0.2 : 0);
  drillRingsTick(need);
  if (!on) return;
  // the tap-rate meter, and a pulsing TAP! while a rival winds up a move
  drillTapLog = drillTapLog.filter((t) => clock - t < 1);
  const rate = drillTapLog.length / DRILL_CAP;
  setC(DU.rate, 'hide', !race.drill); setBar(DU.rateI, rate); setC(DU.rate, 'max', rate >= 0.99);
  setC(DU.ui, 'tell', clock < tellOn);
  if (clock < tellOn) setT(DU.t, 'TAP! TAP!'); else setT(DU.t, 'TAP TAP TAP!');
  setC(DU.ui, 'claim', !!best);
  setC(DU.t, 'hide', !race.drill);
  // the egg panel sits under the HUD: the coach strip steps away and the egg banners and the drill lesson go below it
  setC(document.body, 'egg', true);
  const dk = (race.drill ? 'd' : '') + (best ? 'b' : '');
  if (DU.ui._k !== dk) { DU.ui._k = dk; requestAnimationFrame(() => { const h = DU.ui.offsetHeight; if (h) { document.documentElement.style.setProperty('--duB', `calc(var(--hudB) + ${h + 14}px)`); document.documentElement.style.setProperty('--duH', h + 'px'); } measureHud(); }); }
  setBar(DU.you, race.drill ? race.drill.me / need : race.progress());
  setT(DU.youB, race.drill ? 'YOU' : 'YOU 🏊');
  setC(DU.riv, 'hide', !best); setC(DU.riv, 'hot', f > 0.7);
  if (best) {
    setBar(DU.rivI, f);
    const nm = best.boss ? first(best.boss.name).toUpperCase() : 'RIVAL';
    setT(DU.rivB, nm); setT(DU.ep, best.boss ? epithetOf(best.boss.name) : '');
    // a big countdown: seconds in a fixed-width number, red under 1.5 s
    const secs = Math.max(0, (1 - f) * need), st = secs.toFixed(1), key = nm + '|' + st;
    if (DU.cd._k !== key) {
      DU.cd._k = key; DU.cd._v = null;
      DU.cd.innerHTML = `<small>${esc(nm)} BREAKS IN</small><b class="${secs < 1.5 ? 'hot' : ''}">${st}s</b>`;
    }
  } else if (DU.cd._k !== '') { DU.cd._k = ''; DU.cd.textContent = 'Drill in before the others do!'; setT(DU.ep, ''); }
}

// ------------------------------------------------------------------ end of run
let resAnim = null, prevBestCombo = 0, lastResult = null, resultReady = false, resultTO = 0;
// the egg finale: the result card waits (3 s on a win, 2.4 s on a steal) while the rivals at the egg have their say;
// the first tap after 0.8 s skips straight to it. The timer is set first, so nothing below can ever lock the swim.
let finHold = null, overAt = -1;
function goResult(fin, o) {
  if (race !== fin || race.over !== o || mode !== 'race') return;
  finHold = null;
  try { showResult(o); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left to show */ } }
}
function finishSkip() {
  if (!finHold || clock < finHold.ready && performance.now() < finHold.readyMs) return false;
  const h = finHold; clearTimeout(h.to); goResult(h.fin, h.o); return true;
}
function finish(o) {
  const fin = race, win = o.reason === 'win', stolen = o.reason === 'late' && !!race.drill;
  const wait = win ? 3000 : stolen ? 2400 : o.reason === 'quit' ? 300 : 900;
  const to = setTimeout(() => goResult(fin, o), wait);
  finHold = { fin, o, to, ready: clock + 0.8, readyMs: performance.now() + 800 };
  try { save(); } catch (e) { /* storage */ }
  lastResult = o;
  try {
    clearInput(); setTension(0);
    if (win) buzz([50, 50, 50, 50, 200], true); else buzz([90, 60, 160], true);
    hitStop(160);
    // the egg itself: a stolen egg names the thief in their colour and lets it sink in; a win says who is in
    if (stolen || win) {
      const th = race.eggTaken && race.eggTaken.boss ? race.eggTaken.boss : null;
      const nm = win ? 'KEVIN' : th ? first(th.name).toUpperCase() : o.by ? first(o.by).toUpperCase() : 'A RIVAL';
      const pool = win ? EGG_LINES.win : EGG_LINES.stolen, line = fillLine(pickLine(pool) || (win ? '{name} IS IN!' : '{name} STOLE THE EGG!'), { name: nm });
      coClear();
      callout('drill', { t: line, z: 'THE EGG', col: win ? '#7dffb0' : th ? th.col : '#ff5c7a', red: !win, sec: win ? 1.4 : 1.7 });
      eggFinaleLines(win, th);
    }
    if (win) { R.flash = 1; R.flashCol = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) R.burst(race.p.x, race.p.y + 150, ['#ffd75c', '#ff5c8a', '#5ce1ff'][i % 3], 30, 400, 1.4, 5); if (R.confetti) R.confetti(); }
    else if (o.reason !== 'quit') { trauma(0.8); R.flash = 0.5; R.flashCol = 'rgba(120,0,30,0.6)'; }
  } catch (e) { console.error(e); }
}
// each named rival still at the egg says one line, 0.35 s apart: a win gets their sore-loser lines, a steal the thief's
// line from inside the egg and one sore line from another rival
function eggFinaleLines(win, thief) {
  const at = [];
  RIVALS.forEach((r, k) => { const a = race.agents[k]; if (a && a.alive && a.arrived && a.boss && (!thief || a.boss !== thief)) at.push(k); });
  const says = [];
  if (win) for (const k of at) says.push([k, pickLine(byFirst(K.RIVAL_EGG_LOSS || {}, RIVALS[k].name) || [])]);
  else {
    const tk = thief ? RIVALS.findIndex((r) => r.name === thief.name || first(r.name) === first(thief.name)) : -1;
    if (tk >= 0) says.push([tk, pickLine(byFirst(K.RIVAL_STEAL || {}, RIVALS[tk].name) || [])]);
    if (at.length) says.push([at[0], pickLine(byFirst(K.RIVAL_EGG_LOSS || {}, RIVALS[at[0]].name) || [])]);
  }
  says.filter((x) => x[1]).forEach(([k, l], i) => later(0.35 * i + 0.3, () => sayRival(k, l, 1.6, true)));
}
// a tiny clock-driven delay queue (pauses with the race, cleared on a new swim)
let laterQ = [];
function later(sec, fn) { laterQ.push({ at: clock + sec, fn }); }
function laterTick() {
  if (!laterQ.length) return;
  const due = laterQ.filter((q) => clock >= q.at); if (!due.length) return;
  laterQ = laterQ.filter((q) => clock < q.at);
  for (const q of due) { try { q.fn(); } catch (e) { console.error(e); } }
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
  if (o.reason === 'win' || o.reason === 'quit') return null;
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
function statQuip(o, win) {
  const Q = K.RESULT_STAT_QUIPS; if (!Q || Math.random() >= 0.4) return '';
  const z = o.zone | 0, fits = [];
  if (!win && o.reason !== 'quit' && z === 0 && (race.t || 0) < 25) fits.push(['fastDeath', {}]);
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
  near: 'So near!', podium: 'Podium', firstWin: 'First win!' };

function receipt(o) {
  const bd = o.breakdown, out = [];
  const add = (label, v, key) => {
    if (v == null || !Number.isFinite(+v)) return; v = +v;
    const mult = /^gen/i.test(key || label) && v > 0 && v < 10;
    if (mult && Math.abs(v - 1) < 0.01) return;
    if (/^auto/i.test(key || label) && v > 0) v = -v;   // the autopilot cut comes off the total
    if (!mult && Math.round(v) === 0) return;
    out.push({ label, v, mult });
  };
  if (Array.isArray(bd)) for (const it of bd) { if (Array.isArray(it)) add(String(it[0]), it[1]); else if (it && typeof it === 'object') add(String(it.label || BD_LABELS[it.k || it.key || it.id] || it.k || it.key || it.id || ''), it.dna ?? it.v ?? it.value, it.k || it.key || it.id); }
  else if (bd && typeof bd === 'object') for (const k of Object.keys(bd)) add(BD_LABELS[k] || k, bd[k], k);
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
  return fillLine(tpl, { name, zone, n: g.n ?? g.target ?? '' }) + (dna > 0 ? ` +${fmt(dna)} 🧬` : '');
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
function rematchLabel(o, by, close) {
  if (o.reason !== 'win' && by) { const l = byFirst(REMATCH_LINES, by); if (Array.isArray(l) && l.length) return pickLine(l); }
  if (close && REMATCH_LINES.close) return pickLine(REMATCH_LINES.close);
  return pickLine(REMATCH_LINES.default) || 'SWIM AGAIN 💦';
}
function babyCanvas(b, size) {
  const c = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px'; c.className = 'face';
  try { const g = c.getContext('2d'); g.scale(d, d); if (R.babyPortrait) R.babyPortrait(g, b, size); } catch (e) { /* the emoji stays */ }
  return c;
}
const firstWord = (b) => (BABY_FIRST_WORDS.length ? BABY_FIRST_WORDS[((b.run | 0) * 7) % BABY_FIRST_WORDS.length] : '');
let nemAtStart = null;
// which cause a zone's own death jokes are about (the egg's only when you were drilling)
const ZONE_HAZ = { acid: 'acid', sea: 'wbc', goo: 'bonk', fork: 'wrong', rapids: 'energy', egg: 'late' };
function showResult(o) {
  mode = 'result'; hud(false); menuMusic(); muffle(false); A.intensity = 0.3;
  const win = o.reason === 'win', z = ZONES[clamp(o.zone | 0, 0, ZONES.length - 1)], by = byName(o), reason = o.reason;
  const g = gapInfo(o, by);
  // ONE foe for the whole screen: who took the egg, else the named rival nearest ahead, else whoever the gap names
  const foe = win || reason === 'quit' ? null : by || o.gapBy || (g && g.name) || null;
  const byK = foe ? RIVALS.findIndex((r) => first(r.name) === first(foe)) : -1, topK = win ? topDriller() : -1;
  sfx(win ? 'win' : 'lose', win ? (topK >= 0 ? topK : undefined) : (byK >= 0 ? byK : undefined));
  const prog = clamp(race.p.y / RACE_LEN, 0, 1), close = !win && reason !== 'quit' && prog >= 0.85;
  // what really ended the swim (core's o.cause); reaching the egg and losing the drill is always 'late'
  const drilled = !!race.drill;
  let cause = win ? 'win' : o.cause || (reason === 'energy' && race.p.acid > 0 ? 'acid' : reason === 'energy' && bonkN >= 3 ? 'bonk' : reason);
  if (!win && drilled && reason !== 'quit') cause = 'late';
  o.uiCause = cause;
  // headline and the why
  let tt, why, near = false;
  if (win) { tt = "IT'S A BABY! 🍼"; why = topK >= 0 ? linesOf(RIVALS[topK].name).loseEgg || pickLine(WIN_LINES) : pickLine(WIN_LINES); }
  else if (by) { tt = `${first(by).toUpperCase()} GOT THERE FIRST`; why = linesOf(by).stealEgg || pickLine(DEATH_LINES.late); }
  else if (reason === 'quit') { tt = pickLine(RESULT_TITLES.quit) || 'BREAK TIME'; why = pickLine(DEATH_LINES.quit) || 'Kevin is taking a little break.'; if (o.counted === false) why += ' Too short to count: no daily, no rival record.'; }
  else if ((o.zone | 0) >= 6) { tt = pickLine(RESULT_TITLES.close) || 'SO. CLOSE.'; why = null; }
  else { tt = pickLine(RESULT_TITLES[cause]) || pickLine(RESULT_TITLES[reason]) || pickLine(LOSE_TITLES); why = null; }
  if (!why) {
    // a near miss gets a line that points at the next swim; otherwise the zone's own joke, but only when its hazard did it
    const bucket = g ? (g.sec < 0.3 ? 'hair' : g.sec < 1 ? 'tail' : g.sec < 3 ? 'length' : '') : '';
    const zh = ZONE_HAZ[z.id], zoneFits = zh === cause && (z.id !== 'egg' || drilled);
    if (bucket && NEAR_MISS_BY_GAP && Array.isArray(NEAR_MISS_BY_GAP[bucket]) && NEAR_MISS_BY_GAP[bucket].length) { why = pickLine(NEAR_MISS_BY_GAP[bucket]); near = true; }
    else if (o.rank <= 10 && NEAR_MISS_LINES.length) { why = pickLine(NEAR_MISS_LINES); near = true; }
    // out of GAS with the egg in sight gets its own lines
    else if (cause === 'energy' && (o.zone | 0) >= 5 && Array.isArray(DEATH_LINES.energyEgg) && DEATH_LINES.energyEgg.length) why = pickLine(DEATH_LINES.energyEgg);
    else if (zoneFits && DEATH_BY_ZONE[z.id] && Math.random() < 0.5) why = pickLine(DEATH_BY_ZONE[z.id]);
    else why = pickLine(DEATH_LINES[cause] || DEATH_LINES[reason] || DEATH_LINES.energy);
  }
  $('resTitle').textContent = tt; $('resWhy').textContent = why;
  // two joke lines at most: the why and the rank line (none after a near-miss line, which already says it).
  // Never contradict the headline: rank 1 and 2 lines only ever mean a win
  // the joke line: about 40% of the time one about this very swim (when one fits), else the rank joke
  // a close loss (beaten by under 3 s) keeps its two joke lines for the why and the rival's gloat: no rank line
  const closeLoss = !!foe && !!g && g.sec < 3;
  const sq = near || closeLoss ? '' : statQuip(o, win);
  $('resRankLine').textContent = near || closeLoss ? '' : sq || (!win && o.rank <= 2 ? pickLine(LOSS_RANK_LINES) : rankLine(o.rank));
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
    }
  }
  const syn = Array.isArray(o.synergies) ? o.synergies.map((id) => SYNERGIES.find((s) => s.id === id)).filter(Boolean) : [];
  $('resMuts').innerHTML = Object.keys(race.muts).filter((id) => MUTATIONS[id]).map((id) => `<span>${MUTATIONS[id].icon} ${esc(MUTATIONS[id].name)}${race.muts[id] > 1 ? ' x' + race.muts[id] : ''}</span>`).join('') + syn.map((s) => `<span class="sy">${s.icon} ${esc(s.name)}</span>`).join('');
  // rival ladder with lifetime win-loss, the nemesis marked, and the gap to the one who beat you
  const beat = beatenSet(o), nemNow = nemesisOf();
  const settled = nemAtStart && RIVALS.some((r, k) => first(r.name) === nemAtStart && beat.has(k));
  $('resLadder').innerHTML = RIVALS.map((r, k) => {
    const x = rivalRec(r.name), fn = first(r.name), nem = fn === nemNow || fn === nemAtStart, won = beat.has(k);
    const cls = [won ? 'on' : 'lost', nem ? 'nemesis' : '', settled && fn === nemAtStart ? 'beaten' : ''].join(' ').trim();
    return `<span class="${cls}" style="--c:${r.col}"><u>${won ? '✓' : '✗'}</u>${esc(fn)}<small>${x.beat | 0}-${x.lost | 0}</small>${nem && !(settled && fn === nemAtStart) ? '<em>NEMESIS</em>' : ''}</span>`;
  }).join('<i>›</i>');
  const gs = $('resGrudge');
  if (settled) {
    gs.innerHTML = `GRUDGE SETTLED<small>${esc(byFirst(RIVAL_SETTLED, nemAtStart) || linesOf(nemAtStart).beaten || '')}</small>`;
    gs.classList.remove('hide'); setTimeout(() => { if (mode === 'result') sfx('record'); }, 900);
  } else gs.classList.add('hide');
  // ONE celebration badge, in this order: the NEW RECORD stamp, the best badge (first record, daily best), the gap's NEW BEST
  const firstRec = prevBest >= TOTAL_SWIMMERS, rec = o.rank < prevBest, dailyBest = o.daily != null && !!o.dailyBest;
  const gEl = $('resGap');
  let gapNB = false;
  if (g) {
    const had = S.bestGap > 0, better = !had || g.sec < S.bestGap;
    if (better) { S.bestGap = g.sec; saveUI(); }
    gapNB = had && better && !rec && !dailyBest;
    gEl.innerHTML = `${g.name ? esc(first(g.name)) : 'The winner'} beat you by ${g.sec.toFixed(1)} s${gapNB ? '<span class="nb">NEW BEST</span>' : ''}`;
    gEl.style.color = byK >= 0 && (!g.name || first(g.name) === first(foe)) ? RIVALS[byK].col : '';
    gEl.classList.remove('hide');
  } else gEl.classList.add('hide');
  // the foe gloats (a tight one under a second), unless the why line is already a near-miss line
  const gw = $('resGloat');
  let gloat = '';
  // a stolen egg: the thief talks from inside it (RIVAL_STEAL); a close loss always gets the gloat, a tight one under 1 s
  const stealLine = reason === 'late' && drilled && by ? pickLine(byFirst(K.RIVAL_STEAL || {}, by) || []) : '';
  if (stealLine) gloat = stealLine;
  else if (foe && (!near || closeLoss)) {
    const tight = g && g.sec < 1 && K.RIVAL_GLOATS_TIGHT && K.RIVAL_GLOATS_TIGHT.length;
    gloat = tight ? `${first(foe)}: ${pickLine(K.RIVAL_GLOATS_TIGHT)}` : pickLine(byFirst(K.RIVAL_GLOATS || {}, foe) || []);
  }
  setT(gw, gloat || ''); setC(gw, 'hide', !gloat);
  if (gloat) gw.style.setProperty('--c', byK >= 0 ? RIVALS[byK].col : '#ff8b9b');
  // one chip row: the swim in numbers; a beaten combo record turns it gold (unless the big NEW RECORD stamp goes off)
  const comboRec = o.combo > prevBestCombo && prevBestCombo > 0 && !(rec && !firstRec);
  const chips = $('resChips');
  chips.innerHTML = comboRec ? `<b>NEW BEST COMBO</b> x${fmt(o.combo)} · ${fmt(o.overtakes)} passed · ${(o.dist / PX_PER_CM).toFixed(1)} cm`
    : `COMBO x${fmt(o.combo)} · ${fmt(o.overtakes)} passed · ${(o.dist / PX_PER_CM).toFixed(1)} cm`;
  setC(chips, 'gold', comboRec);
  // nine generations: the dynasty stamp, once ever
  const dy = $('resDynasty');
  if (win && o.baby && !o.baby.practice && meta.gen >= 9 && !S.dynastySeen && DYNASTY_STAMP) {
    S.dynastySeen = true; saveUI(); dy.textContent = DYNASTY_STAMP; dy.classList.remove('hide');
    setTimeout(() => { if (mode === 'result') { sfx('record'); if (R.confetti) R.confetti(); } }, 1300);
  } else dy.classList.add('hide');
  const eg = $('resEgg');
  placeResEgg(close);
  if (reason === 'late' || reason === 'energy' || close) {
    const cm = race.remaining() / PX_PER_CM;
    const bar = eg.querySelector('i'); bar.style.transition = 'none'; bar.style.transform = `scaleX(${close && !S.reduced ? 0 : prog.toFixed(3)})`;
    if (close && !S.reduced) { void bar.offsetWidth; bar.style.transition = ''; requestAnimationFrame(() => { bar.style.transform = `scaleX(${prog.toFixed(3)})`; }); }
    const sp = eg.querySelector('span'), sec = g ? g.sec : 99;
    // a hair short (under half a cm, or under a second): one of the numbered near-miss jokes, the number in bold
    const sbk = cm < 0.15 || sec < 0.3 ? 'hair' : 'tiny', sbl = K.SHORT_BY_LINES && K.SHORT_BY_LINES[sbk];
    if (!win && (cm < 0.5 || sec < 1) && Array.isArray(sbl) && sbl.length) {
      sp.innerHTML = fillLine(esc(pickLine(sbl)), { cm: `<b>${cm.toFixed(cm < 1 ? 2 : 1)}</b>`, sec: `<b>${sec.toFixed(1)}</b>` });
    } else sp.textContent = race.drill ? 'You made it to the egg!' : `${cm.toFixed(cm < 1 ? 2 : 1)} cm short of the egg (${Math.min(99, Math.round(prog * 100))}% of the way)`;
    eg.classList.remove('hide');
    if (close) setTimeout(() => { if (mode === 'result') sfx('loseClose'); }, 700);
  } else eg.classList.add('hide');
  // the receipt counts up line by line
  const lines = receipt(o);
  $('resReceipt').innerHTML = lines.map((l) => `<div class="${!l.mult && l.v < 0 ? 'neg' : ''}"><span>${esc(l.label)}</span><b>${l.mult ? 'x' + +l.v.toFixed(2) : (l.v < 0 ? '-' : '+') + '0'}</b></div>`).join('');
  $('resDna').textContent = '+0 DNA 🧬';
  $('resBest').textContent = rec ? (firstRec ? 'FIRST RECORD!' : `old best #${fmt(prevBest)}`) : `best ever #${fmt(meta.best)}`;
  if (dailyBest) $('resBest').textContent += ' · DAILY BEST!';
  $('resBest').className = 'badge hide';
  $('resRecord').classList.add('hide');
  $('shareBtn').textContent = o.daily != null ? 'Share Daily 📅' : 'Brag 📋';
  renderResUp();
  // one lesson (plain words on the very first swim, never after a close one) and the next Kevin
  const big = !win && meta.runs === 1 && !close && !(g && g.sec < 3) && FIRST_DEATH[cause];
  let tip = win || reason === 'quit' ? '' : big || pickLine(TIP_BY_REASON[cause]) || pickLine(TIP_BY_REASON[reason]) || pickLine(TIPS);
  // Dad's Pick already says what to fix for this cause (from swim 3 on): no second lesson on top
  if (!big && meta.runs > 2 && resPickCause === cause) tip = '';
  $('resTip').textContent = tip;
  $('resTip').classList.toggle('big', !!big);
  $('resSyn').textContent = !tip && !resPickShown ? soCloseLine() : '';
  const nk = kevinNo(), kt = nk <= 3 ? KEVIN_NEXT.few : nk <= 10 ? KEVIN_NEXT.many : KEVIN_NEXT.tenPlus;
  const ms = RUN_MILESTONES.find((x) => x[0] === meta.runs);
  // the next-Kevin joke only when there is no tip to read, or once the player knows the ropes (swim 3 on)
  let nx = ms ? ms[1] : win || (tip && meta.runs < 3) ? '' : fillLine(pickLine(kt), { n: fmt(nk) });
  if (o.daily != null && DAILY_LINES.streak && streakOf() > 0) nx = (DAILY_LINES.streak[clamp(streakOf(), 1, DAILY_LINES.streak.length) - 1] || '') + (nx ? ' ' + nx : '');
  // the family saga: the first loss in each zone, and Coach Gonad's clues at their run counts, go above the next-Kevin line
  const story = [];
  if (!win && reason !== 'quit' && o.counted !== false && K.ZONE_FIRST_LOSS && K.ZONE_FIRST_LOSS[z.id] && !S.zoneLoss.includes(z.id)) {
    S.zoneLoss.push(z.id); saveUI(); story.push(fillLine(K.ZONE_FIRST_LOSS[z.id], { n: fmt(kevinN) }));
  }
  const clue = Array.isArray(K.COACH_CLUES) ? K.COACH_CLUES.find((x) => x[0] === meta.runs && !S.clues.includes(x[0])) : null;
  if (clue) { S.clues.push(clue[0]); saveUI(); story.push(clue[1]); }
  $('resNext').textContent = story.concat(nx ? [nx] : []).slice(0, 2).join('\n');
  // the bounty rides on the rematch button; once today's daily is done, a line for tomorrow sits above it
  const goal = nextGoalLine(o.nextGoal);
  let tmr = '';
  if (o.daily != null && o.counted !== false && Array.isArray(K.TOMORROW_LINES) && K.TOMORROW_LINES.length && typeof C.dailySeed === 'function' && meta.dailyDay === C.dailySeed()) {
    const day = streakOf() + 1, n = typeof C.dailyBonusFor === 'function' ? C.dailyBonusFor(day, meta.gen) : 0;
    tmr = fillLine(K.TOMORROW_LINES[day % K.TOMORROW_LINES.length], { n: fmt(n), day });
  }
  setT($('resGoal'), tmr); setC($('resGoal'), 'hide', !tmr);
  // the rematch button names who you are coming back for, in their colour
  const ab = $('againBtn'), rl = rematchLabel(o, foe, close);
  ab.innerHTML = esc(rl) + (goal ? `<small>🎯 ${esc(goal)}</small>` : '');
  medalStamp(o);
  // short phones: the lesson and the tomorrow line leave the sticky bar (it keeps just the buttons)
  { const acts = $('resActions'), short = innerHeight <= 700;
    for (const id of ['resGoal', 'resTip']) { const el = $(id); if (short) { if (el.parentNode === acts) acts.parentNode.insertBefore(el, acts); } else if (el.parentNode !== acts) acts.insertBefore(el, acts.firstChild); } }

  ab.style.setProperty('--rc', byK >= 0 && !win ? RIVALS[byK].col : '#ff3d6e');
  ab.classList.toggle('rival', byK >= 0 && !win);
  // buttons wake up after a beat, so a panicked tap does not skip the screen
  resultReady = false; clearTimeout(resultTO);
  for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn']) { const b = $(id); b.classList.remove('ready', 'breathe'); b.classList.add('wait'); }
  $('resShopBtn').classList.toggle('prime', meta.runs === 1);
  badges();
  show('result'); $('result').scrollTop = 0;
  resultTO = setTimeout(() => {
    resultReady = true; sfx('ready');
    for (const id of ['againBtn', 'resShopBtn', 'resMenuBtn']) { const b = $(id); b.classList.remove('wait'); void b.offsetWidth; b.classList.add('ready'); }
    $('againBtn').classList.add('breathe');
  }, 600);
  const red = S.reduced;
  resAnim = { t: 0, dur: red ? 0.01 : 1.2, step: red ? 0.01 : 0.28, rank: o.rank, dna: o.dna, rec, firstRec, celebrate: firstRec || dailyBest, gapNB, done: false, tick: 0, lines, shown: -1 };
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
    const rr = $('resRank'); rr.classList.remove('land'); void rr.offsetWidth; rr.classList.add('land');
    // ONE record line: the big stamp for a real record, the small badge otherwise (and on the very first swim)
    if (a.rec && !a.firstRec) {
      $('resRecord').innerHTML = `NEW RECORD! 🏆${RECORD_LINES.length ? `<small>${esc(pickLine(RECORD_LINES))}</small>` : ''}`;
      $('resRecord').classList.remove('hide'); $('resBest').classList.add('hide');
      sfx('record'); buzz([30, 40, 30, 40, 90], true);
      if (R.confetti) { R.confetti(); R.confetti(); }
    } else if (a.celebrate || !a.gapNB) { $('resBest').classList.remove('hide'); $('resBest').classList.toggle('rec', !!a.rec); }
  }
  // then the receipt, one line at a time
  const rows = $('resReceipt').children, lt = a.t - a.dur, n = a.lines.length;
  const totalDur = a.step * Math.max(1, n);
  for (let i = 0; i < n; i++) {
    const li = a.lines[i], f = clamp((lt - i * a.step) / (a.step * 0.8), 0, 1), row = rows[i]; if (!row) continue;
    if (f > 0 && !row.classList.contains('on')) { row.classList.add('on'); sfx('tap', 0.4 + i * 0.1); }
    if (f > 0) setT(row.lastChild, li.mult ? 'x' + +li.v.toFixed(2) : (li.v < 0 ? '-' : '+') + fmt(Math.abs(li.v) * f));
  }
  const ft = clamp(lt / totalDur, 0, 1);
  if (k >= 1) $('resDna').textContent = `+${fmt(a.dna * ft)} DNA 🧬`;
  if (k >= 1 && ft >= 1) { a.done = true; if (!a.rec || a.firstRec) sfx('dna'); renderResUp(); }
}
// one quick upgrade right on the result screen: Dad's Pick follows what ended the swim, else the cheapest
const DAD_PICKS = { energy: ['water', 'sleep', 'berries'], acid: ['water', 'sleep', 'berries'], wbc: ['hottub', 'sleep'], late: ['broccoli', 'beatbox'],
  bonk: ['walk', 'broccoli'], wrong: ['meditate', 'broccoli'], win: ['meditate', 'hottub', 'gps', 'factory'] };

let resPickShown = false, resPickCause = null;
// Dad's Pick for the shop: what the last swim's ending asks for (one that can still level), the affordable one first
function dadPickId() {
  const o = lastResult; if (!o) return null;
  const cause = o.uiCause || (o.reason === 'win' ? 'win' : o.cause || o.reason), wants = DAD_PICKS[cause] || [];
  const open = wants.filter((id) => HABITS[id] && lv(meta, id) < habMax(id));
  return open.find((id) => meta.dna >= habitCost(id, lv(meta, id))) || open[0] || null;
}
function renderResUp() {
  const el = $('resUp'), o = lastResult || {};
  const opts = HABIT_ORDER.filter((id) => lv(meta, id) < habMax(id)).map((id) => ({ id, l: lv(meta, id), cost: habitCost(id, lv(meta, id)) })).sort((a, b) => a.cost - b.cost);
  if (!opts.length) { el.classList.add('hide'); resPickShown = false; resPickCause = null; return; }
  const cause = o.uiCause || (o.reason === 'win' ? 'win' : o.cause || o.reason), wants = DAD_PICKS[cause] || [];
  const picks = wants.map((id) => opts.find((x) => x.id === id)).filter(Boolean);
  const dad = picks.find((x) => meta.dna >= x.cost) || picks[0] || null;
  const can = dad && meta.dna >= dad.cost ? dad : opts.find((x) => meta.dna >= x.cost), x = dad || can || opts[0], h = HABITS[x.id];
  const a = habEff(x.id, x.l), b = habEff(x.id, x.l + 1);
  const eff = a && b ? (x.l ? `${esc(a)} → ${esc(b)}` : 'Next: ' + esc(b)) : esc(h.desc);
  const dl = DAD_PICK_LINES[cause === 'energy' && (o.zone | 0) >= 5 && DAD_PICK_LINES.energyEgg ? 'energyEgg' : cause] || DAD_PICK_LINES.generic || '';
  const why = dad && x === dad ? `<div class="dp">DAD'S PICK${dl ? ' · ' + esc(dl) : ''}</div>` : '';
  const affordable = meta.dna >= x.cost;
  resPickShown = !!why; resPickCause = why ? cause : null;
  el.classList.remove('hide'); el.classList.toggle('can', affordable);
  if (affordable) {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)}</b><small>${eff}</small></div><button id="resBuy">BUY<small>${fmt(x.cost)} DNA</small></button>`;
    $('resBuy').onclick = () => { if (buy(x.id)) { renderResUp(); R.pop(VIEW_W / 2, race.p.y + 160, h.icon + ' ' + h.name + '!', '#7dffb0', 20); } };
  } else {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)} in ${fmt(x.cost - meta.dna)} DNA</b><small>${eff}</small><div class="bb"><i style="transform:scaleX(${clamp(meta.dna / x.cost, 0, 1).toFixed(3)})"></i></div></div>`;
  }
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
  setTimeout(() => { if (mode === 'result') { sfx('medal', t); buzz([20, 30, 60]); } }, 1500);
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
  const text = o.daily != null ? dailyShareText(o) : `${head}${tail ? ' ' + tail : ''} (Kevin #${kevinN})`;
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
  toast(ok ? 'Copied! Paste it somewhere smug.' : full);
}
let toastTO = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove('on'), 2400); }
function again() { if (!resultReady) return; resAnim = null; sfx('again'); launch(runOpts.daily ? { daily: true } : {}); }
$('shareBtn').onclick = share;
$('againBtn').onclick = again;
$('resMenuBtn').onclick = () => { if (!resultReady) return; resAnim = null; title(); };

// ------------------------------------------------------------------ shop, album, combo book
let shopFrom = 'title';
function shop(from) {
  shopFrom = from || shopFrom; show('shop');
  $('dnaTop').textContent = `${fmt(meta.dna)} DNA 🧬`;
  // Dad's Pick first and highlighted; then what you can afford (cheapest first), what you cannot yet, the locked ones, the maxed ones
  const dad = dadPickId();
  const rows = HABIT_ORDER.map((id) => {
    const l = lv(meta, id), mx = habMax(id), locked = HABITS[id].max > 0 && mx === 0, maxed = !locked && l >= mx, cost = habitCost(id, l);
    return { id, l, mx, locked, maxed, cost, can: !locked && !maxed && meta.dna >= cost };
  });
  const rank = (r) => (r.id === dad ? 0 : r.can ? 1 : !r.locked && !r.maxed ? 2 : r.locked ? 3 : 4);
  rows.sort((a, b) => rank(a) - rank(b) || a.cost - b.cost);
  $('shopList').innerHTML = rows.map(({ id, l, mx, locked, maxed, cost }) => {
    const h = HABITS[id];
    if (locked) return `<div class="hab locked"><div class="ic">${h.icon}</div><div><div class="nm">${esc(h.name)}</div><div class="lk">🔒 Unlocks at Generation 2</div><div class="ds">${esc(h.desc)}</div></div></div>`;
    const a = habEff(id, l), b = maxed ? null : habEff(id, l + 1);
    const ef = maxed && a ? `<div class="ef">${esc(a)} · MAXED</div>` : a && b ? `<div class="ef">${l ? esc(a) + ' → ' + esc(b) : 'Next: ' + esc(b)}</div>` : `<div class="ds">${esc(h.desc)}</div>`;
    const q = habitQuip(id), pick = id === dad ? `<div class="dp">DAD'S PICK</div>` : '';
    return `<div class="hab${!maxed && meta.dna >= cost ? ' can' : ''}${pick ? ' pick' : ''}"><div class="ic">${h.icon}</div><div>${pick}<div class="nm">${esc(h.name)}</div>${q ? `<div class="qp">${esc(q)}</div>` : ''}${ef}<div class="pips">${'●'.repeat(Math.min(l, mx))}${'○'.repeat(Math.max(0, mx - l))}</div></div><button data-id="${id}" ${maxed || meta.dna < cost ? 'disabled' : ''}>${maxed ? 'MAX' : fmt(cost)}<small>${maxed ? '' : 'DNA'}</small></button></div>`;
  }).join('');
  for (const b of $('shopList').querySelectorAll('button')) b.onclick = () => { if (buy(b.dataset.id)) shop(); };
}
$('shopBtn').onclick = () => shop('title');
$('resShopBtn').onclick = () => { if (!resultReady) return; shop('result'); };
$('shopBack').onclick = () => { if (shopFrom === 'result') { show('result'); renderResUp(); badges(); } else title(); };
let albumTab = 'babies';
function album(tab) {
  albumTab = tab || albumTab; show('album');
  const seen = meta.synergiesSeen || [], tot = SYNERGIES.length;
  $('tabBabies').classList.toggle('on', albumTab === 'babies'); $('tabCombos').classList.toggle('on', albumTab === 'combos');
  $('tabCombos').textContent = `Mashups ${seen.length}/${tot}`;
  if (albumTab === 'babies') {
    $('albumH').textContent = 'Baby Album';
    $('albumSub').textContent = 'Every win becomes a person. Every person grows up and becomes the next dad.';
    // the family tree, oldest at the top, and a dashed slot for whoever comes next
    const bs = meta.babies;
    // the 'child of' chain follows real babies only (a practice baby has no children of its own)
    const parentOf = (i) => { for (let j = i - 1; j >= 0; j--) if (bs[j] && !bs[j].practice) return bs[j].name; return 'Dad'; };
    const node = (b, i) => { const fw = firstWord(b); return `<div class="node"><i class="slot" data-i="${i}"></i><div class="nd"><div class="bn">${esc(b.name)}</div><div class="of">child of ${esc(parentOf(i))}</div>${fw ? `<div class="fw">First words: ${esc(fw)}</div>` : ''}<div class="tr">${esc((b.traits || []).join(', '))}.</div><div class="tr dim">Generation ${b.gen} · swim #${b.run}</div></div></div>`; };
    const nextOf = parentOf(bs.length);
    $('albumList').innerHTML = `<div class="tree">${bs.map(node).join('')}<div class="node next"><i class="q">?</i><div class="nd"><div class="bn">???</div><div class="of">child of ${esc(nextOf)}</div><div class="tr">${bs.length ? 'Win again to meet them.' : 'No babies yet. Win a race to make one. The current record holder is Chad Thundertail, who has never won.'}</div></div></div></div>`;
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
$('prog').insertAdjacentHTML('afterbegin', ticks + RIVALS.map((r, k) => `<div class="rv${k % 2 ? ' lo' : ''}" id="rv${k}"><i class="dot" style="background:${r.col}">${esc(first(r.name).charAt(0))}</i><span class="tag" style="color:${r.col}">${esc(first(r.name))}</span></div>`).join(''));
const H = {
  rank: $('rank'), tick: $('rankTick'), alive: $('alive'), cm: $('cm'), zone: $('zoneName'), fill: $('progFill'), me: $('me'),
  efill: $('efill'), ebar: $('ebar'), shields: $('shields'), combo: $('combo'), cn: $('combo').querySelector('.n'), cw: $('combo').querySelector('.w'),
  cbar: $('combo').querySelector('.bar i'), cbarW: $('combo').querySelector('.bar'), cm2: $('combo').querySelector('.m'), cft: $('combo').querySelector('.ft'),
  ctag: $('combo').querySelector('.tag'), cin: $('combo').querySelector('.in'), dash: $('dashBtn'), muts: $('mutRow'), elow: $('elow'),
  pot: $('combo').querySelector('.pot'), cash: $('cashBtn'), pips: $('combo').querySelector('.pips'), pipI: [...$('combo').querySelectorAll('.pips i')], pace: $('pace'),

  rv: RIVALS.map((r, k) => $('rv' + k)),
};
let tickSum = 0, tickT = 0, histT = 0, rankHist = [], jumpT = 0, lastCombo = 0, comboFlash = 0, mutSig = '', msIdx = 0, rvState = [], lastShout = 0, tagT = 0, heartAcc = 0, lastZone = -1;
let quip = { zi: -1, done: 0 }, lastQuip = ''; const usedQuips = new Set();
const MILESTONES = [[100000, 'TOP 100,000!'], [10000, 'TOP 10,000!'], [1000, 'TOP 1,000!'], [100, 'TOP 100!'], [10, 'TOP 10!'], [1, 'IN THE LEAD!']];
const COMBO_TIERS = [3, 10, 20, 30, 45, 60, 100, 150];
// the combo pot: what cashing in would pay right now, rolling upward; a smashed pot strikes through for 0.3 s
let potV = 0, potBrokeT = 0, comboLadder = 0;
// a touch screen talks about swipes from the very first card; a keyboard (no touch seen) gets the key names
let touchUsed = (() => { try { return matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints | 0) > 0; } catch (e) { return false; } })();
const multTxt = (m) => 'x' + Math.round(m * 10) / 10;
const finMult = (style) => (typeof C.finisherMult === 'function' ? C.finisherMult(style) : style >= 5 ? 2 : style >= 4 ? 1.6 : 1.3);
function potBreak() {
  if (potV <= 0 || !race) return false;
  potBrokeT = 0.3; setC(H.pot, 'broke', true);
  R.pop(race.p.x, race.p.y + 100, pickLine(BREAK_POT_LINES) || 'POT GONE', '#ff5c7a', 18, 1.1);
  return true;
}
// CASH fires on release after a short, still press (under 300 ms, under 12 px); a press that moves is steering, so the
// pointer is handed to the drag from where it went down
let cashPress = null;
const CB = $('cashBtn');
CB.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); unlock();
  if (playBlocked()) return;
  cashPress = { id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY };
  try { CB.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
});
CB.addEventListener('pointermove', (e) => {
  const c = cashPress; if (!c || e.pointerId !== c.id) return;
  if (Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < 12) return;
  cashPress = null;
  if (drag || playBlocked() || race.drill) return;
  drag = newDrag(c.id, c.x0, c.y0, c.t0, { flick: true, dashed: true });
  fingers.set(c.id, { x: e.clientX, y: e.clientY }); holdOff = null;
  try { APP.setPointerCapture(c.id); } catch (err) { /* old browser */ }
});
CB.addEventListener('pointerup', (e) => {
  const c = cashPress; if (!c || e.pointerId !== c.id) return;
  cashPress = null;
  if (performance.now() - c.t0 < 300 && Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < 12) cashOut();
});
CB.addEventListener('pointercancel', () => { cashPress = null; });
// 3 significant digits for the +places ticker: 845, 1.23k, 12.3k, 123k, 1.2M
function sig3(n) { n = Math.round(n); if (n < 1000) return String(n); const k = n / 1000; return k < 999.5 ? Number(k.toPrecision(3)) + 'k' : Number((n / 1e6).toPrecision(3)) + 'M'; }
function resetHud() {
  lastZone = -1; tickSum = 0; tickT = 0; histT = 0; rankHist = [race.rank]; jumpT = 0; lastCombo = 0; comboFlash = 0; mutSig = ''; msIdx = 0; tagT = 0;
  while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) msIdx++;
  rvState = RIVALS.map(() => ({ ahead: true, alive: true }));
  H.tick.classList.remove('on'); H.tick._last = null; H.tick._con = false; H.muts.innerHTML = '';
  for (const el of H.rv) { el.classList.remove('dead', 'behind', 'hit', 'taunt'); el._cdead = el._cbehind = false; }
  H.rank.parentNode.classList.remove('jump'); H.rank._cjump = false; H.ctag.classList.remove('on'); setC(H.cw, 'tagged', false); H.combo._sw = null;
  measureBar(); document.body.classList.remove('bright');
  coClear(); coachClear(); $('hint').style.opacity = 0; hudSlowT = 0;
  setC(DU.ui, 'hide', true);
  potV = 0; potBrokeT = 0; comboLadder = 0; setC(H.pot, 'broke', false); setC(H.pot, 'hide', true); setC(H.cash, 'hide', true);
  H.shields._n = -1; H.shields._w = -1; DU.cd._k = null;
  setC(H.pace, 'hide', true); H.pips._n = -1; setC(H.pips, 'lock', false); DU.ui._k = null;
  for (const el of H.rv) el._hotUntil = -99;
}
function bossPassed(k) {
  const el = H.rv[k]; if (!el) return;
  el._hotUntil = clock + 1.5;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}
function comboTag(t) { setT(H.ctag, t); H.ctag.classList.add('on'); setC(H.cw, 'tagged', true); tagT = 1.3; }
const TIER_SCALE = [1, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35];
let comboSeenAt = -1, comboIntroDone = false, mutShowT = 0, threatOnB = false, intenseOn = false, dnaHudV = -1, cdV = -1;
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
}
// the threat lane and the intense HUD (body classes, so the CSS moves banners and trims the HUD)
function laneTick(p) {
  const th = !race.over && !race.pending && hostileAhead(700);
  if (th !== threatOnB) { threatOnB = th; setC(document.body, 'threat', th); }
  const zi = zoneIndex(p.y), it = p.combo >= 10 || p.frenzyT > 0 || zi === C.EGG_I;
  if (it !== intenseOn) { intenseOn = it; setC(document.body, 'intense', it); requestAnimationFrame(measureHud); }
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
function drawHud(dt, live) {
  const p = race.p;
  if (!barW) measureBar();
  // text that changes every frame is written at most 15 times a second
  hudSlowT -= dt; const slowTick = hudSlowT <= 0; if (slowTick) hudSlowT = 1 / 15;
  // rank rolls toward the real number (in log space so the big drops feel big)
  const lr = Math.log(shownRank), tr = Math.log(race.rank);
  shownRank = Math.exp(lr + (tr - lr) * Math.min(1, dt * 6));
  if (Math.abs(shownRank - race.rank) < 0.6) shownRank = race.rank;
  if (slowTick || shownRank === race.rank) {
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
    if (race.rank < prev) { tickSum += prev - race.rank; tickT = 1.1; if (slowTick) setT(H.tick, '+' + sig3(tickSum)); setC(H.tick, 'on', true); }
    else if (tickT > 0) { tickT -= dt; if (tickT <= 0) { tickSum = 0; setC(H.tick, 'on', false); } }
    // several thresholds in one leap: only the best one gets the flash
    let ms = null; while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) ms = MILESTONES[msIdx++];
    if (ms) { callout('milestone', { t: ms[1], col: msIdx >= 5 ? '#ffd75c' : '#7dffb0', sec: 1.4 }); sfx('milestone'); buzz([15, 25, 15]); }
  }
  // the fork's PICK A TUBE sign scrolls up under the rank row: the ticker steps aside while it is on screen
  if (live && R.camY != null && C.FORK_Y0) { const fy = R.sy(C.FORK_Y0 - 500); setC(H.tick, 'fork', fy > -60 && fy < (R.H || 900) + 60); }
  if (slowTick) {
    setT(H.alive, fmt(Math.max(race.alive, Math.round(shownRank))) + ' swimmers alive');
    setT(H.cm, (race.remaining() / PX_PER_CM).toFixed(1) + ' cm');
  }
  const zi = zoneIndex(p.y);
  if (zi !== lastZone) {
    lastZone = zi; setT(H.zone, ZONES[zi].name);
    // bright zones (the fork, the rapids, the egg): HUD text goes cream so it reads on pale backdrops
    document.body.classList.toggle('bright', zi >= 4);
  }
  const pr = race.progress();
  setBar(H.fill, pr); setX(H.me, pr * barW);
  // rival dots; name tags take a free row (above or below the bar) or hide when crowded
  const meX = pr * 100, tagX = [];
  for (let k = RIVALS.length - 1; k >= 0; k--) {
    const a = race.agents[k], el = H.rv[k], st = rvState[k]; if (!a) continue;
    const x = Math.min(100, a.y / RACE_LEN * 100);
    setX(el, x / 100 * barW);
    if (st.alive !== a.alive) { st.alive = a.alive; setC(el, 'dead', !a.alive); }
    const ahead = a.y > p.y;
    if (st.ahead !== ahead) {
      // a rival just went past you: if core does not say so itself, say it here
      if (ahead && !st.ahead && a.alive && !a.arrived && !race.drill && live && !coreHas.passedBy && (p.y < C.FORK_Y0 || a.side === p.side)) passedBy(k);
      st.ahead = ahead; setC(el, 'behind', !ahead);
    }
    tagX[k] = x;
  }
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
  const rowsUsed = [[], []], placed = new Set();
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
  const firstOk = !firstSwim || p.combo >= 5 || (comboSeenAt >= 0 && clock - comboSeenAt >= 2);
  const cb = H.combo, showCombo = (p.combo >= 3 || potBrokeT > 0) && !race.drill && !eggOn && firstOk;
  if (p.combo < 10) comboLadder = 0;
  // the pot: what cashing in pays right now (rolls upward over ~120 ms, drops at once); a smashed pot shows struck through
  if (potBrokeT > 0) { potBrokeT -= dt; if (potBrokeT <= 0) { potV = 0; setC(H.pot, 'broke', false); } }
  else {
    // what CASH pays right now: the bank, the finisher multiplier for this style, double in a disco
    const disco = typeof race.evIs === 'function' && race.evIs('disco');
    const potT = p.bank >= 3 && typeof C.bankDna === 'function' ? C.bankDna(p.bank, p.style, p.clutch) * finMult(p.style) * (disco ? 2 : 1) : 0;
    potV = potT > potV ? potV + (potT - potV) * Math.min(1, dt * 25) : potT;
    if (potT - potV < 0.05) potV = potT;
  }
  if (showCombo) {
    if (cb._op !== 1) {
      cb._op = 1; cb.style.opacity = 1; requestAnimationFrame(measureHud); setC(document.body, 'comboOn', true);
      // the first time on swim 1: a little bounce and one line that names it
      if (firstSwim && !comboIntroDone) { comboIntroDone = true; if (!S.reduced && H.cin.animate) H.combo.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' }); coach(K.COMBO_INTRO || 'Passing in a row = COMBO', 2.4, 2, true); }
    }
    let changed = false;
    const ct0 = H.cn._v; setT(H.cn, Math.floor(p.combo) + 'x'); if (H.cn._v !== ct0) changed = true;
    const fz = p.frenzyT > 0;
    let w = ''; for (const [n, word] of COMBO_WORDS) if (p.combo >= n) w = word;
    for (const [n, word] of COMBO_WORDS_HIGH) if (p.combo >= n) w = word;
    const T = C.FRENZY_TIERS, ti = fz && T ? clamp((p.tier || 1) - 1, 0, T.length - 1) : -1;
    const ft = ti >= 0 ? T[ti].name : '', ww = ti >= 0 ? '' : w;
    if (H.cft._v !== ft || H.cw._v !== ww) changed = true;
    setT(H.cft, ft); setT(H.cw, ww);
    setC(H.cw, 'hide', ti >= 0); setC(H.cft, 'hide', ti < 0);
    const f = p.comboT / (p.comboMax || race.s.combo || 1);
    setBar(H.cbar, f); setC(H.cbarW, 'low', f < 0.3);
    let ct = 0; while (ct < COMBO_TIERS.length && p.combo >= COMBO_TIERS[ct]) ct++;
    if (cb._tier !== ct) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.toggle('t' + i, i === ct); if (ct > (cb._tier || 0) && ct > 1) comboFlash = 0.35; cb._tier = ct; changed = true; }
    setC(cb, 'fz', fz);
    const mult = p.mult > 0 ? p.mult : typeof C.comboMult === 'function' ? C.comboMult(p.combo) : 0;
    const mt = mult ? 'x' + mult.toFixed(2) : ''; if (H.cm2._v !== mt) changed = true; setT(H.cm2, mt);
    if (changed || cb._sw == null) fitCombo(ct);
    const potOn = potV > 0.05;
    setC(H.pot, 'hide', !potOn);
    if (potOn) {
      setT(H.pot, '🧬 +' + (potV < 10 ? potV.toFixed(1) : fmt(potV)));
      const g = typeof C.bankGrade === 'function' ? C.bankGrade(p.bank) : 0;
      if (H.pot._g !== g && potBrokeT <= 0) { H.pot._g = g; H.pot.style.fontSize = (13 + 2 * g) + 'px'; }
    }
    // a big enough pot gets a tappable CASH chip with the finisher multiplier
    const cashOn = p.bank >= 10 && potBrokeT <= 0 && !race.pending;
    setC(H.cash, 'hide', !cashOn);
    if (cashOn) setT(H.cash, 'CASH ' + multTxt(finMult(p.style)));
    stylePips(p);
    if (p.combo > lastCombo && H.cn.animate && !S.reduced) H.cn.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  } else {
    if (cb._op !== 0) { cb._op = 0; cb.style.opacity = 0; requestAnimationFrame(measureHud); setC(document.body, 'comboOn', false); }
    setC(H.cash, 'hide', true);
    if (cb._tier) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.remove('t' + i); cb._tier = 0; }
  }
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
  if (slowTick) paceTick(p);
  setC(H.dash, 'cd', p.dashCd > 0 && !race.drill);
  dashTick(p);

  setT(H.dash, race.drill ? 'DRILL' : 'DASH');
  if (live) {
    coTick(dt);
    if (coachT > 0) { coachT -= dt; if (coachT <= 0) { coachPri = -1; $('coach').classList.remove('on'); } }
  }
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
  if (!on) { if (threatOn) { threatOn = false; try { A.threat(0); A.acid = 0; } catch (e) { /* ignore */ } } return; }
  const p = race.p; let k = 0, pan = 0, bd = 300;
  for (const e of race.ents) {
    if (e.t !== 'wbc' || e.dead || !(e.hunt > 0.5)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; k = 1 - d / 300; pan = clamp((e.x - p.x) / 200, -1, 1); }
  }
  threatOn = true;
  try { A.threat(k, pan); A.acid = p.acid ? 1 : 0; } catch (e) { /* ignore */ }
}
// scale the combo strip to its tier, but never wider than the screen (measured only when its text changes)
function fitCombo(ct) {
  const cb = H.combo, inr = H.cin;
  const w = inr.scrollWidth || 1, avail = Math.min(innerWidth, cb.clientWidth || innerWidth) - 24;
  const sc = Math.max(0.5, Math.min(TIER_SCALE[ct] || 1, avail / w));
  cb._sw = w;
  const v = S.reduced ? Math.min(1, sc) : sc;
  if (inr._sc !== v) { inr._sc = v; inr.style.transform = `scale(${v.toFixed(3)})`; }
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
  const src = (ZONE_LINES_SHORT && ZONE_LINES_SHORT[z.id]) || ZONE_LINES[z.id] || [];
  let pool = src.filter((l) => !usedQuips.has(l));
  // a zone that ran dry starts over (never the line we just said)
  if (!pool.length && src.length) { for (const l of src) usedQuips.delete(l); pool = src.filter((l) => l !== lastQuip); }
  quip.done++;
  if (!pool.length) return;
  const l = pickLine(pool); usedQuips.add(l); lastQuip = l;
  coach(l, clamp(1.6 + l.length * 0.035, 2, 3.2), 0);
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
// Steps back up after 20 s of frames under 0.9x the period. Never judged on menus, cards or pause, or in the 3 s after a
// screen change. Auto remembers the stage it learned for 7 days (S.qs, S.qT); a fresh guess starts a weak phone at stage 1.
const gov = { samples: [], period: 0, ema: 0, slowFor: 0, fastFor: 0, stage: 0, stageAt: 0, holdUntil: 0 };
const Q_KEEP = 7 * 86400000;
function govHold(sec) { gov.holdUntil = Math.max(gov.holdUntil, clock + sec); gov.slowFor = 0; gov.fastFor = 0; }
function setStage(st) {
  gov.stage = st; gov.stageAt = clock;
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
  gov.slowFor = 0; gov.fastFor = 0;
  setStage(S.gfx === 'lite' ? 2 : S.gfx === 'full' ? 0 : autoStage());
  if (R.textScale != null) R.textScale = textScaleNow();
}
function learnStage(st) { setStage(st); S.qs = st; S.qT = Date.now(); saveUI(); gov.slowFor = 0; gov.fastFor = 0; gov.ema = gov.period; }
// the display's frame period: the 20th percentile of 90 live-race frames, snapped to a real refresh rate (never above 60 Hz's)
const PERIODS = [6.94, 8.33, 11.1, 16.67];
const snapPeriod = (v) => PERIODS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), PERIODS[0]);
function govReset() { gov.samples = []; gov.period = 0; gov.slowFor = 0; gov.fastFor = 0; }
function governor(raw) {
  if (S.gfx !== 'auto' || raw > 100 || raw <= 0 || document.hidden) return;
  // only a live race says anything about the phone: not paused, no cards, no pending deal, not in a hold after a screen change
  const busy = mode !== 'race' || !race || race.demo || race.paused || race.pending || race.over || !$('cards').classList.contains('hide');
  if (busy || clock < gov.holdUntil) { gov.slowFor = 0; gov.fastFor = 0; return; }
  if (gov.samples.length < 90 || !gov.period) {
    gov.samples.push(raw);
    if (gov.samples.length >= 90) { const s = gov.samples.slice().sort((a, b) => a - b); gov.period = snapPeriod(s[Math.floor(s.length * 0.2)]); gov.ema = gov.period; }
    return;
  }
  gov.ema += (raw - gov.ema) * 0.05;
  if (gov.ema > gov.period * 1.3) { gov.slowFor += raw / 1000; gov.fastFor = 0; }
  else { gov.slowFor = 0; if (gov.ema < gov.period * 0.9) gov.fastFor += raw / 1000; else gov.fastFor = 0; }
  if (gov.slowFor >= 2 && gov.stage < 2 && (gov.stage === 0 || clock - gov.stageAt >= 5)) learnStage(gov.stage + 1);
  else if (gov.fastFor >= 20 && gov.stage > 0) learnStage(gov.stage - 1);
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
function crawlStart() { if (crawlOn) return; crawlOn = true; crawlAt = clock; try { A.slowmo(true, crawlN === 0); } catch (e) { /* ignore */ } crawlN++; }
function crawlEnd(crossed) {
  if (!crawlOn) return;
  crawlOn = false;
  if (slowT <= 0 && freezeT <= 0) { try { A.slowmo(false); } catch (e) { /* ignore */ } }
  if (crossed) { if (R.zoomPunch) R.zoomPunch(0.12); trauma(0.3); hitStopRL(50); }
}

// ------------------------------------------------------------------ 2, 1, GO (0.6 s a number)
let lastCount = 0;
function countTick(dt) {
  const el = $('count');
  countT -= dt;
  if (countT > 0) {
    const n = Math.ceil(countT / 0.6);
    if (n !== lastCount) { lastCount = n; el.textContent = n; el.className = ''; void el.offsetWidth; el.className = 'on'; sfx('tap', 0.3 + (3 - n) * 0.2); buzz(10); }
  } else {
    countT = 0; lastCount = 0; el.textContent = 'GO!'; el.className = ''; void el.offsetWidth; el.className = 'on go'; goT = 0.5;
    sfx('boss', 4); buzz([20, 20, 40]); trauma(0.25);
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), facT = 0, frameErrs = 0, simAcc = 0;
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
  if (ts === 0 && inRace) {
    const key = `${race.paused ? 1 : 0}|${cv.width}x${cv.height}|${R.camY == null ? 0 : 1}|${race.over ? 1 : 0}`;
    if (key === drawKey) { drawAcc = 0; return; }
    drawKey = key;
  } else {
    drawKey = '';
    const overlay = mode === 'result' || (mode === 'race' && !CARDS_EL.classList.contains('hide'));
    if (overlay && drawN % 3) return;
    if (!overlay && race.demo && drawAcc < 1 / 30 - 0.004) return;
  }
  R.draw(race, drawAcc, ts); drawAcc = 0;
}
function frame(now) {
  try {
    const iv = prevRaf ? now - prevRaf : 16.7; prevRaf = now;
    if (iv > 0 && iv < 100) rafP += (iv - rafP) * 0.1;
    if (S.gfx !== 'full' && rafP < 9.5) {
      rafAcc += iv; if (rafAcc < 12.7) return;
      rafAcc = Math.min(rafAcc - 16.7, 8);
    } else rafAcc = 0;
    frameBody(now);
  } catch (e) {
    if (frameErrs++ < 3) console.error(e);
  } finally {
    requestAnimationFrame(frame);
  }
}
function frameBody(now) {
  const raw = now - last; last = now;
  const dt = clamp(raw / 1000, 0, 0.05);
  governor(raw);
  const inRace = !!race && mode === 'race' && !race.demo;
  const live = !(inRace && race.paused);
  if (live) clock += dt;
  frozenRecent = Math.max(0, frozenRecent - dt);
  // watchdog: a finished swim that is still on the race screen 3.5 s later goes to the result card no matter what
  if (mode === 'race' && race && race.over && !race.demo) {
    const nowS = now / 1000;
    if (overAt < 0) overAt = nowS;
    else if (nowS - overAt > 3.5) { overAt = -1; finHold = null; try { showResult(race.over); } catch (e) { console.error(e); try { title(); } catch (e2) { /* nothing left */ } } }
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
    // ease in fast (a slow-mo hits within a few frames), ease out slower
    timeScale += (target - timeScale) * Math.min(1, dt * (target < timeScale ? 25 : 6));
  }
  if (race) {
    let held = false;
    if (inRace && live) {
      if (countT > 0) { countTick(dt); held = true; }
      else if (stopT > 0) { stopT -= dt; held = true; }
      if (goT > 0) { goT -= dt; if (goT <= 0) $('count').className = ''; }
      const kd = (keys.arrowleft || keys.ArrowLeft || keys.a ? -1 : 0) + (keys.arrowright || keys.ArrowRight || keys.d ? 1 : 0);
      if (!drag) {
        race.input.dir = kd;
        if (kd) { race.input.touch = false; holdOff = null; race.input.tx = null; }
      }
      steerTick(); holdTick(kd);
      if (dashBuf > 0 && !held) race.input.dash = true;
    }
    // fixed 240 Hz steps: up to 50 ms of sim a frame, so a 30 fps phone runs at full speed but a hitch never snowballs;
    // at most one step of remainder carries over
    // the title demo only needs 60 Hz steps (nobody is steering it)
    if (!held && live) {
      const hz = race.demo ? 60 : SIM_HZ;
      simAcc += dt * timeScale;
      const n = Math.min(Math.ceil(0.05 * hz), Math.floor(simAcc * hz));
      simAcc = clamp(simAcc - n / hz, 0, 1 / hz);
      for (let i = 0; i < n; i++) race.step(1 / hz);
    }
    if (race.demo && (race.over || race.pending)) { if (race.pending) race.choose(race.pending[0]); else demo(); }
    onEvents(); flushPasses(dt);
    if (inRace && live && !held && dashBuf > 0) { dashBuf -= dt; if (dashBuf <= 0) { dashBuf = 0; if (race.p.dashCd > 0.05) refuseDash(); } }
    if (mode === 'race') {
      if (live) { tutTick(dt); ghostTick(dt); lowTick(dt); lessonTick(dt); hazTick(dt); quipTick(); rivalTick(); eggTick(); tellTick(); dashHoldTick(); dashPressTick(); laterTick(); }
      ringApply();
      // no pause during the zone stinger and the deal (Escape is gated the same way)
      setC($('pauseBtn'), 'off', !!race.pending || revealT > 0);
      const hidden = $('cards').classList.contains('hide');
      if (race.pending && hidden) {
        if (revealT <= 0) cardStinger();
        else { revealT -= dt; if (revealT <= 0) { revealT = 0; if (race.pending) dealCards(); } }

      } else if (!race.pending) revealT = 0;
      // the deal fades out, then the overlay goes; when a new deal is already pending (back to back), the stinger takes over
      if (pickT > 0) { pickT -= dt; if (pickT <= 0 && !race.paused) { show(null); if (!race.pending) govHold(3); } }
      // low energy: a heartbeat every 2 beats, every beat when it is critical
      const p = race.p;
      if (live && !race.over && !race.drill && !race.pending && p.e < 25) {
        heartAcc += dt; const iv = (p.e < 12 ? 1 : 2) * 60 / (A.bpm || 100);
        if (heartAcc >= iv) { heartAcc = 0; sfx('lowE', p.e < 12 ? 1 : 0); }
      } else heartAcc = 0;
      // the combo clock is running out: a ticking that climbs (audio keeps it on the grid)
      if (live && !race.over && !race.drill && !race.pending && p.combo >= 5) {
        const f = p.comboT / (p.comboMax || 1);
        if (f < 0.25) sfx('comboLow', f);
      }
      A.combo = p.combo;
    }
    if (mode === 'result') tickResult(dt);
    if (mode === 'title') { facT += dt; if (facT >= 1) { facT = 0; idleTick(meta, Date.now()); renderFactory(); } }
    if (S.reduced) { R.shake = Math.min(R.shake, 1.5); R.flash = Math.min(R.flash, 0.15); if (R.zoomK) R.zoomK = 0; }
    R.beat = A.pulse || 0; R.reduced = S.reduced;
    threatTick(live && mode === 'race');
    // paused: the world stands still (no particles, no camera drift)
    drawFrame(dt, held || !live ? 0 : timeScale, inRace);

    if (mode === 'race' && !race.over) drawHud(dt, live);
  }
  if (welcomeAnim) welcomeTick(dt);
  A.tick();
}
// the cilia tremble before they swat: a fizz from their wall when one starts, up to 500 px ahead
function tellTick() {
  if (!race || race.over || race.drill || race.pending) return;
  const p = race.p; let said = false;
  for (const e of race.ents) {
    if (e.t !== 'cilia') continue;
    const st = e.state | 0, was = e._ps; e._ps = st;
    if (st !== 1 || was === 1 || was == null || said) continue;
    const dy = e.y - p.y; if (dy < 0 || dy > 500) continue;
    if (e.side && p.side && e.side !== p.side) continue;
    said = true; sfx('tell', e.wall);
  }
}
addEventListener('resize', () => { R.resize(); R.textScale = textScaleNow(); measureHud(); measureBar(); if (H.combo) H.combo._sw = null; govReset(); govHold(3); drawKey = ''; });
applyGfx();
if (meta.runs >= 15 && !S.seenHaz.length && !S.tutReplay) { S.seenHaz = Object.keys(HAZARD_INTRO); saveUI(); }
syncMute();
const bootAway = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
title();
maybeWelcome(bootAway);
requestAnimationFrame(frame);
