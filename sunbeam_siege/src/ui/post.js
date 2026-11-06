/* Scratching Post (C4): choose a card, see before and after, pick a scratch, fork or plus. One free pick per visit,
 * more for Fish. Also champion tiers, Growth Spurt and Legend Ceremony, Whittle and Knead.
 * Rules live in SB.post (C2): options, reroll, scratch, fork, plus, whittle, knead, championTierState, championTier,
 * evolvable, growthSpurt, legendCeremony. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run || run.status !== 'post') { F.toMap(); return; }
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    var P = SB.post, U = SB.run.U;
    var post = run.current.post || (run.current.post = { freeUsed: false, rerolls: 0, offers: {} });
    var open = params.payload && params.payload.material ? params.payload : P.open ? { material: P.material(run), maxTier: P.maxTier(run), nookLite: false, services: P.services(run) } : {};
    var inner = K.scaffold(root, 'wide post');

    var statusEl = h('span.chip');
    inner.appendChild(K.screenHead(P.material(run), 'Scratch a card. The first one each visit is free.', [statusEl, K.btn('Leave', { kind: 'alt', icon: 'back', tut: 'postLeave', onClick: function () { F.afterNode(); } })]));
    if (params.payload && params.payload.nookLite) {
      inner.appendChild(h('div.panel.pad', h('h3', 'Nothing to scratch'), h('p', 'Every card here is already as sharp as it gets. You had a lie down on the post instead (+' + (params.payload.healed || 0) + ' Warmth).')));
      inner.appendChild(h('div.rw-foot', K.btn('Onward', { icon: 'paw', onClick: function () { F.afterNode(); } })));
      return;
    }
    var tabs = h('div.tabs', { role: 'tablist' });
    var host = h('div.post-host');
    inner.appendChild(tabs); inner.appendChild(host);
    var tab = 'scratch';
    var drawn = {};

    function refresh() { SB.ui.topbar.refresh(); F.save(); drawAll(); }
    function drawStatus() {
      statusEl.className = 'chip ' + (post.freeUsed ? '' : 'gold');
      K.clear(statusEl); statusEl.appendChild(K.icon(post.freeUsed ? 'check' : 'star', 12)); statusEl.appendChild(document.createTextNode(post.freeUsed ? ' Free scratch used' : ' Free scratch ready'));
    }
    function tabList() {
      var t = [['scratch', 'Scratch', 'hammer']];
      var cs = P.championTierState(run);
      if (cs && cs.next && cs.buyable) t.push(['champion', 'Champion', 'crown']);
      var grow = P.evolvable(run);
      if (grow.length) t.push(['grow', 'Grow', 'sparkle']);
      t.push(['workshop', 'Workshop', 'cog']);
      return t;
    }
    function drawTabs() {
      K.clear(tabs);
      var list = tabList(); if (!list.some(function (t) { return t[0] === tab; })) tab = 'scratch';
      list.forEach(function (t) { tabs.appendChild(h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(tab === t[0]), on: { click: function () { K.click(); tab = t[0]; drawAll(); } } }, K.icon(t[2], 14), t[1])); });
    }
    function drawAll() { drawStatus(); drawTabs(); K.clear(host); ({ scratch: drawScratch, champion: drawChampion, grow: drawGrow, workshop: drawWorkshop })[tab](host); }

    // ------------------------------------------------------------ scratch tab
    function drawScratch(box) {
      var cards = run.deck.slice();
      var sorted = cards.map(function (i) { return { i: i, ok: P.isUpgradeable(run, i) }; }).sort(function (a, b) { return (b.ok - a.ok); });
      box.appendChild(h('p.dim', { style: 'margin-bottom:8px' }, 'Tap a card to see what the post offers. ' + (P.maxTier(run) < 3 ? 'This post is only ' + P.material(run).toLowerCase().replace(' post', '') + ', so the best scratches wait for a harder one.' : '')));
      var grid = h('div.grid-cards', { 'data-tut': 'postCards' });
      sorted.forEach(function (x) {
        var c = K.cardEl(x.i, { size: 'mini', onClick: function () { if (!x.ok) { K.toast('Nothing left to scratch on that one.', ''); return; } openOffers(x.i.uid); } });
        var cell = h('div.post-cell' + (x.ok ? '' : '.dim'), c, x.ok ? h('span.post-slots', P.usedSlots(x.i) + '/' + P.slotsOf(run, x.i)) : null);
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    }

    function preview(inst, offer, forkId, replaceIdx) {
      var c = clone(inst);
      c.scratches = (c.scratches || []).slice();
      if (offer.kind === 'scratch') { if (typeof replaceIdx === 'number') c.scratches.splice(replaceIdx, 1); c.scratches.push(offer.id); }
      else if (offer.kind === 'plus') c.plus = true;
      else if (offer.kind === 'fork') c.fork = forkId;
      return c;
    }

    function openOffers(uid) {
      var inst = U.inst(run, uid); if (!inst) return;
      var body = h('div.po-body'), dlg;
      var data = P.options(run, uid);
      var selOffer = null, selFork = null, replaceIdx = null;
      function paint() {
        K.clear(body);
        inst = U.inst(run, uid);
        var after = h('div.po-after');
        var beforeEl = h('div.po-col', h('div.po-lbl', 'Now'), K.cardEl(inst, { size: 'reward', noFocus: true }));
        var afterEl = h('div.po-col', h('div.po-lbl', 'After'), after);
        function paintAfter() {
          K.clear(after);
          if (!selOffer) { after.appendChild(h('div.po-ghost', h('span.dim', 'Pick a scratch'))); return; }
          after.appendChild(K.cardEl(preview(inst, selOffer, selFork, replaceIdx), { size: 'reward', noFocus: true }));
        }
        body.appendChild(h('div.po-cards', beforeEl, h('span.po-arrow', K.icon('plus', 18)), afterEl));
        paintAfter();
        var slotsTxt = 'Slots ' + P.usedSlots(inst) + '/' + P.slotsOf(run, inst) + (inst.scratches && inst.scratches.length ? '. Scratched: ' + inst.scratches.map(function (s) { return (K.upgrade(s) || {}).name || s; }).join(', ') : '') + (inst.fork ? '. Fork: ' + inst.fork : '');
        body.appendChild(h('p.faint', { style: 'font-size:12px;margin:6px 0' }, slotsTxt));
        var list = h('div.col', { style: 'gap:6px' });
        var buyBtn;
        function setBtn() {
          var cost = costOf(selOffer);
          buyBtn.disabled = !selOffer || (cost > run.fish) || (selOffer && selOffer.kind === 'fork' && !selFork) || (selOffer && selOffer.replace && replaceIdx == null);
          buyBtn.querySelector('.lbl').textContent = !selOffer ? 'Choose a scratch' : (cost === 0 ? 'Scratch it (free)' : (cost > run.fish ? 'Need ' + (cost - run.fish) + ' more Fish' : 'Scratch it for ' + cost));
        }
        function costOf(o) {
          if (!o) return 0;
          if (!post.freeUsed) return 0;
          var c = o.kind === 'fork' ? ((o.options.filter(function (f) { return f.id === selFork; })[0] || o.options[0]).cost || 90) : o.cost;
          return o.replace ? Math.round(c * 1.5) : c;
        }
        data.offers.forEach(function (o) {
          var rowCls = 'po-offer' + (selOffer === o ? '.sel' : '');
          if (o.kind === 'fork') {
            var fbox = h('div.po-offer.fork' + (selOffer === o ? '.sel' : ''), h('div.po-ofhead', K.icon('scroll', 16), h('b', 'Fork: choose a branch'), h('span.chip', 'Special')));
            o.options.forEach(function (f) {
              fbox.appendChild(h('button.po-fork' + (selOffer === o && selFork === f.id ? '.on' : ''), { type: 'button', on: { click: function () { K.click(); selOffer = o; selFork = f.id; paint(); } } }, h('b', f.name), h('span', f.text), f.flavor ? h('em', f.flavor) : null));
            });
            list.appendChild(fbox); return;
          }
          var tierLbl = o.kind === 'scratch' ? 'Tier ' + o.tier : 'Card upgrade';
          var btn = h('button.' + rowCls.split('.').join('.'), { type: 'button', on: { click: function () {
            K.click(); selOffer = o; selFork = null; replaceIdx = null;
            if (o.replace) {
              var ch = (inst.scratches || []).map(function (s, i) { return [i, (K.upgrade(s) || {}).name || s]; });
              var dd; var bx = h('div.col', { style: 'gap:6px' }, h('p.dim', 'No free slot. Pick a scratch to sand away (costs 50 percent more).'));
              ch.forEach(function (c) { bx.appendChild(K.btn(c[1], { kind: 'alt', onClick: function () { dd.close(); replaceIdx = c[0]; paint(); } })); });
              dd = K.dialog({ title: 'Replace which scratch?', body: bx, sheet: true, onClose: function () { if (replaceIdx == null) { selOffer = null; paint(); } } });
            }
            paint();
          } } }, h('div.po-ofhead', K.icon(o.kind === 'plus' ? 'sparkle' : 'hammer', 16), h('b', o.name), h('span.faint', tierLbl)), h('span.po-oftext', o.text || ''), o.flavor ? h('em.faint', o.flavor) : null,
          h('span.po-ofprice' + ((post.freeUsed ? o.cost : 0) > run.fish ? '.poor' : ''), post.freeUsed ? [K.icon('fish', 12), String(o.replace ? Math.round(o.cost * 1.5) : o.cost)] : 'Free pick'));
          list.appendChild(btn);
        });
        if (!data.offers.length) list.appendChild(h('p.dim', 'The post has nothing for this card today.'));
        body.appendChild(list);
        var foot = h('div.row.gap-s.wrap', { style: 'margin-top:10px;justify-content:space-between' });
        buyBtn = h('button.btn', { type: 'button', 'data-tut': 'postApply' }, K.icon('hammer', 16), h('span.lbl', 'Choose a scratch'));
        buyBtn.addEventListener('click', function () { if (!selOffer) return; K.click(); apply(); });
        var rr = K.btn('Reroll (' + data.rerollPrice + ')', { kind: 'alt', icon: 'reroll', disabled: data.rerollsLeft <= 0 || run.fish < data.rerollPrice, onClick: function () {
          var res = P.reroll(run, uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; }
          data = res.options; selOffer = null; selFork = null; replaceIdx = null; SB.ui.topbar.refresh(); paint();
        } });
        foot.appendChild(rr); foot.appendChild(buyBtn); body.appendChild(foot);
        setBtn();
        function apply() {
          var res;
          if (selOffer.kind === 'scratch') res = P.scratch(run, uid, selOffer.id, { replace: replaceIdx == null ? undefined : replaceIdx });
          else if (selOffer.kind === 'plus') res = P.plus(run, uid);
          else res = P.fork(run, uid, selFork);
          if (!res.ok) { K.toast(res.reason || 'That did not take.', 'bad'); return; }
          K.sfx('scratch'); K.sfx('card_add');
          dlg.close(); K.toast(K.cardName(U.inst(run, uid)) + ' is sharper now.', 'good'); refresh();
        }
      }
      dlg = K.dialog({ title: 'Scratch ' + K.cardName(inst), body: body, wide: true });
      paint();
    }

    // ------------------------------------------------------------ champion tab
    function drawChampion(box) {
      var cs = P.championTierState(run);
      if (!cs.next) { box.appendChild(h('p.dim', 'All three champion tiers are taken.')); return; }
      var champ = U.champion(run), cdef = champ && K.card(champ.id);
      box.appendChild(h('div.panel.pad', h('h3', (cdef ? cdef.name + ': ' : '') + 'Tier ' + cs.next), h('p.dim', cs.free ? 'This tier is open for free.' : 'Open this tier early for ' + cs.price + ' Fish.')));
      var list = h('div.col', { style: 'gap:8px;margin-top:10px' });
      cs.options.forEach(function (o) {
        var can = cs.free || run.fish >= cs.price;
        var b = h('button.rw-relic' + (can ? '' : '.dis'), { type: 'button', style: '--rar:' + K.rarityColor('champion') },
          h('span.rw-relic-ico.path', String(o.path || '?')), h('span.rw-relic-t', h('b', o.name), h('small', 'Path ' + (o.path || '')), h('span', o.text || ''), o.flavor ? h('em', o.flavor) : null));
        b.addEventListener('click', function () {
          if (!can) { K.toast('Not enough Fish.', 'bad'); return; }
          K.confirm({ title: o.name, text: o.text + (cs.free ? '' : ' Cost: ' + cs.price + ' Fish.'), ok: 'Take it' }).then(function (y) {
            if (!y) return; var res = P.championTier(run, o.id); if (!res.ok) { K.toast(res.reason, 'bad'); return; }
            K.sfx('relic_get'); K.toast((res.finalForm ? 'Final form unlocked: ' + res.finalForm.name : 'Tier taken: ' + o.name), 'good'); refresh();
          });
        });
        list.appendChild(b);
      });
      box.appendChild(list);
    }

    // ------------------------------------------------------------ grow tab
    function drawGrow(box) {
      var list = P.evolvable(run);
      if (!list.length) { box.appendChild(h('p.dim', 'Nobody is ready to grow yet. Keep playing them.')); return; }
      list.forEach(function (e) {
        var legend = e.kind === 'legend';
        var row = h('div.panel.pad.po-grow', h('h3', legend ? 'Legend Ceremony' : 'Growth Spurt'),
          h('div.po-cards', h('div.po-col', K.cardEl(e.from, { size: 'reward', noFocus: true })), h('span.po-arrow', K.icon('plus', 18)), h('div.po-col', K.cardEl(e.to, { size: 'reward', noFocus: true }))),
          h('p.dim', legend ? 'The quest is done. The ceremony is mostly standing around solemnly.' : 'It ate well and slept well. The rest follows.'));
        var cost = legend ? (e.price || 0) : 0;
        row.appendChild(K.btn(legend ? 'Hold the ceremony' + (cost ? ' (' + cost + ')' : '') : 'Stretch (free)', { icon: 'sparkle', disabled: cost > run.fish, onClick: function () {
          var res = legend ? P.legendCeremony(run, e.uid) : P.growthSpurt(run, e.uid);
          if (!res.ok) { K.toast(res.reason, 'bad'); return; }
          K.sfx('relic_get'); K.toast(res.text || 'It is bigger now.', 'good'); refresh();
        } }));
        box.appendChild(row);
      });
    }

    // ------------------------------------------------------------ workshop tab
    function pickCard(title, filter, fn) {
      var cards = run.deck.filter(filter);
      if (!cards.length) { K.toast('No card fits that.', 'bad'); return; }
      SB.ui.openDeck(run, { cards: cards, title: title, pick: function (inst) { fn(inst); return true; } });
    }
    function drawWorkshop(box) {
      var s = P.services(run), grid = h('div.sh-svcs');
      function row(icon, name, text, price, fn) {
        var can = price <= run.fish;
        return h('button.sh-svc' + (can ? '' : '.dis'), { type: 'button', on: { click: function () { if (!can) { K.toast('Not enough Fish.', 'bad'); return; } K.click(); fn(); } } },
          h('span.rw-relic-ico', K.icon(icon, 24)), h('span.rw-relic-t', h('b', name), h('span', text)), h('span.sh-price' + (can ? '' : '.poor'), K.icon('fish', 14), h('b.num', String(price))));
      }
      grid.appendChild(row('hammer', 'Whittle a slot', 'Carve one extra scratch slot into a card (three at most).', s.whittle.price, function () {
        pickCard('Whittle which card?', function (i) { return P.slotsOf(run, i) > 0 && !i.whittled && P.slotsOf(run, i) < 3 + (K.card(i.id).type === 'champion' ? 1 : 0); }, function (inst) {
          var res = P.whittle(run, inst.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('scratch'); K.toast(K.cardName(inst) + ' has ' + res.slots + ' slots.', 'good'); refresh();
        });
      }));
      grid.appendChild(row('paw', 'Knead a card', '+1 Attack, Health or value for good. Two per card, per Post.', s.knead.price, function () {
        pickCard('Knead which card?', function (i) { var d = K.card(i.id); return d && d.type !== 'curse' && d.rarity !== 'token' && (i.postKneads || 0) < (s.knead.maxPerCard || 2); }, function (inst) {
          var d = K.card(inst.id), unit = d.type === 'unit' || d.type === 'champion';
          var go = function (stat) { var r = P.knead(run, inst.uid, stat); if (!r.ok) K.toast(r.reason, 'bad'); else { K.sfx('scratch'); refresh(); } };
          if (!unit) { go('value'); return; }
          var dd, bx = h('div.row.gap-s', { style: 'justify-content:center' }, K.btn('+1 Attack', { onClick: function () { dd.close(); go('attack'); } }), K.btn('+1 Health', { onClick: function () { dd.close(); go('health'); } }));
          dd = K.dialog({ title: 'Knead ' + K.cardName(inst), body: bx, sheet: true });
        });
      }));
      box.appendChild(grid);
    }

    drawAll();
    if (run.tutorial && SB.tutorial && SB.tutorial.onPostShown) scope.timeout(function () { SB.tutorial.onPostShown(root); }, 300);
  }

  K.register('post', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
