// BEATBOX HEROES r3 -- scenes_rhythm.js (MG-RHYTHM). The 3D sibling of the rhythm scene: E.scenes3d.rhythm (PORT_PLAN 1, 2.3, 2.11, 3).
// Classic script, loaded after rhythm.js. ONE scene covers every mode of the 2D scene, exactly like E.go('rhythm', args) does today:
//   perform  busk (park stage, golden hour street world) | openmic and karaoke (bar stage, LED wall) | showcase (gold stage, pyro, 30 spectators)
//   practice drills at the lab booth (ghost beat lines)          battle  the arena: VS splash, style picker, 3 rounds, the rival's turn, 5 judges revealing votes, verdict card
// The rules and the state changes are the 2D ones, not a copy: the scene only presents.  The 3D game (park3d/mg_rhythm.js, world 'rhythm') plays the set on the shared host renderer; this file wires it to the real game:
//   * perform / practice: when the set ends the scene calls args.onDone(result) (the same closure places.js hands to the 2D scene: G.doHold + G.showResult + G.finishActivity). G.showResult is intercepted for that one
//     call so the 3D result card shows the REAL rewards (setRewards) and its CONTINUE button runs the 'then' of showResult (G.finishActivity: held effects, morning card or back to the place).
//   * battle: mg_rhythm calls opts.resolveBattle(payload) when the third round ends; the scene runs G.doHold({ t:'battle', ... }) (Core.apply, one random draw, state changes now) and hands back the real votes.
//     The judges reveal exactly those votes; CONTINUE plays the held effects and calls args.onDone({ win, out }) like rhythm.js does.
//   * BACK asks LEAVE? (like the 2D confirm) and then calls args.onAbort (back to the place world); losing the tab mid set does the same, no rewards.
//   * offset, mic and mic persistence come from E.settings like the 2D scene (E.settings.offset in ms, E.settings.mic).
// Test hooks: E.scene.mg (the game object: tick(sec), bot(o), press(lane), state(), result(), pick(styleId), quit({force:true})), E.scene.ctl.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3, Core = BBH && BBH.Core;
  if (!E || !R3 || !E.scenes3d || !E.scenes || !E.scenes.rhythm || !Core) return;
  const G = BBH.G = BBH.G || {};
  const STAGE = ['pink', 'cyan', 'lime', 'gold'];

  // which venue dresses the set (PORT_PLAN 3): kind decides for perform, drills happen in the booth, battles in the arena
  function venueFor(a, mode) {
    if (a.venue) return a.venue;
    if (mode === 'battle') return 'arena';
    if (mode === 'practice') return 'booth';
    return a.kind === 'openmic' || a.kind === 'karaoke' ? 'bar' : a.kind === 'showcase' ? 'showcase' : 'busk';
  }

  const base = E.scenes.rhythm, S3 = Object.create(base);
  Object.assign(S3, {
    is3d: true, world: 'rhythm',
    enter(a) {
      a = a || {}; this.a = a; this.mode = a.mode || 'perform'; this.battle = this.mode === 'battle'; this.opp = a.opp || null; this.mg = null; this.ctl = null; this.then = null; this.held = null; this.verdict = null; this.rw = null; this.dead = false; this.done = false; this.cd = false; this.qd = false; this.lastPhase = ''; this.unsub = [];   // the scene object is reused: reset every flag
      const mode = this.battle ? 'battle' : this.mode, venue = venueFor(a, mode), ch = G.ch;
      try { E.A().music.stop(0.4); } catch (e) { /* ignore */ }
      E.music('battle', { fade: 0.5 }); try { E.A().music.stop(0.4); } catch (e) { /* ignore */ }     // same two lines as rhythm.js enter()
      try { E.unlockAudio(); } catch (e) { /* ignore */ }
      this.hud = document.createElement('div'); this.hud.id = 'r3rhythm'; this.hud.style.cssText = 'position:fixed;top:0;z-index:5;pointer-events:none;overflow:hidden';
      this.place = () => { const gl = document.getElementById('glwrap'); if (gl && this.hud) { this.hud.style.left = gl.style.left || '0px'; this.hud.style.width = gl.style.width || '100%'; this.hud.style.height = gl.style.height || '100%'; } };
      this.place(); document.body.appendChild(this.hud); root.addEventListener('resize', this.place); this.unsub.push(() => root.removeEventListener('resize', this.place));
      const self = this, theme = a.stage || (this.battle && this.opp ? STAGE[this.opp.style % 4] : 'pink');
      const args = Object.assign({}, a, {
        game: true, mode, venue, theme, hud: this.hud, look: ch.look, stats: ch.stats, you: ch.name || (ch.look && ch.look.name) || 'YOU', youSub: 'LEVEL ' + (ch.level || 1), slot: G.slot || 1,
        offsetMs: E.settings.offset || 0, reduce: !!E.settings.reduce, mic: !!E.settings.mic, onMic: (on) => { E.settings.mic = !!on; try { E.saveSettings(); } catch (e) { /* ignore */ } },
        time: Core.nightness(ch.minutes), tip: a.tip !== false && !(ch.flags && ch.flags.rhythmTip) && !this.battle,
        onContinue: (info) => self.cont(info), resolveBattle: (p) => self.resolve(p),
      });
      return R3.load('rhythm', args).then((w) => {
        if (E.scene !== self || !w) return; self.w = w; self.mg = w.game || (w.mini || null); self.ctl = self.mg;
        const off1 = w.events.on('minigame', (e) => self.finished(e && e.result)), off2 = w.events.on('minigameQuit', () => self.quit());
        [off1, off2].forEach((f) => { if (typeof f === 'function') self.unsub.push(f); });
      });
    },
    leave() {
      this.dead = true; try { E.A().groove.stop(); } catch (e) { /* ignore */ }
      (this.unsub || []).forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); this.unsub = [];
      if (this.hud) { try { this.hud.remove(); } catch (e) { /* ignore */ } this.hud = null; } this.mg = null; this.w = null;
    },
    // a perform or practice set ended: run the real action (the 2D closure) and show its rewards on the 3D card
    finished(res) {
      if (this.dead || this.battle || !res || this.done) return; this.done = true;
      const a = this.a, orig = G.showResult; let cap = null;
      G.showResult = function (f, then) { cap = { f, then }; };                    // the 2D DOM result card is replaced by the 3D one
      try { if (a.onDone) a.onDone(res); } catch (e) { console.error('[r3 rhythm] onDone failed', e); } finally { G.showResult = orig; }
      if (cap) { this.then = cap.then; try { if (this.mg) this.mg.setRewards(cap.f.rw); } catch (e) { /* ignore */ } this.rw = cap.f.rw; this.kindOf = cap.f.kind; }
    },
    // battle verdict from the REAL action: Core.apply decides, the judges only reveal it
    resolve(p) {
      const a = this.a; this.held = G.doHold({ t: 'battle', opp: p.opp, rounds: p.rounds, oppStyles: p.oppStyles, perfects: p.perfects, bestCombo: p.bestCombo, perfectLane: p.perfectLane, final: p.final });
      const f = this.held.fx.find((x) => x.t === 'battleResult'); this.verdict = f; this.rw = f.rw;
      return { votes: f.out.votes, win: f.out.win, out: f.out, rw: f.rw };
    },
    // CONTINUE on the result or verdict card
    cont(info) {
      if (this.dead || this.cd) return; this.cd = true;
      if (this.battle) { try { if (this.held) this.held.play(); } catch (e) { console.error(e); } if (this.a.onDone) this.a.onDone({ win: info && info.win, out: info && info.out }); return; }
      const t = this.then; this.then = null; if (t) t(); else if (this.a.onAbort) this.a.onAbort();
    },
    quit() { if (this.dead || this.qd) return; this.qd = true; if (this.a.onAbort) this.a.onAbort(); },
    update() {
      const mg = this.mg; if (!mg || this.dead) return; const ph = mg.S && mg.S.phase;
      if (ph !== this.lastPhase) { const was = this.lastPhase; this.lastPhase = ph; if (ph === 'judge') E.music('creator', { fade: 0.6 }); else if (ph === 'vs' && was === '') { try { E.sfx('whoosh'); } catch (e) { /* ignore */ } } }
    },
    draw() { /* the stage is the WebGL canvas, the HUD is the game's own DOM */ },
    pointer() { /* the pads are DOM buttons */ },
    key() { return undefined; },
    visibility() { /* mg_rhythm handles a hidden tab itself (game mode: back to the place) */ },
  });
  E.scenes3d.rhythm = S3;
})(typeof globalThis !== 'undefined' ? globalThis : this);
