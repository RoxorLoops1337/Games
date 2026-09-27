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
  const PROC_BEAT = 0.04;       // a relic / synergy proc only takes this long
  const PROC_MERGE = 0.7;       // procs of one relic within this window stack on one badge
  const DELIVER_HOLD = 0.25;    // a body must sit in the chute this long to count
  const AUTO_END = 0.6;         // pause before the turn auto-ends at 0 grabs
  const BIN_FLOOR = 3;          // selling or removing never empties the bin below this
  const WATCHDOG = 20;          // seconds after a drop before the rig is force-reset (phase caps sum to ~17)
  const SPAWN_GAP = 0.05;       // shower spacing when bodies are (re)spawned
  // Cabinet materials and toys (DESIGN.md "Cabinet materials"). Impacts are
  // the change of a body's velocity in one frame, less gravity's share.
  const MAT = {
    armT: 1.2,                // s after a (re)spawn before landings count: a refill shower never cracks glass
    crackV: 520,              // a glass item cracks on a landing this hard (twice: it shatters)
    fuseV: 430,               // ...a bomb's fuse lights
    fuseTurns: 2,             // turns a lit fuse burns (it goes off at the start of your turn)
    blastR: 150, blastV: 950, // the bomb's reach (px) and push (px/s)
    blastDmg: 3,              // to every enemy, +2 per act after the first, +2 when upgraded
    thudV: 300, hopR: 150, hopV: 170,   // a heavy landing makes its neighbours hop
    sparkV: 240,              // metal throws sparks above this
    starV: 420,               // two items knocking together this hard: impact stars and a camera kick
    softV: 150,               // food squish, rubber boing, magic chime, potion slosh
    meltK: 0.92, meltMin: 0.72, iceMelt: 0.84, iceGone: 0.5,   // frost shrinks each turn; a junk ice block melts away
    goldenP: 0.4,             // chance a fight has a Golden Prize (an item upgraded for the fight)
    goldenGold: 15,           // the bonus when that item was upgraded already
    luckyAfter: 2, luckyGrip: 0.6,   // Lucky Claw: two good grabs in a row, the next one grips harder
    debrisMax: 12, shardN: 4, // glass shards a shattered item leaves in the bin
    closeX: 110,              // a slip within this of the divider while carrying is a near miss
  };
  // The bulb economy lives in DATA.ECONOMY (the balance pass tunes it
  // there); its keys and the run field keep the old 'ink' spelling.
  const ECON = () => (typeof DATA !== 'undefined' && DATA && DATA.ECONOMY) || {};
  const START_INK = ECON().startInk || 10;
  // Player-facing words for the light and the tools: DATA.TERMS, one place.
  const TERMS0 = { ink: 'bulb', inkPlural: 'bulbs', brush: 'tool', brushPlural: 'tools' };
  const TERM = (k) => ((typeof DATA !== 'undefined' && DATA && DATA.TERMS) || {})[k] || TERMS0[k];
  const bulbs = (n) => `${n} ${Math.abs(n) === 1 ? TERM('ink') : TERM('inkPlural')}`;
  const REMOVE_PRICE = 60;
  const RELIC_PRICE = { c: 120, u: 160, r: 220, boss: 220, event: 160 };
  const RARITY_NAME = { c: 'common', u: 'uncommon', r: 'rare', l: 'legendary', junk: 'junk' };
  const TILE_NAMES = {
    empty: 'nothing here', fight: 'a fight', elite: 'an elite', treasure: 'treasure', gem: 'a gem',
    ink: `a box of ${TERM('inkPlural')}`, brush: `a ${TERM('brush')}`, event: 'something odd', shop: 'a shop', rest: 'a rest stop',
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
  const FX0 = { burst() {}, text() {}, shake() {}, flash() {}, trail() {}, update() {}, draw() {}, offset() { return { x: 0, y: 0, r: 0 }; },
    emit() {}, num() {}, badge() {}, ring() {}, slash() {}, fly(x0, y0, x1, y1, o) { if (o && o.cb) o.cb(); }, kick() {}, vignette() {}, hold() {} };
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
    if (el) { el.className = kind || ''; replay(el, 'show'); }
    // the pips and statuses share the row: fade them while the banner is up
    const pr = $('playerRow'); if (pr && pr.classList) pr.classList.add('bannerOn');
    S.bannerT = secs || 1.1;
    S.bannerStr = str;
  }
  function hint(str) { const el = $('hint'); if (el) el.textContent = str; S.hint = str; }

  // ---------------------------------------------------------------- juice helpers
  // Restart a CSS animation class on an element (remove, reflow, add).
  function replay(el, cls) {
    if (!el || !el.classList) return;
    try { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); } catch (e) { /* stub DOM */ }
  }
  // Stage coordinates of a DOM element's centre (the relic bar, the gold stat);
  // the fallback when there is no layout (headless).
  function hudPoint(el, fx0, fy0) {
    try {
      const st = $('stage');
      if (el && st && el.getBoundingClientRect && !S.headless) {
        const r = el.getBoundingClientRect(), s0 = st.getBoundingClientRect(), k = S.scale || 1;
        if (r.width > 0) return { x: (r.left + r.width / 2 - s0.left) / k, y: (r.top + r.height / 2 - s0.top) / k };
      }
    } catch (e) { /* fall through */ }
    return { x: fx0, y: fy0 };
  }
  const GOLD_HUD = { x: 208, y: 36 }, HP_HUD = { x: 118, y: 36 };
  // Build archetype chips for an item / relic def when DATA.keywords exists.
  function kwChips(def, cls) {
    const kd = D().keywords;
    if (typeof kd !== 'function' || !def) return null;
    let list = null;
    try { list = kd(def); } catch (e) { list = null; }
    if (!list || !list.length) return null;
    const row = h('div', 'kws' + (cls ? ' ' + cls : ''));
    for (const k of list) {
      if (!k) continue;
      const c = h('span', 'kw', `${k.icon || ''} ${k.label || k.id || ''}`.trim());
      if (k.color) { c.style.borderColor = k.color; c.style.color = k.color; }
      row.appendChild(c);
    }
    return row;
  }
  // A DOM label that floats up from a point on the stage and fades (gains
  // flying into the HUD counters, sale prices).
  function domFloat(x, y, str, cls) {
    if (S.headless) return;
    const st = $('stage');
    if (!st) return;
    try {
      const el = h('div', 'dfloat ' + (cls || ''), str);
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
      st.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch (e) { /* gone */ } }, 1200);
    } catch (e) { /* optional */ }
  }
  /* A DOM thing (a coin, a picked card) that flies from one stage point to
     another along an arc, then removes itself. node is the element to fly. */
  function domFly(node, x0, y0, x1, y1, ms, delay) {
    if (S.headless || !node) return;
    const st = $('stage');
    if (!st) return;
    try {
      node.classList.add('dfly');
      node.style.left = Math.round(x0) + 'px'; node.style.top = Math.round(y0) + 'px';
      st.appendChild(node);
      if (node.animate) {
        const dx = x1 - x0, dy = y1 - y0;
        node.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 80}px)) scale(0.9) rotate(12deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35) rotate(24deg)`, opacity: 0.2 },
        ], { duration: ms || 520, delay: delay || 0, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      }
      setTimeout(() => { try { node.remove(); } catch (e) { /* gone */ } }, (ms || 520) + (delay || 0) + 80);
    } catch (e) { /* optional */ }
  }
  // A few DOM coins arcing into the gold stat (shop buys, sale prices).
  function coinsTo(x0, y0, n) {
    const gp = hudPoint($('goldTxt'), GOLD_HUD.x, GOLD_HUD.y);
    for (let i = 0; i < n; i++) domFly(h('div', 'dcoin'), x0 + (i - n / 2) * 8, y0, gp.x, gp.y, 480, i * 60);
  }

  /* Time: S.slowT seconds of slow motion at S.slowK (the last enemy falling,
     a tier 3 combo). update() scales the game's dt by it; toasts and banners
     keep real time. */
  function slowmo(k, secs) {
    if (fx().reduced) { k = Math.max(k, 0.6); secs *= 0.5; }
    S.slowK = U.clamp(k, 0.05, 1); S.slowT = Math.max(S.slowT || 0, secs);
  }

  /* HUD counters roll toward their value with a tick instead of snapping.
     rollTo(id, n, force): force (and headless) snaps. A rise floats "+n" into
     the counter and bumps it. fmt formats the shown number. */
  function rollTo(id, n, force, fmt) {
    const R0 = S.rolls || (S.rolls = {});
    let r = R0[id];
    const el = $(id);
    const fresh = !r;
    if (!r) r = R0[id] = { v: n, to: n, fmt: fmt || null, el };
    r.el = el; r.fmt = fmt || r.fmt;
    if (fresh || force || S.headless || !el) { r.v = r.to = n; if (el) el.textContent = r.fmt ? r.fmt(n) : String(n); return; }
    // the top bar is hidden on the other screens: hold the change until it
    // shows again, so the roll (and the float) plays where it can be seen
    if (S.screen !== 'fight' && S.screen !== 'map') return;
    if (n === r.to) return;
    const d = n - r.to;
    r.to = n;
    if (d > 0 && id !== 'hpTxt') {
      const p = hudPoint(el, id === 'goldTxt' ? GOLD_HUD.x : 280, 36);
      domFloat(p.x, p.y + 18, '+' + d, id === 'goldTxt' ? 'gold' : 'cyan');
    }
    replay(el.parentNode, d > 0 ? 'bump' : 'dip');
  }
  function rollStep(dt) {
    const R0 = S.rolls;
    if (!R0) return;
    for (const id in R0) {
      const r = R0[id];
      if (r.v === r.to || !r.el) continue;
      const diff = r.to - r.v, step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 9));
      r.v = Math.abs(diff) <= step ? r.to : r.v + Math.sign(diff) * Math.round(step);
      r.el.textContent = r.fmt ? r.fmt(r.v) : String(r.v);
      if (S.t - (S.tickT || 0) > 0.045) { S.tickT = S.t; snd('tick', { pitch: diff > 0 ? 1.15 : 0.85 }); }
    }
  }

  /* Named grab combos stack in S.comboQ and play one after another as a big
     banner (DOM #combo). Tier 3 flashes, bursts chromatic rings, holds a
     longer hit stop and plays the top sting. */
  function queueCombo(ev) {
    S.comboQ = S.comboQ || [];
    if (S.comboQ.length < 6) S.comboQ.push(ev);
    if (!(S.comboT > 0)) nextCombo();
  }
  function nextCombo() {
    const Q = S.comboQ || [];
    const ev = Q.shift();
    const el = $('combo');
    if (!ev) { S.comboT = 0; if (el && el.classList) el.classList.remove('show'); return; }
    const tier = U.clamp(Math.round(+ev.tier || 1), 1, 3);
    S.comboT = 0.95 + tier * 0.3;
    S.lastCombo = ev;
    const nEl = $('comboName'), tEl = $('comboText');
    const name = String(ev.name || 'COMBO') + (ev.n > 1 ? ' x' + ev.n : '');
    if (nEl) {
      nEl.textContent = name;
      // fit the stage: a letter is about 0.82em with the tracking
      const fit = Math.floor(480 / (Math.max(4, name.length) * 0.82));
      try { nEl.style.fontSize = Math.min([0, 30, 38, 48][tier], fit) + 'px'; } catch (e) { /* stub */ }
    }
    if (tEl) tEl.textContent = ev.text ? String(ev.text) : '';
    if (el) {
      el.className = '';
      try { el.style.setProperty('--cc', ev.color || '#ffc94d'); } catch (e) { /* stub DOM */ }
      replay(el, 'show');
      el.classList.add('t' + tier);
    }
    snd('combo', { tier });
    haptic(tier >= 3 ? 'jackpot' : 'hit');
    const col = ev.color || PAL0.gold, cx = 270, cy = 250;
    const reduced = !!fx().reduced;
    fx().ring(cx, cy, col, { r0: 20, r1: 150 + tier * 40, w: 6 + tier * 2, life: 0.55 });
    if (tier >= 2) { fx().emit('sparks', cx, cy, { col, n: 2 }); fx().shake(4 + tier * 3); }
    if (tier >= 3) {
      if (!reduced) fx().flash('#ffffff', 0.45);
      fx().ring(cx - 6, cy, PAL0.pink, { r0: 10, r1: 300, w: 10, life: 0.7 });
      fx().ring(cx + 6, cy, PAL0.cyan, { r0: 10, r1: 300, w: 10, life: 0.7, delay: 0.04 });
      fx().ring(cx, cy + 4, PAL0.gold, { r0: 10, r1: 260, w: 8, life: 0.7, delay: 0.08 });
      fx().emit('confetti', 270, 330, { power: 1.1 });
      if (FS) FS.hitStop = Math.max(FS.hitStop, 0.16);
      slowmo(0.35, 0.35);
    }
  }
  const PAL0 = { pink: '#ff2e88', cyan: '#2ee6d6', gold: '#ffc94d', lime: '#a6ff5e', blood: '#ff5a4a' };

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
          if (o.loot && typeof o.loot === 'object') S.meta.loot = Object.assign({ caps: 0, payouts: 0 }, o.loot);
        }
      }
    } catch (e) { /* a corrupt profile is a fresh profile */ }
    if (fx()) fx().reduced = !S.meta.settings.shake;
    applyCalm();
    return S.meta;
  }
  // Shake off also calms the heavy CSS motion (html.calm).
  function applyCalm() {
    try { document.documentElement.classList[S.meta && S.meta.settings.shake ? 'remove' : 'add']('calm'); } catch (e) { /* headless */ }
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
    // A fight in progress restarts from its opening bell on load; a won
    // fight playing its outro is already the reward screen.
    if (S.screen === 'fight' && FS && FS.outro) { o.screen = 'reward'; o.sd = { reward: FS.outro.reward }; o.pendingFight = null; }
    else if (S.screen === 'fight' && FS) o.pendingFight = FS.start;
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
      // Brushes from a save made before the tools load as lanterns.
      run.brushes = (run.brushes || []).map(toolId);
      if (!run.map) { newMap(run); }
      S.run = run;
      lootRun(run);   // tickets, pity, banked capsules, highlights: defaults for older saves
      S.rolls = null;
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
      else if (sc === 'capsule' && S.sd && S.sd.capsule && S.sd.capsule.cap) showCapsule(S.sd.capsule);
      else if (sc === 'counter' && S.sd && S.sd.counter) showCounter(S.sd.counter);
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
    lootRun(run);
    S.tix = null; S.pay = null; S.cap = null;
    S.rolls = null;
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
  // somewhere is a lit walk to the boss or to a tile that hands out bulbs
  // (free on land, 2 per ford to wade), else the cheapest hex to light on
  // the frontier (1, or 2 for a ford). When the bulbs are short of that,
  // the shortfall flickers on. No tool in hand, or it would be the tool's job.
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
    toast(`A ${TERM('ink')} flickers on in a cracked cabinet. +${bulbs(n)}.`);
    return true;
  }
  function addGold(n) { const run = S.run; run.gold = Math.max(0, run.gold + n); }
  // A tool id as it is today (old brush ids load as a lantern).
  const toolId = (id) => (X.MAP && X.MAP.normalizeTool ? X.MAP.normalizeTool(id) : id);
  const toolTable = () => { const T = tbl('TOOLS'); if (Object.keys(T).length) return T; const B = tbl('BRUSHES'); if (Object.keys(B).length) return B; return (X.MAP && X.MAP.FALLBACK_TOOLS) || {}; };
  const toolDef = (id) => toolTable()[toolId(id)] || { id: toolId(id), name: String(toolId(id)), icon: '' };
  const toolIds = () => (X.MAP && X.MAP.toolIds ? X.MAP.toolIds() : Object.keys(toolTable()));
  function addBrush(id) { const run = S.run; run.brushes.push(toolId(id)); if (run.map) run.map.brushes = run.brushes.slice(); }
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
    if (D().pickRelic) { try { const id = D().pickRelic(rng, pool, S.run); if (id) return id; } catch (e) { /* fall through */ } }
    return rng.pick(pool);
  }
  function rollItems(rng, n) {
    const run = S.run;
    let ids = [];
    if (D().rewardItems) { try { ids = D().rewardItems(rng, run.act, run.char, n, run) || []; } catch (e) { ids = []; } }
    if (!ids.length) {
      const all = Object.keys(tbl('ITEMS')).filter((id) => itemDef(id).rarity !== 'junk');
      ids = rng.shuffle(all).slice(0, n);
    }
    ids.forEach(seeItem);
    return ids;
  }

  // ---------------------------------------------------------------- screens
  const SCREENS = ['intro', 'title', 'chars', 'map', 'fight', 'reward', 'shop', 'event', 'rest', 'forge', 'treasure', 'parts', 'bin', 'gameover', 'win', 'help', 'collection', 'capsule', 'counter'];
  /* Screen transitions: an iris opening onto a fight, a diagonal wipe
     between the map and the tile screens, a quick fade for the rest (DOM
     #wipe, CSS only, never blocks input). */
  const WIPE_SCREENS = { map: 1, fight: 1, reward: 1, shop: 1, event: 1, rest: 1, forge: 1, treasure: 1, parts: 1, gameover: 1, win: 1, counter: 1 };
  function transition(from, to) {
    if (S.headless || from === to || from === 'intro') return;
    const el = $('wipe');
    if (!el) return;
    const kind = to === 'fight' ? 'iris' : to === 'gameover' ? 'bleed' : (WIPE_SCREENS[from] && WIPE_SCREENS[to]) ? 'swipe' : 'fade';
    el.className = '';
    replay(el, kind);
  }
  function setScreen(name) {
    transition(S.screen, name);
    S.screen = name;
    S.ui.buttons = [];
    popover(null);
    if (name !== 'fight' && FS && FS.done) { F = null; FS = null; }
    if (name !== 'fight') {
      // fight-only juice does not follow the player out
      fx().hold(0);
      S.comboQ = []; S.comboT = 0; const ce = $('combo'); if (ce && ce.classList) ce.classList.remove('show');
    }
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
    else if (name === 'map' || name === 'shop' || name === 'event' || name === 'rest' || name === 'forge' || name === 'treasure' || name === 'parts' || name === 'reward' || name === 'capsule' || name === 'counter') music('map');
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
    row2.appendChild(btn('Shake ' + (S.meta.settings.shake ? 'on' : 'off'), () => { S.meta.settings.shake = !S.meta.settings.shake; fx().reduced = !S.meta.settings.shake; applyCalm(); saveMeta(); showTitle(); }, 'sm toggle ' + (S.meta.settings.shake ? 'on' : '')));
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
    p = h('p'); p.innerHTML = `The Clawspire is dark. <b>Tap a dark hex next to the light to light it for 1 ${TERM('ink')}</b>, or tap a far one to light the whole way there. Walking lights the ring around you (two rings from a hill), a taken tower lights everything in view, and ${TERM('brushPlural')} light for free: a flare shoots a line, a lantern rings a lit hex, a kite scouts a patch. Tap a lit hex to walk there; the road leads to the boss. Fights give loot, elites give ${TERM('inkPlural')}, the boss is at the top. Three acts, then the Prize Master.`; b.appendChild(p);
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
    const pill = h('span', 'mhInk');
    pill.appendChild(canvasEl(22, (ctx, p) => { if (X.RENDER && X.RENDER.bulb) X.RENDER.bulb(ctx, p / 2, p / 2 - 2, p * 0.3, S.t, true); }));
    pill.appendChild(h('span', null, ` ${bulbs(M ? M.ink : run.ink)}`));
    l1.appendChild(pill);
    l1.appendChild(btn('Bin', () => openBin({ mode: 'view', back: () => toMap() }), 'sm ghost'));
    const loc = btn('\u25CE', () => locate(), 'sm ghost');
    loc.title = 'Recentre on you';
    l1.appendChild(loc);
    l1.appendChild(btn('?', () => showHelp('map'), 'sm ghost'));
    l1.appendChild(btn('Quit', () => { save(); showTitle(); }, 'sm ghost'));
    head.appendChild(l1);
    const l2 = h('div', 'l2');
    // The tools in hand, one chip each (a count when there are copies).
    const counts = {};
    for (const id of run.brushes) { const k = toolId(id); counts[k] = (counts[k] || 0) + 1; }
    for (const id in counts) {
      const bd = toolDef(id);
      const chip = h('button', 'brush' + (S.brushSel === id ? ' sel' : ''), `${bd.icon || ''} ${bd.name}${counts[id] > 1 ? ' x' + counts[id] : ''}`);
      const fn = () => selectTool(S.brushSel === id ? null : id);
      chip.onclick = fn;
      S.ui.buttons.push({ el: chip, fn, label: bd.name });
      l2.appendChild(chip);
    }
    const pv = S.preview;
    const walking = S.walk && !S.walk.done;
    const kind = S.brushSel ? (X.MAP && X.MAP.toolKind ? X.MAP.toolKind(S.brushSel) : null) : null;
    const hintTxt = kind === 'line' ? (pv && pv.tool ? `Flare aimed: ${pv.cells.length} hexes. Tap that way again to fire it, or tap another direction.` : 'Flare ready: tap any hex in the direction to fire it. It lights 5 hexes in a line, stopping at mountains and water.')
      : kind === 'ring' ? 'Lantern ready: tap any lit hex to hang it there. It lights the ring around it and half of the next.'
      : kind === 'patch' ? 'Kite ready: tap any dark hex within 6 of you. It lights that hex and its ring.'
      : S.brushSel ? `${toolDef(S.brushSel).name} ready: tap a hex to use it.`
      : walking ? 'Walking. Tap the map to stop.'
      : pv ? (M.ink >= pv.cost ? `Light the way: ${bulbs(pv.cost)}. Tap that hex again to light it and walk there.` : `Light the way: ${bulbs(pv.cost)}, you have ${M.ink}. Elites, towers and boxes of ${TERM('inkPlural')} give more.`)
      : `Tap a lit hex to walk: it lights around you. Tap a dark hex to light the way there (1 ${TERM('ink')} each, fords 2). The road leads to the boss.`;
    lootMapChip(l2);   // banked capsules, waiting to be cracked
    l2.appendChild(h('div', 'hint', hintTxt));
    head.appendChild(l2);
    refreshHud(true);
  }
  // Arms a tool (its chip): the next tap uses it. null puts it away.
  function selectTool(id) {
    S.brushSel = id ? toolId(id) : null;
    if (S.preview && S.preview.tool) S.preview = null;
    if (S.screen === 'map') buildMapHead();
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
    // A tap anywhere but the previewed hex clears the preview (a flare
    // preview is by direction: a tap the same way keeps it).
    const pv = S.preview;
    const flareDir = (pv && pv.tool && t && X.MAP.dirTo) ? X.MAP.dirTo(M, M.pos, t.q, t.r) : -1;
    const samePv = !!(pv && t && (pv.tool ? (flareDir >= 0 && flareDir === pv.dir) : (pv.q === t.q && pv.r === t.r)));
    if (pv && !samePv) { S.preview = null; buildMapHead(); }
    if (!t) return false;
    // A tool in hand: the tap uses it (a flare is aimed first, fired on the
    // second tap the same way).
    if (S.brushSel && X.MAP.toolCells) {
      const id = S.brushSel, kind = X.MAP.toolKind ? X.MAP.toolKind(id) : null;
      if (kind === 'line') {
        const dir = X.MAP.dirTo(M, M.pos, t.q, t.r);
        const cells = dir >= 0 ? X.MAP.flareCells(M, dir) : [];
        if (!cells.length) { toast(dir < 0 ? 'Tap a hex in the direction to fire the flare.' : 'The flare would hit a wall of dark rock or open water at once. Aim elsewhere.'); return false; }
        if (samePv) {
          S.bloomSrc = { q: M.pos.q, r: M.pos.r };
          const tiles = X.MAP.useTool(M, id, t.q, t.r, dir) || [];
          run.brushes = M.brushes.slice();
          S.brushSel = null; S.preview = null;
          snd('brush');
          fx().burst(x, y, '#ffb347', 18);
          toast(`The flare lights ${tiles.length} ${tiles.length === 1 ? 'hex' : 'hexes'}.`);
          buildMapHead();
          save();
          return true;
        }
        S.preview = { tool: id, dir, cells, q: t.q, r: t.r, label: 'Flare' };
        snd('click');
        buildMapHead();
        return true;
      }
      if (X.MAP.canTool(M, id, t.q, t.r)) {
        S.bloomSrc = { q: t.q, r: t.r };
        const tiles = X.MAP.useTool(M, id, t.q, t.r) || [];
        run.brushes = M.brushes.slice();
        S.brushSel = null;
        snd('brush');
        fx().burst(x, y, '#ffd27a', 18);
        toast(`${toolDef(id).name}: ${tiles.length} ${tiles.length === 1 ? 'hex' : 'hexes'} lit.`);
        buildMapHead();
        save();
        return true;
      }
      if (kind === 'ring') { toast('The lantern hangs on a lit hex. Tap one.'); return false; }
      if (kind === 'patch') { toast(t.revealed ? 'The kite scouts the dark. Tap a dark hex within 6 of you.' : 'Too far for the kite: within 6 hexes of you.'); return false; }
      toast(`${toolDef(id).name} cannot be used there.`);
      return false;
    }
    if (t.terrain === 'sea') { toast('Open water. Nothing to light out there.'); return false; }
    if (t.ground === 'mountain') { toast(t.revealed ? 'A mountain. No way over it.' : 'Dark rock. Nobody climbs that; light past it or walk around.'); return false; }
    const ford = t.terrain === 'shallow';
    const tileCost = X.MAP.revealCost ? X.MAP.revealCost(t) : 1;
    if (!t.revealed) {
      if (X.MAP.canReveal(M, t.q, t.r)) {
        S.bloomSrc = { q: t.q, r: t.r };
        X.MAP.reveal(M, t.q, t.r);
        run.ink = M.ink;
        snd('reveal');
        fx().burst(x, y, '#ffd27a', 12);
        toast(ford ? `Lit a ford. ${bulbs(tileCost)}.` : `Lit: ${TILE_NAMES[t.type] || t.type}.`);
        inkRescue();
        buildMapHead();
        save();
        return true;
      }
      // Not next to the light: preview the way there, light it on a second tap.
      const path = X.MAP.pathToReveal ? X.MAP.pathToReveal(M, t.q, t.r) : [];
      if (!path.length) {
        if (M.ink < tileCost) toast(ford ? `A ford takes ${bulbs(tileCost)} to light. You have ${M.ink}.` : `No ${TERM('inkPlural')}. Elites, towers and boxes of ${TERM('inkPlural')} give more.`);
        else toast('No way through the dark to that hex.');
        if (inkRescue()) buildMapHead();
        return false;
      }
      const cost = X.MAP.pathCost ? X.MAP.pathCost(M, path) : path.length;
      if (samePv) {
        if (M.ink < cost) { toast(`That way needs ${bulbs(cost)}. ${cost - M.ink} short.`); return false; }
        S.bloomSrc = pv && pv.path && pv.path[0] ? { q: pv.path[0][0], r: pv.path[0][1] } : null;
        const tiles = X.MAP.revealPath(M, path) || [];
        run.ink = M.ink;
        S.preview = null;
        snd('reveal');
        fx().burst(x, y, '#ffd27a', 18);
        toast(`Lit ${tiles.length} hexes to ${ford ? 'a ford' : (TILE_NAMES[t.type] || t.type)}.`);
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
    // is a one-step walk (the old tap); a ford the bulbs cannot pay stops
    // the walk in front of it with its price.
    const path = X.MAP.walkPath ? X.MAP.walkPath(M, t.q, t.r) : (X.MAP.canMove(M, t.q, t.r) ? [[t.q, t.r]] : null);
    if (path) return startWalk(path);
    toast('No lit way there yet. Light the dark between.');
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
        toast(`Wading that ford takes ${bulbs(wade)}. You have ${M.ink}.`);
        if (inkRescue()) buildMapHead();
      } else toast('The way is blocked.');
      w.done = true;
      return false;
    }
    const resolves = (t.type !== 'empty' && t.type !== 'start' && !t.done) || t.terrain === 'shallow';
    w.from = { q: M.pos.q, r: M.pos.r };
    w.t = 0; w.i++;
    if (mapLayout()) { const fp = hexToStage(M.pos.q, M.pos.r); fx().emit('dust', fp.x, fp.y + 10, { power: 0.5, n: 0.7 }); }
    X.MAP.move(M, q, r);
    run.ink = M.ink;
    run.floor++;
    snd('step'); snd('footstep');
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
  // ---------------------------------------------------------------- ambient + light blooms
  /* Ambient drift: a capped pool of motes per biome (fireflies in the
     cellar, embers in the foundry, snow in the vault) over the map area, or
     over the arena band in a fight. Seeded, never Math.random. */
  const AMB_N = 30;
  const AMB_KIND = { cellar: 0, foundry: 1, vault: 2 };
  function ambientTick(dt) {
    const run = S.run;
    if (!run) return;
    const fight = S.screen === 'fight';
    const area = fight ? { x: 0, y: 72, w: W, h: 268 } : MAP_AREA;
    const biome = (run.map && run.map.biome) || ({ 1: 'cellar', 2: 'foundry', 3: 'vault' })[run.act] || 'cellar';
    const kind = AMB_KIND[biome] || 0;
    const r = S.ambR || (S.ambR = U.rng(7071));
    let A = S.amb;
    if (!A) { A = S.amb = []; for (let i = 0; i < AMB_N; i++) A.push({ x: 0, y: 0, vx: 0, vy: 0, ph: 0, life: 0 }); }
    if (S.ambKey !== kind + ':' + S.screen) { S.ambKey = kind + ':' + S.screen; for (const m of A) m.life = 0; }
    S.ambKind = kind; S.ambArea = area;
    const n = fx().reduced ? 10 : (fight ? 16 : AMB_N);
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (i >= n) { m.life = 0; continue; }
      if (m.life <= 0) {
        m.x = area.x + r() * area.w; m.ph = r() * 6.28; m.life = 4 + r() * 6;
        if (kind === 0) { m.y = area.y + r() * area.h; m.vx = (r() - 0.5) * 14; m.vy = (r() - 0.5) * 10; }
        else if (kind === 1) { m.y = area.y + area.h * (0.4 + r() * 0.6); m.vx = (r() - 0.5) * 10; m.vy = -18 - r() * 26; }
        else { m.y = area.y + r() * area.h * 0.5; m.vx = 6 + r() * 10; m.vy = 16 + r() * 22; }
        m.max = m.life;
      }
      m.life -= dt; m.ph += dt;
      m.x += (m.vx + (kind === 0 ? Math.sin(m.ph * 1.3) * 12 : kind === 2 ? Math.sin(m.ph * 2) * 8 : Math.sin(m.ph * 3) * 6)) * dt;
      m.y += (m.vy + (kind === 0 ? Math.cos(m.ph * 0.9) * 8 : 0)) * dt;
      if (m.y < area.y - 10 || m.y > area.y + area.h + 10 || m.x < area.x - 10 || m.x > area.x + area.w + 10) m.life = 0;
    }
  }
  function drawAmbient(ctx) {
    const A = S.amb, R = X.RENDER;
    if (!A) return;
    const kind = S.ambKind || 0;
    const col = kind === 0 ? '#d8ff7a' : kind === 1 ? '#ff8a2b' : '#ffffff';
    const sp = R && R.glowSprite ? R.glowSprite(col, 10) : null;
    ctx.save();
    ctx.globalCompositeOperation = kind === 2 ? 'source-over' : 'lighter';
    for (const m of A) {
      if (m.life <= 0) continue;
      const u = m.life / (m.max || 1), fade = Math.min(1, u * 3, (1 - u) * 4);
      const blink = kind === 0 ? 0.35 + 0.65 * Math.max(0, Math.sin(m.ph * 2.2)) : 1;
      ctx.globalAlpha = fade * blink * (kind === 2 ? 0.8 : 0.9);
      if (sp && kind !== 2) { try { ctx.drawImage(sp, m.x - 10, m.y - 10, 20, 20); } catch (e) { /* stub */ } }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(m.x, m.y, kind === 2 ? 1.8 : 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  /* Light blooms: a hex that has just been lit stays dark for a moment by
     its distance from where the light came from, then fades in with a gold
     ring, so a reveal ripples outward. Detected by diffing tile.revealed on
     the map screen (so a tower view lit behind the treasure screen blooms
     when the map comes back). S.bloomSrc is the source hex (a tap, a tool,
     a tower), else the player. */
  const BLOOM_STEP = 0.075, BLOOM_T = 0.5;
  function bloomTick() {
    const P = mapPaint(), M = S.run && S.run.map;
    if (!P || !M) return;
    if (!P.litInit) { for (const it of P.items) it.lit = !!it.t.revealed; P.litInit = true; return; }
    const src = S.bloomSrc || M.pos;
    const dist = X.MAP.hexDist ? (t) => X.MAP.hexDist(src.q, src.r, t.q, t.r) : () => 1;
    let n = 0, far = 0;
    for (const it of P.items) {
      if (it.lit || !it.t.revealed) continue;
      it.lit = true;
      const d = dist(it.t);
      it.bloomAt = S.t + d * BLOOM_STEP;
      if (d > far) far = d;
      n++;
    }
    if (!n) return;
    S.bloomSrc = null;
    S.chimes = [];
    for (let d = 0; d <= Math.min(far, 7); d++) S.chimes.push({ at: S.t + d * BLOOM_STEP, p: 1 + d * 0.06 });
    if (S.beamPending) { S.beam = { q: S.beamPending.q, r: S.beamPending.r, t0: S.t }; S.beamPending = null; }
  }
  function chimeTick() {
    const C = S.chimes;
    if (!C || !C.length) return;
    while (C.length && C[0].at <= S.t) { snd('bloom', { pitch: C[0].p }); C.shift(); }
  }
  // The dark cover and gold ring of a hex still blooming; true while active.
  function drawBloom(ctx, it, x, y, size, t, flat) {
    const u = (t - it.bloomAt) / BLOOM_T;
    if (u >= 1) { it.bloomAt = 0; return false; }
    const hexP = (r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (flat ? 0 : -Math.PI / 2) + i * Math.PI / 3; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); };
    ctx.save();
    if (u < 0) { ctx.fillStyle = '#0c0518'; ctx.globalAlpha = 0.92; hexP(size + 0.5); ctx.fill(); ctx.restore(); return true; }
    ctx.fillStyle = '#0c0518'; ctx.globalAlpha = 0.92 * (1 - u) * (1 - u); hexP(size + 0.5); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - u) * 0.8; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 4 * (1 - u) + 1;
    hexP(size * (0.35 + u * 0.75)); ctx.stroke();
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.35; ctx.fillStyle = '#ffe9a8'; hexP(size); ctx.fill();
    ctx.restore();
    return true;
  }
  // The tower's view: a light beam sweeping one turn around the tower.
  function drawBeam(ctx, t, size) {
    const B = S.beam;
    if (!B) return;
    const u = (t - B.t0) / 1.4;
    if (u >= 1) { S.beam = null; return; }
    const p = hexToStage(B.q, B.r), a = -Math.PI / 2 + u * Math.PI * 2, R0 = size * 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const w = 0.12 + k * 0.14;
      ctx.globalAlpha = (0.22 - k * 0.06) * Math.sin(Math.min(1, u * 1.2) * Math.PI);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, R0, a - w, a + w); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // The boss hex breathes: red rings expand from it and a dark glow pulses.
  function drawBossPulse(ctx, t, size) {
    const M = S.run && S.run.map, R = X.RENDER;
    if (!M) return;
    const p = hexToStage(M.boss.q, M.boss.r);
    if (p.x < -size * 2 || p.x > W + size * 2 || p.y < MAP_AREA.y - size * 2 || p.y > H + size * 2) return;
    ctx.save();
    const sp = R && R.glowSprite ? R.glowSprite('#ff2e30', Math.round(size * 1.6)) : null;
    const beat = 0.5 + 0.5 * Math.sin(t * 2.4);
    if (sp) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + beat * 0.3; try { ctx.drawImage(sp, p.x - size * 1.6, p.y - size * 1.6, size * 3.2, size * 3.2); } catch (e) { /* stub */ } ctx.globalCompositeOperation = 'source-over'; }
    for (let k = 0; k < 2; k++) {
      const u = ((t * 0.55 + k * 0.5) % 1);
      ctx.globalAlpha = (1 - u) * 0.7; ctx.strokeStyle = '#ff2e30'; ctx.lineWidth = 3 * (1 - u) + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, size * (0.9 + u * 1.4), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // A pickup vanishes with a poof and a badge of what it gave.
  function pickupFx(t, icon, label, col, coins) {
    if (!t || !mapLayout()) return;
    const p = hexToStage(t.q, t.r);
    fx().emit('poof', p.x, p.y);
    fx().badge(p.x, p.y - 30, icon, label, col, { life: 1.6 });
    if (coins) {
      const gp = hudPoint($('goldTxt'), GOLD_HUD.x, GOLD_HUD.y);
      for (let i = 0; i < coins; i++) fx().fly(p.x, p.y, gp.x, gp.y, { kind: 'coin', dur: 0.6, delay: 0.1 + i * 0.07, arc: 80, size: 6, cb: () => snd('coin', { pitch: 1 + i * 0.05 }) });
    }
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
        // Loot: a treasure is a capsule (a relic whenever one is in stock,
        // its rarity set by the capsule's tier), cracked open on the spot.
        if (D().rollCapsule) { showCapsule({ cap: makeCapsule('treasure', { prefer: 'relic' }), gold: c.gold || 0, then: { k: 'map' } }); return; }
        const id = rollRelic(rngFor('treasure'), ['c', 'u', 'r']);
        showTreasure({ relic: id, gold: c.gold || 0, title: 'Treasure' });
        return;
      }
      case 'gem': {
        finish();
        const g = c.gold || 10;
        addGold(g);
        snd('coin');
        pickupFx(t, '\u25C6', `+${g} gold`, '#ffc94d', 4);
        toast(`A gem. +${g} gold.`);
        break;
      }
      case 'ink': {
        finish();
        const n = Math.max(c.ink || 1, ECON().inkTile || 1);
        addInk(n);
        snd('reveal');
        pickupFx(t, '\u2600', `+${bulbs(n)}`, '#2ee6d6');
        toast(`A box of ${TERM('inkPlural')}. +${bulbs(n)}.`);
        buildMapHead();
        break;
      }
      case 'brush': {
        finish();
        const id = toolId(c.brush || (toolIds()[0] || 'lantern'));
        addBrush(id);
        snd('brush');
        pickupFx(t, toolDef(id).icon || '*', toolDef(id).name, '#ffb347');
        toast(`Found a ${TERM('brush')}: ${toolDef(id).name}.`);
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
          toast(`You wade the ford. ${bulbs(wade)}, and cold to the knees.`);
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
      // juice: hp ghosts, status chip pops, item throws, cabinet party lights, claw spring
      ghost: {}, pipPop: {}, throws: [], party: 0, marquee: '', curDef: null, outro: null,
      claw: { px: 0, py: 0, vx: 0, bend: 0, bendV: 0, sq: 0, glow: 0, mood: '', moodT: 0, chase: 0, blinkT: 2.5 }, cargo: [], hbT: 0, dust: 0,
      // cabinet materials and toys: per-uid material state (cracks, melt, a lit
      // fuse), glass debris, the Golden Prize, the Lucky Claw, near misses
      mst: {}, debris: [], kill: [], golden: null, lucky: 0, luckyOn: false, grabN: 0, relCargo: [], impN: 0, ambI: 0, beepT: 0, freeN: 0,
    };
    syncShown();
    S.procs = {};
    // the enemies pop in as the iris opens
    F.enemies.forEach((e, i) => { FS.anim[i] = { hurt: 0, attack: 0, dead: 0, spawn: 1 }; });
    S.pendingFight = null;
    buildWorld();
    spawnAll();
    pickGolden();
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
    FS.debris = [];
  }
  function buildRig() {
    const P = X.PHYS;
    const c = clawFor();
    const b = FS.cabinet.bounds;
    FS.rig = P.clawRig(FS.world, {
      cabinet: FS.cabinet, homeX: (b.chuteX || CAB.w - CAB.chuteW) * 0.5, chuteX: (b.chuteX || CAB.w - CAB.chuteW) + CAB.chuteW * 0.5,
      railY: 26, prongs: c.prongs, width: c.width, grip: c.grip + (FS.luckyOn ? MAT.luckyGrip : 0), speed: c.speed, rubber: c.rubber, magnet: c.magnet, grease: FS.grease > 0 ? 1 : 0,
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
    let shape = shapeFor(def, inst);
    // a melting frost item is smaller (see meltTick)
    const ms = FS.mst[inst.uid];
    if (ms && ms.melt < 1 && !inst.frozen && X.PHYS.scaleShape) shape = X.PHYS.scaleShape(shape, ms.melt);
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
    // the material's physics (magic floats, ice slides, rubber bounces) and its look
    const mat = !inst.frozen && X.PHYS.materialOf ? X.PHYS.materialOf(def) : null;
    if (mat && X.PHYS.applyMaterial) X.PHYS.applyMaterial(b, mat);
    matInit(b, mat);
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

  // ---------------------------------------------------------------- cabinet materials
  // Every item has a physical personality from its tags (PHYS.materialOf):
  // metal clanks and sparks, glass cracks (and shatters on a second hard
  // landing), heavy things thud and make the pile hop, rubber boings, food
  // squishes and drops crumbs, potions slosh, magic floats and glitters,
  // bombs light their fuse on a rough landing, ice slides and melts. It is
  // all driven by each body's impact per frame (matBody) and the start of
  // the player's turn (matTurn). Fight-only state lives in FS.mst by uid, so
  // nothing here reaches COMBAT's insts or the save.
  function mstOf(inst) {
    const k = inst && inst.uid;
    if (!k) return { crack: 0, melt: 1, lit: 0 };
    return FS.mst[k] || (FS.mst[k] = { crack: 0, melt: 1, lit: 0 });
  }
  // Per-body material state on body.data (a respawn starts it fresh).
  function matInit(b, mat) {
    const d = b.data;
    d.mat = mat; d.age = 0; d.cd = 0; d.crackCd = 0; d.sl = 0; d.slV = 0; d.wob = 0; d.wobV = 0; d.pvx = null; d.clawG = -1;
    d.seed = (Math.abs(U.hashStr(String(d.inst.uid))) % 997) / 97;
  }
  // A real bomb can light its fuse; a monster's lit junk bomb keeps its own (COMBAT's) fuse.
  function fuseOk(b) {
    const d = b.data;
    return !!(d.mat && d.mat.traits.fuse && d.def.rarity !== 'junk' && !d.inst.junk && !d.inst.frozen);
  }
  // Take an instance out of the bin for the fight (used: it comes back with a refill; exhausted: gone).
  function binMove(inst, to) {
    if (!F || !inst) return;
    const i = F.bin.indexOf(inst);
    if (i >= 0) F.bin.splice(i, 1);
    (to === 'used' ? F.used : F.exhausted).push(inst);
    delete FS.mst[inst.uid];
    if (FS.golden && FS.golden.uid === inst.uid) FS.golden = null;
    if (F.phase === 'player' && !F.bin.length && X.COMBAT.refill) enqueue(X.COMBAT.refill(F), PLAY_BEAT);
  }
  const TIP = { x: 0, y: 0 };
  // Stage point of a bomb's fuse tip (the bomb art's spark, local (0.4r, 4 - r)).
  function fuseTip(b) {
    const sh = b.data.def.shape || {}, r0 = sh.kind === 'circle' ? sh.r : 14;
    const lx = r0 * 0.4, ly = -r0 + 4, ca = Math.cos(b.a), sa = Math.sin(b.a);
    TIP.x = CAB.x + b.x + lx * ca - ly * sa; TIP.y = CAB.y + b.y + lx * sa + ly * ca;
    return TIP;
  }
  function setMood(m, secs) { if (!FS) return; FS.claw.mood = m; FS.claw.moodT = secs || 1.2; }

  /* One body's material reactions this frame. Called from updateFight right
     after the physics step, before d.pvy is overwritten. */
  function matBody(b, dt) {
    const d = b.data, m = d.mat;
    const pvx = d.pvx == null ? b.vx : d.pvx, pvy = d.pvy == null ? b.vy : d.pvy;
    d.pvx = b.vx;
    if (b.held > 0) d.clawG = FS.grabN;
    if (!m) return;
    d.age += dt;
    if (d.cd > 0) d.cd -= dt;
    if (d.crackCd > 0) d.crackCd -= dt;
    const T = m.traits, br = b.br || 12;
    const dvx = b.vx - pvx, dvy = b.vy - pvy - GRAVITY * b.gs * dt;
    // potions: the liquid lags behind a sideways jolt and springs back
    if (T.liquid) {
      d.slV -= dvx * 0.012;
      d.slV += (-d.sl * 70 - d.slV * 5) * dt;
      d.sl = U.clamp(d.sl + d.slV * dt, -0.8, 0.8);
    }
    // food: a squish wobbles out
    if (d.wob || d.wobV) {
      d.wobV += (-d.wob * 260 - d.wobV * 8) * dt;
      d.wob = U.clamp(d.wob + d.wobV * dt, -0.5, 0.5);
      if (Math.abs(d.wob) < 0.003 && Math.abs(d.wobV) < 0.03) d.wob = d.wobV = 0;
    }
    // ice leaves a frosty trail while it slides along the floor
    if (T.frost && (FS.frameN % 3) === 0 && Math.abs(b.vx) > 70 && b.y > CAB.h - br - 12) {
      fx().burst(CAB.x + b.x - Math.sign(b.vx) * br * 0.6, CAB.y + b.y + br * 0.7, '#e8f8ff', 1, { kind: 'snow', speed: 12, size: 2.6, life: 0.8, gravity: 0, drag: 0.9 });
    }
    const imp = Math.hypot(dvx, dvy);
    if (imp < MAT.softV || d.cd > 0 || FS.impN >= 4) return;
    FS.impN++;
    d.cd = 0.12;
    const armed = d.age > MAT.armT;
    const sx = CAB.x + b.x, sy = CAB.y + b.y;
    const nx = dvx / imp, ny = dvy / imp;                     // the push it got: away from what it hit
    const px = sx - nx * br * 0.8, py = sy - ny * br * 0.8;   // about where it hit
    const vel = U.clamp(imp / 700, 0.2, 1.4);
    // two items knocking together hard: impact stars and a tiny camera kick
    if (armed && imp > MAT.starV && FS.world.contactsOf) {
      for (const c of FS.world.contactsOf(b)) {
        if (!c.other || !c.other.data || !c.other.data.inst) continue;
        const cx = CAB.x + c.px, cy = CAB.y + c.py;
        fx().burst(cx, cy, '#fff6c0', fx().reduced ? 2 : 5, { kind: 'star', speed: 150 * vel, size: 4, life: 0.35, gravity: 0, drag: 0.88 });
        fx().ring(cx, cy, '#fff6c0', { r0: 3, r1: 16 + vel * 12, w: 2.5, life: 0.2 });
        fx().kick(nx * 2 * vel, ny * 2 * vel);
        break;
      }
    }
    if (T.metal && imp > MAT.sparkV) {
      fx().emit('sparks', px, py, { dir: Math.atan2(ny, nx), spread: 1.7, n: 0.3 + vel * 0.5, power: 0.6 + vel * 0.5 });
      snd('clank', { vel, pitch: T.heavy ? 0.7 : T.small ? 1.45 : 1 });
    }
    if (T.heavy && armed && imp > MAT.thudV) {
      // the floor jumps: neighbours hop, dust, a downward camera kick
      const k = U.clamp((imp - MAT.thudV) / 500 + 0.55, 0.55, 1.2);
      const hopped = X.PHYS.hop ? X.PHYS.hop(FS.world, b.x, b.y + br * 0.5, MAT.hopR * k, MAT.hopV * k, b) : [];
      fx().emit('dust', sx, sy + br * 0.6, { power: 1 + k * 0.6, n: 1.2 });
      fx().kick(0, 3 * k); fx().shake(1.2 + 2 * k);
      snd('thud', { vel });
      haptic('tap');
      // stacked metal rattles
      let rattle = 0;
      for (const o of hopped) {
        if (rattle >= 3 || !o.data || !o.data.mat || !o.data.mat.traits.metal) continue;
        rattle++;
        fx().emit('sparks', CAB.x + o.x, CAB.y + o.y + (o.br || 10) * 0.6, { n: 0.25, power: 0.5 });
      }
      if (rattle) snd('clank', { vel: 0.35, pitch: 1.6 });
    }
    if (T.glass) {
      if (armed && imp > MAT.crackV && !(d.crackCd > 0)) crack(b);
      else snd('tinkle', { vel, pitch: T.small ? 1.3 : 1 });
    }
    if (T.fuse && armed && imp > MAT.fuseV && fuseOk(b)) lightFuse(b);
    if (T.rubber) { d.sq = Math.max(d.sq || 0, U.clamp(imp / 700, 0.25, 0.9)); snd('boing', { vel, pitch: 0.8 + vel * 0.4 }); }
    if (T.food) {
      d.wobV -= U.clamp(imp / 90, 1.5, 7);
      fx().emit('crumbs', px, py, { col: d.def.color, n: 0.35 + vel * 0.6, power: 0.6 + vel * 0.5 });
      snd('squish', { vel });
    }
    if (T.liquid) {
      d.slV += (nx >= 0 ? -1 : 1) * vel * 3;
      fx().emit('poison', sx, sy - br * 0.3, { col: d.def.color, n: 0.25 });
      snd('slosh', { vel });
    }
    if (T.magic) {
      fx().burst(sx, sy, d.def.color || '#ffffff', fx().reduced ? 1 : 3, { kind: 'star', speed: 60, size: 3.5, life: 0.5, gravity: -40, drag: 0.92 });
      snd('chime', { vel, pitch: 0.9 + (d.seed % 1) * 0.3 });
    }
    if (T.frost && imp > 220) { fx().emit('frost', px, py, { n: 0.3 }); snd('tinkle', { vel, pitch: 1.35 }); }
  }

  /* Once a frame after the bodies: glass debris swept out by the chute, lit
     fuses fizzing and beeping, and one ambient touch (round robin, so the
     cost stays flat): embers off fire, bubbles off poison, motes off magic,
     sparkles off the Golden Prize. */
  function matFrame(dt) {
    FS.impN = 0;
    const red = !!fx().reduced;
    while (FS.kill.length) { const b = FS.kill.pop(); if (b.world && FS.items.indexOf(b) >= 0) shatterInBin(b); }
    for (let i = FS.debris.length - 1; i >= 0; i--) {
      const s = FS.debris[i];
      if (s.world !== FS.world) { FS.debris.splice(i, 1); continue; }
      if (FS.cabinet && FS.cabinet.inChute(s) && s.y > FS.cabinet.bounds.dividerTop + 10) {
        FS.world.remove(s); FS.debris.splice(i, 1);
        fx().emit('glint', CAB.x + s.x, CAB.y + s.y, { col: '#bfe8ff' });
        snd('tinkle', { vel: 0.3, pitch: 1.6 });
      }
    }
    FS.beepT -= dt;
    let lit = 0, urgent = 0;
    for (const b of FS.items) {
      const ms = FS.mst[b.data.inst.uid];
      if (!ms || !(ms.lit > 0)) continue;
      lit++; if (ms.lit === 1) urgent++;
      if ((FS.frameN % (red ? 6 : 2)) === 0) {
        const tip = fuseTip(b);
        fx().burst(tip.x, tip.y, '#ffe066', 1, { kind: 'spark', speed: 130, size: 2, life: 0.25, gravity: 300, drag: 0.92, dir: -Math.PI / 2, spread: 2.2 });
      }
    }
    if (lit && FS.beepT <= 0) { snd('beep', { pitch: urgent ? 1.3 : 1 }); FS.beepT = urgent ? 0.55 : 1.2; }
    if (FS.golden && (FS.frameN % (red ? 9 : 3)) === 0) {
      for (const b of FS.items) {
        if (b.data.inst.uid !== FS.golden.uid) continue;
        const r = (b.br || 12), a = FS.frameN * 0.7;
        fx().burst(CAB.x + b.x + Math.cos(a) * r, CAB.y + b.y + Math.sin(a) * r * 0.8, '#ffc94d', 1, { kind: 'star', speed: 25, size: 3.2, life: 0.55, gravity: -30, drag: 0.9 });
        break;
      }
    }
    const n = FS.items.length;
    if (!n || (FS.frameN % (red ? 4 : 1)) !== 0) return;
    FS.ambI = (FS.ambI + 1) % n;
    const b = FS.items[FS.ambI], d = b.data, T = d.mat && d.mat.traits;
    if (!T || b.held > 0) return;
    const sx = CAB.x + b.x, sy = CAB.y + b.y - (b.br || 12) * 0.5;
    if (T.fire) fx().burst(sx, sy, '#ff8a2b', 1, { kind: 'ember', cols: ['#ff8a2b', '#ffe066'], speed: 40, size: 2.6, life: 0.8, gravity: -90, drag: 0.95, dir: -Math.PI / 2, spread: 0.8 });
    else if (T.poison) fx().burst(sx, sy, '#a6ff5e', 1, { kind: 'bubble', speed: 25, size: 3, life: 0.8, gravity: -60, drag: 0.95, dir: -Math.PI / 2, spread: 0.6 });
    else if (T.magic) fx().burst(sx, sy, d.def.color || '#ffffff', 1, { kind: 'star', speed: 20, size: 2.6, life: 0.7, gravity: -30, drag: 0.95 });
  }

  // Glass cracks: the first time a crack line, the second it shatters in the bin.
  function crack(b) {
    const d = b.data, ms = mstOf(d.inst);
    ms.crack++;
    d.crackCd = 0.5;
    // the second crack shatters it (after the body loop, which must not lose its place)
    if (ms.crack >= 2) { if (FS.kill.indexOf(b) < 0) FS.kill.push(b); return; }
    const sx = CAB.x + b.x, sy = CAB.y + b.y;
    fx().emit('shatter', sx, sy, { col: '#ffffff', n: 0.25 });
    fx().ring(sx, sy, '#e8f8ff', { r0: 4, r1: 32, w: 2.5, life: 0.25 });
    fx().text(sx, sy - 24, 'CRACK! +50%', '#bfe8ff', { size: 15, life: 0.9, dy: -36 });
    snd('crack');
  }
  function shatterInBin(b) {
    const d = b.data, inst = d.inst, def = d.def;
    const x = b.x, y = b.y, sx = CAB.x + x, sy = CAB.y + y;
    removeBody(b);
    binMove(inst, 'exhausted');
    fx().emit('shatter', sx, sy, { col: def.color || '#bfe8ff' });
    fx().ring(sx, sy, '#ffffff', { r0: 6, r1: 50, w: 4, life: 0.3 });
    fx().text(sx, sy - 26, 'SHATTERED', '#ff5a4a', { size: 17, life: 1, dy: -40 });
    fx().shake(3);
    snd('shatter');
    spawnShards(x, y, def.color, MAT.shardN);
  }
  // Glass shards: little physical fillers that clutter the bin (the chute sweeps them out).
  function spawnShards(x, y, col, n) {
    if (!FS.world || !X.PHYS) return;
    const r = FS.rng;
    for (let i = 0; i < n; i++) {
      while (FS.debris.length >= MAT.debrisMax) { const old = FS.debris.shift(); if (old.world) FS.world.remove(old); }
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4, v = 180 + r() * 220;
      const s = X.PHYS.body({ type: 'dynamic', shape: { kind: 'circle', r: 4 + r() * 1.5 }, x: x + (r() - 0.5) * 10, y: Math.min(y, CAB.h - 8), angle: r() * 6.28,
        density: 0.8, friction: 0.35, restitution: 0.2, group: 'debris', data: { debris: true, col: col || '#bfe8ff' } });
      s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.av = (r() - 0.5) * 20;
      FS.world.add(s);
      FS.debris.push(s);
    }
  }
  function lightFuse(b) {
    const ms = mstOf(b.data.inst);
    if (ms.lit > 0) return;
    ms.lit = MAT.fuseTurns;
    const tip = fuseTip(b);
    fx().emit('sparks', tip.x, tip.y, { n: 1, col: '#ffe066' });
    fx().ring(tip.x, tip.y, '#ff8a2b', { r0: 3, r1: 26, w: 3, life: 0.3 });
    fx().text(CAB.x + b.x, CAB.y + b.y - 30, 'FUSE LIT!', '#ff8a2b', { size: 17, life: 1.2, dy: -40 });
    snd('fuse');
    toast('A bomb is lit! Grab it within ' + MAT.fuseTurns + ' turns or it goes off in the bin.', 2.4);
  }
  // A bomb going off in the bin: everything nearby is thrown about (maybe
  // over the divider: a free prize), and the blast reaches the arena.
  function explode(b) {
    const d = b.data, inst = d.inst;
    const x = b.x, y = b.y, sx = CAB.x + x, sy = CAB.y + y;
    removeBody(b);
    binMove(inst, 'used');
    if (X.PHYS.blast) X.PHYS.blast(FS.world, x, y, MAT.blastR, MAT.blastV);
    fx().emit('blast', sx, sy, { power: 1 });
    fx().ring(sx, sy, '#ffe066', { r0: 10, r1: MAT.blastR + 30, w: 10, life: 0.4 });
    fx().ring(sx, sy, '#ff5a4a', { r0: 6, r1: MAT.blastR, w: 6, life: 0.5, delay: 0.06 });
    fx().ring(270, 200, '#ff8a2b', { r0: 20, r1: 260, w: 8, life: 0.5, delay: 0.12 });
    if (!fx().reduced) fx().flash('#ff8a2b', 0.35);
    fx().shake(14); fx().kick(0, 6);
    fx().text(sx, sy - 30, 'KABOOM!', '#ffc94d', { size: 28, life: 1.2, dy: -56 });
    snd('boom'); haptic('hurt');
    setMood('wow', 1.4);
    const dmg = MAT.blastDmg + 2 * Math.max(0, ((S.run && S.run.act) || 1) - 1) + (inst.plus ? 2 : 0);
    if (F.phase === 'player' && X.COMBAT.damage) for (const e of F.enemies) if (e.alive) X.COMBAT.damage(F, null, e, dmg, { fixed: true });
    enqueue([], PLAY_BEAT);
    FS.dirty = true;
  }
  // Start of the player's turn: lit fuses burn down (and go off), ice melts.
  function fuseTick() {
    for (const b of FS.items.slice()) {
      const inst = b.data.inst, ms = FS.mst[inst.uid];
      if (!ms || !(ms.lit > 0)) continue;
      const sx = CAB.x + b.x, sy = CAB.y + b.y;
      if (inst.frozen) { ms.lit = 0; fx().text(sx, sy - 26, 'FIZZLE', '#9fd8ff', { size: 15 }); fx().emit('smoke', sx, sy - 10, { n: 0.4 }); continue; }
      ms.lit--;
      if (ms.lit <= 0) explode(b);
      else { fx().text(sx, sy - 30, 'LAST TURN!', '#ff5a4a', { size: 16, life: 1.2, dy: -40 }); snd('beep', { pitch: 1.3 }); }
    }
  }
  function meltTick() {
    for (const b of FS.items.slice()) {
      const d = b.data, inst = d.inst;
      if (!d.mat || !d.mat.traits.frost || inst.frozen) continue;
      const ms = mstOf(inst), junk = d.def.rarity === 'junk' || !!inst.junk;
      const was = ms.melt;
      ms.melt = junk ? ms.melt * MAT.iceMelt : Math.max(MAT.meltMin, ms.melt * MAT.meltK);
      const sx = CAB.x + b.x, sy = CAB.y + b.y;
      if (junk && ms.melt < MAT.iceGone) {
        // a junk ice block melts away to nothing
        removeBody(b);
        binMove(inst, 'exhausted');
        fx().emit('frost', sx, sy, { n: 0.8 });
        fx().burst(sx, sy + 8, '#9fd8ff', fx().reduced ? 3 : 8, { kind: 'bubble', speed: 90, size: 3, life: 0.5, gravity: 500 });
        fx().text(sx, sy - 22, 'MELTED', '#9fd8ff', { size: 15 });
        snd('slosh', { vel: 0.6 });
        continue;
      }
      if (ms.melt < was - 1e-3) {
        swapBody(inst);
        fx().burst(sx, sy + 6, '#9fd8ff', fx().reduced ? 1 : 3, { kind: 'bubble', speed: 40, size: 2.5, life: 0.5, gravity: 500 });
      }
    }
  }
  function matTurn() {
    if (!F || !FS || FS.done || F.phase !== 'player') return;
    meltTick();
    fuseTick();
  }

  // ---- cabinet toys
  // The Golden Prize: some fights one bin item shimmers gold and is upgraded
  // for this fight (F's insts are copies, the run's item is untouched).
  // Grabbing it plays a fanfare (and pays gold if it was upgraded already).
  function pickGolden() {
    if (!F || !FS) return;
    const r = U.rng((FS.seed ^ 0x9e3779b9) >>> 0);
    if (r() >= MAT.goldenP) return;
    const pool = F.bin.filter((i) => !i.junk && !i.frozen && itemDef(i.id).rarity !== 'junk');
    if (!pool.length) return;
    const inst = pool[Math.floor(r() * pool.length)];
    FS.golden = { uid: inst.uid, was: !!inst.plus };
    inst.plus = true;
  }
  function goldenPrize(pos) {
    const g = FS.golden;
    FS.golden = null;
    fx().text(CAB.x + CAB.w * 0.45, CAB.y + CAB.h * 0.42, 'GOLDEN PRIZE!', '#ffc94d', { size: 26, life: 1.5, dy: -60 });
    fx().emit('coins', pos.x - 10, pos.y - 20, { n: 1, power: 1.1, dir: -Math.PI / 2 - 0.35 });
    fx().emit('confetti', pos.x - 20, pos.y - 20, { n: 0.6, power: 0.8, dir: -Math.PI / 2 - 0.4 });
    fx().ring(pos.x, pos.y, '#ffc94d', { r0: 10, r1: 90, w: 7, life: 0.5 });
    if (!fx().reduced) fx().flash('#ffc94d', 0.22);
    snd('fanfare');
    FS.party = Math.max(FS.party, 1.2); FS.marquee = 'GOLDEN!';
    setMood('wow', 1.6);
    if (g && g.was && X.COMBAT.gainGold) { X.COMBAT.gainGold(F, MAT.goldenGold); enqueue([], PLAY_BEAT); }
  }
  // A prize the claw never touched this grab (shaken, blasted or knocked in).
  function freePrize(x, y) {
    FS.freeN++;
    fx().text(x - 70, y, 'FREE PRIZE!', '#a6ff5e', { size: 19, life: 1.2, dy: -50 });
    fx().emit('confetti', x - 20, y + 60, { n: 0.4, power: 0.7, dir: -Math.PI / 2 - 0.4 });
    fx().ring(x, y + 70, '#a6ff5e', { r0: 8, r1: 64, w: 5 });
    snd('fanfare', { pitch: 1.25, vol: 0.7 });
    FS.party = Math.max(FS.party, 0.6); FS.marquee = 'FREE PRIZE!';
  }
  // So close: a prize that nearly made the chute. Once a grab.
  function soClose(x, y) {
    if (FS.closeG === FS.grabN) return;
    FS.closeG = FS.grabN;
    fx().text(x, y - 30, 'SO CLOSE!', '#ff9ad0', { size: 20, life: 1.3, dy: -46 });
    fx().ring(x, y, '#ff9ad0', { r0: 6, r1: 44, w: 4, life: 0.35 });
    snd('groan');
    setMood('sad', 1.8);
  }
  // Lucky Claw: two grabs in a row that deliver make the next one grip harder.
  function luckAfterGrab() {
    if (FS.luckyOn) {
      FS.luckyOn = false; FS.lucky = 0;
      if (FS.rig) FS.rig.setConfig({ grip: clawFor().grip });
      if (FS.claw.mood === 'lucky') FS.claw.moodT = 0.01;
      return;
    }
    if (FS.delivered > 0) FS.lucky++;
    else FS.lucky = 0;
    if (FS.lucky < MAT.luckyAfter) return;
    FS.lucky = 0; FS.luckyOn = true;
    if (FS.rig) FS.rig.setConfig({ grip: clawFor().grip + MAT.luckyGrip });
    const rig = FS.rig, x = CAB.x + (rig ? rig.x : 200), y = CAB.y + (rig ? rig.y : 40);
    fx().text(x, y + 120, 'LUCKY CLAW!', '#ffc94d', { size: 20, life: 1.3, dy: -24 });
    fx().burst(x, y + 20, '#ffc94d', fx().reduced ? 4 : 12, { kind: 'star', speed: 180, size: 4.5, life: 0.6, gravity: 150 });
    fx().ring(x, y + 20, '#ffc94d', { r0: 6, r1: 60, w: 5 });
    snd('lucky');
    setMood('lucky', 1.6);
  }
  // After a grab: a prize the claw let go of over the chute that still ended up in the bin was a near miss.
  function nearMissAfterGrab() {
    const lim = FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW;
    for (const b of FS.relCargo) if (FS.items.indexOf(b) >= 0 && b.x < lim) { soClose(CAB.x + b.x, CAB.y + b.y); break; }
    FS.relCargo = [];
  }

  // Displayed hp/block lag the engine: COMBAT resolves a whole turn at once,
  // the HUD and hp bars only move as each event plays on its beat.
  function syncShown() {
    if (!F || !FS) return;
    FS.shown.p.hp = F.player.hp; FS.shown.p.block = F.player.block;
    F.enemies.forEach((e, i) => { FS.shown.e[i] = { hp: e.hp, block: e.block }; if (!FS.ghost[i]) FS.ghost[i] = { v: e.hp, hold: 0 }; });
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
  // The ghost chunk of an enemy hp bar: it holds, then drains to the real hp.
  function ghostOf(idx) {
    const g = FS.ghost[idx] || (FS.ghost[idx] = { v: FS.shown.e[idx] ? FS.shown.e[idx].hp : 0, hold: 0 });
    return g;
  }
  // Player-side floating text: left of the turn banner, above the cabinet.
  const PLAYER_FX = { x: 110, y: 386 };
  function nextActor() {
    const list = FS.actors;
    let i = list.indexOf(FS.actor);
    FS.actor = i + 1 < list.length ? list[i + 1] : -1;
  }
  // Element burst for a status id (the look of the thing landing).
  const STATUS_FX = { poison: 'poison', burn: 'burn', chill: 'frost', freeze: 'frost', stun: 'shock', bleed: 'blood', weak: 'smoke', vuln: 'sparks', str: 'burn', enrage: 'burn', regen: 'heal', thorns: 'sparks', dodge: 'glint', armor: 'block', shield_up: 'block', streak: 'glint' };
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
    const hitX = enemy ? base.x : PLAYER_FX.x, hitY = enemy ? base.y - base.h * 0.5 : PLAYER_FX.y;
    const reduced = !!fx().reduced;
    switch (ev.t) {
      case 'dmg': {
        const big = ev.amt >= 10;
        if (enemy) {
          const e = F.enemies[ev.idx], a = anim(ev.idx);
          // a crushing hit: a fifth of its max hp in one go (or the engine says crit)
          const crit = !!ev.crit || (ev.amt > 0 && e && ev.amt >= e.maxHp * 0.2);
          if (ev.amt > 0) {
            fx().num(pos.x, pos.y, '\u2212' + ev.amt, crit ? '#ffc94d' : '#ffffff', { crit });
            if (crit) fx().text(pos.x, pos.y - 44, 'CRUSH!', '#ff2e88', { size: 18, life: 0.8, dy: -30 });
            a.hurt = 1; a.knock = crit ? 1.6 : 1; a.barFlash = 1; a.barShake = 1;
            const g = ghostOf(ev.idx); g.hold = 0.45;
            fx().emit(crit ? 'crit' : 'hit', hitX, hitY, { power: crit ? 1.2 : 1 });
            fx().ring(hitX, hitY, crit ? '#ffc94d' : '#ffffff', { r0: 8, r1: crit ? 95 : 55 + Math.min(30, ev.amt * 2), w: crit ? 8 : 5, life: crit ? 0.5 : 0.35 });
            // weapons slash, everything else just lands
            const pd = FS.curDef;
            if (pd && (pd.tags || []).indexOf('weapon') >= 0) fx().slash(hitX, hitY, -0.5 + (FS.fxN % 2) * 1.0 + Math.PI * 0.5, Math.max(70, base.w * 0.9), crit ? '#ffc94d' : '#ff2e88', { w: crit ? 18 : 13 });
            fx().shake(U.clamp(2 + ev.amt * 0.45, 2, 12) + (crit ? 5 : 0));
            if (crit) { FS.hitStop = Math.max(FS.hitStop, 0.11); snd('crit'); haptic('hurt'); if (!reduced) fx().flash('#ffffff', 0.18); }
            else { snd(big ? 'hitBig' : 'hit', { amt: ev.amt }); if (big) FS.hitStop = Math.max(FS.hitStop, HIT_STOP); }
          } else fx().text(pos.x, pos.y, ev.blocked ? 'BLOCKED' : '0', '#b3a4d6');
          if (ev.blocked > 0) { fx().emit('block', hitX, hitY - 10, { col: '#8fb6ff', n: U.clamp(ev.blocked / 5, 0.5, 2) }); if (!(ev.amt > 0)) snd('block'); }
        } else {
          if (FS.enemyTurn && FS.actor >= 0) {
            const aa = anim(FS.actor);
            aa.attack = 1; aa.wind = 0; aa.windV = 0;
            FS.killer = (F.enemies[FS.actor] && F.enemies[FS.actor].def.name) || FS.killer;
          }
          if (ev.amt > 0) {
            const crushing = ev.amt >= F.player.maxHp * 0.15;
            fx().num(pos.x, pos.y, '\u2212' + ev.amt, '#ff5a4a', { crit: crushing });
            fx().shake(U.clamp(4 + ev.amt * 0.7, 4, 18));
            fx().vignette('#ff2e30', U.clamp(0.35 + ev.amt / 25, 0.35, 0.9));
            if (big || crushing) {
              // a red claw mark across the screen
              fx().slash(270, 230, 0.55, 460, '#ff2e30', { w: 24, life: 0.45, claw: true });
              FS.hitStop = Math.max(FS.hitStop, HIT_STOP * 1.5);
              if (!reduced) fx().flash('#ff5a4a', 0.3);
            }
            fx().emit('blood', PLAYER_FX.x, PLAYER_FX.y, { n: U.clamp(ev.amt / 8, 0.5, 2) });
            S.hudHit = 1; replay($('hpStat'), 'hit');
            snd('playerHurt'); haptic('hurt');
          } else {
            fx().text(pos.x, pos.y, ev.blocked ? 'BLOCKED' : 'MISS', '#2ee6d6');
            if (ev.blocked) snd('block');
          }
          if (ev.blocked > 0) {
            // block soaked it: shield chips fly off and a clank ring
            fx().emit('block', PLAYER_FX.x, PLAYER_FX.y, { n: U.clamp(ev.blocked / 4, 0.6, 2.2), dir: -Math.PI / 2 });
            fx().ring(PLAYER_FX.x, PLAYER_FX.y, '#2ee6d6', { r0: 12, r1: 70, w: 5 });
            replay($('hpStat'), 'clank');
          }
        }
        break;
      }
      case 'block': {
        fx().text(pos.x, pos.y, '+' + ev.amt + ' block', '#2ee6d6');
        fx().ring(hitX, hitY, '#2ee6d6', { r0: 10, r1: 58, w: 5, life: 0.4 });
        fx().emit('glint', hitX, hitY, { col: '#bfe8ff' });
        if (!enemy) replay($('hpStat'), 'shield');
        snd('block');
        break;
      }
      case 'heal': {
        fx().num(pos.x, pos.y, '+' + ev.amt, '#a6ff5e', { vy: -220, gravity: 300 });
        fx().emit('heal', hitX, hitY + 10);
        if (!enemy) replay($('hpStat'), 'heal');
        snd('heal');
        break;
      }
      case 'status': {
        const sd = tbl('STATUS')[ev.s] || { name: ev.s, icon: '', color: '#fff' };
        fx().text(pos.x, pos.y, (ev.v > 0 ? '+' : '') + ev.v + ' ' + (sd.icon || '') + sd.name, sd.color || '#fff');
        if (ev.v > 0 && STATUS_FX[ev.s]) fx().emit(STATUS_FX[ev.s], hitX, hitY, { col: STATUS_FX[ev.s] === 'sparks' || STATUS_FX[ev.s] === 'glint' ? sd.color : undefined });
        if (enemy) { const pp = FS.pipPop[ev.idx] || (FS.pipPop[ev.idx] = {}); pp[ev.s] = 1; }
        else { const pe = S.pipEls && S.pipEls[ev.s]; if (pe) replay(pe, 'pop'); else S.pipPop = ev.s; }
        if (ev.s === 'poison') snd('poison'); else if (ev.s === 'burn') snd('burn');
        else if (ev.s === 'freeze') { snd('freeze'); fx().emit('shatter', hitX, hitY, { col: '#bfe8ff', n: 0.6 }); }
        else if (ev.s === 'chill') snd('freeze');
        else snd('click');
        break;
      }
      case 'die': {
        const e = F.enemies[ev.idx], a = anim(ev.idx);
        a.dead = 0.001; a.hurt = 1;
        const col = (e && e.def && e.def.color) || '#ff2e88';
        if (ev.escaped) fx().emit('poof', hitX, hitY);
        else {
          fx().emit('death', hitX, hitY, { col });
          fx().ring(hitX, hitY, '#ffffff', { r0: 10, r1: 110, w: 8, life: 0.45 });
          fx().ring(hitX, hitY, col, { r0: 10, r1: 150, w: 5, life: 0.6, delay: 0.06 });
          // a few coins pop out and fly to the gold counter
          const gp = hudPoint($('goldTxt'), GOLD_HUD.x, GOLD_HUD.y);
          const n = reduced ? 2 : (e && e.def && e.def.tier === 'boss' ? 9 : e && e.def && e.def.tier === 'elite' ? 6 : 4);
          for (let i = 0; i < n; i++) {
            fx().fly(hitX + (i - n / 2) * 10, hitY, gp.x, gp.y, { kind: 'coin', dur: 0.55 + i * 0.03, delay: 0.12 + i * 0.07, arc: 90 + i * 12, side: -60, size: 7,
              cb: () => { snd('coin', { pitch: 1 + i * 0.04 }); replay($('goldTxt') && $('goldTxt').parentNode, 'bump'); } });
          }
        }
        fx().text(pos.x, pos.y, ev.escaped ? 'ESCAPED' : 'DOWN', '#ff2e88', { big: true });
        snd('enemyDie'); fx().shake(8);
        if (!ev.escaped) { S.run.kills++; S.meta.stats.kills++; }
        if (FS.enemyTurn && FS.actor === ev.idx) nextActor();
        // the last one down: slow motion and the victory sweep
        const last = F.enemies.every((x) => !x.alive) && !FS.queue.some((q) => q.ev && q.ev.t === 'die');
        if (last && !ev.escaped) {
          slowmo(0.28, 0.75);
          FS.lastKill = { x: hitX, y: hitY };
          fx().ring(hitX, hitY, '#ffc94d', { r0: 20, r1: 320, w: 10, life: 0.8, delay: 0.1 });
          snd('victory');
        }
        break;
      }
      case 'summon': {
        FS.anim[ev.idx] = { hurt: 0, attack: 0, dead: 0, spawn: 1 };
        fx().emit('poof', pos.x, pos.y, { col: 'rgba(166,255,94,0.5)' });
        fx().ring(hitX, hitY, '#a6ff5e', { r0: 10, r1: 90, w: 6 });
        fx().text(pos.x, pos.y, 'SUMMONED', '#a6ff5e'); snd('boss');
        break;
      }
      case 'intent': if (FS.enemyTurn && FS.actor === ev.idx) nextActor(); break;
      case 'text': {
        fx().text(pos.x, pos.y, ev.str, '#ffc94d');
        if (ev.str === 'FROZEN') fx().emit('frost', hitX, hitY);
        else if (ev.str === 'STUNNED') fx().emit('shock', hitX, hitY - base.h * 0.3);
        else if (/MISS|DODGE/.test(ev.str)) fx().emit('smoke', hitX, hitY, { n: 0.5 });
        if (FS.enemyTurn && enemy && FS.actor === ev.idx && (ev.str === 'FROZEN' || ev.str === 'STUNNED')) nextActor();
        break;
      }
      case 'play': if (ev.def) FS.curDef = ev.def; break;
      case 'grab': {
        fx().text(PLAYER_FX.x, PLAYER_FX.y, (ev.v > 0 ? '+' : '') + ev.v + ' grab', '#2ee6d6');
        const gp = hudPoint($('grabs'), 420, 360);
        fx().ring(gp.x, gp.y, '#2ee6d6', { r0: 10, r1: 70, w: 5 });
        replay($('grabs'), 'bump');
        snd('upgrade');
        break;
      }
      case 'refill': queueSpawn(ev.items); fx().text(270, 430, 'REFILL', '#2ee6d6'); snd('itemLand'); break;
      case 'binShake': shakeBin(); fx().text(270, 430, 'SHAKE', '#ff5a4a'); break;
      case 'binGrease': setGrease(ev.turns); fx().text(270, 430, 'GREASED', '#a6ff5e'); fx().emit('poison', 270, 460, { col: '#ffe066' }); snd('itemSlip'); break;
      case 'binFog': FS.fog = Math.max(FS.fog, ev.turns || 1); fx().text(270, 430, 'FOG', '#b3a4d6'); fx().emit('smoke', 270, 560, { n: 1.5 }); break;
      case 'binJunk': queueSpawn(ev.items); fx().text(270, 430, 'JUNK', '#ff5a4a'); snd('itemLand'); break;
      case 'binSteal': {
        const b = bodyOf(ev.inst);
        if (b) fx().emit('poof', CAB.x + b.x, CAB.y + b.y);
        removeBody(b); fx().text(270, 430, 'STOLEN: ' + itemName(itemDef(ev.inst.id), ev.inst.plus), '#ff5a4a'); snd('itemSlip');
        break;
      }
      case 'binFreeze': {
        const b = swapBody(ev.inst);
        if (b) { fx().emit('frost', CAB.x + b.x, CAB.y + b.y); fx().ring(CAB.x + b.x, CAB.y + b.y, '#bfe8ff', { r1: 50 }); }
        fx().text(270, 430, 'FROZEN: ' + itemName(itemDef(ev.inst.id), ev.inst.plus), '#8dfff5'); snd('freeze');
        break;
      }
      case 'binTilt': setTilt(ev.dir || 1); fx().text(270, 430, 'TILT', '#ffc94d'); snd('shake'); break;
      case 'binPurge': {
        for (const inst of ev.insts || []) { const b = bodyOf(inst); if (b) fx().emit('poof', CAB.x + b.x, CAB.y + b.y, { n: 0.6 }); removeBody(b); }
        fx().text(270, 430, 'PURGED', '#a6ff5e');
        break;
      }
      case 'binCopy': queueSpawn([ev.inst]); fx().text(270, 430, 'COPY', '#ffc94d'); fx().emit('glint', 270, 450, { n: 2 }); break;
      // the monsters pass (monsterEvent below)
      case 'binEat': case 'binReturn': case 'binDigest': case 'binBomb': case 'binEggs': case 'binBoom': case 'binHatch':
      case 'binRust': case 'binJam': case 'enrage': monsterEvent(ev); break;
      case 'turn': if (ev.n > 1) banner('TURN ' + ev.n, 'turn', 0.9); break;
      case 'proc': procFx(ev, base, enemy); break;
      case 'combo': queueCombo(ev); break;
      case 'over': break;
      default: break;
    }
    FS.dirty = true;
  }
  /* ---- the monsters pass (DESIGN.md "Enemies"): bellies, lit bombs, eggs,
     rust, jams, phase two. COMBAT already moved the instances; these move
     the bodies and put on the show. FS.belly[idx] is the belly as shown
     (event driven while events play, reconciled to e.belly when idle),
     FS.arcs the items flying between the arena and the cabinet. */
  const ARC_EAT = 0.42, ARC_SPIT = 0.5;
  function mouthOf(idx) { const p = enemyPos(idx); return { x: p.x - p.w * 0.08, y: p.y - p.h * 0.5 }; }
  function bellyList(idx) { const B = FS.belly || (FS.belly = {}); return B[idx] || (B[idx] = []); }
  function hashOf(inst) { return U.hashStr ? U.hashStr(String(inst && inst.uid)) >>> 0 : 7; }
  // Where a returned / dropped item lands: spread over the bin by its uid.
  function landSpot(inst, k) {
    const binW = FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW;
    const h = hashOf(inst) + (k || 0) * 97;
    return { x: 50 + (h % 1000) / 1000 * Math.max(20, binW - 100), y: 60 + (h >> 10) % 40 };
  }
  // An item arcing from (x0, y0) to (x1, y1) over dur s; cb on arrival (the
  // flyer carries the callback, so it also runs headless).
  function arcItem(inst, x0, y0, x1, y1, dur, cb, delay) {
    const A = FS.arcs || (FS.arcs = []);
    const a = { inst, def: itemDef(inst.id), x0, y0, x1, y1, t0: S.t + (delay || 0), dur, lift: 90, spin: ((hashOf(inst) % 13) - 6) };
    A.push(a);
    const done = () => { const i = FS && FS.arcs ? FS.arcs.indexOf(a) : -1; if (i >= 0) FS.arcs.splice(i, 1); if (cb && FS && F) cb(); };
    fx().fly(x0, y0, x1, y1, { kind: 'dot', col: '#ffc94d', dur, delay: delay || 0, arc: a.lift, size: 3, cb: done });
  }
  // Put a body back for an instance the bin holds, at a cabinet point.
  function dropIn(inst, spot) {
    if (!F || !FS || F.bin.indexOf(inst) < 0 || bodyOf(inst)) return;
    const q = FS.spawnQ.indexOf(inst);
    if (q >= 0) FS.spawnQ.splice(q, 1);
    const b = spawnBody(inst, { x: spot.x, y: spot.y, a: 0 });
    if (b) { b.vy = 260; b.vx *= 0.3; }
    fx().emit('dust', CAB.x + spot.x, CAB.y + spot.y, { n: 0.6 });
    snd('itemLand');
  }
  function dropFromBelly(list, inst) {
    for (let i = 0; i < list.length; i++) if (list[i].inst === inst || list[i].inst.uid === inst.uid) { list.splice(i, 1); return; }
  }
  function monsterEvent(ev) {
    const reduced = !!fx().reduced;
    const has = ev.idx != null && ev.idx >= 0 && !!F.enemies[ev.idx];
    const m = has ? mouthOf(ev.idx) : { x: 270, y: 200 };
    const name = ev.inst ? itemName(itemDef(ev.inst.id), ev.inst.plus) : '';
    switch (ev.t) {
      case 'binEat': {
        if (!ev.inst) break;
        const b = bodyOf(ev.inst);
        let x0 = 270, y0 = CAB.y + 150;
        if (b) {
          x0 = CAB.x + b.x; y0 = CAB.y + b.y;
          fx().emit('poof', x0, y0, { n: 0.7 });
          fx().ring(x0, y0, '#ff2e88', { r0: 6, r1: 46, w: 4, life: 0.3 });
          removeBody(b);
        }
        const q = FS.spawnQ.indexOf(ev.inst);
        if (q >= 0) FS.spawnQ.splice(q, 1);
        arcItem(ev.inst, x0, y0, m.x, m.y, ARC_EAT);
        const kept = ev.kind !== 'boom' && ev.kind !== 'drink' && ev.kind !== 'snack';
        if (kept && has) bellyList(ev.idx).push({ inst: ev.inst, def: itemDef(ev.inst.id), t0: S.t + ARC_EAT });
        if (has) anim(ev.idx).chompT = S.t + ARC_EAT;
        fx().text(270, 430, 'SWALLOWED: ' + name, '#ff2e88');
        snd('gulp');
        break;
      }
      case 'binReturn': {
        const list = has ? bellyList(ev.idx) : [];
        let k = 0;
        for (const inst of ev.insts || []) {
          dropFromBelly(list, inst);
          if (F.bin.indexOf(inst) < 0) continue;   // the cabinet was full: it went to the used pile
          const spot = landSpot(inst, k);
          arcItem(inst, m.x, m.y, CAB.x + spot.x, CAB.y + spot.y, ARC_SPIT, () => dropIn(inst, spot), k * 0.09);
          k++;
        }
        const burst = ev.why !== 'hiccup';
        fx().emit(burst ? 'confetti' : 'poof', m.x, m.y, { n: burst ? 0.8 : 0.6 });
        fx().ring(m.x, m.y, '#a6ff5e', { r0: 8, r1: burst ? 110 : 70, w: 6, life: 0.45 });
        fx().text(270, 430, burst ? 'ITEMS BACK!' : 'HICCUP! +' + k, '#a6ff5e');
        if (has) anim(ev.idx).spitT = S.t;
        fx().shake(burst ? 6 : 3);
        snd('burp', { big: burst });
        break;
      }
      case 'binDigest': {
        if (has && ev.inst) dropFromBelly(bellyList(ev.idx), ev.inst);
        if (ev.k === 'boom') {
          // it swallowed a bomb
          fx().emit('burn', m.x, m.y, { n: 1.6 }); fx().emit('smoke', m.x, m.y, { n: 1.2 });
          fx().ring(m.x, m.y, '#ff8a2b', { r0: 10, r1: 130, w: 9, life: 0.5, delay: ARC_EAT });
          fx().shake(12); FS.hitStop = Math.max(FS.hitStop, 0.08);
          if (!reduced) fx().flash('#ff8a2b', 0.25);
          snd('hitBig');
        } else if (ev.k === 'drink' || ev.k === 'snack') {
          fx().emit(ev.k === 'drink' ? 'heal' : 'dust', m.x, m.y, { n: 0.8 });
          snd('gulp', { pitch: 1.3 });
        } else if (ev.k === 'escape') {
          fx().text(270, 430, 'GONE WITH IT: ' + name, '#ff5a4a');
        } else {
          fx().emit('smoke', m.x, m.y, { n: 0.8, col: 'rgba(166,255,94,0.5)' });
          fx().text(270, 430, 'DIGESTED: ' + name + ' (back after the fight)', '#ffc94d');
          snd('burp');
        }
        break;
      }
      case 'binBomb': case 'binEggs': {
        const items = ev.t === 'binBomb' ? [ev.inst] : (ev.items || []);
        let k = 0;
        for (const inst of items) {
          if (!inst) continue;
          const q = FS.spawnQ.indexOf(inst);
          if (q >= 0) FS.spawnQ.splice(q, 1);
          const spot = landSpot(inst, k);
          arcItem(inst, m.x, m.y, CAB.x + spot.x, CAB.y + spot.y, ARC_SPIT, () => dropIn(inst, spot), k * 0.12);
          k++;
        }
        if (has) anim(ev.idx).spitT = S.t;
        fx().text(270, 430, ev.t === 'binBomb' ? 'LIT BOMB! GRAB IT BACK' : 'EGGS! GRAB THEM', '#ff5a4a');
        snd(ev.t === 'binBomb' ? 'fuse' : 'itemSlip');
        break;
      }
      case 'binBoom': {
        const b = ev.inst ? bodyOf(ev.inst) : null;
        const x = b ? CAB.x + b.x : 270, y = b ? CAB.y + b.y : CAB.y + CAB.h - 60;
        if (b) {
          // the blast throws the pile around
          for (const o of FS.items) {
            if (o === b) continue;
            const dx = o.x - b.x, dy = o.y - b.y, d = Math.max(20, Math.hypot(dx, dy));
            if (d > 170) continue;
            const k = (170 - d) / 170;
            o.vx += dx / d * 700 * k; o.vy += dy / d * 500 * k - 300 * k; o.av += (dx > 0 ? 1 : -1) * 6 * k;
          }
          if (FS.world && FS.world.wakeAll) FS.world.wakeAll();
          removeBody(b);
        }
        fx().emit('burn', x, y, { n: 2 }); fx().emit('smoke', x, y, { n: 1.5 }); fx().emit('sparks', x, y, { n: 1.2 });
        fx().ring(x, y, '#ff8a2b', { r0: 10, r1: 150, w: 10, life: 0.5 });
        fx().ring(x, y, '#ffe066', { r0: 10, r1: 90, w: 6, life: 0.35, delay: 0.05 });
        fx().text(270, 430, 'BOOM!', '#ff8a2b', { big: true });
        fx().shake(16); FS.hitStop = Math.max(FS.hitStop, 0.1);
        if (!reduced) fx().flash('#ff8a2b', 0.35);
        snd(X.AUDIO && X.AUDIO.names && X.AUDIO.names.indexOf('boom') >= 0 ? 'boom' : 'hitBig'); haptic('hurt');
        break;
      }
      case 'binHatch': {
        const b = ev.inst ? bodyOf(ev.inst) : null;
        if (b) { fx().emit('shatter', CAB.x + b.x, CAB.y + b.y, { col: '#e8d8f0', n: 0.8 }); fx().emit('poof', CAB.x + b.x, CAB.y + b.y, { n: 0.6 }); removeBody(b); }
        fx().text(270, 430, 'HATCHED!', '#ff2e88');
        snd('itemSlip');
        break;
      }
      case 'binRust': {
        const b = ev.inst ? bodyOf(ev.inst) : null;
        if (b) { fx().emit('dust', CAB.x + b.x, CAB.y + b.y, { col: '#c86a2e', n: 1 }); fx().ring(CAB.x + b.x, CAB.y + b.y, '#c86a2e', { r0: 6, r1: 40, w: 4 }); }
        fx().text(270, 430, 'RUSTED: ' + name, '#c86a2e');
        snd('poison');
        break;
      }
      case 'binJam': {
        FS.jamT = S.t;
        fx().emit('sparks', CAB.x + CAB.w * 0.5, CAB.y + 20, { n: 1.2, col: '#ffc94d' });
        fx().text(270, 430, 'CLAW JAMMED! (one grab fewer)', '#ffc94d');
        fx().shake(5);
        snd('clawClose');
        break;
      }
      case 'enrage': {
        if (!has) break;
        const p = enemyPos(ev.idx), a = anim(ev.idx);
        a.rageT = S.t;
        banner(ev.name || 'ENRAGED', 'enemy', 1.4);
        const cy = p.y - p.h * 0.5;
        fx().ring(p.x, cy, '#ff2e30', { r0: 20, r1: 230, w: 12, life: 0.7 });
        fx().ring(p.x, cy, '#ffffff', { r0: 10, r1: 140, w: 6, life: 0.45, delay: 0.08 });
        fx().emit('burn', p.x, cy, { n: 1.6 });
        if (ev.text) fx().text(p.x, cy - 30, ev.text, '#ff5a4a', { size: 14, life: 1.6 });
        fx().shake(14); FS.hitStop = Math.max(FS.hitStop, 0.12);
        if (!reduced) { fx().flash('#ff2e30', 0.3); slowmo(0.45, 0.35); }
        snd('roar'); haptic('boss');
        break;
      }
      default: break;
    }
  }
  // Per enemy, before its sprite: phase two / chomp / spit looks for
  // RENDER.enemy (EST) and the affix aura.
  function monsterBack(ctx, e, i, x, p, t, live) {
    const a = anim(i);
    const since = (k) => (a[k] != null ? S.t - a[k] : 99);
    EST.enraged = !!e.enraged && live;
    const rg = since('rageT');
    EST.rage = rg < 0.9 ? 1 - rg / 0.9 : 0;
    const ch = since('chompT');
    EST.chomp = ch >= 0 && ch < 0.4 ? 1 - ch / 0.4 : 0;
    const sp = since('spitT');
    EST.spit = sp >= 0 && sp < 0.4 ? 1 - sp / 0.4 : 0;
    if (live && e.affix && e.affix.length && X.RENDER && X.RENDER.affixAura) X.RENDER.affixAura(ctx, x, p.y, p.w, p.h, e.affix, t);
  }
  // Per living enemy, over its sprite: the belly bubble and the affix badges.
  const BELLY_T = [];
  function monsterFront(ctx, e, i, x, p, t) {
    const R = X.RENDER;
    if (!R) return;
    let list = bellyList(i);
    const idle = !FS.queue.length && !FS.enemyTurn;
    // Idle: the shown belly settles on the real one.
    const eb = e.belly || [];
    if (idle && (list.length !== eb.length || list.some((b, k) => b.inst !== eb[k].inst))) {
      list.length = 0;
      for (const b of eb) list.push({ inst: b.inst, def: itemDef(b.inst.id), t0: 0 });
    }
    if (list.length && R.belly) {
      BELLY_T.length = 0;
      for (const s of list) { let n = 0; for (const b of eb) if (b.inst === s.inst) n = b.turns; BELLY_T.push(n); }
      const need = X.COMBAT.hiccupAt ? X.COMBAT.hiccupAt(e) : 10;
      // on the body's back half (enemies face left), clear of the face
      R.belly(ctx, x + p.w * 0.16, p.y - p.h * 0.34, Math.max(26, Math.min(p.w, p.h) * 0.3), list, t, { turns: BELLY_T, gut: U.clamp((e.gut || 0) / need, 0, 1), now: S.t });
    }
    if (e.affix && e.affix.length && R.affixBadges) R.affixBadges(ctx, p.x - U.clamp(p.w * 0.45, 42, 75) - 14, p.y - 8, e.affix, t);
  }
  // Over the cabinet: rust, fuses, eggs, the jammed rail, and the items in
  // flight between the arena and the bin.
  function drawMonsterFx(ctx, t) {
    const R = X.RENDER;
    if (!R || !F || !FS) return;
    if (R.binMark) {
      for (const b of FS.items) {
        const inst = b.data.inst;
        if (!inst.rust && inst.fuse == null && inst.hatch == null) continue;
        const r = b.br || 16;
        if (inst.rust) R.binMark(ctx, 'rust', CAB.x + b.x, CAB.y + b.y, r, t, 0);
        if (inst.fuse != null) R.binMark(ctx, 'fuse', CAB.x + b.x, CAB.y + b.y, r, t, inst.fuse);
        if (inst.hatch != null) R.binMark(ctx, 'egg', CAB.x + b.x, CAB.y + b.y, r, t, inst.hatch);
      }
    }
    const jam = F.player.status && F.player.status.jam > 0;
    if ((jam || (FS.jamT != null && S.t - FS.jamT < 0.6)) && R.wrench) {
      const k = FS.jamT != null ? U.clamp((S.t - FS.jamT) / 0.3, 0, 1) : 1;
      R.wrench(ctx, CAB.x + CAB.w * 0.7, CAB.y + 24 - (1 - U.ease.outBack(k)) * 60, 1.1, 0.22 + Math.sin(t * 20) * 0.05 * (1 - k));
    }
    const A = FS.arcs;
    if (A && A.length && R.item) {
      for (const a of A) {
        const u = (S.t - a.t0) / a.dur;
        if (u < 0 || u > 1) continue;
        const cx = (a.x0 + a.x1) / 2, cy = Math.min(a.y0, a.y1) - a.lift, v = 1 - u;
        const x = v * v * a.x0 + 2 * v * u * cx + u * u * a.x1, y = v * v * a.y0 + 2 * v * u * cy + u * u * a.y1;
        R.item(ctx, a.def, x, y, a.spin * u, 0.9, { plus: a.inst.plus, glow: '#ffc94d' });
      }
    }
  }

  /* A relic or synergy fired ({t:'proc', src, id, name, icon, color, text,
     who, idx}): the relic in the HUD bar pops with a glow ring, a star flies
     from it to the unit, an icon badge rises from the player or the enemy. */
  function procFx(ev, base, enemyHint) {
    const onEnemy = ev.who === 'enemy' || ev.who === 'e' || (ev.who == null && enemyHint);
    const idx = ev.idx != null ? ev.idx : F.target;
    const at = onEnemy && F.enemies[idx] ? enemyPos(idx) : null;
    const x = at ? at.x : PLAYER_FX.x + 40, y = at ? at.y - at.h - 30 : PLAYER_FX.y - 20;
    const col = ev.color || (ev.src === 'combo' ? '#ffc94d' : '#2ee6d6');
    let icon = ev.icon;
    if (!icon && ev.src === 'relic' && ev.id) icon = relicDef(ev.id).icon;
    const label = ev.text || ev.name || '';
    // The same relic firing again within PROC_MERGE stacks on its badge
    // ("x3") instead of spawning another; the relic still pops.
    const key = (ev.src || '') + ':' + (ev.id || label) + ':' + (onEnemy ? idx : 'p');
    const R0 = S.procs || (S.procs = {});
    const prev = R0[key];
    if (prev && S.t - prev.t < PROC_MERGE && prev.p && prev.p.life > 0 && prev.p.icon === (icon || '*')) {
      prev.n++; prev.t = S.t;
      prev.p.str = label + ' x' + prev.n; prev.p.life = Math.max(prev.p.life, prev.p.max * 0.6);
      if (ev.src === 'relic' && ev.id && S.relicEls && S.relicEls[ev.id]) replay(S.relicEls[ev.id], 'proc');
      return;
    }
    R0[key] = { t: S.t, n: 1, p: fx().badge(x, y - ((FS.procN = ((FS.procN || 0) + 1) % 3) * 22), icon || '*', label, col) };
    if (ev.src === 'relic' && ev.id && S.relicEls && S.relicEls[ev.id]) {
      const el = S.relicEls[ev.id];
      replay(el, 'proc');
      const rp = hudPoint(el, 440, 36);
      fx().ring(rp.x, rp.y, col, { r0: 10, r1: 40, w: 4, life: 0.4 });
      fx().fly(rp.x, rp.y, x, y + 14, { kind: 'star', col, dur: 0.4, arc: 40, size: 6 });
    } else fx().emit('glint', x, y, { col });
    snd('proc', { tier: ev.src === 'combo' ? 2 : 0 });
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
    FS.grabN++;
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
    const list = carried().filter((b) => b.data && b.data.inst);   // glass shards are not prizes
    if (!list.length) { hint('empty claw...'); return; }
    const names = list.map((b) => itemName(itemDef(b.data.inst.id), b.data.inst.plus));
    // Claw Crawl scoops: a big cargo reads as "A + B + 3 more"
    hint('holding ' + (names.length > 3 ? names.slice(0, 2).join(' + ') + ' + ' + (names.length - 2) + ' more' : names.join(' + ')));
  }
  function onRigEvent(ev) {
    const rig = FS.rig;
    const cj = FS.claw;
    switch (ev) {
      case 'drop': cj.bendV += (FS.rng() - 0.5) * 160; cj.sq = -0.5; setMood('focus', 1.2); break;
      case 'touch': {
        snd('clawTouch');
        // the palm thunks into the pile: squash, a puff and a camera nudge
        cj.sq = 1;
        const reach = rig.geo ? rig.geo.reach * 0.7 : 36;
        fx().emit('dust', CAB.x + rig.x, CAB.y + rig.y + reach, { power: 0.6 });
        fx().kick(0, 4);
        break;
      }
      case 'close': {
        snd('clawClose');
        // a metallic spark burst where the prongs clamp
        const reach = rig.geo ? rig.geo.reach * 0.85 : 40;
        const px = CAB.x + rig.x, py = CAB.y + rig.y + reach;
        fx().burst(px, py, '#fff6c0', fx().reduced ? 4 : 10, { speed: 130, size: 2.5, life: 0.3, gravity: 300 });
        fx().emit('sparks', px - 14, py - 6, { dir: Math.PI, spread: 1.4, n: 0.8 });
        fx().emit('sparks', px + 14, py - 6, { dir: 0, spread: 1.4, n: 0.8 });
        fx().ring(px, py, '#fff6c0', { r0: 4, r1: 30, w: 3, life: 0.22 });
        cj.sq = 0.7; cj.glow = 0.8;
        break;
      }
      case 'lift': {
        snd('clawLift'); FS.wasHeld = carried().length; FS.cargo = carried().slice(); cj.sq = -0.6; cj.bendV += 40; holdHint();
        // the claw's face: beaming with a prize, glum when it came up empty
        if (FS.cargo.some((b) => b.data && b.data.inst)) setMood('happy', 8); else setMood('sad', 1.5);
        break;
      }
      case 'carry': snd('clawMove'); holdHint(); break;
      case 'slip': {
        // a cargo item fell out of the prongs on the way up or across: it
        // streaks down with a whoosh
        snd('itemSlip'); snd('whoosh');
        const now = carried();
        for (const b of FS.cargo) if (now.indexOf(b) < 0 && FS.items.indexOf(b) >= 0) b.data.slipT = 0.6;
        FS.cargo = now.slice();
        fx().text(CAB.x + rig.x, CAB.y + rig.y + 30, 'SLIP', '#b3a4d6', { size: 16 });
        fx().shake(2);
        FS.slips++;
        hint(carried().length ? 'slipped one...' : 'slipped...');
        // it fell out right next to the chute: so close
        if ((rig.phase === 'carrying' || rig.phase === 'releasing') && FS.cabinet && rig.x > FS.cabinet.bounds.chuteX - MAT.closeX) soClose(CAB.x + rig.x, CAB.y + rig.y + 50);
        else if (!carried().length) setMood('sad', 1.5);
        break;
      }
      case 'shed': {
        // legacy event (the Claw Crawl rig never emits it): extras left in the pile
        snd('clawTouch');
        fx().text(CAB.x + rig.x, CAB.y + rig.y + 30, 'FULL', '#8e98a8', { size: 14, life: 0.7 });
        break;
      }
      case 'release': {
        snd('clawRelease'); FS.watch = true; FS.releaseAt = S.t;
        cj.sq = -0.4; cj.bendV -= 60;
        FS.relCargo = FS.cargo.slice();
        fx().emit('glint', CAB.x + rig.x, CAB.y + rig.y + 30, { col: '#fff6c0' });
        break;
      }
      case 'home':
        // home with a prize delivered: a happy ding and an LED chase
        if (FS.delivered > 0) { snd('ding'); cj.chase = 1; setMood('happy', 1.1); }
        else if (cj.mood === 'happy' || cj.mood === 'focus') cj.moodT = 0.01;
        break;
      default: break;
    }
  }
  /* A delivered item flies out of the chute in an arc to what it is aimed
     at (the target enemy, the middle of the pack, or the player row) and
     lands with a burst in its own element; COMBAT.play waits for the landing
     (updateFight), so the numbers pop where the item hits. */
  const THROW_T = 0.3;
  function throwItem(inst, from) {
    if (!F || !FS) return;
    const def = itemDef(inst.id);
    const tgt = def.target || 'enemy';
    let to;
    const alive = F.enemies.map((e, i) => (e.alive ? i : -1)).filter((i) => i >= 0);
    if (tgt === 'self' || tgt === 'none' || !alive.length) to = { x: PLAYER_FX.x + 20, y: PLAYER_FX.y - 16 };
    else if (tgt === 'all' || tgt === 'random') {
      let sx = 0, sy = 0;
      for (const i of alive) { const p = enemyPos(i); sx += p.x; sy += p.y - p.h * 0.5; }
      to = { x: sx / alive.length, y: sy / alive.length };
    } else {
      const i = F.enemies[F.target] && F.enemies[F.target].alive ? F.target : alive[0];
      const p = enemyPos(i);
      to = { x: p.x, y: p.y - p.h * 0.5 };
    }
    const k = FS.throws.length;
    FS.throws.push({
      inst, def, x0: from.x, y0: from.y, x1: to.x, y1: to.y,
      cx: (from.x + to.x) / 2 + 60, cy: Math.min(from.y, to.y) - 150 - k * 20,
      t: 0, dur: (fx().reduced ? 0.2 : THROW_T) + k * 0.04, landed: false, spin: 10 + FS.rng() * 10, x: from.x, y: from.y,
      self: to.x < 200 && tgt !== 'enemy',
    });
    snd('whoosh', { pitch: 1.2 });
  }
  function throwXY(th) {
    const u = U.ease.inOut(Math.min(1, th.t)), v = 1 - u;
    th.x = v * v * th.x0 + 2 * v * u * th.cx + u * u * th.x1;
    th.y = v * v * th.y0 + 2 * v * u * th.cy + u * u * th.y1;
  }
  // The landing: a ring in the item's rarity colour and a burst by kind.
  function landThrow(th) {
    const d = th.def, tags = d.tags || [], x = th.x1, y = th.y1;
    const rc = (X.RENDER && X.RENDER.RARITY_COL && X.RENDER.RARITY_COL[d.rarity]) || '#ffc94d';
    fx().ring(x, y, rc, { r0: 6, r1: 48, w: 5, life: 0.3 });
    const fxs = d.fx || [];
    const has = (k) => fxs.some((f) => f && f.k === k);
    const st = fxs.find((f) => f && f.k === 'status');
    if (d.art === 'bomb' || has('poisonAll')) { fx().emit('burn', x, y, { n: 1.5 }); fx().emit('smoke', x, y); fx().shake(6); }
    else if (st && STATUS_FX[st.s]) fx().emit(STATUS_FX[st.s], x, y);
    else if (tags.indexOf('glass') >= 0 || tags.indexOf('potion') >= 0) { fx().emit('shatter', x, y, { col: d.color || '#ff2e88', n: 0.6 }); snd('shatter'); }
    else if (has('heal')) fx().emit('heal', x, y);
    else if (has('block')) fx().emit('block', x, y, { n: 0.7 });
    else if (has('gold')) fx().emit('coins', x, y, { n: 0.5 });
    else fx().emit('sparks', x, y, { n: 0.6 });
  }
  function deliver(b) {
    const inst = b.data.inst;
    const pos = { x: CAB.x + b.x, y: CAB.y + b.y };
    // the claw never touched it this grab: shaken, blasted or knocked in
    const free = b.data.clawG !== FS.grabN;
    const ms = FS.mst[inst.uid];
    if (ms) { ms.lit = 0; ms.melt = 1; }   // a delivered bomb is out of the bin, ice refreezes in the used pile
    removeBody(b);
    FS.playQ.push(inst);
    FS.delivered++;
    S.run.delivered++;
    fx().burst(pos.x, pos.y, '#ffc94d', fx().reduced ? 6 : 14);
    fx().trail(pos.x, pos.y, '#ffc94d');
    fx().ring(pos.x, pos.y, '#ffc94d', { r0: 8, r1: 46, w: 4 });
    FS.chuteFlash = 0.35;
    throwItem(inst, pos);
    const chuteMid = CAB.x + (FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW) + CAB.chuteW * 0.5;
    // the chip rises just left of the divider so it never sits on the PRIZE lettering
    fx().text(chuteMid - 66, CAB.y + CAB.h - 40, '+PLAYED', '#ffc94d', { size: 15, dy: -80, life: 0.9 });
    snd('chute');
    haptic('tap');
    // Doubles are the norm with the basket claw: a triple is the jackpot.
    // Both light the cabinet up (slot-machine chase lights, the marquee);
    // the jackpot adds confetti from the top corners and a coin fountain.
    if (FS.delivered === 2) {
      fx().text(chuteMid - 66, CAB.y + CAB.h - 70, 'DOUBLE', '#2ee6d6', { size: 20, dy: -60, life: 0.9 });
      fx().emit('coins', chuteMid, CAB.y + CAB.h - 30, { n: 0.6, power: 0.9, dir: -Math.PI / 2 - 0.35 });
      FS.party = Math.max(FS.party, 0.7); FS.marquee = 'DOUBLE!';
      snd('coin', { pitch: 1.2 });
    }
    if (FS.delivered === 3) {
      banner('JACKPOT', 'jackpot', 1.4);
      snd('jackpot'); haptic('jackpot');
      fx().burst(270, 600, '#ffc94d', fx().reduced ? 12 : 40); if (!fx().reduced) fx().flash('#ffc94d', 0.4);
      fx().emit('confetti', CAB.x + 10, CAB.y, { dir: -Math.PI / 2 + 0.55, spread: 1.0 });
      fx().emit('confetti', CAB.x + CAB.w - 10, CAB.y, { dir: -Math.PI / 2 - 0.55, spread: 1.0 });
      fx().emit('coins', chuteMid, CAB.y + CAB.h - 30, { n: 1.6, power: 1.25, dir: -Math.PI / 2 - 0.3 });
      fx().ring(270, 600, '#ffc94d', { r0: 20, r1: 320, w: 10, life: 0.7 });
      fx().shake(10);
      FS.party = 2.2; FS.marquee = 'JACKPOT!';
      S.run.jackpots++; S.meta.stats.jackpots++;
    }
    // the golden prize outranks a free one (one label lane each: golden over the bin, free over DOUBLE)
    if (FS.golden && FS.golden.uid === inst.uid) goldenPrize(pos);
    else if (free) freePrize(chuteMid, CAB.y + CAB.h - 105);
    if (S.coachStep === 2) coachNext();
  }
  function playInst(inst) {
    if (!F || F.phase !== 'player') return;
    const def = itemDef(inst.id);
    FS.curDef = def;
    const evs = X.COMBAT.play(F, inst, F.target);
    const ms = FS.mst[inst.uid];
    if (ms && ms.crack > 0) crackBonus(inst, def);
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
    const kw = kwChips(def, 'sm');
    if (kw) { tx.appendChild(kw); chip.classList.add('haskw'); }
    chip.appendChild(tx);
    chip.classList.add('rr-' + (def.rarity || 'c'));
    tray.appendChild(chip);
    if (tray.children && tray.children.length > 2) { const first = tray.children[0]; if (first) { if (first.remove) first.remove(); else tray.removeChild(first); } }
    setTimeout(() => { chip.classList.add('fade'); }, 2600);
    setTimeout(() => { if (chip.remove) chip.remove(); if (tray.removeChild) try { tray.removeChild(chip); } catch (e) { /* gone */ } }, 3200);
  }
  function grabFinished() {
    FS.grabInFlight = false;
    FS.watch = false;
    luckAfterGrab();
    nearMissAfterGrab();
    const evs = X.COMBAT.grabDone ? X.COMBAT.grabDone(F, FS.delivered) : [];
    enqueue(evs, PLAY_BEAT);
    afterAction();
  }
  // After a grab (or any player-side queue) settles: win/lose, hints, auto end.
  function afterAction() {
    if (!F || FS.done) return;
    const over = F.phase === 'over' ? F.result : X.COMBAT.isOver(F);
    if (over) { endFight(over, true); return; }
    if (F.player.grabs > 0) hint(FS.delivered ? 'nice. steer and release' : 'steer and release');
    else { hint('out of grabs'); FS.autoEndT = AUTO_END; banner('TURN OVER', 'turn', 0.7); }
    FS.dirty = true;
  }
  // The claw's spring: the cable bows against the carriage's acceleration and
  // wobbles back, the hub squash and the clamp glow relax.
  function clawSpring(dt) {
    const cj = FS.claw, rig = FS.rig;
    if (!rig || !(dt > 0)) return;
    const vx = (rig.x - cj.px) / dt;
    cj.px = rig.x;
    if (Math.abs(vx) < 5000) { cj.bendV -= (vx - cj.vx) * 0.12; cj.vx = vx; }
    cj.bendV += (-cj.bend * 160 - cj.bendV * 6) * dt;
    cj.bend = U.clamp(cj.bend + cj.bendV * dt, -22, 22);
    cj.sq *= Math.exp(-dt * 8);
    if (cj.glow > 0) cj.glow = Math.max(0, cj.glow - dt * 2.5);
    // the face: moods wear off, the LED chase fades, a blink every few seconds
    if (cj.moodT > 0) { cj.moodT -= dt; if (cj.moodT <= 0) { cj.moodT = 0; cj.mood = ''; } }
    if (cj.chase > 0) cj.chase = Math.max(0, cj.chase - dt * 0.8);
    cj.blinkT -= dt;
    if (cj.blinkT < -0.13) cj.blinkT = 2.1 + (FS.frameN % 7) * 0.35;
    const parked = rig.phase === 'idle' ? 1 : 0;
    cj.idle = (cj.idle || 0) + (parked - (cj.idle || 0)) * Math.min(1, dt * 3);
  }
  /* A cracked glass item plays for +50% (half its numbers again, through
     COMBAT's own damage / heal / status), then it breaks for the fight. */
  function crackBonus(inst, def) {
    const p = F.player, half = (v) => Math.ceil(Math.abs(+v || 0) * 0.5);
    const list = (inst.plus && def.plus && Array.isArray(def.plus.fx)) ? def.plus.fx : (Array.isArray(def.fx) ? def.fx : []);
    const mode = def.target || 'enemy';
    const aim = () => { const e = F.enemies[F.target]; return e && e.alive ? e : F.enemies.find((x) => x.alive); };
    const foes = (all) => (all ? F.enemies.filter((e) => e.alive) : [aim()].filter(Boolean));
    const debuff = (s) => ((tbl('STATUS')[s] || {}).kind === 'debuff');
    if (F.phase === 'player') X.COMBAT.emit(F, { t: 'text', who: 'p', idx: -1, str: 'CRACKED +50%' });
    for (const f of list) {
      if (!f || F.phase !== 'player') break;
      const v = +f.v || 0;
      if (!(v > 0)) continue;
      if ((f.k === 'dmg' || f.k === 'random') && mode !== 'self' && mode !== 'none') {
        const tot = half((f.k === 'random' ? (+f.max || v) : v) * Math.max(1, (f.n | 0) || 1));
        for (const e of foes(mode === 'all')) X.COMBAT.damage(F, p, e, tot);
      } else if (f.k === 'block') {
        const a = half(v);
        p.block = Math.min(999, p.block + a);
        X.COMBAT.emit(F, { t: 'block', who: 'p', idx: -1, amt: a });
      } else if (f.k === 'heal' || f.k === 'lifesteal') X.COMBAT.heal(F, p, half(v));
      else if (f.k === 'status') {
        const to = f.to || ((mode === 'self' || mode === 'none' || !debuff(f.s)) ? 'self' : 'enemy');
        if (to === 'self') { if (!debuff(f.s)) X.COMBAT.status(F, p, f.s, half(v)); }
        else for (const e of foes(to === 'all')) X.COMBAT.status(F, e, f.s, half(v));
      }
    }
    // ...and then it breaks for good (this fight)
    const i = F.used.indexOf(inst);
    if (i >= 0) { F.used.splice(i, 1); F.exhausted.push(inst); }
    delete FS.mst[inst.uid];
    snd('shatter');
  }
  /* Per-frame fight juice: enemy hp ghosts drain after their hold, status
     chip pops settle, the cabinet party lights fade, the low hp heartbeat
     (edge glow + lub-dub under 30%). */
  function juiceTick(dt) {
    for (const k in FS.ghost) {
      const g = FS.ghost[k], sh = FS.shown.e[k];
      const hp = sh ? sh.hp : 0;
      if (g.v < hp) { g.v = hp; continue; }
      if (g.hold > 0) { g.hold -= dt; continue; }
      if (g.v > hp) g.v = Math.max(hp, g.v - Math.max(12, (g.v - hp) * 4) * dt);
    }
    for (const k in FS.pipPop) { const pp = FS.pipPop[k]; for (const s2 in pp) if (pp[s2] > 0) pp[s2] = Math.max(0, pp[s2] - dt * 2.5); }
    if (FS.party > 0) FS.party = Math.max(0, FS.party - dt * 0.8);
    const lag = FS.queue.length || FS.enemyTurn;
    const hp = lag ? FS.shown.p.hp : F.player.hp;
    const low = !FS.done && hp > 0 && hp / Math.max(1, F.player.maxHp) < 0.3;
    if (low) {
      const per = 0.95, before = FS.hbT % per;
      FS.hbT += dt;
      const ph = (FS.hbT % per) / per;
      if (FS.hbT % per < before) snd('heartbeat');
      const pulse = ph < 0.1 ? ph / 0.1 : ph < 0.35 ? 1 - (ph - 0.1) / 0.25 : 0;
      fx().hold(fx().reduced ? 0.22 : 0.16 + 0.34 * pulse, '#ff2e30');
    } else { FS.hbT = 0; fx().hold(0); }
    S.lowHp = low;
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
    if (over) { endFight(over, true); return; }
    syncBodies();
    banner('YOUR TURN', 'turn', 0.9);
    afterAction();
    // lit fuses burn down (a bomb may go off), ice melts
    if (FS && !FS.done) matTurn();
    save();
  }
  /* outro (the natural end of a won fight, not the public call): the
     arena stays up for a beat of slow motion and the VICTORY sweep before
     the reward screen; the reward is rolled now and a save in between lands
     on it. A tap skips. */
  function endFight(result, outro) {
    if (FS && FS.outro && FS.done) { finishOutro(); return; }
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
      fx().flash('#ff2e30', fx().reduced ? 0.25 : 0.6); fx().shake(14);
      snd('lose');
      showGameOver();
      return;
    }
    snd('win');
    banner('VICTORY', 'victory', outro ? 1.6 : 1.2);
    const rng = rngFor('reward');
    let gold = rng.int(10, 25) + 4 * (run.act - 1);
    if (tier === 'elite') gold = Math.round(gold * 1.6);
    if (tier === 'boss') gold = Math.round(gold * 2.5);
    const econ = ECON();
    const ink = tier === 'elite' ? (econ.eliteInk || 1) : (tier === 'normal' && rng() < (econ.fightInkChance || 0) ? 1 : 0);
    // A beaten elite (a tower keeper too) sometimes hands over a tool.
    const brush = tier === 'elite' && rng() < (econ.eliteToolChance || 0) && toolIds().length ? rng.pick(toolIds()) : null;
    const reward = { items: rollItems(rng, 3), gold, ink, brush, tier, then };
    lootReward(reward);   // payout lines, tickets, the lucky double, capsules, highlights
    if (outro) {
      FS.outro = { t: fx().reduced ? 0.7 : 1.5, reward };
      lootOutro(reward);  // the rest of the tickets stream out of the cabinet (may hold the outro a beat longer)
      S.sd = { reward };
      const lk = FS.lastKill || { x: 270, y: 200 };
      fx().emit('confetti', lk.x, lk.y + 40, { power: 0.9 });
      save();
      return;
    }
    showReward(reward);
  }
  function finishOutro() {
    if (!FS || !FS.outro) return;
    const rw = FS.outro.reward;
    FS.outro = null;
    showReward(rw);
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
      FS.dust = 0;
      clawSpring(dt);
      for (const b of FS.items) {
        const d = b.data;
        const pv = d.pvy == null ? b.vy : d.pvy;
        if (pv > 260 && b.vy < pv * 0.35) {
          const imp = U.clamp((pv - 200) / 900, 0.15, 1);
          d.sq = Math.max(d.sq || 0, imp);
          if (S.t - FS.landSnd > 0.07 && imp > 0.3) { FS.landSnd = S.t; snd('itemLand', { mass: b.m, vel: pv }); }
          // a dust puff under the landing, bigger for heavy things (3 a frame at most)
          if (imp > 0.28 && FS.dust < 3) {
            FS.dust++;
            const heavy = U.clamp((b.m || 700) / 1400, 0.3, 1.6);
            fx().emit('dust', CAB.x + b.x, CAB.y + b.y + (b.br || 12) * 0.6, { power: imp * heavy, n: 0.8 });
          }
        }
        if (d.slipT > 0) { d.slipT -= dt; fx().trail(CAB.x + b.x, CAB.y + b.y, '#d9ccff', { vx: b.vx, vy: b.vy, life: 0.22, w: 6 }); }
        matBody(b, dt);
        d.pvy = b.vy;
        if (d.sq > 0) d.sq = Math.max(0, d.sq - dt * 5);
      }
      matFrame(dt);
      if (!FS) return;
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
    // Thrown items fly to their target; each lands before it resolves.
    for (const th of FS.throws) {
      if (th.landed) continue;
      th.t += dt / th.dur;
      throwXY(th);
      if ((FS.frameN & 1) === 0) fx().emit('trailDot', th.x, th.y, { col: (X.RENDER && X.RENDER.RARITY_COL && X.RENDER.RARITY_COL[th.def.rarity]) || '#ffc94d' });
      if (th.t >= 1) { th.t = 1; th.landed = true; landThrow(th); }
    }
    // Played items resolve on a short beat so the numbers can be read.
    if (FS.playQ.length && !FS.queue.length) {
      FS.playT -= dt;
      const head = FS.playQ[0];
      let th = null;
      for (const x of FS.throws) if (x.inst === head) { th = x; break; }
      if (FS.playT <= 0 && (!th || th.landed)) {
        playInst(FS.playQ.shift());
        FS.playT = PLAY_BEAT;
        if (th) FS.throws.splice(FS.throws.indexOf(th), 1);
      }
    }
    // Event playback.
    if (FS.queue.length) {
      FS.beatT -= dt;
      while (FS.queue.length && FS.beatT <= 0) {
        const q = FS.queue.shift();
        applyEvent(q.ev);
        // a proc is a flourish, not a beat: a relic-heavy grab can emit dozens
        FS.beatT = q.ev && q.ev.t === 'proc' ? Math.min(q.beat, PROC_BEAT) : q.beat;
      }
      // The next beat is a hit on the player: the actor winds up during this one.
      if (FS.enemyTurn && FS.actor >= 0 && FS.queue.length) {
        const nx = FS.queue[0].ev;
        if (nx && nx.t === 'dmg' && nx.who === 'p') anim(FS.actor).wind = 1;
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
      if (a.knock > 0) a.knock = Math.max(0, a.knock - dt * 5);
      if (a.barFlash > 0) a.barFlash = Math.max(0, a.barFlash - dt * 4);
      if (a.barShake > 0) a.barShake = Math.max(0, a.barShake - dt * 3);
      if (a.spawn > 0) a.spawn = Math.max(0, a.spawn - dt * 2.5);
      a.windV = (a.windV || 0) + ((a.wind || 0) - (a.windV || 0)) * Math.min(1, dt * 6);
      if (!FS.enemyTurn) a.wind = 0;
    }
    juiceTick(dt);
    // Won fights can end outside a grab too (poison ticks at turn start).
    if (!FS.done && !FS.grabInFlight && !FS.queue.length && !FS.playQ.length && !FS.enemyTurn) {
      const over = F.phase === 'over' ? F.result : null;
      if (over) endFight(over, true);
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
    S.pay = null;
    if (!rw.taken) {
      rw.taken = true;
      if (rw.gold) addGold(rw.gold);
      if (rw.ink) addInk(rw.ink);
      if (rw.brush) addBrush(rw.brush);
      // loot: the tickets (the stream already showed them landing) and the tally's gold
      if (rw.tix) addTickets(rw.tix);
      if (rw.pay) lootRun().loot.payGold += rw.gold || 0;
    }
    S.tix = null;
    setScreen('reward');
    const b = $('rewardBody');
    clear(b);
    b.appendChild(h('h1', null, rw.tier === 'boss' ? 'Boss down' : 'Victory'));
    const line = h('div', 'row pops');
    // the payout receipt carries the gold (older saves show the plain tag)
    if (!rw.pay) line.appendChild(h('span', 'tag gold', `+${rw.gold} gold`));
    if (rw.ink) line.appendChild(h('span', 'tag cyan', `+${bulbs(rw.ink)}`));
    if (rw.brush) line.appendChild(h('span', 'tag gold', `${toolDef(rw.brush).icon || ''} ${toolDef(rw.brush).name}`.trim()));
    b.appendChild(line);
    const pay = rw.pay && rw.pay.length ? buildPayout(b, rw) : null;
    const capBox = h('div', 'col');
    b.appendChild(capBox);
    const sub = h('div', 'sub', 'Pick one item for your bin.');
    b.appendChild(sub);
    const cards = h('div', 'cards');
    const cardEls = [];
    rw.items.forEach((id, i) => {
      const def = itemDef(id);
      let card = null;
      card = itemCard(def, false, { deal: pay ? null : i, onPick: () => { flyCard(card, def, false); addItem(id); snd('buy'); toast(`${def.name} added to the bin.`); afterReward(rw); } });
      cardEls.push(card);
      cards.appendChild(card);
    });
    b.appendChild(cards);
    const skip = btn('Skip', () => afterReward(rw), 'ghost');
    b.appendChild(skip);
    // capsules sit above the cards (DOM taps, not GAME.choose entries: the
    // cards and Skip keep their indices)
    lootCapSlots(capBox, rw);
    if (pay) startPayout(pay, rw, [capBox, sub, cards, skip], cardEls);
    save();
  }
  function itemCard(def, plus, o) {
    o = o || {};
    const card = h('div', 'card rr-' + (def.rarity || 'c') + (o.cls ? ' ' + o.cls : ''));
    if (o.deal != null) dealIn(card, o.deal);
    card.appendChild(h('div', 'rar ' + (def.rarity || 'c'), RARITY_NAME[def.rarity] || ''));
    if (o.count > 1) card.appendChild(h('div', 'cnt', 'x' + o.count));
    card.appendChild(itemCanvas(def, plus, 84));
    card.appendChild(h('div', 'name', itemName(def, plus)));
    card.appendChild(h('div', 'text', itemText(def, plus)));
    const kw = kwChips(def);
    if (kw) card.appendChild(kw);
    if (o.price != null) card.appendChild(h('div', 'price', o.sold ? 'SOLD' : o.price + ' gold'));
    if (o.sold && o.price != null) card.appendChild(h('div', 'stamp' + (o.justSold ? ' slam' : ''), 'SOLD'));
    if (plus) card.appendChild(h('div', 'plus', 'PLUS'));
    const fn = () => { if (o.sold) return; if (o.onPick) o.onPick(); };
    card.onclick = (ev) => { fn(); };
    S.ui.buttons.push({ el: card, fn, label: itemName(def, plus), disabled: !!o.sold || !!o.disabled });
    return card;
  }
  // A card dealt onto the table: a staggered flip in with a paper flick.
  function dealIn(card, i) {
    try { card.classList.add('deal'); card.style.animationDelay = (i * 0.09).toFixed(2) + 's'; } catch (e) { /* stub */ }
    if (!S.headless) setTimeout(() => snd('cardFlip', { pitch: 1 + i * 0.07 }), 60 + i * 90);
  }
  // A picked card flies off toward the bin (the map head's Bin button).
  function flyCard(card, def, plus) {
    if (S.headless || !card) return;
    const p = hudPoint(card, 270, 480);
    const c = h('div', 'flycard rr-' + (def.rarity || 'c'));
    c.appendChild(itemCanvas(def, plus, 64));
    domFly(c, p.x, p.y, 336, 96, 620);
  }
  function afterReward(rw) {
    S.sd = null;
    lootBank(rw);   // unopened capsules wait on the map
    if (S.pay) { const scr = $('scr-reward'); if (scr) scr.onpointerdown = null; S.pay = null; }
    if (rw.tier === 'boss') { nextAct(); return; }
    if (rw.then && rw.then.tower) { towerPrize(rw.then.tower); return; }
    if (rw.then) { const then = rw.then; resolveFx(then.fx || [], then.i || 0, () => toMap()); return; }
    toMap();
  }
  // A tower taken: the view from the top lights everything within
  // MAP.TOWER_VIEW, the bonus rolled at generate is applied, then the
  // treasure screen offers a relic on top (the usual treasure flow).
  function towerPrize(tw) {
    const run = S.run, M = run && run.map;
    const b = (tw && tw.bonus) || { k: 'ink', n: ECON().towerInk || 2 };
    let seen = 0;
    if (M && X.MAP && X.MAP.towerView && tw && tw.q != null) { seen = X.MAP.towerView(M, tw.q, tw.r).length; run.ink = M.ink; S.bloomSrc = { q: tw.q, r: tw.r }; S.beamPending = { q: tw.q, r: tw.r }; }
    let line = '';
    switch (b.k) {
      case 'gold': { const n = b.n || 60; addGold(n); snd('coin'); line = `+${n} gold`; break; }
      case 'brush': {
        const id = toolId(b.id || (toolIds().length ? rngFor('tower').pick(toolIds()) : 'lantern'));
        addBrush(id);
        line = `a ${TERM('brush')} (${toolDef(id).name})`;
        break;
      }
      case 'claw': {
        const def = tbl('CLAW_UPGRADES')[b.u];
        if (def && applyClawUpgrade(b.u)) line = `a claw upgrade (${def.name})`;
        else { addGold(60); snd('coin'); line = '+60 gold (the claw part did not fit)'; }
        break;
      }
      default: { const n = b.n || ECON().towerInk || 2; addInk(n); line = `+${bulbs(n)}`; break; }
    }
    const id = rollRelic(rngFor('tower'), ['u', 'r']);
    showTreasure({ relic: id, gold: b.k === 'gold' ? (b.n || 60) : 0, title: 'Tower taken', sub: `The view lights ${seen} ${seen === 1 ? 'hex' : 'hexes'}. The keeper leaves ${line} and a relic.` });
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
    const td = { relic: id, gold: 0, title: `Act ${run.act}: ${actDef(run.act).name}`, sub: `Healed 30%. +${bulbs(START_INK)}. The Prize Master left you something.` + (unl.length ? ` Unlocked: ${unl.map((c) => (charDef(c) || {}).name || c).join(', ')}.` : '') };
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
    let k = 0;
    for (const id of ids) {
      const def = tbl('CLAW_UPGRADES')[id];
      if (!def) continue;
      const card = h('div', 'card rr-r');
      dealIn(card, k++);
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
      // the big reveal: rays spin behind the relic as it rises in
      const card = h('div', 'card relicReveal rr-' + (def.rarity === 'boss' ? 'l' : def.rarity || 'c'));
      card.appendChild(h('div', 'rays'));
      const ic = relicCanvas(def, 110);
      ic.className = 'relicIcon';
      card.appendChild(ic);
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      const kw = kwChips(def);
      if (kw) card.appendChild(kw);
      b.appendChild(card);
      if (!S.headless) setTimeout(() => snd('relic'), 120);
      b.appendChild(btn('Take it', () => {
        if (!S.headless) { const p = hudPoint(ic, 270, 300); const c = h('div', 'flycard'); c.appendChild(relicCanvas(def, 56)); domFly(c, p.x, p.y, 440, 36, 700); }
        gainRelic(td.relic); snd('upgrade'); S.sd = null; toMap();
      }, 'gold'));
    } else {
      b.appendChild(h('div', 'sub', 'The chest is empty. Someone got here first.'));
      b.appendChild(btn('Continue', () => { S.sd = null; toMap(); }, 'pri'));
    }
    save();
  }

  // ---------------------------------------------------------------- loot
  /* Prize capsules, arcade tickets, the payout tally, the prize counter and
     the run's highlights (DESIGN.md "Loot"). The rolls live in DATA
     (rollCapsule, capsulePrize, prizeShelf, payout); this is the flow and
     the feel. Run fields, all defaulted for old saves by lootRun: tickets,
     pity (capsules since the last rare), caps (banked capsules), loot (the
     highlights). Meta: loot {caps, payouts} opened so far (repeat = faster). */
  const LOOT0 = { NAME: { c: 'Common', u: 'Uncommon', r: 'Rare', l: 'Legendary' }, COLOR: { c: '#b9b0cc', u: '#2ee6d6', r: '#ff2e88', l: '#ffc94d' },
    TICKETS: { jackpot: 3, combo: 1 }, TAPS: 3, FAST_TAPS: 2, FAST_AFTER: 12, PITY: 5, DOUBLE: 0.05 };
  const LT = () => D().LOOT || LOOT0;
  const TIER_I = { c: 0, u: 1, r: 2, l: 3 };
  const capCol = (tier) => LT().COLOR[tier] || '#b9b0cc';
  const capName = (tier) => LT().NAME[tier] || 'Mystery';
  const CAP_SRC = { normal: 'A fight drop', bonus: 'Jackpot bonus', elite: 'Elite drop', boss: 'Boss drop', treasure: 'Treasure', counter: 'Prize counter' };
  const TIX_HUD = { x: 318, y: 36 };

  // The run's loot fields with their defaults (old saves have none of them).
  function lootRun(run) {
    run = run || S.run;
    if (!run) return null;
    if (!(run.tickets >= 0)) run.tickets = 0;
    if (!(run.pity >= 0)) run.pity = 0;
    if (!Array.isArray(run.caps)) run.caps = [];
    const L = run.loot && typeof run.loot === 'object' ? run.loot : (run.loot = {});
    for (const k of ['bigHit', 'overkill', 'capsOpened', 'tixEarned', 'flawless', 'doubles', 'payGold']) if (!(L[k] >= 0)) L[k] = 0;
    if (L.bestCombo === undefined) L.bestCombo = null;
    if (L.bestCap === undefined) L.bestCap = null;
    return run;
  }
  function metaLoot() {
    if (!S.meta) S.meta = freshMeta();
    const m = S.meta.loot && typeof S.meta.loot === 'object' ? S.meta.loot : (S.meta.loot = {});
    if (!(m.caps >= 0)) m.caps = 0;
    if (!(m.payouts >= 0)) m.payouts = 0;
    return m;
  }
  function addTickets(n) {
    const run = lootRun();
    n = Math.round(+n || 0);
    if (!run || !n) return;
    run.tickets = Math.max(0, run.tickets + n);
    if (n > 0) run.loot.tixEarned += n;
  }
  const comboTier = (id) => { const c = tbl('COMBOS')[id]; return c ? U.clamp(c.tier | 0, 1, 3) : 1; };

  // ---- capsules
  // The live pools a capsule may draw from: relics not owned, claw parts
  // not maxed, the tools.
  function capCtx(prefer) {
    const run = S.run;
    const relics = {};
    for (const r of ['c', 'u', 'r', 'boss']) relics[r] = relicPool([r]);
    return { act: run.act, char: run.char, relics, claws: openClawUpgrades(), tools: toolIds(), prefer: prefer || null };
  }
  /* A fresh capsule from a source ('normal', 'bonus', 'elite', 'boss',
     'treasure', 'counter'): its tiers (with the pity lift) and the prize
     are rolled now and saved, so a reload never rerolls it. */
  function makeCapsule(src, opts) {
    opts = opts || {};
    const run = lootRun();
    const rng = rngFor('capsule:' + src);
    let cap = { src, tier0: opts.tier || 'c', ups: [], tier: opts.tier || 'c', pity: false };
    if (D().rollCapsule) { try { cap = D().rollCapsule(rng, src, { pity: run.pity, tier: opts.tier }); } catch (e) { /* keep the plain one */ } }
    let prize = { k: 'gold', n: 20 };
    if (D().capsulePrize) { try { prize = D().capsulePrize(rng, cap.tier, capCtx(opts.prefer)) || prize; } catch (e) { /* gold */ } }
    run.pity = TIER_I[cap.tier] >= 2 ? 0 : run.pity + 1;
    return Object.assign(cap, { prize, opened: false });
  }
  // Pays a prize into the run. A relic already owned or a claw part that no
  // longer fits turns into 60 gold (p.fallback says so on the card).
  function grantPrize(p) {
    const run = lootRun();
    if (!run || !p) return;
    switch (p.k) {
      case 'item': addItem(p.id, !!p.plus); break;
      case 'relic':
        if (!tbl('RELICS')[p.id] || run.relics.indexOf(p.id) >= 0) { addGold(60); p.fallback = 60; } else gainRelic(p.id);
        break;
      case 'gold': addGold(p.n || 0); break;
      case 'ink': addInk(p.n || 0); break;
      case 'maxhp': run.maxHp += (p.n || 0); healRun(p.n || 0); break;
      case 'tickets': addTickets(p.n || 0); break;
      case 'tool': addBrush(p.id); break;
      case 'claw': if (!applyClawUpgrade(p.u)) { addGold(60); p.fallback = 60; } break;
      default: addGold(20); break;
    }
  }
  function prizeOf(p) {
    if (D().prizeInfo) { try { return D().prizeInfo(p); } catch (e) { /* fall through */ } }
    return { name: 'Prize', text: '', icon: '?', col: '#ffc94d' };
  }
  // A DOM canvas with the prize's own art (item, relic, capsule) or null.
  function prizeCanvas(p, px) {
    if (!p) return null;
    if (p.k === 'item' && tbl('ITEMS')[p.id]) return itemCanvas(itemDef(p.id), !!p.plus, px);
    if (p.k === 'relic' && tbl('RELICS')[p.id]) return relicCanvas(relicDef(p.id), px);
    if (p.k === 'cap') return capCanvas(p.tier, px);
    return null;
  }
  function capCanvas(tier, px) {
    return canvasEl(px, (ctx, p) => { if (X.RENDER && X.RENDER.capsule) X.RENDER.capsule(ctx, p / 2, p / 2, p * 0.42, { tier, t: 0.3, seed: 3, glow: 0 }); });
  }

  /* The capsule ritual: cd = {cap, then, gold?, bank?, rwIdx?}. The capsule
     drops in and wobbles; each tap cracks it harder (sparks, spreading
     cracks, a rising snap); a capsule with ups turns rarer mid-open with a
     flash; the last tap bursts it (confetti, rays, the halves fly) and the
     prize card pops out. The canvas draws the capsule (drawCapsule), the
     DOM frames it. then: {k:'map'} | {k:'reward', rw} | {k:'counter', shop}. */
  function showCapsule(cd) {
    S.sd = { capsule: cd };
    const cap = cd.cap;
    const L = LT();
    const fast = metaLoot().caps >= (L.FAST_AFTER || 12);
    const taps = fast ? (L.FAST_TAPS || 2) : (L.TAPS || 3);
    S.cap = { cd, cap, phase: cap.opened ? 'done' : 'drop', t: 0, taps: 0, burstTap: Math.max(taps, cap.ups.length + 2) - 1, shown: cap.opened ? cap.tier : cap.tier0,
      stage: cap.opened ? cap.ups.length : 0, crack: 0, rot: 0, rotV: 0, sq: 0, sqV: 0, flash: 0, open: cap.opened ? 1 : 0, dropT: fast ? 0.35 : 0.7,
      fast, x: 270, y: 440, r: 80, bt: 0, idleT: 0, sparkT: 0 };
    setScreen('capsule');
    capDom();
    const scr = $('scr-capsule');
    if (scr) scr.onpointerdown = (ev) => { if (ev && ev.target && ev.target.closest && ev.target.closest('button,.prize')) return; capsuleTap(); };
    if (!cap.opened) snd('whoosh', { pitch: 0.8 });
    save();
  }
  // Builds the capsule screen's DOM for the current phase.
  function capDom() {
    const C = S.cap;
    const b = $('capsuleBody');
    if (!C || !b) return;
    clear(b);
    S.ui.buttons = [];
    const cap = C.cap, run = S.run;
    const top = h('div', 'capTop');
    try { top.style.setProperty('--cc', capCol(C.shown)); } catch (e) { /* stub */ }
    const tierEl = h('div', 'capTier' + (C.shown === 'l' ? ' lg' : ''), capName(C.shown));
    tierEl.id = 'capTier';
    top.appendChild(tierEl);
    const tag = h('div', null, '');
    tag.id = 'capUpTag';
    top.appendChild(tag);
    top.appendChild(h('div', 'capSrc', (CAP_SRC[cap.src] || 'A capsule') + (C.cd.gold ? ` · +${C.cd.gold} gold` : '')));
    const pity = LT().PITY || 5;
    const left = Math.max(1, pity - (run ? run.pity : 0));
    if (C.phase !== 'done') {
      const pl = h('div', 'capPity');
      pl.textContent = 'Rare or better in ';
      pl.appendChild(h('b', null, left <= 1 ? 'the next capsule' : `${left} capsules`));
      pl.appendChild(h('span', null, ' or sooner'));
      top.appendChild(pl);
    }
    b.appendChild(top);
    if (C.phase === 'done') {
      const p = cap.prize, info = prizeOf(p);
      const card = h('div', 'prize');
      try { card.style.setProperty('--cc', capCol(cap.tier)); } catch (e) { /* stub */ }
      const pic = h('div', 'pic');
      const cv = prizeCanvas(p, 76);
      if (cv) pic.appendChild(cv); else pic.textContent = info.icon || '?';
      card.appendChild(pic);
      card.appendChild(h('div', 'pk', `${capName(cap.tier)} prize`));
      card.appendChild(h('div', 'pn', info.name));
      card.appendChild(h('div', 'pt', p.fallback ? `You had that already: ${p.fallback} gold instead.` : info.text));
      if (p.k === 'item' || p.k === 'relic') { const kw = kwChips(p.k === 'item' ? itemDef(p.id) : relicDef(p.id)); if (kw) card.appendChild(kw); }
      card.appendChild(btn('Collect', () => collectCapsule(), 'gold'));
      b.appendChild(card);
    } else {
      const hint = h('div', 'capHint');
      hint.id = 'capHint';
      try { hint.style.setProperty('--cc', capCol(C.shown)); } catch (e) { /* stub */ }
      b.appendChild(hint);
      capHint();
      // the whole screen is the tap target; the entry lets GAME.choose crack it
      S.ui.buttons.push({ el: $('scr-capsule'), fn: () => capsuleTap(), label: 'Crack' });
      b.appendChild(btn('Skip', () => skipCapsule(), 'sm ghost capSkip'));
    }
  }
  function capHint() {
    const C = S.cap, el = $('capHint');
    if (!C || !el) return;
    const left = Math.max(0, C.burstTap + 1 - C.taps);
    clear(el);
    el.appendChild(h('span', null, C.phase === 'drop' ? '' : left <= 1 ? 'TAP TO OPEN!' : 'TAP TO CRACK'));
    const dots = '●'.repeat(Math.min(C.taps, C.burstTap + 1)) + '○'.repeat(left);
    el.appendChild(h('small', null, dots));
  }
  // One tap: crack harder, maybe turn rarer, or burst on the last one.
  function capsuleTap() {
    const C = S.cap;
    if (!C || S.screen !== 'capsule') return false;
    if (C.phase === 'drop') { capLand(); return true; }
    if (C.phase === 'burst') { capReveal(); return true; }
    if (C.phase !== 'idle') return false;
    const i = C.taps++;
    C.idleT = 0;
    if (i >= C.burstTap) { capBurst(); return true; }
    const reduced = !!fx().reduced;
    C.crack = (i + 1) / (C.burstTap + 1);
    C.rotV += (i % 2 ? -1 : 1) * (3 + i * 2.5) * (reduced ? 0.4 : 1);
    C.sqV += 0.9 + i * 0.35;
    const col = capCol(C.shown);
    fx().emit('sparks', C.x, C.y, { col, n: 1 + i * 0.6, power: 1 + i * 0.3 });
    fx().emit('shatter', C.x, C.y, { col: '#ffffff', n: 0.3 + i * 0.2 });
    fx().ring(C.x, C.y, col, { r0: C.r * 0.8, r1: C.r * (1.8 + i * 0.4), w: 5 + i * 2, life: 0.4 });
    fx().shake(3 + i * 3);
    snd('capCrack', { n: i });
    haptic('hit');
    if (i >= 1 && C.stage < C.cap.ups.length) capUpgrade();
    capHint();
    return true;
  }
  // The capsule turns one tier rarer: a flash, chromatic rings, a riser.
  function capUpgrade() {
    const C = S.cap;
    const next = C.cap.ups[C.stage++];
    if (!next) return;
    C.shown = next;
    C.flash = 1;
    const col = capCol(next);
    if (!fx().reduced) fx().flash(col, 0.5);
    fx().ring(C.x, C.y, col, { r0: 20, r1: 260, w: 12, life: 0.6 });
    fx().ring(C.x - 5, C.y, PAL0.pink, { r0: 10, r1: 320, w: 8, life: 0.7, delay: 0.05 });
    fx().ring(C.x + 5, C.y, PAL0.cyan, { r0: 10, r1: 320, w: 8, life: 0.7, delay: 0.1 });
    fx().emit('confetti', C.x, C.y - 20, { power: 0.8, n: 0.6 });
    fx().emit('glint', C.x - 30, C.y - 30, { n: 2 });
    fx().shake(9);
    snd('capUpgrade');
    haptic('jackpot');
    const tEl = $('capTier');
    if (tEl) { tEl.textContent = capName(next); tEl.className = 'capTier' + (next === 'l' ? ' lg' : ''); replay(tEl, 'up'); }
    const top = tEl && tEl.parentNode;
    try { if (top && top.style) top.style.setProperty('--cc', col); const hEl = $('capHint'); if (hEl && hEl.style) hEl.style.setProperty('--cc', col); } catch (e) { /* stub */ }
    const tag = $('capUpTag');
    if (tag) {
      const last = C.stage >= C.cap.ups.length;
      tag.textContent = C.cap.pity && last ? 'LUCKY STREAK: RARE!' : next === 'l' ? 'JACKPOT UPGRADE!' : 'UPGRADE!';
      tag.className = ''; replay(tag, 'capUpTag');
    }
  }
  // Skip: every upgrade shows at once, then the burst.
  function skipCapsule() {
    const C = S.cap;
    if (!C) return;
    if (C.phase === 'burst') { capReveal(); return; }
    if (C.phase === 'drop') capLand(true);
    if (C.phase === 'idle') {
      if (C.stage < C.cap.ups.length) { C.stage = C.cap.ups.length; C.shown = C.cap.tier; const tEl = $('capTier'); if (tEl) { tEl.textContent = capName(C.shown); tEl.className = 'capTier' + (C.shown === 'l' ? ' lg' : ''); } }
      capBurst();
    }
  }
  function capLand(quiet) {
    const C = S.cap;
    C.phase = 'idle'; C.t = C.dropT; C.sqV += 1.6;
    if (quiet) return;
    fx().emit('dust', C.x, C.y + C.r + 18, { power: 1.2 });
    fx().shake(4);
    snd('capDrop');
    capHint();
  }
  /* The last tap: the prize is paid now (and saved), so a reload lands on
     the reveal, never a second prize. Legendary gets slow motion and a
     rainbow of rings. */
  function capBurst() {
    const C = S.cap, cap = C.cap, run = lootRun();
    C.phase = 'burst'; C.bt = 0; C.flash = 1; C.shown = cap.tier;
    if (!cap.opened) {
      cap.opened = true;
      grantPrize(cap.prize);
      run.loot.capsOpened++;
      if (!run.loot.bestCap || TIER_I[cap.tier] > TIER_I[run.loot.bestCap]) run.loot.bestCap = cap.tier;
      if (C.cd.bank && run.caps.length) run.caps.shift();
      const then = C.cd.then;
      if (then && then.k === 'reward' && then.rw && then.rw.caps && C.cd.rwIdx != null && then.rw.caps[C.cd.rwIdx]) {
        const rc = then.rw.caps[C.cd.rwIdx];
        rc.opened = true; rc.prize = cap.prize;
      }
      metaLoot().caps++;
      saveMeta();
      save();
    }
    const tier = TIER_I[cap.tier] || 0, col = capCol(cap.tier), reduced = !!fx().reduced;
    if (!reduced) fx().flash('#ffffff', 0.5 + tier * 0.1);
    fx().emit('confetti', C.x, C.y, { power: 1 + tier * 0.15, dir: -Math.PI / 2 - 0.5, spread: 1.4 });
    fx().emit('confetti', C.x, C.y, { power: 1 + tier * 0.15, dir: -Math.PI / 2 + 0.5, spread: 1.4 });
    fx().emit('shatter', C.x, C.y, { col, n: 1.2 });
    fx().emit('poof', C.x, C.y);
    if (cap.prize && (cap.prize.k === 'gold' || cap.prize.k === 'tickets')) fx().emit('coins', C.x, C.y, { n: 1.5, power: 1.1 });
    fx().ring(C.x, C.y, col, { r0: C.r, r1: 360, w: 14, life: 0.7 });
    fx().ring(C.x, C.y, '#ffffff', { r0: 10, r1: 240, w: 8, life: 0.5, delay: 0.06 });
    if (tier >= 2) { fx().ring(C.x, C.y, PAL0.pink, { r0: 10, r1: 420, w: 10, life: 0.8, delay: 0.1 }); fx().ring(C.x, C.y, PAL0.cyan, { r0: 10, r1: 460, w: 10, life: 0.85, delay: 0.16 }); }
    if (tier >= 3) { fx().ring(C.x, C.y, PAL0.lime, { r0: 10, r1: 500, w: 10, life: 0.9, delay: 0.22 }); fx().emit('confetti', 270, 120, { power: 1.2, dir: Math.PI / 2, spread: 2.4 }); slowmo(0.35, 0.45); }
    fx().shake(10 + tier * 3);
    snd('capBurst', { tier });
    haptic('jackpot');
    const hEl = $('capHint'); if (hEl) clear(hEl);
    const tEl = $('capTier'); if (tEl) { tEl.textContent = capName(cap.tier); tEl.className = 'capTier' + (cap.tier === 'l' ? ' lg' : ''); }
  }
  function capReveal() {
    const C = S.cap;
    if (!C || C.phase === 'done') return;
    C.phase = 'done'; C.open = 1;
    capDom();
    snd('relic');
  }
  // Collect: the prize flies off toward where it lives, then the ritual's then.
  function collectCapsule() {
    const C = S.cap;
    if (!C || C.phase !== 'done') return;
    const p = C.cap.prize;
    if (!S.headless) {
      const cv = prizeCanvas(p, 56);
      const node = h('div', 'flycard');
      if (cv) node.appendChild(cv); else node.textContent = prizeOf(p).icon || '?';
      const to = p.k === 'relic' ? { x: 440, y: 36 } : p.k === 'gold' ? GOLD_HUD : p.k === 'tickets' ? TIX_HUD : p.k === 'maxhp' ? HP_HUD : { x: 336, y: 96 };
      domFly(node, 270, 600, to.x, to.y, 620);
    }
    snd('upgrade');
    const then = C.cd.then;
    S.cap = null; S.sd = null;
    if (then && then.k === 'reward' && then.rw) { showReward(then.rw); return; }
    if (then && then.k === 'counter' && then.shop) { showCounter(then.shop); return; }
    toMap();
  }
  // Per-frame capsule motion: the drop with a bounce, the wobble spring,
  // an idle hop that begs for a tap, the burst opening, sparkles.
  function capTick(dt) {
    const C = S.cap;
    if (!C) return;
    C.t += dt;
    if (C.phase === 'drop' && C.t >= C.dropT) capLand();
    const reduced = !!fx().reduced;
    // wobble and squash springs
    C.rotV += (-C.rot * 140 - C.rotV * 9) * dt; C.rot += C.rotV * dt;
    C.sqV += (-C.sq * 220 - C.sqV * 12) * dt; C.sq += C.sqV * dt;
    C.sq = U.clamp(C.sq, -0.25, 0.25); C.rot = U.clamp(C.rot, -0.6, 0.6);
    C.flash = Math.max(0, C.flash - dt * 2.5);
    if (C.phase === 'idle') {
      C.idleT += dt;
      // the longer it waits, the more it rattles (anticipation)
      if (C.idleT > 1.6 && !reduced) { C.idleT = 0.9; C.rotV += (C.taps % 2 ? 1 : -1) * (1.5 + C.taps); C.sqV += 0.4; }
      C.sparkT -= dt;
      if (C.sparkT <= 0) { C.sparkT = 0.5 - (TIER_I[C.shown] || 0) * 0.1; fx().emit('glint', C.x + Math.sin(C.t * 7) * C.r * 0.9, C.y - C.r * 0.5 + Math.cos(C.t * 5) * C.r * 0.5, { col: capCol(C.shown) }); }
    }
    if (C.phase === 'burst') {
      C.bt += dt;
      C.open = Math.min(1, C.open + dt * (C.fast ? 4 : 2.8));
      if (C.bt >= (C.fast ? 0.3 : 0.55)) capReveal();
    }
  }
  // The capsule scene over the dimmed map: rays, a spotlight, the pedestal,
  // the capsule itself (RENDER.capsule). Drawn under the fx layer.
  function drawCapsule(ctx, t) {
    const C = S.cap, R = X.RENDER;
    if (!C || !R || !R.capsule) return;
    const col = capCol(C.shown), tier = TIER_I[C.shown] || 0;
    const burst = C.phase === 'burst' || C.phase === 'done';
    const u = C.phase === 'drop' ? U.clamp(C.t / C.dropT, 0, 1) : 1;
    const y = C.phase === 'drop' ? C.y - (1 - U.ease.outBounce(u)) * 560 : C.y;
    ctx.save();
    ctx.fillStyle = 'rgba(10,5,20,0.86)';
    ctx.fillRect(-40, -40, W + 80, H + 80);
    // rays spin behind; brighter and longer once it bursts
    const n = 16, rot = t * (burst ? 0.45 : 0.22) * (fx().reduced ? 0.2 : 1), len = burst ? 640 : 280 + tier * 70;
    const rg = R.rgba || ((c) => c);
    try {
      const g = ctx.createRadialGradient(C.x, y, 10, C.x, y, len);
      g.addColorStop(0, rg(burst ? '#ffffff' : col, burst ? 0.34 : 0.16 + tier * 0.05));
      g.addColorStop(0.5, rg(col, burst ? 0.16 : 0.06 + tier * 0.03));
      g.addColorStop(1, rg(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + i * Math.PI * 2 / n;
        ctx.moveTo(C.x, y); ctx.arc(C.x, y, len, a, a + Math.PI / n * 0.8); ctx.closePath();
      }
      ctx.fill();
      if (tier >= 3) {
        // legendary: a second, counter-spinning rainbow set
        const cols = ['#ff2e88', '#a6ff5e', '#2ee6d6', '#9b7bff'];
        for (let i = 0; i < 8; i++) {
          const a = -rot * 1.3 + i * Math.PI / 4;
          ctx.fillStyle = rg(cols[i % 4], 0.1);
          ctx.beginPath(); ctx.moveTo(C.x, y); ctx.arc(C.x, y, len * 0.8, a, a + 0.12); ctx.closePath(); ctx.fill();
        }
      }
    } catch (e) { /* stub ctx */ }
    // the pedestal and the capsule's shadow (it shrinks as the capsule falls in)
    const py = C.y + C.r + 26;
    ctx.fillStyle = '#231640';
    ctx.beginPath(); ctx.ellipse(C.x, py + 10, 118, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34245c';
    ctx.beginPath(); ctx.ellipse(C.x, py, 110, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rg(col, 0.8); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(C.x, py, 110, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const sh = 0.4 + 0.6 * U.clamp(1 - (C.y - y) / 560, 0, 1);
    ctx.beginPath(); ctx.ellipse(C.x, py - 2, 70 * sh, 12 * sh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    R.capsule(ctx, C.x, y, C.r, { tier: C.shown, t, rot: C.rot, sq: C.sq, crack: C.crack, open: C.open, flash: C.flash, seed: 7, glow: burst ? 0 : 0.55 + tier * 0.15 });
  }

  // ---- the payout tally (reward screen)
  /* The receipt: one row per payout line, hidden until its beat. The lucky
     DOUBLE line comes after a roulette. Returns the step list the tally
     plays; the totals slam in last, then the cards deal. */
  function buildPayout(b, rw) {
    const box = h('div', 'payout');
    const head = h('div', 'ph');
    head.appendChild(h('span', null, 'Payout'));
    head.appendChild(h('span', null, 'gold · tix'));
    box.appendChild(head);
    const done = !!rw.payShown;
    const steps = [];
    const row = (l) => {
      const el = h('div', 'pl ' + (l.id || '') + (done ? '' : ' wait'));
      el.appendChild(h('span', 'lb', l.label));
      el.appendChild(h('span', 'g', l.gold ? '+' + l.gold : ''));
      el.appendChild(h('span', 'x', l.tix ? '+' + l.tix : ''));
      box.appendChild(el);
      return el;
    };
    for (const l of rw.pay) {
      if (l.id === 'double') {
        const rl = h('div', 'roul' + (done ? ' won' : ' wait'));
        const strip = h('div', 'strip');
        const cells = ['x1', 'x1', 'x2', 'x1', 'x1', 'x2', 'x1', 'x1', 'x2', 'x1', 'x1', 'x1', 'x2', 'x1', 'x1', 'x2', 'x1', 'x1'];
        for (const c of cells) strip.appendChild(h('div', 'cell ' + c, c === 'x2' ? 'x2' : 'x1'));
        rl.appendChild(strip);
        box.appendChild(rl);
        steps.push({ k: 'roul', el: rl, strip, land: 12 });
      }
      steps.push({ k: 'line', el: row(l), l });
    }
    const tot = h('div', 'ptot' + (done ? '' : ' wait'));
    tot.appendChild(h('span', 'lb', 'TOTAL'));
    tot.appendChild(h('span', 'g', '+' + rw.gold));
    const tx = h('span', 'x', '+' + (rw.tix || 0));
    tx.appendChild(h('i', 'tixi'));
    tot.appendChild(tx);
    box.appendChild(tot);
    steps.push({ k: 'total', el: tot });
    const skipT = done ? null : h('div', 'skipT', 'tap to skip');
    if (skipT) box.appendChild(skipT);
    b.appendChild(box);
    return { box, steps, done, skipT };
  }
  // Starts the tally; hides what comes after it until the totals land.
  function startPayout(pay, rw, after, cards) {
    const fast = metaLoot().payouts >= 5;
    S.pay = { rw, box: pay.box, skipT: pay.skipT, steps: pay.steps, i: 0, t: fast ? 0.2 : 0.4, gap: fast ? 0.16 : 0.3, roulT: fast ? 0.9 : 1.5, after, cards, done: false, n: 0 };
    if (pay.done) { finishPay(true); return; }
    for (const el of after) if (el && el.classList) el.classList.add('rwWait');
    const scr = $('scr-reward');
    if (scr) scr.onpointerdown = () => { if (S.pay && !S.pay.done) finishPay(); };
  }
  function payStep(st, quiet) {
    const P = S.pay;
    if (!st || !st.el) return 0;
    if (st.el.classList) st.el.classList.remove('wait');
    if (st.k === 'line') {
      if (!quiet) { replay(st.el, 'in'); snd(st.l.id === 'double' ? 'double' : 'tally', { pitch: 1 + P.n * 0.08 }); if (st.l.id === 'double') replay(P.box, 'shake'); }
      P.n++;
      return st.l.id === 'double' ? P.gap * 2 : P.gap;
    }
    if (st.k === 'roul') {
      if (quiet) { st.el.classList.add('won'); return 0; }
      rouletteSpin(st, P.roulT);
      return P.roulT + 0.25;
    }
    if (st.k === 'total') {
      if (!quiet) {
        replay(st.el, 'slam'); replay(P.box, 'shake'); snd('slam'); haptic('jackpot');
        // a little fountain of coins and tickets pops off the total
        if (!S.headless) {
          const p = hudPoint(st.el, 400, 300);
          for (let i = 0; i < 8; i++) domFly(h('div', i % 2 ? 'dtix' : 'dcoin'), p.x + 60 + (i - 4) * 6, p.y, p.x + (i - 4) * 34, p.y - 140 - (i % 3) * 30, 520, i * 30);
        }
      }
      return P.gap;
    }
    return 0;
  }
  // The roulette strip flicks past the window with slowing ticks and lands on x2.
  function rouletteSpin(st, secs) {
    if (S.headless) { st.el.classList.add('won'); return; }
    const cell = 90, box = st.el.getBoundingClientRect ? st.el.getBoundingClientRect() : { width: 480 };
    const w = (box.width || 480) / (S.scale || 1);
    const to = -(st.land * cell - (w / 2 - cell / 2));
    try {
      if (st.strip.animate) st.strip.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${to}px)` }], { duration: secs * 1000, easing: 'cubic-bezier(.12,.7,.2,1)', fill: 'forwards' });
      else st.strip.style.transform = `translateX(${to}px)`;
    } catch (e) { /* no animation */ }
    // ticks slow down like the strip
    let at = 0;
    for (let i = 0; i < 12; i++) { at += 40 + i * i * 7; if (at > secs * 1000) break; setTimeout(() => snd('roulette', { pitch: 1 + i * 0.02 }), at); }
    setTimeout(() => { try { st.el.classList.add('won'); } catch (e) { /* gone */ } }, secs * 1000);
  }
  function payTick(dt) {
    const P = S.pay;
    if (!P || P.done) return;
    P.t -= dt;
    let guard = 0;
    while (P.t <= 0 && !P.done && guard++ < 20) {
      if (P.i >= P.steps.length) { finishPay(true, true); return; }
      P.t += payStep(P.steps[P.i++]);
    }
  }
  /* Ends the tally: every row shown, the totals in, the cards dealt. quiet
     (a reload, or the natural end) skips the extra slam. */
  function finishPay(quiet, natural) {
    const P = S.pay;
    if (!P || P.done) return;
    while (P.i < P.steps.length) payStep(P.steps[P.i++], true);
    P.done = true;
    if (P.skipT && P.skipT.classList) P.skipT.classList.add('gone');
    const tot = P.steps[P.steps.length - 1];
    if (!quiet && tot && tot.el) { replay(tot.el, 'slam'); snd('slam'); }
    for (const el of P.after) if (el && el.classList) { el.classList.remove('rwWait'); if (!P.rw.payShown) replay(el, 'rwShow'); }
    if (!P.rw.payShown) P.cards.forEach((c, i) => dealIn(c, i));
    if (!P.rw.payShown) { P.rw.payShown = true; metaLoot().payouts++; saveMeta(); save(); }
    const scr = $('scr-reward');
    if (scr) scr.onpointerdown = null;
    if (natural) { /* the tally ran to the end on its own */ }
  }

  /* The fight's loot, rolled at the end of a won fight (endFight): the
     payout lines and totals (the base gold roll plus bonus lines), the
     lucky DOUBLE, the capsules (elites and bosses drop one; a jackpot or a
     tier 3 combo adds a bonus one) and the run highlights. */
  function lootReward(rw) {
    const run = lootRun();
    if (!run || !rw || !F) return rw;
    const st = F.stats || {};
    const jp = FS && FS.loot ? Math.max(0, run.jackpots - FS.loot.jp0) : 0;
    const combos = [];
    for (const id in (F.combos || {})) { const c = tbl('COMBOS')[id]; for (let i = 0; i < F.combos[id]; i++) combos.push({ name: c ? c.name : id, tier: comboTier(id) }); }
    const double = rngFor('double')() < (LT().DOUBLE || 0.05);
    if (D().payout) {
      try {
        const pay = D().payout({ tier: rw.tier, gold: rw.gold, jackpots: jp, combos, dmgTaken: st.dmgTaken, turns: F.turn, overkill: st.overkill, double });
        rw.pay = pay.lines; rw.gold = pay.gold; rw.tix = pay.tix; rw.double = double;
      } catch (e) { /* the plain reward stands */ }
    }
    rw.caps = [];
    if (rw.tier === 'elite' || rw.tier === 'boss') rw.caps.push(makeCapsule(rw.tier));
    if (jp > 0 || combos.some((c) => c.tier >= 3)) rw.caps.push(makeCapsule('bonus'));
    const L = run.loot;
    L.bigHit = Math.max(L.bigHit, st.bigHit || 0);
    L.overkill = Math.max(L.overkill, st.overkill || 0);
    for (const c of combos) if (!L.bestCombo || c.tier >= L.bestCombo.tier) L.bestCombo = { name: c.name, tier: c.tier };
    if (st.dmgTaken === 0) L.flawless++;
    if (double) L.doubles++;
    return rw;
  }
  // Capsules left unopened when the reward screen closes go to the bank.
  function lootBank(rw) {
    const run = lootRun();
    if (!run || !rw || !rw.caps || rw.banked) return;
    rw.banked = true;
    const left = rw.caps.filter((c) => !c.opened);
    if (!left.length) return;
    for (const c of left) run.caps.push(c);
    toast(`${left.length === 1 ? 'Capsule' : left.length + ' capsules'} saved for later. Open ${left.length === 1 ? 'it' : 'them'} from the map.`, 2.4);
  }
  // The capsule slots on the reward screen: tap one to crack it right there.
  function lootCapSlots(box, rw) {
    (rw.caps || []).forEach((cap, i) => {
      const done = !!cap.opened;
      const el = h('button', 'capslot' + (done ? ' done' : ''));
      try { el.style.setProperty('--cc', capCol(done ? cap.tier : cap.tier0)); } catch (e) { /* stub */ }
      el.appendChild(capCanvas(done ? cap.tier : cap.tier0, 48));
      const col = h('div', 'col');
      col.appendChild(h('div', 'c1', `${capName(done ? cap.tier : cap.tier0)} capsule`));
      col.appendChild(h('div', 'c2', done ? `Opened: ${prizeOf(cap.prize).name}` : `${CAP_SRC[cap.src] || 'Bonus'}! Tap to crack it open.`));
      el.appendChild(col);
      el.onclick = () => { if (!cap.opened) openRewardCap(rw, i); };
      box.appendChild(el);
    });
  }
  function openRewardCap(rw, i) {
    const cap = rw && rw.caps && rw.caps[i];
    if (!cap || cap.opened) return false;
    showCapsule({ cap, then: { k: 'reward', rw }, rwIdx: i });
    return true;
  }
  // The map head chip for banked capsules (a pulsing capsule and a count).
  function lootMapChip(row) {
    const run = lootRun();
    if (!run || !run.caps.length) return;
    const cap = run.caps[0];
    const chip = h('button', 'brush capchip');
    try { chip.style.setProperty('--cc', capCol(cap.tier0)); } catch (e) { /* stub */ }
    chip.appendChild(capCanvas(cap.tier0, 34));
    chip.appendChild(h('span', null, run.caps.length > 1 ? `x${run.caps.length}` : 'Open'));
    const fn = () => openBankedCap();
    chip.onclick = fn;
    S.ui.buttons.push({ el: chip, fn, label: 'Capsule' });
    row.appendChild(chip);
  }
  function openBankedCap() {
    const run = lootRun();
    if (!run || !run.caps.length) return false;
    showCapsule({ cap: run.caps[0], then: { k: 'map' }, bank: true });
    return true;
  }

  // ---- tickets streaming out of the cabinet during a fight
  /* A jackpot or a combo spits tickets from the marquee at once; the rest
     stream out in the victory outro. Each ticket arcs up, flutters, then
     zips into the HUD's ticket counter, which ticks up as they land. The
     payout screen then tallies the same total. Visual only: the tickets are
     paid by the reward (lootReward), never twice. */
  const TIX_MAX = 64;
  const TIX_COLS = ['#ff9ec7', '#ff9ec7', '#ffc94d', '#ff9ec7', '#8dfff5'];
  function tixShown() { const run = S.run; return (run ? (run.tickets || 0) : 0) + (S.tix ? S.tix.arrived : 0); }
  function tixWatch() {
    const run = lootRun();
    if (!run || !F || !FS) return;
    if (!FS.loot) FS.loot = { jp0: run.jackpots, jp: run.jackpots, combo: 0, queued: 0 };
    if (!S.tix || S.tix.fs !== FS) S.tix = { fs: FS, list: [], q: 0, t: 0, arrived: 0, strip: 0, rng: U.rng((FS.seed ^ 0x71c3) >>> 0), last: null };
    const T = LT().TICKETS || {};
    if (run.jackpots > FS.loot.jp) { tixSpit((run.jackpots - FS.loot.jp) * (T.jackpot || 3)); FS.loot.jp = run.jackpots; }
    let sum = 0;
    for (const id in (F.combos || {})) sum += F.combos[id] * comboTier(id);
    if (sum > FS.loot.combo) { tixSpit((sum - FS.loot.combo) * (T.combo || 1)); FS.loot.combo = sum; }
  }
  function tixSpit(n) {
    if (!S.tix || !(n > 0)) return;
    S.tix.q += n; S.tix.strip++; S.tix.last = null;
    if (FS && FS.loot) FS.loot.queued += n;
  }
  // The victory outro streams the rest of the fight's tickets.
  function lootOutro(rw) {
    tixWatch();
    if (!S.tix || !FS || !FS.loot) return;
    tixSpit(Math.max(0, (rw.tix || 0) - FS.loot.queued));
    // hold the victory beat until most of the stream has landed (a tap still skips)
    if (FS.outro && S.tix.q > 0 && !fx().reduced) FS.outro.t = Math.max(FS.outro.t, Math.min(2.4, 0.9 + S.tix.q * 0.03));
  }
  function tixEmit(X0) {
    let k = X0.list.find((o) => !o.on);
    if (!k) {
      if (X0.list.length < TIX_MAX) { k = {}; X0.list.push(k); } else { k = X0.list[0]; if (k.on) { X0.arrived++; } X0.list.push(X0.list.shift()); }
    }
    const r = X0.rng, side = (X0.strip % 2 ? 1 : -1);
    const slot = { x: CAB.x + CAB.w * 0.5 + side * 130, y: CAB.y - 16 };
    k.on = true; k.age = 0; k.x = slot.x; k.y = slot.y;
    k.vx = side * (60 + r() * 190); k.vy = -540 - r() * 260; k.a = r() * 6; k.va = (r() - 0.5) * 18;
    k.fly = 0.5 + r() * 0.35; k.home = 0.32 + r() * 0.2; k.col = TIX_COLS[Math.floor(r() * TIX_COLS.length)];
    k.prev = X0.last && X0.last.on && X0.last.age < 0.25 ? X0.last : null;
    X0.last = k;
    X0.hot = 0.3;
    snd('ticket', { pitch: 0.9 + r() * 0.3 });
  }
  function tixTick(dt) {
    const X0 = S.tix;
    if (!X0) return;
    if (X0.q > 0) {
      X0.t -= dt;
      const gap = X0.q > 24 ? 0.022 : 0.038;
      let guard = 0;
      while (X0.t <= 0 && X0.q > 0 && guard++ < 8) { X0.t += gap; X0.q--; tixEmit(X0); }
    } else X0.t = 0;
    X0.hot = Math.max(0, (X0.hot || 0) - dt);
    let tgt = null;
    for (const k of X0.list) {
      if (!k.on) continue;
      k.age += dt;
      if (k.age < k.fly) {
        k.vy += 1100 * dt; k.vx *= 1 - 1.4 * dt; k.vy *= 1 - 0.9 * dt;
        k.x += k.vx * dt; k.y += k.vy * dt; k.a += k.va * dt;
        k.hx = k.x; k.hy = k.y;
      } else {
        if (!tgt) tgt = S.headless ? TIX_HUD : hudPoint($('tixTxt'), TIX_HUD.x, TIX_HUD.y);
        const u = Math.min(1, (k.age - k.fly) / k.home), e = u * u;
        k.x = U.lerp(k.hx, tgt.x, e); k.y = U.lerp(k.hy, tgt.y, e) - Math.sin(u * Math.PI) * 30; k.a += dt * 12;
        k.prev = null;
        if (u >= 1) { k.on = false; X0.arrived++; tixArrive(X0); }
      }
    }
  }
  function tixArrive(X0) {
    const v = tixShown();
    S.lastTix = v;
    rollTo('tixTxt', v, true);
    replay($('tixStat'), 'bump');
    if (S.t - (S.tixSndT || 0) > 0.05) { S.tixSndT = S.t; snd('tick', { pitch: 1.2 + (X0.arrived % 12) * 0.04 }); }
  }
  function drawTix(ctx) {
    const X0 = S.tix, R = X.RENDER;
    if (!X0 || !R || !R.ticket) return;
    ctx.save();
    // the ticket slots on the marquee glow while they print
    if (X0.q > 0 || X0.hot > 0) {
      for (const side of [-1, 1]) {
        const sx = CAB.x + CAB.w * 0.5 + side * 130, sy = CAB.y - 16;
        ctx.fillStyle = 'rgba(255,46,136,0.35)';
        ctx.beginPath(); ctx.ellipse(sx, sy, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#12091f'; ctx.strokeStyle = '#ff9ec7'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(sx - 18, sy - 3, 36, 6); ctx.fill(); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,158,199,0.55)'; ctx.lineWidth = 3;
    for (const k of X0.list) {
      if (!k.on || !k.prev || !k.prev.on) continue;
      ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(k.prev.x, k.prev.y); ctx.stroke();
    }
    ctx.restore();
    for (const k of X0.list) if (k.on) R.ticket(ctx, k.x, k.y, 28, 15, k.a, k.col);
  }
  // The HUD ticket counter (a roll like gold; the fight shows the tickets landed so far).
  function lootHud(force) {
    const v = tixShown();
    if (force || v !== S.lastTix) { S.lastTix = v; rollTo('tixTxt', v, false); }
  }
  // Per-frame loot work (called from update with the real dt).
  function lootTick(dt) {
    if (S.screen === 'reward') payTick(dt);
    else if (S.screen === 'capsule') capTick(dt);
    if (S.screen === 'fight' && F && FS) tixWatch();
    if (S.tix) { if (S.screen === 'fight') tixTick(dt); else S.tix = null; }
  }
  // Drawn just under the fx layer: the ticket stream in a fight, the capsule scene.
  function drawLoot(ctx, t) {
    if (S.screen === 'fight') drawTix(ctx);
    else if (S.screen === 'capsule') drawCapsule(ctx, t);
  }

  // ---- the prize counter (inside every shop)
  /* A glass case of six prizes priced in tickets (DATA.prizeShelf, rolled
     once per shop and saved with it). A buy flies ticket stubs into the
     slot, stamps it WON and pays the prize; a capsule opens on the spot and
     comes back here. */
  function showCounter(shop) {
    const run = lootRun();
    if (!shop.counter) {
      let shelf = [];
      if (D().prizeShelf) { try { shelf = D().prizeShelf(rngFor('counter'), run.act, capCtx()) || []; } catch (e) { shelf = []; } }
      shop.counter = shelf;
    }
    S.sd = { counter: shop };
    setScreen('counter');
    const b = $('counterBody');
    clear(b);
    const won = S.justWon; S.justWon = null;
    const head = h('div', 'counterHead');
    head.appendChild(h('h1', null, 'Prize counter'));
    const bal = h('span', 'tixbal', `${run.tickets} `);
    bal.appendChild(h('i', 'tixi'));
    bal.id = 'tixBal';
    if (won != null) bal.classList.add('dip');
    head.appendChild(bal);
    b.appendChild(head);
    b.appendChild(h('div', 'sub', 'Trade arcade tickets for prizes. Jackpots, combos, flawless and speedy wins print more.'));
    const caseEl = h('div', 'case');
    const shelf = h('div', 'shelf');
    shop.counter.forEach((s, i) => {
      const info = prizeOf(s);
      const slot = h('div', 'slot' + (s.sold ? ' sold' : '') + (!s.sold && run.tickets < s.price ? ' poor' : ''));
      const cv = prizeCanvas(s, 64);
      if (cv) slot.appendChild(cv); else slot.appendChild(h('div', 'big', info.icon || '?'));
      slot.appendChild(h('div', 'sn', info.name));
      const tag = h('span', 'ptag', `${s.price} `);
      tag.appendChild(h('i', 'tixi'));
      slot.appendChild(tag);
      if (s.sold) slot.appendChild(h('div', 'stamp' + (won === i ? ' slam' : ''), 'WON'));
      if (won === i) replay(slot, 'won');
      const fn = () => counterBuy(shop, i, slot);
      slot.onclick = fn;
      S.ui.buttons.push({ el: slot, fn, label: info.name, disabled: !!s.sold });
      shelf.appendChild(slot);
    });
    caseEl.appendChild(shelf);
    b.appendChild(caseEl);
    b.appendChild(btn('Back to the shop', () => { S.sd = null; showShop(shop); }, 'pri'));
    save();
  }
  function counterBuy(shop, i, slot) {
    const run = lootRun(), s = shop.counter && shop.counter[i];
    if (!s || s.sold) return false;
    if (run.tickets < s.price) { toast('Not enough tickets. Jackpots, combos and flawless wins print more.'); replay(slot, 'nope'); snd('click'); return false; }
    // ticket stubs fly from the balance into the slot, then the stamp
    if (!S.headless && slot) {
      const bp = hudPoint($('tixBal'), 460, 40), sp = hudPoint(slot, 270, 400);
      const n = U.clamp(Math.round(s.price / 10), 3, 9);
      for (let k = 0; k < n; k++) domFly(h('div', 'dtix'), bp.x + (k - n / 2) * 5, bp.y, sp.x, sp.y, 420, k * 40);
      setTimeout(() => snd('stamp'), 400);
    }
    addTickets(-s.price);
    s.sold = true;
    snd('buy');
    haptic('hit');
    S.justWon = i;
    if (s.k === 'cap') {
      const cap = makeCapsule('counter', { tier: s.tier });
      showCapsule({ cap, then: { k: 'counter', shop } });
      return true;
    }
    const p = s.k === 'item' ? { k: 'item', id: s.id, plus: !!s.plus } : s.k === 'tool' ? { k: 'tool', id: s.id } : { k: s.k, n: s.n };
    grantPrize(p);
    if (p.k === 'item' && slot) flyCard(slot, itemDef(p.id), p.plus);
    toast(`Won: ${prizeOf(p).name}!`);
    showCounter(shop);
    return true;
  }

  // ---- run highlights (game over and win)
  function lootHighlights(run) {
    const L = (lootRun(run) || {}).loot || {};
    const grid = h('div', 'hl');
    let k = 0;
    const tile = (label, v, sub, cls) => {
      const el = h('div', 'hlt ' + (cls || ''));
      try { el.style.animationDelay = (k++ * 0.08).toFixed(2) + 's'; } catch (e) { /* stub */ }
      el.appendChild(h('span', 'k', label));
      el.appendChild(h('span', 'v', String(v)));
      if (sub) el.appendChild(h('span', 's', sub));
      grid.appendChild(el);
    };
    tile('Biggest hit', L.bigHit || 0, L.overkill ? `best overkill ${L.overkill}` : '', 'pink');
    tile('Best combo', L.bestCombo ? L.bestCombo.name : 'none yet', L.bestCombo ? '★'.repeat(L.bestCombo.tier) : '', 'gold');
    tile('Jackpots', run.jackpots || 0, L.flawless ? `${L.flawless} flawless ${L.flawless === 1 ? 'win' : 'wins'}` : '', 'cyan');
    tile('Capsules', L.capsOpened || 0, L.bestCap ? `best: ${capName(L.bestCap)}` : 'none opened', 'pink');
    tile('Tickets won', L.tixEarned || 0, L.doubles ? `${L.doubles} double ${L.doubles === 1 ? 'reward' : 'rewards'}` : '', 'lime');
    tile('Gold paid out', L.payGold || 0, `${run.kills || 0} kills`, 'gold');
    return grid;
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
    const sold = S.justSold; S.justSold = null;
    b.appendChild(h('h1', null, 'Shop'));
    const top = h('div', 'row');
    const goldTag = h('span', 'tag gold big', `${run.gold} gold`);
    goldTag.id = 'shopGold';
    if (sold) goldTag.classList.add('dip');
    top.appendChild(goldTag);
    top.appendChild(h('span', 'sub', 'Tap to buy. Sell from your bin for a third of the price.'));
    b.appendChild(top);
    // the prize counter's sign sits up top; its button is registered last
    // (after Leave) so the shop's own buttons keep their indices
    const counterRow = h('div', 'col');
    b.appendChild(counterRow);
    b.appendChild(h('h3', null, 'Items'));
    const cards = h('div', 'cards');
    shop.items.forEach((it, i) => {
      const def = itemDef(it.id);
      let card = null;
      card = itemCard(def, false, { price: it.price, sold: it.sold, justSold: sold === 'i' + i, deal: sold ? null : i, onPick: () => {
        if (run.gold < it.price) { toast('Not enough gold.'); replay(card, 'nope'); return; }
        buyFx(card, it.price);
        addGold(-it.price); it.sold = true; addItem(it.id); snd('buy'); toast(`Bought ${def.name}.`); S.justSold = 'i' + i; showShop(shop);
      } });
      cards.appendChild(card);
    });
    b.appendChild(cards);
    const sec = h('div', 'cards two');
    if (shop.relic) {
      const def = relicDef(shop.relic.id);
      const card = h('div', 'card rr-' + (def.rarity || 'c') + (shop.relic.sold ? ' sold' : ''));
      card.appendChild(relicCanvas(def, 64));
      card.appendChild(h('div', 'name', def.name));
      card.appendChild(h('div', 'text', def.text || ''));
      const kw = kwChips(def);
      if (kw) card.appendChild(kw);
      card.appendChild(h('div', 'price', shop.relic.sold ? 'SOLD' : shop.relic.price + ' gold'));
      if (shop.relic.sold) card.appendChild(h('div', 'stamp' + (sold === 'relic' ? ' slam' : ''), 'SOLD'));
      const fn = () => {
        if (shop.relic.sold) return;
        if (run.gold < shop.relic.price) { toast('Not enough gold.'); replay(card, 'nope'); return; }
        buyFx(card, shop.relic.price);
        addGold(-shop.relic.price); shop.relic.sold = true; gainRelic(shop.relic.id); snd('buy'); toast(`Bought ${def.name}.`); S.justSold = 'relic'; showShop(shop);
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
      if (!S.headless) { const gp = hudPoint($('shopGold'), 100, 80); for (let i = 0; i < 5; i++) domFly(h('div', 'dcoin'), 270 + (i - 2) * 14, 520, gp.x, gp.y, 480, i * 60); }
    } }), 'sm'));
    b.appendChild(row);
    b.appendChild(btn('Leave', () => toMap(), 'pri'));
    const pc = h('button', 'capslot');
    const pcFn = () => showCounter(shop);
    pc.onclick = pcFn;
    S.ui.buttons.push({ el: pc, fn: pcFn, label: 'Prize counter' });
    try { pc.style.setProperty('--cc', '#ff9ec7'); } catch (e) { /* stub */ }
    pc.appendChild(capCanvas('r', 48));
    const pcol = h('div', 'col');
    pcol.appendChild(h('div', 'c1', 'Prize counter'));
    pcol.appendChild(h('div', 'c2', `${lootRun().tickets} tickets to spend. Capsules, hearts and prizes behind glass.`));
    pc.appendChild(pcol);
    counterRow.appendChild(pc);
    save();
  }
  // Coins arc from the gold tag into the card being bought, then the stamp.
  function buyFx(card, price) {
    if (S.headless) return;
    const gp = hudPoint($('shopGold'), 100, 80), cp = hudPoint(card, 270, 400);
    const n = U.clamp(Math.round(price / 25), 3, 8);
    for (let i = 0; i < n; i++) domFly(h('div', 'dcoin'), gp.x + (i - n / 2) * 6, gp.y, cp.x, cp.y, 420, i * 45);
    setTimeout(() => snd('stamp'), 380);
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
        case 'ink': addInk(f.v); toast(`${f.v > 0 ? '+' : ''}${bulbs(f.v)}`); break;
        case 'brush': { const id = toolId(f.id || (toolIds().length ? rngFor('brush').pick(toolIds()) : 'lantern')); addBrush(id); toast(`Got a ${TERM('brush')}: ${toolDef(id).name}.`); break; }
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
    b.appendChild(h('h3', null, 'Highlights'));
    b.appendChild(lootHighlights(run));
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
    b.appendChild(h('h3', null, 'Highlights'));
    b.appendChild(lootHighlights(run));
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
    // In a fight the gold is the fight's view of it (pay fx spend mid-fight).
    let gold = run.gold;
    if (F && X.COMBAT && X.COMBAT.gold) { try { const g = X.COMBAT.gold(F); if (g >= 0) gold = g; } catch (e) { /* run gold */ } }
    const key = [hp, max, block, gold, run.ink, run.act, run.char].join('|');
    if (force || key !== S.lastHud) {
      S.lastHud = key;
      const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      // the numbers roll (headless snaps); the hp bar drains with a ghost chunk
      rollTo('hpTxt', hp, false, (v) => `${v}/${max}`);
      set('blockTxt', block ? `+${block} block` : '');
      rollTo('goldTxt', gold, false);
      rollTo('inkTxt', run.ink, false);
      set('actTxt', `${run.act} of 3`);
      const pct = U.clamp(hp / Math.max(1, max), 0, 1) * 100;
      const fl = $('hpFill'), gh = $('hpGhost'), hs = $('hpStat');
      if (fl && fl.style) fl.style.width = pct.toFixed(1) + '%';
      if (gh && gh.style) gh.style.width = pct.toFixed(1) + '%';
      if (hs && hs.classList) { hs.classList[hp > 0 && pct < 30 ? 'add' : 'remove']('low'); hs.classList[block > 0 ? 'add' : 'remove']('shielded'); }
      if (force) {
        const pc = $('portrait');
        if (pc && X.RENDER && X.RENDER.portrait) {
          try { const c = pc.getContext('2d'); if (c) { c.clearRect(0, 0, 108, 108); X.RENDER.portrait(c, run.char, 54, 54, 96, S.t); } } catch (e) { /* optional */ }
        }
        if (pc) pc.onclick = () => popover(`<b>${(charDef(run.char) || {}).name || run.char}</b><br>${hp}/${max} hp` + (block ? `, ${block} block` : '') + `<br>Claw: ${clawFor().grabs} grabs, width ${U.fmt(clawFor().width)}, grip ${U.fmt(clawFor().grip)}, ${clawFor().prongs} prongs`, 60, 70);
      }
    }
    lootHud(force);   // the ticket counter
    const rk = run.relics.join(',');
    if (force || rk !== S.lastRelics) {
      S.lastRelics = rk;
      const el = $('relics');
      clear(el);
      S.relicEls = {};
      for (const id of run.relics) {
        const def = relicDef(id);
        const r = h('button', 'relic');
        S.relicEls[id] = r;
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
        S.pipEls = {};
        for (const id in st) {
          const sd = tbl('STATUS')[id] || { name: id, icon: '', kind: 'buff', text: '' };
          const p = h('button', 'pip ' + (sd.kind || ''), `${sd.icon || ''}${st[id]}`);
          p.style.borderColor = sd.color || '';
          S.pipEls[id] = p;
          if (S.pipPop === id) { p.classList.add('pop'); S.pipPop = null; }
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
    if (FS.outro) { if (type === 'down') finishOutro(); return; }
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
    if (S.screen === 'capsule') { if (down && !ev.repeat && (k === ' ' || k === 'Enter')) { if (ev.preventDefault) ev.preventDefault(); capsuleTap(); } return; }
    if (S.screen === 'reward' && S.pay && !S.pay.done) { if (down && (k === ' ' || k === 'Enter')) finishPay(); return; }
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
    if (off.r) { ctx.translate(W / 2, H / 2); ctx.rotate(off.r); ctx.translate(-W / 2, -H / 2); }
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
    drawLoot(ctx, t);   // the ticket stream / the capsule scene, under the particles
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
      if (t.coast) dirs.forEach(([dq, dr], i) => { const n = X.MAP.tileAt(M, t.q + dq, t.r + dr); if (n && (n.terrain === 'sea' || n.terrain === 'shallow')) mask |= 1 << edgeOf[i]; });
      const terr = t.terrain || 'land';
      const fill = R && R.terrainFill ? R.terrainFill(biome, terr, t.elev || 0, t.ground) : (terr === 'sea' ? '#173142' : terr === 'shallow' ? '#3b7d86' : '#8a8570');
      // the neighbour on each drawn edge, for the glow where light meets dark
      const nb = dirs.map(([dq, dr]) => X.MAP.tileAt(M, t.q + dq, t.r + dr));
      const nbEdge = dirs.map((d, i) => edgeOf[i]);
      items.push({ t, k, wx: w.x, wy: w.y, fill, mask, seed: U.hashStr(k), nb, nbEdge });
    }
    const road = (M.road || []).map(([q, r]) => worldOf(q, r));
    S.mapPaint = { M, biome, items, road, hidden: [], pool: [], st: {}, cur: { x: 0, y: 0 }, rims: [] };
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
    // Where the armed tool could go: a flare's six lines, a lantern's lit
    // hexes, a kite's dark hexes in range.
    const brushable = new Set();
    const kind = S.brushSel && X.MAP.toolKind ? X.MAP.toolKind(S.brushSel) : null;
    if (kind === 'line' && X.MAP.flareCells) { for (let d = 0; d < 6; d++) for (const [q, r] of X.MAP.flareCells(M, d)) brushable.add(X.MAP.key(q, r)); }
    else if (kind === 'ring') { for (const k in M.tiles) if (M.tiles[k].revealed && M.tiles[k].terrain !== 'sea') brushable.add(k); }
    else if (kind === 'patch' && X.MAP.hexDist) { for (const k in M.tiles) { const x = M.tiles[k]; if (!x.revealed && x.terrain !== 'sea' && X.MAP.hexDist(M.pos.q, M.pos.r, x.q, x.r) <= (X.MAP.KITE_RANGE || 6)) brushable.add(k); } }
    else if (S.brushSel && X.MAP.revealable) for (const x of X.MAP.revealable(M, { brush: true })) brushable.add(X.MAP.key(x.q, x.r));
    const pv = S.preview && ((S.preview.path && S.preview.path.length) || (S.preview.cells && S.preview.cells.length)) ? S.preview : null;
    const onPath = {};
    if (pv) (pv.tool ? pv.cells : pv.path).forEach(([q, r], i) => { onPath[X.MAP.key(q, r)] = i + 1; });
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
    // Pass 2: coast, darkness, pickups and states on every hex (the sea
    // too: unlit water is dark). Lit hexes with a dark neighbour note the
    // edges that face it for the glow pass.
    const hidden = P.hidden, rims = P.rims;
    hidden.length = 0; rims.length = 0;
    const wxy = walkXY();
    const isDark = (n) => n && !n.revealed && n.type !== 'boss';
    let curXY = null, np = 0;
    for (const it of P.items) {
      const tile = it.t;
      const x = it.wx * z + ox, y = it.wy * z + oy;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const cur = tile.q === M.pos.q && tile.r === M.pos.r;
      if (cur) { P.cur.x = x; P.cur.y = y; curXY = P.cur; }
      const dark = isDark(tile);
      if (dark && tile.terrain !== 'shallow') { const pt = P.pool[np] || (P.pool[np] = { x: 0, y: 0 }); pt.x = x; pt.y = y; hidden.push(pt); np++; }
      let darkMask = 0, nearLight = false;
      for (let i = 0; i < 6; i++) { const n = it.nb[i]; if (!n) continue; if (dark) { if (!isDark(n)) nearLight = true; } else if (isDark(n)) darkMask |= 1 << it.nbEdge[i]; }
      if (darkMask) { const pt = P.pool[np] || (P.pool[np] = { x: 0, y: 0 }); pt.x = x; pt.y = y; pt.mask = darkMask; rims.push(pt); np++; }
      st.reachable = reach.has(it.k); st.current = cur; st.hover = brushable.has(it.k); st.nearLight = nearLight;
      st.canReveal = dark && X.MAP.canReveal(M, tile.q, tile.r);
      st.path = onPath[it.k] || 0; st.flare = !!(pv && pv.tool); st.target = !!(pv && !pv.tool && pv.q === tile.q && pv.r === tile.r); st.known = !!tile.known;
      st.road = !!tile.road; st.walking = true;   // the marker is drawn after the road, never by hex()
      st.fill = it.fill; st.mask = it.mask; st.seed = it.seed;
      if (R && R.hex) R.hex(ctx, x, y, size, tile, st);
      else {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i + (flat ? 0 : -30)); ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a)); }
        ctx.closePath(); ctx.fillStyle = tile.revealed ? '#2c1d4a' : '#150c26'; ctx.fill(); ctx.strokeStyle = '#3d2a63'; ctx.stroke();
      }
      if (it.bloomAt) drawBloom(ctx, it, x, y, size, t, flat);
    }
    // Pass 3: the warm glow where the light meets the dark, over the darkness.
    if (R && R.lightRim) for (const p of rims) R.lightRim(ctx, p.x, p.y, size, p.mask, flat, t);
    // The road: a worn track between its hexes, over the ground and the pickups.
    if (P.road.length > 1 && R && R.mapRoad) R.mapRoad(ctx, P.road.map((w) => ({ x: w.x * z + ox, y: w.y * z + oy })), size, t);
    // The start-boss axis shows through the dark so the direction is obvious.
    if (R && R.mapAxis && hidden.length) { const a = hexToStage(M.start.q, M.start.r), b = hexToStage(M.boss.q, M.boss.r); R.mapAxis(ctx, a.x, a.y, b.x, b.y, size, hidden, t, flat); }
    // The crawler and the portrait: on the current hex, or easing between
    // hexes while a walk plays (hex() left the crawler out then).
    drawBossPulse(ctx, t, size);
    drawBeam(ctx, t, size);
    drawAmbient(ctx);
    const meXY = wxy || curXY;
    if (meXY && R && R.crawler) R.crawler(ctx, meXY.x, meXY.y, size, t);
    if (meXY && R && R.portrait) R.portrait(ctx, run.char, meXY.x, meXY.y, size * 1.2, t);
    if (pv && R && R.mapPath) {
      if (pv.tool) {
        // the flare: a line from the player through the hexes it would light
        const pts = [hexToStage(M.pos.q, M.pos.r)].concat(pv.cells.map(([q, r]) => hexToStage(q, r)));
        R.mapPath(ctx, pts, size, { label: pv.label, color: '#ffb347', t });
      } else {
        // Draw the way from the lit hex it grows out of.
        const pts = pv.path.map(([q, r]) => hexToStage(q, r));
        const [fq, fr] = pv.path[0];
        const from = X.MAP.neighbors(M, fq, fr).map(([q, r]) => M.tiles[X.MAP.key(q, r)]).find((n) => n.revealed && (n.type !== 'boss' || n.visited));
        if (from) pts.unshift(hexToStage(from.q, from.r));
        R.mapPath(ctx, pts, size, { cost: pv.cost, ink: M.ink, label: pv.label, unit: TERM('inkPlural'), t });
      }
    }
    ctx.restore();
    // Off-screen boss: an arrow on the edge of the map area pointing at it.
    const ba = bossArrow();
    if (ba && R && R.mapArrow) R.mapArrow(ctx, ba.x, ba.y, ba.a, 16, t, 'Boss');
    if (R && R.mapCompass) R.mapCompass(ctx, A.x + A.w - 42, A.y + A.h - 42, 28, t);
    if (R && R.mapHeader) {
      const pr = X.MAP.progress ? X.MAP.progress(M) : null;
      R.mapHeader(ctx, A.x + 10, A.y + A.h - 42, 190, 32, actDef(run.act).name, pr ? `${pr.revealed} of ${pr.total} hexes lit` : '', t);
    }
  }
  // Reused per-frame objects for the fight draw (no allocation per enemy).
  const EST = { hurt: 0, attack: 0, dead: 0, frozen: false, poisoned: false, burning: false, chilled: false, windup: 0, enraged: false, rage: 0, chomp: 0, spit: 0 };
  const HPO = { ghost: 0, flash: 0, shield: 0 };
  const CLAWJ = { bend: 0, squash: 0, speed: 0, glow: 0, t: 0, idle: 0, mood: '', blink: 0, look: 0, chase: 0, lucky: 0, pull: [], pullN: 0 };
  for (let i = 0; i < 8; i++) CLAWJ.pull.push({ x: 0, y: 0 });
  // Reused per-item material look (RENDER.itemFx).
  const MST = { mat: null, t: 0, seed: 0, crack: 0, slosh: 0, fuse: 0, golden: false, mag: 0, melt: 0 };
  const MAG_R2 = 110 * 110;
  const RARE_A = { u: 0.22, r: 0.4, l: 0.5 };
  function drawFight(ctx, t) {
    const R = X.RENDER, run = S.run;
    if (R && R.bg) R.bg(ctx, W, H, run.act, t); else { ctx.fillStyle = '#1b1030'; ctx.fillRect(0, 0, W, H); }
    drawAmbient(ctx);
    // Enemies.
    F.enemies.forEach((e, i) => {
      const p = enemyPos(i);
      const a = anim(i);
      // Combat resolves in one go, so an enemy can be dead in the state while
      // its 'die' event is still queued for its beat: keep drawing it alive
      // until the event plays, then the fall animation runs once.
      const pendingDeath = !e.alive && !a.dead;
      if (!e.alive && a.dead >= 1) return;
      const live = e.alive || pendingDeath;
      // knockback away from the player (+x), a summon grows in
      const kx = (a.knock > 0 ? U.ease.outCubic(Math.min(1, a.knock)) * 14 : 0);
      const ex = p.x + kx;
      const sc = p.scale * (a.spawn > 0 ? 1 - a.spawn * 0.7 + Math.sin(a.spawn * Math.PI) * 0.15 : 1);
      EST.hurt = a.hurt; EST.attack = a.attack; EST.dead = live ? 0 : a.dead;
      EST.frozen = !!(e.status.freeze); EST.poisoned = !!(e.status.poison); EST.burning = !!(e.status.burn); EST.chilled = !!(e.status.chill);
      EST.windup = a.windV || 0;
      if (i === F.target && e.alive) {
        ctx.save(); ctx.strokeStyle = '#ff2e88'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, Math.max(40, p.w * 0.5), 11, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      monsterBack(ctx, e, i, ex, p, t, live);
      if (live && R && R.enemyAura) R.enemyAura(ctx, ex, p.y, p.w, p.h, e.status, t, 'back');
      if (R && R.enemy) R.enemy(ctx, e.def, ex, p.y, sc, t, EST);
      if (!live) return;
      if (R && R.enemyAura) R.enemyAura(ctx, ex, p.y, p.w, p.h, e.status, t, 'front');
      monsterFront(ctx, e, i, ex, p, t);
      // hp bar under the feet (a ghost chunk drains behind a hit, the bar
      // shakes), status pips under that, intent above the head
      const bw = U.clamp(p.w * 0.9, 84, 150);
      const sh = (FS.queue.length || FS.enemyTurn) && FS.shown.e[i] ? FS.shown.e[i] : e;
      const g = FS.ghost[i];
      HPO.ghost = g ? g.v : 0; HPO.flash = a.barFlash || 0; HPO.shield = sh.block > 0 ? t * 0.6 : 0;
      const bs = a.barShake > 0 ? Math.sin(t * 90) * a.barShake * 3 : 0;
      if (R && R.hpBar) R.hpBar(ctx, p.x - bw / 2 + bs, p.y + 10, bw, 12, sh.hp, e.maxHp, sh.block, HPO);
      if (R && R.statusPips) R.statusPips(ctx, p.x - bw / 2, p.y + 26, e.status, 14, FS.pipPop[i]);
      if (R && R.intent) R.intent(ctx, p.x, intentY(p), e, t);
    });
    // The rig.
    const cfg = { w: CAB.w, h: CAB.h, chuteW: CAB.chuteW, dividerH: CAB.dividerH, frame: CAB.frame, railY: 26, slopeW: CAB.slopeW, slopeH: CAB.slopeH, chuteX: FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW, claw: clawFor() };
    const cabSt = { fog: FS.fog > 0 ? 1 : 0, grease: FS.grease > 0 ? 1 : 0, tilt: FS.tilt, act: run.act, t, party: Math.min(1, FS.party), marquee: FS.marquee };
    const split = R && R.cabinetBack && R.cabinetFront;
    if (split) R.cabinetBack(ctx, CAB.x, CAB.y, cfg, cabSt);
    else if (R && R.cabinet) R.cabinet(ctx, CAB.x, CAB.y, cfg, cabSt);
    else { ctx.fillStyle = '#0d0718'; ctx.fillRect(CAB.x - CAB.frame, CAB.y - CAB.frame, CAB.w + CAB.frame * 2, CAB.h + CAB.frame * 2); ctx.fillStyle = '#1b1030'; ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h); }
    ctx.save();
    ctx.beginPath(); ctx.rect(CAB.x, CAB.y, CAB.w, CAB.h); ctx.clip();
    const rigPh = FS.rig ? FS.rig.phase : 'idle';
    const inHand = (rigPh === 'lifting' || rigPh === 'carrying') ? carried() : null;
    const RC = R && R.RARITY_COL;
    // the magnet tugs at nearby metal while the claw drops and closes
    const pullOn = !!(FS.rig && FS.rig.cfg && FS.rig.cfg.magnet && (rigPh === 'dropping' || rigPh === 'closing'));
    CLAWJ.pullN = 0;
    for (const b of FS.items) {
      const inst = b.data.inst;
      const inChute = FS.cabinet && FS.cabinet.inChute(b);
      const held = inHand && inHand.indexOf(b) >= 0;
      const sq = b.data.sq > 0.02 ? b.data.sq : 0;
      const x = CAB.x + b.x, y = CAB.y + b.y;
      const rar = b.data.def.rarity;
      // rarity: a soft outline glow for uncommon and up (legendary pulses)
      let glowC = inChute ? 1 : (held ? '#2ee6d6' : 0), glowA = null;
      if (!glowC && RC && RARE_A[rar] && !inst.frozen) { glowC = RC[rar]; glowA = rar === 'l' ? RARE_A.l + Math.sin(t * 4 + b.x * 0.05) * 0.2 : RARE_A[rar]; }
      // material looks: magic hovers, rubber stretches along its flight,
      // food wobbles, melting ice is drawn at its shrunken size
      const d = b.data, mat = d.mat, ms = FS.mst[inst.uid];
      const yy = mat && mat.traits.magic && !held ? y - 2 - Math.sin(t * 2.4 + (d.seed || 0)) * 2.2 : y;
      const melt = ms && ms.melt < 1 && !inst.frozen ? ms.melt : 1;
      let mag = 0;
      if (pullOn && mat && mat.traits.metal) {
        const dx = b.x - FS.rig.x, dy = b.y - FS.rig.y;
        if (dx * dx + dy * dy < MAG_R2) { mag = 1; if (CLAWJ.pullN < CLAWJ.pull.length) { const pp = CLAWJ.pull[CLAWJ.pullN++]; pp.x = b.x; pp.y = b.y; } }
      }
      const fxOn = !!(R && R.itemFx && mat);
      if (fxOn) {
        MST.mat = mat; MST.t = t; MST.seed = d.seed || 0; MST.crack = ms ? ms.crack : 0; MST.slosh = d.sl || 0;
        MST.fuse = ms && ms.lit > 0 ? ms.lit : 0; MST.golden = !!(FS.golden && FS.golden.uid === inst.uid); MST.mag = mag;
        MST.melt = mat.traits.frost && !inst.frozen && ms && ms.melt < 1 ? 1 - ms.melt + 0.2 : 0;
        R.itemFx(ctx, d.def, x, yy, b.a, melt, MST, 'back');
      }
      const wob = d.wob || 0, sp2 = mat && mat.traits.rubber && !fx().reduced ? b.vx * b.vx + b.vy * b.vy : 0;
      const xf = sq || wob || sp2 > 67600;
      if (xf) {
        ctx.save(); ctx.translate(x, yy);
        if (sq) ctx.scale(1 + sq * 0.22, 1 - sq * 0.22);
        if (wob) ctx.scale(1 - wob * 0.4, 1 + wob * 0.4);
        if (sp2 > 67600) { const va = Math.atan2(b.vy, b.vx), k = U.clamp((Math.sqrt(sp2) - 260) / 1100, 0, 0.32); ctx.rotate(va); ctx.scale(1 + k, 1 - k * 0.7); ctx.rotate(-va); }
        ctx.translate(-x, -yy);
      }
      if (R && R.item) R.item(ctx, d.def, x, yy, b.a, melt, { plus: inst.plus, frozen: inst.frozen, glow: glowC, glowA });
      else { ctx.fillStyle = d.def.color || '#888'; ctx.beginPath(); ctx.arc(x, yy, 12, 0, Math.PI * 2); ctx.fill(); }
      if (fxOn) R.itemFx(ctx, d.def, x, yy, b.a, melt, MST, 'front');
      if (xf) ctx.restore();
      if ((rar === 'r' || rar === 'l') && R && R.glint) R.glint(ctx, x, yy, (b.br || 16), t, (inst.uid ? inst.uid.length * 7 : 0) + b.x * 0.01, rar === 'l' ? '#ff9ad0' : '#fff6c0');
    }
    // lit fuse countdowns sit over the whole pile so they are never hidden
    if (R && R.itemFx) for (const b of FS.items) {
      const ms = FS.mst[b.data.inst.uid];
      if (!ms || !(ms.lit > 0)) continue;
      MST.mat = b.data.mat; MST.t = t; MST.fuse = ms.lit; MST.seed = b.data.seed || 0;
      R.itemFx(ctx, b.data.def, CAB.x + b.x, CAB.y + b.y, b.a, 1, MST, 'top');
    }
    // glass shards left by a shattered item
    if (R && R.shard) for (const s2 of FS.debris) R.shard(ctx, CAB.x + s2.x, CAB.y + s2.y, s2.a, (s2.parts && s2.parts[0] ? s2.parts[0].r : 4) + 1.5, s2.data.col);
    if (FS.chuteFlash > 0) {
      const cx = CAB.x + (FS.cabinet ? FS.cabinet.bounds.chuteX : CAB.w - CAB.chuteW);
      ctx.fillStyle = 'rgba(255,201,77,' + (0.5 * FS.chuteFlash / 0.35).toFixed(3) + ')';
      ctx.fillRect(cx, CAB.y, CAB.chuteW, CAB.h);
    }
    const cj = FS.claw;
    CLAWJ.bend = fx().reduced ? 0 : cj.bend; CLAWJ.squash = cj.sq; CLAWJ.speed = cj.vx; CLAWJ.glow = cj.glow;
    // the claw's character: parked sway, its face (mood, blink, a look where
    // it travels), the loaded-return LED chase, the Lucky Claw's flames
    CLAWJ.t = t; CLAWJ.idle = fx().reduced ? 0 : (cj.idle || 0); CLAWJ.blink = cj.blinkT < 0 ? 1 : 0;
    CLAWJ.look = U.clamp(cj.vx / 330, -1, 1); CLAWJ.chase = cj.chase || 0; CLAWJ.lucky = FS.luckyOn ? 1 : 0;
    CLAWJ.mood = cj.mood || (FS.luckyOn ? 'lucky' : '');
    cfg.juice = CLAWJ;
    if (R && R.claw && FS.rig) R.claw(ctx, FS.rig, CAB.x, CAB.y, cfg);
    if (FS.fog > 0 && !split) { ctx.fillStyle = 'rgba(180,190,210,0.55)'; ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h); }
    ctx.restore();
    if (split) R.cabinetFront(ctx, CAB.x, CAB.y, cfg, cabSt);
    drawMonsterFx(ctx, t);
    if (S.debug && R && R.bodyDebug && FS.world) { ctx.save(); ctx.translate(CAB.x, CAB.y); R.bodyDebug(ctx, FS.world); ctx.restore(); }
    // Items in flight from the chute to their target, over everything.
    for (const th of FS.throws) {
      if (th.landed) continue;
      const u = Math.min(1, th.t), sc = 1.25 + Math.sin(u * Math.PI) * 0.6;
      if (R && R.item) R.item(ctx, th.def, th.x, th.y, u * th.spin, sc, { plus: th.inst.plus, glow: (RC && RC[th.def.rarity]) || '#ffc94d', glowA: 0.8 });
    }
  }

  // ---------------------------------------------------------------- loop
  function update(dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : STEP;
    const real = dt;
    // slow motion (the last kill, a tier 3 combo) runs on real time
    if (S.slowT > 0) { S.slowT = Math.max(0, S.slowT - real); dt *= S.slowK || 1; }
    S.t += dt;
    fx().update(dt);
    rollStep(real);
    if (S.comboT > 0) { S.comboT -= real; if (S.comboT <= 0) nextCombo(); }
    if (S.screen === 'map' || S.screen === 'fight') ambientTick(real);
    lootTick(real);   // payout tally, capsule ritual, the ticket stream
    if (S.toastT > 0) { S.toastT -= dt; if (S.toastT <= 0) { const el = $('toast'); if (el) el.classList.remove('show'); } }
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) { const el = $('banner'); if (el) el.classList.remove('show'); const pr = $('playerRow'); if (pr && pr.classList) pr.classList.remove('bannerOn'); } }
    if (S.screen === 'map') {
      walkTick(dt); camStep(dt); bloomTick(); chimeTick();
      if (S.t - (S.hudT || 0) > 0.15) { S.hudT = S.t; refreshHud(false); }
    }
    if (S.screen === 'fight') {
      updateFight(dt);
      if (FS && FS.outro) { FS.outro.t -= real; if (FS.outro.t <= 0) finishOutro(); }
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
    return { screen: S.screen, run: S.run, fight: F, rigPhase: FS && FS.rig ? FS.rig.phase : null, grabs: F ? F.player.grabs : 0, grabInFlight: !!(FS && FS.grabInFlight), enemyTurn: !!(FS && FS.enemyTurn), queue: FS ? FS.queue.length + FS.playQ.length : 0 };   // playQ: items still flying to their target
  }

  return {
    boot, update, draw, loop, resize,
    newRun, toMap, enterTile, addItem, startFight, endFight, dropClaw, steer, endTurn, save, load, mapTap,
    playDelivered: (bodies) => { for (const b of bodies || []) if (FS && FS.items.indexOf(b) >= 0) deliver(b); },
    tap, pointer, choose, state, hexToStage, stageToHex, lookAt, locate, wheel, bossArrow, startWalk, stopWalk, walkXY, selectTool, towerPrize, showTitle, showChars, showReward, showShop, showEvent, showRest, showForge,
    showTreasure, showSpareParts, showGameOver, showWin, showHelp, showCollection, openBin, playIntro, resolveFx, gainRelic, applyClawUpgrade, rollShop,
    // loot (DESIGN.md "Loot"): capsules, tickets, the payout tally, the prize counter
    loot: { makeCapsule, showCapsule, capsuleTap, skipCapsule, collectCapsule, grantPrize, openRewardCap, openBankedCap, showCounter, counterBuy,
      finishPay, lootReward, addTickets, tixShown, get cap() { return S.cap; }, get pay() { return S.pay; }, get tix() { return S.tix; } },
    rigEvent: (ev) => { if (FS && FS.rig) onRigEvent(ev); },   // test hook: feed one rig event
    // Cabinet materials and toys (tests and the screenshot drivers poke these).
    toys: {
      MAT, mstOf: (inst) => (FS ? mstOf(inst) : null), bodyOf: (inst) => (FS ? bodyOf(inst) : null),
      crack: (b) => { if (FS && b) { crack(b); matFrame(0); } }, lightFuse: (b) => { if (FS && b) lightFuse(b); }, explode: (b) => { if (FS && b) explode(b); },
      fuseTick: () => { if (FS) fuseTick(); }, meltTick: () => { if (FS) meltTick(); }, matTurn: () => { if (FS) matTurn(); },
      soClose: (x, y) => { if (FS) soClose(x, y); }, setMood: (m, s) => setMood(m, s), luckAfterGrab: () => { if (FS) luckAfterGrab(); },
    },
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
