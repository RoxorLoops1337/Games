// BEATBOX HEROES -- minigames.js: the Beatbox Story mini games, rebuilt.
//   run      Sprint pace (alternate left / right taps to keep the bar in the target zone)
//   tuner    Pitch Tuner (sing the note into your mic; ear training when there is no mic)
//   seq      Beat Maker (16 step sequencer, 4 slots, release songs)
//   studio   Sound Recorder (record your own B, T, K and Pf; they replace the synth drums)
// plus the Songs, Crew, Livestream and Coaching panels used by the places.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, PAL = BBH.PAL, G = BBH.G = BBH.G || {};
  const h = E.h, L = E.Lctx, K = E.K;
  const LANES = [['B', 'KICK', '#ff4f6a'], ['T', 'HAT', '#ffd23f'], ['K', 'SNARE', '#2ee6ff'], ['PF', 'CLAP', '#c07bff']];
  const MicOK = () => !!(BBH.Mic && BBH.Mic.open);
  const sheetBtn = (label, sub, cls, fn) => { const b = E.btn('', cls || '', fn, { textAlign: 'left', padding: '5px 6px 6px' }); b.appendChild(h('div.col', { style: { gap: '2px' } }, h('div', null, label), sub ? h('div', { style: { fontFamily: "'Silkscreen'", fontSize: '8px', color: '#d9c9ff' } }, sub) : null)); return b; };
  const back = (to) => { if (to && to.scene === 'place') E.go('place', to.args); else E.go((to && to.scene) || 'street'); };

  // a plain synth tone for the tuner (respects mute)
  E.tone = function (freq, dur, vol) {
    try {
      const A = BBH.Audio; if (E.settings.muted || !A) return; A.unlock && A.unlock(); const ac = A.ctx; if (!ac || ac.state !== 'running') return;
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((vol || 0.18) * E.settings.sfx, t + 0.04); g.gain.setValueAtTime((vol || 0.18) * E.settings.sfx, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); o2.connect(g); g.connect(ac.destination); o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    } catch (e) { /* audio must never break the game */ }
  };

  function resultCard(title, rows, then) {
    const box = h('div.panel.pop', { style: { left: '16px', right: '16px', top: '110px', padding: '10px', zIndex: 30, textAlign: 'center' } },
      h('div.h1', null, title), h('div.col', { style: { gap: '4px', margin: '8px 0' } }, rows.map((r) => h('div.row', { style: { justifyContent: 'space-between' } }, h('div.ts', null, r[0]), h('div.t', { style: { color: r[2] || 'var(--cream)' } }, r[1])))),
      E.btn('CONTINUE', 'gold big', () => { box.remove(); then && then(); }));
    E.add(box); E.sfx('levelup'); return box;
  }

  /* ================================================================= RUN */
  const RUN = { GAIN: 12, DRAIN: 25, LO: 60, HI: 85, BLOCK: 2500, BLOCKS: 12 };
  E.scenes.run = {
    enter(a) {
      this.a = a; this.bar = 0; this.last = null; this.flash = null; this.blockT = 0; this.samples = []; this.burn = 0; this.good = 0; this.blocksDone = 0; this.scroll = 0; this.done = false; this.t0 = E.t; this.zonePulse = 0;
      this.look = BBH.Chars.fix(G.ch.look); this.sc = (() => { try { return BBH.World.scene('street', Core.nightness(G.ch.minutes) > 0.5 ? 'night' : 'day'); } catch (e) { return null; } })();
      E.music('park'); E.add(E.makeHud(G));
      E.add(h('div.tp', { style: { position: 'absolute', left: 0, right: 0, top: '44px', textAlign: 'center', color: PAL.cream, fontSize: '6px', zIndex: 5 } }, 'ALTERNATE LEFT - RIGHT. KEEP THE BAR IN THE GREEN.'));
      E.add(E.btn('QUIT', '', () => this.quit(), { position: 'absolute', left: '4px', top: '56px', width: '36px', padding: '3px 2px', fontSize: '5px' }));
    },
    quit() { if (this.done) return; this.done = true; back(this.a.back); },
    tap(side) {
      if (this.done) return;
      if (side === this.last) { this.flash = { side, ok: false, t: 0 }; E.sfx('miss'); return; }
      this.last = side; this.flash = { side, ok: true, t: 0 }; this.bar = Math.min(100, this.bar + RUN.GAIN); E.sfx('step'); E.burst(side === 'L' ? 90 : 270, 560, 4, { color: '#9dff4a', speed: 40, gravity: 60, life: 250 });
    },
    pointer(type, x, y) { if (type === 'down' && y > E.H * 0.7) this.tap(x < E.W / 2 ? 'L' : 'R'); },
    key(code, down) { if (!down) return; if (code === 'KeyA' || code === 'ArrowLeft') { this.tap('L'); return false; } if (code === 'KeyD' || code === 'ArrowRight') { this.tap('R'); return false; } },
    update(dt) {
      if (this.done) return; const s = dt / 1000;
      this.bar = Math.max(0, this.bar - RUN.DRAIN * s); this.samples.push(this.bar); if (this.bar > RUN.HI) this.burn++;
      this.scroll += (20 + this.bar * 2.2) * s; if (this.flash) { this.flash.t += dt; if (this.flash.t > 160) this.flash = null; }
      this.blockT += dt;
      if (this.blockT >= RUN.BLOCK) {
        this.blockT = 0; const avg = this.samples.reduce((a, b) => a + b, 0) / Math.max(1, this.samples.length), burnR = this.burn / Math.max(1, this.samples.length);
        if (avg >= RUN.LO) { this.good++; this.zonePulse = 1; E.sfx('hit_good'); } else E.sfx('miss');
        if (burnR > 0.5) E.toast('Too fast! You are burning energy.', 'warn');
        this.samples = []; this.burn = 0; this.blocksDone++;
        if (this.blocksDone >= RUN.BLOCKS) this.finish();
      }
      this.zonePulse = Math.max(0, this.zonePulse - s * 2);
    },
    finish() {
      this.done = true; const q = this.good / RUN.BLOCKS, goodBars = this.good;
      const held = G.doHold({ t: 'run', q, goodBars }); E.sfx('win'); E.flash('#fff', 160);
      resultCard('RUN COMPLETE', [['Good bars', goodBars + ' / ' + RUN.BLOCKS, 'var(--gold2)'], ['Stamina gain', 'max energy +' + Math.floor(goodBars / 3), 'var(--lime)'], ['Pace', Math.round(q * 100) + '%']], () => G.finishActivity(held, 'park'));
    },
    draw(real, c) {
      const sc = this.sc; real.fillStyle = PAL.night1; real.fillRect(0, 0, E.W, E.H);
      if (sc) for (const l of sc.layers) { const w = l.pix.w, off = Math.floor((this.scroll * (0.3 + l.speed * 0.7)) % w); l.pix.draw(real, -off, 0); l.pix.draw(real, w - off, 0); }
      real.fillStyle = 'rgba(14,9,30,.35)'; real.fillRect(0, 0, E.W, E.H);
      const fy = sc ? sc.floorY : 549, step = this.bar > 5 ? 'walkside' : 'idleside', pose = BBH.Chars.POSES[step] ? step : 'idle';
      E.hero(real, this.look, this.bar > 5 ? (BBH.Chars.POSES.walkside ? 'walkside' : 'walk') : 'idle', 160, fy, { scale: 1, t: E.t * (0.6 + this.bar / 50) });
      void pose;
      // meter
      const mx = 296, my = 130, mh = 300, zone = this.bar >= RUN.HI ? 'burn' : this.bar >= RUN.LO ? 'target' : 'slow';
      c.fillStyle = PAL.ink; c.fillRect(mx / K - 1, my / K - 1, 26, mh / K + 2); c.fillStyle = '#34235a'; c.fillRect(mx / K, my / K, 24, mh / K);
      const yOf = (v) => (my + mh * (1 - v / 100)) / K; c.fillStyle = 'rgba(255,200,60,.5)'; c.fillRect(mx / K, yOf(100), 24, yOf(RUN.HI) - yOf(100)); c.fillStyle = 'rgba(80,230,120,.55)'; c.fillRect(mx / K, yOf(RUN.HI), 24, yOf(RUN.LO) - yOf(RUN.HI));
      const col = zone === 'burn' ? '#ffd23f' : zone === 'target' ? '#7be08f' : '#2ee6ff'; c.fillStyle = col; c.fillRect(mx / K + 2, yOf(this.bar), 20, (my + mh) / K - yOf(this.bar)); c.fillStyle = '#fff'; c.fillRect(mx / K, yOf(this.bar) - 1, 24, 2);
      E.txt(c, zone === 'burn' ? 'BURN' : zone === 'target' ? 'GOOD' : 'SLOW', mx / K + 12, my / K - 10, { align: 'c', color: col });
      E.txt(c, 'GOOD BARS ' + this.good + '/' + RUN.BLOCKS, 12, 66, { color: PAL.gold }); E.txt(c, 'EVERY 3 = +1 MAX ENERGY', 12, 78, { color: PAL.fog });
      // progress
      const prog = (this.blocksDone + this.blockT / RUN.BLOCK) / RUN.BLOCKS; c.fillStyle = PAL.ink; c.fillRect(12, 92, 150, 7); c.fillStyle = PAL.neonLime; c.fillRect(13, 93, Math.round(148 * prog), 5);
      // pads
      for (const side of ['L', 'R']) { const x = side === 'L' ? 12 : 138, f = this.flash && this.flash.side === side ? (this.flash.ok ? 1 : -1) : 0, lit = f === 1;
        c.fillStyle = PAL.ink; c.fillRect(x - 1, 391, 122, 82); c.fillStyle = f === -1 ? '#8f1d3a' : lit ? '#b5f6ff' : '#2a8aa6'; c.fillRect(x, 392, 120, 80); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x + 1, 393, 118, 2); c.fillStyle = '#0f5266'; c.fillRect(x, 464, 120, 8);
        E.txt(c, side === 'L' ? 'LEFT' : 'RIGHT', x + 60, 420, { align: 'c', color: PAL.ink, scale: 2, outline: lit ? '#fff' : '#7cf0ff' }); E.txt(c, side === 'L' ? 'A' : 'D', x + 60, 446, { align: 'c', color: PAL.ink, outline: null }); }
      if (this.last === null) E.txt(c, 'TAP LEFT, THEN RIGHT, THEN LEFT...', 135, 360, { align: 'c', color: PAL.cream, a: 0.6 + 0.4 * Math.sin(E.t / 200) });
    },
  };

  /* ================================================================ TUNER */
  const RANGES = { higher: { name: 'HIGHER VOICE', desc: 'Soprano, alto, kids', roots: [60, 62, 64, 65, 67, 69, 71, 72] }, lower: { name: 'LOWER VOICE', desc: 'Tenor, baritone, bass', roots: [48, 50, 52, 53, 55, 57, 59, 60] } };
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  E.scenes.tuner = {
    enter(a) {
      this.a = a; this.state = 'start'; this.round = 0; this.rounds = 8; this.score = 0; this.inTune = 0; this.total = 0; this.mode = null; this.cents = null; this.freq = 0; this.hold = 0; this.done = false;
      this.look = BBH.Chars.fix(G.ch.look); E.music('studio'); E.add(E.makeHud(G)); this.startUI();
    },
    leave() { try { BBH.Mic && BBH.Mic.close(); } catch (e) { /* ignore */ } },
    startUI() {
      const range = E.settings.voice || null;
      const box = h('div.panel.pop', { style: { left: '12px', right: '12px', top: '70px', padding: '8px', zIndex: 20 } },
        h('div.h1.ctr', null, 'PITCH TUNER'), h('div.ts.ctr', { style: { margin: '4px 0 8px' } }, 'Listen to the note, then sing it into your microphone. Stay in tune to score. No mic? Try ear training.'),
        h('div.col', null,
          sheetBtn(RANGES.higher.name, RANGES.higher.desc, E.settings.voice === 'higher' ? 'gold' : '', () => { E.settings.voice = 'higher'; E.saveSettings(); this.startUI2(box, 'mic'); }),
          sheetBtn(RANGES.lower.name, RANGES.lower.desc, E.settings.voice === 'lower' ? 'gold' : '', () => { E.settings.voice = 'lower'; E.saveSettings(); this.startUI2(box, 'mic'); }),
          sheetBtn('EAR TRAINING', 'No mic needed. Is the second note higher or lower?', 'cyan', () => this.startUI2(box, 'ear')), E.btn('BACK', '', () => back(this.a.back))));
      void range; E.add(box);
    },
    async startUI2(box, mode) {
      box.remove(); this.mode = mode;
      if (mode === 'mic') {
        if (!MicOK()) { E.toast('No mic support here. Using ear training.', 'warn'); this.mode = 'ear'; }
        else { const r = await BBH.Mic.open(); if (!r.ok) { E.toast('Mic: ' + (r.error || 'unavailable') + '. Using ear training.', 'warn'); this.mode = 'ear'; } }
      }
      this.state = 'play'; this.nextRound();
    },
    nextRound() {
      if (this.round >= this.rounds) { this.finish(); return; }
      this.round++; this.hold = 0; this.rt = 0; this.got = false; this.cents = null;
      if (this.mode === 'mic') { const roots = RANGES[E.settings.voice || 'higher'].roots; this.target = roots[Math.floor(Math.random() * roots.length)]; this.phase = 'ref'; E.tone(mf(this.target), 1.1); }
      else { const base = 55 + Math.floor(Math.random() * 12), diff = [1, 2, 3, 5, 7][Math.floor(Math.random() * 5)] * (Math.random() < 0.5 ? 1 : -1); this.earA = base; this.earB = base + diff; this.phase = 'earA'; E.tone(mf(base), 0.7); setTimeout(() => { if (!this.done) { this.phase = 'earB'; E.tone(mf(this.earB), 0.7); } }, 900); setTimeout(() => { if (!this.done) this.phase = 'ask'; this.askUI(); }, 1700); }
    },
    askUI() {
      if (this.askEl) this.askEl.remove();
      this.askEl = h('div.row', { style: { position: 'absolute', left: '12px', right: '12px', bottom: '14px', gap: '6px', zIndex: 10 } },
        E.btn('HIGHER', 'green big', () => this.answer(1), { flex: 1 }), E.btn('LOWER', 'pink big', () => this.answer(-1), { flex: 1 })); E.add(this.askEl);
    },
    answer(dir) {
      if (this.phase !== 'ask') return; this.phase = 'fb'; if (this.askEl) { this.askEl.remove(); this.askEl = null; }
      const ok = Math.sign(this.earB - this.earA) === dir; this.total++; if (ok) { this.score++; E.sfx('hit_perfect'); this.fb = 'RIGHT!'; E.burst(180, 300, 14, { colors: [PAL.neonLime, PAL.gold], speed: 90, up: 40 }); } else { E.sfx('miss'); this.fb = 'WRONG'; }
      setTimeout(() => { this.fb = null; this.nextRound(); }, 800);
    },
    update(dt) {
      if (this.state !== 'play' || this.mode !== 'mic') return; this.rt += dt;
      if (this.phase === 'ref' && this.rt > 1300) { this.phase = 'sing'; this.rt = 0; }
      else if (this.phase === 'sing') {
        let p = null; try { p = BBH.Mic.pitchNow(); } catch (e) { p = null; }
        if (p && p.freq > 0 && p.clarity > 0.55) { this.freq = p.freq; const m = 69 + 12 * Math.log2(p.freq / 440); let d = (m - this.target) * 100; d = ((d + 600) % 1200 + 1200) % 1200 - 600; this.cents = d; if (Math.abs(d) < 50) { this.hold += dt; this.inTune += dt; } else this.hold = Math.max(0, this.hold - dt * 0.5); } else this.cents = null;
        if (this.hold >= 900 && !this.got) { this.got = true; this.score++; this.total++; E.sfx('hit_perfect'); E.burst(180, 300, 16, { colors: [PAL.neonLime, PAL.gold, '#fff'], speed: 100, up: 50 }); this.phase = 'fb'; this.fb = 'IN TUNE!'; setTimeout(() => { this.fb = null; this.nextRound(); }, 900); }
        else if (this.rt > 5000 && !this.got) { this.total++; this.phase = 'fb'; this.fb = 'MISSED'; E.sfx('miss'); setTimeout(() => { this.fb = null; this.nextRound(); }, 800); }
      }
    },
    finish() {
      if (this.done) return; this.done = true; try { BBH.Mic && BBH.Mic.close(); } catch (e) { /* ignore */ }
      const acc = this.score / this.rounds, q = this.mode === 'mic' ? Math.min(1, acc * 0.85 + Math.min(0.15, this.inTune / (this.rounds * 3000) * 0.15)) : acc * 0.7;
      const held = G.doHold({ t: 'tune', q }); resultCard('TUNER RESULT', [['Notes', this.score + ' / ' + this.rounds, 'var(--gold2)'], ['Mode', this.mode === 'mic' ? 'Singing' : 'Ear training'], ['Quality', Math.round(q * 100) + '%']], () => G.finishActivity(held, this.a.place || 'home'));
    },
    draw(real, c) {
      real.fillStyle = PAL.night1; real.fillRect(0, 0, E.W, E.H); const bg = (() => { try { return BBH.World.scene('studio', 'night'); } catch (e) { return null; } })(); if (bg) { bg.layers[0].pix.draw(real, 0, 0); real.fillStyle = 'rgba(14,9,30,.6)'; real.fillRect(0, 0, E.W, E.H); }
      if (this.state !== 'play') return;
      E.txt(c, 'NOTE ' + Math.min(this.round, this.rounds) + '/' + this.rounds, 12, 66, { color: PAL.gold }); E.txt(c, 'SCORE ' + this.score, 258, 66, { align: 'r', color: PAL.cream });
      if (this.mode === 'mic') {
        const nm = NOTE[this.target % 12] + (Math.floor(this.target / 12) - 1);
        E.txt(c, nm, 135, 130, { align: 'c', color: PAL.neonCyan, scale: 5, shadow: PAL.ink }); E.txt(c, this.phase === 'ref' ? 'LISTEN...' : this.phase === 'sing' ? 'SING IT!' : '', 135, 175, { align: 'c', color: PAL.cream, scale: 2 });
        // gauge: -100..+100 cents
        const gx = 25, gw = 220, gy = 260; c.fillStyle = PAL.ink; c.fillRect(gx - 1, gy - 1, gw + 2, 22); c.fillStyle = '#34235a'; c.fillRect(gx, gy, gw, 20); c.fillStyle = 'rgba(80,230,120,.5)'; c.fillRect(gx + gw / 2 - gw / 4, gy, gw / 2, 20); c.fillStyle = '#fff'; c.fillRect(gx + gw / 2 - 1, gy - 6, 2, 32);
        if (this.cents !== null) { const cx = gx + gw / 2 + Math.max(-1, Math.min(1, this.cents / 100)) * gw / 2; c.fillStyle = Math.abs(this.cents) < 50 ? PAL.neonLime : PAL.coral; c.fillRect(cx - 3, gy - 4, 6, 28); E.txt(c, (this.cents > 0 ? '+' : '') + Math.round(this.cents) + ' CENTS', 135, gy + 32, { align: 'c', color: PAL.cream }); } else E.txt(c, this.phase === 'sing' ? 'WAITING FOR YOUR VOICE...' : '', 135, gy + 32, { align: 'c', color: PAL.fog });
        E.txt(c, 'FLAT', gx, gy + 24, { color: PAL.fog }); E.txt(c, 'SHARP', gx + gw, gy + 24, { align: 'r', color: PAL.fog });
        c.fillStyle = PAL.ink; c.fillRect(25, 330, 220, 7); c.fillStyle = PAL.neonLime; c.fillRect(26, 331, Math.round(218 * Math.min(1, this.hold / 900)), 5); E.txt(c, 'HOLD IN TUNE', 135, 342, { align: 'c', color: PAL.fog });
        let lv = 0; try { lv = BBH.Mic.level(); } catch (e) { lv = 0; } c.fillStyle = PAL.ink; c.fillRect(25, 372, 220, 7); c.fillStyle = '#7b4fe0'; c.fillRect(26, 373, Math.round(218 * Math.min(1, lv * 6)), 5); E.txt(c, 'MIC', 25, 382, { color: PAL.fog });
      } else { E.txt(c, this.phase === 'earA' ? 'NOTE 1' : this.phase === 'earB' ? 'NOTE 2' : this.phase === 'ask' ? 'WAS THE SECOND NOTE...' : '', 135, 150, { align: 'c', color: PAL.cream, scale: 2 }); }
      if (this.fb) E.txt(c, this.fb, 135, 215, { align: 'c', color: PAL.gold, scale: 3 });
      E.hero(c, this.look, this.phase === 'sing' ? 'beatbox' : 'idle', 135, 470, { scale: 1, t: E.t });
    },
  };

  /* ============================================================== BEAT MAKER */
  E.scenes.seq = {
    enter(a) {
      this.a = a; this.slot = G.ch.patIdx || 0; this.playing = false; this.step = -1; this.nextT = 0; this.nextStep = 0; this.played = 0; this.look = BBH.Chars.fix(G.ch.look); this.paint = null;
      this.pat = Core.clone(G.ch.patterns[this.slot]); E.music('studio'); E.add(E.makeHud(G)); this.build();
      this.timer = setInterval(() => this.sched(), 25);
    },
    leave() { clearInterval(this.timer); this.save(); },
    save() { if (this.pat) G.do({ t: 'seqsave', slot: this.slot, pattern: this.pat }); },
    build() {
      if (this.ui) this.ui.remove();
      const tabs = h('div.row', { style: { gap: '2px' } }, [0, 1, 2, 3].map((i) => { const b = E.btn(String(i + 1), i === this.slot ? 'gold' : '', () => { this.save(); this.slot = i; this.pat = Core.clone(G.ch.patterns[i]); this.build(); }, { flex: 1, padding: '4px 0 5px' }); return b; }));
      const bpm = h('div.tp.gold', { style: { minWidth: '40px', textAlign: 'center' } }, this.pat.bpm + ' BPM');
      const setBpm = (d) => { this.pat.bpm = Math.max(60, Math.min(180, this.pat.bpm + d)); bpm.textContent = this.pat.bpm + ' BPM'; };
      this.playBtn = E.btn(this.playing ? 'STOP' : 'PLAY', this.playing ? 'red' : 'green', () => this.toggle(), { flex: 1 });
      const hits = Core.patternHits(this.pat);
      this.ui = h('div.panel.sheet', { style: { height: '170px', padding: '6px', zIndex: 15 } },
        h('div.row', { style: { marginBottom: '4px' } }, h('div.tp.cyan', null, 'PATTERN'), h('div.grow', null, tabs)),
        h('div.row', { style: { marginBottom: '4px' } }, E.btn('-', '', () => setBpm(-5), { width: '24px' }), bpm, E.btn('+', '', () => setBpm(5), { width: '24px' }), this.playBtn, E.btn('CLEAR', '', () => { this.pat.steps = this.pat.steps.map((r) => r.map(() => 0)); this.build(); }, { flex: 1 })),
        h('div.row', { style: { marginBottom: '4px' } }, E.btn('RANDOM', '', () => { this.pat.steps = [0, 1, 2, 3].map((l) => new Array(16).fill(0).map((_, i) => (l === 0 ? (i % 4 === 0 || Math.random() < 0.1) : l === 2 ? (i % 8 === 4) : l === 1 ? (i % 2 === 1 && Math.random() < 0.8) : Math.random() < 0.12) ? 1 : 0)); this.build(); }, { flex: 1 }),
          E.btn('TRAIN', hits >= 4 ? 'cyan' : 'dis', () => this.train(), { flex: 1 }), E.btn('RELEASE', hits >= 4 ? 'pink' : 'dis', () => this.release(), { flex: 1 })),
        h('div.row', null, E.btn('SONGS', '', () => G.openSongs(), { flex: 1 }), E.btn('BACK', '', () => { this.save(); back(this.a.back); }, { flex: 1 })));
      E.add(this.ui);
    },
    toggle() { this.playing = !this.playing; E.unlockAudio(); if (this.playing) { try { this.nextT = E.A().now() + 0.08; } catch (e) { this.nextT = 0; } this.nextStep = 0; E.music('studio', { fade: 0.2 }); try { E.A().music.stop(0.2); } catch (e) { /* ignore */ } } else this.step = -1; if (this.playBtn) { this.playBtn.textContent = this.playing ? 'STOP' : 'PLAY'; this.playBtn.className = 'btn ' + (this.playing ? 'red' : 'green'); } },
    sched() {
      if (!this.playing) return; let A; try { A = E.A(); } catch (e) { return; } const spStep = 60 / this.pat.bpm / 4, now = A.now();
      while (this.nextT < now + 0.12) { const i = this.nextStep; for (let l = 0; l < 4; l++) if (this.pat.steps[l][i]) { try { A.drum(l, { vel: 0.9, when: this.nextT }); } catch (e) { /* ignore */ } } this.vis = this.vis || []; this.vis.push({ t: this.nextT, i }); this.nextT += spStep; this.nextStep = (i + 1) % 16; this.played += spStep; }
      this.vis = (this.vis || []).filter((v) => v.t > now - 0.5); const cur = this.vis.filter((v) => v.t <= now).pop(); this.step = cur ? cur.i : this.step;
    },
    cellAt(x, y) { const gx = 20, gy = 270, cw = 20, ch2 = 34; const i = Math.floor((x - gx) / cw), l = Math.floor((y - gy) / ch2); return i >= 0 && i < 16 && l >= 0 && l < 4 ? { i, l } : null; },
    pointer(type, x, y) {
      if (type === 'up') { this.paint = null; if (this.ui) this.build(); return; }
      const c = this.cellAt(x, y); if (!c) return;
      if (type === 'down') { this.paint = this.pat.steps[c.l][c.i] ? 0 : 1; }
      if (this.paint === null) return; if (this.pat.steps[c.l][c.i] !== this.paint) { this.pat.steps[c.l][c.i] = this.paint; if (this.paint) { try { E.A().drum(c.l, { vel: 0.8 }); } catch (e) { /* ignore */ } } }
    },
    train() {
      if (Core.patternHits(this.pat) < 4) { E.toast('Add at least 4 hits first.', 'warn'); return; } if (this.played < 4) { E.toast('Press PLAY and listen to your beat first.', 'warn'); return; }
      this.save(); const held = G.doHold({ t: 'seqtrain', score: Core.patternScore(this.pat), studio: this.a.place === 'studio' }); if (this.playing) this.toggle(); G.finishActivity(held, this.a.place || 'home');
    },
    release() {
      const inp = h('input', { type: 'text', maxlength: 24, placeholder: 'SONG NAME', value: this.pat.name || '' });
      E.modal({ title: 'RELEASE SONG', body: h('div', null, h('div.ts.ctr', { style: { marginBottom: '6px' } }, 'Your beat becomes a song. It earns fans for 7 days.'), inp), buttons: [{ label: 'CANCEL' }, { label: 'RELEASE', cls: 'gold', fn: () => { this.pat.name = inp.value || this.pat.name; this.save(); G.do({ t: 'release', slot: this.slot, name: this.pat.name }); this.build(); } }] });
    },
    draw(real, c) {
      real.fillStyle = PAL.night1; real.fillRect(0, 0, E.W, E.H); const bg = (() => { try { return BBH.World.scene('studio', 'night'); } catch (e) { return null; } })(); if (bg) { bg.layers[0].pix.draw(real, 0, 0); real.fillStyle = 'rgba(14,9,30,.55)'; real.fillRect(0, 0, E.W, E.H); }
      const bob = this.playing && this.step >= 0 ? (this.step % 4 === 0 ? 3 : 0) : 0; E.hero(real, this.look, this.playing ? 'dance' : 'idle', 180, 250 + bob, { scale: 1, t: E.t });
      const gx = 20, gy = 270, cw = 20, ch2 = 34;
      real.fillStyle = PAL.ink; real.fillRect(gx - 4, gy - 4, 16 * cw + 8, 4 * ch2 + 8);
      for (let l = 0; l < 4; l++) for (let i = 0; i < 16; i++) {
        const x = gx + i * cw, y = gy + l * ch2, on = this.pat.steps[l][i], col = LANES[l][2], cur = this.playing && this.step === i;
        real.fillStyle = on ? col : (i % 4 === 0 ? '#3a2a60' : '#2a1d4a'); real.fillRect(x + 1, y + 1, cw - 2, ch2 - 2);
        if (on) { real.fillStyle = 'rgba(255,255,255,.45)'; real.fillRect(x + 2, y + 2, cw - 4, 3); real.fillStyle = 'rgba(0,0,0,.25)'; real.fillRect(x + 1, y + ch2 - 8, cw - 2, 7); }
        if (cur) { real.fillStyle = on ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.18)'; real.fillRect(x + 1, y + 1, cw - 2, ch2 - 2); }
      }
      for (let l = 0; l < 4; l++) E.txt(real, LANES[l][0], gx - 14, gy + l * ch2 + 12, { color: LANES[l][2] });
      E.txt(c, 'BEAT MAKER', 12, 66, { color: PAL.gold }); E.txt(c, 'TAP OR DRAG THE GRID', 12, 78, { color: PAL.fog });
      const sc = Core.patternScore(this.pat); c.fillStyle = PAL.ink; c.fillRect(150, 66, 108, 7); c.fillStyle = PAL.neonPink; c.fillRect(151, 67, Math.round(106 * sc), 5); E.txt(c, 'CREATIVITY ' + Math.round(sc * 100) + '%', 258, 76, { align: 'r', color: PAL.cream });
    },
  };

  /* ============================================================ SOUND RECORDER */
  E.scenes.studio = {
    enter(a) {
      this.a = a; this.rec = null; this.status = {}; this.test = false; this.look = BBH.Chars.fix(G.ch.look); this.detLane = -1; this.detT = 0; E.music('studio'); E.add(E.makeHud(G)); this.build();
    },
    leave() { try { this.stopTest && this.stopTest(); BBH.Mic && BBH.Mic.close(); } catch (e) { /* ignore */ } },
    has(l) { try { return BBH.Audio.hasSample && BBH.Audio.hasSample(l); } catch (e) { return false; } },
    build() {
      if (this.ui) this.ui.remove(); const slot = G.slot || 1;
      const cards = LANES.map((ln, i) => {
        const mine = this.has(i), st = this.status[i];
        return h('div.panel.flat', { style: { position: 'relative', padding: '5px', height: '56px', borderLeft: '4px solid ' + ln[2] } },
          h('div.row', { style: { justifyContent: 'space-between' } }, h('div.h2', { style: { color: ln[2] } }, ln[0] + '  ' + ln[1]), h('div.tp', { style: { color: st === 'rec' ? '#ff7b8e' : mine ? '#7be08f' : PAL.fog } }, st === 'rec' ? 'RECORDING...' : st === 'wait' ? 'MAKE THE SOUND NOW' : mine ? 'YOUR SOUND' : 'DEFAULT')),
          h('div.row', { style: { marginTop: '4px' } }, E.btn('REC', 'red', () => this.record(i), { flex: 1, padding: '4px 0 5px' }), E.btn('PLAY', '', () => { try { E.A().drum(i, { vel: 1 }); } catch (e) { /* ignore */ } }, { flex: 1, padding: '4px 0 5px' }), E.btn('RESET', mine ? '' : 'dis', () => this.reset(i), { flex: 1, padding: '4px 0 5px' })));
      });
      this.ui = h('div', { style: { position: 'absolute', left: '6px', right: '6px', top: '76px', bottom: '8px', zIndex: 15, display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div.ts.ctr', null, MicOK() ? 'Press REC, then make the sound into your mic. It stops by itself when you go quiet.' : 'Microphone recording is not supported in this browser.'), cards,
        h('div.row', null, E.btn(this.test ? 'STOP TEST' : 'TEST MIC MODE', this.test ? 'red' : 'cyan', () => this.toggleTest(), { flex: 2 }), E.btn('BACK', '', () => back(this.a.back), { flex: 1 })));
      E.add(this.ui); void slot;
    },
    async record(lane) {
      if (!MicOK()) { E.toast('No microphone support here.', 'warn'); return; } if (this.rec) return; this.rec = lane; this.status[lane] = 'wait'; this.build();
      const o = await BBH.Mic.open(); if (!o.ok) { this.rec = null; this.status[lane] = null; E.toast('Mic: ' + (o.error || 'unavailable') + '. Allow microphone access.', 'warn'); this.build(); return; }
      this.status[lane] = 'wait'; this.build(); let r = null; try { r = await BBH.Mic.recordSample({ maxWaitMs: 4000 }); } catch (e) { r = { ok: false, reason: String(e) }; }
      this.rec = null; this.status[lane] = null; if (!this.test) { try { BBH.Mic.close(); } catch (e) { /* ignore */ } }
      if (!r || !r.ok || !r.data || !r.data.length) { E.toast('I did not hear anything. Try again, a bit louder.', 'warn'); E.sfx('error'); this.build(); return; }
      try { await BBH.Samples.put(G.slot || 1, lane, r.data, r.sampleRate); BBH.Audio.setSample(lane, r.data, r.sampleRate); } catch (e) { /* ignore */ }
      G.do({ t: 'recorded', n: 1 }); E.sfx('record'); E.toast(LANES[lane][1] + ' recorded! Playing it back.', 'good'); setTimeout(() => { try { E.A().drum(lane, { vel: 1 }); } catch (e) { /* ignore */ } }, 250); this.build();
    },
    async reset(lane) { try { await BBH.Samples.remove(G.slot || 1, lane); BBH.Audio.clearSample(lane); } catch (e) { /* ignore */ } E.toast(LANES[lane][1] + ' is back to the default sound.', 'good'); this.build(); },
    async toggleTest() {
      if (this.test) { this.stopTest(); this.build(); return; } if (!MicOK()) { E.toast('No microphone support here.', 'warn'); return; }
      const o = await BBH.Mic.open(); if (!o.ok) { E.toast('Mic: ' + (o.error || 'unavailable'), 'warn'); return; }
      try { const prof = await this.profiles(); this.stopL = BBH.Mic.listen((ev) => { this.detLane = ev.lane; this.detT = 400; E.burst(180, 330, 6, { color: LANES[ev.lane][2], speed: 70, up: 30 }); try { E.A().drum(ev.lane, { vel: 0.8 }); } catch (e) { /* ignore */ } }, prof ? { profiles: prof } : undefined); } catch (e) { E.toast('Could not start the detector.', 'warn'); return; }
      this.test = true; this.build();
    },
    async profiles() { try { const by = {}; for (let l = 0; l < 4; l++) { const s = await BBH.Samples.get(G.slot || 1, l); if (s) by[l] = s.f32 || s.data; } return Object.keys(by).length ? BBH.Mic.trainFromSamples(by, 44100) : null; } catch (e) { return null; } },
    stopTest() { this.test = false; try { this.stopL && this.stopL(); BBH.Mic.close(); } catch (e) { /* ignore */ } },
    update(dt) { this.detT = Math.max(0, this.detT - dt); },
    draw(real, c) {
      real.fillStyle = PAL.night1; real.fillRect(0, 0, E.W, E.H); const bg = (() => { try { return BBH.World.scene('studio', 'night'); } catch (e) { return null; } })(); if (bg) { bg.layers[0].pix.draw(real, 0, 0); real.fillStyle = 'rgba(14,9,30,.7)'; real.fillRect(0, 0, E.W, E.H); }
      E.txt(c, 'SOUND RECORDER', 12, 66, { color: PAL.gold });
      let lv = 0; try { lv = BBH.Mic.isOpen() ? BBH.Mic.level() : 0; } catch (e) { lv = 0; } c.fillStyle = PAL.ink; c.fillRect(150, 66, 108, 7); c.fillStyle = lv > 0.04 ? PAL.neonLime : '#7b4fe0'; c.fillRect(151, 67, Math.round(106 * Math.min(1, lv * 6)), 5); E.txt(c, 'MIC LEVEL', 258, 76, { align: 'r', color: PAL.fog });
      if (this.test && this.detT > 0) E.txt(c, 'HEARD: ' + LANES[this.detLane][0], 135, 410, { align: 'c', color: LANES[this.detLane][2], scale: 3 });
      else if (this.test) E.txt(c, 'BEATBOX INTO YOUR MIC...', 135, 410, { align: 'c', color: PAL.cream, a: 0.6 + 0.4 * Math.sin(E.t / 220) });
    },
  };

  /* ============================================================== PANELS */
  const sheet = (title, kids) => { const el = h('div.panel.sheet.pop', { style: { padding: '8px', maxHeight: '300px', display: 'flex', flexDirection: 'column', zIndex: 40 } }, h('div.row', { style: { justifyContent: 'space-between', marginBottom: '5px' } }, h('div.h2', null, title), E.btn('X', '', () => el.remove(), { padding: '3px 5px' })), h('div.scroll.col', { style: { gap: '4px' } }, kids)); E.add(el); return el; };
  G.openSongs = function () {
    const ch = G.ch, songs = ch.songs.slice().reverse();
    const kids = songs.length ? songs.map((sg) => { const left = Math.max(0, Core.SONG_DECAY.length - (ch.day - sg.releasedDay)); return h('div.panel.flat', { style: { position: 'relative', padding: '5px', opacity: left ? 1 : 0.6 } }, h('div.row', { style: { justifyContent: 'space-between' } }, h('div.h2', { style: { color: left ? 'var(--gold2)' : 'var(--cream)' } }, sg.name.toUpperCase()), h('div.tp', null, left ? left + 'D LEFT' : 'ARCHIVED')), h('div.ts', null, 'Released day ' + sg.releasedDay + ', ' + sg.activeCells + ' hits, +' + (sg.lifetimeFans || 0) + ' fans earned')); }) : [h('div.ts', null, 'No songs yet. Make a beat in the Beat Maker, then press RELEASE. Up to ' + Core.MAX_ACTIVE_SONGS + ' songs can earn fans at once.')];
    sheet('SONGS  ' + ch.songs.length, kids);
  };
  G.openCrew = function () {
    const ch = G.ch, kids = Core.CREW.map((m) => { const inn = ch.crew.some((x) => x.id === m.id), can = ch.fans >= m.minFans;
      return h('div.panel.flat', { style: { position: 'relative', padding: '5px' } }, h('div.row', { style: { gap: '6px' } }, E.pixEl(BBH.Chars.portrait(BBH.Chars.fix(m.look), 'happy'), 0.75), h('div.col.grow', { style: { gap: '2px' } }, h('div.h2', { style: { color: inn ? 'var(--gold2)' : 'var(--cream)' } }, m.name + (inn ? '  (IN CREW)' : '')), h('div.ts', null, m.blurb), h('div.ts', null, '+$' + m.dailyCash + '/day, +' + m.dailyFans + ' fans/day' + (inn || can ? '' : '   Needs ' + m.minFans + ' fans'))),
        inn ? null : E.btn('$' + m.cost, can && ch.cash >= m.cost ? 'gold' : 'dis', () => { G.do({ t: 'recruit', id: m.id }); document.querySelectorAll('#ui .panel.sheet.pop').forEach((n) => { if (n.textContent.indexOf('CREW') === 0) n.remove(); }); G.openCrew(); }, { padding: '4px 5px' }))); });
    sheet('CREW  ' + ch.crew.length + '/' + Core.CREW.length, kids);
  };
  G.goLive = function () {
    const ch = G.ch; if (ch.fans < Core.STREAM_MIN_FANS) { E.toast('You need ' + Core.STREAM_MIN_FANS + ' fans to go live.', 'warn'); return; }
    E.fadeTo(0.6, 200); setTimeout(() => E.fadeTo(0, 300), 500); const held = G.doHold({ t: 'stream' }); held.play({ morning: (f) => { G.pendingMorning = f; } });
  };
  G.openCoaching = function (S) {
    const ch = G.ch, cd = ch.flags.proCoachDay !== undefined ? Core.COACH_COOLDOWN - (ch.day - ch.flags.proCoachDay) : 0;
    const kids = [h('div.ts', null, 'BeeAmGee teaches you a real lesson for $' + Core.COACH_FEE + ': +1 to a skill of your choice (90 min). He can only fit one every ' + Core.COACH_COOLDOWN + ' days.'), cd > 0 ? h('div.tp', { style: { color: '#ff7b8e' } }, 'COME BACK IN ' + cd + ' DAY(S)') : null]
      .concat(Core.STATS.map((st) => sheetBtn(Core.STAT_NAMES[st].toUpperCase(), 'Now ' + Math.floor(ch.stats[st]), cd > 0 || ch.cash < Core.COACH_FEE ? 'dis' : 'gold', () => { if (cd > 0 || ch.cash < Core.COACH_FEE) { E.toast(cd > 0 ? 'Not today.' : 'You need $' + Core.COACH_FEE, 'warn'); return; } S.closeSheet(); document.querySelectorAll('#ui .panel.sheet.pop').forEach((n) => n.remove()); const r = G.do({ t: 'coach', stat: st }, { coachLine: (f) => { E.dialog([{ who: 'beeamgee', text: f.text }]); } }); void r; })));
    sheet('PRIVATE COACHING', kids);
  };

  // the Sound Lab and booth menus
  G.labRows = function (S, where) {
    return [
      sheetBtn('PITCH TUNER', 'Sing notes into your mic. Trains Musicality.', G.ch.energy < 10 ? 'dis' : 'cyan', () => { S.closeSheet(); E.go('tuner', { back: { scene: 'place', args: { id: S.id } }, place: S.id }); }),
      sheetBtn('BEAT MAKER', 'Build patterns. Trains Originality. Release songs.' + (where === 'studio' ? ' (x1.3 here)' : ''), G.ch.energy < 10 ? 'dis' : 'pink', () => { S.closeSheet(); E.go('seq', { back: { scene: 'place', args: { id: S.id } }, place: S.id }); }),
      sheetBtn('SOUND RECORDER', 'Record your own B, T, K and Pf sounds.', '', () => { S.closeSheet(); E.go('studio', { back: { scene: 'place', args: { id: S.id } } }); }),
      sheetBtn('MY SONGS  ' + G.ch.songs.length, 'Released songs and their earnings.', '', () => { G.openSongs(); }),
    ];
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
