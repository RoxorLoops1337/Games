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
//   * The painters for the peddler, bonfire, forge, chest, cache and desk are drawn here (ART.tk celFill, glow, sparkle with plain
//     canvas fallbacks): no scene art existed for them. Only reward and the event plate use ART.scene.draw, and every painter falls
//     back to plain canvas when the toolkit is missing. Icons come from UI.icon, so real icon art appears without a change here.
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
    // a lacquered indigo table in perspective with a gold braid along the far edge, and a pool of lantern light on it. The table is mirrored about the stage
    // axis (its right side runs off the screen), so the cards and the light sit on it however many are dealt.
    const ax = rwAxis(), L = 150, B = -50;
    const g1 = ctx.createLinearGradient(0, 400, 0, 720);
    g1.addColorStop(0, '#2c1f6b'); g1.addColorStop(0.35, '#1d1550'); g1.addColorStop(1, '#0f0b30');
    ctx.beginPath(); ctx.moveTo(L, 402); ctx.lineTo(2 * ax - L, 402); ctx.lineTo(2 * ax - B, 720); ctx.lineTo(B, 720); ctx.closePath();
    ctx.fillStyle = g1; ctx.fill();
    ctx.save(); ctx.clip();
    // seigaiha waves on the cloth
    ctx.strokeStyle = 'rgba(245,201,106,0.16)'; ctx.lineWidth = 1.4;
    for (let row = 0; row < 9; row++) {
      const y = 410 + row * row * 5 + row * 18, rr = 22 + row * 5.5;
      for (let x = -80; x < 1700; x += rr * 2) {
        const ox = x + (row % 2 ? rr : 0);
        for (let k = 3; k >= 1; k--) { ctx.beginPath(); ctx.arc(ox, y + rr * 0.6, rr * k / 3, Math.PI, 0); ctx.stroke(); }
      }
    }
    const g2 = ctx.createRadialGradient(ax, 560, 20, ax, 560, 520);
    g2.addColorStop(0, 'rgba(255,214,140,0.32)'); g2.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 380, 1280, 340);
    ctx.restore();
    ctx.strokeStyle = '#f5c96a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L, 402); ctx.lineTo(2 * ax - L, 402); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,15,46,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L - 4, 407); ctx.lineTo(2 * ax - L + 4, 407); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,201,106,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L - 10, 414); ctx.lineTo(2 * ax - L + 10, 414); ctx.stroke();
  }

  function paintRewardBack(ctx, t, S) {
    const sceneId = S.boss ? 'victory' : 'ch' + clamp((S.R && S.R.chapter) || 1, 1, 3);
    let drew = false;
    if (typeof ART !== 'undefined' && ART && ART.scene && isFn(ART.scene.draw)) { try { ART.scene.draw(ctx, sceneId, 1280, 720, t, { particles: true }); drew = true; } catch (e) { warnOnce('scene', e); } }
    if (!drew) { ctx.fillStyle = '#1a1340'; ctx.fillRect(0, 0, 1280, 720); }
    ctx.fillStyle = S.boss ? 'rgba(13,11,30,0.5)' : 'rgba(13,11,30,0.66)';
    ctx.fillRect(0, 0, 1280, 720);
    if (S.boss) {
      // a slow sunburst behind the banner (which is centred on the stage axis, see RW)
      ctx.save(); ctx.translate(rwAxis(), 96); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU + t * 0.05; ctx.rotate(0);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 900, a, a + 0.09); ctx.closePath();
        ctx.fillStyle = 'rgba(255,214,140,0.06)'; ctx.fill();
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
      if (S.boss || S.elite) for (let i = 0; i < (S.boss ? 16 : 7); i++) {
        const v = (i * 0.618034) % 1, w = (i * 0.37 + 0.11) % 1;
        const x = ((v * 1400 + t * (18 + w * 26)) % 1500) - 110, y = ((w * 900 + t * (34 + v * 30)) % 800) - 60;
        tk.petal(ctx, x, y, 8 + w * 6, t * (0.6 + v) + i, 0.75);
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

  // the dusk street behind the kamishibai stage: a violet sky going rose at the roofline, shuttered shopfronts down both edges, paper lanterns on a line,
  // cobbles under the stage. Most of the middle is hidden by the butai itself, so the street lives at the edges. The baked layer is still; lantern light breathes live.
  const DESK_LANTERNS = [[22, 214], [58, 292], [1222, 238], [1258, 318], [188, 62], [352, 74], [640, 66], [928, 74], [1092, 62]];
  function paintDesk(ctx, t, S) {
    layer(ctx, 'nk:desk', 1280, 720, (g) => {
      const sky = g.createLinearGradient(0, 0, 0, 600);
      sky.addColorStop(0, '#0a0820'); sky.addColorStop(0.42, '#1d1550'); sky.addColorStop(0.78, '#4a3490'); sky.addColorStop(1, '#a8527a');
      g.fillStyle = sky; g.fillRect(0, 0, 1280, 720);
      const r = U.rng(4242);
      g.fillStyle = 'rgba(255,248,240,0.7)';
      for (let i = 0; i < 46; i++) { g.globalAlpha = 0.25 + r() * 0.5; g.fillRect(Math.floor(r() * 1280), Math.floor(r() * 300), 2, 2); }
      g.globalAlpha = 1;
      // a far roofline of tiled eaves
      g.fillStyle = '#241a50';
      g.beginPath(); g.moveTo(0, 560);
      for (let x = 0; x <= 1280; x += 80) { const hh = 430 + ((x / 80) * 37 % 5) * 14; g.lineTo(x, hh + 26); g.quadraticCurveTo(x + 40, hh - 18, x + 80, hh + 26); }
      g.lineTo(1280, 560); g.closePath(); g.fill();
      // shopfronts down both edges: dark timber, a curved eave, a lit paper window and a short noren
      const shop = (x, w, top, flip) => {
        g.fillStyle = '#150f34'; g.fillRect(x, top, w, 560 - top);
        g.fillStyle = '#0b0820'; g.beginPath(); g.moveTo(x - 10, top + 10); g.quadraticCurveTo(x + w / 2, top - 30, x + w + 10, top + 10); g.lineTo(x + w + 10, top + 24); g.lineTo(x - 10, top + 24); g.closePath(); g.fill();
        g.fillStyle = 'rgba(245,201,106,0.55)'; g.fillRect(x - 10, top + 22, w + 20, 2);
        const wx = x + (flip ? 12 : w - 56), wy = top + 52;
        const win = g.createLinearGradient(0, wy, 0, wy + 70); win.addColorStop(0, '#ffd9a0'); win.addColorStop(1, '#ff9a5a');
        g.fillStyle = win; g.fillRect(wx, wy, 44, 70);
        g.strokeStyle = '#150f34'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(wx + 22, wy); g.lineTo(wx + 22, wy + 70); g.moveTo(wx, wy + 35); g.lineTo(wx + 44, wy + 35); g.stroke();
        g.fillStyle = '#3b2a7a'; for (let i = 0; i < 3; i++) g.fillRect(x + 8 + i * ((w - 16) / 3), 468, (w - 16) / 3 - 4, 70);
      };
      shop(-16, 108, 300, true); shop(1188, 108, 330, false);
      // the street: wet cobbles that hold the lantern light, a kerb line, the stage's own shadow
      const st = g.createLinearGradient(0, 560, 0, 720); st.addColorStop(0, '#2c1f4e'); st.addColorStop(1, '#0d0a22');
      g.fillStyle = st; g.fillRect(0, 560, 1280, 160);
      g.strokeStyle = 'rgba(245,201,106,0.16)'; g.lineWidth = 1;
      for (let row = 0; row < 6; row++) {
        const y = 568 + row * row * 2.4 + row * 8, off = row % 2 ? 22 : 0, step = 44 + row * 12;
        g.beginPath(); g.moveTo(0, y); g.lineTo(1280, y); g.stroke();
        for (let x = -step + off; x < 1300; x += step) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6 - row, y + 14 + row * 3); g.stroke(); }
      }
      g.fillStyle = 'rgba(245,201,106,0.5)'; g.fillRect(0, 558, 1280, 2);
      // the lantern line: a sagging cord and paper lanterns with a vermilion band
      g.strokeStyle = 'rgba(10,8,32,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 38); g.quadraticCurveTo(640, 98, 1280, 38); g.stroke();
      DESK_LANTERNS.forEach((p, i) => {
        const x = p[0], y = p[1], sc = i < 4 ? 1 : 0.8;
        g.strokeStyle = '#0a0820'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 30 * sc); g.lineTo(x, y - 18 * sc); g.stroke();
        g.fillStyle = '#e8583d'; g.beginPath(); g.ellipse(x, y, 15 * sc, 20 * sc, 0, 0, TAU); g.fill();
        g.lineWidth = 2.4; g.stroke();
        g.strokeStyle = 'rgba(255,225,160,0.6)'; g.lineWidth = 1.4;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(x, y, 15 * sc, Math.abs(k) * 6 * sc + 2, 0, 0, TAU); g.stroke(); }
        g.fillStyle = '#0a0820'; g.fillRect(x - 7 * sc, y - 22 * sc, 14 * sc, 4); g.fillRect(x - 7 * sc, y + 18 * sc, 14 * sc, 4);
      });
    });
    const tk = TK();
    if (tk) {
      DESK_LANTERNS.forEach((p, i) => glow(ctx, p[0], p[1], (i < 4 ? 120 : 90) + 8 * Math.sin(t * 2.1 + i * 1.7), '#ffb070', 0.3 + 0.06 * Math.sin(t * 3.1 + i * 2.3)));
      glow(ctx, 640, 380, 560, '#ffd9a0', 0.1 + 0.02 * Math.sin(t * 1.7));
      safe(() => tk.kirakira(ctx, 0, 0, 1280, 720, t, { n: 18, seed: 5, size: 3, rise: 7 }));
      safe(() => tk.mist(ctx, 0, 520, 1280, 200, t, { n: 4, seed: 9, alpha: 0.06, color: '#c9bff0', speed: 6 }));
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.45 }));
    }
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
  // painters. Every page paints its own stage on #view: a cached backdrop layer (ART.sprite) plus a few animated things.
  // They only ever read the art toolkit, never a clock: t is the frame clock in seconds.
  // ==================================================================================================================
  const rgba = (hex, a) => U.color.rgba(hex, a);
  const INK = '#140f2e';
  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // a cel-shaded polygon or smooth shape through the art toolkit, with a plain fallback
  function cel(g, shape, base, o) {
    const tk = TK();
    if (tk && isFn(tk.celFill)) { tk.celFill(g, shape, base, o); return; }
    g.beginPath();
    const pts = shape.poly || shape;
    pts.forEach((p, i) => { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
    g.closePath(); g.fillStyle = base; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  function celOval(g, cx, cy, rx, ry, base, o) {
    const tk = TK();
    if (tk && isFn(tk.celEllipse)) { tk.celEllipse(g, cx, cy, rx, ry, base, o); return; }
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fillStyle = base; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  function inkLine(g, pts, w, color, o) {
    const tk = TK();
    if (tk && isFn(tk.inkPath)) { tk.inkPath(g, pts, Object.assign({ w, color: color || INK }, o || {})); return; }
    g.beginPath(); pts.forEach((p, i) => { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
    g.lineWidth = w; g.strokeStyle = color || INK; g.lineCap = 'round'; g.stroke();
  }

  // ---------------------------------------------------------------- the peddler: a round old merchant under a tower of boxes
  // Feet at (0, 0), faces right, about 330 px tall with the pack. Body, hat and four faces are baked once (ART.sprite) and moved per frame.
  const PD_OX = 190, PD_OY = 410;
  function pdBody(g) {
    g.translate(PD_OX, PD_OY);
    const wicker = (ctx) => { ctx.strokeStyle = 'rgba(94,58,22,0.55)'; ctx.lineWidth = 1.6; for (let i = -20; i < 260; i += 12) { ctx.beginPath(); ctx.moveTo(-170, -330 + i); ctx.lineTo(-30, -330 + i + 26); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-30, -330 + i); ctx.lineTo(-170, -330 + i + 26); ctx.stroke(); } };
    // the pack frame and everything strapped to it
    cel(g, { poly: [[-156, -300], [-44, -304], [-38, -112], [-152, -106]] }, '#b98a46', { tension: 0.2, line: 3.4, decor: wicker, hi: true });
    cel(g, { poly: [[-150, -356], [-78, -358], [-76, -300], [-152, -298]] }, '#c8302f', { tension: 0.2, line: 3, decor: (c) => { c.fillStyle = '#f5c96a'; c.fillRect(-152, -334, 80, 7); c.fillRect(-118, -358, 7, 62); } });
    cel(g, { poly: [[-104, -338], [-36, -326], [-40, -288], [-108, -298]] }, '#2f9c9c', { tension: 0.2, line: 3, decor: (c) => { c.fillStyle = '#f3e6c8'; c.fillRect(-110, -318, 76, 5); } });
    celOval(g, -112, -378, 36, 28, '#2b3a8f', { line: 3, decor: (c) => { c.fillStyle = 'rgba(243,230,200,0.85)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(-136 + (i % 3) * 24, -392 + Math.floor(i / 3) * 14, 3, 0, TAU); c.fill(); } } });
    celOval(g, -112, -406, 10, 9, '#2b3a8f', { line: 2.6 });
    // rope straps over the shoulder
    inkLine(g, [[-46, -290], [-30, -230], [-24, -170], [-32, -118]], 6, '#e8383d', { taper: 0.05, wobble: 0.05 });
    inkLine(g, [[-46, -180], [-10, -178], [30, -192]], 5, '#e8383d', { taper: 0.05, wobble: 0.05 });
    // a little paper lantern and a gourd dangle from the pack
    inkLine(g, [[-140, -300], [-158, -276]], 2.4, INK, { taper: 0.05 });
    celOval(g, -160, -252, 15, 20, '#ff8a3a', { line: 2.6, decor: (c) => { c.strokeStyle = 'rgba(93,15,28,0.7)'; c.lineWidth = 1.4; for (let k = -10; k <= 10; k += 5) { c.beginPath(); c.ellipse(-160, -252, Math.abs(k) + 2, 20, 0, 0, TAU); c.stroke(); } } });
    g.fillStyle = INK; g.fillRect(-171, -274, 22, 5); g.fillRect(-171, -234, 22, 5);
    celOval(g, -168, -180, 13, 14, '#d0a84c', { line: 2.6 });
    celOval(g, -168, -200, 8, 9, '#d0a84c', { line: 2.4 });
    // legs, leggings and straw sandals
    cel(g, { poly: [[-26, -64], [-6, -64], [-6, -10], [-30, -10]] }, '#20255e', { tension: 0.2, line: 3 });
    cel(g, { poly: [[8, -64], [30, -64], [32, -10], [10, -10]] }, '#20255e', { tension: 0.2, line: 3 });
    celOval(g, -18, -6, 22, 9, '#d0a84c', { line: 3 });
    celOval(g, 24, -6, 22, 9, '#d0a84c', { line: 3 });
    // the robe: a short indigo kimono, paper-white hem, vermilion obi
    cel(g, [[-56, -64], [-64, -128], [-46, -184], [0, -204], [48, -184], [66, -128], [58, -64], [0, -50]], '#2f3f9a', { tension: 0.8, line: 3.4, hi: true, rim: '#7f9bff', halftone: true });
    g.fillStyle = '#f3e6c8'; g.beginPath(); g.moveTo(-57, -70); g.quadraticCurveTo(0, -46, 59, -70); g.lineTo(58, -60); g.quadraticCurveTo(0, -38, -56, -60); g.closePath(); g.fill();
    cel(g, { poly: [[-62, -132], [64, -132], [64, -110], [-62, -110]] }, '#e8383d', { tension: 0.15, line: 3, hi: true });
    celOval(g, 62, -121, 11, 13, '#b91f30', { line: 2.6 });
    celOval(g, -8, -160, 13, 13, '#f3e6c8', { line: 2.4, decor: (c) => { c.strokeStyle = 'rgba(20,15,46,0.7)'; c.lineWidth = 2; c.beginPath(); c.arc(-8, -160, 6, 0, TAU); c.stroke(); } });
    // white collar V
    cel(g, { poly: [[-20, -202], [0, -170], [22, -202], [30, -196], [0, -156], [-30, -196]] }, '#f3e6c8', { tension: 0.1, line: 2.6 });
    // the far sleeve and hand gripping the strap
    cel(g, [[-52, -180], [-64, -150], [-58, -124], [-40, -128], [-34, -160]], '#3a4cb0', { tension: 0.7, line: 3 });
    celOval(g, -46, -122, 9, 9, '#f7d9b5', { line: 2.6 });
  }

  function pdFace(g, mood) {
    // head centred at (90, 100) in a 180 x 170 sprite
    const cx = 90, cy = 104;
    g.translate(0, 0);
    // ears, then a round face
    celOval(g, cx - 46, cy + 4, 9, 13, '#f2c9a0', { line: 2.6 });
    celOval(g, cx + 46, cy + 4, 9, 13, '#f2c9a0', { line: 2.6 });
    celOval(g, cx, cy, 48, 46, '#f9dcb8', { line: 3.4, hi: true, rim: '#ffe9d0', rimSide: 'light', depth: 9 });
    // cheeks
    g.fillStyle = 'rgba(255,126,110,0.5)';
    g.beginPath(); g.ellipse(cx - 30, cy + 12, 11, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx + 30, cy + 12, 11, 7, 0, 0, TAU); g.fill();
    // white bushy brows
    const brow = (x, dy, tilt) => cel(g, [[x - 17, cy - 22 + dy + tilt], [x - 3, cy - 30 + dy], [x + 15, cy - 24 + dy - tilt], [x + 4, cy - 19 + dy], [x - 12, cy - 19 + dy + tilt]], '#f4f1ff', { tension: 0.8, line: 2.4, depth: 3 });
    const sad = mood === 'sad', shock = mood === 'shock', happy = mood === 'happy';
    brow(cx - 22, sad ? -2 : shock ? -8 : 0, sad ? 4 : 0);
    brow(cx + 22, sad ? -2 : shock ? -8 : 0, sad ? 4 : 0);
    // eyes
    const eye = (x) => {
      if (shock) { celOval(g, x, cy - 6, 9, 11, '#ffffff', { line: 2.6, shadow: false }); g.fillStyle = INK; g.beginPath(); g.arc(x, cy - 4, 3.6, 0, TAU); g.fill(); return; }
      if (sad) { inkLine(g, [[x - 10, cy - 6], [x, cy - 1], [x + 10, cy - 8]], 3.4, INK, { taper: 0.2 }); return; }
      inkLine(g, [[x - 10, cy - 2], [x, cy - 12], [x + 10, cy - 2]], happy ? 4 : 3.4, INK, { taper: 0.25 });
    };
    eye(cx - 22); eye(cx + 22);
    // nose
    celOval(g, cx, cy + 8, 9, 8, '#f0bb92', { line: 2.4, depth: 3 });
    // moustache: two long white curls
    cel(g, [[cx - 4, cy + 16], [cx - 22, cy + 14], [cx - 44, cy + 22], [cx - 52, cy + 38], [cx - 40, cy + 34], [cx - 24, cy + 26], [cx - 4, cy + 26]], '#f6f3ff', { tension: 0.8, line: 2.8, depth: 4 });
    cel(g, [[cx + 4, cy + 16], [cx + 22, cy + 14], [cx + 44, cy + 22], [cx + 52, cy + 38], [cx + 40, cy + 34], [cx + 24, cy + 26], [cx + 4, cy + 26]], '#f6f3ff', { tension: 0.8, line: 2.8, depth: 4 });
    // mouth
    if (happy) { cel(g, [[cx - 12, cy + 28], [cx, cy + 40], [cx + 12, cy + 28], [cx, cy + 30]], '#7d1230', { tension: 0.8, line: 2.6, shadow: false }); }
    else if (shock) { celOval(g, cx, cy + 34, 6, 8, '#7d1230', { line: 2.6, shadow: false }); }
    else if (sad) { inkLine(g, [[cx - 9, cy + 36], [cx, cy + 30], [cx + 9, cy + 36]], 3, INK, { taper: 0.3 }); }
    else { inkLine(g, [[cx - 10, cy + 30], [cx, cy + 36], [cx + 10, cy + 30]], 3, INK, { taper: 0.3 }); }
    // a grey tuft of hair on top and a topknot
    cel(g, [[cx - 14, cy - 44], [cx - 6, cy - 62], [cx + 4, cy - 46]], '#e6e2ee', { tension: 0.6, line: 2.4 });
  }

  function pdHat(g) {
    // the kasa: a wide straw cone, ribs, dark underside, red cord. Sprite 220 x 100, brim centre (110, 70)
    const cx = 110, by = 70;
    g.fillStyle = '#5a4020'; g.beginPath(); g.ellipse(cx, by + 2, 96, 17, 0, 0, TAU); g.fill();
    cel(g, [[cx - 100, by], [cx - 40, by - 34], [cx, by - 58], [cx + 40, by - 34], [cx + 100, by], [cx + 60, by + 15], [cx, by + 19], [cx - 60, by + 15]], '#e0bf6c', { tension: 0.5, line: 3.4, hi: true, rim: '#fff0b8', rimSide: 'light',
      decor: (c) => { c.strokeStyle = 'rgba(122,82,26,0.55)'; c.lineWidth = 1.6; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(cx, by - 58); c.quadraticCurveTo(cx + i * 8, by - 10, cx + i * 17, by + 16); c.stroke(); } c.beginPath(); c.ellipse(cx, by - 12, 50, 8, 0, 0, Math.PI); c.stroke(); } });
    inkLine(g, [[cx - 62, by + 12], [cx - 58, by + 42], [cx - 46, by + 66]], 3, '#e8383d', { taper: 0.1 });
    inkLine(g, [[cx + 62, by + 12], [cx + 58, by + 42], [cx + 46, by + 66]], 3, '#e8383d', { taper: 0.1 });
  }

  const PD_MOODS = ['idle', 'happy', 'sad', 'shock'];
  function drawPeddler(ctx, x, y, s, t, mood) {
    if (typeof ART === 'undefined' || !ART || !isFn(ART.sprite) || !TK()) return;
    const body = ART.sprite('nk:pd:body', 320, 430, pdBody);
    const hat = ART.sprite('nk:pd:hat', 220, 100, pdHat);
    const head = ART.sprite('nk:pd:face:' + mood, 180, 170, (g) => pdFace(g, mood));
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    const breathe = Math.sin(t * 1.7) * 0.012 * m;
    const bounce = mood === 'happy' ? Math.abs(Math.sin(t * 9)) * 7 * m : mood === 'shock' ? Math.sin(t * 30) * 2 * m : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // contact shadow
    ctx.fillStyle = 'rgba(8,5,24,0.55)'; ctx.beginPath(); ctx.ellipse(-30, 2, 130, 16, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.scale(1, 1 + breathe);
    ART.blit(ctx, body, -PD_OX, -PD_OY - bounce, 320, 430);
    // head and hat bob together; the head leans a little when he is sad
    const hy = -232 - bounce + Math.sin(t * 1.7 + 1) * 1.6 * m;
    const lean = mood === 'sad' ? 0.06 : mood === 'happy' ? Math.sin(t * 9) * 0.03 : Math.sin(t * 0.9) * 0.012;
    ctx.save(); ctx.translate(12, hy + 20); ctx.rotate(lean); ctx.translate(-12, -(hy + 20));
    ART.blit(ctx, head, 12 - 90, hy - 100, 180, 170);
    ART.blit(ctx, hat, 12 - 110, hy - 128, 220, 100);
    ctx.restore();
    // the front arm: an open palm with a gold coin that flips and glints
    const wave = Math.sin(t * 2.1) * 4 * m + (mood === 'happy' ? Math.sin(t * 9) * 8 : 0);
    ctx.save(); ctx.translate(44, -168 - bounce);
    cel(ctx, [[-6, -6], [26, 6 + wave * 0.3], [58, -4 + wave * 0.6], [66, 8 + wave * 0.6], [30, 24 + wave * 0.3], [-4, 16]], '#3a4cb0', { tension: 0.7, line: 3, hi: true });
    celOval(ctx, 68, 2 + wave * 0.6, 11, 10, '#f9dcb8', { line: 2.6 });
    const flip = Math.cos(t * 3.2), cy0 = -14 + wave * 0.6 - Math.abs(Math.sin(t * 1.6)) * 5;
    ctx.save(); ctx.translate(70, cy0); ctx.scale(Math.max(0.16, Math.abs(flip)), 1);
    celOval(ctx, 0, 0, 12, 13, '#f5c96a', { line: 2.4, hi: true });
    ctx.strokeStyle = 'rgba(122,82,26,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(-3.5, -4, 7, 8);
    ctx.restore();
    if (Math.sin(t * 3.2 + 1) > 0.9) sparkleAt(ctx, 82, cy0 - 10, 8, { color: '#fff8f0', alpha: 0.9 });
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  function hangLantern(ctx, x, y0, len, t, seed, r) {
    const sway = Math.sin(t * 1.3 + seed) * 0.05 * (UI.opt && UI.opt.reduceMotion ? 0.3 : 1);
    ctx.save(); ctx.translate(x, y0); ctx.rotate(sway);
    ctx.strokeStyle = 'rgba(20,15,46,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.translate(0, len);
    const flick = 0.85 + 0.15 * Math.sin(t * 7 + seed * 3) + 0.05 * Math.sin(t * 13 + seed);
    glow(ctx, 0, r * 0.9, r * 5.2 * flick, '#ff9a2e', 0.5);
    glow(ctx, 0, r * 0.9, r * 2.6, '#ffe0a0', 0.5);
    const grad = ctx.createRadialGradient(0, r * 0.9, r * 0.1, 0, r * 0.9, r * 1.3);
    grad.addColorStop(0, '#fff3c8'); grad.addColorStop(0.5, '#ff9a4a'); grad.addColorStop(1, '#c8302f');
    ctx.beginPath(); ctx.ellipse(0, r * 0.9, r * 0.8, r * 1.05, 0, 0, TAU); ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = 'rgba(93,15,28,0.75)'; ctx.lineWidth = 1.4;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(0, r * 0.9, Math.abs(k) * r * 0.32 + 1, r * 1.05, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = INK; ctx.fillRect(-r * 0.5, -2, r, 6); ctx.fillRect(-r * 0.5, r * 1.85, r, 6);
    ctx.restore();
  }

  function shopBackdrop(g) {
    const r = U.rng(4242);
    const wall = g.createLinearGradient(0, 0, 0, 720);
    wall.addColorStop(0, '#0d0a26'); wall.addColorStop(0.55, '#1c1450'); wall.addColorStop(1, '#0b0820');
    g.fillStyle = wall; g.fillRect(0, 0, 1280, 720);
    // far bokeh lanterns down the alley
    for (let i = 0; i < 16; i++) { const x = r() * 1280, y = 40 + r() * 260, rad = 16 + r() * 38; g.fillStyle = rgba(r() > 0.4 ? '#ff9a4a' : '#ff7eb6', 0.10 + r() * 0.12); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
    // the shelving wall behind the wares
    const pl = SHOP.postL, pw = SHOP.postW, pr = SHOP.postR, span = pr + pw - pl;       // the stall's width, post edge to post edge (962)
    const back = g.createLinearGradient(pl + 12, 0, 1280, 0);
    back.addColorStop(0, '#231a52'); back.addColorStop(1, '#171040');
    g.fillStyle = back; g.fillRect(pl + 10, 70, span - 10, 570);
    g.strokeStyle = 'rgba(245,201,106,0.10)'; g.lineWidth = 2;
    for (let x = pl + 22; x < 1280; x += 46) { g.beginPath(); g.moveTo(x, 70); g.lineTo(x, 640); g.stroke(); }
    g.fillStyle = 'rgba(10,7,30,0.5)'; g.fillRect(pl + 10, 400, span - 10, 196);
    // wooden posts
    const post = (x) => { const pg = g.createLinearGradient(x, 0, x + pw, 0); pg.addColorStop(0, '#4b2e22'); pg.addColorStop(0.4, '#7a4c32'); pg.addColorStop(1, '#2f1c17'); g.fillStyle = pg; g.fillRect(x, 60, pw, 590); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x, 60, pw, 590); };
    post(pl); post(pr);
    // planks (shelves) with a gold-leaf edge
    const plank = (y, h) => {
      const pg = g.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, '#8a5a38'); pg.addColorStop(0.3, '#5f3b26'); pg.addColorStop(1, '#2d1a14');
      g.fillStyle = pg; g.fillRect(pl, y, span, h);
      g.strokeStyle = 'rgba(20,10,8,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(pl, y + 6 + i * (h / 4)); g.bezierCurveTo(600, y + 4 + i * (h / 4), 900, y + 9 + i * (h / 4), 1280, y + 6 + i * (h / 4)); g.stroke(); }
      g.fillStyle = 'rgba(245,201,106,0.9)'; g.fillRect(pl, y, span, 3);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(pl, y + h, span, 10);
      g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(pl, y, span, h);
    };
    SHOP.planks.forEach((p) => plank(p.y, p.h));
    // the awning: indigo cloth, gold hem, a row of white crests, a scalloped edge
    const aw = g.createLinearGradient(0, 0, 0, 96); aw.addColorStop(0, '#141a5a'); aw.addColorStop(1, '#232e86');
    g.fillStyle = aw; g.fillRect(0, 0, 1280, 78);
    for (let x = 0; x < 1280; x += 64) { g.fillStyle = (x / 64) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 64, 78); }
    g.fillStyle = '#232e86';
    for (let x = 0; x < 1280; x += 64) { g.beginPath(); g.moveTo(x, 78); g.quadraticCurveTo(x + 32, 118, x + 64, 78); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 78); g.quadraticCurveTo(x + 32, 118, x + 64, 78); g.stroke(); }
    g.fillStyle = 'rgba(245,201,106,0.9)'; g.fillRect(0, 74, 1280, 4);
    g.fillStyle = 'rgba(243,230,200,0.9)';
    for (let x = 32; x < 1280; x += 64) { g.beginPath(); g.arc(x, 92, 7, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); }
    // the floor: dark boards
    const fl = g.createLinearGradient(0, 640, 0, 720); fl.addColorStop(0, '#1a1236'); fl.addColorStop(1, '#0a071c');
    g.fillStyle = fl; g.fillRect(0, 640, 1280, 80);
    g.strokeStyle = 'rgba(245,201,106,0.09)'; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, 646 + i * 9); g.lineTo(1280, 646 + i * 9 + 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 638, 1280, 4);
  }

  function paintShop(ctx, t, S) {
    layer(ctx, 'nk:shop:bg', 1280, 720, shopBackdrop);
    hangLantern(ctx, 380, 100, 24, t, 1, 15);
    hangLantern(ctx, 780, 100, 20, t, 2.3, 13);
    hangLantern(ctx, 1170, 100, 26, t, 4.1, 15);
    hangLantern(ctx, 70, 96, 46, t, 5.7, 20);
    const mood = S.mood && S.t < S.mood.until ? S.mood.name : 'idle';
    drawPeddler(ctx, SHOP.peddler.x, SHOP.peddler.y, 1, t, PD_MOODS.indexOf(mood) >= 0 ? mood : 'idle');
    const tk = TK();
    if (tk) {
      glow(ctx, 640, 380, 520, '#ff9a4a', 0.08 + 0.02 * Math.sin(t * 2));
      safe(() => tk.kirakira(ctx, 0, 100, 1280, 560, t, { n: 16, seed: 21, size: 2.6, rise: 5 }));
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.5 }));
    }
  }

  // ---------------------------------------------------------------- camp: a bonfire under a giant sakura, the heroes around it
  // Anchor points other modules can rely on: the fire's base is CAMP.fire, the heroes' feet are CAMP.heroes[i] (stage px).
  const CAMP = { fire: { x: 890, y: 612 }, heroes: [{ x: 690, y: 650, s: 0.98, flip: false }, { x: 1090, y: 650, s: 0.98, flip: true }] };
  const campFirePos = () => CAMP.fire;
  const campHeroPos = (i) => CAMP.heroes[i] || CAMP.heroes[0];

  function campBackdrop(g) {
    const r = U.rng(777);
    const sky = g.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#070620'); sky.addColorStop(0.5, '#171048'); sky.addColorStop(0.86, '#3a2470'); sky.addColorStop(1, '#5a3a84');
    g.fillStyle = sky; g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 110; i++) { g.fillStyle = 'rgba(255,248,240,' + (0.18 + r() * 0.6).toFixed(2) + ')'; const s = r() > 0.9 ? 2.4 : 1.4; g.fillRect(r() * 1280, r() * 400, s, s); }
    // the moon
    glow(g, 1090, 116, 250, '#ffe9a8', 0.45);
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(1090, 116, 50, 0, TAU); g.fill();
    g.fillStyle = 'rgba(190,170,130,0.32)';
    [[-14, -10, 11], [16, 8, 14], [-6, 22, 7], [22, -22, 6]].forEach((c) => { g.beginPath(); g.arc(1090 + c[0], 116 + c[1], c[2], 0, TAU); g.fill(); });
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(1090, 116, 50, 0, TAU); g.stroke();
    // far ridges, one shade darker each
    const ridge = (base, amp, col, seed) => {
      g.beginPath(); g.moveTo(0, 720);
      for (let x = 0; x <= 1280; x += 16) g.lineTo(x, base - amp * U.noise.n1(x * 0.0055, seed) - amp * 0.4 * U.noise.n1(x * 0.02, seed + 9));
      g.lineTo(1280, 720); g.closePath(); g.fillStyle = col; g.fill();
    };
    ridge(470, 130, '#231a5e', 3); ridge(520, 100, '#191248', 8); ridge(570, 70, '#100b32', 14);
    // sakura tree: dim under-canopy, trunk and branches, then the lit canopy of small crisp blossom puffs over a soft glow
    const blob = (x, y, rad, hex, a) => { const gr = g.createRadialGradient(x, y, rad * 0.1, x, y, rad); gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
    const puff = (x, y, rad, hex, dark) => {
      g.fillStyle = hex; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      g.fillStyle = dark; g.beginPath(); g.arc(x - rad * 0.18, y + rad * 0.22, rad * 0.86, 0, Math.PI, false); g.fill();
      g.fillStyle = hex; g.beginPath(); g.arc(x + rad * 0.06, y - rad * 0.06, rad * 0.88, 0, TAU); g.fill();
    };
    for (let i = 0; i < 70; i++) blob(700 + r() * 600, 30 + r() * 260, 60 + r() * 50, '#7a3a96', 0.3);
    const limb = (pts, w, col) => inkLine(g, pts, w, col, { taper: 0.14, pressure: 'flat', wobble: 0.1, seed: pts.length });
    const wood = '#2a1a3c';
    limb([[1190, 740], [1190, 580], [1160, 450], [1130, 340], [1080, 250]], 100, wood);
    limb([[1140, 380], [1040, 320], [920, 290], [800, 240]], 46, wood);
    limb([[1130, 350], [1200, 300], [1280, 250]], 34, wood);
    limb([[1110, 290], [1050, 210], [1010, 120], [1020, 20]], 32, wood);
    limb([[980, 300], [930, 240], [880, 170]], 24, wood);
    inkLine(g, [[1146, 700], [1146, 580], [1120, 450], [1090, 340]], 6, 'rgba(255,150,80,0.55)', { taper: 0.3, pressure: 'flat', wobble: 0.06 });
    const pinks = [['#ff9fc8', '#c8508c'], ['#ffc2dc', '#d9749e'], ['#ff7eb6', '#b0245c'], ['#f9a6d0', '#c0508e'], ['#ffd6e8', '#e08ab0']];
    for (let i = 0; i < 4200; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      const x = 960 + Math.cos(a) * d * 610, y = 140 + Math.sin(a) * d * 195;
      if (y > 310 || x < 540) continue;
      const c = pinks[(r() * pinks.length) | 0];
      puff(x, y, 3.6 + r() * 6.4, c[0], c[1]);
    }
    for (let i = 0; i < 90; i++) blob(640 + r() * 640, 20 + r() * 270, 9 + r() * 12, '#fff0f6', 0.7);
    // the ground, grass silhouettes and fallen petals
    const gr = g.createLinearGradient(0, 590, 0, 720); gr.addColorStop(0, '#221650'); gr.addColorStop(1, '#0a071c');
    g.fillStyle = gr; g.fillRect(0, 592, 1280, 130);
    g.fillStyle = '#0f0a2a';
    for (let x = -10; x < 1290; x += 9) { const h = 8 + r() * 16; g.beginPath(); g.moveTo(x, 596); g.lineTo(x + 4, 596 - h); g.lineTo(x + 9, 596); g.closePath(); g.fill(); }
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,170,206,' + (0.25 + r() * 0.5).toFixed(2) + ')'; g.beginPath(); g.ellipse(600 + r() * 680, 606 + r() * 108, 3 + r() * 3, 1.6 + r() * 1.4, r() * 3, 0, TAU); g.fill(); }
  }

  function flameShape(g, x, y, w, h, sway) {
    g.beginPath(); g.moveTo(x - w / 2, y);
    g.bezierCurveTo(x - w * 0.64, y - h * 0.42, x - w * 0.2 + sway * 0.6, y - h * 0.74, x + sway, y - h);
    g.bezierCurveTo(x + w * 0.24 + sway * 0.6, y - h * 0.7, x + w * 0.64, y - h * 0.4, x + w / 2, y);
    g.quadraticCurveTo(x, y + h * 0.1, x - w / 2, y); g.closePath();
  }

  function paintFire(ctx, t, fx, fy, scale) {
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    const fl = 0.9 + 0.1 * Math.sin(t * 9) + 0.06 * Math.sin(t * 17 + 1);
    glow(ctx, fx, fy - 50, 440 * fl * scale, '#ff6a2a', 0.26);
    glow(ctx, fx, fy - 40, 220 * fl * scale, '#ffb050', 0.5);
    ctx.save(); ctx.translate(fx, fy + 22); ctx.scale(1, 0.22); glow(ctx, 0, 0, 340 * scale, '#ff9a2e', 0.32); ctx.restore();
    // stones ring and logs
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; celOval(ctx, fx + Math.cos(a) * 62 * scale, fy + 10 + Math.sin(a) * 15 * scale, 13 * scale, 8 * scale, i % 2 ? '#6d6690' : '#8a86a8', { line: 2.4, depth: 3 }); }
    ctx.save(); ctx.translate(fx, fy + 4); ctx.scale(scale, scale);
    [[-1, 0.3], [1, -0.3]].forEach((l) => { ctx.save(); ctx.rotate(l[1]); cel(ctx, { poly: [[-70, -10], [70, -10], [72, 8], [-72, 8]] }, '#4a2c1e', { tension: 0.3, line: 3, hi: true, rim: '#ff9a4a', rimSide: 'light' }); ctx.restore(); });
    ctx.restore();
    // flame tongues, biggest and reddest first
    const layers = [['#ff4a2a', 1, 150], ['#ff8a2e', 0.78, 120], ['#ffd45e', 0.54, 86], ['#fff4c8', 0.3, 50]];
    layers.forEach((L, li) => {
      for (let k = -1; k <= 1; k++) {
        const ph = t * (5 + li * 1.4) + k * 2.1 + li;
        const h = L[2] * scale * (0.86 + 0.16 * Math.sin(ph) * m + (k === 0 ? 0.14 : 0));
        const sway = Math.sin(ph * 0.8 + 1.3) * 10 * m * (0.5 + li * 0.1);
        flameShape(ctx, fx + k * 30 * scale, fy - 2, 62 * scale * L[1] + 20, h, sway);
        ctx.fillStyle = L[0]; ctx.globalAlpha = li === 0 ? 0.92 : 1; ctx.fill(); ctx.globalAlpha = 1;
        if (li === 0) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(93,15,28,0.75)'; ctx.stroke(); }
      }
    });
    // sparks that rise and fade
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const sp = 0.16 + (i % 7) * 0.035, ph = ((t * sp * m + i * 0.137) % 1 + 1) % 1;
      const x = fx + Math.sin(t * (1.2 + (i % 5) * 0.3) + i * 2.1) * (14 + ph * 46) + (i % 3 - 1) * 8, y = fy - 60 - ph * (190 + (i % 6) * 34) * scale;
      ctx.globalAlpha = Math.max(0, 1 - ph) * 0.95; ctx.fillStyle = i % 3 ? '#ffb85a' : '#ffe9a8';
      const s = (1.2 + (i % 4) * 0.7) * (1 - ph * 0.5);
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function paintCamp(ctx, t, S) {
    layer(ctx, 'nk:camp:bg', 1280, 720, campBackdrop);
    const f = CAMP.fire;
    const R = S.R;
    const pz = S.pose && t < S.pose.until ? S.pose : null;
    // the fire's glow first so the heroes stand in its light, then heroes, then flames in front of them
    glow(ctx, f.x, f.y - 60, 480, '#ff7a2a', 0.18 + 0.03 * Math.sin(t * 8));
    if (typeof ART !== 'undefined' && ART && ART.hero && isFn(ART.hero.draw)) {
      R.heroes.forEach((h, i) => {
        const p = campHeroPos(i);
        safe(() => ART.hero.draw(ctx, h.id, { x: p.x, y: p.y, s: p.s, pose: pz ? pz.name : 'idle', t, pt: pz ? t - pz.t0 : 0, flip: p.flip }));
        glow(ctx, p.x + (p.flip ? -46 : 46), p.y - 110, 160, '#ff9a2e', 0.13 + 0.03 * Math.sin(t * 8 + i));
      });
    }
    paintFire(ctx, t, f.x, f.y, 1);
    const tk = TK();
    if (tk) {
      safe(() => tk.kirakira(ctx, 560, 120, 720, 540, t, { n: 16, seed: 3, size: 2.6, rise: 8, color: '#ffb85a' }));
      for (let i = 0; i < 12; i++) {
        const v = (i * 0.618034) % 1, w = (i * 0.37 + 0.13) % 1;
        tk.petal(ctx, ((v * 1500 + t * (14 + w * 22)) % 1500) - 120, ((w * 800 + t * (26 + v * 24)) % 800) - 40, 6 + w * 5, t * (0.5 + v) + i, 0.7);
      }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.62 }));
    }
  }

  // small animated pictures for the four camp buttons (224 x 104)
  function campIcon(g, id, t, w, h, S) {
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    const bg = g.createLinearGradient(0, 0, 0, h);
    const cols = { rest: ['#1c1656', '#382a80'], sharpen: ['#2a1420', '#5a2a1c'], gems: ['#1b1050', '#3c1f7a'], meditate: ['#0f1444', '#1f3a78'] }[id] || ['#1a1340', '#3b2a7a'];
    bg.addColorStop(0, cols[0]); bg.addColorStop(1, cols[1]);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const tk = TK();
    if (id === 'rest') {
      glow(g, 178, 26, 46, '#ffe9a8', 0.6);
      g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(178, 26, 15, 0, TAU); g.fill();
      g.fillStyle = cols[0]; g.beginPath(); g.arc(184, 22, 13, 0, TAU); g.fill();
      cel(g, { poly: [[24, 84], [30, 66], [150, 62], [172, 84]] }, '#5b3fa8', { tension: 0.5, line: 2.6, hi: true });
      celOval(g, 44, 62, 20, 11, '#f3e6c8', { line: 2.4 });
      cel(g, { poly: [[24, 84], [172, 84], [172, 92], [24, 92]] }, '#e8383d', { tension: 0.1, line: 2.4 });
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.35 * m + i / 3) % 1 + 1) % 1;
        g.save(); g.globalAlpha = Math.sin(ph * Math.PI); g.font = '900 ' + (14 + i * 4) + 'px ' + (TK() ? TK().font.display : 'serif'); g.fillStyle = '#e6dcff'; g.strokeStyle = INK; g.lineWidth = 3;
        g.strokeText('z', 84 + i * 22 + ph * 10, 58 - ph * 40); g.fillText('z', 84 + i * 22 + ph * 10, 58 - ph * 40); g.restore();
      }
      for (let i = 0; i < 5; i++) { const ph = ((t * 0.3 * m + i * 0.21) % 1 + 1) % 1; sparkleAt(g, 40 + i * 28, 56 - ph * 34, 4 + i % 2 * 2, { color: '#8dffc2', alpha: Math.sin(ph * Math.PI) }); }
    } else if (id === 'sharpen') {
      glow(g, 112, 74, 90, '#ff9a4a', 0.28);
      cel(g, { poly: [[30, 92], [40, 70], [186, 70], [198, 92]] }, '#8a86a8', { tension: 0.2, line: 2.8, hi: true });
      cel(g, { poly: [[40, 70], [186, 70], [178, 60], [50, 60]] }, '#c4c0d8', { tension: 0.2, line: 2.4 });
      const off = Math.sin(t * 4.2 * m) * 22;
      g.save(); g.translate(112 + off, 60); g.rotate(-0.42);
      cel(g, { poly: [[-90, -2], [60, -8], [96, -1], [60, 6], [-90, 5]] }, '#e6ecff', { tension: 0.1, line: 2.6, hi: true, rim: '#ffffff' });
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-84, -1, 150, 1.6);
      g.restore();
      for (let i = 0; i < 9; i++) {
        const ph = ((t * 1.7 * m + i * 0.111) % 1 + 1) % 1, a = -0.9 + (i % 5) * 0.4;
        g.fillStyle = 'rgba(255,' + (200 + (i % 3) * 20) + ',120,' + (1 - ph).toFixed(2) + ')';
        g.beginPath(); g.arc(120 + off * 0.4 + Math.cos(a) * ph * 46, 62 - Math.abs(Math.sin(a)) * ph * 40 + ph * ph * 30, 2.2 * (1 - ph) + 0.6, 0, TAU); g.fill();
      }
    } else if (id === 'gems') {
      const hue = [['#e8383d', '#ff9a9a'], ['#5fb4ff', '#b5dcff'], ['#3fd6b0', '#a5f5dc'], ['#f5c96a', '#ffe9a8']];
      const k = (t * 0.5 * m) % 4, a = hue[Math.floor(k) % 4], b = hue[(Math.floor(k) + 1) % 4], f = k - Math.floor(k);
      const base = U.color.mix(a[0], b[0], f), lite = U.color.mix(a[1], b[1], f);
      glow(g, 112, 54, 80, base, 0.5);
      g.save(); g.translate(112, 54 + Math.sin(t * 1.6 * m) * 3); g.rotate(Math.sin(t * 0.9 * m) * 0.08);
      cel(g, { poly: [[-34, -6], [-20, -34], [20, -34], [34, -6], [0, 36]] }, base, { tension: 0.1, line: 3.2, hi: lite, rim: lite });
      g.fillStyle = rgba(lite, 0.75); g.beginPath(); g.moveTo(-20, -34); g.lineTo(-6, -6); g.lineTo(-34, -6); g.closePath(); g.fill();
      g.fillStyle = rgba('#ffffff', 0.3); g.beginPath(); g.moveTo(20, -34); g.lineTo(34, -6); g.lineTo(6, -6); g.closePath(); g.fill();
      g.strokeStyle = rgba(INK, 0.6); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-34, -6); g.lineTo(34, -6); g.moveTo(-6, -6); g.lineTo(0, 36); g.moveTo(6, -6); g.lineTo(0, 36); g.stroke();
      g.restore();
      for (let i = 0; i < 4; i++) sparkleAt(g, 112 + Math.cos(t * 0.8 * m + i * 1.6) * 54, 54 + Math.sin(t * 1.1 * m + i * 1.6) * 30, 5 + (i % 2) * 3, { color: '#ffffff', alpha: 0.5 + 0.5 * Math.sin(t * 3 + i) });
    } else {
      // meditate: a singing bowl on a cushion above still water, a wooden striker tapping its rim, and sound rings that spread out over the water
      const wy = 78;
      g.fillStyle = 'rgba(95,180,255,0.18)'; g.beginPath(); g.ellipse(112, wy, 96, 18, 0, 0, TAU); g.fill();
      const cyc = (t * 0.45 * m) % 1;
      for (let i = 0; i < 3; i++) { const ph = ((cyc + i * 0.3) % 1); g.strokeStyle = 'rgba(200,225,255,' + (0.7 * (1 - ph)).toFixed(2) + ')'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(112, wy + 2, 10 + ph * 80, 3 + ph * 14, 0, 0, TAU); g.stroke(); }
      celOval(g, 112, wy - 6, 26, 7, '#8a2a3a', { line: 2.2, depth: 2 });
      cel(g, { poly: [[82, wy - 40], [86, wy - 24], [98, wy - 12], [126, wy - 12], [138, wy - 24], [142, wy - 40]] }, '#c9893a', { tension: 0.5, line: 2.6, hi: true, rim: '#ffe9a8' });
      celOval(g, 112, wy - 40, 30, 7.5, '#e0a850', { line: 2.4 });
      g.fillStyle = '#4a2412'; g.beginPath(); g.ellipse(112, wy - 39, 24, 5, 0, 0, TAU); g.fill();
      // the striker swings in, touches the rim at the top of each cycle, and the bowl answers with two arcs on each side
      const hit = cyc < 0.16 ? 1 - cyc / 0.16 : 0;
      g.save(); g.translate(148, wy - 58 + hit * 18); g.rotate(-0.5 - (1 - hit) * 0.1);
      cel(g, { poly: [[-3, -3], [34, -2], [34, 2], [-3, 3]] }, '#a8743c', { tension: 0.1, line: 2 });
      celOval(g, -4, 0, 6, 6, '#e8383d', { line: 2 });
      g.restore();
      const ring = cyc < 0.7 ? cyc / 0.7 : 1;
      for (let i = 0; i < 2; i++) {
        const q = Math.min(1, ring + i * 0.0) - i * 0.22; if (q <= 0) continue;
        g.strokeStyle = 'rgba(95,245,255,' + (0.8 * (1 - q)).toFixed(2) + ')'; g.lineWidth = 2; g.lineCap = 'round';
        const rr = 34 + q * 28;
        g.beginPath(); g.arc(112, wy - 40, rr, Math.PI * 1.1, Math.PI * 1.32); g.stroke();
        g.beginPath(); g.arc(112, wy - 40, rr, Math.PI * 1.68, Math.PI * 1.9); g.stroke();
      }
      if (tk) sparkleAt(g, 112 + Math.sin(t * 1.2) * 30, 30 + Math.cos(t * 0.9) * 8, 4, { color: '#5ff5ff', alpha: 0.7 });
    }
    void S;
  }

  // ---------------------------------------------------------------- forge: a smithy, a furnace, an anvil with a tuning fork, a hammer
  // Anchors: the anvil face is at FORGE.hit, the hammer pivots at FORGE.pivot (stage px).
  // rest and restUp are the hammer's idle angles (radians, see drawHammer): hung at an angle while two plaques are up, and standing nearly upright behind the After card
  // while the before and after page is open, so the head never sits on the Strike! button (the first keyframe of a blow is whichever rest it starts from)
  // cardsEnd: the two mode cards end at y 458 and the before and after cards at 452 or more (taller on a phone), and the hammer's base sits at the pivot, 12 to 18 px below them: until the first blow
  // (nothing has to swing yet) the hammer is painted only above y 446, so the base never pokes out from under a card (a stub of handle showed under the After card and the Cut Gems plaque)
  const FORGE = { hit: { x: 640, y: 538 }, pivot: { x: 850, y: 470 }, arm: 205, rest: -0.95, restUp: -1.5, cardsEnd: 446 };

  function forgeBackdrop(g) {
    const r = U.rng(31337);
    g.fillStyle = '#0c0920'; g.fillRect(0, 0, 1280, 720);
    // stone blocks
    for (let row = 0; row < 15; row++) {
      const y = row * 46 - 8, off = row % 2 ? 46 : 0;
      for (let x = -92 + off; x < 1300; x += 92) {
        const sh = 18 + Math.floor(r() * 14);
        g.fillStyle = 'rgb(' + sh + ',' + (sh - 2) + ',' + (sh + 26) + ')'; g.fillRect(x + 2, y + 2, 88, 42);
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 2, y + 2, 88, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, y + 40, 88, 4);
      }
    }
    // the furnace with its arched mouth and chimney
    cel(g, { poly: [[70, 660], [80, 300], [160, 240], [310, 240], [390, 300], [400, 660]] }, '#2b2450', { tension: 0.3, line: 4, hi: true, rim: '#ff8a3a' });
    cel(g, { poly: [[210, 250], [260, 250], [270, 30], [200, 30]] }, '#2b2450', { tension: 0.2, line: 4 });
    const mouth = g.createLinearGradient(0, 360, 0, 660); mouth.addColorStop(0, '#5a1408'); mouth.addColorStop(0.5, '#e8541a'); mouth.addColorStop(1, '#ffb030');
    g.beginPath(); g.moveTo(148, 660); g.lineTo(148, 470); g.quadraticCurveTo(148, 352, 235, 352); g.quadraticCurveTo(322, 352, 322, 470); g.lineTo(322, 660); g.closePath();
    g.fillStyle = mouth; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = 'rgba(20,10,8,0.55)'; for (let i = 0; i < 4; i++) g.fillRect(166 + i * 36, 560, 22, 100);
    // hanging tools and a shelf of little bronze bowls on the right
    for (let i = 0; i < 6; i++) { const x = 940 + i * 48; inkLine(g, [[x, 80], [x + 4, 150 + (i % 3) * 20]], 5, '#8a86a8', { taper: 0.05 }); cel(g, { poly: [[x - 8, 150 + (i % 3) * 20], [x + 12, 150 + (i % 3) * 20], [x + 14, 190 + (i % 3) * 20], [x - 10, 190 + (i % 3) * 20]] }, '#4a4863', { tension: 0.2, line: 2.4 }); }
    g.fillStyle = '#4b2e22'; g.fillRect(900, 360, 300, 16); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(900, 360, 300, 16);
    for (let i = 0; i < 5; i++) celOval(g, 930 + i * 56, 348, 20, 12, i % 2 ? '#8a5a24' : '#c9893a', { line: 2.6, hi: true, rim: '#ffe9a8' });
    // floor
    const fl = g.createLinearGradient(0, 640, 0, 720); fl.addColorStop(0, '#1d1436'); fl.addColorStop(1, '#0a071c');
    g.fillStyle = fl; g.fillRect(0, 648, 1280, 72);
    g.strokeStyle = 'rgba(255,140,60,0.10)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 656 + i * 12); g.lineTo(1280, 656 + i * 12); g.stroke(); }
    // the wooden stump and the anvil
    cel(g, { poly: [[540, 600], [740, 600], [752, 700], [528, 700]] }, '#5a3a26', { tension: 0.2, line: 4, hi: true, rim: '#ff8a3a' });
    cel(g, [[500, 556], [560, 536], [770, 534], [786, 554], [736, 566], [724, 602], [772, 622], [776, 646], [512, 646], [512, 620], [562, 602], [556, 568]], '#565478', { tension: 0.3, line: 4.4, hi: true, rim: '#ff8a3a', rimSide: 'light', halftone: true });
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(560, 538, 200, 4);
    // a tuning fork standing on the anvil face: a short stem, a U and two silver tines (the idle glint and the sound arcs are live, in paintForge)
    const fork = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(646, 536); g.lineTo(646, 512); g.moveTo(632, 462); g.lineTo(632, 496); g.quadraticCurveTo(632, 512, 646, 512); g.quadraticCurveTo(660, 512, 660, 496); g.lineTo(660, 462); g.stroke(); };
    fork(11, INK); fork(6, '#e6ecff');
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(630, 466); g.lineTo(630, 494); g.moveTo(644, 530); g.lineTo(644, 516); g.stroke();
    g.fillStyle = '#f5c96a'; g.fillRect(639, 522, 14, 5); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(639, 522, 14, 5);
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

  function drawHammer(ctx, ang) {
    const P = FORGE.pivot;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang)));
    cel(ctx, { poly: [[0, -9], [172, -7], [172, 7], [0, 9]] }, '#a06a3a', { tension: 0.15, line: 3.2, hi: true, rim: '#ffd08a', rimSide: 'light' });
    ctx.fillStyle = '#e8383d'; for (let i = 0; i < 4; i++) ctx.fillRect(10 + i * 12, -9, 6, 18);
    cel(ctx, { poly: [[166, -30], [240, -34], [244, 34], [166, 30]] }, '#6a6890', { tension: 0.2, line: 3.6, hi: true, rim: '#ff8a3a', rimSide: 'light' });
    ctx.fillStyle = 'rgba(245,201,106,0.9)'; ctx.fillRect(200, -34, 5, 68);
    ctx.restore();
  }

  function paintForge(ctx, t, S) {
    layer(ctx, 'nk:forge:bg', 1280, 720, forgeBackdrop);
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    const fl = 0.9 + 0.1 * Math.sin(t * 8) + 0.05 * Math.sin(t * 15);
    glow(ctx, 235, 540, 360 * fl, '#ff6a1a', 0.36);
    glow(ctx, 235, 560, 170, '#ffc060', 0.5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const ph = ((t * 0.22 * m + i * 0.171) % 1 + 1) % 1; ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#ffb85a' : '#ff7a2a'; ctx.beginPath(); ctx.arc(200 + (i * 37) % 70 + Math.sin(t * 2 + i) * 14, 470 - ph * 260, 1.6 + (i % 3) * 0.8, 0, TAU); ctx.fill(); }
    ctx.restore();
    // hammer: hangs and sways until a strike starts
    const tt = S.strike ? t - S.strike.t0 : -1;
    const wantRest = S.phase ? FORGE.restUp : FORGE.rest;
    S.restAng = S.restAng === undefined ? wantRest : S.restAng + (wantRest - S.restAng) * clamp((t - (S.restT === undefined ? t : S.restT)) * 7, 0, 1);
    S.restT = t;
    const ang = tt < 0 ? S.restAng + Math.sin(t * 1.3) * 0.02 * m : hammerAngle(tt, S.restAng);
    const idle = tt < 0;
    if (idle) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1280, FORGE.cardsEnd); ctx.clip(); }
    drawHammer(ctx, ang);
    if (idle) ctx.restore();
    // sparks at every hit
    if (S.strike) {
      const H = FORGE.hit;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      HIT_TIMES.forEach((ht, k) => {
        const age = tt - ht;
        if (age < 0 || age > 0.75) return;
        const rr = U.rng(U.hash('sparks', k));
        const n = k === 0 ? 34 : 18;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI * (0.05 + rr() * 0.9), v = 160 + rr() * 380 * (k === 0 ? 1 : 0.6);
          const x = H.x + Math.cos(a) * v * age, y = H.y - 8 + Math.sin(a) * v * age + 900 * age * age * 0.5;
          ctx.globalAlpha = Math.max(0, 1 - age / 0.75); ctx.fillStyle = rr() > 0.5 ? '#ffe9a8' : '#ff9a3a';
          ctx.beginPath(); ctx.arc(x, y, 1.4 + rr() * 2, 0, TAU); ctx.fill();
        }
        glow(ctx, H.x, H.y - 10, 200 * (1 - age / 0.75), '#ffd080', 0.6 * (1 - age / 0.75));
      });
      ctx.restore();
    }
    // the fork hums: two sound arcs on each side of the tines, and an idle glint on the tips
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) { const q = ((t * 0.5 * m + i * 0.5) % 1 + 1) % 1; ctx.strokeStyle = 'rgba(95,245,255,' + (0.7 * (1 - q)).toFixed(2) + ')'; const rr = 16 + q * 26; ctx.beginPath(); ctx.arc(646, 480, rr, Math.PI * 1.1, Math.PI * 1.34); ctx.stroke(); ctx.beginPath(); ctx.arc(646, 480, rr, Math.PI * 1.66, Math.PI * 1.9); ctx.stroke(); }
    ctx.restore();
    sparkleAt(ctx, 646 + Math.sin(t * 0.7) * 14, 464, 5 + 2 * Math.sin(t * 3), { color: '#ffe9a8', alpha: 0.5 + 0.4 * Math.sin(t * 2.4) });
    const tk = TK();
    if (tk) safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.62 }));
    if (S.flashT !== undefined) { const fa = Math.max(0, 1 - (t - S.flashT) / 0.55); if (fa > 0) { ctx.fillStyle = 'rgba(255,240,200,' + (fa * 0.55).toFixed(3) + ')'; ctx.fillRect(0, 0, 1280, 720); } }
  }

  function forgeIcon(g, kind, t, w, h) {
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    const bg = g.createLinearGradient(0, 0, 0, h);
    if (kind === 'up') { bg.addColorStop(0, '#2a1420'); bg.addColorStop(1, '#5a2a1c'); } else { bg.addColorStop(0, '#1b1050'); bg.addColorStop(1, '#3c1f7a'); }
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (kind === 'up') {
      glow(g, 130, 90, 120, '#ff8a3a', 0.35);
      cel(g, [[70, 96], [92, 86], [180, 86], [190, 94], [172, 100], [166, 118], [192, 124], [70, 124], [90, 118], [96, 100]], '#565478', { tension: 0.3, line: 3, hi: true, rim: '#ff8a3a' });
      const c = ((t * 0.9 * m) % 1 + 1) % 1;
      const ang = c < 0.4 ? -0.9 + (c / 0.4) * 1.16 : -0.9 + 1.16 * (1 - (c - 0.4) / 0.6);
      g.save(); g.translate(210, 40); g.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang))); g.scale(0.55, 0.55);
      cel(g, { poly: [[0, -9], [172, -7], [172, 7], [0, 9]] }, '#a06a3a', { tension: 0.15, line: 3.6 });
      cel(g, { poly: [[166, -30], [240, -34], [244, 34], [166, 30]] }, '#6a6890', { tension: 0.2, line: 4 });
      g.restore();
      if (c > 0.36 && c < 0.7) for (let i = 0; i < 10; i++) { const a = -Math.PI * (0.1 + (i % 5) * 0.2), d = (c - 0.36) * 120; g.fillStyle = 'rgba(255,220,140,' + (1 - (c - 0.36) / 0.34).toFixed(2) + ')'; g.beginPath(); g.arc(128 + Math.cos(a) * d, 84 + Math.sin(a) * d, 2, 0, TAU); g.fill(); }
      // a tiny card being improved
      g.save(); g.translate(46, 44); g.rotate(-0.16); cel(g, { poly: [[0, 0], [38, 0], [38, 54], [0, 54]] }, '#f3e6c8', { tension: 0.12, line: 2.6 }); g.fillStyle = '#e8383d'; g.fillRect(4, 4, 30, 8); g.restore();
      sparkleAt(g, 78, 34, 5 + 2 * Math.sin(t * 4), { color: '#ffe9a8', alpha: 0.9 });
    } else {
      const cols = ['#e8383d', '#5fb4ff', '#3fd6b0', '#f5c96a'];
      const k = (t * 0.4 * m) % 4, a = cols[Math.floor(k) % 4], b = cols[(Math.floor(k) + 1) % 4];
      const base = U.color.mix(a, b, k - Math.floor(k));
      glow(g, 130, 66, 100, base, 0.45);
      g.save(); g.translate(130, 66 + Math.sin(t * 1.5 * m) * 3);
      cel(g, { poly: [[-36, -8], [-22, -38], [22, -38], [36, -8], [0, 42]] }, base, { tension: 0.1, line: 3.4, hi: true, rim: '#ffffff' });
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(-22, -38); g.lineTo(-6, -8); g.lineTo(-36, -8); g.closePath(); g.fill();
      g.strokeStyle = rgba(INK, 0.55); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-36, -8); g.lineTo(36, -8); g.moveTo(-6, -8); g.lineTo(0, 42); g.moveTo(6, -8); g.lineTo(0, 42); g.stroke();
      g.restore();
      g.save(); g.translate(196, 30); g.rotate(-0.7 + Math.sin(t * 6 * m) * 0.12); cel(g, { poly: [[0, -3], [46, -3], [54, 0], [46, 3], [0, 3]] }, '#c4c0d8', { tension: 0.1, line: 2.4 }); g.restore();
      for (let i = 0; i < 4; i++) sparkleAt(g, 130 + Math.cos(t * 0.9 * m + i * 1.6) * 62, 66 + Math.sin(t * 1.2 * m + i * 1.6) * 34, 5 + (i % 2) * 3, { color: '#ffffff', alpha: 0.5 + 0.5 * Math.sin(t * 3 + i) });
    }
  }

  // ---------------------------------------------------------------- chest: a dark hall, a chest whose lid swings up, light and coins
  const CHEST = { x: 640, y: 622 };
  function chestBackdrop(g) {
    const r = U.rng(90210);
    const wall = g.createLinearGradient(0, 0, 0, 720); wall.addColorStop(0, '#07051a'); wall.addColorStop(0.6, '#171043'); wall.addColorStop(1, '#0a0722');
    g.fillStyle = wall; g.fillRect(0, 0, 1280, 720);
    const pillar = (x, w) => {
      const pg = g.createLinearGradient(x, 0, x + w, 0); pg.addColorStop(0, '#120c33'); pg.addColorStop(0.35, '#2e2470'); pg.addColorStop(1, '#0e0a2a');
      g.fillStyle = pg; g.fillRect(x, 0, w, 650); g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(x, -4, w, 654);
      g.fillStyle = 'rgba(245,201,106,0.5)'; g.fillRect(x - 10, 60, w + 20, 10); g.fillRect(x - 10, 590, w + 20, 10);
      g.strokeStyle = 'rgba(245,201,106,0.16)'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 14 + k * (w / 4), 80); g.lineTo(x + 14 + k * (w / 4), 580); g.stroke(); }
    };
    pillar(120, 90); pillar(1070, 90); pillar(430, 60); pillar(790, 60);
    g.fillStyle = 'rgba(8,5,26,0.45)'; g.fillRect(400, 0, 480, 650);
    // floor tiles in perspective
    const fl = g.createLinearGradient(0, 650, 0, 720); fl.addColorStop(0, '#1b1342'); fl.addColorStop(1, '#0a071e');
    g.fillStyle = fl; g.fillRect(0, 650, 1280, 70);
    g.strokeStyle = 'rgba(245,201,106,0.12)'; g.lineWidth = 1.4;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(640 + i * 40, 650); g.lineTo(640 + i * 120, 720); g.stroke(); }
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 662 + k * k * 4 + k * 6); g.lineTo(1280, 662 + k * k * 4 + k * 6); g.stroke(); }
    // rune ring on the floor
    g.strokeStyle = 'rgba(245,201,106,0.38)'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(640, 672, 300, 34, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(640, 672, 250, 26, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.moveTo(640 + Math.cos(a) * 250, 672 + Math.sin(a) * 26); g.lineTo(640 + Math.cos(a) * 300, 672 + Math.sin(a) * 34); g.stroke(); }
    // dust
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,233,168,' + (0.05 + r() * 0.1).toFixed(2) + ')'; g.beginPath(); g.arc(r() * 1280, r() * 640, 1 + r() * 2, 0, TAU); g.fill(); }
  }

  function drawChest(ctx, x, y, p, t) {
    const H = 118;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(4,2,14,0.65)'; ctx.beginPath(); ctx.ellipse(0, 4, 196, 20, 0, 0, TAU); ctx.fill();
    const wood = '#6b3f2a', woodLt = '#8a5236', gold = '#f5c96a';
    // interior glow and gold heap once the lid is moving
    if (p > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, p * 2);
      ctx.beginPath(); ctx.ellipse(0, -H + 2, 138, 12 + 14 * p, 0, 0, TAU); ctx.fillStyle = '#1a0d08'; ctx.fill();
      const ig = ctx.createRadialGradient(0, -H, 6, 0, -H, 140); ig.addColorStop(0, '#fff6c8'); ig.addColorStop(0.5, '#ffc84a'); ig.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(0, -H, 138, 12 + 14 * p, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 14; i++) { const cx = -110 + i * 17, cy = -H - 4 - (i % 3) * 5 * p; ctx.fillStyle = i % 4 === 0 ? '#ff9ac8' : i % 4 === 1 ? '#8dd9ff' : gold; ctx.beginPath(); ctx.ellipse(cx, cy, 8, 5 + 3 * p, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(122,82,26,0.8)'; ctx.stroke(); }
      ctx.restore();
    }
    // the lid: a dome seen from the front, folding back and up behind the chest as it opens
    if (p < 0.5) {
      const k = 1 - 1.3 * p, up = p * 36;
      ctx.save(); ctx.translate(0, -H - up); ctx.scale(1, k);
      cel(ctx, [[-152, 0], [-148, -46], [-104, -84], [0, -98], [104, -84], [148, -46], [152, 0], [0, 6]], '#7a4a30', { tension: 0.6, line: 4, hi: true, rim: '#ffb070', rimSide: 'light',
        decor: (c) => { c.fillStyle = gold; c.fillRect(-100, -100, 14, 104); c.fillRect(86, -100, 14, 104); c.strokeStyle = 'rgba(20,10,8,0.5)'; c.lineWidth = 1.6; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-150, -i * 18 - 4); c.lineTo(150, -i * 18 - 4); c.stroke(); } } });
      ctx.restore();
    } else {
      const hgt = 34 + (p - 0.5) * 2 * 70;
      ctx.save(); ctx.translate(0, -H - 22 - (p - 0.5) * 20);
      cel(ctx, { poly: [[-146, 0], [-138, -hgt], [138, -hgt], [146, 0]] }, '#3a2118', { tension: 0.2, line: 4, hi: true, rim: '#ffb070',
        decor: (c) => { c.fillStyle = 'rgba(255,200,90,0.35)'; c.fillRect(-146, -hgt, 292, hgt); c.fillStyle = gold; c.fillRect(-100, -hgt, 12, hgt); c.fillRect(88, -hgt, 12, hgt); } });
      ctx.restore();
    }
    // the body
    cel(ctx, { poly: [[-152, -H], [152, -H], [158, 0], [-158, 0]] }, wood, { tension: 0.2, line: 4, hi: true, rim: '#ffb070', rimSide: 'light',
      decor: (c) => { c.strokeStyle = 'rgba(20,10,8,0.45)'; c.lineWidth = 1.8; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-160, -H + i * 30); c.lineTo(160, -H + i * 30); c.stroke(); } c.fillStyle = woodLt; c.fillRect(-160, -H, 320, 5); c.fillStyle = gold; c.fillRect(-160, -H + 44, 320, 15); c.fillRect(-126, -H, 14, H); c.fillRect(112, -H, 14, H); } });
    celOval(ctx, 0, -H + 42, 20, 22, gold, { line: 3.4, hi: true });
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -H + 38, 5, 6, 0, 0, TAU); ctx.fill(); ctx.fillRect(-2.5, -H + 38, 5, 16);
    [[-152, -H], [152, -H], [-158, 0], [158, 0]].forEach((c) => celOval(ctx, c[0], c[1] + (c[1] ? -8 : 8), 8, 8, gold, { line: 2.4 }));
    ctx.restore();
  }

  function paintChest(ctx, t, S) {
    layer(ctx, 'nk:chest:bg', 1280, 720, chestBackdrop);
    const c = S.chest || { state: 'closed', t0: -10 };
    const p = c.state === 'open' ? 1 : c.state === 'opening' ? U.ease.outCubic(clamp((t - c.t0) / 0.85, 0, 1)) : 0;
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    // the pulse of a closed chest: a golden seam breathing
    glow(ctx, CHEST.x, CHEST.y - 60, 300 + 240 * p, '#ffd070', 0.16 + 0.1 * p + (p === 0 ? 0.05 * Math.sin(t * 2.4) : 0));
    if (p > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(CHEST.x, CHEST.y - 118);
      for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i - 6.5) * 0.15 + Math.sin(t * 0.4 + i) * 0.02; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.03) * 620, Math.sin(a - 0.03) * 620); ctx.lineTo(Math.cos(a + 0.03) * 620, Math.sin(a + 0.03) * 620); ctx.closePath(); ctx.fillStyle = 'rgba(255,225,150,' + (0.11 * p * (0.6 + 0.4 * Math.sin(t * 2 + i))).toFixed(3) + ')'; ctx.fill(); }
      ctx.restore();
    }
    drawChest(ctx, CHEST.x, CHEST.y, p, t);
    const tk = TK();
    if (tk) {
      if (p > 0.2) for (let i = 0; i < 16; i++) { const ph = ((t * 0.35 * m + i * 0.0625) % 1 + 1) % 1; sparkleAt(ctx, CHEST.x + Math.sin(i * 2.3 + t) * (30 + ph * 150), CHEST.y - 130 - ph * 420, 3 + (i % 3) * 2, { color: i % 3 ? '#ffe9a8' : '#ffffff', alpha: Math.sin(ph * Math.PI) * p }); }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.6 }));
    }
  }

  // ---------------------------------------------------------------- gem cache: a crystal hollow with three velvet plinths
  function cacheBackdrop(g) {
    const r = U.rng(5150);
    const bgc = g.createRadialGradient(640, 300, 40, 640, 380, 900); bgc.addColorStop(0, '#2a1d6a'); bgc.addColorStop(0.55, '#150f40'); bgc.addColorStop(1, '#070518');
    g.fillStyle = bgc; g.fillRect(0, 0, 1280, 720);
    // stalactites
    g.fillStyle = '#0d0a2a';
    for (let x = -20; x < 1300; x += 44) { const hgt = 40 + r() * 90; g.beginPath(); g.moveTo(x, -4); g.lineTo(x + 40, -4); g.lineTo(x + 20 + (r() - 0.5) * 10, hgt); g.closePath(); g.fill(); g.strokeStyle = 'rgba(122,107,255,0.25)'; g.lineWidth = 2; g.stroke(); }
    // crystal clusters left and right
    const cluster = (cx, cy, n, hue) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - n / 2) * 0.28 + (r() - 0.5) * 0.2, len = 90 + r() * 130, w = 18 + r() * 20;
        const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len;
        const px = -Math.sin(a) * w / 2, py = Math.cos(a) * w / 2;
        cel(g, { poly: [[cx - px, cy - py], [cx + px, cy + py], [tx + px * 0.4, ty + py * 0.4], [tx + Math.cos(a) * 16, ty + Math.sin(a) * 16], [tx - px * 0.4, ty - py * 0.4]] }, hue[i % hue.length], { tension: 0.1, line: 3, hi: true, rim: '#ffffff', rimAlpha: 0.7 });
      }
    };
    cluster(120, 700, 8, ['#7a6bff', '#5ff5ff', '#b28cff']);
    cluster(1170, 700, 8, ['#ff7eb6', '#7a6bff', '#5fb4ff']);
    cluster(40, 360, 5, ['#3fd6b0', '#5ff5ff']);
    cluster(1250, 380, 5, ['#f5c96a', '#ffb070']);
    // floor and three plinths
    const fl = g.createLinearGradient(0, 600, 0, 720); fl.addColorStop(0, '#19123a'); fl.addColorStop(1, '#080619');
    g.fillStyle = fl; g.fillRect(0, 606, 1280, 114);
    const py = CACHE.plinthY;
    [0, 1, 2].map(cacheX).forEach((x) => {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(x, 668, 110, 16, 0, 0, TAU); g.fill();
      cel(g, { poly: [[x - 84, 660], [x - 70, py], [x + 70, py], [x + 84, 660]] }, '#3a3268', { tension: 0.15, line: 3.6, hi: true, rim: '#7a6bff', rimSide: 'light' });
      celOval(g, x, py, 82, 20, '#4a4088', { line: 3.4, hi: true });
      celOval(g, x, py - 5, 58, 12, '#8a1f3c', { line: 2.6, hi: true, rim: '#ff7eb6' });
      g.strokeStyle = 'rgba(245,201,106,0.55)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, py - 5, 66, 15, 0, 0, TAU); g.stroke();
    });
  }
  function paintCache(ctx, t, S) {
    layer(ctx, 'nk:cache:bg', 1280, 720, cacheBackdrop);
    const m = UI.opt && UI.opt.reduceMotion ? 0.3 : 1;
    ['#7a6bff', '#5ff5ff', '#ff7eb6'].forEach((c, i) => glow(ctx, cacheX(i), CACHE.glowY, 220 + 20 * Math.sin(t * 1.3 + i), c, 0.16 + 0.05 * Math.sin(t * 2 + i)));
    const tk = TK();
    if (tk) {
      safe(() => tk.mist(ctx, 0, 380, 1280, 340, t, { n: 5, seed: 12, alpha: 0.08, color: '#b9a8ff', speed: 7 }));
      for (let i = 0; i < 26; i++) { const v = (i * 0.618034) % 1, w = (i * 0.318 + 0.1) % 1; sparkleAt(ctx, 60 + v * 1160, 60 + ((w * 600 + t * 6 * m * (0.4 + v)) % 560), 2.5 + w * 4, { color: i % 2 ? '#e6dcff' : '#8fe6ff', alpha: 0.3 + 0.6 * Math.abs(Math.sin(t * (0.8 + v) + i)) }); }
      safe(() => tk.vignette(ctx, 1280, 720, { alpha: 0.6 }));
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
