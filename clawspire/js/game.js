// Clawspire -- GAME. The glue: run state, save/load, the main loop, screens,
// input, physics sync for the claw cabinet, rewards, shop, events, rest, map
// flow and meta unlocks. Everything else is consumed through the contracts in
// DESIGN.md. Loads headless (the test loader stubs the DOM); every DOM touch
// happens inside functions and tolerates the stub.
const GAME = (() => {
  'use strict';
  const W = 540, H = 960;
  const STEP = 1 / 60;
  const SAVE_VER = 1;
  const RUN_KEY = 'clawspire_run', META_KEY = 'clawspire_meta';
  // Cabinet interior in stage coordinates (see the stage layout in the bible).
  // Flat floor (no wedges) and a divider at 45% so a long item hanging from
  // the carried claw clears it on the way to the chute.
  const CAB = { x: 30, y: 410, w: 480, h: 390, chuteW: 64, frame: 30, dividerH: 0.45, wallThick: 40, slopeW: 110, slopeH: 55 };
  const GRAVITY = 1150;         // Claw Crawl's gravity (px/s^2)
  const TILT_G = 510;           // sideways gravity while the bin is tilted
  // Arena band: enemies spread across x0..x1 with their feet on the floor
  // line (RENDER.bg draws the backdrop floor at the same y).
  const ARENA = { y0: 70, y1: 340, x0: 90, x1: 450, floor: 300 };
  const HIT_STOP = 0.06;        // seconds of frozen physics on a big hit
  const BEAT = 0.45;            // seconds between enemy-turn events
  const PLAY_BEAT = 0.16;       // seconds between player-side events
  const DELIVER_HOLD = 0.25;    // a body must sit in the chute this long to count
  const AUTO_END = 0.6;         // pause before the turn auto-ends at 0 grabs
  const BIN_FLOOR = 3;          // selling or removing never empties the bin below this
  const WATCHDOG = 20;          // seconds after a drop before the rig is force-reset (phase caps sum to ~17)
  const SPAWN_GAP = 0.05;       // shower spacing when bodies are (re)spawned
  // Ink economy lives in DATA.ECONOMY (the balance pass tunes it there).
  const ECON = () => (typeof DATA !== 'undefined' && DATA && DATA.ECONOMY) || {};
  const START_INK = ECON().startInk || 10;
  const REMOVE_PRICE = 60;
  const RELIC_PRICE = { c: 120, u: 160, r: 220, boss: 220, event: 160 };
  const RARITY_NAME = { c: 'common', u: 'uncommon', r: 'rare', l: 'legendary', junk: 'junk' };
  const TILE_NAMES = {
    empty: 'nothing here', fight: 'a fight', elite: 'an elite', treasure: 'treasure', gem: 'a gem',
    ink: 'ink', brush: 'a brush', event: 'something odd', shop: 'a shop', rest: 'a rest stop',
    boss: 'the boss', start: 'the start', forge: 'a forge', tower: 'a tower',
  };
  // Short labels for landmarks the fog shows before they are lit.
  const LANDMARK_LABELS = { shop: 'Shop', rest: 'Rest', forge: 'Forge', elite: 'Elite', treasure: 'Treasure', boss: 'Boss', tower: 'Tower' };
  const EMPTY_TOASTS = ['An empty arcade. Dust and a flickering sign.', 'Nothing here but old ticket stubs.',
    'A broken cabinet. Someone got there first.', 'Quiet. Too quiet, then a distant jingle.',
    'A vending machine that only sells regret.', 'Footprints in the dust, heading up.'];
  const TUTORIAL = [
    'Welcome to the Rig. <b>Drag on the glass</b> to steer the claw over an item.',
    '<b>Let go to drop.</b> The prongs close on whatever is under them and swing to the chute.',
    'Anything that lands in the <b>chute on the right</b> is played. Two at once is a jackpot.',
  ];

  // Modules are optional at load so the file evaluates before its siblings land.
  const X = {
    PHYS: typeof PHYS !== 'undefined' ? PHYS : null,
    DATA: typeof DATA !== 'undefined' ? DATA : null,
    COMBAT: typeof COMBAT !== 'undefined' ? COMBAT : null,
    MAP: typeof MAP !== 'undefined' ? MAP : null,
    AUDIO: typeof AUDIO !== 'undefined' ? AUDIO : null,
    RENDER: typeof RENDER !== 'undefined' ? RENDER : null,
    INTRO: typeof INTRO !== 'undefined' ? INTRO : null,
  };
  const FX0 = { burst() {}, text() {}, shake() {}, flash() {}, trail() {}, update() {}, draw() {}, offset() { return { x: 0, y: 0 }; } };
  const fx = () => (X.RENDER && X.RENDER.fx) || FX0;
  const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);

  // ---------------------------------------------------------------- state
  const S = {
    screen: 'title', run: null, meta: null, cv: null, ctx: null, headless: false, booted: false,
    t: 0, scale: 1, debug: false, popover: null, sd: null, toastT: 0, keys: {}, mapAnim: 0,
    brushSel: null, mapLayout: null, tutorial: null, after: null, pendingFight: null, ui: { buttons: [] },
    lastHud: '', lastStatus: '', lastRelics: '', lastGrabs: '', frame: null, acc: 0, last: 0, coachStep: -1,
  };
  let F = null;          // the current COMBAT fight or null
  // Live fight session: physics and animation state that is not saved.
  let FS = null;

  const D = () => X.DATA || {};
  const tbl = (n) => D()[n] || {};
  const itemDef = (id) => tbl('ITEMS')[id] || { id, name: String(id), rarity: 'c', tags: [], fx: [], shape: { kind: 'circle', r: 16 }, color: '#888', text: '' };
  const relicDef = (id) => tbl('RELICS')[id] || { id, name: String(id), icon: '?', rarity: 'c', text: '' };
  const enemyDef = (id) => tbl('ENEMIES')[id] || { id, name: String(id), tier: 'normal', act: 1, size: 1 };
  const charDef = (id) => tbl('CHARACTERS')[id] || null;
  const actDef = (n) => (tbl('ACTS')[n]) || { name: 'Act ' + n, sub: '', palette: {} };
  const itemName = (def, plus) => (plus && def.plus && def.plus.name) ? def.plus.name : (def.name + (plus ? '+' : ''));
  const itemText = (def, plus) => {
    if (D().itemText) { try { return D().itemText(def, plus); } catch (e) { /* fall through */ } }
    return (plus && def.plus && def.plus.text) || def.text || '';
  };
  const snd = (name, opts) => { if (X.AUDIO && X.AUDIO.sfx) { try { X.AUDIO.sfx(name, opts); } catch (e) { /* audio is optional */ } } };
  const music = (mode) => { if (X.AUDIO && X.AUDIO.music) { try { X.AUDIO.music(mode); } catch (e) { /* optional */ } } };
  const haptic = (k) => { if (X.AUDIO && X.AUDIO.haptic) { try { X.AUDIO.haptic(k); } catch (e) { /* optional */ } } };

  // Seeded stream for a named purpose; the run's nonce makes every call fresh
  // and the nonce is saved, so a reload never replays a roll.
  function rngFor(tag) {
    const run = S.run;
    if (!run) return U.rng(U.hashStr(tag));
    run.nonce = (run.nonce || 0) + 1;
    return U.rng(U.hashStr(run.seed + ':' + tag + ':' + run.nonce));
  }

  // ---------------------------------------------------------------- DOM helpers
  const $ = (id) => { try { return document.getElementById(id); } catch (e) { return null; } };
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function clear(el) { if (!el) return; if (el.replaceChildren) el.replaceChildren(); else el.innerHTML = ''; }
  // Buttons register with the current screen so GAME.choose(i) can drive them.
  function btn(label, fn, cls) {
    const b = h('button', 'btn ' + (cls || ''), label);
    b.onclick = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (b.disabled) return; snd('click'); fn(); };
    S.ui.buttons.push({ el: b, fn, label });
    return b;
  }
  function canvasEl(px, draw) {
    const c = document.createElement('canvas');
    c.width = px * 2; c.height = px * 2;
    let ctx = null;
    try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
    if (ctx && draw) {
      try { ctx.save(); ctx.scale(2, 2); draw(ctx, px); ctx.restore(); } catch (e) { /* art is optional */ }
    }
    return c;
  }
  function itemCanvas(def, plus, px) {
    return canvasEl(px, (ctx, p) => { if (X.RENDER && X.RENDER.item) X.RENDER.item(ctx, def, p / 2, p / 2, 0, Math.min(1, (p * 0.8) / shapeLong(def.shape)), { plus }); });
  }
  function relicCanvas(def, px) {
    return canvasEl(px, (ctx, p) => { if (X.RENDER && X.RENDER.relicIcon) X.RENDER.relicIcon(ctx, def, p / 2, p / 2, p * 0.8); });
  }
  function portraitCanvas(charId, px) {
    return canvasEl(px, (ctx, p) => { if (X.RENDER && X.RENDER.portrait) X.RENDER.portrait(ctx, charId, p / 2, p / 2, p * 0.9, S.t); });
  }
  function shapeLong(sh) {
    if (!sh) return 40;
    if (sh.kind === 'circle') return sh.r * 2;
    if (sh.kind === 'box') return Math.max(sh.w, sh.h);
    if (sh.verts) { let m = 0; for (const v of sh.verts) m = Math.max(m, Math.abs(v.x) * 2, Math.abs(v.y) * 2); return m || 40; }
    return 40;
  }

  // ---------------------------------------------------------------- toast, popover, banner
  function toast(str, secs) {
    const el = $('toast');
    if (el) { el.textContent = str; el.classList.add('show'); }
    S.toastT = secs || 1.8;
    S.lastToast = str;
  }
  function popover(html, x, y) {
    const el = $('pop');
    if (!el) return;
    if (html == null) { el.classList.remove('show'); S.popover = null; return; }
    el.innerHTML = html;
    const w = 300, hh = 90;
    const px = U.clamp(x - w / 2, 8, W - w - 8);
    const py = y + 12 + hh > H ? y - hh - 12 : y + 12;
    el.style.left = px + 'px'; el.style.top = Math.max(4, py) + 'px';
    el.classList.add('show');
    S.popover = { html, x, y };
    S.popStamp = typeof performance !== 'undefined' ? performance.now() : 0;
  }
  function banner(str, kind, secs) {
    const el = $('banner'), tx = $('bannerTxt');
    if (tx) tx.textContent = str;
    if (el) { el.className = 'show ' + (kind || ''); }
    // the pips and statuses share the row: fade them while the banner is up
    const pr = $('playerRow'); if (pr && pr.classList) pr.classList.add('bannerOn');
    S.bannerT = secs || 1.1;
    S.bannerStr = str;
  }
  function hint(str) { const el = $('hint'); if (el) el.textContent = str; S.hint = str; }

  // ---------------------------------------------------------------- meta
  function freshMeta() {
    return {
      ver: SAVE_VER, unlocks: { knight: true },
      stats: { runs: 0, wins: 0, bestAct: 0, jackpots: 0, kills: 0, fights: 0, played: 0 },
      seen: { items: {}, relics: {} }, tutorialDone: false, introSeen: false, settings: { shake: true },
    };
  }
  function loadMeta() {
    S.meta = freshMeta();
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          S.meta.unlocks = Object.assign(S.meta.unlocks, o.unlocks || {});
          S.meta.stats = Object.assign(S.meta.stats, o.stats || {});
          S.meta.seen = { items: Object.assign({}, (o.seen && o.seen.items) || {}), relics: Object.assign({}, (o.seen && o.seen.relics) || {}) };
          S.meta.tutorialDone = !!o.tutorialDone;
          S.meta.introSeen = !!o.introSeen;
          S.meta.settings = Object.assign(S.meta.settings, o.settings || {});
        }
      }
    } catch (e) { /* a corrupt profile is a fresh profile */ }
    if (fx()) fx().reduced = !S.meta.settings.shake;
    return S.meta;
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(S.meta)); } catch (e) { /* storage may be blocked */ }
  }
  function seeItem(id) { if (S.meta && !S.meta.seen.items[id]) { S.meta.seen.items[id] = 1; } }
  function seeRelic(id) { if (S.meta && !S.meta.seen.relics[id]) { S.meta.seen.relics[id] = 1; } }
  function unlocked(charId) {
    const c = charDef(charId);
    if (!c) return false;
    if (!c.unlock || c.unlock === 'start') return true;
    return !!(S.meta && S.meta.unlocks[charId]);
  }
  function unlockRule(c) {
    if (c.unlock === 'act2') return 'Reach act 2 to unlock';
    if (c.unlock === 'win') return 'Win a run to unlock';
    return 'Locked';
  }
  // Returns the ids newly unlocked by the given milestone.
  function checkUnlocks(milestone) {
    const out = [];
    for (const id in tbl('CHARACTERS')) {
      const c = tbl('CHARACTERS')[id];
      if (c.unlock === milestone && !S.meta.unlocks[id]) { S.meta.unlocks[id] = true; out.push(id); }
    }
    return out;
  }

  // ---------------------------------------------------------------- save / load
  function save() {
    // A finished run (dead or won) is never a CONTINUE; a bin picker saves
    // nothing because the last save on the shop/rest/event screen is the
    // state to come back to.
    if (!S.run || S.screen === 'gameover' || S.screen === 'win') { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ } return; }
    if (S.screen === 'bin') return;
    const o = { ver: SAVE_VER, screen: S.screen, run: S.run, sd: S.sd, pendingFight: S.pendingFight, after: S.after };
    // A fight in progress restarts from its opening bell on load.
    if (S.screen === 'fight' && FS) o.pendingFight = FS.start;
    try { localStorage.setItem(RUN_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }
  function savedRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.ver !== SAVE_VER || !o.run || !o.run.char || !o.run.seed) return null;
      return o;
    } catch (e) { return null; }
  }
  function load() {
    const o = savedRun();
    if (!o) return false;
    try {
      const run = o.run;
      run.map = run.map && X.MAP ? X.MAP.deserialize(run.map) : null;
      if (!run.map) { newMap(run); }
      S.run = run;
      S.sd = o.sd || null;
      S.after = o.after || null;
      F = null; FS = null;
      // Fresh page, fresh uid counter: move it past every saved uid so new
      // items never collide with the ones already in the bin.
      let top = 0;
      for (const inst of run.bin || []) { const n = parseInt(String(inst.uid || '').slice(1), 36); if (n > top) top = n; }
      U.resetUid(top + 1);
      if (o.pendingFight && o.pendingFight.enemyIds) {
        S.screen = 'map';
        startFight(o.pendingFight.enemyIds, o.pendingFight.tier, { seed: o.pendingFight.seed, then: o.pendingFight.then });
        return true;
      }
      const sc = o.screen;
      if (sc === 'reward' && S.sd && S.sd.reward) showReward(S.sd.reward);
      else if (sc === 'shop' && S.sd && S.sd.shop) showShop(S.sd.shop);
      else if (sc === 'event' && S.sd && S.sd.event) showEvent(S.sd.event);
      else if (sc === 'rest') showRest();
      else if (sc === 'forge') showForge();
      else if (sc === 'treasure' && S.sd && S.sd.treasure) showTreasure(S.sd.treasure);
      else if (sc === 'parts' && S.sd && S.sd.parts) showSpareParts(S.sd.parts);
      else toMap();
      return true;
    } catch (e) {
      S.run = null; F = null; FS = null;
      try { localStorage.removeItem(RUN_KEY); } catch (e2) { /* ignore */ }
      return false;
    }
  }

  // ---------------------------------------------------------------- run
  function newRun(charId, seed) {
    charId = charId || 'knight';
    const c = charDef(charId) || { id: charId, hp: 70, gold: 60, bin: [], claw: {}, relic: null };
    if (seed == null) seed = (Date.now() ^ (Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000))) >>> 0;
    seed = (seed >>> 0) || 1;
    const run = {
      ver: SAVE_VER, seed, char: charId, act: 1, hp: c.hp || 70, maxHp: c.hp || 70, gold: c.gold == null ? 60 : c.gold,
      ink: START_INK, brushes: [], bin: [], relics: [], claw: Object.assign({ grabs: 3, width: 1, grip: 1, speed: 1, prongs: 2, rubber: 0, magnet: 0 }, c.claw || {}),
      map: null, floor: 0, kills: 0, turns: 0, grabs: 0, jackpots: 0, delivered: 0, played: 0, fights: 0, history: [],
      nonce: 0, seenEvents: {}, killer: null, tile: null,
    };
    for (const id of (c.bin || [])) { run.bin.push({ uid: U.uid(), id, plus: false }); seeItem(id); }
    S.run = run;
    S.sd = null; S.after = null; S.pendingFight = null;
    F = null; FS = null;
    if (c.relic) gainRelic(c.relic);
    newMap(run);
    S.meta.stats.runs++;
    saveMeta();
    toMap();
    return run;
  }
  function newMap(run) {
    if (!X.MAP) return null;
    const rng = U.rng(U.hashStr(run.seed + ':map:' + run.act));
    run.map = X.MAP.generate({ act: run.act, rng, cols: X.MAP.DEFAULT_COLS || 10, rows: X.MAP.DEFAULT_ROWS || 7, ink: run.ink, brushes: run.brushes });
    run.floor = 0;
    S.brushSel = null;
    S.preview = null;
    S.mapLayout = null; S.mapPaint = null; S.camMap = null; S.camTo = null;
    return run.map;
  }
  function gainRelic(id) {
    const run = S.run;
    if (!run || !id) return;
    if (X.COMBAT && X.COMBAT.gainRelic) X.COMBAT.gainRelic(run, id);
    else run.relics.push(id);
    seeRelic(id);
    S.lastRelics = '';
  }
  function addInk(n) { const run = S.run; run.ink = Math.max(0, run.ink + n); if (run.map) run.map.ink = run.ink; }
  // The map must never dead-end. The cheapest thing that still leads
  // somewhere is a lit walk to the boss or to a tile that hands out ink
  // (free on land, 2 per ford to wade), else the cheapest reveal on the
  // frontier (1, or 2 for a ford). When the ink is short of that, the
  // shortfall seeps in. No brush in hand, or it would be the brush's job.
  function inkRescue() {
    const run = S.run, M = run && run.map;
    if (!M || !X.MAP || (M.brushes && M.brushes.length)) return false;
    // The lit road leads to the boss for free: a player who can walk to
    // the boss without wading needs nothing. This is the last resort for
    // an island with a spent ford, or a save from before the road.
    if (M.road && M.road.length && X.MAP.walkCost && X.MAP.walkCost(M, M.pos, M.boss) === 0) return false;
    const GIVES = ['ink', 'elite', 'tower', 'event', 'shop', 'brush', 'treasure'];
    const cost = (t) => (X.MAP.walkCost ? X.MAP.walkCost(M, M.pos, t) : (X.MAP.pathExists(M, M.pos, t) ? 0 : -1));
    let need = Infinity;
    const bc = cost(M.boss);
    if (bc >= 0) need = bc;
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (!t.revealed || t.done || GIVES.indexOf(t.type) < 0) continue;
      const c = cost(t);
      if (c >= 0 && c < need) need = c;
    }
    if (need === Infinity) {
      for (const t of X.MAP.revealable(M, { brush: true })) { const c = X.MAP.revealCost ? X.MAP.revealCost(t) : 1; if (c < need) need = c; }
      if (need === Infinity) need = 1;
    }
    if (M.ink >= need) return false;
    const n = need - M.ink;
    addInk(n);
    toast(`A drop of ink seeps from a cracked cabinet. +${n} ink.`);
    return true;
  }
  function addGold(n) { const run = S.run; run.gold = Math.max(0, run.gold + n); }
  function addBrush(id) { const run = S.run; run.brushes.push(id); if (run.map) run.map.brushes = run.brushes.slice(); }
  function healRun(n) { const run = S.run; run.hp = U.clamp(run.hp + Math.round(n), 0, run.maxHp); }
  // A bag item (def.bag = [ids]) pours its contents into the bin instead of
  // itself; the last one added is returned so callers keep a handle.
  function addItem(id, plus) {
    const def = itemDef(id);
    if (def && Array.isArray(def.bag) && def.bag.length) {
      let last = null;
      for (const sub of def.bag) last = addItem(sub, plus);
      seeItem(id);
      return last;
    }
    const inst = { uid: U.uid(), id, plus: !!plus }; S.run.bin.push(inst); seeItem(id); return inst;
  }
  // Relic ids not yet owned, filtered by rarity list.
  function relicPool(rarities) {
    const own = S.run ? S.run.relics : [];
    const out = [];
    for (const id in tbl('RELICS')) {
      const r = tbl('RELICS')[id];
      if (own.indexOf(id) >= 0) continue;
      if (r.starter) continue;
      if (rarities && rarities.indexOf(r.rarity || 'c') < 0) continue;
      out.push(id);
    }
    return out;
  }
  function rollRelic(rng, rarities) {
    let pool = relicPool(rarities);
    if (!pool.length) pool = relicPool(null);
    if (!pool.length) return null;
    return rng.pick(pool);
  }
  function rollItems(rng, n) {
    const run = S.run;
    let ids = [];
    if (D().rewardItems) { try { ids = D().rewardItems(rng, run.act, run.char, n) || []; } catch (e) { ids = []; } }
    if (!ids.length) {
      const all = Object.keys(tbl('ITEMS')).filter((id) => itemDef(id).rarity !== 'junk');
      ids = rng.shuffle(all).slice(0, n);
    }
    ids.forEach(seeItem);
    return ids;
  }

  // ---------------------------------------------------------------- screens
  const SCREENS = ['intro', 'title', 'chars', 'map', 'fight', 'reward', 'shop', 'event', 'rest', 'forge', 'treasure', 'parts', 'bin', 'gameover', 'win', 'help', 'collection'];
  function setScreen(name) {
    S.screen = name;
    S.ui.buttons = [];
    popover(null);
    if (name !== 'fight' && FS && FS.done) { F = null; FS = null; }
    for (const s of SCREENS) {
      const el = $('scr-' + s);
      if (el) el.classList[s === name ? 'add' : 'remove']('show');
    }
    const hud = name === 'fight' || name === 'map';
    for (const id of ['top', 'playerRow', 'ctrl']) {
      const el = $(id);
      if (el) el.classList[(id === 'top' ? hud : name === 'fight') ? 'add' : 'remove']('show');
    }
    const coach = $('coach');
    if (coach && name !== 'fight') coach.classList.remove('show');
    if (name === 'fight' && FS) {
      const e = $('endTurn');
      if (e) { e.onclick = () => endTurn(); S.ui.buttons.push({ el: e, fn: () => endTurn(), label: 'END TURN' }); }
    }
    refreshHud(true);
    if (name === 'title') music('title');
    else if (name === 'map' || name === 'shop' || name === 'event' || name === 'rest' || name === 'forge' || name === 'treasure' || name === 'parts' || name === 'reward') music('map');
    else if (name === 'win') music('win');
    else if (name === 'gameover') music('off');
    if (['intro', 'fight', 'bin', 'help', 'collection', 'title', 'chars', 'gameover', 'win'].indexOf(name) < 0) save();
  }

  // ---- title
  function showTitle() {
    S.sd = null;
    setScreen('title');
    const m = $('titleMenu');
    clear(m);
    if (savedRun()) m.appendChild(btn('Continue', () => { if (!load()) { toast('That save was broken. Starting fresh.'); showChars(); } }, 'go'));
    m.appendChild(btn('New run', () => showChars(), 'pri'));
    const row = h('div', 'row');
    row.appendChild(btn('Help', () => showHelp('title')));
    row.appendChild(btn('Collection', () => showCollection()));
    row.appendChild(btn('Intro', () => playIntro(false)));
    m.appendChild(row);
    const row2 = h('div', 'row');
    const A = X.AUDIO;
    const sOn = A ? A.sfxOn : true, mOn = A ? A.musicOn : true;
    row2.appendChild(btn('Sound ' + (sOn ? 'on' : 'off'), () => { if (A && A.toggleSfx) A.toggleSfx(); showTitle(); }, 'sm toggle ' + (sOn ? 'on' : '')));
    row2.appendChild(btn('Music ' + (mOn ? 'on' : 'off'), () => { if (A && A.toggleMusic) A.toggleMusic(); showTitle(); }, 'sm toggle ' + (mOn ? 'on' : '')));
    row2.appendChild(btn('Shake ' + (S.meta.settings.shake ? 'on' : 'off'), () => { S.meta.settings.shake = !S.meta.settings.shake; fx().reduced = !S.meta.settings.shake; saveMeta(); showTitle(); }, 'sm toggle ' + (S.meta.settings.shake ? 'on' : '')));
    m.appendChild(row2);
    const st = S.meta.stats;
    m.appendChild(h('div', 'footer', st.runs ? `${st.runs} runs, ${st.wins} wins, best act ${st.bestAct}` : 'The Prize Master is waiting.'));
  }

  // ---- intro cinematic (js/intro.js). The first launch plays it once;
  // the title's INTRO button replays it. Headless it is a no-op that lands
  // on the title at once. Any tap or key skips (GAME.pointer / onKey).
  function playIntro(first) {
    const I = X.INTRO;
    if (!I || !I.play) { if (first) { S.meta.introSeen = true; saveMeta(); } return false; }
    setScreen('intro');
    music('off');
    return I.play({
      ctx: S.ctx, px: () => S.px || 1, headless: S.headless,
      onDone: () => { if (first) { S.meta.introSeen = true; saveMeta(); } showTitle(); },
    });
  }

  // ---- character select
  function showChars() {
    setScreen('chars');
    const b = $('charsBody');
    clear(b);
    b.appendChild(h('h1', null, 'Pick a crawler'));
    b.appendChild(h('div', 'sub', 'Each carries a different bin of junk and a different claw.'));
    const chars = tbl('CHARACTERS');
    const ids = Object.keys(chars);
    for (const id of ids) {
      const c = chars[id];
      const ok = unlocked(id);
      const card = h('div', 'card charcard' + (ok ? '' : ' locked'));
      const head = h('div', 'head');
      head.appendChild(portraitCanvas(id, 72));
      const tx = h('div', 'col');
      tx.appendChild(h('div', 'name', c.name));
      tx.appendChild(h('div', 'title', c.title || ''));
      head.appendChild(tx);
      card.appendChild(head);
      card.appendChild(h('div', 'text', c.blurb || ''));
      const stats = h('div', 'stats');
      stats.appendChild(h('span', 'tag pink', `${c.hp} hp`));
      stats.appendChild(h('span', 'tag gold', `${c.gold} gold`));
      stats.appendChild(h('span', 'tag cyan', `${(c.claw && c.claw.grabs) || 3} grabs`));
      stats.appendChild(h('span', 'tag', `${(c.bin || []).length} items`));
      if (c.relic) stats.appendChild(h('span', 'tag lime', relicDef(c.relic).name));
      card.appendChild(stats);
      if (!ok) card.appendChild(h('div', 'lock', unlockRule(c)));
      const fn = () => { if (!ok) { toast(unlockRule(c)); return; } snd('click'); newRun(id); };
      card.onclick = fn;
      S.ui.buttons.push({ el: card, fn, label: c.name, disabled: !ok });
      b.appendChild(card);
    }
    if (!ids.length) b.appendChild(btn('Start as the Knight', () => newRun('knight'), 'pri'));
    b.appendChild(btn('Back', () => showTitle(), 'ghost'));
  }

  // ---- help / collection
  function showHelp(back) {
    setScreen('help');
    const b = $('helpBody');
    clear(b);
    b.appendChild(h('h1', null, 'How it works'));
    b.appendChild(h('h3', null, 'The rig'));
    let p = h('p'); p.innerHTML = 'Your deck is a <b>bin of objects</b> in a glass cabinet. Drag on the glass to steer the claw, let go to drop it. The prongs close on whatever is under them, lift, swing to the chute on the right and open. <b>Whatever lands in the chute is played.</b> What slips out lands back in the pile. A turn is a handful of grabs; two items in one grab is a <b>jackpot</b>.'; b.appendChild(p);
    p = h('p'); p.innerHTML = 'Long thin things are hard to hold, balls are easy, flat discs slip, heavy things need grip. The claw only gets better at the top of the tower: every boss you beat leaves spare parts (pick 1 of 3), and a tower keeper can hand you one too. More grabs, a wider palm, stronger grip, a third prong, rubber tips, a magnet.'; b.appendChild(p);
    b.appendChild(h('h3', null, 'Fights'));
    p = h('p'); p.innerHTML = 'Enemies show their <b>intent</b> above their heads. Tap an enemy to target it. Block soaks damage until your next turn. <b>End turn</b> when you are out of grabs (it happens by itself too).'; b.appendChild(p);
    b.appendChild(h('h3', null, 'Statuses'));
    const list = h('div', 'statusList');
    const st = tbl('STATUS');
    const ids = Object.keys(st);
    if (!ids.length) list.appendChild(h('div', 'sub', 'Strength, weak, vulnerable, poison, burn, chill, freeze, regen, thorns, dodge, bleed, stun, grease, fog, armor.'));
    for (const id of ids) {
      const s = st[id];
      const kv = h('div', 'kv');
      const k = h('span'); k.innerHTML = `<b>${s.icon || ''} ${s.name || id}</b>`;
      kv.appendChild(k);
      kv.appendChild(h('span', 'sub', s.text || ''));
      list.appendChild(kv);
    }
    b.appendChild(list);
    b.appendChild(h('h3', null, 'The map'));
    p = h('p'); p.innerHTML = 'The map is hidden. <b>Tap a hidden hex next to the light to reveal it for 1 ink.</b> Brushes reveal a shape for free. Tap a lit hex next to you to walk there. Fights give loot, elites give ink, the boss is at the far right. Three acts, then the Prize Master.'; b.appendChild(p);
    b.appendChild(h('h3', null, 'Keys'));
    p = h('p'); p.innerHTML = 'Arrows steer, Space or Enter drops, E ends the turn, Esc closes popups.'; b.appendChild(p);
    b.appendChild(btn('Back', () => { if (back === 'map') toMap(); else showTitle(); }, 'pri'));
  }
  function showCollection() {
    setScreen('collection');
    const b = $('collectionBody');
    clear(b);
    b.appendChild(h('h1', null, 'Collection'));
    const items = tbl('ITEMS');
    const ids = Object.keys(items);
    const seen = S.meta.seen.items;
    let n = 0;
    for (const id of ids) if (seen[id]) n++;
    b.appendChild(h('div', 'sub', `${n} of ${ids.length} items seen. Tap one for its text.`));
    const grid = h('div', 'grid4');
    for (const id of ids) {
      const def = items[id];
      const ok = !!seen[id];
      const card = h('div', 'card' + (ok ? '' : ' locked'));
      card.appendChild(ok ? itemCanvas(def, false, 56) : canvasEl(56, (ctx, p) => { ctx.fillStyle = '#3d2a63'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', p / 2, p / 2); }));
      card.appendChild(h('div', 'name', ok ? def.name : '???'));
      card.appendChild(h('div', 'rar ' + (def.rarity || 'c'), (RARITY_NAME[def.rarity] || '').slice(0, 4)));
      card.onclick = (ev) => { if (ok) popover(`<b>${def.name}</b><br>${itemText(def, false)}`, 270, 300); };
      grid.appendChild(card);
    }
    b.appendChild(grid);
    const relics = tbl('RELICS');
    const rids = Object.keys(relics);
    if (rids.length) {
      b.appendChild(h('h3', null, 'Relics'));
      const g2 = h('div', 'grid4');
      for (const id of rids) {
        const def = relics[id];
        const ok = !!S.meta.seen.relics[id];
        const card = h('div', 'card' + (ok ? '' : ' locked'));
        card.appendChild(relicCanvas(def, 56));
        card.appendChild(h('div', 'name', ok ? def.name : '???'));
        card.onclick = () => { if (ok) popover(`<b>${def.name}</b><br>${def.text || ''}`, 270, 300); };
        g2.appendChild(card);
      }
      b.appendChild(g2);
    }
    b.appendChild(btn('Back', () => showTitle(), 'pri'));
  }

  // ---------------------------------------------------------------- map
  function toMap() {
    const run = S.run;
    if (!run) { showTitle(); return; }
    if (!run.map) newMap(run);
    run.map.ink = run.ink;
    run.map.brushes = run.brushes.slice();
    S.brushSel = null;
    S.preview = null;
    S.walk = null;
    inkRescue();
    S.sd = null;
    setScreen('map');
    // A fresh (or freshly loaded) map snaps the camera to the player; coming
    // back from a tile eases there.
    if (S.camMap !== run.map) { S.camMap = run.map; lookAt(run.map.pos.q, run.map.pos.r, false); }
    else lookAt(run.map.pos.q, run.map.pos.r, true);
    buildMapHead();
  }
  function buildMapHead() {
    const run = S.run, M = run.map;
    const head = $('mapHead');
    clear(head);
    S.ui.buttons = [];
    const a = actDef(run.act);
    const l1 = h('div', 'l1');
    l1.appendChild(h('h2', null, `Act ${run.act}: ${a.name}`));
    l1.appendChild(h('span', 'mhInk', `${M ? M.ink : run.ink} ink`));
    l1.appendChild(btn('Bin', () => openBin({ mode: 'view', back: () => toMap() }), 'sm ghost'));
    const loc = btn('\u25CE', () => locate(), 'sm ghost');
    loc.title = 'Recentre on you';
    l1.appendChild(loc);
    l1.appendChild(btn('?', () => showHelp('map'), 'sm ghost'));
    l1.appendChild(btn('Quit', () => { save(); showTitle(); }, 'sm ghost'));
    head.appendChild(l1);
    const l2 = h('div', 'l2');
    const counts = {};
    for (const id of run.brushes) counts[id] = (counts[id] || 0) + 1;
    for (const id in counts) {
      const bd = (tbl('BRUSHES')[id]) || { name: id, icon: '~' };
      const chip = h('button', 'brush' + (S.brushSel === id ? ' sel' : ''), `${bd.icon || ''} ${bd.name}${counts[id] > 1 ? ' x' + counts[id] : ''}`);
      const fn = () => { S.brushSel = S.brushSel === id ? null : id; buildMapHead(); };
      chip.onclick = fn;
      S.ui.buttons.push({ el: chip, fn, label: bd.name });
      l2.appendChild(chip);
    }
    const pv = S.preview;
    const walking = S.walk && !S.walk.done;
    const hintTxt = S.brushSel ? `Brush ready: tap a hidden hex next to the light to paint it.`
      : walking ? 'Walking. Tap the map to stop.'
      : pv ? (M.ink >= pv.cost ? `Path: ${pv.cost} ink. Tap that hex again to paint it and walk there.` : `Path: ${pv.cost} ink, you have ${M.ink}. Elites, towers and ink pots give more.`)
      : 'Tap a lit hex to walk there; the road leads to the boss for free. Tap a hidden hex to preview the ink path, tap again to paint and walk it. Fords cost 2.';
    l2.appendChild(h('div', 'hint', hintTxt));
    head.appendChild(l2);
    refreshHud(true);
  }
  // The map is drawn as a portrait climb: MAP orient 'v' transposes the
  // generator's left-to-right layout so the start sits at the bottom middle
  // and the boss at the top. The world is bigger than the screen (16x22
  // hexes of MAP_HEX px, about 1540 x 1310), so the map screen is a camera:
  // S.cam = {x, y, zoom} is the world point under the centre of the map area
  // plus the zoom. A drag pans it, a pinch or the wheel zooms it, it eases to
  // the player after a move, the head's locate button recentres, and its
  // centre is clamped to the map. Not saved: toMap() recentres.
  const MAP_ORIENT = 'v', MAP_HEX = 46;
  const MAP_AREA = { x: 0, y: 172, w: W, h: 768 };
  const CAM_MIN = 0.6, CAM_MAX = 1.4, CAM_MARGIN = 80, CAM_EASE = 8, DRAG_PX = 8, ARROW_INSET = 36;
  // World geometry of the current map (cached per map object).
  function mapLayout() {
    const M = S.run && S.run.map;
    if (!M || !X.MAP) return null;
    if (S.mapLayout && S.mapLayout.M === M) return S.mapLayout;
    const size = X.MAP.HEX || MAP_HEX;
    let b;
    if (X.MAP.bounds) b = X.MAP.bounds(M, size, MAP_ORIENT);
    else {
      const sx = Math.sqrt(3) * size * (M.cols + 0.5), sy = size * (1.5 * (M.rows - 1) + 2);
      b = { w: sy, h: sx, ox: 0, oy: size - (Math.sqrt(3) / 2) * size + sx };
    }
    S.mapLayout = { M, area: MAP_AREA, size, ox: b.ox, oy: b.oy, w: b.w, h: b.h, orient: MAP_ORIENT };
    return S.mapLayout;
  }
  function cam() {
    if (!S.cam) S.cam = { x: 0, y: 0, zoom: 1 };
    return S.cam;
  }
  function worldOf(q, r) {
    const L = mapLayout();
    if (!L) return { x: 0, y: 0 };
    const p = X.MAP.toPixel(q, r, L.size, L.orient);
    return { x: L.ox + p.x, y: L.oy + p.y };
  }
  // The view centre stays on the map, so any hex (the start on the bottom
  // edge included) can be centred; past that the view keeps CAM_MARGIN of
  // map in sight. A map smaller than the view is centred.
  function clampCam(c) {
    const L = mapLayout();
    if (!L) return c;
    c.zoom = U.clamp(c.zoom || 1, CAM_MIN, CAM_MAX);
    const hw = L.area.w / 2 / c.zoom, hh = L.area.h / 2 / c.zoom;
    const x0 = Math.min(hw - CAM_MARGIN, 0), x1 = Math.max(L.w + CAM_MARGIN - hw, L.w);
    const y0 = Math.min(hh - CAM_MARGIN, 0), y1 = Math.max(L.h + CAM_MARGIN - hh, L.h);
    c.x = x0 > x1 ? L.w / 2 : U.clamp(c.x, x0, x1);
    c.y = y0 > y1 ? L.h / 2 : U.clamp(c.y, y0, y1);
    return c;
  }
  function worldToStage(wx, wy) {
    const L = mapLayout(), c = cam();
    return { x: L.area.x + L.area.w / 2 + (wx - c.x) * c.zoom, y: L.area.y + L.area.h / 2 + (wy - c.y) * c.zoom };
  }
  function stageToWorld(x, y) {
    const L = mapLayout(), c = cam();
    return { x: c.x + (x - L.area.x - L.area.w / 2) / c.zoom, y: c.y + (y - L.area.y - L.area.h / 2) / c.zoom };
  }
  function hexToStage(q, r) {
    if (!mapLayout()) return { x: 0, y: 0 };
    const w = worldOf(q, r);
    return worldToStage(w.x, w.y);
  }
  function stageToHex(x, y) {
    const L = mapLayout();
    if (!L) return null;
    const w = stageToWorld(x, y);
    return X.MAP.fromPixel(w.x - L.ox, w.y - L.oy, L.size, L.orient);
  }
  // Point the camera at a hex: snapped, or eased over the next frames.
  function lookAt(q, r, ease) {
    if (!mapLayout()) return;
    const w = worldOf(q, r);
    const to = clampCam({ x: w.x, y: w.y, zoom: cam().zoom });
    if (ease) { S.camTo = { x: to.x, y: to.y }; return; }
    const c = cam();
    c.x = to.x; c.y = to.y;
    S.camTo = null;
  }
  function locate() { const M = S.run && S.run.map; if (M) lookAt(M.pos.q, M.pos.r, true); }
  function camStep(dt) {
    if (!S.camTo || !mapLayout()) return;
    const c = cam();
    const k = 1 - Math.exp(-CAM_EASE * dt);
    c.x += (S.camTo.x - c.x) * k; c.y += (S.camTo.y - c.y) * k;
    if (Math.abs(S.camTo.x - c.x) < 0.5 && Math.abs(S.camTo.y - c.y) < 0.5) { c.x = S.camTo.x; c.y = S.camTo.y; S.camTo = null; }
    clampCam(c);
  }
  // Zoom by a factor keeping the world point under (x, y) where it is.
  function zoomAt(x, y, factor) {
    const L = mapLayout();
    if (!L) return;
    const c = cam();
    const w = stageToWorld(x, y);
    c.zoom = U.clamp(c.zoom * factor, CAM_MIN, CAM_MAX);
    c.x = w.x - (x - L.area.x - L.area.w / 2) / c.zoom;
    c.y = w.y - (y - L.area.y - L.area.h / 2) / c.zoom;
    clampCam(c);
    S.camTo = null;
  }
  function wheel(x, y, deltaY) {
    if (S.screen !== 'map') return;
    zoomAt(x, y, Math.exp(-(deltaY || 0) * 0.0012));
  }
  // The boss when it is off screen: where to draw an arrow on the edge of
  // the map area and which way it points. Null while the boss hex is in view.
  function bossArrow() {
    const M = S.run && S.run.map, L = mapLayout();
    if (!M || !L) return null;
    const p = hexToStage(M.boss.q, M.boss.r);
    const A = L.area;
    if (p.x >= A.x && p.x <= A.x + A.w && p.y >= A.y && p.y <= A.y + A.h) return null;
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    const dx = p.x - cx, dy = p.y - cy;
    const hw = A.w / 2 - ARROW_INSET, hh = A.h / 2 - ARROW_INSET;
    const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
    return { x: cx + dx * k, y: cy + dy * k, a: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
  }
  // Map input: one finger drags the camera once it moves DRAG_PX, a finger
  // that never moved taps on lift, two fingers pinch-zoom about their midpoint.
  function mapPointer(type, x, y, ev) {
    const pid = 'p' + (ev && ev.pointerId != null ? ev.pointerId : 0);
    const P = S.mapPtrs || (S.mapPtrs = {});
    const c = cam();
    if (type === 'down') {
      P[pid] = { x, y };
      const ids = Object.keys(P);
      if (ids.length === 1) S.mapDrag = { moved: false, x0: x, y0: y, cx: c.x, cy: c.y };
      else if (ids.length === 2 && mapLayout()) {
        const a = P[ids[0]], b = P[ids[1]];
        const w = stageToWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
        S.mapPinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: c.zoom, wx: w.x, wy: w.y };
        if (S.mapDrag) S.mapDrag.moved = true;
      }
      return;
    }
    const p = P[pid];
    if (!p) return;
    if (type === 'move') {
      p.x = x; p.y = y;
      const ids = Object.keys(P);
      const L = mapLayout();
      if (ids.length >= 2 && S.mapPinch && L) {
        const a = P[ids[0]], b = P[ids[1]];
        const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        c.zoom = U.clamp(S.mapPinch.zoom0 * d / S.mapPinch.d0, CAM_MIN, CAM_MAX);
        c.x = S.mapPinch.wx - (mx - L.area.x - L.area.w / 2) / c.zoom;
        c.y = S.mapPinch.wy - (my - L.area.y - L.area.h / 2) / c.zoom;
        clampCam(c); S.camTo = null;
        return;
      }
      const d = S.mapDrag;
      if (!d || !L) return;
      const dx = x - d.x0, dy = y - d.y0;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
      d.moved = true; S.camTo = null;
      c.x = d.cx - dx / c.zoom; c.y = d.cy - dy / c.zoom;
      clampCam(c);
      return;
    }
    if (type === 'up' || type === 'cancel') {
      delete P[pid];
      const ids = Object.keys(P);
      const d = S.mapDrag;
      if (!ids.length) {
        S.mapDrag = null; S.mapPinch = null;
        if (type === 'up' && d && !d.moved && y >= MAP_AREA.y) mapTap(x, y);
      } else {
        // a pinch finger lifted: the other finger carries on as a drag
        const rest = P[ids[0]];
        S.mapPinch = null;
        S.mapDrag = { moved: true, x0: rest.x, y0: rest.y, cx: c.x, cy: c.y };
      }
    }
  }
  function mapTap(x, y) {
    const run = S.run, M = run && run.map;
    if (!M) return false;
    const hx = stageToHex(x, y);
    if (!hx) return false;
    // A tap during a walk stops it where the crawler stands.
    if (S.walk && !S.walk.done) { stopWalk(); toast('Stopped.'); buildMapHead(); return false; }
    const t = X.MAP.tileAt(M, hx.q, hx.r);
    // A tap anywhere but the previewed hex clears the preview.
    const pv = S.preview;
    const samePv = !!(pv && t && pv.q === t.q && pv.r === t.r);
    if (pv && !samePv) { S.preview = null; buildMapHead(); }
    if (!t) return false;
    if (S.brushSel && X.MAP.canBrush && X.MAP.canBrush(M, S.brushSel, t.q, t.r)) {
      const tiles = X.MAP.brush(M, S.brushSel, t.q, t.r) || [];
      run.brushes = M.brushes.slice();
      S.brushSel = null;
      snd('brush');
      fx().burst(x, y, '#a6ff5e', 18);
      toast(`Painted ${tiles.length} hexes.`);
      buildMapHead();
      save();
      return true;
    }
    if (t.terrain === 'sea') { toast('Open water. Nothing to chart out there.'); return false; }
    const ford = t.terrain === 'shallow';
    const tileCost = X.MAP.revealCost ? X.MAP.revealCost(t) : 1;
    if (!t.revealed) {
      if (X.MAP.canReveal(M, t.q, t.r)) {
        X.MAP.reveal(M, t.q, t.r);
        run.ink = M.ink;
        snd('reveal');
        fx().burst(x, y, '#2ee6d6', 12);
        toast(ford ? `Charted a ford. ${tileCost} ink.` : `Revealed: ${TILE_NAMES[t.type] || t.type}.`);
        inkRescue();
        buildMapHead();
        save();
        return true;
      }
      // Not next to the light: preview the ink path, paint it on a second tap.
      const path = X.MAP.pathToReveal ? X.MAP.pathToReveal(M, t.q, t.r) : [];
      if (!path.length) {
        if (M.ink < tileCost) toast(ford ? `A ford takes ${tileCost} ink to chart. You have ${M.ink}.` : 'No ink. Elites, towers and ink pots give more.');
        else toast('No way through the fog to that hex.');
        if (inkRescue()) buildMapHead();
        return false;
      }
      const cost = X.MAP.pathCost ? X.MAP.pathCost(M, path) : path.length;
      if (samePv) {
        if (M.ink < cost) { toast(`That path needs ${cost} ink. ${cost - M.ink} short.`); return false; }
        const tiles = X.MAP.revealPath(M, path) || [];
        run.ink = M.ink;
        S.preview = null;
        snd('reveal');
        fx().burst(x, y, '#2ee6d6', 18);
        toast(`Painted ${tiles.length} hexes to ${ford ? 'a ford' : (TILE_NAMES[t.type] || t.type)}.`);
        inkRescue();
        buildMapHead();
        save();
        // ...and walk it (the walk stops at the first thing that resolves).
        const walk = X.MAP.walkPath ? X.MAP.walkPath(M, t.q, t.r) : null;
        if (walk) startWalk(walk);
        return true;
      }
      S.preview = { q: t.q, r: t.r, path, cost, label: t.known ? (LANDMARK_LABELS[t.type] || t.type) : (ford ? 'Ford' : null) };
      snd('click');
      buildMapHead();
      return true;
    }
    if (t.q === M.pos.q && t.r === M.pos.r) { toast('You are here.'); return false; }
    // Click to travel: any lit hex reachable through lit hexes. A neighbour
    // is a one-step walk (the old tap); a ford the ink cannot pay stops the
    // walk in front of it with its price.
    const path = X.MAP.walkPath ? X.MAP.walkPath(M, t.q, t.r) : (X.MAP.canMove(M, t.q, t.r) ? [[t.q, t.r]] : null);
    if (path) return startWalk(path);
    toast('No lit way there yet. Chart the fog between.');
    return false;
  }
  // Click to travel. S.walk = { path: [[q, r], ...], i: next step, t: time
  // since the last step, from: the hex the crawler is easing out of, done }.
  // The first step is taken at once (a tap on a neighbour is the old
  // one-step move), the rest every WALK_STEP seconds, the crawler easing
  // between hex centres and the camera following. A step onto anything
  // that resolves (content that is not done, a ford) ends the walk there
  // and drops the rest of the path; a ford the ink cannot pay stops the
  // walk in front of it with a toast; a tap during the walk stops it at
  // the current hex. Never saved: toMap() clears it.
  const WALK_STEP = 0.28;
  function startWalk(path) {
    if (!path || !path.length) return false;
    S.walk = { path: path.map(([q, r]) => [q, r]), i: 0, t: 0, from: null, done: false };
    const ok = walkStep();
    if (S.screen === 'map') buildMapHead();   // the step may have opened a fight or a shop
    return ok;
  }
  function stopWalk() { if (S.walk) S.walk.done = true; }
  // One step of the walk; true when the step was taken.
  function walkStep() {
    const w = S.walk, run = S.run, M = run && run.map;
    if (!w || w.done || !M) return false;
    if (w.i >= w.path.length) { w.done = true; return false; }
    const [q, r] = w.path[w.i];
    const t = X.MAP.tileAt(M, q, r);
    if (!t || !X.MAP.canMove(M, q, r)) {
      if (t && t.terrain === 'shallow' && X.MAP.isAdjacent(M.pos.q, M.pos.r, q, r)) {
        const wade = X.MAP.moveCost ? X.MAP.moveCost(t) : 2;
        toast(`Wading that ford takes ${wade} ink. You have ${M.ink}.`);
        if (inkRescue()) buildMapHead();
      } else toast('The way is blocked.');
      w.done = true;
      return false;
    }
    const resolves = (t.type !== 'empty' && t.type !== 'start' && !t.done) || t.terrain === 'shallow';
    w.from = { q: M.pos.q, r: M.pos.r };
    w.t = 0; w.i++;
    X.MAP.move(M, q, r);
    run.ink = M.ink;
    run.floor++;
    snd('step');
    lookAt(q, r, true);
    enterTile(t);
    if (resolves || S.screen !== 'map' || w.i >= w.path.length) w.done = true;
    return true;
  }
  // Advances the walk: the next step when WALK_STEP has passed, and drops
  // a finished walk once its last ease has played.
  function walkTick(dt) {
    const w = S.walk;
    if (!w) return;
    w.t += dt;
    if (w.done) { if (w.t >= WALK_STEP) S.walk = null; return; }
    if (w.t >= WALK_STEP) { if (!walkStep() && S.screen === 'map') buildMapHead(); }
  }
  // Where the crawler is drawn: easing from the hex it left to pos while a
  // walk plays, else null (it stands on pos).
  function walkXY() {
    const w = S.walk, M = S.run && S.run.map;
    if (!w || !w.from || !M) return null;
    const e = Math.min(1, w.t / WALK_STEP), k = e * e * (3 - 2 * e);
    if (k >= 1) return null;
    const a = hexToStage(w.from.q, w.from.r), b = hexToStage(M.pos.q, M.pos.r);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  // Resolve a tile the player just stepped on.
  function enterTile(t) {
    const run = S.run;
    if (!t) return;
    run.tile = { q: t.q, r: t.r };
    const c = t.content || {};
    // A cleared tile: nothing to do (no toast for one merely crossed mid-walk).
    if (t.done) { if (!(S.walk && !S.walk.done && S.walk.i < S.walk.path.length)) toast('Already cleared.'); save(); return; }
    const finish = () => { t.done = true; };
    switch (t.type) {
      case 'fight': case 'elite': {
        finish();
        const enc = c.enc || encounterFor(t.type === 'elite' ? 'elite' : 'normal');
        startFight(enc, t.type === 'elite' ? 'elite' : 'normal');
        return;
      }
      case 'boss': {
        finish();
        const enc = c.enc || encounterFor('boss');
        startFight(enc, 'boss');
        return;
      }
      case 'tower': {
        // An elite-tier fight; the win pays a relic plus the bonus rolled at generate.
        finish();
        const enc = c.enc || encounterFor('elite');
        startFight(enc, 'elite', { then: { tower: { bonus: (c.tower && c.tower.bonus) || { k: 'ink', n: 2 }, q: t.q, r: t.r } } });
        return;
      }
      case 'treasure': {
        finish();
        if (c.gold) addGold(c.gold);
        const id = rollRelic(rngFor('treasure'), ['c', 'u', 'r']);
        showTreasure({ relic: id, gold: c.gold || 0, title: 'Treasure' });
        return;
      }
      case 'gem': {
        finish();
        const g = c.gold || 10;
        addGold(g);
        snd('coin');
        toast(`A gem. +${g} gold.`);
        break;
      }
      case 'ink': {
        finish();
        const n = Math.max(c.ink || 1, ECON().inkTile || 1);
        addInk(n);
        snd('reveal');
        toast(`A pot of ink. +${n} ink.`);
        buildMapHead();
        break;
      }
      case 'brush': {
        finish();
        const id = c.brush || (X.MAP && X.MAP.brushIds ? X.MAP.brushIds()[0] : 'splash');
        addBrush(id);
        snd('brush');
        const bd = tbl('BRUSHES')[id] || { name: id };
        toast(`Found a brush: ${bd.name}.`);
        buildMapHead();
        break;
      }
      case 'event': {
        finish();
        const id = pickEvent(c.event);
        if (id) { showEvent({ id }); return; }
        toast('Whatever was here has moved on.');
        break;
      }
      case 'shop': finish(); showShop(rollShop(t)); return;
      case 'rest': finish(); showRest(); return;
      case 'forge': finish(); showForge(); return;
      case 'empty': {
        if (t.terrain === 'shallow') {
          const wade = X.MAP && X.MAP.moveCost ? X.MAP.moveCost(t) : 2;
          toast(`You wade the ford. ${wade} ink, and cold to the knees.`);
          inkRescue();
          buildMapHead();
          break;
        }
        if (!t.seenToast) { t.seenToast = true; toast(EMPTY_TOASTS[(t.q * 7 + t.r * 13 + run.act) % EMPTY_TOASTS.length]); }
        break;
      }
      default: break;
    }
    save();
  }
  function encounterFor(kind) {
    const run = S.run;
    const enc = tbl('ENCOUNTERS')[run.act];
    const list = enc && enc[kind];
    if (list && list.length) return rngFor('enc').pick(list).slice();
    const ids = Object.keys(tbl('ENEMIES')).filter((id) => { const e = enemyDef(id); return e.act === run.act && (e.tier || 'normal') === (kind === 'normal' ? 'normal' : kind); });
    if (ids.length) return [rngFor('enc').pick(ids)];
    return ['dummy'];
  }
  function pickEvent(preferred) {
    const run = S.run;
    const evs = tbl('EVENTS');
    const ids = Object.keys(evs);
    if (!ids.length) return null;
    if (preferred && evs[preferred] && !run.seenEvents[preferred]) { run.seenEvents[preferred] = 1; return preferred; }
    const fresh = ids.filter((id) => !run.seenEvents[id]);
    const id = (fresh.length ? rngFor('event').pick(fresh) : rngFor('event').pick(ids));
    run.seenEvents[id] = 1;
    return id;
  }

  // ---------------------------------------------------------------- fight
  function clawFor() {
    return (F && F.claw) || (S.run && S.run.claw) || { grabs: 3, width: 1, grip: 1, speed: 1, prongs: 2, rubber: 0, magnet: 0 };
  }
  function startFight(enemyIds, tier, opts) {
    opts = opts || {};
    const run = S.run;
    if (!run || !X.COMBAT) return null;
    enemyIds = (enemyIds || []).slice();
    tier = tier || 'normal';
    const seed = opts.seed != null ? opts.seed : U.hashStr(run.seed + ':fight:' + run.act + ':' + run.floor + ':' + (run.nonce = (run.nonce || 0) + 1));
    F = X.COMBAT.newFight(run, enemyIds, U.rng(seed));
    FS = {
      start: { enemyIds, tier, seed, then: opts.then || null }, tier, seed, rng: U.rng(seed ^ 0x5bd1e995),
      world: null, cabinet: null, rig: null, items: [], spawnQ: [], spawnT: 0,
      grabInFlight: false, pendingDrop: false, dropAt: 0, releaseAt: -1, watch: false, delivered: 0, steering: false, wasHeld: 0,
      hitStop: 0, chuteFlash: 0, landSnd: 0, slips: 0, frameN: 0,
      playQ: [], playT: 0, queue: [], beatT: 0, onDrain: null, enemyTurn: false, actor: -1, actors: [],
      autoEndT: 0, anim: {}, fog: 0, grease: 0, tilt: 0, done: false, killer: null, keyDir: 0, then: opts.then || null,
      turnsTaken: 0, dirty: true, shown: { p: { hp: 0, block: 0 }, e: {} },
    };
    syncShown();
    S.pendingFight = null;
    buildWorld();
    spawnAll();
    setScreen('fight');
    if (opts.seed == null) { S.meta.stats.fights++; run.fights++; }
    music(tier === 'boss' ? 'boss' : tier === 'elite' ? 'elite' : 'fight');
    if (tier === 'boss') { snd('boss'); haptic('boss'); }
    banner(tier === 'boss' ? 'BOSS' : tier === 'elite' ? 'ELITE' : 'FIGHT', tier === 'boss' ? 'enemy' : 'turn', 1.2);
    hint('steer and release');
    // Opening events of turn 1 (start block, relic text) show right away.
    drainF(PLAY_BEAT);
    if (!S.meta.tutorialDone) startCoach();
    save();
    return F;
  }
  function buildWorld() {
    if (!X.PHYS) return;
    const P = X.PHYS;
    if (FS.rig && FS.rig.destroy) { try { FS.rig.destroy(); } catch (e) { /* ignore */ } }
    FS.world = P.world({ gravity: { x: 0, y: GRAVITY }, w: CAB.w, h: CAB.h });
    FS.cabinet = P.cabinet(FS.world, { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, wallThick: CAB.wallThick, slopeW: CAB.slopeW, slopeH: CAB.slopeH });
    buildRig();
    FS.items = [];
  }
  function buildRig() {
    const P = X.PHYS;
    const c = clawFor();
    const b = FS.cabinet.bounds;
    FS.rig = P.clawRig(FS.world, {
      cabinet: FS.cabinet, homeX: (b.chuteX || CAB.w - CAB.chuteW) * 0.5, chuteX: (b.chuteX || CAB.w - CAB.chuteW) + CAB.chuteW * 0.5,
      railY: 26, prongs: c.prongs, width: c.width, grip: c.grip, speed: c.speed, rubber: c.rubber, magnet: c.magnet, grease: FS.grease > 0 ? 1 : 0,
      rand: U.rng(FS.seed ^ 0x1234567),
    });
  }
  // The physics shape: PHYS turns a circle into a ball, a box into a capsule
  // and a polygon into a blob (or a thin capsule when it is long); a frozen
  // item is a ball of its long radius (a lump of ice).
  function shapeFor(def, inst) {
    const sh = def.shape || { kind: 'circle', r: 16 };
    if (inst && inst.frozen) return { kind: 'circle', r: Math.max(8, shapeLong(sh) / 2) };
    if (sh.kind === 'circle') return { kind: 'circle', r: sh.r };
    if (sh.kind === 'box') return { kind: 'box', w: sh.w, h: sh.h };
    if (sh.verts) return { kind: 'poly', verts: sh.verts };
    return { kind: 'circle', r: 16 };
  }
  function bodyOf(inst) {
    for (const b of FS.items) if (b.data.inst === inst) return b;
    for (const b of FS.items) if (b.data.inst.uid === inst.uid) return b;
    return null;
  }
  // Spawn one body for a bin instance. Positions come from the fight's rng
  // stream: a shower across the bin, away from the parked claw.
  function spawnBody(inst, at) {
    if (!FS.world || !X.PHYS) return null;
    const def = itemDef(inst.id);
    const shape = shapeFor(def, inst);
    const r = FS.rng;
    const home = FS.rig ? FS.rig.homeX : CAB.w * 0.5;
    const binW = (FS.cabinet.bounds.chuteX || CAB.w - CAB.chuteW);
    let x, y, a;
    if (at) { x = at.x; y = at.y; a = at.a || 0; }
    else {
      // Whole bin width, below the parked prongs (palm at ~50, tips at ~100),
      // so the pile lands flat instead of in two heaps beside the claw.
      x = 36 + r() * Math.max(10, binW - 72);
      y = 150 + r() * 60;
      a = (r() - 0.5) * 1.2;
    }
    const b = X.PHYS.body({
      type: 'dynamic', shape, x, y, angle: a,
      density: inst.frozen ? 1.2 : (def.density == null ? 1 : def.density),
      friction: def.friction == null ? 0.5 : def.friction,
      restitution: inst.frozen ? 0.05 : (def.restitution == null ? 0.12 : def.restitution),
      group: 'item', data: { inst, tags: def.tags || [], def, chuteT: 0 },
    });
    b.vx = (r() - 0.5) * 60; b.av = (r() - 0.5) * 2;
    FS.world.add(b);
    FS.items.push(b);
    return b;
  }
  function removeBody(b) {
    if (!b) return;
    const i = FS.items.indexOf(b);
    if (i >= 0) FS.items.splice(i, 1);
    if (FS.world) FS.world.remove(b);
  }
  function spawnAll() {
    for (const inst of F.bin) if (!bodyOf(inst)) FS.spawnQ.push(inst);
    FS.spawnT = 0;
  }
  function queueSpawn(insts) {
    for (const inst of insts || []) if (inst && !bodyOf(inst) && FS.spawnQ.indexOf(inst) < 0) FS.spawnQ.push(inst);
  }
  // Safety net at each player turn: one body per bin instance, no orphans.
  function syncBodies() {
    if (!F || !FS) return;
    const inBin = new Set(F.bin.map((i) => i.uid));
    for (const b of FS.items.slice()) {
      if (!inBin.has(b.data.inst.uid)) removeBody(b);
      else if (!!b.data.inst.frozen !== !!b.data.frozenShape) swapBody(b.data.inst);
    }
    const pending = new Set(FS.playQ.map((i) => i.uid));
    for (const inst of F.bin) if (!bodyOf(inst) && !pending.has(inst.uid) && FS.spawnQ.indexOf(inst) < 0) FS.spawnQ.push(inst);
  }
  function swapBody(inst) {
    const old = bodyOf(inst);
    const at = old ? { x: old.x, y: Math.min(old.y, CAB.h - 40), a: 0 } : null;
    if (old) removeBody(old);
    const b = spawnBody(inst, at);
    if (b) b.data.frozenShape = !!inst.frozen;
    return b;
  }
  function shakeBin() {
    const r = FS.rng;
    if (FS.world) FS.world.wakeAll();
    for (const b of FS.items) {
      b.vx += (r() - 0.5) * 700;
      b.vy -= 250 + r() * 500;
      b.av += (r() - 0.5) * 10;
    }
    fx().shake(9);
    snd('shake');
    haptic('hit');
  }
  // Grease is a slippery claw (Claw Crawl's greaseOn: grip -0.3), not slippery items.
  function setGrease(turns) {
    FS.grease = Math.max(FS.grease, turns || 1);
    if (FS.rig) FS.rig.setConfig({ grease: 1 });
  }
  function clearGrease() {
    FS.grease = 0;
    if (FS.rig) FS.rig.setConfig({ grease: 0 });
  }
  function setTilt(dir) {
    FS.tilt = dir;
    if (FS.world) FS.world.setGravity(dir * TILT_G, GRAVITY - 120);
    fx().shake(5);
  }
  function clearTilt() {
    FS.tilt = 0;
    if (FS.world) FS.world.setGravity(0, GRAVITY);
  }

  // Displayed hp/block lag the engine: COMBAT resolves a whole turn at once,
  // the HUD and hp bars only move as each event plays on its beat.
  function syncShown() {
    if (!F || !FS) return;
    FS.shown.p.hp = F.player.hp; FS.shown.p.block = F.player.block;
    F.enemies.forEach((e, i) => { FS.shown.e[i] = { hp: e.hp, block: e.block }; });
  }
  function shownOf(ev) {
    if (!ev || ev.who == null) return null;
    if (ev.who === 'p') return FS.shown.p;
    return FS.shown.e[ev.idx] || (FS.shown.e[ev.idx] = { hp: 0, block: 0 });
  }
  function bumpShown(ev) {
    const sh = shownOf(ev);
    if (!sh) return;
    if (ev.t === 'dmg') { sh.hp = Math.max(0, sh.hp - (ev.amt || 0)); sh.block = Math.max(0, sh.block - (ev.blocked || 0)); }
    else if (ev.t === 'block') sh.block += ev.amt || 0;
    else if (ev.t === 'heal') sh.hp += ev.amt || 0;
    else if (ev.t === 'die') { sh.hp = 0; sh.block = 0; }
    else if (ev.t === 'summon' && F.enemies[ev.idx]) { sh.hp = F.enemies[ev.idx].hp; sh.block = F.enemies[ev.idx].block; }
  }
  // ---- event playback (both the enemy turn and the player's plays)
  // Returned collectors from COMBAT are used; F.events is cleared so the
  // append-only log never grows without bound.
  function drainF(beat, list) {
    if (!F) return;
    const evs = (list && list.length ? list : F.events).slice();
    F.events.length = 0;
    for (const ev of evs) FS.queue.push({ ev, beat });
  }
  function enqueue(evs, beat) {
    if (!F) return;
    const list = (evs || []).slice();
    // Anything a relic pushed straight onto F.events (outside the returned
    // list) still deserves its beat.
    for (const ev of F.events) if (list.indexOf(ev) < 0) list.push(ev);
    F.events.length = 0;
    for (const ev of list) FS.queue.push({ ev, beat });
  }
  // Enemy anchor: feet on the arena floor line, scaled so an act 1 normal
  // stands about 120px tall (elites 150, bosses 185) and n of them fit across
  // ARENA.x0..x1 without their intent bubbles colliding. RENDER.enemy applies
  // def.size and the boss 1.6x itself; the scale here comes on top of those.
  const ENEMY_FIT = { normal: { h: 120, w: 150 }, elite: { h: 150, w: 190 }, boss: { h: 170, w: 250 } };
  function enemyPos(i) {
    const n = Math.max(1, F ? F.enemies.length : 1);
    const e = F && F.enemies[i];
    const def = e ? e.def : null;
    const fit = ENEMY_FIT[def && def.tier] || ENEMY_FIT.normal;
    const slotW = (ARENA.x1 - ARENA.x0) / n;
    let bw = 80, bh = 80, scale = 1;
    if (def && X.RENDER && X.RENDER.enemyBox) {
      const b = X.RENDER.enemyBox(def, 1);
      const mul = def.minion ? 0.7 : 1;
      scale = U.clamp(Math.min(fit.h * mul / Math.max(1, b.h), Math.min(fit.w * mul, slotW - 6) / Math.max(1, b.w)), 0.6, 4);
      bw = b.w * scale; bh = b.h * scale;
    }
    return { x: ARENA.x0 + slotW * (i + 0.5), y: ARENA.floor, scale, w: bw, h: bh };
  }
  // Intent bubble anchor (its tip): just above the head, clamped under the top bar.
  function intentY(p) { return Math.max(ARENA.y0 + 40, p.y - p.h - 12); }
  function anim(idx) {
    const a = FS.anim[idx] || (FS.anim[idx] = { hurt: 0, attack: 0, dead: 0 });
    return a;
  }
  // Player-side floating text: left of the turn banner, above the cabinet.
  const PLAYER_FX = { x: 110, y: 386 };
  function nextActor() {
    const list = FS.actors;
    let i = list.indexOf(FS.actor);
    FS.actor = i + 1 < list.length ? list[i + 1] : -1;
  }
  function applyEvent(ev) {
    if (!F || !ev) return;
    bumpShown(ev);
    if (ev.t === 'turn') { FS.shown.p.block = F.player.block; }
    // die/summon/intent carry only an enemy index, no who.
    const enemy = ev.who === 'e' || (ev.who !== 'p' && (ev.t === 'die' || ev.t === 'summon' || ev.t === 'intent'));
    // Consecutive numbers on the same unit fan out sideways so they can be read.
    FS.fxN = (FS.fxN || 0) + 1;
    const fan = ((FS.fxN % 3) - 1) * 46;
    // Enemy numbers pop from the chest (below the intent bubble); player
    // numbers from the player row, clear of the turn banner.
    const base = enemy ? enemyPos(ev.idx) : PLAYER_FX;
    const pos = enemy ? { x: base.x + fan, y: base.y - base.h * 0.6 } : { x: base.x + fan * 0.6, y: base.y };
    const reduced = !!fx().reduced;
    switch (ev.t) {
      case 'dmg': {
        const big = ev.amt >= 10;
        if (enemy) {
          if (ev.amt > 0) { fx().text(pos.x, pos.y, '-' + ev.amt, ev.crit ? '#ffc94d' : '#ffffff', { big: ev.crit || big }); anim(ev.idx).hurt = 1; }
          else fx().text(pos.x, pos.y, ev.blocked ? 'BLOCKED' : '0', '#b3a4d6');
          if (ev.amt > 0) { fx().burst(pos.x, pos.y + 10, '#ff5a4a', reduced ? 4 : (big ? 18 : 8)); snd(big ? 'hitBig' : 'hit', { amt: ev.amt }); }
          if (ev.amt > 0) fx().shake(Math.min(10, 1 + ev.amt * 0.35));
          if (big) FS.hitStop = HIT_STOP;
        } else {
          if (FS.enemyTurn && FS.actor >= 0) { anim(FS.actor).attack = 1; FS.killer = (F.enemies[FS.actor] && F.enemies[FS.actor].def.name) || FS.killer; }
          if (ev.amt > 0) {
            fx().text(pos.x, pos.y, '-' + ev.amt, '#ff5a4a', { big });
            fx().shake(U.clamp(3 + ev.amt * 0.7, 3, 16)); if (!reduced) fx().flash('#ff5a4a');
            if (big) FS.hitStop = HIT_STOP;
            snd('playerHurt'); haptic('hurt');
          } else {
            fx().text(pos.x, pos.y, ev.blocked ? 'BLOCKED' : 'MISS', '#2ee6d6');
            if (ev.blocked) snd('block');
          }
        }
        break;
      }
      case 'block': fx().text(pos.x, pos.y, '+' + ev.amt + ' block', '#2ee6d6'); snd('block'); break;
      case 'heal': fx().text(pos.x, pos.y, '+' + ev.amt, '#a6ff5e'); snd('heal'); break;
      case 'status': {
        const sd = tbl('STATUS')[ev.s] || { name: ev.s, icon: '', color: '#fff' };
        fx().text(pos.x, pos.y, (ev.v > 0 ? '+' : '') + ev.v + ' ' + (sd.icon || '') + sd.name, sd.color || '#fff');
        if (ev.s === 'poison') snd('poison'); else if (ev.s === 'burn') snd('burn'); else if (ev.s === 'freeze' || ev.s === 'chill') snd('freeze');
        else snd('click');
        break;
      }
      case 'die': {
        anim(ev.idx).dead = 0.001;
        fx().burst(pos.x, pos.y + 10, ev.escaped ? '#b3a4d6' : '#ff2e88', reduced ? 8 : 24);
        fx().text(pos.x, pos.y, ev.escaped ? 'ESCAPED' : 'DOWN', '#ff2e88', { big: true });
        snd('enemyDie'); fx().shake(6);
        if (!ev.escaped) { S.run.kills++; S.meta.stats.kills++; }
        if (FS.enemyTurn && FS.actor === ev.idx) nextActor();
        break;
      }
      case 'summon': { FS.anim[ev.idx] = { hurt: 0, attack: 0, dead: 0 }; fx().burst(pos.x, pos.y, '#a6ff5e', reduced ? 6 : 18); fx().text(pos.x, pos.y, 'SUMMONED', '#a6ff5e'); snd('boss'); break; }
      case 'intent': if (FS.enemyTurn && FS.actor === ev.idx) nextActor(); break;
      case 'text': {
        fx().text(pos.x, pos.y, ev.str, '#ffc94d');
        if (FS.enemyTurn && enemy && FS.actor === ev.idx && (ev.str === 'FROZEN' || ev.str === 'STUNNED')) nextActor();
        break;
      }
      case 'play': break;
      case 'grab': fx().text(PLAYER_FX.x, PLAYER_FX.y, (ev.v > 0 ? '+' : '') + ev.v + ' grab', '#2ee6d6'); snd('upgrade'); break;
      case 'refill': queueSpawn(ev.items); fx().text(270, 430, 'REFILL', '#2ee6d6'); snd('itemLand'); break;
      case 'binShake': shakeBin(); fx().text(270, 430, 'SHAKE', '#ff5a4a'); break;
      case 'binGrease': setGrease(ev.turns); fx().text(270, 430, 'GREASED', '#a6ff5e'); snd('itemSlip'); break;
      case 'binFog': FS.fog = Math.max(FS.fog, ev.turns || 1); fx().text(270, 430, 'FOG', '#b3a4d6'); break;
      case 'binJunk': queueSpawn(ev.items); fx().text(270, 430, 'JUNK', '#ff5a4a'); snd('itemLand'); break;
      case 'binSteal': { removeBody(bodyOf(ev.inst)); fx().text(270, 430, 'STOLEN: ' + itemName(itemDef(ev.inst.id), ev.inst.plus), '#ff5a4a'); snd('itemSlip'); break; }
      case 'binFreeze': { swapBody(ev.inst); fx().text(270, 430, 'FROZEN: ' + itemName(itemDef(ev.inst.id), ev.inst.plus), '#8dfff5'); snd('freeze'); break; }
      case 'binTilt': setTilt(ev.dir || 1); fx().text(270, 430, 'TILT', '#ffc94d'); snd('shake'); break;
      case 'binPurge': for (const inst of ev.insts || []) removeBody(bodyOf(inst)); fx().text(270, 430, 'PURGED', '#a6ff5e'); break;
      case 'binCopy': queueSpawn([ev.inst]); fx().text(270, 430, 'COPY', '#ffc94d'); break;
      case 'turn': if (ev.n > 1) banner('TURN ' + ev.n, 'turn', 0.9); break;
      case 'over': break;
      default: break;
    }
    FS.dirty = true;
  }

  // ---- the grab flow
  function stageToCab(x, y) { return { x: x - CAB.x, y: y - CAB.y }; }
  function inCabinet(x, y) { return x >= CAB.x - CAB.frame && x <= CAB.x + CAB.w + CAB.frame && y >= CAB.y - CAB.frame && y <= CAB.y + CAB.h + CAB.frame; }
  function canSteer() {
    return !!(F && FS && FS.rig && F.phase === 'player' && F.player.grabs > 0 && !FS.grabInFlight && !FS.enemyTurn && !FS.done &&
      (FS.rig.phase === 'idle' || FS.rig.phase === 'moving') && !FS.queue.length);
  }
  function canDrop() { return canSteer(); }
  function canEndTurn() {
    return !!(F && FS && F.phase === 'player' && !FS.grabInFlight && !FS.enemyTurn && !FS.done && FS.rig && FS.rig.phase === 'idle' && !FS.queue.length && !FS.playQ.length);
  }
  function clampBinX(x) {
    const c = clawFor();
    const lim = 22 * (c.width || 1) + 40;
    const binW = FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW;
    return U.clamp(x, lim, binW - lim);
  }
  function steer(x) {
    if (!canSteer()) return false;
    FS.rig.setTarget(clampBinX(x));
    return true;
  }
  // Commits the grab now; the physical drop waits until the carriage has
  // reached the steer target (dropping locks the carriage in place).
  // The carriage is parked on the steer target (phase flips inside rig.update,
  // so the distance check matters right after a setTarget).
  function rigArrived() {
    const r = FS && FS.rig;
    if (!r) return false;
    return r.phase === 'idle' && Math.abs(r.x - r.targetX) <= 2;
  }
  function dropClaw() {
    if (!canDrop()) return false;
    if (!X.COMBAT.useGrab(F)) return false;
    if (rigArrived()) {
      if (!FS.rig.drop()) { F.player.grabs++; F.player.grabsUsed--; return false; }
      FS.pendingDrop = false;
    } else FS.pendingDrop = true;
    FS.grabInFlight = true;
    FS.dropAt = S.t;
    FS.releaseAt = -1;
    FS.watch = false;
    FS.delivered = 0;
    FS.wasHeld = 0;
    S.run.grabs++;
    for (const b of FS.items) b.data.chuteT = 0;
    hint('...');
    snd('clawDrop');
    haptic('tap');
    FS.dirty = true;
    if (S.coachStep === 1) coachNext();
    return true;
  }
  // The cargo: what the claw closed on and is carrying (falls back to the touch test).
  function carried() {
    const rig = FS && FS.rig;
    if (!rig) return [];
    return rig.locked ? rig.locked() : rig.held();
  }
  // "holding <item>" while lifting/carrying, or the empty-claw shrug.
  function holdHint() {
    const list = carried();
    if (!list.length) { hint('empty claw...'); return; }
    const names = list.map((b) => itemName(itemDef(b.data.inst.id), b.data.inst.plus));
    // Claw Crawl scoops: a big cargo reads as "A + B + 3 more"
    hint('holding ' + (names.length > 3 ? names.slice(0, 2).join(' + ') + ' + ' + (names.length - 2) + ' more' : names.join(' + ')));
  }
  function onRigEvent(ev) {
    const rig = FS.rig;
    switch (ev) {
      case 'drop': break;
      case 'touch': snd('clawTouch'); break;
      case 'close': {
        snd('clawClose');
        // sparks where the prongs meet
        const reach = rig.geo ? rig.geo.reach * 0.85 : 40;
        fx().burst(CAB.x + rig.x, CAB.y + rig.y + reach, '#fff6c0', fx().reduced ? 4 : 10, { speed: 130, size: 2.5, life: 0.3, gravity: 300 });
        break;
      }
      case 'lift': { snd('clawLift'); FS.wasHeld = carried().length; holdHint(); break; }
      case 'carry': snd('clawMove'); holdHint(); break;
      case 'slip': {
        // a cargo item fell out of the prongs on the way up or across
        snd('itemSlip');
        fx().text(CAB.x + rig.x, CAB.y + rig.y + 30, 'SLIP', '#b3a4d6', { size: 16 });
        fx().shake(2);
        FS.slips++;
        hint(carried().length ? 'slipped one...' : 'slipped...');
        break;
      }
      case 'shed': {
        // legacy event (the Claw Crawl rig never emits it): extras left in the pile
        snd('clawTouch');
        fx().text(CAB.x + rig.x, CAB.y + rig.y + 30, 'FULL', '#8e98a8', { size: 14, life: 0.7 });
        break;
      }
      case 'release': snd('clawRelease'); FS.watch = true; FS.releaseAt = S.t; break;
      case 'home': break;
      default: break;
    }
  }
  function deliver(b) {
    const inst = b.data.inst;
    const pos = { x: CAB.x + b.x, y: CAB.y + b.y };
    removeBody(b);
    FS.playQ.push(inst);
    FS.delivered++;
    S.run.delivered++;
    fx().burst(pos.x, pos.y, '#ffc94d', fx().reduced ? 6 : 14);
    fx().trail(pos.x, pos.y, '#ffc94d');
    FS.chuteFlash = 0.35;
    const chuteMid = CAB.x + (FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW) + CAB.chuteW * 0.5;
    // the chip rises just left of the divider so it never sits on the PRIZE lettering
    fx().text(chuteMid - 66, CAB.y + CAB.h - 40, '+PLAYED', '#ffc94d', { size: 15, dy: -80, life: 0.9 });
    snd('chute');
    haptic('tap');
    // Doubles are the norm with the basket claw: a triple is the jackpot.
    if (FS.delivered === 2) { fx().text(chuteMid - 66, CAB.y + CAB.h - 70, 'DOUBLE', '#2ee6d6', { size: 16, dy: -60, life: 0.8 }); }
    if (FS.delivered === 3) {
      banner('JACKPOT', 'jackpot', 1.4);
      snd('jackpot'); haptic('jackpot');
      fx().burst(270, 600, '#ffc94d', fx().reduced ? 12 : 40); if (!fx().reduced) fx().flash('#ffc94d');
      S.run.jackpots++; S.meta.stats.jackpots++;
    }
    if (S.coachStep === 2) coachNext();
  }
  function playInst(inst) {
    if (!F || F.phase !== 'player') return;
    const def = itemDef(inst.id);
    const evs = X.COMBAT.play(F, inst, F.target);
    S.run.played++; S.meta.stats.played++;
    showTrayChip(def, inst);
    enqueue(evs, PLAY_BEAT);
    fx().text(CAB.x + CAB.w - CAB.chuteW - 70, CAB.y + CAB.h * 0.3, itemName(def, inst.plus), '#ffc94d');
  }
  function showTrayChip(def, inst) {
    const tray = $('tray');
    if (!tray) return;
    const chip = h('div', 'chip');
    chip.appendChild(itemCanvas(def, inst.plus, 46));
    const tx = h('div', 'col');
    tx.appendChild(h('div', 'n', itemName(def, inst.plus)));
    tx.appendChild(h('div', 't', inst.frozen ? 'Encased in ice. Thawed.' : itemText(def, inst.plus)));
    chip.appendChild(tx);
    tray.appendChild(chip);
    if (tray.children && tray.children.length > 2) { const first = tray.children[0]; if (first) { if (first.remove) first.remove(); else tray.removeChild(first); } }
    setTimeout(() => { chip.classList.add('fade'); }, 2600);
    setTimeout(() => { if (chip.remove) chip.remove(); if (tray.removeChild) try { tray.removeChild(chip); } catch (e) { /* gone */ } }, 3200);
  }
  function grabFinished() {
    FS.grabInFlight = false;
    FS.watch = false;
    const evs = X.COMBAT.grabDone ? X.COMBAT.grabDone(F, FS.delivered) : [];
    enqueue(evs, PLAY_BEAT);
    afterAction();
  }
  // After a grab (or any player-side queue) settles: win/lose, hints, auto end.
  function afterAction() {
    if (!F || FS.done) return;
    const over = F.phase === 'over' ? F.result : X.COMBAT.isOver(F);
    if (over) { endFight(over); return; }
    if (F.player.grabs > 0) hint(FS.delivered ? 'nice. steer and release' : 'steer and release');
    else { hint('out of grabs'); FS.autoEndT = AUTO_END; banner('TURN OVER', 'turn', 0.7); }
    FS.dirty = true;
  }
  // Force the rig home. Called by the watchdog; the world is left intact.
  function resetRig(reason) {
    if (!FS || !FS.rig) return;
    try { FS.rig.open(); } catch (e) { /* ignore */ }
    let ok = false;
    try {
      const held = FS.rig.held();
      for (const b of held) { b.vx = 0; b.vy = 0; }
      FS.rig.destroy();
      buildRig();
      ok = true;
    } catch (e) { ok = false; }
    if (!ok) { buildWorld(); FS.items = []; FS.spawnQ = []; spawnAll(); }
    FS.watch = false;
    FS.pendingDrop = false;
    if (FS.grabInFlight) grabFinished();
    // grabFinished can end the fight (win or loss), which clears FS.
    if (FS) FS.dirty = true;
    if (reason) toast(reason);
  }
  function endTurn() {
    if (!canEndTurn()) return false;
    FS.enemyTurn = true;
    FS.autoEndT = 0;
    FS.steering = false;
    hint('');
    FS.turnsTaken++;
    S.run.turns++;
    banner('ENEMY TURN', 'enemy', 1.0);
    snd('turn');
    clearTilt();
    if (FS.grease > 0) { FS.grease--; if (!FS.grease) clearGrease(); }
    if (FS.fog > 0) FS.fog--;
    FS.actors = F.enemies.map((e, i) => (e.alive ? i : -1)).filter((i) => i >= 0);
    FS.actor = FS.actors.length ? FS.actors[0] : -1;
    const evs = X.COMBAT.endTurn(F);
    enqueue(evs, BEAT);
    FS.onDrain = finishEnemyTurn;
    FS.dirty = true;
    if (!FS.queue.length) finishEnemyTurn();
    return true;
  }
  function finishEnemyTurn() {
    if (!F || !FS) return;
    FS.enemyTurn = false;
    FS.actor = -1;
    const over = F.phase === 'over' ? F.result : X.COMBAT.isOver(F);
    if (over) { endFight(over); return; }
    syncBodies();
    banner('YOUR TURN', 'turn', 0.9);
    afterAction();
    save();
  }
  function endFight(result) {
    if (!F || !FS || FS.done) return;
    FS.done = true;
    FS.watch = false;
    const run = S.run;
    run.hp = F.player.hp;
    if (F.gain) {
      if (F.gain.maxhp) { run.maxHp = Math.max(1, run.maxHp + F.gain.maxhp); }
      if (F.gain.gold) addGold(F.gain.gold);
      if (F.gain.ink) addInk(F.gain.ink);
    }
    run.hp = U.clamp(run.hp, 0, run.maxHp);
    run.history.push({ act: run.act, enemies: F.enemies.map((e) => e.id), result, turns: F.turn });
    const tier = FS.tier;
    const then = FS.then;
    hint('');
    if (result === 'lose') {
      run.killer = FS.killer || 'the Clawspire';
      snd('lose');
      showGameOver();
      return;
    }
    snd('win');
    banner('VICTORY', 'jackpot', 1.2);
    const rng = rngFor('reward');
    let gold = rng.int(10, 25) + 4 * (run.act - 1);
    if (tier === 'elite') gold = Math.round(gold * 1.6);
    if (tier === 'boss') gold = Math.round(gold * 2.5);
    const econ = ECON();
    const ink = tier === 'elite' ? (econ.eliteInk || 1) : (tier === 'normal' && rng() < (econ.fightInkChance || 0) ? 1 : 0);
    const reward = { items: rollItems(rng, 3), gold, ink, tier, then };
    showReward(reward);
  }

  // ---- fight update (fixed dt)
  function updateFight(dt) {
    if (!F || !FS) return;
    const rig = FS.rig, Wd = FS.world;
    // Shower spawn.
    if (FS.spawnQ.length) {
      FS.spawnT -= dt;
      while (FS.spawnQ.length && FS.spawnT <= 0) { spawnBody(FS.spawnQ.shift()); FS.spawnT += SPAWN_GAP; }
    }
    // Keyboard steering.
    if (FS.keyDir && canSteer()) rig.setTarget(clampBinX(rig.targetX + FS.keyDir * 260 * dt));
    // A committed drop fires once the carriage has arrived.
    if (FS.pendingDrop && rigArrived()) { FS.pendingDrop = false; if (!rig.drop()) { FS.grabInFlight = false; afterAction(); if (!FS) return; } }
    // Hit-stop: a big hit freezes the physics for a frame or two, but never
    // while the claw is carrying (the lock would read the pause as a jolt).
    FS.frameN++;
    if (FS.chuteFlash > 0) FS.chuteFlash = Math.max(0, FS.chuteFlash - dt);
    let stop = false;
    if (FS.hitStop > 0) {
      const carrying = rig && (rig.phase === 'lifting' || rig.phase === 'carrying');
      if (carrying || fx().reduced) FS.hitStop = 0;
      else { FS.hitStop -= dt; stop = true; }
    }
    // Physics.
    if (rig && Wd && !stop) {
      const evs = rig.update(dt);
      Wd.step(dt);
      for (const ev of evs) onRigEvent(ev);
      if (!FS) return;
      // Landing squash (by impact) and a trail behind carried items.
      const reduced = !!fx().reduced;
      const carrying = rig.phase === 'lifting' || rig.phase === 'carrying';
      const held = carrying && !reduced && (FS.frameN & 1) ? carried() : null;
      for (const b of FS.items) {
        const d = b.data;
        const pv = d.pvy == null ? b.vy : d.pvy;
        if (pv > 260 && b.vy < pv * 0.35) {
          const imp = U.clamp((pv - 200) / 900, 0.15, 1);
          d.sq = Math.max(d.sq || 0, imp);
          if (S.t - FS.landSnd > 0.07 && imp > 0.3) { FS.landSnd = S.t; snd('itemLand', { mass: b.m, vel: pv }); }
        }
        d.pvy = b.vy;
        if (d.sq > 0) d.sq = Math.max(0, d.sq - dt * 5);
      }
      if (held) for (const b of held) fx().trail(CAB.x + b.x, CAB.y + b.y, '#2ee6d6', { vx: b.vx, vy: b.vy + 40, life: 0.3, w: 4 });
      // Deliveries: bodies in the chute after a release. The chute has no
      // floor, so anything that fell through it onto the hidden tray outside
      // a grab (a shake or tilt tossed it in) is played once it is the
      // player's turn again.
      const playerIdle = F.phase === 'player' && !FS.enemyTurn && !FS.queue.length && !FS.done;
      for (const b of FS.items.slice()) {
        if (FS.watch && FS.cabinet.inChute(b)) { b.data.chuteT += dt; if (b.data.chuteT >= DELIVER_HOLD) deliver(b); }
        else if (!FS.watch && playerIdle && b.y > CAB.h + 10 && FS.cabinet.inChute(b)) deliver(b);
        else b.data.chuteT = 0;
      }
    }
    // Played items resolve on a short beat so the numbers can be read.
    if (FS.playQ.length && !FS.queue.length) {
      FS.playT -= dt;
      if (FS.playT <= 0) { playInst(FS.playQ.shift()); FS.playT = PLAY_BEAT; }
    }
    // Event playback.
    if (FS.queue.length) {
      FS.beatT -= dt;
      while (FS.queue.length && FS.beatT <= 0) {
        const q = FS.queue.shift();
        applyEvent(q.ev);
        FS.beatT = q.beat;
      }
      if (!FS.queue.length && !FS.playQ.length) { syncShown(); if (FS.onDrain) { const fn = FS.onDrain; FS.onDrain = null; fn(); } }
      if (!FS) return;
    }
    // Grab completion: rig home, nothing held, nothing pending.
    if (FS.grabInFlight && !FS.pendingDrop && rig && rig.phase === 'idle' && !FS.spawnQ.length && !FS.playQ.length && !FS.queue.length &&
      (FS.releaseAt < 0 || S.t - FS.releaseAt >= DELIVER_HOLD + 0.05) && rig.held().length === 0) {
      grabFinished();
      if (!FS) return;
    }
    // Watchdog: nothing may hold the turn hostage.
    if (FS.grabInFlight && S.t - FS.dropAt > WATCHDOG) { resetRig('The claw jammed. Reset.'); if (!FS) return; }
    // Auto end turn.
    if (FS.autoEndT > 0) {
      FS.autoEndT -= dt;
      if (FS.autoEndT <= 0) { FS.autoEndT = 0; if (!endTurn() && FS && F.phase === 'player' && F.player.grabs <= 0) FS.autoEndT = 0.3; }
      if (!FS) return;
    }
    // Animation timers.
    for (const k in FS.anim) {
      const a = FS.anim[k];
      if (a.hurt > 0) a.hurt = Math.max(0, a.hurt - dt * 4);
      if (a.attack > 0) a.attack = Math.max(0, a.attack - dt * 2.5);
      if (a.dead > 0 && a.dead < 1) a.dead = Math.min(1, a.dead + dt * 1.6);
    }
    // Won fights can end outside a grab too (poison ticks at turn start).
    if (!FS.done && !FS.grabInFlight && !FS.queue.length && !FS.playQ.length && !FS.enemyTurn) {
      const over = F.phase === 'over' ? F.result : null;
      if (over) endFight(over);
    }
  }

  // ---------------------------------------------------------------- tutorial coach marks
  function startCoach() {
    S.coachStep = 0;
    showCoach();
  }
  function showCoach() {
    const el = $('coach'), tx = $('coachTxt'), b = $('coachBtn');
    if (S.coachStep < 0 || S.coachStep >= TUTORIAL.length) { if (el) el.classList.remove('show'); return; }
    if (tx) tx.innerHTML = TUTORIAL[S.coachStep];
    if (b) { b.textContent = S.coachStep === TUTORIAL.length - 1 ? 'Got it' : 'Next'; b.onclick = () => { snd('click'); coachNext(); }; }
    if (el) el.classList.add('show');
  }
  function coachNext() {
    S.coachStep++;
    if (S.coachStep >= TUTORIAL.length) { S.coachStep = -1; S.meta.tutorialDone = true; saveMeta(); }
    showCoach();
  }

  // ---------------------------------------------------------------- reward / treasure / act flow
  function showReward(rw) {
    S.sd = { reward: rw };
    if (!rw.taken) {
      rw.taken = true;
      if (rw.gold) addGold(rw.gold);
      if (rw.ink) addInk(rw.ink);
    }
    setScreen('reward');
    const b = $('rewardBody');
    clear(b);
    b.appendChild(h('h1', null, rw.tier === 'boss' ? 'Boss down' : 'Victory'));
    const line = h('div', 'row');
    line.appendChild(h('span', 'tag gold', `+${rw.gold} gold`));
    if (rw.ink) line.appendChild(h('span', 'tag cyan', `+${rw.ink} ink`));
    b.appendChild(line);
    b.appendChild(h('div', 'sub', 'Pick one item for your bin.'));
    const cards = h('div', 'cards');
    rw.items.forEach((id) => {
      const def = itemDef(id);
      const card = itemCard(def, false, { onPick: () => { addItem(id); snd('buy'); toast(`${def.name} added to the bin.`); afterReward(rw); } });
      cards.appendChild(card);
    });
    b.appendChild(cards);
    b.appendChild(btn('Skip', () => afterReward(rw), 'ghost'));
    save();
  }
  function itemCard(def, plus, o) {
    o = o || {};
    const card = h('div', 'card' + (o.cls ? ' ' + o.cls : ''));
    card.appendChild(h('div', 'rar ' + (def.rarity || 'c'), RARITY_NAME[def.rarity] || ''));
    if (o.count > 1) card.appendChild(h('div', 'cnt', 'x' + o.count));
    card.appendChild(itemCanvas(def, plus, 84));
    card.appendChild(h('div', 'name', itemName(def, plus)));
    card.appendChild(h('div', 'text', itemText(def, plus)));
    if (o.price != null) card.appendChild(h('div', 'price', o.sold ? 'SOLD' : o.price + ' gold'));
    if (plus) card.appendChild(h('div', 'plus', 'PLUS'));
    const fn = () => { if (o.sold) return; if (o.onPick) o.onPick(); };
    card.onclick = (ev) => { fn(); };
    S.ui.buttons.push({ el: card, fn, label: itemName(def, plus), disabled: !!o.sold || !!o.disabled });
    return card;
  }
  function afterReward(rw) {
    S.sd = null;
    if (rw.tier === 'boss') { nextAct(); return; }
    if (rw.then && rw.then.tower) { towerPrize(rw.then.tower); return; }
    if (rw.then) { const then = rw.then; resolveFx(then.fx || [], then.i || 0, () => toMap()); return; }
    toMap();
  }
  // A tower taken: the bonus rolled at generate is applied here, then the
  // treasure screen offers a relic on top (the usual treasure flow).
  function towerPrize(tw) {
    const b = (tw && tw.bonus) || { k: 'ink', n: 2 };
    let line = '';
    switch (b.k) {
      case 'gold': { const n = b.n || 60; addGold(n); snd('coin'); line = `+${n} gold`; break; }
      case 'brush': {
        const id = b.id || (X.MAP && X.MAP.brushIds ? rngFor('tower').pick(X.MAP.brushIds()) : 'splash');
        addBrush(id);
        line = `a brush (${(tbl('BRUSHES')[id] || { name: id }).name})`;
        break;
      }
      case 'claw': {
        const def = tbl('CLAW_UPGRADES')[b.u];
        if (def && applyClawUpgrade(b.u)) line = `a claw upgrade (${def.name})`;
        else { addGold(60); snd('coin'); line = '+60 gold (the claw part did not fit)'; }
        break;
      }
      default: { const n = b.n || 2; addInk(n); line = `+${n} ink`; break; }
    }
    const id = rollRelic(rngFor('tower'), ['u', 'r']);
    showTreasure({ relic: id, gold: b.k === 'gold' ? (b.n || 60) : 0, title: 'Tower taken', sub: `The keeper leaves ${line} and a relic.` });
  }
  function nextAct() {
    const run = S.run;
    if (run.act >= 2) { const u = checkUnlocks('act2'); if (u.length) toast('Unlocked: ' + u.map((id) => (charDef(id) || {}).name || id).join(', '), 3); }
    if (run.act >= 3) { showWin(); return; }
    run.act++;
    S.meta.stats.bestAct = Math.max(S.meta.stats.bestAct, run.act);
    const unl = checkUnlocks('act2');
    saveMeta();
    healRun(run.maxHp * 0.3);
    addInk(START_INK);
    newMap(run);
    const id = rollRelic(rngFor('bossrelic'), ['boss', 'r']);
    const td = { relic: id, gold: 0, title: `Act ${run.act}: ${actDef(run.act).name}`, sub: `Healed 30%. +${START_INK} ink. The Prize Master left you something.` + (unl.length ? ` Unlocked: ${unl.map((c) => (charDef(c) || {}).name || c).join(', ')}.` : '') };
    // Claw upgrades come from bosses (and tower bonuses) only: the spare
    // parts screen first, then the relic. Everything maxed skips straight on.
    const pick = rngFor('spareparts').shuffle(openClawUpgrades()).slice(0, 3);
    if (pick.length) showSpareParts({ pick, then: td });
    else showTreasure(td);
  }
  // Claw upgrades not yet maxed (a relic that supplies the part counts).
  function openClawUpgrades() {
    return Object.keys(tbl('CLAW_UPGRADES')).filter((id) => { const d = tbl('CLAW_UPGRADES')[id]; return !d.max || upgradeCount(id) < d.max; });
  }
  // A row of claw upgrade cards; onPick(id, def) after a successful apply.
  function clawCards(ids, onPick) {
    const cards = h('div', 'cards');
    for (const id of ids) {
      const def = tbl('CLAW_UPGRADES')[id];
      if (!def) continue;
      const card = h('div', 'card');
      card.appendChild(h('div', 'big', def.icon || ''));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      const fn = () => { if (applyClawUpgrade(id)) { snd('upgrade'); toast(`Claw upgraded: ${def.name}.`); onPick(id, def); } else toast('Cannot apply that.'); };
      card.onclick = fn;
      S.ui.buttons.push({ el: card, fn, label: def.name });
      cards.appendChild(card);
    }
    return cards;
  }
  // After a boss (acts 1 and 2): pick 1 of 3 claw upgrades, then sp.then
  // (the act's treasure screen). The roll is saved, so a reload keeps it.
  function showSpareParts(sp) {
    S.sd = { parts: sp };
    setScreen('parts');
    const b = $('partsBody');
    clear(b);
    b.appendChild(h('h1', null, "The Prize Master's spare parts"));
    b.appendChild(h('div', 'sub', 'The boss dropped a box of claw parts. Bolt one on.'));
    const pick = (sp.pick || []).filter((id) => openClawUpgrades().indexOf(id) >= 0);
    const next = () => { S.sd = null; if (sp.then) showTreasure(sp.then); else toMap(); };
    if (!pick.length) {
      b.appendChild(h('div', 'sub', 'The claw is as good as it gets.'));
      b.appendChild(btn('Continue', next, 'pri'));
    } else b.appendChild(clawCards(pick, next));
    save();
  }
  function showTreasure(td) {
    S.sd = { treasure: td };
    setScreen('treasure');
    const b = $('treasureBody');
    clear(b);
    b.appendChild(h('h1', null, td.title || 'Treasure'));
    if (td.sub) b.appendChild(h('div', 'sub', td.sub));
    if (td.gold) b.appendChild(h('span', 'tag gold', `+${td.gold} gold`));
    if (td.relic) {
      const def = relicDef(td.relic);
      const card = h('div', 'card');
      card.appendChild(relicCanvas(def, 84));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      b.appendChild(card);
      b.appendChild(btn('Take it', () => { gainRelic(td.relic); snd('upgrade'); S.sd = null; toMap(); }, 'gold'));
    } else {
      b.appendChild(h('div', 'sub', 'The chest is empty. Someone got here first.'));
      b.appendChild(btn('Continue', () => { S.sd = null; toMap(); }, 'pri'));
    }
    save();
  }

  // ---------------------------------------------------------------- shop
  function rollShop(tile) {
    const run = S.run;
    const rng = U.rng(U.hashStr(run.seed + ':shop:' + run.act + ':' + (tile ? tile.q + ',' + tile.r : run.floor)));
    const items = rollItems(rng, 5).map((id) => ({ id, price: Math.max(20, Math.round((itemDef(id).cost || 60) * (0.9 + rng() * 0.3))), sold: false }));
    const relicId = rollRelic(rng, ['c', 'u', 'r']);
    const relic = relicId ? { id: relicId, price: RELIC_PRICE[relicDef(relicId).rarity] || 160, sold: false } : null;
    // No claw upgrades for sale: those come from bosses and towers only.
    return { items, relic, removeUsed: false };
  }
  function upgradeCount(id) {
    const run = S.run;
    let n = (run.claw.ups && run.claw.ups[id]) || 0;
    // A relic that already supplies the part makes the upgrade pointless.
    if ((id === 'prongs' || id === 'rubber' || id === 'magnet') && X.COMBAT && X.COMBAT.relicMods) {
      try { const m = X.COMBAT.relicMods(run.relics || []); if (m && m[id]) n = Math.max(n, 1); } catch (e) { /* optional */ }
    }
    return n;
  }
  function applyClawUpgrade(id) {
    const run = S.run;
    const def = tbl('CLAW_UPGRADES')[id];
    if (!def) return false;
    run.claw.ups = run.claw.ups || {};
    if (def.max && upgradeCount(id) >= def.max) return false;
    const before = upgradeCount(id);
    let ok = true;
    try { ok = def.apply(run.claw); } catch (e) { return false; }
    if (ok === false) return false;
    // data.js counts applications itself; only count here when it did not.
    if (upgradeCount(id) === before) run.claw.ups[id] = before + 1;
    return true;
  }
  function showShop(shop) {
    S.sd = { shop };
    setScreen('shop');
    const b = $('shopBody');
    clear(b);
    const run = S.run;
    b.appendChild(h('h1', null, 'Shop'));
    const top = h('div', 'row');
    top.appendChild(h('span', 'tag gold big', `${run.gold} gold`));
    top.appendChild(h('span', 'sub', 'Tap to buy. Sell from your bin for a third of the price.'));
    b.appendChild(top);
    b.appendChild(h('h3', null, 'Items'));
    const cards = h('div', 'cards');
    shop.items.forEach((it) => {
      const def = itemDef(it.id);
      cards.appendChild(itemCard(def, false, { price: it.price, sold: it.sold, onPick: () => {
        if (run.gold < it.price) { toast('Not enough gold.'); return; }
        addGold(-it.price); it.sold = true; addItem(it.id); snd('buy'); toast(`Bought ${def.name}.`); showShop(shop);
      } }));
    });
    b.appendChild(cards);
    const sec = h('div', 'cards two');
    if (shop.relic) {
      const def = relicDef(shop.relic.id);
      const card = h('div', 'card' + (shop.relic.sold ? ' sold' : ''));
      card.appendChild(relicCanvas(def, 64));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      card.appendChild(h('div', 'price', shop.relic.sold ? 'SOLD' : shop.relic.price + ' gold'));
      const fn = () => {
        if (shop.relic.sold) return;
        if (run.gold < shop.relic.price) { toast('Not enough gold.'); return; }
        addGold(-shop.relic.price); shop.relic.sold = true; gainRelic(shop.relic.id); snd('buy'); toast(`Bought ${def.name}.`); showShop(shop);
      };
      card.onclick = fn;
      S.ui.buttons.push({ el: card, fn, label: def.name, disabled: shop.relic.sold });
      sec.appendChild(card);
    }
    b.appendChild(sec);
    const row = h('div', 'row');
    const rm = btn(shop.removeUsed ? 'Removed' : `Remove an item (${REMOVE_PRICE})`, () => {
      if (shop.removeUsed) return;
      if (run.gold < REMOVE_PRICE) { toast('Not enough gold.'); return; }
      if (run.bin.length <= BIN_FLOOR) { toast('The bin is as light as it gets.'); return; }
      openBin({ mode: 'remove', title: 'Remove which item?', back: () => showShop(shop), onPick: (inst) => {
        addGold(-REMOVE_PRICE); shop.removeUsed = true; removeInst(inst); snd('buy'); toast('Removed.'); showShop(shop);
      } });
    }, 'sm');
    if (shop.removeUsed) rm.disabled = true;
    row.appendChild(rm);
    row.appendChild(btn('Sell an item', () => run.bin.length <= BIN_FLOOR ? toast('The bin is as light as it gets.') : openBin({ mode: 'sell', title: 'Sell which item?', back: () => showShop(shop), onPick: (inst) => {
      const p = Math.max(5, Math.round((itemDef(inst.id).cost || 30) / 3));
      removeInst(inst); addGold(p); snd('coin'); toast(`Sold for ${p} gold.`); showShop(shop);
    } }), 'sm'));
    b.appendChild(row);
    b.appendChild(btn('Leave', () => toMap(), 'pri'));
    save();
  }
  function removeInst(inst) {
    const bin = S.run.bin;
    let i = bin.indexOf(inst);
    if (i < 0) i = bin.findIndex((x) => x.uid === inst.uid);
    if (i >= 0) bin.splice(i, 1);
  }

  // ---------------------------------------------------------------- bin viewer / picker
  function openBin(o) {
    o = o || { mode: 'view' };
    setScreen('bin');
    const b = $('binBody');
    clear(b);
    const run = S.run;
    b.appendChild(h('h1', null, o.title || 'Your bin'));
    b.appendChild(h('div', 'sub', o.mode === 'view' ? `${run.bin.length} items. Tap one for its text.` : 'Tap an item.'));
    const groups = {};
    const order = [];
    for (const inst of run.bin) {
      const k = inst.id + (inst.plus ? '+' : '');
      if (!groups[k]) { groups[k] = { inst, count: 0, insts: [] }; order.push(k); }
      groups[k].count++; groups[k].insts.push(inst);
    }
    const cards = h('div', 'cards');
    for (const k of order) {
      const g = groups[k];
      const def = itemDef(g.inst.id);
      const eligible = o.mode !== 'upgrade' || !g.inst.plus;
      cards.appendChild(itemCard(def, g.inst.plus, { count: g.count, cls: eligible ? '' : 'sold', disabled: !eligible, onPick: () => {
        if (o.mode === 'view') { popover(`<b>${itemName(def, g.inst.plus)}</b><br>${itemText(def, g.inst.plus)}` + (def.plus ? `<br><i>Plus: ${itemText(def, true)}</i>` : ''), 270, 330); return; }
        if (!eligible) { toast('Already upgraded.'); return; }
        if (o.onPick) o.onPick(g.insts[0]);
      } }));
    }
    if (!order.length) cards.appendChild(h('div', 'sub', 'Empty. That is a problem.'));
    b.appendChild(cards);
    b.appendChild(btn(o.mode === 'view' ? 'Back' : 'Cancel', () => { if (o.back) o.back(); else toMap(); }, 'ghost'));
  }

  // ---------------------------------------------------------------- events
  function showEvent(ed) {
    const def = tbl('EVENTS')[ed.id];
    if (!def) { toMap(); return; }
    S.sd = { event: ed };
    setScreen('event');
    const b = $('eventBody');
    clear(b);
    const run = S.run;
    b.appendChild(h('h1', null, def.title || 'Event'));
    const evPic = typeof ART !== 'undefined' && ART && ART.get ? ART.get('event', ed.id) : null;
    if (evPic) {
      // an illustration dropped at art/events/<id>.png replaces the creature
      const pic = document.createElement('img');
      pic.src = evPic.src; pic.alt = ''; pic.className = 'eventArt eventPic';
      b.appendChild(pic);
    } else if (X.RENDER && X.RENDER.enemy && def.art && tbl('ENEMIES')[def.art]) {
      const art = canvasEl(110, (ctx, p) => X.RENDER.enemy(ctx, tbl('ENEMIES')[def.art], p / 2, p * 0.75, 0.8, S.t, {}));
      art.className = 'eventArt';
      b.appendChild(art);
    }
    b.appendChild(h('div', 'sub', def.text || ''));
    const list = h('div', 'list');
    (def.choices || []).forEach((ch) => {
      let ok = true;
      if (typeof ch.cond === 'function') { try { ok = !!ch.cond(run); } catch (e) { ok = false; } }
      const bt = btn('', () => { if (!ok) { toast('Not possible right now.'); return; } S.sd = null; resolveFx(ch.fx || [], 0, () => toMap()); }, 'choice' + (ok ? '' : ' off'));
      bt.textContent = '';
      bt.appendChild(h('div', 'c1', ch.txt));
      if (ch.sub) bt.appendChild(h('div', 'c2', ch.sub));
      list.appendChild(bt);
    });
    if (!(def.choices || []).length) list.appendChild(btn('Leave', () => toMap(), 'pri'));
    b.appendChild(list);
    save();
  }
  // Resolve a choice's fx list in order; pickers and fights pause the list
  // and continue from the next index.
  function resolveFx(list, i, done) {
    const run = S.run;
    for (; i < list.length; i++) {
      const f = list[i];
      if (!f) continue;
      switch (f.k) {
        case 'hp': {
          if (f.v < 0) { run.hp = Math.max(1, run.hp + f.v); toast(`${f.v} hp`); }
          else { healRun(f.v); toast(`+${f.v} hp`); }
          break;
        }
        case 'maxhp': run.maxHp = Math.max(1, run.maxHp + f.v); run.hp = U.clamp(run.hp + Math.max(0, f.v), 1, run.maxHp); toast(`${f.v > 0 ? '+' : ''}${f.v} max hp`); break;
        case 'gold': addGold(f.v); toast(`${f.v > 0 ? '+' : ''}${f.v} gold`); snd('coin'); break;
        case 'ink': addInk(f.v); toast(`${f.v > 0 ? '+' : ''}${f.v} ink`); break;
        case 'brush': addBrush(f.id || (X.MAP && X.MAP.brushIds ? rngFor('brush').pick(X.MAP.brushIds()) : 'splash')); toast('Got a brush.'); break;
        case 'item': {
          let id = f.id;
          if (!id || id === 'random' || id === 'rare') {
            const rng = rngFor('eventitem');
            let pool = [];
            if (D().pool) { try { pool = D().pool(id === 'rare' ? 'r' : D().rollRarity ? D().rollRarity(rng, run.act) : 'c', run.char) || []; } catch (e) { pool = []; } }
            if (!pool.length) pool = Object.keys(tbl('ITEMS')).filter((x) => itemDef(x).rarity !== 'junk');
            id = pool.length ? rng.pick(pool) : null;
          }
          if (id) { addItem(id, !!f.plus); toast(`${itemDef(id).name} added.`); snd('buy'); }
          break;
        }
        case 'relic': {
          let id = f.id;
          if (!id || id === 'random') id = rollRelic(rngFor('eventrelic'), ['c', 'u', 'r']);
          if (id && run.relics.indexOf(id) >= 0) { addGold(40); toast('You already have one. Pawned it for 40 gold.'); snd('coin'); break; }
          if (id) { gainRelic(id); toast(`Relic: ${relicDef(id).name}.`); snd('upgrade'); }
          break;
        }
        case 'junk': for (let n = 0; n < (f.n || 1); n++) addItem(f.id || 'rock'); toast('Junk added to the bin.'); break;
        // No event grants this any more (bosses and towers do); kept for the fx contract.
        case 'claw': if (f.u && applyClawUpgrade(f.u)) { toast(`Claw upgraded: ${(tbl('CLAW_UPGRADES')[f.u] || {}).name || f.u}.`); snd('upgrade'); } break;
        case 'remove': {
          const rest = i + 1;
          if (!run.bin.length) break;
          openBin({ mode: 'remove', title: 'Remove which item?', back: () => resolveFx(list, rest, done), onPick: (inst) => { removeInst(inst); toast('Removed.'); resolveFx(list, rest, done); } });
          return;
        }
        case 'upgrade': {
          const rest = i + 1;
          if (!run.bin.some((x) => !x.plus)) break;
          openBin({ mode: 'upgrade', title: 'Upgrade which item?', back: () => resolveFx(list, rest, done), onPick: (inst) => { inst.plus = true; snd('upgrade'); toast(`${itemName(itemDef(inst.id), true)}!`); resolveFx(list, rest, done); } });
          return;
        }
        case 'fight': {
          const rest = i + 1;
          startFight(f.enc && f.enc.length ? f.enc : encounterFor(f.elite ? 'elite' : 'normal'), f.elite ? 'elite' : 'normal', { then: { fx: list, i: rest } });
          return;
        }
        default: break;
      }
    }
    if (run && run.hp <= 0) { run.killer = 'a bad decision'; showGameOver(); return; }
    if (done) done();
  }

  // ---------------------------------------------------------------- rest / forge
  function showRest() {
    S.sd = { rest: true };
    setScreen('rest');
    const b = $('restBody');
    clear(b);
    const run = S.run;
    b.appendChild(h('h1', null, 'Rest stop'));
    b.appendChild(h('div', 'sub', 'A quiet corner between the machines. Pick one.'));
    const list = h('div', 'list');
    const heal = Math.round(run.maxHp * 0.3);
    const c1 = btn('', () => { healRun(heal); snd('heal'); toast(`+${heal} hp`); toMap(); }, 'choice go');
    c1.textContent = ''; c1.appendChild(h('div', 'c1', 'Rest')); c1.appendChild(h('div', 'c2', `Heal ${heal} hp (30%). Now ${run.hp}/${run.maxHp}.`));
    list.appendChild(c1);
    const c3 = btn('', () => openBin({ mode: 'upgrade', title: 'Upgrade which item?', back: () => showRest(), onPick: (inst) => { inst.plus = true; snd('upgrade'); toast(`${itemName(itemDef(inst.id), true)}!`); toMap(); } }), 'choice');
    c3.textContent = ''; c3.appendChild(h('div', 'c1', 'Sharpen an item')); c3.appendChild(h('div', 'c2', 'Upgrade one item to its plus version.'));
    list.appendChild(c3);
    b.appendChild(list);
    save();
  }
  function showForge() {
    S.sd = { forge: true };
    setScreen('forge');
    const b = $('forgeBody');
    clear(b);
    b.appendChild(h('h1', null, 'The forge'));
    b.appendChild(h('div', 'sub', 'A furnace that eats coins and spits out better junk. Upgrade one item.'));
    const run = S.run;
    const groups = {};
    const order = [];
    for (const inst of run.bin) {
      if (inst.plus) continue;
      if (!groups[inst.id]) { groups[inst.id] = { inst, count: 0 }; order.push(inst.id); }
      groups[inst.id].count++;
    }
    const cards = h('div', 'cards');
    for (const id of order) {
      const def = itemDef(id);
      cards.appendChild(itemCard(def, false, { count: groups[id].count, onPick: () => {
        const inst = run.bin.find((x) => x.id === id && !x.plus);
        if (!inst) return;
        inst.plus = true; snd('upgrade'); toast(`${itemName(def, true)}: ${itemText(def, true)}`, 3); toMap();
      } }));
    }
    if (!order.length) cards.appendChild(h('div', 'sub', 'Everything is already upgraded.'));
    b.appendChild(cards);
    b.appendChild(btn('Leave', () => toMap(), 'ghost'));
    save();
  }

  // ---------------------------------------------------------------- game over / win
  function statsList(run) {
    const list = h('div', 'list');
    const kv = (k, v) => { const e = h('div', 'kv'); e.appendChild(h('span', null, k)); const b = h('b', null, String(v)); e.appendChild(b); list.appendChild(e); };
    kv('Act reached', run.act);
    kv('Fights', run.fights);
    kv('Kills', run.kills);
    kv('Turns', run.turns);
    kv('Grabs', run.grabs);
    kv('Items played', run.played);
    kv('Jackpots', run.jackpots);
    kv('Gold', run.gold);
    kv('Seed', run.seed);
    return list;
  }
  function showGameOver() {
    const run = S.run;
    if (!run) { showTitle(); return; }
    S.meta.stats.bestAct = Math.max(S.meta.stats.bestAct, run.act);
    const unl = run.act >= 2 ? checkUnlocks('act2') : [];
    saveMeta();
    F = null; FS = null;
    setScreen('gameover');
    const b = $('gameoverBody');
    clear(b);
    b.appendChild(h('h1', null, 'Turned into a prize'));
    b.appendChild(h('div', 'sub', `Killed by ${run.killer || 'the Clawspire'} in act ${run.act}. The Prize Master adds you to the shelf.`));
    b.appendChild(statsList(run));
    if (unl.length) b.appendChild(h('div', 'tag lime', 'Unlocked: ' + unl.map((id) => (charDef(id) || {}).name || id).join(', ')));
    b.appendChild(btn('Back to title', () => { S.run = null; save(); showTitle(); }, 'pri'));
    try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ }
    music('off');
  }
  function showWin() {
    const run = S.run;
    S.meta.stats.wins++;
    S.meta.stats.bestAct = Math.max(S.meta.stats.bestAct, 3);
    const unl = checkUnlocks('win').concat(checkUnlocks('act2'));
    saveMeta();
    F = null; FS = null;
    setScreen('win');
    const b = $('winBody');
    clear(b);
    b.appendChild(h('h1', null, 'The Prize Master falls'));
    b.appendChild(h('div', 'sub', 'The claw goes quiet. The cabinets flicker off, one by one. You walk out with a bin full of junk and every ticket in the building.'));
    b.appendChild(statsList(run));
    if (unl.length) b.appendChild(h('div', 'tag lime', 'Unlocked: ' + unl.map((id) => (charDef(id) || {}).name || id).join(', ')));
    b.appendChild(btn('Back to title', () => { S.run = null; save(); showTitle(); }, 'pri'));
    try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ }
    snd('win');
  }

  // ---------------------------------------------------------------- HUD
  function refreshHud(force) {
    const run = S.run;
    if (!run) return;
    const lag = F && FS && (FS.queue.length || FS.enemyTurn);
    const hp = F ? (lag ? FS.shown.p.hp : F.player.hp) : run.hp, max = F ? F.player.maxHp : run.maxHp, block = F ? (lag ? FS.shown.p.block : F.player.block) : 0;
    const key = [hp, max, block, run.gold, run.ink, run.act, run.char].join('|');
    if (force || key !== S.lastHud) {
      S.lastHud = key;
      const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      set('hpTxt', `${hp}/${max}`);
      set('blockTxt', block ? `+${block} block` : '');
      set('goldTxt', String(run.gold));
      set('inkTxt', String(run.ink));
      set('actTxt', `${run.act} of 3`);
      if (force) {
        const pc = $('portrait');
        if (pc && X.RENDER && X.RENDER.portrait) {
          try { const c = pc.getContext('2d'); if (c) { c.clearRect(0, 0, 108, 108); X.RENDER.portrait(c, run.char, 54, 54, 96, S.t); } } catch (e) { /* optional */ }
        }
        if (pc) pc.onclick = () => popover(`<b>${(charDef(run.char) || {}).name || run.char}</b><br>${hp}/${max} hp` + (block ? `, ${block} block` : '') + `<br>Claw: ${clawFor().grabs} grabs, width ${U.fmt(clawFor().width)}, grip ${U.fmt(clawFor().grip)}, ${clawFor().prongs} prongs`, 60, 70);
      }
    }
    const rk = run.relics.join(',');
    if (force || rk !== S.lastRelics) {
      S.lastRelics = rk;
      const el = $('relics');
      clear(el);
      for (const id of run.relics) {
        const def = relicDef(id);
        const r = h('button', 'relic');
        r.appendChild(relicCanvas(def, 36));
        r.onclick = (ev) => { popover(`<b>${def.name}</b><br>${def.text || ''}`, 400, 70); if (ev && ev.stopPropagation) ev.stopPropagation(); };
        el.appendChild(r);
      }
    }
    if (F && FS) {
      const st = F.player.status;
      const sk = JSON.stringify(st) + '|' + F.target;
      if (force || sk !== S.lastStatus) {
        S.lastStatus = sk;
        const el = $('pstatus');
        clear(el);
        for (const id in st) {
          const sd = tbl('STATUS')[id] || { name: id, icon: '', kind: 'buff', text: '' };
          const p = h('button', 'pip ' + (sd.kind || ''), `${sd.icon || ''}${st[id]}`);
          p.style.borderColor = sd.color || '';
          p.onclick = (ev) => { popover(`<b>${sd.icon || ''} ${sd.name} ${st[id]}</b><br>${sd.text || ''}`, 120, 360); if (ev && ev.stopPropagation) ev.stopPropagation(); };
          el.appendChild(p);
        }
      }
      const grabsShown = FS.enemyTurn ? 0 : F.player.grabs;
      const gk = grabsShown + '/' + F.player.grabsMax;
      if (force || gk !== S.lastGrabs) {
        S.lastGrabs = gk;
        const el = $('grabs');
        clear(el);
        el.appendChild(h('span', 'lbl', 'grabs'));
        for (let i = 0; i < Math.max(F.player.grabsMax, grabsShown); i++) el.appendChild(h('span', 'g' + (i < grabsShown ? '' : ' used')));
      }
      const e = $('endTurn');
      if (e) e.disabled = !canEndTurn();
    }
  }

  // ---------------------------------------------------------------- input
  function pointer(type, x, y, ev) {
    if (X.AUDIO && X.AUDIO.init && type === 'down') { try { X.AUDIO.init(); } catch (e) { /* optional */ } }
    if (type === 'down' && S.popover) { popover(null); }
    if (S.screen === 'intro') { if (type === 'down' && X.INTRO) X.INTRO.skip(); return; }
    if (S.screen === 'map') { mapPointer(type, x, y, ev); return; }
    if (S.screen === 'title') return;
    if (S.screen !== 'fight' || !F || !FS) return;
    // One finger steers. A second finger is ignored until the first lifts.
    const pid = ev && ev.pointerId != null ? ev.pointerId : null;
    if (type === 'down') {
      if (FS.steering && S.ptrId != null && pid !== null && pid !== S.ptrId) return;
      S.ptrId = pid;
      S.ptr = { x, y };
      if (y >= ARENA.y0 && y < ARENA.y1) { tapEnemy(x, y); return; }
      if (inCabinet(x, y) && canSteer()) {
        FS.steering = true;
        steer(stageToCab(x, y).x);
        if (S.coachStep === 0) coachNext();
        return;
      }
      return;
    }
    if (pid !== null && S.ptrId != null && pid !== S.ptrId) return;
    if (type === 'move') {
      if (FS.steering && canSteer()) steer(stageToCab(x, y).x);
      return;
    }
    if (type === 'up' || type === 'cancel') {
      S.ptrId = null;
      if (FS.steering) {
        FS.steering = false;
        if (type === 'up') { steer(stageToCab(x, y).x); dropClaw(); }
      }
    }
  }
  function tap(x, y) { pointer('down', x, y); pointer('up', x, y); }
  function tapEnemy(x, y) {
    if (!F) return false;
    // Hit box: the drawn body plus its intent bubble above and hp bar below,
    // nearest centre wins when two overlap.
    let best = -1, bd = 1e9;
    F.enemies.forEach((e, i) => {
      if (!e.alive) return;
      const p = enemyPos(i);
      const hw = Math.max(50, p.w * 0.6);
      const top = intentY(p) - 34, bot = p.y + 44;
      if (x < p.x - hw || x > p.x + hw || y < top || y > bot) return;
      const d = Math.abs(p.x - x);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return false;
    if (X.COMBAT.setTarget) X.COMBAT.setTarget(F, best); else F.target = best;
    const e = F.enemies[best];
    const txt = X.COMBAT.intentText ? X.COMBAT.intentText(e) : '';
    const p = enemyPos(best);
    popover(`<b>${e.def.name}</b> ${e.hp}/${e.maxHp}${e.block ? ' +' + e.block + ' block' : ''}<br>${txt}${e.def.desc ? '<br><i>' + e.def.desc + '</i>' : ''}`, p.x, p.y + 26);
    snd('click');
    FS.dirty = true;
    return true;
  }
  function choose(i) {
    const b = S.ui.buttons[i];
    if (!b || b.disabled || (b.el && b.el.disabled)) return false;
    b.fn();
    return true;
  }
  function onKey(ev, down) {
    const k = ev.key;
    if (down && k === 'Escape') { popover(null); return; }
    if (S.screen === 'intro') { if (down && X.INTRO) X.INTRO.skip(); return; }
    if (S.screen !== 'fight' || !FS) return;
    if (k === 'ArrowLeft') FS.keyDir = down ? -1 : (FS.keyDir === -1 ? 0 : FS.keyDir);
    else if (k === 'ArrowRight') FS.keyDir = down ? 1 : (FS.keyDir === 1 ? 0 : FS.keyDir);
    else if (down && (k === ' ' || k === 'Enter')) { if (ev.preventDefault) ev.preventDefault(); if (!ev.repeat) dropClaw(); }
    else if (down && (k === 'e' || k === 'E')) endTurn();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    const ctx = S.ctx;
    if (!ctx) return;
    if (S.screen === 'intro') return;   // the intro paints the canvas itself
    const t = S.t;
    const R = X.RENDER;
    ctx.save();
    ctx.setTransform(S.px, 0, 0, S.px, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const off = fx().offset ? fx().offset() : { x: 0, y: 0 };
    ctx.translate(off.x || 0, off.y || 0);
    const run = S.run;
    if (S.screen === 'title' || S.screen === 'chars' || S.screen === 'help' || S.screen === 'collection') {
      if (R && R.title) R.title(ctx, W, H, t); else { ctx.fillStyle = '#12091f'; ctx.fillRect(0, 0, W, H); }
    } else if (S.screen === 'map' || (run && S.screen !== 'fight' && S.screen !== 'gameover' && S.screen !== 'win')) {
      drawMap(ctx, t);
    } else if (S.screen === 'fight' && F && FS) {
      drawFight(ctx, t);
    } else if (run && R && R.bg) {
      R.bg(ctx, W, H, run.act, t);
    } else { ctx.fillStyle = '#12091f'; ctx.fillRect(0, 0, W, H); }
    fx().draw(ctx);
    ctx.restore();
  }
  const DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // Per-map paint cache: world position, ground colour, coast edge mask and
  // a hash seed per tile, so drawing allocates nothing per frame.
  function mapPaint() {
    const M = S.run && S.run.map, L = mapLayout();
    if (!M || !L) return null;
    if (S.mapPaint && S.mapPaint.M === M) return S.mapPaint;
    const R = X.RENDER;
    const biome = M.biome || (X.MAP.biomeOf ? X.MAP.biomeOf(M.act) : 'cellar');
    const dirs = X.MAP.DIRS || DIRS6;
    // Which drawn edge faces each axial direction (edge i runs corner i -> i+1
    // in RENDER's hexPath order: flat-top corners at 0, 60, ... degrees).
    const off = L.orient === 'v' ? 0 : -Math.PI / 2;
    const o = X.MAP.toPixel(0, 0, 10, L.orient);
    const edgeOf = dirs.map(([dq, dr]) => {
      const a = X.MAP.toPixel(dq, dr, 10, L.orient);
      const vx = a.x - o.x, vy = a.y - o.y;
      let best = 0, bd = -Infinity;
      for (let i = 0; i < 6; i++) { const m = off + (i + 0.5) * Math.PI / 3; const d = vx * Math.cos(m) + vy * Math.sin(m); if (d > bd) { bd = d; best = i; } }
      return best;
    });
    const items = [];
    for (const k in M.tiles) {
      const t = M.tiles[k];
      const w = worldOf(t.q, t.r);
      let mask = 0;
      if (t.coast) dirs.forEach(([dq, dr], i) => { const n = X.MAP.tileAt(M, t.q + dq, t.r + dr); if (n && n.terrain && n.terrain !== 'land') mask |= 1 << edgeOf[i]; });
      const terr = t.terrain || 'land';
      const fill = R && R.terrainFill ? R.terrainFill(biome, terr, t.elev || 0) : (terr === 'sea' ? '#173142' : terr === 'shallow' ? '#3b7d86' : '#8a8570');
      items.push({ t, k, wx: w.x, wy: w.y, fill, mask, seed: U.hashStr(k) });
    }
    const road = (M.road || []).map(([q, r]) => worldOf(q, r));
    S.mapPaint = { M, biome, items, road, hidden: [], pool: [], st: {}, cur: { x: 0, y: 0 } };
    return S.mapPaint;
  }
  function drawMap(ctx, t) {
    const R = X.RENDER, run = S.run, M = run && run.map;
    if (R && R.mapBg) R.mapBg(ctx, W, H, run ? run.act : 1, t); else { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H); }
    if (!M || !X.MAP) return;
    const L = mapLayout(), P = mapPaint(), c = cam();
    if (!L || !P) return;
    const A = L.area, z = c.zoom, size = L.size * z;
    const ox = A.x + A.w / 2 - c.x * z, oy = A.y + A.h / 2 - c.y * z;
    const x0 = A.x - size, x1 = A.x + A.w + size, y0 = A.y - size, y1 = A.y + A.h + size;
    const reach = new Set(X.MAP.reachable ? X.MAP.reachable(M).map((x) => X.MAP.key(x.q, x.r)) : []);
    const brushable = new Set();
    if (S.brushSel && X.MAP.revealable) for (const x of X.MAP.revealable(M, { brush: true })) brushable.add(X.MAP.key(x.q, x.r));
    const pv = S.preview && S.preview.path && S.preview.path.length ? S.preview : null;
    const onPath = {};
    if (pv) pv.path.forEach(([q, r], i) => { onPath[X.MAP.key(q, r)] = i + 1; });
    const flat = L.orient === 'v';
    const st = P.st;
    ctx.save();
    ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    // Pass 1: the ground (water, fords, land) under every hex in view.
    st.t = t; st.orient = L.orient; st.biome = P.biome; st.ink = M.ink;
    for (const it of P.items) {
      const x = it.wx * z + ox, y = it.wy * z + oy;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      st.fill = it.fill; st.seed = it.seed;
      if (R && R.terrainHex) R.terrainHex(ctx, x, y, size, it.t, st);
      else {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i + (flat ? 0 : -30)); ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a)); }
        ctx.closePath(); ctx.fillStyle = it.fill; ctx.fill();
      }
    }
    // The road: a worn track between its hexes, over the ground, under the icons.
    if (P.road.length > 1 && R && R.mapRoad) R.mapRoad(ctx, P.road.map((w) => ({ x: w.x * z + ox, y: w.y * z + oy })), size, t);
    // Pass 2: coast, fog, icons and states on everything but the sea.
    const hidden = P.hidden;
    hidden.length = 0;
    const wxy = walkXY();
    let curXY = null, np = 0;
    for (const it of P.items) {
      const tile = it.t;
      if (tile.terrain === 'sea') continue;
      const x = it.wx * z + ox, y = it.wy * z + oy;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const cur = tile.q === M.pos.q && tile.r === M.pos.r;
      if (cur) { P.cur.x = x; P.cur.y = y; curXY = P.cur; }
      if (!tile.revealed && tile.type !== 'boss' && tile.terrain !== 'shallow') { const pt = P.pool[np] || (P.pool[np] = { x: 0, y: 0 }); pt.x = x; pt.y = y; hidden.push(pt); np++; }
      st.reachable = reach.has(it.k); st.current = cur; st.hover = brushable.has(it.k);
      st.canReveal = !tile.revealed && X.MAP.canReveal(M, tile.q, tile.r);
      st.path = onPath[it.k] || 0; st.target = !!(pv && pv.q === tile.q && pv.r === tile.r); st.known = !!tile.known;
      st.road = !!tile.road; st.walking = !!wxy;
      st.fill = it.fill; st.mask = it.mask; st.seed = it.seed;
      if (R && R.hex) R.hex(ctx, x, y, size, tile, st);
      else {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i + (flat ? 0 : -30)); ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a)); }
        ctx.closePath(); ctx.fillStyle = tile.revealed ? '#2c1d4a' : '#150c26'; ctx.fill(); ctx.strokeStyle = '#3d2a63'; ctx.stroke();
      }
    }
    // The start-boss axis shows through the fog so the direction is obvious.
    if (R && R.mapAxis && hidden.length) { const a = hexToStage(M.start.q, M.start.r), b = hexToStage(M.boss.q, M.boss.r); R.mapAxis(ctx, a.x, a.y, b.x, b.y, size, hidden, t, flat); }
    // The crawler and the portrait: on the current hex, or easing between
    // hexes while a walk plays (hex() left the crawler out then).
    const meXY = wxy || curXY;
    if (wxy && R && R.crawler) R.crawler(ctx, wxy.x, wxy.y, size, t);
    if (meXY && R && R.portrait) R.portrait(ctx, run.char, meXY.x, meXY.y, size * 1.2, t);
    if (pv && R && R.mapPath) {
      // Draw the path from the lit hex it grows out of.
      const pts = pv.path.map(([q, r]) => hexToStage(q, r));
      const [fq, fr] = pv.path[0];
      const from = X.MAP.neighbors(M, fq, fr).map(([q, r]) => M.tiles[X.MAP.key(q, r)]).find((n) => n.revealed && (n.type !== 'boss' || n.visited));
      if (from) pts.unshift(hexToStage(from.q, from.r));
      R.mapPath(ctx, pts, size, { cost: pv.cost, ink: M.ink, label: pv.label, t });
    }
    ctx.restore();
    // Off-screen boss: an arrow on the edge of the map area pointing at it.
    const ba = bossArrow();
    if (ba && R && R.mapArrow) R.mapArrow(ctx, ba.x, ba.y, ba.a, 16, t, 'Boss');
    if (R && R.mapCompass) R.mapCompass(ctx, A.x + A.w - 42, A.y + A.h - 42, 28, t);
    if (R && R.mapHeader) {
      const pr = X.MAP.progress ? X.MAP.progress(M) : null;
      R.mapHeader(ctx, A.x + 10, A.y + A.h - 42, 190, 32, actDef(run.act).name, pr ? `${pr.revealed} of ${pr.total} hexes charted` : '', t);
    }
  }
  function drawFight(ctx, t) {
    const R = X.RENDER, run = S.run;
    if (R && R.bg) R.bg(ctx, W, H, run.act, t); else { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H); }
    // Enemies.
    F.enemies.forEach((e, i) => {
      const p = enemyPos(i);
      const a = anim(i);
      // Combat resolves in one go, so an enemy can be dead in the state while
      // its 'die' event is still queued for its beat: keep drawing it alive
      // until the event plays, then the fall animation runs once.
      const pendingDeath = !e.alive && !a.dead;
      if (!e.alive && a.dead >= 1) return;
      const st = { hurt: a.hurt, attack: a.attack, dead: (e.alive || pendingDeath) ? 0 : a.dead, frozen: !!(e.status.freeze), poisoned: !!(e.status.poison), burning: !!(e.status.burn) };
      if (i === F.target && e.alive) {
        ctx.save(); ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, Math.max(40, p.w * 0.5), 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (R && R.enemy) R.enemy(ctx, e.def, p.x, p.y, p.scale, t, st);
      if (!e.alive && !pendingDeath) return;
      // hp bar under the feet, status pips under that, intent above the head
      // (never under the top bar)
      const bw = U.clamp(p.w * 0.9, 84, 150);
      const sh = (FS.queue.length || FS.enemyTurn) && FS.shown.e[i] ? FS.shown.e[i] : e;
      if (R && R.hpBar) R.hpBar(ctx, p.x - bw / 2, p.y + 10, bw, 12, sh.hp, e.maxHp, sh.block);
      if (R && R.statusPips) R.statusPips(ctx, p.x - bw / 2, p.y + 26, e.status, 14);
      if (R && R.intent) R.intent(ctx, p.x, intentY(p), e, t);
    });
    // The rig.
    const cfg = { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, frame: CAB.frame, railY: 26, slopeW: CAB.slopeW, slopeH: CAB.slopeH, chuteX: FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW, claw: clawFor() };
    const cabSt = { fog: FS.fog > 0 ? 1 : 0, grease: FS.grease > 0 ? 1 : 0, tilt: FS.tilt, act: run.act, t };
    const split = R && R.cabinetBack && R.cabinetFront;
    if (split) R.cabinetBack(ctx, CAB.x, CAB.y, cfg, cabSt);
    else if (R && R.cabinet) R.cabinet(ctx, CAB.x, CAB.y, cfg, cabSt);
    else { ctx.fillStyle = '#0d0718'; ctx.fillRect(CAB.x - CAB.frame, CAB.y - CAB.frame, CAB.w + CAB.frame * 2, CAB.h + CAB.frame * 2); ctx.fillStyle = '#1b1030'; ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h); }
    ctx.save();
    ctx.beginPath(); ctx.rect(CAB.x, CAB.y, CAB.w, CAB.h); ctx.clip();
    const rigPh = FS.rig ? FS.rig.phase : 'idle';
    const inHand = (rigPh === 'lifting' || rigPh === 'carrying') ? carried() : null;
    for (const b of FS.items) {
      const inst = b.data.inst;
      const inChute = FS.cabinet && FS.cabinet.inChute(b);
      const held = inHand && inHand.indexOf(b) >= 0;
      const sq = b.data.sq > 0.02 ? b.data.sq : 0;
      const x = CAB.x + b.x, y = CAB.y + b.y;
      if (sq) { ctx.save(); ctx.translate(x, y); ctx.scale(1 + sq * 0.22, 1 - sq * 0.22); ctx.translate(-x, -y); }
      if (R && R.item) R.item(ctx, b.data.def, x, y, b.a, 1, { plus: inst.plus, frozen: inst.frozen, glow: inChute ? 1 : (held ? '#2ee6d6' : 0) });
      else { ctx.fillStyle = b.data.def.color || '#888'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); }
      if (sq) ctx.restore();
    }
    if (FS.chuteFlash > 0) {
      const cx = CAB.x + (FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW);
      ctx.fillStyle = 'rgba(255,201,77,' + (0.5 * FS.chuteFlash / 0.35).toFixed(3) + ')';
      ctx.fillRect(cx, CAB.y, CAB.chuteW, CAB.h);
    }
    if (R && R.claw && FS.rig) R.claw(ctx, FS.rig, CAB.x, CAB.y, cfg);
    if (FS.fog > 0 && !split) { ctx.fillStyle = 'rgba(180,190,210,0.55)'; ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h); }
    ctx.restore();
    if (split) R.cabinetFront(ctx, CAB.x, CAB.y, cfg, cabSt);
    if (S.debug && R && R.bodyDebug && FS.world) { ctx.save(); ctx.translate(CAB.x, CAB.y); R.bodyDebug(ctx, FS.world); ctx.restore(); }
  }

  // ---------------------------------------------------------------- loop
  function update(dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : STEP;
    S.t += dt;
    fx().update(dt);
    if (S.toastT > 0) { S.toastT -= dt; if (S.toastT <= 0) { const el = $('toast'); if (el) el.classList.remove('show'); } }
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) { const el = $('banner'); if (el) el.classList.remove('show'); const pr = $('playerRow'); if (pr && pr.classList) pr.classList.remove('bannerOn'); } }
    if (S.screen === 'map') { walkTick(dt); camStep(dt); }
    if (S.screen === 'fight') {
      updateFight(dt);
      if (FS && (FS.dirty || (S.t - (S.hudT || 0)) > 0.15)) { FS.dirty = false; S.hudT = S.t; refreshHud(false); }
    }
  }
  function frame(now) {
    if (!S.headless) S.frame = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - S.last) / 1000);
    S.last = now;
    S.acc += dt;
    let n = 0;
    while (S.acc >= STEP && n < 6) { update(STEP); S.acc -= STEP; n++; }
    if (n === 6) S.acc = 0;
    draw();
  }
  function loop() {
    S.last = typeof performance !== 'undefined' ? performance.now() : 0;
    S.acc = 0;
    if (!S.headless) S.frame = requestAnimationFrame(frame);
  }
  function resize() {
    let vw = W, vh = H;
    try { vw = window.innerWidth || W; vh = window.innerHeight || H; } catch (e) { /* headless */ }
    const wrap = $('wrap');
    let iw = vw, ih = vh;
    try { if (wrap && wrap.clientWidth) { iw = wrap.clientWidth; ih = wrap.clientHeight; } } catch (e) { /* ignore */ }
    const k = Math.min(iw / W, ih / H) || 1;
    S.scale = k;
    const stage = $('stage');
    if (stage) {
      stage.style.transform = `scale(${k})`;
      stage.style.left = Math.floor((iw - W * k) / 2) + 'px';
      stage.style.top = Math.floor((ih - H * k) / 2) + 'px';
    }
    let dpr = 1;
    try { dpr = Math.min(2.5, window.devicePixelRatio || 1); } catch (e) { dpr = 1; }
    S.px = Math.max(1, Math.min(3, dpr * k));
    if (S.cv) { S.cv.width = Math.round(W * S.px); S.cv.height = Math.round(H * S.px); }
  }
  function stagePoint(ev) {
    const stage = $('stage');
    let r = { left: 0, top: 0 };
    try { r = stage.getBoundingClientRect(); } catch (e) { /* ignore */ }
    const k = S.scale || 1;
    return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k };
  }
  function bindDom() {
    S.cv = $('cv');
    try { S.ctx = S.cv ? S.cv.getContext('2d') : null; } catch (e) { S.ctx = null; }
    S.headless = !S.ctx || isNode;
    try { S.debug = /[?&]debug=1/.test(window.location.search); } catch (e) { S.debug = false; }
    const cv = S.cv;
    if (cv && cv.addEventListener) {
      cv.addEventListener('pointerdown', (ev) => { const p = stagePoint(ev); try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } pointer('down', p.x, p.y, ev); if (ev.preventDefault) ev.preventDefault(); });
      cv.addEventListener('pointermove', (ev) => { const p = stagePoint(ev); pointer('move', p.x, p.y, ev); });
      cv.addEventListener('pointerup', (ev) => { const p = stagePoint(ev); pointer('up', p.x, p.y, ev); });
      cv.addEventListener('pointercancel', (ev) => { const p = stagePoint(ev); pointer('cancel', p.x, p.y, ev); });
      cv.addEventListener('contextmenu', (ev) => { if (ev.preventDefault) ev.preventDefault(); });
      cv.addEventListener('wheel', (ev) => { if (S.screen !== 'map') return; const p = stagePoint(ev); wheel(p.x, p.y, ev.deltaY); if (ev.preventDefault) ev.preventDefault(); }, { passive: false });
    }
    try {
      document.addEventListener('keydown', (ev) => onKey(ev, true));
      document.addEventListener('keyup', (ev) => onKey(ev, false));
      document.addEventListener('pointerdown', () => { if (X.AUDIO && X.AUDIO.init) { try { X.AUDIO.init(); } catch (e) { /* optional */ } } });
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.last = performance.now(); S.acc = 0; } if (FS) FS.keyDir = 0; if (document.hidden) save(); });
      window.addEventListener('blur', () => { if (FS) FS.keyDir = 0; });
    } catch (e) { /* headless */ }
    const e = $('endTurn');
    if (e) e.onclick = () => endTurn();
    const stage = $('stage');
    // Any tap outside the popover closes it, except the tap that just opened it.
    if (stage && stage.addEventListener) stage.addEventListener('pointerdown', (ev) => { if (S.popover && ev.target && ev.target.id !== 'pop' && performance.now() - (S.popStamp || 0) > 60) popover(null); });
  }
  function boot() {
    if (S.booted) return;
    S.booted = true;
    // Illustrated art is optional: ART.load() is a no-op headless and every
    // missing PNG leaves the drawn art in place.
    try { if (typeof ART !== 'undefined' && ART && ART.load) ART.load(); } catch (e) { /* art is optional */ }
    loadMeta();
    bindDom();
    resize();
    showTitle();
    loop();
    // First launch: the intro, unless a capture script opened ?intro=render
    // (it drives INTRO.draw by hand and must not be interrupted).
    let renderMode = false;
    try { renderMode = /[?&]intro=render/.test(window.location.search); } catch (e) { renderMode = false; }
    if (!S.meta.introSeen && !renderMode) playIntro(true);
  }

  function state() {
    return { screen: S.screen, run: S.run, fight: F, rigPhase: FS && FS.rig ? FS.rig.phase : null, grabs: F ? F.player.grabs : 0, grabInFlight: !!(FS && FS.grabInFlight), enemyTurn: !!(FS && FS.enemyTurn), queue: FS ? FS.queue.length : 0 };
  }

  return {
    boot, update, draw, loop, resize,
    newRun, toMap, enterTile, addItem, startFight, endFight, dropClaw, steer, endTurn, save, load, mapTap,
    playDelivered: (bodies) => { for (const b of bodies || []) if (FS && FS.items.indexOf(b) >= 0) deliver(b); },
    tap, pointer, choose, state, hexToStage, stageToHex, lookAt, locate, wheel, bossArrow, startWalk, stopWalk, walkXY, showTitle, showChars, showReward, showShop, showEvent, showRest, showForge,
    showTreasure, showSpareParts, showGameOver, showWin, showHelp, showCollection, openBin, playIntro, resolveFx, gainRelic, applyClawUpgrade, rollShop,
    rigEvent: (ev) => { if (FS && FS.rig) onRigEvent(ev); },   // test hook: feed one rig event
    get run() { return S.run; }, set run(v) { S.run = v; },
    get fight() { return F; },
    get rig() { return FS ? FS.rig : null; }, get world() { return FS ? FS.world : null; }, get cabinet() { return FS ? FS.cabinet : null; },
    get screen() { return S.screen; }, get meta() { return S.meta; }, get headless() { return S.headless; },
    get fs() { return FS; }, get S() { return S; }, get cam() { return S.cam; },
    CAB, BEAT, DELIVER_HOLD, AUTO_END, WATCHDOG, RUN_KEY, META_KEY, WALK_STEP,
  };
})();

window.CS = {
  U: typeof U !== 'undefined' ? U : undefined,
  ART: typeof ART !== 'undefined' ? ART : undefined,
  PHYS: typeof PHYS !== 'undefined' ? PHYS : undefined,
  DATA: typeof DATA !== 'undefined' ? DATA : undefined,
  COMBAT: typeof COMBAT !== 'undefined' ? COMBAT : undefined,
  MAP: typeof MAP !== 'undefined' ? MAP : undefined,
  AUDIO: typeof AUDIO !== 'undefined' ? AUDIO : undefined,
  RENDER: typeof RENDER !== 'undefined' ? RENDER : undefined,
  INTRO: typeof INTRO !== 'undefined' ? INTRO : undefined,
  GAME,
};
