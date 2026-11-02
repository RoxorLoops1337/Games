// main.js: the app shell. Loads the save, owns the canvas and the DOM root, runs the loop, routes between title, hub, cutscenes and battle.
import { W, H, GAME, WORLDS, BOSSES } from './data_core.js';
import { Run, genWave } from './sim.js';
import { AudioFx } from './audio.js';
import * as M from './meta.js';
import { makeRng } from './rng.js';
import { Battle, battleIdle } from './battle.js';
import { Cutscene } from './cutscene.js';
import { buildHub, settingsModal, setlistSheet, langPicker, welcomeSheet, dailyGigModal, royaltiesModal, whatsNewModal, importModal, friendInviteModal } from './ui_hub.js';
import { showChoice, showPause, showHint, showDefeat, showResults, showHowTo, showPracticeResults } from './ui_run.js';
import { setRoot, h, btn, modal, toast, actionToast, tickLive, muteButton, AE, AW, queueModal, setModalEnv, MODAL_PRIO } from './ui_core.js';
import { submitScore, rankOf, friendFromSearch, withoutFriendParam } from './lb.js';
import { setStyle } from './style.js';
import { initPwa } from './pwa.js';
import * as Stats from './stats.js';
import * as I18N from './i18n.js';
import { initDataLang } from './i18n_data.js';
import { t, tn } from './i18n.js';
import { applyA11y, langOffer, initDomA11y } from './a11y.js';
import { installDiag } from './diag.js';

// error ring buffer for Settings > Report a problem (js/diag.js): the last 20 page errors in drop_the_bass_diag, nothing is sent anywhere
try { installDiag(window, localStorage, () => ({ lang: I18N.getLang(), screen: app.screen })); } catch (e) { /* no storage */ }
const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const ctx = canvas.getContext('2d');
setRoot(ui);
initDomA11y(ui);

// ------------------------------------------------------------------------------------------------ profile
// loadSave: the main save, else the last good backup (recovered), else a new profile. Never throws.
let loaded;
try { loaded = M.loadSave(localStorage, Date.now()); } catch (e) { loaded = { profile: M.newProfile(Date.now()), source: 'new', recovered: false, corrupt: false, hadSave: false }; }
let profile = loaded.profile;
// a brand new profile follows the system 'reduce motion' preference; a stored choice is never touched (meta.applyFreshDefaults)
const freshDefaults = (p) => M.applyFreshDefaults(p, typeof matchMedia === 'function' ? matchMedia.bind(window) : null);
if (!loaded.hadSave) freshDefaults(profile);
// language before the first paint: the profile choice, else the one stored on this device, else the browser language (see I18N.md)
initDataLang();   // names and descriptions of the data tables follow the language (before initLang so the first paint is already translated)
await I18N.initLang({ profile: profile.settings.lang });
profile.settings.lang = I18N.getLangPref();
const hadSave = loaded.hadSave;
// the page itself follows the language: tab title, search description and the canvas label for screen readers
function applyPageText() {
  try {
    document.title = t('page.title', 'Drop the Bass');
    canvas.setAttribute('aria-label', t('page.canvas_label', 'Drop the Bass game canvas'));
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', t('page.description', 'Turret defense with RoxorLoops and Jasmin. Merge your gear into speaker turrets, remix, loot and keep the music live.'));
    const a = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (a) a.setAttribute('content', t('page.title', 'Drop the Bass'));
  } catch (e) { /* never block the boot */ }
}
applyPageText();
let saveT = 0, saveFailT = 0;
// the last moment the player was active before this session started (Welcome back compares it with the clock)
const awayFrom = Math.max(+profile.lastSeen || 0, +profile.lastActive || 0);
// validate-then-commit (meta.commitSave): a profile that does not survive serialise + parse back never overwrites the last good save
function writeSave(opts) {
  let r;
  if (app.screen !== 'boot') app.profile.lastActive = Date.now();
  try { r = M.commitSave(localStorage, app.profile, opts && opts.force ? opts : undefined); } catch (e) { r = { ok: false, reason: 'storage' }; }
  if (!r.ok && r.reason !== 'storage' && r.reason !== 'verify') {
    try { M.repairProfile(app.profile, Date.now()); r = M.commitSave(localStorage, app.profile, opts && opts.force ? opts : undefined); } catch (e) { /* give up below */ }
  }
  if (!r.ok && Date.now() - saveFailT > 60000) { saveFailT = Date.now(); try { toast(t('toast.save_failed', 'Could not save your game. Is the browser storage full?'), 4200); } catch (e) { /* no ui yet */ } }
  return !!r.ok;
}

