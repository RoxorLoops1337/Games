/* SUNBEAM SIEGE persistent in-run top bar (C4): Night counter, Warmth, Fish, relic strip, deck, map, pause cog.
 * Also the deck viewer and relic list dialogs that other screens (battle, post, shop) can reuse:
 *   SB.ui.topbar.refresh(), SB.ui.topbar.show(bool), SB.ui.openDeck(run, opts), SB.ui.openRelics(run), SB.ui.openMap(run), SB.ui.openPause(run).
 * No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h;
  var T = SB.ui.topbar = {};
  var el = null, state = { visible: false }, lastFish = null, lastDeck = null, lastWarmth = null;

  function run() { return SB.ui.flow && SB.ui.flow.run || null; }
  function nightOf(r) {
    if (!r) return 1;
    return Math.max(1, Math.min(9, (r.nightsSurvived || 0) + 1));
  }

  T.mount = function () {
    el = document.getElementById('topbar'); if (!el) return;
    el.hidden = true;
  };
  T.show = function (on) {
    if (!el) T.mount();
    if (!el) return;
    state.visible = !!on;
    el.hidden = !on;
    document.body.classList.toggle('has-topbar', !!on);
    if (on) T.refresh();
  };
  T.refresh = function () {
    if (!el || !state.visible) return;
    var r = run(); if (!r) { return; }
    var deckN = (r.deck || []).length, relics = r.relics || [];
    var warm = Math.max(0, r.warmth || 0), maxW = r.maxWarmth || 40, pct = Math.max(0, Math.min(100, Math.round(warm / maxW * 100)));
    K.clear(el);
    var night = h('div.tb-night', { 'data-tut': 'topbarNight', title: 'Act ' + (r.act || 1) }, K.icon('night', 16), h('span.lbl', 'Night '), h('b.num', nightOf(r) + '/9'));
    var warmEl = h('div.tb-warmth' + (pct <= 25 ? '.low' : ''), { 'data-tut': 'warmth', title: 'Sunbeam Warmth', role: 'img', 'aria-label': 'Warmth ' + warm + ' of ' + maxW },
      K.icon('warmth', 16), h('div.bar', h('i', { style: 'width:' + pct + '%' })), h('span.tb-num', warm + '/' + maxW));
    var fish = h('div.tb-fish', { 'data-tut': 'shopFish', title: 'Fish' }, K.icon('fish', 16), h('span.tb-num.num', String(r.fish || 0)));
    var strip = h('div.tb-relics', { 'data-tut': 'relicStrip' }, relics.map(function (x) { return K.relicIcon(x, 18); }));
    var deck = h('button.ibtn', { type: 'button', 'data-tut': 'deckButton', 'aria-label': 'Deck, ' + deckN + ' cards', title: 'Deck (D)', on: { click: function () { K.click(); SB.ui.openDeck(run()); } } },
      K.icon('deck', 20), h('span.badge.num', String(deckN)));
    var relBtn = h('button.ibtn.tb-relbtn', { type: 'button', 'aria-label': 'Relics, ' + relics.length, title: 'Relics', on: { click: function () { K.click(); SB.ui.openRelics(run()); } } }, K.icon('relic', 20), h('span.badge.num', String(relics.length)));
    var mapB = h('button.ibtn', { type: 'button', 'data-tut': 'mapButton', 'aria-label': 'Map', title: 'Map', on: { click: function () { K.click(); SB.ui.openMap(run()); } } }, K.icon('map', 20));
    var cog = h('button.ibtn', { type: 'button', 'data-tut': 'settingsCog', 'aria-label': 'Pause menu and settings', title: 'Menu', on: { click: function () { K.click(); SB.ui.openPause(run()); } } }, K.icon('cog', 20));
    el.appendChild(night); el.appendChild(warmEl); el.appendChild(fish); el.appendChild(strip);
    el.appendChild(h('div.tb-group', relBtn, deck, mapB, cog));
    if (lastDeck != null && deckN !== lastDeck) deck.classList.add('bump');
    if (lastFish != null && r.fish !== lastFish) fish.classList.add('bump');
    lastDeck = deckN; lastFish = r.fish; lastWarmth = warm;
  };

  // ------------------------------------------------------------------ deck viewer
  var SORTS = {
    clan: function (a, b) { return String(a.clan).localeCompare(b.clan) || a.cost - b.cost || a.name.localeCompare(b.name); },
    cost: function (a, b) { return (a.cost === 'X' ? 9 : a.cost) - (b.cost === 'X' ? 9 : b.cost) || a.name.localeCompare(b.name); },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    type: function (a, b) { return String(a.type).localeCompare(b.type) || a.cost - b.cost || a.name.localeCompare(b.name); }
  };
  /** SB.ui.openDeck(run, {cards, title, pick:function(inst), filter:function(inst), emptyText}) */
  SB.ui.openDeck = function (r, o) {
    o = o || {};
    r = r || run(); if (!r && !o.cards) return;
    var cards = o.cards || r.deck || [];
    var st = { sort: 'clan', clan: 'all', tab: 'cards' };
    var body = h('div.col', { style: 'gap:10px' });
    var d = K.dialog({ title: o.title || 'Your clowder', body: body, wide: true });
    function paint() {
      K.clear(body);
      var rows = cards.map(function (c) { var e = K.effective(c) || {}; return { inst: c, name: e.name || '?', clan: e.clan || 'neutral', cost: e.cost == null ? 0 : e.cost, type: e.type || 'unit' }; });
      if (o.filter) rows = rows.filter(function (x) { return o.filter(x.inst); });
      var clans = {}; rows.forEach(function (x) { clans[x.clan] = (clans[x.clan] || 0) + 1; });
      var tabs = h('div.tabs', { role: 'tablist' });
      var chips = [['all', 'All ' + rows.length]].concat(Object.keys(clans).map(function (c) { return [c, K.clan(c).name + ' ' + clans[c]]; }));
      chips.forEach(function (c) { tabs.appendChild(h('button.tab', { type: 'button', role: 'tab', 'aria-selected': st.clan === c[0] ? 'true' : 'false', on: { click: function () { st.clan = c[0]; paint(); } } }, c[1])); });
      var sortSel = h('select', { 'aria-label': 'Sort', style: 'width:auto', on: { change: function (e) { st.sort = e.target.value; paint(); } } },
        ['clan', 'cost', 'name', 'type'].map(function (k) { return h('option', { value: k, selected: st.sort === k ? true : null }, 'Sort: ' + K.cap(k)); }));
      body.appendChild(h('div.row.gap-s.wrap', { style: 'justify-content:space-between' }, tabs, sortSel));
      var shown = rows.filter(function (x) { return st.clan === 'all' || x.clan === st.clan; }).sort(SORTS[st.sort]);
      var grid = h('div.grid-cards');
      if (!shown.length) grid = h('p.dim.center', { style: 'padding:24px' }, o.emptyText || 'Nothing here yet.');
      shown.forEach(function (x) {
        var c = K.cardEl(x.inst, { size: 'mini', onClick: function () { if (o.pick) { if (o.pick(x.inst, d) !== false) d.close(); } else K.inspectCard(x.inst); } });
        grid.appendChild(c);
      });
      body.appendChild(grid);
      body.appendChild(h('p.faint.center', { style: 'font-size:12px' }, o.pick ? 'Tap a card to choose it.' : 'Tap a card for details.'));
    }
    paint();
    return d;
  };
  SB.ui.openRelics = function (r) {
    r = r || run(); var list = (r && r.relics) || [];
    var body = h('div.col', { style: 'gap:8px' });
    if (!list.length) body.appendChild(h('p.dim.center', { style: 'padding:20px' }, 'No relics yet. They turn up in the strangest places.'));
    list.forEach(function (x) {
      var def = K.relic(x.id || x) || { name: x.id || x, text: '' };
      body.appendChild(h('div.panel.tight.row', { style: 'align-items:flex-start;gap:10px' }, K.relicIcon(def, 22),
        h('div.grow', h('div', { style: 'font-weight:800;color:var(--sunbeam)' }, def.name), h('div.dim', { style: 'font-size:calc(13px*var(--text-scale))' }, def.text || ''),
          def.flavor ? h('div.faint', { style: 'font-size:12px;font-style:italic;margin-top:2px' }, def.flavor) : null),
        x && x.counter ? h('span.chip', 'x' + x.counter) : null));
    });
    return K.dialog({ title: 'Relics (' + list.length + ')', body: body, sheet: true });
  };
  SB.ui.openMap = function (r) {
    r = r || run(); if (!r || !r.map) return;
    var body = h('div'); var d = K.dialog({ title: 'Act ' + (r.act || 1) + ' map', body: body, wide: true });
    if (SB.ui.mapView) SB.ui.mapView(body, r, { interactive: false });
    return d;
  };
  SB.ui.openPause = function (r) {
    r = r || run();
    var body = h('div.col', { style: 'gap:8px' });
    var d = K.dialog({ title: 'Paused', body: body, sheet: true });
    function item(label, kind, fn) { return h('button.btn.wide' + (kind ? '.' + kind : ''), { type: 'button', on: { click: function () { K.click(); fn(); } } }, label); }
    body.appendChild(item('Resume', '', function () { d.close(); }));
    body.appendChild(item('Settings', 'alt', function () { d.close(); SB.ui.openSettings && SB.ui.openSettings(); }));
    if (r) {
      body.appendChild(item('Deck', 'alt', function () { d.close(); SB.ui.openDeck(r); }));
      body.appendChild(item('Save and quit to title', 'alt', function () { d.close(); try { SB.run.save(r); } catch (e) { /* ignore */ } SB.ui.flow.toTitle(); }));
      body.appendChild(item('Retire run', 'danger', function () {
        K.confirm({ title: 'Retire this run?', text: 'The Sunbeam will understand. It counts as a defeat ("Went for a nap"), and you still earn Whisker XP.', ok: 'Retire', danger: true }).then(function (y) { if (y) { d.close(); SB.ui.flow.retire(); } });
      }));
    }
    return d;
  };
  T.mount();
})();
