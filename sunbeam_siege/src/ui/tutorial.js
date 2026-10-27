/* Tutorial driver (C4): SB.tutorial. Runs the four scripted fights from SB.data.tutorial behind the real battle screen.
 * Coach marks (Elder Cat bubble plus a spotlight with click-through hole) are driven by SB.ui.battleHooks.
 * Scripted hands and tutorial rules live in the engine (opts.tutorial, enc.rounds[].hand). A lost fight is simply retried.
 * Between fights the Elder Cat talks over a plain card (reward, map, shop and nook notes use the guide texts from the data).
 * API: start({fight, replay}), stop(), allows(input), onBattleNode(bo, enc), onBattleDone(), onMapShown(), onRewardShown(), onPostShown().
 * No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h;
  var T = SB.tutorial = SB.tutorial || {};
  var st = null; // active session

  function D() { return SB.data.tutorial; }
  function fightsList() { return (D() && D().fights) || []; }

  // ------------------------------------------------------------------ run and launch
  function makeRun(f) {
    var run = SB.run.newRun({ seed: 'TUTORIAL', clan: 'alley', side: 'hearth', tutorial: true, noSave: true });
    run.noAutosave = true;
    var need = {};
    // one copy per card the biggest hand needs, not one per round: a Kitten that spends a life in round 1 must be the SAME
    // card (one life left) when the script hands it out again in round 2, not a fresh copy with full lives
    (f.rounds || []).forEach(function (r) { var c = {}; (r.hand || []).forEach(function (id) { c[id] = (c[id] || 0) + 1; }); Object.keys(c).forEach(function (id) { need[id] = Math.max(need[id] || 0, c[id]); }); });
    (f.fillerDraw || []).forEach(function (id) { need[id] = (need[id] || 0) + 2; });
    run.relics = []; // the lessons are scripted around plain cards: a starting relic (extra Attack, bonus damage) would break every number
    run.deck = [];
    Object.keys(need).forEach(function (id) { for (var i = 0; i < need[id]; i++) { try { run.deck.push(SB.cardInst.make(id)); } catch (e) { /* ignore */ } } });
    run.warmth = f.warmth || 40; run.maxWarmth = Math.max(run.warmth, 40);
    run.status = 'battle';
    return run;
  }
  // The scripted numbers (rat 1 HP left after round 2, 'Biscuit has four claws') assume no Pile bonus, which the lessons never teach:
  // adjacent cats on a floor would each gain +1 Attack and fight 1 would end in round 2, skipping its round 3 steps.
  function encFor(f) {
    var e = (SB.content && SB.content.encounter && SB.content.encounter(f.id)) || Object.assign({ type: 'prowl', tutorial: true, name: f.title }, f);
    return Object.assign({}, e, { rules: Object.assign({}, e.rules || f.rules || {}, { noPile: true }) });
  }

  var origGo = null;
  function installGo() {
    if (origGo) return;
    origGo = SB.ui.go;
    SB.ui.go = function (name, params) {
      if (st && st.inFight && (name === 'reward' || name === 'gameover')) { var won = name === 'reward'; setTimeout(function () { fightEnded(won); }, 0); return; }
      return origGo.apply(this, arguments);
    };
  }
  function uninstallGo() { if (origGo) { SB.ui.go = origGo; origGo = null; } }

  function launch(i) {
    var f = fightsList()[i]; if (!f) { finishAll(); return; }
    var F = SB.ui.flow;
    st.idx = i; st.fight = f; st.inFight = true;
    st.done = {}; st.plays = {}; st.queue = []; st.showing = null; st.round = 0; st.playPtr = 0; st.started = false; st.pendingPhase = null;
    var run = makeRun(f); F.run = run; st.run = run;
    SB.ui.topbar.show(false);
    SB.ui.go('battle', { run: run, encounter: encFor(f), node: { id: 'tut' + f.order, type: 'battle' }, type: 'battle', opts: { seed: 'tut-' + f.order, tutorial: true } });
  }

  function markHandbook(i) {
    try {
      var p = K.prof.get(); var hb = (D().skip && D().skip.handbook) || [];
      p.tutorial.handbookSeen = p.tutorial.handbookSeen || [];
      var ids = i === 'all' ? hb : [hb[i]];
      ids.forEach(function (id) { if (id && p.tutorial.handbookSeen.indexOf(id) < 0) p.tutorial.handbookSeen.push(id); });
      K.prof.save();
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ overlay
  function layer() {
    if (st.layer) return st.layer;
    var l = h('div.tut-layer');
    st.blocks = [0, 1, 2, 3].map(function () { return h('div.tut-block'); });
    st.hole = h('div.tut-hole');
    st.full = h('div.tut-full');
    st.cat = h('div.tut-cat');
    st.title = h('div.tut-who', 'The Elder Cat');
    st.text = h('p.tut-text', { 'aria-live': 'polite' });
    st.nextBtn = h('button.btn.small.tut-next', { type: 'button' }, 'Next');
    st.skipBtn = h('button.tut-skip', { type: 'button' }, 'Skip lesson');
    st.hint = h('div.tut-hint');
    st.panel = h('div.tut-panel', st.cat, h('div.tut-body', st.title, st.text, h('div.tut-row', st.hint, st.skipBtn, st.nextBtn)));
    st.blocks.forEach(function (b) { l.appendChild(b); });
    l.appendChild(st.full); l.appendChild(st.hole); l.appendChild(st.panel);
    st.nextBtn.addEventListener('click', function () { K.click(); completeStep(); });
    st.skipBtn.addEventListener('click', function () { skipLesson(); });
    document.body.appendChild(l); st.layer = l;
    var tick = function () { if (!st || !st.layer) return; pollNap(); placeHole(); st.raf = requestAnimationFrame(tick); };
    st.raf = requestAnimationFrame(tick);
    l.addEventListener('pointerdown', function (e) { if (e.target === st.hole) return; }, true);
    document.addEventListener('pointerdown', passOn, true);
    document.addEventListener('pointerup', passOff, true);
    document.addEventListener('pointercancel', passOff, true);
    return l;
  }
  function passOn(e) { if (st && st.layer && st.holeActive && e.target && e.target.closest && !e.target.closest('.tut-panel')) st.layer.classList.add('pass'); }
  function passOff() { if (st && st.layer) st.layer.classList.remove('pass'); }
  function killLayer() {
    if (!st || !st.layer) return;
    cancelAnimationFrame(st.raf);
    document.removeEventListener('pointerdown', passOn, true); document.removeEventListener('pointerup', passOff, true); document.removeEventListener('pointercancel', passOff, true);
    if (st.typer) st.typer.stop();
    st.layer.remove(); st.layer = null; st.showing = null;
  }

  // ------------------------------------------------------------------ target resolving
  function battleB() { return SB.ui.battle && SB.ui.battle.B; }
  // cats placed by the player get the ref the script names (T1, L1, K1...) so coach marks can point at them
  function tagRefs(S) {
    if (!st || !st.fight) return;
    (st.fight.rounds || []).forEach(function (r) {
      (r.plays || []).forEach(function (p) {
        if (p.kind !== 'place' || !p.ref || !st.plays[p.id]) return;
        var have = false;
        (S.floors || []).forEach(function (fl) { (fl.cats || []).forEach(function (u) { if (u.ref === p.ref) have = true; }); });
        if (have) return;
        var fl = S.floors[(p.floor || 1) - 1], cand = fl && (fl.cats || []).filter(function (u) { return u.id === p.card && !u.ref; });
        if (cand && cand.length) cand[cand.length - 1].ref = p.ref;
      });
    });
  }
  function unitByRef(ref) {
    var B = battleB(); if (!B) return null; var S = B.state, found = null;
    tagRefs(S);
    (S.floors || []).forEach(function (fl) { (fl.cats || []).concat(fl.pests || []).forEach(function (u) { if (u && u.ref === ref) found = u; }); });
    (S.garden || []).forEach(function (u) { if (u && u.ref === ref) found = u; });
    return found;
  }
  function el(sel) { return document.querySelector(sel); }
  function resolve(key) {
    if (!key) return null;
    var m;
    if (key === 'sunbeam' || key === 'warmth') return el('[data-tut="warmth"]') || el('.b-sun');
    if (key === 'floors') return el('.b-stage') || el('.b-wrap');
    if ((m = /^floor:(\d)$/.exec(key))) return el('[data-tut="floor-' + (Number(m[1]) - 1) + '"]');
    if (key === 'hand') return el('[data-tut="hand"]');
    if (key === 'zoomies') return el('[data-tut="zoomies"]');
    if (key === 'endTurn') return el('[data-tut="endturn"]') || el('.b-end');
    if (key === 'nightClock') return el('.b-clock');
    if (key === 'gardenQueue') return el('.b-garden') || el('.g-pest') && el('.g-pest').parentNode;
    if (key === 'drawPile') return el('.b-pile.draw') || el('.b-draw');
    if (key === 'discardPile') return el('.b-pile.discard') || el('.b-discard');
    if ((m = /^card:(.+)$/.exec(key))) {
      var B = battleB(); if (!B) return null; var S = B.state, uid = null;
      (S.hand || []).forEach(function (e) { var c = S.cards && S.cards[e.uid]; if (!uid && c && c.id === m[1]) uid = e.uid; });
      return uid != null ? el('.b-hand [data-uid="' + uid + '"]') : null;
    }
    if ((m = /^(cat|pest|intent|lives|rested|napToggle):([^:]+)$/.exec(key))) {
      var u = unitByRef(m[2]); if (!u) return null;
      if (m[1] === 'napToggle') return el('.u[data-uid="' + u.uid + '"] .u-nap') || el('.u-hit[data-uid="' + u.uid + '"]');
      return el('.u-hit[data-uid="' + u.uid + '"]') || el('.u[data-uid="' + u.uid + '"]');
    }
    if ((m = /^status:([^:]+):/.exec(key))) { var u2 = unitByRef(m[1]); return u2 ? el('.u-hit[data-uid="' + u2.uid + '"]') : null; }
    if (key === 'topbarNight') return el('.topbar .tb-night') || el('.topbar');
    return null;
  }

  function rectOf(node) {
    if (!node || !node.getBoundingClientRect) return null;
    var r = node.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function placeHole() {
    var s = st && st.showing; if (!s) return;
    var vw = window.innerWidth, vh = window.innerHeight, pad = 6;
    if (!s.dim) { st.layer.className = 'tut-layer nodim'; st.holeActive = false; positionPanel(null); return; }
    var node = s.node = resolve(s.targetKey || s.step.target), r = rectOf(node);
    st.holeActive = !!r;
    var gated = s.awaiting;
    st.layer.className = 'tut-layer' + (r ? ' has-hole' : ' no-hole') + (gated ? ' gated' : '') + (st.layer.classList.contains('pass') ? ' pass' : '');
    if (!r) { st.blocks.forEach(function (b) { b.style.cssText = 'display:none'; }); st.hole.style.display = 'none'; st.full.style.display = gated ? 'none' : ''; positionPanel(null); return; }
    st.full.style.display = 'none'; st.hole.style.display = '';
    var x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad), w = Math.min(vw - x, r.w + pad * 2), hh = Math.min(vh - y, r.h + pad * 2);
    st.hole.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + hh + 'px';
    var bl = [[0, 0, vw, y], [0, y + hh, vw, vh - y - hh], [0, y, x, hh], [x + w, y, vw - x - w, hh]];
    st.blocks.forEach(function (b, i) { b.style.cssText = 'display:block;left:' + bl[i][0] + 'px;top:' + bl[i][1] + 'px;width:' + Math.max(0, bl[i][2]) + 'px;height:' + Math.max(0, bl[i][3]) + 'px'; });
    positionPanel(r);
  }
  function positionPanel(r) {
    var vh = window.innerHeight, mid = r ? r.y + r.h / 2 : vh;
    st.panel.classList.toggle('top', !!r && mid > vh * 0.5);
    st.panel.classList.toggle('bottom', !r || mid <= vh * 0.5);
  }

  // ------------------------------------------------------------------ steps
  function matches(w, ev) {
    if (!w || w.on !== ev.on) return false;
    if (ev.on === 'roundStart') return w.round === ev.round;
    if (ev.on === 'afterStep') return w.step === ev.step;
    if (ev.on === 'afterPlay') return w.play === ev.play;
    if (ev.on === 'phaseEnd') return w.phase === ev.phase && (w.round === undefined || w.round === ev.round);
    return true;
  }
  function emit(ev) {
    if (!st || !st.fight) return;
    var queued = {};
    st.queue.forEach(function (s) { queued[s.id] = 1; });
    (st.fight.steps || []).forEach(function (s) {
      if (st.done[s.id] || queued[s.id] || (st.showing && st.showing.step.id === s.id)) return;
      if (matches(s.when, ev)) st.queue.push(s);
    });
    pump();
  }
  function pump() {
    if (!st || st.showing || !st.queue.length || !st.fight) return;
    var s = st.queue.shift();
    var B = battleB();
    // never open a step while an animation is mid-flight if the battle is still playing
    show(s);
  }
  function show(s) {
    layer();
    var awaiting = s.advance && typeof s.advance === 'object' && s.advance.await;
    st.showing = { step: s, dim: s.dim !== false, awaiting: awaiting ? s.advance.await : null, targetKey: s.target };
    var pl = awaiting ? findPlay(s.advance.await) : null;
    if (pl && pl.kind === 'toggleNap') st.showing.targetKey = 'napToggle:' + pl.unit;
    if (pl && (pl.kind === 'place' || pl.kind === 'spell')) { st.showing.targetKey = 'card:' + pl.card; st.showing.dest = pl.kind === 'place' ? 'floor:' + pl.floor : (pl.target ? 'pest:' + pl.target : null); }
    st.layer.style.display = '';
    K.clear(st.cat); st.cat.appendChild(K.elderCat(3));
    st.nextBtn.style.display = awaiting ? 'none' : '';
    st.hint.textContent = awaiting ? 'Your move.' : '';
    if (st.typer) st.typer.stop();
    st.text.textContent = '';
    st.typer = K.typewriter(st.text, s.text || '', { cps: 80 });
    st.panel.onclick = function (e) { if (e.target.closest('button')) return; if (st.typer) st.typer.skip(); };
    placeHole();
    try { st.nextBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function completeStep() {
    if (!st || !st.showing) return;
    var s = st.showing.step; st.done[s.id] = true; st.showing = null;
    if (st.typer) st.typer.stop();
    if (st.layer) st.layer.style.display = 'none';
    var ev = { on: 'afterStep', step: s.id };
    if (s.id === (st.fight.steps[st.fight.steps.length - 1] || {}).id && st.won) { /* last step, nothing more to chain */ }
    emit(ev);
    if (!st.showing && st.layer) st.layer.style.display = 'none';
  }
  function pollNap() {
    var sh = st && st.showing; if (!sh || !sh.awaiting || !st.inFight) return;
    var p = findPlay(sh.awaiting); if (!p || p.kind !== 'toggleNap') return;
    var u = unitByRef(p.unit); if (!u) return;
    if (!!u.napping === (p.to === 'napping') && !st.plays[p.id]) { st.playPtr++; playDone(p); }
  }
  function playDone(p) {
    if (!p || st.plays[p.id]) return;
    st.plays[p.id] = true;
    // the awaiting step finishes by itself
    if (st.showing && st.showing.awaiting === p.id) { completeStep(); }
    else if (st.showing && st.showing.awaiting) { /* a different play happened; keep waiting */ }
    emit({ on: 'afterPlay', play: p.id });
  }
  function findPlay(id) {
    var found = null;
    (st.fight.rounds || []).forEach(function (r) { (r.plays || []).forEach(function (p) { if (p.id === id) found = p; }); });
    return found;
  }
  function roundPlays() {
    var r = (st.fight.rounds || []).filter(function (x) { return x.n === st.round; })[0];
    return r && r.plays || [];
  }

  // ------------------------------------------------------------------ battle hooks
  var hooksSet = false;
  function setHooks() {
    var H = SB.ui.battleHooks = SB.ui.battleHooks || {};
    H.ready = function () {
      if (!st || !st.inFight) return;
      var B = battleB(); st.round = B && B.state ? B.state.round : st.round + 1; st.playPtr = 0;
      if (!st.started) { st.started = true; emit({ on: 'fightStart' }); }
      emit({ on: 'roundStart', round: st.round });
    };
    H.select = function (a) {
      if (!st || !st.showing || !st.showing.awaiting) return;
      // after picking the card, point at where it goes
      if (st.showing.dest) st.showing.targetKey = st.showing.dest;
    };
    // scripted slot: 'place ... pos: front' means the front of the floor (index 0), anything else keeps the engine default (the back)
    H.target = function (uid, target) {
      if (!st || !st.inFight || !target || target.floor === undefined) return null;
      var p = roundPlays()[st.playPtr], B = battleB();
      if (!p || p.kind !== 'place' || p.pos !== 'front' || !B) return null;
      var rec = B.state.cards && B.state.cards[uid];
      if (!rec || rec.id !== p.card || target.floor !== (p.floor || 1) - 1) return null;
      return { floor: target.floor, pos: 0 };
    };
    H.played = function () {
      if (!st || !st.inFight) return;
      var plays = roundPlays(), p = plays[st.playPtr];
      if (p && (p.kind === 'place' || p.kind === 'spell')) { st.playPtr++; playDone(p); }
    };
    H.endTurn = function () {
      if (!st || !st.inFight) return;
      var plays = roundPlays(), p = plays[st.playPtr];
      st.afterEnd = true;
      if (p && p.kind === 'endTurn') { st.playPtr++; playDone(p); }
    };
    H.playbackDone = function () {
      if (!st || !st.inFight) return;
      var B = battleB(), S = B && B.state;
      if (st.afterEnd) {
        st.afterEnd = false;
        // the whole round played out in one go, so every phase of it has ended by now (in engine order)
        ['cat_attacks', 'pest_attacks', 'spawn', 'dusk'].forEach(function (ph) { emit({ on: 'phaseEnd', phase: ph, round: st.round }); });
      }
      if (S && S.turn === 'player' && S.round !== st.round && st.started) { st.round = S.round; st.playPtr = 0; emit({ on: 'roundStart', round: S.round }); }
    };
    H.ended = function (res) {
      if (!st || !st.inFight) return;
      if (res && res.outcome === 'win') { st.won = true; emit({ on: 'phaseEnd', phase: 'cat_attacks', round: st.round }); // a win by a Stretch or a Swat skips the strike phase, but its note still belongs here
        if (st.showing && st.showing.awaiting) { st.done[st.showing.step.id] = true; st.showing = null; if (st.layer) st.layer.style.display = 'none'; } // keep the teaching steps already queued (the cat strike that won it still deserves its note); only drop steps that wait for a move the player can no longer make
        st.queue = st.queue.filter(function (q) { return !(q.advance && typeof q.advance === 'object' && q.advance.await); }); emit({ on: 'fightWon' }); }
    };
    hooksSet = true;
  }
  function clearHooks() {
    var H = SB.ui.battleHooks; if (!H || !hooksSet) return;
    ['ready', 'select', 'target', 'played', 'endTurn', 'playbackDone', 'ended'].forEach(function (k) { delete H[k]; });
    hooksSet = false;
  }

  // ------------------------------------------------------------------ flow between fights
  function say(lines, then, o) {
    o = o || {};
    var i = 0, d;
    var cat = h('div.tut-int-cat', K.elderCat(4));
    var txt = h('p.tut-int-text');
    var next = K.btn(o.btn || 'Next', { onClick: function () { go(); } });
    var body = h('div.tut-int', cat, txt);
    function go() { if (i >= lines.length) { d.close(); then(); return; } txt.textContent = lines[i++]; next.textContent = i >= lines.length ? (o.last || 'Carry on') : 'Next'; }
    d = K.dialog({ title: o.title || 'The Elder Cat', body: body, footer: [next], noClose: true, noBackdropClose: true });
    go();
  }
  function fightEnded(won) {
    if (!st) return;
    st.inFight = false; killLayer(); clearHooks();
    var i = st.idx, f = st.fight;
    if (!won) {
      st.rewinds = (st.rewinds || 0) + 1;
      K.toast((D().safeFail && D().safeFail.lines.rewind) || 'Let us take that again.', '');
      st.inFight = true; setTimeout(function () { launch(i); setHooks(); }, 250); return;
    }
    markHandbook(i);
    if (st.mode === 'single') { done('replay'); return; }
    var next = i + 1;
    if (next >= fightsList().length) { finishAll(); return; }
    var lines = [];
    if (i === 0) lines = ['Sixty Fish, found behind the radiator. Keep them. In a real run you would walk the map now, and the map has a good deal more to say than I will tonight.'];
    else if (i === 1) {
      var mg = D().mapGuide2 && D().mapGuide2.steps || [], sg = D().shopGuide && D().shopGuide.steps || [], ng = D().nookGuide && D().nookGuide.steps || [];
      lines = [mg[1] && mg[1].text, sg[0] && sg[0].text, ng[0] && ng[0].text].filter(Boolean);
    } else lines = ['One more, and then you are on your own. I will try not to look proud.'];
    say(lines, function () { launch(next); setHooks(); });
  }
  function finishAll() {
    markHandbook('all');
    try { var p = K.prof.get(); p.tutorial.firstFightDone = true; K.prof.save(); } catch (e) { /* ignore */ }
    say(['That is the lot. Floors and cards, Knock, Nap, the Witching Hour and Nine Lives. The rest of the house is yours.', 'The Sunbeam holds. Go and choose a clan.'], function () { done('all'); }, { last: 'To the cradle' });
  }
  function done(kind) {
    var F = SB.ui.flow;
    stopInternal();
    if (kind === 'all') F.go('newrun', {}); else F.toTitle();
  }
  function skipLesson() {
    if (!st) return;
    K.confirm({ title: 'Skip this lesson?', text: ((D().safeFail && D().safeFail.lines.skipOffer) || 'We can skip this one.'), yes: 'Skip it', no: 'Stay' }).then(function (ok) {
      if (!ok || !st) return;
      killLayer(); var B = battleB(); st.inFight = false; clearHooks();
      markHandbook(st.idx);
      if (st.mode === 'single') { done('replay'); return; }
      if (st.idx + 1 >= fightsList().length) { finishAll(); return; }
      launch(st.idx + 1); setHooks();
    });
  }

  // ------------------------------------------------------------------ public
  function stopInternal() {
    if (st) {
      st.inFight = false; killLayer();
      try { if (st.settingsTouched) SB.ui.settings.set('confirmEndTurn', st.prevConfirm); } catch (e) { /* ignore */ }
    }
    clearHooks(); uninstallGo(); st = null;
  }
  T.stop = function () { stopInternal(); };
  T.active = function () { return !!st; };
  T.allows = function () { return true; };
  T._st = function () { return st; };
  T.start = function (o) {
    o = o || {};
    if (!D() || !fightsList().length) { K.toast('The lessons are not available.', 'bad'); return; }
    stopInternal();
    st = { mode: o.fight ? 'single' : 'guided' };
    var idx = 0;
    if (o.fight) { var n = typeof o.fight === 'number' ? o.fight : null; fightsList().forEach(function (f, i) { if (f.id === o.fight || f.order === n) idx = i; }); }
    installGo(); setHooks();
    try { var S2 = SB.ui.settings; if (S2 && S2.get && S2.set) { st.prevConfirm = S2.get('confirmEndTurn'); S2.set('confirmEndTurn', false); st.settingsTouched = true; } } catch (e) { /* ignore */ }
    try { K.closeAllDialogs(); } catch (e) { /* ignore */ }
    launch(idx);
  };
  // hooks other screens call; the tutorial is fight-driven so these only keep a normal battle node working
  T.onBattleNode = function (bo) { SB.ui.go('battle', bo); };
  T.onBattleDone = function () { };
  T.onMapShown = function () { };
  T.onRewardShown = function () { };
  T.onPostShown = function () { };
})();
