'use strict';
// ===================== NEGOTIATION =====================
const PLAYER_BARKS = ['Hear me out.', 'Let\'s be reasonable.', 'You know I\'m right.', 'Think about it.', 'Easy now...', 'Here\'s the deal.', 'Be smart.'];
class NegotiationScene {
  constructor(opts) {
    this.opts = opts; const run = G.run; this.run = run; this.act = run.act;
    const ch = charById(run.char), def = ENEMIES[opts.enemy], tk = def.talk;
    this.def = def; this.tk = tk;
    this.bg = this.act === 1 ? 'market' : 'night'; this.bgSeed = 4 + this.act;
    let res = ch.nres + (run.grafts.includes('big_hat') ? 8 : 0);
    this.P = makeUnit(ch.spec, ch.name, res, 230, 455); this.P.maxhp = res; this.P.hp = res; this.P.dhp = res;
    const core = Math.round(tk.core * (opts.elite ? 1 : 1));
    this.O = makeUnit(def.spec, tk.name, core, 960, 455); this.O.x = 1300;
    this.pargs = []; this.oargs = []; this.argIdx = 0; this.oi = 0; this.soften = 0; this.uidN = 0;
    this.drawPile = shuffle(run.ndeck.map(c => newInst(c.id, c.up))); this.discard = []; this.exhaust = []; this.hand = []; this.fly = [];
    this.ap = 3; this.maxAp = 3; this.turn = 0; this.phase = 'start'; this.over = null;
    this.q = []; this.cur = null; this.wait = 0; this.fin = null; this.fx = [];
    this.hover = -1; this.drag = null; this.sel = -1; this.banner = null; this.t = 0; this.bubble = null; this.apShake = 0; this.pileBump = 0;
    this.coreT = { isCore: true }; this.hintKey = 'tutN'; this.hintText = 'Play Influence cards on their core (click the opponent) or on Arguments to destroy them. Composure soaks Pressure. Reduce their Resolve to zero to win!';
    Snd.setMood('talk');
    this.run_(this.intro());
  }
  alive() { return [this.coreT].concat(this.oargs); }
  get enemies() { return [this.O]; }
  say(who, text, t = 2) { this.bubble = { who, text, t: 0, max: t }; Snd.play('talk', who === this.P ? 1.2 : .7); who.pose.talk = 1; setTimeout(() => { who.pose.talk = 0; }, 700); }
  *intro() {
    this.banner_('NEGOTIATION', C.mustard, 1.2); Snd.play('drum');
    const t = this.O; t.tx = 960;
    for (let i = 0; i < 20; i++) { t.x = lerp(t.x, 960, .15); yield 0.03; }
    this.say(this.O, pick(this.tk.barks), 2.4);
    yield 1.3;
    const g = this.run.grafts, P = this.P;
    P.block = 0;
    if (g.includes('silver_tongue')) P.block += 4;
    if (this.run.char === 'pia') P.block += 3;
    this.spawnArg();
    yield 0.6;
    yield* this.startPlayerTurn(true);
  }
  spawnArg() {
    const key = this.tk.args[this.argIdx++ % this.tk.args.length], T = ARGS[key];
    const a = Object.assign({ key, uid: this.uidN++, maxres: T.resolve, pop: 0 }, T, { resolve: T.resolve });
    // scale with act
    if (this.act > 1) { a.n = Math.round(a.n * 1.4); a.resolve = Math.round(a.resolve * 1.4); a.maxres = a.resolve; }
    this.oargs.push(a); Snd.play('summon');
    burst(this.slotX(this.oargs.length - 1, false), 360, 16, { col: [C.red, C.mustard, C.ink], shape: 'star', min: 60, max: 260 });
  }
  slotX(i, player) { return player ? 350 + i * 88 : 830 - i * 88; }
  *startPlayerTurn(first) {
    const P = this.P; this.turn++;
    if (!first) P.block = 0;
    this.phase = 'start'; this.banner_('YOUR TURN', C.teal, .8); Snd.play('drum'); yield 0.5;
    // player arguments tick
    let extraDraw = 0;
    for (const a of this.pargs.slice()) {
      if (this.over) return;
      if (a.kind === 'inf') { a.pop = .01; yield* this.damageCore(a.n, a); yield 0.3; }
      else if (a.kind === 'comp') { P.block += a.n; a.pop = .01; Snd.play('block'); floatText(P.x, P.y - 220, `+${a.n} Composure`, C.sky, 28); yield 0.25; }
      else if (a.kind === 'draw') { extraDraw += a.n; a.pop = .01; yield 0.2; }
    }
    this.ap = this.maxAp + (first && this.run.grafts.includes('ledger') ? 1 : 0);
    yield* this.drawCards(5 + extraDraw + (first && this.run.grafts.includes('lucky_coin') ? 1 : 0));
    this.phase = 'player';
  }
  // damage the core (via composure)
  *damageCore(n, src) {
    const O = this.O; if (this.over) return;
    let d = n; const ab = Math.min(O.block, d); O.block -= ab; d -= ab; O.hp -= d;
    const cx = O.x, cy = O.y - 150;
    O.pose.flash = .25; O.pose.dx = 10;
    if (d > 0) { Snd.play(d >= 12 ? 'bighit' : 'hit', 1.2); shake(d >= 12 ? 10 : 4, .2); hitstop(d >= 12 ? .08 : .04); burst(cx, cy, 8 + Math.min(14, d), { col: [C.mustard, C.cream, C.orange], shape: 'star', min: 100, max: 360, up: 100, life: .5 }); floatText(cx + rnd(-14, 14), cy - 40, d, d >= 12 ? C.mustard : C.white, d >= 12 ? 56 : 42); }
    else { Snd.play('block'); floatText(cx, cy - 40, 'Deflected', C.sky, 28); }
    if (ab > 0 && d > 0) floatText(cx - 40, cy, `-${ab}`, C.sky, 22);
    if (O.hp <= 0) { O.hp = 0; this.over = 'win'; }
    yield 0.05;
  }
  *damageArg(a, n) {
    if (this.over) return;
    a.resolve -= n; a.flash = .25; Snd.play('hit'); shake(4, .15);
    const x = this.slotX(this.oargs.indexOf(a), false);
    floatText(x, 300, n, C.white, 38); burst(x, 360, 10, { col: [C.mustard, C.cream], shape: 'star', min: 60, max: 260 });
    if (a.resolve <= 0) {
      Snd.play('die'); burst(x, 360, 28, { col: [C.red, C.ink, C.cream], min: 100, max: 400, up: 120 }); shake(6, .2);
      this.oargs.splice(this.oargs.indexOf(a), 1);
    }
    yield 0.05;
  }
  // ----- card play -----
  playable(i) { const h = this.hand[i]; if (!h) return false; const d = cd(h.inst); return !d.unplayable && d.cost <= this.ap; }
  needsTarget(i) { const h = this.hand[i]; return !!h && cd(h.inst).tg === 'opp'; }
  enemyAt(x, y) {
    for (let i = 0; i < this.oargs.length; i++) { const sx = this.slotX(i, false); if (x > sx - 42 && x < sx + 42 && y > 300 && y < 420) return this.oargs[i]; }
    const O = this.O; if (x > O.x - 80 && x < O.x + 80 && y > O.y - 250 && y < O.y + 20) return this.coreT;
    return null;
  }
  tryPlay(i, target) {
    if (this.phase !== 'player' || this.busy || this.over) { Snd.play('error'); return false; }
    const h = this.hand[i]; if (!h) return false; const d = cd(h.inst);
    if (d.unplayable) { floatText(W / 2, 400, 'Unplayable', C.red, 34); Snd.play('error'); return false; }
    if (d.cost > this.ap) { floatText(W / 2, 400, 'Not enough AP', C.red, 34); Snd.play('error'); this.apShake = .4; return false; }
    if (d.tg === 'opp' && !target) return false;
    this.sel = -1; this.drag = null; if (!G.meta.seen[this.hintKey]) { G.meta.seen[this.hintKey] = 1; saveMeta(); } this.hand.splice(i, 1);
    this.run_(this.playCard(h, d, target)); return true;
  }
  *playCard(h, d, target) {
    this.ap -= d.cost; Snd.play('card');
    const f = { inst: h.inst, x: h.x, y: h.y, rot: h.rot, sc: h.sc, tx: W / 2 - 60, ty: 330, trot: 0, tsc: 1.15, t: 0, dur: .22, hold: true };
    this.fly.push(f); yield 0.25;
    yield* this.applyCard(d, target);
    f.hold = false; f.t = 0; f.dur = .35; f.x = f.tx; f.y = f.ty; f.rot = 0; f.sc = f.tsc;
    if (d.pwr || d.exhaust) { f.dest = 'exhaust'; this.exhaust.push(h.inst); f.fade = 1; f.tx = f.x; f.ty = f.y - 60; f.tsc = 1.2; burst(f.x, f.y, 20, { col: [C.orange, C.mustard], min: 60, max: 300, up: 150, grav: -100 }); }
    else if (d.arg) { f.dest = 'exhaust'; f.fade = 1; this.discard.push(h.inst); f.tx = f.x; f.ty = f.y - 40; }
    else { f.dest = 'discard'; this.discard.push(h.inst); f.tx = 1218; f.ty = 660; f.trot = .5; f.tsc = .3; }
    yield 0.12;
  }
  *applyCard(d, target) {
    const P = this.P, O = this.O, run = this.run;
    if (d.inf != null) {
      P.pose.atkT = 0; P.pose.talk = 1; Snd.play('talk', 1.2);
      if (Math.random() < .5) this.say(P, pick(PLAYER_BARKS), 1.4);
      yield 0.25;
      const hits = d.hits || 1;
      for (let h = 0; h < hits; h++) {
        if (d.all) {
          for (const a of this.oargs.slice()) yield* this.damageArg(a, d.inf);
          yield* this.damageCore(d.inf);
        } else if (target && target.isCore) yield* this.damageCore(d.inf);
        else if (target && this.oargs.includes(target)) yield* this.damageArg(target, d.inf);
        else yield* this.damageCore(d.inf);
        if (this.over) return; if (hits > 1) yield 0.12;
      }
      P.pose.talk = 0;
    }
    if (d.strip) { O.block = 0; Snd.play('debuff'); floatText(O.x, O.y - 220, 'Composure broken!', C.mustard, 28); }
    if (d.comp) { P.block += d.comp; Snd.play('block'); floatText(P.x, P.y - 220, `+${d.comp} Composure`, C.sky, 30); burst(P.x, P.y - 110, 12, { col: [C.sky, C.cream], shape: 'star', grav: -50, min: 40, max: 180 }); }
    if (d.soften) { this.soften += d.soften; Snd.play('debuff'); floatText(O.x, O.y - 230, `Pressure -${d.soften}`, C.green, 26); }
    if (d.arg) {
      const a = Object.assign({ uid: this.uidN++, pop: .01 }, d.arg); this.pargs.push(a); if (this.pargs.length > 3) this.pargs.shift();
      Snd.play('buff'); burst(this.slotX(this.pargs.length - 1, true), 360, 20, { col: [C.mustard, C.teal], shape: 'star' });
      if (a.kind === 'comp' || a.kind === 'inf') { /* ticks on next turn */ }
    }
    if (d.heal) { P.hp = Math.min(P.maxhp, P.hp + d.heal); Snd.play('heal'); floatText(P.x, P.y - 220, `+${d.heal}`, C.green, 34); }
    if (d.hurt) { P.hp -= d.hurt; P.pose.flash = .2; Snd.play('hit'); floatText(P.x, P.y - 210, d.hurt, C.red, 34); if (P.hp <= 0) { P.hp = 0; this.over = 'lose'; return; } }
    if (d.ap) { this.ap += d.ap; Snd.play('buff'); floatText(80, 520, `+${d.ap} AP`, C.mustard, 34); }
    if (d.money) { run.money += d.money; Snd.play('coin'); floatText(P.x + 40, P.y - 200, `+${d.money} shil`, C.mustard, 30); }
    if (d.draw) yield* this.drawCards(d.draw);
    yield 0.05;
  }
  // ----- opponent turn -----
  *endTurnSeq() {
    Snd.play('endturn');
    const P = this.P, O = this.O;
    this.discardHandVis(); this.hand.forEach(h => this.discard.push(h.inst)); this.hand = [];
    yield 0.5; this.banner_('THEIR TURN', C.red, .8); yield 0.6;
    O.block = 0;
    for (const a of this.oargs.slice()) {
      if (this.over) return;
      a.pop = .01; yield 0.25;
      if (a.kind === 'pressure') { yield* this.pressure(a.n, this.slotX(this.oargs.indexOf(a), false)); }
      else if (a.kind === 'fort') { O.block += a.n; Snd.play('block'); floatText(O.x, O.y - 240, `+${a.n} Composure`, C.sky, 28); }
      else if (a.kind === 'mend') { O.hp = Math.min(O.maxhp, O.hp + a.n); Snd.play('heal'); floatText(O.x, O.y - 240, `+${a.n}`, C.green, 34); }
      else if (a.kind === 'doubt') { this.discard.push(newInst('doubt')); Snd.play('debuff'); floatText(P.x, P.y - 230, '+Doubt', C.plum, 30); }
      yield 0.25;
    }
    if (this.over) return;
    // core pressure
    const n = Math.max(0, this.tk.moves[this.oi % this.tk.moves.length] * (this.act > 1 ? 1.3 : 1) - this.soften) | 0; this.soften = 0;
    O.pose.atkT = 0; this.say(O, pick(this.tk.barks), 1.6); yield 0.5;
    if (n > 0) yield* this.pressure(n, O.x);
    this.oi++;
    if (this.over) return;
    if (this.oargs.length < this.tk.max) { this.spawnArg(); yield 0.5; }
    yield* this.startPlayerTurn(false);
  }
  *pressure(n, fromX) {
    const P = this.P;
    let d = n; const ab = Math.min(P.block, d); P.block -= ab; d -= ab; P.hp -= d;
    P.pose.flash = .25; P.pose.dx = -14;
    if (d > 0) { Snd.play(n >= 10 ? 'bighit' : 'hit', .8); shake(n >= 10 ? 10 : 5, .2); hitstop(.04); floatText(P.x + rnd(-14, 14), P.y - 200, d, C.red, 44); burst(P.x, P.y - 140, 12, { col: [C.red, C.cream], a: 3.14, spread: 1.4, up: 80 }); }
    else { Snd.play('block'); floatText(P.x, P.y - 200, 'Held firm', C.sky, 28); }
    if (ab > 0 && d > 0) floatText(P.x - 40, P.y - 170, `-${ab}`, C.sky, 22);
    if (P.hp <= 0) { P.hp = 0; this.over = 'lose'; }
    yield 0.1;
  }
  *finish() {
    const run = this.run, O = this.O;
    if (this.over === 'win') {
      this.phase = 'over'; Snd.play('win'); this.hand.forEach(h => this.discard.push(h.inst)); this.discardHandVis(); this.hand = [];
      this.say(O, pick(['Fine. FINE. You win.', 'Alright, alright... take it.', 'You drive a hard bargain.']), 2); yield 0.9;
      this.banner_('PERSUADED!', C.mustard, 1.6); Snd.play('stamp'); shake(8, .3);
      burst(W / 2, 300, 60, { col: [C.mustard, C.orange, C.cream, C.teal], shape: 'star', min: 100, max: 500, up: 200, life: 1.2, s0: 6, s1: 14 });
      yield 1.8;
      let gold = Math.round((this.opts.fightIds.reduce((s, id) => s + ENEMIES[id].gold, 0)) * 1.4) + ri(4, 10);
      if (run.grafts.includes('gold_tooth')) gold = Math.round(gold * 1.25);
      const elite = this.opts.elite, boss = this.opts.boss;
      const reward = { gold, cards: rollCards('n', run, 3, { elite }), kind: 'n', graft: elite || boss ? rollGraft(run) : null, boss: !!boss, node: this.opts.node, talk: true };
      go(() => setScene(new RewardScene(reward)));
    } else {
      this.phase = 'over'; Snd.play('lose'); this.banner_('TALKS BREAK DOWN', C.red, 1.8);
      this.say(O, 'Enough talk. Draw!', 1.6); yield 2.0;
      go(() => setScene(new BattleScene({ enemies: this.opts.fightIds, enraged: true, node: this.opts.node, elite: this.opts.elite, boss: this.opts.boss })));
    }
  }
  onKey(k) {
    if (k === 'Escape') { openPause(); return; }
    if (this.phase !== 'player' || this.busy) return;
    if (k === 'e' || k === 'E' || k === 'Enter') this.endTurn();
    else if (/^[1-9]$/.test(k)) {
      const i = +k - 1; if (!this.hand[i]) return;
      if (!this.needsTarget(i)) this.tryPlay(i, null);
      else { this.sel = this.sel === i ? -1 : i; Snd.play('click'); }
    }
  }
  update(dt) {
    this.t += dt;
    if (G.hitstop <= 0) this.step(dt);
    for (const u of [this.P, this.O]) {
      const p = u.pose;
      if (p.atkT >= 0) { p.atkT += dt; if (p.atkT > 0.6) p.atkT = -1; }
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.5);
      p.dx *= Math.pow(.0005, dt);
      u.dhp = lerp(u.dhp, u.hp, 1 - Math.pow(.02, dt));
    }
    this.updateHand(dt);
    for (const a of this.oargs.concat(this.pargs)) { if (a.pop > 0) { a.pop += dt * 2.2; if (a.pop > 1) a.pop = 0; } if (a.flash > 0) a.flash -= dt; }
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i]; f.t += dt; if (f.t < 0) continue;
      const k = clamp(f.t / f.dur, 0, 1);
      f.cx = lerp(f.x, f.tx, ease.out(k)); f.cy = lerp(f.y, f.ty, ease.out(k)); f.cr = lerp(f.rot, f.trot, k); f.cs = lerp(f.sc, f.tsc, ease.out(k));
      if (!f.hold && k >= 1) { if (f.dest === 'discard') this.pileBump = .3; this.fly.splice(i, 1); }
    }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.max) this.banner = null; }
    if (this.bubble) { this.bubble.t += dt; if (this.bubble.t > this.bubble.max) this.bubble = null; }
    if (this.apShake > 0) this.apShake -= dt; if (this.pileBump > 0) this.pileBump -= dt;
  }
  drawToken(c, a, x, y, player) {
    const sc = 1 + (a.pop > 0 ? Math.sin(a.pop * Math.PI) * .25 : 0);
    const col = player ? (a.kind === 'inf' ? C.mustard : a.kind === 'comp' ? C.blue : C.teal) : a.kind === 'pressure' ? C.red : a.kind === 'fort' ? C.blue : a.kind === 'mend' ? C.green : C.plum;
    c.save(); c.translate(x, y); c.scale(sc, sc);
    if (a.flash > 0) c.filter = 'brightness(2.5)';
    inkRect(c, -40, -50, 80, 100, col, a.uid * 3 + 5, { lw: 4, r: 10, off: 3 });
    inkRect(c, -33, -22, 66, 56, C.cream, a.uid * 3 + 6, { lw: 2.5, r: 6, off: 0, shade: false });
    c.filter = 'none';
    const ic = a.icon || (a.kind === 'inf' ? 'mouth' : a.kind === 'comp' ? 'shield' : 'eye');
    icon(c, ic, 0, -3, 17);
    txt(c, a.name, 0, -30, { size: 13, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 3 });
    if (a.n != null) { inkEll(c, 30, -44, 13, 13, C.cream, { seed: 3, lw: 3, off: 0, shade: false, n: 8 }); txt(c, String(a.n), 30, -38, { size: 18, font: FD, color: C.ink, align: 'center' }); }
    if (!player) {
      txt(c, `${Math.max(0, a.resolve)}`, 0, 28, { size: 22, font: FD, color: C.red, align: 'center', stroke: C.cream, sw: 4 });
      const k = clamp(a.resolve / a.maxres, 0, 1); c.fillStyle = C.ink; c.fillRect(-28, 34, 56, 7); c.fillStyle = C.red; c.fillRect(-27, 35, 54 * k, 5);
    } else {
      txt(c, a.kind === 'inf' ? 'each turn' : 'each turn', 0, 30, { size: 12, color: C.ink, align: 'center' });
    }
    c.restore();
    if (Math.abs(In.x - x) < 42 && Math.abs(In.y - y) < 52 && UI.enabled) {
      if (player) tip(a.name, a.kind === 'inf' ? `Deals ${a.n} Influence each turn.` : a.kind === 'comp' ? `Gain ${a.n} Composure each turn.` : `Draw ${a.n} extra card each turn.`);
      else tip(a.name, a.desc.replace(/\d+/, a.n) + `\nResolve ${a.resolve}/${a.maxres}. Destroy it with Influence.`);
    }
  }
  draw(c) {
    drawBackdrop(c, this.bg, this.bgSeed, G.time);
    UI.enabled = !G.modal;
    const P = this.P, O = this.O;
    // table
    c.save(); c.fillStyle = 'rgba(40,20,5,.25)'; c.beginPath(); c.ellipse(W / 2, 420, 330, 45, 0, 0, 6.3); c.fill(); c.restore();
    const targeting = (this.drag && this.drag.moved > 14 && this.needsTarget(this.drag.i)) || this.sel >= 0;
    const hov = this.enemyAt(In.x, In.y);
    drawUnit(c, P, 1); drawUnit(c, O, -1);
    hpBar(c, P, P.x, P.y + 22, 160, 16, { col: C.mustard });
    txt(c, 'RESOLVE', P.x, P.y + 56, { size: 14, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    hpBar(c, O, O.x, O.y + 22, 160, 16, { col: C.mustard });
    txt(c, this.tk.name.toUpperCase(), O.x, O.y + 56, { size: 15, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    if (UI.hit(P.x - 80, P.y - 220, 160, 240)) tip('Resolve', 'Your will to keep talking. If it hits 0, talks break down and a fight starts.\nComposure absorbs pressure first and fades each turn.');
    if (UI.hit(O.x - 80, O.y - 250, 160, 270) && !hov) tip(this.tk.name, 'Reduce their Resolve to 0 to win them over. Composure shields them.');
    // intent
    if (this.phase !== 'over') {
      const n = Math.max(0, this.tk.moves[this.oi % this.tk.moves.length] * (this.act > 1 ? 1.3 : 1) - this.soften) | 0;
      const ix = O.x, iy = O.y - 270 + Math.sin(G.time * 3) * 4;
      intentBubble(c, ix, iy, 'fist', String(n));
      if (Math.abs(In.x - ix) < 36 && Math.abs(In.y - iy) < 34) tip('Pressure', `Will pressure you for ${n} next.`);
    }
    // tokens
    this.oargs.forEach((a, i) => this.drawToken(c, a, this.slotX(i, false), 360, false));
    this.pargs.forEach((a, i) => this.drawToken(c, a, this.slotX(i, true), 360, true));
    txt(c, 'THEIR ARGUMENTS', 740, 292, { size: 14, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    if (this.pargs.length) txt(c, 'YOUR ARGUMENTS', 438, 292, { size: 14, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    // composure display
    if (P.block > 0) { icon(c, 'shield', P.x - 100, P.y - 130, 18); }
    if (targeting && hov) {
      c.save(); c.strokeStyle = C.red; c.lineWidth = 5; c.setLineDash([12, 8]); c.lineDashOffset = -G.time * 30;
      if (hov.isCore) { c.beginPath(); c.ellipse(O.x, O.y - 110, 90, 140, 0, 0, 6.3); c.stroke(); }
      else { const x = this.slotX(this.oargs.indexOf(hov), false); c.strokeRect(x - 46, 308, 92, 112); }
      c.restore();
    }
    // bubble
    if (this.bubble) this.drawBubble(c);
    this.drawHUDParts(c);
    this.drawHand(c);
    for (const f of this.fly) {
      if (f.t < 0) continue; const k = clamp(f.t / f.dur, 0, 1);
      drawCard(c, cd(f.inst), f.cx != null ? f.cx : f.x, f.cy != null ? f.cy : f.y, f.cr != null ? f.cr : f.rot, f.cs != null ? f.cs : f.sc, { alpha: f.fade ? 1 - k : 1 });
    }
    if (this.sel >= 0 && this.hand[this.sel]) {
      const hc = this.hand[this.sel]; c.save(); c.strokeStyle = C.red; c.lineWidth = 6; c.setLineDash([12, 10]); c.lineDashOffset = -G.time * 40;
      c.beginPath(); c.moveTo(hc.x, hc.y - 120); c.quadraticCurveTo((hc.x + In.x) / 2, Math.min(hc.y, In.y) - 120, In.x, In.y); c.stroke(); c.restore();
      disp(c, 'Choose a target', W / 2, 150, 28, C.cream);
    }
    if (this.drag && this.drag.moved > 14 && !this.needsTarget(this.drag.i)) disp(c, In.y < 480 ? 'Release to play' : 'Drag up to play', W / 2, 250, 30, In.y < 480 ? C.mustard : C.cream, { alpha: .8 });
    const can = this.phase === 'player' && !this.busy;
    if (UI.btn(1075, 548, 175, 50, 'END TURN', { col: can ? '#f27a1a' : C.grey, disabled: !can, size: 28, slant: 1 })) this.endTurn();
    if (this.banner) this.drawBanner(c);
    drawHUD(c, this.run, { neg: true, turn: this.turn });
    UI.enabled = true;
  }
  drawBubble(c) {
    const b = this.bubble, u = b.who, k = b.t / b.max; const pop = ease.back(clamp(b.t * 6, 0, 1));
    const dir = u === this.P ? 1 : -1; const x = u.x + dir * 20, y = u.y - 300;
    c.save(); c.font = `22px ${FB}`; const w = Math.min(280, c.measureText(b.text).width + 36); const lines = wrapLines(c, b.text, w - 30);
    const h = lines.length * 26 + 22;
    c.translate(x, y); c.scale(pop, pop); c.globalAlpha = k > .85 ? (1 - k) / .15 : 1;
    inkShape(c, [[-w / 2, -h], [w / 2, -h], [w / 2, 0], [dir * 10 + 14, 0], [dir * 22, 20], [dir * 10 - 4, 0], [-w / 2, 0]], C.cream, { seed: 13, lw: 4, off: 3, sharp: 1, amp: .8 });
    c.fillStyle = C.ink; c.textAlign = 'center'; lines.forEach((l, i) => c.fillText(l, 0, -h + 28 + i * 26));
    c.restore();
  }
}
// borrow shared card-scene behaviour from BattleScene
['run_', 'step', 'updateHand', 'onDown', 'onUp', 'onRight', 'drawCards', 'discardHandVis', 'endTurn', 'banner_', 'drawBanner', 'drawHand', 'drawHUDParts'].forEach(k => { NegotiationScene.prototype[k] = BattleScene.prototype[k]; });
Object.defineProperty(NegotiationScene.prototype, 'busy', Object.getOwnPropertyDescriptor(BattleScene.prototype, 'busy'));
