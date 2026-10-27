/* Settings (C4): audio, display, gameplay, tutorial, data. One builder used by the full screen and the in-run dialog.
 * Reads and writes through SB.ui.settings (ui-core, key nl_settings) and SB.audio. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function field(label, control, hint) {
    return h('div.field', h('label', h('div', label), hint ? h('div.faint', { style: 'font-size:12px' }, hint) : null), control);
  }
  function seg(opts, value, onChange, label) {
    var box = h('div.seg', { role: 'radiogroup', 'aria-label': label || '' });
    opts.forEach(function (o) {
      var b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o[0] === value), class: o[0] === value ? 'on' : '' }, o[1]);
      b.addEventListener('click', function () { K.click(); onChange(o[0]); K.$$('button', box).forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); });
      box.appendChild(b);
    });
    return box;
  }
  function sw(value, onChange, label) {
    var i = h('input.switch', { type: 'checkbox', 'aria-label': label || '' }); i.checked = !!value;
    i.addEventListener('change', function () { K.click(); onChange(i.checked); });
    return i;
  }
  function slider(value, onInput, label) {
    var i = h('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': label || '' }); i.value = Math.round(value * 100);
    i.addEventListener('input', function () { onInput(i.value / 100); });
    i.style.width = '150px';
    return i;
  }
  function audioState(kind, dflt) { try { return SB.audio ? SB.audio.getSettings()[kind] : dflt; } catch (e) { return dflt; } }
  function section(title, kids) { return h('section.panel.pad', { style: 'margin-bottom:12px' }, h('h3', title), kids); }

  function build(host, ctx) {
    ctx = ctx || {};
    var S = K.settings, p = K.prof.get();
    var audio = section('Audio', [
      field('Master volume', slider(audioState('master', 0.8), function (v) { SB.audio && SB.audio.setVolume('master', v); }, 'Master volume')),
      field('Music', slider(audioState('music', 0.55), function (v) { SB.audio && SB.audio.setVolume('music', v); }, 'Music volume')),
      field('Sound effects', slider(audioState('sfx', 0.9), function (v) { SB.audio && SB.audio.setVolume('sfx', v); K.sfx('ui_click'); }, 'Sound effects volume')),
      field('Mute all', sw(SB.audio && SB.audio.isMuted && SB.audio.isMuted('master'), function (v) { SB.audio && SB.audio.setMuted('master', v); }, 'Mute all'))
    ]);
    var display = section('Display', [
      field('Text size', seg([['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']], S.get('textSize') || 'm', function (v) { S.set('textSize', v); }, 'Text size')),
      field('Reduce motion', sw(S.get('reduceMotion'), function (v) { S.set('reduceMotion', v); }, 'Reduce motion'), 'Calmer screens. Defaults to your system setting.'),
      field('High contrast', sw(S.get('highContrast'), function (v) { S.set('highContrast', v); }, 'High contrast')),
      field('Colorblind icons', sw(S.get('cbIcons'), function (v) { S.set('cbIcons', v); }, 'Colorblind icons'), 'Adds shape badges to statuses and rarities.'),
      field('Screen shake', seg([[0, 'Off'], [0.5, '50%'], [1, '100%']], S.get('shake') == null ? 1 : S.get('shake'), function (v) { S.set('shake', v); }, 'Screen shake')),
      field('Damage numbers', sw(S.get('dmgNumbers') !== false, function (v) { S.set('dmgNumbers', v); }, 'Damage numbers')),
      field('Animation speed', seg([[1, 'x1'], [2, 'x2'], [3, 'x3']], S.get('fast') || 1, function (v) { S.set('fast', v); }, 'Animation speed'))
    ]);
    var gameplay = section('Gameplay', [
      field('Confirm End Turn with unspent Zoomies', sw(S.get('confirmEndTurn') !== false, function (v) { S.set('confirmEndTurn', v); }, 'Confirm end turn')),
      field('Auto end turn when out of plays', sw(!!S.get('autoEnd'), function (v) { S.set('autoEnd', v); }, 'Auto end turn'), 'Off by default.'),
      field('Left-handed phone layout', sw(!!S.get('leftHanded'), function (v) { S.set('leftHanded', v); }, 'Left handed'), 'Mirrors the End Turn button.'),
      field('Show contextual tips', sw(!(p && p.tutorial && p.tutorial.tipsOff), function (v) { if (p) { p.tutorial.tipsOff = !v; K.prof.save(); } }, 'Tips'), 'Short hints the first time something new appears.')
    ]);
    var tutBody = [h('p.dim', { style: 'margin-bottom:8px' }, 'The Elder Cat can replay any lesson. She will pretend she was not waiting.')];
    var fights = SB.data.tutorial && SB.data.tutorial.fights || [];
    var tutRow = h('div.row.wrap.gap-s');
    fights.forEach(function (f) { tutRow.appendChild(K.btn(f.order + '. ' + f.title, { kind: 'alt small', onClick: function () { if (ctx.dialog) ctx.dialog.close(); if (SB.tutorial && SB.tutorial.start) SB.tutorial.start({ fight: f.id, replay: true }); else K.toast('Lessons are not loaded.', 'bad'); } })); });
    tutBody.push(tutRow);
    tutBody.push(h('div.row.wrap.gap-s', { style: 'margin-top:10px' }, K.btn('I know this', { kind: 'alt small', onClick: function () { if (p) { p.tutorial.skipped = true; p.tutorial.firstFightDone = true; K.prof.save(); } K.toast('Lessons marked as known.', 'good'); } })));
    tutBody.push(h('div.row.wrap.gap-s', { style: 'margin-top:10px' }, K.btn('Watch the opening story', { kind: 'alt', small: true, onClick: function () { if (ctx.dialog) ctx.dialog.close(); SB.ui.go('story', { mode: 'opening', next: function () { SB.ui.flow.toTitle(); } }); } })));
    var tutorial = section('Tutorial', tutBody);

    // data
    var data = section('Data', [
      h('div.row.wrap.gap-s',
        K.btn('Export profile', { kind: 'alt small', onClick: function () {
          var txt = SB.data.meta.exportProfile(K.prof.get()); if (!txt) { K.toast('Could not export.', 'bad'); return; }
          var ta = h('textarea', { rows: '6', readonly: true, style: 'font-family:var(--f-mono);font-size:11px;width:100%' }); ta.value = txt;
          var d; var copy = K.btn('Copy', { onClick: function () { ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } try { if (navigator.clipboard) { navigator.clipboard.writeText(txt); ok = true; } } catch (e) { /* ignore */ } K.toast(ok ? 'Copied.' : 'Select and copy by hand.', ok ? 'good' : ''); } });
          d = K.dialog({ title: 'Export profile', body: h('div.col', h('p.dim', 'Your whole profile as one line of text. Keep it somewhere safe.'), ta), footer: [copy] });
        } }),
        K.btn('Import profile', { kind: 'alt small', onClick: function () {
          var ta = h('textarea', { rows: '6', placeholder: 'Paste an SB1: string here', style: 'font-family:var(--f-mono);font-size:11px;width:100%' });
          var d; var go = K.btn('Import', { onClick: function () {
            var np = SB.data.meta.importProfile(ta.value);
            if (!np) { K.toast('That does not look like a profile string.', 'bad'); return; }
            K.confirm({ title: 'Replace this profile?', text: 'Your current progress will be replaced by the imported one.', ok: 'Replace', danger: true }).then(function (y) {
              if (!y) return;
              if (SB.profile && SB.profile.importText) SB.profile.importText(ta.value); else SB.data.meta.save(np);
              K.prof.reload(); d.close(); K.toast('Profile imported.', 'good'); if (ctx.refresh) ctx.refresh();
            });
          } });
          d = K.dialog({ title: 'Import profile', body: h('div.col', ta), footer: [go] });
        } })),
      h('div.hr'),
      h('div.row.wrap.gap-s',
        K.btn('Delete saved run', { kind: 'danger small', onClick: function () {
          if (!SB.ui.flow.savedRun()) { K.toast('No saved run.', ''); return; }
          K.confirm({ title: 'Delete the saved run?', text: 'The run in progress will be gone. The cat will not be consulted.', ok: 'Delete', danger: true }).then(function (y) { if (y) { SB.ui.flow.clearSave(); K.toast('Saved run deleted.', 'good'); } });
        } }),
        K.btn('Delete all progress', { kind: 'danger small', onClick: function () {
          K.confirm({ title: 'Delete ALL progress?', text: 'Whisker XP, unlocks, achievements and the saved run. This cannot be undone.', ok: 'Continue', danger: true }).then(function (y) {
            if (!y) return;
            var box = h('input', { type: 'text', placeholder: 'Type DELETE', 'aria-label': 'Type DELETE to confirm', autocomplete: 'off' });
            var d; var yes = K.btn('Delete everything', { kind: 'danger', onClick: function () {
              if (box.value.trim().toUpperCase() !== 'DELETE') { K.toast('Type DELETE to confirm.', 'bad'); return; }
              try { localStorage.removeItem('sb_profile_v1'); localStorage.removeItem('sb_profile_v1_bak'); localStorage.removeItem('nl_run_v1'); } catch (e) { /* ignore */ }
              if (SB.profile && SB.profile.reset) SB.profile.reset();
              K.prof.reload(); SB.ui.flow.clearSave(); d.close(); K.toast('All progress deleted.', 'good'); SB.ui.flow.toTitle();
            } });
            d = K.dialog({ title: 'Last chance', body: h('div.col', h('p', 'Second confirmation. Type DELETE to wipe the profile.'), box), footer: [yes] });
          });
        } }))
    ]);
    var about = section('About', [h('p.dim', { style: 'line-height:1.45' }, (SB.data.story.meta.title || 'SUNBEAM SIEGE') + ': ' + (SB.data.story.meta.subtitle || '') + '. Version 1.0. All art, music and sound are generated by code.')]);
    K.clear(host);
    host.appendChild(h('div.set-grid', h('div', audio, display), h('div', gameplay, tutorial, data, about)));
  }
  SB.ui.buildSettings = build;
  SB.ui.openSettings = function () {
    var body = h('div'); var d = K.dialog({ title: 'Settings', body: body, wide: true });
    build(body, { dialog: d, refresh: function () { build(body, { dialog: d }); } });
    return d;
  };

  function mount(root, params) {
    scope = K.scope();
    var inner = K.scaffold(root, '');
    var host = h('div');
    inner.appendChild(K.screenHead('Settings', 'Everything applies straight away.', [K.btn('Back', { kind: 'alt', icon: 'back', onClick: function () { if (params && params.back) params.back(); else SB.ui.flow.toTitle(); } })]));
    inner.appendChild(host);
    build(host, { refresh: function () { build(host, {}); } });
  }
  K.register('settings', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