let rngCounter = 1;
const app = {
  profile, audio: AudioFx, ui, view: { cw: 540, ch: 960, dpr: 1, s: 1, ox: 0, oy: 0 },
  screen: 'boot', battle: null, practice: null, cut: null, hub: null, hubTab: 'tour', hadSave,
  now: () => Date.now(), awayFrom,
  rng: () => makeRng((Date.now() ^ Math.imul(rngCounter++, 2654435761)) >>> 0),
  save() { clearTimeout(saveT); saveT = setTimeout(writeSave, 150); },
  saveNow: writeSave,
  spendDiamonds(n) { app.profile.diamonds = Math.max(0, app.profile.diamonds - n); app.save(); },
  replaceProfile(np) {
    try { localStorage.setItem(M.SAVE_PREV_KEY, M.serialize(Object.assign({}, app.profile, { resume: null }))); } catch (e) { /* keep going */ }
    app.profile = np; profile = np; writeSave({ force: true }); app.applySettings(); app.openHub('tour');
  },
  freshProfile: () => freshDefaults(M.newProfile(Date.now())),
  langNow: () => I18N.getLang(),
  setLangPref(pref) { app.profile.settings.lang = pref; app.save(); return I18N.setLangPref(pref); },
  applySettings() {
    const s = app.profile.settings;
    if (s.lang !== I18N.getLangPref()) I18N.setLangPref(s.lang);
    AudioFx.setVolume({ music: s.music, sfx: s.sfx });
    AudioFx.mute(!!s.muted);
    document.body.classList.toggle('reduce', !!s.reduce);
    applyA11y(s);
    setStyle(); document.body.classList.add('doodle'); document.body.classList.remove('classic');
    if (app.battle) { app.battle.fx.noShake = !s.shake || !!s.reduce; if (s.lowfx) app.battle.fx.bloomOn = false; }
    if (app.view && app.view.lowfx !== !!s.lowfx) { app.view.lowfx = !!s.lowfx; resize(); }
  },
  showHowTo() { showHowTo(app); },
  playCutscene(id, done) {
    ui.replaceChildren();
    app.screen = 'cut';
    app.cut = new Cutscene(app, id, () => { app.cut = null; if (done) done(); });
  },
  showTitle, openHub, startRun, requestRun, quitRun, afterResults, resumeRun, submitBoard, endPractice,
  hooks: {
    toast: (m) => toast(m),
    spendDiamonds: (n) => app.spendDiamonds(n),
    onPause: (b) => { saveResume(); showPause(app, b); },
    onWaveClear: () => saveResume(),
    onChoice: (run, b) => showChoice(app, run, b),
    onHint: (id, done) => showHint(app, id, done),
    onEnd: (run, b) => onRunEnd(run, b),
    bossIntro: (type, b) => {
      const p = app.profile;
      if (p.story.worlds['boss_' + type] || (b.run && b.run.practice)) return;
      p.story.worlds['boss_' + type] = true; app.save();
      b.hold = true;
      const keep = ui.innerHTML;
      app.playCutscene('boss_' + type, () => { b.hold = false; app.screen = 'battle'; app.audio.musicStart('boss'); });
    },
  },
};
window.__dtb = { app, M, Run, AE, AW };

