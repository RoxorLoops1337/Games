/* Story cutscenes (C4): opening (7 panels), act interstitials (intro and outro), victory (5 panels, clan epilogue, credits).
 * Procedural pixel scenes from the art hint text, typewriter lines, tap or Space to advance, Skip always available.
 * Params: {mode:'opening'|'interstitial'|'victory', card?, clan?, next:function}. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  function beatsFor(params) {
    var S = SB.data.story, out = [];
    if (params.mode === 'opening') {
      (S.opening || []).forEach(function (p, i) { out.push({ id: p.id, art: p.art, text: p.text, kicker: i === 0 ? S.meta.title : '' }); });
    } else if (params.mode === 'interstitial') {
      var c = params.card || {};
      var lines = Array.isArray(c.text) ? c.text : [c.text || ''];
      lines.forEach(function (t, i) { out.push({ id: c.id + i, art: c.art, text: t, title: i === 0 ? c.title : '', speaker: c.speaker, kicker: i === 0 ? (c.kind === 'outro' ? 'The night ends' : 'The night begins') : '' }); });
    } else if (params.mode === 'victory') {
      var V = S.victory || {};
      out.push({ id: 'win_title', art: 'sunrise over the roofs of a terraced street, a house with one lit window', text: V.banner || 'The Sunbeam holds.', title: V.title || 'The Sunbeam Holds', kicker: 'Dawn' });
      (V.panels || []).forEach(function (p) { out.push({ id: p.id, art: p.art, text: p.text }); });
      var ep = V.epilogues && V.epilogues[params.clan || 'alley'];
      if (ep) out.push({ id: 'epilogue', art: 'warm kitchen at breakfast, cats around a full bowl, sunbeam on the floor', text: ep, kicker: 'Epilogue' });
      if (V.after) out.push({ id: 'after', art: 'night window, snow, one cat watching the street', text: V.after });
    }
    return out;
  }

  function mount(root, params) {
    scope = K.scope();
    var beats = beatsFor(params), idx = -1, typer = null, doneTyping = true, finished = false;
    K.clear(root); root.classList.add('storypage');
    var scene = h('div.st-scene'), titleEl = h('div.st-title'), kicker = h('div.st-kicker');
    var speaker = h('div.st-speaker'), line = h('p.st-line', { 'aria-live': 'polite' });
    var caret = h('span.st-caret', { 'aria-hidden': 'true' }, K.icon('back', 14));
    var portrait = h('div.st-portrait');
    var box = h('div.st-box', { role: 'button', tabindex: '0', 'aria-label': 'Continue' }, portrait, h('div.st-text', speaker, line), caret);
    var dots = h('div.st-dots', { 'aria-hidden': 'true' }, beats.map(function () { return h('i'); }));
    var skip = h('button.btn.alt.small.st-skip', { type: 'button', 'data-tut': 'skipStory' }, K.icon('close', 12), 'Skip');
    var wrap = h('div.st-wrap', scene, h('div.st-vig'), h('div.st-top', kicker, titleEl), box, h('div.st-bar', dots, skip));
    root.appendChild(wrap);

    function finish() {
      if (finished) return; finished = true;
      if (typer) typer.stop();
      if (params.mode === 'opening') { try { var p = K.prof.get(); p.tutorial.handbookSeen = p.tutorial.handbookSeen || []; if (p.tutorial.handbookSeen.indexOf('story_opening') < 0) p.tutorial.handbookSeen.push('story_opening'); K.prof.save(); } catch (e) { /* ignore */ } }
      if (params.next) params.next(); else SB.ui.flow.toTitle();
    }
    function show(i) {
      var b = beats[i];
      idx = i;
      Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k < i ? 'done' : (k === i ? 'on' : ''); });
      K.clear(scene);
      var tall = window.innerWidth < 700 && window.innerHeight > window.innerWidth * 1.2;
      scene.appendChild(SB.ui.scene.vignette(b.art || '', tall ? { w: 120, h: 180, scale: 4, catScale: 1, pestScale: 1, seed: b.id || ('b' + i), label: 'Illustration' } : { w: 240, h: 135, scale: 5, catScale: 1, pestScale: 1, seed: b.id || ('b' + i), label: 'Illustration' }));
      scene.classList.remove('in'); void scene.offsetWidth; scene.classList.add('in');
      kicker.textContent = b.kicker || ''; titleEl.textContent = b.title || '';
      titleEl.style.display = b.title ? '' : 'none'; kicker.style.display = b.kicker ? '' : 'none';
      speaker.textContent = b.speaker && b.speaker !== 'Narrator' ? b.speaker : '';
      K.clear(portrait); portrait.style.display = 'none';
      if (b.speaker === 'Elder Cat') { portrait.appendChild(K.elderCat(3)); portrait.style.display = ''; }
      doneTyping = false; caret.style.visibility = 'hidden';
      if (typer) typer.stop();
      typer = K.typewriter(line, b.text || '', { cps: 52, onDone: function () { doneTyping = true; caret.style.visibility = 'visible'; } });
      if (i === 0 && params.mode === 'opening') K.music('title');
    }
    function advance() {
      if (finished) return;
      if (!doneTyping) { typer.skip(); return; }
      K.click();
      if (idx + 1 >= beats.length) finish(); else show(idx + 1);
    }
    wrap.addEventListener('click', function (e) { if (e.target.closest('.st-skip')) return; advance(); });
    skip.addEventListener('click', function () { finish(); });
    scope.on(document, 'keydown', function (e) {
      if (K.hasDialog()) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
      else if (e.key === 'Escape') { finish(); }
    });
    if (!beats.length) { finish(); return; }
    show(0);
  }

  K.register('story', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
