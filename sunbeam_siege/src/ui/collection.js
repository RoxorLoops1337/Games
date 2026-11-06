/* Collection (C4): Cards, Relics, Pests, Codex, Achievements, Cosmetics. Locked entries show as silhouettes with a hint.
 * Reads SB.data.meta (gates, coats, collars, achievements) and the profile through K.prof. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;
  var M = function () { return SB.data.meta || {}; };

  function unlockText(u) {
    if (!u) return '';
    if (u.type === 'level') return 'Reach Whisker level ' + u.level;
    if (u.type === 'rankWin') return 'Win a run on Mischief rank ' + u.rank;
    if (u.type === 'achievement') { var a = (M().achievements || []).filter(function (x) { return x.id === u.id; })[0]; return 'Earn "' + (a ? a.name : u.id) + '"'; }
    return '';
  }

  var CLAN_NAMES = { alley: 'Alley', hearth: 'Hearth', moon: 'Moon', mischief: 'Mischief', neutral: 'Neutral', champion: 'Champions' };

  function mount(root, params) {
    scope = K.scope();
    var prof = K.prof.get(), F = SB.ui.flow;
    var inner = K.scaffold(root, 'col');
    inner.appendChild(h('div.row.between', h('h1.screen-title', 'Collection'), K.btn('Back', { kind: 'alt', small: true, icon: 'back', onClick: function () { F.toTitle(); } })));
    var tabsEl = h('div.tabs', { role: 'tablist' });
    var host = h('div.co-host');
    inner.appendChild(tabsEl); inner.appendChild(host);
    var TABS = [['cards', 'Cards'], ['relics', 'Relics'], ['pests', 'Pests'], ['codex', 'Codex'], ['ach', 'Achievements'], ['cos', 'Cosmetics']];
    var tab = (params && params.tab) || 'cards', filter = { clan: 'all', rarity: 'all' };
    try { var saved = sessionStorage.getItem('sb_col_tab'); if (saved && !(params && params.tab)) tab = saved; } catch (e) { /* ignore */ }

    function drawTabs() {
      K.clear(tabsEl);
      TABS.forEach(function (t) {
        var b = h('button.tab' + (t[0] === tab ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': t[0] === tab ? 'true' : 'false' }, t[1]);
        b.addEventListener('click', function () { tab = t[0]; try { sessionStorage.setItem('sb_col_tab', tab); } catch (e) { /* ignore */ } K.click(); drawTabs(); draw(); });
        tabsEl.appendChild(b);
      });
    }
    function chipRow(opts, cur, on) {
      var row = h('div.row.gap-s.wrap.co-filters');
      opts.forEach(function (o) {
        var b = h('button.chip.filter' + (o[0] === cur ? '.on' : ''), { type: 'button', 'aria-pressed': o[0] === cur ? 'true' : 'false' }, o[1]);
        b.addEventListener('click', function () { K.click(); on(o[0]); });
        row.appendChild(b);
      });
      return row;
    }

    function drawCards() {
      var all = K.cards().filter(function (c) { return c && c.id && !c.token && c.type !== 'token' && !/^tut/.test(c.id); });
      var clans = ['all'].concat(['alley', 'hearth', 'moon', 'mischief', 'neutral']);
      host.appendChild(chipRow(clans.map(function (c) { return [c, c === 'all' ? 'All' : CLAN_NAMES[c]]; }), filter.clan, function (v) { filter.clan = v; draw(); }));
      var list = all.filter(function (c) { return filter.clan === 'all' || (c.clan || 'neutral') === filter.clan; });
      var order = { starter: 0, common: 1, basic: 1, uncommon: 2, rare: 3, epic: 4, champion: 5, curse: 6 };
      list.sort(function (a, b) { return (order[a.rarity] || 0) - (order[b.rarity] || 0) || String(a.name).localeCompare(String(b.name)); });
      host.appendChild(h('p.dim.co-count', list.length + ' cards. Tap one for the full card.'));
      var grid = h('div.co-cards');
      list.forEach(function (c) {
        var t = h('button.co-card', { type: 'button', 'aria-label': c.name }, K.cardEl(c.id, { size: 'mini', noFocus: true }));
        t.addEventListener('click', function () { K.click(); K.inspectCard(c.id); });
        grid.appendChild(t);
      });
      host.appendChild(grid);
    }

    function drawRelics() {
      var gates = {}; (M().relicGates || []).forEach(function (g) { gates[g.id] = g; });
      var all = K.relics();
      var rar = ['all', 'common', 'uncommon', 'rare', 'epic', 'boss'];
      host.appendChild(chipRow(rar.map(function (r) { return [r, r === 'all' ? 'All' : K.cap(r)]; }), filter.rarity, function (v) { filter.rarity = v; draw(); }));
      var list = all.filter(function (r) { return filter.rarity === 'all' || r.rarity === filter.rarity; });
      var got = prof && prof.unlocked && prof.unlocked.relics || [];
      host.appendChild(h('p.dim.co-count', list.length + ' relics.'));
      var grid = h('div.co-list');
      list.forEach(function (r) {
        var g = gates[r.id], locked = g && got.indexOf(r.id) < 0;
        var row = h('div.co-row' + (locked ? '.locked' : ''),
          locked ? h('span.co-sil', K.icon('lock', 18)) : K.relicIcon(r, 20),
          h('div.co-body', h('b', locked ? '???' : r.name), h('div.dim', locked ? (g.hint || 'Not found yet.') : (r.text || r.desc || '')), locked ? h('div.faint.co-gate', unlockText(g.unlock)) : (r.flavor ? h('div.faint.co-flavor', r.flavor) : null)),
          h('span.chip', { style: '--rar:' + K.rarityColor(r.rarity) }, K.cap(r.rarity || 'common')));
        grid.appendChild(row);
      });
      host.appendChild(grid);
    }

    function drawPests() {
      var list = K.pests().slice().sort(function (a, b) { return (a.act || 0) - (b.act || 0) || String(a.name).localeCompare(String(b.name)); });
      host.appendChild(h('p.dim.co-count', list.length + ' pests on file. The house keeps notes.'));
      var grid = h('div.co-list');
      list.forEach(function (p) {
        var kind = p.boss ? 'Boss' : (p.elite || p.tier === 'elite' ? 'Elite' : 'Pest');
        grid.appendChild(h('div.co-row',
          h('span.co-pest', K.pest(p, { scale: 2 })),
          h('div.co-body', h('b', p.name || p.id), h('div.dim', p.text || p.desc || p.flavor || ''), p.flavor && p.text ? h('div.faint.co-flavor', p.flavor) : null),
          h('span.chip', kind)));
      });
      host.appendChild(grid);
    }

    function drawCodex() {
      var S = SB.data.story || {}, list = (S.codex || []).slice();
      var seenTags = {}; // entries unlocked by run_start are always open; others open once the profile has played enough
      var runs = prof && prof.stats && prof.stats.life && prof.stats.life.runs || 0;
      var cats = {};
      list.forEach(function (c) { (cats[c.category || 'Notes'] = cats[c.category || 'Notes'] || []).push(c); });
      Object.keys(cats).forEach(function (cat) {
        host.appendChild(h('h3.co-cat', cat));
        var g = h('div.co-list');
        cats[cat].forEach(function (c) {
          var open = c.unlock === 'run_start' || (prof && prof.tutorial && prof.tutorial.handbookSeen && prof.tutorial.handbookSeen.indexOf('codex_' + c.id) >= 0) || runs > 0 || c.unlock === 'always';
          g.appendChild(h('div.co-row.codex' + (open ? '' : '.locked'), h('div.co-body', h('b', open ? c.title : '???'), h('p', open ? c.text : 'Locked. Keep playing and the house will tell you.'))));
        });
        host.appendChild(g);
      });
      if (!list.length) host.appendChild(h('p.dim', 'Nothing filed yet.'));
    }

    function drawAch() {
      var A = M().achievements || [], got = prof && prof.achievements || {};
      var n = A.filter(function (a) { return got[a.id]; }).length;
      host.appendChild(h('p.dim.co-count', n + ' of ' + A.length + ' earned.'));
      var groups = {}, order = [];
      A.forEach(function (a) { var g = a.group || 'run'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(a); });
      order.forEach(function (g) {
        host.appendChild(h('h3.co-cat', K.cap(g)));
        var list = h('div.co-list');
        groups[g].forEach(function (a) {
          var has = got[a.id], hide = a.hidden && !has;
          list.appendChild(h('div.co-row' + (has ? '.earned' : '.locked'),
            h('span.co-sil' + (has ? '.gold' : ''), K.icon(has ? 'star' : 'lock', 18)),
            h('div.co-body', h('b', hide ? '???' : a.name), h('div.dim', hide ? 'A hidden one. It will make itself known.' : a.desc))));
        });
        host.appendChild(list);
      });
    }

    function drawCos() {
      var m = M(), eq = (prof.equipped = prof.equipped || { 'default': {} })['default'] = (prof.equipped && prof.equipped['default']) || {};
      var coats = m.coats || [], collars = m.collars || [];
      var have = function (kind, id) { return prof.unlocked && prof.unlocked[kind] && prof.unlocked[kind].indexOf(id) >= 0; };
      var curCoat = coats.filter(function (c) { return c.id === eq.coat; })[0] || coats[0];
      var curCollar = collars.filter(function (c) { return c.id === eq.collar; })[0];
      function genome(coat, collar) {
        var g = {}; var a = coat && coat.genome || {}, b = collar && collar.genome || {};
        Object.keys(a).forEach(function (k) { g[k] = a[k]; }); Object.keys(b).forEach(function (k) { g[k] = b[k]; });
        return g;
      }
      var prev = h('div.co-preview');
      function drawPrev() { K.clear(prev); prev.appendChild(K.cat(genome(curCoat, curCollar), { scale: 6 })); prev.appendChild(h('div.dim', (curCoat ? curCoat.name : '') + (curCollar ? ' with ' + curCollar.name : ''))); }
      drawPrev();
      host.appendChild(prev);
      function section(title, items, kind, bucket, cur, set) {
        host.appendChild(h('h3.co-cat', title));
        var g = h('div.co-swatches');
        items.forEach(function (it) {
          var owned = have(bucket, it.id), on = cur && cur.id === it.id;
          var gen = kind === 'coat' ? genome(it, curCollar) : genome(curCoat, it);
          var b = h('button.co-swatch' + (owned ? '' : '.locked') + (on ? '.on' : ''), { type: 'button', 'aria-label': it.name + (owned ? '' : ', locked'), 'aria-pressed': on ? 'true' : 'false', title: owned ? it.flavor : unlockText(it.unlock) },
            owned ? K.cat(gen, { scale: 2, tick: false }) : h('span.co-sil', K.icon('lock', 16)),
            h('span.co-sw-name', owned ? it.name : '???'));
          b.addEventListener('click', function () {
            if (!owned) { K.toast(unlockText(it.unlock) || 'Locked.', ''); return; }
            K.click(); set(it); K.prof.save(); drawPrev(); draw();
          });
          g.appendChild(b);
        });
        host.appendChild(g);
      }
      section('Coats', coats, 'coat', 'coats', curCoat, function (it) { eq.coat = it.id; curCoat = it; });
      section('Collars and hats', collars, 'collar', 'collars', curCollar, function (it) { eq.collar = it.id; curCollar = it; });
    }

    function draw() {
      var y = window.scrollY; K.clear(host);
      if (tab === 'cards') drawCards(); else if (tab === 'relics') drawRelics(); else if (tab === 'pests') drawPests();
      else if (tab === 'codex') drawCodex(); else if (tab === 'ach') drawAch(); else drawCos();
      try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
    }
    drawTabs(); draw();
    scope.on(document, 'keydown', function (e) { if (e.key === 'Escape' && !K.hasDialog()) F.toTitle(); });
  }

  K.register('collection', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
