// Game controller: owns the save state S, scene switching (hub / fight), HUD, nav, dialogs and the screen registry.
// Screens live in js/screens/<id>.js and export `open(ctx, arg)`; ctx = game.ctx (see bottom of this file).
import * as U from './ui_kit.js';
import { FightView } from './fightview.js';
import { buildFight, fightResult } from './fightsetup.js';
import { createHubStub } from './hubstub.js';
import { advanceWeek } from './flow.js';
import { createPortraitRenderer } from './portrait.js';
import { styleBadge } from './uihelpers.js';
import { createTitle, titleState } from './title.js'; // ONBOARDING
import { createTutorial } from './tutorial.js'; // ONBOARDING
import * as Cer from './ceremonies.js'; // ONBOARDING
import { createPhoto } from './photo.js'; // PHOTO
import * as ET from './envtex.js'; // PERF: texture release / re-warm between scenes

const bm = (k) => { const b = window.__bootT; if (b) b[k] = Math.round(performance.now() - b.t0); };   // boot phase marks (main.js stats().boot)
const D = () => globalThis.LM_D, L = () => globalThis.LM;
const SCREENS = ['building', 'roster', 'profile', 'recruit', 'arena', 'market', 'armory', 'more', 'world', 'infirmary', 'sponsors', 'events']; // WAVE2 infirmary/sponsors/events (screens/*.js)
// 'world' = calendar, rival ludi, barracks, memorial (screens/world.js)
// TUT: every sheet and dialog carries data-tut-sheet=<key> so the tutorial never has to read titles
const TUT_SHEETS = [[/^Roster$/, 'roster'], [/^The Arena$/, 'arena'], [/^(Choose your first fighter|Volunteers)$/, 'recruit'], [/^(Victory|Defeat|Duel won)$/, 'results'], [/^Week \d+ done$/, 'week-done'], [/^More$/, 'more'], [/^The World$/, 'world'], [/^Your Ludus$/, 'building'], [/^Market$/, 'market']];
const tutKey = (title) => { const t = String(title || ''); const r = TUT_SHEETS.find(([re]) => re.test(t)); return r ? r[1] : ''; };

export class Game {
  constructor({ renderer, camera, post, audio, ui, tier, tex }) {
    Object.assign(this, { renderer, camera, post, audio, ui, tier });
    this.tex = tex || {}; this.fightView = null; this.warming = false; this.memLog = { releases: 0, freedMB: 0, warms: 0 }; // PERF: FightView is built lazily, see ensureFightView
    this.S = null; this.busy = false; this.scene = 'none'; this.mods = {}; this.modals = [];
    this.deferMusic();
    this.hud = document.createElement('div'); this.hud.className = 'lx-hud fv-main-hud'; this.hud.style.display = 'none'; this.hud.setAttribute('role', 'region'); this.hud.setAttribute('aria-label', 'Ludus controls'); // QA
    ui.append(this.hud);
    this.ctx = this.makeCtx();
  }

  async init() {
    try { await this.init0(); } catch (e) { this.fatal(e); throw e; } // QA: a failed start shows a way out instead of a frozen "Forging the arena" screen
  }
  async init0() {
    // PERF: the hub (title backdrop) comes first; its procedural textures were baked in a worker / read from IndexedDB while the modules loaded.
    // The FightView (arena, crowd, fx, gore) is built in idle time after the hub is interactive (prewarm) or on the first fight (ensureFightView).
    try { await this.tex.hub; } catch (e) { /* the make* calls bake synchronously on a miss */ }
    bm('texHub');
    try { const mod = await import('./hub.js'); this.hub = mod.createHub({ renderer: this.renderer, camera: this.camera, post: this.post, audio: this.audio, tier: this.tier }); }
    catch (e) { console.warn('hub.js unavailable, using stub', e && e.message); this.hub = createHubStub({ renderer: this.renderer, camera: this.camera, audio: this.audio, tier: this.tier }); }
    bm('hubBuilt'); this.hub.onPick = (sel) => this.onPick(sel);
    this.buildHud(); this.guardErrors();
    this.tutorial = createTutorial(this); // ONBOARDING
    import('./screens/more.js').then((m) => m.applyPrefs && m.applyPrefs(this.ctx)).catch(() => {});
  }

