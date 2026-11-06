/* SUNBEAM SIEGE deck-viewer.js (agent C3). SB.ui.deckViewer: scrollable pile / deck grid in a modal.
 *   SB.ui.deckViewer.open({title, cards:[cardLike], sort:'alpha'|'cost'|'none', filter:true, empty:'text', onPick(card, model)})
 *   SB.ui.deckViewer.pile(B, run, 'draw'|'discard'|'exhaust'|'deck')  battle helper, resolves cards from run.deck and B.state
 * cardLike = id, card def, card instance, or hand entry {uid, card}. Renders 48 cards at a time, "Show more" for big piles. No em dashes. */
(function () {
  'use strict';
  window.SB = window.SB || {};
  var ui = SB.ui = SB.ui || {};
  var h = ui.h;
  var CHUNK = 48;

  function open(o) {
    o = o || {};
    var models = (o.cards || []).map(function (c) { var m = ui.cardModel(c); return { src: c, m: m }; });
    var sort = o.sort || 'none', filter = 'all', shown = CHUNK;
    var grid = h('div.dv-grid'), count = h('span.dv-count'), more = h('button.btn.alt.sm.dv-more', { onclick: function () { shown += CHUNK; render(); } }, 'Show more');
    var filters = h('div.dv-filters');
    var FILTERS = [['all', 'All'], ['cat', 'Cats'], ['spell', 'Spells'], ['toy', 'Toys & rooms'], ['curse', 'Curses']];
    function matches(m, f) {
      if (f === 'all') return true;
      if (f === 'cat') return m.type === 'unit' || m.type === 'champion';
      if (f === 'toy') return m.type === 'toy' || m.type === 'room' || m.type === 'box' || m.type === 'treat';
      return m.type === f;
    }
    function render() {
      var list = models.filter(function (x) { return matches(x.m, filter); });
      if (sort === 'alpha') list = list.slice().sort(function (a, b) { return a.m.name < b.m.name ? -1 : a.m.name > b.m.name ? 1 : 0; });
      else if (sort === 'cost') list = list.slice().sort(function (a, b) { return (a.m.cost || 0) - (b.m.cost || 0) || (a.m.name < b.m.name ? -1 : 1); });
      ui.clear(grid);
      if (!list.length) grid.appendChild(h('p.dv-empty', {}, o.empty || 'Nothing here. Suspiciously tidy.'));
      list.slice(0, shown).forEach(function (x) {
        var el = ui.card(x.src, { size: 'mini' });
        el.setAttribute('aria-label', x.m.name);
        function pick() { if (o.onPick) o.onPick(x.src, x.m); else ui.cardDetail(x.src); }
        el.addEventListener('click', pick);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        grid.appendChild(el);
      });
      more.classList.toggle('hidden', list.length <= shown);
      count.textContent = list.length + (list.length === 1 ? ' card' : ' cards');
    }
    if (o.filter !== false && models.length > 6) {
      FILTERS.forEach(function (f) {
        var n = models.filter(function (x) { return matches(x.m, f[0]); }).length;
        if (f[0] !== 'all' && !n) return;
        filters.appendChild(h('button.btn.alt.sm' + (f[0] === 'all' ? '.on' : ''), { onclick: function (e) {
          filter = f[0]; shown = CHUNK; ui.$$('.btn', filters).forEach(function (b) { b.classList.remove('on'); }); e.currentTarget.classList.add('on'); render();
        } }, f[1] + ' ' + n));
      });
    }
    if (o.note) filters.appendChild(h('span.dv-note', {}, o.note));
    var body = h('div.dv', {}, filters, grid, h('div.dv-foot', {}, count, more));
    render();
    return ui.modal(body, { title: o.title || 'Cards', wide: true, buttons: [{ label: 'Close', cls: 'alt' }] });
  }

  // resolve piles for a running battle
  function pile(B, run, which) {
    var S = B.state, deck = (run && run.deck) || [];
    var byUid = {}; deck.forEach(function (c) { byUid[c.uid] = c; });
    var handUids = {}; (S.hand || []).forEach(function (x) { handUids[x.uid] = 1; });
    var discardUids = S.discard || [], exhaustUids = S.exhaust || S.exhausted || [];
    var inBoard = {}; S.floors.forEach(function (f) { f.cats.forEach(function (c) { inBoard[c.cardUid] = 1; }); });
    function res(uid) { return byUid[uid] || (S.hand || []).filter(function (x) { return x.uid === uid; }).map(function (x) { return x.card; })[0] || null; }
    var title, cards, note, empty;
    if (which === 'discard') { title = 'Discard pile'; cards = discardUids.map(res).filter(Boolean); empty = 'Nothing discarded yet.'; }
    else if (which === 'exhaust') { title = 'Exhaust pile'; cards = exhaustUids.map(res).filter(Boolean); empty = 'Nothing burned up yet.'; }
    else if (which === 'deck') { title = 'Your deck'; cards = deck.slice(); empty = 'Your deck is empty. Brave.'; }
    else {
      title = 'Draw pile'; note = 'Shown in alphabetical order so the draw order stays a surprise.';
      var gone = {}; discardUids.concat(exhaustUids).forEach(function (u) { gone[u] = 1; });
      cards = deck.filter(function (c) { return !handUids[c.uid] && !gone[c.uid] && !inBoard[c.uid]; });
      if (!deck.length) { cards = []; empty = 'The pile is hidden in this build (no run deck passed).'; }
      else empty = 'The draw pile is empty. The discard pile will be shuffled in.';
    }
    return open({ title: title + ' (' + cards.length + ')', cards: cards, sort: which === 'discard' ? 'none' : 'alpha', empty: empty, note: note });
  }

  ui.deckViewer = { open: open, pile: pile };
})();
