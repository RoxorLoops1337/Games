// FightView: binds the sim (core/arena.js fight object F) to the 3D world: rigs, FX, feel, director, audio, HUD.
// Frame order (see .claude/skills/ludus3d-vfx-gamefeel): feel.update(real) -> sim.step(scaled) -> events -> actors -> fx.update -> camera -> render.
import * as THREE from 'three';
import { createSky, createLightRig, applyTOD, TOD } from './sky.js';
import { createArena, pickTheme, themeNight, THEME_IDS } from './env_arena.js'; // ARENA_THEME
import { createDustMotes, createGodRays } from './envfx.js';
import { createFx } from './fx.js';
import { createGore } from './gore.js';
import { createFeel } from './feel.js';
import { FightDirector } from './director.js';
import { createGladiator } from './gladiator.js';
import * as BF from './beast_fx.js'; // BEAST: Venatio beasts (rig, sounds, events)
import * as U from './ui_kit.js';
import { trimShadowCasters } from './post.js';

const D = () => globalThis.LM_D, L = () => globalThis.LM;
const STEP = 1 / 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VOICE = { murmillo: 0, hoplomachus: 1, retiarius: 2, dimachaerus: 1, thraex: 3 };
const ULT_EL = { pulverize: 'earth', hookshot: 'earth', bladedance: 'wind', skewer: 'wind', tornado: 'wind', unbreakable: 'holy', bloodrage: 'fire', meteor: 'fire', duststorm: 'wind' };
const COLOR_EL = (c) => { c = (c || '').toLowerCase(); if (/e8742a|d2412b|e0742a|f6b82d/.test(c)) return 'fire'; if (/3f7fd6|2f78c4|a8d8ff/.test(c)) return 'lightning'; if (/c98a52|b8892a/.test(c)) return 'earth'; return 'holy'; };
const SPEED_KEY = 'ludus3d_fv_speed', PREF_KEY = 'ludus_maximus_3d_prefs', SPEEDS = [1, 2, 3];
const D2R = Math.PI / 180, smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const MASS = { murmillo: 0.75, hoplomachus: 0.85, dimachaerus: 1, thraex: 1.1, retiarius: 1.2 }; // heavy armour shoves less
Object.assign(MASS, BF.MASS); // BEAST: heavier beasts shrug off shoves
const NO_EXEC = new Set(['spar']);                                   // sparring partners are never executed
// replay camera presets: pitch (deg), distance (m), spin (rad/s, 0 = fixed). 'auto' hands the camera back to the director.
const CAMS = { auto: null, wide: { pitch: 36, d: 24 }, side: { pitch: 12, d: 13, side: true }, low: { pitch: 5, d: 8.5, side: true }, top: { pitch: 72, d: 22 }, orbit: { pitch: 22, d: 15, spin: 0.35 } };
const RATES = [0.25, 0.5, 1, 2];
/** replay seeking: fx calls for events far from the seek target are dropped (a Proxy that swallows everything except the persistent sand decals) */
const NOOP = new Proxy(function () {}, { get: () => NOOP, apply: () => NOOP });
const quietFx = (real) => new Proxy(real, { get: (t, k) => (k === 'groundDecal' || k === 'decal' || k === 'markDecals' || k === 'decalDraw' ? t[k] : NOOP) });
const readSpeed = () => { try { const v = +localStorage.getItem(SPEED_KEY); return SPEEDS.includes(v) ? v : 1; } catch (e) { return 1; } };
const STATUS_FX = new Set(['stun', 'slow', 'bleed', 'blind', 'taunt', 'root', 'burn']);
const STATUS_LABEL = { stun: 'STUNNED', slow: 'SLOWED', bleed: 'BLEEDING', blind: 'BLINDED', taunt: 'TAUNT', netted: 'NETTED', guard: 'GUARD', frenzy: 'FRENZY', rage: 'RAGE', rally: 'RALLY', root: 'ROOTED', air: 'KNOCKED UP', spin: 'WHIRLING' };

export class FightView {
  constructor({ renderer, post, camera, audio, host, tier = 'high' }) {
    this.renderer = renderer; this.post = post; this.camera = camera; this.audio = audio; this.host = host; this.tier = tier;
    this.scene = new THREE.Scene(); post.setScene && post.setScene(this.scene);
    this.sky = createSky(); this.scene.add(this.sky.mesh);
    this.light = createLightRig(this.scene, { shadowSize: tier === 'low' ? 1024 : tier === 'medium' ? 1536 : 2048, shadowRadius: 34, shadowCenter: new THREE.Vector3(0, 0, 0), far: 300 });
    this.arena = createArena({ density: tier === 'low' ? 0.45 : tier === 'medium' ? 0.7 : 1, decalRes: tier === 'low' ? 1024 : 2048, lite: tier !== 'high' });
    this.scene.add(this.arena.group);
    this.preset = Object.assign({}, TOD.golden, { sunElev: 46, sunAz: 205 });
    applyTOD(this.preset, { rig: this.light, scene: this.scene, sky: this.sky, renderer, nightUniforms: [{ set value(v) { this._a && this._a(v); } }] });
    this.arena.setNight(this.preset.night || 0);
    const sd = this.light.sunDir, rays = [];
    for (let i = 0; i < 14; i++) { const th = (i / 14) * Math.PI * 2 + 0.2; const p = this.arena.ring(9 + (i % 3) * 2, th); rays.push({ x: p[0], y: 19.5, z: p[1], w: 2.2 + (i % 4) * 0.5, len: 26 }); }
    this.godrays = createGodRays(rays, sd, { color: new THREE.Color(this.preset.sunColor).getHex(), intensity: 0.12 * (1 - (this.preset.night || 0)) });
    this.scene.add(this.godrays.mesh);
    this.dust = createDustMotes({ count: tier === 'low' ? 160 : 380, min: new THREE.Vector3(-28, 0.4, -20), max: new THREE.Vector3(28, 16, 20), size: 3, intensity: 1.1 });
    this.scene.add(this.dust.points);
    // decal canvas covers +-17 m around the centre (fighters stay inside ~13 m): 2048 px high tier, so a blood splat is a few pixels wide, not a smudge
    this.fx = createFx(this.scene, { renderer, arenaRadius: 15, groundY: 0, sand: this.arena, quality: tier === 'low' ? 0.5 : tier === 'medium' ? 0.75 : 1, decalSize: tier === 'low' ? 1024 : tier === 'medium' ? 1536 : 2048, decalGap: tier === 'low' ? 0.2 : 0.12, maxNorm: 1400 });
    this.feel = createFeel({ overlay: true, fov: camera.fov });
    this.gore = createGore(this.fx, { scene: this.scene, audio, feel: this.feel, tier });
    this.dir = new FightDirector({ aspect: camera.aspect, radius: 13.2, gateAngle: 0 });
    this.t = 0; this.F = null; this.fm = new Map(); this.sim = 0; this.acc = 0; this.userSpeed = readSpeed(); this.phase = 'idle';
    this.paused = false; this.pauseModal = null; this.ex = null; this.execPending = null; this.forfeited = false; this.rate = 1; this.camMode = 'auto'; this.epoch = 0; this.lsK = 0; this.ls = null; this.lsCool = 0;
    this.buildHud(); this.bindInput();
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const root = this.hud = document.createElement('div'); root.className = 'fv-hud'; root.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none';
    this.plates = document.createElement('div'); this.plates.className = 'lx-plates';
    this.banners = document.createElement('div'); this.banners.className = 'lx-banners'; this.banners.style.top = 'calc(var(--lx-sat) + 56px)';
    this.hudBox = document.createElement('div'); this.hudBox.className = 'lx-hud';
    const top = document.createElement('div'); top.className = 'lx-hud-top';
    this.speedBtn = U.button({ label: 'x' + this.userSpeed, variant: 'bronze', onClick: () => this.setSpeed(SPEEDS[(SPEEDS.indexOf(this.userSpeed) + 1) % SPEEDS.length]) });
    this.speedBtn.setAttribute('aria-label', 'Game speed'); this.speedBtn.title = 'Game speed (1, 2, 3)';
    this.pauseBtn = U.button({ label: '', variant: 'bronze', onClick: () => this.pause(!this.paused) }); this.pauseBtn.setAttribute('aria-label', 'Pause'); this.pauseBtn.title = 'Pause (P)'; this.pauseBtn.classList.add('lx-fv-pause');
    this.pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none"/></svg>';
    this.skipBtn = U.button({ label: 'Skip', variant: 'ghost', onClick: () => { this.skip = true; } });
    const row = this.topRow = document.createElement('div'); row.className = 'lx-row lx-fv-top'; row.append(this.pauseBtn, this.speedBtn, this.skipBtn);
    this.speedBtn.classList.add('lx-fv-btn'); this.skipBtn.classList.add('lx-fv-btn'); this.pauseBtn.classList.add('lx-fv-btn'); this.hudBox.classList.add('lx-fv-hud'); this.avoid = { top: null, bottom: [], n: 0 };
    this.topInfo = document.createElement('div'); this.topInfo.className = 'lx-row';
    top.append(this.topInfo, row);
    this.ultBar = document.createElement('div'); this.ultBar.className = 'lx-hud-ults';
    const mid = document.createElement('div'); mid.style.cssText = 'flex:1;pointer-events:none';
    this.hudBox.append(top, mid, this.ultBar);
    root.append(this.plates, this.hudBox, this.banners);
    this.host.append(root);
  }

