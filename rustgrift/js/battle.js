'use strict';
// ===================== BATTLE =====================
function makeUnit(spec, name, hp, x, y, extra) {
  return Object.assign({
    name, spec, hp, maxhp: hp, dhp: hp, block: 0, st: {}, x, y, tx: x, scale: spec.scale || 1,
    pose: { atkT: -1, flash: 0, dx: 0, dead: 0, hop: 0, talk: 0, ph: Math.random() * 6 }, dead: false, uid: Math.random()
  }, extra || {});
}
function unitPose(u, dir) {
  const p = u.pose, a = p.atkT >= 0 ? clamp(p.atkT / 0.5, 0, 1) : 0;
  return { t: G.time + p.ph, atk: a, talk: p.talk, hurt: p.flash > 0.05 && a === 0 };
}
// draws the figure at its position with all animation state, returns nothing
function drawUnit(c, u, dir, o = {}) {
  const p = u.pose;
  const a = p.atkT >= 0 ? clamp(p.atkT / 0.5, 0, 1) : 0;
  const lunge = Math.sin(Math.PI * a) * 46 * dir;
  c.save();
  c.translate(u.x + p.dx + lunge, u.y - Math.abs(Math.sin(p.hop * 3.14)) * 30);
  if (p.dead > 0) { c.globalAlpha = 1 - p.dead; c.rotate(p.dead * 0.9 * dir); c.translate(0, p.dead * 24); }
  const sq = 1 + p.flash * 0.12; c.scale(dir * u.scale * sq, u.scale / sq);
  if (p.flash > 0.02) c.filter = `brightness(${1 + p.flash * 5}) saturate(${1 - p.flash * 1.5})`;
  drawFigure(c, u.spec, unitPose(u, dir));
  c.filter = 'none';
  c.restore();
}
function statusRow(c, u, cx, y) {
  const keys = Object.keys(u.st).filter(k => u.st[k] > 0 && STATUS[k]);
  const sp = 36, x0 = cx - (keys.length - 1) * sp / 2;
  keys.forEach((k, i) => {
    const x = x0 + i * sp; const S = STATUS[k];
    inkEll(c, x, y, 15, 15, C.cream, { seed: 3 + i, lw: 3, off: 0, shade: false, n: 8 });
    icon(c, S.icon, x, y, 10);
    txt(c, String(u.st[k]), x + 11, y + 15, { size: 17, font: FD, color: C.cream, stroke: C.ink, sw: 4, align: 'center' });
    if (UI.enabled && Math.abs(In.x - x) < 16 && Math.abs(In.y - y) < 16) tip(S.name, S.desc);
  });
}

