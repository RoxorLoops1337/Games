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
  const CAB = { x: 30, y: 410, w: 480, h: 390, chuteW: 64, frame: 30, dividerH: 0.6, wallThick: 40, slopeW: 130, slopeH: 90 };
  const ARENA = { y0: 70, y1: 340 };
  const BEAT = 0.45;            // seconds between enemy-turn events
  const PLAY_BEAT = 0.16;       // seconds between player-side events
  const DELIVER_HOLD = 0.25;    // a body must sit in the chute this long to count
  const AUTO_END = 0.6;         // pause before the turn auto-ends at 0 grabs
  const WATCHDOG = 15;          // seconds after a drop before the rig is force-reset
  const SPAWN_GAP = 0.05;       // shower spacing when bodies are (re)spawned
  const START_INK = 5;
  const REMOVE_PRICE = 60;
  const RELIC_PRICE = { c: 120, u: 160, r: 220, boss: 220, event: 160 };
  const RARITY_NAME = { c: 'common', u: 'uncommon', r: 'rare', l: 'legendary', junk: 'junk' };
  const TILE_NAMES = {
    empty: 'nothing here', fight: 'a fight', elite: 'an elite', treasure: 'treasure', gem: 'a gem',
    ink: 'ink', brush: 'a brush', event: 'something odd', shop: 'a shop', rest: 'a rest stop',
    boss: 'the boss', start: 'the start', forge: 'a forge',
  };
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
    S.bannerT = secs || 1.1;
    S.bannerStr = str;
  }
  function hint(str) { const el = $('hint'); if (el) el.textContent = str; S.hint = str; }

  // ---------------------------------------------------------------- meta
  function freshMeta() {
    return {
      ver: SAVE_VER, unlocks: { knight: true },
      stats: { runs: 0, wins: 0, bestAct: 0, jackpots: 0, kills: 0, fights: 0, played: 0 },
      seen: { items: {}, relics: {} }, tutorialDone: false, settings: { shake: true },
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
    if (!S.run) { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ } return; }
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
      if (o.pendingFight && o.pendingFight.enemyIds) {
        setScreen('map');
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
    run.map = X.MAP.generate({ act: run.act, rng, cols: 12, rows: 7, ink: run.ink, brushes: run.brushes });
    run.floor = 0;
    S.brushSel = null;
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
  function addGold(n) { const run = S.run; run.gold = Math.max(0, run.gold + n); }
  function addBrush(id) { const run = S.run; run.brushes.push(id); if (run.map) run.map.brushes = run.brushes.slice(); }
  function healRun(n) { const run = S.run; run.hp = U.clamp(run.hp + Math.round(n), 0, run.maxHp); }
  function addItem(id, plus) { const inst = { uid: U.uid(), id, plus: !!plus }; S.run.bin.push(inst); seeItem(id); return inst; }
  // Relic ids not yet owned, filtered by rarity list.
  function relicPool(rarities) {
    const own = S.run ? S.run.relics : [];
    const out = [];
    for (const id in tbl('RELICS')) {
      const r = tbl('RELICS')[id];
      if (own.indexOf(id) >= 0) continue;
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
  const SCREENS = ['title', 'chars', 'map', 'fight', 'reward', 'shop', 'event', 'rest', 'forge', 'treasure', 'bin', 'gameover', 'win', 'help', 'collection'];
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
    else if (name === 'map' || name === 'shop' || name === 'event' || name === 'rest' || name === 'forge' || name === 'treasure' || name === 'reward') music('map');
    else if (name === 'win') music('win');
    else if (name === 'gameover') music('off');
    if (['fight', 'bin', 'help', 'collection', 'title', 'chars', 'gameover', 'win'].indexOf(name) < 0) save();
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
    p = h('p'); p.innerHTML = 'Long thin things are hard to hold, balls are easy, flat discs slip, heavy things need grip. Upgrade the claw at shops and rest stops: more grabs, a wider palm, stronger grip, a third prong, rubber tips, a magnet.'; b.appendChild(p);
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
    S.sd = null;
    setScreen('map');
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
    l1.appendChild(btn('Bin', () => openBin({ mode: 'view', back: () => toMap() }), 'sm ghost'));
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
    const hintTxt = S.brushSel ? `Brush ready: tap a hidden hex next to the light to paint it.`
      : (M && M.ink > 0 ? 'Tap a hidden hex to reveal it (1 ink). Tap a lit hex to walk.' : 'No ink left. Tap a lit hex to walk. Elites and ink tiles give ink.');
    l2.appendChild(h('div', 'hint', hintTxt));
    head.appendChild(l2);
    refreshHud(true);
  }
  // Where the map sits on the stage, and the hex size that fits it.
  function mapLayout() {
    const M = S.run && S.run.map;
    if (!M || !X.MAP) return null;
    const area = { x: 0, y: 160, w: W, h: 780 };
    let L;
    if (X.MAP.size) L = X.MAP.size(M, area.w, area.h);
    else {
      const s = Math.min((area.w - 16) / (Math.sqrt(3) * (M.cols + 0.5)), (area.h - 16) / (1.5 * (M.rows - 1) + 2));
      L = { size: s, ox: 0, oy: 0 };
    }
    return { area, size: L.size, ox: area.x + L.ox, oy: area.y + L.oy };
  }
  function hexToStage(q, r) {
    const L = mapLayout();
    if (!L) return { x: 0, y: 0 };
    const p = X.MAP.toPixel(q, r, L.size);
    return { x: L.ox + p.x, y: L.oy + p.y };
  }
  function stageToHex(x, y) {
    const L = mapLayout();
    if (!L) return null;
    return X.MAP.fromPixel(x - L.ox, y - L.oy, L.size);
  }
  function mapTap(x, y) {
    const run = S.run, M = run && run.map;
    if (!M) return false;
    const hx = stageToHex(x, y);
    if (!hx) return false;
    const t = X.MAP.tileAt(M, hx.q, hx.r);
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
    if (!t.revealed) {
      if (X.MAP.canReveal(M, t.q, t.r)) {
        X.MAP.reveal(M, t.q, t.r);
        run.ink = M.ink;
        snd('reveal');
        fx().burst(x, y, '#2ee6d6', 12);
        toast(`Revealed: ${TILE_NAMES[t.type] || t.type}.`);
        buildMapHead();
        save();
        return true;
      }
      if (M.ink < 1) toast('No ink. Elites and ink tiles give more.');
      else toast('Reveal hexes next to the light.');
      return false;
    }
    if (X.MAP.canMove(M, t.q, t.r)) {
      X.MAP.move(M, t.q, t.r);
      run.floor++;
      snd('step');
      enterTile(t);
      return true;
    }
    if (t.q === M.pos.q && t.r === M.pos.r) { toast('You are here.'); return false; }
    toast('Walk one lit hex at a time.');
    return false;
  }
  // Resolve a tile the player just stepped on.
  function enterTile(t) {
    const run = S.run;
    if (!t) return;
    run.tile = { q: t.q, r: t.r };
    const c = t.content || {};
    if (t.done) { toast('Already cleared.'); save(); return; }
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
        const n = c.ink || 1;
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
      playQ: [], playT: 0, queue: [], beatT: 0, onDrain: null, enemyTurn: false, actor: -1, actors: [],
      autoEndT: 0, anim: {}, fog: 0, grease: 0, tilt: 0, done: false, killer: null, keyDir: 0, then: opts.then || null,
      turnsTaken: 0, dirty: true, shown: { p: { hp: 0, block: 0 }, e: {} },
    };
    syncShown();
    S.pendingFight = null;
    buildWorld();
    spawnAll();
    setScreen('fight');
    S.meta.stats.fights++;
    run.fights++;
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
    FS.world = P.world({ gravity: { x: 0, y: 1400 }, w: CAB.w, h: CAB.h });
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
      railY: 26, prongs: c.prongs, width: c.width, grip: c.grip, speed: c.speed, rubber: c.rubber, magnet: c.magnet,
      rand: U.rng(FS.seed ^ 0x1234567),
    });
  }
  function shapeFor(def, inst) {
    const sh = def.shape || { kind: 'circle', r: 16 };
    if (inst && inst.frozen) return { kind: 'circle', r: shapeLong(sh) / 2 + 4 };
    if (sh.kind === 'circle') return { kind: 'circle', r: sh.r };
    if (sh.kind === 'box') return { kind: 'poly', verts: X.PHYS.box(sh.w, sh.h) };
    if (sh.verts) return { kind: 'poly', verts: sh.verts };
    return { kind: 'circle', r: 16 };
  }
  function bodyOf(inst) {
    for (const b of FS.items) if (b.data.inst === inst || b.data.inst.uid === inst.uid) return b;
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
      restitution: inst.frozen ? 0.05 : (def.restitution == null ? 0.1 : def.restitution),
      group: 'item', data: { inst, tags: def.tags || [], def, chuteT: 0, friction0: def.friction == null ? 0.5 : def.friction },
    });
    if (FS.grease > 0) b.friction = 0.04;
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
    for (const b of FS.items) {
      b.vx += (r() - 0.5) * 700;
      b.vy -= 250 + r() * 500;
      b.av += (r() - 0.5) * 10;
    }
    fx().shake(9);
    snd('shake');
    haptic('hit');
  }
  function setGrease(turns) {
    FS.grease = Math.max(FS.grease, turns || 1);
    for (const b of FS.items) b.friction = 0.04;
    if (FS.rig && FS.rig.bodies) for (const p of FS.rig.bodies.prongs) p.data.friction0 = p.data.friction0 == null ? p.friction : p.data.friction0;
  }
  function clearGrease() {
    FS.grease = 0;
    for (const b of FS.items) b.friction = b.data.friction0;
  }
  function setTilt(dir) {
    FS.tilt = dir;
    if (FS.world) FS.world.setGravity(dir * 620, 1250);
    fx().shake(5);
  }
  function clearTilt() {
    FS.tilt = 0;
    if (FS.world) FS.world.setGravity(0, 1400);
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
    F.events.length = 0;
    for (const ev of evs || []) FS.queue.push({ ev, beat });
  }
  // Enemy anchor: RENDER.enemy draws feet-on-origin and applies def.size and
  // the boss 1.6x itself, so scale stays 1 here. y is the feet line.
  function enemyPos(i) {
    const n = Math.max(1, F ? F.enemies.length : 1);
    const e = F && F.enemies[i];
    const def = e ? e.def : null;
    let bw = 80, bh = 80;
    if (def && X.RENDER && X.RENDER.enemyBox) { const b = X.RENDER.enemyBox(def, 1); bw = b.w; bh = b.h; }
    const boss = def && def.tier === 'boss';
    return { x: W * (i + 0.5) / n, y: boss ? 306 : 288, scale: 1, w: bw, h: bh };
  }
  function anim(idx) {
    const a = FS.anim[idx] || (FS.anim[idx] = { hurt: 0, attack: 0, dead: 0 });
    return a;
  }
  const PLAYER_FX = { x: 270, y: 372 };
  function nextActor() {
    const list = FS.actors;
    let i = list.indexOf(FS.actor);
    FS.actor = i + 1 < list.length ? list[i + 1] : -1;
  }
  function applyEvent(ev) {
    if (!F || !ev) return;
    bumpShown(ev);
    if (ev.t === 'turn') { FS.shown.p.block = F.player.block; }
    const enemy = ev.who === 'e';
    // Consecutive numbers on the same unit fan out sideways so they can be read.
    FS.fxN = (FS.fxN || 0) + 1;
    const fan = ((FS.fxN % 3) - 1) * 46;
    const base = enemy ? enemyPos(ev.idx) : PLAYER_FX;
    const pos = { x: base.x + fan, y: base.y - (enemy ? base.h * 0.5 : 0) };
    switch (ev.t) {
      case 'dmg': {
        const big = ev.amt >= 10;
        if (enemy) {
          if (ev.amt > 0) { fx().text(pos.x, pos.y - 40, '-' + ev.amt, ev.crit ? '#ffc94d' : '#ffffff', { big: ev.crit || big }); anim(ev.idx).hurt = 1; }
          else fx().text(pos.x, pos.y - 40, ev.blocked ? 'BLOCKED' : '0', '#b3a4d6');
          if (ev.amt > 0) { fx().burst(pos.x, pos.y - 10, '#ff5a4a', big ? 16 : 8); snd(big ? 'hitBig' : 'hit', { amt: ev.amt }); }
          if (big) fx().shake(4);
        } else {
          if (FS.enemyTurn && FS.actor >= 0) { anim(FS.actor).attack = 1; FS.killer = (F.enemies[FS.actor] && F.enemies[FS.actor].def.name) || FS.killer; }
          if (ev.amt > 0) {
            fx().text(pos.x, pos.y, '-' + ev.amt, '#ff5a4a', { big });
            fx().shake(big ? 12 : 6); fx().flash('#ff5a4a');
            snd('playerHurt'); haptic('hurt');
          } else {
            fx().text(pos.x, pos.y, ev.blocked ? 'BLOCKED' : 'MISS', '#2ee6d6');
            if (ev.blocked) snd('block');
          }
        }
        break;
      }
      case 'block': fx().text(pos.x, pos.y - (enemy ? 40 : 0), '+' + ev.amt + ' block', '#2ee6d6'); snd('block'); break;
      case 'heal': fx().text(pos.x, pos.y - (enemy ? 40 : 0), '+' + ev.amt, '#a6ff5e'); snd('heal'); break;
      case 'status': {
        const sd = tbl('STATUS')[ev.s] || { name: ev.s, icon: '', color: '#fff' };
        fx().text(pos.x, pos.y - (enemy ? 50 : 0), (ev.v > 0 ? '+' : '') + ev.v + ' ' + (sd.icon || '') + sd.name, sd.color || '#fff');
        if (ev.s === 'poison') snd('poison'); else if (ev.s === 'burn') snd('burn'); else if (ev.s === 'freeze' || ev.s === 'chill') snd('freeze');
        else snd('click');
        break;
      }
      case 'die': {
        anim(ev.idx).dead = 0.001;
        fx().burst(pos.x, pos.y - 10, ev.escaped ? '#b3a4d6' : '#ff2e88', 24);
        fx().text(pos.x, pos.y - 50, ev.escaped ? 'ESCAPED' : 'DOWN', '#ff2e88', { big: true });
        snd('enemyDie'); fx().shake(6);
        if (!ev.escaped) { S.run.kills++; S.meta.stats.kills++; }
        if (FS.enemyTurn && FS.actor === ev.idx) nextActor();
        break;
      }
      case 'summon': { FS.anim[ev.idx] = { hurt: 0, attack: 0, dead: 0 }; fx().burst(pos.x, pos.y, '#a6ff5e', 18); fx().text(pos.x, pos.y - 50, 'SUMMONED', '#a6ff5e'); snd('boss'); break; }
      case 'intent': if (FS.enemyTurn && FS.actor === ev.idx) nextActor(); break;
      case 'text': {
        fx().text(pos.x, pos.y - (enemy ? 50 : 0), ev.str, '#ffc94d');
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
    const cx = r.cableTop ? r.cableTop.x : r.x;
    return r.phase === 'idle' && Math.abs(cx - r.targetX) <= 2;
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
  function onRigEvent(ev) {
    switch (ev) {
      case 'drop': break;
      case 'touch': snd('clawTouch'); break;
      case 'close': snd('clawClose'); break;
      case 'lift': {
        snd('clawLift');
        const n = FS.rig.held().length;
        FS.wasHeld = n;
        if (!n) hint('empty claw...');
        break;
      }
      case 'carry': snd('clawMove'); break;
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
    fx().burst(pos.x, pos.y, '#ffc94d', 14);
    fx().trail(pos.x, pos.y, '#ffc94d');
    snd('chute');
    haptic('tap');
    if (FS.delivered === 2) {
      banner('JACKPOT', 'jackpot', 1.4);
      snd('jackpot'); haptic('jackpot');
      fx().burst(270, 600, '#ffc94d', 40); fx().flash('#ffc94d');
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
    fx().text(CAB.x + CAB.w - 32, CAB.y + CAB.h * 0.5, itemName(def, inst.plus), '#ffc94d');
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
    if (!FS.delivered && FS.wasHeld) snd('itemSlip');
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
    FS.dirty = true;
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
    const reward = { items: rollItems(rng, 3), gold, ink: tier === 'elite' ? 1 : 0, tier, then };
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
    // Physics.
    if (rig && Wd) {
      const evs = rig.update(dt);
      Wd.step(dt);
      for (const ev of evs) onRigEvent(ev);
      if (!FS) return;
      // Slip feedback while lifting/carrying.
      if (FS.grabInFlight && (rig.phase === 'lifting' || rig.phase === 'carrying')) {
        const n = rig.held().length;
        if (n < FS.wasHeld) { snd('itemSlip'); fx().text(CAB.x + rig.x, CAB.y + rig.y + 40, 'SLIP', '#b3a4d6'); }
        FS.wasHeld = n;
      }
      // Deliveries: bodies parked in the chute after a release.
      if (FS.watch) {
        for (const b of FS.items.slice()) {
          if (FS.cabinet.inChute(b)) { b.data.chuteT += dt; if (b.data.chuteT >= DELIVER_HOLD) deliver(b); }
          else b.data.chuteT = 0;
        }
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
    if (rw.then) { const then = rw.then; resolveFx(then.fx || [], then.i || 0, () => toMap()); return; }
    toMap();
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
    showTreasure({ relic: id, gold: 0, title: `Act ${run.act}: ${actDef(run.act).name}`, sub: `Healed 30%. +${START_INK} ink. The Prize Master left you something.` + (unl.length ? ` Unlocked: ${unl.map((c) => (charDef(c) || {}).name || c).join(', ')}.` : '') });
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
    const ups = Object.keys(tbl('CLAW_UPGRADES'));
    const claws = rng.shuffle(ups).slice(0, 2).map((id) => ({ id, price: tbl('CLAW_UPGRADES')[id].cost || 100, sold: false }));
    return { items, relic, claws, removeUsed: false };
  }
  function upgradeCount(id) { const run = S.run; return (run.claw.ups && run.claw.ups[id]) || 0; }
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
    shop.claws.forEach((cu) => {
      const def = tbl('CLAW_UPGRADES')[cu.id];
      if (!def) return;
      const maxed = def.max && upgradeCount(cu.id) >= def.max;
      const card = h('div', 'card' + (cu.sold || maxed ? ' sold' : ''));
      card.appendChild(h('div', 'big', def.icon || ''));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      card.appendChild(h('div', 'price', cu.sold ? 'SOLD' : maxed ? 'MAXED' : cu.price + ' gold'));
      const fn = () => {
        if (cu.sold || maxed) return;
        if (run.gold < cu.price) { toast('Not enough gold.'); return; }
        if (!applyClawUpgrade(cu.id)) { toast('Cannot apply that.'); return; }
        addGold(-cu.price); cu.sold = true; snd('upgrade'); toast(`Claw upgraded: ${def.name}.`); showShop(shop);
      };
      card.onclick = fn;
      S.ui.buttons.push({ el: card, fn, label: def.name, disabled: cu.sold || maxed });
      sec.appendChild(card);
    });
    b.appendChild(sec);
    const row = h('div', 'row');
    const rm = btn(shop.removeUsed ? 'Removed' : `Remove an item (${REMOVE_PRICE})`, () => {
      if (shop.removeUsed) return;
      if (run.gold < REMOVE_PRICE) { toast('Not enough gold.'); return; }
      openBin({ mode: 'remove', title: 'Remove which item?', back: () => showShop(shop), onPick: (inst) => {
        addGold(-REMOVE_PRICE); shop.removeUsed = true; removeInst(inst); snd('buy'); toast('Removed.'); showShop(shop);
      } });
    }, 'sm');
    if (shop.removeUsed) rm.disabled = true;
    row.appendChild(rm);
    row.appendChild(btn('Sell an item', () => openBin({ mode: 'sell', title: 'Sell which item?', back: () => showShop(shop), onPick: (inst) => {
      const p = Math.max(5, Math.round((itemDef(inst.id).cost || 30) / 3));
      removeInst(inst); addGold(p); snd('coin'); toast(`Sold for ${p} gold.`); showShop(shop);
    } }), 'sm'));
    b.appendChild(row);
    b.appendChild(btn('Leave', () => toMap(), 'pri'));
    save();
  }
  function removeInst(inst) {
    const bin = S.run.bin;
    const i = bin.findIndex((x) => x === inst || x.uid === inst.uid);
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
            if (D().pool) { try { pool = D().pool(id === 'rare' ? 'r' : D().rollRarity ? D().rollRarity(rng) : 'c', run.char) || []; } catch (e) { pool = []; } }
            if (!pool.length) pool = Object.keys(tbl('ITEMS')).filter((x) => itemDef(x).rarity !== 'junk');
            id = pool.length ? rng.pick(pool) : null;
          }
          if (id) { addItem(id, !!f.plus); toast(`${itemDef(id).name} added.`); snd('buy'); }
          break;
        }
        case 'relic': {
          let id = f.id;
          if (!id || id === 'random') id = rollRelic(rngFor('eventrelic'), ['c', 'u', 'r', 'event']);
          if (id) { gainRelic(id); toast(`Relic: ${relicDef(id).name}.`); snd('upgrade'); }
          break;
        }
        case 'junk': for (let n = 0; n < (f.n || 1); n++) addItem(f.id || 'rock'); toast('Junk added to the bin.'); break;
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
    const c2 = btn('', () => showClawPick(), 'choice');
    c2.textContent = ''; c2.appendChild(h('div', 'c1', 'Tinker with the claw')); c2.appendChild(h('div', 'c2', 'Pick 1 of 3 claw upgrades.'));
    list.appendChild(c2);
    const c3 = btn('', () => openBin({ mode: 'upgrade', title: 'Upgrade which item?', back: () => showRest(), onPick: (inst) => { inst.plus = true; snd('upgrade'); toast(`${itemName(itemDef(inst.id), true)}!`); toMap(); } }), 'choice');
    c3.textContent = ''; c3.appendChild(h('div', 'c1', 'Sharpen an item')); c3.appendChild(h('div', 'c2', 'Upgrade one item to its plus version.'));
    list.appendChild(c3);
    b.appendChild(list);
    save();
  }
  function showClawPick() {
    const run = S.run;
    const rng = rngFor('clawpick');
    const ups = Object.keys(tbl('CLAW_UPGRADES')).filter((id) => { const d = tbl('CLAW_UPGRADES')[id]; return !d.max || upgradeCount(id) < d.max; });
    const pick = rng.shuffle(ups).slice(0, 3);
    S.ui.buttons = [];
    const b = $('restBody');
    clear(b);
    b.appendChild(h('h1', null, 'Claw upgrades'));
    const cards = h('div', 'cards');
    for (const id of pick) {
      const def = tbl('CLAW_UPGRADES')[id];
      const card = h('div', 'card');
      card.appendChild(h('div', 'big', def.icon || ''));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      const fn = () => { if (applyClawUpgrade(id)) { snd('upgrade'); toast(`Claw upgraded: ${def.name}.`); toMap(); } else toast('Cannot apply that.'); };
      card.onclick = fn;
      S.ui.buttons.push({ el: card, fn, label: def.name });
      cards.appendChild(card);
    }
    if (!pick.length) b.appendChild(h('div', 'sub', 'The claw is as good as it gets.'));
    b.appendChild(cards);
    b.appendChild(btn('Back', () => showRest(), 'ghost'));
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
    if (S.screen === 'map') {
      if (type === 'up' && S.ptr && Math.hypot(S.ptr.x - x, S.ptr.y - y) < 18 && y >= 152) mapTap(x, y);
      if (type === 'down') S.ptr = { x, y };
      return;
    }
    if (S.screen === 'title') return;
    if (S.screen !== 'fight' || !F || !FS) return;
    if (type === 'down') {
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
    if (type === 'move') {
      if (FS.steering && canSteer()) steer(stageToCab(x, y).x);
      return;
    }
    if (type === 'up' || type === 'cancel') {
      if (FS.steering) {
        FS.steering = false;
        if (type === 'up') { steer(stageToCab(x, y).x); dropClaw(); }
      }
    }
  }
  function tap(x, y) { pointer('down', x, y); pointer('up', x, y); }
  function tapEnemy(x, y) {
    if (!F) return false;
    let best = -1, bd = 1e9;
    F.enemies.forEach((e, i) => {
      if (!e.alive) return;
      const p = enemyPos(i);
      const d = Math.hypot(p.x - x, (p.y - p.h * 0.5) - y);
      if (d < Math.max(70, p.h * 0.7) && d < bd) { bd = d; best = i; }
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
    if (S.screen !== 'fight' || !FS) return;
    if (k === 'ArrowLeft') FS.keyDir = down ? -1 : (FS.keyDir === -1 ? 0 : FS.keyDir);
    else if (k === 'ArrowRight') FS.keyDir = down ? 1 : (FS.keyDir === 1 ? 0 : FS.keyDir);
    else if (down && (k === ' ' || k === 'Enter')) { if (ev.preventDefault) ev.preventDefault(); dropClaw(); }
    else if (down && (k === 'e' || k === 'E')) endTurn();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    const ctx = S.ctx;
    if (!ctx) return;
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
  function drawMap(ctx, t) {
    const R = X.RENDER, run = S.run, M = run && run.map;
    if (R && R.mapBg) R.mapBg(ctx, W, H, run ? run.act : 1, t); else { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H); }
    if (!M || !X.MAP) return;
    const L = mapLayout();
    const reach = new Set(X.MAP.reachable ? X.MAP.reachable(M).map((x) => X.MAP.key(x.q, x.r)) : []);
    const brushable = new Set();
    if (S.brushSel && X.MAP.revealable) for (const x of X.MAP.revealable(M, { brush: true })) brushable.add(X.MAP.key(x.q, x.r));
    for (const k in M.tiles) {
      const tile = M.tiles[k];
      const p = X.MAP.toPixel(tile.q, tile.r, L.size);
      const x = L.ox + p.x, y = L.oy + p.y;
      const cur = tile.q === M.pos.q && tile.r === M.pos.r;
      const st = { reachable: reach.has(k), current: cur, hover: brushable.has(k), t, ink: M.ink, canReveal: !tile.revealed && M.ink >= 1 && X.MAP.canReveal(M, tile.q, tile.r) };
      if (R && R.hex) R.hex(ctx, x, y, L.size, tile, st);
      else {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ctx.lineTo(x + L.size * Math.cos(a), y + L.size * Math.sin(a)); }
        ctx.closePath(); ctx.fillStyle = tile.revealed ? '#2c1d4a' : '#150c26'; ctx.fill(); ctx.strokeStyle = '#3d2a63'; ctx.stroke();
      }
      if (cur && R && R.portrait) R.portrait(ctx, run.char, x, y, L.size * 1.2, t);
    }
  }
  function drawFight(ctx, t) {
    const R = X.RENDER, run = S.run;
    if (R && R.bg) R.bg(ctx, W, H, run.act, t); else { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H); }
    // Enemies.
    F.enemies.forEach((e, i) => {
      const p = enemyPos(i);
      const a = anim(i);
      if (!e.alive && a.dead >= 1) return;
      if (!e.alive && !a.dead) a.dead = 1;
      const st = { hurt: a.hurt, attack: a.attack, dead: e.alive ? 0 : a.dead, frozen: !!(e.status.freeze), poisoned: !!(e.status.poison), burning: !!(e.status.burn) };
      if (i === F.target && e.alive) {
        ctx.save(); ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, Math.max(40, p.w * 0.55), 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (R && R.enemy) R.enemy(ctx, e.def, p.x, p.y, 1, t, st);
      if (!e.alive) return;
      const bw = U.clamp(p.w * 1.1, 84, 150);
      const sh = (FS.queue.length || FS.enemyTurn) && FS.shown.e[i] ? FS.shown.e[i] : e;
      if (R && R.hpBar) R.hpBar(ctx, p.x - bw / 2, p.y + 12, bw, 10, sh.hp, e.maxHp, sh.block);
      if (R && R.statusPips) R.statusPips(ctx, p.x - bw / 2, p.y + 26, e.status, 16);
      if (R && R.intent) R.intent(ctx, p.x, p.y - p.h - 14, e, t);
    });
    // The rig.
    const cfg = { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, frame: CAB.frame, railY: 26, chuteX: FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW, claw: clawFor() };
    const cabSt = { fog: FS.fog > 0 ? 1 : 0, grease: FS.grease > 0 ? 1 : 0, tilt: FS.tilt, act: run.act, t };
    const split = R && R.cabinetBack && R.cabinetFront;
    if (split) R.cabinetBack(ctx, CAB.x, CAB.y, cfg, cabSt);
    else if (R && R.cabinet) R.cabinet(ctx, CAB.x, CAB.y, cfg, cabSt);
    else { ctx.fillStyle = '#0d0718'; ctx.fillRect(CAB.x - CAB.frame, CAB.y - CAB.frame, CAB.w + CAB.frame * 2, CAB.h + CAB.frame * 2); ctx.fillStyle = '#1b1030'; ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h); }
    ctx.save();
    ctx.beginPath(); ctx.rect(CAB.x, CAB.y, CAB.w, CAB.h); ctx.clip();
    for (const b of FS.items) {
      const inst = b.data.inst;
      const inChute = FS.cabinet && FS.cabinet.inChute(b);
      if (R && R.item) R.item(ctx, b.data.def, CAB.x + b.x, CAB.y + b.y, b.a, 1, { plus: inst.plus, frozen: inst.frozen, glow: inChute ? 1 : 0 });
      else { ctx.fillStyle = b.data.def.color || '#888'; ctx.beginPath(); ctx.arc(CAB.x + b.x, CAB.y + b.y, 12, 0, Math.PI * 2); ctx.fill(); }
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
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) { const el = $('banner'); if (el) el.classList.remove('show'); } }
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
    }
    try {
      document.addEventListener('keydown', (ev) => onKey(ev, true));
      document.addEventListener('keyup', (ev) => onKey(ev, false));
      document.addEventListener('pointerdown', () => { if (X.AUDIO && X.AUDIO.init) { try { X.AUDIO.init(); } catch (e) { /* optional */ } } });
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.last = performance.now(); S.acc = 0; } if (document.hidden) save(); });
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
  }

  function state() {
    return { screen: S.screen, run: S.run, fight: F, rigPhase: FS && FS.rig ? FS.rig.phase : null, grabs: F ? F.player.grabs : 0, grabInFlight: !!(FS && FS.grabInFlight), enemyTurn: !!(FS && FS.enemyTurn), queue: FS ? FS.queue.length : 0 };
  }

  return {
    boot, update, draw, loop, resize,
    newRun, toMap, enterTile, startFight, endFight, dropClaw, steer, endTurn, save, load, mapTap,
    playDelivered: (bodies) => { for (const b of bodies || []) if (FS && FS.items.indexOf(b) >= 0) deliver(b); },
    tap, pointer, choose, state, hexToStage, stageToHex, showTitle, showChars, showReward, showShop, showEvent, showRest, showForge,
    showTreasure, showGameOver, showWin, showHelp, showCollection, openBin, resolveFx, gainRelic, applyClawUpgrade, rollShop,
    get run() { return S.run; }, set run(v) { S.run = v; },
    get fight() { return F; },
    get rig() { return FS ? FS.rig : null; }, get world() { return FS ? FS.world : null; }, get cabinet() { return FS ? FS.cabinet : null; },
    get screen() { return S.screen; }, get meta() { return S.meta; }, get headless() { return S.headless; },
    get fs() { return FS; }, get S() { return S; },
    CAB, BEAT, DELIVER_HOLD, AUTO_END, WATCHDOG, RUN_KEY, META_KEY,
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
  GAME,
};
