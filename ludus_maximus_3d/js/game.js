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

const D = () => globalThis.LM_D, L = () => globalThis.LM;
const SCREENS = ['building', 'roster', 'profile', 'recruit', 'arena', 'market', 'armory', 'more', 'world', 'infirmary', 'sponsors', 'events']; // WAVE2 infirmary/sponsors/events (screens/*.js)
// 'world' = calendar, rival ludi, barracks, memorial (screens/world.js)
// TUT: every sheet and dialog carries data-tut-sheet=<key> so the tutorial never has to read titles
const TUT_SHEETS = [[/^Roster$/, 'roster'], [/^The Arena$/, 'arena'], [/^(Choose your first fighter|Volunteers)$/, 'recruit'], [/^(Victory|Defeat|Duel won)$/, 'results'], [/^Week \d+ done$/, 'week-done'], [/^More$/, 'more'], [/^The World$/, 'world'], [/^Your Ludus$/, 'building'], [/^Market$/, 'market']];
const tutKey = (title) => { const t = String(title || ''); const r = TUT_SHEETS.find(([re]) => re.test(t)); return r ? r[1] : ''; };

export class Game {
  constructor({ renderer, camera, post, audio, ui, tier }) {
    Object.assign(this, { renderer, camera, post, audio, ui, tier });
    this.S = null; this.busy = false; this.scene = 'none'; this.mods = {}; this.modals = [];
    this.hud = document.createElement('div'); this.hud.className = 'lx-hud fv-main-hud'; this.hud.style.display = 'none';
    ui.append(this.hud);
    this.ctx = this.makeCtx();
  }

  async init() {
    this.fightView = new FightView({ renderer: this.renderer, post: this.post, camera: this.camera, audio: this.audio, host: this.ui, tier: this.tier });
    try { const mod = await import('./hub.js'); this.hub = mod.createHub({ renderer: this.renderer, camera: this.camera, post: this.post, audio: this.audio, tier: this.tier }); }
    catch (e) { console.warn('hub.js unavailable, using stub', e && e.message); this.hub = createHubStub({ renderer: this.renderer, camera: this.camera, audio: this.audio, tier: this.tier }); }
    this.hub.onPick = (sel) => this.onPick(sel);
    this.buildHud();
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
    if (name === 'hub') { this.post.setScene(this.hub.scene); this.hub.enter(this.S); this.hud.style.display = 'flex'; this.audio.music.setMode('ludus', { fade: 1.2 }); this.audio.crowd(0); this.refresh(); this.tutorial && this.tutorial.maybeStart(); /* ONBOARDING */ }
    else if (name === 'fight') { this.post.setScene(this.fightView.scene); this.hud.style.display = 'none'; }
  }

  frame(dt, t) {
    if (this.scene === 'hub') this.hub.update(dt, t);
    else if (this.scene === 'title') { this.title && this.title.drive(dt, t); this.hub.update(dt, t); } // ONBOARDING
    else if (this.scene === 'fight') this.fightView.frame(dt, t);
    this.photo && this.photo.frame(dt, t); // PHOTO: fab visibility + free camera override (after the scene moved the camera)
  }
  resize(w, h) { this.hub && this.hub.resize && this.hub.resize(w, h); this.fightView && this.fightView.resize(w, h); }

  /** play one fight in the 3D arena; resolves with the 2D-compatible result object */
  async playFight(gl, opps, stance, o = {}) {
    const S = this.S, F = buildFight(S, gl, opps, stance, o);
    this.setScene('fight');
    this.fightView.setMeta && this.fightView.setMeta(F.meta);
    const r = await this.fightView.start(F, { league: (o.ev && o.ev.league) || 0, ev: o.ev, augs: o.augs });
    const res = fightResult(F, gl);
    return res;
  }

  /** re-run a finished fight deterministically (same seed, same snapshot, same taps) in the 3D arena */
  async watchReplay(res) {
    const R = res && res.F && res.F.replay; if (!R || !R.snap) return;
    const F2 = structuredClone(R.snap); F2.replay = R; this.setScene('fight');
    await this.fightView.start(F2, { replay: R, league: res.F.meta ? res.F.meta.league : 0, noSplash: true });
    const lm = L(); lm.setRandom(null);
  }

  returnToHub() { this.fightView.hud.style.display = 'none'; this.fightView.dispose(); this.setScene('hub'); }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const top = document.createElement('div'); top.className = 'lx-hud-top';
    this.goldC = U.counter({ ico: 'coin', value: 0, kind: 'gold' }); this.fameC = U.counter({ ico: 'fame', value: 0, kind: 'fame' });
    this.weekChip = document.createElement('div'); this.weekChip.className = 'fv-week';
    this.weekChip.style.cssText = 'font:800 12px/16px system-ui,sans-serif;letter-spacing:.06em;color:#f2c14e;text-shadow:0 1px 0 #1d1830;padding:6px 10px;border-radius:999px;background:rgba(29,24,48,.62);white-space:nowrap';
    const row = document.createElement('div'); row.className = 'lx-row'; row.append(this.goldC, this.fameC);
    const right = document.createElement('div'); right.className = 'lx-row'; right.append(this.weekChip, U.iconButton('gear', 'More', () => this.open('more')));
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