  // ---------------------------------------------------------------- ctx for screens
  makeCtx() {
    const g = this;
    return {
      get S() { return g.S; }, LM: L(), D: D(), U, game: g,
      get audio() { return g.audio; }, get hub() { return g.hub; },
      save: () => g.save(), refresh: () => g.refresh(), toast: (m, o) => { U.toast(m, o); }, ask: (o) => g.ask(o), open: (id, arg) => g.open(id, arg),
      sfx: (n, o) => g.audio.sfx(n, o), gOf: (id) => g.S.glads.find((x) => x.id === id),
      portrait: (gl, size, opts) => g.portraitEl(gl, size, opts),
      closeAll: () => g.closeAll(), sheet: (o) => g.sheet(o), fmt: (n) => Math.round(n).toLocaleString('en-US'),
    };
  }

  /** round framed portrait of a gladiator: the style badge now, swapped for the 3D bust render when its queue turn comes */
  portraitEl(gl, size = 56, opts = {}) {
    const el = styleBadge(gl.style, size);
    try {
      const P = this._portraits || (this._portraits = createPortraitRenderer({ tier: this.tier })), px = size <= 64 ? 128 : 192;
      const cv = P.portrait(gl, Object.assign({ w: px, h: px }, opts));
      const put = () => { cv.style.cssText = 'width:100%;height:100%;display:block;border-radius:50%'; el.textContent = ''; el.style.overflow = 'hidden'; el.append(cv); };
      if (cv.dataset.ready) put(); else cv.addEventListener('portrait', put, { once: true });
    } catch (e) { /* keep the badge */ }
    return el;
  }

  // ---------------------------------------------------------------- title / new game
  async boot() {
    if (!this.hub) await this.init();
    await this.checkSave(); // QA: a damaged save never white-screens the title; the player picks repair, backup or a fresh start // ONBOARDING fix: main.js already ran init(); a second run built a second hub, FightView and HUD
    this.post.setScene(this.hub.scene); this.hub.enter(this.S || titleState()); this.scene = 'title'; // ONBOARDING: save or showcase ludus behind the logo
    // ONBOARDING: cinematic title (js/title.js) replaces the old plain dialog
    this.title = createTitle(this);
    for (;;) {
      const c = await this.title.show({ hasSave: this.hasSave() });
      this.audio.unlock && this.audio.unlock();
      if (c === 'continue' && this.loadSave()) break;
      if (c === 'new') { if (await this.newGameDialog()) break; }
    }
    const lift = await this.title.hide(); // fades to black; hub is swapped in behind it
    this.setScene('hub');
    this.advBtn.style.display = ''; this.refresh();
    lift && lift();
    if (!this.S.glads.length) this.open('recruit', { first: true });
  }

