// BEATBOX HEROES r3 -- scenes_pose.js (POSE). E.scenes3d.pose: the SHOWMANSHIP game (park3d/mg_pose*.js) in the real game, 3D only.
// Classic script, loaded after r3/scenes_train.js. Launched by the training menu (or anything else) with
//   E.go('pose', { level, back: { scene, args }, where: 'home'|'studio', place })   level = the level to play (it starts at once); without a level the level select opens.
// Music OFF while it runs (Audio.gameMode), the mini game plays only its shaker metronome and the move sounds.
// Result -> G.doHold({ t:'trainGame', stat:'show', game:'pose', level, q, where }) exactly once (Core decides the gain and the unlock at q >= 0.7), the real rewards go back to the
// card (mini.setRewards), the save's new trainLv.pose to the level select (mini.setUnlocked). CONTINUE -> the held fx play, back where we came from (a morning first when the day rolled).
// QUIT / BACK before the end -> back where we came from, nothing spent (a.onAbort when the caller gave one).
// The host world id 'pose' -> world_mini.js: registered here at runtime when park3d/worlds.js does not list it yet (the same module instance boot3d.js imported).
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3;
  if (!E || !R3 || !E.scenes3d) return;
  const G = BBH.G = BBH.G || {}, Core = BBH.Core;
  const safe = (fn) => { try { return fn(); } catch (e) { console.error('[r3 pose]', e); return undefined; } };
  const nightN = () => { try { return Core.nightness(G.ch.minutes); } catch (e) { return 0.6; } };
  const A = () => BBH.Audio || null;
  const gameMode = (on) => safe(() => { const a = A(); if (a && a.gameMode) a.gameMode(on, on ? { metronome: 0 } : { restore: true }); else if (on && a && a.music) a.music.stop(0.3); });
  const topLevel = () => { const t = G.ch && G.ch.trainLv; return Math.max(1, (t && t.pose) || 1); };

  // make sure the host knows the world id 'pose' (a mini game world, like run / tuner / ear)
  function ensureWorld() {
    const reg = (m) => { const W = m && m.WORLDS; if (W && !W.pose && W.run) W.pose = W.run; return !!(W && W.pose); };
    if (root.location && root.location.protocol === 'file:') return Promise.resolve(reg(root.Park3D));
    if (root.Park3D && reg(root.Park3D)) return Promise.resolve(true);
    return import(new URL(root.BBH_R3 || 'r3/entry.js', document.baseURI).href).then(reg, () => false);
  }
  function overlay() {
    const o = document.createElement('div'); o.className = 'mg3-ov'; o.style.cssText = 'position:fixed;z-index:3;pointer-events:none;overflow:hidden;touch-action:none';
    const fit = () => { const g = document.getElementById('glwrap'); if (!g) return; const r = g.getBoundingClientRect(); o.style.left = r.left + 'px'; o.style.top = r.top + 'px'; o.style.width = r.width + 'px'; o.style.height = r.height + 'px'; };
    o.addEventListener('pointerdown', () => { try { E.unlockAudio(); } catch (e) { /* ignore */ } }, true);
    fit(); root.addEventListener('resize', fit); o._fit = fit; document.body.appendChild(o); return o;
  }
  const dropOverlay = (o) => { if (!o) return; try { root.removeEventListener('resize', o._fit); } catch (e) { /* ignore */ } if (o.parentNode) o.parentNode.removeChild(o); };
  function snap(ch) { let xp = ch.xp || 0; try { for (let l = 1; l < ch.level; l++) xp += Core.xpNeed(l); } catch (e) { /* ignore */ } return { xp, energy: ch.energy, show: ch.stats.show, minutes: ch.minutes, day: ch.day, cash: ch.cash, lv: (ch.trainLv && ch.trainLv.pose) || 1 }; }

  E.scenes3d.pose = {
    is3d: true, world: 'pose', name: 'pose',
    enter(a) {
      this.a = a || {}; this.held = null; this.gone = false; this.mg = null; this.w = null; this.res = null; this.rw = null;
      gameMode(true);
      this.ov = overlay();
      const top = topLevel(), lv = Math.max(0, Math.min(top, this.a.level | 0));
      const args = { hud: this.ov, look: G.ch && G.ch.look, time: nightN(), unlocked: top, level: lv || top, autostart: !!lv, settings: E.settings, offsetMs: E.settings.offset | 0, embedded: true, again: false, reduce: !!E.settings.reduce };
      return ensureWorld().then(() => (E.scene === this ? R3.load('pose', args) : null)).then((w) => {
        if (E.scene !== this || !w) return; this.w = w; this.mg = w.game || null; if (!this.mg) return;
        w.events.on('minigame', (r) => { if (!this.gone && E.scene === this) safe(() => this.onResult(r && r.result ? r.result : r)); });
        w.events.on('quit', () => { if (!this.gone && E.scene === this) safe(() => this.onQuit()); });
      }).catch((e) => { console.error('[r3 pose] load failed', e); if (E.scene === this) safe(() => this.onQuit()); });
    },
    leave() { this.gone = true; dropOverlay(this.ov); this.ov = null; this.mg = null; this.w = null; gameMode(false); },
    update() { /* the world host drives the mini game */ }, draw() { /* WebGL */ },
    // commit the real action once: Core decides the Showmanship gain, the time and energy spent and the level unlock
    onResult(r) {
      if (this.held || !r || !G.ch) return; this.res = r;
      const pre = snap(G.ch); this.held = G.doHold({ t: 'trainGame', stat: 'show', game: 'pose', level: r.level, q: r.q, where: this.a.where === 'studio' ? 'studio' : 'home' }); const post = snap(G.ch);
      const unlocked = this.held.fx.some((f) => f.t === 'levelUp' && f.game === 'pose');
      this.rw = { show: post.show - pre.show, xp: Math.round(post.xp - pre.xp), energy: Math.round(post.energy - pre.energy), cash: post.cash - pre.cash, minutes: post.day === pre.day ? post.minutes - pre.minutes : 20, unlocked, level: post.lv };
      safe(() => { if (this.mg.setUnlocked) this.mg.setUnlocked(post.lv); if (this.mg.setRewards) this.mg.setRewards(this.rw); });
    },
    onQuit() {
      if (this.gone) return; this.gone = true; const a = this.a, place = a.place || (a.back && a.back.args && a.back.args.id) || 'home';
      if (this.held) {
        const held = this.held; held.play({ morning: (f) => { G.pendingMorning = f; }, levelUp: () => {} });
        if (G.pendingMorning) { E.go('place', { id: 'home', morningFirst: true }); return; }
        if (a.back && a.back.scene) E.go(a.back.scene, a.back.args); else E.go('place', { id: place });
        return;
      }
      if (typeof a.onAbort === 'function') { a.onAbort(); return; }
      if (a.back && a.back.scene) E.go(a.back.scene, a.back.args); else E.go('place', { id: place });
    },
  };
  // 2D: no E.scenes.pose on purpose. The training menu checks E.pickScene('pose') and falls back to the 2D rhythm drill when it is missing.
})(typeof globalThis !== 'undefined' ? globalThis : this);