  // ---------------------------------------------------------------- shader warm-up (main.js calls this behind the boot overlay)
  /** Compile and draw once, off the player's clock: a rig of every style (all gear materials), the gib mesh, every pooled fx mesh, the decal plane, shadows, bloom, grade.
   *  Afterwards the first hit, gib, ultimate or fight start finds every program ready. Rigs and test objects are removed again. */
  async warm() {
    if (this.warmed) return; this.warmed = true;
    const { renderer, post, camera } = this, lm = L(), prev = post.composer.passes[0].scene, rigs = [], hid = [], keep = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov };
    try {
      ['murmillo', 'thraex', 'hoplomachus', 'retiarius', 'dimachaerus'].forEach((st, i) => {
        const g = lm.makeGlad({ style: st, lvl: 9, id: 900 + i, name: 'Warm' + i, r: lm.mulberry(31 + i) }), u = lm.mkUnits([g], 'A', {})[0], rig = createGladiator(u, { detail: this.tier });
        trimShadowCasters(rig.root, this.tier); rig.root.position.set((i - 2) * 1.7, 0, 0); rig.addBlood && rig.addBlood(0.2, 1); rig.update(0.05); this.scene.add(rig.root); rigs.push(rig);
      });
      // high tier only: build every theme's lazily created dressing (hay, horizon rings, torches) so those programs compile too. Medium / low skip it (each theme caches
      // its textures on the CPU: too much memory on phones), their first fight in a new theme compiles one or two small programs.
      if (this.tier === 'high' && THEME_IDS) {
        for (const id of THEME_IDS) { try { this.arena.setTheme(id, { rig: this.light, scene: this.scene, sky: this.sky, renderer, wx: 'clear', night: false }); } catch (e) { /* a theme must never block boot */ } await new Promise((r) => setTimeout(r, 0)); }
        applyTOD(this.preset, { rig: this.light, scene: this.scene, sky: this.sky, renderer, nightUniforms: [{ set value(v) { this._a && this._a(v); } }] }); this.arena.setNight(this.preset.night || 0);
      }
      this.gore.warm && this.gore.warm(true); this.fx.setWarm(true);
      this.scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints) && !o.visible && !o.userData.noWarm) { o.visible = true; hid.push(o); } });   // theme / weather only props (hay, hills, rain) compile too
      camera.position.set(0, 4.5, 9); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(); post.setScene(this.scene);
      const rt = post.composer.renderTarget1; renderer.setRenderTarget(rt);          // programs are keyed by the render target (no tone mapping inside the composer)
      try { if (renderer.compileAsync) await renderer.compileAsync(this.scene, camera); else renderer.compile(this.scene, camera); } finally { renderer.setRenderTarget(null); }
      post.render(0.016, 0);                                                          // shadow depth programs, bloom, grade, output, decal texture upload
    } catch (e) { console.warn('fight warm-up skipped', e && e.message); }
    finally {
      // The warm rigs are detached but NOT disposed: three frees a program when the last material using it is disposed, and every real rig is disposed at the end of a fight.
      // Keeping these materials alive keeps the programs compiled for the whole session (also across fights), so a fight start never recompiles them.
      for (const r of rigs) this.scene.remove(r.root); this.warmRigs = rigs;
      for (const o of hid) o.visible = false;
      this.gore.warm && this.gore.warm(false); this.fx.setWarm(false); post.setScene(prev);
      camera.position.copy(keep.p); camera.quaternion.copy(keep.q); camera.fov = keep.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    }
  }

  // ---------------------------------------------------------------- QoL: input, speed, pause menu, forfeit
  bindInput() {
    this._key = (e) => {
      if (!this.F || this.hud.style.display === 'none' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) && tg.type !== 'range') return;
      if (document.querySelector('.lx-scrim') && !this.pauseModal) return;   // some other dialog owns the keyboard
      const k = e.key;
      if (k === 'p' || k === 'P') { e.preventDefault(); this.pause(!this.paused); }
      else if (k === 'Escape' && !this.paused) this.pause(true);
      else if (!this.replaying && (k === '1' || k === '2' || k === '3')) this.setSpeed(+k);
    };
    document.addEventListener('keydown', this._key);
    // replay: drag the canvas to orbit (the camera switches to a free orbit around the action; the 'Auto' chip hands it back)
    const cv = this.renderer.domElement; let drag = null;
    cv.addEventListener('pointerdown', (e) => { if (this.replaying && this.F) drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    cv.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (this.camMode === 'auto' || !this.dir.free) this.setCam('wide'); this.dir.freeOrbit(-dx * 0.008, dy * 0.006, 0); this.camMode = 'free'; this.syncReplayBar(); });
    const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  setSpeed(n) {
    if (!SPEEDS.includes(n)) n = 1; this.userSpeed = n; this.speedBtn.textContent = 'x' + n;
    try { localStorage.setItem(SPEED_KEY, String(n)); } catch (e) { /* storage blocked */ }
    if (this.pmSpeed) this.pmSpeed.forEach((b, i) => b.setAttribute('aria-pressed', SPEEDS[i] === n ? 'true' : 'false'));
    this.audio.sfx('uiTap', { gain: 0.4 });
  }

  canPause() { return !!(this.F && !this.F.done && this.phase === 'fight'); }
  syncPauseBtn() {
    if (!this.pauseBtn) return; const dis = !this.canPause();
    if (this.pauseBtn.disabled !== dis) this.pauseBtn.disabled = dis;
    this.pauseBtn.classList.toggle('lx-fv-on', this.paused);
    this.pauseBtn.setAttribute('aria-pressed', this.paused ? 'true' : 'false');
  }
  /** freeze the fight (sim, animation, fx, audio) and open the menu (fights) or just freeze (replays, their bar has the controls) */
  pause(on) {
    on = !!on; if (on === this.paused) return;
    if (on) {
      if (!this.canPause()) return; this.paused = true; try { this.audio.suspend && this.audio.suspend(); } catch (e) { /* audio is optional */ }
      if (!this.replaying) this.openPauseMenu();
    } else {
      this.paused = false; try { this.audio.resume && this.audio.resume(); } catch (e) { /* audio is optional */ }
      if (this.pauseModal) { const m = this.pauseModal; this.pauseModal = null; m.close(); }
    }
    this.syncPauseBtn(); this.syncReplayBar();
  }
  readPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } }
  /** quick settings write the same prefs as More > Settings, then re-apply them through screens/more.js applyPrefs (gore level, reduced motion class, volumes) */
  setPref(k, v) {
    const p = this.readPrefs(); p[k] = v; try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
    const S = globalThis.__LM3D && globalThis.__LM3D.game && globalThis.__LM3D.game.S; if (S && k === 'rm') { S.opts = S.opts || {}; S.opts.rm = v; }
    import('./screens/more.js').then((m) => { m.applyPrefs && m.applyPrefs({ audio: this.audio }); if (k === 'gore' || k === 'rm') this.gore.refresh(); }).catch(() => {});
  }
  openPauseMenu() {
    const p = this.readPrefs(), el = (t, c, kids) => { const e = document.createElement(t); if (c) e.className = c; if (kids) [].concat(kids).forEach((x) => e.append(x)); return e; };
    const body = el('div', 'lx-fv-pm'), seg = (label, opts, cur, on) => { const r = el('div', 'lx-fv-pmrow'), g = el('div', 'lx-fv-seg'), bs = opts.map(([v, t]) => { const b = el('button', 'lx-fv-chip'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', String(v) === String(cur) ? 'true' : 'false'); b.onclick = () => { bs.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); on(v); this.audio.sfx('uiTap', { gain: 0.4 }); }; g.append(b); return b; }); r.append(el('span', 'lx-fv-pml', label), g); return [r, bs]; };
    const sw = (label, on, cb) => { const r = el('div', 'lx-fv-pmrow'), b = el('button', 'lx-fv-chip lx-fv-sw'); b.type = 'button'; b.setAttribute('role', 'switch'); const draw = (v) => { b.setAttribute('aria-checked', v ? 'true' : 'false'); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.textContent = v ? 'On' : 'Off'; }; draw(on); b.onclick = () => { on = !on; draw(on); cb(on); this.audio.sfx('uiTap', { gain: 0.4 }); }; r.append(el('span', 'lx-fv-pml', label), b); return r; };
    const [spRow, spBtns] = seg('Speed', SPEEDS.map((v) => [v, 'x' + v]), this.userSpeed, (v) => this.setSpeed(v)); this.pmSpeed = spBtns;
    const [gRow] = seg('Gore', [['off', 'Off'], ['low', 'Low'], ['full', 'Full']], p.gore || 'full', (v) => this.setPref('gore', v));
    body.append(spRow, gRow, sw('Sound', !p.muted, (v) => this.setPref('muted', !v)), sw('Reduced motion', !!p.rm, (v) => this.setPref('rm', v)));
    const resume = U.button({ label: 'Resume', variant: 'gold', icon: 'sword', block: true, onClick: () => this.pause(false) });
    const quit = U.button({ label: 'Quit fight', variant: 'danger', block: true, onClick: () => this.confirmQuit() });
    const m = U.modal({ title: 'Paused', body, actions: [resume, quit], onClose: () => { if (this.pauseModal === m) { this.pauseModal = null; this.pause(false); } } });
    this.pauseModal = m; m.el.classList.add('lx-fv-pause-scrim');
  }
  confirmQuit() {
    const body = document.createElement('p'); body.textContent = 'Your side forfeits the bout. It counts as a defeat and the crowd will remember it.'; body.style.margin = '4px 0';
    const keep = U.button({ label: 'Keep fighting', variant: 'gold', block: true, onClick: () => c.close() });
    const yes = U.button({ label: 'Forfeit', variant: 'danger', block: true, onClick: () => { c.close(); this.forfeit(); } });
    const c = U.modal({ title: 'Quit the fight?', body, actions: [keep, yes] });
  }
  /** the player's side concedes: the sim is closed with side B as the winner (a real defeat, like losing on points). No execution cinematic. */
  forfeit() {
    const F = this.F; if (!F || F.done || this.replaying) return;
    this.forfeited = true; F.done = true; F.winner = 'B'; this.pause(false);
    this.banner('You forfeit the bout', 'info');
  }

  // ---------------------------------------------------------------- replay controls: pause, restart, scrub, rate, camera presets
  buildReplayBar() {
    if (this.rbar) { this.rbar.remove(); this.rbar = null; }
    this.speedBtn.style.display = this.replaying ? 'none' : ''; if (!this.replaying) return;
    const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
    const bar = this.rbar = el('div', 'lx-fv-rbar'); bar.style.pointerEvents = 'auto';
    const chip = (txt, label, on) => { const b = el('button', 'lx-fv-chip', txt); b.type = 'button'; b.setAttribute('aria-label', label); b.onclick = () => { on(); this.audio.sfx('uiTap', { gain: 0.4 }); }; return b; };
    this.rPlay = chip('', 'Play or pause', () => { this.pause(!this.paused); this.rPlay.dataset.userPaused = this.paused ? '1' : ''; });
    this.rRestart = chip('↺', 'Restart', () => this.seekTo(0));
    this.rSlider = el('input', 'lx-fv-scrub'); this.rSlider.type = 'range'; this.rSlider.min = 0; this.rSlider.max = 1; this.rSlider.value = 0; this.rSlider.step = 1; this.rSlider.setAttribute('aria-label', 'Replay position');
    this.rTime = el('span', 'lx-fv-rtime', '0.0 s');
    let was = false;
    this.rSlider.addEventListener('pointerdown', () => { this.scrubbing = true; was = this.paused; if (!this.paused) this.pause(true); });
    this.rSlider.addEventListener('input', () => { this.rTime.textContent = (this.rSlider.value / 30).toFixed(1) + ' s'; });
    this.rSlider.addEventListener('change', () => { this.seekTo(+this.rSlider.value); this.scrubbing = false; if (!was) this.pause(false); });
    this.rRates = RATES.map((r) => { const b = chip(r === 1 ? '1x' : r + 'x', 'Replay speed ' + r, () => { this.rate = r; this.syncReplayBar(); }); return b; });
    this.rCams = Object.keys(CAMS).map((k) => { const b = chip(k[0].toUpperCase() + k.slice(1), 'Camera ' + k, () => { this.setCam(k); this.syncReplayBar(); }); b.dataset.cam = k; return b; });
    const r1 = el('div', 'lx-fv-rrow'), r2 = el('div', 'lx-fv-rrow'), r3 = el('div', 'lx-fv-rrow');
    r1.append(this.rPlay, this.rRestart, this.rSlider, this.rTime); r2.append(...this.rRates); r3.append(...this.rCams);
    bar.append(r1, r2, r3); this.hud.append(bar); this.syncReplayBar();
  }
  syncReplayBar() {
    if (!this.rbar) return;
    this.rPlay.innerHTML = this.paused ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none"/></svg>';
    this.rRates.forEach((b, i) => b.setAttribute('aria-pressed', RATES[i] === this.rate ? 'true' : 'false'));
    this.rCams.forEach((b) => b.setAttribute('aria-pressed', b.dataset.cam === this.camMode ? 'true' : 'false'));
  }
  updateReplayBar() {
    if (!this.rbar || this.scrubbing) return; const R = this.opts.replay, total = Math.max(1, (R && R.total) || this.F.n || 1);
    if (+this.rSlider.max !== total) this.rSlider.max = total; this.rSlider.value = Math.min(total, this.F.n || 0); this.rTime.textContent = ((this.F.n || 0) / 30).toFixed(1) + ' / ' + (total / 30).toFixed(1) + ' s';
  }
  /** camera presets for replays: a fixed free orbit around the living fighters (side / low aim across the line between two of them) */
  setCam(name) {
    const c = CAMS[name], d = this.dir; this.camMode = name; this.camSpin = 0;
    if (!c) { d.release(); return; }
    d.freeTimeout = 0; if (!d.free) d.freeOrbit(0, 0, 0); const f = d.free; f.pitch = c.pitch * D2R; f.d = c.d; f.idle = 0; this.camSpin = c.spin || 0;
    if (c.side) { const L = this.F ? this.F.units.filter((u) => !u.down) : []; if (L.length >= 2) f.yaw = Math.atan2(L[1].y - L[0].y, L[1].x - L[0].x) + Math.PI / 2; }
  }
  /** jump to sim step n of the replay: forward = silent fast-forward, backward = rebuild from the snapshot and fast-forward (the sim is deterministic) */
  seekTo(n) {
    const R = this.opts && this.opts.replay; if (!R || !R.snap || !this.F) return;
    n = Math.max(0, Math.round(n)); const total = R.total || this.F.n || 0; n = Math.min(n, total);
    if (n < (this.F.n || 0) || this.F.done || this.phase !== 'fight') this.restartReplay();
    this.fastForward(n);
  }
  restartReplay() {
    const R = this.opts.replay, keep = { p: this.promise, r: this.resolve }, o = this.opts, cam = this.camMode, rate = this.rate, was = this.paused;
    this.paused = false; const F2 = structuredClone(R.snap); F2.replay = R;
    this.start(F2, o); this.promise = keep.p; this.resolve = keep.r; this.rate = rate; if (cam !== 'auto' && cam !== 'free') this.setCam(cam); this.paused = was; this.syncReplayBar();
  }
  fastForward(n) {
    const F = this.F, lm = L(), au = this.audio, sfx0 = au.sfx, crowd0 = au.crowd, real = this.fx, quiet = quietFx(real), t0 = performance.now(), NEAR = 45; let i = 0, crossed = false; this.epoch++;
    au.sfx = () => {}; au.crowd = () => {}; this.silent = true; real.hold = true;
    try {
      while ((F.n || 0) < n && !F.done && performance.now() - t0 < 4000) {
        const far = n - (F.n || 0) > NEAR;                                   // events older than ~1.5 s before the target need no sparks, numbers or particles
        if (far) this.fx = quiet; else { this.fx = real; if (!crossed) { crossed = true; this.gore.settle && this.gore.settle(); } }
        const taps = this.opts.replay.taps; while (this.tapI < taps.length && taps[this.tapI].n <= (F.n || 0)) this.applyTap(taps[this.tapI++]);
        lm.step(F, STEP); this.consume(); if (!far && (++i % 3) === 0) real.update(0.1, this.camera);
      }
    } finally { this.fx = real; au.sfx = sfx0; au.crowd = crowd0; this.silent = false; real.hold = false; }
    for (const f of this.fm.values()) { f.rx = f.u.x; f.ry = f.u.y; f.pu.x = f.pu.z = f.pu.vx = f.pu.vz = 0; f.ov = null; f.px0 = f.rx; f.pz0 = f.ry; f.vx = f.vz = 0; for (let k = 0; k < 14; k++) f.rig.update(0.1); }
    real.update(0.1, this.camera); this.feel.reset(); this.acc = 0; this.ls = null; this.lsK = 0;
  }

  // ---------------------------------------------------------------- fight lifecycle
  /** F: fight from core/arena.js createFight. opts: {league, intro:true, quiet}. Resolves with {winner, F} after the outro. */
  start(F, opts = {}) {
    this.dispose(); this.clearEnd(); this.ultBar.style.visibility = ''; if (this.extras) this.extras.style.visibility = '';
    this.resetPresentation(); this.F = F; this.opts = opts; this.replaying = !!opts.replay; this.tapI = 0; this.done = false; this.phase = 'intro'; this.phaseT = 0; this.skip = false; this.acc = 0; this.evSeen = 0; this.lastHitT = -9; this.recent = 0; this.intensity = 0.2; this.intTimer = 0;
    if (this.replaying) L().setRandom(L().mulberry(opts.replay.seed));
    this.gore.setTier(this.tier); this.gore.reset(this.goreSeed(F, opts));
    this.hud.style.display = 'block'; this.fx.reset && this.fx.reset(); this.arena.setGate(0); this.arena.setHype(0.3); this.feel.reset && this.feel.reset();
    const nA = F.units.filter((u) => u.side === 'A').length, nB = F.units.length - nA;
    F.units.forEach((u) => {
      const rig = u.beast ? BF.makeRig(this, u) : createGladiator(u, { tunic: u.side === 'B' ? (u.g.color || null) : (u.g.color || null) }); // BEAST: beasts get their own rig
      const gx = u.side === 'A' ? -22 : 22;
      const f = { u, rig, vx: 0, vz: 0, yaw: u.side === 'A' ? Math.PI / 2 : -Math.PI / 2, lx: gx, ly: u.y, handles: {}, atkN: 0, st: '', hpShown: u.hp, plate: null, ring: [], intro: { x: gx, y: u.y, tx: u.x, ty: u.y }, pu: { x: 0, z: 0, vx: 0, vz: 0 }, px0: gx, pz0: u.y, skidT: 0, ov: null, kneel: false, faceTo: null };
      trimShadowCasters(rig.root, this.post.tier || this.tier); rig.root.position.set(gx, 0, u.y); this.scene.add(rig.root); rig.resetSecondary && rig.resetSecondary();
      const plate = U.nameplate({ name: u.name, level: u.g.lvl, hp: u.hp, maxHp: u.maxhp, team: u.side === 'A' ? 'ally' : 'foe', rank: 0 });
      this.plates.append(plate); f.plate = plate; this.fm.set(u.id, f); this.gore.addFighter(u.id, rig, { maxhp: u.maxhp, side: u.side }); if (u.beast) BF.setup(this, f, u); // BEAST
      if (u.side === 'B') { plate.style.pointerEvents = 'auto'; plate.style.cursor = 'pointer'; plate.addEventListener('pointerdown', () => this.focusUnit(u.id)); }
    });
    // ultimates (player side; none while replaying)
    const mine = this.replaying ? [] : F.units.filter((u) => u.side === 'A'); let hk = 0;
    mine.forEach((u) => u.ults.forEach((slot, k) => {
      const col = D().ULTS[slot.id].c; const ring = U.cooldownRing({ ult: slot.id, color: col, size: Math.min(innerWidth, innerHeight) < 500 ? (innerHeight < 420 ? 54 : innerHeight < 480 ? 60 : 68) : 84, hotkey: ['Q', 'W', 'E', 'R', 'T', 'Y'][hk++], onCast: () => this.cast(u, k) });
      this.ultBar.append(ring); this.fm.get(u.id).ring.push({ ring, slot });
    }));
    this.applyWeather(F.meta ? F.meta.weather : 'clear');
    { const m = F.meta || {}, id = pickTheme(m); this.theme = id; this.arena.setTheme(id, { rig: this.light, scene: this.scene, sky: this.sky, renderer: this.renderer, wx: m.weather, night: themeNight(id, m) }); } // ARENA_THEME: per-fight arena look (env_arena.js THEMES)
    if (!this.replaying) this.buildExtras(F); else if (this.extras) { this.extras.remove(); this.extras = null; if (this.autoBtnOld) { this.autoBtnOld.remove(); this.autoBtnOld = null; } }
    if (!opts.noSplash && !this.replaying) { const a = F.units.filter((u) => u.side === 'A'), b = F.units.filter((u) => u.side === 'B'); const side = (us) => ({ name: us.map((u) => u.name).join(' & '), sub: us.map((u) => D().STYLES[u.style].n).join(' / ') + ' \u00b7 Lv ' + Math.round(us.reduce((x, u) => x + u.g.lvl, 0) / us.length), stars: Math.min(5, Math.round(us.reduce((x, u) => x + (L().stars ? L().stars(u.g) : 0), 0) / us.length)) }); setTimeout(() => U.vsSplash({ a: side(a), b: side(b), league: opts.league != null && D().LEAGUES[opts.league] ? D().LEAGUES[opts.league].n : '', host: this.host, ms: 2300 }), 350); }
    this.dir.setAspect(this.camera.aspect);
    this.dir.setShot('establishing', { dur: 3.2 }, 0); this.gateOpen = false;
    this.audio.music.setMode('arena', { fade: 1.2 }); this.audio.music.setIntensity(0.15); this.audio.crowd(0.3);
    this.audio.sfx('gate'); this.audio.sfx('horn');
    if (this.replaying) { this.phase = 'fight'; this.phaseT = 0; for (const f of this.fm.values()) { f.rx = f.u.x; f.ry = f.u.y; f.rig.root.position.set(f.u.x, 0, f.u.y); } this.arena.setGate(1); this.dir.setShot('follow', {}, 0); this.banner('REPLAY', 'info'); this.skipBtn.textContent = 'Exit'; } else this.skipBtn.textContent = 'Skip';
    this.buildReplayBar(); this.syncPauseBtn(); this.updateSpeedLabel();
    this.promise = new Promise((res) => { this.resolve = res; });
    return this.promise;
  }

  // weather: time-of-day preset + rain streaks, so the fight screen matches D.WEATHER (clear, rain, dust, heat, night)
  applyWeather(wx) {
    const base = wx === 'night' ? TOD.night : TOD.golden;
    const p = Object.assign({}, base, wx === 'night' ? {} : { sunElev: 46, sunAz: 205 });
    if (wx === 'rain') Object.assign(p, { sunInt: base.sunInt * 0.35, hemiInt: base.hemiInt * 1.15, fog: 0x8a93a8, fogDensity: 0.012, exposure: 0.95, cloudAmt: 0.95, glow: 0x9aa6bd, skyTop: 0x4a5670, skyMid: 0x7a869d, skyHor: 0xa7afc0 });
    if (wx === 'dust') Object.assign(p, { fog: 0xd9a066, fogDensity: 0.014, sunInt: base.sunInt * 0.7, skyHor: 0xe0b078, skyMid: 0xc89a6a });
    if (wx === 'heat') Object.assign(p, { fog: 0xffc47a, sunInt: base.sunInt * 1.15, exposure: 1.0 });
    applyTOD(p, { rig: this.light, scene: this.scene, sky: this.sky, renderer: this.renderer, nightUniforms: [{ set value(v) { } }] });
    this.arena.setNight(p.night || 0); this.godrays.mesh.visible = wx !== 'rain'; this.wx = wx;
    if (!this.rain) { const n = 520, pos = new Float32Array(n * 6); this.rainPos = pos; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false })); this.rain.frustumCulled = false; this.scene.add(this.rain); this.rainSeed = Array.from({ length: n }, () => [Math.random(), Math.random(), Math.random()]); }
    this.rain.visible = wx === 'rain';
  }
  updateRain(dt, t) {
    if (!this.rain || !this.rain.visible) return; const n = this.rainSeed.length, p = this.rainPos, c = this.camera.position;
    for (let i = 0; i < n; i++) { const s = this.rainSeed[i]; const y = ((1 - ((t * (14 + s[2] * 6) * 0.1 + s[1]) % 1)) * 22); const x = c.x + (s[0] - 0.5) * 46, z = c.z + (((s[1] * 7.3) % 1) - 0.5) * 46; p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z; p[i * 6 + 3] = x - 0.05; p[i * 6 + 4] = y + 0.7; p[i * 6 + 5] = z; }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // Crowd's Favor, Duo ultimate, auto-ult toggle and target focus
  buildExtras(F) {
    if (this.extras) this.extras.remove();
    const box = this.extras = document.createElement('div'); box.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;pointer-events:auto;margin-bottom:6px';
    this.favorBtn = U.button({ label: "Crowd's Favor!", variant: 'gold', icon: 'fame', onClick: () => { if (this.tap('favor')) this.audio.sfx('crowdCheer'); } }); this.favorBtn.style.display = 'none'; this.favorBtn.classList.add('lx-pulse');
    box.append(this.favorBtn);
    if (F.duo) { this.duoBtn = U.button({ label: 'Duo: ' + D().DUOS[F.duo.kind].n, variant: 'bronze', icon: 'sword', onClick: () => { const r = this.tap('duo'); if (!r) this.audio.sfx('uiError'); } }); box.append(this.duoBtn); } else this.duoBtn = null;
    this.autoBtn = U.button({ label: F.auto.A ? 'Auto ult: on' : 'Auto ult: off', variant: 'ghost', onClick: () => { this.tap('auto', !F.auto.A); this.autoBtn.textContent = F.auto.A ? 'Auto ult: on' : 'Auto ult: off'; } });
    if (this.autoBtnOld) this.autoBtnOld.remove(); this.autoBtnOld = this.autoBtn; this.autoBtn.classList.add('lx-fv-btn'); this.topRow.prepend(this.autoBtn); this.ultBar.before(box); box.classList.add('lx-fv-extras');
  }
  focusUnit(id) { const u = this.unitById(id); if (!u || u.side !== 'B' || u.down) return; this.tap('focus', id); this.audio.sfx('uiTap'); for (const f of this.fm.values()) if (f.u.side === 'B') f.plate.classList.toggle('fv-focus', this.F.foc.A === f.u.id); }

  /** every player input goes through here so it can be replayed exactly (keyed by sim step count F.n) */
  tap(kind, a, b) {
    const F = this.F; if (!F || this.replaying) return false; const rec = F.replay && F.replay.taps; rec && rec.push({ n: F.n || 0, kind, a, b });
    return this.applyTap({ kind, a, b });
  }
  applyTap(t) {
    const F = this.F, lm = L();
    if (t.kind === 'ult') return lm.useUlt(F, t.a, t.b);
    if (t.kind === 'duo') return lm.useDuo(F);
    if (t.kind === 'favor') return lm.useFavor(F);
    if (t.kind === 'focus') { lm.focus(F, 'A', t.a); return true; }
    if (t.kind === 'auto') { F.auto.A = !!t.a; return true; }
    return false;
  }

  cast(u, k) {
    const r = this.tap('ult', u.id, k);
    if (r === 'range') this.banner('Out of range', 'info');
    else if (!r) this.audio.sfx('uiError');
    return r;
  }

  banner(text, kind = 'info') { U.banner(text, kind, this.banners, 1700); }

  /** clear every per-fight presentation state (called by start and dispose) */
  resetPresentation() {
    if (this.pauseModal) { const m = this.pauseModal; this.pauseModal = null; try { m.close(); } catch (e) { /* closed */ } }
    if (this.paused) { this.paused = false; try { this.audio.resume && this.audio.resume(); } catch (e) { /* audio is optional */ } }
    this.ex = null; this.execPending = null; this.forfeited = false; this.rate = 1; this.camMode = 'auto'; this.camSpin = 0; this.scrubbing = false; this.silent = false; this.epoch++; this.lsK = 0; this.ls = null; this.lsCool = 0;
    if (this.dir) { this.dir.free = null; this.dir.freeTimeout = 6; }
    if (this.verdictEl) { this.verdictEl.remove(); this.verdictEl = null; }
    if (this.rbar) { this.rbar.remove(); this.rbar = null; }
  }
  updateSpeedLabel() { this.speedBtn.textContent = 'x' + this.userSpeed; }

  dispose() {
    this.resetPresentation();
    for (const f of this.fm.values()) { this.scene.remove(f.rig.root); f.rig.dispose && f.rig.dispose(); f.plate && f.plate.remove(); f.ring.forEach((r) => r.ring.remove()); }
    this.fm.clear(); if (this.ultBar) this.ultBar.innerHTML = '';
    if (this.fx && this.fx.clearDecals) this.fx.clearDecals();
    if (this.gore) this.gore.reset(1);
  }

  /** cosmetic gore seed: the replay seed when replaying, else a hash of the roster (the sim RNG is never touched) */
  goreSeed(F, opts) {
    if (opts && opts.replay && opts.replay.seed != null) return opts.replay.seed >>> 0;
    let h = 2166136261; for (const u of F.units) { const t = String(u.name) + u.id; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } }
    return h >>> 0;
  }

  resize(w, h) { this.dir.setAspect(w / h); }

  // ---------------------------------------------------------------- per frame
  frame(realDt, t) {
    this.t = t; realDt = Math.min(realDt, 0.1);
    if (this.paused && this.F) { this.framePaused(realDt); return; }
    this.sky.update(this.camera, t); this.arena.update(t, realDt); this.godrays.update(t); this.dust.update(t, this.renderer.getPixelRatio());
    const ft = this.feel.update(realDt);
    if (!this.F) { this.camera.updateMatrixWorld(); this.fx.update(ft.dt, this.camera); this.gore.postFrame(realDt); return; }
    const F = this.F, speedUp = this.skip ? 8 : this.replaying ? this.rate : this.userSpeed, fight = this.phase === 'fight';
    this.phaseT += realDt;
    if (this.phase === 'intro' && this.skip) this.phaseT = Math.max(this.phaseT, 4.3);
    // director first so timeScale (slow-mo cues) applies to this frame's sim
    if (this.camSpin && this.dir.free) this.dir.freeOrbit(this.camSpin * realDt);
    const units = F.units.map((u) => { const f = this.fm.get(u.id); return { id: u.id, x: f.rx ?? u.x, y: f.ry ?? u.y, vx: f.vx, vy: f.vz, team: u.side === 'A' ? 0 : 1, alive: !u.down, h: f.rig.beast ? f.rig.nameH : undefined, r: f.rig.beast ? f.rig.beastR : undefined }; }); // BEAST: big beasts widen the camera framing
    const pose = this.dir.update(realDt, units);
    const tail = fight ? this.updateLastStand(realDt, F) : 1;               // last victim on a sliver of hp: slow-mo tail + duel shoulder cam (presentation only, the sim just takes more frames)
    // dt = game seconds this frame (slow-mo, hit-stop, execution ramp). The sim advances dt * speed; animation and fx follow it (up to x3) so x2 / x3 look like fast-forward
    // and never desync from the sim. Audio is untouched (no pitch change): sounds are event driven.
    const dt = ft.dt * (fight ? pose.timeScale * tail : this.phase === 'outro' && this.ex ? this.ex.scale : 1), vdt = dt * (fight ? Math.min(speedUp, 3) : this.skip ? 3 : 1);

    if (this.phase === 'intro') this.introStep(realDt, dt);
    else if (fight) {
      this.acc += dt * speedUp; let n = 0; const cap = Math.max(10, 10 * speedUp);
      while (this.acc >= STEP && !F.done && n++ < cap) {
        if (this.replaying) { const taps = this.opts.replay.taps; while (this.tapI < taps.length && taps[this.tapI].n <= (F.n || 0)) this.applyTap(taps[this.tapI++]); }
        L().step(F, STEP); this.acc -= STEP; this.consume();
      }
      if (F.done && this.phase === 'fight') this.endFight();
      this.syncFighters(vdt, true);
    } else { if (this.ex) this.execStep(vdt, realDt); this.syncFighters(vdt, false); }
    if (this.replaying && this.skip && !this.done) { this.done = true; L().setRandom(null); this.resolve && this.resolve({ replay: true }); }
    if (this.phase === 'outro') {
      if (!this.ex || this.ex.done) this.outroT += realDt * (this.skip ? 3 : 1);
      const lim = this.replaying ? (this.ex ? 2.6 : 3) : (this.ex ? 4.2 : 5.4);
      if (this.outroT > lim && !this.done) { if (this.replaying) L().setRandom(null); this.done = true; this.clearEnd(); this.resolve && this.resolve({ winner: F.winner, F }); }
    }

    this.gore.setTier(this.tier); this.fx.update(vdt, this.camera); this.gore.postFrame(realDt);
    this.applyCamera(pose);
    this.updateHud(realDt, F);
    this.updateAudio(realDt, F);
    this.updateRain(realDt, t);
  }

  /** frozen frame: nothing simulates, the camera still settles (and orbits while dragging in a replay) so a paused replay can be inspected */
  framePaused(realDt) {
    const F = this.F, units = F.units.map((u) => { const f = this.fm.get(u.id); return { id: u.id, x: f.rx ?? u.x, y: f.ry ?? u.y, vx: 0, vy: 0, team: u.side === 'A' ? 0 : 1, alive: !u.down }; });
    if (this.camSpin && this.dir.free) this.dir.freeOrbit(this.camSpin * realDt);
    const pose = this.dir.update(this.dir.free ? realDt : 0, units); this.applyCamera(pose); this.gore.postFrame(realDt); this.updateReplayBar(); this.syncPauseBtn();
  }

  /** the last living unit of a side is on a sliver of hp while the other side still stands: ease the game clock down and frame the pair with the duel camera */
  updateLastStand(realDt, F) {
    let vic = null, best = 1;
    if (!F.done) for (const side of ['A', 'B']) { const mine = F.units.filter((u) => u.side === side && !u.down), foes = F.units.some((u) => u.side !== side && !u.down); if (mine.length === 1 && foes) { const fr = mine[0].hp / mine[0].maxhp; if (fr < 0.14 && fr < best) { best = fr; vic = mine[0]; } } }
    if (this.lsCool > 0) this.lsCool -= realDt; let target = 0;
    if (vic && this.lsCool <= 0 && F.t > 3) {
      if (!this.ls || this.ls.id !== vic.id) { this.ls = { id: vic.id, t: 0 }; const foe = this.nearestFoe(vic); if (foe) this.dir.setShot('duel', { a: vic.id, b: foe.id, side: 1 }, 0.6); }
      this.ls.t += realDt; if (this.ls.t > 7) { this.lsCool = 12; this.endLastStand(); } else target = 1;   // never a permanent slow-mo: 7 s at most, then a 12 s cooldown
    } else if (this.ls) this.endLastStand();
    this.lsK += (target - this.lsK) * (1 - Math.exp(-realDt * 5));
    return 1 - (this.feel.state.reducedMotion ? 0.15 : 0.45) * this.lsK;
  }
  endLastStand() { this.ls = null; if (this.dir.shot && this.dir.shot.name === 'duel') this.dir.setShot('follow', {}, 0.8); }

  introStep(realDt, dt) {
    const F = this.F; const k = clamp(this.phaseT / 4.2, 0, 1); const e = k * k * (3 - 2 * k);
    if (this.phaseT > 2.0 && !this.gateOpen) { this.gateOpen = true; this.arena.setGate(1, 0); this.arena.setGate(1, 1); }
    if (this.phaseT > 2.9 && this.dir.pose.shot === 'establishing') this.dir.setShot('gate', { gateAngle: 0, dur: 1.6 }, 0.5);
    for (const f of this.fm.values()) {
      const u = f.u; const x = f.intro.x + (f.intro.tx - f.intro.x) * e; f.rx = x; f.ry = u.y; f.px0 = x; f.pz0 = u.y;
      const speed = (f.intro.tx - f.intro.x) * (6 * k * (1 - k)) / 4.2;
      f.vx = speed; f.vz = 0; f.yaw = u.side === 'A' ? Math.PI / 2 : -Math.PI / 2;
      const fwd = Math.abs(speed); f.rig.animator.setMove(fwd, 0); f.rig.root.position.set(x, 0, u.y); f.rig.root.rotation.y = f.yaw; f.rig.update(dt);
    }
    if (k >= 1) { this.phase = 'fight'; this.phaseT = 0; this.dir.setShot('follow', {}, 1.0); this.banner('FIGHT!', 'ult'); this.audio.sfx('drum'); this.feel.impact && this.feel.impact('roar', {}); for (const f of this.fm.values()) { f.rx = f.u.x; f.ry = f.u.y; } }
  }

  endFight() {
    const F = this.F; this.phase = 'outro'; this.outroT = 0;
    const win = F.winner;
    if (F.replay) F.replay.total = F.n || 0;                       // the replay scrubber needs the length of the fight
    this.ultBar.style.visibility = 'hidden'; if (this.extras) this.extras.style.visibility = 'hidden';
    for (const f of this.fm.values()) { if (!f.u.down && f.u.side === win) f.rig.animator.setState('victory'); }
    if (this.execPending && !this.forfeited && !this.skip && this.startExec()) return;   // the sim's last blow is staged as an execution (see startExec)
    this.execPending = null;
    const alive = F.units.filter((u) => u.side === win && !u.down)[0];
    const lastDown = F.units.filter((u) => u.down && u.side !== win).pop();
    if (this.forfeited) this.dir.setShot('victory', { winner: alive && alive.id }, 1.0);
    else this.dir.cue('kill', { victim: lastDown && lastDown.id, killer: alive && alive.id, extra: lastDown && this.gore.framePoints(lastDown.id), next: { name: 'victory', p: { winner: alive && alive.id }, blend: 1.2 } });
    this.audio.music.setMode(win === 'A' ? 'victory' : 'defeat'); this.audio.sfx(win === 'A' ? 'levelUp' : 'deathThud'); this.audio.sfx(win === 'A' ? 'crowdRoar' : 'crowdBoo');
    this.showEnd(win === 'A');
  }

  // ---------------------------------------------------------------- finisher: the sim's last blow staged as an execution
  // Presentation only. The sim has already ended (F.done) when its final 'down' event arrives, so nothing is held or changed: the victim kneels, the
  // killer walks up (visual position blend), the crowd hushes, the finisher clip lands and its 'hit' event triggers the death, the gore and the roar.
  // Duels won by the player are not struck (mercy is decided in the results dialog): the victim kneels and the winner stands over them.
  canExec(src, dst) {
    if (!src || !dst || this.forfeited || this.skip) return false;
    const m = this.F.meta; if (m && NO_EXEC.has(m.kind)) return false;
    const fs = this.fm.get(src.id), fd = this.fm.get(dst.id); if (!fs || !fd) return false;
    const as = fs.rig.animator, ds = fd.rig.animator; if (!as.clips || !as.clips.finisher || !ds.clips || !ds.clips.execKneel) return false;   // beast rigs have no finisher clips
    if (src.down || (src.s && (src.s.stun || src.s.spin || src.s.air)) || fs.air || fd.air || fd.spin) return false;
    if (this.t - (this.bigAoeT ?? -9) < 0.8) return false;         // an ultimate that gibs is its own finale
    return Math.hypot(src.x - dst.x, src.y - dst.y) <= 6;           // ranged kills keep the plain fall
  }
  startExec() {
    const P = this.execPending; this.execPending = null; if (!P) return false;
    const F = this.F, src = P.src, dst = P.dst, fs = this.fm.get(src.id), fd = this.fm.get(dst.id), win = F.winner;
    let dx = fs.rx - fd.rx, dz = fs.ry - fd.ry; const dist = Math.hypot(dx, dz) || 1; dx /= dist; dz /= dist;
    const tx = fd.rx + dx * 1.1, tz = fd.ry + dz * 1.1, mercy = !!(F.meta && F.meta.kind === 'duel' && win === 'A');
    const ex = this.ex = { src, dst, fs, fd, stage: 'approach', t: 0, scale: 0.8, hit: false, ended: false, done: false, mercy, win, sT: 0, dx, dz, back: false };
    // victim: kneels in place, facing the executioner (no stale sim states may fire on it)
    fd.kneel = true; fd.guarding = false; fd.st = ''; fd.air = false; fd.spin = false; fd.faceTo = { x: tx, z: tz }; this.dropHandles(dst.id);
    fd.rig.animator.executed();
    // killer: walks to 1.1 m in front of the victim and faces it
    fs.faceTo = { x: fd.rx, z: fd.ry }; fs.ov = { x0: fs.rx, z0: fs.ry, x1: tx, z1: tz, t: 0, dur: Math.max(0.4, Math.min(1.7, (dist - 1.1) / 2.4)) }; fs.rig.animator.setState('move');
    const an = fs.rig.animator, prev = an.onEvent;
    an.onEvent = (n, clip) => { if (prev) prev(n, clip); if (clip && clip.name === 'finisher') { if (n === 'hit') this.execHit(); else if (n === 'end') ex.ended = true; } };
    ex.restoreEv = () => { if (an.onEvent !== prev) an.onEvent = prev; };
    // crowd hush, music drops, kill camera frames the pair side-on for the whole sequence
    this.audio.crowd(0.08); this.audio.music.setIntensity(0.1); this.audio.duck && this.audio.duck(0.55, 2.2);
    this.dir.cue('kill', { victim: dst.id, killer: src.id, dur: 5.5, next: null, tight: true });
    this.bump = 0;
    return true;
  }
  execStep(dt, realDt) {
    const ex = this.ex; if (!ex || ex.done) return; ex.t += realDt; const fs = ex.fs, an = fs.rig.animator;
    if (ex.t > 9) { this.execDone(); return; }   // safety net: never strand the outro
    if (ex.stage === 'approach') {
      ex.scale = 0.75 + 0.25 * smooth01(ex.t / 0.9);
      if (!fs.ov || fs.ov.t >= fs.ov.dur) this.execStrike();
    } else if (ex.mercy) { ex.scale = 1; ex.sT += realDt; if (ex.sT > 2.1) this.execDone(); }
    else {
      const a = an.action && an.action.name === 'finisher' ? an.actionT : -1;   // clip time of the finisher (swing at 0.5, hit at 0.62)
      ex.scale = ex.hit ? 1 : a < 0.3 ? 0.8 : a < 0.52 ? 0.28 : 0.5;          // the raised blade hangs in slow motion, the swing follows at half speed
      if (ex.hit && !ex.back && a >= 0.98) { ex.back = true; fs.ov = { x0: fs.rx, z0: fs.ry, x1: fs.rx + ex.dx * 0.95, z1: fs.ry + ex.dz * 0.95, t: 0, dur: 1.1 }; }   // step back off the corpse (the body falls toward the killer)
      if (ex.ended || (ex.hit && a < 0 && ex.t > ex.hitAt + 0.5)) this.execDone();
    }
  }
  execStrike() {
    const ex = this.ex, an = ex.fs.rig.animator; ex.stage = 'strike';
    if (ex.mercy) { an.setState('victory'); this.showVerdict('wait'); this.audio.sfx('horn', { gain: 0.6 }); return; }
    an.finisher({ fade: 0.25 }); this.showVerdict('down');
  }
  /** the finisher's 'hit' event: the victim dies, the blood flies, the crowd roars */
  execHit() {
    const ex = this.ex; if (!ex || ex.hit) return; ex.hit = true; ex.hitAt = ex.t;
    const { src, dst, fs, fd } = ex, F = this.F, fx = this.fx, A = this.audio, dir = this.dirOf(src, dst), pan = clamp(dst.x / 12, -1, 1);
    fd.kneel = false; fd.rig.animator.executeKill(); fd.rig.flash(0.15, '#8a5530'); fs.rig.animator.hitStop(0.07);
    fx.hit(this.chest(dst), dir, { dmgFrac: 0.4, crit: true, flesh: this.gore.on }); fx.dust(this.feet(dst), 14); fx.debris && fx.debris(this.feet(dst), 4); fx.groundDecal(this.feet(dst), 'scuff', { size: 1.6 });
    this.num(dst, 'DOWN', 'miss'); this.feel.impact('finalKill', {}); if (this.post.zoomPunch) this.post.zoomPunch(0.028);
    A.sfx('swordHitCrit', { pan }); A.sfx('deathCry', { voice: VOICE[dst.style] ?? 0, pan }); this.after(350, () => A.sfx('deathThud', { pan })); A.sfx('crowdGasp');
    if (this.gore.on) { const lh = fd.lastHit; this.gore.onDown(dst.id, { last: true, crit: true, frac: lh ? Math.max(0.25, lh.frac) : 0.3, dx: dir.x, dz: dir.z, big: false, mine: dst.side === 'A', noSrc: false });
      if (this.dir.shot && this.dir.shot.name === 'kill') this.dir.shot.p.extra = this.gore.framePoints(dst.id); }   // keep a flung head in the kill shot
    this.hideVerdict(); this.execFinale(ex.win);
  }
  /** crowd: hush (set at the start), then the roar (or the boos) and the result music */
  execFinale(win) {
    this.after(650, () => { this.audio.crowd(0.95); this.audio.music.setMode(win === 'A' ? 'victory' : 'defeat'); this.audio.sfx(win === 'A' ? 'levelUp' : 'deathThud', { gain: 0.8 }); this.audio.sfx(win === 'A' ? 'crowdRoar' : 'crowdBoo'); });
  }
  execDone() {
    const ex = this.ex; if (!ex || ex.done) return; ex.done = true; ex.restoreEv && ex.restoreEv(); this.hideVerdict();
    if (ex.mercy) this.execFinale(ex.win);
    for (const f of this.fm.values()) if (!f.u.down && f.u.side === ex.win) f.rig.animator.setState('victory');
    this.dir.setShot('victory', { winner: ex.src.id }, 1.2); this.showEnd(ex.win === 'A');
  }
  showVerdict(kind) {
    this.hideVerdict(); const win = this.F.winner === 'A', el = this.verdictEl = document.createElement('div'); el.className = 'lx-fv-verdict lx-fv-v-' + kind;
    el.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path fill="currentColor" d="M10 28h10v26H10zM24 28l9-18c3-1 6 1 6 5v10h14c3 0 5 3 4 6l-5 19c-1 3-3 4-6 4H24z"/></svg><span></span>';
    el.lastChild.textContent = kind === 'wait' ? 'The crowd waits for your word' : win ? 'The crowd demands blood' : 'The crowd turns its thumbs down'; this.hud.append(el);
  }
  hideVerdict() { const el = this.verdictEl; if (!el) return; this.verdictEl = null; el.classList.add('lx-fv-v-out'); setTimeout(() => el.remove(), 500); }
  /** deferred call that dies with the fight (and is skipped while seeking a replay) */
  after(ms, fn) { const ep = this.epoch; setTimeout(() => { if (ep === this.epoch && !this.paused) fn(); }, ms); }

  /** big VICTORY / DEFEAT title: arrives after the kill cam has shown the blow (CSS delay), stays until the results hand-off */
  showEnd(win) {
    this.clearEnd(); const el = this.endEl = document.createElement('div'); el.className = 'lx-fv-end ' + (win ? 'lx-fv-win' : 'lx-fv-lose');
    const k = document.createElement('span'); k.textContent = win ? 'The crowd roars' : 'The crowd falls silent'; const b = document.createElement('b'); b.textContent = win ? 'VICTORY' : 'DEFEAT'; el.append(k, b); this.hud.append(el);
  }
  clearEnd() { if (this.endEl) { this.endEl.remove(); this.endEl = null; } }

  // Establishing flyover is authored here (the director frames fighters; this one frames the bowl): sweep in from above the gate to hero height.
  introPose(t) {
    const k = clamp(t / 3.0, 0, 1), e = k * k * (3 - 2 * k), tall = Number.isFinite(this.dir.tall) ? this.dir.tall : 0;
    const a = [-16, 31, 47], b = [-17.5 - 3 * tall, 3.4 + 0.6 * tall, 8.5 - 5 * tall], pos = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * e);
    pos[0] += Math.sin(k * 3.1) * 3; const look = { x: 1 * e, y: 6 - 4.6 * e, z: -2 * (1 - e) };
    return { pos: { x: pos[0], y: pos[1], z: pos[2] }, look, fov: 48 + tall * 12, timeScale: 1 };
  }

  applyCamera(pose) {
    if (this.phase === 'intro' && this.phaseT < 3.0) pose = this.introPose(this.phaseT);
    const c = this.camera; c.position.set(pose.pos.x, pose.pos.y, pose.pos.z); c.lookAt(pose.look.x, pose.look.y, pose.look.z);
    if (Math.abs(c.fov - pose.fov) > 0.01) { c.fov = pose.fov; c.updateProjectionMatrix(); }
    this.feel.setBaseFov(pose.fov); this.feel.apply(c); c.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- actors
  syncFighters(dt, simulating) {
    const k = 1 - Math.exp(-dt * 14);
    for (const f of this.fm.values()) {
      const u = f.u, rig = f.rig, an = rig.animator, dn = u.down && !f.kneel, pu = f.pu;   // dn: visually down (an executed fighter kneels first)
      // base render position: the sim position (30 Hz) through a short low-pass, or a scripted blend (the executioner's walk-up)
      if (f.ov) { const o = f.ov; o.t += dt; const e = smooth01(o.t / o.dur); f.rx = o.x0 + (o.x1 - o.x0) * e; f.ry = o.z0 + (o.z1 - o.z0) * e; }
      else { const px = f.rx ?? u.x, py = f.ry ?? u.y; f.rx = px + (u.x - px) * k; f.ry = py + (u.y - py) * k; }
      // weight: hits shove the fighter along the blow (visual spring on top of the sim position, the sim never moves), then it settles back
      this.stepPush(f, dt);
      let X = f.rx + pu.x, Z = f.ry + pu.z; { const r = Math.hypot(X, Z), r0 = Math.hypot(f.rx, f.ry); if (r > 13 && r > r0) { const q = Math.max(13, r0) / r; X *= q; Z *= q; } }  // never shoved through the wall
      let ivx = (X - f.px0) / Math.max(dt, 1e-4), ivz = (Z - f.pz0) / Math.max(dt, 1e-4); if (Math.hypot(X - f.px0, Z - f.pz0) > 2.5) ivx = ivz = 0; f.px0 = X; f.pz0 = Z;
      f.vx += (ivx - f.vx) * 0.25; f.vz += (ivz - f.vz) * 0.25;   // visual velocity (shove included): the gait steps while a fighter is pushed or recovers, so feet are planted by stepping, not skating
      // facing: toward target (scripted for the execution pair)
      const tgt = u.tgt && this.fm.get(u.tgt); let want = f.yaw;
      if (f.faceTo) want = Math.atan2(f.faceTo.x - f.rx, f.faceTo.z - f.ry);
      else if (!dn && tgt && !tgt.u.down) want = Math.atan2(tgt.rx - f.rx, tgt.ry - f.ry); else if (!dn) want = Math.atan2(u.face, 0);
      if (f.faceTo || (!dn && !u.s.stun)) { let d = want - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += d * (1 - Math.exp(-dt * (f.faceTo ? 9 : 12))); }
      const fx_ = Math.sin(f.yaw), fz_ = Math.cos(f.yaw), lx_ = Math.cos(f.yaw), lz_ = -Math.sin(f.yaw);
      const vf = f.vx * fx_ + f.vz * fz_, vl = f.vx * lx_ + f.vz * lz_;
      if (!dn) an.setMove(Math.abs(vf) < 0.15 ? 0 : vf, Math.abs(vl) < 0.15 ? 0 : vl);
      rig.root.position.set(X, 0, Z); rig.root.rotation.y = f.yaw;
      // persistent states from the sim
      if (!dn) {
        const stunned = !!(u.s.stun), guarding = !!(u.s.guard), spinning = !!u.s.spin;
        if (stunned && f.st !== 'stun') { an.setState('stun'); f.st = 'stun'; }
        else if (!stunned && f.st === 'stun') { an.setState('move'); f.st = ''; }
        if (guarding && !f.guarding) { an.play('block'); f.guarding = true; } else if (!guarding && f.guarding) { an.release(); f.guarding = false; }
        if (u.s.air && !f.air) { if (an.knockdown) an.knockdown(1); else an.play('knockdown'); f.air = true; } else if (!u.s.air && f.air) { if (an.getUp) an.getUp(); else an.play('getup'); f.air = false; }
        if (spinning && !f.spin) { an.play('attack3', { speed: 2.4 }); f.spin = true; } else if (!spinning) f.spin = false;
      }
      rig.update(dt);
      // plate
      f.hpShown += (u.hp - f.hpShown) * 0.2; f.plate.hp && f.plate.hp.set(u.hp, u.maxhp);
      const head = new THREE.Vector3(X, (rig.nameH || 2.05) * (rig.root.scale.y || 1), Z); // BEAST: rig.nameH = beast height
      this.placePlate(f.plate, head, this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
      f.plate.style.opacity = dn || this.phase === 'intro' || this.phase === 'outro' ? 0.0 : 1;
    }
  }

  /** critically damped spring (w = 5 /s) on the visual shove offset; peak offset = v / (w e) metres for an impulse of v m/s (a heavy crit about 0.4 m) */
  stepPush(f, dt) {
    const p = f.pu; if (!p.vx && !p.vz && !p.x && !p.z) return; const w = 5, n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (let i = 0; i < n; i++) { p.vx += (-w * w * p.x - 2 * w * p.vx) * h; p.vz += (-w * w * p.z - 2 * w * p.vz) * h; p.x += p.vx * h; p.z += p.vz * h; }
    const m = Math.hypot(p.x, p.z); if (m > 0.9) { p.x *= 0.9 / m; p.z *= 0.9 / m; }
    if (Math.abs(p.x) + Math.abs(p.z) + Math.abs(p.vx) + Math.abs(p.vz) < 0.003) { p.x = p.z = p.vx = p.vz = 0; return; }
    const sp = Math.hypot(p.vx, p.vz); f.skidT -= dt;
    if (sp > 1.4 && f.skidT <= 0 && !this.silent) { f.skidT = 0.09; this.fx.kickup(new THREE.Vector3(f.rx + p.x, 0.05, f.ry + p.z), new THREE.Vector3(p.vx / sp, 0, p.vz / sp), 2, { size: 0.45 }); }  // heel dust while the shove is fast
  }
  /** shove fighter f along (dir.x, dir.z) with an impulse of v m/s (presentation only). Big shoves also drag a short skid mark through the sand. */
  shove(f, dir, v) {
    if (!f || !(v > 0.05)) return; if (this.feel.state.reducedMotion) v *= 0.5; const m = Math.hypot(dir.x, dir.z) || 1; f.pu.vx += dir.x / m * v; f.pu.vz += dir.z / m * v;
    if (v >= 3.2 && !this.silent && this.t - (f.skidAt ?? -9) > 0.5) { f.skidAt = this.t; this.fx.groundDecal({ x: f.rx, y: 0, z: f.ry }, 'skid', { len: v / 14 + 0.25, angle: Math.atan2(dir.z, dir.x), size: 0.6 }); }
  }

  /** HUD rectangles nameplates must stay out of (top button row, Crowd's Favor / ult buttons). Refreshed a few times a second. */
  measureHud() {
    const R = (el) => { if (!el || !el.isConnected || !el.offsetParent && el.style.display === 'none') return null; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; };
    const hb = this.host.getBoundingClientRect(), rel = (b) => b && { l: b.left - hb.left, r: b.right - hb.left, t: b.top - hb.top, b: b.bottom - hb.top };
    const kids = [...this.topRow.children].map(R).filter(Boolean), bot = [];
    let top = null; if (kids.length) top = { l: Math.min(...kids.map((b) => b.left)) - hb.left - 4, r: Math.max(...kids.map((b) => b.right)) - hb.left + 4, t: 0, b: Math.max(...kids.map((b) => b.bottom)) - hb.top + 4 };
    for (const el of [this.extras && [...this.extras.children].filter((c) => c.style.display !== 'none')[0] && this.extras, ...this.ultBar.children]) { const r = rel(R(el)); if (r) bot.push(r); }
    this.avoid.top = top; this.avoid.bottom = bot; this.avoid.sat = top ? Math.max(0, top.b - 40) : 0;
  }
  /** project the head, then slide the plate so it never covers the top button row or the bottom ult buttons, and never leaves the screen */
  placePlate(plate, head, w, h) {
    const cam = this.camera, p = head.clone(); p.y += 0.35; p.project(cam);
    const vis = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
    if ((this.avoid.n++ % 20) === 0) this.measureHud();
    const PW = w < 420 ? 112 : 136, PH = 44, gx = 6; let x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h; // y = bottom edge of the plate
    x = clamp(x, PW / 2 + gx, w - PW / 2 - gx);
    const T = this.avoid.top, sat = this.avoid.sat || 0;
    if (T && x + PW / 2 > T.l && x - PW / 2 < T.r && y - PH < T.b) y = T.b + PH;
    for (const B of this.avoid.bottom) if (x + PW / 2 > B.l && x - PW / 2 < B.r && y > B.t - 6) y = B.t - 6;
    y = clamp(y, PH + 4 + sat, h - 6);
    plate.place(x, y, vis); plate.style.setProperty('--lx-s', Math.max(0.7, Math.min(1.1, 1.15 - p.z * 0.6)).toFixed(2));
  }

  chest(u, y = 1.25) { const f = this.fm.get(u.id); return new THREE.Vector3(f ? (f.rx ?? u.x) : u.x, y, f ? (f.ry ?? u.y) : u.y); }
  feet(u) { return this.chest(u, 0.05); }
  dirOf(a, b) { const v = new THREE.Vector3(b.x - a.x, 0, b.y - a.y); if (v.lengthSq() < 1e-6) v.set(a.face || 1, 0, 0); return v.normalize(); }
  unitById(id) { return this.F.units.find((x) => x.id === id); }
  col(u) { return D().STYLES[u.style].c; }

  // ---------------------------------------------------------------- events
  consume() {
    const F = this.F, evs = F.ev.splice(0, F.ev.length);
    for (const e of evs) { try { this.onEvent(e); } catch (err) { console.error('event', e.k, err); } }
  }

  onEvent(e) {
    const F = this.F, fx = this.fx, A = this.audio, feel = this.feel;
    const src = e.src ? this.unitById(e.src) : null, dst = e.dst ? this.unitById(e.dst) : null;
    const fs = src && this.fm.get(src.id), fd = dst && this.fm.get(dst.id);
    const pan = (u) => clamp((u.x) / 12, -1, 1);
    switch (e.k) {
      case 'atk': {
        if (src && src.beast) { BF.atk(this, e, src, dst, fs); break; } // BEAST
        if (!fs || !dst) break; const an = fs.rig.animator; const rig = fs.rig;
        const name = fs.atkN++ % 5 === 4 && (src.style === 'murmillo' || src.style === 'hoplomachus' || src.style === 'dimachaerus') ? 'attack3' : (fs.atkN % 2 ? 'attack1' : 'attack2');
        const info = an.clipInfo(name) || { hitAt: 0.27 }; const wind = Math.min(0.22, 0.4 / L().apsOf(src));
        an.play(name, { speed: clamp(info.hitAt / wind, 0.8, 3.2) }); rig.squashKick && rig.squashKick(-0.04);
        const dir = this.dirOf(src, dst), c = this.col(src);
        fx.later(wind * 0.5, () => { if (!F.done) { fx.slash(this.chest(src, 1.3), dir, c, src.style === 'hoplomachus' || src.style === 'retiarius' ? 2.6 : 2.1); A.sfx('swish', { pan: pan(src), heavy: src.style === 'murmillo' }); } });
        break;
      }
      case 'hit': {
        if (!dst) break; const frac = e.dmg / dst.maxhp, dir = src ? this.dirOf(src, dst) : new THREE.Vector3(0, 0, 1);
        if (e.hz) { this.num(dst, e.dmg + ' FIRE', 'fire'); fx.spark(this.chest(dst), new THREE.Vector3(0, 1, 0), 10, '#ffb347'); feel.addTrauma && feel.addTrauma(0.12); A.sfx('dust', { pan: pan(dst) }); this.flashHurt(fd, 0.1); break; }
        fx.hit(this.chest(dst), dir, { dmgFrac: frac, crit: !!e.crit, color: src ? this.col(src) : undefined, flesh: this.gore.on && !(dst.s && dst.s.guard) });
        this.num(dst, e.crit ? 'CRIT ' + e.dmg : String(e.dmg), e.crit ? 'crit' : (e.tech && !e.basic ? 'tech' : 'dmg'));
        if (e.save) this.num(dst, e.save, 'block');
        feel.impact('hit', { dmgFrac: frac, crit: !!e.crit, mine: dst.side === 'A', dir, color: src ? this.col(src) : undefined });
        if (e.crit && frac > 0.2) this.caPulse(0.003);
        if (fd) {
          this.flashHurt(fd, frac); const an = fd.rig.animator, ld = fd.rig.localDir ? fd.rig.localDir(-dir.x, -dir.z) : 1; // direction from the victim toward the attacker, in the victim's frame
          if (!(dst.s && dst.s.guard)) { an.hurt(ld, clamp(0.55 + frac * 3, 0.5, 1.6)); if (frac > 0.22 && an.stagger && !(dst.s && dst.s.air)) an.stagger(ld); } else an.hurt(ld, 0.8);
          // weight: the blow shoves the body along its direction (guarding fighters give less ground); heavier styles move less
          this.shove(fd, dir, clamp((dst.s && dst.s.guard ? 0.8 + frac * 2 : (frac > 0.03 ? 1.0 + frac * 6.5 : 0.6) + (e.crit ? 1.6 : 0)) / (MASS[dst.style] || 1), 0, 7));
        }
        if (fs && frac > 0.08) fs.rig.animator.hitStop(0.04);
        if (!(src && src.beast)) A.sfx(e.crit ? 'swordHitCrit' : (e.save || (dst.s && dst.s.guard)) ? 'shieldBlock' : 'swordHit', { pan: pan(dst) }); // BEAST: bites and claws have their own sounds
        if (src && src.beast || dst.beast) BF.hitFx(this, e, src, dst, fd); // BEAST
        if (!dst.beast && Math.random() < 0.6) A.sfx('hurt', { voice: VOICE[dst.style] ?? 0, pan: pan(dst) });
        if (src && !src.beast && Math.random() < 0.25) A.sfx('grunt', { voice: VOICE[src.style] ?? 0, pan: pan(src) });
        if (this.gore.on) { this.gore.onHit(dst.id, { pos: this.chest(dst), dx: dir.x, dz: dir.z, frac, crit: !!e.crit, blocked: !!(dst.s && dst.s.guard), lethal: !!dst.down, hpFrac: dst.hp / dst.maxhp, attacker: src && src.id, mine: dst.side === 'A' }); }
        if (fd) { fd.lastHit = { frac, crit: !!e.crit, dx: dir.x, dz: dir.z }; fd.lastHitT = this.t; }
        this.recent += frac * 2 + (e.crit ? 0.25 : 0); this.lastHitT = this.t;
        this.arena.setHype(clamp(F.hype / 100 + 0.25, 0, 1));
        break;
      }
      case 'miss': if (dst) { this.num(dst, e.inv ? 'IMMUNE' : 'DODGE', 'miss'); fx.kickup(this.feet(dst), src ? this.dirOf(src, dst) : new THREE.Vector3(1, 0, 0), 4); A.sfx(e.inv ? 'metalClang' : 'miss', { pan: pan(dst) }); } break;
      case 'whiff': if (src) A.sfx('swish', { pan: pan(src), gain: 0.5 }); break;
      case 'tech': if (src) { this.num(src, (D().TECHS[e.tech] || {}).n + '!', 'tech'); fx.ring(this.feet(src), '#f5ead2', 1.8); A.sfx('uiConfirm', { gain: 0.5 }); if (fs) { const an = fs.rig.animator; an.play('attack3', { speed: 1.9 }); } } break;
      case 'dash': if (src) { fx.kickup(this.feet(src), new THREE.Vector3(src.face, 0, 0), 8); A.sfx('dust', { pan: pan(src) }); A.sfx('footstep', { pitch: 0.9 }); fx.trail && fx.trail(fs ? fs.rig.root : this.chest(src), this.col(src)); } break;
      case 'proj': if (src && dst) { const from = this.chest(src), to = this.chest(dst); fx.shoot(from, e.long ? from.clone().add(to.clone().sub(from).normalize().multiplyScalar(26)) : to, e.c || this.col(src), { speed: e.long ? 40 : 22, size: e.long ? 0.34 : 0.26 }); A.sfx('swish', { pitch: 1.3, heavy: !!e.long, pan: pan(src) }); if (fs) fs.rig.animator.play('attack3', { speed: 1.8 }); } break;
      case 'aoe': {
        const pos = new THREE.Vector3(e.x, 0.05, e.y), c = e.c || '#f5ead2';
        if (e.big) this.bigAoeT = this.t;
        if (e.big) { fx.shockwave(pos, e.r, c); fx.dust(pos, 18); fx.debris && fx.debris(pos, 10); fx.groundDecal(pos, e.meteor ? 'scorch' : 'crater', { size: e.r * 1.3 }); feel.impact('aoe', { big: true }); A.sfx('ultEarth', { gain: 0.8 }); }
        else { fx.ring(pos, c, e.r); fx.dust(pos, 8); A.sfx('drum', { gain: 0.5 }); }
        if (e.meteor) { fx.ult.impact('fire', pos, e.r); feel.impact('meteor', {}); this.caPulse(0.006); }
        if (e.big) for (const f of this.fm.values()) { if (f.u.down) continue; const ddx = (f.rx ?? f.u.x) - e.x, ddz = (f.ry ?? f.u.y) - e.y, d = Math.hypot(ddx, ddz), reach = e.r * 1.5 + 1; if (d < reach) this.shove(f, d < 0.05 ? { x: f.u.side === 'A' ? -1 : 1, z: 0 } : { x: ddx, z: ddz }, 6.5 * (1 - d / reach) / (MASS[f.u.style] || 1)); }
        break;
      }
      case 'tele': { const h = fx.tele(new THREE.Vector3(e.x, 0.05, e.y), e.r, e.t, e.c || '#e8742a'); (this.teles = this.teles || []).push(h); if (e.haz) this.banner('Fire jets! Get out of the red circle', 'info'); else this.meteorFall(e); break; }
      case 'zap': if (src && dst) { fx.zap(this.chest(src), this.chest(dst), '#a8d8ff'); feel.addTrauma && feel.addTrauma(0.1); A.sfx('ultLightning', { gain: 0.4 }); } break;
      case 'hook': if (src && dst) { fx.chain(this.chest(src), this.chest(dst), '#d9e4ee'); fx.shoot(this.chest(src), this.chest(dst), '#eef4fa', { speed: 70, size: 0.22 }); fx.hit(this.chest(dst), this.dirOf(src, dst), { dmgFrac: 0.1 }); A.sfx('netThrow', { pan: pan(src) }); } break;
      case 'bleed': if (dst && e.dmg >= 3) this.num(dst, '-' + e.dmg, e.fire ? 'fire' : 'thorn'); if (dst && !e.fire && this.gore.on) this.gore.onBleed(dst.id, e.dmg); break;
      case 'thorn': if (dst) this.num(dst, e.dmg + ' THORNS', 'thorn'); break;
      case 'status': this.onStatus(e, dst); break;
      case 'resist': if (dst) this.num(dst, 'RESIST', 'status'); break;
      case 'heal': if (dst) { fx.heal(this.chest(dst), clamp(e.amt / dst.maxhp * 40, 6, 16)); this.num(dst, '+' + e.amt, 'heal'); A.sfx('healSparkle', { pan: pan(dst), gain: 0.7 }); } break;
      case 'rune': if (src) { this.num(src, (e.id || 'RUNE').toUpperCase(), 'status'); fx.ring(this.feet(src), '#f2c14e', 1.6); } break;
      case 'ult': {
        const el = ULT_EL[e.id] || COLOR_EL(e.c); const name = (D().ULTS[e.id] || (D().DUOS && D().DUOS[(e.id || '').slice(4)]) || { n: e.id }).n;
        if (src) { fx.ult.cast(el, this.feet(src)); fx.ring(this.feet(src), e.c, 2.2); if (fs) { fs.rig.animator.play('attack3', { speed: 1.4 }); fs.rig.flash(0.2, e.c); } }
        feel.impact('ult', { color: e.c }); this.banner(name + '!', 'ult'); A.sfx('ult', { element: el }); this.after(600, () => A.sfx('crowdRoar', { gain: 0.8 }));
        if (src && src.side === 'A' && F.manualFavor !== undefined) { const t = this.nearestFoe(src); t && this.dir.cue('ultimate', { unit: src.id, target: t.id }); }
        else if (src) { const t = this.nearestFoe(src); t && this.dir.cue('ultimate', { unit: src.id, target: t.id }); }
        this.recent += 0.5; this.bump = 0.35;
        if (e.id === 'tornado') this.ultSustain(src, 'wind', 3); else if (e.id === 'bloodrage') this.ultSustain(src, 'fire', 6);
        else if (e.id === 'unbreakable') fx.aura(fs ? fs.rig.root : this.chest(src), '#9a6ad8', 6, { kind: 'guard' });
        break;
      }
      case 'down': if (dst) {
        const last = !F.units.some((u) => u.side === dst.side && !u.down && u !== dst);
        if (last && this.canExec(src, dst)) { this.execPending = { src, dst }; this.bump = 0.4; break; }   // staged as an execution once the fight view reaches endFight (startExec)
        fx.hit(this.chest(dst), src ? this.dirOf(src, dst) : new THREE.Vector3(1, 0, 0), { dmgFrac: 0.4, crit: true, flesh: this.gore.on }); fx.dust(this.feet(dst), 14); fx.debris && fx.debris(this.feet(dst), 4); fx.groundDecal(this.feet(dst), 'scuff', { size: 1.6 });
        this.num(dst, 'DOWN', 'miss'); feel.impact(last ? 'finalKill' : 'kill', {}); if (last && this.post.zoomPunch) this.post.zoomPunch(0.028);
        if (fd) { const an = fd.rig.animator, dd0 = src ? this.dirOf(src, dst) : null, ld = dd0 && fd.rig.localDir ? fd.rig.localDir(-dd0.x, -dd0.z) : 1; if (an.die) an.die(ld, { heavy: !!(fd.lastHit && (fd.lastHit.crit || fd.lastHit.frac > 0.3)) }); else an.play('death'); this.dropHandles(dst.id); fd.rig.flash(0.15, '#8a5530'); this.shove(fd, src ? this.dirOf(src, dst) : { x: 1, z: 0 }, 4 / (MASS[dst.style] || 1)); }
        if (dst.beast) BF.down(this, dst); else { A.sfx('deathCry', { voice: VOICE[dst.style] ?? 0, pan: pan(dst) }); this.after(350, () => A.sfx('deathThud', { pan: pan(dst) })); A.sfx('crowdGasp'); } this.bump = 0.4; // BEAST
        if (this.gore.on) { const lh = fd && fd.lastHit, dd = src ? this.dirOf(src, dst) : new THREE.Vector3(1, 0, 0); this.gore.onDown(dst.id, { last, crit: !!(lh && lh.crit) && !!src, frac: lh ? lh.frac : 0.15, dx: lh ? lh.dx : dd.x, dz: lh ? lh.dz : dd.z, big: this.t - (this.bigAoeT ?? -9) < 0.7, mine: dst.side === 'A', noSrc: !src }); }
        if (!last) this.dir.cue('kill', { victim: dst.id, killer: src && src.id, extra: this.gore.framePoints(dst.id) });
      } break;
      case 'revive': if (dst) { fx.ult.impact('holy', this.feet(dst), 2.4); feel.impact('revive', {}); this.num(dst, 'REVIVE!', 'tech'); A.sfx('healSparkle'); A.sfx('horn'); if (fd) { fd.rig.animator.dead = false; fd.rig.animator.setState('move'); fd.rig.animator.play('getup'); } } break;
      case 'roar': feel.impact('roar', {}); A.sfx(e.fav ? 'crowdCheer' : 'crowdRoar'); this.arena.setWave(1); this.after(3500, () => this.arena.setWave(0)); this.banner(e.fav ? "Crowd's Favor!" : D().CHANTS[(F.peak | 0) % D().CHANTS.length], e.fav ? 'ult' : 'info'); this.recent += 0.2; break;
      case 'beast': BF.event(this, e, src, dst, fs, fd); break; // BEAST: roar, howl, enrage, telegraph, charge, land, stomp, javelin
      case 'favorready': this.banner("Crowd's Favor ready!", 'ult'); A.sfx('crowdCheer'); break;
      default: break;
    }
  }

  /** small chromatic-aberration pulse on the post pass (post.js decays it in ~0.15 s); capped so stills never show rainbow fringes */
  caPulse(a) { if (this.post.pulseCA && !(this.post._caPulse > a)) this.post.pulseCA(Math.min(a, 0.006)); }
  /** meteor: a rock streaks in from the sky and lands exactly when the telegraph disc fills (anticipation, travel, impact) */
  meteorFall(e) {
    const to = new THREE.Vector3(e.x, 0.4, e.y), from = to.clone().add(new THREE.Vector3(-9, 26, -6)), T = Math.max(0.3, (e.t || 1.2) - 0.04);
    const h = this.fx.shoot(from, to, e.c || '#ff9a3a', { speed: from.distanceTo(to) / T, size: 0.62 }); this.audio.sfx('swish', { pitch: 0.5, gain: 0.6, heavy: true }); return h;
  }

  /** floating number with per-target stacking so simultaneous numbers fan out instead of overlapping */
  num(u, text, kind) {
    const f = this.fm.get(u.id); const now = this.t; f.nums = (f.nums || []).filter((x) => now - x < 0.7); const k = f.nums.length; f.nums.push(now);
    const p = this.chest(u, 1.95 + 0.34 * Math.min(k, 5)); p.x += ((k % 2) ? 1 : -1) * 0.18 * Math.min(k, 3); this.fx.number(p, text, kind);
  }
  nearestFoe(u) { let best = null, bd = 1e9; for (const o of this.F.units) { if (o.side === u.side || o.down) continue; const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } } return best; }
  flashHurt(fd, frac) { if (!fd) return; fd.rig.flash(0.09 + Math.min(0.08, frac), '#8a5530'); fd.rig.squashKick && fd.rig.squashKick(-0.05 - Math.min(0.1, frac)); }
  dropHandles(id) { const f = this.fm.get(id); if (!f) return; for (const k in f.handles) { try { f.handles[k].stop(); } catch (e) { /* ignore */ } } f.handles = {}; }
  ultSustain(u, el, dur) { const f = u && this.fm.get(u.id); if (!f) return; const h = this.fx.ult.sustain(el, f.rig.root, dur); f.handles['ult' + el] = h; }

  onStatus(e, dst) {
    if (!dst) return; const f = this.fm.get(dst.id), fx = this.fx, st = e.st; if (STATUS_LABEL[st]) this.num(dst, STATUS_LABEL[st], 'status');
    if (st === 'air' && f.lastHit && this.t - (f.lastHitT ?? -9) < 0.6) this.shove(f, { x: f.lastHit.dx, z: f.lastHit.dz }, 5 / (MASS[dst.style] || 1));   // knocked up: carried along the blow
    const key = st; if (f.handles[key]) { try { f.handles[key].stop(); } catch (er) { /* ignore */ } delete f.handles[key]; }
    const tgt = f.rig.root, t = e.t || 3;
    if (STATUS_FX.has(st) && !(st === 'bleed' && this.gore.on)) f.handles[key] = fx.status(tgt, st, t);
    else if (st === 'guard') f.handles[key] = fx.aura(tgt, '#9a6ad8', t || 4, { kind: 'guard' });
    else if (st === 'frenzy' || st === 'rage') f.handles[key] = fx.aura(tgt, '#d2412b', 6, { kind: 'rage' });
    else if (st === 'rally') f.handles[key] = fx.aura(tgt, '#2fb0a0', 6, { kind: 'rally' });
    if (st === 'stun') this.audio.sfx('stunChime', { gain: 0.8 }); else if (st === 'guard') this.audio.sfx('shieldBlock', { gain: 0.5 }); else if (st === 'rage' || st === 'frenzy') this.audio.sfx('drum', { gain: 0.6 }); else if (st === 'rally') this.audio.sfx('uiConfirm');
  }

  // ---------------------------------------------------------------- HUD + audio
  updateHud(dt, F) {
    this.syncPauseBtn(); if ((this.hudN = (this.hudN | 0) + 1) % 6 === 0) this.updateReplayBar();
    if (this.favorBtn) this.favorBtn.style.display = F.favorReady && !F.done ? '' : 'none';
    if (this.duoBtn && F.duo) { const cd = Math.max(0, F.duo.cd); this.duoBtn.disabled = cd > 0; this.duoBtn.style.opacity = cd > 0 ? 0.55 : 1; }
    for (const f of this.fm.values()) for (const { ring, slot } of f.ring) { const frac = slot.max ? clamp(slot.cd / slot.max, 0, 1) : 0; ring.set(f.u.down ? 1 : frac, Math.max(0, slot.cd)); }
  }

  updateAudio(dt, F) {
    this.recent = Math.max(0, this.recent - dt * 0.45); this.bump = Math.max(0, (this.bump || 0) - dt * 0.5);
    this.intTimer -= dt; if (this.intTimer > 0) return; this.intTimer = 0.25;
    const A = F.units.filter((u) => u.side === 'A' && !u.down), B = F.units.filter((u) => u.side === 'B' && !u.down);
    const lowest = Math.min(1, ...F.units.filter((u) => !u.down).map((u) => u.hp / u.maxhp));
    let target = 0.15 + 0.25 * clamp(1 - Math.min(A.length, B.length) / 3, 0, 1) + 0.3 * clamp(this.recent, 0, 1) + 0.1 * (lowest < 0.3 ? 1 : 0) + (this.bump || 0);
    if (A.length + B.length === 2 && lowest < 0.25) target = Math.max(target, 0.9);
    if (this.phase === 'fight') { this.audio.music.setIntensity(clamp(target, 0, 1)); this.audio.crowd(0.25 + 0.75 * clamp(target, 0, 1)); this.arena.setHype(clamp(0.2 + target * 0.8, 0, 1)); }
  }
}
