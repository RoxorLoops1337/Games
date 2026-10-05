// Hocus Vocus: menu screens (owner: menu screens engineer). One IIFE that registers into UI: the screens `title`, `heroSelect`,
// `library`, `settings`, `howto` and the overlays `pause` and `settings` (replacing UI's basic settings overlay). Styles live in
// css/menu.css (classes `mn-*`, scoped under .s-NAME and .o-NAME). This header is the contract of record for screen_menu.js.
//
// SCREENS (DESIGN 5.11, 6)
//   title       params none. The big animated scene (ART.scene.draw 'title' plus ART.scene.logo(ctx, 640, 150, 540, t) when the art is real,
//               else a flat fallback painted here: the moon, the three Acts on the horizon, the van, the little round stage and its mic
//               wrapped in the Gloss until the first win, and the stacked logo in sticker letters), a pointer parallax (normalised -1..1,
//               passed to the scene as opts.parallaxX), petals and fireflies (x0.3 with reduceMotion), a "Tap to begin" gate while audio
//               is not running, and the menu plaques: Continue (only when META.hasRun(), with META.runInfo() text), New Tour, Daily Duet
//               (today's seed, the two daily heroes and the best score), Tour Bus, Settings, How to Play, a footer (the credits line, then
//               Follow the duo, Share and Support the duo once DATA.LINKS.support is set, the version last) and a tiny fullscreen button. Keys: C continue, N new, D daily, L Tour Bus (`library`), S settings, H how to play, arrows move focus.
//   heroSelect  params none. Four portrait cards (animated ART.hero.portrait whose expression follows hover and selection, locked heroes
//               silhouetted with the unlock hint of their achievement), a detail sheet (blurb, rows, resource, passive, the Outfit row
//               (HV_ART_AUDIO 2.11: Stage clothes and the hero's outfit through UI.outfit; Andy has none), HP, starter deck, bio), the party
//               stage (chibi sprites on a little round stage, lead and backing, barks from lore barks_<id>), the swap-order toggle, an Encore
//               stepper (0..META.trialMax with every level's rule listed cumulatively), a seed field, the Daily toggle and Begin.
//               The FIRST pick is the lead hero; a third pick drops the oldest. Begin calls GAME.newRun({heroes, trial, seed?, daily}).
//               Keys: 1..4 pick, S swap order, Esc back.
//   library     the Tour Bus. params {tab?: 'unlocks'|'achievements'|'story'|'bestiary'|'history'|'follow'}. Unlocks (META.libraryList grid, kind and hero
//               filters, buy with a stamp animation), Stickers (META.achievements with progress bars, sort), Diary (META.storyList,
//               seen entries replay through the story screen with then -> back here), Who's Who (META.bestiary as a wall of instant photos;
//               a creature not met yet is a photo the Gloss got to first: an opalescent blur with a polite smile),
//               History (META.history rows), Follow the duo (the sixth tab: UI.followPanel('tab'), which carries the about text and Jordan's line). Keys 1 to 6
//               switch tabs. The Cheers balance counts up and down. Esc goes back.
//   settings    params none. One shared form (music, effects, shake, reduce motion, text size, animation speed, damage numbers, colour-blind
//               aids, quality, hints, fullscreen, restore defaults, clear data with a two-step confirm, and a last About group: the about text,
//               the follow strip from ui.js and the version). Every change applies at once through UI.setSetting (META.set + save + UI.applySettings).
//   howto       params none. Eight illustrated pages with small live diagrams, dots, swipe, arrow keys.
// OVERLAYS
//   pause       Resume, Deck, Charms, Settings, How to play (an in-place sub view of the same overlay), Abandon run (GAME.abandon opens
//               the confirm), Save and quit, a run strip and a tip. Without a run: Resume, Settings, How to play, Back to title.
//               Keys inside it: R resume, D deck, T Charms, S settings, H how to play, Esc (closes, or leaves How to play).
//   settings    the same form as the screen, in a torn paper panel (clear data is hidden while a run is active).
//
// PUBLIC API beyond DESIGN: every screen object also has state() for tests and tools: title.state() -> {gated, hasRun, seed, best, px,
//   particles, ...}, heroSelect.state() -> {chosen, trial, daily, focus, seed}, library.state() -> {tab, filter, built},
//   settings.state() -> {form}, howto.state() -> {page, pages, id}. All return null once the screen has been left.
//   Module memory (not saved anywhere): the last party, Encore (`trial`) and Tour Bus tab survive going back and forth within one page session.
//
// DEVIATIONS AND NOTES (also in the final report)
//   * Screens may only call GAME.nodeDone, toTitle and enterNode (hygiene, DESIGN 2), but starting, continuing and abandoning a run
//     needs GAME.newRun, GAME.continueRun and GAME.abandon and the design has no bus event for them. game() below is the ONE seam and carries a layers pragma with its reason,
//     so the integration wave can decide (extend the allowed list, or add a bus event).
//   * The Daily seed shown on the title is META.dailySeed(new Date(performance.timeOrigin + performance.now())): screens may not read
//     the clock, GAME.newRun does the real read (both agree except in the seconds around midnight).
//   * ART.scene.draw opts.parallaxX is a camera offset in STAGE PX (art_scenes.js clamps it to +-90): the pointer position times 70.
//   * The unlock sfx and the "Unlocked: X" toast come from GAME (it alone subscribes to META.bus, DESIGN 5.10); the Tour Bus adds a
//     stamp accent sound (card_pick, relic_get or gem_get) so a purchase never double-plays `unlock`.
//   * No timers other than UI.after and the frame clock (update(dt, t)) are used, so GAME.debug.tick is exact. Overlays get no update()
//     from UI, so a diagram inside the pause overlay is driven by a chain of one second UI.tween calls (driveOverlay).
//   * Buttons that close or replace themselves in their own click handler play their own sound and set data-sfx to "none" (the QUIET
//     constant): UI's delegated click sound skips detached buttons and would otherwise double it while the overlay fades out.
//   * A focused slider counts as text entry for UI (Escape only blurs it), so the settings screen and overlay add their own Escape handler.
//   * "Play anyway" in a portrait phone draws the stage at about 0.3 scale, where --hit would be 146 stage px: css/menu.css caps it at
//     58 px there (portrait and under 500 px wide) so every panel stays reachable. Landscape phones use the compact layout rules.
(() => {
  'use strict';
  const mk = U.el;
  const clamp = U.clamp;
  const TAU = Math.PI * 2;
  const VERSION = '1.0';
  const HEROES = DATA.LISTS.heroIds;
  // The social strings of HV_STORY 5.3 and 6. The panel itself (pills, Share, the sheet) is UI.followPanel, UI.share and UI.followSheet in ui.js; this
  // file only places them (title footer, the sixth Tour Bus tab, the settings About group) and never fetches anything.
  const CREDITS_LINE = 'Drawn in code, sung with heart. No two tours alike.';
  const HANDLE_LINE = 'Made for RoxorLoops and Jasmin. Find them as @roxorloopsandjasmin.';
  const ABOUT_TEXT = "Hocus Vocus is a card adventure made for RoxorLoops and Jasmin, a beatbox and singing duo, starring their friends RawClaw and Andy, with Jordan at the merch stall. Pick two heroes, unmute the Soundlands one hex at a time, and win back a world the Gloss has polished into silence. Every picture is drawn in code and every sound is made right here in your browser, so the game plays the same with or without a connection and never phones home. One day the duo's real beats and voices will move in. Until then, no two tours are alike.";

  // ================================================================================================================
  // small helpers
  // ================================================================================================================
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const isFn = (f) => typeof f === 'function';
  const warned = {};
  const warnOnce = (key, msg, e) => {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[menu] ' + msg + (e ? ': ' + (e.message || e) : ''));
  };
  const reduce = () => !!(UI.opt && UI.opt.reduceMotion);
  const bigText = () => !!(UI.opt && UI.opt.textScale > 1.1);                 // the Larger text size: screens drop a little chrome (class ts-big) so nothing clips
  const T = () => (typeof ART !== 'undefined' && ART && ART.tk ? ART.tk : null);
  // Every ART call goes through here: a missing or throwing painter must never take a screen down (UI would stop calling draw()).
  const art = (fn, key) => { try { return fn(); } catch (e) { warnOnce('art:' + (key || 'x'), 'ART call failed (' + (key || 'x') + ')', e); return undefined; } };
  const QUIET = 'none';                                       // data-sfx value that makes UI's delegated click handler stay silent, for buttons that play their own sound
  const sfx = (id) => { if (typeof AUDIO !== 'undefined' && AUDIO && typeof AUDIO.sfx === 'function') safe(() => AUDIO.sfx(id)); };
  const nowS = () => (typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : 0);
  const plural = U.plural;
  const cap = U.cap;
  const roman = (n) => (n === 0 ? '0' : U.roman(n));
  const fmt = U.commas;

  // the one seam to GAME (see the header): start, continue and abandon a run
  // hygiene-allow(layers): title, heroSelect and pause must start, continue and abandon runs; DESIGN 5.10 gives screens no bus event for that
  const game = () => (typeof GAME !== 'undefined' ? GAME : null);

  // the module memory: survives going back and forth between screens inside one page session, is never saved
  const mem = { gateDone: false, party: [], trial: 0, seedText: '', daily: false, libTab: 'unlocks', libKind: 'all', libHero: 'any', achSort: 'order', beast: null };

  // Today's date without reading the clock through Date (screens may not): the epoch of the page plus the frame clock.
  function today() {
    if (typeof performance === 'undefined' || !performance.timeOrigin) return null;
    return new Date(performance.timeOrigin + performance.now());
  }
  const dailySeed = () => { const d = today(); return d ? safe(() => META.dailySeed(d), 0) : 0; };
  function dailyBest(seed) {
    let best = null;
    (safe(() => META.history, []) || []).forEach((r) => { if (r && r.daily && (r.seed >>> 0) === (seed >>> 0)) best = best === null ? r.score : Math.max(best, r.score); });
    return best;
  }
  const heroName = (id) => (DATA.heroes[id] ? DATA.heroes[id].name : String(id));
  const heroList = (ids) => { const n = (ids || []).map(heroName); return n.length === 2 ? n[0] + ' and ' + n[1] : n.join(', '); };
  // display words for ids the screens print (bible 4.1): a row id is never shown through cap(), and "her" belongs to Jasmin alone
  const ROW_WORD = { front: 'Lead', back: 'Backing' };
  const rowWord = (row) => ROW_WORD[row] || String(row);
  const rowProse = (row) => (row === 'front' ? 'the lead' : 'backing');
  const poss = (id) => (id === 'hanae' ? 'her' : 'his');
  const colourWord = (c) => (DATA.COLOUR_NAME && DATA.COLOUR_NAME[c]) || c;
  const statusWord = (id, dflt) => (DATA.statuses && DATA.statuses[id] && DATA.statuses[id].name) || dflt;

  // listener bookkeeping: everything a screen adds outside the UI helpers is removed at leave
  function listeners() {
    const list = [];
    return {
      on(target, type, fn, opts) { if (!target || !target.addEventListener) return; target.addEventListener(type, fn, opts); list.push([target, type, fn, opts]); },
      clear() { list.splice(0).forEach((l) => safe(() => l[0].removeEventListener(l[1], l[2], l[3]))); },
      get size() { return list.length; },
    };
  }

  // a DOM canvas backed at UI.px, painted by fn(ctx, w, h). Returns {c, g}
  function canvasEl(w, h, cls) {
    const px = UI.px || 1;
    const c = mk('canvas', { class: cls || '', width: Math.round(w * px), height: Math.round(h * px), style: { width: w + 'px', height: h + 'px' }, 'aria-hidden': 'true' });
    const g = safe(() => c.getContext('2d'), null);
    if (g) g.setTransform(px, 0, 0, px, 0, 0);
    return { c, g };
  }

  // an ART.sprite drawn once into a DOM canvas (thumbnails: bestiary, silhouettes)
  function spriteCanvas(key, w, h, fn, cls) {
    const o = canvasEl(w, h, cls);
    if (!o.g) return o.c;
    const spr = typeof ART !== 'undefined' && ART.sprite ? art(() => ART.sprite(key, w, h, fn), 'sprite') : null;
    if (spr) safe(() => { o.g.drawImage(spr, 0, 0, w, h); });
    return o.c;
  }

  // the text of a banner ribbon (the candy-green ribbon, same look as a panel title)
  const banner = (text, cls) => mk('h2', { class: 'p-title mn-banner' + (cls ? ' ' + cls : '') }, mk('span', { text }));

  // DOM helper to append many kids (arrays, nodes, strings, null)
  const add = (parent, ...kids) => { kids.flat(3).forEach((k) => { if (k !== null && k !== undefined && k !== false) parent.appendChild(k.nodeType ? k : document.createTextNode(String(k))); }); return parent; };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  // a lit button: UI.btn plus our class
  const btn = (label, o) => { const b = UI.btn(label, o); if (o && o.mn) b.classList.add(...o.mn.split(' ')); return b; };

  // the duo's links (HV_STORY 5): DATA.LINKS is read, never fetched; an empty URL hides its button, and every call into ui.js is guarded
  const supportUrl = () => { const v = safe(() => DATA.LINKS.support, ''); const u = typeof v === 'string' ? v.trim() : ''; return /^https?:\/{2}/i.test(u) ? u : ''; };      // only a web address is ever linked (ui.js does the same)
  const openFollowSheet = () => { if (isFn(UI.followSheet)) safe(() => UI.followSheet()); };
  const doShare = () => { if (isFn(UI.share)) safe(() => UI.share()); };
  // Follow the duo and Share as small ghost pills (the title footer and nothing else: every other surface asks UI.followPanel)
  const followButton = (cls) => { const b = btn('Follow the duo', { kind: 'ghost', size: 'sm', class: cls, onclick: openFollowSheet }); b.dataset.act = 'follow'; return b; };
  const shareButton = (cls) => { const b = btn('Share', { kind: 'ghost', size: 'sm', class: cls, onclick: doShare }); b.setAttribute('aria-label', 'Share Hocus Vocus'); b.dataset.act = 'share'; return b; };
  // Support the duo: an anchor to DATA.LINKS.support in a new tab (a primary pill with the heart), or null while the URL is empty
  function supportButton(cls) {
    const url = supportUrl();
    if (!url) return null;
    const a = mk('a', { class: 'btn btn-primary btn-sm ' + (cls || ''), href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Support the duo, opens in a new tab' },
      UI.icon('relic', 'heart', 20, {}, 'btn-ico'), mk('span', { class: 'btn-label', text: 'Support the duo' }), mk('i', { class: 'btn-shine', 'aria-hidden': 'true' }));
    a.dataset.act = 'support';
    return a;
  }

  // ================================================================================================================
  // the house look of everything this file paints
  // ================================================================================================================
  // the house colours of the painted menus (bible 3.6, HV_ART_AUDIO 1 and 9.1) and the rounded display stack for painted words (no web font)
  const HV = { pink: '#ff7eb6', pinkL: '#ffc2dc', pinkD: '#c93f78', green: '#3fcf6a', lime: '#c6ff3d', greenD: '#1f7a3a', cream: '#fff8ec', paper: '#fff4e6', line: '#2d170f',
    gold: '#ffd84d', curtain: '#c8264f', curtainD: '#8f1838', violet: '#a77bff', teal: '#2ec4b6', orange: '#ff9a2e', sky: '#7cc6ff', warm: '#fff4d6' };
  const GLOSS = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];
  const ROUND = '"Arial Rounded MT Bold", "Nunito", "Quicksand", "Varela Round", "Trebuchet MS", Arial, "Liberation Sans", system-ui, sans-serif';
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  // a 4-point sparkle (the magic of the house style), a 5-point star path, a rounded rectangle path
  function spark(g, x, y, r, col, a, rot) {
    if (!(r > 0.2) || !(a > 0.01)) return;
    g.save(); g.globalAlpha *= clamp(a, 0, 1); g.translate(x, y); g.rotate(rot || 0);
    g.beginPath();
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; g.quadraticCurveTo(Math.cos(an + Math.PI / 4) * r * 0.16, Math.sin(an + Math.PI / 4) * r * 0.16, Math.cos(an + Math.PI / 2) * r, Math.sin(an + Math.PI / 2) * r); }
    g.closePath(); g.fillStyle = col; g.fill();
    g.restore();
  }
  function starPath(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.48 : r, an = (rot || 0) - Math.PI / 2 + i * Math.PI / 5; if (i) g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else g.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    g.closePath();
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // a word in sticker letters: a soft drop shadow, a thick warm outline, a cream inner rim, a two-tone fill (the lighter band on top)
  function stickerWord(g, text, x, y, size, top, base, o) {
    o = o || {};
    g.save();
    g.translate(x, y); g.rotate(o.rot || 0);
    g.font = '900 ' + size + 'px ' + ROUND; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
    const str = String(text);
    g.fillStyle = 'rgba(20,10,40,0.45)'; g.strokeStyle = 'rgba(20,10,40,0.45)'; g.lineWidth = size * 0.26;
    g.strokeText(str, -size * 0.05, size * 0.07); g.fillText(str, -size * 0.05, size * 0.07);
    g.strokeStyle = HV.line; g.lineWidth = size * 0.26; g.strokeText(str, 0, 0);
    g.strokeStyle = HV.cream; g.lineWidth = size * 0.11; g.strokeText(str, 0, 0);
    const gr = g.createLinearGradient(0, -size * 0.42, 0, size * 0.42);
    gr.addColorStop(0, top); gr.addColorStop(0.42, top); gr.addColorStop(0.46, base); gr.addColorStop(1, base);
    g.fillStyle = gr; g.fillText(str, 0, 0);
    g.restore();
  }

  // ================================================================================================================
  // the atmosphere: cherry petals and green and cream sparkle motes shared by every menu screen
  // ================================================================================================================
  const PETAL_COLS = ['#ffc2dc', '#ff9cc6', '#fff4f8', '#ffb3d4'];
  function makeAtmos(kind, seed) {
    const r = U.rng(U.hash('menu-atmos', kind, seed));
    const N = kind === 'title' ? 34 : 20;
    const ps = [];
    for (let i = 0; i < N; i++) {
      const z = 0.45 + r() * 0.95;
      ps.push({ x: r() * 1340 - 30, y: r() * 760 - 20, z, vx: -(8 + r() * 14) * z, vy: (16 + r() * 24) * z, rot: r() * TAU, vr: (r() - 0.5) * 1.8, ph: r() * TAU, sz: (4.5 + r() * 5.5) * z, mote: r() < 0.22, col: PETAL_COLS[i % PETAL_COLS.length] });
    }
    return {
      count: () => (reduce() ? Math.ceil(N * 0.3) : N),
      update(dt, t) {
        const k = reduce() ? 0.3 : 1;
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 12 * p.z) * dt * k;
          p.y += p.vy * dt * k;
          p.rot += p.vr * dt * k;
          if (p.y > 750) { p.y = -20; p.x = ((p.x + 1340 + p.ph * 90) % 1340) - 30; }
          if (p.x < -40) p.x += 1360;
        }
      },
      draw(ctx, t, shiftX, tint) {
        const tk = T();
        if (!tk) return;
        const n = this.count();
        for (let i = 0; i < n; i++) {
          const p = ps[i];
          const x = p.x + (shiftX || 0) * p.z * 0.6, y = p.y;
          if (p.mote) tk.sparkle(ctx, x, y, p.sz * 0.75, { color: tint || (i % 2 ? HV.lime : HV.cream), alpha: 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + p.ph)), glow: 0.35, rot: p.rot * 0.2 });
          else tk.petal(ctx, x, y, p.sz, p.rot + Math.sin(t * 1.3 + p.ph) * 0.5, 0.55 + 0.35 * p.z * 0.5, p.col);
        }
      },
    };
  }

  // ================================================================================================================
  // backdrops for the non-title screens (HV_ART_AUDIO 3.4): the deep indigo night with soft spotlights from the two top corners, bokeh, a faint
  // stage floor at the bottom, drifting petals and sparkles. A cached sprite plus a few live glows, so each frame is one drawImage and a few sprites.
  // Each variant shifts the spotlight colours: hero select pink and green (the duo), the Tour Bus teal and violet with a string of fairy lights,
  // the paper screens (settings, How to Play) pink and violet.
  // ================================================================================================================
  const BG_LOOK = {
    hero: { a: HV.pink, b: HV.green, floor: '#3b2a7a', bokeh: [HV.pink, HV.green, HV.cream] },
    library: { a: HV.teal, b: HV.violet, floor: '#2e2166', bokeh: [HV.teal, HV.violet, HV.gold], lights: true },
    paper: { a: HV.pink, b: HV.violet, floor: '#3b2a7a', bokeh: [HV.pink, HV.violet, HV.cream] },
  };
  const FAIRY = (() => { const out = []; for (let i = 0; i <= 26; i++) { const u = i / 26; out.push([20 + u * 1240, 34 + Math.sin(u * Math.PI * 3) * 16 + 18]); } return out; })();
  function bgSprite(variant) {
    if (typeof ART === 'undefined' || !ART.sprite || !T()) return null;
    const L = BG_LOOK[variant] || BG_LOOK.hero;
    return art(() => ART.sprite('menu|bg2|' + variant, 1280, 720, (g, w, h) => {
      const tk = T();
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#070516'); gr.addColorStop(0.55, '#171040'); gr.addColorStop(1, L.floor);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      tk.stars(g, 0, 0, w, h * 0.62, 0, { n: 80, seed: variant.length + 5 });
      const r = U.rng(U.hash('menu-bg2', variant));
      // two soft spotlight cones from the top corners, crossing over the middle of the floor
      g.save(); g.globalCompositeOperation = 'lighter';
      [[70, L.a, 760], [1210, L.b, 520]].forEach((c) => {
        g.beginPath(); g.moveTo(c[0] - 26, -10); g.lineTo(c[0] + 26, -10); g.lineTo(c[2] + 250, h); g.lineTo(c[2] - 250, h); g.closePath();
        const cg = g.createLinearGradient(c[0], 0, c[2], h); cg.addColorStop(0, rgba(c[1], 0.2)); cg.addColorStop(0.7, rgba(c[1], 0.06)); cg.addColorStop(1, rgba(c[1], 0));
        g.fillStyle = cg; g.fill();
      });
      // bokeh: soft discs of stage light far behind everything
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = 60 + r() * h * 0.7, rr = 10 + r() * 34, col = L.bokeh[i % L.bokeh.length];
        const bg = g.createRadialGradient(x, y, 0, x, y, rr); bg.addColorStop(0, rgba(col, 0.1 + r() * 0.08)); bg.addColorStop(0.7, rgba(col, 0.05)); bg.addColorStop(1, rgba(col, 0));
        g.fillStyle = bg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      g.restore();
      // a faint stage floor along the bottom: a wide lip with boards and a cream edge, lit where the cones land
      g.beginPath(); g.ellipse(w / 2, h + 150, w * 0.78, 250, 0, Math.PI, 0); g.closePath();
      const fl = g.createLinearGradient(0, h - 100, 0, h); fl.addColorStop(0, 'rgba(59,42,122,0.55)'); fl.addColorStop(1, 'rgba(20,15,46,0.85)');
      g.fillStyle = fl; g.fill();
      g.strokeStyle = 'rgba(255,248,236,0.18)'; g.lineWidth = 3; g.stroke();
      g.save(); g.beginPath(); g.ellipse(w / 2, h + 150, w * 0.78, 250, 0, Math.PI, 0); g.clip();
      g.strokeStyle = 'rgba(7,5,26,0.25)'; g.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(w / 2, h + 150, w * 0.78 - k * 40, 250 - k * 16, 0, Math.PI, 0); g.stroke(); }
      g.restore();
      if (L.lights) {
        // a string of fairy lights along the top: the Tour Bus at night
        g.strokeStyle = 'rgba(45,23,15,0.9)'; g.lineWidth = 2; g.beginPath(); FAIRY.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      }
      tk.vignette(g, w, h, { color: '#07051a', alpha: 0.6, inner: 0.38 });
    }), 'bg');
  }

  const BULBS = [HV.pink, HV.gold, HV.green, HV.sky, HV.violet];
  function drawBackdrop(ctx, t, variant, atmos, o) {
    o = o || {};
    const tk = T();
    const L = BG_LOOK[variant] || BG_LOOK.hero;
    const spr = bgSprite(variant);
    if (spr) safe(() => ctx.drawImage(spr, 0, 0, 1280, 720));
    else { ctx.fillStyle = '#12102e'; ctx.fillRect(0, 0, 1280, 720); }
    if (!tk) return;
    if (o.tint) {
      const pulse = reduce() ? 0.8 : 0.85 + 0.15 * Math.sin(t * 0.9);
      tk.glow(ctx, o.tx === undefined ? 380 : o.tx, o.ty === undefined ? 300 : o.ty, o.tr || 420, o.tint, 0.28 * pulse);
    }
    // the spotlight lamps in the two top corners breathe softly
    const br = reduce() ? 0.85 : 0.75 + 0.25 * Math.sin(t * 0.7);
    tk.glow(ctx, 70, 0, 150 * br, L.a, 0.3 * br); tk.glow(ctx, 1210, 0, 150 * br, L.b, 0.3 * br);
    if (L.lights) {
      FAIRY.forEach((p, i) => {
        if (i % 2) return;
        const fl = reduce() ? 1 : 0.7 + 0.3 * Math.sin(t * (1.6 + (i % 5) * 0.3) + i);
        const col = BULBS[(i / 2) % BULBS.length];
        tk.glow(ctx, p[0], p[1] + 5, 22 * fl, col, 0.5 * fl);
        ctx.beginPath(); ctx.arc(p[0], p[1] + 5, 3.4, 0, TAU); ctx.fillStyle = col; ctx.fill();
      });
    }
    if (!reduce()) tk.mist(ctx, 0, 420, 1280, 300, t, { n: 4, seed: 11, color: '#c9b8ff', alpha: 0.04, speed: 8 });
    if (atmos) atmos.draw(ctx, t, o.shiftX || 0, o.motes);
  }

  // ================================================================================================================
  // shared: starting a run, fullscreen
  // ================================================================================================================
  let starting = false;
  function confirmOverwrite() {
    if (!safe(() => META.hasRun(), false)) return Promise.resolve(true);
    return UI.confirm({ title: 'Start a new tour?', body: 'You have a tour on the road. Starting a new one will replace it.', yes: 'Start fresh', no: 'Keep my tour', danger: true });
  }
  function beginRun(opts) {
    if (starting) return Promise.resolve(false);
    starting = true;
    return confirmOverwrite().then((ok) => {
      if (!ok) { starting = false; return false; }
      const G = game();
      if (!G || typeof G.newRun !== 'function') { starting = false; UI.toast('The tour cannot start yet', 'bad'); return false; }
      const R = G.newRun(opts);
      UI.after(900, () => { starting = false; });
      if (!R) starting = false;
      return !!R;
    }, () => { starting = false; return false; });
  }

  const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || (document.documentElement && document.documentElement.requestFullscreen));
  const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFullscreen() {
    return safe(() => {
      if (fsActive()) {
        const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return p && p.then ? p.then(() => {}, () => {}) : undefined;
      }
      const de = document.documentElement;
      const p = (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      const lock = () => (window.screen && window.screen.orientation && window.screen.orientation.lock ? window.screen.orientation.lock('landscape') : null);
      if (p && p.then) return p.then(lock, () => {}).then(() => {}, () => {});
      lock();
      return undefined;
    });
  }

  // ================================================================================================================
  // TITLE: the fallback scene (used only when art_scenes.js cannot paint the real one), the logo fallback, the plaques
  // ================================================================================================================
  const TM = 50;                                            // parallax margin baked into the fallback sprites
  // real art declares itself (ART.declare('scene', ids)); until then the placeholder or a half-written scene must not reach the player
  const sceneIsReal = () => typeof ART !== 'undefined' && !!ART.scene && typeof ART.scene.draw === 'function'
    && (safe(() => ART.has('scene', 'title'), false) || (Array.isArray(ART.scene.ids) && ART.scene.ids.indexOf('title') >= 0));


  // the fallback title: a flat version of the real one (HV_ART_AUDIO 3.2): the indigo night with the big cream moon, the three Acts on the horizon,
  // a cherry hill and the tour van, the little round stage with its curtains and fairy lights, and the vintage mic at the centre, wrapped in the
  // Gloss until the first win. Everything sits in x 370 to 910, clear of the menu column (x 998).
  function titleSprites() {
    if (typeof ART === 'undefined' || !ART.sprite || !T()) return null;
    const W = 1280 + TM * 2, H = 720 + TM * 2, spr = {};
    const mkSprite = (name, fn) => { spr[name] = art(() => ART.sprite('menu|title2|' + name, W, H, (g) => { g.translate(TM, TM); fn(g, T()); }), 'title-' + name); };
    mkSprite('sky', (g, tk) => {
      const gr = g.createLinearGradient(0, -TM, 0, 720 + TM);
      gr.addColorStop(0, '#070516'); gr.addColorStop(0.55, '#2b1f6e'); gr.addColorStop(0.8, '#59399a'); gr.addColorStop(1, '#3b2a7a');
      g.fillStyle = gr; g.fillRect(-TM, -TM, W, H);
      tk.stars(g, -TM, -TM, W, 520, 0, { n: 140, seed: 4 });
      tk.glow(g, 470, 150, 260, HV.warm, 0.22);
      g.beginPath(); g.arc(470, 150, 96, 0, TAU); g.fillStyle = '#fff2c4'; g.fill();
      g.beginPath(); g.arc(486, 136, 84, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
      [[440, 128, 14], [500, 182, 10], [452, 190, 7], [512, 120, 6]].forEach((c) => { g.beginPath(); g.arc(c[0], c[1], c[2], 0, TAU); g.fillStyle = 'rgba(214,190,140,0.35)'; g.fill(); });
    });
    mkSprite('far', (g) => {
      const r = U.rng(51);
      // the sea under the horizon
      const sea = g.createLinearGradient(0, 470, 0, 720 + TM); sea.addColorStop(0, '#3b2a7a'); sea.addColorStop(1, '#140f3a');
      g.fillStyle = sea; g.fillRect(-TM, 470, W, 300);
      // Blossom Bay: candy houses climbing a hill on the left, lit windows
      g.beginPath(); g.moveTo(-TM, 500); g.quadraticCurveTo(120, 380, 330, 478); g.lineTo(330, 520); g.lineTo(-TM, 520); g.closePath(); g.fillStyle = '#2a1d5e'; g.fill();
      const HOUSE = ['#e8553f', '#8fe3c0', '#ffd84d', '#7cc6ff', '#ff9fc6'];
      for (let i = 0; i < 9; i++) {
        const x = -20 + i * 36 + r() * 8, base = 500 - Math.sin(i / 8 * Math.PI) * 70, hw = 26 + r() * 10, hh = 26 + r() * 18;
        g.fillStyle = rgba(HOUSE[i % HOUSE.length], 0.55); g.fillRect(x, base - hh, hw, hh);
        g.beginPath(); g.moveTo(x - 3, base - hh); g.lineTo(x + hw / 2, base - hh - 14); g.lineTo(x + hw + 3, base - hh); g.closePath(); g.fillStyle = 'rgba(42,29,94,0.85)'; g.fill();
        g.fillStyle = 'rgba(255,233,168,0.85)'; g.fillRect(x + 6, base - hh + 8, 6, 7); if (r() < 0.6) g.fillRect(x + hw - 12, base - hh + 8, 6, 7);
      }
      // Scrollopolis: phone towers with little glowing screens on the right
      const SCREEN = ['#3d7bff', '#3ff0ff', '#ff6fb5'];
      for (let i = 0; i < 6; i++) {
        const x = 930 + i * 52 + r() * 10, tw = 34 + r() * 10, th = 120 + r() * 120;
        rrect(g, x, 500 - th, tw, th, 7); g.fillStyle = '#1c1846'; g.fill();
        for (let k = 0; k < 5; k++) { g.fillStyle = rgba(SCREEN[(i + k) % 3], 0.5 + r() * 0.3); g.fillRect(x + 6, 500 - th + 10 + k * 20, tw - 12, 12); }
      }
      g.strokeStyle = 'rgba(63,240,255,0.25)'; g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(930 + i * 60, 420 - i * 20); g.quadraticCurveTo(1010 + i * 50, 470, 1090 + i * 40, 400 - i * 12); g.stroke(); }
      // the Perfect Stage: a faint opalescent ring of light floating far above the sea
      g.save(); g.translate(640, 258); g.scale(1, 0.24);
      const ring = g.createLinearGradient(-90, 0, 90, 0); GLOSS.forEach((c, i) => ring.addColorStop(i / 3, rgba(c, 0.55)));
      g.beginPath(); g.arc(0, 0, 90, 0, TAU); g.strokeStyle = ring; g.lineWidth = 14; g.stroke(); g.restore();
    });
    mkSprite('mid', (g) => {
      // a gentle hill of cherry trees at the left
      g.beginPath(); g.moveTo(-TM, 560); g.quadraticCurveTo(150, 470, 420, 560); g.lineTo(420, 720 + TM); g.lineTo(-TM, 720 + TM); g.closePath(); g.fillStyle = '#21184e'; g.fill();
      const r = U.rng(61);
      [[60, 500, 1], [150, 486, 1.15], [250, 510, 0.9]].forEach((tr) => {
        g.fillStyle = '#3a2350'; g.fillRect(tr[0] - 5 * tr[2], tr[1] - 6, 10 * tr[2], 60);
        for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(tr[0] + (r() - 0.5) * 70 * tr[2], tr[1] - 30 * tr[2] + (r() - 0.5) * 40 * tr[2], (22 + r() * 12) * tr[2], 0, TAU); g.fillStyle = k % 3 ? '#ff9fc6' : '#ffc2dc'; g.fill(); }
      });
      // the tour van at x 300 to 380 with Jordan's poster in its window
      rrect(g, 296, 506, 88, 44, 12); g.fillStyle = HV.cream; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
      g.fillStyle = HV.teal; g.fillRect(298, 532, 84, 7);
      rrect(g, 306, 512, 26, 16, 4); g.fillStyle = '#7cc6ff'; g.fill(); g.stroke();
      rrect(g, 340, 512, 24, 16, 3); g.fillStyle = HV.paper; g.fill(); g.stroke();
      starPath(g, 352, 520, 5, 0); g.fillStyle = HV.gold; g.fill();
      [318, 364].forEach((x) => { g.beginPath(); g.arc(x, 552, 8, 0, TAU); g.fillStyle = HV.line; g.fill(); g.beginPath(); g.arc(x, 552, 3, 0, TAU); g.fillStyle = '#c9cbd6'; g.fill(); });
      // bunting from the van roof to a lamppost
      g.fillStyle = '#3a2f6e'; g.fillRect(414, 456, 5, 100);
      g.beginPath(); g.arc(416, 452, 8, 0, TAU); g.fillStyle = '#ffe9a8'; g.fill();
      const FLAG = [HV.pink, HV.green, HV.gold, HV.sky, HV.violet];
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6, x = 370 + u * 44, y = 506 + Math.sin(u * Math.PI) * 10 - u * 50;
        g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.lineTo(x, y + 9); g.closePath(); g.fillStyle = FLAG[i % FLAG.length]; g.fill();
      }
    });
    mkSprite('stage', (g) => {
      // red curtains at both sides from y 296: each drape hangs in folds, is tied back at y 470 so its inner edge sweeps out to the floor
      [[370, 430, 1], [910, 850, -1]].forEach((c) => {
        const xo = c[0], xi = c[1], d = c[2];
        g.beginPath(); g.moveTo(xo, 296); g.lineTo(xi, 296);
        g.bezierCurveTo(xi + d * 6, 380, xi - d * 26, 440, xi - d * 34, 470);
        g.bezierCurveTo(xi - d * 22, 500, xi + d * 2, 540, xi + d * 6, 562);
        g.lineTo(xo, 562); g.closePath();
        const cg = g.createLinearGradient(Math.min(xo, xi), 0, Math.max(xo, xi), 0);
        for (let k = 0; k <= 4; k++) { cg.addColorStop(k / 4, k % 2 ? HV.curtainD : HV.curtain); if (k < 4) cg.addColorStop((k + 0.5) / 4, '#e2416a'); }
        g.fillStyle = cg; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
        g.beginPath(); g.ellipse(xi - d * 30, 470, 14, 7, d * 0.3, 0, TAU); g.fillStyle = HV.gold; g.fill(); g.lineWidth = 2; g.stroke();
      });
      // the valance: a scalloped band across the top of the stage opening
      g.beginPath(); g.moveTo(364, 286); g.lineTo(916, 286); g.lineTo(916, 304);
      for (let x = 916; x > 364; x -= 46) g.quadraticCurveTo(x - 23, 326, Math.max(364, x - 46), 304);
      g.closePath(); g.fillStyle = HV.curtain; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
      // the round stage: a cream lip under a warm boards top (top y 530, lip down to y 566, x 430 to 850)
      g.beginPath(); g.ellipse(640, 540, 214, 30, 0, 0, Math.PI); g.lineTo(426, 556); g.ellipse(640, 556, 214, 30, 0, Math.PI, 0, true); g.closePath();
      g.fillStyle = HV.paper; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
      for (let k = 0; k < 12; k++) { const a = Math.PI * (k + 0.5) / 12; g.beginPath(); g.arc(640 - Math.cos(a) * 200, 548 + Math.sin(a) * 26, 3.2, 0, TAU); g.fillStyle = '#ffe9a8'; g.fill(); }
      g.beginPath(); g.ellipse(640, 540, 214, 30, 0, 0, TAU);
      const top = g.createLinearGradient(0, 510, 0, 570); top.addColorStop(0, '#7a3d8f'); top.addColorStop(1, '#4b2470');
      g.fillStyle = top; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
      g.beginPath(); g.ellipse(640, 536, 150, 16, 0, 0, TAU); g.fillStyle = 'rgba(255,244,214,0.16)'; g.fill();
      // a string of fairy lights across the top
      g.strokeStyle = 'rgba(45,23,15,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(430, 314); g.quadraticCurveTo(640, 344, 850, 314); g.stroke();
      for (let k = 1; k < 14; k++) { const u = k / 14, x = 430 + 420 * u, y = 314 + 30 * 2 * u * (1 - u) + 3; g.beginPath(); g.arc(x, y + 3, 4, 0, TAU); g.fillStyle = [HV.pink, HV.gold, HV.green, HV.sky][k % 4]; g.fill(); }
      // the mic stand: a round foot, a chrome pole and the vintage mic head at y 390
      g.beginPath(); g.ellipse(640, 532, 30, 7, 0, 0, TAU); g.fillStyle = '#2b2a3a'; g.fill(); g.strokeStyle = HV.line; g.lineWidth = 2.5; g.stroke();
      const pole = g.createLinearGradient(634, 0, 646, 0); pole.addColorStop(0, '#8d8fa0'); pole.addColorStop(0.5, '#f1f2f8'); pole.addColorStop(1, '#8d8fa0');
      g.fillStyle = pole; g.fillRect(636, 410, 8, 122); g.strokeRect(636, 410, 8, 122);
      rrect(g, 618, 352, 44, 64, 20);
      const head = g.createLinearGradient(618, 0, 662, 0); head.addColorStop(0, '#9da0b2'); head.addColorStop(0.45, '#f4f5fa'); head.addColorStop(1, '#8d8fa0');
      g.fillStyle = head; g.fill(); g.lineWidth = 3; g.strokeStyle = HV.line; g.stroke();
      g.strokeStyle = 'rgba(45,23,15,0.35)'; g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(622, 362 + k * 9); g.lineTo(658, 362 + k * 9); g.stroke(); }
      g.fillStyle = HV.pink; g.fillRect(620, 396, 40, 6);
    });
    mkSprite('gloss', (g) => {
      // the Gloss creeping in from the four corners: airbrushed opalescent blobs, perfectly still, no outline
      [[-TM, -TM, 0], [1280 + TM, -TM, 1], [-TM, 720 + TM, 2], [1280 + TM, 720 + TM, 3]].forEach((c) => {
        const gr = g.createRadialGradient(c[0], c[1], 10, c[0], c[1], 260);
        gr.addColorStop(0, rgba(GLOSS[c[2]], 0.5)); gr.addColorStop(0.55, rgba(GLOSS[(c[2] + 1) % 4], 0.22)); gr.addColorStop(1, 'rgba(244,241,251,0)');
        g.fillStyle = gr; g.fillRect(c[0] - 280, c[1] - 280, 560, 560);
      });
    });
    return spr;
  }

  const MIC = { x: 640, y: 390 };                            // the fallback mic head: rings, notes and hearts rise from here
  function drawTitleFallback(ctx, t, S) {
    const tk = T();
    if (!S.spr) S.spr = titleSprites();                      // a real scene that failed hands over to the fallback, which bakes its sprites now
    const W = 1280 + TM * 2, H = 720 + TM * 2;
    const k = reduce() ? 0 : 1;
    const layer = (name, depth, lift) => { const s = S.spr && S.spr[name]; if (s) safe(() => ctx.drawImage(s, -TM - S.px * depth * k, -TM - S.py * depth * 0.6 * k + (lift || 0), W, H)); };
    if (!S.spr || !S.spr.sky) { ctx.fillStyle = '#12102e'; ctx.fillRect(0, 0, 1280, 720); }
    layer('sky', 3);
    if (tk) {
      tk.stars(ctx, 0, 0, 1280, 460, t, { n: 50, seed: 8 });
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.6);
      tk.glow(ctx, 470 - S.px * 3 * k, 150, 230 + pulse * 20, HV.warm, 0.14 + 0.06 * pulse);
    }
    layer('far', 5);
    layer('mid', 18);
    // stage light: two soft cones from the top onto the stage, dust motes in them
    if (tk) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      [[520, HV.pink], [760, HV.green]].forEach((c, i) => {
        const sway = reduce() ? 0 : Math.sin(t * 0.4 + i * 2) * 12;
        ctx.beginPath(); ctx.moveTo(c[0] - 14, 300); ctx.lineTo(c[0] + 14, 300); ctx.lineTo(640 + sway + 150, 548); ctx.lineTo(640 + sway - 150, 548); ctx.closePath();
        const cg = ctx.createLinearGradient(0, 300, 0, 548); cg.addColorStop(0, rgba(c[1], 0.22)); cg.addColorStop(1, rgba(c[1], 0.03));
        ctx.fillStyle = cg; ctx.fill();
      });
      ctx.restore();
    }
    layer('stage', 10);
    if (tk) {
      const mx = MIC.x - S.px * 10 * k, my = MIC.y - S.py * 6 * k;
      if (!S.won) {
        // shrink-wrapped in the Gloss: an opalescent film over the mic and its stand, a diagonal highlight sweep, a polite smile sparkle
        ctx.save();
        rrect(ctx, mx - 30, my - 46, 60, 186, 28);
        const fg = ctx.createLinearGradient(mx - 30, my - 46, mx + 30, my + 140);
        GLOSS.forEach((c, i) => fg.addColorStop(i / 3, rgba(c, 0.62)));
        ctx.fillStyle = fg; ctx.fill();
        ctx.clip();
        const sw = ((t * 0.22) % 1.4) - 0.2;
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(mx - 40, my - 60 + sw * 240); ctx.lineTo(mx + 40, my - 100 + sw * 240); ctx.lineTo(mx + 40, my - 84 + sw * 240); ctx.lineTo(mx - 40, my - 44 + sw * 240); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.save(); ctx.strokeStyle = 'rgba(201,203,214,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(mx, my + 2, 8, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); ctx.restore();
        spark(ctx, mx + 20, my - 34, 7, '#ffffff', 0.5 + 0.5 * Math.sin(t * 2.1), 0);
        // every 10.5 s a ring leaves the wrapped mic and breaks into soft pastel blobs at r 160 (muffled)
        const ph = ((t / 10.5) % 1 + 1) % 1, rr = 30 + ph * 150;
        if (ph < 0.8) tk.soundRings(ctx, mx, my, rr, { n: 1, color: '#e6d9ff', alpha: (1 - ph / 0.8) * 0.6, lw: 3 });
        else for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * 160, my + Math.sin(a) * 160 * 0.8, 6 + 4 * (ph - 0.8) * 5, 0, TAU); ctx.fillStyle = rgba(GLOSS[i % 4], (1 - ph) * 3); ctx.fill(); }
      } else {
        // live: no wrap, a warm glow, a whole ring to r 260, and notes and hearts rising
        tk.glow(ctx, mx, my, 120, HV.warm, 0.35);
        for (let i = 0; i < (reduce() ? 1 : 2); i++) { const ph = ((t / 3.5 + i / 2) % 1 + 1) % 1; tk.soundRings(ctx, mx, my, 30 + ph * 230, { n: 1, color: HV.warm, alpha: (1 - ph) * 0.7, lw: 3 }); }
        const nW = reduce() ? 3 : 8;
        for (let i = 0; i < nW; i++) {
          const ph = ((t * 0.12 + i / nW) % 1 + 1) % 1, x = mx + Math.sin(i * 7.1 + t * 0.5) * (40 + ph * 60), y = my - 30 - ph * 200, a = Math.sin(Math.PI * ph);
          if (i % 3 === 2) { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.fillStyle = HV.pink; ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-9, -2, -5, -10, 0, -4); ctx.bezierCurveTo(5, -10, 9, -2, 0, 5); ctx.fill(); ctx.restore(); }
          else tk.note(ctx, x, y, 9, { color: i % 2 ? HV.cream : HV.lime, alpha: a, kind: i % 2 ? 'eighth' : 'beamed' });
        }
      }
    }
    ctx.save(); ctx.globalAlpha = S.won ? 0.5 : 0.9; layer('gloss', 0); ctx.restore();
    if (tk) tk.vignette(ctx, 1280, 720, { color: '#07051a', alpha: 0.5, inner: 0.45 });
  }

  // the logo when ART.scene.logo is missing or throws: HOCUS over VOCUS in sticker letters (pink, green), the mic-wand with its gold star
  // crossing behind and a few sparkles. Centred on (cx, cy), w wide, about 0.4 w tall, like the real one.
  function drawLogoFallback(ctx, cx, cy, w, t) {
    ctx.save();
    ctx.font = '900 100px ' + ROUND;
    const m = safe(() => ctx.measureText('HOCUS').width, 0) || 360;
    ctx.restore();
    const size = clamp((w * 0.78) / m * 100, 24, 220);
    const dy = w * 0.095, bob = (i) => (reduce() ? 0 : Math.sin(t * TAU / 0.8 + i * 0.9) * 2);
    // the mic-wand behind both words, lower left to upper right
    const ax = cx - w * 0.44, ay = cy + w * 0.17, bx = cx + w * 0.4, by = cy - w * 0.16;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = HV.line; ctx.lineWidth = w * 0.05; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#1d1a2c'; ctx.lineWidth = w * 0.032; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const bandX = ax + (bx - ax) * 0.84, bandY = ay + (by - ay) * 0.84;
    ctx.strokeStyle = HV.pink; ctx.lineWidth = w * 0.034; ctx.beginPath(); ctx.moveTo(bandX, bandY); ctx.lineTo(bandX + (bx - ax) * 0.05, bandY + (by - ay) * 0.05); ctx.stroke();
    starPath(ctx, bx + w * 0.02, by - w * 0.01, w * 0.07, 0.2); ctx.fillStyle = HV.gold; ctx.fill(); ctx.lineWidth = w * 0.012; ctx.strokeStyle = HV.line; ctx.stroke();
    ctx.restore();
    stickerWord(ctx, 'HOCUS', cx - w * 0.02, cy - dy + bob(0), size, HV.pinkL, HV.pink, { rot: -0.03 });
    stickerWord(ctx, 'VOCUS', cx + w * 0.03, cy + dy + bob(1), size, HV.lime, HV.green, { rot: 0.03 });
    const tw = (i) => 0.5 + 0.5 * Math.sin(t * 1.7 + i * 2.1);
    [[cx + w * 0.47, cy - w * 0.2, 0.03], [cx - w * 0.46, cy - w * 0.12, 0.022], [cx + w * 0.36, cy + w * 0.19, 0.018], [cx - w * 0.3, cy + w * 0.2, 0.014]].forEach((s, i) => spark(ctx, s[0], s[1], w * s[2], i % 2 ? HV.lime : HV.cream, reduce() ? 0.8 : 0.35 + 0.65 * tw(i), 0));
  }

  // ---- the plaques
  function plaque(kind, main, sub, o) {
    o = o || {};
    const kids = [mk('span', { class: 'mn-p-text' }, mk('span', { class: 'mn-p-main', text: main }), sub ? mk('span', { class: 'mn-p-sub', text: sub }) : null)];
    if (o.extra) kids.push(o.extra);
    kids.push(mk('i', { class: 'btn-shine', 'aria-hidden': 'true' }));
    const b = mk('button', { type: 'button', class: 'btn btn-' + kind + ' mn-plaque' + (o.big ? ' mn-big' : '') + (o.slim ? ' mn-slim' : '') + (o.breathe ? ' breathe' : ''), dataset: Object.assign({ act: o.act || '' }, o.sfx ? { sfx: o.sfx } : {}) }, kids);
    if (o.onclick) b.addEventListener('click', (e) => o.onclick(e, b));
    return b;
  }
  const TITLE_MEDAL = 26;                                      // hero faces on the Continue and Daily plaques: sized for the 268 px column right of the painted bell (menu.css .s-title .mn-menu)
  const medalStrip = (ids, size) => mk('span', { class: 'mn-p-meds', 'aria-hidden': 'true' }, (ids || []).map((id) => UI.medallion(id, size || 34)));

  let TS = null;                                              // the live title state (one screen at a time)
  const title = {
    music: 'title',
    enter(params, root) {
      const off = listeners();
      const hasRun = !!safe(() => META.hasRun(), false);
      const info = hasRun ? safe(() => META.runInfo(), null) : null;
      const seed = dailySeed();
      const dHeroes = seed ? (safe(() => RUN.dailyHeroes(seed), []) || []) : [];
      const best = seed ? dailyBest(seed) : null;
      const played = seed ? !!safe(() => META.dailyPlayed(today()), false) : false;
      const real = sceneIsReal();
      const gateOn = !mem.gateDone && !(typeof AUDIO !== 'undefined' && AUDIO && AUDIO.ready);
      const won = isFn(typeof META !== 'undefined' && META && META.trialMax) ? safe(() => META.trialMax() > 0, false) : false;   // true exactly when the profile has a win: the title clears its threads (ART never reads META)
      const S = TS = { root, off, hasRun, won, info, seed, best, played, dHeroes, real, gateOn, px: 0, py: 0, tpx: 0, tpy: 0, atmos: makeAtmos('title', 1), spr: real ? null : titleSprites(), items: [], gate: null, fs: null };

      const menu = mk('nav', { class: 'mn-menu', 'aria-label': 'Main menu' });
      const items = S.items;
      if (hasRun) {
        const sub = info ? info.text : 'Back to your tour';
        const extra = mk('span', { class: 'mn-p-side' }, info && info.trial > 0 ? UI.hanko('E' + info.trial, { size: 'sm', label: 'Encore ' + info.trial }) : null, info && info.daily ? UI.hanko('D', { size: 'sm', label: 'Daily Duet' }) : null, medalStrip(info && info.heroes, TITLE_MEDAL));
        items.push(plaque('primary', 'Continue', sub, { big: true, breathe: true, act: 'continue', sfx: 'page_turn', extra, onclick: () => { const G = game(); if (G) G.continueRun(); } }));
      }
      items.push(plaque(hasRun ? 'secondary' : 'primary', 'New Tour', 'Pick your duo and an Encore', { big: true, breathe: !hasRun, act: 'new', sfx: 'page_turn', onclick: () => UI.go('heroSelect', null, { transition: 'page' }) }));
      // the Daily plaque is built from S so it can be rebuilt when the date turns over while the title stays open (L26)
      const dailyPlaque = () => {
        const dSub = (S.seed ? 'Seed ' + S.seed + ' · ' : '') + (S.best !== null ? 'Best ' + fmt(S.best) : S.played ? 'Played today' : 'A new duet every day');
        return plaque('secondary', 'Daily Duet', dSub, { big: true, act: 'daily', sfx: 'page_turn', extra: mk('span', { class: 'mn-p-side' }, S.played ? UI.hanko('', { size: 'sm', class: 'mn-ck', label: 'Played today' }) : null, medalStrip(S.dHeroes, TITLE_MEDAL)), onclick: () => { if (!S.refreshDaily()) beginRun({ daily: true }); } });
      };
      S.refreshDaily = () => {                                  // true when the day had changed: the plaque now shows the new duet and nothing starts
        const nowSeed = dailySeed();
        if (nowSeed === S.seed) return false;
        S.seed = nowSeed;
        S.dHeroes = nowSeed ? (safe(() => RUN.dailyHeroes(nowSeed), []) || []) : [];
        S.best = nowSeed ? dailyBest(nowSeed) : null;
        S.played = nowSeed ? !!safe(() => META.dailyPlayed(today()), false) : false;
        const old = items.find((b) => b.dataset.act === 'daily');
        if (old) {
          const fresh = dailyPlaque(), had = document.activeElement === old;
          fresh.style.setProperty('--i', old.style.getPropertyValue('--i'));
          old.replaceWith(fresh);
          items[items.indexOf(old)] = fresh;
          if (had) safe(() => fresh.focus());
        }
        if (nowSeed) UI.toast('A new Daily Duet has begun', 'info');
        return true;
      };
      items.push(dailyPlaque());
      items.push(plaque('secondary', 'Tour Bus', null, { slim: true, act: 'library', sfx: 'page_turn', onclick: () => UI.go('library', { tab: mem.libTab }, { transition: 'page' }) }));
      items.push(plaque('secondary', 'Settings', null, { slim: true, act: 'settings', onclick: () => UI.go('settings') }));
      items.push(plaque('secondary', 'How to Play', null, { slim: true, act: 'howto', onclick: () => UI.go('howto') }));
      const slims = mk('div', { class: 'mn-slims' });
      items.forEach((b) => (b.classList.contains('mn-slim') ? slims : menu).appendChild(b));
      menu.appendChild(slims);

      // the footer (HV_STORY 5.4, 5.6): the credits line on the left, then Follow the duo, Share and (once the owners set a URL) Support the duo, the version last.
      // On a narrow portrait stage menu.css moves the credits line above and keeps only Follow the duo and Share (.mn-foot-opt hides Support there).
      const foot = mk('div', { class: 'mn-foot' + (hasRun ? ' has-run' : '') }, mk('span', { class: 'mn-credits', text: CREDITS_LINE }),
        mk('div', { class: 'mn-foot-btns' }, followButton('mn-foot-btn'), shareButton('mn-foot-btn'), supportButton('mn-foot-btn mn-foot-opt')),
        mk('span', { class: 'mn-ver', text: 'v' + VERSION }));
      const fs = fsSupported() ? mk('button', { type: 'button', class: 'mn-fs', 'aria-label': 'Toggle full screen', title: 'Full screen' }, mk('i', { class: 'mn-fs-ico' })) : null;
      if (fs) {
        fs.addEventListener('click', () => { toggleFullscreen(); });
        const sync = () => { fs.classList.toggle('on', fsActive()); fs.setAttribute('aria-pressed', fsActive() ? 'true' : 'false'); };
        off.on(document, 'fullscreenchange', sync);
        sync();
      }
      S.fs = fs;
      const tag = mk('p', { class: 'mn-tag', text: 'beatboxing and vocal magic' });
      const gate = gateOn ? mk('button', { type: 'button', class: 'mn-gate', 'aria-label': 'Tap to begin', 'data-autofocus': '' }, mk('span', { class: 'mn-gate-text', text: 'Tap to begin' }), mk('span', { class: 'mn-gate-sub', text: 'sound on' })) : null;
      S.gate = gate;
      root.classList.toggle('ts-big', bigText());
      add(root, mk('div', { class: 'mn-title' + (gateOn ? ' gated' : '') }, mk('h1', { class: 'sr-only', text: 'Hocus Vocus, a vocal magic adventure' }), tag, menu, foot, fs, gate));
      S.wrap = root.firstChild;
      if (gateOn) { menu.setAttribute('inert', ''); foot.setAttribute('inert', ''); }               // Tab must not reach the plaques or the footer buttons hidden under the gate

      const dismiss = () => {
        if (!S.gate || S.gateDone) return;
        S.gateDone = true; mem.gateDone = true;
        menu.removeAttribute('inert'); foot.removeAttribute('inert');
        if (typeof AUDIO !== 'undefined' && AUDIO) { safe(() => AUDIO.init()); safe(() => AUDIO.resume()); }
        S.gate.classList.add('out');
        S.wrap.classList.remove('gated');
        entrance();
        const g = S.gate;
        UI.after(600, () => { safe(() => g.remove()); });
        const first = items[0];
        if (first && first.focus) safe(() => first.focus());
      };
      const entrance = () => items.forEach((b, i) => { b.style.setProperty('--i', String(i + 1)); b.classList.remove('rise'); void b.offsetWidth; b.classList.add('rise'); });
      S.dismiss = dismiss;
      if (gate) gate.addEventListener('click', dismiss); else entrance();

      const onMove = (e) => { const p = UI.toStage(e.clientX, e.clientY); S.tpx = clamp((p.x - 640) / 640, -1, 1); S.tpy = clamp((p.y - 360) / 360, -1, 1); };
      off.on(root, 'pointermove', onMove);
      UI.canvasOn('pointermove', (e) => onMove(e));
      if (!gate) { const first = items[0]; if (first) UI.after(0, () => safe(() => first.focus())); }
    },
    leave() { if (TS) { TS.off.clear(); TS = null; } },
    update(dt, t) {
      const S = TS;
      if (!S) return;
      if (t - (S.dayT || 0) >= 1 || t < (S.dayT || 0)) { S.dayT = t; S.refreshDaily(); }          // a title left open across midnight must not keep selling yesterday's jam
      const k = reduce() ? 0 : Math.min(1, dt * 3.2);
      S.px += (S.tpx - S.px) * k; S.py += (S.tpy - S.py) * k;
      if (reduce()) { S.px = 0; S.py = 0; }
      if (!S.real) S.atmos.update(dt, t);
    },
    draw(ctx, t) {
      const S = TS;
      if (!S) return;
      if (S.real) {
        // parallaxX is a camera offset in STAGE PX (art_scenes.js clamps it to +-90): the pointer at the right edge pans the camera right
        const ok = art(() => ART.scene.draw(ctx, 'title', 1280, 720, t, { particles: reduce() ? 0.3 : 1, parallaxX: reduce() ? 0 : S.px * 70, rung: S.won }), 'scene-title');
        if (ok === false || ok === undefined) S.real = false;              // a scene that fails once falls back for good (the fallback paints over it)
        // the logo spans y 42 to 258 (HV_ART_AUDIO 3.1); the tagline (.mn-tag, top 262 px) sits right under it
        else if (!art(() => { ART.scene.logo(ctx, 640, 150, 540, t); return true; }, 'scene-logo')) drawLogoFallback(ctx, 640, 150, 540, t);
      } else {
        drawTitleFallback(ctx, t, S);
        S.atmos.draw(ctx, t, -S.px * 30);
        drawLogoFallback(ctx, 640, 150, 540, t);
      }
    },
    onKey(e) {
      const S = TS;
      if (!S || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (S.gate && !S.gateDone) {
        if (e.key === 'Tab' || e.key === 'Shift') return false;
        if (e.preventDefault) e.preventDefault();               // dismiss() focuses the first plaque inside this keydown: without this the browser's default Enter or Space then clicks it (L3)
        S.dismiss(); return true;
      }
      const map = { c: 'continue', n: 'new', d: 'daily', l: 'library', s: 'settings', h: 'howto' };
      const act = map[String(e.key).toLowerCase()];
      if (!act) return false;
      const b = S.items.find((x) => x.dataset.act === act);
      if (!b) return false;
      b.click();
      return true;
    },
    state() { const S = TS; return S ? { gated: !!(S.gate && !S.gateDone), hasRun: S.hasRun, real: S.real, seed: S.seed, best: S.best, played: S.played, px: S.px, py: S.py, particles: S.atmos.count() } : null; },
  };

  // ================================================================================================================
  // HERO SELECT
  // ================================================================================================================
  // Hero cards (stage px). The DOM card, the painted portrait and the detail sheet's top (menu.css --hc-y) all read cardTop(), so they cannot drift apart.
  // yCompact: on a phone landscape the Back button is a --hit square that reaches y 81 to 88, so the row sits just under it and a chosen card does not lift into it.
  const HC = { x0: 30, y: 84, yCompact: 92, w: 168, h: 262, gap: 12, artH: 222 };
  const cardTop = (compact) => (compact ? HC.yCompact : HC.y);
  const STAGE_BOX = { x: 30, y: 356, w: 400, h: 350 };
  // The pair stands on the middle of the party frame (the frame, the floor glow and both slot labels share this one centre).
  const PARTY_CX = STAGE_BOX.x + STAGE_BOX.w / 2;
  const SLOT_DX = 75;
  const SLOT = { front: { x: PARTY_CX + SLOT_DX, y: 655, s: 0.92 }, back: { x: PARTY_CX - SLOT_DX, y: 649, s: 0.86 } };
  // The Begin button's two labels. The button is 264 to 273 stage px wide on a desktop (the launch panel is 296 px) and the Larger text size
  // makes the label 27 px: 'Start the Daily Duet' would be 294 px wide and clip the gold border, so the Daily label is the short one.
  const BEGIN_TALE = 'Start the Tour', BEGIN_DAILY = 'Start Daily Duet';
  const heroUnlocked = (id) => safe(() => META.isUnlocked('hero', id), true) !== false;
  const isCompact = (root) => !!(root && root.closest && root.closest('.compact'));    // phone landscape: UI puts class compact on #stage
  const heroArtId = (id) => (DATA.heroes[id] && DATA.heroes[id].unlock && DATA.heroes[id].unlock.ach) || null;

  // "12 Sep 2026" from a stored timestamp (an argument to Date is fine: only Date() with no argument reads the clock)
  function dateText(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return d.getDate() + ' ' + mon + ' ' + d.getFullYear();
  }

  function parseSeed(text) {
    const s = String(text || '').trim();
    if (!s) return undefined;
    if (/^\d{1,9}$/.test(s)) return Number(s) >>> 0;
    return U.hashStr(s) >>> 0;
  }

  // a hero's starting deck as [{id, n}] (the two copies of the strike and the defence collapse into one card with a count)
  function starterCounts(id) {
    const out = [];
    ((DATA.heroes[id] && DATA.heroes[id].starter) || []).forEach((cid) => { const f = out.find((x) => x.id === cid); if (f) f.n++; else out.push({ id: cid, n: 1 }); });
    return out;
  }
  const previewInst = (cid) => ({ uid: 0, id: cid, up: 0, gems: ((DATA.cards[cid] && DATA.cards[cid].slots) || []).map(() => null) });

  // a card with a big preview on hover (mouse) or tap (touch): the small starter cards show names only
  function withCardPreview(el, cid) {
    const inst = previewInst(cid);
    const show = () => { UI.tip.card(inst, { x: 400, y: 150, scale: 0.86 }); };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' || !e.pointerType) show(); });
    el.addEventListener('pointerleave', () => UI.tip.hide());
    el.addEventListener('click', () => { if (UI.tip.open) UI.tip.hide(); else show(); });
    el.addEventListener('focusin', () => { if (safe(() => el.matches(':focus-visible'), false)) show(); });
    el.addEventListener('focusout', () => UI.tip.hide());
    return el;
  }

  let HS = null;                                                // the live hero select state
  // The Daily Duet hands out every hero, so a hero locked in the profile stops looking locked while Daily is on. ONE rule for the painted portrait,
  // the card's class (padlock, greyed plate), the detail sheet and the aria label: the canvas and the DOM cannot disagree about it.
  const heroLocked = (id) => !heroUnlocked(id) && !(HS && HS.daily);
  const BANTER = ['start', 'kill', 'swap', 'win', 'hurt', 'down'];

  // The Outfit row of the detail sheet (HV_ART_AUDIO 2.11, bible 7.1): two swatch buttons, Stage clothes and the hero's outfit, each a 56 px
  // medallion in that outfit. The outfit stays locked (dimmed, a padlock, the unlock line) until its Sticker is done. A pick goes through
  // UI.outfit (the one owner of hv_skins_v1), plays ui_toggle, and ART draws the new outfit at once: the portrait, the stage and the head
  // medallion (onPick). Both swatches are buttons in tab order with aria-pressed. Andy has no outfit, so no row (null).
  function outfitRow(id, onPick) {
    const od = DATA.outfits && Object.prototype.hasOwnProperty.call(DATA.outfits, id) ? DATA.outfits[id] : null;
    if (!od || !UI.outfit) return null;
    const sw = {};
    const lockLine = mk('p', { class: 'mn-d-olock', text: 'Win 3 tours with ' + heroName(id) + ' to unlock.' });
    const swatch = (skin, label) => {
      const b = mk('button', { type: 'button', class: 'mn-sw', dataset: { skin, sfx: QUIET }, 'aria-pressed': 'false' },
        mk('span', { class: 'mn-sw-face', 'aria-hidden': 'true' }, UI.medallion(id, 56, skin)), mk('span', { class: 'mn-sw-name', text: label }));
      b.addEventListener('click', () => pick(skin));
      sw[skin] = b;
      return b;
    };
    const row = mk('div', { class: 'mn-d-line mn-d-outfit', role: 'group', 'aria-label': 'Outfit' },
      mk('span', { class: 'mn-d-oico', 'aria-hidden': 'true' }),
      mk('div', { class: 'mn-d-obody' }, mk('b', { text: 'Outfit' }), mk('div', { class: 'mn-sws' }, swatch('stage', 'Stage clothes'), swatch('skin', od.name)), lockLine));
    const sync = () => {
      const open = !!safe(() => UI.outfit.unlocked(id), false), now = safe(() => UI.outfit.of(id), 'stage');
      ['stage', 'skin'].forEach((k) => {
        const b = sw[k], locked = k === 'skin' && !open;
        b.classList.toggle('on', now === k);
        b.setAttribute('aria-pressed', now === k ? 'true' : 'false');
        b.classList.toggle('locked', locked);
        if (locked) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
        b.setAttribute('aria-label', (k === 'stage' ? 'Stage clothes' : od.name) + (locked ? ', locked' : ''));
      });
      lockLine.hidden = open;
      row.classList.toggle('open', open);
    };
    function pick(skin) {
      if (skin === 'skin' && !safe(() => UI.outfit.unlocked(id), false)) return;     // locked: the swatch is aria-disabled, so UI's click delegate already says no (ui_error and a shake)
      safe(() => UI.outfit.set(id, skin));
      sfx('ui_toggle');
      sync();
      if (onPick) safe(onPick);
    }
    row.rbSync = sync;
    sync();
    return row;
  }

  function buildDetail(id) {
    const h = DATA.heroes[id];
    const locked = heroLocked(id);
    const box = mk('div', { class: 'mn-d h-' + id + (locked ? ' locked' : '') });
    UI.vars(box, { '--hc': h.color, '--hc2': h.dark });
    const medal = locked ? mk('span', { class: 'mn-d-medal lock', 'aria-hidden': 'true' }) : mk('span', { class: 'mn-d-medal', 'aria-hidden': 'true' }, UI.medallion(id, 64));
    add(box, mk('div', { class: 'mn-d-head' }, medal,
      mk('div', { class: 'mn-d-name' }, mk('h3', { text: h.name }), mk('p', { class: 'mn-d-title', text: h.title })),
      locked ? null : mk('div', { class: 'mn-d-hp', 'aria-label': 'Hit points ' + h.maxHp }, UI.stat('hp', h.maxHp, { size: 'md', tip: false }))));
    if (locked) {
      const ach = DATA.achievements[heroArtId(id)] || null;
      const prog = safe(() => META.achievements().find((a) => a.id === heroArtId(id)), null);
      add(box, mk('div', { class: 'mn-d-locknote' },
        mk('p', { class: 'mn-d-lockhead' }, UI.hanko('LOCKED', { size: 'sm' }), mk('span', { text: ' Not on the tour yet' })),
        ach ? mk('p', { class: 'mn-d-hint' }, mk('b', { text: ach.name + ': ' }), ach.text) : null,
        prog ? mk('div', { class: 'mn-d-prog' }, UI.bar(prog.value, prog.gte, 'xp', { text: true })) : null,
        mk('p', { class: 'mn-d-quiet', text: 'Clear the act to bring ' + h.name + ' on every future tour.' })));
      return box;
    }
    add(box, mk('p', { class: 'mn-d-blurb', text: h.blurb }));
    const rowChip = (row) => mk('div', { class: 'mn-d-row' + (h.prefer === row ? ' best' : '') },
      UI.icon('row', row, 26, {}, 'mn-d-rowico'),
      mk('div', {}, mk('b', { text: rowWord(row) + (h.prefer === row ? '  (best)' : '') }), mk('span', { text: (DATA.rowText(id, row) || '').replace(/^(Lead|Backing): /, '') })));
    add(box, mk('div', { class: 'mn-d-rows' }, rowChip('front'), rowChip('back')));
    const res = DATA.statuses[h.res];
    add(box, mk('div', { class: 'mn-d-line' }, UI.status(h.res, undefined, { size: 'md' }), mk('div', {}, mk('b', { text: (res ? res.name : cap(h.res)) + ' (resource)' }), mk('span', { text: res ? res.text : '' }))));
    (h.passives || []).forEach((p) => add(box, mk('div', { class: 'mn-d-line' }, UI.hanko('P', { size: 'sm', label: 'Passive' }), mk('div', {}, mk('b', { text: p.name + ' (passive)' }), mk('span', { text: safe(() => DATA.hookText(p), '') })))));
    const outfit = outfitRow(id, () => { clear(medal).appendChild(UI.medallion(id, 64)); });
    if (outfit) { add(box, outfit); box.rbSync = outfit.rbSync; }
    const deck = mk('div', { class: 'mn-d-deck' });
    starterCounts(id).forEach((c) => {
      const card = UI.card(previewInst(c.id), { size: 'deck', class: 'mn-cs', tip: false, showGems: true });
      withCardPreview(card, c.id);
      deck.appendChild(mk('div', { class: 'mn-dc' }, card, c.n > 1 ? mk('b', { class: 'mn-dc-n', text: 'x' + c.n }) : null));
    });
    add(box, mk('div', { class: 'mn-d-sec' }, mk('h4', { text: 'Starting deck (' + ((h.starter || []).length) + ' cards)' }), mk('p', { class: 'mn-d-tapnote', text: 'Tap a card to read it.' }), deck));
    const lore = DATA.lore && DATA.lore['hero_' + id];
    if (lore) add(box, mk('div', { class: 'mn-d-sec mn-d-bio' }, mk('h4', { text: cap(poss(id)) + ' voice' }), mk('p', { text: lore.text })));
    return box;
  }

  const heroSelect = {
    music: 'hero_select',
    enter(params, root) {
      const off = listeners();
      const seedToday = dailySeed();
      const S = HS = {
        root, off, chosen: (mem.party || []).filter((id) => DATA.heroes[id]).slice(0, 2), trial: 0, daily: !!mem.daily && !!seedToday, seedText: mem.seedText || '', pinned: null, hover: null,
        lift: {}, expr: {}, exprUntil: {}, pose: {}, slotFrom: {}, cache: {}, bark: [null, null], barkN: 0, banterT: 2.2, banterN: 0, atmos: makeAtmos('hero', 3), t: 0,
        saved: null, cards: {}, seedToday, sil: {}, compact: isCompact(root),
      };
      root.classList.toggle('ts-big', bigText());
      const trialMax = safe(() => META.trialMax(), 0) || 0;
      S.trialMax = trialMax;
      S.trial = clamp(mem.trial | 0, 0, trialMax);
      if (S.daily) { S.saved = S.chosen.slice(); S.chosen = (safe(() => RUN.dailyHeroes(seedToday), S.chosen) || S.chosen).slice(0, 2); S.trial = 0; }
      S.chosen = S.chosen.filter((id) => S.daily || heroUnlocked(id));
      HEROES.forEach((id) => { S.lift[id] = 0; });

      // ---- header
      const back = btn('Back', { kind: 'ghost', size: 'sm', onclick: () => UI.back(), sfx: 'ui_back' });
      back.classList.add('mn-back');
      const stones = UI.stat('inkstone', safe(() => META.inkstones, 0) || 0, { size: 'lg' });        // the same size as the Tour Bus pill, so it does not jump when you navigate
      const top = mk('header', { class: 'mn-hs-top' }, back, banner('Pick your duo'), mk('div', { class: 'mn-stones', 'aria-label': 'Cheers' }, stones));

      // ---- hero cards
      const cardsWrap = mk('div', { class: 'mn-cards', role: 'group', 'aria-label': 'Heroes' });
      HEROES.forEach((id, i) => {
        const h = DATA.heroes[id];
        const locked = heroLocked(id);
        const b = mk('button', { type: 'button', class: 'mn-hcard h-' + id + (locked ? ' locked' : ''), dataset: { hero: id }, 'aria-pressed': 'false', style: { left: (HC.x0 + i * (HC.w + HC.gap)) + 'px', top: cardTop(S.compact) + 'px' } },
          mk('span', { class: 'mn-hc-window', 'aria-hidden': 'true' }),
          mk('span', { class: 'mn-hc-badge hanko', 'aria-hidden': 'true' }),
          heroUnlocked(id) ? null : mk('span', { class: 'mn-hc-lock', 'aria-hidden': 'true' }),     // the padlock is shown only while the card wears the class locked (menu.css)
          mk('span', { class: 'mn-hc-plate' }, mk('b', { class: 'mn-hc-name', text: h.name }), mk('i', { class: 'mn-hc-title', text: h.title }), UI.icon('row', h.prefer, 20, {}, 'mn-hc-row')));
        UI.vars(b, { '--hc': h.color, '--hc2': h.dark });
        b.addEventListener('click', () => onCard(id, b));
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' || !e.pointerType) setHover(id); });
        b.addEventListener('pointerleave', () => setHover(null));
        b.addEventListener('focusin', () => setHover(id));
        b.addEventListener('focusout', () => setHover(null));
        S.cards[id] = b;
        cardsWrap.appendChild(b);
      });

      // ---- party stage
      const stageEl = mk('section', { class: 'mn-party', 'aria-label': 'Your party' });
      const labels = {
        front: mk('div', { class: 'mn-slot front' }, mk('b', { class: 'mn-slot-name', text: 'LEAD' }), mk('i', { class: 'mn-slot-note' })),
        back: mk('div', { class: 'mn-slot back' }, mk('b', { class: 'mn-slot-name', text: 'BACKING' }), mk('i', { class: 'mn-slot-note' })),
      };
      const swapBtn = mk('button', { type: 'button', class: 'mn-swap', 'aria-label': 'Swap lead and backing', dataset: { sfx: 'swap' } }, mk('i', { class: 'mn-swap-ico', 'aria-hidden': 'true' }), mk('span', { class: 'mn-swap-txt', text: 'Swap' }), mk('kbd', { class: 'btn-key', text: 'S', 'aria-hidden': 'true' }));
      swapBtn.addEventListener('click', () => swapOrder());
      const empty = mk('p', { class: 'mn-party-empty', text: 'Pick two heroes to see them on stage together.' });
      const barkEls = [mk('div', { class: 'mn-bark', 'aria-hidden': 'true' }), mk('div', { class: 'mn-bark', 'aria-hidden': 'true' })];      // banter is decoration: hidden from screen readers
      add(stageEl, empty, labels.back, labels.front, swapBtn, barkEls);
      S.labels = labels; S.swapBtn = swapBtn; S.empty = empty; S.barkEls = barkEls;
      ['front', 'back'].forEach((row) => { labels[row].style.left = (SLOT[row].x - STAGE_BOX.x) + 'px'; });       // under the sprite: the frame has no border, so its inner x is the stage x minus the box origin

      // ---- detail sheet
      const detail = UI.panel({ kind: 'paper', torn: true, class: 'mn-detail-panel' }, mk('div', { class: 'mn-detail-body' }));
      detail.classList.add('mn-detail');
      S.detailBody = detail.body.firstChild;

      // ---- launch panel: trial, seed, daily, begin
      const trialName = mk('b', { class: 'mn-tr-name' });
      const trialText = mk('span', { class: 'mn-tr-text' });
      const trialRule = mk('span', { class: 'mn-tr-rule' });                     // the newest rule in words: on a phone it replaces the rules list, which has no room
      const minus = mk('button', { type: 'button', class: 'mn-step', 'aria-label': 'Lower the Encore', dataset: { act: 'trial-down' }, text: '‹' });
      const plus = mk('button', { type: 'button', class: 'mn-step', 'aria-label': 'Raise the Encore', dataset: { act: 'trial-up' }, text: '›' });
      minus.addEventListener('click', () => setTrial(S.trial - 1, true));
      plus.addEventListener('click', () => setTrial(S.trial + 1, true));
      const pips = mk('div', { class: 'mn-pips', 'aria-hidden': 'true' }, U.range(11).map((n) => mk('i', { class: 'mn-pip', dataset: { n } })));
      const rules = mk('ul', { class: 'mn-rules mn-scroll', 'aria-label': 'Encore rules' });
      const trialBox = mk('div', { class: 'mn-trial' }, mk('div', { class: 'mn-tr-head' }, mk('span', { class: 'mn-tr-label', text: 'Encore' }), minus, mk('div', { class: 'mn-tr-mid', 'aria-live': 'polite' }, trialName, trialRule, trialText), plus), pips);
      const dailyToggle = UI.toggle({ label: 'Daily Duet', value: S.daily, onchange: (v) => setDaily(v) });
      dailyToggle.dataset.act = 'daily-toggle';
      const seed = mk('input', { type: 'text', class: 'mn-seed', 'aria-label': 'Seed (any word or number)', placeholder: 'Random seed', title: 'Any word or number. The same seed gives the same map.', maxlength: '24', autocomplete: 'off', spellcheck: 'false', value: S.seedText });
      seed.addEventListener('input', () => { S.seedText = seed.value; mem.seedText = seed.value; });
      const dice = mk('button', { type: 'button', class: 'mn-dice', 'aria-label': 'Roll a random seed', title: 'Roll a seed' }, mk('i', { class: 'mn-dice-ico' }));
      dice.addEventListener('click', () => { if (S.daily) return; S.diceN = (S.diceN | 0) + 1; const v = U.rng(U.hash('menu-dice', Math.floor(nowS() * 1000), S.diceN))().toString().slice(2, 8); seed.value = v; S.seedText = v; mem.seedText = v; UI.pulse(seed); });
      const begin = btn(BEGIN_TALE, { kind: 'primary', size: 'lg', disabled: true, reason: 'Pick two heroes first', onclick: () => doBegin() });
      begin.classList.add('mn-begin');
      begin.dataset.act = 'begin';
      const launch = UI.panel({ kind: 'dark', class: 'mn-launch-panel' }, trialBox, rules,
        mk('label', { class: 'mn-daily' }, dailyToggle, mk('span', { class: 'mn-daily-txt' }, mk('b', { text: 'Daily Duet' }), mk('i', { text: 'the same duet for everyone today' }))),
        mk('div', { class: 'mn-seedrow' }, mk('span', { class: 'mn-seed-label', text: 'Seed' }), seed, dice), begin);
      launch.classList.add('mn-launch');
      Object.assign(S, { minus, plus, trialName, trialText, trialRule, pips, rules, dailyToggle, seed, dice, begin, launch, trialBox });

      add(root, mk('div', { class: 'mn-hs' }, top, cardsWrap, stageEl, detail, launch));
      S.stageEl = stageEl;
      // the card row follows the stage class: a phone drops it under the --hit square of Back; the detail sheet's top (menu.css) reads --hc-y
      S.layoutRow = () => {
        const c = isCompact(S.root);
        if (S.rowSet && c === S.compact) return;
        S.rowSet = true; S.compact = c;
        HEROES.forEach((id) => { S.cards[id].style.top = cardTop(c) + 'px'; });
        UI.vars(S.root, { '--hc-y': cardTop(c) + 'px' });
      };
      S.layoutRow();

      // ---- behaviour
      function setHover(id) { S.hover = id; showDetail(id || S.pinned); }
      function react(id, expr, sec) { S.expr[id] = expr; S.exprUntil[id] = S.t + sec; }
      function onCard(id, el) {
        S.pinned = id;
        if (S.daily) { showDetail(id); UI.toast('The Daily Duet chooses your heroes', 'info'); return; }
        if (!heroUnlocked(id)) { showDetail(id); UI.shake(el); sfx('ui_error'); react(id, 'hurt', 1.1); return; }
        toggleHero(id);
        showDetail(id);
      }
      function toggleHero(id) {
        const i = S.chosen.indexOf(id);
        if (i >= 0) { S.chosen.splice(i, 1); react(id, 'neutral', 0.1); }
        else {
          if (S.chosen.length >= 2) { const dropped = S.chosen.shift(); react(dropped, 'hurt', 0.9); }
          S.chosen.push(id);
          S.pose[id] = { name: 'cheer', t0: S.t };
          S.slotFrom[id] = null;
          safe(() => META.markLore('hero_' + id));
          UI.after(0, () => bark(id, 'start'));
        }
        mem.party = S.chosen.slice();
        S.slotFrom = {};
        refresh();
      }
      function swapOrder() {
        if (S.daily) { UI.toast('The Daily Duet sets the order too', 'info'); return; }
        if (S.chosen.length < 2) { UI.toast('Pick two heroes first', 'warn'); sfx('ui_error'); return; }
        S.chosen.reverse();
        S.chosen.forEach((id, i) => { S.slotFrom[id] = { from: i === 0 ? 'back' : 'front', t0: S.t }; });
        mem.party = S.chosen.slice();
        bark(S.chosen[0], 'swap');
        refresh();
      }
      function setTrial(n, fromUser) {
        if (S.daily) return;
        const v = clamp(n, 0, S.trialMax);
        if (fromUser && v === S.trial) { UI.shake(S.trialBox); sfx('ui_error'); return; }
        S.trial = v; mem.trial = v;
        refresh();
      }
      function setDaily(on) {
        if (on === S.daily) return;
        if (on && !S.seedToday) { S.dailyToggle.rbSet(false); UI.toast("Today's Daily Duet is not available right now", 'warn'); return; }
        S.daily = on; mem.daily = on;
        if (on) { S.saved = S.chosen.slice(); S.chosen = (safe(() => RUN.dailyHeroes(S.seedToday), S.chosen) || S.chosen).slice(0, 2); S.chosen.forEach((id) => { S.pose[id] = { name: 'cheer', t0: S.t }; }); S.trial = 0; }
        else { S.chosen = (S.saved || []).filter(heroUnlocked).slice(0, 2); S.trial = clamp(mem.trial | 0, 0, S.trialMax); }
        S.slotFrom = {};
        mem.party = S.saved && on ? S.saved.slice() : S.chosen.slice();
        S.cache = {};
        refresh();
        showDetail(S.hover || S.pinned || S.chosen[0]);
      }
      // a hero select left open across midnight: the Daily plaque, seed and heroes follow the date, and a start that crossed the line shows the new duet first (L26)
      function refreshDay() {
        const nowSeed = dailySeed();
        if (nowSeed === S.seedToday) return false;
        S.seedToday = nowSeed;
        if (S.daily && nowSeed) {
          S.chosen = (safe(() => RUN.dailyHeroes(nowSeed), S.chosen) || S.chosen).slice(0, 2);
          S.chosen.forEach((id) => { S.pose[id] = { name: 'cheer', t0: S.t }; });
          S.slotFrom = {};
        }
        refresh();
        if (S.daily) UI.toast('A new Daily Duet has begun', 'info');
        return true;
      }
      S.refreshDay = refreshDay;
      function doBegin() {
        if (S.daily) { if (!refreshDay()) beginRun({ daily: true }); return; }
        if (S.chosen.length !== 2) { UI.shake(S.begin); return; }
        const opts = { heroes: S.chosen.slice(), trial: S.trial };
        const sd = parseSeed(S.seedText);
        if (sd !== undefined) opts.seed = sd;
        beginRun(opts);
      }
      function bark(id, key) {
        const slot = S.chosen.indexOf(id);
        if (slot < 0) return;
        const lore = DATA.lore && DATA.lore['barks_' + id];
        const lines = lore && lore.lines && lore.lines[key];
        if (!lines || !lines.length) return;
        const text = lines[Math.floor(U.rng(U.hash('menu-bark', id, key, S.barkN++))() * lines.length)];
        S.bark = [null, null]; S.barkEls.forEach((e) => { e.dataset.txt = ''; e.classList.remove('show'); });
        S.bark[slot] = { text, id, until: S.t + 3.8 };
        S.barkDirty = true;
      }
      S.bark_ = bark;
      function showDetail(id) {
        const want = id || S.pinned || S.chosen[S.chosen.length - 1] || HEROES.find(heroUnlocked) || HEROES[0];
        if (S.shown === want && S.detailBody.firstChild) return;
        S.shown = want;
        if (!S.cache[want]) S.cache[want] = buildDetail(want);
        else if (S.cache[want].rbSync) S.cache[want].rbSync();        // the outfit swatches read the store and the Stickers again
        clear(S.detailBody).appendChild(S.cache[want]);
        S.cache[want].classList.remove('swap'); void S.cache[want].offsetWidth; S.cache[want].classList.add('swap');
        S.detailBody.scrollTop = 0;
        HEROES.forEach((h) => S.cards[h].classList.toggle('pinned', h === want));
      }
      function refresh() {
        const n = S.chosen.length;
        HEROES.forEach((id) => {
          const b = S.cards[id], i = S.chosen.indexOf(id);
          b.classList.toggle('on', i >= 0);
          b.classList.toggle('fixed', S.daily);
          b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
          const badge = b.querySelector('.mn-hc-badge');
          badge.textContent = i === 0 ? 'LEAD' : i === 1 ? 'BACKING' : '';
          badge.classList.toggle('show', i >= 0);
          const h = DATA.heroes[id], locked = heroLocked(id);
          b.classList.toggle('locked', locked);
          b.setAttribute('aria-label', h.name + ', ' + h.title + (locked ? '. Locked.' : i === 0 ? '. Chosen, lead hero.' : i === 1 ? '. Chosen, backing hero.' : '. Tap to choose.'));
        });
        ['front', 'back'].forEach((row, k) => {
          const id = S.chosen[k === 0 ? 0 : 1];
          const el = S.labels[row];
          el.classList.toggle('empty', !id);
          const note = el.querySelector('.mn-slot-note');
          if (!id) { note.textContent = 'empty'; return; }
          const h = DATA.heroes[id];
          const fits = h.prefer === row;
          el.classList.toggle('fits', fits);
          note.textContent = h.name + (fits ? ': in ' + poss(id) + ' element' : ': prefers ' + rowProse(h.prefer));
        });
        S.empty.hidden = n === 2;
        S.swapBtn.classList.toggle('dim', n < 2 || S.daily);
        // trial
        const maxT = S.trialMax;
        const tr = DATA.trials['trial_' + S.trial];
        S.trialName.textContent = S.trial === 0 ? 'No encore' : 'Encore ' + roman(S.trial) + ': ' + (tr ? tr.name : '');
        S.trialRule.textContent = tr && S.trial > 0 && !S.daily ? tr.text : '';
        S.trialBox.classList.toggle('has-rule', !!S.trialRule.textContent);
        S.trialText.textContent = S.daily ? 'The Daily Duet never has an encore.' : maxT === 0 ? 'Win a tour to unlock Encores.' : S.trial === 0 ? 'The tour, just as it comes.' : 'Every encore below is added on top.';
        S.minus.classList.toggle('dim', S.daily || S.trial <= 0);
        S.plus.classList.toggle('dim', S.daily || S.trial >= maxT);
        S.minus.setAttribute('aria-disabled', S.daily || S.trial <= 0 ? 'true' : 'false');
        S.plus.setAttribute('aria-disabled', S.daily || S.trial >= maxT ? 'true' : 'false');
        S.trialBox.classList.toggle('locked', maxT === 0 || S.daily);
        S.pips.querySelectorAll('.mn-pip').forEach((p) => { const k = Number(p.dataset.n); p.classList.toggle('on', k > 0 && k <= S.trial); p.classList.toggle('open', k <= maxT); });
        clear(S.rules);
        if (S.trial === 0) S.rules.appendChild(mk('li', { class: 'mn-rule none', text: maxT === 0 ? 'No encores yet. Beat the Gloss once to earn the first.' : 'No extra rules. Higher encores stack their rules here.' }));
        for (let k = 1; k <= S.trial; k++) { const d = DATA.trials['trial_' + k]; if (d) S.rules.appendChild(mk('li', { class: 'mn-rule' + (k === S.trial ? ' new' : '') }, mk('b', { text: roman(k) + '. ' + d.name }), mk('span', { text: ' ' + d.text }))); }
        S.rules.scrollTop = S.trial > 0 ? S.rules.scrollHeight : 0;      // the newest rule is the one at the bottom; the lone "no trials" line starts at its top
        // seed and daily
        S.dailyToggle.rbSet(S.daily);
        S.seed.disabled = S.daily;
        S.seed.value = S.daily ? String(S.seedToday) : S.seedText;
        S.dice.classList.toggle('dim', S.daily);
        // begin
        const ready = S.daily || n === 2;
        S.begin.rbSet({ disabled: !ready, reason: 'Pick two heroes first' });
        S.begin.classList.toggle('breathe', ready);
        S.begin.rbSet({ label: S.daily ? BEGIN_DAILY : BEGIN_TALE });
        S.root.classList.toggle('is-daily', S.daily);
      }
      S.refresh = refresh; S.showDetail = showDetail; S.toggleHero = toggleHero; S.swapOrder = swapOrder; S.setTrial = setTrial; S.setDaily = setDaily; S.doBegin = doBegin;
      refresh();
      showDetail(S.chosen[S.chosen.length - 1] || HEROES.find(heroUnlocked) || HEROES[0]);
      if (S.chosen.length === 2) { S.banterT = 1.6; }
      const firstFocus = S.cards[HEROES.find(heroUnlocked) || HEROES[0]];
      UI.after(0, () => safe(() => firstFocus.focus()));
      UI.canvasOn('pointermove', () => {});
    },
    leave() { if (HS) { HS.off.clear(); UI.tip.hide(); HS = null; } },
    update(dt, t) {
      const S = HS;
      if (!S) return;
      S.t = t;
      if (t - (S.dayT || 0) >= 1 || t < (S.dayT || 0)) { S.dayT = t; if (S.refreshDay) S.refreshDay(); }
      S.atmos.update(dt, t);
      const rm = reduce();
      S.layoutRow();
      HEROES.forEach((id) => {
        const on = S.chosen.indexOf(id) >= 0, hov = S.hover === id;
        const target = rm || S.compact ? 0 : on ? 12 : hov || S.pinned === id ? 5 : 0;      // no lift on a phone: the row sits right under the Back square
        S.lift[id] += (target - S.lift[id]) * Math.min(1, dt * 12);
        if (Math.abs(target - S.lift[id]) < 0.05) S.lift[id] = target;
        S.cards[id].style.transform = S.lift[id] ? 'translateY(' + (-S.lift[id]).toFixed(2) + 'px)' : '';
      });
      // banter: the two heroes take turns to say a line while both are chosen
      if (S.chosen.length === 2) {
        S.banterT -= dt;
        if (S.banterT <= 0) {
          S.banterT = 4.8;
          const who = S.chosen[S.banterN % 2], key = BANTER[Math.floor(S.banterN / 2) % BANTER.length];
          S.banterN++;
          if (S.bark_) S.bark_(who, key);
        }
      }
      // bubbles
      S.bark.forEach((b, i) => {
        const el = S.barkEls[i];
        const live = b && S.chosen.indexOf(b.id) === i && t < b.until;
        if (!live) { if (el.classList.contains('show')) el.classList.remove('show'); return; }
        if (el.dataset.txt !== b.text) {
          el.dataset.txt = b.text; el.textContent = b.text;
          const slot = i === 0 ? SLOT.front : SLOT.back;
          const hb = safe(() => ART.hero.bounds(b.id), null) || { head: { x: 0, y: -200 } };
          const hx = slot.x + hb.head.x * slot.s - STAGE_BOX.x, hy = slot.y + hb.head.y * slot.s - STAGE_BOX.y;
          el.style.left = clamp(hx - 36, 6, STAGE_BOX.w - 226) + 'px';
          el.style.top = ''; el.style.bottom = Math.round(STAGE_BOX.h - (hy - 54 * slot.s)) + 'px';
          el.classList.remove('show'); void el.offsetWidth;
          if (el.offsetTop < 4 && el.offsetHeight > 0) { el.style.bottom = ''; el.style.top = '6px'; }        // a tall bubble (large text) that would leave the box
          // the Swap pill sits in the top right corner of the same box: a bubble that would sit on it slides left until it ends before the pill (L13)
          const sw = S.swapBtn;
          if (sw && el.offsetWidth > 0 && el.offsetTop < sw.offsetTop + sw.offsetHeight && el.offsetTop + el.offsetHeight > sw.offsetTop && el.offsetLeft + el.offsetWidth > sw.offsetLeft - 6) {
            el.style.left = Math.max(6, sw.offsetLeft - 6 - el.offsetWidth) + 'px';
          }
        }
        el.classList.add('show');
      });
      if (S.bark[0] && t >= S.bark[0].until) { S.barkEls[0].dataset.txt = ''; }
      if (S.bark[1] && t >= S.bark[1].until) { S.barkEls[1].dataset.txt = ''; }
    },
    draw(ctx, t) {
      const S = HS;
      if (!S) return;
      const focus = S.hover || S.pinned || S.chosen[S.chosen.length - 1];
      const col = focus && DATA.heroes[focus] ? DATA.heroes[focus].color : '#7a6bff';
      drawBackdrop(ctx, t, 'hero', S.atmos, { tint: col, tx: 400, ty: 230, tr: 520 });
      const tk = T();
      // portraits
      HEROES.forEach((id, i) => {
        const x = HC.x0 + i * (HC.w + HC.gap), y = cardTop(S.compact) - S.lift[id];
        const locked = heroLocked(id);
        const on = S.chosen.indexOf(id) >= 0, hov = S.hover === id;
        let expr = 'neutral';
        if (S.exprUntil[id] > t) expr = S.expr[id] || 'neutral';
        else if (on) expr = 'determined';
        else if (hov || S.pinned === id) expr = 'smile';
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 3, y + 3, HC.w - 6, HC.artH - 6); ctx.clip();
        art(() => ART.hero.portrait(ctx, id, { x: x + 3, y: y + 3, w: HC.w - 6, h: HC.artH - 6, expr, t }), 'portrait');
        if (locked) {
          ctx.fillStyle = 'rgba(10,8,25,0.86)'; ctx.fillRect(x, y, HC.w, HC.artH);
          if (tk) tk.glow(ctx, x + HC.w / 2, y + HC.artH * 0.42, 70, DATA.heroes[id].color, 0.18);
        } else if (!on && !hov && S.pinned !== id) { ctx.fillStyle = 'rgba(13,11,30,0.16)'; ctx.fillRect(x, y, HC.w, HC.artH); }
        ctx.restore();
      });
      // the party stage
      const B = STAGE_BOX;
      ctx.save();
      const pg = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
      pg.addColorStop(0, 'rgba(13,11,30,0.30)'); pg.addColorStop(1, 'rgba(13,11,30,0.68)');
      ctx.fillStyle = pg; ctx.fillRect(B.x, B.y, B.w, B.h);
      ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip();
      const g2 = S.chosen.length ? DATA.heroes[S.chosen[S.chosen.length - 1]].color : HV.violet;
      if (tk) tk.glow(ctx, PARTY_CX, 560, 260, g2, 0.14);
      // a little round stage under the pair (the title's stage in small): boards, a cream lip with bulbs, and a soft spotlight cone in the
      // colour of the last pick falling on it from the top of the frame
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(PARTY_CX - 22, B.y); ctx.lineTo(PARTY_CX + 22, B.y); ctx.lineTo(PARTY_CX + 170, 656); ctx.lineTo(PARTY_CX - 170, 656); ctx.closePath();
      const cone = ctx.createLinearGradient(0, B.y, 0, 656); cone.addColorStop(0, rgba(g2, 0.2)); cone.addColorStop(1, rgba(g2, 0.04));
      ctx.fillStyle = cone; ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(PARTY_CX, 668, 180, 26, 0, 0, Math.PI); ctx.lineTo(PARTY_CX - 180, 656); ctx.ellipse(PARTY_CX, 656, 180, 26, 0, Math.PI, 0, true); ctx.closePath();
      ctx.fillStyle = '#4a2266'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = HV.line; ctx.stroke();         // a deep plum lip, so the slot notes laid over it stay readable
      for (let k = 0; k < 11; k++) { const a = Math.PI * (k + 0.5) / 11; const on = reduce() ? 1 : 0.6 + 0.4 * Math.sin(t * 2.4 + k * 1.3); ctx.beginPath(); ctx.arc(PARTY_CX - Math.cos(a) * 168, 663 + Math.sin(a) * 23, 2.6, 0, TAU); ctx.fillStyle = rgba('#ffe9a8', on); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(PARTY_CX, 656, 180, 26, 0, 0, TAU);
      const top = ctx.createLinearGradient(0, 630, 0, 682); top.addColorStop(0, '#6a3584'); top.addColorStop(1, '#3f1f63');
      ctx.fillStyle = top; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = HV.line; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(PARTY_CX, 656, 176, 24, 0, 0.08 * Math.PI, 0.92 * Math.PI); ctx.strokeStyle = 'rgba(255,248,236,0.55)'; ctx.lineWidth = 2; ctx.stroke();   // the cream lip edge
      ctx.beginPath(); ctx.ellipse(PARTY_CX, 654, 128, 14, 0, 0, TAU); ctx.fillStyle = rgba(g2, 0.14); ctx.fill();
      ctx.restore();
      // ghost rings for the empty slots: a dashed cream ring where a hero will stand
      ['front', 'back'].forEach((row, k) => {
        if (S.chosen[k]) return;
        const sl = SLOT[row];
        ctx.save(); ctx.translate(sl.x, sl.y - 6); ctx.scale(1, 0.2);
        ctx.strokeStyle = 'rgba(255,248,236,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.lineDashOffset = -t * 8;
        ctx.beginPath(); ctx.arc(0, 0, 62 * sl.s, 0, TAU); ctx.stroke(); ctx.restore();
        spark(ctx, sl.x + 30 * sl.s, sl.y - 40 - 6 * Math.sin(t * 1.4 + k), 6, HV.cream, reduce() ? 0.6 : 0.35 + 0.35 * Math.sin(t * 2 + k * 2), 0);
      });
      // heroes: back one first so the front hero overlaps it
      const order = S.chosen.map((id, i) => ({ id, row: i === 0 ? 'front' : 'back' })).sort((a, b) => (a.row === 'back' ? -1 : 1) - (b.row === 'back' ? -1 : 1));
      order.forEach((o) => {
        const to = SLOT[o.row];
        let x = to.x, y = to.y, s = to.s;
        const sf = S.slotFrom[o.id];
        if (sf) {
          const p = clamp((t - sf.t0) / 0.38, 0, 1);
          if (p >= 1) S.slotFrom[o.id] = null;
          else { const fr = SLOT[sf.from], e = U.ease.inOutQuad(p); x = fr.x + (to.x - fr.x) * e; y = fr.y + (to.y - fr.y) * e - Math.sin(Math.PI * p) * 64; s = fr.s + (to.s - fr.s) * e; }
        }
        const ps = S.pose[o.id];
        let pose = 'idle', pt = 0;
        if (ps && t - ps.t0 < 0.8) { pose = ps.name; pt = t - ps.t0; }
        art(() => ART.hero.draw(ctx, o.id, { x, y, s, pose, t, pt, glow: S.bark.some((b) => b && b.id === o.id && t < b.until) ? 0.35 : 0 }), 'hero');
      });
      ctx.restore();
    },
    onKey(e) {
      const S = HS;
      if (!S || e.ctrlKey || e.metaKey || e.altKey) return false;
      const k = String(e.key).toLowerCase();
      if (k >= '1' && k <= '4') { const id = HEROES[Number(k) - 1]; if (id) { S.pinned = id; S.cards[id].click(); S.cards[id].focus(); } return true; }
      if (k === 's') { S.swapOrder(); return true; }
      if (e.key === 'Escape') { UI.back(); return true; }
      if (e.key === 'Enter' && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('mn-seed')) return false;
      return false;
    },
    state() { const S = HS; return S ? { chosen: S.chosen.slice(), trial: S.trial, daily: S.daily, focus: S.shown, seed: parseSeed(S.seedText), seedText: S.seedText, trialMax: S.trialMax, seedToday: S.seedToday } : null; },
  };

  // ================================================================================================================
  // THE TOUR BUS (`library`)
  // ================================================================================================================
  const LIB_TABS = [
    { id: 'unlocks', label: 'Unlocks', icon: 'key' },
    { id: 'achievements', label: 'Stickers', icon: 'star' },
    { id: 'story', label: 'Diary', icon: 'bell' },
    { id: 'bestiary', label: "Who's Who", icon: 'mask' },
    { id: 'history', label: 'Past Tours', icon: 'lantern' },
    { id: 'follow', label: 'Follow the duo', icon: 'bloom' },      // the sixth tab, key 6 (HV_STORY 5.3): the duo's links, Share and the about text; it builds only when opened
  ];
  const TIER_NAME = { minion: 'Sidekick', normal: 'Creature', elite: 'Rival', boss: 'Headliner' };
  const KIND_NAME = { card: 'Card', relic: 'Charm', gem: 'Gem' };
  const RARITY_NAME = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', boss: 'Headliner', shop: 'Merch' };
  // the Who's Who chips for the enemy tag ids (HV_ENEMIES 8); the ids stay in DATA.LISTS.enemyTags
  const TAG_LABEL = { spirit: 'Sprite', beast: 'Critter', folk: 'Showbiz', undead: 'Faded', construct: 'Gadget', insect: 'Bug', avian: 'Bird', aquatic: 'Seaside', void: 'Glossy' };
  const stoneIcon = (size) => UI.icon('stat', 'inkstone', size || 22, {}, 'mn-stone-ico');
  const hpText = (def) => (def && Array.isArray(def.hp) ? (def.hp[0] === def.hp[1] ? String(def.hp[0]) : def.hp[0] + ' to ' + def.hp[1]) : '');

  // a small burst of gold sparks and a ring of light over an element (the unlock moment); nothing when motion is reduced
  function sparkBurst(host, seed, n) {
    if (reduce()) return;
    const r = U.rng(U.hash('menu-spark', seed));
    const burst = mk('i', { class: 'mn-burst', 'aria-hidden': 'true' });
    host.appendChild(burst);
    const bits = [];
    for (let i = 0; i < (n || 12); i++) {
      const a = r() * TAU, d = 50 + r() * 70;
      const s = mk('i', { class: 'mn-spk', 'aria-hidden': 'true' });
      UI.vars(s, { '--dx': Math.round(Math.cos(a) * d) + 'px', '--dy': Math.round(Math.sin(a) * d - 20) + 'px', left: '50%', top: '46%' });
      s.style.animationDelay = Math.round(r() * 120) + 'ms';
      host.appendChild(s); bits.push(s);
    }
    UI.after(1300, () => { safe(() => burst.remove()); bits.forEach((b) => safe(() => b.remove())); });
  }

  let LB = null;

  // ---- Unlocks
  function buildUnlocks(S) {
    const pane = mk('div', { class: 'mn-pane mn-unlocks' });
    const filterBar = mk('div', { class: 'mn-filters' });
    const kindSeg = UI.seg([{ value: 'all', label: 'All' }, { value: 'card', label: 'Cards' }, { value: 'relic', label: 'Charms' }, { value: 'gem', label: 'Gems' }], { label: 'Show', value: mem.libKind, onchange: (v) => { mem.libKind = v; apply(); } });
    const chips = mk('div', { class: 'mn-chips', role: 'group', 'aria-label': 'Filter by hero' });
    const chipFor = (id) => {
      const b = mk('button', { type: 'button', class: 'mn-chip' + (mem.libHero === id ? ' on' : ''), 'aria-pressed': mem.libHero === id ? 'true' : 'false', dataset: { hero: id }, 'aria-label': id === 'any' ? 'Every hero' : heroName(id) },
        id === 'any' ? mk('span', { text: 'Any hero' }) : UI.medallion(id, 30));
      b.addEventListener('click', () => { mem.libHero = mem.libHero === id && id !== 'any' ? 'any' : id; chips.querySelectorAll('.mn-chip').forEach((c) => { const on = c.dataset.hero === mem.libHero; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); }); apply(); });
      return b;
    };
    ['any'].concat(HEROES).forEach((id) => chips.appendChild(chipFor(id)));
    const sortBtn = mk('button', { type: 'button', class: 'mn-chip mn-affordfirst', 'aria-pressed': 'false' }, mk('span', { text: 'Affordable first' }));
    sortBtn.addEventListener('click', () => { S.affordFirst = !S.affordFirst; sortBtn.classList.toggle('on', S.affordFirst); sortBtn.setAttribute('aria-pressed', S.affordFirst ? 'true' : 'false'); order(); });
    const count = mk('span', { class: 'mn-count', role: 'status' });
    add(filterBar, kindSeg, chips, sortBtn, count);
    const empty = mk('div', { class: 'mn-empty', hidden: true }, mk('p', { text: 'Nothing on the bus matches those filters.' }), btn('Show everything', { kind: 'secondary', size: 'sm', onclick: () => { mem.libKind = 'all'; mem.libHero = 'any'; kindSeg.rbSet('all'); chips.querySelectorAll('.mn-chip').forEach((c) => { const on = c.dataset.hero === 'any'; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); }); apply(); } }));
    const bare = mk('div', { class: 'mn-empty', hidden: true }, mk('p', { text: 'The shelves are bare. Nothing is waiting to be unlocked yet.' }));
    const secs = {};
    ['card', 'relic', 'gem'].forEach((k) => {
      const head = mk('h3', { class: 'mn-sec-h' }, mk('span', { text: k === 'card' ? 'Cards' : k === 'relic' ? 'Charms' : 'Gems' }), mk('em', { class: 'mn-sec-n' }));
      const grid = mk('div', { class: 'mn-grid ' + (k === 'card' ? 'cards' : 'tiles') });
      secs[k] = { el: mk('section', { class: 'mn-sec', dataset: { kind: k } }, head, UI.divider(), grid), grid, n: head.querySelector('.mn-sec-n') };
    });
    add(pane, filterBar, secs.card.el, secs.relic.el, secs.gem.el, empty, bare);

    const entries = safe(() => META.libraryList(), []) || [];
    const items = new Map();
    entries.forEach((e) => {
      const key = e.kind + ':' + e.id;
      const foot = mk('div', { class: 'mn-item-foot' }, mk('span', { class: 'mn-price' }, stoneIcon(22), mk('b', { class: 'mn-price-n' })));
      const unlock = btn('Unlock', { kind: 'primary', size: 'sm', onclick: () => buy(e, key) });
      unlock.classList.add('mn-unlock');
      foot.appendChild(unlock);
      const stamp = mk('span', { class: 'mn-stamp hanko', 'aria-hidden': 'true', text: 'UNLOCKED' });
      let art;
      if (e.kind === 'card') {
        const card = UI.card(previewInst(e.id), { size: 'deck', tip: false, showGems: true, class: 'mn-lc' });
        withCardPreview(card, e.id);
        art = mk('div', { class: 'mn-item-art' }, card);
      } else if (e.kind === 'relic') {
        const d = DATA.relics[e.id] || {};
        art = mk('div', { class: 'mn-tile-body' }, mk('div', { class: 'mn-tile-ico' }, UI.relic(e.id, { size: 'lg', tip: false })),
          mk('div', { class: 'mn-tile-txt' }, mk('b', { text: d.name || e.id }), mk('em', { text: (RARITY_NAME[d.rarity] || cap(d.rarity || '')) + ' charm' + (d.hero ? ' for ' + heroName(d.hero) : '') }), mk('p', { text: safe(() => DATA.relicText(e.id), d.text) || '' }),
          d.flavor ? mk('p', { class: 'mn-tile-flavor', text: d.flavor }) : null));
      } else {
        const d = DATA.gems[e.id] || {};
        art = mk('div', { class: 'mn-tile-body' }, mk('div', { class: 'mn-tile-ico' }, UI.gem(e.id, { size: 'lg', tip: false })),
          mk('div', { class: 'mn-tile-txt' }, mk('b', { text: d.name || e.id }), mk('em', { text: 'Tier ' + (d.tier || 1) + ' ' + colourWord(d.color || '') + ' gem' }), mk('p', { text: safe(() => DATA.gemText(e.id), '') || '' })));
      }
      const el = mk('article', { class: 'mn-item k-' + e.kind, dataset: { kind: e.kind, id: e.id, hero: e.hero || '' } }, mk('i', { class: 'mn-padlock', 'aria-hidden': 'true' }), art, foot, stamp);
      secs[e.kind].grid.appendChild(el);
      items.set(key, { e, el, unlock, foot, price: foot.querySelector('.mn-price-n') });
    });
    S.items = items; S.stones = S.stones || null;

    function paint(it, e) {
      it.e = e;
      it.price.textContent = String(e.cost);
      it.el.classList.toggle('owned', !!e.unlocked);
      it.el.classList.toggle('afford', !e.unlocked && e.affordable);
      it.el.classList.toggle('poor', !e.unlocked && !e.affordable);
      it.unlock.hidden = !!e.unlocked;
      const need = e.cost - (safe(() => META.inkstones, 0) || 0);
      it.unlock.rbSet({ disabled: !e.unlocked && !e.affordable, reason: 'You need ' + need + ' more Cheers' });
      it.unlock.classList.toggle('breathe', !e.unlocked && e.affordable && false);
      it.el.setAttribute('aria-label', (e.name || e.id) + '. ' + (e.unlocked ? 'Unlocked.' : e.affordable ? 'Costs ' + e.cost + ' Cheers. You can afford it.' : 'Costs ' + e.cost + ' Cheers.'));
    }
    function refreshAll() {
      const list = safe(() => META.libraryList(), []) || [];
      list.forEach((e) => { const it = items.get(e.kind + ':' + e.id); if (it) paint(it, e); });
      order();
      apply();
    }
    function order() {
      ['card', 'relic', 'gem'].forEach((k) => {
        const list = Array.from(items.values()).filter((it) => it.e.kind === k);
        const orig = entries.filter((x) => x.kind === k).map((x) => x.id);
        list.sort((a, b) => {
          if (S.affordFirst) {
            const ra = a.e.unlocked ? 2 : a.e.affordable ? 0 : 1, rb = b.e.unlocked ? 2 : b.e.affordable ? 0 : 1;
            if (ra !== rb) return ra - rb;
            if (a.e.cost !== b.e.cost) return a.e.cost - b.e.cost;
          }
          return orig.indexOf(a.e.id) - orig.indexOf(b.e.id);
        });
        list.forEach((it) => secs[k].grid.appendChild(it.el));
      });
    }
    function apply() {
      let shown = 0, total = 0, owned = 0;
      ['card', 'relic', 'gem'].forEach((k) => {
        let n = 0, own = 0, all = 0;
        items.forEach((it) => {
          if (it.e.kind !== k) return;
          all++; if (it.e.unlocked) own++;
          const ok = (mem.libKind === 'all' || mem.libKind === k) && (mem.libHero === 'any' || it.e.hero === mem.libHero);
          it.el.hidden = !ok;
          if (ok) n++;
        });
        secs[k].el.hidden = n === 0;
        secs[k].n.textContent = own + ' of ' + all + ' unlocked';
        shown += n; total += all; owned += own;
      });
      empty.hidden = shown > 0 || total === 0;
      bare.hidden = total > 0;
      count.textContent = owned + ' of ' + total + ' unlocked';
    }
    function buy(e, key) {
      const it = items.get(key);
      if (!it) return;
      const before = safe(() => META.inkstones, 0) || 0;
      const r = safe(() => META.buy(e.kind, e.id), { ok: false, reason: 'unknown' });
      if (!r.ok) {
        sfx('ui_error'); UI.shake(it.el);
        UI.toast(r.reason === 'funds' ? 'You need ' + (e.cost - before) + ' more Cheers' : r.reason === 'owned' ? 'You already own that' : 'That cannot be unlocked', 'warn');
        return;
      }
      sfx(e.kind === 'card' ? 'card_pick' : e.kind === 'relic' ? 'relic_get' : 'gem_get');
      it.el.classList.add('just');
      sparkBurst(it.el, key, 14);
      UI.after(1400, () => it.el.classList.remove('just'));
      if (S.stones) S.stones.rbSet(safe(() => META.inkstones, 0), { animate: true });
      refreshAll();
      UI.announce((e.name || e.id) + ' unlocked');
    }
    S.refreshUnlocks = refreshAll;
    refreshAll();
    return { el: pane, refresh: refreshAll };
  }

  // ---- Achievements
  function buildAchievements(S) {
    const pane = mk('div', { class: 'mn-pane mn-achs' });
    const list = safe(() => META.achievements(), []) || [];
    const rows = new Map();
    const done = list.filter((a) => a.done);
    const earned = done.reduce((n, a) => n + ((a.reward && a.reward.inkstones) || 0), 0);
    const sum = mk('span', { class: 'mn-count', role: 'status', text: done.length + ' of ' + list.length + ' done, ' + fmt(earned) + ' Cheers earned' });
    const sortSeg = UI.seg([{ value: 'order', label: 'In order' }, { value: 'close', label: 'Closest' }, { value: 'done', label: 'Done first' }], { label: 'Sort', value: mem.achSort, onchange: (v) => { mem.achSort = v; order(); } });
    const grid = mk('div', { class: 'mn-grid achs' });
    add(pane, mk('div', { class: 'mn-filters' }, mk('span', { class: 'mn-filter-label', text: 'Sort' }), sortSeg, sum), grid);
    list.forEach((a) => {
      const pct = Math.round(a.progress * 100);
      const bar = UI.bar(0, a.gte, 'xp', { text: false });
      const num = mk('span', { class: 'mn-ach-num', text: a.done ? 'Done' + (a.ts ? ' ' + dateText(a.ts) : '') : fmt(Math.min(a.value, a.gte)) + ' / ' + fmt(a.gte) });
      const seal = mk('span', { class: 'mn-ach-seal' }, a.done ? UI.hanko('', { size: 'lg', class: 'mn-ck', label: 'Done' }) : mk('i', { class: 'mn-ach-star', 'aria-hidden': 'true' }));
      const rew = a.reward && a.reward.inkstones ? mk('div', { class: 'mn-ach-rew', 'aria-label': 'Reward ' + a.reward.inkstones + ' Cheers' }, stoneIcon(22), mk('b', { text: '+' + a.reward.inkstones })) : mk('div', { class: 'mn-ach-rew none' });
      const el = mk('article', { class: 'mn-ach' + (a.done ? ' done' : ''), dataset: { id: a.id }, 'aria-label': a.name + '. ' + a.text + ' ' + (a.done ? 'Done.' : pct + ' percent.') },
        seal, mk('div', { class: 'mn-ach-body' }, mk('b', { class: 'mn-ach-name', text: a.name }), mk('p', { class: 'mn-ach-text', text: a.text }), mk('div', { class: 'mn-ach-prog' }, bar, num)), rew);
      rows.set(a.id, { a, el, bar });
      grid.appendChild(el);
    });
    if (!list.length) grid.appendChild(mk('p', { class: 'empty', text: 'No stickers yet.' }));
    function order() {
      const arr = list.slice();
      const idx = (a) => list.indexOf(a);
      if (mem.achSort === 'close') arr.sort((x, y) => (x.done - y.done) || (y.progress - x.progress) || (idx(x) - idx(y)));
      else if (mem.achSort === 'done') arr.sort((x, y) => (y.done - x.done) || ((y.ts || 0) - (x.ts || 0)) || (y.progress - x.progress) || (idx(x) - idx(y)));
      arr.forEach((a) => grid.appendChild(rows.get(a.id).el));
    }
    order();
    return {
      el: pane,
      onShow() { rows.forEach((r) => { r.bar.rbSet(0, r.a.gte); UI.after(30, () => r.bar.rbSet(Math.min(r.a.value, r.a.gte), r.a.gte)); }); },
    };
  }

  // ---- Story
  const STORY_GROUPS = [
    { name: 'The Acts', test: (id) => /^(intro|ch\d_intro)$/.test(id) },
    { name: 'The Endings', test: (id) => /(_clear|^victory|^defeat)$|^victory$|^defeat$/.test(id) },
    { name: 'The Crew', test: (id) => /^hero_/.test(id) },
  ];
  function buildStory() {
    const pane = mk('div', { class: 'mn-pane mn-story' });
    const list = safe(() => META.storyList(), []) || [];
    const seen = list.filter((s) => s.seen).length;
    const page = mk('div', { class: 'mn-storypage' }, mk('h3', { class: 'mn-st-head', text: 'Tour Diary' }), mk('p', { class: 'mn-st-sub', text: seen + ' of ' + list.length + ' entries read. Entries you have not reached yet stay sealed.' }));
    let no = 0;
    const used = new Set();
    const section = (name, ids) => {
      if (!ids.length) return;
      page.appendChild(mk('h4', { class: 'mn-st-group', text: name }));
      ids.forEach((s) => {
        used.add(s.id); no++;
        const row = mk('button', { type: 'button', class: 'mn-st' + (s.seen ? ' seen' : ''), dataset: { id: s.id }, 'aria-label': s.seen ? 'Entry ' + no + ': ' + s.title + '. Read again.' : 'Entry ' + no + ': not reached yet.' },
          mk('span', { class: 'mn-st-no', text: String(no) }), mk('span', { class: 'mn-st-title', text: s.seen ? s.title : '???' }), mk('i', { class: 'mn-st-dots', 'aria-hidden': 'true' }), mk('span', { class: 'mn-st-state', text: s.seen ? 'Read again' : 'Sealed' }));
        row.addEventListener('click', () => {
          if (!s.seen) { UI.shake(row); sfx('ui_error'); UI.toast('You have not reached this entry yet. Keep touring to find it.', 'info'); return; }
          UI.go('story', { id: s.id, then: { name: 'library', params: { tab: 'story' } } }, { transition: 'page' });
        });
        page.appendChild(row);
      });
    };
    STORY_GROUPS.forEach((g) => section(g.name, list.filter((s) => !used.has(s.id) && g.test(s.id))));
    section('Loose Entries', list.filter((s) => !used.has(s.id)));
    if (!list.length) page.appendChild(mk('p', { class: 'empty', text: 'No entries yet.' }));
    pane.appendChild(page);
    return { el: pane };
  }

  // ---- Who's Who (`bestiary`)
  // a generic creature shadow for art that is still a placeholder, so an unseen entry never shows a black box
  function genericSil(g, id, w, h) {
    const def = DATA.enemies[id] || DATA.rosterById[id] || {};
    const k = { s: 0.5, m: 0.68, l: 0.84, xl: 0.94 }[def.size || 'm'] || 0.68;
    const bh = (h - 18) * k, bw = bh * 0.72, cx = w / 2, fy = h - 8;
    g.fillStyle = 'rgba(45,23,15,0.72)';                        // a soft warm shadow on the photo, never a black box
    g.beginPath(); g.ellipse(cx, fy - bh * 0.34, bw / 2, bh * 0.34, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx, fy - bh * 0.8, bh * 0.19, 0, TAU); g.fill();
    if (def.tier === 'elite' || def.tier === 'boss') { g.beginPath(); g.moveTo(cx - bh * 0.17, fy - bh * 0.9); g.lineTo(cx - bh * 0.3, fy - bh * 1.08); g.lineTo(cx - bh * 0.05, fy - bh * 0.97); g.moveTo(cx + bh * 0.17, fy - bh * 0.9); g.lineTo(cx + bh * 0.3, fy - bh * 1.08); g.lineTo(cx + bh * 0.05, fy - bh * 0.97); g.fill(); }
  }
  const enemyHasArt = (id) => !!safe(() => ART.has('enemy', id), false);
  // The Who's Who is a wall of instant photos (HV_ART_AUDIO 3.4): each creature on a little stage in its Act's light, in a cream frame with a wide
  // bottom edge, a slight tilt and a strip of tape. A creature not met yet is a photo the Gloss got to first: a soft opalescent blur with one polite
  // smile and a sparkle, never a black box.
  const ACT_PHOTO = { 1: ['#ffcf8a', '#ff9fc6', '#2bb3b1'], 2: ['#141a3a', '#3d2a7a', '#3ff0ff'], 3: ['#f4f1fb', '#e6d9ff', '#d9fff4'] };
  const actOf = (id) => { const d = DATA.enemies[id] || DATA.rosterById[id] || {}; return clamp(d.chapter | 0 || 1, 1, 3); };
  function photoBack(g, w, h, ch) {
    const c = ACT_PHOTO[ch] || ACT_PHOTO[1];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sp = g.createRadialGradient(w / 2, h * 0.15, 4, w / 2, h * 0.45, Math.max(w, h) * 0.7);
    sp.addColorStop(0, 'rgba(255,248,236,0.45)'); sp.addColorStop(1, 'rgba(255,248,236,0)');
    g.fillStyle = sp; g.fillRect(0, 0, w, h);
    g.beginPath(); g.ellipse(w / 2, h * 0.93, w * 0.62, h * 0.16, 0, 0, TAU); g.fillStyle = rgba(c[2], ch === 3 ? 0.45 : 0.35); g.fill();
  }
  // the Gloss over an unmet creature: its shape smeared soft and pastel, the opal film, a sweep of light, one polite smile and a sparkle
  function glossBlur(g, id, w, h, fit) {
    const tmp = typeof ART !== 'undefined' && ART.sprite ? art(() => ART.sprite('menu|gshape|' + id + '|' + w + 'x' + h, w, h, (q) => {
      if (enemyHasArt(id)) {
        const b = safe(() => ART.enemy.bounds(id), null) || { w: 120, h: 170 };
        const s = Math.min((w - fit.padX) / Math.max(1, b.w), (h - fit.padY) / Math.max(1, b.h), fit.max || 9);
        art(() => ART.enemy.draw(q, id, { x: w / 2, y: h - fit.foot, s, pose: 'idle', t: 0.5 }), 'enemy');
      } else genericSil(q, id, w, h);
      q.globalCompositeOperation = 'source-in'; q.fillStyle = '#c9b8ef'; q.fillRect(0, 0, w, h); q.globalCompositeOperation = 'source-over';
    }), 'gshape') : null;
    if (tmp) {
      const k = Math.max(2, w * 0.035);
      [[0, 0, 0.5], [-k, 0, 0.22], [k, 0, 0.22], [0, -k, 0.22], [0, k, 0.22], [-k * 2, k, 0.1], [k * 2, -k, 0.1]].forEach((o) => safe(() => { g.save(); g.globalAlpha = o[2]; g.drawImage(tmp, o[0], o[1], w, h); g.restore(); }));
    }
    const film = g.createLinearGradient(0, 0, w, h);
    GLOSS.forEach((c, i) => film.addColorStop(i / 3, rgba(c, 0.55)));
    g.fillStyle = film; g.fillRect(0, 0, w, h);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(w * 0.1, h); g.lineTo(w * 0.45, 0); g.lineTo(w * 0.6, 0); g.lineTo(w * 0.25, h); g.closePath(); g.fill(); g.restore();
    const cx = w / 2, cy = h * 0.52, r = Math.max(3, w * 0.07);
    g.save(); g.strokeStyle = 'rgba(122,104,170,0.75)'; g.lineWidth = Math.max(1.2, w * 0.018); g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy - r * 0.6, r, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke(); g.restore();
    spark(g, cx + r * 2.2, cy - r * 2.4, r * 0.9, '#ffffff', 0.95, 0);
  }
  function paintBeast(g, id, w, h, seenIt, t, fit) {
    photoBack(g, w, h, actOf(id));
    if (!seenIt) { glossBlur(g, id, w, h, fit); return; }
    if (!enemyHasArt(id)) { genericSil(g, id, w, h); return; }
    const b = safe(() => ART.enemy.bounds(id), null) || { w: 120, h: 170 };
    const s = Math.min((w - fit.padX) / Math.max(1, b.w), (h - fit.padY) / Math.max(1, b.h), fit.max || 9);
    art(() => ART.enemy.draw(g, id, { x: w / 2, y: h - fit.foot, s, pose: 'idle', t }), 'enemy');
  }
  // an instant photo filling a w x h tile: a seeded tilt, the cream frame with its wide bottom, the picture, a strip of tape
  function photoFrame(g, id, w, h, paint) {
    const tilt = (U.rng(U.hash('photo', id))() - 0.5) * 0.09;
    const fw = w - 10, fh = h - 8, px = 5, pt = 5, pb = 15;
    g.save();
    g.translate(w / 2, h / 2); g.rotate(tilt); g.translate(-fw / 2, -fh / 2);
    g.fillStyle = 'rgba(7,5,26,0.45)'; rrect(g, 2, 3, fw, fh, 3); g.fill();
    g.fillStyle = HV.cream; rrect(g, 0, 0, fw, fh, 3); g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(45,23,15,0.55)'; g.stroke();
    g.save(); g.beginPath(); g.rect(px, pt, fw - px * 2, fh - pt - pb); g.clip(); g.translate(px, pt);
    safe(() => paint(g, fw - px * 2, fh - pt - pb));
    g.restore();
    g.strokeStyle = 'rgba(45,23,15,0.35)'; g.lineWidth = 1; g.strokeRect(px, pt, fw - px * 2, fh - pt - pb);
    g.save(); g.translate(fw / 2, 1); g.rotate(-tilt * 2 - 0.04);
    g.fillStyle = 'rgba(255,248,236,0.72)'; g.fillRect(-15, -5, 30, 10);
    g.fillStyle = 'rgba(255,126,182,0.28)'; g.fillRect(-15, -5, 30, 3);
    g.restore();
    g.restore();
  }
  function beastThumb(id, seenIt, w, h) {
    return spriteCanvas('menu|photo|' + id + '|' + (seenIt ? 's' : 'u') + '|' + w + 'x' + h, w, h, (g) => photoFrame(g, id, w, h, (q, pw, ph) => paintBeast(q, id, pw, ph, seenIt, 0.5, { padX: 6, padY: 10, foot: 5 })), 'mn-thumb');
  }
  // the unmet creature of the detail view: a static Gloss photo drawn under the live frame
  function beastDetailSil(id) {
    if (typeof ART === 'undefined' || !ART.sprite) return null;
    return art(() => ART.sprite('menu|beastglossD|' + id, 340, 250, (g) => paintBeast(g, id, 340, 250, false, 0.5, { padX: 40, padY: 60, foot: 26, max: 1.3 })), 'sil');
  }

  function buildBestiary(S) {
    const pane = mk('div', { class: 'mn-pane mn-beasts' });
    const data = safe(() => META.bestiary(), []) || [];
    const byId = new Map(data.map((d) => [d.id, d]));
    const left = mk('div', { class: 'mn-beast-list mn-scroll' });
    const detail = mk('aside', { class: 'mn-bdetail', 'aria-live': 'polite' });
    add(pane, left, detail);
    const tiles = new Map();
    [1, 2, 3].forEach((ch) => {
      const inCh = data.filter((d) => d.chapter === ch);
      if (!inCh.length) return;
      const met = inCh.filter((d) => d.seen > 0).length;
      const lore = DATA.lore && DATA.lore['ch' + ch + '_intro'];
      left.appendChild(mk('h3', { class: 'mn-sec-h' }, mk('span', { text: 'Act ' + ch + (lore ? ': ' + lore.title : '') }), mk('em', { class: 'mn-sec-n', text: met + ' of ' + inCh.length + ' met' })));
      const grid = mk('div', { class: 'mn-grid beasts' });
      const order = { boss: 0, elite: 1, normal: 2, minion: 3 };
      inCh.slice().sort((a, b) => (order[a.tier] - order[b.tier])).forEach((d) => {
        const def = DATA.enemies[d.id] || DATA.rosterById[d.id] || {};
        const known = d.seen > 0;
        const tile = mk('button', { type: 'button', class: 'mn-beast tier-' + d.tier + (known ? ' seen' : ' unseen'), dataset: { id: d.id }, 'aria-label': known ? (def.name || d.id) + ', ' + TIER_NAME[d.tier] + '. Won over ' + d.kills + ' times.' : 'Unknown creature, not met yet.' },
          beastThumb(d.id, known, 92, 96), mk('span', { class: 'mn-b-name', text: known ? (def.name || d.id) : '???' }), known && d.kills > 0 ? mk('b', { class: 'mn-b-kills', text: String(d.kills) }) : null);
        tile.addEventListener('click', () => select(d.id));
        grid.appendChild(tile); tiles.set(d.id, tile);
      });
      left.appendChild(grid);
    });
    if (!data.length) left.appendChild(mk('p', { class: 'empty', text: "Nobody in the Who's Who yet. Meet a creature in a fight to add it here." }));

    // the live portrait canvas of the selected creature
    const cv = canvasEl(340, 250, 'mn-bd-canvas');
    let cur = null;
    function select(id) {
      mem.beast = id; cur = id;
      tiles.forEach((t, k) => t.classList.toggle('sel', k === id));
      const d = byId.get(id), def = DATA.enemies[id] || DATA.rosterById[id] || {};
      const known = d && d.seen > 0;
      clear(detail);
      cv.c.classList.toggle('unseen', !known);
      const head = mk('div', { class: 'mn-bd-head' }, mk('h3', { text: known ? (def.name || id) : '???' }), mk('p', { class: 'mn-bd-title', text: known ? (def.title || '') : 'Not yet met' }));
      const chips = mk('div', { class: 'mn-bd-chips' }, mk('span', { class: 'mn-tag-chip tier-' + (d ? d.tier : 'normal'), text: TIER_NAME[d ? d.tier : 'normal'] }), mk('span', { class: 'mn-tag-chip', text: 'Act ' + (d ? d.chapter : '?') }));
      if (known) (def.tags || []).forEach((tg) => chips.appendChild(mk('span', { class: 'mn-tag-chip soft', text: TAG_LABEL[tg] || cap(tg) })));
      add(detail, mk('div', { class: 'mn-bd-art' }, cv.c), head, chips);
      if (!known) { add(detail, mk('p', { class: 'mn-bd-unknown', text: 'A shape behind the Gloss. Meet this creature in a fight and its photo goes on the wall.' })); return; }
      add(detail, mk('div', { class: 'mn-bd-stats' }, mk('span', {}, mk('b', { text: hpText(def) }), mk('i', { text: 'HP with no encore' })), mk('span', {}, mk('b', { text: String(d.kills) }), mk('i', { text: 'defeated' })), mk('span', {}, mk('b', { text: String(d.seen) }), mk('i', { text: 'met' }))));
      add(detail, mk('p', { class: 'mn-bd-lore', text: def.lore || '' }));
      const moves = mk('ul', { class: 'mn-moves' });
      Object.keys(def.moves || {}).forEach((k) => {
        const m = def.moves[k];
        moves.appendChild(mk('li', { class: 'mn-move' }, UI.icon('intent', m.kind || 'none', 28, {}, 'mn-move-ico'), mk('div', {}, mk('b', { text: m.name || k }), mk('span', { text: safe(() => DATA.opsText(m.fx), '') || '' }))));
      });
      add(detail, mk('h4', { class: 'mn-d-sec-h', text: 'Moves' }), moves);
    }
    S.beastSelect = select;
    const first = (mem.beast && byId.has(mem.beast) ? mem.beast : (data.find((d) => d.seen > 0) || data[0] || {}).id);
    if (first) select(first);
    else add(detail, mk('p', { class: 'mn-bd-unknown', text: 'Nothing on the wall yet.' }));
    return {
      el: pane,
      update(dt, t) {
        if (!cur || !cv.g) return;
        const d = byId.get(cur);
        const g = cv.g;
        g.clearRect(0, 0, 340, 250);
        const tk = T();
        const b = safe(() => ART.enemy.bounds(cur), null) || { w: 140, h: 200 };
        const s = Math.min(300 / Math.max(1, b.w), 190 / Math.max(1, b.h), 1.3);
        if (d && !(d.seen > 0)) { const sil = beastDetailSil(cur); if (sil) safe(() => g.drawImage(sil, 0, 0, 340, 250)); }
        else {
          photoBack(g, 340, 250, d ? clamp(d.chapter | 0 || 1, 1, 3) : 1);
          art(() => ART.enemy.draw(g, cur, { x: 170, y: 224, s, pose: 'idle', t }), 'enemy');
        }
        if (tk) tk.vignette(g, 340, 250, { color: '#2d170f', alpha: 0.22, inner: 0.6 });
      },
    };
  }

  // ---- History
  function buildHistory() {
    const pane = mk('div', { class: 'mn-pane mn-hist-pane' });
    const hist = safe(() => META.history, []) || [];
    if (!hist.length) {
      add(pane, mk('div', { class: 'mn-hist-empty' }, mk('i', { class: 'mn-emptybook', 'aria-hidden': 'true' }), mk('h3', { text: 'No tours yet' }), mk('p', { text: 'Finish a tour, win or lose, and it will be remembered here: the heroes, the score, how far you got.' })));
      return { el: pane };
    }
    const best = hist.reduce((m, r) => Math.max(m, r.score || 0), 0);
    const wins = hist.filter((r) => r.outcome === 'win').length;
    add(pane, mk('div', { class: 'mn-hist-sum' },
      mk('span', {}, mk('b', { text: String(safe(() => META.stat('runs'), hist.length)) }), mk('i', { text: 'tours started' })),
      mk('span', {}, mk('b', { text: String(safe(() => META.stat('wins'), wins)) }), mk('i', { text: 'sung to the end' })),
      mk('span', {}, mk('b', { text: fmt(best) }), mk('i', { text: 'best score' })),
      mk('span', {}, mk('b', { text: String(hist.length) }), mk('i', { text: 'in the list' }))));
    const list = mk('div', { class: 'mn-hist-list' });
    hist.forEach((r, i) => {
      const outcome = r.outcome === 'win' ? 'Victory' : r.outcome === 'abandon' ? 'Abandoned' : 'Curtain fell';
      const chapter = 'Act ' + (r.chapter || 1);
      const row = mk('article', { class: 'mn-hist ' + (r.outcome || 'lose') + (r.daily ? ' daily' : ''), 'aria-label': outcome + ' with ' + heroList(r.heroes) + ', score ' + r.score + ', ' + chapter + (r.trial ? ', Encore ' + r.trial : '') + (r.daily ? ', Daily Duet' : '') },
        mk('span', { class: 'mn-h-date', text: dateText(r.ts) || 'Long ago' }),
        mk('span', { class: 'mn-h-heroes' }, (r.heroes || []).map((id) => UI.medallion(id, 38)), mk('i', { class: 'mn-h-names', text: heroList(r.heroes) })),
        mk('span', { class: 'mn-h-score' }, mk('b', { text: fmt(r.score || 0) }), mk('i', { text: 'score' })),
        mk('span', { class: 'mn-h-ch', text: chapter }),
        mk('span', { class: 'mn-h-tags' }, r.trial ? UI.hanko('E' + r.trial, { size: 'sm', label: 'Encore ' + r.trial }) : null, r.daily ? UI.hanko('D', { size: 'sm', label: 'Daily Duet' }) : null),
        mk('span', { class: 'mn-h-out' }, mk('b', { class: 'mn-out-' + (r.outcome || 'lose'), text: outcome }), r.inkstones ? mk('i', { text: '+' + r.inkstones + ' Cheers' }) : null));
      row.style.setProperty('--i', String(Math.min(i, 12)));
      list.appendChild(row);
    });
    pane.appendChild(list);
    return { el: pane };
  }

  // the sixth tab: UI.followPanel('tab') is the whole body (heading, the duo waving, the handle line, the link pills, Share, Support the duo when set, the
  // about text and Jordan's line, or the no-links line while every URL is empty). Nothing is fetched or stored: the pills are plain anchors that open in a new tab.
  function buildFollow() {
    const pane = mk('div', { class: 'mn-pane mn-follow' });
    const panel = isFn(UI.followPanel) ? safe(() => UI.followPanel('tab'), null) : null;
    pane.appendChild(mk('div', { class: 'mn-fl-main' }, panel || mk('p', { class: 'mn-fl-handle', text: HANDLE_LINE })));
    return { el: pane };
  }

  const library = {
    enter(params, root) {
      const want = params && params.tab;
      const tab = LIB_TABS.some((t) => t.id === want) ? want : (LIB_TABS.some((t) => t.id === mem.libTab) ? mem.libTab : 'unlocks');
      const S = LB = { root, off: listeners(), tab, panes: {}, atmos: makeAtmos('library', 5), t: 0, affordFirst: false, stones: null };
      const back = btn('Back', { kind: 'ghost', size: 'sm', onclick: () => UI.back(), sfx: 'ui_back' });
      back.classList.add('mn-back');
      S.stones = UI.stat('inkstone', safe(() => META.inkstones, 0) || 0, { size: 'lg' });
      const top = mk('header', { class: 'mn-lib-top' }, back, banner('The Tour Bus'), mk('div', { class: 'mn-stones', 'aria-label': 'Cheers' }, S.stones));
      const tabs = UI.tabs(LIB_TABS.map((t) => ({ id: t.id, label: t.label })), { value: tab, onchange: (id) => show(id, true) });
      tabs.classList.add('mn-tabs');
      tabs.querySelectorAll('.tab').forEach((b, i) => b.insertBefore(UI.icon('motif', LIB_TABS[i].icon, 22, {}, 'mn-tab-ico'), b.firstChild));
      const body = mk('div', { class: 'mn-lib-body' });
      add(root, mk('div', { class: 'mn-lib' }, top, tabs, body));
      S.tabs = tabs; S.body = body;
      const builders = { unlocks: buildUnlocks, achievements: buildAchievements, story: buildStory, bestiary: buildBestiary, history: buildHistory, follow: buildFollow };
      function show(id, sound) {
        if (!builders[id]) return;
        S.tab = id; mem.libTab = id;
        if (!S.panes[id]) { S.panes[id] = builders[id](S); S.panes[id].el.dataset.tab = id; S.panes[id].el.classList.add('mn-tabpane'); body.appendChild(S.panes[id].el); }
        LIB_TABS.forEach((t) => { const p = S.panes[t.id]; if (p) p.el.hidden = t.id !== id; });
        const p = S.panes[id];
        p.el.classList.remove('in');
        if (sound !== null) { void p.el.offsetWidth; p.el.classList.add('in'); }          // no fade on the first show: the page simply is there
        p.el.scrollTop = 0;
        if (p.onShow) p.onShow();
        tabs.rbSet(id);
        if (sound) sfx('page_turn');
        UI.announce(LIB_TABS.find((t) => t.id === id).label);
      }
      S.show = show;
      show(tab, null);
      const tabBtn = tabs.querySelector('.tab.on');
      UI.after(0, () => safe(() => tabBtn && tabBtn.focus()));
    },
    leave() { if (LB) { LB.off.clear(); UI.tip.hide(); LB = null; } },
    update(dt, t) {
      const S = LB;
      if (!S) return;
      S.t = t;
      S.atmos.update(dt, t);
      const p = S.panes[S.tab];
      if (p && p.update && !p.el.hidden) p.update(dt, t);
    },
    draw(ctx, t) {
      const S = LB;
      if (!S) return;
      drawBackdrop(ctx, t, 'library', S.atmos, { tint: '#7a6bff', tx: 640, ty: 360, tr: 640 });
    },
    onKey(e) {
      const S = LB;
      if (!S || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (/^[1-6]$/.test(e.key) && LIB_TABS[Number(e.key) - 1]) { S.show(LIB_TABS[Number(e.key) - 1].id, true); return true; }
      if (e.key === 'Escape') { UI.back(); return true; }
      return false;
    },
    state() { const S = LB; return S ? { tab: S.tab, filter: { kind: mem.libKind, hero: mem.libHero }, built: Object.keys(S.panes) } : null; },
  };

  // ================================================================================================================
  // SETTINGS: one form for the screen and the overlay
  // ================================================================================================================
  const getSet = (k) => safe(() => UI.getSetting(k), DATA.SETTINGS[k] && DATA.SETTINGS[k].def);
  const setSet = (k, v) => { UI.setSetting(k, v); };

  // Erase the profile behind two confirmations. Settings survive; the saved tour goes with the rest.
  function clearAllData(done) {
    UI.confirm({ title: 'Erase all progress?', body: "Unlocks, stickers, past tours, the Who's Who and your saved tour will be erased. Your settings stay.", yes: 'Continue', no: 'Keep everything', danger: true })
      .then((ok) => (ok ? UI.confirm({ title: 'Really clear out the whole van?', body: 'This cannot be undone. All your Cheers and every diary entry you have read will be gone.', yes: 'Erase everything', no: 'Cancel', danger: true }) : false))
      .then((ok2) => {
        if (!ok2) return;
        safe(() => META.reset({ keepSettings: true }));
        UI.applySettings();
        mem.party = []; mem.trial = 0; mem.libTab = 'unlocks'; mem.beast = null; mem.daily = false;
        UI.toast('Back to the very first soundcheck', 'info');
        sfx('page_turn');
        if (done) done();
      });
  }

  // mode: 'screen' (offers Clear data) or 'overlay' (a run may be active, so it does not)
  function settingsForm(mode) {
    const root = mk('div', { class: 'mn-set' + (mode === 'overlay' ? ' in-overlay' : '') });
    let lastPreview = 0;
    const row = (key, label, ctl, hint) => mk('div', { class: 'mn-set-row', dataset: { setting: key || '' } }, mk('div', { class: 'mn-set-label' }, mk('b', { text: label }), hint ? mk('span', { class: 'mn-set-hint', text: hint }) : null), mk('div', { class: 'mn-set-ctl' }, ctl));
    const group = (name, ...rows) => mk('section', { class: 'mn-set-group' }, mk('h3', { class: 'mn-set-h' }, mk('span', { text: name })), rows);

    const music = UI.slider({ label: 'Music volume', min: 0, max: 1, step: 0.05, value: getSet('musicVol'), onchange: (v) => setSet('musicVol', v) });
    if (mode === 'overlay') { const mi = music.querySelector('input'); if (mi) mi.setAttribute('data-autofocus', ''); }      // focus the top of the form, not Done (focusing the last control scrolls a short screen to the bottom)
    const sfxSl = UI.slider({ label: 'Effects volume', min: 0, max: 1, step: 0.05, value: getSet('sfxVol'), onchange: (v) => { setSet('sfxVol', v); const n = nowS(); if (n - lastPreview > 0.16) { lastPreview = n; safe(() => AUDIO.preview('ui_click')); } } });
    const sfxInput = sfxSl.querySelector('input');
    if (sfxInput) sfxInput.addEventListener('change', () => { safe(() => AUDIO.preview('card_pick')); });

    let shakeRowEl = null;
    const shakeSl = UI.slider({ label: 'Screen shake', min: 0, max: 1, step: 0.25, value: getSet('shake'), format: (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%'), onchange: (v) => { setSet('shake', v); if (shakeRowEl) UI.shake(shakeRowEl); } });
    const rmNote = mk('span', { class: 'mn-set-hint' });
    const paintRm = () => { rmNote.textContent = getSet('reduceMotion') === null ? 'Following your device: ' + (UI.opt.reduceMotion ? 'reduced motion is on' : 'full motion') : ''; };
    const rmSeg = UI.seg([{ value: null, label: 'Auto' }, { value: true, label: 'On' }, { value: false, label: 'Off' }], { label: 'Reduce motion', value: getSet('reduceMotion'), onchange: (v) => { setSet('reduceMotion', v); paintRm(); } });
    paintRm();
    const animSeg = UI.seg([{ value: 0, label: 'Normal' }, { value: 1, label: 'Fast' }, { value: 2, label: 'Faster' }], { label: 'Animation speed', value: getSet('fastAnim'), onchange: (v) => setSet('fastAnim', v) });
    const dmg = UI.toggle({ label: 'Damage numbers', value: getSet('damageNumbers'), onchange: (v) => setSet('damageNumbers', v) });

    const sample = mk('p', { class: 'mn-sample', text: 'A soft note, a late kick, and the whole street starts to sing along.' });
    const tsSeg = UI.seg([{ value: 1, label: 'Normal' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Larger' }], { label: 'Text size', value: getSet('textScale'), onchange: (v) => setSet('textScale', v) });
    const glyphs = mk('span', { class: 'mn-glyphs', 'aria-hidden': 'true' }, ['red', 'blue', 'green', 'gold', 'any'].map((c) => mk('span', { class: 'gem gc-' + (c === 'any' ? 'gold' : c) + ' sz-sm' }, UI.icon('gem', 'slot:' + c, 26))));
    const cb = UI.toggle({ label: 'Colour-blind aids', value: getSet('colorblind'), onchange: (v) => setSet('colorblind', v) });
    const qSeg = UI.seg([{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }], { label: 'Quality', value: getSet('quality'), onchange: (v) => setSet('quality', v) });
    const hints = UI.toggle({ label: 'Hints', value: getSet('hints'), onchange: (v) => setSet('hints', v) });

    const fsBtn = fsSupported() ? btn(fsActive() ? 'Leave full screen' : 'Full screen', { kind: 'secondary', size: 'sm', onclick: () => { toggleFullscreen(); UI.after(350, () => fsBtn.rbSet({ label: fsActive() ? 'Leave full screen' : 'Full screen' })); } }) : mk('span', { class: 'mn-set-hint', text: 'Not available here' });
    const defBtn = btn('Restore defaults', { kind: 'secondary', size: 'sm', onclick: () => { Object.keys(DATA.SETTINGS).forEach((k) => UI.setSetting(k, DATA.SETTINGS[k].def)); rebuild(); UI.toast('Settings restored', 'info'); } });
    const clearBtn = btn('Clear saved data', { kind: 'primary', size: 'sm', danger: true, onclick: () => clearAllData(() => rebuild()) });
    const dataRow = mode === 'overlay'
      ? row('', 'Saved data', mk('span', { class: 'mn-set-hint', text: 'Leave the tour from the title screen to clear it' }))
      : row('clear', 'Saved data', clearBtn, 'Erases unlocks, stickers, past tours and your saved tour. Asks twice.');

    shakeRowEl = row('shake', 'Screen shake', shakeSl, 'Try it: this line shakes as you drag');
    root.appendChild(mk('div', { class: 'mn-set-cols' },
      mk('div', { class: 'mn-set-col' },
        group('Sound', row('musicVol', 'Music', music), row('sfxVol', 'Effects', sfxSl)),
        group('Motion', row('reduceMotion', 'Reduce motion', rmSeg), mk('div', { class: 'mn-set-note' }, rmNote), shakeRowEl, row('fastAnim', 'Animation speed', animSeg), row('damageNumbers', 'Damage numbers', dmg)),
        group('Help', row('hints', 'Hints', hints, 'Short tips during your first tour'))),
      mk('div', { class: 'mn-set-col' },
        group('Display', row('textScale', 'Text size', tsSeg), mk('div', { class: 'mn-set-note' }, sample), row('colorblind', 'Colour-blind aids', cb, 'Patterns, and bigger glyphs on gems'), mk('div', { class: 'mn-set-note' }, glyphs), row('quality', 'Quality', qSeg, 'Auto lowers effects if the game slows down')),
        group('Screen and data', row('fullscreen', 'Full screen', fsBtn), row('defaults', 'Defaults', defBtn), dataRow))));
    // the last group, full width under the two columns (HV_STORY 5.3 and 6, HV_WORLD_DATA 11): the about text, the follow strip from ui.js (the link pills for
    // every URL that is set, Share, Support the duo when set, the handle line) and the version. It reads DATA.LINKS and fetches nothing.
    const strip = isFn(UI.followPanel) ? safe(() => UI.followPanel('strip', { supportLine: true }), null) : null;
    root.appendChild(mk('section', { class: 'mn-set-group mn-set-about' }, mk('h3', { class: 'mn-set-h' }, mk('span', { text: 'About' })),
      mk('p', { class: 'mn-set-abouttext', text: ABOUT_TEXT }),
      mk('div', { class: 'mn-set-follow' }, strip || mk('p', { class: 'mn-set-handle', text: HANDLE_LINE })),
      mk('p', { class: 'mn-set-ver', text: 'Version ' + VERSION })));
    function rebuild() { const parent = root.parentNode; if (!parent) return; const next = settingsForm(mode); parent.replaceChild(next, root); }
    return root;
  }

  let ST = null;
  const settingsScreen = {
    enter(params, root) {
      const S = ST = { root, off: listeners(), atmos: makeAtmos('settings', 7) };
      const back = btn('Back', { kind: 'ghost', size: 'sm', onclick: () => UI.back(), sfx: 'ui_back' });
      back.classList.add('mn-back');
      const form = settingsForm('screen');
      const panel = UI.panel({ kind: 'paper', torn: true, title: 'Settings', class: 'mn-set-panel' }, form);
      panel.classList.add('mn-set-wrap');
      add(root, mk('div', { class: 'mn-setscreen' }, mk('div', { class: 'mn-set-top' }, back), panel));
      S.form = form;
      // UI treats a focused slider as text entry and only blurs it on Escape; here Escape should still leave
      UI.onKey((e) => { if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target && e.target.localName === 'input') { UI.back(); return true; } return false; });
      UI.after(0, () => safe(() => back.focus()));
    },
    leave() { if (ST) { ST.off.clear(); ST = null; } },
    update(dt, t) { if (ST) ST.atmos.update(dt, t); },
    draw(ctx, t) { if (ST) drawBackdrop(ctx, t, 'paper', ST.atmos, { tint: '#5b3fa8', tx: 640, ty: 340, tr: 700 }); },
    onKey(e) { if (e.key === 'Escape') { UI.back(); return true; } return false; },
    state() { return ST ? { form: !!ST.form } : null; },
  };

  const settingsOverlay = {
    open(p, root, close) {
      const form = settingsForm('overlay');
      const done = btn('Done', { kind: 'primary', size: 'lg', sfx: QUIET, onclick: () => { sfx('ui_close'); close(); } });
            root.appendChild(UI.panel({ kind: 'paper', torn: true, title: 'Settings', class: 'modal settings mn-set-modal' }, form, mk('div', { class: 'row center mn-set-done' }, done)));
      UI.onKey((e) => { if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) { sfx('ui_close'); close(); return true; } return false; }, { overlay: true });
    },
  };

  // ================================================================================================================
  // HOW TO PLAY: eight illustrated pages, each with a small live diagram (canvas painters and DOM pieces built from real ART and DATA)
  // ================================================================================================================
  const HT_W = 520, HT_H = 380;
  const fontN = () => (T() ? T().font.num : 'sans-serif');
  const fontU = () => (T() ? T().font.ui : 'sans-serif');
  const partyOf = () => ((mem.party && mem.party.length === 2 ? mem.party : ['hanae', 'kuro']).filter((id) => DATA.heroes[id]));

  // sticker lettering on a diagram: rounded heavy letters with the warm outline
  function label(g, text, x, y, size, col, align, stroke) {
    g.save();
    g.font = '900 ' + size + 'px ' + ROUND; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = size * 0.3; g.strokeStyle = stroke || HV.line; g.strokeText(text, x, y);
    g.fillStyle = col || HV.cream; g.fillText(text, x, y);
    g.restore();
  }
  // the diagram grounds (HV_ART_AUDIO 3.4): 'night' is the indigo stage night with a soft spotlight and a few bokeh; 'paper' is the cream gig poster
  // (the `paper` scene: card stock with a faint pink and green print grain), so the diagrams read as posters pinned on the Tour Bus wall
  function illusBgSized(g, w, h, sky) {
    if (sky === 'paper') {
      const ok = typeof ART !== 'undefined' && ART.scene && typeof ART.scene.draw === 'function' && art(() => ART.scene.draw(g, 'paper', w, h, 0, { seed: 7, edge: false }) !== false, 'paper');
      if (!ok) { g.fillStyle = HV.paper; g.fillRect(0, 0, w, h); }
      return;
    }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d0a26'); gr.addColorStop(0.65, '#2b1f6e'); gr.addColorStop(1, '#3b2a7a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sp = g.createRadialGradient(w * 0.5, -h * 0.1, 10, w * 0.5, h * 0.4, h);
    sp.addColorStop(0, 'rgba(255,244,214,0.20)'); sp.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = sp; g.fillRect(0, 0, w, h);
    const r = U.rng(U.hash('illus', w, h));
    for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h * 0.6, rr = 6 + r() * 16; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fillStyle = rgba(i % 2 ? HV.pink : HV.green, 0.06 + r() * 0.05); g.fill(); }
  }
  function illusBg(g, sky) { illusBgSized(g, HT_W, HT_H, sky || 'night'); }
  function illusFg(g, a) { const tk = T(); if (tk) tk.vignette(g, HT_W, HT_H, { color: '#07051a', alpha: (a === undefined ? 0.5 : a) * 0.7, inner: 0.5 }); }
  // a mic on a stand, the house prop: a round foot, a chrome pole, a ball grille with a coloured band. (x, y) is the foot centre.
  function micStand(g, x, y, h, band) {
    g.save();
    g.beginPath(); g.ellipse(x, y, h * 0.16, h * 0.04, 0, 0, TAU); g.fillStyle = '#2b2a3a'; g.fill(); g.lineWidth = 2; g.strokeStyle = HV.line; g.stroke();
    g.fillStyle = '#c9cbd6'; g.fillRect(x - 2.5, y - h * 0.86, 5, h * 0.86); g.strokeRect(x - 2.5, y - h * 0.86, 5, h * 0.86);
    g.translate(x, y - h * 0.86); g.rotate(-0.35);
    g.fillStyle = '#1d1a2c'; rrect(g, -4, -h * 0.2, 8, h * 0.2, 3); g.fill(); g.stroke();
    g.fillStyle = band; g.fillRect(-4, -h * 0.2, 8, 4);
    g.beginPath(); g.arc(0, -h * 0.25, h * 0.085, 0, TAU); g.fillStyle = '#d7d9e4'; g.fill(); g.stroke();
    g.strokeStyle = 'rgba(45,23,15,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-h * 0.06, -h * 0.25); g.lineTo(h * 0.06, -h * 0.25); g.moveTo(0, -h * 0.31); g.lineTo(0, -h * 0.19); g.stroke();
    g.restore();
  }
  const easeIO = U.ease.inOutQuad;
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  // a canvas diagram: build() gives the element and an update that repaints it
  function paintedCanvas(paint) {
    const cv = canvasEl(HT_W, HT_H, 'mn-illus-cv');
    return { el: cv.c, update(dt, t) { if (!cv.g) return; cv.g.clearRect(0, 0, HT_W, HT_H); cv.g.save(); art(() => paint(cv.g, t), 'howto'); cv.g.restore(); } };
  }

  // ---- 1. the Soundlands on mute
  function paintBook(g, t) {
    illusBg(g, 'night');
    const tk = T();
    if (tk) { tk.stars(g, 0, 0, HT_W, 220, t, { n: 46, seed: 2 }); tk.glow(g, 430, 66, 70, HV.warm, 0.25); }
    g.beginPath(); g.arc(430, 66, 30, 0, TAU); g.fillStyle = '#fff2c4'; g.fill();
    // a grey, still landscape strip: two ridges and a pale ground band under the path
    const ridge = (base, amp, col, seed) => {
      const r = U.rng(seed);
      g.beginPath(); g.moveTo(0, HT_H);
      for (let x = 0; x <= HT_W; x += 20) g.lineTo(x, base + Math.sin(x * 0.02 + seed) * amp + (r() - 0.5) * amp * 0.5);
      g.lineTo(HT_W, HT_H); g.closePath(); g.fillStyle = col; g.fill();
    };
    ridge(222, 20, 'rgba(96,92,122,0.85)', 3); ridge(262, 16, 'rgba(60,56,88,0.95)', 7);
    g.fillStyle = 'rgba(38,34,62,0.95)'; g.fillRect(0, 310, HT_W, HT_H - 310);
    g.fillStyle = 'rgba(190,186,210,0.18)'; g.fillRect(0, 310, HT_W, 2);
    if (tk) { const br = reduce() ? 1 : 0.85 + 0.15 * Math.sin(t * 1.4); tk.glow(g, 90, 170, 120 * br, HV.green, 0.22 * br); }
    // the sound path from the heroes to the boss, with the shop, camp and elite stamps on it
    const pts = [[62, 160], [150, 118], [240, 162], [330, 112], [446, 148]];
    const p = (t * 0.16) % 1.25;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,248,236,0.18)'; g.lineWidth = 9; g.setLineDash([2, 12]); g.beginPath(); pts.forEach((q, i) => { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]);
    const total = pts.length - 1, upto = clamp(p, 0, 1) * total;
    const pg = g.createLinearGradient(pts[0][0], 0, pts[4][0], 0); pg.addColorStop(0, HV.pink); pg.addColorStop(1, HV.green);
    g.strokeStyle = HV.line; g.lineWidth = 9; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < total; i++) { const k = clamp(upto - i, 0, 1); if (k <= 0) break; g.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k); }
    g.stroke();
    g.strokeStyle = pg; g.lineWidth = 5; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    let head = pts[0];
    for (let i = 0; i < total; i++) { const k = clamp(upto - i, 0, 1); if (k <= 0) break; head = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; g.lineTo(head[0], head[1]); }
    g.stroke(); g.restore();
    if (tk && p < 1.05) { tk.sparkle(g, head[0], head[1], 10, { color: HV.cream, glow: 0.8, rot: t * 2 }); tk.note(g, head[0] + 12, head[1] - 16, 7, { color: HV.lime, alpha: 0.9 }); }
    ['shop', 'camp', 'elite'].forEach((id, i) => art(() => ART.icon.draw(g, 'tile', id, pts[i + 1][0], pts[i + 1][1], 40, {}), 'tile'));
    const pulse = 1 + 0.06 * Math.sin(t * 3);
    if (tk) tk.glow(g, pts[4][0], pts[4][1], 44 * pulse, HV.pink, 0.5);
    art(() => ART.icon.draw(g, 'tile', 'boss', pts[4][0], pts[4][1], 52 * pulse, {}), 'tile');
    partyOf().forEach((id, i) => art(() => ART.hero.medallion(g, id, pts[0][0] - 8 + i * 30, pts[0][1] + 2 - i * 4, 19), 'medal'));
    // the Gloss creeping in from the right: an opalescent pastel film with a highlight sweep, polite and perfectly still
    g.save();
    const hg = g.createLinearGradient(HT_W * 0.55, 0, HT_W, 0); hg.addColorStop(0, 'rgba(244,241,251,0)'); hg.addColorStop(0.5, rgba(GLOSS[1], 0.18)); hg.addColorStop(1, rgba(GLOSS[2], 0.34 + (reduce() ? 0 : 0.04 * Math.sin(t * 0.8))));
    g.fillStyle = hg; g.fillRect(HT_W * 0.55, 90, HT_W * 0.45, 250);
    const sw = ((t * 0.12) % 1.6) - 0.3;
    g.globalAlpha = 0.18; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(HT_W * (0.6 + sw * 0.4), 340); g.lineTo(HT_W * (0.7 + sw * 0.4), 90); g.lineTo(HT_W * (0.74 + sw * 0.4), 90); g.lineTo(HT_W * (0.64 + sw * 0.4), 340); g.closePath(); g.fill();
    g.restore();
    label(g, '3 acts, 3 headliners', 260, 352, 17, HV.pinkL);
    illusFg(g);
  }

  // ---- 2. paint the map
  function paintMapDiagram(g, t) {
    const tk = T();
    illusBg(g, 'paper');
    const size = 31, ox = 60, oy = 86, cols = 7, rows = 5;
    const pos = (c, r) => ({ x: ox + size * Math.sqrt(3) * (c + (r % 2) * 0.5), y: oy + size * 1.5 * r });
    const steps = [{ c: 2, r: 2, tile: 'empty' }, { c: 3, r: 2, tile: 'enemy' }, { c: 4, r: 1, tile: 'well' }, { c: 5, r: 1, tile: 'chest' }, { c: 6, r: 2, tile: 'boss' }];
    const T0 = t % 11, S0 = 1.0, DT = 1.35;
    const bloomAt = (k) => S0 + k * DT + 0.45;
    const done = steps.map((s, k) => T0 >= bloomAt(k) + 0.55);
    const started = steps.map((s, k) => T0 >= bloomAt(k));
    const stateOf = (c, r) => { const k = steps.findIndex((s) => s.c === c && s.r === r); if (c <= 1) return { kind: 'painted', tile: c === 0 && r === 2 ? 'start' : 'empty' }; if (k >= 0 && T0 >= bloomAt(k) + 0.28) return { kind: 'painted', tile: steps[k].tile }; if (c === 6 && r === 2) return { kind: 'known', tile: 'boss' }; return { kind: 'fog', tile: 'empty' }; };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = pos(c, r), st = stateOf(c, r); art(() => ART.map.hex(g, st.kind, p.x, p.y, size, { tile: st.tile, seed: U.hash(c, r), done: false, t }), 'hex'); }
    steps.forEach((s, k) => { if (T0 >= S0 + k * DT && T0 < bloomAt(k) + 0.6) { const p = pos(s.c, s.r); const b = prog(T0, bloomAt(k), bloomAt(k) + 0.6); if (b > 0) art(() => ART.map.paintBloom(g, p.x, p.y, size, b), 'bloom'); else art(() => ART.map.hex(g, 'target', p.x, p.y, size, { t }), 'hex'); } });
    // the Spell travelling to the next hex, then the party walking after it
    let cur = pos(0, 2);
    let from = pos(1, 2);
    steps.forEach((s, k) => {
      const t0 = S0 + k * DT - 0.05, t1 = t0 + 0.42, p1 = pos(s.c, s.r);
      if (T0 >= t0 && T0 <= bloomAt(k) + 0.05) { const e = easeIO(prog(T0, t0, t1)); cur = { x: from.x + (p1.x - from.x) * e, y: from.y + (p1.y - from.y) * e }; art(() => ART.icon.draw(g, 'stat', 'brush', cur.x + 8, cur.y - 10, 30, {}), 'brush'); }
      from = p1;
    });
    let tokenAt = pos(0, 2);
    let prev = pos(0, 2);
    steps.forEach((s, k) => { const w0 = bloomAt(k) + 0.6, p1 = pos(s.c, s.r); if (T0 >= w0) { const e = easeIO(prog(T0, w0, w0 + 0.4)); tokenAt = { x: prev.x + (p1.x - prev.x) * e, y: prev.y + (p1.y - prev.y) * e }; } prev = p1; });
    const moving = steps.some((s, k) => T0 >= bloomAt(k) + 0.6 && T0 < bloomAt(k) + 1.0);
    art(() => ART.map.token(g, partyOf(), tokenAt.x, tokenAt.y - 4, t, moving), 'token');
    // the Vox meter: -1 per hex, +4 from the tea stall
    const ink = clamp(10 - started.filter(Boolean).length + (done[2] ? 4 : 0), 0, 14);
    art(() => ART.icon.draw(g, 'stat', 'ink', 34, 30, 36, {}), 'ink');
    label(g, ink + ' / 14', 78, 30, 20, HV.cream, 'left');
    if (started[2] && T0 < bloomAt(2) + 1.2) label(g, '+4', 172, 30 - prog(T0, bloomAt(2), bloomAt(2) + 1.2) * 8, 20, HV.lime, 'left');
    steps.forEach((s, k) => { if (started[k] && k !== 2 && T0 < bloomAt(k) + 0.9) label(g, '-1', 172, 30 + prog(T0, bloomAt(k), bloomAt(k) + 0.9) * 8, 18, HV.pinkL, 'left'); });
    label(g, 'unmute, then walk', 260, 352, 17, HV.pink);
    illusFg(g, 0.12);
  }

  // ---- 3. two rows
  function paintRows(g, t) {
    illusBg(g, 'night');
    const tk = T();
    const party = partyOf();
    const FRONT = { x: 322, y: 292, s: 0.74 }, BACK = { x: 140, y: 284, s: 0.68 };
    if (tk) { tk.glow(g, 260, 300, 240, HV.violet, 0.2); }
    // a little round stage, and the two spots as two mic stands: the lead spot pink at the front, the backing spot green behind
    g.save();
    g.beginPath(); g.ellipse(250, 300, 236, 26, 0, 0, Math.PI); g.lineTo(14, 290); g.ellipse(250, 290, 236, 26, 0, Math.PI, 0, true); g.closePath();
    g.fillStyle = '#4a2266'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = HV.line; g.stroke();
    g.beginPath(); g.ellipse(250, 290, 236, 26, 0, 0, TAU); g.fillStyle = '#5b2c7a'; g.fill(); g.stroke();
    g.restore();
    [[FRONT, HV.pink], [BACK, HV.green]].forEach((m) => { g.beginPath(); g.ellipse(m[0].x, m[0].y, 58, 9, 0, 0, TAU); g.fillStyle = rgba(m[1], 0.32); g.fill(); micStand(g, m[0].x + 52, m[0].y + 2, 96, m[1]); });
    const lt = t + 1.4, n = Math.floor(lt / 7), local = lt % 7;
    const hop = n === 0 ? 1 : prog(local, 0, 0.7);
    const frontHero = party[n % 2 === 0 ? 0 : 1], backHero = party[n % 2 === 0 ? 1 : 0];
    const place = (id) => {
      const isFront = id === frontHero, to = isFront ? FRONT : BACK, fr = isFront ? BACK : FRONT;
      const e = easeIO(hop);
      return { x: fr.x + (to.x - fr.x) * e, y: fr.y + (to.y - fr.y) * e - Math.sin(Math.PI * hop) * 46, s: fr.s + (to.s - fr.s) * e, row: isFront ? 'front' : 'back' };
    };
    // the foe and its attack: it always goes for the front hero
    const at = (t % 3.6) / 3.6;
    art(() => ART.enemy.draw(g, 'kappa', { x: 452, y: 296, s: 0.85, pose: at > 0.5 && at < 0.62 ? 'attack' : 'idle', t, pt: (at - 0.5) * 3.6 }), 'enemy');
    const hit = prog(at, 0.52, 0.66), fade = 1 - prog(at, 0.78, 0.98);
    g.save(); g.globalAlpha = 0.28 + 0.72 * hit * fade; g.strokeStyle = '#ff5a5a'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(392, 210); g.lineTo(FRONT.x + 44, 214); g.stroke();
    g.fillStyle = '#ff5a5a'; g.beginPath(); g.moveTo(FRONT.x + 36, 214); g.lineTo(FRONT.x + 58, 204); g.lineTo(FRONT.x + 58, 224); g.closePath(); g.fill(); g.restore();
    g.save(); g.globalAlpha = 0.25; g.setLineDash([6, 8]); g.strokeStyle = '#a9c4ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(392, 188); g.quadraticCurveTo(250, 120, BACK.x + 46, 170); g.stroke(); g.restore();
    [backHero, frontHero].forEach((id) => { const p = place(id); art(() => ART.hero.draw(g, id, { x: p.x, y: p.y, s: p.s, pose: hit > 0.3 && hit < 1 && id === frontHero && fade > 0.9 ? 'hurt' : 'idle', t, pt: (at - 0.52) * 3.6 }), 'hero'); });
    if (hit > 0.1 && fade > 0.05) label(g, '7', FRONT.x + 6 + hit * 6, 150 - hit * 24, 30 + hit * 8, HV.gold);
    if (tk) tk.sparkle(g, BACK.x + 48, 176, 7 + 2 * Math.sin(t * 3), { color: HV.lime, glow: 0.7 });
    label(g, 'safe', BACK.x + 66, 158, 14, HV.lime);
    [{ id: frontHero, row: 'front', x: FRONT.x }, { id: backHero, row: 'back', x: BACK.x }].forEach((o) => {
      label(g, o.row === 'front' ? 'LEAD' : 'BACKING', o.x, 322, 15, o.row === 'front' ? HV.pinkL : HV.lime);
      g.font = '700 12px ' + fontU(); g.textAlign = 'center'; g.fillStyle = HV.cream;
      g.fillText((DATA.rowText(o.id, o.row) || '').replace(/^(Lead|Backing): /, ''), o.x, 344, 190);
      g.fillStyle = 'rgba(255,248,236,0.65)'; g.font = 'italic 600 11px ' + fontU();
      g.fillText(heroName(o.id) + (DATA.heroes[o.id].prefer === o.row ? ' likes it here' : ' prefers ' + rowProse(DATA.heroes[o.id].prefer)), o.x, 362, 190);
    });
    if (local < 1.6 && n > 0) label(g, 'swap!', 236, 96, 22, HV.gold);
    illusFg(g);
  }

  // ---- 4. energy and cards
  function cardNums(cid) {
    const d = DATA.cards[cid] || {};
    let dmg = 0, blk = 0;
    DATA.walkOps(d.fx || [], (o) => { if (o.op === 'dmg' && !dmg && typeof o.n === 'number') dmg = o.n; if (o.op === 'block' && !blk && typeof o.n === 'number') blk = o.n; });
    return { dmg, blk, cost: typeof d.cost === 'number' ? d.cost : 1, name: d.name || cid };
  }
  function drawMiniCard(g, cid, x, y, w, h, rot, alpha) {
    const def = DATA.cards[cid] || {}, hero = DATA.heroes[def.hero] || { color: '#8a86a8', dark: '#4a4766' };
    const nums = cardNums(cid);
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot || 0); g.globalAlpha *= alpha === undefined ? 1 : alpha; g.translate(-w / 2, -h / 2);
    // the card frame of the UI skin (HV_ART_AUDIO 9.2): a deep indigo body, a header band in the hero colour, a cream bevel round the art,
    // the warm outline, and the cost as a sky-blue Breath puff orb
    g.fillStyle = 'rgba(0,0,0,0.4)'; rrect(g, 4, 6, w, h, 7); g.fill();
    rrect(g, 0, 0, w, h, 7); g.fillStyle = '#231a4f'; g.fill();
    g.save(); rrect(g, 0, 0, w, h, 7); g.clip(); g.fillStyle = hero.color; g.fillRect(0, 0, w, h * 0.16); g.restore();
    rrect(g, 1.5, 1.5, w - 3, h - 3, 6); g.strokeStyle = HV.line; g.lineWidth = 3; g.stroke();
    g.fillStyle = HV.line; g.font = '900 ' + Math.round(h * 0.072) + 'px ' + ROUND; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(nums.name, w / 2 + 6, 2 + h * 0.08, w - 30);
    rrect(g, 4, h * 0.18, w - 8, h * 0.46, 4); g.fillStyle = HV.cream; g.fill();
    g.save(); g.translate(7, h * 0.18 + 3); g.beginPath(); g.rect(0, 0, w - 14, h * 0.46 - 6); g.clip(); art(() => ART.card.draw(g, cid, w - 14, h * 0.46 - 6, 0), 'cardart'); g.restore();
    g.strokeStyle = HV.line; g.lineWidth = 1.4; g.strokeRect(7, h * 0.18 + 3, w - 14, h * 0.46 - 6);
    g.fillStyle = HV.cream; g.font = '700 ' + Math.round(h * 0.068) + 'px ' + fontU(); g.textBaseline = 'alphabetic';
    const words = String(safe(() => DATA.cardPlain(cid), '') || '').split(' '); let line = '', ly = h * 0.72;
    words.forEach((wd) => { const tt = line ? line + ' ' + wd : wd; if (g.measureText(tt).width > w - 14 && line) { g.fillText(line, w / 2, ly); ly += h * 0.085; line = wd; } else line = tt; });
    if (line && ly < h - 4) g.fillText(line, w / 2, ly);
    g.beginPath(); g.arc(4, 4, w * 0.13, 0, TAU); g.fillStyle = '#7cc6ff'; g.fill(); g.strokeStyle = HV.cream; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(4, 4, w * 0.13 + 1.6, 0, TAU); g.strokeStyle = HV.line; g.lineWidth = 1.4; g.stroke();
    g.beginPath(); g.arc(1, 0, w * 0.04, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
    g.fillStyle = HV.line; g.font = '900 ' + Math.round(w * 0.17) + 'px ' + fontN(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(nums.cost), 4, 5);
    g.restore();
  }
  function paintCards(g, t) {
    illusBg(g, 'night');
    const tk = T();
    const T0 = t % 11;
    const ids = ['hanae_slash', 'hanae_parry', 'hanae_petal_step'].filter((id) => DATA.cards[id]);
    const A = cardNums(ids[0] || 'hanae_slash'), B = cardNums(ids[1] || 'hanae_parry');
    const dmg1 = A.dmg || 6, blk1 = B.blk || 5;
    const cw = 96, ch = 134, HX = [24, 130, 236], HY = 226;
    const spent = [T0 > 1.7, T0 > 3.5, T0 > 5.3];
    const played = spent.filter(Boolean).length;
    const refill = prog(T0, 9.0, 10.0);
    const energy = T0 < 9 ? 3 - played : Math.min(3, Math.floor(refill * 3 + 0.2));
    // hero panel
    art(() => ART.hero.medallion(g, partyOf()[0], 46, 56, 24), 'medal');
    const hp = 60 - (T0 > 8.0 ? 2 : 0) - (T0 > 8.0 ? 0 : 0);
    g.fillStyle = 'rgba(20,15,46,0.9)'; rrect(g, 78, 46, 120, 14, 7); g.fill(); g.fillStyle = '#ff5fa2'; rrect(g, 79, 47, 118 * (hp / 60), 12, 6); g.fill();
    label(g, 'HP ' + hp, 138, 53, 11, HV.cream);
    const block = T0 > 3.5 && T0 < 8.0 ? blk1 : T0 >= 8.0 && T0 < 8.4 ? Math.max(0, blk1 - prog(T0, 8.0, 8.4) * blk1) : 0;
    const hid = partyOf()[0];
    let hpose = 'idle', hpt = 0;
    [[1.4, 'attack'], [3.2, 'block'], [5.0, 'attack'], [8.0, 'hurt']].forEach((e) => { if (T0 >= e[0] && T0 < e[0] + 0.7) { hpose = e[1]; hpt = T0 - e[0]; } });
    art(() => ART.hero.draw(g, hid, { x: 92, y: 216, s: 0.46, pose: hpose, t, pt: hpt }), 'hero');
    if (block > 0.4) { art(() => ART.icon.draw(g, 'stat', 'block', 160, 150, 28, {}), 'block'); label(g, String(Math.round(block)), 182, 150, 18, HV.sky, 'left'); }
    // energy orbs
    for (let i = 0; i < 3; i++) { const lit = i < energy; g.save(); g.globalAlpha = lit ? 1 : 0.28; art(() => ART.icon.draw(g, 'stat', 'energy', 264 + i * 42, 52, 38, {}), 'energy'); g.restore(); }
    label(g, 'Breath', 306, 82, 13, HV.sky);
    // the foe: HP falls, its intent shows, it lunges on its turn
    const foeHp = Math.max(0, 24 - (T0 > 1.7 ? dmg1 : 0) - (T0 > 5.3 ? (cardNums(ids[2] || 'x').dmg || 4) : 0) + (T0 >= 9 ? 0 : 0));
    const lunge = T0 > 7.2 && T0 < 8.3 ? -Math.sin(Math.PI * prog(T0, 7.2, 8.3)) * 70 : 0;
    art(() => ART.enemy.draw(g, 'kappa', { x: 430 + lunge, y: 262, s: 0.82, pose: T0 > 7.3 && T0 < 8.0 ? 'attack' : 'idle', t, pt: T0 - 7.3 }), 'enemy');
    g.fillStyle = 'rgba(20,15,46,0.9)'; rrect(g, 376, 100, 110, 12, 6); g.fill(); g.fillStyle = '#ff9a2e'; rrect(g, 377, 101, 108 * Math.max(0, foeHp) / 24, 10, 5); g.fill();
    if (T0 < 7.2 || T0 > 9.0) { g.fillStyle = HV.cream; g.strokeStyle = HV.line; g.lineWidth = 3; g.beginPath(); g.arc(431, 76, 21, 0, TAU); g.fill(); g.stroke(); art(() => ART.icon.draw(g, 'intent', 'attack', 431, 76, 32, { n: 7 }), 'intent'); }
    // the hand, cards flying out when played
    const fly = [prog(T0, 0.8, 1.7), prog(T0, 2.6, 3.5), prog(T0, 4.4, 5.3)];
    ids.forEach((cid, i) => {
      const disc = prog(T0, 6.4, 7.0);
      const back = T0 >= 9 ? prog(T0, 9.0 + i * 0.2, 9.8 + i * 0.2) : 0;
      const target = i === 1 ? { x: 84, y: 60 } : { x: 400, y: 150 };
      const f = easeIO(fly[i]);
      let x = HX[i] + (target.x - HX[i]) * f, y = HY + (target.y - HY) * f - Math.sin(Math.PI * fly[i]) * 40, a = 1;
      if (fly[i] >= 1) a = 0;
      if (T0 >= 6.4 && T0 < 9) a = a * (1 - disc);
      if (T0 >= 9) { a = back; y = HY + (1 - back) * 40; x = HX[i]; }
      if (a > 0.02) drawMiniCard(g, cid, x, y, cw * (1 - f * 0.4), ch * (1 - f * 0.4), (i - 1) * 0.07 * (1 - f), a);
    });
    if (T0 > 1.6 && T0 < 2.5) label(g, String(dmg1), 420, 130 - prog(T0, 1.6, 2.5) * 30, 30, HV.gold);
    if (T0 > 3.4 && T0 < 4.3) label(g, '+' + blk1, 130, 130 - prog(T0, 3.4, 4.3) * 20, 24, HV.sky);
    if (T0 > 8.0 && T0 < 8.9) label(g, '7', 100, 120 - prog(T0, 8.0, 8.9) * 26, 26, HV.pinkL);
    // End Turn: a candy pink pill with a cream rim and the warm line, sinking 3 px when pressed
    const press = T0 > 6.3 && T0 < 6.8, py = 318 + (press ? 3 : 0);
    rrect(g, 392, 321, 112, 40, 20); g.fillStyle = HV.pinkD; g.fill();
    rrect(g, 392, py, 112, 38, 19); g.fillStyle = HV.pink; g.fill(); g.lineWidth = 2.5; g.strokeStyle = HV.line; g.stroke();
    rrect(g, 396, py + 4, 104, 30, 15); g.strokeStyle = 'rgba(255,248,236,0.8)'; g.lineWidth = 1.5; g.stroke();
    label(g, 'End Turn', 448, py + 19, 16, HV.cream, 'center', HV.line);
    if (tk && T0 > 9 && T0 < 10) label(g, 'new turn: draw 5', 260, 176, 17, HV.pinkL);
    illusFg(g, 0.45);
  }

  // ---- 5. intents (a live bubble above a foe, plus a legend of every icon) and the statuses
  const INTENT_INFO = [
    ['attack', 'Attack', 'One hit'], ['multi', 'Flurry', 'Several hits'], ['heavy', 'Big hit', 'One big hit'], ['defend', 'Guard', 'Gains Block'], ['buff', 'Hype up', 'Gets stronger'],
    ['debuff', 'Jinx', 'Weakens or clogs'], ['summon', 'Summon', 'Calls friends'], ['heal', 'Heal', 'Mends itself'], ['special', 'Special', 'Something odd'], ['flee', 'Flee', 'Runs away'],
  ];
  function buildIntents() {
    const wrap = mk('div', { class: 'mn-illus-stack' });
    const cv = paintedCanvasSized(HT_W, 190, (g, t) => {
      illusBgSized(g, HT_W, 190, 'night');
      const k = Math.floor(t / 1.7) % INTENT_INFO.length, info = INTENT_INFO[k];
      art(() => ART.enemy.draw(g, 'kappa', { x: 170, y: 176, s: 0.78, pose: info[0] === 'heavy' ? 'telegraph' : 'idle', t }), 'enemy');
      const pop = easeIO(prog(t % 1.7, 0, 0.25));
      g.save(); g.translate(258, 64); g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
      g.fillStyle = HV.cream; g.strokeStyle = HV.line; g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-20, 26); g.lineTo(-34, 50); g.lineTo(-4, 34); g.closePath(); g.fill(); g.stroke();
      art(() => ART.icon.draw(g, 'intent', info[0], 0, 0, 52, { n: /attack|multi|heavy/.test(info[0]) ? 7 : undefined }), 'intent');
      g.restore();
      label(g, info[1], 372, 60, 24, HV.pinkL); label(g, info[2], 372, 92, 15, HV.cream);
      label(g, 'over every enemy', 372, 150, 13, 'rgba(255,248,236,0.75)');
    });
    const grid = mk('div', { class: 'mn-legend' });
    INTENT_INFO.forEach((i) => grid.appendChild(mk('div', { class: 'mn-lg' }, UI.icon('intent', i[0], 30, {}), mk('span', {}, mk('b', { text: i[1] }), mk('i', { text: i[2] })))));
    add(wrap, cv.el, grid);
    return { el: wrap, update: cv.update };
  }
  function paintedCanvasSized(w, h, paint) {
    const cv = canvasEl(w, h, 'mn-illus-cv');
    return { el: cv.c, update(dt, t) { if (!cv.g) return; cv.g.clearRect(0, 0, w, h); cv.g.save(); art(() => paint(cv.g, t), 'howto'); cv.g.restore(); } };
  }

  // ---- 6. gems: the same card before and after a gem drops into its slot
  function buildGems() {
    const cid = DATA.cards.hanae_slash ? 'hanae_slash' : (Object.keys(DATA.cards).find((k) => (DATA.cards[k].slots || []).indexOf('red') >= 0) || Object.keys(DATA.cards)[0]);
    const slots = (DATA.cards[cid] && DATA.cards[cid].slots) || ['red'];
    const col = slots.find((c) => c !== 'any') || 'red';
    const gem = Object.values(DATA.gems).find((g) => g.color === col && g.tier === 1 && g.mod && (g.mod.dmg || g.mod.block)) || Object.values(DATA.gems).find((g) => g.color === col) || Object.values(DATA.gems)[0];
    const wrap = mk('div', { class: 'mn-gemdemo' });
    const empty = UI.card({ uid: 0, id: cid, up: 0, gems: slots.map(() => null) }, { size: 'deck', class: 'mn-gd-card', tip: false, showGems: true });
    const full = UI.card({ uid: 0, id: cid, up: 0, gems: slots.map((s, i) => (i === 0 && gem ? gem.id : null)) }, { size: 'deck', class: 'mn-gd-card', tip: false, showGems: true });
    const gemEl = gem ? UI.gem(gem.id, { size: 'lg', tip: false }) : mk('span');
    gemEl.classList.add('mn-gd-gem');
    add(wrap, mk('div', { class: 'mn-gd-col' }, empty, mk('b', { text: 'Empty slot' })),
      mk('div', { class: 'mn-gd-mid' }, gemEl, mk('i', { class: 'mn-gd-arrow', 'aria-hidden': 'true' }), mk('b', { text: gem ? gem.name : '' }), mk('em', { text: gem ? safe(() => DATA.gemText(gem.id), '') : '' })),
      mk('div', { class: 'mn-gd-col' }, full, mk('b', { text: 'Gem socketed' })));
    return { el: wrap };
  }

  // ---- 7. what waits on the map
  function buildTiles() {
    const wrap = mk('div', { class: 'mn-tiles' });
    ['camp', 'shop', 'forge', 'event', 'chest', 'gemcache', 'well', 'brush', 'elite'].forEach((id, i) => {
      const d = DATA.tiles[id] || { name: cap(id), text: '' };
      const el = mk('div', { class: 'mn-tl', style: { '--i': String(i) } }, mk('span', { class: 'mn-tl-ico' }, UI.icon('tile', id, bigText() ? 38 : 50, {})), mk('b', { text: d.name }), mk('i', { text: d.text }));
      wrap.appendChild(el);
    });
    return { el: wrap };
  }

  // ---- 8. after the tour
  function buildAfter() {
    const wrap = mk('div', { class: 'mn-after' });
    const tmax = safe(() => META.trialMax(), 0) || 0;
    const seals = mk('div', { class: 'mn-af-seals', role: 'img', 'aria-label': 'Encores 0 to 10; you have opened up to ' + tmax }, U.range(11).map((n) => mk('span', { class: 'mn-af-seal' + (n <= tmax ? ' on' : ''), text: n === 0 ? '0' : roman(n) })));
    const seed = dailySeed();
    add(wrap,
      mk('div', { class: 'mn-af-card' }, UI.icon('stat', 'inkstone', 44, {}), mk('div', {}, mk('b', { text: 'Cheers' }), mk('span', { text: 'Earned after every tour. Spend them on the Tour Bus.' }))),
      mk('div', { class: 'mn-af-card' }, mk('div', { class: 'mn-af-body' }, mk('b', { text: 'Encores' }), mk('span', { text: 'Win a tour to unlock the next encore. Each one stacks a new rule.' }), seals)),
      mk('div', { class: 'mn-af-card' }, UI.hanko('D', { size: 'lg' }), mk('div', {}, mk('b', { text: 'Daily Duet' }), mk('span', { text: (seed ? "Today's seed is " + seed + '. ' : '') + 'Same heroes and map for everyone, once a day.' }))));
    return { el: wrap };
  }

  const KEYS = [['E', 'End turn'], ['S', 'Swap spots'], ['1 to 9', 'Pick a card'], ['Enter', 'Play it'], ['Z', 'Fast mode'], ['D / G', 'Draw / discard pile'], ['Arrows', 'Move the map'], ['B', 'Spell tray']];
  const HOWTO = [
    { id: 'book', tip: /both heroes lose their voice/, title: 'A World on Mute', kicker: 'Two heroes, three acts, one Gloss to sing through.', build: () => paintedCanvas(paintBook), rules: [
      'You lead two heroes across the Soundlands, where real voices are magic. The Gloss has smoothed them all into silence.',
      "Play three acts. Each ends with a headliner, and the last one is the Gloss's own star.",
      'Every tour is a new one: a different map, different cards, different charms. Win or lose, you earn Cheers to unlock more.'] },
    { id: 'map', tip: /^Unmuting a hex costs Vox/, title: 'Unmute the Soundlands', kicker: 'The Soundlands are on mute. Your Vox turns them back on.', build: () => paintedCanvas(paintMapDiagram), rules: [
      'Spend 1 Vox to unmute a hex next to live ground. It reveals what waits there: a fight, a merch stall, a green room, a detour.',
      'Tap any live hex to walk there. Stepping onto a fight or a detour starts it.',
      'Vox comes back from tea stalls, wins and green rooms. One-use Spells unmute whole shapes for free.'] },
    { id: 'rows', tip: /lead hero takes most/, title: 'Two Heroes, Two Spots', kicker: 'Who takes the lead matters.', build: () => paintedCanvas(paintRows), rules: [
      'The lead hero takes most attacks. The backing hero is safe from most of them.',
      'Each hero has a favourite spot and a bonus there. Check it on the hero card.',
      'You get one free swap per turn, more cost 1 Breath. If one hero loses their voice, the other steps up.'] },
    { id: 'cards', tip: /Block wears off/, title: 'Breath and Cards', kicker: 'Three Breath, five cards, one enemy turn.', build: () => paintedCanvas(paintCards), rules: [
      'Every card belongs to one hero. Play cards with Breath: you have 3 each turn.',
      'Attacks hurt, skills defend or set things up. Block soaks damage until your next turn.',
      'End your turn and unplayed cards are discarded while the enemies act. Then you draw 5 more.'] },
    { id: 'intents', tip: /Enemy intents show/, title: 'Read the Intents', kicker: 'Every enemy shows what it is about to do.', build: buildIntents, extra: 'statuses', rules: [
      'The bubble over an enemy tells you what it will do next: hit, block, jinx, summon.',
      'Statuses stack. ' + statusWord('vulnerable', 'Exposed') + ' takes more damage, ' + statusWord('weak', 'Muffled') + ' deals less, ' + statusWord('poison', 'Earworm') + ' ignores Block.',
      'Hover or press and hold any icon or underlined word to read what it means.'] },
    { id: 'gems', tip: /Gems only fit slots/, title: 'Gems in Slots', kicker: 'Set a gem, change the card.', build: buildGems, rules: [
      'Cards have 0 to 3 slots. A slot takes a gem of its own colour, and a rainbow slot takes any.',
      'Gems add damage, Block, extra hits, cards, Breath and more. The card text changes to match.',
      'Set gems at green rooms, studios and merch stalls. Replacing a gem loses the old one, so choose well.'] },
    { id: 'places', tip: /A detour is a choice/, title: 'Green Rooms, Stalls and Detours', kicker: 'The map is full of small choices.', build: buildTiles, rules: [
      "Green rooms let you rest, rehearse a card, set gems or warm up. Jordan's merch stalls sell cards, gems and charms, and declutter your deck.",
      'Detours are choices with a safe way, a gamble and often a price. Charms bend the rules for the whole tour.',
      'Rivals guard charms, the studio upgrades a card, and a sparkle booth lets you pick one gem.'] },
    { id: 'after', title: 'After the Tour', kicker: 'Every tour leaves something behind.', build: buildAfter, extra: 'keys', rules: [
      'You earn Cheers after every tour. Spend them on the Tour Bus on new cards, charms and gems.',
      'Win a tour to open Encores, stackable challenges. The Daily Duet is the same seed for everyone.',
      'Keys, if you play with a keyboard, are listed below. Everything also works by touch.'] },
  ];

  // mode: 'screen' | 'overlay'. exit() is what Back and Done do. Returns the pieces a host needs.
  function buildHowto(mode, exit) {
    const H = { page: 0, t: 0, pages: HOWTO.length, cur: null, dir: 1 };
    const book = mk('div', { class: 'mn-book', role: 'group' });
    const left = mk('section', { class: 'mn-pg left' }, mk('div', { class: 'mn-illus' }));
    const right = mk('section', { class: 'mn-pg right' });
    add(book, left, mk('i', { class: 'mn-gutter', 'aria-hidden': 'true' }), right);
    const dots = mk('div', { class: 'mn-dots', role: 'tablist', 'aria-label': 'Pages' });
    const dotEls = HOWTO.map((p, i) => { const d = mk('button', { type: 'button', class: 'mn-dot', role: 'tab', 'aria-label': 'Page ' + (i + 1) + ': ' + p.title, dataset: { i, sfx: QUIET } }, mk('i')); d.addEventListener('click', () => go(i)); dots.appendChild(d); return d; });
    const prev = btn('Previous', { kind: 'secondary', size: 'lg', sfx: QUIET, onclick: () => go(H.page - 1) });
    const next = btn('Next', { kind: 'primary', size: 'lg', sfx: QUIET, onclick: () => { if (H.page >= HOWTO.length - 1) { sfx('ui_back'); exit(); } else go(H.page + 1); } });
    const nav = mk('nav', { class: 'mn-ht-nav', 'aria-label': 'How to play pages' }, prev, dots, next);
    const root = mk('div', { class: 'mn-howto ' + mode + (bigText() ? ' ts-big' : '') }, book, nav);

    function go(i, silent) {
      if (i < 0 || i >= HOWTO.length) { if (i >= HOWTO.length) exit(); return; }
      const first = H.cur === null;
      H.dir = i >= H.page ? 1 : -1;
      H.page = i;
      const pg = HOWTO[i];
      clear(left.firstChild); clear(right);
      H.cur = pg.build();
      left.firstChild.appendChild(H.cur.el);
      if (H.cur.update) H.cur.update(0, H.t);                  // paint at once: no blank page before the first frame
      add(right, mk('p', { class: 'mn-pg-kicker', text: pg.kicker }), mk('h2', { class: 'mn-pg-title', text: pg.title }),
        mk('ol', { class: 'mn-pg-rules' }, pg.rules.map((r, k) => mk('li', {}, UI.hanko(String(k + 1), { size: 'lg' }), mk('p', { text: r })))));
      if (pg.extra === 'statuses') {
        const row = mk('div', { class: 'mn-pg-extra statuses', 'aria-label': 'Some statuses' });
        ['vulnerable', 'weak', 'frail', 'poison', 'burn', 'stun', 'bind', 'thorns', 'might'].forEach((s) => row.appendChild(UI.status(s, undefined, { size: 'md' })));
        right.appendChild(row);
      }
      if (pg.extra === 'keys') {
        const kl = mk('dl', { class: 'mn-pg-extra keys' });
        KEYS.forEach((k) => kl.appendChild(mk('div', {}, mk('dt', {}, mk('kbd', { class: 'btn-key', text: k[0] })), mk('dd', { text: k[1] }))));
        right.appendChild(kl);
      }
      const tip = pg.tip && pg.extra !== 'keys' && !(UI.opt && UI.opt.textScale > 1.1) ? (DATA.tips || []).find((x) => pg.tip.test(x)) : null;
      if (tip) right.appendChild(mk('div', { class: 'mn-margin' }, mk('b', { text: "Jordan's tip" }), mk('p', { text: tip })));
      right.appendChild(mk('span', { class: 'mn-pg-no', text: (i + 1) + ' / ' + HOWTO.length }));
      [left, right].forEach((el) => { el.classList.remove('turn-next', 'turn-prev'); if (!first) { void el.offsetWidth; el.classList.add(H.dir > 0 ? 'turn-next' : 'turn-prev'); } });
      book.setAttribute('aria-label', 'How to play, page ' + (i + 1) + ' of ' + HOWTO.length + ': ' + pg.title);
      dotEls.forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('seen', k < i); d.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      prev.rbSet({ disabled: i === 0, reason: 'This is the first page' });
      next.rbSet({ label: i === HOWTO.length - 1 ? 'Done' : 'Next' });
      if (!first && !silent) { sfx('page_turn'); UI.announce(pg.title); }
    }
    // swipe: a horizontal drag across the screen turns the page
    let down = null;
    book.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    book.addEventListener('pointerup', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null; if (Math.abs(dx) > 70 * (UI.scale || 1) && Math.abs(dy) < 60 * (UI.scale || 1)) go(H.page + (dx < 0 ? 1 : -1)); });
    book.addEventListener('pointercancel', () => { down = null; });
    Object.assign(H, {
      root, go, next: () => go(H.page + 1), prev: () => go(H.page - 1),
      update(dt, t) { H.t = t; if (H.cur && H.cur.update) H.cur.update(dt, t); },
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (H.page < HOWTO.length - 1) go(H.page + 1); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (H.page > 0) go(H.page - 1); return true; }
        if (e.key === 'Home') { go(0); return true; }
        if (e.key === 'End') { go(HOWTO.length - 1); return true; }
        return false;
      },
      nextBtn: next, prevBtn: prev, dotEls,
    });
    go(0, true);
    return H;
  }

  let HW = null;
  const howto = {
    enter(params, root) {
      const S = HW = { root, atmos: makeAtmos('howto', 9), off: listeners() };
      const back = btn('Back', { kind: 'ghost', size: 'sm', onclick: () => UI.back(), sfx: 'ui_back' });
      back.classList.add('mn-back');
      S.H = buildHowto('screen', () => UI.back());
      add(root, mk('div', { class: 'mn-howscreen' }, mk('div', { class: 'mn-set-top' }, back), banner('How to Play', 'mn-ht-banner'), S.H.root));
      UI.after(0, () => safe(() => S.H.nextBtn.focus()));
    },
    leave() { if (HW) { HW.off.clear(); HW = null; } },
    update(dt, t) { if (!HW) return; HW.atmos.update(dt, t); HW.H.update(dt, t); },
    draw(ctx, t) { if (HW) drawBackdrop(ctx, t, 'paper', HW.atmos, { tint: '#5b3fa8', tx: 640, ty: 360, tr: 760 }); },
    onKey(e) {
      const S = HW;
      if (!S) return false;
      if (e.key === 'Escape') { UI.back(); return true; }
      return S.H.key(e);
    },
    state() { return HW ? { page: HW.H.page, pages: HW.H.pages, id: HOWTO[HW.H.page].id } : null; },
  };

  // ================================================================================================================
  // PAUSE: Resume, Deck, Charms, Settings, How to play (a sub view of this overlay), Abandon, Save and quit
  // ================================================================================================================
  let PS = null;

  // Overlays get no update() from UI, so a diagram inside one is driven by a chain of one second tweens on the frame clock
  // (exact under GAME.debug.tick; it stops by itself once the overlay is gone). Headless UI.tween resolves at once, so no chain there.
  function driveOverlay(S, fn) {
    if (window.__HEADLESS) return;
    const step = () => {
      if (S.closed) return;
      const o = { n: 0 };
      let last = UI.time;
      UI.tween(o, { n: 1 }, 1000, 'linear', () => { if (S.closed) return; const t = UI.time; fn(clamp(t - last, 0, 0.05), t); last = t; }).then(step);
    };
    step();
  }

  const pauseOverlay = {
    open(p, root, close) {
      const run = UI.run && !UI.run.done ? UI.run : null;
      const S = PS = { root, close, view: 'menu', closed: false, H: null, run };
      const holder = mk('div', { class: 'mn-pause-holder' });
      root.appendChild(holder);
      S.holder = holder;

      const tips = DATA.tips || [];
      const tip = tips.length ? tips[Math.floor(U.rng(U.hash('menu-pause-tip', run ? run.seed : 0, UI.epoch))() * tips.length)] : '';

      function runCard() {
        if (!run) return mk('div', { class: 'mn-p-run empty' }, mk('p', { class: 'mn-p-none', text: 'No tour is on the road.' }));
        const trial = run.trial | 0;
        const chip = (txt) => mk('span', { class: 'mn-p-chip', text: txt });
        const heroes = mk('div', { class: 'mn-p-heroes' }, (run.heroes || []).map((h) => UI.heroBadge(h.id, { size: 'sm', hp: h.hp, maxHp: h.maxHp })));
        return mk('div', { class: 'mn-p-run' },
          mk('h3', { class: 'mn-p-h', text: 'Your tour' }),
          mk('div', { class: 'mn-p-chips' }, chip('Act ' + (run.chapter || 1)), trial > 0 ? chip('Encore ' + roman(trial)) : null, run.daily ? chip('Daily Duet') : null),
          heroes,
          mk('div', { class: 'mn-p-stats' }, UI.stat('gold', run.gold || 0, { size: 'sm' }), UI.stat('ink', run.ink || 0, { size: 'sm', max: run.inkMax }), (run.brushes || []).length ? UI.stat('brush', run.brushes.length, { size: 'sm' }) : null),
          mk('div', { class: 'mn-p-relics', 'aria-label': 'Charms' }, (run.relics || []).length ? (run.relics || []).slice(0, 10).map((id) => UI.relic(id, { size: 'sm' })) : mk('span', { class: 'mn-p-none', text: 'No charms yet' })));
      }

      function buildMenu() {
        const it = (kind, main, o) => plaque(kind, main, o.sub || null, Object.assign({ slim: true }, o));
        const list = [];
        list.push(it('primary', 'Resume', { act: 'resume', breathe: true, sfx: QUIET, extra: mk('kbd', { class: 'btn-key', text: 'Esc', 'aria-hidden': 'true' }), onclick: () => { sfx('ui_close'); close(); } }));
        if (run) {
          list.push(it('secondary', 'Deck', { act: 'deck', sfx: 'ui_open', extra: UI.hanko(String((run.deck || []).length), { size: 'sm', label: (run.deck || []).length + ' cards' }), onclick: () => UI.overlay.open('deck', { mode: 'view' }) }));
          list.push(it('secondary', 'Charms', { act: 'relics', sfx: 'ui_open', extra: UI.hanko(String((run.relics || []).length), { size: 'sm', label: (run.relics || []).length + ' charms' }), onclick: () => UI.overlay.open('relics', {}) }));
        }
        list.push(it('secondary', 'Settings', { act: 'settings', sfx: 'ui_open', onclick: () => UI.overlay.open('settings') }));
        list.push(it('secondary', 'How to play', { act: 'howto', sfx: 'page_turn', onclick: () => showHowto() }));
        const col = mk('nav', { class: 'mn-p-col', 'aria-label': 'Pause menu' }, list);
        col.appendChild(UI.divider());
        if (run) {
          col.appendChild(it('secondary', 'Save and quit', { act: 'quit', sfx: QUIET, onclick: () => saveAndQuit() }));
          const ab = it('secondary', 'Abandon tour', { act: 'abandon', onclick: () => abandonRun() });
          ab.classList.add('mn-danger');
          col.appendChild(ab);
        } else col.appendChild(it('secondary', 'Back to title', { act: 'title', sfx: QUIET, onclick: () => { sfx('ui_back'); close(); UI.toTitle(); } }));
        return col;
      }

      function showMenu() {
        S.view = 'menu';
        if (S.H) S.H = null;
        clear(holder);
        const panel = UI.panel({ kind: 'dark', gold: true, title: 'Paused', class: 'mn-pause' },
          mk('div', { class: 'mn-p-grid' }, mk('div', { class: 'mn-p-left' }, runCard(), tip ? mk('div', { class: 'mn-p-tip' }, mk('b', { text: 'A tip from Jordan' }), mk('p', { text: tip })) : null), buildMenu()));
        holder.appendChild(panel);
        const rs = holder.querySelector('[data-act=resume]');
        if (rs) { rs.setAttribute('data-autofocus', ''); UI.after(0, () => safe(() => rs.focus())); }
      }
      function showHowto() {
        S.view = 'howto';
        clear(holder);
        const H = S.H = buildHowto('overlay', () => { sfx('ui_back'); showMenu(); });
        const back = btn('Back to pause menu', { kind: 'ghost', size: 'sm', onclick: () => { sfx('ui_back'); showMenu(); }, sfx: QUIET });
        back.classList.add('mn-ht-back');
        holder.appendChild(mk('div', { class: 'mn-ht-wrap' }, back, banner('How to Play', 'mn-ht-banner-o'), H.root));
        UI.after(0, () => safe(() => H.nextBtn.focus()));
      }
      function saveAndQuit() {
        const ok = run ? !!safe(() => META.saveRun(run), false) : true;
        sfx(ok ? 'save' : 'ui_error');
        UI.toast(ok ? 'Your tour is saved. See you at the next beat.' : 'Progress cannot be saved in this browser', ok ? 'good' : 'warn');
        close();
        UI.toTitle();
      }
      function abandonRun() {
        const G = game();
        if (G && typeof G.abandon === 'function') G.abandon();
        else UI.toast('The tour cannot be abandoned right now', 'warn');
      }
      S.showMenu = showMenu; S.showHowto = showHowto;

      UI.onKey((e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (S.view === 'howto') {
          if (e.key === 'Escape') { showMenu(); return true; }
          return S.H ? S.H.key(e) : false;
        }
        const map = { d: 'deck', t: 'relics', s: 'settings', h: 'howto', r: 'resume' };
        const act = map[String(e.key).toLowerCase()];
        if (!act) return false;
        const b = holder.querySelector('[data-act=' + act + ']');
        if (!b) return false;
        b.click();
        return true;
      }, { overlay: true });
      driveOverlay(S, (dt, t) => { if (S.H) S.H.update(dt, t); });
      showMenu();
    },
    close() { if (PS) { PS.closed = true; PS = null; } },
  };

  // ================================================================================================================
  // registration
  // ================================================================================================================
  UI.screens.title = title;
  UI.screens.heroSelect = heroSelect;
  UI.screens.library = library;
  UI.screens.settings = settingsScreen;
  UI.overlays.settings = settingsOverlay;
  UI.screens.howto = howto;
  UI.overlays.pause = pauseOverlay;
})();
