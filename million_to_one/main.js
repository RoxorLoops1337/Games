// Million To One: the page. Input, game loop, menus, tutorial, HUD juice, settings.
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, SAVE_KEY, VIEW_W, zoneIndex, ZSTART } from './core.js';
import * as C from './core.js';
import * as K from './content.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';

// content: the old names are always there, the newer ones are guarded so a missing export never breaks the page
const { ZONES, RACE_LEN, MUTATIONS, HABITS, HABIT_ORDER, habitCost, COMBO_WORDS, DEATH_LINES, INTRO, PX_PER_CM, RIVALS, TOTAL_SWIMMERS } = K;
const pickLine = K.pickLine || ((a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : ''));
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
const reactsOf = (name) => RIVAL_REACTS[name] || RIVAL_REACTS[first(name)] || Object.keys(RIVAL_REACTS).reduce((o, k) => o || (first(k) === first(name) ? RIVAL_REACTS[k] : null), null) || {};
const byFirst = (tbl, name) => (tbl[name] != null ? tbl[name] : Object.keys(tbl).reduce((o, k) => (o != null ? o : first(k) === first(name) ? tbl[k] : null), null));
const POP = (key, fb) => pickLine(POP_LINES[key]) || fb;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const first = (name) => String(name || '').split(' ')[0];
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
  sens: 1.35, lefty: false, q: 1, qT: 0, gfx: 'auto', frenzySeen: false, bestGap: 0, tutSkipped: [], seenHaz: [], revealSeen: false,
  lowSeen: 0, streakLostDay: -1, welcomeAt: 0, genIntroSeen: 0 };
try { const o = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (o && typeof o === 'object') for (const k of Object.keys(S)) if (typeof o[k] === typeof S[k]) S[k] = o[k]; } catch (e) { /* ignore */ }
// an explicit choice wins, otherwise follow the system setting
if (!S.redSet) S.reduced = prefersReduced;
if (![1, 1.35, 1.8].includes(S.sens)) S.sens = 1.35;
if (!Array.isArray(S.tutSkipped)) S.tutSkipped = [];
if (!Array.isArray(S.seenHaz)) S.seenHaz = [];
if (!['auto', 'full', 'lite'].includes(S.gfx)) S.gfx = 'auto';
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
// players who already swam before the tutorial existed do not need it
if (meta.runs > 0 && !S.tutDone && !S.tutTries) { S.tutDone = true; saveUI(); }

function applyAudio() {
  try { A.setMuted(meta.muted); A.setMusicVol(S.mvol); A.setSfxVol(S.svol); A.setMusicMuted(!S.music); A.setSfxMuted(!S.sfx); } catch (e) { /* older audio */ }
}
function unlock() {
  A.unlock();
  if (A.ctx && (A._suspended || A.ctx.state === 'suspended')) { try { A.resume(); } catch (e) { /* ignore */ } }
}
const muffle = (on) => { try { A.setMuffle(on); } catch (e) { /* optional */ } };
// win, lose, frenzy and comboBreak also change the music (key, tempo, a dry beat), so they reach audio.js even with
// sound effects off: setSfxMuted already silences the sfx bus there.
const SFX_STATEFUL = new Set(['win', 'lose', 'frenzy', 'comboBreak']);
const sfx = (n, k) => { if (S.sfx || (SFX_STATEFUL.has(n) && A.setSfxMuted)) { try { A.sfx(n, k); } catch (e) { /* never let a sound break a frame */ } } };
function menuMusic() { if (A.on) A.intensity = 0.3; setTension(0); try { A.slowmo(false); } catch (e) { /* ignore */ } }
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
document.addEventListener('pointerdown', () => {
  unlock();
  if (!A.on) { A.on = true; if (mode !== 'race') A.intensity = 0.3; }
}, { capture: true });

// haptics: tiny, throttled, guarded
let lastBuzz = 0;
function buzz(pat, force) {
  if (!S.haptics || !navigator.vibrate) return;
  const now = performance.now(); if (!force && now - lastBuzz < 70) return; lastBuzz = now;
  try { navigator.vibrate(pat); } catch (e) { /* not allowed */ }
}
// camera feel
const trauma = (a) => { if (R.addTrauma) R.addTrauma(S.reduced ? a * 0.3 : a); else R.shake = Math.max(R.shake, a * 14); };
const kick = (dx, dy) => { if (R.kick && !S.reduced) R.kick(dx, dy); };

let race = null, mode = 'title', timeScale = 1, slowT = 0, shownRank = TOTAL_SWIMMERS, hintT = 0, prevBest = TOTAL_SWIMMERS;
let clock = 0, stopT = 0, freezeT = 0, countT = 0, goT = 0, lastSlowAt = -99, lastPopStop = -99, kevinN = 1, firstSwim = false, raceT0 = 0;
window.game = { get race() { return race; }, get meta() { return meta; }, get settings() { return S; } };

// a demo race runs behind the title screen
function demo() { race = new Race(newMeta(), Math.random, { autopilot: true }); race.demo = true; R.camY = null; }

