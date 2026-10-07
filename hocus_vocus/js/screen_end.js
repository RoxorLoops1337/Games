// Hocus Vocus: the story and ending screens (owner: story and endings engineer). One IIFE that registers into UI: the screens `story`,
// `chapterClear`, `gameOver` and `victory`. Styles live in css/end.css (classes en-* shared, st-* story, cc-* chapterClear, go-* gameOver,
// vc-* victory, all under .s-NAME). This header is the contract of record for screen_end.js.
//
// SCREENS (DESIGN 5.8, 5.10, 5.11, 6). Params are exactly what GAME routes: story {id, then?:{name, params}}, chapterClear {chapter, next, healed,
// maxHp, R}, gameOver and victory {summary, record, R}. R falls back to UI.run. Nothing is ever required: a page with no run, no lore entry, no
// record or no ART still renders and still has a way on.
//   story         A Tour Diary entry. ART.scene.draw of the page's scene (intro title, chN ch1..3, victory, defeat, hero pages camp), the party's bust
//                 portraits as tilted instant photo stickers (cream frame, tape, a strip in the hero colour), a cream gig-poster page with a pink and
//                 green print stripe and two strips of tape, a kicker, the entry title, a row of stage bulbs either side of a sparkle, a round sticker
//                 seal that stamps down, the first letter on a pink sticker and the text typed at 30 characters per second (a caret blinks at the end).
//                 A tap on the page, Enter, Space or Right completes the text, the next one turns the page (UI.go(then, {transition:'page'}), or
//                 UI.back() with no `then`); Skip, Esc or S turn it at once. Every shown page marks META.markLore(id). reduceMotion types instantly.
//   chapterClear  After a Headliner (Acts I and II): the Act's scene with the duo cheering, the Act number on a big round pink and green sticker,
//                 confetti and sparkles, the Headliner fading into a memory of itself, the chN_clear entry (title as the headline, text in a scroll),
//                 the tour so far counting up (turns, damage, cards, gold, foes, hexes), what RUN.chapterEnd did (max HP gain, healing: each hero's HP
//                 bar grows, then fills, with floating numbers), Vox, the Charms carried, a freshly unlocked hero (RawClaw after Act I, Andy after
//                 Act II), a tip and Continue, which calls GAME.nodeDone (the next Act's entry and map follow).
//   gameOver      The defeat page: the `defeat` scene under a Gloss sheen that lifts, the duo losing their voice at the stage edge and standing up
//                 again as the curtain twitches (STAND_AT), the `defeat` entry, the score broken down line by line (RUN.score's own terms, counting
//                 up) with the total, the Cheers META.recordRun paid, Stickers, outfits, heroes and Encores newly unlocked, a recap of the deck and
//                 Charms (tap to open the deck or Charm viewer), a tip, Try Again (same heroes, same Encore, GAME.newRun) and Title, and under
//                 them a slim ghost row with Share and Follow the duo (never Support: a lost tour is no time to ask).
//   victory       The grand ending in three beats: the `victory` entry typed over the dawn stage, a curtain call of all four heroes with a line each,
//                 then the showcase: the score breakdown and tour stats counting up, Cheers, Stickers, unlocks (RawClaw, Andy, the next Encore, a
//                 New outfit card), a share card drawn on a canvas (the duo card: the split pink and green ground, the logo, the duo cheering in
//                 their outfits, the score, the RJ monogram and the handle) with Copy summary, Save card and Share, a slim follow row under the
//                 Newly Unlocked card (the handle line, Follow the duo, and Support the duo once DATA.LINKS.support is set), and Continue to Title. The
//                 cast phase ends with one plain credit line and has no buttons for the duo. Petals and confetti fall throughout. Skip jumps to the showcase.
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
  const TAU = Math.PI * 2;
  // the house look (bible 3.6, HV_ART_AUDIO 1 and 9.1): candy pink and green stickers with a cream rim and the warm chibi line on the indigo night
  const HV = { pink: '#ff7eb6', pinkL: '#ffc2dc', pinkD: '#c93f78', green: '#3fcf6a', lime: '#c6ff3d', greenL: '#bff5cf', cream: '#fff8ec', paper: '#fff4e6', line: '#2d170f',
    gold: '#ffd84d', violet: '#a77bff', sky: '#7cc6ff', warm: '#fff4d6', peach: '#ffb38a' };
  const GLOSS = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];
  const CONFETTI = [HV.pink, HV.green, HV.gold, HV.sky, HV.violet, HV.cream];
  const ROUND = '"Arial Rounded MT Bold", "Nunito", "Quicksand", "Varela Round", "Trebuchet MS", Arial, "Liberation Sans", system-ui, sans-serif';
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // a 4-point sparkle, the house magic
  function spark(g, x, y, r, col, a, rot) {
    if (!(r > 0.2) || !(a > 0.01)) return;
    g.save(); g.globalAlpha *= clamp(a, 0, 1); g.translate(x, y); g.rotate(rot || 0);
    g.beginPath();
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; g.quadraticCurveTo(Math.cos(an + Math.PI / 4) * r * 0.16, Math.sin(an + Math.PI / 4) * r * 0.16, Math.cos(an + Math.PI / 2) * r, Math.sin(an + Math.PI / 2) * r); }
    g.closePath(); g.fillStyle = col; g.fill();
    g.restore();
  }

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
    if (id === 'intro') return { kicker: 'CURTAIN UP', seal: 'ONCE', scene: 'title', expr: 'determined' };
    if ((m = /^ch(\d)_intro$/.exec(id))) return { kicker: 'ACT ' + (numberWord[+m[1]] || m[1]), seal: U.roman(+m[1]), scene: 'ch' + clamp(+m[1], 1, 3), expr: 'determined' };
    if ((m = /^ch(\d)_clear$/.exec(id))) return { kicker: 'END OF ACT ' + (numberWord[+m[1]] || m[1]), seal: U.roman(+m[1]), scene: 'ch' + clamp(+m[1], 1, 3), expr: 'smile' };
    if (id === 'victory') return { kicker: 'FINALE', seal: 'BRAVO', scene: 'victory', expr: 'smile' };
    if (id === 'defeat') return { kicker: 'INTERMISSION', seal: 'PAUSE', scene: 'defeat', expr: 'hurt' };
    if ((m = /^hero_(\w+)$/.exec(id))) return { kicker: 'MEET THE CREW', seal: (heroName(m[1])[0] || '?').toUpperCase(), scene: 'camp', expr: 'determined' };
    return { kicker: 'A DIARY ENTRY', seal: '?', scene: 'event', expr: 'neutral' };
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
  // keep the caret in view while the page types itself. The unwritten rest of the text is already laid out (invisible), so scrolling to the bottom of the
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

  // typewriter: types `text` into el at cps characters per second, with a blinking caret at the end. tw.complete() finishes it; tw.then(fn)
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
  // a portrait as an instant photo sticker (HV_ART_AUDIO 3.4): a cream die-cut frame with a wide bottom edge, the warm line, a soft drop shadow,
  // a strip of tape on top and (o.color) a sticker strip in the hero colour on the wide edge. draw(ctx, w, h) paints the picture at its own origin.
  // o: x, y, w, h (the frame), rot, alpha, color; o.skew is accepted and ignored (the old slanted plaque)
  function framed(ctx, o, draw) {
    const w = o.w, h = o.h, m = Math.max(5, Math.round(w * 0.036)), mb = Math.max(18, Math.round(h * 0.1));
    ctx.save();
    ctx.translate(o.x + w / 2, o.y + h / 2);
    ctx.rotate(o.rot || 0);
    ctx.globalAlpha = clamp(o.alpha === undefined ? 1 : o.alpha, 0, 1);
    ctx.fillStyle = 'rgba(20,10,40,0.45)'; rrect(ctx, -w / 2 + 5, -h / 2 + 9, w, h, 9); ctx.fill();
    rrect(ctx, -w / 2, -h / 2, w, h, 9); ctx.fillStyle = HV.cream; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = HV.line; ctx.stroke();
    const px = -w / 2 + m, py = -h / 2 + m, pw = w - m * 2, ph = h - m - mb;
    ctx.save();
    rrect(ctx, px, py, pw, ph, 4); ctx.clip();
    ctx.translate(px, py);
    try { draw(ctx, pw, ph); } catch (e) { warnOnce('framed content', e); }
    ctx.restore();
    rrect(ctx, px, py, pw, ph, 4); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(45,23,15,0.55)'; ctx.stroke();
    if (o.color) { rrect(ctx, px + pw * 0.18, h / 2 - mb * 0.72, pw * 0.64, mb * 0.42, mb * 0.21); ctx.fillStyle = o.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = HV.line; ctx.stroke(); }
    ctx.save(); ctx.translate(0, -h / 2 + 2); ctx.rotate(-0.07);
    ctx.fillStyle = 'rgba(255,248,236,0.8)'; ctx.fillRect(-w * 0.16, -9, w * 0.32, 18);
    ctx.fillStyle = 'rgba(255,126,182,0.3)'; ctx.fillRect(-w * 0.16, -9, w * 0.32, 5);
    ctx.restore();
    ctx.restore();
  }

  // sparkles and stage confetti drifting up the stage in the house colours (cheap, deterministic): used on the story, Act and ending screens.
  // color: one colour for every sparkle, or none for the pink, green, gold and cream mix
  function flecks(ctx, S, t, n, color) {
    if (reduced()) return;
    const r = U.rng(U.hash('flecks', S.kind));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, y0 = r() * H, sp = 14 + r() * 26, ph = r() * 6.28, sz = 2.2 + r() * 3.4, col = color || CONFETTI[i % CONFETTI.length];
      const y = ((y0 - t * sp) % H + H) % H, x = x0 + Math.sin(t * 0.6 + ph) * 14;
      const a = 0.3 + 0.55 * Math.abs(Math.sin(t * 1.3 + ph));
      if (i % 3) spark(ctx, x, y, sz * 1.5, col, a, t * 0.5 + ph);
      else { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(t * 1.6 + ph); ctx.fillStyle = col; ctx.fillRect(-sz * 0.6, -sz * 0.35, sz * 1.2, sz * 0.7); ctx.restore(); }
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
  // ---- follow the duo and Share (HV_STORY 5.4): small pieces for the victory showcase and the game over page. The panel, the sheet and Share itself live in
  // ui.js (UI.followSheet, UI.share); every call is guarded, nothing is fetched or stored, and a link opens only on a tap, in a new tab.
  const HANDLE_LINE = 'Made for RoxorLoops and Jasmin. Find them as @roxorloopsandjasmin.';
  const supportUrl = () => { const v = safe(() => DATA.LINKS.support, ''); const u = typeof v === 'string' ? v.trim() : ''; return /^https?:\/{2}/i.test(u) ? u : ''; };      // only a web address is ever linked (ui.js does the same)
  const openFollowSheet = () => { if (isFn(UI.followSheet)) safe(() => UI.followSheet()); };
  const doShare = () => { if (isFn(UI.share)) safe(() => UI.share()); };
  function shareBtn(o) {
    const b = UI.btn('Share', Object.assign({ onclick: doShare }, o));
    b.setAttribute('aria-label', 'Share Hocus Vocus');
    return b;
  }
  const followBtn = (o) => UI.btn('Follow the duo', Object.assign({ onclick: openFollowSheet }, o));
  // Support the duo: an anchor to DATA.LINKS.support (HV_STORY 5.5), or null while the owners' URL is empty. The victory showcase is the only caller: never game over.
  function supportBtn(cls) {
    const url = supportUrl();
    if (!url) return null;
    return mk('a', { class: 'btn btn-primary btn-sm ' + (cls || ''), href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Support the duo, opens in a new tab' },
      UI.icon('relic', 'heart', 20, {}, 'btn-ico'), mk('span', { class: 'btn-label', text: 'Support the duo' }), mk('i', { class: 'btn-shine', 'aria-hidden': 'true' }));
  }

  function noRunPage(S, what) {
    S.root.appendChild(mk('div', { class: 'en-none' }, UI.panel({ kind: 'paper', torn: true, title: 'Nothing here yet' },
      mk('p', { class: 'en-none-text', text: what || 'There is no tour to show here.' }),
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
    vignette(ctx, x.info.scene === 'defeat' ? 0.35 : 0.5);
    flecks(ctx, S, t, 26);
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
      const title = lore ? lore.title : 'A Diary Entry';
      const text = lore ? lore.text : 'Nothing here yet. On we go, and the tour goes on.';
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
      skip.dataset.act = 'skip';
      skip.classList.add('st-skip');
      const turn = UI.btn('On we go', { kind: 'primary', size: 'lg', breathe: true, onclick: () => advanceStory(S), key: 'Enter' });
      turn.dataset.act = 'turn';
      turn.classList.add('st-turn');
      const hint = mk('span', { class: 'st-hint', text: 'Tap to continue' });
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
      { k: 'chapters', label: 'Acts cleared', n: bk, pts: E.chapter * bk, icon: ['motif', 'bell'] },
      { k: 'bosses', label: 'Headliners won over', n: bk, pts: E.boss * bk, icon: ['relic', 'crown'] },
      { k: 'elites', label: 'Rivals won over', n: st.elites | 0, pts: E.elite * (st.elites | 0), icon: ['relic', 'skull'] },
      { k: 'gold', label: 'Gold in your pocket', n: gold, pts: Math.floor(gold / E.goldDiv), icon: ['stat', 'gold'] },
      { k: 'maxhp', label: 'Heroes\' max HP', n: heroes.reduce((a, h) => a + (h.maxHp | 0), 0), pts: E.maxHp * heroes.reduce((a, h) => a + (h.maxHp | 0), 0), icon: ['stat', 'hp'] },
    ];
    if (deck) {
      const up = deck.filter((c) => c.up).length;
      const gems = deck.reduce((a, c) => a + (c.gems || []).filter(Boolean).length, 0);
      const curses = deck.filter((c) => DATA.cards[c.id] && DATA.cards[c.id].hero === 'curse').length;
      rows.push({ k: 'upgrades', label: 'Cards rehearsed', n: up, pts: E.upgraded * up, icon: ['type', 'attack'] });
      rows.push({ k: 'gems', label: 'Gems set', n: gems, pts: E.gemSlot * gems, icon: ['gem', 'slot:gold'] });
      rows.push({ k: 'curses', label: 'Curses carried', n: curses, pts: E.curse * curses, icon: ['type', 'curse'] });
    }
    const turns = st.turns | 0;
    rows.push({ k: 'turns', label: 'Turns taken', n: turns, pts: -Math.floor(turns / E.turnDiv), icon: ['relic', 'hourglass'] });
    const score = sm && typeof sm.score === 'number' ? sm.score : Math.max(0, rows.reduce((a, r) => a + r.pts, 0));
    const known = rows.reduce((a, r) => a + r.pts, 0);
    const rest = score - known;
    if (rest !== 0) rows.splice(rows.length - 1, 0, { k: 'rest', label: deck ? 'Kind passers-by' : 'Deck work', n: 0, pts: rest, icon: ['type', 'skill'], noCount: true });
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
    const mode = sm.daily ? 'Daily Duet ' + sm.seed : (sm.trial ? 'Encore ' + sm.trial : 'Encore 0');
    const line1 = 'HOCUS VOCUS: ' + (win ? 'still human' : 'intermission in Act ' + (sm.chapter || 1));
    const line2 = names + ' | Score ' + fmt(sm.score || 0) + ' | ' + mode;
    const line3 = 'Seed ' + (sm.seed >>> 0) + ' | ' + U.plural(sm.deckSize | 0, 'card') + ' | ' + U.plural((sm.relics || []).length, 'Charm') + ' | ' + U.plural((sm.stats && sm.stats.bossKills) | 0, 'act') + ' cleared';
    return [line1, line2, line3].join('\n');
  }

  // the hero whose outfit a Sticker unlocks (DATA.outfits, presentation only), or null
  function outfitBySticker(achId) {
    const o = DATA.outfits || {};
    return DATA.LISTS.heroIds.find((h) => Object.prototype.hasOwnProperty.call(o, h) && o[h] && o[h].sticker === achId) || null;
  }

  // newly unlocked things from META.recordRun's result, as display entries
  function unlockEntries(rec, sm) {
    const out = [];
    if (!rec) return out;
    (rec.heroesUnlocked || []).forEach((id) => out.push({ kind: 'hero', id, seal: 'NEW', title: heroName(id) + ' joins the tour!', text: heroTitle(id) + '. Waiting on the hero select.' }));
    (rec.newAchievements || []).forEach((id) => {
      const a = DATA.achievements[id];
      if (!a) return;
      out.push({ kind: 'ach', id, seal: 'WON', title: a.name, text: a.text, reward: a.reward && a.reward.inkstones });
      // a Sticker that unlocks an outfit (bible 7.1) adds its own card right under it: the hero in the new outfit, smiling
      const hero = outfitBySticker(id);
      if (hero) out.push({ kind: 'outfit', id: hero, seal: 'NEW', title: 'New outfit: ' + DATA.outfits[hero].name, text: 'Jordan packed it in the van. Pick it for ' + heroName(hero) + ' on the hero select.' });
    });
    if (rec.newTrial) out.push({ kind: 'trial', id: rec.newTrial, seal: 'ENCORE', title: 'Encore ' + rec.newTrial + ' unlocked', text: (trialName(rec.newTrial) ? trialName(rec.newTrial) + '. ' : '') + 'A harder encore of the same tour is waiting on the hero select.' });
    return out;
  }
  // the new outfit's card art: ART.hero.portrait in the outfit, smiling, on a small 3:4 canvas (a plain hero-coloured tile without ART)
  function outfitPortrait(id, w, h) {
    const px = UI.px || 1;
    const c = mk('canvas', { class: 'en-unlock-pic', width: Math.round(w * px), height: Math.round(h * px), style: { width: w + 'px', height: h + 'px' }, 'aria-hidden': 'true' });
    const g = safe(() => c.getContext('2d'), null);
    if (g) { g.setTransform(px, 0, 0, px, 0, 0); artPortrait(g, id, { x: 0, y: 0, w, h, expr: 'smile', t: 0, skin: 'skin' }); }
    return c;
  }
  function unlockRow(S, e, i) {
    const row = mk('div', { class: 'en-unlock k-' + e.kind, role: 'group', 'aria-label': e.title });
    UI.vars(row, { '--i': i });
    row.appendChild(mk('span', { class: 'en-unlock-seal' }, UI.hanko(e.seal, { size: 'sm' })));
    const body = mk('div', { class: 'en-unlock-body' }, mk('b', { class: 'en-unlock-t', text: e.title }), mk('span', { class: 'en-unlock-x', text: e.text }));
    if (e.kind === 'hero') row.appendChild(mk('span', { class: 'en-unlock-med' }, UI.medallion(e.id, 44)));
    if (e.kind === 'outfit') row.appendChild(mk('span', { class: 'en-unlock-art' }, outfitPortrait(e.id, 42, 56)));
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
  // ACT CLEAR (`chapterClear`)
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

  // the hero an Act's Sticker brings on tour (RawClaw after Act I, Andy after Act II), if the player now has them
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

  // the Act number on a big round sticker (HV_ART_AUDIO 3.4): a disc in the duo's split pink and green, a cream rim, the warm line and the roman
  // numeral in sticker letters, popping in with a little overshoot and a few sparkles
  function actSticker(ctx, cx, cy, r, ch, k, t) {
    if (k <= 0) return;
    const s = ease.outBack(clamp(k, 0, 1));
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.16 + (reduced() ? 0 : Math.sin(t * 1.1) * 0.03)); ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(4, 7, r, 0, TAU); ctx.fillStyle = 'rgba(20,10,40,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = HV.cream; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = HV.line; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.clip();
    ctx.fillStyle = HV.pink; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.beginPath(); ctx.moveTo(r, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fillStyle = HV.green; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.45, r * 0.42, r * 0.2, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = HV.line; ctx.stroke();
    const txt = U.roman(ch), size = r * (txt.length > 2 ? 0.72 : 0.95);
    ctx.font = '900 ' + size + 'px ' + ROUND; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.26; ctx.strokeStyle = HV.line; ctx.strokeText(txt, 0, size * 0.04);
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = HV.cream; ctx.strokeText(txt, 0, size * 0.04);
    ctx.fillStyle = HV.cream; ctx.fillText(txt, 0, size * 0.04);
    ctx.restore();
    const tw = (i) => (reduced() ? 0.8 : 0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + i * 1.9)));
    [[r * 1.08, -r * 0.8, 0.3], [-r * 1.12, r * 0.55, 0.22], [r * 0.7, r * 1.08, 0.18]].forEach((p, i) => spark(ctx, cx + p[0], cy + p[1], r * p[2] * s, i % 2 ? HV.lime : HV.cream, tw(i) * clamp(k * 2 - 1, 0, 1), 0));
  }

  function paintClear(ctx, t, S) {
    const x = S.extra;
    artScene(ctx, 'ch' + x.ch, t, { particles: 1.5, parallaxX: Math.sin(S.t * 0.2) * 14 }, -146);
    // warm stage light spilling over the scene: the Act is won
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(640, 150, 20, 640, 260, 760);
    g.addColorStop(0, 'rgba(255,214,170,0.26)'); g.addColorStop(1, 'rgba(255,214,170,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    vignette(ctx, 0.5);
    flecks(ctx, S, t, 40);
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
    actSticker(ctx, 520, 254, 50, x.ch, (S.t - 0.9) / 0.5, t);
    confetti(ctx, S, t, 0.7);
  }

  // stage confetti falling over a win, NOT in a grid (the Gloss's grid confetti is the Perfect Stage's): seeded strips and squares that flutter
  // as they fall. k scales how many. None under reduced motion.
  function confetti(ctx, S, t, k) {
    if (reduced() || !(k > 0)) return;
    const n = Math.round((lowQ() ? 22 : 44) * k), r = U.rng(U.hash('confetti', S.kind));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, sp = 50 + r() * 70, ph = r() * TAU, w = 5 + r() * 6, h = 3 + r() * 4, col = CONFETTI[i % CONFETTI.length], d = r() * H;
      const y = ((d + t * sp) % (H + 40)) - 20, x = x0 + Math.sin(t * 1.4 + ph) * 22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2.2 + ph); ctx.scale(1, Math.cos(t * 3 + ph));
      ctx.fillStyle = col; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
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
      const title = lore ? lore.title : 'End of Act ' + U.roman(ch);
      const unlockedHero = heroUnlockedBy(ch);
      const banner = mk('header', { class: 'cc-banner' },
        mk('p', { class: 'cc-kicker', text: 'END OF ACT ' + (numberWord[ch] || ch) }),
        mk('h1', { class: 'cc-title', text: title }),
        mk('i', { class: 'cc-flourish', 'aria-hidden': 'true' }, mk('b'), mk('b'), mk('b')),
        bossDef ? mk('p', { class: 'cc-boss', text: bossDef.name + (bossDef.title ? ', ' + String(bossDef.title).replace(/^The /, 'the ') : '') + ', sings along' }) : null);   // the bible writes "Kraki, the Karaoke Kraken" in a sentence: only the title card keeps the capital
      root.appendChild(banner);
      if (unlockedHero) {
        const card = mk('div', { class: 'cc-newhero', role: 'status', 'aria-label': heroName(unlockedHero) + ' joins the tour!' },
          mk('span', { class: 'cc-nh-med' }, UI.medallion(unlockedHero, 52)),
          mk('span', { class: 'cc-nh-text' }, mk('b', { text: heroName(unlockedHero) + ' joins the tour!' }), mk('i', { text: heroTitle(unlockedHero) + '. Waiting on the hero select.' })),
          UI.hanko('NEW', { size: 'sm' }));
        root.appendChild(card);
        at(S, 2600, () => { card.classList.add('show'); snd('unlock'); });
        if (instant()) card.classList.add('show');
      }

      // ---- left: the lore, in a scroll
      const textEl = mk('p', { class: 'cc-lore', text: lore ? lore.text : 'The music swells. The Gloss has let go of this act.' });
      const leftCard = scroll('cc-scroll', 'The Soundlands Sing', textEl);

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
      const midCard = lacquer('cc-stats', 'The Tour So Far', mk('div', { class: 'cc-tiles' }, ...tiles));

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
      const relicRow = mk('div', { class: 'cc-relics', role: 'list', 'aria-label': 'Charms carried' });
      relics.slice(0, 8).forEach((id) => { const r = UI.relic(id, { size: 'sm' }); r.setAttribute('role', 'listitem'); relicRow.appendChild(r); });
      if (relics.length > 8) relicRow.appendChild(mk('span', { class: 'cc-more', text: '+' + (relics.length - 8) }));
      if (!relics.length) relicRow.appendChild(mk('span', { class: 'cc-none', text: 'None yet' }));
      const inkStat = R ? UI.stat('ink', R.ink | 0, { max: R.inkMax | 0, size: 'sm' }) : null;
      const rightCard = lacquer('cc-boons', 'What the Soundlands Give', mk('div', { class: 'cc-heroes' }, ...rows),
        mk('div', { class: 'cc-extra' }, inkStat, mk('span', { class: 'cc-rel-lab', text: 'Charms ' + relics.length }), relicRow));

      root.appendChild(mk('div', { class: 'cc-cols' }, leftCard, midCard, rightCard));

      // ---- the foot: a tip and Continue
      const tip = tipFor(R, 'clear' + ch);
      const go = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => proceed(S) });
      go.classList.add('cc-go');
      const foot = mk('footer', { class: 'cc-foot' }, tip ? mk('p', { class: 'cc-tip' }, UI.hanko('TIP', { size: 'sm' }), mk('span', { text: tip })) : mk('span'), go);
      root.appendChild(foot);
      if (hasLiveRun(R)) root.appendChild(UI.menuButton());
      petals(S, 18);
      UI.announce('Act ' + ch + ' complete. ' + title);
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
  // when the duo get back up: the defeat scene's curtain twitches every 6 s (the show goes on), and on the second twitch they stand again
  const STAND_AT = 6.2;
  function paintOver(ctx, t, S) {
    const x = S.extra;
    artScene(ctx, 'defeat', t, { particles: 0.7 });
    // the Gloss settles: an opalescent pastel sheen lifts off the stage as the screen settles (it smooths, it never darkens)
    const wash = clamp(1 - S.t / 2.2, 0, 1);
    if (wash > 0.01) {
      ctx.save(); ctx.globalAlpha = wash * 0.75;
      const gl = ctx.createLinearGradient(0, 0, W, H); GLOSS.forEach((c, i) => gl.addColorStop(i / 3, c));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    vignette(ctx, 0.28, '36,26,58');
    const ground = 376;
    x.cast.forEach((id, i) => {
      const k = ease.outCubic(clamp((S.t - 0.5 - i * 0.3) / 0.9, 0, 1));
      // they lose their voice for a moment at the stage edge, then, as the curtain twitches, get up again: a hop and a sparkle, the show goes on
      const up = clamp((S.t - STAND_AT - i * 0.25) / 0.45, 0, 1);
      if (up <= 0) { artHero(ctx, id, { x: 130 + i * 150, y: ground + (1 - k) * 18, s: 0.86, pose: 'down', t, pt: Math.max(0, S.t - 0.3 - i * 0.3), alpha: k, glow: 0 }); return; }
      const hop = Math.sin(Math.PI * up) * 16;
      artHero(ctx, id, { x: 130 + i * 150, y: ground - hop, s: 0.86, pose: 'idle', t, pt: 0, alpha: k, glow: up < 1 ? 0.3 * (1 - up) : 0 });
      if (up < 1) { spark(ctx, 130 + i * 150 + 34, ground - 210 - up * 20, 9 * (1 - up) + 3, HV.cream, 1 - up, 0); spark(ctx, 130 + i * 150 - 40, ground - 150 - up * 12, 6 * (1 - up) + 2, HV.lime, 1 - up, 0); }
    });
  }

  function tapRecap(S, sm, R) {
    // a compact recap: a fan of the deck (tap to open it) and the Charms (tap to read them)
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
    const deckBtn = UI.btn((deck.length || sm.deckSize | 0) + ' cards', { kind: 'secondary', size: 'sm', icon: { kind: 'type', id: 'skill', size: 22 }, onclick: () => { if (deck.length) UI.overlay.open('deck', { mode: 'view', cards: deck.slice() }); else UI.toast('The deck was not kept with this tour', 'warn'); } });
    deckBtn.classList.add('go-deckbtn');
    const rel = mk('div', { class: 'go-relics', role: 'list', 'aria-label': 'Charms' });
    relics.slice(0, 7).forEach((id) => { const r = UI.relic(id, { size: 'sm' }); r.setAttribute('role', 'listitem'); rel.appendChild(r); });
    if (relics.length > 7) rel.appendChild(mk('span', { class: 'go-more', text: '+' + (relics.length - 7) }));
    if (!relics.length) rel.appendChild(mk('span', { class: 'go-none', text: 'No Charms' }));
    const relBtn = UI.btn('Charms ' + relics.length, { kind: 'secondary', size: 'sm', onclick: () => { if (relics.length) UI.overlay.open('relics', { relics: relics.slice() }); else UI.toast('No Charms were found on this tour', 'info'); } });
    relBtn.classList.add('go-relbtn');
    const panel = UI.panel({ kind: 'paper', gold: true, class: 'go-recap en-card pad-top' },
      mk('h2', { class: 'en-h' }, mk('span', { text: 'What Was in the Van' })),
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
        mk('p', { class: 'go-kicker', text: 'THE LIGHTS GO DOWN' }),
        mk('h1', { class: 'go-title', text: lore ? lore.title : 'The Show Must Go On' }),
        mk('p', { class: 'go-fell', text: 'Curtain fell in Act ' + U.roman(ch) + (chTitle ? ': ' + chTitle : '') + (sm.trial ? '  |  Encore ' + sm.trial : '') + (sm.daily ? '  |  Daily Duet' : '') })));

      // ---- left: the fallen, and what the tour kept
      // the party fell: RUN keeps the last HP of a lost fight, but the page shows them as they ended, at 0
      const fallen = mk('div', { class: 'go-fallen' }, ...(sm.heroes || []).map((h) => UI.heroBadge(h.id, { size: 'md', hp: 0, maxHp: h.maxHp | 0 })));
      root.appendChild(mk('div', { class: 'go-left' }, fallen, tapRecap(S, sm, R)));

      // ---- middle: the lore, a tip, the buttons
      const loreCard = scroll('go-lore', null, mk('p', { class: 'go-lore-text', text: lore ? lore.text : 'The lights went down, and the Soundlands went quiet. Breathe, and try again.' }));
      const tip = tipFor(R, 'over');
      const again = UI.btn('Try Again', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => tryAgain(S, sm) });
      again.classList.add('go-again');
      const title = UI.btn('Title', { kind: 'secondary', size: 'lg', onclick: () => toTitle(S) });
      title.classList.add('go-title-btn');
      // a slim ghost row under Try Again and Title (HV_STORY 5.4): Share and Follow the duo, never Support (a lost tour is no time to ask, principle 3)
      const share = shareBtn({ kind: 'ghost', size: 'sm' });
      share.classList.add('go-share');
      const follow = followBtn({ kind: 'ghost', size: 'sm' });
      follow.classList.add('go-follow-btn');
      root.appendChild(mk('div', { class: 'go-mid' }, loreCard,
        tip ? mk('p', { class: 'go-tip' }, UI.hanko('TIP', { size: 'sm' }), mk('span', { text: tip })) : null,
        mk('div', { class: 'go-btns' }, again, title),
        mk('div', { class: 'go-follow' }, share, follow)));

      // ---- right: the score ledger, then Cheers and what is new
      const led = ledger(S, sm, R, { delay: 1000, seal: 'PAUSE' });
      const scoreCard = lacquerSplit('go-score', 'Final Score', [led.list], led.total);
      const stones = mk('div', { class: 'go-stones' });
      const stoneNum = mk('b', { class: 'go-stone-n' });
      if (rec) {
        const earned = rec.inkstones | 0;
        stones.appendChild(mk('div', { class: 'go-stone-main' }, iconOf('stat', 'inkstone', 40), mk('span', { class: 'go-stone-lab', text: 'Cheers earned' }), stoneNum));
        count(S, stoneNum, earned, { ms: 900, delay: 1000 + led.data.rows.length * 260 + 600, fmt: (n) => '+' + fmt(n) });
        if (instant()) stoneNum.textContent = '+' + fmt(earned);
        const sub = [];
        if (rec.bonus) sub.push('Sticker bonus +' + fmt(rec.bonus));
        if (typeof rec.total === 'number') sub.push('Cheers held ' + fmt(rec.total));
        if (sub.length) stones.appendChild(mk('p', { class: 'go-stone-sub', text: sub.join('  |  ') }));
        const ents = unlockEntries(rec, sm);
        const list = mk('div', { class: 'en-unlocks' });
        ents.forEach((e, i) => list.appendChild(unlockRow(S, e, i)));
        if (!ents.length) list.appendChild(mk('p', { class: 'en-unlock-none', text: 'Nothing new this time. The next tour might be the one.' }));
        stones.appendChild(list);
      } else {
        stones.appendChild(mk('p', { class: 'en-unlock-none', text: 'This tour was not recorded, so no Cheers were given.' }));
      }
      const stonesCard = lacquer('go-stonescard', 'The Tour Bus Remembers', stones);
      root.appendChild(mk('div', { class: 'go-right' }, scoreCard, stonesCard));
      UI.announce('The lights go down. Score ' + fmt(sm.score || 0));
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
    if (!g || !isFn(g.newRun) || ids.length !== 2) { UI.toast('Pick your duo from the title to start again', 'warn'); return toTitle(S); }
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
    hanae: 'Jasmin hummed the last line once more, very softly, and the whole crowd leaned in to hear it. Her scrunchie had not moved at all.',
    kuro: 'RoxorLoops beatboxed the sound of the curtain coming down, the applause and the van door, then took a bow at both ends of his hair.',
    suzu: 'RawClaw took off his headphones and listened. For the first time in a long while, nothing needed fixing. He added a little reverb anyway.',
    raiga: 'Andy played one last low note so warm that the stage lights hummed along. \'Nice,\' he said, and that was the whole speech.',
  };

  // the share card (HV_ART_AUDIO 3.4), composed like the owners' duo card: a background split diagonally light green and pink with a cream seam,
  // the stacked HOCUS VOCUS logo, the two heroes of the tour in `cheer` (in their outfits), the score digits, the RJ monogram in a corner and
  // @roxorloopsandjasmin in small cream letters along the bottom (the only handle drawn). The saved image keeps its 600 x 338 (the victory
  // showcase column and the tests pin it), so the duo stand on the left and the logo and score sit on the right. Nothing else is written on it:
  // the full summary is the canvas's text alternative and what Copy summary puts on the clipboard.
  // d = {heroes, score, trial, seed, deckSize, relics, chapters, daily, win}
  const HANDLE = '@roxorloopsandjasmin';
  function stickerText(g, text, x, y, size, top, base, o) {
    o = o || {};
    g.save();
    g.translate(x, y); g.rotate(o.rot || 0);
    g.font = '900 ' + size + 'px ' + ROUND; g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
    const str = String(text);
    g.fillStyle = 'rgba(20,10,40,0.4)'; g.strokeStyle = 'rgba(20,10,40,0.4)'; g.lineWidth = size * 0.24;
    g.strokeText(str, -size * 0.04, size * 0.07); g.fillText(str, -size * 0.04, size * 0.07);
    g.strokeStyle = HV.line; g.lineWidth = size * 0.24; g.strokeText(str, 0, 0);
    g.strokeStyle = HV.cream; g.lineWidth = size * 0.1; g.strokeText(str, 0, 0);
    const gr = g.createLinearGradient(0, -size * 0.42, 0, size * 0.42);
    gr.addColorStop(0, top); gr.addColorStop(0.44, top); gr.addColorStop(0.48, base); gr.addColorStop(1, base);
    g.fillStyle = gr; g.fillText(str, 0, 0);
    g.restore();
  }
  function cardLogo(ctx, cx, cy, w, t) {
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.logo)) {
      try { ART.scene.logo(ctx, cx, cy, w, t || 0); return; } catch (e) { warnOnce('ART.scene.logo card', e); }
    }
    stickerText(ctx, 'HOCUS', cx, cy - w * 0.1, w * 0.2, HV.pinkL, HV.pink, { rot: -0.03 });
    stickerText(ctx, 'VOCUS', cx, cy + w * 0.1, w * 0.2, HV.lime, HV.green, { rot: 0.03 });
  }
  function drawCard(ctx, w, h, d, t) {
    const win = d.win !== false;
    const k = Math.max(0.1, Math.min(w / 600, h / 338));
    ctx.save();
    rrect(ctx, 0, 0, w, h, 14 * k); ctx.clip();
    // the split: light green over the top left, pink under the bottom right, a cream seam between, soft sparkles and notes on both
    ctx.fillStyle = win ? '#c9f7d6' : '#e3f2ea'; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(w * 0.62, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(w * 0.18, h); ctx.closePath();
    ctx.fillStyle = win ? '#ffcfe3' : '#f6e4ee'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.62, 0); ctx.lineTo(w * 0.18, h); ctx.lineWidth = 7 * k; ctx.strokeStyle = HV.cream; ctx.stroke();
    const r = U.rng(U.hash('sharecard', d.seed >>> 0));
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h;
      if (i % 3) spark(ctx, x, y, (3 + r() * 5) * k, '#ffffff', 0.5 + r() * 0.4, r());
      else { ctx.beginPath(); ctx.arc(x, y, (2 + r() * 3) * k, 0, TAU); ctx.fillStyle = rgba(i % 2 ? HV.pink : HV.green, 0.3); ctx.fill(); }
    }
    // a soft spotlight behind the duo
    const sp = ctx.createRadialGradient(150 * k, 190 * k, 10, 150 * k, 210 * k, 170 * k);
    sp.addColorStop(0, 'rgba(255,255,255,0.75)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.ellipse(150 * k, 312 * k, 138 * k, 16 * k, 0, 0, TAU); ctx.fillStyle = 'rgba(45,23,15,0.16)'; ctx.fill();
    // the duo of this tour: the first on the left facing right, the second on the right turned to face them, both in the viewer's outfits
    const ids = (d.heroes && d.heroes.length ? d.heroes : DEFAULT_PARTY).filter((id) => DATA.heroes[id]).slice(0, 2);
    const pose = win ? 'cheer' : 'idle';
    const pt = win && typeof ART !== 'undefined' && ART && ART.hero && isFn(ART.hero.keyPt) ? safe(() => ART.hero.keyPt('cheer'), 0.3) : 0;
    ids.forEach((id, i) => artHero(ctx, id, { x: (ids.length === 1 ? 150 : i === 0 ? 92 : 210) * k, y: 314 * k, s: 0.78 * k, pose, t: t || 0, pt, flip: i === 1, shadow: false }));
    // the logo and the score on the right
    cardLogo(ctx, 430 * k, 98 * k, 300 * k, t);
    const sc = fmt(d.score || 0), size = (sc.length > 6 ? 46 : 56) * k;
    stickerText(ctx, sc, 430 * k, 222 * k, size, win ? HV.cream : '#f4f1fb', win ? '#ffe9a8' : '#e6d9ff', { rot: -0.02 });
    spark(ctx, (430 + sc.length * 15 + 16) * k, 196 * k, 11 * k, HV.cream, 0.95, 0.2);
    spark(ctx, (430 - sc.length * 15 - 14) * k, 244 * k, 7 * k, HV.lime, 0.9, 0);
    // the RJ monogram in the bottom right corner (the logo's wand star owns the top right), the handle along the bottom
    let mono = false;
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.monogram)) { try { mono = ART.scene.monogram(ctx, w - 36 * k, h - 36 * k, 22 * k) !== false; } catch (e) { warnOnce('ART.scene.monogram', e); } }
    if (!mono) { ctx.beginPath(); ctx.arc(w - 36 * k, h - 36 * k, 22 * k, 0, TAU); ctx.fillStyle = HV.pink; ctx.fill(); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = HV.line; ctx.stroke(); }
    ctx.font = '900 ' + Math.round(13 * k) + 'px ' + ROUND; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * k; ctx.strokeStyle = HV.line; ctx.strokeText(HANDLE, 430 * k, 312 * k);
    ctx.fillStyle = HV.cream; ctx.fillText(HANDLE, 430 * k, 312 * k);
    ctx.restore();
    // the die-cut edge: the warm line with a cream rim inside
    rrect(ctx, 2.5 * k, 2.5 * k, w - 5 * k, h - 5 * k, 13 * k); ctx.lineWidth = 5 * k; ctx.strokeStyle = HV.line; ctx.stroke();
    rrect(ctx, 6.5 * k, 6.5 * k, w - 13 * k, h - 13 * k, 10 * k); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = HV.cream; ctx.stroke();
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
    if (x.phase === 'show') { ctx.fillStyle = 'rgba(13,11,30,0.55)'; ctx.fillRect(0, 0, W, H); vignette(ctx, 0.5); flecks(ctx, S, t, 40); confetti(ctx, S, t, 0.5); return; }
    vignette(ctx, 0.32, '36,26,58');
    flecks(ctx, S, t, 30);
    confetti(ctx, S, t, 1);
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
        artHero(ctx, id, { x: px, y: 556, s: inParty ? 1.0 : 0.94, pose, t, pt: Math.max(0, pt - t0 - travel), alpha: 1 });          // 22 px higher than the boxes' old top: they moved up to leave the credit line a strip below them
        if (arrived && pt - t0 - travel < 0.7 && typeof ART !== 'undefined' && ART && ART.fx && isFn(ART.fx.sparkle)) safe(() => ART.fx.sparkle(ctx, { x: px, y: 430, s: 1.8, seed: i + 3, color: DATA.heroes[id] ? DATA.heroes[id].color : HV.cream }, (pt - t0 - travel) / 0.7));
      });
    }
  }

  function buildEpilogue(S) {
    const x = S.extra, root = S.root;
    const lore = loreOf('victory');
    const title = lore ? lore.title : 'Human';
    const text = lore ? lore.text : 'The whole crowd sings the last line together, and the stage is left open for whoever wants to sing next.';
    const dropCap = /^[A-Za-z]/.test(text);
    const words = String(title).split(' ');
    const head = mk('header', { class: 'st-head' },
      mk('p', { class: 'st-kicker', text: 'FINALE' }),
      mk('h1', { class: 'st-title' }, ...words.map((w, i) => [i ? ' ' : null, UI.vars(mk('span', { class: 'st-w', text: w }), { '--i': i })])),
      mk('i', { class: 'st-flourish', 'aria-hidden': 'true' }, mk('b', { class: 'fl-l' }), mk('b', { class: 'fl-m' }), mk('b', { class: 'fl-r' })));
    const typed = mk('span', { class: 'st-typed' });
    const para = mk('p', { class: 'st-text', 'aria-hidden': 'true' }, dropCap ? mk('span', { class: 'st-drop' }, mk('b', { text: text[0] })) : null, typed);
    const bodyEl = mk('div', { class: 'st-body' }, para, mk('p', { class: 'sr-only', text: title + '. ' + text }));
    const skip = UI.btn('Skip', { kind: 'secondary', onclick: () => gotoPhase(S, 'show'), key: 'Esc' });
    const turn = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, key: 'Enter', onclick: () => tapVictory(S) });
    turn.classList.add('st-turn');
    const foot = mk('footer', { class: 'st-foot' }, skip, mk('span', { class: 'st-hint', text: 'Tap to continue' }), turn);
    const page = UI.panel({ kind: 'paper', gold: true, class: 'st-page vc-page' }, head, bodyEl, foot);
    page.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('button')) return; tapVictory(S); });
    const seal = mk('div', { class: 'st-seal vc-seal', 'aria-hidden': 'true' }, UI.hanko('BRAVO', { size: 'lg' }));
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
    const head = mk('header', { class: 'vc-cast-head' }, mk('p', { class: 'vc-cast-kicker', text: 'CURTAIN CALL' }), mk('h1', { class: 'vc-cast-title', text: 'Everyone Who Sang Along' }),
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
    // the closing credit (HV_STORY 3.5): one small plain line under the four curtain lines, no buttons and no links here (the follow row belongs to the showcase)
    const credit = mk('p', { class: 'vc-credit', text: HANDLE_LINE });
    root.appendChild(head); root.appendChild(caps); root.appendChild(credit); root.appendChild(go); root.appendChild(skip);
    x.nodes.push(head, caps, credit, go, skip);
    atPhase(S, (0.4 + 3 * 1.05 + 1.6) * 1000, () => root.classList.add('vc-cast-done'));
    snd('page_turn');
  }

  function buildShow(S) {
    const x = S.extra, root = S.root, sm = x.sm, R = S.R, rec = x.rec;
    root.classList.remove('st-done', 'vc-cast-done');
    const head = mk('header', { class: 'vc-head' }, UI.hanko('BRAVO', { size: 'lg' }), mk('div', {}, mk('p', { class: 'vc-kicker', text: 'FINALE' }), mk('h1', { class: 'vc-title', text: 'Human' })));
    // the share card
    const cw = 600, ch = 338;
    const canvas = mk('canvas', { class: 'vc-card', 'aria-label': 'Summary card: ' + summaryText(sm, R, true).replace(/\n/g, '. ') });
    const px = UI.px || 1;
    canvas.width = Math.round(cw * px); canvas.height = Math.round(ch * px);      // the saved image keeps its 600 x 338; CSS fits it to its column (.vc-card width 100%)
    const cdata = { heroes: ((sm.heroes || []).map((h) => h.id)), score: sm.score || 0, trial: sm.trial | 0, seed: sm.seed, deckSize: sm.deckSize | 0, relics: sm.relics || [], chapters: (sm.stats && sm.stats.bossKills) | 0, daily: !!sm.daily, win: true };
    x.cardData = cdata;
    const g = safe(() => canvas.getContext('2d'), null);
    if (g) { g.setTransform(px, 0, 0, px, 0, 0); safe(() => drawCard(g, cw, ch, cdata, 0)); }
    const copy = UI.btn('Copy summary', { kind: 'primary', icon: { kind: 'type', id: 'skill', size: 22 }, onclick: () => copySummary(S) });
    copy.classList.add('vc-copy');
    const save = UI.btn('Save card', { kind: 'secondary', onclick: () => saveCard(S, canvas) });
    save.classList.add('vc-save');
    const share = shareBtn({ kind: 'secondary' });
    share.classList.add('vc-share');
    const cardWrap = mk('div', { class: 'vc-cardwrap' }, canvas, mk('div', { class: 'vc-cardbtns' }, copy, save, share));

    // Cheers (beside Continue) and what is new
    const foot = mk('div', { class: 'vc-foot' });
    const list = mk('div', { class: 'en-unlocks' });
    if (rec) {
      const n = mk('b', { class: 'go-stone-n' });
      count(S, n, rec.inkstones | 0, { ms: 1100, delay: 2600, fmt: (v) => '+' + fmt(v) });
      if (instant()) n.textContent = '+' + fmt(rec.inkstones | 0);
      const sub = [];
      if (rec.bonus) sub.push('bonus +' + fmt(rec.bonus));
      if (typeof rec.total === 'number') sub.push('cheers ' + fmt(rec.total));
      foot.appendChild(mk('div', { class: 'vc-stone' }, iconOf('stat', 'inkstone', 44),
        mk('div', { class: 'vc-stone-t' }, mk('span', { class: 'go-stone-lab', text: 'Cheers earned' }), sub.length ? mk('span', { class: 'go-stone-sub', text: sub.join('  |  ') }) : null), n));
      const ents = unlockEntries(rec, sm);
      ents.forEach((e, i) => list.appendChild(unlockRow(S, e, i)));
      if (!ents.length) list.appendChild(mk('p', { class: 'en-unlock-none', text: 'No new unlocks this time. Spend your Cheers on the Tour Bus.' }));
    } else {
      foot.appendChild(mk('div', { class: 'vc-stone' }));
      list.appendChild(mk('p', { class: 'en-unlock-none', text: 'This tour was not recorded, so no Cheers were given.' }));
    }
    const stonesCard = lacquer('vc-newcard', 'Newly Unlocked', list);

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
    // under the Newly Unlocked card, a slim row (HV_STORY 5.4): the handle line, Follow the duo (opens the sheet) and, once the owners set a URL, Support the duo
    const followRow = mk('div', { class: 'vc-follow' }, mk('p', { class: 'vc-follow-line', text: HANDLE_LINE }),
      mk('div', { class: 'vc-follow-btns' }, followBtn({ kind: 'ghost', size: 'sm', class: 'vc-follow-btn' }), supportBtn('vc-support')));
    const left = mk('div', { class: 'vc-left' }, cardWrap, stonesCard, followRow);
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
      const a = mk('a', { href: canvas.toDataURL('image/png'), download: 'hocus-vocus-' + ((S.extra.sm.seed >>> 0) || 'tour') + '.png', style: { display: 'none' } });
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