  /** QA: full screen recovery card for a start-up failure. Reload, keep the save safe, or reset it (the damaged copy is stashed, never lost). */
  fatal(e) {
    if (this._fatal) return; console.error('fatal', e);
    const el = this._fatal = document.createElement('div'); el.className = 'lx-perf lx-perf-ctx'; el.setAttribute('role', 'alert');
    const card = document.createElement('div'); card.className = 'lx-perf-card';
    const t = document.createElement('b'); t.textContent = 'The arena could not open';
    const p = document.createElement('p'); p.textContent = 'Something went wrong while starting the game. Your saved ludus has not been touched.';
    const m = document.createElement('p'); m.textContent = String((e && e.message) || e || '').slice(0, 140); m.style.cssText = 'opacity:.7;font-size:12px;overflow-wrap:anywhere';
    const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-perf-btn'; b.textContent = label; b.style.cssText = 'display:block;width:100%'; b.onclick = fn; return b; };
    card.append(t, p, m, mk('Reload the game', () => location.reload()));
    if (L() && L().SAVE_KEY && localStorage.getItem(L().SAVE_KEY)) {
      card.append(mk('Download my save file', () => { try { U.download('ludus_maximus_save.json', localStorage.getItem(L().SAVE_KEY) || ''); } catch (er) { /* blocked */ } }),
        mk('Reset and start over', () => { if (confirm('Set the current save aside and start a new ludus? The old one is kept in this browser as a backup.')) { try { L().stashCorrupt(localStorage.getItem(L().SAVE_KEY)); } catch (er) { /* ignore */ } location.reload(); } }));
    }
    el.append(card); document.body.append(el); const b = document.getElementById('boot'); if (b) b.remove();
    card.querySelector('button').focus();
  }
  /** QA: uncaught errors and rejections after start-up never leave the player guessing: one calm toast a minute, the game keeps running */
  guardErrors() {
    if (this._guard) return; this._guard = true; let last = 0;
    const say = () => { if (Date.now() - last < 60000 || !this.S) return; last = Date.now(); U.toast('Something went wrong in the background. Your ludus is saved. Reload if anything looks stuck.', { kind: 'bad', ms: 6000 }); };
    addEventListener('error', (ev) => { if (ev && ev.message && !/ResizeObserver/.test(ev.message)) say(); });
    addEventListener('unhandledrejection', say);
  }

  /** QA: inspect the stored save before the title. Corrupt -> recovery dialog; newer -> a warning toast after load. */
  async checkSave() {
    const lm = L(); if (!lm.loadEx) return;
    let st = lm.loadEx();
    while (st.status === 'corrupt') {
      const body = document.createElement('div'); body.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif;overflow-wrap:anywhere';
      body.append(Object.assign(document.createElement('p'), { textContent: 'Your saved ludus could not be read. Nothing has been deleted yet.' }), Object.assign(document.createElement('p'), { textContent: st.err || '' }));
      const acts = [{ label: 'Try to repair it', value: 'repair', variant: 'gold', icon: 'check' }];
      if (lm.hasBackup()) acts.push({ label: 'Restore the backup', value: 'backup', variant: 'bronze', icon: 'scroll' });
      acts.push({ label: 'Download the damaged file', value: 'download', variant: 'ghost', icon: 'scroll' }, { label: 'Start fresh', value: 'fresh', variant: 'danger', icon: 'skull', sub: 'The damaged copy is kept aside' });
      const v = await this.ask({ title: 'Save damaged', body, actions: acts, dismiss: null });
      if (v === 'download') { U.download('ludus_maximus_damaged_save.json', st.raw || ''); continue; }
      if (v === 'repair') { const S = lm.salvage(st.raw); if (S) { this.S = S; this.save(); U.toast('Your ludus was repaired. Some recent progress may be missing.', { kind: 'good', ms: 5000 }); st = lm.loadEx(); continue; } U.toast('That save could not be repaired.', { kind: 'bad' }); continue; }
      if (v === 'backup') { const S = lm.loadBackup(); if (S) { lm.stashCorrupt(st.raw); this.S = S; this.save(); U.toast('Backup restored.', { kind: 'good' }); st = lm.loadEx(); continue; } U.toast('No usable backup found.', { kind: 'bad' }); continue; }
      if (v === 'fresh') { if (!lm.stashCorrupt(st.raw)) U.download('ludus_maximus_damaged_save.json', st.raw || ''); st = lm.loadEx(); }
    }
    this._saveStatus = st.status;
    if (st.status === 'newer') U.toast('This save is from a newer version of the game. It may not behave correctly.', { kind: 'info', ms: 6000 });
  }