// ------------------------------------------------------------------------------------------------ view
function resize() {
  const cw = window.innerWidth, ch = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = Math.min(cw / W, ch / H);
  const v = app.view;
  v.cw = cw; v.ch = ch; v.dpr = dpr; v.s = s; v.ox = (cw - W * s) / 2; v.oy = (ch - H * s) / 2;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ui.style.setProperty('--ox', v.ox / s + 'px');   // the blank space beside the 540 wide UI column, in UI px (screen corner widgets hang into it)
  ui.style.setProperty('--s', String(s));   // css px per ui px: menu tap targets are sized with it so they stay at least 44 css px
  ui.style.left = v.ox + 'px'; ui.style.height = ch / s + 'px'; ui.style.transform = 'scale(' + s + ')';
  const as = app.profile.settings.lowfx ? 1.25 : Math.max(1.5, Math.min(3, dpr * s));
  AE.setArtScale(as); AW.setArtScale(as);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ------------------------------------------------------------------------------------------------ screens
function showTitle() {
  app.screen = 'title';
  app.battle = null; app.cut = null;
  ui.replaceChildren();
  const p = app.profile;
  const wrap = h('div', { class: 'title-wrap' });
  const menu = h('div', { class: 'menu' });
  const started = p.tutorial.done || p.story.intro;
  // a saved run that cannot be played is dropped here, with a clear message, instead of failing later in the battle
  let resume = null;
  if (p.resume) {
    const chk = M.checkResume(p.resume);
    if (chk.ok) resume = M.resumeSummary(p.resume);
    else { p.resume = null; app.save(); setTimeout(() => toast(t('toast.run_damaged', 'Your unfinished run was damaged, so it was dropped. Your progress is safe.'), 5000), 400); }
  }
  const tap = h('div', { class: 'tap' }, t('title.tap', 'TAP TO START'));
  wrap.append(tap);
  ui.append(wrap);
  // first title screen: a small text row to pick the language (stays visible under the menu)
  // It sits in the clear band between the logo (ends near y 370) and the heroes' hair (starts near y 470) of the 540x960 title art, which is centred on the screen: 50% of the UI height is art y 480, so the band starts 100 px above it (art y 380). The title
  // art and this DOM share one scale and centre, so the band is the same on every screen shape (tests/drop_the_bass_r5_browser.test.mjs checks it).
  const langRow = h('div', { class: 'lang-row', style: 'position:absolute;left:0;right:0;top:calc(50% - 100px);display:flex;justify-content:center;z-index:5;transform:scale(.8);transform-origin:top center' }, langPicker(app, false));
  langRow.addEventListener('pointerdown', (e) => e.stopPropagation());
  wrap.append(langRow);
  // quick mute in the top right corner (44 px tap target, state in profile.settings.muted)
  const mute = muteButton(app);
  mute.style.cssText = 'position:absolute;right:calc(10px - var(--ox,0px) + env(safe-area-inset-right,0px));top:calc(10px + env(safe-area-inset-top,0px));z-index:6';
  wrap.append(mute);
  const showMenu = () => {
    app.audio.init(); app.audio.resume(); app.applySettings(); app.audio.musicStart('title');
    tap.remove(); wrap.removeEventListener('pointerdown', showMenu);
    menu.replaceChildren(...[
      resume ? btn([h('span', { class: 'cr-t' }, t('title.continue_run', 'CONTINUE RUN')), h('span', { class: 'cr-s' }, resume.mode === 'endless' ? tn('tour.resume_info_endless', resume.turrets, '{stage}, wave {wave}, {n} turret (Endless)', '{stage}, wave {wave}, {n} turrets (Endless)', { stage: resume.stage, wave: resume.wave }) : tn('tour.resume_info', resume.turrets, '{stage}, wave {wave}, {n} turret', '{stage}, wave {wave}, {n} turrets', { stage: resume.stage, wave: resume.wave }))], () => resumeRun(), 'gold big cont-run') : null,
      started ? btn(resume ? t('title.to_hub', 'TO THE HUB') : t('title.continue', 'CONTINUE'), () => openHub(app.hubTab), resume ? 'green' : 'green big') : btn(t('title.play', 'PLAY'), () => newGame(), 'green big'),
      started ? btn(t('title.new_game', 'New game'), () => { const m = modal(h('div', null, h('h2', null, t('title.start_over', 'Start over?')), h('div', { class: 'sub', style: 'text-align:center' }, t('title.start_over_hint', 'This deletes your current progress.')), h('div', { class: 'btnrow' }, btn(t('title.delete_start', 'Delete and start'), () => { m.close(); app.replaceProfile(app.freshProfile()); showTitle(); newGame(); }, 'red'), btn(t('common.cancel', 'Cancel'), () => m.close(), 'green')))); }, 'dark small') : null,
      h('div', { class: 'btnrow', style: 'margin:0' }, btn(t('hub.settings', 'Settings'), () => settingsModal(app), 'dark small'), btn(t('settings.how_to', 'How to play'), () => showHowTo(app), 'dark small')),
      // a returning player on a new device: only while this profile has never finished a run
      !(p.stats && p.stats.runs > 0) ? h('button', { class: 'link-btn', type: 'button', 'data-title-import': '', onclick: () => importModal(app) }, t('title.import_save', 'Already played? Import your save')) : null,
    ].filter(Boolean));
    wrap.append(menu, h('div', { class: 'credit' }, t('title.credit', 'RoxorLoops & Jasmin  |  Keep the music live')));
    app.audio.play('ui_open');
  };
  wrap.addEventListener('pointerdown', showMenu);
}
function newGame() {
  app.profile.story.intro = true; app.save();
  app.playCutscene('intro', () => startTutorial());
}
function openHub(tab) {
  app.screen = 'hub'; app.battle = null; app.cut = null;
  if (tab) app.hubTab = tab;
  const p = app.profile;
  M.ensureDaily(p, app.now());
  app.hub = buildHub(app, app.hubTab);
  ui.replaceChildren(app.hub.el);
  app.audio.musicStart('hub');
  app.save();
  // Everything below that wants a blocking modal goes through the modal queue (ui_core.js): one at a time, in priority order, never during a
  // battle or cutscene. Friend invite and Welcome back first, then the Daily Gig, What's new, the language offer and first-time hints.
  // one-time offer to switch to the device language (a Dansk, Nederlands or Deutsch device that is showing English)
  const offer = langOffer(p, typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : navigator.language) : 'en', I18N.getLang());
  if (offer) {
    p.tutorial.hints.lang_offer = true; app.save();
    queueModal('lang_offer', MODAL_PRIO.lang, (done) => {
      const el = actionToast(t('toast.lang_offer', 'Switch to {lang}?', { lang: I18N.langName(offer) }), t('toast.lang_switch', 'Switch'), () => app.setLangPref(offer), 9000);
      const poll = () => { if (el.isConnected && app.screen === 'hub') setTimeout(poll, 500); else done(); };
      setTimeout(poll, 500);
    }, { modal: false, delay: 1400 });
  }
  // welcome-back bits: after 12 hours away the summary sheet, else the Daily Gig or the royalties sheet. What's new follows once per game version.
  const now = app.now();
  if (!app.sessionGreeted && p.tutorial.done) {
    app.sessionGreeted = true;
    const sum = M.welcomeSummary(p, now, app.awayFrom);
    app.awayFrom = null;
    const off = M.offlineRecords(p, now);
    const ls = M.loginStatus(p, now);
    if (sum) queueModal('welcome', MODAL_PRIO.welcome, (done) => welcomeSheet(app, sum, done));
    else if (off >= 30 && !ls.claimable) queueModal('royalties', MODAL_PRIO.royalties, (done) => royaltiesModal(app, off, done));
    if (ls.claimable) queueModal('daily', MODAL_PRIO.daily, (done) => { const l2 = M.loginStatus(p, app.now()); if (l2.claimable) dailyGigModal(app, l2, done); else done(); });
    if (M.whatsNewDue(p)) queueModal('whatsnew', MODAL_PRIO.whatsnew, (done) => { if (M.whatsNewDue(p)) whatsNewModal(app, done); else done(); });
  }
}