const OVERLAYS = ['title', 'intro', 'cards', 'result', 'shop', 'album', 'pause', 'settings', 'welcome'];
function show(id) { for (const o of OVERLAYS) $(o).classList.toggle('hide', o !== id); if (id !== 'cards') $('cards').classList.remove('out'); $('ver').classList.toggle('hide', id !== 'title'); }
function hud(on) {
  for (const id of ['hud', 'dashBtn', 'pauseBtn']) $(id).classList.toggle('hide', !on);
  if (!on) {
    $('combo').style.opacity = 0; H.combo._op = 0; setC(DU.ui, 'hide', true); tutHide(); coClear();
    coachClear(); $('hint').style.opacity = 0; $('count').className = ''; setC($('tutTarget'), 'hide', true);
  } else requestAnimationFrame(measureHud);
}
function measureHud() { const h = $('hud'); if (h.offsetHeight) document.documentElement.style.setProperty('--hudB', h.offsetHeight + 'px'); }

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
function capHours() { const v = C.factoryCapHours; let h = 8; try { h = typeof v === 'function' ? v(meta) : +v; } catch (e) { /* default */ } return h > 0 ? h : 8; }
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
  const d = collectBank(meta); if (d < 1) return;
  const h = d / rate, key = wasFull ? 'full' : h < 1 ? '<1' : h < 4 ? '1-4' : h < 8 ? '4-8' : '8+';
  sfx('dna'); sfx('buy'); buzz(20); save();
  toast(fillLine(pickLine(AWAY_LINES[key]) || '+{dna} DNA collected!', { dna: fmt(d) }));
  if (race) R.pop(VIEW_W / 2, race.p.y + 200, '+' + fmt(d) + ' DNA', '#7dffb0', 26);
  titleStats(); renderFactory(); badges();
};
function titleStats() {
  $('titleStats').innerHTML = `<div class="stat"><b>${meta.best >= TOTAL_SWIMMERS ? '-' : '#' + fmt(meta.best)}</b>best place</div><div class="stat"><b>${fmt(meta.dna)}</b>DNA 🧬</div><div class="stat"><b>${meta.gen + 1}</b>generation</div><div class="stat"><b>${meta.babies.length}</b>babies</div>`;
}
const streakOf = () => +(meta.dailyStreak ?? meta.streak ?? 0) || 0;
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
  $('autoWrap').classList.toggle('hide', !lv(meta, 'gps')); $('autoChk').checked = meta.autopilot;
  const daily = typeof C.dailySeed === 'function';
  $('dailyBtn').classList.toggle('hide', !daily || meta.runs < 1);
  setC($('dailyBtn'), 'pulse', false);
  if (daily) {
    const today = C.dailySeed(), n = streakOf(), done = meta.dailyDay === today;
    const alive = n > 0 && meta.dailyLastDay >= today - 1, best = +meta.bestStreak || 0;
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
    $('dailyBtn').innerHTML = `Daily Swim 📅 <small>${esc(sub)}</small>`;
  }
  const seen = (meta.synergiesSeen || []).length;
  $('albumBtn').innerHTML = `Baby Album 👶 <small>${meta.babies.length} babies · Combos ${seen}/${SYNERGIES.length}</small>`;
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
  a.tick -= dt; if (a.tick <= 0 && k < 1) { a.tick = 0.12; sfx('dna'); }
  if (k >= 1) welcomeAnim = null;
}
$('wbCollect').onclick = () => {
  welcomeAnim = null; idleTick(meta, Date.now());
  const d = collectBank(meta); if (d >= 1) { sfx('dna'); sfx('buy'); buzz(20); }
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
  mode = 'intro'; show('intro'); let i = 0;
  const end = () => { clearTimeout(introTO); $('intro').onclick = null; $('introSkip').onclick = null; if (lines === INTRO) meta.introSeen = true; save(); done(); };
  const next = () => {
    clearTimeout(introTO);
    if (i >= lines.length) return end();
    const t = lines[i++], el = $('introTxt');
    el.textContent = t; el.classList.toggle('big', t === 'SWIM.' || t === 'Dead last.' || t === 'NEW GENERATION');
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    sfx('tap', i / lines.length);
    introTO = setTimeout(next, t.length <= 16 ? 1000 : t.length <= 40 ? 1900 : 2600);
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
  out.push(`${pickLine(GEN_UNLOCK_LINES) || 'A new generation!'} DNA x${gf(meta.gen - 1).toFixed(2)} → x${gf(meta.gen).toFixed(2)}`);
  out.push(`${b.name} grew up. Their turn.`);
  const gi = GEN_INTROS[meta.gen - 1];   // index 0 is generation 2 (the hero is generation 1)
  if (Array.isArray(gi)) { const v = { heir: heirName() || b.name, grandad: bs.length >= 2 ? bs[bs.length - 2].name : 'Dad' }; for (const l of gi) out.push(fillLine(l, v)); }
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
  coreHas = {}; shoveAt = {}; bonkN = 0; lowDone = false; lowRingT = 0; hazT = 0; hazSlowT = 0; hazAt = -99; crawlOn = false; threatSaid = false; leadSaid = 0;
  tut = null; clearInput(); resetHud();
  mode = 'race'; show(null); hud(true);
  countT = runOpts.countdown ? 1.8 : 0; goT = 0; lastCount = 0;
  govHold(3); setIntensity();
  const tk = threatName();
  callout('zone', { t: ZONES[0].name, z: `${kevinLabel()} · ${race.daily != null ? 'DAILY SWIM · ' : ''}ZONE 1`, c: tk ? threatLine(tk) : null, sec: tk ? 2.6 : 1.8 });
  if (tk) threatSaid = true;
  if (!S.tutDone && !race.autopilot) { tutStart(); if (COACH_SHORT.launch) coach(COACH_SHORT.launch, 4.5, 1); }
  else if (race.autopilot) hint('Autopilot is ON. Sit back. Tap DASH if you like.', 4, 1);
  else if (meta.runs < 3) hint(K.START_HINT || 'Drag to steer. Tap DASH to zoom.', 4, 1);
  else if (COACH_SHORT.launch) coach(COACH_SHORT.launch, 3);
}
// ONE text channel in the race: the coach strip under the HUD. Higher priority wins while it shows
// (2: tutorial, rivals, rescues; 1: start, events, forks; 0: Coach Gonad's chatter).
let coachT = 0, coachPri = -1;
function coach(t, sec = 3.2, pri = 0) {
  if (!t) return false;
  if (coachT > 0 && pri < coachPri) return false;
  const c = $('coach'); setT(c, t); c.classList.add('on'); coachT = sec; coachPri = pri; return true;
}
function hint(t, sec = 3, pri = 0) {
  if (eggOn && pri < 2) return false;
  if (tut && tut.on && pri < 2) return false;
  return coach(t, sec, pri);
}
function coachClear() { coachT = 0; coachPri = -1; $('coach').classList.remove('on'); }
// Kevin's number counts from the start of this generation when there is an heir
// the heir is the newest real (not practice) baby: core's meta.heir / meta.genRunStart when it keeps them, else read off the album
const lastHeir = () => { const bs = meta.babies || []; for (let i = bs.length - 1; i >= 0; i--) if (bs[i] && !bs[i].practice) return bs[i]; return null; };
const heirName = () => { const h = meta.heir != null && meta.heir !== '' ? meta.heir : lastHeir(); return h ? String(typeof h === 'object' ? h.name || '' : h) : ''; };
function kevinNo() {
  const lh = lastHeir(), gs = Number.isFinite(+meta.genRunStart) && meta.genRunStart != null ? +meta.genRunStart : lh ? lh.run | 0 : 0;
  return Math.max(1, meta.runs - (heirName() && gs <= meta.runs ? gs : 0) + 1);
}
function kevinLabel() { const h = heirName(); return `KEVIN #${fmt(kevinN)}` + (h ? ` · SON OF ${first(h).toUpperCase()}` : ''); }
// the rival core picked as this swim's threat (race.threatK), named in the zone 1 banner
let threatSaid = false;
function threatName() { const k = race && Number.isInteger(race.threatK) ? race.threatK : -1; return k >= 0 && RIVALS[k] ? RIVALS[k].name : null; }
function threatLine(name) { const nem = nemesisOf(); return nem === first(name) ? `Your nemesis ${first(name)} is in this swim.` : `Watch out: ${first(name)} is in this swim.`; }

// ------------------------------------------------------------------ callouts: ONE queue for banners and milestones
const PRI = { drill: 5, synergy: 4, eggClaim: 4, event: 3, zone: 2, milestone: 1 };
let coCur = null, coQ = [];
function callout(kind, o) {
  o.kind = kind; o.pri = PRI[kind] || 2; o.at = clock; o.sec = o.sec || (o.c ? 3 : 1.6);
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
  b.querySelector('.t').textContent = o.t; b.querySelector('.z').textContent = o.z || ''; b.querySelector('.c').textContent = o.c || '';
  b.querySelector('.c').style.display = o.c ? '' : 'none';
  b.classList.toggle('red', o.kind === 'eggClaim'); b.style.setProperty('--bc', o.col || '#ff5c7a');
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
}
function coEnd() {
  if (!coCur) return;
  if (coCur.kind === 'milestone') { $('rankRow').classList.remove('ms'); setT($('rankLbl'), 'YOUR PLACE'); }
  else $('banner').classList.remove('on');
  coCur = null;
}
function coTick(dt) {
  if (coCur) { coCur.shown += dt; coCur.left -= dt; if (coCur.left <= 0) coEnd(); }
  if (!coCur && coQ.length) { coQ = coQ.filter((q) => clock - q.at < 2); const n = coQ.shift(); if (n) coShow(n); }
}
function coClear() { coQ = []; coEnd(); }
const bannerUp = () => !!coCur && coCur.kind !== 'milestone';

// ------------------------------------------------------------------ first-run tutorial (never blocks: every step times out)
const TUT_STEPS = [
  { id: 'steer', ic: '👆', to: 6, d: { t: 'Drag anywhere to steer', s: 'Left, right, wiggle wiggle.' } },
  { id: 'fruit', ic: '🍓', to: 10, d: { t: 'Grab the fruit sugar', s: 'Fruit is energy. Eat fruit.' } },
  { id: 'dash', ic: '⚡', to: 6, d: { t: 'Tap DASH for a burst!', s: 'Or tap with your other thumb.' } },
  { id: 'draft', ic: '💨', to: 8, d: { t: 'Tuck in BEHIND a rival', s: 'Free speed. Rude, but fast.' } },
  { id: 'combo', ic: '🔥', to: 8, d: { t: 'Pass 3 in a row', s: 'Chain passes for a COMBO.' } },
];
const TUT_DNA = 10;
const tutText = (st) => { const x = TUT_TEXT[st.id]; return x && x.t ? x : st.d; };
let tut = null;
function tutStart() {
  tut = { on: true, i: -1, t: 0, st: {}, steer: 0, dirs: 0, lastDir: 0, draftT: 0, okT: 0 };
  // a second lesson only replays the steps that were skipped last time
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
function tutNext() {
  if (!tut) return;
  let i = 0; while (i < TUT_STEPS.length && tut.st[TUT_STEPS[i].id]) i++;
  if (i >= TUT_STEPS.length) return tutFinish();
  tut.i = i; tut.t = 0;
  const st = TUT_STEPS[i], el = $('tut'), tx = tutText(st);
  el.querySelector('.ic').textContent = st.ic; el.querySelector('.tt').textContent = tx.t; el.querySelector('.ts').textContent = tx.s;
  el.querySelector('.dots').innerHTML = tutDots();
  el.className = 'on step-' + st.id;
  $('dashBtn').classList.toggle('nudge', st.id === 'dash');
}
function tutMark(id) {
  if (!tut || !tut.on || tut.st[id] || !race || race.demo) return;
  tut.st[id] = 'ok';
  meta.dna += TUT_DNA;
  R.pop(race.p.x, race.p.y + 70, '+' + TUT_DNA + ' DNA', '#7dffb0', 18, 1.2); sfx('pick'); buzz(12);
  const cur = TUT_STEPS[tut.i] && TUT_STEPS[tut.i].id === id;
  if (cur) { tut.okT = 0.7; $('tut').classList.add('ok'); $('dashBtn').classList.remove('nudge'); }
  $('tut').querySelector('.dots').innerHTML = tutDots();
}
function tutFinish() {
  if (!tut || !tut.on) return;
  tut.on = false; tutHide();
  const skipped = TUT_STEPS.filter((st) => tut.st[st.id] !== 'ok' && tut.st[st.id] !== 'pre').map((st) => st.id);
  S.tutSkipped = skipped;
  if (skipped.length >= 2) { S.tutTries = (S.tutTries || 0) + 1; S.tutDone = S.tutTries >= 2; }
  else S.tutDone = true;
  if (S.tutDone) S.tutSkipped = [];
  saveUI();
  if (!race || race.demo || race.over) return;
  if (!skipped.length) { coach(TUT_TEXT.natural || "You're a natural!", 2.6, 2); sfx('milestone'); buzz([15, 25, 15]); }
  else if (!S.tutDone) coach(TUT_TEXT.retry || 'We will practise again next swim.', 2.6, 2);
}
function tutHide() { $('tut').className = ''; $('dashBtn').classList.remove('nudge'); }
function tutTick(dt) {
  if (!tut || !tut.on || !race || race.demo) return;
  if (race.over || race.zoneReached >= 1) return tutFinish();
  if (race.pending || !$('cards').classList.contains('hide') || countT > 0) return;
  // the first step waits for the zone banner to clear
  if (tut.i < 0) { if (bannerUp()) return; tutNext(); if (!tut.on) return; }
  const p = race.p;
  if (p.draft > 0.08) { tut.draftT += dt; if (tut.draftT > 0.5) tutMark('draft'); }
  if (tut.steer > 180 && tut.dirs > 0) tutMark('steer');
  if (p.combo >= 3) tutMark('combo');
  const st = TUT_STEPS[tut.i];
  // draft step: a ring that marks the sweet spot behind the nearest rival ahead
  let target = null;
  if (st && st.id === 'draft' && tut.okT <= 0) {
    let bd = 1e9;
    for (const a of race.agents) {
      if (!a.alive || a.arrived) continue;
      const dy = a.y - p.y; if (dy < 50 || dy > 320) continue;
      const d = dy + Math.abs(race.agentX(a) - p.x) * 1.5; if (d < bd) { bd = d; target = a; }
    }
    if (target) ringAsk(race.agentX(target), target.y - 55, 'here!');
  }
  if (tut.okT > 0) { tut.okT -= dt; if (tut.okT <= 0) tutNext(); }
  else if (st) {
    // the clock stops while there is nothing to do (no rival to tuck behind) or a banner is up
    if (!bannerUp() && !(st.id === 'draft' && !target)) tut.t += dt;
    setBar($('tut').querySelector('.bar i'), 1 - tut.t / st.to);
    if (tut.t > st.to) { tut.st[st.id] = 'skip'; tutNext(); }
  }
}

// ------------------------------------------------------------------ one guide ring (#tutTarget), shared by the tutorial,
// the low-energy rescue and the first look at each hazard. The first ask in a frame wins.
let ringReq = null;
function ringAsk(wx, wy, label) { if (!ringReq) ringReq = { wx, wy, label }; }
function ringApply() {
  const tg = $('tutTarget');
  if (!ringReq || R.camY == null || !race || mode !== 'race') { setC(tg, 'hide', true); ringReq = null; return; }
  const k = cv.clientWidth / VIEW_W, x = ringReq.wx * k + cv.offsetLeft, y = R.sy(ringReq.wy) * k + cv.offsetTop;
  tg.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  if (tg._l !== ringReq.label) { tg._l = ringReq.label; tg.dataset.l = ringReq.label; }
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
    let best = null, bd = 1e9;
    for (const e of race.ents) { if (e.t !== 'sugar' || e.dead) continue; const dy = e.y - p.y; if (dy < 30 || dy > 700) continue; const d = dy + Math.abs(e.x - p.x) * 2; if (d < bd) { bd = d; best = e; } }
    if (best) ringAsk(best.x, best.y, 'fruit!');
  }
}
// the first time each hazard scrolls into view: a ring, one line and a short slow-down
const HAZ_KEY = { acid: 'acid', alkali: 'alkali', gate: 'gate', goo: 'goo', wbc: 'wbc', current: 'current', cilia: 'cilia', dna: 'dna', shield: 'helmet' };
let hazAt = -99, hazEnt = null, hazT = 0, hazSlowT = 0;
function hazTick(dt) {
  if (hazSlowT > 0) hazSlowT -= dt;
  if (!race || race.demo || race.drill || eggOn) { hazT = 0; return; }
  const p = race.p;
  if (hazT > 0) {
    hazT -= dt;
    if (hazEnt && !hazEnt.dead) {
      let x = hazEnt.x;
      if (hazEnt.t === 'gate' && hazEnt.gaps && hazEnt.gaps.length) x = hazEnt.gaps.reduce((a, g) => (Math.abs(g - p.x) < Math.abs(a - p.x) ? g : a), hazEnt.gaps[0]);
      ringAsk(x, hazEnt.y, hazEnt.t === 'gate' ? 'gap!' : 'look!');
    }
    return;
  }
  if (clock - hazAt < 4 || bannerUp() || race.pending || countT > 0 || !$('cards').classList.contains('hide') || (tut && tut.on && tut.okT <= 0 && TUT_STEPS[tut.i] && TUT_STEPS[tut.i].id === 'draft')) return;
  const seen = S.seenHaz;
  let best = null, bd = 1e9, kind = null;
  for (const e of race.ents) {
    const kk = HAZ_KEY[e.t]; if (!kk || e.dead || seen.includes(kk) || !HAZARD_INTRO[kk]) continue;
    const dy = e.y - p.y; if (dy < 150 || dy > 450) continue;
    if (e.side && p.side && e.side !== p.side) continue;
    if (dy < bd) { bd = dy; best = e; kind = kk; }
  }
  if (!best && !seen.includes('forkSign') && HAZARD_INTRO.forkSign && C.FORK_Y0 - p.y > 150 && C.FORK_Y0 - p.y < 450) kind = 'forkSign';
  if (!kind) return;
  seen.push(kind); saveUI();
  hazAt = clock; hazEnt = best; hazT = best ? 2.4 : 0;
  coach(HAZARD_INTRO[kind], 2.4, 2);
  if (!S.reduced) hazSlowT = 0.7;
}
// ------------------------------------------------------------------ input
// drag: the finger sets an offset from the tube centre, so the swimmer follows the tube's wiggle and never pins to a wall.
// Lifting the finger keeps that lane (holdOff) until the next touch or key.
const keys = {};
const keyName = (k) => (k && k.length === 1 ? k.toLowerCase() : k);
let drag = null, lastDown = 0, lastTapX = 0, lastTapY = 0, dashBuf = 0, lastDrillTap = 0, drillN = 0, holdOff = null;
function clearInput() {
  drag = null; lastDown = 0; dashBuf = 0; holdOff = null;
  for (const k of Object.keys(keys)) keys[k] = 0;
  if (race) { race.input.tx = null; race.input.dash = false; race.input.tap = 0; race.input.touch = false; race.input.dir = 0; }
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
  let tx = c + drag.off0 + (drag.fx - drag.sx) * S.sens;
  // pushed past a wall: rebase the anchor so moving back responds at once
  if (tx < b.l) { tx = b.l; drag.off0 = tx - c; drag.sx = drag.fx; }
  else if (tx > b.r) { tx = b.r; drag.off0 = tx - c; drag.sx = drag.fx; }
  drag.off = tx - c;
  race.input.tx = tx; race.input.touch = true;
}
// finger lifted: keep the lane it chose, following the tube's wiggle
function holdTick(kd) {
  if (!race || race.drill || race.autopilot) { holdOff = null; return; }
  if (drag || kd || holdOff == null) return;
  const p = race.p, b = band(p.y, p.side);
  race.input.tx = clamp(mid(p.y) + holdOff, b.l, b.r); race.input.touch = true;
}
const lowForDash = () => { const p = race.p, cost = (race.s && race.s.dashCost) || 0; return p.e <= cost && !(race.muts && race.muts.nitro); };
function requestDash() {
  if (!race || race.drill) return;
  if (lowForDash()) { refuseDash(); return; }   // only an empty tank says no at once; a cooldown just waits a beat
  race.input.dash = true; dashBuf = Math.max(0.15, Math.min(0.35, (race.p.dashCd || 0) + 0.05));
}
function refuseDash() {
  const b = $('dashBtn'); b.classList.remove('refuse'); void b.offsetWidth; b.classList.add('refuse'); buzz(6);
}
// cash the combo in on purpose (long press on DASH, or a quick swipe down)
function cashOut() {
  if (playBlocked() || race.drill || countT > 0) return;
  race.input.cashOut = true; buzz(10);
}
function drillTap() {
  const now = performance.now();
  if (now - lastDrillTap < 80 || race.input.tap >= 3) return;
  lastDrillTap = now; race.input.tap++; drillN++;
  sfx('drill', drillN); buzz(6);
  R.burst(race.p.x, race.p.y + 20, '#5ce1ff', 4, 160, 0.3, 2); trauma(0.06);
}
// the whole app takes touches, so the gutters steer too in landscape
const APP = $('app');
APP.addEventListener('pointerdown', (e) => {
  if (mode !== 'race' || playBlocked()) return;
  if (e.target && e.target.closest && e.target.closest('button,.ov')) return;
  // a second thumb: dash (or drill) without stealing the steering finger
  if (drag && e.pointerId !== drag.id) { if (race.drill) { if (countT <= 0) drillTap(); } else if (countT <= 0) requestDash(); return; }
  try { APP.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  holdOff = null;
  if (race.drill) { if (countT <= 0) drillTap(); return; }
  const now = performance.now();
  const dbl = lastDown && now - lastDown < 300 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 64;
  if (dbl && countT <= 0) { requestDash(); lastDown = 0; }
  const wx = toWorldX(e.clientX);
  drag = { id: e.pointerId, t0: now, x0: e.clientX, y0: e.clientY, lx: e.clientX, sx: wx, fx: wx, off0: race.p.x - mid(race.p.y), off: race.p.x - mid(race.p.y), moved: 0, flick: false, dashed: dbl };
  steerTick();
  if (race.autopilot) { race.autopilot = false; hint('Autopilot off. You are driving!', 2, 1); }
});
APP.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || !race) return;
  drag.fx = toWorldX(e.clientX);
  const sdx = e.clientX - drag.lx; drag.lx = e.clientX;
  drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
  if (tut) tutSteer(sdx);
  // a quick vertical flick: up dashes, down cashes the combo in
  const dy = e.clientY - drag.y0, adx = Math.abs(e.clientX - drag.x0), quick = performance.now() - drag.t0 < 160;
  if (!drag.flick && !drag.dashed && quick && -dy > 60 && -dy > 1.6 * adx && countT <= 0 && !playBlocked()) { drag.flick = true; requestDash(); }
  else if (!drag.flick && quick && dy > 60 && dy > 1.6 * adx) { drag.flick = true; cashOut(); }
  steerTick();
});
const up = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const now = performance.now(), d = drag;
  drag = null;
  if (race) { race.input.tx = null; race.input.touch = false; if (!race.drill) holdOff = d.off; }
  // a quick, still touch is a tap: the next touch soon after (and close by) dashes
  if (!d.dashed && !d.flick && now - d.t0 < 180 && d.moved < 12) { lastDown = now; lastTapX = e.clientX; lastTapY = e.clientY; }
  else lastDown = 0;
};
APP.addEventListener('pointerup', up); APP.addEventListener('pointercancel', up); APP.addEventListener('lostpointercapture', up);
const DASH_KEYS = [' ', 'ArrowUp', 'w'];
const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'a', 'd'];
addEventListener('keydown', (e) => {
  const k = keyName(e.key);
  if (k === 'm' && !e.repeat) { toggleMute(); return; }
  if (k === 'Escape' || k === 'p') {
    if (mode === 'race' && race && !race.over && !race.pending) { if (race.paused) resume(); else pause(); }
    return;
  }
  if (mode === 'result') { if ((k === ' ' || k === 'Enter') && resultReady) { e.preventDefault(); again(); } return; }
  if (!race || mode !== 'race') return;
  if (race.pending) { if (cardsLive() && '123'.includes(k) && k.length === 1) pick(race.pending[+k - 1]); return; }
  if (race.paused || race.over) return;
  if (DASH_KEYS.includes(k)) {
    e.preventDefault();
    if (e.repeat || countT > 0) return;
    if (race.drill) drillTap(); else requestDash();
    return;
  }
  if (k === 's' || k === 'ArrowDown') { if (!e.repeat) cashOut(); return; }
  keys[k] = 1;
  if (STEER_KEYS.includes(k)) { holdOff = null; if (tut) tutSteer(k === 'ArrowLeft' || k === 'a' ? -25 : 25); }
});
addEventListener('keyup', (e) => { keys[keyName(e.key)] = 0; });
let dashHoldTO = 0;
$('dashBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); unlock();
  if (playBlocked() || countT > 0) return;
  if (race.drill) { drillTap(); return; }
  requestDash();
  clearTimeout(dashHoldTO); dashHoldTO = setTimeout(cashOut, 350);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('dashBtn').addEventListener(ev, () => clearTimeout(dashHoldTO));
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
  setT($('pauseTip'), pickLine(TIPS));
  show('pause'); muffle(true); try { A.slowmo(false); } catch (e) { /* ignore */ }
}
function resume() {
  if (!race) return;
  unlock(); race.paused = false; clearInput(); show(null); muffle(false);
  // a short "2, 1, GO" so the thumb is back on the glass before the tube moves
  if (!race.drill && !race.over && !race.pending) { countT = 0.8; lastCount = 0; }
  if (slowT > 0 || freezeT > 0) { try { A.slowmo(true); } catch (e) { /* ignore */ } }
  govHold(3);
}
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = resume;
$('quitBtn').onclick = () => { if (!race || race.over) return; race.paused = false; clearInput(); show(null); muffle(false); race.end('quit'); };
function toBackground() {
  save(); clearInput();
  if (mode === 'race' && race && !race.over && !race.demo && !race.pending) pause();
  try { A.suspend(); } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { toBackground(); return; }
  const away = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
  unlock();
  if (mode === 'title') {
    if (!$('title').classList.contains('hide')) { title(); maybeWelcome(away); }
    else { titleStats(); renderFactory(); badges(); }
  }
});
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
$('setReduced').onchange = (e) => { S.reduced = e.target.checked; S.redSet = true; saveUI(); document.body.classList.toggle('reduced', S.reduced); if (H.combo) H.combo._sw = null; };
$('setLefty').onchange = (e) => { S.lefty = e.target.checked; saveUI(); document.body.classList.toggle('lefty', S.lefty); };
for (const b of $('setSens').querySelectorAll('button')) b.onclick = () => { S.sens = +b.dataset.v; saveUI(); openSettings(settingsFrom); sfx('tap'); };
for (const b of $('setGfx').querySelectorAll('button')) b.onclick = () => { S.gfx = b.dataset.v; if (S.gfx !== 'auto') S.q = S.gfx === 'lite' ? 0 : 1; saveUI(); applyGfx(); openSettings(settingsFrom); sfx('tap'); };
$('setTut').onclick = () => { S.tutDone = false; S.tutTries = 0; saveUI(); $('setTut').textContent = 'Tutorial on next swim ✓'; };

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
function partnerLine(id) {
  for (const s of SYNERGIES) {
    if (race.syn && race.syn[s.id] || !s.needs.includes(id)) continue;
    const others = s.needs.filter((n) => n !== id);
    if (others.every((n) => race.muts[n] > 0)) return `<div class="syn">${s.icon} Unlocks combo: ${esc(s.name)}!</div>`;
  }
  for (const s of SYNERGIES) {
    if (race.syn && race.syn[s.id] || !s.needs.includes(id)) continue;
    const o = MUTATIONS[s.needs.find((n) => n !== id)]; if (!o) continue;
    const known = (meta.synergiesSeen || []).includes(s.id);
    return `<div class="syn half">Pairs with ${o.icon} ${esc(o.name)} for ${known ? s.icon + ' ' + esc(s.name) : 'a secret combo'}</div>`;
  }
  return '';
}
let offerGolden = false;
function cards() {
  const zi = race.zoneReached, firstDraft = firstSwim && (race.draftN || 1) <= 1 && !race.pendingMid;
  $('cardsSub').textContent = firstDraft ? 'ZONE 1 CLEARED' : race.pendingMid ? `HALFWAY BONUS · PLACE #${fmt(race.rank)}` : `${ZONES[Math.max(0, zi - 1)].name.toUpperCase()} CLEARED · PLACE #${fmt(race.rank)}`;
  setT($('cardsH'), offerGolden ? 'GOLDEN DRAFT' : 'MUTATE!'); setC($('cards'), 'golden', offerGolden);
  setT($('cardsLine'), firstDraft ? 'Tap one. Kevin gets it for this swim.' : 'Pick one. It lasts until this swim ends.');
  $('cardsOwned').innerHTML = Object.keys(race.muts).map((id) => MUTATIONS[id] ? `<span title="${esc(MUTATIONS[id].name)}">${MUTATIONS[id].icon}${race.muts[id] > 1 ? `<b>${race.muts[id]}</b>` : ''}</span>` : '').join('');
  let lastEnd = 0;
  $('cardRow').innerHTML = race.pending.map((id, k) => {
    const m = MUTATIONS[id], have = race.muts[id] || 0, delay = k * 0.1;
    lastEnd = Math.max(lastEnd, delay + (m.r === 3 ? 0.7 : 0.5));
    const lvl = firstDraft ? ['COMMON', 'RARE', 'LEGENDARY'][m.r - 1] : `${['COMMON', 'RARE', 'LEGENDARY'][m.r - 1]} · ${have ? `LV ${have} → ${have + 1}` : 'NEW'}${m.max > 1 ? ' of ' + m.max : ''}`;
    return `<button class="card r${m.r}" data-id="${id}" style="animation-delay:${delay.toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="lvl">${lvl}<span class="key">${k + 1}</span></div><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.desc)}</div>${firstDraft ? '' : partnerLine(id)}</div>${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
  }).join('');
  // a card that completes a combo gets a shimmer once the deal lands
  const completes = race.pending.some((id) => SYNERGIES.some((sy) => !(race.syn && race.syn[sy.id]) && sy.needs.includes(id) && sy.needs.every((n) => n === id || race.muts[n] > 0)));
  for (const b of $('cardRow').querySelectorAll('.card')) b.onclick = () => pick(b.dataset.id);
  $('rerollBtn').classList.toggle('hide', race.rerolls <= 0);
  $('rerollBtn').textContent = `🎲 Reroll · Rerolls: ${race.rerolls}`;
  // no taps until the last card has landed
  cardsReady = false; $('cardRow').classList.add('locked'); clearTimeout(cardsTO);
  cardsTO = setTimeout(() => { cardsReady = true; $('cardRow').classList.remove('locked'); }, S.reduced ? 80 : Math.round(lastEnd * 1000) + 30);
  $('cards').classList.remove('out'); show('cards');
  sfx('cards');
  if (race.pending.some((id) => MUTATIONS[id].r === 3)) setTimeout(() => { sfx('legendary'); buzz([10, 30, 10]); }, 380);
  if (completes) setTimeout(() => { if (cardsLive()) sfx('synTease'); }, Math.round(lastEnd * 1000) + 300);
}
$('rerollBtn').onclick = () => { if (cardsReady && race && race.reroll()) { sfx('reroll'); buzz(10); cards(); } };
function pick(id) {
  if (!race || !race.pending || !cardsReady) return;
  const el = $('cardRow').querySelector(`.card[data-id="${id}"]`), mid = !!race.pendingMid;
  if (!race.choose(id)) return;
  offerGolden = false;
  clearInput();
  sfx('pick'); buzz(18);
  if (el) el.classList.add('picked');
  $('cards').classList.add('out'); pickT = S.reduced ? 0.05 : 0.28;
  muffle(false);
  const zi = race.zoneReached, z = ZONES[zi];
  if (!mid) {
    tutFinish();
    coachClear();
    callout('zone', { t: z.name, z: `ZONE ${zi + 1}`, sec: 1.6 });
    if (race.p.combo < 20 && COACH_SHORT[z.id]) coach(COACH_SHORT[z.id], firstSwim ? 4.5 : 3, 1);
    A.bpm = z.beat;
  }
  setIntensity();
  sfx('boss', 4);
  R.pop(race.p.x, race.p.y + 60, MUTATIONS[id].icon + ' ' + MUTATIONS[id].name, '#ffd75c', 18, 1.6);
  timeScale = S.reduced ? 1 : 0.25;   // ease back into the action
}

// ------------------------------------------------------------------ events -> juice
let bankedNow = false, leadK = -1, leadSaid = 0;
let bonkN = 0, shoveAt = {}, coreHas = {}, passedOnce = new Set(), rivalIntro = [], lastBubble = -99, eggClaimed = false, rivalF = 0, rivalK = -1, passBlip = false, lastBlip = 0;
function hitStop(ms) { if (S.reduced || !race || race.demo) return; stopT = Math.max(stopT, ms / 1000); }
function sayRival(k, text, dur = 2.2) {
  if (!text || clock - lastBubble < 5 || !R.say) return false;
  lastBubble = clock; R.say(k, text, dur); return true;
}
// a rival's own reaction line (RIVAL_REACTS[name][kind]), through the same 5 s bubble throttle
function react(k, kind, dur = 2.2) {
  const r = RIVALS[k]; if (!r) return false;
  return sayRival(k, pickLine(reactsOf(r.name)[kind]), dur);
}
// hit-stop is rate limited: one per 0.08 s, so a pile-up never freezes the frame
let lastHitStop = -99;
function hitStopRL(ms) { if (clock - lastHitStop < 0.08) return; lastHitStop = clock; hitStop(ms); }
// the music follows the race: calm in the launch tube, busier in the middle, loud near the egg, flat out in FRENZY
function setIntensity() {
  if (!race || race.demo || mode !== 'race' || !A.on) return;
  const zi = race.zoneReached | 0;
  A.intensity = race.p.frenzyT > 0 ? 2 : zi <= 1 ? 0 : zi <= 4 ? 1 : 1.4;
}
// combo saved by Echo Chamber: a soft cyan echo, never the shatter
function echoFx(kept) {
  const p = race.p;
  R.pop(p.x, p.y + 70, pickLine(ECHO_LINES) + ' ' + kept, '#7fe8ff', 17, 1.1);
  sfx('comboEnd'); R.lastBankT = R.time; buzz(8);
}
const rivalIndex = (ev) => (Number.isInteger(ev.k) && RIVALS[ev.k] ? ev.k : RIVALS.findIndex((r) => r.name === (ev.boss || ev.name) || first(r.name) === first(ev.boss || ev.name)));
function passedBy(k) {
  const r = RIVALS[k]; if (!r) return;
  if (sayRival(k, pickLine(tauntsOf(r.name).pass), 2.2)) sfx('bossTaunt', k);
  const el = H.rv[k]; if (el) { el.classList.remove('taunt'); void el.offsetWidth; el.classList.add('taunt'); }
}
function comboBreakFx(n, ringDone) {
  const p = race.p;
  if (R.comboBreak && !ringDone) R.comboBreak(p.x, p.y);
  sfx('comboBreak');
  R.pop(p.x, p.y + 70, (pickLine(BREAK_LINES) || 'COMBO DROPPED') + (n >= 10 ? ` (${n})` : ''), '#ff8bb0', 18);
  if (n >= 10) buzz(15);
}
function onEvents() {
  const p = race.p, evs = race.events;
  if (race.demo) { evs.length = 0; return; }
  bankedNow = false;
  for (const ev of evs) if (ev.type === 'comboBreak' || ev.type === 'comboBank' || ev.type === 'passedBy') coreHas[ev.type] = true;
  for (const ev of evs) {
    switch (ev.type) {
      case 'pass':
        if (ev.boss) {
          const k = rivalIndex(ev), name = ev.boss;
          if (!passedOnce.has(name)) {
            passedOnce.add(name);
            R.pop(ev.x, ev.y + 30, `PASSED ${first(name).toUpperCase()}!`, '#ffd75c', 20, 1.6);
            R.flash = 0.3; R.flashCol = 'rgba(255,215,92,0.35)'; trauma(0.35); hitStop(60);
            if (clock - lastSlowAt >= 6) { slow(0.4); lastSlowAt = clock; }
            sfx('boss', k >= 0 ? k : undefined); buzz([15, 30, 25]); bossPassed(k);
            sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2);
          } else { passBlip = true; R.pop(ev.x, ev.y + 30, first(name).toUpperCase() + ' AGAIN', '#ffe9a8', 14, 0.9); bossPassed(k); sayRival(k >= 0 ? k : name, pickLine(tauntsOf(name).passed), 2.2); }
        } else { passSum += ev.w; passBlip = true; }
        R.burst(ev.x, ev.y, '#ffffff', 3, 80, 0.35, 2);
        break;
      case 'passedBy': { const k = rivalIndex(ev); if (k >= 0) passedBy(k); break; }
      case 'combo':
        sfx('link', { n: ev.n, kind: ev.kind });
        if (ev.kind === 'close') { sfx('close'); R.pop(ev.x, ev.y + 30, POP('close', 'CLOSE!'), '#5ce1ff', 15); }
        if (ev.kind === 'gate') { sfx('thread'); R.pop(p.x, p.y + 40, POP('thread', 'THREADED!'), '#d9b8ff', 16); }
        if (ev.kind === 'dodge') R.pop(ev.x, ev.y + 30, POP('dodge', 'DODGED!'), '#5ce1ff', 15);
        if (ev.kind === 'draft') R.pop(p.x, p.y + 40, POP('draft', 'COMFY!'), '#b8f0ff', 14);
        if (ev.fresh && (ev.style || 1) >= 3) {
          const w = STYLE_WORDS[clamp((ev.style | 0) - 3, 0, Math.max(0, STYLE_WORDS.length - 1))];
          if (w) comboTag(w);
          sfx('style', ev.style);
        }
        break;
      case 'comboBank': {
        const g = clamp(ev.grade | 0, 0, Math.max(0, BANK_GRADES.length - 1)), dna = Math.round(ev.dna || 0);
        bankedNow = true;
        if (R.comboBank) R.comboBank(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y, dna);
        if (ev.finisher) { sfx('finisher', g); R.pop(p.x, p.y + 110, pickLine(FINISHER_LINES), '#ffd75c', 22, 1.3); trauma(0.25); }
        else sfx('comboBank', ev.grade);
        R.pop(p.x, p.y + 80, (BANK_GRADES[g] || 'BANKED') + ' +' + dna, '#7dffb0', 18 + g * 2, 1.4); buzz([10, 20, 10]);
        break;
      }
      case 'comboBreak':
        if (ev.kept > 0) echoFx(ev.kept);
        else if (!bankedNow) { if (R.comboBreak) R.comboBreak(ev.x != null ? ev.x : p.x, ev.y != null ? ev.y : p.y); comboBreakFx(ev.n || 0, true); }
        break;
      case 'comboEnd':
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
        if (!threatSaid && k >= 0) { threatSaid = true; callout('event', { t: `${first(RIVALS[k].name).toUpperCase()} IS HERE`, z: 'RIVAL', c: threatLine(RIVALS[k].name), col: RIVALS[k].col, sec: 2.2 }); }
        break;
      }
      case 'drillLead': {
        const k = rivalIndex(ev), kev = !!ev.kevin;
        const nm = kev ? 'KEVIN' : k >= 0 ? first(RIVALS[k].name).toUpperCase() : 'A RIVAL';
        const line = kev && EGG_LINES.leadYou ? pickLine(EGG_LINES.leadYou) : fillLine(pickLine(EGG_LINES.lead) || '{name} TAKES THE LEAD!', { name: nm });
        callout('drill', { t: line, z: 'THE EGG', col: kev ? '#7dffb0' : k >= 0 ? RIVALS[k].col : '#ff5c7a', sec: 1.3 });
        sfx('drillLead', kev ? 1 : -1); buzz(kev ? [15, 20, 30] : 20);
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
        sfx('frenzy', tier); R.flash = 0.35; R.flashCol = 'rgba(255,255,255,0.4)'; trauma(0.45 + 0.1 * tier); hitStop(80);
        if (clock - lastSlowAt >= 2) slow(0.3 + tier * 0.05);
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
      case 'sugar': sfx('sugar'); R.burst(ev.x, ev.y, '#7dffb0', 6, 90, 0.4, 2.5); tutMark('fruit'); break;
      case 'dna': {
        const n = Math.round(ev.amount || 5);
        sfx('dna'); R.burst(ev.x, ev.y, '#ff5cd2', 14, 140, 0.6, 3);
        R.pop(ev.x, ev.y + 20, '+' + n + ' DNA', n >= 10 ? '#ffd75c' : '#ff8be0', 16 + Math.max(0, Math.min(8, n - 5))); buzz(8);
        break;
      }
      case 'shield': sfx('shield'); R.pop(ev.x, ev.y + 20, POP('shield', '+1 SHIELD'), '#ffd75c', 16); buzz(12); break;
      case 'alkali': sfx('alkali'); R.pop(ev.x, ev.y + 20, POP('alkali', 'pH OK!'), '#5cc8ff', 14); break;
      case 'dash': dashBuf = 0; sfx('dash'); R.burst(p.x, p.y - 20, '#8cdcff', 10, 180, 0.4, 2.5); kick(0, -0.4); buzz(12); tutMark('dash'); break;
      case 'bonk': bonkN++; sfx('bonk'); trauma(0.55); kick(0, 0.6); hitStopRL(70); R.pop(ev.x, ev.y, POP('bonk', 'SPLAT'), '#d9b8ff', 20); hint(pickLine(UI_LINES.bonkHint) || 'Find the GAP in the goo wall!', 2, 1); buzz(45); break;
      case 'surf': sfx('surf'); R.pop(ev.x, ev.y + 20, POP('surf', 'SURF!'), '#d9b8ff', 18); break;
      case 'bump': {
        trauma(0.3); kick(ev.x < p.x ? 0.3 : -0.3, 0); hitStopRL(50); R.pop(ev.x, ev.y + 20, POP('bump', 'BONK!'), '#ffb36b', 16); sfx('bump'); buzz(15);
        if (ev.boss) { const k = rivalIndex(ev); if (k >= 0) react(k, 'bump'); }
        break;
      }
      case 'pop':
        sfx('pop'); R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4); trauma(0.3); buzz(20);
        if (clock - lastPopStop >= 0.08) { lastPopStop = clock; hitStop(25); }
        break;
      case 'blast': sfx('blast', ev.n); if (R.ring) R.ring(ev.x, ev.y, '#ffffff', ev.r || 160, 0.5, 8); R.pop(ev.x, ev.y + 50, `${ev.n} POPPED!`, '#ffffff', 20 + Math.min(10, ev.n * 2), 1.2); buzz([20, 20, 40]); break;
      case 'shieldHit': sfx('hit'); trauma(0.5); hitStop(90); R.flash = 0.5; R.flashCol = 'rgba(255,215,92,0.5)'; R.pop(p.x, p.y + 40, POP('shieldHit', 'SHIELD SAVED YOU'), '#ffd75c', 17); slow(0.5); buzz([40, 30, 40]); break;
      case 'wingHit': sfx('hit'); trauma(0.4); hitStop(90); R.pop(p.x, p.y + 40, POP('wingHit', 'WINGMAN TOOK IT') + ' 🫡', '#ffe0a8', 17); buzz([30, 30, 30]); break;
      case 'wingBack': sfx('heart'); R.pop(p.x, p.y + 50, 'WINGMAN IS BACK 🤝', '#ffe0a8', 16); break;
      case 'second': sfx('second'); hitStop(120); trauma(0.5); R.flash = 0.8; R.flashCol = 'rgba(255,92,140,0.6)'; R.pop(p.x, p.y + 60, 'SECOND WIND!', '#ff5c8a', 26, 1.6); buzz([60, 40, 60, 40, 120]); break;
      case 'synergy': {
        const n = (meta.synergiesSeen || []).length, tot = SYNERGIES.length;
        R.pop(p.x, p.y + 110, `${ev.icon || '✨'} ${String(ev.name || 'SYNERGY').toUpperCase()}!`, '#d9b8ff', 24, 2);
        if (R.ring) R.ring(p.x, p.y, '#d9b8ff', 130, 0.6, 7);
        callout('synergy', { t: `${ev.icon || ''} ${ev.name || 'Synergy'}`, z: ev.fresh ? `NEW COMBO DISCOVERED ${n}/${tot}` : 'COMBO UNLOCKED', c: ev.desc || null, sec: 3 });
        sfx('synergy', ev.fresh); buzz([20, 40, 20, 40, 60]); mutSig = '';
        break;
      }
      case 'event': callout('event', { t: ev.name || 'SOMETHING HAPPENED', z: 'RACE EVENT', c: ev.text || null, sec: 3 }); sfx('event'); buzz([20, 30, 20]); break;
      case 'eventEnd': {
        if (p.combo >= 10) break;   // mid-combo nobody wants to read
        const pool = UI_LINES.eventEnd && UI_LINES.eventEnd[ev.id];
        hint(pickLine(pool) || (ev.name ? ev.name.replace(/[!.]+$/, '') + ' is over.' : 'Back to normal.'), 1.6, 1);
        break;
      }
      case 'fork':
        R.pop(p.x, p.y + 60, ev.right ? POP('forkRight', 'RIGHT TUBE!') : POP('forkWrong', 'UH OH...'), ev.right ? '#ff9be0' : '#c9b6c2', 18);
        if (ev.right) hint('You smell something sweet up ahead...', 3, 1); else hint('Hmm. It smells... empty in here.', 3, 1);
        break;
      case 'backflow':
        R.pop(p.x, p.y + 60, POP('backflow', 'WRONG WAY!'), '#ff5c7a', 20);
        callout('event', { t: POP('backflow', 'WRONG WAY!'), z: 'BACKFLOW', sec: 1.6 }); buzz([20, 20]);
        break;
      case 'zone':
        crawlEnd();
        if (ev.draft === false) {
          const z = ZONES[ev.zi] || ZONES[ZONES.length - 1];
          tutFinish(); coachClear();
          callout('zone', { t: z.name, z: `ZONE ${ev.zi + 1}`, sec: 1.6 }); A.bpm = z.beat; sfx('zone'); buzz([20, 40, 30]);
          if (COACH_SHORT[z.id]) coach(COACH_SHORT[z.id], firstSwim ? 4.5 : 3, 1);
          if (R.confetti) R.confetti(p.x, p.y, 30);
        }
        setIntensity();
        break;
      case 'finale': {
        if (ev.sprinters && ev.sprinters.length) callout('event', { t: 'FINAL SPRINT!', z: 'THE EGG', c: ev.sprinters.map(first).join(', ') + ' found a last gear!', sec: 2.4 });
        const ks = Array.isArray(ev.ks) ? ev.ks : [];
        const k0 = ks.length ? ks[0] : ev.sprinters && ev.sprinters.length ? RIVALS.findIndex((r) => first(r.name) === first(ev.sprinters[0])) : -1;
        if (k0 >= 0) react(k0, 'sprint', 2.4);
        break;
      }
      case 'swat': trauma(0.3); kick(ev.wall < 0 ? 0.4 : -0.4, 0); hitStopRL(45); R.pop(p.x, p.y + 40, 'SWAT!', '#5ce1ff', 16); sfx('swat'); buzz(20); break;
      case 'domino': R.pop(p.x, p.y + 90, `DOMINO x${ev.n}!`, '#ffd75c', 20); sfx('blast', ev.n); break;
      case 'lockon': sfx('lockon', clamp(((ev.x != null ? ev.x : p.x) - 200) / 200, -1, 1)); break;
      case 'record': sfx('record'); R.pop(p.x, p.y + 90, 'NEW BEST PLACE!', '#ffd75c', 20, 1.4); break;
      case 'eggClaim': claimEgg(ev); break;
      case 'rivalDrill': rivalF = clamp(+ev.f || 0, 0, 1); if (Number.isInteger(ev.k)) rivalK = ev.k; break;
      case 'drillShove': {
        const sk = ev.k != null ? ev.k : ev.boss; if (clock - (shoveAt[sk] || -9) < 0.4) break; shoveAt[sk] = clock;
        let x = ev.x, y = ev.y; const a = Number.isInteger(ev.k) ? race.agents[ev.k] : null;
        if (x == null && a) { x = race.agentX(a); y = a.y; }
        R.pop(x != null ? x : p.x, (y != null ? y : p.y) + 30, POP('drillShove', 'SHOVE!'), '#ff8b5c', 18); sfx('drillShove');
        hitStopRL(60); trauma(0.35); buzz([15, 20, 25]);
        if (Number.isInteger(ev.k) && ev.k >= 0) react(ev.k, 'shove');
        break;
      }
      case 'drill':
        sfx('egg');
        callout('drill', { t: ev.rank === 1 ? (pickLine(EGG_LINES.first) || 'FIRST ONE THERE!') : `#${ev.rank} AT THE EGG`, z: 'THE EGG', sec: 1.6 });
        slow(0.6); buzz([40, 40, 80]);
        break;
      case 'over': finish(ev); break;
    }
  }
  evs.length = 0;
}
// a rival reached the egg before you: red alarm, a countdown and the music closes in
function claimEgg(ev) {
  if (eggClaimed) return; eggClaimed = true;
  let a = Number.isInteger(ev.k) ? race.agents[ev.k] : null;
  const nm = ev.name || ev.boss || (a && a.boss && a.boss.name) || '';
  const who = nm ? first(nm).toUpperCase() : 'SWIMMER #' + fmt(2 + Math.floor(Math.random() * 90000));
  callout('eggClaim', { t: fillLine(pickLine(EGG_LINES.claim) || '{name} IS AT THE EGG!', { name: who }), z: 'HURRY!', col: ev.col || (a && a.boss && a.boss.col) || '#ff5c7a', sec: 2.2 });
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
function slow(sec) {
  if (S.reduced) return;
  slowT = Math.max(slowT, sec); try { A.slowmo(true); } catch (e) { /* ignore */ }
}
let tensionV = 0;
function setTension(v) { if (Math.abs(v - tensionV) < 0.02 && !(v === 0 && tensionV !== 0)) return; tensionV = v; try { A.tension = v; } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ the egg panel: you vs the best rival
const DU = (() => { const ui = $('drillUI'); return { ui, t: ui.querySelector('.t'), cd: ui.querySelector('.cd'), you: ui.querySelector('.you i'), youB: ui.querySelector('.you b'), riv: ui.querySelector('.riv'), rivI: ui.querySelector('.riv i'), rivB: ui.querySelector('.riv b') }; })();
let eggOn = false;
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
  if (!race || race.demo || race.over) { eggOn = false; drillRingsTick(0); return; }
  const need = race.drill ? race.drill.need : (C.EGG_DRILL || 3);
  let best = null, f = 0;
  for (const a of race.agents) if (a.alive && a.arrived) { const af = (a.drill || 0) / (a.need || need); if (af > f) { f = af; best = a; } }
  if (rivalF > f) { f = rivalF; if (rivalK >= 0 && race.agents[rivalK]) best = race.agents[rivalK]; }
  if (best && !eggClaimed) claimEgg({ name: best.boss ? best.boss.name : '', col: best.boss ? best.boss.col : null });
  const on = !!race.drill || !!best;
  if (on && !eggOn) coachClear();
  eggOn = on;
  setC(DU.ui, 'hide', !on);
  setTension(best ? clamp(0.25 + f * 0.75, 0, 1) : race.drill ? 0.2 : 0);
  drillRingsTick(need);
  if (!on) return;
  setC(DU.ui, 'claim', !!best);
  setC(DU.t, 'hide', !race.drill);
  setBar(DU.you, race.drill ? race.drill.me / need : race.progress());
  setT(DU.youB, race.drill ? 'YOU' : 'YOU 🏊');
  setC(DU.riv, 'hide', !best); setC(DU.riv, 'hot', f > 0.7);
  if (best) {
    setBar(DU.rivI, f);
    const nm = best.boss ? first(best.boss.name).toUpperCase() : 'RIVAL';
    setT(DU.rivB, nm);
    const secs = Math.max(0, (1 - f) * need), cm = race.remaining() / PX_PER_CM;
    setT(DU.cd, race.drill ? `${nm} breaks in: ${secs.toFixed(1)} s!` : `${nm} breaks in: ${secs.toFixed(1)} s · you: ${cm.toFixed(2)} cm away`);
  } else setT(DU.cd, 'Drill in before the others do!');
}

// ------------------------------------------------------------------ end of run
let resAnim = null, prevBestCombo = 0, lastResult = null, resultReady = false, resultTO = 0;
function finish(o) {
  save(); lastResult = o; clearInput(); setTension(0);
  const win = o.reason === 'win';
  if (win) buzz([50, 50, 50, 50, 200], true); else buzz([90, 60, 160], true);
  hitStop(160);
  const fin = race;
  setTimeout(() => { if (race === fin && race.over === o) showResult(o); }, win ? 1400 : o.reason === 'quit' ? 300 : 900);
  if (win) { R.flash = 1; R.flashCol = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) R.burst(race.p.x, race.p.y + 150, ['#ffd75c', '#ff5c8a', '#5ce1ff'][i % 3], 30, 400, 1.4, 5); if (R.confetti) R.confetti(); }
  else if (o.reason !== 'quit') { trauma(0.8); R.flash = 0.5; R.flashCol = 'rgba(120,0,30,0.6)'; }
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
// the DNA receipt: core's breakdown when it has one, otherwise rebuilt from the run
const BD_LABELS = { distance: 'Distance', dist: 'Distance', placing: 'Placing', place: 'Placing', rank: 'Placing', combos: 'Combos', combo: 'Combos',
  banked: 'Banked', bank: 'Banked', bounties: 'Bounties', bounty: 'Bounties', gen: 'Gen x', genMul: 'Gen x', auto: 'AUTO -40%', autoCut: 'AUTO -40%', autopilot: 'AUTO -40%',
  daily: 'Daily streak', dailyBonus: 'Daily streak', streak: 'Daily streak', photo: 'Photo finish!', goal: 'Goal smashed!' };
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
    return fillLine(pickLine(SYNERGY_SO_CLOSE), { card: m.icon + ' ' + m.name, combo: seen.includes(s.id) ? s.icon + ' ' + s.name : '???' });
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
function showResult(o) {
  mode = 'result'; hud(false); menuMusic(); muffle(false); A.intensity = 0.3;
  const win = o.reason === 'win', z = ZONES[clamp(o.zone | 0, 0, ZONES.length - 1)], by = byName(o), reason = o.reason;
  const byK = by ? RIVALS.findIndex((r) => first(r.name) === first(by)) : -1, topK = win ? topDriller() : -1;
  sfx(win ? 'win' : 'lose', win ? (topK >= 0 ? topK : undefined) : (byK >= 0 ? byK : undefined));
  const prog = clamp(race.p.y / RACE_LEN, 0, 1), close = !win && reason !== 'quit' && prog >= 0.85;
  // headline and the why
  let tt, why;
  if (win) { tt = "IT'S A BABY! 🍼"; why = topK >= 0 ? linesOf(RIVALS[topK].name).loseEgg || pickLine(WIN_LINES) : pickLine(WIN_LINES); }
  else if (by) { tt = `${first(by).toUpperCase()} GOT THERE FIRST`; why = linesOf(by).stealEgg || pickLine(DEATH_LINES.late); }
  else if (reason === 'quit') { tt = pickLine(RESULT_TITLES.quit) || 'BREAK TIME'; why = pickLine(DEATH_LINES.quit) || 'Kevin is taking a little break.'; }
  else if ((o.zone | 0) >= 6) { tt = pickLine(RESULT_TITLES.close) || 'SO. CLOSE.'; why = null; }
  else { tt = pickLine(RESULT_TITLES[reason]) || pickLine(LOSE_TITLES); why = null; }
  if (!why) {
    if (o.rank <= 10 && NEAR_MISS_LINES.length) why = pickLine(NEAR_MISS_LINES);
    else if (Math.random() < 0.5 && DEATH_BY_ZONE[z.id]) why = pickLine(DEATH_BY_ZONE[z.id]);
    else why = pickLine(DEATH_LINES[o.cause] || DEATH_LINES[reason] || DEATH_LINES.energy);
  }
  $('resTitle').textContent = tt; $('resWhy').textContent = why;
  // never contradict the headline: rank 1 and 2 lines only ever mean a win
  $('resRankLine').textContent = !win && o.rank <= 2 ? pickLine(LOSS_RANK_LINES) : rankLine(o.rank);
  $('resRankLbl').textContent = `${kevinLabel()} · FINAL PLACE`;
  $('resRank').textContent = '#' + fmt(TOTAL_SWIMMERS);
  $('resStats').innerHTML = `<div class="stat"><b>${(o.dist / PX_PER_CM).toFixed(1)} cm</b>swum</div><div class="stat"><b>${fmt(o.overtakes)}</b>overtakes</div><div class="stat${o.combo > prevBestCombo && prevBestCombo > 0 ? ' rec' : ''}"><b>${o.combo}</b>best combo</div><div class="stat"><b>${(o.zone | 0) + 1}/${ZONES.length}</b>zones</div>`;
  const rb = $('resBaby'); rb.innerHTML = '';
  if (o.baby) {
    const fw = firstWord(o.baby);
    rb.innerHTML = `<div class="baby"><div class="bn">${esc(o.baby.name)}</div>${fw ? `<div class="fw">First words: ${esc(fw)}</div>` : ''}<div class="tr">${esc((o.baby.traits || []).join(', '))}.</div><div class="tr" style="margin-top:6px;opacity:.7">Generation ${o.baby.gen} begins. The race gets faster.</div></div>`;
    rb.firstChild.prepend(babyCanvas(o.baby, 96));
  }
  const syn = Array.isArray(o.synergies) ? o.synergies.map((id) => SYNERGIES.find((s) => s.id === id)).filter(Boolean) : [];
  $('resMuts').innerHTML = Object.keys(race.muts).filter((id) => MUTATIONS[id]).map((id) => `<span>${MUTATIONS[id].icon} ${esc(MUTATIONS[id].name)}${race.muts[id] > 1 ? ' x' + race.muts[id] : ''}</span>`).join('') + syn.map((s) => `<span class="sy">${s.icon} ${esc(s.name)}</span>`).join('');
  // rival ladder with lifetime win-loss, the nemesis marked, and the gap to the one who beat you
  const beat = beatenSet(o), nemNow = nemesisOf();
  const settled = nemAtStart && RIVALS.some((r, k) => first(r.name) === nemAtStart && beat.has(k));
  $('resLadder').innerHTML = RIVALS.map((r, k) => {
    const x = rivalRec(r.name), fn = first(r.name), nem = fn === nemNow || fn === nemAtStart;
    const cls = [beat.has(k) ? 'on' : '', nem ? 'nemesis' : '', settled && fn === nemAtStart ? 'beaten' : ''].join(' ').trim();
    return `<span class="${cls}" style="--c:${r.col}">${esc(fn)}<small>${x.beat | 0}-${x.lost | 0}</small>${nem && !(settled && fn === nemAtStart) ? '<em>NEMESIS</em>' : ''}</span>`;
  }).join('<i>›</i>');
  const gs = $('resGrudge');
  if (settled) {
    gs.innerHTML = `GRUDGE SETTLED<small>${esc(byFirst(RIVAL_SETTLED, nemAtStart) || linesOf(nemAtStart).beaten || '')}</small>`;
    gs.classList.remove('hide'); setTimeout(() => { if (mode === 'result') sfx('record'); }, 900);
  } else gs.classList.add('hide');
  const g = gapInfo(o, by), gEl = $('resGap');
  if (g) {
    const nb = !S.bestGap || g.sec < S.bestGap; if (nb) { S.bestGap = g.sec; saveUI(); }
    gEl.innerHTML = `${g.name ? esc(first(g.name)) : 'The winner'} beat you by ${g.sec.toFixed(1)} s${nb ? '<span class="nb">NEW BEST</span>' : ''}`;
    gEl.classList.remove('hide');
  } else gEl.classList.add('hide');
  const eg = $('resEgg');
  placeResEgg(close);
  if (reason === 'late' || reason === 'energy' || close) {
    const cm = race.remaining() / PX_PER_CM;
    const bar = eg.querySelector('i'); bar.style.transition = 'none'; bar.style.transform = `scaleX(${close && !S.reduced ? 0 : prog.toFixed(3)})`;
    if (close && !S.reduced) { void bar.offsetWidth; bar.style.transition = ''; requestAnimationFrame(() => { bar.style.transform = `scaleX(${prog.toFixed(3)})`; }); }
    eg.querySelector('span').textContent = race.drill ? 'You made it to the egg!' : `${cm.toFixed(cm < 1 ? 2 : 1)} cm short of the egg (${Math.min(99, Math.round(prog * 100))}% of the way)`;
    eg.classList.remove('hide');
    if (close) setTimeout(() => { if (mode === 'result') sfx('loseClose'); }, 700);
  } else eg.classList.add('hide');
  // the receipt counts up line by line
  const lines = receipt(o);
  $('resReceipt').innerHTML = lines.map((l) => `<div class="${!l.mult && l.v < 0 ? 'neg' : ''}"><span>${esc(l.label)}</span><b>${l.mult ? 'x' + +l.v.toFixed(2) : (l.v < 0 ? '-' : '+') + '0'}</b></div>`).join('');
  $('resDna').textContent = '+0 DNA 🧬';
  const firstRec = prevBest >= TOTAL_SWIMMERS, rec = o.rank < prevBest;
  $('resBest').textContent = rec ? (firstRec ? 'FIRST RECORD!' : `old best #${fmt(prevBest)}`) : `best ever #${fmt(meta.best)}`;
  if (o.daily != null && o.dailyBest) $('resBest').textContent += ' · DAILY BEST!';
  $('resBest').className = 'badge hide';
  $('resRecord').classList.add('hide');
  $('shareBtn').textContent = 'Brag 📋';
  renderResUp();
  // one lesson (plain words on the first two swims) and the next Kevin
  const cause = o.cause || (reason === 'energy' && race.p.acid > 0 ? 'acid' : reason === 'energy' && bonkN >= 3 ? 'bonk' : reason);
  const big = !win && meta.runs <= 2 && FIRST_DEATH[cause];
  $('resTip').textContent = win ? '' : big || pickLine(TIP_BY_REASON[cause]) || pickLine(TIP_BY_REASON[reason]) || pickLine(TIPS);
  $('resTip').classList.toggle('big', !!big);
  $('resSyn').textContent = soCloseLine();
  const nk = kevinNo(), kt = nk <= 3 ? KEVIN_NEXT.few : nk <= 10 ? KEVIN_NEXT.many : KEVIN_NEXT.tenPlus;
  const ms = RUN_MILESTONES.find((x) => x[0] === meta.runs);
  let nx = ms ? ms[1] : win ? '' : fillLine(pickLine(kt), { n: fmt(nk) });
  if (o.daily != null && DAILY_LINES.streak && streakOf() > 0) nx = (DAILY_LINES.streak[clamp(streakOf(), 1, DAILY_LINES.streak.length) - 1] || '') + (nx ? ' ' + nx : '');
  $('resNext').textContent = nx;
  const goal = nextGoalLine(o.nextGoal); setT($('resGoal'), goal); setC($('resGoal'), 'hide', !goal);
  // the rematch button names who you are coming back for, in their colour
  const ab = $('againBtn'); ab.textContent = rematchLabel(o, by, close);
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
  resAnim = { t: 0, dur: red ? 0.01 : 1.2, step: red ? 0.01 : 0.28, rank: o.rank, dna: o.dna, rec, firstRec, done: false, tick: 0, lines, shown: -1 };
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
    } else { $('resBest').classList.remove('hide'); $('resBest').classList.toggle('rec', !!a.rec); }
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
const DAD_PICKS = { energy: ['water', 'sleep', 'berries'], acid: ['water', 'sleep', 'berries'], wbc: ['hottub', 'sleep'], late: ['broccoli', 'beatbox'] };
function renderResUp() {
  const el = $('resUp'), o = lastResult || {};
  const opts = HABIT_ORDER.filter((id) => lv(meta, id) < habMax(id)).map((id) => ({ id, l: lv(meta, id), cost: habitCost(id, lv(meta, id)) })).sort((a, b) => a.cost - b.cost);
  if (!opts.length) { el.classList.add('hide'); return; }
  const cause = o.cause || o.reason, wants = o.reason === 'win' ? [] : DAD_PICKS[cause] || [];
  const picks = wants.map((id) => opts.find((x) => x.id === id)).filter(Boolean);
  const dad = picks.find((x) => meta.dna >= x.cost) || picks[0] || null;
  const can = dad && meta.dna >= dad.cost ? dad : opts.find((x) => meta.dna >= x.cost), x = dad || can || opts[0], h = HABITS[x.id];
  const a = habEff(x.id, x.l), b = habEff(x.id, x.l + 1);
  const eff = a && b ? (x.l ? `${esc(a)} → ${esc(b)}` : 'Next: ' + esc(b)) : esc(h.desc);
  const why = dad && x === dad ? `<div class="dp">DAD'S PICK · ${esc(DAD_PICK_LINES[cause] || DAD_PICK_LINES[o.reason] || '')}</div>` : '';
  const affordable = meta.dna >= x.cost;
  el.classList.remove('hide'); el.classList.toggle('can', affordable);
  if (affordable) {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)}</b><small>${eff}</small></div><button id="resBuy">BUY<small>${fmt(x.cost)} DNA</small></button>`;
    $('resBuy').onclick = () => { if (buy(x.id)) { renderResUp(); R.pop(VIEW_W / 2, race.p.y + 160, h.icon + ' ' + h.name + '!', '#7dffb0', 20); } };
  } else {
    el.innerHTML = `<div class="ic">${h.icon}</div><div class="tx">${why}<b>${esc(h.name)} in ${fmt(x.cost - meta.dna)} DNA</b><small>${eff}</small><div class="bb"><i style="transform:scaleX(${clamp(meta.dna / x.cost, 0, 1).toFixed(3)})"></i></div></div>`;
  }
}
async function share() {
  const o = lastResult; if (!o) return;
  const tail = tierLine(SHARE_LINES, o.rank);
  const head = o.reason === 'win' ? 'I beat 999,999 swimmers and became a PERSON in Million To One.'
    : `I finished #${fmt(o.rank)} out of 1,000,000 swimmers in Million To One.`;
  const text = `${head}${tail ? ' ' + tail : ''} (Kevin #${kevinN})`;
  buzz(10);
  if (navigator.share) {
    try { await navigator.share({ title: 'Million To One', text, url: SHARE_URL }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const full = text + ' ' + SHARE_URL;
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
  $('shopList').innerHTML = HABIT_ORDER.map((id) => {
    const h = HABITS[id], l = lv(meta, id), mx = habMax(id), maxed = l >= mx, cost = habitCost(id, l);
    const a = habEff(id, l), b = maxed ? null : habEff(id, l + 1);
    const ef = maxed && a ? `<div class="ef">${esc(a)} · MAXED</div>` : a && b ? `<div class="ef">${l ? esc(a) + ' → ' + esc(b) : 'Next: ' + esc(b)}</div>` : `<div class="ds">${esc(h.desc)}</div>`;
    return `<div class="hab${!maxed && meta.dna >= cost ? ' can' : ''}"><div class="ic">${h.icon}</div><div><div class="nm">${esc(h.name)}</div>${ef}<div class="pips">${'●'.repeat(Math.min(l, mx))}${'○'.repeat(Math.max(0, mx - l))}</div></div><button data-id="${id}" ${maxed || meta.dna < cost ? 'disabled' : ''}>${maxed ? 'MAX' : fmt(cost)}<small>${maxed ? '' : 'DNA'}</small></button></div>`;
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
  $('tabCombos').textContent = `Combos ${seen.length}/${tot}`;
  if (albumTab === 'babies') {
    $('albumH').textContent = 'Baby Album';
    $('albumSub').textContent = 'Every win becomes a person. Every person grows up and becomes the next dad.';
    // the family tree, oldest at the top, and a dashed slot for whoever comes next
    const bs = meta.babies;
    const node = (b, i) => { const fw = firstWord(b); return `<div class="node"><i class="slot" data-i="${i}"></i><div class="nd"><div class="bn">${esc(b.name)}</div><div class="of">child of ${esc(i ? bs[i - 1].name : 'Kevin #1,000,000')}</div>${fw ? `<div class="fw">First words: ${esc(fw)}</div>` : ''}<div class="tr">${esc((b.traits || []).join(', '))}.</div><div class="tr dim">Generation ${b.gen} · swim #${b.run}</div></div></div>`; };
    const nextOf = bs.length ? bs[bs.length - 1].name : 'Kevin #1,000,000';
    $('albumList').innerHTML = `<div class="tree">${bs.map(node).join('')}<div class="node next"><i class="q">?</i><div class="nd"><div class="bn">???</div><div class="of">child of ${esc(nextOf)}</div><div class="tr">${bs.length ? 'Win again to meet them.' : 'No babies yet. Win a race to make one. The current record holder is Chad Thundertail, who has never won.'}</div></div></div></div>`;
    for (const sl of $('albumList').querySelectorAll('.slot')) sl.replaceWith(babyCanvas(bs[+sl.dataset.i], 64));
  } else {
    $('albumH').textContent = CODEX_LINES.header || 'The Combo Book';
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
$('prog').insertAdjacentHTML('afterbegin', ticks + RIVALS.map((r, k) => `<div class="rv${k % 2 ? ' lo' : ''}" id="rv${k}"><i class="dot" style="background:${r.col}"></i><span class="tag" style="color:${r.col}">${esc(first(r.name))}</span></div>`).join(''));
const H = {
  rank: $('rank'), tick: $('rankTick'), alive: $('alive'), cm: $('cm'), zone: $('zoneName'), fill: $('progFill'), me: $('me'),
  efill: $('efill'), ebar: $('ebar'), shields: $('shields'), combo: $('combo'), cn: $('combo').querySelector('.n'), cw: $('combo').querySelector('.w'),
  cbar: $('combo').querySelector('.bar i'), cbarW: $('combo').querySelector('.bar'), cm2: $('combo').querySelector('.m'), cft: $('combo').querySelector('.ft'),
  ctag: $('combo').querySelector('.tag'), cin: $('combo').querySelector('.in'), dash: $('dashBtn'), muts: $('mutRow'), elow: $('elow'),
  rv: RIVALS.map((r, k) => $('rv' + k)),
};
let tickSum = 0, tickT = 0, histT = 0, rankHist = [], jumpT = 0, lastCombo = 0, comboFlash = 0, mutSig = '', msIdx = 0, rvState = [], lastShout = 0, tagT = 0, heartAcc = 0, lastZone = -1;
let quip = { zi: -1, done: 0 }, lastQuip = ''; const usedQuips = new Set();
const MILESTONES = [[100000, 'TOP 100,000!'], [10000, 'TOP 10,000!'], [1000, 'TOP 1,000!'], [100, 'TOP 100!'], [10, 'TOP 10!'], [1, 'IN THE LEAD!']];
const COMBO_TIERS = [3, 10, 20, 30, 45, 60];
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
}
function bossPassed(k) {
  const el = H.rv[k]; if (!el) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}
function comboTag(t) { setT(H.ctag, t); H.ctag.classList.add('on'); setC(H.cw, 'tagged', true); tagT = 1.3; }
const TIER_SCALE = [1, 1, 1.05, 1.1, 1.15, 1.2, 1.25];
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
    if (race.rank < prev) { tickSum += prev - race.rank; tickT = 1.1; if (slowTick) setT(H.tick, '+' + (tickSum >= 10000 ? (tickSum / 1000).toFixed(tickSum < 100000 ? 1 : 0) + 'k' : fmt(tickSum))); setC(H.tick, 'on', true); }
    else if (tickT > 0) { tickT -= dt; if (tickT <= 0) { tickSum = 0; setC(H.tick, 'on', false); } }
    // several thresholds in one leap: only the best one gets the flash
    let ms = null; while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) ms = MILESTONES[msIdx++];
    if (ms) { callout('milestone', { t: ms[1], col: msIdx >= 5 ? '#ffd75c' : '#7dffb0', sec: 1.4 }); sfx('milestone'); buzz([15, 25, 15]); }
  }
  if (slowTick) {
    setT(H.alive, fmt(race.alive) + ' swimmers alive');
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
  // place the tags by measured width, leaders first: no two tags in a row overlap, and none spills off the bar
  const rowsUsed = [[], []], order = RIVALS.map((r, k) => k).filter((k) => tagX[k] != null).sort((a, b) => tagX[b] - tagX[a]);
  for (const k of order) {
    const el = H.rv[k], tg = el._tag || (el._tag = el.querySelector('.tag'));
    if (!el._tw) { const w = tg ? tg.offsetWidth : 0; if (w > 0) el._tw = w; }
    const tw = el._tw || 56, px = tagX[k] / 100 * barW, c = barW > tw ? clamp(px, tw / 2 - 6, barW - tw / 2) : px;
    const lo = c - tw / 2 - 3, hi = c + tw / 2 + 3;
    let row = -1;
    for (const r of [k % 2, 1 - k % 2]) if (!rowsUsed[r].some((iv) => lo < iv[1] && hi > iv[0]) && (r === 1 || Math.abs(tagX[k] - meX) > 4)) { row = r; break; }
    if (row >= 0) rowsUsed[row].push([lo, hi]);
    setC(el, 'lo', row === 1); setC(el, 'notag', row < 0);
    const sh = Math.round(c - px);
    if (tg && el._sh !== sh) { el._sh = sh; tg.style.transform = sh ? `translateX(calc(-50% + ${sh}px))` : ''; }
  }
  setBar(H.efill, p.e / p.maxE);
  const low = p.e < 25; setC(H.efill, 'low', low); setC(H.elow, 'hide', !low); setC(H.ebar, 'shake', low && !S.reduced); setC(H.ebar, 'crit', p.e < 12);
  setT(H.shields, '⛑️'.repeat(Math.min(6, p.shield)) + (p.wing ? '🤝' : ''));
  // combo strip: one row, one bar; its size grows a step per tier but never past the screen edge
  const cb = H.combo, showCombo = p.combo >= 3 && !race.drill && !eggOn && !(firstSwim && clock - raceT0 < 4);
  if (showCombo) {
    if (cb._op !== 1) { cb._op = 1; cb.style.opacity = 1; }
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
    if (p.combo > lastCombo && H.cn.animate && !S.reduced) H.cn.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  } else {
    if (cb._op !== 0) { cb._op = 0; cb.style.opacity = 0; }
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
  }
  setC(H.dash, 'cd', p.dashCd > 0 && !race.drill);
  setT(H.dash, race.drill ? 'DRILL' : 'DASH');
  if (live) {
    coTick(dt);
    if (coachT > 0) { coachT -= dt; if (coachT <= 0) { coachPri = -1; $('coach').classList.remove('on'); } }
  }
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
// Learns the display's own frame period (the median of the first 90 frames), and only steps down when frames
// run 1.3x slower than that for 2 s: first the canvas resolution, then (5 s later, if still slow) the lite renderer.
// Never judged on menus, cards or pause, or in the 3 s after a screen change. Auto retries full quality next session.
const gov = { samples: [], period: 0, ema: 0, slowFor: 0, stage: 0, stageAt: 0, holdUntil: 0 };
function govHold(sec) { gov.holdUntil = Math.max(gov.holdUntil, clock + sec); gov.slowFor = 0; }
function applyGfx() {
  gov.stage = 0; gov.slowFor = 0;
  if (S.gfx === 'lite') { R.lite = true; R.resize(0); gov.stage = 2; }
  else { R.lite = false; R.resize(1); }
  if (R.textScale != null) R.textScale = textScaleNow();
}
function governor(raw) {
  if (S.gfx !== 'auto' || gov.stage >= 2 || raw > 100 || raw <= 0 || document.hidden) return;
  if (gov.samples.length < 90) {
    gov.samples.push(raw);
    if (gov.samples.length === 90) { const s = gov.samples.slice().sort((a, b) => a - b); gov.period = clamp(s[45], 6, 34); gov.ema = gov.period; }
    return;
  }
  const busy = mode !== 'race' || !race || race.paused || race.pending || !$('cards').classList.contains('hide');
  if (busy || clock < gov.holdUntil) { gov.slowFor = 0; return; }
  gov.ema += (raw - gov.ema) * 0.05;
  if (gov.ema > gov.period * 1.3) gov.slowFor += raw / 1000; else gov.slowFor = 0;
  if (gov.slowFor < 2) return;
  if (gov.stage === 0) {
    gov.stage = 1; gov.stageAt = clock; R.resize(0);
    S.q = 0; S.qT = Date.now(); saveUI();
  } else if (gov.stage === 1 && clock - gov.stageAt >= 5) {
    gov.stage = 2; R.lite = true;
  } else return;
  gov.slowFor = 0; gov.ema = gov.period;
}
// world text a touch larger on narrow phones
const textScaleNow = () => clamp(390 / Math.max(240, cv.clientWidth || 390), 1, 1.25);

// ------------------------------------------------------------------ zone-end crawl: only when it is a real moment
let crawlOn = false;
function rivalNear(px) {
  const p = race.p;
  for (let k = 0; k < RIVALS.length; k++) { const a = race.agents[k]; if (a && a.alive && !a.arrived && Math.abs(a.y - p.y) < px && (!p.side || !a.side || a.side === p.side)) return true; }
  return false;
}
function crawlStart() { if (crawlOn) return; crawlOn = true; try { A.slowmo(true); } catch (e) { /* ignore */ } }
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
let last = performance.now(), facT = 0;
function frame(now) {
  const raw = now - last; last = now;
  const dt = clamp(raw / 1000, 0, 0.05);
  governor(raw);
  const inRace = !!race && mode === 'race' && !race.demo;
  const live = !(inRace && race.paused);
  if (live) clock += dt;
  // slow-mo: event hits, the first look at a hazard, and a crawl over the end of a zone when a rival is close or the combo is big
  let want = 1;
  if (inRace && !S.reduced && !race.drill && !race.over && live) {
    const nz = ZSTART[race.zoneReached + 1], d = nz != null ? nz - race.p.y : -1;
    if (d > 0 && d < 240 && (race.p.combo >= 10 || rivalNear(200))) { want = 0.45; crawlStart(); }
    else crawlEnd(false);
    if (hazSlowT > 0) want = Math.min(want, 0.45);
  }
  if (live) {
    if (freezeT > 0) { freezeT -= dt; timeScale = 0.3; }
    else if (slowT > 0) { slowT -= dt; timeScale = 0.35; if (slowT <= 0 && !crawlOn) { try { A.slowmo(false); } catch (e) { /* ignore */ } } }
    else timeScale += (want - timeScale) * Math.min(1, dt * 6);
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
    if (!held) { const sdt = dt * timeScale, n = 4; for (let i = 0; i < n; i++) race.step(sdt / n); }
    if (race.demo && (race.over || race.pending)) { if (race.pending) race.choose(race.pending[0]); else demo(); }
    onEvents(); flushPasses(dt);
    if (inRace && live && !held && dashBuf > 0) { dashBuf -= dt; if (dashBuf <= 0) { dashBuf = 0; if (race.p.dashCd > 0.05) refuseDash(); } }
    if (mode === 'race') {
      if (live) { tutTick(dt); lowTick(dt); hazTick(dt); quipTick(); rivalTick(); eggTick(); }
      ringApply();
      const hidden = $('cards').classList.contains('hide');
      if (race.pending && hidden) {
        if (revealT <= 0) cardStinger();
        else { revealT -= dt; if (revealT <= 0) { revealT = 0; if (race.pending) cards(); } }
      } else if (!race.pending) revealT = 0;
      if (pickT > 0) { pickT -= dt; if (pickT <= 0 && !race.pending && !race.paused) { show(null); govHold(3); } }
      // low energy: a heartbeat every 2 beats, every beat when it is critical
      const p = race.p;
      if (live && !race.over && !race.drill && !race.pending && p.e < 25) {
        heartAcc += dt; const iv = (p.e < 12 ? 1 : 2) * 60 / (A.bpm || 100);
        if (heartAcc >= iv) { heartAcc = 0; sfx('lowE'); }
      } else heartAcc = 0;
      A.combo = p.combo;
    }
    if (mode === 'result') tickResult(dt);
    if (mode === 'title') { facT += dt; if (facT >= 1) { facT = 0; idleTick(meta, Date.now()); renderFactory(); } }
    if (S.reduced) { R.shake = Math.min(R.shake, 1.5); R.flash = Math.min(R.flash, 0.15); if (R.zoomK) R.zoomK = 0; }
    R.beat = A.pulse || 0; R.reduced = S.reduced;
    R.draw(race, dt, held ? 0 : timeScale);
    if (mode === 'race' && !race.over) drawHud(dt, live);
  }
  if (welcomeAnim) welcomeTick(dt);
  A.tick();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { R.resize(); R.textScale = textScaleNow(); measureHud(); measureBar(); if (H.combo) H.combo._sw = null; });
// Auto starts at full quality every session (a slow phone steps down again within seconds); Full and Lite are fixed
if (S.gfx === 'auto' && S.q === 0) { S.q = 1; saveUI(); }
applyGfx();
if (meta.runs >= 15 && !S.seenHaz.length) { S.seenHaz = Object.keys(HAZARD_INTRO); saveUI(); }
syncMute();
const bootAway = meta.lastSeen ? Date.now() - meta.lastSeen : 0;
title();
maybeWelcome(bootAway);
requestAnimationFrame(frame);
