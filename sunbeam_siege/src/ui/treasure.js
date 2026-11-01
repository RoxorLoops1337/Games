/* Treasure (C4): a cardboard box. Open it for a relic, or sit in it for Warmth and Fish. SB.run.treasure(run, 'open'|'sit').
 * No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run || run.status !== 'treasure') { F.toMap(); return; }
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    var pl = params.payload || {};
    var R = SB.data.rules || {};
    var canOpen = pl.canOpen !== undefined ? pl.canOpen : !!(run.current && run.current.relic);
    var sitPct = pl.sitHealPct || R.treasure_sit_heal_pct || 20, sitFish = pl.sitFish || R.treasure_sit_fish || 15;
    var inner = K.scaffold(root, 'narrow trs');
    var art = h('div.ev-art'); art.appendChild(SB.ui.scene.vignette('a cardboard box in the middle of the floor, one cat staring at it', { w: 160, h: 64, scale: 4, seed: 'box' + (run.current && run.current.nodeId), label: 'A cardboard box' }));
    inner.appendChild(art);
    inner.appendChild(K.screenHead('A cardboard box', 'It is empty, probably. It is also a box.'));
    var host = h('div.col', { style: 'gap:10px' }); inner.appendChild(host);

    function leave() { F.afterNode(); }
    function show(res, label, relic) {
      K.clear(host); SB.ui.topbar.refresh(); F.save();
      var card = h('div.panel.pad.ev-resultcard');
      card.appendChild(h('div.dim', { style: 'font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px' }, label));
      if (relic) {
        card.appendChild(h('div.rw-relic.sel', { style: '--rar:' + K.rarityColor(relic.rarity || 'common') }, h('span.rw-relic-ico', K.icon('relic', 28)), h('span.rw-relic-t', h('b', relic.name), h('small', K.cap(relic.rarity || 'common')), h('span', relic.text || ''), relic.flavor ? h('em', relic.flavor) : null)));
      } else {
        var txt = h('p.ev-resulttext'); card.appendChild(txt); K.typewriter(txt, res.text || '', { cps: 90 });
        card.appendChild(h('div.ev-chips', { style: 'margin-top:8px' }, res.healed ? h('span.pill-gain', '+' + res.healed + ' Warmth') : null, res.fish ? h('span.pill-gain', '+' + res.fish + ' Fish') : null));
      }
      host.appendChild(card);
      host.appendChild(h('div.rw-foot', K.btn('Back to the map', { icon: 'paw', tut: 'treasureLeave', onClick: leave })));
    }
    var box = h('div.trs-opts');
    var openB = h('button.nook-opt' + (canOpen ? '' : '.dis'), { type: 'button', 'data-opt': 'open', on: { click: function () {
      if (!canOpen) { K.toast('Nothing inside. The box is just a box.', ''); return; }
      K.click(); K.sfx('relic_get');
      var res = SB.run.treasure(run, 'open');
      if (res.relic) show(res, 'You open the box', res.relic); else show({ text: 'It is empty. It was always going to be empty.' }, 'You open the box');
    } } }, h('span.rw-relic-ico', K.icon('chest', 26)), h('span.rw-relic-t', h('b', 'Open it'), h('span', canOpen ? 'There is a relic in there. You can hear it.' : 'Nothing is left to find.')));
    var sitB = h('button.nook-opt', { type: 'button', 'data-opt': 'sit', on: { click: function () {
      K.click();
      var go = function () { var res = SB.run.treasure(run, 'sit'); K.sfx('heal'); show(res, 'You sit in the box'); };
      if (canOpen) K.confirm({ title: 'Sit in the box?', text: 'You leave the relic behind. The box is very comfortable.', ok: 'Sit', cancel: 'Wait' }).then(function (y) { if (y) go(); }); else go();
    } } }, h('span.rw-relic-ico', K.icon('cushion', 26)), h('span.rw-relic-t', h('b', 'Sit in it'), h('span', 'Heal ' + sitPct + '% of max Warmth and find ' + sitFish + ' Fish. The relic can wait. It will not.')));
    box.appendChild(openB); box.appendChild(sitB); host.appendChild(box);
  }
  K.register('treasure', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
