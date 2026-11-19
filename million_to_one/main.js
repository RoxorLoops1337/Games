// Million To One: the page. Input, game loop, menus, tutorial, HUD juice, settings.
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, SAVE_KEY, VIEW_W, zoneIndex, ZSTART } from './core.js';
import * as C from './core.js';
import { ZONES, RACE_LEN, MUTATIONS, HABITS, HABIT_ORDER, habitCost, COMBO_WORDS, DEATH_LINES, INTRO, PX_PER_CM, RIVALS, TOTAL_SWIMMERS } from './content.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cv = $('cv'), R = new Renderer(cv), A = new Audio();
const SHARE_URL = 'https://games-71g.pages.dev/million_to_one/';

let meta = newMeta();
try { meta = loadMeta(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch (e) { /* private mode */ }
const save = () => { try { meta.lastSeen = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------------ settings (own key: loadMeta drops unknown fields)
const UI_KEY = 'million_to_one_ui';
let prefersReduced = false;
try { prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
const S = { music: true, sfx: true, haptics: true, reduced: prefersReduced, tutDone: false };
try { const o = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (o && typeof o === 'object') for (const k of Object.keys(S)) if (typeof o[k] === typeof S[k]) S[k] = o[k]; } catch (e) { /* ignore */ }
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
// players who already swam before the tutorial existed do not need it
if (meta.runs > 0 && !S.tutDone) { S.tutDone = true; saveUI(); }

function applyAudio() {
  A.setMuted(meta.muted);
  if (!A.ctx) return;
  try {
    if (typeof A.setMusicMuted === 'function') A.setMusicMuted(!S.music);
    else if (A.mlp && A.master) { A.mlp.disconnect(); if (S.music) A.mlp.connect(A.master); }
    if (typeof A.setSfxMuted === 'function') A.setSfxMuted(!S.sfx);
    else if (A.fx) A.fx.gain.value = S.sfx ? 1 : 0;
  } catch (e) { /* audio graph changed shape: ignore */ }
}
let audioApplied = null;
function unlock() { A.unlock(); if (A.ctx && audioApplied !== A.ctx) { audioApplied = A.ctx; applyAudio(); } }
const muffle = (on) => { try { if (A.setMuffle) A.setMuffle(on); } catch (e) { /* optional */ } };
const sfx = (n, k) => { if (S.sfx) A.sfx(n, k); };
A.setMuted(meta.muted); $('muteChk').checked = meta.muted;
document.body.classList.toggle('reduced', S.reduced);

// haptics: tiny, throttled, guarded
let lastBuzz = 0;
function buzz(pat, force) {
  if (!S.haptics || !navigator.vibrate) return;
  const now = performance.now(); if (!force && now - lastBuzz < 70) return; lastBuzz = now;
  try { navigator.vibrate(pat); } catch (e) { /* not allowed */ }
}

let race = null, mode = 'title', timeScale = 1, slowT = 0, shownRank = TOTAL_SWIMMERS, hintT = 0, prevBest = TOTAL_SWIMMERS;
window.game = { get race() { return race; }, get meta() { return meta; }, get settings() { return S; } };

// a demo race runs behind the title screen
function demo() { race = new Race(newMeta(), Math.random, { autopilot: true }); race.demo = true; R.camY = null; }

const OVERLAYS = ['title', 'intro', 'cards', 'result', 'shop', 'album', 'pause', 'settings'];
function show(id) { for (const o of OVERLAYS) $(o).classList.toggle('hide', o !== id); if (id !== 'cards') $('cards').classList.remove('out'); }
function hud(on) {
  for (const id of ['hud', 'dashBtn', 'pauseBtn']) $(id).classList.toggle('hide', !on);
  if (!on) { $('combo').style.opacity = 0; $('drillUI').classList.add('hide'); tutHide(); $('milestone').classList.remove('on'); }
}

// ------------------------------------------------------------------ title
function title() {
  mode = 'title'; demo(); hud(false); show('title'); muffle(false);
  idleTick(meta, Date.now()); save();
  $('titleStats').innerHTML = `<div class="stat"><b>${meta.best >= TOTAL_SWIMMERS ? '-' : '#' + fmt(meta.best)}</b>best place</div><div class="stat"><b>${fmt(meta.dna)}</b>DNA 🧬</div><div class="stat"><b>${meta.gen + 1}</b>generation</div><div class="stat"><b>${meta.babies.length}</b>babies</div>`;
  const bank = Math.floor(meta.bank);
  $('bankBox').classList.toggle('hide', bank < 1);
  if (bank >= 1) $('bankBox').innerHTML = `🏭 While you were away, Dad's factory made <b>${fmt(bank)} DNA</b> (${factoryRate(meta)}/hour)<br><button class="btn gold" id="bankBtn" style="margin:6px auto 0;font-size:16px;padding:8px">Collect</button>`;
  const bb = $('bankBtn'); if (bb) bb.onclick = () => { const d = collectBank(meta); unlock(); sfx('dna'); buzz(20); save(); title(); R.pop(VIEW_W / 2, race.p.y + 200, '+' + d + ' DNA', '#7dffb0', 26); };
  $('autoWrap').classList.toggle('hide', !lv(meta, 'gps')); $('autoChk').checked = meta.autopilot;
  const daily = typeof C.dailySeed === 'function';
  $('dailyBtn').classList.toggle('hide', !daily || meta.runs < 1);
  if (daily) {
    const today = C.dailySeed(), mine = meta.dailyDay === today;
    $('dailyBtn').innerHTML = `Daily Swim 📅 <small>${mine && meta.dailyBest < TOTAL_SWIMMERS ? 'today: #' + fmt(meta.dailyBest) : 'same tube for everyone today'}</small>`;
  }
}

// ------------------------------------------------------------------ intro story
// tap to advance; lines also move on by themselves, and the last one ("SWIM.") launches you
let introTO = 0;
function intro(done) {
  show('intro'); let i = 0;
  const end = () => { clearTimeout(introTO); $('intro').onclick = null; $('introSkip').onclick = null; meta.introSeen = true; save(); done(); };
  const next = () => {
    clearTimeout(introTO);
    if (i >= INTRO.length) return end();
    const t = INTRO[i++], el = $('introTxt');
    el.textContent = t; el.classList.toggle('big', t === 'SWIM.' || t === 'Dead last.');
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    sfx('tap');
    introTO = setTimeout(next, i >= INTRO.length ? 900 : 3400);
  };
  $('intro').onclick = next;
  $('introSkip').onclick = (e) => { e.stopPropagation(); end(); };
  next();
}

// ------------------------------------------------------------------ run
let runOpts = {};
function start(opts) {
  unlock(); A.on = true;
  runOpts = opts || {};
  try { if (A.newRun) A.newRun(); } catch (e) { /* optional */ }
  const o = { autopilot: meta.autopilot && lv(meta, 'gps') > 0 };
  if (runOpts.daily && typeof C.dailySeed === 'function') o.seed = C.dailySeed();
  race = new Race(meta, Math.random, o);
  R.camY = null; R.parts = []; R.pops = []; if (R.rings) R.rings = [];
  shownRank = race.rank; prevBest = meta.best; prevBestCombo = meta.bestCombo || 0;
  resetHud();
  mode = 'race'; show(null); hud(true); muffle(false);
  banner(ZONES[0].name, race.daily != null ? 'DAILY SWIM · ZONE 1' : 'ZONE 1', ZONES[0].coach);
  if (!S.tutDone && !race.autopilot) tutStart();
  else hint(race.autopilot ? 'Autopilot is ON. Sit back. Tap DASH if you like.' : 'Drag to steer. Tuck in behind rivals to draft. Double tap or DASH to burst.', 5);
}
let bannerT = 0;
function banner(t, z, c, sec) {
  const b = $('banner');
  b.querySelector('.t').textContent = t; b.querySelector('.z').textContent = z || ''; b.querySelector('.c').textContent = c || '';
  b.querySelector('.c').style.display = c ? '' : 'none';
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); bannerT = sec || (c ? 4.2 : 1.6);
}
function hint(t, sec = 3) { if (tut && tut.on) return; $('hint').textContent = t; $('hint').style.opacity = 1; hintT = sec; }
let msT = 0;
function milestone(t, col) {
  const m = $('milestone'); m.textContent = t; m.style.color = col || '';
  m.classList.remove('on'); void m.offsetWidth; m.classList.add('on'); msT = 1.6;
}

// ------------------------------------------------------------------ first-run tutorial (never blocks: every step times out)
const TUT = [
  { id: 'steer', t: 'Drag anywhere to steer', s: 'Left, right, wiggle wiggle.', ic: '👆' },
  { id: 'draft', t: 'Tuck in BEHIND a rival', s: 'Their wake pulls you along. Rude, but fast.', ic: '💨' },
  { id: 'dash', t: 'Double tap or hit DASH', s: 'A burst of speed for a sip of energy.', ic: '⚡' },
  { id: 'fruit', t: 'Grab the fruit sugar', s: 'Energy is life. Fruit is energy. Eat fruit.', ic: '🍓' },
];
let tut = null;
function tutStart() { tut = { on: true, i: -1, t: 0, done: {}, steer: 0, draftT: 0, okT: 0 }; tutNext(); }
function tutNext() {
  if (!tut) return;
  let i = 0; while (i < TUT.length && tut.done[TUT[i].id]) i++;
  if (i >= TUT.length) return tutFinish(true);
  tut.i = i; tut.t = 0;
  const st = TUT[i], el = $('tut');
  el.querySelector('.ic').textContent = st.ic; el.querySelector('.tt').textContent = st.t; el.querySelector('.ts').textContent = st.s;
  el.querySelector('.dots').innerHTML = TUT.map((x, k) => `<i class="${tut.done[x.id] ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('');
  el.className = 'on step-' + st.id;
  $('dashBtn').classList.toggle('nudge', st.id === 'dash');
}
function tutMark(id) {
  if (!tut || !tut.on || tut.done[id]) return;
  tut.done[id] = true;
  const cur = TUT[tut.i] && TUT[tut.i].id === id;
  if (cur) { tut.okT = 0.7; $('tut').classList.add('ok'); sfx('pick'); buzz(12); $('dashBtn').classList.remove('nudge'); }
}
function tutFinish(all) {
  if (!tut) return;
  tut.on = false; S.tutDone = true; saveUI(); tutHide();
  if (all && race && !race.demo) { milestone("YOU'RE A NATURAL!", '#7dffb0'); setTimeout(() => hint('Now go pass a MILLION of them.', 3), 200); }
}
function tutHide() { $('tut').className = ''; $('tutTarget').classList.add('hide'); $('dashBtn').classList.remove('nudge'); }
function tutTick(dt) {
  if (!tut || !tut.on || !race || race.demo) return;
  if (race.zoneReached > 0 || race.over) return tutFinish(false);
  const p = race.p;
  if (p.draft > 0.08) { tut.draftT += dt; if (tut.draftT > 0.5) tutMark('draft'); }
  if (tut.steer > 60) tutMark('steer');
  if (tut.okT > 0) { tut.okT -= dt; if (tut.okT <= 0) tutNext(); }
  else { tut.t += dt; if (tut.t > 9) { tut.done[TUT[tut.i].id] = true; tutNext(); } }
  // draft step: a ring that marks the sweet spot behind the nearest rival ahead
  const tg = $('tutTarget');
  if (tut.on && TUT[tut.i] && TUT[tut.i].id === 'draft' && tut.okT <= 0 && R.camY != null) {
    let best = null, bd = 1e9;
    for (const a of race.agents) {
      if (!a.alive || a.arrived) continue;
      const dy = a.y - p.y; if (dy < 50 || dy > 320) continue;
      const d = dy + Math.abs(race.agentX(a) - p.x) * 1.5; if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      const k = cv.clientWidth / VIEW_W, x = race.agentX(best) * k, y = R.sy(best.y - 55) * k;
      tg.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; tg.classList.remove('hide');
    } else tg.classList.add('hide');
  } else tg.classList.add('hide');
}

// ------------------------------------------------------------------ input
let drag = null, lastDown = 0;
const toWorldX = (clientX) => { const r = cv.getBoundingClientRect(); return (clientX - r.left) / r.width * VIEW_W; };
cv.addEventListener('pointerdown', (e) => {
  unlock();
  if (mode !== 'race' || !race) return;
  if (race.drill) { race.input.tap++; sfx('drill', race.input.tap); buzz(6); R.burst(race.p.x, race.p.y + 20, '#5ce1ff', 4, 160, 0.3, 2); if (!S.reduced) R.shake = Math.max(R.shake, 3); return; }
  const now = performance.now();
  if (now - lastDown < 280) race.input.dash = true;
  lastDown = now;
  drag = { id: e.pointerId, sx: toWorldX(e.clientX), px: race.p.x, lx: e.clientX };
  race.input.tx = race.p.x;
  if (race.autopilot) { race.autopilot = false; hint('Autopilot off. You are driving!', 2); }
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || !race) return;
  race.input.tx = drag.px + (toWorldX(e.clientX) - drag.sx) * 1.35;
  if (tut) { tut.steer += Math.abs(e.clientX - drag.lx); drag.lx = e.clientX; }
});
const up = (e) => { if (drag && e.pointerId === drag.id) { drag = null; if (race) race.input.tx = null; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key] = 1;
  if (!race || mode !== 'race') return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (race.drill) race.input.tap++; else race.input.dash = true; e.preventDefault(); }
  if (e.key === 'Escape' || e.key === 'p') pause();
  if (race.pending && cardsLive() && '123'.includes(e.key)) pick(race.pending[+e.key - 1]);
  if (tut && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd')) tut.steer += 25;
});
addEventListener('keyup', (e) => { keys[e.key] = 0; });
$('dashBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); unlock(); if (!race) return; if (race.drill) { race.input.tap++; buzz(6); } else race.input.dash = true; });

// ------------------------------------------------------------------ pause + settings
let settingsFrom = 'pause';
function pause() { if (mode !== 'race' || !race || race.pending || race.over) return; race.paused = true; show('pause'); muffle(true); }
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = () => { race.paused = false; show(null); muffle(false); };
$('quitBtn').onclick = () => { race.paused = false; show(null); muffle(false); race.end('energy'); };
function openSettings(from) {
  settingsFrom = from; show('settings');
  $('setMusic').checked = S.music; $('setSfx').checked = S.sfx; $('setHaptics').checked = S.haptics; $('setReduced').checked = S.reduced;
  $('setHapticsRow').classList.toggle('dim', !navigator.vibrate);
}
$('pauseSetBtn').onclick = () => openSettings('pause');
$('titleSetBtn').onclick = () => { unlock(); openSettings('title'); };
$('setBack').onclick = () => (settingsFrom === 'pause' ? show('pause') : title());
$('setMusic').onchange = (e) => { S.music = e.target.checked; saveUI(); unlock(); applyAudio(); };
$('setSfx').onchange = (e) => { S.sfx = e.target.checked; saveUI(); unlock(); applyAudio(); sfx('tap'); };
$('setHaptics').onchange = (e) => { S.haptics = e.target.checked; saveUI(); buzz(25, true); };
$('setReduced').onchange = (e) => { S.reduced = e.target.checked; saveUI(); document.body.classList.toggle('reduced', S.reduced); };
$('setTut').onclick = () => { S.tutDone = false; saveUI(); $('setTut').textContent = 'Tutorial on next swim ✓'; };

// ------------------------------------------------------------------ mutation cards: slow-mo stinger, then a dramatic deal
let revealT = 0, cardsAt = 0, pickT = 0;
const cardsLive = () => !$('cards').classList.contains('hide') && !$('cards').classList.contains('out');
function cardStinger() {
  revealT = S.reduced ? 0.12 : 0.6;
  const p = race.p;
  sfx('zone'); buzz([20, 40, 30]); muffle(true);
  if (!S.reduced) { R.flash = 0.45; R.flashCol = 'rgba(255,240,200,0.5)'; if (R.zoomPunch) R.zoomPunch(0.14); R.shake = 6; }
  if (R.ring) R.ring(p.x, p.y, '#ffd75c', 120, 0.6, 7);
  if (R.confetti) R.confetti(p.x, p.y, 40);
  R.pop(p.x, p.y + 90, 'ZONE CLEARED!', '#ffd75c', 26, 1.2);
}
function cards() {
  const zi = race.zoneReached;
  $('cardsSub').textContent = `${ZONES[zi - 1].name.toUpperCase()} CLEARED · PLACE #${fmt(race.rank)}`;
  $('cardRow').innerHTML = race.pending.map((id, k) => {
    const m = MUTATIONS[id], have = race.muts[id] || 0;
    const syn = (C.SYNERGIES || []).find((s) => s.needs.includes(id) && s.needs.every((n) => n === id || race.muts[n] > 0) && !(race.syn && race.syn[s.id]));
    return `<button class="card r${m.r}" data-id="${id}" style="animation-delay:${(k * 0.12).toFixed(2)}s"><div class="ic">${m.icon}</div><div><div class="lvl">${['COMMON', 'RARE', 'LEGENDARY'][m.r - 1]}${have ? ' · LV ' + (have + 1) : ''}<span class="key">${k + 1}</span></div><div class="nm">${m.name}</div><div class="ds">${m.desc}</div>${syn ? `<div class="syn">${syn.icon} Unlocks combo: ${syn.name}</div>` : ''}</div>${m.r === 3 ? '<i class="shine"></i>' : ''}</button>`;
  }).join('');
  for (const b of $('cardRow').querySelectorAll('.card')) b.onclick = () => pick(b.dataset.id);
  $('rerollBtn').classList.toggle('hide', race.rerolls <= 0);
  $('rerollBtn').textContent = `🎲 Reroll (${race.rerolls})`;
  $('cards').classList.remove('out'); show('cards'); cardsAt = performance.now();
  sfx('cards');
  if (race.pending.some((id) => MUTATIONS[id].r === 3)) setTimeout(() => { sfx('shield'); buzz([10, 30, 10]); }, 380);
}
$('rerollBtn').onclick = () => { if (race.reroll()) { sfx('reroll'); buzz(10); cards(); } };
function pick(id) {
  if (!race.pending || performance.now() - cardsAt < 320) return;
  const el = $('cardRow').querySelector(`.card[data-id="${id}"]`);
  if (!race.choose(id)) return;
  sfx('pick'); buzz(18);
  if (el) el.classList.add('picked');
  $('cards').classList.add('out'); pickT = S.reduced ? 0.05 : 0.28;
  muffle(false);
  const zi = race.zoneReached, z = ZONES[zi];
  banner(z.name, `ZONE ${zi + 1}`, z.coach);
  A.bpm = z.beat; sfx('zone');
  R.pop(race.p.x, race.p.y + 60, MUTATIONS[id].icon + ' ' + MUTATIONS[id].name, '#ffd75c', 18, 1.6);
  timeScale = S.reduced ? 1 : 0.25;   // ease back into the action
}

// ------------------------------------------------------------------ events -> juice
function onEvents() {
  const p = race.p;
  for (const ev of race.events) {
    if (race.demo) continue;
    switch (ev.type) {
      case 'pass':
        sfx('pass', p.combo);
        if (ev.boss) {
          R.pop(ev.x, ev.y + 30, `PASSED ${ev.boss.toUpperCase()}!`, '#ffd75c', 20, 1.6); R.flash = 0.3; R.flashCol = 'rgba(255,215,92,0.35)'; slow(0.4); R.shake = 6;
          sfx('boss'); buzz([15, 30, 25]); bossPassed(ev.boss);
        } else passSum += ev.w;
        R.burst(ev.x, ev.y, '#ffffff', 3, 80, 0.35, 2);
        break;
      case 'combo':
        if (ev.kind === 'close') R.pop(ev.x, ev.y + 30, 'CLOSE!', '#5ce1ff', 15);
        if (ev.kind === 'gate') R.pop(p.x, p.y + 40, 'THREADED!', '#d9b8ff', 16);
        if (ev.n && ev.n % 10 === 0) sfx('combo', ev.n);
        break;
      case 'frenzy': {
        const T = C.FRENZY_TIERS, tier = ev.tier || 1, name = ev.name || (ev.first ? 'FRENZY!' : 'MEGA FRENZY!');
        sfx('frenzy'); R.flash = 0.35; R.flashCol = 'rgba(255,255,255,0.4)'; R.shake = 8 + tier * 2; slow(0.3 + tier * 0.05);
        R.burst(p.x, p.y, '#ffd75c', 30, 260, 0.8, 4); R.pop(p.x, p.y + 80, name, '#ffd75c', 28 + tier * 2, 1.4);
        if (R.ring) R.ring(p.x, p.y, '#ffd75c', 90 + tier * 25, 0.5, 6);
        if (tier >= 3 && R.confetti) R.confetti(p.x, p.y, 20 + tier * 8);
        if (ev.desc && T && tier > 1) hint(ev.desc, 2.2);
        A.intensity = 2; buzz(tier >= 3 ? [30, 40, 30, 40, 80] : [20, 30, 60]);
        comboFlash = 0.5;
        break;
      }
      case 'frenzyEnd': A.intensity = race.zoneReached >= 3 ? 1 : 0; sfx('frenzyEnd'); break;
      case 'comboEnd': if (ev.n >= 10) R.pop(p.x, p.y + 70, `${ev.n} COMBO`, '#ff8bb0', 18); sfx('comboEnd', ev.n); if (ev.n >= 10) buzz(15); break;
      case 'sugar': sfx('sugar'); R.burst(ev.x, ev.y, '#7dffb0', 6, 90, 0.4, 2.5); tutMark('fruit'); break;
      case 'dna': sfx('dna'); R.burst(ev.x, ev.y, '#ff5cd2', 14, 140, 0.6, 3); R.pop(ev.x, ev.y + 20, '+5 DNA', '#ff8be0', 16); buzz(8); break;
      case 'shield': sfx('shield'); R.pop(ev.x, ev.y + 20, '+1 SHIELD', '#ffd75c', 16); buzz(12); break;
      case 'alkali': sfx('alkali'); R.pop(ev.x, ev.y + 20, 'pH OK!', '#5cc8ff', 14); break;
      case 'dash': sfx('dash'); R.burst(p.x, p.y - 20, '#8cdcff', 10, 180, 0.4, 2.5); R.shake = Math.max(R.shake, 2); buzz(12); tutMark('dash'); break;
      case 'bonk': sfx('bonk'); R.shake = 10; R.pop(ev.x, ev.y, 'SPLAT', '#d9b8ff', 20); hint('Find the GAP in the goo wall!', 2); buzz(45); break;
      case 'surf': sfx('surf'); R.pop(ev.x, ev.y + 20, 'SURF!', '#d9b8ff', 18); break;
      case 'bump': R.shake = 4; R.pop(ev.x, ev.y + 20, 'BONK!', '#ffb36b', 16); sfx('bump'); buzz(15); break;
      case 'pop': sfx('pop'); R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4); R.shake = 9; buzz(20); break;
      case 'blast': if (R.ring) R.ring(ev.x, ev.y, '#ffffff', ev.r || 160, 0.5, 8); R.pop(ev.x, ev.y + 50, `${ev.n} POPPED!`, '#ffffff', 20 + Math.min(10, ev.n * 2), 1.2); buzz([20, 20, 40]); break;
      case 'shieldHit': sfx('hit'); R.flash = 0.5; R.flashCol = 'rgba(255,215,92,0.5)'; R.pop(p.x, p.y + 40, 'SHIELD SAVED YOU', '#ffd75c', 17); slow(0.5); buzz([40, 30, 40]); break;
      case 'wingHit': sfx('hit'); R.pop(p.x, p.y + 40, 'WINGMAN TOOK IT 🫡', '#ffe0a8', 17); buzz([30, 30, 30]); break;
      case 'wingBack': R.pop(p.x, p.y + 50, 'WINGMAN IS BACK 🤝', '#ffe0a8', 16); break;
      case 'second': sfx('second'); R.flash = 0.8; R.flashCol = 'rgba(255,92,140,0.6)'; R.pop(p.x, p.y + 60, 'SECOND WIND!', '#ff5c8a', 26, 1.6); buzz([60, 40, 60, 40, 120]); break;
      case 'synergy':
        R.pop(p.x, p.y + 110, `${ev.icon || '✨'} ${String(ev.name || 'SYNERGY').toUpperCase()}!`, '#d9b8ff', 24, 2);
        if (R.ring) R.ring(p.x, p.y, '#d9b8ff', 130, 0.6, 7);
        banner(`${ev.icon || ''} ${ev.name || 'Synergy'}`, ev.fresh ? 'NEW COMBO DISCOVERED' : 'COMBO UNLOCKED', ev.desc || null, 3);
        sfx('shield'); buzz([20, 40, 20, 40, 60]); mutSig = '';
        break;
      case 'event': banner(ev.name || 'SOMETHING HAPPENED', 'RACE EVENT', ev.text || null, 3); sfx('boss'); buzz([20, 30, 20]); break;
      case 'eventEnd': hint((ev.name ? ev.name.replace(/[!.]+$/, '') + ' is over.' : 'Back to normal.'), 1.6); break;
      case 'fork': if (ev.right) hint('You smell something sweet up ahead...', 3); else hint('Hmm. It smells... empty in here.', 3); break;
      case 'drill': sfx('egg'); $('drillUI').classList.remove('hide'); banner(ev.rank === 1 ? 'FIRST ONE THERE!' : `#${ev.rank} AT THE EGG`, 'THE EGG', null); slow(0.6); buzz([40, 40, 80]); break;
      case 'over': finish(ev); break;
    }
  }
  race.events.length = 0;
}
// overtakes come in floods: show them as one rolling "+places" number instead of a pile of popups
let passSum = 0, passT = 0;
function flushPasses(dt) {
  passT -= dt;
  if (passT <= 0 && passSum >= 2 && race && !race.demo) { R.pop(race.p.x + (Math.random() - 0.5) * 60, race.p.y + 70, '+' + fmt(passSum) + ' places', '#ffffff', 13 + Math.min(9, Math.log10(passSum) * 2.2), 0.8); passSum = 0; passT = 0.45; }
}
function slow(sec) { if (!S.reduced) slowT = Math.max(slowT, sec); }

// ------------------------------------------------------------------ end of run
let resAnim = null, prevBestCombo = 0, lastResult = null;
function finish(o) {
  save(); lastResult = o;
  const win = o.reason === 'win';
  if (win) buzz([50, 50, 50, 50, 200], true); else buzz([90, 60, 160], true);
  setTimeout(() => {
    if (race && race.over !== o) return;      // a new swim already started
    mode = 'result'; hud(false); A.intensity = 0;
    sfx(win ? 'win' : 'lose');
    const lines = DEATH_LINES[o.reason] || DEATH_LINES.energy;
    $('resTitle').textContent = win ? "IT'S A BABY! 🍼" : ['SO CLOSE', 'OOF', 'WASTED', 'RIP KEVIN'][Math.floor(Math.random() * 4)];
    $('resWhy').textContent = win ? 'You beat 999,999 swimmers. Nature is amazed.' : lines[Math.floor(Math.random() * lines.length)];
    $('resRank').textContent = '#' + fmt(TOTAL_SWIMMERS);
    $('resStats').innerHTML = `<div class="stat"><b>${(o.dist / PX_PER_CM).toFixed(1)} cm</b>swum</div><div class="stat"><b>${fmt(o.overtakes)}</b>overtakes</div><div class="stat${o.combo > prevBestCombo && prevBestCombo > 0 ? ' rec' : ''}"><b>${o.combo}</b>best combo</div><div class="stat"><b>${o.zone + 1}/7</b>zones</div>`;
    $('resBaby').innerHTML = o.baby ? `<div class="baby"><div class="face">👶</div><div class="bn">${o.baby.name}</div><div class="tr">${o.baby.traits.join(', ')}.</div><div class="tr" style="margin-top:6px;opacity:.7">Generation ${o.baby.gen} begins. The race gets faster.</div></div>` : '';
    const syn = Array.isArray(o.synergies) ? o.synergies.map((id) => (C.SYNERGIES || []).find((s) => s.id === id)).filter(Boolean) : [];
    $('resMuts').innerHTML = Object.keys(race.muts).map((id) => `<span>${MUTATIONS[id].icon} ${MUTATIONS[id].name}${race.muts[id] > 1 ? ' x' + race.muts[id] : ''}</span>`).join('') + syn.map((s) => `<span class="sy">${s.icon} ${s.name}</span>`).join('');
    $('resDna').textContent = '+0 DNA 🧬';
    const rec = o.rank < prevBest;
    $('resBest').textContent = rec ? (prevBest >= TOTAL_SWIMMERS ? 'FIRST RECORD!' : `old best #${fmt(prevBest)}`) : `best ever #${fmt(meta.best)}`;
    if (o.daily != null && o.dailyBest) $('resBest').textContent += ' · DAILY BEST!';
    $('resBest').className = 'badge hide';
    $('resRecord').classList.add('hide');
    $('shareBtn').textContent = navigator.share ? 'Share 📣' : 'Copy brag 📋';
    show('result');
    resAnim = { t: 0, dur: S.reduced ? 0.01 : 1.5, rank: o.rank, dna: o.dna, rec, done: false, tick: 0 };
  }, o.reason === 'win' ? 1400 : 900);
  if (win) { R.flash = 1; R.flashCol = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) R.burst(race.p.x, race.p.y + 150, ['#ffd75c', '#ff5c8a', '#5ce1ff'][i % 3], 30, 400, 1.4, 5); if (R.confetti) R.confetti(); }
  else { R.shake = S.reduced ? 2 : 14; R.flash = 0.5; R.flashCol = 'rgba(120,0,30,0.6)'; }
}
function tickResult(dt) {
  const a = resAnim; if (!a || a.done) return;
  a.t += dt; const k = clamp(a.t / a.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
  // rank falls in log space so every digit gets its moment
  const r = Math.exp(Math.log(TOTAL_SWIMMERS) + (Math.log(a.rank) - Math.log(TOTAL_SWIMMERS)) * e);
  $('resRank').textContent = '#' + fmt(k >= 1 ? a.rank : r);
  $('resDna').textContent = `+${fmt(a.dna * e)} DNA 🧬`;
  a.tick -= dt; if (a.tick <= 0 && k < 1) { a.tick = 0.07; sfx('tap'); }
  if (k >= 1) {
    a.done = true;
    const rr = $('resRank'); rr.classList.remove('land'); void rr.offsetWidth; rr.classList.add('land');
    $('resBest').classList.remove('hide');
    if (a.rec) {
      $('resRecord').classList.remove('hide'); $('resBest').classList.add('rec');
      sfx('shield'); buzz([30, 40, 30, 40, 90], true);
      if (R.confetti) R.confetti(); if (R.confetti) R.confetti();
    } else sfx('dna');
  }
}
async function share() {
  const o = lastResult; if (!o) return;
  const text = `I came #${fmt(o.rank)} of 1,000,000 in Million To One`;
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
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove('on'), 2200); }
$('shareBtn').onclick = share;
$('againBtn').onclick = () => { resAnim = null; start(runOpts); };
$('resMenuBtn').onclick = () => { resAnim = null; title(); };

// ------------------------------------------------------------------ shop + album
let shopFrom = 'title';
function shop(from) {
  shopFrom = from || shopFrom; show('shop');
  $('dnaTop').textContent = `${fmt(meta.dna)} DNA 🧬`;
  $('shopList').innerHTML = HABIT_ORDER.map((id) => {
    const h = HABITS[id], l = lv(meta, id), maxed = l >= h.max, cost = habitCost(id, l);
    return `<div class="hab${!maxed && meta.dna >= cost ? ' can' : ''}"><div class="ic">${h.icon}</div><div><div class="nm">${h.name}</div><div class="ds">${h.desc}</div><div class="pips">${'●'.repeat(l)}${'○'.repeat(h.max - l)}</div></div><button data-id="${id}" ${maxed || meta.dna < cost ? 'disabled' : ''}>${maxed ? 'MAX' : fmt(cost)}<small>${maxed ? '' : 'DNA'}</small></button></div>`;
  }).join('');
  for (const b of $('shopList').querySelectorAll('button')) b.onclick = () => { if (buyHabit(meta, b.dataset.id)) { unlock(); sfx('buy'); buzz(15); save(); shop(); } };
}
$('shopBtn').onclick = () => { unlock(); shop('title'); };
$('resShopBtn').onclick = () => { resAnim = null; shop('result'); };
$('shopBack').onclick = () => (shopFrom === 'result' ? show('result') : title());
$('albumBtn').onclick = () => {
  show('album');
  $('albumList').innerHTML = meta.babies.length ? meta.babies.slice().reverse().map((b) => `<div class="baby"><div class="face">👶</div><div class="bn">${b.name}</div><div class="tr">${b.traits.join(', ')}.</div><div class="tr" style="opacity:.6">Generation ${b.gen} · swim #${b.run}</div></div>`).join('')
    : '<div class="sub">No babies yet. Win a race to make one.<br><br>The current record holder is Chad Thundertail, who has never won.</div>';
};
$('albumBack').onclick = () => title();
$('playBtn').onclick = () => { unlock(); if (!meta.introSeen) intro(() => start()); else start(); };
$('dailyBtn').onclick = () => { unlock(); start({ daily: true }); };
$('muteChk').onchange = (e) => { meta.muted = e.target.checked; A.setMuted(meta.muted); save(); };
$('autoChk').onchange = (e) => { meta.autopilot = e.target.checked; save(); };

// ------------------------------------------------------------------ HUD
const ticks = ZSTART.slice(1).map((y) => `<div class="tick" style="left:${y / RACE_LEN * 100}%"></div>`).join('');
$('prog').insertAdjacentHTML('afterbegin', ticks + RIVALS.map((r, k) => `<div class="rv${k % 2 ? ' lo' : ''}" id="rv${k}" style="background:${r.col}"><span class="tag" style="color:${r.col}">${r.name.split(' ')[0]}</span></div>`).join(''));
const H = {
  rank: $('rank'), tick: $('rankTick'), alive: $('alive'), cm: $('cm'), zone: $('zoneName'), fill: $('progFill'), me: $('me'),
  efill: $('efill'), ebar: $('ebar'), shields: $('shields'), combo: $('combo'), cn: $('combo').querySelector('.n'), cw: $('combo').querySelector('.w'),
  cbar: $('combo').querySelector('.bar i'), cm2: $('combo').querySelector('.m'), cft: $('combo').querySelector('.ft'), dash: $('dashBtn'), muts: $('mutRow'),
  rv: RIVALS.map((r, k) => $('rv' + k)),
};
const setT = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
const setC = (el, c, on) => { const k = '_c' + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } };
let lastZone = 0, tickSum = 0, tickT = 0, histT = 0, rankHist = [], jumpT = 0, lastCombo = 0, comboFlash = 0, mutSig = '', msIdx = 0, rvState = [];
const MILESTONES = [[100000, 'TOP 100,000!'], [10000, 'TOP 10,000!'], [1000, 'TOP 1,000!'], [100, 'TOP 100!'], [10, 'TOP 10!'], [1, 'IN THE LEAD!']];
const COMBO_TIERS = [3, 10, 20, 30, 45, 60];
function resetHud() {
  lastZone = -1; tickSum = 0; tickT = 0; histT = 0; rankHist = [race.rank]; jumpT = 0; lastCombo = 0; comboFlash = 0; mutSig = ''; msIdx = 0;
  while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) msIdx++;
  rvState = RIVALS.map(() => ({ ahead: true, alive: true }));
  H.tick.classList.remove('on'); H.tick._last = null; H.tick._con = false; H.muts.innerHTML = '';
  for (const el of H.rv) { el.classList.remove('dead', 'behind', 'hit'); el._cdead = el._cbehind = false; }
  H.rank.classList.remove('jump'); H.rank._cjump = false;
}
function bossPassed(name) {
  const k = RIVALS.findIndex((r) => r.name === name); if (k < 0) return;
  const el = H.rv[k]; el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}
function drawHud(dt) {
  const p = race.p;
  // rank rolls toward the real number (in log space so the big drops feel big)
  const lr = Math.log(shownRank), tr = Math.log(race.rank);
  shownRank = Math.exp(lr + (tr - lr) * Math.min(1, dt * 6));
  if (Math.abs(shownRank - race.rank) < 0.6) shownRank = race.rank;
  const txt = '#' + fmt(shownRank);
  if (H.rank._v !== txt) { setT(H.rank, txt); setC(H.rank, 'bump', true); clearTimeout(H.rank._t); H.rank._t = setTimeout(() => setC(H.rank, 'bump', false), 80); }
  H.rank.style.color = jumpT > 0 ? '#7dffb0' : race.rank <= 1 ? '#ffd75c' : race.rank <= 10 ? '#7dffb0' : '#fff';
  // "+places" ticker and big-jump flash
  histT += dt;
  if (histT >= 0.25) {
    histT = 0; rankHist.push(race.rank); if (rankHist.length > 3) rankHist.shift();
    const gain = rankHist[0] - race.rank;
    if (gain > Math.max(40, race.rank * 0.05) && jumpT <= 0) { jumpT = 0.45; setC(H.rank, 'jump', true); buzz(8); }
  }
  if (jumpT > 0) { jumpT -= dt; if (jumpT <= 0) setC(H.rank, 'jump', false); }
  const prev = H.tick._last == null ? race.rank : H.tick._last; H.tick._last = race.rank;
  if (race.rank < prev) { tickSum += prev - race.rank; tickT = 1.1; setT(H.tick, '+' + fmt(tickSum) + ' places'); setC(H.tick, 'on', true); }
  else if (tickT > 0) { tickT -= dt; if (tickT <= 0) { tickSum = 0; setC(H.tick, 'on', false); } }
  while (msIdx < MILESTONES.length && race.rank <= MILESTONES[msIdx][0]) { const m = MILESTONES[msIdx++]; milestone(m[1], msIdx >= 5 ? '#ffd75c' : '#7dffb0'); sfx('dna'); buzz([15, 25, 15]); }
  setT(H.alive, fmt(race.alive) + ' swimmers alive');
  setT(H.cm, (race.remaining() / PX_PER_CM).toFixed(1) + ' cm');
  const zi = zoneIndex(p.y); if (zi !== lastZone) { lastZone = zi; setT(H.zone, ZONES[zi].name); }
  const pr = (race.progress() * 100).toFixed(2) + '%';
  H.fill.style.width = pr; H.me.style.left = pr;
  // rival dots; name tags take a free row (above or below the bar) or hide when crowded
  const lastX = [-99, -99], meX = race.progress() * 100;
  for (let k = RIVALS.length - 1; k >= 0; k--) {
    const a = race.agents[k], el = H.rv[k], st = rvState[k]; if (!a) continue;
    const x = Math.min(100, a.y / RACE_LEN * 100);
    el.style.left = x.toFixed(2) + '%';
    if (st.alive !== a.alive) { st.alive = a.alive; setC(el, 'dead', !a.alive); }
    const ahead = a.y > p.y; if (st.ahead !== ahead) { st.ahead = ahead; setC(el, 'behind', !ahead); }
    let row = -1;
    for (const r of [k % 2, 1 - k % 2]) if (Math.abs(x - lastX[r]) > 9 && (r === 1 || Math.abs(x - meX) > 3)) { row = r; break; }
    if (row >= 0) lastX[row] = x;
    setC(el, 'lo', row === 1); setC(el, 'notag', row < 0);
  }
  H.efill.style.width = Math.max(0, p.e / p.maxE * 100).toFixed(1) + '%';
  const low = p.e < 25; setC(H.efill, 'low', low); setC(H.ebar, 'shake', low && !S.reduced); setC(H.ebar, 'crit', p.e < 12);
  setT(H.shields, '⛑️'.repeat(Math.min(6, p.shield)) + (p.wing ? '🤝' : ''));
  // combo meter: grows a size class per tier, shows the DNA multiplier and the FRENZY tier
  const cb = H.combo;
  if (p.combo >= 3) {
    cb.style.opacity = 1; setT(H.cn, p.combo + 'x');
    const fz = p.frenzyT > 0;
    let w = ''; for (const [n, word] of COMBO_WORDS) if (p.combo >= n) w = word; setT(H.cw, fz && /FRENZY/.test(w) ? '' : w);
    H.cbar.style.width = Math.max(0, p.comboT / race.s.combo * 100).toFixed(1) + '%';
    let ct = 0; while (ct < COMBO_TIERS.length && p.combo >= COMBO_TIERS[ct]) ct++;
    if (cb._tier !== ct) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.toggle('t' + i, i === ct); if (ct > (cb._tier || 0) && ct > 1) comboFlash = 0.35; cb._tier = ct; }
    setC(cb, 'fz', fz);
    const T = C.FRENZY_TIERS, ti = fz && T ? clamp((p.tier || 1) - 1, 0, T.length - 1) : -1;
    setT(H.cft, ti >= 0 ? T[ti].name : '');
    const mult = typeof C.comboMult === 'function' ? C.comboMult(p.combo) : 0;
    setT(H.cm2, mult ? 'x' + mult.toFixed(2) + ' DNA' : '');
    if (p.combo > lastCombo && H.cn.animate && !S.reduced) H.cn.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  } else { cb.style.opacity = 0; if (cb._tier) { for (let i = 1; i <= COMBO_TIERS.length; i++) cb.classList.remove('t' + i); cb._tier = 0; } }
  lastCombo = p.combo;
  if (comboFlash > 0) { comboFlash -= dt; setC(cb, 'flash', comboFlash > 0); }
  // owned mutations, rebuilt only when they change
  const sig = Object.keys(race.muts).map((id) => id + race.muts[id]).join(',') + '|' + (race.syn ? Object.keys(race.syn).join(',') : '');
  if (sig !== mutSig) {
    const old = new Set(mutSig.split(/[,|]/)); mutSig = sig;
    const syns = race.syn ? Object.keys(race.syn).map((id) => (C.SYNERGIES || []).find((s) => s.id === id)).filter(Boolean) : [];
    H.muts.innerHTML = Object.keys(race.muts).map((id) => `<span class="${old.has(id + race.muts[id]) ? '' : 'new'}" title="${MUTATIONS[id].name}">${MUTATIONS[id].icon}${race.muts[id] > 1 ? `<b>${race.muts[id]}</b>` : ''}</span>`).join('')
      + syns.map((s) => `<span class="sy" title="${s.name}">${s.icon}</span>`).join('');
  }
  setC(H.dash, 'cd', p.dashCd > 0 && !race.drill);
  setT(H.dash, race.drill ? 'DRILL' : 'DASH');
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').style.opacity = 0; }
  if (msT > 0) { msT -= dt; if (msT <= 0) $('milestone').classList.remove('on'); }
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  // slow-mo: event hits, plus a dramatic crawl over the last stretch of a zone
  let want = 1;
  if (race && mode === 'race' && !race.demo && !S.reduced && !race.drill && !race.over) {
    const nz = ZSTART[race.zoneReached + 1];
    if (nz != null && nz - race.p.y < 240 && nz - race.p.y > 0) want = 0.45;
  }
  if (slowT > 0) { slowT -= dt; timeScale = 0.35; } else timeScale += (want - timeScale) * Math.min(1, dt * 6);
  if (race) {
    const kd = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (!drag && mode === 'race') race.input.dir = kd;
    const sdt = dt * timeScale;
    const n = 4; for (let i = 0; i < n; i++) race.step(sdt / n);
    if (race.demo && (race.over || race.pending)) { if (race.pending) race.choose(race.pending[0]); else demo(); }
    onEvents(); flushPasses(dt);
    if (mode === 'race') {
      tutTick(dt);
      const hidden = $('cards').classList.contains('hide');
      if (race.pending && hidden) {
        if (revealT <= 0) cardStinger();
        else { revealT -= dt; if (revealT <= 0) { revealT = 0; if (race.pending) cards(); } }
      } else if (!race.pending) revealT = 0;
      if (pickT > 0) { pickT -= dt; if (pickT <= 0 && !race.pending) show(null); }
    }
    if (mode === 'result') tickResult(dt);
    if (S.reduced) { R.shake = Math.min(R.shake, 1.5); R.flash = Math.min(R.flash, 0.15); if (R.zoomK) R.zoomK = 0; }
    R.draw(race, dt);
    if (mode === 'race' && !race.over) drawHud(dt);
  }
  A.tick();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => R.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (mode === 'race' && race && !race.over) pause(); } });
R.resize();
title();
requestAnimationFrame(frame);
