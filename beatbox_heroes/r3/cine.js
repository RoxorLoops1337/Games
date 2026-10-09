// BEATBOX HEROES r3 -- cine.js (CINE). The game side of the cutscene engine (park3d/cine.js): films, the 3D opening, story beats as staged scenes, the morning after.
// Classic script, loaded after r3/scenes_world.js and activity.js. Nothing here runs in 2D: every entry point checks R3Cine.enabled() and falls back to the 2D path (the intro plates,
// E.dialog with the same lines, the morning card) when 3D is off, the engine chunk cannot load, or a film throws.
//
//   BBH.R3Cine.film(id, ctx) -> Promise<info>    plays a film from park3d/cine_reels.js FILMS. A film is a list of reels; a reel with .world loads that world first (under the dip),
//                                                a reel without plays in the world that is up now. info = { id, ok, skipped, reels, errors, t, error? }. Never rejects.
//   BBH.R3Cine.enabled()  3D presenting and cutscenes not switched off (Settings: E.settings.cine === false, or ?cine=0)
//   BBH.R3Cine.has(id)    a story beat that has a staged version (STORY_FILMS)       BBH.R3Cine.playing (film id or null)   BBH.R3Cine.last (info of the last film)   BBH.R3Cine.log (ids played)
//   BBH.R3Cine.onReel = fn(cine, reel)   test and tool hook, called as each reel starts (tools/beatbox_heroes/cine_shot.mjs freezes it there)
//   BBH.R3Cine.skip()     skips the running film (the SKIP button and hold to skip do the same)    BBH.R3Cine.cur (the running cine object, for tests: .advance(sec), .state())
// Hooks installed here:
//   E.scenes3d.intro            the opening film instead of the six painted plates (sets flags.intro, then the street tutorial or G.resume, exactly like the 2D scene)
//   E.scenes3d.place.firstVisit story beats (G.takeStoryBeats) become films in the place's own world; first visit lines and beats without a film still play as one dialog
//   G.playStory                 the same for a beat that arrives while a place is already up
//   G.showMorning               the first morning (day 2) and the 02:00 collapse play a short film in the flat before the morning card
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3, G = BBH && BBH.G, Core = BBH && BBH.Core;
  if (!E || !R3 || !G || !Core || !E.scenes3d) return;
  const STORY_FILMS = { firstJam: 1, sightJam: 1, sightBusk: 1, meet: 1, pigpen: 1, famous: 1, firstWin: 1, firstLoss: 1, firstShowcase: 1, champion: 1 };
  const C = BBH.R3Cine = { playing: null, last: null, log: [], cur: null, failed: {}, mod: null, STORY_FILMS };
  const $ = (id) => document.getElementById(id);
  const nop = () => {};
  const safe = (fn, d) => { try { return fn(); } catch (e) { console.error('[r3 cine]', e); return d; } };
  let qs = null; try { qs = new URLSearchParams(root.location.search); } catch (e) { qs = new URLSearchParams(''); }
  const reduce = () => safe(() => !!E.settings.reduce || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches), false);
  C.enabled = () => !!(R3.on && R3.active && R3.host && qs.get('cine') !== '0' && !(E.settings && E.settings.cine === false));
  C.has = (id) => !!STORY_FILMS[id];

  // the engine chunk: ESM entry (http) or the IIFE bundle (file://)
  C.load = function () {
    if (C.mod) return Promise.resolve(C.mod);
    const core = R3.core || root.Park3D; if (!core || typeof core.loadCine !== 'function') return Promise.reject(new Error('no cutscene engine in this build'));
    return core.loadCine().then((m) => { C.mod = m; return m; });
  };
  const idle = (fn) => { if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(fn, { timeout: 5000 }); else setTimeout(fn, 2500); };
  if (R3.listen) R3.listen('ready', () => idle(() => { if (R3.on) C.load().catch(nop); }));

  const audio = {
    sfx: (n, o) => E.sfx(n, o), drum: (id, o) => safe(() => E.A().drum(id, o)), now: () => safe(() => E.A().now(), 0),
    music: (id, o) => E.music(id, o), stop: (f) => safe(() => E.A().music.stop(f)),
  };
  function cast() {
    const names = { hero: (G.ch && G.ch.name) || 'YOU', boss: 'BOSS', famous: '???' }, looks = {};
    for (const id in Core.NPCS) { names[id] = Core.NPCS[id].name; looks[id] = Core.NPCS[id].look; }
    return { names, looks };
  }
  // the hero's look while the opening plays: the save if there is one, else the newest save or a random hero (the title does the same)
  const heroLook = () => (G.ch && G.ch.look) || (G.heroLook ? G.heroLook() : undefined);
  function chrome(on) {
    document.body.classList.toggle('cine-on', !!on);
    if (!$('cine-css')) { const st = document.createElement('style'); st.id = 'cine-css'; st.textContent = 'body.cine-on #hud3, body.cine-on #stage, body.cine-on #r3kit .k3-lay, body.cine-on #glwrap .p3-go, body.cine-on #glwrap .p3-stick { visibility: hidden !important; }'; document.head.appendChild(st); }
  }

  /* ------------------------------------------------------------------ films */
  C.skip = () => { if (C.film_) C.film_.skip(); };
  // a landscape window: films go wide (R3.setWide), and the way back to the 9:16 column happens under a short dip
  const wideEffective = () => root.innerWidth > root.innerHeight * 9 / 16 + 4;
  C.film = function (id, fctx) {
    fctx = fctx || {};
    if (C.playing) return Promise.resolve({ id, ok: false, error: 'busy' });
    if (!C.enabled()) return Promise.resolve({ id, ok: false, error: 'off' });
    C.playing = id; const t0 = performance.now(), info = { id, ok: false, skipped: false, reels: 0, errors: 0, t: 0 };
    let scr = null, skipped = false, cur = null, wide = false, firstDone = false;
    const F = C.film_ = { skip() { skipped = true; if (cur) cur.skip(); } };
    const first = () => { if (!firstDone) { firstDone = true; if (fctx.onFirst) safe(() => fctx.onFirst()); } };
    const finish = (err) => {
      info.t = +((performance.now() - t0) / 1000).toFixed(2); info.skipped = skipped; if (err) { info.error = String(err && err.message || err); console.error('[r3 cine] film ' + id + ' failed', err); } else info.ok = true;
      C.playing = null; C.cur = null; C.film_ = null; C.last = info; C.log.push(id); first();
      safe(() => R3.setBeatSource(null)); safe(() => R3.holdSync(false)); chrome(false);
      const keepDip = fctx.keepDip && scr && !err;
      if (keepDip) { info.screen = scr; safe(() => R3.setWide(false)); return info; }
      if (!scr) { safe(() => R3.setWide(false)); return info; }
      const sc = scr; sc.clearSub(150); sc.skipUI(false);
      if (wide) { sc.dip(1, 200); return wait(230).then(() => { safe(() => R3.setWide(false)); sc.letterbox(0, 0); sc.dip(0, 380); return wait(400); }).then(() => { safe(() => sc.dispose()); return info; }); }
      sc.letterbox(0, 420); sc.root.style.pointerEvents = 'none'; return wait(440).then(() => { safe(() => sc.dispose()); safe(() => R3.setWide(false)); return info; });
    };
    return C.load().then((M) => {
      const all = M.FILMS[id]; if (!all) throw new Error('no film ' + id);
      const cs = cast(), film = all(Object.assign({ look: heroLook(), name: cs.names.hero, ch: G.ch, Core, reduce: reduce(), q: R3.quality }, fctx));
      const reels = (film.reels || []).filter(Boolean); if (!reels.length) throw new Error('film ' + id + ' has no reels');
      chrome(true); wide = film.wide !== false && wideEffective(); if (wide) R3.setWide(true); if (film.holdSync) R3.holdSync(true);
      scr = M.createScreen({ box: $('glwrap'), canvas: $('gl'), reduce: reduce(), low: R3.quality === 'low', onTap: () => { if (cur) cur.tap(); }, onSkip: () => F.skip() });
      if (film.dipIn) scr.dip(1, 0, film.dipColor);
      scr.letterbox(film.letterbox === undefined ? 'scope' : film.letterbox, film.letterboxMs === undefined ? 900 : film.letterboxMs);
      setTimeout(() => { if (scr && !scr.dead) scr.skipUI(true); }, 900);
      let i = 0;
      const next = () => {
        if (skipped || i >= reels.length) return Promise.resolve();
        const r = reels[i++], last = i === reels.length; info.reels++;
        const need = !!r.world && (!R3.world || R3.world.id !== r.world || !!r.reload), dipMs = r.dipMs === undefined ? 450 : r.dipMs;
        let card = null;
        const ready = need ? (scr.dip(1, dipMs, r.dipColor), wait(dipMs + 20).then(() => { if (r.card) card = scr.title(r.card); return R3.load(r.world, Object.assign({ look: heroLook() }, r.args || {})); })) : Promise.resolve(R3.world);
        const shown = performance.now();
        return ready.then((w) => {
          if (!w) throw new Error('world ' + r.world + ' did not load');
          if (skipped) return null;
          if (r.setup) safe(() => r.setup(w));
          const blendOut = last && !wide && r.blendOut !== false ? (r.blendOut || 700) : 0;
          const c = cur = C.cur = M.createCine(w, r.reel, { screen: scr, audio, names: cs.names, looks: cs.looks, reduce: reduce(), low: R3.quality === 'low', blendOut, controls: r.controls,
            onFinish: () => { if (last && blendOut && !fctx.keepDip) scr.letterbox(0, blendOut); } });
          R3.setBeatSource(() => c.pulse);
          const p = c.play(); if (C.onReel) safe(() => C.onReel(c, r));
          // the dip lifts once the reel has drawn its first shot twice, and a chapter card has been up for its minimum time
          const lift = () => { const st = c.state(); if (st.done) return; if (st.frames >= 2 && performance.now() - shown >= (card ? r.cardMs || 1800 : 0)) { if (card) card.out(500); scr.dip(0, r.dipOutMs === undefined ? 650 : r.dipOutMs); first(); } else setTimeout(lift, 40); };
          if (need || (film.dipIn && i === 1)) setTimeout(lift, 40); else first();
          return p.then((res) => { info.errors += res.errors || 0; cur = null; if (res.skipped) skipped = true; });
        }).then(next);
      };
      return next().then(() => (film.outro && !skipped ? safe(() => film.outro(scr), null) : null)).then(() => finish(), (e) => finish(e));
    }).catch((e) => finish(e));
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------------ the opening (replaces the six intro plates in 3D) */
  const intro2d = E.scenes.intro;
  const pick0 = E.pickScene;
  E.pickScene = function (name) { if (name === 'intro' && (C.failed.intro || !C.enabled0())) return E.scenes.intro; return pick0.call(E, name); };
  C.enabled0 = () => !!(R3.on && R3.host && qs.get('cine') !== '0' && !(E.settings && E.settings.cine === false));
  if (intro2d) {
    const s = Object.create(intro2d);
    Object.assign(s, {
      is3d: true, world: 'cine',
      enter(a) {
        this.next = a.next; this.finished = false; E.clearUI(); safe(() => E.A().music.stop(0.6));
        let first = null; const firstP = new Promise((res) => { first = res; });
        const done = (info) => {
          first(); if (E.scene !== this) { if (info.screen) safe(() => info.screen.dispose()); return; }
          if (!info.ok && !this.finished) { C.failed.intro = true; if (info.screen) safe(() => info.screen.dispose()); E.go('intro', { next: this.next }, { nofade: true }); return; }
          this.land(info);
        };
        C.film('opening', { keepDip: true, onFirst: () => first(), next: this.next }).then(done, (e) => done({ ok: false, error: String(e) }));
        // E.go reveals a 3D scene when enter resolves: resolve with the first reel (its world is built and the dip is up), or at once when the film refused to start
        return Promise.race([firstP, wait(15000)]);
      },
      // same ending as the 2D scene: flags.intro, then the tutorial street (new game) or back to where the save was
      land(info) {
        if (this.finished) return; this.finished = true;
        const ch = G.ch; if (ch) { ch.flags.intro = 1; G.setChar(ch); G.flush(); }
        E.fadeTo(1, 1); const scr = info && info.screen;
        setTimeout(() => { if (scr) safe(() => scr.dispose()); if (this.next === 'new') E.go('street', { tutorial: true }, { ms: 60 }); else G.resume(); }, 60);
      },
      end() { C.skip(); },
      leave() { if (C.playing === 'opening') C.skip(); },
      advance() {},
      update() { this.w = R3.world; },
      draw() {},
    });
    E.scenes3d.intro = s;
  }

  /* ------------------------------------------------------------------ story beats in the places */
  // beats: [{ id, lines }]. Films first (in order), then one dialog with the first visit lines and every beat that has no film, then G.storyDone()
  C.beats = function (scene, beats, extra) {
    const rest = (extra || []).slice(), films = [];
    for (const b of beats) { if (b.id && C.has(b.id) && C.enabled()) films.push(b); else rest.push(...b.lines); }
    let i = 0;
    const tail = () => { if (E.scene !== scene) { safe(() => G.storyDone()); return; } if (rest.length) E.dialog(rest, () => { if (G.storyDone) G.storyDone(); }); else safe(() => G.storyDone()); };
    const next = () => {
      if (i >= films.length || E.scene !== scene) { tail(); return; }
      const b = films[i++];
      C.film(b.id, { lines: b.lines, place: scene.id }).then((info) => { if (!info.ok && info.error !== 'busy') rest.unshift(...b.lines); next(); });
    };
    next();
    return films.length + rest.length;
  };
  const P3 = E.scenes3d.place;
  if (P3) {
    P3.firstVisit = function () {
      const f = G.ch.flags, key = 'visited_' + this.id, first = !f[key]; if (first) G.do({ t: 'flag', k: key });
      const beats = G.takeStoryBeats ? G.takeStoryBeats(this.id) : [{ id: null, lines: G.takeStory ? G.takeStory(this.id) : [] }];
      C.beats(this, beats, first ? this.firstLines() : []);
    };
  }
  const play0 = G.playStory;
  G.playStory = function (then) {
    const S = E.scene; if (!(S && S.is3d && E.sceneName === 'place' && C.enabled() && G.takeStoryBeats)) return play0.apply(G, arguments);
    const beats = G.takeStoryBeats(S.id), n = C.beats(S, beats, []); if (then) then(); return n;
  };

  /* ------------------------------------------------------------------ the morning after (flat) */
  const morning0 = G.showMorning;
  G.showMorning = function (then) {
    const f = G.pendingMorning, w = R3.world;
    const id = f && (f.cause === 'collapse' ? 'collapse' : f.day === 2 ? 'morning1' : null);
    if (!id || !C.enabled() || !w || w.id !== 'flat') return morning0.apply(G, arguments);
    const args = arguments; C.film(id, { morning: f }).then(() => morning0.apply(G, args));
    return undefined;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