  async newGameDialog() {
    const d = D(), body = document.createElement('div'); let color = 0, name = 'Ludus Aurelia';
    const inp = document.createElement('input'); inp.value = name; inp.maxLength = 24; inp.setAttribute('aria-label', 'School name');
    inp.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;font:700 16px system-ui,sans-serif;border-radius:8px;border:2px solid #b8803a;background:#fff8e6;color:#2a1a30';
    inp.addEventListener('input', () => { name = inp.value; });
    const sw = document.createElement('div'); sw.style.cssText = 'display:flex;gap:10px;margin:12px 0;flex-wrap:wrap';
    d.COLORS.forEach((c, i) => { const b = document.createElement('button'); b.setAttribute('aria-label', c.n); b.style.cssText = `width:44px;height:44px;border-radius:50%;border:3px solid ${i === 0 ? '#f2c14e' : 'transparent'};background:${c.c};cursor:pointer`; b.onclick = () => { color = i; sw.childNodes.forEach((n, j) => { n.style.borderColor = j === i ? '#f2c14e' : 'transparent'; }); }; sw.append(b); });
    const p = document.createElement('p'); p.textContent = 'Name your school and choose its colors. You start with a kitchen, barracks and training ground, and a purse to recruit your first fighters.'; p.style.cssText = 'font:500 14px/20px system-ui,sans-serif;color:#33243a';
    body.append(p, inp, sw);
    const v = await this.ask({ title: 'Found your ludus', body, actions: [{ label: 'Open the gates', value: 'go', variant: 'gold', icon: 'arena' }], dismiss: null });
    if (v !== 'go') return false; this.newGame({ name: (name || 'Ludus Aurelia').trim() || 'Ludus Aurelia', color }); return true;
  }

  // ---------------------------------------------------------------- state
  save() {
    let ok = true; try { ok = L().save(this.S) !== false; } catch (e) { ok = false; }
    if (!ok && Date.now() - (this._saveWarn || 0) > 60000) { this._saveWarn = Date.now(); U.toast('Could not save: storage is full or blocked. Download your save file in More, Settings.', { kind: 'bad', ms: 7000 }); } // QA
  }
  hasSave() { return !!L().load(); }
  loadSave() { const S = L().load(); if (!S) return false; this.S = S; return true; }
  newGame(o) { this.S = L().newGame(o); this.save(); this.tutorial && this.tutorial.reset(); /* TUT: a new game always gets the tutorial, even over a non-empty save */ }

  // ---------------------------------------------------------------- scenes
  setScene(name) {
    if (this.scene === name) return;
    if (this.scene === 'hub') this.hub.exit && this.hub.exit();
    this.scene = name;
    if (name === 'hub') { this.memSwap('hub'); this.post.setScene(this.hub.scene); this.hub.enter(this.S); this.hud.style.display = 'flex'; this.later(() => { this.audio.music.setMode('ludus', { fade: 1.2 }); this.audio.crowd(0); }); this.refresh(); this.tutorial && this.tutorial.maybeStart(); /* ONBOARDING */ }
    else if (name === 'fight') { const fv = this.ensureFightView(); this.memSwap('fight'); this.post.setScene(fv.scene); this.hud.style.display = 'none'; }
  }

