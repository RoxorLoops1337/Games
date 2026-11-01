/* Title screen (C4): animated house scene, logo, menu column, profile badge, credits. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function profileBadge() {
    var p = K.prof.get(); if (!p) return null;
    var lvl = p.level || 1, meta = SB.data.meta, row = (meta.levels || []).find(function (l) { return l.level === lvl; }) || {};
    var nextXp = row.xpToNext || 0, cur = p.xp - (row.xpTotal != null ? row.xpTotal - nextXp * 0 : 0);
    // xp inside this level
    var base = 0; (meta.levels || []).forEach(function (l) { if (l.level < lvl) base += l.xpToNext; });
    var into = Math.max(0, p.xp - base), pct = nextXp ? Math.min(100, Math.round(into / nextXp * 100)) : 100;
    return h('div.tt-badge', { 'aria-label': 'Whisker level ' + lvl },
      h('div.row.gap-s', K.icon('paw', 16), h('b', 'Whisker Lv ' + lvl), h('span.dim', row.title || '')),
      lvl >= (meta.maxLevel || 30) ? h('div.xpbar', h('i', { style: 'width:100%' })) : h('div.xpbar', { title: into + ' / ' + nextXp + ' XP' }, h('i', { style: 'width:' + pct + '%' })));
  }

  function credits() {
    var st = SB.data.story, cr = st.victory && st.victory.credits || [];
    var body = h('div.col', { style: 'gap:10px;line-height:1.45' },
      h('p', { style: 'color:var(--sunbeam);font-weight:800;letter-spacing:.06em' }, 'SUNBEAM SIEGE'),
      h('p.dim', st.meta.tagline || ''),
      cr.map(function (c) { return h('p', c); }),
      h('p.dim', 'Pixels drawn by code. Music played by a very small orchestra of oscillators. No images were harmed.'),
      h('p.faint', { style: 'font-size:12px' }, st.meta.houseName || ''));
    K.dialog({ title: 'Credits', body: body, sheet: true });
  }

  function mount(root, params) {
    scope = K.scope();
    var st = SB.data.story, meta = st.meta || {};
    K.clear(root); root.classList.add('ttpage');
    var cv = SB.ui.scene.title();
    var saved = SB.ui.flow.savedRun();
    var menu = h('nav.tt-menu', { 'aria-label': 'Main menu' });
    function item(label, fn, o) {
      o = o || {};
      var b = K.btn(label, { kind: o.kind || 'alt', icon: o.icon, onClick: fn, tut: o.tut });
      b.classList.add('tt-item'); return b;
    }
    if (saved) {
      var cl = saved.clan ? K.clan(saved.clan).name : '';
      var sub = 'Night ' + (saved.night || 1) + ' of 9' + (cl ? ', ' + cl : '') + ', ' + (saved.fish || 0) + ' Fish';
      var cont = K.btn('Continue', { kind: '', icon: 'paw', onClick: function () { SB.ui.flow.resume(); } });
      cont.classList.add('tt-item', 'big'); cont.appendChild(h('small', sub));
      menu.appendChild(cont);
    }
    menu.appendChild(item(saved ? 'New run' : 'New run', function () {
      var go = function () { SB.ui.flow.go('newrun', {}); };
      var p = K.prof.get();
      if (saved) K.confirm({ title: 'Abandon the saved run?', text: 'Starting a new run replaces your saved one. The old cat will be told it was an accident.', ok: 'Start new', danger: true }).then(function (y) { if (y) { SB.ui.flow.clearSave(); go(); } });
      else if (p && !p.tutorial.firstFightDone && !p.tutorial.skipped && SB.tutorial) {
        var d; var yes = K.btn('Show me', { onClick: function () { d.close(); SB.tutorial.start(); } }), no = K.btn('I know this', { kind: 'alt', onClick: function () { d.close(); p.tutorial.skipped = true; K.prof.save(); go(); } });
        d = K.dialog({ title: 'First time in the house?', body: h('div.row.gap-l', { style: 'align-items:center' }, K.elderCat(3), h('p', { style: 'line-height:1.45' }, 'The Elder Cat offers four short lessons. She will point at things. You can skip any lesson, and she will pretend not to mind.')), footer: [no, yes] });
      } else go();
    }, { kind: saved ? 'alt' : '', icon: 'night', tut: 'newRun' }));
    menu.appendChild(item('Collection', function () { SB.ui.flow.go('collection', {}); }, { icon: 'deck' }));
    menu.appendChild(item('Settings', function () { SB.ui.flow.go('settings', {}); }, { icon: 'cog' }));
    menu.appendChild(item('Credits', credits, { icon: 'paw' }));

    var muted = !!(SB.audio && SB.audio.isMuted && SB.audio.isMuted('master'));
    var muteBtn = h('button.ibtn', { type: 'button', 'aria-pressed': String(muted), 'aria-label': 'Mute all sound', title: 'Mute', on: { click: function () {
      var m = SB.audio && SB.audio.toggleMute ? SB.audio.toggleMute('master') : false;
      muteBtn.setAttribute('aria-pressed', String(m)); muteBtn.firstChild.replaceWith(K.icon(m ? 'hush' : 'note', 18)); K.settings.set('mute', m);
    } } }, K.icon(muted ? 'hush' : 'note', 18));

    var logo = h('div.tt-logo', { role: 'heading', 'aria-level': '1', 'aria-label': (meta.title || 'SUNBEAM SIEGE') },
      h('div.l1', 'SUNBEAM'), h('div.l2', 'SIEGE'), h('div.tt-sub', meta.subtitle || 'Nine Lives to Hold the House'));
    var side = h('div.tt-side', logo, menu, h('div.tt-tag', meta.tagline || ''));
    var foot = h('div.tt-foot', profileBadge(), h('span.spacer'), h('span.faint', { style: 'font-size:11px' }, 'v1.0 ' + String.fromCharCode(183) + ' ' + (meta.footer || '')), muteBtn);
    root.appendChild(h('div.tt-wrap', cv, h('div.tt-shade'), side, foot));
    scope.add(SB.ui.onResize ? SB.ui.onResize(function () { if (cv.__redo) cv.__redo(); }) : function () { });
    scope.on(window, 'resize', function () { if (cv.__redo) cv.__redo(); });
    setTimeout(function () { var f = root.querySelector('.tt-item'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  function unmount() { if (scope) scope.dispose(); scope = null; }
  K.register('title', { mount: mount, unmount: unmount });
})();
