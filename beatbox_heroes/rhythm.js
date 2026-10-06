// BEATBOX HEROES -- rhythm.js: the 4 lane beatbox rhythm game, used for busking, open mics, showcases, practice
// and the 3 round battles (with the judge reveal).
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH.E, Core = BBH.Core, PAL = BBH.PAL;
  const G = BBH.G = BBH.G || {};
  const h = E.h, L = E.Lctx, K = E.K;

  const LANES = [
    { name: 'B', color: '#ff4f6a', dark: '#8f1d3a', hi: '#ffb0bd', keys: ['KeyD', 'ArrowLeft', 'Digit1'] },
    { name: 'T', color: '#ffd23f', dark: '#9a6b0a', hi: '#fff0a0', keys: ['KeyF', 'ArrowDown', 'Digit2'] },
    { name: 'K', color: '#2ee6ff', dark: '#0f6a85', hi: '#b5f6ff', keys: ['KeyJ', 'ArrowUp', 'Digit3'] },
    { name: 'Pf', color: '#c07bff', dark: '#5a2d96', hi: '#e6ccff', keys: ['KeyK', 'ArrowRight', 'Digit4'] },
  ];
  const X0 = 15, LW = 60, HIT_Y = 404, TOP_Y = 200;
  const GRADE_COL = { perfect: PAL.neonYellow, good: PAL.neonCyan, miss: '#ff6b7a' };
  const STAGE_FOR = { 0: 'pink', 1: 'cyan', 2: 'lime', 3: 'gold' };

  // lane glyph shapes drawn as shape-coded accents (colour-blind friendly)
  function glyph(c, lane, cx, cy, col) {
    c.fillStyle = col;
    if (lane === 0) { c.fillRect(cx - 2, cy - 3, 5, 7); c.fillRect(cx - 3, cy - 2, 7, 5); }                                   // circle-ish
    else if (lane === 1) { for (let i = 0; i < 4; i++) c.fillRect(cx - 3 + i, cy - 3 + i * 2 - (i > 1 ? 0 : 0), 7 - i * 2, 2); }   // triangle
    else if (lane === 2) { c.fillRect(cx - 3, cy - 3, 7, 7); }                                                                 // square
    else { for (let i = 0; i < 4; i++) { c.fillRect(cx - i, cy - 3 + i, 1 + i * 2, 1); c.fillRect(cx - i, cy + 3 - i, 1 + i * 2, 1); } }  // diamond
  }
  function drawNote(c, lane, y, a, ghost) {
    const L = LANES[lane], x = X0 + lane * LW + 5, w = LW - 10, yy = Math.round(y) - 6;
    c.save(); if (a !== undefined) c.globalAlpha = a;
    c.fillStyle = PAL.ink; c.fillRect(x - 1, yy - 1, w + 2, 14);
    c.fillStyle = ghost ? '#6b6b80' : L.dark; c.fillRect(x, yy, w, 12);
    c.fillStyle = ghost ? '#a7a3c4' : L.color; c.fillRect(x, yy, w, 9);
    c.fillStyle = ghost ? '#fff' : L.hi; c.fillRect(x + 1, yy + 1, w - 2, 1); c.fillRect(x + 1, yy + 1, 1, 6);
    glyph(c, lane, x + (w >> 1), yy + 5, ghost ? '#34303f' : PAL.ink);
    c.restore();
  }

  E.scenes.rhythm = {
    enter(a) {
      this.a = a; this.mode = a.mode || 'perform'; this.stats = G.ch.stats; this.look = BBH.Chars.fix(G.ch.look);
      this.battle = this.mode === 'battle'; this.opp = a.opp || null; this.oppLook = this.opp && this.opp.look ? BBH.Chars.fix(this.opp.look) : null;
      this.roundsTotal = this.battle ? 3 : 1; this.round = 0; this.roundQ = []; this.tot = { perfects: 0, bestCombo: 0, lane: [0, 0, 0, 0] };
      const stg = a.stage || (this.battle ? STAGE_FOR[this.opp.style % 4] : 'pink');
      try { this.bg = BBH.World.scene('stage', stg); } catch (e) { this.bg = null; }
      this.fallMs = 1500 - Math.min(300, (a.bpm || 100) * 2); this.win = Core.windows(this.stats); this.offset = (E.settings.offset || 0) / 1000;
      this.padFlash = [0, 0, 0, 0]; this.pops = []; this.hype = 0; this.pressed = [false, false, false, false]; this.finished = false;
      this.shakeBeat = 0; this.rings = []; this.reallyDone = false;
      E.music('battle', { fade: 0.5 }); try { E.A().music.stop(0.4); } catch (e) { /* ignore */ }
      this.ui = h('div.nopt', { style: { position: 'absolute', inset: 0, zIndex: 5 } });
      this.ui.appendChild(E.btn('EXIT', '', () => this.confirmExit(), { position: 'absolute', left: '4px', top: '4px', width: '36px', padding: '3px 2px', fontSize: '5px' }));
      E.add(this.ui);
      this.startRound();
    },
    leave() { try { E.A().groove.stop(); } catch (e) { /* ignore */ } },
    visibility(vis) { if (!vis && this.state === 'play' && !this.reallyDone) { this.reallyDone = true; E.toast('Set interrupted.', 'warn'); setTimeout(() => this.abort(), 50); } },
    confirmExit() { if (this.state === 'result' || this.reallyDone) return; E.modal({ title: 'LEAVE?', body: 'You will lose this set (no rewards, no time spent).', buttons: [{ label: 'STAY' }, { label: 'LEAVE', cls: 'red', fn: () => this.abort() }] }); },
    abort() { this.reallyDone = true; try { E.A().groove.stop(); } catch (e) { /* ignore */ } if (this.a.onAbort) this.a.onAbort(); },

    /* ---------------------------------------------------------- rounds */
    startRound() {
      const a = this.a, bars = this.battle ? 4 : (a.bars || 8);
      this.chart = Core.makeChart((a.seed || Date.now() & 0xffff) + this.round * 977, { bars, difficulty: this.battle ? 0.35 + this.opp.skill * 0.45 : (a.difficulty === undefined ? 0.5 : a.difficulty) });
      const bpm = this.battle ? this.opp.bpm : (a.bpm || 100); this.bpm = bpm; this.spb = 60 / bpm;
      this.hits = []; this.notes = this.chart.map((n) => ({ lane: n.lane, beat: n.beat + 4, state: 0 })); this.combo = 0; this.maxCombo = 0; this.state = 'count'; this.roundStart = E.t;
      this.endBeat = (bars * 4 + 4) + 2; this.score = 0; this.pops.length = 0; this.stateT = 0;
      let g = null; try { g = E.A().groove.start({ bpm, style: this.battle ? this.opp.style : (a.style || 0), bars: bars + 3 }); } catch (e) { g = null; }
      this.audioClock = !!(g && typeof g.t0 === 'number' && g.spb); this.t0 = this.audioClock ? g.t0 : null; if (this.audioClock) this.spb = g.spb;
      if (!this.audioClock) { this.t0 = performance.now() / 1000 + 0.4; }
      this.counted = -1; this.build();
    },
    now() { return this.audioClock ? E.A().now() : performance.now() / 1000; },
    songT() { return this.now() - this.t0; },
    build() {
      const hdr = this.battle ? 'ROUND ' + (this.round + 1) + '/3' : (this.a.title || 'PERFORM');
      this.roundTitle = hdr; this.banner = { text: hdr, t: 0, sub: this.battle ? (this.round === 0 ? this.opp.taunt : 'vs ' + this.opp.name) : this.a.sub };
    },

    /* ----------------------------------------------------------- input */
    press(lane) {
      if (this.state !== 'play' && this.state !== 'count') return;
      this.pressed[lane] = true; this.padFlash[lane] = 1;
      try { E.A().drum(lane, { vel: 0.9 }); } catch (e) { /* ignore */ }
      if (this.state !== 'play') return;
      const T = this.songT() + this.offset, w = this.win; let best = null, bd = 1e9;
      for (const n of this.notes) { if (n.state || n.lane !== lane) continue; const d = (T - n.beat * this.spb) * 1000; if (Math.abs(d) < bd) { bd = Math.abs(d); best = { n, d }; } }
      if (!best || bd > w.good + 20) { this.ghost(lane); return; }
      const grade = Core.judgeHit(best.d, w); best.n.state = grade === 'miss' ? 3 : grade === 'perfect' ? 1 : 2; this.hit(lane, grade, best.d);
    },
    ghost(lane) { L.burst(X0 + lane * LW + 30, HIT_Y + 2, 3, { color: LANES[lane].color, speed: 25, gravity: 0, life: 200 }); },
    hit(lane, grade, d) {
      this.hits.push({ lane, grade });
      if (grade === 'miss') { this.breakCombo(); this.pop('MISS', grade); return; }
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = Core.HIT_SCORE[grade] * (1 + this.combo / 100); this.score += pts; this.hype = Math.min(1, this.hype + (grade === 'perfect' ? 0.045 : 0.025));
      const cx = X0 + lane * LW + 30;
      this.pop(grade === 'perfect' ? 'PERFECT' : 'GOOD', grade);
      L.burst(cx, HIT_Y, grade === 'perfect' ? 14 : 7, { colors: [LANES[lane].color, LANES[lane].hi, '#fff'], speed: 80, up: 40, life: 450 });
      if (grade === 'perfect') { E.shake(1, 80); this.rings.push({ age: 0, c: LANES[lane].color }); }
      if (this.combo > 0 && this.combo % 10 === 0) { E.sfx('combo'); E.flash(LANES[lane].color, 120); this.pop(this.combo + ' COMBO', 'perfect', true); try { E.A().groove.setIntensity(Math.min(1, this.combo / 40)); } catch (e) { /* ignore */ } }
    },
    breakCombo() { if (this.combo >= 8) E.sfx('miss'); this.combo = 0; this.hype = Math.max(0, this.hype - 0.06); E.shake(1.5, 100); },
    pop(text, grade, big) { this.pops.push({ text, grade, age: 0, big: !!big, x: 135 + (Math.random() - 0.5) * (big ? 0 : 50), y: big ? 300 : 340 }); if (this.pops.length > 6) this.pops.shift(); },
    pointer(type, x, y) {
      if (type !== 'down') return;
      x /= K; y /= K;
      if (y < TOP_Y - 30) return;
      const lane = Math.floor((x - X0) / LW); if (lane >= 0 && lane < 4) this.press(lane);
    },
    key(code, down) {
      for (let i = 0; i < 4; i++) if (LANES[i].keys.includes(code)) { if (down) this.press(i); else this.pressed[i] = false; return false; }
      return undefined;
    },

    /* ---------------------------------------------------------- update */
    update(dt) {
      this.stateT += dt; for (let i = 0; i < 4; i++) this.padFlash[i] = Math.max(0, this.padFlash[i] - dt / 160);
      for (const p of this.pops) p.age += dt; this.pops = this.pops.filter((p) => p.age < 700);
      for (const r of this.rings) r.age += dt; this.rings = this.rings.filter((r) => r.age < 500);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2200) this.banner = null; }
      if (this.reallyDone) return;
      const st = this.state;
      if (st === 'count' || st === 'play') {
        const T = this.songT();
        // count-in sfx on each beat before the chart starts
        const beatNow = Math.floor(T / this.spb); if (st === 'count' && beatNow !== this.counted && beatNow >= 0 && beatNow < 4) { this.counted = beatNow; E.sfx(beatNow === 3 ? 'go' : 'countdown'); }
        if (T >= 4 * this.spb - 0.02) this.state = 'play';
        // auto-miss notes that slid past the good window
        for (const n of this.notes) if (!n.state && (T + this.offset - n.beat * this.spb) * 1000 > this.win.good + 20) { n.state = 3; this.hits.push({ lane: n.lane, grade: 'miss' }); this.breakCombo(); this.pop('MISS', 'miss'); }
        if (T / this.spb > this.endBeat) this.finishRound();
      } else if (st === 'opp') this.updateOpp(dt);
      else if (st === 'judge') this.updateJudge(dt);
    },
    finishRound() {
      const sum = Core.summarize(this.hits, this.chart.length, this.maxCombo); this.sum = sum;
      this.tot.perfects += sum.perfect; this.tot.bestCombo = Math.max(this.tot.bestCombo, sum.bestCombo); sum.perfectLane.forEach((v, i) => { this.tot.lane[i] += v; });
      try { E.A().groove.stop(); } catch (e) { /* ignore */ }
      const q = sum.accuracy * 0.8 + Math.min(1, sum.bestCombo / Math.max(8, this.chart.length * 0.7)) * 0.2; this.roundQ.push({ q: Math.min(1, q) });
      if (!this.battle) { this.state = 'result'; this.reallyDone = true; setTimeout(() => this.a.onDone && this.a.onDone(sum), 700); this.endFlash(sum); return; }
      this.startOpp();
    },
    endFlash(sum) { E.sfx(sum.rank === 'S' || sum.rank === 'A' ? 'win' : 'applause'); E.flash('#ffffff', 220); this.endText = { text: sum.rank === 'S' ? 'FLAWLESS!' : 'FINISH!', t: 0 }; },

    /* -------------------------------------------------------- opp turn */
    startOpp() {
      this.state = 'opp'; this.stateT = 0; this.oppIdx = 0; this.oppHits = 0; this.oppMiss = 0;
      const q = Core.opponentRound(this.opp, this.round, Math.random); this.oppQ = q;
      const ch = Core.makeChart(4242 + this.round * 31 + this.opp.tier, { bars: 2, difficulty: 0.3 + this.opp.skill * 0.5 });
      this.oppNotes = ch.map((n) => ({ lane: n.lane, t: 1.2 + n.beat * (60 / this.opp.bpm), hit: Math.random() < q, done: false }));
      this.oppEnd = 1.2 + 8 * (60 / this.opp.bpm) + 1.0; this.oppMeter = 0;
      this.oppT0 = this.now(); this.banner = { text: this.opp.name.toUpperCase(), t: 0, sub: 'answers back...' };
      try { E.A().groove.start({ bpm: this.opp.bpm, style: this.opp.style, bars: 5 }); } catch (e) { /* ignore */ }
    },
    updateOpp(dt) {
      const T = this.now() - this.oppT0;
      for (const n of this.oppNotes) if (!n.done && T >= n.t) {
        n.done = true; if (n.hit) { this.oppHits++; this.padFlash[n.lane] = 1; try { E.A().drum(n.lane, { vel: 0.8 }); } catch (e) { /* ignore */ } L.burst(X0 + n.lane * LW + 30, HIT_Y, 6, { color: PAL.neonPink, speed: 60, up: 30, life: 350 }); this.rings.push({ age: 0, c: PAL.neonPink }); } else this.oppMiss++;
      }
      this.oppMeter = Math.min(this.oppQ, this.oppMeter + dt / 2400 * this.oppQ);
      if (T > this.oppEnd) {
        try { E.A().groove.stop(); } catch (e) { /* ignore */ }
        this.oppRoundQ = this.oppRoundQ || []; this.oppRoundQ.push(this.oppQ);
        this.round++;
        if (this.round >= this.roundsTotal) this.startJudge(); else this.startRound();
      }
    },

    /* ------------------------------------------------------- judging */
    startJudge() {
      this.state = 'judge'; this.stateT = 0; this.reveal = -1; this.tally = { you: 0, opp: 0 };
      const a = this.a, action = { t: 'battle', opp: a.finalOpp || this.opp, rounds: this.roundQ, perfects: this.tot.perfects, bestCombo: this.tot.bestCombo, perfectLane: this.tot.lane, final: a.final || null };
      this.held = G.doHold(action); this.verdict = this.held.fx.find((f) => f.t === 'battleResult'); this.votes = this.verdict.out.votes;
      this.banner = { text: 'THE JUDGES', t: 0, sub: 'five votes decide it' }; E.music('creator', { fade: 0.6 });
    },
    updateJudge() {
      const per = 1100, idx = Math.floor((this.stateT - 900) / per);
      if (idx > this.reveal && idx < 5) { this.reveal = idx; const v = this.votes[idx]; if (v.forPlayer) this.tally.you++; else this.tally.opp++; E.sfx(v.forPlayer ? 'hit_perfect' : 'miss'); L.burst(30 + idx * 52 + 22, 330, 10, { color: v.forPlayer ? PAL.neonCyan : PAL.neonPink, speed: 60, up: 30 }); E.shake(1.5, 100); }
      if (this.reveal >= 4 && this.stateT > 900 + 5 * per + 700 && !this.verdictShown) this.showVerdict();
    },
    showVerdict() {
      this.verdictShown = true; const out = this.verdict.out, win = out.win; this.reallyDone = true;
      E.sfx(win ? 'win' : 'lose'); E.flash(win ? '#fff0c9' : '#ff2f4f', 260); E.shake(4, 300);
      if (win) L.burst(135, 200, 60, { colors: [PAL.gold, PAL.neonPink, PAL.neonCyan, PAL.neonLime, '#fff'], speed: 130, up: 90, gravity: 140, life: 1400 });
      const rw = this.verdict.rw, opp = this.opp;
      const box = h('div.panel.pop', { style: { left: '16px', right: '16px', top: '120px', padding: '10px', zIndex: 30, textAlign: 'center' } },
        h('div.h1', { style: { fontSize: '14px', lineHeight: '18px', color: win ? 'var(--gold2)' : '#ff7b8e' } }, win ? 'VICTORY!' : 'DEFEAT'), h('div.ts', { style: { margin: '4px 0' } }, out.forPlayer + ' of 5 judges voted for you'),
        h('div.t', { style: { margin: '4px 0' } }, win ? opp.defeat || 'Nice set.' : 'Train up and come back stronger.'),
        h('div.row', { style: { justifyContent: 'center', margin: '6px 0' } }, h('div.chip.gold', null, E.iconEl('coin', 1), '+$' + rw.cash), h('div.chip.cyan', null, E.iconEl('fans', 1), '+' + rw.fans), h('div.chip.lime', null, E.iconEl('level', 1), '+' + rw.xp + ' XP')),
        E.btn('CONTINUE', 'gold big', () => { box.remove(); this.held.play(); this.a.onDone && this.a.onDone({ win, out }); }));
      E.add(box);
    },

    /* ------------------------------------------------------------ draw */
    draw(real, c) {
      const t = E.t, beat = E.beat();
      if (this.bg) this.bg.layers[0].pix.draw(real, 0, 0); else { c.fillStyle = PAL.night1; c.fillRect(0, 0, 270, 480); }
      for (const l of (this.bg && this.bg.lights) || []) E.drawGlow(real, l.x, l.y, l.r, l.color, (l.a || 0.5) * (0.5 + this.hype * 0.8 + 0.2 * Math.cos((beat % 1) * 6.28)));
      // dim the playfield so notes read
      { const g = c.createLinearGradient(0, 190, 0, 250); g.addColorStop(0, 'rgba(14,9,30,0)'); g.addColorStop(1, 'rgba(14,9,30,0.66)'); c.fillStyle = g; c.fillRect(0, 190, 270, 60); c.fillStyle = 'rgba(14,9,30,0.66)'; c.fillRect(0, 250, 270, 230); }
      // performers
      const bob = Math.round(Math.abs(Math.sin(t / 240)) * 1);
      const ending = this.state === 'result' && this.sum;
      const pose = ending ? (this.sum.rank === 'D' ? 'sad' : 'cheer') : this.state === 'opp' ? 'idle' : this.state === 'judge' ? (this.verdictShown ? (this.verdict.out.win ? 'cheer' : 'sad') : 'idle') : this.combo >= 25 ? 'dance' : 'beatbox';
      if (this.battle) { E.hero(c, this.look, pose, 82, 186 + bob, { scale: 2, t }); E.hero(c, this.oppLook || this.look, this.state === 'opp' ? 'beatbox' : 'battle', 188, 186, { scale: 2, flip: true, t }); }
      else E.hero(c, this.look, pose, 135, 186 + bob, { scale: 2, t });
      // sound rings from the performer
      for (const r of this.rings) { const k = r.age / 500; c.save(); c.globalAlpha = (1 - k) * 0.8; c.strokeStyle = r.c; c.lineWidth = 2; c.beginPath(); c.ellipse(this.battle && this.state === 'opp' ? 188 : (this.battle ? 82 : 135), 130, 14 + k * 50, 10 + k * 36, 0, 0, 7); c.stroke(); c.restore(); }
      // hype bar + score
      c.fillStyle = PAL.ink; c.fillRect(46, 6, 130, 7); c.fillStyle = '#34235a'; c.fillRect(47, 7, 128, 5);
      const hp = Math.round(128 * (this.state === 'opp' ? this.oppMeter : this.hype)); c.fillStyle = this.state === 'opp' ? PAL.neonPink : (this.hype > 0.66 ? PAL.neonLime : PAL.neonCyan); c.fillRect(47, 7, hp, 5); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(47, 7, hp, 1);
      E.txt(c, this.state === 'opp' ? 'THEM' : 'HYPE', 46, 15, { color: PAL.fog });
      E.txt(c, String(Math.round(this.score)).padStart(6, '0'), 266, 6, { align: 'r', color: PAL.cream });
      if (this.battle) { E.txt(c, 'R' + Math.min(3, this.round + 1) + '/3', 266, 16, { align: 'r', color: PAL.gold }); }
      // lanes
      for (let i = 0; i < 4; i++) {
        const x = X0 + i * LW, L = LANES[i];
        c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x + 2, TOP_Y, LW - 4, HIT_Y - TOP_Y + 6);
        c.fillStyle = L.dark; c.globalAlpha = 0.35 + 0.35 * this.padFlash[i]; c.fillRect(x + 2, TOP_Y, 1, HIT_Y - TOP_Y + 6); c.fillRect(x + LW - 3, TOP_Y, 1, HIT_Y - TOP_Y + 6); c.globalAlpha = 1;
        if (this.padFlash[i] > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = this.padFlash[i] * 0.35; c.fillStyle = L.color; c.fillRect(x + 2, TOP_Y + 80, LW - 4, HIT_Y - TOP_Y - 74); c.restore(); }
      }
      // beat pulse on the hit line
      const pulse = 0.5 + 0.5 * Math.cos((((this.state === 'opp' || this.state === 'judge') ? beat : this.songT() / this.spb) % 1) * 6.28);
      c.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.2 * pulse) + ')'; c.fillRect(X0, HIT_Y - 1, 240, 2);
      // notes
      if (this.state === 'count' || this.state === 'play') {
        const T = this.songT(), fall = this.fallMs / 1000;
        for (const n of this.notes) {
          const dtn = n.beat * this.spb - T; if (n.state === 1 || n.state === 2) continue; if (dtn > fall || dtn < -0.6) continue;
          const y = HIT_Y - dtn / fall * (HIT_Y - TOP_Y);
          drawNote(c, n.lane, y, n.state === 3 ? 0.35 : 1, n.state === 3);
        }
      } else if (this.state === 'opp') {
        const T = this.now() - this.oppT0, fall = this.fallMs / 1000;
        for (const n of this.oppNotes) { const dtn = n.t - T; if (n.done || dtn > fall || dtn < -0.1) continue; drawNote(c, n.lane, HIT_Y - dtn / fall * (HIT_Y - TOP_Y), 0.8, true); }
      }
      // pads
      for (let i = 0; i < 4; i++) {
        const x = X0 + i * LW + 4, L = LANES[i], f = this.padFlash[i], y = HIT_Y + 8 + Math.round(f * 2);
        c.fillStyle = PAL.ink; c.fillRect(x - 1, y - 1, LW - 6, 54); c.fillStyle = f > 0.3 ? L.hi : L.color; c.fillRect(x, y, LW - 8, 50);
        c.fillStyle = f > 0.3 ? '#fff' : L.hi; c.fillRect(x + 1, y + 1, LW - 10, 2); c.fillStyle = L.dark; c.fillRect(x, y + 44, LW - 8, 6);
        E.txt(c, L.name, x + (LW - 8) / 2, y + 16, { align: 'c', color: PAL.ink, scale: 2, outline: 0 === 1 ? '#fff' : f > 0.3 ? L.color : L.hi });
        glyph(c, i, x + (LW - 8) / 2, y + 36, PAL.ink);
        E.txt(c, ['D', 'F', 'J', 'K'][i], x + 3, y + 3, { color: PAL.ink, outline: null });
      }
      // judgement pops
      for (const p of this.pops) { const k = p.age / 700, sc = p.big ? 2 : 1 + (k < 0.15 ? 0.5 : 0); E.txt(c, p.text, p.x, Math.round(p.y - k * 24), { align: 'c', color: p.big ? PAL.gold : GRADE_COL[p.grade], scale: sc, a: 1 - k * k, outline: PAL.ink }); }
      // combo
      if (this.combo >= 3 && (this.state === 'play')) { E.txt(c, this.combo + 'x', 135, 224, { align: 'c', color: PAL.cream, scale: 2, a: 0.85 }); }
      // banner
      if (this.banner) { const b = this.banner, a = Math.min(1, b.t / 150) * Math.min(1, (2200 - b.t) / 300); c.save(); c.globalAlpha = a; c.fillStyle = 'rgba(14,9,30,.8)'; c.fillRect(0, 232, 270, 44); E.txt(c, b.text, 135, 238, { align: 'c', color: PAL.gold, scale: 2 }); if (b.sub) E.txt(c, String(b.sub).slice(0, 44).toUpperCase(), 135, 260, { align: 'c', color: PAL.fog }); c.restore(); }
      if (this.state === 'count') { const T = this.songT(), n = Math.max(0, 3 - Math.floor(T / this.spb)); if (T > 0 && n > 0 && this.state === 'count') E.txt(c, String(n), 135, 300, { align: 'c', color: PAL.neonCyan, scale: 4 }); if (this.round === 0 && this.a.tip !== false && !G.ch.flags.rhythmTip) E.txt(c, 'TAP THE LANE AS NOTES HIT THE LINE', 135, 300 + 40, { align: 'c', color: PAL.cream }); }
      if (this.endText) { this.endText.t += E.dt; E.txt(c, this.endText.text, 135, 250, { align: 'c', color: PAL.gold, scale: 3, a: Math.min(1, this.endText.t / 150) }); }
      if (this.state === 'judge') this.drawJudge(c);
    },
    drawJudge(c) {
      c.fillStyle = 'rgba(14,9,30,.78)'; c.fillRect(0, 210, 270, 270);
      E.txt(c, 'YOU ' + this.tally.you + '   ' + this.tally.opp + ' ' + (this.opp.name.toUpperCase().slice(0, 10)), 135, 222, { align: 'c', color: PAL.cream });
      for (let i = 0; i < 5; i++) {
        const J = Core.JUDGES[i], x = 7 + i * 52, shown = i <= this.reveal, v = this.votes[i], k = shown ? Math.min(1, (this.stateT - 900 - i * 1100) / 250) : 0;
        c.fillStyle = PAL.ink; c.fillRect(x - 1, 250, 50, 150); c.fillStyle = shown ? (v.forPlayer ? '#0f4a5e' : '#5e1a45') : '#2c1d4d'; c.fillRect(x, 251, 48, 148);
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, 251, 48, 3);
        const ic = E.icon(J.likes || 'star'); ic.draw(c, x + 18, 262); E.txt(c, J.name.toUpperCase().slice(0, 8), x + 24, 282, { align: 'c', color: PAL.gold });
        if (shown) { E.txt(c, v.forPlayer ? 'YOU' : 'THEM', x + 24, 308 - Math.round((1 - k) * 8), { align: 'c', color: v.forPlayer ? PAL.neonCyan : PAL.neonPink, scale: 1, a: k }); const big = v.forPlayer; c.save(); c.globalAlpha = k; c.fillStyle = big ? PAL.neonCyan : PAL.neonPink; c.fillRect(x + 14, 322, 20, 20); c.fillStyle = PAL.ink; c.fillRect(x + 17, 325, 14, 14); c.fillStyle = big ? PAL.neonCyan : PAL.neonPink; if (big) { c.fillRect(x + 20, 332, 3, 3); c.fillRect(x + 23, 335, 6, 2); c.fillRect(x + 27, 328, 2, 8); } else { c.fillRect(x + 20, 328, 8, 2); c.fillRect(x + 20, 334, 8, 2); } c.restore(); }
        else E.txt(c, '?', x + 24, 322, { align: 'c', color: PAL.fog, scale: 3 });
      }
      if (this.reveal >= 0 && this.reveal < 5) { const J = Core.JUDGES[this.reveal]; c.fillStyle = 'rgba(14,9,30,.85)'; c.fillRect(0, 412, 270, 40); E.txt(c, J.name.toUpperCase() + ' SAYS', 135, 418, { align: 'c', color: PAL.gold }); E.txt(c, J.quip.toUpperCase().slice(0, 44), 135, 432, { align: 'c', color: PAL.cream }); }
    },
  };

  /* ---------------------------------------------------- results (perform) */
  // hold an action's effects until the player has seen the result
  G.doHold = function (action) {
    const r = Core.apply(G.ch, action, Math.random); G.setChar(r.char);
    return { fx: r.fx, char: r.char, play(hand) { G.play(r.fx.filter((f) => f.t !== 'result' && f.t !== 'battleResult'), hand); } };
  };
  // Show the result card for a perform action. then() runs on CONTINUE.
  G.showResult = function (f, then) {
    const res = f.res, rw = f.rw, rk = res.rank;
    const col = { S: 'var(--gold2)', A: 'var(--lime)', B: 'var(--cyan)', C: 'var(--cream)', D: '#ff7b8e' }[rk];
    const box = h('div.panel.pop', { style: { left: '14px', right: '14px', top: '84px', padding: '10px', zIndex: 30, textAlign: 'center' } },
      h('div.tp', { style: { color: PAL.fog } }, (f.kind || 'SET').toUpperCase() + ' RESULT'),
      h('div', { style: { fontFamily: "'Press Start 2P'", fontSize: '40px', lineHeight: '48px', color: col, textShadow: '2px 2px 0 var(--ink), 0 0 12px ' + col, margin: '4px 0' } }, rk),
      h('div.h2', null, Math.round(res.accuracy * 100) + '% ACCURACY'),
      h('div.row', { style: { justifyContent: 'center', margin: '6px 0', gap: '8px' } }, h('div.chip.gold', null, 'PERFECT ' + res.perfect), h('div.chip.cyan', null, 'GOOD ' + res.good), h('div.chip.red', null, 'MISS ' + res.miss)),
      h('div.ts', null, 'Best combo ' + res.bestCombo),
      h('div.row', { style: { justifyContent: 'center', margin: '8px 0 6px', gap: '8px', flexWrap: 'wrap' } }, rw.cash ? h('div.chip.gold', null, E.iconEl('coin', 1), '+$' + rw.cash) : null, rw.fans ? h('div.chip.cyan', null, E.iconEl('fans', 1), '+' + rw.fans) : null, h('div.chip.lime', null, E.iconEl('level', 1), '+' + rw.xp + ' XP')),
      E.btn('CONTINUE', 'gold big', () => { box.remove(); then && then(); }));
    E.add(box); E.sfx(rk === 'S' || rk === 'A' ? 'levelup' : 'confirm');
    if (rk === 'S') L.burst(135, 130, 40, { colors: [PAL.gold, '#fff', PAL.neonPink], speed: 110, up: 70, gravity: 120, life: 1200 });
  };
  // After any time-spending action: play held fx; if the day rolled over show the morning, else go back.
  G.finishActivity = function (held, back) {
    held.play({ morning: (f) => { G.pendingMorning = f; } });
    if (G.pendingMorning) { E.go('place', { id: 'home', morningFirst: true }); return; }
    if (back === 'street') E.go('street'); else E.go('place', { id: back });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