  // ---------------------------------------------------------------- PERF: lazy FightView, idle warm-up, audio deferral, texture memory
  /** audio work (AudioContext graph, 170 ms of IR / noise synthesis) is not needed to show the hub: it runs once the game is interactive (markInteractive) or at once if that already happened */
  later(fn) { if (this.interactive) { this.drainLater(); try { fn(); } catch (e) { console.warn('audio', e && e.message); } } else (this._later || (this._later = [])).push(fn); }
  drainLater() { for (const f of (this._later || []).splice(0)) { try { f(); } catch (e) { console.warn('audio', e && e.message); } } }
  /** the title (title.js) and the hub ask for music while the game boots: those calls are queued and replayed in order once the game is interactive, so the AudioContext graph (about 170 ms) is not built behind the boot overlay */
  deferMusic() {
    const m = this.audio && this.audio.music; if (!m) return;
    for (const k of ['setMode', 'setIntensity']) {
      const f = m[k]; if (typeof f !== 'function') continue;
      m[k] = (...a) => { if (this.interactive) { this.drainLater(); return f.apply(m, a); } (this._later || (this._later = [])).push(() => f.apply(m, a)); return true; };
    }
  }
  /** called by main.js when the boot overlay lifts: flushes deferred audio work in idle time and starts the background FightView build + shader warm-up */
  markInteractive(o = {}) {
    if (this.interactive) return; this.interactive = true;
    const run = () => this.drainLater();
    (typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(f, 300))(run);
    if (o.prewarm !== false) this.prewarm();
  }
  /** the FightView is built on first use; building it must not disturb whatever the composer is currently showing */
  ensureFightView() {
    if (this.fightView) return this.fightView;
    const prev = this.post.composer.passes[0].scene, t0 = performance.now();
    this.fightView = new FightView({ renderer: this.renderer, post: this.post, camera: this.camera, audio: this.audio, host: this.ui, tier: this.tier });
    if (prev) this.post.setScene(prev);
    { const h = this.fightView.hud; if (h && h.parentNode === this.ui && this.hud.nextSibling !== h) this.ui.insertBefore(h, this.hud.nextSibling); }   // same stacking slot as when it was built at boot (right after the hub HUD, under tutorial / title layers)
    if (this._rw) this.fightView.resize(this._rw, this._rh);
    this.fvBuildMs = Math.round(performance.now() - t0);
    try { this.onFightView && this.onFightView(this.fightView); } catch (e) { console.warn('onFightView', e && e.message); }
    return this.fightView;
  }
  /**
   * Build the FightView and compile its shaders while the player looks at the title / hub. `immediate` skips the idle wait (a fight is about to start).
   * Resolves when the arena is ready to fight in. The main loop pauses while `warming` (warm() moves the camera and the composer scene).
   */
  prewarm(o = {}) {
    if (o.immediate) { this._pwNow = true; this._pwWake && this._pwWake(); }
    if (this._pw) return this._pw;
    const pause = (ms) => new Promise((res) => { if (this._pwNow) return res(); const t = setTimeout(res, ms); this._pwWake = () => { clearTimeout(t); res(); }; });
    const idle = () => new Promise((res) => { if (this._pwNow || typeof requestIdleCallback !== 'function') return pause(60).then(res); requestIdleCallback(() => res(), { timeout: 2500 }); });
    return (this._pw = (async () => {
      await pause(o.delay === undefined ? 400 : o.delay); await idle();
      try { await this.tex.arena; } catch (e) { /* sync bake on a miss */ }
      const t0 = performance.now();
      this.ensureFightView(); await idle();
      if (!this.noWarm && this.fightView.warm) {
        const sc = this.post.composer.passes[0].scene; this.warming = true;
        try { await this.fightView.warm(); } catch (e) { console.warn('warm', e && e.message); }
        finally { this.warming = false; this.post.setScene(sc); if (this.scene !== 'fight') { try { this.post.render(0, 0); } catch (e) { /* the loop redraws */ } } }   // put the hub back on the canvas before the next paint
      }
      if (!this.noJit) await this.jitWarm(this._pwNow ? 120 : 200);
      this.warmMs = Math.round(performance.now() - t0); this._pwDone = true;
      this.onWarmed && this.onWarmed();
    })());
  }

