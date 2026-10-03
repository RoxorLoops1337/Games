// Inkwoven -- GAME: boot, the single frame loop, run flow and routing, and the debug hooks (owner: UI core).
//
// PUBLIC API (DESIGN 5.10)
//   GAME.boot()                       META.load, UI.init, UI.applySettings, URL params, META.bus toasts, the rAF loop, UI.go(goto or 'title').
//                                     Deferred to DOMContentLoaded while the document is still loading. main.js ends with
//                                     `if (!window.__NO_AUTOBOOT) GAME.boot();`. Idempotent.
//   GAME.state = { R, pendingChapter, lastCombat, ended }     R is the current run (also UI.run, and params.R of every routed screen)
//   GAME.params                       parsed URL params: debug goto seed freeze ticks notutorial perf and opts (what ?goto screens receive)
//   GAME.newRun({heroes, trial, seed, daily}) -> R      builds the run with META.unlockedSet() and a clock nonce (so the run id is its own), saves it, routes to the
//                                      intro story and map. A tale that was still saved is paid out as abandoned first (the half share, like Abandon).
//   GAME.continueRun() -> Promise      META.loadRun; a saved node is re-entered (a saved combat restarts with the same seed), a save taken between the boss reward
//                                      and chapterEnd (R.chapterCleared) goes through the chapter flow, else the map
//   GAME.enterNode(node) -> Promise    routes a RUN node to its screen after META.saveRun; Instants {kind:'well'|'brush'} only toast and save;
//                                      {kind:'defeat'} and {kind:'victory'} end the run. A combat node calls META.seen once per enemy id, the first time it is
//                                      entered (node.met rides along in the save, so Continue does not count the same fight again).
//   Several tabs: boot listens to the window 'storage' event and to the tab becoming visible and calls META.refresh (the merge lives in META).
//   GAME.nodeDone() -> Promise         RUN.finishNode, META.saveRun, then the map, or the chapter flow (chapterClear, or victory after chapter 3);
//                                      called again from chapterClear it moves on to the next chapter's intro story and map
//   GAME.defeat() / GAME.victory()     end the run once: META.recordRun, META.clearRun, then the gameOver or victory screen (idempotent per run)
//   GAME.abandon() -> Promise<bool>    confirm overlay, then recordRun('abandon') and back to the title
//   GAME.toTitle()                     closes overlays, saves an unfinished run, goes to the title
//   GAME.save() -> bool                META.saveRun with the one persistent "cannot be saved" toast on failure
//   GAME.debug.open(screen, opts) quickRun(opts) win() lose() setGold(n) addRelic(id) skipChapter() freeze(on) combat()
//   GAME.debug.tick(ms, step=16) -> Promise<ms>   virtual-clock frames with the promise queue drained between frames (await it)
//
// CONVENTIONS FOR SCREEN OWNERS (things DESIGN leaves open; screens may only call GAME.nodeDone, toTitle and enterNode)
//   * The run: every route passes params.R, and UI.run returns the same object. Screens never need GAME.state.
//   * combat: the screen creates COMBAT from RUN.combatInit(R, node). On a win it calls RUN.combatDone(R, C) then GAME.enterNode(R.node) (the reward
//     node). It emits UI.bus 'combat:end' {result}: on 'lose' GAME records the run at once and routes to gameOver after 1.6 s unless the screen already did.
//   * reward, shop, event, camp, forge, chest, gemcache call GAME.nodeDone() when finished.
//   * chapterClear may call GAME.nodeDone() to continue, or route to the story itself; both work.
//   * The debug tools reach into a screen through the screen object: `UI.current.debug` (an object or a function returning
//     {C, vm, fire, play, endTurn, swap, setHp, setStatus, pick, win}) backs GAME.debug.combat(), and `UI.current.debugSetup({hand, statuses, turn})`
//     is called after GAME.debug.open('combat', ...) has entered the screen.
//
// Placeholder screens (title, heroSelect, map, combat, reward, node screens, end screens, story, settings, howto) and the pause overlay are
// registered at boot ONLY when no real file registered them, so the whole flow is testable while later waves are being written.
// GAME is the only file that reads the clock and the only one that calls requestAnimationFrame.
const GAME = (() => {
  'use strict';

  const state = { R: null, pendingChapter: null, lastCombat: null, ended: null, booted: false, booting: false, saveWarned: false, paidWarned: null, runSeq: 0 };
  let params = { debug: false, goto: null, seed: undefined, freeze: false, ticks: 0, notutorial: false, perf: false, opts: {} };
  const warned = {};
  const mk = (tag, props, ...kids) => U.el(tag, props, ...kids);
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };

  // Modules other engineers write at the same time may be missing: every call goes through these so a gap is a clear console message, not a crash.
  const ns = {
    META: () => (typeof META !== 'undefined' ? META : null),
    RUN: () => (typeof RUN !== 'undefined' ? RUN : null),
    MAP: () => (typeof MAP !== 'undefined' ? MAP : null),
    COMBAT: () => (typeof COMBAT !== 'undefined' ? COMBAT : null),
    AUDIO: () => (typeof AUDIO !== 'undefined' ? AUDIO : null),
  };
  const missing = (what) => { if (!warned[what]) { warned[what] = true; console.warn('[game] ' + what + ' is not available yet; continuing without it'); } };
  // call(nsName, fnName, ...args): the result, or undefined with one warning when the function is missing or throws
  function call(name, fn, ...args) {
    const m = ns[name]();
    if (!m || typeof m[fn] !== 'function') { missing(name + '.' + fn); return undefined; }
    try { return m[fn](...args); } catch (e) { console.error('[game] ' + name + '.' + fn + ' threw: ' + e.message + (e.stack ? '\n' + e.stack : '')); return undefined; }
  }
  const sfx = (id) => { const a = ns.AUDIO(); if (a && typeof a.sfx === 'function') safe(() => a.sfx(id)); };

  // ==================================================================================================================
  // URL params
  // ==================================================================================================================
  const LIST_KEYS = ['heroes', 'enemies', 'deck', 'relics', 'cards', 'gems', 'hand'];
  const NUM_KEYS = ['seed', 'trial', 'gold', 'ink', 'chapter', 'turn', 'painted', 'runGold'];

  function parseParams() {
    const q = new URLSearchParams(window.location.search || '');
    const p = { debug: q.get('debug') === '1' || q.get('debug') === 'true', goto: q.get('goto') || null, seed: undefined, freeze: q.get('freeze') === '1', ticks: Number(q.get('ticks')) || 0, notutorial: q.get('notutorial') === '1', perf: q.get('perf') === '1', opts: {} };
    q.forEach((v, k) => {
      if (LIST_KEYS.indexOf(k) >= 0) p.opts[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
      else if (NUM_KEYS.indexOf(k) >= 0) { const n = Number(v); if (Number.isFinite(n)) p.opts[k] = n; }
      else if (k === 'hp') p.opts.hp = v.split(',').map(Number).filter(Number.isFinite);
      else if (['goto', 'debug', 'freeze', 'ticks', 'notutorial', 'perf'].indexOf(k) < 0) p.opts[k] = v;
    });
    if (p.opts.seed !== undefined) p.seed = p.opts.seed >>> 0;
    return p;
  }

  // ==================================================================================================================
  // saving, seeds, small helpers
  // ==================================================================================================================
  function clockSeed() { return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0; }   // the only clock-to-seed conversion (DESIGN 2)
  // Makes a run id of its own (RUN.newRun hashes it in): two tales with the same seed and heroes (a fixed ?seed, a Daily replay) still differ,
  // which is what lets META pay a run exactly once even when several tabs hold a copy of it.
  function runNonce() { state.runSeq += 1; return U.hash(clockSeed(), state.runSeq); }

  function save() {
    const R = state.R;
    const m = ns.META();
    if (!R || R.done || !m || typeof m.saveRun !== 'function') return true;
    let ok = true;
    try { ok = m.saveRun(R) !== false; } catch (e) { ok = false; }
    if (!ok && !state.saveWarned) {
      state.saveWarned = true;
      UI.toast('Progress cannot be saved in this browser', 'warn', { persist: true, id: 'nosave' });
    }
    if (ok && state.paidWarned !== R.id && safe(() => m.runPaid(R.id), false)) {      // another tab already ended this very tale
      state.paidWarned = R.id;
      UI.toast('This tale already ended in another window. Nothing more will be kept.', 'warn', { id: 'paid' });
    }
    return ok;
  }

  function setRun(R) { state.R = R; UI.setRun(R); return R; }
  const go = (name, p, opts) => UI.go(name, p, opts);
  const goMap = () => go('map', { R: state.R }, { transition: 'page' });

  function loreExists(id) { return !!(DATA.lore && DATA.lore[id]); }

  // nested story pages that end on `final`: {name:'story', params:{id, then:{name:'story', params:{id, then: final}}}}
  function storyChain(ids, final) {
    let next = final;
    ids.filter(loreExists).reverse().forEach((id) => { next = { name: 'story', params: { id, then: next } }; });
    return next;
  }
  const routeTo = (r) => go(r.name, r.params, { transition: 'page' });

  // ==================================================================================================================
  // the run flow (DESIGN 6)
  // ==================================================================================================================
  // Beginning anew over a saved tale ends that tale like Abandon does: the half share of Inkstones and its stats and bestiary count, instead of vanishing.
  function payOffSavedRun() {
    const meta = ns.META();
    if (!meta || typeof meta.loadRun !== 'function') return;
    let old = null;
    try { old = meta.hasRun() ? meta.loadRun() : null; } catch (e) { old = null; }
    if (!old) return;
    const rec = call('META', 'recordRun', old, 'abandon', Date.now());
    call('META', 'clearRun', old.id);
    if (rec && rec.inkstones) UI.toast('+' + rec.inkstones + ' Inkstones for the tale you set down', 'good');
  }

  function newRun(opts) {
    opts = opts || {};
    const meta = ns.META();
    let seed = opts.seed !== undefined && opts.seed !== null ? opts.seed >>> 0 : params.seed !== undefined ? params.seed : clockSeed();
    let heroes = opts.heroes;
    let trial = opts.trial | 0;
    const daily = !!opts.daily;
    if (daily) {
      seed = opts.seed !== undefined ? seed : (meta && typeof meta.dailySeed === 'function' ? safe(() => meta.dailySeed(new Date()), seed) : seed);
      heroes = call('RUN', 'dailyHeroes', seed) || heroes;
      trial = 0;
    }
    const unlocked = daily ? undefined : (meta && typeof meta.unlockedSet === 'function' ? safe(() => meta.unlockedSet(), undefined) : undefined);
    payOffSavedRun();
    const R = call('RUN', 'newRun', { heroes, trial, seed, daily, unlocked, nonce: runNonce() });
    if (!R) { UI.toast('The tale could not begin (RUN is not ready)', 'bad'); return null; }
    if (!R.map) call('RUN', 'startChapter', R, 1);
    setRun(R);
    state.ended = null; state.pendingChapter = null; state.lastCombat = null;
    save();
    const intro = meta && typeof meta.tutorial === 'function' && !safe(() => meta.tutorial('intro'), true) ? ['intro'] : [];
    if (intro.length && meta && typeof meta.setTutorial === 'function') safe(() => meta.setTutorial('intro'));
    routeTo(storyChain(intro.concat(['ch1_intro']), { name: 'map', params: { R } }));
    return R;
  }

  function continueRun() {
    const meta = ns.META();
    let R = null;
    try { R = meta && typeof meta.loadRun === 'function' ? meta.loadRun() : null; } catch (e) { console.error('[game] META.loadRun threw: ' + e.message); }
    if (!R) { UI.toast('There is no saved tale to continue', 'warn'); return Promise.resolve(); }
    setRun(R);
    state.ended = null; state.pendingChapter = null; state.lastCombat = null;
    if (R.node) return enterNode(R.node);
    if (R.chapterCleared) return chapterFlow(R);                     // saved after the boss reward, before chapterEnd ran: never back onto a finished map
    return goMap();
  }

  function instant(node) {
    if (node.kind === 'well') { UI.toast(node.toast || 'The well refills your Ink' + (node.gained ? ' (+' + node.gained + ')' : ''), 'good'); sfx('well'); }   // node.toast: RUN's fable fallback (a well with its own words)
    else { const b = DATA.brushes[node.id]; UI.toast('You take a brush' + (b ? ': ' + b.name : ''), 'good'); sfx('brush_pick'); }
  }

  // The bestiary writes a page for every creature the party stands in front of, not only the ones it kills. node.met is saved with the node, so
  // Continue re-entering the same fight (a fight is restarted, never resumed) does not meet them twice.
  function meetFoes(node) {
    if (!node || node.met) return;
    node.met = true;
    (node.enemies || []).map((e) => (typeof e === 'string' ? e : e && e.id)).filter((id, i, a) => typeof id === 'string' && a.indexOf(id) === i).forEach((id) => call('META', 'seen', id));
  }

  function enterNode(node) {
    const R = state.R;
    if (!node) return goMap();
    const kind = node.kind;
    if (kind === 'defeat' || kind === 'gameOver' || kind === 'lose') return defeat();
    if (kind === 'victory') return victory();
    if (kind === 'combat') meetFoes(node);
    save();
    if (kind === 'well' || kind === 'brush') { instant(node); return Promise.resolve(); }
    if (kind === 'combat') { state.lastCombat = null; return go('combat', { node, R }, { transition: 'ink' }); }
    if (kind === 'reward') return go('reward', { rewards: node.rewards, source: node.source, node, R }, { transition: 'page' });
    if (['shop', 'event', 'camp', 'forge', 'chest', 'gemcache'].indexOf(kind) >= 0) return go(kind, { node, R }, { transition: 'page' });
    console.warn('[game] enterNode: unknown node kind "' + kind + '"');
    return goMap();
  }

  // after a boss: heal and grow (RUN.chapterEnd), check achievements, then chapterClear, or victory after chapter 3
  function chapterFlow(R) {
    const cleared = R.chapter;
    const ce = call('RUN', 'chapterEnd', R) || null;
    const next = ce && ce.next !== undefined ? ce.next : (cleared >= 3 ? 'victory' : cleared + 1);
    call('META', 'check', R, Date.now());
    if (next === 'victory') return victory();
    if (R.chapter !== next) call('RUN', 'startChapter', R, next);
    save();
    state.pendingChapter = { cleared, next };
    return go('chapterClear', { chapter: cleared, next, healed: ce && ce.healed, maxHp: ce && ce.maxHp, R }, { transition: 'page' });
  }

  function nodeDone() {
    const R = state.R;
    if (!R) { console.warn('[game] nodeDone with no run'); return toTitle(); }
    if (state.lastCombat === 'lose' && (!R.node || R.node.kind === 'combat')) return defeat();
    if (state.pendingChapter) {                                       // called from chapterClear: on to the next chapter's story and map
      const pc = state.pendingChapter;
      state.pendingChapter = null;
      return routeTo(storyChain(['ch' + pc.next + '_intro'], { name: 'map', params: { R } }));
    }
    let res = null;
    if (R.node) res = call('RUN', 'finishNode', R);
    save();
    if (res && res.chapterEnded) return chapterFlow(R);
    return goMap();
  }

  // ---- the end of a run: record it once, whichever path gets here first
  function finishRun(outcome) {
    const R = state.R;
    if (!R) return null;
    if (state.ended && state.ended.R === R) return state.ended;
    R.done = true; R.victory = outcome === 'win';
    const rec = call('META', 'recordRun', R, outcome, Date.now()) || null;
    call('META', 'clearRun', R.id);                                    // by id: never delete the saved tale another tab began meanwhile
    const summary = call('RUN', 'summary', R) || { score: 0, victory: outcome === 'win', chapter: R.chapter, heroes: R.heroes, gold: R.gold, deckSize: (R.deck || []).length, relics: R.relics || [] };
    summary.record = rec;
    summary.outcome = outcome;
    state.ended = { R, outcome, rec, summary };
    return state.ended;
  }

  function defeat() {
    const e = finishRun('lose');
    const summary = e ? e.summary : { score: 0, victory: false };
    return go('gameOver', { summary, record: e && e.rec, R: state.R }, { transition: 'ink' });
  }

  function victory() {
    const e = finishRun('win');
    const summary = e ? e.summary : { score: 0, victory: true };
    return go('victory', { summary, record: e && e.rec, R: state.R }, { transition: 'page' });
  }

  function abandon() {
    return UI.overlay.open('confirm', { title: 'Abandon this tale?', body: 'The run ends here. You keep a share of the Inkstones for the pages you wrote.', yes: 'Abandon', no: 'Keep playing', danger: true }).then((ok) => {
      if (!ok) return false;
      const e = finishRun('abandon');
      const stones = e && e.rec && e.rec.inkstones;
      toTitle();
      if (stones) UI.toast('+' + stones + ' Inkstones', 'good');
      return true;
    });
  }

  function toTitle() {
    UI.overlay.closeAll();
    if (state.R && !state.R.done) save();
    if (state.R && state.R.done) setRun(null);
    state.pendingChapter = null;
    return go('title', null, { transition: 'fade', force: true });
  }

  // a lost fight: the screen emits combat:end. Record at once, route after the death animation unless the screen already left.
  function onCombatEnd(e) {
    state.lastCombat = e && e.result;
    if (!e || e.result !== 'lose') return;
    finishRun('lose');
    setTimeout(() => { if (UI.currentName === 'combat' && state.ended && state.ended.outcome === 'lose') defeat(); }, 1600);
  }

  // ==================================================================================================================
  // debug: synthetic runs through RUN and jumps to any screen (used by tools/rogue_book/shot.mjs and by hand)
  // ==================================================================================================================
  const DEBUG_SEED = 20240611;
  const makeInst = (id, up) => { const d = DATA.card(id); return { uid: U.uid(), id, up: up ? 1 : 0, gems: ((d && d.slots) || []).map(() => null) }; };

  // Only when RUN is missing: enough of a run object for screens to open.
  function fakeRun(heroes, seed, opts) {
    const deck = [];
    heroes.forEach((id) => (DATA.heroes[id].starter || []).forEach((cid) => deck.push(makeInst(cid))));
    return {
      v: 1, id: 'debug', seed, trial: opts.trial | 0, daily: false, mods: {}, unlocked: undefined,
      heroes: heroes.map((id) => ({ id, hp: DATA.heroes[id].maxHp, maxHp: DATA.heroes[id].maxHp })), frontIdx: 0, deck, gems: [], relics: [], brushes: [],
      gold: 60, ink: 10, inkMax: 14, chapter: opts.chapter || 1, map: null, node: null, stats: {}, flags: {}, rareOffset: 0, removals: 0, seen: {}, log: [], done: false, victory: false, fake: true,
    };
  }

  function addCardTo(R, id, up) {
    const run = ns.RUN();
    if (run && typeof run.addCard === 'function') { try { run.addCard(R, id, { up: !!up }); return; } catch (e) { /* fall through to a plain push */ } }
    R.deck.push(makeInst(id, up));
  }

  function addRelicTo(R, id) {
    if (R.relics.indexOf(id) >= 0) return;
    const run = ns.RUN();
    if (run && typeof run.applyOps === 'function') { try { run.applyOps(R, [{ op: 'addRelic', id }]); if (R.relics.indexOf(id) >= 0) return; } catch (e) { /* plain push below */ } }
    R.relics.push(id);
  }

  function buildRun(opts) {
    opts = opts || {};
    let heroes = (opts.heroes || []).filter((h) => DATA.heroes[h]);
    if (heroes.length === 0) heroes = ['hanae', 'kuro'];
    if (heroes.length === 1) heroes.push(DATA.LISTS.heroIds.find((h) => h !== heroes[0]));
    heroes = heroes.slice(0, 2);
    const seed = opts.seed !== undefined ? opts.seed >>> 0 : params.seed !== undefined ? params.seed : DEBUG_SEED;
    let R = call('RUN', 'newRun', { heroes, trial: opts.trial | 0, seed, daily: false, unlocked: undefined, nonce: runNonce() });
    if (!R) R = fakeRun(heroes, seed, opts);
    const chapter = opts.chapter || 1;
    if (!R.fake && (!R.map || R.chapter !== chapter)) call('RUN', 'startChapter', R, chapter);
    if (typeof opts.runGold === 'number') R.gold = opts.runGold;
    else if (typeof opts.gold === 'number' && opts.screen !== 'reward') R.gold = opts.gold;
    if (typeof opts.ink === 'number') R.ink = Math.min(opts.ink, R.inkMax || 99);
    if (opts.deck && opts.deck.length) { R.deck.length = 0; opts.deck.forEach((id) => { if (DATA.card(id)) addCardTo(R, id); }); }
    (opts.relics || []).forEach((id) => { if (DATA.relics[id]) addRelicTo(R, id); });
    if (opts.hp && opts.hp.length) opts.hp.forEach((v, i) => { if (R.heroes[i]) R.heroes[i].hp = Math.max(0, Math.min(v, R.heroes[i].maxHp)); });
    return R;
  }

  function encounterFor(ch, kind) {
    const pool = DATA.encounters[ch];
    const list = pool && pool[kind === 'elite' ? 'elite' : 'normal'];
    return list && list[0] ? list[0].id : undefined;
  }

  function contentFor(kind, opts, R) {
    switch (kind) {
      case 'shop': return { seed: opts.seed || 7 };
      case 'chest': return { gold: 60, relic: 'common', gems: false };
      case 'event': return opts.id ? { id: opts.id } : {};
      case 'enemy': case 'elite': return { enc: encounterFor(R.chapter || 1, kind) };
      default: return {};
    }
  }

  // A real Node for `kind`, made by RUN.step on a neighbouring tile that we retype (so the stock, chest and event are built by RUN itself).
  function nodeFor(R, kind, opts) {
    opts = opts || {};
    const map = ns.MAP(), run = ns.RUN();
    const pos = (R.map && R.map.pos) || { q: 0, r: 0 };
    if (map && run && R.map && typeof run.step === 'function' && typeof map.neighbors === 'function') {
      try {
        const t = map.neighbors(R.map, pos.q, pos.r).map((c) => R.map.tiles[map.key(c[0], c[1])]).find((x) => x && x.type !== 'block');
        if (t) {
          t.type = kind; t.painted = true; t.known = true; t.done = false; t.content = contentFor(kind, opts, R);
          const node = run.step(R, t.q, t.r);
          if (node && node.kind) { if (node.kind !== 'well' && node.kind !== 'brush') R.node = R.node || node; return node; }
        }
      } catch (e) { console.warn('[game] debug node through RUN.step failed: ' + e.message); }
    }
    const combat = kind === 'enemy' || kind === 'elite' || kind === 'boss';
    const node = { kind: combat ? 'combat' : kind, tile: { q: pos.q, r: pos.r }, seed: opts.seed || 7 };
    if (combat) { node.tier = kind === 'enemy' ? 'normal' : kind; node.enemies = defaultEnemies(R.chapter || 1, node.tier); }
    R.node = node;
    return node;
  }

  function defaultEnemies(ch, tier) {
    if (tier === 'boss') return [DATA.FIXED.bosses[ch]];
    const g = (DATA.encounters[ch] && DATA.encounters[ch][tier === 'elite' ? 'elite' : 'normal']) || [];
    if (g[0]) return g[0].enemies.slice();
    const ids = DATA.enemyIds(ch, tier === 'elite' ? 'elite' : 'normal');
    return ids.slice(0, tier === 'elite' ? 1 : 2);
  }

  function paintFraction(R, frac) {
    const map = ns.MAP();
    if (!map || !R.map || !R.map.start || !R.map.tiles || !(frac > 0) || typeof map.neighbors !== 'function') return;
    const M = R.map, order = [], seen = {};
    const queue = [[M.start.q, M.start.r]];
    seen[map.key(M.start.q, M.start.r)] = 1;
    while (queue.length) {
      const c = queue.shift();
      const t = M.tiles[map.key(c[0], c[1])];
      if (t) order.push(t);
      map.neighbors(M, c[0], c[1]).forEach((n) => { const k = map.key(n[0], n[1]); const nt = M.tiles[k]; if (!seen[k] && nt && nt.type !== 'block') { seen[k] = 1; queue.push(n); } });
    }
    order.slice(0, Math.round(order.length * Math.min(1, frac))).forEach((t) => { if (!t.painted) { t.painted = true; t.known = true; } });
  }

  function pickRewardCards(R, n) {
    const out = [];
    R.heroes.forEach((h) => { (DATA.rewardPool(h.id, 'common') || []).slice(0, 2).forEach((c) => { if (out.length < n) out.push(c.id); }); });
    (DATA.rewardPool(R.heroes[0].id, 'uncommon') || []).slice(0, 1).forEach((c) => { if (out.length < n) out.push(c.id); });
    return out.slice(0, n);
  }

  // open(screen, opts): jump to any screen with a synthetic run. Unknown option keys are ignored (DESIGN 5.10).
  function open(name, opts) {
    opts = Object.assign({}, opts, { screen: name });
    if (name === 'uigallery' && !UI.screens.uigallery) UI.screens.uigallery = galleryDef();     // built only when the debug tools ask for it
    const bare = { title: 1, heroSelect: 1, library: 1, settings: 1, howto: 1, story: 1, uigallery: 1 };
    const force = { force: true, transition: 'none' };
    if (bare[name]) {
      const p = name === 'story' ? { id: opts.id || 'intro' } : name === 'library' ? { tab: opts.tab } : name === 'uigallery' ? { section: opts.section || 'cards' } : {};
      if (state.R && !state.R.fake && name !== 'story' && name !== 'uigallery') setRun(null);
      return go(name, p, force);
    }
    const R = setRun(buildRun(opts));
    state.ended = null; state.pendingChapter = null; state.lastCombat = null;
    const ch = R.chapter || opts.chapter || 1;
    switch (name) {
      case 'combat': {
        const tier = opts.tier || 'normal';
        const enemies = opts.enemies && opts.enemies.length ? opts.enemies.filter((e) => DATA.enemies[e]) : defaultEnemies(ch, tier);
        const pos = (R.map && R.map.pos) || { q: 0, r: 0 };
        const node = { kind: 'combat', tile: { q: pos.q, r: pos.r }, tier, enemies, chapter: ch };
        R.node = node;
        const dbg = { hand: opts.hand, statuses: opts.statuses, turn: opts.turn, hp: opts.hp };
        return go('combat', { node, R, debug: dbg }, force).then(() => { const s = UI.current; if (s && typeof s.debugSetup === 'function') { try { s.debugSetup(dbg); } catch (e) { console.error('[game] combat debugSetup threw: ' + e.message); } } });
      }
      case 'reward': {
        const source = opts.source || 'combat';
        const rewards = { gold: typeof opts.gold === 'number' ? opts.gold : 18, ink: 1, cards: opts.cards || pickRewardCards(R, 3), relics: opts.relics || [], gems: opts.gems || [], brush: opts.brush || null, maxHp: 0, boss: source === 'boss', tier: source === 'boss' ? 'boss' : source === 'elite' ? 'elite' : 'normal', source };
        const pos = (R.map && R.map.pos) || { q: 0, r: 0 };
        R.node = { kind: 'reward', rewards, source, tile: { q: pos.q, r: pos.r } };
        return go('reward', { rewards, source, node: R.node, R }, force);
      }
      case 'shop': case 'camp': case 'forge': case 'chest': case 'gemcache': case 'event': {
        const node = nodeFor(R, name, opts);
        return go(name, { node, R }, force);
      }
      case 'map':
        paintFraction(R, opts.painted);
        return go('map', { R }, force);
      case 'chapterClear':
        return go('chapterClear', { chapter: opts.chapter || 1, next: (opts.chapter || 1) + 1, healed: R.heroes.map((h) => ({ id: h.id, amount: 20 })), maxHp: 8, R }, force);
      case 'gameOver': case 'victory': {
        const summary = opts.summary || call('RUN', 'summary', R) || { score: 0, victory: name === 'victory', chapter: ch, heroes: R.heroes, gold: R.gold, deckSize: R.deck.length, relics: R.relics };
        return go(name, { summary, R }, force);
      }
      default:
        return go(name, { R }, force);
    }
  }

  function quickRun(opts) {
    const R = setRun(buildRun(opts));
    state.ended = null;
    go('map', { R }, { force: true, transition: 'none' });
    return R;
  }

  function currentCombatDebug() {
    const s = UI.current;
    if (!s || !s.debug) return null;
    return typeof s.debug === 'function' ? s.debug.call(s) : s.debug;
  }

  // Force the running fight to a win: through the screen when it offers debug.win, else headless through COMBAT and RUN.
  function win() {
    const d = currentCombatDebug();
    if (d && typeof d.win === 'function') return d.win();
    const R = state.R;
    if (!R || !R.node || R.node.kind !== 'combat') { console.warn('[game] debug.win: no combat is running'); return Promise.resolve(); }
    const cb = ns.COMBAT(), run = ns.RUN();
    if (!cb || !run || typeof run.combatInit !== 'function' || typeof run.combatDone !== 'function' || typeof cb.create !== 'function') {
      missing('COMBAT and RUN.combatInit/combatDone');
      return enterNode(synthReward(R));                       // enough to keep testing the flow
    }
    try {
      const C = cb.create(run.combatInit(R, R.node));
      C.start();
      C.enemies.forEach((e) => { e.hp = 0; e.down = true; });
      C.result = 'win'; C.phase = 'over';
      run.combatDone(R, C);
      return enterNode(R.node);
    } catch (e) { console.error('[game] debug.win failed: ' + e.message); return enterNode(synthReward(R)); }
  }

  function lose() { UI.bus.emit('combat:end', { result: 'lose' }); return defeat(); }
  function setGold(n) { if (state.R) { state.R.gold = n; UI.toast('Gold set to ' + n, 'info'); } return state.R && state.R.gold; }
  function addRelic(id) { if (state.R && DATA.relics[id]) { addRelicTo(state.R, id); UI.toast('Treasure added: ' + DATA.relics[id].name, 'good'); } return state.R && state.R.relics; }
  function skipChapter() { return state.R ? chapterFlow(state.R) : Promise.resolve(); }

  // ---- frame loop ----
  const loop = { on: false, frozen: false, raf: 0, vt: 0, virtual: false };

  function frameTick(ts) {
    loop.raf = 0;
    if (!loop.on || loop.frozen) return;
    try { UI.frame(ts); } catch (e) { console.error('[game] frame threw: ' + e.message + (e.stack ? '\n' + e.stack : '')); }
    if (!document.hidden) loop.raf = requestAnimationFrame(frameTick);
  }

  function startLoop() {
    if (loop.on) return;
    loop.on = true;
    loop.raf = requestAnimationFrame(frameTick);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && loop.on && !loop.frozen && !loop.raf) loop.raf = requestAnimationFrame(frameTick); });
  }

  function freeze(on) {
    loop.frozen = !!on;
    if (on && loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; }
    if (!on && loop.on && !loop.raf && !document.hidden) loop.raf = requestAnimationFrame(frameTick);
    return loop.frozen;
  }

  // Advance the UI (and everything the current screen drives from UI.frame) with a virtual clock in fixed steps, so
  // `open(...); tick(1200)` replaces --wait and every screenshot is identical. CSS animations are advanced by the same amount.
  // Async on purpose: between frames the promise queue is drained (a few microtask hops), so everything driven by promises
  // (transition mid-functions, SCENE gates, enter() promises) progresses exactly as it would in real time. Resolves to the simulated ms.
  async function tick(ms, step) {
    step = Math.max(1, Math.min(50, step || 16));
    const n = Math.max(1, Math.round((ms || 0) / step));
    if (!loop.virtual) { loop.virtual = true; loop.vt = performance.now(); }
    UI.setClock(loop.vt);
    for (let i = 0; i < n; i++) {
      loop.vt += step;
      UI.frame(loop.vt);
      for (let k = 0; k < 6; k++) await null;
    }
    if (typeof document.getAnimations === 'function') safe(() => document.getAnimations().forEach((a) => { try { a.currentTime = (a.currentTime || 0) + n * step; } catch (e) { /* not seekable */ } }));
    return n * step;
  }

  const debug = { open, quickRun, win, lose, setGold, addRelic, skipChapter, freeze, tick, combat: currentCombatDebug };

  // ==================================================================================================================
  // placeholder screens: registered at boot only when a real screen file did not register the name (later waves replace them)
  // ==================================================================================================================
  function phBackdrop(ctx, t) {
    const g = ctx.createRadialGradient(640, 250, 40, 640, 360, 780);
    g.addColorStop(0, '#2a1d5a'); g.addColorStop(1, '#0d0b1e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = 'rgba(245,201,106,0.5)';
    for (let i = 0; i < 28; i++) { ctx.fillRect((i * 197 + t * (5 + (i % 5) * 3)) % 1280, (i * 83 + Math.sin(t * 0.5 + i) * 18 + 720) % 720, 2, 2); }
  }

  const shell = (root, cls, ...kids) => { const d = mk('div', { class: 'ph ' + (cls || '') }); kids.flat().forEach((k) => { if (k) d.appendChild(k); }); root.appendChild(d); return d; };
  const hint = (text) => mk('p', { class: 'ph-info', text });
  const finishBtn = (label, fn) => UI.btn(label, { kind: 'primary', size: 'lg', onclick: fn, breathe: true });

  function summaryLines(s) {
    if (!s) return [];
    const heroes = (s.heroes || []).map((h) => (DATA.heroes[h.id] ? DATA.heroes[h.id].name : h.id)).join(' and ');
    return [heroes ? 'Heroes: ' + heroes : '', 'Chapter ' + (s.chapter || 1), 'Score ' + (s.score || 0), s.record && s.record.inkstones !== undefined ? '+' + s.record.inkstones + ' Inkstones' : ''].filter(Boolean);
  }

  function synthReward(R) {
    const rewards = { gold: 18, ink: 1, cards: pickRewardCards(R, 3), relics: [], gems: [], brush: null, maxHp: 0, boss: false, tier: 'normal', source: 'combat' };
    R.node = { kind: 'reward', rewards, source: 'combat', tile: (R.node && R.node.tile) || { q: 0, r: 0 } };
    return R.node;
  }

  function placeholders() {
    const nodeScreen = (kind, label, extra) => ({
      music: kind === 'shop' ? 'shop' : kind === 'camp' ? 'camp' : 'event',
      draw: phBackdrop,
      enter(params, root) {
        const R = state.R;
        const node = params && params.node;
        const body = [hint('Placeholder ' + label + ' screen. The real one arrives in a later wave.')];
        if (extra) extra(body, R, node);
        body.push(finishBtn('Leave', () => nodeDone()));
        shell(root, '', UI.panel({ kind: 'paper', torn: true, title: label }, ...body));
      },
    });
    return {
      title: {
        music: 'title',
        draw(ctx, t) {
          const a = typeof ART !== 'undefined' ? ART : null;
          if (a && a.scene && typeof a.scene.draw === 'function') { try { a.scene.draw(ctx, 'title', 1280, 720, t, {}); return; } catch (e) { missing('ART.scene.draw(title)'); } }
          phBackdrop(ctx, t);
        },
        enter(params, root) {
          const meta = ns.META();
          const hasRun = !!safe(() => meta.hasRun(), false);
          const menu = mk('div', { class: 'col gap ph-menu' });
          if (hasRun) menu.appendChild(UI.btn('Continue', { kind: 'primary', size: 'lg', breathe: true, onclick: () => continueRun() }));
          menu.appendChild(UI.btn('New Tale', { kind: hasRun ? 'secondary' : 'primary', size: 'lg', onclick: () => go('heroSelect', null, { transition: 'page' }) }));
          menu.appendChild(UI.btn('Daily Tale', { kind: 'secondary', size: 'lg', onclick: () => newRun({ daily: true }) }));
          menu.appendChild(mk('div', { class: 'row gap center' }, UI.btn('Library', { kind: 'ghost', onclick: () => go('library', null, { transition: 'page' }) }), UI.btn('Settings', { kind: 'ghost', onclick: () => go('settings') }), UI.btn('How to play', { kind: 'ghost', onclick: () => go('howto') })));
          shell(root, 'ph-title', mk('h1', { class: 't-title stroke ph-logo', text: 'INKWOVEN' }), mk('p', { class: 'ph-sub', text: 'a rogue storybook' }), menu);
        },
      },
      heroSelect: {
        music: 'hero_select', draw: phBackdrop,
        enter(params, root) {
          const meta = ns.META();
          const chosen = [];
          let trial = 0;
          const info = hint('Choose two heroes.');
          const start = UI.btn('Begin the tale', { kind: 'primary', size: 'lg', disabled: true, reason: 'Choose two heroes first', onclick: () => newRun({ heroes: chosen.slice(), trial }) });
          const row = mk('div', { class: 'row gap center ph-heroes' });
          const badges = {};
          DATA.LISTS.heroIds.forEach((id) => {
            const unlocked = safe(() => meta.isUnlocked('hero', id), true) !== false;
            const b = UI.heroBadge(id, { size: 'lg', onclick: () => {
              if (!unlocked) { UI.toast('Locked: finish an earlier chapter to write this hero into the book', 'warn'); return; }
              const i = chosen.indexOf(id);
              if (i >= 0) chosen.splice(i, 1); else { if (chosen.length >= 2) chosen.shift(); chosen.push(id); }
              Object.keys(badges).forEach((h) => badges[h].rbSet({ selected: chosen.indexOf(h) >= 0 }));
              info.textContent = chosen.length === 2 ? chosen.map((h) => DATA.heroes[h].name).join(' and ') + ' step onto the page.' : 'Choose two heroes.';
              start.rbSet({ disabled: chosen.length !== 2, reason: 'Choose two heroes first' });
            } });
            if (!unlocked) b.classList.add('down');
            badges[id] = b;
            row.appendChild(mk('div', { class: 'col ph-hero' }, b, mk('p', { class: 'ph-blurb', text: DATA.heroes[id].blurb })));
          });
          const trialMax = safe(() => meta.trialMax(), 0) || 0;
          const trials = trialMax > 0 ? mk('div', { class: 'row gap-s center' }, mk('span', { class: 'dim', text: 'Ink Trial' }), UI.seg(Array.from({ length: trialMax + 1 }, (_, i) => ({ value: i, label: String(i) })), { value: 0, onchange: (v) => { trial = v; } })) : null;
          shell(root, '', mk('h2', { class: 't-xl serif stroke', text: 'Choose your heroes' }), row, info, trials, mk('div', { class: 'row gap center' }, UI.btn('Back', { kind: 'ghost', size: 'lg', onclick: () => go('title', null, { transition: 'page' }) }), start));
        },
      },
      map: {
        music: (p) => 'map' + Math.min(3, Math.max(1, (p && p.R && p.R.chapter) || 1)),
        draw: phBackdrop,
        enter(params, root) {
          const R = state.R;
          if (!R) { shell(root, '', hint('No run is active.'), UI.btn('Title', { kind: 'primary', onclick: () => toTitle() })); return; }
          const stats = mk('div', { class: 'row gap ph-stats' }, UI.stat('gold', R.gold), UI.stat('ink', R.ink, { max: R.inkMax }), ...R.heroes.map((h) => UI.heroBadge(h.id, { size: 'sm', hp: h.hp, maxHp: h.maxHp })));
          const buttons = mk('div', { class: 'row gap-s center wrap ph-nodes' });
          [['Fight', 'enemy'], ['Elite', 'elite'], ['Shop', 'shop'], ['Camp', 'camp'], ['Fable', 'event'], ['Chest', 'chest'], ['Forge', 'forge'], ['Gem cache', 'gemcache'], ['Boss', 'boss']].forEach(([label, kind]) => {
            buttons.appendChild(UI.btn(label, { kind: 'secondary', size: 'sm', onclick: () => { const node = nodeFor(R, kind, {}); enterNode(node); } }));
          });
          const menu = UI.menuButton();
          root.appendChild(menu);
          shell(root, '', mk('h2', { class: 't-xl serif stroke', text: 'Chapter ' + (R.chapter || 1) + ': the map (placeholder)' }), stats, hint('The real map arrives in a later wave. Enter any node type to test the flow.'), buttons, UI.btn('Deck', { kind: 'ghost', onclick: () => UI.overlay.open('deck', { mode: 'view' }) }));
        },
      },
      combat: {
        music: (p) => (p && p.node && p.node.tier === 'boss' ? 'boss' + Math.min(3, Math.max(1, (p.R && p.R.chapter) || 1)) : p && p.node && p.node.tier === 'elite' ? 'elite' : 'combat' + Math.min(3, Math.max(1, (p && p.R && p.R.chapter) || 1))),
        draw: phBackdrop,
        enter(params, root) {
          const node = params && params.node;
          const names = ((node && node.enemies) || []).map((id) => (DATA.enemies[id] && DATA.enemies[id].name) || id).join(', ');
          root.appendChild(UI.menuButton());
          shell(root, '', mk('h2', { class: 't-xl serif stroke', text: 'Combat (placeholder)' }), hint(names ? 'Foes: ' + names : 'Foes unknown'),
            mk('div', { class: 'row gap center' }, finishBtn('Win the fight', () => { UI.bus.emit('combat:end', { result: 'win' }); win(); }), UI.btn('Lose the fight', { kind: 'ghost', size: 'lg', onclick: () => UI.bus.emit('combat:end', { result: 'lose' }) })));
        },
      },
      reward: {
        music: 'reward', draw: phBackdrop,
        enter(params, root) {
          const R = state.R;
          const rw = (params && params.rewards) || {};
          let chosen = null;
          const cards = mk('div', { class: 'row gap center' });
          (rw.cards || []).forEach((id) => {
            const c = UI.card(id, { size: 'reward', onclick: () => { chosen = chosen === id ? null : id; cards.querySelectorAll('.card').forEach((el) => el.rbUpdate({ selected: el.dataset.id === chosen })); } });
            cards.appendChild(c);
          });
          const lines = ['+' + (rw.gold || 0) + ' gold', rw.ink ? '+' + rw.ink + ' Ink' : '', (rw.relics || []).length ? 'Treasure offered' : ''].filter(Boolean).join('   ');
          shell(root, '', mk('h2', { class: 't-xl serif stroke', text: 'Spoils (placeholder)' }), hint(lines), cards,
            mk('div', { class: 'row gap center' }, UI.btn('Skip card', { kind: 'ghost', size: 'lg', onclick: () => { call('RUN', 'claim', R, rw, { card: null, relic: null, gem: null, takeBrush: false }); nodeDone(); } }),
              finishBtn('Take and continue', () => { call('RUN', 'claim', R, rw, { card: chosen, relic: (rw.relics || [])[0] || null, gem: (rw.gems || [])[0] || null, takeBrush: !!rw.brush }); nodeDone(); })));
        },
      },
      shop: nodeScreen('shop', 'The peddler', (body, R, node) => { if (node && node.stock && node.stock.items) body.push(hint(node.stock.items.length + ' wares laid out')); }),
      event: nodeScreen('event', 'A fable', (body, R, node) => { const ev = node && (node.event && node.event.title ? node.event : DATA.events[node && node.event]); if (ev) body.push(hint(ev.title)); }),
      camp: nodeScreen('camp', 'The campfire', (body, R) => { body.push(UI.btn('Rest', { kind: 'secondary', size: 'lg', onclick: () => { call('RUN', 'campAction', R, 'rest'); UI.toast('You rest by the fire', 'good'); } })); }),
      forge: nodeScreen('forge', 'The inkstone forge'),
      chest: nodeScreen('chest', 'A treasure chest', (body, R, node) => { body.push(UI.btn('Open', { kind: 'secondary', size: 'lg', onclick: () => { call('RUN', 'take', R, node, { relic: true, gem: null }); UI.toast('You open the chest', 'good'); } })); }),
      gemcache: nodeScreen('gemcache', 'A gem cache'),
      chapterClear: {
        music: 'victory', draw: phBackdrop,
        enter(params, root) {
          const p = params || {};
          const lore = DATA.lore && DATA.lore['ch' + p.chapter + '_clear'];
          shell(root, '', UI.panel({ kind: 'paper', torn: true, title: 'Chapter ' + (p.chapter || 1) + ' complete' }, mk('p', { class: 'm-text', text: lore ? lore.text : 'The page turns.' }), finishBtn('Continue', () => nodeDone())));
        },
      },
      gameOver: {
        music: 'defeat', draw: phBackdrop,
        enter(params, root) { shell(root, '', UI.panel({ kind: 'paper', torn: true, title: 'The tale ends' }, ...summaryLines(params && params.summary).map((l) => mk('p', { class: 'm-text', text: l })), finishBtn('Back to title', () => toTitle()))); },
      },
      victory: {
        music: 'victory', draw: phBackdrop,
        enter(params, root) { shell(root, '', UI.panel({ kind: 'paper', torn: true, gold: true, title: 'The last page is rewritten' }, ...summaryLines(params && params.summary).map((l) => mk('p', { class: 'm-text', text: l })), finishBtn('Back to title', () => toTitle()))); },
      },
      story: {
        draw: phBackdrop,
        enter(params, root) {
          const p = params || {};
          const lore = DATA.lore && DATA.lore[p.id];
          call('META', 'markLore', p.id);
          const next = () => { if (p.then) go(p.then.name, p.then.params, { transition: 'page' }); else UI.back(); };
          shell(root, '', UI.panel({ kind: 'paper', torn: true, title: lore ? lore.title : 'A page' }, mk('p', { class: 'm-text story-text', text: lore ? lore.text : 'Once upon a time...' }), mk('div', { class: 'row gap center' }, UI.btn('Skip', { kind: 'ghost', onclick: next }), finishBtn('Turn the page', next))));
        },
      },
      settings: {
        draw: phBackdrop,
        enter(params, root) { shell(root, '', UI.panel({ kind: 'paper', torn: true, title: 'Settings' }, UI.settingsPanel(), mk('div', { class: 'row center' }, UI.btn('Back', { kind: 'primary', size: 'lg', onclick: () => UI.back() })))); },
      },
      howto: {
        draw: phBackdrop,
        enter(params, root) {
          const steps = ['Paint the fog away with Ink to reveal hexes, then walk onto them.', 'Fight with two heroes: one in front, one behind. Swap rows when it helps.', 'Play cards with Energy. Socket gems into cards to change how they play.', 'Reach the chapter boss and rewrite the ending.'];
          shell(root, '', UI.panel({ kind: 'paper', torn: true, title: 'How to play' }, ...steps.map((l, i) => mk('p', { class: 'm-text', text: (i + 1) + '. ' + l })), mk('div', { class: 'row center' }, UI.btn('Back', { kind: 'primary', size: 'lg', onclick: () => UI.back() }))));
        },
      },
    };
  }

  // pause: Resume, Deck, Treasures, Settings, How to play, Abandon run, Save and quit (DESIGN 5.11)
  function pauseOverlay() {
    return {
      open(p, root, close) {
        const R = state.R;
        const b = (label, kind, fn) => UI.btn(label, { kind, size: 'lg', onclick: fn });
        const tips = DATA.tips || [];
        const tip = tips.length ? tips[U.rng(U.hash('pause', UI.epoch, R ? R.seed : 0))() * tips.length | 0] : '';
        const items = [
          b('Resume', 'primary', () => close()),
          b('Deck', 'secondary', () => UI.overlay.open('deck', { mode: 'view' })),
          b('Treasures', 'secondary', () => UI.overlay.open('relics', {})),
          b('Settings', 'secondary', () => UI.overlay.open('settings')),
          b('How to play', 'secondary', () => UI.overlay.open('modal', { title: 'How to play', body: 'Paint hexes with Ink, fight with two heroes in two rows, play cards with Energy, and socket gems into card slots. Reach the boss of each chapter.' })),
          R ? b('Abandon run', 'ghost', () => { close(); abandon(); }) : null,
          R ? b('Save and quit', 'ghost', () => { save(); close(); toTitle(); }) : null,
        ].filter(Boolean);
        root.appendChild(UI.panel({ kind: 'dark', title: 'Paused', class: 'pause-panel' }, mk('div', { class: 'col gap ph-menu' }, ...items), tip ? mk('p', { class: 'pause-tip', text: tip }) : null));
      },
    };
  }

  // ==================================================================================================================
  // the component gallery: ?goto=uigallery or GAME.debug.open('uigallery', {section}). Built only when debug tools ask for it.
  // ==================================================================================================================
  function galleryDef() {
    const pickCard = (pred, dflt) => { const c = Object.values(DATA.cards).find(pred); return c ? c.id : dflt; };
    const gemFor = (col) => { const g = Object.values(DATA.gems).find((x) => x.color === col); return g ? g.id : null; };
    const inst = (id, up, socketed) => {
      const d = DATA.card(id) || { slots: [] };
      return { uid: U.uid(), id, up: up ? 1 : 0, gems: (d.slots || []).map((s) => (socketed ? gemFor(s === 'any' ? 'gold' : s) : null)) };
    };
    const byRarity = (r, hero) => pickCard((c) => c.rarity === r && (!hero || c.hero === hero) && c.type !== 'power', 'hanae_slash');
    const lab = (t) => mk('div', { class: 'gal-lab', text: t });
    const col = (label, el) => mk('div', { class: 'col gal-col' }, el, lab(label));
    const S_ = {
      cards(w) {
        const ids = [pickCard((c) => c.rarity === 'starter', 'hanae_slash'), byRarity('common', 'kuro'), byRarity('uncommon', 'hanae'), byRarity('rare', 'suzu'), byRarity('rare', 'raiga')];
        w.appendChild(mk('div', { class: 'gal-row' },
          col('mini', UI.card(inst(ids[0]), { size: 'mini' })), col('mini +', UI.card(inst(ids[1], 1), { size: 'mini' })),
          col('deck', UI.card(inst(ids[2], 0, true), { size: 'deck' })), col('hand', UI.card(inst(ids[1], 0, true), { size: 'hand' })),
          col('reward', UI.card(inst(ids[3], 0, true), { size: 'reward' })), col('big', UI.card(inst(ids[4], 1, true), { size: 'big' }))));
      },
      cards2(w) {
        const c1 = (id, o, up, gems) => UI.card(inst(id, up, gems), Object.assign({ size: 'deck' }, o));
        const junk = (h) => pickCard((c) => c.hero === h, null);
        const curse = junk('curse') || byRarity('common'), status = junk('status') || byRarity('common');
        const x = pickCard((c) => c.cost === 'X', byRarity('uncommon'));
        w.appendChild(mk('div', { class: 'gal-row gal-wrap' },
          col('starter', c1(pickCard((c) => c.rarity === 'starter', 'hanae_slash'), {})), col('common', c1(byRarity('common', 'kuro'), {}, 0, true)), col('uncommon', c1(byRarity('uncommon', 'suzu'), {}, 0, true)),
          col('rare', c1(byRarity('rare', 'raiga'), {}, 0, true)), col('rare, upgraded', c1(byRarity('rare', 'hanae'), {}, 1, true))));
        w.appendChild(mk('div', { class: 'gal-row gal-wrap' },
          col('selected', c1(byRarity('common', 'hanae'), { selected: true })), col('disabled', c1(byRarity('common', 'kuro'), { disabled: true })), col('playable', c1(byRarity('uncommon', 'hanae'), { playable: true })),
          col('curse', c1(curse, {})), col('X cost', c1(x, {})), col('status', c1(status, {}))));
      },
      controls(w) {
        const pan = UI.panel({ kind: 'paper', torn: true, title: 'Paper panel' }, mk('div', { class: 'col gap-s' },
          mk('div', { class: 'row gap' }, UI.btn('Primary', { kind: 'primary', size: 'lg', key: 'E' }), UI.btn('Secondary', { kind: 'secondary', size: 'lg' }), UI.btn('Ghost', { kind: 'ghost', size: 'lg' })),
          mk('div', { class: 'row gap' }, UI.btn('Small', { kind: 'primary', size: 'sm' }), UI.btn('Disabled', { kind: 'primary', disabled: true, reason: 'Not enough gold' }), UI.btn('Danger', { kind: 'primary', danger: true }), UI.btn('Breathing', { kind: 'primary', breathe: true })),
          UI.divider(), mk('div', { class: 'row gap' }, UI.hanko('!'), UI.hanko('New'), UI.hanko('Rare', { size: 'lg' })),
          mk('div', { class: 'row gap' }, UI.seg([{ value: 1, label: 'Normal' }, { value: 2, label: 'Large' }], { value: 1 }), UI.toggle({ value: true }), UI.toggle({ value: false })),
          UI.slider({ value: 0.6 })));
        const dark = UI.panel({ kind: 'dark', gold: true, title: 'Lacquer panel' }, mk('div', { class: 'col gap-s' },
          UI.tabs([{ id: 'a', label: 'Unlocks' }, { id: 'b', label: 'Story' }, { id: 'c', label: 'Bestiary' }], { value: 'a' }),
          UI.bar(48, 76, 'hp'), UI.bar(9, 14, 'ink'), UI.bar(120, 260, 'boss'),
          mk('div', { class: 'row gap' }, UI.stat('gold', 137), UI.stat('ink', 9, { max: 14 }), UI.stat('hp', 48, { max: 76 })),
          mk('div', { class: 'row gap' }, UI.btn('Secondary', { kind: 'secondary' }), UI.btn('Ghost', { kind: 'ghost' }))));
        w.appendChild(mk('div', { class: 'row gap gal-top' }, pan, dark));
      },
      chips(w) {
        const stats = ['gold', 'ink', 'hp', 'energy', 'brush', 'inkstone', 'block'];
        const st = Object.keys(DATA.statuses);
        const relics = Object.keys(DATA.relics).slice(0, 12);
        const gems = Object.keys(DATA.gems).slice(0, 12);
        w.appendChild(mk('div', { class: 'row gap gal-wrap gal-line' }, ...stats.map((k, i) => UI.stat(k, [137, 9, 48, 3, 2, 240, 12][i], { size: 'md' })), ...stats.slice(0, 3).map((k) => UI.stat(k, 88, { size: 'lg' }))));
        w.appendChild(mk('div', { class: 'row gap-s gal-wrap gal-line' }, ...st.map((k, i) => UI.status(k, (i % 6) + 1, { size: 'md' })), UI.status('poison', 4, { size: 'lg' })));
        w.appendChild(mk('div', { class: 'row gap gal-wrap gal-line' }, ...relics.map((id) => UI.relic(id, { size: 'md' })), ...(relics.length ? [UI.relic(relics[0], { size: 'lg' })] : [])));
        w.appendChild(mk('div', { class: 'row gap gal-wrap gal-line' }, ...gems.map((id) => UI.gem(id, { size: 'md' }))));
        w.appendChild(mk('div', { class: 'row gap gal-wrap gal-line' }, ...DATA.LISTS.heroIds.map((h, i) => UI.heroBadge(h, { size: 'lg', hp: [76, 33, 68, 12][i], maxHp: DATA.heroes[h].maxHp })), UI.heroBadge('hanae', { size: 'sm', hp: 50, maxHp: 76 })));
      },
      tips(w) {
        const id = pickCard((c) => c.rarity === 'rare', 'hanae_slash');
        const anchor = UI.status('poison', 3, { size: 'lg' });
        w.appendChild(mk('div', { class: 'row gap gal-line gal-far' }, mk('div', { class: 'gal-anchor' }, anchor), lab('hover a status for its bubble')));
        UI.after(0, () => {
          UI.tip.card(inst(id, 0, true), { x: 80, y: 130 });
          UI.tip.showFor(anchor, UI.tip.kw('poison', 3), { side: 'bottom' });
          ['info', 'good', 'warn', 'achievement'].forEach((k, i) => UI.toast(['A quiet toast', 'The well refills your Ink (+4)', 'Not enough Energy', 'Achievement: First Ink'][i], k, { ms: 600000 }));
        });
      },
      modal() { UI.after(0, () => UI.modal({ title: 'A page has torn', body: 'Something went wrong in the tale, but your progress is safe. Turn back to the title and try again.', buttons: [{ label: 'Copy details', kind: 'secondary', cb: () => false }, { label: 'Back to Title', kind: 'primary' }] })); },
      confirm() { UI.after(0, () => UI.overlay.open('confirm', { title: 'Abandon this tale?', body: 'The run ends here. You keep a share of the Inkstones.', yes: 'Abandon', no: 'Keep playing', danger: true })); },
      pick() { UI.after(0, () => UI.overlay.open('cardPick', { title: 'Choose a card to exhaust', cards: ['hanae', 'kuro', 'suzu'].map((h) => inst(byRarity('common', h))), n: 1, confirm: 'Exhaust' })); },
      legend() { UI.after(0, () => UI.overlay.open('legend', {})); },
      settings() { UI.after(0, () => UI.overlay.open('settings', {})); },
    };
    return {
      draw: phBackdrop,
      enter(params, root) {
        const sec = (params && params.section) || 'cards';
        const w = mk('div', { class: 'gal gal-' + sec });
        w.appendChild(mk('h2', { class: 'gal-h serif', text: 'INKWOVEN components: ' + sec }));
        root.appendChild(w);
        if (S_[sec]) S_[sec](w); else w.appendChild(mk('p', { text: 'Unknown section. Try: ' + Object.keys(S_).join(', ') }));
      },
    };
  }

  // ==================================================================================================================
  // boot
  // ==================================================================================================================
  function registerFallbacks() {
    const ph = placeholders();
    Object.keys(ph).forEach((k) => { if (!UI.screens[k]) UI.screens[k] = ph[k]; });
    if (!UI.overlays.pause) UI.overlays.pause = pauseOverlay();
    if (params.debug || params.goto === 'uigallery') UI.screens.uigallery = galleryDef();
  }

  function mirror() {
    window.GAME = api; window.UI = UI; window.DATA = DATA; window.U = U;
    window.RUN = ns.RUN(); window.MAP = ns.MAP(); window.COMBAT = ns.COMBAT(); window.META = ns.META(); window.AUDIO = ns.AUDIO();
    window.ART = typeof ART !== 'undefined' ? ART : undefined;
    window.SCENE = typeof SCENE !== 'undefined' ? SCENE : undefined;
  }

  function subscribeMeta() {
    const m = ns.META();
    if (!m || !m.bus) { missing('META.bus'); return; }
    m.bus.on('achievement', (e) => {
      const a = DATA.achievements[e && e.id];
      UI.toast('Achievement: ' + (a ? a.name : e && e.id), 'achievement');
      sfx('achievement');
    });
    m.bus.on('unlock', (e) => {
      const reg = e && ({ card: DATA.cards, relic: DATA.relics, gem: DATA.gems, hero: DATA.heroes })[e.kind];
      const d = reg && reg[e.id];
      UI.toast('Unlocked: ' + (d ? d.name : e && e.id), 'good');
      sfx('unlock');
    });
  }

  // Another tab wrote the profile or the run save: fold it into this page's profile (cheap when nothing changed). Coming back to a tab that sat in
  // the background does the same, because storage events can be missed while a page is frozen.
  function watchStorage() {
    const refresh = () => { call('META', 'refresh'); };
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  function markBooted() {
    if (state.booted) return;
    state.booted = true;
    window.__booted = true;
    const b = document.getElementById('boot');
    if (b) { b.classList.add('out'); setTimeout(() => b.remove(), 400); }
  }

  function boot() {
    if (state.booted || state.booting) return;
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => boot(), { once: true }); return; }
    state.booting = true;
    params = parseParams();
    call('META', 'load');
    watchStorage();
    UI.init();
    UI.applySettings();
    if (params.debug) mirror();
    subscribeMeta();
    UI.hooks.toTitle = toTitle;
    UI.bus.on('combat:end', onCombatEnd);
    registerFallbacks();
    startLoop();
    if (params.perf) UI.perf(true);
    let first;
    if (params.goto) {
      if (params.goto === 'uigallery' && !UI.screens.uigallery) UI.screens.uigallery = galleryDef();
      first = open(params.goto, params.opts);
    } else first = go('title', null, { transition: params.freeze ? 'none' : 'fade' });
    Promise.resolve(first).then(markBooted, (e) => { console.error('[game] the first screen failed: ' + (e && e.message)); markBooted(); });
    if (params.freeze) { freeze(true); Promise.resolve(first).then(() => (params.ticks ? tick(params.ticks) : undefined)); }
    setTimeout(markBooted, 2500);
  }

  const api = { boot, state, get params() { return params; }, newRun, continueRun, enterNode, nodeDone, defeat, victory, abandon, toTitle, save, debug };
  return api;
})();

if (!window.__NO_AUTOBOOT) GAME.boot();
