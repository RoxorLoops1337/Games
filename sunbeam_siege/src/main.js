/* SUNBEAM SIEGE main (C4): boot, screen flow, save resume, error boundary.
 * The router itself (SB.ui.go / SB.ui.screens) lives in ui-core.js (C3). This file owns what happens between screens
 * (SB.ui.flow) and the app shell. Classic script. No em dashes. */
(function () {
  'use strict';
  window.SB = window.SB || {}; SB.ui = SB.ui || {};
  var K = SB.ui.kit, h = K && K.h;
  var Main = SB.main = SB.main || {};
  var F = SB.ui.flow = SB.ui.flow || {};
  F.run = null;

  var IN_RUN_SCREENS = { map: 1, reward: 1, shop: 1, event: 1, post: 1, nook: 1, treasure: 1 };
  var MUSIC = { title: 'title', settings: 'title', collection: 'title', newrun: 'title', story: 'title', map: 'map', reward: 'map', shop: 'shop', event: 'map', post: 'map', nook: 'map', treasure: 'map', summary: 'title', gameover: 'defeat' };

  function g(fn, dflt) { try { return fn(); } catch (e) { if (window.console) console.warn('[flow]', e); return dflt; } }
  function hasRun() { return !!(SB.run && SB.run.newRun); }

  // ------------------------------------------------------------------ error boundary
  Main.fatal = function (err, where) {
    try {
      var msg = (err && (err.stack || err.message)) || String(err);
      if (window.console) console.error('[fatal]', where || '', err);
      if (document.querySelector('.fatal')) return;
      var box = h('div.fatal', { role: 'alertdialog', 'aria-label': 'Something went wrong' },
        h('div.panel.pad', h('h2.screen-title', { style: 'font-size:22px;color:var(--danger)' }, 'The cat knocked something over'),
          h('p.dim', { style: 'margin:8px 0' }, 'Something went wrong' + (where ? ' in ' + where : '') + '. Your run is saved at the last safe moment.'),
          h('pre', String(msg).slice(0, 1200)),
          h('div.row.gap-s.wrap',
            h('button.btn', { type: 'button', on: { click: function () { box.remove(); Main.toTitle(); } } }, 'Back to title'),
            h('button.btn.alt', { type: 'button', on: { click: function () { box.remove(); } } }, 'Keep going'),
            h('button.btn.alt', { type: 'button', on: { click: function () { location.reload(); } } }, 'Reload'))));
      (document.getElementById('overlay-root') || document.body).appendChild(box);
    } catch (e2) { alert('Fatal error: ' + (err && err.message)); }
  };
  Main.toTitle = function () { F.toTitle(); };
  window.addEventListener('error', function (e) { if (e && e.target && e.target.tagName) return; if (Main._ready && !e.defaultPrevented && e.error && !(e.error.__handled)) { Main.errors = (Main.errors || []); Main.errors.push(e.message); } });

  // ------------------------------------------------------------------ boot
  Main.boot = function (info) {
    info = info || {};
    try {
      document.body.classList.remove('booting');
      if (SB.ui.settings && SB.ui.settings.all) { /* ui-core applied its classes already */ }
      g(function () { SB.audio && SB.audio.init && SB.audio.init({ seed: 1337 }); });
      var prof = K.prof.get();
      if (SB.profile && SB.profile.syncUnlocks) g(function () { SB.profile.syncUnlocks(prof); });
      SB.ui.topbar.mount();
      // wire screen changes: top bar visibility, music
      SB.ui.onGo(function (name, params) {
        K.hideTip && K.hideTip();
        K.closeAllDialogs();
        var showBar = !!(F.run && (IN_RUN_SCREENS[name] || (name === 'battle' && params && params.topbar)));
        if (F.run && F.run.tutorial && name === 'battle') showBar = false;
        SB.ui.topbar.show(showBar);
        var m = MUSIC[name]; if (m) K.music(m);
        document.body.setAttribute('data-screen', name);
      });
      // keyboard: D opens deck, M map, outside battle
      document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var tag = (e.target && e.target.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || K.hasDialog()) return;
        var cur = SB.ui.current && SB.ui.current.name;
        if (!F.run || !IN_RUN_SCREENS[cur]) return;
        if (e.key === 'd' || e.key === 'D') { SB.ui.openDeck(F.run); e.preventDefault(); }
        else if (e.key === 'm' || e.key === 'M') { SB.ui.openMap(F.run); e.preventDefault(); }
      });
      Main._ready = true;
      var q = new URLSearchParams(location.search);
      var scr = q.get('screen');
      if (q.get('autorun') && Main.devRun) { Main.devRun(q); return; }
      if (scr && SB.ui.screens[scr]) { SB.ui.go(scr, {}); return; }
      F.toTitle();
      // corrupt profile: tell the player kindly
      if (K.prof.status() === 'corrupt') setTimeout(corruptDialog, 400);
      else if (info.missing && info.missing.length && q.get('debug')) K.toast('Missing: ' + info.missing.join(', '), 'bad');
    } catch (err) { Main.fatal(err, 'boot'); }
  };
  function corruptDialog() {
    var bak = null; g(function () { bak = localStorage.getItem('sb_profile_v1_bak'); });
    var foot = [];
    var d;
    if (bak) foot.push(h('button.btn', { type: 'button', on: { click: function () {
      var ok = g(function () { localStorage.setItem('sb_profile_v1', bak); return true; });
      d.close(); K.prof.reload(); K.toast(ok ? 'Backup restored.' : 'Could not restore the backup.', ok ? 'good' : 'bad'); F.toTitle();
    } } }, 'Restore backup'));
    foot.push(h('button.btn.alt', { type: 'button', on: { click: function () { d.close(); } } }, 'Start fresh'));
    d = K.dialog({ title: 'The cat knocked this one off the shelf', body: h('p', { style: 'line-height:1.4' }, 'Your saved profile could not be read. ' + (bak ? 'There is a backup copy from the save before this one.' : 'There is no backup, so a fresh profile will be used.')), footer: foot, noClose: true });
  }

  // ------------------------------------------------------------------ flow: title, new run, resume
  F.go = function (name, params) {
    if (!SB.ui.screens[name]) { K.toast('That screen is not built yet: ' + name, 'bad'); return null; }
    return SB.ui.go(name, params);
  };
  F.toTitle = function () {
    F.run = null; if (SB.tutorial && SB.tutorial.stop) g(function () { SB.tutorial.stop(); });
    SB.ui.topbar.show(false);
    return F.go('title', {});
  };
  F.savedRun = function () {
    if (!SB.run || !SB.run.load) return null;
    var r = g(function () { return SB.run.load(); }, null);
    return r && r.status !== 'over' ? r : null;
  };
  F.save = function () { if (F.run && !F.run.tutorial && !F.run.noAutosave && SB.run && SB.run.save) g(function () { SB.run.save(F.run); }); };
  F.clearSave = function () { g(function () { if (SB.run && SB.run.clearSave) SB.run.clearSave(); else if (SB.run && SB.run.clear) SB.run.clear(); else localStorage.removeItem('nl_run_v1'); }); };

  // opts from the newrun screen: {seed, clan, side, championId, gift, rank, heirloom, daily, seedSource}
  F.startRun = function (opts) {
    if (!hasRun()) { K.toast('The run engine is not loaded yet.', 'bad'); return null; }
    var run;
    try { run = SB.run.newRun(opts); } catch (e) { Main.fatal(e, 'SB.run.newRun'); return null; }
    F.run = run; run.startedAt = run.startedAt || Date.now();
    g(function () { var p = K.prof.get(); p.loadoutLast = { main: opts.clan, side: opts.side, championId: opts.championId, giftId: opts.gift || null, rank: opts.rank || 0 }; p.mischief.selected = opts.rank || 0; K.prof.save(); });
    F.save();
    var seen = g(function () { var hb = K.prof.get().tutorial.handbookSeen || []; return hb.indexOf('story_opening') >= 0; }, true);
    if (!seen && !run.tutorial && SB.ui.screens.story && !(opts && opts.skipOpening)) F.go('story', { mode: 'opening', next: function () { F.actIntro(run.act || 1); } });
    else F.actIntro(run.act || 1);
    return run;
  };
  F.resume = function () {
    var run = F.savedRun(); if (!run) { K.toast('No saved run found.', 'bad'); return; }
    F.run = run;
    F.routePending(run);
  };
  // after a load: go to wherever the run was (run.status is the engine's source of truth)
  F.routePending = function (run) {
    var st = run.status, cur = run.current || {}, node = run.map && run.map.nodes && run.map.nodes[cur.nodeId || run.pos];
    var base = { run: run, node: node, resumed: true };
    if (st === 'reward' && run.pending) { F.go('reward', Object.assign(base, { payload: run.pending.payload })); return; }
    if (st === 'battle' && cur.encounter) {
      var o = { run: run, node: node, encounter: cur.encounter, type: cur.kind === 'prowl' ? 'battle' : cur.kind, opts: { seed: SB.run.battleSeed ? SB.run.battleSeed(run, cur.nodeId) : undefined }, resumed: true };
      if (run.battle && run.battle.enc && cur.encounter && run.battle.enc.id === cur.encounter.id && SB.battle && SB.battle.restore) o.restore = run.battle;
      F.go('battle', o); return;
    }
    if (st === 'shop' && cur.shop) { F.go('shop', Object.assign(base, { payload: g(function () { return SB.shop.view(run); }) })); return; }
    if (st === 'event') { F.go('event', base); return; }
    if (st === 'post' && cur.post) { F.go('post', base); return; }
    if (st === 'nook' && cur.nook) { F.go('nook', Object.assign(base, { payload: g(function () { return { options: SB.nook.options(run), growthSpurt: SB.post.evolvable(run).filter(function (e) { return e.kind === 'growthSpurt'; }), healPct: SB.nook.curlUpPct(run) }; }) })); return; }
    if (st === 'treasure' && cur.relic !== undefined) { F.go('treasure', base); return; }
    if (st !== 'map' && st !== 'over') { g(function () { if (SB.run.leaveNode) SB.run.leaveNode(run); }); }
    F.toMap();
  };
  F.actIntro = function (act) {
    var run = F.run, st = SB.data.story;
    var card = st && st.interstitial ? g(function () { return st.interstitial(act, 'intro'); }, null) : null;
    if (card && SB.ui.screens.story) F.go('story', { mode: 'interstitial', card: card, act: act, next: function () { F.toMap(); } });
    else F.toMap();
  };
  F.toMap = function () {
    var run = F.run; if (!run) return F.toTitle();
    F.save();
    return F.go('map', { run: run });
  };

  // ------------------------------------------------------------------ flow: nodes
  F.chooseNode = function (nodeId) {
    var run = F.run; if (!run) return;
    var node = run.map && run.map.nodes && run.map.nodes[nodeId];
    var entry;
    try { entry = SB.run.enterNode(run, nodeId); } catch (e) { Main.fatal(e, 'SB.run.enterNode'); return; }
    if (!entry) { K.toast('Cannot go there.', 'bad'); return; }
    var type = entry.type, payload = entry.payload || {};
    var open = function () { F.openNode(type, payload, node, entry); };
    if (node && node.type === 'mystery' && type !== 'mystery') {
      if (SB.ui.mysteryReveal) SB.ui.mysteryReveal(type, open, node); else open();
    } else open();
  };
  F.openNode = function (type, payload, node, entry) {
    var run = F.run;
    var base = { run: run, node: node, payload: payload, entry: entry };
    if (type === 'battle' || type === 'elite' || type === 'boss' || type === 'night') {
      var enc = payload && payload.encounter;
      var bo = Object.assign({}, base, { type: type, encounter: enc, opts: { seed: payload.seed } });
      if (run.tutorial && SB.tutorial && SB.tutorial.onBattleNode) { SB.tutorial.onBattleNode(bo, enc); return; }
      F.go('battle', bo);
    } else if (type === 'shop') F.go('shop', base);
    else if (type === 'event') F.go('event', base);
    else if (type === 'post') F.go('post', base);
    else if (type === 'nook') F.go('nook', base);
    else if (type === 'treasure') F.go('treasure', base);
    else { K.toast('Unknown node type: ' + type, 'bad'); F.toMap(); }
  };
  // Called by node screens (shop, event, post, nook, treasure) when finished.
  F.afterNode = function (info) {
    var run = F.run; if (!run) return F.toTitle();
    if (info && info.fight) return F.openFight(info.fight);
    g(function () { if (['shop', 'event', 'post', 'nook', 'treasure'].indexOf(run.status) >= 0) SB.run.leaveNode(run); });
    F.toMap();
  };
  // an event can end in a fight: info is what SB.run.startEventFight returned {type, payload:{encounter,...}}
  F.openFight = function (fight) {
    var run = F.run, pl = fight.payload || fight;
    F.go('battle', { run: run, node: pl.node || null, type: fight.type || 'battle', encounter: pl.encounter, eventFight: true, opts: {} });
  };
  // The battle screen routes itself to 'reward' or 'gameover' with {run, result, ...}. The reward screen calls
  // SB.run.finishBattle. This helper exists for the tutorial driver and tests.
  F.battleDone = function (result) {
    var run = F.run; if (!run) return F.toTitle();
    if (!result) return F.toMap();
    if (result.outcome !== 'win') return F.go('gameover', { run: run, result: result, outcome: 'lose' });
    F.go('reward', { run: run, result: result });
  };
  // Leave the reward screen. Uses SB.run.proceed: {next:'map'} | {next:'act', act, lines, fridgeLoss} | {next:'victory', summary}
  F.rewardDone = function () {
    var run = F.run; if (!run) return F.toTitle();
    var r;
    try { r = SB.run.proceed(run); } catch (e) { Main.fatal(e, 'SB.run.proceed'); return; }
    if (r.next === 'victory') return F.endRun('won', { summary: r.summary });
    if (r.next === 'act') {
      F.save();
      var prev = r.act - 1;
      var outro = SB.data.story && SB.data.story.interstitial ? g(function () { return SB.data.story.interstitial(prev, 'outro'); }, null) : null;
      var next = function () { F.actIntro(r.act); };
      var go2 = function () { if (outro && SB.ui.screens.story) F.go('story', { mode: 'interstitial', card: outro, act: prev, outro: true, lines: r.lines, next: next }); else next(); };
      go2();
      return;
    }
    F.toMap();
  };

  // ------------------------------------------------------------------ flow: end of run
  F.retire = function () { F.endRun('retired', { killedBy: 'Went for a nap' }); };
  // profile XP, achievements, unlocks (skipped for tutorial runs). Safe to call once per run.
  F.recordRun = function (run, summary) {
    if (run.tutorial || run.__recorded) return run.__report || null;
    run.__recorded = true;
    var prof = K.prof.get();
    var report = g(function () { return SB.profile && SB.profile.recordRun ? SB.profile.recordRun(summary.metaRun || summary, Date.now()) : SB.data.meta.recordRun(prof, summary.metaRun || summary, Date.now()); }, null);
    K.prof.save();
    run.__report = report;
    return report;
  };
  F.endRun = function (outcome, extra) {
    var run = F.run; if (!run) return F.toTitle();
    extra = extra || {};
    var summary = extra.summary || g(function () { return outcome === 'retired' && SB.run.retire && run.status !== 'over' ? SB.run.retire(run) : SB.run.summary(run, outcome); }, null) || {};
    run.status = 'over'; run.outcome = outcome;
    if (!summary.outcome) summary.outcome = outcome;
    var report = F.recordRun(run, summary);
    F.clearSave();
    var params = { run: run, summary: summary, report: report, outcome: outcome };
    SB.ui.topbar.show(false);
    if (outcome === 'won') {
      if (SB.ui.screens.story) F.go('story', { mode: 'victory', clan: run.clan, summary: summary, next: function () { F.go('summary', params); } });
      else F.go('summary', params);
    } else {
      // the gameover screen shows the defeat card, then continues to the summary
      if (outcome === 'lost' && SB.ui.screens.gameover) F.go('gameover', Object.assign(params, { final: true }));
      else F.go('summary', params);
    }
  };

  // ------------------------------------------------------------------ dev helpers (headless tests): ?autorun=1&clan=alley&side=hearth&seed=ABCD1234
  Main.devRun = function (q) {
    var clan = q.get('clan') || 'alley', side = q.get('side') || (clan === 'hearth' ? 'alley' : 'hearth');
    var slots = K.championSlots(clan);
    var opts = { seed: q.get('seed') || K.seed.random(), clan: clan, side: side, championId: slots[0] && slots[0].id, gift: q.get('gift') || 'plump_wallet', rank: +(q.get('rank') || 0) };
    var run = F.startRun(opts);
    return run;
  };
})();
