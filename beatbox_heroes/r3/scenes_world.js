// BEATBOX HEROES r3 -- scenes_world.js (GAME). 3D siblings of the free-roam scenes: E.scenes3d.street / place / map (PORT_PLAN 2.3, 2.5, 4).
// Classic script, loaded after places.js and r3/spotmap.js. Each sibling is Object.create(the 2D scene): ACTIONS, sheets, rows, the shop try-on, results, dialogs and every rule keep running
// through the 2D methods; only the stage changes. The world modules (park3d/street.js, flat*.js, terrain*.js, shop*.js, lab*.js, bar*.js, w_hood*.js) render into #gl.
//   street  world 'street'   Neon Row: 5 doors + the bus stop map. Locked doors follow Core.canEnter each time the save changes, the goal door gets a beacon, Foxy waits at the home stoop in the tutorial.
//   place   world flat | park | shop | lab | bar  (home park shop studio bar)   spots and NPC taps -> G.places.ACTIONS through r3/spotmap.js
//           back from an activity (activity.js ticket): the player stands at the spot it started from (SM.land), BACK reopens its menu there (SM.reopen)
//   map     world 'hood'     tabletop map with the five pins; a pin opens the same card sheet (E.scenes.map.showCard)
// The sibling provides what the 2D ACTIONS need: S.sheet / row / closeSheet / eatMenu / id / look / sc (anchors as 2D) and S.w (the world). Real DOM chrome = R3UI.hud (stats, goal chip, MAP, MENU, LEAVE, nav dock).
// Any failure (world build throws, WebGL lost) drops to the 2D scene through R3.demote (E.go does that for a rejected enter).
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3, SM = BBH && BBH.R3Spots, G = BBH && BBH.G, Core = BBH && BBH.Core;
  if (!E || !R3 || !SM || !G || !G.places || !E.scenes3d || !E.scenes.street || !E.scenes.place || !E.scenes.map) return;
  const P = G.places, hooks = E.hooks = E.hooks || {};
  const safe = (fn) => { try { return fn(); } catch (e) { console.error('[r3 world]', e); return undefined; } };
  const glEl = () => document.getElementById('gl');
  // In the game the bridge (r3/spotmap.js) owns spotDone, and the park3d demo chrome must stay out of the way: no auto spotDone timer, no camera fly-in, no debug bar / tag / minimap / toast.
  // (park3d/host.js does not set ctx.embedded yet, which is what would build the embed-only UI; these globals and the rule below are the game-side guard either way.)
  root.__PARK_AUTODONE = false; root.__PARK_NOINTRO = true;
  try { const st = document.createElement('style'); st.id = 'r3-world-css'; st.textContent = 'body.r3 #glwrap .p3-bar, body.r3 #glwrap .p3-tag, body.r3 #glwrap .p3-hint, body.r3 #glwrap .p3-mini, body.r3 #glwrap .p3-toast, body.r3 #glwrap .p3-fps { display: none !important; }'; document.head.appendChild(st); } catch (e) { /* ignore */ }
  const mk = (name, base, extra) => { const s = Object.create(base); Object.assign(s, { is3d: true }, extra); E.scenes3d[name] = s; return s; };

  // the clerk has no `who` in her dialog lines (she is not in Core.NPCS): give the camera someone to focus
  const prevLine = hooks.dialogLine;
  hooks.dialogLine = function (line, i) { if (line && !line.who && line.name === 'Clerk') line = Object.assign({}, line, { who: 'clerk' }); return prevLine ? prevLine(line, i) : undefined; };

  /* ------------------------------------------------------------------ shared by the three siblings */
  const common = {
    baseArgs() { return { time: Core.nightness(G.ch.minutes), look: G.ch.look }; },
    unmountHud() { if (this.hud) { safe(() => this.hud.destroy()); this.hud = null; } if (this.leaveBtn) this.leaveBtn = null; },
    mountHud(o) {
      this.unmountHud(); const UI = BBH.R3UI;
      if (!UI || !UI.hud || !UI.on()) { E.add(E.makeHud(G)); return null; }
      const hud = this.hud = UI.hud.create(G, o); E.hudEl = hud; return hud;
    },
    // a LEAVE chip next to MAP / MENU in the HUD (the 2D place scene has a LEAVE button top left)
    addLeave(fn) {
      const hud = this.hud, anchor = hud && hud.buttons && (hud.buttons.map || hud.buttons.menu); if (!anchor || !anchor.parentNode) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'h3-btn lv'; b.setAttribute('aria-label', 'Leave');
      b.innerHTML = (BBH.R3Icons ? BBH.R3Icons.svg('back') : '') + '<span>LEAVE</span>';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); E.sfx('click'); fn(); });
      anchor.parentNode.insertBefore(b, anchor); this.leaveBtn = b;
    },
    bindGl() {
      const gl = glEl(); if (!gl) return; this.unbindGl();
      // a tap on the world (not on the sheet) closes the sheet first, so the same tap can walk away (2D: walkTo -> closeSheet)
      this._gd = () => { if (this.sheetEl && this.sheetEl.isConnected) { this.closeSheet(); SM.settle(this, 1e6); } };
      gl.addEventListener('pointerdown', this._gd, true);
    },
    unbindGl() { const gl = glEl(); if (gl && this._gd) gl.removeEventListener('pointerdown', this._gd, true); this._gd = null; },
    reset() { this.w = null; this.activeSpot = null; this.idleT = 0; this._ch = null; this._gate = ''; this._goal = ''; this.npcAct = null; this.quietSpot = null; },
    // controls on/off without fighting E.uiBlock: used while the morning card covers the screen
    input(b) { const c = this.w && this.w.controls; if (c && c.setEnabled) safe(() => c.setEnabled(b)); },
  };

  /* ------------------------------------------------------------------ street */
  mk('street', E.scenes.street, Object.assign({}, common, {
    world: 'street',
    enter(a) {
      this.reset(); this.sheetEl = null; this.look = BBH.Chars.fix(G.ch.look); this.moving = false;
      const from = a.from || (G.ch.place && G.ch.place !== 'street' ? G.ch.place : 'home'); this.fromPlace = from;
      const gates = SM.gates(), locks = {}; for (const id of SM.DOORS) if (gates[id].locked) locks[id] = true;
      return R3.load('street', Object.assign(this.baseArgs(), { from, locks, foxy: !!a.tutorial })).then((w) => {
        if (E.scene !== this || !w) return;
        this.w = w; SM.bind(this, w, 'street'); E.music('street'); this.build(); this.sync();
        if (a.tutorial) E.dialog(P.tutorialLines(), () => G.openHelp());
      });
    },
    leave() { this.unbindGl(); this.unmountHud(); this.w = null; this.activeSpot = null; },
    build() {
      E.clearUI();
      this.mountHud({ nav: true, goal: true, menu: true, map: true, onPlace: (id) => this.goDoor(id), onMap: () => E.go('map') });
    },
    goDoor(id) {
      const ok = Core.canEnter(G.ch, id); if (!ok.ok) { E.toast(ok.reason, 'warn'); E.sfx('error'); return; }
      if (this.w) this.w.walkToSpot(id, { run: true });
    },
    sync() { if (this.w) this._gate = SM.applyGates(this.w, this._gate); },
    update(dt) {
      if (!this.w) return;
      if (G.ch !== this._ch) { this._ch = G.ch; this.sync(); }
      SM.settle(this, dt);
    },
    pointer() { /* the world handles taps */ },
    draw() { /* WebGL */ },
  }));

  /* ------------------------------------------------------------------ places (home park shop studio bar) */
  const PL = E.scenes.place;
  mk('place', PL, Object.assign({}, common, {
    world: 'flat',
    enter(a) {
      this.reset(); this.id = a.id; this.world = SM.WORLD[a.id]; this.look = BBH.Chars.fix(G.ch.look); this.sheetEl = null; this.shop = null; this._try = null; this.moving = false; this.sc = { spots: { stand: { x: 0, y: 0 } } };
      this.v = P.variantFor(this.id, G.ch);
      const ret = G.takeReturn ? G.takeReturn(a.id, a) : null; this.ret = ret; this.landed = null;   // activity.js: back from an activity = back at its spot (BACK reopens its menu)
      return R3.load(this.world, Object.assign(this.baseArgs(), this.worldArgs(a.id))).then((w) => {
        if (E.scene !== this || !w) return;
        this.w = w; this.sc = { spots: SM.anchors2d(w), hotspots: [], layers: [] }; SM.bind(this, w, this.id); this.bindGl();
        if (ret && SM.land) safe(() => SM.land(this, w, this.id, ret));                              // before the first revealed frame: no walk in from the door
        const go = () => { this.input(true); E.music(this.id); this.build(); this.firstVisit(); this.sync(); if (ret && ret.mode === 'menu' && SM.reopen) safe(() => SM.reopen(this, w, this.id, ret)); };
        if (G.pendingMorning) { E.clearUI(); this.input(false); G.showMorning(() => { E.fadeTo(0, 400); go(); }); } else go();   // the morning card shows before the home world is used
      });
    },
    worldArgs(id) {
      if (id === 'shop') return { clerkLook: P.CLERK };
      if (id === 'bar') { const day = G.ch.day; return { Core, day, clock: { hour: Core.hourOf(G.ch.minutes), day }, programme: Core.barProgramme(day), regulars: this.regulars().map((r) => r.id) }; }
      return {};
    },
    leave() { this.closeSheet(); this.dropShop(); this.unbindGl(); this.unmountHud(); this.w = null; this.activeSpot = null; },
    build() {
      E.clearUI(); this.sheetEl = null; this._chromeOpen = false;
      this.mountHud({ nav: false, goal: true, menu: true, map: true, onMap: () => { this.closeSheet(); E.go('map'); } });
      if (this.hud) this.addLeave(() => this.leave2());
    },
    leave2() { const id = this.id; this.closeSheet(); G.do({ t: 'at', to: 'street' }); E.go('street', { from: id }); },   // like G.leavePlace, but the street knows which door you came out of
    // ---- sheets: the 2D sheet plus the camera inset, so the player stays visible above it
    sheet(title, kids, o) { const el = PL.sheet.call(this, title, kids, o); this.chrome(true); safe(() => hooks.sheetOpen && hooks.sheetOpen(el)); return el; },
    closeSheet() { const had = !!this.sheetEl; PL.closeSheet.call(this); if (had) { safe(() => hooks.sheetClose && hooks.sheetClose()); if (!this._try) this.chrome(false); } },
    // while a sheet or the shop panel covers half the screen the goal chip steps aside, so the world keeps as much room as possible above it
    chrome(open) {
      const h = this.hud; if (!h || open === !!this._chromeOpen) return; this._chromeOpen = open;
      if (open) h.setGoal(''); else { h.setGoal(null); h.update(G.ch); }
    },
    // ---- shop try-on: S.shop.look is mirrored live to the 3D player, the camera frames the mirror
    tryOn() {
      const sh = this.shop, open = !!(sh && sh.el && sh.el.isConnected), w = this.w;
      if (open) {
        if (!this._try) {
          this._try = { k: '' }; this.chrome(true);
          // the try-on stage is the mirror platform: from the hats / racks / counter spots the player is moved there first (a jump cut under the open panel), then the camera frames it
          safe(() => { const m = w.spots && w.spots.byId && w.spots.byId.mirror, c = w.controls, st = c && c.state && c.state(); if (m && st && Math.hypot(st.x - m.x, st.z - m.z) > 1.3) c.teleportTo(m.x, m.z); });
          // the camera comes round to the FRONT of the player (a 3/4 view), so the shirt and the hat you are trying on are what you see
          safe(() => { const hd = w.controls.state().heading || 0; w.focus('mirror', { yaw: Math.round(hd * 180 / Math.PI + 50) }); });
          safe(() => hooks.sheetOpen && hooks.sheetOpen(sh.el));
        }
        const k = JSON.stringify(sh.look); if (k !== this._try.k) { this._try.k = k; safe(() => w.setLook(sh.look)); }
      } else if (this._try) this.dropShop();
    },
    dropShop() {
      if (this.shop && this.shop.el && this.shop.el.isConnected) this.shop.el.remove(); this.shop = null;
      if (this._try) { this._try = null; this.chrome(false); const w = this.w; if (w) { safe(() => w.setLook(G.ch.look)); safe(() => w.release()); } safe(() => hooks.sheetClose && hooks.sheetClose()); }
    },
    // ---- keep the world in step with the save: Foxy's schedule, the goal beacon, the bar chalkboard (the world re-reads the clock itself)
    sync() {
      const w = this.w; if (!w) return;
      if (this.id === 'home') {
        const hr = Core.hourOf(G.ch.minutes), vis = hr < 11 || hr > 17, f = (w.npcs || []).find((n) => n && n.id === 'foxy');
        if (f) { f.object.visible = vis; f.tappable = vis; }
      }
      this._goal = SM.applyGoal(w, this.id, this._goal);
    },
    update(dt) {
      if (!this.w) return;
      if (G.ch !== this._ch) { this._ch = G.ch; this.sync(); }
      this.tryOn(); SM.settle(this, dt);
    },
    pointer() { /* the world handles taps */ },
    draw() { /* WebGL */ },
  }));

  /* ------------------------------------------------------------------ hood map */
  mk('map', E.scenes.map, Object.assign({}, common, {
    world: 'hood',
    enter() {
      this.reset(); this.sel = null; this.card = null; const gates = SM.gates(), locks = {}; for (const id of SM.DOORS) if (gates[id].locked) locks[id] = true;
      const here = G.ch.place && G.ch.place !== 'street' ? G.ch.place : 'street';
      return R3.load('hood', Object.assign(this.baseArgs(), { here, locks })).then((w) => {
        if (E.scene !== this || !w) return;
        this.w = w; SM.bind(this, w, 'hood'); E.music('street'); this.build(); this.sync();
      });
    },
    leave() { this.unmountHud(); this.w = null; this.activeSpot = null; if (this.card) { this.card.remove(); this.card = null; } },
    build() {
      E.clearUI(); this.card = null;
      this.mountHud({ nav: false, goal: true, menu: true, map: false });
      const top = 'calc(var(--h3-top, 56px) / var(--S, 1) + 4px)';
      E.add(E.btn('BACK', '', () => G.resume(), { position: 'absolute', left: '4px', top, width: '44px', height: '17px', padding: '5px 0', fontSize: '5px' }));
      E.add(E.h('div', { style: { position: 'absolute', left: '54px', right: '4px', top, height: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '99px', background: 'rgba(23,16,43,.62)', color: '#fff6e8', font: "700 calc(12px / var(--S, 1)) / 1 var(--f3, 'Trebuchet MS', sans-serif)", letterSpacing: '.08em', pointerEvents: 'none' } }, 'TAP A PLACE TO TRAVEL'));
    },
    sync() { if (this.w) this._gate = SM.applyGates(this.w, this._gate); },
    update(dt) {
      if (!this.w) return;
      if (G.ch !== this._ch) { this._ch = G.ch; this.sync(); }
      SM.settle(this, dt);
    },
    pointer() { /* the world handles taps */ },
    draw() { /* WebGL */ },
  }));
})(typeof globalThis !== 'undefined' ? globalThis : this);
