/* Nap Nook (C4): one pick from Curl Up, Knead, Groom, Lick Wounds, Deep Sleep, plus a free Growth Spurt for any ready kitten.
 * Rules live in SB.nook (C2): options, choose(run, id, arg), growthSpurt. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;
  var ICON = { curl_up: 'nook', knead: 'paw', groom: 'close', lick_wounds: 'heart', deep_sleep: 'note' };

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run || run.status !== 'nook') { F.toMap(); return; }
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    var U = SB.run.U;
    var inner = K.scaffold(root, 'narrow nook');
    var art = h('div.ev-art'); art.appendChild(SB.ui.scene.vignette('cat curled asleep on a cushion in a sunbeam, warm attic', { w: 160, h: 56, scale: 4, seed: 'nook' + run.seed, label: 'A warm nook' }));
    inner.appendChild(art);
    inner.appendChild(K.screenHead('Nap Nook', 'A cushion, a sunbeam, nobody asking anything of you. Pick one.'));
    var host = h('div.col', { style: 'gap:10px' });
    inner.appendChild(host);
    var done = !!(run.current.nook && run.current.nook.chosen);

    function leave() { F.afterNode(); }
    function finished(res, label) {
      done = true; SB.ui.topbar.refresh(); F.save();
      K.clear(host);
      var txt = h('p.ev-resulttext');
      var bits = [];
      if (res.healed) bits.push('+' + res.healed + ' Warmth');
      if (res.maxWarmth) bits.push('Max Warmth ' + res.maxWarmth);
      var card = h('div.panel.pad.ev-resultcard', h('div.dim', { style: 'font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px' }, label), txt,
        bits.length ? h('div.ev-chips', { style: 'margin-top:8px' }, bits.map(function (b) { return h('span.pill-gain', b); })) : null);
      host.appendChild(card);
      K.typewriter(txt, res.text || 'Rested.', { cps: 90 });
      K.sfx('heal');
      growthRows();
      host.appendChild(h('div.rw-foot', K.btn('Back to the map', { icon: 'paw', tut: 'nookLeave', onClick: leave })));
    }
    function growthRows() {
      var list = SB.post.evolvable(run).filter(function (e) { return e.kind === 'growthSpurt'; });
      list.forEach(function (e) {
        var row = h('div.panel.pad.po-grow', h('h3', 'A kitten stretches'), h('div.po-cards', h('div.po-col', K.cardEl(e.from, { size: 'reward', noFocus: true })), h('span.po-arrow', K.icon('plus', 18)), h('div.po-col', K.cardEl(e.to, { size: 'reward', noFocus: true }))));
        row.appendChild(K.btn('Growth Spurt (free)', { icon: 'sparkle', onClick: function (ev) {
          var res = SB.nook.growthSpurt(run, e.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; }
          K.sfx('relic_get'); K.toast(res.text, 'good'); row.remove(); SB.ui.topbar.refresh(); F.save();
        } }));
        host.appendChild(row);
      });
    }
    function choose(o, arg) {
      var res;
      try { res = SB.nook.choose(run, o.id, arg); } catch (e) { K.toast(String(e.message || e), 'bad'); return; }
      if (!res.ok) { K.toast(res.reason || 'It would not settle.', 'bad'); return; }
      finished(res, o.label);
    }
    function pickCats(o, max) {
      var cats = U.cats(run).filter(function (c) { return c.lives < c.maxLives || o.id === 'deep_sleep'; });
      if (!cats.length) cats = U.cats(run);
      var chosen = [];
      var grid = h('div.grid-cards'), dd, go;
      function upd() { go.disabled = !chosen.length; go.querySelector('.lbl').textContent = chosen.length ? 'Lick ' + chosen.length + (chosen.length === 1 ? ' cat' : ' cats') : 'Pick up to ' + max; }
      cats.forEach(function (c) {
        var cell = h('button.post-cell.pickable', { type: 'button', 'aria-pressed': 'false' }, K.cardEl(c, { size: 'mini', noFocus: true }), h('span.post-slots', c.lives + '/' + c.maxLives));
        cell.addEventListener('click', function () {
          var i = chosen.indexOf(c.uid);
          if (i >= 0) { chosen.splice(i, 1); cell.classList.remove('on'); cell.setAttribute('aria-pressed', 'false'); }
          else if (chosen.length < max) { chosen.push(c.uid); cell.classList.add('on'); cell.setAttribute('aria-pressed', 'true'); }
          else K.toast('Up to ' + max + ' only.', '');
          upd();
        });
        grid.appendChild(cell);
      });
      go = h('button.btn', { type: 'button', disabled: true }, K.icon('heart', 16), h('span.lbl', ''));
      go.addEventListener('click', function () { dd.close(); choose(o, { uids: chosen }); });
      dd = K.dialog({ title: o.label, body: h('div.col', h('p.dim', o.text), grid), footer: [go], wide: true });
      upd();
    }
    function pick(o) {
      K.click();
      if (!o.available) { K.toast('Nothing for that here.', ''); return; }
      if (o.id === 'groom') {
        SB.ui.openDeck(run, { cards: run.deck.filter(function (i) { return U.canRemove(run, i).ok; }), title: 'Groom: adopt out which card?', pick: function (inst) {
          K.confirm({ title: 'Adopt out ' + K.cardName(inst) + '?', text: 'No heal for this one. Someone will love it.', ok: 'Groom' }).then(function (y) { if (y) choose(o, { uid: inst.uid }); });
          return true;
        } });
      } else if (o.id === 'lick_wounds') pickCats(o, 3);
      else if (o.id === 'deep_sleep') {
        SB.ui.openDeck(run, { cards: U.cats(run), title: 'Deep Sleep: which cat?', pick: function (inst) { choose(o, { uid: inst.uid }); return true; } });
      } else choose(o);
    }

    if (done) { finished({ text: 'You have already settled in.' }, 'Rested'); return; }
    var opts = (params.payload && params.payload.options) || SB.nook.options(run);
    var grid = h('div.nook-opts', { 'data-tut': 'nookOptions' });
    opts.forEach(function (o) {
      var b = h('button.nook-opt' + (o.available ? '' : '.dis'), { type: 'button', 'data-opt': o.id, on: { click: function () { pick(o); } } },
        h('span.rw-relic-ico', K.icon(ICON[o.id] || 'paw', 26)), h('span.rw-relic-t', h('b', o.label), h('span', o.text)));
      grid.appendChild(b);
    });
    host.appendChild(grid);
    growthRows();
  }
  K.register('nook', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
