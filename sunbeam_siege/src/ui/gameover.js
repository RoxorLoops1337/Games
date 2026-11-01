/* Game over (C4): the cushion goes cold. Finishes the lost battle through SB.run.finishBattle (which closes the run and
 * builds the summary), records the run to the profile, shows a defeat line, who did it, and a tip. Then on to the summary.
 * Params: {run, result, outcome} from the battle screen, or {run, summary, final} from SB.ui.flow.endRun. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function mount(root, params) {
    scope = K.scope();
    var F = SB.ui.flow, run = params.run || F.run, S = SB.data.story;
    if (!run) { F.toTitle(); return; }
    F.run = run;
    var summary = params.summary;
    if (!summary) {
      if (run.status === 'battle') {
        var r;
        try { r = SB.run.finishBattle(run, params.result || { outcome: 'lose' }); } catch (e) { r = null; }
        summary = r && r.summary;
      }
      if (!summary) summary = SB.run.summary(run, 'lost');
    }
    run.status = 'over'; run.outcome = run.outcome || 'lost';
    var report = params.report || F.recordRun(run, summary);
    F.clearSave();
    SB.ui.topbar.show(false);
    K.music('defeat');

    K.clear(root); root.classList.add('gopage');
    var rng = K.rngFor(run.seed + ':defeat');
    var quip = (S && S.pickDefeat && S.pickDefeat(rng)) || 'The Sunbeam has gone out. Somewhere, a cushion is cold.';
    var tip = (S && S.pickTip && S.pickTip(K.rngFor(run.seed + ':tip' + (summary.nightsSurvived || 0)))) || '';
    var killed = summary.killedBy ? (K.pestDef(summary.killedBy) || { name: summary.killedBy, id: summary.killedBy }) : null;
    var champ = summary.champion || {};

    var cv = SB.ui.scene.vignette('dark room, a cold cushion in the corner, one cat asleep, window with moon', { w: 160, h: 90, scale: 4, catScale: 1, seed: 'gameover' + run.seed, label: 'A cold cushion' });
    var box = h('div.go-box',
      h('div.sm-kicker', 'Night ' + Math.min(9, (summary.nightsSurvived || 0) + 1) + ' of 9'),
      h('h1.go-title', 'The cushion is cold'),
      h('p.go-quip', quip),
      killed ? h('div.go-killer', killed.id && K.pestDef(killed.id) ? h('span.go-pest', K.pest(killed, { scale: 3 })) : null, h('div', h('div.dim', { style: 'font-size:12px;letter-spacing:.1em;text-transform:uppercase' }, 'Brought down by'), h('b', { style: 'font-size:calc(20px*var(--text-scale));color:var(--danger)' }, killed.name))) : null,
      h('div.row.gap-s.wrap', { style: 'justify-content:center' },
        h('span.chip', 'Nights survived ' + (summary.nightsSurvived || 0) + '/9'), h('span.chip', 'Rank ' + (summary.rank || 0)), summary.whiskerXp ? h('span.chip.gold', K.icon('paw', 12), '+' + summary.whiskerXp + ' Whisker XP') : null),
      tip ? h('div.go-tip', h('span.faint', 'Elder Cat says'), h('p', tip)) : null,
      h('div.row.gap-s.wrap', { style: 'justify-content:center;margin-top:12px' },
        K.btn('See the summary', { icon: 'scroll', tut: 'goSummary', onClick: function () { F.go('summary', { run: run, summary: summary, report: report, outcome: 'lost' }); } }),
        K.btn('Try again', { kind: 'alt', icon: 'paw', onClick: function () { F.run = null; F.go('newrun', { replay: { clan: run.clan, side: run.side, championId: run.championId, rank: run.rank, gift: run.giftId } }); } }),
        K.btn('Title', { kind: 'alt', icon: 'home', onClick: function () { F.toTitle(); } })));
    root.appendChild(h('div.go-wrap', h('div.go-art', cv), box));
  }
  K.register('gameover', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
