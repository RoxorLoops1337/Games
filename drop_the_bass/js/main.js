// main.js: the app shell. Loads the save, owns the canvas and the DOM root, runs the loop, routes between title, hub, cutscenes and battle.
import { GAME, W, H, WORLD_BY_ID, ECON } from './data_core.js';
import { Run } from './sim.js';
import { AudioFx } from './audio.js';
import * as M from './meta.js';
import { makeRng } from './rng.js';
import { Battle } from './battle.js';
import { Cutscene } from './cutscene.js';
import { buildHub, settingsModal, codexModal } from './ui_hub.js';
import { showChoice, showPause, showHint, showDefeat, showResults, showHowTo } from './ui_run.js';
import { setRoot, h, btn, modal, toast, tickLive, AE, AW } from './ui_core.js';
import { submitScore, rankOf } from './lb.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const ctx = canvas.getContext('2d');
setRoot(ui);

// ------------------------------------------------------------------------------------------------ profile
let profile;
try { profile = M.parseSave(localStorage.getItem(GAME.saveKey) || '', Date.now()); } catch (e) { profile = null; }
const hadSave = !!profile;
if (!profile) profile = M.newProfile(Date.now());
let saveT = 0;
function writeSave() { try { localStorage.setItem(GAME.saveKey, M.serialize(app.profile)); } catch (e) { /* storage blocked */ } }

