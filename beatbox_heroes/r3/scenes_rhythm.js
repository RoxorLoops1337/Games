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
//   * busking and battles run as call and response (mg_rhythm S.cr: the hero plays each 2 bar phrase as ghost gems, then you play it); a.own (open mic, auto busk)
//     hands mg_rhythm the player's Beat Maker beats (args.ownBeats).
//   * offset, mic and mic persistence come from E.settings like the 2D scene (E.settings.offset in ms, E.settings.mic).
//   * MUSIC OFF (TRAINING_PLAN): no scene music and no backing groove in any mode (busk, open mic, karaoke, showcase, practice, battles, training). mg_rhythm runs a soft
//     shaker metronome at the chart bpm (Audio.gameMode or its local fallback) and only the beatbox sounds of whoever plays; leave() hands the music back (the place plays its own track).
//   * train: E.go('rhythm', { mode:'train', level?, where?, back?, onExit?(held), onAbort? }) RHYTHM TRAINING in the lab booth (practice look). Every finished level runs
//     G.doHold({ t:'trainGame', stat:'tech', game:'beat', level, q }) (Core unlocks the next level at 70%), the card shows the stat gain and xp; NEXT / AGAIN / LEVELS play the held
//     effects and go on, CONTINUE plays them through G.finishActivity (or a.onExit(held)) back to a.back (default: the current place). Best grades live in ch.flags.beatBest.
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
    if (mode === 'practice' || mode === 'train') return 'booth';
    return a.kind === 'openmic' || a.kind === 'karaoke' ? 'bar' : a.kind === 'showcase' ? 'showcase' : 'busk';
  }

  const base = E.scenes.rhythm, S3 = Object.create(base);
  Object.assign(S3, {
    is3d: true, world: 'rhythm',
    enter(a) {
      a = a || {}; this.a = a; this.mode = a.mode || 'perform'; this.battle = this.mode === 'battle'; this.opp = a.opp || null; this.mg = null; this.ctl = null; this.then = null; this.held = null; this.verdict = null; this.rw = null; this.dead = false; this.done = false; this.cd = false; this.qd = false; this.lastPhase = ''; this.unsub = [];   // the scene object is reused: reset every flag
      const mode = this.battle ? 'battle' : this.mode, venue = venueFor(a, mode), ch = G.ch;
      try { E.A().music.stop(0.4); } catch (e) { /* ignore */ }                                    // music off: mg_rhythm keeps it off (gameMode) until leave()
      this.train = this.mode === 'train'; this.heldT = null; this.back = (a.back && a.back.args && a.back.args.id) || (typeof a.back === 'string' ? a.back : null) || a.place || (ch && ch.place) || 'studio';
      try { E.unlockAudio(); } catch (e) { /* ignore */ }
      this.hud = document.createElement('div'); this.hud.id = 'r3rhythm'; this.hud.style.cssText = 'position:fixed;top:0;z-index:5;pointer-events:none;overflow:hidden';
      this.place = () => { const gl = document.getElementById('glwrap'); if (gl && this.hud) { this.hud.style.left = gl.style.left || '0px'; this.hud.style.width = gl.style.width || '100%'; this.hud.style.height = gl.style.height || '100%'; } };
      this.place(); document.body.appendChild(this.hud); root.addEventListener('resize', this.place); this.unsub.push(() => root.removeEventListener('resize', this.place));
      const self = this, theme = a.stage || (this.battle && this.opp ? STAGE[this.opp.style % 4] : this.train ? 'cyan' : 'pink');
      const args = Object.assign({}, a, {
        game: true, mode, venue, theme, hud: this.hud, look: ch.look, stats: ch.stats, you: ch.name || (ch.look && ch.look.name) || 'YOU', youSub: 'LEVEL ' + (ch.level || 1), slot: G.slot || 1,
        offsetMs: E.settings.offset || 0, reduce: !!E.settings.reduce, mic: !!E.settings.mic, settings: E.settings, onMic: (on) => { E.settings.mic = !!on; try { E.saveSettings(); } catch (e) { /* ignore */ } },
        time: Core.nightness(ch.minutes), tip: a.tip !== false && !(ch.flags && ch.flags.rhythmTip) && !this.battle,
        onContinue: (info) => self.cont(info), resolveBattle: (p) => self.resolve(p),
        acts: () => (G.retActs && !self.train ? G.retActs({ only: !!a.final }) : null),       // AGAIN / BACK / CONTINUE on the result and verdict cards (activity.js)
      });
      // open mic and auto busk play YOUR Beat Maker beats (Core.ownBeats: the slots with 4+ hits); none saved: mg_rhythm falls back to the easy B t K t family
      if (a.own && mode === 'perform' && Core.ownBeats) args.ownBeats = Core.ownBeats(ch.patterns);
      // continuous busking: the live clock starts at the real time of day (ch.minutes 0 = 06:00) and the set wraps up before the hero runs out of energy or hits 01:30 (the 02:00 collapse)
      if (a.endless && mode === 'perform') { const perMin = 12 / 60, eMin = Math.max(15, ((ch.energy || 0) - 3) / perMin), lateMin = Math.max(15, 1170 - (ch.minutes || 0)); Object.assign(args, { endless: true, clockMin: 360 + (ch.minutes || 0), maxMinutes: Math.min(eMin, lateMin), maxWhy: lateMin < eMin ? 'late' : 'tired' }); }
      if (this.train) Object.assign(args, { title: a.title || 'RHYTHM TRAINING', sub: a.sub || 'level ' + (a.level || ((ch.trainLv && ch.trainLv.beat) || 1)), tip: false, progress: this.progress() });
      return R3.load('rhythm', args).then((w) => {
        if (E.scene !== self || !w) return; self.w = w; self.mg = w.game || (w.mini || null); self.ctl = self.mg;
        const off1 = w.events.on('minigame', (e) => self.finished(e && e.result)), off2 = w.events.on('minigameQuit', () => self.quit());
        [off1, off2].forEach((f) => { if (typeof f === 'function') self.unsub.push(f); });
      });
    },
    leave() {
      try { if (this.mg && this.mg.click) this.mg.click.musicOn(); } catch (e) { /* ignore */ }      // the music comes back before the next scene starts its track
      this.dead = true; try { E.A().groove.stop(); } catch (e) { /* ignore */ }
      (this.unsub || []).forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); this.unsub = [];
      if (this.hud) { try { this.hud.remove(); } catch (e) { /* ignore */ } this.hud = null; } this.mg = null; this.w = null;
    },
    // a perform or practice set ended: run the real action (the 2D closure) and show its rewards on the 3D card
    progress() { const ch = G.ch || {}; return { unlocked: (ch.trainLv && ch.trainLv.beat) || 1, best: Object.assign({}, (ch.flags && ch.flags.beatBest) || {}) }; },
    // a training level ended: the real action now (held until the card is left), the card shows the stat gain, the game learns the new unlock / best grade
    trained(res) {
      this.flushTrain(); const ch0 = G.ch, tech0 = ch0.stats.tech, xp0 = ch0.xp, lv0 = ch0.level, where = this.a.where || (ch0.place === 'studio' ? 'studio' : 'home');
      let held = null; try { held = G.doHold({ t: 'trainGame', stat: 'tech', game: 'beat', level: res.level, q: res.q, where }); } catch (e) { console.error('[r3 rhythm] trainGame failed', e); }
      this.heldT = held; const f = held && held.fx.find((x) => x.t === 'trainResult'), ch = G.ch;
      const best = Object.assign({}, (ch.flags && ch.flags.beatBest) || {}), old = best[res.level], rk = 'SABCD';
      if (f && (!old || rk.indexOf(res.grade) < rk.indexOf(old))) { best[res.level] = res.grade; try { G.do({ t: 'flag', k: 'beatBest', v: best }); } catch (e) { /* ignore */ } }
      this.rw = { cash: 0, fans: 0, xp: Math.max(0, Math.round(ch.xp - xp0 + (() => { let n = 0; for (let l = lv0; l < ch.level; l++) n += Core.xpNeed ? Core.xpNeed(l) : 0; return n; })())), gain: f ? f.gain : Math.max(0, ch.stats.tech - tech0), stat: 'TECH' };
      try { if (this.mg) this.mg.setTrainProgress(this.progress(), this.rw); } catch (e) { /* ignore */ }
    },
    // play the held effects of the last level (toasts, level up, unlocks); a day roll-over means the morning card: leave for home
    flushTrain() { const h = this.heldT; this.heldT = null; if (!h) return true; try { h.play({ morning: (f) => { G.pendingMorning = f; } }); } catch (e) { console.error(e); } return !G.pendingMorning; },
    finished(res) {
      if (this.dead || !res) return; if (this.train) { if (res.mode === 'train') this.trained(res); return; }
      if (this.battle || this.done) return; this.done = true;
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
      if (this.dead || this.cd) return;
      if (this.train && info && info.train) {
        if (info.act === 'menu') { if (G.retMode) G.retMode('menu'); info = Object.assign({}, info, { act: 'continue' }); }   // BACK: the training menu that launched it
        if (info.act !== 'continue') { if (this.flushTrain()) { try { if (this.mg) this.mg.setTrainProgress(this.progress()); } catch (e) { /* ignore */ } return true; } }
        this.cd = true; const h = this.heldT || { play() {} }; this.heldT = null;
        if (this.a.onExit) this.a.onExit(h); else if (G.pendingMorning) { try { h.play({ morning: (f) => { G.pendingMorning = f; } }); } catch (e) { /* ignore */ } E.go('place', { id: 'home', morningFirst: true }); } else G.finishActivity(h, this.back);
        return false;
      }
      this.cd = true;
      if (this.battle) { try { if (this.held) this.held.play(); } catch (e) { console.error(e); } if (this.a.onDone) this.a.onDone({ win: info && info.win, out: info && info.out }); return; }
      const t = this.then; this.then = null; if (t) t(); else if (this.a.onAbort) this.a.onAbort();
    },
    quit() {
      if (this.dead || this.qd) return; this.qd = true;
      if (this.train) { const h = this.heldT; this.heldT = null; if (h) { G.finishActivity(h, this.back); return; } if (this.a.onAbort) this.a.onAbort(); else E.go('place', { id: this.back }); return; }
      if (this.a.onAbort) this.a.onAbort();
    },
    update() {
      const mg = this.mg; if (!mg || this.dead) return; const ph = mg.S && mg.S.phase;
      if (ph !== this.lastPhase) { const was = this.lastPhase; this.lastPhase = ph; if (ph === 'vs' && was === '') { try { E.sfx('whoosh'); } catch (e) { /* ignore */ } } }
    },
    draw() { /* the stage is the WebGL canvas, the HUD is the game's own DOM */ },
    pointer() { /* the pads are DOM buttons */ },
    key() { return undefined; },
    visibility() { /* mg_rhythm handles a hidden tab itself (game mode: back to the place) */ },
  });
  E.scenes3d.rhythm = S3;
})(typeof globalThis !== 'undefined' ? globalThis : this);