// ------------------------------------------------------------------------------------------------ runs
function startTutorial() {
  const run = new Run({
    world: 'garage', mode: 'tutorial', seed: 7, wavesTotal: 3, hypeNeed: 14, firstPrep: 999,
    baseFx: [['startCoins', 'add', 110]], forceDrops: ['kick', 'kick', 'snare', 'kick', 'snare', 'hat', 'kick', 'snare', 'sub', 'kick', 'snare', 'hat'],
    loadout: ['kick', 'snare', 'hat', 'sub'],
  });
  run.heroCd = { roxor: 99, jasmin: 99 };
  run.cfg = { mode: 'tutorial' };
  beginBattle(run, true);
}
// every Play button comes here: the Setlist sheet (hero moves, modifiers, difficulty, Start) unless the player turned it off or this is the tutorial
function requestRun(cfg) {
  const p = app.profile;
  if (!p.tutorial.done) { startTutorial(); return; }
  if (p.settings.skipSetlist) { startRun(cfg); return; }
  setlistSheet(app, cfg);
}
function startRun(cfg) {
  const p = app.profile;
  if (!p.tutorial.done) { startTutorial(); return; }
  if (cfg.mode === 'practice') { startPractice(cfg); return; }
  if (p.resume && !cfg.confirmed) {
    const m = modal(h('div', null, h('h2', null, t('newrun.title', 'Start a new run?')), h('div', { class: 'sub', style: 'text-align:center' }, t('newrun.hint', 'You have a run in progress. Starting a new one drops it.')),
      h('div', { class: 'btnrow' }, btn(t('newrun.start', 'Start new'), () => { m.close(); p.resume = null; startRun(Object.assign({}, cfg, { confirmed: true })); }, 'red'), btn(t('common.back', 'Back'), () => m.close(), 'green'))));
    return;
  }
  const b = M.useBoosters(p);
  if (!b.ok) { toast(t('toast.boosters_short', 'Not enough diamonds for your boosters ({n}).', { n: b.total })); return; }
  const setup = M.computeRunSetup(p);
  // Setlist picks: modifiers apply to Story, Endless and Rush only (never Daily or the Weekly Gig); a retry keeps the modifiers of the run it repeats
  const modifiers = cfg.mode === 'daily' ? [] : (Array.isArray(cfg.modifiers) ? M.cleanModifiers(cfg.modifiers) : M.consumeModifiers(p));
  const heroAbility = Object.assign(M.heroAbilitySetup(p), cfg.heroAbility || {});
  const difficulty = cfg.mode === 'daily' ? 'normal' : setup.difficulty;
  const run = new Run({
    world: cfg.world, mode: cfg.mode, encore: cfg.encore || 0, seed: cfg.seed != null ? cfg.seed : (Date.now() & 0x7fffffff),
    loadout: setup.loadout, baseFx: setup.baseFx.concat(b.fx, cfg.extraFx || []), heroLv: setup.heroLv, autoMerge: setup.autoMerge, autoMergeOn: setup.autoMergeOn,
    daily: cfg.daily, wavesTotal: cfg.wavesTotal, heroAbility, modifiers,
    difficulty,   // 'easy'|'normal'|'hard' (the sim ignores it until Run supports opts.difficulty). Daily and the Weekly Gig are always 'normal': same run for everyone.
  });
  run.cfg = { mode: cfg.mode, world: cfg.world, encore: cfg.encore || 0, seed: run.seed, daily: cfg.daily, wavesTotal: cfg.wavesTotal, difficulty, heroAbility, modifiers, weekly: !!cfg.weekly, weekId: cfg.weekId, extraFx: cfg.extraFx };
  if (b.hype) { run.hype = run.hypeNeed; run.checkHype(); }
  if (run.modifiers.length && M.markStep(p, 'modifier')) app.save();
  app.save();
  const go = () => beginBattle(run, false);
  if (cfg.mode === 'story' && !p.story.worlds[cfg.world]) { p.story.worlds[cfg.world] = true; app.save(); app.playCutscene('world_' + cfg.world, go); }
  else go();
}
function saveResume() {
  const b = app.battle;
  if (app.screen !== 'battle' || !b || b.ended || b.tut || !b.run.cfg) return;
  const run = b.run;
  if (run.phase === 'won' || run.phase === 'lost') return;
  try {
    const resume = { cfg: run.cfg, snap: run.snapshot(), world: run.world.id, wave: run.wave, mode: run.mode, t: Date.now() };
    // never overwrite a good resume with a snapshot that could not be played (NaN, bad turret times...)
    if (!M.checkResume(resume).ok) return;
    app.profile.resume = resume; writeSave();
  } catch (e) { /* too big or blocked: skip */ }
}
function resumeRun() {
  const r = app.profile.resume;
  if (!r) return;
  let run = null, why = M.checkResume(r).reason || '';
  if (!why) {
    try { run = Run.restore(r.snap); Run.restore(r.snap).advance(0.1); } catch (e) { run = null; why = 'restore failed'; }
  }
  if (!run) {
    // fall back to the hub with a clear message instead of a broken battle
    console.warn('resume rejected:', why);
    app.profile.resume = null; app.saveNow(); openHub('tour');
    toast(t('toast.resume_damaged', 'That saved run was damaged, so it could not be continued. Your progress and rewards are safe.'), 5200);
    return;
  }
  run.cfg = r.cfg;
  beginBattle(run, false);
}
async function submitBoard(run) {
  const p = app.profile, r = run.result;
  if (!r || !p.name) return 0;
  const id = r.mode === 'endless' ? 'endless:' + r.world : r.mode === 'daily' ? (r.weekly ? 'weekly' : 'daily') : null;
  if (!id || r.cleared < 1) return 0;
  const top = await submitScore(id, p.name, r.cleared);
  return rankOf(top, p.name);
}
// ------------------------------------------------------------------------------------------------ practice a boss (codex)
// A normal Run on the stage that features the boss, cut down to ONE wave: the boss at full strength with a few escorts, a long first prep and
// a coin head start so the board can be built. Built on the public Run options only (sim.js is untouched): the subclass swaps the wave list.
// No rewards, no Stats, no applyRunResult; the whole profile is restored when practice ends, whatever the battle touched (hints, gem re-rolls).
class PracticeRun extends Run {
  constructor(opts) {
    super(opts);
    this.practice = opts.practiceBoss; this.practiceWave = opts.practiceWave; this.practiceStart = null; this.practiceDefeat = null;
  }
  baseUpcoming() { const s = genWave(this.world, this.practiceWave, this.seed, { wavesTotal: this.world.wavesTotal }); s.w = this.wave + 1; return s; }
  baseHp() { return super.baseHp(this.practiceWave); }
  startWave(early) { const ok = super.startWave(early); if (ok && this.practiceStart == null) this.practiceStart = this.t + 1.2; return ok; }   // the boss walks in 1.2 s after the wave starts
  queueChoice(kind, ...rest) { if (kind === 'boss' || kind === 'remix_rare' || kind === 'chest') return undefined; return super.queueChoice(kind, ...rest); }   // no loot to pick in practice
  emit(e) { if (e && e.k === 'bossdie' && this.practiceDefeat == null) this.practiceDefeat = this.t; super.emit(e); }
  finish(won) {
    super.finish(won);
    if (this.result) {
      const t1 = this.practiceDefeat != null ? this.practiceDefeat : (won ? this.t : null);
      this.result.practice = { boss: this.practice, won, time: t1 != null && this.practiceStart != null ? Math.max(0, Math.round((t1 - this.practiceStart) * 10) / 10) : null };
    }
  }
}
export const practiceWorld = (boss) => WORLDS.find((w) => w.boss === boss) || WORLDS.find((w) => w.boss10 === boss) || null;
function startPractice(cfg) {
  const p = app.profile, def = BOSSES[cfg.boss], world = practiceWorld(cfg.boss);
  if (!def || !world) { toast(t('practice.unknown', 'That boss cannot be practised yet.')); return; }
  if (app.practice) restorePractice();
  const setup = M.computeRunSetup(p);
  const run = new PracticeRun({
    world: world.id, mode: 'story', encore: 0, seed: cfg.seed != null ? cfg.seed : (Date.now() & 0x7fffffff), wavesTotal: 1,
    loadout: setup.loadout, baseFx: setup.baseFx.concat([['startCoins', 'add', 1100]]), heroLv: setup.heroLv, autoMerge: setup.autoMerge, autoMergeOn: setup.autoMergeOn,
    heroAbility: M.heroAbilitySetup(p), modifiers: [], difficulty: setup.difficulty, firstPrep: 45, extraRerolls: 3,
    practiceBoss: cfg.boss, practiceWave: world.boss === cfg.boss ? world.wavesTotal : 10,
  });
  app.practice = { snap: JSON.stringify(p), boss: cfg.boss };
  beginBattle(run, false);
}
function restorePractice() {
  const pr = app.practice;
  if (!pr) return;
  app.practice = null;
  try {
    const old = JSON.parse(pr.snap), p = app.profile;
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, old);
  } catch (e) { /* the snapshot came from this profile, so this cannot fail */ }
  app.save();
}
function endPractice(o) {
  const boss = app.practice && app.practice.boss;
  restorePractice();
  app.battle = null;
  if (o && o.retry && boss) startRun({ mode: 'practice', boss });
  else openHub(app.hubTab);
}
// the next-steps card ticks from the events the battle already emits (a re-roll, a synergy, an upgrade path, a hero move)
function watchRun(run) {
  if (run.practice || run.mode === 'tutorial') return;
  const orig = run.emit;
  run.emit = function (e) {
    const id = e && (e.k === 'reroll' && !this.choice ? 'reroll' : e.k === 'synergy' ? 'synergy' : e.k === 'branch' ? 'branch' : e.k === 'hero' ? 'hero' : null);
    if (id && M.markStep(app.profile, id)) app.save();
    return orig.call(this, e);
  };
}

