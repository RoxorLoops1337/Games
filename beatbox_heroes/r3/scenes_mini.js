// BEATBOX HEROES r3 -- scenes_mini.js (MG-RUN / MG-TUNER). 3D siblings of the training scenes: E.scenes3d.run / tuner / seq / studio (PORT_PLAN 2.3, 2.8, 2.11).
// Classic script, loaded after minigames.js. The RULES live in two places only: the 3D mini games (park3d/mg_run*.js, mg_tuner*.js, same numbers as the 2D scenes) and the game
// (Core.apply through G.doHold, G.finishActivity). This file is the bridge:
//   run     world 'run'    the park jog in 3D. Result -> G.doHold({t:'run', q, goodBars}) exactly like the 2D scene, rewards read back from the new save and shown on the card
//                          (mini.setRewards), CONTINUE -> G.finishActivity(held, 'park'). QUIT before the end -> back to the place (nothing spent), like 2D.
//   tuner   world 'tuner'  the vocal booth in 3D, HIGHER / LOWER voice (saved in E.settings.voice) and EAR training. Result -> G.doHold({t:'tune', q}), CONTINUE -> G.finishActivity(held, place).
//   seq     world 'lab'    Beat Maker: the 2D DOM tool (pattern tabs, BPM, PLAY, RELEASE...) over the 3D Sound Lab with the camera on the desk; the 16 x 4 grid is a DOM grid here
//   studio  world 'lab'    Sound Recorder: the 2D DOM tool over the lab, camera on the booth, the hero at the mic; recordings still go to IndexedDB through BBH.Samples.
// The mini games get the SHARED audio (BBH.Audio, E.tone), E.settings (offset, muted, sfx, reduce, voice) and never open an AudioContext of their own.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3;
  if (!E || !R3 || !E.scenes3d) return;
  const G = BBH.G = BBH.G || {}, Core = BBH.Core, h = E.h;
  const safe = (fn) => { try { return fn(); } catch (e) { console.error('[r3 mini]', e); return undefined; } };
  const glwrap = () => document.getElementById('glwrap');
  const nightN = () => { try { return Core.nightness(G.ch.minutes); } catch (e) { return 0.3; } };

  // overlay for the mini game's own DOM HUD. It sits in <body> over the canvas box (NOT inside #glwrap: the host removes every node added to #glwrap's children while a world lives).
  function overlay() {
    const o = document.createElement('div'); o.className = 'mg3-ov'; o.style.cssText = 'position:fixed;z-index:3;pointer-events:none;overflow:hidden;touch-action:none';
    const fit = () => { const g = glwrap(); if (!g) return; const r = g.getBoundingClientRect(); o.style.left = r.left + 'px'; o.style.top = r.top + 'px'; o.style.width = r.width + 'px'; o.style.height = r.height + 'px'; };
    o.addEventListener('pointerdown', () => { try { E.unlockAudio(); } catch (e) { /* ignore */ } }, true);
    fit(); root.addEventListener('resize', fit); o._fit = fit; document.body.appendChild(o); return o;
  }
  const dropOverlay = (o) => { if (!o) return; try { root.removeEventListener('resize', o._fit); } catch (e) { /* ignore */ } if (o.parentNode) o.parentNode.removeChild(o); };
  // what changed in the save: the REAL rewards of an action, numbers only (xp counts level ups)
  function snap(ch) {
    let xp = ch.xp || 0; try { for (let l = 1; l < ch.level; l++) xp += Core.xpNeed(l); } catch (e) { /* ignore */ }
    return { cash: ch.cash, fans: ch.fans, xp, level: ch.level, energy: ch.energy, maxEnergy: ch.maxEnergy, mood: ch.mood, mus: ch.stats.mus, tech: ch.stats.tech, ori: ch.stats.ori };
  }
  function diff(a, b) { const o = {}; for (const k in b) { const d = b[k] - a[k]; o[k] = Math.round(d * 100) / 100; } return o; }
  const goBack = (to, dflt) => { if (to && to.scene) E.go(to.scene, to.args); else E.go(dflt || 'street'); };

  // shared skeleton for the two 3D-only mini games
  function miniScene(name, cfg) {
    return {
      is3d: true, world: name, name,
      enter(a) {
        this.a = a || {}; this.held = null; this.gone = false; this.mg = null; this.w = null; this.res = null; this.pre = null;
        E.music(cfg.music);
        this.ov = overlay();
        const args = Object.assign({ hud: this.ov, look: G.ch && G.ch.look, time: nightN(), offsetMs: E.settings.offset | 0, settings: E.settings, embedded: true, again: false }, cfg.args ? cfg.args.call(this) : {});
        return R3.load(name, args).then((w) => {
          if (E.scene !== this || !w) return; this.w = w; this.mg = w.game || null; if (!this.mg) return;
          w.events.on('minigame', (r) => { if (!this.gone && E.scene === this) safe(() => this.onResult(r && r.result ? r.result : r)); });   // listeners die with the world (new emitter per load)
          w.events.on('quit', (q) => { if (!this.gone && E.scene === this) safe(() => this.onQuit(q)); });
        });
      },
      leave() {
        this.gone = true;
        dropOverlay(this.ov); this.ov = null; this.mg = null; this.w = null;
        if (cfg.leave) safe(() => cfg.leave.call(this));
      },
      update() { /* the world host drives the mini game */ },
      draw() { /* WebGL */ },
      // apply the real action once (state changes identical to 2D), tell the mini game what it gave
      commit(action) {
        if (this.held) return this.held; const pre = snap(G.ch); this.pre = pre; this.held = G.doHold(action); this.rw = diff(pre, snap(G.ch));
        try { if (this.mg && this.mg.setRewards) this.mg.setRewards(this.rw); } catch (e) { /* ignore */ } return this.held;
      },
      onQuit(q) {
        if (this.gone) return; this.gone = true;
        if (this.held) cfg.finish.call(this); else goBack(this.a.back, cfg.home);
      },
    };
  }

  /* ================================================================== RUN */
  E.scenes3d.run = Object.assign(miniScene('run', {
    music: 'park', home: 'place',
    finish() { G.finishActivity(this.held, 'park'); },
  }), {
    onResult(r) {
      if (this.held || !r) return;
      this.res = r; this.commit({ t: 'run', q: r.q, goodBars: r.goodBars });   // 2D: G.doHold({ t: 'run', q, goodBars })
      E.flash('#fff', 160);
    },
  });

  /* ================================================================ TUNER */
  E.scenes3d.tuner = Object.assign(miniScene('tuner', {
    music: 'studio', home: 'place',
    args() { return { mus: G.ch.stats.mus, tone: (f, d, v) => E.tone && E.tone(f, d, v), onVoice: (r) => { E.settings.voice = r; try { E.saveSettings(); } catch (e) { /* ignore */ } } }; },
    finish() { G.finishActivity(this.held, this.a.place || 'home'); },
    leave() { try { BBH.Mic && BBH.Mic.close(); } catch (e) { /* ignore */ } },
  }), {
    onResult(r) {
      if (this.held || !r) return;
      this.res = r; this.commit({ t: 'tune', q: r.q });                            // 2D: G.doHold({ t: 'tune', q })
    },
  });

  /* ============================================== BEAT MAKER + RECORDER over the lab */
  // Both keep the 2D scene object as their prototype: every rule (sched, train, release, record, reset, toggleTest, Samples in IndexedDB, G.do / G.doHold) is the 2D code.
  // Only the stage changes: the 3D Sound Lab with the camera on the desk (seq) or the booth (studio), the hero at the desk tapping pads / at the mic,
  // and the two things the 2D scenes painted on the canvas (the 16 x 4 step grid, the level meter) as DOM.
  const LANES = [['B', 'KICK', '#ff4f6a'], ['T', 'HAT', '#ffd23f'], ['K', 'SNARE', '#2ee6ff'], ['PF', 'CLAP', '#c07bff']];
  const lab = {
    // the tools own the whole lower half of the screen, so the top HUD (clock, cash, MAP, MENU) steps aside and the 3D lab gets the room
    hideHud() { safe(() => { const el = E.hudEl; if (el && el.hud && el.hud.show) el.hud.show(false); }); },
    // load the lab world, park the hero at a spot, aim the camera at a preset, keep walking off
    // the world controls' debug chrome (DAY / DUSK / NIGHT, quality, minimap) has no place under the tools
    css(on) { let st = document.getElementById('r3-mini-css'); if (!on) { if (st) st.remove(); return; } if (st) return; st = document.createElement('style'); st.id = 'r3-mini-css'; st.textContent = 'body.r3 .p3-bar, body.r3 .p3-tag, body.r3 .p3-mini, body.r3 .p3-hint, body.r3 .p3-go, body.r3 .p3-fps { display: none !important; }'; document.head.appendChild(st); },
    stage(self, spot, preset, insetFrac, cam) {
      lab.css(true);
      return R3.load('lab', { time: nightN(), look: G.ch && G.ch.look }).then((w) => {
        if (E.scene !== self || !w) return; self.w = w;
        safe(() => { if (w.controls && w.controls.setEnabled) w.controls.setEnabled(false); if (w.spots && w.spots.group) w.spots.group.visible = false; w.teleport(spot); self.fit(insetFrac); w.focus(preset, Object.assign({ ms: 900 }, cam || {})); });
      });
    },
    fit(self, frac) { const w = self.w; if (!w || !w.controls || !w.controls.setViewInset) return; const g = glwrap(), H = g ? g.getBoundingClientRect().height : root.innerHeight; w.controls.setViewInset({ bottom: Math.round(H * frac) }); },
    unstage(self) {
      lab.css(false);
      const w = self.w; self.w = null; if (!w) return;
      safe(() => { w.controls.setViewInset({ bottom: 0 }); w.controls.setEnabled(true); if (w.spots && w.spots.group) w.spots.group.visible = true; w.release(); w.setSpotState('mic', { rec: false }); w.player.play('idle', {}); });
    },
  };

  // ---- Beat Maker
  const seqBase = E.scenes.seq;
  if (seqBase) E.scenes3d.seq = Object.assign(Object.create(seqBase), {
    is3d: true, world: 'lab',
    fit(f) { lab.fit(this, f === undefined ? 0.56 : f); },
    enter(a) {
      this.w = null; this.shown = -1; this.t0 = 0; this.cells = null;
      seqBase.enter.call(this, a);                                    // state, music, HUD, the sheet (our build() below adds the grid), the 25 ms scheduler
      lab.hideHud();
      const me = this; this.obeat = E.beat; E.beat = function () { return me.playing && me.t0 ? me.beatPos() : me.obeat.apply(E, arguments); };   // the lab's VU meters and pads follow the pattern, not the music
      return lab.stage(this, 'mixer', 'desk', 0.56).then(() => { if (this.w) this.pose(); });
    },
    leave() { if (this.obeat) { E.beat = this.obeat; this.obeat = null; } seqBase.leave.call(this); lab.unstage(this); this.grid = null; this.cells = null; },
    beatPos() { try { return Math.max(0, (E.A().now() - this.t0) * this.pat.bpm / 60); } catch (e) { return 0; } },
    toggle() { seqBase.toggle.call(this); this.t0 = this.playing ? this.nextT : 0; this.pose(); },
    pose() { const w = this.w; if (w && w.player && w.player.play) safe(() => w.player.play(this.playing ? 'dance' : 'idle', { bpm: this.pat ? this.pat.bpm : 100 })); },
    build() { seqBase.build.call(this); this.mkGrid(); },
    cellAt() { return null; }, pointer() { /* the grid is DOM here */ }, draw() { /* WebGL */ },
    mkGrid() {
      if (this.grid && this.grid.parentNode) this.grid.parentNode.removeChild(this.grid);
      const pat = this.pat, wrap = h('div', { style: { position: 'absolute', left: '8px', right: '8px', top: '186px', zIndex: 14, display: 'flex', flexDirection: 'column', gap: '2px' } });
      const sc = Core.patternScore(pat), bar = h('div', { style: { width: Math.round(sc * 100) + '%', height: '100%', background: '#ff3ea5', borderRadius: '3px' } }), lab2 = h('div.tp', { style: { color: '#fff6e8' } }, 'CREATIVITY ' + Math.round(sc * 100) + '%');
      const head = h('div.row', { style: { justifyContent: 'space-between', alignItems: 'center', gap: '6px' } }, h('div.tp.gold', null, 'BEAT MAKER'), h('div', { style: { flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(14,9,30,.7)', overflow: 'hidden' } }, bar), lab2);
      const g = h('div', { style: { display: 'grid', gridTemplateColumns: '14px repeat(16, 1fr)', gridTemplateRows: 'repeat(4, 24px)', gap: '1px', padding: '3px', borderRadius: '8px', background: 'rgba(14,9,30,.72)', boxShadow: '0 0 0 1px rgba(255,246,232,.18)', touchAction: 'none' } });
      const cells = [];
      for (let l = 0; l < 4; l++) {
        g.appendChild(h('div.tp', { style: { color: LANES[l][2], fontSize: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, LANES[l][0]));
        for (let i = 0; i < 16; i++) { const c = h('div', { 'data-l': l, 'data-i': i, style: { borderRadius: '2px' } }); cells.push(c); g.appendChild(c); }
      }
      const paint = (c) => { const l = +c.dataset.l, i = +c.dataset.i, on = pat.steps[l][i], col = LANES[l][2]; c.style.background = on ? col : (i % 4 === 0 ? '#3a2a60' : '#2a1d4a'); c.style.boxShadow = on ? 'inset 0 3px 0 rgba(255,255,255,.4), inset 0 -5px 0 rgba(0,0,0,.25)' : ''; };
      cells.forEach(paint);
      const score = () => { const s = Core.patternScore(pat); bar.style.width = Math.round(s * 100) + '%'; lab2.textContent = 'CREATIVITY ' + Math.round(s * 100) + '%'; };
      const at = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.dataset && el.dataset.l !== undefined && g.contains(el) ? el : null; };
      const hit = (c) => {                                           // same rule as the 2D pointer(): paint the value picked on the first cell, a drum click on every new hit
        if (!c || this.paint === null) return; const l = +c.dataset.l, i = +c.dataset.i;
        if (pat.steps[l][i] !== this.paint) { pat.steps[l][i] = this.paint; paint(c); score(); if (this.paint) { try { E.A().drum(l, { vel: 0.8 }); } catch (e) { /* ignore */ } } }
      };
      g.addEventListener('pointerdown', (e) => { const c = at(e); if (!c) return; e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } E.unlockAudio(); this.paint = pat.steps[+c.dataset.l][+c.dataset.i] ? 0 : 1; hit(c); });
      g.addEventListener('pointermove', (e) => { if (this.paint !== null) hit(at(e)); });
      const up = () => { if (this.paint === null) return; this.paint = null; if (this.ui) this.build(); };   // 2D: pointer 'up' rebuilds the sheet so TRAIN / RELEASE see the new hit count
      g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      wrap.append(head, g); E.add(wrap); this.grid = wrap; this.cells = cells; this.shown = -1;
    },
    update() {
      const st = this.playing ? this.step : -1; if (st !== this.shown && this.cells) {
        const was = this.shown; this.shown = st;
        for (const c of this.cells) { const i = +c.dataset.i; if (i === st || i === was) { const on = this.pat.steps[+c.dataset.l][i]; c.style.filter = i === st ? 'brightness(1.9)' : ''; c.style.outline = i === st ? '1px solid #fff6e8' : ''; void on; } }
      }
    },
  });

  // ---- Sound Recorder
  const studioBase = E.scenes.studio;
  if (studioBase) E.scenes3d.studio = Object.assign(Object.create(studioBase), {
    is3d: true, world: 'lab',
    fit() { lab.fit(this, 0.5); },
    enter(a) {
      this.w = null; this.lastRec = null; this.lastClip = '';
      studioBase.enter.call(this, a); lab.hideHud();
      return lab.stage(this, 'mic', 'booth', 0.5, { dist: 3.0, pitch: 42, yaw: 50 }).then(() => { if (this.w) this.pose(); });
    },
    leave() { studioBase.leave.call(this); lab.unstage(this); this.meter = null; this.heard = null; },
    // the 2D tool is one tall column of cards; in 3D the lab needs room, so the same cards (same buttons, same record / reset / test code) sit in a 2 x 2 grid at the bottom
    build() {
      if (this.ui) this.ui.remove(); const PAL = BBH.PAL;
      const cards = LANES.map((ln, i) => {
        const mine = this.has(i), st = this.status[i], sb = { flex: 1, padding: '4px 0 5px', minWidth: 0 };
        return h('div.panel.flat', { style: { position: 'relative', padding: '3px 4px 4px 6px', borderLeft: '4px solid ' + ln[2], display: 'flex', alignItems: 'center', gap: '4px' } },
          h('div.col', { style: { gap: '1px', width: '62px', flex: 'none' } }, h('div.h2', { style: { color: ln[2] } }, ln[0] + ' ' + ln[1]), h('div.tp', { style: { color: st === 'rec' ? '#ff7b8e' : mine ? '#7be08f' : PAL.fog, fontSize: '5px' } }, st === 'rec' ? 'RECORDING' : st === 'wait' ? 'SOUND NOW!' : mine ? 'YOUR SOUND' : 'DEFAULT')),
          E.btn('REC', 'red', () => this.record(i), sb), E.btn('PLAY', '', () => { try { E.A().drum(i, { vel: 1 }); } catch (e) { /* ignore */ } }, sb), E.btn('RESET', mine ? '' : 'dis', () => this.reset(i), sb));
      });
      const fill = h('div', { style: { width: '0%', height: '100%', borderRadius: '3px', background: '#7b4fe0' } });
      this.heard = h('div.h1', { style: { position: 'absolute', left: 0, right: 0, top: '120px', textAlign: 'center', color: '#fff6e8', zIndex: 14, textShadow: '0 2px 0 #17102b', pointerEvents: 'none' } }, '');
      this.ui = h('div', { style: { position: 'absolute', left: '6px', right: '6px', bottom: '8px', zIndex: 15, display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div.row', { style: { alignItems: 'center', gap: '6px' } }, h('div.tp.gold', null, 'SOUND RECORDER'), h('div', { style: { flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(14,9,30,.7)', overflow: 'hidden' } }, fill), h('div.tp', { style: { color: '#b9aee6' } }, 'MIC')),
        h('div.ts.ctr', { style: { fontSize: '6px' } }, !!(BBH.Mic && BBH.Mic.open) ? 'Press REC, then make the sound into your mic. It stops when you go quiet.' : 'Microphone recording is not supported in this browser.'),
        h('div.col', { style: { gap: '3px' } }, cards),
        h('div.row', null, E.btn(this.test ? 'STOP TEST' : 'TEST MIC MODE', this.test ? 'red' : 'cyan', () => this.toggleTest(), { flex: 2 }), E.btn('BACK', '', () => goBack(this.a.back), { flex: 1 })));
      E.add(this.ui); E.add(this.heard); this.meter = fill;
    },
    pose() { const w = this.w; if (!w || !w.player || !w.player.play) return; const want = this.rec !== null && this.rec !== undefined || (this.test && this.detT > 0) ? 'beatbox' : 'idle'; if (want !== this.lastClip) { this.lastClip = want; safe(() => w.player.play(want, {})); } },
    draw() { /* WebGL */ },
    update(dt) {
      studioBase.update.call(this, dt);
      let lv = 0; try { lv = BBH.Mic.isOpen() ? BBH.Mic.level() : 0; } catch (e) { lv = 0; }
      if (this.meter) { this.meter.style.width = Math.round(Math.min(1, lv * 6) * 100) + '%'; this.meter.style.background = lv > 0.04 ? '#9dff4a' : '#7b4fe0'; }
      if (this.heard) { const txt = this.test ? (this.detT > 0 ? 'HEARD: ' + LANES[this.detLane][0] : 'BEATBOX INTO YOUR MIC...') : ''; if (this.heard.textContent !== txt) this.heard.textContent = txt; if (this.test && this.detT > 0) this.heard.style.color = LANES[this.detLane][2]; else this.heard.style.color = '#fff6e8'; }
      const rec = this.rec !== null && this.rec !== undefined || !!this.test; if (rec !== this.lastRec && this.w) { this.lastRec = rec; safe(() => this.w.setSpotState('mic', { rec })); }
      this.pose();
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
