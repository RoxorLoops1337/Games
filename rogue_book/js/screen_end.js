// Inkwoven -- the story and ending screens (owner: story and endings engineer). One IIFE that registers into UI: the screens `story`,
// `chapterClear`, `gameOver` and `victory`. Styles live in css/end.css (classes en-* shared, st-* story, cc-* chapterClear, go-* gameOver,
// vc-* victory, all under .s-NAME). This header is the contract of record for screen_end.js.
//
// SCREENS (DESIGN 5.8, 5.10, 5.11, 6). Params are exactly what GAME routes: story {id, then?:{name, params}}, chapterClear {chapter, next, healed,
// maxHp, R}, gameOver and victory {summary, record, R}. R falls back to UI.run. Nothing is ever required: a page with no run, no lore entry, no
// record or no ART still renders and still has a way on.
//   story         A storybook page. ART.scene.draw of the page's scene (intro title, chN ch1..3, victory, defeat, hero pages camp), the party's bust
//                 portraits in tilted gold-leaf frames, a washi page with a kicker, the lore title, a brush flourish, a hanko seal that stamps down, an
//                 illuminated first letter and the text typed at 30 characters per second (a caret blinks at the pen). A tap on the page, Enter, Space or
//                 Right completes the text, the next one turns the page (UI.go(then, {transition:'page'}), or UI.back() with no `then`); Skip, Esc or S
//                 turn it at once. Every shown page marks META.markLore(id). reduceMotion types instantly.
//   chapterClear  After a boss (chapters 1 and 2): the chapter scene with the heroes cheering and the boss dissolving into ink, the chN_clear page
//                 (lore title as the headline, text in a scroll), the run stats so far counting up (turns, damage, cards, gold, foes, hexes), what
//                 RUN.chapterEnd did (max HP gain, healing: each hero's HP bar grows, then fills, with floating numbers), Ink, the treasures carried,
//                 a freshly unlocked hero (Suzu after chapter 1, Raiga after chapter 2), a tip and Continue, which calls GAME.nodeDone (the next
//                 chapter's story page and map follow).
//   gameOver      The defeat page: a whitening scene, the fallen heroes, the `defeat` lore, the score broken down line by line (RUN.score's own terms,
//                 counting up) with the total, the Inkstones META.recordRun paid, achievements, heroes and Ink Trials newly unlocked, a recap of the deck
//                 and treasures (tap to open the deck or treasure viewer), a tip, Try Again (same heroes, same trial, GAME.newRun) and Title.
//   victory       The grand ending in three beats: the `victory` page typed over the dawn, a curtain call of all four heroes with a line each, then the
//                 showcase: the score breakdown and run stats counting up, Inkstones, achievements, unlocks (Suzu, Raiga, the next Ink Trial), a share
//                 card drawn on a canvas (heroes, score, seed, trial, deck size) with Copy summary and Save card, and Continue to Title. Petals fall
//                 throughout. Skip jumps to the showcase.
//   Big text (textScale above 1.1) adds class ts-big to the screen root: fewer ornaments, one column of tiles, taller story page.
//   Every screen: tap the backdrop to finish the animations at once; the buttons never wait for them. Counters, typewriter, staggers and the sequences
//   run on the frame clock (update(dt)), so GAME.debug.tick drives them exactly; with window.__HEADLESS or reduceMotion every sequence is flushed
//   to its final state when the screen enters, so a suite reads the end state at once. A suite that wants to watch the animation boots with realtime.
//
// BUS. This file emits nothing and listens to nothing: UI itself emits 'screen' after each enter, which is all the tutorial needs from these screens.
// GAME. Only through game() below: nodeDone (chapterClear Continue), toTitle (Title, victory Continue) and newRun (Try Again).
//
// EXPORTS beyond DESIGN: none public. Each screen object carries `_t`, the pure parts for tests: pageInfo, scoreRows, castFor, summaryText, tipFor,
// healPlan, drawCard (victory), state() (the live per-visit state).
//
// DEVIATIONS AND NOTES
//   * Try Again needs GAME.newRun, which screens may not call by the layers rule: game() is the one seam (as in screen_menu.js) and carries a pragma.
//   * The boss's last stand on chapterClear is ART.enemy.draw in the `die` pose; a boss whose art is still a placeholder just shows the placeholder.
//   * Unlock announcements come from the data this screen is given: META.recordRun's result (heroesUnlocked, newAchievements, newTrial) on the end
//     screens, and META.isUnlocked on chapterClear, because META.check already unlocked the hero before chapterClear opened.
(() => {
  'use strict';
  const mk = UI.el;
  const clamp = U.clamp;
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const isFn = (f) => typeof f === 'function';
  const headless = () => !!window.__HEADLESS;
  const reduced = () => !!(UI.opt && UI.opt.reduceMotion);
  const lowQ = () => !!(UI.opt && UI.opt.quality === 'low');
  const warned = {};
  const warnOnce = (key, e) => {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[screen_end] ' + key + (e ? ': ' + (e.message || e) : ''));
  };
  const snd = (id) => { safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.sfx)) AUDIO.sfx(id); }); };
  const ease = U.ease;
  const fmt = U.commas;
  const W = 1280, H = 720;

  // the one seam to GAME (see the header)
  // hygiene-allow(layers): Starting a new run needs GAME.newRun, and nodeDone and toTitle go through the same seam; DESIGN 5.10 gives screens no bus event for newRun
  const game = () => (typeof GAME !== 'undefined' ? GAME : null);

  // ==================================================================================================================
  // data helpers
  // ==================================================================================================================
  const loreOf = (id) => (DATA.lore && DATA.lore[id]) || null;
  const heroName = (id) => (DATA.heroes[id] ? DATA.heroes[id].name : String(id));
  const heroTitle = (id) => (DATA.heroes[id] ? DATA.heroes[id].title : '');
  const heroColor = (id) => (DATA.heroes[id] ? DATA.heroes[id].color : '#8a86a8');
  const numberWord = ['', 'ONE', 'TWO', 'THREE'];
  const DEFAULT_PARTY = ['hanae', 'kuro'];
  const runOf = (params) => (params && params.R) || UI.run || null;
  const hasLiveRun = (R) => !!(R && !R.done && Array.isArray(R.heroes) && R.heroes.length);

  // which two heroes a page is about: the run's party, else the default pair
  function castFor(id, R, summary) {
    if (/^hero_/.test(id)) { const h = id.slice(5); if (DATA.heroes[h]) return [h]; }
    const list = (summary && summary.heroes) || (R && R.heroes) || null;
    const ids = list ? list.map((h) => h.id).filter((h) => DATA.heroes[h]) : [];
    return ids.length ? ids.slice(0, 2) : DEFAULT_PARTY.slice();
  }

  // what a story page is: its kicker line, seal text, scene and the portrait expression
  function pageInfo(id) {
    let m;
    if (id === 'intro') return { kicker: 'PROLOGUE', seal: 'ONCE', scene: 'title', expr: 'determined' };
    if ((m = /^ch(\d)_intro$/.exec(id))) return { kicker: 'CHAPTER ' + (numberWord[+m[1]] || m[1]), seal: U.roman(+m[1]), scene: 'ch' + clamp(+m[1], 1, 3), expr: 'determined' };
    if ((m = /^ch(\d)_clear$/.exec(id))) return { kicker: 'CHAPTER ' + (numberWord[+m[1]] || m[1]) + ' COMPLETE', seal: U.roman(+m[1]), scene: 'ch' + clamp(+m[1], 1, 3), expr: 'smile' };
    if (id === 'victory') return { kicker: 'EPILOGUE', seal: 'END', scene: 'victory', expr: 'smile' };
    if (id === 'defeat') return { kicker: 'INTERLUDE', seal: 'BLANK', scene: 'defeat', expr: 'hurt' };
    if ((m = /^hero_(\w+)$/.exec(id))) return { kicker: 'A HERO OF THE BOOK', seal: (heroName(m[1])[0] || '?').toUpperCase(), scene: 'camp', expr: 'determined' };
    return { kicker: 'A PAGE', seal: '?', scene: 'event', expr: 'neutral' };
  }

  // a tip, seeded so the same page always shows the same line
  function tipFor(R, tag) {
    const tips = DATA.tips || [];
    if (!tips.length) return '';
    const seed = U.hash(R ? R.seed : 0, 'tip', tag, R ? R.chapter : 0);
    return tips[Math.floor(U.rng(seed)() * tips.length)];
  }

  // ==================================================================================================================
  // per-visit state and the small frame-clock engine (typewriter, counters, timeline, petals)
  // ==================================================================================================================
  let CUR = null;
  function begin(kind, params, root) {
    const S = {
      kind, root, params: params || {}, R: runOf(params), t: 0, tickers: [], timeline: [], counters: [], dead: false, isLive: UI.live(),
      leaving: false, tw: null, paint: null, doneAt: -9, animating: false, extra: {},
    };
    S.alive = () => !S.dead && S.isLive();
    root.classList.add('en-screen');
    root.classList.toggle('ts-big', !!(UI.opt && UI.opt.textScale > 1.1));
    CUR = S;
    return S;
  }
  function endVisit(S) {
    if (!S) return;
    S.dead = true;
    S.tickers.length = 0; S.timeline.length = 0; S.counters.length = 0;
    safe(() => UI.tip.hide());
    if (CUR === S) CUR = null;
  }
  function step(S, dt) {
    S.t += dt;
    for (let i = S.tickers.length - 1; i >= 0; i--) {
      let done = false;
      try { done = S.tickers[i](dt) === true; } catch (e) { warnOnce('ticker', e); done = true; }
      if (done) S.tickers.splice(i, 1);
    }
    runTimeline(S);
    runCounters(S, dt);
  }

  // timeline: S.at(ms, fn) runs fn when the visit is ms old. flush() runs everything still pending now (skip, headless, reduced motion).
  function at(S, ms, fn) { S.timeline.push({ at: ms / 1000, fn, done: false }); S.timeline.sort((a, b) => a.at - b.at); }
  function runTimeline(S) {
    while (S.timeline.length && S.timeline[0].at <= S.t) {
      const e = S.timeline.shift();
      if (S.dead) return;
      try { e.fn(); } catch (err) { warnOnce('timeline', err); }
    }
  }
  // counters: a number that ticks from `from` to `to` over o.ms (after o.delay), calling cb(value) on every change; the last call is always `to`.
  function tweenN(S, from, to, o, cb) {
    o = o || {};
    const c = { from, to, ms: o.ms || 800, t: -(o.delay || 0) / 1000, cb, last: null, tick: o.tick || null, done: false };
    cb(from);
    if (from === to) { c.done = true; return c; }
    S.counters.push(c);
    return c;
  }
  // a number that counts up inside an element
  function count(S, el, to, o) {
    o = o || {};
    const f = o.fmt || ((n) => fmt(n));
    return tweenN(S, o.from === undefined ? 0 : o.from, to, o, (v) => { el.textContent = f(v); });
  }
  function runCounters(S, dt) {
    for (let i = S.counters.length - 1; i >= 0; i--) {
      const c = S.counters[i];
      c.t += dt;
      if (c.t < 0) continue;
      const p = clamp(c.t / (c.ms / 1000), 0, 1);
      const v = Math.round(c.from + (c.to - c.from) * ease.outCubic(p));
      if (v !== c.last) { c.cb(v); if (c.tick && c.last !== null && !headless()) snd(c.tick); c.last = v; }
      if (p >= 1) { c.cb(c.to); c.done = true; S.counters.splice(i, 1); }
    }
  }
  function flush(S) {
    if (!S || S.dead) return;
    let guard = 0;
    while (S.timeline.length && guard++ < 400) {
      const e = S.timeline.shift();
      try { e.fn(); } catch (err) { warnOnce('timeline', err); }
    }
    S.counters.splice(0).forEach((c) => { c.cb(c.to); c.done = true; });
    S.tickers.forEach((fn) => { try { fn(1e6); } catch (e) { /* a ticker that cannot finish is dropped */ } });
    S.tickers.length = 0;
    S.animating = false;
    if (S.root) S.root.classList.add('en-settled');
  }
  const instant = () => headless() || reduced();
  // keep the pen in view while the page types itself. The unwritten rest of the text is already laid out (invisible), so scrolling to the bottom of the
  // box threw the drop cap and the first lines off the top at once; scroll only as far as the caret needs, and not at all while it is on screen.
  function followPen(bodyEl) {
    const caret = bodyEl.querySelector ? bodyEl.querySelector('.tw-caret') : null;
    if (!caret || !bodyEl.getBoundingClientRect || !caret.getBoundingClientRect) return;
    const br = bodyEl.getBoundingClientRect(), cr = caret.getBoundingClientRect();
    const k = bodyEl.clientHeight > 0 && br.height > 0 ? br.height / bodyEl.clientHeight : 1;
    const over = (cr.bottom - br.bottom) / k + 10;
    if (over > 0) bodyEl.scrollTop += over;
    if (bodyEl.classList) bodyEl.classList.toggle('scrolled', bodyEl.scrollTop > 2);
  }
  // a key press that arrives in the first moments of a screen belongs to the screen before it (a player mashing Enter through a fight must not
  // restart the run the instant the defeat page opens): keys wake up 0.7 s in. Clicks and taps are never held back.
  const armed = (S) => headless() || S.t >= 0.7;

  // typewriter: types `text` into el at cps characters per second, with a blinking caret at the pen. tw.complete() finishes it; tw.then(fn)
  // runs when it is done (at once if it already is). Instant headless and under reduced motion.
  function typewriter(S, el, text, o) {
    o = o || {};
    const on = mk('span', { class: 'tw-on' }), off = mk('span', { class: 'tw-off', 'aria-hidden': 'true' });
    const caret = mk('i', { class: 'tw-caret', 'aria-hidden': 'true' });
    el.textContent = '';
    el.appendChild(on); el.appendChild(caret); el.appendChild(off);
    const tw = { text: String(text), n: 0, done: false, cbs: [], cps: o.cps || 30 };
    const paint = () => { on.textContent = tw.text.slice(0, tw.n); off.textContent = tw.text.slice(tw.n); };
    tw.complete = () => {
      if (tw.done) return;
      tw.done = true; tw.n = tw.text.length; paint();
      caret.remove();
      el.classList.add('tw-done');
      tw.cbs.splice(0).forEach((fn) => safe(fn));
    };
    tw.then = (fn) => { if (tw.done) safe(fn); else tw.cbs.push(fn); };
    paint();
    if (instant() || !tw.text.length) { tw.complete(); return tw; }
    let acc = -(o.delay || 0) / 1000;
    S.tickers.push((dt) => {
      if (tw.done) return true;
      acc += dt;
      if (acc < 0) return false;
      const want = Math.min(tw.text.length, Math.floor(acc * tw.cps));
      if (want !== tw.n) { tw.n = want; paint(); if (o.onType) o.onType(tw); }
      if (tw.n >= tw.text.length) { tw.complete(); return true; }
      return false;
    });
    return tw;
  }

  // falling petals (DOM, so they pass over the panels): n petals with seeded sizes, speeds and drifts. Fewer on low quality, none under reduced motion.
  function petals(S, n, o) {
    o = o || {};
    if (reduced()) return null;
    const layer = mk('div', { class: 'en-petals', 'aria-hidden': 'true' });
    const r = U.rng(U.hash(S.R ? S.R.seed : 0, 'petals', S.kind));
    const total = lowQ() ? Math.round(n * 0.5) : n;
    for (let i = 0; i < total; i++) {
      const p = mk('i', { class: 'en-petal' + (r() < 0.25 ? ' alt' : '') });
      UI.vars(p, { '--x': Math.round(r() * W) + 'px', '--sz': Math.round(12 + r() * 16) + 'px', '--d': (7 + r() * 7).toFixed(2) + 's', '--delay': (-r() * 12).toFixed(2) + 's',
        '--sway': Math.round(30 + r() * 70) + 'px', '--rot': Math.round(180 + r() * 300) + 'deg' });
      layer.appendChild(p);
    }
    S.root.appendChild(layer);
    return layer;
  }

  // ==================================================================================================================
  // painting helpers (canvas, #view): every ART call is guarded so a missing or broken painter never kills the screen's draw hook
  // ==================================================================================================================
  function artScene(ctx, id, t, opts, dy) {
    let ok = false;
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.draw)) {
      try {
        if (dy) { ctx.save(); ctx.translate(0, dy); }
        ok = ART.scene.draw(ctx, id, W, H, t, opts || {}) !== false;
        if (dy) ctx.restore();
      } catch (e) { warnOnce('ART.scene.draw ' + id, e); ok = false; }
    }
    if (!ok) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1d5a'); g.addColorStop(1, '#0d0b1e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
  function artHero(ctx, id, o) {
    if (typeof ART === 'undefined' || !ART || !ART.hero || !isFn(ART.hero.draw)) return;
    try { ART.hero.draw(ctx, id, o); } catch (e) { warnOnce('ART.hero.draw', e); }
  }
  function artPortrait(ctx, id, o) {
    if (typeof ART !== 'undefined' && ART && ART.hero && isFn(ART.hero.portrait)) {
      try { ART.hero.portrait(ctx, id, o); return; } catch (e) { warnOnce('ART.hero.portrait', e); }
    }
    ctx.fillStyle = heroColor(id); ctx.fillRect(o.x, o.y, o.w, o.h);
  }
  function artEnemy(ctx, id, o) {
    if (typeof ART === 'undefined' || !ART || !ART.enemy || !isFn(ART.enemy.draw)) return;
    try { ART.enemy.draw(ctx, id, o); } catch (e) { warnOnce('ART.enemy.draw', e); }
  }
  function vignette(ctx, a, color) {
    const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.34, W / 2, H * 0.5, H * 0.98);
    g.addColorStop(0, 'rgba(' + (color || '13,11,30') + ',0)'); g.addColorStop(1, 'rgba(' + (color || '13,11,30') + ',' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // a slanted, gold-leaf framed panel (manga style) with content painted by draw(ctx, w, h) at its own origin
  function framed(ctx, o, draw) {
    const w = o.w, h = o.h, sk = o.skew === undefined ? 14 : o.skew;
    ctx.save();
    ctx.translate(o.x + w / 2, o.y + h / 2);
    ctx.rotate(o.rot || 0);
    ctx.globalAlpha = clamp(o.alpha === undefined ? 1 : o.alpha, 0, 1);
    const poly = (g, ins) => {
      g.beginPath();
      g.moveTo(-w / 2 + sk + ins, -h / 2 + ins); g.lineTo(w / 2 - ins, -h / 2 + ins); g.lineTo(w / 2 - sk - ins, h / 2 - ins); g.lineTo(-w / 2 + ins, h / 2 - ins); g.closePath();
    };
    ctx.shadowColor = 'rgba(5,3,18,0.6)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
    poly(ctx, 0); ctx.fillStyle = '#140f2e'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const gold = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    gold.addColorStop(0, '#a87420'); gold.addColorStop(0.25, '#ffe9a8'); gold.addColorStop(0.5, '#d9a441'); gold.addColorStop(0.75, '#fff2c0'); gold.addColorStop(1, '#b98a2f');
    poly(ctx, 4); ctx.fillStyle = gold; ctx.fill();
    poly(ctx, 9); ctx.fillStyle = '#140f2e'; ctx.fill();
    ctx.save();
    poly(ctx, 11); ctx.clip();
    ctx.translate(-w / 2, -h / 2);
    try { draw(ctx, w, h); } catch (e) { warnOnce('framed content', e); }
    ctx.restore();
    // a hero-coloured stripe along the bottom edge
    if (o.color) {
      ctx.save(); poly(ctx, 11); ctx.clip();
      ctx.fillStyle = o.color; ctx.globalAlpha *= 0.9;
      ctx.beginPath(); ctx.moveTo(-w / 2 + 11, h / 2 - 16); ctx.lineTo(w / 2 - sk - 11, h / 2 - 22); ctx.lineTo(w / 2 - sk - 11, h / 2); ctx.lineTo(-w / 2 + 11, h / 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // glittering gold flecks drifting up the stage (cheap, deterministic): used on the chapter and ending screens
  function flecks(ctx, S, t, n, color) {
    if (reduced()) return;
    const r = U.rng(U.hash('flecks', S.kind));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, y0 = r() * H, sp = 14 + r() * 26, ph = r() * 6.28, sz = 1.2 + r() * 2.2;
      const y = ((y0 - t * sp) % H + H) % H, x = x0 + Math.sin(t * 0.6 + ph) * 14;
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.3 + ph));
      ctx.fillStyle = color || '#ffe9a8';
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.restore();
  }

  // ==================================================================================================================
  // small DOM pieces shared by the screens
  // ==================================================================================================================
  // the screen's backdrop: a tap finishes the animations (or, for the story, turns the page)
  function tapLayer(S, fn) {
    const el = mk('div', { class: 'en-tap', 'aria-hidden': 'true' });
    el.addEventListener('click', () => { if (!S.dead) fn(); });
    S.root.appendChild(el);
    return el;
  }
  function noRunPage(S, what) {
    S.root.appendChild(mk('div', { class: 'en-none' }, UI.panel({ kind: 'paper', torn: true, title: 'A blank page' },
      mk('p', { class: 'en-none-text', text: what || 'There is no tale open for this page.' }),
      mk('div', { class: 'row center' }, UI.btn('Back to Title', { kind: 'primary', size: 'lg', onclick: () => { const g = game(); if (g) g.toTitle(); else UI.toTitle(); } })))));
  }
  // a body that scrolls says so: while there is more below the fold its bottom edge fades (class `more`), instead of cutting a line in half
  function fadeWhileMore(body) {
    const sync = () => { body.classList.toggle('more', body.scrollHeight - body.clientHeight > 10 && body.scrollTop + body.clientHeight < body.scrollHeight - 4); };
    body.addEventListener('scroll', sync, { passive: true });
    [60, 700, 2000].forEach((ms) => UI.after(ms, sync));      // after layout, and after the panels have risen and the tiles have counted up
    return body;
  }
  // a paper "scroll" panel with a heading and a body that scrolls when text is large
  function scroll(cls, title, ...kids) {
    const head = title ? mk('h2', { class: 'en-h' }, mk('span', { text: title })) : null;
    const body = fadeWhileMore(mk('div', { class: 'en-scroll-body' }, ...kids));
    const p = UI.panel({ kind: 'paper', gold: true, class: 'en-card ' + cls }, head, body);
    p.bodyEl = body;
    return p;
  }
  function lacquer(cls, title, ...kids) {
    const head = title ? mk('h2', { class: 'en-h dark' }, mk('span', { text: title })) : null;
    const body = fadeWhileMore(mk('div', { class: 'en-scroll-body' }, ...kids));
    const p = UI.panel({ kind: 'dark', gold: true, class: 'en-card ' + cls }, head, body);
    p.bodyEl = body;
    return p;
  }
  // like lacquer(), but the foot sits outside the scrolling body so a total never scrolls away
  function lacquerSplit(cls, title, bodyKids, foot) {
    const head = title ? mk('h2', { class: 'en-h dark' }, mk('span', { text: title })) : null;
    const body = fadeWhileMore(mk('div', { class: 'en-scroll-body' }, ...bodyKids));
    const p = UI.panel({ kind: 'dark', gold: true, class: 'en-card ' + cls }, head, body, foot);
    p.bodyEl = body;
    return p;
  }
  // a stat tile: icon, label, a number that counts up
  function statTile(S, icon, label, value, o) {
    o = o || {};
    const num = mk('b', { class: 'en-num' });
    const el = mk('div', { class: 'en-tile', role: 'group', 'aria-label': label + ' ' + fmt(value) }, mk('span', { class: 'en-tile-ico', 'aria-hidden': 'true' }, icon), mk('span', { class: 'en-tile-lab', text: label }), num);
    if (instant()) num.textContent = fmt(value);
    else count(S, num, value, { ms: o.ms || 900, delay: o.delay || 0 });
    return el;
  }

  // ==================================================================================================================
  // STORY
  // ==================================================================================================================
  function advanceStory(S) {
    if (!S || S.dead || S.leaving) return;
    if (S.tw && !S.tw.done) { S.tw.complete(); S.doneAt = S.t; snd('ui_click'); return; }
    if (!headless() && S.t - S.doneAt < 0.22) return;               // the tap that finished the text must not also turn the page
    leaveStory(S);
  }
  function leaveStory(S) {
    if (!S || S.dead || S.leaving) return;
    S.leaving = true;
    if (S.tw) S.tw.complete();
    snd('page_turn');
    const then = S.params.then;
    if (then && then.name) UI.go(then.name, then.params, { transition: 'page' });
    else UI.back();
  }

  function paintStory(ctx, t, S) {
    const x = S.extra;
    artScene(ctx, x.info.scene, t, { particles: 1, parallaxX: Math.sin(S.t * 0.25) * 18 });
    vignette(ctx, x.info.scene === 'defeat' ? 0.35 : 0.55);
    flecks(ctx, S, t, 26, '#ffe9a8');
    const n = x.cast.length;
    const reveal = (i) => ease.outBack(clamp((S.t - 0.25 - i * 0.22) / 0.7, 0, 1));
    x.cast.forEach((id, i) => {
      const k = reveal(i);
      if (k <= 0) return;
      const big = n === 1;
      const w = big ? 330 : 250, h = Math.round(w * 4 / 3);
      const px = big ? 110 : (i === 0 ? 62 : 262), py = big ? 150 : (i === 0 ? 96 : 262);
      const bob = reduced() ? 0 : Math.sin(S.t * 0.9 + i * 1.7) * 4;
      framed(ctx, { x: px - (1 - k) * 90, y: py + bob, w, h, rot: (i === 0 ? -0.045 : 0.04) * (big ? 0.5 : 1), alpha: clamp(k * 1.4, 0, 1), color: heroColor(id) }, (g, fw, fh) => {
        artPortrait(g, id, { x: 0, y: 0, w: fw, h: fh, expr: x.info.expr, t });
      });
    });
  }

  const story = {
    pausable: false,
    _t: { pageInfo, castFor, tipFor, state: () => CUR },
    enter(params, root) {
      const S = begin('story', params, root);
      const id = (params && params.id) || 'intro';
      const lore = loreOf(id);
      const info = pageInfo(id);
      const cast = castFor(id, S.R, null);
      Object.assign(S.extra, { id, info, cast, lore });
      safe(() => { if (lore) META.markLore(id); });
      const title = lore ? lore.title : 'A Blank Page';
      const text = lore ? lore.text : 'Nothing is written on this page yet. Turn it, and the tale goes on.';
      const dropCap = /^[A-Za-z]/.test(text);
      const first = dropCap ? text[0] : '';
      const rest = dropCap ? text.slice(1) : text;

      S.paint = paintStory;
      tapLayer(S, () => advanceStory(S));

      const words = String(title).split(' ');
      const titleEl = mk('h1', { class: 'st-title' }, ...words.map((w, i) => [i ? ' ' : null, UI.vars(mk('span', { class: 'st-w', text: w }), { '--i': i })]));
      const head = mk('header', { class: 'st-head' },
        mk('p', { class: 'st-kicker', text: info.kicker }),
        titleEl,
        mk('i', { class: 'st-flourish', 'aria-hidden': 'true' }, mk('b', { class: 'fl-l' }), mk('b', { class: 'fl-m' }), mk('b', { class: 'fl-r' })));
      const typed = mk('span', { class: 'st-typed' });
      const para = mk('p', { class: 'st-text', 'aria-hidden': 'true' }, dropCap ? mk('span', { class: 'st-drop' }, mk('b', { text: first })) : null, typed);
      const bodyEl = mk('div', { class: 'st-body' }, para, mk('p', { class: 'sr-only', text: title + '. ' + text }));
      const skip = UI.btn('Skip', { kind: 'secondary', onclick: () => leaveStory(S), key: 'Esc' });
      skip.classList.add('st-skip');
      const turn = UI.btn('Turn the page', { kind: 'primary', size: 'lg', breathe: true, onclick: () => advanceStory(S), key: 'Enter' });
      turn.classList.add('st-turn');
      const hint = mk('span', { class: 'st-hint', text: 'Tap the page to read on' });
      const foot = mk('footer', { class: 'st-foot' }, skip, hint, turn);
      const page = UI.panel({ kind: 'paper', gold: true, class: 'st-page' }, head, bodyEl, foot);
      page.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('button')) return; advanceStory(S); });
      root.appendChild(page);
      const seal = mk('div', { class: 'st-seal', 'aria-hidden': 'true' }, UI.hanko(info.seal, { size: 'lg' }));
      root.appendChild(seal);
      if (hasLiveRun(S.R)) root.appendChild(UI.menuButton());

      S.tw = typewriter(S, typed, rest, {
        cps: 30, delay: 700,
        onType: () => followPen(bodyEl),
      });
      S.tw.then(() => { root.classList.add('st-done'); S.doneAt = S.t; });
      at(S, 520, () => { snd('ink_splash'); seal.classList.add('stamped'); });
      UI.announce(title);
      if (instant()) flush(S);
    },
    update(dt) { if (CUR && CUR.kind === 'story') step(CUR, dt); },
    draw(ctx, t) { if (CUR && CUR.kind === 'story' && CUR.paint) CUR.paint(ctx, t, CUR); },
    onKey(e) {
      const S = CUR;
      if (!S || S.kind !== 'story' || S.dead) return false;
      if (!armed(S)) return false;
      const onBtn = e.target && e.target.closest && e.target.closest('button, [role=button]');
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { if (onBtn && e.key !== 'ArrowRight') return false; e.preventDefault(); advanceStory(S); return true; }
      if (e.key === 'Escape' || e.key === 's' || e.key === 'S') { e.preventDefault(); leaveStory(S); return true; }
      return false;
    },
    leave() { endVisit(CUR); },
  };
  UI.screens.story = story;

  // ==================================================================================================================
  // score and summary helpers (shared by gameOver and victory)
  // ==================================================================================================================
  const iconOf = (kind, id, size) => UI.icon(kind, id, size || 28);

  // RUN.score broken into its own terms (DATA.ECONOMY.score), so the rows add up to summary.score. With no deck at hand (a run object that is gone)
  // the three deck terms are unknown, and one "Deck work" row carries whatever is left over so the total is still honest.
  function scoreRows(sm, R) {
    const E = DATA.ECONOMY.score;
    const st = (sm && sm.stats) || (R && R.stats) || {};
    const heroes = (sm && sm.heroes) || (R && R.heroes) || [];
    const deck = (R && Array.isArray(R.deck)) ? R.deck : null;
    const gold = sm && typeof sm.gold === 'number' ? sm.gold : (R ? R.gold | 0 : 0);
    const bk = st.bossKills | 0;
    const rows = [
      { k: 'chapters', label: 'Chapters cleared', n: bk, pts: E.chapter * bk, icon: ['motif', 'book'] },
      { k: 'bosses', label: 'Bosses felled', n: bk, pts: E.boss * bk, icon: ['relic', 'crown'] },
      { k: 'elites', label: 'Elites defeated', n: st.elites | 0, pts: E.elite * (st.elites | 0), icon: ['relic', 'skull'] },
      { k: 'gold', label: 'Gold in the purse', n: gold, pts: Math.floor(gold / E.goldDiv), icon: ['stat', 'gold'] },
      { k: 'maxhp', label: 'Heroes\' max HP', n: heroes.reduce((a, h) => a + (h.maxHp | 0), 0), pts: E.maxHp * heroes.reduce((a, h) => a + (h.maxHp | 0), 0), icon: ['stat', 'hp'] },
    ];
    if (deck) {
      const up = deck.filter((c) => c.up).length;
      const gems = deck.reduce((a, c) => a + (c.gems || []).filter(Boolean).length, 0);
      const curses = deck.filter((c) => DATA.cards[c.id] && DATA.cards[c.id].hero === 'curse').length;
      rows.push({ k: 'upgrades', label: 'Cards sharpened', n: up, pts: E.upgraded * up, icon: ['type', 'attack'] });
      rows.push({ k: 'gems', label: 'Gems set', n: gems, pts: E.gemSlot * gems, icon: ['gem', 'slot:gold'] });
      rows.push({ k: 'curses', label: 'Curses carried', n: curses, pts: E.curse * curses, icon: ['type', 'curse'] });
    }
    const turns = st.turns | 0;
    rows.push({ k: 'turns', label: 'Turns taken', n: turns, pts: -Math.floor(turns / E.turnDiv), icon: ['relic', 'hourglass'] });
    const score = sm && typeof sm.score === 'number' ? sm.score : Math.max(0, rows.reduce((a, r) => a + r.pts, 0));
    const known = rows.reduce((a, r) => a + r.pts, 0);
    const rest = score - known;
    if (rest !== 0) rows.splice(rows.length - 1, 0, { k: 'rest', label: deck ? 'The book\'s mercy' : 'Deck work', n: 0, pts: rest, icon: ['type', 'skill'], noCount: true });
    return { rows, score };
  }

  // a fallback summary when GAME gave none (a debug jump, a missing run)
  function summaryOf(params, R, win) {
    if (params && params.summary && typeof params.summary === 'object') return params.summary;
    const s = R ? safe(() => RUN.summary(R), null) : null;
    if (s) return s;
    const hs = DEFAULT_PARTY.map((id) => ({ id, hp: win ? DATA.heroes[id].maxHp : 0, maxHp: DATA.heroes[id].maxHp }));
    return { score: 0, victory: !!win, chapter: 1, trial: 0, daily: false, seed: 0, heroes: hs, deckSize: 0, relics: [], gold: 0, stats: {} };
  }
  const recordOf = (params, summary) => (params && params.record) || (summary && summary.record) || null;

  function trialName(n) {
    const t = DATA.trials && DATA.trials['trial_' + n];
    return t ? t.name : '';
  }

  // the text a player can paste anywhere
  function summaryText(sm, R, win) {
    const ids = ((sm.heroes && sm.heroes.map((h) => h.id)) || DEFAULT_PARTY).filter((h) => DATA.heroes[h]);
    const names = ids.map(heroName).join(' and ');
    const mode = sm.daily ? 'Daily Tale ' + sm.seed : (sm.trial ? 'Ink Trial ' + sm.trial : 'Ink Trial 0');
    const line1 = 'INKWOVEN: ' + (win ? 'the ending, rewritten' : 'the tale ended on page ' + (sm.chapter || 1));
    const line2 = names + ' | Score ' + fmt(sm.score || 0) + ' | ' + mode;
    const line3 = 'Seed ' + (sm.seed >>> 0) + ' | ' + U.plural(sm.deckSize | 0, 'card') + ' | ' + U.plural((sm.relics || []).length, 'treasure') + ' | ' + U.plural((sm.stats && sm.stats.bossKills) | 0, 'chapter') + ' cleared';
    return [line1, line2, line3].join('\n');
  }

  // newly unlocked things from META.recordRun's result, as display entries
  function unlockEntries(rec, sm) {
    const out = [];
    if (!rec) return out;
    (rec.heroesUnlocked || []).forEach((id) => out.push({ kind: 'hero', id, seal: 'NEW', title: heroName(id) + ' joins the book', text: heroTitle(id) + '. Choose ' + heroName(id) + ' when you begin a new tale.' }));
    (rec.newAchievements || []).forEach((id) => {
      const a = DATA.achievements[id];
      if (!a) return;
      out.push({ kind: 'ach', id, seal: 'WON', title: a.name, text: a.text, reward: a.reward && a.reward.inkstones });
    });
    if (rec.newTrial) out.push({ kind: 'trial', id: rec.newTrial, seal: 'TRIAL', title: 'Ink Trial ' + rec.newTrial + ' unlocked', text: (trialName(rec.newTrial) ? trialName(rec.newTrial) + '. ' : '') + 'A harder telling of the same tale is waiting on the hero select.' });
    return out;
  }
  function unlockRow(S, e, i) {
    const row = mk('div', { class: 'en-unlock k-' + e.kind, role: 'group', 'aria-label': e.title });
    UI.vars(row, { '--i': i });
    row.appendChild(mk('span', { class: 'en-unlock-seal' }, UI.hanko(e.seal, { size: 'sm' })));
    const body = mk('div', { class: 'en-unlock-body' }, mk('b', { class: 'en-unlock-t', text: e.title }), mk('span', { class: 'en-unlock-x', text: e.text }));
    if (e.kind === 'hero') row.appendChild(mk('span', { class: 'en-unlock-med' }, UI.medallion(e.id, 44)));
    row.appendChild(body);
    if (e.reward) row.appendChild(mk('span', { class: 'en-unlock-r' }, UI.stat('inkstone', '+' + e.reward, { size: 'sm', focusable: false, tip: false })));
    return row;
  }

  // the score ledger: one row per term, counting up in turn, then the total
  function ledger(S, sm, R, o) {
    o = o || {};
    const data = scoreRows(sm, R);
    const list = mk('div', { class: 'en-ledger', role: 'list', 'aria-label': 'Score breakdown' });
    const baseDelay = (o.delay === undefined ? 900 : o.delay) + Math.round(S.t * 1000);   // relative to NOW: the victory showcase is built seconds into the screen, and absolute times fired every row at once and left the total at the wrong number
    const gap = o.gap || 260;
    const cum = { v: 0 };
    const totalEl = mk('b', { class: 'en-total-n', text: instant() ? fmt(data.score) : '0' });
    data.rows.forEach((r, i) => {
      const val = mk('b', { class: 'en-row-pts' });
      const sign = r.pts < 0 ? '-' : '+';
      const f = (n) => sign + fmt(Math.abs(n));
      const nEl = mk('span', { class: 'en-row-n', text: r.noCount ? '' : 'x ' + fmt(r.n) });
      const row = mk('div', { class: 'en-row' + (r.pts === 0 ? ' zero' : '') + (r.pts < 0 ? ' neg' : ''), role: 'listitem', 'aria-label': r.label + ' ' + (r.noCount ? '' : fmt(r.n) + ', ') + f(r.pts) + ' points' },
        mk('span', { class: 'en-row-ico', 'aria-hidden': 'true' }, iconOf(r.icon[0], r.icon[1], 24)), mk('span', { class: 'en-row-lab', text: r.label }), nEl, val);
      UI.vars(row, { '--i': i });
      list.appendChild(row);
      val.textContent = f(r.pts);
      if (!instant()) {
        row.classList.add('wait'); val.textContent = f(0);
        at(S, baseDelay + i * gap, () => {
          row.classList.remove('wait'); row.classList.add('show');
          snd('ink_gain');
          count(S, val, Math.abs(r.pts), { ms: 520, fmt: (n) => sign + fmt(n) });
          const before = cum.v; cum.v += r.pts;
          tweenN(S, before, cum.v, { ms: 520 }, (v) => { totalEl.textContent = fmt(Math.max(0, v)); });
        });
      }
    });
    if (!instant()) at(S, baseDelay + data.rows.length * gap + 500, () => { totalEl.textContent = fmt(data.score); });
    const total = mk('div', { class: 'en-total', role: 'group', 'aria-label': 'Total score ' + fmt(data.score) }, mk('span', { class: 'en-total-lab', text: 'Score' }), totalEl, UI.hanko(o.seal || 'SCORE', { size: 'lg' }));
    return { list, total, data, totalEl };
  }

  // ==================================================================================================================
  // CHAPTER CLEAR
  // ==================================================================================================================
  // what RUN.chapterEnd did to each hero, as a plan for the animation (RUN has already applied it: R.heroes holds the AFTER values)
  function healPlan(R, params) {
    const gain = ((params && params.maxHp) | 0) || 0;
    const healed = (params && Array.isArray(params.healed)) ? params.healed : [];
    const heroes = (R && R.heroes) || DEFAULT_PARTY.map((id) => ({ id, hp: DATA.heroes[id].maxHp, maxHp: DATA.heroes[id].maxHp }));
    return heroes.map((h) => {
      const e = healed.find((x) => x && x.id === h.id) || {};
      const n = Math.max(0, ((e.n !== undefined ? e.n : e.amount) | 0) || 0);
      const maxAfter = Math.max(1, h.maxHp | 0), hpAfter = clamp(h.hp | 0, 0, maxAfter);
      const hpMid = clamp(hpAfter - n, 0, maxAfter);
      const maxBefore = Math.max(1, maxAfter - gain);
      const hpBefore = clamp(hpMid - gain, 0, maxBefore);
      return { id: h.id, gain, healed: n, hpBefore, maxBefore, hpMid, hpAfter, maxAfter };
    });
  }

  // the hero a chapter's achievement writes into the book (Suzu after chapter 1, Raiga after chapter 2), if the player now has them
  function heroUnlockedBy(ch) {
    const id = DATA.LISTS.heroIds.find((h) => DATA.heroes[h].unlock && DATA.heroes[h].unlock.ach === 'ch' + ch + '_clear');
    if (!id) return null;
    return safe(() => META.isUnlocked('hero', id), false) ? id : null;
  }

  function drawGhost(ctx, id, x, y, sc, alpha, st) {
    if (typeof ART === 'undefined' || !ART || !isFn(ART.sprite) || !isFn(ART.blit) || !ART.enemy || !isFn(ART.enemy.bounds)) return false;
    try {
      const b = ART.enemy.bounds(id);
      const w = Math.ceil(b.w * sc + 80), h = Math.ceil(b.h * sc + 80);
      const spr = ART.sprite('end.ghost.' + id + '.' + sc, w, h, (g, ww, hh) => { ART.enemy.draw(g, id, { x: ww / 2, y: hh - 40, s: sc, pose: 'hurt', t: 0, pt: 1, alpha: 1, hpPct: 0 }); });
      const bob = reduced() ? 0 : Math.sin(st * 0.8) * 3;
      ART.blit(ctx, spr, x - w / 2, y + 40 - h + bob, w, h, alpha);
      return true;
    } catch (e) { warnOnce('boss ghost', e); return false; }
  }

  function paintClear(ctx, t, S) {
    const x = S.extra;
    artScene(ctx, 'ch' + x.ch, t, { particles: 1.5, parallaxX: Math.sin(S.t * 0.2) * 14 }, -146);
    // warm light spilling over the scene: the page is turning in the heroes' favour
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(640, 150, 20, 640, 260, 760);
    g.addColorStop(0, 'rgba(255,214,140,0.28)'); g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    vignette(ctx, 0.5);
    flecks(ctx, S, t, 36, '#ffe9a8');
    const ground = 372;
    // the boss, undone: the die pose plays once (SCENE-free: ART.enemy.draw derives it from pt) and holds its end
    // the defeated boss: the hurt pose held (the die pose ends invisible), fading to a memory of itself. A boss is the costliest sprite in the game,
    // so after its first reaction it is baked once into a cached sprite and only that is blitted
    if (x.boss) {
      const fade = 1 - 0.58 * ease.inOut(clamp((S.t - 0.9) / 2.4, 0, 1));
      if (S.t < 0.8 || !drawGhost(ctx, x.boss, 1040, ground + 4, 0.62, fade, S.t)) artEnemy(ctx, x.boss, { x: 1040, y: ground + 4, s: 0.62, pose: 'hurt', t, pt: Math.max(0, S.t - 0.3), alpha: fade, hpPct: 0 });
    }
    x.cast.forEach((id, i) => {
      const k = ease.outCubic(clamp((S.t - 0.2 - i * 0.18) / 0.6, 0, 1));
      artHero(ctx, id, { x: (i === 0 ? 330 : 170) - (1 - k) * 60, y: ground, s: i === 0 ? 0.98 : 0.92, pose: 'cheer', t, pt: Math.max(0, S.t - 0.5 - i * 0.18), alpha: k });
    });
  }

  const chapterClear = {
    music: 'victory',
    _t: { healPlan, heroUnlockedBy, tipFor, state: () => CUR },
    enter(params, root) {
      const S = begin('chapterClear', params, root);
      const R = S.R;
      const ch = clamp(((params && params.chapter) | 0) || (R && R.chapter > 1 ? R.chapter - 1 : 1), 1, 3);
      const next = ((params && params.next) | 0) || ch + 1;
      const cast = castFor('', R, null);
      const lore = loreOf('ch' + ch + '_clear');
      const bossId = DATA.FIXED && DATA.FIXED.bosses ? DATA.FIXED.bosses[ch] : null;
      const bossDef = bossId ? DATA.enemies[bossId] : null;
      Object.assign(S.extra, { ch, next, cast, boss: bossId });
      safe(() => { if (lore) META.markLore('ch' + ch + '_clear'); });
      S.paint = paintClear;
      tapLayer(S, () => flush(S));
      snd('victory');

      // ---- the banner
      const title = lore ? lore.title : 'Chapter ' + U.roman(ch) + ' Complete';
      const unlockedHero = heroUnlockedBy(ch);
      const banner = mk('header', { class: 'cc-banner' },
        mk('p', { class: 'cc-kicker', text: 'CHAPTER ' + (numberWord[ch] || ch) + ' COMPLETE' }),
        mk('h1', { class: 'cc-title', text: title }),
        mk('i', { class: 'cc-flourish', 'aria-hidden': 'true' }, mk('b'), mk('b'), mk('b')),
        bossDef ? mk('p', { class: 'cc-boss', text: bossDef.name + (bossDef.title ? ', ' + bossDef.title : '') + ', is undone' }) : null);
      root.appendChild(banner);
      if (unlockedHero) {
        const card = mk('div', { class: 'cc-newhero', role: 'status', 'aria-label': heroName(unlockedHero) + ' joins the book' },
          mk('span', { class: 'cc-nh-med' }, UI.medallion(unlockedHero, 52)),
          mk('span', { class: 'cc-nh-text' }, mk('b', { text: heroName(unlockedHero) + ' joins the book' }), mk('i', { text: heroTitle(unlockedHero) + '. Waiting on the hero select.' })),
          UI.hanko('NEW', { size: 'sm' }));
        root.appendChild(card);
        at(S, 2600, () => { card.classList.add('show'); snd('unlock'); });
        if (instant()) card.classList.add('show');
      }

      // ---- left: the lore, in a scroll
      const textEl = mk('p', { class: 'cc-lore', text: lore ? lore.text : 'The page turns. Whatever held this chapter together has let go.' });
      const leftCard = scroll('cc-scroll', 'The Page Turns', textEl);

      // ---- middle: the run so far
      const st = (R && R.stats) || {};
      const tiles = [
        statTile(S, iconOf('relic', 'hourglass', 30), 'Turns', st.turns | 0, { delay: 900 }),
        statTile(S, iconOf('type', 'attack', 30), 'Damage', st.damageDealt | 0, { delay: 1000 }),
        statTile(S, iconOf('type', 'skill', 30), 'Cards', st.cardsPlayed | 0, { delay: 1100 }),
        statTile(S, iconOf('stat', 'gold', 30), 'Gold', R ? R.gold | 0 : 0, { delay: 1200 }),
        statTile(S, iconOf('motif', 'skull', 30), 'Foes', st.kills | 0, { delay: 1300 }),
        statTile(S, iconOf('stat', 'ink', 30), 'Hexes', st.hexesPainted | 0, { delay: 1400 }),
      ];
      tiles.forEach((el, i) => UI.vars(el, { '--i': i }));
      const midCard = lacquer('cc-stats', 'The Tale So Far', mk('div', { class: 'cc-tiles' }, ...tiles));

      // ---- right: what the page gave back
      const plan = healPlan(R, params);
      const rows = plan.map((p, i) => {
        const badge = UI.heroBadge(p.id, { size: 'md', hp: instant() ? p.hpAfter : p.hpBefore, maxHp: instant() ? p.maxAfter : p.maxBefore });
        const maxChip = mk('span', { class: 'cc-chip max' + (instant() ? ' on' : ''), text: '+' + p.gain + ' max HP' });
        const healChip = mk('span', { class: 'cc-chip heal' + (instant() ? ' on' : ''), text: '+' + p.healed + ' healed' });
        if (!p.gain) maxChip.hidden = true;
        if (!p.healed) healChip.hidden = true;
        const row = mk('div', { class: 'cc-hero' }, badge, mk('div', { class: 'cc-chips' }, maxChip, healChip));
        UI.vars(row, { '--i': i });
        if (!instant()) {
          at(S, 1700 + i * 260, () => {
            if (p.gain) { badge.rbSet({ hp: p.hpMid, maxHp: p.maxAfter }); maxChip.classList.add('on'); snd('level_up'); UI.floatText(stageX(badge), stageY(badge), '+' + p.gain + ' max HP', 'good'); }
            else badge.rbSet({ hp: p.hpMid, maxHp: p.maxAfter });
          });
          at(S, 2500 + i * 260, () => {
            healChip.classList.add('on');
            if (p.healed) { snd('heal'); UI.floatText(stageX(badge), stageY(badge), '+' + p.healed, 'heal'); }
            tweenN(S, p.hpMid, p.hpAfter, { ms: 700 }, (v) => badge.rbSet({ hp: v, maxHp: p.maxAfter }));
          });
        }
        return row;
      });
      const relics = (R && R.relics) || [];
      const relicRow = mk('div', { class: 'cc-relics', role: 'list', 'aria-label': 'Treasures carried' });
      relics.slice(0, 8).forEach((id) => { const r = UI.relic(id, { size: 'sm' }); r.setAttribute('role', 'listitem'); relicRow.appendChild(r); });
      if (relics.length > 8) relicRow.appendChild(mk('span', { class: 'cc-more', text: '+' + (relics.length - 8) }));
      if (!relics.length) relicRow.appendChild(mk('span', { class: 'cc-none', text: 'None yet' }));
      const inkStat = R ? UI.stat('ink', R.ink | 0, { max: R.inkMax | 0, size: 'sm' }) : null;
      const rightCard = lacquer('cc-boons', 'What the Page Gives', mk('div', { class: 'cc-heroes' }, ...rows),
        mk('div', { class: 'cc-extra' }, inkStat, mk('span', { class: 'cc-rel-lab', text: 'Treasures ' + relics.length }), relicRow));

      root.appendChild(mk('div', { class: 'cc-cols' }, leftCard, midCard, rightCard));

      // ---- the foot: a tip and Continue
      const tip = tipFor(R, 'clear' + ch);
      const go = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => proceed(S) });
      go.classList.add('cc-go');
      const foot = mk('footer', { class: 'cc-foot' }, tip ? mk('p', { class: 'cc-tip' }, UI.hanko('TIP', { size: 'sm' }), mk('span', { text: tip })) : mk('span'), go);
      root.appendChild(foot);
      if (hasLiveRun(R)) root.appendChild(UI.menuButton());
      petals(S, 18);
      UI.announce('Chapter ' + ch + ' complete. ' + title);
      if (instant()) flush(S);
    },
    update(dt) { if (CUR && CUR.kind === 'chapterClear') step(CUR, dt); },
    draw(ctx, t) { if (CUR && CUR.kind === 'chapterClear' && CUR.paint) CUR.paint(ctx, t, CUR); },
    onKey(e) {
      const S = CUR;
      if (!S || S.kind !== 'chapterClear' || S.dead) return false;
      if (!armed(S)) return false;
      if (e.target && e.target.closest && e.target.closest('button, [role=button]')) return false;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); proceed(S); return true; }
      return false;
    },
    leave() { endVisit(CUR); },
  };
  UI.screens.chapterClear = chapterClear;

  // the stage position of an element's top-centre, for floating numbers
  function stageX(el) { const r = el.getBoundingClientRect(); return UI.toStage((r.left + r.right) / 2, r.top).x; }
  function stageY(el) { const r = el.getBoundingClientRect(); return UI.toStage(r.left, r.top).y; }

  function proceed(S) {
    if (!S || S.dead || S.leaving) return;
    S.leaving = true;
    flush(S);
    snd('page_turn');
    const g = game();
    if (g && isFn(g.nodeDone)) g.nodeDone(); else UI.toTitle();
  }

  // ==================================================================================================================
  // GAME OVER
  // ==================================================================================================================
  function paintOver(ctx, t, S) {
    const x = S.extra;
    artScene(ctx, 'defeat', t, { particles: 0.7 });
    // the ink pulls back: a paper-coloured wash lifts off the page as the screen settles
    const wash = clamp(1 - S.t / 2.2, 0, 1);
    if (wash > 0.01) { ctx.save(); ctx.globalAlpha = wash * 0.8; ctx.fillStyle = '#f3e6c8'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    vignette(ctx, 0.28, '36,26,58');
    const ground = 376;
    x.cast.forEach((id, i) => {
      const k = ease.outCubic(clamp((S.t - 0.5 - i * 0.3) / 0.9, 0, 1));
      // the heroes fade toward the colour of the paper over a few seconds, like ink drying out of the page
      const fade = 1 - 0.4 * clamp((S.t - 2) / 5, 0, 1);
      artHero(ctx, id, { x: 130 + i * 150, y: ground + (1 - k) * 18, s: 0.86, pose: 'down', t, pt: Math.max(0, S.t - 0.3 - i * 0.3), alpha: k * fade, glow: 0 });
    });
  }

  function tapRecap(S, sm, R) {
    // a compact recap: a fan of the deck (tap to open it) and the treasures (tap to read them)
    const deck = (R && Array.isArray(R.deck)) ? R.deck : [];
    const relics = (sm.relics && sm.relics.length ? sm.relics : (R && R.relics) || []).slice();
    const fan = mk('div', { class: 'go-fan', role: 'group', 'aria-label': 'Deck' });
    const RANK = { rare: 3, uncommon: 2, common: 1 };
    const rank = (c) => (RANK[(DATA.cards[c.id] || {}).rarity] || 0) * 2 + (c.up ? 1 : 0);
    const shown = deck.slice().sort((a, b) => rank(b) - rank(a)).slice(0, 6);
    shown.forEach((inst, i) => {
      const c = UI.card(inst, { size: 'mini', tip: false, onclick: () => { UI.overlay.open('deck', { mode: 'view', cards: deck.slice() }); } });
      UI.vars(c, { '--i': i, '--n': shown.length });
      fan.appendChild(c);
    });
    const deckBtn = UI.btn((deck.length || sm.deckSize | 0) + ' cards', { kind: 'secondary', size: 'sm', icon: { kind: 'type', id: 'skill', size: 22 }, onclick: () => { if (deck.length) UI.overlay.open('deck', { mode: 'view', cards: deck.slice() }); else UI.toast('The deck was not kept with this page', 'warn'); } });
    deckBtn.classList.add('go-deckbtn');
    const rel = mk('div', { class: 'go-relics', role: 'list', 'aria-label': 'Treasures' });
    relics.slice(0, 7).forEach((id) => { const r = UI.relic(id, { size: 'sm' }); r.setAttribute('role', 'listitem'); rel.appendChild(r); });
    if (relics.length > 7) rel.appendChild(mk('span', { class: 'go-more', text: '+' + (relics.length - 7) }));
    if (!relics.length) rel.appendChild(mk('span', { class: 'go-none', text: 'No treasures' }));
    const relBtn = UI.btn('Treasures ' + relics.length, { kind: 'secondary', size: 'sm', onclick: () => { if (relics.length) UI.overlay.open('relics', { relics: relics.slice() }); else UI.toast('No treasures were found on this tale', 'info'); } });
    relBtn.classList.add('go-relbtn');
    const panel = UI.panel({ kind: 'paper', gold: true, class: 'go-recap en-card pad-top' },
      mk('h2', { class: 'en-h' }, mk('span', { text: 'The Tale Kept' })),
      mk('div', { class: 'go-recap-row' }, deck.length ? fan : mk('span', { class: 'go-none', text: 'No deck to show' }), deckBtn),
      mk('div', { class: 'go-recap-row' }, rel, relBtn));
    return panel;
  }

  const gameOver = {
    music: 'defeat',
    _t: { scoreRows, summaryText, unlockEntries, summaryOf, tipFor, state: () => CUR },
    enter(params, root) {
      const S = begin('gameOver', params, root);
      const R = S.R;
      const sm = summaryOf(params, R, false);
      const rec = recordOf(params, sm);
      const cast = castFor('', R, sm);
      const lore = loreOf('defeat');
      Object.assign(S.extra, { sm, rec, cast });
      safe(() => { if (lore) META.markLore('defeat'); });
      S.paint = paintOver;
      tapLayer(S, () => flush(S));
      snd('defeat');

      const ch = clamp(sm.chapter | 0 || 1, 1, 3);
      const chTitle = (loreOf('ch' + ch + '_intro') || {}).title || '';

      // ---- header
      root.appendChild(mk('header', { class: 'go-head' },
        mk('p', { class: 'go-kicker', text: 'THE TALE ENDS' }),
        mk('h1', { class: 'go-title', text: lore ? lore.title : 'The Page Goes White' }),
        mk('p', { class: 'go-fell', text: 'Fell on page ' + U.roman(ch) + (chTitle ? ': ' + chTitle : '') + (sm.trial ? '  |  Ink Trial ' + sm.trial : '') + (sm.daily ? '  |  Daily Tale' : '') })));

      // ---- left: the fallen, and what the tale kept
      // the party fell: RUN keeps the last HP of a lost fight, but the page shows them as they ended, at 0
      const fallen = mk('div', { class: 'go-fallen' }, ...(sm.heroes || []).map((h) => UI.heroBadge(h.id, { size: 'md', hp: 0, maxHp: h.maxHp | 0 })));
      root.appendChild(mk('div', { class: 'go-left' }, fallen, tapRecap(S, sm, R)));

      // ---- middle: the lore, a tip, the buttons
      const loreCard = scroll('go-lore', null, mk('p', { class: 'go-lore-text', text: lore ? lore.text : 'The ink thinned, and the page went white. Turn it, and try again.' }));
      const tip = tipFor(R, 'over');
      const again = UI.btn('Try Again', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => tryAgain(S, sm) });
      again.classList.add('go-again');
      const title = UI.btn('Title', { kind: 'secondary', size: 'lg', onclick: () => toTitle(S) });
      title.classList.add('go-title-btn');
      root.appendChild(mk('div', { class: 'go-mid' }, loreCard,
        tip ? mk('p', { class: 'go-tip' }, UI.hanko('TIP', { size: 'sm' }), mk('span', { text: tip })) : null,
        mk('div', { class: 'go-btns' }, again, title)));

      // ---- right: the score ledger, then Inkstones and what is new
      const led = ledger(S, sm, R, { delay: 1000, seal: 'FIN' });
      const scoreCard = lacquerSplit('go-score', 'Final Score', [led.list], led.total);
      const stones = mk('div', { class: 'go-stones' });
      const stoneNum = mk('b', { class: 'go-stone-n' });
      if (rec) {
        const earned = rec.inkstones | 0;
        stones.appendChild(mk('div', { class: 'go-stone-main' }, iconOf('stat', 'inkstone', 40), mk('span', { class: 'go-stone-lab', text: 'Inkstones earned' }), stoneNum));
        count(S, stoneNum, earned, { ms: 900, delay: 1000 + led.data.rows.length * 260 + 600, fmt: (n) => '+' + fmt(n) });
        if (instant()) stoneNum.textContent = '+' + fmt(earned);
        const sub = [];
        if (rec.bonus) sub.push('Achievement bonus +' + fmt(rec.bonus));
        if (typeof rec.total === 'number') sub.push('Library total ' + fmt(rec.total));
        if (sub.length) stones.appendChild(mk('p', { class: 'go-stone-sub', text: sub.join('  |  ') }));
        const ents = unlockEntries(rec, sm);
        const list = mk('div', { class: 'en-unlocks' });
        ents.forEach((e, i) => list.appendChild(unlockRow(S, e, i)));
        if (!ents.length) list.appendChild(mk('p', { class: 'en-unlock-none', text: 'Nothing new this time. The next page might be the one.' }));
        stones.appendChild(list);
      } else {
        stones.appendChild(mk('p', { class: 'en-unlock-none', text: 'This run was not recorded, so no Inkstones were paid.' }));
      }
      const stonesCard = lacquer('go-stonescard', 'The Book Remembers', stones);
      root.appendChild(mk('div', { class: 'go-right' }, scoreCard, stonesCard));
      UI.announce('The tale ends. Score ' + fmt(sm.score || 0));
      if (instant()) flush(S);
    },
    update(dt) { if (CUR && CUR.kind === 'gameOver') step(CUR, dt); },
    draw(ctx, t) { if (CUR && CUR.kind === 'gameOver' && CUR.paint) CUR.paint(ctx, t, CUR); },
    onKey(e) {
      const S = CUR;
      if (!S || S.kind !== 'gameOver' || S.dead) return false;
      if (!armed(S)) return false;
      if (e.target && e.target.closest && e.target.closest('button, [role=button]')) return false;
      if (e.key === 'Enter') { e.preventDefault(); tryAgain(S, S.extra.sm); return true; }
      if (e.key === 'Escape') { e.preventDefault(); toTitle(S); return true; }
      return false;
    },
    leave() { endVisit(CUR); },
  };
  UI.screens.gameOver = gameOver;

  function tryAgain(S, sm) {
    if (!S || S.dead || S.leaving) return;
    const g = game();
    const ids = ((sm && sm.heroes) || []).map((h) => h.id).filter((h) => DATA.heroes[h]);
    if (!g || !isFn(g.newRun) || ids.length !== 2) { UI.toast('Choose your heroes from the title to begin again', 'warn'); return toTitle(S); }
    S.leaving = true;
    snd('page_turn');
    g.newRun({ heroes: ids, trial: sm.trial | 0, daily: !!sm.daily, seed: sm.daily ? sm.seed : undefined });
  }
  function toTitle(S) {
    if (!S || S.dead || S.leaving) return;
    S.leaving = true;
    const g = game();
    if (g && isFn(g.toTitle)) g.toTitle(); else UI.toTitle();
  }

  // ==================================================================================================================
  // VICTORY
  // ==================================================================================================================
  // one closing line per hero for the curtain call (kept short: they sit under the heroes at 14 px)
  const CURTAIN = {
    hanae: 'Hanae sheathed her blade and glanced about to see who had noticed how well that went. Everyone had. She studied the sky.',
    kuro: 'Kuro pushed up his glasses, smudged ink across his nose, and began writing the margins of the next story. He called it research.',
    suzu: 'Suzu tied a new ribbon to the shrine bell and listened. For the first time in a very long while, nothing was fraying.',
    raiga: 'Raiga laughed so hard the thunder came to see what was funny, then stayed for tea. Nobody asked it to leave.',
  };

  // pieces of the share card, kept separate so the card is easy to read
  function spaced(ctx, text, cx, y, gap) {
    const widths = Array.from(text).map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    Array.from(text).forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + gap; });
    ctx.textAlign = 'center';
  }
  function plaquePath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // the share card: heroes, score, seed, trial, deck size, on the dawn scene. d = {heroes, score, trial, seed, deckSize, relics, chapters, daily, win}
  function drawCard(ctx, w, h, d, t) {
    artSceneSized(ctx, d.win === false ? 'defeat' : 'victory', t || 0, { particles: 0 }, w, h);
    const sh = ctx.createLinearGradient(0, 0, w, 0);
    sh.addColorStop(0, 'rgba(13,11,30,0.55)'); sh.addColorStop(0.55, 'rgba(13,11,30,0.1)'); sh.addColorStop(1, 'rgba(13,11,30,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    const ids = (d.heroes || DEFAULT_PARTY).slice(0, 2);
    ids.forEach((id, i) => {
      framed(ctx, { x: 16 + i * 80, y: 26 + i * 84, w: 138, h: 184, rot: i ? 0.045 : -0.05, color: heroColor(id), skew: 10 }, (g, fw, fh) => artPortrait(g, id, { x: 0, y: 0, w: fw, h: fh, expr: d.win === false ? 'hurt' : 'smile', t: t || 0 }));
    });
    // the plaque
    const px = 236, py = 16, pw = w - px - 16, ph = h - 32;
    ctx.save();
    ctx.shadowColor = 'rgba(5,3,18,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    plaquePath(ctx, px, py, pw, ph, 10); ctx.fillStyle = '#140f2e'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const gold = ctx.createLinearGradient(px, py, px + pw, py + ph);
    gold.addColorStop(0, '#a87420'); gold.addColorStop(0.25, '#ffe9a8'); gold.addColorStop(0.5, '#d9a441'); gold.addColorStop(0.75, '#fff2c0'); gold.addColorStop(1, '#b98a2f');
    plaquePath(ctx, px + 2, py + 2, pw - 4, ph - 4, 9); ctx.fillStyle = gold; ctx.fill();
    const paper = ctx.createLinearGradient(px, py, px, py + ph);
    paper.addColorStop(0, '#fdf3da'); paper.addColorStop(0.5, '#f3e6c8'); paper.addColorStop(1, '#e6d3a3');
    plaquePath(ctx, px + 6, py + 6, pw - 12, ph - 12, 7); ctx.fillStyle = paper; ctx.fill();
    ctx.restore();
    if (typeof ART !== 'undefined' && ART && ART.tk && isFn(ART.tk.paperGrain)) safe(() => { ctx.save(); plaquePath(ctx, px + 6, py + 6, pw - 12, ph - 12, 7); ctx.clip(); ART.tk.paperGrain(ctx, px, py, pw, ph, { alpha: 0.5 }); ctx.restore(); });
    const cx = px + pw / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '800 31px Georgia, "Hiragino Mincho ProN", serif';
    ctx.fillStyle = '#140f2e';
    spaced(ctx, 'INKWOVEN', cx, py + 52, 5);
    ctx.font = '800 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#a91d2c';
    spaced(ctx, d.win === false ? 'THE TALE ENDED ON PAGE ' + (d.chapter || 1) : 'THE ENDING, REWRITTEN', cx, py + 72, 3);
    const rule = ctx.createLinearGradient(px + 30, 0, px + pw - 30, 0);
    rule.addColorStop(0, 'rgba(185,138,47,0)'); rule.addColorStop(0.5, '#b98a2f'); rule.addColorStop(1, 'rgba(185,138,47,0)');
    ctx.fillStyle = rule; ctx.fillRect(px + 30, py + 82, pw - 60, 3);
    ctx.font = '700 20px Georgia, serif'; ctx.fillStyle = '#241a3a';
    ctx.fillText(ids.map(heroName).join(' and '), cx, py + 112);
    ctx.font = 'italic 12px Georgia, serif'; ctx.fillStyle = 'rgba(36,26,58,0.7)';
    ctx.fillText(ids.map(heroTitle).join('  |  '), cx, py + 129);
    ctx.font = '800 11px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#7d5a1c';
    spaced(ctx, 'SCORE', cx, py + 156, 4);
    ctx.font = '900 58px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#140f2e';
    const sc = fmt(d.score || 0);
    ctx.strokeText(sc, cx, py + 206); ctx.fillStyle = '#ffd36a'; ctx.fillText(sc, cx, py + 206);
    // the small facts, two by two
    const facts = [
      [d.daily ? 'DAILY TALE' : 'INK TRIAL', d.daily ? String(d.seed >>> 0) : String(d.trial | 0)],
      ['SEED', String(d.seed >>> 0)],
      ['DECK', U.plural(d.deckSize | 0, 'card')],
      ['TREASURES', String((d.relics || []).length)],
    ];
    const fy = py + 232;
    facts.forEach((f, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const fx = px + 24 + col * ((pw - 48) / 2) + ((pw - 48) / 4);
      ctx.font = '800 9px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#7d5a1c';
      spaced(ctx, f[0], fx, fy + row * 32, 2);
      ctx.font = '800 15px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#241a3a';
      ctx.fillText(f[1], fx, fy + 14 + row * 32);
    });
    // the seal
    ctx.save();
    ctx.translate(px + pw - 38, py + 40); ctx.rotate(-0.14);
    plaquePath(ctx, -22, -22, 44, 44, 9); ctx.fillStyle = '#e8383d'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,248,240,0.9)'; plaquePath(ctx, -18, -18, 36, 36, 6); ctx.stroke();
    ctx.fillStyle = '#fff8f0'; ctx.font = '900 14px Georgia, serif'; ctx.textBaseline = 'middle'; ctx.fillText(d.win === false ? 'FIN' : 'END', 0, 1);
    ctx.restore();
    // a thin frame around the whole card
    ctx.strokeStyle = 'rgba(245,201,106,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  }
  function artSceneSized(ctx, id, t, opts, w, h) {
    let ok = false;
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.draw)) {
      try { ok = ART.scene.draw(ctx, id, w, h, t, opts || {}) !== false; } catch (e) { warnOnce('ART.scene.draw card', e); }
    }
    if (!ok) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f5c0a0'); g.addColorStop(1, '#3b2a7a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  }

  const CAST_X = [250, 510, 770, 1030];
  // all four heroes, the party first
  function curtainOrder(partyIds) {
    const all = DATA.LISTS.heroIds.slice();
    const first = partyIds.filter((h) => all.indexOf(h) >= 0);
    return first.concat(all.filter((h) => first.indexOf(h) < 0));
  }

  function paintVictory(ctx, t, S) {
    const x = S.extra, pt = S.t - x.phaseAt;
    artScene(ctx, 'victory', t, { particles: 1.6, parallaxX: Math.sin(S.t * 0.2) * 16 });
    if (x.phase === 'show') { ctx.fillStyle = 'rgba(13,11,30,0.55)'; ctx.fillRect(0, 0, W, H); vignette(ctx, 0.5); flecks(ctx, S, t, 40, '#ffe9a8'); return; }
    vignette(ctx, 0.32, '36,26,58');
    flecks(ctx, S, t, 30, '#fff2c0');
    if (x.phase === 'story') {
      x.party.forEach((id, i) => {
        const k = ease.outCubic(clamp((pt - 0.3 - i * 0.3) / 0.7, 0, 1));
        artHero(ctx, id, { x: i === 0 ? 150 : 1130, y: 664, s: 0.9, pose: 'cheer', t, pt: Math.max(0, pt - 0.5 - i * 0.3), alpha: k, flip: i === 1 });
      });
    } else if (x.phase === 'cast') {
      x.order.forEach((id, i) => {
        const t0 = 0.4 + i * 1.05, travel = 0.95, k = clamp((pt - t0) / travel, 0, 1);
        if (pt < t0) return;
        const inParty = x.party.indexOf(id) >= 0;
        const px = -130 + (CAST_X[i] + 130) * ease.outCubic(k);
        const arrived = k >= 1;
        const pose = !arrived ? 'walk' : inParty ? 'cheer' : 'idle';
        artHero(ctx, id, { x: px, y: 578, s: inParty ? 1.0 : 0.94, pose, t, pt: Math.max(0, pt - t0 - travel), alpha: 1 });
        if (arrived && pt - t0 - travel < 0.7 && typeof ART !== 'undefined' && ART && ART.fx && isFn(ART.fx.sparkle)) safe(() => ART.fx.sparkle(ctx, { x: px, y: 452, s: 1.8, seed: i + 3, color: '#ffe9a8' }, (pt - t0 - travel) / 0.7));
      });
    }
  }

  function buildEpilogue(S) {
    const x = S.extra, root = S.root;
    const lore = loreOf('victory');
    const title = lore ? lore.title : 'The Ending, Rewritten';
    const text = lore ? lore.text : 'The last line is written, and left open on purpose. The book turns itself to page one.';
    const dropCap = /^[A-Za-z]/.test(text);
    const words = String(title).split(' ');
    const head = mk('header', { class: 'st-head' },
      mk('p', { class: 'st-kicker', text: 'EPILOGUE' }),
      mk('h1', { class: 'st-title' }, ...words.map((w, i) => [i ? ' ' : null, UI.vars(mk('span', { class: 'st-w', text: w }), { '--i': i })])),
      mk('i', { class: 'st-flourish', 'aria-hidden': 'true' }, mk('b', { class: 'fl-l' }), mk('b', { class: 'fl-m' }), mk('b', { class: 'fl-r' })));
    const typed = mk('span', { class: 'st-typed' });
    const para = mk('p', { class: 'st-text', 'aria-hidden': 'true' }, dropCap ? mk('span', { class: 'st-drop' }, mk('b', { text: text[0] })) : null, typed);
    const bodyEl = mk('div', { class: 'st-body' }, para, mk('p', { class: 'sr-only', text: title + '. ' + text }));
    const skip = UI.btn('Skip', { kind: 'secondary', onclick: () => gotoPhase(S, 'show'), key: 'Esc' });
    const turn = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => tapVictory(S) });
    turn.classList.add('st-turn');
    const foot = mk('footer', { class: 'st-foot' }, skip, mk('span', { class: 'st-hint', text: 'Tap the page to read on' }), turn);
    const page = UI.panel({ kind: 'paper', gold: true, class: 'st-page vc-page' }, head, bodyEl, foot);
    page.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('button')) return; tapVictory(S); });
    const seal = mk('div', { class: 'st-seal vc-seal', 'aria-hidden': 'true' }, UI.hanko('END', { size: 'lg' }));
    root.appendChild(page); root.appendChild(seal);
    x.nodes.push(page, seal);
    S.tw = typewriter(S, typed, dropCap ? text.slice(1) : text, { cps: 30, delay: 800, onType: () => followPen(bodyEl) });
    S.tw.then(() => { root.classList.add('st-done'); S.doneAt = S.t; });
    atPhase(S, 560, () => { snd('ink_splash'); seal.classList.add('stamped'); });
    UI.announce(title);
  }

  function buildCast(S) {
    const x = S.extra, root = S.root;
    root.classList.remove('st-done');
    const head = mk('header', { class: 'vc-cast-head' }, mk('p', { class: 'vc-cast-kicker', text: 'CURTAIN CALL' }), mk('h1', { class: 'vc-cast-title', text: 'Everyone Who Was Ever Written In' }),
      mk('i', { class: 'st-flourish', 'aria-hidden': 'true' }, mk('b', { class: 'fl-l' }), mk('b', { class: 'fl-m' }), mk('b', { class: 'fl-r' })));
    const caps = mk('div', { class: 'vc-caps' });
    x.order.forEach((id, i) => {
      const h = DATA.heroes[id];
      const cap = mk('div', { class: 'vc-cap' + (x.party.indexOf(id) >= 0 ? ' party' : ''), role: 'group', 'aria-label': h.name },
        mk('b', { class: 'vc-cap-name', text: h.name }), mk('span', { class: 'vc-cap-title', text: h.title }), mk('p', { class: 'vc-cap-line', text: CURTAIN[id] || '' }));
      UI.vars(cap, { '--hc': h.color, '--x': CAST_X[i] + 'px' });
      caps.appendChild(cap);
      atPhase(S, (0.4 + i * 1.05 + 0.95) * 1000, () => { cap.classList.add('show'); });
    });
    const go = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => tapVictory(S) });
    go.classList.add('vc-cast-go');
    const skip = UI.btn('Skip', { kind: 'ghost', onclick: () => gotoPhase(S, 'show') });
    skip.classList.add('vc-cast-skip');
    root.appendChild(head); root.appendChild(caps); root.appendChild(go); root.appendChild(skip);
    x.nodes.push(head, caps, go, skip);
    atPhase(S, (0.4 + 3 * 1.05 + 1.6) * 1000, () => root.classList.add('vc-cast-done'));
    snd('page_turn');
  }

  function buildShow(S) {
    const x = S.extra, root = S.root, sm = x.sm, R = S.R, rec = x.rec;
    root.classList.remove('st-done', 'vc-cast-done');
    const head = mk('header', { class: 'vc-head' }, UI.hanko('END', { size: 'lg' }), mk('div', {}, mk('p', { class: 'vc-kicker', text: 'THE LAST PAGE' }), mk('h1', { class: 'vc-title', text: 'The Ending, Rewritten' })));
    // the share card
    const cw = 600, ch = 338;
    const canvas = mk('canvas', { class: 'vc-card', 'aria-label': 'Summary card: ' + summaryText(sm, R, true).replace(/\n/g, '. ') });
    const px = UI.px || 1;
    canvas.width = Math.round(cw * px); canvas.height = Math.round(ch * px);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const cdata = { heroes: ((sm.heroes || []).map((h) => h.id)), score: sm.score || 0, trial: sm.trial | 0, seed: sm.seed, deckSize: sm.deckSize | 0, relics: sm.relics || [], chapters: (sm.stats && sm.stats.bossKills) | 0, daily: !!sm.daily, win: true };
    x.cardData = cdata;
    const g = safe(() => canvas.getContext('2d'), null);
    if (g) { g.setTransform(px, 0, 0, px, 0, 0); safe(() => drawCard(g, cw, ch, cdata, 0)); }
    const copy = UI.btn('Copy summary', { kind: 'primary', icon: { kind: 'type', id: 'skill', size: 22 }, onclick: () => copySummary(S) });
    copy.classList.add('vc-copy');
    const save = UI.btn('Save card', { kind: 'secondary', onclick: () => saveCard(S, canvas) });
    save.classList.add('vc-save');
    const cardWrap = mk('div', { class: 'vc-cardwrap' }, canvas, mk('div', { class: 'vc-cardbtns' }, copy, save));

    // inkstones (beside Continue) and what is new
    const foot = mk('div', { class: 'vc-foot' });
    const list = mk('div', { class: 'en-unlocks' });
    if (rec) {
      const n = mk('b', { class: 'go-stone-n' });
      count(S, n, rec.inkstones | 0, { ms: 1100, delay: 2600, fmt: (v) => '+' + fmt(v) });
      if (instant()) n.textContent = '+' + fmt(rec.inkstones | 0);
      const sub = [];
      if (rec.bonus) sub.push('bonus +' + fmt(rec.bonus));
      if (typeof rec.total === 'number') sub.push('library ' + fmt(rec.total));
      foot.appendChild(mk('div', { class: 'vc-stone' }, iconOf('stat', 'inkstone', 44),
        mk('div', { class: 'vc-stone-t' }, mk('span', { class: 'go-stone-lab', text: 'Inkstones earned' }), sub.length ? mk('span', { class: 'go-stone-sub', text: sub.join('  |  ') }) : null), n));
      const ents = unlockEntries(rec, sm);
      ents.forEach((e, i) => list.appendChild(unlockRow(S, e, i)));
      if (!ents.length) list.appendChild(mk('p', { class: 'en-unlock-none', text: 'No new unlocks this time. Spend your Inkstones in the Library.' }));
    } else {
      foot.appendChild(mk('div', { class: 'vc-stone' }));
      list.appendChild(mk('p', { class: 'en-unlock-none', text: 'This run was not recorded, so no Inkstones were paid.' }));
    }
    const stonesCard = lacquer('vc-newcard', 'New in the Book', list);

    // score and stats
    const led = ledger(S, sm, R, { delay: 700, gap: 230, seal: 'WIN' });
    const scoreCard = lacquerSplit('vc-score', 'Final Score', [led.list], led.total);
    const st = sm.stats || (R && R.stats) || {};
    const tiles = [
      statTile(S, iconOf('relic', 'hourglass', 28), 'Turns', st.turns | 0, { delay: 1400 }),
      statTile(S, iconOf('type', 'attack', 28), 'Damage', st.damageDealt | 0, { delay: 1500 }),
      statTile(S, iconOf('type', 'skill', 28), 'Cards played', st.cardsPlayed | 0, { delay: 1600 }),
      statTile(S, iconOf('motif', 'skull', 28), 'Foes', st.kills | 0, { delay: 1700 }),
    ];
    tiles.forEach((el, i) => UI.vars(el, { '--i': i }));
    const statRow = mk('div', { class: 'vc-tiles' }, ...tiles);
    const go = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => finishVictory(S) });
    go.classList.add('vc-go');
    foot.appendChild(go);
    const right = mk('div', { class: 'vc-right' }, scoreCard, statRow, foot);
    const left = mk('div', { class: 'vc-left' }, cardWrap, stonesCard);
    root.appendChild(head); root.appendChild(left); root.appendChild(right);
    x.nodes.push(head, left, right);
    snd('level_up');
    petals(S, 34);
  }

  // phases: 'story' (the typed epilogue), 'cast' (curtain call), 'show' (the showcase)
  const PHASE_BUILD = { story: buildEpilogue, cast: buildCast, show: buildShow };
  function atPhase(S, ms, fn) { at(S, S.t * 1000 + ms, fn); }
  function gotoPhase(S, name) {
    if (!S || S.dead || S.leaving) return;
    const x = S.extra;
    if (x.phase === name) return;
    if (S.tw) { S.tw.complete(); S.tw = null; }
    flush(S);
    (x.nodes || []).forEach((n) => safe(() => n.remove()));
    x.nodes = [];
    x.phase = name; x.phaseAt = S.t;
    S.root.classList.remove('en-settled');
    PHASE_BUILD[name](S);
    if (instant()) flush(S);
  }
  function tapVictory(S) {
    if (!S || S.dead || S.leaving) return;
    const x = S.extra;
    if (x.phase === 'story') {
      if (S.tw && !S.tw.done) { S.tw.complete(); S.doneAt = S.t; snd('ui_click'); return; }
      if (!headless() && S.t - S.doneAt < 0.22) return;
      gotoPhase(S, 'cast');
    } else if (x.phase === 'cast') {
      if (!headless() && S.timeline.length) { flush(S); S.doneAt = S.t; return; }
      if (!headless() && S.t - S.doneAt < 0.22) return;
      gotoPhase(S, 'show');
    } else flush(S);
  }
  function finishVictory(S) {
    if (!S || S.dead || S.leaving) return;
    S.leaving = true;
    snd('page_turn');
    const g = game();
    if (g && isFn(g.toTitle)) g.toTitle(); else UI.toTitle();
  }

  function copySummary(S) {
    const text = summaryText(S.extra.sm, S.R, true);
    let p = null;
    try { if (navigator.clipboard && navigator.clipboard.writeText) p = navigator.clipboard.writeText(text); } catch (e) { p = null; }
    if (p && isFn(p.then)) p.then(() => UI.toast('Summary copied', 'good'), () => UI.toast('Could not copy the summary', 'bad'));
    else UI.toast('Could not copy the summary', 'bad');
    S.extra.copied = text;
    return text;
  }
  function saveCard(S, canvas) {
    try {
      const a = mk('a', { href: canvas.toDataURL('image/png'), download: 'inkwoven-' + ((S.extra.sm.seed >>> 0) || 'tale') + '.png', style: { display: 'none' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      UI.toast('Card saved', 'good');
    } catch (e) { UI.toast('Could not save the card here. Copy the summary instead.', 'warn'); }
  }

  const victory = {
    music: 'victory',
    _t: { scoreRows, summaryText, unlockEntries, summaryOf, curtainOrder, drawCard, CURTAIN, state: () => CUR },
    enter(params, root) {
      const S = begin('victory', params, root);
      const R = S.R;
      const sm = summaryOf(params, R, true);
      const rec = recordOf(params, sm);
      const party = castFor('', R, sm);
      Object.assign(S.extra, { sm, rec, party, order: curtainOrder(party), phase: null, phaseAt: 0, nodes: [] });
      safe(() => META.markLore('victory'));
      S.paint = paintVictory;
      tapLayer(S, () => tapVictory(S));
      snd('victory');
      petals(S, 16);
      gotoPhase(S, 'story');
      if (instant()) flush(S);
    },
    update(dt) { if (CUR && CUR.kind === 'victory') step(CUR, dt); },
    draw(ctx, t) { if (CUR && CUR.kind === 'victory' && CUR.paint) CUR.paint(ctx, t, CUR); },
    onKey(e) {
      const S = CUR;
      if (!S || S.kind !== 'victory' || S.dead) return false;
      if (!armed(S)) return false;
      const onBtn = e.target && e.target.closest && e.target.closest('button, [role=button]');
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        if (onBtn && e.key !== 'ArrowRight') return false;
        e.preventDefault();
        if (S.extra.phase === 'show') finishVictory(S); else tapVictory(S);
        return true;
      }
      if (e.key === 'Escape' && S.extra.phase !== 'show') { e.preventDefault(); gotoPhase(S, 'show'); return true; }
      return false;
    },
    leave() { endVisit(CUR); },
  };
  UI.screens.victory = victory;
})();