function beginBattle(run, tutorial) {
  ui.replaceChildren();
  app.screen = 'battle';
  watchRun(run);
  app.battle = new Battle(app, { run, tutorial });
  if (run.practice) ui.append(h('div', { class: 'practice-badge', 'data-practice-badge': '' }, t('practice.badge', 'PRACTICE')));
  app.applySettings();
}
function onRunEnd(run, battle) {
  if (run.practice) { if (!run.result) run.finish(false); app.screen = 'battle'; showPracticeResults(app, run); return; }
  if (run.phase === 'lost' && run.mode !== 'tutorial') showDefeat(app, run, battle, () => finalize(run, battle));
  else if (run.phase === 'lost' && run.mode === 'tutorial') { toast(t('toast.practice_again', 'Let us try that practice again.')); startTutorial(); }
  else finalize(run, battle);
}
function finalize(run, battle) {
  const p = app.profile;
  if (!run.result) run.finish(false);
  if (run.cfg && run.cfg.weekly) { run.result.weekly = true; run.result.weekId = run.cfg.weekId || M.isoWeek(app.now()).id; }
  if (run.cfg && run.cfg.difficulty) run.result.difficulty = run.cfg.difficulty;
  const out = M.applyRunResult(p, run.result, app.rng(), app.now());
  // epilogue (and the credits after the Moon) on the first clear of a world, once per profile. Tutorial and daily never.
  out.epilogues = run.mode === 'story' && run.result.won ? M.takeEpilogues(p, run.world.id, out.firstClear, run.mode) : [];
  Stats.trackRunEnd(run, run.result);
  p.resume = null;
  if (run.mode === 'tutorial') {
    p.tutorial.done = true; p.records += 150; p.diamonds += 20; p.pendingCrates = (p.pendingCrates || []).concat(['garage']);
    out.records += 150; out.diamonds += 20; app.sessionGreeted = true;
  }
  app.saveNow();
  const show = () => { app.screen = 'battle'; showResults(app, run, out); };
  const playNext = (i) => {
    if (i >= out.epilogues.length) { show(); return; }
    app.playCutscene(out.epilogues[i], () => playNext(i + 1));
  };
  playNext(0);
}
function quitRun(battle) {
  const run = battle.run;
  if (!run.result) run.finish(false);
  battle.ended = true;
  if (run.practice) { showPracticeResults(app, run); return; }
  finalize(run, battle);
}
function afterResults(run, out, opt) {
  const p = app.profile;
  app.battle = null;
  const done = () => {
    if (opt.next) requestRun({ mode: 'story', world: opt.next, encore: 0 });
    else if (opt.retry) startRun(Object.assign({}, run.cfg, { modifiers: (run.cfg && run.cfg.modifiers) || [] }));
    else openHub(run.mode === 'tutorial' ? 'shop' : 'tour');
  };
  if (run.result && run.result.won && run.mode === 'story' && run.world.id === 'arena' && !p.story.ending) {
    p.story.ending = true; app.save();
    app.playCutscene('ending', () => openHub('tour'));
    return;
  }
  done();
}

