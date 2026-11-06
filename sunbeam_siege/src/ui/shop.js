/* Gerald's Back Alley Bazaar (C4). Tabs: Cards, Relics, Gear, Supplies, Services, Back room.
 * All rules live in SB.shop (C2): view, buy(run, item, args), haggle, remove, warmMilk, reroll, sell, boxSwap, litter, whittle, knead.
 * Targets (a card or a cat) are chosen with SB.ui.openDeck. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  var KIND_ICON = { charm: 'tag', stall: 'hammer', voucher: 'scroll', consumable: 'tuna', black: 'dice' };
  var TAB_DEFS = [
    ['cards', 'Cards', 'deck'], ['relics', 'Relics', 'relic'], ['gear', 'Gear', 'hammer'], ['supplies', 'Supplies', 'tuna'], ['services', 'Services', 'cog'], ['back', 'Back room', 'dice']
  ];

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run || run.status !== 'shop') { F.toMap(); return; }
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    var view = SB.shop.view(run);
    var tab = (params.tab) || 'cards';
    var inner = K.scaffold(root, 'wide shop');
    var gerald = SB.data.story && SB.data.story.gerald || {};

    // ------------------------------------------------------------ Gerald + banter
    var bubble = h('div.sh-say', h('span.sh-name', 'Gerald'), h('p.sh-line', { 'aria-live': 'polite' }));
    var portrait = h('div.sh-portrait', K.pest({ id: 'pest_raccoon', size: 2, art: 'chunky raccoon' }, { scale: 4 }));
    var fishChip = h('div.sh-fish', { 'data-tut': 'shopFish' }, K.icon('fish', 18), h('b.num', String(run.fish)));
    var head = h('div.sh-head', portrait, bubble, fishChip);
    inner.appendChild(head);
    var typer = null;
    function say(text, quick) {
      var el = bubble.querySelector('.sh-line');
      if (typer) typer.stop();
      if (!text) { el.textContent = ''; return; }
      typer = quick ? null : K.typewriter(el, text, { cps: 70 });
      if (quick) el.textContent = text;
    }
    say(view.greeting + (view.mood ? ' ' + view.mood : ''));

    var tabsEl = h('div.tabs', { role: 'tablist', 'data-tut': 'shopTabs' });
    var host = h('div.sh-host');
    inner.appendChild(tabsEl); inner.appendChild(host);
    var leaveBtn = K.btn('Leave the bazaar', { kind: 'alt', icon: 'back', tut: 'shopLeave', onClick: function () {
      var unspent = run.fish >= 100;
      var go = function () { F.afterNode(); };
      go();
    } });
    root.classList.add('has-foot');
    root.appendChild(h('div.rw-foot', leaveBtn));

    function refresh(msg, keepTab) {
      view = SB.shop.view(run);
      SB.ui.topbar.refresh(); F.save();
      fishChip.querySelector('b').textContent = String(run.fish);
      fishChip.classList.remove('bump'); void fishChip.offsetWidth; fishChip.classList.add('bump');
      if (msg !== undefined) say(msg);
      drawTabs(); drawTab();
    }
    function tabsAvailable() {
      return TAB_DEFS.filter(function (t) { return t[0] !== 'back' || view.black; });
    }
    function drawTabs() {
      K.clear(tabsEl);
      tabsAvailable().forEach(function (t) {
        var n = countFor(t[0]);
        tabsEl.appendChild(h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(tab === t[0]), on: { click: function () { K.click(); tab = t[0]; drawTabs(); drawTab(); } } }, K.icon(t[2], 14), t[1], n != null ? h('span.cnt', String(n)) : null));
      });
    }
    function itemsOf(t) {
      var st = view.stock;
      if (t === 'cards') return st.filter(function (i) { return i.kind === 'card'; });
      if (t === 'relics') return st.filter(function (i) { return i.kind === 'relic'; });
      if (t === 'gear') return st.filter(function (i) { return i.kind === 'charm' || i.kind === 'stall' || i.kind === 'voucher'; });
      if (t === 'supplies') return st.filter(function (i) { return i.kind === 'consumable'; });
      if (t === 'back') return view.black ? view.black.items : [];
      return [];
    }
    function countFor(t) { if (t === 'services') return null; return itemsOf(t).filter(function (i) { return !i.sold; }).length; }

    // ------------------------------------------------------------ tiles
    function priceTag(it) {
      var p = it.finalPrice != null ? it.finalPrice : it.price;
      var box = h('span.sh-price' + (p > run.fish ? '.poor' : ''), K.icon('fish', 14), h('b.num', p === 0 ? 'Free' : String(p)));
      if (it.sale && it.was && it.was > p) box.appendChild(h('s.was', String(it.was)));
      return box;
    }
    function tile(it) {
      var def = null, kids = [];
      var cls = 'sh-tile k-' + it.kind + (it.sold ? ' sold' : '') + (it.sale ? ' sale' : '');
      if (it.kind === 'card') {
        kids.push(h('div.sh-cardwrap', K.cardEl(it.id, { size: 'reward', noFocus: true })));
      } else {
        var rar = it.rarity || (it.kind === 'black' ? 'rare' : 'common');
        var ico = it.kind === 'relic' ? K.icon('relic', 28) : K.icon(KIND_ICON[it.kind] || 'tag', 26);
        kids.push(h('div.sh-plain', { style: '--rar:' + K.rarityColor(rar) }, h('span.rw-relic-ico', ico), h('span.rw-relic-t', h('b', it.name), h('small', it.kind === 'stall' ? 'Scratch, tier ' + it.tier : (it.kind === 'relic' ? K.cap(rar) : (it.kind === 'black' ? 'Back room' : K.cap(it.kind)))), h('span', it.text || ''))));
      }
      var b = h('button' + '.' + cls.split(' ').join('.'), { type: 'button', 'data-item': it.slot || it.id, 'aria-label': it.name + (it.sold ? ', sold' : ', ' + (it.finalPrice != null ? it.finalPrice : it.price) + ' Fish') }, kids, priceTag(it));
      if (it.sale) b.appendChild(h('span.sh-sale', 'Sale'));
      if (it.sold) b.appendChild(h('span.sh-soldtag', 'Sold'));
      b.addEventListener('click', function () { K.click(); openItem(it); });
      return b;
    }

    // ------------------------------------------------------------ buying
    function eligible(it) {
      var P = SB.post;
      if (it.kind === 'stall') { var up = K.upgrade(it.id); return run.deck.filter(function (i) { return up && P.canApply(run, i, up, { ignoreTier: true }).ok; }); }
      if (it.kind === 'charm') { var ch = SB.rewards.charmDef(it.id); return run.deck.filter(function (i) { return SB.rewards.charmFits(i, ch); }); }
      if (it.kind === 'voucher') return run.deck.filter(function (i) { return !i.fork && P.freeSlots(run, i) > 0 && P.forksFor(run, i).length; });
      if (it.needs === 'cat') return SB.run.U.cats(run);
      return run.deck;
    }
    function afterBuy(res, it) {
      if (!res.ok) { K.toast(res.reason || 'Gerald shrugs.', 'bad'); if (res.banter) say(res.banter); return; }
      K.sfx(it.kind === 'relic' ? 'relic_get' : 'shop_buy');
      var bits = [];
      if (res.relic) bits.push('You now own ' + res.relic.name + '.');
      if (res.championTierNow) bits.push('A champion tier is open. Check the Scratching Post, or the next reward.');
      if (bits.length) K.toast(bits.join(' '), 'good');
      refresh(res.banter || '');
    }
    function doBuy(it, args) {
      var res;
      try { res = SB.shop.buy(run, it.slot || it.id, args || {}); } catch (e) { K.toast(String(e.message || e), 'bad'); return; }
      afterBuy(res, it);
    }
    function buy(it) {
      var price = it.finalPrice != null ? it.finalPrice : it.price;
      if (it.needs) {
        var cands = eligible(it);
        if (!cands.length) { K.toast(it.kind === 'voucher' ? 'No card of yours has a Fork to take.' : 'Nothing in your deck can use that.', 'bad'); return; }
        SB.ui.openDeck(run, { cards: cands, title: it.kind === 'consumable' ? 'Who gets the ' + it.name + '?' : 'Choose a card for ' + it.name, pick: function (inst) {
          if (it.kind === 'voucher') { chooseFork(it, inst); return true; }
          if (it.kind === 'black' && it.id === 'bm_forbidden_tuna') {
            K.confirm({ title: 'Forbidden Tuna', text: it.text + ' This will add a curse to your deck.', ok: 'Do it', danger: true }).then(function (y) { if (y) doBuy(it, { uid: inst.uid }); });
            return true;
          }
          doBuy(it, { uid: inst.uid }); return true;
        } });
        return;
      }
      if (price > run.fish && it.kind === 'black') {
        var trade = run.deck.filter(function (i) { var d = K.card(i.id); return d && d.type !== 'champion'; });
        if (trade.length) {
          K.confirm({ title: 'Not enough Fish', text: 'Gerald will take a card in trade, worth three times a normal sale. Pick one?', ok: 'Pick a card', cancel: 'No' }).then(function (y) {
            if (y) SB.ui.openDeck(run, { cards: trade, title: 'Trade which card?', pick: function (inst) { doBuy(it, { tradeUid: inst.uid }); return true; } });
          });
          return;
        }
      }
      doBuy(it);
    }
    function chooseFork(it, inst) {
      var forks = SB.post.forksFor(run, inst);
      var body = h('div.col', { style: 'gap:8px' });
      var d;
      forks.forEach(function (f) { body.appendChild(h('button.rw-relic', { type: 'button', on: { click: function () { d.close(); doBuy(it, { uid: inst.uid, forkId: f.id }); } } }, h('span.rw-relic-ico', K.icon('scroll', 24)), h('span.rw-relic-t', h('b', f.name), h('span', f.text || ''), f.flavor ? h('em', f.flavor) : null))); });
      d = K.dialog({ title: 'Which fork for ' + K.cardName(inst) + '?', body: body, sheet: true });
    }
    function openItem(it) {
      var d, price = it.finalPrice != null ? it.finalPrice : it.price;
      var body = h('div.col', { style: 'gap:10px' });
      if (it.kind === 'card') body.appendChild(h('div.row', { style: 'justify-content:center' }, K.cardEl(it.id, { size: 'detail', detail: true })));
      else {
        body.appendChild(h('p', { style: 'font-size:calc(15px*var(--text-scale));line-height:1.45' }, it.text || ''));
        if (it.flavor) body.appendChild(h('p.dim', { style: 'font-style:italic' }, it.flavor));
        if (it.kind === 'relic') { var rd = K.relic(it.id); if (rd && rd.flavor) body.appendChild(h('p.dim', { style: 'font-style:italic' }, rd.flavor)); }
      }
      var foot = [];
      var canPay = price <= run.fish || (it.kind === 'black');
      if (it.sold) foot.push(h('span.dim', 'Sold.'));
      else {
        var buyB = K.btn(price === 0 ? 'Take it (free)' : 'Buy for ' + price, { icon: 'fish', disabled: price > run.fish && it.kind !== 'black', tut: 'shopBuy', onClick: function () { d.close(); buy(it); } });
        foot.push(buyB);
        if (!it.haggle && it.kind !== 'black' && view.services.haggle && view.services.haggle.available && !it.loyalty) {
          foot.unshift(K.btn('Haggle (' + view.services.haggle.price + ')', { kind: 'alt', disabled: run.fish < view.services.haggle.price, onClick: function () {
            var res = SB.shop.haggle(run, it.slot || it.id);
            if (!res.ok) { K.toast(res.reason, 'bad'); return; }
            d.close(); K.toast(res.success ? 'Gerald blinks first. Discount.' : 'Gerald is offended. Surcharge.', res.success ? 'good' : 'bad'); refresh(res.banter || '');
          } }));
        }
        if (price > run.fish && it.kind !== 'black') foot.unshift(h('span.faint', { style: 'font-size:12px;align-self:center' }, 'Need ' + (price - run.fish) + ' more Fish'));
      }
      d = K.dialog({ title: it.name, body: body, footer: foot, sheet: it.kind !== 'card' });
    }

    // ------------------------------------------------------------ services
    function pickCard(title, filter, fn, o) {
      var cards = run.deck.filter(filter || function () { return true; });
      if (!cards.length) { K.toast('No card fits that.', 'bad'); return; }
      SB.ui.openDeck(run, Object.assign({ cards: cards, title: title, pick: function (inst) { fn(inst); return true; } }, o || {}));
    }
    function svcRow(icon, name, text, price, fn, o) {
      o = o || {};
      var can = !o.disabled && (price == null || price <= run.fish);
      var b = h('button.sh-svc' + (can ? '' : '.dis'), { type: 'button', 'aria-disabled': can ? null : 'true', on: { click: function () { if (!can) { K.toast(o.disabled ? (o.why || 'Not now.') : 'Not enough Fish.', 'bad'); return; } K.click(); fn(); } } },
        h('span.rw-relic-ico', K.icon(icon, 24)), h('span.rw-relic-t', h('b', name), h('span', text)),
        price != null ? h('span.sh-price' + (price > run.fish ? '.poor' : ''), K.icon('fish', 14), h('b.num', price === 0 ? 'Free' : String(price))) : null);
      return b;
    }
    function drawServices(box) {
      var s = view.services, grid = h('div.sh-svcs');
      grid.appendChild(svcRow('close', 'Shoo a card', 'Adopt one out. Gets pricier each time. Scratches refund 10 Fish each.', s.shoo.price, function () {
        pickCard('Adopt out which card?', function (i) { return SB.run.U.canRemove(run, i).ok; }, function (inst) {
          K.confirm({ title: 'Adopt out ' + K.cardName(inst) + '?', text: 'It will be loved, somewhere else. Cost: ' + (s.shoo.price || 0) + ' Fish.', ok: 'Shoo' }).then(function (y) {
            if (!y) return; var res = SB.shop.remove(run, inst.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('shop_buy'); refresh(res.banter || res.text);
          });
        });
      }, { tut: 'shoo' }));
      grid.appendChild(svcRow('heart', 'Warm milk', 'Heal ' + s.warm_milk.heal + ' Warmth. One saucer per visit.', s.warm_milk.price, function () {
        var res = SB.shop.warmMilk(run); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('heal'); refresh(res.banter);
      }, { disabled: !s.warm_milk.available, why: 'One saucer per visit.' }));
      grid.appendChild(svcRow('reroll', 'Reroll the cards', 'Gerald digs out a fresh set of cards. The price climbs.', s.reroll.price, function () {
        var res = SB.shop.reroll(run); if (!res.ok) { K.toast(res.reason, 'bad'); return; } tab = 'cards'; refresh(res.banter);
      }));
      grid.appendChild(svcRow('hammer', 'Whittle a slot', 'Add one scratch slot to a card (max 3).', s.whittle.price, function () {
        pickCard('Whittle which card?', function (i) { return SB.post.slotsOf(run, i) > 0 && !i.whittled && SB.post.slotsOf(run, i) < 3 + (K.card(i.id).type === 'champion' ? 1 : 0); }, function (inst) {
          var res = SB.shop.whittle(run, inst.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('shop_buy'); K.toast(K.cardName(inst) + ' now has ' + res.slots + ' slots.', 'good'); refresh('');
        });
      }));
      grid.appendChild(svcRow('paw', 'Knead a card', '+1 to a stat, for good. Two per card at most.', s.knead.price, function () {
        pickCard('Knead which card?', function (i) { var d = K.card(i.id); return d && d.type !== 'curse' && d.rarity !== 'token' && (i.postKneads || 0) < 2; }, function (inst) {
          var d = K.card(inst.id), unit = d.type === 'unit' || d.type === 'champion';
          if (!unit) { var res0 = SB.shop.knead(run, inst.uid, 'value'); if (!res0.ok) K.toast(res0.reason, 'bad'); else { K.sfx('shop_buy'); refresh(''); } return; }
          var dd; var body = h('div.row.gap-s', { style: 'justify-content:center' },
            K.btn('+1 Attack', { onClick: function () { dd.close(); var r = SB.shop.knead(run, inst.uid, 'attack'); if (!r.ok) K.toast(r.reason, 'bad'); else { K.sfx('shop_buy'); refresh(''); } } }),
            K.btn('+1 Health', { onClick: function () { dd.close(); var r = SB.shop.knead(run, inst.uid, 'health'); if (!r.ok) K.toast(r.reason, 'bad'); else { K.sfx('shop_buy'); refresh(''); } } }));
          dd = K.dialog({ title: 'Knead ' + K.cardName(inst), body: body, sheet: true });
        });
      }));
      grid.appendChild(svcRow('dice', 'Box swap', 'Swap a card for another of the same rarity. It is a box now.', s.box_swap.price, function () {
        pickCard('Box swap which card?', function (i) { return SB.post.boxSwapChoices(run, i.uid, 'x').length > 0; }, function (inst) {
          var pv = SB.shop.boxSwap(run, inst.uid); if (!pv.ok) { K.toast(pv.reason, 'bad'); return; }
          var dd; var row = h('div.rw-cards');
          pv.choices.forEach(function (id) { row.appendChild(h('button.rw-card-tap', { type: 'button', on: { click: function () { dd.close(); var r = SB.shop.boxSwap(run, inst.uid, id); if (!r.ok) K.toast(r.reason, 'bad'); else { K.sfx('shop_buy'); refresh(r.text); } } } }, K.cardEl(id, { size: 'reward', noFocus: true }))); });
          dd = K.dialog({ title: 'Pick what it becomes', body: h('div.col', h('p.dim', 'Cost ' + pv.price + ' Fish. Scratches that still fit stay on.'), row), wide: true });
        });
      }));
      grid.appendChild(svcRow('sparkle', 'Litter', 'Copy a card, scratches and all. Congratulations, it is two.', s.litter.price, function () {
        pickCard('Which card has kittens?', function (i) { return SB.post.canLitter(run, i).ok; }, function (inst) {
          var res = SB.shop.litter(run, inst.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('card_add'); refresh(res.text);
        });
      }));
      var sellN = Math.round((s.sell.common || 8) * s.sell.mult), sellO = Math.round((s.sell.other || 20) * s.sell.mult);
      grid.appendChild(svcRow('tag', 'Sell a card', 'Common cards fetch ' + sellN + ' Fish, the rest ' + sellO + '.', null, function () {
        pickCard('Sell which card?', function (i) { return SB.run.U.canRemove(run, i).ok; }, function (inst) {
          K.confirm({ title: 'Sell ' + K.cardName(inst) + '?', text: 'Gerald will pay cash. It will not be seen again.', ok: 'Sell' }).then(function (y) {
            if (!y) return; var res = SB.shop.sell(run, inst.uid); if (!res.ok) { K.toast(res.reason, 'bad'); return; } K.sfx('fish_gain'); refresh(res.banter);
          });
        });
      }));
      box.appendChild(grid);
    }

    function drawTab() {
      K.clear(host);
      if (tab === 'services') { drawServices(host); return; }
      var items = itemsOf(tab);
      if (tab === 'back' && view.black) host.appendChild(h('p.dim.sh-intro', view.black.intro));
      if (tab === 'gear') host.appendChild(h('p.dim.sh-intro', 'Collar Charms, scratches from the post stall, and Fork Vouchers. Each goes on one card.'));
      if (!items.length) { host.appendChild(h('p.dim.center', { style: 'padding:30px' }, 'Nothing here today. Gerald is as surprised as you.')); return; }
      var grid = h('div.sh-grid.t-' + tab);
      items.forEach(function (it) { grid.appendChild(tile(it)); });
      host.appendChild(grid);
    }
    drawTabs(); drawTab();
    if (view.preBoss) host.parentNode.insertBefore(h('p.faint.center', { style: 'font-size:12px;margin-bottom:6px' }, 'The last shop before the boss. Gerald has a rare card out the back.'), tabsEl);
  }

  K.register('shop', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
