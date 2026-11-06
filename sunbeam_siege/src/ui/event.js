/* Event screen (C4): vignette, setup lines, choices with requirements and gamble tags, result, pending drafts, chains, fights.
 * Rules live in SB.event (C2): pick, options, needs, choose, pickDraft, byId. A choice that needs a cat or card opens SB.ui.openDeck.
 * Leaves with SB.ui.flow.afterNode() or, if the choice starts a fight, SB.ui.flow.openFight(result.fight). No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  var CAT_ICON = { boon: 'star', gamble: 'dice', trade: 'tag', story: 'scroll', fight: 'battle' };

  // short chips describing what a choice does. Gambles hide their odds beyond the tag.
  function chipsFor(ch) {
    var out = [], seen = {};
    function add(cls, text) { var k = cls + text; if (seen[k]) return; seen[k] = 1; out.push(h('span.' + cls, text)); }
    function walk(ops, inChance) {
      (ops || []).forEach(function (e) {
        switch (e.op) {
          case 'fish': add(e.amount >= 0 ? 'pill-gain' : 'pill-cost', (e.amount >= 0 ? '+' : '') + e.amount + ' Fish'); break;
          case 'warmth': add(e.amount >= 0 ? 'pill-gain' : 'pill-cost', (e.amount >= 0 ? '+' : '') + e.amount + ' Warmth'); break;
          case 'maxWarmth': add('pill-gain', '+' + e.amount + ' max Warmth'); break;
          case 'lives': add(e.amount >= 0 ? 'pill-gain' : 'pill-cost', (e.amount >= 0 ? '+' : '') + e.amount + (Math.abs(e.amount) === 1 ? ' Life' : ' Lives') + (e.who === 'all' ? ' each' : '')); break;
          case 'addCard': add(e.curse ? 'pill-cost' : 'pill-gain', e.curse ? 'Curse' : 'Card'); break;
          case 'cardDraft': add('pill-gain', 'Card draft'); break;
          case 'removeCard': add('pill-neutral', e.curseOnly ? 'Remove a curse' : 'Remove card'); break;
          case 'duplicateCard': add('pill-gain', 'Copy a card'); break;
          case 'upgradeCard': add('pill-gain', 'Upgrade'); break;
          case 'evolveCard': add('pill-gain', 'Evolve'); break;
          case 'addRelic': add('pill-gain', 'Relic'); break;
          case 'fight': add('pill-cost', e.tier === 'elite' ? 'Elite fight' : 'Fight'); break;
          case 'chance': if (!inChance) add('pill-neutral', 'Gamble'); break;
          default: break;
        }
      });
    }
    var hasChance = (ch.effects || []).some(function (e) { return e.op === 'chance'; });
    if (hasChance) add('pill-neutral', 'Gamble'); else walk(ch.effects, false);
    return out;
  }

  function describeApplied(run, applied) {
    var rows = [];
    (applied || []).forEach(function (op) {
      var n;
      switch (op.op) {
        case 'fish': rows.push([op.amount >= 0 ? 'pill-gain' : 'pill-cost', (op.amount >= 0 ? '+' : '') + op.amount + ' Fish']); break;
        case 'warmth': rows.push([op.amount >= 0 ? 'pill-gain' : 'pill-cost', (op.amount >= 0 ? '+' : '') + op.amount + ' Warmth']); break;
        case 'maxWarmth': rows.push(['pill-gain', '+' + op.amount + ' max Warmth']); break;
        case 'lives': rows.push([op.amount >= 0 ? 'pill-gain' : 'pill-cost', (op.amount >= 0 ? '+' : '') + op.amount + ' Lives' + (op.uids && op.uids.length === 1 ? ' to ' + nameOfUid(run, op.uids[0]) : '')]); break;
        case 'addCard': if (!op.missing) { n = (K.card(op.card) || {}).name || op.card; rows.push([(K.card(op.card) || {}).type === 'curse' ? 'pill-cost' : 'pill-gain', n + ' joins the deck']); } break;
        case 'addRelic': if (op.relic) rows.push(['pill-gain', 'Relic: ' + ((K.relic(op.relic) || {}).name || op.relic)]); else if (op.fallbackFish) rows.push(['pill-gain', '+' + op.fallbackFish + ' Fish instead']); break;
        case 'removeCard': rows.push(['pill-neutral', ((K.card(op.card) || {}).name || 'A card') + ' leaves']); break;
        case 'duplicateCard': rows.push(['pill-gain', 'A second ' + ((K.card(op.card) || {}).name || 'card')]); break;
        case 'upgradeCard': rows.push(['pill-gain', 'A card is upgraded']); break;
        case 'evolveCard': if (!op.missing) rows.push(['pill-gain', 'Evolved']); break;
        case 'payDebt': rows.push(['pill-cost', 'Debt paid: ' + op.amount + ' Fish']); break;
        default: break;
      }
    });
    return rows;
  }
  function nameOfUid(run, uid) { var i = SB.run.U.inst(run, uid); return i ? K.cardName(i) : 'a cat'; }

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run, F = SB.ui.flow;
    if (!run || run.status !== 'event') { F.toMap(); return; }
    SB.ui.topbar.show(true); SB.ui.topbar.refresh();
    var ev = (params.payload && params.payload.event) || (run.current && run.current.eventId && SB.event.byId(run.current.eventId));
    if (!ev) { F.afterNode(); return; }
    var inner = K.scaffold(root, 'narrow ev');
    var art = h('div.ev-art'); art.appendChild(SB.ui.scene.vignette(ev.art || '', { w: 160, h: 72, scale: 4, seed: ev.id, label: ev.title }));
    var catChip = h('span.chip.ev-cat', K.icon(CAT_ICON[ev.category] || 'event', 12), K.cap(ev.category === 'fight' ? 'trouble' : ev.category));
    inner.appendChild(art);
    inner.appendChild(h('div.ev-title', h('h1.screen-title', ev.title), catChip));
    var setup = h('div.ev-setup', { 'aria-live': 'polite' });
    inner.appendChild(setup);
    var choicesBox = h('div.ev-choices', { 'data-tut': 'eventChoices' });
    inner.appendChild(choicesBox);
    var resultBox = h('div.ev-result'); inner.appendChild(resultBox);

    var typers = [], lines = (ev.setup || []).slice(), shown = 0, finishedSetup = false;
    function showChoices() { if (finishedSetup) return; finishedSetup = true; if (!run.current.eventDone) drawChoices(); }
    function typeNext() {
      if (shown >= lines.length) { showChoices(); return; }
      var p = h('p.ev-line'); setup.appendChild(p);
      var t = K.typewriter(p, lines[shown++], { cps: 90, onDone: function () { scope.timeout(typeNext, 160); } });
      typers.push(t);
    }
    setup.addEventListener('click', function () { typers.forEach(function (t) { t.skip(); }); });
    if (params.resumed || run.current.eventDone) { lines.forEach(function (l) { setup.appendChild(h('p.ev-line', l)); }); finishedSetup = true; }
    else typeNext();

    function drawChoices() {
      K.clear(choicesBox);
      var opts = SB.event.options(run, ev);
      opts.forEach(function (o) {
        var ch = ev.choices[o.idx];
        var b = h('button.ev-choice' + (o.enabled ? '' : '.locked'), { type: 'button', 'aria-disabled': o.enabled ? null : 'true', 'data-choice': ch.id || o.idx },
          h('span.ev-label', ch.label),
          h('span.ev-chips', o.enabled ? chipsFor(ch) : [h('span.pill-neutral', K.icon('lock', 11), ' ' + (o.reqText || 'Locked'))]));
        b.addEventListener('click', function () {
          if (!o.enabled) { K.toast(o.reqText || 'You cannot do that yet.', ''); return; }
          K.click(); choose(o.idx);
        });
        choicesBox.appendChild(b);
      });
    }

    function choose(idx) {
      var needs = SB.event.needs(run, ev, idx), picks = [];
      var ask = function (n) {
        if (n >= needs.length) return fire();
        var need = needs[n];
        var cands = need.candidates.map(function (u) { return SB.run.U.inst(run, u); }).filter(function (i) { return i && picks.indexOf(i.uid) < 0; });
        var title = need.kind === 'cat' ? 'Choose a cat' : (need.op === 'removeCard' ? (need.curseOnly ? 'Which curse goes?' : 'Which card goes?') : need.op === 'duplicateCard' ? 'Which card gets copied?' : need.op === 'upgradeCard' ? 'Which card gets the upgrade?' : 'Choose a card');
        if (needs.length > 1) title += ' (' + (n + 1) + ' of ' + needs.length + ')';
        SB.ui.openDeck(run, { cards: cands, title: title, pick: function (inst) { picks.push(inst.uid); setTimeout(function () { ask(n + 1); }, 0); return true; } });
      };
      var fire = function () {
        var res;
        try { res = SB.event.choose(run, ev, idx, { picks: picks }); } catch (e) { K.toast(String(e.message || e), 'bad'); return; }
        if (!res.ok) { K.toast(res.reason || 'That did not work.', 'bad'); return; }
        resolved(res, ev.choices[idx]);
      };
      ask(0);
    }

    function resolved(res, ch) {
      SB.ui.topbar.refresh(); F.save();
      K.clear(choicesBox);
      K.clear(resultBox);
      var card = h('div.panel.pad.ev-resultcard');
      card.appendChild(h('div.dim', { style: 'font-size:12px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px' }, ch.label));
      var txt = h('p.ev-resulttext'); card.appendChild(txt);
      var chips = h('div.ev-chips', { style: 'margin-top:8px' }, describeApplied(run, res.effectsApplied).map(function (r) { return h('span.' + r[0], r[1]); }));
      card.appendChild(chips);
      resultBox.appendChild(card);
      K.typewriter(txt, res.text || 'Nothing much happens. That is also a result.', { cps: 90 });
      var actions = h('div.rw-foot'); resultBox.appendChild(actions);
      var finish = function () {
        if (res.fight) { F.openFight(res.fight); return; }
        F.afterNode();
      };
      var drafts = function () {
        var pend = run.current && run.current.eventPending || [];
        if (!pend.length) {
          K.clear(actions);
          actions.appendChild(K.btn(res.fight ? 'Into the fight' : 'Onward', { kind: res.fight ? 'danger' : '', icon: res.fight ? 'battle' : 'paw', tut: 'eventContinue', onClick: finish }));
          return;
        }
        var d = pend[0];
        K.clear(actions);
        var wrap = h('div.panel.pad', { style: 'width:100%' }, h('h3', 'Pick a card'));
        var row = h('div.rw-cards');
        d.ids.forEach(function (id) {
          row.appendChild(h('div.rw-card', h('button.rw-card-tap', { type: 'button', on: { click: function () { K.click(); SB.event.pickDraft(run, id); K.sfx('card_add'); SB.ui.topbar.refresh(); F.save(); drafts(); } } }, K.cardEl(id, { size: 'reward', noFocus: true })),
            h('button.rw-info', { type: 'button', on: { click: function () { K.inspectCard(id); } } }, K.icon('scroll', 14), 'Details')));
        });
        wrap.appendChild(row);
        wrap.appendChild(K.btn('Take nothing', { kind: 'alt', onClick: function () { SB.event.pickDraft(run, null); drafts(); } }));
        actions.appendChild(wrap);
      };
      drafts();
    }

    // resumed after the choice was made: only drafts and the way out remain
    if (run.current.eventDone && !params.fresh) {
      resolved({ text: 'You have already seen to this.', effectsApplied: [] }, { label: 'Done' });
    }
  }

  K.register('event', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
