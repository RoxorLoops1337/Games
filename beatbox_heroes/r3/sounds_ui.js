// BEATBOX HEROES -- r3/sounds_ui.js (STUDIO): the NEW SOUND moment, anywhere in the game, 2D and 3D.
// Classic script, loaded after game.js. Core emits fx {t:'soundUnlocked', id} when you meet a beatboxer, win, level up (TRAINING_PLAN 1, Sounds).
// G.play is wrapped so every action path (G.do, G.doHold().play, G.finishActivity) shows a celebratory card:
//   "NEW SOUND", the name, who taught you, the blurb, PLAY (hear the synth voice), RECORD YOURS (Sound Recorder, focused on that sound), LATER.
//   3D (body.r3): a glass card in the UI kit look (k3-bcard, confetti) in its own fixed layer, real px.
//   2D: a plain .panel.pop card in #ui; it survives the scene change that often follows the action (re-attached until dismissed).
// Cards queue, one at a time. BBH.SoundsUI.show(id) opens one directly (tests, dev). No em dashes in this file.
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), G = BBH && BBH.G;
  if (!E || !G || typeof G.play !== 'function') return;
  const Core = BBH.Core, h = E.h;
  const is3d = () => !!(document.body && document.body.classList.contains('r3') && BBH.R3);
  const snd = () => G.snd;
  const q = []; let cur = null;

  function css() {
    if (document.getElementById('snd-ui-css')) return;
    const st = document.createElement('style'); st.id = 'snd-ui-css';
    st.textContent = [
      '#snd-ui { position: fixed; inset: 0; z-index: 36; pointer-events: none; font-family: var(--f3, "Fredoka", "Trebuchet MS", sans-serif); }',
      '#snd-ui .k3-veil { position: absolute; inset: 0; pointer-events: auto; background: rgba(10, 6, 24, .5); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }',
      '#snd-ui .snd-wrap { position: absolute; left: 16px; right: 16px; top: 50%; transform: translateY(-50%); display: flex; justify-content: center; }',
      '#snd-ui .k3-bcard { pointer-events: auto; padding: 18px 18px 16px; }',
      '#snd-ui .snd-eq { display: flex; justify-content: center; align-items: flex-end; gap: 5px; height: 46px; margin: 6px 0 4px; }',
      '#snd-ui .snd-eq i { display: block; width: 9px; border-radius: 5px; background: var(--bc); box-shadow: 0 0 10px var(--bg); animation: sndEq .8s ease-in-out infinite alternate; }',
      '@keyframes sndEq { from { transform: scaleY(.35); } to { transform: scaleY(1); } }',
      '#snd-ui .snd-eq i { transform-origin: bottom; }',
      'body.r3-reduce #snd-ui .snd-eq i { animation: none; }',
      '#snd-ui .snd-who { margin-top: 4px; font: 700 14px/1.2 var(--f3); color: #ffd35c; letter-spacing: .04em; }',
      '#snd-ui .snd-blurb { margin: 8px 0 12px; font: 500 15px/1.35 var(--f3); color: #e4dafc; }',
      '#snd-ui .snd-btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }',
      '#snd-ui .snd-btns .btn { flex: 1 1 120px; font: 700 15px/1 var(--f3) !important; letter-spacing: .04em; min-height: 46px; display: flex; align-items: center; justify-content: center; }',
      '#snd-ui .snd-later { margin-top: 10px; font: 700 13px/1 var(--f3); color: rgba(255, 246, 232, .6); letter-spacing: .12em; cursor: pointer; pointer-events: auto; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  function info(id, name) {
    const S = snd(), s = S ? S.get(id) : null;
    return { id, name: (s && s.name) || name || id, blurb: (s && s.blurb) || '', who: S && s ? S.teacher(s) : '', col: S ? S.color(id) : '#9dff4a' };
  }
  const hear = (id) => { try { E.unlockAudio(); } catch (e) { /* ignore */ } const S = snd(); if (S) S.play(id, { vel: 1, synth: true }); };
  function toStudio(id) {
    const ch = G.ch || {}, here = E.sceneName, args = E.sceneArgs;
    const back = here === 'place' && args ? { scene: 'place', args } : ch.place && ch.place !== 'street' && ch.place !== 'hood' ? { scene: 'place', args: { id: ch.place } } : { scene: 'street' };
    if (here === 'studio' && E.scene && E.scene.build) { E.scene.focus = id; E.scene.build(); return; }
    E.go('studio', { back, focus: id });
  }

  function close(card) {
    if (!card || card.done) return; card.done = true; clearInterval(card.poll);
    try { card.el.remove(); } catch (e) { /* ignore */ } if (card.host) try { card.host.remove(); } catch (e) { /* ignore */ }
    cur = null; setTimeout(next, 250);
  }

  function card3d(I) {
    css();
    const host = h('div', { id: 'snd-ui' }), veil = h('div.k3-veil'), wrap = h('div.snd-wrap');
    const c = h('div.k3-bcard.snd-card', { 'data-id': I.id });
    c.style.setProperty('--bc', I.col); c.style.setProperty('--bg', 'rgba(157,255,74,.35)');
    const eq = h('div.snd-eq', null, [0.5, 0.9, 0.65, 1, 0.75, 0.55, 0.85].map((v, i) => h('i', { style: { height: Math.round(v * 46) + 'px', animationDelay: (i * 0.09) + 's' } })));
    const card = { el: null, host, done: false };
    c.append(h('div.k3-bkind', null, 'NEW SOUND'), eq, h('div.k3-btitle', null, I.name.toUpperCase()),
      I.who ? h('div.snd-who', null, I.who) : null, I.blurb ? h('div.snd-blurb', null, I.blurb) : null,
      h('div.snd-btns', null, E.btn('PLAY', 'cyan', () => hear(I.id)), E.btn('RECORD YOURS', 'gold', () => { close(card); toStudio(I.id); })),
      h('div.snd-later', { onclick: () => close(card) }, 'LATER'));
    veil.addEventListener('click', () => close(card));
    wrap.appendChild(c); host.append(veil, wrap); document.body.appendChild(host); card.el = c;
    try { const r = c.getBoundingClientRect(); BBH.R3UI && BBH.R3UI.confetti && BBH.R3UI.confetti(r.left + r.width / 2, r.top + 40, 80, [I.col, '#ffd35c', '#fff6e8', '#ff5cb0']); } catch (e) { /* ignore */ }
    return card;
  }

  function card2d(I) {
    const card = { el: null, done: false };
    const el = h('div.panel.pop.snd-card', { 'data-id': I.id, style: { left: '18px', right: '18px', top: '210px', padding: '10px', zIndex: 60, textAlign: 'center', borderTop: '4px solid ' + I.col } },
      h('div.tp', { style: { color: I.col } }, 'NEW SOUND'), h('div.h1', { style: { margin: '6px 0 4px' } }, I.name.toUpperCase()),
      I.who ? h('div.tp.gold', null, I.who.toUpperCase()) : null, I.blurb ? h('div.ts', { style: { margin: '6px 0 8px' } }, I.blurb) : null,
      h('div.row', { style: { gap: '4px' } }, E.btn('PLAY', 'cyan', () => hear(I.id), { flex: 1 }), E.btn('RECORD YOURS', 'gold', () => { close(card); toStudio(I.id); }, { flex: 2 })),
      E.btn('LATER', '', () => close(card), { marginTop: '4px' }));
    card.el = el; E.add(el);
    card.poll = setInterval(() => { if (!card.done && !el.isConnected) { try { E.add(el); } catch (e) { /* ignore */ } } }, 300);   // a scene change wiped #ui: put it back
    try { E.burst(135, 170, 26, { colors: [I.col, '#ffd23f', '#fff'], speed: 110, up: 60 }); } catch (e) { /* ignore */ }
    return card;
  }

  function next() {
    if (cur || !q.length) return; const f = q.shift(), I = info(f.id, f.name);
    cur = is3d() ? card3d(I) : card2d(I); cur.id = f.id;
    try { E.sfx('unlock'); } catch (e) { /* ignore */ }
  }
  function show(id, name) { if (!id || q.some((x) => x.id === id) || (cur && cur.id === id)) return; q.push({ id, name }); setTimeout(next, 120); }

  const play0 = G.play;
  G.play = function (fx, hand) {
    try { for (const f of fx || []) if (f && f.t === 'soundUnlocked' && !(hand && hand.soundUnlocked)) show(f.id, f.name); } catch (e) { /* ignore */ }
    return play0.apply(this, arguments);
  };
  BBH.SoundsUI = { show, close: () => close(cur), get open() { return cur ? cur.id : null; }, queue: () => q.map((x) => x.id) };
  void Core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