// ------------------------------------------------------------------------------------------------ input
function toLogical(e) { const v = app.view; return [(e.clientX - v.ox) / v.s, (e.clientY - v.oy) / v.s]; }
const uiBusy = () => !!ui.querySelector('.modal-bg') || app.screen !== 'battle' || !app.battle;
canvas.addEventListener('pointerdown', (e) => {
  AudioFx.init(); AudioFx.resume();
  if (app.screen === 'cut') return;
  if (uiBusy()) return;
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  const [x, y] = toLogical(e); app.battle.pointerDown(x, y);
});
canvas.addEventListener('pointermove', (e) => { if (uiBusy()) return; const [x, y] = toLogical(e); app.battle.pointerMove(x, y); });
canvas.addEventListener('pointerup', (e) => { if (!app.battle) return; const [x, y] = toLogical(e); app.battle.pointerUp(x, y); });
canvas.addEventListener('pointercancel', () => { if (app.battle) app.battle.drag = null; });
window.addEventListener('keydown', (e) => {
  AudioFx.init(); AudioFx.resume();
  if (app.screen === 'cut' && app.cut && (e.key === ' ' || e.key === 'Enter')) { app.cut.advance(); e.preventDefault(); return; }
  if (uiBusy()) { if (e.key === 'Escape' && app.battle && app.battle.paused) { const b = ui.querySelector('.modal-bg'); } return; }
  if (e.key === ' ') e.preventDefault();
  app.battle.key(e.key);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveResume(); writeSave(); if (app.screen === 'battle' && app.battle && !app.battle.paused && !app.battle.ended && !app.battle.run.choice) showPause(app, app.battle); }
});
window.addEventListener('pagehide', () => { saveResume(); writeSave(); });