  /**
   * JIT warm-up: V8 compiles Animator.update, the pose samplers and the cloth step from what they have run so far. A fight started cold runs them in the interpreter and baseline tiers
   * (every double result boxed: 15 to 30 KB of garbage per frame in the first seconds, measured) until they tier up, and every new rig set can throw optimised code away.
   * So the kept warm rigs (FightView.warm) walk, run, strafe, attack, get hurt and cross-fade for `frames` frames in small time slices before the first fight. Idle time only.
   */
  async jitWarm(frames = 200) {
    const rigs = this.fightView && this.fightView.warmRigs; if (!rigs || !rigs.length) return;
    const t0 = performance.now(); let n = 0; const dt = 1 / 30, atk = ['attack1', 'attack2', 'attack3'];
    while (n < frames) {
      const t1 = performance.now();
      while (n < frames && performance.now() - t1 < 7) {   // 7 ms slices: the page stays responsive
        for (let i = 0; i < rigs.length; i++) {
          const r = rigs[i], A = r.animator, ph = n * 0.12 + i, k = (n + i * 7) % 90;
          A.setMove(k < 20 ? 0 : k < 45 ? 1.4 : 3.4, k > 60 ? 0.5 : 0);
          if (k === 3 || k === 50) { try { A.play(atk[(n + i) % 3]); } catch (e) { /* style without that clip */ } }
          if (k === 30) A.hurt({ x: 0.4, z: 0.9 }, 1);
          if (k === 70) A.setState('taunt', 0.2); else if (k === 85 && A.state !== 'move') A.setState('move', 0.2);
          r.root.rotation.y = Math.sin(ph * 0.3); r.update(dt);
        }
        n++;
      }
      await new Promise((res) => setTimeout(res, 0));
    }
    for (const r of rigs) { const A = r.animator; A.setMove(0, 0); A.action = null; A.add = null; A.add2 = null; A.snapW = 0; A.state = 'move'; A.dead = false; A.hasLast = false; r.root.rotation.y = 0; try { r.update(dt); } catch (e) { /* ignore */ } }
    this.jitMs = Math.round(performance.now() - t0);
  }

  /** low tier / low memory phones: the GPU copies of the OTHER scene's procedural textures are released when the resident total passes the budget, and re-uploaded
   *  (before the first frame, so there is no visible pop) when that scene comes back. The CPU bytes stay, three re-uploads from them. */
  memPressure() {
    const m = navigator.deviceMemory || 0, weak = this.tier === 'low' || (m && m <= 3);   // phones on the low tier, or any device that reports <= 3 GB
    if (!weak) return false;
    const mem = this.renderer.info.memory;   // geometries / textures alive in this context; the procedural ones are counted in MB (they are the ones we can give back)
    return mem.textures >= 24 || ET.residentMB(this.renderer) >= (m && m <= 2 ? 4 : 6);
  }
  memSwap(to) {
    const fv = this.fightView, hub = this.hub; if (!fv || !hub || !hub.scene || this._memOff) return;
    const mine = ET.sceneTextures(to === 'fight' ? fv.scene : hub.scene), other = ET.sceneTextures(to === 'fight' ? hub.scene : fv.scene), r = this.renderer;
    if (this.memPressure()) {
      const drop = new Set([...other].filter((t) => !mine.has(t))), mb = ET.releaseTextures(r, drop);
      if (mb > 0) { this.memLog.releases++; this.memLog.freedMB += mb; }
    }
    const n = ET.warmTextures(r, mine); if (n) this.memLog.warms += n;
  }

  frame(dt, t) {
    if (this.scene === 'hub') this.hub.update(dt, t);
    else if (this.scene === 'title') { this.title && this.title.drive(dt, t); this.hub.update(dt, t); } // ONBOARDING
    else if (this.scene === 'fight') this.fightView.frame(dt, t);
    this.photo && this.photo.frame(dt, t); // PHOTO: fab visibility + free camera override (after the scene moved the camera)
  }
  resize(w, h) { this._rw = w; this._rh = h; this.hub && this.hub.resize && this.hub.resize(w, h); this.fightView && this.fightView.resize(w, h); }

  /** play one fight in the 3D arena; resolves with the 2D-compatible result object */
  async playFight(gl, opps, stance, o = {}) {
    const S = this.S, F = buildFight(S, gl, opps, stance, o);
    if (!this._pwDone) U.toast('The arena is being readied...', { kind: 'info', ms: 2200 });
    await this.prewarm({ immediate: true });   // PERF: usually long done (idle); if the player is fast, the arena finishes building / compiling here
    this.setScene('fight');
    this.fightView.setMeta && this.fightView.setMeta(F.meta);
    const r = await this.fightView.start(F, { league: (o.ev && o.ev.league) || 0, ev: o.ev, augs: o.augs });
    const res = fightResult(F, gl);
    return res;
  }

