/* Reward screen (C4): winnings, card draft (take or skip for Fish), relic, Collar Charm, champion tier, growth report.
 * The battle screen sends {run, result}. This screen calls SB.run.finishBattle(run, result) once, then resolves each
 * row through SB.run.pickCard / pickRelic / pickCharm / claimChampionUpgrade / skip and leaves with SB.ui.flow.rewardDone().
 * A saved run sitting in the reward state re-enters with run.pending.payload. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function relicTile(id, o) {
    o = o || {};
    var def = K.relic(id) || { id: id, name: id, text: '', rarity: 'common' };
    var rar = def.rarity || 'common';
    var b = h('button.rw-relic' + (o.sel ? '.sel' : ''), { type: 'button', style: '--rar:' + K.rarityColor(rar), 'data-relic': id },
      h('span.rw-relic-ico', K.icon('relic', 28)),
      h('span.rw-relic-t', h('b', def.name), h('small', K.cap(rar) + (def.clan ? ' / ' + K.clan(def.clan).name : '')), h('span', def.text || '')));
    return b;
  }

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run) return F.toTitle();
    var payload = params.payload || null;
    if (!payload) {
      if (run.status === 'reward' && run.pending) payload = run.pending.payload;
      else if (run.status === 'battle') {
        var r = SB.run.finishBattle(run, params.result || { outcome: 'win' });
        if (r && r.defeat) { F.go('gameover', { run: run, summary: r.summary, outcome: 'lost', done: true }); return; }
        payload = r;
      }
    }
    if (!payload) { F.toMap(); return; }
    F.run = run;
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    if (run.tutorial && SB.tutorial && SB.tutorial.onRewardShown) scope.timeout(function () { SB.tutorial.onRewardShown(payload, root); }, 200);

    var inner = K.scaffold(root, 'narrow rw');
    var boss = !!payload.boss;
    var title = boss ? (payload.victory ? 'The Sunbeam holds' : (payload.bossName ? payload.bossName + ' is beaten' : 'Boss beaten')) : (payload.nightNo ? 'Night ' + payload.nightNo + ' survived' : (payload.kind === 'elite' ? 'Elite beaten' : 'Pests sent packing'));
    var sub = boss ? 'Take your spoils. The house is still standing.' : (payload.kind === 'elite' ? 'The Elite is gone. It left something behind.' : 'A little quieter than before.');
    inner.appendChild(K.screenHead(title, sub));

    var stack = h('div.col.rw-stack', { style: 'gap:12px' });
    inner.appendChild(stack);

    // ---------------------------------------------------------------- winnings
    var fishNum = h('b.num', '0');
    var win = h('section.panel.pad.rw-win', { 'data-tut': 'rewardFish' }, h('h3', 'Winnings'));
    var lines = h('div.col', { style: 'gap:4px' });
    (payload.fishLines || []).forEach(function (l) {
      if (l.label === 'Surprise tax included') return;
      lines.appendChild(h('div.pv-line', h('span.dim', l.label), h('span.pill-gain', '+' + l.amount + ' Fish')));
    });
    (payload.healLines || []).forEach(function (l) { if (l.amount > 0) lines.appendChild(h('div.pv-line', h('span.dim', l.label), h('span.pill-gain', '+' + l.amount + ' Warmth'))); });
    if (payload.maxWarmthGain) lines.appendChild(h('div.pv-line', h('span.dim', 'The house settles in'), h('span.pill-gain', '+' + payload.maxWarmthGain + ' max Warmth')));
    (payload.relicTriggers || []).forEach(function (t) { var txt = typeof t === 'string' ? t : (t.text || t.name || ''); if (txt) lines.appendChild(h('div.pv-line', h('span.dim', txt))); });
    win.appendChild(lines);
    var tot = h('div.row', { style: 'justify-content:space-between;margin-top:8px;padding-top:8px;border-top:2px solid var(--ui-border)' }, h('span', 'Total'), h('span.row.gap-s', { style: 'color:var(--fish)' }, K.icon('fish', 18), fishNum));
    win.appendChild(tot);
    if (!payload.fish && !(payload.healLines || []).length) win.style.display = 'none';
    stack.appendChild(win);
    K.countUp(fishNum, payload.fish || 0, 700, function (n) { return '+' + Math.round(n); });
    K.sfx('fish_gain');

    // ---------------------------------------------------------------- sections
    var sections = {};
    function section(key, titleText, tut) {
      var box = h('section.panel.pad.rw-sec', { 'data-sec': key, 'data-tut': tut || null }, h('h3', titleText), h('div.rw-body'));
      sections[key] = box; return box;
    }
    function body(key) { return sections[key].querySelector('.rw-body'); }
    function done(key, text) {
      var b = body(key); K.clear(b);
      b.appendChild(h('p.dim', text)); sections[key].classList.add('rw-done');
      refreshProceed();
    }
    function pending(key) { try { return SB.run.rewardsPending(run).indexOf(key) >= 0; } catch (e) { return false; } }

    // card draft
    if (payload.cardChoices && payload.cardChoices.length) {
      stack.appendChild(section('card', payload.bigDraft ? 'Pick a card. A big one.' : 'Pick a card', 'draft'));
      var drawCard = function () {
        var b = body('card'); K.clear(b);
        if (!pending('card')) { done('card', run.__lastTake ? run.__lastTake : 'Card draft finished.'); return; }
        var sel = null, takeBtn;
        var row = h('div.rw-cards');
        var els = {};
        payload.cardChoices.forEach(function (id) {
          var wrap = h('div.rw-card', { 'data-card': id });
          var c = K.cardEl(id, { size: 'reward', noFocus: true });
          var tap = h('button.rw-card-tap', { type: 'button', 'aria-label': 'Choose ' + (K.card(id) || {}).name }, c);
          var info = h('button.rw-info', { type: 'button', 'aria-label': 'Card details', on: { click: function (e) { e.stopPropagation(); K.click(); K.inspectCard(id); } } }, K.icon('scroll', 14), h('span', 'Details'));
          tap.addEventListener('click', function () {
            K.click(); sel = id;
            Object.keys(els).forEach(function (k) { els[k].classList.toggle('on', k === id); });
            takeBtn.disabled = false; takeBtn.querySelector('.lbl').textContent = 'Take ' + ((K.card(id) || {}).name || 'card');
          });
          tap.addEventListener('dblclick', function () { if (sel === id) takeBtn.click(); });
          wrap.appendChild(tap); wrap.appendChild(info); els[id] = wrap; row.appendChild(wrap);
        });
        b.appendChild(row);
        // phone carousel: arrows and dots so the cards that sit off screen are obviously there
        if (payload.cardChoices.length > 1) {
          var dots = payload.cardChoices.map(function (id, i) { return h('button.rw-dot', { type: 'button', 'aria-label': 'Show card ' + (i + 1) + ' of ' + payload.cardChoices.length, on: { click: function () { go(i); } } }); });
          var stepW = function () { var c = row.querySelector('.rw-card'); return c ? c.offsetWidth + 12 : 220; };
          var go = function (i) { var left = Math.max(0, Math.min(payload.cardChoices.length - 1, i)) * stepW(); try { row.scrollTo({ left: left, behavior: K.reduced && K.reduced() ? 'auto' : 'smooth' }); } catch (e) { row.scrollLeft = left; } };
          var here = function () { return Math.round(row.scrollLeft / stepW()); };
          var prevB = h('button.rw-arrow', { type: 'button', 'aria-label': 'Previous card', on: { click: function () { go(here() - 1); } } }, '\u2039');
          var nextB = h('button.rw-arrow', { type: 'button', 'aria-label': 'Next card', on: { click: function () { go(here() + 1); } } }, '\u203a');
          var pager = h('div.rw-pager', prevB, h('div.rw-dots', dots), nextB);
          var sync = function () { var i = here(); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); prevB.disabled = i <= 0; nextB.disabled = i >= payload.cardChoices.length - 1; };
          row.addEventListener('scroll', sync); sync(); b.appendChild(pager);
        }
        takeBtn = h('button.btn.rw-take', { type: 'button', disabled: true, 'data-tut': 'takeCard' }, K.icon('plus', 16), h('span.lbl', 'Choose a card'));
        takeBtn.addEventListener('click', function () {
          if (!sel) return; K.click();
          var res; try { res = SB.run.pickCard(run, sel); } catch (e) { K.toast(String(e.message || e), 'bad'); return; }
          if (!res.ok) { K.toast(res.reason || 'Cannot take that.', 'bad'); return; }
          K.sfx('card_add'); run.__lastTake = 'Added ' + ((K.card(sel) || {}).name || 'a card') + ' to the clowder.';
          F.save(); SB.ui.topbar.refresh(); done('card', run.__lastTake);
        });
        var skip = K.btn('Skip for ' + (payload.skipFish || 6) + ' Fish', { kind: 'alt', icon: 'fish', tut: 'skipCard', onClick: function () {
          var res = SB.run.pickCard(run, null);
          if (res && res.ok) { run.__lastTake = 'Skipped, and pocketed ' + (res.fish || payload.skipFish || 6) + ' Fish.'; F.save(); SB.ui.topbar.refresh(); done('card', run.__lastTake); }
        } });
        b.appendChild(h('div.row.gap-s.wrap.rw-actions', takeBtn, skip));
      };
      drawCard();
    }

    // relic
    if (payload.relicChoices && payload.relicChoices.length) {
      stack.appendChild(section('relic', payload.relicChoices.length > 1 ? 'Choose a relic' : 'A relic', 'relic'));
      var drawRelic = function () {
        var b = body('relic'); K.clear(b);
        if (!pending('relic')) { done('relic', run.__lastRelic || 'Relic claimed.'); return; }
        var list = h('div.col', { style: 'gap:8px' });
        var sel = null, tiles = {};
        payload.relicChoices.forEach(function (id) {
          var t = relicTile(id); tiles[id] = t;
          t.addEventListener('click', function () { K.click(); sel = id; Object.keys(tiles).forEach(function (k) { tiles[k].classList.toggle('sel', k === id); }); takeR.disabled = false; });
          list.appendChild(t);
        });
        b.appendChild(list);
        var takeR = h('button.btn.rw-take', { type: 'button', disabled: payload.relicChoices.length > 1 }, K.icon('relic', 16), 'Take relic');
        if (payload.relicChoices.length === 1) { sel = payload.relicChoices[0]; tiles[sel].classList.add('sel'); }
        takeR.addEventListener('click', function () {
          if (!sel) return; K.click();
          var res = SB.run.pickRelic(run, sel);
          if (!res.ok) { K.toast(res.reason || 'Cannot take that.', 'bad'); return; }
          K.sfx('relic_get'); var nm = (K.relic(sel) || {}).name || 'a relic'; run.__lastRelic = 'Took ' + nm + '.';
          F.save(); SB.ui.topbar.refresh(); done('relic', run.__lastRelic);
        });
        var acts = h('div.row.gap-s.wrap.rw-actions', takeR);
        if (!payload.relicForced) acts.appendChild(K.btn('Leave it', { kind: 'alt', onClick: function () { SB.run.skip(run, 'relic'); done('relic', 'Left the relic where it lay.'); } }));
        b.appendChild(acts);
      };
      drawRelic();
    }

    // collar charm
    if (payload.clanReward && payload.clanReward.charmChoices && payload.clanReward.charmChoices.length) {
      stack.appendChild(section('charm', 'Collar Charm', 'charm'));
      var drawCharm = function () {
        var b = body('charm'); K.clear(b);
        if (!pending('charm')) { done('charm', run.__lastCharm || 'Charm handled.'); return; }
        b.appendChild(h('p.dim', { style: 'margin-bottom:8px' }, 'A charm goes on one card, for the rest of the run. Pick a charm, then a card to wear it.'));
        var list = h('div.col', { style: 'gap:8px' });
        payload.clanReward.charmChoices.forEach(function (cid) {
          var def = (SB.rewards && SB.rewards.charmDef && SB.rewards.charmDef(cid)) || { id: cid, name: cid, text: '' };
          var t = h('button.rw-relic', { type: 'button', style: '--rar:' + K.rarityColor('uncommon') },
            h('span.rw-relic-ico', def.clan && K.hasGlyph ? K.clanIcon(def.clan, 24) : K.icon('tag', 24)),
            h('span.rw-relic-t', h('b', def.name), h('small', (def.clan ? K.clan(def.clan).name : 'Neutral') + ' charm'), h('span', def.text || '')));
          t.addEventListener('click', function () {
            K.click();
            var eligible = run.deck.filter(function (i) { return SB.rewards.charmFits(i, def); });
            if (!eligible.length) { K.toast('No card in your deck can wear that charm.', 'bad'); return; }
            var dd = SB.ui.openDeck(run, { cards: eligible, title: 'Who wears ' + def.name + '?', pick: function (inst) {
              var res = SB.run.pickCharm(run, cid, inst.uid);
              if (!res.ok) { K.toast(res.reason || 'It does not fit.', 'bad'); return false; }
              run.__lastCharm = def.name + ' now hangs on ' + K.cardName(inst) + '.';
              F.save(); K.sfx('card_add'); drawCharm();
              return true;
            } });
          });
          list.appendChild(t);
        });
        b.appendChild(list);
        b.appendChild(h('div.row.gap-s.rw-actions', K.btn('Skip the charms', { kind: 'alt', onClick: function () { SB.run.skip(run, 'charm'); run.__lastCharm = 'No charm this time.'; drawCharm(); } })));
      };
      drawCharm();
    }

    // champion tier
    if (payload.championUpgrade && payload.championUpgrade.options && payload.championUpgrade.options.length) {
      var cu = payload.championUpgrade;
      stack.appendChild(section('champion', 'Champion Tier ' + cu.tier, 'champTier'));
      var drawChamp = function () {
        var b = body('champion'); K.clear(b);
        if (!pending('champion')) { done('champion', run.__lastTier || 'Champion tier handled.'); return; }
        var champ = SB.run.U.champion(run), cdef = champ && K.card(champ.id);
        b.appendChild(h('p.dim', { style: 'margin-bottom:8px' }, (cdef ? cdef.name + ' grows. ' : '') + 'Take any path. Three of the same path unlock a final form.'));
        var opts = h('div.col', { style: 'gap:8px' });
        cu.options.forEach(function (o) {
          var t = h('button.rw-relic', { type: 'button', style: '--rar:' + K.rarityColor('champion') },
            h('span.rw-relic-ico.path', String(o.path || '?')),
            h('span.rw-relic-t', h('b', o.name), h('small', 'Path ' + (o.path || '')), h('span', o.text || ''), o.flavor ? h('em', o.flavor) : null));
          t.addEventListener('click', function () {
            K.click();
            var res = SB.run.claimChampionUpgrade(run, o.id);
            if (!res.ok) { K.toast(res.reason || 'Cannot take that.', 'bad'); return; }
            K.sfx('relic_get'); run.__lastTier = 'Tier ' + cu.tier + ': ' + o.name + (res.finalForm ? '. Final form unlocked: ' + res.finalForm.name + '.' : '.');
            F.save(); SB.ui.topbar.refresh(); done('champion', run.__lastTier);
          });
          opts.appendChild(t);
        });
        b.appendChild(opts);
        b.appendChild(h('div.row.gap-s.rw-actions', K.btn('Decide later', { kind: 'alt', onClick: function () { SB.run.skip(run, 'champion'); done('champion', 'The tier will wait. The Scratching Post sells them too.'); } })));
      };
      drawChamp();
    }

    // growth report
    var growth = (payload.growthReport || []).filter(function (g) { return g && (g.text || typeof g === 'string'); });
    if (growth.length) {
      var gp = h('details.panel.pad.rw-growth', { open: growth.some(function (g) { return g.kind === 'mastery' || g.kind === 'evolution'; }) }, h('summary', h('span.sec-title', 'Growth report'), h('span.faint', ' ' + growth.length + (growth.length === 1 ? ' note' : ' notes'))));
      var gl = h('div.col', { style: 'gap:6px;margin-top:8px' });
      growth.forEach(function (g) {
        var kind = g.kind || 'plays', ic = kind === 'mastery' ? 'star' : kind === 'evolution' ? 'sparkle' : 'paw';
        gl.appendChild(h('div.rw-g.k-' + kind, K.icon(ic, 16), h('span', typeof g === 'string' ? g : g.text)));
      });
      gp.appendChild(gl); stack.appendChild(gp);
    }

    // ---------------------------------------------------------------- proceed
    var proceed = h('button.btn.big.rw-proceed', { type: 'button', 'data-tut': 'proceed' }, K.icon('back', 18), h('span.lbl', 'Back to the map'));
    proceed.querySelector('svg').style.transform = 'scaleX(-1)';
    var last = boss && payload.victory;
    proceed.querySelector('.lbl').textContent = last ? 'Face the dawn' : (boss ? 'On to the next act' : 'Back to the map');
    function refreshProceed() {
      var p = []; try { p = SB.run.rewardsPending(run); } catch (e) { /* ignore */ }
      var needCard = p.indexOf('card') >= 0;
      proceed.disabled = needCard;
      proceed.title = needCard ? 'Pick a card or skip first' : '';
    }
    proceed.addEventListener('click', function () {
      var p = SB.run.rewardsPending(run);
      if (p.indexOf('card') >= 0) { K.toast('Pick a card or skip it first.', ''); return; }
      var go = function () { K.click(); F.rewardDone(); };
      if (p.length) {
        var what = p.map(function (k) { return { relic: 'a relic', charm: 'a charm', champion: 'a champion tier' }[k] || k; }).join(' and ');
        K.confirm({ title: 'Leave rewards behind?', text: 'You have not claimed ' + what + '. Leave without it?', ok: 'Leave', cancel: 'Go back' }).then(function (y) { if (y) go(); });
      } else go();
    });
    root.classList.add('has-foot');
    root.appendChild(h('div.rw-foot', proceed));
    refreshProceed();
  }
  K.register('reward', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