class BattleScene {
  constructor(opts) {
    this.opts = opts; const run = G.run; this.run = run;
    this.act = run.act; this.bg = (ENC[run.act] || ENC[1]).bg; this.bgSeed = run.act * 3 + (opts.seed || 1);
    const ch = charById(run.char);
    this.P = makeUnit(ch.spec, ch.name, run.hp, 250, 455);
    this.P.maxhp = run.maxhp; this.P.hp = run.hp; this.P.dhp = run.hp;
    this.enemies = []; this.uidN = 0;
    const ids = opts.enemies;
    ids.forEach(id => this.addEnemy(id, true));
    this.layout(true);
    this.enemies.forEach(e => { e.x = e.tx + 500 + Math.random() * 100; });
    // deck
    this.drawPile = shuffle(run.deck.map(c => newInst(c.id, c.up)));
    this.discard = []; this.exhaust = []; this.hand = []; this.fly = [];
    this.ap = 3; this.maxAp = 3; this.turn = 0; this.phase = 'start'; this.over = null;
    this.q = []; this.cur = null; this.wait = 0; this.fin = null; this.fx = [];
    this.hover = -1; this.drag = null; this.sel = -1; this.firstAtk = true; this.banner = null; this.shownTip = null; this.t = 0;
    this.killedBy = 0; this.hintKey = 'tutB'; this.hintText = 'Click a card, then click an enemy. Or drag cards up onto them. Watch the intent icons above enemies! Press E to end turn.';
    // enraged (failed negotiation)
    if (opts.enraged) this.enemies.forEach(e => { e.st.str = (e.st.str || 0) + 2; });
    Snd.setMood('battle');
    this.run_(this.intro());
  }
  addEnemy(id, silent) {
    const d = spawnEnemyData(id, this.act);
    const def = d.def;
    const u = makeUnit(def.spec, def.name, d.hp, 900, 455, { id, def, mi: def.boss || def.elite ? 0 : ri(0, def.moves.length - 1), uid: this.uidN++ });
    u.intent = null; this.enemies.push(u); this.pickIntent(u, true);
    return u;
  }
  alive() { return this.enemies.filter(e => !e.dead); }
  layout(snap) {
    const al = this.alive(), n = al.length;
    const xs = n === 1 ? [900] : n === 2 ? [790, 1010] : n === 3 ? [700, 880, 1060] : [650, 800, 950, 1100];
    al.forEach((e, i) => { e.tx = xs[i]; if (snap) e.x = e.tx; });
  }
  // ----- coroutine runner -----
  run_(g) { this.q.push(g); }
  get busy() { return !!(this.cur || this.q.length); }
  step(dt) {
    if (this.over && !this.fin) { this.q.length = 0; this.cur = null; this.fin = this.finish(); this.wait = 0; }
    if (this.fin) { if (this.wait > 0) { this.wait -= dt; return; } const r = this.fin.next(); if (r.done) this.fin = null; else this.wait = r.value || 0; return; }
    if (this.wait > 0) { this.wait -= dt; return; }
    if (!this.cur && this.q.length) this.cur = this.q.shift();
    if (this.cur) { const r = this.cur.next(); if (r.done) this.cur = null; else this.wait = (r.value || 0) * (G.settings.fast ? .45 : 1); }
  }
  // ----- helpers -----
  pickIntent(e, first) {
    const m = e.def.moves;
    if (e.def.mode === 'rand') { let i; do { i = ri(0, m.length - 1); } while (m.length > 1 && i === e.mi && !first); e.mi = i; }
    else if (!first) e.mi = (e.mi + 1) % m.length;
    e.intent = m[e.mi];
  }
  calc(src, tgt, base) {
    let d = base + (src.st.str || 0);
    if (src.st.weak) d *= 0.75; if (tgt.st.vuln) d *= 1.5;
    return Math.max(0, Math.floor(d));
  }
  addStatus(u, k, n, quiet) {
    if (k === 'bleed' && u !== this.P && this.run.grafts.includes('hot_sauce')) n += 1;
    u.st[k] = (u.st[k] || 0) + n;
    if (u.st[k] <= 0) delete u.st[k];
    if (!quiet) {
      const S = STATUS[k]; const bad = (u === this.P) ? ['bleed', 'weak', 'vuln'].includes(k) : !['bleed', 'weak', 'vuln'].includes(k) ? false : true;
      const good = u === this.P ? !['bleed', 'weak', 'vuln'].includes(k) : ['bleed', 'weak', 'vuln'].includes(k);
      Snd.play(good ? 'buff' : 'debuff');
      floatText(u.x, u.y - 230 * u.scale, `${n > 0 ? '+' : ''}${n} ${S.name}`, S.col === C.plum ? '#d9b3e8' : '#fff', 26);
      burst(u.x, u.y - 100 * u.scale, 10, { col: S.col, shape: 'star', min: 40, max: 170, grav: -60, life: .6 });
    }
  }
  banner_(text, col = C.mustard, t = 1.1) { this.banner = { text, col, t: 0, max: t }; }
  slash(x, y, col = C.white, big = false) { this.fx.push({ k: 'slash', x, y, t: 0, max: .22, col, a: rnd(-.5, .5), big }); }
  // damage one hit from src to tgt; returns actual hp damage
  *hit(src, tgt, dmg, o = {}) {
    if (tgt.dead || this.over) return 0;
    let d = dmg; const ab = Math.min(tgt.block, d); tgt.block -= ab; d -= ab;
    tgt.hp -= d;
    const cx = tgt.x, cy = tgt.y - 110 * tgt.scale;
    tgt.pose.flash = 0.25; tgt.pose.dx = (tgt === this.P ? -1 : 1) * Math.min(24, 6 + dmg);
    const big = dmg >= 15;
    if (d > 0) {
      Snd.play(big ? 'bighit' : 'hit', 1 + Math.random() * .2); shake(big ? 14 : 6 + d * .3, .25); hitstop(big ? .09 : .045);
      burst(cx, cy, 8 + Math.min(18, d), { col: tgt === this.P ? [C.red, C.cream] : [C.ink, C.red, C.orange, C.mustard], min: 120, max: 380, a: (tgt === this.P ? 3.14 : 0), spread: 1.6, up: 100, life: .5 });
      if (o.slash !== false) this.slash(cx, cy, C.white, big);
      floatText(cx + rnd(-16, 16), cy - 50, d, big ? C.mustard : C.white, big ? 58 : 44);
      G.zoomPunch = Math.max(G.zoomPunch, big ? 1 : .4);
    } else {
      Snd.play('block'); shake(3, .12);
      burst(cx, cy, 8, { col: [C.metal, C.cream, C.mustard], shape: 'star', min: 80, max: 260, life: .35, grav: 200 });
      floatText(cx, cy - 50, 'Blocked', C.sky, 30);
    }
    if (ab > 0 && d > 0) floatText(cx - 40, cy - 20, `-${ab}`, C.sky, 24);
    if (tgt.hp <= 0 && !tgt.dead) { tgt.hp = 0; this.kill(tgt); }
    yield 0.05;
    return d;
  }
  kill(u) {
    if (u === this.P) { this.over = 'lose'; return; }
    u.dead = true; Snd.play('die'); shake(10, .4); hitstop(.12);
    burst(u.x, u.y - 100 * u.scale, 40, { col: [C.ink, u.spec.coat, C.cream, C.orange], min: 100, max: 460, life: .8, up: 160, s0: 5, s1: 13 });
    burst(u.x, u.y - 80, 3, { col: C.cream, shape: 'ring', min: 0, max: 1, s0: 20, s1: 24, life: .5, grav: 0 });
    this.layout();
    if (this.alive().length === 0) this.over = 'win';
  }
  // ----- turn flow -----
  *intro() {
    this.banner_('BATTLE!', C.orange, 1);
    Snd.play('drum');
    yield 0.9;
    const g = this.run.grafts, P = this.P;
    if (g.includes('wire_spool')) { P.block += 5; }
    if (g.includes('iron_knuckle')) { P.st.str = (P.st.str || 0) + 1; }
    if (this.run.char === 'mourn' && false) P.st.str = 1;
    yield* this.startPlayerTurn(true);
  }
  *startPlayerTurn(first) {
    const P = this.P; this.turn++;
    if (!first) P.block = 0;
    this.phase = 'start';
    this.banner_('YOUR TURN', C.teal, .9); Snd.play('drum');
    yield 0.5;
    if (P.st.bleed) {
      const d = P.st.bleed; P.st.bleed--; if (!P.st.bleed) delete P.st.bleed;
      Snd.play('hit'); P.hp -= d; floatText(P.x, P.y - 200, d, C.red, 40); P.pose.flash = .2;
      if (P.hp <= 0) { P.hp = 0; this.kill(P); return; } yield 0.4;
    }
    this.ap = this.maxAp + (first && this.run.grafts.includes('rusty_cog') ? 1 : 0);
    yield* this.drawCards(5 + (first && this.run.grafts.includes('lucky_coin') ? 1 : 0));
    this.phase = 'player';
  }
  *drawCards(n) {
    for (let i = 0; i < n; i++) {
      if (this.over) return;
      if (!this.drawPile.length) {
        if (!this.discard.length) break;
        this.drawPile = shuffle(this.discard); this.discard = [];
        Snd.play('whoosh'); floatText(70, 610, 'Reshuffle', C.cream, 24); yield 0.25;
      }
      const inst = this.drawPile.pop();
      if (this.hand.length >= 10) { this.discard.push(inst); floatText(W / 2, 520, 'Hand full!', C.red, 30); continue; }
      this.hand.push({ inst, x: 70, y: 660, rot: -.4, sc: .35, a: 1 }); Snd.play('draw');
      yield 0.09;
    }
  }
  discardHandVis() {
    // fly all hand cards into the discard pile
    this.hand.forEach((h, i) => { this.fly.push({ inst: h.inst, x: h.x, y: h.y, rot: h.rot, sc: h.sc, tx: 1218, ty: 660, trot: .5, tsc: .3, t: -i * .03, dur: .35, fade: 0, dest: 'discard' }); });
    this.hand = [];
  }
  endTurn() {
    if (this.phase !== 'player' || this.busy) { Snd.play('error'); return; }
    this.phase = 'enemy'; this.sel = -1;
    this.run_(this.endTurnSeq());
  }
  *endTurnSeq() {
    Snd.play('endturn');
    const P = this.P;
    this.hand.forEach(h => this.discard.push(h.inst)); this.discardHandVis();
    if (P.st.weak) { P.st.weak--; if (!P.st.weak) delete P.st.weak; }
    if (P.st.vuln) { P.st.vuln--; if (!P.st.vuln) delete P.st.vuln; }
    yield 0.5;
    this.banner_('ENEMY TURN', C.red, .9); yield 0.6;
    for (const e of this.enemies.slice()) {
      if (e.dead || this.over) continue;
      e.block = 0;
      if (e.st.bleed) {
        const d = e.st.bleed; e.st.bleed--; if (!e.st.bleed) delete e.st.bleed;
        e.hp -= d; e.pose.flash = .2; Snd.play('hit'); floatText(e.x, e.y - 200 * e.scale, d, C.red, 36); burst(e.x, e.y - 100, 8, { col: C.red, grav: 600 });
        if (e.hp <= 0) { e.hp = 0; this.kill(e); yield 0.4; continue; }
        yield 0.3;
      }
      yield* this.doMove(e);
      if (e.st.weak) { e.st.weak--; if (!e.st.weak) delete e.st.weak; }
      if (e.st.vuln) { e.st.vuln--; if (!e.st.vuln) delete e.st.vuln; }
      this.pickIntent(e);
      yield 0.2;
    }
    if (this.over) return;
    yield* this.startPlayerTurn(false);
  }
  *doMove(e) {
    const m = e.intent, P = this.P;
    switch (m.t) {
      case 'atk': {
        for (let h = 0; h < (m.h || 1); h++) {
          if (this.over) return;
          e.pose.atkT = 0; Snd.play('whoosh'); yield 0.22;
          const d = this.calc(e, P, m.n);
          const dealt = yield* this.hit(e, P, d);
          if (P.st.thorns && !e.dead) { e.hp -= P.st.thorns; e.pose.flash = .2; floatText(e.x, e.y - 180, P.st.thorns, C.green, 30); Snd.play('hit'); if (e.hp <= 0) { e.hp = 0; this.kill(e); } }
          if (m.st && dealt >= 0) this.addStatus(P, m.st[0], m.st[1]);
          yield 0.18;
        }
        break;
      }
      case 'blk': e.block += m.n; Snd.play('block'); e.pose.hop = 0.01; floatText(e.x, e.y - 200 * e.scale, `+${m.n} Block`, C.sky, 28); burst(e.x, e.y - 100, 10, { col: [C.metal, C.sky], shape: 'star', min: 40, max: 160, grav: -40 }); yield 0.5; break;
      case 'buf': this.addStatus(e, m.st, m.n); e.pose.hop = 0.01; yield 0.55; break;
      case 'deb': {
        if (m.dmg) { e.pose.atkT = 0; yield 0.22; yield* this.hit(e, P, this.calc(e, P, m.dmg)); }
        else { e.pose.hop = .01; yield 0.25; }
        this.addStatus(P, m.st, m.n); yield 0.4; break;
      }
      case 'heal': { e.hp = Math.min(e.maxhp, e.hp + m.n); Snd.play('heal'); floatText(e.x, e.y - 200 * e.scale, `+${m.n}`, C.green, 36); burst(e.x, e.y - 100, 12, { col: C.green, shape: 'star', grav: -80 }); yield 0.5; break; }
      case 'sum': {
        if (this.alive().length < 4) {
          Snd.play('summon'); const u = this.addEnemy(m.id); u.x = e.x + 40; u.pose.flash = .5; this.layout(); u.st.str = 0;
          burst(u.tx, u.y - 60, 24, { col: [C.plum, C.orange, C.ink], min: 60, max: 280, up: 100 }); shake(6, .3);
          floatText(e.x, e.y - 230 * e.scale, 'Reinforcements!', C.mustard, 30);
        } else { e.block += 8; floatText(e.x, e.y - 200 * e.scale, '+8 Block', C.sky, 28); }
        yield 0.8; break;
      }
    }
  }
  // ----- playing cards -----
  playable(i) { const h = this.hand[i]; if (!h) return false; const d = cd(h.inst); return !d.unplayable && d.cost <= this.ap; }
  tryPlay(i, target) {
    if (this.phase !== 'player' || this.busy || this.over) { Snd.play('error'); return false; }
    const h = this.hand[i]; if (!h) return false;
    const d = cd(h.inst);
    if (d.unplayable) { floatText(W / 2, 400, 'Unplayable', C.red, 34); Snd.play('error'); shake(3, .15); return false; }
    if (d.cost > this.ap) { floatText(W / 2, 400, 'Not enough AP', C.red, 34); Snd.play('error'); shake(3, .15); this.apShake = .4; return false; }
    if (d.tg === 'enemy' && (!target || target.dead)) return false;
    this.sel = -1; this.drag = null; if (this.hintKey && !G.meta.seen[this.hintKey]) { G.meta.seen[this.hintKey] = 1; saveMeta(); }
    this.hand.splice(i, 1);
    this.run_(this.playCard(h, d, target));
    return true;
  }
  *playCard(h, d, target) {
    const P = this.P; this.ap -= d.cost; Snd.play('card');
    const f = { inst: h.inst, x: h.x, y: h.y, rot: h.rot, sc: h.sc, tx: W / 2 - 60, ty: 330, trot: 0, tsc: 1.15, t: 0, dur: .22, hold: true };
    this.fly.push(f);
    yield 0.25;
    yield* this.applyCard(d, target);
    f.hold = false; f.t = 0; f.dur = .35; f.x = f.tx; f.y = f.ty; f.rot = 0; f.sc = f.tsc;
    if (d.exhaust || d.pwr) { f.dest = 'exhaust'; this.exhaust.push(h.inst); f.fade = 1; }
    else { f.dest = 'discard'; this.discard.push(h.inst); f.tx = 1218; f.ty = 660; f.trot = .5; f.tsc = .3; }
    f.counted = true;
    if (d.exhaust || d.pwr) { f.tx = f.x; f.ty = f.y - 60; f.trot = 0; f.tsc = 1.2; burst(f.x, f.y, 24, { col: [C.orange, C.mustard, C.ink], shape: 'rect', min: 60, max: 300, up: 150, grav: -100 }); }
    yield 0.12;
  }
  *applyCard(d, target) {
    const P = this.P, run = this.run;
    const targets = d.all ? this.alive() : (target ? [target] : []);
    const isAtk = d.dmg != null || d.special === 'detonate' || d.special === 'bodyslam';
    if (isAtk) {
      P.pose.atkT = 0; Snd.play('slash'); yield 0.2;
      let hits = d.hits || 1;
      for (let h = 0; h < hits; h++) {
        for (const t of targets.slice()) {
          if (t.dead) continue;
          let base = d.dmg || 0;
          if (d.special === 'bodyslam') base = P.block;
          if (d.special === 'detonate') { base = (t.st.bleed || 0) * d.mult; delete t.st.bleed; }
          if (d.special === 'lowblow' && (t.st.weak || t.st.vuln)) base += d.bonus;
          if (this.firstAtk && run.grafts.includes('whetstone')) { base += 5; }
          yield* this.hit(P, t, this.calc(P, t, base));
          if (P.pose.atkT > 0.55) P.pose.atkT = 0.1;
        }
        this.firstAtk = false;
        if (this.over) return;
        if (hits > 1) yield 0.1;
      }
      yield 0.08;
    } else if (!d.pwr) { P.pose.hop = 0.01; }
    // debuffs
    for (const k of ['bleed', 'weak', 'vuln']) if (d[k]) for (const t of targets) if (!t.dead) { this.addStatus(t, k, d[k]); }
    // self effects
    if (d.blk) {
      const n = d.blk + (P.st.plating || 0); P.block += n; Snd.play('block');
      floatText(P.x, P.y - 230, `+${n} Block`, C.sky, 32); burst(P.x, P.y - 110, 14, { col: [C.metal, C.sky, C.cream], shape: 'star', min: 40, max: 200, grav: -50, life: .5 });
    }
    if (d.str) this.addStatus(P, 'str', d.str);
    if (d.plating) this.addStatus(P, 'plating', d.plating);
    if (d.thorns) this.addStatus(P, 'thorns', d.thorns);
    if (d.heal) { const n = Math.min(d.heal, P.maxhp - P.hp); P.hp += n; Snd.play('heal'); floatText(P.x, P.y - 220, `+${d.heal}`, C.green, 38); burst(P.x, P.y - 110, 14, { col: C.green, shape: 'star', grav: -90 }); }
    if (d.hurt) { P.hp -= d.hurt; P.pose.flash = .2; Snd.play('hit'); floatText(P.x, P.y - 210, d.hurt, C.red, 36); if (P.hp <= 0) { P.hp = 0; this.kill(P); return; } }
    if (d.ap) { this.ap += d.ap; Snd.play('buff'); floatText(80, 520, `+${d.ap} AP`, C.mustard, 34); }
    if (d.money) { run.money += d.money; Snd.play('coin'); floatText(P.x + 40, P.y - 200, `+${d.money} shil`, C.mustard, 30); }
    if (d.draw) yield* this.drawCards(d.draw);
    yield 0.05;
  }
  // ----- finish -----
  *finish() {
    const run = this.run, P = this.P;
    if (this.over === 'win') {
      Snd.play('win'); this.phase = 'over'; hitstop(.1);
      this.hand.forEach(h => this.discard.push(h.inst)); this.discardHandVis(); this.hand = [];
      yield 0.5;
      this.banner_('VICTORY!', C.mustard, 1.6); Snd.play('stamp'); shake(10, .4);
      burst(W / 2, 300, 60, { col: [C.mustard, C.orange, C.cream, C.teal], shape: 'star', min: 100, max: 500, up: 200, life: 1.2, s0: 6, s1: 14 });
      yield 1.8;
      run.hp = P.hp; if (run.grafts.includes('spare_tooth')) run.hp = Math.min(run.maxhp, run.hp + 6);
      let gold = this.enemies.reduce((s, e) => s + e.def.gold, 0) + ri(0, 6);
      if (run.grafts.includes('gold_tooth')) gold = Math.round(gold * 1.25);
      const elite = this.opts.elite, boss = this.opts.boss;
      const reward = { gold, cards: rollCards('b', run, 3, { elite }), kind: 'b', graft: elite || boss ? rollGraft(run) : null, boss: !!boss, node: this.opts.node };
      go(() => { setScene(new RewardScene(reward)); });
    } else {
      Snd.play('lose'); this.phase = 'over';
      this.banner_('DEFEATED', C.red, 2);
      yield 2.2;
      go(() => { setScene(new GameOverScene({ cause: this.enemies.length ? this.enemies[0].def.name : 'the streets' })); });
    }
  }
  // ----- input -----
  enemyAt(x, y) {
    const al = this.alive();
    for (let i = al.length - 1; i >= 0; i--) { const e = al[i]; const s = e.scale; if (x > e.x - 75 * s && x < e.x + 75 * s && y > e.y - 240 * s && y < e.y + 20) return e; }
    return null;
  }
  needsTarget(i) { const h = this.hand[i]; if (!h) return false; return cd(h.inst).tg === 'enemy'; }
  onDown(x, y) {
    if (this.phase !== 'player' || this.busy) return;
    if (this.hover >= 0 && this.hand[this.hover]) {
      const h = this.hand[this.hover]; this.drag = { i: this.hover, sx: x, sy: y, moved: 0 };
      Snd.play('draw');
    } else if (this.sel >= 0) {
      const e = this.enemyAt(x, y);
      if (e) { this.tryPlay(this.sel, e); } else this.sel = -1;
    }
  }
  onUp(x, y) {
    const dr = this.drag; this.drag = null;
    if (!dr) return;
    const i = dr.i; if (!this.hand[i]) return;
    const e = this.enemyAt(x, y), needs = this.needsTarget(i);
    if (dr.moved > 14) {
      if (needs) {
        if (e) this.tryPlay(i, e);
        else if (y < 470 && this.alive().length === 1) this.tryPlay(i, this.alive()[0]);
      } else if (y < 480) this.tryPlay(i, null);
    } else {
      // click
      if (!needs) this.tryPlay(i, null);
      else if (this.alive().length === 1) this.tryPlay(i, this.alive()[0]);
      else { this.sel = this.sel === i ? -1 : i; Snd.play('click'); }
    }
  }
  onKey(k) {
    if (k === 'Escape') { openPause(); return; }
    if (this.phase !== 'player' || this.busy) return;
    if (k === 'e' || k === 'E' || k === 'Enter') this.endTurn();
    else if (/^[1-9]$/.test(k)) {
      const i = +k - 1; if (!this.hand[i]) return;
      if (!this.needsTarget(i)) this.tryPlay(i, null);
      else if (this.alive().length === 1) this.tryPlay(i, this.alive()[0]);
      else { this.sel = this.sel === i ? -1 : i; Snd.play('click'); }
    }
  }
  onRight() { this.sel = -1; this.drag = null; }
  // ----- update -----
  update(dt) {
    this.t += dt;
    const sdt = dt;
    if (G.hitstop <= 0) this.step(dt);
    // units
    const all = [this.P].concat(this.enemies);
    for (const u of all) {
      const p = u.pose;
      if (p.atkT >= 0) { p.atkT += dt; if (p.atkT > 0.6) p.atkT = -1; }
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.5);
      p.dx *= Math.pow(.0005, dt);
      if (p.hop > 0) { p.hop += dt * 1.8; if (p.hop > 1) p.hop = 0; }
      if (u !== this.P) { u.x = lerp(u.x, u.tx, 1 - Math.pow(.0008, dt)); }
      u.dhp = lerp(u.dhp, u.hp, 1 - Math.pow(.02, dt));
      if (u.dead) p.dead = Math.min(1, p.dead + dt * 1.4);
    }
    this.enemies = this.enemies.filter(e => !(e.dead && e.pose.dead >= 1));
    // hand layout
    this.updateHand(dt);
    // fly cards
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const f = this.fly[i]; f.t += dt;
      if (f.t < 0) continue;
      const k = clamp(f.t / f.dur, 0, 1);
      f.cx = lerp(f.x, f.tx, ease.out(k)); f.cy = lerp(f.y, f.ty, ease.out(k)); f.cr = lerp(f.rot, f.trot, k); f.cs = lerp(f.sc, f.tsc, ease.out(k));
      if (!f.hold && k >= 1) {
        if (f.dest === 'discard') { this.pileBump = .3; }
        this.fly.splice(i, 1);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].t += dt; if (this.fx[i].t >= this.fx[i].max) this.fx.splice(i, 1); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.max) this.banner = null; }
    if (this.apShake > 0) this.apShake -= dt;
    if (this.pileBump > 0) this.pileBump -= dt;
  }
  updateHand(dt) {
    const n = this.hand.length;
    const sp = Math.min(150, 820 / Math.max(1, n));
    const cx = W / 2 - 30;
    // hover detection
    let h = -1;
    if (!this.drag && this.phase === 'player' && UI.enabled) {
      const cur = this.hover;
      if (cur >= 0 && this.hand[cur]) { const c = this.hand[cur]; if (Math.abs(In.x - c.rx) < CW * .65 && In.y > c.ry - CH * .65 && In.y < H) h = cur; }
      if (h < 0 && In.y > 530 && In.x > 120 && In.x < 1060) {
        let best = 1e9; this.hand.forEach((c, i) => { const d = Math.abs(In.x - c.rx); if (d < sp / 2 + 14 && d < best) { best = d; h = i; } });
      }
    }
    if (h !== this.hover && h >= 0) Snd.play('hover');
    this.hover = this.drag ? this.drag.i : h;
    this.hand.forEach((c, i) => {
      const off = i - (n - 1) / 2;
      c.rx = cx + off * sp; c.ry = 606 + off * off * 2.2;
      let tx = c.rx, ty = c.ry, tr = off * 0.05, ts = 1;
      if (this.hover >= 0) {
        if (i === this.hover) { ty = 560; tr = 0; ts = 1.3; }
        else { const dd = i - this.hover; tx += (dd > 0 ? 1 : -1) * Math.max(0, 52 - Math.abs(dd) * 14); }
      }
      if (this.drag && this.drag.i === i) {
        this.drag.moved = Math.hypot(In.x - this.drag.sx, In.y - this.drag.sy);
        if (this.drag.moved > 14) { tx = In.x; ty = In.y; tr = 0; ts = 1.05; c.k = 1; }
        else { ty = 560; tr = 0; ts = 1.3; }
      }
      if (i === this.sel) { ty = 520; ts = 1.25; tr = 0; }
      const kk = this.drag && this.drag.i === i && this.drag.moved > 14 ? 1 - Math.pow(1e-6, dt) : 1 - Math.pow(.0004, dt);
      c.x = lerp(c.x, tx, kk); c.y = lerp(c.y, ty, kk); c.rot = lerp(c.rot, tr, kk); c.sc = lerp(c.sc, ts, kk);
    });
  }
  // ----- draw -----
  drawBase(c) {
    drawBackdrop(c, this.bg, this.bgSeed, G.time);
    // ground shadow band
  }
  draw(c) {
    this.drawBase(c);
    const P = this.P;
    UI.enabled = !G.modal;
    const targeting = (this.drag && this.drag.moved > 14 && this.needsTarget(this.drag.i)) || this.sel >= 0;
    const hov = this.enemyAt(In.x, In.y);
    // draw units sorted by y
    const units = [P].concat(this.enemies).sort((a, b) => a.y - b.y);
    for (const u of units) {
      drawUnit(c, u, u === P ? 1 : -1);
      if (u.dead) continue;
      hpBar(c, u, u.x, u.y + 22, u === P ? 150 : 128);
      statusRow(c, u, u.x, u.y + 56);
      if (u !== P) {
        // intent
        const m = u.intent; if (m && this.phase !== 'over') this.drawIntent(c, u, m);
        if (targeting && hov === u) {
          c.save(); c.translate(u.x, u.y - 100 * u.scale); c.strokeStyle = C.red; c.lineWidth = 5; c.setLineDash([14, 10]); c.lineDashOffset = -G.time * 30;
          c.beginPath(); c.ellipse(0, 0, 90 * u.scale, 130 * u.scale, 0, 0, 6.3); c.stroke(); c.restore();
        }
      }
    }
    // slashes
    for (const f of this.fx) this.drawSlash(c, f);
    // piles & AP
    this.drawHUDParts(c);
    // hand + flying cards
    this.drawHand(c);
    for (const f of this.fly) {
      if (f.t < 0) continue;
      const cx = f.cx != null ? f.cx : f.x, cy = f.cy != null ? f.cy : f.y;
      const k = clamp(f.t / f.dur, 0, 1);
      drawCard(c, cd(f.inst), cx, cy, f.cr != null ? f.cr : f.rot, f.cs != null ? f.cs : f.sc, { alpha: f.fade ? 1 - k : 1 });
    }
    // target arrow for selected card
    if (this.sel >= 0 && this.hand[this.sel]) {
      const hc = this.hand[this.sel]; c.save(); c.strokeStyle = C.red; c.lineWidth = 6; c.setLineDash([12, 10]); c.lineDashOffset = -G.time * 40;
      c.beginPath(); c.moveTo(hc.x, hc.y - 120); c.quadraticCurveTo((hc.x + In.x) / 2, Math.min(hc.y, In.y) - 120, In.x, In.y); c.stroke(); c.restore();
      disp(c, 'Choose a target', W / 2, 150, 28, C.cream);
    }
    if (this.drag && this.drag.moved > 14 && !this.needsTarget(this.drag.i)) {
      c.save(); c.globalAlpha = .5 + Math.sin(G.time * 8) * .15; c.strokeStyle = C.mustard; c.lineWidth = 4; c.setLineDash([16, 10]); c.strokeRect(220, 120, 840, 340); c.restore();
      disp(c, In.y < 480 ? 'Release to play' : 'Drag up to play', W / 2, 250, 30, In.y < 480 ? C.mustard : C.cream, { alpha: .8 });
    }
    // end turn button
    const can = this.phase === 'player' && !this.busy;
    if (UI.btn(1075, 548, 175, 50, 'END TURN', { col: can ? '#f27a1a' : C.grey, disabled: !can, size: 28, slant: 1 })) this.endTurn();
    // banner
    if (this.banner) this.drawBanner(c);
    drawHUD(c, this.run, { battle: this, turn: this.turn });
    UI.enabled = true;
  }
  drawIntent(c, u, m) {
    const x = u.x, y = u.y - 262 * u.scale - 12 + Math.sin(G.time * 3 + u.uid * 7) * 4;
    let ic = 'sword', col = C.red, label = '', title = 'Attack', body = '';
    if (m.t === 'atk') { const d = this.calc(u, this.P, m.n); label = m.h > 1 ? `${d}×${m.h}` : `${d}`; body = `Will attack for ${d}${m.h > 1 ? ' ×' + m.h : ''}.` + (m.st ? ` Applies ${m.st[1]} ${STATUS[m.st[0]].name}.` : ''); }
    else if (m.t === 'blk') { ic = 'shield'; col = C.blue; label = `${m.n}`; title = 'Defend'; body = `Will gain ${m.n} Block.`; }
    else if (m.t === 'buf') { ic = 'up'; col = C.green; title = 'Buff'; body = `Will gain ${m.n} ${STATUS[m.st].name}.`; }
    else if (m.t === 'deb') { ic = 'down'; col = C.plum; title = 'Debuff'; body = `Will inflict ${m.n} ${STATUS[m.st].name}.` + (m.dmg ? ` Also attacks for ${this.calc(u, this.P, m.dmg)}.` : ''); if (m.dmg) label = `${this.calc(u, this.P, m.dmg)}`; }
    else if (m.t === 'heal') { ic = 'heart'; col = C.green; label = `${m.n}`; title = 'Heal'; body = `Will restore ${m.n} HP.`; }
    else if (m.t === 'sum') { ic = 'skull'; col = C.plum; title = 'Summon'; body = 'Will call for reinforcements.'; }
    else { ic = 'clock'; title = 'Wait'; }
    intentBubble(c, x, y, ic, label);
    if (Math.abs(In.x - x) < 36 && Math.abs(In.y - y) < 34) tip(title, body);
  }
  drawSlash(c, f) {
    const k = f.t / f.max, a = f.a;
    c.save(); c.translate(f.x, f.y); c.rotate(a + .6);
    const L = (f.big ? 190 : 130), w = (f.big ? 20 : 12) * (1 - k * .6);
    c.globalAlpha = 1 - k * k; c.fillStyle = f.col; c.strokeStyle = C.ink; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-L * (1 - k * .3), 0); c.quadraticCurveTo(0, -w * 2.2, L * k * 1.2 - L * .2, 0); c.quadraticCurveTo(0, w * .6, -L * (1 - k * .3), 0); c.fill(); c.stroke();
    c.restore();
  }
  drawBanner(c) {
    const b = this.banner, k = b.t / b.max;
    const inK = ease.out(clamp(k * 5, 0, 1)), outK = k > .8 ? (k - .8) / .2 : 0;
    c.save(); c.globalAlpha = 1 - outK; c.translate(W / 2, 270 + 0);
    c.rotate(-.04);
    c.fillStyle = b.col; c.strokeStyle = C.ink; c.lineWidth = 6;
    const bw = 620 * inK; inkShape(c, [[-bw / 2, -50], [bw / 2, -56], [bw / 2 + 20, 0], [bw / 2, 56], [-bw / 2, 50], [-bw / 2 - 20, 0]], b.col, { seed: 9, lw: 6, off: 5, sharp: 1 });
    if (inK > .6) disp(c, b.text, 0, 3, 76 * (0.8 + 0.2 * ease.elastic(clamp(k * 4, 0, 1))), C.cream);
    c.restore();
  }
  drawHUDParts(c) {
    // draw pile
    const dp = this.drawPile.length, dc = this.discard.length;
    const pile = (x, y, n, lbl, bump) => {
      const s = 1 + (bump > 0 ? bump * .6 : 0);
      for (let i = 2; i >= 0; i--) { if (n > i) { c.save(); c.translate(x - i * 3, y - i * 3); c.rotate(-.1 + i * .05); c.scale(s, s); inkRect(c, -34, -46, 68, 92, C.teal2, 4 + i, { lw: 4, r: 8, off: 0, shade: false }); inkEll(c, 0, 0, 14, 14, C.mustard, { seed: 3, lw: 3, off: 0, shade: false, n: 8 }); c.restore(); } }
      disp(c, String(n), x, y + 2, 30, C.cream);
      txt(c, lbl, x, y + 62, { size: 15, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
      if (UI.hit(x - 40, y - 50, 80, 100)) { UI.cursor = 'pointer'; if (In.click) { In.click = null; Snd.play('click'); return true; } }
      return false;
    };
    if (pile(62, 660, dp, 'DRAW', 0)) openPileView('Draw Pile (shuffled)', this.drawPile.slice().sort((a, b) => a.id.localeCompare(b.id)));
    if (pile(1218, 660, dc, 'DISCARD', this.pileBump)) openPileView('Discard Pile', this.discard);
    if (this.exhaust.length) {
      txt(c, `Exhausted: ${this.exhaust.length}`, 1218, 540, { size: 15, font: FD, color: C.cream, align: 'center', stroke: C.ink, sw: 4 });
    }
    // AP orb
    const ax = 100, ay = 555, sh = this.apShake > 0 ? Math.sin(this.apShake * 60) * 6 : 0;
    c.save(); c.translate(ax + sh, ay);
    const pulse = 1 + Math.sin(G.time * 4) * .03;
    c.scale(pulse, pulse);
    const og = c.createRadialGradient(-10, -12, 4, 0, 0, 44); og.addColorStop(0, this.ap > 0 ? '#ffb84a' : '#9a949c'); og.addColorStop(1, this.ap > 0 ? '#e8620c' : '#55505a');
    c.beginPath(); c.arc(0, 0, 44, 0, 6.3); c.fillStyle = og; c.fill(); c.lineWidth = 4; c.strokeStyle = C.ink; c.stroke();
    c.beginPath(); c.arc(0, 0, 34, 0, 6.3); c.fillStyle = '#2a1510'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,200,120,.7)'; c.stroke();
    disp(c, `${this.ap}/${this.maxAp}`, 0, 2, 32, '#fff');
    inkRect(c, -20, 30, 40, 22, '#e8620c', 4, { lw: 3, r: 6 }); txt(c, 'AP', 0, 47, { size: 17, font: FD, color: '#fff', align: 'center', stroke: C.ink, sw: 3 });
    c.restore();
    if (UI.hit(ax - 42, ay - 42, 84, 84)) tip('Action Points', 'Cards cost AP to play. Refills each turn.');
  }
  dynCard(inst) {
    const d = cd(inst); if (d.kind !== 'b' || d.text !== battleText(d) || !this.P) return d;
    const P = this.P; const d2 = Object.assign({}, d);
    if (d.dmg != null && d.special !== 'lowblow') { let v = d.dmg + (P.st.str || 0); if (P.st.weak) v *= .75; d2.dmg = Math.max(0, Math.floor(v)); }
    if (d.blk) d2.blk = d.blk + (P.st.plating || 0);
    if (d2.dmg === d.dmg && d2.blk === d.blk) return d;
    d2.text = battleText(d2); return d2;
  }
  drawHand(c) {
    if (this.hintKey && !G.meta.seen[this.hintKey] && this.phase === 'player') {
      c.save(); c.font = `22px ${FB}`; const ls = wrapLines(c, this.hintText, 560); const hh = ls.length * 28 + 24;
      inkRect(c, W / 2 - 300, 100, 600, hh, C.cream, 8, { lw: 4, r: 10, off: 4 }); ls.forEach((l, i) => txt(c, l, W / 2, 130 + i * 28, { size: 22, align: 'center' })); c.restore();
    }
    const order = this.hand.map((_, i) => i).sort((a, b) => (a === this.hover) - (b === this.hover));
    for (const i of order) {
      const h = this.hand[i], d = this.dynCard ? this.dynCard(h.inst) : cd(h.inst);
      if (i === this.hover && !this.drag) { const kt = keywordTip(d); if (kt) tip(kt[0], kt[1]); }
      const un = d.unplayable || d.cost > this.ap;
      const dragging = this.drag && this.drag.i === i && this.drag.moved > 14;
      drawCard(c, d, h.x, h.y, h.rot, h.sc, { unaff: un, glow: (i === this.hover || i === this.sel) && !un ? C.mustard : (i === this.hover || i === this.sel) ? C.red : null, dim: un && this.phase === 'player' && i !== this.hover });
      if (this.phase === 'player' && i < 9 && i !== this.hover) txt(c, String(i + 1), h.x - 55 * h.sc, h.y + 100 * h.sc, { size: 13, font: FD, color: C.cream, stroke: C.ink, sw: 3, align: 'center' });
    }
  }
}