  /** re-run a finished fight deterministically (same seed, same snapshot, same taps) in the 3D arena */
  async watchReplay(res, o = {}) { // REEL: o.reel plays the highlight reel instead of the full replay
    const R = res && res.F && res.F.replay; if (!R || !R.snap) return;
    const F2 = structuredClone(R.snap); F2.replay = R; await this.prewarm({ immediate: true }); this.setScene('fight');
    await this.fightView.start(F2, { replay: R, league: res.F.meta ? res.F.meta.league : 0, noSplash: true, reel: !!o.reel });
    const lm = L(); lm.setRandom(null);
  }

  returnToHub() { if (this.fightView) { this.fightView.hud.style.display = 'none'; this.fightView.dispose(); } this.setScene('hub'); }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const top = document.createElement('div'); top.className = 'lx-hud-top';
    this.goldC = U.counter({ ico: 'coin', value: 0, kind: 'gold' }); this.fameC = U.counter({ ico: 'fame', value: 0, kind: 'fame' });
    this.weekChip = document.createElement('div'); this.weekChip.className = 'fv-week';
    this.weekChip.style.cssText = 'font:800 12px/16px system-ui,sans-serif;letter-spacing:.06em;color:#f2c14e;text-shadow:0 1px 0 #1d1830;padding:6px 10px;border-radius:999px;background:rgba(29,24,48,.62);white-space:nowrap';
    const row = document.createElement('div'); row.className = 'lx-row'; row.append(this.goldC, this.fameC);
    const right = document.createElement('div'); right.className = 'lx-row'; right.append(this.weekChip, U.iconButton('gear', 'Settings and more', () => this.open('more', { tab: 'settings' })));
    top.append(row, right);
    const mid = document.createElement('div'); mid.style.cssText = 'flex:1;pointer-events:none';
    const bottom = document.createElement('div'); bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px';
    this.advBtn = U.button({ label: 'Advance week', variant: 'gold', icon: 'arena', onClick: () => this.advance() });
    this.nav = U.nav([{ icon: 'ludus', label: 'Ludus' }, { icon: 'roster', label: 'Roster' }, { icon: 'arena', label: 'Arena' }, { icon: 'market', label: 'Market' }, { icon: 'scroll', label: 'More' }], (it, i) => this.onNav(i), 0) /* ONBOARDING fix: kit nav calls onSelect(item, index) */;
    bottom.append(this.advBtn, this.nav);
    this.hud.append(top, mid, bottom);
    try { this.photo = createPhoto(this); } catch (e) { console.warn('photo mode unavailable', e && e.message); } // PHOTO: camera button (bottom corner), fight outro button, share card
    // TUT: stable hooks for the tutorial spotlight (never look up buttons by their text)
    this.advBtn.dataset.tut = 'advance'; ['ludus', 'roster', 'arena', 'market', 'more'].forEach((k, i) => { const n = this.nav.children[i]; if (n) n.dataset.tut = 'nav-' + k; });
  }
  onNav(i) { const id = ['ludus', 'roster', 'arena', 'market', 'more'][i]; if (id === 'ludus') { this.closeAll(); this.hub.focusHome && this.hub.focusHome(); } else this.open(id); }

  refresh() {
    const S = this.S; if (!S) return;
    this.goldC.set(S.gold); this.fameC.set(S.fame);
    const f = L().festival ? L().festival(S, S.week) : null;
    this.weekChip.textContent = `SEASON ${S.season} · WEEK ${((S.week - 1) % 12) + 1}${f && f.n ? ' · ' + String(f.n).toUpperCase() : ''}`;
    const due = L().dueKeys(S).length;
    // QA: screen reader labels for the HUD
    this.goldC.setAttribute('role', 'group'); this.goldC.setAttribute('aria-label', `Gold ${Math.round(S.gold)}`); this.fameC.setAttribute('role', 'group'); this.fameC.setAttribute('aria-label', `Fame ${Math.round(S.fame)}`);
    this.weekChip.setAttribute('aria-label', `Season ${S.season}, week ${((S.week - 1) % 12) + 1}${f && f.n ? ', ' + f.n : ''}`);
    this.advBtn.setAttribute('aria-label', `Advance week${due ? `, ${due} fight${due === 1 ? '' : 's'} due` : ''}`);
    this.advBtn.querySelector('span') ? 0 : 0;
    const lab = this.advBtn.querySelector('.lx-btn-label') || this.advBtn;
    if (!S.glads.length) this.advBtn.title = 'Recruit a gladiator first';
    this.advBtn.dataset.due = due; this.advBtn.classList.toggle('lx-pulse', !!due);
    this.hub && this.hub.refresh && this.hub.refresh(S);
  }

  async advance() {
    if (this.busy) return; const S = this.S;
    if (!S.glads.length) { U.toast('Recruit a gladiator first', { kind: 'bad' }); this.audio.sfx('uiError'); this.open('recruit'); return; }
    // QA friction: new players press Advance without having entered anything, then wonder why nothing happens. Say so, only in the first weeks.
    if (!L().dueKeys(S).length && (S.stats.weeks || 0) < 3) U.toast('No fight entered this week: your fighters will only train. Open the Arena to enter one.', { kind: 'info', ms: 4200 });
    this.busy = true; this.audio.sfx('uiConfirm'); this.closeAll();
    try { await advanceWeek(this.ctx); } catch (e) { console.error(e); U.toast('Something went wrong: ' + e.message + '. Your ludus is saved.', { kind: 'bad' }); }
    finally { this.busy = false; this.save(); if (this.scene !== 'hub') this.returnToHub(); this.refresh(); }
  }

  // ---------------------------------------------------------------- dialogs and screens
  /** Promise modal. opts: {title, body: Node|string, actions: [{label, value, variant, icon, sub, keepOpen}], dismiss: value on close} */
  ask(opts) {
    // ONBOARDING: retirement report gets the eulogy ceremony (profile.js owns the dialog, ceremonies.js dresses it)
    if (opts && opts.title === 'Hall of Legends' && !opts._cer && this.S && this.S.legends && this.S.legends.length) { const lg = this.S.legends[this.S.legends.length - 1]; const r = Cer.eulogy(this.ctx, { kind: 'retire', legend: lg, body: opts.body, actions: opts.actions, dismiss: opts.dismiss }); if (r) return r; }
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (done) return; done = true; m.close(); resolve(v); };
      const acts = (opts.actions || []).map((a) => U.button({ label: a.label, variant: a.variant || 'gold', icon: a.icon, sub: a.sub, block: true, onClick: () => { this.audio.sfx('uiTap'); fin(a.value); } }));
      const body = typeof opts.body === 'string' ? Object.assign(document.createElement('div'), { textContent: opts.body }) : opts.body;
      const m = U.modal({ title: opts.title, body, actions: acts, onClose: () => { if (!done) { done = true; resolve(opts.dismiss === undefined ? null : opts.dismiss); } } });
      this.modals.push(m); this.audio.sfx('uiTap', { gain: 0.5 }); const tk = tutKey(opts.title); if (tk && m.el) m.el.dataset.tutSheet = tk; // TUT
    });
  }
  /** non-promise sheet for screens: returns {close, el}. */
  sheet(o) { const m = U.modal(o); this.modals.push(m); const tk = tutKey(o && o.title); if (tk && m.el) m.el.dataset.tutSheet = tk; /* TUT */ return m; }
  closeAll() { this.modals.splice(0).forEach((m) => { try { m.close(); } catch (e) { /* closed */ } }); }

  async open(id, arg) {
    if (!SCREENS.includes(id)) return;
    try {
      const mod = this.mods[id] || (this.mods[id] = await import(`./screens/${id}.js`));
      this.closeAll(); this.audio.sfx('uiTap'); return mod.open(this.ctx, arg);
    } catch (e) { console.error('screen', id, e); U.toast(`Could not open ${id}. Please try again.`, { kind: 'bad' }); }
  }

  onPick(sel) {
    if (!sel || this.busy || this.scene !== 'hub') return;
    if (sel.type === 'plot') this.open('building', sel); else if (sel.type === 'glad') this.open('profile', sel.id);
  }
}