// ------------------------------------------------------------------------------------------------ loop
let last = performance.now(), T = 0;
function frame(now) {
  const rawMs = now - last;
  const dt = Math.min(0.05, rawMs / 1000); last = now; T += dt;
  const v = app.view;
  try {
    if (!(app.screen === 'battle' && app.battle)) battleIdle(AudioFx);
    if (app.cut && app.screen === 'cut') { app.cut.update(dt); app.cut.draw(ctx, v); }
    else if (app.screen === 'battle' && app.battle) { if (app.battle.pv && app.battle.pv.open && !app.battle.tut && !app.battle.run.practice && M.markStep(app.profile, 'preview')) app.save(); app.battle.update(dt); app.battle.draw(ctx, v); }
    else if (app.screen === 'title') {
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      const bi = AudioFx.beatInfo && AudioFx.beatInfo();
      AW.drawTitle(ctx, v.cw, v.ch, T, { beat: bi ? Math.pow(1 - bi.phase, 3) : 0, outfit: app.profile.outfits.worn.roxor });
      ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
      AW.drawLogo(ctx, W / 2, 190, 480, T);
    } else if (app.screen === 'hub') {
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      AW.drawBackdrop(ctx, 'hub', v.cw, v.ch, T, { beat: 0 });
    }
    tickLive(T);
  } catch (err) {
    if (!frame.errShown) { frame.errShown = true; console.error(err); window.__dtbError = String(err && err.stack || err); }
  }
  requestAnimationFrame(frame);
}

