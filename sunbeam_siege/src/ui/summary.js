/* Run summary (C4): result banner, champion, stats, highlights, route, deck, relics, Whisker XP with level ups,
 * unlocks and achievements, copyable share string, replay buttons. Params: {run, summary, report, outcome}. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function copy(text) {
    var ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* ignore */ }
    if (!ok) {
      var ta = h('textarea', { rows: '3', readonly: true, style: 'font-family:var(--f-mono);font-size:12px;width:100%' }); ta.value = text;
      var d = K.dialog({ title: 'Copy this', body: h('div.col', h('p.dim', 'Select the text and copy it.'), ta), sheet: true });
      setTimeout(function () { ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } }, 50);
      return;
    }
    K.toast('Copied to the clipboard.', 'good');
  }

  function statRow(label, value) { return h('div.pv-line', h('span.dim', label), h('b.num', String(value))); }

  function mount(root, params) {
    scope = K.scope();
    var F = SB.ui.flow, run = params.run || F.run, S = params.summary || {}, report = params.report, outcome = params.outcome || S.outcome || 'lost';
    var won = outcome === 'won', retired = outcome === 'retired';
    var inner = K.scaffold(root, 'wide sm' + (won ? ' won' : ''));
    SB.ui.topbar.show(false);
    K.music(won ? 'victory' : 'title');

    // ---------------------------------------------------------------- banner
    var champ = S.champion || {};
    var clan = S.clan || (run && run.clan) || 'alley';
    var cdef = champ.id && K.card(champ.id);
    var banner = h('div.sm-banner' + (won ? '.win' : ''),
      h('div.sm-cat', K.cat(champ.id || 'elder_cat', { scale: 5, pose: won ? 'idle' : 'sleep' })),
      h('div.sm-head',
        h('div.sm-kicker', (won ? 'Victory' : retired ? 'Retired' : 'Defeat') + ' / Rank ' + (S.rank || 0)),
        h('h1.screen-title.sm-title', S.title || (won ? 'The Sunbeam Holds' : 'The Cushion Is Cold')),
        h('p.sm-flavor', S.flavor || ''),
        h('div.row.gap-s.wrap', { style: 'margin-top:8px' },
          h('span.chip', K.clanIcon(clan, 12), K.clan(clan).name),
          S.side ? h('span.chip', K.clanIcon(S.side, 12), K.clan(S.side).name) : null,
          cdef ? h('span.chip.gold', cdef.name) : null,
          champ.finalForm ? h('span.chip.goodc', 'Final form: ' + champ.finalForm) : null)));
    inner.appendChild(banner);

    // ---------------------------------------------------------------- cause
    var killed = S.killedBy && !won ? (K.pestDef(S.killedBy) || { name: S.killedBy }) : null;
    if (killed && !retired) inner.appendChild(h('p.sm-killed.dim', 'Brought down by ', h('b', killed.name), '.'));

    var cols = h('div.sm-cols');
    inner.appendChild(cols);
    var left = h('div.col', { style: 'gap:12px' }), right = h('div.col', { style: 'gap:12px' });
    cols.appendChild(left); cols.appendChild(right);

    // ---------------------------------------------------------------- stats
    var st = S.stats || {};
    var stats = h('section.panel.pad', { 'data-tut': 'sumStats' }, h('h3', 'The night, in numbers'),
      statRow('Nights survived', (S.nightsSurvived || 0) + ' of ' + (S.nightsOf || 9)),
      statRow('Time', K.fmtTime(S.seconds || 0)),
      statRow('Battles won', st.battlesWon || 0),
      statRow('Elites beaten', st.elitesBeaten || 0),
      statRow('Bosses beaten', st.bossesBeaten || 0),
      statRow('Fish earned', st.fishEarned || 0),
      statRow('Cards in the clowder', S.deckSize || 0),
      statRow('Relics', (S.relics || []).length),
      statRow('Lives spent', st.livesSpent || 0));
    left.appendChild(stats);
    if (S.highlights && S.highlights.length) {
      left.appendChild(h('section.panel.pad', h('h3', 'Highlights'), h('div.col', { style: 'gap:6px' }, S.highlights.map(function (t) { return h('div.rw-g', K.icon('star', 14), h('span', t)); }))));
    }
    // route
    if (S.route && S.route.length) {
      var T = K.nodeTypes || {};
      var strip = h('div.sm-route');
      var lastAct = 0;
      S.route.forEach(function (r) {
        if (r.act !== lastAct) { if (lastAct) strip.appendChild(h('span.sm-actsep')); lastAct = r.act; }
        var def = T[r.type] || { icon: 'paw', name: r.type };
        strip.appendChild(h('span.node-ico.sm.t-' + r.type, { title: def.name }, K.icon(def.icon, 14)));
      });
      left.appendChild(h('section.panel.pad', h('h3', 'Your route'), strip));
    }

    // ---------------------------------------------------------------- whisker xp
    var xp = S.xp || {}, total = S.whiskerXp || xp.total || 0;
    if (!(run && run.tutorial)) {
      var prof = K.prof.get(), meta = SB.data.meta;
      var after = prof ? prof.xp : 0, before = Math.max(0, after - total);
      var lvBefore = meta.xp.fromXp(before), lvAfter = meta.xp.fromXp(after);
      var fill = h('i', { style: 'width:' + Math.round(lvBefore.pct * 100) + '%' });
      var xpNum = h('b.num', '+0');
      var lvLbl = h('span.sm-lvl', 'Whisker Lv ' + lvBefore.level);
      var panel = h('section.panel.pad.sm-xp', { 'data-tut': 'sumXp' }, h('h3', 'Whisker XP'),
        h('div.row', { style: 'justify-content:space-between' }, lvLbl, h('span.row.gap-s', { style: 'color:var(--sunbeam)' }, K.icon('paw', 16), xpNum)),
        h('div.xpbar.big', fill));
      var breakdown = [];
      if (xp.base != null) {
        breakdown.push(statRow('Base (nights, elites, bosses, rank' + (won ? ', win' : '') + ')', xp.base));
        if (xp.factor && xp.factor !== 1) breakdown.push(statRow('Seed repeat factor', 'x' + xp.factor));
        if (xp.bonus) breakdown.push(statRow('Daily bonus', '+' + xp.bonus));
      }
      if (breakdown.length) panel.appendChild(h('details.sm-bd', h('summary.faint', 'How this was counted'), h('div.col', { style: 'gap:4px;margin-top:6px' }, breakdown)));
      right.appendChild(panel);
      K.countUp(xpNum, total, 1100, function (n) { return '+' + Math.round(n); });
      // animate the bar
      scope.timeout(function () {
        var multi = lvAfter.level > lvBefore.level;
        fill.style.transition = K.reduced() ? 'none' : 'width 1s ease-out';
        fill.style.width = (multi ? 100 : Math.round(lvAfter.pct * 100)) + '%';
        if (multi) scope.timeout(function () { fill.style.transition = 'none'; fill.style.width = Math.round(lvAfter.pct * 100) + '%'; lvLbl.textContent = 'Whisker Lv ' + lvAfter.level; }, 1100);
      }, 350);

      // popups: level ups and unlocks, then achievements
      scope.timeout(function () { popups(report, meta); }, 1700);
    }

    // ---------------------------------------------------------------- deck + relics
    var deckBy = S.deck || {};
    var deckPanel = h('section.panel.pad', h('h3', 'The clowder (' + (S.deckSize || 0) + ')'));
    var clanOrder = Object.keys(deckBy).sort();
    if (!clanOrder.length && run) { deckBy = { all: run.deck }; clanOrder = ['all']; }
    clanOrder.forEach(function (c) {
      var rows = deckBy[c] || [];
      if (!rows.length) return;
      var names = rows.map(function (x) { return x.name || x.id; });
      var det = h('details.sm-deck', h('summary', h('span.chip', c === 'all' ? 'Deck' : K.clan(c).name), h('span.faint', ' ' + rows.length + (rows.length === 1 ? ' card' : ' cards'))),
        h('div.sm-deckgrid'));
      det.addEventListener('toggle', function () {
        var g = det.querySelector('.sm-deckgrid'); if (!det.open || g.children.length) return;
        rows.forEach(function (x) { var inst = run && run.deck.filter(function (d) { return d.uid === x.uid; })[0] || x.id; g.appendChild(K.cardEl(inst, { size: 'mini', onClick: function () { K.inspectCard(inst); } })); });
      });
      deckPanel.appendChild(det);
    });
    right.appendChild(deckPanel);
    if (S.relics && S.relics.length) {
      right.appendChild(h('section.panel.pad', h('h3', 'Relics'), h('div.row.gap-s.wrap', S.relics.map(function (id) { return K.relicIcon(id, 22); }))));
    }

    // ---------------------------------------------------------------- share and actions
    var share = S.share || '';
    var shareBox = h('section.panel.pad', h('h3', 'Share'), h('code.sm-share', share),
      h('div.row.gap-s.wrap', { style: 'margin-top:8px' }, K.btn('Copy result', { kind: 'alt', icon: 'copy', tut: 'shareCopy', onClick: function () { copy(share); } }), K.btn('Copy seed', { kind: 'alt', icon: 'copy', onClick: function () { copy(S.seed || ''); } })));
    left.appendChild(shareBox);

    var replay = { clan: S.clan || (run && run.clan), side: S.side || (run && run.side), championId: run && run.championId, rank: S.rank || 0, gift: run && run.giftId };
    var actions = h('div.rw-foot.sm-actions',
      K.btn('Run it again', { icon: 'paw', tut: 'runAgain', onClick: function () { F.run = null; F.go('newrun', { replay: Object.assign({}, replay) }); } }),
      K.btn('Same seed', { kind: 'alt', icon: 'dice', onClick: function () { F.run = null; F.go('newrun', { replay: Object.assign({ seed: S.seed }, replay) }); } }),
      K.btn('Collection', { kind: 'alt', icon: 'deck', onClick: function () { F.run = null; F.go('collection', {}); } }),
      K.btn('Title', { kind: 'alt', icon: 'home', onClick: function () { F.toTitle(); } }));
    inner.appendChild(actions);
  }

  // level ups, unlocks, achievements as a short chain of dialogs
  function popups(report, meta) {
    if (!report) return;
    var queue = [];
    var lv = report.levelsGained || [];
    if (lv.length || (report.unlocks && report.unlocks.length) || report.rankUnlocked || report.crowned) {
      var body = h('div.col', { style: 'gap:10px' });
      lv.forEach(function (n) {
        var row = (meta.levels || [])[n - 1] || {};
        body.appendChild(h('div.panel.tight.row', { style: 'gap:12px' }, h('div.sm-lvbadge', String(n)), h('div', h('b', { style: 'color:var(--sunbeam)' }, 'Whisker Level ' + n), h('div.dim', row.title || ''))));
      });
      var kinds = { clan: 'Clan', champion: 'Champion', relic: 'Relic', gift: 'Cradle Gift', coat: 'Coat', collar: 'Collar' };
      if (report.unlocks && report.unlocks.length) {
        body.appendChild(h('h3', { style: 'margin-top:4px' }, 'Unlocked'));
        report.unlocks.forEach(function (u) { body.appendChild(h('div.row.gap-s', K.icon('sparkle', 14), h('span.chip', kinds[u.kind] || u.kind), h('span', u.name))); });
      }
      if (report.rankUnlocked) body.appendChild(h('div.panel.tight', h('b', { style: 'color:var(--moon)' }, 'Mischief Rank ' + report.rankUnlocked + ' unlocked. '), h('span.dim', 'The house has noticed. It is not pleased.')));
      if (report.crowned) body.appendChild(h('div.panel.tight', h('b', { style: 'color:var(--sunbeam)' }, 'Rank 10 cleared. '), h('span.dim', 'You may now call yourself the Crowned Cat. Nobody will stop you.')));
      queue.push({ title: lv.length ? 'Level up' : 'New things', body: body });
    }
    (report.achievements || []).forEach(function (a) {
      queue.push({ title: 'Achievement', body: h('div.col', { style: 'gap:6px;align-items:center;text-align:center' }, K.icon('star', 36), h('b', { style: 'font-size:20px;color:var(--sunbeam)' }, a.name), h('p.dim', a.text || a.desc || '')) });
    });
    (function next() {
      var q = queue.shift(); if (!q) return;
      K.sfx('relic_get');
      K.dialog({ title: q.title, body: q.body, sheet: true, onClose: function () { setTimeout(next, 120); }, footer: [K.btn(queue.length ? 'Next' : 'Nice', { onClick: function () { K.closeAllDialogs(); } })] });
    })();
  }

  K.register('summary', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