function rollGraft(run) {
  const owned = run.grafts;
  const cands = Object.keys(GRAFTS).filter(g => !owned.includes(g));
  return cands.length ? pick(cands) : null;
}

const KEYWORDS = {
  Bleed: 'Bleed: take damage equal to stacks at turn start, then lose 1 stack.',
  Weak: 'Weak: deals 25% less attack damage.',
  Vulnerable: 'Vulnerable: takes 50% more attack damage.',
  Strength: 'Strength: +1 damage per stack on attacks.',
  Plating: 'Plating: +1 Block per stack when you gain Block from cards.',
  Thorns: 'Thorns: attackers take damage per stack.',
  Block: 'Block: absorbs damage until your next turn.',
  Exhaust: 'Exhaust: removed from this fight once played.',
  Composure: 'Composure: soaks Pressure before your Resolve. Fades each turn.',
  Influence: 'Influence: damages an Argument or their core Resolve.',
  Argument: 'Argument: stays on the table and triggers every turn.',
  Pressure: 'Pressure: attacks your Composure, then Resolve.'
};
function keywordTip(d) {
  const lines = [];
  for (const k in KEYWORDS) if (new RegExp('\b' + k + '\b').test(d.text)) lines.push(KEYWORDS[k]);
  if (!lines.length) return null;
  return ['Keywords', lines.slice(0, 3).join('\n')];
}