// the language changed: redraw the current screen (battle canvas text reads t() every frame, so it follows by itself)
function rerender() {
  if (app.screen === 'hub' && app.hub && app.hub.render) app.hub.render();
  else if (app.screen === 'title') {
    const menuShown = !!ui.querySelector('.menu button');
    showTitle();
    if (menuShown) { const w = ui.querySelector('.title-wrap'); if (w) w.dispatchEvent(new Event('pointerdown')); }
  }
}
app.rerender = rerender;
setModalEnv({ screen: () => app.screen });
I18N.onLang(() => { applyPageText(); app.rerender(); });

// ------------------------------------------------------------------------------------------------ friend invite (?friend=Name)
// Opening a friend link asks once. Nothing is added without a tap, and the parameter leaves the address bar as soon as the question is shown.
function checkFriendInvite() {
  let name = '';
  try { name = friendFromSearch(location.search); } catch (e) { return; }
  if (!/[?&]friend=/.test(location.search || '')) return;
  try { history.replaceState(history.state, '', withoutFriendParam(location.pathname, location.search, location.hash)); } catch (e) { /* the address stays, the question is still asked once */ }
  if (name) queueModal('friend_invite', MODAL_PRIO.invite, (done) => friendInviteModal(app, name, done), { screens: ['title', 'hub'], delay: 500 });
}

// ------------------------------------------------------------------------------------------------ boot
resize();
app.applySettings();
showTitle();
if (loaded.recovered) { writeSave(); setTimeout(() => toast(t('toast.save_recovered', 'Recovered your last save'), 4200), 300); }
else if (loaded.corrupt) setTimeout(() => toast(t('toast.save_corrupt', 'Your save could not be read, so you are starting fresh. The damaged copy is kept.'), 5200), 300);
document.getElementById('boot').remove();
window.__dtbReady = true;
Stats.init(() => app.profile.settings);
initPwa({ onOfflineReady: () => {
  const hints = app.profile.tutorial && app.profile.tutorial.hints;
  if (!hints || hints.offline_ready) return;
  hints.offline_ready = true; app.save();
  toast(t('pwa.offline_ready', 'Ready to play offline'), 3600);
} });
checkFriendInvite();
requestAnimationFrame(frame);
// autosave the run every few seconds so a reload, a discarded tab or a crash never loses turrets placed since the last wave
setInterval(() => { try { saveResume(); } catch (e) { /* ignore */ } }, 4000);
