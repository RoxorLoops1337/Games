// Echowake: node screens (owner: node screens engineer). One IIFE that registers into UI: the screens `reward`, `shop`, `event`,
// `camp`, `forge`, `chest`, `gemcache` and the overlays `deck` (replacing the basic viewer of ui.js) and `cardPick`. Styles live in
// css/node.css (classes nk-* shared, rw-* reward, sh-* shop, ev-* event, cp-* camp, fg-* forge, ch-* chest, gc-* gem cache, dk-* deck
// overlay, pk-* card pick, all scoped under .s-NAME or .o-NAME). This header is the contract of record for screen_node.js.
//
// SCREENS (DESIGN 5.11, 6). Every screen takes params {node, R}; reward takes {rewards, source, node, R} exactly as GAME.enterNode
// passes them. R falls back to UI.run and node to R.node. Every stateful action goes through RUN, and every page ends in GAME.nodeDone()
// (the ONLY GAME calls in this file besides GAME.enterNode for a fight an event starts, and UI.toTitle on the "no run" page).
//   reward    Ledger of what was simply earned (gold, ink, max HP, a gem, a brush) that counts up, three cards dealt face down then flipped,
//             pick one (or Skip: needs a second tap), a relic panel for an elite (take or leave it), a relic page of three for a boss
//             and then the card page. RUN.claim is single-shot, so the page collects every decision and claims ONCE, when all are made
//             (rewards.claimed). Number keys pick a card. Continue calls GAME.nodeDone.
//   shop      A peddler with a speech bubble and moods (hello, buy, poor, sold, leave, empty), a shelf of cards (price tags, sale
//             stickers, SOLD stamps) and plaques for gems, relics and a brush, card removal (deck overlay, remove mode, rising price)
//             and free gem cutting. Buys go through RUN.shopBuy and RUN.shopRemove. Keys 1..5 buy the n-th card.
//   event     A storybook page: plate (ART.scene.draw of the event's scene), typewriter text (tap or Enter completes it), the choices
//             revealed after the text with locks and reasons, then the outcome text with a chip per change (a tap or Enter finishes that text too), and
//             Continue (it takes the focus; Enter or Space press it). A gamble that ends in a fight hands the real combat node to GAME.enterNode.
//             Keys 1..9 choose the n-th VISIBLE choice, and only once the choices are up. A missing fable shows a blank page with a way on.
//   camp      A bonfire scene, four tiles (Rest with the exact heal previewed, Sharpen, Cut Gems, Meditate), a fire meter for the actions
//             left (min(3, mods.campActions + flags.extraCampActions)), DONE/OPEN/EMBERS badges, hero poses. Keys 1..4. "Break camp"
//             asks a second time when nothing was used. Cut Gems stays open all visit.
//   forge     Two plaques, Sharpen a Card (deck overlay in upgrade mode, then before and after on the anvil, then Strike: three hammer
//             blows, sparks, RUN.forgeAction) or Cut Gems (socket overlay through onSocket, as often as you like). One upgrade OR gem
//             cutting per visit. Keys 1 and 2.
//   chest     A shut chest (tap it, press the button, or Enter), the lid lifts, the gold counts up, and the loot is a relic (Take the
//             treasure or Just the gold), a choice of three gems, or only gold. RUN.take.
//   gemcache  Three gems on offer, tap to weigh one (how many cards it fits), Take this gem (RUN.take), then optionally "Set it in a card
//             now" (socket overlay with the gem preselected). Keys 1..3.
//
// OVERLAYS
//   deck      params {mode:'view'|'pick'|'upgrade'|'remove'|'socket' (default view), cards:[inst] (default R.deck), filter:{hero?, type?},
//             title, confirm, note, hint, price (shows the remove price), required, dismiss, gem (socket: gem id chosen in the pouch),
//             onSocket(uid, slot, gem) -> {ok, reason?} (socket: replaces RUN.socket so a forge or camp can cut through RUN.forgeAction
//             or RUN.campAction)}. Result: the chosen uid (pick, upgrade, remove); the LAST cut card's uid or null (socket); null on
//             cancel (cancelResult null); undefined from the Close button of view. `required` hides Cancel and sets dismiss:false.
//             Five sorts (Order, Cost, Type, Hero, Rarity), chips (hero, type, Upgraded, Gems, Open socket in socket mode), a count
//             that says "x of y", glossary bubbles and socket list beside the big card, the upgrade preview in view mode, the two-tap
//             "Really remove it?" in remove mode (the ask wears off after 3.2 s), and in socket mode a slot column, the gem pouch,
//             colour feedback ("it fits red and prism sockets only"), and the destroy-old warning when replacing.
//   cardPick  params {cards:[inst], n (default 1), optional, required, confirm, title, sub}. Result: [uid] in the order chosen, [] for
//             Skip or Esc (cancelResult []). Big cards for four or fewer, a compact grid for more.
//
// PENDING CHOICES. Anything RUN raises that needs the player (remove, upgrade, transform or copy a card, a card reward) waits in
// R.pending; resolvePending(S) answers each entry through the deck or cardPick overlay (required, not dismissible) and RUN.resolvePending,
// before a screen leaves. A screen whose player keeps backing out never traps: after three refusals the page turns.
//
// SAVED NODES. GAME saves at node entry and toTitle saves mid-node, so every page restores from its node: stock.items[].sold (shop),
// node.used (camp, forge), node.chosen (event), node.taken (chest, gemcache) and rewards.claimed (reward). A taken chest or cache
// reopens as an empty page with a Leave button. Nothing is ever paid or given by merely looking.
// The cut buttons never send {leave:true} to campAction or forgeAction: closing the socket overlay without a cut does not spend the
// action, and only a successful cut does.
//
// TIME. window.__HEADLESS resolves UI.after, UI.tween and the typewriter at once (suites read final states). Small UX timeouts (a nudge
// that wears off) use later(S, ms, fn), a FRAME-CLOCK ticker, so a suite drives UI.frame to see them; the overlays use setTimeout guarded
// by the overlay's dead flag. reduceMotion: count-ups, the typewriter and the stagger are instant, pauses shrink to 120 ms, sparks drop
// to three, ripples and fly-to-deck are off, painter sway is scaled by 0.3.
//
// DATA-TUT ANCHORS on every screen: `deck` (the Deck button), `relics` (the Treasures button), `ink` (the Ink stat). Music tracks:
// reward, shop, event, camp (also forge), reward (chest), event (gem cache).
//
// GEOMETRY. Where the painted art and the DOM laid over it must agree, ONE table feeds both, so they cannot drift apart: CACHE (the gem cache's plinths, glows and columns),
// RW (the reward page's card stage: the cards, the hint, the Skip and Continue foot, the banner and the pool of lantern light on the painted table all centre on its axis, x 796)
// and SHOP (the posts, the two planks and the peddler). enterGemCache, enterReward and enterShop write them to custom properties on the page (--gx0 --gp --gcw --gtop --gh --gy;
// --rw-x --rw-w; --sh-l --sh-w --sh-px --sh-y1 --sh-h1 --sh-y2 --sh-h2) and css/node.css places the DOM from those. The camp's left column is --cp-l and --cp-w in css only (no art
// depends on it). tests/hocus_vocus_screen_node.test.mjs records what the painters draw and checks the page's properties against it.
//
// PUBLIC API beyond DESIGN: none exported. Tests reach everything through the DOM and RUN (tests/hocus_vocus_screen_node.test.mjs).
//
// DEVIATIONS AND NOTES (also in the final report)
//   * The painters are drawn here in the chibi house style (ART.rj cel helpers when present, the toolkit's, plain canvas last): Jordan's Merch Stall (Jordan is ART.cast's figure),
//     the Green Room with its kettle, the Studio with its drum pad and drumstick, the Gift Box, the Sparkle Booth, the goodie-bag table and the Detour board's street. Only
//     reward and the Detour plate use ART.scene.draw, and every painter falls back to plain canvas when the toolkit is missing. Icons come from UI.icon, so real icon art
//     appears without a change here.
//   * Boss rewards use a relic page first (RUN offers three), then the card page: the claim happens after both decisions.
//   * A gem cache that was already taken reopens WITHOUT its tiles (RUN does not remember which gem was taken).
//   * A long press never also acts. The shop shelf cards use UI.tip.swallowClick on pointerup after their 420 ms peek, the plaques get the same
//     from UI.tip.attach; the peek thresholds (220 ms hover, 420 ms hold) are FIXED, never wait(), which shrinks to 120 ms under Reduce motion.
//   * The deck overlay keeps its confirm row (.dk-confirm) outside the scrolling .dk-detail so a mandatory picker's button is always on screen
//     (css/node.css, compact rules shrink the big card); the pick and remove notes ride beside the card.
//   * The elite treasure box answers once: Take it and Leave it are disabled at once and the frame leaves (.taken, .gone). A card offer a fable
//     raises is not dismissible (Skip is the way out). A net gold loss on the reward ledger reads "Gold lost -6".

