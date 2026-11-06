/* New run setup (C4): Mischief Rank and seed, main clan, side clan, champion, heirloom, Cradle Gift, then go.
 * Mobile first: step tabs, one step per screen, sticky footer. Desktop adds a live preview column. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null, root = null, st = null, mounted = false;

  var CLAN_ORDER = ['alley', 'hearth', 'mischief', 'moon'];
  function meta() { return SB.data.meta; }
  function unlockedClan(id) { return K.prof.has('clan', id); }
  function maxRank() { var p = K.prof.get(); return p && p.mischief ? p.mischief.unlocked || 0 : 0; }
  function heirlooms(clan) { return K.relics().filter(function (r) { return r.clan === clan && (r.tags || []).indexOf('heirloom') >= 0; }); }
  function giftList() { return (meta().cradleGifts || []).filter(function (g) { return K.prof.has('gift', g.id); }); }
  function giftChoices(seed) {
    var all = giftList().slice(), rng = K.rngFor(seed + ':gift');
    for (var i = all.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = all[i]; all[i] = all[j]; all[j] = t; }
    return all.slice(0, 3);
  }
  function champPaths(def) {
    if (!def) return [];
    if (def.paths && def.paths.length) return def.paths.map(function (p) { return { name: p.name, blurb: p.blurb }; });
    var seen = {}, out = [];
    ((def.upgradeSlots && def.upgradeSlots[0] && def.upgradeSlots[0].options) || []).forEach(function (o) { var k = o.pathName || o.path; if (k && !seen[k]) { seen[k] = 1; out.push({ name: o.pathName || ('Path ' + o.path), blurb: '' }); } });
    return out;
  }
  function stepsFor() {
    var s = [{ id: 'rank', t: 'Difficulty' }, { id: 'main', t: 'Main clan' }, { id: 'side', t: 'Side clan' }, { id: 'champion', t: 'Champion' }, { id: 'heirloom', t: 'Heirloom' }];
    if (st.rank < 8 && !st.daily) s.push({ id: 'gift', t: 'Cradle Gift' });
    return s;
  }
  function ok(stepId) {
    if (stepId === 'rank') return true;
    if (stepId === 'main') return !!st.main;
    if (stepId === 'side') return !!st.side;
    if (stepId === 'champion') return !!st.champion;
    if (stepId === 'heirloom') return !!st.heirloom;
    if (stepId === 'gift') return !!st.gift;
    return true;
  }
  function init(params) {
    var p = K.prof.get() || {}, last = p.loadoutLast || {};
    st = { step: 0, rank: Math.min((p.mischief && p.mischief.selected) || 0, maxRank()), seed: K.seed.random(), seedEdited: false, main: null, side: null, champion: null, heirloom: null, gift: null, daily: null, detailClan: null };
    if (last.main && unlockedClan(last.main)) st.main = last.main;
    if (last.side && unlockedClan(last.side) && last.side !== st.main) st.side = last.side;
    if (st.main) { var sl = K.championSlots(st.main); var pick = sl.find(function (s) { return (s.metaId === last.championId || s.id === last.championId) && K.championUnlocked(s); }) || sl.find(K.championUnlocked); st.champion = pick ? pick.id : null; var hl = heirlooms(st.main); st.heirloom = hl[0] && hl[0].id; }
    if (params && params.replay) { // Run Again with the same loadout
      var r = params.replay; st.main = r.clan; st.side = r.side; st.champion = r.championId; st.rank = r.rank || 0; st.heirloom = r.heirloom || st.heirloom; st.gift = r.gift || null; if (r.seed) { st.seed = r.seed; st.seedEdited = true; st.seedSource = 'replay'; } st.step = stepsFor().length - 1;
    }
  }

  // ------------------------------------------------------------------ pieces
  function clanTile(id, sel, disabled, onPick) {
    var c = K.clan(id), locked = !unlockedClan(id);
    var hint = '';
    if (locked) { var u = (meta().clans || []).find(function (x) { return x.id === id; }); hint = K.unlockHint(u && u.unlock); }
    var b = h('button.clan-tile' + (sel ? '.sel' : '') + (locked || disabled ? '.locked' : ''), {
      type: 'button', style: '--cc:' + c.color + ';--cd:' + c.dark + ';--cl:' + c.light, 'aria-pressed': String(!!sel), 'aria-label': c.name + (locked ? ', locked. ' + hint : disabled ? ', already your main clan' : ''), 'data-tut': 'clan:' + id
    }, h('div.ct-ico', K.icon('clan_' + id, 36)), h('div.ct-name', c.name), h('div.ct-motto', locked ? hint : (disabled ? 'Already your main clan' : (c.motto || ''))), h('div.ct-play', locked ? '' : c.play),
      locked ? h('div.ct-lock', K.icon('lock', 18)) : null, sel ? h('span.ct-tag', st.step === 1 ? 'MAIN' : 'SIDE') : null);
    b.addEventListener('click', function () {
      if (locked) { K.toast(hint || 'Locked.', ''); K.sfx('ui_click'); return; }
      if (disabled) return;
      K.click(); onPick(id);
    });
    return b;
  }
  function sampleCards(clan) {
    var all = K.cards().filter(function (c) { return c.clan === clan && c.type !== 'champion' && !c.tutorialOnly && c.rarity !== 'basic'; });
    var by = function (r) { return all.filter(function (c) { return c.rarity === r; })[0]; };
    return [by('rare'), by('uncommon'), by('common')].filter(Boolean);
  }
  function clanDetail(clan) {
    var c = K.clan(clan);
    var box = h('div.panel.pad.nr-detail', { style: '--cc:' + c.color },
      h('div.row.gap-s', K.icon('clan_' + clan, 22), h('h3', { style: 'margin:0' }, c.name)),
      h('p.dim', { style: 'line-height:1.4;margin:6px 0' }, c.bio || c.play),
      c.quirk ? h('p', { style: 'font-size:calc(13px*var(--text-scale));margin-bottom:8px' }, h('b', { style: 'color:var(--sunbeam)' }, 'Quirk: '), c.quirk) : null,
      h('div.row.gap-s.nr-samples', sampleCards(clan).map(function (cd) { return K.cardEl(cd, { size: 'mini', onClick: function () { K.inspectCard(cd); } }); })));
    return box;
  }
  function champCard(slot) {
    var unlocked = K.championUnlocked(slot) && slot.def;
    var sel = st.champion && slot.id === st.champion;
    var def = slot.def;
    var wrap = h('button.champ' + (sel ? '.sel' : '') + (unlocked ? '' : '.locked'), { type: 'button', 'aria-pressed': String(!!sel), 'aria-label': (def ? (def.shortName || def.name) : 'Locked champion') + (unlocked ? '' : ', locked') });
    if (def) {
      var card = K.cardEl(def, { size: 'reward', flavor: true, noFocus: true });
      card.removeAttribute('role'); card.removeAttribute('tabindex');
      if (!unlocked) { card.classList.add('silh'); }
      wrap.appendChild(card);
      if (!unlocked) wrap.appendChild(h('div.champ-lock', K.icon('lock', 22), h('div', '???'), h('small', K.unlockHint(slot.unlock))));
    } else wrap.appendChild(h('div.panel.pad', '???'));
    var info = h('div.champ-info');
    if (def && unlocked) {
      info.appendChild(h('div', { style: 'font-weight:800;color:var(--sunbeam)' }, def.name));
      if (def.catchphrase) info.appendChild(h('div.dim', { style: 'font-style:italic;font-size:calc(13px*var(--text-scale))' }, '"' + def.catchphrase + '"'));
      var ps = champPaths(def);
      if (ps.length) info.appendChild(h('div.col', { style: 'gap:3px;margin-top:6px' }, ps.map(function (pa) { return h('div', { style: 'font-size:calc(12px*var(--text-scale))' }, h('b', pa.name + ': '), h('span.dim', pa.blurb || '')); })));
    }
    var col = h('div.champ-col', wrap, info);
    wrap.addEventListener('click', function () {
      if (!unlocked) { K.toast(K.unlockHint(slot.unlock) || 'Locked.', ''); return; }
      K.click(); st.champion = slot.id; paint();
    });
    return col;
  }
  function relicPanel(rl, sel, onPick) {
    var b = h('button.opt-panel' + (sel ? '.sel' : ''), { type: 'button', 'aria-pressed': String(!!sel) }, h('div.row.gap-s', K.relicIcon(rl, 24), h('b', { style: 'color:var(--sunbeam)' }, rl.name)), h('p', { style: 'margin:6px 0;line-height:1.35' }, rl.text), rl.flavor ? h('p.faint', { style: 'font-style:italic;font-size:12px' }, rl.flavor) : null);
    b.addEventListener('click', function () { K.click(); onPick(); });
    return b;
  }
  function giftPanel(g, sel, onPick) {
    var b = h('button.opt-panel' + (sel ? '.sel' : ''), { type: 'button', 'aria-pressed': String(!!sel), 'data-tut': 'gift:' + g.id }, h('div.row.gap-s', K.icon('fish', 20), h('b', { style: 'color:var(--sunbeam)' }, g.name)), h('p', { style: 'margin:6px 0;line-height:1.35' }, g.text));
    b.addEventListener('click', function () { K.click(); onPick(); });
    return b;
  }

  // ------------------------------------------------------------------ steps
  function stepRank() {
    var max = maxRank(), box = h('div.col.nr-step');
    var rk = (meta().ranks || [])[st.rank] || {};
    var minus = h('button.ibtn', { type: 'button', 'aria-label': 'Lower Mischief Rank', disabled: st.rank <= 0 ? true : null, on: { click: function () { st.rank = Math.max(0, st.rank - 1); st.daily = null; K.click(); paint(); } } }, '-');
    var plus = h('button.ibtn', { type: 'button', 'aria-label': 'Raise Mischief Rank', disabled: st.rank >= max ? true : null, on: { click: function () { st.rank = Math.min(max, st.rank + 1); st.daily = null; K.click(); paint(); } } }, '+');
    var stepper = h('div.row.gap-s', { style: 'justify-content:center' }, minus, h('div.rank-box', h('div.dim', { style: 'font-size:11px;letter-spacing:.1em' }, 'MISCHIEF RANK'), h('div.num', { style: 'font-size:34px;color:var(--sunbeam);line-height:1' }, String(st.rank)), h('div', { style: 'font-weight:800' }, rk.name || '')), plus);
    box.appendChild(h('div.panel.pad', stepper, h('p.dim.center', { style: 'margin-top:8px' }, rk.text || ''), max === 0 ? h('p.faint.center', { style: 'font-size:12px;margin-top:6px' }, 'Win a run to unlock Rank 1.') : null));
    var mods = []; for (var i = 1; i <= st.rank; i++) { var r = meta().ranks[i]; if (r) mods.push(h('li', h('b', r.name + ': '), r.text)); }
    if (mods.length) box.appendChild(h('div.panel.pad', h('h3', 'Active modifiers'), h('ul', { style: 'margin:0;padding-left:18px;line-height:1.5;font-size:calc(13px*var(--text-scale))' }, mods)));
    // daily
    var today = new Date().toISOString().slice(0, 10), dc = null; try { dc = meta().dailyChallenge(today); } catch (e) { dc = null; }
    if (dc) {
      var done = K.prof.get() && K.prof.get().daily && K.prof.get().daily.history && K.prof.get().daily.history[today];
      box.appendChild(h('div.panel.pad.' + (st.daily ? 'sel' : 'x'), h('div.row.gap-s.wrap', h('h3', { style: 'margin:0' }, 'Daily challenge'), h('span.chip', today), done ? h('span.chip.goodc', 'Played') : null),
        h('p', { style: 'margin:6px 0' }, h('b', dc.modifier.name + ': '), dc.modifier.text),
        h('p.dim', { style: 'font-size:12px;margin-bottom:8px' }, K.clan(dc.main).name + (dc.side ? ' + ' + K.clan(dc.side).name : '') + ', Rank ' + dc.rank + '. Same seed for everyone. Never unlocks ranks.'),
        K.btn(st.daily ? 'Daily selected' : 'Play the daily', { kind: st.daily ? 'good small' : 'alt small', onClick: function () { applyDaily(dc); } })));
    }
    var seedIn = h('input', { type: 'text', value: st.seed, maxlength: '8', spellcheck: 'false', autocapitalize: 'characters', 'aria-label': 'Run seed', style: 'font-family:var(--f-mono);letter-spacing:.15em;text-transform:uppercase;max-width:200px' });
    seedIn.addEventListener('input', function () { var n = K.seed.normalize(seedIn.value); st.seed = n; st.seedEdited = true; st.seedSource = 'typed'; if (st.daily) st.daily = null; note.textContent = n.length < 8 ? 'Seeds are 8 characters.' : 'Typed seeds pay half Whisker XP once and a quarter after that.'; });
    var note = h('span.faint', { style: 'font-size:12px' }, 'Random every time. Share it to replay a run.');
    var dice = h('button.ibtn', { type: 'button', 'aria-label': 'New random seed', title: 'Random seed', on: { click: function () { st.seed = K.seed.random(); st.seedEdited = false; st.seedSource = 'random'; st.daily = null; seedIn.value = st.seed; note.textContent = 'Random every time. Share it to replay a run.'; K.click(); } } }, K.icon('dice', 18));
    var det = h('details.panel.pad', h('summary', { style: 'cursor:pointer;font-weight:800;min-height:44px;display:flex;align-items:center' }, 'Seed ' + String.fromCharCode(183) + ' advanced'), h('div.row.gap-s.wrap', { style: 'margin-top:8px' }, seedIn, dice), note);
    box.appendChild(det);
    return box;
  }
  function applyDaily(dc) {
    st.daily = dc; st.seed = dc.seed; st.seedSource = 'daily'; st.rank = Math.min(10, dc.rank || 0);
    st.main = dc.main; st.side = dc.side || null; st.gift = null;
    var sl = K.championSlots(dc.main); st.champion = sl[0] && sl[0].id; var hl = heirlooms(dc.main); st.heirloom = hl[0] && hl[0].id;
    K.toast('Daily challenge loaded. Modifier: ' + dc.modifier.name, 'good'); st.step = stepsFor().length - 1; paint();
  }
  function stepMain() {
    var box = h('div.col.nr-step'), grid = h('div.clan-grid', { 'data-tut': 'clanGrid' });
    CLAN_ORDER.forEach(function (id) { grid.appendChild(clanTile(id, st.main === id, false, function (c) { st.main = c; if (st.side === c) st.side = null; st.detailClan = c; var sl = K.championSlots(c); var first = sl.find(K.championUnlocked); st.champion = first ? first.id : null; var hl = heirlooms(c); st.heirloom = hl[0] && hl[0].id; paint(); })); });
    box.appendChild(grid);
    if (st.main) box.appendChild(clanDetail(st.main));
    return box;
  }
  function stepSide() {
    var box = h('div.col.nr-step'), grid = h('div.clan-grid');
    CLAN_ORDER.forEach(function (id) { grid.appendChild(clanTile(id, st.side === id, id === st.main, function (c) { st.side = c; paint(); })); });
    box.appendChild(h('p.dim', 'The side clan adds one starter cat, 25% of your drafts, and its shop cards. Its champions stay home.'));
    box.appendChild(grid);
    if (st.side) box.appendChild(clanDetail(st.side));
    return box;
  }
  function stepChampion() {
    var slots = K.championSlots(st.main), box = h('div.col.nr-step');
    box.appendChild(h('p.dim', 'Your champion starts every fight in your hand. Each one levels up three times: pick one of three upgrades at Nights 2, 5 and 8.'));
    box.appendChild(h('div.champ-row', slots.map(champCard)));
    return box;
  }
  function stepHeirloom() {
    var box = h('div.col.nr-step'), list = heirlooms(st.main);
    box.appendChild(h('p.dim', 'Each clan has two heirlooms. You start the run with one of them.'));
    if (!list.length) box.appendChild(h('p', 'This clan has no heirloom yet.'));
    box.appendChild(h('div.opt-grid', list.map(function (r) { return relicPanel(r, st.heirloom === r.id, function () { st.heirloom = r.id; paint(); }); })));
    return box;
  }
  function stepGift() {
    var box = h('div.col.nr-step'), list = giftChoices(st.seed);
    box.appendChild(h('p.dim', 'The Cradle Gift is waiting in the hallway. Pick one of three. Different seeds bring different gifts.'));
    box.appendChild(h('div.opt-grid', list.map(function (g) { return giftPanel(g, st.gift === g.id, function () { st.gift = g.id; paint(); }); })));
    box.appendChild(h('div.row', K.btn('No gift, thanks', { kind: 'ghost small', onClick: function () { st.gift = 'none'; paint(); } }), st.gift === 'none' ? h('span.chip', 'No gift') : null));
    return box;
  }

  // ------------------------------------------------------------------ preview column
  function preview() {
    var p = h('aside.panel.pad.nr-prev', { 'aria-label': 'Your loadout' }, h('h3', 'Your clowder'));
    function line(label, val) { return h('div.pv-line', h('span.dim', label), h('span', val || h('span.faint', 'not chosen'))); }
    p.appendChild(line('Rank', st.rank + ' ' + (((meta().ranks || [])[st.rank] || {}).name || '')));
    p.appendChild(line('Main', st.main ? h('span.row.gap-s', K.icon('clan_' + st.main, 14), K.clan(st.main).name) : null));
    p.appendChild(line('Side', st.side ? h('span.row.gap-s', K.icon('clan_' + st.side, 14), K.clan(st.side).name) : null));
    var cdef = st.champion && K.card(st.champion);
    p.appendChild(line('Champion', cdef ? cdef.shortName || cdef.name : null));
    var rl = st.heirloom && K.relic(st.heirloom); p.appendChild(line('Heirloom', rl ? rl.name : null));
    if (stepsFor().some(function (s) { return s.id === 'gift'; })) { var g = st.gift === 'none' ? { name: 'None' } : (meta().cradleGifts || []).find(function (x) { return x.id === st.gift; }); p.appendChild(line('Gift', g ? g.name : null)); }
    if (cdef) { var mini = K.cardEl(cdef, { size: 'mini', onClick: function () { K.inspectCard(cdef); } }); p.appendChild(h('div', { style: 'display:flex;justify-content:center;margin-top:10px' }, mini)); }
    p.appendChild(h('hr.hr'));
    p.appendChild(h('p.dim', { style: 'font-size:12px;line-height:1.4' }, 'Starting deck, 11 cards: your champion, 4 main clan basics, 2 Swat, 2 Catnap, 1 Cardboard Box and 1 side clan basic. Target 24 to 32 by Night 9.'));
    return p;
  }

  // ------------------------------------------------------------------ main paint
  function paint() {
    if (!root) return;
    var steps = stepsFor(); if (st.step >= steps.length) st.step = steps.length - 1;
    var cur = steps[st.step];
    var inner = K.scaffold(root, 'wide nr');
    inner.appendChild(K.screenHead('Choose your clowder', 'Nine nights. One house. A very specific cushion.', [K.btn('Back', { kind: 'alt small', icon: 'back', onClick: function () { SB.ui.flow.toTitle(); } })]));
    var tabs = h('div.nr-tabs', { role: 'tablist' });
    steps.forEach(function (s, i) {
      var done = i < st.step && ok(s.id), reach = i <= st.step || steps.slice(0, i).every(function (x) { return ok(x.id); });
      tabs.appendChild(h('button.nr-tab' + (i === st.step ? '.on' : '') + (done ? '.done' : ''), { type: 'button', role: 'tab', 'aria-selected': String(i === st.step), disabled: reach ? null : true, on: { click: function () { st.step = i; K.click(); paint(); } } },
        h('span.n', done ? K.icon('check', 12) : String(i + 1)), h('span.t', s.t)));
    });
    inner.appendChild(tabs);
    var content = ({ rank: stepRank, main: stepMain, side: stepSide, champion: stepChampion, heirloom: stepHeirloom, gift: stepGift })[cur.id]();
    var main = h('div.nr-main', h('h2.sec-title', { style: 'margin-bottom:8px' }, (st.step + 1) + '. ' + cur.t), content);
    inner.appendChild(h('div.nr-cols', main, preview()));
    // footer
    var last = st.step === steps.length - 1, canNext = ok(cur.id);
    var allOk = steps.every(function (s) { return ok(s.id); });
    var foot = h('div.nr-foot', { 'data-tut': 'newrunFoot' },
      st.step > 0 ? K.btn('Back', { kind: 'alt', icon: 'back', onClick: function () { st.step--; paint(); } }) : h('span'),
      h('span.spacer'),
      last ? K.btn('Go to the Cellar Door', { kind: 'big', disabled: !allOk, icon: 'night', tut: 'startRun', onClick: start }) : K.btn('Next', { kind: '', disabled: !canNext, onClick: function () { st.step++; K.click(); paint(); } }));
    inner.appendChild(foot);
    root.firstChild.scrollTop = 0;
  }
  function start() {
    var steps = stepsFor();
    if (!steps.every(function (s) { return ok(s.id); })) { K.toast('Pick everything first.', 'bad'); return; }
    if (!K.prof.get() || (st.seed || '').length < 8) { st.seed = K.seed.random(); }
    var opts = { seed: st.seed, clan: st.main, side: st.side, championId: st.champion, heirloom: st.heirloom, gift: st.gift === 'none' ? null : st.gift, rank: st.rank,
      seedSource: st.seedSource || (st.seedEdited ? 'typed' : 'random'), daily: !!st.daily, dailyDate: st.daily && st.daily.date, modifier: st.daily && st.daily.modifier && st.daily.modifier.id };
    K.sfx('relic_gain');
    SB.ui.flow.startRun(opts);
  }

  function mount(r, params) {
    scope = K.scope(); root = r; mounted = true;
    init(params || {});
    paint();
    scope.on(document, 'keydown', function (e) { if (e.key === 'Escape' && !K.hasDialog()) { if (st.step > 0) { st.step--; paint(); } else SB.ui.flow.toTitle(); } });
  }
  function unmount() { if (scope) scope.dispose(); scope = null; root = null; mounted = false; }
  K.register('newrun', { mount: mount, unmount: unmount });
})();