let rngCounter = 1;
const app = {
  profile, audio: AudioFx, ui, view: { cw: 540, ch: 960, dpr: 1, s: 1, ox: 0, oy: 0 },
  screen: 'boot', battle: null, cut: null, hub: null, hubTab: 'tour', hadSave,
  now: () => Date.now(),
  rng: () => makeRng((Date.now() ^ Math.imul(rngCounter++, 2654435761)) >>> 0),
  save() { clearTimeout(saveT); saveT = setTimeout(writeSave, 150); },
  saveNow: writeSave,
  spendDiamonds(n) { app.profile.diamonds = Math.max(0, app.profile.diamonds - n); app.save(); },
  replaceProfile(np) { app.profile = np; profile = np; writeSave(); app.applySettings(); app.openHub('tour'); },
  applySettings() {
    const s = app.profile.settings;
    AudioFx.setVolume({ music: s.music, sfx: s.sfx });
    document.body.classList.toggle('reduce', !!s.reduce);
    if (app.battle) { app.battle.fx.noShake = !s.shake || !!s.reduce; if (s.lowfx) app.battle.fx.bloomOn = false; }
    if (app.view && app.view.lowfx !== !!s.lowfx) { app.view.lowfx = !!s.lowfx; resize(); }
  },
  showHowTo() { showHowTo(app); },
  playCutscene(id, done) {
    ui.replaceChildren();
    app.screen = 'cut';
    app.cut = new Cutscene(app, id, () => { app.cut = null; if (done) done(); });
  },
  showTitle, openHub, startRun, quitRun, afterResults, resumeRun, submitBoard,
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
      if (p.story.worlds['boss_' + type]) return;
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
  const tap = h('div', { class: 'tap' }, 'TAP TO START');
  wrap.append(tap);
  ui.append(wrap);
  const showMenu = () => {
    app.audio.init(); app.audio.resume(); app.applySettings(); app.audio.musicStart('title');
    tap.remove(); wrap.removeEventListener('pointerdown', showMenu);
    menu.replaceChildren(...[
      started ? btn('CONTINUE', () => openHub(app.hubTab), 'green big') : btn('PLAY', () => newGame(), 'green big'),
      started ? btn('New game', () => { const m = modal(h('div', null, h('h2', null, 'Start over?'), h('div', { class: 'sub', style: 'text-align:center' }, 'This deletes your current progress.'), h('div', { class: 'btnrow' }, btn('Delete and start', () => { m.close(); app.replaceProfile(M.newProfile(Date.now())); showTitle(); newGame(); }, 'red'), btn('Cancel', () => m.close(), 'green')))); }, 'dark small') : null,
      h('div', { class: 'btnrow', style: 'margin:0' }, btn('Settings', () => settingsModal(app), 'dark small'), btn('How to play', () => showHowTo(app), 'dark small')),
    ].filter(Boolean));
    wrap.append(menu, h('div', { class: 'credit' }, 'RoxorLoops & Jasmin  |  Keep the music live'));
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
  // welcome-back bits
  const now = app.now();
  if (!app.sessionGreeted && p.tutorial.done) {
    app.sessionGreeted = true;
    const off = M.offlineRecords(p, now);
    const ls = M.loginStatus(p, now);
    if (ls.claimable) {
      const m = modal(h('div', null, h('h2', null, 'Daily Gig!'), h('div', { class: 'sub', style: 'text-align:center' }, 'Day ' + ls.reward.day + ' of your tour. Streak: ' + ls.streak),
        h('div', { class: 'btnrow' }, btn('Claim reward', () => { const r = M.claimLogin(p, now, app.rng()); m.close(); app.audio.play('chest'); toast('Claimed!'); app.hub.render(); }, 'gold'))));
    } else if (off >= 30) {
      const m = modal(h('div', null, h('h2', null, 'Welcome back!'), h('div', { class: 'sub', style: 'text-align:center' }, 'Your songs kept streaming while you were away: ' + off + ' Records.'),
        h('div', { class: 'btnrow' }, btn('Collect', () => { M.claimOffline(p, now); m.close(); app.audio.play('record'); app.hub.render(); }, 'green'))));
    }
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
function startRun(cfg) {
  const p = app.profile;
  if (!p.tutorial.done) { startTutorial(); return; }
  if (p.resume && !cfg.confirmed) {
    const m = modal(h('div', null, h('h2', null, 'Start a new run?'), h('div', { class: 'sub', style: 'text-align:center' }, 'You have a run in progress. Starting a new one drops it.'),
      h('div', { class: 'btnrow' }, btn('Start new', () => { m.close(); p.resume = null; startRun(Object.assign({}, cfg, { confirmed: true })); }, 'red'), btn('Back', () => m.close(), 'green'))));
    return;
  }
  const b = M.useBoosters(p);
  if (!b.ok) { toast('Not enough diamonds for your boosters (' + b.total + ').'); return; }
  const setup = M.computeRunSetup(p);
  const run = new Run({
    world: cfg.world, mode: cfg.mode, encore: cfg.encore || 0, seed: cfg.seed != null ? cfg.seed : (Date.now() & 0x7fffffff),
    loadout: setup.loadout, baseFx: setup.baseFx.concat(b.fx), heroLv: setup.heroLv, autoMerge: setup.autoMerge, autoMergeOn: setup.autoMergeOn,
    daily: cfg.daily, wavesTotal: cfg.wavesTotal,
  });
  run.cfg = { mode: cfg.mode, world: cfg.world, encore: cfg.encore || 0, seed: run.seed, daily: cfg.daily, wavesTotal: cfg.wavesTotal };
  if (b.hype) { run.hype = run.hypeNeed; run.checkHype(); }
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
  try { app.profile.resume = { cfg: run.cfg, snap: run.snapshot(), world: run.world.id, wave: run.wave, mode: run.mode, t: Date.now() }; writeSave(); } catch (e) { /* too big or blocked: skip */ }
}
function resumeRun() {
  const r = app.profile.resume;
  if (!r) return;
  let run;
  try { run = Run.restore(r.snap); } catch (e) { app.profile.resume = null; toast('That run could not be restored.'); app.save(); return; }
  run.cfg = r.cfg;
  beginBattle(run, false);
}
async function submitBoard(run) {
  const p = app.profile, r = run.result;
  if (!r || !p.name) return 0;
  const id = r.mode === 'endless' ? 'endless:' + r.world : r.mode === 'daily' ? 'daily' : null;
  if (!id || r.cleared < 1) return 0;
  const top = await submitScore(id, p.name, r.cleared);
  return rankOf(top, p.name);
}
function beginBattle(run, tutorial) {
  ui.replaceChildren();
  app.screen = 'battle';
  app.battle = new Battle(app, { run, tutorial });
  app.applySettings();
}
function onRunEnd(run, battle) {
  if (run.phase === 'lost' && run.mode !== 'tutorial') showDefeat(app, run, battle, () => finalize(run, battle));
  else if (run.phase === 'lost' && run.mode === 'tutorial') { toast('Let us try that practice again.'); startTutorial(); }
  else finalize(run, battle);
}
function finalize(run, battle) {
  const p = app.profile;
  if (!run.result) run.finish(false);
  const out = M.applyRunResult(p, run.result, app.rng(), app.now());
  p.resume = null;
  if (run.mode === 'tutorial') {
    p.tutorial.done = true; p.records += 150; p.diamonds += 20; p.pendingCrates = (p.pendingCrates || []).concat(['garage']);
    out.records += 150; out.diamonds += 20; app.sessionGreeted = true;
  }
  app.saveNow();
  showResults(app, run, out);
}
function quitRun(battle) {
  const run = battle.run;
  if (!run.result) run.finish(false);
  battle.ended = true;
  finalize(run, battle);
}
function afterResults(run, out, opt) {
  const p = app.profile;
  app.battle = null;
  const done = () => {
    if (opt.next) startRun({ mode: 'story', world: opt.next, encore: 0 });
    else if (opt.retry) startRun(run.cfg);
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
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  const v = app.view;
  try {
    if (app.cut && app.screen === 'cut') { app.cut.update(dt); app.cut.draw(ctx, v); }
    else if (app.screen === 'battle' && app.battle) { app.battle.update(dt); app.battle.draw(ctx, v); }
    else if (app.screen === 'title') {
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      const bi = AudioFx.beatInfo && AudioFx.beatInfo();
      AW.drawTitle(ctx, v.cw, v.ch, T, { beat: bi ? Math.pow(1 - bi.phase, 3) : 0 });
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

// ------------------------------------------------------------------------------------------------ boot
resize();
app.applySettings();
showTitle();
document.getElementById('boot').remove();
window.__dtbReady = true;
requestAnimationFrame(frame);