(() => {
  'use strict';
  const mk = UI.el;
  const clamp = U.clamp;
  const isFn = (f) => typeof f === 'function';
  const headless = () => !!window.__HEADLESS;
  // a pause of ms milliseconds: none headless, a blink under reduced motion, the real thing otherwise
  const wait = (ms) => (headless() ? 0 : reduced() ? Math.min(ms, 120) : ms);
  const reduced = () => !!(UI.opt && UI.opt.reduceMotion);
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  const snd = (id) => { safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.sfx)) AUDIO.sfx(id); }); };
  const warned = {};
  const warnOnce = (key, e) => {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[screen_node] ' + key + (e ? ': ' + (e.message || e) : ''));
  };
  const cap = U.cap;

  // ==================================================================================================================
  // data helpers
  // ==================================================================================================================
  const cardDef = (id) => DATA.cards[id] || null;
  const cardName = (id) => (DATA.cards[id] && DATA.cards[id].name) || String(id);
  const gemName = (id) => (DATA.gems[id] && DATA.gems[id].name) || String(id);
  const relicName = (id) => (DATA.relics[id] && DATA.relics[id].name) || String(id);
  const heroName = (id) => (DATA.heroes[id] && DATA.heroes[id].name) || String(id);
  // a gem or socket colour as the player reads it (the id red is the pink family, any is rainbow): never print the id itself
  const colourWord = (c) => (DATA.COLOUR_NAME && DATA.COLOUR_NAME[c]) || String(c);
  // the rarity ids as the player reads them (a Charm's rarity: boss is a Headliner's, shop is Jordan's Merch)
  const RARITY_NAME = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', boss: 'Headliner', shop: 'Merch' };
  const rarityName = (r) => RARITY_NAME[r] || cap(String(r || ''));
  const slotsOf = (inst) => (inst && DATA.cards[inst.id] && DATA.cards[inst.id].slots) || [];
  // a card instance for an offered card id (rewards, shops, previews): uid 0 means "not in the deck"
  const instOf = (id, up, uid) => ({ uid: uid || 0, id, up: up ? 1 : 0, gems: ((DATA.cards[id] && DATA.cards[id].slots) || []).map(() => null) });
  const canUpgrade = (inst) => { const d = DATA.cards[inst.id]; return !!(d && d.up && !inst.up); };
  const gemColorOf = (id) => (DATA.gems[id] && DATA.gems[id].color) || 'gold';
  const gemColourName = (id) => colourWord(gemColorOf(id));
  const slotFits = (slot, gemId) => slot === 'any' || slot === gemColorOf(gemId);
  // does some gem in the pouch fit some slot (a replacement counts): the same test RUN.forgeUsable uses for gems
  const canCutAny = (R) => R.gems.some((g) => R.deck.some((c) => slotsOf(c).some((s, i) => c.gems[i] !== g && slotFits(s, g))));
  const mods = (R) => safe(() => RUN.mods(R), null) || {};
  // the map resource as the player reads it (DATA.keywords.ink.name): never print the id
  const voxName = () => (DATA.keywords && DATA.keywords.ink && DATA.keywords.ink.name) || 'Vox';
  const gemLine = (id) => safe(() => DATA.gemText(id), '') || '';

  // ==================================================================================================================
  // small DOM and motion helpers
  // ==================================================================================================================
  function stageRect(el) {
    const r = el.getBoundingClientRect();
    const a = UI.toStage(r.left, r.top), b = UI.toStage(r.right, r.bottom);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  // a canvas that ART draws into every frame (see update): fn(g, t, w, h) paints in w x h stage px
  function liveCanvas(S, w, h, fn, cls) {
    const rec = { c: null, w, h, fn, g: null, px: 0, bad: false };
    rec.c = mk('canvas', { class: 'nk-live' + (cls ? ' ' + cls : ''), style: { width: w + 'px', height: h + 'px' }, 'aria-hidden': 'true' });
    rec.g = safe(() => rec.c.getContext('2d'), null);
    S.lives.push(rec);
    paintLive(rec, S.t);
    return rec.c;
  }
  function paintLive(rec, t) {
    const g = rec.g;
    if (!g || rec.bad) return;
    const px = UI.px || 1;
    if (rec.px !== px) { rec.px = px; rec.c.width = Math.max(1, Math.round(rec.w * px)); rec.c.height = Math.max(1, Math.round(rec.h * px)); }
    g.setTransform(px, 0, 0, px, 0, 0);
    g.clearRect(0, 0, rec.w, rec.h);
    try { rec.fn(g, t, rec.w, rec.h); } catch (e) { rec.bad = true; warnOnce('live canvas', e); }
  }

  // cached offscreen layer (ART.sprite) with a direct-draw fallback, so a missing ART never breaks a screen
  function layer(ctx, key, w, h, fn) {
    if (typeof ART !== 'undefined' && ART && isFn(ART.sprite) && isFn(ART.blit)) {
      const spr = ART.sprite(key, w, h, fn);
      ART.blit(ctx, spr, 0, 0, w, h);
      return;
    }
    fn(ctx, w, h);
  }

  // per-visit screen state. Everything a screen owns hangs off S, and S.alive() is false as soon as the player leaves
  let CUR = null;
  function begin(kind, params, root) {
    const R = (params && params.R) || UI.run || null;
    const S = {
      kind, R, root, params: params || {}, node: (params && params.node) || (R && R.node) || null, t: 0, lives: [], tickers: [], dead: false,
      seq: 0, isLive: UI.live(), fx: null, chrome: null, paint: null, keys: null, finishing: false, busy: false,
    };
    S.alive = () => !S.dead && S.isLive();
    CUR = S;
    root.classList.add('nk-screen');
    return S;
  }
  function endScreen(S) {
    if (!S) return;
    S.dead = true;
    safe(() => UI.tip.hide());
    if (CUR === S) CUR = null;
  }

  // Deterministic little rng for cosmetics: the same visit always looks the same (and tests are stable)
  const cosRng = (S, tag) => U.rng(U.hash(S.R ? S.R.seed : 0, 'nk', S.kind, tag, S.seq++));

  function tickerAdd(S, fn) { S.tickers.push(fn); return fn; }
  // a frame-clock timeout for small UX niceties (a nudge that wears off). UI.after would fire at once headless, so this one waits for frames:
  // a suite drives UI.frame itself when it wants to see the timeout.
  function later(S, ms, fn) {
    const at = S.t + ms / 1000;
    tickerAdd(S, () => { if (S.t < at) return false; fn(); return true; });
  }

  // count a number up inside an element. Headless (and reduced motion) jumps straight to the end so a suite reads the final text.
  function countUp(S, el, to, o) {
    o = o || {};
    const fmt = o.fmt || ((n) => String(n));
    const from = o.from === undefined ? 0 : o.from;
    el.textContent = fmt(from);
    if (from === to) return Promise.resolve();
    if (reduced()) { el.textContent = fmt(to); return Promise.resolve(); }
    const proxy = { n: from };
    let last = from;
    return UI.tween(proxy, { n: to }, o.ms || 700, 'outCubic', () => {
      const v = Math.round(proxy.n);
      el.textContent = fmt(v);
      if (o.tick && v !== last && !headless()) { const step = Math.max(1, Math.round(Math.abs(to - from) / 8)); if (Math.abs(v - from) % step === 0) snd(o.tick); }
      last = v;
    }).then(() => { if (S.alive()) el.textContent = fmt(to); });
  }

  // staggered entrance: each element gets --i and the .in class after its delay (CSS animates the rest)
  function stagger(S, els, o) {
    o = o || {};
    els.forEach((el, i) => {
      if (!el) return;
      el.style.setProperty('--i', String(i));
      const d = (o.delay || 0) + i * (o.step || 70);
      if (headless() || reduced() || d <= 0) el.classList.add('in'); else UI.after(d, () => el.classList.add('in'));
    });
  }

  // a spray of sparks around a stage point, drawn by CSS on S.fx (cleaned up with the screen)
  function burst(S, x, y, o) {
    o = o || {};
    if (!S.fx || S.dead) return;
    const n = reduced() ? 3 : (o.n || 14);
    const r = cosRng(S, 'burst');
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = (o.spread || 90) * (0.4 + r() * 0.8);
      const el = mk('i', { class: 'nk-spk k-' + (o.kind || 'gold') });
      UI.vars(el, { '--dx': Math.round(Math.cos(a) * d) + 'px', '--dy': Math.round(Math.sin(a) * d - (o.lift || 20)) + 'px', '--sz': Math.round(6 + r() * 10) + 'px', '--d': Math.round(520 + r() * 420) + 'ms', '--rot': Math.round(r() * 200) + 'deg' });
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
      S.fx.appendChild(el);
      UI.after(1100, () => el.remove());
    }
  }

  // a ring of ink that spreads from a point (confirmation flourish)
  function ripple(S, x, y, kind) {
    if (!S.fx || S.dead || reduced()) return;
    const el = mk('i', { class: 'nk-ripple k-' + (kind || 'gold') });
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    S.fx.appendChild(el);
    UI.after(900, () => el.remove());
  }

  // a floating +N or -N that rises from an element
  function floatOver(el, text, kind) {
    if (!el) return;
    const r = stageRect(el);
    UI.floatText(r.cx, r.y + r.h * 0.2, text, kind);
  }

  // typewriter: writes `text` into el a few characters per frame (S.tickers), tap or Enter completes it. Headless completes at once.
  function typewriter(S, el, text, o) {
    o = o || {};
    const on = mk('span', { class: 'tw-on' }), off = mk('span', { class: 'tw-off', 'aria-hidden': 'true' });
    el.textContent = '';
    el.setAttribute('aria-label', String(text));
    el.appendChild(on); el.appendChild(off);
    const tw = { text: String(text), n: 0, done: false, onDone: [], t0: 0 };
    const paint = () => { on.textContent = tw.text.slice(0, tw.n); off.textContent = tw.text.slice(tw.n); };
    tw.complete = () => {
      if (tw.done) return;
      tw.done = true; tw.n = tw.text.length; paint();
      el.classList.add('tw-done');
      tw.onDone.splice(0).forEach((fn) => safe(fn));
    };
    tw.then = (fn) => { if (tw.done) safe(fn); else tw.onDone.push(fn); };
    if (headless() || reduced() || !tw.text.length) { tw.complete(); return tw; }
    const cps = o.cps || 60;
    let acc = -(o.delay || 0) / 1000;
    tickerAdd(S, (dt) => {
      if (tw.done) return true;
      acc += dt;
      if (acc < 0) return false;
      const want = Math.min(tw.text.length, Math.floor(acc * cps));
      if (want !== tw.n) { tw.n = want; paint(); }
      if (tw.n >= tw.text.length) { tw.complete(); return true; }
      return false;
    });
    paint();
    return tw;
  }

  const noRunScreen = (S) => {
    const back = UI.btn('Back to Title', { kind: 'primary', size: 'lg', onclick: () => UI.toTitle() });
    S.root.appendChild(mk('div', { class: 'nk-wrap nk-empty-wrap' }, UI.panel({ kind: 'paper', torn: true, title: 'No tour is on the road' }, mk('p', { class: 'nk-empty-text', text: 'There is no tour to show here.' }), mk('div', { class: 'row center' }, back))));
  };

  // finish a node: resolve anything still pending, then hand control back to GAME
  function leaveNode(S) {
    if (S.finishing) return Promise.resolve();
    S.finishing = true;
    S.busy = true;
    return resolvePending(S).then(() => {
      if (S.dead) return;
      snd('page_turn');
      GAME.nodeDone();
    });
  }

  // ==================================================================================================================
  // the top bar every node page shares: heroes with HP, gold, Ink, brushes, the Deck and Treasures buttons (menu button on the right)
  // ==================================================================================================================
  function chrome(S, o) {
    o = o || {};
    const R = S.R;
    const badges = R.heroes.map((h) => UI.heroBadge(h.id, { size: 'sm', hp: h.hp, maxHp: h.maxHp }));
    const gold = UI.stat('gold', o.goldFrom !== undefined ? o.goldFrom : R.gold);
    const ink = UI.stat('ink', R.ink, { max: R.inkMax });
    ink.setAttribute('data-tut', 'ink');
    const brush = UI.stat('brush', R.brushes.length);
    const deckBtn = UI.btn('Deck ' + R.deck.length, { kind: 'ghost', size: 'sm', icon: { kind: 'type', id: 'skill', size: 22 }, onclick: () => { UI.overlay.open('deck', { mode: 'view' }); } });
    deckBtn.setAttribute('data-tut', 'deck');
    deckBtn.classList.add('nk-deckbtn');
    const relBtn = UI.btn('' + R.relics.length, { kind: 'ghost', size: 'sm', icon: { kind: 'relic', id: 'lantern', size: 22 }, tip: 'Charms', onclick: () => { UI.overlay.open('relics', {}); } });
    relBtn.setAttribute('data-tut', 'relics');
    relBtn.setAttribute('aria-label', 'Charms');
    relBtn.classList.add('nk-relbtn');
    const el = mk('div', { class: 'nk-top' },
      mk('div', { class: 'nk-heroes' }, ...badges),
      mk('div', { class: 'nk-stats' }, gold, ink, brush, deckBtn, relBtn));
    const menu = UI.menuButton();
    const api = {
      el, menu, gold, ink, brush, deckBtn, badges,
      // repaint from R; animate counts that changed
      sync(animate) {
        gold.rbSet(R.gold, { animate: !!animate });
        ink.rbSet(R.ink, { animate: !!animate, max: R.inkMax });
        brush.rbSet(R.brushes.length, { animate: !!animate });
        deckBtn.rbSet({ label: 'Deck ' + R.deck.length });
        relBtn.rbSet({ label: '' + R.relics.length });
        R.heroes.forEach((h, i) => badges[i].rbSet({ hp: h.hp, maxHp: h.maxHp }));
      },
      badgeOf(heroId) { return badges[R.heroes.findIndex((h) => h.id === heroId)] || null; },
    };
    S.chrome = api;
    S.root.appendChild(el);
    S.root.appendChild(menu);
    return api;
  }

  function fxLayer(S) {
    S.fx = mk('div', { class: 'nk-fx', 'aria-hidden': 'true' });
    S.root.appendChild(S.fx);
    return S.fx;
  }

  const bannerEl = (text, sub, cls) => mk('div', { class: 'nk-titlebox' + (cls ? ' ' + cls : '') },
    mk('h1', { class: 'nk-banner' }, mk('span', { text })),
    sub ? mk('p', { class: 'nk-sub', text: sub }) : null);

  // a lacquer "ledger" row: icon, label, value
  function ledgerRow(icon, label, value, o) {
    o = o || {};
    const val = mk('b', { class: 'nk-row-val' + (o.cls ? ' ' + o.cls : ''), text: value });
    const row = mk('div', { class: 'nk-row' + (o.kind ? ' k-' + o.kind : '') + (o.cls ? ' ' + o.cls : ''), dataset: o.key ? { key: o.key } : undefined },
      mk('span', { class: 'nk-row-ico' }, icon), mk('span', { class: 'nk-row-lab', text: label }), val);
    row.rbVal = val;
    return row;
  }

  // ==================================================================================================================
  // pending choices: deck ops and card rewards that RUN raised (hooks, fights, events, relic pickups) wait in R.pending
  // ==================================================================================================================
  const DECK_OPS = { removeCard: 'remove', upgradeCard: 'upgrade', transformCard: 'pick', duplicateCard: 'pick' };
  const OP_TITLE = { removeCard: 'Remove a card', upgradeCard: 'Rehearse a card', transformCard: 'Transform a card', duplicateCard: 'Copy a card' };
  const OP_CONFIRM = { removeCard: 'Remove it', upgradeCard: 'Rehearse it', transformCard: 'Transform it', duplicateCard: 'Copy it' };
  const OP_NOTE = {
    removeCard: 'It leaves your deck for good.',
    upgradeCard: 'It gains its upgrade.',
    transformCard: 'It becomes a random card of the same hero and rarity.',
    duplicateCard: 'A second copy joins the deck.',
  };
  const filterText = (f) => (f ? ' (' + [f.hero ? heroName(f.hero) : '', f.type ? TYPE_LABEL[f.type] || f.type : ''].filter(Boolean).join(' ') + ' cards)' : '');

  // the same candidate rules RUN.resolvePending checks
  function pendingCandidates(R, p) {
    return R.deck.filter((c) => {
      const d = DATA.cards[c.id];
      if (!d) return p.op === 'removeCard';
      if (p.filter && p.filter.type && d.type !== p.filter.type) return false;
      if (p.filter && p.filter.hero && d.hero !== p.filter.hero) return false;
      if (p.op === 'upgradeCard') return !!d.up && !c.up;
      if (p.op === 'transformCard' || p.op === 'duplicateCard') return DATA.LISTS.heroIds.indexOf(d.hero) >= 0;
      return true;
    });
  }

  // ask the player about ONE pending entry. Resolves {ok, log} (log lines from RUN) or {ok:false} when it could not be answered.
  async function resolveOne(S, p) {
    const R = S.R;
    if (p.op === 'cardReward') {
      const offers = (p.offers || []).map((id, i) => instOf(id, 0, 1 + i));
      // dismiss:false: a stray tap on the dim backdrop (or Esc) must not forfeit a card the player paid HP, gold or a curse risk for; the Skip button is the one way out
      const pick = await UI.overlay.open('cardPick', { title: 'Choose a card', cards: offers, n: 1, optional: true, dismiss: false, confirm: 'Take this card' });
      const chosen = pick && pick[0] ? offers.find((c) => c.uid === pick[0]) : null;
      const res = RUN.resolvePending(R, p.id, chosen ? chosen.id : null);
      if (res.ok && chosen) snd('card_pick');
      return res;
    }
    const cands = pendingCandidates(R, p);
    const need = Math.min(p.n || 1, cands.length);
    if (!need) return RUN.resolvePending(R, p.id, []);
    let res;
    if (need === 1) {
      const uid = await UI.overlay.open('deck', {
        mode: DECK_OPS[p.op] || 'pick', cards: cands, required: true, dismiss: false,
        title: (OP_TITLE[p.op] || 'Choose a card') + filterText(p.filter), confirm: OP_CONFIRM[p.op], note: OP_NOTE[p.op],
      });
      if (uid === null || uid === undefined) return { ok: false, log: [] };
      res = RUN.resolvePending(R, p.id, [uid]);
    } else {
      const pick = await UI.overlay.open('cardPick', { title: (OP_TITLE[p.op] || 'Choose cards') + ' (' + need + ')', cards: cands, n: need, confirm: OP_CONFIRM[p.op] || 'Choose', required: true, dismiss: false });
      if (!pick || pick.length !== need) return { ok: false, log: [] };
      res = RUN.resolvePending(R, p.id, pick);
    }
    return res;
  }

  // answer every pending entry in order; calls S.onResolved(log) after each so a screen can show what happened
  async function resolvePending(S) {
    const R = S.R;
    let guard = 0, fails = 0;
    while (R.pending && R.pending.length && guard++ < 24 && !S.dead) {
      const p = R.pending[0];
      let res;
      try { res = await resolveOne(S, p); } catch (e) { warnOnce('pending', e); res = { ok: false, log: [] }; }
      if (S.dead) return;
      if (res && res.ok) {
        fails = 0;
        (res.log || []).forEach((l) => { if (l && l.text) UI.toast(l.text, 'good'); });
        if (isFn(S.onResolved)) safe(() => S.onResolved(res.log || []));
        snd('upgrade');
        if (S.chrome) S.chrome.sync(false);
      } else if (++fails > 2) {
        // the player keeps backing out of a mandatory choice: RUN says no card qualifies or the overlay was cancelled. Never trap the screen.
        UI.toast('That choice can wait: the tour goes on without it.', 'warn');
        break;
      }
    }
  }

  // ==================================================================================================================
  // toolbox for paint code (ART.tk with safe fallbacks)
  // ==================================================================================================================
  const TK = () => (typeof ART !== 'undefined' && ART && ART.tk) || null;
  const glow = (ctx, x, y, r, hex, a, add) => { const tk = TK(); if (tk && isFn(tk.glow)) tk.glow(ctx, x, y, r, hex, a, add); };
  const sparkleAt = (ctx, x, y, r, o) => { const tk = TK(); if (tk && isFn(tk.sparkle)) tk.sparkle(ctx, x, y, r, o); };
  const TAU = Math.PI * 2;

  // ==================================================================================================================
  // overlay: deck  (modes view, pick, upgrade, remove, socket)  and  overlay: cardPick
  // ==================================================================================================================
  const TYPE_LABEL = { attack: 'Attack', skill: 'Skill', power: 'Power', curse: 'Curse', status: 'Status' };
  const TYPE_ORDER = { attack: 0, skill: 1, power: 2, curse: 3, status: 4 };
  const RARITY_ORDER = { rare: 0, uncommon: 1, common: 2, starter: 3, token: 4 };
  const DECK_MODES = ['view', 'pick', 'upgrade', 'remove', 'socket'];
  const SORTS = [{ value: 'order', label: 'Order' }, { value: 'cost', label: 'Cost' }, { value: 'type', label: 'Type' }, { value: 'hero', label: 'Hero' }, { value: 'rarity', label: 'Rarity' }];
  const SOCKET_WHY = {
    card: 'That card is no longer in the deck.', slot: 'That socket does not exist.', gem: 'That gem is not in your pouch any more.',
    color: 'Wrong colour for that socket.', same: 'That gem is already set there.', used: 'The studio has done its work for today.', actions: 'No more breaks in this green room.', node: 'This moment has passed.',
  };
  const slotName = (s) => cap(colourWord(s));

  const filterMatch = (inst, f) => {
    const d = DATA.cards[inst.id] || {};
    if (f.type && d.type !== f.type) return false;
    if (f.hero && d.hero !== f.hero) return false;
    return true;
  };

  function costKey(inst) {
    const d = DATA.cards[inst.id] || {};
    const c = inst.up && d.up && d.up.cost !== undefined ? d.up.cost : d.cost;
    return c === 'X' ? 9 : typeof c === 'number' ? c : 99;
  }

  function sortCards(list, key, R) {
    const heroIdx = (h) => { const i = R ? R.heroes.findIndex((x) => x.id === h) : -1; return i >= 0 ? i : 9; };
    const rows = list.map((c, i) => ({ c, i }));
    rows.sort((a, b) => {
      const da = DATA.cards[a.c.id] || {}, db = DATA.cards[b.c.id] || {};
      let d = 0;
      if (key === 'cost') d = costKey(a.c) - costKey(b.c);
      else if (key === 'type') d = (TYPE_ORDER[da.type] ?? 9) - (TYPE_ORDER[db.type] ?? 9);
      else if (key === 'hero') d = heroIdx(da.hero) - heroIdx(db.hero);
      else if (key === 'rarity') d = (RARITY_ORDER[da.rarity] ?? 9) - (RARITY_ORDER[db.rarity] ?? 9);
      if (d) return d;
      if (key !== 'order') { const n = String(da.name || a.c.id).localeCompare(String(db.name || b.c.id)); if (n) return n; }
      return a.i - b.i;
    });
    return rows.map((x) => x.c);
  }

  // a private spark layer for an overlay (the screen's own layer sits below the overlays)
  function miniFx(root) {
    const layer = mk('div', { class: 'nk-fx', 'aria-hidden': 'true' });
    root.appendChild(layer);
    return { fx: layer, dead: false, seq: 0, R: UI.run, kind: 'ov', alive() { return !this.dead; } };
  }

  // the glossary bubbles for everything a big card mentions (keywords and statuses), as static speech bubbles
  function glossaryOf(card) {
    const words = [];
    card.querySelectorAll('.kw').forEach((k) => { const w = k.dataset.kw; if (w && words.indexOf(w) < 0) words.push(w); });
    ((card.rbResolved && card.rbResolved.kw) || []).forEach((k) => { if (words.indexOf(k) < 0 && DATA.keywords[k]) words.push(k); });
    const col = mk('div', { class: 'dk-gloss' });
    words.slice(0, 5).forEach((w) => { const n = UI.tip.kw(w); if (n) col.appendChild(mk('div', { class: 'tip tip-static' }, mk('div', { class: 'tip-in' }, n))); });
    return col;
  }

  // one line per socket: what sits in it, and what that does
  function socketList(inst) {
    const slots = slotsOf(inst);
    if (!slots.length) return mk('p', { class: 'dk-nosock', text: 'This card has no gem sockets.' });
    const ul = mk('ul', { class: 'dk-slots' });
    slots.forEach((s, i) => {
      const g = inst.gems && inst.gems[i];
      ul.appendChild(mk('li', { class: 'sc-' + s + (g ? ' filled' : '') },
        UI.icon('gem', g || 'slot:' + s, 26),
        mk('span', {}, mk('b', { text: g ? gemName(g) : slotName(s) + ' socket' }), mk('em', { text: g ? gemLine(g) : 'Empty' }))));
    });
    return ul;
  }

  function deckOverlay(p, root, close) {
    p = p || {};
    const R = UI.run;
    const mode = DECK_MODES.indexOf(p.mode) >= 0 ? p.mode : 'view';
    const required = !!p.required;
    if (required && p.dismiss === undefined) p.dismiss = false;        // a mandatory choice is not closed by Esc or the backdrop
    let all = (p.cards || (R && R.deck) || []).slice();
    if (p.filter) all = all.filter((c) => filterMatch(c, p.filter));
    const st = { dead: false, sort: 'order', types: new Set(), heroes: new Set(), flags: new Set(), sel: null, slot: null, gem: p.gem || null, up: false, nudge: 0, cut: null };
    root.nkState = st;
    const fxo = miniFx(root);
    st.fxo = fxo;

    const countEl = mk('span', { class: 'dk-count' });
    const typesEl = mk('span', { class: 'dk-types' });
    const chipsEl = mk('div', { class: 'dk-chips' });
    const grid = mk('div', { class: 'dk-grid', role: 'list', 'aria-label': 'Cards' });
    const pane = mk('div', { class: 'dk-pane' });
    const sortSeg = UI.seg(SORTS, { label: 'Sort by', value: st.sort, onchange: (v) => { st.sort = v; renderGrid(); } });

    const passes = (inst) => {
      const d = DATA.cards[inst.id] || {};
      if (st.types.size && !st.types.has(d.type === 'status' ? 'curse' : d.type)) return false;
      if (st.heroes.size && !st.heroes.has(d.hero)) return false;
      if (st.flags.has('up') && !inst.up) return false;
      if (st.flags.has('gems') && !(inst.gems || []).some(Boolean)) return false;
      if (st.flags.has('open') && !slotsOf(inst).some((s, i) => !(inst.gems || [])[i])) return false;
      return true;
    };
    const visible = () => sortCards(all.filter(passes), st.sort, R);
    const selectable = (inst) => (mode === 'upgrade' ? canUpgrade(inst) : mode === 'socket' ? slotsOf(inst).length > 0 : true);
    const selInst = () => all.find((c) => c.uid === st.sel) || null;

    // ---- header: counts and filter chips
    function chip(label, on, fn, icon) {
      const b = mk('button', { type: 'button', class: 'dk-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false' }, icon || null, mk('span', { text: label }));
      b.addEventListener('click', fn);
      return b;
    }
    const flip = (set, k) => { if (set.has(k)) set.delete(k); else set.add(k); renderChips(); renderGrid(); };
    function renderChips() {
      chipsEl.textContent = '';
      const heroes = [];
      all.forEach((c) => { const h = (DATA.cards[c.id] || {}).hero; if (DATA.LISTS.heroIds.indexOf(h) >= 0 && heroes.indexOf(h) < 0) heroes.push(h); });
      if (heroes.length > 1) heroes.forEach((h) => chipsEl.appendChild(chip(heroName(h), st.heroes.has(h), () => flip(st.heroes, h), UI.medallion(h, 22))));
      const present = {};
      all.forEach((c) => { const t = (DATA.cards[c.id] || {}).type; present[t === 'status' ? 'curse' : t] = true; });
      ['attack', 'skill', 'power', 'curse'].forEach((t) => { if (present[t]) chipsEl.appendChild(chip(TYPE_LABEL[t], st.types.has(t), () => flip(st.types, t), UI.icon('type', t, 20))); });
      if (mode !== 'socket') chipsEl.appendChild(chip('Upgraded', st.flags.has('up'), () => flip(st.flags, 'up')));
      chipsEl.appendChild(chip('Gems', st.flags.has('gems'), () => flip(st.flags, 'gems')));
      if (mode === 'socket') chipsEl.appendChild(chip('Open socket', st.flags.has('open'), () => flip(st.flags, 'open')));
    }
    const filtered = () => st.types.size + st.heroes.size + st.flags.size > 0;
    const clearFilters = () => { st.types.clear(); st.heroes.clear(); st.flags.clear(); renderChips(); renderGrid(); };

    function countTypes() {
      const n = { attack: 0, skill: 0, power: 0, curse: 0 };
      all.forEach((c) => { const t = (DATA.cards[c.id] || {}).type; const k = t === 'status' ? 'curse' : t; if (k in n) n[k] += 1; });
      typesEl.textContent = '';
      Object.keys(n).forEach((k) => { if (n[k]) typesEl.appendChild(mk('span', { class: 'dk-tcount t-' + k }, UI.icon('type', k, 18), mk('b', { text: n[k] }))); });
    }

    // ---- the grid
    function renderGrid() {
      const top = grid.scrollTop;
      grid.textContent = '';
      const list = visible();
      countEl.textContent = filtered() ? list.length + ' of ' + all.length + ' cards' : U.plural(all.length, 'card');
      if (!list.length) {
        const msg = !all.length ? (mode === 'upgrade' ? 'Nothing left to rehearse.' : mode === 'socket' ? 'No cards to set gems into.' : 'There are no cards here.') : 'No card matches these filters.';
        grid.appendChild(mk('div', { class: 'dk-none' }, mk('p', { class: 'empty', text: msg }), all.length ? UI.btn('Clear filters', { kind: 'secondary', size: 'sm', onclick: clearFilters }) : null));
        return;
      }
      list.forEach((inst, i) => {
        const dis = !selectable(inst);
        const c = UI.card(inst, { size: 'deck', selected: inst.uid === st.sel, disabled: dis, showGems: true, onclick: () => onCard(inst) });
        c.classList.add('dk-card', 'rise');
        c.style.setProperty('--i', String(Math.min(i, 12)));
        grid.appendChild(c);
      });
      grid.scrollTop = top;
    }
    function markSel() {
      grid.querySelectorAll('.card').forEach((el) => el.rbUpdate({ selected: Number(el.dataset.uid) === st.sel }));
    }
    function why(inst) {
      if (mode === 'upgrade') return inst.up ? 'Already rehearsed.' : 'This card cannot be upgraded.';
      if (mode === 'socket') return 'This card has no sockets.';
      return '';
    }
    function onCard(inst) {
      if (!selectable(inst)) { UI.toast(why(inst), 'warn'); snd('ui_error'); return; }
      if (st.sel !== inst.uid) { st.sel = inst.uid; st.slot = null; st.up = false; st.nudge = 0; }
      markSel();
      renderPane();
    }

    // ---- the detail pane
    const paneHint = () => ({
      view: 'Tap a card to look closer. Keywords are explained beside it.',
      pick: 'Choose a card.',
      upgrade: 'Choose a card to rehearse. You will see the result before you commit.',
      remove: 'Choose the card to remove. Fewer, sharper cards win fights.',
      socket: 'Choose a card, then a socket, then a gem from your pouch.',
    }[mode]);

    function paneEmpty() {
      const box = mk('div', { class: 'dk-hint' }, mk('i', { class: 'dk-hint-mark', 'aria-hidden': 'true' }), mk('p', { text: p.hint || paneHint() }));
      if (mode === 'view' && R) {
        const up = all.filter((c) => c.up).length, gems = all.reduce((n, c) => n + (c.gems || []).filter(Boolean).length, 0);
        box.appendChild(mk('ul', { class: 'dk-facts' }, mk('li', {}, mk('b', { text: up }), ' rehearsed'), mk('li', {}, mk('b', { text: gems }), ' gems set'), mk('li', {}, mk('b', { text: R.gems.length }), ' gems in the pouch')));
      }
      return box;
    }

    const actionBtn = (label, cls, fn, o) => UI.btn(label, Object.assign({ kind: 'primary', size: 'lg', class: cls, onclick: fn }, o || {}));

    function paneCard(inst) {
      const d = DATA.cards[inst.id] || {};
      const canPrev = mode === 'view' && d.up && !inst.up;
      const shown = st.up && canPrev ? Object.assign({}, inst, { up: 1 }) : inst;
      const card = UI.card(shown, { size: 'big', showGems: true });
      card.classList.add('dk-big');
      const note = mode === 'remove' ? mk('p', { class: 'dk-note warn', text: p.note || 'It leaves your deck for good.' }) : (p.note && mode === 'pick' ? mk('p', { class: 'dk-note', text: p.note }) : null);
      const side = mk('div', { class: 'dk-side' }, note, glossaryOf(card), socketList(shown));   // the note rides beside the card (never between the card and the button)
      const btns = mk('div', { class: 'dk-actions' });
      if (canPrev) btns.appendChild(UI.btn(st.up ? 'Show plain' : 'Preview upgrade', { kind: 'ghost', size: 'sm', onclick: () => { st.up = !st.up; renderPane(); } }));
      if (mode === 'pick') btns.appendChild(actionBtn(p.confirm || 'Choose this card', 'dk-go', () => close(inst.uid), { breathe: true }));
      if (mode === 'remove') {
        const go = actionBtn(st.nudge ? 'Really remove it?' : (p.confirm || 'Remove this card'), 'dk-go dk-danger', () => {
          if (!st.nudge) { st.nudge = 1; setTimeout(() => { if (!st.dead && st.nudge) { st.nudge = 0; renderPane(); } }, 3200); snd('ui_toggle'); renderPane(); return; }
          close(inst.uid);
        }, { danger: true });
        btns.appendChild(go);
      }
      pane.appendChild(mk('div', { class: 'dk-detail' }, mk('div', { class: 'dk-cardrow' }, card, side)));
      paneConfirm(null, btns);
    }

    // the note and the confirm button live OUTSIDE the scrolling detail, pinned to the bottom of the pane: on a phone (the stage at 0.54) the big card alone fills the pane,
    // and a mandatory picker (Transform, Copy, Remove, Sharpen) cannot be dismissed, so a confirm button that scrolled out of sight was the only way out
    function paneConfirm(note, btns) {
      if (!note && !(btns && btns.childNodes.length)) return;
      pane.appendChild(mk('div', { class: 'dk-confirm' }, note, btns && btns.childNodes.length ? btns : null));
    }

    function paneUpgrade(inst) {
      const before = UI.card(inst, { size: 'hand' });
      const after = UI.card(Object.assign({}, inst, { up: 1 }), { size: 'hand' });
      before.classList.add('dk-half'); after.classList.add('dk-half');
      const go = actionBtn(p.confirm || 'Rehearse this card', 'dk-go', () => close(inst.uid), { breathe: true });
      pane.appendChild(mk('div', { class: 'dk-detail dk-up' },
        mk('div', { class: 'dk-ba' },
          mk('div', { class: 'dk-bacol' }, mk('span', { class: 'dk-label', text: 'Before' }), before),
          mk('i', { class: 'dk-arrow', 'aria-hidden': 'true' }),
          mk('div', { class: 'dk-bacol after' }, mk('span', { class: 'dk-label', text: 'After' }), after))));
      paneConfirm(mk('p', { class: 'dk-note', text: p.note || 'One upgrade per card. Gems already set stay where they are.' }), mk('div', { class: 'dk-actions' }, go));
    }

    // -- socket pane
    function pickSlot(inst) {
      const slots = slotsOf(inst);
      if (st.gem) { const fit = slots.findIndex((s, i) => slotFits(s, st.gem) && inst.gems[i] !== st.gem && !inst.gems[i]); if (fit >= 0) return fit; const any = slots.findIndex((s, i) => slotFits(s, st.gem) && inst.gems[i] !== st.gem); if (any >= 0) return any; }
      const empty = inst.gems.findIndex((g, i) => !g && i < slots.length);
      return empty >= 0 ? empty : 0;
    }
    function canInsert(inst) {
      const slots = slotsOf(inst);
      if (st.slot === null || st.slot >= slots.length) return { ok: false, reason: 'Choose a socket first.' };
      if (!st.gem) return { ok: false, reason: R && R.gems.length ? 'Choose a gem from the pouch.' : 'You carry no gems.' };
      if (!slotFits(slots[st.slot], st.gem)) return { ok: false, reason: gemName(st.gem) + ' is ' + gemColourName(st.gem) + ': it fits ' + gemColourName(st.gem) + ' and rainbow sockets only.' };
      if (inst.gems[st.slot] === st.gem) return { ok: false, reason: 'That gem is already set there.' };
      return { ok: true, replace: inst.gems[st.slot] || null };
    }
    function insert(inst) {
      const chk = canInsert(inst);
      if (!chk.ok) { UI.toast(chk.reason, 'warn'); snd('ui_error'); return; }
      const slot = st.slot, gem = st.gem;
      const res = isFn(p.onSocket) ? p.onSocket(inst.uid, slot, gem) : RUN.socket(R, inst.uid, slot, gem);
      if (res && res.ok) {
        snd('gem_socket');
        st.cut = inst.uid;
        st.justCut = slot;
        if (R.gems.indexOf(gem) < 0) st.gem = null;
        renderGrid(); renderPane();
        const sb = pane.querySelector('.dk-slot.on');
        if (sb) { const r = stageRect(sb); burst(fxo, r.cx, r.cy, { kind: gemColorOf(gem), n: 16, spread: 80 }); ripple(fxo, r.cx, r.cy, gemColorOf(gem)); }
        UI.toast(gemName(gem) + ' is set' + (chk.replace ? ' (' + gemName(chk.replace) + ' crumbles)' : ''), 'good');
      } else {
        UI.toast((res && SOCKET_WHY[res.reason]) || 'The gem would not set.', 'warn');
        snd('ui_error');
      }
    }
    function paneSocket(inst) {
      const slots = slotsOf(inst);
      if (st.slot === null || st.slot >= slots.length) st.slot = pickSlot(inst);
      const chk = canInsert(inst);
      const preview = chk.ok ? Object.assign({}, inst, { gems: inst.gems.map((g, i) => (i === st.slot ? st.gem : g)) }) : inst;
      const card = UI.card(preview, { size: 'big', showGems: true });
      card.classList.add('dk-big', 'dk-sockcard');
      const col = mk('div', { class: 'dk-slotcol' });
      slots.forEach((s, i) => {
        const g = inst.gems[i];
        const b = mk('button', { type: 'button', class: 'dk-slot sc-' + s + (g ? ' filled' : '') + (i === st.slot ? ' on' : '') + (st.justCut === i ? ' fresh' : ''), 'aria-pressed': i === st.slot ? 'true' : 'false', 'aria-label': 'Socket ' + (i + 1) + ', ' + slotName(s) + ', ' + (g ? gemName(g) : 'empty') }, UI.icon('gem', g || 'slot:' + s, 46));
        b.addEventListener('click', () => { st.slot = i; st.justCut = null; renderPane(); });
        col.appendChild(mk('div', { class: 'dk-slotrow' }, b, mk('span', { class: 'dk-slot-lab' }, mk('b', { text: slotName(s) + ' socket' }), mk('em', { text: g ? gemName(g) : 'Empty' }))));
      });
      st.justCut = null;
      // the pouch: one chip per kind of gem, with a count
      const groups = {};
      (R ? R.gems : []).forEach((g) => { groups[g] = (groups[g] || 0) + 1; });
      const ids = Object.keys(groups).sort((a, b) => {
        const A2 = DATA.gems[a] || {}, B2 = DATA.gems[b] || {};
        return String(A2.color).localeCompare(String(B2.color)) || (A2.tier || 0) - (B2.tier || 0) || String(a).localeCompare(String(b));
      });
      const tray = mk('div', { class: 'dk-tray', role: 'group', 'aria-label': 'Gem pouch' });
      ids.forEach((id) => {
        const fits = st.slot !== null && slotFits(slots[st.slot], id);
        const gem = UI.gem(id, { size: 'sm', tip: false });
        gem.setAttribute('tabindex', '-1');
        const b = mk('button', { type: 'button', class: 'dk-gem gc-' + gemColorOf(id) + (st.gem === id ? ' on' : '') + (fits ? '' : ' nofit'), 'aria-pressed': st.gem === id ? 'true' : 'false', 'aria-label': gemName(id) + ', tier ' + ((DATA.gems[id] || {}).tier || 1) + ', ' + groups[id] + ' owned' },
          gem, mk('span', { class: 'dk-gem-txt' }, mk('b', { text: gemName(id) }), mk('em', { text: gemLine(id) })), groups[id] > 1 ? mk('i', { class: 'dk-gem-n', text: 'x' + groups[id] }) : null);
        b.addEventListener('click', () => {
          st.gem = st.gem === id ? null : id;
          if (st.gem && st.slot !== null && !slotFits(slots[st.slot], st.gem)) {
            const alt = slots.findIndex((s, i) => slotFits(s, st.gem) && inst.gems[i] !== st.gem);
            if (alt >= 0) st.slot = alt; else { UI.toast(gemName(id) + ' is ' + gemColourName(id) + ': this card has no ' + gemColourName(id) + ' or rainbow socket.', 'warn'); snd('ui_error'); UI.shake(b); }
          }
          renderPane();
        });
        tray.appendChild(b);
      });
      if (!ids.length) tray.appendChild(mk('p', { class: 'dk-nogems', text: 'The pouch is empty. Gift boxes, sparkle booths and merch stalls carry gems.' }));
      const state = chk.ok ? (chk.replace ? { cls: 'warn', text: 'Replacing ' + gemName(chk.replace) + ' destroys it for good. There is no taking a gem back out.' } : { cls: 'ok', text: gemName(st.gem) + ' will be set in the ' + slotName(slots[st.slot]).toLowerCase() + ' socket.' }) : { cls: st.gem && st.slot !== null && !slotFits(slots[st.slot], st.gem) ? 'bad' : '', text: chk.reason };
      const stateEl = mk('p', { class: 'dk-state ' + state.cls, role: 'status', text: state.text });
      const go = actionBtn(chk.replace ? 'Replace the gem' : 'Set the gem', 'dk-go' + (chk.replace ? ' dk-danger' : ''), () => insert(inst), { disabled: !chk.ok, reason: chk.reason, danger: !!chk.replace });
      col.appendChild(stateEl);
      col.appendChild(mk('div', { class: 'dk-actions' }, go));
      pane.appendChild(mk('div', { class: 'dk-detail dk-cut' }, mk('div', { class: 'dk-cardrow' }, card, col), tray));
    }

    function renderPane() {
      pane.textContent = '';
      const inst = selInst();
      if (!inst) { pane.appendChild(paneEmpty()); return; }
      if (mode === 'upgrade') paneUpgrade(inst); else if (mode === 'socket') paneSocket(inst); else paneCard(inst);
      revealGo();
    }
    // a button that sits inside the scrolling detail (the socket pane's Set the gem) is brought into view after every redraw. Only the detail scrolls, never an ancestor:
    // scrollIntoView would also move the overflow-hidden stage
    function revealGo() {
      safe(() => {
        const go = pane.querySelector('.dk-detail .dk-go'), box = pane.querySelector('.dk-detail');
        if (!go || !box) return;
        const g = go.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (g.bottom > b.bottom + 1) box.scrollTop += (g.bottom - b.bottom) / (UI.scale || 1);
      });
    }

    // ---- assemble
    const title = p.title || { view: 'Your Deck', pick: 'Choose a Card', upgrade: 'Rehearse a Card', remove: 'Remove a Card', socket: 'Set Gems' }[mode];
    const head = mk('div', { class: 'dk-head' }, mk('div', { class: 'dk-counts' }, countEl, typesEl), chipsEl);
    const done = mode === 'view' ? UI.btn('Close', { kind: 'secondary', size: 'lg', onclick: () => close() }) : (mode === 'socket' ? UI.btn('Done', { kind: 'primary', size: 'lg', onclick: () => close(st.cut) }) : (required ? null : UI.btn('Cancel', { kind: 'secondary', size: 'lg', sfx: 'ui_back', onclick: () => close(null) })));
    if (done) done.setAttribute('data-autofocus', '');
    const foot = mk('div', { class: 'dk-foot' }, mk('span', { class: 'dk-sort' }, mk('em', { text: 'Sort by' }), sortSeg), p.price !== undefined ? mk('span', { class: 'dk-price' }, UI.stat('gold', p.price, { size: 'sm', focusable: false }), mk('em', { text: ' to remove a card' })) : null, done);
    const panel = UI.panel({ kind: 'dark', gold: true, title, class: 'nk-deck dk-' + mode }, head, mk('div', { class: 'dk-body' }, grid, pane), foot);
    root.appendChild(panel);
    countTypes(); renderChips(); renderGrid(); renderPane();
    // one selectable card left: pick it for the player
    const sel1 = all.filter(selectable);
    if (mode !== 'view' && mode !== 'socket' && sel1.length === 1) { st.sel = sel1[0].uid; markSel(); renderPane(); }
  }

  // ---- cardPick {title, cards:[inst], n, optional, confirm, required} -> [uid]
  const cardPickOverlay = {
    cancelResult: [],
    open(p, root, close) {
      p = p || {};
      if (p.required && p.dismiss === undefined) p.dismiss = false;
      const cards = p.cards || [];
      const n = Math.max(1, p.n || 1);
      const need = p.optional ? 0 : Math.min(n, cards.length);
      const picked = [];
      const st = { dead: false };
      root.nkState = st;
      const fxo = miniFx(root);
      const size = cards.length <= 4 ? 'reward' : 'deck';
      // six cards or more wrap to two rows whose footer ran past the panel (and, on a phone at text 1.3, off the stage): from six the grid scrolls inside a capped height instead
      const grid = mk('div', { class: 'pk-grid sz-' + size + (cards.length > 5 ? ' many' : '') });
      const count = mk('span', { class: 'pick-count', role: 'status' });
      const ok = UI.btn(p.confirm || 'Choose', { kind: 'primary', size: 'lg', breathe: true, onclick: () => close(picked.slice()) });
      const refresh = () => {
        UI.setDisabled(ok, picked.length < need || picked.length > n, 'Choose ' + (need || 'a card'));
        count.textContent = p.optional ? picked.length + ' of up to ' + n : picked.length + ' of ' + need;
      };
      cards.forEach((inst, i) => {
        const c = UI.card(inst, { size, showGems: true, onclick: () => {
          const at = picked.indexOf(inst.uid);
          if (at >= 0) picked.splice(at, 1);
          else { if (n === 1) picked.length = 0; if (picked.length < n) picked.push(inst.uid); }
          grid.querySelectorAll('.card').forEach((el) => el.rbUpdate({ selected: picked.indexOf(Number(el.dataset.uid)) >= 0 }));
          const r = stageRect(c);
          if (picked.indexOf(inst.uid) >= 0) burst(fxo, r.cx, r.y + 60, { kind: 'gold', n: 8, spread: 60 });
          refresh();
        } });
        c.rbUpdate({ selected: false });
        c.classList.add('pk-card', 'rise');
        c.style.setProperty('--i', String(Math.min(i, 12)));
        grid.appendChild(c);
      });
      if (!cards.length) grid.appendChild(mk('p', { class: 'empty', text: 'Nothing to choose from.' }));
      refresh();
      const skip = p.optional && !p.required ? UI.btn('Skip', { kind: 'ghost', size: 'lg', sfx: 'ui_back', onclick: () => close([]) }) : null;
      const sub = p.sub || (p.optional ? 'Choose up to ' + n + ', or none.' : n > 1 ? 'Choose ' + need + '.' : 'Choose one.');
      root.appendChild(UI.panel({ kind: 'dark', gold: true, title: p.title || 'Choose a card', class: 'nk-pick' }, mk('p', { class: 'pk-sub', text: sub }), grid, mk('div', { class: 'row center gap m-btns' }, count, skip, ok)));
    },
    close(root) { if (root && root.nkState) root.nkState.dead = true; },
  };
  const deckOverlayDef = { cancelResult: null, open: deckOverlay, close(root) { if (root && root.nkState) { root.nkState.dead = true; if (root.nkState.fxo) root.nkState.fxo.dead = true; } } };

  // ==================================================================================================================
  // screen: reward
  // ==================================================================================================================
  // The reward page's stage. The card row, the hint, the Skip and Continue foot, the banner above them and the pool of lantern light on the painted table are all
  // centred on its axis (x + w / 2 = 796), because the ledger takes the left of the page; css reads --rw-x and --rw-w from here.
  const RW = { x: 336, w: 920 };
  const rwAxis = () => RW.x + RW.w / 2;
  const REWARD_TITLE = { normal: 'Victory', elite: 'A Rival Bows Out', boss: 'The Headliner Bows Out', event: 'The Tour Goes On' };
  const REWARD_SUB = {
    normal: ['The air settles, and something shiny is left in the grass.', 'The street hums again. The road is a little safer.', 'A short, tidy ending to a short, tidy fight.'],
    elite: ['A worthy foe, and a worthy prize.', 'The rival takes a bow, and hands over what it guarded.', 'Even the crickets stop to listen for a moment.'],
    boss: ['The act ends on a satisfying final beat.', 'The mute is off, and it stays off.'],
    event: ['A detour ends the way detours do: with a souvenir.', 'The tour goes on, a little richer.'],
  };

  // a rarity-coloured relic offer: icon, name, rarity and the hand-written line
  function relicBody(id, size) {
    const d = DATA.relics[id] || { name: id, text: '', rarity: 'common' };
    return [
      mk('span', { class: 'rl-ico' }, UI.icon('relic', id, size || 84)),
      mk('span', { class: 'rl-info' },
        mk('b', { class: 'rl-name', text: d.name }),
        mk('span', { class: 'rl-rar r-' + d.rarity, text: d.rarity === 'boss' ? 'Headliner charm' : rarityName(d.rarity) + ' charm' }),
        mk('span', { class: 'rl-text', text: safe(() => DATA.relicText(id), d.text) || d.text }),
        d.flavor ? mk('span', { class: 'rl-flavor', text: d.flavor }) : null),
    ];
  }

  // send an element's picture flying to another element (cards into the deck button, relics into the treasure button)
  function flyTo(S, el, target, done) {
    if (!el || !target) { if (done) done(); return; }
    const a = stageRect(el), b = stageRect(target);
    UI.vars(el, { '--fx': Math.round(b.cx - a.cx) + 'px', '--fy': Math.round(b.cy - a.cy) + 'px' });
    el.classList.add('fly');
    UI.after(wait(760), () => { if (done) done(); });
  }

  function paintTable(ctx) {
    // the goodie-bag table: a backstage table in perspective under a teal cloth, a cream, pink and green tape along the far edge, a pool of warm light, a striped goodie bag, a
    // setlist (scribbles only) and a few stickers. The table is mirrored about the stage axis (its right side runs off the screen), so the cards and the light sit on it however many are dealt.
    const ax = rwAxis(), L = 150, B = -50;
    const g1 = ctx.createLinearGradient(0, 400, 0, 720);
    g1.addColorStop(0, '#2a8f94'); g1.addColorStop(0.35, '#1f6f76'); g1.addColorStop(1, '#10393f');
    ctx.beginPath(); ctx.moveTo(L, 402); ctx.lineTo(2 * ax - L, 402); ctx.lineTo(2 * ax - B, 720); ctx.lineTo(B, 720); ctx.closePath();
    ctx.fillStyle = g1; ctx.fill();
    ctx.save(); ctx.clip();
    // a sparkle print on the cloth, in rows that widen toward the viewer
    for (let row = 0; row < 9; row++) {
      const y = 418 + row * row * 5 + row * 17, sp = 34 + row * 10, s = 2 + row * 0.55;
      ctx.fillStyle = 'rgba(255,244,230,' + (0.10 + row * 0.012).toFixed(3) + ')';
      for (let x = -60 + (row % 2) * sp / 2; x < 1700; x += sp) { ctx.beginPath(); for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4 - Math.PI / 2, rr = q % 2 ? s * 0.4 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
    }
    const g2 = ctx.createRadialGradient(ax, 560, 20, ax, 560, 520);
    g2.addColorStop(0, 'rgba(255,214,140,0.34)'); g2.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 380, 1280, 340);
    ctx.restore();
    // the tape along the far edge: pink, cream and green washi, with a dark line under it
    [[402, HV.pink], [407, HV.cream], [412, HV.green]].forEach((s) => { ctx.strokeStyle = s[1]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(L, s[0]); ctx.lineTo(2 * ax - L, s[0]); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(45,23,15,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L - 4, 399); ctx.lineTo(2 * ax - L + 4, 399); ctx.stroke(); ctx.beginPath(); ctx.moveTo(L - 8, 415); ctx.lineTo(2 * ax - L + 8, 415); ctx.stroke();
    // the goodie bag at the right end of the table: a striped paper bag, ribbon handles, a heart tag
    ctx.save(); ctx.translate(1190, 650);
    ctx.fillStyle = 'rgba(8,24,28,0.5)'; ctx.beginPath(); ctx.ellipse(6, 4, 66, 10, 0, 0, TAU); ctx.fill();
    inkLine(ctx, [[-26, -112], [-30, -150], [0, -168], [30, -150], [26, -112]], 9, INK, { taper: 0, wobble: 0 }); inkLine(ctx, [[-26, -112], [-30, -150], [0, -168], [30, -150], [26, -112]], 4.4, HV.pink, { taper: 0, wobble: 0 });
    cel(ctx, { poly: [[-48, -120], [48, -120], [54, 0], [-54, 0]] }, HV.cream, { line: 2.8, depth: 12, tension: 0, shadow: '#efd8bc',
      decor: (c) => { c.fillStyle = HV.pink; for (let i = -3; i <= 3; i += 2) c.fillRect(i * 16 - 8, -126, 16, 130); } });
    cel(ctx, { poly: [[-48, -120], [48, -120], [44, -102], [-44, -102]] }, HV.cream, { line: 2.4, depth: 4, tension: 0, shadow: '#efd8bc' });
    heartAt(ctx, 0, -50, 20, HV.cream, 2.4); heartAt(ctx, 0, -50, 13, HV.red, 2);
    starAt(ctx, 34, -98, 9, HV.gold, 0.2, 1.8);
    ctx.restore();
    // a setlist lying on the cloth, with a pencil
    ctx.save(); ctx.translate(392, 632); ctx.rotate(-0.09);
    cel(ctx, R4(-44, -52, 88, 104), HV.cream, { line: 2.2, depth: 6, tension: 0 });
    for (let k = 0; k < 7; k++) inkLine(ctx, [[-32, -34 + k * 13], [-32 + 24 + ((k * 9) % 34), -34 + k * 13]], 2, k === 0 ? HV.pinkD : 'rgba(45,23,15,0.55)', { taper: 0.3, wobble: 0 });
    ctx.fillStyle = 'rgba(63,207,106,0.7)'; ctx.fillRect(-14, -60, 30, 14);
    ctx.restore();
    inkLine(ctx, [[430, 688], [496, 664]], 9, INK, { taper: 0, wobble: 0 }); inkLine(ctx, [[430, 688], [496, 664]], 5, HV.gold, { taper: 0, wobble: 0 });
    // stickers: die-cut, a little crooked
    [[540, 680, 0], [992, 684, 1], [1086, 668, 2], [610, 704, 1], [1130, 700, 0]].forEach((s, i) => {
      const c = [HV.pink, HV.green, HV.gold, HV.sky, HV.violet][i % 5];
      if (s[2] === 0) { heartAt(ctx, s[0], s[1], 13, HV.cream, 2); heartAt(ctx, s[0], s[1], 9.5, c, 1.4); } else if (s[2] === 1) { starAt(ctx, s[0], s[1], 16, HV.cream, 0.2 * i, 2); starAt(ctx, s[0], s[1], 12, c, 0.2 * i, 1.4); } else { celOval(ctx, s[0], s[1], 13, 13, HV.cream, { line: 1.8, depth: 3 }); celOval(ctx, s[0], s[1], 9.5, 9.5, c, { line: 1.4, depth: 2 }); }
    });
  }

  function paintRewardBack(ctx, t, S) {
    const sceneId = S.boss ? 'victory' : 'ch' + clamp((S.R && S.R.chapter) || 1, 1, 3);
    let drew = false;
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.draw)) { try { ART.scene.draw(ctx, sceneId, 1280, 720, t, { particles: true }); drew = true; } catch (e) { warnOnce('scene', e); } }
    if (!drew) { ctx.fillStyle = '#1a1340'; ctx.fillRect(0, 0, 1280, 720); }
    ctx.fillStyle = S.boss ? 'rgba(13,11,30,0.5)' : 'rgba(13,11,30,0.66)';
    ctx.fillRect(0, 0, 1280, 720);
    if (S.boss) {
      // a slow sunburst behind the banner (which is centred on the stage axis, see RW), in warm cream and pink
      ctx.save(); ctx.translate(rwAxis(), 96); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU + t * 0.05;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 900, a, a + 0.09); ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,214,140,0.06)' : 'rgba(255,160,200,0.05)'; ctx.fill();
      }
      ctx.restore();
    }
    layer(ctx, 'nk:reward:table', 1280, 720, (g) => paintTable(g));
    // the heroes cheer in the corner (an elite's treasure panel needs that corner, so they sit those out)
    if (!S.elite && S.R && typeof ART !== 'undefined' && ART && ART.hero && isFn(ART.hero.draw)) {
      S.R.heroes.forEach((h, i) => {
        const c = ((t + i * 0.45) % 4.4 + 4.4) % 4.4, cheer = c < 0.95;
        safe(() => ART.hero.draw(ctx, h.id, { x: 96 + i * 128, y: 704 - i * 8, s: S.boss ? 0.9 : 1, pose: cheer ? 'cheer' : 'idle', t, pt: cheer ? c : 0, flip: false }));
      });
    }
    const tk = TK();
    if (tk) {
      safe(() => tk.kirakira(ctx, 0, 0, 1280, 720, t, { n: S.boss ? 46 : 20, seed: 11, size: 3.4, rise: 9 }));
      // a win brings confetti: small bright squares and strips tumbling down (never in a grid), more for a Headliner
      if (S.boss || S.elite) {
        const m = motionK(), cols = [HV.pink, HV.green, HV.gold, HV.sky, HV.cream, HV.violet];
        for (let i = 0; i < (S.boss ? 30 : 12); i++) {
          const v = (i * 0.618034) % 1, w = (i * 0.37 + 0.11) % 1;
          const x = ((v * 1400 + Math.sin(t * 0.8 + i) * 24 * m + t * (10 + w * 14) * m) % 1400) - 60, y = ((w * 900 + t * (40 + v * 36) * m) % 820) - 60;
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * (0.8 + v) * m + i); ctx.globalAlpha = 0.85; ctx.fillStyle = cols[i % 6];
          ctx.fillRect(-5, -2.5 - (i % 3), 10, 5 + (i % 3) * 1.4);
          ctx.restore();
        }
      }
      safe(() => tk.vignette(ctx, 1280, 720, { color: '#0d0b1e', alpha: 0.6 }));
    }
  }

  function enterReward(S, params, root) {
    const R = S.R;
    const rewards = params.rewards || (R.node && R.node.kind === 'reward' ? R.node.rewards : null) || null;
    const tier = rewards ? (rewards.boss ? 'boss' : rewards.tier === 'elite' ? 'elite' : rewards.source === 'event' ? 'event' : 'normal') : 'normal';
    S.boss = tier === 'boss'; S.elite = tier === 'elite';
    S.rewards = rewards || { gold: 0, ink: 0, cards: [], relics: [], gems: [], brush: null, maxHp: 0, claimed: true, boss: false, tier: 'normal', source: 'combat' };
    const rw = S.rewards;
    S.paint = paintRewardBack;
    const wrap = mk('div', { class: 'nk-wrap rw-wrap tier-' + tier });
    UI.vars(wrap, { '--rw-x': RW.x + 'px', '--rw-w': RW.w + 'px' });
    root.appendChild(wrap);
    fxLayer(S);
    const boss = DATA.enemies[DATA.FIXED.bosses[R.chapter]];
    const title = tier === 'boss' ? (boss ? boss.name + ' Bows Out' : REWARD_TITLE.boss) : REWARD_TITLE[tier];
    const subs = REWARD_SUB[tier];
    const sub = tier === 'boss' && boss && boss.title ? boss.title + '. ' + subs[cosRng(S, 'sub').int(0, subs.length - 1)] : subs[cosRng(S, 'sub').int(0, subs.length - 1)];
    const goldBefore = R.gold - (rw.gold || 0);
    chrome(S, { goldFrom: rw.claimed ? undefined : goldBefore });
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);
    wrap.appendChild(bannerEl(title, sub));

    // ---- the ledger (left): what was simply earned
    const ledger = mk('div', { class: 'rw-ledger' });
    const rows = [];
    // thieves can take more than the fight paid: a net loss reads "Gold lost -6" in a warning tone, never "+-6"
    const signed = (n) => (n < 0 ? '-' + Math.abs(n) : '+' + n);
    if (rw.gold) rows.push({ row: ledgerRow(UI.icon('stat', 'gold', 38), rw.gold < 0 ? 'Gold lost' : 'Gold', rw.gold < 0 ? '-0' : '+0', { kind: rw.gold < 0 ? 'loss' : 'gold' }), to: rw.gold, tick: 'gold', fmt: signed });
    if (rw.ink) rows.push({ row: ledgerRow(UI.icon('stat', 'ink', 38), voxName(), '+0', { kind: 'ink' }), to: rw.ink, tick: 'ink_gain' });
    if (rw.maxHp) rows.push({ row: ledgerRow(UI.icon('stat', 'hp', 38), 'Max HP', '+0', { kind: 'hp' }), to: rw.maxHp, tick: 'level_up' });
    const gemId = (rw.gems || [])[0] || null;
    let gemRow = null, brushRow = null;
    if (gemId) { gemRow = ledgerRow(UI.gem(gemId, { size: 'sm' }), gemName(gemId), 'Gem', { kind: 'gem', cls: 'bonus' }); rows.push({ row: gemRow }); }
    if (rw.brush) { brushRow = ledgerRow(UI.icon('brush', rw.brush, 38), (DATA.brushes[rw.brush] || {}).name || 'Spell', 'Spell', { kind: 'brush', cls: 'bonus' }); rows.push({ row: brushRow }); }
    rows.forEach((r) => ledger.appendChild(r.row));
    wrap.appendChild(ledger);
    stagger(S, rows.map((r) => r.row), { delay: 250, step: 160 });
    rows.forEach((r, i) => {
      if (!r.to) return;
      const run = () => { countUp(S, r.row.rbVal, r.to, { fmt: r.fmt || ((n) => '+' + n), tick: r.tick, ms: 640 }); if (r.tick === 'gold' && S.chrome) S.chrome.gold.rbSet(R.gold, { animate: !reduced() }); };
      if (reduced()) run(); else UI.after(wait(420 + i * 160), run);
    });
    if ((headless() || reduced()) && S.chrome) S.chrome.gold.rbSet(R.gold, { animate: false });
    if (!rows.length) ledger.appendChild(mk('p', { class: 'rw-nothing', text: 'The foe left nothing but a squeak.' }));

    // ---- decisions
    const cards = rw.cards || [], relics = rw.relics || [];
    const need = { card: cards.length > 0, relic: relics.length > 0 };
    const dec = { card: undefined, relic: undefined };
    S.dec = dec;
    const stage = mk('div', { class: 'rw-stage' });
    const foot = mk('div', { class: 'rw-foot' });
    wrap.appendChild(stage);
    wrap.appendChild(foot);
    const hint = mk('p', { class: 'rw-hint', role: 'status' });
    stage.appendChild(hint);
    const cont = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, onclick: () => leaveNode(S) });
    cont.classList.add('rw-cont');
    cont.hidden = true;
    const skip = UI.btn('Skip card', { kind: 'ghost', size: 'lg', onclick: () => onSkip() });
    skip.classList.add('rw-skip');
    foot.appendChild(skip); foot.appendChild(cont);
    let armed = false;
    const disarm = () => { armed = false; skip.rbSet({ label: 'Skip card' }); skip.classList.remove('nudge'); };

    const showContinue = () => {
      if (!S.alive()) return;
      skip.hidden = true;
      cont.hidden = false;
      cont.classList.add('in');
      hint.textContent = 'The spoils are yours.';
      UI.announce('The spoils are yours. Continue when you are ready.');
    };

    function doClaim() {
      if (S.claimedNow) return;
      S.claimedNow = true;
      const choice = { card: dec.card || null, relic: dec.relic || null, gem: gemId, takeBrush: !!rw.brush };
      let res = RUN.claim(R, rw, choice);
      if (!res.ok && res.reason === 'owned') { choice.relic = null; res = RUN.claim(R, rw, choice); }
      if (!res.ok && res.reason !== 'claimed') { warnOnce('claim ' + res.reason); UI.toast('The spoils would not come loose. Try again.', 'warn'); S.claimedNow = false; return; }
      if (gemId && gemRow) { gemRow.classList.add('taken'); snd('gem_get'); }
      if (rw.brush && brushRow) { brushRow.classList.add('taken'); snd('brush_pick'); }
      const hooks = (res.log || []).filter((l) => l.text && ['addCard', 'addRelic', 'addGem', 'addBrush'].indexOf(l.op) < 0);
      hooks.forEach((l) => UI.toast(l.text, 'good'));
      if (S.chrome) S.chrome.sync(true);
      resolvePending(S).then(() => showContinue());
    }
    const maybeClaim = () => {
      if ((need.card && dec.card === undefined) || (need.relic && dec.relic === undefined)) return;
      skip.hidden = true;
      doClaim();
    };

    // the cards are dealt face down and flipped (about 1.5 s): a tap while they are still in the air would take a card nobody has seen. Headless and reduced motion deal at once.
    let dealt = headless() || !!(UI.opt && UI.opt.reduceMotion);
    function pickCard(inst, slot, i) {
      if (dec.card !== undefined || S.busy || !dealt) return;
      dec.card = inst.id;
      disarm();
      const def = DATA.cards[inst.id] || {};
      hint.textContent = cardName(inst.id) + ' joins your deck.';
      slot.classList.add('pick');
      stage.querySelectorAll('.rw-slot').forEach((el) => { if (el !== slot) el.classList.add('gone'); });
      const r = stageRect(slot);
      burst(S, r.cx, r.cy - 20, { kind: def.rarity === 'rare' ? 'gold' : 'sakura', n: def.rarity === 'rare' ? 26 : 16, spread: 130 });
      ripple(S, r.cx, r.cy, def.rarity === 'rare' ? 'gold' : 'sakura');
      if (def.rarity === 'rare') snd('level_up');
      snd('gem_get');
      skip.hidden = true;
      UI.after(wait(560), () => {
        if (!S.alive()) return;
        flyTo(S, slot.querySelector('.rw-lift'), S.chrome && S.chrome.deckBtn, () => {
          if (!S.alive()) return;
          slot.classList.add('spent');
          UI.pulse(S.chrome.deckBtn);
          maybeClaim();
        });
      });
    }
    function confirmSkip() {
      if (dec.card !== undefined) return;
      dec.card = null;
      hint.textContent = 'You leave the offer on the table.';
      stage.querySelectorAll('.rw-slot').forEach((el) => el.classList.add('gone'));
      skip.hidden = true;
      snd('ui_back');
      UI.after(wait(350), () => { if (S.alive()) maybeClaim(); });
    }
    function onSkip() {
      if (dec.card !== undefined || S.busy) return;
      if (!armed) {
        armed = true;
        skip.rbSet({ label: 'Skip? Tap again' });
        skip.classList.add('nudge');
        snd('ui_toggle');
        later(S, 2600, disarm);
        return;
      }
      confirmSkip();
    }

    function buildCards() {
      const n = cards.length;
      const size = n <= 4 ? 'reward' : 'deck';
      const table = mk('div', { class: 'rw-cards sz-' + size + (n >= 5 ? ' many' : '') + (n === 4 || n >= 6 ? ' fit' : ''), role: 'group', 'aria-label': 'Card choices' });
      // six or more offers (a relic widens the choice) would wrap to a second row that hides under the hint and Skip: share the 920 px stage in ONE row instead.
      // Four full size cards (4 x 240 + 3 x 26 = 1038) are wider than the stage and ran under the ledger and off the right edge, so four share the row at a width
      // that leaves room for the fan's tilt on both sides (rwCardW).
      const rwcw = n === 4 ? Math.floor((RW.w - 2 * 28 - 14 * (n - 1)) / n) : n >= 6 ? Math.floor((900 - 14 * (n - 1)) / n) : 0;
      if (rwcw) UI.vars(table, { '--rwcw': rwcw + 'px' });
      const w = rwcw || (size === 'reward' ? 240 : 168);
      cards.forEach((id, i) => {
        const inst = instOf(id, 0, 100 + i);
        const slot = mk('div', { class: 'rw-slot' });
        const k = i - (n - 1) / 2;
        UI.vars(slot, { '--rot': (k * (n > 4 ? 1.6 : 3.4)).toFixed(2) + 'deg', '--lift': Math.round(Math.abs(k) * (n > 4 ? 3 : 9)) + 'px', '--from': Math.round(-k * (w + 24)) + 'px', '--i': i });
        const card = UI.card(inst, { size, showGems: true, onclick: () => pickCard(inst, slot, i) });
        card.setAttribute('data-choice', id);
        const back = UI.cardBack(size);
        slot.appendChild(mk('div', { class: 'rw-lift' }, mk('div', { class: 'rw-flip' }, mk('div', { class: 'rw-face back' }, back), mk('div', { class: 'rw-face front' }, card))));
        table.appendChild(slot);
      });
      stage.insertBefore(table, hint);
      hint.textContent = n > 1 ? 'Choose a card to add to your deck.' : 'A card is offered. Take it, or leave it.';
      S.cardsEl = table;
      skip.hidden = false;
      if (!dealt) later(S, 850 + 600 + 120, () => { dealt = true; });   // the first flip ends at .85 s + .6 s (css nkFlip), the last card a stagger later
    }

    function relicChoice(id, el, all) {
      if (dec.relic !== undefined || S.busy) return;
      dec.relic = id;
      const isBoss = S.boss;
      snd('relic_get');
      if (el) {
        const r = stageRect(el);
        burst(S, r.cx, r.cy, { kind: 'gold', n: 24, spread: 140 });
        ripple(S, r.cx, r.cy, 'gold');
        el.classList.add('pick');
      }
      (all || []).forEach((o) => { if (o !== el) o.classList.add('gone'); });
      // the elite's Take it and Leave it are answered: dead buttons under an empty frame must not linger until Continue (the frame itself leaves once the treasure has flown)
      const box = wrap.querySelector('.rw-relicbox');
      if (box) { box.classList.add('taken'); box.querySelectorAll('.rw-acts button').forEach((b) => { b.disabled = true; b.tabIndex = -1; }); }
      UI.after(wait(620), () => {
        if (!S.alive()) return;
        flyTo(S, el, S.chrome && S.chrome.el.querySelector('.nk-relbtn'), () => {
          if (!S.alive()) return;
          if (el) el.classList.add('spent');
          if (box) box.classList.add('gone');
          const relBtn = S.chrome.el.querySelector('.nk-relbtn');
          UI.pulse(relBtn);
          if (relBtn && relBtn.rbSet && R.relics.indexOf(id) < 0) relBtn.rbSet({ label: '' + (R.relics.length + 1) });     // the claim comes after the card pick: show the treasure counted now
          if (isBoss && need.card && dec.card === undefined) showCardsPage(); else maybeClaim();
        });
      });
    }
    function relicLeave() {
      if (dec.relic !== undefined) return;
      dec.relic = null;
      const box = wrap.querySelector('.rw-relicbox');
      if (box) { box.classList.add('gone', 'taken'); box.querySelectorAll('.rw-acts button').forEach((b) => { b.disabled = true; b.tabIndex = -1; }); }
      snd('ui_back');
      maybeClaim();
    }

    function buildRelicPanel() {          // elite: one relic, take it or leave it
      const id = relics[0];
      const take = mk('button', { type: 'button', class: 'rw-relic', 'aria-label': 'Take ' + relicName(id) }, ...relicBody(id, 84));
      take.addEventListener('click', () => relicChoice(id, take, []));
      const leave = UI.btn('Leave it', { kind: 'ghost', size: 'sm', onclick: relicLeave });
      const box = mk('div', { class: 'rw-relicbox' }, mk('h3', { class: 'rw-h3', text: 'A charm, waiting here' }), take, mk('div', { class: 'row center gap-s rw-acts' }, UI.btn('Take it', { kind: 'primary', size: 'sm', onclick: () => relicChoice(id, take, []) }), leave));
      if (rows.length >= 3) ledger.classList.add('dense');     // a gem or a brush above it: the box must slim down or Take it and Leave it fall off the bottom of the stage (phones: from 3 rows)
      if (rows.length >= 4) ledger.classList.add('tall');      // gold, ink, a gem AND a brush: even the desktop stage needs the slim box
      if (rows.length >= 2 && ((UI.opt && UI.opt.textScale) || 1) > 1.01) ledger.classList.add('snug');   // bigger text grows every row: at 1.15 and 1.3 the box still fell off the bottom, so the rows and the relic text tighten too
      ledger.appendChild(box);
      box.classList.add('rise'); box.style.setProperty('--i', '4');
      // the last resort when a long treasure text still outgrows the ledger (the css above is tuned for phones and text 1.3): scroll the ledger to the box so Take it and Leave it are on screen
      // (never by a hair: a few stray pixels would only slide the first ledger row under the top edge, so the scroll waits until the box really is cut off)
      UI.after(wait(300), () => { if (S.alive()) safe(() => { if (ledger.scrollHeight > ledger.clientHeight + 40) ledger.scrollTop = ledger.scrollHeight; }); });
    }
    function buildRelicPage() {           // boss: choose one of three, grandly
      const page = mk('div', { class: 'rw-relics', role: 'group', 'aria-label': 'Charm choices' });
      const els = [];
      relics.forEach((id, i) => {
        const b = mk('button', { type: 'button', class: 'rw-ped', 'aria-label': 'Take ' + relicName(id), dataset: { relic: id } }, mk('i', { class: 'rw-burst', 'aria-hidden': 'true' }), ...relicBody(id, 112));
        b.style.setProperty('--i', String(i));
        b.classList.add('rise');
        b.addEventListener('click', () => relicChoice(id, b, els));
        els.push(b);
        page.appendChild(b);
      });
      stage.insertBefore(page, hint);
      hint.textContent = 'Choose one charm. The others fade with the act.';
      S.relicPage = page;
      skip.hidden = true;
    }
    function showCardsPage() {
      if (S.relicPage) { S.relicPage.classList.add('out'); const pg = S.relicPage; UI.after(wait(420), () => pg.remove()); S.relicPage = null; }
      buildCards();
    }

    // ---- start: already claimed (a reload after Save and quit), nothing to choose, or the real decisions
    if (rw.claimed) {
      hint.textContent = 'These spoils were already gathered.';
      stage.appendChild(mk('div', { class: 'rw-done' }, mk('p', { text: 'Nothing left to take here.' })));
      showContinue();
      hint.textContent = 'These spoils were already gathered.';
    } else if (!need.card && !need.relic) {
      stage.appendChild(mk('div', { class: 'rw-done' }, mk('p', { text: 'No cards this time.' })));
      hint.textContent = 'Nothing more to choose.';
      UI.after(wait(900), () => { if (S.alive()) doClaim(); });
    } else {
      if (S.boss && need.relic) buildRelicPage();                          // the cards page follows the relic choice
      else { if (need.relic) buildRelicPanel(); if (need.card) buildCards(); }
      if (!need.card && need.relic && !S.boss) hint.textContent = 'Take the charm, or leave it.';
    }
    UI.after(wait(700), () => { if (S.alive() && R.pending && R.pending.length && !rw.claimed) resolvePending(S); });
    UI.announce('Spoils. ' + (rw.gold ? rw.gold + ' gold. ' : '') + (cards.length ? 'Choose a card.' : ''));
    S.keys = (e) => {
      if (S.dead || UI.overlay.count() || dec.card !== undefined || !S.cardsEl) return false;
      const d = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
      const slot = d >= 0 ? S.cardsEl.querySelectorAll('.rw-slot')[d] : null;
      if (!slot) return false;
      const c = slot.querySelector('.rw-face.front .card'); if (c) c.click();
      return true;
    };
  }

  // ==================================================================================================================
  // screen: shop (a lantern-lit peddler stall)
  // ==================================================================================================================
  const PEDDLER = {
    hello: ['Fresh merch! I made a sticker of your face. It is very flattering.', 'Tote bag? It has a picture of a tote bag on it.', 'Everything here is one of a kind. I made two.', 'Welcome back! I redesigned everything since you got here.'],
    buy: ['Great choice. I drew that one on the bus.', 'Sold! Want it in a tote bag? It is a very good tote bag.', 'You have excellent taste. I would know, I designed it.', 'That one suits you. Everything suits you, but that one most.'],
    poor: ['Not quite enough gold. I will keep it warm for you.', 'So close! Come back with a few more coins.', 'Gold first, then merch. Those are my only rules.', 'Almost! Almost is a lovely word, but it does not buy stickers.'],
    sold: ['That one is gone. I am already drawing a new one.', 'Sold out! Try the one next to it.'],
    remove: ['Gone! Your deck feels lighter already.', 'Decluttered. I might put it on a sticker.'],
    cut: ['Free gem setting! Do not tell the other stalls.', 'Steady hands make sparkling cards.'],
    empty: ['You have cleaned me out! Time to draw more merch.'],
    leave: ['Come again! I will have new designs by then.', 'Safe travels! Wear the merch with pride.', 'Off you go! Buy something next time, or at least admire it louder.'],
    idle: ['Psst. The blue gems are the sensible ones.', 'A charm is forever. A card is a mood.', 'My grandmother sold cards, and my grandmother was never wrong. Twice.', 'Do you hear that? That is the sound of new merch.', 'Sale sticker means sale. I do not make the rules. I make the stickers.'],
  };

  // The stall's geometry: the painted posts, planks and peddler (shopBackdrop, paintShop) and the DOM wares, nameplate and speech tail all read this one table. enterShop
  // writes it to --sh-* on the page and css/node.css places everything from those, so the rows can never drift off the opening between the posts again.
  // The opening is the gap between the posts (postL + postW .. postR, centred on x 799); both shelves of wares are centred in it; the price tags centre on the planks.
  const SHOP = { postL: 318, postR: 1254, postW: 26, planks: [{ y: 366, h: 36 }, { y: 596, h: 34 }], peddler: { x: 206, y: 664 } };
  const shopOpening = () => ({ l: SHOP.postL + SHOP.postW, w: SHOP.postR - (SHOP.postL + SHOP.postW) });

  function tipBubble(name, kind, text) {
    return mk('div', { class: 'tk' }, mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: name }), kind ? mk('span', { class: 'tk-kind k-keyword', text: kind }) : null), mk('p', { class: 'tk-text', text: text || '' }));
  }

  function enterShop(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'shop' ? S.node : null;
    const stock = node && node.stock ? node.stock : { items: [], removePrice: 0 };
    S.stock = stock;
    S.mood = { name: 'idle', until: 0 };
    S.paint = paintShop;
    const wrap = mk('div', { class: 'nk-wrap sh-wrap' });
    const opening = shopOpening();
    UI.vars(wrap, { '--sh-l': opening.l + 'px', '--sh-w': opening.w + 'px', '--sh-px': SHOP.peddler.x + 'px', '--sh-y1': SHOP.planks[0].y + 'px', '--sh-h1': SHOP.planks[0].h + 'px', '--sh-y2': SHOP.planks[1].y + 'px', '--sh-h2': SHOP.planks[1].h + 'px' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);

    // ---- the peddler talks
    const bubbleText = mk('p', { class: 'sh-say' });
    const bubble = mk('div', { class: 'sh-bubble', role: 'status' }, bubbleText, mk('i', { class: 'sh-tail', 'aria-hidden': 'true' }));
    wrap.appendChild(bubble);
    wrap.appendChild(mk('div', { class: 'sh-sign' }, mk('h1', { class: 'nk-banner' }, mk('span', { text: "Jordan's Merch Stall" }))));
    // S.t is the frame clock since boot (0 only until the first frame), so the idle timer is armed by the first tick after a line, never from S.t at enter time
    let lineNo = 0, idleGap = 11, nextIdle = null;
    const say = (kind, mood) => {
      const list = PEDDLER[kind] || PEDDLER.idle;
      const line = list[cosRng(S, 'line' + kind).int(0, list.length - 1)];
      lineNo += 1;
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      typewriter(S, bubbleText, line, { cps: 75 });
      if (mood) S.mood = { name: mood, until: S.t + 1.6 };
      idleGap = 12 + (lineNo % 3) * 3; nextIdle = null;
      return line;
    };
    S.say = say;
    tickerAdd(S, () => {
      if (nextIdle === null) { nextIdle = S.t + idleGap; return false; }
      if (S.t > nextIdle && !S.busy && !UI.overlay.count()) say('idle');
      return false;
    });

    // ---- wares
    const by = { card: [], gem: [], relic: [], brush: [] };
    stock.items.forEach((it) => { if (by[it.kind]) by[it.kind].push(it); });
    const els = {};
    const cardShelf = mk('div', { class: 'sh-cards', role: 'group', 'aria-label': 'Cards for sale' });
    const row2 = mk('div', { class: 'sh-row2', role: 'group', 'aria-label': 'Gems, charms and services' });

    const tagEl = (price, was) => mk('span', { class: 'sh-tag' }, mk('i', { class: 'sh-coin', 'aria-hidden': 'true' }), was ? mk('s', { text: was }) : null, mk('b', { text: price }));
    const stampEl = () => mk('i', { class: 'sh-stamp', 'aria-hidden': 'true', text: 'SOLD' });

    // a shelf card is 168 px wide (about 90 px on a phone), too small to read the rules, and one tap buys it: hover (mouse) or a 0.4 s press (touch) shows it BIG
    // on the left, over the peddler; the tap that ends a long press never buys (UI.tip.swallowClick, the same rule UI.tip.attach applies to the plaques).
    // The thresholds are FIXED: they must not go through wait(), which shrinks to 120 ms under Reduce motion and made ordinary 130 ms taps count as long presses.
    // Nothing here changes the plain click.
    const PEEK_HOVER_MS = 220, PEEK_HOLD_MS = 420;
    let peekTok = 0;
    const peekHide = () => { peekTok += 1; if (S.peekShown) { S.peekShown = false; UI.tip.hide(); } };
    const peekShow = (inst) => {
      if (!S.alive() || UI.overlay.count()) return false;
      const w = safe(() => UI.tip.card(inst, { x: 22, y: 122, size: 'big' }), null);
      if (w) { S.peekShown = true; const col = w.querySelector('.tip-kwcol'); if (col) col.remove(); }
      return !!w;
    };
    const bindPeek = (card, inst) => {
      let held = false;                                                           // this press already showed the big card: its click must not buy
      card.addEventListener('pointerenter', (e) => { if (e.pointerType && e.pointerType !== 'mouse') return; const my = ++peekTok; UI.after(PEEK_HOVER_MS, () => { if (peekTok === my) peekShow(inst); }); });
      card.addEventListener('pointerleave', () => peekHide());
      card.addEventListener('pointerdown', (e) => {
        held = false;
        if (e.pointerType === 'mouse') return;
        const my = ++peekTok;
        UI.after(PEEK_HOLD_MS, () => { if (peekTok === my) held = peekShow(inst); });
      });
      card.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') return;
        if (held) safe(() => UI.tip.swallowClick(card));
        held = false;
        peekHide();
      });
      card.addEventListener('pointercancel', (e) => { held = false; if (e.pointerType !== 'mouse') peekHide(); });     // a cancel sends no click, so nothing is armed
      card.addEventListener('focusin', () => { if (safe(() => card.matches(':focus-visible'), false)) peekShow(inst); });
      card.addEventListener('focusout', () => peekHide());
    };
    by.card.forEach((it, i) => {
      const inst = instOf(it.id, 0, 200 + i);
      const card = UI.card(inst, { size: 'deck', showGems: true, onclick: () => buy(it) });
      bindPeek(card, inst);
      const tag = tagEl(it.price, it.sale ? it.was : 0);
      const slot = mk('div', { class: 'sh-item kind-card', dataset: { key: it.key } }, card, it.sale ? mk('i', { class: 'sh-sale', text: 'SALE' }) : null, tag, stampEl());
      const def = DATA.cards[it.id] || {};
      card.setAttribute('aria-label', (card.getAttribute('aria-label') || cardName(it.id)) + '. ' + it.price + ' gold' + (it.sale ? ', on sale' : '') + '.');
      slot.classList.add('rise'); slot.style.setProperty('--i', String(i));
      slot.dataset.rarity = def.rarity || 'common';
      els[it.key] = { it, slot };
      cardShelf.appendChild(slot);
    });
    const plaque = (it, iconNode, name, kindLabel, tipFn) => {
      const b = mk('button', { type: 'button', class: 'sh-plaque kind-' + it.kind, dataset: { key: it.key }, 'aria-label': name + ', ' + kindLabel + ', ' + it.price + ' gold' },
        mk('span', { class: 'sh-kind', text: kindLabel }), mk('span', { class: 'sh-ico' }, iconNode), mk('b', { class: 'sh-name' + (name.split(/\s+/).some((w) => w.length >= 11) ? ' sh-long' : ''), text: name }), tagEl(it.price, 0), stampEl());     // sh-long: a word of 11 letters (Quickthought) must fit a phone plaque on one line
      b.addEventListener('click', () => buy(it));
      UI.tip.attach(b, tipFn, { side: 'top' });
      els[it.key] = { it, slot: b };
      return b;
    };
    let ri = 0;
    by.gem.forEach((it) => { const g = DATA.gems[it.id] || {}; const b = plaque(it, UI.icon('gem', it.id, 62), g.name || it.id, 'Tier ' + (g.tier || 1) + ' ' + colourWord(g.color || 'gold') + ' gem', () => tipBubble(g.name || it.id, 'Tier ' + (g.tier || 1) + ' ' + colourWord(g.color || 'gold') + ' gem', gemLine(it.id))); b.classList.add('rise'); b.style.setProperty('--i', String(5 + ri++)); row2.appendChild(b); });
    by.relic.forEach((it) => { const d = DATA.relics[it.id] || {}; const b = plaque(it, UI.icon('relic', it.id, 62), d.name || it.id, d.rarity === 'shop' ? 'Merch charm' : d.rarity === 'boss' ? 'Headliner charm' : d.rarity ? rarityName(d.rarity) : 'Charm', () => tipBubble(d.name || it.id, d.rarity ? rarityName(d.rarity) : '', safe(() => DATA.relicText(it.id), d.text))); b.classList.add('rar-' + (d.rarity || 'common'), 'rise'); b.style.setProperty('--i', String(5 + ri++)); row2.appendChild(b); });
    by.brush.forEach((it) => { const d = DATA.brushes[it.id] || {}; const b = plaque(it, UI.icon('brush', it.id, 62), d.name || it.id, 'Spell', () => tipBubble(d.name || it.id, 'One use', d.text)); b.classList.add('rise'); b.style.setProperty('--i', String(5 + ri++)); row2.appendChild(b); });

    // services: card removal (price rises) and free gem cutting
    const removeTag = mk('span', { class: 'sh-tag' }, mk('i', { class: 'sh-coin', 'aria-hidden': 'true' }), mk('b', { text: stock.removePrice }));
    const removeBtn = mk('button', { type: 'button', class: 'sh-plaque kind-service kind-remove', 'aria-label': 'Declutter, ' + stock.removePrice + ' gold' }, mk('span', { class: 'sh-kind', text: 'Service' }), mk('span', { class: 'sh-ico' }, UI.icon('motif', 'fire', 62)), mk('b', { class: 'sh-name', text: 'Declutter' }), removeTag);
    removeBtn.addEventListener('click', () => doRemove());
    UI.tip.attach(removeBtn, () => tipBubble('Declutter', 'Service', 'Remove a card from your deck for good. Every declutter costs ' + (DATA.ECONOMY.price.removeStep) + ' gold more.'), { side: 'top' });
    const cutBtn = mk('button', { type: 'button', class: 'sh-plaque kind-service kind-cut', 'aria-label': 'Set gems, free' }, mk('span', { class: 'sh-kind', text: 'Service' }), mk('span', { class: 'sh-ico' }, UI.icon('gem', 'slot:any', 62)), mk('b', { class: 'sh-name', text: 'Set gems' }), mk('span', { class: 'sh-tag free' }, mk('b', { text: 'FREE' })));
    cutBtn.addEventListener('click', () => doCut());
    UI.tip.attach(cutBtn, () => tipBubble('Set gems', 'Free', 'Set gems from your pouch into card sockets. Replacing a gem destroys the old one.'), { side: 'top' });
    [removeBtn, cutBtn].forEach((b, i) => { b.classList.add('rise'); b.style.setProperty('--i', String(5 + ri + i)); row2.appendChild(b); });
    wrap.appendChild(cardShelf);
    wrap.appendChild(row2);

    const soldOut = mk('div', { class: 'sh-soldout', hidden: true, 'aria-hidden': 'true' }, mk('span', { text: 'SOLD OUT' }));
    wrap.appendChild(soldOut);
    const leave = UI.btn('Leave the stall', { kind: 'primary', size: 'lg', onclick: () => { say('leave', 'idle'); snd('ui_back'); UI.after(wait(500), () => leaveNode(S)); } });
    leave.classList.add('sh-leave');
    wrap.appendChild(mk('div', { class: 'sh-foot' }, leave));
    if (!stock.items.length) row2.appendChild(mk('p', { class: 'sh-none', text: 'The stall is bare. Jordan is restocking.' }));

    function refresh() {
      let left = 0;
      Object.keys(els).forEach((k) => {
        const { it, slot } = els[k];
        slot.classList.toggle('sold', !!it.sold);
        slot.classList.toggle('poor', !it.sold && R.gold < it.price);
        slot.classList.toggle('can', !it.sold && R.gold >= it.price);
        if (!it.sold) left += 1;
      });
      removeBtn.classList.toggle('poor', R.gold < stock.removePrice);
      removeBtn.classList.toggle('can', R.gold >= stock.removePrice);
      removeTag.querySelector('b').textContent = stock.removePrice;
      removeBtn.setAttribute('aria-label', 'Declutter, ' + stock.removePrice + ' gold');
      cutBtn.classList.toggle('poor', !R.gems.length || !canCutAny(R));
      const all = stock.items.length > 0 && left === 0;
      soldOut.hidden = !all;
      if (all && !S.saidEmpty) { S.saidEmpty = true; UI.after(wait(900), () => { if (S.alive()) say('empty', 'happy'); }); }
    }
    S.refresh = refresh;

    function poorFeedback(el, need) {
      UI.shake(el);
      snd('ui_error');
      UI.toast('You need ' + need + ' more gold.', 'warn');
      say('poor', 'sad');
    }
    function flyCoins(fromEl, toEl, n) {
      if (!S.fx || reduced() || headless() || !fromEl || !toEl) return;
      const a = stageRect(fromEl), b = stageRect(toEl);
      for (let i = 0; i < n; i++) {
        const c = mk('i', { class: 'nk-coin', 'aria-hidden': 'true' });
        UI.vars(c, { '--fx': Math.round(b.cx - a.cx + (i - n / 2) * 6) + 'px', '--fy': Math.round(b.cy - a.cy) + 'px', '--dl': i * 70 + 'ms' });
        c.style.left = Math.round(a.cx) + 'px'; c.style.top = Math.round(a.cy) + 'px';
        S.fx.appendChild(c);
        UI.after(1300, () => c.remove());
      }
    }

    function buy(it) {
      if (S.busy) return;
      const entry = els[it.key];
      if (!entry) return;
      if (it.sold) { UI.toast('That one is already sold.', 'info'); snd('ui_error'); say('sold', 'shock'); return; }
      if (R.gold < it.price) { poorFeedback(entry.slot, it.price - R.gold); return; }
      const res = RUN.shopBuy(R, stock, it.key);
      if (!res.ok) {
        if (res.reason === 'gold') poorFeedback(entry.slot, it.price - R.gold);
        else if (res.reason === 'owned') { UI.toast('You already own that charm.', 'warn'); snd('ui_error'); }
        else UI.toast('Jordan shakes his head.', 'warn');
        refresh();
        return;
      }
      snd('buy'); snd('gold');
      peekHide();                                  // the big card of a ware that is now SOLD must not stay over the peddler until the pointer leaves
      const r = stageRect(entry.slot);
      flyCoins(S.chrome.gold, entry.slot, 6);
      burst(S, r.cx, r.cy, { kind: 'gold', n: 18, spread: 110 });
      ripple(S, r.cx, r.cy, 'gold');
      entry.slot.classList.add('buying');
      UI.after(wait(600), () => entry.slot.classList.remove('buying'));
      S.chrome.sync(true);
      if (it.kind === 'relic') { snd('relic_get'); UI.pulse(S.chrome.el.querySelector('.nk-relbtn')); }
      if (it.kind === 'gem') snd('gem_get');
      if (it.kind === 'brush') snd('brush_pick');
      if (it.kind === 'card') UI.pulse(S.chrome.deckBtn);
      say('buy', 'happy');
      refresh();
      (res.log || []).forEach((l) => { if (l.text && ['addRelic'].indexOf(l.op) < 0) UI.toast(l.text, 'good'); });
      if (R.pending && R.pending.length) { S.busy = true; resolvePending(S).then(() => { S.busy = false; refresh(); }); }
    }

    function doRemove() {
      if (S.busy) return;
      const price = stock.removePrice;
      if (R.gold < price) { poorFeedback(removeBtn, price - R.gold); return; }
      if (!R.deck.length) { UI.toast('There is no card left to remove.', 'warn'); return; }
      S.busy = true;
      UI.overlay.open('deck', { mode: 'remove', title: 'Remove a Card', price, confirm: 'Pay ' + price + ' and remove', note: 'Jordan takes it off your hands for good. The price goes up by ' + DATA.ECONOMY.price.removeStep + ' next time.' }).then((uid) => {
        S.busy = false;
        if (!S.alive() || uid === null || uid === undefined) return;
        const gone = R.deck.find((c) => c.uid === uid);
        const res = RUN.shopRemove(R, stock, uid);
        if (!res.ok) { UI.toast(res.reason === 'gold' ? 'Not enough gold.' : 'That card cannot be removed.', 'warn'); snd('ui_error'); return; }
        snd('buy'); snd('card_exhaust');
        const r = stageRect(removeBtn);
        burst(S, r.cx, r.cy, { kind: 'ink', n: 18, spread: 100 });
        flyCoins(S.chrome.gold, removeBtn, 5);
        S.chrome.sync(true);
        UI.toast((gone ? cardName(gone.id) : 'The card') + ' is gone for good.', 'good');
        say('remove', 'happy');
        refresh();
      });
    }

    function doCut() {
      if (S.busy) return;
      if (!R.gems.length) { UI.toast('Your pouch holds no gems.', 'warn'); snd('ui_error'); say('poor', 'sad'); return; }
      if (!canCutAny(R)) { UI.toast('No card has a socket for those gems.', 'warn'); snd('ui_error'); return; }
      S.busy = true;
      say('cut', 'happy');
      UI.overlay.open('deck', { mode: 'socket', title: 'Set Gems (free)' }).then(() => { S.busy = false; if (S.alive()) { S.chrome.sync(false); refresh(); } });
    }

    // hooks that fired when the stall opened (a treasure paid out, say)
    (node && node.hookLog || []).forEach((l) => { if (l && l.text) UI.toast(l.text, 'good'); });
    refresh();
    say('hello');
    if (R.pending && R.pending.length) UI.after(wait(500), () => { if (S.alive()) resolvePending(S).then(() => { S.chrome.sync(false); refresh(); }); });
    UI.announce("Jordan's merch stall. You have " + R.gold + ' gold.');
    S.keys = (e) => {
      if (S.dead || UI.overlay.count()) return false;
      if (/^[1-5]$/.test(e.key)) { const it = by.card[Number(e.key) - 1]; if (it) { buy(it); return true; } }
      return false;
    };
  }

  // ==================================================================================================================
  // screen: event (a fable, told as a storybook page)
  // ==================================================================================================================
  // One chip per thing an outcome changed, read from the log lines RUN.applyOps and RUN.resolvePending return.
  function outcomeChips(log) {
    const chips = [];
    const chip = (kind, icon, text, cls) => mk('span', { class: 'ev-chip k-' + kind + (cls ? ' ' + cls : '') }, mk('span', { class: 'ev-chip-ico' }, icon), mk('span', { class: 'ev-chip-txt', text }));
    const sign = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(n);
    (log || []).forEach((l, at) => {
      if (!l || !l.op) return;
      const has = (id) => !!DATA.cards[id];
      // a fixed treasure the party already carries is NOT gained: no treasure chip (the gold it turns into has its own chip right behind it; with none, say so plainly)
      if (l.op === 'addRelic' && /already owned/i.test(l.text || '')) {
        const next = log[at + 1];
        if (!(next && next.op === 'gold' && next.n)) chips.push(chip('info', UI.icon('type', 'skill', 28), l.text));
        return;
      }
      switch (l.op) {
        case 'gold': if (l.n) chips.push(chip(l.n > 0 ? 'good' : 'bad', UI.icon('stat', 'gold', 30), sign(l.n) + ' gold')); break;
        case 'ink': if (l.n) chips.push(chip(l.n > 0 ? 'good' : 'bad', UI.icon('stat', 'ink', 30), sign(l.n) + ' ' + voxName())); break;
        case 'heal': (l.who || []).forEach((w) => { if (w.n) chips.push(chip('good', UI.medallion(w.id, 30), heroName(w.id) + ' +' + w.n + ' HP')); }); break;
        case 'hurt': (l.who || []).forEach((w) => { if (w.n) chips.push(chip('bad', UI.medallion(w.id, 30), heroName(w.id) + ' -' + w.n + ' HP')); }); break;
        case 'maxHp': (l.who || []).forEach((w) => { if (w.n) chips.push(chip(w.n > 0 ? 'good' : 'bad', UI.icon('stat', 'hp', 30), heroName(w.id) + ' ' + sign(w.n) + ' max HP')); }); break;
        case 'addCard': case 'cardReward': if (l.id && has(l.id)) chips.push(chip('good', UI.card(instOf(l.id), { size: 'mini', tip: false }), cardName(l.id), 'has-card')); else if (l.text) chips.push(chip('info', UI.icon('type', 'skill', 28), l.text)); break;
        case 'addCurse': if (l.id && has(l.id)) chips.push(chip('bad', UI.card(instOf(l.id), { size: 'mini', tip: false }), cardName(l.id), 'has-card')); break;
        case 'upgradeCard': if (l.id && has(l.id)) chips.push(chip('good', UI.card(instOf(l.id, 1), { size: 'mini', tip: false }), cardName(l.id) + '+', 'has-card')); break;
        case 'duplicateCard': if (l.id && has(l.id)) chips.push(chip('good', UI.card(instOf(l.id), { size: 'mini', tip: false }), 'A copy of ' + cardName(l.id), 'has-card')); break;
        case 'transformCard': if (l.id && has(l.id)) chips.push(chip('good', UI.card(instOf(l.id), { size: 'mini', tip: false }), (l.from ? cardName(l.from) + ' became ' : '') + cardName(l.id), 'has-card')); break;
        case 'removeCard': if (l.text) chips.push(chip('bad', UI.icon('motif', 'fire', 28), l.text)); break;
        case 'addRelic': if (l.id && DATA.relics[l.id]) chips.push(chip('good', UI.relic(l.id, { size: 'sm', tip: false }), relicName(l.id), 'has-relic')); break;
        case 'addGem': if (l.id && DATA.gems[l.id]) chips.push(chip('good', UI.gem(l.id, { size: 'sm', tip: false }), gemName(l.id), 'has-gem')); break;
        case 'addBrush': if (l.id && DATA.brushes[l.id]) chips.push(chip('good', UI.icon('brush', l.id, 30), DATA.brushes[l.id].name)); break;
        case 'paint': if (l.n) chips.push(chip('good', UI.icon('tile', 'empty', 30), l.text || 'The sound comes back')); break;
        case 'fight': chips.push(chip('bad', UI.icon('tile', 'enemy', 30), 'A fight breaks out!')); break;
        default: if (l.text && l.op !== 'relic' && l.op !== 'flag') chips.push(chip('info', UI.icon('type', 'skill', 28), l.text)); break;
      }
    });
    return chips;
  }

  // the dusk street behind the Detour board: a violet sky going peach at the roofline, a skyline of candy-lit windows, a lamppost on the left edge and a tree on the right with
  // fairy lights strung between them. The board itself covers most of the page, so the street lives at the edges; the baked layer is still and the lights breathe live.
  const DESK_LIGHTS = [];                      // [x, y, colour]: every bulb of the strings and the lamp, from the baked layer
  function deskBackdrop(g) {
    DESK_LIGHTS.length = 0;
    const r = U.rng(4242);
    const sky = g.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#120c33'); sky.addColorStop(0.3, '#2d2070'); sky.addColorStop(0.6, '#5b3fa8'); sky.addColorStop(0.84, '#c9709a'); sky.addColorStop(1, '#ffb38a');
    g.fillStyle = sky; g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 56; i++) { g.fillStyle = 'rgba(255,248,236,' + (0.2 + r() * 0.55).toFixed(2) + ')'; g.fillRect(Math.floor(r() * 1280), Math.floor(r() * 300), 2, 2); }
    // the skyline: candy house fronts gone dusky, each with a few lit windows
    const fronts = ['#e8553f', '#8fe3c0', HV.gold, HV.sky, HV.pink];
    for (let x = -20, i = 0; x < 1300; x += 84 + (i % 3) * 14, i++) {
      const w = 76 + (i % 2) * 18, h = 150 + ((i * 37) % 5) * 26, top = 600 - h, c = U.color.mix(fronts[i % 5], '#2d2070', 0.68);
      cel(g, R4(x, top, w, h), c, { line: 2, depth: 6, tension: 0, lineColor: 'rgba(45,23,15,0.7)' });
      cel(g, { poly: [[x - 4, top], [x + w + 4, top], [x + w / 2, top - 22]] }, U.color.mix(c, '#120c33', 0.3), { line: 2, depth: 4, tension: 0, lineColor: 'rgba(45,23,15,0.7)' });
      for (let wy = top + 22; wy < 570; wy += 38) for (let wx = x + 10; wx < x + w - 16; wx += 28) {
        if (r() > 0.55) continue;
        g.fillStyle = r() > 0.5 ? '#ffd9a0' : '#ffc2dc'; g.fillRect(wx, wy, 16, 22); g.strokeStyle = 'rgba(45,23,15,0.7)'; g.lineWidth = 1.6; g.strokeRect(wx, wy, 16, 22);
      }
    }
    // the street: wet cobbles, a kerb line
    const st = g.createLinearGradient(0, 596, 0, 720); st.addColorStop(0, '#3a2a6a'); st.addColorStop(1, '#0d0a22');
    g.fillStyle = st; g.fillRect(0, 596, 1280, 124);
    g.strokeStyle = 'rgba(255,207,138,0.14)'; g.lineWidth = 1;
    for (let row = 0; row < 6; row++) {
      const y = 606 + row * row * 2.4 + row * 9, off = row % 2 ? 22 : 0, step = 44 + row * 12;
      g.beginPath(); g.moveTo(0, y); g.lineTo(1280, y); g.stroke();
      for (let x = -step + off; x < 1300; x += step) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6 - row, y + 14 + row * 3); g.stroke(); }
    }
    g.fillStyle = HV.cream; g.fillRect(0, 594, 1280, 5); inkLine(g, [[0, 594], [1280, 594]], 2.4, INK, { taper: 0, wobble: 0 }); inkLine(g, [[0, 599], [1280, 599]], 2.4, INK, { taper: 0, wobble: 0 });
    // the lamppost on the left edge: a pole, a curved arm and a glass lantern
    cel(g, R4(20, 170, 12, 440), '#3a3448', { line: 2.2, depth: 4, tension: 0, hi: '#615f6d' });
    cel(g, RR(8, 598, 36, 18, 4), '#3a3448', { line: 2.2, depth: 3 });
    cel(g, RR(6, 120, 40, 52, 10), '#fff4d6', { line: 2.6, depth: 6, tension: 0.5 });
    cel(g, [[2, 120, 1], [26, 100], [50, 120, 1]], '#3a3448', { line: 2.4, depth: 3, tension: 0.8 });
    DESK_LIGHTS.push([26, 146, '#ffcf8a']);
    // the tree on the right edge: a trunk and a round crown of mint-green puffs
    cel(g, { poly: [[1244, 600], [1254, 280], [1272, 280], [1282, 600]] }, '#8a5a38', { line: 2.4, depth: 6, tension: 0 });
    [[1250, 200, 70, '#3fcf6a'], [1190, 250, 52, '#2da656'], [1286, 252, 56, '#2da656'], [1230, 150, 50, '#6fe08a'], [1280, 150, 48, '#3fcf6a']].forEach((c) => celOval(g, c[0], c[1], c[2], c[2] * 0.9, c[3], { line: 2.4, depth: 8 }));
    // fairy lights: one string from the lamp to the tree, and one along the top edge
    fairyString(g, 30, 150, 1252, 196, 120, 26, [HV.gold, HV.pink, HV.green, HV.cream, HV.sky], 4.8).forEach((b) => DESK_LIGHTS.push(b));
    fairyString(g, -6, 38, 1286, 38, 20, 26, [HV.pink, HV.gold, HV.cream, HV.green, HV.sky], 4.8).forEach((b) => DESK_LIGHTS.push(b));
  }
  function paintDesk(ctx, t, S) {
    layer(ctx, 'nk:desk', 1280, 720, deskBackdrop);
    const m = motionK();
    DESK_LIGHTS.forEach((b, i) => glow(ctx, b[0], b[1] + (i === 0 ? 0 : 3), i === 0 ? 110 + 8 * Math.sin(t * 2.1) : 17, b[2], i === 0 ? 0.4 : 0.24 + 0.3 * (0.5 + 0.5 * Math.sin(t * (1.1 + (i % 5) * 0.3) * m + i * 2.1))));
    const tk = TK();
    if (tk) {
      glow(ctx, 640, 380, 560, '#ffd9a0', 0.08 + 0.02 * Math.sin(t * 1.7));
      safe(() => tk.kirakira(ctx, 0, 0, 1280, 720, t, { n: 18, seed: 5, size: 3, rise: 7 }));
      safe(() => tk.mist(ctx, 0, 520, 1280, 200, t, { n: 4, seed: 9, alpha: 0.06, color: '#e6d9ff', speed: 6 }));
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.4 }));
    }
    void S;
  }

  function enterEvent(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'event' ? S.node : null;
    const ev = node ? (typeof node.event === 'string' ? DATA.events[node.event] : node.event) : null;
    S.paint = paintDesk;
    const wrap = mk('div', { class: 'nk-wrap ev-wrap' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);

    const sceneId = ev && ev.art && DATA.LISTS.scenes.indexOf(ev.art.scene) >= 0 ? ev.art.scene : 'event';
    const plate = liveCanvas(S, 470, 350, (g, t, w, h) => {
      let ok = false;
      if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.draw)) { try { ART.scene.draw(g, sceneId, w, h, t, { particles: true }); ok = true; } catch (e) { warnOnce('plate scene', e); } }
      if (!ok) { g.fillStyle = '#2a1d5a'; g.fillRect(0, 0, w, h); }
      const tk = TK();
      if (tk) safe(() => tk.vignette(g, w, h, { alpha: 0.4 }));
    }, 'ev-plate-c');
    const title = mk('h2', { class: 'ev-title', text: ev ? ev.title : 'A Lost Detour' });
    const textEl = mk('p', { class: 'ev-text', tabindex: '-1' });
    const choicesEl = mk('div', { class: 'ev-choices', role: 'group', 'aria-label': 'What will you do?' });
    const outEl = mk('div', { class: 'ev-outcome', hidden: true });
    const left = mk('div', { class: 'ev-page left' }, mk('div', { class: 'ev-plate' }, plate, mk('i', { class: 'ev-frame', 'aria-hidden': 'true' }), mk('i', { class: 'ev-seal', 'aria-hidden': 'true', text: (DATA.tiles && DATA.tiles.event && DATA.tiles.event.name) || 'Detour' })));
    const right = mk('div', { class: 'ev-page right' }, title, textEl, choicesEl, outEl);
    const more = mk('i', { class: 'ev-more', 'aria-hidden': 'true', text: 'More' });
    const book = mk('div', { class: 'ev-book' }, left, mk('i', { class: 'ev-gutter', 'aria-hidden': 'true' }), right, mk('i', { class: 'ev-ribbon', 'aria-hidden': 'true' }), more);
    wrap.appendChild(book);
    // a long fable (four choices, or big text on a phone) scrolls inside its page: a small "More" tab says so while there is page below the fold
    let moreAcc = 0;
    const updateMore = () => safe(() => { book.classList.toggle('more', right.scrollHeight - right.clientHeight - right.scrollTop > 6); });
    right.addEventListener('scroll', updateMore);
    tickerAdd(S, (dt) => { moreAcc += dt; if (moreAcc > 0.25) { moreAcc = 0; updateMore(); } return false; });
    stagger(S, [left, right], { delay: 120, step: 140 });

    const showLeave = (label, fn) => {
      const b = UI.btn(label || 'Continue', { kind: 'primary', size: 'lg', breathe: true, onclick: fn || (() => leaveNode(S)) });
      b.classList.add('ev-go');
      outEl.appendChild(b);
      b.classList.add('rise');
      // keyboard and screen readers land on the way on (Enter or Space then press it); preventScroll so the page does not jump
      safe(() => { if (b.focus) b.focus({ preventScroll: true }); });
      // a long fable with a title on two lines, a card chip and a big font fills the page: bring the button into view instead of leaving it under the page edge
      UI.after(wait(80), () => { if (!S.dead) safe(() => { if (right.scrollHeight > right.clientHeight + 1) { if (isFn(right.scrollTo)) right.scrollTo({ top: right.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }); else right.scrollTop = right.scrollHeight; } }); });
      return b;
    };

    if (!ev) {
      textEl.textContent = 'Nothing here. The detour wandered off before you arrived.';
      outEl.hidden = false;
      showLeave('On we go');
      return;
    }

    const chosenAlready = node.chosen !== null && node.chosen !== undefined;
    const gains = mk('div', { class: 'ev-gains' });
    const addChips = (log) => {
      const chips = outcomeChips(log);
      chips.forEach((c) => gains.appendChild(c));
      stagger(S, chips, { delay: 60, step: 110 });
    };
    S.onResolved = addChips;

    // ---- the outcome page (after a choice, or when a saved page is reopened)
    function showOutcome(i, res) {
      const c = ev.choices[i];
      choicesEl.classList.add('done');
      // the choices are answered: none of them stays in the Tab order, and the ones that collapsed are hidden from screen readers too (the way on is the only control left)
      choicesEl.querySelectorAll('.ev-choice').forEach((b) => { b.tabIndex = -1; if (Number(b.dataset.i) === i) b.classList.add('picked'); else { b.classList.add('gone'); b.setAttribute('aria-hidden', 'true'); } });
      outEl.hidden = false;
      outEl.appendChild(mk('p', { class: 'ev-said', text: 'You chose: ' + (c ? c.label : '...') }));
      const outText = mk('p', { class: 'ev-result', tabindex: '-1' });
      outEl.appendChild(outText);
      outEl.appendChild(gains);
      const tw = typewriter(S, outText, res && res.text ? res.text : 'The tour has already moved on.', { cps: 70 });
      S.tw = tw; S.outTw = tw;                                                  // Enter or Space completes it, like the fable
      // a tap anywhere on the page (not on a button) finishes the outcome text at once, and the way on follows after a short beat instead of 2 to 4 seconds
      right.addEventListener('click', (e) => { if (!tw.done && !(e.target.closest && e.target.closest('button'))) { tw.skipped = true; tw.complete(); } });
      if (res && res.applied) addChips(res.applied);
      const finish = () => {
        if (S.dead) return;
        const go = () => {
          if (res && res.fight) {
            const b = showLeave('Fight!', () => { if (S.finishing) return; S.finishing = true; snd('page_turn'); GAME.enterNode(res.fight); });
            b.classList.add('ev-fight');
            UI.announce('A fight begins. Press Fight to draw your cards.');
          } else showLeave('Continue');
        };
        S.busy = true;
        resolvePending(S).then(() => { S.busy = false; go(); });
      };
      tw.then(() => UI.after(wait(tw.skipped ? 140 : 450), finish));
    }

    function choose(i) {
      if (S.busy || S.chose || chosenAlready) return;
      const b = choicesEl.querySelector('.ev-choice[data-i="' + i + '"]');
      if (!b) return;
      if (b.getAttribute('aria-disabled') === 'true') { UI.toast(b.rbReason || 'You cannot choose that.', 'warn'); return; }
      const res = RUN.eventChoose(R, ev, i);
      if (!res.ok) {
        UI.toast(typeof res.reason === 'string' && res.reason.length > 6 ? res.reason : 'That choice is closed.', 'warn');
        snd('ui_error'); UI.shake(b);
        return;
      }
      S.chose = true;
      snd('choice');
      const r = stageRect(b);
      burst(S, r.x + 40, r.cy, { kind: 'ink', n: 12, spread: 70 });
      if (S.chrome) S.chrome.sync(true);
      showOutcome(i, res);
    }

    // ---- the fable, then its choices
    const list = safe(() => RUN.eventChoices(R, ev), []) || [];
    let shownN = 0;       // the number on a choice (and its key) follows the VISIBLE order: a hero-only choice that is hidden leaves no gap (1 and 2, never 1 and 4)
    list.forEach((ch) => {
      if (ch.hidden) return;
      shownN += 1;
      const src = ev.choices[ch.index] || {};
      const hero = src.req && src.req.hero;
      const b = mk('button', { type: 'button', class: 'ev-choice' + (ch.ok ? '' : ' locked') + (hero ? ' hero' : ''), dataset: { i: ch.index }, 'aria-label': shownN + '. ' + ch.label + (ch.cost ? '. Cost: ' + ch.cost : '') + (ch.ok ? '' : '. Locked: ' + ch.reason) },
        mk('span', { class: 'ev-num' }, mk('b', { text: String(shownN) })),
        mk('span', { class: 'ev-body' },
          mk('b', { class: 'ev-label' }, hero ? UI.medallion(hero, 24) : null, mk('span', { text: ch.label })),
          ch.cost ? mk('em', { class: 'ev-cost', text: ch.cost }) : null,
          !ch.ok ? mk('em', { class: 'ev-lock', text: ch.reason || 'Not now' }) : null));
      if (!ch.ok) UI.setDisabled(b, true, ch.reason || 'Not now');
      b.addEventListener('click', () => choose(ch.index));
      choicesEl.appendChild(b);
    });
    const revealChoices = () => {
      if (S.dead || chosenAlready) return;
      choicesEl.classList.add('in');
      stagger(S, Array.from(choicesEl.querySelectorAll('.ev-choice')), { delay: 60, step: 120 });
      UI.announce(ev.title + '. ' + ev.text + ' ' + list.filter((c) => !c.hidden).length + ' choices.');
    };
    if (chosenAlready) {
      textEl.textContent = ev.text;
      textEl.classList.add('tw-done');
      showOutcome(node.chosen, null);
    } else {
      const tw = typewriter(S, textEl, ev.text, { cps: 58, delay: 350 });
      S.tw = tw;
      tw.then(revealChoices);
      textEl.addEventListener('click', () => tw.complete());
      right.addEventListener('click', (e) => { if (!tw.done && !(e.target.closest && e.target.closest('button'))) tw.complete(); });
    }
    S.keys = (e) => {
      if (S.dead || UI.overlay.count()) return false;
      const onBtn = !!(e.target && e.target.closest && e.target.closest('button'));
      if (S.tw && !S.tw.done && (e.key === 'Enter' || e.key === ' ')) { if (S.tw === S.outTw) S.tw.skipped = true; S.tw.complete(); return true; }
      // the way on (Continue, Fight!) by keyboard when focus is not already on a button (a focused button activates itself)
      if ((e.key === 'Enter' || e.key === ' ') && !onBtn) { const go = outEl.querySelector('.ev-go'); if (go) { e.preventDefault(); go.click(); return true; } }
      // digits pick the n-th VISIBLE choice, and only once the choices have appeared: before that they are invisible and must not be committed blind
      if (/^[1-9]$/.test(e.key) && !S.chose && choicesEl.classList.contains('in')) {
        const b = choicesEl.querySelectorAll('.ev-choice')[Number(e.key) - 1];
        if (b) { choose(Number(b.dataset.i)); return true; }
      }
      return false;
    };
  }

  // ==================================================================================================================
  // screen: camp
  // ==================================================================================================================
  const CAMP_ACTIONS = [
    { id: 'rest', name: 'Rest', verb: 'Put your feet up' },
    { id: 'sharpen', name: 'Rehearse', verb: 'Upgrade a card' },
    { id: 'gems', name: 'Set Gems', verb: 'Set gems in cards' },
    { id: 'meditate', name: 'Warm Up', verb: 'Vox and a Spell' },
  ];
  const campMax = (R) => Math.min(3, Math.max(1, (mods(R).campActions || 1) + ((R.flags && R.flags.extraCampActions) | 0)));

  // exactly what Rest will heal (the same formula RUN.campAction uses)
  function restPreview(R) {
    const m = mods(R).healMul === undefined ? 1 : mods(R).healMul;
    return R.heroes.map((h) => {
      const gain = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * DATA.ECONOMY.camp.restPct * m)) - h.hp;
      return { id: h.id, gain, from: h.hp, to: h.hp + gain, max: h.maxHp };
    });
  }

  function enterCamp(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'camp' ? S.node : { kind: 'camp', used: [] };
    if (!node.used) node.used = [];
    S.campNode = node;
    S.paint = paintCamp;
    S.pose = null;
    const wrap = mk('div', { class: 'nk-wrap cp-wrap' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);
    wrap.appendChild(bannerEl('The ' + DATA.tiles.camp.name, 'Five minutes backstage. Use them well.', 'cp-titlebox'));

    const meter = mk('div', { class: 'cp-meter', role: 'status' });
    const grid = mk('div', { class: 'cp-grid', role: 'group', 'aria-label': 'Green room actions' });
    const tiles = {};
    const leave = UI.btn('Back on the road', { kind: 'primary', size: 'lg', onclick: () => onLeave() });
    leave.classList.add('cp-leave');
    wrap.appendChild(grid);
    wrap.appendChild(mk('div', { class: 'cp-foot' }, meter, leave));

    const remaining = () => Math.max(0, campMax(R) - node.used.length);
    const usedNow = (id) => node.used.indexOf(id) >= 0;
    const upCount = () => RUN.upgradable(R).length;

    // per action: {lines, disabled reason, state}
    function info(id) {
      const rem = remaining();
      if (id === 'gems') {
        const cutting = usedNow('gems');
        if (!R.gems.length) return { lines: ['No gems in the pouch.', 'Gift boxes, sparkle booths and merch stalls carry them.'], off: 'You carry no gems to set.', state: cutting ? 'used' : '' };
        if (!canCutAny(R)) return { lines: [U.plural(R.gems.length, 'gem') + ' in the pouch.', 'No socket fits them yet.'], off: 'No card has a socket for those gems.', state: cutting ? 'used' : '' };
        if (!cutting && rem <= 0) return { lines: [U.plural(R.gems.length, 'gem') + ' in the pouch.'], off: 'The break is over: no actions left.', state: 'locked' };
        return { lines: [U.plural(R.gems.length, 'gem') + ' in the pouch.', cutting ? 'Set more: still open this visit.' : 'Set or replace gems, as many as you like.'], state: cutting ? 'again' : '' };
      }
      if (usedNow(id)) return { lines: ['Done for this visit.'], off: 'Already used this visit.', state: 'used' };
      if (rem <= 0) return { lines: [{ rest: 'Heals both heroes.', sharpen: 'Upgrade one card.', meditate: 'Gain Vox and a Spell.' }[id]], off: 'The break is over: no actions left.', state: 'locked' };
      if (id === 'rest') {
        const pv = restPreview(R);
        const total = U.sum(pv, (x) => x.gain);
        return { lines: total ? pv.map((x) => heroName(x.id) + ' +' + x.gain + ' HP (' + x.to + '/' + x.max + ')') : ['Both heroes are already unhurt.'], state: '' };
      }
      if (id === 'sharpen') {
        const n = upCount();
        return n ? { lines: [U.plural(n, 'card') + ' can be rehearsed.', 'Pick one; it gains its upgrade.'], state: '' } : { lines: ['Every card is already rehearsed.'], off: 'Nothing left to rehearse.', state: '' };
      }
      const gain = Math.max(0, Math.min(R.inkMax - R.ink, DATA.ECONOMY.campInk));
      return { lines: [gain ? '+' + gain + ' Vox (' + R.ink + ' to ' + (R.ink + gain) + ')' : 'Vox is already full.', '+ one random Spell'], state: '' };
    }

    CAMP_ACTIONS.forEach((a, i) => {
      const art = liveCanvas(S, 224, 104, (g, t, w, h) => campIcon(g, a.id, t, w, h, S), 'cp-art');
      const lines = mk('span', { class: 'cp-lines' });
      const badge = mk('i', { class: 'cp-badge', 'aria-hidden': 'true' });
      const b = mk('button', { type: 'button', class: 'cp-tile a-' + a.id, dataset: { action: a.id } },
        mk('span', { class: 'cp-illus' }, art), badge, mk('b', { class: 'cp-name', text: a.name }), mk('span', { class: 'cp-verb', text: a.verb }), lines);   // the stamp rides on the tile, not in the plate: the plate can be a thin strip and would clip it
      b.classList.add('rise'); b.style.setProperty('--i', String(i + 1));
      b.addEventListener('click', () => doAction(a.id));
      tiles[a.id] = { b, lines, badge };
      grid.appendChild(b);
    });

    function sync() {
      CAMP_ACTIONS.forEach((a) => {
        const t = tiles[a.id], inf = info(a.id);
        t.lines.textContent = '';
        inf.lines.forEach((l) => t.lines.appendChild(mk('span', { class: 'cp-line', text: l })));
        t.b.classList.toggle('used', inf.state === 'used');
        t.b.classList.toggle('locked', inf.state === 'locked');
        t.b.classList.toggle('again', inf.state === 'again');
        t.badge.textContent = inf.state === 'used' ? 'DONE' : inf.state === 'again' ? 'OPEN' : inf.state === 'locked' ? 'CLOSED' : '';
        UI.setDisabled(t.b, !!inf.off, inf.off);
        t.b.setAttribute('aria-label', a.name + '. ' + a.verb + '. ' + inf.lines.join(' ') + (inf.off ? ' Unavailable: ' + inf.off : ''));
      });
      const rem = remaining(), max = campMax(R);
      meter.textContent = '';
      for (let k = 0; k < max; k++) meter.appendChild(mk('i', { class: 'cp-flame' + (k < rem ? ' lit' : ''), 'aria-hidden': 'true' }));
      meter.appendChild(mk('span', { class: 'cp-meter-txt', text: rem ? U.plural(rem, 'action') + ' left in the green room' : 'The break is over' }));
      leave.classList.toggle('breathe', rem === 0 || node.used.length > 0);
      if (S.chrome) S.chrome.sync(false);
    }
    S.sync = sync;

    const poseHeroes = (name, ms) => { S.pose = { name, t0: S.t, until: S.t + (ms || 1400) / 1000 }; };

    async function doAction(id) {
      if (S.busy) return;
      const t = tiles[id];
      const inf = info(id);
      if (inf.off) { UI.toast(inf.off, 'warn'); snd('ui_error'); UI.shake(t.b); return; }
      S.busy = true;
      try {
        if (id === 'rest') {
          const res = RUN.campAction(R, 'rest');
          if (!res.ok) { UI.toast('The green room is not ready for you.', 'warn'); return; }
          snd('rest'); snd('heal');
          poseHeroes('cheer', 1800);
          (res.healed || []).forEach((h, k) => {
            const p = campHeroPos(k);
            if (h.n) UI.floatText(p.x, p.y - 250, '+' + h.n, 'heal');
            burst(S, p.x, p.y - 120, { kind: 'jade', n: 12, spread: 80 });
            const bd = S.chrome.badgeOf(h.id); if (bd) UI.pulse(bd);
          });
          (res.log || []).forEach((l) => { if (l && l.text) UI.toast(l.text, 'good'); });
          sync();
          if (R.pending && R.pending.length) await resolvePending(S);
        } else if (id === 'meditate') {
          const res = RUN.campAction(R, 'meditate');
          if (!res.ok) { UI.toast('Your voice will not warm up right now.', 'warn'); return; }
          snd('ink_gain'); snd('brush_pick');
          poseHeroes('cast', 1800);
          const p = campFirePos();
          burst(S, p.x, p.y - 160, { kind: 'ink', n: 20, spread: 120 });
          ripple(S, p.x, p.y - 100, 'ink');
          UI.toast((res.ink ? '+' + res.ink + ' Vox' : 'Vox is full') + (res.brush && DATA.brushes[res.brush] ? ' and ' + DATA.brushes[res.brush].name : ''), 'good');
          sync();
          if (S.chrome) S.chrome.sync(true);
        } else if (id === 'sharpen') {
          const uid = await UI.overlay.open('deck', { mode: 'upgrade', title: 'Rehearse a Card', confirm: 'Rehearse it backstage', note: 'One more take. The card comes back sharper.' });
          if (!S.alive() || uid === null || uid === undefined) return;
          const res = RUN.campAction(R, 'sharpen', uid);
          if (!res.ok) { UI.toast('That card cannot be rehearsed.', 'warn'); snd('ui_error'); return; }
          snd('forge_hit'); snd('upgrade');
          poseHeroes('attack', 1200);
          const p = campFirePos();
          burst(S, p.x, p.y - 90, { kind: 'gold', n: 26, spread: 150 });
          ripple(S, p.x, p.y - 90, 'gold');
          showCardFlourish(S, R.deck.find((c) => c.uid === uid));
          sync();
          if (S.chrome) S.chrome.sync(true);
          if (R.pending && R.pending.length) await resolvePending(S);
        } else if (id === 'gems') {
          const gate = RUN.campAction(R, 'gems');
          if (!gate.ok) { UI.toast(SOCKET_WHY[gate.reason] || 'The gems will not come out.', 'warn'); return; }
          poseHeroes('cast', 1200);
          await UI.overlay.open('deck', { mode: 'socket', title: 'Set Gems', onSocket: (uid, slot, gem) => RUN.campAction(R, 'gems', { uid, slot, gem }) });
          if (S.alive()) { sync(); if (S.chrome) S.chrome.sync(false); }
        }
      } finally { S.busy = false; }
    }

    let armed = false;
    function onLeave() {
      if (S.busy) return;
      if (!node.used.length && remaining() > 0 && !armed) {
        armed = true;
        leave.rbSet({ label: 'Leave without a break?' });
        leave.classList.add('nudge');
        snd('ui_toggle');
        later(S, 2800, () => { armed = false; leave.rbSet({ label: 'Back on the road' }); leave.classList.remove('nudge'); });
        return;
      }
      leaveNode(S);
    }
    sync();
    UI.announce('The green room. ' + U.plural(remaining(), 'action') + ' available.');
    S.keys = (e) => {
      if (S.dead || UI.overlay.count()) return false;
      const a = CAMP_ACTIONS[Number(e.key) - 1];
      if (a) { doAction(a.id); return true; }
      return false;
    };
  }

  // a sharpened card shown big for a beat, with sparkle, then it fades
  function showCardFlourish(S, inst, label) {
    if (!inst || S.dead) return;
    const big = UI.card(inst, { size: 'reward', showGems: true });
    big.classList.add('nk-flourish-card');
    const box = mk('div', { class: 'nk-flourish', 'aria-hidden': 'true' }, big, mk('span', { class: 'nk-flourish-lab', text: label || 'Rehearsed!' }));
    S.root.appendChild(box);
    later(S, 1900, () => { box.classList.add('out'); later(S, 420, () => box.remove()); });
  }

  // ==================================================================================================================
  // screen: forge (the Inkstone Forge: one upgrade, or gem cutting)
  // ==================================================================================================================
  function enterForge(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'forge' ? S.node : { kind: 'forge', used: null };
    S.forgeNode = node;
    S.paint = paintForge;
    S.strike = null;
    const wrap = mk('div', { class: 'nk-wrap fg-wrap' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);
    wrap.appendChild(bannerEl('The ' + DATA.tiles.forge.name, 'One great take, or a jeweller\'s patience. Not both.', 'fg-titlebox'));

    const modes = mk('div', { class: 'fg-modes', role: 'group', 'aria-label': 'Studio actions' });
    const mode = (id, name, text, kind) => {
      const art = liveCanvas(S, 260, 130, (g, t, w, h) => forgeIcon(g, kind, t, w, h), 'fg-art');
      const b = mk('button', { type: 'button', class: 'fg-mode m-' + kind, dataset: { action: kind } }, mk('span', { class: 'fg-illus' }, art), mk('b', { class: 'fg-name', text: name }), mk('span', { class: 'fg-text', text }));
      return b;
    };
    const upBtn = mode('up', 'Rehearse a Card', 'Bring one card to the mic. One take, one upgrade.', 'up');
    const gemBtn = mode('gem', 'Set Gems', 'Set or replace gems as often as you like.', 'gem');
    upBtn.addEventListener('click', () => chooseUpgrade());
    gemBtn.addEventListener('click', () => chooseGems());
    modes.appendChild(upBtn); modes.appendChild(gemBtn);
    upBtn.classList.add('rise'); gemBtn.classList.add('rise'); gemBtn.style.setProperty('--i', '1');
    wrap.appendChild(modes);
    const stageEl = mk('div', { class: 'fg-stage', hidden: true });
    const result = mk('p', { class: 'fg-result', role: 'status' });
    wrap.appendChild(stageEl);
    wrap.appendChild(result);
    const leave = UI.btn('Leave the studio', { kind: 'primary', size: 'lg', onclick: () => leaveNode(S) });
    leave.classList.add('fg-leave');
    wrap.appendChild(mk('div', { class: 'fg-foot' }, leave));

    function refreshModes() {
      const used = node.used;
      const ups = RUN.upgradable(R).length;
      const upOff = used === 'gems' ? 'You chose gem setting. One upgrade or gems, not both.' : used ? 'The studio has done its work today.' : !ups ? 'Nothing left to rehearse.' : '';
      UI.setDisabled(upBtn, !!upOff, upOff);
      const gemOff = used === 'upgrade' ? 'One upgrade or gem setting, not both.' : !R.gems.length ? 'You carry no gems to set.' : !canCutAny(R) ? 'No card has a socket for those gems.' : '';
      UI.setDisabled(gemBtn, !!gemOff, gemOff);
      upBtn.classList.toggle('dim', !!upOff); gemBtn.classList.toggle('dim', !!gemOff);
      upBtn.querySelector('.fg-text').textContent = upOff && ups ? upOff : !ups && !used ? 'Every card is already rehearsed.' : 'Bring one card to the mic. One take, one upgrade.';
      gemBtn.querySelector('.fg-text').textContent = gemOff ? gemOff : used === 'gems' ? 'The gems are setting. Keep going, or leave.' : 'Set or replace gems as often as you like.';
      if (used === 'upgrade' && !S.phase) result.textContent = 'The ON AIR light is off. Its work is done.';
      S.chrome.sync(false);
    }
    S.refreshModes = refreshModes;

    async function chooseUpgrade() {
      if (S.busy) return;
      if (upBtn.getAttribute('aria-disabled') === 'true') { UI.toast(upBtn.rbReason || 'Not now.', 'warn'); return; }
      S.busy = true;
      const uid = await UI.overlay.open('deck', { mode: 'upgrade', title: 'Choose a Card for the Mic', confirm: 'Bring it to the mic', note: 'One take. The card comes back sharper.' });
      S.busy = false;
      if (!S.alive() || uid === null || uid === undefined) return;
      showPreview(uid);
    }

    function showPreview(uid) {
      const inst = R.deck.find((c) => c.uid === uid);
      if (!inst) return;
      S.phase = 'ready';
      S.chosen = uid;
      modes.classList.add('away');
      stageEl.hidden = false;
      stageEl.textContent = '';
      const before = UI.card(inst, { size: 'hand', showGems: true });
      const after = UI.card(Object.assign({}, inst, { up: 1 }), { size: 'hand', showGems: true });
      before.classList.add('fg-before'); after.classList.add('fg-after');
      const go = UI.btn('Hit it!', { kind: 'primary', size: 'lg', breathe: true, onclick: () => strike() });
      go.classList.add('fg-strike');
      const other = UI.btn('Choose another', { kind: 'ghost', size: 'sm', onclick: () => { if (S.busy) return; stageEl.hidden = true; modes.classList.remove('away'); S.phase = null; S.chosen = null; result.textContent = ''; chooseUpgrade(); } });
      stageEl.appendChild(mk('div', { class: 'fg-ba' },
        mk('div', { class: 'fg-side before' }, mk('span', { class: 'dk-label', text: 'Before' }), before),
        mk('div', { class: 'fg-mid' }, mk('i', { class: 'dk-arrow', 'aria-hidden': 'true' }), go, other),
        mk('div', { class: 'fg-side after' }, mk('span', { class: 'dk-label', text: 'After' }), after)));
      result.textContent = 'Hit it and the card comes back rehearsed.';
      snd('card_pick');
    }

    function strike() {
      if (S.busy || S.phase !== 'ready') return;
      S.busy = true;
      S.strike = { t0: S.t, hits: 0 };
      const uid = S.chosen;
      snd('forge_hit');
      // the hammer lands three times (190, 520 and 840 ms): sparks fly off the anvil each time, and the page shakes on the first
      [[0, 22, 150], [330, 10, 90], [650, 10, 90]].forEach((h, k) => UI.after(wait(190 + h[0]), () => {
        if (!S.alive()) return;
        burst(S, FORGE.hit.x, FORGE.hit.y - 6, { kind: 'ember', n: h[1], spread: h[2], lift: 110 });
        if (k) snd('forge_hit'); else UI.shake(S.root.querySelector('.fg-wrap'));
      }));
      UI.after(wait(190), () => {
        if (!S.alive()) return;
        const res = RUN.forgeAction(R, 'upgrade', uid);
        if (!res.ok) { S.busy = false; UI.toast(SOCKET_WHY[res.reason] || 'The take is fine, but nothing changes.', 'warn'); snd('ui_error'); return; }
        S.phase = 'done'; S.flashT = S.t;
        snd('upgrade');
        const ar = stageRect(stageEl.querySelector('.fg-after')), br = stageRect(stageEl.querySelector('.fg-before'));
        burst(S, ar.cx, ar.cy, { kind: 'gold', n: 30, spread: 170 });
        burst(S, br.cx, br.cy, { kind: 'ember', n: 16, spread: 100 });
        ripple(S, ar.cx, ar.cy, 'gold');
        stageEl.classList.add('struck');
        const inst = R.deck.find((c) => c.uid === uid);
        result.textContent = (inst ? cardName(inst.id) : 'The card') + ' is rehearsed.';
        UI.announce(result.textContent);
        const mid = stageEl.querySelector('.fg-mid');
        if (mid) mid.classList.add('gone');
        node.used = 'upgrade';
        refreshModes();
        S.busy = false;
        leave.classList.add('breathe');
        UI.shake(S.root.querySelector('.fg-ba'));
      });
    }

    async function chooseGems() {
      if (S.busy) return;
      if (gemBtn.getAttribute('aria-disabled') === 'true') { UI.toast(gemBtn.rbReason || 'Not now.', 'warn'); return; }
      const gate = RUN.forgeAction(R, 'gems');
      if (!gate.ok) { UI.toast(SOCKET_WHY[gate.reason] || 'Not now.', 'warn'); return; }
      S.busy = true;
      await UI.overlay.open('deck', { mode: 'socket', title: 'Set Gems at the Studio', onSocket: (uid, slot, gem) => RUN.forgeAction(R, 'gems', { uid, slot, gem }) });
      S.busy = false;
      if (!S.alive()) return;
      if (node.used === 'gems') { result.textContent = 'The gems are set. Set more, or leave.'; leave.classList.add('breathe'); }
      refreshModes();
    }

    S.phase = null;
    refreshModes();
    UI.announce('The ' + DATA.tiles.forge.name + '. Rehearse one card, or set gems.');
    S.keys = (e) => {
      if (S.dead || UI.overlay.count()) return false;
      if (e.key === '1') { chooseUpgrade(); return true; }
      if (e.key === '2') { chooseGems(); return true; }
      return false;
    };
  }

  // ==================================================================================================================
  // screen: chest
  // ==================================================================================================================
  function enterChest(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'chest' ? S.node : { kind: 'chest', loot: { gold: 0, relic: null, gems: [] }, taken: true };
    const loot = node.loot || { gold: 0, relic: null, gems: [] };
    S.paint = paintChest;
    S.chest = { state: node.taken ? 'open' : 'closed', t0: -10 };
    const wrap = mk('div', { class: 'nk-wrap ch-wrap' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);
    wrap.appendChild(bannerEl('A Gift Box', node.taken ? 'Already opened. Only ribbon remains.' : 'It has waited a long time for someone curious.', 'ch-titlebox'));
    const stage = mk('div', { class: 'ch-stage' });
    const hit = mk('button', { type: 'button', class: 'ch-hit', 'aria-label': 'Open the gift' });
    const openBtn = UI.btn('Open the gift', { kind: 'primary', size: 'lg', breathe: true, onclick: () => open() });
    openBtn.classList.add('ch-open');
    const foot = mk('div', { class: 'ch-foot' }, openBtn);
    wrap.appendChild(stage);
    wrap.appendChild(hit);
    wrap.appendChild(foot);
    hit.addEventListener('click', () => open());

    let selGem = null;
    const leaveBtn = UI.btn('Leave', { kind: 'primary', size: 'lg', breathe: true, onclick: () => leaveNode(S) });

    function showDone(text) {
      stage.textContent = '';
      stage.appendChild(mk('div', { class: 'ch-done rise' }, mk('p', { text })));
      foot.textContent = '';
      foot.appendChild(leaveBtn);
    }

    function open() {
      if (S.chest.state !== 'closed' || S.busy) return;
      S.chest.state = 'opening'; S.chest.t0 = S.t;
      hit.hidden = true; openBtn.hidden = true;
      snd('chest_open');
      UI.after(wait(950), () => { if (!S.alive()) return; S.chest.state = 'open'; snd('gold'); showLoot(); });
    }

    function take(choice) {
      if (S.busy) return;
      S.busy = true;
      const res = RUN.take(R, node, choice);
      if (!res.ok) {
        S.busy = false;
        UI.toast(res.reason === 'taken' ? 'That was already taken.' : 'The gift box will not give that up.', 'warn'); snd('ui_error');
        return;
      }
      snd('buy'); if (res.relic) snd('relic_get'); if (res.gem) snd('gem_get');
      const r = { x: 640, y: 340 };
      burst(S, r.x, r.y, { kind: 'gold', n: 30, spread: 170 });
      ripple(S, r.x, r.y, 'gold');
      S.chrome.sync(true);
      if (res.relic) UI.pulse(S.chrome.el.querySelector('.nk-relbtn'));
      const parts = [];
      if (res.gold) parts.push(res.gold + ' gold');
      if (res.relic) parts.push(relicName(res.relic));
      if (res.gem) parts.push(gemName(res.gem));
      (res.log || []).forEach((l) => { if (l && l.text && l.op !== 'relic') UI.toast(l.text, 'good'); });
      showDone(parts.length ? 'You take ' + parts.join(', ') + '.' : 'The gift box is empty.');
      UI.announce('You take ' + parts.join(', ') + '.');
      resolvePending(S).then(() => { S.busy = false; if (S.alive()) S.chrome.sync(false); });
    }

    function showLoot() {
      stage.textContent = '';
      const goldRow = ledgerRow(UI.icon('stat', 'gold', 42), 'Gold', '+0', { kind: 'gold' });
      const box = mk('div', { class: 'ch-loot' }, goldRow);
      stage.appendChild(box);
      goldRow.classList.add('rise');
      countUp(S, goldRow.rbVal, loot.gold || 0, { fmt: (n) => '+' + n, tick: 'gold', ms: 800 });
      foot.textContent = '';
      if (loot.relic) {
        const id = loot.relic;
        const take1 = mk('button', { type: 'button', class: 'rw-relic ch-relic', 'aria-label': 'Take ' + relicName(id) }, ...relicBody(id, 96));
        take1.addEventListener('click', () => take({ relic: true }));
        box.appendChild(take1);
        take1.classList.add('rise'); take1.style.setProperty('--i', '2');
        foot.appendChild(UI.btn('Just the gold', { kind: 'ghost', size: 'lg', onclick: () => take({ relic: false }) }));
        foot.appendChild(UI.btn('Take the charm', { kind: 'primary', size: 'lg', breathe: true, onclick: () => take({ relic: true }) }));
      } else if ((loot.gems || []).length) {
        const gr = mk('div', { class: 'ch-gems', role: 'group', 'aria-label': 'Choose a gem' });
        const takeGem = UI.btn('Take the gem', { kind: 'primary', size: 'lg', breathe: true, disabled: true, reason: 'Choose one of the gems first', onclick: () => take({ gem: selGem }) });
        loot.gems.forEach((id, i) => {
          const g = DATA.gems[id] || {};
          const b = mk('button', { type: 'button', class: 'ch-gem gc-' + (g.color || 'gold'), dataset: { gem: id }, 'aria-pressed': 'false', 'aria-label': gemName(id) + ', tier ' + (g.tier || 1) + '. ' + gemLine(id) },
            mk('span', { class: 'ch-gem-ico' }, UI.icon('gem', id, 84)), mk('b', { class: 'ch-gem-name', text: gemName(id) }), mk('span', { class: 'ch-gem-tier', text: 'Tier ' + (g.tier || 1) + ' ' + colourWord(g.color || 'gold') + ' gem' }), mk('span', { class: 'ch-gem-text', text: gemLine(id) }));
          b.classList.add('rise'); b.style.setProperty('--i', String(i + 1));
          b.addEventListener('click', () => {
            selGem = id;
            gr.querySelectorAll('.ch-gem').forEach((el) => { const on = el === b; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            takeGem.rbSet({ disabled: false });
            const r = stageRect(b); burst(S, r.cx, r.cy - 20, { kind: gemColorOf(id), n: 12, spread: 70 });
          });
          gr.appendChild(b);
        });
        box.appendChild(gr);
        foot.appendChild(takeGem);
      } else {
        foot.appendChild(UI.btn('Take the gold', { kind: 'primary', size: 'lg', breathe: true, onclick: () => take({}) }));
      }
    }

    if (node.taken) {
      hit.hidden = true; openBtn.hidden = true;
      showDone('The gift box is empty. Whatever it held is yours now.');
    }
    UI.announce(node.taken ? 'An empty gift box.' : 'A gift box. Open it.');
    S.keys = (e) => { if (S.dead || UI.overlay.count()) return false; if ((e.key === 'Enter' || e.key === ' ') && S.chest.state === 'closed' && !(e.target && e.target.closest && e.target.closest('button'))) { open(); return true; } return false; };
  }

  // ==================================================================================================================
  // screen: gemcache (choose one of three gems, then optionally set it)
  // ==================================================================================================================
  // The ONE table that places the gems: the painted plinths and glows (cacheBackdrop, paintCache) and the DOM gem columns (enterGemCache sets --gx0, --gp,
  // --gcw, --gtop, --gh and --gy from it) all read this, so a gem can never drift off its plinth. The plinth centres are x0, x0 + pitch, x0 + 2 pitch
  // (320, 640, 960); a column is the pitch minus a 20 px gutter wide; its bottom edge sits on the plinth's rim (plinthY + 20) and its gem icon rests
  // 8 px above that; glowY is the gem's resting centre, where the painted light and the DOM halo are both centred.
  const CACHE = { x0: 320, pitch: 320, colW: 300, top: 172, plinthY: 548, glowY: 497 };
  const cacheX = (i) => CACHE.x0 + i * CACHE.pitch;
  const cacheH = () => CACHE.plinthY + 20 - CACHE.top;

  const fitsOf = (R, id) => {
    const c = gemColorOf(id);
    let open = 0, any = 0;
    R.deck.forEach((inst) => { const s = slotsOf(inst); if (s.some((x, i) => slotFits(x, id) && inst.gems[i] !== id)) any += 1; if (s.some((x, i) => slotFits(x, id) && !inst.gems[i])) open += 1; });
    return { open, any, color: c };
  };

  function enterGemCache(S, params, root) {
    const R = S.R;
    const node = S.node && S.node.kind === 'gemcache' ? S.node : { kind: 'gemcache', offers: [], taken: true };
    const offers = node.offers || [];
    S.paint = paintCache;
    const wrap = mk('div', { class: 'nk-wrap gc-wrap' });
    root.appendChild(wrap);
    fxLayer(S);
    chrome(S);
    wrap.appendChild(S.chrome.el);
    root.appendChild(S.chrome.menu);
    wrap.appendChild(bannerEl('The ' + DATA.tiles.gemcache.name, node.taken ? 'The booth is empty now.' : 'Three gems sparkle on the counter. Only one will come with you.', 'gc-titlebox'));
    const row = mk('div', { class: 'gc-row', role: 'group', 'aria-label': 'Gems on offer' });
    UI.vars(row, { '--gx0': CACHE.x0 + 'px', '--gp': CACHE.pitch + 'px', '--gcw': CACHE.colW + 'px', '--gtop': CACHE.top + 'px', '--gh': cacheH() + 'px', '--gy': (CACHE.glowY - CACHE.top) + 'px' });
    // the status line and the buttons share one footer that grows upward, so the line can never sit on the buttons (they are 44 css px tall on a phone, taller at text 1.3)
    const detail = mk('div', { class: 'gc-detail', role: 'status' });
    const btns = mk('div', { class: 'gc-btns' });
    const foot = mk('div', { class: 'gc-foot' }, detail, btns);
    wrap.appendChild(row); wrap.appendChild(foot);
    let sel = null;
    const takeBtn = UI.btn('Take this gem', { kind: 'primary', size: 'lg', breathe: true, disabled: true, reason: 'Choose one of the gems first', onclick: () => take() });
    const contBtn = UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, onclick: () => leaveNode(S) });

    function showDetail(id) {
      detail.textContent = '';
      if (!id) { detail.appendChild(mk('p', { class: 'gc-hint', text: 'Tap a gem to weigh it. You may keep only one.' })); return; }
      const f = fitsOf(R, id);
      detail.appendChild(mk('p', { class: 'gc-ifit gc-' + gemColorOf(id), text: f.any ? gemName(id) + ' fits ' + U.plural(f.any, 'card') + ' in your deck' + (f.open ? ' (' + f.open + ' with an open socket).' : ', but every socket is taken: it would replace a gem.') : 'No card in your deck has a ' + colourWord(f.color) + ' or rainbow socket yet.' }));
    }

    function pick(id, b) {
      if (S.busy || node.taken || S.tookId) return;
      sel = id;
      row.querySelectorAll('.gc-gem').forEach((el) => { const on = el === b; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      takeBtn.rbSet({ disabled: false });
      showDetail(id);
      const r = stageRect(b);
      burst(S, r.cx, r.cy - 30, { kind: gemColorOf(id), n: 14, spread: 80 });
      snd('gem_get');
    }

    function take() {
      if (S.busy || !sel || S.tookId) return;
      const id = sel;
      const res = RUN.take(R, node, { gem: id });
      if (!res.ok) { UI.toast(res.reason === 'taken' ? 'That was already taken.' : 'The booth will not give it up.', 'warn'); snd('ui_error'); return; }
      S.tookId = id;
      snd('gem_get'); snd('buy');
      const el = row.querySelector('.gc-gem[data-gem="' + id + '"]');
      row.querySelectorAll('.gc-gem').forEach((o) => { if (o !== el) o.classList.add('gone'); });
      if (el) { el.classList.add('took'); const r = stageRect(el); burst(S, r.cx, r.cy, { kind: gemColorOf(id), n: 30, spread: 160 }); ripple(S, r.cx, r.cy, gemColorOf(id)); }
      S.chrome.sync(true);
      detail.textContent = '';
      detail.appendChild(mk('p', { class: 'gc-took', text: gemName(id) + ' is in your pouch.' }));
      btns.textContent = '';
      const can = canCutAny(R) && R.gems.indexOf(id) >= 0 && fitsOf(R, id).any > 0;
      const sock = UI.btn('Set it in a card now', { kind: 'secondary', size: 'lg', disabled: !can, reason: 'No card has a socket that fits it yet', onclick: () => {
        if (S.busy) return;
        S.busy = true;
        UI.overlay.open('deck', { mode: 'socket', gem: id, title: 'Set ' + gemName(id) }).then(() => { S.busy = false; if (S.alive()) { S.chrome.sync(false); sock.rbSet({ disabled: R.gems.indexOf(id) < 0 || !canCutAny(R), reason: 'Nothing left to set' }); } });
      } });
      btns.appendChild(sock); btns.appendChild(contBtn);
      UI.announce(gemName(id) + ' is in your pouch.');
      resolvePending(S);
    }

    (node.taken ? [] : offers).forEach((id, i) => {
      const g = DATA.gems[id] || {};
      const b = mk('button', { type: 'button', class: 'gc-gem gc-' + (g.color || 'gold'), dataset: { gem: id }, 'aria-pressed': 'false', 'aria-label': gemName(id) + ', tier ' + (g.tier || 1) + '. ' + gemLine(id) },
        mk('i', { class: 'gc-halo', 'aria-hidden': 'true' }), mk('span', { class: 'gc-ico' }, UI.icon('gem', id, 118)), mk('b', { class: 'gc-name', text: gemName(id) }),
        mk('span', { class: 'gc-tier' }, ...U.range(g.tier || 1).map(() => mk('i', { class: 'pip' })), mk('em', { text: g.color ? cap(colourWord(g.color)) : '' })), mk('span', { class: 'gc-text', text: gemLine(id) }), mk('span', { class: 'gc-fit', text: fitsOf(R, id).any ? 'Fits ' + U.plural(fitsOf(R, id).any, 'card') : 'Fits no card yet' }));
      b.classList.add('rise'); b.style.setProperty('--i', String(i + 1));
      b.addEventListener('click', () => pick(id, b));
      row.appendChild(b);
    });
    if (node.taken || !offers.length) {
      row.appendChild(mk('p', { class: 'gc-none', text: node.taken ? 'You already took a gem from this booth.' : 'The booth holds nothing you can use.' }));
      btns.appendChild(contBtn);
    } else {
      btns.appendChild(takeBtn);
      showDetail(null);
    }
    UI.announce(node.taken ? 'An empty booth.' : 'A sparkle booth. Choose one of three gems.');
    S.keys = (e) => {
      if (S.dead || UI.overlay.count() || node.taken || S.tookId) return false;
      const b = /^[1-3]$/.test(e.key) ? row.querySelectorAll('.gc-gem')[Number(e.key) - 1] : null;
      if (b) { pick(b.dataset.gem, b); return true; }
      return false;
    };
  }

  // ==================================================================================================================
  // painters. Every page paints its own stage on #view: cached backdrop layers (ART.sprite) plus a few animated things.
  // They only ever read the art toolkit, never a clock: t is the frame clock in seconds.
  // The look is the chibi house style (HV_ART_AUDIO 1 and 3.4): the warm brown line, flat cel colour with ONE hard shadow from the upper right, candy
  // colours on the deep indigo night, sparkles and small notes as the magic. Every painter falls back to plain canvas when ART.rj or the toolkit is missing.
  // Tests record these painters (tests/hocus_vocus_screen_node.test.mjs, "alignment"): the plinths, glows and floor shadows of the Sparkle Booth, the two posts and
  // planks of the Merch Stall, Jordan's translate, the Studio's first rotate (the drumstick) and its single clip, and the lit pool of the goodie table are pinned.
  // ==================================================================================================================
  const rgba = (hex, a) => U.color.rgba(hex, a);
  const INK = '#2d170f';                      // the chibi line: a warm near-black brown (the kit's RJ.C.ink)
  const HV = {
    pink: '#ff7eb6', pinkL: '#ffc2dc', pinkD: '#c93f78', green: '#3fcf6a', greenD: '#1f7a3a', lime: '#c6ff3d', violet: '#a77bff', orange: '#ff9a2e',
    teal: '#2ec4b6', tealD: '#0d4f4a', tealL: '#e6fffb', cream: '#fff4e6', cream2: '#fff8ec', gold: '#ffd84d', red: '#c8264f', redD: '#8f1838', sky: '#7cc6ff', peach: '#ffb38a', bulb: '#fff4d6',
  };
  const motionK = () => (UI.opt && UI.opt.reduceMotion ? 0.3 : 1);
  const rjk = () => (typeof ART !== 'undefined' && ART && ART.rj) || null;
  const warm = (hex, dl) => { const rj = rjk(); return rj && isFn(rj.shade) ? rj.shade(hex, dl) : hex; };
  const R4 = (x, y, w, h) => ({ poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
  const RR = (x, y, w, h, r) => { const tk = TK(); return tk && isFn(tk.rrectPts) ? tk.rrectPts(x, y, w, h, r) : R4(x, y, w, h); };
  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // a cel-shaded polygon or smooth shape: the kit's house defaults (warm brown line, warm shadow) when ART.rj is there, the toolkit's otherwise, plain canvas last
  function cel(g, shape, base, o) {
    const tk = TK(), rj = rjk();
    if (rj && isFn(rj.cel)) { rj.cel(g, shape, base, Object.assign({ line: 2.2 }, o)); return; }
    if (tk && isFn(tk.celFill)) { tk.celFill(g, shape, base, Object.assign({ line: 2.2, lineColor: INK }, o)); return; }
    g.beginPath();
    const pts = shape.poly || shape;
    pts.forEach((p, i) => { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
    g.closePath(); g.fillStyle = base; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  function celOval(g, cx, cy, rx, ry, base, o) {
    const tk = TK();
    if (tk && isFn(tk.celEllipse)) { tk.celEllipse(g, cx, cy, rx, ry, base, Object.assign({ line: 2.2, lineColor: INK, shadow: warm(base) }, o)); return; }
    g.beginPath(); g.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); g.fillStyle = base; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  function inkLine(g, pts, w, color, o) {
    const tk = TK();
    if (tk && isFn(tk.inkPath)) { tk.inkPath(g, pts, Object.assign({ w, color: color || INK }, o || {})); return; }
    g.beginPath(); pts.forEach((p, i) => { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
    g.lineWidth = w; g.strokeStyle = color || INK; g.lineCap = 'round'; g.stroke();
  }
  // a sagging cord from (x0, y0) to (x1, y1): the middle hangs `drop` lower
  const sagPts = (x0, y0, x1, y1, drop, n) => {
    const p = [];
    for (let i = 0; i <= n; i++) { const u = i / n; p.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + drop * 4 * u * (1 - u)]); }
    return p;
  };
  function heartAt(g, x, y, s, fill, lw) {
    g.save(); g.beginPath();
    g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.7, y - s * 1.2, x, y - s * 0.45); g.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = lw || 2; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); g.restore();
  }
  function starAt(g, x, y, r, fill, rot, lw) {
    g.save(); g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (rot || 0) - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r; if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = lw || 2; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); g.restore();
  }
  // the owners' RJ monogram (ART.scene.monogram) with a plain split disc when the scene art is missing
  function monoAt(g, x, y, r) {
    let ok = false;
    try { if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.monogram)) ok = ART.scene.monogram(g, x, y, r, {}) !== false; } catch (e) { ok = false; }
    if (ok) return;
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    g.fillStyle = HV.pink; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.fillStyle = HV.green; g.beginPath(); g.moveTo(x + r, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.fill();
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  // a fairy bulb (socket, glass, catchlight) and a string of them on a sagging wire; the bulbs come back as [x, y, colour] so the live frame can make them glow
  function bulbDot(g, x, y, r, hex) {
    g.fillStyle = '#4a3a30'; g.fillRect(x - r * 0.45, y - r * 1.4, r * 0.9, r * 0.8);
    g.beginPath(); g.ellipse(x, y, r * 0.9, r * 1.1, 0, 0, TAU); g.fillStyle = hex; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, Math.max(0.6, r * 0.22), 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  }
  function fairyString(g, x0, y0, x1, y1, drop, n, cols, r) {
    inkLine(g, sagPts(x0, y0, x1, y1, drop, 24), 2.2, INK, { taper: 0, wobble: 0 });
    const out = [];
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1), x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + drop * 4 * u * (1 - u) + r * 1.5, c = cols[(i - 1) % cols.length];
      bulbDot(g, x, y, r, c); out.push([x, y, c]);
    }
    return out;
  }

  // ---------------------------------------------------------------- Jordan, at the Merch Stall
  // The cast's Jordan (ART.cast, HV_ART_AUDIO 2.10) stands in the peddler slot of SHOP (same x and feet y, so the speech bubble and nameplate laid over him do not move).
  // The shop's mood words become his: idle waves hello now and then, happy is a cheer, sad an "oops" (never a sad face), shock shows the tablet, a bare stall dozes.
  const PD_MOODS = ['idle', 'happy', 'sad', 'shock', 'rest'];
  const JORDAN = { K: 1.3, idle: { pose: 'idle', expr: 'happy' }, happy: { mood: 'buy' }, sad: { mood: 'poor' }, shock: { mood: 'sold' }, rest: { mood: 'empty' } };
  function drawPeddler(ctx, x, y, s, t, mood) {
    if (typeof ART === 'undefined' || !ART || !ART.cast || !isFn(ART.cast.draw)) return;
    const m = JORDAN[mood] || JORDAN.idle;
    const o = { x: 0, y: 0, s: (s > 0 ? s : 1) * JORDAN.K, t, pose: m.pose, expr: m.expr, mood: m.mood };
    if (mood === 'idle' && motionK() === 1) { const u = (((t % 9.5) + 9.5) % 9.5) / 2.4; if (u < 1) o.mix = { pose: 'sing', k: Math.sin(u * Math.PI) * 0.92 }; }
    ctx.save(); ctx.translate(x, y);
    ART.cast.draw(ctx, 'jordan', o);
    ctx.restore();
  }

  // ---------------------------------------------------------------- the Merch Stall: a teal canopy with a scalloped fringe, a sticker pegboard wall, two planks of merch
  // SHOP is the one geometry table (the posts, the two planks, the peddler): the DOM wares are laid over it. The planks are painted with ONE fillRect(postL, y, span, h) each and the posts
  // with ONE strokeRect(x, 60, postW, 590) each, which is what the alignment test looks for.
  const SHOP_BULBS = [];
  function shopBackdrop(g) {
    const r = U.rng(4242);
    const sky = g.createLinearGradient(0, 0, 0, 720);
    sky.addColorStop(0, '#0c0a2a'); sky.addColorStop(0.5, '#22195e'); sky.addColorStop(0.8, '#3d2a7e'); sky.addColorStop(1, '#2a1d5a');
    g.fillStyle = sky; g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(255,248,236,' + (0.2 + r() * 0.6).toFixed(2) + ')'; const sz = r() > 0.9 ? 2.4 : 1.5; g.fillRect(r() * 1280, 60 + r() * 380, sz, sz); }
    const cols = [HV.pink, HV.green, HV.gold, HV.teal, HV.violet];
    for (let i = 0; i < 16; i++) { g.fillStyle = rgba(cols[i % 5], 0.08 + r() * 0.1); g.beginPath(); g.arc(r() * 330, 130 + r() * 420, 14 + r() * 32, 0, TAU); g.fill(); }
    // far festival tents behind the left side, in soft candy colours
    for (let x = -30, i = 0; x < 340; x += 96 + (i % 2) * 24, i++) {
      const w = 84 + (i % 3) * 18, h = 54 + (i % 2) * 26, y = 616, c = U.color.mix(cols[i % 5], '#3d2a7e', 0.55);
      cel(g, { poly: [[x, y], [x + w / 2, y - h], [x + w, y]] }, c, { line: 1.8, depth: 5, tension: 0, lineColor: 'rgba(45,23,15,0.6)' });
      inkLine(g, [[x + w / 2, y - h], [x + w / 2, y - h - 16]], 1.6, 'rgba(45,23,15,0.6)', { taper: 0, wobble: 0 });
    }
    // the ground
    const fl = g.createLinearGradient(0, 630, 0, 720); fl.addColorStop(0, '#1f4a52'); fl.addColorStop(0.3, '#173a44'); fl.addColorStop(1, '#0a1a24');
    g.fillStyle = fl; g.fillRect(0, 630, 1280, 90);
    inkLine(g, [[0, 632], [1280, 632]], 2.4, 'rgba(45,23,15,0.8)', { taper: 0, wobble: 0 });
    g.strokeStyle = 'rgba(255,207,138,0.07)'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, 648 + i * 10); g.lineTo(1280, 648 + i * 10 + 2); g.stroke(); }
    // the back wall of the stall: a teal pegboard plastered with stickers
    const pl = SHOP.postL, pw = SHOP.postW, pr = SHOP.postR, span = pr + pw - pl;      // the stall's width, post edge to post edge (962)
    const wall = g.createLinearGradient(0, 70, 0, 640); wall.addColorStop(0, '#12494b'); wall.addColorStop(1, '#0a2a33');
    g.fillStyle = wall; g.fillRect(pl + 10, 70, span - 10, 570);
    g.fillStyle = 'rgba(230,255,251,0.10)';
    for (let yy = 100, row = 0; yy < 630; yy += 30, row++) for (let xx = pl + 40 + (row % 2) * 15; xx < 1270; xx += 30) { g.beginPath(); g.arc(xx, yy, 2.2, 0, TAU); g.fill(); }
    g.save(); g.globalAlpha = 0.55;
    for (let i = 0; i < 22; i++) {
      const sx = pl + 50 + r() * (span - 80), sy = 100 + r() * 510, k = Math.floor(r() * 3), c = [HV.pink, HV.green, HV.gold, HV.sky, HV.violet][Math.floor(r() * 5)], s = 9 + r() * 6;
      if (k === 0) { heartAt(g, sx, sy, s + 3, HV.cream, 2); heartAt(g, sx, sy, s, c, 1.4); } else if (k === 1) { starAt(g, sx, sy, s + 5, HV.cream, r(), 2); starAt(g, sx, sy, s + 1, c, r(), 1.4); } else { celOval(g, sx, sy, s + 4, s + 4, HV.cream, { line: 1.6, depth: 2 }); celOval(g, sx, sy, s, s, c, { line: 1.4, depth: 2 }); }
    }
    g.restore();
    g.fillStyle = 'rgba(10,7,30,0.45)'; g.fillRect(pl + 10, 402, span - 10, 14);
    // the two posts: cream with teal stripes, the hard shadow on the left (the key light is upper right)
    const post = (x) => {
      g.save();
      g.fillStyle = HV.cream; g.fillRect(x, 60, pw, 590);
      g.beginPath(); g.rect(x, 60, pw, 590); g.clip();
      g.fillStyle = HV.teal; for (let y = 52; y < 660; y += 34) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + pw, y - 12); g.lineTo(x + pw, y + 4); g.lineTo(x, y + 16); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(45,23,15,0.2)'; g.fillRect(x, 60, 7, 590);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + pw - 5, 60, 3, 590);
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x, 60, pw, 590);
    };
    post(pl); post(pr);
    // the planks: a wooden lip, a cream front with a pink and a green stripe
    const plank = (y, h) => {
      const pg = g.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, '#f2c68f'); pg.addColorStop(0.25, '#d8a26a'); pg.addColorStop(1, '#a9703f');
      g.fillStyle = pg; g.fillRect(pl, y, span, h);
      g.fillStyle = HV.cream; g.fillRect(pl, y + 8, span, h - 8);
      g.fillStyle = HV.pink; g.fillRect(pl, y + 15, span, 7);
      g.fillStyle = HV.green; g.fillRect(pl, y + 22, span, 4);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(pl, y + h, span, 9);
      inkLine(g, [[pl, y + 8], [pl + span, y + 8]], 2, 'rgba(45,23,15,0.7)', { taper: 0, wobble: 0 });
      g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(pl, y, span, h);
    };
    SHOP.planks.forEach((p) => plank(p.y, p.h));
    // the canopy band over everything: teal and light teal stripes (the fringe is live, see shopFringe)
    for (let x = 0; x < 1280; x += 64) { g.fillStyle = (x / 64) % 2 ? '#7fe3d8' : HV.teal; g.fillRect(x, 0, 64, 78); }
    g.fillStyle = 'rgba(13,79,74,0.28)'; g.fillRect(0, 0, 1280, 26);
    g.fillStyle = '#1d8f84'; g.fillRect(0, 70, 1280, 8);
    inkLine(g, [[0, 78], [1280, 78]], 3, INK, { taper: 0, wobble: 0 });
    // the left side, Jordan's: bunting on a cord, a little RJ sign on strings, a round rug
    const cord = sagPts(-6, 124, 332, 132, 14, 22);
    inkLine(g, cord, 2.2, INK, { taper: 0, wobble: 0 });
    const flags = [HV.pink, HV.cream, HV.green, HV.gold, HV.teal, HV.sky];
    for (let i = 0; i < 9; i++) {
      const u = (i + 0.5) / 9, x = -6 + 338 * u, y = 124 + 8 * u + 14 * 4 * u * (1 - u);
      if (i === 4 || i === 6) {
        // a tee on the line (a peg each side), with a heart or a star on its chest
        const c = i === 4 ? HV.pink : '#8fe3c0';
        inkLine(g, [[x - 11, y - 1], [x - 11, y + 4]], 2.4, INK, { taper: 0, wobble: 0 }); inkLine(g, [[x + 11, y - 1], [x + 11, y + 4]], 2.4, INK, { taper: 0, wobble: 0 });
        cel(g, { poly: [[x - 13, y + 3], [x - 5, y + 7], [x + 5, y + 7], [x + 13, y + 3], [x + 26, y + 14], [x + 20, y + 23], [x + 14, y + 19], [x + 14, y + 46], [x - 14, y + 46], [x - 14, y + 19], [x - 20, y + 23], [x - 26, y + 14]] }, c, { line: 1.8, depth: 5, tension: 0 });
        if (i === 4) heartAt(g, x, y + 28, 6, HV.cream, 1.4); else starAt(g, x, y + 28, 8, HV.gold, 0, 1.4);
      } else cel(g, { poly: [[x - 17, y], [x + 17, y], [x, y + 32]] }, flags[i % 6], { line: 1.8, depth: 4, tension: 0 });
    }
    inkLine(g, [[48, 129], [62, 168]], 1.8, INK, { taper: 0, wobble: 0 }); inkLine(g, [[76, 130], [62, 168]], 1.8, INK, { taper: 0, wobble: 0 });
    celOval(g, 62, 198, 33, 33, HV.cream, { line: 2.4, depth: 6 });
    monoAt(g, 62, 198, 28);
    celOval(g, 206, 668, 128, 21, HV.cream, { line: 2.4, depth: 6 });
    g.strokeStyle = HV.pink; g.lineWidth = 4; g.beginPath(); g.ellipse(206, 668, 104, 16, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.green; g.lineWidth = 3; g.beginPath(); g.ellipse(206, 668, 82, 12, 0, 0, TAU); g.stroke();
  }
  // the fairy lights strung over the canopy (baked: 1280 x 140); SHOP_BULBS keeps where each bulb hangs so the live frame can make them breathe
  function shopLights(g) {
    SHOP_BULBS.length = 0;
    const cols = [HV.gold, HV.pink, HV.green, HV.cream, HV.sky];
    [[-10, 88, 430, 96], [430, 96, 850, 96], [850, 96, 1290, 88]].forEach((s) => fairyString(g, s[0], s[1], s[2], s[3], 16, 11, cols, 4.6).forEach((b) => SHOP_BULBS.push(b)));
  }
  // the scalloped fringe under the canopy: alternating teal and light teal, every scallop swinging a little on its own phase
  function shopFringe(ctx, t) {
    const m = motionK();
    ctx.save(); ctx.lineJoin = 'round';
    for (let i = 0; i < 20; i++) {
      const x = i * 64, sw = Math.sin(t * 2.1 + i * 0.7) * 2.6 * m, c = i % 2 ? '#e6fffb' : HV.teal;
      ctx.beginPath(); ctx.moveTo(x, 77); ctx.lineTo(x + 64, 77); ctx.quadraticCurveTo(x + 64 + sw, 112, x + 32 + sw, 116); ctx.quadraticCurveTo(x + sw, 112, x, 77); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = rgba(warm(c, 0.08), 0.7); ctx.beginPath(); ctx.ellipse(x + 20 + sw, 92, 9, 5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function paintShop(ctx, t, S) {
    layer(ctx, 'nk:shop:bg', 1280, 720, shopBackdrop);
    shopFringe(ctx, t);
    layer(ctx, 'nk:shop:lights', 1280, 140, shopLights);
    const m = motionK();
    SHOP_BULBS.forEach((b, i) => glow(ctx, b[0], b[1] + 3, 17, b[2], 0.26 + 0.3 * (0.5 + 0.5 * Math.sin(t * (1.2 + (i % 4) * 0.35) * m + i * 2.1))));
    glow(ctx, SHOP.peddler.x, 676, 200, '#ffcf8a', 0.2 + 0.03 * Math.sin(t * 1.5));
    const mood = S.mood && S.t < S.mood.until ? S.mood.name : (S.saidEmpty ? 'rest' : 'idle');
    drawPeddler(ctx, SHOP.peddler.x, SHOP.peddler.y, 1, t, PD_MOODS.indexOf(mood) >= 0 ? mood : 'idle');
    const tk = TK();
    if (tk) {
      safe(() => tk.kirakira(ctx, 0, 100, 1280, 560, t, { n: 16, seed: 21, size: 2.6, rise: 5 }));
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.42 }));
    }
  }

  // ---------------------------------------------------------------- the Green Room: a cosy backstage room, the heroes around a kettle on a hot plate
  // Anchor points other modules can rely on: the kettle table's feet are CAMP.fire (the floor under it), the heroes' feet are CAMP.heroes[i] (stage px).
  const CAMP = { fire: { x: 890, y: 612 }, heroes: [{ x: 690, y: 650, s: 0.98, flip: false }, { x: 1090, y: 650, s: 0.98, flip: true }] };
  const campFirePos = () => CAMP.fire;
  const campHeroPos = (i) => CAMP.heroes[i] || CAMP.heroes[0];
  const CAMP_BULBS = [];                       // the mirror's bulbs and the fairy lights: [x, y, colour]; baked with the backdrop, made to breathe live
  const CAMP_RECORD = { x: 1096, y: 303 };     // the little record player on the shelf (its record is drawn live, it spins)

  function campBackdrop(g) {
    CAMP_BULBS.length = 0;
    const r = U.rng(777);
    // the wall: teal with soft stripes and tiny cream dots, a wainscot of darker panels under a cream dado rail
    g.fillStyle = '#1f5f63'; g.fillRect(0, 0, 1280, 600);
    for (let x = 0; x < 1280; x += 96) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x, 0, 48, 600); }
    g.fillStyle = 'rgba(255,244,230,0.09)';
    for (let yy = 40, row = 0; yy < 440; yy += 46, row++) for (let xx = 24 + (row % 2) * 48; xx < 1280; xx += 96) { g.beginPath(); g.arc(xx, yy, 2.4, 0, TAU); g.fill(); }
    g.fillStyle = '#16484c'; g.fillRect(0, 456, 1280, 140);
    for (let x = 14; x < 1280; x += 132) { g.strokeStyle = 'rgba(255,244,230,0.14)'; g.lineWidth = 2; rrPath(g, x, 474, 108, 104, 6); g.stroke(); }
    g.fillStyle = HV.cream; g.fillRect(0, 446, 1280, 10);
    inkLine(g, [[0, 446], [1280, 446]], 2.4, INK, { taper: 0, wobble: 0 }); inkLine(g, [[0, 456], [1280, 456]], 2.4, INK, { taper: 0, wobble: 0 });
    // the floor: warm boards with a skirting board, and a round rug under the heroes
    const fl = g.createLinearGradient(0, 596, 0, 720); fl.addColorStop(0, '#b27547'); fl.addColorStop(0.5, '#8a5a38'); fl.addColorStop(1, '#5a3722');
    g.fillStyle = fl; g.fillRect(0, 596, 1280, 124);
    g.strokeStyle = 'rgba(45,23,15,0.4)'; g.lineWidth = 2;
    [614, 638, 670, 708].forEach((y) => { g.beginPath(); g.moveTo(0, y); g.lineTo(1280, y); g.stroke(); });
    g.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) { const y = [596, 614, 638, 670][i % 4], h = [18, 24, 32, 38][i % 4], x = r() * 1280; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + h); g.stroke(); }
    g.fillStyle = HV.cream; g.fillRect(0, 586, 1280, 14);
    inkLine(g, [[0, 586], [1280, 586]], 2.4, INK, { taper: 0, wobble: 0 }); inkLine(g, [[0, 600], [1280, 600]], 2.4, INK, { taper: 0, wobble: 0 });
    celOval(g, 890, 666, 392, 44, HV.cream, { line: 2.6, depth: 9 });
    g.strokeStyle = HV.pink; g.lineWidth = 7; g.beginPath(); g.ellipse(890, 666, 338, 36, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.green; g.lineWidth = 5; g.beginPath(); g.ellipse(890, 666, 296, 31, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.gold; g.lineWidth = 3; g.setLineDash([10, 10]); g.beginPath(); g.ellipse(890, 666, 250, 26, 0, 0, TAU); g.stroke(); g.setLineDash([]);

    // set lists taped to the wall: scribbles only, no words
    [[606, 178, -0.07, '#fff4e6'], [676, 192, 0.05, '#ffe3f1'], [738, 172, -0.03, '#d9fff4']].forEach((s, i) => {
      g.save(); g.translate(s[0], s[1]); g.rotate(s[2]);
      cel(g, R4(0, 0, 58, 86), s[3], { line: 1.8, depth: 4, tension: 0 });
      for (let k = 0; k < 6; k++) inkLine(g, [[7, 16 + k * 11], [7 + 18 + ((k * 7 + i * 5) % 26), 16 + k * 11]], 1.8, k === 0 ? HV.pinkD : 'rgba(45,23,15,0.55)', { taper: 0.3, wobble: 0 });
      if (i === 1) starAt(g, 44, 70, 7, HV.gold, 0.2, 1.4);
      g.fillStyle = i === 1 ? 'rgba(63,207,106,0.65)' : 'rgba(255,126,182,0.65)'; g.fillRect(16, -6, 26, 12);
      g.restore();
    });
    // the dressing-room mirror ringed by warm bulbs (they breathe live)
    cel(g, RR(792, 142, 196, 276, 30), HV.cream, { line: 2.8, depth: 7, tension: 0.5 });
    const gl = g.createLinearGradient(800, 150, 980, 410); gl.addColorStop(0, '#c9fbf5'); gl.addColorStop(0.55, '#7fd3d2'); gl.addColorStop(1, '#4aa8b2');
    g.beginPath(); tkTrace(g, RR(806, 156, 168, 248, 22)); g.fillStyle = gl; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.38)'; g.beginPath(); g.moveTo(830, 160); g.lineTo(878, 160); g.lineTo(826, 330); g.lineTo(812, 330); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(890, 160); g.lineTo(902, 160); g.lineTo(850, 300); g.lineTo(838, 300); g.closePath(); g.fill();
    const bulbSpots = [];
    for (let i = 0; i < 6; i++) bulbSpots.push([810 + i * 34, 150]);
    for (let i = 0; i < 9; i++) bulbSpots.push([980, 168 + i * 29]);
    for (let i = 0; i < 6; i++) bulbSpots.push([980 - (i + 1) * 31, 410]);
    for (let i = 0; i < 9; i++) bulbSpots.push([800, 396 - i * 29]);
    bulbSpots.forEach((b, i) => { bulbDot(g, b[0], b[1] + 2, 5.2, i % 3 === 0 ? HV.gold : HV.bulb); CAMP_BULBS.push([b[0], b[1] + 2, HV.bulb]); });
    // the fairy-light string across the wall
    fairyString(g, 574, 92, 1290, 88, 34, 17, [HV.gold, HV.pink, HV.green, HV.cream, HV.sky], 4.6).forEach((b) => CAMP_BULBS.push(b));
    // a shelf with books, the record player and a cactus
    cel(g, R4(996, 338, 188, 12), '#d8a26a', { line: 2.2, depth: 3, tension: 0 });
    [[1010, 350], [1166, 350]].forEach((b) => cel(g, { poly: [[b[0], b[1]], [b[0] + 10, b[1]], [b[0], b[1] + 22]] }, '#8a5a38', { line: 1.8, depth: 2, tension: 0 }));
    cel(g, R4(1004, 322, 30, 16), HV.pink, { line: 1.8, depth: 3, tension: 0 }); cel(g, R4(1008, 308, 24, 14), HV.green, { line: 1.8, depth: 3, tension: 0 });
    cel(g, RR(1048, 300, 108, 38, 8), HV.cream, { line: 2.4, depth: 6, tension: 0.4 });
    cel(g, RR(1156, 316, 20, 22, 4), HV.pink, { line: 1.8, depth: 3 });
    cel(g, [[1160, 316, 1], [1166, 290], [1172, 316, 1]], '#3fcf6a', { line: 1.8, depth: 3, tension: 0.8 });
    // the plant: a pink pot and big leaves
    const leaf = (x, y, len, ang, w, c) => {
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w, mx = (x + ex) / 2, my = (y + ey) / 2;
      cel(g, [[x, y, 1], [mx + nx, my + ny], [ex, ey, 1], [mx - nx, my - ny]], c, { line: 2, depth: 4, tension: 0.9 });
      inkLine(g, [[x, y], [ex, ey]], 1.4, 'rgba(45,23,15,0.5)', { taper: 0.4, wobble: 0 });
    };
    [[-2.5, 110, '#2da656'], [-2.1, 130, '#3fcf6a'], [-1.7, 144, '#2da656'], [-1.35, 138, '#3fcf6a'], [-0.95, 120, '#2da656'], [-0.6, 96, '#3fcf6a']].forEach((l) => leaf(646, 548, l[1], l[0], 26, l[2]));
    cel(g, { poly: [[616, 540], [676, 540], [668, 600], [624, 600]] }, HV.pink, { line: 2.4, depth: 7, tension: 0, decor: (c) => { c.fillStyle = HV.cream; c.fillRect(610, 562, 70, 10); } });
    celOval(g, 646, 540, 30, 7, '#7a4a2c', { line: 2, depth: 2 });
    // the sofa with a patchwork throw
    g.fillStyle = 'rgba(20,10,6,0.32)'; g.beginPath(); g.ellipse(1110, 606, 190, 14, 0, 0, TAU); g.fill();
    cel(g, RR(944, 444, 346, 104, 30), '#f26b4f', { line: 2.6, depth: 9, tension: 0.5 });
    cel(g, RR(928, 482, 52, 108, 22), '#e0573c', { line: 2.6, depth: 8, tension: 0.5 });
    cel(g, RR(962, 518, 330, 66, 20), '#ff8466', { line: 2.6, depth: 8, tension: 0.5 });
    [[966, 594], [1262, 594]].forEach((f) => cel(g, { poly: [[f[0], f[1]], [f[0] + 18, f[1]], [f[0] + 14, f[1] + 12], [f[0] + 4, f[1] + 12]] }, '#8a5a38', { line: 1.8, depth: 2, tension: 0 }));
    const quad = [[1058, 470], [1290, 450], [1290, 552], [1086, 566]], pc = [HV.pink, '#8fe3c0', HV.cream, HV.gold, HV.sky, HV.pinkL];
    const bil = (u, v) => { const a = [quad[0][0] + (quad[1][0] - quad[0][0]) * u, quad[0][1] + (quad[1][1] - quad[0][1]) * u], b = [quad[3][0] + (quad[2][0] - quad[3][0]) * u, quad[3][1] + (quad[2][1] - quad[3][1]) * u]; return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
      g.beginPath(); [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].forEach((q, k) => { const p = bil(q[0] / 5, q[1] / 3); if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
      g.closePath(); g.fillStyle = pc[(i * 2 + j * 3) % 6]; g.fill(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(45,23,15,0.55)'; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    }
    g.beginPath(); quad.forEach((p, k) => { if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
    for (let i = 0; i < 9; i++) { const p = bil(0.08 + i * 0.105, 1); inkLine(g, [[p[0], p[1]], [p[0] - 1, p[1] + 10]], 3, HV.cream, { taper: 0.2, wobble: 0 }); }
    // the door with a star, at the right edge
    cel(g, R4(1190, 168, 100, 424), HV.cream, { line: 2.6, depth: 6, tension: 0 });
    cel(g, R4(1202, 180, 88, 412), HV.pink, { line: 2.4, depth: 8, tension: 0 });
    g.strokeStyle = 'rgba(45,23,15,0.5)'; g.lineWidth = 2; g.strokeRect(1216, 200, 60, 150); g.strokeRect(1216, 372, 60, 170);
    celOval(g, 1228, 284, 30, 30, HV.cream, { line: 2.4, depth: 5 });
    starAt(g, 1228, 284, 24, HV.gold, 0.1, 2.4);
    celOval(g, 1224, 450, 7, 7, HV.gold, { line: 1.8, depth: 2 });
  }
  const tkTrace = (g, shape) => { const tk = TK(); if (tk && isFn(tk.trace)) tk.trace(g, shape); else { const p = shape.poly || shape; p.forEach((q, i) => { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); } };

  // the kettle on its hot plate, on a little round table with a teapot and a bowl of clementines: the Green Room's "fire". The table's feet are at (fx, fy).
  // The plate's coil glows and the kettle steams; scale grows everything round the feet.
  function paintFire(ctx, t, fx, fy, scale) {
    const m = motionK(), sc = scale > 0 ? scale : 1;
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.3);
    glow(ctx, fx, fy - 90 * sc, 300 * sc, '#ffcf8a', 0.2 * pulse);
    ctx.save(); ctx.translate(fx, fy); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(20,10,6,0.32)'; ctx.beginPath(); ctx.ellipse(0, 4, 104, 13, 0, 0, TAU); ctx.fill();
    // legs, then the round top with a cream doily
    [[-62, -4, -52, -66], [62, -4, 52, -66], [0, 4, 0, -64]].forEach((l) => cel(ctx, { poly: [[l[0] - 6, l[1]], [l[0] + 6, l[1]], [l[2] + 5, l[3]], [l[2] - 5, l[3]]] }, '#8a5a38', { line: 2, depth: 3, tension: 0 }));
    celOval(ctx, 0, -68, 108, 17, '#d8a26a', { line: 2.4, depth: 6 });
    celOval(ctx, 0, -71, 90, 13, HV.cream, { line: 1.6, depth: 4 });
    ctx.strokeStyle = HV.pink; ctx.lineWidth = 2.4; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(0, -71, 78, 11, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // the hot plate with its glowing coil
    celOval(ctx, -20, -80, 42, 9, '#3a3448', { line: 2.2, depth: 4 });
    ctx.strokeStyle = 'rgba(255,' + Math.round(110 + 60 * pulse) + ',40,' + (0.55 + 0.4 * pulse).toFixed(2) + ')'; ctx.lineWidth = 3;
    [30, 20, 10].forEach((rx) => { ctx.beginPath(); ctx.ellipse(-20, -80, rx, rx * 0.2, 0, 0, TAU); ctx.stroke(); });
    glow(ctx, -20, -82, 60, '#ff7a2a', 0.38 * pulse);
    // the kettle: a chunky teal body, cream lid knob, a curved spout and a cream handle
    cel(ctx, [[-52, -86], [-56, -104], [-44, -126], [-20, -134], [4, -126], [14, -104], [10, -86]], HV.teal, { line: 2.4, depth: 9, tension: 0.8, hi: '#9ff0e6', hiW: 3 });
    cel(ctx, [[-44, -128], [-20, -142], [2, -128], [-20, -122]], HV.tealD, { line: 2.2, depth: 3, tension: 0.8, shadow: false });
    celOval(ctx, -20, -146, 7, 6, HV.cream, { line: 2, depth: 2 });
    cel(ctx, [[-50, -98, 1], [-70, -108], [-82, -128], [-74, -132], [-62, -116], [-48, -108, 1]], HV.teal, { line: 2.2, depth: 4, tension: 0.7 });
    inkLine(ctx, [[8, -116], [30, -122], [34, -102], [14, -94]], 7, INK, { taper: 0, wobble: 0 }); inkLine(ctx, [[8, -116], [30, -122], [34, -102], [14, -94]], 3.4, HV.cream, { taper: 0, wobble: 0 });
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-40, -108, 3.4, 10, 0.2, 0, TAU); ctx.fill();
    // a pink teapot and a bowl of clementines
    cel(ctx, [[46, -76], [42, -92], [52, -106], [72, -106], [84, -92], [80, -76]], HV.pink, { line: 2.2, depth: 6, tension: 0.8, hi: HV.pinkL });
    cel(ctx, [[52, -106], [62, -116], [72, -106]], HV.pinkD, { line: 2, depth: 2, tension: 0.8, shadow: false });
    inkLine(ctx, [[80, -96], [94, -98], [92, -84], [80, -82]], 5, INK, { taper: 0, wobble: 0 }); inkLine(ctx, [[80, -96], [94, -98], [92, -84], [80, -82]], 2.2, HV.pink, { taper: 0, wobble: 0 });
    inkLine(ctx, [[44, -88], [34, -98], [38, -100], [48, -94]], 5, INK, { taper: 0, wobble: 0 });
    cel(ctx, [[-98, -76], [-96, -66], [-80, -62], [-66, -66], [-64, -76]], HV.cream, { line: 2, depth: 4, tension: 0.6 });
    [[-90, -84], [-78, -86], [-70, -80]].forEach((c, i) => { celOval(ctx, c[0], c[1], 9, 9, HV.orange, { line: 1.8, depth: 3 }); celOval(ctx, c[0] - 2, c[1] - 7, 3, 2, HV.green, { line: 1.2, depth: 0, shadow: false }); void i; });
    // steam from the spout: soft puffs that rise, widen and fade
    for (let i = 0; i < 7; i++) {
      const ph = (((t * 0.32 * m + i / 7) % 1) + 1) % 1, x = -80 - ph * 22 + Math.sin(t * 1.7 + i * 1.9) * 9 * m, y = -132 - ph * 120;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.62; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 6 + ph * 15, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function paintCamp(ctx, t, S) {
    layer(ctx, 'nk:camp:bg', 1280, 720, campBackdrop);
    const f = CAMP.fire;
    const R = S.R;
    const pz = S.pose && t < S.pose.until ? S.pose : null;
    const m = motionK();
    // the bulbs breathe, and a tiny record spins on the shelf
    CAMP_BULBS.forEach((b, i) => glow(ctx, b[0], b[1], 15, b[2], 0.2 + 0.26 * (0.5 + 0.5 * Math.sin(t * 1.6 * m + (i % 7) * 0.9))));
    paintRecord(ctx, t);
    // the room's warm light first so the heroes stand in it, then heroes, then the kettle table
    glow(ctx, f.x, f.y - 110, 520, '#ffcf8a', 0.16 + 0.03 * Math.sin(t * 2.2));
    if (typeof ART !== 'undefined' && ART && ART.hero && isFn(ART.hero.draw)) {
      R.heroes.forEach((h, i) => {
        const p = campHeroPos(i);
        safe(() => ART.hero.draw(ctx, h.id, { x: p.x, y: p.y, s: p.s, pose: pz ? pz.name : 'idle', t, pt: pz ? t - pz.t0 : 0, flip: p.flip }));
        glow(ctx, p.x + (p.flip ? -46 : 46), p.y - 110, 150, '#ffcf8a', 0.1 + 0.03 * Math.sin(t * 2.2 + i));
      });
    }
    paintFire(ctx, t, f.x, f.y, 1);
    const tk = TK();
    if (tk) {
      safe(() => tk.kirakira(ctx, 560, 120, 720, 520, t, { n: 16, seed: 3, size: 2.6, rise: 8, color: '#ffe9a8' }));
      // small cream notes drift up from the kettle
      for (let i = 0; i < 4; i++) {
        const ph = (((t * 0.12 * m + i * 0.25) % 1) + 1) % 1;
        safe(() => tk.note(ctx, f.x - 60 + Math.sin(ph * 9 + i * 2) * 26, f.y - 150 - ph * 190, 7 + i % 2 * 2, { kind: ['eighth', 'beamed', 'quarter', 'eighth'][i], color: i % 2 ? HV.pinkL : HV.cream, alpha: Math.sin(ph * Math.PI) * 0.85, rot: Math.sin(ph * 5 + i) * 0.25, line: 1.6 }));
      }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.46 }));
    }
  }
  // the little record on the shelf's player: a dark disc with a pink label that spins (a bright arc travels round its grooves), and the tonearm resting on it
  function paintRecord(ctx, t) {
    const R0 = CAMP_RECORD, a = t * 3.4 * motionK();
    ctx.save();
    ctx.fillStyle = '#2a2438'; ctx.beginPath(); ctx.ellipse(R0.x, R0.y, 40, 8.4, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    [30, 22].forEach((rx) => { ctx.beginPath(); ctx.ellipse(R0.x, R0.y, rx, rx * 0.21, 0, 0, TAU); ctx.stroke(); });
    ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(R0.x, R0.y, 34, 7, 0, a, a + 0.8); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R0.x, R0.y, 34, 7, 0, a + Math.PI, a + Math.PI + 0.5); ctx.stroke();
    ctx.fillStyle = HV.pink; ctx.beginPath(); ctx.ellipse(R0.x, R0.y, 11, 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(R0.x, R0.y, 1.4, 0, TAU); ctx.fill();
    inkLine(ctx, [[R0.x + 46, R0.y - 10], [R0.x + 24, R0.y - 2], [R0.x + 12, R0.y + 2]], 3.4, INK, { taper: 0, wobble: 0 }); inkLine(ctx, [[R0.x + 46, R0.y - 10], [R0.x + 24, R0.y - 2], [R0.x + 12, R0.y + 2]], 1.6, HV.cream, { taper: 0, wobble: 0 });
    ctx.restore();
  }

  // small animated pictures for the four Green Room buttons (224 x 104): a sofa with tea (Rest), a mic in a spotlight (Rehearse), a cut gem (Set Gems), a mic and its sound (Warm Up).
  // The still parts are baked once (ART.sprite through layer); only the light, steam, rings and notes are drawn per frame.
  const ciBg = (g, w, h, c0, c1) => { const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, c0); bg.addColorStop(1, c1); g.fillStyle = bg; g.fillRect(0, 0, w, h); };
  const CI_BULBS = [];
  function ciRest(g) {
    ciBg(g, 224, 104, '#12404a', '#25707a');
    g.fillStyle = HV.cream; g.beginPath(); g.arc(186, 26, 14, 0, TAU); g.fill(); g.fillStyle = '#12404a'; g.beginPath(); g.arc(191, 22, 12, 0, TAU); g.fill();
    g.lineWidth = 2; g.strokeStyle = INK; g.beginPath(); g.arc(186, 26, 14, 0.9, 5.4); g.stroke();
    inkLine(g, sagPts(-4, 8, 150, 6, 12, 14), 1.6, INK, { taper: 0, wobble: 0 });
    CI_BULBS.length = 0;
    for (let i = 0; i < 7; i++) { const u = (i + 0.5) / 7, bx = -4 + 154 * u, by = 8 - 2 * u + 12 * 4 * u * (1 - u) + 5; bulbDot(g, bx, by, 3.1, [HV.gold, HV.pink, HV.green, HV.cream][i % 4]); CI_BULBS.push([bx, by]); }
    cel(g, RR(24, 38, 126, 40, 14), '#e0573c', { line: 2, depth: 6, tension: 0.5 });
    cel(g, RR(14, 58, 146, 26, 12), '#f26b4f', { line: 2, depth: 6, tension: 0.5 });
    cel(g, { poly: [[52, 60], [150, 56], [152, 78], [60, 82]] }, '#8fe3c0', { line: 1.8, depth: 4, tension: 0, decor: (c) => { c.fillStyle = HV.pink; c.fillRect(70, 52, 14, 34); c.fillRect(98, 52, 14, 34); c.fillRect(126, 52, 14, 34); } });
    cel(g, RR(30, 42, 36, 28, 10), HV.pinkL, { line: 1.8, depth: 4 }); heartAt(g, 48, 56, 7, HV.pink, 1.6);
    [[26, 86], [140, 86]].forEach((f) => cel(g, R4(f[0], f[1], 8, 8), '#8a5a38', { line: 1.6, depth: 1, tension: 0 }));
    cel(g, RR(176, 66, 26, 24, 7), HV.cream, { line: 2, depth: 4 });
    inkLine(g, [[202, 72], [212, 74], [212, 82], [202, 84]], 5, INK, { taper: 0, wobble: 0 }); inkLine(g, [[202, 72], [212, 74], [212, 82], [202, 84]], 2, HV.cream, { taper: 0, wobble: 0 });
  }
  function ciSharpen(g) {
    ciBg(g, 224, 104, '#2a1a5a', '#6a2a7a');
    g.fillStyle = 'rgba(255,244,214,0.16)'; g.beginPath(); g.moveTo(98, 0); g.lineTo(126, 0); g.lineTo(176, 96); g.lineTo(48, 96); g.closePath(); g.fill();
    celOval(g, 112, 94, 62, 9, HV.cream, { line: 2, depth: 3 }); celOval(g, 112, 92, 54, 7, '#5b3fa8', { line: 1.6, depth: 3 });
    inkLine(g, [[112, 92], [112, 54]], 6, INK, { taper: 0, wobble: 0 }); inkLine(g, [[112, 92], [112, 54]], 2.8, '#c9cbd6', { taper: 0, wobble: 0 });
    celOval(g, 112, 40, 11, 15, '#2a2438', { line: 2.2, depth: 4, hi: '#615f6d' });
    for (let k = -1; k <= 1; k++) inkLine(g, [[104, 40 + k * 6], [120, 40 + k * 6]], 1.2, 'rgba(255,255,255,0.35)', { taper: 0, wobble: 0 });
    cel(g, R4(101, 44, 22, 5), HV.pink, { line: 1.4, depth: 1, tension: 0 });
    g.save(); g.translate(40, 54); g.rotate(-0.18);
    cel(g, R4(-20, -30, 40, 58), HV.cream, { line: 2, depth: 5, tension: 0 }); cel(g, R4(-20, -30, 40, 12), HV.pink, { line: 1.6, depth: 1, tension: 0, shadow: false });
    starAt(g, 0, 4, 9, HV.gold, 0, 1.6);
    g.restore();
  }
  function ciWarm(g) {
    ciBg(g, 224, 104, '#2a1a5a', '#3a2a8a');
    const rj = rjk();
    if (rj && isFn(rj.mic)) rj.mic(g, 128, 40, Math.PI * 0.72, { accent: HV.pink, k: 1.25 });
    celOval(g, 52, 54, 24, 24, HV.pink, { line: 2.2, depth: 7, hi: HV.pinkL });
    g.strokeStyle = HV.cream; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(36, 54); g.lineTo(42, 54); g.lineTo(46, 44); g.lineTo(52, 66); g.lineTo(57, 40); g.lineTo(62, 62); g.lineTo(66, 54); g.lineTo(70, 54); g.stroke();
  }
  function campIcon(g, id, t, w, h, S) {
    const m = motionK(), tk = TK();
    if (id === 'rest') {
      layer(g, 'nk:ci:rest', w, h, ciRest);
      glow(g, 186, 26, 44, '#fff4d6', 0.45);
      CI_BULBS.forEach((b, i) => glow(g, b[0], b[1], 9, HV.cream, 0.25 + 0.25 * Math.sin(t * 1.6 * m + i * 1.7)));
      for (let i = 0; i < 3; i++) { const ph = (((t * 0.4 * m + i / 3) % 1) + 1) % 1; g.fillStyle = 'rgba(255,255,255,' + (Math.sin(ph * Math.PI) * 0.6).toFixed(2) + ')'; g.beginPath(); g.arc(189 + Math.sin(t * 2 + i * 2) * 3, 62 - ph * 30, 3 + ph * 4, 0, TAU); g.fill(); }
      if (tk) for (let i = 0; i < 2; i++) { const ph = (((t * 0.22 * m + i * 0.5) % 1) + 1) % 1; safe(() => tk.note(g, 168 + i * 18, 48 - ph * 34, 6, { kind: i ? 'beamed' : 'eighth', color: HV.pinkL, alpha: Math.sin(ph * Math.PI) * 0.85, line: 1.4 })); }
    } else if (id === 'sharpen') {
      layer(g, 'nk:ci:sharpen', w, h, ciSharpen);
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const q = (((t * 0.55 * m + i / 3) % 1) + 1) % 1, rr = 16 + q * 34; g.strokeStyle = rgba(i % 2 ? HV.cream : HV.pink, 0.8 * (1 - q)); g.lineWidth = 2.4; g.beginPath(); g.arc(112, 38, rr, Math.PI * 1.15, Math.PI * 1.4); g.stroke(); g.beginPath(); g.arc(112, 38, rr, Math.PI * 1.6, Math.PI * 1.85); g.stroke(); }
      g.restore();
      sparkleAt(g, 66, 26, 5 + 2 * Math.sin(t * 4), { color: '#ffffff', alpha: 0.9 });
      sparkleAt(g, 172, 34, 4, { color: HV.pinkL, alpha: 0.6 + 0.4 * Math.sin(t * 3) });
    } else if (id === 'gems') {
      ciBg(g, w, h, '#1b1050', '#3c1f7a');
      const hue = [['#ff7eb6', '#ffc2dc'], ['#5fb4ff', '#b5dcff'], ['#3fd6b0', '#a5f5dc'], ['#ffd84d', '#fff0a8']];
      const k = (t * 0.5 * m) % 4, a = hue[Math.floor(k) % 4], b = hue[(Math.floor(k) + 1) % 4], f = k - Math.floor(k);
      const base = U.color.mix(a[0], b[0], f), lite = U.color.mix(a[1], b[1], f);
      glow(g, 112, 54, 80, base, 0.5);
      g.save(); g.translate(112, 54 + Math.sin(t * 1.6 * m) * 3); g.rotate(Math.sin(t * 0.9 * m) * 0.08);
      cel(g, { poly: [[-34, -6], [-20, -34], [20, -34], [34, -6], [0, 36]] }, base, { line: 2.8, depth: 8, tension: 0, hi: lite, rim: lite });
      g.fillStyle = rgba(lite, 0.75); g.beginPath(); g.moveTo(-20, -34); g.lineTo(-6, -6); g.lineTo(-34, -6); g.closePath(); g.fill();
      g.fillStyle = rgba('#ffffff', 0.3); g.beginPath(); g.moveTo(20, -34); g.lineTo(34, -6); g.lineTo(6, -6); g.closePath(); g.fill();
      g.strokeStyle = rgba(INK, 0.6); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-34, -6); g.lineTo(34, -6); g.moveTo(-6, -6); g.lineTo(0, 36); g.moveTo(6, -6); g.lineTo(0, 36); g.stroke();
      g.restore();
      for (let i = 0; i < 4; i++) sparkleAt(g, 112 + Math.cos(t * 0.8 * m + i * 1.6) * 54, 54 + Math.sin(t * 1.1 * m + i * 1.6) * 30, 5 + (i % 2) * 3, { color: '#ffffff', alpha: 0.5 + 0.5 * Math.sin(t * 3 + i) });
    } else {
      layer(g, 'nk:ci:warm', w, h, ciWarm);
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const q = (((t * 0.5 * m + i / 3) % 1) + 1) % 1, rr = 22 + q * 40; g.strokeStyle = rgba(i % 2 ? HV.cream : HV.pink, 0.85 * (1 - q)); g.lineWidth = 2.6; g.beginPath(); g.arc(128, 40, rr, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); g.beginPath(); g.arc(128, 40, rr, Math.PI * 0.25, Math.PI * 0.75); g.stroke(); }
      g.restore();
      if (tk) for (let i = 0; i < 3; i++) { const ph = (((t * 0.28 * m + i / 3) % 1) + 1) % 1; safe(() => tk.note(g, 170 + i * 14 + Math.sin(ph * 7 + i) * 6, 84 - ph * 70, 7, { kind: ['eighth', 'beamed', 'quarter'][i], color: [HV.gold, HV.pinkL, HV.cream][i], alpha: Math.sin(ph * Math.PI) * 0.9, line: 1.5 })); }
      sparkleAt(g, 78, 24, 5 + 2 * Math.sin(t * 3.4), { color: '#ffffff', alpha: 0.85 });
    }
    void S;
  }

  // ---------------------------------------------------------------- the Studio: a mixing desk, a mic in a pop filter, an ON AIR light, a big drum pad and a drumstick
  // Anchors: the drum pad's face is at FORGE.hit, the drumstick pivots at FORGE.pivot (stage px).
  // rest and restUp are the stick's idle angles (radians, see drawHammer): hung at an angle while two plaques are up, and standing nearly upright behind the After card
  // while the before and after page is open, so the stick never sits on the Hit it! button (the first keyframe of a blow is whichever rest it starts from)
  // cardsEnd: the two mode cards end at y 458 and the before and after cards at 452 or more (taller on a phone), and the stick's base sits at the pivot, 12 to 18 px below them: until the first blow
  // (nothing has to swing yet) the stick is painted only above y 446, so the base never pokes out from under a card
  // The alignment tests read this painter: the stick's rotate must be the FIRST rotate call and its cut the only rect(0, 0, 1280, y) and the only extra clip, so the backdrop and
  // everything before drawHammer never rotates, and nothing that depends on the strike may clip or use the cel helpers.
  const FORGE = { hit: { x: 640, y: 538 }, pivot: { x: 850, y: 470 }, arm: 205, rest: -0.95, restUp: -1.5, cardsEnd: 446 };
  const FORGE_LAMP = { x: 168, y: 140 };        // the ON AIR light's centre (the lamp and its word are live, the housing is baked)
  const FORGE_WOOFERS = [{ x: 1130, y: 340, r: 56 }, { x: 1130, y: 548, r: 68 }];

  function forgeBackdrop(g) {
    const r = U.rng(31337);
    const wall = g.createLinearGradient(0, 0, 0, 720); wall.addColorStop(0, '#1a1346'); wall.addColorStop(1, '#0e0a28');
    g.fillStyle = wall; g.fillRect(0, 0, 1280, 720);
    // acoustic foam: square tiles with a pyramid on each (the top and right faces catch the light), in three muted candy colours
    const foam = (x0, y0, cols, rows, size, pal) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = x0 + i * size, y = y0 + j * size, c = pal[(i + j * 2) % pal.length], cx = x + size / 2, cy = y + size / 2;
        g.fillStyle = c; g.fillRect(x, y, size, size);
        g.fillStyle = U.color.mix(c, '#ffffff', 0.3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + size, y); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.fillStyle = U.color.mix(c, '#ffffff', 0.14); g.beginPath(); g.moveTo(x + size, y); g.lineTo(x + size, y + size); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.fillStyle = U.color.mix(c, '#000000', 0.34); g.beginPath(); g.moveTo(x, y + size); g.lineTo(x + size, y + size); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(45,23,15,0.5)'; g.lineWidth = 1.4; g.strokeRect(x, y, size, size);
      }
    };
    foam(18, 92, 5, 6, 54, ['#b24f8a', '#6a4ab8', '#b24f8a', '#2f8f96']);
    foam(986, 92, 5, 5, 54, ['#2f8f96', '#6a4ab8', '#2f8f96', '#b24f8a']);
    for (let i = 0; i < 6; i++) { const x = 350 + r() * 580, y = 450 + r() * 70; starAt(g, x, y, 5 + r() * 4, [HV.pink, HV.gold, HV.green][i % 3], r(), 1.4); }
    // headphones on hooks above the speakers
    [[1048, 156, HV.pink], [1122, 168, HV.green], [1196, 154, HV.violet]].forEach((h) => {
      inkLine(g, [[h[0], 102], [h[0], 130]], 2.4, INK, { taper: 0, wobble: 0 });
      g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(h[0], h[1] - 2, 27, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
      g.strokeStyle = h[2]; g.lineWidth = 3.6; g.beginPath(); g.arc(h[0], h[1] - 2, 27, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
      celOval(g, h[0] - 27, h[1] + 8, 13, 17, h[2], { line: 2.2, depth: 4 }); celOval(g, h[0] + 27, h[1] + 8, 13, 17, h[2], { line: 2.2, depth: 4 });
    });
    // the ON AIR housing (the lamp and its word are live)
    cel(g, RR(78, 100, 180, 82, 16), '#2a2438', { line: 3, depth: 8, tension: 0.5 });
    g.strokeStyle = HV.cream; g.lineWidth = 2.4; rrPath(g, 86, 108, 164, 66, 11); g.stroke();
    inkLine(g, [[120, 82], [120, 100]], 3, INK, { taper: 0, wobble: 0 }); inkLine(g, [[216, 82], [216, 100]], 3, INK, { taper: 0, wobble: 0 });
    // the floor and a low round riser under the drum
    const fl = g.createLinearGradient(0, 648, 0, 720); fl.addColorStop(0, '#2a1d5a'); fl.addColorStop(1, '#0a071c');
    g.fillStyle = fl; g.fillRect(0, 648, 1280, 72);
    inkLine(g, [[0, 650], [1280, 650]], 2.6, 'rgba(45,23,15,0.8)', { taper: 0, wobble: 0 });
    g.strokeStyle = 'rgba(255,126,182,0.10)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 658 + i * 12); g.lineTo(1280, 658 + i * 12); g.stroke(); }
    celOval(g, 640, 692, 270, 24, '#3d2a7e', { line: 2.6, depth: 6 });
    g.strokeStyle = HV.pink; g.lineWidth = 3; g.beginPath(); g.ellipse(640, 692, 246, 20, 0, 0, TAU); g.stroke();
    // the big drum pad: stand legs, a cream body with a pink and green zigzag, a chrome hoop, a dark pad with a target ring
    [[560, 628, 506, 698], [720, 628, 774, 698], [640, 636, 640, 706]].forEach((l) => { inkLine(g, [[l[0], l[1]], [l[2], l[3]]], 11, INK, { taper: 0, wobble: 0 }); inkLine(g, [[l[0], l[1]], [l[2], l[3]]], 6, '#c9cbd6', { taper: 0, wobble: 0 }); });
    const hx = FORGE.hit.x, hy = FORGE.hit.y;
    cel(g, [[hx - 152, hy, 1], [hx - 148, hy + 90, 1], [hx - 80, hy + 112], [hx, hy + 118], [hx + 80, hy + 112], [hx + 148, hy + 90, 1], [hx + 152, hy, 1]], HV.cream, { line: 2.8, depth: 14, tension: 0.7,
      decor: (c) => {
        c.fillStyle = HV.pink; c.beginPath(); c.moveTo(hx - 160, hy + 36); for (let k = 0; k <= 16; k++) c.lineTo(hx - 160 + k * 20, hy + (k % 2 ? 62 : 36)); c.lineTo(hx + 160, hy + 78); c.lineTo(hx - 160, hy + 78); c.closePath(); c.fill();
        c.fillStyle = HV.green; c.fillRect(hx - 160, hy + 82, 320, 12);
      } });
    for (let k = -3; k <= 3; k++) cel(g, R4(hx + k * 44 - 5, hy + 8, 10, 22), '#c9cbd6', { line: 1.8, depth: 3, tension: 0 });
    celOval(g, hx, hy, 154, 28, '#c9cbd6', { line: 2.8, depth: 6 });
    celOval(g, hx, hy + 1, 142, 23, '#2a2438', { line: 2.4, depth: 7, shadow: '#1a1426' });
    g.strokeStyle = HV.pink; g.lineWidth = 3.4; g.beginPath(); g.ellipse(hx, hy + 1, 104, 16, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(hx, hy + 1, 130, 20, 0, Math.PI * 1.06, Math.PI * 1.4); g.stroke();
    g.fillStyle = HV.pink; g.beginPath(); g.ellipse(hx, hy + 1, 7, 1.8, 0, 0, TAU); g.fill();
    // the mixing desk on the left: a teal front, a sloped panel with faders and knobs
    cel(g, { poly: [[44, 592], [336, 592], [330, 652], [50, 652]] }, HV.teal, { line: 2.8, depth: 9, tension: 0, hi: '#8ff0e4' });
    g.fillStyle = HV.cream; g.fillRect(52, 612, 276, 8); g.fillStyle = HV.pink; g.fillRect(52, 620, 276, 6);
    cel(g, { poly: [[62, 534], [322, 522], [336, 592], [44, 592]] }, '#2b2650', { line: 2.8, depth: 8, tension: 0 });
    for (let i = 0; i < 8; i++) {
      const x = 80 + i * 32, c = [HV.pink, HV.green, HV.gold, HV.cream, HV.lime, HV.violet, HV.pink, HV.green][i];
      celOval(g, x, 543, 7, 4.4, c, { line: 1.6, depth: 1 }); inkLine(g, [[x, 543], [x + 2, 540]], 1.4, INK, { taper: 0, wobble: 0 });
      cel(g, R4(x - 3, 556, 6, 30), '#14102c', { line: 1.4, depth: 0, tension: 0, shadow: false });
      cel(g, RR(x - 9, 560 + (i * 11) % 18, 18, 9, 3), c, { line: 1.8, depth: 2 });
    }
    // the mic stand with its boom, the mic and a round pop filter
    celOval(g, 176, 646, 44, 9, '#3a3448', { line: 2.4, depth: 4 });
    inkLine(g, [[176, 640], [176, 392]], 9, INK, { taper: 0, wobble: 0 }); inkLine(g, [[176, 640], [176, 392]], 4.4, '#c9cbd6', { taper: 0, wobble: 0 });
    inkLine(g, [[176, 392], [250, 346]], 9, INK, { taper: 0, wobble: 0 }); inkLine(g, [[176, 392], [250, 346]], 4.4, '#c9cbd6', { taper: 0, wobble: 0 });
    celOval(g, 176, 392, 9, 9, HV.pink, { line: 2.2, depth: 3 });
    cel(g, RR(236, 316, 34, 62, 14), '#2a2438', { line: 2.6, depth: 5, tension: 0.6, hi: '#615f6d' });
    for (let k = 0; k < 5; k++) inkLine(g, [[240, 326 + k * 10], [266, 326 + k * 10]], 1.4, 'rgba(255,255,255,0.35)', { taper: 0, wobble: 0 });
    celOval(g, 296, 347, 10, 42, 'rgba(255,255,255,0.1)', { line: 3, depth: 0, shadow: false, lineColor: HV.lime });
    g.strokeStyle = 'rgba(198,255,61,0.4)'; g.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(296 - 9 * Math.sqrt(1 - Math.pow(k / 3.5, 2)), 347 + k * 11); g.lineTo(296 + 9 * Math.sqrt(1 - Math.pow(k / 3.5, 2)), 347 + k * 11); g.stroke(); }
    // the two speakers on the right: cabinets (the cones are live)
    cel(g, RR(1030, 190, 200, 232, 16), '#2b2650', { line: 3, depth: 10, tension: 0.4 });
    cel(g, RR(1010, 440, 240, 206, 16), '#2b2650', { line: 3, depth: 10, tension: 0.4 });
    g.strokeStyle = HV.cream; g.lineWidth = 2.2; rrPath(g, 1038, 198, 184, 216, 11); g.stroke(); rrPath(g, 1018, 448, 224, 190, 11); g.stroke();
    celOval(g, 1130, 238, 24, 24, '#c9cbd6', { line: 2.2, depth: 4 }); celOval(g, 1130, 238, 15, 15, '#14102c', { line: 1.8, depth: 3 });
    FORGE_WOOFERS.forEach((w) => celOval(g, w.x, w.y, w.r + 8, w.r + 8, '#c9cbd6', { line: 2.6, depth: 6 }));
  }

  const HAMMER_KEYS = [[0, null], [0.19, 0.26], [0.33, -0.3], [0.52, 0.26], [0.64, -0.14], [0.84, 0.26], [1.35, null]];     // null: the rest angle the blow starts from and settles to
  const HIT_TIMES = [0.19, 0.52, 0.84];
  function hammerAngle(tt, rest) {
    const key = (i) => (HAMMER_KEYS[i][1] === null ? rest : HAMMER_KEYS[i][1]);
    if (tt <= 0) return key(0);
    for (let i = 1; i < HAMMER_KEYS.length; i++) {
      const a = key(i - 1), b = key(i);
      if (tt <= HAMMER_KEYS[i][0]) { const u = (tt - HAMMER_KEYS[i - 1][0]) / (HAMMER_KEYS[i][0] - HAMMER_KEYS[i - 1][0]); const e = b > a ? u * u * u : 1 - (1 - u) * (1 - u); return a + (b - a) * e; }
    }
    return key(HAMMER_KEYS.length - 1);
  }

  // the drumstick: a tapered wooden stick with pink and green grip tape at the hand end and a round bead at the tip, hinged at FORGE.pivot (its +x runs from the hand to the bead)
  function drawHammer(ctx, ang) {
    const P = FORGE.pivot;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang)));
    cel(ctx, { poly: [[-16, -9], [90, -8], [214, -5.4], [214, 5.4], [90, 8], [-16, 9]] }, '#e6b57a', { line: 2.8, depth: 4, tension: 0, hi: '#ffe0b0', hiW: 2 });
    cel(ctx, { poly: [[-16, -9], [74, -8], [74, 8], [-16, 9]] }, HV.pink, { line: 2.4, depth: 3, tension: 0, hi: HV.pinkL, hiW: 2 });
    ctx.fillStyle = HV.green; for (let i = 0; i < 3; i++) ctx.fillRect(2 + i * 22, -7.4, 8, 14.8);
    inkLine(ctx, [[74, -8], [74, 8]], 2.4, INK, { taper: 0, wobble: 0 });
    celOval(ctx, 226, 0, 17, 15, '#f2c994', { line: 2.8, depth: 5, hi: '#fff0d4', hiW: 2.4 });
    ctx.restore();
  }

  function paintForge(ctx, t, S) {
    layer(ctx, 'nk:forge:bg', 1280, 720, forgeBackdrop);
    const m = motionK();
    const tt = S.strike ? t - S.strike.t0 : -1;
    // one envelope for the whole room: how recently a blow landed (1 on the hit, falling to 0 over 0.45 s)
    let env = 0;
    if (tt >= 0) HIT_TIMES.forEach((ht) => { const age = tt - ht; if (age >= 0 && age < 0.45) env = Math.max(env, 1 - age / 0.45); });
    // the pad's glow, and the notes' warm light
    const hx = FORGE.hit.x, hy = FORGE.hit.y;
    glow(ctx, hx, hy - 10, 300 + 70 * env, HV.pink, 0.1 + 0.05 * Math.sin(t * 2.2) + 0.3 * env);
    glow(ctx, 168, 300, 240, '#ffcf8a', 0.08);
    // the woofers thump with the blows
    FORGE_WOOFERS.forEach((w) => {
      const k = 1 + 0.06 * env;
      celOval(ctx, w.x, w.y, w.r * k, w.r * k, '#1c1636', { line: 2.4, depth: 7 });
      celOval(ctx, w.x - 3, w.y - 3, w.r * 0.42 * k, w.r * 0.42 * k, HV.pink, { line: 2, depth: 4, hi: HV.pinkL });
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, Math.max(1, w.r * 0.74 * k), 0, TAU); ctx.stroke();
    });
    // the ON AIR light: switched on for the strike
    const on = S.strike && tt < 2.6;
    const lit = on ? 0.85 + 0.15 * Math.sin(t * 12) : 0;
    ctx.save();
    ctx.fillStyle = on ? rgba('#ff3d5e', 0.9 + 0.1 * lit) : '#4a1a2c'; ctx.beginPath(); rrPath(ctx, 90, 112, 156, 58, 9); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 34px ' + (TK() ? TK().font.display : 'sans-serif');
    ctx.fillStyle = on ? '#fff4e6' : '#7a3a4a'; ctx.fillText('ON AIR', FORGE_LAMP.x, FORGE_LAMP.y + 1);
    ctx.restore();
    if (on) glow(ctx, FORGE_LAMP.x, FORGE_LAMP.y, 150, '#ff3d5e', 0.5 * lit);
    // the desk's level meter bounces (and jumps on a blow)
    for (let i = 0; i < 5; i++) {
      const h = 4 + (0.5 + 0.5 * Math.sin(t * (3 + i * 0.7) + i * 1.7)) * 8 * m + env * 12, x = 286 + i * 8;
      ctx.fillStyle = i < 3 ? HV.green : i < 4 ? HV.gold : HV.pink; ctx.fillRect(x, 580 - h, 5, h);
    }
    // the stick: hangs and sways until a strike starts
    const wantRest = S.phase ? FORGE.restUp : FORGE.rest;
    S.restAng = S.restAng === undefined ? wantRest : S.restAng + (wantRest - S.restAng) * clamp((t - (S.restT === undefined ? t : S.restT)) * 7, 0, 1);
    S.restT = t;
    const ang = tt < 0 ? S.restAng + Math.sin(t * 1.3) * 0.02 * m : hammerAngle(tt, S.restAng);
    const idle = tt < 0;
    if (idle) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1280, FORGE.cardsEnd); ctx.clip(); }
    drawHammer(ctx, ang);
    if (idle) ctx.restore();
    // every blow: the pad's face flashes, sound rings spread over it and cream sparkles fly up
    if (S.strike) {
      HIT_TIMES.forEach((ht, k) => {
        const age = tt - ht;
        if (age < 0 || age > 0.8) return;
        const fade = 1 - age / 0.8, rc = [HV.pink, HV.cream, HV.green][k % 3];
        ctx.fillStyle = rgba('#fff4e6', 0.5 * Math.max(0, 1 - age / 0.12)); ctx.beginPath(); ctx.ellipse(hx, hy + 1, 140, 22, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const q = age - i * 0.1; if (q <= 0) continue;
          const rx = 24 + q * 250;
          ctx.strokeStyle = rgba(i === 1 ? HV.cream : rc, Math.max(0, 0.9 * (1 - q / 0.7))); ctx.lineWidth = 4 - i; ctx.beginPath(); ctx.ellipse(hx, hy - 4, rx, rx * 0.16, 0, 0, TAU); ctx.stroke();
        }
        const rr = U.rng(U.hash('sparks', k)), n = k === 0 ? 14 : 8;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI * (0.08 + rr() * 0.84), v = 150 + rr() * 300 * (k === 0 ? 1 : 0.65);
          const x = hx + Math.cos(a) * v * age, y = hy - 8 + Math.sin(a) * v * age + 700 * age * age * 0.5;
          sparkleAt(ctx, x, y, 3 + rr() * 5 * fade, { color: rr() > 0.5 ? '#fff4e6' : rc, alpha: fade, glow: 0.3 });
        }
        glow(ctx, hx, hy - 10, 210 * fade, '#ffd9ec', 0.5 * fade);
      });
    }
    // the pad hums when nothing is happening: a note floats up now and then
    const tk = TK();
    if (tk) {
      for (let i = 0; i < 3; i++) {
        const ph = (((t * 0.1 * m + i / 3) % 1) + 1) % 1;
        safe(() => tk.note(ctx, hx + 70 + Math.sin(ph * 8 + i * 2.1) * 30 - i * 60, hy - 30 - ph * 80, 7 + (i % 2) * 2, { kind: ['eighth', 'beamed', 'quarter'][i], color: i % 2 ? HV.pinkL : HV.cream, alpha: Math.sin(ph * Math.PI) * 0.7, rot: Math.sin(ph * 6 + i) * 0.2, line: 1.5 }));
      }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.5 }));
    }
    if (S.flashT !== undefined) { const fa = Math.max(0, 1 - (t - S.flashT) / 0.55); if (fa > 0) { ctx.fillStyle = 'rgba(255,240,220,' + (fa * 0.4).toFixed(3) + ')'; ctx.fillRect(0, 0, 1280, 720); } }
  }

  // the two Studio plaques (260 x 130): a drumstick hitting the pad with a card waiting (Rehearse a Card), a cut gem (Set Gems)
  function ciUp(g) {
    ciBg(g, 260, 130, '#2a1a5a', '#6a2a7a');
    g.fillStyle = 'rgba(255,244,214,0.14)'; g.beginPath(); g.moveTo(130, 0); g.lineTo(170, 0); g.lineTo(224, 126); g.lineTo(76, 126); g.closePath(); g.fill();
    cel(g, [[88, 106, 1], [92, 124], [150, 130], [208, 124], [212, 106, 1]], HV.cream, { line: 2.2, depth: 9, tension: 0.7, decor: (c) => { c.fillStyle = HV.pink; c.fillRect(80, 112, 140, 8); c.fillStyle = HV.green; c.fillRect(80, 120, 140, 6); } });
    celOval(g, 150, 104, 62, 12, '#c9cbd6', { line: 2.2, depth: 4 });
    celOval(g, 150, 105, 56, 9, '#2a2438', { line: 2, depth: 4, shadow: '#1a1426' });
    g.strokeStyle = HV.pink; g.lineWidth = 2; g.beginPath(); g.ellipse(150, 105, 40, 6, 0, 0, TAU); g.stroke();
    g.save(); g.translate(40, 70); g.rotate(-0.2);
    cel(g, R4(-24, -38, 48, 72), HV.cream, { line: 2.2, depth: 6, tension: 0 }); cel(g, R4(-24, -38, 48, 14), HV.pink, { line: 1.8, depth: 1, tension: 0, shadow: false });
    starAt(g, 0, 4, 11, HV.gold, 0, 1.8);
    g.restore();
  }
  function forgeIcon(g, kind, t, w, h) {
    const m = motionK();
    if (kind === 'up') {
      layer(g, 'nk:fi:up', w, h, ciUp);
      // the stick swings down onto the pad (the same beat as the real strike), a ring spreads over the pad and cream sparkles fly
      const c = (((t * 0.9 * m) % 1) + 1) % 1;
      const ang = c < 0.4 ? -0.9 + (c / 0.4) * 1.16 : -0.9 + 1.16 * (1 - (c - 0.4) / 0.6);
      g.save(); g.translate(244, 78); g.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang))); g.scale(0.42, 0.42);
      g.beginPath(); g.moveTo(-16, -9); g.lineTo(90, -8); g.lineTo(214, -5.4); g.lineTo(214, 5.4); g.lineTo(90, 8); g.lineTo(-16, 9); g.closePath(); g.fillStyle = '#e6b57a'; g.fill(); g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
      g.fillStyle = HV.pink; g.fillRect(-14, -8, 86, 16);
      g.beginPath(); g.arc(226, 0, 16, 0, TAU); g.fillStyle = '#f2c994'; g.fill(); g.stroke();
      g.restore();
      if (c > 0.36 && c < 0.78) {
        const age = (c - 0.36) / 0.42, rx = 12 + age * 70;
        g.strokeStyle = rgba(HV.pink, 0.9 * (1 - age)); g.lineWidth = 2.4; g.beginPath(); g.ellipse(150, 102, rx, rx * 0.17, 0, 0, TAU); g.stroke();
        for (let i = 0; i < 6; i++) { const a = -Math.PI * (0.15 + (i % 5) * 0.17); sparkleAt(g, 150 + Math.cos(a) * age * 54, 98 + Math.sin(a) * age * 50 + age * age * 22, 3 + (i % 3), { color: i % 2 ? '#fff4e6' : HV.pinkL, alpha: 1 - age, glow: 0.2 }); }
      }
      sparkleAt(g, 70, 28, 5 + 2 * Math.sin(t * 4), { color: '#ffffff', alpha: 0.9 });
    } else {
      ciBg(g, w, h, '#1b1050', '#3c1f7a');
      g.save(); g.translate((w - 224) / 2, (h - 104) / 2);
      campIcon(g, 'gems', t, 224, 104);
      g.restore();
    }
  }

  // ---------------------------------------------------------------- the Gift Box: a box in the act's colour with a big ribbon bow and a heart tag, on a small round stage
  // The box opens when it is told to: the bow unties (the ribbon ends fly), the lid pops up and lands beside the box, confetti and a "ta-da" sparkle burst out. Timings are the old chest's:
  // p runs 0 to 1 over 0.85 s (out-cubic) after the tap, and the confetti plays on for about three seconds from the moment of the tap.
  const CHEST = { x: 640, y: 622 };
  const GIFT_ACT = { 1: { box: '#2bb3b1', rib: '#ff9fc6', acc: '#fff4e6' }, 2: { box: '#3d7bff', rib: '#ff6fb5', acc: '#3ff0ff' }, 3: { box: '#e6d9ff', rib: '#d9fff4', acc: '#ff8fb8' } };
  const giftAct = (S) => GIFT_ACT[clamp((S && S.R && S.R.chapter) | 0, 1, 3)] || GIFT_ACT[1];
  const GIFT_BULBS = [];
  function chestBackdrop(g) {
    GIFT_BULBS.length = 0;
    const r = U.rng(90210);
    const night = g.createLinearGradient(0, 0, 0, 720); night.addColorStop(0, '#120c33'); night.addColorStop(0.6, '#2a1a62'); night.addColorStop(1, '#14102c');
    g.fillStyle = night; g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,248,236,' + (0.2 + r() * 0.55).toFixed(2) + ')'; const sz = r() > 0.9 ? 2.4 : 1.5; g.fillRect(r() * 1280, 70 + r() * 400, sz, sz); }
    // the spotlight cone on the stage
    const cone = g.createLinearGradient(0, 0, 0, 650); cone.addColorStop(0, 'rgba(255,244,214,0.30)'); cone.addColorStop(1, 'rgba(255,244,214,0.04)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(600, 0); g.lineTo(680, 0); g.lineTo(980, 650); g.lineTo(300, 650); g.closePath(); g.fill();
    // the curtains at both sides, gathered and tied back, with a swag along the top
    const curtain = (flip) => {
      const X = (x) => (flip ? 1280 - x : x);
      g.save();
      g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(236), 0); g.bezierCurveTo(X(250), 160, X(190), 300, X(172), 430); g.bezierCurveTo(X(150), 520, X(110), 600, X(0), 646); g.closePath();
      const cg = g.createLinearGradient(X(0), 0, X(240), 0); cg.addColorStop(0, '#8f1838'); cg.addColorStop(0.5, '#c8264f'); cg.addColorStop(1, '#a31d42');
      g.fillStyle = cg; g.fill(); g.clip();
      for (let k = 0; k < 9; k++) { const x0 = k * 30; g.fillStyle = k % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(40,5,20,0.20)'; g.beginPath(); g.moveTo(X(x0), 0); g.lineTo(X(x0 + 18), 0); g.lineTo(X(x0 + 6 + k * 3), 650); g.lineTo(X(x0 - 8 + k * 3), 650); g.closePath(); g.fill(); }
      g.restore();
      g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(236), 0); g.bezierCurveTo(X(250), 160, X(190), 300, X(172), 430); g.bezierCurveTo(X(150), 520, X(110), 600, X(0), 646); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      inkLine(g, [[X(176), 420], [X(236), 452], [X(256), 500]], 9, INK, { taper: 0, wobble: 0 }); inkLine(g, [[X(176), 420], [X(236), 452], [X(256), 500]], 5, HV.gold, { taper: 0, wobble: 0 });
      celOval(g, X(262), 512, 10, 16, HV.gold, { line: 2, depth: 3 });
      // the swag at the top of the curtain
      cel(g, [[X(-10), -6, 1], [X(250), -6, 1], [X(262), 52], [X(200), 74], [X(130), 62], [X(60), 80], [X(-10), 56, 1]], '#c8264f', { line: 2.6, depth: 8, tension: 0.7 });
    };
    curtain(false); curtain(true);
    // the stage: a cream lip, a violet top with a pink ring, a dark floor round it
    const fl = g.createLinearGradient(0, 640, 0, 720); fl.addColorStop(0, '#2a1a5a'); fl.addColorStop(1, '#0a071c');
    g.fillStyle = fl; g.fillRect(0, 640, 1280, 80);
    inkLine(g, [[0, 642], [1280, 642]], 2.4, 'rgba(45,23,15,0.8)', { taper: 0, wobble: 0 });
    celOval(g, 640, 654, 340, 46, HV.cream, { line: 2.8, depth: 9 });
    celOval(g, 640, 648, 322, 38, '#5b3fa8', { line: 2.4, depth: 9 });
    g.strokeStyle = HV.pink; g.lineWidth = 3.4; g.beginPath(); g.ellipse(640, 649, 282, 32, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,244,230,0.5)'; g.lineWidth = 1.6; g.setLineDash([8, 8]); g.beginPath(); g.ellipse(640, 649, 240, 27, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    // a few confetti pieces left on the stage from the last party
    for (let i = 0; i < 14; i++) { const a = r() * TAU, d = Math.sqrt(r()), x = 640 + Math.cos(a) * d * 280, y = 649 + Math.sin(a) * d * 28; g.fillStyle = [HV.pink, HV.green, HV.gold, HV.sky][i % 4]; g.fillRect(x, y, 6, 3); }
    // fairy lights across the top between the curtains
    fairyString(g, 262, 54, 1018, 54, 44, 17, [HV.gold, HV.pink, HV.green, HV.cream, HV.sky], 4.8).forEach((b) => GIFT_BULBS.push(b));
  }

  function giftBow(g, rib, ribD) {
    const loop = (sx) => {
      cel(g, [[0, 0, 1], [sx * 18, -30], [sx * 52, -44], [sx * 78, -26], [sx * 70, 2], [sx * 38, 8], [0, 0, 1]], rib, { line: 2.4, depth: 7, tension: 0.8, hi: true });
      inkLine(g, [[sx * 12, -4], [sx * 36, -22], [sx * 58, -22]], 2, ribD, { taper: 0.5, wobble: 0 });
    };
    loop(-1); loop(1);
    celOval(g, 0, 2, 16, 14, rib, { line: 2.6, depth: 5, hi: true });
    inkLine(g, [[-5, -3], [5, 8]], 2, ribD, { taper: 0.4, wobble: 0 });
  }
  function giftTail(g, rib) {
    cel(g, { poly: [[-10, 0], [10, 0], [13, 70], [0, 56], [-13, 70]] }, rib, { line: 2.4, depth: 5, tension: 0, hi: true });
  }
  const GIFT_CONFETTI = (() => {
    const r = U.rng(4711), out = [];
    for (let i = 0; i < 46; i++) out.push({ a: -Math.PI * (0.12 + r() * 0.76), v: 260 + r() * 520, s: 4 + r() * 6, c: [HV.pink, HV.green, HV.gold, HV.sky, HV.cream, HV.violet][i % 6], k: i % 3, spin: (r() - 0.5) * 14, sw: r() * 6 });
    return out;
  })();
  // (x, y) is the middle of the box's feet; p is how far open it is, t the frame clock, age the seconds since the tap (huge when it was opened long ago)
  function drawChest(ctx, x, y, p, t, act, age) {
    const A = act || GIFT_ACT[1], m = motionK();
    const ribD = warm(A.rib, 0.16), boxD = warm(A.box);
    const hop = p === 0 && m === 1 ? Math.max(0, Math.sin((((t % 4.2) + 4.2) % 4.2) / 0.55 * Math.PI)) : 0;
    ctx.save(); ctx.translate(x, y - 16 * hop);
    ctx.fillStyle = 'rgba(8,4,24,0.5)'; ctx.beginPath(); ctx.ellipse(0, 6 + 16 * hop, 188 - 10 * hop, 18 - 3 * hop, 0, 0, TAU); ctx.fill();
    ctx.scale(1 + 0.04 * hop, 1 - 0.05 * hop);
    // the inside of the box shows once the lid is off: a dark opening and a warm light that grows
    if (p > 0.02) {
      ctx.save(); ctx.globalAlpha = Math.min(1, p * 3);
      celOval(ctx, 0, -84, 132, 16, '#1a0f2e', { line: 2.4, depth: 0, shadow: false });
      const ig = ctx.createRadialGradient(0, -86, 4, 0, -86, 150); ig.addColorStop(0, '#fffbe0'); ig.addColorStop(0.45, 'rgba(255,224,120,0.75)'); ig.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(0, -86, 128, 14 + 6 * p, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the body: the act's colour, a ribbon down the middle, little cream stars all over
    cel(ctx, { poly: [[-140, -84], [140, -84], [146, 0], [-146, 0]] }, A.box, { line: 2.8, depth: 14, tension: 0, hi: true, shadow: boxD,
      decor: (c) => {
        c.fillStyle = A.rib; c.fillRect(-23, -90, 46, 94); c.fillStyle = ribD; c.fillRect(-23, -90, 7, 94);
        c.fillStyle = 'rgba(255,244,230,0.55)';
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const sx = (i < 2 ? -112 + i * 44 : 52 + (i - 2) * 44) + (j % 2) * 14, sy = -64 + j * 26; c.beginPath(); for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4 - Math.PI / 2, rr = q % 2 ? 2.4 : 6.4; c.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } c.closePath(); c.fill(); }
      } });
    inkLine(ctx, [[-23, -84], [-23, 0]], 1.8, 'rgba(45,23,15,0.6)', { taper: 0, wobble: 0 }); inkLine(ctx, [[23, -84], [23, 0]], 1.8, 'rgba(45,23,15,0.6)', { taper: 0, wobble: 0 });
    if (p > 0.3) glow(ctx, 0, -84, 200 * p, '#ffe9a8', 0.28 * p);
    // the lid: a wider slab with a ribbon across it. It pops up, tumbles and lands to the right of the box.
    const q = clamp(p, 0, 1);
    const lx = q * 300, ly = -102 + (-20 + 102) * q - 150 * Math.sin(Math.PI * q), lr = -1.0 * Math.sin(Math.PI * q) + 0.05 * q;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(lr);
    cel(ctx, RR(-154, -22, 308, 44, 8), A.box, { line: 2.8, depth: 9, tension: 0.4, hi: true, shadow: boxD, decor: (c) => { c.fillStyle = A.rib; c.fillRect(-23, -26, 46, 52); c.fillStyle = ribD; c.fillRect(-23, -26, 7, 52); } });
    inkLine(ctx, [[-23, -22], [-23, 22]], 1.8, 'rgba(45,23,15,0.6)', { taper: 0, wobble: 0 }); inkLine(ctx, [[23, -22], [23, 22]], 1.8, 'rgba(45,23,15,0.6)', { taper: 0, wobble: 0 });
    // the bow rides on the lid until it is untied
    if (q < 0.34) {
      const k = 1 - q / 0.34;
      ctx.save(); ctx.translate(0, -24); ctx.globalAlpha = k; ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      if (m === 1 && p === 0) ctx.rotate(Math.sin(t * 1.4) * 0.025);
      giftBow(ctx, A.rib, ribD);
      ctx.save(); ctx.translate(-6, 6); ctx.rotate(0.12); giftTail(ctx, A.rib); ctx.restore();
      ctx.save(); ctx.translate(8, 6); ctx.rotate(-0.16); giftTail(ctx, A.rib); ctx.restore();
      ctx.restore();
      // the heart tag on its string
      ctx.save(); ctx.globalAlpha = k;
      inkLine(ctx, [[10, -22], [44, -4], [56, 14]], 1.8, INK, { taper: 0, wobble: 0 });
      ctx.translate(56, 30 + (p === 0 && m === 1 ? Math.sin(t * 1.8) * 1.5 : 0)); ctx.rotate(0.18);
      cel(ctx, R4(-17, -18, 34, 36), HV.cream, { line: 2, depth: 4, tension: 0 });
      heartAt(ctx, 0, -1, 9, HV.pink, 1.8);
      ctx.restore();
    }
    ctx.restore();
    // the untied ribbon ends fly out and land on the stage on either side
    if (q >= 0.12) {
      const u = clamp((q - 0.12) / 0.88, 0, 1);
      [[-1, -196, 0.5], [1, 168, -0.4]].forEach((e) => {
        const ex = e[0] * (14 + (Math.abs(e[1]) - 14) * u), ey = -126 + (-8 + 126) * u * u - 120 * Math.sin(Math.PI * u), er = e[0] * (-0.3 - 4.6 * u) + e[2] * u;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(er); ctx.globalAlpha = 1; giftTail(ctx, A.rib); ctx.restore();
      });
    }
    ctx.restore();
    // confetti and the ta-da: from the opening, from the tap on
    if (age >= 0 && age < 3.4) {
      ctx.save(); ctx.translate(x, y - 90);
      GIFT_CONFETTI.forEach((c, i) => {
        const a = age - 0.04 * (i % 5); if (a <= 0) return;
        const px = Math.cos(c.a) * c.v * a + Math.sin(a * 3 + c.sw) * 14 * m, py = Math.sin(c.a) * c.v * a + 620 * a * a * 0.5 - 60 * Math.min(a, 0.3) * 0;
        if (py > 100) return;
        ctx.globalAlpha = clamp(1.3 - a / 3.0, 0, 1); ctx.fillStyle = c.c;
        if (c.k === 0) ctx.fillRect(px - c.s / 2, py - c.s / 4 + Math.sin(a * c.spin) * 2, c.s, c.s / 2); else if (c.k === 1) { ctx.beginPath(); ctx.arc(px, py, c.s * 0.38, 0, TAU); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(px, py - c.s * 0.5); ctx.lineTo(px + c.s * 0.5, py + c.s * 0.4); ctx.lineTo(px - c.s * 0.5, py + c.s * 0.4); ctx.closePath(); ctx.fill(); }
      });
      ctx.restore();
      if (age > 0.1 && age < 1.2) {
        const k = Math.sin(clamp((age - 0.1) / 1.1, 0, 1) * Math.PI);
        sparkleAt(ctx, x, y - 190, 20 + 56 * k, { color: '#ffffff', alpha: k, glow: 0.8, rot: age * 0.6 });
        sparkleAt(ctx, x - 92, y - 164, 8 + 18 * k, { color: HV.pinkL, alpha: k, glow: 0.5, rot: -age });
        sparkleAt(ctx, x + 96, y - 176, 8 + 20 * k, { color: HV.gold, alpha: k, glow: 0.5, rot: age });
      }
    }
  }

  function paintChest(ctx, t, S) {
    layer(ctx, 'nk:chest:bg', 1280, 720, chestBackdrop);
    const c = S.chest || { state: 'closed', t0: -10 };
    const p = c.state === 'open' ? 1 : c.state === 'opening' ? U.ease.outCubic(clamp((t - c.t0) / 0.85, 0, 1)) : 0;
    const age = c.state === 'closed' ? -1 : t - c.t0;
    const m = motionK(), A = giftAct(S);
    GIFT_BULBS.forEach((b, i) => glow(ctx, b[0], b[1] + 3, 17, b[2], 0.26 + 0.3 * (0.5 + 0.5 * Math.sin(t * (1.2 + (i % 4) * 0.35) * m + i * 2.1))));
    // the pulse of a closed box: a warm light round it; once open the light grows
    glow(ctx, CHEST.x, CHEST.y - 70, 320 + 220 * p, '#ffe0b0', 0.16 + 0.1 * p + (p === 0 ? 0.04 * Math.sin(t * 2.4) : 0));
    if (p > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(CHEST.x, CHEST.y - 100);
      for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i - 6.5) * 0.15 + Math.sin(t * 0.4 + i) * 0.02; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.03) * 620, Math.sin(a - 0.03) * 620); ctx.lineTo(Math.cos(a + 0.03) * 620, Math.sin(a + 0.03) * 620); ctx.closePath(); ctx.fillStyle = 'rgba(255,236,190,' + (0.11 * p * (0.6 + 0.4 * Math.sin(t * 2 + i))).toFixed(3) + ')'; ctx.fill(); }
      ctx.restore();
    }
    drawChest(ctx, CHEST.x, CHEST.y, p, t, A, age);
    const tk = TK();
    if (tk) {
      if (p > 0.2) for (let i = 0; i < 16; i++) { const ph = (((t * 0.35 * m + i * 0.0625) % 1) + 1) % 1; sparkleAt(ctx, CHEST.x + Math.sin(i * 2.3 + t) * (30 + ph * 150), CHEST.y - 130 - ph * 420, 3 + (i % 3) * 2, { color: i % 3 ? '#ffe9a8' : '#ffffff', alpha: Math.sin(ph * Math.PI) * p }); }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.5 }));
    }
  }

  // ---------------------------------------------------------------- the Sparkle Booth: a little photo booth, a bulb frame, three cushions on pedestals, a glow under each gem
  // The plinths, the floor shadows and the three glows are where CACHE says (the DOM gem columns read the same table): the alignment test counts exactly three plinth tops
  // (celOval x, plinthY, 82, 20), three floor shadows (ellipse x, 668, 110, 16) and three tk.glow calls, so the bulbs' light is drawn without tk.glow (see softDot).
  const CACHE_BULBS = [];
  function cacheBackdrop(g) {
    CACHE_BULBS.length = 0;
    const r = U.rng(5150);
    const bgc = g.createRadialGradient(640, 330, 40, 640, 400, 900); bgc.addColorStop(0, '#4a1f6e'); bgc.addColorStop(0.55, '#2a1250'); bgc.addColorStop(1, '#10082a');
    g.fillStyle = bgc; g.fillRect(0, 0, 1280, 720);
    // the booth curtain: deep violet with gathered folds
    g.save();
    g.beginPath(); g.rect(64, 100, 1152, 510); g.clip();
    for (let k = 0; k < 24; k++) { const x0 = 64 + k * 48; g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(10,2,30,0.28)'; g.beginPath(); g.moveTo(x0, 100); g.lineTo(x0 + 30, 100); g.lineTo(x0 + 22 + (k % 3) * 4, 610); g.lineTo(x0 - 8, 610); g.closePath(); g.fill(); }
    g.restore();
    // a few tiny stars on the curtain
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,244,230,' + (0.15 + r() * 0.3).toFixed(2) + ')'; g.fillRect(70 + r() * 1140, 130 + r() * 470, 2, 2); }
    // the canopy: pink and cream stripes with a scalloped edge
    for (let x = 60; x < 1220; x += 56) { g.fillStyle = ((x - 60) / 56) % 2 ? HV.cream : HV.pink; g.fillRect(x, 56, 56, 40); }
    g.fillStyle = 'rgba(45,23,15,0.16)'; g.fillRect(60, 56, 1160, 12);
    for (let x = 60, i = 0; x < 1220; x += 56, i++) { g.beginPath(); g.moveTo(x, 95); g.lineTo(x + 56, 95); g.quadraticCurveTo(x + 56, 112, x + 28, 114); g.quadraticCurveTo(x, 112, x, 95); g.closePath(); g.fillStyle = i % 2 ? HV.cream : HV.pink; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke(); }
    inkLine(g, [[60, 56], [1220, 56]], 3, INK, { taper: 0, wobble: 0 });
    // the lightbulb frame: along the canopy edge and down both sides
    const cols = [HV.gold, HV.pink, HV.cream, HV.green, HV.sky];
    for (let i = 0; i < 28; i++) { const x = 78 + i * 42.4, y = 121; bulbDot(g, x, y, 5.2, cols[i % 5]); CACHE_BULBS.push([x, y, cols[i % 5]]); }
    for (let i = 0; i < 11; i++) { const y = 150 + i * 42; bulbDot(g, 66, y, 5.2, cols[i % 5]); CACHE_BULBS.push([66, y, cols[i % 5]]); bulbDot(g, 1214, y, 5.2, cols[(i + 2) % 5]); CACHE_BULBS.push([1214, y, cols[(i + 2) % 5]]); }
    // the stage floor with a cream lip, three floor shadows and three pedestals with cushions
    const fl = g.createLinearGradient(0, 606, 0, 720); fl.addColorStop(0, '#2a1654'); fl.addColorStop(1, '#0a0620');
    g.fillStyle = fl; g.fillRect(0, 606, 1280, 114);
    g.fillStyle = HV.cream; g.fillRect(0, 604, 1280, 6); inkLine(g, [[0, 604], [1280, 604]], 2.4, INK, { taper: 0, wobble: 0 }); inkLine(g, [[0, 610], [1280, 610]], 2.4, INK, { taper: 0, wobble: 0 });
    g.strokeStyle = 'rgba(255,126,182,0.12)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 626 + i * 20); g.lineTo(1280, 626 + i * 20); g.stroke(); }
    const py = CACHE.plinthY;
    [0, 1, 2].map(cacheX).forEach((x, i) => {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(x, 668, 110, 16, 0, 0, TAU); g.fill();
      cel(g, { poly: [[x - 84, 660], [x - 70, py], [x + 70, py], [x + 84, 660]] }, HV.cream, { line: 3, depth: 14, tension: 0.1,
        decor: (c) => { c.fillStyle = [HV.pink, HV.green, HV.gold][i]; c.fillRect(x - 90, py + 38, 180, 22); c.fillStyle = HV.violet; c.fillRect(x - 90, py + 60, 180, 6); } });
      celOval(g, x, py, 82, 20, '#c9cbd6', { line: 3.2, depth: 6 });
      celOval(g, x, py - 5, 62, 13.5, [HV.pink, '#8fe3c0', HV.gold][i], { line: 2.6, depth: 5, hi: true });
      celOval(g, x, py - 12, 5, 2.4, HV.cream, { line: 1.6, depth: 1 });
      g.strokeStyle = 'rgba(255,244,230,0.7)'; g.lineWidth = 1.8; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(x, py - 5, 55, 11.4, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    });
  }
  // a soft light dot without tk.glow (a radial gradient filled in additive blend)
  function softDot(ctx, x, y, r, hex, a) {
    if (!(r > 0.5) || !(a > 0.01)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(hex, Math.min(1, a))); gr.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  function paintCache(ctx, t, S) {
    layer(ctx, 'nk:cache:bg', 1280, 720, cacheBackdrop);
    const m = motionK();
    // the bulbs chase along the frame
    CACHE_BULBS.forEach((b, i) => softDot(ctx, b[0], b[1], 17, b[2], 0.14 + 0.4 * Math.max(0, Math.sin(t * 3.4 * m - i * 0.45))));
    [HV.pink, '#7cc6ff', HV.gold].forEach((c, i) => glow(ctx, cacheX(i), CACHE.glowY, 220 + 20 * Math.sin(t * 1.3 + i), c, 0.18 + 0.05 * Math.sin(t * 2 + i)));
    const tk = TK();
    if (tk) {
      safe(() => tk.mist(ctx, 0, 380, 1280, 340, t, { n: 5, seed: 12, alpha: 0.07, color: '#e6d9ff', speed: 7 }));
      for (let i = 0; i < 26; i++) { const v = (i * 0.618034) % 1, w = (i * 0.318 + 0.1) % 1; sparkleAt(ctx, 90 + v * 1100, 150 + ((w * 440 + t * 6 * m * (0.4 + v)) % 430), 2.5 + w * 4, { color: i % 2 ? '#fff4e6' : '#ffc2dc', alpha: 0.3 + 0.6 * Math.abs(Math.sin(t * (0.8 + v) + i)) }); }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.5 }));
    }
    void S;
  }

  // ==================================================================================================================
  // registration
  // ==================================================================================================================
  function defScreen(kind, music, enter) {
    return {
      music,
      enter(params, root) {
        const S = begin(kind, params, root);
        if (!S.R) { noRunScreen(S); return; }
        enter(S, params || {}, root);
      },
      leave() { endScreen(CUR); },
      update(dt, t) {
        const S = CUR;
        if (!S || S.dead) return;
        S.t = t;
        if (S.tickers.length) {
          // a ticker may add tickers (a line of the peddler starts a typewriter): they land in the fresh array and survive the pass
          const running = S.tickers; S.tickers = [];
          S.tickers = running.filter((fn) => { try { return !fn(dt, t); } catch (e) { warnOnce('ticker', e); return false; } }).concat(S.tickers);
        }
        S.lives.forEach((rec) => paintLive(rec, t));
      },
      draw(ctx, t) {
        const S = CUR;
        if (!S || !S.paint) return;
        try { S.paint(ctx, t, S); } catch (e) { warnOnce(S.kind + ' paint', e); }
      },
      onKey(e) { const S = CUR; return !!(S && S.keys && S.keys(e)); },
    };
  }

  UI.screens.reward = defScreen('reward', 'reward', enterReward);
  UI.screens.shop = defScreen('shop', 'shop', enterShop);
  UI.screens.event = defScreen('event', 'event', enterEvent);
  UI.screens.camp = defScreen('camp', 'camp', enterCamp);
  UI.screens.forge = defScreen('forge', 'camp', enterForge);
  UI.screens.chest = defScreen('chest', 'reward', enterChest);
  UI.screens.gemcache = defScreen('gemcache', 'event', enterGemCache);
  UI.overlays.deck = deckOverlayDef;
  UI.overlays.cardPick = cardPickOverlay;
})();
