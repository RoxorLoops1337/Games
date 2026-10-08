// BEATBOX HEROES r3 -- scenes_shell.js (SHELL). 3D siblings of the shell scenes: E.scenes3d.title / slots / creator (PORT_PLAN 2.3, 3, 5).
// Classic script, loaded after screens.js and creator.js. Each sibling is Object.create(the 2D scene): the DOM (TAP TO START, CONTINUE / NEW GAME, slot cards, the creator tabs and tiles)
// and every rule run through the 2D methods, only the stage is replaced: the world modules park3d/w_title.js and park3d/w_creator.js render into #gl.
//   title   world 'title'   alley street battle: newest save (or a random look) vs Pig Pen in battle stance, BeeAmGee hosting from his crate, a crowd, neon sign. DOM menu on top.
//   slots   world 'title'   the same world, camera pushed in (world.ctx.title.setShot('slots')).
//   creator world 'creator' turntable + ring lights, live look, camera presets per tab, drag to spin, pinch to zoom, tap the hero to change pose. New game and home wardrobe.
// Also: G.graphicsRow() builds the Settings GRAPHICS row (AUTO / 3D / CLASSIC -> BBH.R3.setMode), used by G.openSettings.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3;
  if (!E || !R3 || !E.scenes3d) return;
  const G = BBH.G = BBH.G || {}, h = E.h;
  const mk = (name, extra) => { const base = E.scenes[name]; if (!base) return null; const s = Object.create(base); Object.assign(s, { is3d: true, world: name }, extra); E.scenes3d[name] = s; return s; };
  const safe = (fn) => { try { return fn(); } catch (e) { console.error('[r3 shell]', e); return undefined; } };
  const bpmOf = () => { try { return E.A().music.bpm() || 0; } catch (e) { return 0; } };
  const glEl = () => document.getElementById('gl');

  /* ------------------------------------------------------------------ title */
  mk('title', {
    enter() {
      this.state = 'tap'; this.drop = 0; this.cast = []; this.w = null; this.bpmT = 0; this.look = G.heroLook ? G.heroLook() : null;
      this.build();                                                  // the DOM (veil, then the menu) is up while the world loads behind the fade
      return R3.load('title', { reuse: true, time: 'night', look: this.look || undefined }).then((w) => {
        if (E.scene !== this || !w) return; this.w = w; if (this.look) w.setLook(this.look);
        const T = w.ctx && w.ctx.title; if (T) { T.setShot('title', 0); T.restart(); }
      });
    },
    leave() { this.w = null; },
    // the 2D DOM, restyled for the 3D stage: a neon TAP TO START pill (pulses on the beat) and the duo credit under it
    build() {
      E.scenes.title.build.call(this);
      if (this.state !== 'tap') return;
      const ui = document.getElementById('ui'), veil = ui && ui.lastElementChild, tap = veil && veil.firstElementChild; if (!tap) return;
      tap.className = 'k3-tap'; tap.removeAttribute('style'); tap.textContent = '';
      tap.appendChild(h('span.k3-tap-t', null, 'TAP TO START'));
      veil.appendChild(h('div.k3-credit', null, 'ROXORLOOPS & JASMIN'));
    },
    update(dt) {
      const T = this.w && this.w.ctx && this.w.ctx.title; if (!T) return;
      this.bpmT -= dt; if (this.bpmT <= 0) { this.bpmT = 400; const b = bpmOf(); if (b) T.setBpm(b); }
    },
    draw() { /* the stage is the WebGL canvas */ },
  });

  /* ------------------------------------------------------------------ slots */
  mk('slots', {
    world: 'title',
    enter(a) {
      this.mode = (a && a.mode) || 'continue'; this.w = null; this.bpmT = 0;
      this.build();
      return R3.load('title', { reuse: true, time: 'night', look: G.heroLook ? G.heroLook() : undefined }).then((w) => {
        if (E.scene !== this || !w) return; this.w = w; const T = w.ctx && w.ctx.title; if (T) { T.setShot('slots', 900); }
      });
    },
    leave() { this.w = null; },
    update(dt) { const T = this.w && this.w.ctx && this.w.ctx.title; if (!T) return; this.bpmT -= dt; if (this.bpmT <= 0) { this.bpmT = 400; const b = bpmOf(); if (b) T.setBpm(b); } },
    draw() { /* WebGL */ },
  });

  /* ---------------------------------------------------------------- creator */
  const proto = E.scenes.creator;
  mk('creator', {
    bgInit() { this.bg = null; this.dy = 0; this.spot = { x: 180, y: Math.round(280 * E.K) }; },     // no 2D painting; the 2D code only reads this.spot
    enter(a) {
      proto.enter.call(this, a);                                     // DOM, state, music (the 2D scene with a blank bgInit)
      this.C = null; this.w = null; this.lastKey = ''; this.lastPose = this.pose; this.lastTab = null; this.lastName = null; this.keyT = 0; this.insT = 0; this.lastIns = -1; this.pd = null;
      return R3.load('creator', { look: this.look, name: this.look.name || '' }).then((w) => {
        if (E.scene !== this || !w) return; this.w = w; this.C = w.ctx && w.ctx.creator; if (!this.C) return;
        this.C.setTab(this.tab, 0); this.C.setName(this.look.name || ''); this.C.pose(this.pose); w.setLook(this.look); this.lastKey = JSON.stringify(this.look); this.lastTab = this.tab;
        this.inset(true); this.bindTap();
      });
    },
    leave() { this.unbindTap(); this.C = null; this.w = null; proto.leave.call(this); },
    changed(sparkle) { this.hop = 1; E.sfx('equip'); if (this.C) { this.syncLook(); if (sparkle !== false) safe(() => this.C.burst(1)); } },    // the 3D burst replaces the 2D sparkles
    renderTab(keep) { proto.renderTab.call(this, keep); if (this.C) { this.syncLook(); if (this.tab !== this.lastTab) { this.lastTab = this.tab; safe(() => this.C.setTab(this.tab)); } } },
    randomize() { proto.randomize.call(this); if (this.C) safe(() => { this.syncLook(); this.C.burst(1.4); }); },
    syncLook() {                                                     // push this.look (mutated in place by the 2D tiles, swatches, sliders and dice) to the 3D hero when it changed
      if (!this.C || !this.w) return; const k = JSON.stringify(this.look);
      if (k !== this.lastKey) { this.lastKey = k; safe(() => this.w.setLook(this.look)); }
      if (this.look.name !== this.lastName) { this.lastName = this.look.name; safe(() => this.C.setName(this.look.name || '')); }
    },
    // the DOM panel covers the lower part of the screen: tell the camera so the hero stays in the visible part
    inset(force) {
      const p = this.panel, el = p && p.getBoundingClientRect ? p : null; if (!el || !this.C) return;
      const r = el.getBoundingClientRect(), px = Math.round(Math.max(0, r.height + 4)); if (force || Math.abs(px - this.lastIns) > 3) { this.lastIns = px; safe(() => this.C.setInset(px)); }
    },
    bindTap() {
      const gl = glEl(); if (!gl) return;
      this.onDown = (e) => { if (e.isPrimary === false) { this.pd = null; return; } this.pd = { x: e.clientX, y: e.clientY, t: performance.now(), n: (this.pd && this.pd.n) || 0 }; };
      this.onUp = (e) => { const d = this.pd; this.pd = null; if (!d || e.isPrimary === false) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 380) return; this.tapPose(); };
      gl.addEventListener('pointerdown', this.onDown); gl.addEventListener('pointerup', this.onUp);
    },
    unbindTap() { const gl = glEl(); if (gl && this.onDown) { gl.removeEventListener('pointerdown', this.onDown); gl.removeEventListener('pointerup', this.onUp); } this.onDown = this.onUp = null; },
    tapPose() {                                                      // tap the hero: next pose (idle, beatbox, dance, cheer, point, battle), same as the 2D stage
      const P = this.POSES || ['idle', 'beatbox', 'dance', 'cheer', 'point', 'battle']; this.pose = P[(P.indexOf(this.pose) + 1) % P.length]; this.hop = 1; E.sfx('hit_good');
      if (this.C) safe(() => { this.C.pose(this.pose); this.C.burst(0.35); this.lastPose = this.pose; }); if (this.tab === 'body') this.renderTab(true);
    },
    update(dt) {
      proto.update.call(this, dt);
      if (!this.C) return;
      this.keyT -= dt; if (this.keyT <= 0) { this.keyT = 100; this.syncLook(); }   // sliders and the name field only mutate this.look, so poll as well (picks sync at once)
      if (this.pose !== this.lastPose) { this.lastPose = this.pose; safe(() => this.C.pose(this.pose)); }       // pose chips in the BODY tab
      this.insT -= dt; if (this.insT <= 0) { this.insT = 300; this.inset(false); const b = bpmOf(); if (b && this.C.setBpm) this.C.setBpm(b); }
    },
    draw() { /* WebGL */ },
  });

  /* ------------------------------------------- Settings: GRAPHICS (AUTO / 3D / CLASSIC) */
  G.graphicsRow = function () {
    if (!R3.setMode) return null;
    const cur = (() => { const m = R3.mode; return m === '2d' ? 'CLASSIC' : m === '3d' ? '3D' : 'AUTO'; })();
    const label = h('div.tp.gold', null, cur), row = h('div.row', null);
    const note = h('div.ts', null, R3.status === 'ready' ? '3D is running.' : R3.status === 'failed' ? '3D failed here, using CLASSIC.' : 'AUTO picks 3D on strong devices.');
    ['AUTO', '3D', 'CLASSIC'].forEach((name) => {
      const b = E.btn(name, 'grow' + (name === cur ? ' gold' : ''), () => {
        const r = R3.setMode(name === 'CLASSIC' ? '2d' : name.toLowerCase()); if (!r) return;
        E.sfx('hit_perfect'); label.textContent = name; Array.from(row.children).forEach((c) => { c.className = 'btn grow' + (c.textContent === name ? ' gold' : ''); });
        if (r.reload) { note.textContent = 'RELOADING...'; try { if (G.flush) G.flush(); } catch (e) { /* ignore */ } setTimeout(() => { try { root.location.reload(); } catch (e) { /* ignore */ } }, 700); }
        else note.textContent = name === 'CLASSIC' ? 'CLASSIC graphics.' : 'Saved. Applies at the next start.';
      });
      row.appendChild(b);
    });
    return h('div.col', { style: { gap: '2px' } }, h('div.row', { style: { justifyContent: 'space-between' } }, h('div.tp', null, 'GRAPHICS'), label), row, note);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
